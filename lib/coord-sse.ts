// Gerencia clientes SSE para o módulo de conversas de coordenação

// Canal global (lista de conversas)
const coordSseClients = new Set<ReadableStreamDefaultController>()

export function addCoordSseClient(controller: ReadableStreamDefaultController) {
  coordSseClients.add(controller)
}

export function removeCoordSseClient(controller: ReadableStreamDefaultController) {
  coordSseClients.delete(controller)
}

export function notifyCoordSseClients() {
  const msg = `data: update\n\n`
  for (const ctrl of Array.from(coordSseClients)) {
    try {
      ctrl.enqueue(new TextEncoder().encode(msg))
    } catch {
      coordSseClients.delete(ctrl)
    }
  }
}

// Canal por telefone (mensagens de uma conversa específica)
const coordPhoneSseClients = new Map<string, Set<ReadableStreamDefaultController>>()

export function addCoordPhoneSseClient(phone: string, controller: ReadableStreamDefaultController) {
  if (!coordPhoneSseClients.has(phone)) coordPhoneSseClients.set(phone, new Set())
  coordPhoneSseClients.get(phone)!.add(controller)
}

export function removeCoordPhoneSseClient(phone: string, controller: ReadableStreamDefaultController) {
  coordPhoneSseClients.get(phone)?.delete(controller)
}

export function notifyCoordPhoneSseClients(phone: string) {
  const clients = coordPhoneSseClients.get(phone)
  if (!clients) return
  const msg = `data: update\n\n`
  for (const ctrl of Array.from(clients)) {
    try {
      ctrl.enqueue(new TextEncoder().encode(msg))
    } catch {
      clients.delete(ctrl)
    }
  }
}
