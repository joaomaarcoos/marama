import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { phone } = await request.json()

  // Allow clearing phone (empty string → null)
  if (phone === '' || phone === null) {
    const { error } = await supabase
      .from('students')
      .update({ phone: null })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ phone: null })
  }

  const normalized = normalizePhone(phone)
  if (!normalized) {
    return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })
  }

  // Check for duplicate (another student already has this phone)
  const { data: existing } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('phone', normalized)
    .neq('id', params.id)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: `Número já cadastrado para ${existing.full_name}` },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('students')
    .update({ phone: normalized })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ phone: normalized })
}
