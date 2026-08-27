begin;

create or replace function private.sigec_can_apply_to_process(
  target_process_id uuid,
  target_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (select auth.uid()) = target_candidate_id
    and exists (
      select 1
      from public.sigec_processes process
      where process.id = target_process_id
        and process.status = 'open'
        and (process.applications_open_at is null or process.applications_open_at <= now())
        and (process.applications_close_at is null or process.applications_close_at > now())
    );
$$;

revoke all on function private.sigec_can_apply_to_process(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.sigec_can_apply_to_process(uuid, uuid) to authenticated;

drop policy sigec_applications_owner_insert on public.sigec_applications;
create policy sigec_applications_owner_insert
on public.sigec_applications for insert to authenticated
with check (
  (select auth.uid()) = candidate_id
  and exists (
    select 1
    from public.sigec_candidate_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.whatsapp_verified_at is not null
      and profile.profile_completed_at is not null
  )
  and (select private.sigec_can_apply_to_process(process_id, candidate_id))
);

commit;
