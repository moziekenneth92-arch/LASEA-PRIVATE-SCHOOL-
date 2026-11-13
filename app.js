  'Creche', 'Nursery 1', 'Nursery 2', 'Nursery 3',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'
];
const PORTAL_LOGO_URL = new URL('logo.svg', document.currentScript.src).href;

const EMPTY_DATA = {
  students: [], teachers: [], admin: [],
  classes: [], subjects: [],
  inactiveClasses: [], inactiveSubjects: [],
  sessions: [], currentSession: '',
  settings: { schoolName: '', stampDataUrl: '' },
  academicResults: [], reportDetails: {}, reportMeta: {},
  questions: [], cbtResults: [], activities: [], notifications: []
};

function initPortalApp() {
  attachGlobalActions();
  initializePasswordToggles();
  initializeSidebarNavigation();
  initializeQuickNavigation();
  renderSchoolName();

  const bodyPage = document.body.dataset.page || 'landing';

  switch (bodyPage) {
    case 'login':
      initLoginPages();
      break;
    case 'student-dashboard':
      if (!protectPage('student')) break;
      initializeStudentNotifications();
      renderStudentDashboard();
      break;
    case 'student-profile':
      window.location.replace('student-dashboard.html');
      break;
    case 'student-subjects':
      if (!protectPage('student')) break;
      initializeStudentNotifications();
      renderStudentSubjects();
      break;
    case 'student-cbt':
      if (!protectPage('student')) break;
      initializeStudentNotifications();
      initCbtPage();
      break;
    case 'student-cbt-result':
      if (!protectPage('student')) break;
      initializeStudentNotifications();
      renderCbtResult();
      break;
    case 'student-academic-results':
      if (!protectPage('student')) break;
      initializeStudentNotifications();
      renderAcademicResultsPage();
      break;
    case 'student-activities':
      protectPage('student');
      window.location.replace('student-dashboard.html');
      break;
    case 'teacher-dashboard':
      protectPage('teacher');
      renderTeacherDashboard();
      break;
    case 'teacher-profile':
      window.location.replace('teacher-dashboard.html');
      break;
    case 'teacher-students':
      protectPage('teacher');
      renderTeacherStudents();
      break;
    case 'teacher-subjects':
      protectPage('teacher');
      renderTeacherSubjects();
      break;
    case 'teacher-enter-scores':
      protectPage('teacher');
      renderEnterScoresPage();
      break;
    case 'teacher-results':
      protectPage('teacher');
      renderTeacherResults();
      break;
    case 'teacher-cbt-questions':
      protectPage('teacher');
      renderTeacherQuestions();
      break;
    case 'teacher-activities':
      protectPage('teacher');
      window.location.replace('teacher-dashboard.html');
      break;
    case 'admin-dashboard':
      protectPage('admin');
      renderAdminDashboard();
      break;
    case 'admin-profile':
      protectPage('admin');
      renderProfilePage('admin');
      break;
    case 'admin-students':
      protectPage('admin');
      renderAdminStudents();
      break;
    case 'admin-teachers':
      protectPage('admin');
      renderAdminTeachers();
      break;
    case 'admin-classes':
      protectPage('admin');
      renderAdminClasses();
      break;
    case 'admin-subjects':
      protectPage('admin');
      renderAdminSubjects();
      break;
    case 'admin-cbt':
      protectPage('admin');
      renderAdminCbtResults();
      break;
    case 'admin-academic-results':
      protectPage('admin');
      renderAdminAcademicResults();
      break;
    case 'admin-activities':
      protectPage('admin');
      renderAdminActivities();
      break;
    case 'admin-settings':
      protectPage('admin');
      renderAdminSettings();
      break;
    default:
      break;
  }

  initializeDraftPersistence();

  window.addEventListener('storage', (event) => {
    if (event.key !== 'schoolPortalData') return;
    renderSchoolName();
    const session = getSession();
    if (session && ['student', 'teacher'].includes(session.role)) {
      const data = loadData();
      const users = session.role === 'student' ? data.students : data.teachers;
      const user = users.find((item) => item.id === session.id);
      if (!user || user.status === 'Inactive') {
        localStorage.removeItem('schoolPortalSession');
        window.location.href = `${session.role}-login.html`;
        return;
      }
    }
    if (bodyPage === 'teacher-dashboard') renderTeacherDashboard();
    if (bodyPage === 'student-dashboard') renderStudentDashboard();
    if (bodyPage === 'admin-dashboard') renderAdminDashboard();
  });
}

function initializePasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    const input = button.parentElement.querySelector('input');
    if (!input) return;

    button.addEventListener('click', () => {
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!isVisible));
      button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
    });
  });
}

function initializeDraftPersistence() {
  if (document.body.dataset.page === 'login') return;

  const session = getSession();
  const pageKey = [session?.role || 'guest', session?.id || 'guest', window.location.pathname].join(':');
  const storageKey = `schoolPortalDraft:${pageKey}`;
  const clearButton = document.querySelector('.topbar-actions');
  const draftButton = document.createElement('button');
  draftButton.className = 'btn btn-secondary draft-clear-button';
  draftButton.type = 'button';
  draftButton.textContent = 'Clear draft';
  draftButton.hidden = true;
  if (clearButton) clearButton.appendChild(draftButton);

  const getControls = (root = document) => [...root.querySelectorAll('input, textarea, select')]
    .filter((control) => !control.closest('[data-login-form]')
      && !['password', 'file', 'hidden', 'button', 'submit', 'reset'].includes(control.type)
      && !control.disabled
      && !control.hasAttribute('data-no-draft'));

  const getControlKey = (control, index) => control.dataset.draftKey
    || control.id
    || control.name
    || control.getAttribute('aria-label')
    || `control-${index}`;

  const readControl = (control) => {
    if (control.type === 'checkbox' || control.type === 'radio') {
      return { checked: control.checked };
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      return { value: [...control.selectedOptions].map((option) => option.value) };
    }
    return { value: control.value };
  };

  const writeControl = (control, value) => {
    if (control.type === 'checkbox' || control.type === 'radio') {
      control.checked = Boolean(value.checked);
    } else if (control instanceof HTMLSelectElement && control.multiple) {
      const selectedValues = new Set(value.value || []);
      [...control.options].forEach((option) => { option.selected = selectedValues.has(option.value); });
    } else if (value.value !== undefined) {
      if (!(control instanceof HTMLSelectElement) || [...control.options].some((option) => option.value === value.value)) {
        control.value = value.value;
      }
    }
  };

  const readDraft = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (error) {
      return {};
    }
  };

  const saveDraft = () => {
    const draft = {};
    getControls().forEach((control, index) => {
      draft[getControlKey(control, index)] = readControl(control);
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      draftButton.hidden = Object.keys(draft).length === 0;
    } catch (error) {
      draftButton.hidden = false;
    }
  };

  const restoreDraft = () => {
    const draft = readDraft();
    const controls = getControls();
    controls.forEach((control, index) => {
      if (control instanceof HTMLSelectElement && draft[getControlKey(control, index)]) {
        writeControl(control, draft[getControlKey(control, index)]);
      }
    });
    controls.filter((control) => control instanceof HTMLSelectElement && draft[getControlKey(control, controls.indexOf(control))])
      .forEach((control) => control.dispatchEvent(new Event('change', { bubbles: true })));
    getControls().forEach((control, index) => {
      const value = draft[getControlKey(control, index)];
      if (value) writeControl(control, value);
    });
    draftButton.hidden = Object.keys(draft).length === 0;
  };

  restoreDraft();

  document.addEventListener('input', (event) => {
    if (event.target.matches('input, textarea, select') && !event.target.matches('[type="password"], [type="file"]')) {
      saveDraft();
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('input, textarea, select') && !event.target.matches('[type="password"], [type="file"]')) {
      saveDraft();
    }
  });
  document.addEventListener('reset', (event) => {
    const draft = readDraft();
    getControls(event.target).forEach((control, index) => delete draft[getControlKey(control, index)]);
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      draftButton.hidden = Object.keys(draft).length === 0;
    } catch (error) {
      draftButton.hidden = true;
    }
  });
  draftButton.addEventListener('click', () => {
    if (!window.confirm('Clear the saved draft for this page?')) return;
    localStorage.removeItem(storageKey);
    window.location.reload();
  });
}

function renderSchoolName() {
  const schoolName = loadData().settings?.schoolName?.trim() || 'School Name';
  document.querySelectorAll('[data-school-name]').forEach((element) => {
    element.textContent = schoolName;
  });
}

function applyCompanyBranding() {
  const companyName = 'Bluship Media Group';
  if (!document.title.includes(companyName)) {
    document.title = `${companyName} | ${document.title}`;
  }
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && !sidebar.querySelector('.sidebar-company')) {
    const company = document.createElement('p');
    company.className = 'sidebar-company';
    company.textContent = companyName;
    sidebar.appendChild(company);
  }
}

document.addEventListener('DOMContentLoaded', startPortalApp);

async function startPortalApp() {
  applyCompanyBranding();
  document.addEventListener('invalid', (event) => {
    event.preventDefault();
    const field = event.target;
    const form = field.form;
    let message = field.validationMessage;
    if (form?.matches('[data-login-form]') && field.validity.valueMissing) {
      const label = [...form.querySelectorAll('label')].find((item) => item.htmlFor === field.id);
      message = `Please enter your ${label?.textContent.trim() || field.name}.`;
    }
    showErrorModal(message);
  }, true);
  if (window.PortalSync) {
    const ready = await window.PortalSync.boot(document.body.dataset.page || 'landing');
    if (!ready) return;
  }
  ensureData();
  if (window.PortalSync) window.PortalSync.markReady();
  initPortalApp();
}

function ensureData() {
  const saved = localStorage.getItem('schoolPortalData');
  const data = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(EMPTY_DATA));
  const cleanList = (list) => [...new Map((Array.isArray(list) ? list : []).map((item) => String(item || '').trim())
    .filter(Boolean).map((item) => [item.toLowerCase(), item])).values()];
  data.classes = [...new Map((Array.isArray(data.classes) ? data.classes : []).map(normalizeClassName)
    .filter(Boolean).map((className) => [className.toLowerCase(), className])).values()];
  data.subjects = cleanList(data.subjects);
  data.sessions = cleanList(data.sessions);
  data.currentSession = String(data.currentSession || '').trim();
  data.inactiveClasses = [...new Set((data.inactiveClasses || []).map(normalizeClassName).filter(Boolean))];
  data.inactiveSubjects = [...new Set((data.inactiveSubjects || []).map((subject) => String(subject || '').trim()).filter(Boolean))];
  data.students = (data.students || []).map((student) => ({ ...student, className: normalizeClassName(student.className) }));
  data.teachers = (data.teachers || []).map((teacher) => ({
    ...teacher,
    className: normalizeClassName(teacher.className),
    ...(Array.isArray(teacher.assignedClasses)
      ? { assignedClasses: teacher.assignedClasses.map(normalizeClassName) }
      : {})
  }));
  data.admin = data.admin || [];
  data.settings = { schoolName: '', ...(data.settings || {}) };
  data.questions = (Array.isArray(data.questions) ? data.questions : []).map((question) => ({
    ...question,
    testTitle: String(question.testTitle || '').trim() || (question.subject ? `${question.subject} CBT` : '')
  }));
  data.cbtResults = (Array.isArray(data.cbtResults) ? data.cbtResults : []).map((result) => ({
    ...result,
    className: normalizeClassName(result.className)
  }));
  if (!Array.isArray(data.activities)) data.activities = [];
  data.academicResults = (data.academicResults || []).map((result) => {
    const student = data.students.find((item) => item.id === result.studentId);
    return { ...result, className: normalizeClassName(result.className || student?.className) };
  });
  data.reportDetails = data.reportDetails || {};
  data.reportMeta = data.reportMeta || {};
  data.notifications = Array.isArray(data.notifications) ? data.notifications : [];
  localStorage.setItem('schoolPortalData', JSON.stringify(data));
}

// Academic sessions: only what the admin entered in Settings (plus any session already used by a student or a result).
function getSessions(data) {
  return [...new Set([
    ...(data.sessions || []),
    ...(data.students || []).map((student) => student.session),
    ...(data.academicResults || []).map((result) => result.session)
  ].map((session) => String(session || '').trim()).filter(Boolean))].sort().reverse();
}

function getCurrentSession(data) {
  const sessions = getSessions(data);
  const current = String(data.currentSession || '').trim();
  return sessions.includes(current) ? current : (sessions[0] || '');
}

function fillSessionSelect(select, data, selected) {
  const sessions = getSessions(data);
  if (selected && !sessions.includes(selected)) sessions.push(selected);
  select.innerHTML = sessions.length
    ? sessions.map((session) => `<option value="${escapeHtml(session)}">${escapeHtml(session)}</option>`).join('')
    : '<option value="">Add a session in Settings first</option>';
  if (sessions.length) select.value = selected || getCurrentSession(data);
}

function normalizeClassName(className) {
  const value = String(className || '').trim().replace(/\s+/g, ' ');
  const compactValue = value.replace(/\s/g, '').toLowerCase();
  return STANDARD_CLASSES.find((item) => item.replace(/\s/g, '').toLowerCase() === compactValue) || value;
}

function loadData() {
  return JSON.parse(localStorage.getItem('schoolPortalData') || JSON.stringify(EMPTY_DATA));
}

function saveData(data) {
  localStorage.setItem('schoolPortalData', JSON.stringify(data));
  if (window.PortalSync) window.PortalSync.queuePush();
}

function recordActivity(data, user, role, activity) {
  const now = new Date();
  const session = getSession();
  data.activities = data.activities || [];
  data.activities.unshift({
    user,
    userId: session && session.id ? session.id : '',
    role,
    activity,
    createdAt: now.toISOString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
}

// Records an activity for whoever is signed in and sends it to the database.
// The same activity is not repeated within 10 minutes (so refreshing a page does not flood the log).
function logActivity(text) {
  const session = getSession();
  if (!session) return;
  const data = loadData();
  const list = session.role === 'student' ? data.students : session.role === 'teacher' ? data.teachers : data.admin;
  const user = (list || []).find((item) => item.id === session.id);
  if (!user) return;
  const recent = (data.activities || []).find((item) => item.userId === session.id && item.activity === text);
  if (recent && recent.createdAt && Date.now() - new Date(recent.createdAt).getTime() < 10 * 60 * 1000) return;
  recordActivity(data, user.name, session.role.charAt(0).toUpperCase() + session.role.slice(1), text);
  saveData(data);
}

function compressImageFile(file, maxDimension = 640) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Image processing is unavailable.'));
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (error) {
          reject(new Error('The selected image could not be processed.'));
        }
      };
      image.onerror = () => reject(new Error('The selected file is not a supported image.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('The photo could not be loaded. Please try another image.'));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"' && quoted && content[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function upsertAcademicResult(data, result) {
  const index = data.academicResults.findIndex((item) => item.studentId === result.studentId
    && item.subject === result.subject
    && item.term === result.term
    && (item.session || result.session) === result.session);
  if (index === -1) data.academicResults.push(result);
  else {
    const updatedResult = { ...data.academicResults[index], ...result };
    data.academicResults[index] = updatedResult;
  }
}

function attachGlobalActions() {
  const showPagePreloader = () => {
    let preloader = document.getElementById('pagePreloader');
    if (!preloader) {
      preloader = document.createElement('div');
      preloader.id = 'pagePreloader';
      preloader.className = 'page-preloader';
      preloader.setAttribute('role', 'status');
      preloader.setAttribute('aria-live', 'polite');
      preloader.innerHTML = `<img class="page-preloader-logo" src="${PORTAL_LOGO_URL}" alt="" /><span>Loading...</span>`;
      document.body.appendChild(preloader);
    }
    preloader.classList.add('is-visible');
    preloader.setAttribute('aria-hidden', 'false');
    clearTimeout(showPagePreloader.timer);
    showPagePreloader.timer = setTimeout(() => {
      if (navigator.onLine !== false) preloader.classList.remove('is-visible');
    }, 3000);
  };

  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.protocol !== window.location.protocol || destination.host !== window.location.host) return;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    showPagePreloader();
  });

  window.addEventListener('beforeunload', showPagePreloader);

  document.querySelectorAll('[data-role-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const role = button.dataset.roleLink;
      window.location.href = `${role}-login.html`;
    });
  });

  const sidebar = document.querySelector('.sidebar');
  const menuBtn = sidebar?.querySelector('[data-mobile-menu]');
  if (sidebar && menuBtn) {
    sidebar.id = sidebar.id || 'portalSidebar';
    menuBtn.setAttribute('aria-controls', sidebar.id);

    const mobileMenuBtn = document.createElement('button');
    mobileMenuBtn.className = 'mobile-menu-trigger';
    mobileMenuBtn.type = 'button';
    mobileMenuBtn.textContent = '☰';
    mobileMenuBtn.setAttribute('aria-label', 'Open navigation menu');
    mobileMenuBtn.setAttribute('aria-controls', sidebar.id);
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
    document.body.appendChild(mobileMenuBtn);

    const menuBackdrop = document.createElement('div');
    menuBackdrop.className = 'mobile-menu-backdrop';
    menuBackdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(menuBackdrop);

    const setMenuOpen = (isOpen) => {
      const isDesktop = window.matchMedia('(min-width: 981px)').matches;
      if (isDesktop) {
        const isCollapsed = !isOpen;
        sidebar.classList.toggle('collapsed', isCollapsed);
        sidebar.classList.remove('mobile-open');
        document.body.classList.remove('mobile-menu-open');
        menuBackdrop.classList.remove('is-visible');
        sessionStorage.setItem('portalSidebarCollapsed', String(isCollapsed));
        menuBtn.setAttribute('aria-expanded', String(isOpen));
        menuBtn.setAttribute('aria-label', isCollapsed ? 'Expand navigation' : 'Collapse navigation');
        menuBtn.title = isCollapsed ? 'Expand navigation' : 'Collapse navigation';
        menuBtn.textContent = isCollapsed ? '›' : '×';
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      sidebar.classList.remove('collapsed');
      sidebar.classList.toggle('mobile-open', isOpen);
      document.body.classList.toggle('mobile-menu-open', isOpen);
      menuBackdrop.classList.toggle('is-visible', isOpen);
      menuBtn.setAttribute('aria-expanded', String(isOpen));
      menuBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      menuBtn.title = isOpen ? 'Close navigation menu' : 'Open navigation menu';
      menuBtn.textContent = isOpen ? '×' : '☰';
      mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
      mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    };
    const syncMenuForViewport = () => {
      const isDesktop = window.matchMedia('(min-width: 981px)').matches;
      if (isDesktop) setMenuOpen(sessionStorage.getItem('portalSidebarCollapsed') !== 'true');
      else setMenuOpen(sidebar.classList.contains('mobile-open'));
    };
    syncMenuForViewport();
    menuBtn.addEventListener('click', () => {
      const isDesktop = window.matchMedia('(min-width: 981px)').matches;
      const isOpen = isDesktop ? !sidebar.classList.contains('collapsed') : sidebar.classList.contains('mobile-open');
      setMenuOpen(!isOpen);
      if (!isDesktop && isOpen) mobileMenuBtn.focus();
    });
    mobileMenuBtn.addEventListener('click', () => {
      setMenuOpen(!sidebar.classList.contains('mobile-open'));
      if (sidebar.classList.contains('mobile-open')) {
        sidebar.querySelector('nav a')?.focus();
      }
    });
    menuBackdrop.addEventListener('click', () => {
      setMenuOpen(false);
      mobileMenuBtn.focus();
    });
    window.addEventListener('resize', syncMenuForViewport);
    sidebar.querySelector('nav')?.addEventListener('click', (event) => {
      if (!window.matchMedia('(min-width: 981px)').matches && event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
        setMenuOpen(false);
        mobileMenuBtn.focus();
      }
    });
  }
}

