import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode remover usuários' }, { status: 403 })
  }

  const { id } = await params

  if (id === user.id) {
    return NextResponse.json({ error: 'Você não pode remover sua própria conta' }, { status: 400 })
  }

  const result = await sql`DELETE FROM admin_users WHERE id = ${id} RETURNING id`

  if (result.length === 0) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
