import { adminClient } from './supabase/admin'

export type AttendanceWindowKey = 'today' | '7d' | '30d' | '90d'

interface LabelRow {
  id: string
  name: string
  color: string
}

interface ConversationRow {
  phone: string
  contact_name: string | null
  last_message: string | null
  last_message_at: string | null
  status: string | null
  followup_stage: string | null
  assigned_to: string | null
  assigned_name: string | null
  labels: string[] | null
  lgpd_accepted_at: string | null
  students: {
    full_name: string | null
    email: string | null
    role: string | null
  } | null
}

interface ChatMessageRow {
  session_id: string
  role: string
  content: string | null
  created_at: string
}

export interface AttendanceTopic {
  name: string
  count: number
  source: 'label' | 'keyword'
}

export interface AttendantSummary {
  attendant: string
  total: number
  active: number
  closed: number
  pending: number
}

export interface AttendanceItem {
  phone: string
  displayName: string
  studentName: string | null
  email: string | null
  role: string | null
  handlerType: 'mara' | 'humano'
  attendant: string | null
  labels: string[]
  lastMessageAt: string | null
  lastMessage: string | null
  status: string | null
  followupStage: string | null
  lgpdAcceptedAt: string | null
  userMessageCount: number
  assistantMessageCount: number
}

export interface AttendanceReport {
  window: AttendanceWindowKey
  windowLabel: string
  from: string
  to: string
  totals: {
    total: number
    mara: number
    humano: number
    closed: number
    pending: number
    withLgpd: number
    userMessages: number
    assistantMessages: number
  }
  topics: AttendanceTopic[]
  attendants: AttendantSummary[]
  items: AttendanceItem[]
}

const WINDOW_OPTIONS: Record<AttendanceWindowKey, { label: string; days: number | null }> = {
  today: { label: 'Hoje', days: 0 },
  '7d': { label: 'Ultimos 7 dias', days: 7 },
  '30d': { label: 'Ultimos 30 dias', days: 30 },
  '90d': { label: 'Ultimos 90 dias', days: 90 },
}

const KEYWORD_TOPICS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Acesso e login', pattern: /\b(login|senha|acesso|entrar|usuario|usuário|portal)\b/i },
  { name: 'Matricula e inscricao', pattern: /\b(matricula|matrícula|inscri|vaga|cadastro)\b/i },
  { name: 'Certificado', pattern: /\b(certificado|certifica|declaracao|declaração)\b/i },
  { name: 'Notas e progresso', pattern: /\b(nota|notas|media|média|progresso|desempenho|atividade|atividades)\b/i },
  { name: 'Cursos e trilhas', pattern: /\b(curso|cursos|trilha|aula|aulas|modulo|módulo)\b/i },
  { name: 'Documentos e CPF', pattern: /\b(cpf|documento|rg|comprovante|arquivo)\b/i },
  { name: 'WhatsApp e atendimento', pattern: /\b(whatsapp|mensagem|atendimento|mara|suporte)\b/i },
  { name: 'Pagamentos e financeiro', pattern: /\b(pagamento|boleto|financeiro|taxa|pix)\b/i },
]

