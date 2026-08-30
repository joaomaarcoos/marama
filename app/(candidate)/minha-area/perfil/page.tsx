import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleDashed } from 'lucide-react'
import { CandidateProfileForm } from '@/components/candidate-profile-form'
import { CandidateProfileCompleteness } from '@/components/candidate-profile-completeness'
import { createClient } from '@/lib/supabase/server'
import { formatCpf } from '@/lib/utils'

type CandidateProfile = {
  full_name: string
  cpf: string
  birth_date: string
  whatsapp: string
  whatsapp_verified_at: string | null
  postal_code: string | null
  street: string | null
  address_number: string | null
  address_extra: string | null
  district: string | null
  city: string
  state: string
  availability: string | null
  professional_summary: string | null
  profile_completed_at: string | null
}
export default async function CandidateProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('sigec_candidate_profiles')
    .select('full_name, cpf, birth_date, whatsapp, whatsapp_verified_at, postal_code, street, address_number, address_extra, district, city, state, availability, professional_summary, profile_completed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) notFound()
  const profile = data as CandidateProfile
  const complete = Boolean(profile.profile_completed_at)

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <Link href="/minha-area" className="inline-flex items-center gap-2 text-sm font-bold text-[#526074] transition hover:text-[#137052]">
        <ArrowLeft className="h-4 w-4" /> Voltar para minha área
      </Link>

      <div className="mt-7 flex flex-col justify-between gap-5 border-b border-[#d9e0e7] pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#16845f]">Perfil profissional</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#172033] sm:text-4xl">Seus dados, em um só lugar.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#657084]">Estas informações serão reutilizadas nas suas candidaturas. Revise tudo antes de enviar uma inscrição.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-extrabold ${complete ? 'border-[#a5d9c5] bg-[#ebf8f2] text-[#116c4e]' : 'border-[#ead0a3] bg-[#fff7e9] text-[#91580d]'}`}>
          {complete ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
          {complete ? 'Dados essenciais completos' : 'Complete os campos essenciais'}
        </span>
      </div>

      <div className="mt-8"><CandidateProfileCompleteness profile={profile} /></div>

      <div className="mt-6">
        <CandidateProfileForm initial={{
          fullName: profile.full_name,
          cpf: formatCpf(profile.cpf),
          birthDate: profile.birth_date,
          email: user.email || '',
          whatsapp: profile.whatsapp,
          whatsappVerified: Boolean(profile.whatsapp_verified_at),
          postalCode: profile.postal_code || '',
          street: profile.street || '',
          addressNumber: profile.address_number || '',
          addressExtra: profile.address_extra || '',
          district: profile.district || '',
          city: profile.city,
          state: profile.state,
          availability: profile.availability || '',
          professionalSummary: profile.professional_summary || '',
          profileCompleted: complete,
        }} />
      </div>
    </main>
  )
}
