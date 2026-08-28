'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extractRole, roleHome } from '@/lib/roles'
import { captchaSecurityConfigured } from '@/lib/sigec-registration'

export async function login(formData: FormData) {
  if (!captchaSecurityConfigured()) {
    return { error: 'O acesso esta temporariamente indisponivel.' }
  }

  const supabase = await createClient()

  const captchaToken = String(formData.get('captchaToken') ?? '')
  if (!captchaToken || captchaToken.length > 2048) {
    return { error: 'Confirme a verificacao de seguranca e tente novamente.' }
  }

  const credentials = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: { captchaToken },
  }

  const { data, error } = await supabase.auth.signInWithPassword(credentials)

  if (error) {
    return { error: 'Email ou senha incorretos.' }
  }

  const role = extractRole(data.user)
  if (role === 'sem_acesso') {
    await supabase.auth.signOut()
    return { error: 'Sua conta ainda nao possui permissao de acesso.' }
  }

  revalidatePath('/', 'layout')
  redirect(roleHome(role))
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
