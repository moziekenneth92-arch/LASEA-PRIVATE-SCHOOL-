-- Persist each student's CBT answers for post-test review, and attach a Take CBT
-- action to published-test notifications. Run once in Supabase SQL Editor.
alter table public.cbt_results
  add column if not exists question_review jsonb not null default '[]'::jsonb;

alter table public.portal_notifications
  add column if not exists action_url text;

insert into public.activities (user_id, role, activity, actor_name, created_at)
select distinct on (result.student_id, coalesce(nullif(trim(result.test_title), ''), 'CBT'))
  result.student_id,
  'Student',
  'Completed ' || coalesce(nullif(trim(result.test_title), ''), 'CBT'),
  student.full_name,
  coalesce(result.taken_at, now())
from public.cbt_results result
join public.profiles student on student.id = result.student_id
where not exists (
  select 1
  from public.activities activity
  where activity.user_id = result.student_id
    and activity.role = 'Student'
    and activity.activity = 'Completed ' || coalesce(nullif(trim(result.test_title), ''), 'CBT')
)
order by result.student_id, coalesce(nullif(trim(result.test_title), ''), 'CBT'), result.taken_at;
