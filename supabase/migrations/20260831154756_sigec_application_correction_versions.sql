begin;

alter table public.sigec_application_submissions
  add column supersedes_submission_id uuid
    references public.sigec_application_submissions(id) on delete restrict;

create unique index sigec_application_submissions_single_successor_idx
  on public.sigec_application_submissions(supersedes_submission_id)
  where supersedes_submission_id is not null;

create view public.sigec_application_submission_versions
with (security_invoker = true)
as
select
  submission.application_id,
  submission.id as submission_id,
  submission.version,
  submission.protocol,
  submission.submitted_at,
  submission.snapshot_sha256,
  submission.supersedes_submission_id,
  submission.version = max(submission.version) over (
    partition by submission.application_id
  ) as is_current
from public.sigec_application_submissions submission;

revoke all on public.sigec_application_submission_versions from public, anon, authenticated;
grant select on public.sigec_application_submission_versions to authenticated;

create or replace function private.sigec_start_application_correction_impl(
  p_application_id uuid
)
returns table(protocol text, submission_version integer, already_open boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target record;
  current_submission record;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_CORRECTION_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;

  select
    application.candidate_id,
    application.application_state,
    application.stage_id,
    process.status as process_status,
    process.applications_open_at,
    process.applications_close_at
  into target
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = p_application_id
  for update of application;

  if not found or target.candidate_id <> actor_id then
    raise exception 'SIGEC_CORRECTION_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select submission.protocol, submission.version
  into current_submission
  from public.sigec_application_submissions submission
  where submission.application_id = p_application_id
  order by submission.version desc
  limit 1;

  if not found then
    raise exception 'SIGEC_CORRECTION_SUBMISSION_REQUIRED' using errcode = '23514';
  end if;

  if target.application_state = 'draft' then
    return query select current_submission.protocol, current_submission.version, true;
    return;
  end if;
  if target.application_state <> 'submitted' then
    raise exception 'SIGEC_CORRECTION_APPLICATION_LOCKED' using errcode = '23514';
  end if;
  if target.process_status <> 'open'
    or (target.applications_open_at is not null and target.applications_open_at > now())
    or (target.applications_close_at is not null and target.applications_close_at <= now()) then
    raise exception 'SIGEC_CORRECTION_WINDOW_CLOSED' using errcode = '23514';
  end if;

  update public.sigec_applications
  set application_state = 'draft', updated_at = now()
  where id = p_application_id;

  insert into public.sigec_application_status_history(
    application_id, from_stage_id, to_stage_id, public_message, changed_by
  ) values (
    p_application_id, target.stage_id, target.stage_id,
    'Correção iniciada pelo candidato.', actor_id
  );

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    actor_id, 'candidato', 'application_correction_started', 'application',
    p_application_id::text,
    jsonb_build_object(
      'current_protocol', current_submission.protocol,
      'current_version', current_submission.version
    )
  );

  return query select current_submission.protocol, current_submission.version, false;
end;
$$;

