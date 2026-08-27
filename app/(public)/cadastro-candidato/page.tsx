import Link from 'next/link'
import { LockKeyhole, MailCheck, MessageCircleMore } from 'lucide-react'

export default function CandidateRegistrationPage() {
  return (
    <main className="h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto flex min-h-full max-w-5xl items-center px-6 py-12">
        <div className="grid w-full gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">SIGEC Processos</p>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">Cadastro de candidato</h1>
            <p className="mt-5 max-w-xl leading-7 text-slate-300">
              Esta rota já está reservada para o cadastro no banco de profissionais. A abertura do formulário depende da ativação das proteções de cadastro no ambiente oficial.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [MailCheck, 'E-mail confirmado antes da inscrição'],
                [MessageCircleMore, 'WhatsApp validado para avisos da MARA'],
                [LockKeyhole, 'Documentos privados e acesso individual'],
              ].map(([Icon, text]) => {
                const ItemIcon = Icon as typeof LockKeyhole
                return <div key={String(text)} className="flex items-center gap-3 text-sm text-slate-300"><ItemIcon className="h-4 w-4 text-emerald-400" />{String(text)}</div>
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-7 shadow-2xl shadow-black/30">
            <p className="font-display text-xl font-bold">Ambiente seguro em preparação</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              O cadastro não será liberado parcialmente: confirmação de contato, prevenção de abuso e isolamento dos documentos entrarão juntos.
            </p>
            <div className="mt-6 space-y-3">
              <Link href="/processos" className="flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300">
                Consultar processos
              </Link>
              <Link href="/login" className="flex w-full items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold transition hover:bg-white/10">
                Já tenho acesso
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
