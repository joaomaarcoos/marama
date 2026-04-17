import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { notifyCoordSseClients, notifyCoordPhoneSseClients } from '@/lib/coord-sse'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return `55${digits}`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as Record<string, unknown>

    const event = body.event as string | undefined
    if (event && event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    const data = body.data as Record<string, unknown> | undefined
    if (!data) return NextResponse.json({ ok: true })

    const key = data.key as Record<string, unknown> | undefined
    if (key?.fromMe) return NextResponse.json({ ok: true })

    const messageContent = data.message as Record<string, unknown> | undefined
    if (!messageContent) return NextResponse.json({ ok: true })

    const text =
      (messageContent.conversation as string | undefined) ??
      ((messageContent.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined)

    if (!text) return NextResponse.json({ ok: true })

    const remoteJid = (key?.remoteJid as string | undefined) ?? ''
    if (!remoteJid || remoteJid.includes('@g.us')) return NextResponse.json({ ok: true })

    const rawPhone = remoteJid
      .replace('@s.whatsapp.net', '')
      .replace('@c.us', '')
      .replace(/[^0-9]/g, '')
    const phone = normalizePhone(rawPhone)
    const pushName = (data.pushName as string | undefined) ?? null

    const supabase = getAdminClient()

    await supabase.from('coord_conversations').upsert(
      {
        phone,
        name: pushName,
        last_message: text,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    )

    await supabase.from('coord_messages').insert({
      phone,
      direction: 'inbound',
      content: text,
      message_id: (key?.id as string | undefined) ?? null,
    })

    notifyCoordSseClients()
    notifyCoordPhoneSseClients(phone)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/evolution-coord]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
