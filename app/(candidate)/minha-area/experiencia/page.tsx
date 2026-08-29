import Link from 'next/link'
import { ArrowLeft, BriefcaseBusiness } from 'lucide-react'
import { CandidateExperienceManager, type CandidateExperienceEntry } from '@/components/candidate-experience-manager'
import { createClient } from '@/lib/supabase/server'

type Row = { id: string; employment_type: string; institution: string; role_title: string; starts_on: string; ends_on: string | null; is_teaching: boolean }
type Summary = { total_unique_days: number; total_months: number; remaining_days: number }

export default async function CandidateExperiencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [rowsResult, summaryResult] = await Promise.all([
    supabase.from('sigec_candidate_experience').select('id, employment_type, institution, role_title, starts_on, ends_on, is_teaching').eq('candidate_id', user.id).order('starts_on', { ascending: false }),
    supabase.rpc('sigec_candidate_teaching_experience_summary', { p_candidate_id: user.id }).maybeSingle(),
  ])
  const entries: CandidateExperienceEntry[] = ((rowsResult.data || []) as Row[]).map(row => ({ id: row.id, employmentType: row.employment_type, institution: row.institution, roleTitle: row.role_title, startsOn: row.starts_on, endsOn: row.ends_on || '', isTeaching: row.is_teaching }))
  const summary = summaryResult.data as Summary | null
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
    <Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074] hover:text-[#315f9d]"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link>
    <div className="mt-7 border-b border-[#d9e0e7] pb-7"><p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-[#315f9d]"><BriefcaseBusiness className="h-4 w-4" /> Experiência profissional</p><h1 className="mt-2 font-display text-3xl font-bold text-[#172033] sm:text-4xl">Registre sua experiência docente.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#657084]">Períodos sobrepostos são consolidados pelo banco e cada dia docente entra no total uma única vez.</p></div>
    <div className="mt-8"><CandidateExperienceManager entries={entries} totalDays={summary?.total_unique_days || 0} totalMonths={summary?.total_months || 0} remainingDays={summary?.remaining_days || 0} /></div>
  </main>
}
