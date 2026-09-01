begin;

alter table public.sigec_information_requests
  add column closed_by uuid references auth.users(id) on delete set null,
  add column resolution_message text,
  add constraint sigec_information_request_resolution_message_check
    check (resolution_message is null or char_length(trim(resolution_message)) between 3 and 2000),
  add constraint sigec_information_request_lifecycle_check check (
    (status = 'open' and answered_at is null and closed_at is null and closed_by is null)
    or (status = 'answered' and answered_at is not null and closed_at is null and closed_by is null)
    or (status = 'accepted' and answered_at is not null and closed_at is not null and closed_by is not null)
    or (status = 'canceled' and closed_at is not null and closed_by is not null)
  );

create index sigec_information_requests_closed_by_idx
  on public.sigec_information_requests(closed_by)
  where closed_by is not null;

create unique index sigec_information_requests_one_active_idx
  on public.sigec_information_requests(application_id)
  where status in ('open', 'answered');

revoke insert, update, delete on public.sigec_information_requests
  from public, anon, authenticated;

create or replace function public.sigec_create_information_request(
  p_actor_id uuid,
  p_application_id uuid,
  p_message text,
  p_requested_fields jsonb,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_id uuid;
  normalized_message text := trim(coalesce(p_message, ''));
  target record;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null
    or char_length(normalized_message) not between 3 and 5000
    or jsonb_typeof(p_requested_fields) <> 'array'
    or jsonb_array_length(p_requested_fields) not between 1 and 50
    or p_due_at is null
    or p_due_at <= clock_timestamp()
    or p_due_at > clock_timestamp() + interval '365 days' then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_INPUT_INVALID' using errcode = '22023';
  end if;

  select application.application_state into target
  from public.sigec_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.application_state <> 'submitted' or not exists (
    select 1 from public.sigec_application_submissions submission
    where submission.application_id = p_application_id
  ) then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_SUBMISSION_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.sigec_information_requests request
    where request.application_id = p_application_id
      and request.status in ('open', 'answered')
  ) then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_ACTIVE_EXISTS' using errcode = '23505';
  end if;

  insert into public.sigec_information_requests(
    application_id, message, requested_fields, due_at, requested_by
  ) values (
    p_application_id, normalized_message, p_requested_fields, p_due_at, p_actor_id
  ) returning id into request_id;

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id, 'staff', 'information_request_created', 'information_request', request_id::text,
    jsonb_build_object(
      'applicationId', p_application_id,
      'requestedCount', jsonb_array_length(p_requested_fields),
      'questionCount', (select count(*) from jsonb_array_elements(p_requested_fields) field where field ->> 'kind' = 'question'),
      'documentCount', (select count(*) from jsonb_array_elements(p_requested_fields) field where field ->> 'kind' = 'document'),
      'dueAt', p_due_at
    )
  );

  return request_id;
end;
$$;

create or replace function public.sigec_close_information_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_action text,
  p_resolution_message text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.sigec_information_requests%rowtype;
  normalized_message text := trim(coalesce(p_resolution_message, ''));
  event_time timestamptz := clock_timestamp();
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null
    or p_action not in ('accepted', 'canceled')
    or char_length(normalized_message) not between 3 and 2000 then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_INPUT_INVALID' using errcode = '22023';
  end if;

  select request.* into target
  from public.sigec_information_requests request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.status not in ('open', 'answered') then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_ALREADY_CLOSED' using errcode = '23514';
  end if;
  if p_action = 'accepted' and target.status <> 'answered' then
    raise exception 'SIGEC_DILIGENCE_MANAGEMENT_ANSWER_REQUIRED' using errcode = '23514';
  end if;

  update public.sigec_information_requests request
  set status = p_action,
      closed_at = event_time,
      closed_by = p_actor_id,
      resolution_message = normalized_message,
      updated_at = event_time
  where request.id = target.id;

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id, 'staff',
    case when p_action = 'accepted' then 'information_request_accepted' else 'information_request_canceled' end,
    'information_request', target.id::text,
    jsonb_build_object(
      'applicationId', target.application_id,
      'previousStatus', target.status,
      'newStatus', p_action,
      'hasResolutionMessage', true
    )
  );

  return p_action;
end;
$$;

revoke all on function public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamptz)
  to service_role;
revoke all on function public.sigec_close_information_request(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.sigec_close_information_request(uuid,uuid,text,text)
  to service_role;

comment on function public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamptz) is
  'Server-only creation of one bounded, process-scoped diligence for a submitted SIGEC application.';
comment on function public.sigec_close_information_request(uuid,uuid,text,text) is
  'Server-only acceptance or cancellation of a SIGEC diligence with an auditable public resolution.';

commit;
