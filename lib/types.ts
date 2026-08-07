export interface Company {
  id: string
  name: string
  cnpj: string | null
  description: string | null
  created_at: Date
  updated_at: Date
}

export interface Questionnaire {
  id: string
  title: string
  description: string | null
  company_id: string
  is_active: boolean
  created_at: Date
  updated_at: Date
  company?: Company
  stages?: Stage[]
}

export interface Stage {
  id: string
  title: string
  description: string | null
  order_index: number
  questionnaire_id: string
  created_at: Date
  questions?: Question[]
}

export interface Question {
  id: string
  text: string
  order_index: number
  stage_id: string
  created_at: Date
}

export interface Participant {
  id: string
  name: string
  email: string
  role: string | null
  company_id: string
  created_at: Date
  updated_at: Date
  company?: Company
}

export interface Evaluation {
  id: string
  questionnaire_id: string
  evaluator_id: string
  evaluated_id: string
  status: 'pending' | 'in_progress' | 'completed'
  completed_at: Date | null
  created_at: Date
  questionnaire?: Questionnaire
  evaluator?: Participant
  evaluated?: Participant
  response_token?: ResponseToken
}

export interface ResponseToken {
  id: string
  token: string
  evaluation_id: string
  expires_at: Date
  used_at: Date | null
  created_at: Date
  evaluation?: Evaluation
}

export interface Answer {
  id: string
  evaluation_id: string
  question_id: string
  score: number
  comment: string | null
  created_at: Date
  question?: Question
}

export interface AdminUser {
  id: string
  name: string
  email: string
  created_at: Date
  updated_at: Date
}

// Consolidation types
export interface QuestionScore {
  question_id: string
  question_text: string
  average_score: number
  total_responses: number
}

export interface StageScore {
  stage_id: string
  stage_title: string
  average_score: number
  questions: QuestionScore[]
}

export interface EvaluationSummary {
  evaluation_id: string
  evaluator_name: string
  evaluated_name: string
  overall_score: number
  stages: StageScore[]
  completed_at: Date | null
}

export interface ConsolidatedReport {
  questionnaire_id: string
  questionnaire_title: string
  company_name: string
  total_evaluations: number
  completed_evaluations: number
  overall_average: number
  stages: StageScore[]
  evaluations: EvaluationSummary[]
}
