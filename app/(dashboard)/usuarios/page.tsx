import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ShieldCheck } from 'lucide-react'
import UserTable from '@/components/user-table'
import UserForm from '@/components/user-form'

export const revalidate = 0

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const { data } = await adminClient.auth.admin.listUsers()
  const users = data?.users ?? []

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Usuários do Sistema</h1>
          </div>
          <p className="text-sm text-gray-500">
            Gerencie quem tem acesso ao painel do SISTEMAMARA.
          </p>
        </div>
        <UserForm />
      </div>

      <UserTable users={users} currentUserId={currentUser?.id ?? ''} />
    </div>
  )
}
