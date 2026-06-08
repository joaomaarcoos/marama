'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface TutorCourse {
  id: number
  name: string
  lastaccess: number
}

interface TutorRow {
  id: string
  moodle_id: number
  full_name: string
  email: string | null
  username: string | null
  roles: { roleid: number; name: string; shortname: string }[]
  courses: TutorCourse[]
  lastaccess: number
  last_synced_at: string | null
}

function statusBadge(lastaccess: number) {
  const base = 'px-2 py-0.5 rounded-full text-xs font-medium'
  if (!lastaccess) return <span className={base} style={{ background: 'hsl(var(--badge-never-bg))', color: 'hsl(var(--badge-never-text))' }}>Nunca acessou</span>
  const days = (Date.now() / 1000 - lastaccess) / 86400
  if (days < 7) return <span className={base} style={{ background: 'hsl(var(--badge-active-bg))', color: 'hsl(var(--badge-active-text))' }}>Ativo</span>
  if (days < 30) return <span className={base} style={{ background: 'hsl(var(--badge-recent-bg))', color: 'hsl(var(--badge-recent-text))' }}>Recente</span>
  return <span className={base} style={{ background: 'hsl(var(--badge-inactive-bg))', color: 'hsl(var(--badge-inactive-text))' }}>Inativo</span>
}

function formatDate(unix: number) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function roleLabel(roles: TutorRow['roles']) {
  const has = (id: number) => roles.some(r => r.roleid === id)
  if (has(3) && has(4)) return 'Professor + Tutor'
  if (has(3)) return 'Professor'
  if (has(4)) return 'Tutor'
  return roles.map(r => r.name).join(', ')
}

type SortDir = 'asc' | 'desc'

export function TutoresTable({ tutores }: { tutores: TutorRow[] }) {
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = tutores
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.full_name.toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      sortDir === 'desc' ? b.lastaccess - a.lastaccess : a.lastaccess - b.lastaccess
    )
  }, [tutores, sortDir, search])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm w-64 outline-none transition-colors"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
          onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--primary))' }}
          onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--border))' }}
        />
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          Último acesso
          {sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="px-4 py-3 text-xs" style={{ borderBottom: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
          {filtered.length} {filtered.length === 1 ? 'tutor/professor' : 'tutores/professores'}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Nenhum tutor encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase" style={{ background: 'hsl(var(--background))', color: 'hsl(var(--muted-foreground))' }}>
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Papel</th>
                <th className="text-left px-4 py-3">Cursos</th>
                <th className="text-left px-4 py-3">Último Acesso</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tutor => (
                <>
                  <tr
                    key={tutor.id}
                    className="transition-colors"
                    style={{ borderTop: '1px solid hsl(var(--border))' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted))' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{tutor.full_name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{tutor.email}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'hsl(var(--foreground) / 0.7)' }}>
                      {roleLabel(tutor.roles ?? [])}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(tutor.courses ?? []).slice(0, 3).map((c: TutorCourse) => (
                          <span
                            key={c.id}
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            title={c.name}
                            style={{ background: 'hsl(var(--badge-course-bg))', color: 'hsl(var(--badge-course-text))' }}
                          >
                            {c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name}
                          </span>
                        ))}
                        {(tutor.courses ?? []).length > 3 && (
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                          >
                            +{tutor.courses.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'hsl(var(--foreground) / 0.65)' }}>
                      {formatDate(tutor.lastaccess)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(tutor.lastaccess)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(tutor.id)}
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {expanded.has(tutor.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>

                  {expanded.has(tutor.id) && (
                    <tr key={`${tutor.id}-detail`} style={{ background: 'hsl(var(--background))', borderTop: '1px solid hsl(var(--border))' }}>
                      <td colSpan={6} className="px-6 py-3">
                        <p className="text-xs mb-2 font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Acesso por curso:
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {[...(tutor.courses ?? [])].sort((a, b) => b.lastaccess - a.lastaccess).map((c: TutorCourse) => (
                            <div
                              key={c.id}
                              className="flex justify-between items-center rounded px-2 py-1.5"
                              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            >
                              <span className="text-xs truncate flex-1 mr-2" style={{ color: 'hsl(var(--foreground) / 0.85)' }}>
                                {c.name}
                              </span>
                              <span className="text-xs whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {c.lastaccess ? formatDate(c.lastaccess) : 'Nunca'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
