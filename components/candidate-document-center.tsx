'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleAlert, FileCheck2, LoaderCircle, UploadCloud } from 'lucide-react'

type Application = { id: string; processId: string; title: string }
type Requirement = { id: string; processId: string; label: string; description: string; required: boolean; mimeTypes: string[]; maxSizeBytes: number }
type Document = { id: string; applicationId: string; requirementId: string; version: number; originalName: string; technicalStatus: string; malwareStatus: string; createdAt: string }

export function CandidateDocumentCenter({ applications, requirements, documents }: { applications: Application[]; requirements: Requirement[]; documents: Document[] }) {
  const router = useRouter()
  const [applicationId, setApplicationId] = useState(applications[0]?.id || '')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'warning'; message: string } | null>(null)
  const application = applications.find(item => item.id === applicationId)
  const visible = requirements.filter(item => item.processId === application?.processId)
  const latest = useMemo(() => {
    const map = new Map<string, Document>()
    documents.filter(item => item.applicationId === applicationId).forEach(item => {
      const current = map.get(item.requirementId)
      if (!current || item.version > current.version) map.set(item.requirementId, item)
    })
    return map
  }, [applicationId, documents])

  async function upload(requirement: Requirement, file: File | undefined) {
    if (!file || !applicationId) return
    setLoadingId(requirement.id); setFeedback(null)
    const form = new FormData(); form.set('applicationId', applicationId); form.set('requirementId', requirement.id); form.set('file', file)
    try {
      const response = await fetch('/api/sigec/candidate-documents', { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Falha no envio.')
      const type = body.malwareStatus === 'clean' ? 'success' : body.malwareStatus === 'infected' ? 'error' : 'warning'
      setFeedback({ type, message: body.message || `Documento enviado como versão ${body.version}.` }); router.refresh()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível enviar.' })
    } finally { setLoadingId(null) }
  }

  if (!applications.length) return <div className="rounded-[26px] border border-[#d9e0e7] bg-white px-6 py-14 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-[#9aa6b5]" /><p className="mt-4 font-bold text-[#334155]">Nenhuma candidatura disponível para anexos.</p><p className="mt-2 text-sm text-[#657084]">Os documentos serão liberados quando você iniciar uma candidatura.</p></div>

  return <div className="space-y-6">
    <label className="block rounded-2xl border border-[#d9e0e7] bg-white p-5"><span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#526074]">Candidatura</span><select value={applicationId} onChange={event => setApplicationId(event.target.value)} className="mt-2 w-full rounded-xl border border-[#cbd5df] bg-white px-3.5 py-3 font-bold text-[#172033] outline-none focus:border-[#315f9d]">{applications.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {feedback && <div role="status" aria-live="polite" className={`flex gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-[#9dd8c3] bg-[#ebf8f2] text-[#0f694c]' : feedback.type === 'warning' ? 'border-[#e8ca83] bg-[#fff8e7] text-[#805b09]' : 'border-[#efb7b7] bg-[#fff0f0] text-[#9f2f2f]'}`}>{feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}{feedback.message}</div>}
    <div className="grid gap-4 md:grid-cols-2">{visible.map(requirement => {
      const current = latest.get(requirement.id)
      return <article key={requirement.id} className="rounded-[22px] border border-[#d9e0e7] bg-white p-5 shadow-[0_18px_45px_-40px_rgba(18,34,51,.7)]">
        <div className="flex justify-between gap-3"><div><p className="font-display font-bold text-[#172033]">{requirement.label}</p><p className="mt-1 text-xs leading-5 text-[#657084]">{requirement.description || (requirement.required ? 'Documento obrigatório' : 'Documento opcional')}</p></div>{requirement.required && <span className="h-fit rounded-full bg-[#fff3dc] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#8a5a0a]">Obrigatório</span>}</div>
        {current && <div className="mt-4 rounded-xl border border-[#dbe5ef] bg-[#f5f8fb] px-3.5 py-3 text-xs"><p className="font-bold text-[#334155]">Versão {current.version} · {current.originalName}</p><p className="mt-1 text-[#657084]">Validação técnica: {current.technicalStatus === 'validated' ? 'aprovada' : current.technicalStatus} · Antimalware: {current.malwareStatus === 'clean' ? 'aprovado' : current.malwareStatus === 'infected' ? 'arquivo bloqueado' : current.malwareStatus === 'error' ? 'em quarentena para nova tentativa' : 'aguardando'}</p></div>}
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#8ca9cf] bg-[#f4f8fd] px-4 py-4 text-sm font-extrabold text-[#315f9d] hover:bg-[#eaf2fb]"><input type="file" className="sr-only" accept={requirement.mimeTypes.join(',')} disabled={loadingId === requirement.id} onChange={event => upload(requirement, event.target.files?.[0])} />{loadingId === requirement.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{loadingId === requirement.id ? 'Processando...' : current ? 'Enviar nova versão' : 'Selecionar arquivo'}</label>
        <p className="mt-2 text-center text-[10px] font-semibold text-[#7a8596]">PDF, JPEG ou PNG · até {Math.floor(Math.min(requirement.maxSizeBytes, 10485760) / 1048576)} MB</p>
      </article>
    })}</div>
  </div>
}
