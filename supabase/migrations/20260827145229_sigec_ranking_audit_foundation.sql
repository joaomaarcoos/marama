-- SIGEC P0-06: versioned normative decisions and immutable ranking evidence.
-- Official ranking remains blocked until all normative decisions are confirmed.

create table public.sigec_process_decisions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^SIGEC-DEC-[0-9]{2}$'),
  revision smallint not null check (revision > 0),
  title text not null check (char_length(trim(title)) between 3 and 240),
  status text not null check (status in ('pending', 'confirmed', 'rejected')),
  resolution text,
  source_type text not null check (
    source_type in ('sigdoc', 'product_decision', 'edital', 'retification', 'official_guidance')
  ),
  source_reference text not null check (char_length(trim(source_reference)) between 3 and 1000),
  source_version text,
  impact text not null check (char_length(trim(impact)) between 3 and 2000),
  supersedes_id uuid unique references public.sigec_process_decisions(id),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (process_id, code, revision),
  check (supersedes_id is null or supersedes_id <> id),
  check (
    (status = 'pending' and resolution is null)
    or (status in ('confirmed', 'rejected') and char_length(trim(resolution)) between 3 and 10000)
  )
);

create table public.sigec_quota_rule_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  version smallint not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  source_decision_ids uuid[] not null default '{}'::uuid[],
  source_reference text not null check (char_length(trim(source_reference)) between 3 and 1000),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (process_id, version),
  check (status = 'draft' or cardinality(source_decision_ids) > 0)
);

