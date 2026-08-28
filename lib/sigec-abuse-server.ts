import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { adminClient } from '@/lib/supabase/admin'

type RateLimitBucket = 'signup_ip' | 'signup_email' | 'signup_phone' | 'recovery_ip' | 'recovery_email' | 'whatsapp_ip' | 'whatsapp_user' | 'whatsapp_phone'

type RateLimitRule = {
  bucket: RateLimitBucket
  value: string
  limit: number
  windowSeconds: number
  blockSeconds: number
}

export type AbuseGateResult = {
  allowed: boolean
  retryAfterSeconds: number
  unavailable?: boolean
}

function normalizeIp(value: string | null) {
  if (!value) return 'unknown'
  return value.split(',')[0].trim().slice(0, 64) || 'unknown'
}

export async function getRequestIp() {
  const requestHeaders = await headers()
  return normalizeIp(
    requestHeaders.get('cf-connecting-ip')
      ?? requestHeaders.get('x-real-ip')
      ?? requestHeaders.get('x-forwarded-for'),
  )
}

function digestIdentifier(bucket: RateLimitBucket, value: string) {
  const secret = process.env.SIGEC_RATE_LIMIT_SECRET
  if (!secret || secret.length < 32) throw new Error('SIGEC_RATE_LIMIT_SECRET_NOT_CONFIGURED')
  return createHmac('sha256', secret).update(`${bucket}:${value}`).digest('hex')
}

async function consume(rule: RateLimitRule): Promise<AbuseGateResult> {
  let response
  try {
    response = await adminClient.rpc('sigec_consume_auth_rate_limit', {
      p_bucket: rule.bucket,
      p_key_digest: digestIdentifier(rule.bucket, rule.value),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
      p_block_seconds: rule.blockSeconds,
    })
  } catch (error) {
    console.error('[SIGEC abuse gate] rate limit request failed', {
      bucket: rule.bucket,
      name: error instanceof Error ? error.name : 'unknown',
    })
    return { allowed: false, retryAfterSeconds: 0, unavailable: true }
  }

  const { data, error } = response

  if (error || !Array.isArray(data) || data.length !== 1) {
    console.error('[SIGEC abuse gate] rate limit unavailable', { bucket: rule.bucket, code: error?.code })
    return { allowed: false, retryAfterSeconds: 0, unavailable: true }
  }

  return {
    allowed: data[0].allowed === true,
    retryAfterSeconds: Number(data[0].retry_after_seconds) || 0,
  }
}

async function consumeRules(rules: RateLimitRule[]): Promise<AbuseGateResult> {
  try {
    // Keep the calls deterministic in server actions. Each rule still uses the
    // atomic database function, while sequential execution makes failures
    // attributable to one bucket and avoids coupling concurrent RPC requests
    // to the same cached service-role client.
    const results: AbuseGateResult[] = []
    for (const rule of rules) {
      results.push(await consume(rule))
    }
    if (results.some((result) => result.unavailable)) {
      return { allowed: false, retryAfterSeconds: 0, unavailable: true }
    }
    return {
      allowed: results.every((result) => result.allowed),
      retryAfterSeconds: Math.max(...results.map((result) => result.retryAfterSeconds)),
    }
  } catch (error) {
    console.error('[SIGEC abuse gate] failed closed', { name: error instanceof Error ? error.name : 'unknown' })
    return { allowed: false, retryAfterSeconds: 0, unavailable: true }
  }
}

export async function consumeSignupLimits(email: string, phone: string) {
  const ip = await getRequestIp()
  return consumeRules([
    { bucket: 'signup_ip', value: ip, limit: 5, windowSeconds: 900, blockSeconds: 1800 },
    { bucket: 'signup_email', value: email, limit: 3, windowSeconds: 1800, blockSeconds: 3600 },
    { bucket: 'signup_phone', value: phone, limit: 3, windowSeconds: 1800, blockSeconds: 3600 },
  ])
}

export async function consumeRecoveryLimits(email: string) {
  const ip = await getRequestIp()
  return consumeRules([
    { bucket: 'recovery_ip', value: ip, limit: 5, windowSeconds: 900, blockSeconds: 1800 },
    { bucket: 'recovery_email', value: email, limit: 3, windowSeconds: 1800, blockSeconds: 3600 },
  ])
}

export async function consumeWhatsappLimits(userId: string, phone: string) {
  const ip = await getRequestIp()
  return consumeRules([
    { bucket: 'whatsapp_ip', value: ip, limit: 5, windowSeconds: 900, blockSeconds: 1800 },
    { bucket: 'whatsapp_user', value: userId, limit: 3, windowSeconds: 900, blockSeconds: 3600 },
    { bucket: 'whatsapp_phone', value: phone, limit: 3, windowSeconds: 900, blockSeconds: 3600 },
  ])
}

export async function getRequestIpDigest() {
  return digestIdentifier('whatsapp_ip', await getRequestIp())
}

export async function getConsentEvidenceDigests() {
  const requestHeaders = await headers()
  const secret = process.env.SIGEC_RATE_LIMIT_SECRET
  if (!secret || secret.length < 32) throw new Error('SIGEC_RATE_LIMIT_SECRET_NOT_CONFIGURED')
  const ip = await getRequestIp()
  const userAgent = (requestHeaders.get('user-agent') ?? 'unknown').slice(0, 1024)
  return {
    ipHash: createHmac('sha256', secret).update(`consent_ip:${ip}`).digest('hex'),
    userAgentHash: createHmac('sha256', secret).update(`consent_user_agent:${userAgent}`).digest('hex'),
  }
}

export async function issueCandidateSignupNonce() {
  const nonce = randomBytes(32).toString('hex')
  const nonceDigest = createHash('sha256').update(nonce).digest('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000)

  await adminClient.from('sigec_candidate_signup_nonces').delete().lt('expires_at', now.toISOString())
  const { error } = await adminClient.from('sigec_candidate_signup_nonces').insert({
    nonce_digest: nonceDigest,
    expires_at: expiresAt.toISOString(),
  })
  if (error) {
    console.error('[SIGEC abuse gate] signup proof unavailable', { code: error.code })
    return null
  }
  return nonce
}
