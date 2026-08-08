import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET() {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const rows = await sql`
      SELECT cf.id as form_id, cf.title as form_title, c.id as company_id, c.name as company_name
      FROM form_recipients fr
      JOIN company_forms cf ON cf.id = fr.form_id AND cf.status = 'sent'
      JOIN companies c ON c.id = cf.company_id
      LEFT JOIN form_responses r ON r.form_id = cf.id AND r.admin_user_id = fr.admin_user_id
      WHERE fr.admin_user_id = ${user.id} AND (r.status IS NULL OR r.status != 'completed')
      ORDER BY cf.sent_at ASC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error('List pending forms error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
