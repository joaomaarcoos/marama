-- SIGEC P1-01: candidate role is assigned inside the trusted Auth database path.
-- raw_user_meta_data carries profile input only and is never used for authorization.

create or replace function private.sigec_cpf_is_valid(candidate_cpf text)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  first_sum integer := 0;
  second_sum integer := 0;
  first_digit integer;
  second_digit integer;
  position integer;
begin
  if candidate_cpf !~ '^[0-9]{11}$'
    or candidate_cpf ~ '^([0-9])\1{10}$'
  then
    return false;
  end if;

  for position in 1..9 loop
    first_sum := first_sum + substring(candidate_cpf from position for 1)::integer * (11 - position);
  end loop;
  first_digit := (first_sum * 10) % 11;
  if first_digit = 10 then first_digit := 0; end if;

  if first_digit <> substring(candidate_cpf from 10 for 1)::integer then
    return false;
  end if;

  for position in 1..10 loop
    second_sum := second_sum + substring(candidate_cpf from position for 1)::integer * (12 - position);
  end loop;
  second_digit := (second_sum * 10) % 11;
  if second_digit = 10 then second_digit := 0; end if;

  return second_digit = substring(candidate_cpf from 11 for 1)::integer;
end;
$$;

create or replace function private.sigec_prepare_candidate_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text;
  profile_data jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  assigned_role := new.raw_app_meta_data ->> 'role';

  if assigned_role is null then
    assigned_role := 'candidato';
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', assigned_role);
  end if;

  if assigned_role <> 'candidato' then
    return new;
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

  return new;
end;
$$;

create or replace function private.sigec_create_candidate_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_data jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if new.raw_app_meta_data ->> 'role' <> 'candidato' then
    return new;
  end if;

  insert into public.sigec_candidate_profiles (
    user_id,
    full_name,
    cpf,
    birth_date,
    whatsapp,
    city,
    state
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

revoke all on function private.sigec_cpf_is_valid(text) from public, anon, authenticated;
revoke all on function private.sigec_prepare_candidate_signup() from public, anon, authenticated;
revoke all on function private.sigec_create_candidate_profile() from public, anon, authenticated;

drop trigger if exists sigec_prepare_candidate_signup on auth.users;
create trigger sigec_prepare_candidate_signup
before insert on auth.users
for each row execute function private.sigec_prepare_candidate_signup();

drop trigger if exists sigec_create_candidate_profile on auth.users;
create trigger sigec_create_candidate_profile
after insert on auth.users
for each row execute function private.sigec_create_candidate_profile();

comment on function private.sigec_prepare_candidate_signup() is
  'Assigns candidato in raw_app_meta_data when Auth creates a public account and validates initial profile input.';
comment on function private.sigec_create_candidate_profile() is
  'Creates the candidate profile atomically after Auth user creation. User metadata is copied as profile data only.';
