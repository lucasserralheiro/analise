import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { randomBytes } from 'crypto'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params

    const evaluators = await sql`
      SELECT id, company_id, name, email, sector, position, status, created_at, completed_at
      FROM company_evaluators
      WHERE company_id = ${id}
      ORDER BY created_at DESC
    `

    return NextResponse.json(evaluators)
  } catch (error) {
    console.error('Get evaluators error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id: companyId } = await params
    const body = await request.json()
    const { name, email, sector, position } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')

    const evaluators = await sql`
      INSERT INTO company_evaluators (company_id, name, email, sector, position, token)
      VALUES (${companyId}, ${name}, ${email || null}, ${sector || null}, ${position || null}, ${token})
      RETURNING id, company_id, name, email, sector, position, status, created_at
    `

    return NextResponse.json(evaluators[0], { status: 201 })
  } catch (error) {
    console.error('Create evaluator error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}