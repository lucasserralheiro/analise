import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { formId } = await params

    const [analysis] = await sql`
      SELECT fa.id, fa.content, fa.created_at, u.name as created_by_name
      FROM form_analyses fa
      JOIN admin_users u ON u.id = fa.created_by
      WHERE fa.form_id = ${formId}
      ORDER BY fa.created_at DESC
      LIMIT 1
    `
    return NextResponse.json({ analysis: analysis ?? null })
  } catch (error) {
    console.error('Get form analysis error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

function formatAnswer(row: { type: string; score: number | null; text_value: string | null; selected_options: string[] | null; yes_no: boolean | null }): string {
  if (row.type === 'score_0_10') return `nota ${row.score}/10`
  if (row.type === 'yes_no') return row.yes_no ? 'Sim' : 'Não'
  if (row.type === 'multiple_choice') return (row.selected_options ?? []).join(', ')
  return row.text_value ?? ''
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const [form] = await sql`SELECT id, title FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    if (user.role !== 'super_admin') {
      const [recipient] = await sql`SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
      if (!recipient) {
        return NextResponse.json({ error: 'Apenas o super admin ou um destinatário deste formulário pode gerar o parecer' }, { status: 403 })
      }
    }

    const [company] = await sql`SELECT name FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

    const documents = await sql`SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${id}`
    const { readable, skippedTitles } = await fetchReadableDocuments(
      documents as { title: string; file_url: string; file_type: string | null }[]
    )

    const rows = await sql`
      SELECT u.name as admin_name, q.text as question_text, q.type, ans.score, ans.text_value, ans.selected_options, ans.yes_no
      FROM form_responses r
      JOIN admin_users u ON u.id = r.admin_user_id
      JOIN form_answers ans ON ans.response_id = r.id
      JOIN form_questions q ON q.id = ans.question_id
      WHERE r.form_id = ${formId} AND r.status = 'completed'
      ORDER BY u.name, q.order_index
    `

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma resposta concluída ainda — aguarde os destinatários responderem antes de gerar o parecer.' },
        { status: 400 }
      )
    }

    const answerRows = rows as {
      admin_name: string
      question_text: string
      type: string
      score: number | null
      text_value: string | null
      selected_options: string[] | null
      yes_no: boolean | null
    }[]
    const notesText = answerRows
      .map(row => `[${row.admin_name}] ${row.question_text} — ${formatAnswer(row)}`)
      .join('\n')

    const promptText = `Você é um analista técnico avaliando a empresa "${company.name}" com base no formulário "${form.title}".
Analise os documentos técnicos anexados (quando houver) e as respostas abaixo, dadas pelos destinatários do formulário.
Gere um parecer técnico claro em português, com: pontos fortes, riscos identificados e recomendações práticas.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Respostas:
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
      INSERT INTO form_analyses (form_id, content, created_by, model_used)
      VALUES (${formId}, ${content}, ${user.id}, ${modelUsed})
      RETURNING id, content, created_by, model_used, created_at
    `

    return NextResponse.json({ analysis, skippedTitles }, { status: 201 })
  } catch (error) {
    console.error('Generate form analysis error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
