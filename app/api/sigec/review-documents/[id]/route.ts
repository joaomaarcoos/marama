import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/api-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { SIGEC_DOCUMENT_BUCKET, SIGEC_MAX_DOCUMENT_SIZE } from '@/lib/sigec'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(['admin', 'gerente'])
  if (!auth.ok) return auth.response
  const parsed = z.string().uuid().safeParse(params.id)
  if (!parsed.success) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })

  const admin = getAdminClient()
  const { data: document } = await admin.from('sigec_application_documents')
    .select('id,storage_path,mime_type,size_bytes,sha256,technical_status,malware_status,removed_at')
    .eq('id', parsed.data).maybeSingle()
  if (!document || document.removed_at || document.technical_status !== 'validated' || document.malware_status !== 'clean'
    || Number(document.size_bytes) < 1 || Number(document.size_bytes) > SIGEC_MAX_DOCUMENT_SIZE || !document.sha256) {
    return NextResponse.json({ error: 'Documento indisponível para visualização.' }, { status: 409 })
  }
  const { data: successor } = await admin.from('sigec_application_documents').select('id').eq('supersedes_document_id', document.id).is('removed_at', null).maybeSingle()
  if (successor) return NextResponse.json({ error: 'Abra somente a versão atual do documento.' }, { status: 409 })

  const { data: blob, error } = await admin.storage.from(SIGEC_DOCUMENT_BUCKET).download(document.storage_path)
  if (error || !blob) return NextResponse.json({ error: 'Documento não localizado.' }, { status: 404 })
  const buffer = Buffer.from(await blob.arrayBuffer())
  if (buffer.byteLength !== Number(document.size_bytes) || createHash('sha256').update(buffer).digest('hex') !== document.sha256) {
    console.error('[SIGEC document review] integrity mismatch', { stage: 'integrity' })
    return NextResponse.json({ error: 'Falha de integridade. O documento não foi aberto.' }, { status: 409 })
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': document.mime_type,
      'Content-Disposition': 'inline; filename="documento"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
