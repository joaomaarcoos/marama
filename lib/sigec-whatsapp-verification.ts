import 'server-only'

import { createHmac } from 'node:crypto'

export function whatsappVerificationConfigured() {
  return Boolean(
    (process.env.SIGEC_WHATSAPP_OTP_SECRET?.length ?? 0) >= 32
      && process.env.EVOLUTION_API_URL
      && process.env.EVOLUTION_API_KEY
      && process.env.EVOLUTION_INSTANCE_NAME,
  )
}

export function hashWhatsappCode(verificationId: string, code: string) {
  const secret = process.env.SIGEC_WHATSAPP_OTP_SECRET
  if (!secret || secret.length < 32) throw new Error('SIGEC_WHATSAPP_OTP_SECRET_NOT_CONFIGURED')
  return createHmac('sha256', secret).update(`${verificationId}:${code}`).digest('hex')
}

export function maskWhatsapp(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return 'número cadastrado'
  return `+${digits.slice(0, 2)} (***) *****-${digits.slice(-4)}`
}
