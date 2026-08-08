'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'

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

export default function CompanyHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: formsRaw } = useSWR<FormSummary[]>(`/api/companies/${id}/forms`, fetcher)
  const forms = Array.isArray(formsRaw) ? formsRaw : []
  const sentForms = forms.filter(f => f.status === 'sent')

  const totalRecipients = sentForms.reduce((sum, f) => sum + f.total_recipients, 0)
  const totalCompleted = sentForms.reduce((sum, f) => sum + f.completed_count, 0)
  const pct = totalRecipients > 0 ? Math.round((totalCompleted / totalRecipients) * 100) : 0

  if (!formsRaw) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{totalRecipients}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Respostas esperadas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{totalCompleted}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Concluídas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{totalRecipients - totalCompleted}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Pendentes</p>
        </div>
      </div>

      {totalRecipients > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-medium text-gray-700">Progresso</span>
            <span className="font-bold text-indigo-600">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Formulários</h2>
          <Link href={`/admin/companies/${id}/forms`} className="text-xs font-semibold text-indigo-600 hover:underline">
            Ver todos →
          </Link>
        </div>

        {forms.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum formulário criado ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {forms.slice(0, 3).map(form => {
              const formPct = form.total_recipients > 0 ? Math.round((form.completed_count / form.total_recipients) * 100) : 0
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
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${formPct}%` }} />
                      </div>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
