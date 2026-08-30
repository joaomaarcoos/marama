begin;

alter table public.sigec_process_stages
  add column if not exists is_initial boolean not null default false;

create unique index if not exists sigec_process_stages_one_initial_idx
  on public.sigec_process_stages(process_id) where is_initial;

alter table public.sigec_process_stages
  drop constraint if exists sigec_process_stages_process_id_id_key;
alter table public.sigec_process_stages
  add constraint sigec_process_stages_process_id_id_key unique (process_id, id);

create table public.sigec_process_stage_transitions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  from_stage_id uuid not null,
  to_stage_id uuid not null,
  requires_reason boolean not null default false,
  blocks_on_pending boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_stage_id <> to_stage_id),
  unique (process_id, from_stage_id, to_stage_id),
  foreign key (process_id, from_stage_id)
    references public.sigec_process_stages(process_id, id) on delete cascade,
  foreign key (process_id, to_stage_id)
    references public.sigec_process_stages(process_id, id) on delete cascade
);

create index sigec_stage_transitions_from_idx
  on public.sigec_process_stage_transitions(process_id, from_stage_id) where active;
create index sigec_stage_transitions_to_idx
  on public.sigec_process_stage_transitions(process_id, to_stage_id) where active;
alter table public.sigec_process_stage_transitions enable row level security;
revoke all on public.sigec_process_stage_transitions from public, anon, authenticated;
grant all on public.sigec_process_stage_transitions to service_role;

create or replace function public.sigec_upsert_stage_configuration(
  p_process_id uuid,
  p_actor_id uuid,
  p_code text,
  p_label text,
  p_public_description text,
  p_color text,
  p_position integer,
  p_is_initial boolean,
  p_is_terminal boolean,
  p_allows_appeal boolean,
  p_whatsapp_template text,
  p_stage_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
  sanitized_template text;
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  sanitized_template := regexp_replace(
    coalesce(p_whatsapp_template, ''),
    '\{\{(nome|processo|status|link|prazo)\}\}', '', 'g'
  );
  if coalesce(p_code, '') !~ '^[a-z][a-z0-9_]*$'
    or char_length(trim(coalesce(p_label, ''))) not between 3 and 200
    or (p_public_description is not null and
        char_length(trim(p_public_description)) not between 3 and 2000)
    or coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$'
    or p_position is null or p_position < 0
    or p_is_initial is null or p_is_terminal is null or p_allows_appeal is null
    or (p_is_initial and p_is_terminal)
    or (p_whatsapp_template is not null and
        char_length(trim(p_whatsapp_template)) not between 10 and 2000)
    or sanitized_template ~ '\{\{|\}\}' then
    raise exception 'SIGEC_STAGE_CONFIGURATION_INVALID' using errcode = '22023';
  end if;

  if p_stage_id is not null and p_is_terminal and exists (
    select 1 from public.sigec_process_stage_transitions transition
    where transition.process_id = p_process_id
      and transition.from_stage_id = p_stage_id and transition.active
  ) then
    raise exception 'SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION' using errcode = '23514';
  end if;

  if p_is_initial then
    update public.sigec_process_stages stage
    set is_initial = false, updated_at = now()
    where stage.process_id = p_process_id
      and stage.is_initial
      and (p_stage_id is null or stage.id <> p_stage_id);
  end if;

  if p_stage_id is null then
    insert into public.sigec_process_stages
      (process_id, code, label, public_description, color, position, is_initial,
       is_terminal, allows_appeal, whatsapp_template)
    values
      (p_process_id, p_code, trim(p_label), nullif(trim(p_public_description), ''),
       lower(p_color), p_position, p_is_initial, p_is_terminal, p_allows_appeal,
       nullif(trim(p_whatsapp_template), ''))
    returning id into result_id;
  else
    update public.sigec_process_stages stage
    set code = p_code, label = trim(p_label),
        public_description = nullif(trim(p_public_description), ''),
        color = lower(p_color), position = p_position, is_initial = p_is_initial,
        is_terminal = p_is_terminal, allows_appeal = p_allows_appeal,
        whatsapp_template = nullif(trim(p_whatsapp_template), ''), updated_at = now()
    where stage.id = p_stage_id and stage.process_id = p_process_id
    returning id into result_id;
  end if;
  if result_id is null then
    raise exception 'SIGEC_STAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.stage.saved', 'sigec_process_stage', result_id::text,
     jsonb_build_object('process_id', p_process_id, 'code', p_code));
  return result_id;
