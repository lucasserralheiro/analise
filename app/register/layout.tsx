'use client'

import { AuthProvider } from '@/components/auth-context'
import { ReactNode } from 'react'

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
