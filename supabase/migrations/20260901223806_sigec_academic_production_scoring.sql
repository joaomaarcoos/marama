begin;

create table public.sigec_academic_production_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  document_id uuid not null references public.sigec_application_documents(id) on delete restrict,
  version integer not null check (version > 0),
  decision text not null check (decision in ('eligible', 'rejected')),
  category text not null check (category in ('scientific_article', 'book_or_chapter', 'technical_material', 'event_presentation', 'continuing_education')),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  workload_hours integer check (workload_hours between 1 and 10000),
  relevance_confirmed boolean not null,
  used_as_mandatory_requirement boolean not null,
  points_snapshot numeric(7,2) not null check (points_snapshot between 0 and 30),
  public_reason text,
  internal_rationale text not null check (char_length(trim(internal_rationale)) between 3 and 2000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  supersedes_review_id uuid unique references public.sigec_academic_production_reviews(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (application_id, document_id, version),
  check ((category = 'continuing_education' and workload_hours is not null) or (category <> 'continuing_education' and workload_hours is null)),
  check ((decision = 'eligible' and public_reason is null and relevance_confirmed and not used_as_mandatory_requirement and points_snapshot > 0)
    or (decision = 'rejected' and char_length(trim(public_reason)) between 3 and 2000 and points_snapshot = 0))
);

create index sigec_academic_reviews_application_idx on public.sigec_academic_production_reviews(application_id, created_at desc);
create index sigec_academic_reviews_document_idx on public.sigec_academic_production_reviews(document_id, version desc);
create index sigec_academic_reviews_actor_idx on public.sigec_academic_production_reviews(reviewed_by);
alter table public.sigec_academic_production_reviews enable row level security;
revoke all on public.sigec_academic_production_reviews from public, anon, authenticated;
grant select, insert on public.sigec_academic_production_reviews to service_role;

create or replace function private.sigec_reject_academic_review_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'SIGEC_ACADEMIC_REVIEW_IMMUTABLE' using errcode = '55000'; end;
$$;
revoke all on function private.sigec_reject_academic_review_mutation() from public, anon, authenticated;
create trigger sigec_academic_reviews_immutable before update or delete on public.sigec_academic_production_reviews
for each row execute function private.sigec_reject_academic_review_mutation();

create or replace function public.sigec_review_academic_production(
  p_actor_id uuid, p_application_id uuid, p_document_id uuid, p_decision text,
  p_category text, p_quantity integer, p_workload_hours integer,
  p_relevance_confirmed boolean, p_used_as_mandatory_requirement boolean,
  p_public_reason text, p_internal_rationale text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  previous_review record; next_version integer; review_id uuid; score numeric(7,2);
  normalized_public text := nullif(trim(coalesce(p_public_reason, '')), '');
  normalized_internal text := nullif(trim(coalesce(p_internal_rationale, '')), '');
begin
  if p_actor_id is null or not exists (select 1 from auth.users staff where staff.id=p_actor_id and staff.raw_app_meta_data->>'role' in ('admin','gerente')) then
    raise exception 'SIGEC_ACADEMIC_STAFF_REQUIRED' using errcode='42501';
  end if;
  if p_decision not in ('eligible','rejected') or p_category not in ('scientific_article','book_or_chapter','technical_material','event_presentation','continuing_education')
    or coalesce(p_quantity,0) not between 1 and 1000 or char_length(coalesce(normalized_internal,'')) not between 3 and 2000
    or (p_category='continuing_education' and coalesce(p_workload_hours,0) not between 1 and 10000)
    or (p_category<>'continuing_education' and p_workload_hours is not null)
    or (p_decision='eligible' and (normalized_public is not null or not coalesce(p_relevance_confirmed,false) or coalesce(p_used_as_mandatory_requirement,false)))
    or (p_decision='rejected' and char_length(coalesce(normalized_public,'')) not between 3 and 2000) then
    raise exception 'SIGEC_ACADEMIC_INPUT_INVALID' using errcode='22023';
  end if;
  if not exists (select 1 from public.sigec_applications application where application.id=p_application_id and application.application_state='submitted' for update) then
    raise exception 'SIGEC_ACADEMIC_SUBMITTED_APPLICATION_REQUIRED' using errcode='23514';
  end if;
  if not exists (
    select 1 from public.sigec_application_documents document
    where document.id=p_document_id and document.application_id=p_application_id and document.removed_at is null
      and document.technical_status='validated' and document.malware_status='clean' and document.review_status='valid'
      and not exists (select 1 from public.sigec_application_documents successor where successor.supersedes_document_id=document.id and successor.removed_at is null)
  ) then raise exception 'SIGEC_ACADEMIC_APPROVED_CURRENT_DOCUMENT_REQUIRED' using errcode='23514'; end if;

  score := case when p_decision='rejected' then 0
    when p_category='scientific_article' then least(p_quantity*5,10)
    when p_category='book_or_chapter' then least(p_quantity*5,5)
    when p_category='technical_material' then least(p_quantity*3,6)
    when p_category='event_presentation' then least(p_quantity*2,4)
    else least((p_workload_hours/20),5) end;
  if p_decision='eligible' and score <= 0 then raise exception 'SIGEC_ACADEMIC_NO_SCORE' using errcode='22023'; end if;
  select review.id,review.version into previous_review from public.sigec_academic_production_reviews review
    where review.application_id=p_application_id and review.document_id=p_document_id order by review.version desc limit 1;
  next_version:=coalesce(previous_review.version,0)+1;
  insert into public.sigec_academic_production_reviews(application_id,document_id,version,decision,category,quantity,workload_hours,relevance_confirmed,used_as_mandatory_requirement,points_snapshot,public_reason,internal_rationale,reviewed_by,supersedes_review_id)
  values(p_application_id,p_document_id,next_version,p_decision,p_category,p_quantity,p_workload_hours,coalesce(p_relevance_confirmed,false),coalesce(p_used_as_mandatory_requirement,false),score,normalized_public,normalized_internal,p_actor_id,previous_review.id)
  returning id into review_id;
  insert into public.sigec_audit_events(actor_id,actor_role,action,entity_type,entity_id,metadata)
  values(p_actor_id,(select raw_app_meta_data->>'role' from auth.users where id=p_actor_id),'academic_production_reviewed','sigec_application',p_application_id::text,
    jsonb_build_object('reviewId',review_id,'documentId',p_document_id,'decision',p_decision,'category',p_category,'points',score,'version',next_version,'hasPublicReason',normalized_public is not null,'hasInternalRationale',true));
  return review_id;
end; $$;

create or replace function public.sigec_get_academic_production_score(p_actor_id uuid,p_application_id uuid)
returns table(points numeric,breakdown jsonb,eligible_evidence_count integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_actor_id is null or not exists (select 1 from auth.users staff where staff.id=p_actor_id and staff.raw_app_meta_data->>'role' in ('admin','gerente')) then
    raise exception 'SIGEC_ACADEMIC_STAFF_REQUIRED' using errcode='42501';
  end if;
  if not exists (select 1 from public.sigec_applications where id=p_application_id and application_state='submitted') then
    raise exception 'SIGEC_ACADEMIC_SUBMITTED_APPLICATION_REQUIRED' using errcode='23514';
  end if;
  return query with latest as (
    select distinct on (review.document_id) review.document_id,review.category,review.points_snapshot,review.decision
    from public.sigec_academic_production_reviews review where review.application_id=p_application_id
    order by review.document_id,review.version desc
  ), eligible as (select * from latest where decision='eligible'), capped as (
    select category,least(sum(points_snapshot),case category when 'scientific_article' then 10 when 'book_or_chapter' then 5 when 'technical_material' then 6 when 'event_presentation' then 4 else 5 end) as category_points
    from eligible group by category
  ) select coalesce((select sum(category_points) from capped),0)::numeric,
    coalesce((select jsonb_object_agg(category,category_points) from capped),'{}'::jsonb),
    (select count(*)::integer from eligible);
end; $$;

revoke all on function public.sigec_review_academic_production(uuid,uuid,uuid,text,text,integer,integer,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.sigec_review_academic_production(uuid,uuid,uuid,text,text,integer,integer,boolean,boolean,text,text) to service_role;
revoke all on function public.sigec_get_academic_production_score(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sigec_get_academic_production_score(uuid,uuid) to service_role;
comment on table public.sigec_academic_production_reviews is 'Append-only evidence scoring with per-category caps and one latest criterion per document.';
comment on function public.sigec_get_academic_production_score(uuid,uuid) is 'Server-only academic production score capped at 30 points; five-year validity remains intentionally unforced pending confirmation.';
commit;
