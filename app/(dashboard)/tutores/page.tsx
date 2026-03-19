'use client'

import { useState, useEffect, useMemo } from 'react'
import { GraduationCap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface TutorCourse {
  id: number
  name: string
  lastaccess: number
}

interface Tutor {
  id: number
  fullname: string
  email: string
  username: string
  roles: { roleid: number; name: string; shortname: string }[]
  courses: TutorCourse[]
  lastaccess: number
}

type RoleFilter = 'all' | 'editingteacher' | 'teacher'
type SortDir = 'asc' | 'desc'

function statusBadge(lastaccess: number) {
  if (!lastaccess) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">Nunca acessou</span>
  }
  const days = (Date.now() / 1000 - lastaccess) / 86400
  if (days < 7) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-900 text-green-300">Ativo</span>
  }
  if (days < 30) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900 text-yellow-300">Recente</span>
  }
  return <span className="px-2 py-0.5 rounded-full text-xs bg-red-900 text-red-300">Inativo</span>
}

function formatDate(unix: number) {
  if (!unix) return '-'
  return new Date(unix * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function roleLabel(roles: Tutor['roles']) {
  const has = (id: number) => roles.some((r) => r.roleid === id)
  if (has(3) && has(4)) return 'Professor + Tutor'
  if (has(3)) return 'Professor'
  if (has(4)) return 'Tutor'
  return roles.map((r) => r.name).join(', ')
}

export default function TutoresPage() {
  const [tutors, setTutors] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/moodle/tutores')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar')
      setTutors(json.tutors ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = tutors
    if (roleFilter === 'editingteacher') {
      list = list.filter((t) => t.roles.some((r) => r.roleid === 3))
    } else if (roleFilter === 'teacher') {
      list = list.filter((t) => t.roles.some((r) => r.roleid === 4))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) => t.fullname.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) =>
      sortDir === 'desc' ? b.lastaccess - a.lastaccess : a.lastaccess - b.lastaccess
    )
  }, [tutors, roleFilter, sortDir, search])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const counts = useMemo(() => ({
    all: tutors.length,
    teachers: tutors.filter((t) => t.roles.some((r) => r.roleid === 3)).length,
    tutors: tutors.filter((t) => t.roles.some((r) => r.roleid === 4)).length,
    active: tutors.filter((t) => t.lastaccess && (Date.now() / 1000 - t.lastaccess) < 7 * 86400).length,
    inactive: tutors.filter((t) => !t.lastaccess || (Date.now() / 1000 - t.lastaccess) >= 30 * 86400).length,
  }), [tutors])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Tutores e Professores</h1>
            <p className="text-sm text-gray-400">Logs de atividade por curso</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: counts.all, color: 'text-blue-400' },
            { label: 'Professores', value: counts.teachers, color: 'text-purple-400' },
            { label: 'Tutores', value: counts.tutors, color: 'text-indigo-400' },
            { label: 'Ativos (7d)', value: counts.active, color: 'text-green-400' },
          ].map((c) => (
            <div key={c.label} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
        />
        <div className="flex gap-2">
          {(['all', 'editingteacher', 'teacher'] as RoleFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setRoleFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                roleFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'editingteacher' ? 'Professores' : 'Tutores'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 transition-colors"
        >
          Ultimo acesso
          {sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Buscando tutores no Moodle...</p>
          <p className="text-gray-500 text-xs mt-1">Pode demorar alguns segundos</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'tutor/professor' : 'tutores/professores'}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              Nenhum tutor encontrado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Papel</th>
                  <th className="text-left px-4 py-3">Cursos</th>
                  <th className="text-left px-4 py-3">Ultimo Acesso</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filtered.map((tutor) => (
                  <>
                    <tr
                      key={tutor.id}
                      className="hover:bg-gray-750 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{tutor.fullname}</p>
                        <p className="text-gray-500 text-xs">{tutor.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{roleLabel(tutor.roles)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tutor.courses.slice(0, 3).map((c) => (
                            <span
                              key={c.id}
                              className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
                              title={c.name}
                            >
                              {c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name}
                            </span>
                          ))}
                          {tutor.courses.length > 3 && (
                            <span className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-500">
                              +{tutor.courses.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                        {formatDate(tutor.lastaccess)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(tutor.lastaccess)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(tutor.id)}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {expanded.has(tutor.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expanded.has(tutor.id) && (
                      <tr key={`${tutor.id}-detail`} className="bg-gray-900">
                        <td colSpan={6} className="px-6 py-3">
                          <p className="text-xs text-gray-400 mb-2 font-medium">Acesso por curso:</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {[...tutor.courses]
                              .sort((a, b) => b.lastaccess - a.lastaccess)
                              .map((c) => (
                                <div
                                  key={c.id}
                                  className="flex justify-between items-center bg-gray-800 rounded px-2 py-1.5"
                                >
                                  <span className="text-xs text-gray-300 truncate flex-1 mr-2">
                                    {c.name}
                                  </span>
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
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
      )}
    </div>
  )
}
