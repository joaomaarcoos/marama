begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.sigec_is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'gerente'),
    false
  );
$$;

revoke all on function private.sigec_is_staff() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.sigec_is_staff() to authenticated;

create table public.sigec_candidate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 3 and 200),
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  birth_date date not null check (birth_date <= current_date),
  whatsapp text not null unique check (whatsapp ~ '^[1-9][0-9]{9,14}$'),
  whatsapp_verified_at timestamptz,
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{8}$'),
  street text,
  address_number text,
  address_extra text,
  district text,
  city text not null,
  state text not null default 'MA' check (state ~ '^[A-Z]{2}$'),
  availability text,
  professional_summary text,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.sigec_candidate_profiles(user_id) on delete cascade,
  level text not null check (level in ('tecnico', 'graduacao', 'especializacao', 'mestrado', 'doutorado', 'formacao_pedagogica', 'outro')),
  course_name text not null check (char_length(trim(course_name)) between 2 and 200),
  institution text not null check (char_length(trim(institution)) between 2 and 200),
  completion_date date,
  is_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_candidate_experience (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.sigec_candidate_profiles(user_id) on delete cascade,
  employment_type text not null check (employment_type in ('servidor_publico', 'contratado_publico', 'empregado_privado', 'bolsista', 'outro')),
  institution text not null check (char_length(trim(institution)) between 2 and 200),
  role_title text not null check (char_length(trim(role_title)) between 2 and 200),
  starts_on date not null,
  ends_on date,
  is_teaching boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.sigec_processes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  edital_version text not null default '1',
  edital_storage_path text,
  published_at timestamptz,
  applications_open_at timestamptz,
  applications_close_at timestamptz,
  max_preferences smallint not null default 5 check (max_preferences between 1 and 5),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (applications_close_at is null or applications_open_at is null or applications_close_at > applications_open_at),
  check (status <> 'open' or published_at is not null)
);

create table public.sigec_modalities (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (process_id, slug)
);

create table public.sigec_courses (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique check (char_length(trim(canonical_name)) between 3 and 200),
  normalized_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_process_course_requirements (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  course_id uuid not null references public.sigec_courses(id),
  accepted_education text not null,
  proof_instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, course_id)
);

create table public.sigec_vacancies (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  modality_id uuid not null references public.sigec_modalities(id) on delete cascade,
  course_id uuid not null references public.sigec_courses(id),
  municipality text not null check (char_length(trim(municipality)) between 2 and 160),
  vacancy_kind text not null default 'cadastro_reserva' check (vacancy_kind in ('cadastro_reserva', 'quantidade')),
  vacancy_count integer,
  active boolean not null default true,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (vacancy_kind = 'cadastro_reserva' and vacancy_count is null)
    or (vacancy_kind = 'quantidade' and vacancy_count > 0)
  ),
  unique (process_id, modality_id, course_id, municipality)
);

create table public.sigec_process_questions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  help_text text,
  question_type text not null check (question_type in ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'boolean', 'number', 'date')),
  required boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, code)
);

create table public.sigec_document_requirements (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  instructions text,
  required boolean not null default true,
  accepted_mime_types text[] not null default array['application/pdf', 'image/jpeg', 'image/png']::text[],
  max_file_size_bytes bigint not null default 10485760 check (max_file_size_bytes between 1 and 52428800),
  condition_config jsonb not null default '{}'::jsonb check (jsonb_typeof(condition_config) = 'object'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, code)
);

create table public.sigec_process_stages (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  public_description text,
  color text not null default '#64748b' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  is_terminal boolean not null default false,
  allows_appeal boolean not null default false,
  whatsapp_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, code)
);

create table public.sigec_scoring_criteria (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  instructions text,
  max_points numeric(7,2) not null check (max_points >= 0),
  scoring_config jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring_config) = 'object'),
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, code)
);

create table public.sigec_applications (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id),
  candidate_id uuid not null references public.sigec_candidate_profiles(user_id),
  stage_id uuid references public.sigec_process_stages(id),
  application_state text not null default 'draft' check (application_state in ('draft', 'submitted', 'withdrawn')),
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  score_total numeric(8,2) check (score_total is null or score_total >= 0),
  score_homologated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, candidate_id),
  check ((application_state <> 'submitted') or submitted_at is not null),
  check ((application_state <> 'withdrawn') or withdrawn_at is not null)
);

