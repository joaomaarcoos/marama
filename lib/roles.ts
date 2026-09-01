export const INTERNAL_USER_ROLES = ['admin', 'gerente', 'atendente'] as const
export const ASSIGNABLE_INTERNAL_ROLES = INTERNAL_USER_ROLES

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number]
export type UserRole = InternalUserRole | 'candidato'
export type ResolvedUserRole = UserRole | 'sem_acesso'

export const ROLE_LABELS: Record<ResolvedUserRole, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  atendente: 'Atendente',
  candidato: 'Candidato',
  sem_acesso: 'Sem acesso',
}

export const ROLE_COLORS: Record<ResolvedUserRole, string> = {
  admin: '#8b5cf6',
  gerente: '#3b82f6',
  atendente: '#10b981',
  candidato: '#d97706',
  sem_acesso: '#64748b',
}

/**
 * Rotas internas que exigem papeis especificos.
 * O middleware bloqueia candidatos e contas sem papel antes desta checagem.
 */
const ROLE_RESTRICTED: { path: string; allowed: InternalUserRole[] }[] = [
  { path: '/logs', allowed: ['admin'] },
  { path: '/usuarios', allowed: ['admin', 'gerente'] },
  { path: '/prompt', allowed: ['admin', 'gerente'] },
  { path: '/documentos', allowed: ['admin', 'gerente'] },
  { path: '/disparos', allowed: ['admin', 'gerente'] },
  { path: '/relatorios', allowed: ['admin', 'gerente'] },
  { path: '/tarefas', allowed: ['admin', 'gerente', 'atendente'] },
  { path: '/sigec-processos', allowed: ['admin', 'gerente'] },
  { path: '/sigec-candidaturas', allowed: ['admin', 'gerente'] },
]

export function isInternalRole(role: ResolvedUserRole): role is InternalUserRole {
  return INTERNAL_USER_ROLES.includes(role as InternalUserRole)
}

export function isUserRole(value: unknown): value is UserRole {
  return isInternalRole(value as ResolvedUserRole) || value === 'candidato'
}

export function canAccess(role: ResolvedUserRole, pathname: string): boolean {
  if (!isInternalRole(role)) return false
  const rule = ROLE_RESTRICTED.find((item) => pathname.startsWith(item.path))
  return rule ? rule.allowed.includes(role) : true
}

export function roleHome(role: ResolvedUserRole): string {
  if (role === 'candidato') return '/minha-area'
  if (isInternalRole(role)) return '/dashboard'
  return '/acesso-negado'
}

/**
 * Le somente app_metadata.role, que nao pode ser alterado pelo proprio usuario.
 * Contas sem um papel reconhecido recebem acesso negado; nunca um papel por fallback.
 */
export function extractRole(
  user: { app_metadata?: Record<string, unknown> } | null | undefined
): ResolvedUserRole {
  const role = user?.app_metadata?.role
  return isUserRole(role) ? role : 'sem_acesso'
}
