begin;

create extension if not exists unaccent with schema extensions;

create or replace function private.sigec_normalize_import_label(p_value text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select trim(regexp_replace(upper(extensions.unaccent(coalesce(p_value, ''))), '[^A-Z0-9]+', ' ', 'g'));
$$;

create or replace function public.sigec_confirm_vacancy_import(
  p_process_id uuid,
  p_actor_id uuid,
  p_source_sha256 text,
  p_rows jsonb
)
returns table (imported_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  modality_id uuid;
  vacancy_id uuid;
  imported integer := 0;
  row_count integer;
  duplicate_count integer;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);

  if p_source_sha256 !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'SIGEC_IMPORT_INPUT_INVALID' using errcode = '22023';
  end if;
  row_count := jsonb_array_length(p_rows);
  if row_count < 1 or row_count > 1000 then
    raise exception 'SIGEC_IMPORT_ROW_LIMIT' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) row_data
    where char_length(trim(coalesce(row_data ->> 'modalityName', ''))) < 2
      or coalesce(row_data ->> 'modalitySlug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(trim(coalesce(row_data ->> 'municipality', ''))) < 2
      or char_length(trim(coalesce(row_data ->> 'courseName', ''))) < 3
      or char_length(trim(coalesce(row_data ->> 'acceptedEducation', ''))) < 3
      or char_length(trim(coalesce(row_data ->> 'proofInstructions', ''))) < 3
      or coalesce(row_data ->> 'vacancyKind', '') not in ('cadastro_reserva', 'quantidade')
      or (row_data ->> 'vacancyKind' = 'quantidade' and coalesce((row_data ->> 'vacancyCount')::integer, 0) <= 0)
  ) then
    raise exception 'SIGEC_IMPORT_ROWS_INVALID' using errcode = '22023';
  end if;

  select count(*) into duplicate_count
  from (
    select
      row_data ->> 'modalitySlug',
      private.sigec_normalize_import_label(row_data ->> 'municipality'),
      private.sigec_normalize_import_label(row_data ->> 'courseName')
    from jsonb_array_elements(p_rows) row_data
    group by 1, 2, 3
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'SIGEC_IMPORT_DUPLICATES' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) row_data
    join public.sigec_modalities modality
      on modality.process_id = p_process_id
     and modality.slug = row_data ->> 'modalitySlug'
    join public.sigec_vacancies vacancy
      on vacancy.process_id = p_process_id and vacancy.modality_id = modality.id
    join public.sigec_courses course on course.id = vacancy.course_id
    where private.sigec_normalize_import_label(vacancy.municipality)
            = private.sigec_normalize_import_label(row_data ->> 'municipality')
      and private.sigec_normalize_import_label(course.canonical_name)
            = private.sigec_normalize_import_label(row_data ->> 'courseName')
  ) then
    raise exception 'SIGEC_IMPORT_CONFLICTS_EXISTING' using errcode = '23505';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    select modality.id into modality_id
    from public.sigec_modalities modality
    where modality.process_id = p_process_id and modality.slug = item ->> 'modalitySlug';
    if modality_id is null then
      modality_id := public.sigec_upsert_process_modality(
        p_process_id, p_actor_id, item ->> 'modalityName', item ->> 'modalitySlug', null, null
      );
    end if;

    vacancy_id := public.sigec_upsert_vacancy_configuration(
      p_process_id,
      p_actor_id,
      modality_id,
      item ->> 'courseName',
      item ->> 'municipality',
      item ->> 'acceptedEducation',
      item ->> 'proofInstructions',
      item ->> 'vacancyKind',
      case when item ->> 'vacancyKind' = 'quantidade' then (item ->> 'vacancyCount')::integer else null end,
      true,
      null
    );
    update public.sigec_vacancies vacancy
    set source_reference = nullif(trim(item ->> 'sourceReference'), '')
    where vacancy.id = vacancy_id;
    imported := imported + 1;
  end loop;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    'sigec.vacancy_import.confirmed',
    'sigec_process',
    p_process_id::text,
    jsonb_build_object('source_sha256', p_source_sha256, 'imported_count', imported)
  );

  return query select imported;
end;
$$;

revoke all on function private.sigec_normalize_import_label(text) from public, anon, authenticated;
revoke all on function public.sigec_confirm_vacancy_import(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.sigec_normalize_import_label(text) to service_role;
grant execute on function public.sigec_confirm_vacancy_import(uuid, uuid, text, jsonb) to service_role;

commit;
