import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConversationPhoneCandidates } from '@/lib/mara-pause'
import { adminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/evolution'

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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { phone, message } = await request.json() as { phone: string; message: string }

  if (!phone?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Telefone e mensagem são obrigatórios' }, { status: 400 })
  }

  try {
    const pausedUntil = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const phoneCandidates = getConversationPhoneCandidates(phone.trim())
    const attendantName = toDisplayName(user)
    const signedMessage = `${attendantName}\n\n${message.trim()}`

    await adminClient
      .from('conversations')
      .update({
        mara_paused_until: pausedUntil,
        assigned_to: user.id,
        assigned_name: attendantName,
      })
      .in('phone', phoneCandidates)

    await sendText(phone.trim(), signedMessage)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[send-message] Falha ao enviar:', error)
    return NextResponse.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 })
  }
}
