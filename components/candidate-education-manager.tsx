'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  GraduationCap,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  School,
  Trash2,
  X,
} from 'lucide-react'
import { deleteCandidateEducation, saveCandidateEducation } from '@/app/(candidate)/minha-area/formacao/actions'

export type CandidateEducationEntry = {
  id: string
  level: string
  courseName: string
  institution: string
  startedOn: string
  completionDate: string
  isCompleted: boolean
  workloadHours: number | null
}

const LEVELS = [
  ['tecnico', 'Curso técnico'],
  ['licenciatura', 'Licenciatura'],
  ['bacharelado', 'Bacharelado'],
  ['tecnologo', 'Curso superior de tecnologia'],
  ['formacao_pedagogica', 'Formação pedagógica'],
  ['complementacao_pedagogica', 'Complementação pedagógica'],
  ['especializacao', 'Especialização'],
  ['mestrado', 'Mestrado'],
  ['doutorado', 'Doutorado'],
  ['outro', 'Outro'],
] as const

const levelLabel = Object.fromEntries(LEVELS)
const fieldClass = 'mt-2 w-full rounded-xl border border-[#cbd5df] bg-[#ffffff] px-3.5 py-3 text-sm font-medium text-[#172033] outline-none transition placeholder:text-[#8a96a8] focus:border-[#315f9d] focus:ring-4 focus:ring-[#315f9d]/10 disabled:bg-[#eef1f4]'
const labelClass = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#526074]'

