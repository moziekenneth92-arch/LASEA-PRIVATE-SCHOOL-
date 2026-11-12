-- 03_protect_profiles.sql
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- Why: policy "profiles_update_self" lets every signed-in user update their OWN profile row,
-- including the role column. A student could set role = 'admin' from the browser console.
-- This trigger lets non-admins change only harmless fields (name, photo, date of birth, session...).
-- Admins, the Edge Function (service role) and the SQL editor are not affected.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.id        is distinct from old.id
  or new.role      is distinct from old.role
  or new.user_code is distinct from old.user_code
  or new.class_id  is distinct from old.class_id
  or new.status    is distinct from old.status then
    raise exception 'Only an administrator can change role, ID, class or status.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
