import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInstance } from '@/lib/evolution'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const result = await createInstance()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar instancia'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
