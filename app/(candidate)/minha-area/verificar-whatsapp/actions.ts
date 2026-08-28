'use server'

import { randomInt, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import { consumeWhatsappLimits, getRequestIpDigest } from '@/lib/sigec-abuse-server'
import { hashWhatsappCode, whatsappVerificationConfigured } from '@/lib/sigec-whatsapp-verification'
import { sendText } from '@/lib/evolution'

type VerificationResult = {
  status: 'error' | 'success' | 'unavailable'
  message: string
  verificationId?: string
}

async function authenticatedCandidate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return null
  return { supabase, user }
}

export async function requestWhatsappCode(): Promise<VerificationResult> {
  if (!whatsappVerificationConfigured()) {
    return { status: 'unavailable', message: 'A verificacao do WhatsApp esta temporariamente indisponivel.' }
  }

  const auth = await authenticatedCandidate()
  if (!auth) return { status: 'error', message: 'Sua sessao expirou. Entre novamente.' }

  const { data: profile, error } = await auth.supabase
    .from('sigec_candidate_profiles')
    .select('whatsapp, whatsapp_verified_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error || !profile?.whatsapp) {
    return { status: 'error', message: 'Cadastre um WhatsApp valido antes de solicitar o codigo.' }
  }
  if (profile.whatsapp_verified_at) {
    return { status: 'success', message: 'Seu WhatsApp ja esta verificado.' }
  }

  const limit = await consumeWhatsappLimits(auth.user.id, profile.whatsapp)
  if (limit.unavailable) return { status: 'unavailable', message: 'A verificacao esta temporariamente indisponivel.' }
  if (!limit.allowed) return { status: 'error', message: 'Muitas solicitacoes. Aguarde antes de pedir outro codigo.' }

  const verificationId = randomUUID()
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHash = hashWhatsappCode(verificationId, code)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const requestIpDigest = await getRequestIpDigest()

  const { data: issueStatus, error: issueError } = await adminClient.rpc('sigec_issue_whatsapp_verification', {
    p_verification_id: verificationId,
    p_user_id: auth.user.id,
    p_whatsapp: profile.whatsapp,
    p_code_hash: codeHash,
    p_expires_at: expiresAt,
    p_request_ip_digest: requestIpDigest,
  })
  if (issueError || issueStatus !== 'issued') {
    if (issueStatus === 'already_verified') return { status: 'success', message: 'Seu WhatsApp ja esta verificado.' }
    console.error('[SIGEC WhatsApp verification] issue rejected', { code: issueError?.code, status: issueStatus })
    return { status: 'unavailable', message: 'Nao foi possivel gerar o codigo agora.' }
  }

  try {
    await sendText(
      profile.whatsapp,
      `SIGEC Processos: seu codigo de verificacao e ${code}. Ele expira em 10 minutos. Nao compartilhe este codigo.`,
    )
    await adminClient.from('sigec_whatsapp_verifications')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', verificationId)
  } catch (sendError) {
    await adminClient.from('sigec_whatsapp_verifications')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('id', verificationId)
    console.error('[SIGEC WhatsApp verification] delivery failed', {
      name: sendError instanceof Error ? sendError.name : 'unknown',
    })
    return { status: 'unavailable', message: 'Nao foi possivel enviar o codigo agora.' }
  }

  return {
    status: 'success',
    message: 'Codigo enviado. Confira seu WhatsApp.',
    verificationId,
  }
}

const codeSchema = z.object({
  verificationId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
})

export async function verifyWhatsappCode(formData: FormData): Promise<VerificationResult> {
  const auth = await authenticatedCandidate()
  if (!auth) return { status: 'error', message: 'Sua sessao expirou. Entre novamente.' }

  const parsed = codeSchema.safeParse({
    verificationId: formData.get('verificationId'),
    code: formData.get('code'),
  })
  if (!parsed.success) return { status: 'error', message: 'Informe o codigo de seis digitos.' }

  let codeHash: string
  try {
    codeHash = hashWhatsappCode(parsed.data.verificationId, parsed.data.code)
  } catch {
    return { status: 'unavailable', message: 'A verificacao esta temporariamente indisponivel.' }
  }

  const { data: verificationStatus, error } = await adminClient.rpc('sigec_verify_whatsapp_code', {
    p_verification_id: parsed.data.verificationId,
    p_user_id: auth.user.id,
    p_code_hash: codeHash,
  })
  if (error) {
    console.error('[SIGEC WhatsApp verification] validation failed', { code: error.code })
    return { status: 'unavailable', message: 'Nao foi possivel validar o codigo agora.' }
  }

  if (verificationStatus === 'verified') {
    return { status: 'success', message: 'WhatsApp verificado com sucesso.' }
  }
  if (verificationStatus === 'invalid') {
    return { status: 'error', message: 'Codigo incorreto.' }
  }
  if (verificationStatus === 'locked') {
    return { status: 'error', message: 'Limite de tentativas atingido. Solicite um novo codigo mais tarde.' }
  }
  if (verificationStatus === 'expired' || verificationStatus === 'invalidated') {
    return { status: 'error', message: 'Esse codigo expirou. Solicite um novo.' }
  }
  return { status: 'error', message: 'Nao foi possivel confirmar este codigo.' }
}
