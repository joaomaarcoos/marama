'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, MessageCircle, Phone, Image, Mic, FileText, AlertCircle } from 'lucide-react'

interface EvolutionMessage {
  id: string
  key: {
    id: string
    fromMe: boolean
    remoteJid: string
    remoteJidAlt?: string
  }
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

type Tab = 'messages' | 'chats'

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

function MessageTypeIcon({ type, text }: { type: string; text: string }) {
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

function formatPhone(jid: string): string {
  const raw = jid.replace(/@.*/, '').replace(/[^0-9]/g, '')
  if (raw.startsWith('55') && raw.length >= 12) {
    const ddd = raw.slice(2, 4)
    const num = raw.slice(4)
    return `+55 (${ddd}) ${num.slice(0, -4)}-${num.slice(-4)}`
  }
  return raw || jid
}

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('messages')
  const [messages, setMessages] = useState<EvolutionMessage[]>([])
  const [chats, setChats] = useState<EvolutionChat[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(50)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/logs/evolution?limit=${limit}`)
      if (!res.ok) throw new Error('Erro ao buscar logs')
      const data = await res.json()
      setMessages(data.messages?.records ?? [])
      setChats(data.chats ?? [])
      setLastFetch(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs])

  const received = messages.filter(m => !m.key.fromMe)
  const sent = messages.filter(m => m.key.fromMe)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logs Evolution API</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Mensagens e conversas da instancia <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE ?? 'marav2'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            Auto-refresh (5s)
          </label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={20}>20 msgs</option>
            <option value={50}>50 msgs</option>
            <option value={100}>100 msgs</option>
          </select>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {lastFetch && (
        <p className="text-xs text-gray-400">Ultima atualizacao: {lastFetch.toLocaleTimeString('pt-BR')}</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total mensagens', value: messages.length, color: 'text-gray-900' },
          { label: 'Recebidas', value: received.length, color: 'text-green-600' },
          { label: 'Enviadas', value: sent.length, color: 'text-blue-600' },
          { label: 'Conversas ativas', value: chats.length, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-100 px-4">
          {([
            { key: 'messages', label: `Mensagens (${messages.length})` },
            { key: 'chats', label: `Conversas (${chats.length})` },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : tab === 'messages' ? (
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Nenhuma mensagem encontrada.</p>
            ) : messages.map(msg => {
              const text = getMessageText(msg)
              const phone = getPhone(msg)
              return (
                <div key={msg.id} className={`flex items-start gap-4 px-6 py-3.5 ${msg.key.fromMe ? 'bg-blue-50/40' : ''}`}>
                  <div className="shrink-0 mt-0.5">
                    <MessageTypeIcon type={msg.messageType} text={text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        msg.key.fromMe
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {msg.key.fromMe ? 'MARA' : 'Recebida'}
                      </span>
                      <span className="text-xs font-medium text-gray-700">
                        {msg.pushName ?? formatPhone(phone)}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{formatPhone(phone)}</span>
                    </div>
                    <p className="text-sm text-gray-700 break-words leading-relaxed">{text}</p>
                  </div>
                  <div className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                    {formatTs(msg.messageTimestamp)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {chats.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Nenhuma conversa encontrada.</p>
            ) : chats.map((chat: EvolutionChat) => (
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
                  {new Date(chat.updatedAt).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
