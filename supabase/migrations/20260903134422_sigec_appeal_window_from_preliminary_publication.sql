begin;

create table public.sigec_appeal_windows (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete restrict,
  publication_id uuid not null unique references public.sigec_ranking_snapshot_publications(id) on delete restrict,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  created_at timestamptz not null default now(),
  check (closes_at = opens_at + interval '24 hours')
);

create index sigec_appeal_windows_process_idx on public.sigec_appeal_windows(process_id, created_at desc);

alter table public.sigec_appeals
  add column appeal_window_id uuid references public.sigec_appeal_windows(id) on delete restrict;
create index sigec_appeals_window_idx on public.sigec_appeals(appeal_window_id) where appeal_window_id is not null;

alter table public.sigec_appeal_windows enable row level security;
revoke all on public.sigec_appeal_windows from public, anon, authenticated;
grant select, insert on public.sigec_appeal_windows to service_role;

create or replace function private.sigec_reject_appeal_window_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'SIGEC_APPEAL_WINDOW_IMMUTABLE' using errcode = '55000'; end;
$$;

create trigger sigec_appeal_windows_immutable
before update or delete on public.sigec_appeal_windows
for each row execute function private.sigec_reject_appeal_window_mutation();

create or replace function private.sigec_schedule_appeal_window()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_snapshot record;
  window_id uuid;
  local_midnight timestamp;
begin
  select snapshot.process_id, snapshot.phase into target_snapshot
  from public.sigec_ranking_snapshots snapshot where snapshot.id = new.snapshot_id;
  if target_snapshot.phase <> 'preliminary' then return new; end if;

  local_midnight := date_trunc('day', new.published_at at time zone 'America/Sao_Paulo') + interval '1 day';
  insert into public.sigec_appeal_windows(process_id, publication_id, opens_at, closes_at)
  values (
    target_snapshot.process_id,
    new.id,
    local_midnight at time zone 'America/Sao_Paulo',
    (local_midnight + interval '24 hours') at time zone 'America/Sao_Paulo'
  ) returning id into window_id;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    new.published_by,
    coalesce((select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = new.published_by), 'system'),
    'appeal_window_scheduled',
    'sigec_appeal_window',
    window_id::text,
    jsonb_build_object('publicationId', new.id, 'timezone', 'America/Sao_Paulo')
  );
  return new;
end;
$$;

create trigger sigec_publication_schedule_appeal_window
after insert on public.sigec_ranking_snapshot_publications
for each row execute function private.sigec_schedule_appeal_window();

create or replace function private.sigec_enforce_appeal_window()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  target_process_id uuid;
  current_window public.sigec_appeal_windows;
  current_time timestamptz := statement_timestamp();
begin
  select application.process_id into target_process_id
  from public.sigec_applications application where application.id = new.application_id;

  select appeal_window.* into current_window
  from public.sigec_appeal_windows appeal_window
  where appeal_window.process_id = target_process_id
    and current_time >= appeal_window.opens_at
    and current_time < appeal_window.closes_at
  order by appeal_window.created_at desc, appeal_window.id desc
  limit 1;

  if current_window.id is null then
    raise exception 'SIGEC_APPEAL_WINDOW_CLOSED' using errcode = '55000';
  end if;
  new.appeal_window_id := current_window.id;
  new.submitted_at := current_time;
  return new;
end;
$$;

create trigger sigec_appeals_enforce_window
before insert on public.sigec_appeals
for each row execute function private.sigec_enforce_appeal_window();

revoke all on function private.sigec_reject_appeal_window_mutation() from public, anon, authenticated;
revoke all on function private.sigec_schedule_appeal_window() from public, anon, authenticated;
revoke all on function private.sigec_enforce_appeal_window() from public, anon, authenticated;

comment on table public.sigec_appeal_windows is
  'Immutable 24-hour appeal windows starting at 00:00 America/Sao_Paulo on the day after each preliminary result publication.';

commit;
