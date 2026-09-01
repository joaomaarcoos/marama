with expected(table_name) as (
  values
    ('sigec_candidate_profiles'), ('sigec_candidate_education'),
    ('sigec_auth_rate_limits'), ('sigec_candidate_signup_nonces'),
    ('sigec_candidate_experience'), ('sigec_processes'), ('sigec_modalities'),
    ('sigec_courses'), ('sigec_process_course_requirements'), ('sigec_vacancies'),
    ('sigec_process_questions'), ('sigec_document_requirements'),
    ('sigec_declaration_templates'),
    ('sigec_process_stage_transitions'),
    ('sigec_process_stages'), ('sigec_scoring_criteria'), ('sigec_applications'),
    ('sigec_application_preferences'), ('sigec_application_answers'),
    ('sigec_application_submissions'),
    ('sigec_application_documents'), ('sigec_document_reviews'), ('sigec_application_status_history'),
    ('sigec_internal_notes'), ('sigec_information_requests'), ('sigec_appeals'),
    ('sigec_application_scores'), ('sigec_convocation_batches'),
    ('sigec_convocations'), ('sigec_consents'), ('sigec_notification_outbox'),
    ('sigec_whatsapp_verifications'), ('sigec_audit_events'),
    ('sigec_process_decisions'), ('sigec_quota_rule_versions'),
    ('sigec_scoring_rule_versions'), ('sigec_scoring_rule_items'),
    ('sigec_tie_break_rules'),
    ('sigec_ranking_snapshots'), ('sigec_ranking_snapshot_entries'),
    ('sigec_ranking_snapshot_approvals'), ('sigec_ranking_snapshot_publications'),
    ('sigec_disqualification_catalog_versions'), ('sigec_disqualification_reason_items'),
    ('sigec_application_disqualifications'), ('sigec_disqualification_internal_notes'),
    ('sigec_postgraduate_evidence_reviews'), ('sigec_experience_evidence_reviews')
), actual as (
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'sigec\_%' escape '\'
), missing_fk_indexes as (
  select distinct c.conrelid::regclass::text as table_name, a.attname as column_name
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and n.nspname = 'public'
    and c.conrelid::regclass::text like 'sigec\_%' escape '\'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
    )
)
select jsonb_build_object(
  'expected_tables', (select count(*) from expected),
  'actual_tables', (select count(*) from actual),
  'missing_tables', coalesce((
    select json_agg(e.table_name order by e.table_name)
    from expected e left join actual a using (table_name)
    where a.table_name is null
  ), '[]'::json),
  'rls_enabled_tables', (select count(*) from actual where rls_enabled),
  'rls_missing', coalesce((
    select json_agg(table_name order by table_name) from actual where not rls_enabled
  ), '[]'::json),
  'public_policy_count', (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename like 'sigec\_%' escape '\'
  ),
  'private_bucket_ok', exists (
    select 1 from storage.buckets
    where id = 'sigec-candidate-documents'
      and public is false
      and file_size_limit = 10485760
  ),
  'storage_policy_count', (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'sigec\_%' escape '\'
  ),
  'candidate_storage_mutation_policy_absent', not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('sigec_storage_candidate_update', 'sigec_storage_candidate_delete')
  ),
  'missing_fk_indexes', coalesce((
    select json_agg(json_build_object('table', table_name, 'column', column_name)
      order by table_name, column_name)
    from missing_fk_indexes
  ), '[]'::json),
  'migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260722022016'
  ),
  'ranking_migrations_applied', (
    select count(*) = 2 from supabase_migrations.schema_migrations
    where version in ('20260827145229', '20260827150004')
  ),
  'candidate_signup_migrations_applied', (
    select count(*) = 2 from supabase_migrations.schema_migrations
    where version in ('20260827191720', '20260827192334')
  ),
  'abuse_limit_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827210859'
  ),
  'signup_proof_cleanup_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827211700'
  ),
  'signup_proof_atomic_cleanup_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827211803'
  ),
  'whatsapp_otp_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827223306'
  ),
  'whatsapp_replay_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260827225813'
  ),
  'process_publication_gate_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828175634'
  ),
  'process_publication_functions_present', (
    select count(*) = 3
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'sigec_get_process_publication_readiness',
        'sigec_publish_process',
        'sigec_close_process'
      )
  ),
  'process_publication_functions_server_only', (
    not has_function_privilege('anon', 'public.sigec_get_process_publication_readiness(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_get_process_publication_readiness(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_publish_process(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_publish_process(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_close_process(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_close_process(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_get_process_publication_readiness(uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_publish_process(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_close_process(uuid,uuid)', 'EXECUTE')
  ),
  'vacancy_configuration_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828200406'
  ),
  'vacancy_configuration_functions_server_only', (
    not has_function_privilege('anon', 'public.sigec_upsert_process_modality(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_process_modality(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_delete_process_modality(uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_delete_process_modality(uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_upsert_vacancy_configuration(uuid,uuid,uuid,text,text,text,text,text,integer,boolean,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_vacancy_configuration(uuid,uuid,uuid,text,text,text,text,text,integer,boolean,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_process_modality(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_delete_process_modality(uuid,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_vacancy_configuration(uuid,uuid,uuid,text,text,text,text,text,integer,boolean,uuid)', 'EXECUTE')
  ),
  'vacancy_import_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828202054'
  ),
  'vacancy_import_function_server_only', (
    not has_function_privilege('anon', 'public.sigec_confirm_vacancy_import(uuid,uuid,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_confirm_vacancy_import(uuid,uuid,text,jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_confirm_vacancy_import(uuid,uuid,text,jsonb)', 'EXECUTE')
  ),
  'form_configuration_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828223251'
  ),
  'form_configuration_functions_server_only', (
    not has_function_privilege('anon', 'public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_delete_form_configuration(uuid,uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_delete_form_configuration(uuid,uuid,text,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_delete_form_configuration(uuid,uuid,text,uuid)', 'EXECUTE')
  ),
  'declaration_templates_service_only', not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'sigec_declaration_templates'
      and grantee in ('anon', 'authenticated')
  ),
  'stage_configuration_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828225319'
  ),
  'stage_transition_indexes_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260828230158'
  ),
  'stage_configuration_functions_server_only', (
    not has_function_privilege('anon', 'public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_delete_stage_transition(uuid,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_delete_stage_configuration(uuid,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_delete_stage_transition(uuid,uuid,uuid)', 'EXECUTE')
  ),
  'stage_transitions_service_only', not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'sigec_process_stage_transitions'
      and grantee in ('anon', 'authenticated')
  ),
  'scoring_configuration_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829134055'
  ),
  'scoring_latest_version_gate_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829135432'
  ),
  'scoring_confirmation_trigger_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829135829'
  ),
  'process_preference_limit_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829140413'
  ),
  'candidate_profile_management_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829201635'
  ),
  'candidate_profile_management_triggers_present', (
    select count(*) = 2
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sigec_candidate_profiles'
      and trigger.tgname in ('sigec_candidate_profile_prepare', 'sigec_candidate_profile_audit')
      and not trigger.tgisinternal
  ),
  'candidate_profile_column_grants_safe', (
    has_column_privilege('authenticated', 'public.sigec_candidate_profiles', 'whatsapp', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_profiles', 'cpf', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_profiles', 'profile_completed_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_profiles', 'whatsapp_verified_at', 'UPDATE')
  )
) || jsonb_build_object(
  'candidate_education_management_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260829205525'
  ),
  'candidate_education_management_triggers_present', (
    select count(*) = 2
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sigec_candidate_education'
      and trigger.tgname in ('sigec_candidate_education_prepare', 'sigec_candidate_education_audit')
      and not trigger.tgisinternal
  ),
  'candidate_education_column_grants_safe', (
    has_column_privilege('authenticated', 'public.sigec_candidate_education', 'course_name', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_education', 'candidate_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_education', 'id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_education', 'created_at', 'UPDATE')
  ),
  'candidate_experience_management_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260829220824'
  ),
  'candidate_experience_management_triggers_present', (
    select count(*) = 2
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sigec_candidate_experience'
      and trigger.tgname in ('sigec_candidate_experience_prepare', 'sigec_candidate_experience_audit')
      and not trigger.tgisinternal
  ),
  'candidate_experience_summary_permissions_safe', (
    not has_function_privilege('anon', 'public.sigec_candidate_teaching_experience_summary(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.sigec_candidate_teaching_experience_summary(uuid)', 'EXECUTE')
  ),
  'candidate_experience_column_grants_safe', (
    has_column_privilege('authenticated', 'public.sigec_candidate_experience', 'role_title', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_experience', 'candidate_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_experience', 'id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.sigec_candidate_experience', 'created_at', 'UPDATE')
  ),
  'candidate_document_processing_migrations_applied', (
    select count(*) = 2 from supabase_migrations.schema_migrations
    where version in ('20260829225014', '20260829230009')
  ),
  'candidate_document_malware_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260829234758'
  ),
  'candidate_document_columns_safe', (
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'sigec_application_documents'
        and column_name = 'sha256' and is_nullable = 'NO'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'sigec_application_documents'
        and column_name in ('technical_status', 'malware_status', 'sanitized_at', 'supersedes_document_id')
      group by table_schema, table_name having count(*) = 4
    )
  ),
  'candidate_document_rpc_safe', (
    not has_function_privilege('anon', 'public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public' and procedure.proname = 'sigec_register_candidate_document'
    )
  ),
  'candidate_document_malware_rpc_safe', (
    not has_function_privilege('anon', 'public.sigec_record_document_malware_scan(uuid,text,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_record_document_malware_scan(uuid,text,text,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_record_document_malware_scan(uuid,text,text,text,text,text)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public' and procedure.proname = 'sigec_record_document_malware_scan'
    )
  ),
  'candidate_document_direct_insert_absent', (
    not has_table_privilege('authenticated', 'public.sigec_application_documents', 'INSERT')
    and not exists (
      select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and cmd = 'INSERT' and policyname like 'sigec_storage_candidate%'
    )
  ),
  'staff_document_storage_requires_clean_scan', exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'sigec_storage_candidate_read'
      and coalesce(qual, '') like '%malware_status%clean%'
  ),
  'process_preference_limit_trigger_present', exists (
    select 1 from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sigec_application_preferences'
      and trigger.tgname = 'sigec_application_preference_limit_guard'
      and not trigger.tgisinternal
  ),
  'scoring_configuration_functions_server_only', (
    not has_function_privilege('anon', 'public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_scoring_item(uuid,uuid,uuid,text,text,text,numeric,jsonb,integer,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_upsert_tie_break_rule(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_confirm_scoring_version(uuid,uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_confirm_scoring_version(uuid,uuid,uuid,text)', 'EXECUTE')
  ),
  'scoring_configuration_tables_server_only', not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('sigec_scoring_rule_versions', 'sigec_scoring_rule_items', 'sigec_tie_break_rules')
      and grantee in ('anon', 'authenticated')
  ),
  'consent_migrations_applied', (
    select count(*) = 3 from supabase_migrations.schema_migrations
    where version in ('20260827224616', '20260827225219', '20260827225348')
  ),
  'application_correction_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260831154756'
  ),
  'application_diligence_migrations_applied', (
    select count(*) = 2 from supabase_migrations.schema_migrations
    where version in ('20260831232727', '20260831233955')
  ),
  'application_diligence_document_link_present', (
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'sigec_application_documents'
        and column_name = 'information_request_id'
    )
    and exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'sigec_application_documents'
        and indexname = 'sigec_application_documents_information_request_idx'
    )
  ),
  'application_diligence_functions_safe', (
    has_function_privilege('authenticated', 'public.sigec_submit_information_request_answers(uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_submit_information_request_answers(uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_finalize_information_request_if_complete(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_finalize_information_request_if_complete(uuid,uuid)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'sigec_submit_information_request_answers'
    )
  ),
  'application_diligence_trigger_hardened', exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'sigec_validate_information_request'
      and procedure.prosecdef
      and coalesce(array_to_string(procedure.proconfig, ','), '') in ('search_path=', 'search_path=""')
      and not has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ),
  'application_correction_function_safe', (
    has_function_privilege('authenticated', 'public.sigec_start_application_correction(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_start_application_correction(uuid)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'sigec_start_application_correction'
    )
  ),
  'application_submission_versions_security_invoker', exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sigec_application_submission_versions'
      and relation.relkind = 'v'
      and coalesce(relation.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ),
  'abuse_tables_server_only', not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('sigec_auth_rate_limits', 'sigec_candidate_signup_nonces')
      and grantee in ('anon', 'authenticated')
  ),
  'candidate_signup_trigger_ok', exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'auth'
      and relation.relname = 'users'
      and trigger.tgname = 'sigec_finalize_candidate_signup'
      and not trigger.tgisinternal
  ),
  'ranking_immutability_triggers', (
    select count(*) from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname like 'sigec\_ranking%' escape '\'
      and not trigger.tgisinternal
  ),
  'synthetic_auth_users', (
    select count(*) from auth.users where email like 'sigec-test-%@example.invalid'
  ),
  'synthetic_processes', (
    select count(*) from public.sigec_processes
    where slug like 'processo-sintetico-%' or slug like 'ranking-sintetico-%'
  ),
  'synthetic_storage_objects', (
    select count(*) from storage.objects
    where bucket_id = 'sigec-candidate-documents' and name like '%/proof-%'
  ),
  'p4_concurrency_fixtures_absent', (
    not exists (
      select 1 from public.sigec_processes
      where slug like 'sigec-p4-gate-%'
    )
    and not exists (
      select 1 from auth.users
      where email like 'sigec-p4-gate-%@example.invalid'
    )
  ),
  'admin_application_list_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901135418'
  ),
  'admin_application_list_function_safe', (
    not has_function_privilege('anon', 'public.sigec_list_applications_for_review(uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_list_applications_for_review(uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_list_applications_for_review(uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'sigec_list_applications_for_review'
    )
  ),
  'admin_application_list_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-list-%@example.invalid'
  ),
  'admin_application_detail_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901140949'
  ),
  'admin_application_detail_function_safe', (
    not has_function_privilege('anon', 'public.sigec_get_application_review_detail(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_get_application_review_detail(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_get_application_review_detail(uuid,uuid)', 'EXECUTE')
    and not (
      select procedure.prosecdef from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'sigec_get_application_review_detail'
    )
  ),
  'admin_application_detail_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-detail-%@example.invalid'
  ),
  'document_review_migrations_applied', (
    select count(*) = 2 from supabase_migrations.schema_migrations
    where version in ('20260901142010', '20260901142154')
  ),
  'document_review_contract_safe', (
    not has_function_privilege('anon', 'public.sigec_review_application_document(uuid,uuid,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_review_application_document(uuid,uuid,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_review_application_document(uuid,uuid,text,text,text)', 'EXECUTE')
    and not has_table_privilege('authenticated', 'public.sigec_document_reviews', 'SELECT,INSERT,UPDATE,DELETE')
    and exists (
      select 1 from pg_trigger trigger
      join pg_class relation on relation.oid = trigger.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'sigec_application_documents'
        and trigger.tgname = 'sigec_document_review_state_guard'
        and not trigger.tgisinternal
    )
  ),
  'document_review_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-review-%@example.invalid'
  ),
  'information_request_management_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901145018'
  ),
  'information_request_management_contract_safe', (
    not has_function_privilege('anon', 'public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamp with time zone)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_close_information_request(uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_close_information_request(uuid,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_close_information_request(uuid,uuid,text,text)', 'EXECUTE')
    and not has_table_privilege('authenticated', 'public.sigec_information_requests', 'INSERT,UPDATE,DELETE')
    and exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'sigec_information_requests'
        and indexname = 'sigec_information_requests_one_active_idx'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'sigec_information_requests'
        and column_name = 'closed_by'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'sigec_information_requests'
        and column_name = 'resolution_message'
    )
  ),
  'information_request_management_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-diligence-%@example.invalid'
  ),
  'application_advancement_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901150433'
  ),
  'application_advancement_contract_safe', (
    not has_function_privilege('anon', 'public.sigec_get_application_advancement_readiness(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_get_application_advancement_readiness(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_get_application_advancement_readiness(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_advance_application_stage(uuid,uuid,uuid,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_advance_application_stage(uuid,uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_advance_application_stage(uuid,uuid,uuid,text)', 'EXECUTE')
  ),
  'application_advancement_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-advance-%@example.invalid'
  )
) || jsonb_build_object(
  'disqualification_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901212822'
  ),
  'disqualification_contract_safe', (
    not has_function_privilege('anon', 'public.sigec_create_disqualification_catalog(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_create_disqualification_catalog(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_create_disqualification_catalog(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_disqualify_application(uuid,uuid,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_disqualify_application(uuid,uuid,uuid,text,text)', 'EXECUTE')
    and not has_table_privilege('authenticated', 'public.sigec_application_disqualifications', 'SELECT,INSERT,UPDATE,DELETE')
    and has_function_privilege('authenticated', 'public.sigec_get_candidate_disqualification(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.sigec_get_candidate_disqualification(uuid)', 'EXECUTE')
  ),
  'disqualification_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-disqualify-%@example.invalid'
  ),
  'attendant_authorization_contract_safe', (
    position('atendente' in lower(pg_get_functiondef('private.sigec_is_staff()'::regprocedure))) = 0
    and position('admin' in lower(pg_get_functiondef('private.sigec_is_staff()'::regprocedure))) > 0
    and position('gerente' in lower(pg_get_functiondef('private.sigec_is_staff()'::regprocedure))) > 0
    and not has_table_privilege('authenticated', 'public.sigec_application_scores', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.sigec_convocation_batches', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.sigec_convocations', 'INSERT,UPDATE,DELETE')
    and (
      select count(*) = 7 from pg_policies
      where schemaname = 'public'
        and tablename in ('sigec_ranking_snapshots', 'sigec_ranking_snapshot_entries', 'sigec_ranking_snapshot_approvals', 'sigec_ranking_snapshot_publications')
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and coalesce(qual, '') || coalesce(with_check, '') like '%sigec_is_staff%'
    )
  ),
  'attendant_gate_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p5-attendant-%@example.invalid'
  ),
  'postgraduate_scoring_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901215622'
  ),
  'postgraduate_scoring_contract_safe', (
    not has_table_privilege('authenticated', 'public.sigec_postgraduate_evidence_reviews', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_function_privilege('authenticated', 'public.sigec_review_postgraduate_evidence(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_review_postgraduate_evidence(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_get_postgraduate_score(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_get_postgraduate_score(uuid,uuid)', 'EXECUTE')
    and exists (
      select 1 from pg_trigger trigger
      join pg_class relation on relation.oid = trigger.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'sigec_postgraduate_evidence_reviews'
        and trigger.tgname = 'sigec_postgraduate_reviews_immutable'
        and not trigger.tgisinternal
    )
  ),
  'postgraduate_scoring_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p6-postgrad-%@example.invalid'
  ),
  'experience_scoring_migration_applied', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260901220814'
  ),
  'experience_scoring_contract_safe', (
    not has_table_privilege('authenticated', 'public.sigec_experience_evidence_reviews', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_function_privilege('authenticated', 'public.sigec_review_experience_evidence(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_review_experience_evidence(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sigec_get_experience_score(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.sigec_get_experience_score(uuid,uuid)', 'EXECUTE')
  ),
  'experience_scoring_fixtures_absent', not exists (
    select 1 from auth.users
    where email like 'sigec-p6-experience-%@example.invalid'
  )
) as sigec_remote_verification;
