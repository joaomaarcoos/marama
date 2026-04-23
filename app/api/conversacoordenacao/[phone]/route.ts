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
      .select('phone, name, profile_pic_url, last_message, last_message_at, created_at, assigned_to, assigned_name')
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
    return NextResponse.json({
      conversation: { phone, name: null, profile_pic_url: null, last_message: null, last_message_at: null, assigned_to: null, assigned_name: null },
      messages: [],
    })
  }

  return NextResponse.json({
    conversation: convResult.data,
    messages: msgsResult.data ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)
  const body = await req.json() as { assigned_to?: string | null; assigned_name?: string | null }
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('coord_conversations')
    .update({ assigned_to: body.assigned_to ?? null, assigned_name: body.assigned_name ?? null })
    .eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
