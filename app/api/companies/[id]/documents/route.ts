import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
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

    const documents = await sql`
      SELECT id, company_id, title, file_url, file_type, file_size, created_at
      FROM company_documents
      WHERE company_id = ${id}
      ORDER BY created_at DESC
    `

    return NextResponse.json(documents)
  } catch (error) {
    console.error('Get documents error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id: companyId } = await params
    const body = await request.json()
    const { title, file_url, file_type, file_size } = body

    if (!title || !file_url) {
      return NextResponse.json({ error: 'Título e URL do arquivo são obrigatórios' }, { status: 400 })
    }

    const documents = await sql`
      INSERT INTO company_documents (company_id, title, file_url, file_type, file_size)
      VALUES (${companyId}, ${title}, ${file_url}, ${file_type || null}, ${file_size || null})
      RETURNING id, company_id, title, file_url, file_type, file_size, created_at
    `

    return NextResponse.json(documents[0], { status: 201 })
  } catch (error) {
    console.error('Create document error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}