import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { MessageSquare, Users, Send, FileText, RefreshCw } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <>
        <div className="app-header">
          <div>
            <h1>Dashboard</h1>
            <p className="app-subtitle">Visão geral do sistema MARA</p>
          </div>
        </div>
        <div className="app-content">
          <div
            className="rounded-xl px-5 py-4"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            <p className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>
              Configuração do Supabase ausente
            </p>
            <p className="mt-2 text-sm" style={{ color: 'hsl(var(--fg2))' }}>
              O dashboard não conseguiu ler as variáveis do Supabase no runtime atual da VPS.
              Revalide o container com <code>docker exec ... env | grep SUPABASE</code>.
            </p>
          </div>
        </div>
      </>
    )
  }

  let conversationsCount = 0
  let studentsCount = 0
  let campaignsCount = 0
  let promptsCount = 0

  try {
    const supabase = await createClient()

    const [conversationsResult, studentsResult, campaignsResult, promptsResult] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('blast_campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('prompt_sections').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ])

    conversationsCount = conversationsResult.count ?? 0
    studentsCount      = studentsResult.count ?? 0
    campaignsCount     = campaignsResult.count ?? 0
    promptsCount       = promptsResult.count ?? 0
  } catch (error) {
    console.error('[dashboard] Falha ao carregar métricas do Supabase:', error)
  }

  const cards = [
    { label: 'Conversas Ativas',       value: conversationsCount, icon: MessageSquare, accent: 'hsl(var(--accent-blue))',   href: '/conversas' },
    { label: 'Alunos Sincronizados',   value: studentsCount,      icon: Users,         accent: 'hsl(var(--accent-green))',  href: '/alunos' },
    { label: 'Campanhas de Disparo',   value: campaignsCount,     icon: Send,          accent: 'hsl(var(--accent-amber))',  href: '/disparos' },
    { label: 'Blocos de Prompt Ativos',value: promptsCount,       icon: FileText,      accent: 'hsl(var(--accent-violet))', href: '/prompt' },
  ]

  return (
    <>
      {/* Header */}
      <div className="app-header">
        <div>
          <h1>Dashboard</h1>
          <p className="app-subtitle">Visão geral do sistema MARA</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="status-chip">ONLINE</span>
          <a
            href="/dashboard"
            className="ds-btn ds-btn--secondary"
            style={{ fontSize: '13px' }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="app-content animate-fade-up">

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, i) => {
            const Icon = card.icon
            return (
              <a
                key={card.href}
                href={card.href}
                className="group rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 stat-card"
                style={{
                  background: 'hsl(220 40% 8%)',
                  border: '1px solid hsl(216 32% 15%)',
                  borderTop: `2px solid ${card.accent}`,
                  animationDelay: `${i * 60}ms`,
                  animationFillMode: 'both',
                }}
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `color-mix(in srgb, ${card.accent} 12%, transparent)`, color: card.accent }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'hsl(var(--fg3))', fontSize: '1rem', lineHeight: 1 }}
                  >→</span>
                </div>
                <p className="font-data mb-1" style={{ fontSize: 'var(--type-data)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--fg1))' }}>
                  {(card.value ?? 0).toLocaleString('pt-BR')}
                </p>
                <p style={{ fontSize: 'var(--type-small)', color: 'hsl(var(--fg3))' }}>
                  {card.label}
                </p>
              </a>
            )
          })}
        </div>

        {/* System status */}
        <div
          className="mt-4 rounded-xl px-5 py-4 flex items-center justify-between"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ background: 'hsl(var(--accent-green))' }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: 'hsl(var(--accent-green))' }}
              />
            </div>
            <span style={{ fontSize: '13px', color: 'hsl(var(--fg2))' }}>
              MARA está ativa e recebendo mensagens
            </span>
          </div>
          <span className="status-chip">ONLINE</span>
        </div>

      </div>
    </>
  )
}
