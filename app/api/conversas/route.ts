import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data } = await adminClient
    .from('conversations')
    .select('phone, last_message, last_message_at, status, followup_stage, assigned_to, assigned_name, labels, students(full_name, email)')
    .order('last_message_at', { ascending: false })
    .limit(200)

  return NextResponse.json(data ?? [])
}
