'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { extractRole, type UserRole } from '@/lib/roles'

const CreateUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
})

export async function createUser(formData: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) return { error: 'Não autorizado' }

  const parsed = CreateUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const { email, password } = parsed.data

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'atendente' },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Este email já está cadastrado.' }
    }
    return { error: error.message }
  }

  revalidatePath('/usuarios')
  return { success: `Usuário ${data.user.email} criado com sucesso.` }
}

export async function deleteUser(userId: string): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) return { error: 'Não autorizado' }

  // Somente admin pode excluir usuários
  const currentRole = extractRole(currentUser)
  if (currentRole !== 'admin') return { error: 'Apenas o administrador pode excluir usuários.' }

  if (currentUser.id === userId) {
    return { error: 'Você não pode excluir sua própria conta.' }
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: 'Usuário excluído com sucesso.' }
}

export async function setUserRole(userId: string, role: UserRole): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) return { error: 'Não autorizado' }

  // Somente admin pode alterar cargos
  const currentRole = extractRole(currentUser)
  if (currentRole !== 'admin') return { error: 'Apenas o administrador pode alterar cargos.' }

  if (currentUser.id === userId) {
    return { error: 'Você não pode alterar seu próprio cargo.' }
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  })

  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: 'Cargo atualizado com sucesso.' }
}
