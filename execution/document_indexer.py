import argparse
import json
import mimetypes
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from supabase_client import SupabaseRestClient


CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200
EMBED_BATCH_SIZE = 10
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def guess_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(str(path))
    return mime_type or "text/plain"


def extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF support requires 'pypdf' in this v1 script.") from exc

    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def read_document_text(path: Path) -> str:
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise RuntimeError("Unsupported file type. Use PDF, TXT or MD.")

    if path.stat().st_size > MAX_FILE_SIZE_BYTES:
        raise RuntimeError("File too large. Maximum supported size is 10 MB.")

    if path.suffix.lower() == ".pdf":
        return extract_pdf_text(path)

    return path.read_text(encoding="utf-8")


def chunk_text(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()
        if len(chunk) > 50:
            chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def create_embeddings(texts: list[str]) -> list[list[float]]:
    payload = {
        "model": "text-embedding-3-small",
        "input": texts,
        "encoding_format": "float",
    }
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {get_required_env('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI embeddings error {exc.code}: {raw}") from exc

    return [item["embedding"] for item in data["data"]]


def embed_chunks(document_id: str, chunks: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[start:start + EMBED_BATCH_SIZE]
        embeddings = create_embeddings(batch)
        for offset, chunk in enumerate(batch):
            rows.append(
                {
                    "document_id": document_id,
                    "content": chunk,
                    "embedding": json.dumps(embeddings[offset]),
                    "chunk_index": start + offset,
                }
            )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Index a local document into Supabase for RAG.")
    parser.add_argument("--path", required=True, help="Local path to a PDF, TXT or MD file.")
    parser.add_argument("--created-by", help="Supabase auth user UUID.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and chunk without persisting.")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    created_by = args.created_by or os.environ.get("DOCUMENT_CREATED_BY")
    if not created_by and not args.dry_run:
        raise SystemExit("--created-by or DOCUMENT_CREATED_BY is required.")

    text = read_document_text(path)
    if not text.strip():
        raise SystemExit("No text could be extracted from the document.")

    chunks = chunk_text(text)
    if not chunks:
        raise SystemExit("The extracted text did not generate valid chunks.")

    summary = {
        "path": str(path),
        "name": path.name,
        "mime_type": guess_mime_type(path),
        "size_bytes": path.stat().st_size,
        "chunk_count": len(chunks),
        "dry_run": args.dry_run,
    }

    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=True, indent=2))
        return 0

    supabase = SupabaseRestClient()
    document_rows = supabase.insert(
        "documents",
        {
            "name": path.name,
            "size_bytes": path.stat().st_size,
            "mime_type": guess_mime_type(path),
            "created_by": created_by,
        },
    )

    if not document_rows:
        raise SystemExit("Supabase did not return the inserted document row.")

    document_id = document_rows[0]["id"]
    embedded_rows = embed_chunks(document_id, chunks)
    supabase.insert("document_chunks", embedded_rows)
    supabase.update("documents", {"chunk_count": len(embedded_rows)}, filters={"id": f"eq.{document_id}"})

    summary["document_id"] = document_id
    summary["chunk_count"] = len(embedded_rows)
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
