'use client'

import { useState, useRef } from 'react'
import { Upload, Trash2, FileText, Loader2, FileType, FileCode, Pencil, Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Document {
  id: string
  name: string
  size_bytes: number
  mime_type: string
  chunk_count: number
  created_at: string
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

function FileIcon({ mime, name }: { mime: string; name: string }) {
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return <FileType className="h-4 w-4" style={{ color: 'hsl(0 70% 60%)' }} />
  }
  if (name.endsWith('.md')) {
    return <FileCode className="h-4 w-4" style={{ color: 'hsl(217 91% 60%)' }} />
  }
  return <FileText className="h-4 w-4" style={{ color: 'hsl(160 84% 39%)' }} />
}

export default function DocumentUploader({ initialDocuments }: { initialDocuments: Document[] }) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const uploadFile = async (file: File) => {
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) await uploadFile(file)
  }

  const startRename = (doc: Document) => {
    setRenamingId(doc.id)
    setRenameValue(doc.name)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const confirmRename = async (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setSavingRename(true)
    try {
      const res = await fetch(`/api/documentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, name: trimmed } : d))
        showMessage('success', 'Documento renomeado.')
      } else {
        const data = await res.json()
        showMessage('error', data.error ?? 'Erro ao renomear.')
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setSavingRename(false)
      setRenamingId(null)
      setRenameValue('')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}"?\nEsta ação não pode ser desfeita.`)) return

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
    <div className="space-y-5">

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className="rounded-xl p-8 text-center cursor-pointer transition-all duration-200"
        style={{
          background: dragOver ? 'hsl(262 80% 65% / 0.08)' : 'hsl(220 40% 8%)',
          border: `2px dashed ${dragOver ? 'hsl(262 80% 65%)' : 'hsl(216 32% 20%)'}`,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'hsl(262 80% 65%)' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 91%)' }}>
              Indexando documento…
            </p>
            <p className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
              Extraindo texto, gerando embeddings e salvando na base de conhecimento
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: 'hsl(262 80% 65% / 0.12)', color: 'hsl(262 80% 65%)' }}
            >
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 91%)' }}>
                Arraste um arquivo ou{' '}
                <span style={{ color: 'hsl(262 80% 65%)' }}>clique para escolher</span>
              </p>
              <p className="text-xs mt-1" style={{ color: 'hsl(215 18% 42%)' }}>
                PDF, TXT ou MD — máximo 10 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status message */}
      {message && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={
            message.type === 'success'
              ? { background: 'hsl(160 84% 39% / 0.15)', border: '1px solid hsl(160 84% 39% / 0.35)', color: 'hsl(160 84% 55%)' }
              : { background: 'hsl(0 70% 40% / 0.15)', border: '1px solid hsl(0 70% 50% / 0.35)', color: 'hsl(0 70% 65%)' }
          }
        >
          {message.text}
        </div>
      )}

      {/* Document list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid hsl(216 32% 15%)' }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ background: 'hsl(220 40% 7%)', borderBottom: '1px solid hsl(216 32% 15%)' }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'hsl(215 18% 42%)', letterSpacing: '0.1em' }}
          >
            Documentos indexados
          </h3>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(262 80% 65% / 0.15)', color: 'hsl(262 80% 65%)' }}
          >
            {documents.length}
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center" style={{ background: 'hsl(220 40% 8%)' }}>
            <FileText className="h-8 w-8 mx-auto mb-3" style={{ color: 'hsl(216 32% 22%)' }} />
            <p className="text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
              Nenhum documento adicionado ainda.
            </p>
            <p className="text-xs mt-1" style={{ color: 'hsl(215 18% 30%)' }}>
              Envie PDFs, TXTs ou MDs para a MARA usar como base de conhecimento.
            </p>
          </div>
        ) : (
          <div style={{ background: 'hsl(220 40% 8%)' }}>
            {documents.map((doc, i) => (
              <div
                key={doc.id}
                className="px-5 py-4 flex items-center justify-between gap-4"
                style={{ borderTop: i === 0 ? 'none' : '1px solid hsl(216 32% 12%)' }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: 'hsl(220 40% 12%)', border: '1px solid hsl(216 32% 18%)' }}
                  >
                    <FileIcon mime={doc.mime_type} name={doc.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {renamingId === doc.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmRename(doc.id)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          className="flex-1 rounded-lg px-2 py-1 text-sm outline-none"
                          style={{
                            background: 'hsl(220 40% 14%)',
                            border: '1px solid hsl(262 80% 65% / 0.4)',
                            color: 'hsl(213 31% 91%)',
                          }}
                        />
                        <button
                          onClick={() => confirmRename(doc.id)}
                          disabled={savingRename}
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ background: 'hsl(160 84% 39% / 0.15)', color: 'hsl(160 84% 55%)' }}
                          title="Confirmar"
                        >
                          {savingRename ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={cancelRename}
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ background: 'hsl(0 70% 40% / 0.12)', color: 'hsl(0 70% 60%)' }}
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium truncate" style={{ color: 'hsl(213 31% 91%)' }}>
                        {doc.name}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(215 18% 42%)' }}>
                      {formatBytes(doc.size_bytes)}
                      <span className="mx-1.5" style={{ color: 'hsl(216 32% 22%)' }}>·</span>
                      <span style={{ color: 'hsl(262 80% 65%)' }}>{doc.chunk_count} trechos</span>
                      <span className="mx-1.5" style={{ color: 'hsl(216 32% 22%)' }}>·</span>
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {renamingId !== doc.id && (
                    <button
                      onClick={() => startRename(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                      style={{ color: 'hsl(215 18% 42%)' }}
                      onMouseEnter={e => {
                        ;(e.currentTarget as HTMLElement).style.background = 'hsl(262 80% 65% / 0.12)'
                        ;(e.currentTarget as HTMLElement).style.color = 'hsl(262 80% 65%)'
                      }}
                      onMouseLeave={e => {
                        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLElement).style.color = 'hsl(215 18% 42%)'
                      }}
                      title="Renomear documento"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(doc.id, doc.name)}
                    disabled={deletingId === doc.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:opacity-40"
                    style={{ color: 'hsl(215 18% 42%)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.background = 'hsl(0 70% 40% / 0.15)'
                      ;(e.currentTarget as HTMLElement).style.color = 'hsl(0 70% 60%)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.color = 'hsl(215 18% 42%)'
                    }}
                    title="Excluir documento"
                  >
                    {deletingId === doc.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
