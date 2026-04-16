'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function TutoresError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[/tutores] erro:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10" style={{ color: 'hsl(var(--destructive))' }} />
      <div className="text-center">
        <p className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Não foi possível carregar os tutores
        </p>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {error.message || 'Erro interno do servidor'}
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
      >
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  )
}
