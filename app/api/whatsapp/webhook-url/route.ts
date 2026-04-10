import { NextResponse } from 'next/server'

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL não configurado' }, { status: 500 })
  }

  const url = new URL('/api/webhook/evolution', appUrl)
  const secret = process.env.WEBHOOK_SECRET
  if (secret) url.searchParams.set('secret', secret)

  return NextResponse.json({ url: url.toString(), hasSecret: !!secret })
}
