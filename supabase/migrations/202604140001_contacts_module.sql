create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.contacts (
  id text primary key,
  display_name text not null,
  internal_name text,
  student_name text,
  canonical_phone text,
  email text,
  cpf text,
  username text,
  moodle_id bigint,
  student_id uuid references public.students(id) on delete set null,
  role text check (role in ('aluno', 'gestor') or role is null),
  courses jsonb not null default '[]'::jsonb,
  labels text[] not null default '{}',
  conversation_phones text[] not null default '{}',
  last_message_at timestamptz,
  last_message text,
  assigned_name text,
  lgpd_accepted_at timestamptz,
  status text,
  followup_stage text,
  message_count integer not null default 0,
  has_moodle_data boolean not null default false,
  has_operational_data boolean not null default false,
  knowledge_level text not null default 'unknown' check (knowledge_level in ('moodle', 'operational', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_aliases (
  id bigserial primary key,
  contact_id text not null references public.contacts(id) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alias_type, normalized_value)
);

alter table public.students
  add column if not exists contact_id text references public.contacts(id) on delete set null;

alter table public.conversations
  add column if not exists contact_id text references public.contacts(id) on delete set null;

create index if not exists contacts_student_id_idx on public.contacts(student_id);
create index if not exists contacts_moodle_id_idx on public.contacts(moodle_id);
create index if not exists contacts_canonical_phone_idx on public.contacts(canonical_phone);
create index if not exists contacts_knowledge_level_idx on public.contacts(knowledge_level);
create index if not exists contact_aliases_contact_id_idx on public.contact_aliases(contact_id);
create index if not exists students_contact_id_idx on public.students(contact_id);
create index if not exists conversations_contact_id_idx on public.conversations(contact_id);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row
execute function public.set_row_updated_at();

drop trigger if exists contact_aliases_set_updated_at on public.contact_aliases;
create trigger contact_aliases_set_updated_at
before update on public.contact_aliases
for each row
execute function public.set_row_updated_at();
