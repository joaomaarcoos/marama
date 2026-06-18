'use server'

import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { extractRole, type UserRole } from '@/lib/roles'
import {
  addTaskActivity,
  canManageTasks,
  ensureCanManageProject,
  flattenTasks,
  getTasksSnapshot,
  getVisibleTask,
  listTaskUsers,
  notifyUsers,
  type TaskPriority,
} from '@/lib/tasks'

type ActionResult<T = unknown> = { error?: string; success?: string; data?: T }

const priorityValues = ['p1', 'p2', 'p3', 'p4'] as const
const statusValues = ['todo', 'in_progress', 'done', 'canceled'] as const

const ProjectSchema = z.object({
  name: z.string().trim().min(2, 'Nome do projeto obrigatorio'),
  description: z.string().trim().optional(),
  color: z.string().trim().optional(),
  memberIds: z.array(z.string()).default([]),
})

const SectionSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2, 'Nome da secao obrigatorio'),
})

const TaskSchema = z.object({
  projectId: z.string().uuid(),
  sectionId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2, 'Titulo da tarefa obrigatorio'),
  description: z.string().trim().optional(),
  dueAt: z.string().trim().optional(),
  priority: z.enum(priorityValues).default('p4'),
  assigneeIds: z.array(z.string()).default([]),
})

const UpdateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  dueAt: z.string().trim().nullable().optional(),
  priority: z.enum(priorityValues).optional(),
  status: z.enum(statusValues).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
})

const ReminderSchema = z.object({
  taskId: z.string().uuid(),
  remindAt: z.string().trim().min(1, 'Data do lembrete obrigatoria'),
  userId: z.string().nullable().optional(),
  kind: z.enum(['manual', 'due_at', 'one_day_before', 'three_days_before']).default('manual'),
})

async function currentSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { user, role: extractRole(user) }
}

function normalizeDateInput(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function splitPeople(value: string | undefined) {
  if (!value) return []
  return value
    .split(/[;,|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function taskDbError(error?: { message?: string } | null) {
  const message = error?.message ?? ''
  if (message.includes('task_projects') || message.includes('schema cache')) {
    return 'O banco ainda nao tem as tabelas do modulo Tarefas. Aplique a migration supabase/migrations/202606160001_tasks_module.sql no Supabase e recarregue a pagina.'
  }
  return message || 'Erro ao acessar o banco.'
}

async function nextPosition(table: 'tasks' | 'task_sections', filters: Record<string, string | null>) {
  let query = adminClient.from(table).select('position').order('position', { ascending: false }).limit(1)
  for (const [key, value] of Object.entries(filters)) {
    query = value === null ? query.is(key, null) : query.eq(key, value)
  }
  const { data } = await query
  const current = (data?.[0] as { position?: number } | undefined)?.position ?? -1
  return current + 1
}

async function replaceTaskAssignees(taskId: string, assigneeIds: string[], actorId: string) {
  await adminClient.from('task_assignees').delete().eq('task_id', taskId)
  if (assigneeIds.length > 0) {
    await adminClient.from('task_assignees').insert(
      Array.from(new Set(assigneeIds)).map((userId) => ({
        task_id: taskId,
        user_id: userId,
        assigned_by: actorId,
      }))
    )
  }
}

async function ensureProjectMembers(projectId: string, userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueIds.length === 0) return

  const { data: existing } = await adminClient
    .from('task_project_members')
    .select('user_id')
    .eq('project_id', projectId)

  const existingIds = new Set(((existing ?? []) as { user_id: string }[]).map((row) => row.user_id))
  const missingIds = uniqueIds.filter((userId) => !existingIds.has(userId))
  if (missingIds.length === 0) return

  await adminClient.from('task_project_members').insert(
    missingIds.map((userId) => ({
      project_id: projectId,
      user_id: userId,
      role: 'member',
    }))
  )
}

export async function createTaskProject(input: z.infer<typeof ProjectSchema>): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }
  if (!canManageTasks(session.role)) return { error: 'Apenas admin e gerente podem criar projetos.' }

  const parsed = ProjectSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const memberIds = Array.from(new Set([session.user.id, ...parsed.data.memberIds]))
  const { data: project, error } = await adminClient
    .from('task_projects')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color || 'hsl(160 84% 39%)',
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error || !project) return { error: taskDbError(error) }

  await adminClient.from('task_project_members').insert(
    memberIds.map((userId) => ({
      project_id: project.id,
      user_id: userId,
      role: userId === session.user.id ? 'owner' : 'member',
    }))
  )

  await adminClient.from('task_sections').insert([
    { project_id: project.id, name: 'A fazer', position: 0 },
    { project_id: project.id, name: 'Em andamento', position: 1 },
    { project_id: project.id, name: 'Concluido', position: 2 },
  ])

  await addTaskActivity(session.user.id, 'project_created', { name: parsed.data.name }, null, project.id)
  revalidatePath('/tarefas')
  return { success: 'Projeto criado.' }
}

