import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { Sidebar } from '@/components/sidebar'

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
