import Link from 'next/link'
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Vacancy = {
  id: string
  municipality: string
  vacancy_kind: string
  vacancy_count: number | null
  sigec_courses: { canonical_name: string } | null
  sigec_modalities: { name: string } | null
}

export default async function PublicProcessDetailPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const processResult = await supabase
    .from('sigec_processes')
    .select('id, title, summary, description, edital_version, applications_open_at, applications_close_at, max_preferences')
    .eq('slug', params.slug)
    .eq('status', 'open')
    .maybeSingle()

  if (!processResult.data || processResult.error) notFound()
  const process = processResult.data
  const vacanciesResult = await supabase
    .from('sigec_vacancies')
    .select('id, municipality, vacancy_kind, vacancy_count, sigec_courses(canonical_name), sigec_modalities(name)')
    .eq('process_id', process.id)
    .eq('active', true)
    .order('municipality')
    .limit(500)
  const vacancies = (vacanciesResult.data ?? []) as unknown as Vacancy[]

  return (
    <main className="h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/processos" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Todos os processos</Link>

        <header className="mt-10 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Edital {process.edital_version}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">{process.title}</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">{process.summary || process.description}</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-300">
            {process.applications_close_at && <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"><CalendarDays className="h-3.5 w-3.5 text-emerald-400" /> Até {new Date(process.applications_close_at).toLocaleString('pt-BR')}</span>}
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Até {process.max_preferences} preferências</span>
          </div>
        </header>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-400">Catálogo</p><h2 className="mt-1 font-display text-2xl font-bold">Vagas disponíveis</h2></div><span className="text-xs text-slate-400">{vacancies.length} registros</span></div>
          {vacancies.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-7 text-sm text-slate-300">As vagas deste edital estão sendo organizadas.</div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {vacancies.map((vacancy) => (
                <article key={vacancy.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">{vacancy.sigec_modalities?.name || 'Modalidade'}</p>
                  <h3 className="mt-2 font-semibold">{vacancy.sigec_courses?.canonical_name || 'Área profissional'}</h3>
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-300"><MapPin className="h-4 w-4" /> {vacancy.municipality}</p>
                  <p className="mt-2 text-xs text-slate-400">{vacancy.vacancy_kind === 'cadastro_reserva' ? 'Cadastro de reserva' : `${vacancy.vacancy_count} vaga(s)`}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="my-12 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-7 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div><h2 className="font-display text-xl font-bold">Interessado neste processo?</h2><p className="mt-2 text-sm text-emerald-50/80">Crie seu acesso para preencher o perfil e preparar os documentos.</p></div>
          <Link href="/cadastro-candidato" className="mt-5 inline-flex rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 sm:mt-0">Criar cadastro</Link>
        </section>
      </div>
    </main>
  )
}
