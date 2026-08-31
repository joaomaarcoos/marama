'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'

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
