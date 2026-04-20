import { getConversationPhoneCandidates } from './mara-pause'

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

function getEvolutionConfig() {
  return {
    baseUrl: getRequiredEnv('EVOLUTION_API_URL'),
    apiKey: getRequiredEnv('EVOLUTION_API_KEY'),
    instance: getRequiredEnv('EVOLUTION_INSTANCE_NAME'),
  }
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: getEvolutionConfig().apiKey,
  }
}

function normalizePhoneFromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/[^0-9]/g, '')
}

type OutboundMediaType = 'image' | 'audio' | 'document'

interface RecentSystemOutboundEntry {
  fingerprint: string
  expiresAt: number
}

const SYSTEM_OUTBOUND_TTL_MS = 45_000
const recentSystemOutbounds = new Map<string, RecentSystemOutboundEntry[]>()

function normalizeOutboundFingerprint(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function createOutboundFingerprint(input: {
  text?: string | null
  mediaType?: OutboundMediaType | null
  caption?: string | null
}): string {
  const textFingerprint = normalizeOutboundFingerprint(input.text)
  if (textFingerprint) return textFingerprint

  const captionFingerprint = normalizeOutboundFingerprint(input.caption)
  if (captionFingerprint) return captionFingerprint

  if (input.mediaType) return `[${input.mediaType}]`
  return '[sem-conteudo]'
}

function pruneRecentSystemOutbounds(now: number) {
  for (const [phone, entries] of Array.from(recentSystemOutbounds.entries())) {
    const validEntries = entries.filter((entry: RecentSystemOutboundEntry) => entry.expiresAt > now)
    if (validEntries.length === 0) recentSystemOutbounds.delete(phone)
    else recentSystemOutbounds.set(phone, validEntries)
  }
}

function rememberRecentSystemOutbound(phone: string, fingerprint: string) {
  const now = Date.now()
  pruneRecentSystemOutbounds(now)

  for (const candidate of getConversationPhoneCandidates(phone)) {
    const entries = recentSystemOutbounds.get(candidate) ?? []
    entries.push({ fingerprint, expiresAt: now + SYSTEM_OUTBOUND_TTL_MS })
    recentSystemOutbounds.set(candidate, entries)
  }
}

export function consumeRecentSystemOutbound(phone: string, fingerprint: string): boolean {
  const now = Date.now()
  pruneRecentSystemOutbounds(now)

  for (const candidate of getConversationPhoneCandidates(phone)) {
    const entries = recentSystemOutbounds.get(candidate) ?? []
    const matchIndex = entries.findIndex((entry) => entry.fingerprint === fingerprint)
    if (matchIndex === -1) continue

    entries.splice(matchIndex, 1)
    if (entries.length === 0) recentSystemOutbounds.delete(candidate)
    else recentSystemOutbounds.set(candidate, entries)
    return true
  }

  return false
}

function getWebhookUrl() {
  const appUrl = getRequiredEnv('NEXT_PUBLIC_APP_URL')
  const url = new URL('/api/webhook/evolution', appUrl)
  const secret = process.env.WEBHOOK_SECRET

  if (secret) {
    url.searchParams.set('secret', secret)
  }

  return url.toString()
}

async function parseEvolutionError(res: Response, fallback: string) {
  const raw = await res.text()

  try {
    const data = JSON.parse(raw) as { message?: string; response?: { message?: string } }
    return data.response?.message ?? data.message ?? raw ?? fallback
  } catch {
    return raw || fallback
  }
}

export async function configureWebhook(): Promise<void> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      enabled: true,
      url: getWebhookUrl(),
      webhookByEvents: false,
      webhookBase64: true,
      events: ['MESSAGES_UPSERT'],
    }),
  })

  if (!res.ok) {
    const message = await parseEvolutionError(res, 'Erro ao configurar webhook')
    throw new Error(`Evolution API configureWebhook error: ${res.status} ${message}`)
  }
}

export async function createInstance(): Promise<{ instanceName: string; alreadyExists: boolean }> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/create`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
      webhook: {
        url: getWebhookUrl(),
        byEvents: false,
        base64: true,
        events: ['MESSAGES_UPSERT'],
      },
    }),
  })

  if (!res.ok) {
    const message = await parseEvolutionError(res, 'Erro ao criar instancia')
    const normalized = message.toLowerCase()

    if (res.status === 409 || normalized.includes('already') || normalized.includes('exists')) {
      await configureWebhook()
      return { instanceName: instance, alreadyExists: true }
    }

    throw new Error(`Evolution API createInstance error: ${res.status} ${message}`)
  }

  await configureWebhook()
  return { instanceName: instance, alreadyExists: false }
}

export async function sendText(phone: string, text: string): Promise<void> {
  rememberRecentSystemOutbound(phone, createOutboundFingerprint({ text }))

  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      number: phone,
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API sendText error: ${res.status} ${body}`)
  }
}

