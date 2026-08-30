begin;

create table public.sigec_scoring_rule_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  version integer not null check (version > 0),
  label text not null check (char_length(trim(label)) between 3 and 240),
  status text not null default 'draft' check (status in ('draft', 'internal', 'official')),
  is_provisional boolean not null default true,
  total_max_points numeric(8,2) not null check (total_max_points > 0),
  source_reference text not null check (char_length(trim(source_reference)) between 3 and 1000),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  unique (process_id, version),
  check (
    (status = 'draft' and confirmed_by is null and confirmed_at is null)
    or (status in ('internal', 'official') and confirmed_by is not null and confirmed_at is not null)
  ),
  check (status <> 'official' or not is_provisional)
);

create unique index sigec_scoring_rule_one_draft_idx
  on public.sigec_scoring_rule_versions(process_id) where status = 'draft';
create unique index sigec_scoring_rule_one_official_idx
  on public.sigec_scoring_rule_versions(process_id) where status = 'official';
create index sigec_scoring_rule_process_version_idx
  on public.sigec_scoring_rule_versions(process_id, version desc);
create index sigec_scoring_rule_recorded_by_idx
  on public.sigec_scoring_rule_versions(recorded_by);
create index sigec_scoring_rule_confirmed_by_idx
  on public.sigec_scoring_rule_versions(confirmed_by) where confirmed_by is not null;

create table public.sigec_scoring_rule_items (
  id uuid primary key default gen_random_uuid(),
  rule_version_id uuid not null references public.sigec_scoring_rule_versions(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (char_length(trim(label)) between 3 and 240),
  instructions text,
  max_points numeric(8,2) not null check (max_points > 0),
  scoring_config jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring_config) = 'object'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (rule_version_id, code)
);

create index sigec_scoring_rule_items_version_position_idx
  on public.sigec_scoring_rule_items(rule_version_id, position);

