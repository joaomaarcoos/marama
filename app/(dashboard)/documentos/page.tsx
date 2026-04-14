import { adminClient } from '@/lib/supabase/admin'
import { BookOpen } from 'lucide-react'
import DocumentUploader from '@/components/document-uploader'

export const revalidate = 0

export default async function DocumentosPage() {
  const { data: documents } = await adminClient
    .from('documents')
    .select('id, name, size_bytes, mime_type, chunk_count, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            background: 'hsl(262 80% 65% / 0.12)',
            border: '1px solid hsl(262 80% 65% / 0.25)',
          }}
        >
          <BookOpen className="h-5 w-5" style={{ color: 'hsl(262 80% 65%)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(213 31% 91%)' }}>
            Base de Conhecimento
          </h1>
          <p className="text-sm" style={{ color: 'hsl(215 18% 42%)' }}>
            Documentos indexados via busca semântica (RAG) para a MARA consultar
          </p>
        </div>
      </div>

      <DocumentUploader initialDocuments={documents ?? []} />
    </div>
  )
}
