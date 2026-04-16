import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllTutors } from '@/lib/moodle'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const tutors = await getAllTutors()
    return NextResponse.json({ tutors })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar tutores'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
