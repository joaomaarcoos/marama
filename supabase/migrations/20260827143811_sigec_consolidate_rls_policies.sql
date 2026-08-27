begin;

drop policy sigec_education_owner_all on public.sigec_candidate_education;
drop policy sigec_education_staff_read on public.sigec_candidate_education;

create policy sigec_education_read
on public.sigec_candidate_education for select to authenticated
using ((select auth.uid()) = candidate_id or (select private.sigec_is_staff()));
create policy sigec_education_insert
on public.sigec_candidate_education for insert to authenticated
with check ((select auth.uid()) = candidate_id);
create policy sigec_education_update
on public.sigec_candidate_education for update to authenticated
using ((select auth.uid()) = candidate_id)
with check ((select auth.uid()) = candidate_id);
create policy sigec_education_delete
on public.sigec_candidate_education for delete to authenticated
using ((select auth.uid()) = candidate_id);

drop policy sigec_experience_owner_all on public.sigec_candidate_experience;
drop policy sigec_experience_staff_read on public.sigec_candidate_experience;

create policy sigec_experience_read
on public.sigec_candidate_experience for select to authenticated
using ((select auth.uid()) = candidate_id or (select private.sigec_is_staff()));
create policy sigec_experience_insert
on public.sigec_candidate_experience for insert to authenticated
with check ((select auth.uid()) = candidate_id);
create policy sigec_experience_update
on public.sigec_candidate_experience for update to authenticated
using ((select auth.uid()) = candidate_id)
with check ((select auth.uid()) = candidate_id);
create policy sigec_experience_delete
on public.sigec_candidate_experience for delete to authenticated
using ((select auth.uid()) = candidate_id);

drop policy sigec_preferences_owner_write on public.sigec_application_preferences;

create policy sigec_preferences_owner_insert
on public.sigec_application_preferences for insert to authenticated
with check (exists (
  select 1 from public.sigec_applications application
  join public.sigec_vacancies vacancy
    on vacancy.id = vacancy_id and vacancy.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and vacancy.active
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_preferences_owner_update
on public.sigec_application_preferences for update to authenticated
using (exists (
  select 1 from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
))
with check (exists (
  select 1 from public.sigec_applications application
  join public.sigec_vacancies vacancy
    on vacancy.id = vacancy_id and vacancy.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and vacancy.active
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_preferences_owner_delete
on public.sigec_application_preferences for delete to authenticated
using (exists (
  select 1 from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
));

drop policy sigec_answers_owner_write on public.sigec_application_answers;

create policy sigec_answers_owner_insert
on public.sigec_application_answers for insert to authenticated
with check (exists (
  select 1 from public.sigec_applications application
  join public.sigec_process_questions question
    on question.id = question_id and question.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_answers_owner_update
on public.sigec_application_answers for update to authenticated
using (exists (
  select 1 from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
))
with check (exists (
  select 1 from public.sigec_applications application
  join public.sigec_process_questions question
    on question.id = question_id and question.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_answers_owner_delete
on public.sigec_application_answers for delete to authenticated
using (exists (
  select 1 from public.sigec_applications application
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
));

commit;
