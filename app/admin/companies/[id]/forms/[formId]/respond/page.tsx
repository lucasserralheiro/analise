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
