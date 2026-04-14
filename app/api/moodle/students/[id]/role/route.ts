import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { syncContactsSnapshot } from '@/lib/contacts'

// PATCH /api/moodle/students/[id]/role — toggle student role between 'aluno' and 'gestor'
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const role = body.role as string

  if (!['aluno', 'gestor'].includes(role)) {
    return NextResponse.json({ error: 'Role inválido. Use "aluno" ou "gestor".' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('students')
    .update({ role })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncContactsSnapshot()

  return NextResponse.json({ success: true, role })
}
