drop trigger if exists sigec_strip_consumed_signup_proof on auth.users;
drop function if exists private.sigec_strip_consumed_signup_proof();

create or replace function private.sigec_finalize_candidate_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_data jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  assigned_role text := new.raw_app_meta_data ->> 'role';
  signup_nonce text := profile_data ->> 'sigec_signup_nonce';
  consumed_nonce text;
begin
  if coalesce(profile_data ->> 'sigec_candidate_signup', 'false') <> 'true' then
    return new;
  end if;

  if signup_nonce is null or char_length(signup_nonce) <> 64 or signup_nonce !~ '^[0-9a-f]{64}$' then
    raise exception 'SIGEC_CANDIDATE_SIGNUP_PROOF_REQUIRED' using errcode = '42501';
  end if;

  delete from public.sigec_candidate_signup_nonces
  where nonce_digest = encode(extensions.digest(signup_nonce, 'sha256'), 'hex')
    and expires_at > clock_timestamp()
  returning nonce_digest into consumed_nonce;

  if consumed_nonce is null then
    raise exception 'SIGEC_CANDIDATE_SIGNUP_PROOF_INVALID' using errcode = '42501';
  end if;

  if assigned_role is not null and assigned_role <> 'candidato' then
    raise exception 'SIGEC_CANDIDATE_SIGNUP_ROLE_CONFLICT' using errcode = '23514';
  end if;

  if char_length(trim(coalesce(profile_data ->> 'full_name', ''))) not between 3 and 200
    or not private.sigec_cpf_is_valid(coalesce(profile_data ->> 'cpf', ''))
    or coalesce(profile_data ->> 'birth_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (profile_data ->> 'birth_date')::date > current_date
    or coalesce(profile_data ->> 'whatsapp', '') !~ '^[1-9][0-9]{9,14}$'
    or char_length(trim(coalesce(profile_data ->> 'city', ''))) not between 2 and 160
    or coalesce(profile_data ->> 'state', '') !~ '^[A-Z]{2}$'
  then
    raise exception 'SIGEC_INVALID_CANDIDATE_SIGNUP_DATA' using errcode = '23514';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'candidato'),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'sigec_signup_nonce'
  where id = new.id;

  insert into public.sigec_candidate_profiles (
    user_id, full_name, cpf, birth_date, whatsapp, city, state
  ) values (
    new.id,
    trim(profile_data ->> 'full_name'),
    profile_data ->> 'cpf',
    (profile_data ->> 'birth_date')::date,
    profile_data ->> 'whatsapp',
    trim(profile_data ->> 'city'),
    profile_data ->> 'state'
  );

  return new;
end;
$$;

revoke all on function private.sigec_finalize_candidate_signup() from public, anon, authenticated;

comment on function private.sigec_finalize_candidate_signup() is
  'Consumes a server-only signup proof, removes it from metadata, assigns only candidato and atomically creates the candidate profile.';
