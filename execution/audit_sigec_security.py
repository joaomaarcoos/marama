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
    tables = sorted(set(re.findall(r"create table(?: if not exists)? public\.(sigec_[a-z0-9_]+)", normalized)))
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
        "preference_process_limit_trigger": r"sigec_enforce_application_preference_limit[\s\S]*?new\.position > allowed_preferences",
        "submitted_preferences_immutable": r"target_state <> 'draft'",
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
        "candidate_role_assigned_by_auth_trigger": r"sigec_prepare_candidate_signup",
        "candidate_profile_created_atomically": r"sigec_create_candidate_profile",
        "candidate_cpf_validated_in_database": r"sigec_cpf_is_valid",
        "candidate_signup_admin_compatibility": r"sigec_finalize_candidate_signup",
        "auth_rate_limit_rls": r"alter table public\.sigec_auth_rate_limits enable row level security",
        "auth_rate_limit_service_only": r"revoke all on function public\.sigec_consume_auth_rate_limit.*from public, anon, authenticated",
        "signup_nonce_required": r"sigec_candidate_signup_proof_required",
        "signup_nonce_single_use": r"delete from public\.sigec_candidate_signup_nonces",
        "consumed_signup_nonce_removed": r"sigec_strip_consumed_signup_proof",
        "consumed_signup_nonce_removed_atomically": r"raw_user_meta_data\s*=\s*coalesce\(raw_user_meta_data.*- 'sigec_signup_nonce'",
        "whatsapp_code_hash_only": r"sigec_whatsapp_code_hash_format check \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)",
        "whatsapp_five_attempt_limit": r"attempts \+ 1 >= 5",
        "whatsapp_owner_bound_verification": r"where id = p_verification_id and user_id = p_user_id",
        "whatsapp_phone_change_resets_verification": r"sigec_reset_whatsapp_verification_on_change",
        "whatsapp_rpc_service_only": r"revoke all on function public\.sigec_verify_whatsapp_code.*from public, anon, authenticated",
        "whatsapp_verified_code_replay_rejected": r"verified_at is not null then return 'already_used'",
        "consent_acceptance_only": r"sigec_consents_acceptance_only_check.*accepted = true",
        "consent_direct_insert_revoked": r"revoke insert, update, delete on public\.sigec_consents from public, anon, authenticated",
        "consent_bundle_server_versioned": r"sigec_record_required_consents.*'edital:' \|\| v_edital_version",
        "consent_rpc_service_only": r"revoke all on function public\.sigec_record_required_consents.*from public, anon, authenticated",
        "process_publication_readiness_gate": r"sigec_get_process_publication_readiness",
        "process_publication_requires_normative_decisions": r"normative_decisions.*count\(\*\) = 6 and bool_and\(status = 'confirmed'\)",
        "process_publication_row_lock": r"sigec_publish_process[\s\S]*?for update",
        "process_publication_actor_role_check": r"actor_role not in \('admin', 'gerente'\)",
        "process_publication_audit_event": r"'sigec\.process\.published'",
        "process_close_audit_event": r"'sigec\.process\.closed'",
        "process_publication_rpc_service_only": r"revoke all on function public\.sigec_publish_process.*from public, anon, authenticated",
        "process_close_rpc_service_only": r"revoke all on function public\.sigec_close_process.*from public, anon, authenticated",
        "process_configuration_draft_lock": r"sigec_assert_draft_process_manager[\s\S]*?process_status <> 'draft'",
        "modality_process_scope": r"sigec_upsert_process_modality[\s\S]*?modality\.process_id = p_process_id",
        "vacancy_configuration_atomic_requirement": r"sigec_upsert_vacancy_configuration[\s\S]*?on conflict \(process_id, course_id\) do update",
        "vacancy_configuration_rpc_service_only": r"revoke all on function public\.sigec_upsert_vacancy_configuration.*from public, anon, authenticated",
        "vacancy_import_duplicate_gate": r"sigec_confirm_vacancy_import[\s\S]*?SIGEC_IMPORT_DUPLICATES",
        "vacancy_import_existing_conflict_gate": r"SIGEC_IMPORT_CONFLICTS_EXISTING",
        "vacancy_import_draft_lock": r"sigec_confirm_vacancy_import[\s\S]*?sigec_assert_draft_process_manager",
        "vacancy_import_rpc_service_only": r"revoke all on function public\.sigec_confirm_vacancy_import.*from public, anon, authenticated",
        "form_configuration_draft_lock": r"sigec_upsert_form_configuration[\s\S]*?sigec_assert_draft_process_manager",
        "form_configuration_rpc_service_only": r"revoke all on function public\.sigec_upsert_form_configuration.*from public, anon, authenticated",
        "form_configuration_delete_service_only": r"revoke all on function public\.sigec_delete_form_configuration.*from public, anon, authenticated",
        "declaration_templates_service_only": r"revoke all on public\.sigec_declaration_templates from public, anon, authenticated",
        "form_audience_allowlist": r"v_audience not in \('all', 'pcd', 'ppp', 'pcd_or_ppp'\)",
        "document_mime_allowlist": r"mime_types.*?<@ array\['application/pdf', 'image/jpeg', 'image/png'\]",
        "stage_configuration_draft_lock": r"sigec_upsert_stage_configuration[\s\S]*?sigec_assert_draft_process_manager",
        "stage_configuration_rpc_service_only": r"revoke all on function public\.sigec_upsert_stage_configuration.*from public, anon, authenticated",
        "stage_transition_rpc_service_only": r"revoke all on function public\.sigec_upsert_stage_transition.*from public, anon, authenticated",
        "stage_transition_table_service_only": r"revoke all on public\.sigec_process_stage_transitions from public, anon, authenticated",
        "stage_transition_process_scope": r"foreign key \(process_id, from_stage_id\)[\s\S]*?sigec_process_stages\(process_id, id\)",
        "stage_template_placeholder_allowlist": r"nome\|processo\|status\|link\|prazo",
        "terminal_stage_has_no_outgoing_transition": r"SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION",
        "stage_publication_reachability_gate": r"reachable_stages[\s\S]*?reachability_ready",
        "scoring_version_tables_service_only": r"revoke all on public\.sigec_scoring_rule_versions from public, anon, authenticated",
        "scoring_version_draft_lock": r"sigec_upsert_scoring_version[\s\S]*?sigec_assert_draft_process_manager",
        "scoring_version_immutability": r"SIGEC_SCORING_VERSION_IMMUTABLE",
        "scoring_official_requires_normative_decisions": r"p_target_status = 'official'[\s\S]*?sigec_official_rules_are_confirmed",
        "scoring_total_must_match": r"SIGEC_SCORING_TOTAL_MISMATCH",
        "scoring_confirmation_trigger_defense": r"guard_scoring_rule_immutability[\s\S]*?sigec_assert_draft_process_manager\(new\.process_id, new\.confirmed_by\)",
        "scoring_publication_requires_official": r"sigec_latest_scoring_is_official[\s\S]*?version\.status = 'official' and not version\.is_provisional",
        "scoring_rpcs_service_only": r"revoke all on function public\.sigec_confirm_scoring_version.*from public, anon, authenticated",
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