create table public.sigec_application_preferences (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  vacancy_id uuid not null references public.sigec_vacancies(id),
  position smallint not null check (position between 1 and 5),
  created_at timestamptz not null default now(),
  unique (application_id, position),
  unique (application_id, vacancy_id)
);

create table public.sigec_application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  question_id uuid not null references public.sigec_process_questions(id),
  answer jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, question_id)
);

create table public.sigec_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  requirement_id uuid references public.sigec_document_requirements(id),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version > 0),
  review_status text not null default 'pending' check (review_status in ('pending', 'valid', 'rejected')),
  review_message text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, requirement_id, version),
  check ((review_status = 'pending' and reviewed_at is null) or (review_status <> 'pending' and reviewed_at is not null))
);

create table public.sigec_application_status_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  from_stage_id uuid references public.sigec_process_stages(id),
  to_stage_id uuid not null references public.sigec_process_stages(id),
  public_message text,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sigec_internal_notes (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_information_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 3 and 5000),
  requested_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(requested_fields) = 'array'),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'answered', 'accepted', 'canceled')),
  requested_by uuid not null references auth.users(id),
  answered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_appeals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 10 and 10000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'granted', 'denied', 'canceled')),
  decision_message text,
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_application_scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  criterion_id uuid not null references public.sigec_scoring_criteria(id),
  points numeric(7,2) not null check (points >= 0),
  rationale text,
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, criterion_id)
);

create table public.sigec_convocation_batches (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sigec_processes(id),
  title text not null,
  published_at timestamptz,
  response_deadline timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sigec_convocations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sigec_convocation_batches(id) on delete cascade,
  application_id uuid not null references public.sigec_applications(id),
  vacancy_id uuid not null references public.sigec_vacancies(id),
  status text not null default 'called' check (status in ('called', 'accepted', 'declined', 'expired')),
  responded_at timestamptz,
  withdrawal_document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, application_id)
);

create table public.sigec_consents (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  consent_type text not null check (consent_type in ('edital', 'truthfulness', 'requirements', 'lgpd', 'ppi', 'pcd')),
  document_version text not null,
  accepted boolean not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text,
  unique (application_id, consent_type, document_version)
);

