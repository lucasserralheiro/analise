import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'super_admin' | 'area_admin'
      areaId: string | null
    } & DefaultSession['user']
  }
}
