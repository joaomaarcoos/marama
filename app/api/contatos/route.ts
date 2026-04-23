import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { normalizePhone, normalizeCpf } from '@/lib/utils'
import { syncContactsSnapshot } from '@/lib/contacts'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json() as { nome?: string; telefone?: string; email?: string; cpf?: string }
  const nome = body.nome?.trim()
  const rawPhone = body.telefone?.trim()
  const email = body.email?.trim() || null
  const rawCpf = body.cpf?.trim() || null

  if (!nome) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!rawPhone) return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 })

  const phone = normalizePhone(rawPhone)
  if (!phone) return NextResponse.json({ error: `Telefone inválido: "${rawPhone}".` }, { status: 400 })

  const cpf = rawCpf ? normalizeCpf(rawCpf) ?? rawCpf : null

  const { error: upsertError } = await adminClient
    .from('students')
    .upsert({ full_name: nome, phone, email, cpf }, { onConflict: 'phone', ignoreDuplicates: false })

  if (upsertError) {
    return NextResponse.json({ error: `Erro ao salvar contato: ${upsertError.message}` }, { status: 500 })
  }

  try {
    await syncContactsSnapshot(true)
  } catch {
    // non-fatal
  }

  return NextResponse.json({ message: 'Contato criado com sucesso.' })
}
