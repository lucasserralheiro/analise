import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { getCurrentAdmin } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const user = await getCurrentAdmin()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const companyId = formData.get('company_id') as string

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    if (!companyId) {
      return NextResponse.json({ error: 'ID da empresa é obrigatório' }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', companyId)
    await mkdir(uploadsDir, { recursive: true })

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'pdf'
    const filename = `${randomBytes(16).toString('hex')}.${ext}`
    const filePath = join(uploadsDir, filename)

    // Save file
    const buffer = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(buffer))

    // Return public URL
    const fileUrl = `/uploads/${companyId}/${filename}`

    return NextResponse.json({
      success: true,
      file_url: fileUrl,
      filename: file.name,
      file_size: file.size,
      file_type: file.type
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}