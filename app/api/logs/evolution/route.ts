import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const base = getRequiredEnv('EVOLUTION_API_URL')
  const key = getRequiredEnv('EVOLUTION_API_KEY')
  const instance = getRequiredEnv('EVOLUTION_INSTANCE_NAME')

  const [messagesRes, chatsRes] = await Promise.all([
    fetch(`${base}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {}, limit }),
    }),
    fetch(`${base}/chat/findChats/${instance}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  ])

  const messages = messagesRes.ok ? await messagesRes.json() : { records: [] }
  const chats = chatsRes.ok ? await chatsRes.json() : []

  return NextResponse.json({ messages: messages.messages ?? messages, chats })
}
