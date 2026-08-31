import Link from 'next/link'
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, MapPin, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extractRole, roleHome } from '@/lib/roles'
import { startSigecApplication } from './actions'

export const dynamic = 'force-dynamic'

type Vacancy = {
  id: string
  municipality: string
  vacancy_kind: string
  vacancy_count: number | null
  sigec_courses: { canonical_name: string } | null
  sigec_modalities: { name: string } | null
}

export default async function PublicProcessDetailPage({ params, searchParams }: { params: { slug: string }; searchParams: { inscricao?: string } }) {
  const supabase = await createClient()
  const [userResult, processResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('sigec_processes')
      .select('id, title, summary, description, edital_version, applications_open_at, applications_close_at, max_preferences')
      .eq('slug', params.slug)
      .eq('status', 'open')
      .maybeSingle(),
  ])
  const user = userResult.data.user
  const role = extractRole(user)
  const accountHref = user ? roleHome(role) : '/login'
  const accountLabel = user ? (role === 'candidato' ? 'Minha área' : 'Painel') : 'Entrar'

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
  const [profileResult, applicationResult] = role === 'candidato' && user
    ? await Promise.all([
        supabase.from('sigec_candidate_profiles').select('profile_completed_at, whatsapp_verified_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('sigec_applications').select('id, application_state').eq('process_id', process.id).eq('candidate_id', user.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }]
  const candidateReady = Boolean(profileResult.data?.profile_completed_at && profileResult.data?.whatsapp_verified_at)
  const application = applicationResult.data as { id: string; application_state: string } | null

  return (
    <main className="h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between gap-4"><Link href="/processos" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Todos os processos</Link><Link href={accountHref} className="rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white transition hover:border-emerald-300/50 hover:bg-white/10">{accountLabel}</Link></div>

        <header className="mt-10 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Edital {process.edital_version}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">{process.title}</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">{process.summary || process.description}</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-300">
            {process.applications_close_at && <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"><CalendarDays className="h-3.5 w-3.5 text-emerald-400" /> Até {new Date(process.applications_close_at).toLocaleString('pt-BR')}</span>}
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {process.max_preferences === 1 ? 'Uma opção de vaga' : `Até ${process.max_preferences} preferências`}</span>
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

        {searchParams.inscricao && <div className="mt-10 flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-50"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{searchParams.inscricao === 'cadastro' ? 'Complete seus dados e confirme o WhatsApp antes de iniciar a inscrição.' : 'Não foi possível iniciar a inscrição. Confira se o prazo ainda está aberto.'}</div>}

        <section className="my-12 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-7">
          <div><h2 className="font-display text-xl font-bold">{application ? 'Sua inscrição já foi iniciada.' : user ? 'Pronto para participar?' : 'Interessado neste processo?'}</h2><p className="mt-2 text-sm text-emerald-50/80">{application ? 'Continue o preenchimento pela sua área.' : role === 'candidato' ? (candidateReady ? 'Inicie agora e continue o preenchimento com calma.' : 'Complete seu cadastro e confirme o WhatsApp para começar.') : user ? 'Acesse seu painel para administrar os processos.' : 'Crie seu acesso para preencher o perfil e preparar os documentos.'}</p></div>
          {application ? (
            <Link href="/minha-area" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 sm:mt-0"><CheckCircle2 className="h-4 w-4" /> Continuar inscrição</Link>
          ) : role === 'candidato' && candidateReady ? (
            <form action={startSigecApplication} className="mt-5 sm:mt-0"><input type="hidden" name="processId" value={process.id} /><input type="hidden" name="slug" value={params.slug} /><button className="inline-flex min-h-12 items-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300">Iniciar inscrição</button></form>
          ) : (
            <Link href={role === 'candidato' ? '/minha-area' : user ? accountHref : '/cadastro-candidato'} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 sm:mt-0">{role === 'candidato' ? 'Completar cadastro' : user ? accountLabel : 'Criar cadastro'}</Link>
          )}
        </section>
      </div>
    </main>
  )
}
