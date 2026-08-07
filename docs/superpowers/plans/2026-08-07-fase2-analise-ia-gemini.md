# Fase 2: Análise técnica por IA (Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a análise técnica por IA (Google Gemini) definida em `docs/superpowers/specs/2026-08-07-avaliacao-areas-ia-pdf-design.md` seção 5 — parecer por área (gerado pelo `area_admin`) e parecer geral (gerado pelo `super_admin`), lendo documentos PDF/imagem + notas dos avaliadores, com instruções de prompt configuráveis.

**Architecture:** Next.js API routes chamando a API do Gemini via o SDK oficial `@google/genai`, método `interactions.create` (API atual confirmada na documentação oficial em 2026-08 — substitui o antigo `generateContent`). Documentos são lidos do disco (`public/uploads/...`) ou via HTTP (URLs externas), convertidos pra base64 e enviados embutidos na chamada — sem upload separado pro Gemini. Schema segue o padrão já usado no projeto: `CREATE TABLE IF NOT EXISTS` em `app/api/migrate/route.ts`.

**Tech Stack:** Next.js 16, `@google/genai` (SDK oficial do Gemini), Neon Postgres, mesmos padrões de UI (shadcn/ui, SWR, sonner) da Fase 1.

## Global Constraints

- Sem testes automatizados — cada tarefa termina com verificação manual (build, `tsc --noEmit`, e onde possível teste funcional direto).
- **Bloqueio conhecido:** a chamada real ao Gemini só pode ser testada de ponta a ponta depois que `GEMINI_API_KEY` for configurada no `.env.local` pelo usuário — até lá, valida-se por build + type-check + revisão do código.
- Modelo padrão: `gemini-2.5-flash`, configurável via `GEMINI_MODEL` (env var) — o usuário escolheu esse por custo/velocidade; não trocar para a série 3.x sem pedir.
- Todo texto de UI/erro em português, consistente com o resto do app.
- Este plano roda dentro de `analise/` — todo caminho abaixo é relativo a essa pasta.
- Depende da Fase 1 (login Google, papéis, áreas, avaliações) já estar implementada — está, na branch `master`.

---

### Task 1: Instalar o SDK do Gemini e criar o helper de chamada

**Files:**
- Modify: `package.json` (nova dependência)
- Create: `lib/gemini.ts`
- Modify: `.env.local` (nova variável, placeholder)

**Interfaces:**
- Produces: `generateWithGemini(input: GeminiInputPart[]): Promise<string>` — usado pelas Tasks 4 e 5. `GeminiInputPart` é `{type: 'text', text: string} | {type: 'document', data: string, mime_type: string} | {type: 'image', data: string, mime_type: string}`.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @google/genai
```

- [ ] **Step 2: Adicionar variável de ambiente placeholder**

Adicionar ao `.env.local` (mesmo arquivo criado na Fase 1 para as credenciais do Google OAuth):

```
GEMINI_API_KEY=SUBSTITUA_PELA_CHAVE_DO_GOOGLE_AI_STUDIO
GEMINI_MODEL=gemini-2.5-flash
```

Chave gerada em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — passo manual do usuário, mesmo padrão da Fase 1.

- [ ] **Step 3: Criar `lib/gemini.ts`**

```typescript
import { GoogleGenAI } from '@google/genai'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'document'; data: string; mime_type: string }
  | { type: 'image'; data: string; mime_type: string }

export async function generateWithGemini(input: GeminiInputPart[]): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada')
  }

  const ai = new GoogleGenAI({})
  const interaction = await ai.interactions.create({
    model: MODEL,
    input,
  })

  return interaction.output_text ?? ''
}
```

- [ ] **Step 4: Verificar que o projeto compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros relacionados a `lib/gemini.ts`. Se o pacote `@google/genai` expuser tipos diferentes dos usados aqui (`interactions.create`, `output_text`), o TypeScript vai apontar o erro exato — ajustar a chamada conforme o erro indicar antes de prosseguir (a API foi confirmada em 2026-08 via documentação oficial, mas o pacote instalado é a fonte de verdade final).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/gemini.ts
git commit -m "feat: adiciona SDK do Gemini e helper de geração"
```

---

