'use client'

import { useState, useTransition } from 'react'
import { Calculator, CheckCircle2, FlaskConical, GitCommit, Loader2, LockKeyhole, Plus, Scale, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  confirmSigecScoringVersion, deleteSigecScoringRuleItem, upsertSigecScoringItem,
  upsertSigecScoringVersion, upsertSigecTieBreakRule, type SigecProcessActionState,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecScoringVersionRow = {
  id: string; version: number; label: string; status: 'draft' | 'internal' | 'official'
  is_provisional: boolean; total_max_points: number; source_reference: string
  recorded_at: string; confirmed_at: string | null
}
export type SigecScoringItemRow = { id: string; rule_version_id: string; code: string; label: string; instructions: string | null; max_points: number; position: number }
export type SigecTieBreakRow = { id: string; rule_version_id: string; code: string; label: string; value_source: string; direction: 'asc' | 'desc'; position: number }

const field = 'mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 disabled:opacity-60'
const fieldStyle = { background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }
function codeify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }

export function SigecScoringConfiguration({ processId, editable, versions, items, tieBreaks }: {
  processId: string; editable: boolean; versions: SigecScoringVersionRow[]
  items: SigecScoringItemRow[]; tieBreaks: SigecTieBreakRow[]
}) {
  const router = useRouter(); const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SigecProcessActionState>({})
  const draft = versions.find((version) => version.status === 'draft')
  const active = draft || versions[0]
  const versionItems = active ? items.filter((item) => item.rule_version_id === active.id) : []
  const versionTies = active ? tieBreaks.filter((rule) => rule.rule_version_id === active.id) : []
  const configuredTotal = versionItems.reduce((sum, item) => sum + Number(item.max_points), 0)
  const canEditRules = editable && active?.status === 'draft'

  function run(action: () => Promise<SigecProcessActionState>) {
    setResult({}); startTransition(async () => { const next = await action(); setResult(next); if (next.success) router.refresh() })
  }

  return <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
      <div className="flex items-start gap-3"><span className="rounded-lg p-2" style={{ background: 'hsl(var(--accent-blue) / .10)', color: 'hsl(var(--accent-blue))' }}><Calculator className="h-4 w-4" /></span><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Pontuação e desempates</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Cada alteração normativa gera uma nova versão. Após confirmação, critérios e ordem ficam imutáveis.</p></div></div>
      {active && <span className="self-start rounded-full px-3 py-1 text-xs font-bold uppercase" style={{ background: active.status === 'official' ? 'hsl(var(--accent-green) / .10)' : 'hsl(var(--accent-amber) / .10)', color: active.status === 'official' ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-amber))' }}>v{active.version} · {active.status === 'draft' ? 'rascunho' : active.status === 'internal' ? 'teste interno' : 'oficial'}</span>}
    </header>
    {result.error && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>{result.error}</p>}
    {result.success && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}>{result.success}</p>}

    <div className="grid xl:grid-cols-[330px_minmax(0,1fr)]">
      <div className="p-5 xl:border-r" style={{ borderColor: 'hsl(var(--border))' }}>
        {active ? <div className="space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background) / .38)' }}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{active.label}</p><p className="mt-1 text-[11px] leading-5" style={{ color: 'hsl(var(--fg3))' }}>{active.source_reference}</p></div>{active.status !== 'draft' && <LockKeyhole className="h-4 w-4" style={{ color: 'hsl(var(--fg3))' }} />}</div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-[10px] font-bold uppercase" style={{ color: 'hsl(var(--fg3))' }}>Configurado</p><p className="font-data text-lg font-bold" style={{ color: configuredTotal === Number(active.total_max_points) ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-amber))' }}>{configuredTotal} / {Number(active.total_max_points)}</p></div><div><p className="text-[10px] font-bold uppercase" style={{ color: 'hsl(var(--fg3))' }}>Desempates</p><p className="font-data text-lg font-bold" style={{ color: versionTies.length ? 'hsl(var(--fg1))' : 'hsl(var(--accent-amber))' }}>{versionTies.length}</p></div></div>
            {active.is_provisional && <p className="mt-4 flex gap-2 rounded-lg p-3 text-[11px] leading-5" style={{ background: 'hsl(var(--accent-amber) / .09)', color: 'hsl(var(--fg2))' }}><FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />Provisória: pode ser fechada para testes internos, mas nunca libera a publicação oficial.</p>}
          </div>
          <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg3))' }}>Histórico imutável</p>{versions.map((version) => <div key={version.id} className="flex items-center gap-2 border-t py-2 text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg2))' }}><GitCommit className="h-3.5 w-3.5" /><span className="font-semibold">v{version.version}</span><span className="truncate">{version.label}</span></div>)}</div>
          {canEditRules && <div className="grid gap-2"><button disabled={pending} onClick={() => run(() => confirmSigecScoringVersion(processId, active.id, 'internal'))} className="ds-btn ds-btn--ghost justify-center text-xs"><CheckCircle2 className="h-4 w-4" /> Fechar para teste interno</button><button disabled={pending || active.is_provisional} onClick={() => window.confirm('Confirmar como oficial? A versão ficará permanentemente bloqueada.') && run(() => confirmSigecScoringVersion(processId, active.id, 'official'))} className="ds-btn ds-btn--primary justify-center text-xs"><LockKeyhole className="h-4 w-4" /> Confirmar versão oficial</button></div>}
        </div> : editable ? <VersionForm processId={processId} pending={pending} run={run} /> : <p className="text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhuma versão registrada.</p>}
        {!draft && editable && active && <div className="mt-5 border-t pt-5" style={{ borderColor: 'hsl(var(--border))' }}><VersionForm processId={processId} pending={pending} run={run} nextVersion={(versions[0]?.version || 0) + 1} /></div>}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <RuleColumn title="Critérios de pontuação" icon={<Scale className="h-4 w-4" />} empty="Nenhum critério cadastrado.">
          {versionItems.map((item) => <RuleCard key={item.id} title={item.label} meta={`${item.max_points} pontos · ordem ${item.position}`} onDelete={canEditRules ? () => run(() => deleteSigecScoringRuleItem(processId, active!.id, 'criterion', item.id)) : undefined} />)}
          {!versionItems.length && !canEditRules && <EmptyRule text="Nenhum critério cadastrado." />}
          {canEditRules && <form action={(data) => run(() => upsertSigecScoringItem(data))} className="space-y-3 rounded-xl border border-dashed p-4" style={{ borderColor: 'hsl(var(--border))' }}><input type="hidden" name="processId" value={processId} /><input type="hidden" name="versionId" value={active!.id} /><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome<input name="label" onChange={(event) => { const form = event.currentTarget.form; if (form) (form.elements.namedItem('code') as HTMLInputElement).value = codeify(event.target.value) }} className={field} style={fieldStyle} required /></label><div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Código<input name="code" className={field} style={fieldStyle} required /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Pontos<input name="maxPoints" type="number" min="0.01" step="0.01" className={field} style={fieldStyle} required /></label></div><input type="hidden" name="position" value={versionItems.length * 10} /><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Instruções<textarea name="instructions" className={`${field} min-h-20`} style={fieldStyle} /></label><button disabled={pending} className="ds-btn ds-btn--ghost w-full justify-center text-xs"><Plus className="h-3.5 w-3.5" /> Adicionar critério</button></form>}
        </RuleColumn>

        <RuleColumn title="Ordem de desempate" icon={<GitCommit className="h-4 w-4" />} empty="Nenhum desempate cadastrado.">
          {versionTies.map((rule) => <RuleCard key={rule.id} title={`${rule.position}. ${rule.label}`} meta={`${rule.direction === 'desc' ? 'Maior valor primeiro' : 'Menor valor primeiro'} · ${rule.value_source}`} onDelete={canEditRules ? () => run(() => deleteSigecScoringRuleItem(processId, active!.id, 'tie_break', rule.id)) : undefined} />)}
          {!versionTies.length && !canEditRules && <EmptyRule text="Nenhum desempate cadastrado." />}
          {canEditRules && <form action={(data) => run(() => upsertSigecTieBreakRule(data))} className="space-y-3 rounded-xl border border-dashed p-4" style={{ borderColor: 'hsl(var(--border))' }}><input type="hidden" name="processId" value={processId} /><input type="hidden" name="versionId" value={active!.id} /><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome<input name="label" onChange={(event) => { const form = event.currentTarget.form; if (form) (form.elements.namedItem('code') as HTMLInputElement).value = codeify(event.target.value) }} className={field} style={fieldStyle} required /></label><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Código<input name="code" className={field} style={fieldStyle} required /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Fonte do valor<input name="valueSource" placeholder="score_total" className={field} style={fieldStyle} required /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Prioridade<input name="position" type="number" min="1" defaultValue={versionTies.length + 1} className={field} style={fieldStyle} required /></label></div><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Ordenação<select name="direction" defaultValue="desc" className={field} style={fieldStyle}><option value="desc">Maior valor primeiro</option><option value="asc">Menor valor primeiro</option></select></label><button disabled={pending} className="ds-btn ds-btn--ghost w-full justify-center text-xs"><Plus className="h-3.5 w-3.5" /> Adicionar desempate</button></form>}
        </RuleColumn>
      </div>
    </div>
    {pending && <div className="flex items-center justify-center gap-2 border-t px-5 py-3 text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg3))' }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando configuração auditável…</div>}
  </section>
}

