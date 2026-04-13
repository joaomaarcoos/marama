'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Search, User, Bot, Clock, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Tag, UserCheck, UserPlus, X, ChevronDown,
  RotateCcw, LogOut,
} from 'lucide-react'
import { formatPhone } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  phone: string
  last_message: string | null
  last_message_at: string | null
  status: string
  followup_stage: string | null
  assigned_to: string | null
  assigned_name: string | null
  labels: string[] | null
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

type Tab = 'todas' | 'ao_vivo' | 'minhas' | 'nao_atribuidas' | 'encerradas'

// ─── Predefined Labels ────────────────────────────────────────────────────────

const LABELS: { id: string; name: string; color: string }[] = [
  { id: 'urgente',      name: 'Urgente',      color: '#ef4444' },
  { id: 'duvida',       name: 'Dúvida',       color: '#f59e0b' },
  { id: 'nota',         name: 'Nota/Grade',   color: '#3b82f6' },
  { id: 'certificado',  name: 'Certificado',  color: '#8b5cf6' },
  { id: 'matricula',    name: 'Matrícula',    color: '#06b6d4' },
  { id: 'tecnico',      name: 'Técnico',      color: '#f97316' },
  { id: 'resolvido',    name: 'Resolvido',    color: '#22c55e' },
]

const LABEL_MAP = Object.fromEntries(LABELS.map(l => [l.id, l]))

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

function isClosed(conv: Conversation): boolean {
  return conv.status === 'closed' || conv.followup_stage === 'closed'
}

function statusMeta(conv: Conversation) {
  if (isClosed(conv))
    return { label: 'Encerrado', color: 'var(--chat-status-closed)', icon: XCircle }
  if (conv.followup_stage === 'followup_1')
    return { label: 'Aguardando', color: 'var(--chat-status-waiting)', icon: AlertCircle }
  if (conv.status === 'active')
    return { label: 'Ativo', color: 'var(--chat-status-active)', icon: CheckCircle2 }
  return { label: 'Inativo', color: 'var(--chat-status-closed)', icon: Clock }
}

