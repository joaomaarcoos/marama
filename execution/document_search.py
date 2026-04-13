import argparse
import json

from document_indexer import create_embeddings
from supabase_client import SupabaseRestClient


def main() -> int:
    parser = argparse.ArgumentParser(description="Query indexed document chunks via Supabase RPC.")
    parser.add_argument("--query", required=True, help="Natural language query.")
    parser.add_argument("--threshold", type=float, default=0.7, help="Similarity threshold.")
    parser.add_argument("--count", type=int, default=3, help="Maximum number of chunks.")
    args = parser.parse_args()

    embedding = create_embeddings([args.query])[0]
    supabase = SupabaseRestClient()
    results = supabase.rpc(
        "match_document_chunks",
        {
            "query_embedding": json.dumps(embedding),
            "match_threshold": args.threshold,
            "match_count": args.count,
        },
    )

    print(json.dumps(results or [], ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
