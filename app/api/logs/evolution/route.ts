import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BASE = process.env.EVOLUTION_API_URL!
const KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const [messagesRes, chatsRes] = await Promise.all([
    fetch(`${BASE}/chat/findMessages/${INSTANCE}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {}, limit }),
    }),
    fetch(`${BASE}/chat/findChats/${INSTANCE}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  ])

  const messages = messagesRes.ok ? await messagesRes.json() : { records: [] }
  const chats = chatsRes.ok ? await chatsRes.json() : []

  return NextResponse.json({ messages: messages.messages ?? messages, chats })
}
