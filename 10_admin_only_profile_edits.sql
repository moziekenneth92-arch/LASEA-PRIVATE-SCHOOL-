-- Allow only administrators to edit profiles. Run once in Supabase SQL Editor.
-- Replaces the profile trigger function installed by sql/03 and sql/04.
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

  raise exception 'Only an administrator can edit profiles.';
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
