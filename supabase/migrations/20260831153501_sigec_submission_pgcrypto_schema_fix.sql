begin;

-- pgcrypto is installed in Supabase's trusted `extensions` schema. The
-- submission function otherwise keeps every application relation qualified.
alter function private.sigec_submit_application_impl(uuid,text,text)
  set search_path = 'extensions';

commit;
