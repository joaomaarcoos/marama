'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function markSystemNotification(notificationId: string, isRead: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autorizado' }

  const { error: systemError } = await adminClient
    .from('system_notifications')
    .update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null })
    .eq('id', notificationId)
    .eq('recipient_id', user.id)

  if (systemError) {
    const { error: taskError } = await adminClient
      .from('task_notifications')
      .update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null })
      .eq('id', notificationId)
      .eq('recipient_id', user.id)

    if (taskError) return { error: taskError.message }
  }

  revalidatePath('/')
  return { success: 'Notificacao atualizada.' }
}
