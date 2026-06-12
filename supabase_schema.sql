create table if not exists public.batch_brew_records (
  record_date text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.batch_brew_records enable row level security;

drop policy if exists "batch brew public read" on public.batch_brew_records;
drop policy if exists "batch brew public insert" on public.batch_brew_records;
drop policy if exists "batch brew public update" on public.batch_brew_records;
drop policy if exists "batch brew public delete" on public.batch_brew_records;

create policy "batch brew public read"
on public.batch_brew_records
for select
using (true);

create policy "batch brew public insert"
on public.batch_brew_records
for insert
with check (true);

create policy "batch brew public update"
on public.batch_brew_records
for update
using (true)
with check (true);

create policy "batch brew public delete"
on public.batch_brew_records
for delete
using (true);

-- This schema is designed for a simple cafe log where anyone with the app URL can read/write records.
-- For private staff-only access, put this app behind a password-protected host or add Supabase Auth.
