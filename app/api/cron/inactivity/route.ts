import { NextRequest, NextResponse } from 'next/server'
import { checkInactivity } from '@/lib/mara-agent'

// Chamado a cada 5 minutos por um cron externo.
// Em produção (Docker): configure um cron job para chamar POST /api/cron/inactivity
// Exemplo no crontab: */5 * * * * curl -s -X POST https://SEU_DOMINIO/api/cron/inactivity -H "x-cron-secret: SEU_SECRET"

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await checkInactivity()
    console.log(`[Cron] Inatividade: ${result.followups} follow-ups, ${result.closings} encerramentos`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Cron] Erro ao verificar inatividade:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
