begin;

create or replace function private.sigec_replace_application_preferences_impl(
  p_application_id uuid,
  p_vacancy_ids uuid[]
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
  preference_count integer := coalesce(cardinality(p_vacancy_ids), 0);
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_PREFERENCES_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;

  select application.candidate_id, application.application_state, application.process_id,
         process.max_preferences, process.status, process.applications_close_at
    into target
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = p_application_id
  for update of application;

  if not found or target.candidate_id <> actor_id then
    raise exception 'SIGEC_PREFERENCES_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;
  if target.application_state <> 'draft' then
    raise exception 'SIGEC_PREFERENCES_APPLICATION_LOCKED' using errcode = '23514';
  end if;
  if target.status <> 'open' or (target.applications_close_at is not null and target.applications_close_at <= now()) then
    raise exception 'SIGEC_PREFERENCES_PROCESS_CLOSED' using errcode = '23514';
  end if;
  if preference_count < 1 or preference_count > target.max_preferences then
    raise exception 'SIGEC_PREFERENCES_LIMIT' using errcode = '23514';
  end if;
  if (select count(distinct vacancy_id) from unnest(p_vacancy_ids) vacancy_id) <> preference_count then
    raise exception 'SIGEC_PREFERENCES_DUPLICATE' using errcode = '23514';
  end if;
  if (select count(*) from public.sigec_vacancies vacancy
      where vacancy.id = any(p_vacancy_ids) and vacancy.process_id = target.process_id and vacancy.active) <> preference_count then
    raise exception 'SIGEC_PREFERENCES_VACANCY_INVALID' using errcode = '23514';
  end if;

  delete from public.sigec_application_preferences where application_id = p_application_id;
  insert into public.sigec_application_preferences(application_id, vacancy_id, position)
  select p_application_id, ordered.vacancy_id, ordered.position::smallint
  from unnest(p_vacancy_ids) with ordinality ordered(vacancy_id, position);

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (actor_id, 'candidato', 'application_preferences_updated', 'application', p_application_id::text,
    jsonb_build_object('preference_count', preference_count));
  return preference_count;
end;
$$;

create or replace function public.sigec_replace_application_preferences(
  p_application_id uuid,
  p_vacancy_ids uuid[]
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.sigec_replace_application_preferences_impl(p_application_id, p_vacancy_ids);
$$;

revoke insert, update, delete on public.sigec_application_preferences from authenticated;
revoke all on function private.sigec_replace_application_preferences_impl(uuid, uuid[]) from public, anon;
grant execute on function private.sigec_replace_application_preferences_impl(uuid, uuid[]) to authenticated;
revoke all on function public.sigec_replace_application_preferences(uuid, uuid[]) from public, anon;
grant execute on function public.sigec_replace_application_preferences(uuid, uuid[]) to authenticated;

comment on function public.sigec_replace_application_preferences(uuid, uuid[]) is
  'Security-invoker Data API wrapper that atomically replaces an owned draft preference order.';

commit;
