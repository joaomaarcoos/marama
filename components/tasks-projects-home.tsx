'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, FolderKanban, Loader2, Plus, Trash2, Users, X } from 'lucide-react'
import { createTaskProject, deleteTaskProject, importTasksCsv } from '@/app/(dashboard)/tarefas/actions'
import { cn } from '@/lib/utils'
import type { TasksSnapshot } from '@/lib/tasks'
import { UserMultiSelect } from '@/components/user-multi-select'

const projectColors = [
  'hsl(160 84% 39%)',
  'hsl(217 91% 60%)',
  'hsl(38 92% 50%)',
  'hsl(262 80% 65%)',
  'hsl(330 81% 60%)',
  'hsl(190 90% 50%)',
]

export default function TasksProjectsHome({ initialSnapshot }: { initialSnapshot: TasksSnapshot }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState<'project' | 'import' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const canManage = initialSnapshot.currentRole === 'admin' || initialSnapshot.currentRole === 'gerente'

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  function submitProject(input: { name: string; description?: string; color?: string; memberIds: string[] }) {
    startTransition(async () => {
      const result = await createTaskProject(input)
      if (result.error) flash('error', result.error)
      else {
        flash('success', result.success ?? 'Projeto criado.')
        setModal(null)
        router.refresh()
      }
    })
  }

  function submitImport(formData: FormData) {
    startTransition(async () => {
      const result = await importTasksCsv(formData)
      if (result.error) flash('error', result.error)
      else {
        flash('success', result.success ?? 'Importacao concluida.')
        setModal(null)
        router.refresh()
      }
    })
  }

  function submitDeleteProject(projectId: string, projectName: string) {
    const confirmed = confirm(`Apagar o projeto "${projectName}"? Isso tambem apaga secoes, tarefas, comentarios e lembretes desse projeto.`)
    if (!confirmed) return

    startTransition(async () => {
      const result = await deleteTaskProject(projectId)
      if (result.error) flash('error', result.error)
      else {
        flash('success', result.success ?? 'Projeto apagado.')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}>
        <div>
          <p className="text-sm font-bold text-gray-900">Projetos</p>
          <p className="mt-1 text-xs text-gray-500">{initialSnapshot.projects.length} projeto(s) visivel(is)</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal('import')} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium" style={buttonSecondaryStyle}>
              <FileUp className="h-4 w-4" />
              Importar CSV
            </button>
            <button onClick={() => setModal('project')} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold" style={buttonPrimaryStyle}>
              <Plus className="h-4 w-4" />
              Novo projeto
            </button>
          </div>
        )}
      </div>

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

      {initialSnapshot.projects.length === 0 ? (
        <div className="rounded-xl border border-dashed px-8 py-16 text-center" style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(216 32% 18%)' }}>
          <FolderKanban className="mx-auto h-8 w-8 text-gray-500" />
          <p className="mt-4 text-sm font-semibold text-gray-900">Nenhum projeto de tarefas disponivel.</p>
          <p className="mt-2 text-sm text-gray-500">Crie um projeto para depois adicionar tarefas, secoes e responsaveis.</p>
          {canManage && (
            <button onClick={() => setModal('project')} className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold" style={buttonPrimaryStyle}>
              <Plus className="h-4 w-4" />
              Criar projeto
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {initialSnapshot.projects.map((project) => {
            const tasks = initialSnapshot.tasks.filter((task) => task.project_id === project.id)
            const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length
            const overdue = tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now() && task.status !== 'done').length

            return (
              <div
                key={project.id}
                className="group rounded-xl border p-5 transition-transform hover:-translate-y-0.5"
                style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(216 32% 15%)', borderTop: `3px solid ${project.color}` }}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <Link href={`/tarefas/${project.id}`} className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-bold text-gray-900">{project.name}</h2>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-500">{project.description || 'Sem descricao'}</p>
                  </Link>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ color: project.color, background: project.color.replace(')', ' / 0.12)') }}>
                    <FolderKanban className="h-5 w-5" />
                  </div>
                </div>

                <Link href={`/tarefas/${project.id}`} className="grid grid-cols-3 gap-2">
                  <Metric label="Abertas" value={openTasks} />
                  <Metric label="Atrasadas" value={overdue} tone={overdue > 0 ? 'hsl(0 72% 60%)' : undefined} />
                  <Metric label="Membros" value={project.members.length} icon="users" />
                </Link>

                <div className="mt-5 flex items-center justify-between text-xs text-gray-500">
                  <Link href={`/tarefas/${project.id}`} className="inline-flex items-center gap-1 font-medium text-gray-400 hover:text-gray-100">
                    Entrar no projeto
                    <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => submitDeleteProject(project.id, project.name)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Apagar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal === 'project' && (
        <ProjectModal
          users={initialSnapshot.users}
          currentUserId={initialSnapshot.currentUserId}
          pending={isPending}
          onClose={() => setModal(null)}
          onSubmit={submitProject}
        />
      )}

      {modal === 'import' && (
        <ImportModal
          fileInputRef={fileInputRef}
          pending={isPending}
          onClose={() => setModal(null)}
          onSubmit={submitImport}
        />
      )}
    </div>
  )
}

function Metric({ label, value, tone, icon }: { label: string; value: number; tone?: string; icon?: 'users' }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'hsl(220 36% 10%)' }}>
      <div className="flex items-center gap-1.5">
        {icon === 'users' && <Users className="h-3 w-3 text-gray-500" />}
        <p className="font-data text-xl" style={{ color: tone ?? 'hsl(213 31% 92%)' }}>{value}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  )
}

