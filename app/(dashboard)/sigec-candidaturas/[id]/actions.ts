'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'

const ReviewSchema = z.object({
  applicationId: z.string().uuid(),
  documentId: z.string().uuid(),
  decision: z.enum(['valid', 'rejected']),
  publicReason: z.string().trim().max(2000).optional().default(''),
  internalNote: z.string().trim().max(5000).optional().default(''),
}).superRefine((input, context) => {
  if (input.decision === 'rejected' && input.publicReason.length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'Explique ao candidato por que o documento não foi aceito.' })
  }
  if (input.decision === 'valid' && input.publicReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'A aprovação não deve incluir motivo de rejeição.' })
  }
})

const DiligenceFieldSchema = z.object({
  kind: z.enum(['question', 'document']),
  id: z.string().uuid(),
}).strict()

const CreateDiligenceSchema = z.object({
  applicationId: z.string().uuid(),
  message: z.string().trim().min(3, 'Explique ao candidato o que precisa ser enviado.').max(5000),
  dueAt: z.string().min(1, 'Informe o prazo.'),
  requestedFields: z.array(DiligenceFieldSchema).min(1, 'Selecione pelo menos uma informação ou documento.').max(50),
}).superRefine((input, context) => {
  const dueAt = new Date(input.dueAt)
  if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date() || dueAt > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueAt'], message: 'Informe um prazo futuro válido.' })
  }
  const unique = new Set(input.requestedFields.map((field) => `${field.kind}:${field.id}`))
  if (unique.size !== input.requestedFields.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedFields'], message: 'Há itens repetidos na solicitação.' })
})

const CloseDiligenceSchema = z.object({
  applicationId: z.string().uuid(),
  requestId: z.string().uuid(),
  action: z.enum(['accepted', 'canceled']),
  resolutionMessage: z.string().trim().min(3, 'Informe uma mensagem de encerramento.').max(2000),
})

const AdvanceStageSchema = z.object({
  applicationId: z.string().uuid(),
  toStageId: z.string().uuid('Selecione a próxima etapa.'),
  publicReason: z.string().trim().min(3, 'Informe ao candidato o motivo da mudança.').max(2000),
})

const DisqualifySchema = z.object({
  applicationId: z.string().uuid(),
  reasonId: z.string().uuid('Selecione o motivo oficial.'),
  publicMessage: z.string().trim().min(3, 'Explique a decisão ao candidato.').max(2000),
  internalNote: z.string().trim().max(5000).optional().default(''),
  confirmation: z.literal('DESCLASSIFICAR', { errorMap: () => ({ message: 'Digite DESCLASSIFICAR para confirmar.' }) }),
}).strict()

const PostgraduateReviewSchema = z.object({
  applicationId: z.string().uuid(),
  educationId: z.string().uuid(),
  documentId: z.string().uuid(),
  decision: z.enum(['eligible', 'rejected']),
  publicReason: z.string().trim().max(2000).optional().default(''),
}).strict().superRefine((input, context) => {
  if (input.decision === 'rejected' && input.publicReason.length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'Explique por que o comprovante não valida esse título.' })
  }
  if (input.decision === 'eligible' && input.publicReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'A aprovação não deve incluir motivo de rejeição.' })
  }
})

const ExperienceReviewSchema = z.object({
  applicationId: z.string().uuid(),
  experienceId: z.string().uuid(),
  documentId: z.string().uuid(),
  decision: z.enum(['eligible', 'rejected']),
  publicReason: z.string().trim().max(2000).optional().default(''),
}).strict().superRefine((input, context) => {
  if (input.decision === 'rejected' && input.publicReason.length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'Explique por que o comprovante não valida esse período.' })
  }
  if (input.decision === 'eligible' && input.publicReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'A aprovação não deve incluir motivo de rejeição.' })
  }
})

