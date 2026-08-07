import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { sql } from '@/lib/db'

// Login de desenvolvimento — só ativo fora de produção. Deixa entrar com o
// email de qualquer admin_user já cadastrado, sem precisar configurar o
// Google OAuth. Nunca habilitado quando NODE_ENV === 'production'.
const devCredentialsProvider = Credentials({
  id: 'dev-login',
  name: 'Login de desenvolvimento',
  credentials: {
    email: { label: 'Email', type: 'email' },
  },
  async authorize(credentials) {
    const email = credentials?.email as string | undefined
    if (!email) return null
    const rows = await sql`SELECT id, name, email FROM admin_users WHERE email = ${email}`
    if (rows.length === 0) return null
    return { id: rows[0].id, name: rows[0].name, email: rows[0].email }
  },
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: process.env.NODE_ENV === 'production' ? [Google] : [Google, devCredentialsProvider],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      const rows = await sql`SELECT id FROM admin_users WHERE email = ${user.email}`
      return rows.length > 0
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const rows = await sql`
          SELECT id, name, role, area_id
          FROM admin_users
          WHERE email = ${user.email}
        `
        if (rows.length > 0) {
          token.adminId = rows[0].id
          token.role = rows[0].role
          token.areaId = rows[0].area_id
          token.name = rows[0].name
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.adminId as string
        session.user.role = token.role as 'super_admin' | 'area_admin'
        session.user.areaId = (token.areaId as string | null) ?? null
        session.user.name = (token.name as string) ?? session.user.name ?? ''
      }
      return session
    },
  },
})
