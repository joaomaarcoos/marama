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

const VacancyImportRowSchema = z.object({
  sourceRow: z.number().int().positive(),
  modalityName: z.string().trim().min(2).max(120),
  modalitySlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  municipality: z.string().trim().min(2).max(160),
  courseName: z.string().trim().min(3).max(200),
  vacancyKind: z.enum(['cadastro_reserva', 'quantidade']),
  vacancyCount: z.number().int().positive().nullable(),
  acceptedEducation: z.string().trim().min(3).max(4000),
  proofInstructions: z.string().trim().min(3).max(4000),
  sourceReference: z.string().trim().min(3).max(500),
})

const VacancyImportSchema = z.object({
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  rows: z.array(VacancyImportRowSchema).min(1).max(1000),
})

const FormConfigurationKindSchema = z.enum(['question', 'document', 'declaration'])
const FormAudienceSchema = z.enum(['all', 'pcd', 'ppp', 'pcd_or_ppp'])
const FormConfigurationInputSchema = z.object({
  processId: z.string().uuid(),
  itemId: OptionalIdSchema,
  kind: FormConfigurationKindSchema,
  code: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, 'Use letras minúsculas, números e sublinhado no código.'),
  label: z.string().trim().min(3).max(200),
  details: z.string().trim().max(20_000).optional().default(''),
  required: z.boolean(),
  position: z.coerce.number().int().min(0).max(10_000),
  audience: FormAudienceSchema,
  questionType: z.enum(['short_text', 'long_text', 'single_choice', 'multiple_choice', 'boolean', 'number', 'date']).optional(),
  options: z.string().trim().max(10_000).optional().default(''),
  acceptedMimeTypes: z.array(z.enum(['application/pdf', 'image/jpeg', 'image/png'])).max(3).optional(),
  maxFileSizeMb: z.coerce.number().int().min(1).max(50).optional(),
  version: z.string().trim().max(50).optional(),
}).superRefine((input, context) => {
  if (input.kind === 'question' && !input.questionType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['questionType'], message: 'Informe o tipo da pergunta.' })
  }
  if (input.kind === 'question' && ['single_choice', 'multiple_choice'].includes(input.questionType || '')) {
    const options = input.options.split(/\r?\n/).map((option) => option.trim()).filter(Boolean)
    if (options.length < 2 || new Set(options).size !== options.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Informe ao menos duas opções diferentes, uma por linha.' })
    }
  }
  if (input.kind === 'document' && (!input.acceptedMimeTypes?.length || !input.maxFileSizeMb)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedMimeTypes'], message: 'Informe formatos aceitos e tamanho máximo.' })
  }
  if (input.kind === 'declaration' && (input.details.length < 10 || !input.version?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: 'Informe o texto e a versão da declaração.' })
  }
})

const StageInputSchema = z.object({
  processId: z.string().uuid(),
  stageId: OptionalIdSchema,
  code: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, 'Use letras minúsculas, números e sublinhado no código.'),
  label: z.string().trim().min(3).max(200),
  publicDescription: z.string().trim().min(3).max(2000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida.'),
  position: z.coerce.number().int().min(0).max(10_000),
  isInitial: z.boolean(),
  isTerminal: z.boolean(),
  allowsAppeal: z.boolean(),
  whatsappTemplate: z.string().trim().min(10).max(2000),
}).superRefine((input, context) => {
  if (input.isInitial && input.isTerminal) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['isTerminal'], message: 'A etapa inicial não pode ser terminal.' })
  }
  const withoutAllowedPlaceholders = input.whatsappTemplate.replace(/\{\{(nome|processo|status|link|prazo)\}\}/g, '')
  if (/\{\{|\}\}/.test(withoutAllowedPlaceholders)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['whatsappTemplate'], message: 'O template contém uma variável não permitida.' })
  }
})

