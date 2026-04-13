import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseServiceRoleKey } from './env'

// Cliente com service_role key — bypassa RLS
// NUNCA importar em arquivos do frontend (Client Components)
let cachedAdminClient: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(
      getSupabaseUrl(),
      getSupabaseServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  return cachedAdminClient
}

export const adminClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getAdminClient() as unknown as Record<PropertyKey, unknown>
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
