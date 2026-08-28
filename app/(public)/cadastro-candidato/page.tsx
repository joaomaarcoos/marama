import Link from 'next/link'
import { ArrowLeft, LockKeyhole, MailCheck, MessageCircleMore } from 'lucide-react'
import { CandidateRegistrationForm } from '@/components/candidate-registration-form'
import { candidateRegistrationEnabled, getTurnstileSiteKey } from '@/lib/sigec-registration'

export const dynamic = 'force-dynamic'

export default function CandidateRegistrationPage() {
  const registrationEnabled = candidateRegistrationEnabled()
  const turnstileSiteKey = getTurnstileSiteKey()

  return (
    <main className="h-screen overflow-y-auto bg-[#07110f] text-white selection:bg-emerald-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 opacity-60" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 16% 12%, rgba(52,211,153,.18), transparent 28%), radial-gradient(circle at 88% 76%, rgba(245,158,11,.09), transparent 26%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: 'auto, auto, 42px 42px, 42px 42px' }} />
      <div className="relative mx-auto min-h-full max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <Link href="/login" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-emerald-300">
          <ArrowLeft className="h-4 w-4" /> Voltar ao acesso
        </Link>

        <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)] lg:items-start xl:gap-20">
          <section className="lg:sticky lg:top-12">
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.8)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">SIGEC Processos</span>
            </div>
            <h1 className="mt-7 max-w-xl font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Sua trajetória começa com um acesso seguro.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
              Crie sua identidade no banco de profissionais. Depois da confirmação, você poderá completar o perfil, anexar documentos e acompanhar cada mudança da candidatura.
            </p>
            <div className="mt-9 grid gap-4 border-l border-white/10 pl-5">
              {[
                [MailCheck, 'E-mail confirmado', 'Seu acesso começa somente depois da validação do endereço.'],
                [MessageCircleMore, 'Avisos da MARA', 'O WhatsApp será verificado antes das comunicações do processo.'],
                [LockKeyhole, 'Dados isolados', 'Cada candidato visualiza exclusivamente o próprio perfil.'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof LockKeyhole
                return (
                  <div key={String(title)} className="flex gap-4">
                    <ItemIcon className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
                    <div><p className="text-sm font-bold text-white">{String(title)}</p><p className="mt-1 text-sm leading-6 text-slate-400">{String(description)}</p></div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-5 border-b border-white/10 pb-6">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Etapa 01</p><h2 className="mt-2 font-display text-2xl font-bold">Identificação e acesso</h2></div>
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem documentos</span>
            </div>

            {registrationEnabled ? <CandidateRegistrationForm turnstileSiteKey={turnstileSiteKey} /> : (
              <div className="py-4">
                <p className="font-display text-xl font-bold">Ambiente seguro em preparação</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">O formulário já está implementado, mas permanece fechado até a ativação conjunta de confirmação, CAPTCHA, limites contra abuso e verificação do WhatsApp.</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <Link href="/processos" className="flex items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300">Consultar processos</Link>
                  <Link href="/login" className="flex items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold transition hover:bg-white/10">Já tenho acesso</Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
