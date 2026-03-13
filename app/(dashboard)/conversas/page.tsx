import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, formatPhone } from '@/lib/utils'
import { MessageSquare, User } from 'lucide-react'

export const revalidate = 0

export default async function ConversasPage() {
  const supabase = await createClient()

  const { data: conversations } = await supabase
    .from('conversations')
    .select(`
      *,
      students (full_name, email)
    `)
    .order('last_message_at', { ascending: false })
    .limit(100)

  const statusColor = {
    active: 'bg-green-100 text-green-700',
    waiting: 'bg-yellow-100 text-yellow-700',
    closed: 'bg-gray-100 text-gray-500',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conversas</h1>
        <p className="text-gray-500 mt-1">Monitor de conversas ativas no WhatsApp</p>
      </div>

      {(!conversations || conversations.length === 0) ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma conversa ainda.</p>
          <p className="text-sm text-gray-400 mt-1">As conversas aparecerão aqui quando alunos enviarem mensagens.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Última mensagem</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total msgs</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Quando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {conversations.map((conv) => {
                const student = conv.students as { full_name: string; email: string } | null
                return (
                  <tr key={conv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/conversas/${conv.phone}`} className="flex items-center gap-3 group">
                        <div className="bg-blue-100 rounded-full p-2">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                            {student?.full_name ?? conv.contact_name ?? 'Desconhecido'}
                          </p>
                          <p className="text-xs text-gray-500">{formatPhone(conv.phone)}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 truncate max-w-xs">
                        {conv.last_message ?? '—'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[conv.status as keyof typeof statusColor] ?? 'bg-gray-100 text-gray-500'}`}>
                        {conv.status === 'active' ? 'Ativo' : conv.status === 'waiting' ? 'Aguardando' : 'Fechado'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{conv.message_count}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-400">
                        {conv.last_message_at ? formatDate(conv.last_message_at) : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
