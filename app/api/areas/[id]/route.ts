import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode editar áreas' }, { status: 403 })
  }

  const { id } = await params
  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const areas = await sql`
    UPDATE areas SET name = ${name.trim()} WHERE id = ${id}
    RETURNING id, name, order_index, created_at
  `

  if (areas.length === 0) {
    return NextResponse.json({ error: 'Área não encontrada' }, { status: 404 })
  }

  return NextResponse.json(areas[0])
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode excluir áreas' }, { status: 403 })
  }

  const { id } = await params

  const result = await sql`DELETE FROM areas WHERE id = ${id} RETURNING id`

  if (result.length === 0) {
    return NextResponse.json({ error: 'Área não encontrada' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
