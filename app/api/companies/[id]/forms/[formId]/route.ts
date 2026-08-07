import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

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

    const [form] = await sql`
      SELECT id, title, status, sent_at, created_at
      FROM company_forms
      WHERE id = ${formId} AND company_id = ${id}
    `
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    if (user.role !== 'super_admin') {
      if (form.status !== 'sent') {
        return NextResponse.json({ error: 'Este formulário ainda não foi enviado' }, { status: 403 })
      }
      const [recipient] = await sql`
        SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${user.id}
      `
      if (!recipient) {
        return NextResponse.json({ error: 'Você não é destinatário deste formulário' }, { status: 403 })
      }
    }

    const questionRows = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions
      WHERE form_id = ${formId}
      ORDER BY order_index ASC
    `
    const questions = questionRows.map(q => ({ ...q, options: q.options ?? [] }))

    const recipients = await sql`
      SELECT fr.admin_user_id, u.name, u.email, u.area_id, a.name as area_name, resp.status as response_status
      FROM form_recipients fr
      JOIN admin_users u ON u.id = fr.admin_user_id
      LEFT JOIN areas a ON a.id = u.area_id
      LEFT JOIN form_responses resp ON resp.form_id = fr.form_id AND resp.admin_user_id = fr.admin_user_id
      WHERE fr.form_id = ${formId}
      ORDER BY u.name ASC
    `

    return NextResponse.json({ form, questions, recipients })
  } catch (error) {
    console.error('Get company form error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar formulários' }, { status: 403 })
    }

    const { id, formId } = await params
    const { title, status } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
    }
    if (status !== 'draft' && status !== 'sent') {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const [existing] = await sql`SELECT status FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!existing) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const isSendingNow = status === 'sent' && existing.status !== 'sent'
    if (isSendingNow) {
      const [{ count: questionCount }] = await sql`SELECT COUNT(*)::int as count FROM form_questions WHERE form_id = ${formId}`
      const [{ count: recipientCount }] = await sql`SELECT COUNT(*)::int as count FROM form_recipients WHERE form_id = ${formId}`
      if (questionCount === 0 || recipientCount === 0) {
        return NextResponse.json(
          { error: 'Adicione ao menos uma pergunta e um destinatário antes de enviar' },
          { status: 400 }
        )
      }
      await sql`UPDATE company_forms SET title = ${title.trim()}, status = ${status}, sent_at = NOW() WHERE id = ${formId}`
    } else {
      await sql`UPDATE company_forms SET title = ${title.trim()}, status = ${status} WHERE id = ${formId}`
    }

    const [updated] = await sql`SELECT id, title, status, sent_at, created_at FROM company_forms WHERE id = ${formId}`
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update company form error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
