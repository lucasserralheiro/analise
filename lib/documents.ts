import { readFile } from 'fs/promises'
import { join } from 'path'
import type { GeminiInputPart } from '@/lib/gemini'

export interface DocumentRow {
  title: string
  file_url: string
  file_type: string | null
}

// Limite conservador pra não estourar o limite de 20MB por requisição do
// Gemini (dados inline) — deixa margem pro texto do prompt.
const MAX_TOTAL_BYTES = 15 * 1024 * 1024

export async function fetchReadableDocuments(documents: DocumentRow[]): Promise<{
  readable: GeminiInputPart[]
  readableTitles: string[]
  skippedTitles: string[]
}> {
  const readable: GeminiInputPart[] = []
  const readableTitles: string[] = []
  const skippedTitles: string[] = []
  let totalBytes = 0

  for (const doc of documents) {
    const mimeType = doc.file_type || ''
    const isPdf = mimeType === 'application/pdf'
    const isImage = mimeType.startsWith('image/')

    if (!isPdf && !isImage) {
      skippedTitles.push(doc.title)
      continue
    }

    try {
      let buffer: Buffer
      if (doc.file_url.startsWith('/')) {
        buffer = await readFile(join(process.cwd(), 'public', doc.file_url))
      } else {
        const res = await fetch(doc.file_url)
        if (!res.ok) throw new Error(`status ${res.status}`)
        buffer = Buffer.from(await res.arrayBuffer())
      }

      if (totalBytes + buffer.length > MAX_TOTAL_BYTES) {
        skippedTitles.push(doc.title)
        continue
      }
      totalBytes += buffer.length

      const data = buffer.toString('base64')
      readable.push(
        isPdf
          ? { type: 'document', data, mime_type: mimeType }
          : { type: 'image', data, mime_type: mimeType }
      )
      readableTitles.push(doc.title)
    } catch {
      skippedTitles.push(doc.title)
    }
  }

  return { readable, readableTitles, skippedTitles }
}
