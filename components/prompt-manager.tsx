'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortablePromptCard } from './prompt-section-card'
import { createPromptSection, reorderPromptSections } from '@/app/(dashboard)/prompt/actions'
import { Plus, Loader2 } from 'lucide-react'

interface Section {
  id: string
  title: string
  content: string
  order_index: number
  is_active: boolean
}

export function PromptManager({ initialSections }: { initialSections: Section[] }) {
  const [sections, setSections] = useState<Section[]>(initialSections)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sections.findIndex(s => s.id === active.id)
    const newIndex = sections.findIndex(s => s.id === over.id)
    const reordered = arrayMove(sections, oldIndex, newIndex)
    setSections(reordered)
    await reorderPromptSections(reordered.map(s => s.id))
  }

  async function handleCreate(formData: FormData) {
    setLoading(true)
    await createPromptSection(formData)
    setShowForm(false)
    setLoading(false)
    // Recarregar via router.refresh seria necessário em produção
    // Por ora, a revalidatePath no action cuida disso
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 mb-6">
            {sections.map((section) => (
              <SortablePromptCard
                key={section.id}
                section={section}
                onUpdate={(updated) =>
                  setSections(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
                }
                onDelete={(id) =>
                  setSections(prev => prev.filter(s => s.id !== id))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && !showForm && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">Nenhum bloco de prompt criado ainda.</p>
          <p className="text-sm text-gray-400 mt-1">Adicione blocos para configurar a inteligência da MARA.</p>
        </div>
      )}

      {showForm ? (
        <form action={handleCreate} className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Novo bloco de conhecimento</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input
              name="title"
              required
              placeholder="Ex: Identidade, Escopo, Regras..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo</label>
            <textarea
              name="content"
              required
              rows={5}
              placeholder="Escreva as instruções para a MARA..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar bloco
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adicionar bloco
        </button>
      )}
    </div>
  )
}
