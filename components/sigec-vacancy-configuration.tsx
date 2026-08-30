'use client'

import { useState, useTransition } from 'react'
import { BriefcaseBusiness, Loader2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  deleteSigecModality,
  upsertSigecModality,
  upsertSigecVacancy,
  type SigecProcessActionState,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecModalityRow = {
  id: string
  name: string
  slug: string
  description: string | null
}

export type SigecVacancyRow = {
  id: string
  modality_id: string
  municipality: string
  vacancy_kind: 'cadastro_reserva' | 'quantidade'
  vacancy_count: number | null
  active: boolean
  course: { canonical_name: string } | null
  requirement: { accepted_education: string; proof_instructions: string } | null
}

const inputClass = 'mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
const inputStyle = { background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function SigecVacancyConfiguration({
  processId,
  editable,
  modalities,
  vacancies,
}: {
  processId: string
  editable: boolean
  modalities: SigecModalityRow[]
  vacancies: SigecVacancyRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SigecProcessActionState>({})
  const [editingModality, setEditingModality] = useState<SigecModalityRow | null>(null)
  const [editingVacancy, setEditingVacancy] = useState<SigecVacancyRow | null>(null)
  const [modalityName, setModalityName] = useState('')
  const [modalitySlug, setModalitySlug] = useState('')
  const [vacancyKind, setVacancyKind] = useState<'cadastro_reserva' | 'quantidade'>('cadastro_reserva')

  function complete(action: () => Promise<SigecProcessActionState>, reset: () => void) {
    setResult({})
    startTransition(async () => {
      const next = await action()
      setResult(next)
      if (next.success) {
        reset()
        router.refresh()
      }
    })
  }

  function beginModality(row: SigecModalityRow | null) {
    setEditingModality(row)
    setModalityName(row?.name || '')
    setModalitySlug(row?.slug || '')
    setResult({})
  }

  function beginVacancy(row: SigecVacancyRow | null) {
    setEditingVacancy(row)
    setVacancyKind(row?.vacancy_kind || 'cadastro_reserva')
    setResult({})
  }

  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div>
          <h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Vagas e requisitos</h2>
          <p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Organize modalidade, curso, município e comprovação exigida.</p>
        </div>
        {!editable && <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Configuração bloqueada</span>}
      </div>

      {result.error && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>{result.error}</p>}
      {result.success && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}>{result.success}</p>}

      <div className="grid gap-0 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="p-5 xl:border-r" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg2))' }}>Modalidades</h3>
            {editable && <button type="button" onClick={() => beginModality(null)} className="ds-btn ds-btn--ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Nova</button>}
          </div>

          <div className="space-y-2">
            {modalities.map((row) => (
              <div key={row.id} className="rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{row.name}</p><p className="mt-1 truncate text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{row.slug}</p></div>
                  {editable && <div className="flex gap-1"><button type="button" aria-label="Editar modalidade" onClick={() => beginModality(row)} className="rounded p-1.5" style={{ color: 'hsl(var(--fg3))' }}><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label="Excluir modalidade" onClick={() => window.confirm('Excluir esta modalidade?') && complete(() => deleteSigecModality(processId, row.id), () => beginModality(null))} className="rounded p-1.5" style={{ color: 'hsl(var(--destructive))' }}><Trash2 className="h-3.5 w-3.5" /></button></div>}
                </div>
              </div>
            ))}
            {!modalities.length && <p className="py-6 text-center text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhuma modalidade cadastrada.</p>}
          </div>

          {editable && (
            <form key={editingModality?.id || 'new-modality'} action={(formData) => complete(() => upsertSigecModality(formData), () => beginModality(null))} className="mt-4 space-y-3 rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <input type="hidden" name="processId" value={processId} /><input type="hidden" name="modalityId" value={editingModality?.id || ''} />
              <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nome<input name="name" value={modalityName} onChange={(event) => { setModalityName(event.target.value); if (!editingModality) setModalitySlug(slugify(event.target.value)) }} className={inputClass} style={inputStyle} required /></label>
              <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Identificador<input name="slug" value={modalitySlug} onChange={(event) => setModalitySlug(slugify(event.target.value))} className={inputClass} style={inputStyle} required /></label>
              <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Descrição<input name="description" defaultValue={editingModality?.description || ''} className={inputClass} style={inputStyle} /></label>
              <div className="flex gap-2"><button className="ds-btn ds-btn--primary flex-1 justify-center" disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingModality ? 'Salvar' : 'Adicionar'}</button>{editingModality && <button type="button" onClick={() => beginModality(null)} className="ds-btn ds-btn--ghost"><X className="h-4 w-4" /></button>}</div>
            </form>
          )}
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--fg2))' }}>Vagas configuradas</h3>
            {editable && modalities.length > 0 && <button type="button" onClick={() => beginVacancy(null)} className="ds-btn ds-btn--ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Nova vaga</button>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {vacancies.map((row) => {
              const modality = modalities.find((item) => item.id === row.modality_id)
              return <div key={row.id} className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', opacity: row.active ? 1 : .65 }}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{row.course?.canonical_name || 'Curso indisponível'}</p><p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>{modality?.name || 'Modalidade indisponível'}</p></div>{editable && <button type="button" onClick={() => beginVacancy(row)} className="rounded p-1.5" style={{ color: 'hsl(var(--fg3))' }}><Pencil className="h-3.5 w-3.5" /></button>}</div>
                <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--fg2))' }}><MapPin className="h-3.5 w-3.5" />{row.municipality}</div>
                <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--fg2))' }}><BriefcaseBusiness className="h-3.5 w-3.5" />{row.vacancy_kind === 'quantidade' ? `${row.vacancy_count} vaga(s)` : 'Cadastro de reserva'} · {row.active ? 'ativa' : 'inativa'}</div>
              </div>
            })}
            {!vacancies.length && <p className="col-span-full py-8 text-center text-xs" style={{ color: 'hsl(var(--fg3))' }}>Nenhuma vaga configurada.</p>}
          </div>

          {editable && modalities.length > 0 && (
            <form key={editingVacancy?.id || 'new-vacancy'} action={(formData) => complete(() => upsertSigecVacancy(formData), () => beginVacancy(null))} className="mt-5 space-y-4 rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}>
              <input type="hidden" name="processId" value={processId} /><input type="hidden" name="vacancyId" value={editingVacancy?.id || ''} /><input type="hidden" name="active" value="false" />
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Modalidade<select name="modalityId" defaultValue={editingVacancy?.modality_id || modalities[0].id} className={inputClass} style={inputStyle}>{modalities.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Curso ou especialidade<input name="courseName" defaultValue={editingVacancy?.course?.canonical_name || ''} className={inputClass} style={inputStyle} required /></label></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Município<input name="municipality" defaultValue={editingVacancy?.municipality || ''} className={inputClass} style={inputStyle} required /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Tipo<select name="vacancyKind" value={vacancyKind} onChange={(event) => setVacancyKind(event.target.value as typeof vacancyKind)} className={inputClass} style={inputStyle}><option value="cadastro_reserva">Cadastro de reserva</option><option value="quantidade">Quantidade definida</option></select></label></div>
              {vacancyKind === 'quantidade' && <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Quantidade<input type="number" name="vacancyCount" min="1" defaultValue={editingVacancy?.vacancy_count || 1} className={inputClass} style={inputStyle} required /></label>}
              <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Formação aceita<textarea name="acceptedEducation" defaultValue={editingVacancy?.requirement?.accepted_education || ''} className={`${inputClass} min-h-20`} style={inputStyle} required /></label>
              <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Comprovação exigida<textarea name="proofInstructions" defaultValue={editingVacancy?.requirement?.proof_instructions || ''} className={`${inputClass} min-h-20`} style={inputStyle} required /></label>
              <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}><input type="checkbox" name="active" value="true" defaultChecked={editingVacancy?.active ?? true} /> Vaga ativa</label>
              <div className="flex gap-2"><button className="ds-btn ds-btn--primary flex-1 justify-center" disabled={isPending}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingVacancy ? 'Salvar vaga' : 'Adicionar vaga'}</button>{editingVacancy && <button type="button" onClick={() => beginVacancy(null)} className="ds-btn ds-btn--ghost"><X className="h-4 w-4" /></button>}</div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
