import { adminClient, getAdminClient } from './supabase/admin'
import { getMaraPauseState } from './mara-pause'
import { buildSystemPrompt } from './prompt-builder'
import { sendText, downloadMedia } from './evolution'
import { chatCompletion, transcribeAudio, buildImageMessage, ChatMessage } from './openai'
import { searchRelevantChunks, buildRagContext } from './rag'
import { resolveKnownContact, syncContactsSnapshot, type ContactProfile, type ContactStudentRecord } from './contacts'
import {
  getUserGradeOverview,
  getCourseCompletion,
  getCourseActivitiesCompletion,
  getUserEnrollmentInfo,
  getGradeItems,
  setUserPassword,
  generateTempPassword,
  formatGradeContext,
  formatCompletionContext,
  formatActivitiesContext,
  formatEnrollmentContext,
  formatDetailedGradeContext,
  MoodleCourse,
} from './moodle'
import { normalizeCpf } from './utils'
import { createTicket } from './ticket'

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
  pushName?: string | null
}

interface StudentRow {
  id: ContactStudentRecord['id']
  moodle_id: ContactStudentRecord['moodle_id']
  full_name: ContactStudentRecord['full_name']
  email: ContactStudentRecord['email']
  courses: MoodleCourse[]
  role: 'aluno' | 'gestor'
}

type MoodleIntent = 'notas' | 'notas-detalhadas' | 'certificado' | 'progresso' | 'matricula'
type PasswordResetStep = 'ask_cpf' | 'confirm_name'

interface PasswordResetAction {
  type: 'password_reset'
  step: PasswordResetStep
  moodle_id?: number
  full_name?: string
}

type SupportTicketStep = 'ask_subject'
interface SupportTicketAction {
  type: 'support_ticket'
  step: SupportTicketStep
}

type Identity =
  | { type: 'aluno'; student: StudentRow; contact: ContactProfile | null }
  | { type: 'gestor'; student: StudentRow; contact: ContactProfile | null }
  | { type: 'contato'; contact: ContactProfile }
  | { type: 'desconhecido' }

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_MESSAGE =
  'Olá! Estou com dificuldades técnicas no momento. Por favor, tente novamente em instantes. 🙏'

const LGPD_ACK =
  `Olá! 👋 Bem-vindo ao atendimento virtual da *MARA*, assistente do *Maranhão Profissionalizado*. Ao continuar esta conversa, você concorda com o uso dos seus dados para fins de suporte educacional (LGPD — Lei nº 13.709/2018). 😊 Como posso te ajudar hoje?`

const FOLLOWUP_MESSAGE =
  `Oi, ainda está por aí? 😊 Fico à disposição se precisar de mais alguma ajuda com seus estudos!`

const CLOSING_MESSAGE =
  `Seu atendimento foi encerrado por inatividade. Fique à vontade para entrar em contato novamente sempre que precisar. Até logo! 👋`

const MOODLE_INTENT_KEYWORDS: Record<MoodleIntent, string[]> = {
  'notas-detalhadas': [
    'quiz', 'tarefa', 'avaliação', 'avaliacao', 'item', 'detalhe', 'detalhes',
    'nota da tarefa', 'nota do quiz', 'nota da avaliação', 'passei',
  ],
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

const PASSWORD_RESET_KEYWORDS = [
  'trocar senha', 'mudar senha', 'esqueci senha', 'esqueci a senha',
  'redefinir senha', 'nova senha', 'não consigo entrar', 'nao consigo entrar',
  'acesso moodle', 'acesso ao moodle', 'minha senha', 'resetar senha',
  'reset senha', 'recuperar senha',
]

function detectPasswordResetIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return PASSWORD_RESET_KEYWORDS.some((kw) => lower.includes(kw))
}

const SUPPORT_INTENT_KEYWORDS = [
  'suporte', 'chamado', 'ticket', 'solicitação', 'solicitacao',
  'reclamação', 'reclamacao', 'abrir chamado', 'preciso de suporte',
  'ajuda técnica', 'ajuda tecnica', 'reportar problema',
  'não consigo acessar', 'nao consigo acessar',
]

function detectSupportIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return SUPPORT_INTENT_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Identity Resolution ──────────────────────────────────────────────────────

