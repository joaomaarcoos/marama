import { z } from 'zod'

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const optionalUuid = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().uuid().optional().catch(undefined),
)
const optionalText = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().trim().max(100).optional().catch(undefined),
)

const FiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  processId: optionalUuid,
  municipality: optionalText,
  courseId: optionalUuid,
  modalityId: optionalUuid,
  competition: z.enum(['all', 'geral', 'pcd', 'ppp']).catch('all'),
  state: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.enum(['draft', 'submitted', 'withdrawn']).optional().catch(undefined),
  ),
  stageId: optionalUuid,
  pending: z.enum(['all', 'with', 'without']).catch('all'),
  search: optionalText,
})

export type SigecApplicationListFilters = z.infer<typeof FiltersSchema>

export function parseSigecApplicationListFilters(searchParams: Record<string, string | string[] | undefined>) {
  return FiltersSchema.parse(Object.fromEntries(Object.keys(searchParams).map((key) => [key, first(searchParams[key]) || ''])))
}

export function sigecApplicationListQuery(filters: SigecApplicationListFilters, page = filters.page) {
  const params = new URLSearchParams()
  const entries: [string, string | number | undefined][] = [
    ['page', page > 1 ? page : undefined],
    ['processId', filters.processId],
    ['municipality', filters.municipality],
    ['courseId', filters.courseId],
    ['modalityId', filters.modalityId],
    ['competition', filters.competition !== 'all' ? filters.competition : undefined],
    ['state', filters.state],
    ['stageId', filters.stageId],
    ['pending', filters.pending !== 'all' ? filters.pending : undefined],
    ['search', filters.search],
  ]
  for (const [key, value] of entries) if (value !== undefined && value !== '') params.set(key, String(value))
  return params.toString()
}

export type SigecApplicationReviewRow = {
  application_id: string
  candidate_name: string
  process_id: string
  process_title: string
  application_state: 'draft' | 'submitted' | 'withdrawn'
  stage_id: string | null
  stage_label: string | null
  protocol: string | null
  submitted_at: string | null
  created_at: string
  score_total: number | null
  competition_scopes: ('geral' | 'pcd' | 'ppp')[]
  preferences: { position: number; vacancyId: string; municipality: string; courseId: string; course: string; modalityId: string; modality: string }[]
  open_request_count: number
  overdue_request_count: number
  pending_document_count: number
  has_pending: boolean
  total_count: number
}
