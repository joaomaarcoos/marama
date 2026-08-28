-- A consumed OTP must be distinguishable from a first successful validation.

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
  if v_verification.verified_at is not null then return 'already_used'; end if;
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
