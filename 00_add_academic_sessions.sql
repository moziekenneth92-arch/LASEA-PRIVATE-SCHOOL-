-- 00_add_academic_sessions.sql
-- Run ONCE in Supabase -> SQL Editor. Safe to re-run.
-- Creates the table that stores the academic sessions you enter in Admin -> Settings.

create table if not exists public.academic_sessions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,              -- e.g. 2026/2027
  is_current  boolean not null default false,    -- the session pages select by default
  created_at  timestamptz not null default now()
);

-- Only one session can be "current" at a time.
create unique index if not exists academic_sessions_one_current
  on public.academic_sessions (is_current) where is_current;

alter table public.academic_sessions enable row level security;

drop policy if exists "sessions: signed-in users can read" on public.academic_sessions;
create policy "sessions: signed-in users can read"
  on public.academic_sessions for select to authenticated using (true);

drop policy if exists "sessions: admin manages" on public.academic_sessions;
create policy "sessions: admin manages"
  on public.academic_sessions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'admin'));

-- Bring in sessions that already exist on students and results (nothing is invented).
insert into public.academic_sessions (name)
select distinct trim(s) from (
  select session as s from public.profiles
  union all
  select session from public.academic_results
) x
where s is not null and trim(s) <> ''
on conflict (name) do nothing;
