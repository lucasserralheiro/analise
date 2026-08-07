import { auth } from '@/auth'

export interface CurrentAdmin {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  areaId: string | null
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role,
    areaId: session.user.areaId,
  }
}

export async function requireSuperAdmin(): Promise<CurrentAdmin | null> {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'super_admin') return null
  return admin
}

export async function requireAreaAccess(areaId: string): Promise<CurrentAdmin | null> {
  const admin = await getCurrentAdmin()
  if (!admin) return null
  if (admin.role === 'super_admin') return admin
  if (admin.role === 'area_admin' && admin.areaId === areaId) return admin
  return null
}
