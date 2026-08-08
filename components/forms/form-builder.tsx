'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { RecipientPicker } from './recipient-picker'
import { QUESTION_TYPE_LABELS, type Question, type QuestionType, type FormDetail } from './question-types'

export function FormBuilder({ companyId, formId, detail, onSaved }: {
  companyId: string
  formId: string
  detail: FormDetail
  onSaved: () => void
}) {
  const [title, setTitle] = useState(detail.form.title)
  const [questions, setQuestions] = useState<Question[]>(detail.questions)
  const [recipientIds, setRecipientIds] = useState<string[]>(detail.recipients.map(r => r.admin_user_id))
  const [saving, setSaving] = useState<'draft' | 'sent' | null>(null)

  function addQuestion() {
    setQuestions(prev => [...prev, { type: 'score_0_10', text: '', options: [], allow_multiple: false, required: true }])
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...patch } : q))
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  async function save(nextStatus: 'draft' | 'sent') {
    if (!title.trim()) { toast.error('Digite um título para o formulário'); return }
    if (nextStatus === 'sent' && questions.length === 0) { toast.error('Adicione ao menos uma pergunta antes de enviar'); return }
    if (nextStatus === 'sent' && recipientIds.length === 0) { toast.error('Adicione ao menos um destinatário antes de enviar'); return }
    for (const q of questions) {
      if (!q.text.trim()) { toast.error('Toda pergunta precisa de um texto'); return }
      if (q.type === 'multiple_choice' && q.options.filter(o => o.trim()).length < 2) {
        toast.error('Perguntas de múltipla escolha precisam de ao menos 2 opções'); return
      }
    }

    setSaving(nextStatus)
    try {
      const qRes = await fetch(`/api/companies/${companyId}/forms/${formId}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.map(q => ({ ...q, options: q.options.filter(o => o.trim()) })) }),
      })
      if (!qRes.ok) { const d = await qRes.json(); toast.error(d.error || 'Erro ao salvar perguntas'); return }

      const rRes = await fetch(`/api/companies/${companyId}/forms/${formId}/recipients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_ids: recipientIds }),
      })
      if (!rRes.ok) { const d = await rRes.json(); toast.error(d.error || 'Erro ao salvar destinatários'); return }

      const fRes = await fetch(`/api/companies/${companyId}/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), status: nextStatus }),
      })
      if (!fRes.ok) { const d = await fRes.json(); toast.error(d.error || 'Erro ao salvar formulário'); return }

      toast.success(nextStatus === 'sent' ? 'Formulário enviado!' : 'Rascunho salvo!')
      onSaved()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do formulário" className="text-lg font-semibold" />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Perguntas</h2>
        {questions.map((q, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Select value={q.type} onValueChange={(v) => updateQuestion(index, { type: v as QuestionType })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t => (
                    <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => removeQuestion(index)} className="ml-auto text-gray-300 hover:text-red-500 p-1">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea
              value={q.text}
              onChange={e => updateQuestion(index, { text: e.target.value })}
              placeholder="Digite a pergunta..."
              rows={2}
            />
            {q.type === 'multiple_choice' && (
              <div className="space-y-2 pl-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={e => updateQuestion(index, { options: q.options.map((o, i) => i === oi ? e.target.value : o) })}
                      placeholder={`Opção ${oi + 1}`}
                    />
                    <button type="button" onClick={() => updateQuestion(index, { options: q.options.filter((_, i) => i !== oi) })} className="text-gray-300 hover:text-red-500 p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => updateQuestion(index, { options: [...q.options, ''] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar opção
                </Button>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <Checkbox checked={q.allow_multiple} onCheckedChange={(c) => updateQuestion(index, { allow_multiple: !!c })} />
                  Permitir mais de uma resposta
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Checkbox checked={q.required} onCheckedChange={(c) => updateQuestion(index, { required: !!c })} />
              Obrigatória
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={addQuestion}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all text-sm font-medium"
        >
          <Plus className="h-4 w-4" />Adicionar pergunta
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Destinatários</h2>
        <RecipientPicker recipientIds={recipientIds} onChange={setRecipientIds} />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => save('draft')} disabled={saving !== null}>
          {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
        </Button>
        <Button onClick={() => save('sent')} disabled={saving !== null}>
          {saving === 'sent' ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  )
}
