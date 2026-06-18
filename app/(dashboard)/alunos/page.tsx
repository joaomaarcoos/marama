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
import { ChevronLeft, ChevronRight, GraduationCap, Download } from 'lucide-react'

export const revalidate = 0

const PAGE_SIZE = 50

type StudentCourse = {
  id?: number | string | null
  fullname?: string | null
  shortname?: string | null
  processo_seletivo?: string | null
  status_inscricao?: string | null
  requisitos_curso?: string | null
  cota?: string | null
  status_cota?: string | null
}

function courseFilterId(course: StudentCourse) {
  return course.id ? String(course.id) : `name:${course.fullname || course.shortname || ''}`
}

function courseMatchesFilter(course: StudentCourse, selected: string) {
  return courseFilterId(course) === selected
}

interface PageProps {
  searchParams: { q?: string; curso?: string; tipo?: string; cpf?: string; tel?: string; page?: string }
}

export default async function AlunosPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const q = searchParams.q?.trim() ?? ''
  const selectedCurso = searchParams.curso ?? ''
  const selectedCursoId = selectedCurso && /^\d+$/.test(selectedCurso) ? parseInt(selectedCurso) : null
  const tipo = searchParams.tipo ?? ''
  const cpfFilter = searchParams.cpf ?? ''
  const telFilter = searchParams.tel ?? ''
  const page = Math.max(1, parseInt(searchParams.page ?? '1'))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: allStudents } = await supabase.from('students').select('courses')
  const courseMap = new Map<string, { id: string; fullname: string; shortname: string }>()
  for (const s of allStudents ?? []) {
    const courses = Array.isArray(s.courses) ? s.courses : []
    for (const c of courses as StudentCourse[]) {
      const id = courseFilterId(c)
      const fullname = c.fullname || c.shortname || ''
      if (fullname && !courseMap.has(id)) {
        courseMap.set(id, {
          id,
          fullname,
          shortname: c.shortname || c.fullname || '',
        })
      }
    }
  }
  const availableCourses = Array.from(courseMap.values()).sort((a, b) => a.fullname.localeCompare(b.fullname))

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
  const filteredStudents = selectedCurso.startsWith('name:')
    ? (students ?? []).filter((s) => {
        const courses = Array.isArray(s.courses) ? s.courses : []
        return (courses as StudentCourse[]).some((course) => courseMatchesFilter(course, selectedCurso))
      })
    : students
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const { data: lastSync } = await supabase
    .from('students')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single()

  const hasFilters = !!(q || selectedCursoId || tipo || cpfFilter || telFilter)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (selectedCurso) params.set('curso', selectedCurso)
    if (tipo) params.set('tipo', tipo)
    if (cpfFilter) params.set('cpf', cpfFilter)
    if (telFilter) params.set('tel', telFilter)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/alunos${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      {/* Header */}
      <div className="app-header">
        <div>
          <h1>Alunos</h1>
          <p className="app-subtitle">
            {count ?? 0} {(count ?? 0) !== 1 ? 'alunos' : 'aluno'}
            {hasFilters ? ' encontrados' : ' sincronizados'}
            {lastSync?.last_synced_at && ` · última sync ${formatDate(lastSync.last_synced_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="ds-btn ds-btn--ghost" style={{ fontSize: '13px' }}>
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <MoodleSyncButton />
        </div>
      </div>

      {/* Content */}
      <div className="app-content flex flex-col gap-5">

        {/* Filter bar */}
        <div
          className="flex items-center gap-2 flex-wrap rounded-xl px-4 py-3"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
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
          {tipo && (
            <Link
              href={pageUrl(1).replace(`tipo=${tipo}`, '').replace('&&', '&').replace(/\?$/, '').replace(/&$/, '')}
              className="ds-badge ds-badge--active"
              style={{ cursor: 'pointer' }}
            >
              {tipo === 'aluno' ? 'Alunos' : 'Gestores'}
              <span style={{ opacity: 0.7 }}>×</span>
            </Link>
          )}
          {cpfFilter && (
            <span className="ds-badge ds-badge--active">
              CPF {cpfFilter === 'com' ? 'cadastrado' : 'pendente'}
            </span>
          )}
          {telFilter && (
            <span className="ds-badge ds-badge--active">
              Tel. {telFilter === 'com' ? 'cadastrado' : 'pendente'}
            </span>
          )}
          {selectedCurso && (
            <span className="ds-badge ds-badge--course">
              {availableCourses.find(c => c.id === selectedCurso)?.shortname ?? selectedCurso}
            </span>
          )}
        </div>

        {/* Table / empty state */}
        {(!filteredStudents || filteredStudents.length === 0) ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-xl"
            style={{ background: 'hsl(var(--card))', border: '1px dashed hsl(var(--border))' }}
          >
            <GraduationCap size={36} style={{ color: 'hsl(var(--fg4))', marginBottom: '12px' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--fg2))' }}>Nenhum aluno encontrado.</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--fg3))' }}>
              {hasFilters
                ? 'Tente ajustar os filtros aplicados.'
                : 'Clique em "Sincronizar Moodle" para importar os alunos.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            {/* overflow-x-auto permite scroll horizontal em telas estreitas sem cortar os cantos */}
            <div className="overflow-x-auto rounded-xl">
              <table className="data-table">
                <thead>
                  <tr>
                    {['Nome', 'Email', 'CPF', 'Telefone', 'Cursos', 'Tipo', 'Senha', 'Sync'].map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const courses = Array.isArray(s.courses) ? s.courses : []
                    const isGestor = s.role === 'gestor'
                    return (
                      <tr
                        key={s.id}
                        style={isGestor ? { background: 'hsl(var(--accent-violet) / 0.04)' } : undefined}
                      >
                        {/* Nome */}
                        <td style={{ minWidth: '160px' }}>
                          <p className="font-medium" style={{ color: 'hsl(var(--fg1))', fontSize: '0.8125rem' }}>{s.full_name}</p>
                          <p className="ds-mono" style={{ marginTop: 2 }}>ID {s.moodle_id ?? '—'}</p>
                        </td>

                        {/* Email */}
                        <td style={{ minWidth: '180px' }}>
                          <span className="ds-mono" style={{ color: s.email ? 'hsl(var(--fg2))' : 'hsl(var(--fg4))' }}>
                            {s.email ?? '—'}
                          </span>
                        </td>

                        {/* CPF */}
                        <td style={{ minWidth: '130px' }}><StudentCpfEdit studentId={s.id} initialCpf={s.cpf ?? null} /></td>

                        {/* Telefone */}
                        <td style={{ minWidth: '140px' }}><StudentPhoneEdit studentId={s.id} initialPhone={s.phone ?? null} /></td>

                        {/* Cursos */}
                        <td style={{ minWidth: '120px' }}>
                          {courses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(courses as StudentCourse[]).map((c, i) => {
                                const label = c.shortname || c.fullname || 'Curso'
                                const details = [
                                  c.processo_seletivo,
                                  c.status_inscricao ? `Inscrição: ${c.status_inscricao}` : null,
                                  c.requisitos_curso ? `Requisitos: ${c.requisitos_curso}` : null,
                                  c.cota ? `Cota: ${c.cota}` : null,
                                  c.status_cota ? `Status cota: ${c.status_cota}` : null,
                                ].filter(Boolean)

                                return (
                                  <span key={i} className="ds-badge ds-badge--course" title={details.join(' · ') || label}>
                                    {label}
                                    {details.length > 0 && (
                                      <span style={{ marginLeft: 4, opacity: 0.65 }}>
                                        · {details.join(' · ')}
                                      </span>
                                    )}
                                  </span>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="ds-mono">—</span>
                          )}
                        </td>

                        {/* Tipo */}
                        <td style={{ minWidth: '90px' }}><StudentRoleToggle studentId={s.id} initialRole={s.role ?? 'aluno'} /></td>

                        {/* Senha */}
                        <td style={{ minWidth: '80px' }}>
                          <StudentPasswordReset
                            id={s.id}
                            fullName={s.full_name}
                            email={s.email ?? null}
                            hasMoodleId={!!s.moodle_id}
                          />
                        </td>

                        {/* Sync */}
                        <td style={{ minWidth: '90px', whiteSpace: 'nowrap' }}>
                          <span className="ds-mono">
                            {s.last_synced_at ? formatDate(s.last_synced_at) : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — fora do overflow-x-auto para não ser arrastada horizontalmente */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3 flex-wrap gap-2"
                style={{ borderTop: '1px solid hsl(var(--border))' }}
              >
                <Link
                  href={pageUrl(page - 1)}
                  aria-disabled={page <= 1}
                  className={`ds-btn ds-btn--secondary ${page <= 1 ? 'pointer-events-none opacity-30' : ''}`}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Link>
                <span className="ds-mono" style={{ fontSize: '12px', color: 'hsl(var(--fg3))' }}>
                  Página {page} de {totalPages} · {count} total
                </span>
                <Link
                  href={pageUrl(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={`ds-btn ds-btn--secondary ${page >= totalPages ? 'pointer-events-none opacity-30' : ''}`}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Próxima
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 'var(--type-tiny)', color: 'hsl(var(--fg4))' }}>
          Clique no CPF ou telefone para editar · Clique no tipo para alternar Aluno/Gestor · Cadeado para redefinir senha do Moodle
        </p>
      </div>
    </>
  )
}
