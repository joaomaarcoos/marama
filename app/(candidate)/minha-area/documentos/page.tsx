import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { CandidateDocumentCenter } from '@/components/candidate-document-center'
import { createClient } from '@/lib/supabase/server'

export default async function CandidateDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: applicationRows } = await supabase.from('sigec_applications').select('id, process_id, sigec_processes(title)').eq('candidate_id', user.id).in('application_state', ['draft', 'submitted']).order('created_at', { ascending: false })
  const applications = (applicationRows || []).map((row: any) => ({ id: row.id, processId: row.process_id, title: row.sigec_processes?.title || 'Processo seletivo' }))
  const processIds = Array.from(new Set<string>(applications.map(item => String(item.processId))))
  const applicationIds = applications.map(item => item.id)
  const [{ data: requirementRows }, { data: documentRows }] = await Promise.all([
    processIds.length ? supabase.from('sigec_document_requirements').select('id, process_id, label, instructions, required, accepted_mime_types, max_file_size_bytes').in('process_id', processIds).order('position') : Promise.resolve({ data: [] }),
    applicationIds.length ? supabase.from('sigec_application_documents').select('id, application_id, requirement_id, version, original_name, technical_status, malware_status, created_at').in('application_id', applicationIds).order('version', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const requirements = (requirementRows || []).map((row: any) => ({ id: row.id, processId: row.process_id, label: row.label, description: row.instructions || '', required: row.required, mimeTypes: row.accepted_mime_types || [], maxSizeBytes: Number(row.max_file_size_bytes) }))
  const documents = (documentRows || []).filter((row: any) => row.requirement_id).map((row: any) => ({ id: row.id, applicationId: row.application_id, requirementId: row.requirement_id, version: row.version, originalName: row.original_name, technicalStatus: row.technical_status, malwareStatus: row.malware_status, createdAt: row.created_at }))
  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10"><Link href="/minha-area" className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-2 text-sm font-bold text-[#46566b] hover:text-[#23578f]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link><div className="mt-5 border-b border-[#d4dee5] pb-6 sm:mt-7 sm:pb-7"><p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-[#235f9f] sm:text-xs"><ShieldCheck className="h-4 w-4" /> Central de documentos</p><h1 className="mt-2 max-w-4xl font-display text-3xl font-extrabold leading-tight tracking-[-.03em] text-[#142038] sm:text-4xl">Documentos protegidos e versionados.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#526177] sm:text-[15px]">Cada envio é validado pelo conteúdo, imagens têm metadados removidos e correções criam uma nova versão. A comissão só poderá abrir o arquivo após a etapa antimalware.</p></div><div className="mt-6 sm:mt-8"><CandidateDocumentCenter applications={applications} requirements={requirements} documents={documents} /></div></main>
}
