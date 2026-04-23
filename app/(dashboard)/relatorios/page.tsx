'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart2,
  Bot,
  Users,
  CheckCircle2,
  MessageSquare,
  Download,
  RefreshCw,
  Tag,
  Clock,
  TrendingUp,
  User,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | '7d' | '30d' | '90d'

interface Summary {
  total: number
  mara: number
  human: number
  resolved: number
  active: number
}

interface AgentRow {
  name: string
  count: number
  phones: string[]
}

interface Topic {
  label: string
  color: string
  count: number
}

interface TimelinePoint {
  date: string
  mara: number
  human: number
}

interface ConvRow {
  phone: string
  contact_name: string | null
  last_message: string | null
  last_message_at: string | null
  status: string | null
  assigned_to: string | null
  assigned_name: string | null
  followup_stage: string | null
  labels: string[]
  label_names: string[]
}

interface ReportData {
  period: Period
  from: string
  to: string
  summary: Summary
  byAgent: AgentRow[]
  topics: Topic[]
  timeline: TimelinePoint[]
  conversations: ConvRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4)
    const num = d.slice(4)
    return `+55 (${ddd}) ${num.slice(0, -4)}-${num.slice(-4)}`
  }
  return raw
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function toCSV(rows: ConvRow[]): string {
  const header = [
    'Telefone',
    'Contato',
    'Ultimo atendimento',
    'Responsavel',
    'Status',
    'Etiquetas',
    'Ultima mensagem',
  ]
  const lines = rows.map((r) =>
    [
      fmtPhone(r.phone),
      r.contact_name ?? '',
      fmtDate(r.last_message_at),
      r.assigned_name ?? 'MARA',
      r.status ?? '',
      r.label_names.join('; '),
      (r.last_message ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(',')
  )
  return [header.join(','), ...lines].join('\r\n')
}

function downloadCSV(csv: string, filename: string) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: number
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'hsl(220 40% 8%)',
        border: '1px solid hsl(216 32% 15%)',
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="font-data text-3xl" style={{ color: 'hsl(213 31% 92%)' }}>
        {value.toLocaleString('pt-BR')}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
        {label}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'hsl(215 18% 35%)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function MiniBar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: string
}) {
  const w = max ? `${Math.round((value / max) * 100)}%` : '0%'
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden"
      style={{ background: 'hsl(220 30% 14%)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: w, background: color }}
      />
    </div>
  )
}

function TimelineChart({ data }: { data: TimelinePoint[] }) {
  if (!data.length) return null

  const maxVal = Math.max(...data.map((d) => d.mara + d.human), 1)
  const n = data.length
  const labelStep = n <= 7 ? 1 : n <= 14 ? 2 : n <= 31 ? 5 : n <= 62 ? 7 : 10

  const yTicks = [maxVal, Math.round(maxVal * 0.75), Math.round(maxVal * 0.5), Math.round(maxVal * 0.25), 0]

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'hsl(220 40% 8%)',
        border: '1px solid hsl(216 32% 15%)',
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4" style={{ color: 'hsl(217 91% 60%)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(213 31% 91%)' }}>
          Evolução de atendimentos
        </h3>
        <div className="ml-auto flex items-center gap-4 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'hsl(217 91% 60%)' }} />
            MARA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'hsl(38 92% 50%)' }} />
            Humano
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Y-axis */}
        <div
          className="flex flex-col justify-between shrink-0 text-right pr-1"
          style={{ width: '28px', paddingBottom: '22px' }}
        >
          {yTicks.map((v, i) => (
            <span key={i} className="text-[10px] leading-none tabular-nums" style={{ color: 'hsl(215 18% 38%)' }}>
              {v}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Bars + grid */}
          <div className="relative" style={{ height: '108px' }}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((pct) => (
              <div
                key={pct}
                className="absolute w-full border-t"
                style={{ top: `${pct}%`, borderColor: 'hsl(216 32% 12%)' }}
              />
            ))}

            {/* Bar groups */}
            <div className="absolute inset-0 flex items-end gap-0.5 px-px">
              {data.map((d) => {
                const total = d.mara + d.human
                const maraH = maxVal ? (d.mara / maxVal) * 100 : 0
                const humanH = maxVal ? (d.human / maxVal) * 100 : 0
                const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                })
                return (
                  <div
                    key={d.date}
                    className="flex-1 min-w-0 flex items-end gap-px"
                    style={{ height: '100%' }}
                    title={`${dayLabel}: ${total} atendimento(s)`}
                  >
                    <div
                      className="flex-1 rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${maraH}%`,
                        minHeight: d.mara > 0 ? '2px' : '0',
                        background: 'hsl(217 91% 60%)',
                        opacity: 0.85,
                      }}
                    />
                    <div
                      className="flex-1 rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${humanH}%`,
                        minHeight: d.human > 0 ? '2px' : '0',
                        background: 'hsl(38 92% 50%)',
                        opacity: 0.85,
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* X-axis date labels */}
          <div className="flex gap-0.5 px-px mt-1">
            {data.map((d, i) => {
              const show = i % labelStep === 0 || i === data.length - 1
              const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })
              return (
                <div key={d.date} className="flex-1 min-w-0 overflow-hidden text-center">
                  {show && (
                    <span
                      className="text-[9px] whitespace-nowrap"
                      style={{ color: 'hsl(215 18% 38%)' }}
                    >
                      {dayLabel}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'geral' | 'agentes' | 'todos'>('geral')

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/relatorios?period=${p}`)
      if (!res.ok) throw new Error('Erro ao carregar relatório')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const filteredConvs = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase().trim()
    if (!q) return data.conversations
    return data.conversations.filter(
      (c) =>
        c.phone.includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q) ||
        (c.assigned_name ?? '').toLowerCase().includes(q) ||
        c.label_names.some((l) => l.toLowerCase().includes(q)) ||
        (c.last_message ?? '').toLowerCase().includes(q)
    )
  }, [data, search])

  function handleDownload() {
    if (!filteredConvs.length) return
    const csv = toCSV(filteredConvs)
    const label = PERIOD_LABELS[period].toLowerCase().replace(/\s+/g, '_')
    downloadCSV(csv, `atendimentos_${label}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const s = data?.summary

  // Max agent count for bar scaling
  const maxAgentCount = useMemo(
    () => Math.max(...(data?.byAgent.map((a) => a.count) ?? [1]), 1),
    [data]
  )

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              background: 'hsl(262 80% 65% / 0.12)',
              border: '1px solid hsl(262 80% 65% / 0.25)',
            }}
          >
            <BarChart2 className="h-5 w-5" style={{ color: 'hsl(262 80% 65%)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(213 31% 91%)' }}>
              Relatório de Atendimento
            </h1>
            <p className="text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
              {data
                ? `${fmtDate(data.from).slice(0, 8)} → ${fmtDate(data.to).slice(0, 8)}`
                : 'Carregando período…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(period)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
            style={{
              background: 'hsl(220 40% 8%)',
              border: '1px solid hsl(216 32% 15%)',
              color: 'hsl(215 18% 55%)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={handleDownload}
            disabled={!filteredConvs.length}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40"
            style={{
              background: 'hsl(160 84% 39%)',
              color: 'hsl(220 26% 8%)',
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar CSV
          </button>
        </div>
      </div>

      {/* Period filters */}
      <div
        className="inline-flex rounded-lg p-1 gap-1"
        style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
      >
        {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className="rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150"
            style={
              period === key
                ? {
                    background: 'hsl(262 80% 65%)',
                    color: 'hsl(220 26% 8%)',
                  }
                : {
                    color: 'hsl(215 18% 55%)',
                  }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'hsl(0 70% 20% / 0.3)',
            border: '1px solid hsl(0 70% 40% / 0.4)',
            color: 'hsl(0 70% 70%)',
          }}
        >
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Total de atendimentos"
          value={s?.total ?? 0}
          icon={MessageSquare}
          accent="hsl(217 91% 60%)"
        />
        <KpiCard
          label="Atendidos pela MARA"
          value={s?.mara ?? 0}
          sub={s ? `${pct(s.mara, s.total)}% do total` : undefined}
          icon={Bot}
          accent="hsl(160 84% 39%)"
        />
        <KpiCard
          label="Atendidos por humanos"
          value={s?.human ?? 0}
          sub={s ? `${pct(s.human, s.total)}% do total` : undefined}
          icon={Users}
          accent="hsl(38 92% 50%)"
        />
        <KpiCard
          label="Resolvidos"
          value={s?.resolved ?? 0}
          sub={s ? `${pct(s.resolved, s.total)}% do total` : undefined}
          icon={CheckCircle2}
          accent="hsl(160 84% 39%)"
        />
        <KpiCard
          label="Em aberto"
          value={s?.active ?? 0}
          sub={s ? `${pct(s.active, s.total)}% do total` : undefined}
          icon={Clock}
          accent="hsl(262 80% 65%)"
        />
      </div>

      {/* MARA vs Humano split bar */}
      {s && s.total > 0 && (
        <div
          className="rounded-xl p-5"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
            Distribuição MARA × Humanos
          </p>
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
            <div
              className="transition-all duration-700 rounded-l-full"
              style={{
                width: `${pct(s.mara, s.total)}%`,
                background: 'hsl(160 84% 39%)',
              }}
              title={`MARA: ${s.mara} (${pct(s.mara, s.total)}%)`}
            />
            <div
              className="transition-all duration-700 rounded-r-full"
              style={{
                width: `${pct(s.human, s.total)}%`,
                background: 'hsl(38 92% 50%)',
              }}
              title={`Humanos: ${s.human} (${pct(s.human, s.total)}%)`}
            />
          </div>
          <div className="mt-2 flex gap-6 text-xs" style={{ color: 'hsl(215 18% 55%)' }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'hsl(160 84% 39%)' }} />
              MARA — {s.mara} ({pct(s.mara, s.total)}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'hsl(38 92% 50%)' }} />
              Humanos — {s.human} ({pct(s.human, s.total)}%)
            </span>
          </div>
        </div>
      )}

      {/* Timeline chart */}
      {data && data.timeline.length > 1 && <TimelineChart data={data.timeline} />}

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ borderColor: 'hsl(216 32% 15%)' }}
      >
        {(
          [
            { key: 'geral', label: 'Assuntos / Tópicos' },
            { key: 'agentes', label: 'Por atendente' },
            { key: 'todos', label: `Todos os atendimentos (${data?.summary.total ?? 0})` },
          ] as { key: typeof tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
            style={
              tab === t.key
                ? { borderColor: 'hsl(262 80% 65%)', color: 'hsl(262 80% 65%)' }
                : { borderColor: 'transparent', color: 'hsl(215 18% 42%)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Topics ── */}
      {tab === 'geral' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <div
            className="px-5 py-4 flex items-center gap-2"
            style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}
          >
            <Tag className="h-4 w-4" style={{ color: 'hsl(262 80% 65%)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(213 31% 91%)' }}>
              Assuntos mais tratados
            </h3>
            <span className="ml-auto text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
              Baseado nas etiquetas das conversas
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
              Carregando…
            </div>
          ) : !data?.topics.length ? (
            <div className="py-12 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
              Nenhuma etiqueta encontrada no período. Adicione etiquetas nas conversas para visualizar os tópicos.
            </div>
          ) : (
            <div>
              {data.topics.map((topic, i) => (
                <div
                  key={topic.label}
                  className="flex items-center gap-4 px-5 py-4"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid hsl(216 32% 13%)' }}
                >
                  <span
                    className="shrink-0 text-xs font-bold w-5 text-center"
                    style={{ color: 'hsl(215 18% 35%)' }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium shrink-0"
                    style={{
                      color: topic.color,
                      background: `${topic.color}1a`,
                      border: `1px solid ${topic.color}33`,
                    }}
                  >
                    {topic.label}
                  </span>
                  <div className="flex-1">
                    <MiniBar value={topic.count} max={data.topics[0].count} color={topic.color} />
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    style={{ color: 'hsl(213 31% 91%)' }}
                  >
                    {topic.count}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                    {pct(topic.count, data.summary.total)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Agents ── */}
      {tab === 'agentes' && (
        <div className="space-y-4">
          {/* MARA row */}
          <div
            className="rounded-xl p-5 flex items-center gap-4"
            style={{
              background: 'hsl(220 40% 8%)',
              border: '1px solid hsl(216 32% 15%)',
              borderLeft: '3px solid hsl(160 84% 39%)',
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
              style={{ background: 'hsl(160 84% 39% / 0.12)', color: 'hsl(160 84% 39%)' }}
            >
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'hsl(213 31% 91%)' }}>
                MARA (IA)
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(215 18% 42%)' }}>
                Atendimentos automáticos sem transferência
              </p>
              <div className="mt-2">
                <MiniBar value={s?.mara ?? 0} max={s?.total ?? 1} color="hsl(160 84% 39%)" />
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'hsl(213 31% 91%)' }}>
                {s?.mara ?? 0}
              </p>
              <p className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                {s ? `${pct(s.mara, s.total)}%` : '—'}
              </p>
            </div>
          </div>

          {/* Human agents */}
          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
              Carregando…
            </div>
          ) : !data?.byAgent.length ? (
            <div
              className="rounded-xl px-5 py-8 text-center text-sm"
              style={{
                background: 'hsl(220 40% 8%)',
                border: '1px solid hsl(216 32% 15%)',
                color: 'hsl(215 18% 42%)',
              }}
            >
              Nenhum atendente humano registrado no período.
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'hsl(220 40% 8%)',
                border: '1px solid hsl(216 32% 15%)',
              }}
            >
              <div
                className="px-5 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}
              >
                <Users className="h-4 w-4" style={{ color: 'hsl(38 92% 50%)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'hsl(213 31% 91%)' }}>
                  Atendentes humanos — relatório individual
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'hsl(220 36% 10%)' }}>
                    <th className="text-left px-5 py-3 text-xs uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
                      Atendente
                    </th>
                    <th className="text-left px-5 py-3 text-xs uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
                      Participação
                    </th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
                      Atendimentos
                    </th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-widest" style={{ color: 'hsl(215 18% 42%)' }}>
                      % do total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((agent, i) => (
                    <tr
                      key={agent.name}
                      style={{ borderTop: '1px solid hsl(216 32% 13%)' }}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-xs font-bold"
                            style={{
                              background: 'hsl(38 92% 50% / 0.12)',
                              color: 'hsl(38 92% 50%)',
                            }}
                          >
                            <User className="h-4 w-4" />
                          </div>
                          <span className="font-medium" style={{ color: 'hsl(213 31% 91%)' }}>
                            {agent.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4" style={{ minWidth: '140px' }}>
                        <MiniBar value={agent.count} max={maxAgentCount} color="hsl(38 92% 50%)" />
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-semibold" style={{ color: 'hsl(213 31% 91%)' }}>
                        {agent.count}
                      </td>
                      <td className="px-5 py-4 text-right text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                        {s ? `${pct(agent.count, s.total)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: All conversations ── */}
      {tab === 'todos' && (
        <div className="space-y-3">
          {/* Search + download */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar por telefone, nome, atendente, etiqueta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-sm rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: 'hsl(220 40% 8%)',
                border: '1px solid hsl(216 32% 15%)',
                color: 'hsl(213 31% 92%)',
              }}
            />
            <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
              {filteredConvs.length} registro(s)
            </span>
            <button
              onClick={handleDownload}
              disabled={!filteredConvs.length}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40"
              style={{ background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }}
            >
              <Download className="h-3.5 w-3.5" />
              Baixar CSV filtrado
            </button>
          </div>

          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'hsl(220 40% 8%)',
              border: '1px solid hsl(216 32% 15%)',
            }}
          >
            {loading ? (
              <div className="py-12 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
                Carregando…
              </div>
            ) : !filteredConvs.length ? (
              <div className="py-12 text-center text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
                Nenhum atendimento encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10" style={{ background: 'hsl(220 36% 10%)' }}>
                    <tr>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Contato</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Telefone</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Responsável</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Status</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Etiquetas</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Último contato</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-widest whitespace-nowrap" style={{ color: 'hsl(215 18% 42%)' }}>Última mensagem</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConvs.map((c, i) => {
                      const isHuman = !!c.assigned_to
                      return (
                        <tr
                          key={c.phone}
                          style={{ borderTop: '1px solid hsl(216 32% 13%)' }}
                        >
                          <td className="px-5 py-3 font-medium whitespace-nowrap" style={{ color: 'hsl(213 31% 91%)' }}>
                            {c.contact_name ?? '—'}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs whitespace-nowrap" style={{ color: 'hsl(215 18% 55%)' }}>
                            {fmtPhone(c.phone)}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={
                                isHuman
                                  ? {
                                      color: 'hsl(38 92% 50%)',
                                      background: 'hsl(38 92% 50% / 0.12)',
                                      border: '1px solid hsl(38 92% 50% / 0.3)',
                                    }
                                  : {
                                      color: 'hsl(160 84% 39%)',
                                      background: 'hsl(160 84% 39% / 0.12)',
                                      border: '1px solid hsl(160 84% 39% / 0.3)',
                                    }
                              }
                            >
                              {isHuman ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                              {c.assigned_name ?? 'MARA'}
                            </span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={
                                c.status === 'resolved'
                                  ? { color: 'hsl(160 84% 39%)', background: 'hsl(160 84% 39% / 0.1)' }
                                  : c.status === 'active'
                                  ? { color: 'hsl(217 91% 60%)', background: 'hsl(217 91% 60% / 0.1)' }
                                  : { color: 'hsl(215 18% 55%)', background: 'hsl(216 32% 15%)' }
                              }
                            >
                              {c.status === 'resolved'
                                ? 'Resolvido'
                                : c.status === 'active'
                                ? 'Ativo'
                                : c.status ?? '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {c.label_names.length === 0 ? (
                                <span className="text-xs" style={{ color: 'hsl(215 18% 35%)' }}>—</span>
                              ) : c.label_names.slice(0, 2).map((l) => (
                                <span
                                  key={l}
                                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{ background: 'hsl(262 80% 65% / 0.12)', color: 'hsl(262 80% 65%)', border: '1px solid hsl(262 80% 65% / 0.25)' }}
                                >
                                  {l}
                                </span>
                              ))}
                              {c.label_names.length > 2 && (
                                <span className="text-[10px]" style={{ color: 'hsl(215 18% 42%)' }}>
                                  +{c.label_names.length - 2}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: 'hsl(215 18% 55%)' }}>
                            {fmtDate(c.last_message_at)}
                          </td>
                          <td className="px-5 py-3 text-xs max-w-[200px]" style={{ color: 'hsl(215 18% 55%)' }}>
                            <span className="line-clamp-2">
                              {c.last_message ?? '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <Link
                              href={`/conversas/${encodeURIComponent(c.phone)}`}
                              className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap"
                              style={{
                                background: 'hsl(220 38% 12%)',
                                border: '1px solid hsl(216 30% 18%)',
                                color: 'hsl(213 31% 92%)',
                              }}
                            >
                              Ver →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
