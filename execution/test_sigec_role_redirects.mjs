/** Live HTTP test for SIGEC role redirects and API boundaries.
 *
 * Requires a built app running at SIGEC_TEST_BASE_URL (defaults to port 3115).
 * Synthetic users are removed even when an assertion fails.
 */

import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

function loadEnv() {
  const values = {}
  for (const raw of readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

const env = loadEnv()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = process.env.SIGEC_TEST_BASE_URL || 'http://127.0.0.1:3115'
if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Supabase test environment is incomplete')

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const createdUsers = []
const checks = []

function assert(condition, name, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`)
  checks.push(name)
}

async function createActor(role) {
  const marker = randomBytes(8).toString('hex')
  const email = `sigec-test-redirect-${role || 'no-role'}-${marker}@example.invalid`
  const password = `Redirect!${randomBytes(18).toString('base64url')}8z`
  const attributes = { email, password, email_confirm: true }
  if (role) attributes.app_metadata = { role }
  const { data, error } = await admin.auth.admin.createUser(attributes)
  if (error || !data.user) throw new Error(`create_${role || 'no-role'}: ${error?.code || 'missing_user'}`)
  createdUsers.push(data.user.id)

  const jar = new Map()
  const sessionClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`link_${role || 'no-role'}: ${linkError?.code || 'missing_token'}`)
  }
  const { error: loginError } = await sessionClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (loginError) throw new Error(`login_${role || 'no-role'}: ${loginError.code}`)
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function request(path, cookie = '', init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  })
}

function locationPath(response) {
  const location = response.headers.get('location')
  return location ? new URL(location, baseUrl).pathname : ''
}

try {
  const candidate = await createActor('candidato')
  const adminCookie = await createActor('admin')
  const manager = await createActor('gerente')
  const attendant = await createActor('atendente')
  const noRole = await createActor(null)

  let response = await request('/minha-area')
  assert(response.status === 307 && locationPath(response) === '/login', 'anonymous_candidate_area_redirect')

  response = await request('/login', candidate)
  assert(response.status === 307 && locationPath(response) === '/minha-area', 'candidate_login_redirect')
  response = await request('/dashboard', candidate)
  assert(response.status === 307 && locationPath(response) === '/minha-area', 'candidate_internal_page_redirect')
  response = await request('/api/usuarios', candidate)
  assert(response.status === 403, 'candidate_internal_api_denied')
  response = await request('/api/sigec/candidate-documents', candidate, { method: 'POST', body: new FormData() })
  assert(response.status === 400, 'candidate_document_api_reaches_route_guard', `HTTP ${response.status}`)
  response = await request('/api/sigec/candidate-documents', candidate, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert(response.status === 400, 'candidate_document_remove_api_reaches_route_guard', `HTTP ${response.status}`)
  response = await request('/api/sigec/document-scan', candidate, { method: 'POST' })
  assert(response.status === 403, 'candidate_document_rescan_stays_denied')

  response = await request('/minha-area', adminCookie)
  assert(response.status === 307 && locationPath(response) === '/dashboard', 'admin_candidate_area_redirect')
  response = await request('/api/candidato/teste-inexistente', adminCookie)
  assert(response.status === 403, 'internal_candidate_api_denied')
  response = await request('/api/sigec/candidate-documents', adminCookie, { method: 'POST' })
  assert(response.status === 403, 'internal_candidate_document_api_denied')
  response = await request('/api/sigec/candidate-documents', adminCookie, { method: 'DELETE' })
  assert(response.status === 403, 'internal_candidate_document_remove_api_denied')

  response = await request('/sigec-processos', manager)
  assert(response.status === 200, 'manager_sigec_access')
  response = await request('/sigec-candidaturas', manager)
  assert(response.status === 200, 'manager_sigec_applications_access')
  response = await request('/sigec-candidaturas', adminCookie)
  assert(response.status === 200, 'admin_sigec_applications_access')
  response = await request('/sigec-processos', attendant)
  assert(response.status === 307 && locationPath(response) === '/dashboard', 'attendant_sigec_redirect')
  response = await request('/sigec-candidaturas', attendant)
  assert(response.status === 307 && locationPath(response) === '/dashboard', 'attendant_sigec_applications_redirect')
  response = await request('/sigec-candidaturas', candidate)
  assert(response.status === 307 && locationPath(response) === '/minha-area', 'candidate_sigec_applications_redirect')
  response = await request('/sigec-candidaturas')
  assert(response.status === 307 && locationPath(response) === '/login', 'anonymous_sigec_applications_redirect')
  response = await request('/dashboard', noRole)
  assert(response.status === 307 && locationPath(response) === '/acesso-negado', 'no_role_fails_closed')

  response = await request('/api/usuarios')
  assert(response.status === 401, 'anonymous_protected_api_denied')
} finally {
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
}

console.log(JSON.stringify({ ok: true, checks: checks.length, fixturesCleaned: true }, null, 2))
