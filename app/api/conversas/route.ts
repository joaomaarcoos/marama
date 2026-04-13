import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { data } = await adminClient
    .from('conversations')
    .select('phone, last_message, last_message_at, status, followup_stage, students(full_name, email)')
    .order('last_message_at', { ascending: false })
    .limit(120)

  return NextResponse.json(data ?? [])
}
