import { adminClient } from './supabase/admin'
import { buildSystemPrompt } from './prompt-builder'
import { sendText, downloadMedia } from './evolution'
import { chatCompletion, transcribeAudio, buildImageMessage, ChatMessage } from './openai'
import { normalizePhone, normalizeCpf, extractCpf } from './utils'
import { searchRelevantChunks, buildRagContext } from './rag'
import {
  getUserGradeOverview,
  getCourseCompletion,
  getCourseActivitiesCompletion,
  getUserEnrollmentInfo,
  formatGradeContext,
  formatCompletionContext,
  formatActivitiesContext,
  formatEnrollmentContext,
  MoodleCourse,
} from './moodle'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookMessage {
  type: 'text' | 'audio' | 'image' | 'document' | 'unknown'
  text?: string
  caption?: string
  mediaId?: string
  mimetype?: string
}

export interface MessageRouting {
  replyTarget?: string
  jidOriginal?: string | null
  jidReal?: string | null
}

interface StudentRow {
  id: string
  moodle_id: number | null
  full_name: string
  email: string | null
  courses: MoodleCourse[]
  role: 'aluno' | 'gestor'
}

type MoodleIntent = 'notas' | 'certificado' | 'progresso' | 'matricula'

type Identity =
  | { type: 'aluno'; student: StudentRow }
  | { type: 'gestor'; student: StudentRow }
  | { type: 'desconhecido' }

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_MESSAGE =
  'Olá! Estou com dificuldades técnicas no momento. Por favor, tente novamente em instantes. 🙏'

const LGPD_NOTICE =
  `Olá! 👋 Antes de prosseguir, preciso te informar que este atendimento é realizado pela *MARA*, assistente virtual do *Maranhão Profissionalizado*.\n\n` +
  `Ao continuar esta conversa, você concorda com o tratamento dos seus dados pessoais conforme a *Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)*, utilizados exclusivamente para fins de suporte educacional.\n\n` +
  `Para prosseguir, responda *SIM* ou *Concordo*. ✅`

const LGPD_ACK =
  `Ótimo! Seus dados estão protegidos e o atendimento pode começar. 😊 Como posso te ajudar hoje?`

const FOLLOWUP_MESSAGE =
  `Oi, ainda está por aí? 😊 Fico à disposição se precisar de mais alguma ajuda com seus estudos!`

const CLOSING_MESSAGE =
  `Seu atendimento foi encerrado por inatividade. Fique à vontade para entrar em contato novamente sempre que precisar. Até logo! 👋`

const CONSENT_REGEX = /\b(sim|s|concordo|aceito|ok|tudo\s*bem|claro|certo|pode|beleza|positivo|afirmativo|aceito\s*sim|concordo\s*sim)\b/i

const MOODLE_INTENT_KEYWORDS: Record<MoodleIntent, string[]> = {
  notas: ['nota', 'notas', 'grade', 'média', 'media', 'desempenho', 'pontuação', 'pontuacao'],
  certificado: [
    'certificado', 'certificar', 'certificação', 'certificacao',
    'diploma', 'concluí', 'concluir', 'conclui', 'conclusão', 'conclusao',
  ],
  progresso: [
    'progresso', 'andamento', 'quanto fiz', 'atividades', 'atividade',
    'completei', 'completar', 'quantas aulas', 'quanto completei',
  ],
  matricula: [
    'matrícula', 'matricula', 'matriculado', 'inscrito', 'inscrição',
    'inscricao', 'situação', 'situacao', 'status', 'ativo', 'suspens',
  ],
}

// ─── Identity Resolution ──────────────────────────────────────────────────────

async function resolveIdentity(phone: string, messageText?: string): Promise<Identity> {
  const normalized = normalizePhone(phone)

  if (normalized) {
    const { data: student } = await adminClient
      .from('students')
      .select('id, moodle_id, full_name, email, courses, role')
      .or(`phone.eq.${normalized},phone2.eq.${normalized}`)
      .single()

    if (student) {
      const s = student as StudentRow
      return { type: s.role === 'gestor' ? 'gestor' : 'aluno', student: s }
    }
  }

  if (messageText) {
    const cpf = extractCpf(messageText)
    const normalizedCpf = normalizeCpf(cpf)
    if (normalizedCpf) {
      const { data: student } = await adminClient
        .from('students')
        .select('id, moodle_id, full_name, email, courses, role, phone')
        .eq('cpf', normalizedCpf)
        .single()

      if (student) {
        if (!student.phone && normalized) {
          await adminClient.from('students').update({ phone: normalized }).eq('id', student.id)
        }
        const s = student as StudentRow
        return { type: s.role === 'gestor' ? 'gestor' : 'aluno', student: s }
      }
    }
  }

  return { type: 'desconhecido' }
}

