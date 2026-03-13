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
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Base de Conhecimento</h1>
        </div>
        <p className="text-sm text-gray-500">
          Adicione documentos (PDF, TXT, MD) que a MARA usará como referência ao responder os alunos.
          Cada arquivo é dividido em trechos e indexado via busca semântica.
        </p>
      </div>

      <DocumentUploader initialDocuments={documents ?? []} />
    </div>
  )
}
