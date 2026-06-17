'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { markSystemNotification } from '@/app/(dashboard)/notifications/actions'

export interface SystemNotification {
  id: string
  module?: string
  href?: string
  task_id: string | null
  project_id: string | null
  type: string
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export function SystemNotifications({ notifications }: { notifications: SystemNotification[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localNotifications, setLocalNotifications] = useState(notifications)
  const [isPending, startTransition] = useTransition()
  const unread = localNotifications.filter((item) => !item.is_read).length

  function toggleRead(id: string, isRead: boolean) {
    setLocalNotifications((items) =>
      items.map((item) => item.id === id ? { ...item, is_read: isRead } : item)
    )
    startTransition(async () => {
      const result = await markSystemNotification(id, isRead)
      if (result.error) {
        setLocalNotifications((items) =>
          items.map((item) => item.id === id ? { ...item, is_read: !isRead } : item)
        )
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="fixed left-3 top-3 z-50">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border shadow-lg transition-colors hover:bg-gray-100"
        style={{
          color: 'hsl(var(--fg2))',
          background: 'color-mix(in srgb, hsl(var(--card)) 92%, transparent)',
          borderColor: 'hsl(var(--border))',
          backdropFilter: 'blur(12px)',
        }}
        title="Notificacoes"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed left-3 top-16 z-40 w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-xl border shadow-2xl"
            style={{
              background: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <div>
                <p className="text-sm font-bold text-gray-900">Notificacoes</p>
                <p className="text-xs text-gray-500">{unread} nao lida(s)</p>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {localNotifications.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-500">Nenhuma notificacao.</p>
              ) : (
                localNotifications.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: item.is_read ? 'hsl(var(--border))' : 'hsl(var(--primary) / 0.45)',
                      background: item.is_read ? 'transparent' : 'hsl(var(--primary) / 0.08)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => {
                          if (item.href) {
                            setOpen(false)
                            router.push(item.href)
                          }
                        }}
                        className="min-w-0 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                          {item.module && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.12)' }}>
                              {item.module}
                            </span>
                          )}
                        </div>
                        {item.message && <p className="mt-1 text-xs text-gray-500">{item.message}</p>}
                        <p className="mt-2 text-xs text-gray-500">{formatDate(item.created_at)}</p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {item.href && <ExternalLink className="h-3.5 w-3.5 text-gray-500" />}
                        <button
                          disabled={isPending}
                          onClick={() => toggleRead(item.id, !item.is_read)}
                          className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                          title={item.is_read ? 'Marcar como nao lida' : 'Marcar como lida'}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
