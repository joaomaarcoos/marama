begin;

create table public.sigec_application_submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  version integer not null check (version > 0),
  protocol text not null unique check (protocol ~ '^SIGEC-[0-9]{4}-[A-F0-9]{12}$'),
  edital_version text not null check (char_length(trim(edital_version)) between 1 and 50),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (application_id, version)
);

create index sigec_application_submissions_application_idx
  on public.sigec_application_submissions(application_id, version desc);
alter table public.sigec_application_submissions enable row level security;
revoke all on public.sigec_application_submissions from public, anon, authenticated;
grant select on public.sigec_application_submissions to authenticated;
grant all on public.sigec_application_submissions to service_role;

create policy sigec_application_submissions_owner_or_staff_read
on public.sigec_application_submissions for select to authenticated
using (
  private.sigec_is_staff()
  or exists (
    select 1 from public.sigec_applications application
    where application.id = application_id and application.candidate_id = (select auth.uid())
  )
);

create or replace function private.sigec_reject_submission_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SIGEC_SUBMISSION_SNAPSHOT_IMMUTABLE' using errcode = '55000';
end;
$$;

create trigger sigec_application_submissions_immutable
before update or delete on public.sigec_application_submissions
for each row execute function private.sigec_reject_submission_snapshot_mutation();

create or replace function private.sigec_submit_application_impl(
  p_application_id uuid,
  p_ip_hash text,
  p_user_agent_hash text
)
returns table(protocol text, submitted_at timestamptz, snapshot_sha256 text, submission_version integer)
language plpgsql
security definer
set search_path = ''
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
  v_version integer := 1;
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

  insert into public.sigec_consents(application_id, consent_type, document_version, accepted, ip_hash, user_agent_hash)
  values
    (p_application_id, 'edital', 'edital:' || target.edital_version, true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'truthfulness', 'declaracao-veracidade:1', true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'requirements', 'requisitos:' || target.edital_version, true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'lgpd', 'aviso-privacidade:1', true, p_ip_hash, p_user_agent_hash)
  on conflict do nothing;

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
    exit when not exists (select 1 from public.sigec_application_submissions submission where submission.protocol = v_protocol);
  end loop;

  insert into public.sigec_application_submissions(
    application_id, version, protocol, edital_version, snapshot, snapshot_sha256, submitted_at
  ) values (p_application_id, v_version, v_protocol, target.edital_version, v_snapshot, v_snapshot_hash, v_submitted_at);

  update public.sigec_applications
  set application_state = 'submitted', submitted_at = v_submitted_at, stage_id = v_initial_stage, updated_at = now()
  where id = p_application_id;

  insert into public.sigec_application_status_history(application_id, from_stage_id, to_stage_id, public_message, changed_by)
  values (p_application_id, target.stage_id, v_initial_stage, 'Inscrição recebida.', actor_id);
  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (actor_id, 'candidato', 'application_submitted', 'application', p_application_id::text,
    jsonb_build_object('protocol', v_protocol, 'snapshot_sha256', v_snapshot_hash, 'version', v_version));

  return query select v_protocol, v_submitted_at, v_snapshot_hash, v_version;
end;
$$;

create or replace function public.sigec_submit_application(
  p_application_id uuid, p_ip_hash text, p_user_agent_hash text
)
returns table(protocol text, submitted_at timestamptz, snapshot_sha256 text, submission_version integer)
language sql
security invoker
set search_path = ''
as $$ select * from private.sigec_submit_application_impl(p_application_id, p_ip_hash, p_user_agent_hash); $$;

revoke update, delete on public.sigec_application_submissions from authenticated;
revoke update on public.sigec_applications from authenticated;
revoke all on function private.sigec_reject_submission_snapshot_mutation() from public, anon, authenticated;
revoke all on function private.sigec_submit_application_impl(uuid,text,text) from public, anon;
grant execute on function private.sigec_submit_application_impl(uuid,text,text) to authenticated;
revoke all on function public.sigec_submit_application(uuid,text,text) from public, anon;
grant execute on function public.sigec_submit_application(uuid,text,text) to authenticated;

commit;
