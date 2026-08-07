import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin gera o parecer geral' }, { status: 403 })
  }

  const { id: companyId } = await params

  const [company] = await sql`SELECT name FROM companies WHERE id = ${companyId}`
  if (!company) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

  const documents = await sql`
    SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${companyId}
  `
  const { readable, skippedTitles } = await fetchReadableDocuments(
    documents as { title: string; file_url: string; file_type: string | null }[]
  )

  // Pega o parecer de área mais recente de cada área
  const latestPerArea = await sql`
    SELECT DISTINCT ON (a.area_id) a.area_id, ar.name as area_name, a.content
    FROM ai_area_analyses a
    JOIN areas ar ON ar.id = a.area_id
    WHERE a.company_id = ${companyId}
    ORDER BY a.area_id, a.created_at DESC
  `

  if (latestPerArea.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma área gerou parecer ainda — peça pros admins de área gerarem antes do parecer geral.' },
      { status: 400 }
    )
  }

  const areaSummaries = (latestPerArea as { area_name: string; content: string }[])
    .map((row) => `### ${row.area_name}\n${row.content}`)
    .join('\n\n')

  const promptText = `Você é um analista técnico consolidando a avaliação da empresa "${company.name}".
Abaixo estão os pareceres já gerados por cada área envolvida na avaliação. Use-os (e os documentos técnicos anexados, quando houver) pra gerar um parecer geral consolidado em português, cobrindo a empresa como um todo.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Pareceres por área:
${areaSummaries}`

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
    INSERT INTO ai_overall_analyses (company_id, content, created_by, model_used)
    VALUES (${companyId}, ${content}, ${user.id}, ${modelUsed})
    RETURNING id, company_id, content, created_by, model_used, created_at
  `

  return NextResponse.json({ analysis }, { status: 201 })
}
