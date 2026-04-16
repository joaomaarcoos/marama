'use client'

import { useState } from 'react'
import { Trash2, Loader2, User, BadgeCheck, ChevronDown } from 'lucide-react'
import { deleteUser, setUserRole } from '@/app/(dashboard)/usuarios/actions'
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/lib/roles'

interface SupabaseUser {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string
  email_confirmed_at?: string
  app_metadata?: Record<string, unknown>
}

interface UserTableProps {
  users: SupabaseUser[]
  currentUserId: string
  isAdmin: boolean
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Nunca'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getUserRole(user: SupabaseUser): UserRole {
  const r = user.app_metadata?.role
  if (r === 'admin' || r === 'gerente' || r === 'atendente') return r
  return 'atendente'
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        background: ROLE_COLORS[role] + '22',
        color: ROLE_COLORS[role],
        border: `1px solid ${ROLE_COLORS[role]}44`,
      }}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

function RoleSelector({
  userId,
  currentRole,
  onRoleChanged,
}: {
  userId: string
  currentRole: UserRole
  onRoleChanged: (newRole: UserRole) => void
}) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleSelect = async (role: UserRole) => {
    if (role === currentRole) { setOpen(false); return }
    setLoading(true)
    setOpen(false)
    const result = await setUserRole(userId, role)
    setLoading(false)
    if (!result.error) onRoleChanged(role)
  }

  const roles: UserRole[] = ['admin', 'gerente', 'atendente']

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{
          background: ROLE_COLORS[currentRole] + '22',
          color: ROLE_COLORS[currentRole],
          border: `1px solid ${ROLE_COLORS[currentRole]}44`,
        }}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : ROLE_LABELS[currentRole]}
        {!loading && <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg overflow-hidden min-w-[120px]"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            {roles.map(role => (
              <button
                key={role}
                onClick={() => handleSelect(role)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
                style={{
                  color: role === currentRole ? ROLE_COLORS[role] : 'hsl(var(--foreground))',
                  background: role === currentRole ? ROLE_COLORS[role] + '15' : 'transparent',
                }}
                onMouseEnter={e => { if (role !== currentRole) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))' }}
                onMouseLeave={e => { if (role !== currentRole) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ROLE_COLORS[role] }}
                />
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function UserTable({ users, currentUserId, isAdmin }: UserTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [localUsers, setLocalUsers] = useState(users)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return

    setDeletingId(userId)
    const result = await deleteUser(userId)
    setDeletingId(null)

    if (result.error) {
      showMessage('error', result.error)
    } else {
      setLocalUsers((prev) => prev.filter((u) => u.id !== userId))
      showMessage('success', result.success ?? 'Usuário excluído.')
    }
  }

  const handleRoleChanged = (userId: string, newRole: UserRole) => {
    setLocalUsers(prev =>
      prev.map(u => u.id === userId
        ? { ...u, app_metadata: { ...u.app_metadata, role: newRole } }
        : u
      )
    )
    showMessage('success', `Cargo atualizado para ${ROLE_LABELS[newRole]}.`)
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Usuário
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Cargo
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Criado em
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Último acesso
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              {isAdmin && <th className="px-6 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localUsers.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-6 py-10 text-center text-gray-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              localUsers.map((user) => {
                const isCurrentUser = user.id === currentUserId
                const role = getUserRole(user)
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.email}</p>
                          {isCurrentUser && (
                            <span className="text-xs text-blue-600 font-medium">Você</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isAdmin && !isCurrentUser ? (
                        <RoleSelector
                          userId={user.id}
                          currentRole={role}
                          onRoleChanged={(newRole) => handleRoleChanged(user.id, newRole)}
                        />
                      ) : (
                        <RoleBadge role={role} />
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(user.last_sign_in_at)}</td>
                    <td className="px-6 py-4">
                      {user.email_confirmed_at ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          <BadgeCheck className="h-3 w-3" />
                          Confirmado
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                          Pendente
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={isCurrentUser || deletingId === user.id}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isCurrentUser ? 'Não é possível excluir sua própria conta' : 'Excluir usuário'}
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
