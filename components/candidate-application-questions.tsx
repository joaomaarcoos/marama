'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { saveApplicationAnswers } from '@/app/(candidate)/minha-area/inscricoes/[id]/actions'
import { deriveSigecAudience, matchesSigecAudience, type SigecAudience } from '@/lib/sigec-application-conditions'

export type CandidateQuestion = {
  id: string
  label: string
  helpText: string
  type: 'short_text' | 'long_text' | 'single_choice' | 'multiple_choice' | 'boolean' | 'number' | 'date'
  required: boolean
  config: { audience?: SigecAudience; audienceMarker?: 'pcd' | 'ppp'; options?: string[] }
}

function normaliseInitial(questions: CandidateQuestion[], initialAnswers: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const question of questions) {
    const value = initialAnswers[question.id]
    if (value !== undefined && value !== null) result[question.id] = value
  }
  return result
}

export function CandidateApplicationQuestions({ applicationId, questions, initialAnswers, locked }: {
  applicationId: string
  questions: CandidateQuestion[]
  initialAnswers: Record<string, unknown>
  locked: boolean
}) {
  const [answers, setAnswers] = useState(() => normaliseInitial(questions, initialAnswers))
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const flags = useMemo(() => deriveSigecAudience(questions, answers), [answers, questions])
  const visible = questions.filter((question) => matchesSigecAudience(question.config.audience, flags))

  function setAnswer(questionId: string, value: unknown) {
    setFeedback(null)
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  function save() {
    const visibleIds = new Set(visible.map((question) => question.id))
    const payload = Object.fromEntries(Object.entries(answers).filter(([id, value]) => {
      if (!visibleIds.has(id)) return false
      return value !== '' && value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)
    }))
    startTransition(async () => setFeedback(await saveApplicationAnswers(applicationId, payload)))
  }

  if (!questions.length) return null
  return <section className="mt-8 overflow-hidden rounded-[24px] border border-[#d6e0e7] bg-white shadow-[0_24px_60px_-52px_rgba(18,32,56,.65)]">
    <div className="border-b border-[#dce5ea] bg-[#f7fafb] px-5 py-5 sm:px-7 sm:py-6">
      <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#235f9f]">Informações da inscrição</p>
      <h2 className="mt-1.5 font-display text-2xl font-extrabold text-[#142038]">Responda às perguntas</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526177]">Algumas perguntas podem aparecer conforme suas respostas. Revise tudo antes de salvar.</p>
    </div>
    <div className="space-y-6 p-5 sm:p-7">{visible.map((question, index) => <fieldset key={question.id} className="min-w-0">
      <legend className="text-sm font-extrabold leading-6 text-[#24334a]"><span className="mr-2 text-[#6d7b8e]">{index + 1}.</span>{question.label}{question.required && <span className="ml-2 text-[#a23a32]" aria-label="obrigatória">*</span>}</legend>
      {question.helpText && <p className="mt-1 text-sm leading-6 text-[#647287]">{question.helpText}</p>}
      <QuestionInput question={question} value={answers[question.id]} locked={locked} onChange={(value) => setAnswer(question.id, value)} />
    </fieldset>)}</div>
    <div className="border-t border-[#dce5ea] bg-[#f7fafb] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-7">
      <div aria-live="polite">{feedback && <p className={`flex items-start gap-2 text-sm font-bold ${feedback.type === 'success' ? 'text-[#116c4e]' : 'text-[#9a3030]'}`}>{feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}{feedback.message}</p>}</div>
      <button type="button" disabled={locked || pending} onClick={save} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#225f9e] px-5 text-sm font-extrabold text-white transition hover:bg-[#194f87] disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto sm:min-w-44">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{locked ? 'Respostas bloqueadas' : pending ? 'Salvando...' : 'Salvar respostas'}</button>
    </div>
  </section>
}

function QuestionInput({ question, value, locked, onChange }: { question: CandidateQuestion; value: unknown; locked: boolean; onChange: (value: unknown) => void }) {
  const inputClass = 'mt-3 min-h-12 w-full rounded-xl border border-[#afbecb] bg-white px-3.5 py-3 text-base font-medium text-[#172033] outline-none transition focus:border-[#2867a8] focus:ring-4 focus:ring-[#2867a8]/10 disabled:bg-[#eef2f5] disabled:text-[#6d7888]'
  if (question.type === 'long_text') return <textarea disabled={locked} required={question.required} value={String(value || '')} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-32 resize-y`} maxLength={10000} />
  if (question.type === 'single_choice') return <select disabled={locked} required={question.required} value={String(value || '')} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">Selecione uma opção</option>{(question.config.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
  if (question.type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return <div className="mt-3 grid gap-2 sm:grid-cols-2">{(question.config.options || []).map((option) => <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#c8d4dd] bg-[#f8fafb] px-3.5 py-3 text-sm font-bold text-[#35465b]"><input type="checkbox" disabled={locked} checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="h-4 w-4" />{option}</label>)}</div>
  }
  if (question.type === 'boolean') return <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-xs">{[[true, 'Sim'], [false, 'Não']].map(([option, label]) => <button key={label as string} type="button" disabled={locked} onClick={() => onChange(option)} className={`min-h-12 rounded-xl border px-4 text-sm font-extrabold transition ${value === option ? 'border-[#2867a8] bg-[#e8f2fb] text-[#174f88] ring-2 ring-[#2867a8]/15' : 'border-[#bdcbd6] bg-white text-[#46566b] hover:bg-[#f5f8fa]'}`}>{label as string}</button>)}</div>
  return <input disabled={locked} required={question.required} type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text'} value={typeof value === 'number' || typeof value === 'string' ? value : ''} onChange={(event) => onChange(question.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} className={inputClass} maxLength={question.type === 'short_text' ? 500 : undefined} />
}
