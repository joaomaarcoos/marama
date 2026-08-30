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
    <div className="light h-dvh min-h-dvh overflow-y-auto bg-[#eef3f5] text-[#172033]" style={{ colorScheme: 'light' }}>
      <header className="sticky top-0 z-20 border-b border-[#d7e0e5] bg-[#ffffff]/95 shadow-[0_1px_0_rgba(23,32,51,.03)] backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
          <Link href="/minha-area" className="min-w-0 font-display text-base font-extrabold tracking-[-.02em] text-[#172033] sm:text-lg">SIGEC <span className="text-[#08785a]">Processos</span></Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <span className="hidden max-w-[18rem] truncate text-xs font-medium text-[#59677a] md:inline">{user.email}</span>
            <form action={logout}><button className="min-h-10 rounded-xl border border-[#ced8df] bg-[#ffffff] px-3.5 text-sm font-bold text-[#3e4d60] transition hover:border-[#9fb2bf] hover:bg-[#f5f8fa] hover:text-[#172033]">Sair</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