export async function deleteTaskProject(projectId: string): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }
  if (!canManageTasks(session.role)) return { error: 'Apenas admin e gerente podem apagar projetos.' }

  const { data: project, error: projectError } = await adminClient
    .from('task_projects')
    .select('id, name, created_by')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) return { error: taskDbError(projectError) }
  if (!project) return { error: 'Projeto nao encontrado.' }

  if (session.role !== 'admin' && project.created_by !== session.user.id) {
    return { error: 'Apenas o criador do projeto ou um admin pode apagar este projeto.' }
  }

  const { error } = await adminClient
    .from('task_projects')
    .delete()
    .eq('id', projectId)

  if (error) return { error: taskDbError(error) }

  revalidatePath('/tarefas')
  return { success: `Projeto "${project.name}" apagado.` }
}

export async function createTaskSection(input: z.infer<typeof SectionSchema>): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const parsed = SectionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }
  if (!(await ensureCanManageProject(parsed.data.projectId, session.user.id, session.role))) {
    return { error: 'Voce nao pode alterar este projeto.' }
  }

  const position = await nextPosition('task_sections', { project_id: parsed.data.projectId })
  const { error } = await adminClient
    .from('task_sections')
    .insert({ project_id: parsed.data.projectId, name: parsed.data.name, position })

  if (error) return { error: taskDbError(error) }
  await addTaskActivity(session.user.id, 'section_created', { name: parsed.data.name }, null, parsed.data.projectId)
  revalidatePath('/tarefas')
  return { success: 'Secao criada.' }
}

export async function deleteTaskSection(sectionId: string): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const { data: section, error: sectionError } = await adminClient
    .from('task_sections')
    .select('id, project_id, name')
    .eq('id', sectionId)
    .maybeSingle()

  if (sectionError) return { error: taskDbError(sectionError) }
  if (!section) return { error: 'Secao nao encontrada.' }

  if (!(await ensureCanManageProject(section.project_id, session.user.id, session.role))) {
    return { error: 'Voce nao pode alterar este projeto.' }
  }

  const { count, error: countError } = await adminClient
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', sectionId)

  if (countError) return { error: taskDbError(countError) }
  if ((count ?? 0) > 0) {
    return { error: 'Esta secao ainda tem tarefas. Mova ou conclua as tarefas antes de apagar.' }
  }

  const { error } = await adminClient
    .from('task_sections')
    .delete()
    .eq('id', sectionId)

  if (error) return { error: taskDbError(error) }

  await addTaskActivity(session.user.id, 'section_deleted', { name: section.name }, null, section.project_id)
  revalidatePath('/tarefas')
  return { success: 'Secao apagada.' }
}

export async function createTask(input: z.infer<typeof TaskSchema>): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const parsed = TaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const parentTask = parsed.data.parentTaskId
    ? await getVisibleTask(parsed.data.parentTaskId, session.user.id, session.role)
    : null

  if (parsed.data.parentTaskId && !parentTask) return { error: 'Tarefa principal nao encontrada.' }
  if (parentTask?.parent_task_id) return { error: 'Subtarefas podem ter apenas 1 nivel.' }

  const canCreateRoot = await ensureCanManageProject(parsed.data.projectId, session.user.id, session.role)
  if (!parsed.data.parentTaskId && !canCreateRoot) return { error: 'Apenas admin e gerente podem criar tarefas.' }
  if (parsed.data.parentTaskId && parentTask?.project_id !== parsed.data.projectId) return { error: 'Projeto invalido para subtarefa.' }

  const assigneeIds = Array.from(new Set(parsed.data.assigneeIds.length > 0 ? parsed.data.assigneeIds : [session.user.id]))
  const position = await nextPosition('tasks', {
    project_id: parsed.data.projectId,
    parent_task_id: parsed.data.parentTaskId ?? null,
  })

  const { data: task, error } = await adminClient
    .from('tasks')
    .insert({
      project_id: parsed.data.projectId,
      section_id: parsed.data.sectionId ?? parentTask?.section_id ?? null,
      parent_task_id: parsed.data.parentTaskId ?? null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      due_at: normalizeDateInput(parsed.data.dueAt),
      priority: parsed.data.priority,
      position,
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error || !task) return { error: taskDbError(error) }

  await replaceTaskAssignees(task.id, assigneeIds, session.user.id)
  await ensureProjectMembers(parsed.data.projectId, assigneeIds)
  await addTaskActivity(session.user.id, 'task_created', { title: parsed.data.title }, task.id, parsed.data.projectId)
  await notifyUsers(assigneeIds, {
    taskId: task.id,
    projectId: parsed.data.projectId,
    type: 'task_assigned',
    title: 'Nova tarefa atribuida',
    message: parsed.data.title,
  }, session.user.id)

  revalidatePath('/tarefas')
  return { success: 'Tarefa criada.' }
}

