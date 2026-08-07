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
  area_id: string; area_name: string
  total_area_admins: string; completed_count: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useSWR<Row[]>('/api/dashboard', fetcher)
  const rows = Array.isArray(data) ? data : []

  const grouped = rows.reduce<Record<string, { company_name: string; areas: Row[] }>>((acc, row) => {
    if (!acc[row.company_id]) acc[row.company_id] = { company_name: row.company_name, areas: [] }
    acc[row.company_id].areas.push(row)
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

      <div className="space-y-6">
        {Object.entries(grouped).map(([companyId, { company_name, areas }]) => (
          <div key={companyId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <Link href={`/admin/companies/${companyId}`} className="font-semibold text-lg hover:text-indigo-600">
              {company_name}
            </Link>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {areas.map(area => {
                const total = Number(area.total_area_admins)
                const done = Number(area.completed_count)
                const status = total === 0 ? 'sem-admin' : done === 0 ? 'nao-iniciado' : done < total ? 'andamento' : 'concluido'
                const colors: Record<string, string> = {
                  'sem-admin': 'bg-gray-100 text-gray-500 border-gray-200',
                  'nao-iniciado': 'bg-red-50 text-red-700 border-red-200',
                  'andamento': 'bg-amber-50 text-amber-700 border-amber-200',
                  'concluido': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                }
                return (
                  <div key={area.area_id} className={`rounded-lg border px-3 py-2 text-sm ${colors[status]}`}>
                    <p className="font-medium">{area.area_name}</p>
                    <p className="text-xs">{done}/{total} concluíram</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhuma empresa com áreas envolvidas ainda.</p>
        )}
      </div>
    </div>
  )
}
