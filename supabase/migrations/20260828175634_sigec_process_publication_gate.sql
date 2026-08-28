begin;

create or replace function public.sigec_get_process_publication_readiness(p_process_id uuid)
returns table (
  code text,
  label text,
  ready boolean,
  detail text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select process.*
    from public.sigec_processes process
    where process.id = p_process_id
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
    select count(*) = 6 and bool_and(status = 'confirmed') as ready
    from latest_decisions
  )
  select 'general_data', 'Dados gerais e versão do edital',
    exists (
      select 1 from target
      where char_length(trim(title)) >= 3
        and char_length(trim(summary)) >= 3
        and char_length(trim(edital_version)) >= 1
    ),
    'Informe título, resumo público e versão do edital.'
  union all
  select 'schedule', 'Cronograma de inscrições',
    exists (
      select 1 from target
      where applications_open_at is not null
        and applications_close_at is not null
        and applications_close_at > applications_open_at
        and applications_close_at > now()
    ),
    'Defina abertura e encerramento; o encerramento deve estar no futuro.'
  union all
  select 'vacancies', 'Vagas ativas',
    exists (
      select 1 from public.sigec_vacancies vacancy
      where vacancy.process_id = p_process_id and vacancy.active
    ),
    'Cadastre ao menos uma vaga ativa.'
  union all
  select 'requirements', 'Requisitos de formação',
    exists (
      select 1 from public.sigec_vacancies vacancy
      where vacancy.process_id = p_process_id and vacancy.active
    ) and not exists (
      select 1
      from public.sigec_vacancies vacancy
      where vacancy.process_id = p_process_id
        and vacancy.active
        and not exists (
          select 1
          from public.sigec_process_course_requirements requirement
          where requirement.process_id = p_process_id
            and requirement.course_id = vacancy.course_id
        )
    ),
    'Toda formação vinculada a uma vaga ativa precisa de requisito e comprovante.'
  union all
  select 'documents', 'Documentos obrigatórios',
    exists (
      select 1 from public.sigec_document_requirements requirement
      where requirement.process_id = p_process_id and requirement.required
    ),
    'Cadastre ao menos um documento obrigatório.'
  union all
  select 'stages', 'Etapas do processo',
    exists (
      select 1 from public.sigec_process_stages stage
      where stage.process_id = p_process_id and not stage.is_terminal
    ) and exists (
      select 1 from public.sigec_process_stages stage
      where stage.process_id = p_process_id and stage.is_terminal
    ),
    'Configure ao menos uma etapa ativa e uma etapa terminal.'
  union all
  select 'scoring', 'Critérios de pontuação',
    coalesce((
      select count(*) > 0 and sum(criterion.max_points) > 0
      from public.sigec_scoring_criteria criterion
      where criterion.process_id = p_process_id and criterion.active
    ), false),
    'Configure critérios ativos com pontuação máxima maior que zero.'
  union all
  select 'normative_decisions', 'Decisões normativas',
    coalesce((select ready from decision_state), false),
    'Confirme as seis decisões normativas antes de publicar.';
$$;

create or replace function public.sigec_publish_process(
  p_process_id uuid,
  p_actor_id uuid
)
returns table (
  process_id uuid,
  status text,
  published_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.sigec_processes%rowtype;
  actor_role text;
  blockers text;
begin
  select user_record.raw_app_meta_data ->> 'role'
  into actor_role
  from auth.users user_record
  where user_record.id = p_actor_id;

  if actor_role is null or actor_role not in ('admin', 'gerente') then
    raise exception 'SIGEC_PROCESS_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  select process.*
  into target
  from public.sigec_processes process
  where process.id = p_process_id
  for update;

  if not found then
    raise exception 'SIGEC_PROCESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target.status <> 'draft' then
    raise exception 'SIGEC_PROCESS_NOT_DRAFT' using errcode = '55000';
  end if;

  select string_agg(readiness.code, ',' order by readiness.code)
  into blockers
  from public.sigec_get_process_publication_readiness(p_process_id) readiness
  where not readiness.ready;

  if blockers is not null then
    raise exception 'SIGEC_PROCESS_NOT_READY'
      using errcode = '55000', detail = blockers;
  end if;

  update public.sigec_processes process
  set status = 'open', published_at = now()
  where process.id = p_process_id;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    actor_role,
    'sigec.process.published',
    'sigec_process',
    p_process_id::text,
    jsonb_build_object(
      'edital_version', target.edital_version,
      'applications_open_at', target.applications_open_at,
      'applications_close_at', target.applications_close_at
    )
  );

  return query
  select process.id, process.status, process.published_at
  from public.sigec_processes process
  where process.id = p_process_id;
end;
$$;

create or replace function public.sigec_close_process(
  p_process_id uuid,
  p_actor_id uuid
)
returns table (
  process_id uuid,
  status text,
  closed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text;
  previous_status text;
  transition_at timestamptz := now();
begin
  select user_record.raw_app_meta_data ->> 'role'
  into actor_role
  from auth.users user_record
  where user_record.id = p_actor_id;

  if actor_role is null or actor_role not in ('admin', 'gerente') then
    raise exception 'SIGEC_PROCESS_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  select process.status
  into previous_status
  from public.sigec_processes process
  where process.id = p_process_id
  for update;

  if not found then
    raise exception 'SIGEC_PROCESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if previous_status <> 'open' then
    raise exception 'SIGEC_PROCESS_NOT_OPEN' using errcode = '55000';
  end if;

  update public.sigec_processes process
  set status = 'closed'
  where process.id = p_process_id;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    actor_role,
    'sigec.process.closed',
    'sigec_process',
    p_process_id::text,
    jsonb_build_object('transition_at', transition_at)
  );

  return query select p_process_id, 'closed'::text, transition_at;
end;
$$;

revoke all on function public.sigec_get_process_publication_readiness(uuid) from public, anon, authenticated;
revoke all on function public.sigec_publish_process(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sigec_close_process(uuid, uuid) from public, anon, authenticated;

grant execute on function public.sigec_get_process_publication_readiness(uuid) to service_role;
grant execute on function public.sigec_publish_process(uuid, uuid) to service_role;
grant execute on function public.sigec_close_process(uuid, uuid) to service_role;

commit;
