import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const areas = await sql`
    SELECT a.id, a.name
    FROM company_areas ca
    JOIN areas a ON a.id = ca.area_id
    WHERE ca.company_id = ${id}
    ORDER BY a.order_index ASC
  `

  return NextResponse.json(areas)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin define as áreas envolvidas' }, { status: 403 })
  }

  const { id: companyId } = await params
  const { area_ids } = await request.json()

  if (!Array.isArray(area_ids)) {
    return NextResponse.json({ error: 'area_ids deve ser uma lista' }, { status: 400 })
  }

  await sql`DELETE FROM company_areas WHERE company_id = ${companyId}`

  for (const areaId of area_ids) {
    await sql`INSERT INTO company_areas (company_id, area_id) VALUES (${companyId}, ${areaId})`
  }

  return NextResponse.json({ success: true })
}
