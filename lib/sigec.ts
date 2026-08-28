import { z } from 'zod'

export const SIGEC_MAX_PREFERENCES = 5
export const SIGEC_DOCUMENT_BUCKET = 'sigec-candidate-documents'
export const SIGEC_ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const SIGEC_MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

/* Stage presets live in a dependency-free module so client configuration UI
 * does not bundle the Zod schemas from this file. */
export { SIGEC_DEFAULT_STAGES, type SigecStageCode } from './sigec-stages'

export function normalizeCpf(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidCpf(value: string) {
  const cpf = normalizeCpf(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false

  const digit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

export function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function normalizeCourseName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.]$/g, '')
    .trim()
    .toUpperCase()
}

export const CandidateProfileSchema = z.object({
  fullName: z.string().trim().min(3).max(200),
  cpf: z.string().transform(normalizeCpf).refine(isValidCpf, 'CPF inválido'),
  birthDate: z.coerce.date().max(new Date(), 'Data de nascimento inválida'),
  whatsapp: z.string().transform(normalizeWhatsApp).refine((value) => /^[1-9][0-9]{9,14}$/.test(value), 'WhatsApp inválido'),
  postalCode: z.string().transform((value) => value.replace(/\D/g, '')).refine((value) => /^\d{8}$/.test(value), 'CEP inválido'),
  street: z.string().trim().min(2).max(200),
  addressNumber: z.string().trim().min(1).max(30),
  addressExtra: z.string().trim().max(120).optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(160),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  availability: z.string().trim().max(1000).optional(),
  professionalSummary: z.string().trim().max(5000).optional(),
})

export const ProcessInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  editalVersion: z.string().trim().min(1).max(50),
  applicationsOpenAt: z.coerce.date().optional(),
  applicationsCloseAt: z.coerce.date().optional(),
  maxPreferences: z.coerce.number().int().min(1).max(SIGEC_MAX_PREFERENCES).default(SIGEC_MAX_PREFERENCES),
}).refine(
  (data) => !data.applicationsOpenAt || !data.applicationsCloseAt || data.applicationsCloseAt > data.applicationsOpenAt,
  { message: 'O encerramento deve ocorrer depois da abertura.', path: ['applicationsCloseAt'] }
)

export const ApplicationPreferencesSchema = z.object({
  vacancyIds: z.array(z.string().uuid()).min(1).max(SIGEC_MAX_PREFERENCES),
}).superRefine((data, context) => {
  if (new Set(data.vacancyIds).size !== data.vacancyIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Uma vaga não pode aparecer mais de uma vez.' })
  }
})
