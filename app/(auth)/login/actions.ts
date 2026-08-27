'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extractRole, roleHome } from '@/lib/roles'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const credentials = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
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
