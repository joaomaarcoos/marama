import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)

  const [{ data: conversation }, { data: messages }] = await Promise.all([
    adminClient
      .from('conversations')
      .select('*, students(full_name, email, courses)')
      .eq('phone', phone)
      .single(),
    adminClient
      .from('chatmemory')
      .select('role, content, created_at')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  return NextResponse.json({ conversation, messages: messages ?? [] })
}
