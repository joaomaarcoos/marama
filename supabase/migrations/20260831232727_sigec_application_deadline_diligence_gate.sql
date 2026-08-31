begin;

alter table public.sigec_information_requests
  alter column due_at set not null,
  add constraint sigec_information_request_due_after_creation_check
    check (due_at > created_at),
  add constraint sigec_information_request_fields_count_check
    check (jsonb_array_length(requested_fields) between 1 and 50);

alter table public.sigec_application_documents
  add column information_request_id uuid
    references public.sigec_information_requests(id) on delete restrict;

create index sigec_application_documents_information_request_idx
  on public.sigec_application_documents(information_request_id)
  where information_request_id is not null;

create or replace function private.sigec_validate_information_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_process_id uuid;
  item record;
begin
  if new.due_at <= new.created_at then
    raise exception 'SIGEC_DILIGENCE_DEADLINE_INVALID' using errcode = '23514';
  end if;
  if jsonb_typeof(new.requested_fields) <> 'array'
    or jsonb_array_length(new.requested_fields) not between 1 and 50 then
    raise exception 'SIGEC_DILIGENCE_FIELDS_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users staff
    where staff.id = new.requested_by
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DILIGENCE_STAFF_REQUIRED' using errcode = '42501';
  end if;

  select application.process_id into application_process_id
  from public.sigec_applications application
  where application.id = new.application_id;
  if application_process_id is null then
    raise exception 'SIGEC_DILIGENCE_APPLICATION_INVALID' using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.requested_fields) field
    where jsonb_typeof(field) <> 'object'
      or not (field ? 'kind' and field ? 'id')
      or field ->> 'kind' not in ('question', 'document')
      or field ->> 'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (select count(*) from jsonb_object_keys(field)) <> 2
  ) then
    raise exception 'SIGEC_DILIGENCE_FIELDS_INVALID' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(new.requested_fields)
  ) <> (
    select count(distinct (field ->> 'kind', field ->> 'id'))
    from jsonb_array_elements(new.requested_fields) field
  ) then
    raise exception 'SIGEC_DILIGENCE_FIELDS_DUPLICATED' using errcode = '23514';
  end if;

  for item in
    select field ->> 'kind' as kind, (field ->> 'id')::uuid as id
    from jsonb_array_elements(new.requested_fields) field
  loop
    if item.kind = 'question' and not exists (
      select 1 from public.sigec_process_questions question
      where question.id = item.id and question.process_id = application_process_id
    ) then
      raise exception 'SIGEC_DILIGENCE_QUESTION_INVALID' using errcode = '23503';
    end if;
    if item.kind = 'document' and not exists (
      select 1 from public.sigec_document_requirements requirement
      where requirement.id = item.id and requirement.process_id = application_process_id
    ) then
      raise exception 'SIGEC_DILIGENCE_DOCUMENT_INVALID' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

create trigger sigec_validate_information_request
before insert or update of application_id, requested_fields, due_at, requested_by
on public.sigec_information_requests
for each row execute function private.sigec_validate_information_request();

create or replace function private.sigec_try_finalize_information_request(
  p_request_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
begin
  select request.application_id, request.status, request.due_at, request.requested_fields,
         application.candidate_id
  into target
  from public.sigec_information_requests request
  join public.sigec_applications application on application.id = request.application_id
  where request.id = p_request_id
  for update of request;

  if not found or target.candidate_id <> p_actor_id then
    raise exception 'SIGEC_DILIGENCE_REQUEST_FORBIDDEN' using errcode = '42501';
  end if;
  if target.status <> 'open' or target.due_at <= now() then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target.requested_fields) field
    join public.sigec_process_questions question
      on field ->> 'kind' = 'question' and question.id = (field ->> 'id')::uuid
    left join public.sigec_application_answers answer
      on answer.application_id = target.application_id and answer.question_id = question.id
    where not private.sigec_answer_matches_question(answer.answer, question.question_type, question.config)
  ) or exists (
    select 1
    from jsonb_array_elements(target.requested_fields) field
    where field ->> 'kind' = 'document'
      and not exists (
        select 1 from public.sigec_application_documents document
        where document.application_id = target.application_id
          and document.requirement_id = (field ->> 'id')::uuid
          and document.information_request_id = p_request_id
          and document.removed_at is null
          and document.technical_status = 'validated'
          and document.malware_status = 'clean'
      )
  ) then
    return false;
  end if;

  update public.sigec_information_requests
  set status = 'answered', answered_at = now(), updated_at = now()
  where id = p_request_id and status = 'open';
  if not found then return false; end if;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'candidato', 'information_request_answered', 'information_request',
    p_request_id::text,
    jsonb_build_object(
      'application_id', target.application_id,
      'requested_count', jsonb_array_length(target.requested_fields)
    )
  );
  return true;
