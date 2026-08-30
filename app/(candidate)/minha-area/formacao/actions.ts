'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { CandidateEducationSchema } from '@/lib/sigec'

type EducationActionResult = { status: 'error' | 'success'; message: string }

async function authenticatedCandidate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return null
  return { supabase, user }
}

function refreshEducation() {
  revalidatePath('/minha-area')
  revalidatePath('/minha-area/formacao')
}

export async function saveCandidateEducation(formData: FormData): Promise<EducationActionResult> {
  const auth = await authenticatedCandidate()
  if (!auth) return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' }

  const parsed = CandidateEducationSchema.safeParse({
    id: formData.get('id'),
    level: formData.get('level'),
    courseName: formData.get('courseName'),
    institution: formData.get('institution'),
    startedOn: formData.get('startedOn'),
    completionDate: formData.get('completionDate'),
    isCompleted: formData.get('isCompleted') === 'true',
    workloadHours: formData.get('workloadHours'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message || 'Revise os dados da formação.' }
  }

  const payload = {
    level: parsed.data.level,
    course_name: parsed.data.courseName,
    institution: parsed.data.institution,
    started_on: parsed.data.startedOn?.toISOString().slice(0, 10) || null,
    completion_date: parsed.data.isCompleted
      ? parsed.data.completionDate?.toISOString().slice(0, 10) || null
      : null,
    is_completed: parsed.data.isCompleted,
    workload_hours: parsed.data.workloadHours || null,
  }

  const query = parsed.data.id
    ? auth.supabase
        .from('sigec_candidate_education')
        .update(payload)
        .eq('id', parsed.data.id)
        .eq('candidate_id', auth.user.id)
        .select('id')
        .maybeSingle()
    : auth.supabase
        .from('sigec_candidate_education')
        .insert({ ...payload, candidate_id: auth.user.id })
        .select('id')
        .single()

  const { data, error } = await query
  if (error || !data) {
    console.error('[SIGEC candidate education] save rejected', { code: error?.code })
    return { status: 'error', message: 'Não foi possível salvar esta formação.' }
  }

  refreshEducation()
  return { status: 'success', message: parsed.data.id ? 'Formação atualizada.' : 'Formação adicionada.' }
}

const DeleteEducationSchema = z.object({ id: z.string().uuid() })

export async function deleteCandidateEducation(formData: FormData): Promise<EducationActionResult> {
  const auth = await authenticatedCandidate()
  if (!auth) return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' }

  const parsed = DeleteEducationSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { status: 'error', message: 'Formação inválida.' }

  const { data, error } = await auth.supabase
    .from('sigec_candidate_education')
    .delete()
    .eq('id', parsed.data.id)
    .eq('candidate_id', auth.user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    console.error('[SIGEC candidate education] delete rejected', { code: error?.code })
    return { status: 'error', message: 'Não foi possível remover esta formação.' }
  }

  refreshEducation()
  return { status: 'success', message: 'Formação removida.' }
}
