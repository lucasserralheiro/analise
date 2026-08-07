'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Question { id: string; text: string; order_index: number }

export default function MyQuestionnairePage() {
  const { user } = useAuth()
  const areaId = user?.areaId

  const { data: questions = [], mutate } = useSWR<Question[]>(
    areaId ? `/api/areas/${areaId}/questions` : null,
    fetcher
  )
  const questionsArray = Array.isArray(questions) ? questions : []

  const [newQuestionText, setNewQuestionText] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [loadingAddQ, setLoadingAddQ] = useState(false)
  const newQRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (addingQuestion) newQRef.current?.focus()
  }, [addingQuestion])

  async function handleAddQuestion() {
    if (!newQuestionText.trim() || !areaId) return
    setLoadingAddQ(true)
    try {
      const res = await fetch(`/api/areas/${areaId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newQuestionText.trim() }),
      })
      if (res.ok) {
        mutate()
        setNewQuestionText('')
        setAddingQuestion(false)
        toast.success('Pergunta adicionada!')
      }
    } catch { toast.error('Erro ao adicionar') }
    finally { setLoadingAddQ(false) }
  }

  async function handleDeleteQuestion(qId: string) {
    if (!areaId) return
    try {
      await fetch(`/api/areas/${areaId}/questions/${qId}`, { method: 'DELETE' })
      mutate()
    } catch { toast.error('Erro') }
  }

  if (!user) return null

  if (user.role === 'super_admin') {
    return <p className="text-muted-foreground">Super admin não tem área própria — edite o questionário de cada área em &quot;Áreas&quot;.</p>
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          Meu Questionário
        </h1>
        <p className="text-muted-foreground">
          Perguntas usadas pra avaliar qualquer empresa em que sua área esteja envolvida. Escala 0 a 10.
        </p>
      </div>

      {questionsArray.map((q, idx) => (
        <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-indigo-200 transition-all group">
          <div className="flex items-start gap-3 p-5">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pergunta {idx + 1}</p>
              <p className="text-base text-gray-900 leading-snug">{q.text}</p>
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

      {addingQuestion ? (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-400 p-5 space-y-3">
          <textarea
            ref={newQRef}
            value={newQuestionText}
            onChange={e => setNewQuestionText(e.target.value)}
            placeholder="Digite a pergunta aqui..."
            rows={2}
            className="w-full text-base text-gray-900 placeholder-gray-400 border-b-2 border-indigo-300 focus:border-indigo-500 focus:outline-none resize-none bg-transparent pb-1 transition-colors"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddQuestion() }
              if (e.key === 'Escape') { setAddingQuestion(false); setNewQuestionText('') }
            }}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleAddQuestion} disabled={loadingAddQ || !newQuestionText.trim()}>
              {loadingAddQ ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="ghost" onClick={() => { setAddingQuestion(false); setNewQuestionText('') }}>
              Cancelar
            </Button>
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
    </div>
  )
}
