const MOODLE_URL = process.env.MOODLE_URL!
const WSTOKEN = process.env.MOODLE_WSTOKEN!

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MoodleUser {
  id: number
  fullname: string
  email: string
  phone1: string
  phone2: string
  username: string
  idnumber: string
}

export interface MoodleCourse {
  id: number
  fullname: string
  shortname: string
  startdate: number
  enddate: number
}

export interface CourseGrade {
  courseid: number
  coursename?: string
  grade: string
  rawgrade: string
}

export interface CourseCompletion {
  completed: boolean
  timecompleted: number | null
  completiondate?: string
}

export interface ActivityCompletion {
  cmid: number
  modname: string
  name: string
  state: number   // 0=not completed, 1=completed
  timecompleted: number
  tracking: number
}

export interface EnrollmentInfo {
  courseid: number
  coursename: string
  status: 'active' | 'suspended'
  timestart: number
  timeend: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(wsfunction: string, params: Record<string, string> = {}): string {
  const url = new URL(`${MOODLE_URL}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', WSTOKEN)
  url.searchParams.set('moodlewsrestformat', 'json')
  url.searchParams.set('wsfunction', wsfunction)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

async function moodleGet<T>(wsfunction: string, params: Record<string, string> = {}): Promise<T> {
  const url = buildUrl(wsfunction, params)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Moodle HTTP error ${res.status}: ${wsfunction}`)
  const data = await res.json()
  if (data?.exception) throw new Error(`Moodle API error [${wsfunction}]: ${data.message}`)
  return data as T
}

// ─── Course IDs to sync (discovered via API — all active courses with students) ─

export const SYNC_COURSE_IDS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 34, 36, 37, 38, 39, 40, 41,
]

export interface EnrolledStudent {
  id: number
  fullname: string
  email: string
  username: string
  courses: { id: number; fullname: string; shortname: string }[]
}

// ─── Sync Functions (used during full bulk sync) ───────────────────────────────

/** Get all students enrolled in a specific course (role=student only) */
export async function getEnrolledStudents(courseId: number): Promise<EnrolledStudent[]> {
  try {
    const data = await moodleGet<{ id: number; fullname: string; email: string; username: string; roles: { shortname: string }[]; enrolledcourses?: { id: number; fullname: string; shortname: string }[] }[]>(
      'core_enrol_get_enrolled_users',
      { courseid: String(courseId) }
    )
    if (!Array.isArray(data)) return []
    return data
      .filter(u => (u.roles ?? []).some(r => r.shortname === 'student'))
      .map(u => ({
        id: u.id,
        fullname: u.fullname,
        email: u.email ?? '',
        username: u.username ?? '',
        courses: u.enrolledcourses ?? [],
      }))
  } catch {
    return []
  }
}

export async function getUserCourses(userId: number): Promise<MoodleCourse[]> {
  try {
    const data = await moodleGet<MoodleCourse[]>('core_enrol_get_users_courses', {
      userid: String(userId),
    })
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── On-demand Functions (called by MARA during conversation) ─────────────────

/**
 * Nota geral do aluno em cada curso
 * Requires: gradereport_overview_get_course_grades
 */
export async function getUserGradeOverview(userId: number): Promise<CourseGrade[]> {
  try {
    const data = await moodleGet<{ grades: CourseGrade[]; warnings: unknown[] }>(
      'gradereport_overview_get_course_grades',
      { userid: String(userId) }
    )
    return data.grades ?? []
  } catch {
    return []
  }
}

/**
 * Status de conclusão do curso (concluído? quando? → pré-requisito certificado)
 * Requires: core_completion_get_course_completion_status
 */
export async function getCourseCompletion(
  userId: number,
  courseId: number
): Promise<CourseCompletion | null> {
  try {
    const data = await moodleGet<{ completionstatus: { completed: boolean; timecompleted: number } }>(
      'core_completion_get_course_completion_status',
      { courseid: String(courseId), userid: String(userId) }
    )
    const s = data.completionstatus
    if (!s) return null
    return {
      completed: s.completed,
      timecompleted: s.timecompleted || null,
      completiondate: s.timecompleted
        ? new Date(s.timecompleted * 1000).toLocaleDateString('pt-BR')
        : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Progresso por atividade dentro de um curso
 * Requires: core_completion_get_activities_completion_status
 */
export async function getCourseActivitiesCompletion(
  userId: number,
  courseId: number
): Promise<ActivityCompletion[]> {
  try {
    const data = await moodleGet<{ statuses: ActivityCompletion[] }>(
      'core_completion_get_activities_completion_status',
      { courseid: String(courseId), userid: String(userId) }
    )
    return data.statuses ?? []
  } catch {
    return []
  }
}

/**
 * Status de matrícula (ativa/suspensa) e datas de cada curso
 * Requires: core_enrol_get_users_courses (campo visible indica status)
 */
export async function getUserEnrollmentInfo(userId: number): Promise<EnrollmentInfo[]> {
  try {
    const courses = await moodleGet<Array<{
      id: number
      fullname: string
      shortname: string
      startdate: number
      enddate: number
      visible: number
    }>>('core_enrol_get_users_courses', { userid: String(userId) })

    if (!Array.isArray(courses)) return []

    return courses.map((c) => ({
      courseid: c.id,
      coursename: c.fullname,
      status: c.visible === 1 ? 'active' : 'suspended',
      timestart: c.startdate,
      timeend: c.enddate,
    }))
  } catch {
    return []
  }
}

// ─── Context Formatters (for MARA system prompt injection) ─────────────────────

export function formatGradeContext(grades: CourseGrade[], courses: MoodleCourse[]): string {
  if (!grades.length) return 'Nenhuma nota disponível no momento.'
  const courseMap = new Map(courses.map((c) => [c.id, c.shortname || c.fullname]))
  return grades
    .map((g) => {
      const name = courseMap.get(g.courseid) ?? `Curso ${g.courseid}`
      const nota = parseFloat(g.grade)
      return `${name}: nota ${isNaN(nota) ? 'não lançada' : nota.toFixed(1)}`
    })
    .join('\n')
}

export function formatCompletionContext(
  completion: CourseCompletion | null,
  courseName: string
): string {
  if (!completion) return `Dados de conclusão de "${courseName}" não disponíveis.`
  if (completion.completed) {
    return `"${courseName}": CONCLUÍDO${completion.completiondate ? ` em ${completion.completiondate}` : ''}. Certificado disponível para emissão.`
  }
  return `"${courseName}": em andamento (não concluído ainda — certificado não liberado).`
}

export function formatActivitiesContext(activities: ActivityCompletion[]): string {
  if (!activities.length) return 'Nenhuma atividade encontrada.'
  const total = activities.length
  const done = activities.filter((a) => a.state === 1).length
  const pct = Math.round((done / total) * 100)
  return `Progresso: ${done}/${total} atividades concluídas (${pct}%).`
}

export function formatEnrollmentContext(enrollments: EnrollmentInfo[]): string {
  if (!enrollments.length) return 'Nenhuma matrícula encontrada.'
  return enrollments
    .map((e) => {
      const inicio = e.timestart
        ? new Date(e.timestart * 1000).toLocaleDateString('pt-BR')
        : 'não informado'
      const fim = e.timeend && e.timeend > 0
        ? new Date(e.timeend * 1000).toLocaleDateString('pt-BR')
        : 'sem prazo definido'
      const status = e.status === 'active' ? '✅ ATIVA' : '⚠️ SUSPENSA'
      return `${e.coursename}: ${status} | início: ${inicio} | prazo: ${fim}`
    })
    .join('\n')
}
