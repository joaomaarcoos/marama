'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Search, User, Bot, Clock, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Tag, UserCheck, UserPlus, X, ChevronDown,
  RotateCcw, LogOut, Plus, Trash2,
} from 'lucide-react'
import { formatPhone } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Label {
  id: string
  name: string
  color: string
}

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
  conversation: Conversation & {
    students: { full_name: string; email: string; courses: unknown[] } | null
  }
  messages: Message[]
}

type Tab = 'todas' | 'ao_vivo' | 'minhas' | 'nao_atribuidas' | 'encerradas'

// ─── Color palette for new labels ────────────────────────────────────────────

const COLOR_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#94a3b8',
]

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

function isClosed(conv: Pick<Conversation, 'status' | 'followup_stage'>): boolean {
  return conv.status === 'closed' || conv.followup_stage === 'closed'
}

// Auto = closed via inactivity (followup_stage was set); Manual = user clicked button
function closedBy(conv: Pick<Conversation, 'status' | 'followup_stage'>): 'auto' | 'manual' | null {
  if (!isClosed(conv)) return null
  return conv.followup_stage === 'closed' ? 'auto' : 'manual'
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

function LabelChips({
  labelIds,
  allLabels,
  max = 3,
}: {
  labelIds: string[]
  allLabels: Label[]
  max?: number
}) {
  const map = Object.fromEntries(allLabels.map(l => [l.id, l]))
  const shown = labelIds.slice(0, max)
  const rest = labelIds.length - max

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(id => {
        const l = map[id]
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
        <span
          className="chat-label-chip"
          style={{ '--label-color': 'var(--chat-text-dim)' } as React.CSSProperties}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

// ─── Label Picker Popover ─────────────────────────────────────────────────────

function LabelPicker({
  currentIds,
  allLabels,
  onToggle,
  onCreated,
  onDeleted,
  onClose,
}: {
  currentIds: string[]
  allLabels: Label[]
  onToggle: (id: string) => void
  onCreated: (label: Label) => void
  onDeleted: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_SWATCHES[4])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleCreate = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (res.ok) {
        const label = await res.json() as Label
        onCreated(label)
        setNewName('')
        setCreating(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/labels/${id}`, { method: 'DELETE' })
    onDeleted(id)
  }

  return (
    <div ref={ref} className="chat-label-picker">
      <p className="chat-label-picker-title">Etiquetas</p>

      {allLabels.length === 0 && !creating && (
        <p className="px-2 py-2 text-xs" style={{ color: 'var(--chat-text-muted)' }}>
          Nenhuma etiqueta criada ainda.
        </p>
      )}

      {allLabels.map(l => {
        const active = currentIds.includes(l.id)
        return (
          <div key={l.id} className="chat-label-picker-item group">
            <button
              className="flex items-center gap-2 flex-1 min-w-0"
              onClick={() => onToggle(l.id)}
            >
              <span className="chat-label-dot" style={{ background: l.color }} />
              <span className="flex-1 text-left truncate">{l.name}</span>
              {active && <CheckCircle2 size={12} style={{ color: l.color, flexShrink: 0 }} />}
            </button>
            <button
              onClick={() => handleDelete(l.id)}
              className="chat-label-delete opacity-0 group-hover:opacity-100"
              title="Remover etiqueta"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )
      })}

      {/* Create new label */}
      {creating ? (
        <div className="chat-label-create-form">
          <input
            autoFocus
            className="chat-label-name-input"
            placeholder="Nome da etiqueta"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
            maxLength={24}
          />
          <div className="chat-color-swatches">
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                className="chat-color-swatch"
                data-active={newColor === c}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
                title={c}
              />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="chat-create-btn"
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
              Criar
            </button>
            <button onClick={() => setCreating(false)} className="chat-cancel-btn">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="chat-label-picker-item chat-label-new-btn"
        >
          <Plus size={12} />
          Nova etiqueta
        </button>
      )}
    </div>
  )
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  conv,
  selected,
  allLabels,
  onClick,
  currentUserId,
}: {
  conv: Conversation
  selected: boolean
  allLabels: Label[]
  onClick: () => void
  currentUserId: string | null
}) {
  const name = conv.students?.full_name ?? formatPhone(conv.phone)
  const sm = statusMeta(conv)
  const StatusIcon = sm.icon
  const labelIds = conv.labels ?? []
  const closed = isClosed(conv)
  const isAssignedToMe = conv.assigned_to === currentUserId

  return (
    <button
      onClick={onClick}
      className="chat-conv-item w-full text-left"
      data-selected={selected}
      data-closed={closed}
    >
      <div className="chat-avatar" data-identified={!!conv.students}>
        {conv.students ? initials(name) : <User size={16} />}
      </div>
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
        {labelIds.length > 0 && (
          <LabelChips labelIds={labelIds} allLabels={allLabels} max={3} />
        )}
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
  allLabels,
  currentUser,
  onRefresh,
  onLabelsChange,
}: {
  phone: string
  allLabels: Label[]
  currentUser: { id: string; email: string } | null
  onRefresh: () => void
  onLabelsChange: (labels: Label[]) => void
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

  useEffect(() => { setLoading(true); setData(null); load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])
  useEffect(() => {
    if (data?.messages?.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages?.length])

  const act = async (fn: () => Promise<void>) => {
    setActing(true)
    try { await fn() } finally { setActing(false); await load(); onRefresh() }
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
  const labelIds = conversation.labels ?? []
  const closed = isClosed(conversation)
  const closeSource = closedBy(conversation)
  const isAssignedToMe = conversation.assigned_to === currentUser?.id
  const isAssignedToOther = !!conversation.assigned_to && !isAssignedToMe

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

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="chat-status-badge" style={{ '--badge-color': sm.color } as React.CSSProperties}>
            <StatusIcon size={11} />
            {sm.label}
          </span>

          {/* Labels */}
          <div className="relative">
            <button onClick={() => setLabelOpen(v => !v)} className="chat-action-btn" title="Etiquetas">
              <Tag size={14} />
              <ChevronDown size={10} />
            </button>
            {labelOpen && (
              <LabelPicker
                currentIds={labelIds}
                allLabels={allLabels}
                onToggle={handleToggleLabel}
                onCreated={l => onLabelsChange([...allLabels, l])}
                onDeleted={id => onLabelsChange(allLabels.filter(l => l.id !== id))}
                onClose={() => setLabelOpen(false)}
              />
            )}
          </div>

          {/* Assign */}
          {!isAssignedToMe && !isAssignedToOther && !closed && (
            <button onClick={() => act(() => patchConversation(phone, { assigned_to: currentUser?.id, assigned_name: currentUser?.email }))} disabled={acting || !currentUser} className="chat-action-btn chat-action-btn--primary">
              <UserPlus size={14} />
              <span className="hidden sm:inline">Atribuir</span>
            </button>
          )}
          {isAssignedToMe && (
            <button onClick={() => act(() => patchConversation(phone, { assigned_to: null, assigned_name: null }))} disabled={acting} className="chat-action-btn chat-action-btn--assigned">
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
            <button onClick={() => act(() => patchConversation(phone, { status: 'closed', followup_stage: null }))} disabled={acting} className="chat-action-btn chat-action-btn--danger">
              <LogOut size={14} />
              <span className="hidden sm:inline">Encerrar</span>
            </button>
          ) : (
            <button onClick={() => act(() => patchConversation(phone, { status: 'active', followup_stage: null }))} disabled={acting} className="chat-action-btn chat-action-btn--primary">
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reabrir</span>
            </button>
          )}

          <button onClick={() => { load(); onRefresh() }} className="chat-icon-btn">
            <RefreshCw size={13} className={acting ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Labels strip */}
      {labelIds.length > 0 && (
        <div className="chat-labels-strip">
          <Tag size={11} />
          <LabelChips labelIds={labelIds} allLabels={allLabels} max={10} />
        </div>
      )}

      {/* Student strip */}
      {(student?.email || conversation.assigned_name) && (
        <div className="chat-student-strip">
          {student?.email && <><Bot size={12} /><span>{student.email}</span></>}
          {conversation.assigned_name && (
            <span className={student?.email ? 'ml-auto' : ''} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              <div className={`chat-closed-banner ${closeSource === 'auto' ? 'chat-closed-banner--auto' : ''}`}>
                <XCircle size={13} />
                {closeSource === 'auto'
                  ? 'Conversa encerrada automaticamente pela MARA por inatividade'
                  : 'Conversa encerrada manualmente'}
              </div>
            )}
            {groups.map((group, gi) => (
              <div key={gi}>
                <div className="chat-date-sep"><span>{group.date}</span></div>
                {group.msgs.map((msg, i) => {
                  const isBot = msg.role === 'assistant'
                  const isLast = gi === groups.length - 1 && i === group.msgs.length - 1
                  return (
                    <div key={i} className={`chat-bubble-row ${isBot ? 'chat-bubble-row--bot' : 'chat-bubble-row--user'}`}>
                      {isBot && <div className="chat-bubble-avatar"><Bot size={12} /></div>}
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
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('todas')
  const [loadingList, setLoadingList] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)

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

  const loadLabels = useCallback(async () => {
    const res = await fetch('/api/labels')
    if (res.ok) setAllLabels(await res.json())
  }, [])

  useEffect(() => {
    loadConversations()
    loadLabels()
    const id = setInterval(loadConversations, 15000)
    return () => clearInterval(id)
  }, [loadConversations, loadLabels])

  const uid = currentUser?.id ?? null
  const tabCounts: Record<Tab, number> = {
    todas:          filterByTab(conversations, 'todas', uid).length,
    ao_vivo:        filterByTab(conversations, 'ao_vivo', uid).length,
    minhas:         filterByTab(conversations, 'minhas', uid).length,
    nao_atribuidas: filterByTab(conversations, 'nao_atribuidas', uid).length,
    encerradas:     filterByTab(conversations, 'encerradas', uid).length,
  }

  const filtered = filterByTab(conversations, tab, uid).filter(c => {
    const q = search.toLowerCase()
    return !q || c.students?.full_name?.toLowerCase().includes(q) || c.phone.includes(q) || c.last_message?.toLowerCase().includes(q)
  })

  return (
    <>
      {/* ── Left Sidebar ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="flex items-center justify-between mb-3">
            <h1 className="chat-sidebar-title">Conversas</h1>
            {tabCounts[tab] > 0 && <span className="chat-count-badge">{tabCounts[tab]}</span>}
          </div>
          <div className="chat-search-wrap mb-3">
            <Search size={14} className="chat-search-icon" />
            <input className="chat-search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="chat-tabs">
            {TAB_DEFS.map(t => (
              <button key={t.id} className="chat-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {tabCounts[t.id] > 0 && <span className="chat-tab-count">{tabCounts[t.id]}</span>}
              </button>
            ))}
          </div>
        </div>

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
                allLabels={allLabels}
                onClick={() => router.push(`/conversas/${encodeURIComponent(conv.phone)}`)}
                currentUserId={uid}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="chat-panel">
        {selectedPhone ? (
          <ChatPanel
            key={selectedPhone}
            phone={selectedPhone}
            allLabels={allLabels}
            currentUser={currentUser}
            onRefresh={loadConversations}
            onLabelsChange={setAllLabels}
          />
        ) : (
          <EmptyPane />
        )}
      </div>
    </>
  )
}
