export type UserRole = 'admin' | 'gerente' | 'atendente'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  atendente: 'Atendente',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#8b5cf6',
  gerente: '#3b82f6',
  atendente: '#10b981',
}

/**
 * Rotas que exigem roles específicas.
 * Qualquer rota não listada aqui é acessível a qualquer usuário autenticado.
 */
const ROLE_RESTRICTED: { path: string; allowed: UserRole[] }[] = [
  { path: '/logs',       allowed: ['admin'] },
  { path: '/usuarios',   allowed: ['admin', 'gerente'] },
  { path: '/prompt',     allowed: ['admin', 'gerente'] },
  { path: '/documentos', allowed: ['admin', 'gerente'] },
  { path: '/disparos',   allowed: ['admin', 'gerente'] },
  { path: '/relatorios', allowed: ['admin', 'gerente'] },
]

export function canAccess(role: UserRole, pathname: string): boolean {
  const rule = ROLE_RESTRICTED.find(r => pathname.startsWith(r.path))
  if (!rule) return true
  return rule.allowed.includes(role)
}

/**
 * Extrai o UserRole do objeto user do Supabase Auth.
 * Lê app_metadata.role (escrito apenas pelo adminClient).
 * Fallback para 'atendente' se não configurado.
 */
export function extractRole(user: { app_metadata?: Record<string, unknown> } | null | undefined): UserRole {
  const r = user?.app_metadata?.role
  if (r === 'admin' || r === 'gerente' || r === 'atendente') return r
  return 'atendente'
}