create table public.sigec_ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  phase text not null check (phase in ('simulation', 'preliminary', 'final')),
  version integer not null check (version > 0),
  state text not null default 'building' check (state in ('building', 'frozen')),
  algorithm_version text not null check (char_length(trim(algorithm_version)) between 1 and 120),
  ruleset_version text not null check (char_length(trim(ruleset_version)) between 1 and 120),
  ranking_scope jsonb not null check (jsonb_typeof(ranking_scope) = 'object'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  source_decision_ids uuid[] not null default '{}'::uuid[],
  quota_rule_version_id uuid references public.sigec_quota_rule_versions(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  frozen_by uuid references auth.users(id),
  frozen_at timestamptz,
  row_count integer check (row_count is null or row_count > 0),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  unique (process_id, phase, version),
  check (
    (state = 'building' and frozen_by is null and frozen_at is null and row_count is null and content_hash is null)
    or
    (state = 'frozen' and frozen_by is not null and frozen_at is not null and row_count > 0 and content_hash is not null)
  )
);

create table public.sigec_ranking_snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.sigec_ranking_snapshots(id) on delete restrict,
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  vacancy_id uuid references public.sigec_vacancies(id) on delete restrict,
  list_type text not null check (list_type in ('general', 'pcd', 'ppp')),
  position integer check (position is null or position > 0),
  classification_status text not null check (
    classification_status in ('habilitado', 'classificado', 'desclassificado')
  ),
  score_total numeric(8,2) not null check (score_total >= 0),
  score_breakdown jsonb not null check (jsonb_typeof(score_breakdown) = 'object'),
  tie_break_values jsonb not null check (jsonb_typeof(tie_break_values) = 'array'),
  explanation jsonb not null check (jsonb_typeof(explanation) = 'object'),
  public_explanation text not null check (char_length(trim(public_explanation)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique nulls not distinct (snapshot_id, application_id, vacancy_id, list_type),
  check (
    (classification_status = 'desclassificado' and position is null)
    or (classification_status <> 'desclassificado' and position is not null)
  )
);

create table public.sigec_ranking_snapshot_approvals (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.sigec_ranking_snapshots(id) on delete restrict,
  approver_id uuid not null references auth.users(id),
  statement text not null check (char_length(trim(statement)) between 10 and 2000),
  approved_at timestamptz not null default now(),
  unique (snapshot_id, approver_id)
);

create table public.sigec_ranking_snapshot_publications (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.sigec_ranking_snapshots(id) on delete restrict,
  public_label text not null check (char_length(trim(public_label)) between 3 and 240),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);

create index sigec_decisions_process_code_idx
  on public.sigec_process_decisions(process_id, code, revision desc);
create index sigec_decisions_recorded_by_idx on public.sigec_process_decisions(recorded_by);
create index sigec_quota_rules_process_idx
  on public.sigec_quota_rule_versions(process_id, version desc);
create index sigec_quota_rules_recorded_by_idx on public.sigec_quota_rule_versions(recorded_by);
create index sigec_snapshots_process_phase_idx
  on public.sigec_ranking_snapshots(process_id, phase, version desc);
create index sigec_snapshots_quota_rule_idx on public.sigec_ranking_snapshots(quota_rule_version_id);
create index sigec_snapshots_created_by_idx on public.sigec_ranking_snapshots(created_by);
create index sigec_snapshots_frozen_by_idx on public.sigec_ranking_snapshots(frozen_by);
create index sigec_snapshot_entries_snapshot_position_idx
  on public.sigec_ranking_snapshot_entries(snapshot_id, list_type, position);
create index sigec_snapshot_entries_application_idx
  on public.sigec_ranking_snapshot_entries(application_id);
create index sigec_snapshot_entries_vacancy_idx
  on public.sigec_ranking_snapshot_entries(vacancy_id);
create index sigec_snapshot_approvals_snapshot_idx
  on public.sigec_ranking_snapshot_approvals(snapshot_id);
create index sigec_snapshot_approvals_approver_idx
  on public.sigec_ranking_snapshot_approvals(approver_id);
create index sigec_snapshot_publications_published_by_idx
  on public.sigec_ranking_snapshot_publications(published_by);

create or replace function private.sigec_reject_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SIGEC_IMMUTABLE_RECORD' using errcode = '55000';
end;
$$;

create or replace function private.sigec_validate_decision_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.sigec_process_decisions;
begin
  if new.revision = 1 then
    if new.supersedes_id is not null then
      raise exception 'SIGEC_FIRST_DECISION_CANNOT_SUPERSEDE' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_id is null then
    raise exception 'SIGEC_DECISION_REVISION_REQUIRES_PREDECESSOR' using errcode = '23514';
  end if;

  select * into previous
  from public.sigec_process_decisions decision
  where decision.id = new.supersedes_id;

  if previous.id is null
    or previous.process_id <> new.process_id
    or previous.code <> new.code
    or previous.revision <> new.revision - 1
  then
    raise exception 'SIGEC_INVALID_DECISION_REVISION_CHAIN' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.sigec_process_decisions decision
    where decision.process_id = new.process_id
      and decision.code = new.code
      and decision.revision >= new.revision
  ) then
    raise exception 'SIGEC_DECISION_REVISION_NOT_LATEST' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.sigec_official_rules_are_confirmed(target_process_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with required(code) as (
    select unnest(array[
      'SIGEC-DEC-01', 'SIGEC-DEC-02', 'SIGEC-DEC-03',
      'SIGEC-DEC-04', 'SIGEC-DEC-05', 'SIGEC-DEC-06'
    ]::text[])
  ), latest as (
    select distinct on (decision.code) decision.code, decision.status
    from public.sigec_process_decisions decision
    where decision.process_id = target_process_id
    order by decision.code, decision.revision desc
  )
  select count(*) = 6 and bool_and(latest.status = 'confirmed')
  from required
  left join latest using (code)
  where latest.code is not null;
$$;

create or replace function private.sigec_validate_quota_rule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'confirmed'
    and not private.sigec_official_rules_are_confirmed(new.process_id)
  then
    raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.sigec_validate_snapshot_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snapshot_process_id uuid;
  snapshot_state text;
begin
  select snapshot.process_id, snapshot.state
    into snapshot_process_id, snapshot_state
  from public.sigec_ranking_snapshots snapshot
  where snapshot.id = new.snapshot_id;

  if snapshot_state <> 'building' then
    raise exception 'SIGEC_FROZEN_SNAPSHOT' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.sigec_applications application
    where application.id = new.application_id
      and application.process_id = snapshot_process_id
  ) then
    raise exception 'SIGEC_APPLICATION_OUTSIDE_SNAPSHOT_PROCESS' using errcode = '23514';
  end if;

  if new.vacancy_id is not null and not exists (
    select 1 from public.sigec_vacancies vacancy
    where vacancy.id = new.vacancy_id
      and vacancy.process_id = snapshot_process_id
  ) then
    raise exception 'SIGEC_VACANCY_OUTSIDE_SNAPSHOT_PROCESS' using errcode = '23514';
  end if;

  if jsonb_array_length(new.tie_break_values) = 0
    or not (new.explanation ? 'ordered_rules')
    or not (new.explanation ? 'decisive_rule')
  then
    raise exception 'SIGEC_INCOMPLETE_TIE_BREAK_EXPLANATION' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.sigec_guard_snapshot_entry_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sigec_ranking_snapshots snapshot
    where snapshot.id = old.snapshot_id and snapshot.state = 'frozen'
  ) then
    raise exception 'SIGEC_FROZEN_SNAPSHOT' using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.sigec_guard_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actual_rows integer;
