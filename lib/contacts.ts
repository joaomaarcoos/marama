import { adminClient } from './supabase/admin'
import { extractCpf, normalizeConversationId, normalizeCpf, normalizePhone } from './utils'

type ContactRole = 'aluno' | 'gestor' | null

export interface ContactCourse {
  id: number
  fullname?: string
  shortname?: string
}

export interface ContactStudentRecord {
  id: string
  moodle_id: number | null
  full_name: string
  email: string | null
  phone: string | null
  phone2: string | null
  username: string | null
  cpf: string | null
  role: ContactRole
  courses: ContactCourse[]
}

interface ConversationRecord {
  phone: string
  contact_name: string | null
  student_id: string | null
  status: string | null
  followup_stage: string | null
  last_message_at: string | null
  last_message: string | null
  message_count: number | null
  labels: string[] | null
  lgpd_accepted_at: string | null
  assigned_name: string | null
  students: ContactStudentRecord | null
}

export interface ContactProfile {
  id: string
  displayName: string
  internalName: string | null
  studentName: string | null
  canonicalPhone: string | null
  phoneAliases: string[]
  conversationPhones: string[]
  email: string | null
  cpf: string | null
  username: string | null
  moodleId: number | null
  studentId: string | null
  role: ContactRole
  courses: ContactCourse[]
  labels: string[]
  lastMessageAt: string | null
  lastMessage: string | null
  assignedName: string | null
  lgpdAcceptedAt: string | null
  status: string | null
  followupStage: string | null
  messageCount: number
  hasMoodleData: boolean
  hasOperationalData: boolean
  knowledgeLevel: 'moodle' | 'operational' | 'unknown'
}

export interface ResolvedContactMatch {
  profile: ContactProfile | null
  student: ContactStudentRecord | null
  matchedBy: 'conversation-student' | 'student-phone' | 'cpf' | 'conversation-only' | 'none'
}

interface PersistedAliasRow {
  alias_type: string
  alias_value: string
  normalized_value: string
  is_primary: boolean | null
}

interface PersistedContactRow {
  id: string
  display_name: string
  internal_name: string | null
  student_name: string | null
  canonical_phone: string | null
  email: string | null
  cpf: string | null
  username: string | null
  moodle_id: number | null
  student_id: string | null
  role: ContactRole
  courses: unknown
  labels: string[] | null
  conversation_phones: string[] | null
  last_message_at: string | null
  last_message: string | null
  assigned_name: string | null
  lgpd_accepted_at: string | null
  status: string | null
  followup_stage: string | null
  message_count: number | null
  has_moodle_data: boolean | null
  has_operational_data: boolean | null
  knowledge_level: ContactProfile['knowledgeLevel'] | null
  contact_aliases?: PersistedAliasRow[] | null
}

interface ContactSourceBundle {
  conversations: ConversationRecord[]
  students: ContactStudentRecord[]
}

interface MutableContactProfile {
  id: string
  internalName: string | null
  studentName: string | null
  canonicalPhone: string | null
  phoneAliases: Set<string>
  conversationPhones: Set<string>
  email: string | null
  cpf: string | null
  username: string | null
  moodleId: number | null
  studentId: string | null
  role: ContactRole
  courses: ContactCourse[]
  labels: Set<string>
  lastMessageAt: string | null
  lastMessage: string | null
  assignedName: string | null
  lgpdAcceptedAt: string | null
  status: string | null
  followupStage: string | null
  messageCount: number
}

function studentProfileId(studentId: string) {
  return `student:${studentId}`
}

function looseProfileId(identifier: string) {
  return `contact:${identifier}`
}

