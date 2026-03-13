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
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {loading ? 'Sincronizando...' : 'Sincronizar Moodle'}
      </button>

      {result && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg text-xs">
          <CheckCircle className="h-4 w-4" />
          {result.synced} alunos · {result.courses_scanned} cursos
          {result.errors.length > 0 && <span className="text-yellow-600"> · {result.errors.length} erros</span>}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg text-xs">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
