import Link from 'next/link'
import { ArrowRight, CalendarDays, CheckCircle2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { extractRole, roleHome } from '@/lib/roles'

export const dynamic = 'force-dynamic'

type PublicProcess = {
  id: string
  slug: string
  title: string
  summary: string | null
  edital_version: string
  applications_open_at: string | null
  applications_close_at: string | null
}

export default async function PublicProcessesPage() {
  let processes: PublicProcess[] = []
  let available = hasSupabasePublicEnv()
  let account: { href: string; label: string; email?: string } = { href: '/login', label: 'Entrar' }

  if (available) {
    const supabase = await createClient()
    const [userResult, result] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('sigec_processes')
        .select('id, slug, title, summary, edital_version, applications_open_at, applications_close_at')
        .eq('status', 'open')
        .order('applications_close_at', { ascending: true }),
    ])
    const user = userResult.data.user
    if (user) {
      const role = extractRole(user)
      account = { href: roleHome(role), label: role === 'candidato' ? 'Minha área' : 'Painel', email: user.email }
    }
    available = !result.error
    processes = ((result.data ?? []) as PublicProcess[])
      .map((process, index) => ({ process, index, sigecPriority: /sigec/i.test(`${process.title} ${process.slug}`) ? 0 : 1 }))
      .sort((left, right) => left.sigecPriority - right.sigecPriority || left.index - right.index)
      .map(({ process }) => process)
  }

  return (
    <main className="h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10 sm:py-12">
        <header className="flex items-center justify-between gap-4 sm:gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Maranhão Profissionalizado</p>
            <p className="mt-2 font-display text-xl font-bold">SIGEC Processos</p>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {account.email && <span className="hidden max-w-[15rem] truncate text-xs font-medium text-slate-400 lg:inline">Sessão ativa · {account.email}</span>}
            <Link href={account.href} className="shrink-0 rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white transition hover:border-emerald-300/50 hover:bg-white/10">
              {account.label}
            </Link>
          </div>
        </header>

        <section className="grid gap-10 py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Portal oficial de candidaturas
            </span>
            <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
              Sua trajetória profissional começa por aqui.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Consulte editais, escolha as vagas conforme a regra de cada processo e acompanhe cada etapa da sua candidatura em um único lugar.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold text-white">Como funciona</p>
            <ol className="mt-4 space-y-3 text-sm text-slate-300">
              {['Crie seu cadastro e confirme seus contatos', 'Preencha o perfil e envie os documentos', 'Acompanhe pendências, resultado e convocação'].map((item, index) => (
                <li key={item} className="flex gap-3"><span className="font-mono text-emerald-400">0{index + 1}</span>{item}</li>
              ))}
            </ol>
          </div>
        </section>

        <section className="pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-400">Oportunidades</p>
              <h2 className="mt-1 font-display text-2xl font-bold">Processos com inscrições abertas</h2>
            </div>
          </div>

          {!available ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-6 text-sm text-amber-100">
              O catálogo está em preparação. Nenhum dado de candidato é coletado enquanto o ambiente seguro não estiver ativado.
            </div>
          ) : processes.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300">
              Não há processo com inscrições abertas neste momento.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {processes.map((process) => (
                <Link key={process.id} href={`/processos/${process.slug}`} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-0.5 hover:border-emerald-400/40">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Edital {process.edital_version}</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold">{process.title}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">{process.summary || 'Consulte as vagas, requisitos e etapas deste processo seletivo.'}</p>
                  {process.applications_close_at && (
                    <p className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                      <CalendarDays className="h-3.5 w-3.5" /> Inscrições até {new Date(process.applications_close_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Status e comunicações oficiais ficam registrados no portal.
          </div>
        </section>
      </div>
    </main>
  )
}