function normalizeCourseList(value: unknown): ContactCourse[] {
  if (!Array.isArray(value)) return []

  const courses: ContactCourse[] = []

  for (const course of value) {
    if (!course || typeof course !== 'object') continue

    const candidate = course as Record<string, unknown>
    const id = typeof candidate.id === 'number'
      ? candidate.id
      : Number(candidate.id ?? NaN)

    if (!Number.isFinite(id)) continue

    courses.push({
      id,
      fullname: typeof candidate.fullname === 'string' ? candidate.fullname : undefined,
      shortname: typeof candidate.shortname === 'string' ? candidate.shortname : undefined,
    })
  }

  return courses
}

function normalizeStudentRecord(record: ContactStudentRecord): ContactStudentRecord {
  return {
    ...record,
    phone: record.phone ? normalizeConversationId(record.phone) ?? record.phone : null,
    phone2: record.phone2 ? normalizeConversationId(record.phone2) ?? record.phone2 : null,
    cpf: normalizeCpf(record.cpf) ?? record.cpf,
    courses: normalizeCourseList(record.courses),
  }
}

function makeMutableProfile(id: string): MutableContactProfile {
  return {
    id,
    internalName: null,
    studentName: null,
    canonicalPhone: null,
    phoneAliases: new Set<string>(),
    conversationPhones: new Set<string>(),
    email: null,
    cpf: null,
    username: null,
    moodleId: null,
    studentId: null,
    role: null,
    courses: [],
    labels: new Set<string>(),
    lastMessageAt: null,
    lastMessage: null,
    assignedName: null,
    lgpdAcceptedAt: null,
    status: null,
    followupStage: null,
    messageCount: 0,
  }
}

function compareIsoDate(a: string | null, b: string | null) {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return new Date(a).getTime() - new Date(b).getTime()
}

function isLidIdentifier(value: string | null | undefined) {
  return Boolean(value && value.trim().endsWith('@lid'))
}

function isContactsPersistenceUnavailable(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : ''

  return message.includes('relation "contacts" does not exist')
    || message.includes('relation "contact_aliases" does not exist')
    || message.includes("Could not find the table 'public.contacts'")
    || message.includes("Could not find the table 'public.contact_aliases'")
    || message.includes("Could not find the 'contact_id' column")
    || message.includes("Could not find a relationship between 'contacts' and 'contact_aliases'")
    || message.includes('PGRST')
    || message.includes('Bad Request')
}

function normalizeEmbeddedStudent(value: unknown): ContactStudentRecord | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || typeof candidate !== 'object') return null
  return normalizeStudentRecord(candidate as ContactStudentRecord)
}

function phoneAliasesFromValue(value: string | null | undefined): string[] {
  if (!value) return []

  const aliases = new Set<string>()
  const trimmed = value.trim()
  if (!trimmed) return []

  aliases.add(trimmed)

  const normalizedConversation = normalizeConversationId(trimmed)
  if (normalizedConversation) aliases.add(normalizedConversation)

  const normalizedDigits = isLidIdentifier(trimmed) ? null : normalizePhone(trimmed)
  if (normalizedDigits) aliases.add(normalizedDigits)

  if (trimmed.includes('@') && !isLidIdentifier(trimmed)) {
    const local = trimmed.replace(/@.*/, '')
    const normalizedLocal = normalizePhone(local)
    if (normalizedLocal) aliases.add(normalizedLocal)
  }

  return Array.from(aliases)
}

function mergeCourses(target: ContactCourse[], source: ContactCourse[]) {
  const existing = new Set(target.map((course) => course.id))
  for (const course of source) {
    if (existing.has(course.id)) continue
    target.push(course)
    existing.add(course.id)
  }
}

