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

export async function sendText(phone: string, text: string): Promise<void> {
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
  mediatype: 'image' | 'audio' | 'document',
  caption?: string
): Promise<void> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
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

export async function getInstanceStatus(): Promise<{ state: string; instanceName?: string; profileName?: string; profilePicUrl?: string }> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    headers: getHeaders(),
  })

  if (!res.ok) return { state: 'unknown' }

  const data = await res.json()
  return {
    state: data.instance?.state ?? 'unknown',
    instanceName: instance,
    profileName: data.instance?.profileName,
    profilePicUrl: data.instance?.profilePicUrl,
  }
}

export async function getQrCode(): Promise<{ qrcode?: string; pairingCode?: string; state: string }> {
  const { baseUrl, instance } = getEvolutionConfig()
  const res = await fetch(`${baseUrl}/instance/connect/${instance}`, {
    headers: getHeaders(),
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
