import { adminClient } from './supabase/admin'

interface WebhookLogEntry {
  phone: string
  message_type: string
  message_preview: string | null
  status: 'success' | 'error' | 'blocked' | 'ignored'
  response_preview?: string | null
  error_message?: string | null
  duration_ms?: number | null
}

export async function logWebhookEvent(entry: WebhookLogEntry): Promise<void> {
  try {
    await adminClient.from('webhook_logs').insert({
      phone: entry.phone,
      message_type: entry.message_type,
      message_preview: entry.message_preview?.slice(0, 500) ?? null,
      status: entry.status,
      response_preview: entry.response_preview?.slice(0, 500) ?? null,
      error_message: entry.error_message?.slice(0, 1000) ?? null,
      duration_ms: entry.duration_ms ?? null,
    })
  } catch {
    // Logging must never crash the main flow
  }
}
