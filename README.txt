FILE LAYOUT (flat)
------------------
Every web page and asset sits in the project root, so nothing depends on sub-folders.
Pages are prefixed by role: student-*.html, teacher-*.html, admin-*.html.
Entry pages: index.html (home) and login.html (role picker).
Assets in root: style.css, app.js, supabase-config.js, supabase-sync.js, logo.svg, logo-white.svg.
sql/ and supabase-function/ are setup files for Supabase only; the website does not load them.

SCHOOL PORTAL - SUPABASE SETUP
==============================

Browser configuration
---------------------
supabase-config.js contains the Supabase Project URL and matching anon /
publishable key. These are the only Supabase values needed in the browser.
Never put a service_role/secret key, database password, or database port in
browser code.
Academic report PDFs download directly as one-page, portrait A4 files without
opening the browser print dialog. This uses html2canvas and jsPDF from jsDelivr.
Administrators can upload a PNG, JPG, or WebP school stamp/signature in Settings;
run sql/11_school_stamp_storage.sql to save it in Supabase Storage for report cards.
Run sql/12_cbt_review_and_notification_links.sql to add direct CBT notification
links and persist the student's missed-question review on CBT results.

ID and password login
---------------------
The portal converts a user ID to an Auth email using EMAIL_DOMAIN:
  ADMIN101 -> admin101@school.local
  STU001   -> stu001@school.local

Each ID must have a matching Supabase Auth user with that email and a password,
plus a matching row in public.profiles.
Passwords are managed by Supabase Auth and must not be added to public.profiles
as plain text. If login reports invalid credentials, verify the mapped email
under Authentication -> Users and reset that user's password in the Dashboard.

Supabase setup
--------------33
1. Open Supabase -> SQL Editor and run, in this order:
     sql/00_add_academic_sessions.sql  (once - creates the sessions table)
     sql/06_admin_read_profiles.sql    (once - lets admins load the full student/teacher directory)
     sql/08_admin_only_activity_monitoring.sql (once - restricts activity history to admins)
     sql/09_student_notifications.sql (once - stores student score/CBT notifications)
     sql/10_admin_only_profile_edits.sql (once - makes all profile edits admin-only)
     sql/11_school_stamp_storage.sql (once - enables school report-card stamp/signature uploads)
     sql/12_cbt_review_and_notification_links.sql (once - enables CBT review and notification links)
     sql/01_check_schema.sql           (read-only preflight - confirm the academic_results table exists)
     sql/07_enforce_academic_score_totals.sql (once - caps historical scores and enforces totals out of 100)
     sql/01_check_schema.sql           (read-only verification - rerun after 07)
     sql/02_check_data.sql             (read-only - run after 01 reports ALL GOOD)
   Then add your sessions in Admin -> Settings -> Academic Sessions.
2. Deploy supabase-function/manage-users.ts as an Edge Function named exactly
   manage-users. The function uses Supabase server environment secrets; never
   expose the service-role key in browser code.
3. Sign in at admin-login.html with ADMIN101 and its Supabase Auth password.

If login fails, check the Supabase Auth user email and the Response body of the
failed token request in browser Developer Tools. Never share passwords or
secret/service-role keys.
