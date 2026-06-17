import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { getTasksSnapshot } from '@/lib/tasks'
import TasksWorkspace from '@/components/tasks-workspace'

export const dynamic = 'force-dynamic'

export default async function TarefasProjetoPage({
  params,
}: {
  params: { projectId: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = extractRole(user)
  const snapshot = await getTasksSnapshot(user.id, role)
  const project = snapshot.projects.find((item) => item.id === params.projectId)
  if (!project) notFound()

  return (
    <div className="app-content animate-fade-up">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/tarefas"
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Projetos
          </Link>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{project.name}</h1>
          </div>
          {project.description && (
            <p className="mt-2 max-w-3xl text-sm text-gray-500">{project.description}</p>
          )}
        </div>
      </div>

      <TasksWorkspace initialSnapshot={snapshot} projectId={project.id} />
    </div>
  )
}
