import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { syncContactsSnapshot } from '@/lib/contacts'
import { notifyConversationClients } from '@/lib/conversation-sse'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const phone = decodeURIComponent(params.phone)

  const [conversationResult, messagesResult] = await Promise.all([
    adminClient
      .from('conversations')
      .select('*, students(full_name, email, courses, role, username, phone, phone2, cpf, moodle_id)')
      .eq('phone', phone)
      .single(),
    adminClient
      .from('chatmemory')
      .select('role, content, created_at')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  return NextResponse.json({
    conversation: conversationResult.data,
    messages: messagesResult.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const phone = decodeURIComponent(params.phone)
  const body = await request.json() as {
    status?: string
    assigned_to?: string | null
    assigned_name?: string | null
    labels?: string[]
    followup_stage?: string | null
    contact_name?: string | null
    contact_name_confirmed?: boolean
    mara_manual_paused?: boolean
  }
  const updatePayload: Record<string, unknown> = { ...body }

  if ('contact_name' in body) {
    updatePayload.contact_name_confirmed =
      typeof body.contact_name === 'string' && body.contact_name.trim().length > 0
  }

  if ('assigned_to' in body || 'assigned_name' in body) {
    const hasHumanOwner =
      (typeof body.assigned_to === 'string' && body.assigned_to.trim().length > 0) ||
      (typeof body.assigned_name === 'string' && body.assigned_name.trim().length > 0)

    updatePayload.mara_paused_until = hasHumanOwner
      ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      : null
  }

  const isClosingConversation = body.status === 'closed' || body.followup_stage === 'closed'
  if (isClosingConversation) {
    updatePayload.assigned_to = null
    updatePayload.assigned_name = null
    updatePayload.mara_paused_until = null
    updatePayload.mara_manual_paused = false
  }

  const { error } = await adminClient
    .from('conversations')
    .update(updatePayload)
    .eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await syncContactsSnapshot()
  notifyConversationClients(phone)
  return NextResponse.json({ ok: true })
}
