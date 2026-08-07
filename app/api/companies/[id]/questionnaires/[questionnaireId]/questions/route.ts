import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

type Params = Promise<{ id: string; questionnaireId: string }>

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { questionnaireId } = await params

    const questions = await sql`
      SELECT id, questionnaire_id, text, "order", created_at
      FROM company_question_questions
      WHERE questionnaire_id = ${questionnaireId}
      ORDER BY "order" ASC
    `

    return NextResponse.json(questions)
  } catch (error) {
    console.error('Get questions error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { questionnaireId } = await params
    const { text } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
    }

    const [{ max }] = await sql`
      SELECT COALESCE(MAX("order"), 0) as max
      FROM company_question_questions
      WHERE questionnaire_id = ${questionnaireId}
    `

    const [question] = await sql`
      INSERT INTO company_question_questions (questionnaire_id, text, "order")
      VALUES (${questionnaireId}, ${text.trim()}, ${Number(max) + 1})
      RETURNING id, questionnaire_id, text, "order", created_at
    `

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    console.error('Create question error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { questionnaireId } = await params
    const { searchParams } = new URL(request.url)
    const questionId = searchParams.get('questionId')

    if (!questionId) {
      return NextResponse.json({ error: 'questionId obrigatório' }, { status: 400 })
    }

    await sql`
      DELETE FROM company_question_questions
      WHERE id = ${questionId} AND questionnaire_id = ${questionnaireId}
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Delete question error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
