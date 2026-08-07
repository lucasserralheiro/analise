# Reformular navegação e Visão Geral da página de empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken "Avaliadores" section on `/admin/companies/[id]` (dead API/route from a removed feature), surface the real per-area evaluation progress, and move company navigation out of the sidebar into visible top-of-page tabs shared by all company sub-pages.

**Architecture:** A new `app/admin/companies/[id]/layout.tsx` renders the company header (back button, name, CNPJ) and a tab bar (Visão Geral / Documentos / Resultados / Avaliar) shared by all sub-pages, replacing the per-page duplicated headers and the sidebar's company sub-menu. A new `GET /api/companies/:id/roster` endpoint joins `company_areas` → `admin_users` → `evaluations` so the Visão Geral page can show, per area, who is assigned and whether they've completed their evaluation — data that already exists but was never surfaced (the old UI called a since-deleted `/evaluators` endpoint/page).

**Tech Stack:** Next.js 16 (App Router, React 19, client components), SWR for data fetching, `@neondatabase/serverless` tagged-template SQL, Tailwind, lucide-react icons, NextAuth v5.

## Global Constraints

- No automated test suite exists in this repo (no `__tests__`, no `*.test.ts`, no test runner in `package.json`). Per the approved spec, verification is manual (dev server + browser) plus TypeScript typechecking — do not introduce a new test framework as part of this work.
- `next.config.mjs` sets `typescript: { ignoreBuildErrors: true }`, so `npm run build` will **not** catch type errors. Use `npx tsc --noEmit` after every task to catch them.
- Follow existing file conventions: `'use client'` at the top of every page/layout that uses hooks, the shared `fetcher` pattern (`fetch(url).then(res => { if (!res.ok) throw new Error('Failed'); return res.json() })`), `use(params)` to unwrap the `Promise<{ id: string }>` params prop (this codebase is on a Next.js version where `params` is a Promise even in client components).
- Dev login (no Google OAuth needed locally): visit `/login`, use the "Login de desenvolvimento" form with the email of any existing row in `admin_users` (see `auth.ts`). Use a `super_admin` email to see every admin-only affordance during manual checks.
- Test company for manual verification: `c9c2dc8e-ac17-46ab-b915-eb2097b4380d` (the one from the original bug report) — confirm via `/admin/companies` that it still exists in your local DB; if not, use any company id from that list.

---

### Task 1: Roster API endpoint

**Files:**
- Create: `app/api/companies/[id]/roster/route.ts`

**Interfaces:**
- Consumes: `sql` from `@/lib/db`, `getCurrentAdmin` from `@/lib/session` (existing).
- Produces: `GET /api/companies/:id/roster` → `200` with JSON body:
  ```ts
  Array<{
    area_id: string
    area_name: string
    people: Array<{
      admin_user_id: string
      name: string
      evaluation_status: 'not_started' | 'in_progress' | 'completed'
    }>
  }>
  ```
  Later tasks (Task 3) consume this exact shape. Areas with no `admin_users` assigned return `people: []`.

- [ ] **Step 1: Write the route**

