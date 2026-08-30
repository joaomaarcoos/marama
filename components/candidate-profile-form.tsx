'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  IdCard,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircleMore,
  Save,
  Sparkles,
} from 'lucide-react'
import { updateCandidateProfile } from '@/app/(candidate)/minha-area/perfil/actions'

const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export type CandidateProfileFormData = {
  fullName: string
  cpf: string
  birthDate: string
  email: string
  whatsapp: string
  whatsappVerified: boolean
  postalCode: string
  street: string
  addressNumber: string
  addressExtra: string
  district: string
  city: string
  state: string
  availability: string
  professionalSummary: string
  profileCompleted: boolean
}
const fieldClass = 'mt-2 w-full rounded-xl border border-[#cbd5df] bg-[#ffffff] px-3.5 py-3 text-sm font-medium text-[#172033] outline-none transition placeholder:text-[#8a96a8] focus:border-[#16845f] focus:ring-4 focus:ring-[#16845f]/10 disabled:cursor-not-allowed disabled:bg-[#eef1f4] disabled:text-[#657084]'
const labelClass = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#526074]'

function digits(value: string) {
  return value.replace(/\D/g, '')
}

function formatPostalCode(value: string) {
  const clean = digits(value).slice(0, 8)
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean
}

function formatPhone(value: string) {
  let clean = digits(value).slice(0, 13)
  if (clean.startsWith('55')) clean = clean.slice(2)
  if (clean.length <= 2) return clean
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
}