export async function sendMedia(
  phone: string,
  mediaUrl: string,
  mediatype: OutboundMediaType,
  caption?: string,
  fileName?: string
): Promise<void> {
  rememberRecentSystemOutbound(phone, createOutboundFingerprint({ mediaType: mediatype, caption }))

  const { baseUrl, instance } = getEvolutionConfig()
  const body: Record<string, string> = {
    number: phone,
    mediatype,
    media: mediaUrl,
    caption: caption ?? '',
  }
  if (fileName) body.fileName = fileName

  const res = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API sendMedia error: ${res.status} ${body}`)
  }
}

export async function downloadMedia(messageId: string): Promise<{ base64: string; mimetype: string }> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ message: { key: { id: messageId } } }),
  })

  if (!res.ok) {
    throw new Error(`Evolution API downloadMedia error: ${res.status}`)
  }

  const data = await res.json()
  return {
    base64: data.base64,
    mimetype: data.mimetype ?? 'application/octet-stream',
  }
}

export async function getInstanceStatus(): Promise<{
  state: string
  exists: boolean
  instanceName?: string
  profileName?: string
  profilePicUrl?: string
}> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    headers: getHeaders(),
  })

  if (!res.ok) {
    if (res.status === 404) {
      return { state: 'unknown', exists: false, instanceName: instance }
    }

    return { state: 'unknown', exists: true, instanceName: instance }
  }

  const data = await res.json()
  return {
    state: data.instance?.state ?? 'unknown',
    exists: true,
    instanceName: instance,
    profileName: data.instance?.profileName,
    profilePicUrl: data.instance?.profilePicUrl,
  }
}

export async function getQrCode(): Promise<{ qrcode?: string; pairingCode?: string; state: string }> {
  await configureWebhook()

  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/connect/${instance}`, {
    headers: getHeaders(),
  })

  if (!res.ok) {
    const body = await parseEvolutionError(res, 'Erro ao obter QR code')
    throw new Error(`Evolution API connect error: ${res.status} ${body}`)
  }

  const data = await res.json()
  if (data.instance?.state === 'open' || data.state === 'open') {
    return { state: 'open' }
  }

  return {
    qrcode: data.base64 ?? data.qrcode?.base64,
    pairingCode: data.pairingCode,
    state: data.state ?? 'connecting',
  }
}

export async function disconnectInstance(): Promise<void> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/logout/${instance}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API logout error: ${res.status} ${body}`)
  }
}

export interface EvolutionChatContact {
  remoteJid: string
  phone: string
  pushName: string | null
  profilePicUrl: string | null
  updatedAt: string | null
}

/**
 * Given an @lid JID, tries to resolve it to a real @s.whatsapp.net JID.
 * Evolution API may expose the real JID via contact info endpoints.
 * Returns the normalized phone string (e.g. "5598987654321") or null if not found.
 */
export async function resolveJidByLid(lidJid: string): Promise<string | null> {
  const { baseUrl, instance } = getEvolutionConfig()
  try {
    // Try the contact info endpoint which may return the real JID
    const res = await fetch(`${baseUrl}/chat/findContacts/${instance}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ remoteJid: lidJid }),
    })
    if (!res.ok) return null
    const data = await res.json() as unknown
    const contacts = Array.isArray(data) ? data : (data ? [data] : [])
    for (const contact of contacts as Array<{ remoteJid?: string; jid?: string }>) {
      const jid = contact.remoteJid ?? contact.jid ?? ''
      if (jid && !jid.endsWith('@lid') && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'))) {
        return normalizePhoneFromJid(jid)
      }
    }
    return null
  } catch {
    return null
  }
}

export async function findChats(): Promise<EvolutionChatContact[]> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/chat/findChats/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    // Erros de disponibilidade (5xx, gateway, timeout) não devem derrubar a conversa
    if (res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504) {
      console.warn(`[findChats] Evolution API indisponivel (${res.status}) — continuando sem dados de chat`)
      return []
    }

    const message = await parseEvolutionError(res, 'Erro ao buscar chats')
    const normalized = message.toLowerCase()

    if (
      res.status === 404 ||
      normalized.includes('instance does not exist') ||
      normalized.includes('instance not found') ||
      normalized.includes('does not exist')
    ) {
      return []
    }

    throw new Error(`Evolution API findChats error: ${res.status} ${message}`)
  }

  const data = await res.json() as Array<{
    remoteJid: string
    pushName?: string | null
    profilePicUrl?: string | null
    updatedAt?: string | null
  }>

  return (Array.isArray(data) ? data : []).map((chat) => ({
    remoteJid: chat.remoteJid,
    phone: normalizePhoneFromJid(chat.remoteJid),
    pushName: chat.pushName ?? null,
    profilePicUrl: chat.profilePicUrl ?? null,
    updatedAt: chat.updatedAt ?? null,
  }))
}
