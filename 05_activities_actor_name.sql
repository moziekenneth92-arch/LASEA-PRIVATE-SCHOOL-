-- 05_activities_actor_name.sql
-- Run once in Supabase -> SQL Editor BEFORE using the new code. Safe to re-run.
-- Stores the person's name on every activity, so history still reads correctly after an account is deleted.
alter table public.activities add column if not exists actor_name text;

-- Fill in names for existing rows.
update public.activities a
set actor_name = p.full_name
from public.profiles p
where p.id = a.user_id and a.actor_name is null;
