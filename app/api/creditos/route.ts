import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

const OWNER_EMAIL = 'joaomaarcoos@gmail.com'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') ?? '7', 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await adminClient
    .from('openai_usage_log')
    .select('model, context, input_tokens, output_tokens, total_tokens, cost_usd, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return NextResponse.json({ rows: [], tableReady: false })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as {
    model: string
    context: string
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cost_usd: number
    created_at: string
  }[]

  // Totals
  const total_cost_usd = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0)
  const total_tokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0)
  const total_calls = rows.length

  // Daily breakdown
  const dailyMap = new Map<string, { cost: number; tokens: number; calls: number }>()
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    const prev = dailyMap.get(day) ?? { cost: 0, tokens: 0, calls: 0 }
    dailyMap.set(day, {
      cost: prev.cost + (r.cost_usd ?? 0),
      tokens: prev.tokens + (r.total_tokens ?? 0),
      calls: prev.calls + 1,
    })
  }
  const per_day = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // By context
  type ContextKey = string
  const ctxMap = new Map<ContextKey, { model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>()
  for (const r of rows) {
    const key = `${r.context}||${r.model}`
    const prev = ctxMap.get(key) ?? { model: r.model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
    ctxMap.set(key, {
      model: r.model,
      calls: prev.calls + 1,
      input_tokens: prev.input_tokens + (r.input_tokens ?? 0),
      output_tokens: prev.output_tokens + (r.output_tokens ?? 0),
      cost_usd: prev.cost_usd + (r.cost_usd ?? 0),
    })
  }
  const by_context = Array.from(ctxMap.entries())
    .map(([key, v]) => ({ context: key.split('||')[0], ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  return NextResponse.json({
    tableReady: true,
    days,
    total_cost_usd,
    total_tokens,
    total_calls,
    avg_cost_per_day: days > 0 ? total_cost_usd / days : 0,
    per_day,
    by_context,
  })
}
