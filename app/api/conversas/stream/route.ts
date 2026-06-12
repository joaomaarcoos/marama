import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  addConversationClient,
  removeConversationClient,
} from '@/lib/conversation-sse'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const encoder = new TextEncoder()
  let keepaliveRef: ReturnType<typeof setInterval> | null = null
  let controllerRef: ReadableStreamDefaultController | null = null

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller
      addConversationClient(controller)

      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)) } catch {}
      }

      send(': connected\n\n')
      keepaliveRef = setInterval(() => send(': ping\n\n'), 25000)

      const cleanup = () => {
        if (keepaliveRef) {
          clearInterval(keepaliveRef)
          keepaliveRef = null
        }
        if (controllerRef) {
          removeConversationClient(controllerRef)
          controllerRef = null
        }
        try { controller.close() } catch {}
      }

      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      if (keepaliveRef) {
        clearInterval(keepaliveRef)
        keepaliveRef = null
      }
      if (controllerRef) {
        removeConversationClient(controllerRef)
        controllerRef = null
      }
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
