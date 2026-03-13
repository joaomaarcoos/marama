import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await supabase
    .from('blast_campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(campaign)
}
