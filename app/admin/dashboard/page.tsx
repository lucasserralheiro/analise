'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Row {
  company_id: string; company_name: string
  form_id: string; form_title: string; form_status: 'draft' | 'sent'
  total_recipients: string; completed_count: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useSWR<Row[]>('/api/dashboard', fetcher)
  const rows = Array.isArray(data) ? data : []

  const grouped = rows.reduce<Record<string, { company_name: string; forms: Row[] }>>((acc, row) => {
    if (!acc[row.company_id]) acc[row.company_id] = { company_name: row.company_name, forms: [] }
    acc[row.company_id].forms.push(row)
    return acc
  }, {})

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin acessa o painel de acompanhamento.</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <BarChart3 className="h-6 w-6" />
        Painel de Acompanhamento
      </h1>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-muted-foreground">Nenhum formulário criado ainda.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([companyId, { company_name, forms }]) => (
            <div key={companyId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{company_name}</h2>
              <div className="space-y-2">
                {forms.map(form => {
                  const total = Number(form.total_recipients)
                  const completed = Number(form.completed_count)
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
                  return (
                    <Link
                      key={form.form_id}
                      href={`/admin/companies/${companyId}/forms/${form.form_id}`}
                      className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                    >
                      <span className="text-gray-700">{form.form_title}</span>
                      <span className="text-xs text-muted-foreground">
                        {form.form_status === 'draft' ? 'Rascunho' : `${completed}/${total} (${pct}%)`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