Create `app/api/companies/[id]/roster/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

interface RosterPerson {
  admin_user_id: string
  name: string
  evaluation_status: 'not_started' | 'in_progress' | 'completed'
}

interface RosterArea {
  area_id: string
  area_name: string
  people: RosterPerson[]
}

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

    // Uma linha por (área envolvida, admin de área daquela área). Áreas sem
    // nenhum admin cadastrado ainda aparecem (LEFT JOIN), com admin_user_id
    // nulo. O status da avaliação vem de outro LEFT JOIN, pois o admin pode
    // ainda não ter iniciado (nenhuma linha em evaluations).
    const rows = await sql`
      SELECT
        a.id as area_id,
        a.name as area_name,
        a.order_index,
        u.id as admin_user_id,
        u.name as admin_name,
        e.status as evaluation_status
      FROM company_areas ca
      JOIN areas a ON a.id = ca.area_id
      LEFT JOIN admin_users u ON u.area_id = a.id AND u.role = 'area_admin'
      LEFT JOIN evaluations e
        ON e.company_id = ca.company_id AND e.area_id = a.id AND e.admin_user_id = u.id
      WHERE ca.company_id = ${id}
      ORDER BY a.order_index ASC, u.name ASC
    `

    const areasById = new Map<string, RosterArea>()

    for (const row of rows) {
      if (!areasById.has(row.area_id)) {
        areasById.set(row.area_id, { area_id: row.area_id, area_name: row.area_name, people: [] })
      }
      if (row.admin_user_id) {
        areasById.get(row.area_id)!.people.push({
          admin_user_id: row.admin_user_id,
          name: row.admin_name,
          evaluation_status: row.evaluation_status === 'completed' || row.evaluation_status === 'in_progress'
            ? row.evaluation_status
            : 'not_started',
        })
      }
    }

    return NextResponse.json(Array.from(areasById.values()))
  } catch (error) {
    console.error('Get company roster error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/api/companies/[id]/roster/route.ts`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Log in at `/login` with a `super_admin` dev-login email, then visit `http://localhost:3000/api/companies/c9c2dc8e-ac17-46ab-b915-eb2097b4380d/roster` directly in the browser (or any company id that exists locally).
Expected: JSON array, one object per area involved with that company; each has `area_id`, `area_name`, `people` (array, possibly empty). If the company has an area with an assigned `area_admin` who has an `evaluations` row, confirm `evaluation_status` matches that row's `status` column.

- [ ] **Step 4: Commit**

