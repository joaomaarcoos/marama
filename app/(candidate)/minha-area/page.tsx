import Link from 'next/link'
import { AlertCircle, ArrowRight, BriefcaseBusiness, Clock3, FileCheck2, GraduationCap, MessageCircleMore, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type CandidateProfile = { full_name: string; profile_completed_at: string | null; whatsapp_verified_at: string | null }
type CandidateApplication = {
  id: string
  application_state: string
  submitted_at: string | null
  updated_at: string
  sigec_processes: { title: string; slug: string } | null
  sigec_process_stages: { label: string; color: string } | null
}

export default async function CandidateHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [profileResult, applicationsResult] = await Promise.all([
    supabase.from('sigec_candidate_profiles').select('full_name, profile_completed_at, whatsapp_verified_at').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('sigec_applications')
      .select('id, application_state, submitted_at, updated_at, sigec_processes(title, slug), sigec_process_stages(label, color)')
      .eq('candidate_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  const schemaReady = !profileResult.error || profileResult.error?.code === 'PGRST116'
  const profile = profileResult.data as CandidateProfile | null
  const applications = (applicationsResult.data ?? []) as unknown as CandidateApplication[]
  const firstName = profile?.full_name?.split(' ')[0] || 'candidato'

  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#137052]">Área do candidato</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-[#172033]">Olá, {firstName}.</h1>
          <p className="mt-2 text-sm text-[#657084]">Acompanhe aqui suas candidaturas e solicitações.</p>
        </div>
        <Link href="/processos" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#afd6c8] bg-[#f4fbf8] px-4 text-sm font-extrabold text-[#0b684e] transition hover:border-[#79bda5] hover:bg-[#e8f7f1]">Explorar processos abertos <ArrowRight className="h-4 w-4" /></Link>
      </div>

      {!schemaReady && (
        <div className="mt-8 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <AlertCircle className="h-5 w-5 shrink-0" /> O ambiente do candidato ainda não foi ativado neste banco. Nenhuma informação sensível está sendo coletada.
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link href="/minha-area/perfil" className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033] transition hover:-translate-y-0.5 hover:border-[#8bcbb4] hover:shadow-md">
          <UserRound className="h-5 w-5 text-[#16845f]" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">Perfil</p>
          <p className="mt-1 font-semibold">{profile?.profile_completed_at ? 'Completo' : 'Completar dados'}</p>
        </Link>
        <Link href="/minha-area/verificar-whatsapp" className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033] transition hover:-translate-y-0.5 hover:border-[#8bcbb4] hover:shadow-md">
          <MessageCircleMore className="h-5 w-5 text-[#16845f]" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">WhatsApp</p>
          <p className="mt-1 font-semibold">{profile?.whatsapp_verified_at ? 'Verificado' : 'Confirmar número'}</p>
        </Link>
        <div className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033]">
          <Clock3 className="h-5 w-5 text-blue-600" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">Em andamento</p>
          <p className="mt-1 text-2xl font-bold">{applications.filter((item) => item.application_state !== 'withdrawn').length}</p>
        </div>
        <Link href="/minha-area/formacao" className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033] transition hover:-translate-y-0.5 hover:border-[#9db8dd] hover:shadow-md">
          <GraduationCap className="h-5 w-5 text-[#315f9d]" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">Formação</p>
          <p className="mt-1 font-semibold">Cadastrar trajetória</p>
        </Link>
        <Link href="/minha-area/experiencia" className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033] transition hover:-translate-y-0.5 hover:border-[#9db8dd] hover:shadow-md">
          <BriefcaseBusiness className="h-5 w-5 text-[#315f9d]" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">Experiência</p>
          <p className="mt-1 font-semibold">Cadastrar vínculos</p>
        </Link>
        <Link href="/minha-area/documentos" className="rounded-2xl border border-[#d9e0e7] bg-[#ffffff] p-5 text-[#172033] transition hover:-translate-y-0.5 hover:border-[#9db8dd] hover:shadow-md">
          <FileCheck2 className="h-5 w-5 text-[#315f9d]" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#657084]">Documentos</p>
          <p className="mt-1 font-semibold">Enviar arquivos</p>
        </Link>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-[#d9e0e7] bg-[#ffffff] text-[#172033]">
        <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-display text-lg font-bold">Minhas candidaturas</h2></div>
        {applications.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">Você ainda não possui candidaturas.</p>
            <Link href="/processos" className="mt-3 inline-flex text-sm font-bold text-emerald-700">Consultar oportunidades</Link>
          </div>
        ) : applications.map((application) => (
          <div key={application.id} className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 last:border-0 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0">
              <p className="font-semibold">{application.sigec_processes?.title || 'Processo seletivo'}</p>
              <p className="mt-1 text-xs text-slate-500">Atualizada em {new Date(application.updated_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ color: application.sigec_process_stages?.color || '#475569', background: `${application.sigec_process_stages?.color || '#475569'}18` }}>
              {application.sigec_process_stages?.label || (application.application_state === 'draft' ? 'Rascunho' : 'Recebida')}
            </span>
          </div>
        ))}
      </section>
    </main>
  )
}
