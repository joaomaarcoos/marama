'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react'
import { registerCandidate } from '@/app/(public)/cadastro-candidato/actions'
import { TurnstileWidget } from '@/components/turnstile-widget'

const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

const fieldClass = 'mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/75 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10'
const labelClass = 'text-xs font-bold uppercase tracking-[0.13em] text-slate-300'

export function CandidateRegistrationForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)
    const form = event.currentTarget

    try {
      const result = await registerCandidate(new FormData(form))
      if (result.status === 'success') {
        form.reset()
        setFeedback({ type: 'success', message: result.message })
      } else {
        setFeedback({ type: 'error', message: result.message })
        setCaptchaToken('')
        setCaptchaResetKey((value) => value + 1)
      }
    } catch {
      setFeedback({ type: 'error', message: 'Nao foi possivel concluir o cadastro agora.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={labelClass}>Nome completo</span>
          <input className={fieldClass} name="fullName" autoComplete="name" minLength={3} maxLength={200} required placeholder="Como aparece no documento" />
        </label>
        <label>
          <span className={labelClass}>CPF</span>
          <input className={fieldClass} name="cpf" inputMode="numeric" autoComplete="off" maxLength={14} required placeholder="Somente numeros" />
        </label>
        <label>
          <span className={labelClass}>Data de nascimento</span>
          <input className={fieldClass} name="birthDate" type="date" autoComplete="bday" required />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>E-mail</span>
          <input className={fieldClass} name="email" type="email" autoComplete="email" maxLength={320} required placeholder="voce@exemplo.com" />
        </label>
        <label>
          <span className={labelClass}>WhatsApp com DDD</span>
          <input className={fieldClass} name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" maxLength={18} required placeholder="(98) 99999-9999" />
        </label>
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <label>
            <span className={labelClass}>Cidade</span>
            <input className={fieldClass} name="city" autoComplete="address-level2" maxLength={160} required />
          </label>
          <label>
            <span className={labelClass}>UF</span>
            <select className={fieldClass} name="state" autoComplete="address-level1" defaultValue="MA" required>
              {states.map((state) => <option key={state}>{state}</option>)}
            </select>
          </label>
        </div>
        <label>
          <span className={labelClass}>Senha</span>
          <span className="relative block">
            <input className={`${fieldClass} pr-11`} name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required />
            <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute bottom-0 right-0 flex h-[46px] w-11 items-center justify-center text-slate-500 transition hover:text-emerald-300" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <label>
          <span className={labelClass}>Confirmar senha</span>
          <input className={fieldClass} name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required />
        </label>
      </div>

      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs leading-5 text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        Use 12 ou mais caracteres, com maiuscula, minuscula, numero e caractere especial. Seus documentos nao sao solicitados nesta etapa.
      </div>

      <TurnstileWidget siteKey={turnstileSiteKey} action="sigec_candidate_signup" theme="dark" resetKey={captchaResetKey} onToken={setCaptchaToken} />
      <input type="hidden" name="captchaToken" value={captchaToken} />

      {feedback && (
        <div role="status" aria-live="polite" className={`flex gap-3 rounded-xl border p-4 text-sm ${feedback.type === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/30 bg-rose-400/10 text-rose-100'}`}>
          {feedback.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <button disabled={loading || !captchaToken} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {loading ? 'Criando acesso...' : 'Criar meu acesso'}
      </button>
    </form>
  )
}
