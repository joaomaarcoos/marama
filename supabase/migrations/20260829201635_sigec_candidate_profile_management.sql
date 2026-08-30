begin;

alter table public.sigec_candidate_profiles
  add constraint sigec_profile_street_length
    check (street is null or char_length(trim(street)) between 2 and 200) not valid,
  add constraint sigec_profile_address_number_length
    check (address_number is null or char_length(trim(address_number)) between 1 and 30) not valid,
  add constraint sigec_profile_address_extra_length
    check (address_extra is null or char_length(trim(address_extra)) <= 120) not valid,
  add constraint sigec_profile_district_length
    check (district is null or char_length(trim(district)) between 2 and 120) not valid,
  add constraint sigec_profile_city_length
    check (char_length(trim(city)) between 2 and 160) not valid,
  add constraint sigec_profile_availability_length
    check (availability is null or char_length(trim(availability)) between 2 and 1000) not valid,
  add constraint sigec_profile_summary_length
    check (professional_summary is null or char_length(trim(professional_summary)) <= 5000) not valid;

alter table public.sigec_candidate_profiles validate constraint sigec_profile_street_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_address_number_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_address_extra_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_district_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_city_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_availability_length;
alter table public.sigec_candidate_profiles validate constraint sigec_profile_summary_length;

alter table public.sigec_audit_events
  drop constraint sigec_audit_events_actor_id_fkey,
  add constraint sigec_audit_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

create or replace function private.sigec_prepare_candidate_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_is_complete boolean;
begin
  if new.user_id is distinct from old.user_id
    or new.cpf is distinct from old.cpf
    or new.created_at is distinct from old.created_at
  then
    raise exception 'SIGEC_CANDIDATE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;

  new.full_name := regexp_replace(trim(new.full_name), '\s+', ' ', 'g');
  new.whatsapp := regexp_replace(new.whatsapp, '[^0-9]', '', 'g');
  new.postal_code := nullif(regexp_replace(coalesce(new.postal_code, ''), '[^0-9]', '', 'g'), '');
  new.street := nullif(regexp_replace(trim(coalesce(new.street, '')), '\s+', ' ', 'g'), '');
  new.address_number := nullif(trim(coalesce(new.address_number, '')), '');
  new.address_extra := nullif(regexp_replace(trim(coalesce(new.address_extra, '')), '\s+', ' ', 'g'), '');
  new.district := nullif(regexp_replace(trim(coalesce(new.district, '')), '\s+', ' ', 'g'), '');
  new.city := regexp_replace(trim(new.city), '\s+', ' ', 'g');
  new.state := upper(trim(new.state));
  new.availability := nullif(trim(coalesce(new.availability, '')), '');
  new.professional_summary := nullif(trim(coalesce(new.professional_summary, '')), '');

  profile_is_complete :=
    char_length(new.full_name) between 3 and 200
    and new.birth_date <= current_date
    and new.whatsapp ~ '^[1-9][0-9]{9,14}$'
    and new.postal_code ~ '^[0-9]{8}$'
    and char_length(new.street) between 2 and 200
    and char_length(new.address_number) between 1 and 30
    and char_length(new.district) between 2 and 120
    and char_length(new.city) between 2 and 160
    and new.state ~ '^[A-Z]{2}$'
    and char_length(new.availability) between 2 and 1000;

  new.profile_completed_at := case
    when profile_is_complete then coalesce(old.profile_completed_at, now())
    else null
  end;

  return new;
end;
$$;

create or replace function private.sigec_audit_candidate_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_fields text[] := array[]::text[];
  actor uuid := auth.uid();
  actor_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'system');
begin
  if new.full_name is distinct from old.full_name then changed_fields := array_append(changed_fields, 'full_name'); end if;
  if new.birth_date is distinct from old.birth_date then changed_fields := array_append(changed_fields, 'birth_date'); end if;
  if new.whatsapp is distinct from old.whatsapp then changed_fields := array_append(changed_fields, 'whatsapp'); end if;
  if new.postal_code is distinct from old.postal_code then changed_fields := array_append(changed_fields, 'postal_code'); end if;
  if new.street is distinct from old.street then changed_fields := array_append(changed_fields, 'street'); end if;
  if new.address_number is distinct from old.address_number then changed_fields := array_append(changed_fields, 'address_number'); end if;
  if new.address_extra is distinct from old.address_extra then changed_fields := array_append(changed_fields, 'address_extra'); end if;
  if new.district is distinct from old.district then changed_fields := array_append(changed_fields, 'district'); end if;
  if new.city is distinct from old.city then changed_fields := array_append(changed_fields, 'city'); end if;
  if new.state is distinct from old.state then changed_fields := array_append(changed_fields, 'state'); end if;
  if new.availability is distinct from old.availability then changed_fields := array_append(changed_fields, 'availability'); end if;
  if new.professional_summary is distinct from old.professional_summary then changed_fields := array_append(changed_fields, 'professional_summary'); end if;

  if cardinality(changed_fields) > 0 then
    insert into public.sigec_audit_events (
      actor_id, actor_role, action, entity_type, entity_id, metadata
    ) values (
      actor,
      actor_role,
      'candidate_profile_updated',
      'candidate_profile',
      new.user_id::text,
      jsonb_build_object(
        'changed_fields', to_jsonb(changed_fields),
        'profile_complete', new.profile_completed_at is not null,
        'whatsapp_verification_reset', old.whatsapp is distinct from new.whatsapp
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.sigec_prepare_candidate_profile_update() from public, anon, authenticated;
revoke all on function private.sigec_audit_candidate_profile_update() from public, anon, authenticated;

drop trigger if exists sigec_candidate_profile_prepare on public.sigec_candidate_profiles;
create trigger sigec_candidate_profile_prepare
before update on public.sigec_candidate_profiles
for each row execute function private.sigec_prepare_candidate_profile_update();

drop trigger if exists sigec_candidate_profile_audit on public.sigec_candidate_profiles;
create trigger sigec_candidate_profile_audit
after update on public.sigec_candidate_profiles
for each row execute function private.sigec_audit_candidate_profile_update();

revoke update on public.sigec_candidate_profiles from authenticated;
grant update (
  full_name,
  birth_date,
  whatsapp,
  postal_code,
  street,
  address_number,
  address_extra,
  district,
  city,
  state,
  availability,
  professional_summary,
  updated_at
) on public.sigec_candidate_profiles to authenticated;

comment on function private.sigec_prepare_candidate_profile_update() is
  'Normalizes candidate-owned profile fields and derives completion without allowing candidates to self-verify.';
comment on function private.sigec_audit_candidate_profile_update() is
  'Audits only changed field names and completion state, never the candidate personal values.';

commit;
