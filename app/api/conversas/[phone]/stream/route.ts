import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { phone: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const phone = decodeURIComponent(params.phone)
  const encoder = new TextEncoder()
  let channelRef: ReturnType<typeof adminClient.channel> | null = null
  let keepaliveRef: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)) } catch { /* cliente desconectou */ }
      }

      send(': connected\n\n')

      // Subscreve mensagens do chat específico
      const channelName = `chat-sse-${user.id}-${phone}-${Date.now()}`
      channelRef = adminClient
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chatmemory',
            filter: `session_id=eq.${phone}`,
          },
          () => send('data: update\n\n')
        )
        .subscribe((status, err) => {
          if (err) console.warn(`[SSE /conversas/${phone}/stream] subscribe error:`, err)
        })

      keepaliveRef = setInterval(() => send(': ping\n\n'), 25000)

      const cleanup = () => {
        if (keepaliveRef) { clearInterval(keepaliveRef); keepaliveRef = null }
        if (channelRef) { adminClient.removeChannel(channelRef).catch(() => {}); channelRef = null }
        try { controller.close() } catch {}
      }

      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      if (keepaliveRef) { clearInterval(keepaliveRef); keepaliveRef = null }
      if (channelRef) { adminClient.removeChannel(channelRef).catch(() => {}); channelRef = null }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
