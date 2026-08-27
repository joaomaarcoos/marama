"""Static security gate for the complete SIGEC migration set.

This check is intentionally conservative. It catches regressions that are easy
to miss in review before the migration can be validated against a real Supabase
development project and its Database Advisors.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def audit(sql: str) -> dict[str, object]:
    normalized = re.sub(r"\s+", " ", sql.lower())
    tables = sorted(set(re.findall(r"create table public\.(sigec_[a-z0-9_]+)", normalized)))
    rls_tables = sorted(
        set(re.findall(r"alter table public\.(sigec_[a-z0-9_]+) enable row level security", normalized))
    )

    findings: list[dict[str, str]] = []

    missing_rls = sorted(set(tables) - set(rls_tables))
    if missing_rls:
        findings.append({
            "severity": "critical",
            "check": "rls_on_all_sigec_tables",
            "detail": f"Tables without RLS: {', '.join(missing_rls)}",
        })

    forbidden_patterns = {
        "user_metadata_authorization": r"user_metadata[^\n]*(role|permission|admin)",
        "broad_public_revoke": r"revoke all on all tables in schema public",
        "public_candidate_bucket": r"'sigec-candidate-documents'\s*,\s*'sigec-candidate-documents'\s*,\s*true",
        "public_security_definer": r"create(?: or replace)? function public\.[\s\S]{0,300}?security definer",
        "candidate_storage_update": r"create policy sigec_storage_candidate_update",
        "candidate_storage_delete": r"create policy sigec_storage_candidate_delete",
    }
    for name, pattern in forbidden_patterns.items():
        if re.search(pattern, sql, flags=re.IGNORECASE):
            findings.append({"severity": "critical", "check": name, "detail": "Forbidden pattern found."})

    required_patterns = {
        "private_bucket": r"'sigec-candidate-documents'\s*,\s*'sigec-candidate-documents'\s*,\s*false",
        "candidate_role_from_app_metadata": r"auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'",
        "preference_limit": r"position\s+smallint\s+not null\s+check\s*\(position between 1 and 5\)",
        "application_owner_policy": r"sigec_applications_owner_(read|insert)",
        "storage_owner_prefix": r"storage\.foldername\(name\)\)\[1\].*auth\.uid",
        "document_application_path": r"storage_path like \(select auth\.uid\(\)\)::text \|\| '/' \|\| application_id::text \|\| '/%'",
        "diligence_deadline": r"request\.due_at is null or request\.due_at > now\(\)",
        "immutable_audit_table": r"create table public\.sigec_audit_events",
        "notification_idempotency": r"idempotency_key\s+text\s+not null\s+unique",
        "ranking_decisions_append_only": r"sigec_decisions_reject_update",
        "official_ranking_blocked_by_decisions": r"sigec_normative_decisions_pending",
        "ranking_snapshot_freeze": r"sigec_guard_snapshot_mutation",
        "ranking_tie_break_explanation": r"sigec_incomplete_tie_break_explanation",
        "ranking_two_person_approval": r"sigec_two_person_approval_required",
        "ranking_current_evidence": r"sigec_current_ranking_evidence_required",
    }
    for name, pattern in required_patterns.items():
        if not re.search(pattern, normalized, flags=re.IGNORECASE):
            findings.append({"severity": "high", "check": name, "detail": "Required control not found."})

    profile_grants = re.findall(
        r"grant\s+(?:insert|update)\s*\((.*?)\)\s*on public\.sigec_candidate_profiles",
        normalized,
        flags=re.IGNORECASE,
    )
    if any("whatsapp_verified_at" in grant or "profile_completed_at" in grant for grant in profile_grants):
        findings.append({
            "severity": "critical",
            "check": "candidate_cannot_self_verify",
            "detail": "Candidate-writable grants include server-controlled verification fields.",
        })

    return {
        "ok": not findings,
        "tables": len(tables),
        "rls_tables": len(rls_tables),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit the SIGEC SQL migrations for security regressions.")
    parser.add_argument("migration", type=Path, nargs="+")
    args = parser.parse_args()

    missing = [migration for migration in args.migration if not migration.is_file()]
    if missing:
        raise SystemExit(f"Migration not found: {missing[0]}")

    sql = "\n\n".join(migration.read_text(encoding="utf-8") for migration in args.migration)
    result = audit(sql)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
