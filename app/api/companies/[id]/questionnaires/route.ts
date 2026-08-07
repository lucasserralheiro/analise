import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

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

    const questionnaires = await sql`
      SELECT id, company_id, title, description, created_at
      FROM company_questionnaires
      WHERE company_id = ${id}
      ORDER BY created_at DESC
    `

    return NextResponse.json(questionnaires)
  } catch (error) {
    console.error('Get questionnaires error:', error)
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
    const { title, description } = body

    if (!title) {
      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
    }

    const questionnaires = await sql`
      INSERT INTO company_questionnaires (company_id, title, description)
      VALUES (${companyId}, ${title}, ${description || null})
      RETURNING id, company_id, title, description, created_at
    `

    return NextResponse.json(questionnaires[0], { status: 201 })
  } catch (error) {
    console.error('Create questionnaire error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}