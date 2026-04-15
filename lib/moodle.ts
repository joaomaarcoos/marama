function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

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
  const url = new URL(`${getRequiredEnv('MOODLE_URL')}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', getRequiredEnv('MOODLE_WSTOKEN'))
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
  phone1: string | null   // telefone principal do perfil Moodle
  phone2: string | null   // telefone secundário
  idnumber: string | null // campo idnumber do Moodle — geralmente contém o CPF
  courses: { id: number; fullname: string; shortname: string }[]
}

// ─── Sync Functions (used during full bulk sync) ───────────────────────────────

/** Get all students enrolled in a specific course (role=student only) */
export async function getEnrolledStudents(courseId: number): Promise<EnrolledStudent[]> {
  try {
    const data = await moodleGet<{
      id: number
      fullname: string
      email: string
      username: string
      phone1?: string
      phone2?: string
      idnumber?: string
      roles: { shortname: string }[]
      enrolledcourses?: { id: number; fullname: string; shortname: string }[]
    }[]>(
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
        phone1: u.phone1 && u.phone1.trim() ? u.phone1.trim() : null,
        phone2: u.phone2 && u.phone2.trim() ? u.phone2.trim() : null,
        idnumber: u.idnumber && u.idnumber.trim() ? u.idnumber.trim() : null,
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

// ─── Tutor / Teacher Functions ────────────────────────────────────────────────

const STUDENT_ROLE_SHORTNAMES = ['student', 'guest'] // excluir esses, mostrar todos os demais

export interface TutorCourse {
  id: number
  name: string
  lastaccess: number // unix timestamp, 0 if never
}

export interface TutorAggregate {
  id: number
  fullname: string
  email: string
  username: string
  roles: { roleid: number; name: string; shortname: string }[]
  courses: TutorCourse[]
  lastaccess: number // max across all courses
}

type RawEnrolledUser = {
  id: number
  fullname: string
  email: string
  username: string
  lastcourseaccess: number
  roles: { roleid: number; name: string; shortname: string }[]
}

async function getTeachersByCourse(
  courseId: number,
  courseName: string
): Promise<{ tutor: RawEnrolledUser; courseid: number; coursename: string }[]> {
  try {
    const data = await moodleGet<RawEnrolledUser[]>('core_enrol_get_enrolled_users', {
      courseid: String(courseId),
    })
    if (!Array.isArray(data)) return []
    return data
      .filter((u) => {
        const roles = u.roles ?? []
        if (roles.length === 0) return false
        // mostra quem tem pelo menos um papel que NAO seja aluno/guest
        return roles.some((r) => !STUDENT_ROLE_SHORTNAMES.includes(r.shortname))
      })
      .map((u) => ({ tutor: u, courseid: courseId, coursename: courseName }))
  } catch {
    return []
  }
}

export async function getAllTutors(): Promise<TutorAggregate[]> {
  // Fetch course names first
  const courseNames: Record<number, string> = {}
  try {
    for (const id of SYNC_COURSE_IDS) {
      courseNames[id] = `Curso ${id}`
    }
    // Try to get course names from any enrolled user's courses
    const sampleData = await moodleGet<{ id: number; fullname: string; shortname: string }[]>(
      'core_enrol_get_enrolled_users',
      { courseid: String(SYNC_COURSE_IDS[0]) }
    )
    if (Array.isArray(sampleData) && sampleData.length > 0) {
      const user = sampleData[0] as unknown as { enrolledcourses?: { id: number; fullname: string }[] }
      if (user.enrolledcourses) {
        for (const c of user.enrolledcourses) {
          courseNames[c.id] = c.fullname
        }
      }
    }
  } catch {
    // ignore, use fallback names
  }

  // Process in chunks of 10 to avoid overwhelming Moodle
  const chunks: number[][] = []
  for (let i = 0; i < SYNC_COURSE_IDS.length; i += 10) {
    chunks.push(SYNC_COURSE_IDS.slice(i, i + 10))
  }

  const allEntries: { tutor: RawEnrolledUser; courseid: number; coursename: string }[] = []
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map((id) => getTeachersByCourse(id, courseNames[id] ?? `Curso ${id}`))
    )
    for (const r of results) allEntries.push(...r)
  }

  // Aggregate by tutor id
  const map = new Map<number, TutorAggregate>()
  for (const { tutor, courseid, coursename } of allEntries) {
    if (!map.has(tutor.id)) {
      map.set(tutor.id, {
        id: tutor.id,
        fullname: tutor.fullname,
        email: tutor.email ?? '',
        username: tutor.username ?? '',
        roles: tutor.roles ?? [],
        courses: [],
        lastaccess: 0,
      })
    }
    const agg = map.get(tutor.id)!
    const alreadyHasCourse = agg.courses.some((c) => c.id === courseid)
    if (!alreadyHasCourse) {
      agg.courses.push({ id: courseid, name: coursename, lastaccess: tutor.lastcourseaccess ?? 0 })
    }
    if ((tutor.lastcourseaccess ?? 0) > agg.lastaccess) {
      agg.lastaccess = tutor.lastcourseaccess ?? 0
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastaccess - a.lastaccess)
}

// ─── Password Management ──────────────────────────────────────────────────────

/**
 * Gera uma senha temporária segura de 8 caracteres (letras + números).
 * Evita caracteres ambíguos: 0/O, 1/l/I.
 */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = upper + lower + digits

  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]

  // Garantir ao menos 1 de cada grupo
  const required = [pick(upper), pick(lower), pick(digits)]
  const rest = Array.from({ length: 5 }, () => pick(all))

  // Embaralhar
  const combined = [...required, ...rest]
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]]
  }
  return combined.join('')
}

/**
 * Troca a senha de um usuário diretamente via token admin.
 * Requires: core_user_update_users
 */
export async function setUserPassword(moodleId: number, newPassword: string): Promise<void> {
  const url = new URL(`${getRequiredEnv('MOODLE_URL')}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', getRequiredEnv('MOODLE_WSTOKEN'))
  url.searchParams.set('moodlewsrestformat', 'json')
  url.searchParams.set('wsfunction', 'core_user_update_users')

  const body = new URLSearchParams()
  body.set('users[0][id]', String(moodleId))
  body.set('users[0][password]', newPassword)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Moodle HTTP error ${res.status}: core_user_update_users`)

  const data = await res.json()
  if (data?.exception) throw new Error(`Moodle API error: ${data.message}`)

  // warnings indicam problemas (ex: senha fraca, usuário inexistente)
  if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
    const msg = data.warnings.map((w: { message: string }) => w.message).join('; ')
    throw new Error(`Moodle warning ao trocar senha: ${msg}`)
  }
}

/**
 * Dispara email de redefinição de senha para o usuário.
 * Requires: core_auth_request_password_reset
 */
export async function requestPasswordReset(username: string, email: string): Promise<void> {
  const url = new URL(`${getRequiredEnv('MOODLE_URL')}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', getRequiredEnv('MOODLE_WSTOKEN'))
  url.searchParams.set('moodlewsrestformat', 'json')
  url.searchParams.set('wsfunction', 'core_auth_request_password_reset')

  const body = new URLSearchParams()
  body.set('username', username)
  body.set('email', email)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Moodle HTTP error ${res.status}: core_auth_request_password_reset`)

  const data = await res.json()
  if (data?.exception) throw new Error(`Moodle API error: ${data.message}`)
}

// ─── Grade Items (notas detalhadas por atividade) ─────────────────────────────

export interface GradeItem {
  id: number
  itemname: string | null
  itemtype: string          // 'course' | 'category' | 'mod'
  itemmodule: string | null // 'quiz' | 'assign' | 'forum' | null
  graderaw: number | null
  grademin: number
  grademax: number
  gradeformatted: string
  percentageformatted: string
  feedback: string
}

/**
 * Notas detalhadas por item de avaliação (quiz, tarefa, fórum, etc.) de um curso.
 * Requires: gradereport_user_get_grade_items
 */
export async function getGradeItems(userId: number, courseId: number): Promise<GradeItem[]> {
  try {
    const data = await moodleGet<{ usergrades: Array<{ gradeitems: GradeItem[] }> }>(
      'gradereport_user_get_grade_items',
      { courseid: String(courseId), userid: String(userId) }
    )
    const items = data?.usergrades?.[0]?.gradeitems ?? []
    // Excluir a linha de nota total do curso e subcategorias sem nome
    return items.filter(
      (item) => item.itemtype === 'mod' && item.itemname
    )
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

export function formatDetailedGradeContext(items: GradeItem[], courseName: string): string {
  if (!items.length) return `Nenhuma nota lançada em "${courseName}" ainda.`

  const lines = items.map((item) => {
    const name = item.itemname ?? 'Atividade'
    const mod = item.itemmodule ? ` (${item.itemmodule})` : ''
    const grade = item.gradeformatted ?? 'não lançada'
    const max = item.grademax ? ` / ${item.grademax.toFixed(2)}` : ''
    const pct = item.percentageformatted ? ` — ${item.percentageformatted}` : ''
    return `• ${name}${mod}: ${grade}${max}${pct}`
  })

  return `Notas detalhadas — ${courseName}:\n${lines.join('\n')}`
}
