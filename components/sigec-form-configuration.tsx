'use client'

import { useState, useTransition } from 'react'
import { CheckSquare, FileCheck2, FileText, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  deleteSigecFormConfiguration,
  upsertSigecFormConfiguration,
  type SigecProcessActionState,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecFormKind = 'question' | 'document' | 'declaration'
export type SigecAudience = 'all' | 'pcd' | 'ppp' | 'pcd_or_ppp'
export type SigecQuestionRow = {
  id: string; code: string; label: string; help_text: string | null
  question_type: string; required: boolean; config: { audience?: SigecAudience; options?: string[]; audienceMarker?: 'pcd' | 'ppp' }; position: number
}
export type SigecDocumentRow = {
  id: string; code: string; label: string; instructions: string | null; required: boolean
  accepted_mime_types: string[]; max_file_size_bytes: number
  condition_config: { audience?: SigecAudience }; position: number
}
export type SigecDeclarationRow = {
  id: string; code: string; label: string; content: string; version: string
  audience: SigecAudience; required: boolean; position: number
}

type EditableItem = (SigecQuestionRow | SigecDocumentRow | SigecDeclarationRow) & { kind: SigecFormKind }
const inputClass = 'mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
const inputStyle = { background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }
const audienceLabels: Record<SigecAudience, string> = { all: 'Todos', pcd: 'Somente PCD', ppp: 'Somente PPP', pcd_or_ppp: 'PCD ou PPP' }

function codeify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function itemAudience(item: EditableItem): SigecAudience {
  if (item.kind === 'question') return (item as SigecQuestionRow).config?.audience || 'all'
  if (item.kind === 'document') return (item as SigecDocumentRow).condition_config?.audience || 'all'
  return (item as SigecDeclarationRow).audience
}

export function SigecFormConfiguration({ processId, editable, questions, documents, declarations }: {
  processId: string; editable: boolean; questions: SigecQuestionRow[]
  documents: SigecDocumentRow[]; declarations: SigecDeclarationRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SigecProcessActionState>({})
  const [kind, setKind] = useState<SigecFormKind>('question')
  const [editing, setEditing] = useState<EditableItem | null>(null)
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [questionType, setQuestionType] = useState('short_text')

  const rows: Record<SigecFormKind, EditableItem[]> = {
    question: questions.map((item) => ({ ...item, kind: 'question' })),
    document: documents.map((item) => ({ ...item, kind: 'document' })),
    declaration: declarations.map((item) => ({ ...item, kind: 'declaration' })),
  }

  function begin(nextKind: SigecFormKind, item: EditableItem | null = null) {
    setKind(nextKind); setEditing(item); setLabel(item?.label || ''); setCode(item?.code || '')
    setQuestionType(item?.kind === 'question' ? (item as SigecQuestionRow).question_type : 'short_text')
    setResult({})
  }

  function complete(action: () => Promise<SigecProcessActionState>) {
    setResult({})
    startTransition(async () => {
      const next = await action(); setResult(next)
      if (next.success) { begin(kind); router.refresh() }
    })
  }

  function details(item: EditableItem | null) {
    if (!item) return ''
    if (item.kind === 'question') return (item as SigecQuestionRow).help_text || ''
    if (item.kind === 'document') return (item as SigecDocumentRow).instructions || ''
    return (item as SigecDeclarationRow).content
  }

  const activeRows = rows[kind]
  const activeTitle = { question: 'Perguntas', document: 'Documentos', declaration: 'Declarações' }[kind]
  const activeIcon = { question: CheckSquare, document: FileCheck2, declaration: FileText }[kind]
  const ActiveIcon = activeIcon
  const currentQuestion = editing?.kind === 'question' ? editing as SigecQuestionRow : null
  const currentDocument = editing?.kind === 'document' ? editing as SigecDocumentRow : null
  const currentDeclaration = editing?.kind === 'declaration' ? editing as SigecDeclarationRow : null

  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Formulário e comprovações</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Defina perguntas, anexos e termos por público. Os modelos jurídicos permanecem editáveis até a confirmação oficial.</p></div>
        {!editable && <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Configuração bloqueada</span>}
      </div>

      <div className="grid sm:grid-cols-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        {(['question', 'document', 'declaration'] as SigecFormKind[]).map((tab) => {
          const Icon = { question: CheckSquare, document: FileCheck2, declaration: FileText }[tab]
          return <button key={tab} type="button" onClick={() => begin(tab)} className="flex items-center justify-between gap-3 px-5 py-3 text-left text-sm font-semibold transition" style={{ color: kind === tab ? 'hsl(var(--accent-blue))' : 'hsl(var(--fg2))', background: kind === tab ? 'hsl(var(--accent-blue) / .07)' : 'transparent', borderRight: tab !== 'declaration' ? '1px solid hsl(var(--border))' : undefined }}><span className="flex items-center gap-2"><Icon className="h-4 w-4" />{{ question: 'Perguntas', document: 'Documentos', declaration: 'Declarações' }[tab]}</span><span className="font-data text-xs">{rows[tab].length}</span></button>
        })}
      </div>

      {result.error && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>{result.error}</p>}
      {result.success && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}>{result.success}</p>}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="p-5 xl:border-r" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg2))' }}><ActiveIcon className="h-4 w-4" />{activeTitle}</h3>{editable && <button type="button" onClick={() => begin(kind)} className="ds-btn ds-btn--ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Novo item</button>}</div>
          <div className="space-y-2">
            {activeRows.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3" style={{ borderColor: editing?.id === item.id ? 'hsl(var(--accent-blue))' : 'hsl(var(--border))' }}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{item.label}</p>{item.required && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>obrigatório</span>}</div><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{item.code} · {audienceLabels[itemAudience(item)]}</p></div>{editable && <div className="flex"><button type="button" aria-label="Editar item" onClick={() => begin(kind, item)} className="rounded p-1.5" style={{ color: 'hsl(var(--fg3))' }}><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label="Excluir item" onClick={() => window.confirm('Excluir esta configuração?') && complete(() => deleteSigecFormConfiguration(processId, kind, item.id))} className="rounded p-1.5" style={{ color: 'hsl(var(--destructive))' }}><Trash2 className="h-3.5 w-3.5" /></button></div>}</div>)}
            {!activeRows.length && <div className="rounded-lg border border-dashed py-10 text-center"><ActiveIcon className="mx-auto h-5 w-5" style={{ color: 'hsl(var(--fg3))' }} /><p className="mt-2 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhum item configurado.</p></div>}
          </div>
        </div>

        <div className="p-5">
          {editable ? <form key={`${kind}-${editing?.id || 'new'}`} action={(formData) => complete(() => upsertSigecFormConfiguration(formData))} className="space-y-3">
            <input type="hidden" name="processId" value={processId} /><input type="hidden" name="itemId" value={editing?.id || ''} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="required" value="false" />
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{editing ? `Editar ${activeTitle.toLowerCase()}` : `Adicionar em ${activeTitle.toLowerCase()}`}</h3>{editing && <button type="button" onClick={() => begin(kind)} className="rounded p-1.5" aria-label="Cancelar edição"><X className="h-4 w-4" /></button>}</div>
            <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Título<input name="label" value={label} onChange={(event) => { setLabel(event.target.value); if (!editing) setCode(codeify(event.target.value)) }} className={inputClass} style={inputStyle} required /></label>
            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Código<input name="code" value={code} onChange={(event) => setCode(codeify(event.target.value))} className={inputClass} style={inputStyle} required /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Ordem<input name="position" type="number" min="0" defaultValue={editing?.position ?? activeRows.length * 10} className={inputClass} style={inputStyle} required /></label></div>
            <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Público<select name="audience" defaultValue={editing ? itemAudience(editing) : 'all'} className={inputClass} style={inputStyle}>{Object.entries(audienceLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            {kind === 'question' && <><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Tipo<select name="questionType" value={questionType} onChange={(event) => setQuestionType(event.target.value)} className={inputClass} style={inputStyle}><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="single_choice">Escolha única</option><option value="multiple_choice">Múltipla escolha</option><option value="boolean">Sim ou não</option><option value="number">Número</option><option value="date">Data</option></select></label>{questionType === 'boolean' && <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Esta resposta libera campos para<select name="audienceMarker" defaultValue={currentQuestion?.config.audienceMarker || ''} className={inputClass} style={inputStyle}><option value="">Não controla outros campos</option><option value="pcd">Candidatos PCD</option><option value="ppp">Candidatos PPP</option></select><span className="mt-1.5 block font-normal leading-4" style={{ color: 'hsl(var(--fg3))' }}>Use apenas em pergunta visível para todos. Ao responder “Sim”, os itens desse público aparecem.</span></label>}<label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Ajuda<textarea name="details" defaultValue={details(editing)} className={`${inputClass} min-h-16`} style={inputStyle} /></label>{['single_choice', 'multiple_choice'].includes(questionType) && <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Opções, uma por linha<textarea name="options" defaultValue={currentQuestion?.config.options?.join('\n') || ''} className={`${inputClass} min-h-24`} style={inputStyle} required /></label>}</>}
            {kind === 'document' && <><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Instruções<textarea name="details" defaultValue={details(editing)} className={`${inputClass} min-h-20`} style={inputStyle} /></label><fieldset><legend className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Formatos permitidos</legend><div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: 'hsl(var(--fg2))' }}>{[['application/pdf', 'PDF'], ['image/jpeg', 'JPG'], ['image/png', 'PNG']].map(([value, text]) => <label key={value} className="flex items-center gap-1.5"><input type="checkbox" name="acceptedMimeTypes" value={value} defaultChecked={currentDocument ? currentDocument.accepted_mime_types.includes(value) : value === 'application/pdf'} />{text}</label>)}</div></fieldset><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Tamanho máximo (MB)<input name="maxFileSizeMb" type="number" min="1" max="50" defaultValue={currentDocument ? Math.round(currentDocument.max_file_size_bytes / 1024 / 1024) : 10} className={inputClass} style={inputStyle} required /></label></>}
            {kind === 'declaration' && <><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Versão<input name="version" defaultValue={currentDeclaration?.version || 'rascunho-1'} className={inputClass} style={inputStyle} required /></label><label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Texto da declaração<textarea name="details" defaultValue={details(editing)} className={`${inputClass} min-h-44 leading-5`} style={inputStyle} minLength={10} required /></label><p className="text-[11px] leading-4" style={{ color: 'hsl(var(--accent-amber))' }}>Confirme o texto com o responsável pelo edital antes da publicação oficial.</p></>}
            <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}><input type="checkbox" name="required" value="true" defaultChecked={editing?.required ?? true} /> Preenchimento obrigatório</label>
            <button className="ds-btn ds-btn--primary w-full justify-center" disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editing ? 'Salvar alteração' : 'Adicionar configuração'}</button>
          </form> : <div className="rounded-lg border border-dashed p-5 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Este processo já saiu do rascunho. As configurações permanecem visíveis para auditoria, mas não podem mais ser alteradas.</div>}
        </div>
      </div>
    </section>
  )
}
