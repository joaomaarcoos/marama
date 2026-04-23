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
import { extractCpf, normalizeCpf } from './utils'
import { createTicket } from './ticket'

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
  cpf: ContactStudentRecord['cpf']
  courses: MoodleCourse[]
  role: 'aluno' | 'gestor'
}

type MoodleIntent = 'notas' | 'notas-detalhadas' | 'certificado' | 'progresso' | 'matricula'
type PasswordResetStep = 'ask_cpf' | 'confirm_name'
type SupportTicketStep = 'ask_subject'
type IdentityField = 'name' | 'cpf'
type AssistantRoute = 'REPLY' | 'HUMAN' | 'OFFER_TICKET'
type PayloadNameAssessment =
  | { kind: 'confirmed'; name: string }
  | { kind: 'candidate'; name: string }
  | { kind: 'invalid' }
  | { kind: 'missing' }

interface PasswordResetAction {
  type: 'password_reset'
  step: PasswordResetStep
  moodle_id?: number
  full_name?: string
}

interface SupportTicketAction {
  type: 'support_ticket'
  step: SupportTicketStep
}

interface SupportTicketOfferAction {
  type: 'support_ticket_offer'
}

interface IdentityCollectionAction {
  type: 'collect_identity'
  missing: IdentityField[]
  provided_name?: string | null
  candidate_name?: string | null
}

type PendingAction =
  | PasswordResetAction
  | SupportTicketAction
  | SupportTicketOfferAction
  | IdentityCollectionAction

type Identity =
  | { type: 'aluno'; student: StudentRow; contact: ContactProfile | null }
  | { type: 'gestor'; student: StudentRow; contact: ContactProfile | null }
  | { type: 'contato'; contact: ContactProfile }
  | { type: 'desconhecido' }

const FALLBACK_MESSAGE =
  'Ola! Estou com dificuldades tecnicas no momento. Por favor, tente novamente em instantes.'

const LGPD_ACK =
  'Ola! Bem-vindo(a) ao atendimento virtual da *MARA*, assistente do *Maranhao Profissionalizado*. Ao continuar esta conversa, voce concorda com o uso dos seus dados para fins de suporte educacional (LGPD - Lei no 13.709/2018).'

const FOLLOWUP_MESSAGE =
  'Oi, ainda esta por ai? Fico a disposicao se precisar de mais alguma ajuda com seus estudos.'

const CLOSING_MESSAGE =
  'Seu atendimento foi encerrado por inatividade. Fique a vontade para entrar em contato novamente sempre que precisar. Ate logo!'

const MOODLE_INTENT_KEYWORDS: Record<MoodleIntent, string[]> = {
  'notas-detalhadas': [
    'quiz', 'tarefa', 'avaliacao', 'item', 'detalhe', 'detalhes',
    'nota da tarefa', 'nota do quiz', 'passei',
  ],
  notas: ['nota', 'notas', 'grade', 'media', 'desempenho', 'pontuacao'],
  certificado: [
    'certificado', 'certificar', 'certificacao',
    'diploma', 'conclui', 'concluir', 'conclusao',
  ],
  progresso: [
    'progresso', 'andamento', 'quanto fiz', 'atividades', 'atividade',
    'completei', 'completar', 'quantas aulas', 'quanto completei',
  ],
  matricula: [
    'matricula', 'matriculado', 'inscrito', 'inscricao',
    'situacao', 'status', 'ativo', 'suspens',
  ],
}

const PASSWORD_RESET_KEYWORDS = [
  'trocar senha', 'mudar senha', 'esqueci senha', 'esqueci a senha',
  'redefinir senha', 'nova senha', 'nao consigo entrar',
  'acesso moodle', 'acesso ao moodle', 'minha senha', 'resetar senha',
  'reset senha', 'recuperar senha',
]

const EXPLICIT_TICKET_KEYWORDS = [
  'abrir ticket', 'abrir um ticket', 'criar ticket', 'gerar ticket',
  'abrir chamado', 'abrir um chamado', 'criar chamado', 'gerar protocolo',
  'registrar chamado', 'registrar ticket', 'quero um protocolo',
]

const HUMAN_HANDOFF_KEYWORDS = [
  'atendimento humano', 'atendente humano', 'falar com humano', 'falar com uma pessoa',
  'falar com atendente', 'falar com suporte', 'quero um humano', 'quero falar com alguem',
  'transferir para humano', 'transferir para atendente', 'me passa para um humano',
]

