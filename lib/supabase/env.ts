/**
 * Resolve variáveis do Supabase com suporte a múltiplos nomes.
 * Aceita tanto NEXT_PUBLIC_SUPABASE_URL quanto SUPABASE_URL, etc.
 * Isso garante compatibilidade mesmo que o .env da VPS não use o prefixo NEXT_PUBLIC_.
 */

function readEnv(name: string): string {
  return process.env[name] || ''
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(
    readEnv('SUPABASE_URL') ||
    readEnv('NEXT_PUBLIC_SUPABASE_URL')
  ) && Boolean(
    readEnv('SUPABASE_ANON_KEY') ||
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
}

export function getSupabaseUrl(): string {
  const url =
    readEnv('SUPABASE_URL') ||
    readEnv('NEXT_PUBLIC_SUPABASE_URL')
  if (!url) {
    throw new Error(
      '[Supabase] URL não configurada. Defina NEXT_PUBLIC_SUPABASE_URL no .env da VPS.'
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key =
    readEnv('SUPABASE_ANON_KEY') ||
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!key) {
    throw new Error(
      '[Supabase] Anon key não configurada. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY no .env da VPS.'
    )
  }
  return key
}

export function getSupabaseServiceRoleKey(): string {
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    throw new Error(
      '[Supabase] Service role key não configurada. Defina SUPABASE_SERVICE_ROLE_KEY no .env da VPS.'
    )
  }
  return key
}
