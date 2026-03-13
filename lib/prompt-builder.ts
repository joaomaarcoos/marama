import { adminClient } from './supabase/admin'

export async function buildSystemPrompt(
  identityContext?: string | null,
  ragContext?: string | null,
  moodleContext?: string | null
): Promise<string> {
  const { data: sections } = await adminClient
    .from('prompt_sections')
    .select('title, content')
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (!sections || sections.length === 0) {
    return 'Você é MARA, assistente virtual do programa Maranhão Profissionalizado.'
  }

  const parts = sections.map(s => `## ${s.title}\n${s.content}`)
  let prompt = parts.join('\n\n')

  if (identityContext) {
    prompt += `\n\n## Contexto do Usuário\n${identityContext}`
  }

  if (moodleContext) {
    prompt += `\n\n## Dados Atualizados do Moodle\n${moodleContext}`
  }

  if (ragContext) {
    prompt += `\n\n${ragContext}`
  }

  return prompt
}