const NON_NAME_PATTERNS = [
  /\b(deus|jesus|cristo|senhor|fiel|aben[cç]oado|gratid[aã]o|fe)\b/i,
  /\b(flamengo|vasco|corinthians|palmeiras|santos|botafogo|gremio|bahia)\b/i,
  /\b(soldado|guerreiro|oficial|patrao|patr[aã]o|princesa|rainha|rei)\b/i,
  /\b(loja|store|empresa|ofc|oficial|delivery|mec[aâ]nica|barbearia)\b/i,
  // Palavras que indicam que é uma frase, não um nome
  /\b(n[aã]o|nunca|jamais|consegui|conseguimos|consegue|enviar|enviou|enviando)\b/i,
  /\b(quero|queria|gostaria|preciso|precisa|precisamos|temos|tenho|tem|tinha)\b/i,
  /\b(estou|est[aá]|est[aã]o|estava|estamos|ficou|fiquei|fico)\b/i,
  /\b(porque|quando|onde|como|nosso|nossa|nossos|nossas|isso|este|esse|essa)\b/i,
  /\b(sistema|projeto|problema|d[uú]vida|ajuda|curso|nota|senha|login|acesso|certificado|aula|sigec|moodle)\b/i,
  /\b(inst[aá]vel|instabilidade|erro|falha|funcionar|funcionando|carregando)\b/i,
  // Respostas afirmativas/negativas que não são nomes
  /^(sim|n[aã]o|ok|claro|certo|exato|isso|oi|ol[aá]|sou|eu|bom|boa|pois|tudo|nada|bem|mal)$/i,
]

function detectPasswordResetIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return PASSWORD_RESET_KEYWORDS.some((kw) => lower.includes(kw))
}

function detectExplicitTicketIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return EXPLICIT_TICKET_KEYWORDS.some((kw) => lower.includes(kw))
}

function detectHumanHandoffIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return HUMAN_HANDOFF_KEYWORDS.some((kw) => lower.includes(kw))
}

function isAffirmative(text: string): boolean {
  return /^(sim|s|yes|quero|pode|pode sim|claro|ok|okay|isso|isso mesmo)\b/i.test(text.trim())
}

function isNegative(text: string): boolean {
  return /^(nao|n|cancelar|cancela|deixa|deixa pra la)\b/i.test(text.trim())
}

