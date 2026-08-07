import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode ver usuários' }, { status: 403 })
  }

  const users = await sql`
    SELECT u.id, u.name, u.email, u.role, u.area_id, a.name as area_name, u.created_at
    FROM admin_users u
    LEFT JOIN areas a ON a.id = u.area_id
    ORDER BY u.created_at DESC
  `

  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode convidar usuários' }, { status: 403 })
  }

  const { name, email, role, area_id } = await request.json()

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Nome e email são obrigatórios' }, { status: 400 })
  }
  if (role !== 'super_admin' && role !== 'area_admin') {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })
  }
  if (role === 'area_admin' && !area_id) {
    return NextResponse.json({ error: 'Área é obrigatória para admin de área' }, { status: 400 })
  }

  const existing = await sql`SELECT id FROM admin_users WHERE email = ${email.trim()}`
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Este email já está cadastrado' }, { status: 400 })
  }

  const [newUser] = await sql`
    INSERT INTO admin_users (name, email, password_hash, role, area_id)
    VALUES (${name.trim()}, ${email.trim()}, 'google-oauth', ${role}, ${role === 'area_admin' ? area_id : null})
    RETURNING id, name, email, role, area_id, created_at
  `

  return NextResponse.json(newUser, { status: 201 })
}
