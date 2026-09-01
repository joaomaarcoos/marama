begin;

create or replace function public.sigec_get_application_advancement_readiness(
  p_actor_id uuid,
  p_application_id uuid
)
returns table(
  ready boolean,
  document_blockers integer,
  diligence_blockers integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  target record;
  blocked_documents integer;
  blocked_diligences integer;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_ADVANCEMENT_STAFF_REQUIRED' using errcode = '42501';
  end if;

  select application.id, application.process_id, application.application_state
    into target
  from public.sigec_applications application
  where application.id = p_application_id;
  if not found then
    raise exception 'SIGEC_ADVANCEMENT_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer into blocked_documents
  from public.sigec_document_requirements requirement
  where requirement.process_id = target.process_id
    and requirement.required
    and private.sigec_application_matches_audience(
      p_application_id,
      coalesce(requirement.condition_config ->> 'audience', 'all')
    )
    and not exists (
      select 1
      from public.sigec_application_documents document
      where document.application_id = p_application_id
        and document.requirement_id = requirement.id
        and document.removed_at is null
        and document.technical_status = 'validated'
        and document.malware_status = 'clean'
        and document.review_status = 'valid'
        and not exists (
          select 1 from public.sigec_application_documents successor
          where successor.supersedes_document_id = document.id
            and successor.removed_at is null
        )
    );

  select count(*)::integer into blocked_diligences
  from public.sigec_information_requests request
  where request.application_id = p_application_id
    and request.status in ('open', 'answered');

  return query select
    target.application_state = 'submitted'
      and blocked_documents = 0
      and blocked_diligences = 0,
    blocked_documents,
    blocked_diligences;
end;
$$;

create or replace function public.sigec_advance_application_stage(
  p_actor_id uuid,
  p_application_id uuid,
  p_to_stage_id uuid,
  p_public_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
  transition_record record;
  readiness record;
  normalized_reason text := trim(coalesce(p_public_reason, ''));
  event_time timestamptz := clock_timestamp();
  current_submission_version integer;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_ADVANCEMENT_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null or p_to_stage_id is null
    or char_length(normalized_reason) not between 3 and 2000 then
    raise exception 'SIGEC_ADVANCEMENT_INPUT_INVALID' using errcode = '22023';
  end if;

  select application.id, application.process_id, application.stage_id,
         application.application_state
    into target
  from public.sigec_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'SIGEC_ADVANCEMENT_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.application_state <> 'submitted' or target.stage_id is null then
    raise exception 'SIGEC_ADVANCEMENT_SUBMITTED_REQUIRED' using errcode = '23514';
  end if;

  select transition.id
    into transition_record
  from public.sigec_process_stage_transitions transition
  where transition.process_id = target.process_id
    and transition.from_stage_id = target.stage_id
    and transition.to_stage_id = p_to_stage_id
    and transition.active;
  if not found then
    raise exception 'SIGEC_ADVANCEMENT_TRANSITION_NOT_ALLOWED' using errcode = '23514';
  end if;

  select gate.ready, gate.document_blockers, gate.diligence_blockers
    into readiness
  from public.sigec_get_application_advancement_readiness(p_actor_id, p_application_id) gate;
  if not readiness.ready then
    raise exception 'SIGEC_APPLICATION_ADVANCEMENT_BLOCKED' using errcode = '23514';
  end if;

  select max(submission.version) into current_submission_version
  from public.sigec_application_submissions submission
  where submission.application_id = p_application_id;

  update public.sigec_applications application
  set stage_id = p_to_stage_id, updated_at = event_time
  where application.id = p_application_id;

  insert into public.sigec_application_status_history(
    application_id, from_stage_id, to_stage_id, public_message, changed_by, created_at
  ) values (
    p_application_id, target.stage_id, p_to_stage_id, normalized_reason, p_actor_id, event_time
  );

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'application_stage_advanced', 'sigec_application', p_application_id::text,
    jsonb_build_object(
      'fromStageId', target.stage_id,
      'toStageId', p_to_stage_id,
      'transitionId', transition_record.id,
      'submissionVersion', current_submission_version,
      'changedFields', jsonb_build_array('stage_id'),
      'hasPublicReason', true
    ),
    event_time
  );

  return p_to_stage_id;
end;
$$;

revoke all on function public.sigec_get_application_advancement_readiness(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.sigec_get_application_advancement_readiness(uuid,uuid)
  to service_role;
revoke all on function public.sigec_advance_application_stage(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.sigec_advance_application_stage(uuid,uuid,uuid,text)
  to service_role;

comment on function public.sigec_get_application_advancement_readiness(uuid,uuid) is
  'Server-only staff gate counting required documents without a current valid review and active diligences.';
comment on function public.sigec_advance_application_stage(uuid,uuid,uuid,text) is
  'Server-only atomic application stage transition with configured transition, pending gate, public reason and audit evidence.';

commit;
