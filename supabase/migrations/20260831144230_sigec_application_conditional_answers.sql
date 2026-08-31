begin;

alter table public.sigec_process_questions
  add constraint sigec_question_condition_config_valid check (
    coalesce(config ->> 'audience', 'all') in ('all', 'pcd', 'ppp', 'pcd_or_ppp')
    and coalesce(config ->> 'audienceMarker', 'none') in ('none', 'pcd', 'ppp')
    and (
      not (config ? 'audienceMarker')
      or (question_type = 'boolean' and coalesce(config ->> 'audience', 'all') = 'all')
    )
  );

create unique index sigec_questions_audience_marker_unique_idx
  on public.sigec_process_questions(process_id, (config ->> 'audienceMarker'))
  where config ? 'audienceMarker';

alter table public.sigec_document_requirements
  add constraint sigec_document_condition_config_valid check (
    coalesce(condition_config ->> 'audience', 'all') in ('all', 'pcd', 'ppp', 'pcd_or_ppp')
  );

create or replace function private.sigec_answer_matches_question(
  p_answer jsonb,
  p_question_type text,
  p_config jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  option_count integer;
begin
  if p_answer is null or p_answer = 'null'::jsonb then return false; end if;
  if p_question_type in ('short_text', 'long_text') then
    return jsonb_typeof(p_answer) = 'string'
      and char_length(trim(p_answer #>> '{}')) between 1 and
        case when p_question_type = 'short_text' then 500 else 10000 end;
  elsif p_question_type = 'boolean' then
    return jsonb_typeof(p_answer) = 'boolean';
  elsif p_question_type = 'number' then
    return jsonb_typeof(p_answer) = 'number';
  elsif p_question_type = 'date' then
    return jsonb_typeof(p_answer) = 'string'
      and (p_answer #>> '{}') ~ '^\\d{4}-\\d{2}-\\d{2}$'
      and (p_answer #>> '{}')::date between date '1900-01-01' and date '2200-12-31';
  elsif p_question_type = 'single_choice' then
    return jsonb_typeof(p_answer) = 'string'
      and jsonb_typeof(p_config -> 'options') = 'array'
      and (p_config -> 'options') ? (p_answer #>> '{}');
  elsif p_question_type = 'multiple_choice' then
    if jsonb_typeof(p_answer) <> 'array' or jsonb_array_length(p_answer) < 1
      or jsonb_array_length(p_answer) > 100 or jsonb_typeof(p_config -> 'options') <> 'array' then
      return false;
    end if;
    select count(*) into option_count
    from jsonb_array_elements_text(p_answer) selected(value)
    where (p_config -> 'options') ? selected.value;
    return option_count = jsonb_array_length(p_answer)
      and option_count = (select count(distinct value) from jsonb_array_elements_text(p_answer));
  end if;
  return false;
exception when others then
  return false;
end;
$$;

create or replace function private.sigec_application_matches_audience(
  p_application_id uuid,
  p_audience text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with flags as (
    select
      coalesce(bool_or((question.config ->> 'audienceMarker') = 'pcd' and answer.answer = 'true'::jsonb), false) as pcd,
      coalesce(bool_or((question.config ->> 'audienceMarker') = 'ppp' and answer.answer = 'true'::jsonb), false) as ppp
    from public.sigec_application_answers answer
    join public.sigec_process_questions question on question.id = answer.question_id
    where answer.application_id = p_application_id
  )
  select case p_audience
    when 'all' then true
    when 'pcd' then flags.pcd
    when 'ppp' then flags.ppp
    when 'pcd_or_ppp' then flags.pcd or flags.ppp
    else false
  end
  from flags;
$$;

create or replace function private.sigec_replace_application_answers_impl(
  p_application_id uuid,
  p_answers jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target record;
  answer_row record;
  answer_count integer := 0;
  is_pcd boolean := false;
  is_ppp boolean := false;
  applies boolean;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_ANSWERS_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answers)) > 200 then
    raise exception 'SIGEC_ANSWERS_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  select application.candidate_id, application.application_state, application.process_id,
         process.status, process.applications_close_at
    into target
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = p_application_id
  for update of application;

  if not found or target.candidate_id <> actor_id then
    raise exception 'SIGEC_ANSWERS_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;
  if target.application_state <> 'draft' then
    raise exception 'SIGEC_ANSWERS_APPLICATION_LOCKED' using errcode = '23514';
  end if;
  if target.status <> 'open' or (target.applications_close_at is not null and target.applications_close_at <= now()) then
    raise exception 'SIGEC_ANSWERS_PROCESS_CLOSED' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_answers) key where key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'SIGEC_ANSWERS_QUESTION_INVALID' using errcode = '23503';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_answers) key
    left join public.sigec_process_questions question on question.id = key::uuid and question.process_id = target.process_id
    where question.id is null
  ) then
    raise exception 'SIGEC_ANSWERS_QUESTION_INVALID' using errcode = '23503';
  end if;

  select
    coalesce(bool_or((question.config ->> 'audienceMarker') = 'pcd' and value.answer = 'true'::jsonb), false),
    coalesce(bool_or((question.config ->> 'audienceMarker') = 'ppp' and value.answer = 'true'::jsonb), false)
  into is_pcd, is_ppp
  from jsonb_each(p_answers) value(question_id, answer)
  join public.sigec_process_questions question
    on question.id = value.question_id::uuid and question.process_id = target.process_id;

  for answer_row in
    select question.id, question.question_type, question.required, question.config,
           value.answer, coalesce(question.config ->> 'audience', 'all') as audience
    from public.sigec_process_questions question
    left join jsonb_each(p_answers) value on value.question_id::uuid = question.id
    where question.process_id = target.process_id
    order by question.position, question.id
  loop
    applies := answer_row.audience = 'all'
      or (answer_row.audience = 'pcd' and is_pcd)
      or (answer_row.audience = 'ppp' and is_ppp)
      or (answer_row.audience = 'pcd_or_ppp' and (is_pcd or is_ppp));
    if applies and answer_row.required and not private.sigec_answer_matches_question(answer_row.answer, answer_row.question_type, answer_row.config) then
      raise exception 'SIGEC_ANSWERS_REQUIRED_OR_INVALID' using errcode = '23514';
    end if;
    if applies and answer_row.answer is not null then
      if not private.sigec_answer_matches_question(answer_row.answer, answer_row.question_type, answer_row.config) then
        raise exception 'SIGEC_ANSWERS_REQUIRED_OR_INVALID' using errcode = '23514';
      end if;
      answer_count := answer_count + 1;
    elsif not applies and answer_row.answer is not null then
      raise exception 'SIGEC_ANSWERS_HIDDEN_QUESTION' using errcode = '42501';
    end if;
  end loop;

  delete from public.sigec_application_answers where application_id = p_application_id;
  insert into public.sigec_application_answers(application_id, question_id, answer)
  select p_application_id, value.question_id::uuid, value.answer
  from jsonb_each(p_answers) value(question_id, answer);

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (actor_id, 'candidato', 'application_answers_updated', 'application', p_application_id::text,
    jsonb_build_object('answer_count', answer_count));
  return answer_count;
end;
$$;

create or replace function public.sigec_replace_application_answers(
  p_application_id uuid,
  p_answers jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.sigec_replace_application_answers_impl(p_application_id, p_answers);
$$;

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
  if target_application.application_state not in ('draft', 'submitted') then
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

  insert into public.sigec_application_documents (
    application_id, requirement_id, storage_path, original_name, mime_type,
    size_bytes, sha256, version, technical_status, malware_status,
    sanitized_at, supersedes_document_id
  ) values (
    p_application_id, p_requirement_id, p_storage_path, trim(p_original_name), p_mime_type,
    p_size_bytes, p_sha256, next_version, 'validated', 'pending', now(), previous_id
  ) returning id into inserted_id;

  insert into public.sigec_audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'candidato', 'candidate_document_uploaded', 'application_document', inserted_id::text,
    jsonb_build_object('application_id', p_application_id, 'requirement_id', p_requirement_id,
      'version', next_version, 'mime_type', p_mime_type, 'size_bytes', p_size_bytes,
      'technical_status', 'validated', 'malware_status', 'pending'));
  return query select inserted_id, next_version;
end;
$$;

revoke insert, update, delete on public.sigec_application_answers from authenticated;
revoke all on function private.sigec_answer_matches_question(jsonb,text,jsonb) from public, anon;
revoke all on function private.sigec_application_matches_audience(uuid,text) from public, anon;
revoke all on function private.sigec_replace_application_answers_impl(uuid,jsonb) from public, anon;
grant execute on function private.sigec_answer_matches_question(jsonb,text,jsonb) to authenticated, service_role;
grant execute on function private.sigec_application_matches_audience(uuid,text) to authenticated, service_role;
grant execute on function private.sigec_replace_application_answers_impl(uuid,jsonb) to authenticated;
revoke all on function public.sigec_replace_application_answers(uuid,jsonb) from public, anon;
grant execute on function public.sigec_replace_application_answers(uuid,jsonb) to authenticated;

comment on function public.sigec_replace_application_answers(uuid,jsonb) is
  'Security-invoker Data API wrapper that atomically validates and replaces conditional answers for an owned draft.';

commit;
