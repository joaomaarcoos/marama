begin;

-- Cover every foreign key used by SIGEC joins, deletes and audit lookups.
create index sigec_appeals_decided_by_idx
  on public.sigec_appeals(decided_by) where decided_by is not null;
create index sigec_documents_reviewed_by_idx
  on public.sigec_application_documents(reviewed_by) where reviewed_by is not null;
create index sigec_scores_reviewed_by_idx
  on public.sigec_application_scores(reviewed_by);
create index sigec_history_changed_by_idx
  on public.sigec_application_status_history(changed_by);
create index sigec_history_from_stage_idx
  on public.sigec_application_status_history(from_stage_id) where from_stage_id is not null;
create index sigec_history_to_stage_idx
  on public.sigec_application_status_history(to_stage_id);
create index sigec_applications_stage_idx
  on public.sigec_applications(stage_id) where stage_id is not null;
create index sigec_course_requirements_course_idx
  on public.sigec_process_course_requirements(course_id);
create index sigec_vacancies_modality_idx
  on public.sigec_vacancies(modality_id);

-- These tables are server-only. Explicit deny policies document that direct
-- authenticated access is intentionally unavailable; trusted server actions
-- use service_role only after checking the application role.
create policy sigec_audit_events_no_direct_access
on public.sigec_audit_events for all to authenticated
using (false) with check (false);

create policy sigec_convocation_batches_no_direct_access
on public.sigec_convocation_batches for all to authenticated
using (false) with check (false);

create policy sigec_internal_notes_no_direct_access
on public.sigec_internal_notes for all to authenticated
using (false) with check (false);

create policy sigec_notification_outbox_no_direct_access
on public.sigec_notification_outbox for all to authenticated
using (false) with check (false);

create policy sigec_scoring_criteria_no_direct_access
on public.sigec_scoring_criteria for all to authenticated
using (false) with check (false);

create policy sigec_whatsapp_verifications_no_direct_access
on public.sigec_whatsapp_verifications for all to authenticated
using (false) with check (false);

commit;
