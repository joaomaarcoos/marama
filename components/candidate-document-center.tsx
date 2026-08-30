'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleAlert, FileCheck2, FileText, LoaderCircle, Plus, Trash2, UploadCloud } from 'lucide-react'

type Application = { id: string; processId: string; state: string; title: string }
type Requirement = { id: string; processId: string; label: string; description: string; required: boolean; mimeTypes: string[]; maxSizeBytes: number }
type Document = { id: string; applicationId: string; requirementId: string; version: number; originalName: string; technicalStatus: string; malwareStatus: string; createdAt: string }

function documentStatus(document: Document) {
  if (document.technicalStatus === 'rejected' || document.malwareStatus === 'infected') {
    return { label: 'Bloqueado', className: 'border-[#e8a4a4] bg-[#fff0f0] text-[#922b2b]' }
  }
  if (document.malwareStatus === 'clean') {
    return { label: 'Enviado', className: 'border-[#8ecbb6] bg-[#eaf8f2] text-[#075c43]' }
  }
  return { label: 'Verificando', className: 'border-[#dfbd65] bg-[#fff7df] text-[#704c00]' }
}

function sentOn(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function CandidateDocumentCenter({ applications, requirements, documents }: { applications: Application[]; requirements: Requirement[]; documents: Document[] }) {
  const router = useRouter()
  const [applicationId, setApplicationId] = useState(applications[0]?.id || '')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'warning'; message: string } | null>(null)
  const application = applications.find(item => item.id === applicationId)
  const visibleRequirements = requirements.filter(item => item.processId === application?.processId)

  async function upload(requirement: Requirement, file: File | undefined) {
    if (!file || !applicationId) return
    setBusyId(requirement.id)
    setFeedback(null)
    const form = new FormData()
    form.set('applicationId', applicationId)
    form.set('requirementId', requirement.id)
    form.set('file', file)
    try {
      const response = await fetch('/api/sigec/candidate-documents', { method: 'POST', body: form, credentials: 'same-origin' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Não foi possível enviar o documento.')
      if (body.malwareStatus === 'clean') {
        setFeedback({ type: 'success', message: 'Documento enviado com sucesso.' })
      } else if (body.malwareStatus === 'infected') {
        setFeedback({ type: 'error', message: 'Este arquivo foi bloqueado. Escolha outro documento.' })
      } else {
        setFeedback({ type: 'warning', message: 'Documento recebido. Estamos verificando o arquivo.' })
      }
      router.refresh()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível enviar o documento.' })
    } finally {
      setBusyId(null)
    }
  }

  async function removeDocument(document: Document) {
    setBusyId(document.id)
    setFeedback(null)
    try {
      const response = await fetch('/api/sigec/candidate-documents', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Não foi possível remover o documento.')
      setFeedback({ type: 'success', message: 'Documento removido.' })
      setConfirmingId(null)
      router.refresh()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível remover o documento.' })
    } finally {
      setBusyId(null)
    }
  }

  if (!applications.length) {
    return <div className="rounded-[24px] border border-[#d4dee5] bg-white px-5 py-12 text-center shadow-[0_18px_50px_-42px_rgba(18,34,51,.55)] sm:px-8"><FileCheck2 className="mx-auto h-9 w-9 text-[#718096]" /><p className="mt-4 text-lg font-bold text-[#243248]">Você ainda não iniciou uma candidatura.</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#59687c]">Quando iniciar, os documentos pedidos aparecerão aqui.</p></div>
  }

  return <div className="space-y-5">
    {applications.length > 1 && <label className="block rounded-2xl border border-[#cfdbe3] bg-white p-4 shadow-[0_14px_40px_-36px_rgba(18,34,51,.5)] sm:p-5"><span className="text-sm font-bold text-[#35465b]">Escolha o processo seletivo</span><select value={applicationId} onChange={event => { setApplicationId(event.target.value); setFeedback(null); setConfirmingId(null) }} className="mt-2 min-h-12 w-full rounded-xl border border-[#aebdca] bg-white px-3.5 py-3 font-bold text-[#142038] outline-none transition focus:border-[#2867a8] focus:ring-4 focus:ring-[#2867a8]/10">{applications.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}

    {feedback && <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm font-semibold leading-6 ${feedback.type === 'success' ? 'border-[#85cdb4] bg-[#e8f8f1] text-[#075c43]' : feedback.type === 'warning' ? 'border-[#dfbd65] bg-[#fff7df] text-[#704c00]' : 'border-[#e9a3a3] bg-[#fff0f0] text-[#922b2b]'}`}>{feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}<span>{feedback.message}</span></div>}

    <div className="space-y-4">{visibleRequirements.map(requirement => {
      const sentDocuments = documents.filter(item => item.applicationId === applicationId && item.requirementId === requirement.id)
      const uploadBusy = busyId === requirement.id
      return <section key={requirement.id} className="overflow-hidden rounded-[22px] border border-[#ccd8e1] bg-white shadow-[0_20px_48px_-40px_rgba(18,34,51,.72)]">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-start gap-2 min-[430px]:flex-row min-[430px]:justify-between">
            <div><h2 className="font-display text-lg font-extrabold leading-6 text-[#142038]">{requirement.label}</h2>{requirement.description && <p className="mt-1.5 text-sm leading-6 text-[#526177]">{requirement.description}</p>}</div>
            {requirement.required && <span className="shrink-0 rounded-full border border-[#e8c879] bg-[#fff4d9] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#744b00]">Obrigatório</span>}
          </div>

          <label className="mt-5 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#6f96c2] bg-[#eef5fc] px-4 py-3.5 text-center text-sm font-extrabold text-[#1f568f] transition hover:border-[#376fae] hover:bg-[#e2eef9] focus-within:ring-4 focus-within:ring-[#2867a8]/10">
            <input type="file" className="sr-only" accept={requirement.mimeTypes.join(',')} disabled={uploadBusy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void upload(requirement, file) }} />
            {uploadBusy ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" /> : sentDocuments.length ? <Plus className="h-5 w-5 shrink-0" /> : <UploadCloud className="h-5 w-5 shrink-0" />}
            {uploadBusy ? 'Enviando...' : sentDocuments.length ? 'Adicionar outro documento' : 'Adicionar documento'}
          </label>
          <p className="mt-2.5 text-center text-xs font-semibold text-[#657388]">PDF, foto JPG ou PNG · até {Math.floor(Math.min(requirement.maxSizeBytes, 10485760) / 1048576)} MB</p>
        </div>

        {sentDocuments.length > 0 && <div className="border-t border-[#dbe4ea] bg-[#f7fafb] p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#35465b]"><FileText className="h-4 w-4" /> Documentos enviados</h3>
          <ul className="mt-3 space-y-2.5">{sentDocuments.map(document => {
            const status = documentStatus(document)
            const confirming = confirmingId === document.id
            const removing = busyId === document.id
            return <li key={document.id} className="rounded-xl border border-[#d5e0e7] bg-white p-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0"><p className="break-words text-sm font-bold text-[#223047]">{document.originalName}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${status.className}`}>{status.label}</span><span className="text-xs font-medium text-[#657388]">Enviado em {sentOn(document.createdAt)}</span></div></div>
              {application?.state === 'draft' && <div className="mt-3 shrink-0 sm:mt-0">{confirming ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-[#6d3840]">Remover?</span><button type="button" disabled={removing} onClick={() => void removeDocument(document)} className="min-h-10 rounded-lg bg-[#a53030] px-3 text-xs font-extrabold text-white hover:bg-[#8f2727] disabled:opacity-60">{removing ? 'Removendo...' : 'Sim, remover'}</button><button type="button" disabled={removing} onClick={() => setConfirmingId(null)} className="min-h-10 rounded-lg border border-[#b9c6d1] bg-white px-3 text-xs font-extrabold text-[#415168] hover:bg-[#f2f6f8]">Cancelar</button></div> : <button type="button" onClick={() => setConfirmingId(document.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-[#9a3030] hover:bg-[#fff0f0]"><Trash2 className="h-4 w-4" /> Remover</button>}</div>}
            </li>
          })}</ul>
          {application?.state !== 'draft' && <p className="mt-3 text-xs leading-5 text-[#657388]">A candidatura já foi enviada. Para corrigir um arquivo, adicione outro documento.</p>}
        </div>}
      </section>
    })}</div>
  </div>
}
