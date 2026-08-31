import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CandidateVacancyPreferences, type CandidateVacancy } from '@/components/candidate-vacancy-preferences'
import { CandidateApplicationQuestions, type CandidateQuestion } from '@/components/candidate-application-questions'
import { CandidateSubmissionReadiness, type CandidateSubmissionReadinessItem } from '@/components/candidate-submission-readiness'
import { CandidateApplicationSubmit } from '@/components/candidate-application-submit'

export default async function CandidateApplicationPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: application } = await supabase.from('sigec_applications').select('id, process_id, application_state, sigec_processes(title, max_preferences, status, applications_open_at, applications_close_at)').eq('id', params.id).eq('candidate_id', user.id).maybeSingle()
  if (!application) notFound()
  const [{ data: vacancies }, { data: preferences }, { data: questionRows }, { data: answerRows }, { data: readinessRows }, { data: submissionRows }] = await Promise.all([
    supabase.from('sigec_vacancies').select('id, municipality, vacancy_kind, vacancy_count, sigec_courses(canonical_name), sigec_modalities(name)').eq('process_id', application.process_id).eq('active', true).order('municipality'),
    supabase.from('sigec_application_preferences').select('vacancy_id, position').eq('application_id', application.id).order('position'),
    supabase.from('sigec_process_questions').select('id, label, help_text, question_type, required, config').eq('process_id', application.process_id).order('position'),
    supabase.from('sigec_application_answers').select('question_id, answer').eq('application_id', application.id),
    supabase.rpc('sigec_get_application_submission_readiness', { p_application_id: application.id }),
    supabase.from('sigec_application_submission_versions').select('protocol, submitted_at, version, is_current').eq('application_id', application.id).order('version', { ascending: false }),
  ])
  const process = application.sigec_processes as unknown as { title: string; max_preferences: number; status: string; applications_open_at: string | null; applications_close_at: string | null }
  const options: CandidateVacancy[] = ((vacancies || []) as any[]).map((item) => ({ id: item.id, title: item.sigec_courses?.canonical_name || 'Área profissional', municipality: item.municipality, modality: item.sigec_modalities?.name || 'Modalidade', vacancyLabel: item.vacancy_kind === 'cadastro_reserva' ? 'Cadastro de reserva' : `${item.vacancy_count} vaga(s)` }))
  const questions: CandidateQuestion[] = ((questionRows || []) as any[]).map((item) => ({ id: item.id, label: item.label, helpText: item.help_text || '', type: item.question_type, required: item.required, config: item.config || {} }))
  const initialAnswers = Object.fromEntries((answerRows || []).map((item) => [item.question_id, item.answer]))
  const readiness = (readinessRows || []) as CandidateSubmissionReadinessItem[]
  const coreReady = readiness.length === 6 && readiness.filter((item) => item.code !== 'consents').every((item) => item.ready)
  const now = Date.now()
  const correctionAllowed = process.status === 'open'
    && (!process.applications_open_at || new Date(process.applications_open_at).getTime() <= now)
    && (!process.applications_close_at || new Date(process.applications_close_at).getTime() > now)
  const submissions = ((submissionRows || []) as any[]).map((item) => ({ protocol: String(item.protocol), submittedAt: String(item.submitted_at), version: Number(item.version), isCurrent: Boolean(item.is_current) }))
  const editingCorrection = application.application_state === 'draft' && submissions.length > 0
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"><Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link><header className="mt-7 border-b border-[#d9e0e7] pb-7"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#16845f]">Sua inscrição</p><h1 className="mt-2 font-display text-3xl font-bold text-[#172033] sm:text-4xl">{editingCorrection ? 'Corrija sua inscrição' : application.application_state === 'submitted' ? 'Inscrição enviada' : 'Complete sua inscrição'}</h1><p className="mt-3 text-sm text-[#657084]">{process.title}. {application.application_state === 'submitted' ? 'Confira seu protocolo ou inicie uma correção enquanto o prazo estiver aberto.' : 'Escolha suas vagas e responda às perguntas abaixo.'}</p></header><CandidateApplicationSubmit applicationId={application.id} applicationState={application.application_state} enabled={coreReady} correctionAllowed={correctionAllowed} submissions={submissions} placement="top" /><div className="mt-8"><CandidateVacancyPreferences applicationId={application.id} vacancies={options} initialIds={(preferences || []).map((item) => item.vacancy_id)} maxPreferences={process.max_preferences} locked={application.application_state !== 'draft'} /></div><CandidateApplicationQuestions applicationId={application.id} questions={questions} initialAnswers={initialAnswers} locked={application.application_state !== 'draft'} />{application.application_state === 'draft' && <CandidateSubmissionReadiness items={readiness} />}<CandidateApplicationSubmit applicationId={application.id} applicationState={application.application_state} enabled={coreReady} correctionAllowed={correctionAllowed} submissions={submissions} placement="bottom" /></main>
}
