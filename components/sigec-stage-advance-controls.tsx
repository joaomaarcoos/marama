'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, CheckCircle2, FileWarning, Loader2, MessageSquareWarning, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { advanceSigecApplicationStage } from '@/app/(dashboard)/sigec-candidaturas/[id]/actions'
import type { SigecAdvancementReadiness, SigecStageOption } from '@/lib/sigec-application-detail'

export function SigecStageAdvanceControls({ applicationId, readiness, stages }: { applicationId: string; readiness: SigecAdvancementReadiness; stages: SigecStageOption[] }) {
  const router = useRouter()
  const [stageId, setStageId] = useState('')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const blocked = !readiness.ready
  function submit() {
    setFeedback(null)
    startTransition(async () => {
      const result = await advanceSigecApplicationStage({ applicationId, toStageId: stageId, publicReason: reason })
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) { setStageId(''); setReason(''); router.refresh() }
    })
  }
  return <section className="overflow-hidden rounded-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex items-start gap-3 px-4 py-4 sm:px-5" style={{ borderBottom: '1px solid hsl(var(--border))' }}><span className="rounded-lg p-2" style={{ background: blocked ? 'hsl(var(--accent-amber) / .12)' : 'hsl(var(--accent-green) / .12)', color: blocked ? 'hsl(var(--accent-amber))' : 'hsl(var(--accent-green))' }}>{blocked ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Avançar candidatura</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>{blocked ? 'A candidatura só avança depois que todas as pendências forem resolvidas e conferidas.' : 'A candidatura está livre de pendências obrigatórias.'}</p></div></header>
    <div className="p-4 sm:p-5">
      {blocked && <div className="mb-4 grid gap-2 sm:grid-cols-2">{readiness.document_blockers > 0 && <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'hsl(var(--accent-red) / .08)', color: 'hsl(var(--accent-red))' }}><FileWarning className="h-4 w-4" /> {readiness.document_blockers} documento(s) obrigatório(s) pendente(s)</p>}{readiness.diligence_blockers > 0 && <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'hsl(var(--accent-amber) / .1)', color: 'hsl(var(--accent-amber))' }}><MessageSquareWarning className="h-4 w-4" /> Solicitação de informações ainda ativa</p>}</div>}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_auto]"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Próxima etapa<select value={stageId} onChange={(event) => setStageId(event.target.value)} disabled={blocked || !stages.length} className="mt-1.5 min-h-11 w-full rounded-lg border px-3 text-sm disabled:opacity-60" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--bg))', color: 'hsl(var(--fg1))' }}><option value="">Selecione</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Mensagem para o candidato<input value={reason} onChange={(event) => setReason(event.target.value)} disabled={blocked} maxLength={2000} placeholder="Explique por que a candidatura mudou de etapa" className="mt-1.5 min-h-11 w-full rounded-lg border px-3 text-sm disabled:opacity-60" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--bg))', color: 'hsl(var(--fg1))' }} /></label><button type="button" onClick={submit} disabled={blocked || pending || !stageId || reason.trim().length < 3} className="ds-btn ds-btn--primary min-h-11 self-end justify-center disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Avançar</button></div>
      {!stages.length && <p className="mt-3 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Não há uma próxima etapa configurada a partir da etapa atual.</p>}
      {feedback?.text && <p role="status" className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: feedback.error ? 'hsl(var(--accent-red) / .1)' : 'hsl(var(--accent-green) / .1)', color: feedback.error ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{feedback.text}</p>}
    </div>
  </section>
}