end;
$$;

create or replace function public.sigec_delete_stage_configuration(
  p_process_id uuid, p_actor_id uuid, p_stage_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  delete from public.sigec_process_stages stage
  where stage.id = p_stage_id and stage.process_id = p_process_id;
  if not found then raise exception 'SIGEC_STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.stage.deleted', 'sigec_process_stage', p_stage_id::text,
     jsonb_build_object('process_id', p_process_id));
  return true;
exception when foreign_key_violation then
  raise exception 'SIGEC_STAGE_IN_USE' using errcode = '23503';
end;
$$;

create or replace function public.sigec_upsert_stage_transition(
  p_process_id uuid,
  p_actor_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_requires_reason boolean,
  p_blocks_on_pending boolean,
  p_active boolean,
  p_transition_id uuid default null
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
  if p_from_stage_id = p_to_stage_id
    or p_requires_reason is null or p_blocks_on_pending is null or p_active is null
    or not exists (
      select 1 from public.sigec_process_stages stage
      where stage.id = p_from_stage_id and stage.process_id = p_process_id
    )
    or not exists (
      select 1 from public.sigec_process_stages stage
      where stage.id = p_to_stage_id and stage.process_id = p_process_id
    ) then
    raise exception 'SIGEC_STAGE_TRANSITION_INVALID' using errcode = '22023';
  end if;
  if p_active and exists (
    select 1 from public.sigec_process_stages stage
    where stage.id = p_from_stage_id and stage.process_id = p_process_id and stage.is_terminal
  ) then
    raise exception 'SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION' using errcode = '23514';
  end if;

  if p_transition_id is null then
    insert into public.sigec_process_stage_transitions
      (process_id, from_stage_id, to_stage_id, requires_reason, blocks_on_pending, active)
    values
      (p_process_id, p_from_stage_id, p_to_stage_id, p_requires_reason, p_blocks_on_pending, p_active)
    returning id into result_id;
  else
    update public.sigec_process_stage_transitions transition
    set from_stage_id = p_from_stage_id, to_stage_id = p_to_stage_id,
        requires_reason = p_requires_reason, blocks_on_pending = p_blocks_on_pending,
        active = p_active, updated_at = now()
    where transition.id = p_transition_id and transition.process_id = p_process_id
    returning id into result_id;
  end if;
  if result_id is null then
    raise exception 'SIGEC_STAGE_TRANSITION_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.stage_transition.saved', 'sigec_process_stage_transition', result_id::text,
     jsonb_build_object('process_id', p_process_id, 'from_stage_id', p_from_stage_id, 'to_stage_id', p_to_stage_id));
  return result_id;
end;
$$;

