'use client'

import { useMemo, useState } from 'react'
import { Check, Search, UserPlus, X } from 'lucide-react'
import type { TaskUser } from '@/lib/tasks'

export function UserMultiSelect({
  users,
  selected,
  onChange,
  label,
  placeholder = 'Selecionar usuarios',
}: {
  users: TaskUser[]
  selected: string[]
  onChange: (ids: string[]) => void
  label: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedUsers = users.filter((user) => selected.includes(user.id))
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) => user.email.toLowerCase().includes(q))
  }, [users, query])

  function toggleUser(userId: string) {
    onChange(
      selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId]
    )
  }

  return (
    <div className="relative">
      <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
        <UserPlus className="h-3 w-3" />
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left"
        style={{
          background: 'hsl(220 36% 10%)',
          color: 'hsl(213 31% 92%)',
          borderColor: 'hsl(216 32% 18%)',
        }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedUsers.length === 0 ? (
            <span className="text-sm text-gray-500">{placeholder}</span>
          ) : (
            selectedUsers.slice(0, 4).map((user) => (
              <span
                key={user.id}
                className="inline-flex max-w-[150px] items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ color: 'hsl(160 84% 55%)', background: 'hsl(160 84% 39% / 0.12)' }}
              >
                <span className="truncate">{shortEmail(user.email)}</span>
                <X className="h-3 w-3" />
              </span>
            ))
          )}
          {selectedUsers.length > 4 && (
            <span className="rounded-full px-2 py-0.5 text-xs text-gray-500">
              +{selectedUsers.length - 4}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{selectedUsers.length} selecionado(s)</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-50 mt-2 w-full min-w-[320px] overflow-hidden rounded-xl border shadow-2xl"
            style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="border-b p-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex h-10 items-center gap-2 rounded-lg border px-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(220 36% 10%)' }}>
                <Search className="h-4 w-4 text-gray-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar usuario"
                  className="w-full bg-transparent text-sm outline-none"
                  style={{ color: 'hsl(213 31% 92%)' }}
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-500">Nenhum usuario encontrado.</p>
              ) : (
                filteredUsers.map((user) => {
                  const active = selected.includes(user.id)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100"
                      style={{
                        background: active ? 'hsl(var(--primary) / 0.10)' : 'transparent',
                        color: 'hsl(var(--foreground))',
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{shortEmail(user.email)}</p>
                        <p className="truncate text-xs text-gray-500">{user.email}</p>
                      </div>
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                        style={{
                          borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                          background: active ? 'hsl(var(--primary))' : 'transparent',
                          color: active ? 'hsl(220 26% 8%)' : 'transparent',
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function shortEmail(email: string) {
  return email.split('@')[0]
}
