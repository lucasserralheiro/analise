import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const [settings] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin edita as instruções de IA' }, { status: 403 })
  }

  const { instructions } = await request.json()
  if (typeof instructions !== 'string') {
    return NextResponse.json({ error: 'instructions é obrigatório' }, { status: 400 })
  }

  const [settings] = await sql`
    UPDATE ai_settings SET instructions = ${instructions} WHERE id = 1
    RETURNING instructions
  `
  return NextResponse.json(settings)
}
