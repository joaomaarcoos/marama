import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { DollarSign, Zap, TrendingUp, Hash, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const OWNER_EMAIL = 'joaomaarcoos@gmail.com'

const CONTEXT_LABELS: Record<string, { label: string; color: string }> = {
  'chat/mara_reply':   { label: 'Resposta MARA',       color: 'hsl(217 91% 60%)' },
  'embed/rag_query':   { label: 'Embedding (busca)',    color: 'hsl(160 84% 39%)' },
  'embed/doc_index':   { label: 'Embedding (indexação)',color: 'hsl(38 92% 50%)' },
  'audio/transcricao': { label: 'Transcrição áudio',    color: 'hsl(262 80% 65%)' },
  'chat/resposta':     { label: 'Chat genérico',        color: 'hsl(215 18% 55%)' },
}

const PERIOD_OPTIONS = [
  { label: '7 dias',  value: 7 },
  { label: '15 dias', value: 15 },
  { label: '30 dias', value: 30 },
]

function fmtUsd(v: number) {
  return v < 0.01
    ? `$${(v * 100).toFixed(4)}¢`
    : `$${v.toFixed(4)}`
}

function fmtNum(v: number) {
  return v.toLocaleString('pt-BR')
}

interface UsageRow {
  model: string
  context: string
  calls: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

interface DayRow {
  date: string
  cost: number
  tokens: number
  calls: number
}

interface ApiResult {
  tableReady: boolean
  days?: number
  total_cost_usd?: number
  total_tokens?: number
  total_calls?: number
  avg_cost_per_day?: number
  per_day?: DayRow[]
  by_context?: UsageRow[]
}

async function loadUsage(days: number): Promise<ApiResult> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await adminClient
    .from('openai_usage_log')
    .select('model, context, input_tokens, output_tokens, total_tokens, cost_usd, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') return { tableReady: false }
    throw new Error(error.message)
  }

  const rows = (data ?? []) as {
    model: string; context: string; input_tokens: number
    output_tokens: number; total_tokens: number; cost_usd: number; created_at: string
  }[]

  const total_cost_usd = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0)
  const total_tokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0)
  const total_calls = rows.length

  const dailyMap = new Map<string, DayRow>()
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    const prev = dailyMap.get(day) ?? { date: day, cost: 0, tokens: 0, calls: 0 }
    dailyMap.set(day, { date: day, cost: prev.cost + (r.cost_usd ?? 0), tokens: prev.tokens + (r.total_tokens ?? 0), calls: prev.calls + 1 })
  }
  const per_day = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  const ctxMap = new Map<string, UsageRow>()
  for (const r of rows) {
    const key = `${r.context}||${r.model}`
    const prev = ctxMap.get(key) ?? { model: r.model, context: r.context, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
    ctxMap.set(key, { model: r.model, context: r.context, calls: prev.calls + 1, input_tokens: prev.input_tokens + (r.input_tokens ?? 0), output_tokens: prev.output_tokens + (r.output_tokens ?? 0), cost_usd: prev.cost_usd + (r.cost_usd ?? 0) })
  }
  const by_context = Array.from(ctxMap.values()).sort((a, b) => b.cost_usd - a.cost_usd)

  return { tableReady: true, days, total_cost_usd, total_tokens, total_calls, avg_cost_per_day: total_cost_usd / days, per_day, by_context }
}

