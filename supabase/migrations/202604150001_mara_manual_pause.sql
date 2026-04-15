alter table public.conversations
add column if not exists mara_manual_paused boolean;

update public.conversations
set mara_manual_paused = false
where mara_manual_paused is null;

alter table public.conversations
alter column mara_manual_paused set default false;

alter table public.conversations
alter column mara_manual_paused set not null;
