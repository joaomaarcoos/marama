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
      <div><label htmlFor="new-password" className="text-sm font-bold text-slate-800">Nova senha</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></div>
      <div><label htmlFor="confirm-password" className="text-sm font-bold text-slate-800">Confirmar nova senha</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></div>
      <p className="text-xs leading-5 text-slate-500">Use ao menos 12 caracteres, com letras maiúsculas e minúsculas, número e caractere especial.</p>
      {message ? <p aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message}</p> : null}
      <button disabled={loading || success} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Atualizar senha</button>
    </form>
  )
}
