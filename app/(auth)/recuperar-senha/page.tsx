import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { PasswordRecoveryForm } from '@/components/password-recovery-form'
import { getTurnstileSiteKey, registrationSecurityConfigured } from '@/lib/sigec-registration'

export const dynamic = 'force-dynamic'

export default function PasswordRecoveryPage() {
  const securityConfigured = registrationSecurityConfigured()
  const turnstileSiteKey = getTurnstileSiteKey()
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-5 py-10" style={{ colorScheme: 'dark' }}>
      <section className="w-full max-w-md rounded-3xl border border-slate-700/80 bg-[#0b1322] p-7 text-slate-50 shadow-2xl shadow-slate-950/25 sm:p-9">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar ao login</Link>
        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/15 text-blue-200"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-50">Redefinir acesso</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Informe seu e-mail. Por segurança, a resposta será a mesma exista ou não uma conta cadastrada.</p>
        {securityConfigured ? <PasswordRecoveryForm turnstileSiteKey={turnstileSiteKey} /> : (
          <p className="mt-7 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">A recuperação está temporariamente indisponível enquanto a proteção antiabuso é configurada.</p>
        )}
      </section>
    </main>
  )
}
