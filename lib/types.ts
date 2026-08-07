export interface Company {
  id: string
  name: string
  cnpj: string | null
  description: string | null
  created_at: Date
  updated_at: Date
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'area_admin'
  area_id: string | null
  created_at: Date
  updated_at: Date
}

export interface Area {
  id: string
  name: string
  order_index: number
  created_at: Date
}

export interface CompanyArea {
  company_id: string
  area_id: string
}

export interface AreaQuestion {
  id: string
  area_id: string
  text: string
  order_index: number
  created_at: Date
}

export interface Evaluation {
  id: string
  company_id: string
  area_id: string
  admin_user_id: string
  status: 'in_progress' | 'completed'
  completed_at: Date | null
  created_at: Date
}

export interface EvaluationAnswer {
  id: string
  evaluation_id: string
  question_id: string
  score: number | null
  comment: string | null
}

export interface AiAreaAnalysis {
  id: string
  company_id: string
  area_id: string
  content: string
  created_by: string
  model_used: string
  created_at: Date
}

export interface AiOverallAnalysis {
  id: string
  company_id: string
  content: string
  created_by: string
  model_used: string
  created_at: Date
}

export interface AiSettings {
  instructions: string
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
