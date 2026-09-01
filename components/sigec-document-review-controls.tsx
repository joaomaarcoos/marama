'use client'

import { useState, useTransition } from 'react'
import { Check, ExternalLink, Loader2, X } from 'lucide-react'
import { reviewSigecDocument } from '@/app/(dashboard)/sigec-candidaturas/[id]/actions'

export function SigecDocumentReviewControls({ applicationId, documentId }: { applicationId: string; documentId: string }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [pending, startTransition] = useTransition()

  function review(decision: 'valid' | 'rejected') {
    setMessage(''); setIsError(false)
    startTransition(async () => {
      const result = await reviewSigecDocument({ applicationId, documentId, decision, publicReason: decision === 'rejected' ? reason : '', internalNote: note })
      setMessage(result.error || result.success || '')
      setIsError(Boolean(result.error))
      if (result.success) { setReason(''); setNote('') }
    })
  }

  return <div className="mt-4 rounded-xl p-3 sm:p-4" style={{ background: 'hsl(var(--bg) / .65)', border: '1px solid hsl(var(--border))' }}>
    <a href={`/api/sigec/review-documents/${documentId}`} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn--secondary min-h-10 w-full justify-center sm:w-auto"><ExternalLink className="h-4 w-4" /> Abrir documento</a>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Motivo para o candidato, se não aceitar<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={3} placeholder="Explique de forma clara o que precisa ser corrigido" className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))', background: 'hsl(var(--card))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties} /></label>
      <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Nota interna, opcional<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} rows={3} placeholder="Visível somente para a equipe" className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))', background: 'hsl(var(--card))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties} /></label>
    </div>
    {message && <p role="status" className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: isError ? 'hsl(var(--accent-red) / .10)' : 'hsl(var(--accent-green) / .10)', color: isError ? 'hsl(var(--accent-red))' : 'hsl(var(--accent-green))' }}>{message}</p>}
    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={pending} onClick={() => review('rejected')} className="ds-btn ds-btn--secondary min-h-10 justify-center" style={{ color: 'hsl(var(--accent-red))' }}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Não aceitar</button><button type="button" disabled={pending} onClick={() => review('valid')} className="ds-btn ds-btn--primary min-h-10 justify-center">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar documento</button></div>
  </div>
}