create table public.sigec_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sigec_applications(id) on delete cascade,
  event_type text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'system')),
  recipient text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'canceled')),
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sigec_whatsapp_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sigec_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index sigec_candidate_education_candidate_idx on public.sigec_candidate_education(candidate_id);
create index sigec_candidate_experience_candidate_idx on public.sigec_candidate_experience(candidate_id);
create index sigec_processes_status_dates_idx on public.sigec_processes(status, applications_open_at, applications_close_at);
create index sigec_processes_created_by_idx on public.sigec_processes(created_by);
create index sigec_modalities_process_idx on public.sigec_modalities(process_id, position);
create index sigec_requirements_process_course_idx on public.sigec_process_course_requirements(process_id, course_id);
create index sigec_vacancies_filter_idx on public.sigec_vacancies(process_id, modality_id, municipality, course_id) where active;
create index sigec_vacancies_course_idx on public.sigec_vacancies(course_id);
create index sigec_questions_process_position_idx on public.sigec_process_questions(process_id, position);
create index sigec_document_requirements_process_idx on public.sigec_document_requirements(process_id, position);
create index sigec_stages_process_position_idx on public.sigec_process_stages(process_id, position);
create index sigec_scoring_process_position_idx on public.sigec_scoring_criteria(process_id, position) where active;
create index sigec_applications_candidate_created_idx on public.sigec_applications(candidate_id, created_at desc);
create index sigec_applications_process_stage_idx on public.sigec_applications(process_id, stage_id, created_at desc);
create index sigec_preferences_application_idx on public.sigec_application_preferences(application_id, position);
create index sigec_preferences_vacancy_idx on public.sigec_application_preferences(vacancy_id);
create index sigec_answers_application_idx on public.sigec_application_answers(application_id);
create index sigec_answers_question_idx on public.sigec_application_answers(question_id);
create index sigec_documents_application_status_idx on public.sigec_application_documents(application_id, review_status);
create index sigec_documents_requirement_idx on public.sigec_application_documents(requirement_id);
create index sigec_status_history_application_idx on public.sigec_application_status_history(application_id, created_at desc);
create index sigec_notes_application_idx on public.sigec_internal_notes(application_id, created_at desc);
create index sigec_notes_author_idx on public.sigec_internal_notes(author_id);
create index sigec_information_requests_application_idx on public.sigec_information_requests(application_id, status);
create index sigec_information_requests_requested_by_idx on public.sigec_information_requests(requested_by);
create index sigec_appeals_application_idx on public.sigec_appeals(application_id, submitted_at desc);
create index sigec_scores_application_idx on public.sigec_application_scores(application_id);
create index sigec_scores_criterion_idx on public.sigec_application_scores(criterion_id);
create index sigec_batches_process_idx on public.sigec_convocation_batches(process_id, created_at desc);
create index sigec_batches_created_by_idx on public.sigec_convocation_batches(created_by);
create index sigec_convocations_application_idx on public.sigec_convocations(application_id);
create index sigec_convocations_vacancy_idx on public.sigec_convocations(vacancy_id);
create index sigec_consents_application_idx on public.sigec_consents(application_id);
create index sigec_outbox_claim_idx on public.sigec_notification_outbox(status, next_attempt_at, created_at) where status in ('pending', 'failed');
create index sigec_outbox_application_idx on public.sigec_notification_outbox(application_id, created_at desc);
create index sigec_whatsapp_user_idx on public.sigec_whatsapp_verifications(user_id, created_at desc);
create index sigec_audit_entity_idx on public.sigec_audit_events(entity_type, entity_id, created_at desc);
create index sigec_audit_actor_idx on public.sigec_audit_events(actor_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sigec_candidate_profiles', 'sigec_candidate_education', 'sigec_candidate_experience',
    'sigec_processes', 'sigec_courses', 'sigec_process_course_requirements', 'sigec_vacancies',
    'sigec_process_questions', 'sigec_document_requirements', 'sigec_process_stages',
    'sigec_scoring_criteria', 'sigec_applications', 'sigec_application_answers',
    'sigec_application_documents', 'sigec_internal_notes', 'sigec_information_requests',
    'sigec_appeals', 'sigec_application_scores', 'sigec_convocations',
    'sigec_notification_outbox'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_row_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

alter table public.sigec_candidate_profiles enable row level security;
alter table public.sigec_candidate_education enable row level security;
alter table public.sigec_candidate_experience enable row level security;
alter table public.sigec_processes enable row level security;
alter table public.sigec_modalities enable row level security;
alter table public.sigec_courses enable row level security;
alter table public.sigec_process_course_requirements enable row level security;
alter table public.sigec_vacancies enable row level security;
alter table public.sigec_process_questions enable row level security;
alter table public.sigec_document_requirements enable row level security;
alter table public.sigec_process_stages enable row level security;
alter table public.sigec_scoring_criteria enable row level security;
alter table public.sigec_applications enable row level security;
alter table public.sigec_application_preferences enable row level security;
alter table public.sigec_application_answers enable row level security;
alter table public.sigec_application_documents enable row level security;
alter table public.sigec_application_status_history enable row level security;
alter table public.sigec_internal_notes enable row level security;
alter table public.sigec_information_requests enable row level security;
alter table public.sigec_appeals enable row level security;
alter table public.sigec_application_scores enable row level security;
alter table public.sigec_convocation_batches enable row level security;
alter table public.sigec_convocations enable row level security;
alter table public.sigec_consents enable row level security;
alter table public.sigec_notification_outbox enable row level security;
alter table public.sigec_whatsapp_verifications enable row level security;
alter table public.sigec_audit_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sigec_candidate_profiles', 'sigec_candidate_education', 'sigec_candidate_experience',
    'sigec_processes', 'sigec_modalities', 'sigec_courses', 'sigec_process_course_requirements',
    'sigec_vacancies', 'sigec_process_questions', 'sigec_document_requirements',
    'sigec_process_stages', 'sigec_scoring_criteria', 'sigec_applications',
    'sigec_application_preferences', 'sigec_application_answers', 'sigec_application_documents',
    'sigec_application_status_history', 'sigec_internal_notes', 'sigec_information_requests',
    'sigec_appeals', 'sigec_application_scores', 'sigec_convocation_batches',
    'sigec_convocations', 'sigec_consents', 'sigec_notification_outbox',
    'sigec_whatsapp_verifications', 'sigec_audit_events'
  ]
  loop
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

