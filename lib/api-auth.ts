import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractRole, type UserRole } from '@/lib/roles'

export async function requireApiUser(allowedRoles?: UserRole[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }),
      user: null,
      role: null,
    }
  }

  const role = extractRole(user)

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }),
      user,
      role,
    }
  }

  return {
    ok: true as const,
    response: null,
    user,
    role,
  }
}
