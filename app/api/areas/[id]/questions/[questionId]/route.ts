import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireAreaAccess } from '@/lib/session'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id: areaId, questionId } = await params
  const user = await requireAreaAccess(areaId)
  if (!user) {
    return NextResponse.json({ error: 'Sem permissão para editar este questionário' }, { status: 403 })
  }

  await sql`DELETE FROM area_questions WHERE id = ${questionId} AND area_id = ${areaId}`

  return NextResponse.json({ ok: true })
}
