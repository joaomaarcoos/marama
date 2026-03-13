'use client'

import { useState } from 'react'
import { Trash2, Loader2, User, BadgeCheck } from 'lucide-react'
import { deleteUser } from '@/app/(dashboard)/usuarios/actions'

interface SupabaseUser {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string
  email_confirmed_at?: string
}

interface UserTableProps {
  users: SupabaseUser[]
  currentUserId: string
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

export default function UserTable({ users, currentUserId }: UserTableProps) {
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
                Criado em
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Último acesso
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              localUsers.map((user) => {
                const isCurrentUser = user.id === currentUserId
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
