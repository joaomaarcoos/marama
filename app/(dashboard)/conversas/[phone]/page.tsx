import ChatInterface from '@/components/chat-interface'

export const revalidate = 0

export default async function ConversaPage({ params }: { params: { phone: string } }) {
  const phone = decodeURIComponent(params.phone)
  return <ChatInterface selectedPhone={phone} />
}