export async function updateTask(input: z.infer<typeof UpdateTaskSchema>): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const parsed = UpdateTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const task = await getVisibleTask(parsed.data.taskId, session.user.id, session.role)
  if (!task) return { error: 'Tarefa nao encontrada.' }

  const canManageProject = await ensureCanManageProject(task.project_id, session.user.id, session.role)
  const isAssignee = task.assignees.includes(session.user.id)
  if (!canManageProject && !isAssignee) return { error: 'Voce nao pode alterar esta tarefa.' }
  if (parsed.data.assigneeIds && !canManageProject) return { error: 'Apenas admin e gerente podem alterar responsaveis.' }

  const updates: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) updates.title = parsed.data.title
  if (parsed.data.description !== undefined) updates.description = parsed.data.description || null
  if (parsed.data.dueAt !== undefined) updates.due_at = normalizeDateInput(parsed.data.dueAt)
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
    updates.completed_at = parsed.data.status === 'done' ? new Date().toISOString() : null
  }
  if (parsed.data.sectionId !== undefined) updates.section_id = parsed.data.sectionId

  if (Object.keys(updates).length > 0) {
    const { error } = await adminClient.from('tasks').update(updates).eq('id', task.id)
    if (error) return { error: taskDbError(error) }
  }

  if (parsed.data.assigneeIds) {
    await ensureProjectMembers(task.project_id, parsed.data.assigneeIds)
    await replaceTaskAssignees(task.id, parsed.data.assigneeIds, session.user.id)
  }

  const recipients = parsed.data.assigneeIds ?? task.assignees
  await addTaskActivity(session.user.id, 'task_updated', updates, task.id, task.project_id)
  await notifyUsers(recipients, {
    taskId: task.id,
    projectId: task.project_id,
    type: 'task_updated',
    title: 'Tarefa atualizada',
    message: task.title,
  }, session.user.id)

  revalidatePath('/tarefas')
  return { success: 'Tarefa atualizada.' }
}

export async function moveTask(taskId: string, sectionId: string | null, position: number): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const task = await getVisibleTask(taskId, session.user.id, session.role)
  if (!task) return { error: 'Tarefa nao encontrada.' }

  const { error } = await adminClient.from('tasks').update({ section_id: sectionId, position }).eq('id', taskId)
  if (error) return { error: taskDbError(error) }

  await addTaskActivity(session.user.id, 'task_moved', { sectionId, position }, task.id, task.project_id)
  await notifyUsers(task.assignees, {
    taskId: task.id,
    projectId: task.project_id,
    type: 'task_moved',
    title: 'Tarefa movida',
    message: task.title,
  }, session.user.id)

  revalidatePath('/tarefas')
  return { success: 'Tarefa movida.' }
}

export async function addTaskComment(taskId: string, body: string): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const task = await getVisibleTask(taskId, session.user.id, session.role)
  if (!task) return { error: 'Tarefa nao encontrada.' }
  if (!body.trim()) return { error: 'Comentario vazio.' }

  const { error } = await adminClient
    .from('task_comments')
    .insert({ task_id: taskId, author_id: session.user.id, body: body.trim() })

  if (error) return { error: taskDbError(error) }

  await addTaskActivity(session.user.id, 'comment_created', { body: body.trim() }, task.id, task.project_id)
  await notifyUsers(task.assignees, {
    taskId: task.id,
    projectId: task.project_id,
    type: 'comment_created',
    title: 'Novo comentario',
    message: task.title,
  }, session.user.id)

  revalidatePath('/tarefas')
  return { success: 'Comentario adicionado.' }
}

