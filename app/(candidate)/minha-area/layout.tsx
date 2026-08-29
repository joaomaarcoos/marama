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
    <div className="h-screen overflow-y-auto bg-[#f1f4f6] text-[#172033]">
      <header className="sticky top-0 z-20 border-b border-[#d9e0e7] bg-[#ffffff]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/minha-area" className="font-display text-lg font-bold text-[#172033]">SIGEC <span className="text-[#16845f]">Processos</span></Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[#657084] sm:inline">{user.email}</span>
            <form action={logout}><button className="text-sm font-semibold text-[#526074] hover:text-[#172033]">Sair</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