const StageTransitionInputSchema = z.object({
  processId: z.string().uuid(),
  transitionId: OptionalIdSchema,
  fromStageId: z.string().uuid(),
  toStageId: z.string().uuid(),
  requiresReason: z.boolean(),
  blocksOnPending: z.boolean(),
  active: z.boolean(),
}).refine((input) => input.fromStageId !== input.toStageId, {
  message: 'A origem e o destino precisam ser diferentes.', path: ['toStageId'],
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

export async function confirmSigecVacancyImport(processId: string, payload: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem confirmar importações.' }
  const id = ProcessIdSchema.safeParse(processId)
  if (!id.success) return { error: id.error.errors[0].message }
  if (payload.length > 2_000_000) return { error: 'O arquivo de importação excede o limite permitido.' }

  let raw: unknown
  try { raw = JSON.parse(payload) } catch { return { error: 'O arquivo JSON está inválido.' } }
  const parsed = VacancyImportSchema.safeParse(raw)
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const keys = parsed.data.rows.map((row) => [
    row.modalitySlug,
    row.municipality.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
    row.courseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  ].join('|'))
  if (new Set(keys).size !== keys.length) return { error: 'Resolva todas as duplicidades antes de confirmar.' }

  const { data, error } = await adminClient.rpc('sigec_confirm_vacancy_import', {
    p_process_id: id.data,
    p_actor_id: user.id,
    p_source_sha256: parsed.data.sourceSha256,
    p_rows: parsed.data.rows,
  })
  if (error) {
    console.error('[sigec] Falha ao confirmar importação:', error.code, error.message)
    if (error.message.includes('SIGEC_IMPORT_DUPLICATES')) return { error: 'O lote ainda contém duplicidades.' }
    if (error.message.includes('SIGEC_IMPORT_CONFLICTS_EXISTING')) return { error: 'O lote conflita com vagas já cadastradas neste processo.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A importação foi bloqueada porque o processo não está em rascunho.' }
    return { error: 'Não foi possível confirmar a importação.' }
  }
  const imported = Array.isArray(data) ? Number(data[0]?.imported_count || 0) : 0
  if (!imported) return { error: 'A importação não retornou uma confirmação válida.' }

  revalidatePath(`/sigec-processos/${id.data}`)
  return { success: `${imported} vagas importadas com sucesso.`, processId: id.data }
}

export async function upsertSigecFormConfiguration(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem configurar o formulário.' }

  const parsed = FormConfigurationInputSchema.safeParse({
    processId: formData.get('processId'),
    itemId: formData.get('itemId'),
    kind: formData.get('kind'),
    code: formData.get('code'),
    label: formData.get('label'),
    details: formData.get('details') || '',
    required: formData.getAll('required').includes('true'),
    position: formData.get('position'),
    audience: formData.get('audience'),
    questionType: formData.get('questionType') || undefined,
    options: formData.get('options') || '',
    acceptedMimeTypes: formData.getAll('acceptedMimeTypes'),
    maxFileSizeMb: formData.get('maxFileSizeMb') || undefined,
    version: formData.get('version') || undefined,
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }

  const input = parsed.data
  const config: Record<string, unknown> = { audience: input.audience }
  if (input.kind === 'question') {
    config.questionType = input.questionType
    if (['single_choice', 'multiple_choice'].includes(input.questionType || '')) {
      config.options = input.options.split(/\r?\n/).map((option) => option.trim()).filter(Boolean)
    }
  } else if (input.kind === 'document') {
    config.acceptedMimeTypes = input.acceptedMimeTypes
    config.maxFileSizeBytes = (input.maxFileSizeMb || 1) * 1024 * 1024
  } else {
    config.version = input.version
  }

  const { error } = await adminClient.rpc('sigec_upsert_form_configuration', {
    p_process_id: input.processId,
    p_actor_id: user.id,
    p_kind: input.kind,
    p_code: input.code,
    p_label: input.label,
    p_details: input.details || null,
    p_required: input.required,
    p_position: input.position,
    p_config: config,
    p_item_id: input.itemId || null,
  })
  if (error) {
    console.error('[sigec] Falha ao salvar configuração do formulário:', error.code, error.message)
    if (error.code === '23505') return { error: 'Já existe um item com esse código no grupo.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração foi bloqueada porque o processo não está em rascunho.' }
    return { error: 'Não foi possível salvar este item do formulário.' }
  }

  revalidatePath(`/sigec-processos/${input.processId}`)
  return { success: input.itemId ? 'Configuração atualizada.' : 'Configuração adicionada.', processId: input.processId }
}

export async function deleteSigecFormConfiguration(
  processId: string,
  kind: string,
  itemId: string
): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem remover configurações.' }
  const parsed = z.object({
    processId: z.string().uuid(),
    kind: FormConfigurationKindSchema,
    itemId: z.string().uuid(),
  }).safeParse({ processId, kind, itemId })
  if (!parsed.success) return { error: 'Item de configuração inválido.' }

  const { error } = await adminClient.rpc('sigec_delete_form_configuration', {
    p_process_id: parsed.data.processId,
    p_actor_id: user.id,
    p_kind: parsed.data.kind,
    p_item_id: parsed.data.itemId,
  })
  if (error) {
    console.error('[sigec] Falha ao remover configuração do formulário:', error.code, error.message)
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração deste processo está bloqueada.' }
    if (error.message.includes('SIGEC_FORM_ITEM_IN_USE')) return { error: 'Este item já está vinculado a candidaturas e não pode ser removido.' }
    return { error: 'Não foi possível remover este item.' }
  }

  revalidatePath(`/sigec-processos/${parsed.data.processId}`)
  return { success: 'Configuração removida.', processId: parsed.data.processId }
}

export async function upsertSigecStage(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem configurar etapas.' }
  const parsed = StageInputSchema.safeParse({
    processId: formData.get('processId'), stageId: formData.get('stageId'),
    code: formData.get('code'), label: formData.get('label'),
    publicDescription: formData.get('publicDescription'), color: formData.get('color'),
    position: formData.get('position'), isInitial: formData.getAll('isInitial').includes('true'),
    isTerminal: formData.getAll('isTerminal').includes('true'),
    allowsAppeal: formData.getAll('allowsAppeal').includes('true'),
    whatsappTemplate: formData.get('whatsappTemplate'),
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }
  const input = parsed.data
  const { error } = await adminClient.rpc('sigec_upsert_stage_configuration', {
    p_process_id: input.processId, p_actor_id: user.id, p_code: input.code,
    p_label: input.label, p_public_description: input.publicDescription,
    p_color: input.color, p_position: input.position, p_is_initial: input.isInitial,
    p_is_terminal: input.isTerminal, p_allows_appeal: input.allowsAppeal,
    p_whatsapp_template: input.whatsappTemplate, p_stage_id: input.stageId || null,
  })
  if (error) {
    console.error('[sigec] Falha ao salvar etapa:', error.code, error.message)
    if (error.code === '23505') return { error: 'Já existe uma etapa com esse código ou uma etapa inicial.' }
    if (error.message.includes('SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION')) return { error: 'Remova as transições de saída antes de tornar esta etapa terminal.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'As etapas estão bloqueadas porque o processo não está em rascunho.' }
    return { error: 'Não foi possível salvar a etapa.' }
  }
  revalidatePath(`/sigec-processos/${input.processId}`)
  return { success: input.stageId ? 'Etapa atualizada.' : 'Etapa adicionada.', processId: input.processId }
}

export async function deleteSigecStage(processId: string, stageId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem remover etapas.' }
  const parsed = z.object({ processId: z.string().uuid(), stageId: z.string().uuid() }).safeParse({ processId, stageId })
  if (!parsed.success) return { error: 'Etapa inválida.' }
  const { error } = await adminClient.rpc('sigec_delete_stage_configuration', {
    p_process_id: parsed.data.processId, p_actor_id: user.id, p_stage_id: parsed.data.stageId,
  })
  if (error) {
    console.error('[sigec] Falha ao remover etapa:', error.code, error.message)
    if (error.message.includes('SIGEC_STAGE_IN_USE')) return { error: 'A etapa já está vinculada a candidaturas e não pode ser removida.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração deste processo está bloqueada.' }
    return { error: 'Não foi possível remover a etapa.' }
  }
  revalidatePath(`/sigec-processos/${parsed.data.processId}`)
  return { success: 'Etapa removida com suas transições.', processId: parsed.data.processId }
}

export async function upsertSigecStageTransition(formData: FormData): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem configurar transições.' }
  const parsed = StageTransitionInputSchema.safeParse({
    processId: formData.get('processId'), transitionId: formData.get('transitionId'),
    fromStageId: formData.get('fromStageId'), toStageId: formData.get('toStageId'),
    requiresReason: formData.getAll('requiresReason').includes('true'),
    blocksOnPending: formData.getAll('blocksOnPending').includes('true'),
    active: formData.getAll('active').includes('true'),
  })
  if (!parsed.success) return { error: firstValidationError(parsed.error) }
  const input = parsed.data
  const { error } = await adminClient.rpc('sigec_upsert_stage_transition', {
    p_process_id: input.processId, p_actor_id: user.id,
    p_from_stage_id: input.fromStageId, p_to_stage_id: input.toStageId,
    p_requires_reason: input.requiresReason, p_blocks_on_pending: input.blocksOnPending,
    p_active: input.active, p_transition_id: input.transitionId || null,
  })
  if (error) {
    console.error('[sigec] Falha ao salvar transição:', error.code, error.message)
    if (error.code === '23505') return { error: 'Esta transição já existe.' }
    if (error.message.includes('SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION')) return { error: 'Etapas terminais não podem possuir transições de saída.' }
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'As transições estão bloqueadas porque o processo não está em rascunho.' }
    return { error: 'Não foi possível salvar a transição.' }
  }
  revalidatePath(`/sigec-processos/${input.processId}`)
  return { success: input.transitionId ? 'Transição atualizada.' : 'Transição adicionada.', processId: input.processId }
}

export async function deleteSigecStageTransition(processId: string, transitionId: string): Promise<SigecProcessActionState> {
  const user = await requireSigecManager()
  if (!user) return { error: 'Apenas administradores e gerentes podem remover transições.' }
  const parsed = z.object({ processId: z.string().uuid(), transitionId: z.string().uuid() }).safeParse({ processId, transitionId })
  if (!parsed.success) return { error: 'Transição inválida.' }
  const { error } = await adminClient.rpc('sigec_delete_stage_transition', {
    p_process_id: parsed.data.processId, p_actor_id: user.id, p_transition_id: parsed.data.transitionId,
  })
  if (error) {
    console.error('[sigec] Falha ao remover transição:', error.code, error.message)
    if (error.message.includes('SIGEC_PROCESS_CONFIGURATION_LOCKED')) return { error: 'A configuração deste processo está bloqueada.' }
    return { error: 'Não foi possível remover a transição.' }
  }
  revalidatePath(`/sigec-processos/${parsed.data.processId}`)
  return { success: 'Transição removida.', processId: parsed.data.processId }
}