create or replace function public.sigec_start_application_correction(
  p_application_id uuid
)
returns table(protocol text, submission_version integer, already_open boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.sigec_start_application_correction_impl(p_application_id);
$$;

create or replace function private.sigec_submit_application_impl(
  p_application_id uuid,
  p_ip_hash text,
  p_user_agent_hash text
)
returns table(protocol text, submitted_at timestamptz, snapshot_sha256 text, submission_version integer)
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target record;
  v_protocol text;
  v_submitted_at timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_initial_stage uuid;
  v_version integer;
  v_previous_submission_id uuid;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_SUBMIT_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_user_agent_hash is null or p_user_agent_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'SIGEC_SUBMIT_EVIDENCE_INVALID' using errcode = '22023';
  end if;

  select application.candidate_id, application.process_id, application.application_state,
         application.stage_id, process.edital_version
    into target
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = p_application_id
  for update of application;
  if not found or target.candidate_id <> actor_id then
    raise exception 'SIGEC_SUBMIT_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  if target.application_state = 'submitted' then
    return query
    select submission.protocol, submission.submitted_at, submission.snapshot_sha256, submission.version
    from public.sigec_application_submissions submission
    where submission.application_id = p_application_id
    order by submission.version desc limit 1;
    if not found then raise exception 'SIGEC_SUBMIT_SNAPSHOT_MISSING' using errcode = '55000'; end if;
    return;
  end if;
  if target.application_state <> 'draft' then
    raise exception 'SIGEC_SUBMIT_APPLICATION_LOCKED' using errcode = '23514';
  end if;

  select submission.id, submission.version
  into v_previous_submission_id, v_version
  from public.sigec_application_submissions submission
  where submission.application_id = p_application_id
  order by submission.version desc
  limit 1;
  v_version := coalesce(v_version, 0) + 1;

  insert into public.sigec_consents(
    application_id, consent_type, document_version, accepted,
    accepted_at, ip_hash, user_agent_hash
  ) values
    (p_application_id, 'edital', 'edital:' || target.edital_version, true, v_submitted_at, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'truthfulness', 'declaracao-veracidade:1', true, v_submitted_at, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'requirements', 'requisitos:' || target.edital_version, true, v_submitted_at, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'lgpd', 'aviso-privacidade:1', true, v_submitted_at, p_ip_hash, p_user_agent_hash)
  on conflict (application_id, consent_type, document_version) do update
  set accepted = true,
      accepted_at = excluded.accepted_at,
      ip_hash = excluded.ip_hash,
      user_agent_hash = excluded.user_agent_hash;

  perform private.sigec_assert_application_ready_for_submission(p_application_id);

  select stage.id into v_initial_stage
  from public.sigec_process_stages stage
  where stage.process_id = target.process_id and stage.is_initial;
  if v_initial_stage is null then
    raise exception 'SIGEC_SUBMIT_INITIAL_STAGE_MISSING' using errcode = '23514';
  end if;

  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'applicationId', p_application_id,
    'processId', target.process_id,
    'candidateId', actor_id,
    'editalVersion', target.edital_version,
    'submittedAt', to_jsonb(v_submitted_at),
    'submissionVersion', v_version,
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', preference.position, 'vacancyId', vacancy.id,
        'municipality', vacancy.municipality, 'course', course.canonical_name,
        'modality', modality.name
      ) order by preference.position)
      from public.sigec_application_preferences preference
      join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
      join public.sigec_courses course on course.id = vacancy.course_id
      join public.sigec_modalities modality on modality.id = vacancy.modality_id
      where preference.application_id = p_application_id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId', question.id, 'code', question.code, 'label', question.label,
        'answer', answer.answer
      ) order by question.position, question.id)
      from public.sigec_application_answers answer
      join public.sigec_process_questions question on question.id = answer.question_id
      where answer.application_id = p_application_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentId', document.id, 'requirementId', requirement.id, 'code', requirement.code,
        'version', document.version, 'sha256', document.sha256,
        'mimeType', document.mime_type, 'sizeBytes', document.size_bytes
      ) order by requirement.position, document.version)
      from public.sigec_application_documents document
      join public.sigec_document_requirements requirement on requirement.id = document.requirement_id
      where document.application_id = p_application_id and document.removed_at is null
        and document.technical_status = 'validated' and document.malware_status = 'clean'
        and private.sigec_application_matches_audience(
          p_application_id, coalesce(requirement.condition_config ->> 'audience', 'all')
        )
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', consent.consent_type, 'documentVersion', consent.document_version,
        'acceptedAt', consent.accepted_at
      ) order by consent.consent_type)
      from public.sigec_consents consent
      where consent.application_id = p_application_id and consent.accepted
        and consent.consent_type in ('edital','truthfulness','requirements','lgpd')
    ), '[]'::jsonb)
  );
  v_snapshot_hash := encode(digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  loop
    v_protocol := 'SIGEC-' || to_char(v_submitted_at at time zone 'America/Sao_Paulo', 'YYYY') || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.sigec_application_submissions submission
      where submission.protocol = v_protocol
    );
  end loop;

  insert into public.sigec_application_submissions(
    application_id, version, protocol, edital_version, snapshot,
    snapshot_sha256, submitted_at, supersedes_submission_id
  ) values (
    p_application_id, v_version, v_protocol, target.edital_version, v_snapshot,
    v_snapshot_hash, v_submitted_at, v_previous_submission_id
  );

  update public.sigec_applications
  set application_state = 'submitted', submitted_at = v_submitted_at,
      stage_id = v_initial_stage, updated_at = now()
  where id = p_application_id;

  insert into public.sigec_application_status_history(
    application_id, from_stage_id, to_stage_id, public_message, changed_by
  ) values (
    p_application_id, target.stage_id, v_initial_stage,
    case when v_version = 1 then 'Inscrição recebida.' else 'Correção recebida.' end,
    actor_id
  );
  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    actor_id, 'candidato',
    case when v_version = 1 then 'application_submitted' else 'application_resubmitted' end,
    'application', p_application_id::text,
    jsonb_build_object(
      'protocol', v_protocol,
      'snapshot_sha256', v_snapshot_hash,
      'version', v_version,
      'supersedes_submission_id', v_previous_submission_id
    )
  );

  return query select v_protocol, v_submitted_at, v_snapshot_hash, v_version;
