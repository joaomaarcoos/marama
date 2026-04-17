import CoordChatInterface from '@/components/coord-chat-interface'

export const dynamic = 'force-dynamic'

export default async function ConversaCoordenacaoPhonePage({
  params,
}: {
  params: { phone: string }
}) {
  const phone = decodeURIComponent(params.phone)
  return <CoordChatInterface selectedPhone={phone} />
}
