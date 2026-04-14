import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncContactsSnapshot } from '@/lib/contacts'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const profiles = await syncContactsSnapshot()
    return NextResponse.json({ ok: true, contacts: profiles.length })
  } catch (error) {
    console.error('[contacts/rebuild] Falha ao reconstruir contatos:', error)
    return NextResponse.json({ error: 'Nao foi possivel reconstruir os contatos.' }, { status: 500 })
  }
}
