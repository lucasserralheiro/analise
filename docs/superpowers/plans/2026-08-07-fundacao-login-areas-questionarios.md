# Fundação: Login Google, papéis por área, questionários reaproveitáveis e avaliações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o login por senha e o fluxo de avaliador por token pelo modelo definido em `docs/superpowers/specs/2026-08-07-avaliacao-areas-ia-pdf-design.md`: login via Google, papéis `super_admin`/`area_admin`, questionários globais reaproveitáveis por área, empresas com áreas envolvidas selecionáveis, avaliações respondidas pelo próprio `area_admin` autenticado, documentos compartilhados, transparência de leitura entre áreas e um Painel de Acompanhamento para o `super_admin`.

**Architecture:** Next.js 16 App Router + Neon Postgres (via `@neondatabase/serverless`, tagged-template `sql`) + Auth.js (NextAuth v5) com provider Google, estratégia de sessão JWT. Migrações de schema seguem o padrão já usado pelo projeto: instruções `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dentro de `app/api/migrate/route.ts`, disparadas uma vez por sessão de admin a partir de `app/admin/layout.tsx`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind + shadcn/ui, Neon Postgres, `next-auth@beta` (Auth.js v5), `zod`, `swr`, `sonner`.

## Global Constraints

- Sem testes automatizados neste projeto — cada tarefa termina com verificação manual (rodar `npm run dev` dentro de `analise/` e checar no navegador ou via `curl`), não com testes escritos.
- Sem dados de produção a preservar — migrações podem `DROP TABLE IF EXISTS` as tabelas do modelo antigo (avaliador por token) sem rotina de migração de dados.
- Todo código novo em português nos textos de UI/mensagens de erro, consistente com o restante do app.
- Fase 1 de um projeto maior — este plano cobre só a fundação (login, papéis, áreas, questionários, avaliações, painel). Análise por IA (Gemini) e exportação em PDF são fases seguintes, com seus próprios planos, e dependem desta fase estar concluída e funcionando.
- Este plano roda dentro do diretório `analise/` (raiz do app Next.js). Todo caminho de arquivo abaixo é relativo a `analise/`, salvo indicação contrária.

---

### Task 1: Instalar e configurar Auth.js (NextAuth v5) com login Google

**Files:**
- Modify: `package.json` (nova dependência)
- Create: `auth.ts` (raiz de `analise/`)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `types/next-auth.d.ts`
- Modify: `.env` (ou `.env.local`, criar se não existir) — novas variáveis
- Modify: `.gitignore` (garantir que `.env.local` está ignorado, se ainda não estiver)

**Interfaces:**
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` exportados de `@/auth`. `session.user.id: string`, `session.user.role: 'super_admin' | 'area_admin'`, `session.user.areaId: string | null`, `session.user.name: string`, `session.user.email: string` — usados por todas as tarefas seguintes.

- [ ] **Step 1: Instalar a dependência**

Rodar dentro de `analise/`:

```bash
npm install next-auth@beta
```

- [ ] **Step 2: Criar as credenciais OAuth no Google Cloud**

No [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Criar um projeto (ou usar um existente).
2. Criar uma credencial "OAuth client ID", tipo "Web application".
3. Em "Authorized redirect URIs", adicionar `http://localhost:3000/api/auth/callback/google` (para desenvolvimento local).
4. Guardar o `Client ID` e o `Client Secret` gerados.

- [ ] **Step 3: Configurar variáveis de ambiente**

Adicionar ao `.env.local` (criar o arquivo na raiz de `analise/` se não existir; nunca commitar este arquivo):

```
AUTH_GOOGLE_ID=<client-id-gerado-no-passo-2>
AUTH_GOOGLE_SECRET=<client-secret-gerado-no-passo-2>
AUTH_SECRET=<gerar-com-openssl-rand-base64-32>
```

Gerar `AUTH_SECRET` com:

```bash
openssl rand -base64 32
```

Confirmar que `.env.local` está listado em `.gitignore` (deve estar, pois `.env*.local` é padrão do `create-next-app`) — se não estiver, adicionar a linha `.env.local`.

- [ ] **Step 4: Criar `auth.ts`**

```typescript
// auth.ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { sql } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      const rows = await sql`SELECT id FROM admin_users WHERE email = ${user.email}`
      return rows.length > 0
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const rows = await sql`
          SELECT id, name, role, area_id
          FROM admin_users
          WHERE email = ${user.email}
        `
        if (rows.length > 0) {
          token.adminId = rows[0].id
          token.role = rows[0].role
          token.areaId = rows[0].area_id
          token.name = rows[0].name
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.adminId as string
        session.user.role = token.role as 'super_admin' | 'area_admin'
        session.user.areaId = (token.areaId as string | null) ?? null
        session.user.name = (token.name as string) ?? session.user.name ?? ''
      }
      return session
    },
  },
})
```

- [ ] **Step 5: Criar a rota de API do NextAuth**

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 6: Aumentar os tipos do NextAuth**

```typescript
// types/next-auth.d.ts
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'super_admin' | 'area_admin'
      areaId: string | null
    } & DefaultSession['user']
  }
}
```

- [ ] **Step 7: Verificar que o projeto compila**

Rodar:

```bash
npm run build
```

Esperado: build conclui sem erro de TypeScript relacionado a `auth.ts`, `route.ts` ou `next-auth.d.ts`. (Vai falhar mais adiante se `admin_users.role`/`area_id` ainda não existirem no banco — isso é resolvido na Task 2. Se o erro for só de tipo, corrigir antes de prosseguir; se for erro de conexão com banco durante o build, pode ignorar por ora.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json auth.ts app/api/auth/[...nextauth]/route.ts types/next-auth.d.ts .gitignore
git commit -m "feat: adiciona Auth.js com login Google"
```

---

### Task 2: Migração de schema — papéis, áreas, empresas-áreas, questionários e avaliações

**Files:**
- Modify: `app/api/migrate/route.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: tabelas `areas`, `company_areas`, `area_questions`, `evaluations`, `evaluation_answers`; colunas `admin_users.role`, `admin_users.area_id`. Tipos TS: `Area`, `AreaQuestion`, `Evaluation`, `EvaluationAnswer`, `CompanyArea` em `lib/types.ts` — usados pelas tarefas seguintes.

- [ ] **Step 1: Adicionar as novas instruções de migração**

Abrir `app/api/migrate/route.ts` e adicionar, dentro da função `POST`, antes do `return NextResponse.json(...)` final:

```typescript
  // ── papéis: admin_users ganha role e area_id ──
  try {
    await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'area_admin'`
    migrations.push('admin_users.role OK')
  } catch (e) { errors.push(`admin_users.role: ${e}`) }

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
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS company_areas (
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
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

  // ── remove o modelo antigo de avaliador por token (sem dados a preservar) ──
  try {
    await sql`DROP TABLE IF EXISTS survey_answers`
    await sql`DROP TABLE IF EXISTS response_tokens`
    await sql`DROP TABLE IF EXISTS company_evaluators`
    await sql`DROP TABLE IF EXISTS company_question_questions`
    await sql`DROP TABLE IF EXISTS company_questionnaires`
    migrations.push('legacy evaluator/token tables dropped OK')
  } catch (e) { errors.push(`drop legacy tables: ${e}`) }
```

- [ ] **Step 2: Atualizar `lib/types.ts`**

Adicionar ao final do arquivo (substituindo as interfaces `Questionnaire`, `Stage`, `Question`, `Participant`, `Evaluation`, `ResponseToken`, `Answer` que descreviam o modelo antigo — remover essas e deixar só as novas abaixo, mantendo `Company`, `AdminUser` e as interfaces de `QuestionScore`/`StageScore`/`EvaluationSummary`/`ConsolidatedReport` que serão usadas na fase de IA):

```typescript
export interface Area {
  id: string
  name: string
  order_index: number
  created_at: Date
}

export interface CompanyArea {
  company_id: string
  area_id: string
}

export interface AreaQuestion {
  id: string
  area_id: string
  text: string
  order_index: number
  created_at: Date
}

export interface Evaluation {
  id: string
  company_id: string
  area_id: string
  admin_user_id: string
  status: 'in_progress' | 'completed'
  completed_at: Date | null
  created_at: Date
}

export interface EvaluationAnswer {
  id: string
  evaluation_id: string
  question_id: string
  score: number | null
  comment: string | null
}
```

Também atualizar `AdminUser` para incluir os novos campos:

```typescript
export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  area_id: string | null
  created_at: Date
  updated_at: Date
}
```

- [ ] **Step 3: Verificar manualmente**

Rodar `npm run dev`, logar (com o login antigo por enquanto — ainda não removido) e checar que a rotina de migração dispara. Ou, mais direto, rodar com `curl` apontando pro servidor local:

```bash
curl -X POST http://localhost:3000/api/migrate
```

Esperado: JSON de resposta com `migrations` listando todas as entradas novas acima como `"OK"` e `errors` vazio (`[]`). Se `errors` não estiver vazio, ler a mensagem de cada erro e corrigir a instrução SQL correspondente antes de prosseguir.

- [ ] **Step 4: Commit**

```bash
git add app/api/migrate/route.ts lib/types.ts
git commit -m "feat: adiciona schema de áreas, questionários globais e avaliações"
```

---

### Task 3: Helper de sessão baseado em Auth.js

**Files:**
- Create: `lib/session.ts`
- Delete: `lib/auth.ts` (conteúdo antigo baseado em JWT/bcrypt — será totalmente substituído; a exclusão efetiva do arquivo acontece na Task 10, depois que todas as rotas pararem de importar dele. Por ora, deixar `lib/auth.ts` intacto e não deletar ainda.)

**Interfaces:**
- Consumes: `auth()` de `@/auth` (Task 1).
- Produces: `getCurrentAdmin(): Promise<CurrentAdmin | null>`, `requireSuperAdmin(): Promise<CurrentAdmin | null>`, `requireAreaAccess(areaId: string): Promise<CurrentAdmin | null>` (retorna o admin se ele for `super_admin` OU `area_admin` daquela área específica; caso contrário `null`). Tipo `CurrentAdmin { id, name, email, role, areaId }` — usado por toda rota de API das tarefas seguintes.

- [ ] **Step 1: Criar `lib/session.ts`**

```typescript
// lib/session.ts
import { auth } from '@/auth'

export interface CurrentAdmin {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  areaId: string | null
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role,
    areaId: session.user.areaId,
  }
}

