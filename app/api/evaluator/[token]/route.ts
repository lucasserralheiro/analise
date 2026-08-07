import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Exige autenticação — avaliadores devem estar logados
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { token } = await params

    const evaluators = await sql`
      SELECT id, company_id, name, sector, position, status, email
      FROM company_evaluators
      WHERE token = ${token}
    `

    if (evaluators.length === 0) {
      return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    }

    const evaluator = evaluators[0]

    // Verifica se o usuário logado é o avaliador correto (via email)
    // Se o avaliador tem email cadastrado, ele deve ser o mesmo do usuário logado
    if (evaluator.email && evaluator.email !== user.email) {
      return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 })
    }

    // Avaliação já foi concluída
    if (evaluator.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Esta avaliação já foi concluída' }, { status: 409 })
    }

    const companies = await sql`
      SELECT id, name, description
      FROM companies
      WHERE id = ${evaluator.company_id}
    `

    const documents = await sql`
      SELECT id, title, file_url
      FROM company_documents
      WHERE company_id = ${evaluator.company_id}
    `

    // Busca perguntas do questionário mais recente da empresa
    const questions = await sql`
      SELECT cqq.id, cqq.text, cqq."order"
      FROM company_question_questions cqq
      JOIN company_questionnaires cq ON cqq.questionnaire_id = cq.id
      WHERE cq.company_id = ${evaluator.company_id}
      ORDER BY cq.created_at DESC, cqq."order" ASC
    `

    return NextResponse.json({
      evaluator: {
        id: evaluator.id,
        name: evaluator.name,
        sector: evaluator.sector,
        position: evaluator.position
      },
      company: companies[0],
      documents,
      questions
    })
  } catch (error) {
    console.error('Get evaluator error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
