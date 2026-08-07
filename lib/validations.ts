import { z } from 'zod'

// Admin User
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// Company
export const companySchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  cnpj: z.string().optional(),
  description: z.string().optional(),
})

// Questionnaire
export const questionnaireSchema = z.object({
  title: z.string().min(2, 'Título deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  company_id: z.string().uuid('ID da empresa inválido'),
})

// Stage
export const stageSchema = z.object({
  title: z.string().min(2, 'Título deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  order_index: z.number().int().min(0),
  questionnaire_id: z.string().uuid('ID do questionário inválido'),
})

// Question
export const questionSchema = z.object({
  text: z.string().min(1, 'Texto da pergunta é obrigatório'),
  order_index: z.number().int().min(0),
  stage_id: z.string().uuid('ID da etapa inválido'),
})

// Participant
export const participantSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.string().optional(),
  company_id: z.string().uuid('ID da empresa inválido'),
})

// Evaluation
export const evaluationSchema = z.object({
  questionnaire_id: z.string().uuid('ID do questionário inválido'),
  evaluator_id: z.string().uuid('ID do avaliador inválido'),
  evaluated_id: z.string().uuid('ID do avaliado inválido'),
})

// Answer
export const answerSchema = z.object({
  question_id: z.string().uuid('ID da pergunta inválido'),
  score: z.number().int().min(0).max(10, 'Nota deve ser entre 0 e 10'),
  comment: z.string().optional(),
})

export const submitAnswersSchema = z.object({
  token: z.string().min(1, 'Token inválido'),
  answers: z.array(answerSchema).min(1, 'Deve ter pelo menos uma resposta'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type CompanyInput = z.infer<typeof companySchema>
export type QuestionnaireInput = z.infer<typeof questionnaireSchema>
export type StageInput = z.infer<typeof stageSchema>
export type QuestionInput = z.infer<typeof questionSchema>
export type ParticipantInput = z.infer<typeof participantSchema>
export type EvaluationInput = z.infer<typeof evaluationSchema>
export type AnswerInput = z.infer<typeof answerSchema>
export type SubmitAnswersInput = z.infer<typeof submitAnswersSchema>
