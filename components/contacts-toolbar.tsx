'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, FileDown, Loader2, Plus, X } from 'lucide-react'

const TEMPLATE_HEADER = 'nome,telefone,email,cpf,etiquetas'
const TEMPLATE_ROWS = [
  'João Silva,5598987654321,joao@email.com,123.456.789-00,interessado;pendente',
  'Maria Santos,5598912345678,,,inscrita 2026',
  'Pedro Alves,5598999887766,pedro@email.com,,',
]
const TEMPLATE_CSV = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].join('\r\n')

interface CreateForm {
  nome: string
  telefone: string
  email: string
  cpf: string
}

const EMPTY_FORM: CreateForm = { nome: '', telefone: '', email: '', cpf: '' }

export default function ContactsToolbar() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/contatos/export')
      if (!res.ok) { showMessage('error', 'Erro ao exportar contatos.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contatos_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_importacao_contatos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/contatos/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        showMessage('error', data.error ?? 'Erro ao importar contatos.')
      } else {
        showMessage('success', data.message + (data.skipped > 0 ? ` (${data.skipped} linha(s) ignorada(s))` : ''))
        router.refresh()
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: form.nome, telefone: form.telefone, email: form.email || undefined, cpf: form.cpf || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        showMessage('error', data.error ?? 'Erro ao criar contato.')
      } else {
        showMessage('success', data.message)
        setForm(EMPTY_FORM)
        setShowCreate(false)
        router.refresh()
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setCreating(false)
    }
  }

  const inputStyle = {
    background: 'hsl(220 40% 8%)',
    border: '1px solid hsl(216 32% 18%)',
    color: 'hsl(213 31% 92%)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    color: 'hsl(215 18% 55%)',
    marginBottom: '0.25rem',
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Novo contato */}
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: 'hsl(220 26% 8%)', background: 'hsl(160 84% 39%)' }}
        >
          <Plus className="h-4 w-4" />
          Novo contato
        </button>

        {/* Exportar */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            color: 'hsl(213 31% 92%)',
            background: 'hsl(220 38% 12%)',
            border: '1px solid hsl(216 30% 18%)',
          }}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar CSV
        </button>

        {/* Importar */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            color: 'hsl(213 31% 92%)',
            background: 'hsl(220 38% 12%)',
            border: '1px solid hsl(216 30% 18%)',
          }}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImport}
          className="hidden"
        />

        {/* Baixar modelo */}
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-opacity hover:opacity-80"
          style={{
            color: 'hsl(262 80% 65%)',
            background: 'hsl(262 80% 65% / 0.08)',
            border: '1px solid hsl(262 80% 65% / 0.2)',
          }}
        >
          <FileDown className="h-4 w-4" />
          Baixar modelo de importação
        </button>
      </div>

      {message && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm"
          style={
            message.type === 'success'
              ? { background: 'hsl(160 84% 39% / 0.12)', border: '1px solid hsl(160 84% 39% / 0.3)', color: 'hsl(160 84% 55%)' }
              : { background: 'hsl(0 70% 40% / 0.12)', border: '1px solid hsl(0 70% 50% / 0.3)', color: 'hsl(0 70% 65%)' }
          }
        >
          {message.text}
        </div>
      )}

      {/* Modal criar contato */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: 'hsl(220 36% 10%)', border: '1px solid hsl(216 32% 18%)' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                Novo contato
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 transition-opacity hover:opacity-70"
                style={{ color: 'hsl(215 18% 55%)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Telefone (WhatsApp) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 5598987654321"
                  value={form.telefone}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>E-mail</label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>CPF</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 18%)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ color: 'hsl(220 26% 8%)', background: 'hsl(160 84% 39%)' }}
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
