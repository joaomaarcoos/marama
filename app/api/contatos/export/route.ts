import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

function escapeCsv(value: string | null | undefined): string {
  const str = value ?? ''
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const [contactsResult, labelsResult] = await Promise.all([
    adminClient
      .from('contacts')
      .select('display_name, canonical_phone, email, cpf, labels, courses, status, last_message_at, message_count, knowledge_level, assigned_name')
      .order('last_message_at', { ascending: false }),
    adminClient.from('labels').select('id, name'),
  ])

  if (contactsResult.error) {
    return NextResponse.json({ error: contactsResult.error.message }, { status: 500 })
  }

  const labelMap = new Map(
    ((labelsResult.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])
  )

  const header = ['nome', 'telefone', 'email', 'cpf', 'etiquetas', 'cursos', 'status', 'mensagens', 'vinculo', 'atribuido_a', 'ultimo_contato']
  const rows = (contactsResult.data ?? []).map((c) => {
    const labelNames = Array.isArray(c.labels)
      ? (c.labels as string[]).map((id) => labelMap.get(id) ?? id).join('; ')
      : ''
    const courseNames = Array.isArray(c.courses)
      ? (c.courses as { fullname?: string; shortname?: string }[])
          .map((co) => co.fullname ?? co.shortname ?? '')
          .filter(Boolean)
          .join('; ')
      : ''
    return [
      escapeCsv(c.display_name),
      escapeCsv(c.canonical_phone),
      escapeCsv(c.email),
      escapeCsv(c.cpf),
      escapeCsv(labelNames),
      escapeCsv(courseNames),
      escapeCsv(c.status),
      String(c.message_count ?? 0),
      escapeCsv(c.knowledge_level),
      escapeCsv(c.assigned_name),
      escapeCsv(c.last_message_at ? new Date(c.last_message_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''),
    ].join(',')
  })

  const csv = [header.join(','), ...rows].join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contatos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
