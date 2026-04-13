'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Search, User, Bot, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  phone: string
  last_message: string | null
  last_message_at: string | null
  status: string
  followup_stage: string | null
  students: { full_name: string; email: string } | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ConversationDetail {
  conversation: Conversation & { students: { full_name: string; email: string; courses: unknown[] } | null }
  messages: Message[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fullDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function statusMeta(conv: Conversation) {
  if (conv.followup_stage === 'closed') return { label: 'Encerrado', color: 'var(--chat-status-closed)', icon: XCircle }
  if (conv.followup_stage === 'followup_1') return { label: 'Aguardando', color: 'var(--chat-status-waiting)', icon: AlertCircle }
  if (conv.status === 'active') return { label: 'Ativo', color: 'var(--chat-status-active)', icon: CheckCircle2 }
  return { label: 'Inativo', color: 'var(--chat-status-closed)', icon: Clock }
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  conv,
  selected,
  onClick,
}: {
  conv: Conversation
  selected: boolean
  onClick: () => void
}) {
  const name = conv.students?.full_name ?? formatPhone(conv.phone)
  const sm = statusMeta(conv)
  const Icon = sm.icon

  return (
    <button
      onClick={onClick}
      className="chat-conv-item w-full text-left"
      data-selected={selected}
    >
      {/* Avatar */}
      <div className="chat-avatar" data-identified={!!conv.students}>
        {conv.students ? initials(name) : <User size={16} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="chat-conv-name truncate">{name}</span>
          <span className="chat-conv-time shrink-0">{relativeTime(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="chat-conv-preview truncate">{conv.last_message ?? '—'}</span>
          <Icon size={11} className="shrink-0" style={{ color: sm.color }} />
        </div>
      </div>
    </button>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyPane() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 chat-empty-pane">
      <div className="chat-empty-icon">
        <MessageSquare size={28} />
      </div>
      <div className="text-center">
        <p className="chat-empty-title">Nenhuma conversa selecionada</p>
        <p className="chat-empty-sub">Selecione uma conversa ao lado para visualizar o histórico</p>
      </div>
    </div>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ phone, onRefresh }: { phone: string; onRefresh: () => void }) {
  const [data, setData] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversas/${encodeURIComponent(phone)}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => {
    setLoading(true)
    setData(null)
    load()
  }, [load])

  // Auto-refresh every 8s
  useEffect(() => {
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (data?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [data?.messages?.length])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin chat-muted" />
      </div>
    )
  }

  if (!data) return null

  const { conversation, messages } = data
  const student = conversation?.students
  const name = student?.full_name ?? formatPhone(phone)
  const sm = statusMeta(conversation)
  const StatusIcon = sm.icon

  // Group messages by date
  const groups: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const d = fullDate(msg.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.msgs.push(msg)
    else groups.push({ date: d, msgs: [msg] })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="chat-avatar chat-avatar-lg" data-identified={!!student}>
          {student ? initials(name) : <User size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="chat-panel-name truncate">{name}</p>
          <p className="chat-panel-phone">{formatPhone(phone)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chat-status-badge" style={{ '--badge-color': sm.color } as React.CSSProperties}>
            <StatusIcon size={11} />
            {sm.label}
          </span>
          <button onClick={() => { load(); onRefresh() }} className="chat-icon-btn" title="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Student info strip */}
      {student?.email && (
        <div className="chat-student-strip">
          <Bot size={12} />
          <span>{student.email}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-messages-area">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="chat-muted text-sm">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          <div className="chat-messages-inner">
            {groups.map((group, gi) => (
              <div key={gi}>
                {/* Date separator */}
                <div className="chat-date-sep">
                  <span>{group.date}</span>
                </div>

                {group.msgs.map((msg, i) => {
                  const isBot = msg.role === 'assistant'
                  const isLast = gi === groups.length - 1 && i === group.msgs.length - 1

                  return (
                    <div
                      key={i}
                      className={`chat-bubble-row ${isBot ? 'chat-bubble-row--bot' : 'chat-bubble-row--user'}`}
                    >
                      {isBot && (
                        <div className="chat-bubble-avatar">
                          <Bot size={12} />
                        </div>
                      )}
                      <div className={`chat-bubble ${isBot ? 'chat-bubble--bot' : 'chat-bubble--user'} ${isLast && isBot ? 'chat-bubble--latest' : ''}`}>
                        <p className="chat-bubble-text">{msg.content}</p>
                        <span className="chat-bubble-time">{fullTime(msg.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Interface ───────────────────────────────────────────────────────────

export default function ChatInterface({ selectedPhone }: { selectedPhone?: string }) {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loadingList, setLoadingList] = useState(true)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversas')
    if (res.ok) setConversations(await res.json())
    setLoadingList(false)
  }, [])

  useEffect(() => {
    loadConversations()
    const id = setInterval(loadConversations, 15000)
    return () => clearInterval(id)
  }, [loadConversations])

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      c.students?.full_name?.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {/* ── Left Sidebar ── */}
      <div className="chat-sidebar">
        {/* Sidebar header */}
        <div className="chat-sidebar-header">
          <div className="flex items-center justify-between mb-4">
            <h1 className="chat-sidebar-title">Conversas</h1>
            {conversations.length > 0 && (
              <span className="chat-count-badge">{conversations.length}</span>
            )}
          </div>
          <div className="chat-search-wrap">
            <Search size={14} className="chat-search-icon" />
            <input
              className="chat-search-input"
              placeholder="Buscar conversa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="chat-conv-list">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="animate-spin chat-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="chat-muted text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filtered.map(conv => (
              <ConvItem
                key={conv.phone}
                conv={conv}
                selected={conv.phone === selectedPhone}
                onClick={() => router.push(`/conversas/${encodeURIComponent(conv.phone)}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="chat-panel">
        {selectedPhone
          ? <ChatPanel key={selectedPhone} phone={selectedPhone} onRefresh={loadConversations} />
          : <EmptyPane />
        }
      </div>
    </>
  )
}