function extractNameCandidate(text: string): string | null {
  let cleaned = text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, ' ')
    .replace(/\bcpf\b[:\s-]*/gi, ' ')
    .replace(/[|;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip leading affirmative/filler + introductory phrases.
  // Handles: "Sim sou X", "Não, me chamo X", "Eu sou a X", "Meu nome é X", etc.
  cleaned = cleaned
    .replace(/^(?:(?:sim|n[aã]o|ok|claro|certo|exato|[eé]|isso)[,.]?\s+)?(?:eu\s+)?(?:me\s+chamo|meu\s+nome(?:\s+completo)?(?:\s+[eéê]|\s+eh)?|nome(?:\s+completo)?[:\s-]*|sou\s+(?:o\s+|a\s+)?)\s*/i, '')
    .trim()

  if (!cleaned || cleaned.length < 3 || cleaned.length > 100) return null
  if (!/[A-Za-z]/.test(cleaned)) return null
  return cleaned
}

function normalizePayloadName(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : null
}

function looksLikePersonalName(value: string): boolean {
  if (value.length < 3 || value.length > 60) return false
  if (/\d/.test(value)) return false
  if (/[#@/\\_*~"=+]/.test(value)) return false

  for (const pattern of NON_NAME_PATTERNS) {
    if (pattern.test(value)) return false
  }

  const tokens = value
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-zÀ-ÿ'-]/g, ''))
    .filter(Boolean)

  if (tokens.length === 0 || tokens.length > 5) return false

  const validTokens = tokens.every((token) => token.length >= 2 && /[aeiouáéíóúãõâêô]/i.test(token))
  if (!validTokens) return false

  return true
}

function assessPayloadName(
  confirmedName: string | null,
  whatsappName: string | null | undefined
): PayloadNameAssessment {
  if (confirmedName?.trim()) {
    return { kind: 'confirmed', name: confirmedName.trim() }
  }

  const normalized = normalizePayloadName(whatsappName)
  if (!normalized) return { kind: 'missing' }

  if (looksLikePersonalName(normalized)) {
    return { kind: 'candidate', name: normalized }
  }

  return { kind: 'invalid' }
}

function buildIdentityPrompt(
  missing: IdentityField[],
  options: { candidateName?: string | null } = {}
): string {
  const candidateName = options.candidateName?.trim() || null

  if (missing.includes('name') && missing.includes('cpf')) {
    if (candidateName) {
      return `Antes de seguir, preciso identificar seu atendimento. Quero confirmar: seu nome e *${candidateName}*? Se nao for, me informe seu *nome completo*. Aproveite e envie tambem seu *CPF* (somente numeros ou no formato XXX.XXX.XXX-XX).`
    }

    return 'Antes de seguir, preciso identificar seu atendimento. Informe seu *nome completo* e seu *CPF* (somente numeros ou no formato XXX.XXX.XXX-XX). Se preferir, envie os dois na mesma mensagem.'
  }

  if (missing.includes('name')) {
    if (candidateName) {
      return `Quero confirmar seu nome: e *${candidateName}*? Se nao for, me informe seu *nome completo*.`
    }

    return 'Antes de seguir, preciso do seu *nome completo* para identificar este atendimento.'
  }

  return 'Antes de seguir, preciso do seu *CPF* (somente numeros ou no formato XXX.XXX.XXX-XX) para identificar este atendimento.'
}

function parseAssistantRoute(rawResponse: string): { route: AssistantRoute; content: string } {
  const match = rawResponse.match(/^\s*\[\[ROUTE:(REPLY|HUMAN|OFFER_TICKET)\]\]\s*/i)
  if (!match) {
    return { route: 'REPLY', content: rawResponse.trim() }
  }

  return {
    route: match[1].toUpperCase() as AssistantRoute,
    content: rawResponse.replace(match[0], '').trim(),
  }
}

function getKnownName(identity: Identity, confirmedConversationName?: string | null): string | null {
  if (identity.type === 'aluno' || identity.type === 'gestor') {
    return identity.student.full_name?.trim() || null
  }

  return confirmedConversationName?.trim() || null
}

function getKnownCpf(identity: Identity, conversationCpf?: string | null): string | null {
  const normalizedConversationCpf = normalizeCpf(conversationCpf)
  if (normalizedConversationCpf) return normalizedConversationCpf

  if (identity.type === 'aluno' || identity.type === 'gestor') {
    return normalizeCpf(identity.student.cpf)
  }

  if (identity.type === 'contato') {
    return normalizeCpf(identity.contact.cpf)
  }

  return null
}

function getMissingIdentityFields(
  identity: Identity,
  confirmedConversationName?: string | null,
  conversationCpf?: string | null
): IdentityField[] {
  const missing: IdentityField[] = []

  if (!getKnownName(identity, confirmedConversationName)) missing.push('name')
  if (!getKnownCpf(identity, conversationCpf)) missing.push('cpf')

  return missing
}

async function storeUserMessage(phone: string, content: string) {
  await adminClient.from('chatmemory').insert({ session_id: phone, role: 'user', content })
}

async function sendAssistantMessage(
  phone: string,
  replyTarget: string,
  text: string,
  conversationUpdates: Record<string, unknown> = {}
) {
  await sendText(replyTarget, text)
  await adminClient.from('chatmemory').insert({ session_id: phone, role: 'assistant', content: text })
  await adminClient
    .from('conversations')
    .update({
      last_message: text.slice(0, 200),
      last_message_at: new Date().toISOString(),
      ...conversationUpdates,
    })
    .eq('phone', phone)
}

async function activateHumanHandoff(phone: string, replyTarget: string, text: string) {
  const congestionNotice = '\n\n_Estamos com alto volume de mensagens e o atendimento pode estar congestionado. A resposta pode demorar alguns minutos — agradecemos a paciencia!_'
  const pausedUntil = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  await sendAssistantMessage(phone, replyTarget, text + congestionNotice, {
    pending_action: null,
    assigned_to: null,
    assigned_name: 'Aguardando atendimento humano',
    mara_paused_until: pausedUntil,
    status: 'active',
  })
}

async function persistCollectedIdentity(
  phone: string,
  data: { name?: string | null; cpf?: string | null }
) {
  const updates: Record<string, unknown> = { pending_action: null }
  const name = data.name?.trim() || null
  const cpf = normalizeCpf(data.cpf)

  if (name) {
    updates.contact_name = name
    updates.contact_name_confirmed = true
  }
  if (cpf) updates.cpf = cpf

  if (cpf) {
    const { data: student } = await adminClient
      .from('students')
      .select('id, full_name')
      .eq('cpf', cpf)
      .limit(1)
      .maybeSingle()

    if (student) {
      updates.student_id = student.id
      if (!name) updates.contact_name = student.full_name
    }
  }

  await adminClient.from('conversations').update(updates).eq('phone', phone)
}

async function resolveIdentity(phone: string, messageText?: string): Promise<Identity> {
  const { profile, student } = await resolveKnownContact(phone, messageText)

  if (student) {
    const typedStudent: StudentRow = {
      id: student.id,
      moodle_id: student.moodle_id,
      full_name: student.full_name,
      email: student.email,
      cpf: student.cpf,
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

function buildIdentityContext(identity: Identity, confirmedName?: string | null): string | null {
  if (identity.type === 'desconhecido') {
    return (
      'Este usuario ainda nao possui vinculo confirmado no sistema. ' +
      'A coleta inicial de nome e CPF ja e feita pela orquestracao quando necessario. ' +
      'Nao repita essa solicitacao por conta propria, exceto em fluxos especificos de confirmacao.'
    )
  }

  if (identity.type === 'contato') {
    const labels =
      identity.contact.labels.length > 0
        ? identity.contact.labels.join(', ')
        : 'nenhuma etiqueta cadastrada'
    const contactLabel = confirmedName?.trim() || 'Contato sem nome confirmado'

    return (
      `Contato conhecido no atendimento: ${contactLabel}. ` +
      `Telefone principal: ${identity.contact.canonicalPhone ?? 'nao identificado'}. ` +
      `Etiquetas internas: ${labels}. ` +
      'Nao existe vinculo confirmado com Moodle neste momento. ' +
      'Atenda usando o contexto operacional ja conhecido sem repetir a coleta inicial de identificacao.'
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
    return `Pessoa identificada: ${student.full_name} (GESTOR do programa). Email: ${student.email ?? 'nao informado'}.${labelsPart}`
  }

  return (
    `Aluno identificado: ${student.full_name}. ` +
    `Email: ${student.email ?? 'nao informado'}. ` +
    `Cursos matriculados: ${courseList}.${labelsPart}`
  )
}

function detectMoodleIntent(text: string): MoodleIntent | null {
  const lower = text.toLowerCase()
  for (const [intent, keywords] of Object.entries(MOODLE_INTENT_KEYWORDS) as [MoodleIntent, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return intent
  }
  return null
}

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
          return `### Status de Conclusao / Certificados\n${results.join('\n')}`
        }
        const completion = await getCourseCompletion(student.moodle_id, firstCourse.id)
        return `### Status de Conclusao / Certificado\n${formatCompletionContext(completion, firstCourse.fullname || firstCourse.shortname)}`
      }
      case 'progresso': {
        if (!firstCourse) return 'Nenhum curso encontrado para verificar progresso.'
        const activities = await getCourseActivitiesCompletion(student.moodle_id, firstCourse.id)
        return `### Progresso em "${firstCourse.fullname || firstCourse.shortname}"\n${formatActivitiesContext(activities)}`
      }
      case 'matricula': {
        const enrollments = await getUserEnrollmentInfo(student.moodle_id)
        return `### Situacao de Matricula\n${formatEnrollmentContext(enrollments)}`
      }
      default:
        return null
    }
  } catch (err) {
    console.error(`[MARA] Moodle on-demand fetch error (${intent}):`, err)
    return null
  }
}

async function handlePasswordResetFlow(
  phone: string,
  replyTarget: string,
  userText: string,
  action: PasswordResetAction
): Promise<void> {
  await storeUserMessage(phone, userText)

  if (action.step === 'ask_cpf') {
    const cpf = normalizeCpf(extractCpf(userText) ?? userText)

    if (!cpf) {
      await sendAssistantMessage(phone, replyTarget, 'Nao reconheci um CPF valido. Por favor, informe no formato XXX.XXX.XXX-XX ou somente os 11 digitos.')
      return
    }

    const { data: student } = await adminClient
      .from('students')
      .select('id, moodle_id, full_name')
      .eq('cpf', cpf)
      .not('moodle_id', 'is', null)
      .maybeSingle()

    if (!student) {
      await sendAssistantMessage(phone, replyTarget, 'Nao encontrei nenhum cadastro com esse CPF. Verifique e tente novamente, ou entre em contato com o suporte.')
      return
    }

    await adminClient
      .from('conversations')
      .update({ pending_action: { type: 'password_reset', step: 'confirm_name', moodle_id: student.moodle_id, full_name: student.full_name } })
      .eq('phone', phone)

    await sendAssistantMessage(
      phone,
      replyTarget,
      `Encontrei o cadastro de *${student.full_name}*. Confirma que e voce? Responda *SIM* para prosseguir ou *NAO* para cancelar.`
    )
    return
  }

  if (!isAffirmative(userText) && !isNegative(userText)) {
    await sendAssistantMessage(phone, replyTarget, 'Por favor, responda *SIM* para confirmar e redefinir sua senha, ou *NAO* para cancelar.')
    return
  }

  await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)

  if (isNegative(userText)) {
    await sendAssistantMessage(phone, replyTarget, 'Operacao cancelada. Se precisar de ajuda, e so chamar.')
    return
  }

  if (!action.moodle_id) {
    await sendAssistantMessage(phone, replyTarget, 'Ocorreu um erro interno. Por favor, tente novamente mais tarde.')
    return
  }

  try {
    const tempPassword = generateTempPassword()
    await setUserPassword(action.moodle_id, tempPassword)
    const moodleUrl = process.env.MOODLE_URL ?? 'o portal do Moodle'
    await sendAssistantMessage(
      phone,
      replyTarget,
      `Pronto! Sua senha temporaria do Moodle e:\n\n*${tempPassword}*\n\nAcesse ${moodleUrl} e faca login com essa senha. Apos entrar, va em *Perfil -> Mudar Senha* e defina uma senha pessoal. Recomendamos trocar a senha no primeiro acesso.`
    )
  } catch (err) {
    console.error('[MARA] Erro ao trocar senha Moodle:', err)
    await sendAssistantMessage(phone, replyTarget, 'Nao foi possivel redefinir a senha no momento. Por favor, tente mais tarde ou procure o suporte.')
  }
}

async function handleSupportTicketFlow(
  phone: string,
  replyTarget: string,
  userText: string,
  _action: SupportTicketAction,
  studentId?: string | null
): Promise<void> {
  await storeUserMessage(phone, userText)

  if (detectHumanHandoffIntent(userText)) {
    await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)
    await activateHumanHandoff(phone, replyTarget, 'Entendi. Vou transferir voce para um atendimento humano agora. Em alguns minutos nossa equipe continua por aqui.')
    return
  }

  const subject = userText.trim()
  if (!subject || subject.length < 3) {
    await sendAssistantMessage(phone, replyTarget, 'Por favor, descreva brevemente o assunto do seu problema para que eu possa abrir o ticket.')
    return
  }

  await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)

  try {
    const ticket = await createTicket({ phone, student_id: studentId ?? null, subject })
    await sendAssistantMessage(
      phone,
      replyTarget,
      `Chamado aberto com sucesso.\n\n*Protocolo:* ${ticket.protocol}\n*Assunto:* ${ticket.subject}\n\nNossa equipe analisara sua solicitacao e entrara em contato em breve. Guarde o numero do protocolo para acompanhar o atendimento.\n\n_Estamos com alto volume de mensagens e o atendimento pode estar congestionado. A resposta pode demorar alguns minutos — agradecemos a paciencia!_`
    )
  } catch (err) {
    console.error('[MARA] Erro ao criar ticket de suporte:', err)
    await adminClient
      .from('conversations')
      .update({ pending_action: { type: 'support_ticket', step: 'ask_subject' } })
      .eq('phone', phone)
    await sendAssistantMessage(phone, replyTarget, 'Nao foi possivel abrir o chamado no momento. Por favor, tente novamente em instantes.')
  }
}

