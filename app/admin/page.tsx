'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { 
  Building2, Users, ClipboardList, CheckCircle2, 
  ArrowRight, Plus, Star, Zap, Target, ChevronRight
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
})

interface Company { id: string; name: string }
interface Participant { id: string }
interface Questionnaire { id: string }
interface Evaluation { id: string; status: string }
interface PendingForm { form_id: string; form_title: string; company_id: string; company_name: string }

export default function DashboardPage() {
  const { data: pendingFormsRaw } = useSWR<PendingForm[]>('/api/forms/pending', fetcher)
  const pendingForms = Array.isArray(pendingFormsRaw) ? pendingFormsRaw : []

  const { data: companies, isLoading: loadingCompanies } = useSWR<Company[]>('/api/companies', fetcher)
  const { data: participants, isLoading: loadingParticipants } = useSWR<Participant[]>('/api/participants', fetcher)
  const { data: questionnaires, isLoading: loadingQuestionnaires } = useSWR<Questionnaire[]>('/api/questionnaires', fetcher)
  const { data: evaluations, isLoading: loadingEvaluations } = useSWR<Evaluation[]>('/api/evaluations', fetcher)

  const companiesArray = Array.isArray(companies) ? companies : []
  const participantsArray = Array.isArray(participants) ? participants : []
  const questionnairesArray = Array.isArray(questionnaires) ? questionnaires : []
  const evaluationsArray = Array.isArray(evaluations) ? evaluations : []
  
  const completedEvaluations = evaluationsArray.filter(e => e.status === 'COMPLETED').length
  
  const isLoading = loadingCompanies || loadingParticipants || loadingQuestionnaires || loadingEvaluations

  const steps = [
    { 
      title: 'Criar Empresa', 
      description: 'Adicione a empresa que será avaliada',
      href: '/admin/companies',
      icon: Building2,
      done: companiesArray.length > 0,
      count: companiesArray.length
    },
    { 
      title: 'Adicionar Participantes', 
      description: 'Cadastre os colaboradores que serão avaliados',
      href: '/admin/participants',
      icon: Users,
      done: participantsArray.length > 0,
      count: participantsArray.length
    },
    { 
      title: 'Criar Questionário', 
      description: 'Monte as etapas e perguntas da avaliação',
      href: '/admin/questionnaires',
      icon: ClipboardList,
      done: questionnairesArray.length > 0,
      count: questionnairesArray.length
    },
    { 
      title: 'Lançar Avaliações', 
      description: 'Crie as avaliações e envie aos avaliadores',
      href: '/admin/questionnaires',
      icon: Target,
      done: evaluationsArray.length > 0,
      count: evaluationsArray.length
    }
  ]

  const completedSteps = steps.filter(s => s.done).length
  const progressPercent = (completedSteps / steps.length) * 100

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bem-vindo ao Sistema de Avaliação 360</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Avalie seus colaboradores de forma completa e objetiva
        </p>
      </div>

      {pendingForms.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              Formulários pendentes pra você
            </CardTitle>
            <CardDescription>Você precisa responder estes formulários</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingForms.map(f => (
                <Link
                  key={f.form_id}
                  href={`/admin/companies/${f.company_id}/forms/${f.form_id}/respond`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-amber-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{f.form_title}</p>
                    <p className="text-xs text-muted-foreground">{f.company_name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {completedSteps < steps.length && (
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Comece Agora
                </CardTitle>
                <CardDescription className="mt-1">
                  Siga os passos para configurar sua primeira avaliação
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{completedSteps}/{steps.length}</div>
                <div className="text-xs text-muted-foreground">passos concluídos</div>
              </div>
            </div>
            <Progress value={progressPercent} className="mt-4 h-2" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {steps.map((step, index) => (
                <Link 
                  key={step.title}
                  href={step.href}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                    step.done 
                      ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                      : 'bg-background hover:bg-muted/50'
                  }`}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    step.done ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {step.done ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-bold">{index + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-sm text-muted-foreground">{step.description}</div>
                  </div>
                  {step.count > 0 && !step.done && (
                    <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                      {step.count}
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{companiesArray.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {companiesArray.length === 0 ? (
                <Link href="/admin/companies" className="text-primary hover:underline">
                  Cadastre a primeira empresa
                </Link>
              ) : (
                'Empresas cadastradas'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Participantes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{participantsArray.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {participantsArray.length === 0 && companiesArray.length > 0 ? (
                <Link href="/admin/participants" className="text-primary hover:underline">
                  Adicione participantes
                </Link>
              ) : (
                'Colaboradores cadastrados'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Questionários</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{questionnairesArray.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {questionnairesArray.length === 0 && participantsArray.length > 0 ? (
                <Link href="/admin/questionnaires" className="text-primary hover:underline">
                  Crie um questionário
                </Link>
              ) : (
                'Questionários criados'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avaliações</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{evaluationsArray.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedEvaluations} concluídas
            </p>
          </CardContent>
        </Card>
      </div>

      {completedSteps === steps.length && evaluationsArray.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avaliações Recentes</CardTitle>
            <CardDescription>Últimas avaliações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {evaluationsArray.slice(0, 5).map((evaluation: Evaluation & { 
                evaluator_name?: string
                evaluated_name?: string
                questionnaire_title?: string
              }) => (
                <div key={evaluation.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {evaluation.evaluator_name || 'Avaliador'} → {evaluation.evaluated_name || 'Avaliado'}
                    </p>
                    <p className="text-xs text-muted-foreground">{evaluation.questionnaire_title}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    evaluation.status === 'COMPLETED' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {evaluation.status === 'COMPLETED' ? 'Concluída' : 'Pendente'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {completedSteps === steps.length && evaluationsArray.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Tudo Configurado!</h3>
            <p className="text-muted-foreground mb-6">
              Seu sistema está pronto. Agora você pode criar avaliações e enviar aos avaliadores.
            </p>
            <Button asChild>
              <Link href="/admin/questionnaires">
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Avaliação
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}