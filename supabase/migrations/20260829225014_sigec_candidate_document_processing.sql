begin;

alter table public.sigec_application_documents
  alter column sha256 set not null,
  add column technical_status text not null default 'pending'
    check (technical_status in ('pending', 'validated', 'rejected')),
  add column malware_status text not null default 'pending'
    check (malware_status in ('pending', 'clean', 'infected', 'error')),
  add column sanitized_at timestamptz,
  add column supersedes_document_id uuid references public.sigec_application_documents(id),
  add constraint sigec_document_sanitization_check check (
    (technical_status = 'validated' and sanitized_at is not null)
    or (technical_status <> 'validated' and sanitized_at is null)
  );

create index sigec_documents_supersedes_idx
on public.sigec_application_documents(supersedes_document_id)
where supersedes_document_id is not null;

revoke insert on public.sigec_application_documents from authenticated;

-- Files must pass server-side content validation before reaching Storage.
drop policy if exists sigec_storage_candidate_insert on storage.objects;

create or replace function public.sigec_register_candidate_document(
  p_application_id uuid,
  p_requirement_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_actor_id uuid
)
returns table(document_id uuid, document_version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_application public.sigec_applications%rowtype;
  target_requirement public.sigec_document_requirements%rowtype;
  next_version integer;
  previous_id uuid;
  inserted_id uuid;
begin
  if p_actor_id is null then
    raise exception 'SIGEC_DOCUMENT_ACTOR_REQUIRED' using errcode = '42501';
  end if;

  select * into target_application
  from public.sigec_applications
  where id = p_application_id
  for update;

  if not found or target_application.candidate_id <> p_actor_id then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_FORBIDDEN' using errcode = '42501';
  end if;
  if target_application.application_state not in ('draft', 'submitted') then
    raise exception 'SIGEC_DOCUMENT_APPLICATION_LOCKED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sigec_processes process
    where process.id = target_application.process_id
      and (
        process.applications_close_at is null
        or process.applications_close_at > now()
        or exists (
          select 1 from public.sigec_information_requests request
          where request.application_id = target_application.id
            and request.status = 'open'
            and (request.due_at is null or request.due_at > now())
        )
      )
  ) then
    raise exception 'SIGEC_DOCUMENT_UPLOAD_WINDOW_CLOSED' using errcode = '23514';
  end if;

  select * into target_requirement
  from public.sigec_document_requirements
  where id = p_requirement_id
    and process_id = target_application.process_id
    and active;
  if not found then
    raise exception 'SIGEC_DOCUMENT_REQUIREMENT_INVALID' using errcode = '23503';
  end if;
  if p_mime_type <> all(target_requirement.mime_types)
     or p_size_bytes < 1
     or p_size_bytes > least(target_requirement.max_size_bytes, 10485760) then
    raise exception 'SIGEC_DOCUMENT_FILE_CONSTRAINT' using errcode = '23514';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path !~ ('^' || p_actor_id::text || '/' || p_application_id::text || '/')
     or char_length(trim(p_original_name)) not between 1 and 255 then
    raise exception 'SIGEC_DOCUMENT_METADATA_INVALID' using errcode = '23514';
  end if;

  select id, version into previous_id, next_version
  from public.sigec_application_documents
  where application_id = p_application_id and requirement_id = p_requirement_id
  order by version desc
  limit 1;
  next_version := coalesce(next_version, 0) + 1;

  insert into public.sigec_application_documents (
    application_id, requirement_id, storage_path, original_name, mime_type,
    size_bytes, sha256, version, technical_status, malware_status,
    sanitized_at, supersedes_document_id
  ) values (
    p_application_id, p_requirement_id, p_storage_path, trim(p_original_name), p_mime_type,
    p_size_bytes, p_sha256, next_version, 'validated', 'pending',
    now(), previous_id
  ) returning id into inserted_id;

  insert into public.sigec_audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'candidato', 'candidate_document_uploaded', 'application_document', inserted_id::text,
    jsonb_build_object(
      'application_id', p_application_id,
      'requirement_id', p_requirement_id,
      'version', next_version,
      'mime_type', p_mime_type,
      'size_bytes', p_size_bytes,
      'technical_status', 'validated',
      'malware_status', 'pending'
    )
  );

  return query select inserted_id, next_version;
end;
$$;

revoke all on function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid)
from public, anon, authenticated;
grant execute on function public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid)
to service_role;

drop policy if exists sigec_storage_candidate_read on storage.objects;
create policy sigec_storage_candidate_read on storage.objects
for select to authenticated
using (
  bucket_id = 'sigec-candidate-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (
      (select private.sigec_is_staff())
      and exists (
        select 1 from public.sigec_application_documents document
        where document.storage_path = name and document.malware_status = 'clean'
      )
    )
  )
);

comment on column public.sigec_application_documents.malware_status is
  'Remains pending after technical validation; P3-05 promotes only clean files for staff access.';

commit;
