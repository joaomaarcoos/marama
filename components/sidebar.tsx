'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/(auth)/login/actions'
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Send,
  User,
  Users,
  FileText,
  LogOut,
  BookOpen,
  ShieldCheck,
  Smartphone,
  ScrollText,
  GraduationCap,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart2,
  Settings,
  TicketCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'
import { MARAOrb } from '@/components/mara-orb'
import React, { useState, useEffect } from 'react'
import type { UserRole } from '@/lib/roles'

interface NavItem {
  href: string
  label: string
  sublabel?: string
  icon: React.ElementType
  roles: UserRole[]
  accent?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Visão Geral',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin','gerente','atendente'] },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      {
        href: '/conversas',
        label: 'Conversas MARA',
        sublabel: 'chatbot automático',
        icon: MessageSquare,
        roles: ['admin','gerente','atendente'],
      },
      {
        href: '/conversacoordenacao',
        label: 'Coord. WhatsApp',
        sublabel: 'respostas manuais',
        icon: MessagesSquare,
        roles: ['admin','gerente','atendente'],
        accent: 'hsl(var(--primary) / 0.7)',
      },
    ],
  },
  {
    title: 'Conteúdo',
    items: [
      { href: '/prompt',     label: 'Prompt da MARA',       icon: FileText,   roles: ['admin','gerente'] },
      { href: '/documentos', label: 'Base de Conhecimento', icon: BookOpen,   roles: ['admin','gerente'] },
      { href: '/disparos',   label: 'Disparos',             icon: Send,       roles: ['admin','gerente'] },
    ],
  },
  {
    title: 'Equipe & Alunos',
    items: [
      { href: '/contatos', label: 'Contatos',              icon: User,          roles: ['admin','gerente','atendente'] },
      { href: '/alunos',   label: 'Alunos',                icon: GraduationCap, roles: ['admin','gerente','atendente'] },
      { href: '/tutores',  label: 'Tutores / Professores', icon: GraduationCap, roles: ['admin','gerente','atendente'] },
      { href: '/usuarios', label: 'Usuários',              icon: ShieldCheck,   roles: ['admin','gerente'] },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/relatorios',    label: 'Relatórios',       icon: BarChart2,  roles: ['admin','gerente'] },
      { href: '/suporte',       label: 'Suporte',          icon: TicketCheck, roles: ['admin','gerente','atendente'] },
      { href: '/logs',          label: 'Logs Evolution',   icon: ScrollText,  roles: ['admin'] },
      { href: '/conexao',       label: 'Conexão WhatsApp', icon: Smartphone,  roles: ['admin','gerente','atendente'] },
      { href: '/configuracoes', label: 'Configurações',    icon: Settings,    roles: ['admin','gerente','atendente'] },
    ],
  },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const navSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => item.roles.includes(role)),
  })).filter(section => section.items.length > 0)

  // Persist collapse state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapse = () => {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v))
      return !v
    })
  }

  const w = collapsed ? 'w-14' : 'w-56'

  return (
    <aside
      className={cn('flex flex-col h-screen overflow-y-auto shrink-0 transition-all duration-200', w)}
      style={{
        background: 'hsl(var(--sidebar-bg))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      {/* Brand */}
      <div
        className="px-2.5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border-subtle))' }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0">
              <MARAOrb size={36} isStatic />
            </div>
            <div className="min-w-0">
              <p
                className="font-display italic font-bold text-sm leading-none tracking-wide truncate"
                style={{
                  color: 'hsl(var(--sidebar-brand-color))',
                  textShadow: '0 0 20px hsl(var(--primary) / 0.3)',
                }}
              >
                MARA
              </p>
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: 'hsl(var(--sidebar-brand-dim))', fontSize: '0.6rem', letterSpacing: '0.06em' }}
              >
                MARANHÃO PROF.
              </p>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="mx-auto">
            <MARAOrb size={30} isStatic />
          </div>
        )}

        <button
          onClick={toggleCollapse}
          className={cn('shrink-0 flex items-center justify-center w-6 h-6 rounded transition-colors', collapsed && 'mx-auto')}
          style={{ color: 'hsl(var(--sidebar-text-dim))' }}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--sidebar-text))')}
          onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--sidebar-text-dim))')}
        >
          {collapsed
            ? <PanelLeftOpen className="h-3.5 w-3.5" />
            : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-1.5 py-3 space-y-3 overflow-y-auto">
        {navSections.map((section, si) => (
          <div key={si}>
            {/* Section label */}
            {!collapsed && (
              <p
                className="px-2 pb-1 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'hsl(var(--sidebar-text-dim))', fontSize: '0.58rem' }}
              >
                {section.title}
              </p>
            )}
            {collapsed && si > 0 && (
              <div className="mx-2 my-1 border-t" style={{ borderColor: 'hsl(var(--sidebar-border-subtle))' }} />
            )}

            <div className="space-y-px">
              {section.items.map(item => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                      collapsed ? 'justify-center px-0' : 'px-2.5'
                    )}
                    style={
                      isActive
                        ? { color: 'hsl(var(--sidebar-active-color))', background: 'hsl(var(--sidebar-active-bg))' }
                        : { color: item.accent ?? 'hsl(var(--sidebar-text))' }
                    }
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--sidebar-hover))' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                        style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsl(var(--primary) / 0.6)' }}
                      />
                    )}
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <span className="truncate block leading-tight">{item.label}</span>
                        {item.sublabel && (
                          <span
                            className="truncate block leading-tight"
                            style={{ fontSize: '0.58rem', color: isActive ? 'hsl(var(--sidebar-active-color) / 0.7)' : 'hsl(var(--sidebar-text-dim))' }}
                          >
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-1.5 pb-4"
        style={{ borderTop: '1px solid hsl(var(--sidebar-border-subtle))' }}
      >
        <div className="pt-3 space-y-0.5">
          <button
            onClick={toggle}
            title={collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo noturno') : undefined}
            className={cn(
              'flex items-center gap-2.5 w-full py-2 rounded-md text-xs font-medium transition-all duration-150',
              collapsed ? 'justify-center px-0' : 'px-2.5'
            )}
            style={{ color: 'hsl(var(--sidebar-text))' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--sidebar-hover))')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 shrink-0" /> : <Moon className="h-3.5 w-3.5 shrink-0" />}
            {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo noturno'}</span>}
          </button>

          <form action={logout}>
            <button
              type="submit"
              title={collapsed ? 'Sair' : undefined}
              className={cn(
                'flex items-center gap-2.5 w-full py-2 rounded-md text-xs font-medium transition-all duration-150',
                collapsed ? 'justify-center px-0' : 'px-2.5'
              )}
              style={{ color: 'hsl(var(--sidebar-text-dim))' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--sidebar-hover))')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed && <span>Sair</span>}
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
