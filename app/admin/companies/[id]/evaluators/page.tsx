'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Plus, Trash2, Copy, CheckCircle2, ArrowLeft, Users,
  UserPlus, Clock, Eye, BarChart3
} from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Evaluator {
  id: string
  name: string
  email: string | null
  sector: string | null
  position: string | null
  status: string
  token: string
  created_at: string
}

interface Answer {
  answer_id: string
  question_id: string
  question_text: string
  question_order: number
  score: number
  comment: string | null
}

interface EvaluatorAnswers {
  evaluator: Evaluator
  answers: Answer[]
}

const SCORE_COLORS: Record<string, string> = {
  low: 'bg-red-100 text-red-700 border-red-200',
  mid: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-green-100 text-green-700 border-green-200',
}

function scoreClass(score: number) {
  if (score <= 4) return SCORE_COLORS.low
  if (score <= 6) return SCORE_COLORS.mid
  return SCORE_COLORS.high
}

export default function CompanyEvaluatorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: evaluators = [], mutate } = useSWR<Evaluator[]>(`/api/companies/${id}/evaluators`, fetcher)
  const evaluatorsArray = Array.isArray(evaluators) ? evaluators : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', sector: '', position: '' })

  // View answers state
  const [answersDialogOpen, setAnswersDialogOpen] = useState(false)
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null)
  const { data: answersData } = useSWR<EvaluatorAnswers>(
    selectedEvalId ? `/api/companies/${id}/evaluators/${selectedEvalId}/answers` : null,
    fetcher
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${id}/evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) {
        mutate()
        setForm({ name: '', email: '', sector: '', position: '' })
        setDialogOpen(false)
        toast.success('Avaliador adicionado!')
      }
    } catch { toast.error('Erro') } finally { setLoading(false) }
  }

  async function handleDelete(evalId: string) {
    if (!confirm('Remover este avaliador?')) return
    try {
      await fetch(`/api/companies/${id}/evaluators/${evalId}`, { method: 'DELETE' })
      mutate()
      toast.success('Removido')
    } catch { toast.error('Erro') }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/avaliar/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
    toast.success('Link copiado!')
  }

  function openAnswers(evalId: string) {
    setSelectedEvalId(evalId)
    setAnswersDialogOpen(true)
  }

  const completed = evaluatorsArray.filter(e => e.status === 'COMPLETED').length
  const pending = evaluatorsArray.length - completed

  // Group by sector
  const sectorGroups: Record<string, Evaluator[]> = {}
  evaluatorsArray.forEach(e => {
    const sector = e.sector || 'Sem setor'
    if (!sectorGroups[sector]) sectorGroups[sector] = []
    sectorGroups[sector].push(e)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Avaliadores
          </h1>
          <p className="text-muted-foreground text-sm">
            {evaluatorsArray.length} cadastrado(s) · {completed} concluído(s) · {pending} pendente(s)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Avaliador</DialogTitle>
              <DialogDescription>
                Funcionário da Prodam responsável por avaliar esta empresa. Cada avaliador representa um setor/área da Prodam.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Nome *</FieldLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Ana Souza"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="ana@empresa.com"
                    type="email"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel>Setor</FieldLabel>
                    <Input
                      value={form.sector}
                      onChange={(e) => setForm(p => ({ ...p, sector: e.target.value }))}
                      placeholder="Ex: Financeiro"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Cargo</FieldLabel>
                    <Input
                      value={form.position}
                      onChange={(e) => setForm(p => ({ ...p, position: e.target.value }))}
                      placeholder="Ex: Analista"
                    />
                  </Field>
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                  {loading ? 'Adicionando...' : 'Adicionar Avaliador'}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {evaluatorsArray.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-7 w-7 text-indigo-400" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Nenhum avaliador</h3>
            <p className="text-muted-foreground text-sm mb-5">
              Adicione os funcionários da Prodam que vão avaliar esta empresa — um por setor.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Primeiro Avaliador
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Evaluators grouped by sector */}
      {Object.entries(sectorGroups).map(([sector, sectorEvals]) => (
        <div key={sector}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {sector}
            </h2>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {sectorEvals.filter(e => e.status === 'COMPLETED').length}/{sectorEvals.length}
            </span>
          </div>
          <div className="space-y-2">
            {sectorEvals.map((eval_) => (
              <Card key={eval_.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center gap-4 py-3.5 px-5">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    eval_.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {eval_.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{eval_.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {eval_.email && (
                        <span className="text-xs text-muted-foreground truncate">{eval_.email}</span>
                      )}
                      {eval_.position && (
                        <span className="text-xs text-muted-foreground">{eval_.position}</span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="shrink-0">
                    {eval_.status === 'COMPLETED' ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Concluído
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-medium">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {eval_.status === 'COMPLETED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAnswers(eval_.id)}
                        className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 h-8"
                      >
                        <BarChart3 className="h-3.5 w-3.5 mr-1" />
                        Respostas
                      </Button>
                    )}
                    {eval_.status !== 'COMPLETED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(eval_.token)}
                        className="h-8"
                      >
                        {copiedToken === eval_.token
                          ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-500" />Copiado</>
                          : <><Copy className="h-3.5 w-3.5 mr-1" />Copiar Link</>
                        }
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-8 w-8"
                      onClick={() => handleDelete(eval_.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Answers Dialog */}
      <Dialog open={answersDialogOpen} onOpenChange={setAnswersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Respostas de {answersData?.evaluator?.name}
            </DialogTitle>
            <DialogDescription>
              {answersData?.evaluator?.sector && (
                <span className="inline-flex items-center bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {answersData.evaluator.sector}
                </span>
              )}
              {answersData?.evaluator?.position && (
                <span className="ml-2 text-muted-foreground">{answersData.evaluator.position}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!answersData && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          )}

          {answersData?.answers?.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhuma resposta encontrada.
            </p>
          )}

          {answersData?.answers && answersData.answers.length > 0 && (
            <div className="space-y-4 mt-2">
              {/* Overall average */}
              {(() => {
                const avg = answersData.answers.reduce((sum, a) => sum + a.score, 0) / answersData.answers.length
                return (
                  <div className="bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-800">Média Geral</span>
                    <span className="text-2xl font-bold text-indigo-700">{avg.toFixed(1)}<span className="text-sm font-normal text-indigo-400">/10</span></span>
                  </div>
                )
              })()}

              {/* Individual answers */}
              {answersData.answers.map((answer, idx) => (
                <div key={answer.answer_id} className="border border-border rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 mb-2">{answer.question_text}</p>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-lg font-bold border ${scoreClass(answer.score)}`}>
                          {answer.score}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {answer.score <= 2 ? 'Discordo totalmente' :
                           answer.score <= 4 ? 'Discordo' :
                           answer.score === 5 ? 'Neutro' :
                           answer.score <= 7 ? 'Concordo parcialmente' :
                           answer.score <= 9 ? 'Concordo' :
                           'Concordo totalmente'}
                        </span>
                      </div>
                      {answer.comment && (
                        <div className="mt-2 text-sm text-muted-foreground italic bg-muted/40 rounded-lg px-3 py-2">
                          "{answer.comment}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
