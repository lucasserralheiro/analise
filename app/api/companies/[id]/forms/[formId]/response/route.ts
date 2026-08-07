import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

async function requireSentFormAndRecipient(companyId: string, formId: string, userId: string) {
  const [form] = await sql`SELECT id, status FROM company_forms WHERE id = ${formId} AND company_id = ${companyId}`
  if (!form) return { error: NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 }) }
  if (form.status !== 'sent') return { error: NextResponse.json({ error: 'Este formulário ainda não foi enviado' }, { status: 403 }) }
  const [recipient] = await sql`SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${userId}`
  if (!recipient) return { error: NextResponse.json({ error: 'Você não é destinatário deste formulário' }, { status: 403 }) }
  return { form }
}

function hasValue(a: { score?: number | null; text_value?: string | null; selected_options?: string[] | null; yes_no?: boolean | null }): boolean {
  return a.score != null
    || !!(a.text_value && a.text_value.trim())
    || !!(a.selected_options && a.selected_options.length > 0)
    || a.yes_no != null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const check = await requireSentFormAndRecipient(id, formId, user.id)
    if (check.error) return check.error

    const questionRows = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions WHERE form_id = ${formId} ORDER BY order_index ASC
    `
    const questions = questionRows.map(q => ({ ...q, options: q.options ?? [] }))

    let [response] = await sql`SELECT id, status FROM form_responses WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
    if (!response) {
      ;[response] = await sql`
        INSERT INTO form_responses (form_id, admin_user_id, status)
        VALUES (${formId}, ${user.id}, 'in_progress')
        RETURNING id, status
      `
    }

    const answers = await sql`
      SELECT question_id, score, text_value, selected_options, yes_no
      FROM form_answers WHERE response_id = ${response.id}
    `

    return NextResponse.json({ response, questions, answers })
  } catch (error) {
    console.error('Get form response error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const check = await requireSentFormAndRecipient(id, formId, user.id)
    if (check.error) return check.error

    const { answers, complete } = await request.json()
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers deve ser uma lista' }, { status: 400 })
    }

    let [response] = await sql`SELECT id FROM form_responses WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
    if (!response) {
      ;[response] = await sql`
        INSERT INTO form_responses (form_id, admin_user_id, status)
        VALUES (${formId}, ${user.id}, 'in_progress')
        RETURNING id
      `
    }

    if (complete) {
      const questions = await sql`SELECT id, required FROM form_questions WHERE form_id = ${formId}`
      const answeredIds = new Set(answers.filter(hasValue).map((a: { question_id: string }) => a.question_id))
      const missing = questions.filter(q => q.required && !answeredIds.has(q.id))
      if (missing.length > 0) {
        return NextResponse.json({ error: 'Responda todas as perguntas obrigatórias antes de enviar' }, { status: 400 })
      }
    }

    for (const a of answers) {
      await sql`
        INSERT INTO form_answers (response_id, question_id, score, text_value, selected_options, yes_no)
        VALUES (${response.id}, ${a.question_id}, ${a.score ?? null}, ${a.text_value ?? null}, ${a.selected_options ?? null}, ${a.yes_no ?? null})
        ON CONFLICT (response_id, question_id) DO UPDATE SET
          score = EXCLUDED.score,
          text_value = EXCLUDED.text_value,
          selected_options = EXCLUDED.selected_options,
          yes_no = EXCLUDED.yes_no
      `
    }

    if (complete) {
      await sql`UPDATE form_responses SET status = 'completed', completed_at = NOW() WHERE id = ${response.id}`
    } else {
      await sql`UPDATE form_responses SET status = 'in_progress' WHERE id = ${response.id}`
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save form response error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
