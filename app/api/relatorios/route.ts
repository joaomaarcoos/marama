import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── Topic extraction from raw message text ───────────────────────────────────

const PT_STOPWORDS = new Set([
  'a','as','ao','aos','e','é','o','os','um','uma','uns','umas',
  'de','da','do','das','dos','em','na','no','nas','nos',
  'por','para','com','sem','que','se','não','sim','mas','mais',
  'muito','bem','como','quando','onde','qual','quais','tudo','nada',
  'só','também','já','ainda','aqui','ali','lá','isso','isto','aquilo',
  'foi','ser','ter','estar','está','estou','estão','estamos',
  'tenho','tem','tinha','tinha','temos','têm','tinham',
  'pode','posso','vou','vai','ir','vir','fazer','feito','faz',
  'sobre','até','após','antes','depois','então','porque','pois',
  'oi','olá','boa','bom','tarde','noite','dia','manhã',
  'obrigado','obrigada','obrigados','certo','claro','okay','ok',
  'preciso','quero','gostaria','consegui','consegue','conseguiu',
  'mara','favor','falar','dizer','saber','ver','olha','ola',
  'meu','minha','meus','minhas','seu','sua','seus','suas',
  'aquele','aquela','este','esta','esse','essa','esses','essas',
  'você','vocês','eu','nos','nós','eles','elas','ele','ela',
  'me','te','lhe','nos','vos','lhes','si','consigo',
  'quem','coisa','jeito','forma','vez','caso','tipo','parte',
  'sempre','nunca','agora','hoje','ontem','amanhã','hora','horas',
  'mesmo','mesma','outros','outras','outro','outra','todo','toda',
  'algum','alguma','nenhum','nenhuma','qualquer','cada',
  'assim','então','porém','contudo','todavia','entretanto',
  'aqui','cá','lá','ali','aí',
  // Nomes próprios comuns em português (para filtrar de tópicos)
  'maria','santos','joão','josé','francisco','carlos','pedro','paulo',
  'silva','oliveira','ferreira','costa','rocha','gomes','sousa','alves',
  'ana','paula','gabriela','juliana','patricia','barbara','carmem',
  'manuel','luis','salvador','antonio','miguel','miguel','andre',
])

const TOPIC_COLORS = [
  'hsl(217 91% 60%)', 'hsl(160 84% 39%)', 'hsl(38 92% 50%)',
  'hsl(262 80% 65%)', 'hsl(0 75% 60%)',   'hsl(300 65% 60%)',
  'hsl(180 65% 45%)', 'hsl(45 90% 52%)',  'hsl(20 85% 55%)',
  'hsl(240 65% 65%)',
]

function extractTopics(messages: string[], topN = 10) {
  const freq = new Map<string, number>()

  for (const msg of messages) {
    // Normalize: lowercase, strip punctuation/numbers, split words
    const words = msg
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-záàâãéèêíóôõúüçñ\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !PT_STOPWORDS.has(w))

    // Deduplicate within the same message so one chatty person doesn't skew counts
    const unique = Array.from(new Set(words))
    for (const w of unique) {
      freq.set(w, (freq.get(w) ?? 0) + 1)
    }
  }

  return Array.from(freq.entries())
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([word, count], i) => ({
      label: word.charAt(0).toUpperCase() + word.slice(1),
      color: TOPIC_COLORS[i % TOPIC_COLORS.length],
      count,
    }))
}

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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '50'))
  const offset = (page - 1) * pageSize

  const { from, to } = getPeriodRange(period)

  try {
  // Fetch conversations in period with pagination
  const convsResult = await adminClient
    .from('conversations')
    .select(
      'phone, contact_name, last_message, last_message_at, status, assigned_to, assigned_name, labels, followup_stage, contact_id, students(full_name)',
      { count: 'exact' }
    )
    .gte('last_message_at', from)
    .lte('last_message_at', to)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const conversations = convsResult.data ?? []
  const totalCount = convsResult.count ?? 0

  // --- Summary counts ---
  const total = conversations.length
  const maraCount = conversations.filter((c) => !c.assigned_to).length
  const humanCount = conversations.filter((c) => !!c.assigned_to).length
  const resolvedCount = conversations.filter((c) => c.status === 'resolved' || c.followup_stage === 'closed').length
  const activeCount = conversations.filter((c) => c.status === 'active').length

  // --- Fetch contacts to get labels (P1.1) ---
  const contactIds = conversations
    .map((c) => (c.contact_id as string | null))
    .filter((id): id is string => id !== null)
  
  const contactsMap = new Map<string, { labels: string[] }>()
  if (contactIds.length > 0) {
    const { data: contacts } = await adminClient
      .from('contacts')
      .select('id, labels')
      .in('id', contactIds)
    
    contacts?.forEach((contact) => {
      contactsMap.set(contact.id as string, {
        labels: Array.isArray(contact.labels) ? contact.labels : [],
      })
    })
  }

  // --- Breakdown by agent with resolution rate (P1.3) ---
  const agentMap = new Map<string, { name: string; count: number; resolved: number; phones: string[] }>()
  for (const c of conversations) {
    if (!c.assigned_to) continue
    const key = c.assigned_to as string
    const name = (c.assigned_name as string | null) ?? key
    if (!agentMap.has(key)) agentMap.set(key, { name, count: 0, resolved: 0, phones: [] })
    const entry = agentMap.get(key)!
    entry.count++
    entry.phones.push(c.phone as string)
    
    // Check if resolved
    if (c.status === 'resolved' || c.followup_stage === 'closed') {
      entry.resolved++
    }
  }
  
  const byAgent = Array.from(agentMap.values())
    .map((a) => ({
      name: a.name,
      count: a.count,
      resolved: a.resolved,
      resolutionRate: a.count > 0 ? Math.round((a.resolved / a.count) * 100) : 0,
      phones: a.phones,
    }))
    .sort((a, b) => b.count - a.count)

  // --- Topics from chatmemory keyword frequency ---
  const phones = conversations.map((c) => c.phone as string)
  let topics: Array<{ label: string; color: string; count: number }> = []

  if (phones.length > 0) {
    const { data: msgs } = await adminClient
      .from('chatmemory')
      .select('content')
      .in('session_id', phones.slice(0, 200)) // guard against PostgREST IN limit
      .eq('role', 'user')
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(1500)

    topics = extractTopics((msgs ?? []).map((m) => m.content as string))
  }

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
  const list = conversations.map((c) => {
    const contactId = c.contact_id as string | null
    const contactLabels = contactId ? contactsMap.get(contactId)?.labels ?? [] : []
    
    return {
      phone: c.phone,
      contact_name: c.contact_name ?? (c.students as { full_name?: string } | null)?.full_name ?? null,
      last_message: c.last_message,
      last_message_at: c.last_message_at,
      status: c.status,
      assigned_to: c.assigned_to,
      assigned_name: c.assigned_name,
      followup_stage: c.followup_stage,
      labels: (c.labels as string[] | null) ?? [],
      label_names: contactLabels,
    }
  })

  return NextResponse.json({
    period,
    from,
    to,
    page,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
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
