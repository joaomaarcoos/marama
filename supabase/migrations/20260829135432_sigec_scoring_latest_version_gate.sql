begin;

-- Versões oficiais antigas permanecem imutáveis como histórico. Apenas a versão
-- mais recente do processo pode satisfazer o gate de publicação.
drop index if exists public.sigec_scoring_rule_one_official_idx;

create or replace function private.sigec_latest_scoring_is_official(target_process_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select version.status = 'official' and not version.is_provisional
    from public.sigec_scoring_rule_versions version
    where version.process_id = target_process_id
    order by version.version desc
    limit 1
  ), false);
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
  union all select 'scoring', 'Pontuação e desempates oficiais', private.sigec_latest_scoring_is_official(p_process_id), 'A versão mais recente deve estar confirmada como oficial e não provisória.'
  union all select 'normative_decisions', 'Decisões normativas', coalesce((select ready from decision_state), false), 'Confirme as seis decisões normativas antes de publicar.';
$$;

revoke all on function public.sigec_get_process_publication_readiness(uuid) from public, anon, authenticated;
grant execute on function public.sigec_get_process_publication_readiness(uuid) to service_role;

commit;
