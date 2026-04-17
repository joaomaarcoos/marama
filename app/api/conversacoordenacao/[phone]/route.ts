import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)
  const supabase = getAdminClient()

  const [convResult, msgsResult] = await Promise.all([
    supabase
      .from('coord_conversations')
      .select('phone, name, profile_pic_url, last_message, last_message_at, created_at')
      .eq('phone', phone)
      .single(),
    supabase
      .from('coord_messages')
      .select('id, phone, direction, content, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  if (convResult.error) {
    // Conversa ainda não existe — retorna vazia
    return NextResponse.json({
      conversation: { phone, name: null, profile_pic_url: null, last_message: null, last_message_at: null },
      messages: [],
    })
  }

  return NextResponse.json({
    conversation: convResult.data,
    messages: msgsResult.data ?? [],
  })
}
