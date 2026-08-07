import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

type Params = Promise<{ id: string; questionnaireId: string; questionId: string }>

export async function DELETE(request: Request, { params }: { params: Params }) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { questionnaireId, questionId } = await params

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
