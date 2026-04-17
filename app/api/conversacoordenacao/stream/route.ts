import { NextRequest } from 'next/server'
import { addCoordSseClient, removeCoordSseClient } from '@/lib/coord-sse'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let controller: ReadableStreamDefaultController
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl
      addCoordSseClient(controller)
      const hb = setInterval(() => {
        try { ctrl.enqueue(new TextEncoder().encode(': heartbeat\n\n')) }
        catch { clearInterval(hb) }
      }, 25000)
      req.signal.addEventListener('abort', () => {
        clearInterval(hb)
        removeCoordSseClient(controller)
        try { ctrl.close() } catch { /* */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
