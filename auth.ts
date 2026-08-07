import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { sql } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
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
