'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, FileCheck2, Loader2, LockKeyhole, Send, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  approveSigecRankingSnapshot,
  publishSigecRankingSnapshot,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecRankingSnapshotRow = {
  id: string
  phase: 'preliminary' | 'final'
  version: number
  algorithm_version: string
  row_count: number
  content_hash: string
  frozen_at: string
}

export type SigecRankingApprovalRow = {
  id: string
  snapshot_id: string
  approver_id: string
  approved_at: string
}

export type SigecRankingPublicationRow = {
  id: string
  snapshot_id: string
  public_label: string
  published_at: string
  supersedes_publication_id: string | null
}

const phaseLabel = { preliminary: 'Resultado preliminar', final: 'Resultado final' }

export function SigecRankingPublicationControls({
  processId,
  currentUserId,
  snapshots,
  approvals,
  publications,
}: {
  processId: string
  currentUserId: string
  snapshots: SigecRankingSnapshotRow[]
  approvals: SigecRankingApprovalRow[]
  publications: SigecRankingPublicationRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const latest = new Map<'preliminary' | 'final', number>()
  snapshots.forEach((snapshot) => latest.set(snapshot.phase, Math.max(latest.get(snapshot.phase) ?? 0, snapshot.version)))

  function run(formData: FormData, kind: 'approve' | 'publish') {
    setMessage('')
    setError(false)
    startTransition(async () => {
      const result = kind === 'approve'
        ? await approveSigecRankingSnapshot(formData)
        : await publishSigecRankingSnapshot(formData)
      setMessage(result.error || result.success || '')
      setError(Boolean(result.error))
      if (result.success) router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--accent-green) / .1)', color: 'hsl(var(--accent-green))' }}><FileCheck2 className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Revisão e publicação do resultado</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Cada versão precisa da confirmação de duas pessoas diferentes. Uma nova publicação substitui a anterior sem apagar o histórico.</p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'hsl(var(--accent-blue) / .1)', color: 'hsl(var(--accent-blue))' }}><Users className="h-3.5 w-3.5" /> Dupla confirmação</span>
      </div>

      {!snapshots.length ? (
        <div className="flex gap-3 p-5 sm:p-6" style={{ color: 'hsl(var(--fg3))' }}>
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm leading-6">Nenhum resultado oficial está pronto para revisão. Esta área será liberada quando uma classificação for concluída.</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
          {snapshots.map((snapshot) => {
            const snapshotApprovals = approvals.filter((item) => item.snapshot_id === snapshot.id)
            const publication = publications.find((item) => item.snapshot_id === snapshot.id)
            const ownApproval = snapshotApprovals.some((item) => item.approver_id === currentUserId)
            const isLatest = latest.get(snapshot.phase) === snapshot.version
            const ready = snapshotApprovals.length >= 2
            return (
              <article key={snapshot.id} className="rounded-xl p-4 sm:p-5" style={{ background: 'hsl(var(--muted) / .35)', border: `1px solid hsl(var(${publication ? '--accent-green' : '--border'}) / ${publication ? '.35' : '1'})` }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'hsl(var(--fg1))' }}>{phaseLabel[snapshot.phase]} · versão {snapshot.version}</p>
                    <p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>{snapshot.row_count} candidatura{snapshot.row_count === 1 ? '' : 's'} · concluído em {new Date(snapshot.frozen_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <span className="w-fit rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: publication ? 'hsl(var(--accent-green) / .12)' : ready ? 'hsl(var(--accent-blue) / .1)' : 'hsl(var(--accent-amber) / .1)', color: publication ? 'hsl(var(--accent-green))' : ready ? 'hsl(var(--accent-blue))' : 'hsl(var(--accent-amber))' }}>{publication ? 'Publicado' : `${snapshotApprovals.length}/2 confirmações`}</span>
                </div>

                {!isLatest && !publication && <p className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--accent-amber) / .08)', color: 'hsl(var(--fg2))' }}>Há uma versão mais nova. Esta versão permanece somente no histórico.</p>}
                {publication && <p className="mt-4 flex gap-2 rounded-lg px-3 py-2 text-xs leading-5" style={{ background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{publication.public_label}<br />Publicada em {new Date(publication.published_at).toLocaleString('pt-BR')}</p>}

                {!publication && isLatest && (
                  <div className="mt-4 space-y-3">
                    <form action={(formData) => run(formData, 'approve')} className="space-y-2">
                      <input type="hidden" name="processId" value={processId} /><input type="hidden" name="snapshotId" value={snapshot.id} />
                      <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>O que você conferiu<textarea name="statement" required minLength={10} maxLength={2000} rows={3} disabled={pending || ownApproval} placeholder="Ex.: Conferi pontuações, ordem e quantidade de candidatos." className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm leading-5 disabled:opacity-60" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} /></label>
                      <button disabled={pending || ownApproval} className="ds-btn ds-btn--secondary w-full justify-center">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{ownApproval ? 'Você já confirmou' : 'Confirmar revisão'}</button>
                    </form>
                    <form action={(formData) => run(formData, 'publish')} className="space-y-2 rounded-xl p-3" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
                      <input type="hidden" name="processId" value={processId} /><input type="hidden" name="snapshotId" value={snapshot.id} />
                      <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome que aparecerá ao público<input name="publicLabel" required minLength={3} maxLength={240} defaultValue={`${phaseLabel[snapshot.phase]} — versão ${snapshot.version}`} disabled={pending || !ready} className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm disabled:opacity-60" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} /></label>
                      <label className="flex items-start gap-2 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}><input type="checkbox" name="explicitConfirmation" value="true" required disabled={pending || !ready} className="mt-1" /> Confirmo que esta é a versão correta para publicação oficial.</label>
                      <button disabled={pending || !ready} className="ds-btn ds-btn--primary w-full justify-center">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publicar resultado</button>
                    </form>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
      {message && <p aria-live="polite" className="m-4 rounded-lg px-3 py-2 text-sm sm:m-5" style={{ background: error ? 'hsl(var(--destructive) / .08)' : 'hsl(var(--accent-green) / .08)', color: error ? 'hsl(var(--destructive))' : 'hsl(var(--accent-green))' }}>{message}</p>}
    </section>
  )
}
