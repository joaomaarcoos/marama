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
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 rounded-lg p-2">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm">SISTEMAMARA</p>
            <p className="text-xs text-gray-400">Maranhão Profissionalizado</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
