'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractRole } from '@/lib/roles'

const StartApplicationSchema = z.object({
  processId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export async function startSigecApplication(formData: FormData) {
  const parsed = StartApplicationSchema.safeParse({
    processId: formData.get('processId'),
    slug: formData.get('slug'),
  })
  if (!parsed.success) redirect('/processos')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/processos/${parsed.data.slug}`)}`)
  if (extractRole(user) !== 'candidato') redirect('/acesso-negado')

  const { data, error } = await supabase.rpc('sigec_create_application_draft', {
    p_process_id: parsed.data.processId,
  })

  if (error) {
    console.error('[SIGEC application draft] creation rejected', { code: error.code })
    const reason = error.message.includes('PROFILE_INCOMPLETE') ? 'cadastro' : 'indisponivel'
    redirect(`/processos/${parsed.data.slug}?inscricao=${reason}`)
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.application_id) redirect(`/processos/${parsed.data.slug}?inscricao=indisponivel`)
  redirect('/minha-area?inscricao=rascunho')
}
