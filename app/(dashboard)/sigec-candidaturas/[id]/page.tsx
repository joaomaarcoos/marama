import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import type { SigecApplicationDetail, SigecDiligenceOption, SigecDocumentReview, SigecInformationRequest } from '@/lib/sigec-application-detail'
import { SigecApplicationReviewDetail } from '@/components/sigec-application-review-detail'

export const dynamic = 'force-dynamic'

export default async function SigecApplicationDetailPage({ params }: { params: { id: string } }) {
  const parsedId = z.string().uuid().safeParse(params.id)
  if (!parsedId.success) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !['admin', 'gerente'].includes(extractRole(user))) redirect('/acesso-negado')

  const admin = getAdminClient()
  const { data, error } = await admin.rpc('sigec_get_application_review_detail', {
    p_actor_id: user.id,
    p_application_id: parsedId.data,
  })
  if (error?.code === 'P0002') notFound()
  const detail = data as SigecApplicationDetail | null
  const [reviewsResult, requestsResult, questionsResult, requirementsResult] = !error && detail
    ? await Promise.all([
      admin.from('sigec_document_reviews').select('id,document_id,decision,public_reason,internal_note,created_at').eq('application_id', parsedId.data).order('created_at', { ascending: false }).limit(500),
      admin.from('sigec_information_requests').select('id,message,requested_fields,due_at,status,answered_at,closed_at,resolution_message,created_at').eq('application_id', parsedId.data).order('created_at', { ascending: false }).limit(100),
      admin.from('sigec_process_questions').select('id,label,required').eq('process_id', detail.application.processId).order('position').limit(200),
      admin.from('sigec_document_requirements').select('id,label,required').eq('process_id', detail.application.processId).order('position').limit(200),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  return <>
    <div className="app-header"><div><h1>Análise da candidatura</h1><p className="app-subtitle">Documentos, respostas e solicitações da candidatura</p></div></div>
    <div className="app-content animate-fade-up space-y-5">
      <Link href="/sigec-candidaturas" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}><ArrowLeft className="h-4 w-4" /> Voltar para candidaturas</Link>
      {error || !detail ? <div className="rounded-xl p-5 text-sm" style={{ background: 'hsl(var(--accent-red) / .08)', border: '1px solid hsl(var(--accent-red) / .35)', color: 'hsl(var(--fg1))' }}>Não foi possível carregar esta candidatura. Tente novamente.</div> : <SigecApplicationReviewDetail detail={detail} reviews={(reviewsResult.data || []) as SigecDocumentReview[]} requests={(requestsResult.data || []) as SigecInformationRequest[]} diligenceQuestions={(questionsResult.data || []) as SigecDiligenceOption[]} diligenceDocuments={(requirementsResult.data || []) as SigecDiligenceOption[]} />}
    </div>
  </>
}
