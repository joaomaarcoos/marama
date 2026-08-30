import Link from 'next/link'
import { ArrowRight, Check, Circle } from 'lucide-react'
import type { SigecProfileCompletenessSource } from '@/lib/sigec-profile-completeness'
import { getSigecProfileCompleteness } from '@/lib/sigec-profile-completeness'

export function CandidateProfileCompleteness({ profile }: { profile: SigecProfileCompletenessSource }) {
  const progress = getSigecProfileCompleteness(profile)
  const nextItem = progress.items.find((item) => !item.complete)

  return (
    <section aria-labelledby="profile-progress-title" className="rounded-[24px] border border-[#cfdbe5] bg-white p-5 shadow-[0_20px_55px_-44px_rgba(18,34,51,0.7)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#137052]">Seu cadastro</p>
          <h2 id="profile-progress-title" className="mt-1 font-display text-xl font-bold text-[#172033]">
            {progress.ready ? 'Tudo pronto para se candidatar' : `${progress.percentage}% concluído`}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#657084]">
            {progress.ready ? 'Seus dados e seu WhatsApp estão confirmados.' : 'Complete os itens abaixo para participar de um processo.'}
          </p>
        </div>
        {nextItem && (
          <Link href={nextItem.href} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#16775a] px-4 text-sm font-extrabold text-white transition hover:bg-[#115f49]">
            Continuar cadastro <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e7edf2]" role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage}>
        <div className="h-full rounded-full bg-[#16845f] transition-[width]" style={{ width: `${progress.percentage}%` }} />
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {progress.items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition ${item.complete ? 'border-[#cce4da] bg-[#f2faf6]' : 'border-[#dde3e9] bg-[#f8fafb] hover:border-[#9bcdbb]'}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${item.complete ? 'bg-[#16845f] text-white' : 'bg-white text-[#8390a1] ring-1 ring-[#cbd5df]'}`}>
                {item.complete ? <Check className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#172033]">{item.label}</span>
                <span className="block text-xs text-[#657084]">{item.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-5 text-[#657084]">O sistema atualiza este progresso automaticamente. A confirmação do WhatsApp ocorre somente pelo código enviado ao seu número.</p>
    </section>
  )
}