export default async function CreditosPage({
  searchParams,
}: {
  searchParams: { d?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== OWNER_EMAIL) redirect('/dashboard')

  const days = PERIOD_OPTIONS.find(p => p.value === parseInt(searchParams.d ?? '7', 10))?.value ?? 7
  const result = await loadUsage(days)

  function periodHref(d: number) {
    return `/creditos?d=${d}`
  }

  return (
    <div className="app-content animate-fade-up">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(213 31% 91%)' }}>
            Créditos
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: 'hsl(215 18% 55%)' }}>
            Consumo de tokens e custo estimado da OpenAI por período.
          </p>
        </div>

        {/* Period tabs */}
        <div
          className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={periodHref(opt.value)}
              className="rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                days === opt.value
                  ? { background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }
                  : { color: 'hsl(215 18% 55%)' }
              }
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {!result.tableReady ? (
        <div
          className="rounded-2xl border border-dashed p-10 text-center"
          style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(38 92% 50% / 0.4)' }}
        >
          <AlertTriangle className="mx-auto mb-3 h-8 w-8" style={{ color: 'hsl(38 92% 50%)' }} />
          <p className="font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
            Tabela <code>openai_usage_log</code> não encontrada
          </p>
          <p className="mt-2 text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            Execute o SQL abaixo no Supabase SQL Editor para ativar o rastreamento:
          </p>
          <pre
            className="mt-4 rounded-xl p-4 text-left text-xs overflow-x-auto"
            style={{ background: 'hsl(220 38% 6%)', color: 'hsl(160 84% 55%)', border: '1px solid hsl(216 32% 15%)' }}
          >{`CREATE TABLE public.openai_usage_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  model       TEXT        NOT NULL,
  context     TEXT        NOT NULL,
  input_tokens  INTEGER   DEFAULT 0,
  output_tokens INTEGER   DEFAULT 0,
  total_tokens  INTEGER   DEFAULT 0,
  cost_usd    NUMERIC(12, 8) DEFAULT 0,
  phone       TEXT
);
CREATE INDEX ON public.openai_usage_log (created_at DESC);
CREATE INDEX ON public.openai_usage_log (context);`}
          </pre>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Custo total',       value: fmtUsd(result.total_cost_usd ?? 0),       icon: DollarSign, accent: 'hsl(160 84% 39%)' },
              { label: 'Total de tokens',   value: fmtNum(result.total_tokens ?? 0),          icon: Hash,       accent: 'hsl(217 91% 60%)' },
              { label: 'Total de chamadas', value: fmtNum(result.total_calls ?? 0),            icon: Zap,        accent: 'hsl(262 80% 65%)' },
              { label: 'Média por dia',     value: fmtUsd(result.avg_cost_per_day ?? 0),      icon: TrendingUp,  accent: 'hsl(38 92% 50%)' },
            ].map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.label}
                  className="rounded-xl p-5"
                  style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', borderTop: `2px solid ${card.accent}` }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: card.accent.replace(')', ' / 0.12)'), color: card.accent }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="font-data text-2xl font-bold" style={{ color: 'hsl(213 31% 92%)' }}>{card.value}</p>
                  <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>{card.label}</p>
                </div>
              )
            })}
          </div>

          {/* Breakdown by context */}
          <div
            className="mb-6 overflow-hidden rounded-2xl"
            style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                Custo por origem
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                Onde estão sendo gastos os tokens no período selecionado
              </p>
            </div>

            {(result.by_context ?? []).length === 0 ? (
              <div className="px-6 py-10 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
                Nenhum dado registrado neste período ainda.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'hsl(220 36% 10%)' }}>
                    {['Origem', 'Modelo', 'Chamadas', 'Tokens entrada', 'Tokens saída', 'Custo estimado', '% do total'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.by_context ?? []).map((row, i) => {
                    const meta = CONTEXT_LABELS[row.context] ?? { label: row.context, color: 'hsl(215 18% 55%)' }
                    const pct = result.total_cost_usd ? (row.cost_usd / result.total_cost_usd) * 100 : 0
                    return (
                      <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid hsl(216 30% 14%)' }}>
                        <td className="px-5 py-4">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ color: meta.color, background: meta.color.replace(')', ' / 0.12)'), border: `1px solid ${meta.color.replace(')', ' / 0.24)')}` }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs" style={{ color: 'hsl(215 18% 55%)' }}>{row.model}</td>
                        <td className="px-5 py-4 text-sm tabular-nums" style={{ color: 'hsl(213 31% 92%)' }}>{fmtNum(row.calls)}</td>
                        <td className="px-5 py-4 text-sm tabular-nums" style={{ color: 'hsl(213 31% 92%)' }}>{fmtNum(row.input_tokens)}</td>
                        <td className="px-5 py-4 text-sm tabular-nums" style={{ color: 'hsl(213 31% 92%)' }}>{fmtNum(row.output_tokens)}</td>
                        <td className="px-5 py-4 text-sm font-semibold tabular-nums" style={{ color: 'hsl(160 84% 55%)' }}>{fmtUsd(row.cost_usd)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: 'hsl(216 32% 15%)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: meta.color }} />
                            </div>
                            <span className="text-xs tabular-nums" style={{ color: 'hsl(215 18% 55%)' }}>{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Daily trend */}
          {(result.per_day ?? []).length > 0 && (
            <div
              className="overflow-hidden rounded-2xl"
              style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
            >
              <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>Custo diário</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'hsl(220 36% 10%)' }}>
                    {['Data', 'Chamadas', 'Tokens', 'Custo'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.per_day ?? []).map((row, i) => (
                    <tr key={row.date} style={{ borderTop: i === 0 ? 'none' : '1px solid hsl(216 30% 14%)' }}>
                      <td className="px-5 py-3 text-sm" style={{ color: 'hsl(213 31% 92%)' }}>
                        {new Date(row.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-5 py-3 text-sm tabular-nums" style={{ color: 'hsl(215 18% 55%)' }}>{fmtNum(row.calls)}</td>
                      <td className="px-5 py-3 text-sm tabular-nums" style={{ color: 'hsl(215 18% 55%)' }}>{fmtNum(row.tokens)}</td>
                      <td className="px-5 py-3 text-sm font-semibold tabular-nums" style={{ color: 'hsl(160 84% 55%)' }}>{fmtUsd(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs" style={{ color: 'hsl(215 18% 35%)' }}>
            * Custo do Whisper estimado em 30 s/chamada ($0,003). Valores em USD com base na tabela de preços da OpenAI de maio de 2025.
          </p>
        </>
      )}
    </div>
  )
}
