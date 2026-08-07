'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, FileText, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from 'sonner'

interface Question {
  id: string
  text: string
  order: number
}

interface Evaluator {
  id: string
  name: string
  sector: string | null
  position: string | null
}

interface Company {
  id: string
  name: string
  description: string | null
}

interface Document {
  id: string
  title: string
  file_url: string
}

interface Answer {
  question_id: string
  score: number
  comment: string
}

const SCORE_COLORS: Record<number, string> = {
  0: 'bg-red-600 text-white scale-110 shadow',
  1: 'bg-red-500 text-white scale-110 shadow',
  2: 'bg-red-400 text-white scale-110 shadow',
  3: 'bg-orange-500 text-white scale-110 shadow',
  4: 'bg-orange-400 text-white scale-110 shadow',
  5: 'bg-amber-400 text-white scale-110 shadow',
  6: 'bg-yellow-400 text-gray-900 scale-110 shadow',
  7: 'bg-lime-500 text-white scale-110 shadow',
  8: 'bg-green-500 text-white scale-110 shadow',
  9: 'bg-green-600 text-white scale-110 shadow',
  10: 'bg-emerald-600 text-white scale-110 shadow',
}

export default function EvaluationFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()

  const [evaluator, setEvaluator] = useState<Evaluator | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})

  useEffect(() => {
    fetchData()
  }, [token])

  async function fetchData() {
    try {
      const res = await fetch(`/api/evaluator/${token}`)
      const data = await res.json()

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (res.status === 409) {
        setAlreadyCompleted(true)
        return
      }

      if (!res.ok) {
        setError(data.error || 'Avaliação não encontrada')
        return
      }

      setEvaluator(data.evaluator)
      setCompany(data.company)
      setDocuments(data.documents || [])
      setQuestions(data.questions || [])

      const initial: Record<string, Answer> = {}
      data.questions?.forEach((q: Question) => {
        initial[q.id] = { question_id: q.id, score: -1, comment: '' }
      })
      setAnswers(initial)
    } catch {
      setError('Erro ao carregar avaliação')
    } finally {
      setLoading(false)
    }
  }

  function updateScore(questionId: string, score: number) {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], score } }))
  }

  function updateComment(questionId: string, comment: string) {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], comment } }))
  }

  const answeredCount = Object.values(answers).filter(a => a.score >= 0).length
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0

  async function handleSubmit() {
    const unanswered = questions.filter(q => answers[q.id]?.score < 0)
    if (unanswered.length > 0) {
      toast.error(`Responda todas as perguntas (${unanswered.length} pendentes)`)
      // Scroll to first unanswered
      const el = document.getElementById(`question-${unanswered[0].id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/evaluator/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Object.values(answers) }),
      })

      if (res.ok) {
        setSubmitted(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao enviar avaliação')
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Carregando avaliação...</p>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Avaliação não encontrada</h2>
          <p className="text-gray-500 text-sm">{error}</p>
          <button
            onClick={() => router.push('/avaliar')}
            className="mt-6 text-sm text-indigo-600 hover:underline"
          >
            ← Voltar ao painel
          </button>
        </div>
      </div>
    )
  }

  /* ── Already completed ── */
  if (alreadyCompleted) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm border border-gray-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Avaliação Concluída</h2>
          <p className="text-gray-500 text-sm">Esta avaliação já foi respondida. Obrigado pela sua participação!</p>
          <button
            onClick={() => router.push('/avaliar')}
            className="mt-6 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Ver minhas avaliações
          </button>
        </div>
      </div>
    )
  }

  /* ── Success ── */
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
        <Toaster richColors />
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm border border-gray-100">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Avaliação Enviada!</h2>
          <p className="text-gray-500 mb-1">
            Obrigado, <strong className="text-gray-700">{evaluator?.name}</strong>.
          </p>
          <p className="text-gray-400 text-sm">Suas respostas foram registradas com sucesso.</p>
          {(evaluator?.sector || company?.name) && (
            <div className="mt-6 py-3 px-5 bg-indigo-50 rounded-xl text-indigo-700 text-sm font-medium">
              {company?.name}
              {evaluator?.sector && <span className="text-indigo-400 mx-2">·</span>}
              {evaluator?.sector}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!company) return null

  /* ── Main Form ── */
  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Toaster richColors />

      {/* Sticky progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-[680px] mx-auto px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
            {answeredCount}/{questions.length}
          </span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-indigo-600 shrink-0 tabular-nums w-8 text-right">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-4 pt-14 pb-16 space-y-3">

        {/* ── Company Header Card ── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="h-2.5 bg-indigo-600" />
          <div className="p-7">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-indigo-50 rounded-xl shrink-0">
                <Building2 className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{company.name}</h1>
                {company.description && (
                  <p className="text-gray-500 mt-1.5 text-sm leading-relaxed">{company.description}</p>
                )}
              </div>
            </div>

            {/* Evaluator identity */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Avaliador</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{evaluator?.name}</span>
                {evaluator?.sector && (
                  <span className="inline-flex items-center bg-indigo-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                    {evaluator.sector}
                  </span>
                )}
                {evaluator?.position && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                    {evaluator.position}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Documents Card ── */}
        {documents.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowDocs(v => !v)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 text-sm">Documentos para consulta</span>
                  <span className="ml-2 text-xs text-gray-400">{documents.length} arquivo(s)</span>
                </div>
              </div>
              {showDocs
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />
              }
            </button>
            {showDocs && (
              <div className="px-5 pb-5 space-y-2 border-t border-gray-100 pt-3">
                {documents.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-indigo-50 rounded-xl transition-colors group"
                  >
                    <FileText className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                    <span className="text-sm text-gray-700 group-hover:text-indigo-700 flex-1">{doc.title}</span>
                    <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Abrir →
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Instruction card ── */}
        {questions.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
            <p className="text-sm text-indigo-700 leading-relaxed">
              Para cada afirmação abaixo, atribua uma nota de <strong>0 a 10</strong> — onde{' '}
              <strong>0</strong> significa "discordo totalmente" e{' '}
              <strong>10</strong> significa "concordo totalmente". Todos os campos são obrigatórios.
            </p>
          </div>
        )}

        {/* ── No questions ── */}
        {questions.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Questionário não configurado</h3>
            <p className="text-gray-500 text-sm">
              Este formulário ainda não possui perguntas. Contate o administrador.
            </p>
          </div>
        )}

        {/* ── Question Cards ── */}
        {questions.map((question, index) => {
          const answer = answers[question.id]
          const isAnswered = answer?.score >= 0

          return (
            <div
              id={`question-${question.id}`}
              key={question.id}
              className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-200 ${
                isAnswered ? 'border-indigo-200' : 'border-gray-100'
              }`}
            >
              {isAnswered && <div className="h-0.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />}
              <div className="p-6">
                {/* Question text */}
                <div className="flex gap-3 mb-5">
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isAnswered ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {index + 1}
                  </span>
                  <p className="text-gray-900 font-medium leading-relaxed pt-0.5">
                    {question.text}
                    <span className="text-red-500 ml-1 font-normal">*</span>
                  </p>
                </div>

                {/* Scale legend */}
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2 px-0.5">
                  <span>← Discordo</span>
                  <span>Concordo →</span>
                </div>

                {/* Score buttons 0–10 */}
                <div className="flex gap-1">
                  {Array.from({ length: 11 }, (_, i) => i).map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => updateScore(question.id, num)}
                      className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 ${
                        answer?.score === num
                          ? SCORE_COLORS[num]
                          : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {/* Score label */}
                {isAnswered && (
                  <p className={`mt-2 text-xs font-medium text-center transition-all ${
                    answer.score <= 4 ? 'text-red-500' :
                    answer.score <= 6 ? 'text-amber-500' :
                    'text-green-600'
                  }`}>
                    {answer.score <= 2 ? 'Discordo totalmente' :
                     answer.score <= 4 ? 'Discordo' :
                     answer.score === 5 ? 'Neutro' :
                     answer.score <= 7 ? 'Concordo parcialmente' :
                     answer.score <= 9 ? 'Concordo' :
                     'Concordo totalmente'}
                    {' '}({answer.score}/10)
                  </p>
                )}

                {/* Comment (visible after scoring) */}
                {isAnswered && (
                  <div className="mt-4">
                    <textarea
                      placeholder="Comentário opcional — explique ou adicione contexto à sua nota..."
                      value={answer.comment}
                      onChange={e => updateComment(question.id, e.target.value)}
                      rows={2}
                      className="w-full text-sm text-gray-700 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* ── Submit Card ── */}
        {questions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                {answeredCount === questions.length ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Todas as perguntas respondidas!</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-700">{questions.length - answeredCount}</span>{' '}
                    {questions.length - answeredCount === 1 ? 'pergunta pendente' : 'perguntas pendentes'}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Você pode revisar as respostas antes de enviar.
                </p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || answeredCount < questions.length}
                className="shrink-0 px-7 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-150 text-sm shadow-sm"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </span>
                ) : 'Enviar Avaliação'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pt-2">
          Sistema de Avaliação 360 · Suas respostas são confidenciais
        </p>
      </div>
    </div>
  )
}
