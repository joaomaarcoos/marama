'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Search, RefreshCw, SendHorizontal,
  Smile, ChevronRight, ChevronLeft, UserPlus, UserCheck,
  X, CheckCircle2,
} from 'lucide-react'
import { EmojiPicker } from '@/components/emoji-picker'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemUser {
  id: string
  email: string
  name: string
}

interface CoordConversation {
  phone: string
  name: string | null
  profile_pic_url: string | null
  last_message: string | null
  last_message_at: string | null
  assigned_to: string | null
  assigned_name: string | null
}

interface CoordMessage {
  id: string
  phone: string
  direction: 'inbound' | 'outbound'
  content: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return raw
}

function getDisplayName(conv: CoordConversation): string {
  return conv.name?.trim() || formatPhone(conv.phone)
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function userDisplayName(u: SystemUser): string {
  return u.name !== u.email ? u.name : u.email.split('@')[0]
}

function assignedDisplayName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null
  return name.split('@')[0]?.trim() || name.trim()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoUrl, size = 'default' }: { name: string; photoUrl?: string | null; size?: 'default' | 'large' | 'hero' }) {
  const sizeClass = size === 'hero' ? 'chat-avatar chat-avatar-hero' : size === 'large' ? 'chat-avatar chat-avatar-lg' : 'chat-avatar'
  if (photoUrl) return <img src={photoUrl} alt={name} className={`${sizeClass} chat-avatar-photo`} />
  return <div className={sizeClass} data-identified>{initials(name)}</div>
}

// ─── Assign Picker ────────────────────────────────────────────────────────────

