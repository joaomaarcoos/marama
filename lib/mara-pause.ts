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
  humanHandoffActive: boolean
  assignedName: string | null
}> {
  const candidates = getConversationPhoneCandidates(phone)

  if (candidates.length === 0) {
    return { candidates, pausedUntil: null, humanHandoffActive: false, assignedName: null }
  }

  const { data, error } = await adminClient
    .from('conversations')
    .select('mara_paused_until, assigned_to, assigned_name')
    .in('phone', candidates)

  if (error) throw error

  const now = Date.now()
  const assignedName = (data ?? [])
    .map((row) => row.assigned_name)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null
  const humanHandoffActive = (data ?? []).some((row) =>
    (typeof row.assigned_to === 'string' && row.assigned_to.trim().length > 0) ||
    (typeof row.assigned_name === 'string' && row.assigned_name.trim().length > 0)
  )
  const pausedUntil = (data ?? [])
    .map((row) => row.mara_paused_until)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((value) => new Date(value).getTime() > now)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

  return { candidates, pausedUntil, humanHandoffActive, assignedName }
}
