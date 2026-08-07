# Formulários de avaliação criados pelo super admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the super admin build a custom multi-question-type form per company, target specific people and/or whole departments as recipients, track who has responded, and generate an AI parecer per form — replacing the old fixed-per-area questionnaire as the way companies get evaluated.

**Architecture:** Six new tables (`company_forms`, `form_questions`, `form_recipients`, `form_responses`, `form_answers`, `form_analyses`) back a new set of nested API routes under `/api/companies/:id/forms`. A super-admin-only builder UI creates/edits draft forms; once sent, questions lock and a tracking view shows per-recipient completion plus an AI parecer button. A dedicated `/respond` page renders the dynamic question types. Old tables/pages (`evaluations`, `area_questions`, "Meu Questionário", the fixed "Avaliar" tab) are left in place as inert history — not deleted, just unlinked from navigation.

**Tech Stack:** Same as the rest of the app — Next.js 16 App Router, React 19 client components, SWR, `@neondatabase/serverless` tagged-template SQL, Tailwind, lucide-react, shadcn/ui components (`Select`, `Checkbox`, `Textarea`, `Dialog`, `Input`, `Button`).

## Global Constraints

- No automated test suite in this repo. Verify with `npx tsc --noEmit` after every task (the build has `ignoreBuildErrors: true`, so it won't catch type errors) plus manual dev-server/browser checks, same approach as the previous plan.
- Old model stays intact and reachable by direct URL, just unlinked: do **not** delete `app/admin/my-questionnaire/page.tsx`, `app/api/areas/[id]/questions/*`, `app/admin/companies/[id]/evaluate/page.tsx`, `app/admin/companies/[id]/results/page.tsx`, or any of the `evaluations`/`evaluation_answers`/`area_questions`/`ai_area_analyses`/`ai_overall_analyses` data. Only unlink them from nav/tabs.
- `app/api/companies/[id]/roster/route.ts` (added in the previous session's plan) **is** deleted in this plan — it becomes genuinely dead code once the Visão Geral stops calling it (Task 11).
- All new SQL uses static tagged templates (`sql\`...\``), matching every existing route in this codebase — no dynamic query-fragment composition, no query builder.
- Every new/modified API route follows the existing pattern: `getCurrentAdmin()` for "any logged-in admin", `requireSuperAdmin()` for super-admin-only, `try { ... } catch (error) { console.error(...); return 500 }` around the handler body (see `app/api/companies/[id]/route.ts` for the reference shape).
- Recipient selection is a snapshot: picking a whole department expands to that department's current `area_admin` users at the moment the box is checked (client-side, using data already fetched from `/api/admin-users` and `/api/areas`). There's no live link back to the area afterward.
- `form_questions.options` is always returned as a plain `string[]` (never `null`) by every API route that reads it — coerce with `row.options ?? []` server-side so the frontend never has to null-check it.
- Small UI duplication is accepted rather than over-abstracted: the form-card markup appears in both the Formulários list (Task 8) and the Visão Geral summary (Task 11); the department/people picker is the one thing actually extracted into a shared component (Task 7) since it's used identically in two places with real interactive state.

## Database Schema (reference for Task 1)

```sql
CREATE TABLE company_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  options TEXT[],
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  required BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE form_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  UNIQUE (form_id, admin_user_id)
);

CREATE TABLE form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (form_id, admin_user_id)
);

CREATE TABLE form_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
  score INTEGER,
  text_value TEXT,
  selected_options TEXT[],
  yes_no BOOLEAN,
  UNIQUE (response_id, question_id)
);

CREATE TABLE form_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

`type` is one of `'score_0_10' | 'short_text' | 'long_text' | 'multiple_choice' | 'yes_no'`. `status` on `company_forms` is `'draft' | 'sent'`; on `form_responses` it's `'in_progress' | 'completed'`.

---

### Task 1: Database migrations

**Files:**
- Modify: `app/api/migrate/route.ts` (append before the final `return NextResponse.json({ migrations, errors })`)

**Interfaces:**
- Produces: the six tables above, available to every later task via `sql` from `@/lib/db`.

- [ ] **Step 1: Add the migration blocks**

In `app/api/migrate/route.ts`, find:

```ts
    migrations.push('ai_settings table OK')
  } catch (e) { errors.push(`ai_settings table: ${e}`) }

  return NextResponse.json({ migrations, errors })
}
```

Replace with:

```ts
    migrations.push('ai_settings table OK')
  } catch (e) { errors.push(`ai_settings table: ${e}`) }

  // ── formulários criados pelo super admin (substituem o modelo fixo por área) ──
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS company_forms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('company_forms table OK')
  } catch (e) { errors.push(`company_forms table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS form_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        options TEXT[],
        allow_multiple BOOLEAN NOT NULL DEFAULT false,
        required BOOLEAN NOT NULL DEFAULT true,
        order_index INTEGER NOT NULL DEFAULT 0
      )
    `
    migrations.push('form_questions table OK')
  } catch (e) { errors.push(`form_questions table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS form_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
        admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        UNIQUE (form_id, admin_user_id)
      )
    `
    migrations.push('form_recipients table OK')
  } catch (e) { errors.push(`form_recipients table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS form_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
        admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress',
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (form_id, admin_user_id)
      )
    `
    migrations.push('form_responses table OK')
  } catch (e) { errors.push(`form_responses table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS form_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
        score INTEGER,
        text_value TEXT,
        selected_options TEXT[],
        yes_no BOOLEAN,
        UNIQUE (response_id, question_id)
      )
    `
    migrations.push('form_answers table OK')
  } catch (e) { errors.push(`form_answers table: ${e}`) }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS form_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        model_used TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    migrations.push('form_analyses table OK')
  } catch (e) { errors.push(`form_analyses table: ${e}`) }

  return NextResponse.json({ migrations, errors })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the migration and verify**

Run: `npm run dev` (if not already running), then, logged in as any admin, `POST` to `/api/migrate` (the admin layout already does this automatically on every admin page load — just visiting `/admin` while logged in triggers it). Check the terminal/network response for `"company_forms table OK"` through `"form_analyses table OK"` in `migrations`, with `errors` empty.

- [ ] **Step 4: Commit**

```bash
git add app/api/migrate/route.ts
git commit -m "feat: adiciona tabelas de formulários de avaliação (company_forms e relacionadas)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Forms list + create API

**Files:**
- Create: `app/api/companies/[id]/forms/route.ts`

**Interfaces:**
- Consumes: `company_forms`, `form_recipients`, `form_responses` (Task 1).
- Produces: `GET /api/companies/:id/forms` → `200` with `Array<{ id, title, status, sent_at, created_at, total_recipients: number, completed_count: number }>`. `POST /api/companies/:id/forms` (super_admin only, body `{ title: string }`) → `201` with the created `company_forms` row (`status: 'draft'`). Task 8 (list page) and Task 11 (Visão Geral) both call `GET`.

- [ ] **Step 1: Write the route**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, log in as super admin. `GET /api/companies/<id>/forms` for an existing company → `200 []`. `POST` the same URL with `{"title":"Teste"}` (e.g. via browser devtools `fetch`) → `201` with a `draft` form. `GET` again → the new form appears with `total_recipients: 0, completed_count: 0`. Log in as `area_admin` and confirm `POST` returns `403`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/companies/[id]/forms/route.ts"
git commit -m "feat: adiciona API de listar/criar formulários da empresa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Form detail + update + questions API

**Files:**
- Create: `app/api/companies/[id]/forms/[formId]/route.ts`
- Create: `app/api/companies/[id]/forms/[formId]/questions/route.ts`

**Interfaces:**
- Produces: `GET /api/companies/:id/forms/:formId` → `200` with `{ form: {id,title,status,sent_at,created_at}, questions: Array<{id,type,text,options,allow_multiple,required,order_index}>, recipients: Array<{admin_user_id,name,email,area_id,area_name,response_status}> }` (403 for a `draft` form unless `super_admin`; 403 for a `sent` form unless `super_admin` or listed in `form_recipients`). `PUT` same path (super_admin only, body `{ title, status }`) → `200` with the updated `company_forms` row; rejects `status: 'sent'` with `400` if the form has zero questions or zero recipients. `PUT .../questions` (super_admin only, only while `status = 'draft'`, body `{ questions: [{type,text,options,allow_multiple,required}] }`) → `200` with the replaced question list, `order_index` assigned by array position. Task 9 (builder/tracking UI) and Task 10 (respond UI, via a separate response route) consume these shapes.

- [ ] **Step 1: Write the detail + update route**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id, formId } = await params

    const [form] = await sql`
      SELECT id, title, status, sent_at, created_at
      FROM company_forms
      WHERE id = ${formId} AND company_id = ${id}
    `
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    if (user.role !== 'super_admin') {
      if (form.status !== 'sent') {
        return NextResponse.json({ error: 'Este formulário ainda não foi enviado' }, { status: 403 })
      }
      const [recipient] = await sql`
        SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${user.id}
      `
      if (!recipient) {
        return NextResponse.json({ error: 'Você não é destinatário deste formulário' }, { status: 403 })
      }
    }

    const questionRows = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions
      WHERE form_id = ${formId}
      ORDER BY order_index ASC
    `
    const questions = questionRows.map(q => ({ ...q, options: q.options ?? [] }))

    const recipients = await sql`
      SELECT fr.admin_user_id, u.name, u.email, u.area_id, a.name as area_name, resp.status as response_status
      FROM form_recipients fr
      JOIN admin_users u ON u.id = fr.admin_user_id
      LEFT JOIN areas a ON a.id = u.area_id
      LEFT JOIN form_responses resp ON resp.form_id = fr.form_id AND resp.admin_user_id = fr.admin_user_id
      WHERE fr.form_id = ${formId}
      ORDER BY u.name ASC
    `

    return NextResponse.json({ form, questions, recipients })
  } catch (error) {
    console.error('Get company form error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar formulários' }, { status: 403 })
    }

    const { id, formId } = await params
    const { title, status } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
    }
    if (status !== 'draft' && status !== 'sent') {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const [existing] = await sql`SELECT status FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!existing) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const isSendingNow = status === 'sent' && existing.status !== 'sent'
    if (isSendingNow) {
      const [{ count: questionCount }] = await sql`SELECT COUNT(*)::int as count FROM form_questions WHERE form_id = ${formId}`
      const [{ count: recipientCount }] = await sql`SELECT COUNT(*)::int as count FROM form_recipients WHERE form_id = ${formId}`
      if (questionCount === 0 || recipientCount === 0) {
        return NextResponse.json(
          { error: 'Adicione ao menos uma pergunta e um destinatário antes de enviar' },
          { status: 400 }
        )
      }
      await sql`UPDATE company_forms SET title = ${title.trim()}, status = ${status}, sent_at = NOW() WHERE id = ${formId}`
    } else {
      await sql`UPDATE company_forms SET title = ${title.trim()}, status = ${status} WHERE id = ${formId}`
    }

    const [updated] = await sql`SELECT id, title, status, sent_at, created_at FROM company_forms WHERE id = ${formId}`
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update company form error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the questions route**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

const VALID_TYPES = new Set(['score_0_10', 'short_text', 'long_text', 'multiple_choice', 'yes_no'])

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar perguntas' }, { status: 403 })
    }

    const { id, formId } = await params

    const [form] = await sql`SELECT status FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }
    if (form.status !== 'draft') {
      return NextResponse.json({ error: 'Perguntas não podem ser editadas depois que o formulário é enviado' }, { status: 403 })
    }

    const { questions } = await request.json()
    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'questions deve ser uma lista' }, { status: 400 })
    }
    for (const q of questions) {
      if (!q.text?.trim() || !VALID_TYPES.has(q.type)) {
        return NextResponse.json({ error: 'Toda pergunta precisa de texto e um tipo válido' }, { status: 400 })
      }
    }

    await sql`DELETE FROM form_questions WHERE form_id = ${formId}`
    for (let index = 0; index < questions.length; index++) {
      const q = questions[index]
      await sql`
        INSERT INTO form_questions (form_id, type, text, options, allow_multiple, required, order_index)
        VALUES (
          ${formId}, ${q.type}, ${q.text.trim()},
          ${q.type === 'multiple_choice' ? (q.options ?? []) : null},
          ${!!q.allow_multiple}, ${q.required !== false}, ${index}
        )
      `
    }

    const saved = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions WHERE form_id = ${formId} ORDER BY order_index ASC
    `
    return NextResponse.json(saved.map(q => ({ ...q, options: q.options ?? [] })))
  } catch (error) {
    console.error('Update form questions error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Manual verification**

Using a `draft` form created in Task 2: `PUT .../questions` with a couple of questions of different types → `200` with the saved list including generated `id`s. `GET .../forms/:formId` → `questions` matches, `recipients: []`. `PUT .../forms/:formId` with `{"status":"sent"}` while `recipients` is still empty → `400` (blocked). As `area_admin`, `GET` the still-`draft` form → `403`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/companies/[id]/forms/[formId]/route.ts" "app/api/companies/[id]/forms/[formId]/questions/route.ts"
git commit -m "feat: adiciona API de detalhe/edição de formulário e perguntas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Recipients API

**Files:**
- Create: `app/api/companies/[id]/forms/[formId]/recipients/route.ts`

**Interfaces:**
- Produces: `PUT /api/companies/:id/forms/:formId/recipients` (super_admin only, any form status, body `{ admin_user_ids: string[] }`) → `200` with the replaced recipient list (same row shape as the `recipients` array in Task 3's `GET`). Removing someone also deletes their `form_responses`/`form_answers` (no FK cascade exists for this, so it's done explicitly).

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin pode editar destinatários' }, { status: 403 })
    }

    const { id, formId } = await params

    const [form] = await sql`SELECT id FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    const { admin_user_ids } = await request.json()
    if (!Array.isArray(admin_user_ids)) {
      return NextResponse.json({ error: 'admin_user_ids deve ser uma lista' }, { status: 400 })
    }

    await sql`DELETE FROM form_recipients WHERE form_id = ${formId}`
    for (const adminUserId of admin_user_ids) {
      await sql`
        INSERT INTO form_recipients (form_id, admin_user_id)
        VALUES (${formId}, ${adminUserId})
        ON CONFLICT (form_id, admin_user_id) DO NOTHING
      `
    }

    // Quem foi removido como destinatário não precisa mais responder — some a resposta dele também.
    await sql`
      DELETE FROM form_responses
      WHERE form_id = ${formId}
      AND admin_user_id NOT IN (SELECT admin_user_id FROM form_recipients WHERE form_id = ${formId})
    `

    const recipients = await sql`
      SELECT fr.admin_user_id, u.name, u.email, u.area_id, a.name as area_name, resp.status as response_status
      FROM form_recipients fr
      JOIN admin_users u ON u.id = fr.admin_user_id
      LEFT JOIN areas a ON a.id = u.area_id
      LEFT JOIN form_responses resp ON resp.form_id = fr.form_id AND resp.admin_user_id = fr.admin_user_id
      WHERE fr.form_id = ${formId}
      ORDER BY u.name ASC
    `
    return NextResponse.json(recipients)
  } catch (error) {
    console.error('Update form recipients error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

`PUT .../recipients` with a couple of real `admin_users.id` values → `200` with those people, `response_status: null`. `GET .../forms/:formId` (Task 3) now shows them in `recipients`. Re-`PUT` with a shorter list → the removed person disappears and their `form_responses` row (if any) is gone (check with a quick `SELECT` or just trust the code path — full behavioral check happens once Task 9/10 UIs exist).

- [ ] **Step 4: Commit**

```bash
git add "app/api/companies/[id]/forms/[formId]/recipients/route.ts"
git commit -m "feat: adiciona API de editar destinatários do formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Response API (answer a form)

**Files:**
- Create: `app/api/companies/[id]/forms/[formId]/response/route.ts`

**Interfaces:**
- Produces: `GET /api/companies/:id/forms/:formId/response` (current user; 403 if not `sent` or not a recipient) → `200` with `{ response: {id,status}, questions: Array<{id,type,text,options,allow_multiple,required,order_index}>, answers: Array<{question_id,score,text_value,selected_options,yes_no}> }` — auto-creates an `in_progress` `form_responses` row on first visit. `PUT` same path (body `{ answers: [{question_id,score?,text_value?,selected_options?,yes_no?}], complete: boolean }`) → `200 {success:true}`; when `complete: true`, rejects with `400` if any `required` question has no answered value. Task 10 (respond page) is the sole consumer.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

async function requireSentFormAndRecipient(companyId: string, formId: string, userId: string) {
  const [form] = await sql`SELECT id, status FROM company_forms WHERE id = ${formId} AND company_id = ${companyId}`
  if (!form) return { error: NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 }) }
  if (form.status !== 'sent') return { error: NextResponse.json({ error: 'Este formulário ainda não foi enviado' }, { status: 403 }) }
  const [recipient] = await sql`SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${userId}`
  if (!recipient) return { error: NextResponse.json({ error: 'Você não é destinatário deste formulário' }, { status: 403 }) }
  return { form }
}

function hasValue(a: { score?: number | null; text_value?: string | null; selected_options?: string[] | null; yes_no?: boolean | null }): boolean {
  return a.score != null
    || !!(a.text_value && a.text_value.trim())
    || !!(a.selected_options && a.selected_options.length > 0)
    || a.yes_no != null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const check = await requireSentFormAndRecipient(id, formId, user.id)
    if (check.error) return check.error

    const questionRows = await sql`
      SELECT id, type, text, options, allow_multiple, required, order_index
      FROM form_questions WHERE form_id = ${formId} ORDER BY order_index ASC
    `
    const questions = questionRows.map(q => ({ ...q, options: q.options ?? [] }))

    let [response] = await sql`SELECT id, status FROM form_responses WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
    if (!response) {
      ;[response] = await sql`
        INSERT INTO form_responses (form_id, admin_user_id, status)
        VALUES (${formId}, ${user.id}, 'in_progress')
        RETURNING id, status
      `
    }

    const answers = await sql`
      SELECT question_id, score, text_value, selected_options, yes_no
      FROM form_answers WHERE response_id = ${response.id}
    `

    return NextResponse.json({ response, questions, answers })
  } catch (error) {
    console.error('Get form response error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const check = await requireSentFormAndRecipient(id, formId, user.id)
    if (check.error) return check.error

    const { answers, complete } = await request.json()
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers deve ser uma lista' }, { status: 400 })
    }

    let [response] = await sql`SELECT id FROM form_responses WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
    if (!response) {
      ;[response] = await sql`
        INSERT INTO form_responses (form_id, admin_user_id, status)
        VALUES (${formId}, ${user.id}, 'in_progress')
        RETURNING id
      `
    }

    if (complete) {
      const questions = await sql`SELECT id, required FROM form_questions WHERE form_id = ${formId}`
      const answeredIds = new Set(answers.filter(hasValue).map((a: { question_id: string }) => a.question_id))
      const missing = questions.filter(q => q.required && !answeredIds.has(q.id))
      if (missing.length > 0) {
        return NextResponse.json({ error: 'Responda todas as perguntas obrigatórias antes de enviar' }, { status: 400 })
      }
    }

    for (const a of answers) {
      await sql`
        INSERT INTO form_answers (response_id, question_id, score, text_value, selected_options, yes_no)
        VALUES (${response.id}, ${a.question_id}, ${a.score ?? null}, ${a.text_value ?? null}, ${a.selected_options ?? null}, ${a.yes_no ?? null})
        ON CONFLICT (response_id, question_id) DO UPDATE SET
          score = EXCLUDED.score,
          text_value = EXCLUDED.text_value,
          selected_options = EXCLUDED.selected_options,
          yes_no = EXCLUDED.yes_no
      `
    }

    if (complete) {
      await sql`UPDATE form_responses SET status = 'completed', completed_at = NOW() WHERE id = ${response.id}`
    } else {
      await sql`UPDATE form_responses SET status = 'in_progress' WHERE id = ${response.id}`
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save form response error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

Send a draft form to yourself (via Task 3/4 PUTs, or wait for Task 9's UI). `GET .../response` → `200`, `response.status: 'in_progress'`, a `form_responses` row now exists in the DB. `PUT` with `complete: true` and a required question unanswered → `400`. `PUT` with all required questions answered and `complete: true` → `200`, and a follow-up `GET` shows `response.status: 'completed'`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/companies/[id]/forms/[formId]/response/route.ts"
git commit -m "feat: adiciona API de responder formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: AI parecer API (per form)

**Files:**
- Create: `app/api/companies/[id]/forms/[formId]/ai/route.ts`

**Interfaces:**
- Consumes: `generateWithGemini`, `GeminiInputPart` from `@/lib/gemini`; `fetchReadableDocuments` from `@/lib/documents` (both unchanged, already used by the old `ai/area` route).
- Produces: `GET .../ai` → `200 { analysis: {id,content,created_at,created_by_name} | null }`. `POST .../ai` (super_admin or a recipient of the form) → `201 { analysis, skippedTitles }`, or `400` if no completed responses exist yet.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { formId } = await params

    const [analysis] = await sql`
      SELECT fa.id, fa.content, fa.created_at, u.name as created_by_name
      FROM form_analyses fa
      JOIN admin_users u ON u.id = fa.created_by
      WHERE fa.form_id = ${formId}
      ORDER BY fa.created_at DESC
      LIMIT 1
    `
    return NextResponse.json({ analysis: analysis ?? null })
  } catch (error) {
    console.error('Get form analysis error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

function formatAnswer(row: { type: string; score: number | null; text_value: string | null; selected_options: string[] | null; yes_no: boolean | null }): string {
  if (row.type === 'score_0_10') return `nota ${row.score}/10`
  if (row.type === 'yes_no') return row.yes_no ? 'Sim' : 'Não'
  if (row.type === 'multiple_choice') return (row.selected_options ?? []).join(', ')
  return row.text_value ?? ''
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const { id, formId } = await params

    const [form] = await sql`SELECT id, title FROM company_forms WHERE id = ${formId} AND company_id = ${id}`
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    if (user.role !== 'super_admin') {
      const [recipient] = await sql`SELECT 1 FROM form_recipients WHERE form_id = ${formId} AND admin_user_id = ${user.id}`
      if (!recipient) {
        return NextResponse.json({ error: 'Apenas o super admin ou um destinatário deste formulário pode gerar o parecer' }, { status: 403 })
      }
    }

    const [company] = await sql`SELECT name FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

    const documents = await sql`SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${id}`
    const { readable, skippedTitles } = await fetchReadableDocuments(
      documents as { title: string; file_url: string; file_type: string | null }[]
    )

    const rows = await sql`
      SELECT u.name as admin_name, q.text as question_text, q.type, ans.score, ans.text_value, ans.selected_options, ans.yes_no
      FROM form_responses r
      JOIN admin_users u ON u.id = r.admin_user_id
      JOIN form_answers ans ON ans.response_id = r.id
      JOIN form_questions q ON q.id = ans.question_id
      WHERE r.form_id = ${formId} AND r.status = 'completed'
      ORDER BY u.name, q.order_index
    `

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma resposta concluída ainda — aguarde os destinatários responderem antes de gerar o parecer.' },
        { status: 400 }
      )
    }

    const notesText = rows
      .map((row: { admin_name: string; question_text: string }) => `[${row.admin_name}] ${row.question_text} — ${formatAnswer(row as Parameters<typeof formatAnswer>[0])}`)
      .join('\n')

    const promptText = `Você é um analista técnico avaliando a empresa "${company.name}" com base no formulário "${form.title}".
Analise os documentos técnicos anexados (quando houver) e as respostas abaixo, dadas pelos destinatários do formulário.
Gere um parecer técnico claro em português, com: pontos fortes, riscos identificados e recomendações práticas.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Respostas:
${notesText}`

    const parts: GeminiInputPart[] = [{ type: 'text', text: promptText }, ...readable]

    let content: string
    try {
      content = await generateWithGemini(parts, instructions)
    } catch (error) {
      console.error('Gemini error:', error)
      return NextResponse.json({ error: 'Erro ao gerar análise com a IA' }, { status: 502 })
    }

    const modelUsed = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const [analysis] = await sql`
      INSERT INTO form_analyses (form_id, content, created_by, model_used)
      VALUES (${formId}, ${content}, ${user.id}, ${modelUsed})
      RETURNING id, content, created_by, model_used, created_at
    `

    return NextResponse.json({ analysis, skippedTitles }, { status: 201 })
  } catch (error) {
    console.error('Generate form analysis error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

On a form with zero completed responses: `POST .../ai` → `400` with the friendly message. After completing at least one response (Task 5's flow): `POST .../ai` → `201` with generated `content`; `GET .../ai` → returns that same analysis.

- [ ] **Step 4: Commit**

```bash
git add "app/api/companies/[id]/forms/[formId]/ai/route.ts"
git commit -m "feat: adiciona geração de parecer de IA por formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Shared types + recipient picker component

**Files:**
- Create: `components/forms/question-types.ts`
- Create: `components/forms/recipient-picker.tsx`

**Interfaces:**
- Produces: `QuestionType`, `QUESTION_TYPE_LABELS`, `Question`, `Recipient`, `FormDetail`, `AdminUserOption`, `AreaOption` (types), and `<RecipientPicker recipientIds={string[]} onChange={(ids: string[]) => void} />` — consumed by Task 9 (builder + tracking) and Task 10 (respond page, types only).

- [ ] **Step 1: Write the shared types**

```ts
export type QuestionType = 'score_0_10' | 'short_text' | 'long_text' | 'multiple_choice' | 'yes_no'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  score_0_10: 'Nota (0-10)',
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  multiple_choice: 'Múltipla escolha',
  yes_no: 'Sim/Não',
}

export interface Question {
  id?: string
  type: QuestionType
  text: string
  options: string[]
  allow_multiple: boolean
  required: boolean
}

export interface Recipient {
  admin_user_id: string
  name: string
  email: string
  area_id: string | null
  area_name: string | null
  response_status?: 'in_progress' | 'completed' | null
}

export interface FormDetail {
  form: { id: string; title: string; status: 'draft' | 'sent'; sent_at: string | null; created_at: string }
  questions: Question[]
  recipients: Recipient[]
}

export interface AdminUserOption {
  id: string
  name: string
  email: string
  role: string
  area_id: string | null
  area_name: string | null
}

export interface AreaOption {
  id: string
  name: string
}
```

- [ ] **Step 2: Write the recipient picker**

```tsx
'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import type { AdminUserOption, AreaOption } from './question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export function RecipientPicker({ recipientIds, onChange }: {
  recipientIds: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: allUsers } = useSWR<AdminUserOption[]>('/api/admin-users', fetcher)
  const { data: areas } = useSWR<AreaOption[]>('/api/areas', fetcher)
  const usersArray = Array.isArray(allUsers) ? allUsers : []
  const areasArray = Array.isArray(areas) ? areas : []
  const [personQuery, setPersonQuery] = useState('')

  const matchingUsers = personQuery.trim()
    ? usersArray.filter(u =>
        !recipientIds.includes(u.id) &&
        (u.name.toLowerCase().includes(personQuery.toLowerCase()) || u.email.toLowerCase().includes(personQuery.toLowerCase()))
      ).slice(0, 6)
    : []

  function toggleArea(areaId: string, checked: boolean) {
    const areaUserIds = usersArray.filter(u => u.area_id === areaId).map(u => u.id)
    onChange(checked
      ? Array.from(new Set([...recipientIds, ...areaUserIds]))
      : recipientIds.filter(id => !areaUserIds.includes(id))
    )
  }

  function isAreaFullySelected(areaId: string) {
    const areaUserIds = usersArray.filter(u => u.area_id === areaId).map(u => u.id)
    return areaUserIds.length > 0 && areaUserIds.every(id => recipientIds.includes(id))
  }

  function addPerson(userId: string) {
    if (!recipientIds.includes(userId)) onChange([...recipientIds, userId])
    setPersonQuery('')
  }

  function removeRecipient(userId: string) {
    onChange(recipientIds.filter(id => id !== userId))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Departamentos</p>
        <div className="space-y-2">
          {areasArray.map(area => (
            <label key={area.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={isAreaFullySelected(area.id)} onCheckedChange={(c) => toggleArea(area.id, !!c)} />
              {area.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Pessoas específicas</p>
        <Input value={personQuery} onChange={e => setPersonQuery(e.target.value)} placeholder="Buscar por nome ou email..." />
        {matchingUsers.length > 0 && (
          <div className="mt-2 border rounded-lg divide-y">
            {matchingUsers.map(u => (
              <button key={u.id} type="button" onClick={() => addPerson(u.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                {u.name} <span className="text-muted-foreground">— {u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">{recipientIds.length} destinatário(s) selecionado(s)</p>
        <div className="space-y-1.5">
          {recipientIds.map(id => {
            const u = usersArray.find(u => u.id === id)
            if (!u) return null
            return (
              <div key={id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                <span>{u.name} {u.area_name && <span className="text-muted-foreground">({u.area_name})</span>}</span>
                <button type="button" onClick={() => removeRecipient(id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

Note: `requireSuperAdmin` gates `/api/admin-users` server-side, so `RecipientPicker` only ever gets used from super-admin-only surfaces (Tasks 9/10) — a non-super-admin rendering it would just see empty lists from the 403 responses, which never happens given where it's used.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect no errors (these files aren't imported anywhere yet, but must still compile standalone).

- [ ] **Step 4: Commit**

```bash
git add components/forms/question-types.ts components/forms/recipient-picker.tsx
git commit -m "feat: adiciona tipos compartilhados e seletor de destinatários de formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Forms list page (company tab)

**Files:**
- Create: `app/admin/companies/[id]/forms/page.tsx`

**Interfaces:**
- Consumes: `GET /api/companies/:id/forms` (Task 2).
- Produces: the `/admin/companies/:id/forms` route — not yet linked from the tab bar (that's Task 11), reachable directly by URL for now.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface FormSummary {
  id: string
  title: string
  status: 'draft' | 'sent'
  total_recipients: number
  completed_count: number
}

export default function CompanyFormsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()

  const { data: forms, mutate } = useSWR<FormSummary[]>(`/api/companies/${id}/forms`, fetcher)
  const formsArray = Array.isArray(forms) ? forms : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/companies/${id}/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (res.ok) {
        const created = await res.json()
        mutate()
        setDialogOpen(false)
        setTitle('')
        router.push(`/admin/companies/${id}/forms/${created.id}`)
      } else {
        const d = await res.json()
        toast.error(d.error || 'Erro ao criar formulário')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground flex-1">{formsArray.length} formulário(s)</p>
        {user?.role === 'super_admin' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Criar Formulário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Formulário</DialogTitle>
                <DialogDescription>Dê um título — as perguntas e destinatários são definidos na próxima tela.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Avaliação 2026 - 1º semestre" autoFocus />
                <Button type="submit" className="w-full" disabled={creating || !title.trim()}>
                  {creating ? 'Criando...' : 'Criar e continuar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {formsArray.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum formulário criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {formsArray.map(form => {
            const pct = form.total_recipients > 0 ? Math.round((form.completed_count / form.total_recipients) * 100) : 0
            return (
              <Link
                key={form.id}
                href={`/admin/companies/${id}/forms/${form.id}`}
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-indigo-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{form.title}</p>
                  {form.status === 'draft' ? (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Rascunho</span>
                  ) : (
                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Enviado</span>
                  )}
                </div>
                {form.status === 'sent' && form.total_recipients > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{form.completed_count} de {form.total_recipients} responderam</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, log in as super admin, visit `/admin/companies/<id>/forms` directly. See the existing test form(s) from earlier tasks. Click "Criar Formulário", submit a title → redirected to `/admin/companies/<id>/forms/<newId>` (a 404 for now, since Task 9 hasn't built that page yet — expected at this point). Log in as `area_admin` → the "Criar Formulário" button doesn't render.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/companies/[id]/forms/page.tsx"
git commit -m "feat: adiciona lista de formulários da empresa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Form detail page (builder + tracking view)

**Files:**
- Create: `components/forms/form-builder.tsx`
- Create: `components/forms/form-tracking.tsx`
- Create: `app/admin/companies/[id]/forms/[formId]/page.tsx`

**Interfaces:**
- Consumes: `RecipientPicker`, shared types (Task 7); `GET/PUT /api/companies/:id/forms/:formId`, `PUT .../questions`, `PUT .../recipients` (Tasks 3–4); `GET/POST .../ai` (Task 6).
- Produces: `/admin/companies/:id/forms/:formId` fully working — this is what Task 8's list links to, and what Task 10's respond page links back to.

- [ ] **Step 1: Write the builder component**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { RecipientPicker } from './recipient-picker'
import { QUESTION_TYPE_LABELS, type Question, type QuestionType, type FormDetail } from './question-types'

export function FormBuilder({ companyId, formId, detail, onSaved }: {
  companyId: string
  formId: string
  detail: FormDetail
  onSaved: () => void
}) {
  const [title, setTitle] = useState(detail.form.title)
  const [questions, setQuestions] = useState<Question[]>(detail.questions)
  const [recipientIds, setRecipientIds] = useState<string[]>(detail.recipients.map(r => r.admin_user_id))
  const [saving, setSaving] = useState<'draft' | 'sent' | null>(null)

  function addQuestion() {
    setQuestions(prev => [...prev, { type: 'score_0_10', text: '', options: [], allow_multiple: false, required: true }])
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...patch } : q))
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  async function save(nextStatus: 'draft' | 'sent') {
    if (!title.trim()) { toast.error('Digite um título para o formulário'); return }
    if (nextStatus === 'sent' && questions.length === 0) { toast.error('Adicione ao menos uma pergunta antes de enviar'); return }
    if (nextStatus === 'sent' && recipientIds.length === 0) { toast.error('Adicione ao menos um destinatário antes de enviar'); return }
    for (const q of questions) {
      if (!q.text.trim()) { toast.error('Toda pergunta precisa de um texto'); return }
      if (q.type === 'multiple_choice' && q.options.filter(o => o.trim()).length < 2) {
        toast.error('Perguntas de múltipla escolha precisam de ao menos 2 opções'); return
      }
    }

    setSaving(nextStatus)
    try {
      const qRes = await fetch(`/api/companies/${companyId}/forms/${formId}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.map(q => ({ ...q, options: q.options.filter(o => o.trim()) })) }),
      })
      if (!qRes.ok) { const d = await qRes.json(); toast.error(d.error || 'Erro ao salvar perguntas'); return }

      const rRes = await fetch(`/api/companies/${companyId}/forms/${formId}/recipients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_ids: recipientIds }),
      })
      if (!rRes.ok) { const d = await rRes.json(); toast.error(d.error || 'Erro ao salvar destinatários'); return }

      const fRes = await fetch(`/api/companies/${companyId}/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), status: nextStatus }),
      })
      if (!fRes.ok) { const d = await fRes.json(); toast.error(d.error || 'Erro ao salvar formulário'); return }

      toast.success(nextStatus === 'sent' ? 'Formulário enviado!' : 'Rascunho salvo!')
      onSaved()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do formulário" className="text-lg font-semibold" />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Perguntas</h2>
        {questions.map((q, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Select value={q.type} onValueChange={(v) => updateQuestion(index, { type: v as QuestionType })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t => (
                    <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => removeQuestion(index)} className="ml-auto text-gray-300 hover:text-red-500 p-1">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea
              value={q.text}
              onChange={e => updateQuestion(index, { text: e.target.value })}
              placeholder="Digite a pergunta..."
              rows={2}
            />
            {q.type === 'multiple_choice' && (
              <div className="space-y-2 pl-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={e => updateQuestion(index, { options: q.options.map((o, i) => i === oi ? e.target.value : o) })}
                      placeholder={`Opção ${oi + 1}`}
                    />
                    <button type="button" onClick={() => updateQuestion(index, { options: q.options.filter((_, i) => i !== oi) })} className="text-gray-300 hover:text-red-500 p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => updateQuestion(index, { options: [...q.options, ''] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar opção
                </Button>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <Checkbox checked={q.allow_multiple} onCheckedChange={(c) => updateQuestion(index, { allow_multiple: !!c })} />
                  Permitir mais de uma resposta
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Checkbox checked={q.required} onCheckedChange={(c) => updateQuestion(index, { required: !!c })} />
              Obrigatória
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={addQuestion}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all text-sm font-medium"
        >
          <Plus className="h-4 w-4" />Adicionar pergunta
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Destinatários</h2>
        <RecipientPicker recipientIds={recipientIds} onChange={setRecipientIds} />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => save('draft')} disabled={saving !== null}>
          {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
        </Button>
        <Button onClick={() => save('sent')} disabled={saving !== null}>
          {saving === 'sent' ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the tracking component**

```tsx
'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { RecipientPicker } from './recipient-picker'
import type { FormDetail } from './question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export function FormTracking({ companyId, formId, detail, currentUserId, isSuperAdmin, onChanged }: {
  companyId: string
  formId: string
  detail: FormDetail
  currentUserId: string | undefined
  isSuperAdmin: boolean
  onChanged: () => void
}) {
  const [editingRecipients, setEditingRecipients] = useState(false)
  const [recipientIds, setRecipientIds] = useState<string[]>(detail.recipients.map(r => r.admin_user_id))
  const [savingRecipients, setSavingRecipients] = useState(false)
  const [generating, setGenerating] = useState(false)

  const { data: aiData, mutate: mutateAi } = useSWR<{ analysis: { id: string; content: string; created_at: string; created_by_name: string } | null }>(
    `/api/companies/${companyId}/forms/${formId}/ai`, fetcher
  )

  const myRecipient = detail.recipients.find(r => r.admin_user_id === currentUserId)
  const canGenerate = isSuperAdmin || !!myRecipient

  async function generateAnalysis() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/forms/${formId}/ai`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        mutateAi()
      } else {
        toast.error(data.error || 'Erro ao gerar parecer')
      }
    } finally {
      setGenerating(false)
    }
  }

  async function saveRecipients() {
    setSavingRecipients(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/forms/${formId}/recipients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_ids: recipientIds }),
      })
      if (res.ok) {
        toast.success('Destinatários atualizados!')
        setEditingRecipients(false)
        onChanged()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Erro ao salvar')
      }
    } finally {
      setSavingRecipients(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{detail.form.title}</h1>
        <p className="text-xs text-muted-foreground">
          Enviado {detail.form.sent_at ? new Date(detail.form.sent_at).toLocaleDateString('pt-BR') : ''}
        </p>
      </div>

      {myRecipient && myRecipient.response_status !== 'completed' && (
        <Link
          href={`/admin/companies/${companyId}/forms/${formId}/respond`}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          Responder este formulário →
        </Link>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Destinatários</h2>
          {isSuperAdmin && !editingRecipients && (
            <button type="button" onClick={() => setEditingRecipients(true)} className="text-xs font-semibold text-indigo-600 hover:underline">
              Editar destinatários
            </button>
          )}
        </div>

        {editingRecipients ? (
          <div className="space-y-3">
            <RecipientPicker recipientIds={recipientIds} onChange={setRecipientIds} />
            <div className="flex items-center gap-3">
              <Button onClick={saveRecipients} disabled={savingRecipients}>
                {savingRecipients ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingRecipients(false); setRecipientIds(detail.recipients.map(r => r.admin_user_id)) }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {detail.recipients.map(r => (
              <div key={r.admin_user_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`h-1 ${r.response_status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    r.response_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                    {r.area_name && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{r.area_name}</span>}
                  </div>
                  {r.response_status === 'completed' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Respondido
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full shrink-0 border border-amber-200">
                      <Clock className="h-3 w-3" /> Pendente
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4" />Parecer da IA
          </h2>
          {canGenerate && (
            <Button size="sm" onClick={generateAnalysis} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {generating ? 'Gerando...' : aiData?.analysis ? 'Regerar' : 'Gerar parecer'}
            </Button>
          )}
        </div>
        {aiData?.analysis ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiData.analysis.content}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum parecer gerado ainda.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the page that branches between them**

```tsx
'use client'

import { use } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/components/auth-context'
import { FormBuilder } from '@/components/forms/form-builder'
import { FormTracking } from '@/components/forms/form-tracking'
import type { FormDetail } from '@/components/forms/question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export default function FormDetailPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id: companyId, formId } = use(params)
  const { user } = useAuth()

  const { data, mutate, error } = useSWR<FormDetail>(`/api/companies/${companyId}/forms/${formId}`, fetcher)

  if (error) {
    return <p className="text-muted-foreground">Você não tem acesso a este formulário.</p>
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (data.form.status === 'draft') {
    if (user?.role !== 'super_admin') {
      return <p className="text-muted-foreground">Este formulário ainda é um rascunho — só o super admin pode vê-lo.</p>
    }
    return <FormBuilder companyId={companyId} formId={formId} detail={data} onSaved={() => mutate()} />
  }

  return (
    <FormTracking
      companyId={companyId}
      formId={formId}
      detail={data}
      currentUserId={user?.id}
      isSuperAdmin={user?.role === 'super_admin'}
      onChanged={() => mutate()}
    />
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Manual verification**

Create a fresh draft form (Task 8's dialog) → lands on the builder. Add one question of each type (fill in options for multiple choice), pick a department and a specific person as recipients, click "Salvar rascunho" → toast success, no navigation. Reload the page → everything persisted. Click "Enviar" → toast success, the page switches to the tracking view showing both recipients as "Pendente". As the recipient, note the "Responder este formulário →" link appears (full respond flow arrives in Task 10). As super admin, click "Editar destinatários", remove one person, save → list updates.

- [ ] **Step 6: Commit**

```bash
git add components/forms/form-builder.tsx components/forms/form-tracking.tsx "app/admin/companies/[id]/forms/[formId]/page.tsx"
git commit -m "feat: adiciona construtor e acompanhamento de formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Respond page

**Files:**
- Create: `app/admin/companies/[id]/forms/[formId]/respond/page.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/companies/:id/forms/:formId/response` (Task 5); `Question` type (Task 7).
- Produces: the full "answer a form" flow, linked to from Task 9's tracking view and Task 12's pending-forms list.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { use, useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import type { Question } from '@/components/forms/question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface ResponseQuestion extends Question { id: string }
interface Answer {
  question_id: string
  score: number | null
  text_value: string | null
  selected_options: string[] | null
  yes_no: boolean | null
}
interface ResponseData {
  response: { id: string; status: 'in_progress' | 'completed' }
  questions: ResponseQuestion[]
  answers: Answer[]
}

function blankAnswer(questionId: string): Answer {
  return { question_id: questionId, score: null, text_value: null, selected_options: null, yes_no: null }
}

function isAnswered(a: Answer): boolean {
  return a.score != null
    || !!(a.text_value && a.text_value.trim())
    || !!(a.selected_options && a.selected_options.length > 0)
    || a.yes_no != null
}

export default function RespondFormPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id: companyId, formId } = use(params)
  const router = useRouter()

  const { data, mutate, error } = useSWR<ResponseData>(`/api/companies/${companyId}/forms/${formId}/response`, fetcher)
  const [answersMap, setAnswersMap] = useState<Record<string, Answer>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!data) return
    const map: Record<string, Answer> = {}
    data.questions.forEach(q => {
      map[q.id] = data.answers.find(a => a.question_id === q.id) ?? blankAnswer(q.id)
    })
    setAnswersMap(map)
  }, [data])

  function updateAnswer(questionId: string, patch: Partial<Answer>) {
    setAnswersMap(prev => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }))
  }

  async function handleSubmit(complete: boolean) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/forms/${formId}/response`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Object.values(answersMap), complete }),
      })
      if (res.ok) {
        toast.success(complete ? 'Respostas enviadas!' : 'Progresso salvo')
        if (complete) {
          router.push(`/admin/companies/${companyId}/forms/${formId}`)
        } else {
          mutate()
        }
      } else {
        const d = await res.json()
        toast.error(d.error || 'Erro ao salvar')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return <p className="text-muted-foreground">Você não pode responder este formulário (ele pode não ter sido enviado ainda, ou você não é destinatário).</p>
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const isReadOnly = data.response.status === 'completed'
  const requiredQuestions = data.questions.filter(q => q.required)
  const answeredRequiredCount = requiredQuestions.filter(q => isAnswered(answersMap[q.id] ?? blankAnswer(q.id))).length

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {isReadOnly && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          Você já respondeu este formulário.
        </p>
      )}

      {data.questions.map((q, idx) => {
        const answer = answersMap[q.id]
        return (
          <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-gray-900 font-medium mb-4">
              {idx + 1}. {q.text}{q.required && <span className="text-red-500"> *</span>}
            </p>

            {q.type === 'score_0_10' && (
              <div className="flex gap-1">
                {Array.from({ length: 11 }, (_, n) => n).map(n => (
                  <button
                    key={n}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => updateAnswer(q.id, { score: n })}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      answer?.score === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'short_text' && (
              <Input
                disabled={isReadOnly}
                value={answer?.text_value ?? ''}
                onChange={e => updateAnswer(q.id, { text_value: e.target.value })}
                placeholder="Sua resposta..."
              />
            )}

            {q.type === 'long_text' && (
              <textarea
                disabled={isReadOnly}
                value={answer?.text_value ?? ''}
                onChange={e => updateAnswer(q.id, { text_value: e.target.value })}
                placeholder="Sua resposta..."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none disabled:bg-gray-50"
              />
            )}

            {q.type === 'multiple_choice' && (
              <div className="space-y-2">
                {q.options.map(opt => {
                  const selected = answer?.selected_options?.includes(opt) ?? false
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected}
                        disabled={isReadOnly}
                        onCheckedChange={(checked) => {
                          const current = answer?.selected_options ?? []
                          if (q.allow_multiple) {
                            updateAnswer(q.id, { selected_options: checked ? [...current, opt] : current.filter(o => o !== opt) })
                          } else {
                            updateAnswer(q.id, { selected_options: checked ? [opt] : [] })
                          }
                        }}
                      />
                      {opt}
                    </label>
                  )
                })}
              </div>
            )}

            {q.type === 'yes_no' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => updateAnswer(q.id, { yes_no: true })}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg ${answer?.yes_no === true ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'}`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => updateAnswer(q.id, { yes_no: false })}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg ${answer?.yes_no === false ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'}`}
                >
                  Não
                </button>
              </div>
            )}
          </div>
        )
      })}

      {!isReadOnly && (
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting}>
            Salvar progresso
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={submitting || answeredRequiredCount < requiredQuestions.length}>
            Enviar respostas ({answeredRequiredCount}/{requiredQuestions.length} obrigatórias)
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Manual verification**

As a recipient of the test form from Task 9: visit `/admin/companies/<id>/forms/<formId>/respond`. Answer each question type, confirm "Enviar respostas" stays disabled until all `required` ones are filled, confirm the counter updates live. Click "Salvar progresso" → reload the page → answers persisted. Fill remaining required questions, click "Enviar respostas" → redirected to the form's tracking page, your row now shows "Respondido". Revisit `/respond` for that same form → read-only view, no inputs, "Você já respondeu" banner.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/companies/[id]/forms/[formId]/respond/page.tsx"
git commit -m "feat: adiciona tela de responder formulário

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Wire up company navigation + Visão Geral + retire the roster endpoint

**Files:**
- Modify: `app/admin/companies/[id]/layout.tsx` (tabs)
- Modify: `app/admin/companies/[id]/page.tsx` (Visão Geral — full rewrite)
- Delete: `app/api/companies/[id]/roster/route.ts`

**Interfaces:**
- Consumes: `GET /api/companies/:id/forms` (Task 2).
- Produces: the "Formulários" tab becomes the primary nav entry point into everything built in Tasks 8–10; "Avaliar" disappears; Visão Geral shows a forms summary instead of last session's area roster.

- [ ] **Step 1: Update the tab bar**

In `app/admin/companies/[id]/layout.tsx`, replace:

```tsx
  const tabs = [
    { href: `/admin/companies/${id}`, label: 'Visão Geral' },
    { href: `/admin/companies/${id}/documents`, label: 'Documentos' },
    { href: `/admin/companies/${id}/results`, label: 'Resultados' },
    ...(user?.role === 'area_admin'
      ? [{ href: `/admin/companies/${id}/evaluate`, label: 'Avaliar' }]
      : []),
  ]
```

with:

```tsx
  const tabs = [
    { href: `/admin/companies/${id}`, label: 'Visão Geral' },
    { href: `/admin/companies/${id}/documents`, label: 'Documentos' },
    { href: `/admin/companies/${id}/forms`, label: 'Formulários' },
  ]
```

`user` is no longer read anywhere else in this file, so also replace:

```tsx
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'
```

with:

```tsx
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'
```

and replace:

```tsx
  const { id } = use(params)
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
```

with:

```tsx
  const { id } = use(params)
  const router = useRouter()
  const pathname = usePathname()
```

- [ ] **Step 2: Rewrite the Visão Geral page**

Replace the full contents of `app/admin/companies/[id]/page.tsx` with:

```tsx
'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface FormSummary {
  id: string
  title: string
  status: 'draft' | 'sent'
  total_recipients: number
  completed_count: number
}

export default function CompanyHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: formsRaw } = useSWR<FormSummary[]>(`/api/companies/${id}/forms`, fetcher)
  const forms = Array.isArray(formsRaw) ? formsRaw : []
  const sentForms = forms.filter(f => f.status === 'sent')

  const totalRecipients = sentForms.reduce((sum, f) => sum + f.total_recipients, 0)
  const totalCompleted = sentForms.reduce((sum, f) => sum + f.completed_count, 0)
  const pct = totalRecipients > 0 ? Math.round((totalCompleted / totalRecipients) * 100) : 0

  if (!formsRaw) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{totalRecipients}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Respostas esperadas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{totalCompleted}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Concluídas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{totalRecipients - totalCompleted}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Pendentes</p>
        </div>
      </div>

      {totalRecipients > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-medium text-gray-700">Progresso</span>
            <span className="font-bold text-indigo-600">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Formulários</h2>
          <Link href={`/admin/companies/${id}/forms`} className="text-xs font-semibold text-indigo-600 hover:underline">
            Ver todos →
          </Link>
        </div>

        {forms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum formulário criado ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {forms.slice(0, 3).map(form => {
              const formPct = form.total_recipients > 0 ? Math.round((form.completed_count / form.total_recipients) * 100) : 0
              return (
                <Link
                  key={form.id}
                  href={`/admin/companies/${id}/forms/${form.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{form.title}</p>
                    {form.status === 'draft' ? (
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Rascunho</span>
                    ) : (
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Enviado</span>
                    )}
                  </div>
                  {form.status === 'sent' && form.total_recipients > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{form.completed_count} de {form.total_recipients} responderam</p>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${formPct}%` }} />
                      </div>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete the dead roster endpoint**

```bash
git rm "app/api/companies/[id]/roster/route.ts"
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Manual verification**

Visit a company's Visão Geral → tabs show Visão Geral / Documentos / Formulários (no "Resultados", no "Avaliar"). Stats and the forms list reflect real data. Click "Ver todos →" and each form card → lands correctly on `/forms` and `/forms/:formId`. Confirm `GET /api/companies/<id>/roster` now 404s (route file is gone).

- [ ] **Step 6: Commit**

```bash
git add "app/admin/companies/[id]/layout.tsx" "app/admin/companies/[id]/page.tsx"
git commit -m "refactor: liga a aba Formulários e reescreve a Visão Geral, remove roster morto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Pending forms (dashboard root) + remove "Meu Questionário" from nav

**Files:**
- Create: `app/api/forms/pending/route.ts`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Produces: `GET /api/forms/pending` → `200` with `Array<{ form_id, form_title, company_id, company_name }>` for the current user's incomplete sent forms — consumed by the new Dashboard block, which links to Task 10's respond page.

- [ ] **Step 1: Write the pending API**

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET() {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const rows = await sql`
      SELECT cf.id as form_id, cf.title as form_title, c.id as company_id, c.name as company_name
      FROM form_recipients fr
      JOIN company_forms cf ON cf.id = fr.form_id AND cf.status = 'sent'
      JOIN companies c ON c.id = cf.company_id
      LEFT JOIN form_responses r ON r.form_id = cf.id AND r.admin_user_id = fr.admin_user_id
      WHERE fr.admin_user_id = ${user.id} AND (r.status IS NULL OR r.status != 'completed')
      ORDER BY cf.sent_at ASC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error('List pending forms error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add the pending-forms block to the Dashboard root**

In `app/admin/page.tsx`, add `ClipboardList` is already imported — reuse it. Add a new interface and fetch near the top: replace

```tsx
interface Company { id: string; name: string }
interface Participant { id: string }
interface Questionnaire { id: string }
interface Evaluation { id: string; status: string }

export default function DashboardPage() {
  const { data: companies, isLoading: loadingCompanies } = useSWR<Company[]>('/api/companies', fetcher)
```

with:

```tsx
interface Company { id: string; name: string }
interface Participant { id: string }
interface Questionnaire { id: string }
interface Evaluation { id: string; status: string }
interface PendingForm { form_id: string; form_title: string; company_id: string; company_name: string }

export default function DashboardPage() {
  const { data: pendingFormsRaw } = useSWR<PendingForm[]>('/api/forms/pending', fetcher)
  const pendingForms = Array.isArray(pendingFormsRaw) ? pendingFormsRaw : []

  const { data: companies, isLoading: loadingCompanies } = useSWR<Company[]>('/api/companies', fetcher)
```

Then replace:

```tsx
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bem-vindo ao Sistema de Avaliação 360</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Avalie seus colaboradores de forma completa e objetiva
        </p>
      </div>

      {completedSteps < steps.length && (
```

with:

```tsx
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bem-vindo ao Sistema de Avaliação 360</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Avalie seus colaboradores de forma completa e objetiva
        </p>
      </div>

      {pendingForms.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              Formulários pendentes pra você
            </CardTitle>
            <CardDescription>Você precisa responder estes formulários</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingForms.map(f => (
                <Link
                  key={f.form_id}
                  href={`/admin/companies/${f.company_id}/forms/${f.form_id}/respond`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-amber-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{f.form_title}</p>
                    <p className="text-xs text-muted-foreground">{f.company_name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {completedSteps < steps.length && (
```

(`ChevronRight`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `Link` are all already imported in this file — no import changes needed here.)

- [ ] **Step 3: Remove "Meu Questionário" from the sidebar**

In `app/admin/layout.tsx`, replace:

```tsx
    ...(user?.role === 'area_admin'
      ? [{ href: '/admin/my-questionnaire', icon: ClipboardList, label: 'Meu Questionário', exact: false }]
      : []),
  ]
```

with:

```tsx
  ]
```

`ClipboardList` becomes unused in this file — replace:

```tsx
import {
  Building2, Users, BarChart3, LogOut, Menu, X,
  Home, ClipboardList, Layers, Sparkles
} from 'lucide-react'
```

with:

```tsx
import {
  Building2, Users, BarChart3, LogOut, Menu, X,
  Home, Layers, Sparkles
} from 'lucide-react'
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Manual verification**

Log in as a recipient with an incomplete sent form → the amber "Formulários pendentes pra você" card appears on `/admin`, clicking an item goes straight to `/respond`. Complete it → reload `/admin` → it disappears from the list. Confirm the sidebar no longer shows "Meu Questionário" for any role; visiting `/admin/my-questionnaire` directly still loads (unlinked, not deleted).

- [ ] **Step 6: Commit**

```bash
git add app/api/forms/pending/route.ts app/admin/page.tsx app/admin/layout.tsx
git commit -m "feat: mostra formulários pendentes no dashboard, remove Meu Questionário do menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Painel de Acompanhamento adapted to forms

**Files:**
- Modify: `app/api/dashboard/route.ts` (full rewrite)
- Modify: `app/admin/dashboard/page.tsx` (full rewrite)

**Interfaces:**
- Produces: `GET /api/dashboard` → `200` with `Array<{company_id, company_name, form_id, form_title, form_status, total_recipients, completed_count}>`, grouped by company in the page.

- [ ] **Step 1: Rewrite the API route**

Replace the full contents of `app/api/dashboard/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  try {
    const user = await requireSuperAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Apenas o super admin acessa o painel' }, { status: 403 })
    }

    const rows = await sql`
      SELECT
        c.id as company_id, c.name as company_name,
        cf.id as form_id, cf.title as form_title, cf.status as form_status,
        COUNT(DISTINCT fr.admin_user_id) as total_recipients,
        COUNT(DISTINCT resp.admin_user_id) FILTER (WHERE resp.status = 'completed') as completed_count
      FROM companies c
      JOIN company_forms cf ON cf.company_id = c.id
      LEFT JOIN form_recipients fr ON fr.form_id = cf.id
      LEFT JOIN form_responses resp ON resp.form_id = cf.id AND resp.admin_user_id = fr.admin_user_id
      GROUP BY c.id, c.name, cf.id, cf.title, cf.status, cf.created_at
      ORDER BY c.name ASC, cf.created_at DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Get dashboard error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Rewrite the Painel page**

Replace the full contents of `app/admin/dashboard/page.tsx` with:

```tsx
'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Row {
  company_id: string; company_name: string
  form_id: string; form_title: string; form_status: 'draft' | 'sent'
  total_recipients: string; completed_count: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useSWR<Row[]>('/api/dashboard', fetcher)
  const rows = Array.isArray(data) ? data : []

  const grouped = rows.reduce<Record<string, { company_name: string; forms: Row[] }>>((acc, row) => {
    if (!acc[row.company_id]) acc[row.company_id] = { company_name: row.company_name, forms: [] }
    acc[row.company_id].forms.push(row)
    return acc
  }, {})

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin acessa o painel de acompanhamento.</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <BarChart3 className="h-6 w-6" />
        Painel de Acompanhamento
      </h1>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-muted-foreground">Nenhum formulário criado ainda.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([companyId, { company_name, forms }]) => (
            <div key={companyId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{company_name}</h2>
              <div className="space-y-2">
                {forms.map(form => {
                  const total = Number(form.total_recipients)
                  const completed = Number(form.completed_count)
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
                  return (
                    <Link
                      key={form.form_id}
                      href={`/admin/companies/${companyId}/forms/${form.form_id}`}
                      className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                    >
                      <span className="text-gray-700">{form.form_title}</span>
                      <span className="text-xs text-muted-foreground">
                        {form.form_status === 'draft' ? 'Rascunho' : `${completed}/${total} (${pct}%)`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Manual verification**

Log in as super admin, visit `/admin/dashboard` ("Painel" in the sidebar). Confirm every company with at least one form shows up, grouped, with the right status/percentage per form, and each row links to that form's detail page. Log in as `area_admin` → the page shows the "Só o super admin..." message instead.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/route.ts app/admin/dashboard/page.tsx
git commit -m "refactor: painel de acompanhamento agrega por formulário em vez de área

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck and build**

Run: `npx tsc --noEmit` — expect clean.
Run: `npm run build` — expect success (still won't type-check due to `ignoreBuildErrors`, but confirms no broken imports/syntax across the whole app, and that the new routes show up in the route list).

- [ ] **Step 2: Walk the spec's verification scenarios end to end**

Using dev login (`/login`) with a super admin and at least one `area_admin` account:

1. As super admin, open a company, go to Formulários → Criar Formulário. Add one question of each type (score, short text, long text, multiple choice with 2+ options, yes/no), mark a couple required and a couple optional. Add recipients: one whole department and one specific person from a different department. Send it.
2. Log in as each recipient. Confirm the form shows up in "Formulários pendentes pra você" on `/admin`. Answer it (test that required questions block submission, and that "Salvar progresso" preserves partial answers across a reload). Submit.
3. Back as super admin, open the form's tracking view — confirm both recipients show correct status, generate the AI parecer and confirm it reflects the actual answers given.
4. Check the company's Visão Geral — stats and the forms list match reality. Check `/admin/dashboard` (Painel) — the same company/form shows the right numbers.
5. Confirm nowhere in the UI links to `/admin/companies/:id/evaluate`, `/admin/companies/:id/results`, or `/admin/my-questionnaire` anymore (those routes still work if visited directly, but nothing links to them) — check the company tab bar and the main sidebar.

- [ ] **Step 3: Report results**

If every check in Step 2 passes, the feature is complete — no further commit needed for this task. If anything fails, fix it in the relevant task's file, re-run `npx tsc --noEmit`, and re-check that specific scenario before moving on.