end;
$$;

create or replace function private.sigec_submit_information_request_answers_impl(
  p_request_id uuid,
  p_answers jsonb
)
returns table(answer_count integer, request_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target record;
  supplied record;
  v_count integer := 0;
  v_completed boolean;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_DILIGENCE_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answers)) > 50 then
    raise exception 'SIGEC_DILIGENCE_ANSWERS_INVALID' using errcode = '22023';
  end if;

  select request.application_id, request.status, request.due_at, request.requested_fields,
         application.candidate_id, application.process_id
  into target
  from public.sigec_information_requests request
  join public.sigec_applications application on application.id = request.application_id
  where request.id = p_request_id
  for update of request;

  if not found or target.candidate_id <> actor_id then
    raise exception 'SIGEC_DILIGENCE_REQUEST_FORBIDDEN' using errcode = '42501';
  end if;
  if target.status <> 'open' or target.due_at <= now() then
    raise exception 'SIGEC_DILIGENCE_REQUEST_CLOSED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sigec_application_submissions submission
    where submission.application_id = target.application_id
  ) then
    raise exception 'SIGEC_DILIGENCE_SUBMISSION_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_answers) key
    where key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not exists (
        select 1 from jsonb_array_elements(target.requested_fields) field
        where field ->> 'kind' = 'question' and field ->> 'id' = key
      )
  ) then
    raise exception 'SIGEC_DILIGENCE_FIELD_NOT_REQUESTED' using errcode = '42501';
  end if;

  for supplied in
    select question.id, question.question_type, question.config, answer.value
    from jsonb_each(p_answers) answer(key, value)
    join public.sigec_process_questions question
      on question.id = answer.key::uuid and question.process_id = target.process_id
  loop
    if not private.sigec_answer_matches_question(supplied.value, supplied.question_type, supplied.config) then
      raise exception 'SIGEC_DILIGENCE_ANSWER_INVALID' using errcode = '23514';
    end if;
    insert into public.sigec_application_answers(application_id, question_id, answer)
    values (target.application_id, supplied.id, supplied.value)
    on conflict (application_id, question_id) do update
    set answer = excluded.answer, updated_at = now();
    v_count := v_count + 1;
  end loop;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    actor_id, 'candidato', 'information_request_answers_updated', 'information_request',
    p_request_id::text,
    jsonb_build_object('application_id', target.application_id, 'answer_count', v_count)
  );
  v_completed := private.sigec_try_finalize_information_request(p_request_id, actor_id);
  return query select v_count, v_completed;
end;
$$;

