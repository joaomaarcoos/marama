'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { CandidateExperienceSchema } from '@/lib/sigec'

type Result = { status: 'error' | 'success'; message: string }

async function candidateSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return null
  return { supabase, user }
}

function refresh() {
  revalidatePath('/minha-area')
  revalidatePath('/minha-area/experiencia')
}

export async function saveCandidateExperience(formData: FormData): Promise<Result> {
  const auth = await candidateSession()
  if (!auth) return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' }

  const parsed = CandidateExperienceSchema.safeParse({
    id: formData.get('id'),
    employmentType: formData.get('employmentType'),
    institution: formData.get('institution'),
    roleTitle: formData.get('roleTitle'),
    startsOn: formData.get('startsOn'),
    endsOn: formData.get('endsOn'),
    isTeaching: formData.get('isTeaching') === 'true',
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message || 'Revise a experiência.' }

  const payload = {
    employment_type: parsed.data.employmentType,
    institution: parsed.data.institution,
    role_title: parsed.data.roleTitle,
    starts_on: parsed.data.startsOn.toISOString().slice(0, 10),
    ends_on: parsed.data.endsOn?.toISOString().slice(0, 10) || null,
    is_teaching: parsed.data.isTeaching,
  }
  const query = parsed.data.id
    ? auth.supabase.from('sigec_candidate_experience').update(payload)
        .eq('id', parsed.data.id).eq('candidate_id', auth.user.id).select('id').maybeSingle()
    : auth.supabase.from('sigec_candidate_experience').insert({ ...payload, candidate_id: auth.user.id }).select('id').single()
  const { data, error } = await query
  if (error || !data) {
    console.error('[SIGEC candidate experience] save rejected', { code: error?.code })
    return { status: 'error', message: 'Não foi possível salvar esta experiência.' }
  }
  refresh()
  return { status: 'success', message: parsed.data.id ? 'Experiência atualizada.' : 'Experiência adicionada.' }
}

const DeleteSchema = z.object({ id: z.string().uuid() })

export async function deleteCandidateExperience(formData: FormData): Promise<Result> {
  const auth = await candidateSession()
  if (!auth) return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' }
  const parsed = DeleteSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { status: 'error', message: 'Experiência inválida.' }
  const { data, error } = await auth.supabase.from('sigec_candidate_experience').delete()
    .eq('id', parsed.data.id).eq('candidate_id', auth.user.id).select('id').maybeSingle()
  if (error || !data) return { status: 'error', message: 'Não foi possível remover esta experiência.' }
  refresh()
  return { status: 'success', message: 'Experiência removida.' }
}
