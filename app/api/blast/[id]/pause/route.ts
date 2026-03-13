import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await adminClient
    .from('blast_campaigns')
    .select('status')
    .eq('id', params.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const newStatus = campaign.status === 'paused' ? 'running' : 'paused'

  await adminClient
    .from('blast_campaigns')
    .update({ status: newStatus })
    .eq('id', params.id)

  return NextResponse.json({ status: newStatus })
}
