'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Pause, Play, Loader2, CheckCircle2, XCircle, Clock,
  Download, ChevronDown, ChevronUp
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Campaign {
  id: string
  name: string
  message: string
  variations?: string[]
  status: string
  total_contacts: number
  sent_count: number
  failed_count: number
  delay_seconds: number
  batch_size?: number
  batch_delay_seconds?: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

interface Contact {
  id: string
  phone: string
  name: string | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_msg: string | null
}

type ContactTab = 'all' | 'sent' | 'failed' | 'pending'

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', running: 'Enviando', paused: 'Pausado',
  completed: 'Concluído', failed: 'Falhou',
}
const statusColor: Record<string, string> = {
  running: 'text-blue-600', paused: 'text-yellow-600',
  completed: 'text-green-600', failed: 'text-red-600', draft: 'text-gray-500',
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTab, setContactTab] = useState<ContactTab>('all')
  const [showMessage, setShowMessage] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(true)

  const fetchCampaign = useCallback(async () => {
    const res = await fetch(`/api/blast/${id}`)
    if (res.ok) setCampaign(await res.json())
  }, [id])

  const fetchContacts = useCallback(async () => {
    const res = await fetch(`/api/blast/${id}/contacts`)
    if (res.ok) setContacts(await res.json())
    setContactsLoading(false)
  }, [id])

  async function togglePause() {
    setPauseLoading(true)
    await fetch(`/api/blast/${id}/pause`, { method: 'POST' })
    await fetchCampaign()
    setPauseLoading(false)
  }

  useEffect(() => {
    fetchCampaign()
    fetchContacts()
  }, [fetchCampaign, fetchContacts])

  useEffect(() => {
    if (!campaign) return
    if (campaign.status !== 'running' && campaign.status !== 'paused') return
    const interval = setInterval(() => {
      fetchCampaign()
      fetchContacts()
    }, 2000)
    return () => clearInterval(interval)
  }, [campaign?.status, fetchCampaign, fetchContacts])

  function exportCSV(filter: 'sent' | 'failed') {
    const rows = contacts.filter(c => c.status === filter)
    const header = 'nome,telefone,status,horario,erro\n'
    const lines = rows.map(c =>
      `"${c.name ?? ''}","${c.phone}","${c.status}","${c.sent_at ? formatDate(c.sent_at) : ''}","${c.error_msg ?? ''}"`
    ).join('\n')
    const blob = new Blob([header + lines], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filter === 'sent' ? 'enviados' : 'erros'}-${id.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!campaign) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
  }

  const pct = campaign.total_contacts > 0
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100)
    : 0
  const pending = campaign.total_contacts - campaign.sent_count - campaign.failed_count
  const filteredContacts = contacts.filter(c => contactTab === 'all' || c.status === contactTab)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/disparos" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
        <span className={`text-sm font-medium ${statusColor[campaign.status] ?? 'text-gray-500'}`}>
          {statusLabels[campaign.status] ?? campaign.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Progress */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Progresso</h2>
              {(campaign.status === 'running' || campaign.status === 'paused') && (
                <button
                  onClick={togglePause}
                  disabled={pauseLoading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {pauseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                    campaign.status === 'running'
                      ? <><Pause className="h-4 w-4" /> Pausar</>
                      : <><Play className="h-4 w-4" /> Retomar</>
                  }
                </button>
              )}
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
              <div className="bg-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{campaign.sent_count}</p>
                <p className="text-xs text-gray-500">Enviados</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{campaign.failed_count}</p>
                <p className="text-xs text-gray-500">Falhas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600">{pending}</p>
                <p className="text-xs text-gray-500">Pendentes</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500 mt-4">
              {pct}% concluído ({campaign.sent_count + campaign.failed_count}/{campaign.total_contacts})
            </p>
          </div>

          {/* Message collapsible */}
          <div className="bg-white rounded-xl border border-gray-200">
            <button
              onClick={() => setShowMessage(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <h2 className="font-semibold text-gray-900 text-sm">
                Mensagem{(campaign.variations?.length ?? 0) > 0 ? ` + ${campaign.variations!.length} variação${campaign.variations!.length !== 1 ? 'ões' : ''}` : ''}
              </h2>
              {showMessage ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {showMessage && (
              <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Principal</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{campaign.message}</p>
                </div>
                {campaign.variations?.map((v, i) => (
                  <div key={i}>
                    <p className="text-xs font-medium text-gray-500 mb-1">Variação {i + 1}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{v}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contacts log */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Log de envios</h2>
              <div className="flex items-center gap-2">
                {campaign.sent_count > 0 && (
                  <button onClick={() => exportCSV('sent')} className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 border border-green-200 bg-green-50 px-2 py-1 rounded">
                    <Download className="h-3 w-3" /> Enviados
                  </button>
                )}
                {campaign.failed_count > 0 && (
                  <button onClick={() => exportCSV('failed')} className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 border border-red-200 bg-red-50 px-2 py-1 rounded">
                    <Download className="h-3 w-3" /> Erros
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-4">
              {([
                { key: 'all', label: `Todos (${contacts.length})` },
                { key: 'sent', label: `Enviados (${campaign.sent_count})` },
                { key: 'failed', label: `Erros (${campaign.failed_count})` },
                { key: 'pending', label: `Pendentes (${pending})` },
              ] as { key: ContactTab; label: string }[]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setContactTab(tab.key)}
                  className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                    contactTab === tab.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {contactsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : filteredContacts.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nenhum contato nesta categoria.</p>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {filteredContacts.map(c => (
                  <div key={c.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="shrink-0">
                      {c.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {c.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                      {c.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name ?? '—'}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.phone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {c.sent_at && <p className="text-xs text-gray-400">{formatDate(c.sent_at)}</p>}
                      {c.error_msg && <p className="text-xs text-red-500 max-w-[200px] truncate" title={c.error_msg}>{c.error_msg}</p>}
                      {c.status === 'pending' && <p className="text-xs text-gray-400 italic">aguardando</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary footer */}
            {campaign.status === 'completed' && (
              <div className="flex items-center justify-around border-t border-gray-100 px-6 py-4 bg-gray-50 rounded-b-xl">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <div>
                    <p className="text-lg font-bold">{campaign.sent_count}</p>
                    <p className="text-xs">enviados com sucesso</p>
                  </div>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <div>
                    <p className="text-lg font-bold">{campaign.failed_count}</p>
                    <p className="text-xs">falharam</p>
                  </div>
                </div>
                <div className="w-px h-10 bg-gray-200" />
                <div className="text-gray-600">
                  <p className="text-lg font-bold">{pct}%</p>
                  <p className="text-xs">taxa de sucesso</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 h-fit">
          <h2 className="font-semibold text-gray-900">Configurações</h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-gray-500">Total de contatos</p>
              <p className="font-medium">{campaign.total_contacts}</p>
            </div>
            <div>
              <p className="text-gray-500">Intervalo entre envios</p>
              <p className="font-medium">{campaign.delay_seconds}s</p>
            </div>
            {campaign.batch_size && (
              <div>
                <p className="text-gray-500">Pausa a cada</p>
                <p className="font-medium">{campaign.batch_size} msgs ({campaign.batch_delay_seconds}s de espera)</p>
              </div>
            )}
            {(campaign.variations?.length ?? 0) > 0 && (
              <div>
                <p className="text-gray-500">Variações</p>
                <p className="font-medium">{campaign.variations!.length + 1} versões alternadas</p>
              </div>
            )}
            <div>
              <p className="text-gray-500">Criada em</p>
              <p className="font-medium">{formatDate(campaign.created_at)}</p>
            </div>
            {campaign.started_at && (
              <div>
                <p className="text-gray-500">Iniciada em</p>
                <p className="font-medium">{formatDate(campaign.started_at)}</p>
              </div>
            )}
            {campaign.completed_at && (
              <div>
                <p className="text-gray-500">Concluída em</p>
                <p className="font-medium">{formatDate(campaign.completed_at)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