async function resolveIdentity(phone: string, messageText?: string): Promise<Identity> {
  const { profile, student } = await resolveKnownContact(phone, messageText)

  if (student) {
    const typedStudent: StudentRow = {
      id: student.id,
      moodle_id: student.moodle_id,
      full_name: student.full_name,
      email: student.email,
      courses: student.courses as MoodleCourse[],
      role: student.role === 'gestor' ? 'gestor' : 'aluno',
    }

    return {
      type: typedStudent.role === 'gestor' ? 'gestor' : 'aluno',
      student: typedStudent,
      contact: profile,
    }
  }

  if (profile) {
    return { type: 'contato', contact: profile }
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

  if (identity.type === 'contato') {
    const labels =
      identity.contact.labels.length > 0
        ? identity.contact.labels.join(', ')
        : 'nenhuma etiqueta cadastrada'

    return (
      `Contato conhecido no atendimento: ${identity.contact.displayName}. ` +
      `Telefone principal: ${identity.contact.canonicalPhone ?? 'nao identificado'}. ` +
      `Etiquetas internas: ${labels}. ` +
      'Nao existe vinculo confirmado com Moodle neste momento. ' +
      'Atenda usando o contexto operacional ja conhecido e peca CPF apenas se for necessario vincular dados academicos.'
    )
  }

  const { student } = identity
  const courses = Array.isArray(student.courses) ? student.courses : []
  const courseList =
    courses.length > 0
      ? courses.map((c: MoodleCourse) => c.fullname || c.shortname).join(', ')
      : 'nenhum curso encontrado'

  const labelsPart = identity.contact?.labels?.length
    ? ` Etiquetas internas: ${identity.contact.labels.join(', ')}.`
    : ''

  if (identity.type === 'gestor') {
    return `Pessoa identificada: ${student.full_name} (GESTOR do programa). Email: ${student.email ?? 'não informado'}.${labelsPart}`
  }

  return (
    `Aluno identificado: ${student.full_name}. ` +
    `Email: ${student.email ?? 'não informado'}. ` +
    `Cursos matriculados: ${courseList}.${labelsPart}`
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
      case 'notas-detalhadas': {
        if (!firstCourse) return 'Nenhum curso matriculado para verificar notas.'
        const items = await getGradeItems(student.moodle_id, firstCourse.id)
        return `### Notas Detalhadas\n${formatDetailedGradeContext(items, firstCourse.fullname || firstCourse.shortname)}`
      }
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
      default:
        return null
    }
  } catch (err) {
    console.error(`[MARA] Moodle on-demand fetch error (${intent}):`, err)
    return null
  }
}

// ─── Password Reset Flow (stateful, multi-turn) ───────────────────────────────

async function handlePasswordResetFlow(
  phone: string,
  replyTarget: string,
  userText: string,
  action: PasswordResetAction
): Promise<void> {
  const reply = async (text: string) => {
    await sendText(replyTarget, text)
    await adminClient.from('chatmemory').insert({ session_id: phone, role: 'assistant', content: text })
    await adminClient.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString() }).eq('phone', phone)
  }

  // Salvar mensagem do usuário no histórico
  await adminClient.from('chatmemory').insert({ session_id: phone, role: 'user', content: userText })

  // ─── Etapa 1: aguardando CPF ──────────────────────────────────────────────
  if (action.step === 'ask_cpf') {
    const cpf = normalizeCpf(userText)

    if (!cpf) {
      await reply('Não reconheci um CPF válido. Por favor, informe no formato XXX.XXX.XXX-XX ou somente os 11 dígitos.')
      return
    }

    // Buscar pelo CPF na tabela contacts (fonte unificada) ou diretamente em students
    const { data: studentFromContacts } = await adminClient
      .from('students')
      .select('id, moodle_id, full_name')
      .eq('cpf', cpf)
      .not('moodle_id', 'is', null)
      .maybeSingle()

    const student = studentFromContacts

    if (!student) {
      await reply('Não encontrei nenhum cadastro com esse CPF. Verifique e tente novamente, ou entre em contato com o suporte.')
      return
    }

    // Avança para confirmação de nome
    await adminClient
      .from('conversations')
      .update({ pending_action: { type: 'password_reset', step: 'confirm_name', moodle_id: student.moodle_id, full_name: student.full_name } })
      .eq('phone', phone)

    await reply(`Encontrei o cadastro de *${student.full_name}*. Confirma que é você? Responda *SIM* para prosseguir ou *NÃO* para cancelar.`)
    return
  }

  // ─── Etapa 2: aguardando confirmação do nome ──────────────────────────────
  if (action.step === 'confirm_name') {
    const lower = userText.toLowerCase().trim()
    const isYes = /^(sim|s|yes|confirmo|confirma|ok|isso|é isso|isso mesmo)/.test(lower)
    const isNo  = /^(n[ãa]o|no|cancelar|cancela|errado|nao)/.test(lower)

    if (!isYes && !isNo) {
      await reply('Por favor, responda *SIM* para confirmar e redefinir sua senha, ou *NÃO* para cancelar.')
      return
    }

    // Limpar estado em qualquer desfecho
    await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)

    if (isNo) {
      await reply('Operação cancelada. Se precisar de ajuda, é só chamar! 😊')
      return
    }

    // Gerar senha temporária e aplicar
    if (!action.moodle_id) {
      await reply('Ocorreu um erro interno. Por favor, tente novamente mais tarde.')
      return
    }

    try {
      const tempPassword = generateTempPassword()
      await setUserPassword(action.moodle_id, tempPassword)
      const moodleUrl = process.env.MOODLE_URL ?? 'o portal do Moodle'
      await reply(
        `✅ Pronto! Sua senha temporária do Moodle é:\n\n*${tempPassword}*\n\n` +
        `Acesse ${moodleUrl} e faça login com essa senha. ` +
        `Após entrar, vá em *Perfil → Mudar Senha* e defina uma senha pessoal. ` +
        `Recomendamos trocar a senha no primeiro acesso. 🔐`
      )
    } catch (err) {
      console.error('[MARA] Erro ao trocar senha Moodle:', err)
      await reply('Não foi possível redefinir a senha no momento. Por favor, tente mais tarde ou procure o suporte.')
    }
    return
  }
}

