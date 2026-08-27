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
