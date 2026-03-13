'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { updatePromptSection, togglePromptSection, deletePromptSection } from '@/app/(dashboard)/prompt/actions'

interface Section {
  id: string
  title: string
  content: string
  is_active: boolean
}

interface Props {
  section: Section
  onUpdate: (updated: Partial<Section> & { id: string }) => void
  onDelete: (id: string) => void
}

export function SortablePromptCard({ section, onUpdate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState(section.title)
  const [content, setContent] = useState(section.content)

  async function handleSave() {
    setLoading(true)
    const formData = new FormData()
    formData.set('title', title)
    formData.set('content', content)
    await updatePromptSection(section.id, formData)
    onUpdate({ id: section.id, title, content })
    setEditing(false)
    setLoading(false)
  }

  async function handleToggle() {
    await togglePromptSection(section.id, !section.is_active)
    onUpdate({ id: section.id, is_active: !section.is_active })
  }

  async function handleDelete() {
    if (!confirm('Remover este bloco?')) return
    await deletePromptSection(section.id)
    onDelete(section.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border p-5 ${section.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
    >
      <div className="flex items-start gap-3">
        <button
          className="mt-1 cursor-grab text-gray-300 hover:text-gray-500 shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={4}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Salvar
                </button>
                <button
                  onClick={() => { setEditing(false); setTitle(section.title); setContent(section.content) }}
                  className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 text-sm">{section.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${section.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {section.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{section.content}</p>
            </>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleToggle}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                section.is_active
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  : 'bg-green-100 hover:bg-green-200 text-green-700'
              }`}
            >
              {section.is_active ? 'Desativar' : 'Ativar'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
