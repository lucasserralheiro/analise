'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { RecipientPicker } from './recipient-picker'
import type { FormDetail } from './question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export function FormTracking({ companyId, formId, detail, currentUserId, isSuperAdmin, onChanged }: {
  companyId: string
  formId: string
  detail: FormDetail
  currentUserId: string | undefined
  isSuperAdmin: boolean
  onChanged: () => void
}) {
  const [editingRecipients, setEditingRecipients] = useState(false)
  const [recipientIds, setRecipientIds] = useState<string[]>(detail.recipients.map(r => r.admin_user_id))
  const [savingRecipients, setSavingRecipients] = useState(false)
  const [generating, setGenerating] = useState(false)

  const { data: aiData, mutate: mutateAi } = useSWR<{ analysis: { id: string; content: string; created_at: string; created_by_name: string } | null }>(
    `/api/companies/${companyId}/forms/${formId}/ai`, fetcher
  )

  const myRecipient = detail.recipients.find(r => r.admin_user_id === currentUserId)
  const canGenerate = isSuperAdmin || !!myRecipient

  async function generateAnalysis() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/forms/${formId}/ai`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        mutateAi()
      } else {
        toast.error(data.error || 'Erro ao gerar parecer')
      }
    } finally {
      setGenerating(false)
    }
  }

  async function saveRecipients() {
    setSavingRecipients(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/forms/${formId}/recipients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_ids: recipientIds }),
      })
      if (res.ok) {
        toast.success('Destinatários atualizados!')
        setEditingRecipients(false)
        onChanged()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Erro ao salvar')
      }
    } finally {
      setSavingRecipients(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{detail.form.title}</h1>
        <p className="text-xs text-muted-foreground">
          Enviado {detail.form.sent_at ? new Date(detail.form.sent_at).toLocaleDateString('pt-BR') : ''}
        </p>
      </div>

      {myRecipient && myRecipient.response_status !== 'completed' && (
        <Link
          href={`/admin/companies/${companyId}/forms/${formId}/respond`}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          Responder este formulário →
        </Link>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Destinatários</h2>
          {isSuperAdmin && !editingRecipients && (
            <button type="button" onClick={() => setEditingRecipients(true)} className="text-xs font-semibold text-indigo-600 hover:underline">
              Editar destinatários
            </button>
          )}
        </div>

        {editingRecipients ? (
          <div className="space-y-3">
            <RecipientPicker recipientIds={recipientIds} onChange={setRecipientIds} />
            <div className="flex items-center gap-3">
              <Button onClick={saveRecipients} disabled={savingRecipients}>
                {savingRecipients ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingRecipients(false); setRecipientIds(detail.recipients.map(r => r.admin_user_id)) }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {detail.recipients.map(r => (
              <div key={r.admin_user_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`h-1 ${r.response_status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    r.response_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                    {r.area_name && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{r.area_name}</span>}
                  </div>
                  {r.response_status === 'completed' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Respondido
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full shrink-0 border border-amber-200">
                      <Clock className="h-3 w-3" /> Pendente
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4" />Parecer da IA
          </h2>
          {canGenerate && (
            <Button size="sm" onClick={generateAnalysis} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {generating ? 'Gerando...' : aiData?.analysis ? 'Regerar' : 'Gerar parecer'}
            </Button>
          )}
        </div>
        {aiData?.analysis ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiData.analysis.content}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum parecer gerado ainda.</p>
        )}
      </div>
    </div>
  )
}