function initializeSidebarNavigation() {
  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    subjects: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8"/>',
    students: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    teacher: '<path d="M3 5h18v12H3z"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="2"/><path d="M8 14a4 4 0 0 1 8 0"/>',
    classes: '<path d="M3 21h18M5 21V5l7-3 7 3v16"/><path d="M9 21v-5h6v5M9 7h.01M15 7h.01M9 11h.01M15 11h.01"/>',
    scores: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    results: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    cbt: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h4M8 16l2 2 4-4"/>',
    activities: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    default: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>'
  };
  const iconForLabel = (label) => {
    const value = label.toLowerCase();
    if (value.includes('dashboard')) return icons.dashboard;
    if (value.includes('profile')) return icons.profile;
    if (value.includes('subject')) return icons.subjects;
    if (value.includes('class')) return icons.classes;
    if (value.includes('student')) return icons.students;
    if (value.includes('teacher')) return icons.teacher;
    if (value.includes('score')) return icons.scores;
    if (value.includes('result') || value.includes('report')) return icons.results;
    if (value.includes('cbt') || value.includes('test')) return icons.cbt;
    if (value.includes('activit')) return icons.activities;
    if (value.includes('setting')) return icons.settings;
    if (value.includes('logout')) return icons.logout;
    return icons.default;
  };

  document.querySelectorAll('.sidebar nav a').forEach((link) => {
    const label = link.textContent.trim();
    link.title = label;
    link.setAttribute('aria-label', label);
    if (link.querySelector('.nav-icon')) return;
    const icon = document.createElement('span');
    icon.className = 'nav-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${iconForLabel(label)}</svg>`;
    const text = document.createElement('span');
    text.className = 'nav-label';
    text.textContent = label;
    link.replaceChildren(icon, text);
  });
}

function initializeQuickNavigation() {
  const sidebar = document.querySelector('.sidebar nav');
  const actions = document.querySelector('.topbar-actions');
  if (!sidebar || !actions || actions.querySelector('.quick-nav-trigger')) return;

  const pages = [...sidebar.querySelectorAll('a[href]')]
    .filter((link) => !/logout/i.test(`${link.textContent} ${link.getAttribute('onclick') || ''}`))
    .map((link) => ({ href: link.href, label: link.textContent.trim(), current: link.classList.contains('active') }));
  if (!pages.length) return;

  const trigger = document.createElement('button');
  trigger.className = 'btn btn-secondary quick-nav-trigger';
  trigger.type = 'button';
  trigger.textContent = 'Go to';
  trigger.title = 'Jump to a page (Ctrl+Shift+K)';
  trigger.setAttribute('aria-haspopup', 'dialog');
  actions.prepend(trigger);

  const dialog = document.createElement('dialog');
  dialog.className = 'quick-nav-dialog';
  dialog.setAttribute('aria-labelledby', 'quickNavTitle');

  const title = document.createElement('h2');
  title.id = 'quickNavTitle';
  title.textContent = 'Jump to a page';

  const search = document.createElement('input');
  search.id = 'quickNavSearch';
  search.type = 'search';
  search.placeholder = 'Search pages...';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Search portal pages');

  const hint = document.createElement('p');
  hint.className = 'quick-nav-hint';
  hint.textContent = 'Type to filter pages. Press Escape to close.';

  const results = document.createElement('nav');
  results.className = 'quick-nav-results';
  results.setAttribute('aria-label', 'Portal pages');

  const closeButton = document.createElement('button');
  closeButton.className = 'btn btn-secondary quick-nav-close';
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => dialog.close());

  dialog.append(title, search, hint, results, closeButton);
  document.body.appendChild(dialog);

  const renderResults = () => {
    const query = search.value.trim().toLowerCase();
    const matches = pages.filter((page) => page.label.toLowerCase().includes(query));
    results.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'quick-nav-empty';
      empty.textContent = 'No matching pages.';
      results.appendChild(empty);
      return;
    }

    matches.forEach((page) => {
      const link = document.createElement('a');
      link.className = 'quick-nav-link';
      link.href = page.href;
      link.textContent = page.label;
      if (page.current) {
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
      }
      results.appendChild(link);
    });
  };

  const openDialog = () => {
    if (dialog.open) return;
    search.value = '';
    renderResults();
    dialog.showModal();
    search.focus();
  };

  trigger.addEventListener('click', openDialog);
  search.addEventListener('input', renderResults);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      const firstLink = results.querySelector('a');
      if (firstLink) {
        event.preventDefault();
        firstLink.focus();
      }
    } else if (event.key === 'Enter') {
      const firstLink = results.querySelector('a');
      if (firstLink) {
        event.preventDefault();
        firstLink.click();
      }
    }
  });
  results.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...results.querySelectorAll('a')];
    const index = links.indexOf(document.activeElement);
    const nextIndex = event.key === 'ArrowDown' ? Math.min(index + 1, links.length - 1) : index - 1;
    if (event.key === 'ArrowUp' && nextIndex < 0) {
      event.preventDefault();
      search.focus();
    } else if (links[nextIndex]) {
      event.preventDefault();
      links[nextIndex].focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openDialog();
    }
  });
}

function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function addPortalNotification(data, student, eventType, message, actorName, actionUrl = '') {
  if (!student) return;
  data.notifications = Array.isArray(data.notifications) ? data.notifications : [];
  const eventKey = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${student.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  data.notifications.push({
    recipientId: student.id,
    className: normalizeClassName(student.className),
    eventType,
    message,
    actorName,
    eventKey,
    createdAt: new Date().toISOString(),
    actionUrl,
    readAt: ''
  });
}

function initializeStudentNotifications() {
  const container = document.createElement('div');
  container.className = 'portal-notification-layer';
  container.setAttribute('aria-live', 'assertive');
  container.hidden = true;
  document.body.appendChild(container);
  let visibleEventKey = '';

  const renderNextNotification = () => {
    const student = getCurrentStudent();
    const data = loadData();
    const notices = (data.notifications || [])
      .filter((notice) => notice.recipientId === student?.id && !notice.readAt && notice.eventType !== 'cbt_published')
      .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
    if (!notices.length) {
      container.hidden = true;
      container.innerHTML = '';
      visibleEventKey = '';
      return;
    }

    const notice = notices[0];
    if (notice.eventKey === visibleEventKey) return;
    visibleEventKey = notice.eventKey;
    let actionUrl = (notice.actionUrl || '').replace(/^(cbt-result|cbt|academic-results)\.html/, 'student-$1.html');
    let actionLabel = '';
    if (notice.eventType === 'academic_result') {
      actionLabel = 'View Academic Results';
      actionUrl = actionUrl || 'student-academic-results.html';
    } else if (notice.eventType === 'cbt_result_ready') {
      actionLabel = 'View CBT Result';
      actionUrl = actionUrl || 'student-cbt-result.html';
    }
    container.hidden = false;
    container.innerHTML = `
      <section class="portal-notification" role="dialog" aria-modal="true" aria-labelledby="portalNotificationTitle">
        <h2 id="portalNotificationTitle">New notification</h2>
        <p>${escapeHtml(notice.message)}</p>
        <p class="portal-notification-actor">By ${escapeHtml(notice.actorName || 'School portal')}</p>
        ${actionUrl ? `<a class="btn btn-primary" href="${escapeHtml(actionUrl)}" data-notification-action>${actionLabel}</a>` : ''}
        <button class="btn btn-secondary" type="button" data-dismiss-notification>Dismiss${notices.length > 1 ? ` (${notices.length} pending)` : ''}</button>
      </section>`;
    const actionButton = container.querySelector('[data-notification-action]');
    if (actionButton) {
      actionButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const data = loadData();
        const currentNotice = (data.notifications || []).find((item) => item.eventKey === notice.eventKey);
        if (currentNotice) {
          currentNotice.readAt = new Date().toISOString();
          saveData(data);
        }
        try {
          if (window.PortalSync) await window.PortalSync.flush();
        } catch (error) {
          console.error('Could not save notification status before opening the linked page:', error);
        }
        window.location.href = actionUrl;
      });
    }
    const dismissButton = container.querySelector('[data-dismiss-notification]');
    dismissButton.focus();
    dismissButton.addEventListener('click', () => {
      const data = loadData();
      const currentNotice = (data.notifications || []).find((item) => item.eventKey === notice.eventKey);
      if (currentNotice) {
        currentNotice.readAt = new Date().toISOString();
        saveData(data);
      }
      renderNextNotification();
    });
  };

  renderNextNotification();
  window.addEventListener('portal-notifications-updated', renderNextNotification);
  if (window.PortalSync?.refreshNotifications) {
    const refresh = () => window.PortalSync.refreshNotifications()
      .catch((error) => {
        console.error('Could not refresh notifications:', error);
        showErrorModal(`Could not check for new notifications: ${error.message}`);
      });
    refresh();
    window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }
}

function showSavedNotification(message) {
  let notification = document.getElementById('databaseSavedNotification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'databaseSavedNotification';
    notification.className = 'database-saved-notification';
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'database-saved-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';

    const label = document.createElement('span');
    label.className = 'database-saved-label';
    notification.append(icon, label);
    document.body.appendChild(notification);
  }

  notification.querySelector('.database-saved-label').textContent = message;
  notification.classList.add('is-visible');
  clearTimeout(showSavedNotification.timer);
  showSavedNotification.timer = setTimeout(() => {
    notification.classList.remove('is-visible');
  }, 3000);
}

function showErrorModal(message) {
  let modal = document.getElementById('appErrorModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'appErrorModal';
    modal.className = 'error-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'appErrorTitle');
    modal.setAttribute('aria-describedby', 'appErrorMessage');

    const box = document.createElement('div');
    box.className = 'error-modal-box';
    const title = document.createElement('h2');
    title.id = 'appErrorTitle';
    title.textContent = 'Portal message';
    const description = document.createElement('p');
    description.id = 'appErrorMessage';
    const closeButton = document.createElement('button');
    closeButton.className = 'btn btn-primary';
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', closeErrorModal);

    box.append(title, description, closeButton);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  if (!modal.classList.contains('open')) {
    showErrorModal.previousFocus = document.activeElement;
  }
  modal.querySelector('#appErrorMessage').textContent = String(message);
  modal.classList.add('open');
  modal.querySelector('button').focus();
  clearTimeout(showErrorModal.timer);
  showErrorModal.timer = setTimeout(closeErrorModal, 3000);
}

function closeErrorModal() {
  const modal = document.getElementById('appErrorModal');
  if (!modal) return;
  modal.classList.remove('open');
  clearTimeout(showErrorModal.timer);
  if (showErrorModal.previousFocus?.isConnected) showErrorModal.previousFocus.focus();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function getSession() {
  const session = localStorage.getItem('schoolPortalSession');
  return session ? JSON.parse(session) : null;
}

function setSession(role, id) {
  localStorage.setItem('schoolPortalSession', JSON.stringify({ role, id }));
}

async function logout() {
  if (window.PortalSync) {
    try { await window.PortalSync.logout(); } catch (error) { /* leave anyway */ }
  }
  localStorage.removeItem('schoolPortalSession');
  window.location.href = 'index.html';
}

function protectPage(expectedRole) {
  const session = getSession();
  const data = loadData();
  const records = expectedRole === 'student' ? data.students : expectedRole === 'teacher' ? data.teachers : data.admin;
  const user = records.find((record) => record.id === session?.id);
  if (!session || session.role !== expectedRole || !user || user.status === 'Inactive') {
    localStorage.removeItem('schoolPortalSession');
    window.location.href = `${expectedRole}-login.html`;
    return false;
  }
  return true;
}

function getCurrentStudent() {
  const session = getSession();
  const data = loadData();
  return data.students.find((student) => student.id === session?.id) || data.students[0];
}

function getCurrentTeacher() {
  const session = getSession();
  const data = loadData();
  return data.teachers.find((teacher) => teacher.id === session?.id) || data.teachers[0];
}

function getActiveClasses(data = loadData()) {
  const inactive = new Set((data.inactiveClasses || []).map(normalizeClassName));
  return data.classes.filter((className) => !inactive.has(normalizeClassName(className)));
}

function getActiveSubjects(data = loadData()) {
  const inactive = new Set((data.inactiveSubjects || []).map((subject) => subject.toLowerCase()));
  return data.subjects.filter((subject) => !inactive.has(subject.toLowerCase()));
}

function getTeacherAssignedClasses(teacher = getCurrentTeacher(), data = loadData()) {
  const assignments = Array.isArray(teacher?.assignedClasses) && teacher.assignedClasses.length
    ? teacher.assignedClasses
    : [teacher?.className];
  const activeClasses = new Set(getActiveClasses(data));
  return assignments.map(normalizeClassName).filter((className) => className && activeClasses.has(className));
}

function getTeacherAssignedSubjects(teacher = getCurrentTeacher(), data = loadData()) {
  const assignments = Array.isArray(teacher?.assignedSubjects) ? teacher.assignedSubjects : [teacher?.assignedSubjects];
  const assignedSubjects = new Set([...assignments, teacher?.subject].filter(Boolean).map((subject) => subject.toLowerCase()));
  return getActiveSubjects(data).filter((subject) => assignedSubjects.has(subject.toLowerCase()));
}

function teacherCanAccessClass(className, teacher = getCurrentTeacher()) {
  return getTeacherAssignedClasses(teacher).includes(normalizeClassName(className));
}

function getCurrentAdmin() {
  const session = getSession();
  const data = loadData();
  return data.admin.find((admin) => admin.id === session?.id) || data.admin[0];
}

function showLoginLoader(text, done) {
  let loader = document.getElementById('loginLoader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loginLoader';
    loader.className = 'login-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    const box = document.createElement('div');
    box.className = 'login-loader-box';
    const spinner = document.createElement('span');
    spinner.className = 'login-loader-spinner';
    const label = document.createElement('p');
    label.id = 'loginLoaderText';
    box.append(spinner, label);
    loader.appendChild(box);
    document.body.appendChild(loader);
  }
  clearTimeout(showLoginLoader.spinnerTimer);
  loader.classList.toggle('done', Boolean(done));
  loader.classList.remove('spinner-stopped');
  loader.querySelector('#loginLoaderText').textContent = text;
  loader.classList.add('open');
  if (!done) {
    showLoginLoader.spinnerTimer = setTimeout(() => {
      if (navigator.onLine !== false) {
        loader.classList.add('spinner-stopped');
        loader.querySelector('#loginLoaderText').textContent = 'Still waiting for the server...';
      }
    }, 3000);
  }
}

function hideLoginLoader() {
  clearTimeout(showLoginLoader.spinnerTimer);
  showLoginLoader.spinnerTimer = null;
  const loader = document.getElementById('loginLoader');
  if (loader) loader.classList.remove('open', 'done');
}

function initLoginPages() {
  document.querySelectorAll('[data-login-form]').forEach((form) => {
    const message = form.querySelector('.form-message');
    form.querySelector('[data-request-password]')?.addEventListener('click', (event) => {
      event.preventDefault();
      showErrorModal('Please contact your school administrator to request a new password.');
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const role = form.dataset.role;
      const id = form.querySelector('input[name="id"]').value.trim().toUpperCase();
      const password = form.querySelector('input[name="password"]').value;
      const button = form.querySelector('button[type="submit"]');
      message.textContent = '';
      if (button) button.disabled = true;
      showLoginLoader('Checking database...');
      let loggedIn = false;
      try {
        const result = await window.PortalSync.login(role, id, password);
        if (!result.ok) {
          hideLoginLoader();
          showErrorModal(result.message);
          return;
        }
        loggedIn = true;
        showLoginLoader('Login successful. Opening your dashboard...', true);
        window.location.href = `${role}-dashboard.html`;
      } catch (error) {
        hideLoginLoader();
        showErrorModal(navigator.onLine === false
          ? 'No internet connection. Check your connection and try again.'
          : 'Cannot connect to the server. Please try again shortly.');
      } finally {
        if (button && !loggedIn) button.disabled = false;
      }
    });
  });
}

function findUserByCredentials(role, id, password) {
  const data = loadData();
  if (role === 'student') {
    return data.students.find((student) => student.id === id && student.password === password && student.status !== 'Inactive');
  }
  if (role === 'teacher') {
    return data.teachers.find((teacher) => teacher.id === id && teacher.password === password && teacher.status !== 'Inactive');
  }
  if (role === 'admin') {
    return data.admin.find((admin) => admin.id === id && admin.password === password);
  }
  return null;
}

function renderStudentDashboard() {
  const student = getCurrentStudent();
  document.getElementById('studentWelcome').textContent = student.name;
  document.getElementById('studentId').textContent = student.id;
  document.getElementById('studentClass').textContent = student.className;
  document.getElementById('studentSession').textContent = student.session;

  const data = loadData();
  const subjectCount = getActiveSubjects(data).length;
  const cbtResults = data.cbtResults.filter((entry) => entry.studentId === student.id);
  const averageCbt = cbtResults.length ? Math.round((cbtResults.reduce((sum, item) => sum + item.percentage, 0) / cbtResults.length)) : 0;
  const academicResults = data.academicResults.filter((item) => item.studentId === student.id);
  const averageAcademic = academicResults.length ? Math.round(academicResults.reduce((sum, item) => sum + item.total, 0) / academicResults.length) : 0;

  document.getElementById('subjectsCount').textContent = String(subjectCount);
  document.getElementById('cbtTaken').textContent = String(cbtResults.length);
  document.getElementById('avgCbt').textContent = `${averageCbt}%`;
  document.getElementById('avgAcademic').textContent = `${averageAcademic}%`;

  const resultsBody = document.getElementById('recentCbtResults');
  if (resultsBody) {
    const recentRows = cbtResults.slice(0, 3).map((item) => `
      <tr>
        <td>${item.subject}</td>
        <td>${item.score}/${item.total}</td>
        <td>${item.percentage}%</td>
        <td>${item.date}</td>
      </tr>
    `).join('');
    resultsBody.innerHTML = recentRows || '<tr><td colspan="4" class="empty-state">No CBT results yet.</td></tr>';
  }

  const upcomingCbtList = document.getElementById('upcomingCbtList');
  if (upcomingCbtList) {
    const upcomingTests = getUpcomingCbtTests(student, data);
    upcomingCbtList.innerHTML = upcomingTests.length ? upcomingTests.map((test) => `
      <a class="list-item cbt-upcoming-item" href="student-cbt.html?test=${encodeURIComponent(test.id)}">
        <span class="cbt-upcoming-details"><strong>${escapeHtml(test.title)}</strong><small>${escapeHtml(test.subject)} · ${test.questionCount} questions</small></span>
        <span class="cbt-start-link">Start test</span>
      </a>
    `).join('') : '<div class="list-item empty-state">No upcoming CBT tests have been assigned to your class.</div>';
  }

}

function getCbtTestId(question) {
  return [normalizeClassName(question.className), question.subject, question.testTitle]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('::');
}

function getUpcomingCbtTests(student, data) {
  const tests = new Map();
  const activeSubjects = new Set(getActiveSubjects(data).map((subject) => subject.toLowerCase()));
  (data.questions || []).filter((question) => String(question.testTitle || '').trim()
    && activeSubjects.has(String(question.subject || '').toLowerCase())
    && normalizeClassName(question.className) === normalizeClassName(student.className))
    .forEach((question) => {
      const id = getCbtTestId(question);
      const test = tests.get(id) || {
        id,
        title: question.testTitle.trim(),
        subject: question.subject,
        questionCount: 0
      };
      test.questionCount += 1;
      tests.set(id, test);
    });
  const completedTestIds = new Set((data.cbtResults || [])
    .filter((result) => result.studentId === student.id)
    .map((result) => result.testId));
  return [...tests.values()].filter((test) => !completedTestIds.has(test.id));
}

function renderProfilePage(role) {
  const data = loadData();
  const user = role === 'student' ? getCurrentStudent() : role === 'teacher' ? getCurrentTeacher() : getCurrentAdmin();
  const assignedClasses = role === 'teacher' ? getTeacherAssignedClasses(user).join(', ') : user.className;
  const studentSubjects = Array.isArray(user.subjects) ? new Set(user.subjects.map((subject) => subject.toLowerCase())) : null;
  const subjects = role === 'teacher'
    ? getTeacherAssignedSubjects(user, data).join(', ')
    : role === 'student' ? getActiveSubjects(data).filter((subject) => !studentSubjects || studentSubjects.has(subject.toLowerCase())).join(', ') : 'Not applicable';
  const values = {
    className: role === 'teacher' ? assignedClasses || 'Not assigned' : role === 'student' ? user.className : 'Not applicable',
    subjects: subjects || 'Not assigned',
    session: user.session || getCurrentSession(data) || 'Not set',
    status: user.status || 'Active',
    dateOfBirth: user.dateOfBirth || 'Not provided'
  };

  document.getElementById('profileRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);
  document.getElementById('profileName').textContent = user.name;
  document.getElementById('profileId').textContent = user.id;
  document.querySelectorAll('[data-profile-field]').forEach((field) => {
    field.textContent = values[field.dataset.profileField] || 'Not provided';
  });

  const photo = document.getElementById('profilePhoto');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  const updatePhoto = (photoDataUrl) => {
    photo.hidden = !photoDataUrl;
    placeholder.hidden = Boolean(photoDataUrl);
    if (photoDataUrl) photo.src = photoDataUrl;
  };
  updatePhoto(user.photoDataUrl);
  if (role !== 'admin') {
    const photoInput = document.getElementById('profilePhotoInput');
    if (photoInput) photoInput.disabled = true;
    document.querySelector('.profile-upload')?.setAttribute('hidden', '');
    return;
  }

  const editProfileButton = document.getElementById('editAdminProfile');
  const editProfileForm = document.getElementById('adminProfileEditForm');
  if (role === 'admin' && editProfileButton && editProfileForm) {
    const nameInput = document.getElementById('adminProfileName');
    const profileMessage = document.getElementById('adminProfileMessage');
    nameInput.value = user.name || '';
    editProfileButton.addEventListener('click', () => {
      nameInput.value = loadData().admin.find((item) => item.id === user.id)?.name || user.name || '';
      profileMessage.textContent = '';
      editProfileForm.hidden = false;
      nameInput.focus();
    });
    document.getElementById('cancelAdminProfileEdit').addEventListener('click', () => {
      editProfileForm.hidden = true;
      profileMessage.textContent = '';
      editProfileButton.focus();
    });
    editProfileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) {
        profileMessage.textContent = 'Enter your name before saving.';
        nameInput.focus();
        return;
      }

      const currentData = loadData();
      const savedUser = currentData.admin.find((item) => item.id === user.id);
      if (!savedUser) {
        showErrorModal('Your admin profile could not be found. Refresh the page and try again.');
        return;
      }
      savedUser.name = name;
      recordActivity(currentData, name, 'Admin', 'Updated profile name');
      try {
        saveData(currentData);
        document.getElementById('profileName').textContent = name;
        profileMessage.textContent = 'Saving profile...';
        const syncErrors = window.PortalSync ? await window.PortalSync.flush() : [];
        if (syncErrors.length) throw new Error(syncErrors[0]);
        user.name = name;
        profileMessage.textContent = 'Profile updated successfully.';
        editProfileForm.hidden = true;
      } catch (error) {
        profileMessage.textContent = 'Your profile could not be synced. Please try again.';
        showErrorModal(`Could not save your profile: ${error.message}`);
      }
    });
  }

  document.getElementById('profilePhotoInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const message = document.getElementById('profilePhotoMessage');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showErrorModal('Choose a valid image file.');
      event.target.value = '';
      return;
    }
    compressImageFile(file).then((photoDataUrl) => {
      const currentData = loadData();
      const currentUsers = role === 'student' ? currentData.students : role === 'teacher' ? currentData.teachers : currentData.admin;
      const savedUser = currentUsers.find((item) => item.id === user.id);
      if (!savedUser) return;
      savedUser.photoDataUrl = photoDataUrl;
      recordActivity(currentData, savedUser.name, role.charAt(0).toUpperCase() + role.slice(1), 'Updated profile photo');
      try {
        saveData(currentData);
        updatePhoto(savedUser.photoDataUrl);
        message.textContent = 'Profile photo updated.';
      } catch (error) {
        showErrorModal('There is not enough browser storage for this photo.');
      }
    }).catch((error) => {
      showErrorModal(error.message);
    });
  });
}

