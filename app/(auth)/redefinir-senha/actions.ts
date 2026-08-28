'use server'

import { sigecPasswordSchema } from '@/lib/sigec-registration'
import { createClient } from '@/lib/supabase/server'

export async function updatePassword(formData: FormData) {
  const password = formData.get('password')
  const confirmation = formData.get('confirmPassword')
  const parsed = sigecPasswordSchema.safeParse(password)

  if (!parsed.success) return { status: 'error' as const, message: parsed.error.errors[0].message }
  if (parsed.data !== confirmation) return { status: 'error' as const, message: 'As senhas nao coincidem.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'expired' as const, message: 'O link expirou. Solicite uma nova recuperacao.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { status: 'error' as const, message: 'Nao foi possivel atualizar a senha. Solicite um novo link.' }

  await supabase.auth.signOut({ scope: 'global' })
  return { status: 'success' as const, message: 'Senha atualizada. Entre novamente em todos os seus dispositivos.' }
}