function ProjectModal(props: {
  users: TasksSnapshot['users']
  currentUserId: string
  pending: boolean
  onClose: () => void
  onSubmit: (input: { name: string; description?: string; color?: string; memberIds: string[] }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(projectColors[0])
  const [memberIds, setMemberIds] = useState<string[]>([props.currentUserId])

  return (
    <ModalShell title="Novo projeto" onClose={props.onClose}>
      <div className="space-y-4">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do projeto" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <div className="flex flex-wrap gap-2">{projectColors.map((item) => <button key={item} onClick={() => setColor(item)} className={cn('h-7 w-7 rounded-md border-2', color === item ? 'border-white' : 'border-transparent')} style={{ background: item }} />)}</div>
        <UserMultiSelect users={props.users} selected={memberIds} onChange={setMemberIds} label="Participantes do projeto" />
        <ModalActions pending={props.pending} disabled={!name.trim()} onClose={props.onClose} onSubmit={() => props.onSubmit({ name, description, color, memberIds })} submitLabel="Criar projeto" />
      </div>
    </ModalShell>
  )
}

function ImportModal(props: { fileInputRef: React.RefObject<HTMLInputElement>; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const template = 'projeto,secao,tarefa,descricao,prazo,prioridade,responsaveis,subtarefa_de,lembrete\r\nOperacao,A fazer,Conferir documentos,,2026-06-30 17:00,p2,usuario@email.com,,2026-06-29 09:00'

  function downloadTemplate() {
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_tarefas_mara.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ModalShell title="Importar tarefas" onClose={props.onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">A importacao pode criar projetos e secoes automaticamente.</p>
        <input ref={props.fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={buttonSecondaryStyle}><FileUp className="h-4 w-4" />Baixar modelo MARA</button>
        <ModalActions pending={props.pending} disabled={!file} onClose={props.onClose} onSubmit={() => { if (file) { const fd = new FormData(); fd.append('file', file); props.onSubmit(fd) } }} submitLabel="Importar CSV" />
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

const inputStyle = {
  background: 'hsl(220 36% 10%)',
  color: 'hsl(213 31% 92%)',
  borderColor: 'hsl(216 32% 18%)',
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
