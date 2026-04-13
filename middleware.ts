import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Suporte a nomes com e sem prefixo NEXT_PUBLIC_ (flexibilidade no .env da VPS)
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''

  // Se as vars não estiverem configuradas, deixa passar (vai falhar na página com erro legível)
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não definidas!')
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Webhook é público — Evolution API chama diretamente
  if (pathname.startsWith('/api/webhook')) {
    return supabaseResponse
  }

  // API routes protegidas (exceto webhook)
  if (pathname.startsWith('/api/') && !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Rotas protegidas
  const protectedPaths = ['/dashboard', '/prompt', '/disparos', '/moodle', '/conversas', '/documentos', '/usuarios']
  const isProtected = protectedPaths.some(path => pathname.startsWith(path))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirecionar usuário logado que tenta acessar /login
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