### Task 2: Migração de schema — pareceres de IA e configurações

**Files:**
- Modify: `app/api/migrate/route.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: tabelas `ai_area_analyses`, `ai_overall_analyses`, `ai_settings`. Tipos TS `AiAreaAnalysis`, `AiOverallAnalysis`, `AiSettings` em `lib/types.ts`.

- [ ] **Step 1: Adicionar as instruções de migração**

Adicionar em `app/api/migrate/route.ts`, dentro do `POST`, antes do `return NextResponse.json(...)` final:

```typescript
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
```

(`company_id` e `created_by` são `TEXT` — mesmo padrão da Fase 1, pra combinar com `companies.id` e `admin_users.id`, que são `TEXT` no schema atual, não `UUID`. `ai_settings` usa `id INTEGER` fixo em 1 — é uma tabela de configuração de linha única, o `CHECK` garante isso.)

- [ ] **Step 2: Atualizar `lib/types.ts`**

Adicionar ao final do arquivo:

```typescript
export interface AiAreaAnalysis {
  id: string
  company_id: string
  area_id: string
  content: string
  created_by: string
  model_used: string
  created_at: Date
}

export interface AiOverallAnalysis {
  id: string
  company_id: string
  content: string
  created_by: string
  model_used: string
  created_at: Date
}

export interface AiSettings {
  instructions: string
}
```

- [ ] **Step 3: Verificar manualmente**

Rodar `npm run dev` e, com o servidor no ar:

```bash
curl -s -X POST http://localhost:3000/api/migrate
```

Esperado: `ai_area_analyses table OK`, `ai_overall_analyses table OK`, `ai_settings table OK` na lista de `migrations`, `errors` vazio.

- [ ] **Step 4: Commit**

```bash
git add app/api/migrate/route.ts lib/types.ts
git commit -m "feat: adiciona schema de pareceres de IA e configurações"
```

---

### Task 3: Helper de leitura de documentos (PDF/imagem → base64)

**Files:**
- Create: `lib/documents.ts`

**Interfaces:**
- Produces: `fetchReadableDocuments(documents: DocumentRow[]): Promise<{ readable: GeminiInputPart[]; readableTitles: string[]; skippedTitles: string[] }>` — usado pelas Tasks 4 e 5. `DocumentRow` é `{ title: string; file_url: string; file_type: string | null }`.

- [ ] **Step 1: Criar `lib/documents.ts`**

```typescript
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { GeminiInputPart } from '@/lib/gemini'

export interface DocumentRow {
  title: string
  file_url: string
  file_type: string | null
}

// Limite conservador pra não estourar o limite de 20MB por requisição do
// Gemini (dados inline) — deixa margem pro texto do prompt.
const MAX_TOTAL_BYTES = 15 * 1024 * 1024

