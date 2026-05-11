import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { Sidebar } from '@/components/sidebar'
import { extractRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!hasSupabasePublicEnv()) {
    redirect('/login')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = extractRole(user)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} email={user.email} />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
