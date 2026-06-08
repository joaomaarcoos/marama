import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getEnrolledStudents, SYNC_COURSE_IDS } from '@/lib/moodle'
import { syncContactsSnapshot } from '@/lib/contacts'
import { normalizePhone, normalizeCpf } from '@/lib/utils'

const BATCH_SIZE = 100
const MOODLE_CONCURRENCY = 8

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const errors: string[] = []

  try {
    // ─── Coletar alunos únicos de todos os cursos em paralelo ─────────────────
    const studentMap = new Map<number, {
      id: number
      fullname: string
      email: string
      username: string
      phone1: string | null
      phone2: string | null
      idnumber: string | null
      courses: { id: number; fullname: string; shortname: string }[]
    }>()

    // Processar cursos em lotes paralelos para não sobrecarregar o Moodle
    for (let i = 0; i < SYNC_COURSE_IDS.length; i += MOODLE_CONCURRENCY) {
      const chunk = SYNC_COURSE_IDS.slice(i, i + MOODLE_CONCURRENCY)
      const results = await Promise.allSettled(
        chunk.map(courseId => getEnrolledStudents(courseId))
      )

      results.forEach((result, idx) => {
        const courseId = chunk[idx]
        if (result.status === 'rejected') {
          errors.push(`Curso ${courseId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
          return
        }

        for (const s of result.value) {
          if (studentMap.has(s.id)) {
            const existing = studentMap.get(s.id)!
            const existingIds = new Set(existing.courses.map(c => c.id))
            for (const c of s.courses) {
              if (!existingIds.has(c.id)) existing.courses.push(c)
            }
            if (!existing.phone1 && s.phone1) existing.phone1 = s.phone1
            if (!existing.phone2 && s.phone2) existing.phone2 = s.phone2
            if (!existing.idnumber && s.idnumber) existing.idnumber = s.idnumber
          } else {
            studentMap.set(s.id, { ...s, courses: [...s.courses] })
          }
        }
      })
    }

    if (studentMap.size === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: `Nenhum aluno encontrado. Verifique as credenciais do Moodle. Erros: ${errors.join('; ')}` },
        { status: 502 }
      )
    }

    // ─── Upsert principal: campos que sempre vêm do Moodle ─────────────────────
    const coreRows = Array.from(studentMap.values()).map(s => ({
      moodle_id: s.id,
      full_name: s.fullname,
      email: s.email || null,
      username: s.username || null,
      courses: s.courses,
      last_synced_at: new Date().toISOString(),
    }))

    let processed = 0

    for (let i = 0; i < coreRows.length; i += BATCH_SIZE) {
      const batch = coreRows.slice(i, i + BATCH_SIZE)
      const { error } = await adminClient
        .from('students')
        .upsert(batch, { onConflict: 'moodle_id', ignoreDuplicates: false })

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        processed += batch.length
      }
    }

    // ─── Preencher phone/CPF quando vierem do Moodle e ainda não tiverem valor ──
    const moodleIdsWithContact = Array.from(studentMap.values())
      .filter(s => s.phone1 || s.phone2 || s.idnumber)
      .map(s => s.id)

    if (moodleIdsWithContact.length > 0) {
      const { data: needsFill } = await adminClient
        .from('students')
        .select('id, moodle_id, phone, cpf')
        .in('moodle_id', moodleIdsWithContact)
        .or('phone.is.null,cpf.is.null')

      for (const row of needsFill ?? []) {
        const source = studentMap.get(row.moodle_id)
        if (!source) continue

        const update: Record<string, string | null> = {}

        if (!row.phone && source.phone1) {
          const normalized = normalizePhone(source.phone1)
          if (normalized) update.phone = normalized
        }
        if (!row.phone && !update.phone && source.phone2) {
          const normalized = normalizePhone(source.phone2)
          if (normalized) update.phone = normalized
        }

        if (!row.cpf && source.idnumber) {
          const normalized = normalizeCpf(source.idnumber)
          if (normalized) update.cpf = normalized
        }

        if (Object.keys(update).length > 0) {
          const { error } = await adminClient
            .from('students')
            .update(update)
            .eq('id', row.id)

          if (error) {
            console.warn(`[MoodleSync] Erro ao preencher phone/cpf para student ${row.id}:`, error.message)
          }
        }
      }
    }

    // ─── Sincronizar snapshot de contatos (não bloqueia resposta em caso de erro) ─
    try {
      await syncContactsSnapshot(true)
    } catch (err) {
      errors.push(`Snapshot de contatos: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }

    return NextResponse.json({
      synced: coreRows.length,
      processed,
      errors,
      courses_scanned: SYNC_COURSE_IDS.length,
      courses_failed: errors.filter(e => e.startsWith('Curso ')).length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao sincronizar Moodle' },
      { status: 500 }
    )
  }
}
