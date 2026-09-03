import { CheckCircle2, ClipboardList, Clock3, FileCheck2, FileText, History, MapPin, ShieldCheck } from 'lucide-react'
import {
  formatSigecAnswer,
  formatSigecDate,
  type SigecApplicationDetail,
  type SigecAcademicProductionReview,
  type SigecAcademicProductionScore,
  type SigecAdvancementReadiness,
  type SigecDiligenceOption,
  type SigecDisqualificationDecision,
  type SigecDisqualificationReason,
  type SigecDocumentReview,
  type SigecInformationRequest,
  type SigecExperienceReview,
  type SigecExperienceScore,
  type SigecPostgraduateEducation,
  type SigecPostgraduateReview,
  type SigecPostgraduateScore,
  type SigecStageOption,
  type SigecTeachingExperience,
} from '@/lib/sigec-application-detail'
import { SigecDocumentReviewControls } from '@/components/sigec-document-review-controls'
import { SigecDiligenceManager } from '@/components/sigec-diligence-manager'
import { SigecStageAdvanceControls } from '@/components/sigec-stage-advance-controls'
import { SigecDisqualificationControls } from '@/components/sigec-disqualification-controls'
import { SigecPostgraduateScoringControls } from '@/components/sigec-postgraduate-scoring-controls'
import { SigecExperienceScoringControls } from '@/components/sigec-experience-scoring-controls'
import { SigecAcademicProductionScoringControls } from '@/components/sigec-academic-production-scoring-controls'

const stateLabels = { draft: 'Em preenchimento', submitted: 'Enviada', withdrawn: 'Retirada' }
const consentLabels: Record<string, string> = {
  edital: 'Leitura do edital', truthfulness: 'Declaração de veracidade', requirements: 'Atendimento aos requisitos',
  lgpd: 'Aviso de privacidade', ppi: 'Autodeclaração PPP', pcd: 'Declaração PCD',
}
const roleLabels: Record<string, string> = { admin: 'Administração', gerente: 'Gerência', candidato: 'Candidato', sistema: 'Sistema' }

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <header className="flex items-center gap-2 px-4 py-3.5 sm:px-5" style={{ borderBottom: '1px solid hsl(var(--border))' }}><span style={{ color: 'hsl(var(--accent-blue))' }}>{icon}</span><h2 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{title}</h2></header>
    {children}
  </section>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm sm:px-5" style={{ color: 'hsl(var(--fg3))' }}>{children}</p>
}

function DocumentStatus({ document }: { document: SigecApplicationDetail['documents'][number] }) {
  if (document.removedAt) return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--fg3))' }}>Removido pelo candidato</span>
  if (document.malwareStatus === 'infected' || document.technicalStatus === 'rejected') return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-red))' }}>Arquivo bloqueado</span>
  if (document.technicalStatus !== 'validated' || document.malwareStatus !== 'clean') return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Verificação em andamento</span>
  if (document.reviewStatus === 'valid') return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-green))' }}>Documento aprovado</span>
  if (document.reviewStatus === 'rejected') return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-red))' }}>Documento não aceito</span>
  return <span className="text-xs font-semibold" style={{ color: 'hsl(var(--accent-amber))' }}>Aguardando análise</span>
}

