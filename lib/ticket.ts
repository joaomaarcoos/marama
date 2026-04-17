import { getAdminClient } from './supabase/admin'

export interface TicketRow {
  id: string
  protocol: string
  phone: string
  student_id: string | null
  subject: string
  description: string | null
  status: 'aberto' | 'em_andamento' | 'resolvido' | 'fechado_inatividade'
  assigned_to: string | null
  assigned_name: string | null
  last_attendant_reply_at: string | null
  last_student_message_at: string | null
  opened_at: string
  closed_at: string | null
  created_at: string
}

export interface CreateTicketInput {
  phone: string
  student_id?: string | null
  subject: string
  description?: string | null
}

export async function generateProtocol(): Promise<string> {
  const { data, error } = await getAdminClient().rpc('nextval_support_ticket')
  if (error) throw new Error(error.message)
  const seq = String(data).padStart(6, '0')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `SUP-${today}-${seq}`
}

export async function createTicket(input: CreateTicketInput): Promise<TicketRow> {
  const protocol = await generateProtocol()
  const { data, error } = await getAdminClient()
    .from('support_tickets')
    .insert({ protocol, ...input })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as TicketRow
}
