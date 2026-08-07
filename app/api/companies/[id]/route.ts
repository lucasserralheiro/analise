import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { companySchema } from '@/lib/validations'
import { getCurrentAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params

    const companies = await sql`
      SELECT id, name, cnpj, description, created_at, updated_at
      FROM companies
      WHERE id = ${id}
    `

    if (companies.length === 0) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    return NextResponse.json(companies[0])
  } catch (error) {
    console.error('Get company error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const validation = companySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      )
    }

    const { name, cnpj, description } = validation.data

    const companies = await sql`
      UPDATE companies
      SET name = ${name}, cnpj = ${cnpj || null}, description = ${description || null}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, cnpj, description, created_at, updated_at
    `

    if (companies.length === 0) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    return NextResponse.json(companies[0])
  } catch (error) {
    console.error('Update company error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params

    const result = await sql`
      DELETE FROM companies
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete company error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
