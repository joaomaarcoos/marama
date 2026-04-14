import { createClient } from '@/lib/supabase/server'
import { hasSupabasePublicEnv } from '@/lib/supabase/env'
import { MessageSquare, Users, Send, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <div className="animate-fade-up">
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: 'hsl(213 31% 91%)' }}
          >
            Configuracao do Supabase ausente
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            O dashboard nao conseguiu ler as variaveis do Supabase no runtime atual da VPS.
            Revalide o container com `docker exec ... env | grep SUPABASE`.
          </p>
        </div>
      </div>
    )
  }

  let conversationsCount = 0
  let studentsCount = 0
  let campaignsCount = 0
  let promptsCount = 0

  try {
    const supabase = await createClient()

    const [conversationsResult, studentsResult, campaignsResult, promptsResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase
        .from('blast_campaigns')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('prompt_sections')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
    ])

    conversationsCount = conversationsResult.count ?? 0
    studentsCount = studentsResult.count ?? 0
    campaignsCount = campaignsResult.count ?? 0
    promptsCount = promptsResult.count ?? 0
  } catch (error) {
    console.error('[dashboard] Falha ao carregar metricas do Supabase:', error)
  }

  const cards = [
    {
      label: 'Conversas Ativas',
      value: conversationsCount ?? 0,
      icon: MessageSquare,
      accentColor: 'hsl(217 91% 60%)',
      href: '/conversas',
    },
    {
      label: 'Alunos Sincronizados',
      value: studentsCount ?? 0,
      icon: Users,
      accentColor: 'hsl(160 84% 39%)',
      href: '/moodle',
    },
    {
      label: 'Campanhas de Disparo',
      value: campaignsCount ?? 0,
      icon: Send,
      accentColor: 'hsl(38 92% 50%)',
      href: '/disparos',
    },
    {
      label: 'Blocos de Prompt Ativos',
      value: promptsCount ?? 0,
      icon: FileText,
      accentColor: 'hsl(262 80% 65%)',
      href: '/prompt',
    },
  ]

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-10">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'hsl(213 31% 91%)' }}
        >
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(215 18% 40%)' }}>
          Visão geral do sistema MARA
        </p>
      </div>

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
                borderTop: `2px solid ${card.accentColor}`,
                animationDelay: `${i * 60}ms`,
                animationFillMode: 'both',
              }}
            >
              <div className="flex items-start justify-between mb-5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: card.accentColor.replace(')', ' / 0.1)'),
                    color: card.accentColor,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: card.accentColor }} />
                </div>
                <span
                  className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'hsl(215 18% 40%)' }}
                >
                  →
                </span>
              </div>

              <p
                className="font-data text-3xl font-medium tracking-tight mb-1"
                style={{ color: 'hsl(213 31% 92%)' }}
              >
                {(card.value ?? 0).toLocaleString('pt-BR')}
              </p>
              <p
                className="text-xs"
                style={{ color: 'hsl(215 18% 42%)' }}
              >
                {card.label}
              </p>
            </a>
          )
        })}
      </div>

      {/* System status */}
      <div
        className="mt-5 rounded-xl px-5 py-4 flex items-center justify-between"
        style={{
          background: 'hsl(220 40% 8%)',
          border: '1px solid hsl(216 32% 15%)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: 'hsl(160 84% 39%)' }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: 'hsl(160 84% 39%)' }}
            />
          </div>
          <div>
            <span
              className="text-sm"
              style={{ color: 'hsl(215 18% 55%)' }}
            >
              MARA está ativa e recebendo mensagens
            </span>
          </div>
        </div>

        <div
          className="font-data text-xs px-2 py-1 rounded-md"
          style={{
            color: 'hsl(160 70% 45%)',
            background: 'hsl(160 84% 39% / 0.08)',
            border: '1px solid hsl(160 84% 39% / 0.15)',
            fontSize: '0.65rem',
            letterSpacing: '0.08em',
          }}
        >
          ONLINE
        </div>
      </div>
    </div>
  )
}
