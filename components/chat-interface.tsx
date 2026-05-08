'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MessageSquare, Search, User, Bot, Clock, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Tag, UserCheck, UserPlus, X, ChevronDown,
  RotateCcw, LogOut, Plus, Trash2, Info, GraduationCap, Mail,
  Phone, Calendar, ChevronRight, ChevronLeft, Smile, Paperclip,
  SendHorizontal, Mic, Square, Image as ImageIcon, FileText, AudioLines,
  PauseCircle, Play, NotebookPen, Lock,
} from 'lucide-react'
import { formatPhone } from '@/lib/utils'
import { EmojiPicker } from '@/components/emoji-picker'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemUser {
  id: string
  email: string
  name: string
  role: string
}

interface Label {
  id: string
  name: string
  color: string
}

interface Conversation {
  phone: string
  contact_name?: string | null
  last_message: string | null
  last_message_at: string | null
  status: string
  followup_stage: string | null
  assigned_to: string | null
  assigned_name: string | null
  labels: string[] | null
  lgpd_accepted_at: string | null
  mara_paused_until?: string | null
  mara_manual_paused?: boolean | null
  whatsapp_name?: string | null
  whatsapp_profile_pic_url?: string | null
  whatsapp_updated_at?: string | null
  students: { full_name: string; email: string } | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface Note {
  id: string
  phone: string
  user_id: string
  user_email: string
  user_name: string | null
  content: string
  created_at: string
}

type TimelineEntry =
  | { kind: 'message'; data: Message }
  | { kind: 'note'; data: Note }

interface PendingAttachment {
  file: File
  kind: 'image' | 'audio' | 'document'
  source: 'upload' | 'recording'
}

interface ConversationDetail {
  conversation: Conversation & {
    students: {
      full_name: string
      email: string | null
      courses: unknown[]
      role?: string | null
      username?: string | null
      phone?: string | null
      phone2?: string | null
      cpf?: string | null
      moodle_id?: number | null
    } | null
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
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectAttachmentKind(file: File): PendingAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function getConversationDisplayName(conv: Pick<Conversation, 'contact_name' | 'whatsapp_name' | 'phone' | 'students'>): string {
  return conv.contact_name?.trim()
    || conv.students?.full_name?.trim()
    || conv.whatsapp_name?.trim()
    || formatPhone(conv.phone)
}

function getConversationAvatarLabel(conv: Pick<Conversation, 'contact_name' | 'whatsapp_name' | 'phone' | 'students'>): string {
  const candidate = conv.contact_name?.trim() || conv.students?.full_name?.trim() || conv.whatsapp_name?.trim()
  return candidate ? initials(candidate) : formatPhone(conv.phone).slice(-2)
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
  const response = await fetch(`/api/conversas/${encodeURIComponent(phone)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error('Nao foi possivel atualizar a conversa.')
  }
}

function getAssignedDisplayName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null
  return name.split('@')[0]?.trim() || name.trim()
}

function getPauseBadgeMeta(
  conv: Pick<Conversation, 'assigned_to' | 'assigned_name' | 'mara_paused_until' | 'mara_manual_paused'>
) {
  const reasons: string[] = []
  const hasHumanOwner =
    (typeof conv.assigned_to === 'string' && conv.assigned_to.trim().length > 0) ||
    (typeof conv.assigned_name === 'string' && conv.assigned_name.trim().length > 0)
  const timedPauseActive =
    typeof conv.mara_paused_until === 'string' &&
    conv.mara_paused_until.length > 0 &&
    new Date(conv.mara_paused_until).getTime() > Date.now()

  if (hasHumanOwner) reasons.push('atendimento humano')
  if (conv.mara_manual_paused) reasons.push('manual')
  if (timedPauseActive) reasons.push(`ate ${fullTime(conv.mara_paused_until!)}`)

  return {
    blocked: reasons.length > 0,
    title: reasons.length > 0 ? `MARA pausada: ${reasons.join(' | ')}` : null,
    label: reasons.length > 0 ? `MARA pausada · ${reasons.join(' · ')}` : null,
  }
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

      <div className="chat-label-picker-list">
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
      </div>

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

// ─── Assign Picker ────────────────────────────────────────────────────────────

function AssignPicker({
  currentAssignedTo,
  currentAssignedName,
  allUsers,
  currentUser,
  onAssign,
  onUnassign,
  onClose,
  disabled,
}: {
  currentAssignedTo: string | null
  currentAssignedName: string | null
  allUsers: SystemUser[]
  currentUser: { id: string; email: string } | null
  onAssign: (userId: string, userName: string) => void
  onUnassign: () => void
  onClose: () => void
  disabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const displayName = (user: SystemUser) =>
    user.name !== user.email ? user.name : user.email.split('@')[0]

  return (
    <div
      ref={ref}
      className="chat-label-picker"
      style={{ minWidth: 200 }}
    >
      <p className="chat-label-picker-title">Atribuir conversa</p>

      {currentAssignedTo && (
        <button
          disabled={disabled}
          onClick={() => { onUnassign(); onClose() }}
          className="chat-label-picker-item"
          style={{ color: 'hsl(0 84% 55%)', opacity: disabled ? 0.5 : 1 }}
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
              disabled={disabled || isAssigned}
              onClick={() => { onAssign(u.id, u.email); onClose() }}
              className="chat-label-picker-item"
              style={{ opacity: disabled || isAssigned ? 0.6 : 1 }}
            >
              <div
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontSize: '0.55rem' }}
              >
                {displayName(u).slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 text-left truncate">
                {displayName(u)}{isMe ? ' (eu)' : ''}
              </span>
              {isAssigned && <CheckCircle2 size={12} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
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
  const name = getConversationDisplayName(conv)
  const sm = statusMeta(conv)
  const StatusIcon = sm.icon
  const pauseBadge = getPauseBadgeMeta(conv)
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
      <ContactAvatar
        name={name}
        photoUrl={conv.whatsapp_profile_pic_url}
        identified={!!(conv.students || conv.contact_name || conv.whatsapp_name)}
      />
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
          <div className="flex items-center gap-1.5 shrink-0">
            {!closed && pauseBadge.blocked && (
              <span title={pauseBadge.title ?? undefined}>
                <PauseCircle size={11} style={{ color: 'var(--chat-status-waiting)' }} />
              </span>
            )}
            <StatusIcon size={11} className="shrink-0" style={{ color: sm.color }} />
          </div>
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
  { id: 'nao_atribuidas', label: 'Não Atribuídas' },
  { id: 'encerradas',     label: 'Encerradas' },
]

function filterByTab(convs: Conversation[], tab: Tab, userId: string | null): Conversation[] {
  return convs.filter(c => {
    const closed = isClosed(c)
    switch (tab) {
      case 'todas':          return !closed
      case 'ao_vivo':        return !closed && c.status === 'active' && !c.followup_stage
      case 'minhas':         return !closed && userId != null && c.assigned_to === userId
      case 'nao_atribuidas': return !closed && !c.assigned_to
      case 'encerradas':     return closed
    }
  })
}

// Persiste a aba ativa entre navegações dentro da mesma sessão
let _persistedTab: Tab = 'todas'

// ─── Contact Info Panel ───────────────────────────────────────────────────────

function ContactPanel({
  conversation,
  allLabels,
  onClose,
}: {
  conversation: ConversationDetail['conversation']
  allLabels: Label[]
  onClose: () => void
}) {
  const student = conversation.students
  const labelIds = conversation.labels ?? []
  const labelMap = Object.fromEntries(allLabels.map(l => [l.id, l]))
  const courses = Array.isArray(student?.courses)
    ? (student.courses as { fullname?: string; shortname?: string }[])
    : []

  const Row = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
    <div className="contact-panel-row">
      <Icon size={13} className="shrink-0" style={{ color: 'var(--chat-avatar-text)' }} />
      <div className="min-w-0">
        <p className="contact-panel-label">{label}</p>
        <p className="contact-panel-value truncate">{value}</p>
      </div>
    </div>
  )

  return (
    <div className="contact-panel">
      {/* Header */}
      <div className="contact-panel-header">
        <span className="contact-panel-title">Informações</span>
        <button onClick={onClose} className="chat-icon-btn" title="Fechar">
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="contact-panel-body">
        {/* Avatar + name */}
        <div className="contact-panel-hero">
          <div
            className="chat-avatar"
            style={{ width: 52, height: 52, fontSize: '1rem' }}
            data-identified={!!student}
          >
            {student ? (student.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()) : <User size={22} />}
          </div>
          <p className="contact-panel-name">{student?.full_name ?? formatPhone(conversation.phone)}</p>
          <p className="contact-panel-phone-sm">{formatPhone(conversation.phone)}</p>
        </div>

        {/* Details */}
        <div className="contact-panel-section">
          <Row icon={Phone} label="Telefone" value={formatPhone(conversation.phone)} />
          {student?.email && <Row icon={Mail} label="E-mail" value={student.email} />}
          {conversation.assigned_name && (
            <Row icon={UserCheck} label="Atribuída a" value={getAssignedDisplayName(conversation.assigned_name) ?? conversation.assigned_name} />
          )}
          {conversation.lgpd_accepted_at && (
            <Row
              icon={CheckCircle2}
              label="LGPD aceita em"
              value={new Date(conversation.lgpd_accepted_at as string).toLocaleDateString('pt-BR')}
            />
          )}
          {conversation.last_message_at && (
            <Row
              icon={Calendar}
              label="Última mensagem"
              value={new Date(conversation.last_message_at).toLocaleString('pt-BR')}
            />
          )}
        </div>

        {/* Courses */}
        {courses.length > 0 && (
          <div className="contact-panel-section">
            <p className="contact-panel-section-title">
              <GraduationCap size={12} /> Cursos
            </p>
            {courses.map((c, i) => (
              <div key={i} className="contact-panel-course">
                {c.fullname ?? c.shortname ?? '—'}
              </div>
            ))}
          </div>
        )}

        {/* Labels */}
        {labelIds.length > 0 && (
          <div className="contact-panel-section">
            <p className="contact-panel-section-title">
              <Tag size={12} /> Etiquetas
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {labelIds.map(id => {
                const l = labelMap[id]
                return l ? (
                  <span key={id} className="chat-label-chip" style={{ '--label-color': l.color } as React.CSSProperties}>
                    {l.name}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function ContactDetailsPanel({
  conversation,
  allLabels,
  onClose,
  onSaveName,
  savingName,
}: {
  conversation: ConversationDetail['conversation']
  allLabels: Label[]
  onClose: () => void
  onSaveName: (value: string) => Promise<void>
  savingName: boolean
}) {
  const student = conversation.students
  const labelIds = conversation.labels ?? []
  const labelMap = Object.fromEntries(allLabels.map(l => [l.id, l]))
  const courses = Array.isArray(student?.courses)
    ? (student.courses as { fullname?: string; shortname?: string }[])
    : []
  const displayName = getConversationDisplayName(conversation)
  const [editableName, setEditableName] = useState(conversation.contact_name ?? '')

  useEffect(() => {
    setEditableName(conversation.contact_name ?? '')
  }, [conversation.contact_name, conversation.phone])

  const currentName = conversation.contact_name?.trim() ?? ''
  const nextName = editableName.trim()
  const nameChanged = nextName !== currentName

  const Row = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) => {
    if (!value) return null
    return (
      <div className="contact-panel-row">
        <Icon size={13} className="shrink-0" style={{ color: 'var(--chat-avatar-text)' }} />
        <div className="min-w-0">
          <p className="contact-panel-label">{label}</p>
          <p className="contact-panel-value">{value}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="contact-panel">
      <div className="contact-panel-header">
        <span className="contact-panel-title">Informacoes do contato</span>
        <button onClick={onClose} className="chat-icon-btn" title="Fechar">
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="contact-panel-body">
        <div className="contact-panel-hero">
          <ContactAvatar
            name={displayName}
            photoUrl={conversation.whatsapp_profile_pic_url}
            identified={!!(student || conversation.contact_name || conversation.whatsapp_name)}
            size="hero"
          />
          <p className="contact-panel-name">{displayName}</p>
          <p className="contact-panel-phone-sm">{formatPhone(conversation.phone)}</p>
          {conversation.whatsapp_name && conversation.whatsapp_name !== displayName && (
            <p className="contact-panel-helper">WhatsApp: {conversation.whatsapp_name}</p>
          )}
        </div>

        <div className="contact-panel-section">
          <p className="contact-panel-section-title">
            <User size={12} /> Identificacao
          </p>
          <div className="contact-panel-edit-row">
            <input
              className="contact-panel-input"
              placeholder="Adicionar nome do contato"
              value={editableName}
              onChange={(event) => setEditableName(event.target.value)}
            />
            <button
              className="contact-panel-save"
              onClick={() => void onSaveName(editableName)}
              disabled={savingName || !nameChanged}
            >
              {savingName ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          <p className="contact-panel-helper">
            Nome interno para a equipe. Em branco, o sistema usa o nome do WhatsApp ou o telefone.
          </p>
        </div>

        <div className="contact-panel-section">
          <p className="contact-panel-section-title">
            <Phone size={12} /> WhatsApp
          </p>
          <Row icon={Phone} label="Telefone" value={formatPhone(conversation.phone)} />
          <Row icon={User} label="Nome do WhatsApp" value={conversation.whatsapp_name} />
          <Row icon={UserCheck} label="Nome salvo na plataforma" value={conversation.contact_name} />
          <Row
            icon={Calendar}
            label="Perfil atualizado"
            value={conversation.whatsapp_updated_at ? new Date(conversation.whatsapp_updated_at).toLocaleString('pt-BR') : null}
          />
        </div>

        <div className="contact-panel-section">
          <p className="contact-panel-section-title">
            <Info size={12} /> Atendimento
          </p>
          <Row icon={Mail} label="E-mail" value={student?.email} />
          <Row icon={UserCheck} label="Atribuida a" value={getAssignedDisplayName(conversation.assigned_name) ?? null} />
          <Row
            icon={CheckCircle2}
            label="LGPD aceita em"
            value={conversation.lgpd_accepted_at ? new Date(conversation.lgpd_accepted_at).toLocaleDateString('pt-BR') : null}
          />
          <Row
            icon={Calendar}
            label="Ultima mensagem"
            value={conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString('pt-BR') : null}
          />
        </div>

        {student && (
          <div className="contact-panel-section">
            <p className="contact-panel-section-title">
              <GraduationCap size={12} /> Moodle
            </p>
            <Row icon={User} label="Nome no Moodle" value={student.full_name} />
            <Row icon={Mail} label="E-mail" value={student.email} />
            <Row icon={Info} label="Perfil" value={student.role} />
            <Row icon={UserCheck} label="Usuario" value={student.username} />
            <Row icon={Phone} label="Telefone principal" value={student.phone ? formatPhone(student.phone) : null} />
            <Row icon={Phone} label="Telefone alternativo" value={student.phone2 ? formatPhone(student.phone2) : null} />
            <Row icon={Info} label="Moodle ID" value={student.moodle_id ? String(student.moodle_id) : null} />
            <Row icon={Info} label="CPF" value={student.cpf} />
          </div>
        )}

        {courses.length > 0 && (
          <div className="contact-panel-section">
            <p className="contact-panel-section-title">
              <GraduationCap size={12} /> Cursos
            </p>
            {courses.map((course, index) => (
              <div key={index} className="contact-panel-course">
                {course.fullname ?? course.shortname ?? '-'}
              </div>
            ))}
          </div>
        )}

        {labelIds.length > 0 && (
          <div className="contact-panel-section">
            <p className="contact-panel-section-title">
              <Tag size={12} /> Etiquetas
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {labelIds.map(id => {
                const label = labelMap[id]
                return label ? (
                  <span key={id} className="chat-label-chip" style={{ '--label-color': label.color } as React.CSSProperties}>
                    {label.name}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

function ComposerAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment
  onRemove: () => void
}) {
  const Icon = attachment.kind === 'image'
    ? ImageIcon
    : attachment.kind === 'audio'
      ? AudioLines
      : FileText

  return (
    <div className="chat-composer-attachment">
      <div className="chat-composer-attachment-icon">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="chat-composer-attachment-name truncate">{attachment.file.name}</p>
        <p className="chat-composer-attachment-meta">
          {attachment.kind === 'image' ? 'Imagem' : attachment.kind === 'audio' ? 'Audio' : 'Arquivo'}
          {' · '}
          {formatBytes(attachment.file.size)}
        </p>
      </div>
      <button onClick={onRemove} className="chat-icon-btn" title="Remover anexo">
        <X size={12} />
      </button>
    </div>
  )
}

function ContactAvatar({
  name,
  photoUrl,
  identified,
  size = 'default',
}: {
  name: string
  photoUrl?: string | null
  identified: boolean
  size?: 'default' | 'large' | 'hero'
}) {
  const className = size === 'large' ? 'chat-avatar chat-avatar-lg' : size === 'hero' ? 'chat-avatar chat-avatar-hero' : 'chat-avatar'

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${className} chat-avatar-photo`}
      />
    )
  }

