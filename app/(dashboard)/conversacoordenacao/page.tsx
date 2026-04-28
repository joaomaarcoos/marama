import { createClient } from '@/lib/supabase/server'
import CoordChatInterface from '@/components/coord-chat-interface'

export const dynamic = 'force-dynamic'

export default async function ConversaCoordenacaoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const currentUser = user ? { id: user.id, email: user.email ?? '' } : null
  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      <CoordChatInterface initialCurrentUser={currentUser} />
    </div>
  )
}
