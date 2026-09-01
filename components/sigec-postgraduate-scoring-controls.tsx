'use client'

import { useMemo, useState, useTransition } from 'react'
import { Award, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { reviewSigecPostgraduateEvidence } from '@/app/(dashboard)/sigec-candidaturas/[id]/actions'
import { formatSigecDate, type SigecApplicationDetail, type SigecPostgraduateEducation, type SigecPostgraduateReview, type SigecPostgraduateScore } from '@/lib/sigec-application-detail'

const levelLabels = { especializacao: 'Especialização', mestrado: 'Mestrado', doutorado: 'Doutorado' }
const levelPoints = { especializacao: 20, mestrado: 25, doutorado: 30 }

export function SigecPostgraduateScoringControls({ applicationId, applicationState, education, reviews, score, documents }: {
  applicationId: string
  applicationState: string
  education: SigecPostgraduateEducation[]
  reviews: SigecPostgraduateReview[]
  score: SigecPostgraduateScore
  documents: SigecApplicationDetail['documents']
}) {
  const router = useRouter()
  const [educationId, setEducationId] = useState(education[0]?.id || '')
  const [documentId, setDocumentId] = useState('')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const approvedDocuments = useMemo(() => documents.filter((item) => item.isCurrent && !item.removedAt && item.technicalStatus === 'validated' && item.malwareStatus === 'clean' && item.reviewStatus === 'valid'), [documents])
  const latestReviews = useMemo(() => new Map(reviews.map((item) => [item.education_id, item])), [reviews])
  const disabled = applicationState !== 'submitted' || !educationId || !documentId || pending

  function submit(decision: 'eligible' | 'rejected') {
    setFeedback(null)
    startTransition(async () => {
      const result = await reviewSigecPostgraduateEvidence({ applicationId, educationId, documentId, decision, publicReason: reason })
      setFeedback({ error: Boolean(result.error), text: result.error || result.success || '' })
      if (result.success) { setReason(''); router.refresh() }
    })
  }

  return <section className="overflow-hidden rounded-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
      <div className="flex gap-3"><Award className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'hsl(var(--accent-blue))' }} /><div><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Pontuação de pós-graduação</h2><p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg3))' }}>Vale somente o maior título aprovado: especialização 20, mestrado 25 ou doutorado 30. Os pontos não são somados.</p></div></div>
      <div className="shrink-0 rounded-xl px-4 py-3 text-center" style={{ background: 'hsl(var(--accent-blue) / .1)', border: '1px solid hsl(var(--accent-blue) / .25)' }}><p className="font-data text-2xl font-bold" style={{ color: 'hsl(var(--accent-blue))' }}>{Number(score.points)}<span className="text-sm font-medium">/30</span></p><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'hsl(var(--fg3))' }}>{score.selected_level ? levelLabels[score.selected_level] : 'Sem título aprovado'}</p></div>
    </header>
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[.12em]" style={{ color: 'hsl(var(--fg3))' }}>Formações concluídas</h3>
        {education.length ? <div className="mt-3 space-y-2">{education.map((item) => { const review = latestReviews.get(item.id); return <div key={item.id} className="rounded-xl p-3" style={{ background: 'hsl(var(--muted) / .55)', border: '1px solid hsl(var(--border))' }}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{item.course_name}</p><p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>{levelLabels[item.level]} · {item.institution} · concluído em {formatSigecDate(item.completion_date)}</p></div><span className="shrink-0 text-xs font-bold" style={{ color: review?.decision === 'eligible' ? 'hsl(var(--accent-green))' : review?.decision === 'rejected' ? 'hsl(var(--accent-red))' : 'hsl(var(--fg3))' }}>{review?.decision === 'eligible' ? `${levelPoints[item.level]} pontos` : review?.decision === 'rejected' ? 'Não aceito' : 'Não analisado'}</span></div>{review?.public_reason && <p className="mt-2 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>Motivo: {review.public_reason}</p>}</div>})}</div> : <p className="mt-3 rounded-xl p-4 text-sm" style={{ background: 'hsl(var(--muted) / .55)', color: 'hsl(var(--fg3))' }}>O candidato não informou uma pós-graduação concluída.</p>}
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Formação<select value={educationId} onChange={(event) => setEducationId(event.target.value)} disabled={pending || !education.length} className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }}><option value="">Selecione</option>{education.map((item) => <option key={item.id} value={item.id}>{levelLabels[item.level]} — {item.course_name}</option>)}</select></label>
        <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Documento aprovado<select value={documentId} onChange={(event) => setDocumentId(event.target.value)} disabled={pending || !approvedDocuments.length} className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }}><option value="">Selecione</option>{approvedDocuments.map((item) => <option key={item.documentId} value={item.documentId}>{item.requirementLabel} · versão {item.version}</option>)}</select></label>
        {!approvedDocuments.length && <p className="text-xs leading-5" style={{ color: 'hsl(var(--accent-amber))' }}>Aprove primeiro o documento que comprova a titulação.</p>}
        <label className="block text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Motivo, somente se não aceitar<textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} maxLength={2000} rows={3} className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }} placeholder="Explique de forma simples para o candidato." /></label>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => submit('eligible')} disabled={disabled || Boolean(reason.trim())} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'hsl(var(--accent-green))', color: 'white' }}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar título</button><button type="button" onClick={() => submit('rejected')} disabled={disabled || reason.trim().length < 3} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'hsl(var(--accent-red))', color: 'white' }}><XCircle className="mr-2 h-4 w-4" />Não aceitar</button></div>
        {feedback && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: feedback.error ? 'hsl(var(--accent-red) / .08)' : 'hsl(var(--accent-green) / .1)', color: feedback.error ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{feedback.text}</p>}
      </div>
    </div>
  </section>
}
