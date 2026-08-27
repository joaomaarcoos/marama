'use client'

import { useState, useTransition } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { archiveSigecProcess } from '@/app/(dashboard)/sigec-processos/actions'

export function SigecArchiveButton({ processId }: { processId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function archive() {
    if (!window.confirm('Arquivar este processo? A ação não apaga dados.')) return
    setError('')
    startTransition(async () => {
      const result = await archiveSigecProcess(processId)
      if (result.error) return setError(result.error)
      router.push('/sigec-processos')
      router.refresh()
    })
  }

  return (
    <div>
      <button type="button" onClick={archive} disabled={isPending} className="ds-btn ds-btn--secondary">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
        Arquivar
      </button>
      {error && <p className="mt-2 max-w-xs text-right text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}
    </div>
  )
}