export async function requireSuperAdmin(): Promise<CurrentAdmin | null> {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'super_admin') return null
  return admin
}

export async function requireAreaAccess(areaId: string): Promise<CurrentAdmin | null> {
  const admin = await getCurrentAdmin()
  if (!admin) return null
  if (admin.role === 'super_admin') return admin
  if (admin.role === 'area_admin' && admin.areaId === areaId) return admin
  return null
}
```

- [ ] **Step 2: Verificar manualmente**

Rodar `npm run build` — esperado: compila sem erro (o arquivo ainda não é usado em nenhum lugar, então não há efeito visível ainda; o objetivo aqui é só garantir que não há erro de tipo).

- [ ] **Step 3: Commit**

```bash
git add lib/session.ts
git commit -m "feat: adiciona helper de sessão baseado em Auth.js"
```

---

### Task 4: Tela de login com Google e contexto de autenticação

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `components/auth-context.tsx`
- Delete (conteúdo, não arquivo — ver Task 10): rotas `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts` não são mais usadas por este novo fluxo — permanecem por ora, removidas na Task 10.

**Interfaces:**
- Consumes: `signIn`/`signOut` do pacote `next-auth/react` (client-side), `useSession` de `next-auth/react`.
- Produces: `useAuth()` continua exportando `{ user, loading, logout, isAdmin }` (mesma interface pública usada por `app/admin/layout.tsx`), agora `isAdmin` significa "está autenticado" (qualquer papel) — as telas que exigem `super_admin` checam `user.role` diretamente.

- [ ] **Step 1: Criar o `SessionProvider` do NextAuth**

```typescript
// components/session-provider.tsx
'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

export function AppSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

- [ ] **Step 2: Envolver o app com o provider**

Ler `app/layout.tsx` e adicionar `AppSessionProvider` envolvendo `{children}` dentro do `<body>`, importando de `@/components/session-provider`.

- [ ] **Step 3: Reescrever `components/auth-context.tsx`**

```typescript
'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  areaId: string | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const user: User | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        role: session.user.role,
        areaId: session.user.areaId,
      }
    : null

  async function logout() {
    await nextAuthSignOut({ redirect: false })
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading: status === 'loading', logout, isAdmin: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

- [ ] **Step 4: Reescrever `app/login/page.tsx`**

```typescript
'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Avaliação 360</h1>
        <p className="text-gray-500 text-sm mb-8">
          Entre com sua conta Google cadastrada pelo administrador.
        </p>
        <Button
          className="w-full"
          onClick={() => signIn('google', { callbackUrl: '/admin' })}
        >
          Entrar com Google
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verificar manualmente**

1. Rodar `npm run dev`.
2. Rodar `curl -X POST http://localhost:3000/api/migrate` uma vez para garantir que a coluna `role` existe (Task 2).
3. Inserir manualmente um `admin_user` de teste com seu próprio email do Google e `role = 'super_admin'`:
   ```sql
   INSERT INTO admin_users (name, email, password_hash, role)
   VALUES ('Seu Nome', 'seu-email@gmail.com', 'x', 'super_admin');
   ```
   (rodar via um cliente SQL conectado à `DATABASE_URL`, ex: `psql "$DATABASE_URL" -c "..."` ou o console do Neon; `password_hash` continua `NOT NULL` no banco por enquanto — qualquer valor serve, a coluna é removida na Task 10).
4. Acessar `http://localhost:3000/login`, clicar "Entrar com Google", completar o login.
5. Esperado: redireciona para `/admin` autenticado.

- [ ] **Step 6: Commit**

```bash
git add components/session-provider.tsx components/auth-context.tsx app/login/page.tsx app/layout.tsx
git commit -m "feat: login via Google substitui login por senha"
```

---

### Task 5: Trocar `getSession` por `getCurrentAdmin` em todas as rotas existentes

**Files:**
- Modify: `app/api/companies/route.ts`
- Modify: `app/api/companies/[id]/route.ts`
- Modify: `app/api/companies/[id]/documents/route.ts`
- Modify: `app/api/upload/route.ts`

**Interfaces:**
- Consumes: `getCurrentAdmin` de `@/lib/session` (Task 3).

- [ ] **Step 1: Trocar o import e a chamada em cada arquivo**

Em cada um dos 4 arquivos listados acima, substituir:

```typescript
import { getSession } from '@/lib/auth'
```
por
```typescript
import { getCurrentAdmin } from '@/lib/session'
```

