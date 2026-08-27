import Link from 'next/link'
import { redirect } from 'next/navigation'
import { logout } from '@/app/(auth)/login/actions'
import { createClient } from '@/lib/supabase/server'
import { extractRole, roleHome } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = extractRole(user)
  if (role !== 'candidato') redirect(roleHome(role))

  return (
    <div className="h-screen overflow-y-auto bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/minha-area" className="font-display text-lg font-bold">SIGEC <span className="text-emerald-600">Processos</span></Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>
            <form action={logout}><button className="text-sm font-semibold text-slate-600 hover:text-slate-950">Sair</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
