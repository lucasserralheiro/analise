'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  areaId: string | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const user: User | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        role: session.user.role,
        areaId: session.user.areaId,
      }
    : null

  async function logout() {
    await nextAuthSignOut({ redirect: false })
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading: status === 'loading', logout, isAdmin: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
