import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin acessa o painel' }, { status: 403 })
    }

    const rows = await sql`
      SELECT
        c.id as company_id, c.name as company_name,
        cf.id as form_id, cf.title as form_title, cf.status as form_status,
        COUNT(DISTINCT fr.admin_user_id) as total_recipients,
        COUNT(DISTINCT resp.admin_user_id) FILTER (WHERE resp.status = 'completed') as completed_count
      FROM companies c
      JOIN company_forms cf ON cf.company_id = c.id
      LEFT JOIN form_recipients fr ON fr.form_id = cf.id
      LEFT JOIN form_responses resp ON resp.form_id = cf.id AND resp.admin_user_id = fr.admin_user_id
      GROUP BY c.id, c.name, cf.id, cf.title, cf.status, cf.created_at
      ORDER BY c.name ASC, cf.created_at DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Get dashboard error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
