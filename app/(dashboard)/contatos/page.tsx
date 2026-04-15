import Link from 'next/link'
import { Search, Users, GraduationCap, Tags, ArrowRight, CircleHelp, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminClient } from '@/lib/supabase/admin'
import { listContactProfiles, type ContactProfile } from '@/lib/contacts'
import { formatDate, formatPhone } from '@/lib/utils'
import ContactsToolbar from '@/components/contacts-toolbar'
import { ContactsFilter } from '@/components/contacts-filter'
import { SendMessageModal } from '@/components/send-message-modal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: { q?: string; source?: string; label?: string; page?: string }
}

interface LabelRow {
  id: string
  name: string
  color: string
}

function formatIdentifier(value: string) {
  return /^\d+$/.test(value) ? formatPhone(value) : value
}

function contactScope(profile: ContactProfile) {
  if (profile.hasMoodleData) return { label: 'Moodle + atendimento', tone: 'hsl(160 84% 39%)' }
  if (profile.hasOperationalData) return { label: 'Somente atendimento', tone: 'hsl(217 91% 60%)' }
  return { label: 'Sem base vinculada', tone: 'hsl(38 92% 50%)' }
}

export default async function ContatosPage({ searchParams }: PageProps) {
  const query = searchParams.q?.trim() ?? ''
  const sourceParam = searchParams.source === 'moodle' || searchParams.source === 'atendimento' ? searchParams.source : undefined
  const labelParam = searchParams.label?.trim() || undefined
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const [allProfiles, labelsResult] = await Promise.all([
    listContactProfiles({ search: query, source: sourceParam, labelId: labelParam }),
    adminClient.from('labels').select('id, name, color').order('name', { ascending: true }),
  ])

  const labels = (labelsResult.data ?? []) as LabelRow[]
  const labelMap = new Map(labels.map((label) => [label.id, label]))

  const total = allProfiles.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const profiles = allProfiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const withMoodle = allProfiles.filter((p) => p.hasMoodleData).length
  const operationalOnly = allProfiles.filter((p) => !p.hasMoodleData && p.hasOperationalData).length
  const withLabels = allProfiles.filter((p) => p.labels.length > 0).length

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (sourceParam) params.set('source', sourceParam)
    if (labelParam) params.set('label', labelParam)
    if (p > 1) params.set('page', String(p))
    const s = params.toString()
    return `/contatos${s ? `?${s}` : ''}`
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(213 31% 91%)' }}>
              Contatos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'hsl(215 18% 55%)' }}>
              Centraliza a identidade operacional de cada pessoa atendida pela MARA, cruzando conversas,
              dados internos e vínculos do Moodle.
            </p>
          </div>

          {/* Barra de busca + Filtrar */}
          <form className="flex w-full max-w-2xl items-center gap-2 lg:w-auto" method="GET">
            {sourceParam && <input type="hidden" name="source" value={sourceParam} />}
            {labelParam && <input type="hidden" name="label" value={labelParam} />}

            <div
              className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: 'hsl(215 18% 40%)' }} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Buscar por nome, telefone, CPF, email ou curso"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[hsl(215_18%_40%)]"
                style={{ color: 'hsl(213 31% 92%)' }}
              />
            </div>

            <button
              type="submit"
              className="rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ color: 'hsl(220 26% 8%)', background: 'hsl(160 84% 39%)' }}
            >
              Buscar
            </button>

            {(query || sourceParam || labelParam) && (
              <Link
                href="/contatos"
                className="rounded-xl px-3 py-2 text-sm"
                style={{ color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 15%)' }}
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        {/* Segunda linha: Filtrar + Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <ContactsFilter
            labels={labels}
            currentSource={sourceParam}
            currentLabel={labelParam}
            currentQuery={query}
          />
          <ContactsToolbar />
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Contatos visíveis', value: total, icon: Users, accent: 'hsl(217 91% 60%)' },
          { label: 'Com Moodle vinculado', value: withMoodle, icon: GraduationCap, accent: 'hsl(160 84% 39%)' },
          { label: 'Somente atendimento', value: operationalOnly, icon: CircleHelp, accent: 'hsl(38 92% 50%)' },
          { label: 'Com etiquetas', value: withLabels, icon: Tags, accent: 'hsl(330 81% 60%)' },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-xl p-5"
              style={{
                background: 'hsl(220 40% 8%)',
                border: '1px solid hsl(216 32% 15%)',
                borderTop: `2px solid ${card.accent}`,
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: card.accent.replace(')', ' / 0.12)'), color: card.accent }}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="font-data text-3xl" style={{ color: 'hsl(213 31% 92%)' }}>
                {card.value.toLocaleString('pt-BR')}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                {card.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Tabela */}
      {profiles.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-8 py-16 text-center"
          style={{ background: 'hsl(220 40% 8%)', borderColor: 'hsl(216 32% 15%)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
            Nenhum contato encontrado.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            {(query || sourceParam || labelParam)
              ? 'Nenhum contato encontrado com os filtros ativos.'
              : 'Assim que chegarem conversas ou dados do Moodle, os contatos aparecem aqui.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className="overflow-hidden rounded-2xl"
            style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)' }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ background: 'hsl(220 36% 10%)' }}>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Contato</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Vínculo</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Identificadores</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Contexto</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Último atendimento</th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, index) => {
                  const scope = contactScope(profile)
                  const visibleIdentifiers = profile.phoneAliases.slice(0, 3)
                  const visibleLabels = profile.labels
                    .slice(0, 3)
                    .map((id) => labelMap.get(id))
                    .filter((l): l is LabelRow => Boolean(l))
                  const visibleCourses = profile.courses.slice(0, 2)

                  return (
                    <tr
                      key={profile.id}
                      style={{ borderTop: index === 0 ? 'none' : '1px solid hsl(216 30% 14%)' }}
                    >
                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-1.5">
                          <p className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                            {profile.displayName}
                          </p>
                          <p className="text-xs" style={{ color: 'hsl(215 18% 55%)' }}>
                            {profile.studentName && profile.internalName && profile.studentName !== profile.internalName
                              ? `Moodle: ${profile.studentName}`
                              : profile.email ?? profile.canonicalPhone ?? 'Sem identificador'}
                          </p>
                        </div>
                      </td>

                      <td className="px-6 py-5 align-top">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{
                            color: scope.tone,
                            background: scope.tone.replace(')', ' / 0.12)'),
                            border: `1px solid ${scope.tone.replace(')', ' / 0.24)')}`,
                          }}
                        >
                          {scope.label}
                        </span>
                      </td>

                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-1.5">
                          {visibleIdentifiers.map((id) => (
                            <span key={id} className="text-xs" style={{ color: 'hsl(213 31% 92%)' }}>
                              {formatIdentifier(id)}
                            </span>
                          ))}
                          {profile.phoneAliases.length > visibleIdentifiers.length && (
                            <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                              +{profile.phoneAliases.length - visibleIdentifiers.length} mais
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-2">
                          {visibleCourses.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {visibleCourses.map((course) => (
                                <span
                                  key={`${profile.id}-course-${course.id}`}
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{
                                    color: 'hsl(160 84% 39%)',
                                    background: 'hsl(160 84% 39% / 0.12)',
                                    border: '1px solid hsl(160 84% 39% / 0.18)',
                                  }}
                                >
                                  {course.shortname ?? course.fullname ?? `Curso ${course.id}`}
                                </span>
                              ))}
                              {profile.courses.length > visibleCourses.length && (
                                <span className="text-[11px]" style={{ color: 'hsl(215 18% 42%)' }}>
                                  +{profile.courses.length - visibleCourses.length} curso(s)
                                </span>
                              )}
                            </div>
                          )}
                          {visibleLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {visibleLabels.map((label) => (
                                <span
                                  key={label.id}
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{
                                    color: label.color,
                                    background: `${label.color}1a`,
                                    border: `1px solid ${label.color}33`,
                                  }}
                                >
                                  {label.name}
                                </span>
                              ))}
                              {profile.labels.length > visibleLabels.length && (
                                <span className="text-[11px]" style={{ color: 'hsl(215 18% 42%)' }}>
                                  +{profile.labels.length - visibleLabels.length} etiqueta(s)
                                </span>
                              )}
                            </div>
                          )}
                          {visibleCourses.length === 0 && visibleLabels.length === 0 && (
                            <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                              Sem cursos ou etiquetas
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm" style={{ color: 'hsl(213 31% 92%)' }}>
                            {profile.lastMessageAt ? formatDate(profile.lastMessageAt) : 'Sem histórico'}
                          </span>
                          <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                            {profile.assignedName
                              ? `Atribuído a ${profile.assignedName.split('@')[0]}`
                              : profile.messageCount > 0
                              ? `${profile.messageCount} mensagem(ns)`
                              : 'Sem atribuição'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-right align-top">
                        <div className="flex flex-col items-end gap-2">
                          <SendMessageModal
                            phone={profile.canonicalPhone ?? profile.phoneAliases[0] ?? profile.id}
                            contactName={profile.displayName}
                          />
                          <Link
                            href={`/contatos/${encodeURIComponent(profile.id)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{
                              color: 'hsl(213 31% 92%)',
                              background: 'hsl(220 38% 12%)',
                              border: '1px solid hsl(216 30% 18%)',
                            }}
                          >
                            Ver contato
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                Página {currentPage} de {totalPages} · {total.toLocaleString('pt-BR')} contatos
              </p>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={pageHref(currentPage - 1)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                    style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', color: 'hsl(213 31% 92%)' }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium opacity-40"
                    style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', color: 'hsl(215 18% 42%)' }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p: number
                    if (totalPages <= 5) {
                      p = i + 1
                    } else if (currentPage <= 3) {
                      p = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      p = totalPages - 4 + i
                    } else {
                      p = currentPage - 2 + i
                    }
                    return (
                      <Link
                        key={p}
                        href={pageHref(p)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors"
                        style={
                          p === currentPage
                            ? { background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }
                            : { background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', color: 'hsl(215 18% 55%)' }
                        }
                      >
                        {p}
                      </Link>
                    )
                  })}
                </div>

                {currentPage < totalPages ? (
                  <Link
                    href={pageHref(currentPage + 1)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                    style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', color: 'hsl(213 31% 92%)' }}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium opacity-40"
                    style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 15%)', color: 'hsl(215 18% 42%)' }}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
