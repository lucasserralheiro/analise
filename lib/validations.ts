import { z } from 'zod'

// Company
export const companySchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  cnpj: z.string().optional(),
  description: z.string().optional(),
})

export type CompanyInput = z.infer<typeof companySchema>
