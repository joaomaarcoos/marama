'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, Loader2, LockKeyhole, OctagonX, Rocket } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  closeSigecProcess,
  publishSigecProcess,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecPublicationReadiness = {
  code: string
  label: string
  ready: boolean
  detail: string
}

export function SigecProcessPublicationPanel({
  processId,
  status,
  readiness,
}: {
  processId: string
  status: 'draft' | 'open' | 'closed' | 'archived'
  readiness: SigecPublicationReadiness[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const readyCount = readiness.filter((item) => item.ready).length
  const canPublish = status === 'draft' && readiness.length > 0 && readyCount === readiness.length

  function transition(kind: 'publish' | 'close') {
    const confirmation = kind === 'publish'
      ? 'Publicar este processo? Os dados de configuração ficarão bloqueados e o processo poderá aparecer na área pública.'
      : 'Encerrar este processo? Novas candidaturas deixarão de ser aceitas.'
    if (!window.confirm(confirmation)) return

    setMessage('')
    setIsError(false)
    startTransition(async () => {
      const result = kind === 'publish'
        ? await publishSigecProcess(processId)
        : await closeSigecProcess(processId)
      setMessage(result.error || result.success || '')
      setIsError(Boolean(result.error))
      if (result.success) router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
      <div className="p-5" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'hsl(var(--accent-green))' }}>Gate de publicação</p>
            <h2 className="mt-2 text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{readyCount} de {readiness.length} controles prontos</h2>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--accent-green) / .10)', color: 'hsl(var(--accent-green))' }}>
            {canPublish ? <Rocket className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'hsl(var(--muted))' }}>
          <div className="h-full rounded-full transition-all" style={{ width: readiness.length ? `${(readyCount / readiness.length) * 100}%` : '0%', background: 'hsl(var(--accent-green))' }} />
        </div>
      </div>

      <div className="space-y-1 p-3">
        {readiness.map((item) => (
          <div key={item.code} className="group rounded-lg px-2 py-2.5">
            <div className="flex items-start gap-3">
              {item.ready
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--accent-green))' }} />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--fg3))' }} />}
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: item.ready ? 'hsl(var(--fg2))' : 'hsl(var(--fg1))' }}>{item.label}</p>
                {!item.ready && <p className="mt-1 text-[11px] leading-4" style={{ color: 'hsl(var(--fg3))' }}>{item.detail}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4" style={{ borderTop: '1px solid hsl(var(--border))' }}>
        {status === 'draft' && (
          <button type="button" onClick={() => transition('publish')} disabled={!canPublish || isPending} className="ds-btn ds-btn--primary w-full justify-center">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publicar processo
          </button>
        )}
        {status === 'open' && (
          <button type="button" onClick={() => transition('close')} disabled={isPending} className="ds-btn ds-btn--secondary w-full justify-center">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <OctagonX className="h-4 w-4" />}
            Encerrar processo
          </button>
        )}
        {(status === 'closed' || status === 'archived') && (
          <p className="text-center text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Este processo não aceita novas candidaturas.</p>
        )}
        {message && (
          <p aria-live="polite" className="mt-3 rounded-lg px-3 py-2 text-xs leading-5" style={{ background: isError ? 'hsl(var(--destructive) / .08)' : 'hsl(var(--accent-green) / .08)', color: isError ? 'hsl(var(--destructive))' : 'hsl(var(--accent-green))' }}>
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
