'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { consumeRecoveryLimits } from '@/lib/sigec-abuse-server'
import { registrationSecurityConfigured } from '@/lib/sigec-registration'

const emailSchema = z.string().trim().toLowerCase().email().max(320)
const GENERIC_RESPONSE = 'Se o e-mail estiver cadastrado, enviaremos as instrucoes para redefinir a senha.'

export async function requestPasswordReset(formData: FormData) {
  if (!registrationSecurityConfigured()) {
    return { status: 'unavailable' as const, message: 'Servico temporariamente indisponivel.' }
  }
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { status: 'error' as const, message: 'Informe um e-mail valido.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!appUrl) return { status: 'unavailable' as const, message: 'Servico temporariamente indisponivel.' }

  const rateLimit = await consumeRecoveryLimits(parsed.data)
  if (rateLimit.unavailable) return { status: 'unavailable' as const, message: 'Servico temporariamente indisponivel.' }
  if (!rateLimit.allowed) return { status: 'success' as const, message: GENERIC_RESPONSE }

  const captchaToken = String(formData.get('captchaToken') ?? '')
  if (!captchaToken || captchaToken.length > 2048) {
    return { status: 'error' as const, message: 'Confirme a verificacao de seguranca e tente novamente.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    captchaToken,
    redirectTo: `${appUrl}/auth/confirm?next=/redefinir-senha`,
  })

  if (error) {
    console.error('[SIGEC password recovery] request rejected', {
      status: error.status,
      code: error.code,
    })
  }

  return { status: 'success' as const, message: GENERIC_RESPONSE }
}
