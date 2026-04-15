import { NextRequest, NextResponse } from 'next/server'
import { processMessages } from '@/lib/mara-agent'
import { startInactivityScheduler } from '@/lib/inactivity-scheduler'
import { adminClient } from '@/lib/supabase/admin'
import { normalizeConversationId, toWhatsAppJid } from '@/lib/utils'

// Inicia o scheduler de inatividade junto com o servidor (sem cron externo)
startInactivityScheduler()

// ─── Debounce: acumula mensagens por telefone por até 3s ──────────────────────

interface PendingMessage {
  type: 'text' | 'audio' | 'image' | 'document' | 'unknown'
  text?: string
  caption?: string
  mediaId?: string
  mimetype?: string
}

interface PendingEntry {
  messages: PendingMessage[]
  replyTarget: string
  pushName: string | null
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingEntry>()
const DEBOUNCE_MS = 3000

function getCandidateStrings(values: Array<unknown>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

function resolveContactRouting(data: Record<string, unknown>, key: Record<string, unknown>) {
  const originalJid = typeof key.remoteJid === 'string' ? key.remoteJid.trim() : ''
  if (!originalJid || originalJid.endsWith('@g.us')) return null

  const candidates = getCandidateStrings([
    key.remoteJidAlt,
    data.remoteJidAlt,
    key.participantAlt,
    data.participantAlt,
    key.senderPn,
    data.senderPn,
    key.participant,
    data.participant,
    originalJid,
  ])

  const preferredRealCandidate = candidates.find((value) => !value.endsWith('@lid'))
  const originalId = normalizeConversationId(originalJid)
  const realId = normalizeConversationId(preferredRealCandidate)

  if (!originalId) return null

  return {
    originalJid,
    originalId,
    realJid: toWhatsAppJid(preferredRealCandidate),
    sessionId: realId ?? originalId,
    replyTarget: realId ?? originalId,
  }
}

async function rekeyConversation(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return

  const [{ data: fromConversation }, { data: toConversation }] = await Promise.all([
    adminClient.from('conversations').select('*').eq('phone', fromId).maybeSingle(),
    adminClient.from('conversations').select('*').eq('phone', toId).maybeSingle(),
  ])

  if (!fromConversation) return

  if (!toConversation) {
    const { error: updateConversationError } = await adminClient
      .from('conversations')
      .update({ phone: toId })
      .eq('phone', fromId)

    if (updateConversationError) throw updateConversationError

    const { error: updateHistoryError } = await adminClient
      .from('chatmemory')
      .update({ session_id: toId })
      .eq('session_id', fromId)

    if (updateHistoryError) throw updateHistoryError
    return
  }

  const fromTime = fromConversation.last_message_at ? new Date(fromConversation.last_message_at).getTime() : 0
  const toTime = toConversation.last_message_at ? new Date(toConversation.last_message_at).getTime() : 0
  const mergedLabels = Array.from(new Set([...(toConversation.labels ?? []), ...(fromConversation.labels ?? [])]))

  const { error: moveHistoryError } = await adminClient
    .from('chatmemory')
    .update({ session_id: toId })
    .eq('session_id', fromId)

  if (moveHistoryError) throw moveHistoryError

  const { error: updateConversationError } = await adminClient
    .from('conversations')
    .update({
      contact_name: toConversation.contact_name ?? fromConversation.contact_name,
      student_id: toConversation.student_id ?? fromConversation.student_id,
      status: toConversation.status === 'active' ? toConversation.status : fromConversation.status,
      last_message: toTime >= fromTime ? toConversation.last_message : fromConversation.last_message,
      last_message_at: toTime >= fromTime ? toConversation.last_message_at : fromConversation.last_message_at,
      message_count: Math.max(toConversation.message_count ?? 0, fromConversation.message_count ?? 0),
      lgpd_accepted_at: toConversation.lgpd_accepted_at ?? fromConversation.lgpd_accepted_at,
      followup_stage: toConversation.followup_stage ?? fromConversation.followup_stage,
      followup_sent_at: toConversation.followup_sent_at ?? fromConversation.followup_sent_at,
      assigned_to: toConversation.assigned_to ?? fromConversation.assigned_to,
      assigned_name: toConversation.assigned_name ?? fromConversation.assigned_name,
      labels: mergedLabels,
      updated_at: new Date().toISOString(),
    })
    .eq('phone', toId)

  if (updateConversationError) throw updateConversationError

  const { error: deleteConversationError } = await adminClient
    .from('conversations')
    .delete()
    .eq('phone', fromId)

  if (deleteConversationError) throw deleteConversationError
}

function enqueue(sessionId: string, replyTarget: string, message: PendingMessage, pushName: string | null) {
  const existing = pending.get(sessionId)

  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push(message)
    existing.replyTarget = replyTarget
    // Keep the first non-null pushName seen for this batch
    if (!existing.pushName && pushName) existing.pushName = pushName
  } else {
    pending.set(sessionId, {
      messages: [message],
      replyTarget,
      pushName,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
    })
  }

  const entry = pending.get(sessionId)!
  entry.timer = setTimeout(async () => {
    const messages = [...entry.messages]
    const resolvedPushName = entry.pushName
    pending.delete(sessionId)
    try {
      await processMessages(sessionId, messages, { replyTarget: entry.replyTarget, pushName: resolvedPushName })
    } catch (err) {
      console.error('[Webhook] Erro ao processar mensagens:', err)
    }
  }, DEBOUNCE_MS)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  setImmediate(() => {
    void handleWebhookEvent(body).catch((error) => {
      console.error('[Webhook] Erro nao tratado:', error)
    })
  })

  return NextResponse.json({ ok: true })
}

async function handleWebhookEvent(body: Record<string, unknown>) {
  const event = body.event as string
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return

  const data = body.data as Record<string, unknown>
  if (!data) return

  const key = data.key as Record<string, unknown>
  if (!key) return
  if (key.fromMe === true) return
  const routing = resolveContactRouting(data, key)
  if (!routing) return

  const pushName = typeof data.pushName === 'string' ? data.pushName.trim() || null : null

  if (routing.originalId.endsWith('@lid') && routing.originalId !== routing.sessionId) {
    await rekeyConversation(routing.originalId, routing.sessionId)
  }

  const messageData = data.message as Record<string, unknown> | undefined
  if (!messageData) return

  let msg: PendingMessage = { type: 'unknown' }

  if (messageData.conversation) {
    msg = { type: 'text', text: messageData.conversation as string }
  } else if (messageData.extendedTextMessage) {
    msg = { type: 'text', text: (messageData.extendedTextMessage as Record<string, unknown>).text as string }
  } else if (messageData.audioMessage) {
    msg = {
      type: 'audio',
      mediaId: key.id as string,
      mimetype: ((messageData.audioMessage as Record<string, unknown>).mimetype as string) ?? 'audio/ogg',
    }
  } else if (messageData.imageMessage) {
    msg = {
      type: 'image',
      mediaId: key.id as string,
      caption: (messageData.imageMessage as Record<string, unknown>).caption as string,
      mimetype: ((messageData.imageMessage as Record<string, unknown>).mimetype as string) ?? 'image/jpeg',
    }
  } else if (messageData.documentMessage) {
    msg = {
      type: 'document',
      text: `[Documento recebido: ${(messageData.documentMessage as Record<string, unknown>).title ?? 'sem titulo'}]`,
    }
  }

  if (msg.type === 'unknown' && !msg.text) return

  enqueue(routing.sessionId, routing.replyTarget, msg, pushName)
}
