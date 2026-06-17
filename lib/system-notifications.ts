import { adminClient } from '@/lib/supabase/admin'

export interface CreateSystemNotificationInput {
  recipientId: string
  module: string
  type: string
  title: string
  message?: string | null
  href?: string | null
  metadata?: Record<string, unknown>
}

export async function createSystemNotification(input: CreateSystemNotificationInput) {
  return adminClient.from('system_notifications').insert({
    recipient_id: input.recipientId,
    module: input.module,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
  })
}

export async function createSystemNotifications(inputs: CreateSystemNotificationInput[]) {
  if (inputs.length === 0) return { error: null }

  return adminClient.from('system_notifications').insert(
    inputs.map((input) => ({
      recipient_id: input.recipientId,
      module: input.module,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      href: input.href ?? null,
      metadata: input.metadata ?? {},
    }))
  )
}
