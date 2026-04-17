alter table public.conversations
add column if not exists cpf text;

alter table public.conversations
add column if not exists whatsapp_name text;

alter table public.conversations
add column if not exists contact_name_confirmed boolean;

update public.conversations as c
set cpf = s.cpf
from public.students as s
where c.student_id = s.id
  and c.cpf is null
  and s.cpf is not null;

update public.conversations
set contact_name_confirmed = false
where contact_name_confirmed is null;

alter table public.conversations
alter column contact_name_confirmed set default false;

alter table public.conversations
alter column contact_name_confirmed set not null;

create index if not exists conversations_cpf_idx
on public.conversations(cpf);
