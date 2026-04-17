import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/conversas/[phone]/notes — lista notas da conversa
export async function GET(
  _req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const phone = decodeURIComponent(params.phone)

  const { data, error } = await getAdminClient()
    .from('conv_notes')
    .select('id, phone, user_id, user_email, user_name, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

// POST /api/conversas/[phone]/notes — cria nova nota
export async function POST(
  req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const phone = decodeURIComponent(params.phone)

  let content = ''
  try {
    const body = await req.json() as { content?: string }
    content = body.content?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!content) return NextResponse.json({ error: 'Nota vazia' }, { status: 400 })

  const userName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    'Atendente'

  const { data: note, error } = await getAdminClient()
    .from('conv_notes')
    .insert({
      phone,
      user_id: user.id,
      user_email: user.email ?? '',
      user_name: userName,
      content,
    })
    .select('id, phone, user_id, user_email, user_name, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note })
}
