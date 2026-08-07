import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

// GET: inspeciona colunas de tabelas chave
export async function GET() {
  try {
    const tables = ['stages', 'questions', 'questionnaire_questions', 'answers', 'company_evaluators']
    const result: Record<string, string[]> = {}

    for (const table of tables) {
      const cols = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${table}
        ORDER BY ordinal_position
      `
      result[table] = cols.map((c: { column_name: string }) => c.column_name)
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST: roda migrations seguras (ADD COLUMN IF NOT EXISTS)
export async function POST() {
  const migrations: string[] = []
  const errors: string[] = []

  // ── stages: garantir order_index ──
  try {
    await sql`ALTER TABLE stages ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0`
    migrations.push('stages.order_index OK')
  } catch (e) { errors.push(`stages.order_index: ${e}`) }

  // ── stages: set default on "order" column ──
  try {
    await sql`ALTER TABLE stages ALTER COLUMN "order" SET DEFAULT 0`
    migrations.push('stages."order" DEFAULT OK')
  } catch (e) { errors.push(`stages."order" DEFAULT: ${e}`) }

  // ── questions: garantir order_index e stage_id ──
  try {
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0`
    migrations.push('questions.order_index OK')
  } catch (e) { errors.push(`questions.order_index: ${e}`) }

  // ── questions: set default on "order" column ──
  try {
    await sql`ALTER TABLE questions ALTER COLUMN "order" SET DEFAULT 0`
    migrations.push('questions."order" DEFAULT OK')
  } catch (e) { errors.push(`questions."order" DEFAULT: ${e}`) }

  try {
    await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS stage_id UUID`
    migrations.push('questions.stage_id OK')
  } catch (e) { errors.push(`questions.stage_id: ${e}`) }

  // ── answers: garantir scale_value, text_value e evaluator_id ──
  try {
    await sql`ALTER TABLE answers ADD COLUMN IF NOT EXISTS scale_value INTEGER`
    migrations.push('answers.scale_value OK')
  } catch (e) { errors.push(`answers.scale_value: ${e}`) }

  try {
    await sql`ALTER TABLE answers ADD COLUMN IF NOT EXISTS text_value TEXT`
    migrations.push('answers.text_value OK')
  } catch (e) { errors.push(`answers.text_value: ${e}`) }

  try {
    await sql`ALTER TABLE answers ADD COLUMN IF NOT EXISTS evaluator_id UUID`
    migrations.push('answers.evaluator_id OK')
  } catch (e) { errors.push(`answers.evaluator_id: ${e}`) }

  // ── evaluations: garantir colunas para 360 ──
  try {
    await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluator_id UUID`
    migrations.push('evaluations.evaluator_id OK')
  } catch (e) { errors.push(`evaluations.evaluator_id: ${e}`) }

  try {
    await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluated_id UUID`
    migrations.push('evaluations.evaluated_id OK')
  } catch (e) { errors.push(`evaluations.evaluated_id: ${e}`) }

  try {
    await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS questionnaire_id UUID`
    migrations.push('evaluations.questionnaire_id OK')
  } catch (e) { errors.push(`evaluations.questionnaire_id: ${e}`) }

  try {
    await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`
    migrations.push('evaluations.status OK')
  } catch (e) { errors.push(`evaluations.status: ${e}`) }

  try {
    await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`
    migrations.push('evaluations.completed_at OK')
  } catch (e) { errors.push(`evaluations.completed_at: ${e}`) }

  // ── response_tokens: garantir coluna evaluation_id ──
  try {
    await sql`ALTER TABLE response_tokens ADD COLUMN IF NOT EXISTS evaluation_id UUID`
    migrations.push('response_tokens.evaluation_id OK')
  } catch (e) { errors.push(`response_tokens.evaluation_id: ${e}`) }

  // ── participants: garantir tabela com company_id ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company_id UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('participants table OK')
  } catch (e) { errors.push(`participants table: ${e}`) }

  // ── response_tokens: garantir tabela ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS response_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        evaluation_id UUID,
        expires_at TIMESTAMP WITH TIME ZONE,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('response_tokens table OK')
  } catch (e) { errors.push(`response_tokens table: ${e}`) }

  // ── survey_answers: tabela de respostas de formulário público ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS survey_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        questionnaire_id UUID NOT NULL,
        question_id UUID NOT NULL,
        score INTEGER,
        comment TEXT,
        respondent_name TEXT,
        session_id TEXT,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('survey_answers table OK')
  } catch (e) { errors.push(`survey_answers: ${e}`) }

  // ── survey_answers: add respondent_email column ──
  try {
    await sql`ALTER TABLE survey_answers ADD COLUMN IF NOT EXISTS respondent_email TEXT`
    migrations.push('survey_answers.respondent_email OK')
  } catch (e) { errors.push(`survey_answers.respondent_email: ${e}`) }

  // ── survey_answers: add participant_id column ──
  try {
    await sql`ALTER TABLE survey_answers ADD COLUMN IF NOT EXISTS participant_id UUID`
    migrations.push('survey_answers.participant_id OK')
  } catch (e) { errors.push(`survey_answers.participant_id: ${e}`) }

  return NextResponse.json({ migrations, errors })
}
