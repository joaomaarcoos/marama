import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Resolve URL e key com fallback para nomes sem prefixo NEXT_PUBLIC_.
function readEnv(name: string) {
  return process.env[name] || ''
}

function getSupabaseUrl() {
  return readEnv('SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL')
}

function getSupabaseAnonKey() {
  return readEnv('SUPABASE_ANON_KEY') || readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const publicApiPrefixes = ['/api/webhook', '/api/health']
const publicPagePaths = ['/login']
const protectedPaths = ['/dashboard', '/prompt', '/disparos', '/moodle', '/conversas', '/documentos', '/usuarios']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  const isPublicApi = publicApiPrefixes.some((path) => pathname.startsWith(path))
  const isPublicPage = publicPagePaths.includes(pathname)
  const isHomePage = pathname === '/'
  const isProtectedPage = protectedPaths.some((path) => pathname.startsWith(path))
  const isProtectedApiRoute = pathname.startsWith('/api/') && !isPublicApi

  // Rotas publicas nao devem depender do Supabase para responder.
  if (isPublicApi) {
    return supabaseResponse
  }

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY nao definidas')

    if (isProtectedApiRoute) {
      return NextResponse.json({ error: 'Servico de autenticacao indisponivel' }, { status: 503 })
    }

    if (isProtectedPage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isHomePage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value)
            })

            supabaseResponse = NextResponse.next({ request })

            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (isProtectedApiRoute && !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (isProtectedPage && !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isPublicPage && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (isHomePage) {
      return NextResponse.redirect(new URL(user ? '/dashboard' : '/login', request.url))
    }
  } catch (error) {
    console.error('[middleware] Falha ao validar sessao com o Supabase:', error)

    if (isProtectedApiRoute) {
      return NextResponse.json({ error: 'Servico de autenticacao indisponivel' }, { status: 503 })
    }

    if (isProtectedPage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isPublicPage) {
      return supabaseResponse
    }

    if (isHomePage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
