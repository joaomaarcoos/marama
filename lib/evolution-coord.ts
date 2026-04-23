// Cliente Evolution API para a instância de coordenação (maracoordenacao)
// Sem automação — apenas envio/recebimento manual

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function getCoordConfig() {
  return {
    baseUrl: getRequiredEnv('EVOLUTION_API_URL'),
    apiKey: getRequiredEnv('EVOLUTION_API_KEY'),
    instance: process.env.EVOLUTION_COORD_INSTANCE_NAME ?? 'maracoordenacao',
  }
}

function getHeaders() {
  const { apiKey } = getCoordConfig()
  return {
    'Content-Type': 'application/json',
    apikey: apiKey,
  }
}

export async function coordSendText(phone: string, text: string): Promise<string | null> {
  const { baseUrl, instance } = getCoordConfig()
  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ number: phone, text }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution coordSendText error: ${res.status} ${body}`)
  }

  try {
    const data = await res.json() as { key?: { id?: string } }
    return data.key?.id ?? null
  } catch {
    return null
  }
}

export async function coordSendMedia(
  phone: string,
  mediaUrl: string,
  mediatype: 'image' | 'audio' | 'document',
  caption?: string,
  fileName?: string
): Promise<void> {
  const { baseUrl, instance } = getCoordConfig()
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
    const b = await res.text()
    throw new Error(`Evolution coordSendMedia error: ${res.status} ${b}`)
  }
}

export async function coordGetInstanceStatus(): Promise<{
  state: string
  exists: boolean
  instanceName: string
  profileName?: string
  profilePicUrl?: string
}> {
  const { baseUrl, instance } = getCoordConfig()
  const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    headers: getHeaders(),
  })

  const instanceName = instance

  if (!res.ok) {
    return { state: 'unknown', exists: res.status !== 404, instanceName }
  }

  const data = await res.json()
  return {
    state: data.instance?.state ?? 'unknown',
    exists: true,
    instanceName,
    profileName: data.instance?.profileName,
    profilePicUrl: data.instance?.profilePicUrl,
  }
}