  return (
    <div className={className} data-identified={identified}>
      {initials(name)}
    </div>
  )
}

// ─── Message content parser ───────────────────────────────────────────────────

type ParsedContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'audio'; url: string; transcript: string }
  | { kind: 'audio_text'; transcript: string }
  | { kind: 'human_attendant'; text: string }

function parseChatContent(content: string): ParsedContent {
  if (content.startsWith('{"_meta":"human_attendant"')) {
    try {
      const payload = JSON.parse(content) as { _meta: string; text?: string }
      if (payload._meta === 'human_attendant') {
        return { kind: 'human_attendant', text: payload.text ?? '' }
      }
    } catch { /* fall through */ }
  }

  // New structured format: {"_media":"image"|"audio",...}
  if (content.startsWith('{"_media":')) {
    try {
      const p = JSON.parse(content) as { _media: string; url?: string; transcript?: string; caption?: string }
      if (p._media === 'image' && p.url) return { kind: 'image', url: p.url, caption: p.caption }
      if (p._media === 'audio' && p.url) return { kind: 'audio', url: p.url, transcript: p.transcript ?? '' }
      if (p._media === 'audio') return { kind: 'audio_text', transcript: p.transcript ?? '' }
    } catch { /* fall through */ }
  }

  // Legacy OpenAI vision format: [{"type":"image_url","image_url":{"url":"..."}}]
  if (content.startsWith('[{')) {
    try {
      const parts = JSON.parse(content) as Array<{ type: string; image_url?: { url: string }; text?: string }>
      const imgPart = parts.find(p => p.type === 'image_url')
      if (imgPart?.image_url?.url) {
        const caption = parts.find(p => p.type === 'text')?.text
        return { kind: 'image', url: imgPart.image_url.url, caption }
      }
    } catch { /* fall through */ }
  }

  // Legacy audio transcription text
  if (content.startsWith('[Audio transcrito]:')) {
    return { kind: 'audio_text', transcript: content.slice('[Audio transcrito]:'.length).trim() }
  }

  return { kind: 'text', text: content }
}

