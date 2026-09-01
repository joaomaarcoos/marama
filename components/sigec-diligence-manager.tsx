'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Check, Clock3, FileText, Loader2, MessageSquareMore, Send, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { closeSigecInformationRequest, createSigecInformationRequest } from '@/app/(dashboard)/sigec-candidaturas/[id]/actions'
import { formatSigecDate, type SigecDiligenceOption, type SigecInformationRequest } from '@/lib/sigec-application-detail'

const statusLabels = { open: 'Aguardando candidato', answered: 'Resposta recebida', accepted: 'Resposta aceita', canceled: 'Cancelada' }

export function SigecDiligenceManager({ applicationId, applicationState, requests, questions, documents }: {
  applicationId: string
  applicationState: 'draft' | 'submitted' | 'withdrawn'
  requests: SigecInformationRequest[]
  questions: SigecDiligenceOption[]
  documents: SigecDiligenceOption[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [resolution, setResolution] = useState('')
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const active = requests.find((request) => request.status === 'open' || request.status === 'answered')
  const labels = useMemo(() => new Map<string, string>([
    ...questions.map((item): [string, string] => [`question:${item.id}`, item.label]),
    ...documents.map((item): [string, string] => [`document:${item.id}`, item.label]),
  ]), [questions, documents])

  function toggle(value: string) { setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) }
  function create() {
    setFeedback(null)
    startTransition(async () => {
      const requestedFields = selected.map((value) => { const [kind, id] = value.split(':'); return { kind: kind as 'question' | 'document', id } })
      const normalizedDueAt = dueAt ? new Date(dueAt).toISOString() : ''
      const result = await createSigecInformationRequest({ applicationId, message, dueAt: normalizedDueAt, requestedFields })
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) { setMessage(''); setDueAt(''); setSelected([]); router.refresh() }
    })
  }
  function close(action: 'accepted' | 'canceled') {
    if (!active) return
    setFeedback(null)
    startTransition(async () => {
      const result = await closeSigecInformationRequest({ applicationId, requestId: active.id, action, resolutionMessage: resolution })
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) { setResolution(''); router.refresh() }
    })
  }

  return <section className="overflow-hidden rounded-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex items-start gap-3 px-4 py-4 sm:px-5" style={{ borderBottom: '1px solid hsl(var(--border))' }}><span className="mt-0.5 rounded-lg p-2" style={{ background: 'hsl(var(--accent-amber) / .12)', color: 'hsl(var(--accent-amber))' }}><MessageSquareMore className="h-4 w-4" /></span><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Solicitar informações ao candidato</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Escolha exatamente o que precisa ser corrigido ou complementado. O candidato só poderá alterar esses itens até o prazo.</p></div></header>

    {active ? <div className="p-4 sm:p-5"><div className="rounded-xl p-4" style={{ background: active.status === 'answered' ? 'hsl(var(--accent-green) / .08)' : 'hsl(var(--accent-amber) / .08)', border: `1px solid hsl(var(--${active.status === 'answered' ? 'accent-green' : 'accent-amber'}) / .3)` }}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.1em]" style={{ color: active.status === 'answered' ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-amber))' }}>{statusLabels[active.status]}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: 'hsl(var(--fg1))' }}>{active.message}</p></div><p className="flex shrink-0 items-center gap-1 text-xs font-semibold" style={{ color: new Date(active.due_at) <= new Date() ? 'hsl(var(--accent-red))' : 'hsl(var(--fg2))' }}><Clock3 className="h-3.5 w-3.5" /> Até {formatSigecDate(active.due_at, true)}</p></div><div className="mt-3 flex flex-wrap gap-2">{active.requested_fields.map((field) => <span key={`${field.kind}:${field.id}`} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg2))', border: '1px solid hsl(var(--border))' }}>{field.kind === 'document' ? 'Documento: ' : 'Informação: '}{labels.get(`${field.kind}:${field.id}`) || 'Item solicitado'}</span>)}</div></div>
      <label className="mt-4 block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Mensagem de encerramento<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={2000} rows={2} placeholder={active.status === 'answered' ? 'Confirme que as informações foram conferidas' : 'Explique por que a solicitação será cancelada'} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--bg))', color: 'hsl(var(--fg1))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties} /></label>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={pending} onClick={() => close('canceled')} className="ds-btn ds-btn--secondary min-h-10 justify-center"><X className="h-4 w-4" /> Cancelar solicitação</button>{active.status === 'answered' && <button type="button" disabled={pending} onClick={() => close('accepted')} className="ds-btn ds-btn--primary min-h-10 justify-center">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aceitar resposta</button>}</div></div> : applicationState === 'submitted' ? <div className="p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Mensagem para o candidato<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={3} placeholder="Explique com linguagem simples o que precisa ser enviado" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--bg))', color: 'hsl(var(--fg1))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties} /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Prazo<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--bg))', color: 'hsl(var(--fg1))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties} /></label></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><FieldGroup title="Informações" icon={<FileText className="h-4 w-4" />} prefix="question" items={questions} selected={selected} onToggle={toggle} /><FieldGroup title="Documentos" icon={<FileText className="h-4 w-4" />} prefix="document" items={documents} selected={selected} onToggle={toggle} /></div><div className="mt-4 flex justify-end"><button type="button" disabled={pending} onClick={create} className="ds-btn ds-btn--primary min-h-11 w-full justify-center sm:w-auto">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar solicitação</button></div></div> : <p className="px-5 py-7 text-sm" style={{ color: 'hsl(var(--fg3))' }}>A candidatura precisa estar enviada para abrir uma solicitação.</p>}

    {feedback?.text && <p role="status" className="mx-4 mb-4 rounded-lg px-3 py-2 text-xs sm:mx-5" style={{ background: feedback.error ? 'hsl(var(--accent-red) / .1)' : 'hsl(var(--accent-green) / .1)', color: feedback.error ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{feedback.text}</p>}
    {requests.some((request) => request.status === 'accepted' || request.status === 'canceled') && <details className="border-t px-4 py-4 sm:px-5" style={{ borderColor: 'hsl(var(--border))' }}><summary className="cursor-pointer text-xs font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}>Solicitações encerradas</summary><div className="mt-3 space-y-2">{requests.filter((request) => request.status === 'accepted' || request.status === 'canceled').map((request) => <div key={request.id} className="rounded-lg px-3 py-3 text-xs" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{statusLabels[request.status]}</strong><span>{formatSigecDate(request.closed_at, true)}</span></div><p className="mt-1">{request.message}</p>{request.resolution_message && <p className="mt-1" style={{ color: 'hsl(var(--fg1))' }}>Encerramento: {request.resolution_message}</p>}</div>)}</div></details>}
  </section>
}

function FieldGroup({ title, icon, prefix, items, selected, onToggle }: { title: string; icon: React.ReactNode; prefix: 'question' | 'document'; items: SigecDiligenceOption[]; selected: string[]; onToggle: (value: string) => void }) {
  return <fieldset className="rounded-xl p-3" style={{ border: '1px solid hsl(var(--border))' }}><legend className="px-1 text-xs font-bold" style={{ color: 'hsl(var(--fg2))' }}><span className="inline-flex items-center gap-2">{icon}{title}</span></legend><div className="mt-1 max-h-56 space-y-1 overflow-y-auto">{items.length ? items.map((item) => { const value=`${prefix}:${item.id}`; return <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[.02]"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} className="mt-0.5 h-4 w-4 accent-blue-600" /><span className="text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>{item.label}{item.required && <span className="ml-1" style={{ color: 'hsl(var(--accent-amber))' }}>obrigatório</span>}</span></label> }) : <p className="px-2 py-4 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhum item configurado.</p>}</div></fieldset>
}
