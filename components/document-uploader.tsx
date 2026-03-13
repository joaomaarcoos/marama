'use client'

import { useState, useRef } from 'react'
import { Upload, Trash2, FileText, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  name: string
  size_bytes: number
  mime_type: string
  chunk_count: number
  created_at: string
}

interface DocumentUploaderProps {
  initialDocuments: Document[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DocumentUploader({ initialDocuments }: DocumentUploaderProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/documentos', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        showMessage('error', data.error ?? 'Erro ao enviar documento.')
      } else {
        showMessage('success', data.message ?? 'Documento adicionado com sucesso!')
        router.refresh()
        // Refresh local list
        const listRes = await fetch('/api/documentos')
        if (listRes.ok) setDocuments(await listRes.json())
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return

    setDeletingId(id)
    try {
      const res = await fetch(`/api/documentos/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id))
        showMessage('success', `"${name}" excluído com sucesso.`)
      } else {
        const data = await res.json()
        showMessage('error', data.error ?? 'Erro ao excluir documento.')
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <>
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-600">Indexando documento, aguarde...</p>
              <p className="text-xs text-gray-400">Isso pode levar alguns segundos</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Arraste ou{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    escolha um arquivo
                  </button>
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF, TXT ou MD — máximo 10MB</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Documents list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Documentos indexados ({documents.length})
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum documento adicionado ainda.</p>
            <p className="text-xs text-gray-300 mt-1">Envie PDFs ou arquivos de texto para a MARA usar como referência.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <div key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(doc.size_bytes)} · {doc.chunk_count} trechos · {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id, doc.name)}
                  disabled={deletingId === doc.id}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Excluir documento"
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
