import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { embedAndStoreDocument } from '@/lib/rag'

// Lazy import for pdf-parse (avoids issues with Next.js edge runtime)
async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buffer)
  return result.text
}

export const maxDuration = 60 // Allow up to 60s for large documents

// GET /api/documentos — list all documents
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await adminClient
    .from('documents')
    .select('id, name, size_bytes, mime_type, chunk_count, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/documentos — upload a document
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown']
  if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
    return NextResponse.json({ error: 'Tipo de arquivo não suportado. Use PDF, TXT ou MD.' }, { status: 400 })
  }

  const MAX_SIZE = 10 * 1024 * 1024 // 10MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. Máximo 10MB.' }, { status: 400 })
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text
    let text = ''
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      text = await parsePdf(buffer)
    } else {
      text = buffer.toString('utf-8')
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Não foi possível extrair texto do arquivo.' }, { status: 400 })
    }

    // Create document record
    const { data: doc, error: docError } = await adminClient
      .from('documents')
      .insert({
        name: file.name,
        size_bytes: file.size,
        mime_type: file.type || 'text/plain',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Erro ao salvar documento.' }, { status: 500 })
    }

    // Embed and store chunks
    const chunkCount = await embedAndStoreDocument(doc.id, text)

    return NextResponse.json({
      id: doc.id,
      name: file.name,
      chunk_count: chunkCount,
      message: `Documento indexado com ${chunkCount} trechos.`,
    })
  } catch (error) {
    console.error('Erro ao processar documento:', error)
    return NextResponse.json({ error: 'Erro interno ao processar o documento.' }, { status: 500 })
  }
}
