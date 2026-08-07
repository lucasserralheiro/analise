import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; evalId: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id: companyId, evalId } = await params

    // Get evaluator info
    const evaluators = await sql`
      SELECT id, name, sector, position, status, completed_at
      FROM company_evaluators
      WHERE id = ${evalId} AND company_id = ${companyId}
    `

    if (evaluators.length === 0) {
      return NextResponse.json({ error: 'Avaliador não encontrado' }, { status: 404 })
    }

    const evaluator = evaluators[0]

    // Get questions with their answers
    const answers = await sql`
      SELECT
        a.id as answer_id,
        a.scale_value as score,
        a.text_value as comment,
        cqq.id as question_id,
        cqq.text as question_text,
        cqq."order" as question_order
      FROM answers a
      JOIN company_question_questions cqq ON a.question_id = cqq.id
      WHERE a.evaluator_id = ${evalId}
      ORDER BY cqq."order" ASC
    `

    return NextResponse.json({
      evaluator,
      answers
    })
  } catch (error) {
    console.error('Get evaluator answers error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
