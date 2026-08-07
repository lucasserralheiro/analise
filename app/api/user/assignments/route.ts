import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // If admin, return nothing for this endpoint (admins use /admin)
    if (user.role === 'admin') {
      return NextResponse.json([])
    }

    // Get evaluator assignments by user email or name
    // The user is linked via the evaluator record
    const assignments = await sql`
      SELECT 
        e.id,
        e.company_id,
        e.name,
        e.sector,
        e.position,
        e.status,
        e.token,
        c.name as company_name,
        c.description as company_description
      FROM company_evaluators e
      JOIN companies c ON e.company_id = c.id
      WHERE e.email = ${user.email} OR e.name = ${user.name}
      ORDER BY e.created_at DESC
    `

    return NextResponse.json(assignments)
  } catch (error) {
    console.error('Get user assignments error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}