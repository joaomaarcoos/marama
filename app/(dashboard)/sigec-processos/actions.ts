'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { ProcessInputSchema } from '@/lib/sigec'

export type SigecProcessActionState = {
  error?: string
  success?: string
  processId?: string
}

const ProcessIdSchema = z.string().uuid('Processo inválido.')
const OptionalIdSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined,
  z.string().uuid().optional()
)

const ModalityInputSchema = z.object({
  processId: z.string().uuid(),
  modalityId: OptionalIdSchema,
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).optional(),
})

const VacancyInputSchema = z.object({
  processId: z.string().uuid(),
  vacancyId: OptionalIdSchema,
  modalityId: z.string().uuid(),
  courseName: z.string().trim().min(3).max(200),
  municipality: z.string().trim().min(2).max(160),
  acceptedEducation: z.string().trim().min(3).max(4000),
  proofInstructions: z.string().trim().min(3).max(4000),
  vacancyKind: z.enum(['cadastro_reserva', 'quantidade']),
  vacancyCount: z.preprocess(
    (value) => value === '' || value === null ? undefined : value,
    z.coerce.number().int().positive().optional()
  ),
  active: z.preprocess((value) => value === 'true' || value === true, z.boolean()),
}).superRefine((input, context) => {
  if (input.vacancyKind === 'quantidade' && !input.vacancyCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['vacancyCount'], message: 'Informe a quantidade de vagas.' })
  }
  if (input.vacancyKind === 'cadastro_reserva' && input.vacancyCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['vacancyCount'], message: 'Cadastro de reserva não possui quantidade.' })
  }
})

async function requireSigecManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const role = extractRole(user)
  return role === 'admin' || role === 'gerente' ? user : null
}

function optionalDateTime(value: FormDataEntryValue | null) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined

  // Os cronogramas do SIGEC usam o horário oficial de São Paulo.
  // datetime-local não transporta fuso, portanto o offset é explícito.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? `${text}:00-03:00`
    : text
}

function parseProcessForm(formData: FormData) {
  return ProcessInputSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    summary: formData.get('summary') || undefined,
    description: formData.get('description') || undefined,
    editalVersion: formData.get('editalVersion'),
    applicationsOpenAt: optionalDateTime(formData.get('applicationsOpenAt')),
    applicationsCloseAt: optionalDateTime(formData.get('applicationsCloseAt')),
    maxPreferences: formData.get('maxPreferences'),
  })
}

function firstValidationError(error: z.ZodError) {
  return error.errors[0]?.message || 'Revise os dados informados.'
}

export async function createSigecProcess(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem criar processos.' }

  const parsed = parseProcessForm(formData)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const { data, error } = await adminClient
    .from('sigec_processes')
    .insert({
      title: input.title,
      slug: input.slug,
      summary: input.summary || null,
      description: input.description || null,
      edital_version: input.editalVersion,
      applications_open_at: input.applicationsOpenAt?.toISOString() || null,
      applications_close_at: input.applicationsCloseAt?.toISOString() || null,
      max_preferences: input.maxPreferences,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sigec] Falha ao criar processo:', error.code, error.message)
    if (error.code === '23505') return { error: 'Já existe um processo com esse identificador.' }
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return { error: 'O banco do SIGEC ainda não foi ativado neste ambiente.' }
    }
    return { error: 'Não foi possível criar o processo. Tente novamente.' }
  }

  revalidatePath('/sigec-processos')
  return { success: 'Rascunho criado com sucesso.', processId: data.id }
}

