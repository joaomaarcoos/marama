import { redirect } from 'next/navigation'
import { FolderKanban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'
import { getTasksSnapshot } from '@/lib/tasks'
import TasksProjectsHome from '@/components/tasks-projects-home'

export const dynamic = 'force-dynamic'

export default async function TarefasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = extractRole(user)
  const snapshot = await getTasksSnapshot(user.id, role)

  return (
    <div className="app-content animate-fade-up">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FolderKanban className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Projetos de tarefas</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">
            Entre em um projeto para visualizar e organizar suas tarefas em lista ou cards.
          </p>
        </div>
      </div>

      <TasksProjectsHome initialSnapshot={snapshot} />
    </div>
  )
}