E substituir toda ocorrência de:

```typescript
const user = await getSession()
if (!user) {
```
por
```typescript
const user = await getCurrentAdmin()
if (!user) {
```

(A lógica de "documentos são compartilhados entre qualquer admin logado" já é o comportamento atual dessas rotas — elas só checam `if (!user)`, sem checar papel ou área. Não precisa de mudança adicional aqui.)

- [ ] **Step 2: Verificar manualmente**

Com o servidor rodando e logado (Task 4), abrir `/admin/companies`, criar uma empresa de teste, abrir o perfil dela e subir um documento. Esperado: funciona igual a antes, sem erro 401.

- [ ] **Step 3: Commit**

```bash
git add app/api/companies/route.ts "app/api/companies/[id]/route.ts" "app/api/companies/[id]/documents/route.ts" app/api/upload/route.ts
git commit -m "refactor: rotas usam getCurrentAdmin em vez de getSession"
```

---

### Task 6: API e UI de Áreas (catálogo, só `super_admin`)

**Files:**
- Create: `app/api/areas/route.ts`
- Create: `app/api/areas/[id]/route.ts`
- Create: `app/admin/areas/page.tsx`
- Modify: `app/admin/layout.tsx` (item de navegação)

**Interfaces:**
- Consumes: `requireSuperAdmin`, `getCurrentAdmin` de `@/lib/session`.
- Produces: `GET/POST /api/areas`, `PUT/DELETE /api/areas/[id]`. Tela `/admin/areas` — usada pela Task 8 (link "Meu Questionário" depende de `area_id` do usuário) e pela Task 9 (seletor de áreas envolvidas na empresa).

- [ ] **Step 1: Criar `app/api/areas/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const areas = await sql`
    SELECT id, name, order_index, created_at
    FROM areas
    ORDER BY order_index ASC, name ASC
  `

  return NextResponse.json(areas)
}

export async function POST(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode criar áreas' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const [{ max }] = await sql`SELECT COALESCE(MAX(order_index), 0) as max FROM areas`

  const [area] = await sql`
    INSERT INTO areas (name, order_index)
    VALUES (${name.trim()}, ${Number(max) + 1})
    RETURNING id, name, order_index, created_at
  `

  return NextResponse.json(area, { status: 201 })
}
```

- [ ] **Step 2: Criar `app/api/areas/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode editar áreas' }, { status: 403 })
  }

  const { id } = await params
  const { name } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const areas = await sql`
    UPDATE areas SET name = ${name.trim()} WHERE id = ${id}
    RETURNING id, name, order_index, created_at
  `

  if (areas.length === 0) {
    return NextResponse.json({ error: 'Área não encontrada' }, { status: 404 })
  }

  return NextResponse.json(areas[0])
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode excluir áreas' }, { status: 403 })
  }

  const { id } = await params

  const result = await sql`DELETE FROM areas WHERE id = ${id} RETURNING id`

  if (result.length === 0) {
    return NextResponse.json({ error: 'Área não encontrada' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Criar `app/admin/areas/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Area {
  id: string
  name: string
  order_index: number
}

