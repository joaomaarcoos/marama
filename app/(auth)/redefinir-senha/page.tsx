import { KeyRound } from 'lucide-react'
import { redirect } from 'next/navigation'
import { PasswordUpdateForm } from '@/components/password-update-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PasswordUpdatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/recuperar-senha')

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-5 py-10" style={{ colorScheme: 'dark' }}>
      <section className="w-full max-w-md rounded-3xl border border-slate-700/80 bg-[#0b1322] p-7 text-slate-50 shadow-2xl shadow-slate-950/25 sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15 text-emerald-200"><KeyRound className="h-6 w-6" /></div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-50">Crie uma nova senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Ao concluir, as sessões existentes serão revogadas e será necessário entrar novamente.</p>
        <PasswordUpdateForm />
      </section>
    </main>
  )
}
