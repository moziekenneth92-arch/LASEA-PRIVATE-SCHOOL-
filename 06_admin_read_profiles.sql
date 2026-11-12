-- 06_admin_read_profiles.sql
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- Allows signed-in administrators to read all profiles for the student and teacher directories.
-- Other roles remain subject to the existing profiles SELECT policies.

drop policy if exists "profiles_admin_read_all" on public.profiles;

create policy "profiles_admin_read_all"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());