create or replace function public.sigec_submit_information_request_answers(
  p_request_id uuid,
  p_answers jsonb
)
returns table(answer_count integer, request_completed boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.sigec_submit_information_request_answers_impl(p_request_id, p_answers);
$$;

create or replace function public.sigec_finalize_information_request_if_complete(
  p_request_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.sigec_try_finalize_information_request(p_request_id, p_actor_id);
$$;

drop function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid);

create function public.sigec_register_candidate_document(
  p_application_id uuid, p_requirement_id uuid, p_storage_path text,
  p_original_name text, p_mime_type text, p_size_bytes bigint,
  p_sha256 text, p_actor_id uuid, p_information_request_id uuid default null
)
returns table(document_id uuid, document_version integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  target_application public.sigec_applications%rowtype;
  target_process public.sigec_processes%rowtype;
  target_requirement public.sigec_document_requirements%rowtype;
  target_request public.sigec_information_requests%rowtype;
  normal_window boolean;
  next_version integer;
  previous_id uuid;
  inserted_id uuid;
begin
  if p_actor_id is null then raise exception 'SIGEC_DOCUMENT_ACTOR_REQUIRED' using errcode = '42501'; end if;
  select * into target_application from public.sigec_applications where id = p_application_id for update;
  if not found or target_application.candidate_id <> p_actor_id then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;
  select * into target_process from public.sigec_processes where id = target_application.process_id;
  normal_window := target_application.application_state = 'draft'
    and target_process.status = 'open'
    and (target_process.applications_open_at is null or target_process.applications_open_at <= now())
    and (target_process.applications_close_at is null or target_process.applications_close_at > now());

  if p_information_request_id is not null then
    select * into target_request
    from public.sigec_information_requests request
    where request.id = p_information_request_id
    for update;
    if not found or target_request.application_id <> p_application_id then
      raise exception 'SIGEC_DILIGENCE_REQUEST_FORBIDDEN' using errcode = '42501';
    end if;
    if target_request.status <> 'open' or target_request.due_at <= now() then
      raise exception 'SIGEC_DILIGENCE_REQUEST_CLOSED' using errcode = '23514';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(target_request.requested_fields) field
      where field ->> 'kind' = 'document'
        and field ->> 'id' = p_requirement_id::text
    ) then
      raise exception 'SIGEC_DILIGENCE_FIELD_NOT_REQUESTED' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.sigec_application_submissions submission
      where submission.application_id = p_application_id
    ) then
      raise exception 'SIGEC_DILIGENCE_SUBMISSION_REQUIRED' using errcode = '23514';
    end if;
  elsif not normal_window then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_LOCKED' using errcode = '23514';
  end if;

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
    sanitized_at, supersedes_document_id, information_request_id
  ) values (
    p_application_id, p_requirement_id, p_storage_path, trim(p_original_name), p_mime_type,
    p_size_bytes, p_sha256, next_version, 'validated', 'pending', now(), previous_id,
    p_information_request_id
  ) returning id into inserted_id;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'candidato', 'candidate_document_uploaded', 'application_document', inserted_id::text,
    jsonb_build_object(
      'application_id', p_application_id, 'requirement_id', p_requirement_id,
      'version', next_version, 'mime_type', p_mime_type, 'size_bytes', p_size_bytes,
      'technical_status', 'validated', 'malware_status', 'pending',
      'information_request_id', p_information_request_id
    )
  );
  return query select inserted_id, next_version;
end;
$$;

revoke all on function private.sigec_validate_information_request() from public, anon, authenticated;
revoke all on function private.sigec_try_finalize_information_request(uuid,uuid) from public, anon, authenticated;
revoke all on function private.sigec_submit_information_request_answers_impl(uuid,jsonb) from public, anon;
grant execute on function private.sigec_submit_information_request_answers_impl(uuid,jsonb) to authenticated;
revoke all on function public.sigec_submit_information_request_answers(uuid,jsonb) from public, anon;
grant execute on function public.sigec_submit_information_request_answers(uuid,jsonb) to authenticated;
revoke all on function public.sigec_finalize_information_request_if_complete(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_finalize_information_request_if_complete(uuid,uuid) to service_role;
revoke all on function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid) to service_role;

comment on function public.sigec_submit_information_request_answers(uuid,jsonb) is
  'Allows a candidate to update only the question IDs explicitly listed in one open, unexpired information request.';
comment on function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid,uuid) is
  'Registers candidate documents during the normal draft window or for one exact document requirement in an open diligence.';

commit;
