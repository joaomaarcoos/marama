begin;

create table if not exists public.sigec_declaration_templates (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (char_length(trim(label)) between 3 and 200),
  content text not null check (char_length(trim(content)) between 10 and 20000),
  version text not null check (char_length(trim(version)) between 1 and 50),
  audience text not null check (audience in ('all', 'pcd', 'ppp', 'pcd_or_ppp')),
  required boolean not null default true,
  active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, code)
);

create index if not exists sigec_declaration_templates_process_idx
  on public.sigec_declaration_templates(process_id, position) where active;
alter table public.sigec_declaration_templates enable row level security;
revoke all on public.sigec_declaration_templates from public, anon, authenticated;
grant all on public.sigec_declaration_templates to service_role;

create or replace function public.sigec_upsert_form_configuration(
  p_process_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_code text,
  p_label text,
  p_details text,
  p_required boolean,
  p_position integer,
  p_config jsonb,
  p_item_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
  v_audience text := coalesce(p_config ->> 'audience', 'all');
  mime_types text[];
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if p_kind not in ('question', 'document', 'declaration')
    or coalesce(p_code, '') !~ '^[a-z][a-z0-9_]*$'
    or char_length(trim(coalesce(p_label, ''))) not between 3 and 200
    or p_position < 0
    or jsonb_typeof(p_config) <> 'object'
    or v_audience not in ('all', 'pcd', 'ppp', 'pcd_or_ppp') then
    raise exception 'SIGEC_FORM_CONFIGURATION_INVALID' using errcode = '22023';
  end if;

  if p_kind = 'question' then
    if coalesce(p_config ->> 'questionType', '') not in
      ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'boolean', 'number', 'date') then
      raise exception 'SIGEC_QUESTION_TYPE_INVALID' using errcode = '22023';
    end if;
    if p_item_id is null then
      insert into public.sigec_process_questions
        (process_id, code, label, help_text, question_type, required, config, position)
      values
        (p_process_id, p_code, trim(p_label), nullif(trim(p_details), ''),
         p_config ->> 'questionType', p_required, p_config - 'questionType', p_position)
      returning id into result_id;
    else
      update public.sigec_process_questions item
      set code = p_code, label = trim(p_label), help_text = nullif(trim(p_details), ''),
          question_type = p_config ->> 'questionType', required = p_required,
          config = p_config - 'questionType', position = p_position, updated_at = now()
      where item.id = p_item_id and item.process_id = p_process_id
      returning id into result_id;
    end if;
  elsif p_kind = 'document' then
    select array_agg(mime.value) into mime_types
    from jsonb_array_elements_text(
      coalesce(p_config -> 'acceptedMimeTypes', '["application/pdf"]'::jsonb)
    ) as mime(value);
    if mime_types is null or not mime_types <@ array['application/pdf', 'image/jpeg', 'image/png']::text[]
      or coalesce((p_config ->> 'maxFileSizeBytes')::bigint, 0) not between 1 and 52428800 then
      raise exception 'SIGEC_DOCUMENT_CONFIGURATION_INVALID' using errcode = '22023';
    end if;
    if p_item_id is null then
      insert into public.sigec_document_requirements
        (process_id, code, label, instructions, required, accepted_mime_types,
         max_file_size_bytes, condition_config, position)
      values
        (p_process_id, p_code, trim(p_label), nullif(trim(p_details), ''), p_required,
         mime_types, (p_config ->> 'maxFileSizeBytes')::bigint,
         jsonb_build_object('audience', v_audience), p_position)
      returning id into result_id;
    else
      update public.sigec_document_requirements item
      set code = p_code, label = trim(p_label), instructions = nullif(trim(p_details), ''),
          required = p_required, accepted_mime_types = mime_types,
          max_file_size_bytes = (p_config ->> 'maxFileSizeBytes')::bigint,
          condition_config = jsonb_build_object('audience', v_audience),
          position = p_position, updated_at = now()
      where item.id = p_item_id and item.process_id = p_process_id
      returning id into result_id;
    end if;
  else
    if char_length(trim(coalesce(p_details, ''))) not between 10 and 20000
      or char_length(trim(coalesce(p_config ->> 'version', ''))) not between 1 and 50 then
      raise exception 'SIGEC_DECLARATION_CONFIGURATION_INVALID' using errcode = '22023';
    end if;
    if p_item_id is null then
      insert into public.sigec_declaration_templates
        (process_id, code, label, content, version, audience, required, position)
      values
        (p_process_id, p_code, trim(p_label), trim(p_details), p_config ->> 'version',
         v_audience, p_required, p_position)
      returning id into result_id;
    else
      update public.sigec_declaration_templates item
      set code = p_code, label = trim(p_label), content = trim(p_details),
          version = p_config ->> 'version', audience = v_audience,
          required = p_required, position = p_position, updated_at = now()
      where item.id = p_item_id and item.process_id = p_process_id
      returning id into result_id;
    end if;
  end if;

  if result_id is null then
    raise exception 'SIGEC_FORM_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.sigec_audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    'sigec.form_configuration.saved', 'sigec_' || p_kind, result_id::text,
    jsonb_build_object('process_id', p_process_id, 'code', p_code));
  return result_id;
end;
$$;

create or replace function public.sigec_delete_form_configuration(
  p_process_id uuid, p_actor_id uuid, p_kind text, p_item_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if p_kind = 'question' then
    delete from public.sigec_process_questions item where item.id = p_item_id and item.process_id = p_process_id;
  elsif p_kind = 'document' then
    delete from public.sigec_document_requirements item where item.id = p_item_id and item.process_id = p_process_id;
  elsif p_kind = 'declaration' then
    delete from public.sigec_declaration_templates item where item.id = p_item_id and item.process_id = p_process_id;
  else
    raise exception 'SIGEC_FORM_KIND_INVALID' using errcode = '22023';
  end if;
  if not found then raise exception 'SIGEC_FORM_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.sigec_audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_actor_id,
    (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
    'sigec.form_configuration.deleted', 'sigec_' || p_kind, p_item_id::text,
    jsonb_build_object('process_id', p_process_id));
  return true;
exception when foreign_key_violation then
  raise exception 'SIGEC_FORM_ITEM_IN_USE' using errcode = '23503';
end;
$$;

revoke all on function public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.sigec_delete_form_configuration(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid) to service_role;
grant execute on function public.sigec_delete_form_configuration(uuid,uuid,text,uuid) to service_role;

commit;
