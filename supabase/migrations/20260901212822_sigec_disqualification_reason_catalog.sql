begin;

create table public.sigec_disqualification_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  version integer not null check (version > 0),
  source_reference text not null check (char_length(trim(source_reference)) between 3 and 500),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'retired')),
  normative_status text not null default 'pending_confirmation'
    check (normative_status in ('pending_confirmation', 'confirmed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (process_id, version),
  check (
    (status = 'draft' and normative_status = 'pending_confirmation' and confirmed_by is null and confirmed_at is null)
    or (status = 'confirmed' and normative_status = 'confirmed' and confirmed_by is not null and confirmed_at is not null)
    or status = 'retired'
  )
);

create unique index sigec_disqualification_catalog_one_confirmed_idx
  on public.sigec_disqualification_catalog_versions(process_id)
  where status = 'confirmed';
create index sigec_disqualification_catalog_created_by_idx
  on public.sigec_disqualification_catalog_versions(created_by);
create index sigec_disqualification_catalog_confirmed_by_idx
  on public.sigec_disqualification_catalog_versions(confirmed_by)
  where confirmed_by is not null;

create table public.sigec_disqualification_reason_items (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.sigec_disqualification_catalog_versions(id) on delete cascade,
  code text not null check (code ~ '^edital_6_1_[1-9]$'),
  label text not null check (char_length(trim(label)) between 3 and 500),
  position integer not null check (position between 1 and 9),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (catalog_version_id, code),
  unique (catalog_version_id, position)
);

create index sigec_disqualification_items_catalog_idx
  on public.sigec_disqualification_reason_items(catalog_version_id, position);

create table public.sigec_application_disqualifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  catalog_version_id uuid not null references public.sigec_disqualification_catalog_versions(id) on delete restrict,
  reason_item_id uuid not null references public.sigec_disqualification_reason_items(id) on delete restrict,
  reason_code text not null,
  reason_label text not null,
  source_reference text not null,
  catalog_version integer not null,
  public_message text not null check (char_length(trim(public_message)) between 3 and 2000),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (application_id)
);

create index sigec_application_disqualifications_reason_idx
  on public.sigec_application_disqualifications(reason_item_id);
create index sigec_application_disqualifications_catalog_idx
  on public.sigec_application_disqualifications(catalog_version_id);
create index sigec_application_disqualifications_actor_idx
  on public.sigec_application_disqualifications(decided_by);

