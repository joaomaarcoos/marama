import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: ticket, error: ticketErr } = await getAdminClient()
    .from('support_tickets')
    .select('phone, opened_at')
    .eq('id', params.id)
    .single()

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }

  const { data: messages } = await getAdminClient()
    .from('chatmemory')
    .select('role, content, created_at')
    .eq('session_id', ticket.phone)
    .order('created_at', { ascending: true })
    .limit(200)

  return NextResponse.json({ messages: messages ?? [], phone: ticket.phone })
}
