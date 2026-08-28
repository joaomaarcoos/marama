import { z } from 'zod'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false

  const digit = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index)
    }
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  }

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

export const sigecPasswordSchema = z.string()
  .min(12, 'A senha deve ter pelo menos 12 caracteres.')
  .max(128, 'A senha deve ter no maximo 128 caracteres.')
  .regex(/[a-z]/, 'Inclua pelo menos uma letra minuscula.')
  .regex(/[A-Z]/, 'Inclua pelo menos uma letra maiuscula.')
  .regex(/[0-9]/, 'Inclua pelo menos um numero.')
  .regex(/[^A-Za-z0-9]/, 'Inclua pelo menos um caractere especial.')
  .refine((value) => !/\s/.test(value), 'A senha nao pode conter espacos.')

export const candidateRegistrationSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe seu nome completo.').max(200),
  cpf: z.string().transform(onlyDigits).refine(isValidCpf, 'Informe um CPF valido.'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe sua data de nascimento.')
    .refine((value) => {
      const date = new Date(`${value}T12:00:00Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
        && value <= new Date().toISOString().slice(0, 10)
    }, 'Informe uma data de nascimento valida.'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido.').max(320),
  whatsapp: z.string().transform(onlyDigits)
    .refine((value) => /^[1-9][0-9]{9,14}$/.test(value), 'Informe o WhatsApp com DDD.'),
  city: z.string().trim().min(2, 'Informe sua cidade.').max(160),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Selecione o estado.'),
  password: sigecPasswordSchema,
  confirmPassword: z.string(),
  website: z.string().max(0).optional().default(''),
}).superRefine((data, context) => {
  if (data.password !== data.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'As senhas nao coincidem.',
    })
  }
})

export type CandidateRegistrationInput = z.infer<typeof candidateRegistrationSchema>

export function candidateRegistrationEnabled() {
  return process.env.SIGEC_CANDIDATE_REGISTRATION_ENABLED === 'true'
    && registrationSecurityConfigured()
    && (process.env.SIGEC_WHATSAPP_OTP_SECRET?.length ?? 0) >= 32
    && Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE_NAME)
}

export function registrationSecurityConfigured() {
  return Boolean(
    captchaSecurityConfigured()
      && (process.env.SIGEC_RATE_LIMIT_SECRET?.length ?? 0) >= 32,
  )
}

export function captchaSecurityConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      && process.env.SIGEC_SUPABASE_CAPTCHA_ENABLED === 'true',
  )
}

export function getTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
}