grant select on public.sigec_processes, public.sigec_modalities, public.sigec_courses,
  public.sigec_process_course_requirements, public.sigec_vacancies,
  public.sigec_process_questions, public.sigec_document_requirements,
  public.sigec_process_stages to anon, authenticated;

grant select on public.sigec_candidate_profiles to authenticated;
grant insert (
  user_id, full_name, cpf, birth_date, whatsapp, postal_code, street,
  address_number, address_extra, district, city, state, availability, professional_summary
) on public.sigec_candidate_profiles to authenticated;
grant update (
  full_name, birth_date, postal_code, street, address_number, address_extra,
  district, city, state, availability, professional_summary, updated_at
) on public.sigec_candidate_profiles to authenticated;
grant select, insert, update, delete on public.sigec_candidate_education,
  public.sigec_candidate_experience to authenticated;
grant select on public.sigec_applications, public.sigec_application_preferences,
  public.sigec_application_answers, public.sigec_application_documents,
  public.sigec_application_status_history, public.sigec_information_requests,
  public.sigec_appeals, public.sigec_application_scores, public.sigec_convocations,
  public.sigec_consents to authenticated;
grant insert (process_id, candidate_id) on public.sigec_applications to authenticated;
grant insert, update, delete on public.sigec_application_preferences,
  public.sigec_application_answers to authenticated;
grant insert (application_id, requirement_id, storage_path, original_name, mime_type, size_bytes, sha256, version)
  on public.sigec_application_documents to authenticated;
grant insert (application_id, reason) on public.sigec_appeals to authenticated;
grant insert (application_id, consent_type, document_version, accepted, ip_hash, user_agent_hash)
  on public.sigec_consents to authenticated;

create policy sigec_processes_public_read on public.sigec_processes
for select to anon
using (status = 'open' and published_at is not null and published_at <= now());

create policy sigec_processes_authenticated_read on public.sigec_processes
for select to authenticated
using (
  (status = 'open' and published_at is not null and published_at <= now())
  or (select private.sigec_is_staff())
  or exists (
    select 1 from public.sigec_applications application
    where application.process_id = sigec_processes.id
      and application.candidate_id = (select auth.uid())
  )
);

create policy sigec_catalog_public_read on public.sigec_courses
for select to anon, authenticated using (active);

create policy sigec_modalities_visible_process on public.sigec_modalities
for select to anon, authenticated
using (exists (select 1 from public.sigec_processes process where process.id = process_id));

create policy sigec_requirements_visible_process on public.sigec_process_course_requirements
for select to anon, authenticated
using (exists (select 1 from public.sigec_processes process where process.id = process_id));

create policy sigec_vacancies_visible_process on public.sigec_vacancies
for select to anon, authenticated
using (active and exists (select 1 from public.sigec_processes process where process.id = process_id));

create policy sigec_questions_visible_process on public.sigec_process_questions
for select to anon, authenticated
using (exists (select 1 from public.sigec_processes process where process.id = process_id));

create policy sigec_document_requirements_visible_process on public.sigec_document_requirements
for select to anon, authenticated
using (exists (select 1 from public.sigec_processes process where process.id = process_id));

create policy sigec_stages_visible_process on public.sigec_process_stages
for select to authenticated
using (
  (select private.sigec_is_staff())
  or exists (
    select 1 from public.sigec_applications application
    where application.process_id = process_id
      and application.candidate_id = (select auth.uid())
  )
);

create policy sigec_profiles_own_read on public.sigec_candidate_profiles
for select to authenticated using ((select auth.uid()) = user_id or (select private.sigec_is_staff()));
create policy sigec_profiles_own_insert on public.sigec_candidate_profiles
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sigec_profiles_own_update on public.sigec_candidate_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy sigec_education_owner_all on public.sigec_candidate_education
for all to authenticated
using ((select auth.uid()) = candidate_id)
with check ((select auth.uid()) = candidate_id);

