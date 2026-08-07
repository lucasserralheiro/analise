import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

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

    const forms = await sql`
      SELECT
        cf.id, cf.title, cf.status, cf.sent_at, cf.created_at,
        COUNT(DISTINCT fr.admin_user_id) as total_recipients,
        COUNT(DISTINCT resp.admin_user_id) FILTER (WHERE resp.status = 'completed') as completed_count
      FROM company_forms cf
      LEFT JOIN form_recipients fr ON fr.form_id = cf.id
      LEFT JOIN form_responses resp ON resp.form_id = cf.id AND resp.admin_user_id = fr.admin_user_id
      WHERE cf.company_id = ${id}
      GROUP BY cf.id
      ORDER BY cf.created_at DESC
    `

    return NextResponse.json(forms)
  } catch (error) {
    console.error('List company forms error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode criar formulários' }, { status: 403 })
    }

    const { id } = await params
    const { title } = await request.json()
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
    }

    const [form] = await sql`
      INSERT INTO company_forms (company_id, title, status, created_by)
      VALUES (${id}, ${title.trim()}, 'draft', ${user.id})
      RETURNING id, company_id, title, status, sent_at, created_at
    `

    return NextResponse.json(form, { status: 201 })
  } catch (error) {
    console.error('Create company form error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