function renderStudentSubjects() {
  const data = loadData();
  const list = document.getElementById('subjectsList');
  list.innerHTML = getActiveSubjects(data).map((subject) => `
    <li class="list-item">
      <span>${subject}</span>
      <div class="row-actions">
        <button type="button" class="btn-secondary">View</button>
        <button type="button" class="btn-primary">Take CBT</button>
      </div>
    </li>
  `).join('');
}

function initCbtPage() {
  const data = loadData();
  const student = getCurrentStudent();
  const testId = new URLSearchParams(window.location.search).get('test');
  const availableSection = document.getElementById('availableCbtTests');
  const availableList = document.getElementById('availableCbtTestList');
  const questionPanel = document.querySelector('.question-panel');
  const emptyState = document.getElementById('cbtEmptyState');
  const timerWrap = document.getElementById('cbtTimerWrap');
  const availableTests = student ? getUpcomingCbtTests(student, data) : [];
  if (!student) {
    questionPanel.hidden = true;
    availableSection.hidden = true;
    emptyState.hidden = false;
    return;
  }
  if (!testId) {
    questionPanel.hidden = true;
    emptyState.hidden = true;
    timerWrap.hidden = true;
    availableSection.hidden = false;
    availableList.innerHTML = availableTests.length ? availableTests.map((test) => `
      <a class="list-item cbt-upcoming-item" href="student-cbt.html?test=${encodeURIComponent(test.id)}">
        <span class="cbt-upcoming-details">
          <strong>${escapeHtml(test.title)}</strong>
          <small>${escapeHtml(test.subject)} · ${test.questionCount} question${test.questionCount === 1 ? '' : 's'}</small>
        </span>
        <span class="cbt-start-link">Start test</span>
      </a>
    `).join('') : '<p class="empty-state">There are no CBT tests available for your class right now.</p>';
    return;
  }
  availableSection.hidden = true;
  timerWrap.hidden = false;
  const pageQuestions = (data.questions || []).filter((question) => testId
    && getCbtTestId(question) === testId
    && getActiveSubjects(data).some((subject) => subject.toLowerCase() === String(question.subject || '').toLowerCase())
    && normalizeClassName(question.className) === normalizeClassName(student.className));
  if (!pageQuestions.length) {
    questionPanel.hidden = true;
    emptyState.hidden = false;
    return;
  }
  const alreadyCompleted = (data.cbtResults || []).some((result) => result.studentId === student.id && result.testId === testId);
  if (alreadyCompleted) {
    questionPanel.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('h2').textContent = 'Test already completed';
    emptyState.querySelector('p').textContent = 'You have already submitted this CBT. View your result and missed questions on the CBT Results page.';
    emptyState.insertAdjacentHTML('beforeend', ' <a class="btn btn-secondary" href="student-cbt-result.html">View result</a>');
    return;
  }
  questionPanel.hidden = false;
  const testTitle = pageQuestions[0].testTitle.trim();
  const subject = pageQuestions[0].subject;
  document.getElementById('cbtPageTitle').textContent = testTitle;
  const state = {
    questions: pageQuestions,
    testId,
    testTitle,
    subject,
    currentIndex: 0,
    selected: {},
    durationSeconds: pageQuestions.length * 60,
    startedAt: Date.now()
  };

  renderQuestion(state);
  const timerText = document.getElementById('timerText');
  const deadline = state.startedAt + state.durationSeconds * 1000;
  const timer = setInterval(() => {
    const timeLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (timeLeft === 0) {
      clearInterval(timer);
      submitCbt(state);
    }
  }, 1000);
  timerText.textContent = `${String(pageQuestions.length).padStart(2, '0')}:00`;

  document.getElementById('previousQuestion').addEventListener('click', () => {
    state.currentIndex = Math.max(0, state.currentIndex - 1);
    renderQuestion(state);
  });

  document.getElementById('nextQuestion').addEventListener('click', () => {
    state.currentIndex = Math.min(state.questions.length - 1, state.currentIndex + 1);
    renderQuestion(state);
  });

  document.getElementById('submitTest').addEventListener('click', () => {
    openModal('confirmSubmitModal');
  });

  document.getElementById('confirmSubmit').addEventListener('click', async () => {
    clearInterval(timer);
    if (await submitCbt(state)) closeModal('confirmSubmitModal');
  });

  document.getElementById('cancelSubmit').addEventListener('click', () => closeModal('confirmSubmitModal'));
}

function submitCbt(state) {
  if (state.submitted) return true;
  state.submitted = true;
  const result = computeCbtResult(state);
  const data = loadData();
  data.cbtResults = data.cbtResults || [];
  const previousResult = data.cbtResults.findIndex((item) => item.studentId === result.studentId && item.testId === result.testId);
  if (previousResult === -1) data.cbtResults.push(result);
  else data.cbtResults[previousResult] = result;
  addPortalNotification(data, getCurrentStudent(), 'cbt_result_ready',
    `Your ${result.subject} CBT result is ready.`, result.student);
  recordActivity(data, result.student, 'Student', `Completed ${result.testTitle}`);
  saveData(data);
  (window.PortalSync ? window.PortalSync.flush() : Promise.resolve()).then(() => {
    window.location.href = 'student-cbt-result.html';
  });
  return true;
}

function renderQuestion(state) {
  const question = state.questions[state.currentIndex];
  const current = `${state.currentIndex + 1} of ${state.questions.length}`;
  document.getElementById('questionIndexText').textContent = `Question ${current}`;
  document.getElementById('questionText').textContent = `${state.currentIndex + 1}. ${question.question}`;
  document.getElementById('questionSubject').textContent = `${state.testTitle} · ${state.subject}`;

  const options = document.getElementById('questionOptions');
  options.innerHTML = question.options.map((option, index) => {
    const label = ['A', 'B', 'C', 'D'][index];
    const selected = state.selected[state.currentIndex] === label ? 'selected' : '';
    return `
      <button class="option-button ${selected}" type="button" data-option="${label}">
        <span class="option-letter">${label}.</span>
        <span>${option}</span>
      </button>
    `;
  }).join('');

  const nav = document.getElementById('questionNav');
  nav.innerHTML = state.questions.map((item, index) => `
    <button type="button" class="question-number ${index === state.currentIndex ? 'active' : ''}" data-index="${index}">${index + 1}</button>
  `).join('');

  nav.querySelectorAll('.question-number').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentIndex = Number(button.dataset.index);
      renderQuestion(state);
    });
  });

  document.querySelectorAll('.option-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selected[state.currentIndex] = button.dataset.option;
      renderQuestion(state);
    });
  });
}

function computeCbtResult(state) {
  const questions = state.questions;
  let score = 0;
  questions.forEach((question, index) => {
    if (state.selected[index] === question.answer) score += 1;
  });

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);
  const questionReview = questions.map((question, index) => ({
    question: question.question,
    options: question.options || [],
    selectedAnswer: state.selected[index] || '',
    correctAnswer: question.answer
  }));

  return {
    studentId: getCurrentStudent().id,
    student: getCurrentStudent().name,
    className: getCurrentStudent().className,
    testId: state.testId,
    testTitle: state.testTitle,
    subject: state.subject,
    score,
    total,
    percentage,
    correct: score,
    wrong: total - score,
    questionReview,
    timeUsedSeconds: Math.min(state.durationSeconds, Math.floor((Date.now() - state.startedAt) / 1000)),
    date: new Date().toLocaleDateString(),
    takenAt: new Date().toISOString()
  };
}

function renderCbtResult() {
  const student = getCurrentStudent();
  const results = (loadData().cbtResults || [])
    .filter((result) => result.studentId === student.id)
    .sort((a, b) => new Date(b.takenAt || b.date || 0).getTime() - new Date(a.takenAt || a.date || 0).getTime());
  const result = results[0];
  const emptyState = document.getElementById('cbtNoResults');
  const resultCard = document.getElementById('cbtResultCard');
  emptyState.hidden = Boolean(result);
  resultCard.hidden = !result;
  if (!result) return;

  document.getElementById('resultSubject').textContent = result.testTitle || result.subject || 'CBT';
  document.getElementById('resultScore').textContent = `${result.score} / ${result.total}`;
  document.getElementById('resultPercentage').textContent = `${result.percentage}%`;
  document.getElementById('correctAnswers').textContent = String(result.correct ?? result.score);
  document.getElementById('wrongAnswers').textContent = String(result.wrong ?? Math.max(result.total - result.score, 0));
  document.getElementById('timeUsed').textContent = formatCbtDuration(result.timeUsedSeconds ?? parseInt(result.timeUsed, 10) * 60);
  document.getElementById('resultDate').textContent = result.date || '';
  const review = document.getElementById('cbtQuestionReview');
  const missedQuestions = (result.questionReview || [])
    .filter((item) => item.selectedAnswer !== item.correctAnswer);
  review.innerHTML = missedQuestions.length ? `
    <h3>Questions to review</h3>
    ${missedQuestions.map((item, index) => {
      const selected = item.selectedAnswer ? `${item.selectedAnswer}. ${item.options['ABCD'.indexOf(item.selectedAnswer)] || ''}` : 'Not answered';
      const correct = `${item.correctAnswer}. ${item.options['ABCD'.indexOf(item.correctAnswer)] || ''}`;
      return `<article class="cbt-review-question">
        <p><strong>${index + 1}. ${escapeHtml(item.question)}</strong></p>
        <p>Your answer: ${escapeHtml(selected)}</p>
        <p class="cbt-correct-answer">Correct answer: ${escapeHtml(correct)}</p>
      </article>`;
    }).join('')}
  ` : result.questionReview?.length
    ? '<p class="empty-state">Well done! You answered every question correctly.</p>'
    : '<p class="muted">Answer review is available for tests completed after the portal update.</p>';
}

function formatCbtDuration(seconds) {
  const elapsed = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(elapsed / 60);
  const remainingSeconds = elapsed % 60;
  if (!minutes) return `${remainingSeconds} seconds`;
  return remainingSeconds ? `${minutes} minute${minutes === 1 ? '' : 's'} ${remainingSeconds} seconds` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const REPORT_AFFECTIVE = ['Punctuality', 'Politeness', 'Neatness', 'Honesty', 'Leadership Skill', 'Cooperation', 'Attentiveness', 'Perseverance', 'Attitude to Work'];
const REPORT_PSYCHOMOTOR = ['Handwriting', 'Verbal Fluency', 'Sports', 'Handling Tools', 'Drawing & Painting'];
const REPORT_GRADING = [['A', '80-100'], ['B', '60-79'], ['C', '55-59'], ['D', '45-54'], ['F', '0-44']];
const CA_MAX = 20;
const EXAM_MAX = 60;
const calculateAcademicTotal = (ca1, ca2, exam) => Math.round((ca1 + ca2 + exam + Number.EPSILON) * 100) / 100;
const isValidAcademicScore = (score, maximum) => Number.isFinite(score) && score >= 0 && score <= maximum
  && score === Number(score.toFixed(2));

// Report card grading (A 80-100, B 60-79, C 55-59, D 45-54, F 0-44). Separate from getGrade() so other pages are unaffected.
function getReportGrade(total) {
  if (total >= 80) return 'A';
  if (total >= 60) return 'B';
  if (total >= 55) return 'C';
  if (total >= 45) return 'D';
  return 'F';
}

function ordinal(number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = number % 100;
  return number + (suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]);
}

function formatLongDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (!isoDate || Number.isNaN(date.getTime())) return '';
  return `${ordinal(date.getDate())} ${date.toLocaleString('en-GB', { month: 'short' })} ${date.getFullYear()}`;
}

function getStudentAge(dateOfBirth) {
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (!dateOfBirth || Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}

function getReportDetails(data, studentId, term, session) {
  return (data.reportDetails || {})[[studentId, term, session].join('|')] || {};
}

function getReportMeta(data, className, term, session) {
  return (data.reportMeta || {})[[normalizeClassName(className), term, session].join('|')] || {};
}

function calculateDaysAbsent(daysInTerm, daysPresent) {
  if (daysInTerm === undefined || daysInTerm === null || daysInTerm === ''
    || daysPresent === undefined || daysPresent === null || daysPresent === '') return '';
  const total = Number(daysInTerm);
  const present = Number(daysPresent);
  return Number.isFinite(total) && Number.isFinite(present) ? Math.max(total - present, 0) : '';
}

// Class positions, subject position/highest/lowest/average for one student's class, term and session.
function getClassReportStats(data, student, term, session) {
  const className = normalizeClassName(student.className);
  const classmates = data.students.filter((item) => normalizeClassName(item.className) === className && item.status !== 'Inactive');
  const studentById = new Map(classmates.map((item) => [item.id, item]));
  const rows = data.academicResults.filter((result) => studentById.has(result.studentId)
    && result.term === term
    && (result.session || studentById.get(result.studentId).session) === session);
  const bySubject = new Map();
  const byStudent = new Map();
  rows.forEach((result) => {
    const total = Number(result.total || 0);
    if (!bySubject.has(result.subject)) bySubject.set(result.subject, []);
    bySubject.get(result.subject).push({ studentId: result.studentId, total });
    if (!byStudent.has(result.studentId)) byStudent.set(result.studentId, []);
    byStudent.get(result.studentId).push(total);
  });
  const subjectStats = new Map();
  bySubject.forEach((entries, subject) => {
    const totals = entries.map((entry) => entry.total);
    const mine = entries.find((entry) => entry.studentId === student.id);
    subjectStats.set(subject, {
      position: mine ? 1 + totals.filter((total) => total > mine.total).length : null,
      highest: Math.max(...totals),
      lowest: Math.min(...totals),
      average: Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length)
    });
  });
  const averages = [...byStudent.entries()].map(([id, totals]) => ({ id, average: totals.reduce((sum, total) => sum + total, 0) / totals.length }));
  const mineOverall = averages.find((entry) => entry.id === student.id);
  return {
    classSize: classmates.length,
    subjectStats,
    overallPosition: mineOverall ? 1 + averages.filter((entry) => entry.average > mineOverall.average).length : null
  };
}

