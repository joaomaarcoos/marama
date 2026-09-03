begin;

create or replace function private.sigec_validate_snapshot_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_snapshot public.sigec_ranking_snapshots;
begin
  if auth.uid() is not null then
    if new.approver_id is distinct from auth.uid() then
      raise exception 'SIGEC_APPROVER_MISMATCH' using errcode = '42501';
    end if;
    if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'gerente') then
      raise exception 'SIGEC_RANKING_REVIEWER_REQUIRED' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from auth.users staff where staff.id = new.approver_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_RANKING_REVIEWER_REQUIRED' using errcode = '42501';
  end if;

  select snapshot.* into target_snapshot from public.sigec_ranking_snapshots snapshot
  where snapshot.id = new.snapshot_id and snapshot.state = 'frozen' and snapshot.phase <> 'simulation';
  if target_snapshot.id is null then
    raise exception 'SIGEC_OFFICIAL_FROZEN_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;
  if exists (select 1 from public.sigec_ranking_snapshot_publications publication where publication.snapshot_id = new.snapshot_id) then
    raise exception 'SIGEC_RANKING_ALREADY_PUBLISHED' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.sigec_ranking_snapshots newer
    where newer.process_id = target_snapshot.process_id and newer.phase = target_snapshot.phase
      and newer.state = 'frozen' and newer.version > target_snapshot.version
  ) then
    raise exception 'SIGEC_LATEST_RANKING_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.sigec_validate_snapshot_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  target_snapshot public.sigec_ranking_snapshots;
  previous_publication record;
begin
  if auth.uid() is not null then
    if new.published_by is distinct from auth.uid() then
      raise exception 'SIGEC_PUBLISHER_MISMATCH' using errcode = '42501';
    end if;
    if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'gerente') then
      raise exception 'SIGEC_RANKING_PUBLISHER_REQUIRED' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from auth.users staff where staff.id = new.published_by
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_RANKING_PUBLISHER_REQUIRED' using errcode = '42501';
  end if;

  select snapshot.* into target_snapshot from public.sigec_ranking_snapshots snapshot
  where snapshot.id = new.snapshot_id and snapshot.state = 'frozen' and snapshot.phase <> 'simulation';
  if target_snapshot.id is null then
    raise exception 'SIGEC_OFFICIAL_FROZEN_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;
  if not private.sigec_official_rules_are_confirmed(target_snapshot.process_id) then
    raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
  end if;
  if not private.sigec_decision_evidence_is_current(target_snapshot.process_id, target_snapshot.source_decision_ids)
    or not private.sigec_quota_rule_is_current(target_snapshot.process_id, target_snapshot.quota_rule_version_id, target_snapshot.source_decision_ids)
  then
    raise exception 'SIGEC_CURRENT_RANKING_EVIDENCE_REQUIRED' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.sigec_ranking_snapshots newer
    where newer.process_id = target_snapshot.process_id and newer.phase = target_snapshot.phase
      and newer.state = 'frozen' and newer.version > target_snapshot.version
  ) then
    raise exception 'SIGEC_LATEST_RANKING_SNAPSHOT_REQUIRED' using errcode = '55000';
  end if;
  if (
    select count(distinct approval.approver_id)
    from public.sigec_ranking_snapshot_approvals approval
    join auth.users reviewer on reviewer.id = approval.approver_id
    where approval.snapshot_id = new.snapshot_id
      and reviewer.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) < 2 then
    raise exception 'SIGEC_TWO_PERSON_APPROVAL_REQUIRED' using errcode = '55000';
  end if;

  select publication.id, snapshot.version into previous_publication
  from public.sigec_ranking_snapshot_publications publication
  join public.sigec_ranking_snapshots snapshot on snapshot.id = publication.snapshot_id
  where snapshot.process_id = target_snapshot.process_id and snapshot.phase = target_snapshot.phase
  order by publication.published_at desc, publication.id desc limit 1;
  if previous_publication.id is null then
    if new.supersedes_publication_id is not null then
      raise exception 'SIGEC_FIRST_PUBLICATION_CANNOT_SUPERSEDE' using errcode = '23514';
    end if;
  elsif new.supersedes_publication_id is distinct from previous_publication.id
    or target_snapshot.version <= previous_publication.version then
    raise exception 'SIGEC_PUBLICATION_REPLACEMENT_CHAIN_REQUIRED' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_validate_snapshot_approval() from public, anon, authenticated;
revoke all on function private.sigec_validate_snapshot_publication() from public, anon, authenticated;

commit;
