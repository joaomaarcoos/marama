'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export function TutoresSyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ synced: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    try {
      const res = await fetch('/api/moodle/tutores', {
        method: 'POST',
        signal: controller.signal,
      })
      clearTimeout(timer)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao sincronizar')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Tempo limite atingido (120s). Recarregue a página.')
      } else {
        setError('Erro de conexão com o servidor')
      }
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
          background: 'hsl(var(--primary) / 0.12)',
          border: '1px solid hsl(var(--primary) / 0.3)',
          color: 'hsl(var(--primary))',
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
          {result.synced} tutores sincronizados
        </div>
      )}

      {error && (
        <div
          className="flex items-start gap-2 px-3 py-1.5 rounded-lg text-xs max-w-xs"
          style={{ background: 'hsl(0 84% 39% / 0.1)', color: 'hsl(0 84% 60%)', border: '1px solid hsl(0 84% 39% / 0.2)' }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