// Builds the full report card HTML for one student/term/session. Used by the student and admin pages.
function buildReportCardHtml(data, student, term, session) {
  const results = data.academicResults.filter((item) => item.studentId === student.id);
  const cell = (value) => (value === undefined || value === null || value === '' ? '—' : escapeHtml(value));
  const skillTable = (title, labels, scores) => `
    <table class="rc-panel">
      <thead><tr><th colspan="2">${title}</th></tr></thead>
      <tbody>${labels.map((label) => `<tr><td>${escapeHtml(label)}</td><td class="rc-score">${cell((scores || {})[label])}</td></tr>`).join('')}</tbody>
    </table>`;

  const settings = data.settings || {};
  const activeSubjects = getActiveSubjects(data);
  const rows = activeSubjects
    .map((subject) => results.find((item) => item.subject === subject && item.term === term && (item.session || student.session) === session))
    .filter(Boolean);
  const stats = getClassReportStats(data, student, term, session);
  const details = getReportDetails(data, student.id, term, session);
  const meta = getReportMeta(data, student.className, term, session);
  const classTeacher = data.teachers.find((teacher) => normalizeClassName(teacher.className) === normalizeClassName(student.className)
    || (Array.isArray(teacher.assignedClasses) && teacher.assignedClasses.map(normalizeClassName).includes(normalizeClassName(student.className))));

  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const average = rows.length ? total / rows.length : 0;
  const termDayValue = meta.daysInTerm;
  const presentDayValue = details.daysPresent;
  const daysInTerm = termDayValue === undefined || termDayValue === '' || !Number.isFinite(Number(termDayValue))
    ? '' : Number(termDayValue);
  const daysPresent = presentDayValue === undefined || presentDayValue === '' || !Number.isFinite(Number(presentDayValue))
    ? '' : Number(presentDayValue);
  const daysAbsent = calculateDaysAbsent(daysInTerm, daysPresent);
  const reportValue = (value) => value === undefined || value === null || value === '' ? 'Not entered' : escapeHtml(value);
  const gender = student.gender ? `<span>Gender: <b>${escapeHtml(student.gender)}</b></span><i> | </i>` : '';
  const age = getStudentAge(student.dateOfBirth);

  const subjectRows = rows.length ? rows.map((item) => {
    const subjectStat = stats.subjectStats.get(item.subject) || {};
    const itemTotal = Number(item.total || 0);
    return `<tr>
      <td>${escapeHtml(item.subject)}</td>
      <td>${cell(item.ca1 !== undefined ? item.ca1 : item.ca)}</td>
      <td>${cell(item.ca2)}</td>
      <td>${cell(item.exam)}</td>
      <td><b>${itemTotal}</b></td>
      <td>${getReportGrade(itemTotal)}</td>
      <td>${subjectStat.position ? ordinal(subjectStat.position) : '—'}</td>
      <td>${cell(subjectStat.highest)}</td>
      <td>${cell(subjectStat.lowest)}</td>
      <td>${cell(subjectStat.average)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="empty-state">No academic results have been recorded.</td></tr>';

  const vertical = ['1st CA (20)', '2nd CA (20)', 'Exam (60)', 'Total (100)', 'Grade', 'Subject Position', 'Subject Highest', 'Subject Lowest', 'Subject Average']
    .map((label) => `<th class="rc-vert"><span>${label}</span></th>`).join('');

  return `
      <header class="rc-head">
        <div>${settings.logoDataUrl ? `<img class="rc-logo" src="${settings.logoDataUrl}" alt="School logo" />` : ''}</div>
        <div>
          <h2 class="rc-school">${escapeHtml(settings.schoolName || 'School Name')}</h2>
          ${settings.motto ? `<p class="rc-line">Motto: ${escapeHtml(settings.motto)}</p>` : ''}
          ${settings.address ? `<p class="rc-line"><i>${escapeHtml(settings.address)}</i></p>` : ''}
          ${settings.phone || settings.email ? `<p class="rc-line">${settings.phone ? `TEL: ${escapeHtml(settings.phone)}` : ''}${settings.phone && settings.email ? ', ' : ''}${settings.email ? `EMAIL: ${escapeHtml(settings.email)}` : ''}</p>` : ''}
          <p class="rc-title">«« STUDENT'S ACADEMIC REPORT CARD»»</p>
        </div>
        <div class="rc-photo-wrap">
          ${student.photoDataUrl ? `<img class="rc-photo" src="${student.photoDataUrl}" alt="Student photo" />` : '<div class="rc-photo rc-photo-empty">Photo</div>'}
          <strong class="rc-position">${stats.overallPosition ? ordinal(stats.overallPosition) : ''}</strong>
        </div>
      </header>
      <h3 class="rc-name">${escapeHtml(student.name)}</h3>
      <p class="rc-idline">${gender}<span>Admission Number: <b>${escapeHtml(student.id)}</b></span><i> | </i><span>Age: <b>${reportValue(age)}</b></span></p>
      <div class="rc-info">
        <div><p>Term: <b>${escapeHtml(term)}</b></p><p>Session: <b>${escapeHtml(session)}</b></p><p>Resumption: <b>${reportValue(formatLongDate(meta.resumption))}</b></p></div>
        <div><p>Class: <b>${escapeHtml(normalizeClassName(student.className))}</b></p><p>Students in Class: <b>${stats.classSize}</b></p><p>Class Teacher: <b>${reportValue(classTeacher?.name)}</b></p></div>
        <div><p>Total Days In Term: <b>${reportValue(daysInTerm)}</b></p><p>Total Days Present: <b>${reportValue(daysPresent)}</b></p><p>Total Days Absent: <b>${reportValue(daysAbsent)}</b></p></div>
      </div>
      <div class="rc-body">
        ${settings.logoDataUrl ? `<img class="rc-watermark" src="${settings.logoDataUrl}" alt="" />` : ''}
        <div class="rc-table-wrap">
          <table class="rc-table">
            <thead><tr><th class="rc-subject-head">SUBJECTS</th>${vertical}</tr></thead>
            <tbody>${subjectRows}</tbody>
          </table>
        </div>
        <aside class="rc-side">
          ${skillTable('AFFECTIVE SKILLS', REPORT_AFFECTIVE, details.affective)}
          ${skillTable('PSYCHOMOTOR SKILLS', REPORT_PSYCHOMOTOR, details.psychomotor)}
          <table class="rc-panel">
            <thead><tr><th colspan="2">GRADING SYSTEM</th></tr></thead>
            <tbody>${REPORT_GRADING.map(([grade, range]) => `<tr><td class="rc-score">${grade}</td><td>${range}</td></tr>`).join('')}</tbody>
          </table>
        </aside>
      </div>
      <div class="rc-bottom">
        <div>
          <table class="rc-summary">
            <thead><tr><th colspan="3">SUMMARY</th></tr></thead>
            <tbody><tr>
              <td>TOTAL SCORE: <b>${rows.length ? `${total} / ${rows.length * 100}` : ''}</b></td>
              <td>AVG. SCORE: <b>${rows.length ? `${average.toFixed(1)} %` : ''}</b></td>
              <td>GRADE: <b>${rows.length ? getReportGrade(average) : ''}</b></td>
            </tr></tbody>
          </table>
          <p class="rc-remark">CLASS TEACHER REMARKS: <u>${escapeHtml(details.teacherRemark || '')}</u></p>
          <p class="rc-remark">SCHOOL HEAD REMARKS: <u>${escapeHtml(details.headRemark || '')}</u></p>
        </div>
        <div class="rc-stamp"><strong>SIGNATURE / STAMP</strong><div>${settings.stampDataUrl ? `<img src="${escapeHtml(settings.stampDataUrl)}" alt="School stamp or signature" />` : ''}</div></div>
      </div>
      ${meta.parentsNote ? `<p class="rc-parents"><b>INFO TO PARENTS:</b> ${escapeHtml(meta.parentsNote)}</p>` : ''}
    `;
}

function renderAcademicResultsPage() {
  logActivity('Viewed academic results');
  const student = getCurrentStudent();
  const data = loadData();
  const termSelect = document.getElementById('termSelect');
  const sessionSelect = document.getElementById('resultSessionSelect');
  const card = document.getElementById('reportCard');
  if (!student) {
    card.innerHTML = '<p class="empty-state">No student record found.</p>';
    return;
  }
  const results = data.academicResults.filter((item) => item.studentId === student.id);
  const sessions = [...new Set([student.session, ...results.map((item) => item.session).filter(Boolean)])].filter(Boolean);
  sessionSelect.innerHTML = sessions.map((session) => `<option value="${escapeHtml(session)}">${escapeHtml(session)}</option>`).join('');

  const renderCard = () => {
    card.innerHTML = buildReportCardHtml(data, student, termSelect.value, sessionSelect.value);
  };

  termSelect.addEventListener('change', renderCard);
  sessionSelect.addEventListener('change', renderCard);
  document.getElementById('downloadResult').addEventListener('click', () => {
    downloadElementPdf(card, `report-card-${student.name}-${termSelect.value}-${sessionSelect.value}.pdf`, 'portrait', null, 600);
  });
  renderCard();
}

async function downloadElementPdf(element, filename, orientation = 'portrait', button, captureWidth) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!element || !window.html2canvas || !JsPdf) {
    showErrorModal('PDF download is unavailable. Refresh the page and try again.');
    return;
  }
  const wasDisabled = button?.disabled;
  const captureKey = `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  element.dataset.pdfCapture = captureKey;
  if (button) button.disabled = true;
  try {
    const renderWidth = captureWidth || element.scrollWidth;
    const canvas = await window.html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: renderWidth,
      windowWidth: Math.max(document.documentElement.clientWidth, renderWidth, 761),
      onclone: (clonedDocument) => {
        const clone = clonedDocument.querySelector(`[data-pdf-capture="${captureKey}"]`);
        if (clone) {
          clone.style.width = `${renderWidth}px`;
          clone.style.maxWidth = 'none';
          clone.style.overflow = 'visible';
          if (clone.matches('.report-card')) {
            clone.style.margin = '0';
            clone.style.padding = '10px 12px';
            clone.style.fontSize = '10px';
            clone.style.boxSizing = 'border-box';
            const printStyles = clonedDocument.createElement('style');
            printStyles.textContent = `
              .report-card .rc-body, .report-card .rc-bottom {
                grid-template-columns: minmax(0, 1fr) 180px !important;
                gap: 6px !important;
              }
              .report-card .rc-table th, .report-card .rc-table td,
              .report-card .rc-panel th, .report-card .rc-panel td,
              .report-card .rc-summary th, .report-card .rc-summary td {
                padding: 2px 4px !important;
                font-size: 9.5pt !important;
              }
              .report-card .rc-table-wrap { overflow: visible !important; }
            `;
            clonedDocument.head.appendChild(printStyles);
          }
        }
      }
    });
    const pdf = new JsPdf({ orientation, unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;
    const imageX = (pageWidth - imageWidth) / 2;
    const imageY = (pageHeight - imageHeight) / 2;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', imageX, imageY, imageWidth, imageHeight, undefined, 'FAST');
    pdf.save(filename.replace(/[<>:"\/\\|?*]+/g, '-').replace(/\s+/g, '-'));
  } catch (error) {
    console.error('Could not generate the report PDF:', error);
    showErrorModal(`Could not download the report PDF: ${error.message}`);
  } finally {
    delete element.dataset.pdfCapture;
    if (button) button.disabled = Boolean(wasDisabled);
  }
}

function renderTeacherDashboard() {
  const teacher = getCurrentTeacher();
  const data = loadData();
  const assignedClasses = getTeacherAssignedClasses(teacher, data);
  const assignedClassKeys = new Set(assignedClasses.map(normalizeClassName));
  const activeClasses = getActiveClasses(data).filter((className) => assignedClassKeys.has(normalizeClassName(className)));
  const students = data.students.filter((student) => student.status !== 'Inactive'
    && assignedClassKeys.has(normalizeClassName(student.className)));
  const subjects = getTeacherAssignedSubjects(teacher, data);
  const tests = new Set(data.questions.filter((question) => activeClasses.includes(normalizeClassName(question.className))
    && subjects.some((subject) => subject.toLowerCase() === String(question.subject || '').toLowerCase())
    && String(question.testTitle || '').trim()).map(getCbtTestId));
  document.getElementById('teacherWelcome').textContent = teacher.name;
  document.getElementById('teacherClassCount').textContent = String(activeClasses.length);
  document.getElementById('teacherSubjectCount').textContent = String(subjects.length);
  document.getElementById('teacherStudentCount').textContent = String(students.length);
  document.getElementById('teacherCbtCount').textContent = String(tests.size);
  const teacherPhoto = document.getElementById('teacherDashboardPhoto');
  teacherPhoto.hidden = !teacher.photoDataUrl;
  if (teacher.photoDataUrl) teacherPhoto.src = teacher.photoDataUrl;

  const subjectList = document.getElementById('teacherSubjectList');
  subjectList.innerHTML = subjects.length
    ? subjects.map((item) => `<li class="list-item"><span>${escapeHtml(item)}</span></li>`).join('')
    : '<li class="list-item empty-state">No active subjects assigned.</li>';

  const classList = document.getElementById('teacherClassList');
  classList.innerHTML = activeClasses.length
    ? activeClasses.map((className) => {
      const classStudentCount = students.filter((student) =>
        normalizeClassName(student.className) === normalizeClassName(className)).length;
      return `<li class="list-item"><span>${escapeHtml(className)}</span><strong>${classStudentCount} student${classStudentCount === 1 ? '' : 's'}</strong></li>`;
    }).join('')
    : '<li class="list-item empty-state">No active classes assigned.</li>';

}

function renderTeacherStudents() {
  const table = document.getElementById('teacherStudentsTableBody');
  const data = loadData();
  const teacher = getCurrentTeacher();
  const assignedClasses = getTeacherAssignedClasses(teacher);
  const students = data.students.filter((student) => teacherCanAccessClass(student.className, teacher));

  function renderRows(rows) {
    table.innerHTML = rows.map((student) => `
      <tr>
        <td>${student.photoDataUrl ? `<img class="student-table-photo" src="${student.photoDataUrl}" alt="">` : '<span class="student-table-photo-placeholder">-</span>'}</td>
        <td>${escapeHtml(student.id)}</td>
        <td>${escapeHtml(student.name)}</td>
        <td>${escapeHtml(student.dateOfBirth || 'Not provided')}</td>
        <td>${escapeHtml(student.className)}</td>
        <td>${escapeHtml(student.session || 'Not provided')}</td>
        <td><span class="badge success">${escapeHtml(student.status)}</span></td>
      </tr>
    `).join('');
  }

  const search = document.getElementById('teacherStudentSearch');
  const filter = document.getElementById('teacherClassFilter');
  const availableClasses = getActiveClasses(data).filter((className) => assignedClasses.includes(className));
  filter.innerHTML = `<option value="">All assigned classes</option>${availableClasses.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('')}`;
  search.addEventListener('input', () => renderRows(filterStudents(students, search.value, filter.value)));
  filter.addEventListener('change', () => renderRows(filterStudents(students, search.value, filter.value)));
  renderRows(students);
}

function filterStudents(students, searchValue, classFilter) {
  return students.filter((student) => {
    const matchesText = !searchValue || student.name.toLowerCase().includes(searchValue.toLowerCase()) || student.id.toLowerCase().includes(searchValue.toLowerCase());
    const matchesClass = !classFilter || classFilter === 'All' || student.className === classFilter;
    return matchesText && matchesClass;
  });
}

function renderTeacherSubjects() {
  const list = document.getElementById('teacherSubjectsList');
  const teacher = getCurrentTeacher();
  const subjects = getTeacherAssignedSubjects(teacher, loadData());
  list.innerHTML = subjects.length
    ? subjects.map((subject) => `<li class="list-item"><span>${escapeHtml(subject)}</span></li>`).join('')
    : '<li class="list-item empty-state">No active subjects are allocated to your account.</li>';
}

function renderEnterScoresPage() {
  const tableHead = document.getElementById('scoreTableHead');
  const table = document.getElementById('scoreTableBody');
  const classSelect = document.getElementById('scoreClassSelect');
  const studentSelect = document.getElementById('scoreStudentSelect');
  const termSelect = document.getElementById('scoreTermSelect');
  const sessionSelect = document.getElementById('scoreSessionSelect');
  const sheet = document.getElementById('scoreSheet');
  const empty = document.getElementById('scoreEmpty');
  const detailsBox = document.getElementById('reportDetails');
  const status = document.getElementById('scoreSaveStatus');
  const teacher = getCurrentTeacher();
  const data = loadData();
  const assignedClasses = getTeacherAssignedClasses(teacher, data);
  const subjects = getTeacherAssignedSubjects(teacher, data);
  const sessions = getSessions(data);

  classSelect.innerHTML = assignedClasses.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  sessionSelect.innerHTML = sessions.map((session) => `<option value="${escapeHtml(session)}">${escapeHtml(session)}</option>`).join('');
  if (sessions.length) sessionSelect.value = getCurrentSession(data);

  function fillStudents() {
    const list = loadData().students.filter((student) => normalizeClassName(student.className) === classSelect.value && student.status === 'Active');
    studentSelect.innerHTML = list.map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} (${escapeHtml(student.id)})</option>`).join('');
  }

  const currentStudent = () => loadData().students.find((student) => student.id === studentSelect.value);
  const numberValue = (value) => (value === undefined || value === null ? '' : escapeHtml(value));

  function skillSelects(group, labels, saved) {
    return labels.map((label) => `
      <div><label>${escapeHtml(label)}</label>
        <select data-skill-group="${group}" data-skill="${escapeHtml(label)}">
          <option value=""></option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${String((saved || {})[label]) === String(n) ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>`).join('');
  }

  function renderSheet() {
    const student = currentStudent();
    if (!assignedClasses.length || !subjects.length || !student) {
      sheet.hidden = true;
      empty.hidden = false;
      empty.textContent = !subjects.length ? 'No active subjects are assigned to your account.'
        : !assignedClasses.length ? 'No classes are assigned to your account.'
          : 'No active students in this class.';
      return;
    }
    empty.hidden = true;
    sheet.hidden = false;
    const latest = loadData();
    const term = termSelect.value;
    const session = sessionSelect.value;
    tableHead.innerHTML = `<tr><th>Subject</th><th>1st CA (${CA_MAX})</th><th>2nd CA (${CA_MAX})</th><th>Exam (${EXAM_MAX})</th><th>Total (100)</th><th>Grade</th></tr>`;
    table.innerHTML = subjects.map((subject) => {
      const saved = latest.academicResults.find((result) => result.studentId === student.id
        && result.subject === subject && result.term === term && (result.session || student.session) === session);
      const first = saved ? (saved.ca1 !== undefined ? saved.ca1 : saved.ca) : '';
      const label = `${student.name} ${subject}`;
      const scoreDraftKey = `score:${student.id}:${session}:${term}:${subject}`;
      return `<tr data-subject-row="${escapeHtml(subject)}">
        <td data-label="Subject">${escapeHtml(subject)}</td>
        <td data-label="1st CA (${CA_MAX})"><input type="number" min="0" max="${CA_MAX}" step="0.01" value="${numberValue(first)}" data-field="ca1" data-draft-key="${escapeHtml(`${scoreDraftKey}:ca1`)}" aria-label="${escapeHtml(label)} 1st CA" /></td>
        <td data-label="2nd CA (${CA_MAX})"><input type="number" min="0" max="${CA_MAX}" step="0.01" value="${numberValue(saved?.ca2)}" data-field="ca2" data-draft-key="${escapeHtml(`${scoreDraftKey}:ca2`)}" aria-label="${escapeHtml(label)} 2nd CA" /></td>
        <td data-label="Exam (${EXAM_MAX})"><input type="number" min="0" max="${EXAM_MAX}" step="0.01" value="${numberValue(saved?.exam)}" data-field="exam" data-draft-key="${escapeHtml(`${scoreDraftKey}:exam`)}" aria-label="${escapeHtml(label)} exam" /></td>
        <td data-field="total" data-label="Total (100)">${saved ? escapeHtml(saved.total) : '—'}</td>
        <td data-field="grade" data-label="Grade">${saved ? getReportGrade(Number(saved.total)) : '—'}</td>
      </tr>`;
    }).join('');

    const details = getReportDetails(latest, student.id, term, session);
    const meta = getReportMeta(latest, student.className, term, session);
    detailsBox.innerHTML = `
      <fieldset><legend>Class details (same for every student in ${escapeHtml(classSelect.value)}, ${escapeHtml(term)})</legend>
        <p class="muted">Enter the term dates here; these details appear on each student's report card.</p>
        <div class="rd-grid">
          <div><label for="rdDaysInTerm">Total days in term</label><input id="rdDaysInTerm" type="number" min="0" value="${numberValue(meta.daysInTerm)}" /></div>
          <div><label for="rdResumption">Resumption date</label><input id="rdResumption" type="date" value="${escapeHtml(meta.resumption || '')}" /></div>
          <div style="grid-column: 1 / -1;"><label for="rdParentsNote">Info to parents</label><textarea id="rdParentsNote" rows="2">${escapeHtml(meta.parentsNote || '')}</textarea></div>
        </div>
      </fieldset>
      <fieldset><legend>${escapeHtml(student.name)}: attendance and remarks</legend>
        <p class="muted">Attendance, remarks, and skills are saved with this student's results.</p>
        <div class="rd-grid">
          <div><label for="rdDaysPresent">Total days present</label><input id="rdDaysPresent" type="number" min="0" value="${numberValue(details.daysPresent)}" /></div>
          <div><label for="rdDaysAbsent">Total days absent</label><input id="rdDaysAbsent" type="number" min="0" value="${numberValue(calculateDaysAbsent(meta.daysInTerm, details.daysPresent))}" readonly aria-live="polite" /></div>
          <div style="grid-column: 1 / -1;"><label for="rdTeacherRemark">Class teacher remarks</label><input id="rdTeacherRemark" type="text" value="${escapeHtml(details.teacherRemark || '')}" /></div>
          <div style="grid-column: 1 / -1;"><label for="rdHeadRemark">School head remarks</label><input id="rdHeadRemark" type="text" value="${escapeHtml(details.headRemark || '')}" /></div>
        </div>
      </fieldset>
      <fieldset><legend>Affective skills (1 to 5)</legend><div class="rd-grid">${skillSelects('affective', REPORT_AFFECTIVE, details.affective)}</div></fieldset>
      <fieldset><legend>Psychomotor skills (1 to 5)</legend><div class="rd-grid">${skillSelects('psychomotor', REPORT_PSYCHOMOTOR, details.psychomotor)}</div></fieldset>
    `;
    updateAbsent();
  }

  function updateAbsent() {
    const days = document.getElementById('rdDaysInTerm');
    const present = document.getElementById('rdDaysPresent');
    const absent = document.getElementById('rdDaysAbsent');
    if (!days || !present || !absent) return;
    const daysAbsent = calculateDaysAbsent(days.value, present.value);
    absent.value = daysAbsent === '' ? '' : String(daysAbsent);
  }

  // Saves the scores and report details for the student on screen. Returns how many subjects were saved and which were invalid.
  function saveCurrent() {
    const student = currentStudent();
    const result = { saved: 0, invalid: [], student };
    if (!student) return result;
    const latest = loadData();
    const term = termSelect.value;
    const session = sessionSelect.value;
    table.querySelectorAll('tr[data-subject-row]').forEach((row) => {
      const subject = row.dataset.subjectRow;
      const raw = (field) => row.querySelector(`[data-field="${field}"]`).value;
      if (raw('ca1') === '' && raw('ca2') === '' && raw('exam') === '') return;
      const ca1 = Number(raw('ca1'));
      const ca2 = Number(raw('ca2'));
      const exam = Number(raw('exam'));
      const valid = raw('ca1') !== '' && raw('ca2') !== '' && raw('exam') !== ''
        && isValidAcademicScore(ca1, CA_MAX)
        && isValidAcademicScore(ca2, CA_MAX)
        && isValidAcademicScore(exam, EXAM_MAX);
      if (!valid) {
        result.invalid.push(subject);
        return;
      }
      const total = calculateAcademicTotal(ca1, ca2, exam);
      const previous = latest.academicResults.find((item) => item.studentId === student.id
        && item.subject === subject && item.term === term && (item.session || session) === session);
      if (!previous || Number(previous.ca1 ?? previous.ca) !== ca1
        || Number(previous.ca2 || 0) !== ca2 || Number(previous.exam) !== exam) {
        addPortalNotification(latest, student, 'academic_result',
          `${subject} academic result is ready.`, teacher.name);
      }
      upsertAcademicResult(latest, {
        studentId: student.id,
        name: student.name,
        className: student.className,
        session,
        subject,
        term,
        ca1,
        ca2,
        ca: ca1 + ca2,
        exam,
        total,
        grade: getReportGrade(total)
      });
      result.saved += 1;
    });

    const skills = (group) => Object.fromEntries([...detailsBox.querySelectorAll(`[data-skill-group="${group}"]`)]
      .filter((select) => select.value !== '').map((select) => [select.dataset.skill, Number(select.value)]));
    latest.reportDetails = latest.reportDetails || {};
    latest.reportDetails[[student.id, term, session].join('|')] = {
      daysPresent: document.getElementById('rdDaysPresent').value,
      teacherRemark: document.getElementById('rdTeacherRemark').value.trim(),
      headRemark: document.getElementById('rdHeadRemark').value.trim(),
      affective: skills('affective'),
      psychomotor: skills('psychomotor')
    };
    latest.reportMeta = latest.reportMeta || {};
    latest.reportMeta[[normalizeClassName(student.className), term, session].join('|')] = {
      daysInTerm: document.getElementById('rdDaysInTerm').value,
      resumption: document.getElementById('rdResumption').value,
      parentsNote: document.getElementById('rdParentsNote').value.trim()
    };
    if (result.saved) recordActivity(latest, teacher.name, 'Teacher', `Saved ${result.saved} subject results for ${student.name}`);
    saveData(latest);
    return result;
  }

  // Live total and grade while typing, plus absent-days calculation.
  sheet.addEventListener('input', (event) => {
    const row = event.target.closest('tr[data-subject-row]');
    if (row) {
      const values = ['ca1', 'ca2', 'exam'].map((field) => row.querySelector(`[data-field="${field}"]`).value);
      const complete = values.every((value) => value !== '');
      const scores = values.map(Number);
      const limits = [CA_MAX, CA_MAX, EXAM_MAX];
      const invalid = values.some((value, index) => value !== ''
        && !isValidAcademicScore(scores[index], limits[index]));
      const valid = complete && !invalid;
      row.classList.toggle('has-invalid-score', invalid);
      row.querySelectorAll('input[data-field]').forEach((input) => {
        input.setAttribute('aria-invalid', String(input.value !== '' && !input.validity.valid));
      });
      const total = valid ? calculateAcademicTotal(scores[0], scores[1], scores[2]) : null;
      row.querySelector('[data-field="total"]').textContent = valid ? String(total) : (invalid ? 'Check scores' : '—');
      row.querySelector('[data-field="grade"]').textContent = valid ? getReportGrade(total) : '—';
    }
    updateAbsent();
  });

  // Autosave whenever a field is committed.
  sheet.addEventListener('change', () => {
    const result = saveCurrent();
    if (result.invalid.length) {
      status.textContent = '';
      showErrorModal(`Enter all three scores for: ${result.invalid.join(', ')}. 1st CA and 2nd CA must be up to ${CA_MAX}; exam must be up to ${EXAM_MAX}.`);
      return;
    }
    status.textContent = `Autosaved scores and report details for ${result.student?.name || 'student'}.`;
  });

  classSelect.addEventListener('change', () => { fillStudents(); renderSheet(); });
  [studentSelect, termSelect, sessionSelect].forEach((select) => select.addEventListener('change', renderSheet));

  document.getElementById('saveScores').addEventListener('click', () => {
    const result = saveCurrent();
    if (result.invalid.length) {
      showErrorModal(`Enter valid scores for: ${result.invalid.join(', ')}.`);
      return;
    }
    showToast(`Report details saved for ${result.student?.name || 'student'}.`);
    status.textContent = result.saved
      ? `Saved ${result.saved} subject results and report details for ${result.student?.name || 'student'}.`
      : `Saved report details for ${result.student?.name || 'student'}.`;
    renderSheet();
  });

  document.getElementById('downloadCsvTemplate').addEventListener('click', () => {
    const data = loadData();
    const student = currentStudent();
    if (!student) {
      showErrorModal('Select a student before downloading their score template.');
      return;
    }

    const detail = getReportDetails(data, student.id, termSelect.value, sessionSelect.value);
    const meta = getReportMeta(data, student.className, termSelect.value, sessionSelect.value);
    const headers = [
      'studentId', 'studentName', 'class', 'subject', 'term', 'session', 'ca1', 'ca2', 'exam',
      'daysInTerm', 'resumptionDate', 'parentsNote', 'daysPresent', 'daysAbsent', 'teacherRemark', 'headRemark',
      ...REPORT_AFFECTIVE.map((skill) => `affective_${skill}`),
      ...REPORT_PSYCHOMOTOR.map((skill) => `psychomotor_${skill}`)
    ];
    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = subjects.map((subject) => {
      const saved = data.academicResults.find((result) => result.studentId === student.id
        && result.subject === subject && result.term === termSelect.value
        && (result.session || student.session) === sessionSelect.value);
      const daysInTerm = meta.daysInTerm ?? '';
      const daysPresent = detail.daysPresent ?? '';
      const daysAbsent = calculateDaysAbsent(daysInTerm, daysPresent);
      return [
        student.id, student.name, student.className, subject, termSelect.value, sessionSelect.value,
        saved?.ca1 ?? saved?.ca ?? '', saved?.ca2 ?? '', saved?.exam ?? '',
        daysInTerm, meta.resumption ?? '', meta.parentsNote ?? '',
        daysPresent, daysAbsent, detail.teacherRemark ?? '', detail.headRemark ?? '',
        ...REPORT_AFFECTIVE.map((skill) => detail.affective?.[skill] ?? ''),
        ...REPORT_PSYCHOMOTOR.map((skill) => detail.psychomotor?.[skill] ?? '')
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `score-template-${student.id}-${termSelect.value.replace(/\s+/g, '-')}-${sessionSelect.value.replace(/[^\w-]/g, '-')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById('scoreCsvFile').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result || ''));
        if (rows.length < 2) throw new Error('The CSV file has no score rows.');
        const normalizeHeader = (header) => header.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const headers = rows[0].map(normalizeHeader);
        const column = (name) => headers.indexOf(name);
        const required = ['studentid', 'subject', 'term', 'session', 'ca1', 'ca2', 'exam'];
        if (required.some((header) => column(header) === -1)) throw new Error('CSV needs studentId, subject, term, session, ca1, ca2, and exam columns.');
        const latest = loadData();
        let imported = 0;
        let reportDetailsImported = 0;
        let classDetailsImported = 0;
        let skipped = 0;
        rows.slice(1).forEach((values) => {
          const value = (header) => values[column(header)] || '';
          const student = latest.students.find((item) => item.id.toLowerCase() === value('studentid').toLowerCase());
          const studentName = value('studentname');
          const className = value('class');
          const subject = value('subject');
          const hasScores = ['ca1', 'ca2', 'exam'].some((header) => value(header) !== '');
          if (!student
            || (studentName && studentName.trim().toLowerCase() !== student.name.trim().toLowerCase())
            || (className && normalizeClassName(className) !== normalizeClassName(student.className))
            || !assignedClasses.includes(normalizeClassName(student.className))
            || !subjects.includes(subject) || !value('term') || !value('session')) {
            skipped += 1;
            return;
          }
          if (hasScores) {
            const ca1 = Number(value('ca1'));
            const ca2 = Number(value('ca2'));
            const exam = Number(value('exam'));
            if ([value('ca1'), value('ca2'), value('exam')].some((item) => item === '')
              || !isValidAcademicScore(ca1, CA_MAX)
              || !isValidAcademicScore(ca2, CA_MAX)
              || !isValidAcademicScore(exam, EXAM_MAX)) {
              skipped += 1;
              return;
            }
            const total = calculateAcademicTotal(ca1, ca2, exam);
            const previous = latest.academicResults.find((item) => item.studentId === student.id
              && item.subject === subject && item.term === value('term') && (item.session || value('session')) === value('session'));
            if (!previous || Number(previous.ca1 ?? previous.ca) !== ca1
              || Number(previous.ca2 || 0) !== ca2 || Number(previous.exam) !== exam) {
              addPortalNotification(latest, student, 'academic_result',
                `${subject} academic result is ready.`, teacher.name);
            }
            upsertAcademicResult(latest, {
              studentId: student.id,
              name: student.name,
              className: student.className,
              session: value('session'),
              subject,
              term: value('term'),
              ca1,
              ca2,
              ca: ca1 + ca2,
              exam,
              total,
              grade: getReportGrade(total)
            });
            imported += 1;
          }

          const reportHeaders = [
            'daysinterm', 'daysabsent', 'resumptiondate', 'parentsnote', 'dayspresent', 'teacherremark', 'headremark',
            ...REPORT_AFFECTIVE.map((skill) => normalizeHeader(`affective_${skill}`)),
            ...REPORT_PSYCHOMOTOR.map((skill) => normalizeHeader(`psychomotor_${skill}`))
          ];
          if (reportHeaders.some((header) => column(header) !== -1)) {
            const daysInTermValue = value('daysinterm');
            let daysPresentValue = value('dayspresent');
            const daysAbsentValue = value('daysabsent');
            const daysInTerm = daysInTermValue === '' ? '' : Number(daysInTermValue);
            const daysAbsent = daysAbsentValue === '' ? '' : Number(daysAbsentValue);
            if (daysPresentValue === '' && daysAbsent !== '' && daysInTerm !== ''
              && Number.isInteger(daysAbsent) && daysAbsent >= 0 && daysAbsent <= daysInTerm) {
              daysPresentValue = String(daysInTerm - daysAbsent);
            }
            const daysPresent = daysPresentValue === '' ? '' : Number(daysPresentValue);
            if ((daysInTerm !== '' && (!Number.isInteger(daysInTerm) || daysInTerm < 0))
              || (daysPresent !== '' && (!Number.isInteger(daysPresent) || daysPresent < 0))
              || (daysAbsent !== '' && (!Number.isInteger(daysAbsent) || daysAbsent < 0))
              || (daysInTerm !== '' && daysPresent !== '' && daysPresent > daysInTerm)
              || (daysInTerm !== '' && daysAbsent !== '' && daysAbsent > daysInTerm)
              || (daysInTerm !== '' && daysPresent !== '' && daysAbsent !== ''
                && daysPresent + daysAbsent !== daysInTerm)) {
              skipped += 1;
              return;
            }
            const skillValues = (group, skills) => {
              const next = { ...(group === 'affective'
                ? (getReportDetails(latest, student.id, value('term'), value('session')).affective || {})
                : (getReportDetails(latest, student.id, value('term'), value('session')).psychomotor || {})) };
              for (const skill of skills) {
                const header = normalizeHeader(`${group}_${skill}`);
                if (column(header) === -1) continue;
                const score = value(header);
                if (score === '') {
                  delete next[skill];
                  continue;
                }
                if (!/^[1-5]$/.test(score)) return null;
                next[skill] = Number(score);
              }
              return next;
            };
            const existingDetails = getReportDetails(latest, student.id, value('term'), value('session'));
            const affective = skillValues('affective', REPORT_AFFECTIVE);
            const psychomotor = skillValues('psychomotor', REPORT_PSYCHOMOTOR);
            if (!affective || !psychomotor) {
              skipped += 1;
              return;
            }
            latest.reportDetails = latest.reportDetails || {};
            latest.reportDetails[[student.id, value('term'), value('session')].join('|')] = {
              ...existingDetails,
              ...(column('dayspresent') !== -1 || column('daysabsent') !== -1 ? { daysPresent: daysPresentValue } : {}),
              ...(column('teacherremark') !== -1 ? { teacherRemark: value('teacherremark') } : {}),
              ...(column('headremark') !== -1 ? { headRemark: value('headremark') } : {}),
              ...(REPORT_AFFECTIVE.some((skill) => column(normalizeHeader(`affective_${skill}`)) !== -1) ? { affective } : {}),
              ...(REPORT_PSYCHOMOTOR.some((skill) => column(normalizeHeader(`psychomotor_${skill}`)) !== -1) ? { psychomotor } : {})
            };
            reportDetailsImported += 1;

            if (['daysinterm', 'resumptiondate', 'parentsnote'].some((header) => column(header) !== -1)) {
              const key = [normalizeClassName(student.className), value('term'), value('session')].join('|');
              const existingMeta = getReportMeta(latest, student.className, value('term'), value('session'));
              latest.reportMeta = latest.reportMeta || {};
              latest.reportMeta[key] = {
                ...existingMeta,
                ...(column('daysinterm') !== -1 ? { daysInTerm: daysInTermValue } : {}),
                ...(column('resumptiondate') !== -1 ? { resumption: value('resumptiondate') } : {}),
                ...(column('parentsnote') !== -1 ? { parentsNote: value('parentsnote') } : {})
              };
              classDetailsImported += 1;
            }
          }
        });
        if (!imported && !reportDetailsImported && !classDetailsImported) {
          showErrorModal(`No valid score or report-detail rows were imported${skipped ? `; ${skipped} row(s) were skipped` : ''}.`);
          return;
        }
        if (imported) recordActivity(latest, teacher.name, 'Teacher', `Imported ${imported} academic subject results`);
        if (reportDetailsImported || classDetailsImported) {
          recordActivity(latest, teacher.name, 'Teacher', 'Imported attendance and report details from CSV');
        }
        saveData(latest);
        renderSheet();
        const importedSummary = [
          imported ? `${imported} score row(s)` : '',
          reportDetailsImported ? `${reportDetailsImported} student report row(s)` : '',
          classDetailsImported ? `${classDetailsImported} class detail row(s)` : ''
        ].filter(Boolean).join(', ');
        if (skipped) showErrorModal(`Imported ${importedSummary}; skipped ${skipped} invalid row(s).`);
        else showToast(`Imported ${importedSummary}.`);
      } catch (error) {
        showErrorModal(error.message || 'Could not read this CSV file.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  fillStudents();
  renderSheet();
}

function getGrade(total) {
  if (total >= 75) return 'A';
  if (total >= 65) return 'B';
  if (total >= 55) return 'C';
  if (total >= 45) return 'D';
  return 'F';
}

function renderAcademicGrid(tableHead, tableBody, students, results, subjects) {
  const fixedHeaders = ['Student', 'Class', 'Student ID', 'Term', 'Session'];
  tableHead.innerHTML = `
    <tr>${fixedHeaders.map((label) => `<th rowspan="2">${label}</th>`).join('')}${subjects.map((subject) => `<th colspan="5">${escapeHtml(subject)}</th>`).join('')}</tr>
    <tr>${subjects.map(() => '<th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th>').join('')}</tr>
  `;
  const columnCount = fixedHeaders.length + subjects.length * 5;
  if (!results.length) {
    tableBody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-state">No academic results have been recorded.</td></tr>`;
    return;
  }

  const studentMap = new Map(students.map((student) => [student.id, student]));
  const groups = new Map();
  results.forEach((result) => {
    const student = studentMap.get(result.studentId);
    const session = result.session || student?.session || '';
    const key = `${result.studentId}|${result.term}|${session}`;
    if (!groups.has(key)) {
      groups.set(key, {
        studentId: result.studentId,
        name: result.name || student?.name || result.studentId,
        className: normalizeClassName(result.className || student?.className),
        term: result.term || '',
        session,
        subjects: new Map()
      });
    }
    groups.get(key).subjects.set(result.subject, result);
  });

  const rows = [...groups.values()].sort((first, second) => first.name.localeCompare(second.name)
    || first.session.localeCompare(second.session)
    || first.term.localeCompare(second.term));
  tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.className)}</td>
      <td>${escapeHtml(row.studentId)}</td>
      <td>${escapeHtml(row.term)}</td>
      <td>${escapeHtml(row.session)}</td>
      ${subjects.map((subject) => {
        const result = row.subjects.get(subject);
        return `<td>${result ? escapeHtml(result.ca) : '—'}</td><td>${result ? escapeHtml(result.exam) : '—'}</td><td>${result ? escapeHtml(result.total) : '—'}</td><td>${result ? escapeHtml(result.grade) : '—'}</td><td>${escapeHtml(result?.teacherRemark || '—')}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

function downloadTableCsv(table, filename) {
  const rows = [...table.querySelectorAll('tr')].map((row) => [...row.children].map((cell) => {
    const input = cell.querySelector('input, textarea, select');
    const value = input ? input.value : cell.innerText.replace(/\s+/g, ' ').trim();
    return `"${String(value).replace(/"/g, '""')}"`;
  }).join(','));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderTeacherResults() {
  logActivity('Viewed class results');
  const table = document.getElementById('resultsTableBody');
  const tableHead = document.getElementById('resultsTableHead');
  const data = loadData();
  const classSelect = document.getElementById('resultClassFilter');
  const termSelect = document.getElementById('resultTermFilter');
  const sessionSelect = document.getElementById('resultSessionFilter');
  const teacher = getCurrentTeacher();
  const assignedClasses = getTeacherAssignedClasses(teacher);
  const subjects = getTeacherAssignedSubjects(teacher, data);
  classSelect.innerHTML = assignedClasses.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
  if (assignedClasses.length) classSelect.value = assignedClasses[0];
  const fillFilter = (select, values) => {
    const options = [...new Set(values.filter(Boolean))];
    select.innerHTML = `<option value="">All</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  };
  fillFilter(termSelect, data.academicResults.map((result) => result.term));
  fillFilter(sessionSelect, [...data.students.map((student) => student.session), ...data.academicResults.map((result) => result.session)]);

  function renderRows() {
    const latestData = loadData();
    const rows = latestData.academicResults.filter((result) => {
      const student = latestData.students.find((item) => item.id === result.studentId);
      const className = result.className || student?.className;
      return assignedClasses.includes(normalizeClassName(className))
        && (!classSelect.value || normalizeClassName(className) === classSelect.value)
        && subjects.includes(result.subject)
        && (!termSelect.value || result.term === termSelect.value)
        && (!sessionSelect.value || (result.session || student?.session) === sessionSelect.value);
    });
    renderAcademicGrid(tableHead, table, latestData.students, rows, subjects);
  }

  [classSelect, termSelect, sessionSelect].forEach((select) => select.addEventListener('change', renderRows));
  document.getElementById('downloadTeacherResults').addEventListener('click', () => downloadTableCsv(table.closest('table'), 'teacher-academic-results.csv'));
  document.getElementById('downloadTeacherResultsPdf').addEventListener('click', (event) => {
    downloadElementPdf(table.closest('table'), 'teacher-academic-results.pdf', 'landscape', event.currentTarget);
  });
  renderRows();
}

/* ---------- CSV import for CBT questions ---------- */
function parseCsvText(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch] += 1;
  }
  let delimiter = ',';
  Object.keys(counts).forEach((key) => { if (counts[key] > counts[delimiter]) delimiter = key; });

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function csvEscapeCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Turns CSV text into question objects. Pure function: it never touches the page or storage.
function importQuestionsFromCsv(text, opts) {
  const result = { questions: [], errors: [], duplicates: 0, fatal: '' };
  const rows = parseCsvText(text);
  if (rows.length < 2) { result.fatal = 'The file has no question rows. Use the template as a guide.'; return result; }
  if (rows.length - 1 > 500) { result.fatal = 'Import at most 500 questions at a time.'; return result; }

  const header = rows[0].map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const c = {
    title: col('testtitle', 'title', 'test'), subject: col('subject'), cls: col('class', 'classname'),
    q: col('question', 'questiontext'), a: col('optiona'), b: col('optionb'), c: col('optionc'), d: col('optiond'),
    ans: col('answer', 'correctanswer', 'correct')
  };
  if (c.q < 0 || c.a < 0 || c.b < 0 || c.ans < 0) {
    result.fatal = 'The first row must have these column names: question, option_a, option_b, answer. (option_c, option_d, test_title, subject and class are optional.)';
    return result;
  }

  const get = (r, i) => (i >= 0 && r[i] !== undefined ? String(r[i]).trim() : '');
  const subjectKey = (name) => String(name || '').trim().toLowerCase();
  const classKey = (name) => normalizeClassName(name).replace(/\s+/g, '').toLowerCase();
  const dupKey = (title, subject, className, question) =>
    [title, subjectKey(subject), classKey(className), question].map((v) => String(v || '').trim().toLowerCase()).join('|');
  const seen = new Set((opts.existing || []).map((q) => dupKey(q.testTitle, q.subject, q.className, q.question)));

  rows.slice(1).forEach((r, index) => {
    const line = index + 2; // row number as shown in Excel (row 1 is the header)
    const fail = (reason) => result.errors.push('Row ' + line + ': ' + reason);

    const title = get(r, c.title) || opts.defaults.title;
    if (!title) return fail('no test title (type one above or add a test_title column).');

    const subjectInput = get(r, c.subject) || opts.defaults.subject;
    const subject = opts.allowedSubjects.find((name) => subjectKey(name) === subjectKey(subjectInput));
    if (!subject) return fail('subject "' + subjectInput + '" is not one of your assigned subjects.');

    const classInput = get(r, c.cls) || opts.defaults.className;
    const className = opts.allowedClasses.find((name) => classKey(name) === classKey(classInput));
    if (!className) return fail('class "' + classInput + '" is not one of your classes.');

    const question = get(r, c.q);
    if (!question) return fail('the question is empty.');

    const options = [get(r, c.a), get(r, c.b), get(r, c.c), get(r, c.d)];
    if (!options[0] || !options[1]) return fail('option A and option B are required.');

    let answer = get(r, c.ans).toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(answer)) {
      const matched = options.findIndex((o) => o && o.toLowerCase() === get(r, c.ans).toLowerCase());
      answer = matched >= 0 ? 'ABCD'[matched] : '';
    }
    if (!answer) return fail('the answer must be A, B, C or D.');
    if (!options['ABCD'.indexOf(answer)]) return fail('the answer ' + answer + ' points to an empty option.');

    const key = dupKey(title, subject, className, question);
    if (seen.has(key)) { result.duplicates += 1; return; }
    seen.add(key);
    result.questions.push({ testTitle: title, subject, className, question, options, answer });
  });
  return result;
}

function renderTeacherQuestions() {
  const table = document.getElementById('questionTableBody');
  const form = document.getElementById('questionForm');
  const saveButton = document.getElementById('saveQuestionButton');
  const cancelEditButton = document.getElementById('cancelQuestionEdit');
  const data = loadData();
  const teacher = getCurrentTeacher();
  const subjectSelect = document.getElementById('questionSubject');
  const classSelect = document.getElementById('questionClass');
  let editingQuestionIndex = null;
  let pendingDeleteQuestionIndex = null;
  subjectSelect.innerHTML = getTeacherAssignedSubjects(teacher, data).map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
  classSelect.innerHTML = getActiveClasses(data).filter((className) => teacherCanAccessClass(className, teacher))
    .map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');

  function resetEditor() {
    editingQuestionIndex = null;
    form.reset();
    saveButton.textContent = 'Save Question';
    cancelEditButton.hidden = true;
  }

  function renderRows() {
    const questions = loadData().questions || [];
    table.innerHTML = questions.length ? questions.map((question, index) => `
      <tr>
        <td>${escapeHtml(question.testTitle || '')}</td>
        <td>${escapeHtml(question.subject)}</td>
        <td>${escapeHtml(question.className)}</td>
        <td>${escapeHtml(question.question)}</td>
        <td>${escapeHtml(question.answer)}</td>
        <td><div class="row-actions">
          <button type="button" data-question-action="edit" data-question-index="${index}">Edit</button>
          <button type="button" class="danger" data-question-action="delete" data-question-index="${index}">Delete</button>
        </div></td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty-state">No questions have been added yet.</td></tr>';
  }

  table.addEventListener('click', (event) => {
    const button = event.target.closest('[data-question-action]');
    if (!button) return;
    const index = Number(button.dataset.questionIndex);
    const question = loadData().questions[index];
    if (!question) return;

    if (button.dataset.questionAction === 'edit') {
      editingQuestionIndex = index;
      document.getElementById('questionTestTitle').value = question.testTitle || '';
      [subjectSelect, classSelect].forEach((select, selectIndex) => {
        const value = selectIndex === 0 ? question.subject : question.className;
        if (![...select.options].some((option) => option.value === value)) select.add(new Option(value, value));
        select.value = value;
      });
      document.getElementById('questionText').value = question.question || '';
      ['optionA', 'optionB', 'optionC', 'optionD'].forEach((id, optionIndex) => {
        document.getElementById(id).value = question.options?.[optionIndex] || '';
      });
      document.getElementById('correctAnswer').value = question.answer || 'A';
      saveButton.textContent = 'Update Question';
      cancelEditButton.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    pendingDeleteQuestionIndex = index;
    openModal('deleteQuestionModal');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const latestData = loadData();
    const testTitle = document.getElementById('questionTestTitle').value.trim();
    const subject = subjectSelect.value;
    const className = classSelect.value;
    if (!testTitle || !subject || !className) return;
    const updatedQuestion = {
      testTitle,
      subject,
      className,
      question: document.getElementById('questionText').value,
      options: [
        document.getElementById('optionA').value,
        document.getElementById('optionB').value,
        document.getElementById('optionC').value,
        document.getElementById('optionD').value,
      ],
      answer: document.getElementById('correctAnswer').value
    };
    const wasEditing = editingQuestionIndex !== null;
    if (wasEditing) {
      updatedQuestion._id = latestData.questions[editingQuestionIndex]._id;
      latestData.questions[editingQuestionIndex] = updatedQuestion;
    }
    else latestData.questions.push(updatedQuestion);
    recordActivity(latestData, teacher.name, 'Teacher', `${wasEditing ? 'Updated' : 'Added'} a question in ${testTitle}`);
    saveData(latestData);
    renderRows();
    if (wasEditing) resetEditor();
    else ['questionText', 'optionA', 'optionB', 'optionC', 'optionD'].forEach((id) => {
      document.getElementById(id).value = '';
    });

    if (!window.PortalSync) {
      showErrorModal('The question is saved in this browser, but database synchronization is unavailable.');
      return;
    }
    saveButton.disabled = true;
    showLoginLoader('Saving question to the database...');
    let syncErrors = [];
    try {
      syncErrors = await window.PortalSync.flush();
    } catch (error) {
      syncErrors = [error.message];
    } finally {
      hideLoginLoader();
      saveButton.disabled = false;
    }
    const signature = JSON.stringify([
      updatedQuestion.testTitle, updatedQuestion.subject, updatedQuestion.className,
      updatedQuestion.question, updatedQuestion.options || [], updatedQuestion.answer
    ]);
    const savedQuestion = (loadData().questions || []).find((question) => JSON.stringify([
      question.testTitle, question.subject, question.className,
      question.question, question.options || [], question.answer
    ]) === signature);
    const questionErrors = syncErrors.filter((error) => error.startsWith('questions -'));
    if (!savedQuestion?._id || questionErrors.length) {
      showErrorModal('The question could not be confirmed in the database. '
        + (questionErrors[0] || syncErrors[0] || 'Please try saving again.'));
    } else if (syncErrors.length) {
      showToast('Question saved to the database.');
    }
  });

  cancelEditButton.addEventListener('click', resetEditor);
  document.getElementById('cancelQuestionDelete').addEventListener('click', () => {
    pendingDeleteQuestionIndex = null;
    closeModal('deleteQuestionModal');
  });
  document.getElementById('confirmQuestionDelete').addEventListener('click', async (event) => {
    if (pendingDeleteQuestionIndex === null) return;
    const latestData = loadData();
    const [removedQuestion] = latestData.questions.splice(pendingDeleteQuestionIndex, 1);
    if (removedQuestion) {
      recordActivity(latestData, teacher.name, 'Teacher', `Deleted a question from ${removedQuestion.testTitle || removedQuestion.subject}`);
      saveData(latestData);
    }
    if (editingQuestionIndex !== null) resetEditor();
    pendingDeleteQuestionIndex = null;
    closeModal('deleteQuestionModal');
    renderRows();
    if (!removedQuestion) return;
    if (!window.PortalSync) {
      showErrorModal('The question was removed from this browser, but database synchronization is unavailable.');
      return;
    }

    const button = event.currentTarget;
    button.disabled = true;
    showLoginLoader('Removing question from the database...');
    let syncErrors = [];
    try {
      syncErrors = await window.PortalSync.flush();
    } catch (error) {
      syncErrors = [error.message];
    } finally {
      hideLoginLoader();
      button.disabled = false;
    }
    const deleteErrors = syncErrors.filter((error) => error.startsWith('delete questions -'));
    if (deleteErrors.length) {
      showErrorModal('The question could not be removed from the database. '
        + deleteErrors[0] + ' It remains removed in this browser and will be retried on the next save.');
    } else if (syncErrors.length) {
      showToast('Question deleted from the database. Submitted results were preserved.');
    }
  });
  const csvFile = document.getElementById('csvFile');
  if (csvFile) {
    const csvTitle = document.getElementById('csvTestTitle');
    const csvSubject = document.getElementById('csvSubject');
    const csvClass = document.getElementById('csvClass');
    const csvMessage = document.getElementById('csvImportMessage');
    csvSubject.innerHTML = subjectSelect.innerHTML;
    csvClass.innerHTML = classSelect.innerHTML;
    const allowedSubjects = [...subjectSelect.options].map((option) => option.value);
    const allowedClasses = [...classSelect.options].map((option) => option.value);

    document.getElementById('downloadCsvTemplate').addEventListener('click', () => {
      const lines = [
        ['test_title', 'subject', 'class', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer'],
        ['Mid-term Test', allowedSubjects[0] || 'Mathematics', allowedClasses[0] || 'JSS 1', 'What is 2 + 2?', '3', '4', '5', '6', 'B'],
        ['Mid-term Test', allowedSubjects[0] || 'Mathematics', allowedClasses[0] || 'JSS 1', 'Which number is even?', '7', '9', '12', '15', 'C']
      ].map((cells) => cells.map(csvEscapeCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + lines], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cbt-questions-template.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

    document.getElementById('importCsvButton').addEventListener('click', async () => {
      csvMessage.textContent = '';
      const file = csvFile.files[0];
      if (!file) { showErrorModal('Choose a .csv file first.'); return; }
      if (!/\.csv$/i.test(file.name)) { showErrorModal('The file must be a .csv file.'); return; }
      if (file.size > 2 * 1024 * 1024) { showErrorModal('The file is too large. Keep it under 2 MB.'); return; }
      let text;
      try { text = await file.text(); } catch (error) { showErrorModal('Could not read that file.'); return; }

      const result = importQuestionsFromCsv(text, {
        defaults: { title: csvTitle.value.trim(), subject: csvSubject.value, className: csvClass.value },
        allowedSubjects,
        allowedClasses,
        existing: loadData().questions || []
      });
      const problems = result.errors.slice(0, 10).join('\n') + (result.errors.length > 10 ? '\n...and ' + (result.errors.length - 10) + ' more.' : '');
      if (result.fatal) { csvMessage.textContent = result.fatal; showErrorModal(result.fatal); return; }
      if (!result.questions.length) {
        csvMessage.textContent = 'No questions were imported.' + (result.duplicates ? ' ' + result.duplicates + ' already existed.' : '') + (problems ? '\n' + problems : '');
        showErrorModal('No questions were imported. See the details under the button.');
        return;
      }

      const latestData = loadData();
      latestData.questions = latestData.questions || [];
      result.questions.forEach((question) => latestData.questions.push(question));
      const firstTitle = result.questions[0].testTitle;
      recordActivity(latestData, teacher.name, 'Teacher', `Imported ${result.questions.length} questions from a CSV file (${firstTitle})`);
      try {
        saveData(latestData);
      } catch (error) {
        showErrorModal('There is not enough browser storage to save these questions.');
        return;
      }
      renderRows();
      csvFile.value = '';

      showLoginLoader('Saving ' + result.questions.length + ' questions to the database...');
      let syncErrors = [];
      try {
        if (window.PortalSync) syncErrors = await window.PortalSync.flush();
      } catch (error) {
        syncErrors = [error.message];
      } finally {
        hideLoginLoader();
      }
      renderRows();
      const importedSignatures = new Set(result.questions.map((question) => JSON.stringify([
        question.testTitle, question.subject, question.className, question.question,
        question.options || [], question.answer
      ])));
      const savedSignatures = new Set((loadData().questions || []).filter((question) => question._id).map((question) => JSON.stringify([
        question.testTitle, question.subject, question.className, question.question,
        question.options || [], question.answer
      ])));
      const unsaved = [...importedSignatures].filter((signature) => !savedSignatures.has(signature)).length;
      const lines = [];
      if (unsaved === 0) {
        lines.push(result.questions.length + ' question(s) imported and saved to the database.');
      } else {
        const syncError = syncErrors.length ? ' Sync error: ' + syncErrors[0] : '';
        lines.push(result.questions.length + ' question(s) imported, but ' + unsaved + ' have not reached the database yet. They are kept in this browser and the portal will retry on the next save.' + syncError);
      }
      if (result.duplicates) lines.push(result.duplicates + ' duplicate row(s) skipped (already in the list).');
      if (result.errors.length) lines.push(result.errors.length + ' row(s) skipped:\n' + problems);
      csvMessage.textContent = lines.join('\n');
    });
  }

  renderRows();
}

function renderAdminDashboard() {
  const data = loadData();
  document.getElementById('totalStudents').textContent = String(data.students.filter((student) => student.status !== 'Inactive').length);
  document.getElementById('totalTeachers').textContent = String(data.teachers.filter((teacher) => teacher.status !== 'Inactive').length);
  document.getElementById('totalClasses').textContent = String(getActiveClasses(data).length);
  document.getElementById('totalSubjects').textContent = String(getActiveSubjects(data).length);
  document.getElementById('cbtTests').textContent = String(data.cbtResults.length);
  document.getElementById('academicResultsTotal').textContent = String(data.academicResults.length);
}

// ===== Delete / erase helpers (admin) =====
// Shows a confirmation popup and resolves true/false. If requireText is given, the admin must type it to enable the button.
function confirmAction({ title, message, confirmLabel = 'Delete', requireText = '' }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal open';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-box">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        ${requireText ? `<div class="filter-group" style="margin-top: 1rem;"><label for="confirmActionInput">Type ${escapeHtml(requireText)} to confirm</label><input id="confirmActionInput" type="text" autocomplete="off" /></div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-confirm="no">Cancel</button>
          <button type="button" class="btn btn-danger" data-confirm="yes"${requireText ? ' disabled' : ''}>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    const finish = (answer) => {
      document.removeEventListener('keydown', onKey);
      modal.remove();
      resolve(answer);
    };
    const onKey = (event) => { if (event.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) finish(false);
      const choice = event.target.closest('[data-confirm]');
      if (choice) finish(choice.dataset.confirm === 'yes');
    });
    document.body.appendChild(modal);
    const input = modal.querySelector('#confirmActionInput');
    if (input) {
      input.addEventListener('input', () => {
        modal.querySelector('[data-confirm="yes"]').disabled = input.value.trim() !== requireText;
      });
      input.focus();
    }
  });
}

function removeStudentRecords(data, studentId) {
  data.students = data.students.filter((student) => student.id !== studentId);
  data.academicResults = (data.academicResults || []).filter((result) => result.studentId !== studentId);
  data.cbtResults = (data.cbtResults || []).filter((result) => result.studentId !== studentId);
  Object.keys(data.reportDetails || {}).forEach((key) => {
    if (key.startsWith(`${studentId}|`)) delete data.reportDetails[key];
  });
}

function removeSubjectRecords(data, subject) {
  const same = (value) => String(value || '').toLowerCase() === subject.toLowerCase();
  data.subjects = data.subjects.filter((item) => !same(item));
  data.inactiveSubjects = (data.inactiveSubjects || []).filter((item) => !same(item));
  data.academicResults = (data.academicResults || []).filter((result) => !same(result.subject));
  data.teachers.forEach((teacher) => {
    if (Array.isArray(teacher.assignedSubjects)) teacher.assignedSubjects = teacher.assignedSubjects.filter((item) => !same(item));
    if (same(teacher.subject)) teacher.subject = '';
  });
}

// Clears people, scores and activity. Keeps admin accounts and school settings. Classes and subjects only if includeStructure is true.
function eraseAllData(data, includeStructure) {
  data.students = [];
  data.teachers = [];
  data.academicResults = [];
  data.cbtResults = [];
  data.questions = [];
  data.activities = [];
  data.notifications = [];
  data.reportDetails = {};
  data.reportMeta = {};
  if (includeStructure) {
    data.classes = [];
    data.subjects = [];
    data.inactiveClasses = [];
    data.inactiveSubjects = [];
  }
}

function renderAdminStudents() {
  const table = document.getElementById('adminStudentsTableBody');
  const form = document.getElementById('addStudentForm');
  const editForm = document.getElementById('editStudentForm');
  const classSelect = document.getElementById('studentClass');
  const classFilter = document.getElementById('adminStudentClassFilter');
  const studentFilter = document.getElementById('adminStudentFilter');
  const sessionFilter = document.getElementById('adminStudentSessionFilter');
  const studentCount = document.getElementById('adminStudentCount');
  let editingStudentId = null;
  let viewingStudentId = null;
  classSelect.innerHTML = getActiveClasses(loadData()).map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
  fillSessionSelect(document.getElementById('studentSession'), loadData());
  const fillStudentFilter = (students) => {
    const selected = studentFilter.value;
    studentFilter.innerHTML = '<option value="">All students</option>' + students
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} (${escapeHtml(student.id)})</option>`)
      .join('');
    if (students.some((student) => student.id === selected)) studentFilter.value = selected;
  };
  const refreshStudentFilters = () => {
    const data = loadData();
    const currentClass = classFilter.value;
    const currentSession = sessionFilter.value;
    const classes = [...new Set(data.students.map((student) => normalizeClassName(student.className)).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second));
    const sessions = [...new Set(data.students.map((student) => String(student.session || '').trim()).filter(Boolean))]
      .sort((first, second) => second.localeCompare(first));
    classFilter.innerHTML = '<option value="">All classes</option>' + classes
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    sessionFilter.innerHTML = '<option value="">All sessions</option>' + sessions
      .map((session) => `<option value="${escapeHtml(session)}">${escapeHtml(session)}</option>`).join('');
    if (classes.includes(currentClass)) classFilter.value = currentClass;
    if (sessions.includes(currentSession)) sessionFilter.value = currentSession;
    const matchingStudents = data.students.filter((student) =>
      (!classFilter.value || normalizeClassName(student.className) === classFilter.value)
      && (!sessionFilter.value || student.session === sessionFilter.value));
    fillStudentFilter(matchingStudents);
  };
  const renderProfileDetails = (details) => details.map(([label, value]) => `
    <div class="profile-detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || 'Not provided'))}</dd></div>
  `).join('');
  const openStudentEditor = (student) => {
    editingStudentId = student.id;
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editStudentName').value = student.name || '';
    const editClass = document.getElementById('editStudentClass');
    editClass.innerHTML = getActiveClasses(loadData()).map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join('');
    if (student.className && ![...editClass.options].some((option) => option.value === student.className)) {
      editClass.add(new Option(student.className, student.className));
    }
    editClass.value = student.className || '';
    document.getElementById('editStudentDateOfBirth').value = student.dateOfBirth || '';
    fillSessionSelect(document.getElementById('editStudentSession'), loadData(), student.session || '');
    document.getElementById('editStudentStatus').value = student.status || 'Active';
    document.getElementById('editStudentPhoto').value = '';
    document.getElementById('editStudentPassword').value = '';
    closeModal('studentProfileModal');
    openModal('editStudentModal');
    document.getElementById('editStudentName').focus();
  };
  const renderRows = () => {
    const students = loadData().students;
    refreshStudentFilters();
    const filtered = students.filter((student) =>
      (!classFilter.value || normalizeClassName(student.className) === classFilter.value)
      && (!studentFilter.value || student.id === studentFilter.value)
      && (!sessionFilter.value || student.session === sessionFilter.value))
      .sort((first, second) => normalizeClassName(first.className).localeCompare(normalizeClassName(second.className))
        || first.name.localeCompare(second.name));
    studentCount.textContent = `${filtered.length} of ${students.length} students`;
    const emptyMessage = students.length ? 'No students match these filters.' : 'No student records were found in the database.';
    table.innerHTML = filtered.length ? filtered.map((student) => `
      <tr>
        <td>${student.photoDataUrl ? `<img class="student-table-photo" src="${escapeHtml(student.photoDataUrl)}" alt="${escapeHtml(student.name)}">` : '<span class="student-table-photo-placeholder">-</span>'}</td>
        <td>${escapeHtml(student.id)}</td>
        <td>${escapeHtml(student.name)}</td>
        <td>${escapeHtml(student.className)}</td>
        <td>${escapeHtml(student.dateOfBirth || 'Not provided')}</td>
        <td>${escapeHtml(student.session)}</td>
        <td><span class="badge ${student.status === 'Inactive' ? 'default' : 'success'}">${escapeHtml(student.status || 'Active')}</span></td>
        <td><div class="row-actions">
          <button type="button" data-student-action="view" data-student-id="${escapeHtml(student.id)}">View</button>
          <button type="button" data-student-action="edit" data-student-id="${escapeHtml(student.id)}">Edit</button>
          <button type="button" class="${student.status === 'Inactive' ? 'btn-primary' : 'danger'}" data-student-status="${escapeHtml(student.id)}">${student.status === 'Inactive' ? 'Activate' : 'Deactivate'}</button>
          <button type="button" class="danger" data-student-delete="${escapeHtml(student.id)}">Delete</button>
        </div></td>
      </tr>
    `).join('') : `<tr><td colspan="8" class="empty-state">${emptyMessage}</td></tr>`;
  };
  [classFilter, studentFilter, sessionFilter].forEach((filter) => {
    filter.addEventListener('change', () => {
      if (filter === classFilter || filter === sessionFilter) refreshStudentFilters();
      renderRows();
    });
  });

  table.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-student-action]');
    if (actionButton) {
      const student = loadData().students.find((item) => item.id === actionButton.dataset.studentId);
      if (!student) return;
      if (actionButton.dataset.studentAction === 'edit') {
        openStudentEditor(student);
        return;
      }
      viewingStudentId = student.id;
      document.getElementById('studentProfileName').textContent = student.name || 'Student';
      document.getElementById('studentProfileId').textContent = `Student ID: ${student.id}`;
      const photo = document.getElementById('studentProfilePhoto');
      photo.src = student.photoDataUrl || 'logo.svg';
      photo.alt = student.photoDataUrl ? `${student.name} profile photo` : 'No profile photo';
      document.getElementById('studentProfileDetails').innerHTML = renderProfileDetails([
        ['Password', 'Protected. Passwords cannot be viewed; use Edit profile to set a new one.'],
        ['Class', student.className],
        ['Date of birth', student.dateOfBirth],
        ['Session', student.session],
        ['Status', student.status || 'Active']
      ]);
      openModal('studentProfileModal');
      return;
    }
    const deleteButton = event.target.closest('[data-student-delete]');

    if (deleteButton) {
      const target = loadData().students.find((item) => item.id === deleteButton.dataset.studentDelete);
      if (!target) return;
      confirmAction({
        title: `Delete ${target.name}?`,
        message: 'This permanently removes the student and all of their saved academic results, CBT results and report card details. It cannot be undone.'
      }).then((confirmed) => {
        if (!confirmed) return;
        const latest = loadData();
        removeStudentRecords(latest, target.id);
        recordActivity(latest, getCurrentAdmin().name, 'Admin', `Deleted student ${target.name}`);
        saveData(latest);
        renderRows();
        showToast('Student deleted.');
      });
      return;
    }
    const button = event.target.closest('[data-student-status]');
    if (!button) return;
    const data = loadData();
    const student = data.students.find((item) => item.id === button.dataset.studentStatus);
    if (!student) return;
    student.status = student.status === 'Inactive' ? 'Active' : 'Inactive';
    recordActivity(data, getCurrentAdmin().name, 'Admin', `${student.status === 'Inactive' ? 'Deactivated' : 'Activated'} student ${student.name}`);
    saveData(data);
    renderRows();
    showToast(`Student ${student.status.toLowerCase()}.`);
  });

  document.querySelectorAll('[data-close-student-profile]').forEach((button) => {
    button.addEventListener('click', () => closeModal('studentProfileModal'));
  });
  document.getElementById('studentProfileModal').addEventListener('click', (event) => {
    if (event.target.id === 'studentProfileModal') closeModal('studentProfileModal');
  });
  document.getElementById('editStudentProfile').addEventListener('click', () => {
    const student = loadData().students.find((item) => item.id === viewingStudentId);
    if (student) openStudentEditor(student);
  });
  document.getElementById('cancelStudentEdit').addEventListener('click', () => {
    editingStudentId = null;
    closeModal('editStudentModal');
  });
  document.getElementById('editStudentModal').addEventListener('click', (event) => {
    if (event.target.id === 'editStudentModal') closeModal('editStudentModal');
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = loadData();
    const student = data.students.find((item) => item.id === editingStudentId);
    if (!student) return closeModal('editStudentModal');
    const password = document.getElementById('editStudentPassword').value;
    const photoFile = document.getElementById('editStudentPhoto').files[0];
    if (password && password.length < 6) return showErrorModal('Password must be at least 6 characters.');
    if (photoFile && !photoFile.type.startsWith('image/')) return showErrorModal('Choose a valid image file.');
    try {
      let photoDataUrl = student.photoDataUrl || '';
      if (photoFile) photoDataUrl = await compressImageFile(photoFile, 400);
      if (password && student._uid && window.PortalSync) await window.PortalSync.setUserPassword(student._uid, password);
      student.name = document.getElementById('editStudentName').value.trim();
      student.className = document.getElementById('editStudentClass').value;
      student.dateOfBirth = document.getElementById('editStudentDateOfBirth').value;
      student.session = document.getElementById('editStudentSession').value.trim();
      student.status = document.getElementById('editStudentStatus').value;
      student.photoDataUrl = photoDataUrl;
      if (password && !window.PortalSync) student.password = password;
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Updated student profile ${student.name}`);
      saveData(data);
      if (window.PortalSync) {
        const syncErrors = await window.PortalSync.flush();
        if (syncErrors.length) throw new Error(syncErrors[0]);
      }
      editingStudentId = null;
      closeModal('editStudentModal');
      renderRows();
      showToast('Student profile updated.');
    } catch (error) {
      showErrorModal(error.message || 'Could not save the student profile.');
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = loadData();
    const id = document.getElementById('studentId').value.trim().toUpperCase();
    const photoFile = document.getElementById('studentPhoto').files[0];
    if (data.students.some((student) => student.id.toLowerCase() === id.toLowerCase())) {
      showErrorModal('That student ID already exists.');
      return;
    }
    const typedStudentPassword = document.getElementById('studentPassword').value.trim();
    if (typedStudentPassword.length < 6) {
      showErrorModal('Password must be at least 6 characters.');
      return;
    }

    const addStudent = (photoDataUrl = '') => {
      data.students.push({
        id,
        name: document.getElementById('studentName').value.trim(),
        className: document.getElementById('studentClass').value,
        dateOfBirth: document.getElementById('studentDateOfBirth').value,
        session: document.getElementById('studentSession').value.trim(),
        password: typedStudentPassword,
        status: document.getElementById('studentStatus').value,
        photoDataUrl
      });
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Added student ${data.students[data.students.length - 1].name}`);
      try {
        saveData(data);
      } catch (error) {
        data.students.pop();
        showErrorModal('There is not enough browser storage to save this student.');
        return;
      }
      showToast('Student added successfully.');
      renderRows();
      form.reset();
      fillSessionSelect(document.getElementById('studentSession'), loadData());
    };

    if (!photoFile) {
      addStudent();
      return;
    }
    if (!photoFile.type.startsWith('image/')) {
      showErrorModal('Choose a valid image file.');
      return;
    }
    compressImageFile(photoFile, 400).then(addStudent).catch((error) => showErrorModal(error.message));
  });
  renderRows();
}

function renderAdminTeachers() {
  const table = document.getElementById('adminTeachersTableBody');
  const form = document.getElementById('addTeacherForm');
  const editForm = document.getElementById('editTeacherForm');
  const classOptions = document.getElementById('teacherClassOptions');
  const editClassOptions = document.getElementById('editTeacherClassOptions');
  const subjectOptions = document.getElementById('teacherSubjectOptions');
  const editSubjectOptions = document.getElementById('editTeacherSubjectOptions');
  let viewingTeacherId = null;
  let editingTeacherId = null;
  const renderClassOptions = (container, selectedClasses) => {
    const previouslySelected = [...container.querySelectorAll('input:checked')].map((input) => input.value);
    const selected = new Set((Array.isArray(selectedClasses) ? selectedClasses : previouslySelected).map(normalizeClassName));
    const classes = getActiveClasses(loadData());
    container.innerHTML = classes.length ? classes.map((className) => `
      <label class="assignment-option">
        <input type="checkbox" value="${escapeHtml(className)}" ${selected.has(normalizeClassName(className)) ? 'checked' : ''}>
        <span>${escapeHtml(className)}</span>
      </label>
    `).join('') : '<span class="muted">Add classes before assigning them.</span>';
  };
  const renderEditClassOptions = (selectedClasses) => {
    renderClassOptions(editClassOptions, selectedClasses);
  };
  const renderSubjectOptions = (container, selectedSubjects) => {
    const previouslySelected = [...container.querySelectorAll('input:checked')].map((input) => input.value);
    const selected = new Set((Array.isArray(selectedSubjects) ? selectedSubjects : previouslySelected).map((subject) => subject.toLowerCase()));
    const subjects = getActiveSubjects(loadData());
    container.innerHTML = subjects.length ? subjects.map((subject) => `
      <label class="assignment-option">
        <input type="checkbox" value="${escapeHtml(subject)}" ${selected.has(subject.toLowerCase()) ? 'checked' : ''}>
        <span>${escapeHtml(subject)}</span>
      </label>
    `).join('') : '<span class="muted">Add subjects before assigning them.</span>';
  };
  const renderProfileDetails = (details) => details.map(([label, value]) => `
    <div class="profile-detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || 'Not provided'))}</dd></div>
  `).join('');
  const openTeacherEditor = (teacher) => {
    editingTeacherId = teacher.id;
    document.getElementById('editTeacherId').value = teacher.id;
    document.getElementById('editTeacherName').value = teacher.name;
    const assignedSubjects = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects : [teacher.subject].filter(Boolean);
    renderSubjectOptions(editSubjectOptions, assignedSubjects);
    renderEditClassOptions(getTeacherAssignedClasses(teacher, loadData()));
    document.getElementById('editTeacherStatus').value = teacher.status || 'Active';
    document.getElementById('editTeacherPhoto').value = '';
    document.getElementById('editTeacherPassword').value = '';
    closeModal('teacherProfileModal');
    openModal('editTeacherModal');
    document.getElementById('editTeacherName').focus();
  };
  const refreshAssignmentOptions = () => {
    renderClassOptions(classOptions);
    renderEditClassOptions();
    renderSubjectOptions(subjectOptions);
    renderSubjectOptions(editSubjectOptions);
  };
  refreshAssignmentOptions();
  window.addEventListener('storage', (event) => {
    if (event.key === 'schoolPortalData') refreshAssignmentOptions();
  });
  const renderRows = () => {
    table.innerHTML = loadData().teachers.map((teacher) => `
      <tr>
        <td>${teacher.photoDataUrl ? `<img class="student-table-photo" src="${teacher.photoDataUrl}" alt="${escapeHtml(teacher.name)}">` : '<span class="student-table-photo-placeholder">-</span>'}</td>
        <td>${escapeHtml(teacher.id)}</td>
        <td>${escapeHtml(teacher.name)}</td>
        <td>${escapeHtml(getTeacherAssignedSubjects(teacher).join(', '))}</td>
        <td>${escapeHtml(getTeacherAssignedClasses(teacher).join(', '))}</td>
        <td><span class="badge ${teacher.status === 'Active' ? 'success' : 'default'}">${escapeHtml(teacher.status || 'Active')}</span></td>
        <td><div class="row-actions">
          <button type="button" data-teacher-action="view" data-teacher-id="${escapeHtml(teacher.id)}">View</button>
          <button type="button" data-teacher-action="edit" data-teacher-id="${escapeHtml(teacher.id)}">Edit</button>
          <button type="button" data-teacher-action="photo" data-teacher-id="${escapeHtml(teacher.id)}">Photo</button>
          <input id="teacher-photo-${escapeHtml(teacher.id)}" type="file" accept="image/*" data-teacher-photo="${escapeHtml(teacher.id)}" hidden>
          <button type="button" class="danger" data-teacher-action="toggle-status" data-teacher-id="${escapeHtml(teacher.id)}">${teacher.status === 'Inactive' ? 'Activate' : 'Deactivate'}</button>
          <button type="button" class="danger" data-teacher-action="delete" data-teacher-id="${escapeHtml(teacher.id)}">Delete</button>
        </div></td>
      </tr>
    `).join('');
  };

  table.addEventListener('click', (event) => {
    const button = event.target.closest('[data-teacher-action]');
    if (!button) return;
    const id = button.dataset.teacherId;
    const data = loadData();
    const teacher = data.teachers.find((item) => item.id === id);
    if (!teacher) return;

    if (button.dataset.teacherAction === 'delete') {
      confirmAction({
        title: `Delete ${teacher.name}?`,
        message: 'This permanently removes the teacher account. Scores they entered stay with the students. It cannot be undone.'
      }).then((confirmed) => {
        if (!confirmed) return;
        const latest = loadData();
        latest.teachers = latest.teachers.filter((item) => item.id !== id);
        recordActivity(latest, getCurrentAdmin().name, 'Admin', `Deleted teacher ${teacher.name}`);
        saveData(latest);
        renderRows();
        showToast('Teacher deleted.');
      });
      return;
    }
    if (button.dataset.teacherAction === 'photo') {
      button.parentElement.querySelector('[data-teacher-photo]').click();
      return;
    }
    if (button.dataset.teacherAction === 'view') {
      viewingTeacherId = teacher.id;
      document.getElementById('teacherProfileName').textContent = teacher.name || 'Teacher';
      document.getElementById('teacherProfileId').textContent = `Teacher ID: ${teacher.id}`;
      const photo = document.getElementById('teacherProfilePhoto');
      photo.src = teacher.photoDataUrl || 'logo.svg';
      photo.alt = teacher.photoDataUrl ? `${teacher.name} profile photo` : 'No profile photo';
      const latest = loadData();
      const assignedClasses = getTeacherAssignedClasses(teacher, latest);
      const studentCount = latest.students.filter((student) => student.status !== 'Inactive'
        && assignedClasses.includes(normalizeClassName(student.className))).length;
      document.getElementById('teacherProfileDetails').innerHTML = renderProfileDetails([
        ['Password', 'Protected. Passwords cannot be viewed; use Edit profile to set a new one.'],
        ['Subjects assigned', getTeacherAssignedSubjects(teacher, latest).join(', ') || 'None'],
        ['Classes assigned', assignedClasses.join(', ') || 'None'],
        ['Active students in assigned classes', String(studentCount)],
        ['Status', teacher.status || 'Active']
      ]);
      openModal('teacherProfileModal');
      return;
    }
    if (button.dataset.teacherAction === 'edit') {
      openTeacherEditor(teacher);
      return;
    } else {
      teacher.status = teacher.status === 'Inactive' ? 'Active' : 'Inactive';
      recordActivity(data, getCurrentAdmin().name, 'Admin', `${teacher.status === 'Inactive' ? 'Deactivated' : 'Activated'} teacher ${teacher.name}`);
    }

    try {
      saveData(data);
      renderRows();
      showToast(button.dataset.teacherAction === 'edit' ? 'Teacher updated.' : `Teacher ${teacher.status.toLowerCase()}.`);
    } catch (error) {
      showErrorModal('Could not save the teacher changes.');
    }
  });

  document.getElementById('editTeacherProfile').addEventListener('click', () => {
    const teacher = loadData().teachers.find((item) => item.id === viewingTeacherId);
    if (teacher) openTeacherEditor(teacher);
  });
  document.querySelectorAll('[data-close-teacher-profile]').forEach((button) => button.addEventListener('click', () => closeModal('teacherProfileModal')));
  document.getElementById('teacherProfileModal').addEventListener('click', (event) => {
    if (event.target.id === 'teacherProfileModal') closeModal('teacherProfileModal');
  });

  document.getElementById('cancelTeacherEdit').addEventListener('click', () => {
    editingTeacherId = null;
    closeModal('editTeacherModal');
  });

  document.getElementById('editTeacherModal').addEventListener('click', (event) => {
    if (event.target.id === 'editTeacherModal') closeModal('editTeacherModal');
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('editTeacherName').value.trim();
    const assignedSubjects = [...editSubjectOptions.querySelectorAll('input:checked')].map((input) => input.value);
    const availableClasses = new Set(getActiveClasses(loadData()).map(normalizeClassName));
    const assignedClasses = [...new Set([...editClassOptions.querySelectorAll('input:checked')]
      .map((input) => normalizeClassName(input.value)).filter((className) => availableClasses.has(className)))];
    if (!name || !assignedSubjects.length || !assignedClasses.length) {
      showErrorModal('Name, at least one subject, and at least one class are required.');
      return;
    }
    const password = document.getElementById('editTeacherPassword').value;
    const photoFile = document.getElementById('editTeacherPhoto').files[0];
    if (password && password.length < 6) return showErrorModal('Password must be at least 6 characters.');
    if (photoFile && !photoFile.type.startsWith('image/')) return showErrorModal('Choose a valid image file.');
    const data = loadData();
    const teacher = data.teachers.find((item) => item.id === editingTeacherId);
    if (!teacher) {
      closeModal('editTeacherModal');
      return;
    }
    try {
      if (password && teacher._uid && window.PortalSync) await window.PortalSync.setUserPassword(teacher._uid, password);
      if (photoFile) teacher.photoDataUrl = await compressImageFile(photoFile);
      teacher.name = name;
      teacher.subject = assignedSubjects[0];
      teacher.assignedSubjects = assignedSubjects;
      teacher.className = assignedClasses[0];
      teacher.assignedClasses = assignedClasses;
      teacher.status = document.getElementById('editTeacherStatus').value;
      if (password && !window.PortalSync) teacher.password = password;
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Updated teacher profile ${teacher.name}`);
      saveData(data);
      if (window.PortalSync) {
        const syncErrors = await window.PortalSync.flush();
        if (syncErrors.length) throw new Error(syncErrors[0]);
      }
      editingTeacherId = null;
      closeModal('editTeacherModal');
      renderRows();
      showToast('Teacher updated.');
    } catch (error) {
      showErrorModal(error.message || 'Could not save the teacher changes.');
    }
  });

  table.addEventListener('change', (event) => {
    const input = event.target.closest('[data-teacher-photo]');
    const file = input?.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showErrorModal('Choose a valid image file.');
      input.value = '';
      return;
    }
    compressImageFile(file).then((photoDataUrl) => {
      const data = loadData();
      const teacher = data.teachers.find((item) => item.id === input.dataset.teacherPhoto);
      if (!teacher) return;
      teacher.photoDataUrl = photoDataUrl;
      saveData(data);
      renderRows();
      showToast('Teacher photo updated.');
    }).catch((error) => showErrorModal(error.message));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = loadData();
    refreshAssignmentOptions();
    const id = document.getElementById('teacherId').value.trim().toUpperCase();
    const photoFile = document.getElementById('teacherPhoto').files[0];
    if (data.teachers.some((teacher) => teacher.id.toLowerCase() === id.toLowerCase())) {
      showErrorModal('That teacher ID already exists.');
      return;
    }
    const typedTeacherPassword = document.getElementById('teacherPassword').value.trim();
    if (typedTeacherPassword.length < 6) {
      showErrorModal('Password must be at least 6 characters.');
      return;
    }
    const activeClasses = new Set(getActiveClasses(data).map(normalizeClassName));
    const assignedClasses = [...new Set([...classOptions.querySelectorAll('input:checked')]
      .map((input) => normalizeClassName(input.value)).filter((className) => activeClasses.has(className)))];
    const assignedSubjects = [...subjectOptions.querySelectorAll('input:checked')].map((input) => input.value);
    if (!assignedClasses.length || !assignedSubjects.length) {
      showErrorModal('Select at least one active class and one subject before creating a teacher.');
      return;
    }
    if (photoFile && !photoFile.type.startsWith('image/')) {
      showErrorModal('Choose a valid image file.');
      return;
    }
    const addTeacher = (photoDataUrl = '') => {
      const teacher = {
        id,
        name: document.getElementById('teacherName').value.trim(),
        password: typedTeacherPassword,
        status: document.getElementById('teacherStatus').value,
        className: assignedClasses[0],
        assignedClasses,
        subject: assignedSubjects[0],
        assignedSubjects,
        photoDataUrl
      };
      data.teachers.push(teacher);
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Added teacher ${teacher.name}`);
      try {
        saveData(data);
      } catch (error) {
        showErrorModal('Could not save the teacher. Browser storage may be full.');
        return;
      }
      showToast('Teacher added successfully.');
      renderRows();
      form.reset();
      renderClassOptions(classOptions, []);
      renderSubjectOptions(subjectOptions, []);
    };
    if (photoFile) compressImageFile(photoFile).then(addTeacher).catch((error) => showErrorModal(error.message));
    else addTeacher();
  });
  renderRows();
}

function renderAdminClasses() {
  const table = document.getElementById('adminClassesTableBody');
  const form = document.getElementById('addClassForm');
  const renderRows = () => {
    const data = loadData();
    const inactiveClasses = new Set(data.inactiveClasses || []);
    table.innerHTML = data.classes.map((className) => {
      const inactive = inactiveClasses.has(className);
      return `
        <tr>
          <td>${escapeHtml(className)}</td>
          <td><span class="badge ${inactive ? 'default' : 'success'}">${inactive ? 'Inactive' : 'Active'}</span></td>
          <td><div class="row-actions">
            <button type="button" class="${inactive ? 'btn-primary' : 'danger'}" data-class-status="${escapeHtml(className)}">${inactive ? 'Activate' : 'Deactivate'}</button>
            <button type="button" class="danger" data-class-delete="${escapeHtml(className)}">Delete</button>
          </div></td>
        </tr>
      `;
    }).join('');
  };

  table.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-class-delete]');
    if (deleteButton) {
      const className = deleteButton.dataset.classDelete;
      const studentCount = loadData().students.filter((student) => normalizeClassName(student.className) === className).length;
      if (studentCount) {
        showErrorModal(`${className} still has ${studentCount} student(s). Delete or move them first.`);
        return;
      }
      confirmAction({
        title: `Delete class ${className}?`,
        message: 'This permanently removes the class. It cannot be undone.'
      }).then((confirmed) => {
        if (!confirmed) return;
        const latest = loadData();
        latest.classes = latest.classes.filter((item) => item !== className);
        latest.inactiveClasses = (latest.inactiveClasses || []).filter((item) => item !== className);
        latest.teachers.forEach((teacher) => {
          if (Array.isArray(teacher.assignedClasses)) teacher.assignedClasses = teacher.assignedClasses.filter((item) => item !== className);
        });
        recordActivity(latest, getCurrentAdmin().name, 'Admin', `Deleted class ${className}`);
        saveData(latest);
        renderRows();
        showToast('Class deleted.');
      });
      return;
    }
    const button = event.target.closest('[data-class-status]');
    if (!button) return;
    const data = loadData();
    const className = button.dataset.classStatus;
    data.inactiveClasses = data.inactiveClasses || [];
    const inactive = data.inactiveClasses.includes(className);
    data.inactiveClasses = inactive
      ? data.inactiveClasses.filter((item) => item !== className)
      : [...data.inactiveClasses, className];
    recordActivity(data, getCurrentAdmin().name, 'Admin', `${inactive ? 'Activated' : 'Deactivated'} class ${className}`);
    saveData(data);
    renderRows();
    showToast(`Class ${inactive ? 'activated' : 'deactivated'}.`);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = normalizeClassName(document.getElementById('className').value);
    if (!value) return;
    const data = loadData();
    if (data.classes.some((className) => className.toLowerCase() === value.toLowerCase())) {
      showErrorModal('That class already exists.');
      return;
    }
    data.classes.push(value);
    recordActivity(data, getCurrentAdmin().name, 'Admin', `Added class ${value}`);
    saveData(data);
    showToast('Class added successfully.');
    renderRows();
    form.reset();
  });
  renderRows();
}

function renderAdminSubjects() {
  const table = document.getElementById('adminSubjectsTableBody');
  const form = document.getElementById('addSubjectFormAdmin');
  const renderRows = () => {
    const data = loadData();
    const inactiveSubjects = new Set((data.inactiveSubjects || []).map((subject) => subject.toLowerCase()));
    table.innerHTML = data.subjects.map((subject) => {
      const inactive = inactiveSubjects.has(subject.toLowerCase());
      return `
        <tr>
          <td>${escapeHtml(subject)}</td>
          <td><span class="badge ${inactive ? 'default' : 'success'}">${inactive ? 'Inactive' : 'Active'}</span></td>
          <td><div class="row-actions">
            <button type="button" class="${inactive ? 'btn-primary' : 'danger'}" data-subject-status="${escapeHtml(subject)}">${inactive ? 'Activate' : 'Deactivate'}</button>
            <button type="button" class="danger" data-subject-delete="${escapeHtml(subject)}">Delete</button>
          </div></td>
        </tr>
      `;
    }).join('');
  };

  table.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-subject-delete]');
    if (deleteButton) {
      const subject = deleteButton.dataset.subjectDelete;
      confirmAction({
        title: `Delete ${subject}?`,
        message: 'This permanently removes the subject, takes it off every teacher, and deletes all saved scores for it. Use Deactivate instead if you only want to hide it. It cannot be undone.'
      }).then((confirmed) => {
        if (!confirmed) return;
        const latest = loadData();
        removeSubjectRecords(latest, subject);
        recordActivity(latest, getCurrentAdmin().name, 'Admin', `Deleted subject ${subject}`);
        saveData(latest);
        renderRows();
        showToast('Subject deleted.');
      });
      return;
    }
    const button = event.target.closest('[data-subject-status]');
    if (!button) return;
    const subject = button.dataset.subjectStatus;
    const data = loadData();
    data.inactiveSubjects = data.inactiveSubjects || [];
    const inactive = data.inactiveSubjects.some((item) => item.toLowerCase() === subject.toLowerCase());
    data.inactiveSubjects = inactive
      ? data.inactiveSubjects.filter((item) => item.toLowerCase() !== subject.toLowerCase())
      : [...data.inactiveSubjects, subject];
    recordActivity(data, getCurrentAdmin().name, 'Admin', `${inactive ? 'Activated' : 'Deactivated'} subject ${subject}`);
    saveData(data);
    renderRows();
    showToast(`Subject ${inactive ? 'activated' : 'deactivated'}. Existing results are preserved.`);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = document.getElementById('adminSubjectName').value.trim();
    if (!value) return;
    const data = loadData();
    if (data.subjects.some((subject) => subject.toLowerCase() === value.toLowerCase())) {
      showErrorModal('That subject already exists.');
      return;
    }
    data.subjects.push(value);
    recordActivity(data, getCurrentAdmin().name, 'Admin', `Added subject ${value}`);
    saveData(data);
    showToast('Subject added successfully.');
    renderRows();
    form.reset();
  });
  renderRows();
}

function renderAdminCbtResults() {
  const testsTable = document.getElementById('adminCbtTestsBody');
  const table = document.getElementById('adminCbtTableBody');
  const classSelect = document.getElementById('adminCbtClassFilter');
  const subjectSelect = document.getElementById('adminCbtSubjectFilter');
  const data = loadData();
  const selectedClass = classSelect.value;
  const selectedSubject = subjectSelect.value;
  const activeClasses = getActiveClasses(data);
  const activeSubjects = getActiveSubjects(data);
  const tests = new Map();
  (data.questions || []).forEach((question) => {
    const id = getCbtTestId(question);
    const test = tests.get(id) || {
      id,
      title: question.testTitle || '',
      subject: question.subject || '',
      className: question.className || '',
      questionCount: 0
    };
    test.questionCount += 1;
    tests.set(id, test);
  });
  const attempts = new Map();
  (data.cbtResults || []).forEach((result) => attempts.set(result.testId, (attempts.get(result.testId) || 0) + 1));
  testsTable.innerHTML = tests.size ? [...tests.values()]
    .sort((first, second) => first.className.localeCompare(second.className)
      || first.subject.localeCompare(second.subject) || first.title.localeCompare(second.title))
    .map((test) => `
      <tr>
        <td>${escapeHtml(test.title)}</td>
        <td>${escapeHtml(test.subject)}</td>
        <td>${escapeHtml(test.className)}</td>
        <td>${test.questionCount}</td>
        <td>${attempts.get(test.id) || 0}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty-state">No CBT tests have been published yet.</td></tr>';
  classSelect.innerHTML = '<option value="">All</option>' + activeClasses
    .map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`)
    .join('');
  subjectSelect.innerHTML = '<option value="">All</option>' + activeSubjects
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join('');
  if (activeClasses.includes(selectedClass)) classSelect.value = selectedClass;
  if (activeSubjects.includes(selectedSubject)) subjectSelect.value = selectedSubject;
  classSelect.onchange = renderAdminCbtResults;
  subjectSelect.onchange = renderAdminCbtResults;

  const rows = (data.cbtResults || []).filter((row) => !classSelect.value
    || normalizeClassName(row.className) === normalizeClassName(classSelect.value))
    .filter((row) => !subjectSelect.value || row.subject.toLowerCase() === subjectSelect.value.toLowerCase());
  table.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${row.student}</td>
      <td>${row.className}</td>
      <td>${row.subject}</td>
      <td>${row.score}</td>
      <td>${row.percentage}%</td>
      <td>${row.date}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No CBT results match the selected filters.</td></tr>';
}

function renderAdminAcademicResults() {
  const classSelect = document.getElementById('adminResultClassFilter');
  const studentSelect = document.getElementById('adminResultStudentFilter');
  const termSelect = document.getElementById('adminResultTermFilter');
  const sessionSelect = document.getElementById('adminResultSessionFilter');
  const card = document.getElementById('adminReportCard');
  const initialData = loadData();
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label || value)}</option>`;

  const configuredClasses = getActiveClasses(initialData).map(normalizeClassName);
  const classes = configuredClasses.length ? configuredClasses
    : [...new Set(initialData.students.map((student) => normalizeClassName(student.className)).filter(Boolean))];
  classSelect.innerHTML = classes.length
    ? classes.map((name) => option(name)).join('')
    : '<option value="">No classes available</option>';
  termSelect.innerHTML = ['First Term', 'Second Term', 'Third Term'].map((term) => option(term)).join('');
  const sessions = getSessions(initialData);
  sessionSelect.innerHTML = sessions.length
    ? sessions.map((session) => option(session)).join('')
    : '<option value="">No sessions available</option>';
  if (sessions.length) sessionSelect.value = getCurrentSession(initialData);

  function fillStudents(selectedStudentId = '') {
    const list = loadData().students
      .filter((student) => normalizeClassName(student.className) === classSelect.value && student.status !== 'Inactive')
      .sort((first, second) => first.name.localeCompare(second.name));
    studentSelect.innerHTML = `<option value="">${list.length ? 'Select student' : 'No students in this class'}</option>`
      + list.map((student) => option(student.id, `${student.name} (${student.id})`)).join('');
    if (list.some((student) => student.id === selectedStudentId)) studentSelect.value = selectedStudentId;
  }

  function renderReport() {
    const data = loadData();
    const student = data.students.find((item) => item.id === studentSelect.value);
    card.innerHTML = student
      ? buildReportCardHtml(data, student, termSelect.value, sessionSelect.value)
      : `<p class="empty-state">${classSelect.value ? 'Select a student to view their report.' : 'No classes are available.'}</p>`;
  }

  classSelect.addEventListener('change', () => { fillStudents(); renderReport(); });
  [studentSelect, termSelect, sessionSelect].forEach((select) => select.addEventListener('change', renderReport));
  document.getElementById('downloadAdminResults').addEventListener('click', () => {
    const table = card.querySelector('.rc-table');
    if (!table) { showErrorModal('Choose a student with results first.'); return; }
    downloadTableCsv(table, `report-card-${studentSelect.value || 'student'}.csv`);
  });
  document.getElementById('downloadAdminReport').addEventListener('click', (event) => {
    const student = loadData().students.find((item) => item.id === studentSelect.value);
    if (!student || !card.querySelector('.rc-table')) {
      showErrorModal('Choose a student report card before downloading the PDF.');
      return;
    }
    downloadElementPdf(card, `report-card-${student.name}-${termSelect.value}-${sessionSelect.value}.pdf`, 'portrait', event.currentTarget, 600);
  });
  fillStudents();
  renderReport();
}

function renderAdminActivities() {
  const table = document.getElementById('adminActivityTable');
  const userFilter = document.getElementById('activityUserFilter');
  const roleFilter = document.getElementById('activityRoleFilter');
  const dateFilter = document.getElementById('activityDateFilter');
  const all = (loadData().activities || []).slice().sort((first, second) =>
    new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
  const localDay = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const users = [...new Set(all.map((entry) => entry.user || 'Former user'))].sort((a, b) => a.localeCompare(b));
  userFilter.innerHTML = '<option value="">All</option>' + users.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  const draw = () => {
    const rows = all.filter((entry) => (!userFilter.value || (entry.user || 'Former user') === userFilter.value)
      && (!roleFilter.value || entry.role === roleFilter.value)
      && (!dateFilter.value || localDay(entry.createdAt) === dateFilter.value));
    table.innerHTML = rows.length ? rows.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.user || 'Former user')}</td>
        <td>${escapeHtml(entry.role)}</td>
        <td>${escapeHtml(entry.activity)}</td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.time)}</td>
      </tr>
    `).join('') : '<tr><td colspan="5">No activity found.</td></tr>';
  };
  [userFilter, roleFilter, dateFilter].forEach((control) => control.addEventListener('change', draw));
  draw();
}

function renderAdminSettings() {
  const schoolNameInput = document.getElementById('schoolNameSetting');
  const stampInput = document.getElementById('schoolStampSetting');
  const stampPreviewWrap = document.getElementById('schoolStampPreviewWrap');
  const stampPreview = document.getElementById('schoolStampPreview');
  const removeStampButton = document.getElementById('removeSchoolStamp');
  const status = document.getElementById('settingStatus');
  const currentSettings = loadData().settings || {};
  schoolNameInput.value = currentSettings.schoolName || '';
  let stampDataUrl = currentSettings.stampDataUrl || '';
  let selectedStampFile = null;
  let removeStampRequested = false;
  let previewObjectUrl = '';
  const renderStampPreview = () => {
    const previewUrl = previewObjectUrl || stampDataUrl;
    stampPreviewWrap.hidden = !previewUrl;
    if (previewUrl) stampPreview.src = previewUrl;
    else stampPreview.removeAttribute('src');
  };
  renderStampPreview();
  stampInput.addEventListener('change', () => {
    const file = stampInput.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      stampInput.value = '';
      showErrorModal('Choose a PNG, JPG, or WebP image smaller than 5 MB.');
      return;
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    selectedStampFile = file;
    removeStampRequested = false;
    previewObjectUrl = URL.createObjectURL(file);
    renderStampPreview();
    status.textContent = 'Stamp/signature selected. Save school settings to upload it.';
  });
  removeStampButton.addEventListener('click', () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
    selectedStampFile = null;
    removeStampRequested = true;
    stampInput.value = '';
    renderStampPreview();
    status.textContent = 'Stamp/signature will be removed when you save school settings.';
  });
  document.getElementById('schoolSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = loadData();
    const stampChanged = Boolean(selectedStampFile) || removeStampRequested;
    data.settings = { ...(data.settings || {}), schoolName: schoolNameInput.value.trim(), stampDataUrl };
    recordActivity(data, getCurrentAdmin().name, 'Admin', stampChanged
      ? 'Updated school name and report stamp/signature'
      : 'Updated the school name');
    saveData(data);
    status.textContent = data.settings.schoolName ? 'School name saved.' : 'School name cleared.';
    showToast('School settings saved.');
    if (!stampChanged) return;
    try {
      if (!window.PortalSync?.saveSchoolStamp) throw new Error('Supabase is not ready to save the school stamp/signature.');
      stampDataUrl = await window.PortalSync.saveSchoolStamp(selectedStampFile);
      selectedStampFile = null;
      removeStampRequested = false;
      stampInput.value = '';
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = '';
      renderStampPreview();
      status.textContent = 'School stamp/signature saved to the database.';
      showToast('School stamp/signature saved.');
    } catch (error) {
      console.error('Could not save school stamp/signature:', error);
      status.textContent = 'School name saved, but the stamp/signature could not be saved.';
      showErrorModal(`Could not save the school stamp/signature: ${error.message}`);
    }
  });

  const sessionList = document.getElementById('sessionList');
  const sessionStatus = document.getElementById('sessionStatus');
  const renderSessions = () => {
    const data = loadData();
    const sessions = getSessions(data);
    const current = getCurrentSession(data);
    if (!sessions.length) {
      sessionList.innerHTML = '<p class="muted">No sessions yet. Add one above.</p>';
      return;
    }
    sessionList.innerHTML = sessions.map((name) => `
      <div class="score-save-actions" style="justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid var(--border, #e5e7eb);">
        <span><strong>${escapeHtml(name)}</strong>${name === current ? ' <span class="muted">(current)</span>' : ''}</span>
        <span>
          ${name === current ? '' : `<button class="btn btn-secondary" type="button" data-session-current="${escapeHtml(name)}">Set as current</button>`}
          <button class="btn btn-danger" type="button" data-session-remove="${escapeHtml(name)}">Remove</button>
        </span>
      </div>`).join('');
  };
  renderSessions();

  document.getElementById('sessionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('sessionName');
    const name = input.value.trim().replace(/\s+/g, '');
    const match = /^(\d{4})\/(\d{4})$/.exec(name);
    if (!match || Number(match[2]) !== Number(match[1]) + 1) {
      showErrorModal('Enter the session as two consecutive years, for example 2026/2027.');
      return;
    }
    const data = loadData();
    if (getSessions(data).some((item) => item.toLowerCase() === name.toLowerCase())) {
      showErrorModal(`The session ${name} already exists.`);
      return;
    }
    data.sessions = [...(data.sessions || []), name];
    if (!data.currentSession) data.currentSession = name;
    recordActivity(data, getCurrentAdmin().name, 'Admin', `Added academic session ${name}`);
    saveData(data);
    input.value = '';
    sessionStatus.textContent = `Session ${name} added.`;
    renderSessions();
  });

  sessionList.addEventListener('click', (event) => {
    const setButton = event.target.closest('[data-session-current]');
    const removeButton = event.target.closest('[data-session-remove]');
    const data = loadData();
    if (setButton) {
      data.currentSession = setButton.dataset.sessionCurrent;
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Set current session to ${data.currentSession}`);
      saveData(data);
      sessionStatus.textContent = `Current session is now ${data.currentSession}.`;
      renderSessions();
    } else if (removeButton) {
      const name = removeButton.dataset.sessionRemove;
      const used = (data.students || []).filter((student) => student.session === name).length
        + (data.academicResults || []).filter((result) => result.session === name).length;
      if (used) {
        showErrorModal(`${name} is used by ${used} student/result record(s) and cannot be removed. Change or delete those first.`);
        return;
      }
      data.sessions = (data.sessions || []).filter((item) => item !== name);
      if (data.currentSession === name) data.currentSession = '';
      recordActivity(data, getCurrentAdmin().name, 'Admin', `Removed academic session ${name}`);
      saveData(data);
      sessionStatus.textContent = `Session ${name} removed.`;
      renderSessions();
    }
  });

  const eraseButton = document.getElementById('eraseDataButton');
  if (eraseButton) {
    eraseButton.addEventListener('click', () => {
      const includeStructure = document.getElementById('eraseStructure').checked;
      confirmAction({
        title: 'Erase data?',
        message: `This permanently deletes all students, teachers, academic results, CBT questions and results, report card details and activity history${includeStructure ? ', plus all classes and subjects' : ''}. Admin accounts and school settings are kept. It cannot be undone.`,
        confirmLabel: 'Erase data',
        requireText: 'ERASE'
      }).then((confirmed) => {
        if (!confirmed) return;
        const latest = loadData();
        eraseAllData(latest, includeStructure);
        recordActivity(latest, getCurrentAdmin().name, 'Admin', 'Erased portal data');
        saveData(latest);
        showToast('All data erased.');
        document.getElementById('eraseStatus').textContent = 'Data erased.';
      });
    });
  }
}

window.logout = logout;
