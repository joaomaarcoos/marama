import { adminClient } from '@/lib/supabase/admin'
import { createEmbedding } from '@/lib/openai'

const CHUNK_SIZE = 1800      // ligeiramente menor para caber mais contexto no prompt
const CHUNK_OVERLAP = 200

export interface MatchedChunk {
  id: string
  document_id: string
  content: string
  similarity: number
}

/**
 * Normaliza texto extraído de PDFs:
 * - Padroniza quebras de linha
 * - Colapsa espaços excessivos
 * - Remove linhas em branco triplas ou mais
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')       // colapsa espaços/tabs horizontais
    .replace(/\n{3,}/g, '\n\n')    // máximo 2 linhas em branco consecutivas
    .trim()
}

/**
 * Divide texto em chunks respeitando parágrafos quando possível.
 * Parágrafo < CHUNK_SIZE → acumula até encher. Parágrafo ≥ CHUNK_SIZE →
 * divide por caracteres com overlap.
 */
export function chunkText(text: string): string[] {
  const normalized = normalizeText(text)
  const chunks: string[] = []
  const paragraphs = normalized.split(/\n\n+/)

  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // Parágrafo sozinho já ultrapassa CHUNK_SIZE → divide por caracteres
    if (trimmed.length > CHUNK_SIZE) {
      // Descarrega acumulado primeiro
      if (current.trim().length > 50) {
        chunks.push(current.trim())
        current = ''
      }
      let start = 0
      while (start < trimmed.length) {
        const end = Math.min(start + CHUNK_SIZE, trimmed.length)
        const sub = trimmed.slice(start, end).trim()
        if (sub.length > 50) chunks.push(sub)
        start += CHUNK_SIZE - CHUNK_OVERLAP
      }
      continue
    }

    // Adicionar parágrafo ao chunk corrente estouraria o limite → descarrega
    if (current && current.length + trimmed.length + 2 > CHUNK_SIZE) {
      if (current.trim().length > 50) chunks.push(current.trim())
      current = trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }

  if (current.trim().length > 50) chunks.push(current.trim())

  return chunks
}

/**
 * Recebe o ID do documento e o texto completo, divide em chunks,
 * embeda cada um e salva em document_chunks.
 * Retorna o número de chunks criados.
 */
export async function embedAndStoreDocument(
  documentId: string,
  text: string
): Promise<number> {
  const chunks = chunkText(text)
  if (chunks.length === 0) return 0

  // Embeda em batches de 10 para não estourar rate limit da OpenAI
  const batchSize = 10
  const rows: { document_id: string; content: string; embedding: string; chunk_index: number }[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const embeddings = await Promise.all(batch.map((c) => createEmbedding(c)))
    for (let j = 0; j < batch.length; j++) {
      rows.push({
        document_id: documentId,
        content: batch[j],
        embedding: JSON.stringify(embeddings[j]),
        chunk_index: i + j,
      })
    }
  }

  const { error } = await adminClient.from('document_chunks').insert(rows)
  if (error) throw new Error(`Falha ao salvar chunks: ${error.message}`)

  await adminClient
    .from('documents')
    .update({ chunk_count: rows.length })
    .eq('id', documentId)

  return rows.length
}

/**
 * Busca chunks relevantes para uma query por similaridade de cosseno.
 * threshold 0.5 e matchCount 6 aumentam recall sem ruído excessivo.
 */
export async function searchRelevantChunks(
  query: string,
  matchThreshold = 0.5,
  matchCount = 6
): Promise<MatchedChunk[]> {
  try {
    const queryEmbedding = await createEmbedding(query)

    const { data, error } = await adminClient.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: matchThreshold,
      match_count: matchCount,
    })

    if (error) {
      console.error('[RAG] Erro na busca semântica:', error)
      return []
    }

    return (data as MatchedChunk[]) ?? []
  } catch (err) {
    console.error('[RAG] searchRelevantChunks falhou:', err)
    return []
  }
}

/**
 * Formata chunks para injeção no system prompt.
 */
export function buildRagContext(chunks: MatchedChunk[]): string | null {
  if (!chunks || chunks.length === 0) return null

  const content = chunks
    .map((c, i) => `[Trecho ${i + 1}]\n${c.content}`)
    .join('\n\n')

  return `## Informações relevantes da base de conhecimento:\n\n${content}`
}
