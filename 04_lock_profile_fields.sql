-- 04_lock_profile_fields.sql
-- Run once in Supabase -> SQL Editor (after 03). Safe to re-run. Replaces the function from 03.
-- Non-admins (students and teachers) may now change ONLY their profile photo.
-- Name, date of birth, session, role, ID, class and status become admin-only.
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
  if new.id            is distinct from old.id
  or new.role          is distinct from old.role
  or new.user_code     is distinct from old.user_code
  or new.class_id      is distinct from old.class_id
  or new.status        is distinct from old.status
  or new.full_name     is distinct from old.full_name
  or new.date_of_birth is distinct from old.date_of_birth
  or new.session       is distinct from old.session then
    raise exception 'Only an administrator can change this information. You can change your photo.';
  end if;
  return new;
end;
$$;
