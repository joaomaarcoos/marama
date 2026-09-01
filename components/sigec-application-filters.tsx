import Link from 'next/link'
import { Filter, Search, X } from 'lucide-react'
import type { SigecApplicationListFilters } from '@/lib/sigec-application-list'

type Option = { id: string; label: string }

const controlClass = 'min-h-11 w-full rounded-lg border bg-transparent px-3 text-sm outline-none transition focus:ring-2'
const controlStyle = { borderColor: 'hsl(var(--border))', color: 'hsl(var(--fg1))', background: 'hsl(var(--bg))', '--tw-ring-color': 'hsl(var(--accent-blue) / .22)' } as React.CSSProperties

export function SigecApplicationFilters({ filters, processes, municipalities, courses, modalities, stages }: {
  filters: SigecApplicationListFilters
  processes: Option[]
  municipalities: string[]
  courses: Option[]
  modalities: Option[]
  stages: Option[]
}) {
  return <form method="get" className="rounded-2xl p-4 sm:p-5" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <label className="min-w-0 flex-1 text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>
        Buscar candidato ou protocolo
        <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'hsl(var(--fg3))' }} /><input name="search" defaultValue={filters.search || ''} maxLength={100} placeholder="Digite um nome ou protocolo" className={`${controlClass} pl-9`} style={controlStyle} /></span>
      </label>
      <label className="w-full text-xs font-semibold lg:w-72" style={{ color: 'hsl(var(--fg2))' }}>Processo<select name="processId" defaultValue={filters.processId || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todos os processos</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button className="ds-btn ds-btn--primary min-h-11 lg:px-6" type="submit"><Filter className="h-4 w-4" /> Aplicar filtros</button>
    </div>
    <details className="group mt-4" open={Boolean(filters.municipality || filters.courseId || filters.modalityId || filters.competition !== 'all' || filters.state || filters.stageId || filters.pending !== 'all')}>
      <summary className="cursor-pointer select-none text-xs font-semibold" style={{ color: 'hsl(var(--accent-blue))' }}>Mais filtros</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Município<select name="municipality" defaultValue={filters.municipality || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todos</option>{municipalities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Curso / especialidade<select name="courseId" defaultValue={filters.courseId || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todos</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Modalidade<select name="modalityId" defaultValue={filters.modalityId || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todas</option>{modalities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Concorrência<select name="competition" defaultValue={filters.competition} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="all">Todas</option><option value="geral">Geral</option><option value="pcd">PCD</option><option value="ppp">PPP</option></select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Situação da inscrição<select name="state" defaultValue={filters.state || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todas</option><option value="draft">Rascunho</option><option value="submitted">Enviada</option><option value="withdrawn">Retirada</option></select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Etapa atual<select name="stageId" defaultValue={filters.stageId || ''} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="">Todas</option>{stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-semibold" style={{ color: 'hsl(var(--fg2))' }}>Pendência<select name="pending" defaultValue={filters.pending} className={`${controlClass} mt-1.5`} style={controlStyle}><option value="all">Todas</option><option value="with">Com pendência</option><option value="without">Sem pendência</option></select></label>
        <div className="flex items-end"><Link href="/sigec-candidaturas" className="ds-btn ds-btn--secondary min-h-11 w-full"><X className="h-4 w-4" /> Limpar filtros</Link></div>
      </div>
    </details>
  </form>
}
