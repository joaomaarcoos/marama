begin;

create or replace function private.sigec_guard_document_review_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(old.review_status, old.review_message, old.reviewed_by, old.reviewed_at)
    is not distinct from
    row(new.review_status, new.review_message, new.reviewed_by, new.reviewed_at) then
    return new;
  end if;

  if new.removed_at is not null or exists (
    select 1 from public.sigec_application_documents successor
    where successor.supersedes_document_id = new.id
      and successor.removed_at is null
  ) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_CURRENT_VERSION_REQUIRED' using errcode = '23514';
  end if;
  if new.technical_status <> 'validated' or new.malware_status <> 'clean' then
    raise exception 'SIGEC_DOCUMENT_REVIEW_CLEAN_FILE_REQUIRED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.sigec_applications application
    where application.id = new.application_id
      and application.application_state = 'submitted'
  ) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_SUBMITTED_APPLICATION_REQUIRED' using errcode = '23514';
  end if;
  if new.review_status not in ('valid', 'rejected')
    or new.reviewed_by is null
    or new.reviewed_at is null
    or not exists (
      select 1 from auth.users staff
      where staff.id = new.reviewed_by
        and staff.raw_app_meta_data ->> 'role' in ('admin', 'gerente')
    ) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if (new.review_status = 'valid' and new.review_message is not null)
    or (new.review_status = 'rejected' and char_length(trim(new.review_message)) not between 3 and 2000) then
    raise exception 'SIGEC_DOCUMENT_REVIEW_PUBLIC_REASON_INVALID' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists sigec_document_review_state_guard on public.sigec_application_documents;
create trigger sigec_document_review_state_guard
before update of review_status, review_message, reviewed_by, reviewed_at
on public.sigec_application_documents
for each row execute function private.sigec_guard_document_review_update();

revoke all on function private.sigec_guard_document_review_update()
  from public, anon, authenticated;

comment on function private.sigec_guard_document_review_update() is
  'Fails closed unless the current clean document belongs to a submitted application and the reviewer is admin or manager.';

commit;
