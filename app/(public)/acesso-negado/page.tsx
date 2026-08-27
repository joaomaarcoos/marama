import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'

export default function AccessDeniedPage() {
  return (
    <main className="flex h-screen items-center justify-center overflow-y-auto bg-slate-950 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center">
        <ShieldX className="mx-auto h-9 w-9 text-amber-400" />
        <h1 className="mt-5 font-display text-2xl font-bold">Acesso não autorizado</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Sua conta não possui permissão para esta área. Nenhum dado foi exibido.</p>
        <div className="mt-7 grid gap-3">
          <Link href="/" className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950">Ir para minha área</Link>
          <form action={logout}>
            <button className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/10">Sair da conta</button>
          </form>
        </div>
      </div>
    </main>
  )
}
