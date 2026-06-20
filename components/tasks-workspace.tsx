'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Columns3,
  Flag,
  Eye,
  EyeOff,
  LayoutList,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  addTaskComment,
  addTaskReminder,
  createTask,
  createTaskSection,
  deleteTask,
  deleteTaskSection,
  moveTask,
  quickCreateDueReminders,
  updateTask,
} from '@/app/(dashboard)/tarefas/actions'
import { cn } from '@/lib/utils'
import type { TaskItem, TaskPriority, TaskProject, TaskSection, TasksSnapshot, TaskStatus } from '@/lib/tasks'
import { UserMultiSelect } from '@/components/user-multi-select'

type ViewMode = 'list' | 'board'
type ModalMode = 'task' | 'section' | null

const priorityMeta: Record<TaskPriority, { label: string; color: string }> = {
  p1: { label: 'Urgente', color: 'hsl(0 72% 60%)' },
  p2: { label: 'Alta', color: 'hsl(38 92% 50%)' },
  p3: { label: 'Media', color: 'hsl(217 91% 60%)' },
  p4: { label: 'Normal', color: 'hsl(215 18% 55%)' },
}

const statusMeta: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'A fazer', color: 'hsl(215 18% 55%)' },
  in_progress: { label: 'Em andamento', color: 'hsl(217 91% 60%)' },
  done: { label: 'Concluida', color: 'hsl(160 84% 39%)' },
  canceled: { label: 'Cancelada', color: 'hsl(0 72% 60%)' },
}

