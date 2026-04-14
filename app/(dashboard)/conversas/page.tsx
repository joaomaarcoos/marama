import { createClient } from '@/lib/supabase/server'
import ChatInterface from '@/components/chat-interface'

export const revalidate = 0

export default async function ConversasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const currentUser = user
    ? { id: user.id, email: user.email ?? '' }
    : null

  return <ChatInterface initialCurrentUser={currentUser} />
}
