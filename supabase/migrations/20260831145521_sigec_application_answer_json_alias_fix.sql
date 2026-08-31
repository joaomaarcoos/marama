begin;

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
    coalesce(bool_or((question.config ->> 'audienceMarker') = 'pcd' and supplied.answer = 'true'::jsonb), false),
    coalesce(bool_or((question.config ->> 'audienceMarker') = 'ppp' and supplied.answer = 'true'::jsonb), false)
  into is_pcd, is_ppp
  from jsonb_each(p_answers) supplied(question_id, answer)
  join public.sigec_process_questions question
    on question.id = supplied.question_id::uuid and question.process_id = target.process_id;

  for answer_row in
    select question.id, question.question_type, question.required, question.config,
           supplied.answer, coalesce(question.config ->> 'audience', 'all') as audience
    from public.sigec_process_questions question
    left join jsonb_each(p_answers) supplied(question_id, answer)
      on supplied.question_id::uuid = question.id
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
  select p_application_id, supplied.question_id::uuid, supplied.answer
  from jsonb_each(p_answers) supplied(question_id, answer);

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (actor_id, 'candidato', 'application_answers_updated', 'application', p_application_id::text,
    jsonb_build_object('answer_count', answer_count));
  return answer_count;
end;
$$;

commit;
