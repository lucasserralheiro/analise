'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useAuth } from '@/components/auth-context'
import { CheckCircle2, Clock, ChevronRight, ClipboardCheck, AlertCircle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface EvaluatorAssignment {
  id: string
  company_id: string
  name: string
  sector: string | null
  position: string | null
  status: string
  token: string
  company_name: string
  company_description: string | null
}

export default function UserDashboardPage() {
  const { user } = useAuth()
  const { data: assignments, isLoading } = useSWR<EvaluatorAssignment[]>('/api/user/assignments', fetcher)
  const assignmentsArray = Array.isArray(assignments) ? assignments : []

  const pending = assignmentsArray.filter(a => a.status !== 'COMPLETED')
  const completed = assignmentsArray.filter(a => a.status === 'COMPLETED')

  const totalCount = assignmentsArray.length
  const completedCount = completed.length

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Saudação */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Olá, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aqui estão suas análises atribuídas.</p>
      </div>

      {/* Barra de progresso geral */}
      {totalCount > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Progresso geral</span>
            <span className="text-sm font-semibold text-indigo-600">
              {completedCount}/{totalCount} concluídas
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {assignmentsArray.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardCheck className="h-7 w-7 text-indigo-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma análise atribuída</h3>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Quando você for adicionado como avaliador, suas análises aparecerão aqui.
          </p>
        </div>
      )}

      {/* Pendentes */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Aguardando resposta · {pending.length}
            </h2>
          </div>
          <div className="space-y-2.5">
            {pending.map((a) => (
              <Link key={a.id} href={`/avaliar/${a.token}`} className="block group">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all duration-150 overflow-hidden">
                  {/* Topo colorido como um chamado em aberto */}
                  <div className="h-1 bg-amber-400" />
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Ícone do setor */}
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-amber-500" />
                    </div>
                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">
                        Análise · {a.sector ?? 'Geral'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{a.company_name}</p>
                    </div>
                    {/* Status + seta */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        Pendente
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Concluídas */}
      {completed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Respondidas · {completed.length}
            </h2>
          </div>
          <div className="space-y-2.5">
            {completed.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden opacity-70">
                <div className="h-1 bg-emerald-400" />
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-700 text-sm leading-tight">
                      Análise · {a.sector ?? 'Geral'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{a.company_name}</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
                    Respondida ✓
  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
