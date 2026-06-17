import { adminClient } from '@/lib/supabase/admin'
import { extractRole, type UserRole } from '@/lib/roles'
import { createSystemNotifications } from '@/lib/system-notifications'

export type TaskPriority = 'p1' | 'p2' | 'p3' | 'p4'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled'

export interface TaskUser {
  id: string
  email: string
  role: UserRole
}

export interface TaskProject {
  id: string
  name: string
  description: string | null
  color: string
  created_by: string
  archived: boolean
  created_at: string
  updated_at: string
  members: string[]
}

export interface TaskSection {
  id: string
  project_id: string
  name: string
  position: number
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  body: string
  created_at: string
}

export interface TaskActivity {
  id: string
  task_id: string | null
  project_id: string | null
  actor_id: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface TaskReminder {
  id: string
  task_id: string
  user_id: string | null
  remind_at: string
  kind: 'manual' | 'due_at' | 'one_day_before' | 'three_days_before'
  delivered_at: string | null
}

export interface TaskNotification {
  id: string
  recipient_id: string
  task_id: string | null
  project_id: string | null
  type: string
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export interface TaskItem {
  id: string
  project_id: string
  section_id: string | null
  parent_task_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_at: string | null
  position: number
  created_by: string
  completed_at: string | null
  created_at: string
  updated_at: string
  assignees: string[]
  comments: TaskComment[]
  reminders: TaskReminder[]
  subtasks: TaskItem[]
}

export interface TasksSnapshot {
  currentUserId: string
  currentRole: UserRole
  users: TaskUser[]
  projects: TaskProject[]
  sections: TaskSection[]
  tasks: TaskItem[]
  notifications: TaskNotification[]
}

type DbProject = Omit<TaskProject, 'members'>
type DbTask = Omit<TaskItem, 'assignees' | 'comments' | 'reminders' | 'subtasks'>

export function canManageTasks(role: UserRole) {
  return role === 'admin' || role === 'gerente'
}

export function canSeeProject(project: TaskProject, userId: string, role: UserRole) {
  if (role === 'admin') return true
  if (role === 'gerente') return project.created_by === userId || project.members.includes(userId)
  return project.members.includes(userId)
}

export async function listTaskUsers(): Promise<TaskUser[]> {
  const { data } = await adminClient.auth.admin.listUsers()
  return (data?.users ?? [])
    .filter((user) => Boolean(user.email))
    .map((user) => ({
      id: user.id,
      email: user.email ?? user.id,
      role: extractRole(user),
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function getTasksSnapshot(currentUserId: string, currentRole: UserRole): Promise<TasksSnapshot> {
  await deliverDueTaskReminders()

  const [
    users,
    projectsResult,
    membersResult,
    sectionsResult,
    tasksResult,
    assigneesResult,
    commentsResult,
    remindersResult,
    notificationsResult,
  ] = await Promise.all([
    listTaskUsers(),
    adminClient.from('task_projects').select('*').eq('archived', false).order('created_at', { ascending: true }),
    adminClient.from('task_project_members').select('project_id, user_id'),
    adminClient.from('task_sections').select('*').order('position', { ascending: true }),
    adminClient.from('tasks').select('*').order('position', { ascending: true }),
    adminClient.from('task_assignees').select('task_id, user_id'),
    adminClient.from('task_comments').select('*').order('created_at', { ascending: true }),
    adminClient.from('task_reminders').select('*').order('remind_at', { ascending: true }),
    adminClient
      .from('task_notifications')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const memberRows = (membersResult.data ?? []) as { project_id: string; user_id: string }[]
  const projects = ((projectsResult.data ?? []) as DbProject[]).map((project) => ({
    ...project,
    members: memberRows.filter((row) => row.project_id === project.id).map((row) => row.user_id),
  }))

  const visibleProjectIds = new Set(
    projects
      .filter((project) => canSeeProject(project, currentUserId, currentRole))
      .map((project) => project.id)
  )

  const assigneeRows = (assigneesResult.data ?? []) as { task_id: string; user_id: string }[]
  const visibleAssignedTaskIds = new Set(
    assigneeRows
      .filter((row) => row.user_id === currentUserId)
      .map((row) => row.task_id)
  )

  const baseTasks = ((tasksResult.data ?? []) as DbTask[]).filter((task) => {
    if (currentRole === 'atendente') return visibleAssignedTaskIds.has(task.id)
    return visibleProjectIds.has(task.project_id)
  })

  if (currentRole === 'atendente') {
    for (const task of baseTasks) visibleProjectIds.add(task.project_id)
  }

  const visibleTaskIds = new Set(baseTasks.map((task) => task.id))

  const commentsByTask = groupBy((commentsResult.data ?? []) as TaskComment[], 'task_id')
  const remindersByTask = groupBy((remindersResult.data ?? []) as TaskReminder[], 'task_id')
  const assigneesByTask = groupBy(assigneeRows, 'task_id')

  const hydrated: TaskItem[] = baseTasks.map((task) => ({
    ...task,
    assignees: (assigneesByTask.get(task.id) ?? []).map((row) => row.user_id),
    comments: commentsByTask.get(task.id) ?? [],
    reminders: remindersByTask.get(task.id) ?? [],
    subtasks: [],
  }))

  const taskById = new Map(hydrated.map((task) => [task.id, task]))
  const roots: TaskItem[] = []

  for (const task of hydrated) {
    if (task.parent_task_id && visibleTaskIds.has(task.parent_task_id)) {
      taskById.get(task.parent_task_id)?.subtasks.push(task)
    } else if (!task.parent_task_id) {
      roots.push(task)
    }
  }

  return {
    currentUserId,
    currentRole,
    users,
    projects: projects.filter((project) => visibleProjectIds.has(project.id)),
    sections: ((sectionsResult.data ?? []) as TaskSection[]).filter((section) => visibleProjectIds.has(section.project_id)),
    tasks: roots,
    notifications: (notificationsResult.data ?? []) as TaskNotification[],
  }
}

export async function getVisibleTask(taskId: string, userId: string, role: UserRole) {
  const snapshot = await getTasksSnapshot(userId, role)
  const allTasks = flattenTasks(snapshot.tasks)
  return allTasks.find((task) => task.id === taskId) ?? null
}

export async function ensureCanManageProject(projectId: string, userId: string, role: UserRole) {
  if (!canManageTasks(role)) return false
  if (role === 'admin') return true

  const { data: project } = await adminClient
    .from('task_projects')
    .select('id, created_by')
    .eq('id', projectId)
    .maybeSingle()

  if (project?.created_by === userId) return true

  const { data: member } = await adminClient
    .from('task_project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  return Boolean(member)
}

export async function addTaskActivity(
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
  taskId?: string | null,
  projectId?: string | null
) {
  await adminClient.from('task_activity').insert({
    actor_id: actorId,
    event_type: eventType,
    payload,
    task_id: taskId ?? null,
    project_id: projectId ?? null,
  })
}

export async function notifyUsers(
  recipientIds: string[],
  notification: {
    taskId?: string | null
    projectId?: string | null
    type: string
    title: string
    message?: string | null
  },
  actorId?: string
) {
  const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id && id !== actorId)))
  if (uniqueRecipients.length === 0) return

  await adminClient.from('task_notifications').insert(
    uniqueRecipients.map((recipientId) => ({
      recipient_id: recipientId,
      task_id: notification.taskId ?? null,
      project_id: notification.projectId ?? null,
      type: notification.type,
      title: notification.title,
      message: notification.message ?? null,
    }))
  )

  await createSystemNotifications(
    uniqueRecipients.map((recipientId) => ({
      recipientId,
      module: 'tarefas',
      type: notification.type,
      title: notification.title,
      message: notification.message ?? null,
      href: notification.taskId && notification.projectId
        ? `/tarefas/${notification.projectId}?task=${notification.taskId}`
        : notification.projectId
        ? `/tarefas/${notification.projectId}`
        : '/tarefas',
      metadata: {
        taskId: notification.taskId ?? null,
        projectId: notification.projectId ?? null,
      },
    }))
  )
}

export async function deliverDueTaskReminders() {
  const now = new Date().toISOString()
  const { data: reminders } = await adminClient
    .from('task_reminders')
    .select('id, task_id, user_id, remind_at, kind, tasks(id, title, project_id)')
    .is('delivered_at', null)
    .lte('remind_at', now)
    .limit(100)

  const rows = (reminders ?? []) as Array<{
    id: string
    task_id: string
    user_id: string | null
    remind_at: string
    kind: string
    tasks?: { title?: string; project_id?: string } | null
  }>

  for (const reminder of rows) {
    const taskTitle = reminder.tasks?.title ?? 'Tarefa'
    let recipients = reminder.user_id ? [reminder.user_id] : []

    if (recipients.length === 0) {
      const { data: assignees } = await adminClient
        .from('task_assignees')
        .select('user_id')
        .eq('task_id', reminder.task_id)
      recipients = ((assignees ?? []) as { user_id: string }[]).map((row) => row.user_id)
    }

    await notifyUsers(recipients, {
      taskId: reminder.task_id,
      projectId: reminder.tasks?.project_id ?? null,
      type: 'reminder_due',
      title: 'Lembrete de tarefa',
      message: taskTitle,
    })

    await adminClient.from('task_reminders').update({ delivered_at: now }).eq('id', reminder.id)
  }
}

export function flattenTasks(tasks: TaskItem[]): TaskItem[] {
  return tasks.flatMap((task) => [task, ...task.subtasks])
}

function groupBy<T extends object>(rows: T[], key: keyof T) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const value = row[key]
    if (typeof value !== 'string') continue
    const current = map.get(value) ?? []
    current.push(row)
    map.set(value, current)
  }
  return map
}
