import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const evaluations = await sql`
    SELECT e.id, e.company_id, e.area_id, a.name as area_name,
           e.admin_user_id, u.name as admin_name,
           e.status, e.completed_at, e.created_at
    FROM evaluations e
    JOIN areas a ON a.id = e.area_id
    JOIN admin_users u ON u.id = e.admin_user_id
    WHERE e.company_id = ${id}
    ORDER BY a.order_index ASC, e.created_at ASC
  `

  return NextResponse.json(evaluations)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user || user.role !== 'area_admin' || !user.areaId) {
    return NextResponse.json({ error: 'Só um admin de área pode iniciar uma avaliação' }, { status: 403 })
  }

  const { id: companyId } = await params

  const involved = await sql`
    SELECT 1 FROM company_areas WHERE company_id = ${companyId} AND area_id = ${user.areaId}
  `
  if (involved.length === 0) {
    return NextResponse.json({ error: 'Sua área não está envolvida nesta empresa' }, { status: 403 })
  }

  const existing = await sql`
    SELECT id FROM evaluations
    WHERE company_id = ${companyId} AND area_id = ${user.areaId} AND admin_user_id = ${user.id}
  `
  if (existing.length > 0) {
    return NextResponse.json(existing[0])
  }

  const [evaluation] = await sql`
    INSERT INTO evaluations (company_id, area_id, admin_user_id, status)
    VALUES (${companyId}, ${user.areaId}, ${user.id}, 'in_progress')
    RETURNING id, company_id, area_id, admin_user_id, status, completed_at, created_at
  `

  return NextResponse.json(evaluation, { status: 201 })
}