create table public.sigec_disqualification_internal_notes (
  id bigint generated always as identity primary key,
  disqualification_id uuid not null references public.sigec_application_disqualifications(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  author_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index sigec_disqualification_internal_notes_decision_idx
  on public.sigec_disqualification_internal_notes(disqualification_id, created_at desc);
create index sigec_disqualification_internal_notes_author_idx
  on public.sigec_disqualification_internal_notes(author_id);

alter table public.sigec_disqualification_catalog_versions enable row level security;
alter table public.sigec_disqualification_reason_items enable row level security;
alter table public.sigec_application_disqualifications enable row level security;
alter table public.sigec_disqualification_internal_notes enable row level security;

revoke all on public.sigec_disqualification_catalog_versions from public, anon, authenticated;
revoke all on public.sigec_disqualification_reason_items from public, anon, authenticated;
revoke all on public.sigec_application_disqualifications from public, anon, authenticated;
revoke all on public.sigec_disqualification_internal_notes from public, anon, authenticated;
grant select, insert, update on public.sigec_disqualification_catalog_versions to service_role;
grant select, insert on public.sigec_disqualification_reason_items to service_role;
grant select, insert on public.sigec_application_disqualifications to service_role;
grant select, insert on public.sigec_disqualification_internal_notes to service_role;

create or replace function public.sigec_create_disqualification_catalog(
  p_actor_id uuid,
  p_process_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  catalog_id uuid;
  next_version integer;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sigec_processes process
    where process.id = p_process_id and process.status = 'draft'
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_DRAFT_PROCESS_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.sigec_disqualification_catalog_versions catalog
    where catalog.process_id = p_process_id and catalog.status = 'draft'
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_DRAFT_EXISTS' using errcode = '23505';
  end if;

  select coalesce(max(catalog.version), 0) + 1 into next_version
  from public.sigec_disqualification_catalog_versions catalog
  where catalog.process_id = p_process_id;

  insert into public.sigec_disqualification_catalog_versions(
    process_id, version, source_reference, created_by
  ) values (
    p_process_id, next_version,
    'Edital Nº 01/2026 histórico, itens 6.1.1 a 6.1.9 — confirmação normativa obrigatória',
    p_actor_id
  ) returning id into catalog_id;

  insert into public.sigec_disqualification_reason_items(
    catalog_version_id, code, label, position
  ) values
    (catalog_id, 'edital_6_1_1', 'Não anexou documento obrigatório previsto no item 2.3.', 1),
    (catalog_id, 'edital_6_1_2', 'Não atende aos requisitos básicos da especialidade escolhida.', 2),
    (catalog_id, 'edital_6_1_3', 'Apresentou documento obrigatório em nome de terceiro.', 3),
    (catalog_id, 'edital_6_1_4', 'Apresentou documento de identificação divergente do exigido.', 4),
    (catalog_id, 'edital_6_1_5', 'Forneceu dados comprovadamente inverídicos ou falsos.', 5),
    (catalog_id, 'edital_6_1_6', 'Anexou documento com arquivo corrompido.', 6),
    (catalog_id, 'edital_6_1_7', 'Preencheu o formulário de inscrição de forma incorreta ou incompleta.', 7),
    (catalog_id, 'edital_6_1_8', 'Apresentou documento obrigatório fora do formato exigido ou ilegível.', 8),
    (catalog_id, 'edital_6_1_9', 'A inscrição não atende a todos os requisitos estabelecidos.', 9);

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'disqualification_catalog_created', 'disqualification_catalog', catalog_id::text,
    jsonb_build_object('processId', p_process_id, 'version', next_version, 'reasonCount', 9, 'normativeStatus', 'pending_confirmation')
  );
  return catalog_id;
end;
$$;

create or replace function public.sigec_confirm_disqualification_catalog(
  p_actor_id uuid,
  p_catalog_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.sigec_disqualification_catalog_versions%rowtype;
  event_time timestamptz := clock_timestamp();
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  select catalog.* into target
  from public.sigec_disqualification_catalog_versions catalog
  join public.sigec_processes process on process.id = catalog.process_id
  where catalog.id = p_catalog_id and catalog.status = 'draft' and process.status = 'draft'
  for update of catalog;
  if not found then
    raise exception 'SIGEC_DISQUALIFICATION_DRAFT_CATALOG_REQUIRED' using errcode = '23514';
  end if;
  if (select count(*) from public.sigec_disqualification_reason_items item where item.catalog_version_id = target.id and item.active) <> 9 then
    raise exception 'SIGEC_DISQUALIFICATION_NINE_REASONS_REQUIRED' using errcode = '23514';
  end if;

  update public.sigec_disqualification_catalog_versions catalog
  set status = 'retired'
  where catalog.process_id = target.process_id and catalog.status = 'confirmed';
  update public.sigec_disqualification_catalog_versions catalog
  set status = 'confirmed', normative_status = 'confirmed', confirmed_by = p_actor_id, confirmed_at = event_time
  where catalog.id = target.id;

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'disqualification_catalog_confirmed', 'disqualification_catalog', target.id::text,
    jsonb_build_object('processId', target.process_id, 'version', target.version, 'reasonCount', 9, 'normativeStatus', 'confirmed'),
    event_time
  );
  return target.id;
end;
$$;

create or replace function public.sigec_disqualify_application(
  p_actor_id uuid,
  p_application_id uuid,
  p_reason_item_id uuid,
  p_public_message text,
  p_internal_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
  reason_record record;
  target_stage uuid;
  decision_id uuid;
  event_time timestamptz := clock_timestamp();
  normalized_public text := trim(coalesce(p_public_message, ''));
  normalized_internal text := nullif(trim(coalesce(p_internal_note, '')), '');
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if char_length(normalized_public) not between 3 and 2000
    or (normalized_internal is not null and char_length(normalized_internal) not between 1 and 5000) then
    raise exception 'SIGEC_DISQUALIFICATION_INPUT_INVALID' using errcode = '22023';
  end if;

  select application.id, application.process_id, application.stage_id, application.application_state
    into target
  from public.sigec_applications application
  where application.id = p_application_id
  for update;
  if not found then raise exception 'SIGEC_DISQUALIFICATION_APPLICATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.application_state <> 'submitted' or target.stage_id is null then
    raise exception 'SIGEC_DISQUALIFICATION_SUBMITTED_REQUIRED' using errcode = '23514';
  end if;
  if exists (select 1 from public.sigec_application_disqualifications decision where decision.application_id = p_application_id) then
    raise exception 'SIGEC_DISQUALIFICATION_ALREADY_DECIDED' using errcode = '23505';
  end if;

  select item.id, item.code, item.label, catalog.id as catalog_id,
         catalog.version, catalog.source_reference
    into reason_record
  from public.sigec_disqualification_reason_items item
  join public.sigec_disqualification_catalog_versions catalog on catalog.id = item.catalog_version_id
  where item.id = p_reason_item_id and item.active
    and catalog.process_id = target.process_id
    and catalog.status = 'confirmed' and catalog.normative_status = 'confirmed';
  if not found then
    raise exception 'SIGEC_DISQUALIFICATION_CONFIRMED_REASON_REQUIRED' using errcode = '23514';
  end if;

  select stage.id into target_stage
  from public.sigec_process_stages stage
  where stage.process_id = target.process_id and stage.code = 'desclassificado';
  if target_stage is null or not exists (
    select 1 from public.sigec_process_stage_transitions transition
    where transition.process_id = target.process_id
      and transition.from_stage_id = target.stage_id
      and transition.to_stage_id = target_stage and transition.active
  ) then
    raise exception 'SIGEC_DISQUALIFICATION_TRANSITION_REQUIRED' using errcode = '23514';
  end if;

  insert into public.sigec_application_disqualifications(
    application_id, catalog_version_id, reason_item_id, reason_code, reason_label,
    source_reference, catalog_version, public_message, decided_by, decided_at
  ) values (
    p_application_id, reason_record.catalog_id, reason_record.id, reason_record.code,
    reason_record.label, reason_record.source_reference, reason_record.version,
    normalized_public, p_actor_id, event_time
  ) returning id into decision_id;
  if normalized_internal is not null then
    insert into public.sigec_disqualification_internal_notes(disqualification_id, body, author_id, created_at)
    values (decision_id, normalized_internal, p_actor_id, event_time);
  end if;

  update public.sigec_applications application
  set stage_id = target_stage, updated_at = event_time
  where application.id = p_application_id;
  insert into public.sigec_application_status_history(
    application_id, from_stage_id, to_stage_id, public_message, changed_by, created_at
  ) values (p_application_id, target.stage_id, target_stage, normalized_public, p_actor_id, event_time);

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'application_disqualified', 'sigec_application', p_application_id::text,
    jsonb_build_object(
      'decisionId', decision_id, 'reasonCode', reason_record.code,
      'catalogVersion', reason_record.version, 'fromStageId', target.stage_id,
      'toStageId', target_stage, 'hasPublicMessage', true,
      'hasInternalNote', normalized_internal is not null,
      'changedFields', jsonb_build_array('stage_id')
    ), event_time
  );
  return decision_id;
end;
$$;

create or replace function private.sigec_get_candidate_disqualification_impl(p_application_id uuid)
returns table(reason_code text, reason_label text, public_message text, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select decision.reason_code, decision.reason_label, decision.public_message, decision.decided_at
  from public.sigec_application_disqualifications decision
  join public.sigec_applications application on application.id = decision.application_id
  where decision.application_id = p_application_id
    and application.candidate_id = auth.uid();
$$;

create or replace function public.sigec_get_candidate_disqualification(p_application_id uuid)
returns table(reason_code text, reason_label text, public_message text, decided_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.sigec_get_candidate_disqualification_impl(p_application_id); $$;

revoke all on function public.sigec_create_disqualification_catalog(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_create_disqualification_catalog(uuid,uuid) to service_role;
revoke all on function public.sigec_confirm_disqualification_catalog(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_confirm_disqualification_catalog(uuid,uuid) to service_role;
revoke all on function public.sigec_disqualify_application(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.sigec_disqualify_application(uuid,uuid,uuid,text,text) to service_role;
revoke all on function private.sigec_get_candidate_disqualification_impl(uuid) from public, anon;
grant execute on function private.sigec_get_candidate_disqualification_impl(uuid) to authenticated;
revoke all on function public.sigec_get_candidate_disqualification(uuid) from public, anon;
grant execute on function public.sigec_get_candidate_disqualification(uuid) to authenticated;

comment on table public.sigec_disqualification_catalog_versions is
  'Versioned per-process disqualification catalog. Historical edital reasons remain draft until explicit normative confirmation.';
comment on table public.sigec_disqualification_internal_notes is
  'Server-only internal notes kept separate from candidate-visible disqualification reasons.';

commit;