begin
  if old.state = 'frozen' then
    raise exception 'SIGEC_FROZEN_SNAPSHOT' using errcode = '55000';
  end if;

  if row(
    new.process_id, new.phase, new.version, new.algorithm_version, new.ruleset_version,
    new.ranking_scope, new.input_hash, new.source_decision_ids, new.quota_rule_version_id,
    new.created_by, new.created_at
  ) is distinct from row(
    old.process_id, old.phase, old.version, old.algorithm_version, old.ruleset_version,
    old.ranking_scope, old.input_hash, old.source_decision_ids, old.quota_rule_version_id,
    old.created_by, old.created_at
  ) then
    raise exception 'SIGEC_SNAPSHOT_METADATA_IMMUTABLE' using errcode = '55000';
  end if;

  if new.state <> 'frozen' then
    raise exception 'SIGEC_INVALID_SNAPSHOT_TRANSITION' using errcode = '55000';
  end if;

  if new.frozen_by is distinct from auth.uid() then
    raise exception 'SIGEC_SNAPSHOT_FREEZER_MISMATCH' using errcode = '42501';
  end if;

  select count(*) into actual_rows
  from public.sigec_ranking_snapshot_entries entry
  where entry.snapshot_id = old.id;

  if actual_rows = 0 or new.row_count <> actual_rows then
    raise exception 'SIGEC_SNAPSHOT_ROW_COUNT_MISMATCH' using errcode = '23514';
  end if;

  if new.content_hash is null or new.frozen_at is null then
    raise exception 'SIGEC_SNAPSHOT_FREEZE_EVIDENCE_REQUIRED' using errcode = '23514';
  end if;

  if new.phase <> 'simulation'
    and not private.sigec_official_rules_are_confirmed(new.process_id)
  then
    raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
  end if;

  if new.phase <> 'simulation' and (
    cardinality(new.source_decision_ids) <> 6
    or exists (
      select 1
      from (
        select distinct on (decision.code) decision.id, decision.code
        from public.sigec_process_decisions decision
        where decision.process_id = new.process_id
        order by decision.code, decision.revision desc
      ) latest
      where latest.code = any(array[
        'SIGEC-DEC-01', 'SIGEC-DEC-02', 'SIGEC-DEC-03',
        'SIGEC-DEC-04', 'SIGEC-DEC-05', 'SIGEC-DEC-06'
      ]::text[])
        and not (latest.id = any(new.source_decision_ids))
    )
  ) then
    raise exception 'SIGEC_SNAPSHOT_DECISION_EVIDENCE_STALE' using errcode = '55000';
  end if;

  if new.phase <> 'simulation' and not exists (
    select 1 from public.sigec_quota_rule_versions quota_rule
    where quota_rule.id = new.quota_rule_version_id
      and quota_rule.process_id = new.process_id
      and quota_rule.status = 'confirmed'
  ) then
    raise exception 'SIGEC_CONFIRMED_QUOTA_RULE_REQUIRED' using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function private.sigec_validate_snapshot_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.approver_id is distinct from auth.uid() then
    raise exception 'SIGEC_APPROVER_MISMATCH' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sigec_ranking_snapshots snapshot
    where snapshot.id = new.snapshot_id
      and snapshot.state = 'frozen'
      and snapshot.phase <> 'simulation'
  ) then
    raise exception 'SIGEC_OFFICIAL_FROZEN_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function private.sigec_validate_snapshot_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_process_id uuid;
