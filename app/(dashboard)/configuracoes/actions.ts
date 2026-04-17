'use server'

import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ── Atualizar dados do perfil (nome + telefone) ──────────────────────────────

export async function updateProfile(
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const full_name = (formData.get('full_name') as string | null)?.trim() ?? ''
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''

  const { error } = await supabase.auth.updateUser({
    data: { full_name, phone },
  })

  if (error) return { error: error.message }
  revalidatePath('/configuracoes')
  return { success: 'Perfil atualizado com sucesso.' }
}

// ── Trocar e-mail ────────────────────────────────────────────────────────────

export async function updateEmail(
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const schema = z.string().email('E-mail inválido')
  const parsed = schema.safeParse(email)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  if (email === user.email) return { error: 'O novo e-mail é igual ao atual.' }

  // Usa admin API para aplicar imediatamente, sem exigir confirmação por e-mail
  const { error } = await getAdminClient().auth.admin.updateUserById(user.id, { email })
  if (error) return { error: error.message }

  revalidatePath('/configuracoes')
  return { success: 'E-mail atualizado com sucesso. Use o novo e-mail no próximo login.' }
}

// ── Trocar senha ─────────────────────────────────────────────────────────────

export async function updatePassword(
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('confirm') as string | null) ?? ''

  if (password.length < 8) return { error: 'A senha deve ter pelo menos 8 caracteres.' }
  if (password !== confirm) return { error: 'As senhas não coincidem.' }

  // Usa admin API para persistir imediatamente, sem depender de sessão SSR
  const { error } = await getAdminClient().auth.admin.updateUserById(user.id, { password })
  if (error) return { error: error.message }

  return { success: 'Senha alterada com sucesso.' }
}

// ── Upload de avatar ─────────────────────────────────────────────────────────

export async function uploadAvatar(
  formData: FormData
): Promise<{ error?: string; success?: string; avatarUrl?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { error: 'Nenhum arquivo selecionado.' }
  if (file.size > 2 * 1024 * 1024) return { error: 'A imagem deve ter no máximo 2 MB.' }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl },
  })

  if (updateError) return { error: updateError.message }

  revalidatePath('/configuracoes')
  return { success: 'Foto atualizada com sucesso.', avatarUrl }
}
