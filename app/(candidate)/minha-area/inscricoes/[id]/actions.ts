'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { getConsentEvidenceDigests } from '@/lib/sigec-abuse-server'

const payloadSchema = z.object({
  applicationId: z.string().uuid(),
  vacancyIds: z.array(z.string().uuid()).min(1).max(5).refine((ids) => new Set(ids).size === ids.length),
})

export async function saveApplicationPreferences(formData: FormData) {
  const parsed = payloadSchema.safeParse({
    applicationId: formData.get('applicationId'),
    vacancyIds: formData.getAll('vacancyId'),
  })
  if (!parsed.success) return { status: 'error' as const, message: 'Escolha as vagas sem repetir opções.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return { status: 'error' as const, message: 'Sua sessão expirou.' }

  const { error } = await supabase.rpc('sigec_replace_application_preferences', {
    p_application_id: parsed.data.applicationId,
    p_vacancy_ids: parsed.data.vacancyIds,
  })
  if (error) {
    console.error('[SIGEC preferences] update rejected', { code: error.code })
    return { status: 'error' as const, message: 'Não foi possível salvar. Confira o limite e o prazo do processo.' }
  }
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`)
  revalidatePath('/minha-area')
  return { status: 'success' as const, message: 'Suas opções foram salvas.' }
}

const answersSchema = z.record(z.string().uuid(), z.unknown()).refine((answers) => Object.keys(answers).length <= 200)

export async function saveApplicationAnswers(applicationId: string, answers: Record<string, unknown>) {
  const parsed = z.object({ applicationId: z.string().uuid(), answers: answersSchema }).safeParse({ applicationId, answers })
  if (!parsed.success) return { type: 'error' as const, message: 'Revise as respostas informadas.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return { type: 'error' as const, message: 'Sua sessão expirou.' }

  const { error } = await supabase.rpc('sigec_replace_application_answers', {
    p_application_id: parsed.data.applicationId,
    p_answers: parsed.data.answers,
  })
  if (error) {
    console.error('[SIGEC answers] update rejected', { code: error.code })
    return { type: 'error' as const, message: 'Não foi possível salvar. Responda aos campos obrigatórios que estão visíveis.' }
  }
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`)
  revalidatePath('/minha-area/documentos')
  return { type: 'success' as const, message: 'Respostas salvas. Seus documentos solicitados também foram atualizados.' }
}

const submitSchema = z.object({
  applicationId: z.string().uuid(), edital: z.literal('on'), truthfulness: z.literal('on'),
  requirements: z.literal('on'), lgpd: z.literal('on'),
})

export async function submitApplication(formData: FormData) {
  const parsed = submitSchema.safeParse({ applicationId: formData.get('applicationId'), edital: formData.get('edital'), truthfulness: formData.get('truthfulness'), requirements: formData.get('requirements'), lgpd: formData.get('lgpd') })
  if (!parsed.success) return { type: 'error' as const, message: 'Confirme todos os quatro itens antes de enviar.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return { type: 'error' as const, message: 'Sua sessão expirou.' }
  let evidence
  try { evidence = await getConsentEvidenceDigests() } catch { return { type: 'error' as const, message: 'A confirmação está temporariamente indisponível.' } }
  const { data, error } = await supabase.rpc('sigec_submit_application', { p_application_id: parsed.data.applicationId, p_ip_hash: evidence.ipHash, p_user_agent_hash: evidence.userAgentHash }).single()
  if (error || !data) {
    console.error('[SIGEC submit] transaction rejected', { code: error?.code })
    return { type: 'error' as const, message: 'Não foi possível enviar. Atualize a página e confira os itens obrigatórios.' }
  }
  revalidatePath(`/minha-area/inscricoes/${parsed.data.applicationId}`); revalidatePath('/minha-area')
  return { type: 'success' as const, message: 'Inscrição enviada com sucesso.', protocol: String((data as any).protocol) }
}
