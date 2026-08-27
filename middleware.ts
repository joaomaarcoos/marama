import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, extractRole, isInternalRole, roleHome } from '@/lib/roles'

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
const candidateApiPrefixes = ['/api/candidato']
const publicPagePrefixes = ['/processos', '/cadastro-candidato', '/acesso-negado']
const authEntryPaths = ['/login', '/cadastro-candidato']
const internalPagePrefixes = [
  '/dashboard', '/prompt', '/disparos', '/conversas',
  '/documentos', '/usuarios', '/relatorios', '/contatos', '/logs',
  '/conexao', '/tutores', '/alunos', '/configuracoes',
  '/suporte', '/tarefas', '/sigec-processos',
]
const candidatePagePrefixes = ['/minha-area']

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  const isPublicApi = publicApiPrefixes.some((path) => matchesPathPrefix(pathname, path))
  const isCandidateApi = candidateApiPrefixes.some((path) => matchesPathPrefix(pathname, path))
  const isPublicPage = pathname === '/login' || publicPagePrefixes.some((path) => matchesPathPrefix(pathname, path))
  const isAuthEntryPage = authEntryPaths.includes(pathname)
  const isHomePage = pathname === '/'
  const isInternalPage = internalPagePrefixes.some((path) => matchesPathPrefix(pathname, path))
  const isCandidatePage = candidatePagePrefixes.some((path) => matchesPathPrefix(pathname, path))
  const isProtectedPage = isInternalPage || isCandidatePage
  const isProtectedApiRoute = pathname.startsWith('/api/') && !isPublicApi

  if (isPublicApi) return supabaseResponse

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Variaveis publicas do Supabase nao definidas')

    if (isProtectedApiRoute) {
      return NextResponse.json({ error: 'Servico de autenticacao indisponivel' }, { status: 503 })
    }
    if (isProtectedPage || isHomePage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const role = extractRole(user)

    if (isProtectedApiRoute && !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }
    if (isProtectedPage && !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Defesa central para APIs. Cada rota continua responsavel por validar
    // operacao e propriedade do recurso, mas candidatos nao alcancam APIs internas.
    if (isProtectedApiRoute && user) {
      if (role === 'sem_acesso') {
        return NextResponse.json({ error: 'Conta sem permissao de acesso' }, { status: 403 })
      }
      if (role === 'candidato' && !isCandidateApi) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
      if (isInternalRole(role) && isCandidateApi) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
    }

    if (isInternalPage && user && !canAccess(role, pathname)) {
      return NextResponse.redirect(new URL(roleHome(role), request.url))
    }
    if (isCandidatePage && user && role !== 'candidato') {
      return NextResponse.redirect(new URL(roleHome(role), request.url))
    }
    if (isAuthEntryPage && user) {
      return NextResponse.redirect(new URL(roleHome(role), request.url))
    }
    if (isHomePage) {
      return NextResponse.redirect(new URL(user ? roleHome(role) : '/login', request.url))
    }
  } catch (error) {
    console.error('[middleware] Falha ao validar sessao com o Supabase:', error)

    if (isProtectedApiRoute) {
      return NextResponse.json({ error: 'Servico de autenticacao indisponivel' }, { status: 503 })
    }
    if (isProtectedPage || isHomePage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (isPublicPage) return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