create table public.sigec_tie_break_rules (
  id uuid primary key default gen_random_uuid(),
  rule_version_id uuid not null references public.sigec_scoring_rule_versions(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (char_length(trim(label)) between 3 and 240),
  value_source text not null check (char_length(trim(value_source)) between 3 and 120),
  direction text not null check (direction in ('asc', 'desc')),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (rule_version_id, code),
  unique (rule_version_id, position)
);

create index sigec_tie_break_rules_version_position_idx
  on public.sigec_tie_break_rules(rule_version_id, position);

alter table public.sigec_scoring_rule_versions enable row level security;
alter table public.sigec_scoring_rule_items enable row level security;
alter table public.sigec_tie_break_rules enable row level security;
revoke all on public.sigec_scoring_rule_versions from public, anon, authenticated;
revoke all on public.sigec_scoring_rule_items from public, anon, authenticated;
revoke all on public.sigec_tie_break_rules from public, anon, authenticated;
grant all on public.sigec_scoring_rule_versions to service_role;
grant all on public.sigec_scoring_rule_items to service_role;
grant all on public.sigec_tie_break_rules to service_role;

create or replace function private.sigec_guard_scoring_rule_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'SIGEC_SCORING_VERSION_IMMUTABLE' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.sigec_guard_scoring_child_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_version_id uuid := case when tg_op = 'DELETE' then old.rule_version_id else new.rule_version_id end;
begin
  if not exists (
    select 1 from public.sigec_scoring_rule_versions version
    where version.id = target_version_id and version.status = 'draft'
  ) then
    raise exception 'SIGEC_SCORING_VERSION_IMMUTABLE' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.rule_version_id <> new.rule_version_id then
    raise exception 'SIGEC_SCORING_ITEM_CANNOT_MOVE' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger sigec_scoring_rule_versions_immutable
before update or delete on public.sigec_scoring_rule_versions
for each row execute function private.sigec_guard_scoring_rule_immutability();
create trigger sigec_scoring_rule_items_immutable
before update or delete on public.sigec_scoring_rule_items
for each row execute function private.sigec_guard_scoring_child_immutability();
create trigger sigec_tie_break_rules_immutable
before update or delete on public.sigec_tie_break_rules
for each row execute function private.sigec_guard_scoring_child_immutability();

create or replace function public.sigec_upsert_scoring_version(
  p_process_id uuid,
  p_actor_id uuid,
  p_label text,
  p_total_max_points numeric,
  p_source_reference text,
  p_is_provisional boolean,
  p_version_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
  next_version integer;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if char_length(trim(coalesce(p_label, ''))) not between 3 and 240
    or coalesce(p_total_max_points, 0) <= 0
    or char_length(trim(coalesce(p_source_reference, ''))) not between 3 and 1000
    or p_is_provisional is null then
    raise exception 'SIGEC_SCORING_VERSION_INVALID' using errcode = '22023';
  end if;

  if p_version_id is null then
    select coalesce(max(version.version), 0) + 1 into next_version
    from public.sigec_scoring_rule_versions version where version.process_id = p_process_id;
    insert into public.sigec_scoring_rule_versions
      (process_id, version, label, is_provisional, total_max_points, source_reference, recorded_by)
    values
      (p_process_id, next_version, trim(p_label), p_is_provisional,
       p_total_max_points, trim(p_source_reference), p_actor_id)
    returning id into result_id;
  else
    update public.sigec_scoring_rule_versions version
    set label = trim(p_label), is_provisional = p_is_provisional,
        total_max_points = p_total_max_points, source_reference = trim(p_source_reference)
    where version.id = p_version_id and version.process_id = p_process_id and version.status = 'draft'
    returning id into result_id;
  end if;
  if result_id is null then
    raise exception 'SIGEC_SCORING_DRAFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.scoring_version.saved', 'sigec_scoring_rule_version', result_id::text,
     jsonb_build_object('process_id', p_process_id, 'provisional', p_is_provisional));
  return result_id;
end;
$$;

create or replace function public.sigec_upsert_scoring_item(
  p_process_id uuid, p_actor_id uuid, p_version_id uuid, p_code text,
  p_label text, p_instructions text, p_max_points numeric,
  p_scoring_config jsonb, p_position integer, p_item_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare result_id uuid;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if not exists (select 1 from public.sigec_scoring_rule_versions version where version.id = p_version_id and version.process_id = p_process_id and version.status = 'draft')
    or coalesce(p_code, '') !~ '^[a-z][a-z0-9_]*$'
    or char_length(trim(coalesce(p_label, ''))) not between 3 and 240
    or coalesce(p_max_points, 0) <= 0 or coalesce(p_position, -1) < 0
    or jsonb_typeof(coalesce(p_scoring_config, '{}'::jsonb)) <> 'object' then
    raise exception 'SIGEC_SCORING_ITEM_INVALID' using errcode = '22023';
  end if;
  if p_item_id is null then
    insert into public.sigec_scoring_rule_items
      (rule_version_id, code, label, instructions, max_points, scoring_config, position)
    values (p_version_id, p_code, trim(p_label), nullif(trim(p_instructions), ''), p_max_points, coalesce(p_scoring_config, '{}'::jsonb), p_position)
    returning id into result_id;
  else
    update public.sigec_scoring_rule_items item
    set code = p_code, label = trim(p_label), instructions = nullif(trim(p_instructions), ''),
        max_points = p_max_points, scoring_config = coalesce(p_scoring_config, '{}'::jsonb), position = p_position
    where item.id = p_item_id and item.rule_version_id = p_version_id returning id into result_id;
  end if;
  if result_id is null then raise exception 'SIGEC_SCORING_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  return result_id;
end;
$$;

create or replace function public.sigec_upsert_tie_break_rule(
  p_process_id uuid, p_actor_id uuid, p_version_id uuid, p_code text,
  p_label text, p_value_source text, p_direction text,
  p_configuration jsonb, p_position integer, p_rule_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare result_id uuid;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if not exists (select 1 from public.sigec_scoring_rule_versions version where version.id = p_version_id and version.process_id = p_process_id and version.status = 'draft')
    or coalesce(p_code, '') !~ '^[a-z][a-z0-9_]*$'
    or char_length(trim(coalesce(p_label, ''))) not between 3 and 240
    or char_length(trim(coalesce(p_value_source, ''))) not between 3 and 120
    or p_direction not in ('asc', 'desc') or coalesce(p_position, 0) <= 0
    or jsonb_typeof(coalesce(p_configuration, '{}'::jsonb)) <> 'object' then
    raise exception 'SIGEC_TIE_BREAK_RULE_INVALID' using errcode = '22023';
  end if;
  if p_rule_id is null then
    insert into public.sigec_tie_break_rules
      (rule_version_id, code, label, value_source, direction, configuration, position)
    values (p_version_id, p_code, trim(p_label), trim(p_value_source), p_direction, coalesce(p_configuration, '{}'::jsonb), p_position)
    returning id into result_id;
  else
    update public.sigec_tie_break_rules rule
    set code = p_code, label = trim(p_label), value_source = trim(p_value_source),
        direction = p_direction, configuration = coalesce(p_configuration, '{}'::jsonb), position = p_position
    where rule.id = p_rule_id and rule.rule_version_id = p_version_id returning id into result_id;
  end if;
  if result_id is null then raise exception 'SIGEC_TIE_BREAK_RULE_NOT_FOUND' using errcode = 'P0002'; end if;
  return result_id;
end;
$$;

create or replace function public.sigec_delete_scoring_rule_item(
  p_process_id uuid, p_actor_id uuid, p_version_id uuid, p_kind text, p_item_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if not exists (select 1 from public.sigec_scoring_rule_versions version where version.id = p_version_id and version.process_id = p_process_id and version.status = 'draft') then
    raise exception 'SIGEC_SCORING_VERSION_IMMUTABLE' using errcode = '55000';
  end if;
  if p_kind = 'criterion' then
    delete from public.sigec_scoring_rule_items item where item.id = p_item_id and item.rule_version_id = p_version_id;
  elsif p_kind = 'tie_break' then
    delete from public.sigec_tie_break_rules rule where rule.id = p_item_id and rule.rule_version_id = p_version_id;
  else
    raise exception 'SIGEC_SCORING_ITEM_KIND_INVALID' using errcode = '22023';
  end if;
  if not found then raise exception 'SIGEC_SCORING_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  return true;
end;
$$;

create or replace function public.sigec_confirm_scoring_version(
  p_process_id uuid, p_actor_id uuid, p_version_id uuid, p_target_status text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.sigec_scoring_rule_versions;
  configured_total numeric;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  if p_target_status not in ('internal', 'official') then
    raise exception 'SIGEC_SCORING_STATUS_INVALID' using errcode = '22023';
  end if;
  select * into target from public.sigec_scoring_rule_versions version
  where version.id = p_version_id and version.process_id = p_process_id and version.status = 'draft';
  if target.id is null then raise exception 'SIGEC_SCORING_DRAFT_NOT_FOUND' using errcode = 'P0002'; end if;
  select coalesce(sum(item.max_points), 0) into configured_total
  from public.sigec_scoring_rule_items item where item.rule_version_id = p_version_id;
  if configured_total <> target.total_max_points then
    raise exception 'SIGEC_SCORING_TOTAL_MISMATCH' using errcode = '23514';
  end if;
  if not exists (select 1 from public.sigec_tie_break_rules rule where rule.rule_version_id = p_version_id) then
    raise exception 'SIGEC_TIE_BREAK_REQUIRED' using errcode = '23514';
  end if;
  if p_target_status = 'official' and (target.is_provisional or not private.sigec_official_rules_are_confirmed(p_process_id)) then
    raise exception 'SIGEC_NORMATIVE_DECISIONS_PENDING' using errcode = '55000';
  end if;
  update public.sigec_scoring_rule_versions version
  set status = p_target_status, confirmed_by = p_actor_id, confirmed_at = now()
  where version.id = p_version_id;
  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.scoring_version.confirmed', 'sigec_scoring_rule_version', p_version_id::text,
     jsonb_build_object('process_id', p_process_id, 'status', p_target_status, 'total', configured_total));
  return p_version_id;
end;
$$;

create or replace function public.sigec_get_process_publication_readiness(p_process_id uuid)
returns table (code text, label text, ready boolean, detail text)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive target as (
    select process.* from public.sigec_processes process where process.id = p_process_id
  ), latest_decisions as (
    select distinct on (decision.code) decision.code, decision.status
    from public.sigec_process_decisions decision
    where decision.process_id = p_process_id
      and decision.code = any(array['SIGEC-DEC-01','SIGEC-DEC-02','SIGEC-DEC-03','SIGEC-DEC-04','SIGEC-DEC-05','SIGEC-DEC-06']::text[])
    order by decision.code, decision.revision desc
  ), decision_state as (
    select count(*) = 6 and bool_and(status = 'confirmed') as ready from latest_decisions
  ), reachable_stages(id) as (
    select stage.id from public.sigec_process_stages stage where stage.process_id = p_process_id and stage.is_initial
    union
    select transition.to_stage_id from reachable_stages reachable
    join public.sigec_process_stage_transitions transition on transition.from_stage_id = reachable.id and transition.process_id = p_process_id and transition.active
  ), stage_state as (
    select count(*) as stage_count, count(*) filter (where stage.is_initial) as initial_count,
      count(*) filter (where stage.is_terminal) as terminal_count,
      bool_and(char_length(trim(coalesce(stage.public_description, ''))) >= 3 and char_length(trim(coalesce(stage.whatsapp_template, ''))) >= 10) as messages_ready,
      not exists (select 1 from public.sigec_process_stages terminal join public.sigec_process_stage_transitions transition on transition.from_stage_id = terminal.id and transition.active where terminal.process_id = p_process_id and terminal.is_terminal) as terminal_flow_ready,
      not exists (select 1 from public.sigec_process_stages nonterminal where nonterminal.process_id = p_process_id and not nonterminal.is_terminal and not exists (select 1 from public.sigec_process_stage_transitions transition where transition.process_id = p_process_id and transition.from_stage_id = nonterminal.id and transition.active)) as exits_ready,
      not exists (select 1 from public.sigec_process_stages stage_check where stage_check.process_id = p_process_id and stage_check.id not in (select reachable.id from reachable_stages reachable)) as reachability_ready
    from public.sigec_process_stages stage where stage.process_id = p_process_id
  )
  select 'general_data', 'Dados gerais e versão do edital', exists (select 1 from target where char_length(trim(title)) >= 3 and char_length(trim(summary)) >= 3 and char_length(trim(edital_version)) >= 1), 'Informe título, resumo público e versão do edital.'
  union all select 'schedule', 'Cronograma de inscrições', exists (select 1 from target where applications_open_at is not null and applications_close_at is not null and applications_close_at > applications_open_at and applications_close_at > now()), 'Defina abertura e encerramento; o encerramento deve estar no futuro.'
  union all select 'vacancies', 'Vagas ativas', exists (select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active), 'Cadastre ao menos uma vaga ativa.'
  union all select 'requirements', 'Requisitos de formação', exists (select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active) and not exists (select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active and not exists (select 1 from public.sigec_process_course_requirements requirement where requirement.process_id = p_process_id and requirement.course_id = vacancy.course_id)), 'Toda formação vinculada a uma vaga ativa precisa de requisito e comprovante.'
  union all select 'documents', 'Documentos obrigatórios', exists (select 1 from public.sigec_document_requirements requirement where requirement.process_id = p_process_id and requirement.required), 'Cadastre ao menos um documento obrigatório.'
  union all select 'stages', 'Etapas, transições e mensagens', coalesce((select stage_count >= 2 and initial_count = 1 and terminal_count >= 1 and messages_ready and terminal_flow_ready and exits_ready and reachability_ready from stage_state), false), 'Defina uma etapa inicial, saídas válidas, terminal alcançável e mensagens públicas/WhatsApp.'
  union all select 'scoring', 'Pontuação e desempates oficiais', exists (select 1 from public.sigec_scoring_rule_versions version where version.process_id = p_process_id and version.status = 'official' and not version.is_provisional), 'Confirme uma versão oficial, não provisória, com critérios e desempates validados.'
  union all select 'normative_decisions', 'Decisões normativas', coalesce((select ready from decision_state), false), 'Confirme as seis decisões normativas antes de publicar.';
$$;

revoke all on function public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid) from public, anon, authenticated;
revoke all on function public.sigec_upsert_scoring_item(uuid,uuid,uuid,text,text,text,numeric,jsonb,integer,uuid) from public, anon, authenticated;
revoke all on function public.sigec_upsert_tie_break_rule(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid) from public, anon, authenticated;
revoke all on function public.sigec_delete_scoring_rule_item(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.sigec_confirm_scoring_version(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.sigec_get_process_publication_readiness(uuid) from public, anon, authenticated;
grant execute on function public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid) to service_role;
grant execute on function public.sigec_upsert_scoring_item(uuid,uuid,uuid,text,text,text,numeric,jsonb,integer,uuid) to service_role;
grant execute on function public.sigec_upsert_tie_break_rule(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid) to service_role;
grant execute on function public.sigec_delete_scoring_rule_item(uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function public.sigec_confirm_scoring_version(uuid,uuid,uuid,text) to service_role;
grant execute on function public.sigec_get_process_publication_readiness(uuid) to service_role;

comment on table public.sigec_scoring_rule_versions is 'Versões auditáveis da pontuação; versões confirmadas são imutáveis e somente official libera publicação.';
comment on table public.sigec_tie_break_rules is 'Ordem determinística de desempate vinculada à versão exata da regra de pontuação.';

commit;
