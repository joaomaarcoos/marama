import { adminClient } from './supabase/admin'
import { sendText } from './evolution'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Replace {nome}, {telefone}, {curso} and any {custom} with contact data
function interpolate(
  template: string,
  contact: { phone: string; name?: string | null; variables?: Record<string, string> | null }
): string {
  const vars = contact.variables ?? {}
  return template
    .replace(/\{nome\}/gi, contact.name ?? '')
    .replace(/\{telefone\}/gi, contact.phone)
    .replace(/\{curso\}/gi, vars['curso'] ?? vars['course'] ?? '')
    .replace(/\{(\w+)\}/g, (match, key) => vars[key.toLowerCase()] ?? match)
}

// Randomly pick message or one of its variations
function pickMessage(campaign: { message: string; variations?: string[] | null }): string {
  const pool = [
    campaign.message,
    ...((Array.isArray(campaign.variations) ? campaign.variations : []).filter(Boolean)),
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function runBlastCampaign(campaignId: string): Promise<void> {
  const { data: campaign } = await adminClient
    .from('blast_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada`)

  await adminClient
    .from('blast_campaigns')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', campaignId)

  const batchSize: number = campaign.batch_size ?? 10
  const batchDelaySec: number = campaign.batch_delay_seconds ?? 30
  let sentInBatch = 0

  while (true) {
    // Check if campaign is still running
    const { data: current } = await adminClient
      .from('blast_campaigns')
      .select('status')
      .eq('id', campaignId)
      .single()

    if (current?.status !== 'running') break

    // Get next pending contact
    const { data: contact } = await adminClient
      .from('blast_contacts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(1)
      .single()

    if (!contact) {
      await adminClient
        .from('blast_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', campaignId)
      break
    }

    // Build final message: pick variation then interpolate variables
    const template = pickMessage(campaign)
    const finalMessage = interpolate(template, contact)

    try {
      await sendText(contact.phone, finalMessage)

      await adminClient
        .from('blast_contacts')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', contact.id)

      await adminClient.rpc('increment_blast_sent', { campaign_id: campaignId })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Erro desconhecido'

      await adminClient
        .from('blast_contacts')
        .update({ status: 'failed', error_msg: errMsg })
        .eq('id', contact.id)

      await adminClient.rpc('increment_blast_failed', { campaign_id: campaignId })
    }

    sentInBatch++

    // Per-message delay
    await sleep(campaign.delay_seconds * 1000)

    // Batch pause after every batchSize messages
    if (sentInBatch >= batchSize) {
      sentInBatch = 0
      console.log(`[Blast ${campaignId}] Batch complete. Pausing ${batchDelaySec}s...`)
      await sleep(batchDelaySec * 1000)
    }
  }
}