async function patchConversation(phone: string, body: Record<string, unknown>) {
  await fetch(`/api/conversas/${encodeURIComponent(phone)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Label Chips ──────────────────────────────────────────────────────────────

function LabelChips({ labels, max = 2 }: { labels: string[]; max?: number }) {
  const shown = labels.slice(0, max)
  const rest = labels.length - max
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(id => {
        const l = LABEL_MAP[id]
        if (!l) return null
        return (
          <span
            key={id}
            className="chat-label-chip"
            style={{ '--label-color': l.color } as React.CSSProperties}
          >
            {l.name}
          </span>
        )
      })}
      {rest > 0 && (
        <span className="chat-label-chip" style={{ '--label-color': 'var(--chat-text-dim)' } as React.CSSProperties}>
          +{rest}
        </span>
      )}
    </div>
  )
}

// ─── Label Picker Popover ─────────────────────────────────────────────────────

function LabelPicker({
  currentLabels,
  onToggle,
  onClose,
}: {
  currentLabels: string[]
  onToggle: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="chat-label-picker">
      <p className="chat-label-picker-title">Etiquetas</p>
      {LABELS.map(l => {
        const active = currentLabels.includes(l.id)
        return (
          <button
            key={l.id}
            className="chat-label-picker-item"
            data-active={active}
            onClick={() => onToggle(l.id)}
          >
            <span className="chat-label-dot" style={{ background: l.color }} />
            <span className="flex-1 text-left">{l.name}</span>
            {active && <X size={12} />}
          </button>
        )
      })}
    </div>
  )
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  conv,
  selected,
  onClick,
  currentUserId,
}: {
  conv: Conversation
  selected: boolean
  onClick: () => void
  currentUserId: string | null
}) {
  const name = conv.students?.full_name ?? formatPhone(conv.phone)
  const sm = statusMeta(conv)
  const StatusIcon = sm.icon
  const labels = conv.labels ?? []
  const closed = isClosed(conv)
  const isAssignedToMe = conv.assigned_to === currentUserId

  return (
    <button
      onClick={onClick}
      className="chat-conv-item w-full text-left"
      data-selected={selected}
      data-closed={closed}
    >
      {/* Avatar */}
      <div className="chat-avatar" data-identified={!!conv.students}>
        {conv.students ? initials(name) : <User size={16} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="chat-conv-name truncate">{name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isAssignedToMe && <UserCheck size={11} style={{ color: 'var(--chat-status-active)' }} />}
            <span className="chat-conv-time">{relativeTime(conv.last_message_at)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="chat-conv-preview truncate">{conv.last_message ?? '—'}</span>
          <StatusIcon size={11} className="shrink-0" style={{ color: sm.color }} />
        </div>
        {labels.length > 0 && <LabelChips labels={labels} max={3} />}
      </div>
    </button>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_DEFS: { id: Tab; label: string }[] = [
  { id: 'todas',          label: 'Todas' },
  { id: 'ao_vivo',        label: 'Ao Vivo' },
  { id: 'minhas',         label: 'Minhas' },
  { id: 'nao_atribuidas', label: 'Não Atrib.' },
  { id: 'encerradas',     label: 'Encerradas' },
]

function filterByTab(convs: Conversation[], tab: Tab, userId: string | null): Conversation[] {
  return convs.filter(c => {
    const closed = isClosed(c)
    switch (tab) {
      case 'todas':          return !closed
      case 'ao_vivo':        return c.status === 'active' && !c.followup_stage && !closed
      case 'minhas':         return c.assigned_to === userId
      case 'nao_atribuidas': return !c.assigned_to && !closed
      case 'encerradas':     return closed
    }
  })
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
        <p className="chat-empty-sub">Selecione uma conversa ao lado</p>
      </div>
    </div>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  phone,
  currentUser,
  onRefresh,
}: {
  phone: string
  currentUser: { id: string; email: string } | null
  onRefresh: () => void
}) {
  const [data, setData] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [labelOpen, setLabelOpen] = useState(false)
  const [acting, setActing] = useState(false)
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

  useEffect(() => {
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (data?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [data?.messages?.length])

  const act = async (fn: () => Promise<void>) => {
    setActing(true)
    try { await fn() } finally {
      setActing(false)
      await load()
      onRefresh()
    }
  }

  const handleToggleLabel = async (labelId: string) => {
    if (!data) return
    const current = data.conversation.labels ?? []
    const next = current.includes(labelId)
      ? current.filter(l => l !== labelId)
      : [...current, labelId]
    await patchConversation(phone, { labels: next })
    await load()
  }

  const handleAssign = async () => {
    if (!currentUser) return
    await act(() => patchConversation(phone, {
      assigned_to: currentUser.id,
      assigned_name: currentUser.email,
    }))
  }

  const handleUnassign = async () => {
    await act(() => patchConversation(phone, {
      assigned_to: null,
      assigned_name: null,
    }))
  }

  const handleClose = async () => {
    await act(() => patchConversation(phone, {
      status: 'closed',
      followup_stage: 'closed',
    }))
  }

  const handleReopen = async () => {
    await act(() => patchConversation(phone, {
      status: 'active',
      followup_stage: null,
    }))
  }

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
  const labels = conversation.labels ?? []
  const closed = isClosed(conversation)
  const isAssignedToMe = conversation.assigned_to === currentUser?.id
  const isAssignedToOther = !!conversation.assigned_to && !isAssignedToMe

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

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Status badge */}
          <span className="chat-status-badge" style={{ '--badge-color': sm.color } as React.CSSProperties}>
            <StatusIcon size={11} />
            {sm.label}
          </span>

          {/* Labels button */}
          <div className="relative">
            <button
              onClick={() => setLabelOpen(v => !v)}
              className="chat-action-btn"
              title="Etiquetas"
            >
              <Tag size={14} />
              <ChevronDown size={10} />
            </button>
            {labelOpen && (
              <LabelPicker
                currentLabels={labels}
                onToggle={handleToggleLabel}
                onClose={() => setLabelOpen(false)}
              />
            )}
          </div>

          {/* Assign */}
          {!isAssignedToMe && !isAssignedToOther && !closed && (
            <button
              onClick={handleAssign}
              disabled={acting}
              className="chat-action-btn chat-action-btn--primary"
              title="Atribuir a mim"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Atribuir</span>
            </button>
          )}
          {isAssignedToMe && (
            <button
              onClick={handleUnassign}
              disabled={acting}
              className="chat-action-btn chat-action-btn--assigned"
              title="Remover atribuição"
            >
              <UserCheck size={14} />
              <span className="hidden sm:inline">Atribuída</span>
            </button>
          )}
          {isAssignedToOther && (
            <span className="chat-assigned-other" title={`Atribuída a ${conversation.assigned_name}`}>
              <UserCheck size={12} />
              <span className="truncate max-w-[80px]">{conversation.assigned_name?.split('@')[0]}</span>
            </span>
          )}

          {/* Close / Reopen */}
          {!closed ? (
            <button
              onClick={handleClose}
              disabled={acting}
              className="chat-action-btn chat-action-btn--danger"
              title="Encerrar conversa"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Encerrar</span>
            </button>
          ) : (
            <button
              onClick={handleReopen}
              disabled={acting}
              className="chat-action-btn chat-action-btn--primary"
              title="Reabrir conversa"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reabrir</span>
            </button>
          )}

          {/* Refresh */}
          <button onClick={() => { load(); onRefresh() }} className="chat-icon-btn" title="Atualizar">
            <RefreshCw size={13} className={acting ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Labels strip */}
      {labels.length > 0 && (
        <div className="chat-labels-strip">
          <Tag size={11} />
          <LabelChips labels={labels} max={10} />
        </div>
      )}

      {/* Student info strip */}
      {student?.email && (
        <div className="chat-student-strip">
          <Bot size={12} />
          <span>{student.email}</span>
          {conversation.assigned_name && (
            <span className="ml-auto flex items-center gap-1">
              <UserCheck size={11} />
              {conversation.assigned_name.split('@')[0]}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-messages-area" data-closed={closed}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="chat-muted text-sm">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          <div className="chat-messages-inner">
            {closed && (
              <div className="chat-closed-banner">
                <XCircle size={13} />
                Conversa encerrada
              </div>
            )}
            {groups.map((group, gi) => (
              <div key={gi}>
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
                      <div className={`chat-bubble ${isBot ? 'chat-bubble--bot' : 'chat-bubble--user'} ${isLast && isBot && !closed ? 'chat-bubble--latest' : ''}`}>
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
  const [tab, setTab] = useState<Tab>('todas')
  const [loadingList, setLoadingList] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)

  // Get current auth user
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUser({ id: data.user.id, email: data.user.email ?? '' })
    })
  }, [])

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

  const tabCounts: Record<Tab, number> = {
    todas:          filterByTab(conversations, 'todas', currentUser?.id ?? null).length,
    ao_vivo:        filterByTab(conversations, 'ao_vivo', currentUser?.id ?? null).length,
    minhas:         filterByTab(conversations, 'minhas', currentUser?.id ?? null).length,
    nao_atribuidas: filterByTab(conversations, 'nao_atribuidas', currentUser?.id ?? null).length,
    encerradas:     filterByTab(conversations, 'encerradas', currentUser?.id ?? null).length,
  }

  const tabFiltered = filterByTab(conversations, tab, currentUser?.id ?? null)

  const filtered = tabFiltered.filter(c => {
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
        {/* Header */}
        <div className="chat-sidebar-header">
          <div className="flex items-center justify-between mb-3">
            <h1 className="chat-sidebar-title">Conversas</h1>
            {tabCounts[tab] > 0 && (
              <span className="chat-count-badge">{tabCounts[tab]}</span>
            )}
          </div>
          <div className="chat-search-wrap mb-3">
            <Search size={14} className="chat-search-icon" />
            <input
              className="chat-search-input"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div className="chat-tabs">
            {TAB_DEFS.map(t => (
              <button
                key={t.id}
                className="chat-tab"
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className="chat-tab-count">{tabCounts[t.id]}</span>
                )}
              </button>
            ))}
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
              <p className="chat-muted text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filtered.map(conv => (
              <ConvItem
                key={conv.phone}
                conv={conv}
                selected={conv.phone === selectedPhone}
                onClick={() => router.push(`/conversas/${encodeURIComponent(conv.phone)}`)}
                currentUserId={currentUser?.id ?? null}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="chat-panel">
        {selectedPhone
          ? <ChatPanel key={selectedPhone} phone={selectedPhone} currentUser={currentUser} onRefresh={loadConversations} />
          : <EmptyPane />
        }
      </div>
    </>
  )
}
