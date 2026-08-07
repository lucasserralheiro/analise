import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

const VALID_TYPES = new Set(['score_0_10', 'short_text', 'long_text', 'multiple_choice', 'yes_no'])

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar perguntas' }, { status: 403 })
    }

    const { id, formId } = await params

    const [form] = await sql`SELECT status FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }
    if (form.status !== 'draft') {
      return NextResponse.json({ error: 'Perguntas não podem ser editadas depois que o formulário é enviado' }, { status: 403 })
    }

    const { questions } = await request.json()
    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'questions deve ser uma lista' }, { status: 400 })
    }
    for (const q of questions) {
      if (!q.text?.trim() || !VALID_TYPES.has(q.type)) {
        return NextResponse.json({ error: 'Toda pergunta precisa de texto e um tipo válido' }, { status: 400 })
      }
    }

    await sql`DELETE FROM form_questions WHERE form_id = ${formId}`
    for (let index = 0; index < questions.length; index++) {
      const q = questions[index]
      await sql`
        INSERT INTO form_questions (form_id, type, text, options, allow_multiple, required, order_index)
        VALUES (
          ${formId}, ${q.type}, ${q.text.trim()},
          ${q.type === 'multiple_choice' ? (q.options ?? []) : null},
          ${!!q.allow_multiple}, ${q.required !== false}, ${index}
        )
      `
    }

    const saved = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions WHERE form_id = ${formId} ORDER BY order_index ASC
    `
    return NextResponse.json(saved.map(q => ({ ...q, options: q.options ?? [] })))
  } catch (error) {
    console.error('Update form questions error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
