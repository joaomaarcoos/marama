begin;

alter table public.sigec_applications
  add constraint sigec_applications_score_total_cap check (score_total is null or score_total between 0 and 100) not valid;
alter table public.sigec_applications validate constraint sigec_applications_score_total_cap;

create table public.sigec_application_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete restrict,
  version integer not null check (version > 0),
  algorithm_version text not null check (char_length(trim(algorithm_version)) between 3 and 100),
  postgraduate_points numeric(7,2) not null check (postgraduate_points between 0 and 30),
  experience_points numeric(7,2) not null check (experience_points between 0 and 40),
  academic_points numeric(7,2) not null check (academic_points between 0 and 30),
  total_points numeric(7,2) generated always as (postgraduate_points + experience_points + academic_points) stored,
  component_details jsonb not null default '{}'::jsonb check (jsonb_typeof(component_details) = 'object'),
  calculated_by uuid not null references auth.users(id) on delete restrict,
  supersedes_snapshot_id uuid unique references public.sigec_application_score_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (application_id, version),
  check (postgraduate_points + experience_points + academic_points <= 100)
);

create index sigec_score_snapshots_application_idx on public.sigec_application_score_snapshots(application_id, version desc);
create index sigec_score_snapshots_actor_idx on public.sigec_application_score_snapshots(calculated_by);
alter table public.sigec_application_score_snapshots enable row level security;
revoke all on public.sigec_application_score_snapshots from public, anon, authenticated;
grant select, insert on public.sigec_application_score_snapshots to service_role;

create or replace function private.sigec_reject_score_snapshot_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'SIGEC_SCORE_SNAPSHOT_IMMUTABLE' using errcode = '55000'; end;
$$;
revoke all on function private.sigec_reject_score_snapshot_mutation() from public, anon, authenticated;
create trigger sigec_score_snapshots_immutable before update or delete on public.sigec_application_score_snapshots
for each row execute function private.sigec_reject_score_snapshot_mutation();

create or replace function public.sigec_recalculate_application_score(p_actor_id uuid, p_application_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  previous_snapshot record; next_version integer; snapshot_id uuid;
  postgrad record; experience record; academic record;
  postgrad_points numeric(7,2); experience_points numeric(7,2); academic_points numeric(7,2); final_points numeric(7,2);
begin
  if p_actor_id is null or not exists (select 1 from auth.users staff where staff.id=p_actor_id and staff.raw_app_meta_data->>'role' in ('admin','gerente')) then
    raise exception 'SIGEC_SCORE_STAFF_REQUIRED' using errcode='42501';
  end if;
  if not exists (select 1 from public.sigec_applications application where application.id=p_application_id and application.application_state='submitted' for update) then
    raise exception 'SIGEC_SCORE_SUBMITTED_APPLICATION_REQUIRED' using errcode='23514';
  end if;

  select * into postgrad from public.sigec_get_postgraduate_score(p_actor_id,p_application_id);
  select * into experience from public.sigec_get_experience_score(p_actor_id,p_application_id);
  select * into academic from public.sigec_get_academic_production_score(p_actor_id,p_application_id);
  postgrad_points:=coalesce(postgrad.points,0); experience_points:=coalesce(experience.points,0); academic_points:=coalesce(academic.points,0);
  if postgrad_points not between 0 and 30 or experience_points not between 0 and 40 or academic_points not between 0 and 30 then
    raise exception 'SIGEC_SCORE_COMPONENT_OUT_OF_RANGE' using errcode='23514';
  end if;
  final_points:=postgrad_points+experience_points+academic_points;
  if final_points not between 0 and 100 then raise exception 'SIGEC_SCORE_TOTAL_OUT_OF_RANGE' using errcode='23514'; end if;

  select snapshot.id,snapshot.version into previous_snapshot from public.sigec_application_score_snapshots snapshot
  where snapshot.application_id=p_application_id order by snapshot.version desc limit 1;
  next_version:=coalesce(previous_snapshot.version,0)+1;
  insert into public.sigec_application_score_snapshots(application_id,version,algorithm_version,postgraduate_points,experience_points,academic_points,component_details,calculated_by,supersedes_snapshot_id)
  values(p_application_id,next_version,'sigec-score-v1',postgrad_points,experience_points,academic_points,
    jsonb_build_object('postgraduate',jsonb_build_object('selectedLevel',postgrad.selected_level,'eligibleTitles',postgrad.eligible_title_count),'experience',jsonb_build_object('uniqueDays',experience.total_unique_days,'months',experience.total_months,'remainingDays',experience.remaining_days,'eligiblePeriods',experience.eligible_experience_count),'academic',jsonb_build_object('breakdown',academic.breakdown,'eligibleEvidence',academic.eligible_evidence_count)),p_actor_id,previous_snapshot.id)
  returning id into snapshot_id;
  update public.sigec_applications set score_total=final_points,updated_at=now() where id=p_application_id;
  insert into public.sigec_audit_events(actor_id,actor_role,action,entity_type,entity_id,metadata)
  values(p_actor_id,(select raw_app_meta_data->>'role' from auth.users where id=p_actor_id),'application_score_recalculated','sigec_application',p_application_id::text,
    jsonb_build_object('snapshotId',snapshot_id,'version',next_version,'algorithmVersion','sigec-score-v1','postgraduatePoints',postgrad_points,'experiencePoints',experience_points,'academicPoints',academic_points,'totalPoints',final_points));
  return snapshot_id;
end; $$;

revoke all on function public.sigec_recalculate_application_score(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sigec_recalculate_application_score(uuid,uuid) to service_role;
comment on table public.sigec_application_score_snapshots is 'Immutable consolidated score snapshots capped at 30 postgraduate, 40 experience, 30 academic and 100 total.';
comment on function public.sigec_recalculate_application_score(uuid,uuid) is 'Server-only atomic score consolidation using algorithm sigec-score-v1.';
commit;
