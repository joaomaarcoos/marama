import { createClient } from '@supabase/supabase-js'
import { normalizePhone, normalizeCpf } from '../lib/utils'

// ─── Env ──────────────────────────────────────────────────────────────────────

const MOODLE_URL = process.env.MOODLE_URL!
const MOODLE_WSTOKEN = process.env.MOODLE_WSTOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!MOODLE_URL || !MOODLE_WSTOKEN) {
  console.error('❌  MOODLE_URL ou MOODLE_WSTOKEN não definidos')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Moodle helper ────────────────────────────────────────────────────────────

async function moodleGet<T>(wsfunction: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${MOODLE_URL}/webservice/rest/server.php`)
  url.searchParams.set('wstoken', MOODLE_WSTOKEN)
  url.searchParams.set('moodlewsrestformat', 'json')
  url.searchParams.set('wsfunction', wsfunction)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { cache: 'no-store' } as RequestInit)
  if (!res.ok) throw new Error(`Moodle HTTP ${res.status}: ${wsfunction}`)
  const data = await res.json()
  if (data?.exception) throw new Error(`Moodle API [${wsfunction}]: ${data.message}`)
  return data as T
}

interface EnrolledUser {
  id: number
  fullname: string
  email: string
  username: string
  phone1?: string
  phone2?: string
  idnumber?: string
  roles: { shortname: string }[]
  enrolledcourses?: { id: number; fullname: string; shortname: string }[]
}

async function getEnrolledStudents(courseId: number) {
  const data = await moodleGet<EnrolledUser[]>('core_enrol_get_enrolled_users', {
    courseid: String(courseId),
  })
  if (!Array.isArray(data)) return []
  return data
    .filter(u => (u.roles ?? []).some(r => r.shortname === 'student'))
    .map(u => ({
      id: u.id,
      fullname: u.fullname,
      email: u.email ?? '',
      username: u.username ?? '',
      phone1: u.phone1?.trim() || null,
      phone2: u.phone2?.trim() || null,
      idnumber: u.idnumber?.trim() || null,
      courses: u.enrolledcourses ?? [],
    }))
}

// ─── Course IDs ───────────────────────────────────────────────────────────────

const SYNC_COURSE_IDS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 34, 36, 37, 38, 39, 40, 41,
]
const CONCURRENCY = 8
const BATCH_SIZE = 100

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄  Iniciando sync Moodle — ${SYNC_COURSE_IDS.length} cursos em lotes de ${CONCURRENCY}\n`)

  const studentMap = new Map<number, ReturnType<typeof getEnrolledStudents> extends Promise<(infer T)[]> ? T : never>()
  const errors: string[] = []
  let totalFetched = 0

  for (let i = 0; i < SYNC_COURSE_IDS.length; i += CONCURRENCY) {
    const chunk = SYNC_COURSE_IDS.slice(i, i + CONCURRENCY)
    process.stdout.write(`  Cursos ${chunk[0]}–${chunk[chunk.length - 1]}... `)

    const results = await Promise.allSettled(chunk.map(id => getEnrolledStudents(id)))

    let chunkCount = 0
    results.forEach((r, idx) => {
      const courseId = chunk[idx]
      if (r.status === 'rejected') {
        errors.push(`Curso ${courseId}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
        return
      }
      for (const s of r.value) {
        if (studentMap.has(s.id)) {
          const existing = studentMap.get(s.id)!
          const existingIds = new Set(existing.courses.map((c: { id: number }) => c.id))
          for (const c of s.courses) {
            if (!existingIds.has(c.id)) existing.courses.push(c)
          }
          if (!existing.phone1 && s.phone1) existing.phone1 = s.phone1
          if (!existing.phone2 && s.phone2) existing.phone2 = s.phone2
          if (!existing.idnumber && s.idnumber) existing.idnumber = s.idnumber
        } else {
          studentMap.set(s.id, { ...s, courses: [...s.courses] })
          chunkCount++
        }
      }
      totalFetched += r.value.length
    })
    console.log(`${chunkCount} novos alunos`)
  }

  console.log(`\n📊  Total único de alunos: ${studentMap.size} (${totalFetched} matrículas brutas)`)

  if (errors.length > 0) {
    console.warn(`\n⚠️  ${errors.length} erros ao buscar cursos:`)
    errors.forEach(e => console.warn(`    ${e}`))
  }

  if (studentMap.size === 0) {
    console.error('\n❌  Nenhum aluno encontrado. Verifique as credenciais do Moodle.')
    process.exit(1)
  }

  // ─── Upsert ──────────────────────────────────────────────────────────────────
  const rows = Array.from(studentMap.values()).map(s => ({
    moodle_id: s.id,
    full_name: s.fullname,
    email: s.email || null,
    username: s.username || null,
    courses: s.courses,
    last_synced_at: new Date().toISOString(),
  }))

  console.log(`\n💾  Upserting ${rows.length} alunos no Supabase...`)
  let processed = 0
  const upsertErrors: string[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('students')
      .upsert(batch, { onConflict: 'moodle_id', ignoreDuplicates: false })

    if (error) {
      upsertErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
    } else {
      processed += batch.length
      process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} — ${processed}/${rows.length}\r`)
    }
  }
  console.log()

  // ─── Preencher phone/CPF ───────────────────────────────────────────────────
  const withContact = Array.from(studentMap.values()).filter(s => s.phone1 || s.phone2 || s.idnumber)
  if (withContact.length > 0) {
    console.log(`\n📞  Preenchendo phone/CPF para ${withContact.length} alunos com dados no Moodle...`)

    const { data: needsFill } = await supabase
      .from('students')
      .select('id, moodle_id, phone, cpf')
      .in('moodle_id', withContact.map(s => s.id))
      .or('phone.is.null,cpf.is.null')

    let filled = 0
    for (const row of needsFill ?? []) {
      const source = studentMap.get(row.moodle_id)
      if (!source) continue

      const update: Record<string, string | null> = {}
      if (!row.phone && source.phone1) {
        const n = normalizePhone(source.phone1)
        if (n) update.phone = n
      }
      if (!row.phone && !update.phone && source.phone2) {
        const n = normalizePhone(source.phone2)
        if (n) update.phone = n
      }
      if (!row.cpf && source.idnumber) {
        const n = normalizeCpf(source.idnumber)
        if (n) update.cpf = n
      }

      if (Object.keys(update).length > 0) {
        await supabase.from('students').update(update).eq('id', row.id)
        filled++
      }
    }
    console.log(`  ${filled} registros atualizados com phone/CPF`)
  }

  // ─── Resultado ────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log(`✅  Sync concluída!`)
  console.log(`    Alunos únicos:     ${rows.length}`)
  console.log(`    Upsertados:        ${processed}`)
  console.log(`    Cursos escaneados: ${SYNC_COURSE_IDS.length}`)
  if (upsertErrors.length > 0) {
    console.warn(`    Erros de upsert:   ${upsertErrors.length}`)
    upsertErrors.forEach(e => console.warn(`      ${e}`))
  }
  if (errors.length > 0) {
    console.warn(`    Cursos com falha:  ${errors.length}`)
  }
  console.log('─'.repeat(50) + '\n')
}

main().catch(err => {
  console.error('❌  Erro fatal:', err)
  process.exit(1)
})
