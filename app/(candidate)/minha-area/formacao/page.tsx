import Link from 'next/link'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import { CandidateEducationManager, type CandidateEducationEntry } from '@/components/candidate-education-manager'
import { createClient } from '@/lib/supabase/server'

type EducationRow = {
  id: string
  level: string
  course_name: string
  institution: string
  started_on: string | null
  completion_date: string | null
  is_completed: boolean
  workload_hours: number | null
}

export default async function CandidateEducationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('sigec_candidate_education')
    .select('id, level, course_name, institution, started_on, completion_date, is_completed, workload_hours')
    .eq('candidate_id', user.id)
    .order('is_completed', { ascending: false })
    .order('completion_date', { ascending: false, nullsFirst: false })

  const entries: CandidateEducationEntry[] = ((data || []) as EducationRow[]).map((row) => ({
    id: row.id,
    level: row.level,
    courseName: row.course_name,
    institution: row.institution,
    startedOn: row.started_on || '',
    completionDate: row.completion_date || '',
    isCompleted: row.is_completed,
    workloadHours: row.workload_hours,
  }))

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074] transition hover:text-[#315f9d]">
        <ArrowLeft className="h-4 w-4" /> Voltar para minha área
      </Link>
      <div className="mt-7 flex flex-col justify-between gap-5 border-b border-[#d9e0e7] pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#315f9d]">Formação acadêmica</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#172033] sm:text-4xl">Conte sua trajetória de formação.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#657084]">Licenciatura, bacharelado, tecnólogo, formação ou complementação pedagógica ficam separados para facilitar a análise dos requisitos.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b9cce6] bg-[#edf3fb] px-3.5 py-2 text-xs font-extrabold text-[#315f9d]"><BadgeCheck className="h-4 w-4" /> {entries.length} {entries.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div className="mt-8"><CandidateEducationManager entries={entries} /></div>
    </main>
  )
}
