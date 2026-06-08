import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getAllTutors } from '@/lib/moodle'

export const dynamic = 'force-dynamic'

/** GET — lê do banco (rápido, sem bater no Moodle) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient
    .from('tutores')
    .select('*')
    .order('lastaccess', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tutors: data ?? [], from_db: true })
}

/** POST — sincroniza do Moodle → banco */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const tutors = await getAllTutors()

    if (tutors.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum tutor encontrado. Verifique as credenciais do Moodle.' },
        { status: 502 }
      )
    }

    const rows = tutors.map(t => ({
      moodle_id: t.id,
      full_name: t.fullname,
      email: t.email || null,
      username: t.username || null,
      roles: t.roles,
      courses: t.courses,
      lastaccess: t.lastaccess,
      last_synced_at: new Date().toISOString(),
    }))

    const { error } = await adminClient
      .from('tutores')
      .upsert(rows, { onConflict: 'moodle_id', ignoreDuplicates: false })

    if (error) throw new Error(error.message)

    return NextResponse.json({ synced: rows.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar tutores' },
      { status: 500 }
    )
  }
}
