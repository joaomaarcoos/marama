'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  TicketCheck, Search, RefreshCw, ChevronLeft, ChevronRight,
  X, SendHorizontal, Bot, User, MessageSquare,
} from 'lucide-react'
import { formatPhone } from '@/lib/utils'

interface Ticket {
  id: string
  protocol: string
  phone: string
  subject: string
  description: string | null
  status: 'aberto' | 'em_andamento' | 'resolvido' | 'fechado_inatividade'
  assigned_to: string | null
  assigned_name: string | null
  opened_at: string
  closed_at: string | null
  students: { full_name: string } | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface SystemUser {
  id: string
  email: string
  name: string
}

const STATUS_TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'aberto', label: 'Aberto' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'resolvido', label: 'Resolvido' },
  { key: 'fechado_inatividade', label: 'Fechado (inatividade)' },
]

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em Andamento',
  resolvido: 'Resolvido',
  fechado_inatividade: 'Fechado',
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    aberto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    resolvido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    fechado_inatividade: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.aberto}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Ticket Detail Panel ──────────────────────────────────────────────────────

function TicketPanel({
  ticket,
  users,
  onClose,
  onUpdate,
}: {
  ticket: Ticket
  users: SystemUser[]
  onClose: () => void
  onUpdate: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/suporte/${ticket.id}/messages`)
    if (res.ok) {
      const json = await res.json() as { messages: Message[] }
      setMessages(json.messages)
    }
    setLoadingMsgs(false)
  }, [ticket.id])

  useEffect(() => {
    setLoadingMsgs(true)
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/suporte/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json() as { message?: Message; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Falha ao enviar')
      if (json.message) setMessages(prev => [...prev, json.message!])
      setDraft('')
      if (textareaRef.current) textareaRef.current.style.height = '38px'
      await onUpdate({ status: ticket.status === 'aberto' ? 'em_andamento' : ticket.status })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    try { await onUpdate({ status: newStatus }) } finally { setUpdating(false) }
  }

  const handleAssignChange = async (userId: string) => {
    const u = users.find(u => u.id === userId)
    setUpdating(true)
    try {
      await onUpdate({ assigned_to: userId || null, assigned_name: u?.name || null })
    } finally { setUpdating(false) }
  }

  const isClosed = ticket.status === 'resolvido' || ticket.status === 'fechado_inatividade'

  return (
    <div className="flex flex-col h-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" style={{ minWidth: 380, maxWidth: 480, width: '40%' }}>
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs text-gray-400">{ticket.protocol}</span>
            <StatusBadge status={ticket.status} />
          </div>
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{ticket.subject}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {ticket.students?.full_name ?? '—'} · {formatPhone(ticket.phone)}
          </p>
        </div>
        <button onClick={onClose} className="ml-3 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 shrink-0">
          <X size={15} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
        <select
          value={ticket.status}
          disabled={updating}
          onChange={e => handleStatusChange(e.target.value)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
        >
          <option value="aberto">Aberto</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="resolvido">Resolvido</option>
          <option value="fechado_inatividade">Fechado (inatividade)</option>
        </select>
        <select
          value={ticket.assigned_to ?? ''}
          disabled={updating}
          onChange={e => handleAssignChange(e.target.value)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 flex-1 min-w-0"
        >
          <option value="">— Não atribuído —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Descrição inicial</p>
          <p className="text-xs text-gray-700 dark:text-gray-300">{ticket.description}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loadingMsgs ? (
          <div className="flex justify-center py-8">
            <RefreshCw size={16} className="animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <MessageSquare size={24} />
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOut = msg.role === 'assistant'
            return (
              <div key={i} className={`flex gap-2 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isOut ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  {isOut ? <Bot size={12} className="text-blue-600 dark:text-blue-400" /> : <User size={12} className="text-gray-500" />}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${isOut ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm'}`}>
                  <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                  <p className={`text-right mt-1 ${isOut ? 'text-blue-200' : 'text-gray-400'}`} style={{ fontSize: '0.65rem' }}>
                    {fullTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        {sendError && (
          <p className="text-xs text-red-500 mb-2">{sendError}</p>
        )}
        {isClosed && (
          <p className="text-xs text-gray-400 mb-2 text-center">Chamado encerrado — reabra para responder</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            disabled={isClosed || sending}
            placeholder={isClosed ? 'Chamado encerrado' : 'Digite uma mensagem para enviar via WhatsApp…'}
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              e.currentTarget.style.height = '38px'
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
            }}
            className="flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            style={{ height: 38 }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isClosed || sending || !draft.trim()}
            className="shrink-0 w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <SendHorizontal size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuportePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [activeTab, setActiveTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<SystemUser[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  const pageSize = 50

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (activeTab !== 'todos') params.set('status', activeTab)
      if (search) params.set('search', search)
      const res = await fetch(`/api/suporte?${params}`)
      const json = await res.json()
      const ticketList: Ticket[] = json.tickets ?? []
      setTickets(ticketList)
      setTotal(json.total ?? 0)
      // Keep selectedTicket in sync with latest data
      if (selectedTicket) {
        const updated = ticketList.find(t => t.id === selectedTicket.id)
        if (updated) setSelectedTicket(updated)
      }
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search, selectedTicket])

  useEffect(() => { loadTickets() }, [loadTickets])

  useEffect(() => {
    fetch('/api/usuarios')
      .then(r => r.json())
      .then((data: SystemUser[]) => setUsers(data))
      .catch(() => {})
  }, [])

  const updateTicket = async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/suporte/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await loadTickets()
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setSearch(searchInput)
  }

  function handleTabChange(key: string) {
    setActiveTab(key)
    setPage(0)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex h-full" style={{ margin: '-2rem', height: '100vh' }}>
      {/* ── Left: list ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <TicketCheck className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Suporte</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gerencie os chamados de suporte abertos pelos alunos via MARA.
              {total > 0 && <span className="ml-2 font-medium text-gray-700 dark:text-gray-300">{total} chamado(s)</span>}
            </p>
          </div>
          <button
            onClick={loadTickets}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar por protocolo, telefone ou assunto..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Buscar
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); setSearch(''); setPage(0) }}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Limpar
            </button>
          )}
        </form>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Protocolo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Aluno / Telefone</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Assunto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Abertura</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Atribuído a</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td>
                </tr>
              )}
              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum chamado encontrado.</td>
                </tr>
              )}
              {tickets.map(ticket => (
                <tr
                  key={ticket.id}
                  onClick={() => setSelectedTicket(t => t?.id === ticket.id ? null : ticket)}
                  className={`cursor-pointer transition-colors ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {ticket.protocol}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                      {ticket.students?.full_name ?? '—'}
                    </div>
                    <div className="text-gray-400 text-xs">{formatPhone(ticket.phone)}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={ticket.subject}>
                    {ticket.subject}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {fmt(ticket.opened_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {ticket.assigned_name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 shrink-0">
            <span>
              Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: ticket detail panel ── */}
      {selectedTicket && (
        <TicketPanel
          key={selectedTicket.id}
          ticket={selectedTicket}
          users={users}
          onClose={() => setSelectedTicket(null)}
          onUpdate={async (patch) => {
            await updateTicket(selectedTicket.id, patch)
          }}
        />
      )}
    </div>
  )
}
