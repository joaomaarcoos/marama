'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, MessageCircleMore, ShieldCheck } from 'lucide-react'
import { requestWhatsappCode, verifyWhatsappCode } from '@/app/(candidate)/minha-area/verificar-whatsapp/actions'

export function WhatsappVerificationPanel({ maskedPhone, initiallyVerified }: { maskedPhone: string; initiallyVerified: boolean }) {
  const [verified, setVerified] = useState(initiallyVerified)
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  async function requestCode() {
    setLoading(true)
    setFeedback(null)
    const result = await requestWhatsappCode()
    if (result.verificationId) setVerificationId(result.verificationId)
    if (result.status === 'success' && !result.verificationId) setVerified(true)
    setFeedback({ ok: result.status === 'success', message: result.message })
    setLoading(false)
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback(null)
    const result = await verifyWhatsappCode(new FormData(event.currentTarget))
    if (result.status === 'success') setVerified(true)
    setFeedback({ ok: result.status === 'success', message: result.message })
    setLoading(false)
  }

  if (verified) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-emerald-950">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        <h2 className="mt-5 font-display text-2xl font-bold">WhatsApp verificado</h2>
        <p className="mt-2 text-sm leading-6">O número {maskedPhone} está pronto para receber avisos do processo seletivo.</p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><MessageCircleMore className="h-6 w-6" /></div>
      <h2 className="mt-5 font-display text-2xl font-bold">Confirme seu WhatsApp</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Enviaremos um código de seis dígitos para {maskedPhone}. O código expira em 10 minutos.</p>

      {!verificationId ? (
        <button type="button" onClick={requestCode} disabled={loading} className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Enviar código
        </button>
      ) : (
        <form onSubmit={verify} className="mt-7 space-y-4">
          <input type="hidden" name="verificationId" value={verificationId} />
          <label className="block"><span className="text-sm font-bold text-slate-800">Código recebido</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="mt-2 h-14 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></label>
          <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Confirmar código</button>
          <button type="button" onClick={requestCode} disabled={loading} className="w-full text-sm font-semibold text-slate-500 hover:text-emerald-700">Enviar outro código</button>
        </form>
      )}

      {feedback ? <p role="status" aria-live="polite" className={`mt-5 rounded-xl px-4 py-3 text-sm ${feedback.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{feedback.message}</p> : null}
      <div className="mt-6 flex gap-3 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Nunca informe esse código para outra pessoa. A equipe do SIGEC não solicitará o código por ligação ou mensagem.</div>
    </div>
  )
}
