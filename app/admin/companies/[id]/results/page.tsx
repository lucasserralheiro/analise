'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'

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
  const { user } = useAuth()

  const { data: evaluations } = useSWR<EvaluationRow[]>(`/api/companies/${companyId}/evaluations`, fetcher)
  const evaluationsArray = Array.isArray(evaluations) ? evaluations : []

  const [openId, setOpenId] = useState<string | null>(null)
  const { data: detail } = useSWR<EvaluationDetail>(
    openId ? `/api/companies/${companyId}/evaluations/${openId}` : null,
    fetcher
  )

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

  const grouped = evaluationsArray.reduce<Record<string, EvaluationRow[]>>((acc, ev) => {
    (acc[ev.area_name] ||= []).push(ev)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

      {Object.entries(grouped).map(([areaName, evals]) => (
        <div key={areaName}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{areaName}</h2>
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
                          {answer?.comment && <p className="text-gray-400 italic">&quot;{answer.comment}&quot;</p>}
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
