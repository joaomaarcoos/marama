const BASE_URL = process.env.EVOLUTION_API_URL!
const API_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

const headers = {
  'Content-Type': 'application/json',
  'apikey': API_KEY,
}

export async function sendText(phone: string, text: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers,
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
  mediatype: 'image' | 'audio' | 'document',
  caption?: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/message/sendMedia/${INSTANCE}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: phone,
      mediatype,
      media: mediaUrl,
      caption: caption ?? '',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API sendMedia error: ${res.status} ${body}`)
  }
}

export async function downloadMedia(messageId: string): Promise<{ base64: string; mimetype: string }> {
  const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`, {
    method: 'POST',
    headers,
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

export async function getInstanceStatus(): Promise<{ state: string; instanceName?: string; profileName?: string; profilePicUrl?: string }> {
  const res = await fetch(`${BASE_URL}/instance/connectionState/${INSTANCE}`, {
    headers,
  })

  if (!res.ok) return { state: 'unknown' }

  const data = await res.json()
  return {
    state: data.instance?.state ?? 'unknown',
    instanceName: INSTANCE,
    profileName: data.instance?.profileName,
    profilePicUrl: data.instance?.profilePicUrl,
  }
}

export async function getQrCode(): Promise<{ qrcode?: string; pairingCode?: string; state: string }> {
  const res = await fetch(`${BASE_URL}/instance/connect/${INSTANCE}`, {
    headers,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API connect error: ${res.status} ${body}`)
  }

  const data = await res.json()
  // Response can have: { base64, code, count, pairingCode } or { state: 'open' }
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
  const res = await fetch(`${BASE_URL}/instance/logout/${INSTANCE}`, {
    method: 'DELETE',
    headers,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API logout error: ${res.status} ${body}`)
  }
}
