import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { MoodleSyncButton } from '@/components/moodle-sync-button'
import StudentRoleToggle from '@/components/student-role-toggle'
import StudentPhoneEdit from '@/components/student-phone-edit'
import StudentCpfEdit from '@/components/student-cpf-edit'
import StudentSearch from '@/components/student-search'
import { AlunosFilter } from '@/components/alunos-filter'
import { StudentPasswordReset } from '@/components/moodle/student-password-reset'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Users, GraduationCap } from 'lucide-react'

export const revalidate = 0

const PAGE_SIZE = 50

interface PageProps {
  searchParams: { q?: string; curso?: string; tipo?: string; cpf?: string; tel?: string; page?: string }
}

export default async function AlunosPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const q = searchParams.q?.trim() ?? ''
  const selectedCursoId = searchParams.curso ? parseInt(searchParams.curso) : null
  const tipo = searchParams.tipo ?? ''
  const cpfFilter = searchParams.cpf ?? ''
  const telFilter = searchParams.tel ?? ''
  const page = Math.max(1, parseInt(searchParams.page ?? '1'))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Build course list for filter dropdown
  const { data: allStudents } = await supabase.from('students').select('courses')
  const courseMap = new Map<number, { id: number; fullname: string; shortname: string }>()
  for (const s of allStudents ?? []) {
    const courses = Array.isArray(s.courses) ? s.courses : []
    for (const c of courses as { id: number; fullname: string; shortname: string }[]) {
      if (c.id && !courseMap.has(c.id)) courseMap.set(c.id, c)
    }
  }
  const availableCourses = Array.from(courseMap.values()).sort((a, b) => a.fullname.localeCompare(b.fullname))

  // Paginated filtered query
  let query = supabase
    .from('students')
    .select('*', { count: 'exact' })
    .order('full_name', { ascending: true })
    .range(from, to)

  if (q) query = query.ilike('full_name', `%${q}%`)
  if (selectedCursoId !== null) query = query.contains('courses', [{ id: selectedCursoId }])
  if (tipo === 'aluno') query = query.eq('role', 'aluno')
  if (tipo === 'gestor') query = query.eq('role', 'gestor')
  if (cpfFilter === 'com') query = query.not('cpf', 'is', null)
  if (cpfFilter === 'sem') query = query.is('cpf', null)
  if (telFilter === 'com') query = query.not('phone', 'is', null)
  if (telFilter === 'sem') query = query.is('phone', null)

  const { data: students, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const { data: lastSync } = await supabase
    .from('students')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single()

  const gestorCount = students?.filter(s => s.role === 'gestor').length ?? 0

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (selectedCursoId) params.set('curso', String(selectedCursoId))
    if (tipo) params.set('tipo', tipo)
    if (cpfFilter) params.set('cpf', cpfFilter)
    if (telFilter) params.set('tel', telFilter)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/alunos${qs ? `?${qs}` : ''}`
  }

  const hasFilters = !!(q || selectedCursoId || tipo || cpfFilter || telFilter)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <GraduationCap size={22} style={{ color: 'hsl(160 84% 39%)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'hsl(213 31% 92%)' }}>
              Alunos
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm" style={{ color: 'hsl(215 18% 50%)' }}>
              {count ?? 0} {(count ?? 0) !== 1 ? 'alunos' : 'aluno'}
              {hasFilters && ' encontrados'}
            </span>
            {gestorCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'hsl(270 84% 39% / 0.15)', color: 'hsl(270 84% 70%)', border: '1px solid hsl(270 84% 39% / 0.3)' }}
              >
                <Users size={10} />
                {gestorCount} gestor{gestorCount !== 1 ? 'es' : ''} nesta página
              </span>
            )}
            {lastSync?.last_synced_at && (
              <span className="text-xs" style={{ color: 'hsl(215 18% 38%)' }}>
                · Última sync: {formatDate(lastSync.last_synced_at)}
              </span>
            )}
          </div>
        </div>
        <MoodleSyncButton />
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center gap-2 flex-wrap rounded-xl px-4 py-3"
        style={{ background: 'hsl(220 40% 6%)', border: '1px solid hsl(216 32% 13%)' }}
      >
        {/* Search inline */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]" style={{ position: 'relative' }}>
          <StudentSearch />
        </div>

        <AlunosFilter
          courses={availableCourses}
          currentCurso={searchParams.curso}
          currentTipo={tipo}
          currentCpf={cpfFilter}
          currentTel={telFilter}
          currentQ={q}
        />

        {/* Active filter chips */}
        {tipo && (
          <Link
            href={pageUrl(1).replace(`tipo=${tipo}`, '').replace('&&', '&').replace(/\?$/, '').replace(/&$/, '')}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'hsl(160 84% 39% / 0.12)', color: 'hsl(160 84% 60%)', border: '1px solid hsl(160 84% 39% / 0.25)' }}
          >
            {tipo === 'aluno' ? 'Alunos' : 'Gestores'}
            <span style={{ fontSize: '10px', opacity: 0.7 }}>×</span>
          </Link>
        )}
        {cpfFilter && (
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'hsl(160 84% 39% / 0.12)', color: 'hsl(160 84% 60%)', border: '1px solid hsl(160 84% 39% / 0.25)' }}>
            CPF {cpfFilter === 'com' ? 'cadastrado' : 'pendente'}
          </span>
        )}
        {telFilter && (
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'hsl(160 84% 39% / 0.12)', color: 'hsl(160 84% 60%)', border: '1px solid hsl(160 84% 39% / 0.25)' }}>
            Tel. {telFilter === 'com' ? 'cadastrado' : 'pendente'}
          </span>
        )}
        {selectedCursoId && (
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'hsl(217 91% 60% / 0.12)', color: 'hsl(217 91% 70%)', border: '1px solid hsl(217 91% 60% / 0.25)' }}>
            {availableCourses.find(c => c.id === selectedCursoId)?.shortname ?? `Curso ${selectedCursoId}`}
          </span>
        )}
      </div>

      {/* Table */}
      {(!students || students.length === 0) ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: 'hsl(220 40% 6%)', border: '1px dashed hsl(216 32% 18%)' }}
        >
          <GraduationCap size={36} style={{ color: 'hsl(215 18% 30%)', marginBottom: '12px' }} />
          <p className="text-sm font-medium" style={{ color: 'hsl(215 18% 55%)' }}>Nenhum aluno encontrado.</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(215 18% 38%)' }}>
            {hasFilters
              ? 'Tente ajustar os filtros aplicados.'
              : 'Clique em "Sincronizar Moodle" para importar os alunos.'}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'hsl(220 40% 6%)', border: '1px solid hsl(216 32% 13%)' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(216 32% 13%)' }}>
                {['Nome', 'Email', 'CPF', 'Telefone', 'Cursos', 'Tipo', 'Senha', 'Sync'].map(col => (
                  <th
                    key={col}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase"
                    style={{ color: 'hsl(215 18% 40%)', letterSpacing: '0.07em', background: 'hsl(220 40% 5%)' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, idx) => {
                const courses = Array.isArray(s.courses) ? s.courses : []
                const isGestor = s.role === 'gestor'
                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: idx < students.length - 1 ? '1px solid hsl(216 32% 10%)' : undefined,
                      background: isGestor ? 'hsl(270 84% 39% / 0.04)' : undefined,
                    }}
                  >
                    {/* Nome */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 90%)' }}>{s.full_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(215 18% 40%)' }}>ID {s.moodle_id ?? '—'}</p>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3">
                      <p className="text-xs" style={{ color: s.email ? 'hsl(215 18% 60%)' : 'hsl(215 18% 32%)' }}>
                        {s.email ?? '—'}
                      </p>
                    </td>

                    {/* CPF */}
                    <td className="px-4 py-3">
                      <StudentCpfEdit studentId={s.id} initialCpf={s.cpf ?? null} />
                    </td>

                    {/* Telefone */}
                    <td className="px-4 py-3">
                      <StudentPhoneEdit studentId={s.id} initialPhone={s.phone ?? null} />
                    </td>

                    {/* Cursos */}
                    <td className="px-4 py-3">
                      {courses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(courses as { shortname: string }[]).map((c, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-md px-1.5 py-0.5 text-xs"
                              style={{ background: 'hsl(217 91% 60% / 0.1)', color: 'hsl(217 91% 65%)', border: '1px solid hsl(217 91% 60% / 0.2)' }}
                            >
                              {c.shortname}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'hsl(215 18% 32%)' }}>—</span>
                      )}
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <StudentRoleToggle studentId={s.id} initialRole={s.role ?? 'aluno'} />
                    </td>

                    {/* Senha */}
                    <td className="px-4 py-3">
                      <StudentPasswordReset
                        id={s.id}
                        fullName={s.full_name}
                        email={s.email ?? null}
                        hasMoodleId={!!s.moodle_id}
                      />
                    </td>

                    {/* Sync */}
                    <td className="px-4 py-3">
                      <p className="text-xs" style={{ color: 'hsl(215 18% 38%)' }}>
                        {s.last_synced_at ? formatDate(s.last_synced_at) : '—'}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid hsl(216 32% 13%)' }}
            >
              <Link
                href={pageUrl(page - 1)}
                aria-disabled={page <= 1}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all ${page <= 1 ? 'pointer-events-none opacity-30' : 'hover:opacity-80'}`}
                style={{ background: 'hsl(220 40% 10%)', color: 'hsl(213 31% 70%)', border: '1px solid hsl(216 32% 15%)' }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Link>

              <span className="text-xs" style={{ color: 'hsl(215 18% 45%)' }}>
                Página {page} de {totalPages} · {count} total
              </span>

              <Link
                href={pageUrl(page + 1)}
                aria-disabled={page >= totalPages}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all ${page >= totalPages ? 'pointer-events-none opacity-30' : 'hover:opacity-80'}`}
                style={{ background: 'hsl(220 40% 10%)', color: 'hsl(213 31% 70%)', border: '1px solid hsl(216 32% 15%)' }}
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      <p className="text-xs" style={{ color: 'hsl(215 18% 32%)' }}>
        Clique no CPF ou telefone para editar · Clique no tipo para alternar Aluno/Gestor · Cadeado para redefinir senha do Moodle
      </p>
    </div>
  )
}
