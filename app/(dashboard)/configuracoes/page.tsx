import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import ProfileSettings from '@/components/profile-settings'
import { extractRole } from '@/lib/roles'

export const revalidate = 0

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = extractRole(user)
  const meta = user.user_metadata ?? {}

  return (
    <div className="app-content">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="h-6 w-6" style={{ color: 'hsl(var(--primary))' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Configurações
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Gerencie seus dados de perfil e preferências de conta.
        </p>
      </div>

      <ProfileSettings
        user={{
          id: user.id,
          email: user.email ?? '',
          fullName: typeof meta.full_name === 'string' ? meta.full_name : '',
          phone: typeof meta.phone === 'string' ? meta.phone : '',
          avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
          role,
        }}
      />
    </div>
  )
}
