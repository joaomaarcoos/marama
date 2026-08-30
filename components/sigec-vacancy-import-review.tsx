'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, FileJson, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { confirmSigecVacancyImport } from '@/app/(dashboard)/sigec-processos/actions'

type ImportRow = {
  sourceRow: number
  modalityName: string
  modalitySlug: string
  municipality: string
  courseName: string
  vacancyKind: 'cadastro_reserva' | 'quantidade'
  vacancyCount: number | null
  acceptedEducation: string
  proofInstructions: string
  sourceReference: string
}

type ImportPreview = { sourceFile: string; sourceSha256: string; rows: ImportRow[] }

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

function rowKey(row: ImportRow) {
  return `${row.modalitySlug}|${normalized(row.municipality)}|${normalized(row.courseName)}`
}

export function SigecVacancyImportReview({ processId, editable }: { processId: string; editable: boolean }) {
  const router = useRouter()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  const analysis = useMemo(() => {
    const rows = preview?.rows ?? []
    const counts = new Map<string, number>()
    rows.forEach((row) => counts.set(rowKey(row), (counts.get(rowKey(row)) || 0) + 1))
    const flagged = rows.filter((row) => !row.acceptedEducation.trim() || !row.proofInstructions.trim() || (counts.get(rowKey(row)) || 0) > 1)
    return { flagged, duplicateRows: rows.filter((row) => (counts.get(rowKey(row)) || 0) > 1).length }
  }, [preview])

  async function loadFile(file?: File) {
    setError(''); setSuccess('')
    if (!file) return
    if (file.size > 2_000_000) return setError('A prévia excede o limite de 2 MB.')
    try {
      const value = JSON.parse(await file.text()) as ImportPreview
      if (!/^[0-9a-f]{64}$/.test(value.sourceSha256) || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 1000) throw new Error()
      setPreview(value)
    } catch { setError('Arquivo de prévia inválido. Gere-o com o extrator oficial do SIGEC.') }
  }

  function updateRow(sourceReference: string, field: keyof ImportRow, value: string) {
    setPreview((current) => current ? { ...current, rows: current.rows.map((row) => row.sourceReference === sourceReference ? { ...row, [field]: value } : row) } : current)
  }

  function removeRow(sourceReference: string) {
    setPreview((current) => current ? { ...current, rows: current.rows.filter((row) => row.sourceReference !== sourceReference) } : current)
  }

  function confirm() {
    if (!preview || analysis.flagged.length) return
    if (!window.confirm(`Confirmar a importação de ${preview.rows.length} vagas? A operação será atômica e auditada.`)) return
    setError(''); setSuccess('')
    startTransition(async () => {
      const result = await confirmSigecVacancyImport(processId, JSON.stringify({ sourceSha256: preview.sourceSha256, rows: preview.rows }))
      if (result.error) setError(result.error)
      if (result.success) { setSuccess(result.success); setPreview(null); router.refresh() }
    })
  }

  if (!editable) return null
  const inputStyle = { background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))' }
  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div><p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: 'hsl(var(--accent-blue))' }}>Importação auditável</p><h2 className="mt-1 font-semibold" style={{ color: 'hsl(var(--fg1))' }}>Revisar vagas dos anexos</h2><p className="mt-1 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Carregue o JSON gerado pelo extrator. Nenhuma linha é gravada antes da confirmação.</p></div>
        <label className="ds-btn ds-btn--secondary cursor-pointer"><UploadCloud className="h-4 w-4" /> Carregar prévia<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} /></label>
      </div>
      {(error || success) && <p aria-live="polite" className="mx-5 mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: error ? 'hsl(var(--destructive) / .08)' : 'hsl(var(--accent-green) / .08)', color: error ? 'hsl(var(--destructive))' : 'hsl(var(--accent-green))' }}>{error || success}</p>}
      {!preview ? <div className="px-5 py-10 text-center"><FileJson className="mx-auto h-7 w-7" style={{ color: 'hsl(var(--fg3))' }} /><p className="mt-3 text-xs" style={{ color: 'hsl(var(--fg3))' }}>Aguardando arquivo de prévia.</p></div> : <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Linhas no lote" value={preview.rows.length} tone="blue" /><Metric label="Pendências" value={analysis.flagged.length} tone={analysis.flagged.length ? 'amber' : 'green'} /><Metric label="Linhas duplicadas" value={analysis.duplicateRows} tone={analysis.duplicateRows ? 'amber' : 'green'} /></div>
        {analysis.flagged.length > 0 && <div className="mt-5 space-y-3"><div className="flex items-start gap-2 text-xs" style={{ color: 'hsl(var(--accent-amber))' }}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Corrija requisitos vazios e mantenha somente uma linha de cada duplicidade.</div>{analysis.flagged.map((row) => <div key={row.sourceReference} className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold" style={{ color: 'hsl(var(--fg1))' }}>{row.municipality} · {row.modalityName}</p><p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--fg3))' }}>{row.sourceReference}</p></div><button type="button" onClick={() => removeRow(row.sourceReference)} className="rounded-lg p-2" style={{ color: 'hsl(var(--destructive))' }} aria-label="Excluir linha"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Curso<input value={row.courseName} onChange={(event) => updateRow(row.sourceReference, 'courseName', event.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Formação aceita<textarea value={row.acceptedEducation} onChange={(event) => updateRow(row.sourceReference, 'acceptedEducation', event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} /></label><label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Comprovante<textarea value={row.proofInstructions} onChange={(event) => updateRow(row.sourceReference, 'proofInstructions', event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} /></label></div></div>)}</div>}
        <button type="button" onClick={confirm} disabled={isPending || analysis.flagged.length > 0} className="ds-btn ds-btn--primary mt-5 w-full justify-center">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar {preview.rows.length} vagas</button>
      </div>}
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'amber' | 'green' }) {
  const color = tone === 'blue' ? 'var(--accent-blue)' : tone === 'amber' ? 'var(--accent-amber)' : 'var(--accent-green)'
  return <div className="rounded-xl p-4" style={{ background: `hsl(${color} / .07)`, border: `1px solid hsl(${color} / .22)` }}><p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: `hsl(${color})` }}>{label}</p><p className="mt-2 font-data text-2xl" style={{ color: 'hsl(var(--fg1))' }}>{value}</p></div>
}
