'use client'

import { ReactNode, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { AuthProvider, useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import {
  Building2, Users, FileText, BarChart3, LogOut, Menu, X,
  Home, ClipboardList, ChevronLeft
} from 'lucide-react'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null)

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const { user, loading, logout, isAdmin } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !isAdmin) router.push('/avaliar')
  }, [user, loading, router, isAdmin])

  // Garante colunas necessárias no banco (roda 1× por sessão de admin)
  useEffect(() => {
    if (user && isAdmin) {
      fetch('/api/migrate', { method: 'POST' }).catch(() => {})
    }
  }, [user, isAdmin])

  // Extrai base da empresa: /admin/companies/[id]
  const companyBaseMatch = pathname.match(/^(\/admin\/companies\/([^/]+))/)
  const companyBasePath = companyBaseMatch ? companyBaseMatch[1] : null
  const companyId = companyBaseMatch ? companyBaseMatch[2] : null
  const isInCompany = !!companyBasePath && pathname !== '/admin/companies'

  // Busca nome da empresa quando estiver dentro de uma empresa
  const { data: companyData } = useSWR(
    companyId ? `/api/companies/${companyId}` : null,
    fetcher
  )
  const companyName = companyData?.name ?? null

const navItems = [
    { href: '/admin', icon: Home, label: 'Dashboard', exact: true },
    { href: '/admin/companies', icon: Building2, label: 'Empresas', exact: false },
  ]

  const companyNavItems = isInCompany && companyBasePath ? [
    { href: companyBasePath, icon: BarChart3, label: 'Visão Geral', exact: true },
    { href: `${companyBasePath}/evaluators`, icon: Users, label: 'Avaliadores', exact: true },
    { href: `${companyBasePath}/documents`, icon: FileText, label: 'Documentos', exact: true },
    { href: `${companyBasePath}/questionnaires`, icon: ClipboardList, label: 'Questionários', exact: true },
  ] : []

function isActive(href: string, exact: boolean): boolean {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-card border-r border-border
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">

          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <Link href="/admin" className="font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              Avaliação 360
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">

            {/* Main nav */}
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(item.href, item.exact)
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}

            {/* Company context nav */}
            {companyNavItems.length > 0 && (
              <div className="pt-4">
                {/* Company name chip — back link */}
                <Link
                  href="/admin/companies"
                  className="flex items-center gap-1.5 px-3 mb-2 text-xs text-muted-foreground hover:text-indigo-600 transition-colors group"
                  onClick={() => setSidebarOpen(false)}
                >
                  <ChevronLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
                  Empresas
                </Link>
                <div className="px-3 mb-2">
                  <div className="flex items-center gap-2 py-1.5 px-2 bg-indigo-600 text-white rounded-lg">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold truncate">
                      {companyName ?? '…'}
                    </span>
                  </div>
                </div>
                {companyNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(item.href, item.exact)
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-indigo-700">
                  {user.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight">{user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {user.role === 'admin' ? 'Administrador' : 'Avaliador'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-background border-b border-border p-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AuthProvider>
  )
}
