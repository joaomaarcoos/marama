import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CandidateVacancyPreferences, type CandidateVacancy } from '@/components/candidate-vacancy-preferences'

export default async function CandidateApplicationPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: application } = await supabase.from('sigec_applications').select('id, process_id, application_state, sigec_processes(title, max_preferences)').eq('id', params.id).eq('candidate_id', user.id).maybeSingle()
  if (!application) notFound()
  const [{ data: vacancies }, { data: preferences }] = await Promise.all([
    supabase.from('sigec_vacancies').select('id, municipality, vacancy_kind, vacancy_count, sigec_courses(canonical_name), sigec_modalities(name)').eq('process_id', application.process_id).eq('active', true).order('municipality'),
    supabase.from('sigec_application_preferences').select('vacancy_id, position').eq('application_id', application.id).order('position'),
  ])
  const process = application.sigec_processes as unknown as { title: string; max_preferences: number }
  const options: CandidateVacancy[] = ((vacancies || []) as any[]).map((item) => ({ id: item.id, title: item.sigec_courses?.canonical_name || 'Área profissional', municipality: item.municipality, modality: item.sigec_modalities?.name || 'Modalidade', vacancyLabel: item.vacancy_kind === 'cadastro_reserva' ? 'Cadastro de reserva' : `${item.vacancy_count} vaga(s)` }))
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"><Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link><header className="mt-7 border-b border-[#d9e0e7] pb-7"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#16845f]">Sua inscrição</p><h1 className="mt-2 font-display text-3xl font-bold text-[#172033] sm:text-4xl">Escolha suas vagas</h1><p className="mt-3 text-sm text-[#657084]">{process.title}. A opção número 1 será sua maior preferência.</p></header><div className="mt-8"><CandidateVacancyPreferences applicationId={application.id} vacancies={options} initialIds={(preferences || []).map((item) => item.vacancy_id)} maxPreferences={process.max_preferences} locked={application.application_state !== 'draft'} /></div></main>
}