function applyStudent(profile: MutableContactProfile, student: ContactStudentRecord) {
  const normalized = normalizeStudentRecord(student)

  profile.studentId = normalized.id
  profile.studentName = normalized.full_name
  profile.email = normalized.email ?? profile.email
  profile.cpf = normalized.cpf ?? profile.cpf
  profile.username = normalized.username ?? profile.username
  profile.moodleId = normalized.moodle_id
  profile.role = normalized.role ?? profile.role

  mergeCourses(profile.courses, normalized.courses)

  for (const phone of [normalized.phone, normalized.phone2]) {
    for (const alias of phoneAliasesFromValue(phone)) {
      profile.phoneAliases.add(alias)
    }
  }

  if (!profile.canonicalPhone) {
    profile.canonicalPhone = normalized.phone
      ?? normalized.phone2
      ?? Array.from(profile.phoneAliases).find((alias) => !alias.includes('@'))
      ?? null
  }
}

function applyConversation(profile: MutableContactProfile, conversation: ConversationRecord) {
  if (conversation.contact_name?.trim()) {
    profile.internalName = conversation.contact_name.trim()
  }

  for (const alias of phoneAliasesFromValue(conversation.phone)) {
    profile.phoneAliases.add(alias)
  }

  profile.conversationPhones.add(conversation.phone)

  if (!profile.canonicalPhone) {
    profile.canonicalPhone = normalizeConversationId(conversation.phone)
      ?? (isLidIdentifier(conversation.phone) ? null : normalizePhone(conversation.phone))
      ?? conversation.phone
  }

  for (const labelId of conversation.labels ?? []) {
    profile.labels.add(labelId)
  }

  profile.messageCount += conversation.message_count ?? 0

  if (compareIsoDate(conversation.last_message_at, profile.lastMessageAt) >= 0) {
    profile.lastMessageAt = conversation.last_message_at
    profile.lastMessage = conversation.last_message
    profile.status = conversation.status
    profile.followupStage = conversation.followup_stage
    profile.assignedName = conversation.assigned_name
  }

  if (!profile.lgpdAcceptedAt && conversation.lgpd_accepted_at) {
    profile.lgpdAcceptedAt = conversation.lgpd_accepted_at
  }
}

function finalizeProfile(profile: MutableContactProfile): ContactProfile {
  const aliases = Array.from(profile.phoneAliases)
  const canonicalPhone = profile.canonicalPhone
    ?? aliases.find((alias) => !alias.includes('@'))
    ?? aliases[0]
    ?? null

  const displayName =
    profile.internalName
    ?? profile.studentName
    ?? canonicalPhone
    ?? 'Contato sem identificacao'

  const hasMoodleData = !!profile.studentId
  const hasOperationalData =
    !!profile.internalName
    || profile.labels.size > 0
    || profile.conversationPhones.size > 0
    || !!profile.assignedName
    || !!profile.lastMessageAt

  return {
    id: profile.id,
    displayName,
    internalName: profile.internalName,
    studentName: profile.studentName,
    canonicalPhone,
    phoneAliases: aliases.sort(),
    conversationPhones: Array.from(profile.conversationPhones).sort(),
    email: profile.email,
    cpf: profile.cpf,
    username: profile.username,
    moodleId: profile.moodleId,
    studentId: profile.studentId,
    role: profile.role,
    courses: [...profile.courses].sort((a, b) =>
      (a.fullname ?? a.shortname ?? '').localeCompare(b.fullname ?? b.shortname ?? '', 'pt-BR')
    ),
    labels: Array.from(profile.labels).sort(),
    lastMessageAt: profile.lastMessageAt,
    lastMessage: profile.lastMessage,
    assignedName: profile.assignedName,
    lgpdAcceptedAt: profile.lgpdAcceptedAt,
    status: profile.status,
    followupStage: profile.followupStage,
    messageCount: profile.messageCount,
    hasMoodleData,
    hasOperationalData,
    knowledgeLevel: hasMoodleData ? 'moodle' : hasOperationalData ? 'operational' : 'unknown',
  }
}

