'use client'

import { useState, useEffect, useCallback } from 'react'
import { TicketCheck, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

interface Ticket {
  id: string
  protocol: string
  phone: string
  subject: string
  status: 'aberto' | 'em_andamento' | 'resolvido' | 'fechado_inatividade'
  assigned_to: string | null
  assigned_name: string | null
  opened_at: string
  closed_at: string | null
  students: { full_name: string } | null
}

interface SystemUser {
  id: string
  email: string
  name: string
}

const STATUS_TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'aberto', label: 'Aberto' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'resolvido', label: 'Resolvido' },
  { key: 'fechado_inatividade', label: 'Fechado (inatividade)' },
]

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em Andamento',
  resolvido: 'Resolvido',
  fechado_inatividade: 'Fechado',
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    aberto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    resolvido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    fechado_inatividade: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.aberto}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SuportePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [activeTab, setActiveTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<SystemUser[]>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const pageSize = 50

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (activeTab !== 'todos') params.set('status', activeTab)
      if (search) params.set('search', search)
      const res = await fetch(`/api/suporte?${params}`)
      const json = await res.json()
      setTickets(json.tickets ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search])

  useEffect(() => { loadTickets() }, [loadTickets])

  useEffect(() => {
    fetch('/api/usuarios')
      .then(r => r.json())
      .then((data: SystemUser[]) => setUsers(data))
      .catch(() => {})
  }, [])

  async function updateTicket(id: string, patch: Record<string, unknown>) {
    setUpdatingId(id)
    try {
      await fetch(`/api/suporte/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await loadTickets()
    } finally {
      setUpdatingId(null)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setSearch(searchInput)
  }

  function handleTabChange(key: string) {
    setActiveTab(key)
    setPage(0)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <TicketCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Suporte</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gerencie os chamados de suporte abertos pelos alunos via MARA.
            {total > 0 && <span className="ml-2 font-medium text-gray-700 dark:text-gray-300">{total} chamado(s)</span>}
          </p>
        </div>
        <button
          onClick={loadTickets}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por protocolo, telefone ou assunto..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>
        <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Buscar
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setPage(0) }}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Limpar
          </button>
        )}
      </form>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Protocolo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Aluno / Telefone</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Assunto</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Abertura</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Encerramento</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Atribuído a</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Carregando...</td>
              </tr>
            )}
            {!loading && tickets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum chamado encontrado.</td>
              </tr>
            )}
            {tickets.map(ticket => (
              <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {ticket.protocol}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                    {ticket.students?.full_name ?? '—'}
                  </div>
                  <div className="text-gray-400 text-xs">{ticket.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={ticket.subject}>
                  {ticket.subject}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {fmt(ticket.opened_at)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {fmt(ticket.closed_at)}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={ticket.assigned_to ?? ''}
                    disabled={updatingId === ticket.id}
                    onChange={e => {
                      const uid = e.target.value
                      const u = users.find(u => u.id === uid)
                      updateTicket(ticket.id, {
                        assigned_to: uid || null,
                        assigned_name: u?.name || null,
                      })
                    }}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 max-w-[140px]"
                  >
                    <option value="">— Não atribuído —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={ticket.status}
                    disabled={updatingId === ticket.id}
                    onChange={e => updateTicket(ticket.id, { status: e.target.value })}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                  >
                    <option value="aberto">Aberto</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="fechado_inatividade">Fechado (inatividade)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
