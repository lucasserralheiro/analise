import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { token } = await params
    const body = await request.json()
    const { answers } = body

    if (!answers || answers.length === 0) {
      return NextResponse.json({ error: 'Respostas são obrigatórias' }, { status: 400 })
    }

    // Find evaluator
    const evaluators = await sql`
      SELECT id FROM company_evaluators WHERE token = ${token}
    `

    if (evaluators.length === 0) {
      return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    }

    const evaluatorId = evaluators[0].id

    // Update evaluator status
    await sql`
      UPDATE company_evaluators
      SET status = 'COMPLETED', completed_at = NOW()
      WHERE id = ${evaluatorId}
    `

    // Insert answers
    for (const answer of answers) {
      await sql`
        INSERT INTO answers (evaluator_id, question_id, scale_value, text_value)
        VALUES (${evaluatorId}, ${answer.question_id}, ${answer.score}, ${answer.comment || null})
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Submit evaluation error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
