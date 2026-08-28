create or replace function private.sigec_strip_consumed_signup_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'sigec_candidate_signup', 'false') = 'true'
    and new.raw_user_meta_data ? 'sigec_signup_nonce'
  then
    update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'sigec_signup_nonce'
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_strip_consumed_signup_proof() from public, anon, authenticated;

drop trigger if exists sigec_strip_consumed_signup_proof on auth.users;
create trigger sigec_strip_consumed_signup_proof
after insert on auth.users
for each row execute function private.sigec_strip_consumed_signup_proof();

comment on function private.sigec_strip_consumed_signup_proof() is
  'Removes the already-consumed one-time signup proof from persistent user metadata.';
