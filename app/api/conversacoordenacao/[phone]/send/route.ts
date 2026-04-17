import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { coordSendText } from '@/lib/evolution-coord'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)

  let text = ''
  try {
    const body = await req.json() as { text?: string }
    text = body.text?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const supabase = getAdminClient()

  // Envia pelo Evolution API
  try {
    await coordSendText(phone, text)
  } catch (err) {
    console.error('[coord/send]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao enviar mensagem' },
      { status: 502 }
    )
  }

  const now = new Date().toISOString()

  // Upsert conversa
  await supabase.from('coord_conversations').upsert(
    {
      phone,
      last_message: text,
      last_message_at: now,
    },
    { onConflict: 'phone' }
  )

  // Salva mensagem
  const { data: message, error } = await supabase
    .from('coord_messages')
    .insert({ phone, direction: 'outbound', content: text })
    .select('id, phone, direction, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message })
}
