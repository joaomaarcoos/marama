import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { CandidateDocumentCenter } from '@/components/candidate-document-center'
import { createClient } from '@/lib/supabase/server'
import { deriveSigecAudience, matchesSigecAudience, type SigecAudience } from '@/lib/sigec-application-conditions'

export default async function CandidateDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: applicationRows } = await supabase.from('sigec_applications').select('id, process_id, application_state, sigec_processes(title)').eq('candidate_id', user.id).in('application_state', ['draft', 'submitted']).order('created_at', { ascending: false })
  const applications = (applicationRows || []).map((row: any) => ({ id: row.id, processId: row.process_id, state: row.application_state, title: row.sigec_processes?.title || 'Processo seletivo' }))
  const processIds = Array.from(new Set<string>(applications.map(item => String(item.processId))))
  const applicationIds = applications.map(item => item.id)
  const [{ data: requirementRows }, { data: documentRows }, { data: questionRows }, { data: answerRows }, { data: requestRows }] = await Promise.all([
    processIds.length ? supabase.from('sigec_document_requirements').select('id, process_id, label, instructions, required, accepted_mime_types, max_file_size_bytes, condition_config').in('process_id', processIds).order('position') : Promise.resolve({ data: [] }),
    applicationIds.length ? supabase.from('sigec_application_documents').select('id, application_id, requirement_id, version, original_name, technical_status, malware_status, created_at').in('application_id', applicationIds).is('removed_at', null).order('version', { ascending: false }) : Promise.resolve({ data: [] }),
    processIds.length ? supabase.from('sigec_process_questions').select('id, process_id, config').in('process_id', processIds) : Promise.resolve({ data: [] }),
    applicationIds.length ? supabase.from('sigec_application_answers').select('application_id, question_id, answer').in('application_id', applicationIds) : Promise.resolve({ data: [] }),
    applicationIds.length ? supabase.from('sigec_information_requests').select('id, application_id, requested_fields, due_at').in('application_id', applicationIds).eq('status', 'open').gt('due_at', new Date().toISOString()).order('due_at') : Promise.resolve({ data: [] }),
  ])
  const requirements = (requirementRows || []).map((row: any) => {
    const applicableApplicationIds = applications.filter((application) => {
      if (application.processId !== row.process_id) return false
      const processQuestions = (questionRows || []).filter((question: any) => question.process_id === application.processId)
      const answers = Object.fromEntries((answerRows || []).filter((answer: any) => answer.application_id === application.id).map((answer: any) => [answer.question_id, answer.answer]))
      const flags = deriveSigecAudience(processQuestions, answers)
      return matchesSigecAudience((row.condition_config?.audience || 'all') as SigecAudience, flags)
    }).map((application) => application.id)
    const informationRequests = (requestRows || []).filter((item: any) => applicableApplicationIds.includes(item.application_id) && Array.isArray(item.requested_fields) && item.requested_fields.some((field: any) => field?.kind === 'document' && field?.id === row.id)).map((item: any) => ({ applicationId: String(item.application_id), id: String(item.id), dueAt: String(item.due_at) }))
    return { id: row.id, processId: row.process_id, applicableApplicationIds, label: row.label, description: row.instructions || '', required: row.required, mimeTypes: row.accepted_mime_types || [], maxSizeBytes: Number(row.max_file_size_bytes), informationRequests }
  })
  const documents = (documentRows || []).filter((row: any) => row.requirement_id).map((row: any) => ({ id: row.id, applicationId: row.application_id, requirementId: row.requirement_id, version: row.version, originalName: row.original_name, technicalStatus: row.technical_status, malwareStatus: row.malware_status, createdAt: row.created_at }))
  return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10"><Link href="/minha-area" className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-bold text-[#46566b] hover:text-[#23578f]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link><div className="mt-4 border-b border-[#d4dee5] pb-5 sm:mt-6 sm:pb-7"><p className="flex items-center gap-2 text-sm font-bold text-[#235f9f]"><FileText className="h-5 w-5" /> Meus documentos</p><h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-.03em] text-[#142038] sm:text-4xl">Envie os documentos pedidos</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#526177]">Escolha um arquivo para cada documento solicitado. Depois do envio, você poderá acompanhar tudo na lista abaixo.</p></div><div className="mt-5 sm:mt-7"><CandidateDocumentCenter applications={applications} requirements={requirements} documents={documents} /></div></main>
}
