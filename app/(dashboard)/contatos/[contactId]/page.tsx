import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageSquare, GraduationCap, Mail, Phone, UserCircle2, BadgeInfo, Tags, Hash, CheckCircle2 } from 'lucide-react'
import { adminClient } from '@/lib/supabase/admin'
import { getContactProfileById } from '@/lib/contacts'
import { formatCpf, formatDate, formatPhone } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { contactId: string }
}

interface LabelRow {
  id: string
  name: string
  color: string
}

interface LinkedConversation {
  phone: string
  status: string | null
  followup_stage: string | null
  last_message_at: string | null
  last_message: string | null
  assigned_name: string | null
  labels: string[] | null
}

function formatIdentifier(value: string) {
  return /^\d+$/.test(value) ? formatPhone(value) : value
}

export default async function ContactDetailPage({ params }: PageProps) {
  const contactId = decodeURIComponent(params.contactId)

  const [profile, labelsResult] = await Promise.all([
    getContactProfileById(contactId),
    adminClient.from('labels').select('id, name, color'),
  ])

  if (!profile) notFound()

  const linkedConversationsResult = profile.conversationPhones.length > 0
    ? await adminClient
        .from('conversations')
        .select('phone, status, followup_stage, last_message_at, last_message, assigned_name, labels')
        .in('phone', profile.conversationPhones)
        .order('last_message_at', { ascending: false })
    : { data: [] as LinkedConversation[] }

  const labels = (labelsResult.data ?? []) as LabelRow[]
  const labelMap = new Map(labels.map((label) => [label.id, label]))
  const linkedConversations = (linkedConversationsResult.data ?? []) as LinkedConversation[]

  const primaryTone = profile.hasMoodleData
    ? 'hsl(160 84% 39%)'
    : profile.hasOperationalData
    ? 'hsl(217 91% 60%)'
    : 'hsl(38 92% 50%)'

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/contatos"
            className="mb-3 inline-flex items-center gap-2 text-sm"
            style={{ color: 'hsl(215 18% 55%)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para contatos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(213 31% 91%)' }}>
            {profile.displayName}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            Visao consolidada do contato para operacao, historico de atendimento e vinculos academicos.
          </p>
        </div>

        {profile.conversationPhones[0] && (
          <Link
            href={`/conversas/${encodeURIComponent(profile.conversationPhones[0])}`}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            style={{
              color: 'hsl(220 26% 8%)',
              background: primaryTone,
            }}
          >
            <MessageSquare className="h-4 w-4" />
            Abrir conversa
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.35fr,0.95fr]">
        <section
          className="rounded-2xl p-6"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
            borderTop: `2px solid ${primaryTone}`,
          }}
        >
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'hsl(215 18% 42%)' }}>
                Identidade consolidada
              </p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                {profile.displayName}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    color: primaryTone,
                    background: primaryTone.replace(')', ' / 0.12)'),
                    border: `1px solid ${primaryTone.replace(')', ' / 0.22)')}`,
                  }}
                >
                  {profile.hasMoodleData ? 'Moodle + atendimento' : profile.hasOperationalData ? 'Somente atendimento' : 'Sem base vinculada'}
                </span>
                {profile.role && (
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      color: 'hsl(330 81% 60%)',
                      background: 'hsl(330 81% 60% / 0.12)',
                      border: '1px solid hsl(330 81% 60% / 0.2)',
                    }}
                  >
                    {profile.role === 'gestor' ? 'Gestor' : 'Aluno'}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'hsl(215 18% 42%)' }}>
                Ultimo contato
              </p>
              <p className="mt-2 text-sm" style={{ color: 'hsl(213 31% 92%)' }}>
                {profile.lastMessageAt ? formatDate(profile.lastMessageAt) : 'Sem historico registrado'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 55%)' }}>
                {profile.messageCount > 0 ? `${profile.messageCount} mensagem(ns) registradas` : 'Nenhuma mensagem consolidada'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Phone, label: 'Telefone principal', value: profile.canonicalPhone ? formatIdentifier(profile.canonicalPhone) : 'Nao informado' },
              { icon: UserCircle2, label: 'Nome interno', value: profile.internalName ?? 'Nao definido' },
              { icon: Mail, label: 'Email', value: profile.email ?? 'Nao informado' },
              { icon: Hash, label: 'CPF', value: profile.cpf ? formatCpf(profile.cpf) : 'Nao informado' },
              { icon: BadgeInfo, label: 'Moodle ID', value: profile.moodleId ? String(profile.moodleId) : 'Nao vinculado' },
              { icon: GraduationCap, label: 'Usuario Moodle', value: profile.username ?? 'Nao informado' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'hsl(220 36% 10%)',
                    border: '1px solid hsl(216 30% 14%)',
                  }}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
                    {item.value}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        <section
          className="rounded-2xl p-6"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <div className="mb-4 flex items-center gap-2">
            <Tags className="h-4 w-4" style={{ color: 'hsl(330 81% 60%)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
              Etiquetas e status
            </h2>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {profile.labels.length > 0 ? (
              profile.labels.map((labelId) => {
                const label = labelMap.get(labelId)
                if (!label) return null

                return (
                  <span
                    key={label.id}
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      color: label.color,
                      background: `${label.color}1a`,
                      border: `1px solid ${label.color}33`,
                    }}
                  >
                    {label.name}
                  </span>
                )
              })
            ) : (
              <span className="text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
                Nenhuma etiqueta vinculada ainda.
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: 'hsl(220 36% 10%)',
                border: '1px solid hsl(216 30% 14%)',
              }}
            >
              <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
                Conhecimento atual da MARA
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: 'hsl(213 31% 92%)' }}>
                {profile.hasMoodleData
                  ? 'A MARA ja consegue reconhecer este contato como pessoa vinculada ao Moodle e usar contexto academico no atendimento.'
                  : profile.hasOperationalData
                  ? 'A MARA ja conhece este contato pelo atendimento interno, mas ainda sem vinculo academico confirmado.'
                  : 'Ainda nao ha dados suficientes para reconhecer este contato com contexto interno.'}
              </p>
            </div>

            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: 'hsl(220 36% 10%)',
                border: '1px solid hsl(216 30% 14%)',
              }}
            >
              <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
                LGPD
              </p>
              <p className="mt-2 text-sm" style={{ color: 'hsl(213 31% 92%)' }}>
                {profile.lgpdAcceptedAt ? `Aceita em ${formatDate(profile.lgpdAcceptedAt)}` : 'Sem aceite registrado'}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section
          className="rounded-2xl p-6"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <div className="mb-5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" style={{ color: 'hsl(217 91% 60%)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
              Identificadores vinculados
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {profile.phoneAliases.map((alias) => (
              <div
                key={alias}
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'hsl(220 36% 10%)',
                  border: '1px solid hsl(216 30% 14%)',
                  color: 'hsl(213 31% 92%)',
                }}
              >
                {formatIdentifier(alias)}
              </div>
            ))}
          </div>
        </section>

        <section
          className="rounded-2xl p-6"
          style={{
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 15%)',
          }}
        >
          <div className="mb-5 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" style={{ color: 'hsl(160 84% 39%)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
              Cursos do Moodle
            </h2>
          </div>

          {profile.courses.length === 0 ? (
            <p className="text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
              Nenhum curso vinculado ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {profile.courses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'hsl(220 36% 10%)',
                    border: '1px solid hsl(216 30% 14%)',
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
                    {course.fullname ?? course.shortname ?? `Curso ${course.id}`}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                    {course.shortname ? `Codigo: ${course.shortname}` : `ID: ${course.id}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section
        className="mt-6 rounded-2xl p-6"
        style={{
          background: 'hsl(220 40% 8%)',
          border: '1px solid hsl(216 32% 15%)',
        }}
      >
        <div className="mb-5 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: 'hsl(217 91% 60%)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'hsl(215 18% 42%)' }}>
            Conversas vinculadas
          </h2>
        </div>

        {linkedConversations.length === 0 ? (
          <p className="text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
            Ainda nao ha conversa vinculada a este contato.
          </p>
        ) : (
          <div className="space-y-3">
            {linkedConversations.map((conversation) => (
              <div
                key={conversation.phone}
                className="flex flex-col gap-3 rounded-xl px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                style={{
                  background: 'hsl(220 36% 10%)',
                  border: '1px solid hsl(216 30% 14%)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
                    {formatIdentifier(conversation.phone)}
                  </p>
                  <p className="mt-1 truncate text-sm" style={{ color: 'hsl(215 18% 55%)' }}>
                    {conversation.last_message ?? 'Sem ultima mensagem consolidada'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
                    {conversation.last_message_at ? formatDate(conversation.last_message_at) : 'Sem data'}
                    {conversation.assigned_name ? ` · ${conversation.assigned_name.split('@')[0]}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      color: conversation.status === 'closed' || conversation.followup_stage === 'closed'
                        ? 'hsl(0 72% 60%)'
                        : 'hsl(160 84% 39%)',
                      background: conversation.status === 'closed' || conversation.followup_stage === 'closed'
                        ? 'hsl(0 72% 60% / 0.12)'
                        : 'hsl(160 84% 39% / 0.12)',
                      border: conversation.status === 'closed' || conversation.followup_stage === 'closed'
                        ? '1px solid hsl(0 72% 60% / 0.2)'
                        : '1px solid hsl(160 84% 39% / 0.2)',
                    }}
                  >
                    {conversation.status === 'closed' || conversation.followup_stage === 'closed' ? 'Encerrada' : 'Ativa'}
                  </span>

                  <Link
                    href={`/conversas/${encodeURIComponent(conversation.phone)}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{
                      color: 'hsl(213 31% 92%)',
                      background: 'hsl(220 38% 12%)',
                      border: '1px solid hsl(216 30% 18%)',
                    }}
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