export function CandidateProfileForm({ initial }: { initial: CandidateProfileFormData }) {
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState(formatPhone(initial.whatsapp))
  const [postalCode, setPostalCode] = useState(formatPostalCode(initial.postalCode))
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success'
    message: string
    requiresWhatsappVerification?: boolean
  } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)
    try {
      const formData = new FormData(event.currentTarget)
      const result = await updateCandidateProfile(formData)
      setFeedback({
        type: result.status,
        message: result.message,
        requiresWhatsappVerification: result.requiresWhatsappVerification,
      })
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível salvar seu perfil agora.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <input type="hidden" name="cpf" value={initial.cpf} />

      <section className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-[#ffffff] shadow-[0_22px_60px_-42px_rgba(18,34,51,0.65)]">
        <div className="flex items-start gap-4 border-b border-[#e5eaf0] bg-[#f8fafb] px-5 py-5 sm:px-7">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e2f4ec] text-[#137052]"><IdCard className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#172033]">Identificação e contato</h2>
            <p className="mt-1 text-sm leading-6 text-[#657084]">Mantenha os dados iguais aos documentos que serão enviados.</p>
          </div>
        </div>
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <label className="sm:col-span-2">
            <span className={labelClass}>Nome completo</span>
            <input className={fieldClass} name="fullName" defaultValue={initial.fullName} autoComplete="name" minLength={3} maxLength={200} required />
          </label>
          <label>
            <span className={labelClass}>CPF</span>
            <span className="relative block">
              <input className={`${fieldClass} pr-10`} value={initial.cpf} disabled aria-describedby="cpf-note" />
              <LockKeyhole className="absolute bottom-3.5 right-3.5 h-4 w-4 text-[#7c8798]" />
            </span>
            <span id="cpf-note" className="mt-1.5 block text-xs text-[#7a8596]">Alterações exigem atendimento administrativo.</span>
          </label>
          <label>
            <span className={labelClass}>Data de nascimento</span>
            <input className={fieldClass} name="birthDate" type="date" defaultValue={initial.birthDate} autoComplete="bday" required />
          </label>
          <label>
            <span className={labelClass}>E-mail de acesso</span>
            <span className="relative block">
              <input className={`${fieldClass} pr-10`} value={initial.email} disabled />
              <LockKeyhole className="absolute bottom-3.5 right-3.5 h-4 w-4 text-[#7c8798]" />
            </span>
          </label>
          <label>
            <span className={labelClass}>WhatsApp com DDD</span>
            <input className={fieldClass} name="whatsapp" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} required />
            <span className={`mt-1.5 block text-xs font-semibold ${initial.whatsappVerified ? 'text-[#137052]' : 'text-[#a45b0a]'}`}>
              {initial.whatsappVerified ? 'Número verificado' : 'Aguardando verificação'}
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-[#ffffff] shadow-[0_22px_60px_-42px_rgba(18,34,51,0.65)]">
        <div className="flex items-start gap-4 border-b border-[#e5eaf0] bg-[#f8fafb] px-5 py-5 sm:px-7">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e6eefb] text-[#315f9d]"><MapPin className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#172033]">Endereço</h2>
            <p className="mt-1 text-sm leading-6 text-[#657084]">Informe seu endereço residencial atual.</p>
          </div>
        </div>
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-6 sm:px-7">
          <label className="sm:col-span-2">
            <span className={labelClass}>CEP</span>
            <input className={fieldClass} name="postalCode" value={postalCode} onChange={(event) => setPostalCode(formatPostalCode(event.target.value))} inputMode="numeric" autoComplete="postal-code" maxLength={9} required />
          </label>
          <label className="sm:col-span-3">
            <span className={labelClass}>Logradouro</span>
            <input className={fieldClass} name="street" defaultValue={initial.street} autoComplete="address-line1" maxLength={200} required />
          </label>
          <label className="sm:col-span-1">
            <span className={labelClass}>Número</span>
            <input className={fieldClass} name="addressNumber" defaultValue={initial.addressNumber} autoComplete="address-line2" maxLength={30} required />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Complemento</span>
            <input className={fieldClass} name="addressExtra" defaultValue={initial.addressExtra} maxLength={120} placeholder="Opcional" />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Bairro</span>
            <input className={fieldClass} name="district" defaultValue={initial.district} maxLength={120} required />
          </label>
          <label className="sm:col-span-1">
            <span className={labelClass}>Cidade</span>
            <input className={fieldClass} name="city" defaultValue={initial.city} autoComplete="address-level2" maxLength={160} required />
          </label>
          <label className="sm:col-span-1">
            <span className={labelClass}>UF</span>
            <select className={fieldClass} name="state" defaultValue={initial.state} autoComplete="address-level1" required>
              {states.map((state) => <option key={state}>{state}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-[#d9e0e7] bg-[#ffffff] shadow-[0_22px_60px_-42px_rgba(18,34,51,0.65)]">
        <div className="flex items-start gap-4 border-b border-[#e5eaf0] bg-[#f8fafb] px-5 py-5 sm:px-7">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff1d8] text-[#9a5b0b]"><Sparkles className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#172033]">Disponibilidade profissional</h2>
            <p className="mt-1 text-sm leading-6 text-[#657084]">Descreva turnos, dias e eventuais limitações de deslocamento.</p>
          </div>
        </div>
        <div className="space-y-5 px-5 py-6 sm:px-7">
          <label className="block">
            <span className={labelClass}>Disponibilidade</span>
            <textarea className={`${fieldClass} min-h-28 resize-y leading-6`} name="availability" defaultValue={initial.availability} maxLength={1000} required placeholder="Ex.: manhã e tarde, de segunda a sexta; disponibilidade para atuar em São Luís." />
          </label>
          <label className="block">
            <span className={labelClass}>Resumo profissional <span className="normal-case tracking-normal text-[#8a96a8]">(opcional)</span></span>
            <textarea className={`${fieldClass} min-h-32 resize-y leading-6`} name="professionalSummary" defaultValue={initial.professionalSummary} maxLength={5000} placeholder="Apresente brevemente sua experiência e áreas de atuação." />
          </label>
        </div>
      </section>

      {feedback && (
        <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-semibold ${feedback.type === 'success' ? 'border-[#9dd8c3] bg-[#ebf8f2] text-[#0f694c]' : 'border-[#efb7b7] bg-[#fff0f0] text-[#9f2f2f]'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
          <div>
            <p>{feedback.message}</p>
            {feedback.requiresWhatsappVerification && (
              <Link href="/minha-area/verificar-whatsapp" className="mt-2 inline-flex items-center gap-1 underline underline-offset-4">
                Verificar WhatsApp <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-[#d4dce5] bg-[#ffffff]/95 p-3 shadow-[0_18px_50px_-24px_rgba(18,34,51,0.7)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 px-2 text-xs font-semibold text-[#657084]">
          <MessageCircleMore className="h-4 w-4 text-[#16845f]" /> Alterar o WhatsApp exige uma nova verificação.
        </div>
        <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16775a] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#16775a]/20 transition hover:bg-[#115f49] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {loading ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>
    </form>
  )
}
