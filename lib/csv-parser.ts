import Papa from 'papaparse'
import { normalizePhone } from './utils'

export interface CSVContact {
  phone: string
  name?: string
  variables?: Record<string, string> // extra CSV columns for variable substitution
}

export interface ParseResult {
  valid: CSVContact[]
  invalid: { row: number; raw: string; reason: string }[]
  total: number
}

const PHONE_COLS = ['phone', 'telefone', 'celular', 'whatsapp', 'numero', 'número']
const NAME_COLS = ['name', 'nome', 'contato']

export function parseContactsCSV(csvText: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const valid: CSVContact[] = []
  const invalid: ParseResult['invalid'] = []

  result.data.forEach((row, i) => {
    const rawPhone =
      row['phone'] ??
      row['telefone'] ??
      row['celular'] ??
      row['whatsapp'] ??
      row['numero'] ??
      row['número'] ??
      ''

    const name =
      row['name'] ??
      row['nome'] ??
      row['contato'] ??
      undefined

    if (!rawPhone) {
      invalid.push({ row: i + 2, raw: JSON.stringify(row), reason: 'Coluna de telefone não encontrada' })
      return
    }

    const normalized = normalizePhone(rawPhone)
    if (!normalized) {
      invalid.push({ row: i + 2, raw: rawPhone, reason: 'Número inválido (menos de 8 dígitos)' })
      return
    }

    // Capture all extra columns as variables for interpolation
    const variables: Record<string, string> = {}
    for (const col of Object.keys(row)) {
      if (!PHONE_COLS.includes(col) && !NAME_COLS.includes(col) && row[col]) {
        variables[col] = row[col]
      }
    }

    valid.push({
      phone: normalized,
      name: name?.trim() || undefined,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
    })
  })

  return { valid, invalid, total: result.data.length }
}
