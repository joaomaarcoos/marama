'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3, Copy, FileClock, LoaderCircle, PencilLine, Send } from 'lucide-react'
import { startApplicationCorrection, submitApplication } from '@/app/(candidate)/minha-area/inscricoes/[id]/actions'

type SubmissionVersion = {
  protocol: string
  submittedAt: string
  version: number
  isCurrent: boolean
}

type Props = {
  applicationId: string
  applicationState: string
  enabled: boolean
  correctionAllowed: boolean
  submissions: SubmissionVersion[]
  placement: 'top' | 'bottom'
}

function submittedOn(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function CandidateApplicationSubmit({ applicationId, applicationState, enabled, correctionAllowed, submissions, placement }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const current = submissions.find((item) => item.isCurrent) || submissions[0]
  const editingCorrection = applicationState === 'draft' && Boolean(current)

  if (placement === 'top') {
    if (!current) return null
    return <section className={`mt-8 rounded-[24px] border p-5 sm:p-7 ${editingCorrection ? 'border-[#e0bd68] bg-[#fff8e5]' : 'border-[#8acbb4] bg-[#eaf8f2]'}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {editingCorrection ? <Clock3 className="mt-1 h-6 w-6 shrink-0 text-[#8a5b00]" /> : <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-[#137052]" />}
          <div className="min-w-0">
            <p className={`text-sm font-extrabold uppercase tracking-[.12em] ${editingCorrection ? 'text-[#805500]' : 'text-[#137052]'}`}>{editingCorrection ? 'Correção em andamento' : 'Inscrição enviada'}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-[#142038]">{editingCorrection ? 'Seu protocolo continua válido' : 'Seu protocolo atual'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526177]">{editingCorrection ? 'Faça as alterações necessárias e envie novamente. Se você não concluir, a versão anterior continua valendo.' : 'Guarde este número. Se precisar alterar algo, você poderá iniciar uma correção enquanto o prazo estiver aberto.'}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="break-all rounded-xl border border-[#a7d5c5] bg-white px-4 py-3 text-base font-black tracking-wider text-[#174f3e]">{current.protocol}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(current.protocol)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-[#116c4e] hover:bg-white"><Copy className="h-4 w-4" /> Copiar</button>
            </div>
            <p className="mt-3 text-sm text-[#526b61]">Versão {current.version} · enviada em {submittedOn(current.submittedAt)}</p>
          </div>
        </div>

        {applicationState === 'submitted' && <form action={(formData) => startTransition(async () => {
          const result = await startApplicationCorrection(formData)
          setMessage(result.message)
          if (result.type === 'success') router.refresh()
        })} className="shrink-0">
          <input type="hidden" name="applicationId" value={applicationId} />
          <button disabled={!correctionAllowed || pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#25745b] bg-white px-5 text-sm font-extrabold text-[#12664d] transition hover:bg-[#f4fbf8] disabled:cursor-not-allowed disabled:border-[#b8c5c0] disabled:text-[#6b7773] sm:w-auto">
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            {pending ? 'Abrindo...' : correctionAllowed ? 'Corrigir minha inscrição' : 'Prazo de correção encerrado'}
          </button>
        </form>}
      </div>

      {message && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${message.startsWith('Agora') ? 'border-[#8acbb4] bg-white text-[#116c4e]' : 'border-[#e9a3a3] bg-[#fff0f0] text-[#922b2b]'}`}>{message}</p>}

      {submissions.length > 1 && <details className="mt-5 border-t border-[#c9ddd5] pt-4">
        <summary className="cursor-pointer text-sm font-extrabold text-[#35465b]">Ver protocolos anteriores ({submissions.length - 1})</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{submissions.filter((item) => !item.isCurrent).map((item) => <li key={item.protocol} className="rounded-xl border border-[#d6e0dc] bg-white px-4 py-3"><p className="break-all text-sm font-extrabold text-[#35465b]">{item.protocol}</p><p className="mt-1 text-xs text-[#657388]">Versão {item.version} · {submittedOn(item.submittedAt)}</p></li>)}</ul>
      </details>}
    </section>
  }

  if (applicationState !== 'draft') return null

  return <form action={(formData) => startTransition(async () => {
    const result = await submitApplication(formData)
    setMessage(result.message)
    if (result.type === 'success') router.refresh()
  })} className="mt-8 rounded-[24px] border border-[#d4c17f] bg-[#fff9e8] p-5 sm:p-7">
    <input type="hidden" name="applicationId" value={applicationId} />
    <p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#765400]">{editingCorrection ? 'Reenvio da correção' : 'Confirmação final'}</p>
    <h2 className="mt-2 font-display text-2xl font-extrabold text-[#142038]">{editingCorrection ? 'Revise e envie a nova versão' : 'Leia e confirme antes de enviar'}</h2>
    {editingCorrection && <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#e3c46f] bg-white p-4 text-sm leading-6 text-[#5b4a1d]"><FileClock className="mt-0.5 h-5 w-5 shrink-0 text-[#8a5b00]" /><span>O novo protocolo substituirá o atual somente depois que este envio for concluído com sucesso.</span></div>}
    <div className="mt-5 space-y-3">{[
      ['edital', 'Li e aceito as regras e a versão vigente do edital.'],
      ['truthfulness', 'Declaro que as informações fornecidas são verdadeiras.'],
      ['requirements', 'Confirmo que cumpro os requisitos das vagas escolhidas.'],
      ['lgpd', 'Li o aviso de privacidade e autorizo o tratamento dos dados para este processo.'],
    ].map(([name, label]) => <label key={name} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#dfcf99] bg-white p-3.5 text-sm font-bold leading-6 text-[#35465b]"><input type="checkbox" name={name} required className="mt-1 h-4 w-4 shrink-0" />{label}</label>)}</div>
    {message && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${message.includes('sucesso') ? 'border-[#85cdb4] bg-[#e8f8f1] text-[#075c43]' : 'border-[#e9a3a3] bg-[#fff0f0] text-[#922b2b]'}`}>{message}</p>}
    <button disabled={!enabled || pending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16775a] px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {pending ? 'Enviando...' : enabled ? editingCorrection ? 'Enviar correção' : 'Enviar inscrição definitivamente' : 'Conclua as pendências acima'}
    </button>
  </form>
}
