'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const isDev = process.env.NODE_ENV !== 'production'

export default function LoginPage() {
  const [devEmail, setDevEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDevLogin(email: string) {
    if (!email.trim()) return
    setLoading(true)
    try {
      await signIn('dev-login', { email: email.trim(), callbackUrl: '/admin' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Avaliação 360</h1>
        <p className="text-gray-500 text-sm mb-8">
          Entre com sua conta Google cadastrada pelo administrador.
        </p>
        <Button
          className="w-full"
          onClick={() => signIn('google', { callbackUrl: '/admin' })}
        >
          Entrar com Google
        </Button>

        {isDev && (
          <div className="mt-8 pt-6 border-t border-dashed border-gray-200 text-left">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
              Login de desenvolvimento (só aparece fora de produção)
            </p>
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="email@cadastrado.com"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => handleDevLogin(devEmail)}
              >
                {loading ? 'Entrando...' : 'Entrar com esse email'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
