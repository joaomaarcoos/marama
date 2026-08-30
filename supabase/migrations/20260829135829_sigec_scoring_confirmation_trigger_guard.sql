begin;

create or replace function private.sigec_guard_scoring_rule_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_total numeric;
begin
  if old.status <> 'draft' then
    raise exception 'SIGEC_SCORING_VERSION_IMMUTABLE' using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.status in ('internal', 'official') then
    perform private.sigec_assert_draft_process_manager(new.process_id, new.confirmed_by);
    select coalesce(sum(item.max_points), 0) into configured_total
    from public.sigec_scoring_rule_items item where item.rule_version_id = old.id;
    if configured_total <> new.total_max_points then
      raise exception 'SIGEC_SCORING_TOTAL_MISMATCH' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.sigec_tie_break_rules rule where rule.rule_version_id = old.id
    ) then
      raise exception 'SIGEC_TIE_BREAK_REQUIRED' using errcode = '23514';
    end if;
    if new.status = 'official'
      and (new.is_provisional or not private.sigec_official_rules_are_confirmed(new.process_id))
    then
      raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;
