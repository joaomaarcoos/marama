import Link from 'next/link'
import { CheckCircle2, Circle, LockKeyhole, ShieldCheck } from 'lucide-react'

export type CandidateSubmissionReadinessItem = {
  code: string
  label: string
  ready: boolean
  detail: string
  action_href: string | null
}

export function CandidateSubmissionReadiness({ items }: { items: CandidateSubmissionReadinessItem[] }) {
  if (!items.length) return null
  const readyCount = items.filter((item) => item.ready).length
  const allReady = readyCount === items.length

  return <section className="mt-8 overflow-hidden rounded-[24px] border border-[#cbd8e2] bg-[#142038] text-white shadow-[0_28px_70px_-52px_rgba(15,32,54,.9)]">
    <div className="grid gap-5 border-b border-white/10 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
      <div><p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-[#8fd7bd]"><ShieldCheck className="h-4 w-4" /> Revisão antes do envio</p><h2 className="mt-2 font-display text-2xl font-extrabold">{allReady ? 'Sua inscrição está pronta.' : 'Veja o que ainda falta.'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#c6d1dd]">O sistema confere os itens obrigatórios diretamente no banco antes de permitir o envio definitivo.</p></div>
      <div className="w-fit rounded-2xl border border-white/10 bg-white/[.07] px-5 py-3 text-center"><p className="text-2xl font-black text-white">{readyCount}/{items.length}</p><p className="text-[11px] font-bold uppercase tracking-wider text-[#aebdcb]">concluídos</p></div>
    </div>
    <ul className="grid gap-px bg-white/10 sm:grid-cols-2">{items.map((item) => <li key={item.code} className="bg-[#142038] p-5 sm:p-6"><div className="flex items-start gap-3">{item.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#74d0ad]" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-[#e5bd65]" />}<div className="min-w-0"><p className="font-extrabold text-white">{item.label}</p><p className="mt-1 text-sm leading-6 text-[#b7c5d2]">{item.detail}</p>{!item.ready && item.action_href && <Link href={item.action_href} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[#6f91b2] bg-white/[.06] px-3 text-xs font-extrabold text-[#d9e9f7] transition hover:bg-white/[.12]">Resolver agora</Link>}</div></div></li>)}</ul>
    <div className="flex items-start gap-3 bg-[#0f1929] px-5 py-4 text-sm leading-6 text-[#b9c7d4] sm:px-7"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#8fd7bd]" /><p>{allReady ? 'Na próxima etapa, você confirmará os aceites e receberá o protocolo definitivo.' : 'O envio definitivo continuará bloqueado até todos os itens ficarem concluídos.'}</p></div>
  </section>
}