export function CandidateEducationManager({ entries }: { entries: CandidateEducationEntry[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<CandidateEducationEntry | null>(null)
  const [level, setLevel] = useState('licenciatura')
  const [isCompleted, setIsCompleted] = useState(true)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  function startEdit(entry: CandidateEducationEntry) {
    setEditing(entry)
    setLevel(entry.level)
    setIsCompleted(entry.isCompleted)
    setFeedback(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditing(null)
    setLevel('licenciatura')
    setIsCompleted(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)
    try {
      const result = await saveCandidateEducation(new FormData(event.currentTarget))
      setFeedback({ type: result.status, message: result.message })
      if (result.status === 'success') {
        resetForm()
        router.refresh()
      }
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível salvar esta formação.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(entry: CandidateEducationEntry) {
    if (!window.confirm(`Remover “${entry.courseName}” do seu perfil?`)) return
    setLoading(true)
    setFeedback(null)
    const formData = new FormData()
    formData.set('id', entry.id)
    try {
      const result = await deleteCandidateEducation(formData)
      setFeedback({ type: result.status, message: result.message })
      if (result.status === 'success') {
        if (editing?.id === entry.id) resetForm()
        router.refresh()
      }
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível remover esta formação.' })
    } finally {
      setLoading(false)
    }
  }

  const pedagogical = level === 'formacao_pedagogica' || level === 'complementacao_pedagogica'

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
      <form key={editing?.id || 'new'} onSubmit={handleSave} className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-[#ffffff] shadow-[0_22px_60px_-42px_rgba(18,34,51,0.65)]" noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-[#e5eaf0] bg-[#f8fafb] px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e6eefb] text-[#315f9d]"><GraduationCap className="h-5 w-5" /></span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#172033]">{editing ? 'Editar formação' : 'Adicionar formação'}</h2>
              <p className="mt-1 text-sm leading-6 text-[#657084]">Cadastre um curso por vez. Os comprovantes serão anexados em outra etapa.</p>
            </div>
          </div>
          {editing && <button type="button" onClick={resetForm} className="rounded-xl p-2 text-[#657084] hover:bg-[#e9eef3]" aria-label="Cancelar edição"><X className="h-4 w-4" /></button>}
        </div>

        <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <input type="hidden" name="id" value={editing?.id || ''} />
          <input type="hidden" name="isCompleted" value={isCompleted ? 'true' : 'false'} />
          <label className="sm:col-span-2">
            <span className={labelClass}>Tipo de formação</span>
            <select className={fieldClass} name="level" value={level} onChange={(event) => setLevel(event.target.value)} required>
              {LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Curso ou habilitação</span>
            <input className={fieldClass} name="courseName" defaultValue={editing?.courseName || ''} minLength={2} maxLength={200} required placeholder="Ex.: Licenciatura em Matemática" />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Instituição de ensino</span>
            <input className={fieldClass} name="institution" defaultValue={editing?.institution || ''} minLength={2} maxLength={200} required placeholder="Nome completo da instituição" />
          </label>
          <label>
            <span className={labelClass}>Data de início <span className="normal-case tracking-normal text-[#8a96a8]">(opcional)</span></span>
            <input className={fieldClass} name="startedOn" type="date" defaultValue={editing?.startedOn || ''} />
          </label>
          <label>
            <span className={labelClass}>Data de conclusão</span>
            <input className={fieldClass} name="completionDate" type="date" defaultValue={editing?.completionDate || ''} disabled={!isCompleted} required={isCompleted} />
          </label>
          <label>
            <span className={labelClass}>Carga horária {pedagogical ? '' : <span className="normal-case tracking-normal text-[#8a96a8]">(opcional)</span>}</span>
            <input className={fieldClass} name="workloadHours" type="number" min={1} max={20000} defaultValue={editing?.workloadHours || ''} required={pedagogical} placeholder="Em horas" />
          </label>
          <label className="flex items-center gap-3 self-end rounded-xl border border-[#d9e0e7] bg-[#f8fafb] px-4 py-3.5">
            <input type="checkbox" checked={isCompleted} onChange={(event) => setIsCompleted(event.target.checked)} className="h-4 w-4 accent-[#16775a]" />
            <span className="text-sm font-bold text-[#334155]">Curso concluído</span>
          </label>
        </div>

        {feedback && (
          <div role="status" aria-live="polite" className={`mx-5 mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold sm:mx-7 ${feedback.type === 'success' ? 'border-[#9dd8c3] bg-[#ebf8f2] text-[#0f694c]' : 'border-[#efb7b7] bg-[#fff0f0] text-[#9f2f2f]'}`}>
            {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <CircleAlert className="h-5 w-5 shrink-0" />}
            {feedback.message}
          </div>
        )}

        <div className="flex justify-end border-t border-[#e5eaf0] bg-[#f8fafb] px-5 py-4 sm:px-7">
          <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#315f9d] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#315f9d]/20 transition hover:bg-[#254c80] disabled:opacity-60">
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {loading ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar formação'}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-[#ffffff] shadow-[0_22px_60px_-42px_rgba(18,34,51,0.65)]">
        <div className="border-b border-[#e5eaf0] bg-[#f8fafb] px-5 py-5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#315f9d]">Seu histórico</p>
          <h2 className="mt-1 font-display text-lg font-bold text-[#172033]">Formações cadastradas</h2>
        </div>
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <BookOpenCheck className="mx-auto h-8 w-8 text-[#9aa6b5]" />
            <p className="mt-4 text-sm font-bold text-[#334155]">Nenhuma formação cadastrada.</p>
            <p className="mt-1 text-xs leading-5 text-[#7a8596]">Comece pela formação exigida para a vaga desejada.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#e9edf2]">
            {entries.map((entry) => (
              <article key={entry.id} className="px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-[#e6eefb] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#315f9d]">{levelLabel[entry.level] || entry.level}</span>
                    <h3 className="mt-3 font-display text-base font-bold text-[#172033]">{entry.courseName}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#657084]"><School className="h-3.5 w-3.5" /> {entry.institution}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#7a8596]"><CalendarDays className="h-3.5 w-3.5" /> {entry.isCompleted ? `Concluído em ${entry.completionDate.split('-').reverse().join('/')}` : 'Em andamento'}{entry.workloadHours ? ` · ${entry.workloadHours}h` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEdit(entry)} className="rounded-xl p-2 text-[#526074] hover:bg-[#edf2f6] hover:text-[#315f9d]" aria-label={`Editar ${entry.courseName}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => handleDelete(entry)} disabled={loading} className="rounded-xl p-2 text-[#7a8596] hover:bg-[#fff0f0] hover:text-[#a63a3a] disabled:opacity-50" aria-label={`Remover ${entry.courseName}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
