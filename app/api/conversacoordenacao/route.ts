import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireApiUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('coord_conversations')
    .select('phone, name, profile_pic_url, last_message, last_message_at, created_at, assigned_to, assigned_name')
    .order('last_message_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
