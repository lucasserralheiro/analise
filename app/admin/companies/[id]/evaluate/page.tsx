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
