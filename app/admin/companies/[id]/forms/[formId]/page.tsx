'use client'

import { use } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/components/auth-context'
import { FormBuilder } from '@/components/forms/form-builder'
import { FormTracking } from '@/components/forms/form-tracking'
import type { FormDetail } from '@/components/forms/question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export default function FormDetailPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id: companyId, formId } = use(params)
  const { user } = useAuth()

  const { data, mutate, error } = useSWR<FormDetail>(`/api/companies/${companyId}/forms/${formId}`, fetcher)

  if (error) {
    return <p className="text-muted-foreground">Você não tem acesso a este formulário.</p>
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (data.form.status === 'draft') {
    if (user?.role !== 'super_admin') {
      return <p className="text-muted-foreground">Este formulário ainda é um rascunho — só o super admin pode vê-lo.</p>
    }
    return <FormBuilder companyId={companyId} formId={formId} detail={data} onSaved={() => mutate()} />
  }

  return (
    <FormTracking
      companyId={companyId}
      formId={formId}
      detail={data}
      currentUserId={user?.id}
      isSuperAdmin={user?.role === 'super_admin'}
      onChanged={() => mutate()}
    />
  )
}
