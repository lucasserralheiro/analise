export type QuestionType = 'score_0_10' | 'short_text' | 'long_text' | 'multiple_choice' | 'yes_no'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  score_0_10: 'Nota (0-10)',
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  multiple_choice: 'Múltipla escolha',
  yes_no: 'Sim/Não',
}

export interface Question {
  id?: string
  type: QuestionType
  text: string
  options: string[]
  allow_multiple: boolean
  required: boolean
}

export interface Recipient {
  admin_user_id: string
  name: string
  email: string
  area_id: string | null
  area_name: string | null
  response_status?: 'in_progress' | 'completed' | null
}

export interface FormDetail {
  form: { id: string; title: string; status: 'draft' | 'sent'; sent_at: string | null; created_at: string }
  questions: Question[]
  recipients: Recipient[]
}

export interface AdminUserOption {
  id: string
  name: string
  email: string
  role: string
  area_id: string | null
  area_name: string | null
}

export interface AreaOption {
  id: string
  name: string
}
