import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { Sidebar } from '@/components/sidebar'
import { extractRole } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/admin'
import { SystemNotifications, type SystemNotification } from '@/components/system-notifications'

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
  let notifications: SystemNotification[] = []

  try {
    const systemResult = await adminClient
      .from('system_notifications')
      .select('id, module, type, title, message, href, is_read, created_at')
      .eq('recipient_id', user.id)
      .order('is_read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(40)

    notifications = (systemResult.data ?? []).map((item) => ({
      ...(item as SystemNotification),
      task_id: null,
      project_id: null,
    }))
  } catch {
    notifications = []
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} email={user.email} />
      <main className="app-main">
        <SystemNotifications notifications={notifications} />
        {children}
      </main>
    </div>
  )
}
