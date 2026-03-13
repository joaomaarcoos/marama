import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { runBlastCampaign } from '@/lib/blast-processor'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    name,
    message,
    contacts,
    delaySeconds = 3,
    variations = [],
    batchSize = 10,
    batchDelaySeconds = 30,
  } = await request.json()

  if (!name || !message || !contacts?.length) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  // Criar campanha
  const { data: campaign, error } = await adminClient
    .from('blast_campaigns')
    .insert({
      name,
      message,
      delay_seconds: delaySeconds,
      total_contacts: contacts.length,
      status: 'draft',
      created_by: user.id,
      variations: variations.filter((v: string) => v.trim()),
      batch_size: batchSize,
      batch_delay_seconds: batchDelaySeconds,
    })
    .select()
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Erro ao criar campanha' }, { status: 500 })
  }

  // Inserir contatos com variáveis extras
  const contactRows = contacts.map((c: { phone: string; name?: string; variables?: Record<string, string> }) => ({
    campaign_id: campaign.id,
    phone: c.phone,
    name: c.name ?? null,
    status: 'pending',
    variables: c.variables ?? {},
  }))

  await adminClient.from('blast_contacts').insert(contactRows)

  // Iniciar processamento em background
  setImmediate(() => {
    runBlastCampaign(campaign.id).catch(err =>
      console.error('[Blast] Erro na campanha:', err)
    )
  })

  return NextResponse.json({ campaignId: campaign.id })
}