begin
  if new.published_by is distinct from auth.uid() then
    raise exception 'SIGEC_PUBLISHER_MISMATCH' using errcode = '42501';
  end if;

  select snapshot.process_id into target_process_id
  from public.sigec_ranking_snapshots snapshot
  where snapshot.id = new.snapshot_id
    and snapshot.state = 'frozen'
    and snapshot.phase <> 'simulation';

  if target_process_id is null then
    raise exception 'SIGEC_OFFICIAL_FROZEN_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;

  if not private.sigec_official_rules_are_confirmed(target_process_id) then
    raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.sigec_ranking_snapshots snapshot
    where snapshot.id = new.snapshot_id
      and (
        cardinality(snapshot.source_decision_ids) <> 6
        or exists (
          select 1
          from (
            select distinct on (decision.code) decision.id, decision.code
            from public.sigec_process_decisions decision
            where decision.process_id = snapshot.process_id
            order by decision.code, decision.revision desc
          ) latest
          where latest.code = any(array[
            'SIGEC-DEC-01', 'SIGEC-DEC-02', 'SIGEC-DEC-03',
            'SIGEC-DEC-04', 'SIGEC-DEC-05', 'SIGEC-DEC-06'
          ]::text[])
            and not (latest.id = any(snapshot.source_decision_ids))
        )
      )
  ) then
    raise exception 'SIGEC_SNAPSHOT_DECISION_EVIDENCE_STALE' using errcode = '55000';
  end if;

  if (
    select count(distinct approval.approver_id)
    from public.sigec_ranking_snapshot_approvals approval
    where approval.snapshot_id = new.snapshot_id
  ) < 2 then
    raise exception 'SIGEC_TWO_PERSON_APPROVAL_REQUIRED' using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.sigec_reject_mutation() from public, anon, authenticated;
revoke all on function private.sigec_validate_decision_revision() from public, anon, authenticated;
revoke all on function private.sigec_official_rules_are_confirmed(uuid) from public, anon, authenticated;
revoke all on function private.sigec_validate_quota_rule_version() from public, anon, authenticated;
revoke all on function private.sigec_validate_snapshot_entry() from public, anon, authenticated;
revoke all on function private.sigec_guard_snapshot_entry_delete() from public, anon, authenticated;
revoke all on function private.sigec_guard_snapshot_mutation() from public, anon, authenticated;
revoke all on function private.sigec_validate_snapshot_approval() from public, anon, authenticated;
revoke all on function private.sigec_validate_snapshot_publication() from public, anon, authenticated;
grant execute on function private.sigec_official_rules_are_confirmed(uuid) to authenticated;

create trigger sigec_decisions_validate_revision
before insert on public.sigec_process_decisions
for each row execute function private.sigec_validate_decision_revision();
create trigger sigec_decisions_reject_update
before update on public.sigec_process_decisions
for each row execute function private.sigec_reject_mutation();
create trigger sigec_decisions_reject_delete
before delete on public.sigec_process_decisions
for each row execute function private.sigec_reject_mutation();

create trigger sigec_quota_rules_validate
before insert on public.sigec_quota_rule_versions
for each row execute function private.sigec_validate_quota_rule_version();
create trigger sigec_quota_rules_reject_update
before update on public.sigec_quota_rule_versions
for each row execute function private.sigec_reject_mutation();
create trigger sigec_quota_rules_reject_delete
before delete on public.sigec_quota_rule_versions
for each row execute function private.sigec_reject_mutation();

create trigger sigec_snapshots_guard_update
before update on public.sigec_ranking_snapshots
for each row execute function private.sigec_guard_snapshot_mutation();
create trigger sigec_snapshots_reject_delete
before delete on public.sigec_ranking_snapshots
for each row execute function private.sigec_reject_mutation();

create trigger sigec_snapshot_entries_validate_insert
before insert on public.sigec_ranking_snapshot_entries
for each row execute function private.sigec_validate_snapshot_entry();
create trigger sigec_snapshot_entries_validate_update
before update on public.sigec_ranking_snapshot_entries
for each row execute function private.sigec_validate_snapshot_entry();
create trigger sigec_snapshot_entries_reject_frozen_delete
before delete on public.sigec_ranking_snapshot_entries
for each row execute function private.sigec_guard_snapshot_entry_delete();

create trigger sigec_snapshot_approvals_validate
before insert on public.sigec_ranking_snapshot_approvals
for each row execute function private.sigec_validate_snapshot_approval();
create trigger sigec_snapshot_approvals_reject_update
before update on public.sigec_ranking_snapshot_approvals
for each row execute function private.sigec_reject_mutation();
create trigger sigec_snapshot_approvals_reject_delete
before delete on public.sigec_ranking_snapshot_approvals
for each row execute function private.sigec_reject_mutation();

create trigger sigec_snapshot_publications_validate
before insert on public.sigec_ranking_snapshot_publications
for each row execute function private.sigec_validate_snapshot_publication();
create trigger sigec_snapshot_publications_reject_update
before update on public.sigec_ranking_snapshot_publications
for each row execute function private.sigec_reject_mutation();
create trigger sigec_snapshot_publications_reject_delete
before delete on public.sigec_ranking_snapshot_publications
for each row execute function private.sigec_reject_mutation();