export function SigecApplicationReviewDetail({ detail, reviews, requests, diligenceQuestions, diligenceDocuments, advancementReadiness, nextStages, disqualificationReasons, disqualificationDecision, postgraduateEducation, postgraduateReviews, postgraduateScore, teachingExperience, experienceReviews, experienceScore, academicReviews, academicScore }: {
  detail: SigecApplicationDetail
  reviews: SigecDocumentReview[]
  requests: SigecInformationRequest[]
  diligenceQuestions: SigecDiligenceOption[]
  diligenceDocuments: SigecDiligenceOption[]
  advancementReadiness: SigecAdvancementReadiness
  nextStages: SigecStageOption[]
  disqualificationReasons: SigecDisqualificationReason[]
  disqualificationDecision: SigecDisqualificationDecision | null
  postgraduateEducation: SigecPostgraduateEducation[]
  postgraduateReviews: SigecPostgraduateReview[]
  postgraduateScore: SigecPostgraduateScore
  teachingExperience: SigecTeachingExperience[]
  experienceReviews: SigecExperienceReview[]
  experienceScore: SigecExperienceScore
  academicReviews: SigecAcademicProductionReview[]
  academicScore: SigecAcademicProductionScore
}) {
  const { application } = detail
  return <div className="space-y-5">
    <section className="rounded-2xl p-5 sm:p-7" style={{ background: 'linear-gradient(120deg, hsl(var(--card)), hsl(var(--accent-blue) / .07))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: 'hsl(var(--accent-green))' }}>{application.processTitle}</p><h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'hsl(var(--fg1))' }}>{application.candidateName}</h1><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'hsl(var(--accent-blue) / .12)', color: 'hsl(var(--accent-blue))' }}>{stateLabels[application.applicationState]}</span><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}>{application.stageLabel || 'Sem etapa definida'}</span></div></div><div className="grid grid-cols-2 gap-3 sm:flex"><div className="min-w-32 rounded-xl px-4 py-3" style={{ background: 'hsl(var(--bg) / .7)', border: '1px solid hsl(var(--border))' }}><p className="text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>Enviada em</p><p className="mt-1 text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{formatSigecDate(application.submittedAt, true)}</p></div><div className="min-w-32 rounded-xl px-4 py-3" style={{ background: 'hsl(var(--bg) / .7)', border: '1px solid hsl(var(--border))' }}><p className="text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>Pontuação atual</p><p className="mt-1 font-data text-lg" style={{ color: 'hsl(var(--fg1))' }}>{application.scoreTotal === null ? 'Não avaliada' : application.scoreTotal.toLocaleString('pt-BR')}</p></div></div></div>
    </section>

    <SigecDiligenceManager applicationId={application.id} applicationState={application.applicationState} requests={requests} questions={diligenceQuestions} documents={diligenceDocuments} />

    <SigecPostgraduateScoringControls applicationId={application.id} applicationState={application.applicationState} education={postgraduateEducation} reviews={postgraduateReviews} score={postgraduateScore} documents={detail.documents} />

    <SigecExperienceScoringControls applicationId={application.id} applicationState={application.applicationState} experience={teachingExperience} reviews={experienceReviews} score={experienceScore} documents={detail.documents} />

    <SigecAcademicProductionScoringControls applicationId={application.id} applicationState={application.applicationState} reviews={academicReviews} score={academicScore} documents={detail.documents} />

    {!disqualificationDecision && <SigecStageAdvanceControls applicationId={application.id} readiness={advancementReadiness} stages={nextStages} />}

    <SigecDisqualificationControls applicationId={application.id} applicationState={application.applicationState} reasons={disqualificationReasons} decision={disqualificationDecision} />

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
      <div className="space-y-5">
        <Panel title="Opções de vaga" icon={<MapPin className="h-4 w-4" />}>{detail.preferences.length ? <ol className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{detail.preferences.map((item) => <li key={item.position} className="flex gap-3 px-4 py-4 sm:px-5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-data text-xs" style={{ background: 'hsl(var(--accent-blue) / .12)', color: 'hsl(var(--accent-blue))' }}>{item.position}</span><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{item.course}</p><p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>{item.modality} · {item.municipality}</p></div></li>)}</ol> : <Empty>Nenhuma opção de vaga registrada.</Empty>}</Panel>

        <Panel title="Respostas da candidatura" icon={<ClipboardList className="h-4 w-4" />}>{detail.answers.length ? <dl className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{detail.answers.map((item) => <div key={item.questionId} className="px-4 py-4 sm:px-5"><dt className="text-xs font-semibold" style={{ color: 'hsl(var(--fg3))' }}>{item.label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6" style={{ color: 'hsl(var(--fg1))' }}>{formatSigecAnswer(item.answer)}</dd></div>)}</dl> : <Empty>Nenhuma resposta registrada.</Empty>}</Panel>

        <Panel title="Documentos enviados" icon={<FileCheck2 className="h-4 w-4" />}>{detail.documents.length ? <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{detail.documents.map((document) => { const documentReviews = reviews.filter((review) => review.document_id === document.documentId); const canReview = document.isCurrent && !document.removedAt && document.technicalStatus === 'validated' && document.malwareStatus === 'clean' && application.applicationState === 'submitted'; return <article key={document.documentId} className="px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{document.requirementLabel}</h3>{document.isCurrent && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'hsl(var(--accent-green) / .12)', color: 'hsl(var(--accent-green))' }}>Versão atual</span>}</div><p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Versão {document.version} · {(document.sizeBytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB · enviada em {formatSigecDate(document.createdAt, true)}</p>{document.reviewMessage && <p className="mt-3 rounded-lg px-3 py-2 text-xs leading-5" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}>{document.reviewMessage}</p>}</div><DocumentStatus document={document} /></div>{documentReviews.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}>Histórico de análise ({documentReviews.length})</summary><div className="mt-2 space-y-2">{documentReviews.map((review) => <div key={review.id} className="rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--fg2))' }}><p className="font-semibold">{review.decision === 'valid' ? 'Aprovado' : 'Não aceito'} · {formatSigecDate(review.created_at, true)}</p>{review.public_reason && <p className="mt-1">Motivo ao candidato: {review.public_reason}</p>}{review.internal_note && <p className="mt-1">Nota interna: {review.internal_note}</p>}</div>)}</div></details>}{canReview && <SigecDocumentReviewControls applicationId={application.id} documentId={document.documentId} />}</article> })}</div> : <Empty>Nenhum documento enviado.</Empty>}</Panel>
      </div>

      <aside className="space-y-5">
        <Panel title="Protocolos e versões" icon={<FileText className="h-4 w-4" />}>{detail.submissions.length ? <ol className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{detail.submissions.map((item) => <li key={item.version} className="px-4 py-4 sm:px-5"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Envio {item.version}</span>{item.isCurrent && <span className="text-[10px] font-bold uppercase" style={{ color: 'hsl(var(--accent-green))' }}>Atual</span>}</div><p className="mt-2 break-all font-data text-xs" style={{ color: 'hsl(var(--fg1))' }}>{item.protocol}</p><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{formatSigecDate(item.submittedAt, true)} · Edital {item.editalVersion}</p></li>)}</ol> : <Empty>A candidatura ainda não foi enviada.</Empty>}</Panel>

        <Panel title="Aceites registrados" icon={<ShieldCheck className="h-4 w-4" />}>{detail.consents.length ? <ul className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{detail.consents.map((item, index) => <li key={`${item.type}-${item.documentVersion}-${index}`} className="flex gap-3 px-4 py-4 sm:px-5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--accent-green))' }} /><div><p className="text-xs font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{consentLabels[item.type] || item.type}</p><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{item.documentVersion} · {formatSigecDate(item.acceptedAt, true)}</p></div></li>)}</ul> : <Empty>Nenhum aceite registrado.</Empty>}</Panel>

        <Panel title="Histórico de andamento" icon={<History className="h-4 w-4" />}>{detail.history.length ? <ol className="px-4 py-4 sm:px-5">{detail.history.map((item, index) => <li key={`${item.createdAt}-${index}`} className="relative border-l pb-6 pl-5 last:pb-0" style={{ borderColor: 'hsl(var(--border))' }}><span className="absolute -left-1.5 top-0 h-3 w-3 rounded-full" style={{ background: 'hsl(var(--accent-blue))', boxShadow: '0 0 0 4px hsl(var(--card))' }} /><p className="text-xs font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{item.fromStage ? `${item.fromStage} → ${item.toStage}` : item.toStage}</p>{item.publicMessage && <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--fg2))' }}>{item.publicMessage}</p>}<p className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--fg3))' }}><Clock3 className="h-3 w-3" /> {formatSigecDate(item.createdAt, true)} · {roleLabels[item.changedByRole] || 'Equipe'}</p></li>)}</ol> : <Empty>Nenhuma mudança de etapa registrada.</Empty>}</Panel>
      </aside>
    </div>
  </div>
}
