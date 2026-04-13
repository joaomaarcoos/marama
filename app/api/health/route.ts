import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Rota de diagnóstico — mostra quais variáveis estão definidas (sem expor valores)
export async function GET() {
  const check = (name: string) => {
    const val = process.env[name]
    if (!val) return '❌ AUSENTE'
    return `✅ definida (${val.length} chars)`
  }

  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: check('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: check('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      SUPABASE_URL: check('SUPABASE_URL'),
      SUPABASE_ANON_KEY: check('SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: check('SUPABASE_SERVICE_ROLE_KEY'),
      OPENAI_API_KEY: check('OPENAI_API_KEY'),
      EVOLUTION_API_URL: check('EVOLUTION_API_URL'),
      EVOLUTION_API_KEY: check('EVOLUTION_API_KEY'),
    },
  })
}