export async function fetchReadableDocuments(documents: DocumentRow[]): Promise<{
  readable: GeminiInputPart[]
  readableTitles: string[]
  skippedTitles: string[]
}> {
  const readable: GeminiInputPart[] = []
  const readableTitles: string[] = []
  const skippedTitles: string[] = []
  let totalBytes = 0

  for (const doc of documents) {
    const mimeType = doc.file_type || ''
    const isPdf = mimeType === 'application/pdf'
    const isImage = mimeType.startsWith('image/')

    if (!isPdf && !isImage) {
      skippedTitles.push(doc.title)
      continue
    }

    try {
      let buffer: Buffer
      if (doc.file_url.startsWith('/')) {
        buffer = await readFile(join(process.cwd(), 'public', doc.file_url))
      } else {
        const res = await fetch(doc.file_url)
        if (!res.ok) throw new Error(`status ${res.status}`)
        buffer = Buffer.from(await res.arrayBuffer())
      }

      if (totalBytes + buffer.length > MAX_TOTAL_BYTES) {
        skippedTitles.push(doc.title)
        continue
      }
      totalBytes += buffer.length

      const data = buffer.toString('base64')
      readable.push(
        isPdf
          ? { type: 'document', data, mime_type: mimeType }
          : { type: 'image', data, mime_type: mimeType }
      )
      readableTitles.push(doc.title)
    } catch {
      skippedTitles.push(doc.title)
    }
  }

  return { readable, readableTitles, skippedTitles }
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
npx tsc --noEmit
```

Esperado: sem erros. Teste funcional real acontece na Task 4 (quando o helper é chamado de fato, com um documento PDF real já existente na empresa de teste).

- [ ] **Step 3: Commit**

```bash
git add lib/documents.ts
git commit -m "feat: adiciona leitura de documentos PDF/imagem em base64"
```

---

### Task 4: Geração do parecer por área (`area_admin`)

**Files:**
- Create: `app/api/companies/[id]/ai/area/route.ts`

**Interfaces:**
- Consumes: `generateWithGemini` (Task 1), `fetchReadableDocuments` (Task 3), `getCurrentAdmin` (`@/lib/session`, Fase 1).
- Produces: `POST /api/companies/[id]/ai/area` — gera e salva um novo `ai_area_analyses` pra área do `area_admin` autenticado.

- [ ] **Step 1: Criar `app/api/companies/[id]/ai/area/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user || user.role !== 'area_admin' || !user.areaId) {
    return NextResponse.json({ error: 'Só um admin de área pode gerar o parecer da área' }, { status: 403 })
  }

  const { id: companyId } = await params

  const involved = await sql`
    SELECT 1 FROM company_areas WHERE company_id = ${companyId} AND area_id = ${user.areaId}
  `
  if (involved.length === 0) {
    return NextResponse.json({ error: 'Sua área não está envolvida nesta empresa' }, { status: 403 })
  }

  const [company] = await sql`SELECT name FROM companies WHERE id = ${companyId}`
  const [area] = await sql`SELECT name FROM areas WHERE id = ${user.areaId}`
  if (!company || !area) {
    return NextResponse.json({ error: 'Empresa ou área não encontrada' }, { status: 404 })
  }

  const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

  const documents = await sql`
    SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${companyId}
  `
  const { readable, readableTitles, skippedTitles } = await fetchReadableDocuments(
    documents as { title: string; file_url: string; file_type: string | null }[]
  )

  const evaluations = await sql`
    SELECT e.admin_user_id, u.name as admin_name, q.text as question_text, ans.score, ans.comment
    FROM evaluations e
    JOIN admin_users u ON u.id = e.admin_user_id
    JOIN evaluation_answers ans ON ans.evaluation_id = e.id
    JOIN area_questions q ON q.id = ans.question_id
    WHERE e.company_id = ${companyId} AND e.area_id = ${user.areaId} AND e.status = 'completed'
    ORDER BY u.name, q.order_index
  `

  if (evaluations.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma avaliação concluída da sua área ainda — responda a avaliação antes de gerar o parecer.' },
      { status: 400 }
    )
  }

  const notesText = evaluations
    .map((row) => `[${row.admin_name}] ${row.question_text} — nota ${row.score}/10${row.comment ? ` — "${row.comment}"` : ''}`)
    .join('\n')

  const promptText = `${instructions}

Você é um analista técnico avaliando a empresa "${company.name}" na área de ${area.name}.
Analise os documentos técnicos anexados (quando houver) e as notas/comentários abaixo, dados pelos avaliadores desta área.
Gere um parecer técnico claro em português, com: pontos fortes, riscos identificados e recomendações práticas.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Notas e comentários dos avaliadores:
${notesText}`

  const parts: GeminiInputPart[] = [{ type: 'text', text: promptText }, ...readable]

  let content: string
  try {
    content = await generateWithGemini(parts)
  } catch (error) {
    console.error('Gemini error:', error)
    return NextResponse.json({ error: 'Erro ao gerar análise com a IA' }, { status: 502 })
  }

  const modelUsed = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const [analysis] = await sql`
    INSERT INTO ai_area_analyses (company_id, area_id, content, created_by, model_used)
    VALUES (${companyId}, ${user.areaId}, ${content}, ${user.id}, ${modelUsed})
    RETURNING id, company_id, area_id, content, created_by, model_used, created_at
  `

  return NextResponse.json({ analysis, readableTitles, skippedTitles }, { status: 201 })
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
npx tsc --noEmit
```

Esperado: sem erros. Sem `GEMINI_API_KEY` configurada ainda, uma chamada real a esse endpoint retorna 502 com "Erro ao gerar análise com a IA" (esperado — vira teste funcional completo assim que a chave for configurada). Testar o caminho de erro "nenhuma avaliação concluída" chamando o endpoint pra uma empresa/área sem avaliação completa — deve retornar 400 com a mensagem correspondente.

- [ ] **Step 3: Commit**

```bash
git add "app/api/companies/[id]/ai/area/route.ts"
git commit -m "feat: geração do parecer de IA por área"
```

---

### Task 5: Geração do parecer geral (`super_admin`)

**Files:**
- Create: `app/api/companies/[id]/ai/overall/route.ts`

**Interfaces:**
- Consumes: `generateWithGemini` (Task 1), `fetchReadableDocuments` (Task 3), `requireSuperAdmin` (`@/lib/session`, Fase 1).
- Produces: `POST /api/companies/[id]/ai/overall`.

- [ ] **Step 1: Criar `app/api/companies/[id]/ai/overall/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'
import { generateWithGemini, type GeminiInputPart } from '@/lib/gemini'
import { fetchReadableDocuments } from '@/lib/documents'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin gera o parecer geral' }, { status: 403 })
  }

  const { id: companyId } = await params

  const [company] = await sql`SELECT name FROM companies WHERE id = ${companyId}`
  if (!company) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  const [{ instructions }] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`

  const documents = await sql`
    SELECT title, file_url, file_type FROM company_documents WHERE company_id = ${companyId}
  `
  const { readable, skippedTitles } = await fetchReadableDocuments(
    documents as { title: string; file_url: string; file_type: string | null }[]
  )

  // Pega o parecer de área mais recente de cada área envolvida
  const latestPerArea = await sql`
    SELECT DISTINCT ON (a.area_id) a.area_id, ar.name as area_name, a.content
    FROM ai_area_analyses a
    JOIN areas ar ON ar.id = a.area_id
    WHERE a.company_id = ${companyId}
    ORDER BY a.area_id, a.created_at DESC
  `

  if (latestPerArea.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma área gerou parecer ainda — peça pros admins de área gerarem antes do parecer geral.' },
      { status: 400 }
    )
  }

  const areaSummaries = latestPerArea
    .map((row) => `### ${row.area_name}\n${row.content}`)
    .join('\n\n')

  const promptText = `${instructions}

Você é um analista técnico consolidando a avaliação da empresa "${company.name}".
Abaixo estão os pareceres já gerados por cada área envolvida na avaliação. Use-os (e os documentos técnicos anexados, quando houver) pra gerar um parecer geral consolidado em português, cobrindo a empresa como um todo.
${skippedTitles.length > 0 ? `\nDocumentos anexados mas não lidos (formato não suportado): ${skippedTitles.join(', ')}.` : ''}

Pareceres por área:
${areaSummaries}`

  const parts: GeminiInputPart[] = [{ type: 'text', text: promptText }, ...readable]

  let content: string
  try {
    content = await generateWithGemini(parts)
  } catch (error) {
    console.error('Gemini error:', error)
    return NextResponse.json({ error: 'Erro ao gerar análise com a IA' }, { status: 502 })
  }

  const modelUsed = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const [analysis] = await sql`
    INSERT INTO ai_overall_analyses (company_id, content, created_by, model_used)
    VALUES (${companyId}, ${content}, ${user.id}, ${modelUsed})
    RETURNING id, company_id, content, created_by, model_used, created_at
  `

  return NextResponse.json({ analysis }, { status: 201 })
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
npx tsc --noEmit
```

Esperado: sem erros. Chamar o endpoint pra uma empresa sem nenhum `ai_area_analyses` ainda deve retornar 400 com a mensagem correspondente.

- [ ] **Step 3: Commit**

```bash
git add "app/api/companies/[id]/ai/overall/route.ts"
git commit -m "feat: geração do parecer geral de IA"
```

---

### Task 6: Endpoint de leitura + tela de configurações de IA (`super_admin`)

**Files:**
- Create: `app/api/companies/[id]/ai/route.ts`
- Create: `app/api/ai-settings/route.ts`
- Create: `app/admin/settings/ai/page.tsx`
- Modify: `app/admin/layout.tsx` (item de navegação)

**Interfaces:**
- Produces: `GET /api/companies/[id]/ai` (últimos pareceres, por área + geral), `GET/PUT /api/ai-settings`.

- [ ] **Step 1: Criar `app/api/companies/[id]/ai/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id: companyId } = await params

  const areaAnalyses = await sql`
    SELECT DISTINCT ON (a.area_id) a.id, a.area_id, ar.name as area_name, a.content, a.created_at, u.name as created_by_name
    FROM ai_area_analyses a
    JOIN areas ar ON ar.id = a.area_id
    JOIN admin_users u ON u.id = a.created_by
    WHERE a.company_id = ${companyId}
    ORDER BY a.area_id, a.created_at DESC
  `

  const overallAnalyses = await sql`
    SELECT o.id, o.content, o.created_at, u.name as created_by_name
    FROM ai_overall_analyses o
    JOIN admin_users u ON u.id = o.created_by
    WHERE o.company_id = ${companyId}
    ORDER BY o.created_at DESC
    LIMIT 1
  `

  return NextResponse.json({
    areaAnalyses,
    overall: overallAnalyses[0] ?? null,
  })
}
```

- [ ] **Step 2: Criar `app/api/ai-settings/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const [settings] = await sql`SELECT instructions FROM ai_settings WHERE id = 1`
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin edita as instruções de IA' }, { status: 403 })
  }

  const { instructions } = await request.json()
  if (typeof instructions !== 'string') {
    return NextResponse.json({ error: 'instructions é obrigatório' }, { status: 400 })
  }

  const [settings] = await sql`
    UPDATE ai_settings SET instructions = ${instructions} WHERE id = 1
    RETURNING instructions
  `
  return NextResponse.json(settings)
}
```

- [ ] **Step 3: Criar `app/admin/settings/ai/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface AiSettings { instructions: string }

