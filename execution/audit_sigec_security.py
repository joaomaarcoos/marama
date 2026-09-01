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

    # The application draft RPC had one historical public definer definition
    # immediately replaced by an invoker wrapper. Ignore only those versioned
    # blocks here and require the hardened final structure below.
    forbidden_sql = re.sub(
        r"create(?: or replace)? function public\.sigec_create_application_draft\b[\s\S]*?\$\$;",
        "",
        sql,
        flags=re.IGNORECASE,
    )
    forbidden_patterns = {
        "user_metadata_authorization": r"user_metadata[^\n]*(role|permission|admin)",
        "broad_public_revoke": r"revoke all on all tables in schema public",
        "public_candidate_bucket": r"'sigec-candidate-documents'\s*,\s*'sigec-candidate-documents'\s*,\s*true",
        "public_security_definer": r"create(?: or replace)? function public\.[\s\S]{0,300}?security definer",
        "candidate_storage_update": r"create policy sigec_storage_candidate_update",
        "candidate_storage_delete": r"create policy sigec_storage_candidate_delete",
    }
    for name, pattern in forbidden_patterns.items():
        if re.search(pattern, forbidden_sql, flags=re.IGNORECASE):
            findings.append({"severity": "critical", "check": name, "detail": "Forbidden pattern found."})

    staff_helper = re.search(r"function private\.sigec_is_staff\(\)[\s\S]*?\$\$;", normalized)
    if not staff_helper or "('admin', 'gerente')" not in staff_helper.group(0) or "atendente" in staff_helper.group(0):
        findings.append({
            "severity": "critical",
            "check": "sigec_staff_excludes_attendant",
            "detail": "The central SIGEC staff helper must authorize only admin and gerente.",
        })

    required_patterns = {
        "private_bucket": r"'sigec-candidate-documents'\s*,\s*'sigec-candidate-documents'\s*,\s*false",
        "candidate_role_from_app_metadata": r"auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'",
        "preference_limit": r"position\s+smallint\s+not null\s+check\s*\(position between 1 and 5\)",
        "preference_process_limit_trigger": r"sigec_enforce_application_preference_limit[\s\S]*?new\.position > allowed_preferences",
        "submitted_preferences_immutable": r"target_state <> 'draft'",
        "application_owner_policy": r"sigec_applications_owner_(read|insert)",
        "application_draft_public_wrapper_invoker": r"function public\.sigec_create_application_draft[\s\S]*?security invoker",
        "application_draft_private_implementation": r"function private\.sigec_create_application_draft_impl[\s\S]*?security definer",
        "application_draft_role_guard": r"actor_role <> 'candidato'",
        "application_draft_profile_gate": r"SIGEC_APPLICATION_PROFILE_INCOMPLETE",
        "application_draft_process_gate": r"SIGEC_APPLICATION_PROCESS_UNAVAILABLE",
        "application_draft_direct_insert_revoked": r"revoke insert on public\.sigec_applications from authenticated",
        "application_draft_concurrency_lock": r"pg_advisory_xact_lock",
        "preferences_public_wrapper_invoker": r"function public\.sigec_replace_application_preferences[\s\S]*?security invoker",
        "preferences_private_implementation": r"function private\.sigec_replace_application_preferences_impl[\s\S]*?security definer",
        "preferences_owner_guard": r"target\.candidate_id <> actor_id",
        "preferences_draft_lock": r"target\.application_state <> 'draft'",
        "preferences_duplicate_guard": r"SIGEC_PREFERENCES_DUPLICATE",
        "preferences_direct_write_revoked": r"revoke insert, update, delete on public\.sigec_application_preferences from authenticated",
        "answers_public_wrapper_invoker": r"function public\.sigec_replace_application_answers[\s\S]*?security invoker",
        "answers_private_implementation": r"function private\.sigec_replace_application_answers_impl[\s\S]*?security definer",
        "answers_owner_guard": r"SIGEC_ANSWERS_APPLICATION_FORBIDDEN",
        "answers_hidden_question_guard": r"SIGEC_ANSWERS_HIDDEN_QUESTION",
        "answers_direct_write_revoked": r"revoke insert, update, delete on public\.sigec_application_answers from authenticated",
        "answers_audit_omits_values": r"'application_answers_updated'[\s\S]*?jsonb_build_object\('answer_count', answer_count\)",
        "conditional_document_database_guard": r"SIGEC_DOCUMENT_REQUIREMENT_HIDDEN",
        "submission_readiness_invoker": r"function public\.sigec_get_application_submission_readiness[\s\S]*?security invoker",
        "submission_readiness_owner_guard": r"SIGEC_READINESS_APPLICATION_FORBIDDEN",
        "submission_readiness_clean_documents": r"document\.technical_status = 'validated'[\s\S]*?document\.malware_status = 'clean'",
        "submission_readiness_conditional_requirements": r"sigec_application_matches_audience[\s\S]*?condition_config ->> 'audience'",
        "submission_database_assertion": r"function private\.sigec_assert_application_ready_for_submission",
        "submission_snapshot_table": r"create table public\.sigec_application_submissions",
        "submission_snapshot_immutable": r"SIGEC_SUBMISSION_SNAPSHOT_IMMUTABLE",
        "submission_private_transaction": r"function private\.sigec_submit_application_impl[\s\S]*?security definer",
        "submission_public_wrapper_invoker": r"function public\.sigec_submit_application[\s\S]*?security invoker",
        "submission_idempotent_return": r"target\.application_state = 'submitted'[\s\S]*?sigec_application_submissions",
        "submission_revalidates_gate": r"perform private\.sigec_assert_application_ready_for_submission",
        "submission_snapshot_hash": r"snapshot_sha256[\s\S]*?digest\(convert_to\(v_snapshot::text",
        "submission_direct_mutation_revoked": r"revoke update, delete on public\.sigec_application_submissions from authenticated",
        "correction_private_transaction": r"function private\.sigec_start_application_correction_impl[\s\S]*?security definer",
        "correction_public_wrapper_invoker": r"function public\.sigec_start_application_correction[\s\S]*?security invoker",
        "correction_owner_guard": r"SIGEC_CORRECTION_APPLICATION_FORBIDDEN",
        "correction_window_guard": r"SIGEC_CORRECTION_WINDOW_CLOSED",
        "correction_keeps_submission_lineage": r"supersedes_submission_id uuid[\s\S]*?references public\.sigec_application_submissions",
        "correction_latest_version_is_current": r"version = max\(submission\.version\) over",
        "correction_resubmission_increments_version": r"v_version := coalesce\(v_version, 0\) \+ 1",
        "submitted_document_requires_correction": r"target_application\.application_state <> 'draft'[\s\S]*?SIGEC_DOCUMENT_APPLICATION_LOCKED",
        "storage_owner_prefix": r"storage\.foldername\(name\)\)\[1\].*auth\.uid",
        "document_application_path": r"storage_path like \(select auth\.uid\(\)\)::text \|\| '/' \|\| application_id::text \|\| '/%'",
        "diligence_deadline": r"request\.due_at is null or request\.due_at > now\(\)",
        "diligence_due_is_required": r"alter table public\.sigec_information_requests[\s\S]*?alter column due_at set not null",
        "diligence_fields_are_bounded": r"sigec_information_request_fields_count_check[\s\S]*?jsonb_array_length\(requested_fields\) between 1 and 50",
        "diligence_fields_are_typed_and_scoped": r"sigec_validate_information_request[\s\S]*?field ->> 'kind' not in \('question', 'document'\)[\s\S]*?SIGEC_DILIGENCE_QUESTION_INVALID[\s\S]*?SIGEC_DILIGENCE_DOCUMENT_INVALID",
        "diligence_fields_reject_duplicates": r"SIGEC_DILIGENCE_FIELDS_DUPLICATED",
        "diligence_trigger_definer_has_empty_path": r"alter function private\.sigec_validate_information_request\(\) security definer[\s\S]*?set search_path = ''",
        "diligence_trigger_not_callable": r"revoke all on function private\.sigec_validate_information_request\(\) from public, anon, authenticated",
        "diligence_answer_public_wrapper_invoker": r"function public\.sigec_submit_information_request_answers[\s\S]*?security invoker",
        "diligence_answer_private_implementation": r"function private\.sigec_submit_information_request_answers_impl[\s\S]*?security definer",
        "diligence_answer_exact_scope": r"SIGEC_DILIGENCE_FIELD_NOT_REQUESTED",
        "diligence_requires_existing_submission": r"SIGEC_DILIGENCE_SUBMISSION_REQUIRED",
        "diligence_document_is_request_bound": r"information_request_id uuid[\s\S]*?references public\.sigec_information_requests",
        "diligence_document_completion_requires_clean_scan": r"document\.information_request_id = p_request_id[\s\S]*?document\.technical_status = 'validated'[\s\S]*?document\.malware_status = 'clean'",
        "diligence_finalize_is_service_only": r"revoke all on function public\.sigec_finalize_information_request_if_complete\(uuid,uuid\) from public, anon, authenticated",
        "document_normal_window_is_strict": r"normal_window := target_application\.application_state = 'draft'[\s\S]*?applications_close_at > now\(\)",
        "admin_application_list_security_invoker": r"function public\.sigec_list_applications_for_review[\s\S]*?security invoker",
        "admin_application_list_staff_guard": r"raw_app_meta_data ->> 'role' in \('admin', 'gerente'\)[\s\S]*?SIGEC_APPLICATION_LIST_STAFF_REQUIRED",
        "admin_application_list_page_bounds": r"p_page not between 1 and 100000[\s\S]*?p_page_size not between 1 and 100",
        "admin_application_list_complete_filters": r"p_municipality[\s\S]*?p_course_id[\s\S]*?p_modality_id[\s\S]*?p_competition[\s\S]*?p_application_state[\s\S]*?p_stage_id[\s\S]*?p_pending",
        "admin_application_list_service_only": r"revoke all on function public\.sigec_list_applications_for_review[\s\S]*?from public, anon, authenticated",
        "admin_application_list_no_sensitive_projection": r"returns table\([\s\S]*?candidate_name text[\s\S]*?preferences jsonb[\s\S]*?total_count bigint",
        "admin_application_detail_security_invoker": r"function public\.sigec_get_application_review_detail[\s\S]*?security invoker",
        "admin_application_detail_staff_guard": r"raw_app_meta_data ->> 'role' in \('admin', 'gerente'\)[\s\S]*?SIGEC_APPLICATION_DETAIL_STAFF_REQUIRED",
        "admin_application_detail_service_only": r"revoke all on function public\.sigec_get_application_review_detail\(uuid, uuid\)[\s\S]*?from public, anon, authenticated",
        "admin_application_detail_safe_read_model": r"Omit[s]? CPF, contact data, addresses, storage paths, original filenames, consent fingerprints and raw audit metadata",
        "document_reviews_have_rls": r"alter table public\.sigec_document_reviews enable row level security",
        "document_reviews_are_append_only": r"sigec_reject_document_review_mutation[\s\S]*?SIGEC_DOCUMENT_REVIEW_IMMUTABLE[\s\S]*?trigger sigec_document_reviews_immutable",
        "document_review_security_invoker": r"function public\.sigec_review_application_document[\s\S]*?security invoker",
        "document_review_staff_guard": r"SIGEC_DOCUMENT_REVIEW_STAFF_REQUIRED",
        "document_review_current_clean_gate": r"SIGEC_DOCUMENT_REVIEW_CURRENT_VERSION_REQUIRED[\s\S]*?SIGEC_DOCUMENT_REVIEW_CLEAN_FILE_REQUIRED",
        "document_review_submitted_gate": r"application\.application_state = 'submitted'[\s\S]*?SIGEC_DOCUMENT_REVIEW_SUBMITTED_APPLICATION_REQUIRED",
        "document_review_public_reason_required": r"SIGEC_DOCUMENT_REVIEW_PUBLIC_REASON_REQUIRED",
        "document_review_notes_are_separate": r"public_reason text[\s\S]*?internal_note text",
        "document_review_service_only": r"revoke all on function public\.sigec_review_application_document\(uuid,uuid,text,text,text\)[\s\S]*?from public, anon, authenticated",
        "diligence_management_one_active": r"unique index sigec_information_requests_one_active_idx[\s\S]*?where status in \('open', 'answered'\)",
        "diligence_management_create_invoker": r"function public\.sigec_create_information_request[\s\S]*?security invoker",
        "diligence_management_close_invoker": r"function public\.sigec_close_information_request[\s\S]*?security invoker",
        "diligence_management_staff_guard": r"SIGEC_DILIGENCE_MANAGEMENT_STAFF_REQUIRED",
        "diligence_management_requires_snapshot": r"application_state <> 'submitted'[\s\S]*?sigec_application_submissions",
        "diligence_management_deadline_bounded": r"p_due_at > clock_timestamp\(\) \+ interval '365 days'",
        "diligence_management_accept_requires_answer": r"p_action = 'accepted' and target\.status <> 'answered'[\s\S]*?SIGEC_DILIGENCE_MANAGEMENT_ANSWER_REQUIRED",
        "diligence_management_direct_writes_revoked": r"revoke insert, update, delete on public\.sigec_information_requests[\s\S]*?from public, anon, authenticated",
        "diligence_management_create_service_only": r"revoke all on function public\.sigec_create_information_request\(uuid,uuid,text,jsonb,timestamptz\)[\s\S]*?from public, anon, authenticated",
        "diligence_management_close_service_only": r"revoke all on function public\.sigec_close_information_request\(uuid,uuid,text,text\)[\s\S]*?from public, anon, authenticated",
        "diligence_management_audit_omits_messages": r"'requestedCount'[\s\S]*?'hasResolutionMessage'",
        "advancement_gate_current_valid_documents": r"sigec_get_application_advancement_readiness[\s\S]*?document\.review_status = 'valid'[\s\S]*?successor\.supersedes_document_id",
        "advancement_gate_active_diligences": r"request\.status in \('open', 'answered'\)",
        "advancement_gate_staff_only": r"SIGEC_ADVANCEMENT_STAFF_REQUIRED",
        "advancement_gate_configured_transition": r"sigec_process_stage_transitions[\s\S]*?SIGEC_ADVANCEMENT_TRANSITION_NOT_ALLOWED",
        "advancement_gate_atomic_block": r"if not readiness\.ready then[\s\S]*?SIGEC_APPLICATION_ADVANCEMENT_BLOCKED",
        "advancement_gate_records_reason": r"sigec_application_status_history[\s\S]*?normalized_reason",
        "advancement_gate_audits_version_and_fields": r"'submissionVersion'[\s\S]*?'changedFields'",
        "advancement_gate_read_service_only": r"revoke all on function public\.sigec_get_application_advancement_readiness\(uuid,uuid\)[\s\S]*?from public, anon, authenticated",
        "advancement_gate_write_service_only": r"revoke all on function public\.sigec_advance_application_stage\(uuid,uuid,uuid,text\)[\s\S]*?from public, anon, authenticated",
        "disqualification_catalog_tables_rls": r"alter table public\.sigec_disqualification_catalog_versions enable row level security[\s\S]*?alter table public\.sigec_disqualification_internal_notes enable row level security",
        "disqualification_catalog_pending_by_default": r"normative_status text not null default 'pending_confirmation'",
        "disqualification_catalog_exact_nine": r"SIGEC_DISQUALIFICATION_NINE_REASONS_REQUIRED",
        "disqualification_requires_confirmed_reason": r"catalog\.status = 'confirmed' and catalog\.normative_status = 'confirmed'",
        "disqualification_requires_configured_transition": r"stage\.code = 'desclassificado'[\s\S]*?SIGEC_DISQUALIFICATION_TRANSITION_REQUIRED",
        "disqualification_public_internal_separation": r"public_message text not null[\s\S]*?create table public\.sigec_disqualification_internal_notes",
        "disqualification_audit_omits_message_bodies": r"'hasPublicMessage'[\s\S]*?'hasInternalNote'[\s\S]*?'changedFields'",
        "disqualification_rpcs_service_only": r"revoke all on function public\.sigec_disqualify_application\(uuid,uuid,uuid,text,text\) from public, anon, authenticated",
        "candidate_disqualification_owner_guard": r"application\.candidate_id = auth\.uid\(\)",
        "candidate_disqualification_private_definer": r"function private\.sigec_get_candidate_disqualification_impl[\s\S]*?security definer[\s\S]*?set search_path = ''",
        "candidate_disqualification_public_invoker": r"function public\.sigec_get_candidate_disqualification[\s\S]*?security invoker",
        "candidate_disqualification_anon_revoked": r"revoke all on function public\.sigec_get_candidate_disqualification\(uuid\) from public, anon",
        "ranking_writes_require_manager_helper": r"sigec_snapshots_staff_insert[\s\S]*?private\.sigec_is_staff[\s\S]*?sigec_snapshot_publications_staff_insert[\s\S]*?private\.sigec_is_staff",
        "convocation_batches_have_explicit_deny": r"policy sigec_convocation_batches_no_direct_access[\s\S]*?using \(false\) with check \(false\)",
        "scores_are_read_only_to_authenticated": r"grant select on public\.sigec_applications[\s\S]*?public\.sigec_application_scores[\s\S]*?to authenticated",
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
        "candidate_profile_completion_is_derived": r"sigec_prepare_candidate_profile_update[\s\S]*?new\.profile_completed_at := case",
        "candidate_profile_immutable_identity": r"SIGEC_CANDIDATE_IDENTITY_IMMUTABLE",
        "candidate_profile_audit_omits_values": r"sigec_audit_candidate_profile_update[\s\S]*?'changed_fields'",
        "candidate_profile_audit_actor_deletion_safe": r"sigec_audit_events_actor_id_fkey[\s\S]*?on delete set null",
        "candidate_profile_private_triggers_not_callable": r"revoke all on function private\.sigec_prepare_candidate_profile_update\(\) from public, anon, authenticated",
        "candidate_education_identity_immutable": r"SIGEC_EDUCATION_IDENTITY_IMMUTABLE",
        "candidate_education_audit_omits_values": r"sigec_audit_candidate_education_change[\s\S]*?'changed_fields'",
        "candidate_education_private_triggers_not_callable": r"revoke all on function private\.sigec_prepare_candidate_education_write\(\) from public, anon, authenticated",
        "candidate_education_pedagogy_requires_workload": r"sigec_candidate_education_pedagogy_workload_check",
        "candidate_experience_identity_immutable": r"SIGEC_EXPERIENCE_IDENTITY_IMMUTABLE",
        "candidate_experience_overlap_is_merged": r"range_agg\(daterange\(starts_on, coalesce\(ends_on, current_date\) \+ 1",
        "candidate_experience_summary_owner_guard": r"SIGEC_EXPERIENCE_SUMMARY_FORBIDDEN",
        "candidate_experience_audit_omits_values": r"sigec_audit_candidate_experience_change[\s\S]*?'changed_fields'",
        "candidate_experience_private_triggers_not_callable": r"revoke all on function private\.sigec_prepare_candidate_experience_write\(\) from public, anon, authenticated",
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
        "document_hash_is_required": r"alter column sha256 set not null",
        "document_version_chain": r"supersedes_document_id uuid references public\.sigec_application_documents",
        "document_rpc_security_invoker": r"sigec_register_candidate_document[\s\S]*?security invoker",
        "document_rpc_service_only": r"revoke all on function public\.sigec_register_candidate_document.*from public, anon, authenticated",
        "document_metadata_direct_insert_revoked": r"revoke insert on public\.sigec_application_documents from authenticated",
        "document_direct_storage_insert_removed": r"drop policy if exists sigec_storage_candidate_insert on storage\.objects",
        "staff_document_read_requires_clean_scan": r"sigec_storage_candidate_read[\s\S]*?malware_status = 'clean'",
        "validated_document_requires_sanitization": r"technical_status = 'validated' and sanitized_at is not null",
        "malware_scan_rpc_security_invoker": r"sigec_record_document_malware_scan[\s\S]*?security invoker",
        "malware_scan_rpc_service_only": r"revoke all on function public\.sigec_record_document_malware_scan.*from public, anon, authenticated",
        "malware_scan_hash_binding": r"target\.sha256 <> p_sha256",
        "malware_scan_result_constraint": r"sigec_document_malware_result_check",
        "all_storage_reads_require_clean_scan": r"sigec_storage_candidate_read[\s\S]*?document\.malware_status = 'clean'[\s\S]*?application\.candidate_id",
        "postgraduate_reviews_service_only": r"revoke all on public\.sigec_postgraduate_evidence_reviews from public, anon, authenticated",
        "postgraduate_reviews_append_only": r"sigec_postgraduate_reviews_immutable[\s\S]*?before update or delete",
        "postgraduate_review_staff_gate": r"sigec_review_postgraduate_evidence[\s\S]*?in \('admin', 'gerente'\)",
        "postgraduate_review_requires_submission": r"application\.application_state = 'submitted'",
        "postgraduate_review_requires_completed_title": r"not target\.is_completed or target\.level not in \('especializacao', 'mestrado', 'doutorado'\)",
        "postgraduate_review_requires_approved_document": r"technical_status = 'validated'[\s\S]*?malware_status = 'clean'[\s\S]*?review_status = 'valid'",
        "postgraduate_score_exact_scale": r"target\.level = 'doutorado' then 30[\s\S]*?target\.level = 'mestrado' then 25[\s\S]*?else 20",
        "postgraduate_score_latest_review_only": r"distinct on \(review\.education_id\)[\s\S]*?order by review\.education_id, review\.version desc",
        "postgraduate_score_uses_maximum_only": r"select \* from eligible order by points_snapshot desc, education_id limit 1",
        "postgraduate_audit_omits_reason_body": r"'haspublicreason', normalized_reason is not null",
        "postgraduate_rpcs_service_only": r"revoke all on function public\.sigec_review_postgraduate_evidence.*?from public, anon, authenticated[\s\S]*?revoke all on function public\.sigec_get_postgraduate_score.*?from public, anon, authenticated",
        "experience_reviews_service_only": r"revoke all on public\.sigec_experience_evidence_reviews from public, anon, authenticated",
        "experience_reviews_append_only": r"sigec_experience_reviews_immutable[\s\S]*?before update or delete",
        "experience_review_staff_gate": r"sigec_review_experience_evidence[\s\S]*?in \('admin', 'gerente'\)",
        "experience_review_requires_teaching": r"not target\.is_teaching",
        "experience_review_requires_approved_document": r"sigec_review_experience_evidence[\s\S]*?technical_status = 'validated'[\s\S]*?malware_status = 'clean'[\s\S]*?review_status = 'valid'",
        "experience_score_submission_cutoff": r"least\(coalesce\(ends_on, cutoff_date\), cutoff_date\)",
        "experience_score_merges_overlaps": r"range_agg\(daterange\(starts_on",
        "experience_score_exact_bands": r"months <= 12 then 5[\s\S]*?months <= 24 then 10[\s\S]*?months <= 36 then 20[\s\S]*?months <= 48 then 30[\s\S]*?else 40",
        "experience_audit_omits_reason_body": r"'haspublicreason', normalized_reason is not null",
        "experience_rpcs_service_only": r"revoke all on function public\.sigec_review_experience_evidence.*?from public, anon, authenticated[\s\S]*?revoke all on function public\.sigec_get_experience_score.*?from public, anon, authenticated",
    }
    for name, pattern in required_patterns.items():
        if not re.search(pattern, normalized, flags=re.IGNORECASE):
            findings.append({"severity": "high", "check": name, "detail": "Required control not found."})

    profile_grants = re.findall(
        r"grant\s+(?:insert|update)\s*\(([^;]*?)\)\s*on public\.sigec_candidate_profiles",
        normalized,
        flags=re.IGNORECASE,
    )
    if any("whatsapp_verified_at" in grant or "profile_completed_at" in grant for grant in profile_grants):
        findings.append({
            "severity": "critical",
            "check": "candidate_cannot_self_verify",
            "detail": "Candidate-writable grants include server-controlled verification fields.",
        })

    education_update_grants = re.findall(
        r"grant\s+update\s*\(([^;]*?)\)\s*on public\.sigec_candidate_education",
        normalized,
        flags=re.IGNORECASE,
    )
    education_update_columns = {
        column.strip()
        for grant in education_update_grants
        for column in grant.split(",")
    }
    if education_update_columns & {"id", "candidate_id", "created_at"}:
        findings.append({
            "severity": "critical",
            "check": "candidate_education_identity_grants",
            "detail": "Candidate-writable grants include immutable education identity fields.",
        })

    experience_update_grants = re.findall(
        r"grant\s+update\s*\(([^;]*?)\)\s*on public\.sigec_candidate_experience",
        normalized,
        flags=re.IGNORECASE,
    )
    experience_update_columns = {
        column.strip()
        for grant in experience_update_grants
        for column in grant.split(",")
    }
    if experience_update_columns & {"id", "candidate_id", "created_at"}:
        findings.append({
            "severity": "critical",
            "check": "candidate_experience_identity_grants",
            "detail": "Candidate-writable grants include immutable experience identity fields.",
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
