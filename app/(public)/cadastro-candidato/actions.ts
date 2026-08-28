'use server'

import { createClient } from '@/lib/supabase/server'
import {
  candidateRegistrationEnabled,
  candidateRegistrationSchema,
} from '@/lib/sigec-registration'
import { consumeSignupLimits, issueCandidateSignupNonce } from '@/lib/sigec-abuse-server'

export type CandidateRegistrationResult = {
  status: 'error' | 'success' | 'unavailable'
  message: string
}

const GENERIC_SUCCESS = 'Se o cadastro for aceito, voce recebera as proximas instrucoes no e-mail informado.'

export async function registerCandidate(formData: FormData): Promise<CandidateRegistrationResult> {
  if (!candidateRegistrationEnabled()) {
    return {
      status: 'unavailable',
      message: 'O cadastro ainda nao foi liberado para o publico.',
    }
  }

  const parsed = candidateRegistrationSchema.safeParse({
    fullName: formData.get('fullName'),
    cpf: formData.get('cpf'),
    birthDate: formData.get('birthDate'),
    email: formData.get('email'),
    whatsapp: formData.get('whatsapp'),
    city: formData.get('city'),
    state: formData.get('state'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    website: formData.get('website') ?? '',
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.errors[0].message }
  }

  const rateLimit = await consumeSignupLimits(parsed.data.email, parsed.data.whatsapp)
  if (rateLimit.unavailable) {
    return { status: 'unavailable', message: 'O cadastro esta temporariamente indisponivel.' }
  }
  if (!rateLimit.allowed) {
    return { status: 'error', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' }
  }

  const captchaToken = String(formData.get('captchaToken') ?? '')
  if (!captchaToken || captchaToken.length > 2048) {
    return { status: 'error', message: 'Nao foi possivel confirmar a verificacao de seguranca. Tente novamente.' }
  }

  const signupNonce = await issueCandidateSignupNonce()
  if (!signupNonce) return { status: 'unavailable', message: 'O cadastro esta temporariamente indisponivel.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!appUrl) {
    return { status: 'unavailable', message: 'O cadastro esta temporariamente indisponivel.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      captchaToken,
      emailRedirectTo: `${appUrl}/auth/confirm?next=/minha-area`,
      data: {
        full_name: parsed.data.fullName,
        cpf: parsed.data.cpf,
        birth_date: parsed.data.birthDate,
        whatsapp: parsed.data.whatsapp,
        city: parsed.data.city,
        state: parsed.data.state,
        sigec_candidate_signup: true,
        sigec_signup_nonce: signupNonce,
      },
    },
  })

  if (data.session) await supabase.auth.signOut()

  if (error) {
    console.error('[SIGEC candidate registration] signup rejected', {
      status: error.status,
      code: error.code,
    })
  }

  return { status: 'success', message: GENERIC_SUCCESS }
}