export default function AiSettingsPage() {
  const { user } = useAuth()
  const { data, mutate } = useSWR<AiSettings>('/api/ai-settings', fetcher)
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (data) setInstructions(data.instructions)
  }, [data])

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      })
      if (res.ok) {
        mutate()
        toast.success('Instruções salvas!')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } finally {
      setLoading(false)
    }
  }

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin configura as instruções de IA.</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <Sparkles className="h-6 w-6" />
        Configurações de IA
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Instruções para a IA</CardTitle>
          <CardDescription>
            Esse texto é enviado em toda geração de parecer (por área e geral) — ajuste o tom, os critérios a priorizar, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={8}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y"
          />
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Adicionar item de navegação**

Em `app/admin/layout.tsx`, no grupo condicional de `super_admin`, adicionar:

```typescript
    ...(user?.role === 'super_admin'
      ? [
          { href: '/admin/dashboard', icon: BarChart3, label: 'Painel', exact: false },
          { href: '/admin/areas', icon: Layers, label: 'Áreas', exact: false },
          { href: '/admin/users', icon: Users, label: 'Usuários', exact: false },
          { href: '/admin/settings/ai', icon: Sparkles, label: 'Configurações de IA', exact: false },
        ]
      : []),
```

Adicionar `Sparkles` ao import de `lucide-react` no topo do arquivo.

