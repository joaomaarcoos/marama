'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { requestPasswordReset } from '@/app/(auth)/recuperar-senha/actions'
import { TurnstileWidget } from '@/components/turnstile-widget'

export function PasswordRecoveryForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    const result = await requestPasswordReset(new FormData(event.currentTarget))
    setMessage(result.message)
    setIsError(result.status !== 'success')
    if (result.status !== 'success') {
      setCaptchaToken('')
      setCaptchaResetKey((value) => value + 1)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div>
        <label htmlFor="recovery-email" className="text-sm font-bold text-slate-200">E-mail</label>
        <div className="relative mt-2">
          <Mail className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
          <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={320} className="h-12 w-full rounded-xl border border-slate-600 bg-[#111c2f] pl-12 pr-4 text-slate-50 caret-blue-300 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/20" />
        </div>
      </div>
      <TurnstileWidget siteKey={turnstileSiteKey} action="sigec_password_recovery" resetKey={captchaResetKey} onToken={setCaptchaToken} />
      <input type="hidden" name="captchaToken" value={captchaToken} />
      {message ? <p aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${isError ? 'border-red-300/30 bg-red-400/10 text-red-100' : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'}`}>{message}</p> : null}
      <button disabled={loading || !captchaToken} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-500 font-bold text-slate-50 shadow-lg shadow-blue-950/30 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Enviar instruções
      </button>
    </form>
  )
}
