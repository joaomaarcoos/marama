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
    ('sigec_application_documents'), ('sigec_application_status_history'),
    ('sigec_internal_notes'), ('sigec_information_requests'), ('sigec_appeals'),
    ('sigec_application_scores'), ('sigec_convocation_batches'),
    ('sigec_convocations'), ('sigec_consents'), ('sigec_notification_outbox'),
    ('sigec_whatsapp_verifications'), ('sigec_audit_events'),
    ('sigec_process_decisions'), ('sigec_quota_rule_versions'),
    ('sigec_ranking_snapshots'), ('sigec_ranking_snapshot_entries'),
    ('sigec_ranking_snapshot_approvals'), ('sigec_ranking_snapshot_publications')
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
select json_build_object(
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
  'consent_migrations_applied', (
    select count(*) = 3 from supabase_migrations.schema_migrations
    where version in ('20260827224616', '20260827225219', '20260827225348')
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
  )
) as sigec_remote_verification;