end;
$$;

-- A submitted application is immutable until the candidate explicitly opens a correction.
create or replace function public.sigec_register_candidate_document(
  p_application_id uuid, p_requirement_id uuid, p_storage_path text,
  p_original_name text, p_mime_type text, p_size_bytes bigint,
  p_sha256 text, p_actor_id uuid
)
returns table(document_id uuid, document_version integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  target_application public.sigec_applications%rowtype;
  target_requirement public.sigec_document_requirements%rowtype;
  next_version integer;
  previous_id uuid;
  inserted_id uuid;
begin
  if p_actor_id is null then raise exception 'SIGEC_DOCUMENT_ACTOR_REQUIRED' using errcode = '42501'; end if;
  select * into target_application from public.sigec_applications where id = p_application_id for update;
  if not found or target_application.candidate_id <> p_actor_id then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;
  if target_application.application_state <> 'draft' then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_LOCKED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sigec_processes process
    where process.id = target_application.process_id and (
      process.applications_close_at is null or process.applications_close_at > now()
      or exists (
        select 1 from public.sigec_information_requests request
        where request.application_id = target_application.id and request.status = 'open'
          and (request.due_at is null or request.due_at > now())
      )
    )
  ) then raise exception 'SIGEC_DOCUMENT_UPLOAD_WINDOW_CLOSED' using errcode = '23514'; end if;

  select * into target_requirement from public.sigec_document_requirements
  where id = p_requirement_id and process_id = target_application.process_id;
  if not found then raise exception 'SIGEC_DOCUMENT_REQUIREMENT_INVALID' using errcode = '23503'; end if;
  if not private.sigec_application_matches_audience(
    p_application_id, coalesce(target_requirement.condition_config ->> 'audience', 'all')
  ) then raise exception 'SIGEC_DOCUMENT_REQUIREMENT_HIDDEN' using errcode = '42501'; end if;
  if p_mime_type <> all(target_requirement.accepted_mime_types)
     or p_size_bytes < 1
     or p_size_bytes > least(target_requirement.max_file_size_bytes, 10485760) then
    raise exception 'SIGEC_DOCUMENT_FILE_CONSTRAINT' using errcode = '23514';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path !~ ('^' || p_actor_id::text || '/' || p_application_id::text || '/')
     or char_length(trim(p_original_name)) not between 1 and 255 then
    raise exception 'SIGEC_DOCUMENT_METADATA_INVALID' using errcode = '23514';
  end if;

  select id, version into previous_id, next_version
  from public.sigec_application_documents
  where application_id = p_application_id and requirement_id = p_requirement_id
  order by version desc limit 1;
  next_version := coalesce(next_version, 0) + 1;

  insert into public.sigec_application_documents(
    application_id, requirement_id, storage_path, original_name, mime_type,
    size_bytes, sha256, version, technical_status, malware_status,
    sanitized_at, supersedes_document_id
  ) values (
    p_application_id, p_requirement_id, p_storage_path, trim(p_original_name), p_mime_type,
    p_size_bytes, p_sha256, next_version, 'validated', 'pending', now(), previous_id
  ) returning id into inserted_id;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'candidato', 'candidate_document_uploaded', 'application_document', inserted_id::text,
    jsonb_build_object(
      'application_id', p_application_id, 'requirement_id', p_requirement_id,
      'version', next_version, 'mime_type', p_mime_type, 'size_bytes', p_size_bytes,
      'technical_status', 'validated', 'malware_status', 'pending'
    )
  );
  return query select inserted_id, next_version;
end;
$$;

revoke all on function private.sigec_start_application_correction_impl(uuid)
from public, anon;
grant execute on function private.sigec_start_application_correction_impl(uuid)
to authenticated;
revoke all on function public.sigec_start_application_correction(uuid)
from public, anon;
grant execute on function public.sigec_start_application_correction(uuid)
to authenticated;

comment on view public.sigec_application_submission_versions is
  'Candidate-safe protocol history. Exactly the highest version per application is current.';
comment on function public.sigec_start_application_correction(uuid) is
  'Opens a candidate-owned submitted application for correction while its process window remains open.';

commit;
