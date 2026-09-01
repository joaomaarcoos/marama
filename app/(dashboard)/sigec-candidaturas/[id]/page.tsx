import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import type { SigecApplicationDetail } from '@/lib/sigec-application-detail'
import { SigecApplicationReviewDetail } from '@/components/sigec-application-review-detail'

export const dynamic = 'force-dynamic'

export default async function SigecApplicationDetailPage({ params }: { params: { id: string } }) {
  const parsedId = z.string().uuid().safeParse(params.id)
  if (!parsedId.success) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !['admin', 'gerente'].includes(extractRole(user))) redirect('/acesso-negado')

  const { data, error } = await getAdminClient().rpc('sigec_get_application_review_detail', {
    p_actor_id: user.id,
    p_application_id: parsedId.data,
  })
  if (error?.code === 'P0002') notFound()

  return <>
    <div className="app-header"><div><h1>Análise da candidatura</h1><p className="app-subtitle">Consulta completa em modo somente leitura</p></div></div>
    <div className="app-content animate-fade-up space-y-5">
      <Link href="/sigec-candidaturas" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}><ArrowLeft className="h-4 w-4" /> Voltar para candidaturas</Link>
      {error || !data ? <div className="rounded-xl p-5 text-sm" style={{ background: 'hsl(var(--accent-red) / .08)', border: '1px solid hsl(var(--accent-red) / .35)', color: 'hsl(var(--fg1))' }}>Não foi possível carregar esta candidatura. Tente novamente.</div> : <SigecApplicationReviewDetail detail={data as SigecApplicationDetail} />}
    </div>
  </>
}
