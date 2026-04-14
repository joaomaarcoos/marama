import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  // Remove tudo que não for dígito
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null
  // Garante prefixo 55 (Brasil)
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11 || digits.length === 10) return `55${digits}`
  return digits
}

export function normalizeConversationId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.endsWith('@g.us')) return null
  if (trimmed.endsWith('@lid')) return trimmed
  if (trimmed.includes('@')) {
    const local = trimmed.replace(/@.*/, '')
    return normalizePhone(local) ?? trimmed
  }
  return normalizePhone(trimmed) ?? trimmed
}

export function toWhatsAppJid(value: string | null | undefined): string | null {
  const normalized = normalizeConversationId(value)
  if (!normalized) return null
  if (normalized.includes('@')) return normalized
  return `${normalized}@s.whatsapp.net`
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) {
    // 55 + DDD (2) + 9 dígitos
    return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`
  }
  if (digits.length === 12) {
    // 55 + DDD (2) + 8 dígitos
    return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,8)}-${digits.slice(8)}`
  }
  return phone
}

export function normalizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return null
  return digits
}

export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return cpf
}

export function extractCpf(text: string): string | null {
  // Matches XXX.XXX.XXX-XX or XXXXXXXXXXX (11 digits)
  const match = text.match(/\b\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s.-]?\d{2}\b/)
  if (!match) return null
  return normalizeCpf(match[0])
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