export async function updateSigecProcess(
  processId: string,
  formData: FormData
): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem editar processos.' }

  const id = ProcessIdSchema.safeParse(processId)
  if (!id.success) return { error: id.error.errors[0].message }

  const parsed = parseProcessForm(formData)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const { data, error } = await adminClient
    .from('sigec_processes')
    .update({
      title: input.title,
      slug: input.slug,
      summary: input.summary || null,
      description: input.description || null,
      edital_version: input.editalVersion,
      applications_open_at: input.applicationsOpenAt?.toISOString() || null,
      applications_close_at: input.applicationsCloseAt?.toISOString() || null,
      max_preferences: input.maxPreferences,
    })
    .eq('id', id.data)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[sigec] Falha ao atualizar processo:', error.code, error.message)
    if (error.code === '23505') return { error: 'Já existe um processo com esse identificador.' }
    return { error: 'Não foi possível atualizar o processo.' }
  }
  if (!data) return { error: 'Somente processos em rascunho podem ser editados.' }

  revalidatePath('/sigec-processos')
  revalidatePath(`/sigec-processos/${id.data}`)
  return { success: 'Rascunho atualizado com sucesso.', processId: id.data }
}

export async function archiveSigecProcess(processId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem arquivar processos.' }

  const id = ProcessIdSchema.safeParse(processId)
  if (!id.success) return { error: id.error.errors[0].message }

  const { count, error: countError } = await adminClient
    .from('sigec_applications')
    .select('*', { count: 'exact', head: true })
    .eq('process_id', id.data)

  if (countError) return { error: 'Não foi possível verificar as candidaturas do processo.' }
  if ((count ?? 0) > 0) return { error: 'Processos com candidaturas não podem ser arquivados por esta ação.' }

  const { data, error } = await adminClient
    .from('sigec_processes')
    .update({ status: 'archived' })
    .eq('id', id.data)
    .in('status', ['draft', 'closed'])
    .select('id')
    .maybeSingle()

  if (error) return { error: 'Não foi possível arquivar o processo.' }
  if (!data) return { error: 'Este processo não está em uma situação que permita arquivamento.' }

  revalidatePath('/sigec-processos')
  revalidatePath(`/sigec-processos/${id.data}`)
  return { success: 'Processo arquivado.', processId: id.data }
}

export async function publishSigecProcess(processId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem publicar processos.' }

  const id = ProcessIdSchema.safeParse(processId)
  if (!id.success) return { error: id.error.errors[0].message }

  const { data, error } = await adminClient.rpc('sigec_publish_process', {
    p_process_id: id.data,
    p_actor_id: user.id,
  })

  if (error) {
    console.error('[sigec] Falha ao publicar processo:', error.code, error.message)
    if (error.message.includes('SIGEC_PROCESS_NOT_READY')) {
      return { error: 'O processo ainda possui pendências de configuração.' }
    }
    if (error.message.includes('SIGEC_PROCESS_NOT_DRAFT')) {
      return { error: 'Somente processos em rascunho podem ser publicados.' }
    }
    return { error: 'Não foi possível publicar o processo.' }
  }
  if (!Array.isArray(data) || data.length !== 1) {
    return { error: 'A publicação não retornou uma confirmação válida.' }
  }

  revalidatePath('/sigec-processos')
  revalidatePath(`/sigec-processos/${id.data}`)
  revalidatePath('/processos')
  return { success: 'Processo publicado com sucesso.', processId: id.data }
}

export async function closeSigecProcess(processId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem encerrar processos.' }

  const id = ProcessIdSchema.safeParse(processId)
  if (!id.success) return { error: id.error.errors[0].message }

  const { data, error } = await adminClient.rpc('sigec_close_process', {
    p_process_id: id.data,
    p_actor_id: user.id,
  })

  if (error) {
    console.error('[sigec] Falha ao encerrar processo:', error.code, error.message)
    if (error.message.includes('SIGEC_PROCESS_NOT_OPEN')) {
      return { error: 'Somente processos abertos podem ser encerrados.' }
    }
    return { error: 'Não foi possível encerrar o processo.' }
  }
  if (!Array.isArray(data) || data.length !== 1) {
    return { error: 'O encerramento não retornou uma confirmação válida.' }
  }

  revalidatePath('/sigec-processos')
  revalidatePath(`/sigec-processos/${id.data}`)
  revalidatePath('/processos')
  return { success: 'Processo encerrado com sucesso.', processId: id.data }
}

