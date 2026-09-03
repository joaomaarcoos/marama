begin;

create or replace function private.sigec_enforce_appeal_window()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  target_process_id uuid;
  current_window public.sigec_appeal_windows;
  evaluated_at timestamptz := statement_timestamp();
begin
  select application.process_id into target_process_id
  from public.sigec_applications application where application.id = new.application_id;

  select appeal_window.* into current_window
  from public.sigec_appeal_windows appeal_window
  where appeal_window.process_id = target_process_id
    and evaluated_at >= appeal_window.opens_at
    and evaluated_at < appeal_window.closes_at
  order by appeal_window.created_at desc, appeal_window.id desc
  limit 1;

  if current_window.id is null then
    raise exception 'SIGEC_APPEAL_WINDOW_CLOSED' using errcode = '55000';
  end if;
  new.appeal_window_id := current_window.id;
  new.submitted_at := evaluated_at;
  return new;
end;
$$;

revoke all on function private.sigec_enforce_appeal_window() from public, anon, authenticated;

commit;
