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
