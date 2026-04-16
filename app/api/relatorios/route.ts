import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function getPeriodRange(period: string): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString()

  switch (period) {
    case 'today': {
      const from = new Date(now)
      from.setHours(0, 0, 0, 0)
      return { from: from.toISOString(), to }
    }
    case '7d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 7)
      return { from: from.toISOString(), to }
    }
    case '90d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 90)
      return { from: from.toISOString(), to }
    }
    case '30d':
    default: {
      const from = new Date(now)
      from.setDate(from.getDate() - 30)
      return { from: from.toISOString(), to }
    }
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? '30d'
  const { from, to } = getPeriodRange(period)

  try {
  // Fetch all conversations in period plus labels in parallel
  const [convsResult, labelsResult] = await Promise.all([
    adminClient
      .from('conversations')
      .select(
        'phone, contact_name, last_message, last_message_at, status, assigned_to, assigned_name, labels, followup_stage, students(full_name)'
      )
      .gte('last_message_at', from)
      .lte('last_message_at', to)
      .order('last_message_at', { ascending: false }),
    adminClient.from('labels').select('id, name, color'),
  ])

  const conversations = convsResult.data ?? []
  const labelRows = labelsResult.data ?? []
  const labelMap = new Map(labelRows.map((l) => [l.id, l]))

  // --- Summary counts ---
  const total = conversations.length
  const maraCount = conversations.filter((c) => !c.assigned_to).length
  const humanCount = conversations.filter((c) => !!c.assigned_to).length
  const resolvedCount = conversations.filter((c) => c.status === 'resolved').length
  const activeCount = conversations.filter((c) => c.status === 'active').length

  // --- Breakdown by agent ---
  const agentMap = new Map<string, { name: string; count: number; phones: string[] }>()
  for (const c of conversations) {
    if (!c.assigned_to) continue
    const key = c.assigned_to as string
    const name = (c.assigned_name as string | null) ?? key
    if (!agentMap.has(key)) agentMap.set(key, { name, count: 0, phones: [] })
    const entry = agentMap.get(key)!
    entry.count++
    entry.phones.push(c.phone as string)
  }
  const byAgent = Array.from(agentMap.values()).sort((a, b) => b.count - a.count)

  // --- Topics from labels ---
  const topicCount = new Map<string, { label: string; color: string; count: number }>()
  for (const c of conversations) {
    const labels = (c.labels as string[] | null) ?? []
    for (const id of labels) {
      const lbl = labelMap.get(id)
      if (!lbl) continue
      if (!topicCount.has(id)) topicCount.set(id, { label: lbl.name, color: lbl.color, count: 0 })
      topicCount.get(id)!.count++
    }
  }
  const topics = Array.from(topicCount.values()).sort((a, b) => b.count - a.count).slice(0, 10)

  // --- Daily timeline (last N days) ---
  const dayBuckets = new Map<string, { mara: number; human: number }>()
  for (const c of conversations) {
    if (!c.last_message_at) continue
    const day = (c.last_message_at as string).slice(0, 10)
    if (!dayBuckets.has(day)) dayBuckets.set(day, { mara: 0, human: 0 })
    const bucket = dayBuckets.get(day)!
    if (c.assigned_to) bucket.human++
    else bucket.mara++
  }
  const timeline = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

  // Clean up conversations for list response
  const list = conversations.map((c) => ({
    phone: c.phone,
    contact_name: c.contact_name ?? (c.students as { full_name?: string } | null)?.full_name ?? null,
    last_message: c.last_message,
    last_message_at: c.last_message_at,
    status: c.status,
    assigned_to: c.assigned_to,
    assigned_name: c.assigned_name,
    followup_stage: c.followup_stage,
    labels: (c.labels as string[] | null) ?? [],
    label_names: ((c.labels as string[] | null) ?? [])
      .map((id) => labelMap.get(id)?.name)
      .filter(Boolean),
  }))

  return NextResponse.json({
    period,
    from,
    to,
    summary: { total, mara: maraCount, human: humanCount, resolved: resolvedCount, active: activeCount },
    byAgent,
    topics,
    timeline,
    conversations: list,
  })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar relatório'
    console.error('[/api/relatorios]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