function VersionForm({ processId, pending, run, nextVersion = 1 }: { processId: string; pending: boolean; nextVersion?: number; run: (action: () => Promise<SigecProcessActionState>) => void }) {
  return <form action={(data) => run(() => upsertSigecScoringVersion(data))} className="space-y-3"><input type="hidden" name="processId" value={processId} /><input type="hidden" name="isProvisional" value="false" /><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Criar versão {nextVersion}</p><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>Marque como provisória enquanto houver reconfirmação pendente.</p></div><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome<input name="label" defaultValue="Regras de pontuação e desempate" className={field} style={fieldStyle} required /></label><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Total máximo<input name="totalMaxPoints" type="number" min="0.01" step="0.01" defaultValue="30" className={field} style={fieldStyle} required /></label><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Referência da fonte<textarea name="sourceReference" defaultValue="Rubrica provisória aprovada para testes internos; reconfirmação oficial pendente." className={`${field} min-h-20`} style={fieldStyle} required /></label><label className="flex items-start gap-2 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}><input type="checkbox" name="isProvisional" value="true" defaultChecked /> Versão provisória — bloqueia confirmação e publicação oficial</label><button disabled={pending} className="ds-btn ds-btn--primary w-full justify-center"><Plus className="h-4 w-4" /> Criar versão</button></form>
}

function RuleColumn({ title, icon, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) { return <div><div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{icon}{title}</div><div className="space-y-2">{children}</div></div> }
function EmptyRule({ text }: { text: string }) { return <p className="rounded-lg border border-dashed py-8 text-center text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg3))' }}>{text}</p> }
function RuleCard({ title, meta, onDelete }: { title: string; meta: string; onDelete?: () => void }) { return <div className="flex items-start justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}><div><p className="text-xs font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{title}</p><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{meta}</p></div>{onDelete && <button type="button" aria-label="Excluir regra" onClick={() => window.confirm('Excluir esta regra?') && onDelete()} style={{ color: 'hsl(var(--destructive))' }}><Trash2 className="h-3.5 w-3.5" /></button>}</div> }
