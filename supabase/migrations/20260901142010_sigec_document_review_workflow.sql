begin;

create table public.sigec_document_reviews (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  document_id uuid not null references public.sigec_application_documents(id) on delete restrict,
  decision text not null check (decision in ('valid', 'rejected')),
  public_reason text,
  internal_note text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (decision = 'valid' and public_reason is null)
    or (decision = 'rejected' and char_length(trim(public_reason)) between 3 and 2000)
  ),
  check (internal_note is null or char_length(trim(internal_note)) between 1 and 5000)
);

create index sigec_document_reviews_document_idx
  on public.sigec_document_reviews(document_id, created_at desc);
create index sigec_document_reviews_application_idx
  on public.sigec_document_reviews(application_id, created_at desc);
create index sigec_document_reviews_reviewer_idx
  on public.sigec_document_reviews(reviewed_by);

alter table public.sigec_document_reviews enable row level security;
revoke all on public.sigec_document_reviews from public, anon, authenticated;
grant select, insert on public.sigec_document_reviews to service_role;

create or replace function private.sigec_reject_document_review_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'SIGEC_DOCUMENT_REVIEW_IMMUTABLE' using errcode = '55000';
end;
$$;

create trigger sigec_document_reviews_immutable
before update or delete on public.sigec_document_reviews
for each row execute function private.sigec_reject_document_review_mutation();

revoke all on function private.sigec_reject_document_review_mutation()
  from public, anon, authenticated;

create or replace function public.sigec_review_application_document(
  p_actor_id uuid,
  p_document_id uuid,
  p_decision text,
  p_public_reason text default null,
  p_internal_note text default null
)
returns table(review_status text, reviewed_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.sigec_application_documents%rowtype;
  event_time timestamptz := clock_timestamp();
  normalized_reason text := nullif(trim(coalesce(p_public_reason, '')), '');
  normalized_note text := nullif(trim(coalesce(p_internal_note, '')), '');
begin
  if p_actor_id is null or not exists (
    select 1 from auth.users staff
    where staff.id = p_actor_id
      and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
  ) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_document_id is null or p_decision not in ('valid', 'rejected') then
    raise exception 'SIGEC_DOCUMENT_REVIEW_INPUT_INVALID' using errcode = '22023';
  end if;
  if p_decision = 'rejected'
    and (normalized_reason is null or char_length(normalized_reason) not between 3 and 2000) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_PUBLIC_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_decision = 'valid' and normalized_reason is not null then
    raise exception 'SIGEC_DOCUMENT_REVIEW_PUBLIC_REASON_NOT_ALLOWED' using errcode = '22023';
  end if;
  if normalized_note is not null and char_length(normalized_note) not between 1 and 5000 then
    raise exception 'SIGEC_DOCUMENT_REVIEW_INTERNAL_NOTE_INVALID' using errcode = '22023';
  end if;

  select document.* into target
  from public.sigec_application_documents document
  where document.id = p_document_id
  for update;

  if not found or target.removed_at is not null or exists (
    select 1 from public.sigec_application_documents successor
    where successor.supersedes_document_id = target.id
      and successor.removed_at is null
  ) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_CURRENT_VERSION_REQUIRED' using errcode = '23514';
  end if;
  if target.technical_status <> 'validated' or target.malware_status <> 'clean' then
    raise exception 'SIGEC_DOCUMENT_REVIEW_CLEAN_FILE_REQUIRED' using errcode = '23514';
  end if;

  update public.sigec_application_documents document
  set review_status = p_decision,
      review_message = case when p_decision = 'rejected' then normalized_reason else null end,
      reviewed_by = p_actor_id,
      reviewed_at = event_time,
      updated_at = event_time
  where document.id = target.id;

  insert into public.sigec_document_reviews(
    application_id, document_id, decision, public_reason, internal_note, reviewed_by, created_at
  ) values (
    target.application_id, target.id, p_decision,
    case when p_decision = 'rejected' then normalized_reason else null end,
    normalized_note, p_actor_id, event_time
  );

  insert into public.sigec_audit_events(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id, 'staff', 'application_document_reviewed', 'application_document', target.id::text,
    jsonb_build_object(
      'applicationId', target.application_id,
      'decision', p_decision,
      'documentVersion', target.version,
      'hasPublicReason', normalized_reason is not null,
      'hasInternalNote', normalized_note is not null
    )
  );

  return query select p_decision, event_time;
end;
$$;

revoke all on function public.sigec_review_application_document(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.sigec_review_application_document(uuid,uuid,text,text,text)
  to service_role;

comment on table public.sigec_document_reviews is
  'Append-only document review history. Public rejection reason and staff-only internal note are stored separately.';
comment on function public.sigec_review_application_document(uuid,uuid,text,text,text) is
  'Server-only atomic review of the current clean document version by admin or manager.';

commit;
