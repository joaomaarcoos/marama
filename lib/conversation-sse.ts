const conversationClients = new Set<ReadableStreamDefaultController>()
const conversationPhoneClients = new Map<string, Set<ReadableStreamDefaultController>>()
const updateEvent = new TextEncoder().encode('data: update\n\n')

export function addConversationClient(controller: ReadableStreamDefaultController) {
  conversationClients.add(controller)
}

export function removeConversationClient(controller: ReadableStreamDefaultController) {
  conversationClients.delete(controller)
}

export function addConversationPhoneClient(
  phone: string,
  controller: ReadableStreamDefaultController
) {
  if (!conversationPhoneClients.has(phone)) {
    conversationPhoneClients.set(phone, new Set())
  }
  conversationPhoneClients.get(phone)!.add(controller)
}

export function removeConversationPhoneClient(
  phone: string,
  controller: ReadableStreamDefaultController
) {
  const clients = conversationPhoneClients.get(phone)
  clients?.delete(controller)
  if (clients?.size === 0) conversationPhoneClients.delete(phone)
}

function notify(clients: Set<ReadableStreamDefaultController> | undefined) {
  if (!clients) return

  for (const controller of Array.from(clients)) {
    try {
      controller.enqueue(updateEvent)
    } catch {
      clients.delete(controller)
    }
  }
}

export function notifyConversationClients(phone?: string) {
  notify(conversationClients)
  if (phone) notify(conversationPhoneClients.get(phone))
}
