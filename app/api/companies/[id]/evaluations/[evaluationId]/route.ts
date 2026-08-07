import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; evaluationId: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { evaluationId } = await params

  const [evaluation] = await sql`
    SELECT id, company_id, area_id, admin_user_id, status, completed_at
    FROM evaluations WHERE id = ${evaluationId}
  `
  if (!evaluation) {
    return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
  }

  const questions = await sql`
    SELECT id, text, order_index FROM area_questions
    WHERE area_id = ${evaluation.area_id}
    ORDER BY order_index ASC
  `

  const answers = await sql`
    SELECT question_id, score, comment FROM evaluation_answers
    WHERE evaluation_id = ${evaluationId}
  `

  return NextResponse.json({ evaluation, questions, answers })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; evaluationId: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { evaluationId } = await params
  const [evaluation] = await sql`SELECT admin_user_id FROM evaluations WHERE id = ${evaluationId}`
  if (!evaluation) {
    return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
  }
  if (evaluation.admin_user_id !== user.id) {
    return NextResponse.json({ error: 'Só quem iniciou a avaliação pode editá-la' }, { status: 403 })
  }

  const { answers, complete } = await request.json()

  for (const answer of answers as { question_id: string; score: number; comment: string | null }[]) {
    await sql`
      INSERT INTO evaluation_answers (evaluation_id, question_id, score, comment)
      VALUES (${evaluationId}, ${answer.question_id}, ${answer.score}, ${answer.comment ?? null})
      ON CONFLICT (evaluation_id, question_id)
      DO UPDATE SET score = ${answer.score}, comment = ${answer.comment ?? null}
    `
  }

  if (complete) {
    await sql`
      UPDATE evaluations SET status = 'completed', completed_at = NOW() WHERE id = ${evaluationId}
    `
  }

  return NextResponse.json({ success: true })
}
