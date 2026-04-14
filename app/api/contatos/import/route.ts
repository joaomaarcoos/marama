import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { normalizePhone, normalizeCpf } from '@/lib/utils'

// Paleta de cores para etiquetas criadas automaticamente
const LABEL_COLORS = [
  'hsl(217 91% 60%)',
  'hsl(160 84% 39%)',
  'hsl(38 92% 50%)',
  'hsl(330 81% 60%)',
  'hsl(262 80% 65%)',
  'hsl(0 72% 60%)',
  'hsl(190 90% 50%)',
  'hsl(48 96% 53%)',
]

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

async function resolveLabels(names: string[]): Promise<string[]> {
  if (names.length === 0) return []

  const { data: existing } = await adminClient
    .from('labels')
    .select('id, name')

  const existingMap = new Map(
    ((existing ?? []) as { id: string; name: string }[]).map((l) => [l.name.toLowerCase(), l.id])
  )

  const toCreate = names.filter((n) => !existingMap.has(n.toLowerCase()))

  if (toCreate.length > 0) {
    const newRows = toCreate.map((name, i) => ({
      name,
      color: LABEL_COLORS[i % LABEL_COLORS.length],
    }))

    const { data: created } = await adminClient
      .from('labels')
      .insert(newRows)
      .select('id, name')

    for (const row of (created ?? []) as { id: string; name: string }[]) {
      existingMap.set(row.name.toLowerCase(), row.id)
    }
  }

  return names.map((n) => existingMap.get(n.toLowerCase())).filter((id): id is string => Boolean(id))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: 'Arquivo vazio ou sem dados.' }, { status: 400 })

  const header = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )

  const colIndex = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1

  const iNome      = colIndex(['nome', 'name', 'full_name'])
  const iTelefone  = colIndex(['telefone', 'phone', 'tel', 'celular'])
  const iEmail     = colIndex(['email', 'e-mail'])
  const iCpf       = colIndex(['cpf'])
  const iEtiquetas = colIndex(['etiquetas', 'labels', 'tags', 'etiqueta'])

  if (iNome < 0 || iTelefone < 0) {
    return NextResponse.json(
      { error: 'O CSV precisa ter as colunas "nome" e "telefone".' },
      { status: 400 }
    )
  }

  type StudentRow = { full_name: string; phone: string; email: string | null; cpf: string | null }
  type LabelRow   = { phone: string; labelNames: string[] }

  const studentRows: StudentRow[] = []
  const labelRows: LabelRow[]     = []
  const errors: string[]          = []

  for (let i = 1; i < lines.length; i++) {
    const cols    = parseCsvLine(lines[i])
    const nome    = cols[iNome]?.trim()
    const rawPhone = cols[iTelefone]?.trim()
    const email   = iEmail     >= 0 ? cols[iEmail]?.trim()     || null : null
    const rawCpf  = iCpf       >= 0 ? cols[iCpf]?.trim()       || null : null
    const rawTags = iEtiquetas >= 0 ? cols[iEtiquetas]?.trim() || ''   : ''

    if (!nome || !rawPhone) {
      errors.push(`Linha ${i + 1}: nome ou telefone em branco — ignorado.`)
      continue
    }

    const phone = normalizePhone(rawPhone)
    if (!phone) {
      errors.push(`Linha ${i + 1}: telefone inválido "${rawPhone}" — ignorado.`)
      continue
    }

    const cpf = rawCpf ? normalizeCpf(rawCpf) ?? rawCpf : null

    studentRows.push({ full_name: nome, phone, email, cpf })

    const labelNames = rawTags
      .split(/[;|]/)
      .map((t) => t.trim())
      .filter(Boolean)

    if (labelNames.length > 0) {
      labelRows.push({ phone, labelNames })
    }
  }

  if (studentRows.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum contato válido encontrado no arquivo.', details: errors },
      { status: 400 }
    )
  }

  // 1. Upsert students
  const { error: upsertError } = await adminClient
    .from('students')
    .upsert(studentRows, { onConflict: 'phone', ignoreDuplicates: false })

  if (upsertError) {
    return NextResponse.json({ error: `Erro ao salvar contatos: ${upsertError.message}` }, { status: 500 })
  }

  // 2. Resolve + apply labels via conversations
  if (labelRows.length > 0) {
    const allLabelNames = Array.from(new Set(labelRows.flatMap((r) => r.labelNames)))
    const labelIdMap = await resolveLabels(allLabelNames).then(async (ids) => {
      // Rebuild name→id map after resolution
      const { data } = await adminClient.from('labels').select('id, name').in('id', ids)
      return new Map(((data ?? []) as { id: string; name: string }[]).map((l) => [l.name.toLowerCase(), l.id]))
    })

    for (const { phone, labelNames } of labelRows) {
      const labelIds = labelNames
        .map((n) => labelIdMap.get(n.toLowerCase()))
        .filter((id): id is string => Boolean(id))

      if (labelIds.length === 0) continue

      // Fetch existing conversation labels to merge
      const { data: conv } = await adminClient
        .from('conversations')
        .select('labels')
        .eq('phone', phone)
        .maybeSingle()

      const existingIds: string[] = Array.isArray(conv?.labels) ? conv.labels as string[] : []
      const mergedIds = Array.from(new Set([...existingIds, ...labelIds]))

      await adminClient
        .from('conversations')
        .upsert(
          { phone, labels: mergedIds, status: 'active' },
          { onConflict: 'phone', ignoreDuplicates: false }
        )
    }
  }

  return NextResponse.json({
    imported: studentRows.length,
    skipped: errors.length,
    message: `${studentRows.length} contato(s) importado(s) com sucesso.${labelRows.length > 0 ? ` Etiquetas aplicadas em ${labelRows.length} contato(s).` : ''}`,
    warnings: errors.length > 0 ? errors : undefined,
  })
}
