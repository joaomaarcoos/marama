import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { requireApiUser } from '@/lib/api-auth'

// PATCH /api/documentos/[id] — rename a document
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser(['admin', 'gerente'])
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 })

  const { error } = await adminClient
    .from('documents')
    .update({ name })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, name })
}

// DELETE /api/documentos/[id] — delete a document and its chunks (cascade)
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser(['admin', 'gerente'])
  if (!auth.ok) return auth.response

  const { error } = await adminClient
    .from('documents')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