function MessageContent({ content }: { content: string }) {
  const parsed = parseChatContent(content)

  if (parsed.kind === 'image') {
    return (
      <div className="flex flex-col gap-1.5">
        <img
          src={parsed.url}
          alt={parsed.caption || 'Imagem'}
          className="max-w-[260px] rounded-xl object-cover"
          style={{ maxHeight: 320 }}
        />
        {parsed.caption && <p className="chat-bubble-text">{parsed.caption}</p>}
      </div>
    )
  }

  if (parsed.kind === 'audio') {
    return (
      <div className="flex flex-col gap-1.5" style={{ minWidth: 220 }}>
        <audio
          controls
          src={parsed.url}
          className="w-full"
          style={{ height: 36, borderRadius: 8, accentColor: 'var(--chat-status-active)' }}
        />
        {parsed.transcript && (
          <p className="chat-bubble-text" style={{ fontSize: '0.75rem', opacity: 0.75, fontStyle: 'italic' }}>
            "{parsed.transcript}"
          </p>
        )}
      </div>
    )
  }

  if (parsed.kind === 'audio_text') {
    return (
      <div className="flex items-start gap-2">
        <Mic size={13} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
        <p className="chat-bubble-text" style={{ fontStyle: 'italic' }}>"{parsed.transcript}"</p>
      </div>
    )
  }

  if (parsed.kind === 'human_attendant') {
    return <p className="chat-bubble-text">{parsed.text}</p>
  }

  return <p className="chat-bubble-text">{parsed.text}</p>
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  phone,
  allLabels,
  allUsers,
  currentUser,
  onRefresh,
  onLabelsChange,
  onConversationUpdate,
  onSetActing,
}: {
  phone: string
  allLabels: Label[]
  allUsers: SystemUser[]
  currentUser: { id: string; email: string } | null
  onRefresh: () => void | Promise<void>
  onLabelsChange: (labels: Label[]) => void
  onConversationUpdate: (phone: string, updates: Partial<Conversation>) => void
  onSetActing: (acting: boolean) => void
}) {
  const [data, setData] = useState<ConversationDetail | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [labelOpen, setLabelOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [acting, setActing] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/conversas/${encodeURIComponent(phone)}/notes`)
    if (res.ok) setNotes(await res.json())
  }, [phone])

  const load = useCallback(async () => {
    try {
      const [convRes] = await Promise.all([
        fetch(`/api/conversas/${encodeURIComponent(phone)}`),
        loadNotes(),
      ])
      if (convRes.ok) setData(await convRes.json())
    } finally {
      setLoading(false)
    }
  }, [phone, loadNotes])

  useEffect(() => { setLoading(true); setData(null); load() }, [load])
  useEffect(() => {
    const pollId = setInterval(load, 20000)

    // SSE: recebe eventos do servidor quando chega mensagem nova
    const es = new EventSource(`/api/conversas/${encodeURIComponent(phone)}/stream`)
    es.onmessage = () => { void load() }
    es.onerror = () => { /* cai no polling silenciosamente */ }

    return () => {
      clearInterval(pollId)
      es.close()
    }
  }, [load, phone])
  useEffect(() => {
    if (data?.messages?.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages?.length])
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setEmojiOpen(false)
      }
    }

    if (emojiOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      return () => document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [emojiOpen])
  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const act = async (fn: () => Promise<void>, optimistic?: () => void) => {
    onSetActing(true)
    optimistic?.()
    setActing(true)
    try {
      await fn()
    } finally {
      setActing(false)
      await Promise.all([load(), onRefresh()])
      onSetActing(false)
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

  const handleSaveName = async (value: string) => {
    setSavingName(true)
    try {
      await patchConversation(phone, { contact_name: value.trim() || null })
      await load()
      onRefresh()
    } finally {
      setSavingName(false)
    }
  }

  const insertEmoji = (emoji: string) => {
    setDraft(current => `${current}${emoji}`)
    setEmojiOpen(false)
    textareaRef.current?.focus()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPendingAttachment({
      file,
      kind: detectAttachmentKind(file),
      source: 'upload',
    })
    setComposerError(null)
    event.target.value = ''
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const toggleRecording = async () => {
    if (recording) {
      stopRecording()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })

      audioChunksRef.current = []
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener('stop', () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          const extension = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm'
          const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: recorder.mimeType || 'audio/webm' })
          setPendingAttachment({
            file,
            kind: 'audio',
            source: 'recording',
          })
          setComposerError(null)
        }

        mediaStreamRef.current?.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        setRecording(false)
      })

      recorder.start()
      setRecording(true)
      setComposerError(null)
    } catch (error) {
      console.error('[chat] Falha ao iniciar gravacao:', error)
      setComposerError('Nao foi possivel acessar o microfone neste navegador.')
    }
  }

  const sendMessage = async () => {
    const trimmed = draft.trim()
    if (!trimmed && !pendingAttachment) return

    setSending(true)
    setComposerError(null)

    const formData = new FormData()
    if (trimmed) formData.append('text', trimmed)
    if (pendingAttachment) formData.append('file', pendingAttachment.file)

    try {
      const res = await fetch(`/api/conversas/${encodeURIComponent(phone)}/send`, {
        method: 'POST',
        body: formData,
      })

      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.error ?? 'Falha ao enviar mensagem')
      }

      if (payload.message) {
        setData(current => current ? {
          ...current,
          messages: [...current.messages, payload.message as Message],
          conversation: {
            ...current.conversation,
            last_message: payload.message.content,
            last_message_at: payload.message.created_at,
          },
        } : current)
      }

      setDraft('')
      setPendingAttachment(null)
      if (textareaRef.current) {
        textareaRef.current.style.height = '38px'
      }
      await load()
      onRefresh()
    } catch (error) {
      console.error('[chat] Falha ao enviar mensagem:', error)
      setComposerError(error instanceof Error ? error.message : 'Nao foi possivel enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  const sendNote = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return

    setSending(true)
    setComposerError(null)

    try {
      const res = await fetch(`/api/conversas/${encodeURIComponent(phone)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      const payload = await res.json() as { note?: Note; error?: string }
      if (!res.ok) throw new Error(payload.error ?? 'Falha ao salvar nota')

      if (payload.note) setNotes(prev => [...prev, payload.note!])

      setDraft('')
      if (textareaRef.current) textareaRef.current.style.height = '38px'
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Nao foi possivel salvar a nota.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin chat-muted" />
      </div>
    )
  }
  if (!data?.conversation) return null

  const { conversation, messages } = data
  const student = conversation.students
  const name = getConversationDisplayName(conversation)
  const sm = statusMeta(conversation)
  const StatusIcon = sm.icon
  const pauseBadge = getPauseBadgeMeta(conversation)
  const labelIds = conversation.labels ?? []
  const closed = isClosed(conversation)
  const closeSource = closedBy(conversation)
  const isAssignedToMe = conversation.assigned_to === currentUser?.id
  const isAssignedToOther = !!conversation.assigned_to && !isAssignedToMe
  const assignedDisplayName = getAssignedDisplayName(conversation.assigned_name)

  // Mescla mensagens e notas em uma timeline ordenada por data
  const timeline: TimelineEntry[] = [
    ...messages.map(m => ({ kind: 'message' as const, data: m })),
    ...notes.map(n => ({ kind: 'note' as const, data: n })),
  ].sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime())

  const groups: { date: string; items: TimelineEntry[] }[] = []
  for (const entry of timeline) {
    const d = fullDate(entry.data.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.items.push(entry)
    else groups.push({ date: d, items: [entry] })
  }

  return (
    <div className="chat-main-shell">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="chat-panel-header">
        <ContactAvatar
          name={name}
          photoUrl={conversation.whatsapp_profile_pic_url}
          identified={!!(student || conversation.contact_name || conversation.whatsapp_name)}
          size="large"
        />
        <div className="flex-1 min-w-0">
          <p className="chat-panel-name truncate">{name}</p>
          <p className="chat-panel-phone">{formatPhone(phone)}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="chat-status-badge" style={{ '--badge-color': sm.color } as React.CSSProperties}>
            <StatusIcon size={11} />
            {sm.label}
          </span>

          {/* Badge pausa MARA — oculto em conversas encerradas */}
          {!closed && pauseBadge.blocked && pauseBadge.label && (
            <span
              className="chat-status-badge"
              title={pauseBadge.title ?? undefined}
              style={{ '--badge-color': 'var(--chat-status-waiting)' } as React.CSSProperties}
            >
              <PauseCircle size={11} />
              {pauseBadge.label}
            </span>
          )}

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

          {/* Assign picker */}
          {!closed && (
            <div className="relative">
              <button
                onClick={() => setAssignOpen(v => !v)}
                disabled={acting}
                className={`chat-action-btn ${conversation.assigned_to ? 'chat-action-btn--assigned' : 'chat-action-btn--primary'}`}
                title={conversation.assigned_to ? `Atribuída a ${assignedDisplayName ?? conversation.assigned_name}` : 'Atribuir conversa'}
              >
                {conversation.assigned_to ? <UserCheck size={14} /> : <UserPlus size={14} />}
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {conversation.assigned_to ? (assignedDisplayName ?? 'Atribuída') : 'Atribuir'}
                </span>
                <ChevronDown size={10} />
              </button>
              {assignOpen && (
                <AssignPicker
                  currentAssignedTo={conversation.assigned_to ?? null}
                  currentAssignedName={conversation.assigned_name ?? null}
                  allUsers={allUsers}
                  currentUser={currentUser}
                  onAssign={(userId, userName) => act(
                    () => patchConversation(phone, { assigned_to: userId, assigned_name: userName }),
                    () => onConversationUpdate(phone, { assigned_to: userId, assigned_name: userName })
                  )}
                  onUnassign={() => act(
                    () => patchConversation(phone, { assigned_to: null, assigned_name: null }),
                    () => onConversationUpdate(phone, { assigned_to: null, assigned_name: null })
                  )}
                  onClose={() => setAssignOpen(false)}
                  disabled={acting}
                />
              )}
            </div>
          )}

          {/* MARA pause */}
          {!closed && (
            <button
              onClick={() => act(() => patchConversation(phone, { mara_manual_paused: !conversation.mara_manual_paused }))}
              disabled={acting}
              className={`chat-action-btn ${conversation.mara_manual_paused ? 'chat-action-btn--manual-active' : 'chat-action-btn--manual'}`}
              title={conversation.mara_manual_paused ? 'Remover pausa manual da MARA' : 'Pausar MARA manualmente'}
            >
              {conversation.mara_manual_paused ? <Play size={14} /> : <PauseCircle size={14} />}
              <span className="hidden sm:inline">{conversation.mara_manual_paused ? 'Reativar MARA' : 'Pausar MARA'}</span>
            </button>
          )}

          {/* Close / Reopen */}
          {!closed ? (
            <button onClick={() => act(
              () => patchConversation(phone, { status: 'closed', followup_stage: null }),
              () => onConversationUpdate(phone, { status: 'closed', followup_stage: null, assigned_to: null, assigned_name: null, mara_paused_until: null, mara_manual_paused: false })
            )} disabled={acting} className="chat-action-btn chat-action-btn--danger">
              <LogOut size={14} />
              <span className="hidden sm:inline">Encerrar</span>
            </button>
          ) : (
            <button onClick={() => act(
              () => patchConversation(phone, { status: 'active', followup_stage: null }),
              () => onConversationUpdate(phone, { status: 'active', followup_stage: null })
            )} disabled={acting} className="chat-action-btn chat-action-btn--primary">
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reabrir</span>
            </button>
          )}

          <button
            onClick={() => setInfoOpen(v => !v)}
            className="chat-icon-btn"
            title="Informações do contato"
            data-active={infoOpen}
            style={infoOpen ? { color: 'var(--chat-avatar-text)', background: 'var(--chat-item-active)' } : {}}
          >
            <Info size={14} />
          </button>

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
              {assignedDisplayName}
            </span>
          )}
        </div>
      )}

      {/* Messages + Notes timeline */}
      <div className="flex-1 overflow-y-auto chat-messages-area" data-closed={closed}>
        {timeline.length === 0 ? (
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
                {group.items.map((entry, i) => {
                  if (entry.kind === 'note') {
                    const note = entry.data
                    const authorLabel = note.user_name?.trim() || note.user_email.split('@')[0]
                    return (
                      <div key={`note-${note.id}`} className="chat-note-row">
                        <div className="chat-note-bubble">
                          <div className="chat-note-header">
                            <Lock size={10} />
                            Nota privada
                          </div>
                          <p className="chat-note-text">{note.content}</p>
                          <div className="chat-note-footer">
                            <span>{authorLabel}</span>
                            <span>·</span>
                            <span>{fullTime(note.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  const msg = entry.data as Message
                  const isOutbound = msg.role === 'assistant'
                  const isLast = gi === groups.length - 1 && i === group.items.length - 1
                  return (
                    <div key={`msg-${i}`} className={`chat-bubble-row ${isOutbound ? 'chat-bubble-row--outgoing' : 'chat-bubble-row--incoming'}`}>
                      {!isOutbound && (
                        <div className="chat-bubble-avatar">
                          <ContactAvatar
                            name={name}
                            photoUrl={conversation.whatsapp_profile_pic_url}
                            identified={!!(student || conversation.contact_name || conversation.whatsapp_name)}
                          />
                        </div>
                      )}
                      <div className={`chat-bubble ${isOutbound ? 'chat-bubble--outgoing' : 'chat-bubble--incoming'} ${isLast && isOutbound && !closed ? 'chat-bubble--latest' : ''}`}>
                        <MessageContent content={msg.content} />
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

      <div className="chat-composer-shell" data-disabled={closed || sending}>
        {/* Faixa indicadora do modo nota */}
        {noteMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            background: 'color-mix(in srgb, hsl(45 96% 58%) 12%, transparent)',
            borderBottom: '1px dashed color-mix(in srgb, hsl(45 96% 48%) 35%, transparent)',
            fontSize: '0.72rem', fontFamily: 'Manrope, sans-serif', fontWeight: 600,
            color: 'hsl(38 90% 42%)',
          }}>
            <Lock size={11} />
            Modo nota — visível somente para a equipe
            <button
              onClick={() => setNoteMode(false)}
              style={{ marginLeft: 'auto', opacity: 0.7, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              title="Sair do modo nota"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {pendingAttachment && !noteMode && (
          <div className="chat-composer-attachments">
            <ComposerAttachmentChip
              attachment={pendingAttachment}
              onRemove={() => setPendingAttachment(null)}
            />
          </div>
        )}

        {composerError && (
          <div className="chat-composer-error">
            <AlertCircle size={14} />
            <span>{composerError}</span>
          </div>
        )}

        <div className="chat-composer-row">
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setEmojiOpen(value => !value)}
              className="chat-composer-tool"
              title="Inserir emoji"
              disabled={closed || sending}
            >
              <Smile size={16} />
            </button>
            {emojiOpen && (
              <EmojiPicker onInsert={insertEmoji} />
            )}
          </div>

          {!noteMode && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="chat-composer-tool"
                title="Enviar arquivo"
                disabled={closed || sending}
              >
                <Paperclip size={16} />
              </button>

              <button
                onClick={toggleRecording}
                className="chat-composer-tool"
                title={recording ? 'Parar gravacao' : 'Gravar audio'}
                disabled={closed || sending}
                data-recording={recording}
              >
                {recording ? <Square size={15} /> : <Mic size={16} />}
              </button>
            </>
          )}

          {/* Toggle modo nota */}
          <button
            onClick={() => { setNoteMode(v => !v); setPendingAttachment(null) }}
            className="chat-composer-tool"
            title={noteMode ? 'Sair do modo nota' : 'Adicionar nota privada'}
            data-note-active={noteMode}
            disabled={sending}
          >
            <NotebookPen size={15} />
          </button>

          <div className="chat-composer-input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-composer-input"
              data-note-mode={noteMode}
              placeholder={
                closed && !noteMode
                  ? 'Reabra a conversa para responder.'
                  : noteMode
                    ? 'Escreva uma nota privada (apenas para a equipe)…'
                    : 'Digite uma mensagem'
              }
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                event.currentTarget.style.height = '38px'
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 140)}px`
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (noteMode) void sendNote()
                  else void sendMessage()
                }
              }}
              rows={1}
              disabled={(closed && !noteMode) || sending}
            />
          </div>

          <button
            onClick={() => noteMode ? void sendNote() : void sendMessage()}
            className="chat-composer-send"
            data-note-mode={noteMode}
            disabled={(closed && !noteMode) || sending || (!draft.trim() && !pendingAttachment)}
            title={noteMode ? 'Salvar nota' : 'Enviar mensagem'}
          >
            {sending
              ? <RefreshCw size={16} className="animate-spin" />
              : noteMode
                ? <NotebookPen size={15} />
                : <SendHorizontal size={16} />}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.zip,.rar,.7z,.ppt,.pptx,.odt,.ods,.odp"
          onChange={handleFileChange}
        />
      </div>
      </div>

      <div className="chat-contact-drawer-wrap" data-open={infoOpen}>
        <button
          onClick={() => setInfoOpen(value => !value)}
          className="chat-contact-toggle"
          title={infoOpen ? 'Ocultar informacoes do contato' : 'Mostrar informacoes do contato'}
          data-open={infoOpen}
        >
          {infoOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {infoOpen && (
          <ContactDetailsPanel
            conversation={data.conversation}
            allLabels={allLabels}
            onClose={() => setInfoOpen(false)}
            onSaveName={handleSaveName}
            savingName={savingName}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main Interface ───────────────────────────────────────────────────────────

export default function ChatInterface({
  selectedPhone,
  initialCurrentUser,
}: {
  selectedPhone?: string
  initialCurrentUser?: { id: string; email: string } | null
}) {
  const [localPhone, setLocalPhone] = useState<string | null>(selectedPhone ?? null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [allUsers, setAllUsers] = useState<SystemUser[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>(_persistedTab)

  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/\/conversas\/(.+)/)
      setLocalPhone(match ? decodeURIComponent(match[1]) : null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const changeTab = (t: Tab) => { setTab(t); _persistedTab = t }
  const [loadingList, setLoadingList] = useState(true)
  const [currentUser] = useState<{ id: string; email: string } | null>(initialCurrentUser ?? null)
  const panelActingRef = useRef(false)

  const loadConversations = useCallback(async (force = false) => {
    if (panelActingRef.current && !force) return
    const res = await fetch('/api/conversas', { cache: 'no-store' })
    if (res.ok) setConversations(await res.json())
    setLoadingList(false)
  }, [])

  const updateConversationLocally = useCallback((phone: string, updates: Partial<Conversation>) => {
    setConversations(prev => prev.map(c => c.phone === phone ? { ...c, ...updates } : c))
  }, [])

  const loadLabels = useCallback(async () => {
    const res = await fetch('/api/labels')
    if (res.ok) setAllLabels(await res.json())
  }, [])

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/usuarios')
    if (res.ok) setAllUsers(await res.json())
  }, [])

  useEffect(() => {
    loadConversations()
    loadLabels()
    loadUsers()

    const pollId = setInterval(loadConversations, 30000)

    // SSE: recebe eventos do servidor quando qualquer conversa muda
    const es = new EventSource('/api/conversas/stream')
    es.onmessage = () => { void loadConversations() }
    es.onerror = () => { /* cai no polling silenciosamente */ }

    return () => {
      clearInterval(pollId)
      es.close()
    }
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
    return !q
      || c.contact_name?.toLowerCase().includes(q)
      || c.whatsapp_name?.toLowerCase().includes(q)
      || c.students?.full_name?.toLowerCase().includes(q)
      || c.phone.includes(q)
      || c.last_message?.toLowerCase().includes(q)
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
              <button key={t.id} className="chat-tab" data-active={tab === t.id} onClick={() => changeTab(t.id)}>
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
                selected={conv.phone === localPhone}
                allLabels={allLabels}
                onClick={() => {
                  setLocalPhone(conv.phone)
                  window.history.pushState(null, '', `/conversas/${encodeURIComponent(conv.phone)}`)
                }}
                currentUserId={uid}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="chat-panel">
        {localPhone ? (
          <ChatPanel
            key={localPhone}
            phone={localPhone}
            allLabels={allLabels}
            allUsers={allUsers}
            currentUser={currentUser}
            onRefresh={() => loadConversations(true)}
            onLabelsChange={setAllLabels}
            onConversationUpdate={updateConversationLocally}
            onSetActing={(v) => { panelActingRef.current = v }}
          />
        ) : (
          <EmptyPane />
        )}
      </div>
    </>
  )
}
