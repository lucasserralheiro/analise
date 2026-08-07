import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const areas = await sql`
    SELECT id, name, order_index, created_at
    FROM areas
    ORDER BY order_index ASC, name ASC
  `

  return NextResponse.json(areas)
}

export async function POST(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode criar áreas' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const [{ max }] = await sql`SELECT COALESCE(MAX(order_index), 0) as max FROM areas`

  const [area] = await sql`
    INSERT INTO areas (name, order_index)
    VALUES (${name.trim()}, ${Number(max) + 1})
    RETURNING id, name, order_index, created_at
  `

  return NextResponse.json(area, { status: 201 })
}
