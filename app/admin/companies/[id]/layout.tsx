'use client'

import { ReactNode, use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Company {
  id: string
  name: string
  cnpj: string | null
  description: string | null
}

export default function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const pathname = usePathname()

  const { data: company } = useSWR<Company>(`/api/companies/${id}`, fetcher)

  const tabs = [
    { href: `/admin/companies/${id}`, label: 'Visão Geral' },
    { href: `/admin/companies/${id}/documents`, label: 'Documentos' },
    { href: `/admin/companies/${id}/forms`, label: 'Formulários' },
  ]

  if (!company) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{company.name}</h1>
            {company.cnpj && (
              <p className="text-xs text-muted-foreground">CNPJ: {company.cnpj}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
