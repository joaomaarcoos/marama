'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { CandidateProfileSchema } from '@/lib/sigec'

export type CandidateProfileActionResult = {
  status: 'error' | 'success'
  message: string
  profileCompleted?: boolean
  requiresWhatsappVerification?: boolean
}
export async function updateCandidateProfile(formData: FormData): Promise<CandidateProfileActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || extractRole(user) !== 'candidato') {
    return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' }
  }

  const parsed = CandidateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
    cpf: formData.get('cpf'),
    birthDate: formData.get('birthDate'),
    whatsapp: formData.get('whatsapp'),
    postalCode: formData.get('postalCode'),
    street: formData.get('street'),
    addressNumber: formData.get('addressNumber'),
    addressExtra: formData.get('addressExtra') || undefined,
    district: formData.get('district'),
    city: formData.get('city'),
    state: formData.get('state'),
    availability: formData.get('availability'),
    professionalSummary: formData.get('professionalSummary') || undefined,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message || 'Revise os dados informados.',
    }
  }

  const { data: currentProfile, error: readError } = await supabase
    .from('sigec_candidate_profiles')
    .select('whatsapp')
    .eq('user_id', user.id)
    .maybeSingle()

  if (readError || !currentProfile) {
    return { status: 'error', message: 'Não foi possível localizar seu perfil.' }
  }

  const whatsappChanged = currentProfile.whatsapp !== parsed.data.whatsapp
  const { data: updatedProfile, error } = await supabase
    .from('sigec_candidate_profiles')
    .update({
      full_name: parsed.data.fullName,
      birth_date: parsed.data.birthDate.toISOString().slice(0, 10),
      whatsapp: parsed.data.whatsapp,
      postal_code: parsed.data.postalCode,
      street: parsed.data.street,
      address_number: parsed.data.addressNumber,
      address_extra: parsed.data.addressExtra || null,
      district: parsed.data.district,
      city: parsed.data.city,
      state: parsed.data.state,
      availability: parsed.data.availability,
      professional_summary: parsed.data.professionalSummary || null,
    })
    .eq('user_id', user.id)
    .select('profile_completed_at, whatsapp_verified_at')
    .single()

  if (error) {
    console.error('[SIGEC candidate profile] update rejected', { code: error.code })
    if (error.code === '23505') {
      return { status: 'error', message: 'Este WhatsApp já está vinculado a outro cadastro.' }
    }
    if (error.code === '23514' || error.code === '22001') {
      return { status: 'error', message: 'Um dos campos não atende ao formato permitido.' }
    }
    return { status: 'error', message: 'Não foi possível salvar seu perfil agora.' }
  }

  revalidatePath('/minha-area')
  revalidatePath('/minha-area/perfil')

  return {
    status: 'success',
    message: whatsappChanged
      ? 'Perfil salvo. Confirme o novo número de WhatsApp para continuar.'
      : 'Perfil salvo com sucesso.',
    profileCompleted: Boolean(updatedProfile.profile_completed_at),
    requiresWhatsappVerification: whatsappChanged || !updatedProfile.whatsapp_verified_at,
  }
}
