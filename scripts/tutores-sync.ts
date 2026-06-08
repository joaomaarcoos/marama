import { createClient } from '@supabase/supabase-js'

const MOODLE_URL = process.env.MOODLE_URL!
const MOODLE_WSTOKEN = process.env.MOODLE_WSTOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!MOODLE_URL || !MOODLE_WSTOKEN) { console.error('❌  MOODLE_URL ou MOODLE_WSTOKEN não definidos'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('❌  Supabase env não definidas'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const SYNC_COURSE_IDS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 34, 36, 37, 38, 39, 40, 41,
]

const STUDENT_ROLE_SHORTNAMES = ['student', 'guest']

async function moodleGet<T>(wsfunction: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${MOODLE_URL}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', MOODLE_WSTOKEN)
  url.searchParams.set('moodlewsrestformat', 'json')
  url.searchParams.set('wsfunction', wsfunction)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Moodle HTTP ${res.status}: ${wsfunction}`)
  const data = await res.json()
  if (data?.exception) throw new Error(`Moodle API [${wsfunction}]: ${data.message}`)
  return data as T
}

interface RawUser {
  id: number; fullname: string; email: string; username: string
  lastcourseaccess: number
  roles: { roleid: number; name: string; shortname: string }[]
  enrolledcourses?: { id: number; fullname: string }[]
}

async function getTutorsByCourse(courseId: number): Promise<{ tutor: RawUser; courseid: number; coursename: string }[]> {
  try {
    const data = await moodleGet<RawUser[]>('core_enrol_get_enrolled_users', { courseid: String(courseId) })
    if (!Array.isArray(data)) return []
    return data
      .filter(u => (u.roles ?? []).length > 0 && (u.roles ?? []).some(r => !STUDENT_ROLE_SHORTNAMES.includes(r.shortname)))
      .map(u => ({ tutor: u, courseid: courseId, coursename: `Curso ${courseId}` }))
  } catch { return [] }
}

async function main() {
  console.log(`\n🔄  Buscando tutores/professores em ${SYNC_COURSE_IDS.length} cursos...\n`)

  const map = new Map<number, { id: number; fullname: string; email: string; username: string; roles: RawUser['roles']; courses: { id: number; name: string; lastaccess: number }[]; lastaccess: number }>()

  const CONCURRENCY = 8
  for (let i = 0; i < SYNC_COURSE_IDS.length; i += CONCURRENCY) {
    const chunk = SYNC_COURSE_IDS.slice(i, i + CONCURRENCY)
    process.stdout.write(`  Cursos ${chunk[0]}–${chunk[chunk.length - 1]}... `)
    const results = await Promise.allSettled(chunk.map(id => getTutorsByCourse(id)))
    let found = 0
    for (const r of results) {
      if (r.status === 'rejected') continue
      for (const { tutor, courseid, coursename } of r.value) {
        if (!map.has(tutor.id)) {
          map.set(tutor.id, { id: tutor.id, fullname: tutor.fullname, email: tutor.email ?? '', username: tutor.username ?? '', roles: tutor.roles ?? [], courses: [], lastaccess: 0 })
          found++
        }
        const agg = map.get(tutor.id)!
        if (!agg.courses.some(c => c.id === courseid)) {
          agg.courses.push({ id: courseid, name: coursename, lastaccess: tutor.lastcourseaccess ?? 0 })
        }
        if ((tutor.lastcourseaccess ?? 0) > agg.lastaccess) agg.lastaccess = tutor.lastcourseaccess ?? 0
      }
    }
    console.log(`${found} novos`)
  }

  const tutors = Array.from(map.values())
  console.log(`\n📊  Total de tutores/professores únicos: ${tutors.length}`)

  if (tutors.length === 0) { console.error('\n❌  Nenhum tutor encontrado.'); process.exit(1) }

  const rows = tutors.map(t => ({
    moodle_id: t.id,
    full_name: t.fullname,
    email: t.email || null,
    username: t.username || null,
    roles: t.roles,
    courses: t.courses,
    lastaccess: t.lastaccess,
    last_synced_at: new Date().toISOString(),
  }))

  console.log(`\n💾  Salvando no Supabase...`)
  const { error } = await supabase.from('tutores').upsert(rows, { onConflict: 'moodle_id', ignoreDuplicates: false })
  if (error) { console.error('❌  Erro no upsert:', error.message); process.exit(1) }

  console.log('\n' + '─'.repeat(50))
  console.log(`✅  Sync de tutores concluída!`)
  console.log(`    Tutores/Professores: ${rows.length}`)
  console.log(`    Cursos escaneados:   ${SYNC_COURSE_IDS.length}`)
  console.log('─'.repeat(50) + '\n')
}

main().catch(err => { console.error('❌  Erro fatal:', err); process.exit(1) })
