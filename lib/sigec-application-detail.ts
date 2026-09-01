export type SigecApplicationDetail = {
  application: {
    id: string
    candidateName: string
    processId: string
    processTitle: string
    applicationState: 'draft' | 'submitted' | 'withdrawn'
    stageId: string | null
    stageLabel: string | null
    scoreTotal: number | null
    submittedAt: string | null
    createdAt: string
    updatedAt: string
  }
  preferences: Array<{
    position: number
    municipality: string
    course: string
    modality: string
  }>
  answers: Array<{
    questionId: string
    label: string
    questionType: string
    answer: unknown
    updatedAt: string
  }>
  documents: Array<{
    documentId: string
    requirementId: string | null
    requirementLabel: string
    version: number
    mimeType: string
    sizeBytes: number
    technicalStatus: 'pending' | 'validated' | 'rejected'
    malwareStatus: 'pending' | 'clean' | 'infected' | 'error'
    reviewStatus: 'pending' | 'valid' | 'rejected'
    reviewMessage: string | null
    reviewedAt: string | null
    createdAt: string
    removedAt: string | null
    isCurrent: boolean
  }>
  consents: Array<{
    type: string
    documentVersion: string
    accepted: boolean
    acceptedAt: string
  }>
  submissions: Array<{
    version: number
    protocol: string
    editalVersion: string
    snapshotSha256: string
    submittedAt: string
    isCurrent: boolean
  }>
  history: Array<{
    fromStage: string | null
    toStage: string
    publicMessage: string | null
    changedByRole: string
    createdAt: string
  }>
}

export type SigecDocumentReview = {
  id: number
  document_id: string
  decision: 'valid' | 'rejected'
  public_reason: string | null
  internal_note: string | null
  created_at: string
}

export type SigecInformationRequest = {
  id: string
  message: string
  requested_fields: Array<{ kind: 'question' | 'document'; id: string }>
  due_at: string
  status: 'open' | 'answered' | 'accepted' | 'canceled'
  answered_at: string | null
  closed_at: string | null
  resolution_message: string | null
  created_at: string
}

export type SigecDiligenceOption = {
  id: string
  label: string
  required: boolean
}

export function formatSigecAnswer(answer: unknown) {
  if (answer === null || answer === undefined || answer === '') return 'Não informado'
  if (answer === true) return 'Sim'
  if (answer === false) return 'Não'
  if (Array.isArray(answer)) return answer.map(String).join(', ') || 'Não informado'
  if (typeof answer === 'object') return JSON.stringify(answer)
  return String(answer)
}

export function formatSigecDate(value: string | null, withTime = false) {
  if (!value) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }
    : { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }
  ).format(new Date(value))
}
