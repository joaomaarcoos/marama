begin;

alter table public.sigec_application_documents
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id),
  add constraint sigec_document_removal_pair_check check (
    (removed_at is null and removed_by is null)
    or (removed_at is not null and removed_by is not null)
  );

create index sigec_documents_application_active_idx
on public.sigec_application_documents(application_id, requirement_id, version desc)
where removed_at is null;

create or replace function public.sigec_remove_candidate_document(
  p_document_id uuid,
  p_actor_id uuid
)
returns table(storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
begin
  if p_actor_id is null then
    raise exception 'SIGEC_DOCUMENT_ACTOR_REQUIRED' using errcode = '42501';
  end if;

  select
    document.id,
    document.application_id,
    document.requirement_id,
    document.version,
    document.storage_path,
    document.malware_status,
    document.removed_at,
    application.candidate_id,
    application.application_state
  into target
  from public.sigec_application_documents document
  join public.sigec_applications application on application.id = document.application_id
  where document.id = p_document_id
  for update of document;

  if not found or target.candidate_id <> p_actor_id then
    raise exception 'SIGEC_DOCUMENT_REMOVE_FORBIDDEN' using errcode = '42501';
  end if;
  if target.removed_at is not null then
    raise exception 'SIGEC_DOCUMENT_ALREADY_REMOVED' using errcode = '23503';
  end if;
  if target.application_state <> 'draft' then
    raise exception 'SIGEC_DOCUMENT_REMOVE_APPLICATION_LOCKED' using errcode = '23514';
  end if;

  update public.sigec_application_documents
  set removed_at = now(), removed_by = p_actor_id, updated_at = now()
  where id = target.id;

  insert into public.sigec_audit_events
    (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id,
    'candidato',
    'candidate_document_removed',
    'application_document',
    target.id::text,
    jsonb_build_object(
      'application_id', target.application_id,
      'requirement_id', target.requirement_id,
      'version', target.version,
      'malware_status', target.malware_status
    )
  );

  return query select target.storage_path::text;
end;
$$;

revoke all on function public.sigec_remove_candidate_document(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.sigec_remove_candidate_document(uuid,uuid)
to service_role;

create or replace function private.sigec_guard_removed_document_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.removed_at is not null then
    raise exception 'SIGEC_DOCUMENT_REMOVED_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_guard_removed_document_changes() from public;

create trigger sigec_guard_removed_document_changes
before update of storage_path, sha256, technical_status, malware_status, removed_at, removed_by
on public.sigec_application_documents
for each row
when (old.removed_at is not null)
execute function private.sigec_guard_removed_document_changes();

drop policy if exists sigec_storage_candidate_read on storage.objects;
create policy sigec_storage_candidate_read on storage.objects
for select to authenticated
using (
  bucket_id = 'sigec-candidate-documents'
  and exists (
    select 1
    from public.sigec_application_documents document
    join public.sigec_applications application on application.id = document.application_id
    where document.storage_path = name
      and document.removed_at is null
      and document.malware_status = 'clean'
      and (
        application.candidate_id = (select auth.uid())
        or (select private.sigec_is_staff())
      )
  )
);

comment on column public.sigec_application_documents.removed_at is
  'Candidate-visible soft removal. Metadata and audit history remain; Storage access is revoked immediately.';

commit;
