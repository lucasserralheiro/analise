import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/session'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id: companyId } = await params

  const areaAnalyses = await sql`
    SELECT DISTINCT ON (a.area_id) a.id, a.area_id, ar.name as area_name, a.content, a.created_at, u.name as created_by_name
    FROM ai_area_analyses a
    JOIN areas ar ON ar.id = a.area_id
    JOIN admin_users u ON u.id = a.created_by
    WHERE a.company_id = ${companyId}
    ORDER BY a.area_id, a.created_at DESC
  `

  const overallAnalyses = await sql`
    SELECT o.id, o.content, o.created_at, u.name as created_by_name
    FROM ai_overall_analyses o
    JOIN admin_users u ON u.id = o.created_by
    WHERE o.company_id = ${companyId}
    ORDER BY o.created_at DESC
    LIMIT 1
  `

  return NextResponse.json({
    areaAnalyses,
    overall: overallAnalyses[0] ?? null,
  })
}