function AssignPicker({
  currentAssignedTo,
  allUsers,
  currentUser,
  onAssign,
  onUnassign,
  onClose,
  saving,
}: {
  currentAssignedTo: string | null
  allUsers: SystemUser[]
  currentUser: { id: string; email: string } | null
  onAssign: (userId: string, userName: string) => void
  onUnassign: () => void
  onClose: () => void
  saving: boolean
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
    <div ref={ref} className="chat-label-picker" style={{ minWidth: 210 }}>
      <p className="chat-label-picker-title">Atribuir conversa</p>

      {currentAssignedTo && (
        <button
          disabled={saving}
          onClick={() => { onUnassign(); onClose() }}
          className="chat-label-picker-item"
          style={{ color: 'hsl(0 84% 55%)', opacity: saving ? 0.5 : 1 }}
        >
          <X size={12} style={{ flexShrink: 0 }} />
          <span>Desatribuir</span>
        </button>
      )}

      <div className="chat-label-picker-list">
        {allUsers.map(u => {
          const isAssigned = u.id === currentAssignedTo
          const isMe = u.id === currentUser?.id
          return (
            <button
              key={u.id}
              disabled={saving || isAssigned}
              onClick={() => { onAssign(u.id, u.email); onClose() }}
              className="chat-label-picker-item"
              style={{ opacity: saving || isAssigned ? 0.6 : 1 }}
            >
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontSize: '0.55rem' }}
              >
                {userDisplayName(u).slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 text-left truncate">
                {userDisplayName(u)}{isMe ? ' (eu)' : ''}
              </span>
              {isAssigned && <CheckCircle2 size={12} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Empty pane ───────────────────────────────────────────────────────────────

function EmptyPane() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 chat-empty-pane">
      <div className="chat-empty-icon"><MessageSquare size={28} /></div>
      <div className="text-center">
        <p className="chat-empty-title">Nenhuma conversa selecionada</p>
        <p className="chat-empty-sub">Selecione uma conversa ao lado</p>
      </div>
    </div>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function CoordChatPanel({
  phone,
  allUsers,
  currentUser,
  onRefresh,
}: {
  phone: string
  allUsers: SystemUser[]
  currentUser: { id: string; email: string } | null
  onRefresh: () => void
}) {
  const [messages, setMessages] = useState<CoordMessage[]>([])
  const [conversation, setConversation] = useState<CoordConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversacoordenacao/${encodeURIComponent(phone)}`)
      if (res.ok) {
        const data = await res.json() as { conversation: CoordConversation; messages: CoordMessage[] }
        setConversation(data.conversation)
        setMessages(data.messages)
      }
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => { setLoading(true); setMessages([]); setConversation(null); load() }, [load])

  useEffect(() => {
    const pollId = setInterval(load, 20000)
    const es = new EventSource(`/api/conversacoordenacao/${encodeURIComponent(phone)}/stream`)
    es.onmessage = () => { void load() }
    return () => { clearInterval(pollId); es.close() }
  }, [load, phone])

  useEffect(() => {
    if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!emojiOpen) return
    function handler(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emojiOpen])

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/conversacoordenacao/${encodeURIComponent(phone)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const payload = await res.json() as { message?: CoordMessage; error?: string }
      if (!res.ok) throw new Error(payload.error ?? 'Erro ao enviar')
      if (payload.message) {
        setMessages(prev => [...prev, payload.message!])
        setConversation(prev => prev ? { ...prev, last_message: text, last_message_at: payload.message!.created_at } : prev)
      }
      setDraft('')
      if (textareaRef.current) textareaRef.current.style.height = '38px'
      onRefresh()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  const patchAssign = async (assignedTo: string | null, assignedName: string | null) => {
    setAssigning(true)
    try {
      await fetch(`/api/conversacoordenacao/${encodeURIComponent(phone)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo, assigned_name: assignedName }),
      })
      setConversation(prev => prev ? { ...prev, assigned_to: assignedTo, assigned_name: assignedName } : prev)
      onRefresh()
    } finally {
      setAssigning(false)
    }
  }

  // Agrupar por data
  const groups: { date: string; msgs: CoordMessage[] }[] = []
  for (const msg of messages) {
    const d = fullDate(msg.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.msgs.push(msg)
    else groups.push({ date: d, msgs: [msg] })
  }

  const name = conversation ? getDisplayName(conversation) : formatPhone(phone)
  const assignedName = assignedDisplayName(conversation?.assigned_name)
  const isAssignedToMe = conversation?.assigned_to === currentUser?.id

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin chat-muted" />
      </div>
    )
  }

  return (
    <div className="chat-main-shell">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="chat-panel-header">
          <Avatar name={name} photoUrl={conversation?.profile_pic_url} size="large" />
          <div className="flex-1 min-w-0">
            <p className="chat-panel-name truncate">{name}</p>
            <p className="chat-panel-phone">{formatPhone(phone)}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Assign button */}
            <div className="relative">
              <button
                onClick={() => setAssignOpen(v => !v)}
                disabled={assigning}
                className={`chat-action-btn ${conversation?.assigned_to ? 'chat-action-btn--assigned' : 'chat-action-btn--primary'}`}
                title={conversation?.assigned_to ? `Atribuída a ${assignedName ?? conversation.assigned_name}` : 'Atribuir conversa'}
              >
                {conversation?.assigned_to ? <UserCheck size={14} /> : <UserPlus size={14} />}
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {conversation?.assigned_to ? (assignedName ?? 'Atribuída') : 'Atribuir'}
                </span>
              </button>
              {assignOpen && (
                <AssignPicker
                  currentAssignedTo={conversation?.assigned_to ?? null}
                  allUsers={allUsers}
                  currentUser={currentUser}
                  onAssign={(userId, userName) => patchAssign(userId, userName)}
                  onUnassign={() => patchAssign(null, null)}
                  onClose={() => setAssignOpen(false)}
                  saving={assigning}
                />
              )}
            </div>

            <button
              onClick={() => setInfoOpen(v => !v)}
              className="chat-icon-btn"
              title="Informações"
              data-active={infoOpen}
              style={infoOpen ? { color: 'var(--chat-avatar-text)', background: 'var(--chat-item-active)' } : {}}
            >
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => { void load(); onRefresh() }} className="chat-icon-btn" title="Atualizar">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Assigned strip */}
        {assignedName && (
          <div className="chat-student-strip">
            <UserCheck size={11} />
            <span>Atribuída a {assignedName}{isAssignedToMe ? ' (você)' : ''}</span>
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
                  <div className="chat-date-sep"><span>{group.date}</span></div>
                  {group.msgs.map((msg, i) => {
                    const isOutbound = msg.direction === 'outbound'
                    return (
                      <div key={i} className={`chat-bubble-row ${isOutbound ? 'chat-bubble-row--outgoing' : 'chat-bubble-row--incoming'}`}>
                        {!isOutbound && (
                          <div className="chat-bubble-avatar">
                            <Avatar name={name} photoUrl={conversation?.profile_pic_url} />
                          </div>
                        )}
                        <div className={`chat-bubble ${isOutbound ? 'chat-bubble--outgoing' : 'chat-bubble--incoming'}`}>
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

        {/* Composer */}
        <div className="chat-composer-shell" data-disabled={sending}>
          {sendError && (
            <div className="chat-composer-error" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.75rem', color: 'hsl(0 84% 50%)' }}>
              {sendError}
            </div>
          )}
          <div className="chat-composer-row">
            <div className="relative" ref={emojiRef}>
              <button onClick={() => setEmojiOpen(v => !v)} className="chat-composer-tool" title="Emoji" disabled={sending}>
                <Smile size={16} />
              </button>
              {emojiOpen && <EmojiPicker onInsert={emoji => { setDraft(d => `${d}${emoji}`); setEmojiOpen(false); textareaRef.current?.focus() }} />}
            </div>

            <div className="chat-composer-input-wrap">
              <textarea
                ref={textareaRef}
                className="chat-composer-input"
                placeholder="Digite uma mensagem"
                value={draft}
                onChange={e => {
                  setDraft(e.target.value)
                  e.currentTarget.style.height = '38px'
                  e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
                }}
                rows={1}
                disabled={sending}
              />
            </div>

            <button
              onClick={() => void sendMessage()}
              className="chat-composer-send"
              disabled={sending || !draft.trim()}
              title="Enviar"
            >
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Info Drawer */}
      <div className="chat-contact-drawer-wrap" data-open={infoOpen}>
        <button
          onClick={() => setInfoOpen(v => !v)}
          className="chat-contact-toggle"
          data-open={infoOpen}
          title={infoOpen ? 'Ocultar' : 'Mostrar informações'}
        >
          {infoOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {infoOpen && conversation && (
          <div className="contact-panel">
            <div className="contact-panel-header">
              <span className="contact-panel-title">Contato</span>
              <button onClick={() => setInfoOpen(false)} className="chat-icon-btn"><ChevronRight size={15} /></button>
            </div>
            <div className="contact-panel-body">
              <div className="contact-panel-hero">
                <Avatar name={name} photoUrl={conversation.profile_pic_url} size="hero" />
                <p className="contact-panel-name">{name}</p>
                <p className="contact-panel-phone-sm">{formatPhone(phone)}</p>
              </div>
              <div className="contact-panel-section">
                <div className="contact-panel-row">
                  <div className="min-w-0">
                    <p className="contact-panel-label">Telefone</p>
                    <p className="contact-panel-value">{formatPhone(phone)}</p>
                  </div>
                </div>
                {conversation.name && (
                  <div className="contact-panel-row">
                    <div className="min-w-0">
                      <p className="contact-panel-label">Nome no WhatsApp</p>
                      <p className="contact-panel-value">{conversation.name}</p>
                    </div>
                  </div>
                )}
                {assignedName && (
                  <div className="contact-panel-row">
                    <div className="min-w-0">
                      <p className="contact-panel-label">Atribuída a</p>
                      <p className="contact-panel-value">{assignedName}</p>
                    </div>
                  </div>
                )}
                {conversation.last_message_at && (
                  <div className="contact-panel-row">
                    <div className="min-w-0">
                      <p className="contact-panel-label">Última mensagem</p>
                      <p className="contact-panel-value">{new Date(conversation.last_message_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CoordChatInterface({
  selectedPhone,
  initialCurrentUser,
}: {
  selectedPhone?: string
  initialCurrentUser?: { id: string; email: string } | null
}) {
  const router = useRouter()
  const [conversations, setConversations] = useState<CoordConversation[]>([])
  const [allUsers, setAllUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentUser] = useState(initialCurrentUser ?? null)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversacoordenacao')
    if (res.ok) setConversations(await res.json())
    setLoading(false)
  }, [])

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/usuarios')
    if (res.ok) {
      const data = await res.json() as SystemUser[]
      setAllUsers(data)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    loadUsers()
    const pollId = setInterval(loadConversations, 30000)
    const es = new EventSource('/api/conversacoordenacao/stream')
    es.onmessage = () => { void loadConversations() }
    return () => { clearInterval(pollId); es.close() }
  }, [loadConversations, loadUsers])

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.phone.includes(q)
  })

  return (
    <>
      {/* Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="flex items-center justify-between mb-3">
            <h1 className="chat-sidebar-title">Coordenação</h1>
            {conversations.length > 0 && <span className="chat-count-badge">{conversations.length}</span>}
          </div>
          <div className="chat-search-wrap">
            <Search size={14} className="chat-search-icon" />
            <input
              className="chat-search-input"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="chat-conv-list">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="animate-spin chat-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="chat-muted text-sm">Nenhuma conversa</p>
              <p className="chat-muted text-xs mt-1">Aguardando mensagens recebidas via WhatsApp</p>
            </div>
          ) : (
            filtered.map(conv => {
              const name = getDisplayName(conv)
              const selected = conv.phone === selectedPhone
              const isAssignedToMe = conv.assigned_to === currentUser?.id
              const aName = assignedDisplayName(conv.assigned_name)
              return (
                <button
                  key={conv.phone}
                  onClick={() => router.push(`/conversacoordenacao/${encodeURIComponent(conv.phone)}`)}
                  className="chat-conv-item w-full text-left"
                  data-selected={selected}
                >
                  <Avatar name={name} photoUrl={conv.profile_pic_url} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="chat-conv-name truncate">{name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAssignedToMe && <UserCheck size={11} style={{ color: 'var(--chat-status-active)' }} />}
                        <span className="chat-conv-time">{relativeTime(conv.last_message_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="chat-conv-preview truncate">{conv.last_message ?? '—'}</span>
                      {aName && !isAssignedToMe && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--chat-text-dim)', flexShrink: 0 }}>
                          {aName.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Panel */}
      <div className="chat-panel">
        {selectedPhone ? (
          <CoordChatPanel
            key={selectedPhone}
            phone={selectedPhone}
            allUsers={allUsers}
            currentUser={currentUser}
            onRefresh={loadConversations}
          />
        ) : (
          <EmptyPane />
        )}
      </div>
    </>
  )
}
