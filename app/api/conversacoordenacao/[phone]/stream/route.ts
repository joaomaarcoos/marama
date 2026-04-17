import { NextRequest } from 'next/server'
import { addCoordPhoneSseClient, removeCoordPhoneSseClient } from '@/lib/coord-sse'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const phone = decodeURIComponent(params.phone)

  let controller: ReadableStreamDefaultController
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl
      addCoordPhoneSseClient(phone, controller)
      const hb = setInterval(() => {
        try { ctrl.enqueue(new TextEncoder().encode(': heartbeat\n\n')) }
        catch { clearInterval(hb) }
      }, 25000)
      req.signal.addEventListener('abort', () => {
        clearInterval(hb)
        removeCoordPhoneSseClient(phone, controller)
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
