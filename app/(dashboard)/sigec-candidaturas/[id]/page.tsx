import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import type { SigecAcademicProductionReview, SigecAcademicProductionScore, SigecAdvancementReadiness, SigecApplicationDetail, SigecDiligenceOption, SigecDisqualificationDecision, SigecDisqualificationReason, SigecDocumentReview, SigecExperienceReview, SigecExperienceScore, SigecInformationRequest, SigecPostgraduateEducation, SigecPostgraduateReview, SigecPostgraduateScore, SigecStageOption, SigecTeachingExperience } from '@/lib/sigec-application-detail'
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
  const identityResult = !error && detail
    ? await admin.from('sigec_applications').select('candidate_id').eq('id', parsedId.data).maybeSingle()
    : { data: null }
  const [reviewsResult, requestsResult, questionsResult, requirementsResult, readinessResult, transitionsResult, catalogsResult, decisionResult, educationResult, postgraduateReviewsResult, postgraduateScoreResult, experienceResult, experienceReviewsResult, experienceScoreResult, academicReviewsResult, academicScoreResult] = !error && detail && identityResult.data?.candidate_id
    ? await Promise.all([
      admin.from('sigec_document_reviews').select('id,document_id,decision,public_reason,internal_note,created_at').eq('application_id', parsedId.data).order('created_at', { ascending: false }).limit(500),
      admin.from('sigec_information_requests').select('id,message,requested_fields,due_at,status,answered_at,closed_at,resolution_message,created_at').eq('application_id', parsedId.data).order('created_at', { ascending: false }).limit(100),
      admin.from('sigec_process_questions').select('id,label,required').eq('process_id', detail.application.processId).order('position').limit(200),
      admin.from('sigec_document_requirements').select('id,label,required').eq('process_id', detail.application.processId).order('position').limit(200),
      admin.rpc('sigec_get_application_advancement_readiness', { p_actor_id: user.id, p_application_id: parsedId.data }),
      detail.application.stageId
        ? admin.from('sigec_process_stage_transitions').select('to_stage_id,sigec_process_stages!sigec_process_stage_transitions_to_stage_id_fkey(id,label)').eq('process_id', detail.application.processId).eq('from_stage_id', detail.application.stageId).eq('active', true).limit(50)
        : Promise.resolve({ data: [] }),
      admin.from('sigec_disqualification_catalog_versions').select('id').eq('process_id', detail.application.processId).eq('status', 'confirmed').eq('normative_status', 'confirmed').maybeSingle(),
      admin.from('sigec_application_disqualifications').select('reason_code,reason_label,public_message,catalog_version,decided_at').eq('application_id', parsedId.data).maybeSingle(),
      admin.from('sigec_candidate_education').select('id,level,course_name,institution,completion_date').eq('candidate_id', identityResult.data.candidate_id).eq('is_completed', true).in('level', ['especializacao', 'mestrado', 'doutorado']).order('completion_date', { ascending: false }),
      admin.from('sigec_postgraduate_evidence_reviews').select('id,education_id,document_id,version,decision,education_level,points_snapshot,public_reason,created_at').eq('application_id', parsedId.data).order('version', { ascending: false }).limit(500),
      admin.rpc('sigec_get_postgraduate_score', { p_actor_id: user.id, p_application_id: parsedId.data }),
      admin.from('sigec_candidate_experience').select('id,employment_type,institution,role_title,starts_on,ends_on,is_teaching').eq('candidate_id', identityResult.data.candidate_id).eq('is_teaching', true).order('starts_on'),
      admin.from('sigec_experience_evidence_reviews').select('id,experience_id,document_id,version,decision,starts_on,ends_on,public_reason,created_at').eq('application_id', parsedId.data).order('version', { ascending: false }).limit(500),
      admin.rpc('sigec_get_experience_score', { p_actor_id: user.id, p_application_id: parsedId.data }),
      admin.from('sigec_academic_production_reviews').select('id,document_id,version,decision,category,quantity,workload_hours,relevance_confirmed,used_as_mandatory_requirement,points_snapshot,public_reason,internal_rationale,created_at').eq('application_id', parsedId.data).order('created_at', { ascending: false }).limit(500),
      admin.rpc('sigec_get_academic_production_score', { p_actor_id: user.id, p_application_id: parsedId.data }),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: null }, { data: null }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const reasonsResult = catalogsResult.data
    ? await admin.from('sigec_disqualification_reason_items').select('id,label,position').eq('catalog_version_id', catalogsResult.data.id).eq('active', true).order('position')
    : { data: [] }

  const readiness = ((readinessResult.data || [])[0] || { ready: false, document_blockers: 0, diligence_blockers: 0 }) as SigecAdvancementReadiness
  const nextStages = (transitionsResult.data || []).flatMap((item: any) => {
    const stage = Array.isArray(item.sigec_process_stages) ? item.sigec_process_stages[0] : item.sigec_process_stages
    return stage ? [{ id: stage.id, label: stage.label }] : []
  }) as SigecStageOption[]
  const postgraduateScore = ((postgraduateScoreResult.data || [])[0] || { points: 0, selected_level: null, selected_education_id: null, selected_document_id: null, eligible_title_count: 0 }) as SigecPostgraduateScore
  const experienceScore = ((experienceScoreResult.data || [])[0] || { total_unique_days: 0, total_months: 0, remaining_days: 0, points: 0, eligible_experience_count: 0 }) as SigecExperienceScore
  const academicScore = ((academicScoreResult.data || [])[0] || { points: 0, breakdown: {}, eligible_evidence_count: 0 }) as SigecAcademicProductionScore

  return <>
    <div className="app-header"><div><h1>Análise da candidatura</h1><p className="app-subtitle">Documentos, respostas e solicitações da candidatura</p></div></div>
    <div className="app-content animate-fade-up space-y-5">
      <Link href="/sigec-candidaturas" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}><ArrowLeft className="h-4 w-4" /> Voltar para candidaturas</Link>
      {error || !detail ? <div className="rounded-xl p-5 text-sm" style={{ background: 'hsl(var(--accent-red) / .08)', border: '1px solid hsl(var(--accent-red) / .35)', color: 'hsl(var(--fg1))' }}>Não foi possível carregar esta candidatura. Tente novamente.</div> : <SigecApplicationReviewDetail detail={detail} reviews={(reviewsResult.data || []) as SigecDocumentReview[]} requests={(requestsResult.data || []) as SigecInformationRequest[]} diligenceQuestions={(questionsResult.data || []) as SigecDiligenceOption[]} diligenceDocuments={(requirementsResult.data || []) as SigecDiligenceOption[]} advancementReadiness={readiness} nextStages={nextStages} disqualificationReasons={(reasonsResult.data || []) as SigecDisqualificationReason[]} disqualificationDecision={(decisionResult.data || null) as SigecDisqualificationDecision | null} postgraduateEducation={(educationResult.data || []) as SigecPostgraduateEducation[]} postgraduateReviews={(postgraduateReviewsResult.data || []) as SigecPostgraduateReview[]} postgraduateScore={postgraduateScore} teachingExperience={(experienceResult.data || []) as SigecTeachingExperience[]} experienceReviews={(experienceReviewsResult.data || []) as SigecExperienceReview[]} experienceScore={experienceScore} academicReviews={(academicReviewsResult.data || []) as SigecAcademicProductionReview[]} academicScore={academicScore} />}
    </div>
  </>
}
