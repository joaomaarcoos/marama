'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react'
import {
  createSigecProcess,
  updateSigecProcess,
  type SigecProcessActionState,
} from '@/app/(dashboard)/sigec-processos/actions'

export type SigecProcessFormValues = {
  id?: string
  title?: string
  slug?: string
  summary?: string | null
  description?: string | null
  editalVersion?: string
  applicationsOpenAt?: string | null
  applicationsCloseAt?: string | null
  maxPreferences?: number
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return formatter.format(date).replace(' ', 'T')
}

export function SigecProcessForm({
  initialValues = {},
  disabled = false,
}: {
  initialValues?: SigecProcessFormValues
  disabled?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<SigecProcessActionState>({})
  const [title, setTitle] = useState(initialValues.title || '')
  const [slug, setSlug] = useState(initialValues.slug || '')
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues.slug))
  const editing = Boolean(initialValues.id)
  const inputClass = 'mt-2 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
  const inputStyle = useMemo(() => ({
    background: 'hsl(var(--background))',
    borderColor: 'hsl(var(--border))',
    color: 'hsl(var(--fg1))',
  }), [])

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  function submit(formData: FormData) {
    setState({})
    startTransition(async () => {
      const result = editing && initialValues.id
        ? await updateSigecProcess(initialValues.id, formData)
        : await createSigecProcess(formData)
      setState(result)
      if (result.success && result.processId) {
        router.push(`/sigec-processos/${result.processId}`)
        router.refresh()
      }
    })
  }

  const locked = disabled || isPending

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
          Nome do processo
          <input
            name="title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            className={inputClass}
            style={inputStyle}
            placeholder="Processo seletivo de professores 2026"
            minLength={3}
            maxLength={200}
            disabled={locked}
            required
          />
        </label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
          Versão do edital
          <input
            name="editalVersion"
            defaultValue={initialValues.editalVersion || '1'}
            className={inputClass}
            style={inputStyle}
            placeholder="1"
            maxLength={50}
            disabled={locked}
            required
          />
        </label>
      </div>

      <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
        Identificador público
        <div className="mt-2 flex overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background))' }}>
          <span className="flex items-center border-r px-3 text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg3))' }}>/processos/</span>
          <input
            name="slug"
            value={slug}
            onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)) }}
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none disabled:opacity-60"
            style={{ color: 'hsl(var(--fg1))' }}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            disabled={locked}
            required
          />
        </div>
      </label>

      <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
        Resumo público
        <textarea
          name="summary"
          defaultValue={initialValues.summary || ''}
          className={`${inputClass} min-h-24 resize-y`}
          style={inputStyle}
          placeholder="Apresente o objetivo do processo em poucas linhas."
          maxLength={500}
          disabled={locked}
        />
      </label>

      {editing && (
        <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
          Descrição completa
          <textarea
            name="description"
            defaultValue={initialValues.description || ''}
            className={`${inputClass} min-h-36 resize-y`}
            style={inputStyle}
            maxLength={20000}
            disabled={locked}
          />
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
          Abertura das inscrições
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'hsl(var(--fg3))' }} />
            <input name="applicationsOpenAt" type="datetime-local" defaultValue={toLocalInput(initialValues.applicationsOpenAt)} className={`${inputClass} pl-10`} style={inputStyle} disabled={locked} />
          </div>
        </label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
          Encerramento das inscrições
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'hsl(var(--fg3))' }} />
            <input name="applicationsCloseAt" type="datetime-local" defaultValue={toLocalInput(initialValues.applicationsCloseAt)} className={`${inputClass} pl-10`} style={inputStyle} disabled={locked} />
          </div>
        </label>
      </div>

      <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
        Máximo de opções por candidatura
        <select name="maxPreferences" defaultValue={String(initialValues.maxPreferences || 5)} className={inputClass} style={inputStyle} disabled={locked}>
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <span className="mt-2 block font-normal" style={{ color: 'hsl(var(--fg3))' }}>Configurável por processo enquanto a regra oficial é reconfirmada.</span>
      </label>

      {state.error && (
        <div className="flex gap-2 rounded-xl border px-3.5 py-3 text-sm" style={{ borderColor: 'hsl(var(--destructive) / .35)', background: 'hsl(var(--destructive) / .08)', color: 'hsl(var(--destructive))' }}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}
      {state.success && (
        <div className="flex gap-2 rounded-xl border px-3.5 py-3 text-sm" style={{ borderColor: 'hsl(var(--accent-green) / .35)', background: 'hsl(var(--accent-green) / .08)', color: 'hsl(var(--accent-green))' }}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.success}
        </div>
      )}

      <button type="submit" className="ds-btn ds-btn--primary w-full justify-center" disabled={locked}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {editing ? 'Salvar rascunho' : 'Criar rascunho'}
      </button>
    </form>
  )
}
