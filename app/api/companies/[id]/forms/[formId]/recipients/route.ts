import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar destinatários' }, { status: 403 })
    }

    const { id, formId } = await params

    const [form] = await sql`SELECT id FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const { admin_user_ids } = await request.json()
    if (!Array.isArray(admin_user_ids)) {
      return NextResponse.json({ error: 'admin_user_ids deve ser uma lista' }, { status: 400 })
    }

    await sql`DELETE FROM form_recipients WHERE form_id = ${formId}`
    for (const adminUserId of admin_user_ids) {
      await sql`
        INSERT INTO form_recipients (form_id, admin_user_id)
        VALUES (${formId}, ${adminUserId})
        ON CONFLICT (form_id, admin_user_id) DO NOTHING
      `
    }

    // Quem foi removido como destinatário não precisa mais responder — some a resposta dele também.
    await sql`
      DELETE FROM form_responses
      WHERE form_id = ${formId}
      AND admin_user_id NOT IN (SELECT admin_user_id FROM form_recipients WHERE form_id = ${formId})
    `

    const recipients = await sql`
      SELECT fr.admin_user_id, u.name, u.email, u.area_id, a.name as area_name, resp.status as response_status
      FROM form_recipients fr
      JOIN admin_users u ON u.id = fr.admin_user_id
      LEFT JOIN areas a ON a.id = u.area_id
      LEFT JOIN form_responses resp ON resp.form_id = fr.form_id AND resp.admin_user_id = fr.admin_user_id
      WHERE fr.form_id = ${formId}
      ORDER BY u.name ASC
    `
    return NextResponse.json(recipients)
  } catch (error) {
    console.error('Update form recipients error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
