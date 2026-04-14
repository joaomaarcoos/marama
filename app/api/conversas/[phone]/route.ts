import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { findChats } from '@/lib/evolution'
import { syncContactsSnapshot } from '@/lib/contacts'

export async function GET(
  _request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)

  const [conversationResult, messagesResult, chatsResult] = await Promise.all([
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
    findChats().catch((err) => {
      console.warn('[conversas/phone] findChats falhou — abrindo conversa sem dados WhatsApp:', err?.message)
      return []
    }),
  ])

  const conversation = conversationResult.data
  const messages = messagesResult.data ?? []
  const chats = chatsResult
  const chat = chats.find((item) => item.phone === phone)

  return NextResponse.json({
    conversation: conversation
      ? {
          ...conversation,
          whatsapp_name: chat?.pushName ?? null,
          whatsapp_profile_pic_url: chat?.profilePicUrl ?? null,
          whatsapp_updated_at: chat?.updatedAt ?? null,
        }
      : null,
    messages,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)
  const body = await request.json() as {
    status?: string
    assigned_to?: string | null
    assigned_name?: string | null
    labels?: string[]
    followup_stage?: string | null
    contact_name?: string | null
  }

  const { error } = await adminClient
    .from('conversations')
    .update(body)
    .eq('phone', phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncContactsSnapshot()
  return NextResponse.json({ ok: true })
}
