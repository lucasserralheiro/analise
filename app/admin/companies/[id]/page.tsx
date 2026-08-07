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