export async function addTaskReminder(input: z.infer<typeof ReminderSchema>): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const parsed = ReminderSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const task = await getVisibleTask(parsed.data.taskId, session.user.id, session.role)
  if (!task) return { error: 'Tarefa nao encontrada.' }

  const remindAt = normalizeDateInput(parsed.data.remindAt)
  if (!remindAt) return { error: 'Data do lembrete invalida.' }

  const { error } = await adminClient.from('task_reminders').insert({
    task_id: task.id,
    user_id: parsed.data.userId || null,
    remind_at: remindAt,
    kind: parsed.data.kind,
    created_by: session.user.id,
  })

  if (error) return { error: taskDbError(error) }
  await addTaskActivity(session.user.id, 'reminder_created', { remindAt, kind: parsed.data.kind }, task.id, task.project_id)
  revalidatePath('/tarefas')
  return { success: 'Lembrete criado.' }
}

export async function markTaskNotification(notificationId: string, isRead: boolean): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const { error } = await adminClient
    .from('task_notifications')
    .update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null })
    .eq('id', notificationId)
    .eq('recipient_id', session.user.id)

  if (error) return { error: taskDbError(error) }
  revalidatePath('/tarefas')
  return { success: 'Notificacao atualizada.' }
}

export async function importTasksCsv(formData: FormData): Promise<ActionResult<{ imported: number; skipped: number; errors: string[] }>> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }
  if (!canManageTasks(session.role)) return { error: 'Apenas admin e gerente podem importar tarefas.' }
  const actorId = session.user.id

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Nenhum arquivo enviado.' }

  const users = await listTaskUsers()
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]))
  const text = (await file.text()).replace(/^\ufeff/, '')
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  if (parsed.errors.length > 0) {
    return { error: parsed.errors[0].message }
  }

  const errors: string[] = []
  let imported = 0
  let currentProjectId: string | null = null
  let currentSectionId: string | null = null
  let lastTaskId: string | null = null
  const createdByTitle = new Map<string, string>()

  async function getOrCreateProject(name: string) {
    const cleanName = name.trim() || `Importacao ${new Date().toLocaleDateString('pt-BR')}`
    const { data: existing } = await adminClient
      .from('task_projects')
      .select('id')
      .ilike('name', cleanName)
      .maybeSingle()
    if (existing?.id) return existing.id as string

    const { data: project, error } = await adminClient
      .from('task_projects')
      .insert({ name: cleanName, created_by: actorId })
      .select('id')
      .single()
    if (error || !project) throw new Error(taskDbError(error))
    await adminClient.from('task_project_members').insert({ project_id: project.id, user_id: actorId, role: 'owner' })
    return project.id as string
  }

  async function getOrCreateSection(projectId: string, name: string) {
    const cleanName = name.trim() || 'A fazer'
    const { data: existing } = await adminClient
      .from('task_sections')
      .select('id')
      .eq('project_id', projectId)
      .ilike('name', cleanName)
      .maybeSingle()
    if (existing?.id) return existing.id as string

    const position = await nextPosition('task_sections', { project_id: projectId })
    const { data: section, error } = await adminClient
      .from('task_sections')
      .insert({ project_id: projectId, name: cleanName, position })
      .select('id')
      .single()
    if (error || !section) throw new Error(taskDbError(error))
    return section.id as string
  }

  for (let index = 0; index < parsed.data.length; index++) {
    const row = parsed.data[index]
    const line = index + 2
    const type = (row.type ?? '').trim().toLowerCase()
    const isTodoist = Boolean(row.type || row.content)

    try {
      if (isTodoist && type === 'section') {
        currentProjectId = currentProjectId ?? await getOrCreateProject(row.projeto || row.project || `Importacao ${file.name}`)
        currentSectionId = await getOrCreateSection(currentProjectId, row.content)
        continue
      }

      if (isTodoist && type === 'note') {
        if (!lastTaskId || !row.content?.trim()) continue
        await adminClient.from('task_comments').insert({ task_id: lastTaskId, author_id: actorId, body: row.content.trim() })
        imported++
        continue
      }

      const title = (isTodoist ? row.content : row.tarefa || row.title || row.content)?.trim()
      if (!title) {
        errors.push(`Linha ${line}: tarefa sem titulo.`)
        continue
      }

      const projectName = row.projeto || row.project || `Importacao ${file.name}`
      currentProjectId = await getOrCreateProject(projectName)

      const sectionName = row.secao || row.section || row.section_name || (isTodoist ? '' : 'A fazer')
      if (sectionName || !currentSectionId) currentSectionId = await getOrCreateSection(currentProjectId, sectionName || 'A fazer')

      const assigneeEmails = splitPeople(row.responsaveis || row.responsavel || row.responsible || row.assignee)
      const assigneeIds = assigneeEmails
        .map((email) => userByEmail.get(email))
        .filter((id): id is string => Boolean(id))

      const missingEmails = assigneeEmails.filter((email) => !userByEmail.has(email))
      if (missingEmails.length > 0) errors.push(`Linha ${line}: responsaveis nao encontrados: ${missingEmails.join(', ')}.`)

      const parentTitle = row.subtarefa_de?.trim()
      const parentTaskId = parentTitle ? createdByTitle.get(parentTitle.toLowerCase()) ?? null : null
      if (parentTitle && !parentTaskId) errors.push(`Linha ${line}: tarefa principal "${parentTitle}" nao encontrada.`)

      const priority = parsePriority(row.prioridade || row.priority)
      const position = await nextPosition('tasks', { project_id: currentProjectId, parent_task_id: parentTaskId })

      const { data: task, error } = await adminClient
        .from('tasks')
        .insert({
          project_id: currentProjectId,
          section_id: currentSectionId,
          parent_task_id: parentTaskId,
          title,
          description: row.descricao || row.description || null,
          due_at: normalizeDateInput(row.prazo || row.date || row.due_date),
          priority,
          position,
          created_by: actorId,
        })
        .select('id')
        .single()

      if (error || !task) throw new Error(taskDbError(error))

      const finalAssignees = assigneeIds.length > 0 ? assigneeIds : [actorId]
      await ensureProjectMembers(currentProjectId, finalAssignees)
      await replaceTaskAssignees(task.id, finalAssignees, actorId)

      const reminderAt = normalizeDateInput(row.lembrete || row.reminder)
      if (reminderAt) {
        await adminClient.from('task_reminders').insert({
          task_id: task.id,
          remind_at: reminderAt,
          created_by: actorId,
        })
      }

      await notifyUsers(finalAssignees, {
        taskId: task.id,
        projectId: currentProjectId,
        type: 'task_assigned',
        title: 'Nova tarefa importada',
        message: title,
      }, actorId)

      createdByTitle.set(title.toLowerCase(), task.id)
      lastTaskId = task.id
      imported++
    } catch (error) {
      errors.push(`Linha ${line}: ${error instanceof Error ? error.message : 'erro inesperado'}`)
    }
  }

  const skipped = errors.length
  await adminClient.from('task_import_batches').insert({
    created_by: actorId,
    file_name: file.name,
    imported_count: imported,
    skipped_count: skipped,
    errors,
  })

  revalidatePath('/tarefas')
  return { success: `${imported} item(ns) importado(s).`, data: { imported, skipped, errors } }
}