- [ ] **Step 5: Verificar manualmente**

1. `npx tsc --noEmit` — sem erros.
2. `npm run build` — compila.
3. Como super_admin, acessar `/admin/settings/ai`, editar o texto, salvar, recarregar a página — confirmar que persiste.

- [ ] **Step 6: Commit**

```bash
git add "app/api/companies/[id]/ai/route.ts" app/api/ai-settings app/admin/settings app/admin/layout.tsx
git commit -m "feat: tela de configurações de IA e leitura de pareceres"
```

---

### Task 7: Exibir pareceres e botões de geração na tela de Resultados

**Files:**
- Modify: `app/admin/companies/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `GET /api/companies/[id]/ai` (Task 6), `POST /api/companies/[id]/ai/area` (Task 4), `POST /api/companies/[id]/ai/overall` (Task 5).

- [ ] **Step 1: Adicionar seção de pareceres de IA na tela de Resultados**

Editar `app/admin/companies/[id]/results/page.tsx`: adicionar import de `useAuth`, `Sparkles`, `Loader2`; buscar os pareceres via SWR; renderizar o parecer geral no topo (com botão de gerar pro `super_admin`) e o parecer de cada área dentro do grupo daquela área (com botão de gerar pro `area_admin` dono da área).

```typescript
import { useAuth } from '@/components/auth-context'
import { Sparkles, Loader2 } from 'lucide-react'
```

Adicionar, dentro do componente, junto aos outros hooks:

```typescript
  const { user } = useAuth()
  const { data: ai, mutate: mutateAi } = useSWR<{
    areaAnalyses: { id: string; area_id: string; area_name: string; content: string; created_at: string; created_by_name: string }[]
    overall: { id: string; content: string; created_at: string; created_by_name: string } | null
  }>(`/api/companies/${companyId}/ai`, fetcher)

  const [generatingArea, setGeneratingArea] = useState(false)
  const [generatingOverall, setGeneratingOverall] = useState(false)

  async function generateAreaAnalysis() {
    setGeneratingArea(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/ai/area`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        mutateAi()
      } else {
        alert(data.error || 'Erro ao gerar')
      }
    } finally {
      setGeneratingArea(false)
    }
  }

  async function generateOverallAnalysis() {
    setGeneratingOverall(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/ai/overall`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        mutateAi()
      } else {
        alert(data.error || 'Erro ao gerar')
      }
    } finally {
      setGeneratingOverall(false)
    }
  }
