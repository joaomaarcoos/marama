begin;

create or replace function private.sigec_enforce_application_preference_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_process_id uuid;
  target_state text;
  allowed_preferences smallint;
  existing_preferences integer;
  excluded_id uuid;
begin
  if tg_op = 'UPDATE' then excluded_id := old.id; end if;

  select application.process_id, application.application_state, process.max_preferences
    into target_process_id, target_state, allowed_preferences
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = new.application_id;

  if target_process_id is null
    or target_state <> 'draft'
    or not exists (
      select 1 from public.sigec_vacancies vacancy
      where vacancy.id = new.vacancy_id
        and vacancy.process_id = target_process_id
        and vacancy.active
    ) then
    raise exception 'SIGEC_APPLICATION_PREFERENCE_INVALID' using errcode = '23514';
  end if;

  if new.position > allowed_preferences then
    raise exception 'SIGEC_APPLICATION_PREFERENCE_LIMIT' using errcode = '23514';
  end if;

  select count(*) into existing_preferences
  from public.sigec_application_preferences preference
  where preference.application_id = new.application_id
    and (excluded_id is null or preference.id <> excluded_id);

  if existing_preferences >= allowed_preferences then
    raise exception 'SIGEC_APPLICATION_PREFERENCE_LIMIT' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger sigec_application_preference_limit_guard
before insert or update on public.sigec_application_preferences
for each row execute function private.sigec_enforce_application_preference_limit();

comment on function private.sigec_enforce_application_preference_limit() is
  'Impõe no banco o limite configurado no processo e impede alterações após envio da candidatura.';

commit;
