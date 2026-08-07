'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface FormSummary {
  id: string
  title: string
  status: 'draft' | 'sent'
  total_recipients: number
  completed_count: number
}

export default function CompanyFormsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()

  const { data: forms, mutate } = useSWR<FormSummary[]>(`/api/companies/${id}/forms`, fetcher)
  const formsArray = Array.isArray(forms) ? forms : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/companies/${id}/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (res.ok) {
        const created = await res.json()
        mutate()
        setDialogOpen(false)
        setTitle('')
        router.push(`/admin/companies/${id}/forms/${created.id}`)
      } else {
        const d = await res.json()
        toast.error(d.error || 'Erro ao criar formulário')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground flex-1">{formsArray.length} formulário(s)</p>
        {user?.role === 'super_admin' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Criar Formulário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Formulário</DialogTitle>
                <DialogDescription>Dê um título — as perguntas e destinatários são definidos na próxima tela.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Avaliação 2026 - 1º semestre" autoFocus />
                <Button type="submit" className="w-full" disabled={creating || !title.trim()}>
                  {creating ? 'Criando...' : 'Criar e continuar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {formsArray.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum formulário criado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {formsArray.map(form => {
            const pct = form.total_recipients > 0 ? Math.round((form.completed_count / form.total_recipients) * 100) : 0
            return (
              <Link
                key={form.id}
                href={`/admin/companies/${id}/forms/${form.id}`}
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-indigo-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{form.title}</p>
                  {form.status === 'draft' ? (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Rascunho</span>
                  ) : (
                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Enviado</span>
                  )}
                </div>
                {form.status === 'sent' && form.total_recipients > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{form.completed_count} de {form.total_recipients} responderam</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
