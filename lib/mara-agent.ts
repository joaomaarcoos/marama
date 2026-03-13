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

interface WebhookMessage {
  type: 'text' | 'audio' | 'image' | 'document' | 'unknown'
  text?: string
  caption?: string
  mediaId?: string
  mimetype?: string
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

  // 1. Try phone-based lookup
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

  // 2. CPF fallback — extract CPF from message text and search
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
        // Auto-link WhatsApp number if student has no phone yet
        if (!student.phone && normalized) {
          await adminClient
            .from('students')
            .update({ phone: normalized })
            .eq('id', student.id)
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
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent
    }
  }
  return null
}

// ─── On-demand Moodle Context Fetcher ────────────────────────────────────────

async function fetchMoodleContext(
  student: StudentRow,
  intent: MoodleIntent
): Promise<string | null> {
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

export async function processMessage(phone: string, message: WebhookMessage): Promise<void> {
  try {
    // 1. UPSERT conversations
    await adminClient.from('conversations').upsert(
      {
        phone,
        last_message_at: new Date().toISOString(),
        last_message: message.text ?? message.caption ?? `[${message.type}]`,
        status: 'active',
      },
      { onConflict: 'phone' }
    )

    // 2. Process message content (needed for CPF fallback in identity resolution)
    let userContent: ChatMessage['content']

    if (message.type === 'audio' && message.mediaId) {
      try {
        const { base64, mimetype } = await downloadMedia(message.mediaId)
        const audioBuffer = Buffer.from(base64, 'base64')
        const transcribed = await transcribeAudio(audioBuffer, mimetype)
        userContent = `[Áudio transcrito]: ${transcribed}`
      } catch {
        userContent = '[Áudio recebido, mas não foi possível transcrever]'
      }
    } else if (message.type === 'image' && message.mediaId) {
      try {
        const { base64, mimetype } = await downloadMedia(message.mediaId)
        userContent = await buildImageMessage(base64, mimetype, message.caption)
      } catch {
        userContent = message.caption ?? '[Imagem recebida, mas não foi possível processar]'
      }
    } else {
      userContent = message.text ?? message.caption ?? '[Mensagem sem conteúdo]'
    }

    // 3. Resolve identity (aluno / gestor / desconhecido) — with CPF fallback from text
    const messageText = typeof userContent === 'string' ? userContent : message.text ?? message.caption
    const identity = await resolveIdentity(phone, messageText)
    const identityContext = buildIdentityContext(identity)

    if (identity.type !== 'desconhecido') {
      await adminClient
        .from('conversations')
        .update({ student_id: identity.student.id })
        .eq('phone', phone)
    }

    // 4. Fetch chat history
    const { data: history } = await adminClient
      .from('chatmemory')
      .select('role, content')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(20)

    // 4.5. RAG: search knowledge base
    const queryText =
      typeof userContent === 'string' ? userContent : JSON.stringify(userContent)
    const ragChunks = await searchRelevantChunks(queryText)
    const ragContext = buildRagContext(ragChunks)

    // 4.6. Moodle on-demand: dynamic data only for identified students
    let moodleContext: string | null = null
    if (identity.type === 'aluno' && identity.student.moodle_id) {
      const intent = detectMoodleIntent(queryText)
      if (intent) {
        moodleContext = await fetchMoodleContext(identity.student, intent)
      }
    }

    // 5. Build system prompt
    const systemPrompt = await buildSystemPrompt(identityContext, ragContext, moodleContext)

    // 6. Build GPT-4o messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history ?? []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content as string,
      })),
      { role: 'user', content: userContent },
    ]

    // 7. Call GPT-4o
    const response = await chatCompletion(messages)

    // 8. Save to chatmemory
    const userContentText =
      typeof userContent === 'string' ? userContent : JSON.stringify(userContent)

    await adminClient.from('chatmemory').insert([
      { session_id: phone, role: 'user', content: userContentText },
      { session_id: phone, role: 'assistant', content: response },
    ])

    // 9. Update conversation
    await adminClient
      .from('conversations')
      .update({
        last_message: response.slice(0, 200),
        last_message_at: new Date().toISOString(),
      })
      .eq('phone', phone)

    // 10. Send reply via Evolution API
    await sendText(phone, response)
  } catch (error) {
    console.error('[MARA Agent] Erro ao processar mensagem:', error)
    try {
      await sendText(phone, FALLBACK_MESSAGE)
    } catch {
      console.error('[MARA Agent] Falha ao enviar mensagem de fallback')
    }
  }
}
