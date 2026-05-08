import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConversationPhoneCandidates } from '@/lib/mara-pause'
import { adminClient } from '@/lib/supabase/admin'
import { sendMedia, sendText } from '@/lib/evolution'
import { syncContactsSnapshot } from '@/lib/contacts'

type MediaKind = 'image' | 'audio' | 'document'

const MAX_UPLOAD_SIZE = 16 * 1024 * 1024

function toDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadataName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === 'string'
      ? user.user_metadata.name
      : null

  if (metadataName?.trim()) return metadataName.trim()

  const emailLocal = (user.email ?? '').split('@')[0]?.trim()
  if (!emailLocal) return 'Atendimento humano'

  return emailLocal
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildHumanSignedText(text: string, attendantName: string) {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return `*${attendantName}*\n\n${trimmed}`
}

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

function buildStoredTimelinePayload(content: string, attendantName: string) {
  return JSON.stringify({
    _meta: 'human_attendant',
    attendantName,
    text: content,
  })
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
    const attendantName = toDisplayName(user)
    const signedText = buildHumanSignedText(text, attendantName)
    // ─── PASSO 1: gravar flag de pausa ANTES de enviar ─────────────────────────
    // Isso garante que qualquer webhook disparado pelo Evolution API (incluindo o
    // evento de saída da própria mensagem) já encontre a flag no banco e pare.
    // Se a flag for gravada depois, existe janela para o webhook processar antes.
    const pausedUntil = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const phoneCandidates = getConversationPhoneCandidates(phone)

    await adminClient
      .from('conversations')
      .update({
        mara_paused_until: pausedUntil,
        assigned_to: user.id,
        assigned_name: attendantName,
        // Reabre a conversa caso esteja encerrada (atendente iniciando contato)
        status: 'active',
        followup_stage: null,
      })
      .in('phone', phoneCandidates)

    // ─── PASSO 2: enviar mensagem pelo Evolution API ────────────────────────────
    let mediaKind: MediaKind | null = null

    if (file) {
      mediaKind = detectMediaKind(file)
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      const dataUrl = buildDataUrl(file, base64)
      await sendMedia(phone, dataUrl, mediaKind, signedText || undefined, file.name || undefined)
    } else {
      await sendText(phone, signedText)
    }

    // ─── PASSO 3: salvar no histórico e atualizar conversa ──────────────────────
    const content = buildStoredContent(signedText, file, mediaKind)
    const timelinePayload = buildStoredTimelinePayload(content, attendantName)
    const { data: message, error: insertError } = await adminClient
      .from('chatmemory')
      .insert({
        session_id: phone,
        role: 'assistant',
        content: timelinePayload,
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