function getWindowRange(window: AttendanceWindowKey) {
  const option = WINDOW_OPTIONS[window] ?? WINDOW_OPTIONS['30d']
  const now = new Date()
  const to = new Date(now)
  const from = new Date(now)

  if (option.days === 0) {
    from.setHours(0, 0, 0, 0)
  } else if (option.days) {
    from.setDate(from.getDate() - option.days)
  }

  return {
    label: option.label,
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

function conversationDisplayName(conversation: ConversationRow) {
  return conversation.contact_name?.trim()
    || conversation.students?.full_name?.trim()
    || conversation.phone
}

function normalizeAttendantName(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
}

function isClosed(conversation: Pick<ConversationRow, 'status' | 'followup_stage'>) {
  return conversation.status === 'closed' || conversation.followup_stage === 'closed'
}

function isPending(conversation: Pick<ConversationRow, 'followup_stage'>) {
  return conversation.followup_stage === 'followup_1'
}

function countTopics(items: AttendanceItem[], labelMap: Map<string, LabelRow>, messageMap: Map<string, string[]>) {
  const counts = new Map<string, AttendanceTopic>()

  for (const item of items) {
    if (item.labels.length > 0) {
      for (const labelId of item.labels) {
        const label = labelMap.get(labelId)
        if (!label) continue
        const current = counts.get(label.name)
        counts.set(label.name, {
          name: label.name,
          source: 'label',
          count: (current?.count ?? 0) + 1,
        })
      }
      continue
    }

    const messages = messageMap.get(item.phone) ?? []
    const joined = messages.join(' \n ')
    for (const topic of KEYWORD_TOPICS) {
      if (!topic.pattern.test(joined)) continue
      const current = counts.get(topic.name)
      counts.set(topic.name, {
        name: topic.name,
        source: 'keyword',
        count: (current?.count ?? 0) + 1,
      })
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 10)
}

function buildAttendantSummary(items: AttendanceItem[]) {
  const summaries = new Map<string, AttendantSummary>()

  for (const item of items) {
    if (!item.attendant) continue
    const key = item.attendant
    const current = summaries.get(key) ?? {
      attendant: key,
      total: 0,
      active: 0,
      closed: 0,
      pending: 0,
    }

    current.total += 1
    if (isClosed({ status: item.status, followup_stage: item.followupStage })) current.closed += 1
    else current.active += 1
    if (item.followupStage === 'followup_1') current.pending += 1

    summaries.set(key, current)
  }

  return Array.from(summaries.values()).sort((a, b) => b.total - a.total)
}

export async function getAttendanceReport(window: AttendanceWindowKey = '30d'): Promise<AttendanceReport> {
  const { from, to, label } = getWindowRange(window)

  const [conversationsResult, labelsResult, messagesResult] = await Promise.all([
    adminClient
      .from('conversations')
      .select('phone, contact_name, last_message, last_message_at, status, followup_stage, assigned_to, assigned_name, labels, lgpd_accepted_at, students(full_name, email, role)')
      .gte('last_message_at', from)
      .lte('last_message_at', to)
      .order('last_message_at', { ascending: false }),
    adminClient
      .from('labels')
      .select('id, name, color')
      .order('created_at', { ascending: true }),
    adminClient
      .from('chatmemory')
      .select('session_id, role, content, created_at')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  if (conversationsResult.error) throw new Error(conversationsResult.error.message)
  if (labelsResult.error) throw new Error(labelsResult.error.message)
  if (messagesResult.error) throw new Error(messagesResult.error.message)

  const conversations = (conversationsResult.data ?? []) as ConversationRow[]
  const labels = (labelsResult.data ?? []) as LabelRow[]
  const messages = (messagesResult.data ?? []) as ChatMessageRow[]
  const labelMap = new Map(labels.map((label) => [label.id, label]))

  const messageStats = new Map<string, { user: number; assistant: number }>()
  const topicMessages = new Map<string, string[]>()

  for (const message of messages) {
    const stat = messageStats.get(message.session_id) ?? { user: 0, assistant: 0 }
    if (message.role === 'user') stat.user += 1
    if (message.role === 'assistant') stat.assistant += 1
    messageStats.set(message.session_id, stat)

    if (message.role === 'user' && message.content?.trim()) {
      const current = topicMessages.get(message.session_id) ?? []
      current.push(message.content.trim())
      topicMessages.set(message.session_id, current)
    }
  }

  const items: AttendanceItem[] = conversations.map((conversation) => {
    const stats = messageStats.get(conversation.phone) ?? { user: 0, assistant: 0 }
    const attendant = normalizeAttendantName(conversation.assigned_name)

    return {
      phone: conversation.phone,
      displayName: conversationDisplayName(conversation),
      studentName: conversation.students?.full_name ?? null,
      email: conversation.students?.email ?? null,
      role: conversation.students?.role ?? null,
      handlerType: attendant ? 'humano' : 'mara',
      attendant,
      labels: conversation.labels ?? [],
      lastMessageAt: conversation.last_message_at,
      lastMessage: conversation.last_message,
      status: conversation.status,
      followupStage: conversation.followup_stage,
      lgpdAcceptedAt: conversation.lgpd_accepted_at,
      userMessageCount: stats.user,
      assistantMessageCount: stats.assistant,
    }
  })

  const topics = countTopics(items, labelMap, topicMessages)
  const attendants = buildAttendantSummary(items)

  return {
    window,
    windowLabel: label,
    from,
    to,
    totals: {
      total: items.length,
      mara: items.filter((item) => item.handlerType === 'mara').length,
      humano: items.filter((item) => item.handlerType === 'humano').length,
      closed: items.filter((item) => isClosed({ status: item.status, followup_stage: item.followupStage })).length,
      pending: items.filter((item) => isPending({ followup_stage: item.followupStage })).length,
      withLgpd: items.filter((item) => !!item.lgpdAcceptedAt).length,
      userMessages: items.reduce((sum, item) => sum + item.userMessageCount, 0),
      assistantMessages: items.reduce((sum, item) => sum + item.assistantMessageCount, 0),
    },
    topics,
    attendants,
    items,
  }
}

export function buildAttendanceCsv(report: AttendanceReport) {
  const rows = [
    [
      'janela',
      'telefone',
      'contato',
      'aluno',
      'email',
      'tipo_atendimento',
      'atendente',
      'status',
      'followup',
      'lgpd',
      'mensagens_usuario',
      'mensagens_assistente',
      'ultima_mensagem_em',
      'ultima_mensagem',
      'etiquetas',
    ],
    ...report.items.map((item) => [
      report.windowLabel,
      item.phone,
      item.displayName,
      item.studentName ?? '',
      item.email ?? '',
      item.handlerType,
      item.attendant ?? '',
      item.status ?? '',
      item.followupStage ?? '',
      item.lgpdAcceptedAt ? 'sim' : 'nao',
      String(item.userMessageCount),
      String(item.assistantMessageCount),
      item.lastMessageAt ?? '',
      (item.lastMessage ?? '').replace(/\s+/g, ' ').trim(),
      item.labels.join(' | '),
    ]),
  ]

  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n')
}
