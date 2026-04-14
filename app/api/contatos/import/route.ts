import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { normalizePhone, normalizeCpf } from '@/lib/utils'

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

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

  const colIndex = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1

  const iNome = colIndex(['nome', 'name', 'full_name'])
  const iTelefone = colIndex(['telefone', 'phone', 'tel', 'celular'])
  const iEmail = colIndex(['email', 'e-mail'])
  const iCpf = colIndex(['cpf'])

  if (iNome < 0 || iTelefone < 0) {
    return NextResponse.json(
      { error: 'O CSV precisa ter as colunas "nome" e "telefone".' },
      { status: 400 }
    )
  }

  const rows: { full_name: string; phone: string; email: string | null; cpf: string | null }[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const nome = cols[iNome]?.trim()
    const rawPhone = cols[iTelefone]?.trim()
    const email = iEmail >= 0 ? cols[iEmail]?.trim() || null : null
    const rawCpf = iCpf >= 0 ? cols[iCpf]?.trim() || null : null

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

    rows.push({ full_name: nome, phone, email, cpf })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhum contato válido encontrado no arquivo.', details: errors }, { status: 400 })
  }

  const { error: upsertError } = await adminClient
    .from('students')
    .upsert(rows, { onConflict: 'phone', ignoreDuplicates: false })

  if (upsertError) {
    return NextResponse.json({ error: `Erro ao salvar contatos: ${upsertError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    imported: rows.length,
    skipped: errors.length,
    message: `${rows.length} contato(s) importado(s) com sucesso.`,
    warnings: errors.length > 0 ? errors : undefined,
  })
}
