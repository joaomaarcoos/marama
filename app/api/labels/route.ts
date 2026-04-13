import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { data } = await adminClient
    .from('labels')
    .select('*')
    .order('created_at', { ascending: true })

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const { name, color } = await request.json() as { name?: string; color?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('labels')
    .insert({ name: name.trim(), color: color ?? '#22c55e' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
