'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, MessageCircle, Phone, Image, Mic, FileText,
  AlertCircle, CheckCircle2, XCircle, Ban, Clock,
} from 'lucide-react'

// ─── Evolution API types ──────────────────────────────────────────────────────

interface EvolutionMessage {
  id: string
  key: { id: string; fromMe: boolean; remoteJid: string; remoteJidAlt?: string }
  pushName: string | null
  messageType: string
  message: Record<string, unknown>
  messageTimestamp: number
  instanceId: string
}

interface EvolutionChat {
  id: string
  remoteJid: string
  pushName: string | null
  profilePicUrl: string | null
  updatedAt: string
}

// ─── Backend log types ────────────────────────────────────────────────────────

interface WebhookLog {
  id: string
  phone: string
  message_type: string
  message_preview: string | null
  status: 'success' | 'error' | 'blocked' | 'ignored'
  response_preview: string | null
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tab = 'backend' | 'messages' | 'chats'

function getPhone(msg: EvolutionMessage): string {
  return msg.key.remoteJidAlt ?? msg.key.remoteJid
}

function getMessageText(msg: EvolutionMessage): string {
  const m = msg.message
  if (typeof m.conversation === 'string') return m.conversation
  const ext = m.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text
  if (m.imageMessage) return '[Imagem]'
  if (m.audioMessage || m.pttMessage) return '[Audio]'
  if (m.videoMessage) return '[Video]'
  if (m.documentMessage) return '[Documento]'
  if (m.stickerMessage) return '[Sticker]'
  if (m.reactionMessage) return '[Reacao]'
  return `[${msg.messageType}]`
}

function MessageTypeIcon({ text }: { text: string }) {
  if (text.startsWith('[Audio')) return <Mic className="h-3.5 w-3.5 text-purple-500" />
  if (text.startsWith('[Imagem')) return <Image className="h-3.5 w-3.5 text-blue-500" />
  if (text.startsWith('[Documento')) return <FileText className="h-3.5 w-3.5 text-orange-500" />
  if (text.startsWith('[')) return <AlertCircle className="h-3.5 w-3.5 text-gray-400" />
  return <MessageCircle className="h-3.5 w-3.5 text-green-500" />
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatIso(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatPhone(jid: string): string {
  const raw = jid.replace(/@.*/, '').replace(/[^0-9]/g, '')
  if (raw.startsWith('55') && raw.length >= 12) {
    const ddd = raw.slice(2, 4)
    const num = raw.slice(4)
    return `+55 (${ddd}) ${num.slice(0, -4)}-${num.slice(-4)}`
  }
  return raw || jid
}

const STATUS_CONFIG = {
  success: { label: 'Sucesso', icon: CheckCircle2, bg: 'bg-green-50', border: 'border-green-100', badge: 'bg-green-100 text-green-700', iconColor: 'text-green-500' },
  error: { label: 'Erro', icon: XCircle, bg: 'bg-red-50', border: 'border-red-100', badge: 'bg-red-100 text-red-700', iconColor: 'text-red-500' },
  blocked: { label: 'Bloqueada', icon: Ban, bg: 'bg-yellow-50', border: 'border-yellow-100', badge: 'bg-yellow-100 text-yellow-700', iconColor: 'text-yellow-500' },
  ignored: { label: 'Ignorada', icon: AlertCircle, bg: 'bg-gray-50', border: 'border-gray-100', badge: 'bg-gray-100 text-gray-500', iconColor: 'text-gray-400' },
}

function MsgTypeIcon({ type }: { type: string }) {
  if (type === 'audio') return <Mic className="h-3 w-3" />
  if (type === 'image') return <Image className="h-3 w-3" />
  if (type === 'document') return <FileText className="h-3 w-3" />
  return <MessageCircle className="h-3 w-3" />
}

// ─── Backend logs tab ─────────────────────────────────────────────────────────

function BackendLogsTab({
  logs,
  loading,
  statusFilter,
  onStatusFilter,
}: {
  logs: WebhookLog[]
  loading: boolean
  statusFilter: string
  onStatusFilter: (s: string) => void
}) {
  const counts = {
    success: logs.filter((l) => l.status === 'success').length,
    error: logs.filter((l) => l.status === 'error').length,
    blocked: logs.filter((l) => l.status === 'blocked').length,
    ignored: logs.filter((l) => l.status === 'ignored').length,
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <button
              key={key}
              onClick={() => onStatusFilter(statusFilter === key ? '' : key)}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                statusFilter === key ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1` : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
                <span className="text-xs text-gray-500">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{counts[key]}</p>
            </button>
          )
        })}
      </div>

      {/* Log list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">Nenhum log encontrado.</p>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {logs.map((log) => {
              const cfg = STATUS_CONFIG[log.status]
              const Icon = cfg.icon
              return (
                <div key={log.id} className={`px-5 py-3.5 ${log.status === 'error' ? 'bg-red-50/40' : log.status === 'blocked' ? 'bg-yellow-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs font-mono text-gray-600">{formatPhone(log.phone)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-1`}>
                          <MsgTypeIcon type={log.message_type} />
                          {log.message_type}
                        </span>
                        {log.duration_ms != null && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>

                      {/* Message preview */}
                      {log.message_preview && (
                        <p className="text-sm text-gray-700 mb-1 leading-relaxed">
                          <span className="text-gray-400 text-xs mr-1">Aluno:</span>
                          {log.message_preview}
                        </p>
                      )}

                      {/* MARA response */}
                      {log.response_preview && (
                        <p className="text-sm text-blue-700 bg-blue-50 rounded px-2 py-1 leading-relaxed">
                          <span className="text-blue-400 text-xs mr-1">MARA:</span>
                          {log.response_preview.length > 200
                            ? `${log.response_preview.slice(0, 200)}…`
                            : log.response_preview}
                        </p>
                      )}

                      {/* Error */}
                      {log.error_message && (
                        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 font-mono break-all leading-relaxed mt-1">
                          {log.error_message.slice(0, 300)}
                        </p>
                      )}

                      {/* Blocked reason */}
                      {log.status === 'blocked' && (
                        <p className="text-xs text-yellow-700 mt-0.5">
                          Conversa em atendimento humano ou pausada — MARA não respondeu
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {formatIso(log.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('backend')

  // Evolution state
  const [messages, setMessages] = useState<EvolutionMessage[]>([])
  const [chats, setChats] = useState<EvolutionChat[]>([])
  const [evolutionLoading, setEvolutionLoading] = useState(false)
  const [evolutionError, setEvolutionError] = useState<string | null>(null)
  const [evolutionLimit, setEvolutionLimit] = useState(50)

  // Backend logs state
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLimit, setLogsLimit] = useState(100)
  const [statusFilter, setStatusFilter] = useState('')

  // Shared
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchBackendLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const params = new URLSearchParams({ limit: String(logsLimit) })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/logs/webhook?${params}`)
      if (!res.ok) throw new Error('Erro ao buscar logs de backend')
      const data = await res.json()
      setLogs(data.logs ?? [])
      setLastFetch(new Date())
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLogsLoading(false)
    }
  }, [logsLimit, statusFilter])

  const fetchEvolution = useCallback(async () => {
    setEvolutionLoading(true)
    setEvolutionError(null)
    try {
      const res = await fetch(`/api/logs/evolution?limit=${evolutionLimit}`)
      if (!res.ok) throw new Error('Erro ao buscar logs Evolution')
      const data = await res.json()
      setMessages(data.messages?.records ?? [])
      setChats(data.chats ?? [])
      setLastFetch(new Date())
    } catch (e) {
      setEvolutionError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setEvolutionLoading(false)
    }
  }, [evolutionLimit])

  // Initial load
  useEffect(() => { fetchBackendLogs() }, [fetchBackendLogs])
  useEffect(() => {
    if (tab === 'messages' || tab === 'chats') fetchEvolution()
  }, [tab, fetchEvolution])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      if (tab === 'backend') fetchBackendLogs()
      else fetchEvolution()
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, tab, fetchBackendLogs, fetchEvolution])

  const loading = tab === 'backend' ? logsLoading : evolutionLoading
  const error = tab === 'backend' ? logsError : evolutionError

  const received = messages.filter((m) => !m.key.fromMe)
  const sent = messages.filter((m) => m.key.fromMe)

  const handleRefresh = () => {
    if (tab === 'backend') fetchBackendLogs()
    else fetchEvolution()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logs do Sistema</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Execuções do webhook e mensagens da instância MARA
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            Auto (5s)
          </label>

          {tab === 'backend' ? (
            <select
              value={logsLimit}
              onChange={(e) => setLogsLimit(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          ) : (
            <select
              value={evolutionLimit}
              onChange={(e) => setEvolutionLimit(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value={20}>20 msgs</option>
              <option value={50}>50 msgs</option>
              <option value={100}>100 msgs</option>
            </select>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {lastFetch && (
        <p className="text-xs text-gray-400">Última atualização: {lastFetch.toLocaleTimeString('pt-BR')}</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {([
          { key: 'backend', label: 'Execuções Backend' },
          { key: 'messages', label: `Mensagens (${messages.length})` },
          { key: 'chats', label: `Conversas (${chats.length})` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'backend' && (
        <BackendLogsTab
          logs={logs}
          loading={logsLoading}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
        />
      )}

      {tab === 'messages' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total', value: messages.length, color: 'text-gray-900' },
              { label: 'Recebidas', value: received.length, color: 'text-green-600' },
              { label: 'Enviadas', value: sent.length, color: 'text-blue-600' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {evolutionLoading && messages.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Nenhuma mensagem encontrada.</p>
            ) : messages.map((msg) => {
              const text = getMessageText(msg)
              const phone = getPhone(msg)
              return (
                <div key={msg.id} className={`flex items-start gap-4 px-6 py-3.5 ${msg.key.fromMe ? 'bg-blue-50/40' : ''}`}>
                  <div className="shrink-0 mt-0.5"><MessageTypeIcon text={text} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${msg.key.fromMe ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {msg.key.fromMe ? 'MARA' : 'Recebida'}
                      </span>
                      <span className="text-xs font-medium text-gray-700">{msg.pushName ?? formatPhone(phone)}</span>
                      <span className="text-xs text-gray-400 font-mono">{formatPhone(phone)}</span>
                    </div>
                    <p className="text-sm text-gray-700 break-words leading-relaxed">{text}</p>
                  </div>
                  <div className="shrink-0 text-xs text-gray-400 whitespace-nowrap">{formatTs(msg.messageTimestamp)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'chats' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
          {evolutionLoading && chats.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : chats.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">Nenhuma conversa encontrada.</p>
          ) : chats.map((chat) => (
            <div key={chat.id} className="flex items-center gap-4 px-6 py-3.5">
              {chat.profilePicUrl ? (
                <img src={chat.profilePicUrl} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{chat.pushName ?? formatPhone(chat.remoteJid)}</p>
                <p className="text-xs text-gray-400 font-mono">{formatPhone(chat.remoteJid)}</p>
              </div>
              <p className="text-xs text-gray-400 shrink-0">
                {new Date(chat.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
