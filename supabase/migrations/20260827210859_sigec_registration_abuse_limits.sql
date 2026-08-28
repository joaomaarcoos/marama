create table public.sigec_auth_rate_limits (
  bucket text not null check (bucket in ('signup_ip', 'signup_email', 'signup_phone', 'recovery_ip', 'recovery_email')),
  key_digest text not null check (key_digest ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (bucket, key_digest)
);

create extension if not exists pgcrypto with schema extensions;

create table public.sigec_candidate_signup_nonces (
  nonce_digest text primary key check (nonce_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

alter table public.sigec_auth_rate_limits enable row level security;
alter table public.sigec_candidate_signup_nonces enable row level security;
revoke all on table public.sigec_auth_rate_limits from public, anon, authenticated;
revoke all on table public.sigec_candidate_signup_nonces from public, anon, authenticated;
grant select, insert, delete on table public.sigec_candidate_signup_nonces to service_role;

create index sigec_auth_rate_limits_cleanup_idx
  on public.sigec_auth_rate_limits (updated_at);
create index sigec_candidate_signup_nonces_expiry_idx
  on public.sigec_candidate_signup_nonces (expires_at);

create or replace function public.sigec_consume_auth_rate_limit(
  p_bucket text,
  p_key_digest text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer, current_attempts integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.sigec_auth_rate_limits%rowtype;
begin
  if p_bucket not in ('signup_ip', 'signup_email', 'signup_phone', 'recovery_ip', 'recovery_email')
    or p_key_digest !~ '^[0-9a-f]{64}$'
    or p_limit not between 1 and 100
    or p_window_seconds not between 60 and 86400
    or p_block_seconds not between 60 and 604800
  then
    raise exception 'SIGEC_INVALID_RATE_LIMIT_PARAMETERS' using errcode = '22023';
  end if;

  insert into public.sigec_auth_rate_limits (bucket, key_digest, attempts)
  values (p_bucket, p_key_digest, 0)
  on conflict (bucket, key_digest) do nothing;

  select * into v_row
  from public.sigec_auth_rate_limits
  where bucket = p_bucket and key_digest = p_key_digest
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer),
      v_row.attempts;
    return;
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    v_row.window_started_at := v_now;
    v_row.attempts := 1;
    v_row.blocked_until := null;
  else
    v_row.attempts := v_row.attempts + 1;
    if v_row.attempts > p_limit then
      v_row.blocked_until := v_now + make_interval(secs => p_block_seconds);
    else
      v_row.blocked_until := null;
    end if;
  end if;

  update public.sigec_auth_rate_limits
  set window_started_at = v_row.window_started_at,
      attempts = v_row.attempts,
      blocked_until = v_row.blocked_until,
      updated_at = v_now
  where bucket = p_bucket and key_digest = p_key_digest;

  return query select v_row.blocked_until is null,
    case when v_row.blocked_until is null then 0
      else greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer)
    end,
    v_row.attempts;
end;
$$;

revoke all on function public.sigec_consume_auth_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.sigec_consume_auth_rate_limit(text, text, integer, integer, integer)
  to service_role;

comment on table public.sigec_auth_rate_limits is
  'Server-only abuse-control buckets. Identifiers are stored exclusively as keyed HMAC digests.';
comment on table public.sigec_candidate_signup_nonces is
  'Short-lived, one-time server proofs that prevent bypassing application-level signup limits through the public Auth API.';
comment on function public.sigec_consume_auth_rate_limit(text, text, integer, integer, integer) is
  'Atomically consumes a server-only authentication rate-limit bucket and fails closed for invalid parameters.';

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
    || jsonb_build_object('role', 'candidato')
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
