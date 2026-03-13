import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/mara-agent'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret')
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  // Responde 200 imediatamente porque a Evolution reenfileira quando ha timeout.
  setImmediate(async () => {
    try {
      await handleWebhookEvent(body)
    } catch (error) {
      console.error('[Webhook] Erro nao tratado:', error)
    }
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

  const remoteJid = key.remoteJid as string
  if (!remoteJid || remoteJid.endsWith('@g.us')) return

  const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const messageData = data.message as Record<string, unknown> | undefined
  if (!messageData) return

  let type: 'text' | 'audio' | 'image' | 'document' | 'unknown' = 'unknown'
  let text: string | undefined
  let caption: string | undefined
  let mediaId: string | undefined
  let mimetype: string | undefined

  if (messageData.conversation) {
    type = 'text'
    text = messageData.conversation as string
  } else if (messageData.extendedTextMessage) {
    type = 'text'
    text = (messageData.extendedTextMessage as Record<string, unknown>).text as string
  } else if (messageData.audioMessage) {
    type = 'audio'
    mediaId = key.id as string
    mimetype = (messageData.audioMessage as Record<string, unknown>).mimetype as string ?? 'audio/ogg'
  } else if (messageData.imageMessage) {
    type = 'image'
    mediaId = key.id as string
    caption = (messageData.imageMessage as Record<string, unknown>).caption as string
    mimetype = (messageData.imageMessage as Record<string, unknown>).mimetype as string ?? 'image/jpeg'
  } else if (messageData.documentMessage) {
    type = 'document'
    text = `[Documento recebido: ${(messageData.documentMessage as Record<string, unknown>).title ?? 'sem titulo'}]`
  }

  if (type === 'unknown' && !text) return

  await processMessage(phone, { type, text, caption, mediaId, mimetype })
}