function buildIdentityContext(identity: Identity): string | null {
  if (identity.type === 'desconhecido') {
    return (
      'Este usuário ainda não foi identificado no sistema. ' +
      'Se ainda não perguntou o CPF nesta conversa, peça-o educadamente para personalizar o atendimento. ' +
      'Formato esperado: XXX.XXX.XXX-XX. Não peça o CPF novamente se já perguntou antes nesta mesma conversa.'
    )
  }

  const { student } = identity
  const courses = Array.isArray(student.courses) ? student.courses : []
  const courseList =
    courses.length > 0
      ? courses.map((c: MoodleCourse) => c.fullname || c.shortname).join(', ')
      : 'nenhum curso encontrado'

  if (identity.type === 'gestor') {
    return `Pessoa identificada: ${student.full_name} (GESTOR do programa). Email: ${student.email ?? 'não informado'}.`
  }

  return (
    `Aluno identificado: ${student.full_name}. ` +
    `Email: ${student.email ?? 'não informado'}. ` +
    `Cursos matriculados: ${courseList}.`
  )
}

// ─── Moodle Intent Detection ──────────────────────────────────────────────────

function detectMoodleIntent(text: string): MoodleIntent | null {
  const lower = text.toLowerCase()
  for (const [intent, keywords] of Object.entries(MOODLE_INTENT_KEYWORDS) as [MoodleIntent, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return intent
  }
  return null
}

// ─── On-demand Moodle Context Fetcher ────────────────────────────────────────

async function fetchMoodleContext(student: StudentRow, intent: MoodleIntent): Promise<string | null> {
  if (!student.moodle_id) return null

  const courses = Array.isArray(student.courses) ? (student.courses as MoodleCourse[]) : []
  const firstCourse = courses[0]

  try {
    switch (intent) {
      case 'notas': {
        const grades = await getUserGradeOverview(student.moodle_id)
        return `### Notas\n${formatGradeContext(grades, courses)}`
      }
      case 'certificado': {
        if (!firstCourse) return 'Nenhum curso matriculado para verificar certificado.'
        if (courses.length > 1) {
          const results = await Promise.all(
            courses.map(async (c) => {
              const comp = await getCourseCompletion(student.moodle_id!, c.id)
              return formatCompletionContext(comp, c.fullname || c.shortname)
            })
          )
          return `### Status de Conclusão / Certificados\n${results.join('\n')}`
        }
        const completion = await getCourseCompletion(student.moodle_id, firstCourse.id)
        return `### Status de Conclusão / Certificado\n${formatCompletionContext(completion, firstCourse.fullname || firstCourse.shortname)}`
      }
      case 'progresso': {
        if (!firstCourse) return 'Nenhum curso encontrado para verificar progresso.'
        const activities = await getCourseActivitiesCompletion(student.moodle_id, firstCourse.id)
        return `### Progresso em "${firstCourse.fullname || firstCourse.shortname}"\n${formatActivitiesContext(activities)}`
      }
      case 'matricula': {
        const enrollments = await getUserEnrollmentInfo(student.moodle_id)
        return `### Situação de Matrícula\n${formatEnrollmentContext(enrollments)}`
      }
    }
  } catch (err) {
    console.error(`[MARA] Moodle on-demand fetch error (${intent}):`, err)
    return null
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function processMessages(
  phone: string,
  messages: WebhookMessage[],
  routing: MessageRouting = {}
): Promise<void> {
  try {
    const replyTarget = routing.replyTarget ?? phone

    // 1. Upsert conversation + fetch LGPD/followup state
    await adminClient.from('conversations').upsert(
      {
        phone,
        last_message_at: new Date().toISOString(),
        last_message: messages.map(m => m.text ?? m.caption ?? `[${m.type}]`).join(' '),
        status: 'active',
      },
      { onConflict: 'phone' }
    )

    const { data: conv } = await adminClient
      .from('conversations')
      .select('lgpd_accepted_at, followup_stage')
      .eq('phone', phone)
      .single()

    const combinedRawText = messages
      .map(m => m.text ?? m.caption ?? '')
      .join(' ')
      .trim()

    // 2. LGPD gate — first-time users must consent before any GPT processing
    if (!conv?.lgpd_accepted_at) {
      const isConsent = CONSENT_REGEX.test(combinedRawText)

      if (isConsent) {
        await adminClient
          .from('conversations')
          .update({ lgpd_accepted_at: new Date().toISOString() })
          .eq('phone', phone)
        await sendText(replyTarget, LGPD_ACK)
        return
      } else {
        await sendText(replyTarget, LGPD_NOTICE)
        return
      }
    }

    // 3. Inactivity reset — if user was in follow-up, receiving any message resets it
    if (conv?.followup_stage === 'followup_1') {
      await adminClient
        .from('conversations')
        .update({ followup_stage: null, followup_sent_at: null })
        .eq('phone', phone)
    }

    // 4. Build combined user content from all messages in the batch
    let combinedText = ''
    let imageContent: { base64: string; mimetype: string; caption?: string } | null = null

    for (const msg of messages) {
      if (msg.type === 'text' || msg.type === 'document') {
        if (combinedText) combinedText += '\n'
        combinedText += msg.text ?? ''
      } else if (msg.type === 'audio' && msg.mediaId) {
        try {
          const { base64, mimetype } = await downloadMedia(msg.mediaId)
          const transcribed = await transcribeAudio(Buffer.from(base64, 'base64'), mimetype)
          if (combinedText) combinedText += '\n'
          combinedText += `[Áudio transcrito]: ${transcribed}`
        } catch {
          combinedText += '\n[Áudio recebido, mas não foi possível transcrever]'
        }
      } else if (msg.type === 'image' && msg.mediaId) {
        try {
          const { base64, mimetype } = await downloadMedia(msg.mediaId)
          imageContent = { base64, mimetype, caption: msg.caption }
        } catch {
          if (msg.caption) {
            if (combinedText) combinedText += '\n'
            combinedText += msg.caption
          }
        }
      }
    }

    let userContent: ChatMessage['content']

    if (imageContent) {
      const fullCaption = [imageContent.caption, combinedText].filter(Boolean).join('\n') || undefined
      userContent = await buildImageMessage(imageContent.base64, imageContent.mimetype, fullCaption)
    } else {
      userContent = combinedText || '[Mensagem sem conteúdo]'
    }

    // 5. Resolve identity
    const messageText = typeof userContent === 'string' ? userContent : combinedRawText
    const identity = await resolveIdentity(phone, messageText)
    const identityContext = buildIdentityContext(identity)

    if (identity.type !== 'desconhecido') {
      await adminClient
        .from('conversations')
        .update({ student_id: identity.student.id })
        .eq('phone', phone)
    }

    // 6. Fetch chat history
    const { data: history } = await adminClient
      .from('chatmemory')
      .select('role, content')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(20)

    // 7. RAG search
    const queryText = typeof userContent === 'string' ? userContent : JSON.stringify(userContent)
    const ragChunks = await searchRelevantChunks(queryText)
    const ragContext = buildRagContext(ragChunks)

    // 8. Moodle on-demand
    let moodleContext: string | null = null
    if (identity.type === 'aluno' && identity.student.moodle_id) {
      const intent = detectMoodleIntent(queryText)
      if (intent) moodleContext = await fetchMoodleContext(identity.student, intent)
    }

    // 9. Build system prompt + call GPT-4o
    const systemPrompt = await buildSystemPrompt(identityContext, ragContext, moodleContext)

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history ?? []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content as string,
      })),
      { role: 'user', content: userContent },
    ]

    const response = await chatCompletion(chatMessages)

    // 10. Save to chatmemory
    const userContentText = typeof userContent === 'string' ? userContent : JSON.stringify(userContent)

    await adminClient.from('chatmemory').insert([
      { session_id: phone, role: 'user', content: userContentText },
      { session_id: phone, role: 'assistant', content: response },
    ])

    // 11. Update conversation + reply
    await adminClient
      .from('conversations')
      .update({ last_message: response.slice(0, 200), last_message_at: new Date().toISOString() })
      .eq('phone', phone)

    await sendText(replyTarget, response)
  } catch (error) {
    console.error('[MARA Agent] Erro ao processar mensagem:', error)
    try {
      await sendText(routing.replyTarget ?? phone, FALLBACK_MESSAGE)
    } catch {
      console.error('[MARA Agent] Falha ao enviar mensagem de fallback')
    }
  }
}

