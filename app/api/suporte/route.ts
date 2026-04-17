import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { createTicket } from '@/lib/ticket'

export const dynamic = 'force-dynamic'

// GET /api/suporte — lista tickets com filtros e paginação
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') // null = todos
  const search = searchParams.get('search')?.trim()
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const pageSize = 50

  let query = getAdminClient()
    .from('support_tickets')
    .select('*, students(full_name)', { count: 'exact' })
    .order('opened_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (status && status !== 'todos') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `protocol.ilike.%${search}%,phone.ilike.%${search}%,subject.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [], total: count ?? 0, page, pageSize })
}

// POST /api/suporte — cria ticket manualmente
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { phone?: string; subject?: string; description?: string; student_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const phone = body.phone?.trim()
  const subject = body.subject?.trim()

  if (!phone || !subject) {
    return NextResponse.json({ error: 'phone e subject são obrigatórios' }, { status: 400 })
  }

  try {
    const ticket = await createTicket({
      phone,
      subject,
      description: body.description?.trim() || null,
      student_id: body.student_id || null,
    })
    return NextResponse.json({ ticket }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
