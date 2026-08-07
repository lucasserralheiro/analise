import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

// GET: inspeciona colunas de tabelas chave
export async function GET() {
  try {
    const tables = ['areas', 'company_areas', 'area_questions', 'evaluations', 'evaluation_answers', 'admin_users']
    const result: Record<string, string[]> = {}

    for (const table of tables) {
      const cols = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${table}
        ORDER BY ordinal_position
      `
      result[table] = (cols as { column_name: string }[]).map((c) => c.column_name)
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST: roda migrations seguras (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS)
export async function POST() {
  const migrations: string[] = []
  const errors: string[] = []

  // ── remove o modelo antigo de avaliador por token (sem dados a preservar) ──
  try {
    await sql`DROP TABLE IF EXISTS survey_answers`
    await sql`DROP TABLE IF EXISTS response_tokens`
    await sql`DROP TABLE IF EXISTS company_evaluators`
    await sql`DROP TABLE IF EXISTS company_question_questions`
    await sql`DROP TABLE IF EXISTS company_questionnaires`
    await sql`DROP TABLE IF EXISTS participants`
    await sql`DROP TABLE IF EXISTS stages CASCADE`
    await sql`DROP TABLE IF EXISTS questions CASCADE`
    migrations.push('legacy evaluator/token tables dropped OK')
  } catch (e) { errors.push(`drop legacy tables: ${e}`) }

  // ── "evaluations"/"answers" do schema antigo (evaluator_id/evaluated_id/
  // questionnaire_id, id TEXT) colidiam de nome com as tabelas novas.
  // Só derruba se a tabela ainda tiver a coluna antiga "evaluator_id" —
  // idempotente e seguro rodar de novo sem apagar dados reais já migrados
  // (esse endpoint roda a cada carregamento de página do admin).
  try {
    const oldSchema = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'evaluations' AND column_name = 'evaluator_id'
    `
    if (oldSchema.length > 0) {
      await sql`DROP TABLE IF EXISTS answers CASCADE`
      await sql`DROP TABLE IF EXISTS evaluations CASCADE`
      migrations.push('legacy evaluations/answers tables dropped OK')
    } else {
      migrations.push('legacy evaluations/answers tables already migrated (skip)')
    }
  } catch (e) { errors.push(`drop legacy evaluations/answers: ${e}`) }

  // ── papéis: admin_users ganha role e area_id ──
  // A coluna "role" já existia do sistema antigo (valores 'admin'/'usuario'),
  // então ADD COLUMN IF NOT EXISTS não muda nada nela — remapeia os valores
  // antigos pro novo modelo e corrige o default.
  try {
    await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'area_admin'`
    await sql`UPDATE admin_users SET role = 'super_admin' WHERE role = 'admin'`
    await sql`UPDATE admin_users SET role = 'area_admin' WHERE role = 'usuario'`
    await sql`ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'area_admin'`
    migrations.push('admin_users.role OK')
  } catch (e) { errors.push(`admin_users.role: ${e}`) }

  // ── login por senha removido: password_hash não é mais obrigatório ──
  try {
    await sql`ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL`
    migrations.push('admin_users.password_hash nullable OK')
  } catch (e) { errors.push(`admin_users.password_hash: ${e}`) }

  // ── áreas ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS areas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('areas table OK')
  } catch (e) { errors.push(`areas table: ${e}`) }

  try {
    await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id)`
    migrations.push('admin_users.area_id OK')
  } catch (e) { errors.push(`admin_users.area_id: ${e}`) }

  // ── áreas envolvidas por empresa ──
  // company_id é TEXT (não UUID) pra combinar com companies.id, que já existe
  // como TEXT no schema atual.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS company_areas (
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        PRIMARY KEY (company_id, area_id)
      )
    `
    migrations.push('company_areas table OK')
  } catch (e) { errors.push(`company_areas table: ${e}`) }

  // ── questionário global por área ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS area_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('area_questions table OK')
  } catch (e) { errors.push(`area_questions table: ${e}`) }

  // ── avaliações (area_admin respondendo por uma empresa) ──
  // company_id e admin_user_id são TEXT pra combinar com companies.id e
  // admin_users.id, que já existem como TEXT no schema atual.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress',
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (company_id, area_id, admin_user_id)
      )
    `
    migrations.push('evaluations table OK')
  } catch (e) { errors.push(`evaluations table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS evaluation_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES area_questions(id) ON DELETE CASCADE,
        score INTEGER,
        comment TEXT,
        UNIQUE (evaluation_id, question_id)
      )
    `
    migrations.push('evaluation_answers table OK')
  } catch (e) { errors.push(`evaluation_answers table: ${e}`) }

  // ── pareceres de IA por área ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS ai_area_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        model_used TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('ai_area_analyses table OK')
  } catch (e) { errors.push(`ai_area_analyses table: ${e}`) }

  // ── parecer geral de IA ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS ai_overall_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        model_used TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('ai_overall_analyses table OK')
  } catch (e) { errors.push(`ai_overall_analyses table: ${e}`) }

  // ── configurações de IA (instruções de prompt) ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS ai_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        instructions TEXT NOT NULL DEFAULT '',
        CONSTRAINT ai_settings_singleton CHECK (id = 1)
      )
    `
    await sql`
      INSERT INTO ai_settings (id, instructions)
      VALUES (1, 'Seja objetivo e técnico. Destaque pontos fortes, riscos identificados e recomendações práticas.')
      ON CONFLICT (id) DO NOTHING
    `
    migrations.push('ai_settings table OK')
  } catch (e) { errors.push(`ai_settings table: ${e}`) }

  return NextResponse.json({ migrations, errors })
}
