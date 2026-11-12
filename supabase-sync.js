/* =====================================================================
   supabase-sync.js
   Connects the portal (app.js) to Supabase.

   How it works
   - On every page load, boot() signs the user in (from the saved session),
     downloads the data that this user is allowed to see and stores it in the
     same shape app.js already uses (localStorage "schoolPortalData").
   - Whenever app.js calls saveData(), queuePush() compares the new data with
     what is on the server and sends only the differences to Supabase.
   - Creating or deleting student/teacher accounts goes through the
     "manage-users" Edge Function (the browser is not allowed to do that itself).

   Load order on every page:  supabase-js CDN -> supabase-config.js -> supabase-sync.js -> app.js
   ===================================================================== */
(function () {
  'use strict';

  const CACHE_KEY = 'schoolPortalData';
  const SESSION_KEY = 'schoolPortalSession';
  const PHOTO_BUCKET = 'photos';
  const SCHOOL_ASSET_BUCKET = 'school-assets';
  const PAGE_SIZE = 1000;
  const PORTAL_LOGO_URL = new URL('logo.svg', document.currentScript.src).href;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let ctx = null;        // lookups built at boot (classes, subjects, people)
  let snapshot = null;   // what the server currently holds, in app.js shape
  let me = null;         // the signed-in profile row
  let dirty = false;
  let running = false;
  let pushErrors = [];
  let loadingTimer = null;

  /* ---------------------------------------------------------------- helpers */
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const ckey = (name) => String(name || '').replace(/\s+/g, '').toLowerCase();
  const lower = (value) => String(value || '').trim().toLowerCase();
  const norm = (name) => (typeof normalizeClassName === 'function' ? normalizeClassName(name) : String(name || '').trim());
  const toEmail = (code) => lower(code) + '@' + EMAIL_DOMAIN;
  const loginEmail = (identifier) => {
    const value = lower(identifier);
    return value.includes('@') ? value : toEmail(value);
  };
  const isInactive = (status) => lower(status) === 'inactive';
  const capStatus = (status) => (isInactive(status) ? 'Inactive' : 'Active');
  const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));
  const intOrNull = (value) => (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value)));
  const dateOrNull = (value) => (value ? String(value) : null);
  const testIdOf = (className, subject, title) => [norm(className), subject, title].map((v) => String(v || '').trim().toLowerCase()).join('::');
  const sigQuestion = (q) => [q.testTitle, q.subject, q.className, q.question, (q.options || []).join('~'), q.answer].join('|');
  const sigActivity = (a) => [a.user, a.role, a.activity].join('|');
  const sameList = (a, b) => JSON.stringify([...new Set(a.map(lower))].sort()) === JSON.stringify([...new Set(b.map(lower))].sort());
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString() : '');
  const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  function toast(message) {
    if (typeof showErrorModal === 'function') showErrorModal(message);
    else console.warn(message);
  }
  // Direct, one-off activity entry (used for login and logout, which happen outside saveData()).
  async function writeActivity(userId, role, activity, name) {
    try {
      const label = String(role || '').charAt(0).toUpperCase() + String(role || '').slice(1).toLowerCase();
      const { error } = await sb.from('activities').insert({ user_id: userId, role: label, activity, actor_name: name || null });
      if (error) {
        console.warn('Could not record activity:', error.message);
        toast('Not saved in database: Could not record activity. ' + error.message);
      }
    } catch (e) {
      console.warn('Could not record activity:', e.message);
      toast('Not saved in database: Could not record activity. ' + e.message);
    }
  }
  async function setUserPassword(userId, password) {
    const { error } = await sb.functions.invoke('manage-users', {
      body: { action: 'set_password', user_id: userId, password }
    });
    if (error) throw new Error(await functionError(error));
  }

  function connectionErrorMessage(error) {
    const details = String(error && error.message || '').trim();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return `No internet connection. Check your connection and try again.${details ? ` Details: ${details}` : ''}`;
    }
    const name = String(error && error.name || '').toLowerCase();
    const message = details.toLowerCase();
    if (name.includes('retryablefetch')
      || /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed out|timeout/.test(message)) {
      return `Cannot connect to Supabase. ${details || 'The network request failed.'}`;
    }
    if (Number(error && error.status) >= 500) {
      return `Supabase returned HTTP ${error.status}.${details ? ` Details: ${details}` : ''}`;
    }
    return '';
  }

  function showLoading() {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('pagePreloader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pagePreloader';
      el.className = 'page-preloader';
      el.innerHTML = `<img class="page-preloader-logo" src="${PORTAL_LOGO_URL}" alt="" /><span>Loading...</span>`;
      document.body.appendChild(el);
    }
    el.classList.add('is-visible');
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) hideLoading();
    }, 3000);
  }
  function hideLoading() {
    if (typeof document === 'undefined') return;
    clearTimeout(loadingTimer);
    loadingTimer = null;
    const el = document.getElementById('pagePreloader');
    if (el) el.classList.remove('is-visible');
  }

  function clearLocal() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(SESSION_KEY);
    Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach((k) => localStorage.removeItem(k));
  }

  async function fetchAll(table, select, orderCol) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await sb.from(table).select(select || '*').order(orderCol || 'id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(table + ': ' + error.message);
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function functionError(error) {
    try {
      if (error && error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body && body.error) return body.error;
      }
    } catch (e) { /* ignore */ }
    return (error && error.message) || 'Request failed';
  }

  /* ------------------------------------------------------------ login/logout */
  async function login(role, id, password) {
    const code = String(id || '').trim().toUpperCase();
    const email = loginEmail(id);
    const secret = String(password || '');
    if (!code || !secret) {
      return { ok: false, message: 'Enter both your ID and password.' };
    }
    let data;
    let error;
    try {
      ({ data, error } = await sb.auth.signInWithPassword({
        email,
        password: secret
      }));
    } catch (requestError) {
      return {
        ok: false,
        message: connectionErrorMessage(requestError) || requestError.message || 'Could not connect to Supabase Auth.'
      };
    }
    if (error) {
      if (error.code === 'invalid_credentials' || lower(error.message) === 'invalid login credentials') {
        return {
          ok: false,
          message: 'Invalid ID/email or password. Please try again.'
        };
      }
      return { ok: false, message: connectionErrorMessage(error) || error.message };
    }
    const { data: profile, error: profileError } = await sb.from('profiles')
      .select('id, role, status, full_name, user_code')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError) {
      await sb.auth.signOut();
      clearLocal();
      return {
        ok: false,
        message: connectionErrorMessage(profileError) || `Could not load the account profile: ${profileError.message}`
      };
    }
    if (!profile || lower(profile.role) !== role) {
      await sb.auth.signOut();
      clearLocal();
      return { ok: false, message: 'This ID is not a ' + role + ' account.' };
    }
    if (isInactive(profile.status)) {
      await sb.auth.signOut();
      clearLocal();
      return { ok: false, message: 'This account is inactive. Please contact the school administrator.' };
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role, id: String(profile.user_code).toUpperCase() }));
    await writeActivity(data.user.id, role, 'Logged in', profile.full_name);
    return { ok: true, name: profile.full_name };
  }

  async function logout() {
    // Send anything still waiting plus a "Logged out" entry (at most 3 seconds), then sign out.
    const uid = me && me.id;
    const role = me && me.role;
    const name = me && me.full_name;
    if (uid) {
      await Promise.race([
        (async () => { await flush(); await writeActivity(uid, role, 'Logged out', name); })(),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]).catch(() => {});
    }
    const pending = sb.auth.signOut();
    clearLocal();
    snapshot = null;
    return pending.catch(() => {});
  }

  /* -------------------------------------------------------------------- boot */
  function goLogin(role) {
    const r = role || String(document.body.dataset.page || '').split('-')[0];
    window.location.href = /^(student|teacher|admin)$/.test(r) ? r + '-login.html' : 'index.html';
  }

  async function boot(page) {
    if (!/^(student|teacher|admin)-/.test(page || '')) return true;   // landing + login pages need no data
    const expectedRole = page.split('-')[0];
    showLoading();
    try {
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) { clearLocal(); goLogin(expectedRole); return false; }
      const uid = sessionData.session.user.id;

      const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (profileError) {
        toast('Database fetch failed. Profile data could not be loaded, and no data was saved to the database. ' + profileError.message);
        return false;
      }
      if (!profile) { await sb.auth.signOut(); clearLocal(); goLogin(expectedRole); return false; }
      if (isInactive(profile.status)) { await sb.auth.signOut(); clearLocal(); goLogin(expectedRole); return false; }
      if (lower(profile.role) !== expectedRole) {
        window.location.href = lower(profile.role) + '-dashboard.html';
        return false;
      }
      me = profile;

      const failures = [];
      const grab = async (name, promise) => {
        try { return await promise; } catch (e) { failures.push(e.message); return []; }
      };
      const raw = { me: profile };
      [raw.classes, raw.subjects, raw.settings, raw.profiles, raw.teacherClasses, raw.teacherSubjects,
        raw.results, raw.details, raw.terms, raw.questions, raw.cbt, raw.activities, raw.notifications, raw.sessionRows] = await Promise.all([
        grab('classes', fetchAll('classes', '*', 'id')),
        grab('subjects', fetchAll('subjects', '*', 'id')),
        grab('settings', fetchAll('settings', '*', 'id')),
        fetchAll('profiles', '*', 'id'),
        grab('teacher_classes', fetchAll('teacher_classes', '*', 'teacher_id')),
        grab('teacher_subjects', fetchAll('teacher_subjects', '*', 'teacher_id')),
        grab('academic_results', fetchAll('academic_results', '*', 'id')),
        grab('report_details', fetchAll('report_details', '*', 'id')),
        grab('class_term_info', fetchAll('class_term_info', '*', 'id')),
        grab('cbt_questions', fetchAll('cbt_questions', '*', 'id')),
        grab('cbt_results', fetchAll('cbt_results', '*', 'id')),
        grab('activities', (async () => {
          if (expectedRole !== 'admin') return [];
          const rows = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const query = sb.from('activities').select('*').order('created_at', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1);
            const { data, error } = await query;
            if (error) throw new Error('activities: ' + error.message);
            rows.push(...data);
            if (data.length < PAGE_SIZE) break;
          }
          return rows;
        })()),
        grab('portal_notifications', fetchAll('portal_notifications', '*', 'created_at')),
        grab('academic_sessions', fetchAll('academic_sessions', '*', 'id'))
      ]);

      const built = buildData(raw);
      ctx = built.ctx;
      localStorage.setItem(CACHE_KEY, JSON.stringify(built.data));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ role: expectedRole, id: String(profile.user_code).toUpperCase() }));
      snapshot = clone(built.data);
      if (failures.length) {
        toast('Database fetch failed. Some data could not be loaded, and no data was saved to the database. ' + failures.join('; '));
      }
      return true;
    } catch (error) {
      console.error(error);
      toast('Database fetch failed. Data could not be loaded, and no data was saved to the database. '
        + (connectionErrorMessage(error) || error.message));
      return false;
    } finally {
      hideLoading();
    }
  }

  // Called by app.js after it has normalised the cache, so later comparisons start from the same shape.
  function markReady() {
    try { snapshot = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { snapshot = null; }
  }

  /* ----------------------------------------------- server rows -> app.js shape */
  function buildData(raw) {
    const c = {
      classById: new Map(), classByKey: new Map(),
      subjectById: new Map(), subjectByKey: new Map(),
      profileById: new Map(), profileByCode: new Map(),
      sessionByKey: new Map(),
      settingsId: null,
      settingsStampPath: null
    };
    const sortedClasses = [...(raw.classes || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)));
    sortedClasses.forEach((row) => { c.classById.set(row.id, row); c.classByKey.set(ckey(row.name), row); });
    const sortedSubjects = [...(raw.subjects || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    sortedSubjects.forEach((row) => { c.subjectById.set(row.id, row); c.subjectByKey.set(lower(row.name), row); });
    (raw.profiles || []).forEach((row) => {
      c.profileById.set(row.id, row);
      c.profileByCode.set(String(row.user_code || '').toUpperCase(), row);
    });
    if (raw.settings && raw.settings[0]) {
      c.settingsId = raw.settings[0].id;
      c.settingsStampPath = raw.settings[0].school_stamp_path || null;
    }
    const sortedSessions = [...(raw.sessionRows || [])].sort((a, b) => String(b.name).localeCompare(String(a.name)));
    sortedSessions.forEach((row) => c.sessionByKey.set(lower(row.name), row));

    const className = (id) => { const row = c.classById.get(id); return row ? norm(row.name) : ''; };
    const subjectName = (id) => { const row = c.subjectById.get(id); return row ? row.name : ''; };
    const codeOf = (uid) => { const p = c.profileById.get(uid); return p ? String(p.user_code).toUpperCase() : ''; };
    const nameOf = (uid) => { const p = c.profileById.get(uid); return p ? p.full_name : ''; };

    const data = {
      students: [], teachers: [], admin: [],
      classes: [...new Set(sortedClasses.map((r) => norm(r.name)))],
      inactiveClasses: sortedClasses.filter((r) => r.is_active === false).map((r) => norm(r.name)),
      subjects: sortedSubjects.map((r) => r.name),
      inactiveSubjects: sortedSubjects.filter((r) => r.is_active === false).map((r) => r.name),
      settings: {
        schoolName: (raw.settings && raw.settings[0] && raw.settings[0].school_name) || '',
        stampDataUrl: c.settingsStampPath
          ? sb.storage.from(SCHOOL_ASSET_BUCKET).getPublicUrl(c.settingsStampPath).data.publicUrl + '?v=' + Date.now()
          : ''
      },
      sessions: sortedSessions.map((r) => r.name),
      currentSession: (sortedSessions.find((r) => r.is_current) || {}).name || '',
      academicResults: [], reportDetails: {}, reportMeta: {}, questions: [], cbtResults: [], activities: [], notifications: []
    };

    const classLinks = new Map();
    (raw.teacherClasses || []).forEach((r) => { if (!classLinks.has(r.teacher_id)) classLinks.set(r.teacher_id, []); classLinks.get(r.teacher_id).push(className(r.class_id)); });
    const subjectLinks = new Map();
    (raw.teacherSubjects || []).forEach((r) => { if (!subjectLinks.has(r.teacher_id)) subjectLinks.set(r.teacher_id, []); subjectLinks.get(r.teacher_id).push(subjectName(r.subject_id)); });

    (raw.profiles || []).forEach((p) => {
      const role = lower(p.role);
      const base = {
        id: String(p.user_code || '').toUpperCase(),
        name: p.full_name || '',
        status: capStatus(p.status),
        photoDataUrl: p.photo_url || '',
        dateOfBirth: p.date_of_birth || '',
        session: p.session || '',
        _uid: p.id
      };
      if (role === 'student') {
        data.students.push({ ...base, className: className(p.class_id) });
      } else if (role === 'teacher') {
        const classes = (classLinks.get(p.id) || []).filter(Boolean);
        const subjects = (subjectLinks.get(p.id) || []).filter(Boolean);
        data.teachers.push({ ...base, className: classes[0] || '', assignedClasses: classes, subject: subjects[0] || '', assignedSubjects: subjects });
      } else if (role === 'admin') {
        data.admin.push({ id: base.id, name: base.name, photoDataUrl: base.photoDataUrl, status: base.status, _uid: p.id });
      }
    });

    (raw.results || []).forEach((r) => {
      const student = c.profileById.get(r.student_id);
      const subject = subjectName(r.subject_id);
      if (!student || !subject) return;
      const ca1 = num(r.ca1); const ca2 = num(r.ca2);
      data.academicResults.push({
        studentId: codeOf(r.student_id), name: student.full_name, className: className(student.class_id),
        session: r.session, term: r.term, subject, ca1, ca2, ca: ca1 + ca2, exam: num(r.exam),
        total: num(r.total), grade: r.grade || '', _id: r.id
      });
    });

    (raw.details || []).forEach((r) => {
      const code = codeOf(r.student_id);
      if (!code) return;
      data.reportDetails[[code, r.term, r.session].join('|')] = {
        daysPresent: r.days_present === null || r.days_present === undefined ? '' : String(r.days_present),
        teacherRemark: r.teacher_remark || '', headRemark: r.head_remark || '',
        affective: r.affective || {}, psychomotor: r.psychomotor || {}, _id: r.id
      };
    });

    (raw.terms || []).forEach((r) => {
      const name = className(r.class_id);
      if (!name) return;
      data.reportMeta[[name, r.term, r.session].join('|')] = {
        daysInTerm: r.days_in_term === null || r.days_in_term === undefined ? '' : String(r.days_in_term),
        resumption: r.resumption_date || '', parentsNote: r.parents_note || '', _id: r.id
      };
    });

    (raw.questions || []).forEach((r) => {
      data.questions.push({
        testTitle: r.test_title || '', subject: subjectName(r.subject_id), className: className(r.class_id),
        question: r.question_text || '', options: [r.option_a || '', r.option_b || '', r.option_c || '', r.option_d || ''],
        answer: r.correct_answer || 'A', _id: r.id
      });
    });

    (raw.cbt || []).forEach((r) => {
      const student = c.profileById.get(r.student_id);
      if (!student) return;
      const subject = subjectName(r.subject_id);
      const cls = className(student.class_id);
      const total = Number(r.total_questions || 0);
      const score = num(r.score);
      const timeUsedSeconds = Number(r.time_used_seconds || 0);
      data.cbtResults.push({
        studentId: codeOf(r.student_id), student: student.full_name, className: cls,
        testId: testIdOf(cls, subject, r.test_title), testTitle: r.test_title || '', subject,
        score, total, percentage: num(r.percentage), correct: score, wrong: Math.max(total - score, 0),
        questionReview: Array.isArray(r.question_review) && r.question_review.length ? r.question_review : null,
        timeUsedSeconds, date: fmtDate(r.taken_at), takenAt: r.taken_at, _id: r.id
      });
    });

    (raw.activities || []).forEach((r) => {
      data.activities.push({
        user: nameOf(r.user_id) || r.actor_name || '', userId: codeOf(r.user_id), role: r.role || '', activity: r.activity || '',
        createdAt: r.created_at, date: fmtDate(r.created_at), time: fmtTime(r.created_at), _id: r.id
      });
    });
    data.cbtResults.forEach((result) => {
      const activity = `Completed ${result.testTitle || 'CBT'}`;
      const alreadyLogged = data.activities.some((entry) => entry.userId === result.studentId
        && entry.role.toLowerCase() === 'student' && entry.activity === activity);
      if (alreadyLogged) return;
      data.activities.push({
        user: result.student,
        userId: result.studentId,
        role: 'Student',
        activity,
        createdAt: result.takenAt,
        date: result.date,
        time: fmtTime(result.takenAt),
        isCbtCompletion: true
      });
    });

    (raw.notifications || []).forEach((r) => {
      data.notifications.push({
        recipientId: codeOf(r.recipient_id),
        className: className(r.recipient_class_id),
        eventType: r.event_type,
        message: r.message,
        actorName: r.actor_name || nameOf(r.actor_id) || 'School portal',
        eventKey: r.event_key,
        actionUrl: r.action_url || '',
        createdAt: r.created_at,
        readAt: r.read_at || '',
        _id: r.id
      });
    });

    return { data, ctx: c };
  }

  async function refreshNotifications() {
    if (!me || lower(me.role) !== 'student') return;
    const rows = await fetchAll('portal_notifications', '*', 'created_at');
    let cache;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (error) {
      throw new Error('Could not read the student data cache: ' + error.message);
    }
    if (!cache) return;
    const remote = rows.map((r) => ({
      recipientId: String(me.user_code || '').toUpperCase(),
      className: ctx ? norm(ctx.classById.get(r.recipient_class_id)?.name) : '',
      eventType: r.event_type,
      message: r.message,
      actorName: r.actor_name || 'School portal',
      eventKey: r.event_key,
      actionUrl: r.action_url || '',
      createdAt: r.created_at,
      readAt: r.read_at || '',
      _id: r.id
    }));
    const merged = new Map((cache.notifications || []).map((item) => [item.eventKey, item]));
    remote.forEach((item) => {
      const local = merged.get(item.eventKey);
      merged.set(item.eventKey, { ...local, ...item, readAt: item.readAt || local?.readAt || '' });
    });
    cache.notifications = [...merged.values()];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    if (snapshot) snapshot.notifications = clone(remote);
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('portal-notifications-updated'));
    }
  }

  /* ------------------------------------------------------------ saving (push) */
  function queuePush() {
    pushErrors = [];
    dirty = true;
    if (!running) runPush();
  }

  async function runPush() {
    running = true;
    try {
      while (dirty) {
        dirty = false;
        if (!snapshot || !ctx) break;
        let next;
        try { next = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { break; }
        if (!next) break;
        const result = await pushChanges(snapshot, next);
        pushErrors = result.errors;
        patchCache(result.patch);
        if (result.errors.length) {
          console.error('Save problems:', result.errors);
          toast('Not saved in database: ' + result.errors[0]);
        } else {
          if (typeof showSavedNotification === 'function') showSavedNotification('Saved in database.');
          else console.info('Saved in database.');
        }
      }
    } catch (error) {
      console.error(error);
      toast('Not saved in database: ' + error.message);
    } finally {
      running = false;
    }
  }

  // Waits until everything queued has been sent (used before leaving a page).
  async function flush() {
    while (running || dirty) await new Promise((resolve) => setTimeout(resolve, 50));
    return pushErrors.slice();
  }

  function patchCache(patch) {
    let cache;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return; }
    if (!cache) return;
    const fix = (list) => (list || []).forEach((item) => {
      if (patch.uids[item.id]) item._uid = patch.uids[item.id];
      if (patch.photos[item.id] && String(item.photoDataUrl || '').startsWith('data:')) item.photoDataUrl = patch.photos[item.id];
      if (patch.stripPassword.has(item.id)) delete item.password;
    });
    fix(cache.students); fix(cache.teachers); fix(cache.admin);
    const assign = (list, pool, sig) => (list || []).forEach((item) => {
      if (item._id) return;
      const at = pool.findIndex((entry) => entry.sig === sig(item));
      if (at >= 0) item._id = pool.splice(at, 1)[0].id;
    });
    assign(cache.questions, patch.questionIds, sigQuestion);
    assign(cache.activities, patch.activityIds, sigActivity);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    // `snapshot` was already updated in place by pushChanges, one successful step at a time.
  }

  const resultKey = (r) => [r.studentId, r.term, r.session, r.subject].join('|');
  const cbtKey = (r) => [r.studentId, r.testId].join('|');

  async function must(promise, label) {
    const { data, error } = await promise;
    if (error) throw new Error(label + ': ' + error.message);
    return data;
  }

  const classId = (name) => { const row = ctx.classByKey.get(ckey(name)); return row ? row.id : null; };
  const subjectId = (name) => { const row = ctx.subjectByKey.get(lower(name)); return row ? row.id : null; };
  const uidOf = (code) => { const row = ctx.profileByCode.get(String(code || '').toUpperCase()); return row ? row.id : null; };

  async function uploadPhoto(uid, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = uid + '/avatar.jpg';
    await must(sb.storage.from(PHOTO_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' }), 'photo upload');
    const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return data.publicUrl + '?v=' + Date.now();
  }

  async function uploadSchoolStamp(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error('Choose a PNG, JPG, or WebP stamp/signature image smaller than 5 MB.');
    }
    const path = 'school/report-stamp';
    await must(sb.storage.from(SCHOOL_ASSET_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '0'
    }), 'upload school stamp/signature');
    const { data } = sb.storage.from(SCHOOL_ASSET_BUCKET).getPublicUrl(path);
    return data.publicUrl + '?v=' + Date.now();
  }

  async function saveSchoolStamp(file) {
    if (!me || lower(me.role) !== 'admin') throw new Error('Only an administrator can save the school stamp/signature.');
    const pendingErrors = await flush();
    if (pendingErrors.length) throw new Error(pendingErrors[0]);

    const path = file ? 'school/report-stamp' : null;
    const url = file ? await uploadSchoolStamp(file) : '';
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cache) throw new Error('The school data cache is unavailable. Refresh and try again.');
    const schoolName = (cache.settings && cache.settings.schoolName) || '';
    if (ctx.settingsId) {
      await must(sb.from('settings').update({ school_stamp_path: path }).eq('id', ctx.settingsId), 'save school stamp/signature');
    } else {
      const rows = await must(sb.from('settings').insert({
        school_name: schoolName,
        school_stamp_path: path
      }).select('id'), 'save school stamp/signature');
      ctx.settingsId = rows[0].id;
    }

    ctx.settingsStampPath = path;
    cache.settings = { ...(cache.settings || {}), stampDataUrl: url };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    if (snapshot) snapshot.settings = { ...(snapshot.settings || {}), schoolName, stampDataUrl: url };
    return url;
  }

  // Compares `next` (what the page now holds) with `snap` (what the server holds) and sends the differences.
  // `snap` is updated step by step as each change succeeds, so a failed step is simply retried on the next save.
  async function pushChanges(snap, next) {
    const errors = [];
    const patch = { uids: {}, photos: {}, stripPassword: new Set(), questionIds: [], activityIds: [] };
    const step = async (label, fn) => { try { await fn(); } catch (e) { errors.push(label + ' - ' + e.message); } };
    const inactiveSet = (list) => new Set((list || []).map((n) => ckey(n)));
    const isAdmin = lower(me && me.role) === 'admin';

    /* 1. classes, subjects and settings that were added or switched on/off */
    await step('classes', async () => {
      const nextInactive = inactiveSet(next.inactiveClasses);
      const snapKeys = new Set((snap.classes || []).map(ckey));
      const snapInactive = inactiveSet(snap.inactiveClasses);
      for (const name of next.classes || []) {
        const key = ckey(name);
        if (!snapKeys.has(key)) {
          const order = typeof STANDARD_CLASSES !== 'undefined' && STANDARD_CLASSES.indexOf(name) >= 0 ? STANDARD_CLASSES.indexOf(name) : 100 + ctx.classById.size;
          const rows = await must(sb.from('classes').insert({ name, is_active: !nextInactive.has(key), sort_order: order }).select(), 'add class');
          ctx.classById.set(rows[0].id, rows[0]); ctx.classByKey.set(key, rows[0]);
          snap.classes.push(name);
          if (nextInactive.has(key)) snap.inactiveClasses.push(name);
        } else if (nextInactive.has(key) !== snapInactive.has(key)) {
          const row = ctx.classByKey.get(key);
          if (row) {
            await must(sb.from('classes').update({ is_active: !nextInactive.has(key) }).eq('id', row.id), 'update class');
            row.is_active = !nextInactive.has(key);
            snap.inactiveClasses = (next.inactiveClasses || []).slice();
          }
        }
      }
    });

    await step('subjects', async () => {
      const nextInactive = inactiveSet(next.inactiveSubjects);
      const snapKeys = new Set((snap.subjects || []).map(lower));
      const snapInactive = inactiveSet(snap.inactiveSubjects);
      for (const name of next.subjects || []) {
        const key = lower(name);
        if (!snapKeys.has(key)) {
          const rows = await must(sb.from('subjects').insert({ name, is_active: !nextInactive.has(ckey(name)) }).select(), 'add subject');
          ctx.subjectById.set(rows[0].id, rows[0]); ctx.subjectByKey.set(key, rows[0]);
          snap.subjects.push(name);
          if (nextInactive.has(ckey(name))) snap.inactiveSubjects.push(name);
        } else if (nextInactive.has(ckey(name)) !== snapInactive.has(ckey(name))) {
          const row = ctx.subjectByKey.get(key);
          if (row) {
            await must(sb.from('subjects').update({ is_active: !nextInactive.has(ckey(name)) }).eq('id', row.id), 'update subject');
            row.is_active = !nextInactive.has(ckey(name));
            snap.inactiveSubjects = (next.inactiveSubjects || []).slice();
          }
        }
      }
    });

    await step('settings', async () => {
      if (!isAdmin) return;
      const name = (next.settings && next.settings.schoolName) || '';
      const oldName = (snap.settings && snap.settings.schoolName) || '';
      const nameChanged = name !== oldName;
      if (!nameChanged) return;
      if (ctx.settingsId) {
        await must(sb.from('settings').update({ school_name: name }).eq('id', ctx.settingsId), 'save school name');
      } else {
        const rows = await must(sb.from('settings').insert({
          school_name: name
        }).select(), 'save school name');
        ctx.settingsId = rows[0].id;
      }
      snap.settings = { ...(snap.settings || {}), schoolName: name };
    });

    await step('sessions', async () => {
      if (!isAdmin) return;
      const has = (list, name) => (list || []).some((item) => lower(item) === lower(name));
      snap.sessions = snap.sessions || [];
      for (const name of next.sessions || []) {
        if (has(snap.sessions, name)) continue;
        const rows = await must(sb.from('academic_sessions').insert({ name, is_current: false }).select(), 'add session');
        ctx.sessionByKey.set(lower(name), rows[0]);
        snap.sessions.push(name);
      }
      const wanted = String(next.currentSession || '');
      if (lower(wanted) !== lower(snap.currentSession || '')) {
        await must(sb.from('academic_sessions').update({ is_current: false }).eq('is_current', true), 'clear current session');
        const row = wanted ? ctx.sessionByKey.get(lower(wanted)) : null;
        if (row) await must(sb.from('academic_sessions').update({ is_current: true }).eq('id', row.id), 'set current session');
        snap.currentSession = row ? wanted : '';
      }
      for (const name of [...snap.sessions]) {
        if (has(next.sessions, name)) continue;
        const row = ctx.sessionByKey.get(lower(name));
        if (row) {
          await must(sb.from('academic_sessions').delete().eq('id', row.id), 'delete session');
          ctx.sessionByKey.delete(lower(name));
        }
        snap.sessions = snap.sessions.filter((item) => lower(item) !== lower(name));
      }
    });

    /* 2. deletions that depend on people (results, CBT, report sheets, questions, activity) */
    await step('delete results', async () => {
      const nextKeys = new Set((next.academicResults || []).map(resultKey));
      const gone = (snap.academicResults || []).filter((r) => !nextKeys.has(resultKey(r)) && r._id);
      for (let i = 0; i < gone.length; i += 100) {
        const ids = gone.slice(i, i + 100).map((r) => r._id);
        await must(sb.from('academic_results').delete().in('id', ids), 'delete results');
        snap.academicResults = snap.academicResults.filter((r) => !ids.includes(r._id));
      }
    });
    await step('delete CBT results', async () => {
      const nextKeys = new Set((next.cbtResults || []).map(cbtKey));
      const gone = (snap.cbtResults || []).filter((r) => !nextKeys.has(cbtKey(r)) && r._id);
      for (let i = 0; i < gone.length; i += 100) {
        const ids = gone.slice(i, i + 100).map((r) => r._id);
        await must(sb.from('cbt_results').delete().in('id', ids), 'delete CBT results');
        snap.cbtResults = snap.cbtResults.filter((r) => !ids.includes(r._id));
      }
    });
    await step('delete report details', async () => {
      for (const key of Object.keys(snap.reportDetails || {})) {
        if (!(next.reportDetails || {})[key] && snap.reportDetails[key]._id) {
          await must(sb.from('report_details').delete().eq('id', snap.reportDetails[key]._id), 'delete report details');
          delete snap.reportDetails[key];
        }
      }
      for (const key of Object.keys(snap.reportMeta || {})) {
        if (!(next.reportMeta || {})[key] && snap.reportMeta[key]._id) {
          await must(sb.from('class_term_info').delete().eq('id', snap.reportMeta[key]._id), 'delete term info');
          delete snap.reportMeta[key];
        }
      }
    });
    await step('delete questions', async () => {
      const keep = new Set((next.questions || []).map((q) => q._id).filter(Boolean));
      const gone = (snap.questions || []).filter((q) => q._id && !keep.has(q._id));
      for (let i = 0; i < gone.length; i += 100) {
        const ids = gone.slice(i, i + 100).map((q) => q._id);
        await must(sb.from('cbt_questions').delete().in('id', ids), 'delete questions');
        snap.questions = snap.questions.filter((q) => !ids.includes(q._id));
      }
    });
    await step('delete activities', async () => {
      // History is only removed by "Erase data" (the whole list cleared), and only by an admin.
      if (!isAdmin || (next.activities || []).length) return;
      const keep = new Set((next.activities || []).map((a) => a._id).filter(Boolean));
      const gone = (snap.activities || []).filter((a) => a._id && !keep.has(a._id));
      for (let i = 0; i < gone.length; i += 100) {
        const ids = gone.slice(i, i + 100).map((a) => a._id);
        await must(sb.from('activities').delete().in('id', ids), 'delete activities');
        snap.activities = snap.activities.filter((a) => !ids.includes(a._id));
      }
    });

    /* 3. people: remove, create, update */
    for (const role of ['students', 'teachers']) {
      const singular = role === 'students' ? 'student' : 'teacher';
      const nextIds = new Set((next[role] || []).map((u) => u.id));
      for (const old of [...(snap[role] || [])]) {
        if (nextIds.has(old.id)) continue;
        await step('delete ' + singular + ' ' + old.id, async () => {
          const uid = old._uid || uidOf(old.id);
          if (uid) {
            const { error } = await sb.functions.invoke('manage-users', { body: { action: 'delete', user_id: uid } });
            if (error) throw new Error(await functionError(error));
            ctx.profileById.delete(uid); ctx.profileByCode.delete(old.id);
          }
          snap[role] = snap[role].filter((u) => u.id !== old.id);
        });
      }

      const snapIds = new Set((snap[role] || []).map((u) => u.id));
      for (const user of next[role] || []) {
        if (snapIds.has(user.id)) continue;
        await step('create ' + singular + ' ' + user.id, async () => {
          const body = {
            action: 'create', role: singular, user_code: user.id, email: toEmail(user.id),
            password: user.password, full_name: user.name, status: capStatus(user.status),
            date_of_birth: dateOrNull(user.dateOfBirth), session: user.session || null,
            class_id: singular === 'student' ? classId(user.className) : null
          };
          const { data, error } = await sb.functions.invoke('manage-users', { body });
          if (error) throw new Error(await functionError(error));
          const uid = data && data.id;
          if (!uid) throw new Error('The server did not return the new user id');
          const row = { id: uid, role: singular, user_code: user.id, full_name: user.name, class_id: body.class_id, status: body.status, session: body.session, date_of_birth: body.date_of_birth };
          ctx.profileById.set(uid, row); ctx.profileByCode.set(user.id, row);
          patch.uids[user.id] = uid; patch.stripPassword.add(user.id);
          const entry = { ...clone(user), _uid: uid };
          delete entry.password;
          if (String(entry.photoDataUrl || '').startsWith('data:')) entry.photoDataUrl = '';
          snap[role].push(entry);
          snapIds.add(user.id);
          if (String(user.photoDataUrl || '').startsWith('data:')) {
            const url = await uploadPhoto(uid, user.photoDataUrl);
            await must(sb.from('profiles').update({ photo_url: url }).eq('id', uid), 'save photo');
            patch.photos[user.id] = url;
            entry.photoDataUrl = url;
          }
          if (singular === 'teacher') await saveTeacherLinks(uid, user, entry, true);
        });
      }

      for (const user of next[role] || []) {
        const old = (snap[role] || []).find((u) => u.id === user.id);
        if (!old || !old._uid || patch.uids[user.id]) continue;
        await step('update ' + singular + ' ' + user.id, async () => {
          const changes = {};
          if (user.name !== old.name) changes.full_name = user.name;
          if (capStatus(user.status) !== capStatus(old.status)) changes.status = capStatus(user.status);
          if ((user.dateOfBirth || '') !== (old.dateOfBirth || '')) changes.date_of_birth = dateOrNull(user.dateOfBirth);
          if ((user.session || '') !== (old.session || '')) changes.session = user.session || null;
          if (singular === 'student' && norm(user.className) !== norm(old.className)) changes.class_id = classId(user.className);
          let newPhoto = null;
          if (String(user.photoDataUrl || '').startsWith('data:')) {
            newPhoto = await uploadPhoto(old._uid, user.photoDataUrl);
            changes.photo_url = newPhoto;
          }
          if (Object.keys(changes).length) await must(sb.from('profiles').update(changes).eq('id', old._uid), 'update ' + singular);
          if (newPhoto) patch.photos[user.id] = newPhoto;
          const merged = { ...old, name: user.name, status: user.status, dateOfBirth: user.dateOfBirth, session: user.session, className: user.className, photoDataUrl: newPhoto || old.photoDataUrl };
          if (singular === 'teacher') {
            await saveTeacherLinks(old._uid, user, old);
            merged.assignedClasses = user.assignedClasses; merged.assignedSubjects = user.assignedSubjects; merged.subject = user.subject;
          }
          Object.assign(old, merged);
        });
      }
    }

    // Admins may update their own display name and profile photo.
    for (const user of next.admin || []) {
      const old = (snap.admin || []).find((u) => u.id === user.id);
      if (!old || !old._uid) continue;
      const changes = {};
      if (user.name !== old.name) changes.full_name = user.name;
      const hasNewPhoto = String(user.photoDataUrl || '').startsWith('data:');
      if (!Object.keys(changes).length && !hasNewPhoto) continue;
      await step('admin profile ' + user.id, async () => {
        let photoUrl = old.photoDataUrl;
        if (hasNewPhoto) {
          photoUrl = await uploadPhoto(old._uid, user.photoDataUrl);
          changes.photo_url = photoUrl;
        }
        await must(sb.from('profiles').update(changes).eq('id', old._uid), 'save admin profile');
        if (hasNewPhoto) patch.photos[user.id] = photoUrl;
        Object.assign(old, { name: user.name, photoDataUrl: photoUrl });
      });
    }

    async function saveTeacherLinks(uid, user, snapEntry, force) {
      const wantClasses = [...new Set([...(user.assignedClasses || []), user.className].filter(Boolean).map(norm))];
      const wantSubjects = [...new Set([...(user.assignedSubjects || []), user.subject].filter(Boolean))];
      const haveClasses = [...new Set([...(snapEntry.assignedClasses || []), snapEntry.className].filter(Boolean).map(norm))];
      const haveSubjects = [...new Set([...(snapEntry.assignedSubjects || []), snapEntry.subject].filter(Boolean))];
      if (force || !sameList(wantClasses, haveClasses)) {
        await must(sb.from('teacher_classes').delete().eq('teacher_id', uid), 'clear teacher classes');
        const rows = wantClasses.map((n) => ({ teacher_id: uid, class_id: classId(n) })).filter((r) => r.class_id);
        if (rows.length) await must(sb.from('teacher_classes').insert(rows), 'save teacher classes');
      }
      if (force || !sameList(wantSubjects, haveSubjects)) {
        await must(sb.from('teacher_subjects').delete().eq('teacher_id', uid), 'clear teacher subjects');
        const rows = wantSubjects.map((n) => ({ teacher_id: uid, subject_id: subjectId(n) })).filter((r) => r.subject_id);
        if (rows.length) await must(sb.from('teacher_subjects').insert(rows), 'save teacher subjects');
      }
    }

    /* 4. scores, report sheets, CBT, questions, activity */
    await step('results', async () => {
      const have = new Map((snap.academicResults || []).map((r) => [resultKey(r), r]));
      const inserts = []; const insertRefs = [];
      for (const r of next.academicResults || []) {
        const old = have.get(resultKey(r));
        const studentUid = uidOf(r.studentId); const subjId = subjectId(r.subject);
        if (!studentUid || !subjId) { errors.push('result for ' + r.studentId + ' / ' + r.subject + ' skipped (student or subject not on the server yet)'); continue; }
        // `total` is a generated column in the database, so it is never sent.
        const row = { student_id: studentUid, subject_id: subjId, term: r.term, session: r.session, ca1: num(r.ca1 !== undefined ? r.ca1 : r.ca), ca2: num(r.ca2), exam: num(r.exam), grade: r.grade || '', entered_by: me ? me.id : null, updated_at: new Date().toISOString() };
        if (!old) { inserts.push(row); insertRefs.push(r); }
        else if (old.ca1 !== row.ca1 || old.ca2 !== row.ca2 || num(old.exam) !== row.exam || (old.grade || '') !== row.grade) {
          await must(sb.from('academic_results').update(row).eq('id', old._id), 'update result');
          Object.assign(old, clone(r), { _id: old._id });
        } else if (r.className !== old.className) { old.className = r.className; }
      }
      for (let i = 0; i < inserts.length; i += 100) {
        const batch = inserts.slice(i, i + 100);
        const rows = await must(sb.from('academic_results').insert(batch).select('id, student_id, subject_id, term, session'), 'save results');
        rows.forEach((row) => {
          const ref = insertRefs.slice(i, i + 100).find((r) => uidOf(r.studentId) === row.student_id && subjectId(r.subject) === row.subject_id && r.term === row.term && r.session === row.session);
          if (ref) snap.academicResults.push({ ...clone(ref), _id: row.id });
        });
      }
    });

    await step('report sheets', async () => {
      for (const key of Object.keys(next.reportDetails || {})) {
        const [code, term, session] = key.split('|');
        const value = next.reportDetails[key];
        const studentUid = uidOf(code);
        if (!studentUid) continue;
        const row = { student_id: studentUid, term, session, days_present: intOrNull(value.daysPresent), teacher_remark: value.teacherRemark || '', head_remark: value.headRemark || '', affective: value.affective || {}, psychomotor: value.psychomotor || {} };
        const old = (snap.reportDetails || {})[key];
        const comparable = (v) => JSON.stringify([intOrNull(v.daysPresent), v.teacherRemark || '', v.headRemark || '', v.affective || {}, v.psychomotor || {}]);
        if (old && comparable(old) === comparable(value)) continue;
        if (old && old._id) {
          await must(sb.from('report_details').update(row).eq('id', old._id), 'update report details');
          snap.reportDetails[key] = { ...clone(value), _id: old._id };
        } else {
          const rows = await must(sb.from('report_details').insert(row).select('id'), 'save report details');
          snap.reportDetails = snap.reportDetails || {};
          snap.reportDetails[key] = { ...clone(value), _id: rows[0].id };
        }
      }
      for (const key of Object.keys(next.reportMeta || {})) {
        const [cls, term, session] = key.split('|');
        const value = next.reportMeta[key];
        const cid = classId(cls);
        if (!cid) continue;
        const row = { class_id: cid, term, session, days_in_term: intOrNull(value.daysInTerm), resumption_date: dateOrNull(value.resumption), parents_note: value.parentsNote || '' };
        const old = (snap.reportMeta || {})[key];
        const comparable = (v) => JSON.stringify([intOrNull(v.daysInTerm), v.resumption || '', v.parentsNote || '']);
        if (old && comparable(old) === comparable(value)) continue;
        if (old && old._id) {
          await must(sb.from('class_term_info').update(row).eq('id', old._id), 'update term info');
          snap.reportMeta[key] = { ...clone(value), _id: old._id };
        } else {
          const rows = await must(sb.from('class_term_info').insert(row).select('id'), 'save term info');
          snap.reportMeta = snap.reportMeta || {};
          snap.reportMeta[key] = { ...clone(value), _id: rows[0].id };
        }
      }
    });

    await step('CBT results', async () => {
      const have = new Map((snap.cbtResults || []).map((r) => [cbtKey(r), r]));
      for (const r of next.cbtResults || []) {
        const studentUid = uidOf(r.studentId);
        const subjId = subjectId(r.subject);
        if (!studentUid || !subjId) {
          errors.push('CBT result for ' + r.studentId + ' / ' + r.subject + ' skipped (student or subject not on the server yet)');
          continue;
        }
        const legacySeconds = (parseFloat(String(r.timeUsed || '0')) || 0) * 60;
        const timeUsedSeconds = Number.isFinite(Number(r.timeUsedSeconds)) ? Number(r.timeUsedSeconds) : legacySeconds;
        const row = { student_id: studentUid, test_title: r.testTitle || '', subject_id: subjId, score: num(r.score), total_questions: Number(r.total || 0), percentage: num(r.percentage), question_review: Array.isArray(r.questionReview) ? r.questionReview : [], time_used_seconds: Math.max(0, Math.round(timeUsedSeconds)), taken_at: r.takenAt || new Date().toISOString() };
        const old = have.get(cbtKey(r));
        if (old && old.score === row.score && Number(old.total) === row.total_questions
          && num(old.percentage) === row.percentage && old.testTitle === r.testTitle
          && old.subject === r.subject && Number(old.timeUsedSeconds || 0) === row.time_used_seconds
          && JSON.stringify(old.questionReview || []) === JSON.stringify(row.question_review)
          && old.takenAt === row.taken_at) continue;
        if (old && old._id) {
          await must(sb.from('cbt_results').update(row).eq('id', old._id), 'update CBT result');
          Object.assign(old, clone(r), { questionReview: row.question_review, timeUsedSeconds: row.time_used_seconds, _id: old._id });
        } else {
          const rows = await must(sb.from('cbt_results').insert(row).select('id'), 'save CBT result');
          snap.cbtResults.push({ ...clone(r), questionReview: row.question_review, timeUsedSeconds: row.time_used_seconds, _id: rows[0].id });
        }
      }
    });

    await step('questions', async () => {
      const fresh = [];
      for (const question of next.questions || []) {
        const old = (snap.questions || []).find((item) => item._id === question._id);
        if (!old || sigQuestion(old) !== sigQuestion(question)) {
          if (question._id && old) {
            const subject = subjectId(question.subject);
            const cls = classId(question.className);
            if (!subject || !cls) {
              errors.push('Question update skipped for "' + question.testTitle + '" (class or subject not on the server yet)');
              continue;
            }
            const row = {
              test_title: question.testTitle || '', subject_id: subject, class_id: cls,
              question_text: question.question || '', option_a: (question.options || [])[0] || '',
              option_b: (question.options || [])[1] || '', option_c: (question.options || [])[2] || '',
              option_d: (question.options || [])[3] || '', correct_answer: question.answer || 'A'
            };
            await must(sb.from('cbt_questions').update(row).eq('id', question._id), 'update question');
            Object.assign(old, clone(question));
          } else if (!question._id) {
            fresh.push(question);
          }
        }
      }
      for (let i = 0; i < fresh.length; i += 50) {
        const chunk = fresh.slice(i, i + 50);
        const batch = chunk.map((q) => ({
          test_title: q.testTitle || '', subject_id: subjectId(q.subject), class_id: classId(q.className), question_text: q.question || '',
          option_a: (q.options || [])[0] || '', option_b: (q.options || [])[1] || '', option_c: (q.options || [])[2] || '', option_d: (q.options || [])[3] || '',
          correct_answer: q.answer || 'A', created_by: me ? me.id : null
        }));
        const rows = await must(sb.from('cbt_questions').insert(batch).select('id'), 'save question');
        if (!rows || rows.length !== chunk.length) throw new Error('save question: the server sent back an unexpected reply');
        chunk.forEach((q, at) => {
          patch.questionIds.push({ sig: sigQuestion(q), id: rows[at].id });
          snap.questions.push({ ...clone(q), _id: rows[at].id });
        });
      }
    });

    await step('activities', async () => {
      const fresh = (next.activities || []).filter((a) => !a._id && !a.isCbtCompletion).reverse();
      for (let index = 0; index < fresh.length; index += 1) {
        const activity = fresh[index];
        const row = { user_id: me ? me.id : null, role: activity.role || '', activity: activity.activity || '', actor_name: me ? me.full_name : null };
        if (isAdmin) {
          const rows = await must(sb.from('activities').insert(row).select('id'), 'save activity');
          patch.activityIds.push({ sig: sigActivity(activity), id: rows[0].id });
          snap.activities.unshift({ ...clone(activity), _id: rows[0].id });
        } else {
          await must(sb.from('activities').insert(row), 'save activity');
          const localId = `local:${activity.createdAt || Date.now()}:${index}`;
          patch.activityIds.push({ sig: sigActivity(activity), id: localId });
          snap.activities.unshift({ ...clone(activity), _id: localId });
        }
      }
    });

    await step('student notifications', async () => {
      snap.notifications = snap.notifications || [];
      const current = next.notifications || [];
      if (isAdmin) {
        const keep = new Set(current.map((notice) => notice.eventKey));
        const removed = snap.notifications.filter((notice) => !keep.has(notice.eventKey));
        for (let index = 0; index < removed.length; index += 100) {
          const eventKeys = removed.slice(index, index + 100).map((notice) => notice.eventKey);
          await must(sb.from('portal_notifications').delete().in('event_key', eventKeys), 'delete student notifications');
          snap.notifications = snap.notifications.filter((notice) => !eventKeys.includes(notice.eventKey));
        }
      }
      for (const notice of current) {
        const requiredStep = notice.eventType === 'academic_result' ? 'results -'
          : notice.eventType === 'cbt_result_ready' ? 'CBT results -'
            : 'questions -';
        if (errors.some((error) => error.startsWith(requiredStep))) continue;
        const recipientId = uidOf(notice.recipientId);
        const recipientClassId = classId(notice.className);
        if (!notice.eventKey || !recipientId || !recipientClassId) {
          errors.push('Notification skipped for ' + (notice.recipientId || 'unknown student') + ' (student or class not on the server yet)');
          continue;
        }
        const old = snap.notifications.find((item) => item.eventKey === notice.eventKey);
        if (!old) {
          const row = {
            recipient_id: recipientId,
            recipient_class_id: recipientClassId,
            actor_id: me ? me.id : null,
            actor_name: me ? me.full_name : notice.actorName || 'School portal',
            event_type: notice.eventType,
            message: notice.message,
            action_url: notice.actionUrl || null,
            event_key: notice.eventKey,
            created_at: notice.createdAt || new Date().toISOString(),
            read_at: notice.readAt || null
          };
          const { data: rows, error } = await sb.from('portal_notifications')
            .insert(row).select('id, event_key, read_at');
          if (error && error.code !== '23505') throw new Error('save student notification: ' + error.message);
          const saved = rows && rows[0];
          const copy = { ...clone(notice), ...(saved ? { _id: saved.id, readAt: saved.read_at || '' } : {}) };
          snap.notifications.push(copy);
        } else if ((old.readAt || '') !== (notice.readAt || '')) {
          await must(sb.from('portal_notifications')
            .update({ read_at: notice.readAt || null })
            .eq('event_key', notice.eventKey)
            .eq('recipient_id', recipientId), 'update student notification');
          old.readAt = notice.readAt || '';
        }
      }
    });

    /* 5. classes and subjects that were removed (last, so nothing still points at them) */
    await step('remove classes', async () => {
      const keep = new Set((next.classes || []).map(ckey));
      for (const name of [...(snap.classes || [])]) {
        if (keep.has(ckey(name))) continue;
        const row = ctx.classByKey.get(ckey(name));
        if (row) {
          await must(sb.from('classes').delete().eq('id', row.id), 'delete class "' + name + '"');
          ctx.classById.delete(row.id); ctx.classByKey.delete(ckey(name));
        }
        snap.classes = snap.classes.filter((n) => ckey(n) !== ckey(name));
        snap.inactiveClasses = (snap.inactiveClasses || []).filter((n) => ckey(n) !== ckey(name));
      }
    });
    await step('remove subjects', async () => {
      const keep = new Set((next.subjects || []).map(lower));
      for (const name of [...(snap.subjects || [])]) {
        if (keep.has(lower(name))) continue;
        const row = ctx.subjectByKey.get(lower(name));
        if (row) {
          await must(sb.from('subjects').delete().eq('id', row.id), 'delete subject "' + name + '"');
          ctx.subjectById.delete(row.id); ctx.subjectByKey.delete(lower(name));
        }
        snap.subjects = snap.subjects.filter((n) => lower(n) !== lower(name));
        snap.inactiveSubjects = (snap.inactiveSubjects || []).filter((n) => lower(n) !== lower(name));
      }
    });

    return { errors, patch, isAdmin };
  }

  // Warn before leaving the page while changes are still being sent.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', (event) => {
      if (running || dirty) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  window.PortalSync = { boot, markReady, login, logout, queuePush, flush, refreshNotifications, saveSchoolStamp, toEmail, setUserPassword, _buildData: buildData, _pushChanges: pushChanges, _setState: (s) => { snapshot = s.snapshot; ctx = s.ctx; me = s.me; } };
})();