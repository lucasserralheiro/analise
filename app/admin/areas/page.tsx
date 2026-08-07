'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Area {
  id: string
  name: string
  order_index: number
}

export default function AreasPage() {
  const { user } = useAuth()
  const { data: areas, mutate } = useSWR<Area[]>('/api/areas', fetcher)
  const areasArray = Array.isArray(areas) ? areas : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingArea, setEditingArea] = useState<Area | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  function openCreateDialog() {
    setEditingArea(null)
    setName('')
    setDialogOpen(true)
  }

  function openEditDialog(area: Area) {
    setEditingArea(area)
    setName(area.name)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const url = editingArea ? `/api/areas/${editingArea.id}` : '/api/areas'
      const method = editingArea ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        mutate()
        setDialogOpen(false)
        toast.success(editingArea ? 'Área atualizada!' : 'Área criada!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta área? Isso remove também o questionário dela.')) return
    try {
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        mutate()
        toast.success('Área excluída')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  if (user && user.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin pode gerenciar áreas.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Áreas
          </h1>
          <p className="text-muted-foreground">Catálogo de áreas que avaliam as empresas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Área
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingArea ? 'Editar Área' : 'Nova Área'}</DialogTitle>
              <DialogDescription>Ex: Infraestrutura, Arquitetura, Segurança.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome da Área *</FieldLabel>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Salvando...' : (editingArea ? 'Atualizar' : 'Criar Área')}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {areasArray.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma área cadastrada</h3>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Área
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {areasArray.map((area) => (
            <Card key={area.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{area.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(area)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(area.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
