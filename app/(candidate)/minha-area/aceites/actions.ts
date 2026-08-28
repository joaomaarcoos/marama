'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import { getConsentEvidenceDigests } from '@/lib/sigec-abuse-server'

export type ConsentAcceptanceResult = {
  status: 'error' | 'success' | 'unavailable'
  message: string
}

const consentSchema = z.object({
  applicationId: z.string().uuid(),
  edital: z.literal('on'),
  truthfulness: z.literal('on'),
  requirements: z.literal('on'),
  lgpd: z.literal('on'),
})

export async function acceptRequiredConsents(formData: FormData): Promise<ConsentAcceptanceResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') {
    return { status: 'error', message: 'Sua sessao expirou. Entre novamente.' }
  }

  const parsed = consentSchema.safeParse({
    applicationId: formData.get('applicationId'),
    edital: formData.get('edital'),
    truthfulness: formData.get('truthfulness'),
    requirements: formData.get('requirements'),
    lgpd: formData.get('lgpd'),
  })
  if (!parsed.success) {
    return { status: 'error', message: 'Confirme todos os aceites obrigatorios para continuar.' }
  }

  const { data: application, error: applicationError } = await supabase
    .from('sigec_applications')
    .select('id, candidate_id, application_state')
    .eq('id', parsed.data.applicationId)
    .eq('candidate_id', user.id)
    .maybeSingle()
  if (applicationError || !application || application.application_state !== 'draft') {
    return { status: 'error', message: 'Esta candidatura nao esta disponivel para aceite.' }
  }

  let evidence: Awaited<ReturnType<typeof getConsentEvidenceDigests>>
  try {
    evidence = await getConsentEvidenceDigests()
  } catch {
    return { status: 'unavailable', message: 'O registro de aceite esta temporariamente indisponivel.' }
  }

  const { data, error } = await adminClient.rpc('sigec_record_required_consents', {
    p_application_id: application.id,
    p_candidate_id: user.id,
    p_ip_hash: evidence.ipHash,
    p_user_agent_hash: evidence.userAgentHash,
  })
  if (error || !Array.isArray(data) || data.length !== 4) {
    console.error('[SIGEC consent] required bundle rejected', { code: error?.code })
    return { status: 'unavailable', message: 'Nao foi possivel registrar os aceites agora.' }
  }

  return { status: 'success', message: 'Aceites registrados com sucesso.' }
}
