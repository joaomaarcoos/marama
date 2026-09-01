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
