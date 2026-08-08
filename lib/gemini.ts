import { GoogleGenAI, type Part } from '@google/genai'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'document'; data: string; mime_type: string }
  | { type: 'image'; data: string; mime_type: string }

export async function generateWithGemini(
  input: GeminiInputPart[],
  systemInstruction?: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada')
  }

  const ai = new GoogleGenAI({})

  const parts: Part[] = input.map(part =>
    part.type === 'text'
      ? { text: part.text }
      : { inlineData: { data: part.data, mimeType: part.mime_type } }
  )

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: systemInstruction ? { systemInstruction } : undefined,
  })

  return response.text ?? ''
}