async function loadContactSources(): Promise<ContactSourceBundle> {
  const [studentsResult, conversationsResult] = await Promise.all([
    adminClient
      .from('students')
      .select('id, moodle_id, full_name, email, phone, phone2, username, cpf, role, courses')
      .order('full_name', { ascending: true }),
    adminClient
      .from('conversations')
      .select('phone, contact_name, student_id, status, followup_stage, last_message_at, last_message, message_count, labels, lgpd_accepted_at, assigned_name, students(id, moodle_id, full_name, email, phone, phone2, username, cpf, role, courses)')
      .order('last_message_at', { ascending: false }),
  ])

  if (studentsResult.error) throw new Error(studentsResult.error.message)
  if (conversationsResult.error) throw new Error(conversationsResult.error.message)

  const students = (studentsResult.data ?? []).map((student) =>
    normalizeStudentRecord(student as ContactStudentRecord)
  )

  const conversations = (conversationsResult.data ?? []).map((conversation) => {
    const candidate = conversation as Record<string, unknown>

    return {
      phone: String(candidate.phone ?? ''),
      contact_name: typeof candidate.contact_name === 'string' ? candidate.contact_name : null,
      student_id: typeof candidate.student_id === 'string' ? candidate.student_id : null,
      status: typeof candidate.status === 'string' ? candidate.status : null,
      followup_stage: typeof candidate.followup_stage === 'string' ? candidate.followup_stage : null,
      last_message_at: typeof candidate.last_message_at === 'string' ? candidate.last_message_at : null,
      last_message: typeof candidate.last_message === 'string' ? candidate.last_message : null,
      message_count: typeof candidate.message_count === 'number' ? candidate.message_count : 0,
      labels: Array.isArray(candidate.labels)
        ? candidate.labels.filter((label): label is string => typeof label === 'string')
        : [],
      lgpd_accepted_at: typeof candidate.lgpd_accepted_at === 'string' ? candidate.lgpd_accepted_at : null,
      assigned_name: typeof candidate.assigned_name === 'string' ? candidate.assigned_name : null,
      students: normalizeEmbeddedStudent(candidate.students),
    } satisfies ConversationRecord
  })

  return { conversations, students }
}

function buildProfilesFromSources(sources: ContactSourceBundle): ContactProfile[] {
  const profiles = new Map<string, MutableContactProfile>()
  const aliasToProfile = new Map<string, string>()

  const ensureProfile = (id: string) => {
    const existing = profiles.get(id)
    if (existing) return existing

    const created = makeMutableProfile(id)
    profiles.set(id, created)
    return created
  }

  const registerAliases = (profileId: string, aliases: string[]) => {
    for (const alias of aliases) {
      if (!alias) continue
      aliasToProfile.set(alias, profileId)
    }
  }

  for (const student of sources.students) {
    const profileId = studentProfileId(student.id)
    const profile = ensureProfile(profileId)
    applyStudent(profile, student)
    registerAliases(profileId, Array.from(profile.phoneAliases))
  }

  for (const conversation of sources.conversations) {
    const embeddedStudent = conversation.students
    const directStudentId = conversation.student_id ?? embeddedStudent?.id ?? null

    if (embeddedStudent) {
      const profileId = studentProfileId(embeddedStudent.id)
      const profile = ensureProfile(profileId)
      applyStudent(profile, embeddedStudent)
      registerAliases(profileId, Array.from(profile.phoneAliases))
    }

    const conversationAliases = phoneAliasesFromValue(conversation.phone)
    const aliasMatch = conversationAliases
      .map((alias) => aliasToProfile.get(alias))
      .find((match): match is string => Boolean(match))

    const profileId =
      (directStudentId ? studentProfileId(directStudentId) : null)
      ?? aliasMatch
      ?? looseProfileId(normalizeConversationId(conversation.phone) ?? conversation.phone)

    const profile = ensureProfile(profileId)
    applyConversation(profile, conversation)
    registerAliases(profileId, Array.from(profile.phoneAliases))
  }

  return Array.from(profiles.values())
    .map(finalizeProfile)
    .sort((a, b) => {
      const byLastMessage = compareIsoDate(b.lastMessageAt, a.lastMessageAt)
      if (byLastMessage !== 0) return byLastMessage
      return a.displayName.localeCompare(b.displayName, 'pt-BR')
    })
}

