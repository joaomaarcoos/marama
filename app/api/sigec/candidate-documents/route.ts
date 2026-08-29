import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import { SIGEC_DOCUMENT_BUCKET, SIGEC_MAX_DOCUMENT_SIZE } from '@/lib/sigec'
import { candidateDocumentPath, DocumentValidationError, processCandidateDocument } from '@/lib/sigec-document-processing'

export const runtime = 'nodejs'

const InputSchema = z.object({ applicationId: z.string().uuid(), requirementId: z.string().uuid() })

export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > SIGEC_MAX_DOCUMENT_SIZE + 1024 * 1024) return NextResponse.json({ error: 'Arquivo muito grande.' }, { status: 413 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  try {
    const form = await request.formData()
    const parsed = InputSchema.safeParse({ applicationId: form.get('applicationId'), requirementId: form.get('requirementId') })
    const file = form.get('file')
    if (!parsed.success || !(file instanceof File)) return NextResponse.json({ error: 'Dados do documento inválidos.' }, { status: 400 })

    const [{ data: application }, { data: requirement }] = await Promise.all([
      supabase.from('sigec_applications').select('id, process_id, candidate_id').eq('id', parsed.data.applicationId).eq('candidate_id', user.id).maybeSingle(),
      supabase.from('sigec_document_requirements').select('id, process_id, accepted_mime_types, max_file_size_bytes').eq('id', parsed.data.requirementId).maybeSingle(),
    ])
    if (!application || !requirement || application.process_id !== requirement.process_id) {
      return NextResponse.json({ error: 'Candidatura ou documento obrigatório inválido.' }, { status: 404 })
    }

    const processed = await processCandidateDocument(file)
    const allowedTypes = Array.isArray(requirement.accepted_mime_types) ? requirement.accepted_mime_types : []
    const limit = Math.min(Number(requirement.max_file_size_bytes || SIGEC_MAX_DOCUMENT_SIZE), SIGEC_MAX_DOCUMENT_SIZE)
    if (!allowedTypes.includes(processed.mimeType) || processed.buffer.length > limit) {
      return NextResponse.json({ error: 'O arquivo não atende às regras deste documento.' }, { status: 400 })
    }

    const path = candidateDocumentPath(user.id, application.id, requirement.id, processed.extension)
    const { error: uploadError } = await adminClient.storage.from(SIGEC_DOCUMENT_BUCKET).upload(path, processed.buffer, {
      contentType: processed.mimeType,
      upsert: false,
      cacheControl: '0',
    })
    if (uploadError) throw new Error(`storage:${uploadError.message}`)

    const { data: registered, error: registerError } = await adminClient.rpc('sigec_register_candidate_document', {
      p_application_id: application.id,
      p_requirement_id: requirement.id,
      p_storage_path: path,
      p_original_name: processed.originalName,
      p_mime_type: processed.mimeType,
      p_size_bytes: processed.buffer.length,
      p_sha256: processed.sha256,
      p_actor_id: user.id,
    }).single()
    if (registerError || !registered) {
      await adminClient.storage.from(SIGEC_DOCUMENT_BUCKET).remove([path])
      throw new Error(`register:${registerError?.code || 'missing_result'}`)
    }
    const result = registered as { document_id: string; document_version: number }

    return NextResponse.json({ ok: true, documentId: result.document_id, version: result.document_version })
  } catch (error) {
    if (error instanceof DocumentValidationError) return NextResponse.json({ error: error.message }, { status: 400 })
    const stage = error instanceof Error && error.message.startsWith('storage:')
      ? 'storage'
      : error instanceof Error && error.message.startsWith('register:')
        ? 'register'
        : 'processing'
    console.error('[SIGEC candidate document] upload failed', { stage })
    return NextResponse.json({ error: 'Não foi possível processar o documento.' }, { status: 503 })
  }
}
