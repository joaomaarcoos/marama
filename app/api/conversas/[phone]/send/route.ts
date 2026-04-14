import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { sendMedia, sendText } from '@/lib/evolution'
import { syncContactsSnapshot } from '@/lib/contacts'

type MediaKind = 'image' | 'audio' | 'document'

const MAX_UPLOAD_SIZE = 16 * 1024 * 1024

function detectMediaKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'document'
}

function buildDataUrl(file: File, base64: string) {
  const mime = file.type || 'application/octet-stream'
  return `data:${mime};base64,${base64}`
}

function buildStoredContent(text: string, file: File | null, mediaKind: MediaKind | null) {
  const trimmed = text.trim()

  if (!file || !mediaKind) {
    return trimmed
  }

  const labels: Record<MediaKind, string> = {
    image: 'Imagem',
    audio: 'Audio',
    document: 'Arquivo',
  }

  const prefix = `[${labels[mediaKind]} enviado${file.name ? `: ${file.name}` : ''}]`
  return trimmed ? `${prefix}\n${trimmed}` : prefix
}

export async function POST(
  request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const phone = decodeURIComponent(params.phone)
  const formData = await request.formData()
  const text = String(formData.get('text') ?? '')
  const maybeFile = formData.get('file')
  const file = maybeFile instanceof File ? maybeFile : null

  if (!text.trim() && !file) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
  }

  if (file && file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. Maximo de 16MB.' }, { status: 400 })
  }

  try {
    let mediaKind: MediaKind | null = null

    if (file) {
      mediaKind = detectMediaKind(file)
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      const dataUrl = buildDataUrl(file, base64)
      await sendMedia(phone, dataUrl, mediaKind, text.trim() || undefined)
    } else {
      await sendText(phone, text.trim())
    }

    const content = buildStoredContent(text, file, mediaKind)
    const { data: message, error: insertError } = await adminClient
      .from('chatmemory')
      .insert({
        session_id: phone,
        role: 'assistant',
        content,
      })
      .select('role, content, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    const { error: conversationError } = await adminClient
      .from('conversations')
      .update({
        last_message: content.slice(0, 200),
        last_message_at: new Date().toISOString(),
      })
      .eq('phone', phone)

    if (conversationError) {
      throw conversationError
    }

    await syncContactsSnapshot()

    return NextResponse.json({ ok: true, message })
  } catch (error) {
    console.error('[conversas/send] Falha ao enviar mensagem manual:', error)
    return NextResponse.json({ error: 'Nao foi possivel enviar a mensagem.' }, { status: 500 })
  }
}