function filterProfiles(profiles: ContactProfile[], search?: string) {
  const query = search?.trim().toLowerCase()
  if (!query) return profiles

  return profiles.filter((profile) => {
    const haystack = [
      profile.displayName,
      profile.internalName,
      profile.studentName,
      profile.email,
      profile.cpf,
      profile.username,
      profile.canonicalPhone,
      profile.lastMessage,
      ...profile.phoneAliases,
      ...profile.conversationPhones,
      ...profile.courses.flatMap((course) => [course.fullname, course.shortname]),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

function mapPersistedRow(row: PersistedContactRow): ContactProfile {
  const aliases = Array.isArray(row.contact_aliases)
    ? row.contact_aliases
        .map((alias) => alias.alias_value)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []

  return {
    id: row.id,
    displayName: row.display_name,
    internalName: row.internal_name,
    studentName: row.student_name,
    canonicalPhone: row.canonical_phone,
    phoneAliases: Array.from(new Set(aliases)).sort(),
    conversationPhones: Array.isArray(row.conversation_phones) ? row.conversation_phones : [],
    email: row.email,
    cpf: row.cpf,
    username: row.username,
    moodleId: row.moodle_id,
    studentId: row.student_id,
    role: row.role,
    courses: normalizeCourseList(row.courses),
    labels: Array.isArray(row.labels) ? row.labels : [],
    lastMessageAt: row.last_message_at,
    lastMessage: row.last_message,
    assignedName: row.assigned_name,
    lgpdAcceptedAt: row.lgpd_accepted_at,
    status: row.status,
    followupStage: row.followup_stage,
    messageCount: row.message_count ?? 0,
    hasMoodleData: Boolean(row.has_moodle_data),
    hasOperationalData: Boolean(row.has_operational_data),
    knowledgeLevel: row.knowledge_level ?? 'unknown',
  }
}

async function loadPersistedProfiles(): Promise<ContactProfile[] | null> {
  const { data: contactsData, error: contactsError } = await adminClient
    .from('contacts')
    .select('id, display_name, internal_name, student_name, canonical_phone, email, cpf, username, moodle_id, student_id, role, courses, labels, conversation_phones, last_message_at, last_message, assigned_name, lgpd_accepted_at, status, followup_stage, message_count, has_moodle_data, has_operational_data, knowledge_level')
    .order('last_message_at', { ascending: false })

  if (contactsError) {
    if (isContactsPersistenceUnavailable(contactsError)) return null
    throw new Error(contactsError.message)
  }

  const { data: aliasesData, error: aliasesError } = await adminClient
    .from('contact_aliases')
    .select('contact_id, alias_type, alias_value, normalized_value, is_primary')

  if (aliasesError) {
    if (isContactsPersistenceUnavailable(aliasesError)) return null
    throw new Error(aliasesError.message)
  }

  const aliasesByContact = new Map<string, PersistedAliasRow[]>()
  for (const row of aliasesData ?? []) {
    const candidate = row as Record<string, unknown>
    const contactId = typeof candidate.contact_id === 'string' ? candidate.contact_id : null
    if (!contactId) continue

    const aliasRow: PersistedAliasRow = {
      alias_type: typeof candidate.alias_type === 'string' ? candidate.alias_type : 'unknown',
      alias_value: typeof candidate.alias_value === 'string' ? candidate.alias_value : '',
      normalized_value: typeof candidate.normalized_value === 'string' ? candidate.normalized_value : '',
      is_primary: typeof candidate.is_primary === 'boolean' ? candidate.is_primary : null,
    }

    const current = aliasesByContact.get(contactId) ?? []
    current.push(aliasRow)
    aliasesByContact.set(contactId, current)
  }

  return (contactsData ?? []).map((row) =>
    mapPersistedRow({
      ...(row as PersistedContactRow),
      contact_aliases: aliasesByContact.get(String((row as Record<string, unknown>).id)) ?? [],
    })
  )
}

function buildPersistedContactRow(profile: ContactProfile) {
  return {
    id: profile.id,
    display_name: profile.displayName,
    internal_name: profile.internalName,
    student_name: profile.studentName,
    canonical_phone: profile.canonicalPhone,
    email: profile.email,
    cpf: profile.cpf,
    username: profile.username,
    moodle_id: profile.moodleId,
    student_id: profile.studentId,
    role: profile.role,
    courses: profile.courses,
    labels: profile.labels,
    conversation_phones: profile.conversationPhones,
    last_message_at: profile.lastMessageAt,
    last_message: profile.lastMessage,
    assigned_name: profile.assignedName,
    lgpd_accepted_at: profile.lgpdAcceptedAt,
    status: profile.status,
    followup_stage: profile.followupStage,
    message_count: profile.messageCount,
    has_moodle_data: profile.hasMoodleData,
    has_operational_data: profile.hasOperationalData,
    knowledge_level: profile.knowledgeLevel,
  }
}

function buildPersistedAliases(profile: ContactProfile) {
  const rows: Array<{
    contact_id: string
    alias_type: string
    alias_value: string
    normalized_value: string
    is_primary: boolean
    source: string
  }> = []

  for (const alias of profile.phoneAliases) {
    rows.push({
      contact_id: profile.id,
      alias_type: alias.includes('@') ? 'jid' : 'phone',
      alias_value: alias,
      normalized_value: normalizeConversationId(alias) ?? alias,
      is_primary: profile.canonicalPhone === alias,
      source: 'contact-profile',
    })
  }

  for (const phone of profile.conversationPhones) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'conversation_phone',
      alias_value: phone,
      normalized_value: normalizeConversationId(phone) ?? phone,
      is_primary: profile.canonicalPhone === phone,
      source: 'conversation',
    })
  }

  if (profile.email) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'email',
      alias_value: profile.email,
      normalized_value: profile.email.trim().toLowerCase(),
      is_primary: true,
      source: 'student',
    })
  }

  if (profile.cpf) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'cpf',
      alias_value: profile.cpf,
      normalized_value: normalizeCpf(profile.cpf) ?? profile.cpf,
      is_primary: true,
      source: 'student',
    })
  }

  if (profile.username) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'username',
      alias_value: profile.username,
      normalized_value: profile.username.trim().toLowerCase(),
      is_primary: true,
      source: 'student',
    })
  }

  if (profile.studentId) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'student_id',
      alias_value: profile.studentId,
      normalized_value: profile.studentId,
      is_primary: true,
      source: 'student',
    })
  }

  if (profile.moodleId) {
    rows.push({
      contact_id: profile.id,
      alias_type: 'moodle_id',
      alias_value: String(profile.moodleId),
      normalized_value: String(profile.moodleId),
      is_primary: true,
      source: 'student',
    })
  }

  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.alias_type}:${row.normalized_value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function persistDerivedProfiles(profiles: ContactProfile[]): Promise<boolean> {
  const { data: existing, error: existingError } = await adminClient
    .from('contacts')
    .select('id')

  if (existingError) {
    if (isContactsPersistenceUnavailable(existingError)) return false
    throw new Error(existingError.message)
  }

  const ids = profiles.map((profile) => profile.id)
  const existingIds = (existing ?? []).map((row) => String((row as Record<string, unknown>).id))
  const obsoleteIds = existingIds.filter((id) => !ids.includes(id))

  if (profiles.length > 0) {
    const { error: upsertContactsError } = await adminClient
      .from('contacts')
      .upsert(profiles.map(buildPersistedContactRow), { onConflict: 'id' })

    if (upsertContactsError) {
      if (isContactsPersistenceUnavailable(upsertContactsError)) return false
      throw new Error(upsertContactsError.message)
    }

    const { error: deleteAliasError } = await adminClient
      .from('contact_aliases')
      .delete()
      .in('contact_id', ids)

    if (deleteAliasError) {
      if (isContactsPersistenceUnavailable(deleteAliasError)) return false
      throw new Error(deleteAliasError.message)
    }

    const aliases = profiles.flatMap(buildPersistedAliases)
    if (aliases.length > 0) {
      const { error: insertAliasError } = await adminClient
        .from('contact_aliases')
        .insert(aliases)

      if (insertAliasError) {
        if (isContactsPersistenceUnavailable(insertAliasError)) return false
        throw new Error(insertAliasError.message)
      }
    }

    for (const profile of profiles) {
      if (profile.studentId) {
        const { error: updateStudentError } = await adminClient
          .from('students')
          .update({ contact_id: profile.id })
          .eq('id', profile.studentId)

        if (updateStudentError) {
          if (isContactsPersistenceUnavailable(updateStudentError)) return false
          throw new Error(updateStudentError.message)
        }
      }

      if (profile.conversationPhones.length > 0) {
        const { error: updateConversationError } = await adminClient
          .from('conversations')
          .update({ contact_id: profile.id })
          .in('phone', profile.conversationPhones)

        if (updateConversationError) {
          if (isContactsPersistenceUnavailable(updateConversationError)) return false
          throw new Error(updateConversationError.message)
        }
      }
    }
  }

  if (obsoleteIds.length > 0) {
    const { error: deleteObsoleteAliasesError } = await adminClient
      .from('contact_aliases')
      .delete()
      .in('contact_id', obsoleteIds)

    if (deleteObsoleteAliasesError) {
      if (isContactsPersistenceUnavailable(deleteObsoleteAliasesError)) return false
      throw new Error(deleteObsoleteAliasesError.message)
    }

    const { error: deleteObsoleteContactsError } = await adminClient
      .from('contacts')
      .delete()
      .in('id', obsoleteIds)

    if (deleteObsoleteContactsError) {
      if (isContactsPersistenceUnavailable(deleteObsoleteContactsError)) return false
      throw new Error(deleteObsoleteContactsError.message)
    }
  }

  return true
}

export async function syncContactsSnapshot(): Promise<ContactProfile[]> {
  const derivedProfiles = buildProfilesFromSources(await loadContactSources())
  try {
    await persistDerivedProfiles(derivedProfiles)
  } catch (error) {
    console.warn('[contacts] Persistencia indisponivel, usando agregacao derivada:', error)
  }
  return derivedProfiles
}

async function loadProfilesForRead(): Promise<ContactProfile[]> {
  const persisted = await loadPersistedProfiles()
  if (persisted && persisted.length > 0) return persisted

  const derived = buildProfilesFromSources(await loadContactSources())

  if (persisted !== null && derived.length > 0) {
    await persistDerivedProfiles(derived)
    const refreshed = await loadPersistedProfiles()
    if (refreshed) return refreshed
  }

  return derived
}

export async function listContactProfiles(options: { search?: string } = {}): Promise<ContactProfile[]> {
  const profiles = await loadProfilesForRead()
  return filterProfiles(profiles, options.search)
}

export async function getContactProfileById(contactId: string): Promise<ContactProfile | null> {
  const profiles = await loadProfilesForRead()
  return profiles.find((profile) => profile.id === contactId) ?? null
}

async function findStudentByPhone(phone: string | null): Promise<ContactStudentRecord | null> {
  if (!phone) return null

  const { data, error } = await adminClient
    .from('students')
    .select('id, moodle_id, full_name, email, phone, phone2, username, cpf, role, courses')
    .or(`phone.eq.${phone},phone2.eq.${phone}`)
    .limit(1)

  if (error) throw new Error(error.message)

  const student = data?.[0]
  return student ? normalizeStudentRecord(student as ContactStudentRecord) : null
}

async function findStudentByCpf(cpf: string | null): Promise<ContactStudentRecord | null> {
  if (!cpf) return null

  const { data, error } = await adminClient
    .from('students')
    .select('id, moodle_id, full_name, email, phone, phone2, username, cpf, role, courses')
    .eq('cpf', cpf)
    .limit(1)

  if (error) throw new Error(error.message)

  const student = data?.[0]
  return student ? normalizeStudentRecord(student as ContactStudentRecord) : null
}

async function findConversationByPhoneCandidates(phoneCandidates: string[]): Promise<ConversationRecord | null> {
  if (phoneCandidates.length === 0) return null

  const { data, error } = await adminClient
    .from('conversations')
    .select('phone, contact_name, student_id, status, followup_stage, last_message_at, last_message, message_count, labels, lgpd_accepted_at, assigned_name, students(id, moodle_id, full_name, email, phone, phone2, username, cpf, role, courses)')
    .in('phone', phoneCandidates)
    .order('last_message_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)

  const conversation = data?.[0]
  if (!conversation) return null

  const candidate = conversation as Record<string, unknown>

  return {
    phone: String(candidate.phone ?? ''),
    contact_name: typeof candidate.contact_name === 'string' ? candidate.contact_name : null,
    student_id: typeof candidate.student_id === 'string' ? candidate.student_id : null,
    status: typeof candidate.status === 'string' ? candidate.status : null,
    followup_stage: typeof candidate.followup_stage === 'string' ? candidate.followup_stage : null,
    last_message_at: typeof candidate.last_message_at === 'string' ? candidate.last_message_at : null,
    last_message: typeof candidate.last_message === 'string' ? candidate.last_message : null,
    message_count: typeof candidate.message_count === 'number' ? candidate.message_count : 0,
    labels: Array.isArray(candidate.labels)
      ? candidate.labels.filter((label): label is string => typeof label === 'string')
      : [],
    lgpd_accepted_at: typeof candidate.lgpd_accepted_at === 'string' ? candidate.lgpd_accepted_at : null,
    assigned_name: typeof candidate.assigned_name === 'string' ? candidate.assigned_name : null,
    students: normalizeEmbeddedStudent(candidate.students),
  }
}

export async function resolveKnownContact(
  phone: string,
  messageText?: string
): Promise<ResolvedContactMatch> {
  const normalizedDigits = isLidIdentifier(phone) ? null : normalizePhone(phone)
  const phoneCandidates = Array.from(
    new Set(
      [phone, normalizeConversationId(phone), normalizedDigits]
        .filter((candidate): candidate is string => Boolean(candidate))
    )
  )

  const conversation = await findConversationByPhoneCandidates(phoneCandidates)

  let student = conversation?.students ?? null
  let matchedBy: ResolvedContactMatch['matchedBy'] = 'none'

  if (student) {
    matchedBy = 'conversation-student'
  } else if (normalizedDigits) {
    student = await findStudentByPhone(normalizedDigits)
    if (student) matchedBy = 'student-phone'
  }

  if (!student && messageText) {
    const cpf = normalizeCpf(extractCpf(messageText))
    if (cpf) {
      student = await findStudentByCpf(cpf)
      if (student) {
        matchedBy = 'cpf'

        if (!student.phone && normalizedDigits) {
          await adminClient
            .from('students')
            .update({ phone: normalizedDigits })
            .eq('id', student.id)

          student = { ...student, phone: normalizedDigits }
        }
      }
    }
  }

  if (!student && conversation) {
    matchedBy = 'conversation-only'
  }

  if (!student && !conversation) {
    return { profile: null, student: null, matchedBy }
  }

  const profile = buildProfilesFromSources({
    students: student ? [student] : [],
    conversations: conversation ? [conversation] : [],
  })[0] ?? null

  return { profile, student, matchedBy }
}