// ─── Inactivity checker (chamado pelo cron) ───────────────────────────────────

export async function checkInactivity(): Promise<{ followups: number; closings: number }> {
  const now = Date.now()
  const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString()
  const sixtyMinutesAgo  = new Date(now - 60 * 60 * 1000).toISOString()

  let followups = 0
  let closings = 0

  // Conversas ativas há mais de 90 minutos sem follow-up enviado
  const { data: idleConvs } = await adminClient
    .from('conversations')
    .select('phone')
    .eq('status', 'active')
    .is('followup_stage', null)
    .lt('last_message_at', ninetyMinutesAgo)

  for (const conv of idleConvs ?? []) {
    try {
      await sendText(conv.phone, FOLLOWUP_MESSAGE)
      await adminClient
        .from('conversations')
        .update({ followup_stage: 'followup_1', followup_sent_at: new Date().toISOString() })
        .eq('phone', conv.phone)
      followups++
    } catch (err) {
      console.error(`[Inatividade] Erro ao enviar follow-up para ${conv.phone}:`, err)
    }
  }

  // Conversas em follow-up há mais de 1 hora sem resposta
  const { data: staleConvs } = await adminClient
    .from('conversations')
    .select('phone')
    .eq('followup_stage', 'followup_1')
    .lt('followup_sent_at', sixtyMinutesAgo)

  for (const conv of staleConvs ?? []) {
    try {
      await sendText(conv.phone, CLOSING_MESSAGE)
      await adminClient
        .from('conversations')
        .update({ followup_stage: 'closed', status: 'closed' })
        .eq('phone', conv.phone)
      closings++
    } catch (err) {
      console.error(`[Inatividade] Erro ao fechar conversa de ${conv.phone}:`, err)
    }
  }

  return { followups, closings }
}
