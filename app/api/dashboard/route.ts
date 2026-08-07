import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin acessa o painel' }, { status: 403 })
  }

  const rows = await sql`
    SELECT
      c.id as company_id, c.name as company_name,
      a.id as area_id, a.name as area_name,
      COUNT(DISTINCT au.id) as total_area_admins,
      COUNT(DISTINCT e.admin_user_id) FILTER (WHERE e.status = 'completed') as completed_count
    FROM companies c
    JOIN company_areas ca ON ca.company_id = c.id
    JOIN areas a ON a.id = ca.area_id
    LEFT JOIN admin_users au ON au.area_id = a.id AND au.role = 'area_admin'
    LEFT JOIN evaluations e ON e.company_id = c.id AND e.area_id = a.id
    GROUP BY c.id, c.name, a.id, a.name
    ORDER BY c.name ASC, a.name ASC
  `

  return NextResponse.json(rows)
}
