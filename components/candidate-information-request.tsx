'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, FileUp, LoaderCircle, MessageSquareWarning } from 'lucide-react'
import { answerInformationRequest } from '@/app/(candidate)/minha-area/inscricoes/[id]/actions'
import { CandidateQuestionInput, type CandidateQuestion } from '@/components/candidate-application-questions'

export type CandidateInformationRequestItem = {
  id: string
  message: string
  dueAt: string
  questions: CandidateQuestion[]
  documentLabels: string[]
  initialAnswers: Record<string, unknown>
}

export function CandidateInformationRequest({ request }: { request: CandidateInformationRequestItem }) {
  const router = useRouter()
  const [answers, setAnswers] = useState(request.initialAnswers)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await answerInformationRequest(request.id, answers)
      setFeedback({ type: result.type, message: result.message })
      if (result.type === 'success') router.refresh()
    })
  }

  return <section className="mt-8 overflow-hidden rounded-[24px] border border-[#d8aa45] bg-[#fff9e8] shadow-[0_22px_60px_-48px_rgba(92,61,0,.55)]">
    <div className="border-b border-[#ead69d] p-5 sm:p-7">
      <div className="flex items-start gap-3"><MessageSquareWarning className="mt-1 h-6 w-6 shrink-0 text-[#8a5b00]" /><div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#805500]">A equipe pediu mais informações</p><h2 className="mt-2 font-display text-2xl font-extrabold text-[#142038]">Confira o pedido e responda no prazo</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4f5968]">{request.message}</p><p className="mt-3 text-sm font-extrabold text-[#704c00]">Prazo: {new Date(request.dueAt).toLocaleString('pt-BR')}</p></div></div>
    </div>

    {request.questions.length > 0 && <div className="space-y-4 bg-white p-5 sm:p-7">{request.questions.map((question) => <div key={question.id} className="rounded-2xl border border-[#d9e0e7] bg-[#f8fafb] p-4"><p className="font-extrabold text-[#172033]">{question.label}</p>{question.helpText && <p className="mt-1 text-sm leading-6 text-[#657084]">{question.helpText}</p>}<CandidateQuestionInput question={question} value={answers[question.id]} locked={pending} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} /></div>)}</div>}

    <div className="p-5 sm:p-7">
      {request.documentLabels.length > 0 && <div className="flex flex-col gap-3 rounded-xl border border-[#dfc271] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileUp className="mt-0.5 h-5 w-5 shrink-0 text-[#805500]" /><div><p className="text-sm font-extrabold text-[#35465b]">Documentos solicitados</p><p className="mt-1 text-sm leading-6 text-[#657084]">{request.documentLabels.join(', ')}</p></div></div><Link href="/minha-area/documentos" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#225f9e] px-4 text-sm font-extrabold text-white">Enviar documentos</Link></div>}
      {feedback && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.type === 'success' ? 'border-[#85cdb4] bg-[#e8f8f1] text-[#075c43]' : 'border-[#e9a3a3] bg-[#fff0f0] text-[#922b2b]'}`}>{feedback.message}</p>}
      {request.questions.length > 0 && <button type="button" onClick={save} disabled={pending} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16775a] px-5 text-sm font-extrabold text-white disabled:opacity-50 sm:w-auto">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pending ? 'Salvando...' : 'Salvar respostas solicitadas'}</button>}
    </div>
  </section>
}
