import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { Plus, Send } from 'lucide-react'

export const revalidate = 0

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  running: { label: 'Enviando', color: 'bg-blue-100 text-blue-700' },
  paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Falhou', color: 'bg-red-100 text-red-700' },
}

export default async function DisparosPage() {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('blast_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="app-content">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Disparos</h1>
          <p className="text-gray-500 mt-1">Campanhas de envio em massa via WhatsApp</p>
        </div>
        <Link
          href="/disparos/nova"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova campanha
        </Link>
      </div>

      {(!campaigns || campaigns.length === 0) ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <Send className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma campanha criada ainda.</p>
          <Link href="/disparos/nova" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            Criar primeira campanha
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Campanha</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Progresso</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((c) => {
                const s = statusLabels[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-600' }
                const pct = c.total_contacts > 0
                  ? Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100)
                  : 0

                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/disparos/${c.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {c.name}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{c.message}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{c.sent_count}/{c.total_contacts}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
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
