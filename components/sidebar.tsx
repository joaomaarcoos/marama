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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

  return (
    <aside
      className="w-56 flex flex-col min-h-screen shrink-0"
      style={{
        background: 'hsl(222 50% 3%)',
        borderRight: '1px solid hsl(216 32% 12%)',
      }}
    >
      {/* Brand */}
      <div
        className="px-5 py-5"
        style={{ borderBottom: '1px solid hsl(216 32% 10%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'hsl(38 92% 50% / 0.1)',
              border: '1px solid hsl(38 92% 50% / 0.25)',
            }}
          >
            <Bot className="h-4 w-4" style={{ color: 'hsl(38 92% 50%)' }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-display italic font-bold text-base leading-none tracking-wide"
              style={{
                color: 'hsl(38 92% 50%)',
                textShadow: '0 0 20px hsl(38 92% 50% / 0.35)',
              }}
            >
              MARA
            </p>
            <p
              className="text-xs mt-1 truncate"
              style={{
                color: 'hsl(215 18% 30%)',
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
            color: 'hsl(215 18% 27%)',
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
                  isActive ? '' : 'hover:bg-white/[0.03]'
                )}
                style={
                  isActive
                    ? {
                        color: 'hsl(38 92% 55%)',
                        background: 'hsl(38 92% 50% / 0.07)',
                      }
                    : {
                        color: 'hsl(215 18% 42%)',
                      }
                }
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{
                      background: 'hsl(38 92% 50%)',
                      boxShadow: '0 0 8px hsl(38 92% 50% / 0.7)',
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
        style={{ borderTop: '1px solid hsl(216 32% 10%)' }}
      >
        <div className="pt-3">
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150 hover:bg-white/[0.03]"
              style={{ color: 'hsl(215 18% 32%)' }}
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
