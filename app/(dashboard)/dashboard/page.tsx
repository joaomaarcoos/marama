import { createClient } from '@/lib/supabase/server'
import { MessageSquare, Users, Send, FileText } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: conversationsCount },
    { count: studentsCount },
    { count: campaignsCount },
    { count: promptsCount },
  ] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('blast_campaigns').select('*', { count: 'exact', head: true }),
    supabase.from('prompt_sections').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const cards = [
    {
      label: 'Conversas Ativas',
      value: conversationsCount ?? 0,
      icon: MessageSquare,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      href: '/conversas',
    },
    {
      label: 'Alunos Sincronizados',
      value: studentsCount ?? 0,
      icon: Users,
      color: 'text-green-600',
      bg: 'bg-green-50',
      href: '/moodle',
    },
    {
      label: 'Campanhas de Disparo',
      value: campaignsCount ?? 0,
      icon: Send,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      href: '/disparos',
    },
    {
      label: 'Blocos de Prompt Ativos',
      value: promptsCount ?? 0,
      icon: FileText,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      href: '/prompt',
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral do sistema MARA</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <a
              key={card.href}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className={`${card.bg} rounded-lg p-3`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-sm text-gray-500">{card.label}</p>
                </div>
              </div>
            </a>
          )
        })}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Status do Sistema</h2>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-gray-600">MARA está ativa e recebendo mensagens</span>
        </div>
      </div>
    </div>
  )
}
