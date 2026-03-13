import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { MoodleSyncButton } from '@/components/moodle-sync-button'
import StudentRoleToggle from '@/components/student-role-toggle'
import StudentPhoneEdit from '@/components/student-phone-edit'
import StudentCpfEdit from '@/components/student-cpf-edit'
import CourseFilter from '@/components/course-filter'
import StudentSearch from '@/components/student-search'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const revalidate = 0

const PAGE_SIZE = 50

interface PageProps {
  searchParams: { curso?: string; q?: string; page?: string }
}

export default async function MoodlePage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const selectedCourseId = searchParams.curso ? parseInt(searchParams.curso) : null
  const q = searchParams.q?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.page ?? '1'))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Fetch all students' courses to build the course filter pills
  const { data: allStudents } = await supabase
    .from('students')
    .select('courses')

  const courseMap = new Map<number, { id: number; fullname: string; shortname: string }>()
  for (const s of allStudents ?? []) {
    const courses = Array.isArray(s.courses) ? s.courses : []
    for (const c of courses as { id: number; fullname: string; shortname: string }[]) {
      if (c.id && !courseMap.has(c.id)) {
        courseMap.set(c.id, { id: c.id, fullname: c.fullname, shortname: c.shortname })
      }
    }
  }
  const availableCourses = Array.from(courseMap.values()).sort((a, b) =>
    a.fullname.localeCompare(b.fullname)
  )

  // Paginated + filtered query
  let query = supabase
    .from('students')
    .select('*', { count: 'exact' })
    .order('full_name', { ascending: true })
    .range(from, to)

  if (selectedCourseId !== null) {
    query = query.contains('courses', [{ id: selectedCourseId }])
  }
  if (q) {
    query = query.ilike('full_name', `%${q}%`)
  }

  const { data: students, count } = await query

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const { data: lastSync } = await supabase
    .from('students')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single()

  const gestorCount = students?.filter((s) => s.role === 'gestor').length ?? 0
  const totalStudents = allStudents?.length ?? 0

  // Build pagination URL preserving existing params
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (selectedCourseId) params.set('curso', String(selectedCourseId))
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/moodle${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alunos (Moodle)</h1>
          <p className="text-gray-500 mt-1">
            {count ?? 0} pessoa{count !== 1 ? 's' : ''}
            {(selectedCourseId !== null || q) && (
              <span className="text-gray-400"> encontrada{count !== 1 ? 's' : ''}</span>
            )}
            {gestorCount > 0 && (
              <span className="ml-2 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                {gestorCount} gestor{gestorCount !== 1 ? 'es' : ''} nesta página
              </span>
            )}
            {lastSync?.last_synced_at && (
              <span className="ml-2 text-xs text-gray-400">
                · Última sync: {formatDate(lastSync.last_synced_at)}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Clique no telefone para editar · Clique no tipo para alternar Aluno/Gestor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StudentSearch />
          <MoodleSyncButton />
        </div>
      </div>

      <CourseFilter
        courses={availableCourses}
        selectedCourseId={selectedCourseId}
        totalStudents={totalStudents}
      />

      {(!students || students.length === 0) ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">Nenhum aluno encontrado.</p>
          <p className="text-sm text-gray-400 mt-1">
            {q
              ? `Nenhum resultado para "${q}".`
              : selectedCourseId !== null
              ? 'Nenhum aluno neste curso.'
              : 'Clique em "Sincronizar" para importar os alunos do Moodle.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">CPF</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cursos</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map((s) => {
                const courses = Array.isArray(s.courses) ? s.courses : []
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                      <p className="text-xs text-gray-400">ID: {s.moodle_id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{s.email ?? '—'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StudentCpfEdit studentId={s.id} initialCpf={s.cpf ?? null} />
                    </td>
                    <td className="px-6 py-4">
                      <StudentPhoneEdit studentId={s.id} initialPhone={s.phone ?? null} />
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {courses.length > 0
                          ? courses.map((c: { shortname: string }) => c.shortname).join(', ')
                          : '—'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <StudentRoleToggle
                        studentId={s.id}
                        initialRole={s.role ?? 'aluno'}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-400">
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
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
              <Link
                href={pageUrl(page - 1)}
                aria-disabled={page <= 1}
                className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  page <= 1
                    ? 'text-gray-300 pointer-events-none'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Link>

              <span className="text-sm text-gray-500">
                Página {page} de {totalPages}
                <span className="text-gray-400 ml-1">({count} total)</span>
              </span>

              <Link
                href={pageUrl(page + 1)}
                aria-disabled={page >= totalPages}
                className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  page >= totalPages
                    ? 'text-gray-300 pointer-events-none'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