// ─── Support Ticket Flow (stateful, multi-turn) ───────────────────────────────

async function handleSupportTicketFlow(
  phone: string,
  replyTarget: string,
  userText: string,
  _action: SupportTicketAction,
  studentId?: string | null
): Promise<void> {
  const reply = async (text: string) => {
    await sendText(replyTarget, text)
    await adminClient.from('chatmemory').insert({ session_id: phone, role: 'assistant', content: text })
    await adminClient.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString() }).eq('phone', phone)
  }

  await adminClient.from('chatmemory').insert({ session_id: phone, role: 'user', content: userText })

  const subject = userText.trim()
  if (!subject || subject.length < 3) {
    await reply('Por favor, descreva brevemente o assunto do seu problema para que possamos abrir o chamado. 🎫')
    return
  }

  // Limpar pending_action antes de criar o ticket
  await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)

  try {
    const ticket = await createTicket({ phone, student_id: studentId ?? null, subject })
    const msg =
      `✅ *Chamado aberto com sucesso!*\n\n` +
      `🎫 *Protocolo:* ${ticket.protocol}\n` +
      `📝 *Assunto:* ${ticket.subject}\n\n` +
      `Nossa equipe analisará sua solicitação e entrará em contato em breve. Guarde o número do protocolo para acompanhar o atendimento.`
    await reply(msg)
  } catch (err) {
    console.error('[MARA] Erro ao criar ticket de suporte:', err)
    // Restaurar pending_action para tentar novamente
    await adminClient
      .from('conversations')
      .update({ pending_action: { type: 'support_ticket', step: 'ask_subject' } })
      .eq('phone', phone)
    await reply('Não foi possível abrir o chamado no momento. Por favor, tente novamente em instantes. 🙏')
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
    const abortIfPaused = async (stage: string) => {
      const pauseState = await getMaraPauseState(phone)
      if (!pauseState.pausedUntil && !pauseState.humanHandoffActive && !pauseState.manualPaused) return false

      console.log(
        `[MARA] Conversa ${phone} bloqueada para MARA (${stage}; pausa=${pauseState.pausedUntil ?? 'sem prazo'}; pausa_manual=${pauseState.manualPaused ? 'sim' : 'nao'}; atendimento_humano=${pauseState.humanHandoffActive ? (pauseState.assignedName ?? 'sim') : 'nao'}; candidatos: ${pauseState.candidates.join(',')})`
      )
      return true
    }

    // 0. Pausa por atendimento humano — verificar ANTES de qualquer escrita no banco
    if (await abortIfPaused('antes de iniciar o processamento')) return

    // 1. Upsert conversation + fetch LGPD/followup state
    // followup_stage and followup_sent_at are reset so a closed/followup conversation
    // becomes fully active again when the user sends a new message
    await adminClient.from('conversations').upsert(
      {
        phone,
        last_message_at: new Date().toISOString(),
        last_message: messages.map(m => m.text ?? m.caption ?? `[${m.type}]`).join(' '),
        status: 'active',
        followup_stage: null,
        followup_sent_at: null,
      },
      { onConflict: 'phone' }
    )

    // Capture pushName as contact_name only when the field is still null
    if (routing.pushName) {
      await adminClient
        .from('conversations')
        .update({ contact_name: routing.pushName })
        .eq('phone', phone)
        .is('contact_name', null)
    }

    const { data: conv } = await adminClient
      .from('conversations')
      .select('lgpd_accepted_at, followup_stage, pending_action')
      .eq('phone', phone)
      .single()

    const combinedRawText = messages
      .map(m => m.text ?? m.caption ?? '')
      .join(' ')
      .trim()

    // 2. LGPD gate — qualquer mensagem enviada equivale a consentimento implícito
    if (!conv?.lgpd_accepted_at) {
      await adminClient
        .from('conversations')
        .update({ lgpd_accepted_at: new Date().toISOString() })
        .eq('phone', phone)

      if (await abortIfPaused('antes do envio do aceite LGPD')) return

      await sendText(replyTarget, LGPD_ACK)
      await syncContactsSnapshot()
      return
    }

    // 3. Inactivity reset — if user was in follow-up, receiving any message resets it
    if (conv?.followup_stage === 'followup_1') {
      await adminClient
        .from('conversations')
        .update({ followup_stage: null, followup_sent_at: null })
        .eq('phone', phone)
    }

    // 3b. Password reset flow — fluxo multi-turno stateful, desvia do pipeline normal
    const pendingAction = conv?.pending_action as PasswordResetAction | SupportTicketAction | null | undefined
    if (pendingAction?.type === 'password_reset') {
      await handlePasswordResetFlow(phone, replyTarget, combinedRawText, pendingAction as PasswordResetAction)
      await syncContactsSnapshot()
      return
    }

    // 3c. Support ticket flow — fluxo multi-turno para abertura de chamado
    if (pendingAction?.type === 'support_ticket') {
      const { data: convData } = await adminClient
        .from('conversations')
        .select('student_id')
        .eq('phone', phone)
        .single()
      await handleSupportTicketFlow(phone, replyTarget, combinedRawText, pendingAction as SupportTicketAction, convData?.student_id)
      await syncContactsSnapshot()
      return
    }

    // Atualiza last_student_message_at em tickets abertos/em_andamento para este telefone
    void getAdminClient()
      .from('support_tickets')
      .update({ last_student_message_at: new Date().toISOString() })
      .eq('phone', phone)
      .in('status', ['aberto', 'em_andamento'])

    // 5. Build combined user content from all messages in the batch
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

    if (identity.type === 'aluno' || identity.type === 'gestor') {
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

    // 7b. Detectar intent de troca de senha — inicia fluxo multi-turno
    if (detectPasswordResetIntent(queryText)) {
      const moodleUrl = process.env.MOODLE_URL ?? 'o portal do Moodle'
      // Verificar se o aluno tem moodle_id (só alunos com vínculo Moodle)
      const hasMoodle = (identity.type === 'aluno' || identity.type === 'gestor') && identity.student.moodle_id
      if (!hasMoodle) {
        // Sem vínculo Moodle — GPT responde normalmente com contexto padrão
      } else {
        // Iniciar fluxo de verificação de CPF
        await adminClient
          .from('conversations')
          .update({ pending_action: { type: 'password_reset', step: 'ask_cpf' } })
          .eq('phone', phone)

        const startMsg = `Para redefinir sua senha de acesso ao Moodle (${moodleUrl}), preciso confirmar sua identidade. 🔐\n\nPor favor, me informe seu *CPF* (somente números ou com pontuação).`
        await sendText(replyTarget, startMsg)
        await adminClient.from('chatmemory').insert([
          { session_id: phone, role: 'user', content: combinedRawText },
          { session_id: phone, role: 'assistant', content: startMsg },
        ])
        await adminClient.from('conversations').update({ last_message: startMsg.slice(0, 200), last_message_at: new Date().toISOString() }).eq('phone', phone)
        await syncContactsSnapshot()
        return
      }
    }

    // 7c. Detectar intent de abertura de chamado de suporte
    if (detectSupportIntent(queryText)) {
      await adminClient
        .from('conversations')
        .update({ pending_action: { type: 'support_ticket', step: 'ask_subject' } })
        .eq('phone', phone)
      const supportMsg = `Entendi! Vou abrir um chamado de suporte para você. 🎫\n\nDescreva brevemente o *assunto* do seu problema:`
      await sendText(replyTarget, supportMsg)
      await adminClient.from('chatmemory').insert([
        { session_id: phone, role: 'user', content: combinedRawText },
        { session_id: phone, role: 'assistant', content: supportMsg },
      ])
      await adminClient.from('conversations').update({ last_message: supportMsg.slice(0, 200), last_message_at: new Date().toISOString() }).eq('phone', phone)
      await syncContactsSnapshot()
      return
    }

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

    const userContentText = typeof userContent === 'string' ? userContent : JSON.stringify(userContent)

    await adminClient.from('chatmemory').insert({
      session_id: phone,
      role: 'user',
      content: userContentText,
    })

    const response = await chatCompletion(chatMessages)

    if (await abortIfPaused('imediatamente antes do envio da resposta')) return

    // 10. Save to chatmemory
    await sendText(replyTarget, response)
    await adminClient.from('chatmemory').insert({
      session_id: phone,
      role: 'assistant',
      content: response,
    })

    // 11. Update conversation + reply
    await adminClient
      .from('conversations')
      .update({ last_message: response.slice(0, 200), last_message_at: new Date().toISOString() })
      .eq('phone', phone)

    await syncContactsSnapshot()
  } catch (error) {
    console.error('[MARA Agent] Erro ao processar mensagem:', error)
    try {
      const pauseState = await getMaraPauseState(phone)
      if (pauseState.pausedUntil || pauseState.humanHandoffActive || pauseState.manualPaused) {
        console.log(`[MARA] Fallback suprimido para ${phone} — bloqueio ativo para atendimento humano`)
        return
      }
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
    .select('phone, mara_paused_until, mara_manual_paused, assigned_to, assigned_name')
    .eq('status', 'active')
    .is('followup_stage', null)
    .lt('last_message_at', ninetyMinutesAgo)

  for (const conv of idleConvs ?? []) {
    if (conv.assigned_to || conv.assigned_name) continue
    if (conv.mara_manual_paused) continue
    if (conv.mara_paused_until && new Date(conv.mara_paused_until) > new Date()) continue

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
    .select('phone, mara_paused_until, mara_manual_paused, assigned_to, assigned_name')
    .eq('followup_stage', 'followup_1')
    .lt('followup_sent_at', sixtyMinutesAgo)

  for (const conv of staleConvs ?? []) {
    if (conv.assigned_to || conv.assigned_name) continue
    if (conv.mara_manual_paused) continue
    if (conv.mara_paused_until && new Date(conv.mara_paused_until) > new Date()) continue

    try {
      await sendText(conv.phone, CLOSING_MESSAGE)
      await adminClient
        .from('conversations')
        .update({
          followup_stage: 'closed',
          status: 'closed',
          assigned_to: null,
          assigned_name: null,
          mara_paused_until: null,
          mara_manual_paused: false,
        })
        .eq('phone', conv.phone)
      closings++
    } catch (err) {
      console.error(`[Inatividade] Erro ao fechar conversa de ${conv.phone}:`, err)
    }
  }

  return { followups, closings }
}

// ─── Ticket inactivity checker ────────────────────────────────────────────────

export async function checkTicketInactivity(): Promise<{ closed: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: candidates } = await getAdminClient()
    .from('support_tickets')
    .select('id, phone, last_attendant_reply_at, last_student_message_at')
    .eq('status', 'em_andamento')
    .not('last_attendant_reply_at', 'is', null)
    .lt('last_attendant_reply_at', sevenDaysAgo)

  if (!candidates?.length) return { closed: 0 }

  // Filtra tickets onde aluno não respondeu após última ação do atendente
  const toClose = candidates.filter(t =>
    !t.last_student_message_at ||
    t.last_student_message_at < t.last_attendant_reply_at!
  )

  if (!toClose.length) return { closed: 0 }

  const ids = toClose.map(t => t.id)
  await getAdminClient()
    .from('support_tickets')
    .update({ status: 'fechado_inatividade', closed_at: now })
    .in('id', ids)

  // Notificar alunos via WhatsApp
  for (const t of toClose) {
    try {
      await sendText(
        t.phone,
        `🎫 Seu chamado de suporte foi *encerrado por inatividade* (sem resposta por 7 dias após nosso último contato).\n\nCaso ainda precise de ajuda, é só entrar em contato novamente. 👋`
      )
    } catch { /* silently ignore */ }
  }

  return { closed: toClose.length }
}
