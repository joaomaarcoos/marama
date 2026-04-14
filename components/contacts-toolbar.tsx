'use client'

import { useRef, useState } from 'react'
import { Download, Upload, FileDown, Loader2 } from 'lucide-react'

const TEMPLATE_HEADER = 'nome,telefone,email,cpf,etiquetas'
const TEMPLATE_ROWS = [
  'João Silva,5598987654321,joao@email.com,123.456.789-00,interessado;pendente',
  'Maria Santos,5598912345678,,,inscrita 2026',
  'Pedro Alves,5598999887766,pedro@email.com,,',
]
const TEMPLATE_CSV = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].join('\r\n')

export default function ContactsToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
      }
    } catch {
      showMessage('error', 'Erro ao conectar com o servidor.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
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
    </div>
  )
}
