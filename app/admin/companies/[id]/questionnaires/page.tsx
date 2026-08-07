'use client'

import { useState, use, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Trash2, GripVertical, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Question {
  id: string
  text: string
}

interface Questionnaire {
  id: string
  title: string
  description: string | null
}

export default function CompanyQuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: questionnaires = [], mutate: mutateList, isLoading } = useSWR<Questionnaire[]>(
    `/api/companies/${id}/questionnaires`,
    fetcher
  )
  const questsArray = Array.isArray(questionnaires) ? questionnaires : []
  const questionnaire = questsArray[0] ?? null

  const { data: questions = [], mutate: mutateQuestions } = useSWR<Question[]>(
    questionnaire ? `/api/companies/${id}/questionnaires/${questionnaire.id}/questions` : null,
    fetcher
  )
  const questionsArray = Array.isArray(questions) ? questions : []

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [newQuestionText, setNewQuestionText] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [loadingAddQ, setLoadingAddQ] = useState(false)
const newQRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (questionnaire) {
      setTitle(questionnaire.title)
      setDescription(questionnaire.description ?? '')
    }
  }, [questionnaire?.id])

  useEffect(() => {
    if (addingQuestion) newQRef.current?.focus()
  }, [addingQuestion])

  async function handleCreate() {
    if (!title.trim()) {
      toast.error('Digite um título para o questionário')
      return
    }
    setLoadingCreate(true)
    try {
      const res = await fetch(`/api/companies/${id}/questionnaires`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() })
      })
      if (res.ok) {
        mutateList()
        toast.success('Formulário criado!')
      }
    } catch { toast.error('Erro ao criar') }
    finally { setLoadingCreate(false) }
  }

  async function handleAddQuestion() {
    if (!newQuestionText.trim() || !questionnaire) return
    setLoadingAddQ(true)
    try {
      const res = await fetch(`/api/companies/${id}/questionnaires/${questionnaire.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newQuestionText.trim() })
      })
      if (res.ok) {
        mutateQuestions()
        setNewQuestionText('')
        setAddingQuestion(false)
        toast.success('Pergunta adicionada!')
      }
    } catch { toast.error('Erro ao adicionar') }
    finally { setLoadingAddQ(false) }
  }

  async function handleDeleteQuestion(qId: string) {
    if (!questionnaire) return
    try {
      await fetch(`/api/companies/${id}/questionnaires/${questionnaire.id}/questions/${qId}`, { method: 'DELETE' })
      mutateQuestions()
    } catch { toast.error('Erro') }
  }

  async function handleDeleteQuestionnaire() {
    if (!questionnaire) return
    if (!confirm('Excluir o formulário e todas as perguntas?')) return
    try {
      await fetch(`/api/companies/${id}/questionnaires/${questionnaire.id}`, { method: 'DELETE' })
      mutateList()
      setTitle('')
      setDescription('')
      toast.success('Formulário excluído')
    } catch { toast.error('Erro') }
  }

if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F0EBF8]">
      <Toaster richColors />

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          {questionnaire && (
            <button
              onClick={handleDeleteQuestionnaire}
              className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              Excluir formulário
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">

        {/* ── Cabeçalho do formulário ── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Barra colorida no topo */}
          <div className="h-2.5 bg-indigo-600 rounded-t-2xl" />
          <div className="p-6 space-y-3">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título do formulário"
              className="w-full text-2xl font-bold text-gray-900 placeholder-gray-300 border-b-2 border-transparent focus:border-indigo-500 focus:outline-none pb-1 transition-colors bg-transparent"
            />
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              className="w-full text-sm text-gray-500 placeholder-gray-300 border-b border-transparent focus:border-indigo-300 focus:outline-none pb-0.5 transition-colors bg-transparent"
            />
            {!questionnaire && (
              <button
                onClick={handleCreate}
                disabled={loadingCreate || !title.trim()}
                className="mt-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {loadingCreate ? 'Criando...' : 'Criar formulário'}
              </button>
            )}
          </div>
        </div>

        {/* ── Aviso de tipo de resposta ── */}
        {questionnaire && (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
            <Star className="h-4 w-4 shrink-0 fill-indigo-400 text-indigo-400" />
            Todas as perguntas usam escala de <strong className="mx-1">0 a 10</strong> — os avaliadores selecionam a nota ao responder.
          </div>
        )}

        {/* ── Perguntas ── */}
        {questionnaire && questionsArray.map((q, idx) => (
          <div
            key={q.id}
            className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-indigo-200 transition-all group"
          >
            <div className="flex items-start gap-3 p-5">
              <GripVertical className="h-4 w-4 text-gray-300 mt-1 shrink-0 cursor-grab" />
              <div className="flex-1 space-y-3">
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Pergunta {idx + 1}
                </p>
                <p className="text-base text-gray-900 leading-snug">{q.text}</p>
                {/* Preview da escala */}
                <div className="flex gap-1 pt-1">
                  {Array.from({ length: 11 }, (_, i) => i).map(n => (
                    <div
                      key={n}
                      className="flex-1 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-400"
                    >
                      {n}
                    </div>
                  ))}
                </div>
                <p className="flex items-center justify-between text-xs text-gray-400">
                  <span>← Discordo totalmente</span>
                  <span>Concordo totalmente →</span>
                </p>
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

        {/* ── Adicionar pergunta ── */}
        {questionnaire && (
          <>
            {addingQuestion ? (
              <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-400 p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Pergunta {questionsArray.length + 1}
                </p>
                <textarea
                  ref={newQRef}
                  value={newQuestionText}
                  onChange={e => setNewQuestionText(e.target.value)}
                  placeholder="Digite a pergunta aqui..."
                  rows={2}
                  className="w-full text-base text-gray-900 placeholder-gray-400 border-b-2 border-indigo-300 focus:border-indigo-500 focus:outline-none resize-none bg-transparent pb-1 transition-colors"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddQuestion()
                    }
                    if (e.key === 'Escape') {
                      setAddingQuestion(false)
                      setNewQuestionText('')
                    }
                  }}
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleAddQuestion}
                    disabled={loadingAddQ || !newQuestionText.trim()}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {loadingAddQ ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => { setAddingQuestion(false); setNewQuestionText('') }}
                    className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <span className="text-xs text-gray-400 ml-auto">Enter para salvar · Esc para cancelar</span>
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
          </>
        )}

        {/* ── Estado vazio quando não tem questionário ── */}
        {!questionnaire && !title && (
          <div className="text-center text-sm text-gray-400 py-4">
            Preencha o título acima e clique em "Criar formulário" para começar.
          </div>
        )}

      </div>
    </div>
  )
}
