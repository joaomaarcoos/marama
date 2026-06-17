create extension if not exists pgcrypto;

create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default 'hsl(160 84% 39%)',
  created_by uuid not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_project_members (
  project_id uuid not null references public.task_projects(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.task_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.task_projects(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.task_projects(id) on delete cascade,
  section_id uuid references public.task_sections(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'canceled')),
  priority text not null default 'p4' check (priority in ('p1', 'p2', 'p3', 'p4')),
  due_at timestamptz,
  position integer not null default 0,
  created_by uuid not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id)
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.task_projects(id) on delete cascade,
  actor_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid,
  remind_at timestamptz not null,
  kind text not null default 'manual' check (kind in ('manual', 'due_at', 'one_day_before', 'three_days_before')),
  delivered_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.task_projects(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.task_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  file_name text,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_projects_created_by_idx on public.task_projects(created_by);
create index if not exists task_project_members_user_idx on public.task_project_members(user_id);
create index if not exists task_sections_project_idx on public.task_sections(project_id, position);
create index if not exists tasks_project_idx on public.tasks(project_id, position);
create index if not exists tasks_section_idx on public.tasks(section_id, position);
create index if not exists tasks_parent_idx on public.tasks(parent_task_id);
create index if not exists tasks_due_at_idx on public.tasks(due_at);
create index if not exists task_assignees_user_idx on public.task_assignees(user_id);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);
create index if not exists task_activity_task_idx on public.task_activity(task_id, created_at);
create index if not exists task_reminders_due_idx on public.task_reminders(remind_at) where delivered_at is null;
create index if not exists task_notifications_recipient_idx on public.task_notifications(recipient_id, is_read, created_at desc);

drop trigger if exists task_projects_set_updated_at on public.task_projects;
create trigger task_projects_set_updated_at
before update on public.task_projects
for each row execute function public.set_row_updated_at();

drop trigger if exists task_sections_set_updated_at on public.task_sections;
create trigger task_sections_set_updated_at
before update on public.task_sections
for each row execute function public.set_row_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_row_updated_at();

drop trigger if exists task_comments_set_updated_at on public.task_comments;
create trigger task_comments_set_updated_at
before update on public.task_comments
for each row execute function public.set_row_updated_at();

create or replace function public.prevent_nested_subtasks()
returns trigger
language plpgsql
as $$
begin
  if new.parent_task_id is not null and exists (
    select 1 from public.tasks parent
    where parent.id = new.parent_task_id
      and parent.parent_task_id is not null
  ) then
    raise exception 'Subtarefas podem ter apenas 1 nivel de profundidade';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_prevent_nested_subtasks on public.tasks;
create trigger tasks_prevent_nested_subtasks
before insert or update of parent_task_id on public.tasks
for each row execute function public.prevent_nested_subtasks();
