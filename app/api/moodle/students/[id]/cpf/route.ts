import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeCpf } from '@/lib/utils'
import { adminClient } from '@/lib/supabase/admin'
import { syncContactsSnapshot } from '@/lib/contacts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { cpf } = await request.json()

  // Allow clearing CPF
  if (cpf === '' || cpf === null) {
    const { error } = await adminClient
      .from('students')
      .update({ cpf: null })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await syncContactsSnapshot()
    return NextResponse.json({ cpf: null })
  }

  const normalized = normalizeCpf(cpf)
  if (!normalized) {
    return NextResponse.json({ error: 'CPF inválido (precisa ter 11 dígitos)' }, { status: 400 })
  }

  // Check for duplicate
  const { data: existing } = await adminClient
    .from('students')
    .select('id, full_name')
    .eq('cpf', normalized)
    .neq('id', params.id)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: `CPF já cadastrado para ${existing.full_name}` },
      { status: 409 }
    )
  }

  const { error } = await adminClient
    .from('students')
    .update({ cpf: normalized })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncContactsSnapshot()

  return NextResponse.json({ cpf: normalized })
}
