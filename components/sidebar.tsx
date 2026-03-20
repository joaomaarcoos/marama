'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/(auth)/login/actions'
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  Send,
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/prompt', label: 'Prompt da MARA', icon: FileText },
  { href: '/documentos', label: 'Base de Conhecimento', icon: BookOpen },
  { href: '/disparos', label: 'Disparos', icon: Send },
  { href: '/moodle', label: 'Alunos (Moodle)', icon: Users },
  { href: '/tutores', label: 'Tutores / Professores', icon: GraduationCap },
  { href: '/usuarios', label: 'Usuários', icon: ShieldCheck },
  { href: '/conexao', label: 'Conexão WhatsApp', icon: Smartphone },
  { href: '/logs', label: 'Logs Evolution', icon: ScrollText },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <aside
      className="w-56 flex flex-col min-h-screen shrink-0"
      style={{
        background: 'hsl(var(--sidebar-bg))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      {/* Brand */}
      <div
        className="px-5 py-5"
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border-subtle))' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'hsl(var(--primary) / 0.12)',
              border: '1px solid hsl(var(--primary) / 0.28)',
            }}
          >
            <Bot className="h-4 w-4" style={{ color: 'hsl(var(--sidebar-brand-color))' }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-display italic font-bold text-base leading-none tracking-wide"
              style={{
                color: 'hsl(var(--sidebar-brand-color))',
                textShadow: '0 0 20px hsl(var(--primary) / 0.3)',
              }}
            >
              MARA
            </p>
            <p
              className="text-xs mt-1 truncate"
              style={{
                color: 'hsl(var(--sidebar-brand-dim))',
                letterSpacing: '0.06em',
                fontSize: '0.65rem',
              }}
            >
              MARANHÃO PROF.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4">
        <p
          className="px-2.5 pb-3 text-xs font-medium uppercase"
          style={{
            color: 'hsl(var(--sidebar-text-dim))',
            letterSpacing: '0.1em',
            fontSize: '0.6rem',
          }}
        >
          Navegação
        </p>

        <div className="space-y-px">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150',
                )}
                style={
                  isActive
                    ? {
                        color: 'hsl(var(--sidebar-active-color))',
                        background: 'hsl(var(--sidebar-active-bg))',
                      }
                    : {
                        color: 'hsl(var(--sidebar-text))',
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background =
                      'hsl(var(--sidebar-hover))'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = ''
                  }
                }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{
                      background: 'hsl(var(--primary))',
                      boxShadow: '0 0 8px hsl(var(--primary) / 0.6)',
                    }}
                  />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div
        className="px-2.5 pb-4"
        style={{ borderTop: '1px solid hsl(var(--sidebar-border-subtle))' }}
      >
        <div className="pt-3 space-y-0.5">
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150"
            style={{ color: 'hsl(var(--sidebar-text))' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                'hsl(var(--sidebar-hover))'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = ''
            }}
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Moon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{theme === 'dark' ? 'Modo claro' : 'Modo noturno'}</span>
          </button>

          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150"
              style={{ color: 'hsl(var(--sidebar-text-dim))' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  'hsl(var(--sidebar-hover))'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = ''
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
