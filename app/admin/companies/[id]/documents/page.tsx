'use client'

import { useState, useRef } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Trash2, ArrowLeft, FileText, Upload, Download, Eye, File, FileSpreadsheet, FileImage } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed')
  return res.json()
})

interface Document {
  id: string
  title: string
  file_url: string
  file_type: string | null
  created_at: string
}

function getFileIcon(fileUrl: string) {
  const ext = fileUrl.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return <FileText className="h-8 w-8 text-red-500" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="h-8 w-8 text-green-500" />
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FileImage className="h-8 w-8 text-blue-500" />
  return <File className="h-8 w-8 text-gray-500" />
}

export default function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = require('react').use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { data: documents = [], mutate } = useSWR<Document[]>(`/api/companies/${id}/documents`, fetcher)
  const docsArray = Array.isArray(documents) ? documents : []
  
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)

  const [uploadTitle, setUploadTitle] = useState('')
  const [urlForm, setUrlForm] = useState({ title: '', file_url: '' })

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !uploadTitle.trim()) {
      if (!uploadTitle.trim()) toast.error('Digite um título para o arquivo')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('company_id', id)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok) {
        await fetch(`/api/companies/${id}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: uploadTitle, file_url: data.file_url, file_type: data.file_type })
        })
        mutate()
        setUploadTitle('')
        setDialogOpen(false)
        toast.success('Arquivo enviado!')
      } else {
        toast.error(data.error || 'Erro ao enviar')
      }
    } catch { toast.error('Erro ao enviar') } 
    finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!urlForm.title || !urlForm.file_url) return
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(urlForm)
      })
      if (res.ok) {
        mutate()
        setUrlForm({ title: '', file_url: '' })
        setDialogOpen(false)
        toast.success('Documento adicionado!')
      }
    } catch { toast.error('Erro') } 
    finally { setLoading(false) }
  }

  async function handleDelete(docId: string) {
    try {
      await fetch(`/api/companies/${id}/documents/${docId}`, { method: 'DELETE' })
      mutate()
      toast.success('Removido')
    } catch { toast.error('Erro') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Documentos e Materiais</h1>
          <p className="text-muted-foreground">{docsArray.length} arquivo(s)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Adicionar Documento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Documento</DialogTitle>
              <DialogDescription>Faça upload de arquivo ou adicione via URL</DialogDescription>
            </DialogHeader>
            
            {/* Upload */}
            <div className="space-y-4 border-b pb-4 mb-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Título do Arquivo</FieldLabel>
                  <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Ex: Relatório 2024" />
                </Field>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input ref={fileInputRef} type="file" onChange={handleUploadFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif" className="hidden" id="file-upload-doc" />
                  <label htmlFor="file-upload-doc" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Clique para fazer upload</p>
                  </label>
                </div>
                {uploading && <p className="text-center text-sm">Enviando...</p>}
              </FieldGroup>
            </div>

            {/* URL */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Ou adicione via URL:</p>
              <form onSubmit={handleAddUrl}>
                <FieldGroup>
                  <Field><FieldLabel>Título</FieldLabel><Input value={urlForm.title} onChange={(e) => setUrlForm(p => ({...p, title: e.target.value}))} placeholder="Ex: Apresentação" /></Field>
                  <Field><FieldLabel>URL</FieldLabel><Input value={urlForm.file_url} onChange={(e) => setUrlForm(p => ({...p, file_url: e.target.value}))} placeholder="https://..." /></Field>
                  <Button type="submit" className="w-full" disabled={loading}>Adicionar URL</Button>
                </FieldGroup>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {docsArray.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum documento</h3>
            <p className="text-muted-foreground mb-6">Adicione PDFs, documentos e materiais.</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Adicionar Primeiro Documento</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {docsArray.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {getFileIcon(doc.file_url)}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{doc.title}</CardTitle>
                    <CardDescription className="truncate">{doc.file_url}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setPreviewDoc(doc)}>
                    <Eye className="h-3 w-3 mr-1" />Ver
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3 mr-1" />Baixar
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(doc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle>{previewDoc?.title}</DialogTitle></DialogHeader>
          <div className="flex-1 h-[70vh]">
            {previewDoc?.file_url && (
              previewDoc.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={previewDoc.file_url} alt={previewDoc.title} className="max-h-full object-contain mx-auto" />
              ) : (
                <iframe src={previewDoc.file_url} className="w-full h-full" title={previewDoc.title} />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}