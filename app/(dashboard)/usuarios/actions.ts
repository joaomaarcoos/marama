'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  ASSIGNABLE_INTERNAL_ROLES,
  extractRole,
  type InternalUserRole,
} from '@/lib/roles'

const CreateUserSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
})

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'admin') return null
  return user
}

async function isCandidateAccount(userId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId)
  if (error) throw error
  return data.user?.app_metadata?.role === 'candidato'
}

export async function createUser(formData: FormData): Promise<{ error?: string; success?: string }> {
  const currentUser = await requireAdmin()
  if (!currentUser) return { error: 'Apenas o administrador pode criar usuarios internos.' }

  const parsed = CreateUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: 'atendente' },
  })

  if (error) {
    if (error.message.includes('already registered')) return { error: 'Este email ja esta cadastrado.' }
    return { error: error.message }
  }

  revalidatePath('/usuarios')
  return { success: `Usuario ${data.user.email} criado com sucesso.` }
}

export async function deleteUser(userId: string): Promise<{ error?: string; success?: string }> {
  const currentUser = await requireAdmin()
  if (!currentUser) return { error: 'Apenas o administrador pode excluir usuarios.' }
  if (currentUser.id === userId) return { error: 'Voce nao pode excluir sua propria conta.' }

  try {
    if (await isCandidateAccount(userId)) {
      return { error: 'Contas de candidatos devem ser gerenciadas pelo SIGEC Processos.' }
    }
  } catch {
    return { error: 'Nao foi possivel validar a conta selecionada.' }
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: 'Usuario excluido com sucesso.' }
}

export async function setUserRole(
  userId: string,
  role: InternalUserRole
): Promise<{ error?: string; success?: string }> {
  const currentUser = await requireAdmin()
  if (!currentUser) return { error: 'Apenas o administrador pode alterar cargos.' }
  if (!ASSIGNABLE_INTERNAL_ROLES.includes(role)) return { error: 'Cargo interno invalido.' }
  if (currentUser.id === userId) return { error: 'Voce nao pode alterar seu proprio cargo.' }

  try {
    if (await isCandidateAccount(userId)) {
      return { error: 'O papel de candidato nao pode ser convertido em papel interno por esta tela.' }
    }
  } catch {
    return { error: 'Nao foi possivel validar a conta selecionada.' }
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  })
  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: 'Cargo atualizado com sucesso.' }
}
