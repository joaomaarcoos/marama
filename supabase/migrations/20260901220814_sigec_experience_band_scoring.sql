begin;

create table public.sigec_experience_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  experience_id uuid not null references public.sigec_candidate_experience(id) on delete restrict,
  document_id uuid not null references public.sigec_application_documents(id) on delete restrict,
  version integer not null check (version > 0),
  decision text not null check (decision in ('eligible', 'rejected')),
  starts_on date not null,
  ends_on date,
  public_reason text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  supersedes_review_id uuid unique references public.sigec_experience_evidence_reviews(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (application_id, experience_id, version),
  check (ends_on is null or ends_on >= starts_on),
  check (
    (decision = 'eligible' and public_reason is null)
    or (decision = 'rejected' and char_length(trim(public_reason)) between 3 and 2000)
  )
);

create index sigec_experience_reviews_application_idx
  on public.sigec_experience_evidence_reviews(application_id, created_at desc);
create index sigec_experience_reviews_experience_idx
  on public.sigec_experience_evidence_reviews(experience_id, version desc);
create index sigec_experience_reviews_document_idx
  on public.sigec_experience_evidence_reviews(document_id);
create index sigec_experience_reviews_actor_idx
  on public.sigec_experience_evidence_reviews(reviewed_by);

alter table public.sigec_experience_evidence_reviews enable row level security;
revoke all on public.sigec_experience_evidence_reviews from public, anon, authenticated;
grant select, insert on public.sigec_experience_evidence_reviews to service_role;

create or replace function private.sigec_reject_experience_review_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SIGEC_EXPERIENCE_REVIEW_IMMUTABLE' using errcode = '55000';
end;
$$;

revoke all on function private.sigec_reject_experience_review_mutation() from public, anon, authenticated;
create trigger sigec_experience_reviews_immutable
before update or delete on public.sigec_experience_evidence_reviews
for each row execute function private.sigec_reject_experience_review_mutation();

create or replace function public.sigec_review_experience_evidence(
  p_actor_id uuid,
  p_application_id uuid,
  p_experience_id uuid,
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
  normalized_reason text := nullif(trim(coalesce(p_public_reason, '')), '');
  review_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_EXPERIENCE_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('eligible', 'rejected')
    or (p_decision = 'eligible' and normalized_reason is not null)
    or (p_decision = 'rejected' and char_length(coalesce(normalized_reason, '')) not between 3 and 2000) then
    raise exception 'SIGEC_EXPERIENCE_INPUT_INVALID' using errcode = '22023';
  end if;

  select experience.starts_on, experience.ends_on, experience.is_teaching
    into target
  from public.sigec_applications application
  join public.sigec_candidate_experience experience
    on experience.id = p_experience_id and experience.candidate_id = application.candidate_id
  where application.id = p_application_id and application.application_state = 'submitted'
  for update of application;
  if not found then
    raise exception 'SIGEC_EXPERIENCE_SUBMITTED_APPLICATION_REQUIRED' using errcode = '23514';
  end if;
  if not target.is_teaching then
    raise exception 'SIGEC_EXPERIENCE_TEACHING_REQUIRED' using errcode = '23514';
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
    raise exception 'SIGEC_EXPERIENCE_APPROVED_CURRENT_DOCUMENT_REQUIRED' using errcode = '23514';
  end if;

  select review.id, review.version into previous_review
  from public.sigec_experience_evidence_reviews review
  where review.application_id = p_application_id and review.experience_id = p_experience_id
  order by review.version desc limit 1;
  next_version := coalesce(previous_review.version, 0) + 1;

  insert into public.sigec_experience_evidence_reviews(
    application_id, experience_id, document_id, version, decision, starts_on,
    ends_on, public_reason, reviewed_by, supersedes_review_id
  ) values (
    p_application_id, p_experience_id, p_document_id, next_version, p_decision,
    target.starts_on, target.ends_on, normalized_reason, p_actor_id, previous_review.id
  ) returning id into review_id;

  insert into public.sigec_audit_events(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id,
    (select staff.raw_app_meta_data ->> 'role' from auth.users staff where staff.id = p_actor_id),
    'experience_evidence_reviewed', 'sigec_application', p_application_id::text,
    jsonb_build_object(
      'reviewId', review_id, 'experienceId', p_experience_id, 'documentId', p_document_id,
      'decision', p_decision, 'version', next_version, 'hasPublicReason', normalized_reason is not null
    )
  );
  return review_id;
end;
$$;

create or replace function public.sigec_get_experience_score(
  p_actor_id uuid,
  p_application_id uuid
)
returns table(
  total_unique_days integer,
  total_months integer,
  remaining_days integer,
  points integer,
  eligible_experience_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  cutoff_date date;
  unique_days integer;
  months integer;
  eligible_count integer;
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_EXPERIENCE_STAFF_REQUIRED' using errcode = '42501';
  end if;
  select application.submitted_at::date into cutoff_date
  from public.sigec_applications application
  where application.id = p_application_id and application.application_state = 'submitted';
  if not found then
    raise exception 'SIGEC_EXPERIENCE_SUBMITTED_APPLICATION_REQUIRED' using errcode = '23514';
  end if;

  with latest as (
    select distinct on (review.experience_id)
      review.experience_id, review.starts_on, review.ends_on, review.decision
    from public.sigec_experience_evidence_reviews review
    where review.application_id = p_application_id
    order by review.experience_id, review.version desc
  ), eligible as (
    select * from latest where decision = 'eligible' and starts_on <= cutoff_date
  ), merged as (
    select unnest(range_agg(daterange(starts_on, least(coalesce(ends_on, cutoff_date), cutoff_date) + 1, '[)'))) as period
    from eligible
  )
  select
    coalesce((select sum(upper(period) - lower(period))::integer from merged), 0),
    (select count(*)::integer from eligible)
  into unique_days, eligible_count;

  months := unique_days / 30;
  return query select
    unique_days,
    months,
    unique_days % 30,
    case
      when months = 0 then 0
      when months <= 12 then 5
      when months <= 24 then 10
      when months <= 36 then 20
      when months <= 48 then 30
      else 40
    end,
    eligible_count;
end;
$$;

revoke all on function public.sigec_review_experience_evidence(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.sigec_review_experience_evidence(uuid,uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.sigec_get_experience_score(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sigec_get_experience_score(uuid,uuid) to service_role;

comment on table public.sigec_experience_evidence_reviews is
  'Append-only reviews of teaching experience evidence, with dates snapshotted at each decision.';
comment on function public.sigec_get_experience_score(uuid,uuid) is
  'Server-only teaching experience score using unique, nonoverlapping days at submission cutoff and a 40-point cap.';

commit;
