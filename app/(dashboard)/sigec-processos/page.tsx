import Link from 'next/link'
import { ArrowRight, BriefcaseBusiness, FileCheck2, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SigecProcessForm } from '@/components/sigec-process-form'

export const dynamic = 'force-dynamic'

type ProcessRow = {
  id: string
  title: string
  status: string
  applications_open_at: string | null
  applications_close_at: string | null
  updated_at: string
}

export default async function SigecProcessesPage() {
  const supabase = await createClient()
  const [processesResult, applicationsResult, candidatesResult] = await Promise.all([
    supabase
      .from('sigec_processes')
      .select('id, title, status, applications_open_at, applications_close_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase.from('sigec_applications').select('*', { count: 'exact', head: true }),
    supabase.from('sigec_candidate_profiles').select('*', { count: 'exact', head: true }),
  ])

  const schemaReady = !processesResult.error
  const processes = (processesResult.data ?? []) as ProcessRow[]
  const openProcesses = processes.filter((process) => process.status === 'open').length

  const cards = [
    { label: 'Processos abertos', value: openProcesses, icon: BriefcaseBusiness, color: 'hsl(var(--accent-blue))' },
    { label: 'Candidatos', value: candidatesResult.count ?? 0, icon: Users, color: 'hsl(var(--accent-violet))' },
    { label: 'Candidaturas', value: applicationsResult.count ?? 0, icon: FileCheck2, color: 'hsl(var(--accent-green))' },
  ]

  return (
    <>
      <div className="app-header">
        <div>
          <h1>SIGEC Processos</h1>
          <p className="app-subtitle">Gestão segura de processos seletivos e candidaturas</p>
        </div>
        <Link href="/processos" className="ds-btn ds-btn--secondary" target="_blank">
          Ver página pública
        </Link>
      </div>

      <div className="app-content animate-fade-up space-y-5">
        {!schemaReady && (
          <div className="rounded-xl p-5" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--accent-amber) / .45)' }}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-amber))' }} />
              <div>
                <p className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Banco do SIGEC ainda não ativado neste ambiente</p>
                <p className="mt-1 text-sm" style={{ color: 'hsl(var(--fg2))' }}>
                  O projeto correto foi identificado, mas a migração ainda precisa de uma credencial SQL segura. A criação permanecerá bloqueada até a ativação do schema.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl p-5" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'hsl(var(--fg2))' }}>{label}</p>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <p className="mt-4 font-data text-3xl" style={{ color: 'hsl(var(--fg1))' }}>{value.toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
          <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              <h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Processos recentes</h2>
              <p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Configuração de edital, etapas, vagas, documentos e pontuação</p>
            </div>
            {processes.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <BriefcaseBusiness className="mx-auto h-7 w-7" style={{ color: 'hsl(var(--fg3))' }} />
                <p className="mt-3 text-sm font-medium" style={{ color: 'hsl(var(--fg2))' }}>Nenhum processo cadastrado</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>
                  O primeiro processo será criado como rascunho e só poderá ser publicado após os gates de configuração e segurança.
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {processes.map((process) => (
                  <Link key={process.id} href={`/sigec-processos/${process.id}`} className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{process.title}</p>
                      <p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>
                        Atualizado em {new Date(process.updated_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold uppercase" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}>
                        {process.status}
                      </span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'hsl(var(--fg3))' }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-xl p-5 xl:sticky xl:top-5" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--accent-green) / .1)', color: 'hsl(var(--accent-green))' }}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Novo processo</h2>
                <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Comece pelo rascunho. Publicação é uma etapa separada e auditada.</p>
              </div>
            </div>
            <SigecProcessForm disabled={!schemaReady} />
          </aside>
        </div>
      </div>
    </>
  )
}
