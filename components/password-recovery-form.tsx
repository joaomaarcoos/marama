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
        <label htmlFor="recovery-email" className="text-sm font-bold text-slate-800">E-mail</label>
        <div className="relative mt-2">
          <Mail className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
          <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={320} className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
        </div>
      </div>
      <TurnstileWidget siteKey={turnstileSiteKey} action="sigec_password_recovery" resetKey={captchaResetKey} onToken={setCaptchaToken} />
      <input type="hidden" name="captchaToken" value={captchaToken} />
      {message ? <p aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p> : null}
      <button disabled={loading || !captchaToken} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 font-bold text-white transition hover:bg-blue-800 disabled:opacity-60">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Enviar instruções
      </button>
    </form>
  )
}
