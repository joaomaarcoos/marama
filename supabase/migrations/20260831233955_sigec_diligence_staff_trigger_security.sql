begin;

alter function private.sigec_validate_information_request() security definer;
alter function private.sigec_validate_information_request() set search_path = '';
revoke all on function private.sigec_validate_information_request() from public, anon, authenticated;

comment on function private.sigec_validate_information_request() is
  'Internal trigger with a pinned empty search path; definer rights are limited to validating requested_by against auth.users and referenced SIGEC objects.';

commit;
