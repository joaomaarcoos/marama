alter table public.sigec_whatsapp_verifications
  add column invalidated_at timestamptz,
  add column locked_at timestamptz,
  add column sent_at timestamptz,
  add column request_ip_digest text,
  add constraint sigec_whatsapp_code_hash_format check (code_hash ~ '^[0-9a-f]{64}$'),
  add constraint sigec_whatsapp_phone_format check (whatsapp ~ '^[1-9][0-9]{9,14}$'),
  add constraint sigec_whatsapp_request_ip_digest_format check (
    request_ip_digest is null or request_ip_digest ~ '^[0-9a-f]{64}$'
  );

revoke all on table public.sigec_whatsapp_verifications from public, anon, authenticated;
grant select, insert, update on table public.sigec_whatsapp_verifications to service_role;

alter table public.sigec_auth_rate_limits
  drop constraint if exists sigec_auth_rate_limits_bucket_check;
alter table public.sigec_auth_rate_limits
  add constraint sigec_auth_rate_limits_bucket_check check (
    bucket in (
      'signup_ip', 'signup_email', 'signup_phone', 'recovery_ip', 'recovery_email',
      'whatsapp_ip', 'whatsapp_user', 'whatsapp_phone'
    )
  );

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
  if p_bucket not in (
      'signup_ip', 'signup_email', 'signup_phone', 'recovery_ip', 'recovery_email',
      'whatsapp_ip', 'whatsapp_user', 'whatsapp_phone'
    )
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

create or replace function public.sigec_issue_whatsapp_verification(
  p_verification_id uuid,
  p_user_id uuid,
  p_whatsapp text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_request_ip_digest text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.sigec_candidate_profiles%rowtype;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
    or p_whatsapp !~ '^[1-9][0-9]{9,14}$'
    or p_request_ip_digest !~ '^[0-9a-f]{64}$'
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '15 minutes'
  then
    raise exception 'SIGEC_INVALID_WHATSAPP_VERIFICATION' using errcode = '22023';
  end if;

  select * into v_profile
  from public.sigec_candidate_profiles
  where user_id = p_user_id
  for update;

  if not found or v_profile.whatsapp <> p_whatsapp then
    return 'profile_mismatch';
  end if;
  if v_profile.whatsapp_verified_at is not null then
    return 'already_verified';
  end if;

  update public.sigec_whatsapp_verifications
  set invalidated_at = clock_timestamp()
  where user_id = p_user_id
    and verified_at is null
    and invalidated_at is null;

  insert into public.sigec_whatsapp_verifications (
    id, user_id, whatsapp, code_hash, expires_at, request_ip_digest
  ) values (
    p_verification_id, p_user_id, p_whatsapp, p_code_hash, p_expires_at, p_request_ip_digest
  );

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_user_id, 'candidato', 'whatsapp_verification_requested',
    'candidate_profile', p_user_id::text, jsonb_build_object('expires_at', p_expires_at)
  );

  return 'issued';
end;
$$;

revoke all on function public.sigec_issue_whatsapp_verification(uuid, uuid, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.sigec_issue_whatsapp_verification(uuid, uuid, text, text, timestamptz, text)
  to service_role;

create or replace function public.sigec_verify_whatsapp_code(
  p_verification_id uuid,
  p_user_id uuid,
  p_code_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_verification public.sigec_whatsapp_verifications%rowtype;
  v_updated integer;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'SIGEC_INVALID_WHATSAPP_CODE_HASH' using errcode = '22023';
  end if;

  select * into v_verification
  from public.sigec_whatsapp_verifications
  where id = p_verification_id and user_id = p_user_id
  for update;

  if not found then return 'not_found'; end if;
  if v_verification.verified_at is not null then return 'verified'; end if;
  if v_verification.invalidated_at is not null then return 'invalidated'; end if;
  if v_verification.expires_at <= v_now then
    update public.sigec_whatsapp_verifications set invalidated_at = v_now where id = p_verification_id;
    return 'expired';
  end if;

  if v_verification.code_hash <> p_code_hash then
    update public.sigec_whatsapp_verifications
    set attempts = attempts + 1,
        locked_at = case when attempts + 1 >= 5 then v_now else locked_at end,
        invalidated_at = case when attempts + 1 >= 5 then v_now else invalidated_at end
    where id = p_verification_id;
    if v_verification.attempts + 1 >= 5 then return 'locked'; end if;
    return 'invalid';
  end if;

  update public.sigec_candidate_profiles
  set whatsapp_verified_at = v_now,
      updated_at = v_now
  where user_id = p_user_id
    and whatsapp = v_verification.whatsapp;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    update public.sigec_whatsapp_verifications set invalidated_at = v_now where id = p_verification_id;
    return 'profile_mismatch';
  end if;

  update public.sigec_whatsapp_verifications
  set attempts = attempts + 1,
      verified_at = v_now
  where id = p_verification_id;

  insert into public.sigec_audit_events (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_user_id, 'candidato', 'whatsapp_verified',
    'candidate_profile', p_user_id::text, '{}'::jsonb
  );

  return 'verified';
end;
$$;

revoke all on function public.sigec_verify_whatsapp_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.sigec_verify_whatsapp_code(uuid, uuid, text)
  to service_role;

create or replace function private.sigec_reset_whatsapp_verification_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.whatsapp is distinct from old.whatsapp then
    new.whatsapp_verified_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.sigec_reset_whatsapp_verification_on_change()
  from public, anon, authenticated;

drop trigger if exists sigec_reset_whatsapp_verification_on_change
  on public.sigec_candidate_profiles;
create trigger sigec_reset_whatsapp_verification_on_change
before update of whatsapp on public.sigec_candidate_profiles
for each row execute function private.sigec_reset_whatsapp_verification_on_change();
