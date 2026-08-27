-- P0-06 follow-up: reject stale decision and quota evidence at every official gate.

create or replace function private.sigec_current_decision_ids(target_process_id uuid)
returns uuid[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(latest.id order by latest.code), '{}'::uuid[])
  from (
    select distinct on (decision.code) decision.id, decision.code, decision.status
    from public.sigec_process_decisions decision
    where decision.process_id = target_process_id
      and decision.code = any(array[
        'SIGEC-DEC-01', 'SIGEC-DEC-02', 'SIGEC-DEC-03',
        'SIGEC-DEC-04', 'SIGEC-DEC-05', 'SIGEC-DEC-06'
      ]::text[])
    order by decision.code, decision.revision desc
  ) latest
  where latest.status = 'confirmed';
$$;

create or replace function private.sigec_decision_evidence_is_current(
  target_process_id uuid,
  evidence_ids uuid[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select cardinality(private.sigec_current_decision_ids(target_process_id)) = 6
    and cardinality(evidence_ids) = 6
    and private.sigec_current_decision_ids(target_process_id) @> evidence_ids
    and evidence_ids @> private.sigec_current_decision_ids(target_process_id);
$$;

create or replace function private.sigec_quota_rule_is_current(
  target_process_id uuid,
  target_quota_rule_id uuid,
  evidence_ids uuid[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select quota_rule.status = 'confirmed'
      and quota_rule.source_decision_ids @> evidence_ids
      and evidence_ids @> quota_rule.source_decision_ids
      and quota_rule.version = (
        select max(candidate.version)
        from public.sigec_quota_rule_versions candidate
        where candidate.process_id = target_process_id
          and candidate.status = 'confirmed'
      )
    from public.sigec_quota_rule_versions quota_rule
    where quota_rule.id = target_quota_rule_id
      and quota_rule.process_id = target_process_id
  ), false);
$$;

create or replace function private.sigec_validate_quota_rule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and (
    not private.sigec_official_rules_are_confirmed(new.process_id)
    or not private.sigec_decision_evidence_is_current(new.process_id, new.source_decision_ids)
  ) then
    raise exception 'SIGEC_CURRENT_DECISION_EVIDENCE_REQUIRED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.sigec_validate_snapshot_quota_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.state = 'frozen' and new.phase <> 'simulation' and (
    not private.sigec_decision_evidence_is_current(new.process_id, new.source_decision_ids)
    or not private.sigec_quota_rule_is_current(
      new.process_id,
      new.quota_rule_version_id,
      new.source_decision_ids
    )
  ) then
    raise exception 'SIGEC_CURRENT_RANKING_EVIDENCE_REQUIRED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.sigec_validate_publication_quota_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sigec_ranking_snapshots snapshot
    where snapshot.id = new.snapshot_id
      and private.sigec_decision_evidence_is_current(
        snapshot.process_id,
        snapshot.source_decision_ids
      )
      and private.sigec_quota_rule_is_current(
        snapshot.process_id,
        snapshot.quota_rule_version_id,
        snapshot.source_decision_ids
      )
  ) then
    raise exception 'SIGEC_CURRENT_RANKING_EVIDENCE_REQUIRED' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_current_decision_ids(uuid) from public, anon, authenticated;
revoke all on function private.sigec_decision_evidence_is_current(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.sigec_quota_rule_is_current(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.sigec_validate_snapshot_quota_evidence() from public, anon, authenticated;
revoke all on function private.sigec_validate_publication_quota_evidence() from public, anon, authenticated;

grant execute on function private.sigec_current_decision_ids(uuid) to authenticated;
grant execute on function private.sigec_decision_evidence_is_current(uuid, uuid[]) to authenticated;
grant execute on function private.sigec_quota_rule_is_current(uuid, uuid, uuid[]) to authenticated;

create trigger sigec_snapshots_validate_current_evidence
before update on public.sigec_ranking_snapshots
for each row execute function private.sigec_validate_snapshot_quota_evidence();

create trigger sigec_snapshot_publications_validate_current_evidence
before insert on public.sigec_ranking_snapshot_publications
for each row execute function private.sigec_validate_publication_quota_evidence();
