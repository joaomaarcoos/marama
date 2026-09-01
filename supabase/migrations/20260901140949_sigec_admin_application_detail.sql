begin;

create or replace function public.sigec_get_application_review_detail(
  p_actor_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  detail jsonb;
begin
  if p_actor_id is null or not exists (
    select 1
    from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_APPLICATION_DETAIL_STAFF_REQUIRED' using errcode = '42501';
  end if;

  if p_application_id is null then
    raise exception 'SIGEC_APPLICATION_DETAIL_ID_REQUIRED' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'application', jsonb_build_object(
      'id', application.id,
      'candidateName', profile.full_name,
      'processId', process.id,
      'processTitle', process.title,
      'applicationState', application.application_state,
      'stageId', stage.id,
      'stageLabel', stage.label,
      'scoreTotal', application.score_total,
      'submittedAt', application.submitted_at,
      'createdAt', application.created_at,
      'updatedAt', application.updated_at
    ),
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', preference.position,
        'municipality', vacancy.municipality,
        'course', course.canonical_name,
        'modality', modality.name
      ) order by preference.position)
      from public.sigec_application_preferences preference
      join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
      join public.sigec_courses course on course.id = vacancy.course_id
      join public.sigec_modalities modality on modality.id = vacancy.modality_id
      where preference.application_id = application.id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId', question.id,
        'label', question.label,
        'questionType', question.question_type,
        'answer', answer.answer,
        'updatedAt', answer.updated_at
      ) order by question.position, question.id)
      from public.sigec_application_answers answer
      join public.sigec_process_questions question on question.id = answer.question_id
      where answer.application_id = application.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentId', document.id,
        'requirementId', requirement.id,
        'requirementLabel', coalesce(requirement.label, 'Documento complementar'),
        'version', document.version,
        'mimeType', document.mime_type,
        'sizeBytes', document.size_bytes,
        'technicalStatus', document.technical_status,
        'malwareStatus', document.malware_status,
        'reviewStatus', document.review_status,
        'reviewMessage', document.review_message,
        'reviewedAt', document.reviewed_at,
        'createdAt', document.created_at,
        'removedAt', document.removed_at,
        'isCurrent', document.removed_at is null and not exists (
          select 1
          from public.sigec_application_documents successor
          where successor.supersedes_document_id = document.id
            and successor.removed_at is null
        )
      ) order by requirement.position nulls last, document.version desc, document.created_at desc)
      from public.sigec_application_documents document
      left join public.sigec_document_requirements requirement on requirement.id = document.requirement_id
      where document.application_id = application.id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', consent.consent_type,
        'documentVersion', consent.document_version,
        'accepted', consent.accepted,
        'acceptedAt', consent.accepted_at
      ) order by consent.accepted_at, consent.id)
      from public.sigec_consents consent
      where consent.application_id = application.id
    ), '[]'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', submission.version,
        'protocol', submission.protocol,
        'editalVersion', submission.edital_version,
        'snapshotSha256', submission.snapshot_sha256,
        'submittedAt', submission.submitted_at,
        'isCurrent', submission.version = latest.latest_version
      ) order by submission.version desc)
      from public.sigec_application_submissions submission
      cross join lateral (
        select max(candidate.version) as latest_version
        from public.sigec_application_submissions candidate
        where candidate.application_id = application.id
      ) latest
      where submission.application_id = application.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fromStage', from_stage.label,
        'toStage', to_stage.label,
        'publicMessage', history.public_message,
        'changedByRole', coalesce(actor.raw_app_meta_data ->> 'role', 'sistema'),
        'createdAt', history.created_at
      ) order by history.created_at desc, history.id desc)
      from public.sigec_application_status_history history
      left join public.sigec_process_stages from_stage on from_stage.id = history.from_stage_id
      join public.sigec_process_stages to_stage on to_stage.id = history.to_stage_id
      left join auth.users actor on actor.id = history.changed_by
      where history.application_id = application.id
    ), '[]'::jsonb)
  )
  into detail
  from public.sigec_applications application
  join public.sigec_candidate_profiles profile on profile.user_id = application.candidate_id
  join public.sigec_processes process on process.id = application.process_id
  left join public.sigec_process_stages stage on stage.id = application.stage_id
  where application.id = p_application_id;

  if not found then
    raise exception 'SIGEC_APPLICATION_DETAIL_NOT_FOUND' using errcode = 'P0002';
  end if;

  return detail;
end;
$$;

revoke all on function public.sigec_get_application_review_detail(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.sigec_get_application_review_detail(uuid, uuid)
  to service_role;

comment on function public.sigec_get_application_review_detail(uuid, uuid) is
  'Server-only read model for SIGEC application review. Omits CPF, contact data, addresses, storage paths, original filenames, consent fingerprints and raw audit metadata.';

commit;
