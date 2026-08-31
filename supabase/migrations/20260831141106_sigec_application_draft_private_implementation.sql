begin;

create or replace function private.sigec_create_application_draft_impl(p_process_id uuid)
returns table(application_id uuid, application_state text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target_id uuid;
  target_state text;
  was_created boolean := false;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_APPLICATION_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || p_process_id::text, 0));

  if not exists (
    select 1 from public.sigec_candidate_profiles profile
    where profile.user_id = actor_id
      and profile.profile_completed_at is not null
      and profile.whatsapp_verified_at is not null
  ) then
    raise exception 'SIGEC_APPLICATION_PROFILE_INCOMPLETE' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.sigec_processes process
    where process.id = p_process_id
      and process.status = 'open'
      and process.published_at is not null
      and process.published_at <= now()
      and (process.applications_open_at is null or process.applications_open_at <= now())
      and (process.applications_close_at is null or process.applications_close_at > now())
  ) then
    raise exception 'SIGEC_APPLICATION_PROCESS_UNAVAILABLE' using errcode = '23514';
  end if;

  insert into public.sigec_applications(process_id, candidate_id, application_state)
  values (p_process_id, actor_id, 'draft')
  on conflict (process_id, candidate_id) do nothing
  returning id, sigec_applications.application_state into target_id, target_state;

  if target_id is not null then
    was_created := true;
    insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (actor_id, 'candidato', 'application_draft_created', 'application', target_id::text,
      jsonb_build_object('process_id', p_process_id));
  else
    select application.id, application.application_state into target_id, target_state
    from public.sigec_applications application
    where application.process_id = p_process_id and application.candidate_id = actor_id;
  end if;

  return query select target_id, target_state, was_created;
end;
$$;

create or replace function public.sigec_create_application_draft(p_process_id uuid)
returns table(application_id uuid, application_state text, created boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.sigec_create_application_draft_impl(p_process_id);
$$;

revoke all on function private.sigec_create_application_draft_impl(uuid) from public, anon;
grant execute on function private.sigec_create_application_draft_impl(uuid) to authenticated;
revoke all on function public.sigec_create_application_draft(uuid) from public, anon;
grant execute on function public.sigec_create_application_draft(uuid) to authenticated;

comment on function private.sigec_create_application_draft_impl(uuid) is
  'Non-exposed privileged implementation for idempotent candidate draft creation.';
comment on function public.sigec_create_application_draft(uuid) is
  'Security-invoker Data API wrapper for the private candidate draft implementation.';

commit;
