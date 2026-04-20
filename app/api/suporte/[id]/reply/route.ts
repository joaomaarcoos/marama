import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/evolution'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { text?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'Mensagem não pode ser vazia' }, { status: 400 })

  const { data: ticket, error: ticketErr } = await getAdminClient()
    .from('support_tickets')
    .select('phone, protocol, status')
    .eq('id', params.id)
    .single()

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }

  await sendText(ticket.phone, text)

  const now = new Date().toISOString()

  const [{ data: msg }] = await Promise.all([
    getAdminClient()
      .from('chatmemory')
      .insert({ session_id: ticket.phone, role: 'assistant', content: text, created_at: now })
      .select()
      .single(),
    getAdminClient()
      .from('support_tickets')
      .update({ last_attendant_reply_at: now, status: ticket.status === 'aberto' ? 'em_andamento' : ticket.status })
      .eq('id', params.id),
  ])

  return NextResponse.json({ message: msg })
}
