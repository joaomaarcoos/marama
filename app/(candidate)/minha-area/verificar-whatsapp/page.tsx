import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { maskWhatsapp } from '@/lib/sigec-whatsapp-verification'
import { WhatsappVerificationPanel } from '@/components/whatsapp-verification-panel'

export const dynamic = 'force-dynamic'

export default async function VerifyWhatsappPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('sigec_candidate_profiles')
    .select('whatsapp, whatsapp_verified_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile?.whatsapp) redirect('/minha-area')

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" /> Voltar para minha área</Link>
      <div className="mt-7"><WhatsappVerificationPanel maskedPhone={maskWhatsapp(profile.whatsapp)} initiallyVerified={Boolean(profile.whatsapp_verified_at)} /></div>
    </main>
  )
}