async function handleSupportTicketOfferFlow(
  phone: string,
  replyTarget: string,
  userText: string
): Promise<void> {
  await storeUserMessage(phone, userText)

  if (detectHumanHandoffIntent(userText)) {
    await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)
    await activateHumanHandoff(phone, replyTarget, 'Entendi. Vou transferir voce para um atendimento humano agora. Em alguns minutos nossa equipe continua por aqui.')
    return
  }

  if (isAffirmative(userText)) {
    await sendAssistantMessage(
      phone,
      replyTarget,
      'Perfeito. Descreva brevemente o assunto do problema para eu abrir o ticket com protocolo.',
      { pending_action: { type: 'support_ticket', step: 'ask_subject' } }
    )
    return
  }

  if (isNegative(userText)) {
    await sendAssistantMessage(
      phone,
      replyTarget,
      'Tudo bem. Se mudar de ideia, posso abrir um ticket com protocolo ou transferir voce para um atendente humano.',
      { pending_action: null }
    )
    return
  }

  await sendAssistantMessage(
    phone,
    replyTarget,
    'Se quiser, responda *SIM* para eu abrir um ticket com protocolo ou *NAO* para seguir sem isso.',
    { pending_action: { type: 'support_ticket_offer' } }
  )
}

async function handleIdentityCollectionFlow(
  phone: string,
  replyTarget: string,
  userText: string,
  action: IdentityCollectionAction
): Promise<void> {
  await storeUserMessage(phone, userText)

  if (detectHumanHandoffIntent(userText)) {
    await adminClient.from('conversations').update({ pending_action: null }).eq('phone', phone)
    await activateHumanHandoff(phone, replyTarget, 'Entendi. Vou transferir voce para um atendimento humano agora. Em alguns minutos nossa equipe continua por aqui.')
    return
  }

  let providedName = action.provided_name?.trim() || null
  let providedCpf: string | null = null
  let candidateName = action.candidate_name?.trim() || null

  if (action.missing.includes('name')) {
    const explicitName = extractNameCandidate(userText)
    if (explicitName && looksLikePersonalName(explicitName)) {
      providedName = explicitName
    } else if (candidateName && isAffirmative(userText)) {
      providedName = candidateName
    } else if (candidateName && isNegative(userText)) {
      candidateName = null
    }
  }

  if (action.missing.includes('cpf')) {
    providedCpf = normalizeCpf(extractCpf(userText) ?? userText)
  }

  const remainingMissing = action.missing.filter((field) => {
    if (field === 'name') return !providedName
    return !providedCpf
  })

  if (remainingMissing.length > 0) {
    const prompt = (() => {
      if (remainingMissing.length === 1 && remainingMissing[0] === 'name' && providedCpf) {
        return candidateName
          ? `Recebi seu CPF. Agora quero confirmar: seu nome e *${candidateName}*? Se nao for, me informe seu *nome completo*.`
          : 'Recebi seu CPF. Agora informe seu *nome completo*.'
      }

      if (remainingMissing.length === 1 && remainingMissing[0] === 'cpf' && providedName) {
        return 'Recebi seu nome. Agora informe seu *CPF* (somente numeros ou no formato XXX.XXX.XXX-XX).'
      }

      return buildIdentityPrompt(remainingMissing, { candidateName })
    })()

    await sendAssistantMessage(phone, replyTarget, prompt, {
      pending_action: {
        type: 'collect_identity',
        missing: remainingMissing,
        provided_name: providedName,
        candidate_name: candidateName,
      },
    })
    return
  }

  await persistCollectedIdentity(phone, { name: providedName, cpf: providedCpf })
  await sendAssistantMessage(phone, replyTarget, `Obrigado, ${providedName ?? 'seu atendimento'}! Ja identifiquei seus dados e vou seguir com seu atendimento. Como posso ajudar?`, {
    contact_name_confirmed: true,
  })
}

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

    if (await abortIfPaused('antes de iniciar o processamento')) return

    await adminClient.from('conversations').upsert(
      {
        phone,
        last_message_at: new Date().toISOString(),
        last_message: messages.map((m) => m.text ?? m.caption ?? `[${m.type}]`).join(' '),
        status: 'active',
        followup_stage: null,
        followup_sent_at: null,
      },
      { onConflict: 'phone' }
    )

    if (routing.pushName) {
      await adminClient
        .from('conversations')
        .update({ whatsapp_name: routing.pushName })
        .eq('phone', phone)
    }

    const { data: conv } = await adminClient
      .from('conversations')
      .select('lgpd_accepted_at, followup_stage, pending_action, contact_name, contact_name_confirmed, cpf, whatsapp_name')
      .eq('phone', phone)
      .single()

    const combinedRawText = messages
      .map((m) => m.text ?? m.caption ?? '')
      .join(' ')
      .trim()

    const initialIdentity = await resolveIdentity(phone, combinedRawText)
    const confirmedConversationName = conv?.contact_name_confirmed ? conv.contact_name : null
    const payloadNameAssessment = assessPayloadName(confirmedConversationName, conv?.whatsapp_name ?? routing.pushName)
    const candidateName = payloadNameAssessment.kind === 'candidate' ? payloadNameAssessment.name : null
    const missingIdentityFields = getMissingIdentityFields(initialIdentity, confirmedConversationName, conv?.cpf)
    const knownNameForGreeting = getKnownName(initialIdentity, confirmedConversationName)

    if (initialIdentity.type === 'aluno' || initialIdentity.type === 'gestor') {
      await adminClient.from('conversations').update({ student_id: initialIdentity.student.id }).eq('phone', phone)
    }

    if (!conv?.lgpd_accepted_at) {
      const welcomeText = missingIdentityFields.length > 0
        ? `${LGPD_ACK}\n\n${buildIdentityPrompt(missingIdentityFields, { candidateName })}`
        : `${LGPD_ACK}\n\n${knownNameForGreeting ? `Como posso te ajudar hoje, ${knownNameForGreeting}?` : 'Como posso te ajudar hoje?'}`

      if (await abortIfPaused('antes do envio do aceite LGPD')) return

      await sendAssistantMessage(phone, replyTarget, welcomeText, {
        lgpd_accepted_at: new Date().toISOString(),
        pending_action: missingIdentityFields.length > 0
          ? { type: 'collect_identity', missing: missingIdentityFields, candidate_name: candidateName }
          : null,
      })
      await syncContactsSnapshot()
      return
    }

    if (conv?.followup_stage === 'followup_1') {
      await adminClient
        .from('conversations')
        .update({ followup_stage: null, followup_sent_at: null })
        .eq('phone', phone)
    }

    const pendingAction = conv?.pending_action as PendingAction | null | undefined

    if (pendingAction?.type === 'password_reset') {
      await handlePasswordResetFlow(phone, replyTarget, combinedRawText, pendingAction)
      await syncContactsSnapshot()
      return
    }

    if (pendingAction?.type === 'support_ticket_offer') {
      await handleSupportTicketOfferFlow(phone, replyTarget, combinedRawText)
      await syncContactsSnapshot()
      return
    }

    if (pendingAction?.type === 'support_ticket') {
      const studentId = initialIdentity.type === 'aluno' || initialIdentity.type === 'gestor'
        ? initialIdentity.student.id
        : null
      await handleSupportTicketFlow(phone, replyTarget, combinedRawText, pendingAction, studentId)
      await syncContactsSnapshot()
      return
    }

    if (pendingAction?.type === 'collect_identity') {
      await handleIdentityCollectionFlow(phone, replyTarget, combinedRawText, pendingAction)
      await syncContactsSnapshot()
      return
    }

    if (missingIdentityFields.length > 0) {
      if (await abortIfPaused('antes da coleta inicial de identificacao')) return

      await storeUserMessage(phone, combinedRawText || '[Mensagem sem conteudo]')
      await sendAssistantMessage(phone, replyTarget, buildIdentityPrompt(missingIdentityFields, { candidateName }), {
        pending_action: { type: 'collect_identity', missing: missingIdentityFields, candidate_name: candidateName },
      })
      await syncContactsSnapshot()
      return
    }

    void getAdminClient()
      .from('support_tickets')
      .update({ last_student_message_at: new Date().toISOString() })
      .eq('phone', phone)
      .in('status', ['aberto', 'em_andamento'])

    let combinedText = ''
    let imageContent: { base64: string; mimetype: string; caption?: string } | null = null
    let audioMedia: { url: string; transcript: string } | null = null

    for (const msg of messages) {
      if (msg.type === 'text' || msg.type === 'document') {
        if (combinedText) combinedText += '\n'
        combinedText += msg.text ?? ''
      } else if (msg.type === 'audio' && msg.mediaId) {
        try {
          const { base64, mimetype } = await downloadMedia(msg.mediaId)
          const transcribed = await transcribeAudio(Buffer.from(base64, 'base64'), mimetype)
          audioMedia = { url: `data:${mimetype};base64,${base64}`, transcript: transcribed }
          if (combinedText) combinedText += '\n'
          combinedText += transcribed
        } catch {
          combinedText += '\n[Audio recebido, mas nao foi possivel transcrever]'
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
      userContent = combinedText || '[Mensagem sem conteudo]'
    }

    const messageText = typeof userContent === 'string' ? userContent : combinedRawText

    // Formato de storage estruturado para UI renderizar mídia corretamente
    const userContentText: string = (() => {
      if (audioMedia && !imageContent) {
        return JSON.stringify({ _media: 'audio', url: audioMedia.url, transcript: audioMedia.transcript })
      }
      if (imageContent && typeof userContent !== 'string') {
        const caption = [imageContent.caption, combinedText].filter(Boolean).join('\n') || undefined
        return JSON.stringify({
          _media: 'image',
          url: `data:${imageContent.mimetype};base64,${imageContent.base64}`,
          caption,
        })
      }
      return typeof userContent === 'string' ? userContent : JSON.stringify(userContent)
    })()
    // queryText usa o texto puro para RAG/detecção de intenção, nunca o JSON de mídia
    const queryText = messageText || combinedText

    const identity = await resolveIdentity(phone, messageText)
    const resolvedConfirmedName = getKnownName(identity, confirmedConversationName)
    const identityContext = buildIdentityContext(identity, resolvedConfirmedName)

    if (identity.type === 'aluno' || identity.type === 'gestor') {
      await adminClient.from('conversations').update({ student_id: identity.student.id }).eq('phone', phone)
    }

    if (detectPasswordResetIntent(queryText)) {
      const hasMoodle = (identity.type === 'aluno' || identity.type === 'gestor') && identity.student.moodle_id
      if (hasMoodle) {
        const moodleUrl = process.env.MOODLE_URL ?? 'o portal do Moodle'
        await storeUserMessage(phone, userContentText)
        if (await abortIfPaused('antes do fluxo de troca de senha')) return
        await sendAssistantMessage(
          phone,
          replyTarget,
          `Para redefinir sua senha de acesso ao Moodle (${moodleUrl}), preciso confirmar sua identidade.\n\nPor favor, me informe seu *CPF* (somente numeros ou com pontuacao).`,
          { pending_action: { type: 'password_reset', step: 'ask_cpf' } }
        )
        await syncContactsSnapshot()
        return
      }
    }

    if (detectHumanHandoffIntent(queryText)) {
      await storeUserMessage(phone, userContentText)
      if (await abortIfPaused('antes do aviso de transferencia humana')) return
      await activateHumanHandoff(phone, replyTarget, 'Entendi. Vou transferir voce para um atendimento humano agora. Em alguns minutos nossa equipe continua por aqui.')
      await syncContactsSnapshot()
      return
    }

    if (detectExplicitTicketIntent(queryText)) {
      await storeUserMessage(phone, userContentText)
      if (await abortIfPaused('antes do fluxo guiado de ticket')) return
      await sendAssistantMessage(
        phone,
        replyTarget,
        'Perfeito. Descreva brevemente o assunto do problema para eu abrir o ticket com protocolo.',
        { pending_action: { type: 'support_ticket', step: 'ask_subject' } }
      )
      await syncContactsSnapshot()
      return
    }

    const { data: history } = await adminClient
      .from('chatmemory')
      .select('role, content')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(20)

    const ragChunks = await searchRelevantChunks(queryText)
    const ragContext = buildRagContext(ragChunks)

    let moodleContext: string | null = null
    if (identity.type === 'aluno' && identity.student.moodle_id) {
      const intent = detectMoodleIntent(queryText)
      if (intent) moodleContext = await fetchMoodleContext(identity.student, intent)
    }

    const basePrompt = await buildSystemPrompt(identityContext, ragContext, moodleContext)
    const systemPrompt = `${basePrompt}

## Roteamento Operacional
Voce DEVE iniciar toda resposta com exatamente um destes marcadores:
- [[ROUTE:REPLY]]
- [[ROUTE:HUMAN]]
- [[ROUTE:OFFER_TICKET]]

Use [[ROUTE:REPLY]] quando conseguir resolver ou orientar diretamente.
Use [[ROUTE:HUMAN]] quando o usuario pedir atendimento humano ou quando voce nao conseguir resolver com seguranca e o melhor caminho for transferir para a equipe.
Use [[ROUTE:OFFER_TICKET]] quando o melhor proximo passo for oferecer a abertura de um ticket com protocolo.
Depois do marcador, escreva normalmente em pt-BR e nao explique o roteamento interno.`

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history ?? []).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content as string,
      })),
      { role: 'user', content: userContent },
    ]

    await storeUserMessage(phone, userContentText)

    const rawResponse = await chatCompletion(chatMessages)
    const parsedResponse = parseAssistantRoute(rawResponse)

    if (parsedResponse.route === 'HUMAN') {
      if (await abortIfPaused('antes da resposta de transferencia humana')) return
      await activateHumanHandoff(
        phone,
        replyTarget,
        parsedResponse.content || 'Vou transferir voce para um atendimento humano agora. Em alguns minutos nossa equipe continua por aqui.'
      )
      await syncContactsSnapshot()
      return
    }

    if (parsedResponse.route === 'OFFER_TICKET') {
      if (await abortIfPaused('antes da oferta de ticket')) return
      await sendAssistantMessage(
        phone,
        replyTarget,
        parsedResponse.content || 'Se quiser, posso abrir um ticket de suporte com protocolo para acompanhar esse caso. Deseja que eu faca isso?',
        { pending_action: { type: 'support_ticket_offer' } }
      )
      await syncContactsSnapshot()
      return
    }

    if (await abortIfPaused('imediatamente antes do envio da resposta')) return

    await sendAssistantMessage(phone, replyTarget, parsedResponse.content || rawResponse)
    await syncContactsSnapshot()
  } catch (error) {
    console.error('[MARA Agent] Erro ao processar mensagem:', error)
    try {
      const pauseState = await getMaraPauseState(phone)
      if (pauseState.pausedUntil || pauseState.humanHandoffActive || pauseState.manualPaused) {
        console.log(`[MARA] Fallback suprimido para ${phone} - bloqueio ativo para atendimento humano`)
        return
      }
      await sendText(routing.replyTarget ?? phone, FALLBACK_MESSAGE)
    } catch {
      console.error('[MARA Agent] Falha ao enviar mensagem de fallback')
    }
  }
}

export async function checkInactivity(): Promise<{ followups: number; closings: number }> {
  const now = Date.now()
  const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString()
  const sixtyMinutesAgo = new Date(now - 60 * 60 * 1000).toISOString()

  let followups = 0
  let closings = 0

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

  const toClose = candidates.filter((t) =>
    !t.last_student_message_at ||
    t.last_student_message_at < t.last_attendant_reply_at!
  )

  if (!toClose.length) return { closed: 0 }

  const ids = toClose.map((t) => t.id)
  await getAdminClient()
    .from('support_tickets')
    .update({ status: 'fechado_inatividade', closed_at: now })
    .in('id', ids)

  for (const t of toClose) {
    try {
      await sendText(
        t.phone,
        'Seu chamado de suporte foi encerrado por inatividade (sem resposta por 7 dias apos nosso ultimo contato). Caso ainda precise de ajuda, e so entrar em contato novamente.'
      )
    } catch {
      // ignore notification errors
    }
  }

  return { closed: toClose.length }
}