export default function TasksWorkspace({
  initialSnapshot,
  projectId,
}: {
  initialSnapshot: TasksSnapshot
  projectId: string
}) {
  const router = useRouter()
  const urlSearchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [view, setView] = useState<ViewMode>('list')
  const [modal, setModal] = useState<ModalMode>(null)
  const selectedProjectId = projectId
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [showCompleted, setShowCompleted] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newSubtaskParentId, setNewSubtaskParentId] = useState<string | null>(null)

  useEffect(() => {
    setSnapshot(initialSnapshot)
  }, [initialSnapshot])

  useEffect(() => {
    const taskId = urlSearchParams.get('task')
    if (taskId) setSelectedTaskId(taskId)
  }, [urlSearchParams])

  const canManage = snapshot.currentRole === 'admin' || snapshot.currentRole === 'gerente'
  const flatTasks = useMemo(() => flatten(snapshot.tasks), [snapshot.tasks])
  const selectedTask = flatTasks.find((task) => task.id === selectedTaskId) ?? null
  const selectedProject = snapshot.projects.find((project) => project.id === selectedProjectId) ?? null
  const projectSections = snapshot.sections.filter((section) => section.project_id === selectedProjectId)
  const projectTasks = flatTasks.filter((task) => task.project_id === selectedProjectId)
  const projectStats = {
    total: projectTasks.length,
    open: projectTasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length,
    overdue: projectTasks.filter((task) => isOverdue(task)).length,
    done: projectTasks.filter((task) => task.status === 'done').length,
  }

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase()

    function taskMatches(task: TaskItem) {
      if (task.project_id !== selectedProjectId) return false
      if (statusFilter === 'all' && !showCompleted && task.status === 'done') return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      if (assigneeFilter !== 'all' && !task.assignees.includes(assigneeFilter)) return false
      if (q && !`${task.title} ${task.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    }

    return snapshot.tasks
      .filter((task) => !task.parent_task_id)
      .filter((task) => task.project_id === selectedProjectId)
      .map((task) => ({
        ...task,
        subtasks: task.subtasks.filter(taskMatches),
      }))
      .filter((task) => taskMatches(task) || task.subtasks.length > 0)
  }, [assigneeFilter, search, selectedProjectId, showCompleted, snapshot.tasks, statusFilter])

  function refresh() {
    router.refresh()
  }

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  function runAction(action: () => Promise<{ error?: string; success?: string }>, after?: () => void) {
    startTransition(async () => {
      const result = await action()
      if (result.error) flash('error', result.error)
      else flash('success', result.success ?? 'Atualizado.')
      if (!result.error) {
        after?.()
        refresh()
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    const sectionId = overId === 'no-section' ? null : overId
    const task = flatTasks.find((item) => item.id === taskId)
    if (!task || task.section_id === sectionId) return
    const position = flatTasks.filter((item) => item.section_id === sectionId && item.id !== taskId).length
    runAction(() => moveTask(taskId, sectionId, position))
  }

  return (
    <div className="space-y-4">
      <Toolbar
        snapshot={snapshot}
        canManage={canManage}
        view={view}
        setView={setView}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        selectedProject={selectedProject}
        onNewTask={() => setModal('task')}
        onNewSection={() => setModal('section')}
      />

      {selectedProject && <ProjectSummary stats={projectStats} showCompleted={showCompleted} />}

      {message && (
        <div
          className="rounded-lg px-4 py-2 text-sm"
          style={message.type === 'success'
            ? { color: 'hsl(160 84% 55%)', background: 'hsl(160 84% 39% / 0.12)', border: '1px solid hsl(160 84% 39% / 0.25)' }
            : { color: 'hsl(0 72% 65%)', background: 'hsl(0 72% 45% / 0.12)', border: '1px solid hsl(0 72% 45% / 0.25)' }}
        >
          {message.text}
        </div>
      )}

      {!selectedProject ? (
        <PanelEmpty text="Projeto nao encontrado." />
      ) : view === 'list' ? (
        <TaskList
          tasks={visibleTasks}
          users={snapshot.users}
          sections={snapshot.sections}
          canManage={canManage}
          currentUserId={snapshot.currentUserId}
          onSelect={setSelectedTaskId}
          onStatus={(task, status) => runAction(() => updateTask({ taskId: task.id, status }))}
          onDelete={(task) => {
            if (!confirm(`Apagar "${task.title}"? ${task.subtasks.length > 0 ? 'As subtarefas tambem serao apagadas.' : ''}`)) return
            runAction(() => deleteTask(task.id))
          }}
        />
      ) : (
        <DndContext onDragEnd={handleDragEnd}>
          <TaskBoard
            tasks={visibleTasks}
            users={snapshot.users}
            sections={projectSections}
            canManage={canManage}
            currentUserId={snapshot.currentUserId}
            onSelect={setSelectedTaskId}
            onDeleteSection={(sectionId) => {
              if (!confirm('Apagar esta secao? Ela precisa estar vazia.')) return
              runAction(() => deleteTaskSection(sectionId))
            }}
            onDeleteTask={(task) => {
              if (!confirm(`Apagar "${task.title}"? ${task.subtasks.length > 0 ? 'As subtarefas tambem serao apagadas.' : ''}`)) return
              runAction(() => deleteTask(task.id))
            }}
          />
        </DndContext>
      )}

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          users={snapshot.users}
          canManage={canManage}
          currentUserId={snapshot.currentUserId}
          sections={projectSections}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={(input) => runAction(() => updateTask({ taskId: selectedTask.id, ...input }))}
          onComment={(body) => runAction(() => addTaskComment(selectedTask.id, body))}
          onDelete={() => {
            if (!confirm(`Apagar "${selectedTask.title}"? ${selectedTask.subtasks.length > 0 ? 'As subtarefas tambem serao apagadas.' : ''}`)) return
            runAction(() => deleteTask(selectedTask.id), () => setSelectedTaskId(null))
          }}
          onDeleteSubtask={(subtask) => {
            if (!confirm(`Apagar subtarefa "${subtask.title}"?`)) return
            runAction(() => deleteTask(subtask.id))
          }}
          onReminder={(input) => runAction(() => addTaskReminder({ taskId: selectedTask.id, kind: 'manual', ...input }))}
          onQuickReminders={() => runAction(() => quickCreateDueReminders(selectedTask.id))}
          onNewSubtask={() => {
            setNewSubtaskParentId(selectedTask.id)
            setModal('task')
          }}
        />
      )}

      {modal === 'section' && selectedProject && (
        <SectionModal
          project={selectedProject}
          sections={projectSections}
          onClose={() => setModal(null)}
          onSubmit={(name) => runAction(() => createTaskSection({ projectId: selectedProject.id, name }), () => setModal(null))}
          onDelete={(sectionId) => {
            if (!confirm('Apagar esta secao? Ela precisa estar vazia.')) return
            runAction(() => deleteTaskSection(sectionId), () => setModal(null))
          }}
          pending={isPending}
        />
      )}

      {modal === 'task' && selectedProject && (
        <TaskModal
          project={selectedProject}
          sections={projectSections}
          users={snapshot.users}
          parentTask={newSubtaskParentId ? flatTasks.find((task) => task.id === newSubtaskParentId) ?? null : null}
          onClose={() => {
            setModal(null)
            setNewSubtaskParentId(null)
          }}
          onSubmit={(input) => runAction(() => createTask(input), () => {
            setModal(null)
            setNewSubtaskParentId(null)
          })}
          pending={isPending}
        />
      )}
    </div>
  )
}

function Toolbar(props: {
  snapshot: TasksSnapshot
  canManage: boolean
  view: ViewMode
  setView: (value: ViewMode) => void
  search: string
  setSearch: (value: string) => void
  statusFilter: 'all' | TaskStatus
  setStatusFilter: (value: 'all' | TaskStatus) => void
  assigneeFilter: string
  setAssigneeFilter: (value: string) => void
  showCompleted: boolean
  setShowCompleted: (value: boolean) => void
  selectedProject: TaskProject | null
  onNewTask: () => void
  onNewSection: () => void
}) {
  const hasProject = Boolean(props.selectedProject)

  return (
    <div className="space-y-3 rounded-xl p-4" style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {props.selectedProject && (
            <div className="flex min-w-0 items-center gap-3">
              <LinkButton href="/tarefas" label="Projetos" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{props.selectedProject.name}</p>
                <p className="text-xs text-gray-500">{props.selectedProject.members.length} participante(s) no projeto</p>
              </div>
            </div>
          )}
        </div>

        <div />
      </div>

      {hasProject && (
        <div className="flex flex-col gap-3 border-t pt-3 xl:flex-row xl:items-center xl:justify-between" style={{ borderColor: 'hsl(216 32% 15%)' }}>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-lg border px-3" style={{ borderColor: 'hsl(216 32% 18%)', background: 'hsl(220 36% 10%)' }}>
              <Search className="h-4 w-4" style={{ color: 'hsl(215 18% 45%)' }} />
              <input
                value={props.search}
                onChange={(event) => props.setSearch(event.target.value)}
                placeholder="Buscar tarefas neste projeto"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: 'hsl(213 31% 92%)' }}
              />
            </div>

            <select value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value as 'all' | TaskStatus)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={selectStyle}>
              <option value="all">Todos os status</option>
              {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>

            <select value={props.assigneeFilter} onChange={(event) => props.setAssigneeFilter(event.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={selectStyle}>
              <option value="all">Todos designados</option>
              {props.snapshot.users.map((user) => <option key={user.id} value={user.id}>{shortEmail(user.email)}</option>)}
            </select>

            <button
              type="button"
              onClick={() => props.setShowCompleted(!props.showCompleted)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
              style={props.showCompleted ? buttonPrimaryStyle : buttonSecondaryStyle}
              title={props.showCompleted ? 'Ocultar concluidas' : 'Mostrar concluidas'}
            >
              {props.showCompleted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {props.showCompleted ? 'Ocultar concluidas' : 'Mostrar concluidas'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedButton active={props.view === 'list'} onClick={() => props.setView('list')} icon={LayoutList} label="Lista" />
            <SegmentedButton active={props.view === 'board'} onClick={() => props.setView('board')} icon={Columns3} label="Cards" />

            {props.canManage && (
              <>
                <button onClick={props.onNewSection} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium" style={buttonSecondaryStyle}>
                  <Columns3 className="h-4 w-4" />
                  Secao
                </button>
                <button onClick={props.onNewTask} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold" style={buttonPrimaryStyle}>
                  <Plus className="h-4 w-4" />
                  Nova tarefa
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskList(props: {
  tasks: TaskItem[]
  users: TasksSnapshot['users']
  sections: TaskSection[]
  canManage: boolean
  currentUserId: string
  onSelect: (taskId: string) => void
  onStatus: (task: TaskItem, status: TaskStatus) => void
  onDelete: (task: TaskItem) => void
}) {
  if (props.tasks.length === 0) {
    return <PanelEmpty text="Nenhuma tarefa encontrada com os filtros atuais." />
  }

  return (
    <div className="overflow-x-auto rounded-xl" style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}>
      <table className="w-full min-w-[920px] text-sm">
        <thead style={{ background: 'hsl(220 36% 10%)' }}>
          <tr>
            <Th>Tarefa</Th>
            <Th>Responsaveis</Th>
            <Th>Prazo</Th>
            <Th>Prioridade</Th>
            <Th>Status</Th>
            <Th>Comentarios</Th>
            <Th>Acoes</Th>
          </tr>
        </thead>
        <tbody>
          {props.tasks.map((task) => (
            <TaskRow key={task.id} task={task} users={props.users} sections={props.sections} canManage={props.canManage} currentUserId={props.currentUserId} onSelect={props.onSelect} onStatus={props.onStatus} onDelete={props.onDelete} depth={0} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskRow(props: {
  task: TaskItem
  users: TasksSnapshot['users']
  sections: TaskSection[]
  canManage: boolean
  currentUserId: string
  depth: number
  onSelect: (taskId: string) => void
  onStatus: (task: TaskItem, status: TaskStatus) => void
  onDelete: (task: TaskItem) => void
}) {
  const StatusIcon = props.task.status === 'done' ? CheckCircle2 : Circle
  const completed = props.task.status === 'done'
  const canDelete = props.canManage || props.task.created_by === props.currentUserId
  return (
    <>
      <tr className={cn('border-t transition-colors hover:bg-gray-50', completed && 'opacity-55')} style={{ borderColor: 'hsl(216 30% 14%)' }}>
        <td className="px-5 py-4">
          <button className="flex min-w-0 items-start gap-3 text-left" onClick={() => props.onSelect(props.task.id)} style={{ paddingLeft: props.depth * 18 }}>
            <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: statusMeta[props.task.status].color }} />
            <span>
              <span className={cn('block font-semibold text-gray-900', completed && 'line-through')}>{props.task.title}</span>
              {props.task.description && <span className="mt-1 block max-w-xl truncate text-xs text-gray-500">{props.task.description}</span>}
              {props.task.subtasks.length > 0 && <span className="mt-1 block text-xs text-gray-500">{props.task.subtasks.length} subtarefa(s)</span>}
            </span>
          </button>
        </td>
        <td className="px-5 py-4">{assigneeChips(props.task.assignees, props.users)}</td>
        <td className="px-5 py-4">
          <DueDate task={props.task} />
        </td>
        <td className="px-5 py-4"><PriorityBadge priority={props.task.priority} /></td>
        <td className="px-5 py-4">
          <select value={props.task.status} onChange={(event) => props.onStatus(props.task, event.target.value as TaskStatus)} className="rounded-md border px-2 py-1 text-xs" style={selectStyle}>
            {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </td>
        <td className="px-5 py-4 text-gray-500">{props.task.comments.length}</td>
        <td className="px-5 py-4">
          {canDelete && (
            <button onClick={() => props.onDelete(props.task)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-500/10" title="Apagar tarefa">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
      {props.task.subtasks.map((subtask) => (
        <TaskRow key={subtask.id} {...props} task={subtask} depth={1} />
      ))}
    </>
  )
}

function TaskBoard(props: {
  tasks: TaskItem[]
  users: TasksSnapshot['users']
  sections: TaskSection[]
  canManage: boolean
  currentUserId: string
  onSelect: (taskId: string) => void
  onDeleteSection: (sectionId: string) => void
  onDeleteTask: (task: TaskItem) => void
}) {
  const sections = props.sections.length > 0 ? props.sections : [{ id: 'no-section', project_id: '', name: 'Sem secao', position: 0 }]
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sections.map((section) => (
        <BoardColumn
          key={section.id}
          section={section}
          tasks={props.tasks.filter((task) => (task.section_id ?? 'no-section') === section.id)}
          users={props.users}
          canManage={props.canManage}
          currentUserId={props.currentUserId}
          onSelect={props.onSelect}
          onDeleteSection={props.onDeleteSection}
          onDeleteTask={props.onDeleteTask}
        />
      ))}
    </div>
  )
}

function BoardColumn(props: {
  section: TaskSection
  tasks: TaskItem[]
  users: TasksSnapshot['users']
  canManage: boolean
  currentUserId: string
  onSelect: (taskId: string) => void
  onDeleteSection: (sectionId: string) => void
  onDeleteTask: (task: TaskItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.section.id })
  return (
    <div ref={setNodeRef} className="min-h-[420px] w-[320px] shrink-0 rounded-xl p-3" style={{ background: isOver ? 'hsl(160 84% 39% / 0.08)' : 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">{props.section.name}</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ color: 'hsl(215 18% 55%)', background: 'hsl(220 36% 12%)' }}>{props.tasks.length}</span>
          {props.canManage && props.section.id !== 'no-section' && (
            <button
              onClick={() => props.onDeleteSection(props.section.id)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10"
              title="Apagar secao"
            >
              Apagar
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {props.tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} users={props.users} canManage={props.canManage} currentUserId={props.currentUserId} onSelect={props.onSelect} onDelete={props.onDeleteTask} />
        ))}
      </div>
    </div>
  )
}

function DraggableTaskCard({ task, users, canManage, currentUserId, onSelect, onDelete }: { task: TaskItem; users: TasksSnapshot['users']; canManage: boolean; currentUserId: string; onSelect: (taskId: string) => void; onDelete: (task: TaskItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const completed = task.status === 'done'
  const canDelete = canManage || task.created_by === currentUserId
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('rounded-lg border p-3 shadow-sm transition-opacity', isDragging && 'opacity-60', completed && 'opacity-55')}
    >
      <div {...listeners} {...attributes} className="cursor-grab">
        <div className="mb-2 flex items-start justify-between gap-2">
          <button onClick={() => onSelect(task.id)} className={cn('text-left text-sm font-semibold text-gray-900', completed && 'line-through')}>{task.title}</button>
          <PriorityBadge priority={task.priority} compact />
        </div>
        {task.description && <p className="mb-3 line-clamp-2 text-xs text-gray-500">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <DueDate task={task} compact />
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{task.comments.length}</span>
          {task.subtasks.length > 0 && <span>{task.subtasks.filter((item) => item.status === 'done').length}/{task.subtasks.length}</span>}
        </div>
        <div className="mt-3">{assigneeChips(task.assignees, users)}</div>
      </div>
      {canDelete && (
        <button onClick={() => onDelete(task)} className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-500/10" title="Apagar tarefa">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function TaskDrawer(props: {
  task: TaskItem
  users: TasksSnapshot['users']
  canManage: boolean
  currentUserId: string
  sections: TaskSection[]
  onClose: () => void
  onUpdate: (input: { title?: string; description?: string | null; dueAt?: string | null; priority?: TaskPriority; status?: TaskStatus; sectionId?: string | null; assigneeIds?: string[] }) => void
  onComment: (body: string) => void
  onDelete: () => void
  onDeleteSubtask: (subtask: TaskItem) => void
  onReminder: (input: { remindAt: string; userId?: string | null; kind?: 'manual' | 'due_at' | 'one_day_before' | 'three_days_before' }) => void
  onQuickReminders: () => void
  onNewSubtask: () => void
}) {
  const [title, setTitle] = useState(props.task.title)
  const [description, setDescription] = useState(props.task.description ?? '')
  const [comment, setComment] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const canDeleteTask = props.canManage || props.task.created_by === props.currentUserId

  useEffect(() => {
    setTitle(props.task.title)
    setDescription(props.task.description ?? '')
  }, [props.task.id, props.task.title, props.task.description])

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l shadow-2xl" style={{ background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}>
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'hsl(var(--border))' }}>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Detalhe da tarefa</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">{props.task.title}</h2>
        </div>
        <button onClick={props.onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none" style={inputStyle} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Descricao" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={inputStyle} />
          <div className="flex flex-wrap gap-2">
            <select value={props.task.status} onChange={(event) => props.onUpdate({ status: event.target.value as TaskStatus })} className="h-9 rounded-lg border px-2 text-sm" style={selectStyle}>
              {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            <select value={props.task.priority} onChange={(event) => props.onUpdate({ priority: event.target.value as TaskPriority })} className="h-9 rounded-lg border px-2 text-sm" style={selectStyle}>
              {Object.entries(priorityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            <input type="datetime-local" defaultValue={toDateTimeLocal(props.task.due_at)} onBlur={(event) => props.onUpdate({ dueAt: event.target.value })} className="h-9 rounded-lg border px-2 text-sm" style={inputStyle} />
            <select value={props.task.section_id ?? ''} onChange={(event) => props.onUpdate({ sectionId: event.target.value || null })} className="h-9 rounded-lg border px-2 text-sm" style={selectStyle}>
              <option value="">Sem secao</option>
              {props.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </div>
          {props.canManage && (
            <UserMultiSelect users={props.users} selected={props.task.assignees} onChange={(ids) => props.onUpdate({ assigneeIds: ids })} label="Designados para esta tarefa" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button disabled={!title.trim()} onClick={() => props.onUpdate({ title, description })} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50" style={buttonPrimaryStyle}>
              <Send className="h-4 w-4" />
              Salvar texto
            </button>
            {canDeleteTask && (
              <button onClick={props.onDelete} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10" style={{ borderColor: 'hsl(var(--border))' }}>
                <Trash2 className="h-4 w-4" />
                Apagar tarefa
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Subtarefas</h3>
            {!props.task.parent_task_id && <button onClick={props.onNewSubtask} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'hsl(var(--primary))' }}><Plus className="h-3 w-3" />Adicionar</button>}
          </div>
          <div className="space-y-2">
            {props.task.subtasks.length === 0 ? <p className="text-xs text-gray-500">Nenhuma subtarefa.</p> : props.task.subtasks.map((subtask) => (
              <div key={subtask.id} className={cn('flex items-center justify-between rounded-lg px-3 py-2', subtask.status === 'done' && 'opacity-55')} style={{ background: 'hsl(var(--muted) / 0.45)' }}>
                <span className={cn('text-sm text-gray-900', subtask.status === 'done' && 'line-through')}>{subtask.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: statusMeta[subtask.status].color }}>{statusMeta[subtask.status].label}</span>
                  {(props.canManage || subtask.created_by === props.currentUserId) && (
                    <button onClick={() => props.onDeleteSubtask(subtask)} className="rounded-md p-1 text-red-400 hover:bg-red-500/10" title="Apagar subtarefa">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}>
          <h3 className="mb-3 text-sm font-bold text-gray-900">Lembretes</h3>
          <div className="flex flex-wrap gap-2">
            <input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} className="h-9 rounded-lg border px-2 text-sm" style={inputStyle} />
            <button onClick={() => remindAt && props.onReminder({ remindAt })} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm" style={buttonSecondaryStyle}><CalendarClock className="h-4 w-4" />Criar</button>
            <button onClick={props.onQuickReminders} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm" style={buttonSecondaryStyle}><Clock className="h-4 w-4" />Rapidos</button>
          </div>
          <div className="mt-3 space-y-1">
            {props.task.reminders.length === 0 ? <p className="text-xs text-gray-500">Nenhum lembrete.</p> : props.task.reminders.map((reminder) => (
              <p key={reminder.id} className="text-xs text-gray-500">{formatDateShort(reminder.remind_at)} {reminder.delivered_at ? '(enviado)' : ''}</p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}>
          <h3 className="mb-3 text-sm font-bold text-gray-900">Comentarios</h3>
          <div className="space-y-3">
            {props.task.comments.map((item) => (
              <div key={item.id} className="rounded-lg p-3" style={{ background: 'hsl(var(--muted) / 0.45)' }}>
                <p className="text-sm text-gray-900">{item.body}</p>
                <p className="mt-1 text-xs text-gray-500">{userLabel(item.author_id, props.users)} - {formatDateShort(item.created_at)}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escrever comentario" className="h-10 flex-1 rounded-lg border px-3 text-sm" style={inputStyle} />
              <button disabled={!comment.trim()} onClick={() => { props.onComment(comment); setComment('') }} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold disabled:opacity-50" style={buttonPrimaryStyle}><Send className="h-4 w-4" />Enviar</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionModal(props: {
  project: TaskProject
  sections: TaskSection[]
  pending: boolean
  onClose: () => void
  onSubmit: (name: string) => void
  onDelete: (sectionId: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <ModalShell title={`Nova secao em ${props.project.name}`} onClose={props.onClose}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da secao" className="mb-4 w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
      {props.sections.length > 0 && (
        <div className="mb-4 rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Secoes existentes</p>
          <div className="space-y-1">
            {props.sections.map((section) => (
              <div key={section.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-gray-100">
                <span className="text-sm font-semibold text-gray-900">{section.name}</span>
                <button onClick={() => props.onDelete(section.id)} className="text-xs font-semibold text-red-400 hover:text-red-300">
                  Apagar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <ModalActions pending={props.pending} disabled={!name.trim()} onClose={props.onClose} onSubmit={() => props.onSubmit(name)} submitLabel="Criar secao" />
    </ModalShell>
  )
}

function TaskModal(props: {
  project: TaskProject
  sections: TaskSection[]
  users: TasksSnapshot['users']
  parentTask: TaskItem | null
  pending: boolean
  onClose: () => void
  onSubmit: (input: { projectId: string; sectionId?: string | null; parentTaskId?: string | null; title: string; description?: string; dueAt?: string; priority: TaskPriority; assigneeIds: string[] }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('p4')
  const [sectionId, setSectionId] = useState(props.parentTask?.section_id ?? props.sections[0]?.id ?? '')
  const [assigneeIds, setAssigneeIds] = useState<string[]>(props.parentTask?.assignees ?? [])
  return (
    <ModalShell title={props.parentTask ? `Subtarefa de ${props.parentTask.title}` : `Nova tarefa em ${props.project.name}`} onClose={props.onClose}>
      <div className="space-y-4">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titulo" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <div className="grid gap-3 sm:grid-cols-3">
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
            {Object.entries(priorityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
            <option value="">Sem secao</option>
            {props.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        </div>
        <UserMultiSelect users={props.users} selected={assigneeIds} onChange={setAssigneeIds} label="Designados para esta tarefa" />
        <ModalActions pending={props.pending} disabled={!title.trim()} onClose={props.onClose} onSubmit={() => props.onSubmit({ projectId: props.project.id, sectionId: sectionId || null, parentTaskId: props.parentTask?.id ?? null, title, description, dueAt, priority, assigneeIds })} submitLabel="Criar tarefa" />
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl p-5 shadow-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ pending, disabled = false, onClose, onSubmit, submitLabel }: { pending: boolean; disabled?: boolean; onClose: () => void; onSubmit: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={buttonSecondaryStyle}>Cancelar</button>
      <button onClick={onSubmit} disabled={pending || disabled} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={buttonPrimaryStyle}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  )
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed px-8 py-16 text-center text-sm text-gray-500" style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(216 32% 18%)' }}>{text}</div>
}

function ProjectSummary({ stats, showCompleted }: { stats: { total: number; open: number; overdue: number; done: number }; showCompleted: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Em aberto" value={stats.open} />
      <SummaryCard label="Atrasadas" value={stats.overdue} tone={stats.overdue > 0 ? 'hsl(0 72% 62%)' : undefined} icon={stats.overdue > 0 ? AlertTriangle : undefined} />
      <SummaryCard label={showCompleted ? 'Concluidas visiveis' : 'Concluidas ocultas'} value={stats.done} />
      <SummaryCard label="Total no projeto" value={stats.total} />
    </div>
  )
}

function SummaryCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone?: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(216 32% 15%)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{label}</p>
        {Icon && <Icon className="h-4 w-4" style={{ color: tone }} />}
      </div>
      <p className="mt-2 font-data text-2xl" style={{ color: tone ?? 'hsl(213 31% 92%)' }}>{value}</p>
    </div>
  )
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-100" style={{ borderColor: 'hsl(216 32% 18%)' }}>
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}

function SegmentedButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium" style={active ? buttonPrimaryStyle : buttonSecondaryStyle}><Icon className="h-4 w-4" />{label}</button>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{children}</th>
}

function PriorityBadge({ priority, compact = false }: { priority: TaskPriority; compact?: boolean }) {
  const meta = priorityMeta[priority]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: meta.color, background: meta.color.replace(')', ' / 0.12)'), border: `1px solid ${meta.color.replace(')', ' / 0.25)')}` }}>
      <Flag className="h-3 w-3" />
      {!compact && meta.label}
    </span>
  )
}

function assigneeChips(ids: string[], users: TasksSnapshot['users']) {
  const visible = ids.slice(0, 3)
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((id) => <span key={id} className="rounded-full px-2 py-0.5 text-xs" style={{ color: 'hsl(160 84% 55%)', background: 'hsl(160 84% 39% / 0.12)' }}>{userLabel(id, users)}</span>)}
      {ids.length > visible.length && <span className="text-xs text-gray-500">+{ids.length - visible.length}</span>}
    </div>
  )
}

function DueDate({ task, compact = false }: { task: TaskItem; compact?: boolean }) {
  const overdue = isOverdue(task)
  return (
    <span className={cn('inline-flex items-center gap-1', overdue ? 'font-semibold text-red-400' : 'text-gray-500')}>
      {overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      {compact && !task.due_at ? 'Sem prazo' : formatDateShort(task.due_at)}
    </span>
  )
}

function userLabel(id: string, users: TasksSnapshot['users']) {
  return shortEmail(users.find((user) => user.id === id)?.email ?? id)
}

function shortEmail(email: string) {
  return email.split('@')[0]
}

function flatten(tasks: TaskItem[]): TaskItem[] {
  return tasks.flatMap((task) => [task, ...task.subtasks])
}

function formatDateShort(value: string | null) {
  if (!value) return 'Sem prazo'
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function isOverdue(task: TaskItem) {
  return Boolean(task.due_at && task.status !== 'done' && task.status !== 'canceled' && new Date(task.due_at).getTime() < Date.now())
}

function toDateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const inputStyle = {
  background: 'hsl(220 36% 10%)',
  color: 'hsl(213 31% 92%)',
  borderColor: 'hsl(216 32% 18%)',
} as React.CSSProperties

const selectStyle = {
  ...inputStyle,
} as React.CSSProperties

const buttonPrimaryStyle = {
  color: 'hsl(220 26% 8%)',
  background: 'hsl(160 84% 39%)',
} as React.CSSProperties

const buttonSecondaryStyle = {
  color: 'hsl(213 31% 92%)',
  background: 'hsl(220 38% 12%)',
  borderColor: 'hsl(216 32% 18%)',
} as React.CSSProperties