```

(Precisa adicionar `import { useState } from 'react'` se ainda não estiver importado — checar o topo do arquivo antes de duplicar o import.)

Adicionar, logo depois do `<h1>` de título e antes do `{Object.entries(grouped).map(...)}`:

```jsx
      {/* Parecer geral */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Parecer Geral (IA)
          </h2>
          {user?.role === 'super_admin' && (
            <Button size="sm" onClick={generateOverallAnalysis} disabled={generatingOverall}>
              {generatingOverall ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {generatingOverall ? 'Gerando...' : ai?.overall ? 'Regerar' : 'Gerar Parecer Geral'}
            </Button>
          )}
        </div>
        {ai?.overall ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ai.overall.content}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum parecer geral gerado ainda.</p>
        )}
      </div>
```

E, dentro de cada grupo de área (logo após o `<h2>{areaName}</h2>` existente, antes do `<div className="space-y-2">` das avaliações), adicionar:

```jsx
          {(() => {
            const areaId = evals[0]?.area_id
            const areaAnalysis = ai?.areaAnalyses.find(a => a.area_id === areaId)
            const canGenerate = user?.role === 'super_admin' || (user?.role === 'area_admin' && user.areaId === areaId)
            return (
              <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-4 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Parecer da IA
                  </span>
                  {canGenerate && (
                    <Button size="sm" variant="outline" onClick={generateAreaAnalysis} disabled={generatingArea}>
                      {generatingArea ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {generatingArea ? 'Gerando...' : areaAnalysis ? 'Regerar' : 'Gerar'}
                    </Button>
                  )}
                </div>
                {areaAnalysis ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{areaAnalysis.content}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum parecer gerado ainda.</p>
                )}
              </div>
            )
          })()}
```

- [ ] **Step 2: Verificar manualmente**

1. `npx tsc --noEmit` e `npm run build` — sem erros.
2. Sem `GEMINI_API_KEY` configurada, clicar em "Gerar" numa área com avaliação concluída — esperado: botão mostra "Gerando...", depois volta ao normal com um alerta de erro (502 da IA, esperado até a chave ser configurada).
3. Clicar em "Gerar Parecer Geral" sem nenhum parecer de área ainda — esperado: alerta "Nenhuma área gerou parecer ainda...".

- [ ] **Step 3: Commit**

```bash
git add "app/admin/companies/[id]/results/page.tsx"
git commit -m "feat: exibe pareceres de IA e botões de geração na tela de Resultados"
```

---

## Pendências fora deste plano

- **Testar a geração real:** só é possível depois que `GEMINI_API_KEY` for configurada — nenhuma tarefa deste plano depende disso pra ser considerada completa (o código é verificado por compilação + os caminhos de erro esperados).
- **Fase 3 (PDF):** continua não iniciada — próximo plano depois deste.
