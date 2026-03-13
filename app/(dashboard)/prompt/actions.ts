'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createPromptSection(formData: FormData) {
  const supabase = await createClient()

  const { count } = await supabase
    .from('prompt_sections')
    .select('*', { count: 'exact', head: true })

  const { error } = await supabase.from('prompt_sections').insert({
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    order_index: (count ?? 0) + 1,
    is_active: true,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/prompt')
}

export async function updatePromptSection(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('prompt_sections')
    .update({
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/prompt')
}

export async function togglePromptSection(id: string, isActive: boolean) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('prompt_sections')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/prompt')
}

export async function deletePromptSection(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('prompt_sections')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/prompt')
}

export async function reorderPromptSections(ids: string[]) {
  const supabase = await createClient()

  const updates = ids.map((id, index) => ({
    id,
    order_index: index + 1,
  }))

  for (const update of updates) {
    await supabase
      .from('prompt_sections')
      .update({ order_index: update.order_index })
      .eq('id', update.id)
  }

  revalidatePath('/prompt')
}
