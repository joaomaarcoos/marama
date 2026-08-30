begin;

create or replace function private.sigec_assert_draft_process_manager(
  p_process_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text;
  process_status text;
begin
  select user_record.raw_app_meta_data ->> 'role'
  into actor_role
  from auth.users user_record
  where user_record.id = p_actor_id;

  if actor_role is null or actor_role not in ('admin', 'gerente') then
    raise exception 'SIGEC_PROCESS_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  select process.status
  into process_status
  from public.sigec_processes process
  where process.id = p_process_id
  for update;

  if not found then
    raise exception 'SIGEC_PROCESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if process_status <> 'draft' then
    raise exception 'SIGEC_PROCESS_CONFIGURATION_LOCKED' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.sigec_upsert_process_modality(
  p_process_id uuid,
  p_actor_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_modality_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(coalesce(p_description, '')) > 2000 then
    raise exception 'SIGEC_MODALITY_INPUT_INVALID' using errcode = '22023';
  end if;

  if p_modality_id is null then
    insert into public.sigec_modalities (process_id, name, slug, description)
    values (p_process_id, trim(p_name), p_slug, nullif(trim(p_description), ''))
    returning id into result_id;
  else
    update public.sigec_modalities modality
    set name = trim(p_name),
        slug = p_slug,
        description = nullif(trim(p_description), '')
    where modality.id = p_modality_id
      and modality.process_id = p_process_id
    returning modality.id into result_id;

    if result_id is null then
      raise exception 'SIGEC_MODALITY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    case when p_modality_id is null then 'sigec.modality.created' else 'sigec.modality.updated' end,
    'sigec_modality',
    result_id::text,
    jsonb_build_object('process_id', p_process_id)
  );

  return result_id;
end;
$$;

create or replace function public.sigec_delete_process_modality(
  p_process_id uuid,
  p_actor_id uuid,
  p_modality_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);

  if exists (
    select 1 from public.sigec_vacancies vacancy
    where vacancy.process_id = p_process_id and vacancy.modality_id = p_modality_id
  ) then
    raise exception 'SIGEC_MODALITY_HAS_VACANCIES' using errcode = '23503';
  end if;

  delete from public.sigec_modalities modality
  where modality.id = p_modality_id and modality.process_id = p_process_id;
  if not found then
    raise exception 'SIGEC_MODALITY_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    'sigec.modality.deleted', 'sigec_modality', p_modality_id::text,
    jsonb_build_object('process_id', p_process_id)
  );
  return true;
end;
$$;

create or replace function public.sigec_upsert_vacancy_configuration(
  p_process_id uuid,
  p_actor_id uuid,
  p_modality_id uuid,
  p_course_name text,
  p_municipality text,
  p_accepted_education text,
  p_proof_instructions text,
  p_vacancy_kind text,
  p_vacancy_count integer default null,
  p_active boolean default true,
  p_vacancy_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_course text;
  v_course_id uuid;
  result_id uuid;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);

  if not exists (
    select 1 from public.sigec_modalities modality
    where modality.id = p_modality_id and modality.process_id = p_process_id
  ) then
    raise exception 'SIGEC_MODALITY_NOT_FOUND' using errcode = 'P0002';
  end if;

  normalized_course := upper(regexp_replace(trim(coalesce(p_course_name, '')), '\s+', ' ', 'g'));
  if char_length(trim(coalesce(p_course_name, ''))) not between 3 and 200
    or char_length(trim(coalesce(p_municipality, ''))) not between 2 and 160
    or char_length(trim(coalesce(p_accepted_education, ''))) < 3
    or char_length(trim(coalesce(p_proof_instructions, ''))) < 3
    or p_vacancy_kind not in ('cadastro_reserva', 'quantidade')
    or (p_vacancy_kind = 'cadastro_reserva' and p_vacancy_count is not null)
    or (p_vacancy_kind = 'quantidade' and coalesce(p_vacancy_count, 0) <= 0) then
    raise exception 'SIGEC_VACANCY_INPUT_INVALID' using errcode = '22023';
  end if;

  select course.id into v_course_id
  from public.sigec_courses course
  where course.normalized_name = normalized_course;
  if v_course_id is null then
    insert into public.sigec_courses (canonical_name, normalized_name)
    values (trim(p_course_name), normalized_course)
    on conflict (normalized_name) do nothing
    returning id into v_course_id;
    if v_course_id is null then
      select course.id into v_course_id
      from public.sigec_courses course
      where course.normalized_name = normalized_course;
    end if;
  end if;

  insert into public.sigec_process_course_requirements (
    process_id, course_id, accepted_education, proof_instructions
  ) values (
    p_process_id, v_course_id, trim(p_accepted_education), trim(p_proof_instructions)
  )
  on conflict (process_id, course_id) do update
  set accepted_education = excluded.accepted_education,
      proof_instructions = excluded.proof_instructions,
      updated_at = now();

  if p_vacancy_id is null then
    insert into public.sigec_vacancies (
      process_id, modality_id, course_id, municipality,
      vacancy_kind, vacancy_count, active
    ) values (
      p_process_id, p_modality_id, v_course_id, trim(p_municipality),
      p_vacancy_kind, p_vacancy_count, p_active
    ) returning id into result_id;
  else
    update public.sigec_vacancies vacancy
    set modality_id = p_modality_id,
        course_id = v_course_id,
        municipality = trim(p_municipality),
        vacancy_kind = p_vacancy_kind,
        vacancy_count = p_vacancy_count,
        active = p_active,
        updated_at = now()
    where vacancy.id = p_vacancy_id and vacancy.process_id = p_process_id
    returning vacancy.id into result_id;
    if result_id is null then
      raise exception 'SIGEC_VACANCY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    case when p_vacancy_id is null then 'sigec.vacancy.created' else 'sigec.vacancy.updated' end,
    'sigec_vacancy', result_id::text,
    jsonb_build_object('process_id', p_process_id, 'course_id', v_course_id, 'modality_id', p_modality_id)
  );
  return result_id;
end;
$$;

revoke all on function private.sigec_assert_draft_process_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sigec_upsert_process_modality(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.sigec_delete_process_modality(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.sigec_upsert_vacancy_configuration(uuid, uuid, uuid, text, text, text, text, text, integer, boolean, uuid) from public, anon, authenticated;

grant execute on function private.sigec_assert_draft_process_manager(uuid, uuid) to service_role;
grant execute on function public.sigec_upsert_process_modality(uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.sigec_delete_process_modality(uuid, uuid, uuid) to service_role;
grant execute on function public.sigec_upsert_vacancy_configuration(uuid, uuid, uuid, text, text, text, text, text, integer, boolean, uuid) to service_role;

commit;