create policy sigec_education_staff_read on public.sigec_candidate_education
for select to authenticated using ((select private.sigec_is_staff()));

create policy sigec_experience_owner_all on public.sigec_candidate_experience
for all to authenticated
using ((select auth.uid()) = candidate_id)
with check ((select auth.uid()) = candidate_id);

create policy sigec_experience_staff_read on public.sigec_candidate_experience
for select to authenticated using ((select private.sigec_is_staff()));

create policy sigec_applications_owner_read on public.sigec_applications
for select to authenticated
using ((select auth.uid()) = candidate_id or (select private.sigec_is_staff()));

create policy sigec_applications_owner_insert on public.sigec_applications
for insert to authenticated
with check (
  (select auth.uid()) = candidate_id
  and exists (
    select 1 from public.sigec_candidate_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.whatsapp_verified_at is not null
      and profile.profile_completed_at is not null
  )
  and exists (
    select 1 from public.sigec_processes process
    where process.id = process_id
      and process.status = 'open'
      and (process.applications_open_at is null or process.applications_open_at <= now())
      and (process.applications_close_at is null or process.applications_close_at > now())
  )
);

create policy sigec_preferences_owner_read on public.sigec_application_preferences
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_preferences_owner_write on public.sigec_application_preferences
for all to authenticated
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
  join public.sigec_vacancies vacancy on vacancy.id = vacancy_id and vacancy.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and vacancy.active
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_answers_owner_read on public.sigec_application_answers
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_answers_owner_write on public.sigec_application_answers
for all to authenticated
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
  join public.sigec_process_questions question on question.id = question_id and question.process_id = application.process_id
  join public.sigec_processes process on process.id = application.process_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and application.application_state in ('draft', 'submitted')
    and (process.applications_close_at is null or process.applications_close_at > now())
));

create policy sigec_documents_owner_read on public.sigec_application_documents
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_documents_owner_insert on public.sigec_application_documents
for insert to authenticated
with check (
  storage_path like (select auth.uid())::text || '/' || application_id::text || '/%'
  and exists (
    select 1 from public.sigec_applications application
    join public.sigec_processes process on process.id = application.process_id
    left join public.sigec_information_requests request
      on request.application_id = application.id and request.status = 'open'
    where application.id = application_id
      and application.candidate_id = (select auth.uid())
      and (
        process.applications_close_at is null
        or process.applications_close_at > now()
        or (request.id is not null and (request.due_at is null or request.due_at > now()))
      )
  )
);

create policy sigec_history_owner_read on public.sigec_application_status_history
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_requests_owner_read on public.sigec_information_requests
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_appeals_owner_read on public.sigec_appeals
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_appeals_owner_insert on public.sigec_appeals
for insert to authenticated
with check (exists (
  select 1 from public.sigec_applications application
  join public.sigec_process_stages stage on stage.id = application.stage_id
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
    and stage.allows_appeal
));

create policy sigec_scores_owner_read on public.sigec_application_scores
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_convocations_owner_read on public.sigec_convocations
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_consents_owner_read on public.sigec_consents
for select to authenticated
using (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and (application.candidate_id = (select auth.uid()) or (select private.sigec_is_staff()))
));

create policy sigec_consents_owner_insert on public.sigec_consents
for insert to authenticated
with check (exists (
  select 1 from public.sigec_applications application
  where application.id = application_id
    and application.candidate_id = (select auth.uid())
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sigec-candidate-documents',
  'sigec-candidate-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy sigec_storage_candidate_read on storage.objects
for select to authenticated
using (
  bucket_id = 'sigec-candidate-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.sigec_is_staff())
  )
);

create policy sigec_storage_candidate_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sigec-candidate-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.sigec_applications application
    join public.sigec_processes process on process.id = application.process_id
    left join public.sigec_information_requests request
      on request.application_id = application.id and request.status = 'open'
    where application.candidate_id = (select auth.uid())
      and application.id::text = (storage.foldername(name))[2]
      and (
        process.applications_close_at is null
        or process.applications_close_at > now()
        or (request.id is not null and (request.due_at is null or request.due_at > now()))
      )
  )
);

-- Candidate files are append-only. Corrections create a new version and a new
-- object path; candidates cannot overwrite or delete evidence already submitted.

commit;
