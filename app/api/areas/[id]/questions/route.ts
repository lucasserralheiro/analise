import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireAreaAccess } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const questions = await sql`
    SELECT id, area_id, text, order_index, created_at
    FROM area_questions
    WHERE area_id = ${id}
    ORDER BY order_index ASC
  `

  return NextResponse.json(questions)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: areaId } = await params
  const user = await requireAreaAccess(areaId)
  if (!user) {
    return NextResponse.json({ error: 'Sem permissão para editar este questionário' }, { status: 403 })
  }

  const { text } = await request.json()
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
  }

  const [{ max }] = await sql`
    SELECT COALESCE(MAX(order_index), 0) as max FROM area_questions WHERE area_id = ${areaId}
  `

  const [question] = await sql`
    INSERT INTO area_questions (area_id, text, order_index)
    VALUES (${areaId}, ${text.trim()}, ${Number(max) + 1})
    RETURNING id, area_id, text, order_index, created_at
  `

  return NextResponse.json(question, { status: 201 })
}
