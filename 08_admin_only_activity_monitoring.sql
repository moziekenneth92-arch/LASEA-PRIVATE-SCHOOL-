-- Restrict activity-history reads and deletes to admins while allowing each
-- signed-in user to record their own activity.
alter table public.activities enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'activities'
  loop
    execute format('drop policy %I on public.activities', existing_policy.policyname);
  end loop;
end
$$;

create policy "activities_admin_read_all"
  on public.activities
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'admin'
    )
  );

create policy "activities_users_insert_own"
  on public.activities
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = lower(activities.role)
    )
  );

create policy "activities_admin_delete_all"
  on public.activities
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'admin'
    )
  );
