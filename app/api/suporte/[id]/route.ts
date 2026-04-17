import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/evolution'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em Andamento',
  resolvido: 'Resolvido',
  fechado_inatividade: 'Fechado por Inatividade',
}

// PATCH /api/suporte/[id] — atualiza status, assign, description
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: {
    status?: string
    assigned_to?: string | null
    assigned_name?: string | null
    description?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Buscar ticket atual para obter phone e subject
  const { data: ticket, error: fetchErr } = await getAdminClient()
    .from('support_tickets')
    .select('id, phone, subject, status, protocol, assigned_name')
    .eq('id', params.id)
    .single()

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) {
    updates.status = body.status
    updates.last_attendant_reply_at = now
    if (body.status === 'resolvido' || body.status === 'fechado_inatividade') {
      updates.closed_at = now
    } else {
      updates.closed_at = null
    }
  }

  if ('assigned_to' in body) updates.assigned_to = body.assigned_to ?? null
  if ('assigned_name' in body) updates.assigned_name = body.assigned_name ?? null
  if ('description' in body) updates.description = body.description ?? null

  const { data: updated, error } = await getAdminClient()
    .from('support_tickets')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enviar notificação WhatsApp ao aluno quando status é alterado
  if (body.status !== undefined && body.status !== ticket.status) {
    const statusLabel = STATUS_LABELS[body.status] ?? body.status
    const attendantName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      'Atendente'

    let msg = `🎫 *Atualização do seu chamado de suporte*\n\n`
    msg += `*Protocolo:* ${ticket.protocol}\n`
    msg += `*Assunto:* ${ticket.subject}\n`
    msg += `*Novo status:* ${statusLabel}\n`

    if (body.status === 'em_andamento') {
      msg += `\nSua solicitação está sendo analisada por *${attendantName}*. Em breve retornaremos com mais informações. 😊`
    } else if (body.status === 'resolvido') {
      msg += `\nSeu chamado foi *resolvido* por *${attendantName}*. Caso o problema persista, abra um novo chamado. ✅`
    } else if (body.status === 'fechado_inatividade') {
      msg += `\nSeu chamado foi *encerrado por inatividade*. Caso ainda precise de ajuda, é só entrar em contato novamente. 👋`
    } else if (body.status === 'aberto') {
      msg += `\nSeu chamado foi *reaberto*. Nossa equipe irá analisá-lo em breve. 🔄`
    }

    try {
      await sendText(ticket.phone, msg)
    } catch (sendErr) {
      console.error('[Suporte] Falha ao notificar aluno via WhatsApp:', sendErr)
    }
  }

  return NextResponse.json({ ticket: updated })
}
