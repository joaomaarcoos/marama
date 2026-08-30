'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, BellRing, Flag, GitBranch, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  deleteSigecStage,
  deleteSigecStageTransition,
  upsertSigecStage,
  upsertSigecStageTransition,
  type SigecProcessActionState,
} from '@/app/(dashboard)/sigec-processos/actions'
import { SIGEC_DEFAULT_STAGES } from '@/lib/sigec-stages'

export type SigecStageRow = {
  id: string; code: string; label: string; public_description: string | null; color: string
  position: number; is_initial: boolean; is_terminal: boolean; allows_appeal: boolean; whatsapp_template: string | null
}
export type SigecStageTransitionRow = {
  id: string; from_stage_id: string; to_stage_id: string
  requires_reason: boolean; blocks_on_pending: boolean; active: boolean
}

const inputClass = 'mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
const inputStyle = { background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }
function codeify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }

export function SigecStageConfiguration({ processId, editable, stages, transitions }: {
  processId: string; editable: boolean; stages: SigecStageRow[]; transitions: SigecStageTransitionRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SigecProcessActionState>({})
  const [panel, setPanel] = useState<'stage' | 'transition'>('stage')
  const [editingStage, setEditingStage] = useState<SigecStageRow | null>(null)
  const [editingTransition, setEditingTransition] = useState<SigecStageTransitionRow | null>(null)
  const [label, setLabel] = useState(''); const [code, setCode] = useState('')
  const [description, setDescription] = useState(''); const [color, setColor] = useState('#2563eb')
  const [template, setTemplate] = useState(''); const [isInitial, setIsInitial] = useState(false)
  const [isTerminal, setIsTerminal] = useState(false); const [allowsAppeal, setAllowsAppeal] = useState(false)

  function complete(action: () => Promise<SigecProcessActionState>, reset: () => void) {
    setResult({}); startTransition(async () => {
      const next = await action(); setResult(next)
      if (next.success) { reset(); router.refresh() }
    })
  }
  function beginStage(stage: SigecStageRow | null) {
    setPanel('stage')
    setEditingStage(stage); setEditingTransition(null); setLabel(stage?.label || ''); setCode(stage?.code || '')
    setDescription(stage?.public_description || ''); setColor(stage?.color || '#2563eb')
    setTemplate(stage?.whatsapp_template || ''); setIsInitial(stage?.is_initial || false)
    setIsTerminal(stage?.is_terminal || false); setAllowsAppeal(stage?.allows_appeal || false); setResult({})
  }
  function applyPreset(presetCode: string) {
    const preset = SIGEC_DEFAULT_STAGES.find((item) => item.code === presetCode)
    if (!preset) return
    setLabel(preset.label); setCode(preset.code); setDescription(preset.publicDescription)
    setColor(preset.color); setTemplate(preset.whatsappTemplate); setIsInitial(preset.code === 'documentacao_pendente')
    setIsTerminal(preset.terminal); setAllowsAppeal(preset.allowsAppeal)
  }
  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.label || 'Etapa removida'

  return <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
      <div><div className="flex items-center gap-2"><GitBranch className="h-4 w-4" style={{ color: 'hsl(var(--accent-blue))' }} /><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Fluxo da candidatura</h2></div><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Configure o caminho permitido, a mensagem exibida ao candidato e o aviso preparado para WhatsApp.</p></div>
      {!editable && <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Fluxo bloqueado</span>}
    </div>
    {result.error && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>{result.error}</p>}
    {result.success && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}>{result.success}</p>}

    <div className="grid xl:grid-cols-[minmax(0,1fr)_410px]">
      <div className="p-5 xl:border-r" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg2))' }}>Etapas configuradas</h3>{editable && <button type="button" onClick={() => beginStage(null)} className="ds-btn ds-btn--ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Nova etapa</button>}</div>
        <div className="relative space-y-3 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-slate-500/25">
          {stages.map((stage) => <div key={stage.id} className="relative grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 rounded-xl border p-3" style={{ borderColor: editingStage?.id === stage.id ? 'hsl(var(--accent-blue))' : 'hsl(var(--border))', background: 'hsl(var(--background) / .42)' }}>
            <span className="relative z-10 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-4" style={{ background: stage.color, borderColor: 'hsl(var(--card))' }}>{stage.is_terminal ? <Flag className="h-3.5 w-3.5 text-white" /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{stage.label}</p>{stage.is_initial && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'hsl(var(--accent-blue) / .10)', color: 'hsl(var(--accent-blue))' }}>inicial</span>}{stage.is_terminal && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'hsl(var(--fg3) / .10)', color: 'hsl(var(--fg2))' }}>terminal</span>}</div><p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>{stage.public_description || 'Sem mensagem pública'}</p><div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: stage.whatsapp_template ? 'hsl(var(--accent-green))' : 'hsl(var(--accent-amber))' }}><BellRing className="h-3 w-3" />{stage.whatsapp_template ? 'WhatsApp configurado' : 'WhatsApp pendente'}</div></div>
            {editable && <div className="flex"><button type="button" aria-label="Editar etapa" onClick={() => beginStage(stage)} className="rounded p-1.5" style={{ color: 'hsl(var(--fg3))' }}><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label="Excluir etapa" onClick={() => window.confirm('Excluir esta etapa e suas transições?') && complete(() => deleteSigecStage(processId, stage.id), () => beginStage(null))} className="rounded p-1.5" style={{ color: 'hsl(var(--destructive))' }}><Trash2 className="h-3.5 w-3.5" /></button></div>}
          </div>)}
          {!stages.length && <p className="rounded-lg border border-dashed py-10 text-center text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhuma etapa configurada.</p>}
        </div>

        <div className="mb-3 mt-7 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg2))' }}>Transições permitidas</h3>{editable && stages.length > 1 && stages.some((stage) => !stage.is_terminal) && <button type="button" onClick={() => { setPanel('transition'); setEditingTransition(null); setEditingStage(null); setResult({}) }} className="ds-btn ds-btn--ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Nova transição</button>}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {transitions.map((transition) => <div key={transition.id} className="rounded-lg border p-3" style={{ borderColor: editingTransition?.id === transition.id ? 'hsl(var(--accent-blue))' : 'hsl(var(--border))', opacity: transition.active ? 1 : .55 }}><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2 text-xs font-semibold" style={{ color: 'hsl(var(--fg1))' }}><span className="truncate">{stageName(transition.from_stage_id)}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{stageName(transition.to_stage_id)}</span></div>{editable && <div className="flex"><button type="button" onClick={() => { setPanel('transition'); setEditingTransition(transition); setEditingStage(null); setResult({}) }} className="rounded p-1"><Pencil className="h-3 w-3" /></button><button type="button" onClick={() => window.confirm('Excluir esta transição?') && complete(() => deleteSigecStageTransition(processId, transition.id), () => setEditingTransition(null))} className="rounded p-1" style={{ color: 'hsl(var(--destructive))' }}><Trash2 className="h-3 w-3" /></button></div>}</div><p className="mt-2 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{transition.blocks_on_pending ? 'Bloqueia com pendência' : 'Não verifica pendência'} · {transition.requires_reason ? 'exige motivo' : 'motivo opcional'}</p></div>)}
          {!transitions.length && <p className="col-span-full rounded-lg border border-dashed py-6 text-center text-xs" style={{ color: 'hsl(var(--fg3))' }}>Conecte as etapas para formar o fluxo.</p>}
        </div>
      </div>

      <div className="p-5">
        {!editable ? <p className="rounded-lg border border-dashed p-5 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>O processo já saiu do rascunho. O fluxo permanece visível para auditoria, sem permitir alterações retroativas.</p> : panel === 'stage' ? <form key={editingStage?.id || 'new-stage'} action={(formData) => complete(() => upsertSigecStage(formData), () => beginStage(null))} className="space-y-3">
          <input type="hidden" name="processId" value={processId} /><input type="hidden" name="stageId" value={editingStage?.id || ''} /><input type="hidden" name="isInitial" value="false" /><input type="hidden" name="isTerminal" value="false" /><input type="hidden" name="allowsAppeal" value="false" />
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{editingStage ? 'Editar etapa' : 'Adicionar etapa'}</h3>{editingStage && <button type="button" onClick={() => beginStage(null)} aria-label="Cancelar edição"><X className="h-4 w-4" /></button>}</div>
          {!editingStage && <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Usar sugestão<select defaultValue="" onChange={(event) => applyPreset(event.target.value)} className={inputClass} style={inputStyle}><option value="">Começar em branco</option>{SIGEC_DEFAULT_STAGES.map((preset) => <option key={preset.code} value={preset.code}>{preset.label}</option>)}</select></label>}
          <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome<input name="label" value={label} onChange={(event) => { setLabel(event.target.value); if (!editingStage) setCode(codeify(event.target.value)) }} className={inputClass} style={inputStyle} required /></label>
          <div className="grid grid-cols-[minmax(0,1fr)_85px] gap-3"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Código<input name="code" value={code} onChange={(event) => setCode(codeify(event.target.value))} className={inputClass} style={inputStyle} required /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Ordem<input name="position" type="number" min="0" defaultValue={editingStage?.position ?? stages.length * 10} className={inputClass} style={inputStyle} required /></label></div>
          <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Mensagem pública<textarea name="publicDescription" value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} min-h-24`} style={inputStyle} required /></label>
          <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Template do WhatsApp<textarea name="whatsappTemplate" value={template} onChange={(event) => setTemplate(event.target.value)} className={`${inputClass} min-h-32`} style={inputStyle} required /><span className="mt-1 block font-normal" style={{ color: 'hsl(var(--fg3))' }}>Variáveis: {'{{nome}}'}, {'{{processo}}'}, {'{{status}}'}, {'{{link}}'} e {'{{prazo}}'}.</span></label>
          <label className="flex items-center justify-between gap-3 text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Cor da etapa<input name="color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-16 rounded border bg-transparent p-1" style={{ borderColor: 'hsl(var(--border))' }} /></label>
          <div className="grid gap-2 text-xs sm:grid-cols-3" style={{ color: 'hsl(var(--fg2))' }}><label className="flex items-center gap-2"><input type="checkbox" name="isInitial" value="true" checked={isInitial} onChange={(event) => { setIsInitial(event.target.checked); if (event.target.checked) setIsTerminal(false) }} /> Inicial</label><label className="flex items-center gap-2"><input type="checkbox" name="isTerminal" value="true" checked={isTerminal} onChange={(event) => { setIsTerminal(event.target.checked); if (event.target.checked) setIsInitial(false) }} /> Terminal</label><label className="flex items-center gap-2"><input type="checkbox" name="allowsAppeal" value="true" checked={allowsAppeal} onChange={(event) => setAllowsAppeal(event.target.checked)} /> Permite recurso</label></div>
          <button className="ds-btn ds-btn--primary w-full justify-center" disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingStage ? 'Salvar etapa' : 'Adicionar etapa'}</button>
        </form> : <form key={editingTransition?.id || 'new-transition'} action={(formData) => complete(() => upsertSigecStageTransition(formData), () => setEditingTransition(null))} className="space-y-3">
          <input type="hidden" name="processId" value={processId} /><input type="hidden" name="transitionId" value={editingTransition?.id || ''} /><input type="hidden" name="requiresReason" value="false" /><input type="hidden" name="blocksOnPending" value="false" /><input type="hidden" name="active" value="false" />
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{editingTransition ? 'Editar transição' : 'Adicionar transição'}</h3><button type="button" onClick={() => beginStage(null)} aria-label="Voltar ao formulário de etapa"><X className="h-4 w-4" /></button></div>
          <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Origem<select name="fromStageId" defaultValue={editingTransition?.from_stage_id || stages.find((stage) => !stage.is_terminal)?.id} className={inputClass} style={inputStyle} required>{stages.filter((stage) => !stage.is_terminal || stage.id === editingTransition?.from_stage_id).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
          <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Destino<select name="toStageId" defaultValue={editingTransition?.to_stage_id || stages[1]?.id || stages[0]?.id} className={inputClass} style={inputStyle} required>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
          <div className="space-y-2 text-xs" style={{ color: 'hsl(var(--fg2))' }}><label className="flex items-center gap-2"><input type="checkbox" name="blocksOnPending" value="true" defaultChecked={editingTransition?.blocks_on_pending ?? true} /> Não avançar com documentos ou diligências pendentes</label><label className="flex items-center gap-2"><input type="checkbox" name="requiresReason" value="true" defaultChecked={editingTransition?.requires_reason ?? false} /> Exigir motivo público na mudança</label><label className="flex items-center gap-2"><input type="checkbox" name="active" value="true" defaultChecked={editingTransition?.active ?? true} /> Transição ativa</label></div>
          <button className="ds-btn ds-btn--primary w-full justify-center" disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{editingTransition ? 'Salvar transição' : 'Conectar etapas'}</button>
        </form>}
      </div>
    </div>
  </section>
}
