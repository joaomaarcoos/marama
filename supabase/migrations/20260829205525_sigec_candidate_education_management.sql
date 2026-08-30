begin;

alter table public.sigec_candidate_education
  drop constraint sigec_candidate_education_level_check;

alter table public.sigec_candidate_education
  add column started_on date,
  add column workload_hours integer,
  add constraint sigec_candidate_education_level_check check (
    level in (
      'tecnico',
      'licenciatura',
      'bacharelado',
      'tecnologo',
      'especializacao',
      'mestrado',
      'doutorado',
      'formacao_pedagogica',
      'complementacao_pedagogica',
      'graduacao',
      'outro'
    )
  ),
  add constraint sigec_candidate_education_workload_check check (
    workload_hours is null or workload_hours between 1 and 20000
  ),
  add constraint sigec_candidate_education_dates_check check (
    (not is_completed and completion_date is null)
    or (
      is_completed
      and completion_date is not null
      and completion_date <= current_date
      and (started_on is null or started_on <= completion_date)
    )
  ),
  add constraint sigec_candidate_education_pedagogy_workload_check check (
    level not in ('formacao_pedagogica', 'complementacao_pedagogica')
    or workload_hours is not null
  );

create or replace function private.sigec_prepare_candidate_education_write()
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
    raise exception 'SIGEC_EDUCATION_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;

  new.course_name := regexp_replace(trim(new.course_name), '\s+', ' ', 'g');
  new.institution := regexp_replace(trim(new.institution), '\s+', ' ', 'g');

  if not new.is_completed then
    new.completion_date := null;
  end if;

  return new;
end;
$$;

create or replace function private.sigec_audit_candidate_education_change()
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
    audit_action := 'candidate_education_created';
    changed_fields := array['level', 'course_name', 'institution', 'started_on', 'completion_date', 'is_completed', 'workload_hours'];
  elsif tg_op = 'DELETE' then
    audit_action := 'candidate_education_deleted';
  else
    audit_action := 'candidate_education_updated';
    if new.level is distinct from old.level then changed_fields := array_append(changed_fields, 'level'); end if;
    if new.course_name is distinct from old.course_name then changed_fields := array_append(changed_fields, 'course_name'); end if;
    if new.institution is distinct from old.institution then changed_fields := array_append(changed_fields, 'institution'); end if;
    if new.started_on is distinct from old.started_on then changed_fields := array_append(changed_fields, 'started_on'); end if;
    if new.completion_date is distinct from old.completion_date then changed_fields := array_append(changed_fields, 'completion_date'); end if;
    if new.is_completed is distinct from old.is_completed then changed_fields := array_append(changed_fields, 'is_completed'); end if;
    if new.workload_hours is distinct from old.workload_hours then changed_fields := array_append(changed_fields, 'workload_hours'); end if;
  end if;

  if tg_op <> 'UPDATE' or cardinality(changed_fields) > 0 then
    insert into public.sigec_audit_events (
      actor_id, actor_role, action, entity_type, entity_id, metadata
    ) values (
      auth.uid(),
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'system'),
      audit_action,
      'candidate_education',
      target_id::text,
      jsonb_build_object(
        'candidate_id', target_candidate,
        'changed_fields', to_jsonb(changed_fields)
      )
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_prepare_candidate_education_write() from public, anon, authenticated;
revoke all on function private.sigec_audit_candidate_education_change() from public, anon, authenticated;

drop trigger if exists sigec_candidate_education_prepare on public.sigec_candidate_education;
create trigger sigec_candidate_education_prepare
before insert or update on public.sigec_candidate_education
for each row execute function private.sigec_prepare_candidate_education_write();

drop trigger if exists sigec_candidate_education_audit on public.sigec_candidate_education;
create trigger sigec_candidate_education_audit
after insert or update or delete on public.sigec_candidate_education
for each row execute function private.sigec_audit_candidate_education_change();

revoke insert, update on public.sigec_candidate_education from authenticated;
grant insert (
  candidate_id, level, course_name, institution, started_on,
  completion_date, is_completed, workload_hours
) on public.sigec_candidate_education to authenticated;
grant update (
  level, course_name, institution, started_on, completion_date,
  is_completed, workload_hours, updated_at
) on public.sigec_candidate_education to authenticated;

comment on column public.sigec_candidate_education.level is
  'Academic credential type, including pedagogical formation and pedagogical complementation.';
comment on function private.sigec_audit_candidate_education_change() is
  'Audits education lifecycle and field names without copying course or institution values.';

commit;
