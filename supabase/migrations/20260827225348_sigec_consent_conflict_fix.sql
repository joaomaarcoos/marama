-- Resolve PL/pgSQL output-column ambiguity in the idempotent insert.

create or replace function public.sigec_record_required_consents(
  p_application_id uuid,
  p_candidate_id uuid,
  p_ip_hash text,
  p_user_agent_hash text
)
returns table (consent_type text, document_version text, accepted_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_process_id uuid;
  v_edital_version text;
begin
  if p_application_id is null or p_candidate_id is null then
    raise exception 'invalid_consent_subject' using errcode = '22023';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_user_agent_hash is null or p_user_agent_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_consent_evidence' using errcode = '22023';
  end if;

  select application.process_id into v_process_id
  from public.sigec_applications application
  where application.id = p_application_id
    and application.candidate_id = p_candidate_id
    and application.application_state = 'draft';
  if v_process_id is null then
    raise exception 'application_not_eligible_for_consent' using errcode = 'P0001';
  end if;

  select process.edital_version into v_edital_version
  from public.sigec_processes process
  where process.id = v_process_id
    and process.status = 'open'
    and process.published_at is not null
    and process.published_at <= now()
    and (process.applications_open_at is null or process.applications_open_at <= now())
    and (process.applications_close_at is null or process.applications_close_at > now());
  if v_edital_version is null or char_length(trim(v_edital_version)) = 0 then
    raise exception 'process_not_open_for_consent' using errcode = 'P0001';
  end if;

  insert into public.sigec_consents (
    application_id, consent_type, document_version, accepted, ip_hash, user_agent_hash
  ) values
    (p_application_id, 'edital', 'edital:' || v_edital_version, true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'truthfulness', 'declaracao-veracidade:1', true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'requirements', 'requisitos:' || v_edital_version, true, p_ip_hash, p_user_agent_hash),
    (p_application_id, 'lgpd', 'aviso-privacidade:1', true, p_ip_hash, p_user_agent_hash)
  on conflict do nothing;

  if (
    select count(*) from public.sigec_consents consent
    where consent.application_id = p_application_id
      and consent.accepted = true
      and (
        (consent.consent_type = 'edital' and consent.document_version = 'edital:' || v_edital_version)
        or (consent.consent_type = 'truthfulness' and consent.document_version = 'declaracao-veracidade:1')
        or (consent.consent_type = 'requirements' and consent.document_version = 'requisitos:' || v_edital_version)
        or (consent.consent_type = 'lgpd' and consent.document_version = 'aviso-privacidade:1')
      )
  ) <> 4 then
    raise exception 'required_consent_bundle_incomplete' using errcode = 'P0001';
  end if;

  return query
  select consent.consent_type, consent.document_version, consent.accepted_at
  from public.sigec_consents consent
  where consent.application_id = p_application_id
    and consent.accepted = true
    and (
      (consent.consent_type = 'edital' and consent.document_version = 'edital:' || v_edital_version)
      or (consent.consent_type = 'truthfulness' and consent.document_version = 'declaracao-veracidade:1')
      or (consent.consent_type = 'requirements' and consent.document_version = 'requisitos:' || v_edital_version)
      or (consent.consent_type = 'lgpd' and consent.document_version = 'aviso-privacidade:1')
    )
  order by consent.consent_type;
end;
$$;

revoke all on function public.sigec_record_required_consents(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.sigec_record_required_consents(uuid, uuid, text, text)
  to service_role;
