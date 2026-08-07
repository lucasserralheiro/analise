'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import type { AdminUserOption, AreaOption } from './question-types'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

export function RecipientPicker({ recipientIds, onChange }: {
  recipientIds: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: allUsers } = useSWR<AdminUserOption[]>('/api/admin-users', fetcher)
  const { data: areas } = useSWR<AreaOption[]>('/api/areas', fetcher)
  const usersArray = Array.isArray(allUsers) ? allUsers : []
  const areasArray = Array.isArray(areas) ? areas : []
  const [personQuery, setPersonQuery] = useState('')

  const matchingUsers = personQuery.trim()
    ? usersArray.filter(u =>
        !recipientIds.includes(u.id) &&
        (u.name.toLowerCase().includes(personQuery.toLowerCase()) || u.email.toLowerCase().includes(personQuery.toLowerCase()))
      ).slice(0, 6)
    : []

  function toggleArea(areaId: string, checked: boolean) {
    const areaUserIds = usersArray.filter(u => u.area_id === areaId).map(u => u.id)
    onChange(checked
      ? Array.from(new Set([...recipientIds, ...areaUserIds]))
      : recipientIds.filter(id => !areaUserIds.includes(id))
    )
  }

  function isAreaFullySelected(areaId: string) {
    const areaUserIds = usersArray.filter(u => u.area_id === areaId).map(u => u.id)
    return areaUserIds.length > 0 && areaUserIds.every(id => recipientIds.includes(id))
  }

  function addPerson(userId: string) {
    if (!recipientIds.includes(userId)) onChange([...recipientIds, userId])
    setPersonQuery('')
  }

  function removeRecipient(userId: string) {
    onChange(recipientIds.filter(id => id !== userId))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Departamentos</p>
        <div className="space-y-2">
          {areasArray.map(area => (
            <label key={area.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={isAreaFullySelected(area.id)} onCheckedChange={(c) => toggleArea(area.id, !!c)} />
              {area.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Pessoas específicas</p>
        <Input value={personQuery} onChange={e => setPersonQuery(e.target.value)} placeholder="Buscar por nome ou email..." />
        {matchingUsers.length > 0 && (
          <div className="mt-2 border rounded-lg divide-y">
            {matchingUsers.map(u => (
              <button key={u.id} type="button" onClick={() => addPerson(u.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                {u.name} <span className="text-muted-foreground">— {u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">{recipientIds.length} destinatário(s) selecionado(s)</p>
        <div className="space-y-1.5">
          {recipientIds.map(id => {
            const u = usersArray.find(u => u.id === id)
            if (!u) return null
            return (
              <div key={id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                <span>{u.name} {u.area_name && <span className="text-muted-foreground">({u.area_name})</span>}</span>
                <button type="button" onClick={() => removeRecipient(id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
