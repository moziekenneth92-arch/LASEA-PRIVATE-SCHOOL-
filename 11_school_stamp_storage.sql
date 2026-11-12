-- Store the school's report-card stamp/signature in Supabase Storage.
-- Run once in Supabase SQL Editor. Safe to re-run.
alter table public.settings
  add column if not exists school_stamp_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-assets',
  'school-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school_assets_public_read" on storage.objects;
create policy "school_assets_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'school-assets');

drop policy if exists "school_assets_admin_insert" on storage.objects;
create policy "school_assets_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and lower(role) = 'admin'
    )
  );

drop policy if exists "school_assets_admin_update" on storage.objects;
create policy "school_assets_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and lower(role) = 'admin'
    )
  )
  with check (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and lower(role) = 'admin'
    )
  );

drop policy if exists "school_assets_admin_delete" on storage.objects;
create policy "school_assets_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] = 'school'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and lower(role) = 'admin'
    )
  );
