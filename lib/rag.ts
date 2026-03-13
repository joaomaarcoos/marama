import { createClient } from '@/lib/supabase/admin'
import { createEmbedding } from '@/lib/openai'

const CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200

export interface MatchedChunk {
  id: string
  document_id: string
  content: string
  similarity: number
}

/**
 * Splits text into overlapping chunks for embedding
 */
export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 50) {
      chunks.push(chunk)
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }

  return chunks
}

/**
 * Takes a document ID and its full text, chunks it, embeds each chunk,
 * and stores them in document_chunks. Returns number of chunks created.
 */
export async function embedAndStoreDocument(
  documentId: string,
  text: string
): Promise<number> {
  const supabase = createClient()
  const chunks = chunkText(text)

  if (chunks.length === 0) return 0

  // Embed all chunks in parallel (batches of 10 to avoid rate limits)
  const batchSize = 10
  const embeddedChunks: { document_id: string; content: string; embedding: number[]; chunk_index: number }[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const embeddings = await Promise.all(batch.map((c) => createEmbedding(c)))
    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        document_id: documentId,
        content: batch[j],
        embedding: embeddings[j],
        chunk_index: i + j,
      })
    }
  }

  // Insert all chunks
  const { error } = await supabase.from('document_chunks').insert(
    embeddedChunks.map((c) => ({
      document_id: c.document_id,
      content: c.content,
      embedding: JSON.stringify(c.embedding),
      chunk_index: c.chunk_index,
    }))
  )

  if (error) throw new Error(`Failed to store chunks: ${error.message}`)

  // Update chunk_count in documents
  await supabase
    .from('documents')
    .update({ chunk_count: embeddedChunks.length })
    .eq('id', documentId)

  return embeddedChunks.length
}

/**
 * Searches for document chunks relevant to a query using cosine similarity
 */
export async function searchRelevantChunks(
  query: string,
  matchThreshold = 0.7,
  matchCount = 3
): Promise<MatchedChunk[]> {
  const supabase = createClient()

  try {
    const queryEmbedding = await createEmbedding(query)

    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: matchThreshold,
      match_count: matchCount,
    })

    if (error) {
      console.error('RAG search error:', error)
      return []
    }

    return (data as MatchedChunk[]) ?? []
  } catch (err) {
    console.error('RAG search failed:', err)
    return []
  }
}

/**
 * Formats matched chunks into a string for injection into the system prompt
 */
export function buildRagContext(chunks: MatchedChunk[]): string | null {
  if (!chunks || chunks.length === 0) return null

  const content = chunks
    .map((c, i) => `[Trecho ${i + 1}]\n${c.content}`)
    .join('\n\n')

  return `## Informações relevantes da base de conhecimento:\n\n${content}`
}
