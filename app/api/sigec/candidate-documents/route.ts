import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { extractRole } from '@/lib/roles'
import { SIGEC_DOCUMENT_BUCKET, SIGEC_MAX_DOCUMENT_SIZE } from '@/lib/sigec'
import { candidateDocumentPath, DocumentValidationError, processCandidateDocument } from '@/lib/sigec-document-processing'
import { MalwareScannerError, scanBufferWithClamAv } from '@/lib/sigec-malware'

export const runtime = 'nodejs'

const InputSchema = z.object({ applicationId: z.string().uuid(), requirementId: z.string().uuid() })
const RemoveInputSchema = z.object({ documentId: z.string().uuid() })

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
      supabase.from('sigec_applications').select('id, process_id, candidate_id, application_state').eq('id', parsed.data.applicationId).eq('candidate_id', user.id).maybeSingle(),
      supabase.from('sigec_document_requirements').select('id, process_id, accepted_mime_types, max_file_size_bytes').eq('id', parsed.data.requirementId).maybeSingle(),
    ])
    if (!application || !requirement || application.process_id !== requirement.process_id) {
      return NextResponse.json({ error: 'Candidatura ou documento obrigatório inválido.' }, { status: 404 })
    }
    if (application.application_state !== 'draft') {
      return NextResponse.json({ error: 'Inicie uma correção na inscrição antes de alterar documentos.' }, { status: 409 })
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
      if (registerError?.message.includes('SIGEC_DOCUMENT_REQUIREMENT_HIDDEN')) {
        return NextResponse.json({ error: 'Este documento não é necessário para as respostas atuais.' }, { status: 403 })
      }
      throw new Error(`register:${registerError?.code || 'missing_result'}`)
    }
    const result = registered as { document_id: string; document_version: number }

    try {
      const scan = await scanBufferWithClamAv(processed.buffer)
      const { error: scanRecordError } = await adminClient.rpc('sigec_record_document_malware_scan', {
        p_document_id: result.document_id,
        p_sha256: processed.sha256,
        p_status: scan.status,
        p_engine: scan.engine,
        p_signature: scan.status === 'infected' ? scan.signature : null,
        p_error_code: null,
      })
      if (scanRecordError) throw new Error('scan_record_failed')
      return NextResponse.json({
        ok: true,
        documentId: result.document_id,
        version: result.document_version,
        malwareStatus: scan.status,
        message: scan.status === 'clean'
          ? 'Documento enviado e aprovado na verificação antimalware.'
          : 'O arquivo foi bloqueado pela verificação antimalware. Envie uma nova versão segura.',
      })
    } catch (scanError) {
      const code = scanError instanceof MalwareScannerError ? scanError.code : 'scanner_internal_error'
      const { error: scanRecordError } = await adminClient.rpc('sigec_record_document_malware_scan', {
        p_document_id: result.document_id,
        p_sha256: processed.sha256,
        p_status: 'error',
        p_engine: 'clamav',
        p_signature: null,
        p_error_code: code,
      })
      console.error('[SIGEC candidate document] malware scan unavailable', {
        stage: scanRecordError ? 'scan_record' : 'scanner',
        code,
      })
      return NextResponse.json({
        ok: true,
        documentId: result.document_id,
        version: result.document_version,
        malwareStatus: scanRecordError ? 'pending' : 'error',
        message: 'Documento recebido e mantido em quarentena. A equipe poderá repetir a verificação antes da análise.',
      }, { status: 202 })
    }
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

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || extractRole(user) !== 'candidato') {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const parsed = RemoveInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })

  const { data, error } = await adminClient.rpc('sigec_remove_candidate_document', {
    p_document_id: parsed.data.documentId,
    p_actor_id: user.id,
  }).single()

  if (error || !data) {
    const message = error?.message || ''
    if (message.includes('SIGEC_DOCUMENT_REMOVE_APPLICATION_LOCKED')) {
      return NextResponse.json({ error: 'Este documento não pode mais ser removido porque a candidatura já foi enviada.' }, { status: 409 })
    }
    if (message.includes('SIGEC_DOCUMENT_REMOVE_FORBIDDEN')) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    }
    if (message.includes('SIGEC_DOCUMENT_ALREADY_REMOVED')) {
      return NextResponse.json({ error: 'Este documento já foi removido.' }, { status: 404 })
    }
    console.error('[SIGEC candidate document] remove failed', { stage: 'register' })
    return NextResponse.json({ error: 'Não foi possível remover o documento.' }, { status: 503 })
  }

  const storagePath = String((data as { storage_path?: string }).storage_path || '')
  if (storagePath) {
    const { error: storageError } = await adminClient.storage.from(SIGEC_DOCUMENT_BUCKET).remove([storagePath])
    if (storageError && storageError.message !== 'Object not found') {
      console.error('[SIGEC candidate document] removed metadata with orphaned object', { stage: 'storage_cleanup' })
    }
  }

  return NextResponse.json({ ok: true, message: 'Documento removido.' })
}
