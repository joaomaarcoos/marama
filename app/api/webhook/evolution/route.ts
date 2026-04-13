import { NextRequest, NextResponse } from 'next/server'
import { processMessages } from '@/lib/mara-agent'

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
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingEntry>()
const DEBOUNCE_MS = 3000

function enqueue(phone: string, message: PendingMessage) {
  const existing = pending.get(phone)

  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push(message)
  } else {
    pending.set(phone, { messages: [message], timer: undefined as unknown as ReturnType<typeof setTimeout> })
  }

  const entry = pending.get(phone)!
  entry.timer = setTimeout(async () => {
    const messages = [...entry.messages]
    pending.delete(phone)
    try {
      await processMessages(phone, messages)
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
    try {
      handleWebhookEvent(body)
    } catch (error) {
      console.error('[Webhook] Erro nao tratado:', error)
    }
  })

  return NextResponse.json({ ok: true })
}

function handleWebhookEvent(body: Record<string, unknown>) {
  const event = body.event as string
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return

  const data = body.data as Record<string, unknown>
  if (!data) return

  const key = data.key as Record<string, unknown>
  if (!key) return
  if (key.fromMe === true) return

  const remoteJid = key.remoteJid as string
  if (!remoteJid || remoteJid.endsWith('@g.us')) return

  const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
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

  enqueue(phone, msg)
}
