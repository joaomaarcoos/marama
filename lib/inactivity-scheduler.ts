import { checkInactivity } from './mara-agent'

// Singleton — garante que apenas um interval roda mesmo com hot-reload do Next.js
declare global {
  // eslint-disable-next-line no-var
  var __inactivitySchedulerStarted: boolean | undefined
}

const INTERVAL_MS = 5 * 60 * 1000 // verifica a cada 5 minutos

export function startInactivityScheduler() {
  if (global.__inactivitySchedulerStarted) return
  global.__inactivitySchedulerStarted = true

  setInterval(async () => {
    try {
      const { followups, closings } = await checkInactivity()
      if (followups > 0 || closings > 0) {
        console.log(`[Inatividade] ${followups} follow-up(s) enviado(s), ${closings} conversa(s) encerrada(s)`)
      }
    } catch (err) {
      console.error('[Inatividade] Erro ao verificar inatividade:', err)
    }
  }, INTERVAL_MS)

  console.log('[Inatividade] Scheduler iniciado — intervalo: 5 minutos')
}
