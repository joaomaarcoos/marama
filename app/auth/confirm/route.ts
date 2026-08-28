import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_DESTINATIONS = new Set(['/minha-area', '/redefinir-senha'])

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const requestedNext = request.nextUrl.searchParams.get('next') ?? '/minha-area'
  const destination = ALLOWED_DESTINATIONS.has(requestedNext) ? requestedNext : '/minha-area'

  if (!code) {
    return NextResponse.redirect(new URL('/login?auth=invalid-link', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?auth=invalid-or-expired', request.url))
  }

  return NextResponse.redirect(new URL(destination, request.url))
}
