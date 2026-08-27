import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export function verifyWebhookSecret(request: Request): NextResponse | null {
  const expected = process.env.WEBHOOK_SECRET
  if (!expected) {
    console.error('[webhook] WEBHOOK_SECRET nao configurado; requisicao recusada')
    return NextResponse.json({ error: 'Webhook indisponivel' }, { status: 503 })
  }

  const received = request.headers.get('x-webhook-secret') ?? ''
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  const valid = expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer)

  return valid ? null : NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
}
