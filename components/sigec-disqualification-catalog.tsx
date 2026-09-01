'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { confirmSigecDisqualificationCatalog, createSigecDisqualificationCatalog } from '@/app/(dashboard)/sigec-processos/actions'

export type SigecDisqualificationCatalogRow = {
  id: string
  version: number
  source_reference: string
  status: 'draft' | 'confirmed' | 'retired'
  normative_status: 'pending_confirmation' | 'confirmed'
  confirmed_at: string | null
}

export type SigecDisqualificationReasonRow = {
  id: string
  catalog_version_id: string
  code: string
  label: string
  position: number
  active: boolean
}

export function SigecDisqualificationCatalog({ processId, editable, catalogs, reasons }: {
  processId: string
  editable: boolean
  catalogs: SigecDisqualificationCatalogRow[]
  reasons: SigecDisqualificationReasonRow[]
}) {
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const current = catalogs.find((item) => item.status === 'draft') || catalogs.find((item) => item.status === 'confirmed')
  const currentReasons = current ? reasons.filter((item) => item.catalog_version_id === current.id && item.active) : []

  function createCatalog() {
    startTransition(async () => {
      const result = await createSigecDisqualificationCatalog(processId)
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) router.refresh()
    })
  }

  function confirmCatalog() {
    if (!current || !confirmed) return
    startTransition(async () => {
      const result = await confirmSigecDisqualificationCatalog(processId, current.id, confirmed)
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) { setConfirmed(false); router.refresh() }
    })
  }

  return <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6" style={{ borderColor: 'hsl(var(--border))' }}>
      <div><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: 'hsl(var(--accent-red))' }}>Motivos de desclassificação</p><h2 className="mt-1 font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Catálogo normativo versionado</h2><p className="mt-2 max-w-3xl text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Estes nove motivos vieram do Edital nº 01/2026 antigo. Eles só podem ser usados depois que uma pessoa responsável confirmar que continuam válidos para este processo.</p></div>
      {current && <span className="w-fit rounded-full px-3 py-1 text-xs font-bold" style={{ background: current.status === 'confirmed' ? 'hsl(var(--accent-green) / .12)' : 'hsl(var(--accent-amber) / .12)', color: current.status === 'confirmed' ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-amber))' }}>{current.status === 'confirmed' ? `Confirmado · v${current.version}` : `Aguardando confirmação · v${current.version}`}</span>}
    </header>
    <div className="p-5 sm:p-6">
      {!current ? <div className="rounded-xl p-4" style={{ background: 'hsl(var(--accent-amber) / .08)', border: '1px solid hsl(var(--accent-amber) / .3)' }}><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-amber))' }} /><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Nenhum catálogo criado</p><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>Crie o rascunho histórico para revisão. Isso não confirma nem libera os motivos.</p></div></div>{editable && <button type="button" disabled={pending} onClick={createCatalog} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold disabled:opacity-60" style={{ background: 'hsl(var(--accent-blue))', color: 'white' }}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar rascunho para revisar</button>}</div> : <>
        <ol className="space-y-2">{currentReasons.map((reason) => <li key={reason.id} className="flex gap-3 rounded-lg p-3" style={{ background: 'hsl(var(--muted) / .55)', color: 'hsl(var(--fg1))' }}><span className="font-data text-xs font-bold" style={{ color: 'hsl(var(--accent-blue))' }}>{reason.position}.</span><span className="text-sm leading-5">{reason.label}</span></li>)}</ol>
        <p className="mt-4 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Fonte registrada: {current.source_reference}</p>
        {current.status === 'draft' && editable && <div className="mt-5 rounded-xl p-4" style={{ background: 'hsl(var(--accent-red) / .07)', border: '1px solid hsl(var(--accent-red) / .3)' }}><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-red))' }} /><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Confirmação normativa</p><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>Confirme somente depois de validar oficialmente os nove itens. A confirmação fica auditada e libera o uso nas candidaturas.</p></div></div><label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />Confirmo que revisei os nove motivos e que eles valem para este processo.</label><button type="button" disabled={pending || !confirmed || currentReasons.length !== 9} onClick={confirmCatalog} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'hsl(var(--accent-red))', color: 'white' }}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirmar catálogo</button></div>}
      </>}
      {feedback && <p className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: feedback.error ? 'hsl(var(--accent-red) / .08)' : 'hsl(var(--accent-green) / .1)', color: feedback.error ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{feedback.text}</p>}
    </div>
  </section>
}
