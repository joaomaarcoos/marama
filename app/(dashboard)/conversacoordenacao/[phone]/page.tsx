import { createClient } from '@/lib/supabase/server'
import CoordChatInterface from '@/components/coord-chat-interface'

export const dynamic = 'force-dynamic'

export default async function ConversaCoordenacaoPhonePage({
  params,
}: {
  params: { phone: string }
}) {
  const phone = decodeURIComponent(params.phone)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const currentUser = user ? { id: user.id, email: user.email ?? '' } : null
  return <CoordChatInterface selectedPhone={phone} initialCurrentUser={currentUser} />
}
