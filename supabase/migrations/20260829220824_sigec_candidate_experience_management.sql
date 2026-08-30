begin;

alter table public.sigec_candidate_experience
  add constraint sigec_candidate_experience_dates_check check (
    starts_on <= current_date
    and (ends_on is null or (ends_on >= starts_on and ends_on <= current_date))
  );

create or replace function private.sigec_prepare_candidate_experience_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.candidate_id is distinct from old.candidate_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'SIGEC_EXPERIENCE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;

  new.institution := regexp_replace(trim(new.institution), '\s+', ' ', 'g');
  new.role_title := regexp_replace(trim(new.role_title), '\s+', ' ', 'g');
  return new;
end;
$$;

create or replace function private.sigec_audit_candidate_experience_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := coalesce(new.id, old.id);
  target_candidate uuid := coalesce(new.candidate_id, old.candidate_id);
  changed_fields text[] := array[]::text[];
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'candidate_experience_created';
    changed_fields := array['employment_type', 'institution', 'role_title', 'starts_on', 'ends_on', 'is_teaching'];
  elsif tg_op = 'DELETE' then
    audit_action := 'candidate_experience_deleted';
  else
    audit_action := 'candidate_experience_updated';
    if new.employment_type is distinct from old.employment_type then changed_fields := array_append(changed_fields, 'employment_type'); end if;
    if new.institution is distinct from old.institution then changed_fields := array_append(changed_fields, 'institution'); end if;
    if new.role_title is distinct from old.role_title then changed_fields := array_append(changed_fields, 'role_title'); end if;
    if new.starts_on is distinct from old.starts_on then changed_fields := array_append(changed_fields, 'starts_on'); end if;
    if new.ends_on is distinct from old.ends_on then changed_fields := array_append(changed_fields, 'ends_on'); end if;
    if new.is_teaching is distinct from old.is_teaching then changed_fields := array_append(changed_fields, 'is_teaching'); end if;
  end if;

  if tg_op <> 'UPDATE' or cardinality(changed_fields) > 0 then
    insert into public.sigec_audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'system'),
      audit_action,
      'candidate_experience',
      target_id::text,
      jsonb_build_object('candidate_id', target_candidate, 'changed_fields', to_jsonb(changed_fields))
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.sigec_candidate_teaching_experience_summary(p_candidate_id uuid)
returns table(total_unique_days integer, total_months integer, remaining_days integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  unique_days integer;
begin
  if auth.uid() is null or (
    auth.uid() <> p_candidate_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_EXPERIENCE_SUMMARY_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(sum(upper(period) - lower(period)), 0)::integer
  into unique_days
  from (
    select unnest(range_agg(daterange(starts_on, coalesce(ends_on, current_date) + 1, '[)'))) as period
    from public.sigec_candidate_experience
    where candidate_id = p_candidate_id and is_teaching
  ) merged;

  return query select unique_days, unique_days / 30, unique_days % 30;
end;
$$;

revoke all on function private.sigec_prepare_candidate_experience_write() from public, anon, authenticated;
revoke all on function private.sigec_audit_candidate_experience_change() from public, anon, authenticated;
revoke all on function public.sigec_candidate_teaching_experience_summary(uuid) from public, anon;
grant execute on function public.sigec_candidate_teaching_experience_summary(uuid) to authenticated;

drop trigger if exists sigec_candidate_experience_prepare on public.sigec_candidate_experience;
create trigger sigec_candidate_experience_prepare
before insert or update on public.sigec_candidate_experience
for each row execute function private.sigec_prepare_candidate_experience_write();

drop trigger if exists sigec_candidate_experience_audit on public.sigec_candidate_experience;
create trigger sigec_candidate_experience_audit
after insert or update or delete on public.sigec_candidate_experience
for each row execute function private.sigec_audit_candidate_experience_change();

revoke insert, update on public.sigec_candidate_experience from authenticated;
grant insert (candidate_id, employment_type, institution, role_title, starts_on, ends_on, is_teaching)
on public.sigec_candidate_experience to authenticated;
grant update (employment_type, institution, role_title, starts_on, ends_on, is_teaching, updated_at)
on public.sigec_candidate_experience to authenticated;

comment on function public.sigec_candidate_teaching_experience_summary(uuid) is
  'Counts the union of teaching date ranges once and converts unique days to 30-day equivalent months.';

commit;
