begin;

create or replace function public.sigec_list_applications_for_review(
  p_actor_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_process_id uuid default null,
  p_municipality text default null,
  p_course_id uuid default null,
  p_modality_id uuid default null,
  p_competition text default 'all',
  p_application_state text default null,
  p_stage_id uuid default null,
  p_pending text default 'all',
  p_search text default null
)
returns table(
  application_id uuid,
  candidate_name text,
  process_id uuid,
  process_title text,
  application_state text,
  stage_id uuid,
  stage_label text,
  protocol text,
  submitted_at timestamptz,
  created_at timestamptz,
  score_total numeric,
  competition_scopes text[],
  preferences jsonb,
  open_request_count integer,
  overdue_request_count integer,
  pending_document_count integer,
  has_pending boolean,
  total_count bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_APPLICATION_LIST_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_page not between 1 and 100000 or p_page_size not between 1 and 100 then
    raise exception 'SIGEC_APPLICATION_LIST_PAGE_INVALID' using errcode = '22023';
  end if;
  if p_competition not in ('all', 'geral', 'pcd', 'ppp') then
    raise exception 'SIGEC_APPLICATION_LIST_COMPETITION_INVALID' using errcode = '22023';
  end if;
  if p_pending not in ('all', 'with', 'without') then
    raise exception 'SIGEC_APPLICATION_LIST_PENDING_INVALID' using errcode = '22023';
  end if;
  if p_application_state is not null
    and p_application_state not in ('draft', 'submitted', 'withdrawn') then
    raise exception 'SIGEC_APPLICATION_LIST_STATE_INVALID' using errcode = '22023';
  end if;
  if p_search is not null and char_length(trim(p_search)) > 100 then
    raise exception 'SIGEC_APPLICATION_LIST_SEARCH_INVALID' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select
      application.id as application_id,
      profile.full_name as candidate_name,
      process.id as process_id,
      process.title as process_title,
      application.application_state,
      stage.id as stage_id,
      stage.label as stage_label,
      submission.protocol,
      submission.submitted_at,
      application.created_at,
      application.score_total,
      case
        when coalesce(competition.pcd, false) and coalesce(competition.ppp, false) then array['pcd', 'ppp']::text[]
        when coalesce(competition.pcd, false) then array['pcd']::text[]
        when coalesce(competition.ppp, false) then array['ppp']::text[]
        else array['geral']::text[]
      end as competition_scopes,
      coalesce(preference_data.items, '[]'::jsonb) as preferences,
      coalesce(request_data.open_count, 0)::integer as open_request_count,
      coalesce(request_data.overdue_count, 0)::integer as overdue_request_count,
      coalesce(document_data.pending_count, 0)::integer as pending_document_count,
      (
        coalesce(request_data.open_count, 0) > 0
        or coalesce(document_data.pending_count, 0) > 0
      ) as has_pending
    from public.sigec_applications application
    join public.sigec_candidate_profiles profile on profile.user_id = application.candidate_id
    join public.sigec_processes process on process.id = application.process_id
    left join public.sigec_process_stages stage on stage.id = application.stage_id
    left join lateral (
      select version.protocol, version.submitted_at
      from public.sigec_application_submissions version
      where version.application_id = application.id
      order by version.version desc
      limit 1
    ) submission on true
    left join lateral (
      select
        coalesce(bool_or(
          question.config ->> 'audienceMarker' = 'pcd'
          and answer.answer = 'true'::jsonb
        ), false) as pcd,
        coalesce(bool_or(
          question.config ->> 'audienceMarker' = 'ppp'
          and answer.answer = 'true'::jsonb
        ), false) as ppp
      from public.sigec_application_answers answer
      join public.sigec_process_questions question on question.id = answer.question_id
      where answer.application_id = application.id
    ) competition on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'position', preference.position,
          'vacancyId', vacancy.id,
          'municipality', vacancy.municipality,
          'courseId', course.id,
          'course', course.canonical_name,
          'modalityId', modality.id,
          'modality', modality.name
        ) order by preference.position
      ) as items
      from public.sigec_application_preferences preference
      join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
      join public.sigec_courses course on course.id = vacancy.course_id
      join public.sigec_modalities modality on modality.id = vacancy.modality_id
      where preference.application_id = application.id
    ) preference_data on true
    left join lateral (
      select
        count(*) filter (where request.status = 'open') as open_count,
        count(*) filter (where request.status = 'open' and request.due_at <= now()) as overdue_count
      from public.sigec_information_requests request
      where request.application_id = application.id
    ) request_data on true
    left join lateral (
      select count(*) as pending_count
      from public.sigec_application_documents document
      where document.application_id = application.id
        and document.removed_at is null
        and not exists (
          select 1 from public.sigec_application_documents successor
          where successor.supersedes_document_id = document.id
            and successor.removed_at is null
        )
        and (
          document.technical_status <> 'validated'
          or document.malware_status <> 'clean'
          or document.review_status <> 'valid'
        )
    ) document_data on true
    where (p_process_id is null or application.process_id = p_process_id)
      and (p_application_state is null or application.application_state = p_application_state)
      and (p_stage_id is null or application.stage_id = p_stage_id)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or profile.full_name ilike '%' || trim(p_search) || '%'
        or submission.protocol ilike '%' || trim(p_search) || '%'
      )
      and (
        p_municipality is null or exists (
          select 1
          from public.sigec_application_preferences preference
          join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
          where preference.application_id = application.id
            and vacancy.municipality = p_municipality
        )
      )
      and (
        p_course_id is null or exists (
          select 1
          from public.sigec_application_preferences preference
          join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
          where preference.application_id = application.id
            and vacancy.course_id = p_course_id
        )
      )
      and (
        p_modality_id is null or exists (
          select 1
          from public.sigec_application_preferences preference
          join public.sigec_vacancies vacancy on vacancy.id = preference.vacancy_id
          where preference.application_id = application.id
            and vacancy.modality_id = p_modality_id
        )
      )
      and (
        p_competition = 'all'
        or (p_competition = 'pcd' and coalesce(competition.pcd, false))
        or (p_competition = 'ppp' and coalesce(competition.ppp, false))
        or (
          p_competition = 'geral'
          and not coalesce(competition.pcd, false)
          and not coalesce(competition.ppp, false)
        )
      )
  )
  select
    filtered.application_id,
    filtered.candidate_name,
    filtered.process_id,
    filtered.process_title,
    filtered.application_state,
    filtered.stage_id,
    filtered.stage_label,
    filtered.protocol,
    filtered.submitted_at,
    filtered.created_at,
    filtered.score_total,
    filtered.competition_scopes,
    filtered.preferences,
    filtered.open_request_count,
    filtered.overdue_request_count,
    filtered.pending_document_count,
    filtered.has_pending,
    count(*) over() as total_count
  from filtered
  where p_pending = 'all'
    or (p_pending = 'with' and filtered.has_pending)
    or (p_pending = 'without' and not filtered.has_pending)
  order by filtered.submitted_at desc nulls last, filtered.created_at desc, filtered.application_id
  limit p_page_size
  offset (p_page - 1) * p_page_size;
end;
$$;

revoke all on function public.sigec_list_applications_for_review(
  uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.sigec_list_applications_for_review(
  uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text
) to service_role;

comment on function public.sigec_list_applications_for_review(
  uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text
) is 'Server-only paginated SIGEC review queue. Returns operational triage fields without CPF, phone, address, answers, or document contents.';

commit;
