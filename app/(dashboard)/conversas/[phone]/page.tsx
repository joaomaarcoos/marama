import { createClient } from '@/lib/supabase/server'
import ChatInterface from '@/components/chat-interface'

export const revalidate = 0

export default async function ConversaPage({ params }: { params: { phone: string } }) {
  const phone = decodeURIComponent(params.phone)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const currentUser = user
    ? { id: user.id, email: user.email ?? '' }
    : null

  return <ChatInterface selectedPhone={phone} initialCurrentUser={currentUser} />
}
