'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { updatePassword } from '@/app/(auth)/redefinir-senha/actions'

export function PasswordUpdateForm() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    const result = await updatePassword(new FormData(event.currentTarget))
    setMessage(result.message)
    setSuccess(result.status === 'success')
    setLoading(false)
    if (result.status === 'success') window.setTimeout(() => window.location.assign('/login'), 1200)
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div><label htmlFor="new-password" className="text-sm font-bold text-slate-200">Nova senha</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-[#111c2f] px-4 text-slate-50 caret-emerald-300 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20" /></div>
      <div><label htmlFor="confirm-password" className="text-sm font-bold text-slate-200">Confirmar nova senha</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-2 h-12 w-full rounded-xl border border-slate-600 bg-[#111c2f] px-4 text-slate-50 caret-emerald-300 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20" /></div>
      <p className="text-xs leading-5 text-slate-400">Use ao menos 12 caracteres, com letras maiúsculas e minúsculas, número e caractere especial.</p>
      {message ? <p aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${success ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-red-300/30 bg-red-400/10 text-red-100'}`}>{message}</p> : null}
      <button disabled={loading || success} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Atualizar senha</button>
    </form>
  )
}
