import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CandidateVacancyPreferences, type CandidateVacancy } from '@/components/candidate-vacancy-preferences'
import { CandidateApplicationQuestions, type CandidateQuestion } from '@/components/candidate-application-questions'
import { CandidateSubmissionReadiness, type CandidateSubmissionReadinessItem } from '@/components/candidate-submission-readiness'
import { CandidateApplicationSubmit } from '@/components/candidate-application-submit'
import { CandidateInformationRequest, type CandidateInformationRequestItem } from '@/components/candidate-information-request'

export default async function CandidateApplicationPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: application } = await supabase.from('sigec_applications').select('id, process_id, application_state, sigec_processes(title, max_preferences, status, applications_open_at, applications_close_at)').eq('id', params.id).eq('candidate_id', user.id).maybeSingle()
  if (!application) notFound()
  const [{ data: vacancies }, { data: preferences }, { data: questionRows }, { data: answerRows }, { data: readinessRows }, { data: submissionRows }, { data: requestRows }, { data: requirementRows }, { data: disqualificationRows }] = await Promise.all([
    supabase.from('sigec_vacancies').select('id, municipality, vacancy_kind, vacancy_count, sigec_courses(canonical_name), sigec_modalities(name)').eq('process_id', application.process_id).eq('active', true).order('municipality'),
    supabase.from('sigec_application_preferences').select('vacancy_id, position').eq('application_id', application.id).order('position'),
    supabase.from('sigec_process_questions').select('id, label, help_text, question_type, required, config').eq('process_id', application.process_id).order('position'),
    supabase.from('sigec_application_answers').select('question_id, answer').eq('application_id', application.id),
    supabase.rpc('sigec_get_application_submission_readiness', { p_application_id: application.id }),
    supabase.from('sigec_application_submission_versions').select('protocol, submitted_at, version, is_current').eq('application_id', application.id).order('version', { ascending: false }),
    supabase.from('sigec_information_requests').select('id, message, requested_fields, due_at').eq('application_id', application.id).eq('status', 'open').gt('due_at', new Date().toISOString()).order('due_at'),
    supabase.from('sigec_document_requirements').select('id, label').eq('process_id', application.process_id),
    supabase.rpc('sigec_get_candidate_disqualification', { p_application_id: application.id }),
  ])
  const process = application.sigec_processes as unknown as { title: string; max_preferences: number; status: string; applications_open_at: string | null; applications_close_at: string | null }
  const options: CandidateVacancy[] = ((vacancies || []) as any[]).map((item) => ({ id: item.id, title: item.sigec_courses?.canonical_name || 'Área profissional', municipality: item.municipality, modality: item.sigec_modalities?.name || 'Modalidade', vacancyLabel: item.vacancy_kind === 'cadastro_reserva' ? 'Cadastro de reserva' : `${item.vacancy_count} vaga(s)` }))
  const questions: CandidateQuestion[] = ((questionRows || []) as any[]).map((item) => ({ id: item.id, label: item.label, helpText: item.help_text || '', type: item.question_type, required: item.required, config: item.config || {} }))
  const initialAnswers = Object.fromEntries((answerRows || []).map((item) => [item.question_id, item.answer]))
  const readiness = (readinessRows || []) as CandidateSubmissionReadinessItem[]
  const coreReady = readiness.length === 6 && readiness.filter((item) => item.code !== 'consents').every((item) => item.ready)
  const now = Date.now()
  const disqualification = ((disqualificationRows || []) as Array<{ reason_label: string; public_message: string; decided_at: string }>)[0]
  const correctionAllowed = process.status === 'open'
    && (!process.applications_open_at || new Date(process.applications_open_at).getTime() <= now)
    && (!process.applications_close_at || new Date(process.applications_close_at).getTime() > now)
    && !disqualification
  const submissions = ((submissionRows || []) as any[]).map((item) => ({ protocol: String(item.protocol), submittedAt: String(item.submitted_at), version: Number(item.version), isCurrent: Boolean(item.is_current) }))
  const informationRequests: CandidateInformationRequestItem[] = ((requestRows || []) as any[]).map((request) => {
    const fields = Array.isArray(request.requested_fields) ? request.requested_fields : []
    const questionIds = new Set(fields.filter((field: any) => field?.kind === 'question').map((field: any) => String(field.id)))
    const documentIds = new Set(fields.filter((field: any) => field?.kind === 'document').map((field: any) => String(field.id)))
    return {
      id: String(request.id),
      message: String(request.message),
      dueAt: String(request.due_at),
      questions: questions.filter((question) => questionIds.has(question.id)),
      documentLabels: ((requirementRows || []) as any[]).filter((requirement) => documentIds.has(String(requirement.id))).map((requirement) => String(requirement.label)),
      initialAnswers: Object.fromEntries(Object.entries(initialAnswers).filter(([questionId]) => questionIds.has(questionId))),
    }
  })
  const editingCorrection = application.application_state === 'draft' && submissions.length > 0
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"><Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link><header className="mt-7 border-b border-[#d9e0e7] pb-7"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#16845f]">Sua inscrição</p><h1 className="mt-2 font-display text-3xl font-bold text-[#172033] sm:text-4xl">{disqualification ? 'Candidatura desclassificada' : editingCorrection ? 'Corrija sua inscrição' : application.application_state === 'submitted' ? 'Inscrição enviada' : 'Complete sua inscrição'}</h1><p className="mt-3 text-sm text-[#657084]">{process.title}. {application.application_state === 'submitted' ? 'Confira seu protocolo e o andamento da sua candidatura.' : 'Escolha suas vagas e responda às perguntas abaixo.'}</p></header>{disqualification && <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 sm:p-6"><div className="flex gap-3"><Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><div><h2 className="font-bold">Motivo da desclassificação</h2><p className="mt-2 text-sm font-semibold">{disqualification.reason_label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-900">{disqualification.public_message}</p><p className="mt-3 text-xs text-red-700">Decisão registrada em {new Date(disqualification.decided_at).toLocaleString('pt-BR')}</p></div></div></section>}<CandidateApplicationSubmit applicationId={application.id} applicationState={application.application_state} enabled={coreReady} correctionAllowed={correctionAllowed} submissions={submissions} placement="top" />{informationRequests.map((request) => <CandidateInformationRequest key={request.id} request={request} />)}<div className="mt-8"><CandidateVacancyPreferences applicationId={application.id} vacancies={options} initialIds={(preferences || []).map((item) => item.vacancy_id)} maxPreferences={process.max_preferences} locked={application.application_state !== 'draft'} /></div><CandidateApplicationQuestions applicationId={application.id} questions={questions} initialAnswers={initialAnswers} locked={application.application_state !== 'draft'} />{application.application_state === 'draft' && <CandidateSubmissionReadiness items={readiness} />}<CandidateApplicationSubmit applicationId={application.id} applicationState={application.application_state} enabled={coreReady} correctionAllowed={correctionAllowed} submissions={submissions} placement="bottom" /></main>
}
