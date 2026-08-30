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
      const response = await fetch('/api/sigec/candidate-documents', { method: 'POST', body: form, credentials: 'same-origin' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Falha no envio.')
      const type = body.malwareStatus === 'clean' ? 'success' : body.malwareStatus === 'infected' ? 'error' : 'warning'
      setFeedback({ type, message: body.message || `Documento enviado como versão ${body.version}.` }); router.refresh()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível enviar.' })
    } finally { setLoadingId(null) }
  }

  if (!applications.length) return <div className="rounded-[26px] border border-[#d4dee5] bg-[#ffffff] px-5 py-12 text-center shadow-[0_18px_50px_-42px_rgba(18,34,51,.55)] sm:px-8 sm:py-14"><FileCheck2 className="mx-auto h-9 w-9 text-[#718096]" /><p className="mt-4 font-bold text-[#243248]">Nenhuma candidatura disponível para anexos.</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#59687c]">Os documentos serão liberados quando você iniciar uma candidatura.</p></div>

  return <div className="space-y-5 sm:space-y-6">
    <label className="block rounded-2xl border border-[#cfdbe3] bg-[#ffffff] p-4 shadow-[0_14px_40px_-36px_rgba(18,34,51,.5)] sm:p-5"><span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#46576c]">Candidatura</span><select value={applicationId} onChange={event => setApplicationId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#aebdca] bg-[#ffffff] px-3.5 py-3 font-bold text-[#142038] outline-none transition focus:border-[#2867a8] focus:ring-4 focus:ring-[#2867a8]/10">{applications.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {feedback && <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm font-semibold leading-6 ${feedback.type === 'success' ? 'border-[#85cdb4] bg-[#e8f8f1] text-[#075c43]' : feedback.type === 'warning' ? 'border-[#dfbd65] bg-[#fff7df] text-[#704c00]' : 'border-[#e9a3a3] bg-[#fff0f0] text-[#922b2b]'}`}>{feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}<span>{feedback.message}</span></div>}
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">{visible.map(requirement => {
      const current = latest.get(requirement.id)
      return <article key={requirement.id} className="flex min-w-0 flex-col rounded-[22px] border border-[#ccd8e1] bg-[#ffffff] p-4 shadow-[0_20px_48px_-40px_rgba(18,34,51,.72)] sm:p-6">
        <div className="flex flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:justify-between"><div className="min-w-0"><p className="font-display text-base font-extrabold leading-6 text-[#142038]">{requirement.label}</p><p className="mt-1.5 text-xs leading-5 text-[#526177]">{requirement.description || (requirement.required ? 'Documento obrigatório' : 'Documento opcional')}</p></div>{requirement.required && <span className="h-fit shrink-0 rounded-full border border-[#e8c879] bg-[#fff4d9] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#744b00]">Obrigatório</span>}</div>
        {current && <div className="mt-4 rounded-xl border border-[#cfdae4] bg-[#f2f6f9] px-3.5 py-3 text-xs leading-5"><p className="break-words font-bold text-[#27374c]">Versão {current.version} · {current.originalName}</p><p className="mt-1 text-[#536277]">Validação técnica: {current.technicalStatus === 'validated' ? 'aprovada' : current.technicalStatus} · Antimalware: {current.malwareStatus === 'clean' ? 'aprovado' : current.malwareStatus === 'infected' ? 'arquivo bloqueado' : current.malwareStatus === 'error' ? 'em quarentena para nova tentativa' : 'aguardando'}</p></div>}
        <label className="mt-5 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#6f96c2] bg-[#eef5fc] px-4 py-3.5 text-center text-sm font-extrabold text-[#1f568f] transition hover:border-[#376fae] hover:bg-[#e2eef9] focus-within:ring-4 focus-within:ring-[#2867a8]/10"><input type="file" className="sr-only" accept={requirement.mimeTypes.join(',')} disabled={loadingId === requirement.id} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void upload(requirement, file) }} />{loadingId === requirement.id ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <UploadCloud className="h-4 w-4 shrink-0" />}{loadingId === requirement.id ? 'Processando...' : current ? 'Enviar nova versão' : 'Selecionar arquivo'}</label>
        <p className="mt-2.5 text-center text-[10px] font-bold text-[#657388]">PDF, JPEG ou PNG · até {Math.floor(Math.min(requirement.maxSizeBytes, 10485760) / 1048576)} MB</p>
      </article>
    })}</div>
  </div>
}