const AcademicProductionReviewSchema = z.object({
  applicationId: z.string().uuid(), documentId: z.string().uuid(),
  decision: z.enum(['eligible', 'rejected']),
  category: z.enum(['scientific_article', 'book_or_chapter', 'technical_material', 'event_presentation', 'continuing_education']),
  quantity: z.coerce.number().int().min(1).max(1000),
  workloadHours: z.coerce.number().int().min(0).max(10000).optional().default(0),
  relevanceConfirmed: z.boolean(), usedAsMandatoryRequirement: z.boolean(),
  publicReason: z.string().trim().max(2000).optional().default(''),
  internalRationale: z.string().trim().min(3, 'Registre uma justificativa interna para a decisão.').max(2000),
}).strict().superRefine((input, context) => {
  if (input.category === 'continuing_education' && input.workloadHours < 20) context.addIssue({ code: z.ZodIssueCode.custom, path: ['workloadHours'], message: 'A formação precisa ter ao menos 20 horas para pontuar.' })
  if (input.decision === 'eligible' && (!input.relevanceConfirmed || input.usedAsMandatoryRequirement)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Para aprovar, confirme a relação com a vaga e que o comprovante não foi usado como requisito obrigatório.' })
  if (input.decision === 'eligible' && input.publicReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'A aprovação não deve incluir motivo de rejeição.' })
  if (input.decision === 'rejected' && input.publicReason.length < 3) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicReason'], message: 'Explique ao candidato por que o comprovante não foi aceito.' })
})

const RecalculateScoreSchema = z.object({ applicationId: z.string().uuid() }).strict()

async function staffActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user && ['admin', 'gerente'].includes(extractRole(user)) ? user : null
}

export async function reviewSigecDocument(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = ReviewSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados informados.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !['admin', 'gerente'].includes(extractRole(user))) return { error: 'Acesso negado.' }

  const { error } = await getAdminClient().rpc('sigec_review_application_document', {
    p_actor_id: user.id,
    p_document_id: parsed.data.documentId,
    p_decision: parsed.data.decision,
    p_public_reason: parsed.data.publicReason || null,
    p_internal_note: parsed.data.internalNote || null,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_DOCUMENT_REVIEW_CURRENT_VERSION_REQUIRED: 'Somente a versão atual pode ser analisada.',
      SIGEC_DOCUMENT_REVIEW_CLEAN_FILE_REQUIRED: 'O arquivo ainda não está liberado pela verificação de segurança.',
      SIGEC_DOCUMENT_REVIEW_SUBMITTED_APPLICATION_REQUIRED: 'A candidatura precisa estar enviada para análise.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível registrar a análise.' }
  }

  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  revalidatePath('/sigec-candidaturas')
  return { success: parsed.data.decision === 'valid' ? 'Documento aprovado.' : 'Documento não aceito. O motivo ficará visível para o candidato.' }
}

