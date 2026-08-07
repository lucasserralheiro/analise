import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user || user.role !== 'area_admin' || !user.areaId) {
    return NextResponse.json({ error: 'Só um admin de área pode gerar o parecer da área' }, { status: 403 })
  }

  const { id: companyId } = await params

  const involved = await sql`
    SELECT 1 FROM company_areas WHERE company_id = ${companyId} AND area_id = ${user.areaId}
  `
  if (involved.length === 0) {
    return NextResponse.json({ error: 'Sua área não está envolvida nesta empresa' }, { status: 403 })
  }

  const [company] = await sql`SELECT name FROM companies WHERE id = ${companyId}`
  const [area] = await sql`SELECT name FROM areas WHERE id = ${user.areaId}`
  if (!company || !area) {
    return NextResponse.json({ error: 'Empresa ou área não encontrada' }, { status: 404 })
  }

  const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

  const documents = await sql`
    SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${companyId}
  `
  const { readable, skippedTitles } = await fetchReadableDocuments(
    documents as { title: string; file_url: string; file_type: string | null }[]
  )

  const evaluations = await sql`
    SELECT e.admin_user_id, u.name as admin_name, q.text as question_text, ans.score, ans.comment
    FROM evaluations e
    JOIN admin_users u ON u.id = e.admin_user_id
    JOIN evaluation_answers ans ON ans.evaluation_id = e.id
    JOIN area_questions q ON q.id = ans.question_id
    WHERE e.company_id = ${companyId} AND e.area_id = ${user.areaId} AND e.status = 'completed'
    ORDER BY u.name, q.order_index
  `

  if (evaluations.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma avaliação concluída da sua área ainda — responda a avaliação antes de gerar o parecer.' },
      { status: 400 }
    )
  }

  const notesText = (evaluations as { admin_name: string; question_text: string; score: number; comment: string | null }[])
    .map((row) => `[${row.admin_name}] ${row.question_text} — nota ${row.score}/10${row.comment ? ` — "${row.comment}"` : ''}`)
    .join('\n')

  const promptText = `Você é um analista técnico avaliando a empresa "${company.name}" na área de ${area.name}.
Analise os documentos técnicos anexados (quando houver) e as notas/comentários abaixo, dados pelos avaliadores desta área.
Gere um parecer técnico claro em português, com: pontos fortes, riscos identificados e recomendações práticas.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Notas e comentários dos avaliadores:
${notesText}`

  const parts: GeminiInputPart[] = [{ type: 'text', text: promptText }, ...readable]

  let content: string
  try {
    content = await generateWithGemini(parts, instructions)
  } catch (error) {
    console.error('Gemini error:', error)
    return NextResponse.json({ error: 'Erro ao gerar análise com a IA' }, { status: 502 })
  }

  const modelUsed = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const [analysis] = await sql`
    INSERT INTO ai_area_analyses (company_id, area_id, content, created_by, model_used)
    VALUES (${companyId}, ${user.areaId}, ${content}, ${user.id}, ${modelUsed})
    RETURNING id, company_id, area_id, content, created_by, model_used, created_at
  `

  return NextResponse.json({ analysis, skippedTitles }, { status: 201 })
}
