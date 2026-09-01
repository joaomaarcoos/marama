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