export async function createSigecInformationRequest(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = CreateDiligenceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da solicitação.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }

  const { error } = await getAdminClient().rpc('sigec_create_information_request', {
    p_actor_id: user.id,
    p_application_id: parsed.data.applicationId,
    p_message: parsed.data.message,
    p_requested_fields: parsed.data.requestedFields,
    p_due_at: new Date(parsed.data.dueAt).toISOString(),
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_DILIGENCE_MANAGEMENT_ACTIVE_EXISTS: 'Já existe uma solicitação aguardando resposta ou conferência.',
      SIGEC_DILIGENCE_MANAGEMENT_SUBMISSION_REQUIRED: 'A candidatura precisa estar enviada antes de solicitar informações.',
      SIGEC_DILIGENCE_QUESTION_INVALID: 'Uma das perguntas não pertence a este processo.',
      SIGEC_DILIGENCE_DOCUMENT_INVALID: 'Um dos documentos não pertence a este processo.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível enviar a solicitação.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`)
  revalidatePath('/minha-area/documentos')
  return { success: 'Solicitação enviada. Ela já está disponível na área do candidato.' }
}

export async function closeSigecInformationRequest(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = CloseDiligenceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados do encerramento.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }

  const { error } = await getAdminClient().rpc('sigec_close_information_request', {
    p_actor_id: user.id,
    p_request_id: parsed.data.requestId,
    p_action: parsed.data.action,
    p_resolution_message: parsed.data.resolutionMessage,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_DILIGENCE_MANAGEMENT_ANSWER_REQUIRED: 'A solicitação ainda não foi respondida pelo candidato.',
      SIGEC_DILIGENCE_MANAGEMENT_ALREADY_CLOSED: 'Esta solicitação já foi encerrada.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível encerrar a solicitação.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  return { success: parsed.data.action === 'accepted' ? 'Resposta conferida e aceita.' : 'Solicitação cancelada.' }
}

export async function advanceSigecApplicationStage(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = AdvanceStageSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da mudança.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }

  const { error } = await getAdminClient().rpc('sigec_advance_application_stage', {
    p_actor_id: user.id,
    p_application_id: parsed.data.applicationId,
    p_to_stage_id: parsed.data.toStageId,
    p_public_reason: parsed.data.publicReason,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_APPLICATION_ADVANCEMENT_BLOCKED: 'Resolva os documentos pendentes e encerre a solicitação de informações antes de avançar.',
      SIGEC_ADVANCEMENT_TRANSITION_NOT_ALLOWED: 'Essa mudança de etapa não está configurada para o processo.',
      SIGEC_ADVANCEMENT_SUBMITTED_REQUIRED: 'Somente candidaturas enviadas podem avançar.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível mudar a etapa.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  revalidatePath('/sigec-candidaturas')
  revalidatePath('/minha-area')
  return { success: 'Etapa atualizada e registrada no histórico.' }
}

export async function disqualifySigecApplication(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = DisqualifySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da decisão.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }
  const { error } = await getAdminClient().rpc('sigec_disqualify_application', {
    p_actor_id: user.id,
    p_application_id: parsed.data.applicationId,
    p_reason_item_id: parsed.data.reasonId,
    p_public_message: parsed.data.publicMessage,
    p_internal_note: parsed.data.internalNote || null,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_DISQUALIFICATION_ALREADY_DECIDED: 'Esta candidatura já foi desclassificada.',
      SIGEC_DISQUALIFICATION_SUBMITTED_REQUIRED: 'Somente uma candidatura enviada pode ser desclassificada.',
      SIGEC_DISQUALIFICATION_CONFIRMED_REASON_REQUIRED: 'O motivo precisa pertencer ao catálogo confirmado deste processo.',
      SIGEC_DISQUALIFICATION_TRANSITION_REQUIRED: 'Configure uma transição ativa da etapa atual para Desclassificado.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível registrar a desclassificação.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  revalidatePath('/sigec-candidaturas')
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`)
  revalidatePath('/minha-area')
  return { success: 'Candidatura desclassificada e motivo disponibilizado ao candidato.' }
}

export async function reviewSigecPostgraduateEvidence(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = PostgraduateReviewSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da titulação.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }

  const { error } = await getAdminClient().rpc('sigec_review_postgraduate_evidence', {
    p_actor_id: user.id,
    p_application_id: parsed.data.applicationId,
    p_education_id: parsed.data.educationId,
    p_document_id: parsed.data.documentId,
    p_decision: parsed.data.decision,
    p_public_reason: parsed.data.publicReason || null,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_POSTGRADUATE_SUBMITTED_APPLICATION_REQUIRED: 'A candidatura precisa estar enviada para análise.',
      SIGEC_POSTGRADUATE_COMPLETED_TITLE_REQUIRED: 'Somente uma formação concluída do próprio candidato pode ser pontuada.',
      SIGEC_POSTGRADUATE_APPROVED_CURRENT_DOCUMENT_REQUIRED: 'Selecione um documento atual que já tenha sido aprovado.',
      SIGEC_POSTGRADUATE_INPUT_INVALID: 'Revise a decisão e o motivo informado.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível registrar a análise da titulação.' }
  }

  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  return { success: parsed.data.decision === 'eligible' ? 'Título aprovado e pontuação recalculada.' : 'Comprovante do título não aceito.' }
}

export async function reviewSigecExperienceEvidence(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = ExperienceReviewSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da experiência.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }
  const { error } = await getAdminClient().rpc('sigec_review_experience_evidence', {
    p_actor_id: user.id,
    p_application_id: parsed.data.applicationId,
    p_experience_id: parsed.data.experienceId,
    p_document_id: parsed.data.documentId,
    p_decision: parsed.data.decision,
    p_public_reason: parsed.data.publicReason || null,
  })
  if (error) {
    const known: Record<string, string> = {
      SIGEC_EXPERIENCE_SUBMITTED_APPLICATION_REQUIRED: 'A candidatura precisa estar enviada para análise.',
      SIGEC_EXPERIENCE_TEACHING_REQUIRED: 'Somente experiência docente do próprio candidato pode ser pontuada.',
      SIGEC_EXPERIENCE_APPROVED_CURRENT_DOCUMENT_REQUIRED: 'Selecione um documento atual que já tenha sido aprovado.',
      SIGEC_EXPERIENCE_INPUT_INVALID: 'Revise a decisão e o motivo informado.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível registrar a análise da experiência.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  return { success: parsed.data.decision === 'eligible' ? 'Período aprovado e pontuação recalculada.' : 'Comprovante do período não aceito.' }
}

export async function reviewSigecAcademicProduction(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = AcademicProductionReviewSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Revise os dados da produção.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }
  const value = parsed.data
  const { error } = await getAdminClient().rpc('sigec_review_academic_production', {
    p_actor_id: user.id, p_application_id: value.applicationId, p_document_id: value.documentId,
    p_decision: value.decision, p_category: value.category, p_quantity: value.quantity,
    p_workload_hours: value.category === 'continuing_education' ? value.workloadHours : null,
    p_relevance_confirmed: value.relevanceConfirmed, p_used_as_mandatory_requirement: value.usedAsMandatoryRequirement,
    p_public_reason: value.publicReason || null, p_internal_rationale: value.internalRationale,
  })
  if (error) {
    const known: Record<string,string> = {
      SIGEC_ACADEMIC_SUBMITTED_APPLICATION_REQUIRED: 'A candidatura precisa estar enviada para análise.',
      SIGEC_ACADEMIC_APPROVED_CURRENT_DOCUMENT_REQUIRED: 'Selecione um documento atual que já tenha sido aprovado.',
      SIGEC_ACADEMIC_INPUT_INVALID: 'Revise categoria, quantidade, pertinência e justificativas.',
      SIGEC_ACADEMIC_NO_SCORE: 'A carga horária informada não gera pontuação.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível registrar a pontuação.' }
  }
  revalidatePath(`/sigec-candidaturas/${value.applicationId}`)
  return { success: value.decision === 'eligible' ? 'Comprovante pontuado dentro dos limites da categoria.' : 'Comprovante não aceito.' }
}

export async function recalculateSigecApplicationScore(input: unknown): Promise<{ error?: string; success?: string }> {
  const parsed = RecalculateScoreSchema.safeParse(input)
  if (!parsed.success) return { error: 'Candidatura inválida.' }
  const user = await staffActor()
  if (!user) return { error: 'Acesso negado.' }
  const { error } = await getAdminClient().rpc('sigec_recalculate_application_score', { p_actor_id: user.id, p_application_id: parsed.data.applicationId })
  if (error) {
    const known: Record<string,string> = {
      SIGEC_SCORE_SUBMITTED_APPLICATION_REQUIRED: 'A candidatura precisa estar enviada para calcular a nota.',
      SIGEC_SCORE_COMPONENT_OUT_OF_RANGE: 'Um componente ultrapassou o limite permitido.',
      SIGEC_SCORE_TOTAL_OUT_OF_RANGE: 'A nota total ultrapassou o limite de 100 pontos.',
    }
    return { error: Object.entries(known).find(([code]) => error.message.includes(code))?.[1] || 'Não foi possível consolidar a nota.' }
  }
  revalidatePath(`/sigec-candidaturas/${parsed.data.applicationId}`)
  revalidatePath('/sigec-candidaturas')
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`)
  revalidatePath('/minha-area')
  return { success: 'Nota consolidada e nova versão registrada.' }
}
