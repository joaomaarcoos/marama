import { createClient } from '@supabase/supabase-js'

// Cliente com service_role key — bypassa RLS
// NUNCA importar em arquivos do frontend (Client Components)
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
