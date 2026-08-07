'use client'

import { AuthProvider } from '@/components/auth-context'
import { ReactNode } from 'react'

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
