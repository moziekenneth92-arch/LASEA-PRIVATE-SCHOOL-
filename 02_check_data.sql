-- 02_check_data.sql
-- Run AFTER 01_check_schema.sql shows no MISSING TABLE / MISSING COLUMN rows.
-- READ-ONLY. Lists records that will behave badly in the portal. No rows = nothing found.

select 'login email mismatch' as problem, p.user_code as item,
       'Auth email is ' || u.email || ' but the portal logs in as ' || lower(p.user_code) || '@school.local' as detail
from public.profiles p join auth.users u on u.id = p.id
where lower(u.email) <> lower(p.user_code) || '@school.local'
union all
select 'profile without login', p.user_code, 'no matching user under Authentication -> Users'
from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)
union all
select 'login without profile', u.email, 'this Auth user cannot enter the portal (no row in profiles)'
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
union all
select 'bad role or status', p.user_code, 'role=' || coalesce(p.role,'null') || ', status=' || coalesce(p.status,'null')
from public.profiles p
where lower(coalesce(p.role,'')) not in ('student','teacher','admin')
   or lower(coalesce(p.status,'')) not in ('active','inactive')
union all
select 'student without class', p.user_code, 'class_id is empty'
from public.profiles p where lower(p.role) = 'student' and p.class_id is null
union all
select 'student without session', p.user_code, 'session is empty'
from public.profiles p where lower(p.role) = 'student' and coalesce(trim(p.session),'') = ''
union all
select 'session not in academic_sessions', x.session, 'used by ' || x.n || ' record(s) but not listed in Admin -> Settings'
from (select session, count(*) n from (
        select session from public.profiles union all select session from public.academic_results) s
      where coalesce(trim(session),'') <> '' group by session) x
where not exists (select 1 from public.academic_sessions a where a.name = x.session)
union all
select 'score total mismatch', p.user_code || ' / ' || r.term || ' ' || r.session,
       'total=' || r.total || ' but ca1+ca2+exam=' || (coalesce(r.ca1,0) + coalesce(r.ca2,0) + coalesce(r.exam,0))
from public.academic_results r join public.profiles p on p.id = r.student_id
where r.total is distinct from coalesce(r.ca1,0) + coalesce(r.ca2,0) + coalesce(r.exam,0)
union all
select 'duplicate score', p.user_code || ' / ' || r.term || ' ' || r.session, count(*) || ' rows for the same subject'
from public.academic_results r join public.profiles p on p.id = r.student_id
group by p.user_code, r.term, r.session, r.subject_id having count(*) > 1
order by 1, 2;
