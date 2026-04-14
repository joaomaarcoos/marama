import Link from 'next/link'
import { Search, Users, GraduationCap, Tags, ArrowRight, CircleHelp } from 'lucide-react'
import { adminClient } from '@/lib/supabase/admin'
import { listContactProfiles, type ContactProfile } from '@/lib/contacts'
import { formatDate, formatPhone } from '@/lib/utils'
import ContactsToolbar from '@/components/contacts-toolbar'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { q?: string }
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

function DetailLink({ profile }: { profile: ContactProfile }) {
  return (
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
  )
}

export default async function ContatosPage({ searchParams }: PageProps) {
  const query = searchParams.q?.trim() ?? ''

  const [profiles, labelsResult] = await Promise.all([
    listContactProfiles({ search: query }),
    adminClient.from('labels').select('id, name, color').order('created_at', { ascending: true }),
  ])

  const labels = (labelsResult.data ?? []) as LabelRow[]
  const labelMap = new Map(labels.map((label) => [label.id, label]))

  const total = profiles.length
  const withMoodle = profiles.filter((profile) => profile.hasMoodleData).length
  const operationalOnly = profiles.filter((profile) => !profile.hasMoodleData && profile.hasOperationalData).length
  const withLabels = profiles.filter((profile) => profile.labels.length > 0).length

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: 'hsl(213 31% 91%)' }}
            >
              Contatos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'hsl(215 18% 55%)' }}>
              Este modulo centraliza a identidade operacional de cada pessoa atendida pela MARA.
              Ele cruza conversas, dados internos e vinculos do Moodle para mostrar quem ja esta
              reconhecido, o que ainda nao esta vinculado e onde faltam dados.
            </p>
          </div>

          <form className="flex w-full max-w-xl items-center gap-3 lg:w-auto" method="GET">
          <div
            className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: 'hsl(220 40% 8%)',
              border: '1px solid hsl(216 32% 15%)',
            }}
          >
            <Search className="h-4 w-4" style={{ color: 'hsl(215 18% 40%)' }} />
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
            style={{
              color: 'hsl(220 26% 8%)',
              background: 'hsl(160 84% 39%)',
            }}
          >
            Buscar
          </button>
          {query && (
              <Link
                href="/contatos"
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  color: 'hsl(215 18% 55%)',
                  border: '1px solid hsl(216 32% 15%)',
                }}
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        <ContactsToolbar />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Contatos visiveis', value: total, icon: Users, accent: 'hsl(217 91% 60%)' },
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
                  style={{
                    background: card.accent.replace(')', ' / 0.12)'),
                    color: card.accent,
                  }}
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

      {profiles.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-8 py-16 text-center"
          style={{
            background: 'hsl(220 40% 8%)',
            borderColor: 'hsl(216 32% 15%)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
            Nenhum contato encontrado.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            {query
              ? 'Ajuste a busca ou limpe os filtros para ver todos os contatos conhecidos.'
              : 'Assim que chegarem conversas ou dados do Moodle, os contatos consolidados aparecerao aqui.'}
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: 'hsl(220 36% 10%)' }}>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Contato</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Vinculo</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Identificadores</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Contexto</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Ultimo atendimento</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.12em]" style={{ color: 'hsl(215 18% 42%)' }}>Acao</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, index) => {
                const scope = contactScope(profile)
                const visibleIdentifiers = profile.phoneAliases.slice(0, 3)
                const visibleLabels = profile.labels.slice(0, 3).map((labelId) => labelMap.get(labelId)).filter((label): label is LabelRow => Boolean(label))
                const visibleCourses = profile.courses.slice(0, 2)

                return (
                  <tr
                    key={profile.id}
                    style={{
                      borderTop: index === 0 ? 'none' : '1px solid hsl(216 30% 14%)',
                    }}
                  >
                    <td className="px-6 py-5 align-top">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                          {profile.displayName}
                        </p>
                        <p className="text-xs" style={{ color: 'hsl(215 18% 55%)' }}>
                          {profile.studentName && profile.internalName && profile.studentName !== profile.internalName
                            ? `Moodle: ${profile.studentName}`
                            : profile.email ?? profile.canonicalPhone ?? 'Sem identificador principal'}
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
                        {visibleIdentifiers.map((identifier) => (
                          <span key={identifier} className="text-xs" style={{ color: 'hsl(213 31% 92%)' }}>
                            {formatIdentifier(identifier)}
                          </span>
                        ))}
                        {profile.phoneAliases.length > visibleIdentifiers.length && (
                          <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                            +{profile.phoneAliases.length - visibleIdentifiers.length} identificador(es)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 align-top">
                      <div className="flex flex-col gap-2">
                        {visibleCourses.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {visibleCourses.map((course) => (
                              <span
                                key={`${profile.id}-course-${course.id}`}
                                className="rounded-full px-2 py-1 text-[11px]"
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
                          <div className="flex flex-wrap gap-2">
                            {visibleLabels.map((label) => (
                              <span
                                key={label.id}
                                className="rounded-full px-2 py-1 text-[11px]"
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
                            Ainda sem cursos ou etiquetas vinculados.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm" style={{ color: 'hsl(213 31% 92%)' }}>
                          {profile.lastMessageAt ? formatDate(profile.lastMessageAt) : 'Sem historico de conversa'}
                        </span>
                        <span className="text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                          {profile.assignedName
                            ? `Atribuido a ${profile.assignedName.split('@')[0]}`
                            : profile.messageCount > 0
                            ? `${profile.messageCount} mensagem(ns) registradas`
                            : 'Sem atribuicao atual'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right align-top">
                      <DetailLink profile={profile} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
