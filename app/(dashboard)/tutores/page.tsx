import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TutoresSyncButton } from '@/components/tutores-sync-button'
import { TutoresTable } from '@/components/tutores-table'
import { GraduationCap } from 'lucide-react'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function TutoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tutores, error } = await adminClient
    .from('tutores')
    .select('*')
    .order('lastaccess', { ascending: false })

  const now = Math.floor(Date.now() / 1000)
  const counts = {
    all: tutores?.length ?? 0,
    active: tutores?.filter(t => t.lastaccess && (now - t.lastaccess) < 7 * 86400).length ?? 0,
    recent: tutores?.filter(t => t.lastaccess && (now - t.lastaccess) >= 7 * 86400 && (now - t.lastaccess) < 30 * 86400).length ?? 0,
    inactive: tutores?.filter(t => !t.lastaccess || (now - t.lastaccess) >= 30 * 86400).length ?? 0,
  }

  const lastSync = tutores?.[0]?.last_synced_at
    ? new Date(tutores[0].last_synced_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="app-content space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'hsl(var(--primary) / 0.12)',
              border: '1px solid hsl(var(--primary) / 0.25)',
            }}
          >
            <GraduationCap className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Tutores e Professores
            </h1>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {counts.all > 0
                ? `${counts.all} registros${lastSync ? ` · última sync ${lastSync}` : ''}`
                : 'Clique em "Sincronizar Moodle" para importar'}
            </p>
          </div>
        </div>
        <TutoresSyncButton />
      </div>

      {/* Summary cards */}
      {counts.all > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: counts.all, badgeText: '--badge-course-text' },
            { label: 'Ativos (7d)', value: counts.active, badgeText: '--badge-active-text' },
            { label: 'Recentes (30d)', value: counts.recent, badgeText: '--badge-recent-text' },
            { label: 'Inativos (+30d)', value: counts.inactive, badgeText: '--badge-inactive-text' },
          ].map(c => (
            <div
              key={c.label}
              className="rounded-lg p-3"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            >
              <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: `hsl(var(${c.badgeText}))` }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: 'hsl(var(--badge-inactive-bg))', border: '1px solid hsl(var(--destructive) / 0.4)', color: 'hsl(var(--badge-inactive-text))' }}
        >
          Erro ao carregar: {error.message}
        </div>
      )}

      {!error && counts.all === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: 'hsl(var(--card))', border: '1px dashed hsl(var(--border))' }}
        >
          <GraduationCap size={36} style={{ color: 'hsl(var(--fg4))', marginBottom: '12px' }} />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--fg2))' }}>Nenhum tutor sincronizado.</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--fg3))' }}>Clique em "Sincronizar Moodle" para importar.</p>
        </div>
      ) : (
        <TutoresTable tutores={tutores ?? []} />
      )}
    </div>
  )
}