alter table public.sigec_process_decisions enable row level security;
alter table public.sigec_quota_rule_versions enable row level security;
alter table public.sigec_ranking_snapshots enable row level security;
alter table public.sigec_ranking_snapshot_entries enable row level security;
alter table public.sigec_ranking_snapshot_approvals enable row level security;
alter table public.sigec_ranking_snapshot_publications enable row level security;

revoke all on table public.sigec_process_decisions from anon, authenticated;
revoke all on table public.sigec_quota_rule_versions from anon, authenticated;
revoke all on table public.sigec_ranking_snapshots from anon, authenticated;
revoke all on table public.sigec_ranking_snapshot_entries from anon, authenticated;
revoke all on table public.sigec_ranking_snapshot_approvals from anon, authenticated;
revoke all on table public.sigec_ranking_snapshot_publications from anon, authenticated;

grant select, insert on public.sigec_process_decisions to authenticated;
grant select, insert on public.sigec_quota_rule_versions to authenticated;
grant select, insert, update on public.sigec_ranking_snapshots to authenticated;
grant select, insert, update, delete on public.sigec_ranking_snapshot_entries to authenticated;
grant select, insert on public.sigec_ranking_snapshot_approvals to authenticated;
grant select, insert on public.sigec_ranking_snapshot_publications to authenticated;

create policy sigec_decisions_staff_read on public.sigec_process_decisions
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_decisions_staff_insert on public.sigec_process_decisions
for insert to authenticated with check (
  (select private.sigec_is_staff()) and recorded_by = (select auth.uid())
);

create policy sigec_quota_rules_staff_read on public.sigec_quota_rule_versions
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_quota_rules_staff_insert on public.sigec_quota_rule_versions
for insert to authenticated with check (
  (select private.sigec_is_staff()) and recorded_by = (select auth.uid())
);

create policy sigec_snapshots_staff_read on public.sigec_ranking_snapshots
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_snapshots_staff_insert on public.sigec_ranking_snapshots
for insert to authenticated with check (
  (select private.sigec_is_staff()) and created_by = (select auth.uid()) and state = 'building'
);
create policy sigec_snapshots_staff_update on public.sigec_ranking_snapshots
for update to authenticated
using ((select private.sigec_is_staff()))
with check ((select private.sigec_is_staff()));

create policy sigec_snapshot_entries_staff_read on public.sigec_ranking_snapshot_entries
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_snapshot_entries_staff_insert on public.sigec_ranking_snapshot_entries
for insert to authenticated with check ((select private.sigec_is_staff()));
create policy sigec_snapshot_entries_staff_update on public.sigec_ranking_snapshot_entries
for update to authenticated
using ((select private.sigec_is_staff()))
with check ((select private.sigec_is_staff()));
create policy sigec_snapshot_entries_staff_delete on public.sigec_ranking_snapshot_entries
for delete to authenticated using ((select private.sigec_is_staff()));

create policy sigec_snapshot_approvals_staff_read on public.sigec_ranking_snapshot_approvals
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_snapshot_approvals_staff_insert on public.sigec_ranking_snapshot_approvals
for insert to authenticated with check (
  (select private.sigec_is_staff()) and approver_id = (select auth.uid())
);

create policy sigec_snapshot_publications_staff_read on public.sigec_ranking_snapshot_publications
for select to authenticated using ((select private.sigec_is_staff()));
create policy sigec_snapshot_publications_staff_insert on public.sigec_ranking_snapshot_publications
for insert to authenticated with check (
  (select private.sigec_is_staff()) and published_by = (select auth.uid())
);

comment on table public.sigec_process_decisions is
  'Append-only normative decision revisions. Latest revision is authoritative; history is never overwritten.';
comment on table public.sigec_quota_rule_versions is
  'Append-only quota configurations. Confirmed versions require all six normative decisions.';
comment on table public.sigec_ranking_snapshots is
  'Ranking calculation headers. Building rows may be frozen once; frozen rows are immutable.';
comment on table public.sigec_ranking_snapshot_entries is
  'Ranking evidence with ordered tie-break values and an auditable explanation per application.';
comment on table public.sigec_ranking_snapshot_approvals is
  'Independent append-only approvals. Two distinct approvers are required before publication.';
comment on table public.sigec_ranking_snapshot_publications is
  'Append-only publication record for a frozen, officially eligible ranking snapshot.';
