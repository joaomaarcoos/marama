create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  module text not null,
  type text not null,
  title text not null,
  message text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists system_notifications_recipient_idx
on public.system_notifications(recipient_id, is_read, created_at desc);
