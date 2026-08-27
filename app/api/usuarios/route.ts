import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiUser(['admin', 'gerente'])
  if (!auth.ok) return auth.response

  const { data, error } = await getAdminClient().auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: 'Nao foi possivel listar usuarios.' }, { status: 500 })

  const users = (data?.users ?? [])
    .filter((user) => user.app_metadata?.role !== 'candidato')
    .map((user) => ({
      id: user.id,
      email: user.email ?? '',
      name: (user.user_metadata?.full_name as string | undefined)?.trim() || (user.email ?? ''),
      role: extractRole(user),
    }))

  return NextResponse.json(users)
}