```bash
git add app/api/companies/\[id\]/roster/route.ts
git commit -m "feat: adiciona endpoint de roster (pessoas por área) da empresa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared company layout (header + tabs)

**Files:**
- Create: `app/admin/companies/[id]/layout.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/components/auth-context` (existing, gives `user.role`), `Company` fetched from `/api/companies/:id` (existing endpoint, unchanged).
- Produces: renders `{children}` for every route under `app/admin/companies/[id]/**` — no exported values consumed by later tasks, but Task 3 and Task 4 rely on this layout now owning the back button, company name/CNPJ header, and the tab bar (so those tasks can delete their own copies).

- [ ] **Step 1: Write the layout**

Create `app/admin/companies/[id]/layout.tsx`:

```tsx
'use client'

import { ReactNode, use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Company {
  id: string
  name: string
  cnpj: string | null
  description: string | null
}

export default function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()

  const { data: company } = useSWR<Company>(`/api/companies/${id}`, fetcher)

  const tabs = [
    { href: `/admin/companies/${id}`, label: 'Visão Geral' },
    { href: `/admin/companies/${id}/documents`, label: 'Documentos' },
    { href: `/admin/companies/${id}/results`, label: 'Resultados' },
    ...(user?.role === 'area_admin'
      ? [{ href: `/admin/companies/${id}/evaluate`, label: 'Avaliar' }]
      : []),
  ]

  if (!company) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{company.name}</h1>
            {company.cnpj && (
              <p className="text-xs text-muted-foreground">CNPJ: {company.cnpj}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
```

Note: this layout does **not** constrain content width (no `max-w-*`) — each page keeps managing its own width (the hub page and Results page use `max-w-2xl`; Documents intentionally stays full-width for its multi-column grid). Only the header and tab bar live here.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/admin/companies/[id]/layout.tsx`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in, open a company from `/admin/companies`.
Expected: header (back arrow + company name/CNPJ) now appears once from the layout, tabs render below it, and the old page-level header still renders too (duplicate — this is expected and temporary, it goes away in Task 3/4). Click each tab and confirm the URL changes and the correct tab is highlighted (`border-indigo-600 text-indigo-600`). Log in as an `area_admin` (dev login with an area_admin's email) and confirm the "Avaliar" tab appears only for that role.

- [ ] **Step 4: Commit**

```bash
git add app/admin/companies/\[id\]/layout.tsx
git commit -m "feat: adiciona layout compartilhado com abas para páginas da empresa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Rewrite Visão Geral (hub page) to use the roster

**Files:**
- Modify: `app/admin/companies/[id]/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `GET /api/companies/:id/roster` from Task 1 (exact shape: `Array<{ area_id, area_name, people: Array<{ admin_user_id, name, evaluation_status }> }>`), the tab/header layout from Task 2 (so this file no longer renders its own header).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the file**

Replace the full contents of `app/admin/companies/[id]/page.tsx` with:

```tsx
'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface RosterPerson {
  admin_user_id: string
  name: string
  evaluation_status: 'not_started' | 'in_progress' | 'completed'
}

interface RosterArea {
  area_id: string
  area_name: string
  people: RosterPerson[]
}

export default function CompanyHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()

  const { data: rosterRaw } = useSWR<RosterArea[]>(`/api/companies/${id}/roster`, fetcher)
  const roster = Array.isArray(rosterRaw) ? rosterRaw : []

  const allPeople = roster.flatMap(area => area.people)
  const total = allPeople.length
  const completed = allPeople.filter(p => p.evaluation_status === 'completed').length
  const pending = total - completed
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const myAreaInvolved = user?.role === 'area_admin' && roster.some(area => area.area_id === user.areaId)

  if (!rosterRaw) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Pessoas envolvidas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{completed}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Concluídas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{pending}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Pendentes</p>
        </div>
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-medium text-gray-700">Progresso</span>
            <span className="font-bold text-indigo-600">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Ação rápida: só quando a própria área do usuário está envolvida */}
      {myAreaInvolved && (
        <Link
          href={`/admin/companies/${id}/evaluate`}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          Responder minha avaliação →
        </Link>
      )}

      {/* Áreas — roster real (empresa × área × admin × status) */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Áreas
        </h2>

        {roster.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma área envolvida nesta empresa ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {roster.map(area => (
              <div key={area.area_id}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{area.area_name}</p>

                {area.people.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      Nenhum admin de área cadastrado para esta área.
                    </p>
                    {user?.role === 'super_admin' && (
                      <Link href="/admin/users" className="text-sm font-semibold text-indigo-600 hover:underline">
                        Convidar administrador de área →
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {area.people.map(person => (
                      <div
                        key={person.admin_user_id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                      >
                        <div className={`h-1 ${
                          person.evaluation_status === 'completed'
                            ? 'bg-emerald-400'
                            : person.evaluation_status === 'in_progress'
                              ? 'bg-amber-400'
                              : 'bg-gray-200'
                        }`} />
                        <div className="flex items-center gap-4 px-5 py-3.5">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                            person.evaluation_status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {person.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
                          </div>
                          {person.evaluation_status === 'completed' ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Respondida
                            </span>
                          ) : person.evaluation_status === 'in_progress' ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full shrink-0 border border-amber-200">
                              <Clock className="h-3 w-3" /> Em andamento
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full shrink-0 border border-gray-200">
                              <Clock className="h-3 w-3" /> Não iniciada
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/admin/companies/[id]/page.tsx`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as `super_admin`, open a company that has at least one area with an assigned `area_admin` (check `/admin/users` and `/admin/companies` → edit → "Áreas envolvidas" to set this up if needed).
Expected:
- No duplicate header now (Task 2's layout header + tabs is the only header; this page starts directly with the stats cards).
- Stats/progress reflect real counts of people across all areas, not zero.
- Areas list shows one group per involved area; each person row shows the right status pill (Não iniciada / Em andamento / Respondida).
- An area with zero assigned admins shows the empty message, and — only when logged in as `super_admin` — the "Convidar administrador de área →" link, which goes to `/admin/users`.
- Log in as an `area_admin` whose area is **not** involved in this company → confirm "Responder minha avaliação →" does **not** appear. Log in as one whose area **is** involved → confirm it does appear.
- Confirm there is no reference anywhere to `/evaluators` (view page source or just click around — the old broken link is gone).

- [ ] **Step 4: Commit**

```bash
git add app/admin/companies/\[id\]/page.tsx
git commit -m "fix: substitui seção de Avaliadores quebrada por progresso real por área

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Remove duplicated headers from Documents, Results and Evaluate pages

**Files:**
- Modify: `app/admin/companies/[id]/documents/page.tsx:122-129`
- Modify: `app/admin/companies/[id]/results/page.tsx:1-13,84-89`
- Modify: `app/admin/companies/[id]/evaluate/page.tsx:1-9,94-99`

**Interfaces:**
- Consumes: header/tabs now provided by Task 2's layout — these pages must stop rendering their own back button/title.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Documents page — remove back button and page title, keep the upload dialog**

In `app/admin/companies/[id]/documents/page.tsx`, replace:

```tsx
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Documentos e Materiais</h1>
          <p className="text-muted-foreground">{docsArray.length} arquivo(s)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
```

with:

```tsx
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground flex-1">{docsArray.length} arquivo(s)</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
```

Then remove the now-unused `router` and `ArrowLeft` import: replace

```tsx
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, ArrowLeft, FileText, Upload, Download, Eye, File, FileSpreadsheet, FileImage } from 'lucide-react'
```

with:

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, FileText, Upload, Download, Eye, File, FileSpreadsheet, FileImage } from 'lucide-react'
```

(`FileText` stays — it's still used by `getFileIcon`.)

And remove the now-unused `router` variable: replace

```tsx
export default function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = require('react').use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
```

with:

```tsx
export default function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = require('react').use(params)
  const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Results page — remove back button and page title**

In `app/admin/companies/[id]/results/page.tsx`, replace:

```tsx
import { use, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Clock, Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'
```

with:

```tsx
import { use, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'
```

Then replace:

```tsx
export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params)
  const router = useRouter()
  const { user } = useAuth()
```

with:

```tsx
export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params)
  const { user } = useAuth()
```

Then replace:

```tsx
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Resultados (todas as áreas)</h1>
      </div>

      {/* Parecer geral */}
```

with:

```tsx
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Parecer geral */}
```

(`Button` stays — still used by the "Gerar Parecer"/"Regerar" buttons further down.)

- [ ] **Step 3: Evaluate page — remove back button and page title**

In `app/admin/companies/[id]/evaluate/page.tsx`, replace:

```tsx
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
```

with:

```tsx
import { Button } from '@/components/ui/button'
```

Then replace:

```tsx
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Responder Avaliação</h1>
      </div>

      {data.questions.map((q, idx) => {
```

with:

```tsx
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {data.questions.map((q, idx) => {
```

(`router` stays — still used in `handleSubmit` for `router.push` on completion; `Button` stays — still used by "Salvar progresso"/"Enviar avaliação".)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning any of the three files (this also catches leftover unused imports if `noUnusedLocals` were on — it isn't, but double-check there's no leftover reference to a removed import by reading each diff).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, log in, open a company, click through Documentos / Resultados / Avaliar (as an `area_admin` for the last one).
Expected: each page now shows only the layout's header + tabs once, followed directly by that page's own content (upload dialog + document grid; parecer geral + results list; question form). No leftover back-button/title duplicated inside the page body. Uploading a document and generating a parecer still work (these flows weren't touched, just confirm no regression).

- [ ] **Step 6: Commit**

```bash
git add app/admin/companies/\[id\]/documents/page.tsx app/admin/companies/\[id\]/results/page.tsx app/admin/companies/\[id\]/evaluate/page.tsx
git commit -m "refactor: remove cabeçalhos duplicados das sub-páginas da empresa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Remove the company sub-menu from the sidebar

**Files:**
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — this is the last piece of cleanup, safe once Task 2's tabs are live.

- [ ] **Step 1: Prune imports and the `fetcher`**

In `app/admin/layout.tsx`, replace:

```tsx
import { ReactNode, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { AuthProvider, useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import {
  Building2, Users, FileText, BarChart3, LogOut, Menu, X,
  Home, ClipboardList, ChevronLeft, Layers, Sparkles
} from 'lucide-react'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null)
```

with:

```tsx
import { ReactNode, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import {
  Building2, Users, BarChart3, LogOut, Menu, X,
  Home, ClipboardList, Layers, Sparkles
} from 'lucide-react'
import { useState } from 'react'
```

- [ ] **Step 2: Remove the company-detection block**

Replace:

```tsx
  // Extrai base da empresa: /admin/companies/[id]
  const companyBaseMatch = pathname.match(/^(\/admin\/companies\/([^/]+))/)
  const companyBasePath = companyBaseMatch ? companyBaseMatch[1] : null
  const companyId = companyBaseMatch ? companyBaseMatch[2] : null
  const isInCompany = !!companyBasePath && pathname !== '/admin/companies'

  // Busca nome da empresa quando estiver dentro de uma empresa
  const { data: companyData } = useSWR(
    companyId ? `/api/companies/${companyId}` : null,
    fetcher
  )
  const companyName = companyData?.name ?? null

const navItems = [
```

with:

```tsx
const navItems = [
```

- [ ] **Step 3: Remove `companyNavItems`**

Replace:

```tsx
  const companyNavItems = isInCompany && companyBasePath ? [
    { href: companyBasePath, icon: BarChart3, label: 'Visão Geral', exact: true },
    { href: `${companyBasePath}/documents`, icon: FileText, label: 'Documentos', exact: true },
    { href: `${companyBasePath}/results`, icon: ClipboardList, label: 'Resultados', exact: true },
  ] : []

function isActive(href: string, exact: boolean): boolean {
```

with:

```tsx
function isActive(href: string, exact: boolean): boolean {
```

- [ ] **Step 4: Remove the company nav render block**

Replace:

```tsx
            {/* Company context nav */}
            {companyNavItems.length > 0 && (
              <div className="pt-4">
                {/* Company name chip — back link */}
                <Link
                  href="/admin/companies"
                  className="flex items-center gap-1.5 px-3 mb-2 text-xs text-muted-foreground hover:text-indigo-600 transition-colors group"
                  onClick={() => setSidebarOpen(false)}
                >
                  <ChevronLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
                  Empresas
                </Link>
                <div className="px-3 mb-2">
                  <div className="flex items-center gap-2 py-1.5 px-2 bg-indigo-600 text-white rounded-lg">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold truncate">
                      {companyName ?? '…'}
                    </span>
                  </div>
                </div>
                {companyNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(item.href, item.exact)
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

          </nav>
```

with:

```tsx
          </nav>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/admin/layout.tsx`.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, log in, open a company.
Expected: sidebar shows only the main nav (Dashboard, Empresas, and role-specific items) — no company chip, no nested Visão Geral/Documentos/Resultados links. "Empresas" is highlighted as active (single, non-duplicated highlight) while browsing any `/admin/companies/*` route. All navigation between company sub-pages now happens exclusively through the Task 2 tab bar.

- [ ] **Step 7: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "refactor: remove sub-menu de empresa da sidebar (substituído pelas abas)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full end-to-end verification pass

**Files:** none (verification only, matches the spec's "Testes / verificação" section).

- [ ] **Step 1: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: clean, zero errors.

Run: `npm run build`
Expected: build succeeds (note: `ignoreBuildErrors: true` means this doesn't re-check types, but it does catch broken imports/syntax and confirms the app is deployable).

- [ ] **Step 2: Walk through the spec's verification scenarios**

Run: `npm run dev`, then, using dev login (`/login`, existing `admin_users` emails):

1. Log in as `super_admin`. Open a company with ≥2 involved areas, where at least one area has an admin with a completed evaluation and another with a pending one. Confirm: stats/progress bar correct, areas list groups people correctly, statuses correct.
2. Find (or temporarily create via `/admin/companies` → edit → "Áreas envolvidas") a company with an area that has no `area_admin` assigned. Confirm the "Nenhum admin de área cadastrado" message and the "Convidar administrador de área →" link to `/admin/users` (visible only as `super_admin`).
3. Log in as an `area_admin`. Navigate the 4 tabs (Visão Geral, Documentos, Resultados, Avaliar) on a company involving their area. Confirm the active tab highlights correctly and there is no working or broken link to `/admin/companies/:id/evaluators` anywhere (search page source / try the URL directly and confirm it 404s as expected, since that page is intentionally gone).
4. Confirm the sidebar shows no company sub-menu and no duplicated "active" highlight.
5. Resize the browser to a mobile width. Confirm the company header and tab bar remain visible/usable in the main content area without needing the (now closed) sidebar drawer.

- [ ] **Step 3: Report results**

If every check in Step 2 passes, the feature is complete — no further commit needed for this task (it's verification-only). If anything fails, fix it in the relevant task's file and re-run the typecheck + that specific scenario before moving on.
