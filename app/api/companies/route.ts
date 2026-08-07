import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const companies = await sql`
      SELECT c.id, c.name, c.cnpj, c.description, c.created_at,
             (SELECT COUNT(*) FROM company_evaluators WHERE company_id = c.id) as evaluators_count,
             (SELECT COUNT(*) FROM company_documents WHERE company_id = c.id) as documents_count
      FROM companies c
      ORDER BY c.created_at DESC
    `

    return NextResponse.json(companies)
  } catch (error) {
    console.error('Get companies error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { name, cnpj, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const companies = await sql`
      INSERT INTO companies (name, cnpj, description)
      VALUES (${name}, ${cnpj || null}, ${description || null})
      RETURNING id, name, cnpj, description, created_at
    `

    return NextResponse.json(companies[0], { status: 201 })
  } catch (error) {
    console.error('Create company error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}