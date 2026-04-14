import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { findChats } from '@/lib/evolution'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [conversationsResult, chatsResult] = await Promise.allSettled([
    adminClient
      .from('conversations')
      .select('phone, contact_name, last_message, last_message_at, status, followup_stage, assigned_to, assigned_name, labels, students(full_name, email)')
      .order('last_message_at', { ascending: false })
      .limit(200),
    findChats(),
  ])

  const conversations =
    conversationsResult.status === 'fulfilled'
      ? conversationsResult.value.data ?? []
      : []

  const chats = chatsResult.status === 'fulfilled' ? chatsResult.value : []
  const chatsByPhone = new Map(chats.map((chat) => [chat.phone, chat]))

  const data = conversations.map((conversation) => {
    const chat = chatsByPhone.get(conversation.phone)
    return {
      ...conversation,
      whatsapp_name: chat?.pushName ?? null,
      whatsapp_profile_pic_url: chat?.profilePicUrl ?? null,
      whatsapp_updated_at: chat?.updatedAt ?? null,
    }
  })

  return NextResponse.json(data)
}
