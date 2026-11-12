-- 07_enforce_academic_score_totals.sql
-- Run in Supabase -> SQL Editor after the academic_results table is present.
-- Existing scores are capped to the portal's limits and rounded to two decimal places:
-- CA1 <= 20, CA2 <= 20, Exam <= 60.
-- The total is converted to a trigger-maintained column and is always CA1 + CA2 + Exam.

begin;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.academic_results'::regclass
      and attname = 'total'
      and attgenerated = 's'
  ) then
    alter table public.academic_results alter column total drop expression;
  end if;
end;
$$;

update public.academic_results
set ca1 = round(least(greatest(coalesce(ca1, 0), 0), 20), 2),
    ca2 = round(least(greatest(coalesce(ca2, 0), 0), 20), 2),
    exam = round(least(greatest(coalesce(exam, 0), 0), 60), 2);

update public.academic_results
set total = ca1 + ca2 + exam;

alter table public.academic_results
  alter column ca1 set not null,
  alter column ca2 set not null,
  alter column exam set not null,
  alter column total set not null;

alter table public.academic_results
  drop constraint if exists academic_results_ca1_range_check,
  drop constraint if exists academic_results_ca2_range_check,
  drop constraint if exists academic_results_exam_range_check,
  drop constraint if exists academic_results_total_range_check,
  drop constraint if exists academic_results_total_matches_scores_check;

alter table public.academic_results
  add constraint academic_results_ca1_range_check check (ca1 between 0 and 20 and ca1 = round(ca1, 2)),
  add constraint academic_results_ca2_range_check check (ca2 between 0 and 20 and ca2 = round(ca2, 2)),
  add constraint academic_results_exam_range_check check (exam between 0 and 60 and exam = round(exam, 2)),
  add constraint academic_results_total_range_check check (total between 0 and 100),
  add constraint academic_results_total_matches_scores_check check (total = ca1 + ca2 + exam);

create or replace function public.set_academic_result_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.total := new.ca1 + new.ca2 + new.exam;
  return new;
end;
$$;

drop trigger if exists set_academic_result_total on public.academic_results;
create trigger set_academic_result_total
  before insert or update of ca1, ca2, exam on public.academic_results
  for each row execute function public.set_academic_result_total();

commit;
