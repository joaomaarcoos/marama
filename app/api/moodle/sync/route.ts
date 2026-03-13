import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getEnrolledStudents, SYNC_COURSE_IDS } from '@/lib/moodle'

const BATCH_SIZE = 100

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Collect unique students across all courses
    const studentMap = new Map<number, {
      id: number
      fullname: string
      email: string
      username: string
      courses: { id: number; fullname: string; shortname: string }[]
    }>()

    for (const courseId of SYNC_COURSE_IDS) {
      const enrolled = await getEnrolledStudents(courseId)
      for (const s of enrolled) {
        if (studentMap.has(s.id)) {
          // Merge courses (avoid duplicates)
          const existing = studentMap.get(s.id)!
          const existingIds = new Set(existing.courses.map(c => c.id))
          for (const c of s.courses) {
            if (!existingIds.has(c.id)) existing.courses.push(c)
          }
        } else {
          studentMap.set(s.id, { ...s, courses: [...s.courses] })
        }
      }
    }

    const allStudents = Array.from(studentMap.values()).map(s => ({
      moodle_id: s.id,
      full_name: s.fullname,
      email: s.email || null,
      username: s.username || null,
      courses: s.courses,
      last_synced_at: new Date().toISOString(),
      // phone is intentionally NOT included — manually managed
    }))

    // Batch upsert (preserves phone field since we don't include it)
    const errors: string[] = []
    let processed = 0

    for (let i = 0; i < allStudents.length; i += BATCH_SIZE) {
      const batch = allStudents.slice(i, i + BATCH_SIZE)
      const { error } = await adminClient
        .from('students')
        .upsert(batch, { onConflict: 'moodle_id', ignoreDuplicates: false })

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        processed += batch.length
      }
    }

    return NextResponse.json({
      synced: allStudents.length,
      processed,
      errors,
      courses_scanned: SYNC_COURSE_IDS.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao sincronizar Moodle' },
      { status: 500 }
    )
  }
}
