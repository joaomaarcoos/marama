import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractRole } from '@/lib/roles'
import { SIGEC_DOCUMENT_BUCKET, SIGEC_MAX_DOCUMENT_SIZE } from '@/lib/sigec'
import { MalwareScannerError, scanBufferWithClamAv } from '@/lib/sigec-malware'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const InputSchema = z.object({ documentId: z.string().uuid() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = extractRole(user)
  if (!user || (role !== 'admin' && role !== 'gerente')) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const input = InputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })

  const { data: document } = await supabase
    .from('sigec_application_documents')
    .select('id, storage_path, sha256, size_bytes, technical_status, malware_status')
    .eq('id', input.data.documentId)
    .maybeSingle()
  if (!document || document.technical_status !== 'validated' || !['pending', 'error'].includes(document.malware_status)) {
    return NextResponse.json({ error: 'Documento indisponível para nova varredura.' }, { status: 409 })
  }
  if (!document.sha256 || Number(document.size_bytes) < 1 || Number(document.size_bytes) > SIGEC_MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: 'Documento com integridade inválida.' }, { status: 409 })
  }

  const { data: blob, error: downloadError } = await adminClient.storage.from(SIGEC_DOCUMENT_BUCKET).download(document.storage_path)
  if (downloadError || !blob) return NextResponse.json({ error: 'Arquivo em quarentena não localizado.' }, { status: 409 })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const digest = createHash('sha256').update(buffer).digest('hex')
  if (digest !== document.sha256) {
    await adminClient.rpc('sigec_record_document_malware_scan', {
      p_document_id: document.id,
      p_sha256: document.sha256,
      p_status: 'error',
      p_engine: 'clamav',
      p_signature: null,
      p_error_code: 'storage_hash_mismatch',
    })
    console.error('[SIGEC document scan] integrity mismatch', { stage: 'integrity' })
    return NextResponse.json({ error: 'Falha de integridade. O documento continua em quarentena.' }, { status: 409 })
  }

  try {
    const scan = await scanBufferWithClamAv(buffer)
    const { error } = await adminClient.rpc('sigec_record_document_malware_scan', {
      p_document_id: document.id,
      p_sha256: document.sha256,
      p_status: scan.status,
      p_engine: scan.engine,
      p_signature: scan.status === 'infected' ? scan.signature : null,
      p_error_code: null,
    })
    if (error) throw new Error('scan_record_failed')
    return NextResponse.json({ ok: true, malwareStatus: scan.status })
  } catch (error) {
    const code = error instanceof MalwareScannerError ? error.code : 'scanner_internal_error'
    await adminClient.rpc('sigec_record_document_malware_scan', {
      p_document_id: document.id,
      p_sha256: document.sha256,
      p_status: 'error',
      p_engine: 'clamav',
      p_signature: null,
      p_error_code: code,
    })
    console.error('[SIGEC document scan] retry unavailable', { stage: 'scanner', code })
    return NextResponse.json({ error: 'Scanner indisponível. O documento continua em quarentena.' }, { status: 503 })
  }
}
