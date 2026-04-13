/**
 * Resolve variáveis do Supabase com suporte a múltiplos nomes.
 * Aceita tanto NEXT_PUBLIC_SUPABASE_URL quanto SUPABASE_URL, etc.
 * Isso garante compatibilidade mesmo que o .env da VPS não use o prefixo NEXT_PUBLIC_.
 */

export function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  if (!url) {
    throw new Error(
      '[Supabase] URL não configurada. Defina NEXT_PUBLIC_SUPABASE_URL no .env da VPS.'
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  if (!key) {
    throw new Error(
      '[Supabase] Anon key não configurada. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY no .env da VPS.'
    )
  }
  return key
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!key) {
    throw new Error(
      '[Supabase] Service role key não configurada. Defina SUPABASE_SERVICE_ROLE_KEY no .env da VPS.'
    )
  }
  return key
}
