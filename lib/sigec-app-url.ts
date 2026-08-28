import 'server-only'

const CANONICAL_SIGEC_APP_URL = 'https://mara.joaodantasia.com.br'

export function getSigecAppUrl(): string | null {
  const configured = process.env.SIGEC_APP_URL?.trim()
  const candidate = configured || CANONICAL_SIGEC_APP_URL

  try {
    const url = new URL(candidate)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) return null
    if (url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}
