import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { SigecProcessForm } from '@/components/sigec-process-form'
import { SigecArchiveButton } from '@/components/sigec-archive-button'
import { SigecProcessPublicationPanel, type SigecPublicationReadiness } from '@/components/sigec-process-publication-panel'
import {
  SigecVacancyConfiguration,
  type SigecModalityRow,
  type SigecVacancyRow,
} from '@/components/sigec-vacancy-configuration'
import { SIGEC_PROVISIONAL_SCORING } from '@/lib/sigec-scoring'

export const dynamic = 'force-dynamic'

type ProcessDetail = {
  id: string
  title: string
  slug: string
  summary: string | null
  description: string | null
  status: 'draft' | 'open' | 'closed' | 'archived'
  edital_version: string
  applications_open_at: string | null
  applications_close_at: string | null
  published_at: string | null
  max_preferences: number
  updated_at: string
}

const statusLabels: Record<ProcessDetail['status'], string> = {
  draft: 'Rascunho',
  open: 'Aberto',
  closed: 'Encerrado',
  archived: 'Arquivado',
}

export default async function SigecProcessDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const [processResult, readinessResult, modalitiesResult, vacanciesResult, requirementsResult] = await Promise.all([
    supabase
      .from('sigec_processes')
      .select('id, title, slug, summary, description, status, edital_version, applications_open_at, applications_close_at, published_at, max_preferences, updated_at')
      .eq('id', params.id)
      .maybeSingle(),
    adminClient.rpc('sigec_get_process_publication_readiness', { p_process_id: params.id }),
    supabase.from('sigec_modalities').select('id, name, slug, description').eq('process_id', params.id).order('position'),
    supabase.from('sigec_vacancies').select('id, modality_id, course_id, municipality, vacancy_kind, vacancy_count, active, course:sigec_courses(canonical_name)').eq('process_id', params.id).order('municipality'),
    supabase.from('sigec_process_course_requirements').select('course_id, accepted_education, proof_instructions').eq('process_id', params.id),
  ])

  if (processResult.error || !processResult.data) notFound()
  const process = processResult.data as ProcessDetail
  const editable = process.status === 'draft'
  const readiness = readinessResult.error
    ? [{ code: 'readiness_unavailable', label: 'Validação indisponível', ready: false, detail: 'Aplique a migração da Fase 2 antes de publicar.' }]
    : (readinessResult.data ?? []) as SigecPublicationReadiness[]
  const modalities = (modalitiesResult.data ?? []) as SigecModalityRow[]
  const requirements = new Map((requirementsResult.data ?? []).map((item) => [item.course_id, item]))
  const vacancies = (vacanciesResult.data ?? []).map((item) => ({
    id: item.id,
    modality_id: item.modality_id,
    municipality: item.municipality,
    vacancy_kind: item.vacancy_kind,
    vacancy_count: item.vacancy_count,
    active: item.active,
    course: Array.isArray(item.course) ? item.course[0] ?? null : item.course,
    requirement: requirements.get(item.course_id) ?? null,
  })) as SigecVacancyRow[]

  return (
    <>
      <div className="app-header">
        <div className="min-w-0">
          <Link href="/sigec-processos" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'hsl(var(--fg3))' }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Processos
          </Link>
          <h1 className="truncate">{process.title}</h1>
          <p className="app-subtitle">
            Edital {process.edital_version} · {process.published_at ? `publicado em ${new Date(process.published_at).toLocaleDateString('pt-BR')}` : `atualizado em ${new Date(process.updated_at).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="rounded-full px-3 py-1.5 text-xs font-bold uppercase" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}>
            {statusLabels[process.status]}
          </span>
          {(process.status === 'draft' || process.status === 'closed') && <SigecArchiveButton processId={process.id} />}
        </div>
      </div>

      <div className="app-content animate-fade-up space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
          <section className="rounded-xl p-5 sm:p-6" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Dados gerais</h2>
                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>O processo permanece privado enquanto estiver em rascunho.</p>
              </div>
              {!editable && <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Edição bloqueada</span>}
            </div>
            <SigecProcessForm
              disabled={!editable}
              initialValues={{
                id: process.id,
                title: process.title,
                slug: process.slug,
                summary: process.summary,
                description: process.description,
                editalVersion: process.edital_version,
                applicationsOpenAt: process.applications_open_at,
                applicationsCloseAt: process.applications_close_at,
                maxPreferences: process.max_preferences,
              }}
            />

            <div className="mt-8 border-t pt-7" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg p-2" style={{ background: 'hsl(var(--accent-amber) / .10)', color: 'hsl(var(--accent-amber))' }}>
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{SIGEC_PROVISIONAL_SCORING.groupLabel}</h2>
                    <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>
                      Rubrica {SIGEC_PROVISIONAL_SCORING.version} aprovada para testes internos. Não autoriza publicação oficial.
                    </p>
                  </div>
                </div>
                <span className="self-start rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'hsl(var(--accent-amber) / .12)', color: 'hsl(var(--accent-amber))' }}>
                  máximo {SIGEC_PROVISIONAL_SCORING.maxPoints} pontos
                </span>
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                {SIGEC_PROVISIONAL_SCORING.categories.map((category, index) => (
                  <div
                    key={category.code}
                    className="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_130px_80px] sm:items-center"
                    style={{
                      borderTop: index ? '1px solid hsl(var(--border))' : undefined,
                      background: index % 2 ? 'hsl(var(--muted) / .28)' : 'transparent',
                    }}
                  >
                    <span className="font-medium" style={{ color: 'hsl(var(--fg2))' }}>{category.label}</span>
                    <span style={{ color: 'hsl(var(--fg3))' }}>
                      {category.pointsPerUnit} pt{category.pointsPerUnit === 1 ? '' : 's'} / {category.unitSize} {category.unit === 'hours' ? 'horas' : 'item'}
                    </span>
                    <span className="font-data font-semibold sm:text-right" style={{ color: 'hsl(var(--fg1))' }}>até {category.maxPoints}</span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>
                Somente comprovantes validados e relacionados à vaga pontuam. O mesmo documento não pode ser contado duas vezes e requisitos obrigatórios não geram pontuação adicional.
              </p>
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-5">
            <SigecProcessPublicationPanel processId={process.id} status={process.status} readiness={readiness} />

            <section className="rounded-xl border p-5" style={{ borderColor: 'hsl(var(--accent-amber) / .35)', background: 'hsl(var(--accent-amber) / .06)' }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--accent-amber))' }}>Publicação protegida</p>
              <p className="mt-3 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>
                A transição é atômica e auditada. Enquanto as decisões normativas estiverem pendentes, o banco rejeita a publicação mesmo que a interface seja contornada.
              </p>
            </section>
          </aside>
        </div>
        <SigecVacancyConfiguration
          processId={process.id}
          editable={editable}
          modalities={modalities}
          vacancies={vacancies}
        />
      </div>
    </>
  )
}
