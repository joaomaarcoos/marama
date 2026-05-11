import { adminClient } from './supabase/admin'
import { normalizeConversationId } from './utils'

function appendBrazilianMobileVariants(value: string, candidates: Set<string>) {
  if (!/^\d+$/.test(value) || !value.startsWith('55')) return

  if (value.length === 13) {
    const ddd = value.slice(2, 4)
    const ninthDigit = value.slice(4, 5)
    if (ninthDigit === '9') {
      candidates.add(`55${ddd}${value.slice(5)}`)
    }
    return
  }

  if (value.length === 12) {
    const ddd = value.slice(2, 4)
    candidates.add(`55${ddd}9${value.slice(4)}`)
  }
}

export function getConversationPhoneCandidates(phone: string): string[] {
  const normalized = normalizeConversationId(phone) ?? phone.trim()
  const candidates = new Set<string>()

  if (!normalized) return []

  candidates.add(normalized)
  appendBrazilianMobileVariants(normalized, candidates)

  return Array.from(candidates)
}

export async function getMaraPauseState(phone: string): Promise<{
  candidates: string[]
  pausedUntil: string | null
  manualPaused: boolean
  humanHandoffActive: boolean
  queueAssigned: boolean
  assignedName: string | null
}> {
  const candidates = getConversationPhoneCandidates(phone)

  if (candidates.length === 0) {
    return {
      candidates,
      pausedUntil: null,
      manualPaused: false,
      humanHandoffActive: false,
      queueAssigned: false,
      assignedName: null,
    }
  }

  const { data, error } = await adminClient
    .from('conversations')
    .select('mara_paused_until, mara_manual_paused, assigned_to, assigned_name')
    .in('phone', candidates)

  if (error) throw error

  const now = Date.now()
  const manualPaused = (data ?? []).some((row) => row.mara_manual_paused === true)
  const assignedName = (data ?? [])
    .map((row) => row.assigned_name)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null
  // queueAssigned = real human present (assigned_to set, manual pause, or within active handoff window)
  // After the 12h handoff window expires with no human, queueAssigned becomes false so MARA can resume
  const queueAssigned = (data ?? []).some((row) => {
    if (typeof row.assigned_to === 'string' && row.assigned_to.trim().length > 0) return true
    if (row.mara_manual_paused === true) return true
    const hasAssignedName = typeof row.assigned_name === 'string' && row.assigned_name.trim().length > 0
    const hasPause = typeof row.mara_paused_until === 'string' && new Date(row.mara_paused_until).getTime() > now
    return hasAssignedName && hasPause
  })
  const pausedUntil = (data ?? [])
    .map((row) => row.mara_paused_until)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((value) => new Date(value).getTime() > now)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

  const humanHandoffActive = manualPaused || pausedUntil !== null

  return { candidates, pausedUntil, manualPaused, humanHandoffActive, queueAssigned, assignedName }
}
