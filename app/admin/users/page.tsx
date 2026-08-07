'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-context'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Area { id: string; name: string }
interface AdminUserRow {
  id: string; name: string; email: string
  role: 'super_admin' | 'area_admin'; area_id: string | null; area_name: string | null
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const { data: users, mutate } = useSWR<AdminUserRow[]>('/api/admin-users', fetcher)
  const { data: areas } = useSWR<Area[]>('/api/areas', fetcher)
  const usersArray = Array.isArray(users) ? users : []
  const areasArray = Array.isArray(areas) ? areas : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'area_admin' as 'super_admin' | 'area_admin', area_id: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        mutate()
        setForm({ name: '', email: '', role: 'area_admin', area_id: '' })
        setDialogOpen(false)
        toast.success('Usuário convidado!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao convidar')
      }
    } catch {
      toast.error('Erro ao convidar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este usuário?')) return
    try {
      const res = await fetch(`/api/admin-users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        mutate()
        toast.success('Removido')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao remover')
      }
    } catch {
      toast.error('Erro ao remover')
    }
  }

  if (me && me.role !== 'super_admin') {
    return <p className="text-muted-foreground">Só o super admin pode gerenciar usuários.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6" />
            Usuários
          </h1>
          <p className="text-muted-foreground">Quem pode entrar com Google e o que cada um administra</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Convidar Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Usuário</DialogTitle>
              <DialogDescription>Cadastre o email do Google da pessoa — ela poderá entrar assim que fizer login.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome *</FieldLabel>
                  <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} required />
                </Field>
                <Field>
                  <FieldLabel>Email do Google *</FieldLabel>
                  <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} required />
                </Field>
                <Field>
                  <FieldLabel>Papel *</FieldLabel>
                  <Select value={form.role} onValueChange={(v) => setForm(p => ({ ...p, role: v as 'super_admin' | 'area_admin' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area_admin">Admin de Área</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.role === 'area_admin' && (
                  <Field>
                    <FieldLabel>Área *</FieldLabel>
                    <Select value={form.area_id} onValueChange={(v) => setForm(p => ({ ...p, area_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Escolha a área" /></SelectTrigger>
                      <SelectContent>
                        {areasArray.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Convidando...' : 'Convidar'}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {usersArray.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">{u.name}</CardTitle>
                <CardDescription>
                  {u.email} · {u.role === 'super_admin' ? 'Super Admin' : `Admin de ${u.area_name ?? '—'}`}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(u.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
