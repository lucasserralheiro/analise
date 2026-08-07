import { GoogleGenAI } from '@google/genai'

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
  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: systemInstruction,
    input,
  })

  return interaction.output_text ?? ''
}
