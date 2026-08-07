'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
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
      </div>
    </div>
  )
}