create or replace function public.sigec_delete_stage_transition(
  p_process_id uuid, p_actor_id uuid, p_transition_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.sigec_assert_draft_process_manager(p_process_id, p_actor_id);
  delete from public.sigec_process_stage_transitions transition
  where transition.id = p_transition_id and transition.process_id = p_process_id;
  if not found then
    raise exception 'SIGEC_STAGE_TRANSITION_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values
    (p_actor_id,
     (select user_record.raw_app_meta_data ->> 'role' from auth.users user_record where user_record.id = p_actor_id),
     'sigec.stage_transition.deleted', 'sigec_process_stage_transition', p_transition_id::text,
     jsonb_build_object('process_id', p_process_id));
  return true;
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
      and decision.code = any(array[
        'SIGEC-DEC-01', 'SIGEC-DEC-02', 'SIGEC-DEC-03',
        'SIGEC-DEC-04', 'SIGEC-DEC-05', 'SIGEC-DEC-06'
      ]::text[])
    order by decision.code, decision.revision desc
  ), decision_state as (
    select count(*) = 6 and bool_and(status = 'confirmed') as ready from latest_decisions
  ), reachable_stages(id) as (
    select stage.id from public.sigec_process_stages stage
    where stage.process_id = p_process_id and stage.is_initial
    union
    select transition.to_stage_id
    from reachable_stages reachable
    join public.sigec_process_stage_transitions transition
      on transition.from_stage_id = reachable.id
     and transition.process_id = p_process_id and transition.active
  ), stage_state as (
    select
      count(*) as stage_count,
      count(*) filter (where stage.is_initial) as initial_count,
      count(*) filter (where stage.is_terminal) as terminal_count,
      bool_and(char_length(trim(coalesce(stage.public_description, ''))) >= 3
        and char_length(trim(coalesce(stage.whatsapp_template, ''))) >= 10) as messages_ready,
      not exists (
        select 1 from public.sigec_process_stages terminal
        join public.sigec_process_stage_transitions transition
          on transition.from_stage_id = terminal.id and transition.active
        where terminal.process_id = p_process_id and terminal.is_terminal
      ) as terminal_flow_ready,
      not exists (
        select 1 from public.sigec_process_stages nonterminal
        where nonterminal.process_id = p_process_id and not nonterminal.is_terminal
          and not exists (
            select 1 from public.sigec_process_stage_transitions transition
            where transition.process_id = p_process_id
              and transition.from_stage_id = nonterminal.id and transition.active
          )
      ) as exits_ready,
      not exists (
        select 1 from public.sigec_process_stages stage_check
        where stage_check.process_id = p_process_id
          and stage_check.id not in (select reachable.id from reachable_stages reachable)
      ) as reachability_ready
    from public.sigec_process_stages stage where stage.process_id = p_process_id
  )
  select 'general_data', 'Dados gerais e versão do edital',
    exists (select 1 from target where char_length(trim(title)) >= 3 and char_length(trim(summary)) >= 3 and char_length(trim(edital_version)) >= 1),
    'Informe título, resumo público e versão do edital.'
  union all
  select 'schedule', 'Cronograma de inscrições',
    exists (select 1 from target where applications_open_at is not null and applications_close_at is not null and applications_close_at > applications_open_at and applications_close_at > now()),
    'Defina abertura e encerramento; o encerramento deve estar no futuro.'
  union all
  select 'vacancies', 'Vagas ativas',
    exists (select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active),
    'Cadastre ao menos uma vaga ativa.'
  union all
  select 'requirements', 'Requisitos de formação',
    exists (select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active)
    and not exists (
      select 1 from public.sigec_vacancies vacancy where vacancy.process_id = p_process_id and vacancy.active
      and not exists (
        select 1 from public.sigec_process_course_requirements requirement
        where requirement.process_id = p_process_id and requirement.course_id = vacancy.course_id
      )
    ), 'Toda formação vinculada a uma vaga ativa precisa de requisito e comprovante.'
  union all
  select 'documents', 'Documentos obrigatórios',
    exists (select 1 from public.sigec_document_requirements requirement where requirement.process_id = p_process_id and requirement.required),
    'Cadastre ao menos um documento obrigatório.'
  union all
  select 'stages', 'Etapas, transições e mensagens',
    coalesce((select stage_count >= 2 and initial_count = 1 and terminal_count >= 1
      and messages_ready and terminal_flow_ready and exits_ready and reachability_ready from stage_state), false),
    'Defina uma etapa inicial, saídas válidas, terminal alcançável e mensagens públicas/WhatsApp.'
  union all
  select 'scoring', 'Critérios de pontuação',
    coalesce((select count(*) > 0 and sum(criterion.max_points) > 0 from public.sigec_scoring_criteria criterion where criterion.process_id = p_process_id and criterion.active), false),
    'Configure critérios ativos com pontuação máxima maior que zero.'
  union all
  select 'normative_decisions', 'Decisões normativas', coalesce((select ready from decision_state), false),
    'Confirme as seis decisões normativas antes de publicar.';
$$;

revoke all on function public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid) from public, anon, authenticated;
revoke all on function public.sigec_delete_stage_configuration(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid) from public, anon, authenticated;
revoke all on function public.sigec_delete_stage_transition(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid) to service_role;
grant execute on function public.sigec_delete_stage_configuration(uuid,uuid,uuid) to service_role;
grant execute on function public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid) to service_role;
grant execute on function public.sigec_delete_stage_transition(uuid,uuid,uuid) to service_role;

commit;
