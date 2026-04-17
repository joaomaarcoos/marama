import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Verifica sessão
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await getAdminClient().auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = (data?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? '',
    name: (u.user_metadata?.full_name as string | undefined)?.trim() || (u.email ?? ''),
    role: (u.user_metadata?.role as string | undefined) ?? 'atendente',
  }))

  return NextResponse.json(users)
}
