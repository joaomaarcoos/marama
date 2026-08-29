'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, CalendarRange, CheckCircle2, CircleAlert, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { deleteCandidateExperience, saveCandidateExperience } from '@/app/(candidate)/minha-area/experiencia/actions'

export type CandidateExperienceEntry = {
  id: string; employmentType: string; institution: string; roleTitle: string
  startsOn: string; endsOn: string; isTeaching: boolean
}

const TYPES = [
  ['servidor_publico', 'Servidor público'], ['contratado_publico', 'Contrato público'],
  ['empregado_privado', 'Empregado privado'], ['bolsista', 'Bolsista'], ['outro', 'Outro vínculo'],
] as const
const typeLabels = Object.fromEntries(TYPES)
const field = 'mt-2 w-full rounded-xl border border-[#cbd5df] bg-white px-3.5 py-3 text-sm font-medium text-[#172033] outline-none focus:border-[#315f9d] focus:ring-4 focus:ring-[#315f9d]/10 disabled:bg-[#eef1f4]'
const label = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#526074]'

export function CandidateExperienceManager({ entries, totalDays, totalMonths, remainingDays }: {
  entries: CandidateExperienceEntry[]; totalDays: number; totalMonths: number; remainingDays: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<CandidateExperienceEntry | null>(null)
  const [ongoing, setOngoing] = useState(false)
  const [isTeaching, setIsTeaching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  function edit(entry: CandidateExperienceEntry) {
    setEditing(entry); setOngoing(!entry.endsOn); setIsTeaching(entry.isTeaching); setFeedback(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function reset() { setEditing(null); setOngoing(false); setIsTeaching(true) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setFeedback(null)
    try {
      const result = await saveCandidateExperience(new FormData(event.currentTarget))
      setFeedback({ type: result.status, message: result.message })
      if (result.status === 'success') { reset(); router.refresh() }
    } catch { setFeedback({ type: 'error', message: 'Não foi possível salvar esta experiência.' }) }
    finally { setLoading(false) }
  }
  async function remove(entry: CandidateExperienceEntry) {
    if (!window.confirm(`Remover a experiência em “${entry.institution}”?`)) return
    const data = new FormData(); data.set('id', entry.id); setLoading(true)
    try {
      const result = await deleteCandidateExperience(data); setFeedback({ type: result.status, message: result.message })
      if (result.status === 'success') { if (editing?.id === entry.id) reset(); router.refresh() }
    } finally { setLoading(false) }
  }

  return <div className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)] lg:items-start">
    <form key={editing?.id || 'new'} onSubmit={submit} noValidate className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-white shadow-[0_22px_60px_-42px_rgba(18,34,51,.65)]">
      <div className="flex items-start justify-between border-b border-[#e5eaf0] bg-[#f8fafb] px-6 py-5">
        <div><p className="text-xs font-extrabold uppercase tracking-wider text-[#315f9d]">{editing ? 'Editar experiência' : 'Nova experiência'}</p><p className="mt-1 text-sm text-[#657084]">Registre cada vínculo em separado.</p></div>
        {editing && <button type="button" onClick={reset} aria-label="Cancelar edição" className="rounded-xl p-2 text-[#657084] hover:bg-[#e9eef3]"><X className="h-4 w-4" /></button>}
      </div>
      <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
        <input type="hidden" name="id" value={editing?.id || ''} /><input type="hidden" name="isTeaching" value={isTeaching ? 'true' : 'false'} />
        <label className="sm:col-span-2"><span className={label}>Tipo de vínculo</span><select className={field} name="employmentType" defaultValue={editing?.employmentType || 'contratado_publico'}>{TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="sm:col-span-2"><span className={label}>Empregador ou instituição</span><input className={field} name="institution" defaultValue={editing?.institution || ''} minLength={2} maxLength={200} required /></label>
        <label className="sm:col-span-2"><span className={label}>Função exercida</span><input className={field} name="roleTitle" defaultValue={editing?.roleTitle || ''} minLength={2} maxLength={200} required placeholder="Ex.: Professor de Matemática" /></label>
        <label><span className={label}>Início</span><input className={field} type="date" name="startsOn" defaultValue={editing?.startsOn || ''} required /></label>
        <label><span className={label}>Término</span><input className={field} type="date" name="endsOn" defaultValue={editing?.endsOn || ''} disabled={ongoing} required={!ongoing} /></label>
        <label className="flex items-center gap-3 rounded-xl border border-[#d9e0e7] bg-[#f8fafb] px-4 py-3"><input type="checkbox" checked={ongoing} onChange={e => setOngoing(e.target.checked)} className="h-4 w-4 accent-[#16775a]" /><span className="text-sm font-bold text-[#334155]">Vínculo atual</span></label>
        <label className="flex items-center gap-3 rounded-xl border border-[#d9e0e7] bg-[#f8fafb] px-4 py-3"><input type="checkbox" checked={isTeaching} onChange={e => setIsTeaching(e.target.checked)} className="h-4 w-4 accent-[#16775a]" /><span className="text-sm font-bold text-[#334155]">Experiência docente</span></label>
      </div>
      {feedback && <div role="status" className={`mx-6 mb-5 flex gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-[#9dd8c3] bg-[#ebf8f2] text-[#0f694c]' : 'border-[#efb7b7] bg-[#fff0f0] text-[#9f2f2f]'}`}>{feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}{feedback.message}</div>}
      <div className="flex justify-end border-t border-[#e5eaf0] bg-[#f8fafb] px-6 py-4"><button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#315f9d] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{loading ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar experiência'}</button></div>
    </form>
    <section className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-white">
      <div className="border-b border-[#dbe5ef] bg-[#edf3fb] px-5 py-5"><p className="text-xs font-extrabold uppercase tracking-wider text-[#315f9d]">Tempo docente sem sobreposição</p><p className="mt-2 text-2xl font-bold text-[#172033]">{totalMonths} meses <span className="text-sm font-semibold text-[#657084]">e {remainingDays} dias</span></p><p className="mt-1 text-xs text-[#657084]">{totalDays} dias únicos, convertidos em meses equivalentes de 30 dias.</p></div>
      {entries.length === 0 ? <div className="px-6 py-12 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#9aa6b5]" /><p className="mt-4 text-sm font-bold text-[#334155]">Nenhuma experiência cadastrada.</p></div> : <div className="divide-y divide-[#e9edf2]">{entries.map(entry => <article key={entry.id} className="px-5 py-5"><div className="flex justify-between gap-4"><div><span className="rounded-full bg-[#e6eefb] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#315f9d]">{typeLabels[entry.employmentType]}</span><h3 className="mt-3 font-bold text-[#172033]">{entry.roleTitle}</h3><p className="mt-1 text-xs font-semibold text-[#657084]">{entry.institution}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-[#7a8596]"><CalendarRange className="h-3.5 w-3.5" />{entry.startsOn.split('-').reverse().join('/')} — {entry.endsOn ? entry.endsOn.split('-').reverse().join('/') : 'atual'}{!entry.isTeaching && ' · não docente'}</p></div><div className="flex"><button type="button" onClick={() => edit(entry)} aria-label="Editar experiência" className="rounded-xl p-2 text-[#526074] hover:bg-[#edf2f6]"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(entry)} aria-label="Remover experiência" className="rounded-xl p-2 text-[#7a8596] hover:bg-[#fff0f0] hover:text-[#a63a3a]"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div>}
    </section>
  </div>
}
