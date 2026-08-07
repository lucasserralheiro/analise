'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface AiSettings { instructions: string }

export default function AiSettingsPage() {
  const { user } = useAuth()
  const { data, mutate } = useSWR<AiSettings>('/api/ai-settings', fetcher)
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (data) setInstructions(data.instructions)
  }, [data])

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      })
      if (res.ok) {
        mutate()
        toast.success('Instruções salvas!')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } finally {
      setLoading(false)
    }
  }

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin configura as instruções de IA.</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <Sparkles className="h-6 w-6" />
        Configurações de IA
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Instruções para a IA</CardTitle>
          <CardDescription>
            Esse texto é enviado em toda geração de parecer (por área e geral) — ajuste o tom, os critérios a priorizar, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={8}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y"
          />
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
