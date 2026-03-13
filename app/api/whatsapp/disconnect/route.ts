import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectInstance } from '@/lib/evolution'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    await disconnectInstance()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao desconectar'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
