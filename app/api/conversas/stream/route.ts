import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const encoder = new TextEncoder()
  let channelRef: ReturnType<typeof adminClient.channel> | null = null
  let keepaliveRef: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)) } catch { /* cliente desconectou */ }
      }

      // Confirma conexão
      send(': connected\n\n')

      // Subscreve mudanças na tabela conversations via adminClient (server-side)
      const channelName = `conv-sse-${user.id}-${Date.now()}`
      channelRef = adminClient
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversations' },
          () => send('data: update\n\n')
        )
        .subscribe((status, err) => {
          if (err) console.warn('[SSE /conversas/stream] subscribe error:', err)
        })

      // Keepalive a cada 25s para evitar timeout do proxy (Traefik)
      keepaliveRef = setInterval(() => send(': ping\n\n'), 25000)

      // Limpeza ao desconectar
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
      'X-Accel-Buffering': 'no', // evita buffering no Traefik/Nginx
    },
  })
}
