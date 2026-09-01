begin;

create table public.sigec_postgraduate_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  education_id uuid not null references public.sigec_candidate_education(id) on delete restrict,
  document_id uuid not null references public.sigec_application_documents(id) on delete restrict,
  version integer not null check (version > 0),
  decision text not null check (decision in ('eligible', 'rejected')),
  education_level text not null check (education_level in ('especializacao', 'mestrado', 'doutorado')),
  points_snapshot numeric(7,2) not null check (points_snapshot in (0, 20, 25, 30)),
  public_reason text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  supersedes_review_id uuid unique references public.sigec_postgraduate_evidence_reviews(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (application_id, education_id, version),
  check (
    (decision = 'eligible' and public_reason is null and points_snapshot in (20, 25, 30))
    or (decision = 'rejected' and char_length(trim(public_reason)) between 3 and 2000 and points_snapshot = 0)
  )
);

create index sigec_postgraduate_reviews_application_idx
  on public.sigec_postgraduate_evidence_reviews(application_id, created_at desc);
create index sigec_postgraduate_reviews_education_idx
  on public.sigec_postgraduate_evidence_reviews(education_id, version desc);
create index sigec_postgraduate_reviews_document_idx
  on public.sigec_postgraduate_evidence_reviews(document_id);
create index sigec_postgraduate_reviews_actor_idx
  on public.sigec_postgraduate_evidence_reviews(reviewed_by);

alter table public.sigec_postgraduate_evidence_reviews enable row level security;
revoke all on public.sigec_postgraduate_evidence_reviews from public, anon, authenticated;
grant select, insert on public.sigec_postgraduate_evidence_reviews to service_role;

create or replace function private.sigec_reject_postgraduate_review_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SIGEC_POSTGRADUATE_REVIEW_IMMUTABLE' using errcode = '55000';
end;
$$;

revoke all on function private.sigec_reject_postgraduate_review_mutation() from public, anon, authenticated;
create trigger sigec_postgraduate_reviews_immutable
before update or delete on public.sigec_postgraduate_evidence_reviews
for each row execute function private.sigec_reject_postgraduate_review_mutation();

create or replace function public.sigec_review_postgraduate_evidence(
  p_actor_id uuid,
  p_application_id uuid,
  p_education_id uuid,
  p_document_id uuid,
  p_decision text,
  p_public_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
  previous_review record;
  next_version integer;
  score numeric(7,2);
  normalized_reason text := nullif(trim(coalesce(p_public_reason, '')), '');
  review_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_POSTGRADUATE_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('eligible', 'rejected')
    or (p_decision = 'eligible' and normalized_reason is not null)
    or (p_decision = 'rejected' and char_length(coalesce(normalized_reason, '')) not between 3 and 2000) then
    raise exception 'SIGEC_POSTGRADUATE_INPUT_INVALID' using errcode = '22023';
  end if;

  select application.candidate_id, education.level, education.is_completed
    into target
  from public.sigec_applications application
  join public.sigec_candidate_education education
    on education.id = p_education_id and education.candidate_id = application.candidate_id
  where application.id = p_application_id and application.application_state = 'submitted'
  for update of application;
  if not found then
    raise exception 'SIGEC_POSTGRADUATE_SUBMITTED_APPLICATION_REQUIRED' using errcode = '23514';
  end if;
  if not target.is_completed or target.level not in ('especializacao', 'mestrado', 'doutorado') then
    raise exception 'SIGEC_POSTGRADUATE_COMPLETED_TITLE_REQUIRED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sigec_application_documents document
    where document.id = p_document_id and document.application_id = p_application_id
      and document.removed_at is null and document.technical_status = 'validated'
      and document.malware_status = 'clean' and document.review_status = 'valid'
      and not exists (
        select 1 from public.sigec_application_documents successor
        where successor.supersedes_document_id = document.id and successor.removed_at is null
      )
  ) then
    raise exception 'SIGEC_POSTGRADUATE_APPROVED_CURRENT_DOCUMENT_REQUIRED' using errcode = '23514';
  end if;

  select review.id, review.version into previous_review
  from public.sigec_postgraduate_evidence_reviews review
  where review.application_id = p_application_id and review.education_id = p_education_id
  order by review.version desc limit 1;
  next_version := coalesce(previous_review.version, 0) + 1;
  score := case when p_decision = 'rejected' then 0
    when target.level = 'doutorado' then 30
    when target.level = 'mestrado' then 25
    else 20 end;

  insert into public.sigec_postgraduate_evidence_reviews(
    application_id, education_id, document_id, version, decision, education_level,
    points_snapshot, public_reason, reviewed_by, supersedes_review_id
  ) values (
    p_application_id, p_education_id, p_document_id, next_version, p_decision,
    target.level, score, normalized_reason, p_actor_id, previous_review.id
  ) returning id into review_id;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'postgraduate_evidence_reviewed', 'sigec_application', p_application_id::text,
    jsonb_build_object(
      'reviewId', review_id, 'educationId', p_education_id, 'documentId', p_document_id,
      'decision', p_decision, 'educationLevel', target.level, 'points', score,
      'version', next_version, 'hasPublicReason', normalized_reason is not null
    )
  );
  return review_id;
end;
$$;

create or replace function public.sigec_get_postgraduate_score(
  p_actor_id uuid,
  p_application_id uuid
)
returns table(
  points numeric,
  selected_level text,
  selected_education_id uuid,
  selected_document_id uuid,
  eligible_title_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_POSTGRADUATE_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sigec_applications application where application.id = p_application_id) then
    raise exception 'SIGEC_POSTGRADUATE_APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  with latest as (
    select distinct on (review.education_id)
      review.education_id, review.document_id, review.education_level, review.points_snapshot, review.decision
    from public.sigec_postgraduate_evidence_reviews review
    where review.application_id = p_application_id
    order by review.education_id, review.version desc
  ), eligible as (
    select * from latest where decision = 'eligible'
  ), selected as (
    select * from eligible order by points_snapshot desc, education_id limit 1
  )
  select
    coalesce((select selected.points_snapshot from selected), 0)::numeric,
    (select selected.education_level from selected),
    (select selected.education_id from selected),
    (select selected.document_id from selected),
    (select count(*)::integer from eligible);
end;
$$;

revoke all on function public.sigec_review_postgraduate_evidence(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.sigec_review_postgraduate_evidence(uuid,uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.sigec_get_postgraduate_score(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_get_postgraduate_score(uuid,uuid) to service_role;

comment on table public.sigec_postgraduate_evidence_reviews is
  'Append-only evidence reviews for completed postgraduate titles; final title score uses only the highest latest eligible title.';
comment on function public.sigec_get_postgraduate_score(uuid,uuid) is
  'Server-only noncumulative postgraduate score: doctorate 30, masters 25, specialization 20, maximum 30.';

commit;
