import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

interface RosterPerson {
  admin_user_id: string
  name: string
  evaluation_status: 'not_started' | 'in_progress' | 'completed'
}

interface RosterArea {
  area_id: string
  area_name: string
  people: RosterPerson[]
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { id } = await params

    // Uma linha por (área envolvida, admin de área daquela área). Áreas sem
    // nenhum admin cadastrado ainda aparecem (LEFT JOIN), com admin_user_id
    // nulo. O status da avaliação vem de outro LEFT JOIN, pois o admin pode
    // ainda não ter iniciado (nenhuma linha em evaluations).
    const rows = await sql`
      SELECT
        a.id as area_id,
        a.name as area_name,
        a.order_index,
        u.id as admin_user_id,
        u.name as admin_name,
        e.status as evaluation_status
      FROM company_areas ca
      JOIN areas a ON a.id = ca.area_id
      LEFT JOIN admin_users u ON u.area_id = a.id AND u.role = 'area_admin'
      LEFT JOIN evaluations e
        ON e.company_id = ca.company_id AND e.area_id = a.id AND e.admin_user_id = u.id
      WHERE ca.company_id = ${id}
      ORDER BY a.order_index ASC, u.name ASC
    `

    const areasById = new Map<string, RosterArea>()

    for (const row of rows) {
      if (!areasById.has(row.area_id)) {
        areasById.set(row.area_id, { area_id: row.area_id, area_name: row.area_name, people: [] })
      }
      if (row.admin_user_id) {
        areasById.get(row.area_id)!.people.push({
          admin_user_id: row.admin_user_id,
          name: row.admin_name,
          evaluation_status: row.evaluation_status === 'completed' || row.evaluation_status === 'in_progress'
            ? row.evaluation_status
            : 'not_started',
        })
      }
    }

    return NextResponse.json(Array.from(areasById.values()))
  } catch (error) {
    console.error('Get company roster error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
