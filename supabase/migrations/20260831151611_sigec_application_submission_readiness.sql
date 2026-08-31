begin;

create or replace function public.sigec_get_application_submission_readiness(
  p_application_id uuid
)
returns table(
  code text,
  label text,
  ready boolean,
  detail text,
  action_href text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  target record;
  preference_count integer;
  missing_answers integer;
  missing_documents integer;
  consent_count integer;
begin
  if actor_id is null or actor_role <> 'candidato' then
    raise exception 'SIGEC_READINESS_CANDIDATE_REQUIRED' using errcode = '42501';
  end if;

  select application.id, application.application_state, application.candidate_id,
         process.id as process_id, process.status as process_status,
         process.applications_open_at, process.applications_close_at,
         process.max_preferences, process.edital_version
    into target
  from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = p_application_id and application.candidate_id = actor_id;
  if not found then
    raise exception 'SIGEC_READINESS_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;

  select count(*) into preference_count
  from public.sigec_application_preferences preference
  where preference.application_id = p_application_id;

  select count(*) into missing_answers
  from public.sigec_process_questions question
  left join public.sigec_application_answers answer
    on answer.application_id = p_application_id and answer.question_id = question.id
  where question.process_id = target.process_id
    and question.required
    and private.sigec_application_matches_audience(
      p_application_id, coalesce(question.config ->> 'audience', 'all')
    )
    and not private.sigec_answer_matches_question(answer.answer, question.question_type, question.config);

  select count(*) into missing_documents
  from public.sigec_document_requirements requirement
  where requirement.process_id = target.process_id
    and requirement.required
    and private.sigec_application_matches_audience(
      p_application_id, coalesce(requirement.condition_config ->> 'audience', 'all')
    )
    and not exists (
      select 1
      from public.sigec_application_documents document
      where document.application_id = p_application_id
        and document.requirement_id = requirement.id
        and document.removed_at is null
        and document.technical_status = 'validated'
        and document.malware_status = 'clean'
    );

  select count(*) into consent_count
  from public.sigec_consents consent
  where consent.application_id = p_application_id
    and consent.accepted = true
    and (
      (consent.consent_type = 'edital' and consent.document_version = 'edital:' || target.edital_version)
      or (consent.consent_type = 'truthfulness' and consent.document_version = 'declaracao-veracidade:1')
      or (consent.consent_type = 'requirements' and consent.document_version = 'requisitos:' || target.edital_version)
      or (consent.consent_type = 'lgpd' and consent.document_version = 'aviso-privacidade:1')
    );

  return query
  select 'application'::text, 'Prazo da inscrição'::text,
    target.application_state = 'draft'
      and target.process_status = 'open'
      and (target.applications_open_at is null or target.applications_open_at <= now())
      and (target.applications_close_at is null or target.applications_close_at > now()),
    case when target.application_state <> 'draft' then 'Esta candidatura já saiu do rascunho.'
         when target.process_status <> 'open' then 'O processo não está aberto.'
         when target.applications_open_at is not null and target.applications_open_at > now() then 'As inscrições ainda não começaram.'
         when target.applications_close_at is not null and target.applications_close_at <= now() then 'O prazo de inscrição terminou.'
         else 'O processo está aberto para receber sua inscrição.' end,
    null::text
  union all
  select 'profile', 'Seus dados',
    exists (
      select 1 from public.sigec_candidate_profiles profile
      where profile.user_id = actor_id
        and profile.profile_completed_at is not null
        and profile.whatsapp_verified_at is not null
    ),
    case when exists (
      select 1 from public.sigec_candidate_profiles profile
      where profile.user_id = actor_id
        and profile.profile_completed_at is not null
        and profile.whatsapp_verified_at is not null
    ) then 'Perfil e WhatsApp estão completos.' else 'Complete seus dados e confirme o WhatsApp.' end,
    '/minha-area/perfil'
  union all
  select 'preferences', 'Vagas escolhidas',
    preference_count between 1 and target.max_preferences,
    case when preference_count = 0 then 'Escolha pelo menos uma vaga.'
         when preference_count > target.max_preferences then 'A quantidade de vagas ultrapassa o limite deste processo.'
         else preference_count::text || ' opção(ões) salva(s).' end,
    '/minha-area/inscricoes/' || p_application_id::text
  union all
  select 'answers', 'Perguntas', missing_answers = 0,
    case when missing_answers = 0 then 'Todas as perguntas obrigatórias estão respondidas.'
         else missing_answers::text || ' pergunta(s) obrigatória(s) ainda precisam de resposta.' end,
    '/minha-area/inscricoes/' || p_application_id::text
  union all
  select 'documents', 'Documentos', missing_documents = 0,
    case when missing_documents = 0 then 'Todos os documentos obrigatórios foram enviados e verificados.'
         else missing_documents::text || ' documento(s) obrigatório(s) ainda não estão prontos.' end,
    '/minha-area/documentos'
  union all
  select 'consents', 'Confirmações finais', consent_count = 4,
    case when consent_count = 4 then 'Os quatro aceites obrigatórios estão registrados.'
         else 'Os aceites serão confirmados na etapa final de envio.' end,
    null::text;
end;
$$;

create or replace function private.sigec_assert_application_ready_for_submission(
  p_application_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  pending_codes text;
begin
  select string_agg(readiness.code, ',' order by readiness.code)
    into pending_codes
  from public.sigec_get_application_submission_readiness(p_application_id) readiness
  where not readiness.ready;

  if pending_codes is not null then
    raise exception 'SIGEC_APPLICATION_NOT_READY:%', pending_codes using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.sigec_get_application_submission_readiness(uuid) from public, anon;
grant execute on function public.sigec_get_application_submission_readiness(uuid) to authenticated;
revoke all on function private.sigec_assert_application_ready_for_submission(uuid) from public, anon;
grant execute on function private.sigec_assert_application_ready_for_submission(uuid) to authenticated, service_role;

comment on function public.sigec_get_application_submission_readiness(uuid) is
  'Returns candidate-safe submission prerequisites for one owned application without exposing answer or document contents.';
comment on function private.sigec_assert_application_ready_for_submission(uuid) is
  'Reusable database gate for the atomic protocol/submission transaction implemented in P4-05; that transaction must record consents before asserting readiness.';

commit;