export default function AreasPage() {
  const { user } = useAuth()
  const { data: areas, mutate } = useSWR<Area[]>('/api/areas', fetcher)
  const areasArray = Array.isArray(areas) ? areas : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingArea, setEditingArea] = useState<Area | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  function openCreateDialog() {
    setEditingArea(null)
    setName('')
    setDialogOpen(true)
  }

  function openEditDialog(area: Area) {
    setEditingArea(area)
    setName(area.name)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const url = editingArea ? `/api/areas/${editingArea.id}` : '/api/areas'
      const method = editingArea ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        mutate()
        setDialogOpen(false)
        toast.success(editingArea ? 'Área atualizada!' : 'Área criada!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta área? Isso remove também o questionário dela.')) return
    try {
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        mutate()
        toast.success('Área excluída')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin pode gerenciar áreas.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Áreas
          </h1>
          <p className="text-muted-foreground">Catálogo de áreas que avaliam as empresas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Área
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingArea ? 'Editar Área' : 'Nova Área'}</DialogTitle>
              <DialogDescription>Ex: Infraestrutura, Arquitetura, Segurança.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome da Área *</FieldLabel>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Salvando...' : (editingArea ? 'Atualizar' : 'Criar Área')}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {areasArray.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma área cadastrada</h3>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Área
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {areasArray.map((area) => (
            <Card key={area.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{area.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(area)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(area.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Adicionar item de navegação em `app/admin/layout.tsx`**

No array `navItems` (dentro de `AdminLayoutContent`), adicionar condicionalmente o link "Áreas" só para `super_admin`. Substituir:

```typescript
const navItems = [
    { href: '/admin', icon: Home, label: 'Dashboard', exact: true },
    { href: '/admin/companies', icon: Building2, label: 'Empresas', exact: false },
  ]
```

por:

```typescript
const navItems = [
    { href: '/admin', icon: Home, label: 'Dashboard', exact: true },
    { href: '/admin/companies', icon: Building2, label: 'Empresas', exact: false },
    ...(user?.role === 'super_admin'
      ? [{ href: '/admin/areas', icon: Layers, label: 'Áreas', exact: false }]
      : []),
  ]
```

Adicionar `Layers` ao import de `lucide-react` no topo do arquivo.

- [ ] **Step 5: Verificar manualmente**

1. Com o super admin de teste logado, acessar `/admin/areas`.
2. Criar 2-3 áreas (ex: "Infraestrutura", "Segurança").
3. Editar uma, excluir outra.
4. Esperado: lista atualiza em tempo real (SWR), sem erro no console.

- [ ] **Step 6: Commit**

```bash
git add app/api/areas app/admin/areas app/admin/layout.tsx
git commit -m "feat: CRUD de áreas para o super admin"
```

---

### Task 7: API e UI de Usuários — super admin convida area_admins

**Files:**
- Create: `app/api/admin-users/route.ts`
- Create: `app/api/admin-users/[id]/route.ts`
- Create: `app/admin/users/page.tsx`
- Modify: `app/admin/layout.tsx` (item de navegação)

**Interfaces:**
- Consumes: `requireSuperAdmin` de `@/lib/session`; `Area` de `/api/areas` (Task 6).
- Produces: `GET/POST /api/admin-users`, `DELETE /api/admin-users/[id]`.

- [ ] **Step 1: Criar `app/api/admin-users/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode ver usuários' }, { status: 403 })
  }

  const users = await sql`
    SELECT u.id, u.name, u.email, u.role, u.area_id, a.name as area_name, u.created_at
    FROM admin_users u
    LEFT JOIN areas a ON a.id = u.area_id
    ORDER BY u.created_at DESC
  `

  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode convidar usuários' }, { status: 403 })
  }

  const { name, email, role, area_id } = await request.json()

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Nome e email são obrigatórios' }, { status: 400 })
  }
  if (role !== 'super_admin' && role !== 'area_admin') {
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })
  }
  if (role === 'area_admin' && !area_id) {
    return NextResponse.json({ error: 'Área é obrigatória para admin de área' }, { status: 400 })
  }

  const existing = await sql`SELECT id FROM admin_users WHERE email = ${email.trim()}`
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Este email já está cadastrado' }, { status: 400 })
  }

  const [newUser] = await sql`
    INSERT INTO admin_users (name, email, password_hash, role, area_id)
    VALUES (${name.trim()}, ${email.trim()}, 'google-oauth', ${role}, ${role === 'area_admin' ? area_id : null})
    RETURNING id, name, email, role, area_id, created_at
  `

  return NextResponse.json(newUser, { status: 201 })
}
```

(A coluna `password_hash` continua `NOT NULL` até a Task 10 remover a dependência de senha por completo — por isso o valor fixo `'google-oauth'` aqui, nunca usado para autenticar.)

- [ ] **Step 2: Criar `app/api/admin-users/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin pode remover usuários' }, { status: 403 })
  }

  const { id } = await params

  if (id === user.id) {
    return NextResponse.json({ error: 'Você não pode remover sua própria conta' }, { status: 400 })
  }

  const result = await sql`DELETE FROM admin_users WHERE id = ${id} RETURNING id`

  if (result.length === 0) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Criar `app/admin/users/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Area { id: string; name: string }
interface AdminUserRow {
  id: string; name: string; email: string
  role: 'super_admin' | 'area_admin'; area_id: string | null; area_name: string | null
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const { data: users, mutate } = useSWR<AdminUserRow[]>('/api/admin-users', fetcher)
  const { data: areas } = useSWR<Area[]>('/api/areas', fetcher)
  const usersArray = Array.isArray(users) ? users : []
  const areasArray = Array.isArray(areas) ? areas : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'area_admin' as 'super_admin' | 'area_admin', area_id: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        mutate()
        setForm({ name: '', email: '', role: 'area_admin', area_id: '' })
        setDialogOpen(false)
        toast.success('Usuário convidado!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao convidar')
      }
    } catch {
      toast.error('Erro ao convidar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este usuário?')) return
    try {
      const res = await fetch(`/api/admin-users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        mutate()
        toast.success('Removido')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao remover')
      }
    } catch {
      toast.error('Erro ao remover')
    }
  }

  if (me && me.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin pode gerenciar usuários.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6" />
            Usuários
          </h1>
          <p className="text-muted-foreground">Quem pode entrar com Google e o que cada um administra</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Convidar Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Usuário</DialogTitle>
              <DialogDescription>Cadastre o email do Google da pessoa — ela poderá entrar assim que fizer login.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome *</FieldLabel>
                  <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} required />
                </Field>
                <Field>
                  <FieldLabel>Email do Google *</FieldLabel>
                  <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} required />
                </Field>
                <Field>
                  <FieldLabel>Papel *</FieldLabel>
                  <Select value={form.role} onValueChange={(v) => setForm(p => ({ ...p, role: v as 'super_admin' | 'area_admin' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area_admin">Admin de Área</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.role === 'area_admin' && (
                  <Field>
                    <FieldLabel>Área *</FieldLabel>
                    <Select value={form.area_id} onValueChange={(v) => setForm(p => ({ ...p, area_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Escolha a área" /></SelectTrigger>
                      <SelectContent>
                        {areasArray.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Convidando...' : 'Convidar'}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {usersArray.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">{u.name}</CardTitle>
                <CardDescription>
                  {u.email} · {u.role === 'super_admin' ? 'Super Admin' : `Admin de ${u.area_name ?? '—'}`}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(u.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Adicionar item de navegação**

Em `app/admin/layout.tsx`, no array `navItems` construído na Task 6, adicionar mais um item condicional a `super_admin`. `Users` já é importado no arquivo hoje (usado até aqui pelo item "Avaliadores" de `companyNavItems`, que será removido na Task 13) — reaproveitar o mesmo import, sem alias:

```typescript
    ...(user?.role === 'super_admin'
      ? [
          { href: '/admin/areas', icon: Layers, label: 'Áreas', exact: false },
          { href: '/admin/users', icon: Users, label: 'Usuários', exact: false },
        ]
      : []),
```

- [ ] **Step 5: Verificar manualmente**

1. Como super admin, acessar `/admin/users`.
2. Convidar um segundo usuário de teste como `area_admin` de uma das áreas criadas na Task 6, usando um email do Google que você também controla (ou uma conta secundária).
3. Fazer logout, logar com esse segundo email.
4. Esperado: entra normalmente, e `/admin/users` mostra "Só o super admin pode gerenciar usuários." pra essa conta.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin-users app/admin/users app/admin/layout.tsx
git commit -m "feat: super admin convida area_admins por email"
```

---

### Task 8: Questionário global por área — "Meu Questionário"

**Files:**
- Create: `app/api/areas/[id]/questions/route.ts`
- Create: `app/api/areas/[id]/questions/[questionId]/route.ts`
- Create: `app/admin/my-questionnaire/page.tsx`
- Modify: `app/admin/layout.tsx` (item de navegação)

**Interfaces:**
- Consumes: `requireAreaAccess` de `@/lib/session` (Task 3).
- Produces: `GET/POST /api/areas/[id]/questions`, `DELETE /api/areas/[id]/questions/[questionId]`. Página `/admin/my-questionnaire` usada pela Task 9 (avaliação lê as mesmas perguntas por `area_id`).

- [ ] **Step 1: Criar `app/api/areas/[id]/questions/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireAreaAccess } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const questions = await sql`
    SELECT id, area_id, text, order_index, created_at
    FROM area_questions
    WHERE area_id = ${id}
    ORDER BY order_index ASC
  `

  return NextResponse.json(questions)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: areaId } = await params
  const user = await requireAreaAccess(areaId)
  if (!user) {
    return NextResponse.json({ error: 'Sem permissão para editar este questionário' }, { status: 403 })
  }

  const { text } = await request.json()
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
  }

  const [{ max }] = await sql`
    SELECT COALESCE(MAX(order_index), 0) as max FROM area_questions WHERE area_id = ${areaId}
  `

  const [question] = await sql`
    INSERT INTO area_questions (area_id, text, order_index)
    VALUES (${areaId}, ${text.trim()}, ${Number(max) + 1})
    RETURNING id, area_id, text, order_index, created_at
  `

  return NextResponse.json(question, { status: 201 })
}
```

- [ ] **Step 2: Criar `app/api/areas/[id]/questions/[questionId]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireAreaAccess } from '@/lib/session'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id: areaId, questionId } = await params
  const user = await requireAreaAccess(areaId)
  if (!user) {
    return NextResponse.json({ error: 'Sem permissão para editar este questionário' }, { status: 403 })
  }

  await sql`DELETE FROM area_questions WHERE id = ${questionId} AND area_id = ${areaId}`

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Criar `app/admin/my-questionnaire/page.tsx`**

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Question { id: string; text: string; order_index: number }

export default function MyQuestionnairePage() {
  const { user } = useAuth()
  const areaId = user?.areaId

  const { data: questions = [], mutate } = useSWR<Question[]>(
    areaId ? `/api/areas/${areaId}/questions` : null,
    fetcher
  )
  const questionsArray = Array.isArray(questions) ? questions : []

  const [newQuestionText, setNewQuestionText] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [loadingAddQ, setLoadingAddQ] = useState(false)
  const newQRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (addingQuestion) newQRef.current?.focus()
  }, [addingQuestion])

  async function handleAddQuestion() {
    if (!newQuestionText.trim() || !areaId) return
    setLoadingAddQ(true)
    try {
      const res = await fetch(`/api/areas/${areaId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newQuestionText.trim() }),
      })
      if (res.ok) {
        mutate()
        setNewQuestionText('')
        setAddingQuestion(false)
        toast.success('Pergunta adicionada!')
      }
    } catch { toast.error('Erro ao adicionar') }
    finally { setLoadingAddQ(false) }
  }

  async function handleDeleteQuestion(qId: string) {
    if (!areaId) return
    try {
      await fetch(`/api/areas/${areaId}/questions/${qId}`, { method: 'DELETE' })
      mutate()
    } catch { toast.error('Erro') }
  }

  if (!user) return null

  if (user.role === 'super_admin') {
    return <p className="text-muted-foreground">Super admin não tem área própria — edite o questionário de cada área em "Áreas".</p>
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          Meu Questionário
        </h1>
        <p className="text-muted-foreground">
          Perguntas usadas pra avaliar qualquer empresa em que sua área esteja envolvida. Escala 0 a 10.
        </p>
      </div>

      {questionsArray.map((q, idx) => (
        <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-indigo-200 transition-all group">
          <div className="flex items-start gap-3 p-5">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pergunta {idx + 1}</p>
              <p className="text-base text-gray-900 leading-snug">{q.text}</p>
            </div>
            <button
              onClick={() => handleDeleteQuestion(q.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {addingQuestion ? (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-400 p-5 space-y-3">
          <textarea
            ref={newQRef}
            value={newQuestionText}
            onChange={e => setNewQuestionText(e.target.value)}
            placeholder="Digite a pergunta aqui..."
            rows={2}
            className="w-full text-base text-gray-900 placeholder-gray-400 border-b-2 border-indigo-300 focus:border-indigo-500 focus:outline-none resize-none bg-transparent pb-1 transition-colors"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddQuestion() }
              if (e.key === 'Escape') { setAddingQuestion(false); setNewQuestionText('') }
            }}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleAddQuestion} disabled={loadingAddQ || !newQuestionText.trim()}>
              {loadingAddQ ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="ghost" onClick={() => { setAddingQuestion(false); setNewQuestionText('') }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingQuestion(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Adicionar pergunta
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Adicionar item de navegação em `app/admin/layout.tsx`**

No `navItems`, adicionar item condicional a `area_admin`:

```typescript
    ...(user?.role === 'area_admin'
      ? [{ href: '/admin/my-questionnaire', icon: ClipboardList, label: 'Meu Questionário', exact: false }]
      : []),
```

Importar `ClipboardList` de `lucide-react` (já é importado no arquivo hoje pra outro uso — reaproveitar o import).

- [ ] **Step 5: Verificar manualmente**

1. Logar como o `area_admin` de teste criado na Task 7.
2. Acessar `/admin/my-questionnaire`, adicionar 2-3 perguntas.
3. Deslogar, logar como super_admin — confirmar que super_admin vê a mensagem "não tem área própria" nessa tela (ele edita via `/admin/areas`, que ainda não tem essa funcionalidade — ok por ora, será refinado se necessário).
4. Deslogar, logar de novo como o area_admin — confirmar que as perguntas persistiram.

- [ ] **Step 6: Commit**

```bash
git add app/api/areas app/admin/my-questionnaire app/admin/layout.tsx
git commit -m "feat: questionário global por área (Meu Questionário)"
```

---

### Task 9: Empresas com áreas envolvidas selecionáveis

**Files:**
- Modify: `app/api/companies/route.ts`
- Modify: `app/api/companies/[id]/route.ts`
- Create: `app/api/companies/[id]/areas/route.ts`
- Modify: `app/admin/companies/page.tsx`

**Interfaces:**
- Consumes: `Area` de `/api/areas` (Task 6).
- Produces: `GET/PUT /api/companies/[id]/areas` (lista/define quais `area_id` estão envolvidas). `GET /api/companies` e `GET /api/companies/[id]` passam a incluir `involved_area_ids: string[]`.

- [ ] **Step 1: Criar `app/api/companies/[id]/areas/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin, requireSuperAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const areas = await sql`
    SELECT a.id, a.name
    FROM company_areas ca
    JOIN areas a ON a.id = ca.area_id
    WHERE ca.company_id = ${id}
    ORDER BY a.order_index ASC
  `

  return NextResponse.json(areas)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin define as áreas envolvidas' }, { status: 403 })
  }

  const { id: companyId } = await params
  const { area_ids } = await request.json()

  if (!Array.isArray(area_ids)) {
    return NextResponse.json({ error: 'area_ids deve ser uma lista' }, { status: 400 })
  }

  await sql`DELETE FROM company_areas WHERE company_id = ${companyId}`

  for (const areaId of area_ids) {
    await sql`INSERT INTO company_areas (company_id, area_id) VALUES (${companyId}, ${areaId})`
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Atualizar `app/admin/companies/page.tsx`**

Adicionar um multi-select de áreas ao formulário de criar/editar empresa. Importar `useSWR` já está no arquivo. Adicionar logo após os imports existentes:

```typescript
import { Checkbox } from '@/components/ui/checkbox'
```

Adicionar, dentro do componente `CompaniesPage`, junto aos outros hooks `useSWR`:

```typescript
  const { data: areas } = useSWR<{ id: string; name: string }[]>('/api/areas', fetcher)
  const areasArray = Array.isArray(areas) ? areas : []
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([])
```

Ao abrir o diálogo de edição (`openEditDialog`), buscar as áreas já envolvidas daquela empresa:

```typescript
  function openEditDialog(company: Company) {
    setEditingCompany(company)
    setFormData({ name: company.name, cnpj: company.cnpj || '', description: company.description || '' })
    fetch(`/api/companies/${company.id}/areas`).then(r => r.json()).then((rows: { id: string }[]) => {
      setSelectedAreaIds(rows.map(r => r.id))
    })
    setDialogOpen(true)
  }
```

Em `openCreateDialog`, resetar `setSelectedAreaIds([])`.

Dentro do `<form onSubmit={handleSubmit}>`, adicionar antes do botão de submit, dentro do `<FieldGroup>`:

```jsx
                <Field>
                  <FieldLabel>Áreas envolvidas</FieldLabel>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                    {areasArray.map(area => (
                      <label key={area.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedAreaIds.includes(area.id)}
                          onCheckedChange={(checked) => {
                            setSelectedAreaIds(prev =>
                              checked ? [...prev, area.id] : prev.filter(id => id !== area.id)
                            )
                          }}
                        />
                        {area.name}
                      </label>
                    ))}
                    {areasArray.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma área cadastrada ainda.</p>
                    )}
                  </div>
                </Field>
```

Em `handleSubmit`, depois de criar/atualizar a empresa com sucesso e antes de `mutate()`, salvar as áreas envolvidas:

```typescript
      if (res.ok) {
        const savedCompany = await res.json()
        const companyIdForAreas = editingCompany?.id ?? savedCompany.id
        await fetch(`/api/companies/${companyIdForAreas}/areas`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ area_ids: selectedAreaIds }),
        })
        mutate()
        setDialogOpen(false)
        toast.success(editingCompany ? 'Empresa atualizada!' : 'Empresa criada!')
      } else {
```

(Isso substitui o bloco `if (res.ok) { mutate(); ... }` existente — ajustar para não duplicar a leitura de `res.json()`, já que o código atual não lê o corpo da resposta no sucesso; ler uma vez e reutilizar.)

- [ ] **Step 3: Verificar manualmente**

1. Como super_admin, criar uma empresa nova, marcar 2 áreas no formulário, salvar.
2. Reabrir o diálogo de edição da mesma empresa — esperado: as 2 áreas continuam marcadas.
3. Desmarcar uma, salvar, reabrir — esperado: só 1 área marcada agora.

- [ ] **Step 4: Commit**

```bash
git add "app/api/companies/[id]/areas" app/admin/companies/page.tsx
git commit -m "feat: super admin escolhe áreas envolvidas por empresa"
```

---

### Task 10: Fluxo de avaliação autenticado — area_admin responde pela sua área

**Files:**
- Create: `app/api/companies/[id]/evaluations/route.ts`
- Create: `app/api/companies/[id]/evaluations/[evaluationId]/route.ts`
- Create: `app/admin/companies/[id]/evaluate/page.tsx`
- Modify: `app/admin/companies/[id]/page.tsx` (hub da empresa — trocar link "Avaliadores" por "Responder Avaliação" / "Resultados")

**Interfaces:**
- Consumes: `requireAreaAccess`, `getCurrentAdmin` de `@/lib/session`; `AreaQuestion` de `/api/areas/[id]/questions` (Task 8).
- Produces: `GET /api/companies/[id]/evaluations` (lista todas as avaliações da empresa, todas as áreas — usada pela Task 11 de transparência e pela Task 12 do painel), `GET/PUT /api/companies/[id]/evaluations/[evaluationId]` (respostas de uma avaliação específica).

- [ ] **Step 1: Criar `app/api/companies/[id]/evaluations/route.ts`**

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

  const { id } = await params

  const evaluations = await sql`
    SELECT e.id, e.company_id, e.area_id, a.name as area_name,
           e.admin_user_id, u.name as admin_name,
           e.status, e.completed_at, e.created_at
    FROM evaluations e
    JOIN areas a ON a.id = e.area_id
    JOIN admin_users u ON u.id = e.admin_user_id
    WHERE e.company_id = ${id}
    ORDER BY a.order_index ASC, e.created_at ASC
  `

  return NextResponse.json(evaluations)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user || user.role !== 'area_admin' || !user.areaId) {
    return NextResponse.json({ error: 'Só um admin de área pode iniciar uma avaliação' }, { status: 403 })
  }

  const { id: companyId } = await params

  const involved = await sql`
    SELECT 1 FROM company_areas WHERE company_id = ${companyId} AND area_id = ${user.areaId}
  `
  if (involved.length === 0) {
    return NextResponse.json({ error: 'Sua área não está envolvida nesta empresa' }, { status: 403 })
  }

  const existing = await sql`
    SELECT id FROM evaluations
    WHERE company_id = ${companyId} AND area_id = ${user.areaId} AND admin_user_id = ${user.id}
  `
  if (existing.length > 0) {
    return NextResponse.json(existing[0])
  }

  const [evaluation] = await sql`
    INSERT INTO evaluations (company_id, area_id, admin_user_id, status)
    VALUES (${companyId}, ${user.areaId}, ${user.id}, 'in_progress')
    RETURNING id, company_id, area_id, admin_user_id, status, completed_at, created_at
  `

  return NextResponse.json(evaluation, { status: 201 })
}
```

- [ ] **Step 2: Criar `app/api/companies/[id]/evaluations/[evaluationId]/route.ts`**

```typescript
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
```

- [ ] **Step 3: Criar `app/admin/companies/[id]/evaluate/page.tsx`**

```typescript
'use client'

import { use, useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Question { id: string; text: string; order_index: number }
interface Answer { question_id: string; score: number; comment: string }
interface EvaluationData {
  evaluation: { id: string; status: string }
  questions: Question[]
  answers: { question_id: string; score: number | null; comment: string | null }[]
}

export default function EvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params)
  const { user } = useAuth()
  const router = useRouter()

  const [evaluationId, setEvaluationId] = useState<string | null>(null)
  const [answersMap, setAnswersMap] = useState<Record<string, Answer>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'area_admin') return
    fetch(`/api/companies/${companyId}/evaluations`, { method: 'POST' })
      .then(res => res.json())
      .then(data => setEvaluationId(data.id))
  }, [companyId, user])

  const { data, mutate } = useSWR<EvaluationData>(
    evaluationId ? `/api/companies/${companyId}/evaluations/${evaluationId}` : null,
    fetcher
  )

  useEffect(() => {
    if (!data) return
    const map: Record<string, Answer> = {}
    data.questions.forEach(q => {
      const existing = data.answers.find(a => a.question_id === q.id)
      map[q.id] = { question_id: q.id, score: existing?.score ?? -1, comment: existing?.comment ?? '' }
    })
    setAnswersMap(map)
  }, [data])

  function updateScore(questionId: string, score: number) {
    setAnswersMap(prev => ({ ...prev, [questionId]: { ...prev[questionId], score } }))
  }

  function updateComment(questionId: string, comment: string) {
    setAnswersMap(prev => ({ ...prev, [questionId]: { ...prev[questionId], comment } }))
  }

  async function handleSubmit(complete: boolean) {
    if (!evaluationId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/evaluations/${evaluationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Object.values(answersMap), complete }),
      })
      if (res.ok) {
        toast.success(complete ? 'Avaliação enviada!' : 'Progresso salvo')
        mutate()
        if (complete) router.push(`/admin/companies/${companyId}`)
      } else {
        toast.error('Erro ao salvar')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null
  if (user.role !== 'area_admin') {
    return <p className="text-muted-foreground">Só um admin de área pode responder uma avaliação.</p>
  }
  if (!data) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
  }

  const answeredCount = Object.values(answersMap).filter(a => a.score >= 0).length

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Responder Avaliação</h1>
      </div>

      {data.questions.map((q, idx) => {
        const answer = answersMap[q.id]
        return (
          <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-gray-900 font-medium mb-4">{idx + 1}. {q.text}</p>
            <div className="flex gap-1 mb-3">
              {Array.from({ length: 11 }, (_, n) => n).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateScore(q.id, n)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                    answer?.score === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Comentário (opcional)"
              value={answer?.comment ?? ''}
              onChange={e => updateComment(q.id, e.target.value)}
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none"
            />
          </div>
        )
      })}

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting}>
          Salvar progresso
        </Button>
        <Button onClick={() => handleSubmit(true)} disabled={submitting || answeredCount < data.questions.length}>
          Enviar avaliação ({answeredCount}/{data.questions.length})
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Adicionar SQL de índice único (idempotente) para o `ON CONFLICT` funcionar**

A tabela `evaluation_answers` já foi criada na Task 2 com `UNIQUE (evaluation_id, question_id)`, o que já cria o índice necessário pro `ON CONFLICT (evaluation_id, question_id)` do Step 2 funcionar — nenhuma ação extra aqui, só confirmar visualmente em `app/api/migrate/route.ts` que essa constraint está presente.

- [ ] **Step 5: Atualizar o hub da empresa em `app/admin/companies/[id]/page.tsx`**

Substituir o link "Gerenciar" que aponta para `/admin/companies/${id}/evaluators` por dois links condicionais ao papel do usuário logado — importar `useAuth` de `@/components/auth-context` no topo do arquivo e usar:

```typescript
  const { user } = useAuth()
```

E, no JSX onde hoje existe o link para "Avaliadores", adicionar:

```jsx
        {user?.role === 'area_admin' && (
          <Link
            href={`/admin/companies/${id}/evaluate`}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
          >
            Responder minha avaliação →
          </Link>
        )}
```

(A tela completa de "Resultados" com transparência entre áreas é construída na Task 11 — por ora esse link básico já habilita o fluxo de resposta.)

- [ ] **Step 6: Verificar manualmente**

1. Logar como o `area_admin` de teste, cuja área foi marcada como envolvida numa empresa (Task 9).
2. Abrir o perfil dessa empresa, clicar em "Responder minha avaliação".
3. Responder todas as perguntas, clicar "Salvar progresso" — recarregar a página, confirmar que as respostas persistiram.
4. Clicar "Enviar avaliação" — esperado: redireciona de volta pro perfil da empresa.
5. Tentar acessar `/admin/companies/[id]/evaluate` para uma empresa cuja área do usuário NÃO está marcada como envolvida — esperado: erro 403 ao criar a avaliação (checar no console do navegador, aba Network).

- [ ] **Step 7: Commit**

```bash
git add "app/api/companies/[id]/evaluations" "app/admin/companies/[id]/evaluate" "app/admin/companies/[id]/page.tsx"
git commit -m "feat: area_admin responde avaliação autenticada da própria área"
```

---

### Task 11: Transparência entre áreas — tela de resultados

**Files:**
- Create: `app/admin/companies/[id]/results/page.tsx`
- Modify: `app/admin/companies/[id]/page.tsx` (link para "Resultados")

**Interfaces:**
- Consumes: `GET /api/companies/[id]/evaluations` (Task 10); novo endpoint de respostas por avaliação reaproveitando `GET /api/companies/[id]/evaluations/[evaluationId]` (Task 10).

- [ ] **Step 1: Criar `app/admin/companies/[id]/results/page.tsx`**

```typescript
'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface EvaluationRow {
  id: string; area_id: string; area_name: string
  admin_user_id: string; admin_name: string
  status: 'in_progress' | 'completed'; completed_at: string | null
}

interface EvaluationDetail {
  evaluation: { id: string }
  questions: { id: string; text: string }[]
  answers: { question_id: string; score: number | null; comment: string | null }[]
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params)
  const router = useRouter()

  const { data: evaluations } = useSWR<EvaluationRow[]>(`/api/companies/${companyId}/evaluations`, fetcher)
  const evaluationsArray = Array.isArray(evaluations) ? evaluations : []

  const [openId, setOpenId] = useState<string | null>(null)
  const { data: detail } = useSWR<EvaluationDetail>(
    openId ? `/api/companies/${companyId}/evaluations/${openId}` : null,
    fetcher
  )

  const grouped = evaluationsArray.reduce<Record<string, EvaluationRow[]>>((acc, ev) => {
    (acc[ev.area_name] ||= []).push(ev)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Resultados (todas as áreas)</h1>
      </div>

      {Object.entries(grouped).map(([areaName, evals]) => (
        <div key={areaName}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{areaName}</h2>
          <div className="space-y-2">
            {evals.map(ev => (
              <div key={ev.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <button
                  onClick={() => setOpenId(openId === ev.id ? null : ev.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium">{ev.admin_name}</span>
                  {ev.status === 'completed' ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Concluída</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-700"><Clock className="h-3.5 w-3.5" />Em andamento</span>
                  )}
                </button>
                {openId === ev.id && detail && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                    {detail.questions.map(q => {
                      const answer = detail.answers.find(a => a.question_id === q.id)
                      return (
                        <div key={q.id} className="text-sm">
                          <p className="text-gray-700">{q.text}</p>
                          <p className="text-indigo-700 font-semibold">{answer?.score ?? '—'}/10</p>
                          {answer?.comment && <p className="text-gray-400 italic">"{answer.comment}"</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {evaluationsArray.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhuma avaliação iniciada ainda para esta empresa.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar link em `app/admin/companies/[id]/page.tsx`**

Junto ao link "Responder minha avaliação" adicionado na Task 10, adicionar (visível pra todo mundo, super_admin e area_admin — transparência):

```jsx
        <Link
          href={`/admin/companies/${id}/results`}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          Ver resultados de todas as áreas →
        </Link>
```

- [ ] **Step 3: Verificar manualmente**

1. Logado como qualquer usuário (super_admin ou area_admin), abrir `/admin/companies/[id]/results` de uma empresa com pelo menos uma avaliação em andamento.
2. Esperado: vê a avaliação agrupada por área, incluindo áreas que não são a sua.
3. Clicar numa avaliação — expande mostrando as notas e comentários.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/companies/[id]/results" "app/admin/companies/[id]/page.tsx"
git commit -m "feat: tela de resultados com transparência entre áreas"
```

---

### Task 12: Painel de Acompanhamento do super_admin

**Files:**
- Create: `app/api/dashboard/route.ts`
- Create: `app/admin/dashboard/page.tsx`
- Modify: `app/admin/layout.tsx` (item de navegação)

**Interfaces:**
- Consumes: tabelas `companies`, `company_areas`, `areas`, `evaluations`, `admin_users`.

- [ ] **Step 1: Criar `app/api/dashboard/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/session'

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Apenas o super admin acessa o painel' }, { status: 403 })
  }

  const rows = await sql`
    SELECT
      c.id as company_id, c.name as company_name,
      a.id as area_id, a.name as area_name,
      COUNT(DISTINCT au.id) as total_area_admins,
      COUNT(DISTINCT e.admin_user_id) FILTER (WHERE e.status = 'completed') as completed_count
    FROM companies c
    JOIN company_areas ca ON ca.company_id = c.id
    JOIN areas a ON a.id = ca.area_id
    LEFT JOIN admin_users au ON au.area_id = a.id AND au.role = 'area_admin'
    LEFT JOIN evaluations e ON e.company_id = c.id AND e.area_id = a.id
    GROUP BY c.id, c.name, a.id, a.name
    ORDER BY c.name ASC, a.name ASC
  `

  return NextResponse.json(rows)
}
```

- [ ] **Step 2: Criar `app/admin/dashboard/page.tsx`**

```typescript
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
  area_id: string; area_name: string
  total_area_admins: string; completed_count: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useSWR<Row[]>('/api/dashboard', fetcher)
  const rows = Array.isArray(data) ? data : []

  const grouped = rows.reduce<Record<string, { company_name: string; areas: Row[] }>>((acc, row) => {
    if (!acc[row.company_id]) acc[row.company_id] = { company_name: row.company_name, areas: [] }
    acc[row.company_id].areas.push(row)
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

      <div className="space-y-6">
        {Object.entries(grouped).map(([companyId, { company_name, areas }]) => (
          <div key={companyId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <Link href={`/admin/companies/${companyId}`} className="font-semibold text-lg hover:text-indigo-600">
              {company_name}
            </Link>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {areas.map(area => {
                const total = Number(area.total_area_admins)
                const done = Number(area.completed_count)
                const status = total === 0 ? 'sem-admin' : done === 0 ? 'nao-iniciado' : done < total ? 'andamento' : 'concluido'
                const colors: Record<string, string> = {
                  'sem-admin': 'bg-gray-100 text-gray-500 border-gray-200',
                  'nao-iniciado': 'bg-red-50 text-red-700 border-red-200',
                  'andamento': 'bg-amber-50 text-amber-700 border-amber-200',
                  'concluido': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                }
                return (
                  <div key={area.area_id} className={`rounded-lg border px-3 py-2 text-sm ${colors[status]}`}>
                    <p className="font-medium">{area.area_name}</p>
                    <p className="text-xs">{done}/{total} concluíram</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma empresa com áreas envolvidas ainda.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar item de navegação em `app/admin/layout.tsx`**

Adicionar ao grupo condicional de `super_admin` criado nas Tasks 6 e 7:

```typescript
    ...(user?.role === 'super_admin'
      ? [
          { href: '/admin/dashboard', icon: BarChart3, label: 'Painel', exact: false },
          { href: '/admin/areas', icon: Layers, label: 'Áreas', exact: false },
          { href: '/admin/users', icon: UsersIcon, label: 'Usuários', exact: false },
        ]
      : []),
```

`BarChart3` já é importado no arquivo hoje.

- [ ] **Step 4: Verificar manualmente**

1. Como super_admin, com pelo menos uma empresa tendo áreas envolvidas e pelo menos uma avaliação concluída, acessar `/admin/dashboard`.
2. Esperado: vê a grade de empresas × áreas, com contagem "X/Y concluíram" e cor correspondente ao status.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard app/admin/dashboard app/admin/layout.tsx
git commit -m "feat: painel de acompanhamento do super admin"
```

---

### Task 13: Remover o modelo antigo (login por senha, avaliador por token)

**Files:**
- Delete: `app/api/auth/login/route.ts`
- Delete: `app/api/auth/register/route.ts`
- Delete: `app/api/auth/logout/route.ts`
- Delete: `app/api/auth/me/route.ts`
- Delete: `app/register/page.tsx`, `app/register/layout.tsx`
- Delete: `app/avaliar/` (diretório inteiro: `page.tsx`, `layout.tsx`, `[token]/page.tsx`)
- Delete: `app/api/evaluator/` (diretório inteiro)
- Delete: `app/api/companies/[id]/evaluators/` (diretório inteiro — substituído pelas Tasks 10/11)
- Delete: `app/admin/companies/[id]/evaluators/page.tsx` (tela antiga de avaliadores por token — substituída por `evaluate`/`results`)
- Delete: `app/api/companies/[id]/questionnaires/` (diretório inteiro, incluindo `[questionnaireId]/questions/` — substituído por `app/api/areas/[id]/questions`)
- Delete: `app/admin/companies/[id]/questionnaires/page.tsx` (tela antiga de questionário por empresa — substituída por "Meu Questionário")
- Delete: `lib/auth.ts`
- Modify: `lib/validations.ts` (remover schemas do modelo antigo)
- Modify: `app/api/migrate/route.ts` (remover a coluna `password_hash` de `admin_users`, agora sem uso)
- Modify: `app/admin/layout.tsx` (remover os itens "Avaliadores" e "Questionários" de `companyNavItems`, que apontavam pras telas deletadas acima)

**Interfaces:**
- Nenhuma nova — esta tarefa só remove código morto que nenhuma tarefa anterior mais referencia.

- [ ] **Step 1: Confirmar que nada mais importa os arquivos a remover**

Rodar, dentro de `analise/`:

```bash
grep -rn "from '@/lib/auth'" app components lib --include="*.ts" --include="*.tsx"
```

Esperado: nenhum resultado (todas as rotas foram migradas para `@/lib/session` nas Tasks 3–12). Se aparecer algum resultado, migrar esse arquivo para `getCurrentAdmin`/`requireSuperAdmin`/`requireAreaAccess` antes de continuar.

- [ ] **Step 2: Remover os arquivos e diretórios**

```bash
rm app/api/auth/login/route.ts
rm app/api/auth/register/route.ts
rm app/api/auth/logout/route.ts
rm app/api/auth/me/route.ts
rm -rf app/register
rm -rf app/avaliar
rm -rf app/api/evaluator
rm -rf "app/api/companies/[id]/evaluators"
rm -rf "app/admin/companies/[id]/evaluators"
rm -rf "app/api/companies/[id]/questionnaires"
rm -rf "app/admin/companies/[id]/questionnaires"
rm lib/auth.ts
```

- [ ] **Step 3: Remover os itens de navegação órfãos em `app/admin/layout.tsx`**

No array `companyNavItems`, remover as linhas que apontam para `evaluators` e `questionnaires` (as telas foram deletadas no Step 2). O array passa de:

```typescript
  const companyNavItems = isInCompany && companyBasePath ? [
    { href: companyBasePath, icon: BarChart3, label: 'Visão Geral', exact: true },
    { href: `${companyBasePath}/evaluators`, icon: Users, label: 'Avaliadores', exact: true },
    { href: `${companyBasePath}/documents`, icon: FileText, label: 'Documentos', exact: true },
    { href: `${companyBasePath}/questionnaires`, icon: ClipboardList, label: 'Questionários', exact: true },
  ] : []
```

para:

```typescript
  const companyNavItems = isInCompany && companyBasePath ? [
    { href: companyBasePath, icon: BarChart3, label: 'Visão Geral', exact: true },
    { href: `${companyBasePath}/documents`, icon: FileText, label: 'Documentos', exact: true },
    { href: `${companyBasePath}/results`, icon: ClipboardList, label: 'Resultados', exact: true },
  ] : []
```

(O link para responder a própria avaliação continua vivendo como botão dentro da página de "Visão Geral" da empresa, Task 10 Step 5 — não precisa de item de menu próprio.)

- [ ] **Step 4: Limpar `lib/validations.ts`**

Remover `loginSchema`, `registerSchema`, `participantSchema`, `evaluationSchema` (o antigo, com `evaluator_id`/`evaluated_id`), `answerSchema`, `submitAnswersSchema`, `stageSchema`, `questionSchema` (o antigo, com `stage_id`) e seus `export type` correspondentes — nenhum é mais usado. Manter apenas `companySchema` e seu tipo `CompanyInput`.

- [ ] **Step 5: Remover `password_hash` de `admin_users`**

Adicionar em `app/api/migrate/route.ts`, no bloco de migrações:

```typescript
  try {
    await sql`ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL`
    migrations.push('admin_users.password_hash nullable OK')
  } catch (e) { errors.push(`admin_users.password_hash: ${e}`) }
```

(Tornar nullable em vez de `DROP COLUMN` — mais seguro caso algo ainda dependa da coluna existir; a coluna simplesmente para de ser preenchida por qualquer rota nova.)

- [ ] **Step 6: Verificar manualmente**

1. Rodar `npm run build` — esperado: compila sem erro (nenhuma referência quebrada aos arquivos removidos).
2. Rodar `npm run dev`, acessar `http://localhost:3000/login` — esperado: só o botão "Entrar com Google" aparece, sem formulário de senha.
3. Acessar `http://localhost:3000/avaliar` e `http://localhost:3000/register` — esperado: 404 (rotas removidas).
4. Rodar `curl -X POST http://localhost:3000/api/migrate` — esperado: `admin_users.password_hash nullable OK` na resposta.
5. Abrir o perfil de uma empresa — no menu lateral, confirmar que os itens "Avaliadores" e "Questionários" sumiram e "Resultados" aparece no lugar.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove login por senha e fluxo de avaliador por token"
```

---

## Próximos passos (fora deste plano)

Depois desta fase estar rodando e validada em uso real:

- **Fase 2 — Análise técnica por IA (Gemini):** tabelas `ai_analyses`, `ai_analysis_areas`, `ai_settings`; tela de configuração do prompt; botão "Gerar Análise" na empresa.
- **Fase 3 — Exportação em PDF:** `@react-pdf/renderer`, tabela `pdf_settings`, geração de estilo via IA a partir de instruções livres, botão "Baixar PDF".

Cada uma dessas fases merece seu próprio plano de implementação, escrito depois que esta fundação estiver funcionando de ponta a ponta.
