import { createClient } from '@/lib/supabase/server'
import { PromptManager } from '@/components/prompt-manager'

export default async function PromptPage() {
  const supabase = await createClient()

  const { data: sections } = await supabase
    .from('prompt_sections')
    .select('*')
    .order('order_index', { ascending: true })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Prompt da MARA</h1>
        <p className="text-gray-500 mt-1">
          Configure os blocos de conhecimento que compõem a inteligência da MARA.
          A ordem define a prioridade no sistema prompt.
        </p>
      </div>
      <PromptManager initialSections={sections ?? []} />
    </div>
  )
}
