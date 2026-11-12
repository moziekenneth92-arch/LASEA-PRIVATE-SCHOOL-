-- Store per-student notifications for published CBT tests, academic results,
-- and CBT results. Run once in Supabase -> SQL Editor; safe to re-run.
create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_class_id uuid not null references public.classes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  event_type text not null check (event_type in ('academic_result', 'cbt_published', 'cbt_result_ready')),
  message text not null,
  event_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists portal_notifications_recipient_created_idx
  on public.portal_notifications (recipient_id, created_at);

alter table public.portal_notifications enable row level security;

drop policy if exists "portal_notifications_recipient_read" on public.portal_notifications;
create policy "portal_notifications_recipient_read"
  on public.portal_notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "portal_notifications_admin_read" on public.portal_notifications;
create policy "portal_notifications_admin_read"
  on public.portal_notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile_admin
      where profile_admin.id = auth.uid() and lower(profile_admin.role) = 'admin'
    )
  );

create or replace function public.can_send_portal_notification(
  p_recipient_id uuid,
  p_recipient_class_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_event_type text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.id = p_actor_id
      and actor.full_name = p_actor_name
      and (
        (
          lower(actor.role) = 'teacher'
          and p_event_type in ('academic_result', 'cbt_published')
          and exists (
            select 1
            from public.profiles student
            join public.teacher_classes assignment on assignment.class_id = student.class_id
            where student.id = p_recipient_id
              and lower(student.role) = 'student'
              and student.class_id = p_recipient_class_id
              and assignment.teacher_id = auth.uid()
          )
        )
        or (
          lower(actor.role) = 'student'
          and p_event_type = 'cbt_result_ready'
          and p_recipient_id = auth.uid()
          and exists (
            select 1
            from public.profiles student
            where student.id = auth.uid()
              and lower(student.role) = 'student'
              and student.class_id = p_recipient_class_id
          )
        )
      )
  );
$$;

revoke all on function public.can_send_portal_notification(uuid, uuid, uuid, text, text) from public;
grant execute on function public.can_send_portal_notification(uuid, uuid, uuid, text, text) to authenticated;

drop policy if exists "portal_notifications_teacher_or_student_insert" on public.portal_notifications;
create policy "portal_notifications_teacher_or_student_insert"
  on public.portal_notifications
  for insert
  to authenticated
  with check (
    public.can_send_portal_notification(
      recipient_id, recipient_class_id, actor_id, actor_name, event_type
    )
  );

drop policy if exists "portal_notifications_recipient_update" on public.portal_notifications;
create policy "portal_notifications_recipient_update"
  on public.portal_notifications
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists "portal_notifications_admin_delete" on public.portal_notifications;
create policy "portal_notifications_admin_delete"
  on public.portal_notifications
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile_admin
      where profile_admin.id = auth.uid() and lower(profile_admin.role) = 'admin'
    )
  );
