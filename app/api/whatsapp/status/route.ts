import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstanceStatus } from '@/lib/evolution'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const status = await getInstanceStatus()
  return NextResponse.json(status)
}