export async function getCurrentTaskSnapshot() {
  const session = await currentSession()
  if (!session) throw new Error('Nao autorizado')
  return getTasksSnapshot(session.user.id, session.role)
}

function parsePriority(value: string | undefined): TaskPriority {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === '1' || normalized === 'p1' || normalized === 'alta' || normalized === 'urgente') return 'p1'
  if (normalized === '2' || normalized === 'p2') return 'p2'
  if (normalized === '3' || normalized === 'p3' || normalized === 'media') return 'p3'
  return 'p4'
}

export async function quickCreateDueReminders(taskId: string): Promise<ActionResult> {
  const session = await currentSession()
  if (!session) return { error: 'Nao autorizado' }

  const snapshot = await getTasksSnapshot(session.user.id, session.role)
  const task = flattenTasks(snapshot.tasks).find((item) => item.id === taskId)
  if (!task?.due_at) return { error: 'A tarefa nao tem prazo.' }

  const due = new Date(task.due_at)
  const reminders = [
    { kind: 'due_at' as const, date: due },
    { kind: 'one_day_before' as const, date: new Date(due.getTime() - 24 * 60 * 60 * 1000) },
    { kind: 'three_days_before' as const, date: new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000) },
  ].filter((item) => item.date.getTime() > Date.now())

  if (reminders.length === 0) return { error: 'Nao ha lembretes futuros para este prazo.' }

  await adminClient.from('task_reminders').insert(
    reminders.map((reminder) => ({
      task_id: task.id,
      remind_at: reminder.date.toISOString(),
      kind: reminder.kind,
      created_by: session.user.id,
    }))
  )

  await addTaskActivity(session.user.id, 'quick_reminders_created', { count: reminders.length }, task.id, task.project_id)
  revalidatePath('/tarefas')
  return { success: 'Lembretes rapidos criados.' }
}
