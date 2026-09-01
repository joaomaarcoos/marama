'use client'

import { useState, useTransition } from 'react'
import { Ban, Loader2, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { disqualifySigecApplication } from '@/app/(dashboard)/sigec-candidaturas/[id]/actions'
import type { SigecDisqualificationDecision, SigecDisqualificationReason } from '@/lib/sigec-application-detail'

export function SigecDisqualificationControls({ applicationId, applicationState, reasons, decision }: {
  applicationId: string
  applicationState: string
  reasons: SigecDisqualificationReason[]
  decision: SigecDisqualificationDecision | null
}) {
  const router = useRouter()
  const [reasonId, setReasonId] = useState('')
  const [publicMessage, setPublicMessage] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (decision) return <section className="rounded-2xl p-5" style={{ background: 'hsl(var(--accent-red) / .07)', border: '1px solid hsl(var(--accent-red) / .35)' }}><div className="flex gap-3"><Ban className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-red))' }} /><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Candidatura desclassificada</h2><p className="mt-2 text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{decision.reason_label}</p><p className="mt-1 text-sm leading-6" style={{ color: 'hsl(var(--fg2))' }}>{decision.public_message}</p><p className="mt-3 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Motivo {decision.reason_code} · catálogo v{decision.catalog_version}</p></div></div></section>

  const disabled = applicationState !== 'submitted' || reasons.length === 0
  function submit() {
    setFeedback(null)
    startTransition(async () => {
      const result = await disqualifySigecApplication({ applicationId, reasonId, publicMessage, internalNote, confirmation })
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) router.refresh()
    })
  }
  return <section className="overflow-hidden rounded-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--accent-red) / .35)' }}><header className="flex gap-3 border-b p-5" style={{ borderColor: 'hsl(var(--border))' }}><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-red))' }} /><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Desclassificar candidatura</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>{reasons.length ? 'A decisão muda a etapa, registra o motivo e fica visível ao candidato.' : 'Indisponível: confirme primeiro o catálogo normativo deste processo.'}</p></div></header><div className="space-y-4 p-5">
    <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Motivo oficial<select value={reasonId} onChange={(e) => setReasonId(e.target.value)} disabled={disabled || pending} className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }}><option value="">Selecione</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.position}. {reason.label}</option>)}</select></label>
    <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Mensagem para o candidato<textarea value={publicMessage} onChange={(e) => setPublicMessage(e.target.value)} disabled={disabled || pending} maxLength={2000} rows={3} className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} placeholder="Explique a decisão em linguagem simples." /></label>
    <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nota interna (opcional)<textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} disabled={disabled || pending} maxLength={5000} rows={2} className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} placeholder="Esta nota não aparece para o candidato." /></label>
    <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Para confirmar, digite DESCLASSIFICAR<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={disabled || pending} autoComplete="off" className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} /></label>
    <button type="button" onClick={submit} disabled={disabled || pending || confirmation !== 'DESCLASSIFICAR' || !reasonId || publicMessage.trim().length < 3} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" style={{ background: 'hsl(var(--accent-red))', color: 'white' }}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Desclassificar</button>
    {feedback && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: feedback.error ? 'hsl(var(--accent-red) / .08)' : 'hsl(var(--accent-green) / .1)', color: feedback.error ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{feedback.text}</p>}
  </div></section>
}
