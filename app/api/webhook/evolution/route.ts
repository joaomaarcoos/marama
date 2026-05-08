import { NextRequest, NextResponse } from 'next/server'
import { processMessages } from '@/lib/mara-agent'
import { consumeRecentSystemOutbound, createOutboundFingerprint, resolveJidByLid } from '@/lib/evolution'
import { startInactivityScheduler } from '@/lib/inactivity-scheduler'
import { getConversationPhoneCandidates, getMaraPauseState } from '@/lib/mara-pause'
import { adminClient } from '@/lib/supabase/admin'
import { normalizeConversationId, toWhatsAppJid } from '@/lib/utils'
import { logWebhookEvent } from '@/lib/webhook-logger'

// Cache @lid JID → real phone (e.g. "242777958944931@lid" → "5598987654321")
// Populated whenever a payload contains both the @lid and the real JID.
const lidResolutionCache = new Map<string, string>()

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
      contact_name_confirmed: Boolean(toConversation.contact_name_confirmed || fromConversation.contact_name_confirmed),
      whatsapp_name: toConversation.whatsapp_name ?? fromConversation.whatsapp_name,
      cpf: toConversation.cpf ?? fromConversation.cpf,
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
      mara_paused_until:
        toConversation.mara_paused_until && fromConversation.mara_paused_until
          ? (new Date(toConversation.mara_paused_until).getTime() >= new Date(fromConversation.mara_paused_until).getTime()
            ? toConversation.mara_paused_until
            : fromConversation.mara_paused_until)
          : (toConversation.mara_paused_until ?? fromConversation.mara_paused_until),
      mara_manual_paused: Boolean(toConversation.mara_manual_paused || fromConversation.mara_manual_paused),
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

    const msgType = messages[0]?.type ?? 'unknown'
    const msgPreview = messages.map((m) => m.text ?? m.caption ?? `[${m.type}]`).join(' ')
    const startTime = Date.now()

    try {
      const pauseState = await getMaraPauseState(sessionId)
      if (pauseState.pausedUntil || pauseState.manualPaused) {
        console.log(`[Webhook] Conversa bloqueada para MARA (candidatos: ${pauseState.candidates.join(',')}) — descartando lote`)
        void logWebhookEvent({ phone: sessionId, message_type: msgType, message_preview: msgPreview, status: 'blocked' })
        return
      }

      await processMessages(sessionId, messages, { replyTarget: entry.replyTarget, pushName: resolvedPushName })
      const duration = Date.now() - startTime

      const { data: lastMsg } = await adminClient
        .from('chatmemory')
        .select('content')
        .eq('session_id', sessionId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      void logWebhookEvent({
        phone: sessionId,
        message_type: msgType,
        message_preview: msgPreview,
        status: 'success',
        duration_ms: duration,
        response_preview: lastMsg?.content ?? null,
      })
    } catch (err) {
      const duration = Date.now() - startTime
      const errMsg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      console.error('[Webhook] Erro ao processar mensagens:', err)

      void logWebhookEvent({
        phone: sessionId,
        message_type: msgType,
        message_preview: msgPreview,
        status: 'error',
        duration_ms: duration,
        error_message: errMsg,
      })

      // Notifica administrador sobre falha no processamento
      try {
        const { sendText } = await import('@/lib/evolution')
        const preview = msgPreview.slice(0, 100)
        const errSummary = (err instanceof Error ? err.message : String(err)).slice(0, 200)
        await sendText(
          '559881522794',
          `⚠️ *Erro MARA*\n\nTelefone: ${sessionId}\nMensagem: ${preview}\n\nErro: ${errSummary}`,
        )
      } catch {
        // Ignora falha ao notificar para não criar loop
      }
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

  // Filtrar mensagens enviadas pelo próprio sistema — Evolution API pode colocar
  // fromMe em locais diferentes dependendo da versão. Checamos todas as posições.
  const fromMe =
    key.fromMe === true ||
    key.fromMe === 'true' ||
    (data as Record<string, unknown>).fromMe === true ||
    (data as Record<string, unknown>).fromMe === 'true' ||
    body.fromMe === true ||
    body.fromMe === 'true'

  const routing = resolveContactRouting(data, key)
  if (!routing) return

  const pushName = typeof data.pushName === 'string' ? data.pushName.trim() || null : null
  const outboundSource = typeof data.source === 'string' ? data.source.trim().toLowerCase() : null

  // When payload contains both @lid and real JID, cache the mapping for future lookups
  if (routing.originalId.endsWith('@lid') && routing.sessionId !== routing.originalId) {
    lidResolutionCache.set(routing.originalId, routing.sessionId)
    await rekeyConversation(routing.originalId, routing.sessionId)
  }

  // When payload only has @lid and no real JID, try to resolve via cache or Evolution API
  if (routing.sessionId.endsWith('@lid')) {
    const cached = lidResolutionCache.get(routing.sessionId)
    if (cached) {
      routing.sessionId = cached
      routing.replyTarget = cached
      await rekeyConversation(routing.originalId, cached)
    } else {
      const resolved = await resolveJidByLid(routing.originalId)
      if (resolved) {
        lidResolutionCache.set(routing.originalId, resolved)
        routing.sessionId = resolved
        routing.replyTarget = resolved
        await rekeyConversation(routing.originalId, resolved)
      }
      // If still @lid: continue normally — MARA can still reply using the @lid JID
    }
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

  if (fromMe) {
    const definitelyHumanSource = outboundSource !== null && outboundSource !== 'web'
    const outboundFingerprint = createOutboundFingerprint({
      text: msg.text,
      mediaType: msg.type === 'image' || msg.type === 'audio' || msg.type === 'document' ? msg.type : null,
      caption: msg.caption,
    })

    const isSystemOutbound = consumeRecentSystemOutbound(routing.sessionId, outboundFingerprint)
    if (!definitelyHumanSource && isSystemOutbound) {
      console.log(`[Webhook] Saida automatica reconhecida (${routing.sessionId}) — ignorando fromMe`)
      return
    }

    const pausedUntil = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const phoneCandidates = getConversationPhoneCandidates(routing.sessionId)
    const { data: existingConversations, error: selectConversationError } = await adminClient
      .from('conversations')
      .select('phone, assigned_name')
      .in('phone', phoneCandidates)

    if (selectConversationError) throw selectConversationError

    if ((existingConversations ?? []).length > 0) {
      const { error: pauseUpdateError } = await adminClient
        .from('conversations')
        .update({
          mara_paused_until: pausedUntil,
          last_message_at: new Date().toISOString(),
          assigned_name: existingConversations?.[0]?.assigned_name ?? 'Em atendimento',
        })
        .in('phone', phoneCandidates)

      if (pauseUpdateError) throw pauseUpdateError
    } else {
      const { error: pauseInsertError } = await adminClient
        .from('conversations')
        .upsert({
          phone: routing.sessionId,
          status: 'active',
          last_message_at: new Date().toISOString(),
          mara_paused_until: pausedUntil,
          assigned_name: 'Em atendimento',
        }, { onConflict: 'phone' })

      if (pauseInsertError) throw pauseInsertError
    }

    console.log(`[Webhook] Saida manual detectada para ${routing.sessionId} (source=${outboundSource ?? 'desconhecida'}) — MARA pausada ate ${pausedUntil}`)
    return
  }

  // Verificar flag de pausa ANTES de enfileirar.
  // Usa ambos os formatos do número brasileiro (com/sem nono dígito) para garantir
  // que o mismatch de formato não impeça a detecção da pausa.
  const preQueuePauseState = await getMaraPauseState(routing.sessionId)
  if (preQueuePauseState.pausedUntil || preQueuePauseState.manualPaused) {
    console.log(`[Webhook] Conversa bloqueada para MARA (candidatos: ${preQueuePauseState.candidates.join(',')}) — não enfileirado`)
    return
  }

  enqueue(routing.sessionId, routing.replyTarget, msg, pushName)
}
