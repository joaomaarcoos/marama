# Document Indexing

## Objetivo
Indexar documentos locais no Supabase para uso em RAG, reproduzindo o comportamento principal hoje existente em `app/api/documentos` e `lib/rag.ts`.

## Codigo Atual de Referencia
- `app/api/documentos/route.ts`
- `app/api/documentos/[id]/route.ts`
- `lib/rag.ts`
- `lib/openai.ts`
- `lib/mara-agent.ts`

## Ferramentas
- `execution/document_indexer.py`
- `execution/document_search.py`
- `execution/supabase_client.py`

## Entradas
- variaveis de ambiente:
  - `OPENAI_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- arquivo local `.pdf`, `.txt` ou `.md`
- `created_by` de um usuario valido do Supabase:
  - via `--created-by`
  - ou via `DOCUMENT_CREATED_BY`

## Saidas Esperadas
- registro em `documents`
- chunks em `document_chunks`
- `documents.chunk_count` atualizado
- busca RAG via RPC `match_document_chunks`

## Procedimento Padrao
1. Indexar arquivo local:
   `py execution/document_indexer.py --path .tmp/manual.txt --created-by <uuid>`
2. Simular sem gravar:
   `py execution/document_indexer.py --path .tmp/manual.txt --created-by <uuid> --dry-run`
3. Consultar a base indexada:
   `py execution/document_search.py --query "como emitir certificado?"`

## Regras de Processamento
- Limite padrao de tamanho: 10 MB.
- Chunking padrao:
  - `chunk_size = 2000`
  - `chunk_overlap = 200`
- Embeddings:
  - modelo `text-embedding-3-small`
  - lotes de 10
- Persistir `embedding` como JSON serializado, espelhando o fluxo atual.

## Edge Cases
- Arquivos vazios ou sem texto extraivel devem falhar com erro claro.
- PDF depende de `pypdf` na V1. Se o pacote nao estiver instalado, retornar erro explicito.
- Se a RPC `match_document_chunks` nao existir, `document_search.py` deve falhar informando o prerequisito de banco.

## Limites da V1
- A V1 cobre indexacao por arquivo local e consulta por CLI.
- Upload autenticado via HTTP continua no app Next.js.
- Reindexacao em lote ainda nao foi criada.

## Quando Atualizar Esta Diretiva
- Se o schema de `documents` ou `document_chunks` mudar
- Se o tipo de coluna `embedding` mudar
- Se a estrategia de chunking/embedding for alterada
