'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface SyncResult {
  synced: number
  processed: number
  errors: string[]
  courses_scanned: number
}

export function MoodleSyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/moodle/sync', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao sincronizar')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch {
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all disabled:opacity-50"
        style={{
          background: 'hsl(160 84% 39% / 0.15)',
          border: '1px solid hsl(160 84% 39% / 0.35)',
          color: 'hsl(160 84% 50%)',
        }}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Sincronizando...' : 'Sincronizar Moodle'}
      </button>

      {result && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'hsl(160 84% 39% / 0.1)', color: 'hsl(160 84% 55%)', border: '1px solid hsl(160 84% 39% / 0.2)' }}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {result.synced} alunos · {result.courses_scanned} cursos
          {result.errors.length > 0 && <span style={{ color: 'hsl(38 92% 60%)' }}> · {result.errors.length} erros</span>}
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'hsl(0 84% 39% / 0.1)', color: 'hsl(0 84% 60%)', border: '1px solid hsl(0 84% 39% / 0.2)' }}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  )
}