export async function upsertSigecModality(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem configurar modalidades.' }

  const parsed = ModalityInputSchema.safeParse({
    processId: formData.get('processId'),
    modalityId: formData.get('modalityId'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description') || undefined,
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const { error } = await adminClient.rpc('sigec_upsert_process_modality', {
    p_process_id: input.processId,
    p_actor_id: user.id,
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description || null,
    p_modality_id: input.modalityId || null,
  })
  if (error) {
    console.error('[sigec] Falha ao salvar modalidade:', error.code, error.message)
    if (error.code === '23505') return { error: 'Já existe uma modalidade com esse identificador.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração foi bloqueada porque o processo não está em rascunho.' }
    return { error: 'Não foi possível salvar a modalidade.' }
  }

  revalidatePath(`/sigec-processos/${input.processId}`)
  return { success: input.modalityId ? 'Modalidade atualizada.' : 'Modalidade adicionada.', processId: input.processId }
}

export async function deleteSigecModality(processId: string, modalityId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem remover modalidades.' }
  const ids = z.object({ processId: z.string().uuid(), modalityId: z.string().uuid() }).safeParse({ processId, modalityId })
  if (!ids.success) return { error: 'Modalidade inválida.' }

  const { error } = await adminClient.rpc('sigec_delete_process_modality', {
    p_process_id: ids.data.processId,
    p_actor_id: user.id,
    p_modality_id: ids.data.modalityId,
  })
  if (error) {
    console.error('[sigec] Falha ao remover modalidade:', error.code, error.message)
    if (error.message.includes('SIGEC_MODALITY_HAS_VACANCIES')) return { error: 'Remova ou altere as vagas vinculadas antes de excluir a modalidade.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração deste processo está bloqueada.' }
    return { error: 'Não foi possível remover a modalidade.' }
  }

  revalidatePath(`/sigec-processos/${ids.data.processId}`)
  return { success: 'Modalidade removida.', processId: ids.data.processId }
}

export async function upsertSigecVacancy(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem configurar vagas.' }

  const parsed = VacancyInputSchema.safeParse({
    processId: formData.get('processId'),
    vacancyId: formData.get('vacancyId'),
    modalityId: formData.get('modalityId'),
    courseName: formData.get('courseName'),
    municipality: formData.get('municipality'),
    acceptedEducation: formData.get('acceptedEducation'),
    proofInstructions: formData.get('proofInstructions'),
    vacancyKind: formData.get('vacancyKind'),
    vacancyCount: formData.get('vacancyCount'),
    active: formData.getAll('active').includes('true'),
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const { error } = await adminClient.rpc('sigec_upsert_vacancy_configuration', {
    p_process_id: input.processId,
    p_actor_id: user.id,
    p_modality_id: input.modalityId,
    p_course_name: input.courseName,
    p_municipality: input.municipality,
    p_accepted_education: input.acceptedEducation,
    p_proof_instructions: input.proofInstructions,
    p_vacancy_kind: input.vacancyKind,
    p_vacancy_count: input.vacancyKind === 'quantidade' ? input.vacancyCount : null,
    p_active: input.active,
    p_vacancy_id: input.vacancyId || null,
  })
  if (error) {
    console.error('[sigec] Falha ao salvar vaga:', error.code, error.message)
    if (error.code === '23505') return { error: 'Esta combinação de modalidade, curso e município já existe.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração foi bloqueada porque o processo não está em rascunho.' }
    return { error: 'Não foi possível salvar a vaga e seus requisitos.' }
  }

  revalidatePath(`/sigec-processos/${input.processId}`)
  return { success: input.vacancyId ? 'Vaga atualizada.' : 'Vaga adicionada.', processId: input.processId }
}
