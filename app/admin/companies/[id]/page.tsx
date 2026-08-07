'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2, CheckCircle2, Clock, UserPlus } from 'lucide-react'

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

interface Evaluator {
  id: string
  name: string
  sector: string | null
  position: string | null
  status: string
}

export default function CompanyHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: company } = useSWR<Company>(`/api/companies/${id}`, fetcher)
  const { data: evaluatorsRaw } = useSWR<Evaluator[]>(`/api/companies/${id}/evaluators`, fetcher)
  const evaluators = Array.isArray(evaluatorsRaw) ? evaluatorsRaw : []

  const total = evaluators.length
  const completed = evaluators.filter(e => e.status === 'COMPLETED').length
  const pending = total - completed
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  if (!company) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Avaliadores</p>
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

      {/* Avaliadores — ticket list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            Avaliadores
          </h2>
          <Link
            href={`/admin/companies/${id}/evaluators`}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Gerenciar
          </Link>
        </div>

        {evaluators.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">Nenhum avaliador cadastrado ainda.</p>
            <Link
              href={`/admin/companies/${id}/evaluators`}
              className="text-sm font-semibold text-indigo-600 hover:underline"
            >
              Adicionar avaliadores →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {evaluators.map(ev => (
              <div
                key={ev.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className={`h-1 ${ev.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    ev.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {ev.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ev.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ev.sector && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                          {ev.sector}
                        </span>
                      )}
                      {ev.position && (
                        <span className="text-xs text-muted-foreground">{ev.position}</span>
                      )}
                    </div>
                  </div>
                  {ev.status === 'COMPLETED' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Respondida
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
    </div>
  )
}
