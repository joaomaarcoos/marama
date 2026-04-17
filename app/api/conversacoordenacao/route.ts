import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('coord_conversations')
    .select('phone, name, profile_pic_url, last_message, last_message_at, created_at')
    .order('last_message_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
