import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, ClipboardCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import { parseSigecApplicationListFilters, sigecApplicationListQuery, type SigecApplicationReviewRow } from '@/lib/sigec-application-list'
import { SigecApplicationFilters } from '@/components/sigec-application-filters'
import { SigecApplicationReviewList } from '@/components/sigec-application-review-list'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 25

function uniqueOptions(items: { id: string; label: string }[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

export default async function SigecApplicationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !['admin', 'gerente'].includes(extractRole(user))) redirect('/acesso-negado')

  const filters = parseSigecApplicationListFilters(searchParams)
  const admin = getAdminClient()
  let vacanciesQuery = admin.from('sigec_vacancies').select('process_id, municipality, course_id, modality_id, sigec_courses(canonical_name), sigec_modalities(name)').eq('active', true).limit(2000)
  let stagesQuery = admin.from('sigec_process_stages').select('id, process_id, label').order('position').limit(500)
  if (filters.processId) {
    vacanciesQuery = vacanciesQuery.eq('process_id', filters.processId)
    stagesQuery = stagesQuery.eq('process_id', filters.processId)
  }
  const [listResult, processesResult, vacanciesResult, stagesResult] = await Promise.all([
    admin.rpc('sigec_list_applications_for_review', {
      p_actor_id: user.id, p_page: filters.page, p_page_size: PAGE_SIZE,
      p_process_id: filters.processId || null, p_municipality: filters.municipality || null,
      p_course_id: filters.courseId || null, p_modality_id: filters.modalityId || null,
      p_competition: filters.competition, p_application_state: filters.state || null,
      p_stage_id: filters.stageId || null, p_pending: filters.pending, p_search: filters.search || null,
    }),
    admin.from('sigec_processes').select('id, title').neq('status', 'archived').order('created_at', { ascending: false }).limit(200),
    vacanciesQuery,
    stagesQuery,
  ])

  const rows = (listResult.data || []) as SigecApplicationReviewRow[]
  const total = Number(rows[0]?.total_count || 0)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const vacancyRows = (vacanciesResult.data || []) as any[]
  const processes = (processesResult.data || []).map((item) => ({ id: item.id, label: item.title }))
  const municipalities = Array.from(new Set(vacancyRows.map((item) => String(item.municipality)))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const courses = uniqueOptions(vacancyRows.map((item) => ({ id: String(item.course_id), label: String(item.sigec_courses?.canonical_name || 'Curso') })))
  const modalities = uniqueOptions(vacancyRows.map((item) => ({ id: String(item.modality_id), label: String(item.sigec_modalities?.name || 'Modalidade') })))
  const stages = uniqueOptions((stagesResult.data || []).map((item) => ({ id: item.id, label: item.label })))
  const previousQuery = sigecApplicationListQuery(filters, Math.max(1, filters.page - 1))
  const nextQuery = sigecApplicationListQuery(filters, Math.min(pages, filters.page + 1))

  return <>
    <div className="app-header"><div><h1>Candidaturas</h1><p className="app-subtitle">Fila de triagem do SIGEC Processos</p></div><Link href="/sigec-processos" className="ds-btn ds-btn--secondary">Configurar processos</Link></div>
    <div className="app-content animate-fade-up space-y-5">
      <header className="relative overflow-hidden rounded-2xl px-5 py-6 sm:px-7" style={{ background: 'linear-gradient(120deg, hsl(var(--card)), hsl(var(--accent-green) / .07))', border: '1px solid hsl(var(--border))' }}><div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em]" style={{ color: 'hsl(var(--accent-green))' }}><ClipboardCheck className="h-4 w-4" /> Análise administrativa</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'hsl(var(--fg1))' }}>Encontre quem precisa de atenção.</h2><p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'hsl(var(--fg2))' }}>Filtre por processo, vaga, concorrência, etapa ou pendência. Dados pessoais sensíveis e conteúdo dos documentos não aparecem nesta lista.</p></div><div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'hsl(var(--bg) / .65)', border: '1px solid hsl(var(--border))' }}><Users className="h-5 w-5" style={{ color: 'hsl(var(--accent-blue))' }} /><div><p className="font-data text-xl" style={{ color: 'hsl(var(--fg1))' }}>{total.toLocaleString('pt-BR')}</p><p className="text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>resultado(s)</p></div></div></div></header>
      <SigecApplicationFilters filters={filters} processes={processes} municipalities={municipalities} courses={courses} modalities={modalities} stages={stages} />
      {listResult.error ? <div className="rounded-xl p-5 text-sm" style={{ background: 'hsl(var(--accent-red) / .08)', border: '1px solid hsl(var(--accent-red) / .35)', color: 'hsl(var(--fg1))' }}>Não foi possível carregar as candidaturas. Tente novamente.</div> : <SigecApplicationReviewList rows={rows} startIndex={(filters.page - 1) * PAGE_SIZE + 1} />}
      {total > 0 && <nav aria-label="Paginação" className="flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}><p className="text-xs" style={{ color: 'hsl(var(--fg3))' }}>Página {filters.page} de {pages} · exibindo {rows.length} de {total}</p><div className="flex gap-2"><Link aria-disabled={filters.page <= 1} tabIndex={filters.page <= 1 ? -1 : undefined} href={filters.page <= 1 ? '#' : `/sigec-candidaturas?${previousQuery}`} className={`ds-btn ds-btn--secondary min-h-10 ${filters.page <= 1 ? 'pointer-events-none opacity-45' : ''}`}><ChevronLeft className="h-4 w-4" /> Anterior</Link><Link aria-disabled={filters.page >= pages} tabIndex={filters.page >= pages ? -1 : undefined} href={filters.page >= pages ? '#' : `/sigec-candidaturas?${nextQuery}`} className={`ds-btn ds-btn--secondary min-h-10 ${filters.page >= pages ? 'pointer-events-none opacity-45' : ''}`}>Próxima <ChevronRight className="h-4 w-4" /></Link></div></nav>}
    </div>
  </>
}
