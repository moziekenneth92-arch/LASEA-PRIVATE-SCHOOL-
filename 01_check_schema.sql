-- 01_check_schema.sql
-- Run in Supabase -> SQL Editor. READ-ONLY: it changes nothing and cannot fail on a missing table.
-- Result: one list. First row = SUMMARY. Problems come first, INFO rows (policies / foreign keys) last.
-- Statuses: MISSING TABLE | MISSING COLUMN | WRONG TYPE | GENERATED | NO DEFAULT | RLS OFF | NO POLICY | MISSING | WARN | INFO

with
expected(tbl, col, kind) as (values
  ('profiles','id','uuid'),('profiles','role','text'),('profiles','user_code','text'),('profiles','full_name','text'),
  ('profiles','status','text'),('profiles','class_id','id'),('profiles','session','text'),
  ('profiles','date_of_birth','date'),('profiles','photo_url','text'),
  ('classes','id','id'),('classes','name','text'),('classes','is_active','bool'),('classes','sort_order','int'),
  ('subjects','id','id'),('subjects','name','text'),('subjects','is_active','bool'),
  ('settings','id','id'),('settings','school_name','text'),('settings','school_stamp_path','text'),
  ('academic_sessions','id','id'),('academic_sessions','name','text'),('academic_sessions','is_current','bool'),('academic_sessions','created_at','ts'),
  ('teacher_classes','teacher_id','uuid'),('teacher_classes','class_id','id'),
  ('teacher_subjects','teacher_id','uuid'),('teacher_subjects','subject_id','id'),
  ('academic_results','id','id'),('academic_results','student_id','uuid'),('academic_results','subject_id','id'),
  ('academic_results','term','text'),('academic_results','session','text'),
  ('academic_results','ca1','num'),('academic_results','ca2','num'),('academic_results','exam','num'),
  ('academic_results','total','num'),('academic_results','grade','text'),
  ('academic_results','entered_by','uuid'),('academic_results','updated_at','ts'),
  ('report_details','id','id'),('report_details','student_id','uuid'),('report_details','term','text'),('report_details','session','text'),
  ('report_details','days_present','int'),('report_details','teacher_remark','text'),('report_details','head_remark','text'),
  ('report_details','affective','json'),('report_details','psychomotor','json'),
  ('class_term_info','id','id'),('class_term_info','class_id','id'),('class_term_info','term','text'),('class_term_info','session','text'),
  ('class_term_info','days_in_term','int'),('class_term_info','resumption_date','date'),('class_term_info','parents_note','text'),
  ('cbt_questions','id','id'),('cbt_questions','test_title','text'),('cbt_questions','subject_id','id'),('cbt_questions','class_id','id'),
  ('cbt_questions','question_text','text'),('cbt_questions','option_a','text'),('cbt_questions','option_b','text'),
  ('cbt_questions','option_c','text'),('cbt_questions','option_d','text'),('cbt_questions','correct_answer','text'),
  ('cbt_questions','created_by','uuid'),
  ('cbt_results','id','id'),('cbt_results','student_id','uuid'),('cbt_results','test_title','text'),('cbt_results','subject_id','id'),
  ('cbt_results','score','num'),('cbt_results','total_questions','num'),('cbt_results','percentage','num'),
  ('cbt_results','time_used_seconds','num'),('cbt_results','taken_at','ts'),('cbt_results','question_review','json'),
  ('activities','id','id'),('activities','user_id','uuid'),('activities','role','text'),('activities','activity','text'),('activities','created_at','ts'),('activities','actor_name','text'),
  ('portal_notifications','id','id'),('portal_notifications','recipient_id','uuid'),('portal_notifications','recipient_class_id','id'),
  ('portal_notifications','actor_id','uuid'),('portal_notifications','actor_name','text'),('portal_notifications','event_type','text'),
  ('portal_notifications','message','text'),('portal_notifications','event_key','text'),('portal_notifications','action_url','text'),('portal_notifications','created_at','ts'),('portal_notifications','read_at','ts')
),
cols as (
  select table_name as tbl, column_name as col, is_generated, column_default, is_identity, data_type,
    case when data_type = 'uuid' then 'uuid'
         when data_type in ('text','character varying','character') then 'text'
         when data_type = 'boolean' then 'bool'
         when data_type in ('smallint','integer','bigint') then 'int'
         when data_type in ('numeric','real','double precision') then 'num'
         when data_type in ('json','jsonb') then 'json'
         when data_type like 'timestamp%' then 'ts'
         when data_type = 'date' then 'date'
         else data_type end as kind
  from information_schema.columns where table_schema = 'public'
),
checked as (
  select e.tbl, e.col, e.kind as want, c.data_type as have,
    case
      when not exists (select 1 from information_schema.tables t where t.table_schema='public' and t.table_name = e.tbl) then 'MISSING TABLE'
      when c.col is null then 'MISSING COLUMN'
      when not (e.kind = c.kind
             or (e.kind = 'id'   and c.kind in ('uuid','int'))
             or (e.kind = 'num'  and c.kind in ('int','num'))
             or (e.kind = 'date' and c.kind in ('date','text','ts'))) then 'WRONG TYPE'
      when c.is_generated = 'ALWAYS' then 'GENERATED'
      else 'OK' end as status
  from expected e left join cols c on c.tbl = e.tbl and c.col = e.col
),
need_default(tbl, col) as (values
  ('classes','id'),('subjects','id'),('settings','id'),('academic_sessions','id'),('academic_sessions','created_at'),
  ('academic_results','id'),('report_details','id'),('class_term_info','id'),
  ('cbt_questions','id'),('cbt_results','id'),('activities','id'),('activities','created_at'),
  ('portal_notifications','id'),('portal_notifications','created_at')
),
uniq as (
  select c.relname::text as tbl, array_agg(a.attname::text order by a.attname::text collate "C") as cols
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
  where c.relnamespace = 'public'::regnamespace and i.indisunique
  group by c.relname, i.indexrelid
),
want_unique(tbl, cols, why) as (values
  ('profiles',          array['user_code'],                                  'two people could get the same ID'),
  ('classes',           array['name'],                                       'duplicate class names'),
  ('subjects',          array['name'],                                       'duplicate subject names'),
  ('academic_sessions', array['name'],                                       'duplicate sessions'),
  ('academic_results',  array['session','student_id','subject_id','term'],   'a second device can insert the same score twice'),
  ('report_details',    array['session','student_id','term'],                'duplicate report sheets'),
  ('class_term_info',   array['class_id','session','term'],                  'duplicate term info'),
  ('portal_notifications', array['event_key'],                              'duplicate notification events')
),
portal_tables(tbl) as (values
  ('profiles'),('classes'),('subjects'),('settings'),('academic_sessions'),('teacher_classes'),('teacher_subjects'),
  ('academic_results'),('report_details'),('class_term_info'),('cbt_questions'),('cbt_results'),('activities'),('portal_notifications')
),
findings as (
  -- 1. tables / columns / types
  select 1 as sort, 'columns' as section, tbl || '.' || col as item, status,
         case status when 'MISSING TABLE'  then 'table public.' || tbl || ' does not exist'
                     when 'MISSING COLUMN' then 'the portal reads/writes this column'
                     when 'WRONG TYPE'     then 'portal expects ' || want || ', database has ' || have
                     when 'GENERATED'      then 'the portal inserts a value here; a generated column rejects it' end as detail
  from checked where status <> 'OK'

  union all
  -- 2. defaults the portal relies on when it inserts rows
  select 2, 'defaults', n.tbl || '.' || n.col, 'NO DEFAULT', 'portal inserts without this value; it needs a default (e.g. gen_random_uuid() / now())'
  from need_default n join cols c on c.tbl = n.tbl and c.col = n.col
  where c.column_default is null and coalesce(c.is_identity,'NO') <> 'YES'

  union all
  -- 3. unique keys
  select 3, 'unique keys', w.tbl || '(' || array_to_string(w.cols, ', ') || ')', 'WARN', 'no unique constraint: ' || w.why
  from want_unique w
  where exists (select 1 from information_schema.tables t where t.table_schema='public' and t.table_name = w.tbl)
    and not exists (select 1 from uniq u where u.tbl = w.tbl and u.cols = w.cols)

  union all
  -- 4. row level security
  select 4, 'row level security', p.tbl, 'RLS OFF', 'anyone holding the public anon key can read/write this table'
  from portal_tables p join pg_class c on c.relname = p.tbl and c.relnamespace = 'public'::regnamespace
  where not c.relrowsecurity
  union all
  select 4, 'row level security', p.tbl, 'NO POLICY', 'RLS is on but there are no policies, so every request is blocked'
  from portal_tables p join pg_class c on c.relname = p.tbl and c.relnamespace = 'public'::regnamespace
  where c.relrowsecurity and not exists (select 1 from pg_policies pp where pp.schemaname='public' and pp.tablename = p.tbl)
  union all
  select 4, 'row level security', 'profiles', 'MISSING ADMIN READ POLICY',
         'run sql/06_admin_read_profiles.sql so admins can load the full student and teacher directory'
  from pg_class c
  where c.relname = 'profiles' and c.relnamespace = 'public'::regnamespace and c.relrowsecurity
    and not exists (
      select 1 from pg_policies pp
      where pp.schemaname = 'public' and pp.tablename = 'profiles' and pp.policyname = 'profiles_admin_read_all'
    )

  union all
  -- 5. photo storage
  select 5, 'storage', 'bucket "photos"', 'MISSING', 'profile photos cannot be uploaded'
  where not exists (select 1 from storage.buckets where id = 'photos')
  union all
  select 5, 'storage', 'bucket "photos"', 'WARN', 'bucket is not public; the portal uses public photo URLs'
  where exists (select 1 from storage.buckets where id = 'photos' and not public)
  union all
  select 5, 'storage', 'bucket "school-assets"', 'MISSING', 'school stamps/signatures cannot be uploaded'
  where not exists (select 1 from storage.buckets where id = 'school-assets')

  union all
  -- 8. foreign keys (information)
  select 8, 'foreign key', k.conrelid::regclass::text || '.' || a.attname || ' -> ' || k.confrelid::regclass::text, 'INFO',
         case k.confdeltype when 'c' then 'ON DELETE CASCADE' when 'n' then 'ON DELETE SET NULL'
                            when 'a' then 'ON DELETE NO ACTION' when 'r' then 'ON DELETE RESTRICT' else 'ON DELETE ' || k.confdeltype::text end
  from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.contype = 'f' and k.connamespace = 'public'::regnamespace

  union all
  -- 9. policies (information)
  select 9, 'policy', tablename || ' / ' || policyname, 'INFO',
         cmd || ' for ' || roles::text || ' | using: ' || coalesce(qual,'-') || ' | check: ' || coalesce(with_check,'-')
  from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
)
select * from (
  select 0 as sort, 'SUMMARY' as section, '' as item,
         case when count(*) filter (where status <> 'INFO') = 0 then 'ALL GOOD' else 'ACTION NEEDED' end as status,
         (count(*) filter (where status <> 'INFO'))::text || ' problem(s) found' as detail
  from findings
  union all
  select sort, section, item, status, detail from findings
) r
order by sort, section, item;
