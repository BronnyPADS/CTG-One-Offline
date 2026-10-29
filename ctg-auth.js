(function () {
  'use strict';

  var REMOTE = false; /* offline version */ // Empty string means same origin as this page. The frontend is served by the
// same App Service as the API, so the session cookie is first-party. Chrome
// Incognito, Safari and Firefox all block third-party cookies by default,
// which silently broke every authenticated request past login back when the
// frontend and the API lived on two different domains.
  var API_BASE_URL = window.CTG_API_BASE_URL || '';

  // Mirrors backend/src/passwordPolicy.js - checked here too so a weak
  // password is rejected before a round trip, not just after one.
  function passwordPolicyError(pw) {
    pw = String(pw || '');
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (new TextEncoder().encode(pw).length > 72) return 'Password must be at most 72 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must include a number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a symbol.';
    return null;
  }

  /* Pages that can be permissioned. `key` matches showPage() + sidebar data-page.
     The order below intentionally mirrors the visible sidebar so the Access
     Control account editor reads the same way as the portal navigation. */
  var PAGES = [
    { key: 'dashboard',      label: 'Dashboard',                 group: 'Patient Workflow' },
    { key: 'registration',   label: 'Patient Registration',      group: 'Patient Workflow' },
    { key: 'referrals',      label: 'Referrals',                 group: 'Patient Workflow' },
    { key: 'neuroReferrals', label: 'Neurologist Referrals',     group: 'Patient Workflow' },
    { key: 'patientLists',   label: 'Patient Lists',             group: 'Patient Workflow' },
    { key: 'appointment',    label: 'Appointments',              group: 'Patient Workflow' },
    { key: 'apptConfigs',    label: 'Appointment Configs',       group: 'Patient Workflow' },
    { key: 'pendingAce',     label: 'Patients Pending for ACE',  group: 'Patient Workflow' },
    { key: 'incompleteAce',  label: 'Incomplete ACE',            group: 'Patient Workflow' },
    { key: 'completedAce',   label: 'Completed ACE',             group: 'Patient Workflow' },
    { key: 'pendingDay2',    label: 'Patients Pending for Day 2', group: 'Patient Workflow' },
    { key: 'day1',           label: 'ACE Evaluation',            group: 'Patient Workflow' },
    { key: 'day2',           label: 'Exams',                     group: 'Current Forms' },
    { key: 'dailyNotes',     label: 'Daily Notes',               group: 'Current Forms' },
    { key: 'intakeForm',     label: 'Forms',                     group: 'Current Forms' },
    { key: 'arSummary',      label: 'AR Summary',                group: 'Billing' },
    { key: 'collectionMgmt', label: 'Collection Management',     group: 'Billing' },
    { key: 'meetings',          label: 'Meeting Rooms',            group: 'Messaging' },
    { key: 'internalMessaging', label: 'Internal Messaging',       group: 'Messaging' },
    { key: 'patientMessaging',  label: 'Patient Messaging',         group: 'Messaging' },
    { key: 'invitePatient',     label: 'Invite Patient',            group: 'Messaging' },
    /* "New Additions" sidebar group. apptConfigs is absent here
       it is already permissioned above under Patient Workflow, and listing a
       key twice would render two checkboxes fighting over one setting. */
    { key: 'careAdmin',         label: 'Care Administration',       group: 'New Additions' },
    { key: 'notification',      label: 'Notification',              group: 'New Additions' },
    { key: 'contacts',          label: 'Contacts',                  group: 'New Additions' },
    { key: 'patientCheckIn',    label: 'Patient Check In',          group: 'New Additions' },
    { key: 'patientChart',      label: 'Patient Chart',             group: 'New Additions' },
    { key: 'registrationList',  label: 'Registration List',         group: 'New Additions' },
    { key: 'patientEncounters', label: 'Patient Encounters',        group: 'New Additions' },
    { key: 'notesFormTest',     label: 'Notes Form API (test)',      group: 'New Additions' }
  ];
  var PAGE_KEYS = PAGES.map(function (p) { return p.key; });

  /* Exposed for Spotlight (spotlight.js), which navigates by page key. Shared
     rather than copied: a second hand-maintained list of pages would drift the
     first time one is renamed, and Spotlight would then offer a destination
     Access Control does not actually know about. */
  window.ctgPages = function () {
    return PAGES.map(function (p) { return { key: p.key, label: p.label, group: p.group }; });
  };

  var SECTION_CONFIG_PREFIX = '__sections_configured__:';
  function acSectionConfigKey(pageKey) { return SECTION_CONFIG_PREFIX + pageKey; }
  function acHasSectionConfig(user, pageKey) {
    return (user.pages || []).indexOf(acSectionConfigKey(pageKey)) !== -1;
  }
  var SECTIONS = {
    dashboard: [
      { key: 'dash.summary',       label: 'Summary Cards' },
      { key: 'dash.workflow',      label: 'Patient Workflow Overview' },
      { key: 'dash.shortcuts',     label: 'Quick Shortcuts' }
    ],
    registration: [
      { key: 'reg.patient',        label: 'Patient Details' },
      { key: 'reg.address',        label: 'Address & Contact' },
      { key: 'reg.case',           label: 'Case Assignment' },
      { key: 'reg.pendingAce',     label: 'Pending ACE Option' }
    ],
    referrals: [
      { key: 'ref.submit',         label: 'Submit a Referral (law firm)' },
      { key: 'ref.inbox',          label: 'Referral List / Inbox' },
      { key: 'ref.details',        label: 'Referred Patient Details' },
      { key: 'ref.accept',         label: 'Accept · Create Patient Record' },
      { key: 'ref.schedule',       label: 'Book Appointment from Referral' },
      { key: 'ref.decline',        label: 'Decline / Withdraw' }
    ],
    patientLists: [
      { key: 'pl.overview',        label: 'Overview' },
      { key: 'pl.diagnosis',       label: 'Overview · Diagnosis (ICD-10)' },
      { key: 'pl.policyLimits',    label: 'Overview · Policy Limits' },
      { key: 'pl.ace',             label: 'ACE' },
      { key: 'pl.exams',           label: 'Exams' },
      { key: 'pl.comparison',      label: 'Comparison' },
      { key: 'pl.notes',           label: 'Notes' },
      { key: 'pl.notesForm',       label: 'Notes Form (external)' },
      { key: 'pl.billing',         label: 'Billing' },
      { key: 'pl.documents',       label: 'Documents' },
      { key: 'pl.fcr',             label: 'FCR' }
    ],
    appointment: [
      { key: 'appt.calendar',      label: 'Calendar Views' },
      { key: 'appt.createEdit',    label: 'Appointment Create/Edit' },
      { key: 'appt.breakBlocks',   label: 'Break / Block Scheduling' },
      { key: 'appt.patientLink',   label: 'Patient Linking' },
      { key: 'appt.commandCenter', label: "Provider's Dashboard (Telehealth Board)" },
      { key: 'appt.rooms',         label: 'Scheduling Rooms' },
      { key: 'appt.undo',          label: 'Undo Delete (1-hour)' }
    ],
    apptConfigs: [
      { key: 'acfg.visitTypes',    label: 'Visit Types' },
      { key: 'acfg.eligibility',   label: 'Eligibility Tests' },
      { key: 'acfg.rooms',         label: 'Rooms' },
      { key: 'acfg.schedulers',    label: 'Schedulers' },
      { key: 'acfg.workingHours',  label: 'Working Hours' },
      { key: 'acfg.colorLegend',   label: 'Color Legend' }
    ],
    pendingAce: [
      { key: 'pace.list',          label: 'Pending Patient List' },
      { key: 'pace.openAce',       label: 'Open ACE Evaluation' },
      { key: 'pace.status',        label: 'Status Controls' }
    ],
    incompleteAce: [
      { key: 'iace.list',          label: 'Incomplete Patient List' },
      { key: 'iace.resume',        label: 'Resume ACE Forms' },
      { key: 'iace.progress',      label: 'Progress Counts' }
    ],
    completedAce: [
      { key: 'cace.list',          label: 'Completed Patient List' },
      { key: 'cace.open',          label: 'Open Completed ACE' },
      { key: 'cace.report',        label: 'Report Access' }
    ],
    pendingDay2: [
      { key: 'pd2.list',           label: 'Pending Day 2 List' },
      { key: 'pd2.openDay2',       label: 'Open Day 2 Exam' },
      { key: 'pd2.status',         label: 'Status Controls' }
    ],
    day1: [
      { key: 'ace.patient',        label: 'Patient Header' },
      { key: 'ace.mechanism',      label: 'Mechanism' },
      { key: 'ace.hpi',            label: 'HPI' },
      { key: 'ace.pmh',            label: 'PMH' },
      { key: 'ace.score',          label: 'ACE Score' },
      { key: 'ace.diagnosis',      label: 'Diagnosis' },
      { key: 'ace.plan',           label: 'Plan' }
    ],
    day2: [
      { key: 'exam.context',       label: 'Patient Context' },
      { key: 'exam.uploads',       label: 'Result PDF Uploads' },
      { key: 'exam.sway',          label: 'Vestibular & Neurocognitive Results' },
      { key: 'exam.reflex',        label: 'Quantitative Pupillometry Results' },
      { key: 'exam.shoebox',       label: 'Auditory Screening Results' },
      { key: 'exam.actions',       label: 'Save / Action Bar' }
    ],
    dailyNotes: [
      { key: 'dn.context',         label: 'Patient Context' },
      { key: 'dn.exercise',        label: 'Exercise & Time Details' },
      { key: 'dn.notes',           label: 'Notes Entry' },
      { key: 'dn.attachments',     label: 'Attachments' },
      { key: 'dn.actions',         label: 'Save Actions' }
    ],
    intakeForm: [
      { key: 'intake.demographics',label: 'Demographics Tab' },
      { key: 'intake.insurance',   label: 'Insurance & Attorney Tab' },
      { key: 'intake.consent',     label: 'Intake Form Tab (sign)' },
      { key: 'intake.minorAuth',   label: 'Minor Authorization Tab' },
      { key: 'intake.documents',   label: 'Documents Tab' },
      { key: 'intake.pdfs',        label: 'Generated PDFs' }
    ],
    arSummary: [
      { key: 'ar.patientInfo',     label: 'Patient Info Strip' },
      { key: 'ar.dates',           label: 'Key Dates' },
      { key: 'ar.summary',         label: 'Financial Summary' },
      { key: 'ar.receivables',     label: 'Receivables / Charges' },
      { key: 'ar.payments',        label: 'Payments / Adjustments' },
      { key: 'ar.notes',           label: 'Billing Notes' }
    ],
    collectionMgmt: [
      { key: 'cm.worklist',        label: 'Collection Worklist' },
      { key: 'cm.filters',         label: 'Status Filters' },
      { key: 'cm.followup',        label: 'Follow-up Actions' },
      { key: 'cm.notes',           label: 'Collection Notes' }
    ],
    meetings: [
      { key: 'mtg.view',    label: 'View Meetings' },
      { key: 'mtg.create',  label: 'Create & Schedule' },
      { key: 'mtg.host',    label: 'Host & Admit Guests' },
      { key: 'mtg.invite',  label: 'Share Guest Links' },
      { key: 'mtg.checkin', label: 'Confirm Present & Ready for Provider' },
      { key: 'mtg.record',  label: 'Record & Transcribe' },
      { key: 'mtg.endAll',  label: 'End Meeting for Everyone' },
      /* Not a per-person preference: whoever holds this sets the language
         for the whole meeting - both what the clinic reads and what the
         patient speaks and reads. Everyone else just follows it. */
      { key: 'mtg.translate', label: 'Meeting Translation (set languages for everyone)' }
    ],
    internalMessaging: [
      { key: 'im.read',            label: 'View Conversations' },
      { key: 'im.send',            label: 'Send Messages & Attachments' },
      { key: 'im.create',          label: 'Create Direct & Group Chats' },
      { key: 'im.editOwn',         label: 'Edit Own Messages' },
      { key: 'im.deleteOwn',       label: 'Unsend / Delete Own Messages' },
      { key: 'im.react',           label: 'Reply & React to Messages' },
      { key: 'im.manage',          label: 'Manage Group Chats' }
    ],
    patientMessaging: [
      { key: 'pm.read',            label: 'View Patient Threads' },
      { key: 'pm.send',            label: 'Send SMS & Email to Patients' },
      { key: 'pm.call',            label: 'Call & Log Patient Calls' },
      { key: 'pm.templates',       label: 'Use Message Templates' },
      { key: 'pm.contacts',        label: 'Manage Contact Book' }
    ],
    invitePatient: [
      { key: 'msg.newInvite',      label: 'New Invite' },
      { key: 'msg.defaults',       label: 'Default Messages' },
      { key: 'msg.newPatient',     label: 'New Patient Defaults' },
      { key: 'msg.history',        label: 'Recent Invite History' }
    ]
  };
  var SECTION_KEYS = [];
  Object.keys(SECTIONS).forEach(function (pg) {
    SECTIONS[pg].forEach(function (s) { SECTION_KEYS.push(s.key); });
    SECTION_KEYS.push(acSectionConfigKey(pg));
  });
  var ALL_KEYS = PAGE_KEYS.concat(SECTION_KEYS);

  var SUBPAGE_PARENT = {
    // Rooms are a tab of the appointment book - see the server copy in rbac.js.
    apptRooms: 'appointment',
    commandCenter: 'appointment',
    patientAce: 'day1',
    patientExamEdit: 'day2',
    patientExamDetail: 'day2',
    patientDailyNote: 'dailyNotes',
    neuroReferralLog: 'neuroReferrals'
  };

  var ROLE_LABELS = {
    admin: 'Administrator', lawyer: 'Law Firm', provider: 'Provider',
    ta: 'Technical Assistant', compliance: 'Compliance'
  };
  window.ctgRoleLabel = function (role) { return ROLE_LABELS[role] || role || ''; };

  var CURRENT = null; // the signed-in user object {id,username,displayName,role,pages}

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? el.value : ''; }
  function setVal(id, v) { var el = $(id); if (el) el.value = v; }
  function setText(id, t) { var el = $(id); if (el) el.textContent = t; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg, kind || ''); return; } catch (e) {} }
  }

  /* Registered law firms, one portal-wide source. The server owns the
     law_firms table, but every call site in this file expects a synchronous
     list of name strings, so a small in-memory cache is kept warm, refreshed
     on load and after any add or delete, rather than making every call async. */
  var LAW_FIRMS_KEY = 'ctg_registered_law_firms_v1';
  var _lawFirmsFull = []; // [{id, name}, ...] - id is needed for delete; other call sites only ever see names.
  async function refreshLawFirmsCache() {
    if (!REMOTE) return;
    try {
      var d = await apiFetch('/api/law-firms');
      _lawFirmsFull = (d.lawFirms || []).slice()
        .sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }); });
    } catch (e) { console.warn('Could not load law firms', e); }
  }
  function loadRegisteredLawFirms() {
    if (REMOTE) return _lawFirmsFull.map(function (f) { return f.name; });
    try {
      var list = JSON.parse(localStorage.getItem(LAW_FIRMS_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      var unique = [];
      list.forEach(function (name) {
        name = String(name || '').trim();
        if (!name) return;
        if (!unique.some(function (x) { return x.toLowerCase() === name.toLowerCase(); })) unique.push(name);
      });
      return unique.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
    } catch (e) { return []; }
  }
  function saveRegisteredLawFirms(list) {
    var clean = [];
    (list || []).forEach(function (name) {
      name = String(name || '').trim();
      if (!name) return;
      if (!clean.some(function (x) { return x.toLowerCase() === name.toLowerCase(); })) clean.push(name);
    });
    clean.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
    localStorage.setItem(LAW_FIRMS_KEY, JSON.stringify(clean));
    return clean;
  }
  window.ctgGetRegisteredLawFirms = function () { return loadRegisteredLawFirms().slice(); };

  /* Treating providers, for the Provider picker on registration.
     Cached because the picker is rebuilt on every render of those forms, and
     refreshed on the data:accounts push so adding a provider account shows up
     for everyone without a reload. */
  var _providers = [];
  window.ctgGetProviders = function () { return _providers.slice(); };
  window.ctgLoadProviders = function () {
    return apiFetch('/api/accounts/providers').then(function (d) {
      _providers = (d && d.providers) || [];
      if (typeof window.ctgRenderProviderPickers === 'function') window.ctgRenderProviderPickers();
      return _providers;
    }).catch(function () { return _providers; });
  };
  window.ctgProviderOptionsHTML = function (selected) {
    selected = String(selected || '');
    return '<option value="">— Select —</option>' + _providers.map(function (p) {
      var name = p.displayName || '';
      return '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
  };
  var PROVIDER_PICKER_IDS = ['regProvider', 'apptProvider'];
  window.ctgRenderProviderPickers = function (overrides) {
    overrides = overrides || {};
    PROVIDER_PICKER_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var selected = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : el.value;
      el.innerHTML = window.ctgProviderOptionsHTML(selected);
    });
  };
  window.ctgLawFirmOptionsHTML = function (selected) {
    selected = String(selected || '');
    return '<option value="">— Select —</option>' + loadRegisteredLawFirms().map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
  };
  window.ctgRefreshLawFirmSelections = function () {
    ['regLawFirm', 'apptNewLawFirm', 'acLawFirm'].forEach(function (id) {
      var sel = $(id); if (!sel) return;
      var current = sel.value || '';
      sel.innerHTML = window.ctgLawFirmOptionsHTML(current);
      if (loadRegisteredLawFirms().indexOf(current) !== -1) sel.value = current;
      else sel.value = '';
    });
  };

  /* ======================================================================
     BACKEND ABSTRACTION - every data operation returns a Promise so the same
     UI code works against the API (remote) or localStorage (local).
     ====================================================================== */

  var _csrfToken = '';

  async function rawApiFetch(url, opts) {
    // credentials:'include' (not 'same-origin') - the API runs on a different
    // origin (Azure App Service) than this static frontend (Azure Storage),
    // so the session cookie has to be explicitly allowed cross-origin.
    var res = await fetch(API_BASE_URL + url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
      credentials: 'include'
    }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var msg = (data && data.error) || ('Request failed (' + res.status + ')');
      /* The parsed body travels with the error too. A 409 from a shared
         document carries the server's current version, and the caller needs it
         to resync rather than guess. */
      var err = new Error(msg); err.status = res.status; err.body = data; throw err;
    }
    return data;
  }

  function isStaleCsrfError(err) {
    return !!err && err.status === 403 && /csrf/i.test(err.message || '');
  }

  async function apiFetch(url, opts) {
    if (window.ctgOfflineApi) return window.ctgOfflineApi(url, opts);
    try {
      return await rawApiFetch(url, opts);
    } catch (err) {
      if (!isStaleCsrfError(err)) throw err;
      var fresh = '';
      // GET, so it carries no token of its own and cannot recurse here.
      try { var d = await rawApiFetch('/api/me'); fresh = (d && d.csrfToken) || ''; }
      catch (e) { throw err; } // really signed out - the original error is the true one
      // Unchanged means the rejection was not staleness after all; retrying
      // would fail identically, so report the first failure rather than hide it.
      if (!fresh || fresh === _csrfToken) throw err;
      _csrfToken = fresh;
      return await rawApiFetch(url, opts);
    }
  }
  // Shared with app.js/appointments.js so every module talks to the API the
  // same way (base URL, credentials, JSON error shape) instead of each
  // re-implementing its own fetch wrapper.
  window.ctgApiFetch = apiFetch;
  window.ctgApiBaseUrl = API_BASE_URL;

  /* Real-time: one shared WebSocket for the whole app. Any module reacts to a
     push by defining the matching global handler, ctgLoadPatientStore and
     ctgLoadAppointmentsStore for data changes, ctgImHandleRealtime for
     Internal Messaging events. */
  var _ws = null;
  var _wsReconnectTimer = null;
  function wsUrl() { return (API_BASE_URL || window.location.origin).replace(/^http/, 'ws') + '/ws'; }
  function connectRealtime() {
    if (!REMOTE) return;
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
    try { _ws = new WebSocket(wsUrl()); } catch (e) { return; }
    _ws.onopen = function () { clearTimeout(_wsReconnectTimer); };
    _ws.onmessage = function (evt) {
      var msg; try { msg = JSON.parse(evt.data); } catch (e) { return; }
      if (!msg || !msg.type) return;
      /* The server cut this session: idle logoff, deactivation, or a password
         reset elsewhere. Handled before anything else, and it has to tear the page
         down rather than just close the socket, or the reconnect below retries
         every 3 seconds against a session that is never coming back. */
      if (msg.type === 'session:expired') { handleSessionRevoked(); return; }
      if (/^meeting:|^data:meetings$/.test(msg.type) && typeof window.ctgMeetingsRealtime === 'function') window.ctgMeetingsRealtime(msg.type, msg.payload);
      if (msg.type === 'data:accounts' && typeof window.ctgLoadProviders === 'function') window.ctgLoadProviders();
      /* Shared documents: another user saved Contacts, Appointment Configs,
         Notification settings or a patient chart. Pull the new copy rather
         than leaving this browser on a stale one - the point of moving
         these off localStorage was that everyone sees the same thing. */
      if (msg.type === 'data:shared' && msg.payload) {
        var key = msg.payload.key;
        if (key === 'contacts' && typeof window.ctgContactsRealtime === 'function') window.ctgContactsRealtime();
        if (key === 'apptConfig' && typeof window.ctgApptConfigRealtime === 'function') window.ctgApptConfigRealtime();
        if (key === 'notificationSettings' && typeof window.ctgNotificationRealtime === 'function') window.ctgNotificationRealtime();
        if (key === 'patientRequests' && typeof window.ctgPrivacyRequestsRealtime === 'function') window.ctgPrivacyRequestsRealtime();
        if (key === 'disclosureLog' && typeof window.ctgDisclosureLogRealtime === 'function') window.ctgDisclosureLogRealtime();
      }
      if (msg.type === 'data:chart' && typeof window.ctgPatientChartRealtime === 'function') window.ctgPatientChartRealtime();
      /* The Command Center wall reacts to anything that changes a room: a
         guest knocking, a host admitting, a meeting starting or ending, or the
         day's bookings changing. It only refreshes while it is on screen. */
      if ((msg.type === 'meeting:knock' || msg.type === 'meeting:lobby' || msg.type === 'meeting:room'
           || msg.type === 'data:meetings' || msg.type === 'data:appointments')
          && typeof window.ctgCommandCenterRealtime === 'function') window.ctgCommandCenterRealtime();
      // A knock should reach the clinician now, not on the next 30s poll.
      if ((msg.type === 'meeting:knock' || msg.type === 'meeting:lobby' || msg.type === 'data:appointments')
          && typeof window.ctgApptAlertsPing === 'function') window.ctgApptAlertsPing();
      if (msg.type === 'data:patients' && typeof window.ctgLoadPatientStore === 'function') window.ctgLoadPatientStore();
      else if (msg.type === 'data:appointments' && typeof window.ctgLoadAppointmentsStore === 'function') window.ctgLoadAppointmentsStore();
      else if (msg.type === 'patient:message' && typeof window.ctgPmHandleRealtime === 'function') window.ctgPmHandleRealtime(msg.type, msg.payload);
      else if (typeof window.ctgImHandleRealtime === 'function') window.ctgImHandleRealtime(msg.type, msg.payload);
    };
    // Reconnect automatically (e.g. after a network blip or the App Service
    // recycling the connection) as long as we're still signed in - CURRENT
    // is cleared on logout, which stops the retry loop.
    _ws.onclose = function () {
      _ws = null;
      if (CURRENT) _wsReconnectTimer = setTimeout(connectRealtime, 3000);
    };
    _ws.onerror = function () { try { _ws.close(); } catch (e) {} };
  }
  function disconnectRealtime() {
    clearTimeout(_wsReconnectTimer);
    if (_ws) { try { _ws.close(); } catch (e) {} _ws = null; }
  }
  window.ctgSendRealtime = function (obj) {
    try { if (_ws && _ws.readyState === WebSocket.OPEN) _ws.send(JSON.stringify(obj)); } catch (e) {}
  };

  /* ----- local-mode (file://) storage ----- */
  var ACCOUNTS_KEY = 'ctg_auth_accounts_v1';
  var SESSION_KEY = 'ctg_auth_session_v1';
  var INTERNAL_MESSAGES_MIGRATION_KEY = 'ctg_auth_internal_messages_v1';
  var PATIENT_MESSAGING_MIGRATION_KEY = 'ctg_auth_patient_messaging_v1';
  var NEW_ADDITIONS_MIGRATION_KEY = 'ctg_auth_new_additions_v1';

  function localLoad() {
    try { var a = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null'); if (Array.isArray(a)) return a; } catch (e) {}
    return null;
  }
  function localSave(list) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
  function localAdminCount(list) { return (list || []).filter(function (u) { return u.role === 'admin'; }).length; }
  function localActiveAdminCount(list) { return (list || []).filter(function (u) { return u.role === 'admin' && u.active !== false; }).length; }
  function localView(u) {
    if (!u) return null;
    return { id: u.id, username: u.username, displayName: u.displayName, role: u.role,
             lawFirm: u.lawFirm || '', active: u.active !== false,
             pages: u.role === 'admin' ? ALL_KEYS.slice() : (u.pages || []) };
  }
  // Human-friendly temporary password, e.g. "Temp-7fk3q9".
  function localTempPassword() { return 'Temp-' + Math.random().toString(36).slice(2, 8); }
  // Browser-only mode seeds no account. This file is sent to every visitor, so a
  // password written here is public; accounts live on the server (REMOTE).
  function localDefaultAccounts() {
    return window.ctgOfflineAccounts ? window.ctgOfflineAccounts() : [];
  }
  var SEEDED_DEFAULTS_KEY = 'ctg_auth_seeded_defaults_v1';
  function loadSeededDefaults() {
    try { var a = JSON.parse(localStorage.getItem(SEEDED_DEFAULTS_KEY) || 'null'); if (Array.isArray(a)) return a; } catch (e) {}
    return [];
  }
  function localSeed() {
    var list = localLoad();
    var changed = false;
    var seeded = loadSeededDefaults();
    var seededChanged = false;
    if (!list || !list.length) {
      list = localDefaultAccounts();
      changed = true;
      seeded = list.map(function (u) { return u.username.toLowerCase(); });
      seededChanged = true;
    } else {
      var defaults = localDefaultAccounts();
      defaults.forEach(function (acc) {
        var uname = acc.username.toLowerCase();
        var exists = list.some(function (u) { return String(u.username).toLowerCase() === uname; });
        var everSeeded = seeded.indexOf(uname) !== -1;
        if (!exists && !everSeeded) { list.push(acc); changed = true; }
        if (!everSeeded) { seeded.push(uname); seededChanged = true; }
      });
      if (defaults[0] && !list.some(function (u) { return u.role === 'admin'; })) {
        list.unshift(defaults[0]); changed = true;
      }
    }
    if (seededChanged) { try { localStorage.setItem(SEEDED_DEFAULTS_KEY, JSON.stringify(seeded)); } catch (e) {} }
    // One-time migration: existing accounts created before Internal Messaging
    // receive the new page so every signed-in user can participate immediately.
    // After this marker is saved, administrators can revoke the page normally
    // without a later reload silently granting it again.
    if (localStorage.getItem(INTERNAL_MESSAGES_MIGRATION_KEY) !== '1') {
      list.forEach(function (u) {
        if (u.role === 'admin') return;
        if (!Array.isArray(u.pages)) u.pages = [];
        if (u.pages.indexOf('internalMessaging') === -1) { u.pages.push('internalMessaging'); changed = true; }
      });
      localStorage.setItem(INTERNAL_MESSAGES_MIGRATION_KEY, '1');
    }
    // Same one-time grant for Patient Messaging. Admin accounts are stored with
    // the full PAGE_KEYS list, so they already pick the page up; this covers
    // accounts saved before the page existed. Revocations after the marker is
    // written stick.
    if (localStorage.getItem(PATIENT_MESSAGING_MIGRATION_KEY) !== '1') {
      list.forEach(function (u) {
        if (!Array.isArray(u.pages)) u.pages = [];
        if (u.role === 'admin') {
          if (u.pages.indexOf('patientMessaging') === -1) { u.pages.push('patientMessaging'); changed = true; }
          return;
        }
        // Anyone who could already invite patients keeps parity with that.
        if (u.pages.indexOf('invitePatient') !== -1 && u.pages.indexOf('patientMessaging') === -1) {
          u.pages.push('patientMessaging'); changed = true;
        }
      });
      localStorage.setItem(PATIENT_MESSAGING_MIGRATION_KEY, '1');
    }
    if (localStorage.getItem(NEW_ADDITIONS_MIGRATION_KEY) !== '1') {
      var NEW_ADDITION_KEYS = ['careAdmin', 'notification', 'contacts', 'patientCheckIn',
        'patientChart', 'registrationList', 'patientEncounters'];
      list.forEach(function (u) {
        if (u.role !== 'admin') return;
        if (!Array.isArray(u.pages)) u.pages = [];
        NEW_ADDITION_KEYS.forEach(function (k) {
          if (u.pages.indexOf(k) === -1) { u.pages.push(k); changed = true; }
        });
      });
      localStorage.setItem(NEW_ADDITIONS_MIGRATION_KEY, '1');
    }
    if (changed) localSave(list);
    return list;
  }
  function localNewId() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var backend = {
    async me() {
      if (REMOTE) {
        try {
          var d = await apiFetch('/api/me');
          _csrfToken = d.csrfToken || '';
          if (d.idleTimeoutMinutes) window.ctgSetIdleTimeoutMinutes(d.idleTimeoutMinutes);
          return d.user;
        } catch (e) { return null; }
      }
      localSeed();
      var id = sessionStorage.getItem(SESSION_KEY);
      if (!id) return null;
      var u = (localLoad() || []).filter(function (x) { return x.id === id; })[0];
      if (u && u.active === false) { sessionStorage.removeItem(SESSION_KEY); return null; } // signed out if deactivated
      return u ? localView(u) : null;
    },

    async login(username, password) {
      if (REMOTE) {
        var d = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username: username, password: password }) });
        // A two-factor account returns a challenge instead of a session - the
        // caller shows the code step rather than treating this as signed in.
        if (d.mfaRequired) return { mfaRequired: true, challengeId: d.challengeId, emailHint: d.emailHint };
        _csrfToken = d.csrfToken || '';
        /* Take the automatic-logoff window from the server here, not only in me().
           Without this a fresh sign-in kept the hardcoded 15-minute default while
           the server allowed 30, so the browser signed people out at half the
           configured time, and only a page reload ever corrected it. */
        if (d.idleTimeoutMinutes) window.ctgSetIdleTimeoutMinutes(d.idleTimeoutMinutes);
        return d.user;
      }
      var list = localSeed();
      var uname = String(username || '').trim().toLowerCase();
      var u = list.filter(function (x) { return String(x.username).toLowerCase() === uname; })[0];
      if (!u || u.password !== password) { var e = new Error('Invalid username or password'); e.status = 401; throw e; }
      if (u.active === false) { var de = new Error('This account has been deactivated. Contact an administrator.'); de.status = 403; throw de; }
      sessionStorage.setItem(SESSION_KEY, u.id);
      return localView(u);
    },

    async verifyLoginCode(challengeId, code) {
      var d = await apiFetch('/api/login/verify', { method: 'POST', body: JSON.stringify({ challengeId: challengeId, code: code }) });
      _csrfToken = d.csrfToken || '';
      // Same reason as login(): this path also creates a session.
      if (d.idleTimeoutMinutes) window.ctgSetIdleTimeoutMinutes(d.idleTimeoutMinutes);
      return d.user;
    },

    async resendLoginCode(challengeId) {
      return await apiFetch('/api/login/resend', { method: 'POST', body: JSON.stringify({ challengeId: challengeId }) });
    },

    async logout() {
      if (REMOTE) { try { await apiFetch('/api/logout', { method: 'POST' }); } catch (e) {} _csrfToken = ''; return; }
      sessionStorage.removeItem(SESSION_KEY);
    },

    async listAccounts() {
      if (REMOTE) { var d = await apiFetch('/api/accounts'); return d.accounts; }
      return (localLoad() || []).map(localView);
    },

    async createAccount(payload) {
      if (REMOTE) { var d = await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(payload) }); return d.account; }
      var list = localLoad() || [];
      var uname = String(payload.username || '').trim();
      if (!uname) throw new Error('Username is required');
      if (!/^[A-Za-z0-9._-]+$/.test(uname)) throw new Error('Username: letters, numbers, . _ - only');
      if (!payload.password) throw new Error('Password is required');
      if (list.some(function (u) { return u.username.toLowerCase() === uname.toLowerCase(); })) throw new Error('That username is already taken');
      var acc = { id: localNewId(), username: uname, displayName: (payload.displayName || uname).trim(), role: payload.role,
                  lawFirm: payload.role === 'lawyer' ? String(payload.lawFirm || '').trim() : '',
                  password: payload.password, pages: payload.role === 'admin' ? PAGE_KEYS.slice() : (payload.pages || ['internalMessaging']) };
      list.push(acc); localSave(list); return localView(acc);
    },

    async updateAccount(id, payload) {
      if (REMOTE) { var d = await apiFetch('/api/accounts/' + id, { method: 'PUT', body: JSON.stringify(payload) }); return d.account; }
      var list = localLoad() || [];
      var u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found');
      if (payload.username != null) {
        var uname = String(payload.username).trim();
        if (!/^[A-Za-z0-9._-]+$/.test(uname)) throw new Error('Invalid username');
        if (list.some(function (x) { return x.id !== id && x.username.toLowerCase() === uname.toLowerCase(); })) throw new Error('That username is already taken');
        u.username = uname;
      }
      if (payload.displayName != null) u.displayName = String(payload.displayName).trim() || u.username;
      if (payload.role != null) {
        if (u.role === 'admin' && payload.role !== 'admin' && localAdminCount(list) <= 1) throw new Error('Cannot change the role of the last administrator');
        u.role = payload.role;
        if (payload.role === 'admin') u.pages = PAGE_KEYS.slice();
        if (payload.role !== 'lawyer') u.lawFirm = '';
      }
      if (payload.lawFirm != null && (payload.role === 'lawyer' || u.role === 'lawyer')) u.lawFirm = String(payload.lawFirm).trim();
      if (payload.password) u.password = payload.password;
      localSave(list); return localView(u);
    },

    async setPages(id, pages) {
      if (REMOTE) { var d = await apiFetch('/api/accounts/' + id + '/pages', { method: 'PATCH', body: JSON.stringify({ pages: pages }) }); return d.account; }
      var list = localLoad() || [];
      var u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found');
      if (u.role !== 'admin') u.pages = (pages || []).filter(function (k) { return ALL_KEYS.indexOf(k) !== -1; });
      localSave(list); return localView(u);
    },

    async deleteAccount(id) {
      if (REMOTE) { await apiFetch('/api/accounts/' + id, { method: 'DELETE' }); return; }
      var list = localLoad() || [];
      var u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found');
      if (u.role === 'admin' && localAdminCount(list) <= 1) throw new Error('Cannot delete the last administrator');
      localSave(list.filter(function (x) { return x.id !== id; }));
    },

    // Generate a new temporary password for an account and return it so the
    // admin can share it. Returns the plain temp password.
    async resetPassword(id) {
      if (REMOTE) { var d = await apiFetch('/api/accounts/' + id + '/reset-password', { method: 'POST' }); return d.password; }
      var list = localLoad() || [];
      var u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found');
      var temp = localTempPassword();
      u.password = temp;
      localSave(list);
      return temp;
    },

    // Deactivate / reactivate an account. A deactivated account cannot log in.
    async setActive(id, active) {
      if (REMOTE) { var d = await apiFetch('/api/accounts/' + id + '/active', { method: 'PATCH', body: JSON.stringify({ active: !!active }) }); return d.account; }
      var list = localLoad() || [];
      var u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found');
      if (!active && u.role === 'admin' && localActiveAdminCount(list) <= 1) throw new Error('Cannot deactivate the last active administrator');
      u.active = !!active;
      localSave(list);
      return localView(u);
    }
  };

  // Safe account directory for Internal Messaging - every signed-in user (not
  // just admins) needs this, so it hits a dedicated non-admin-gated endpoint
  // rather than backend.listAccounts() (which is admin-only, for Access Control).
  window.ctgListMessagingAccounts = async function () {
    if (REMOTE) {
      try { var d = await apiFetch('/api/accounts/directory'); return d.accounts; }
      catch (e) { return []; }
    }
    try { return await backend.listAccounts(); }
    catch (e) { return []; }
  };

  /* ======================================================================
     PERMISSIONS + CHROME
     ====================================================================== */
  function canAccess(user, pageKey) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (pageKey === 'accessControl') return false;
    var parent = SUBPAGE_PARENT[pageKey] || pageKey;
    if (PAGE_KEYS.indexOf(parent) === -1) return true;
    return (user.pages || []).indexOf(parent) !== -1;
  }

  /* Can this user open a section within a page? Admins always; no if the
     parent page is not granted; yes if no section keys are stored for that
     page, which is the full-access default; otherwise only the sections
     explicitly granted. */
  function canAccessSection(user, pageKey, sectionKey) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!canAccess(user, pageKey)) return false;
    var defs = SECTIONS[pageKey];
    if (!defs) return true;
    var keys = defs.map(function (s) { return s.key; });
    var granted = (user.pages || []).filter(function (k) { return keys.indexOf(k) !== -1; });
    // Legacy accounts created before granular sub-page settings existed have
    // the parent page only. Keep those accounts at full page access until the
    // admin explicitly changes a section checkbox, which saves a marker.
    if (!acHasSectionConfig(user, pageKey) && !granted.length) return true;
    return granted.indexOf(sectionKey) !== -1;
  }

  /* Exposed so the portal UI (index.html) can gate sub-sections. */
  window.ctgCanSection = function (pageKey, sectionKey) { return canAccessSection(CURRENT, pageKey, sectionKey); };
  /* Page-level gate (e.g. does this account have Appointments / AR Summary /
     Collection Management at all) - used by the dashboard to decide whether
     to show shortcuts into those pages. */
  window.ctgCanPage = function (pageKey) { return canAccess(CURRENT, pageKey); };
  window.ctgCurrentUser = function () { return CURRENT; };
  /* Lawyer context - drives the firm-scoped, read-only patient view. */
  window.ctgIsLawyer = function () { return !!(CURRENT && CURRENT.role === 'lawyer'); };
  window.ctgUserFirm = function () { return CURRENT ? (CURRENT.lawFirm || '') : ''; };
  var LAST_PAGE_KEY = 'ctg_last_page';
  function rememberPage(user, name) {
    if (!user || !name || name === 'noAccess') return;
    try { localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ u: user.id || user.username, p: name })); } catch (e) {}
  }
  function resumePage(user) {
    try {
      var raw = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || 'null');
      if (raw && raw.p && raw.u === (user.id || user.username) && canAccess(user, raw.p)) return raw.p;
    } catch (e) {}
    return landingPage(user);
  }

  function landingPage(user) {
    // Land on the Dashboard when the account has access; otherwise the first
    // page it can open (so accounts without Dashboard access still work).
    if (canAccess(user, 'dashboard')) return 'dashboard';
    var allowed = PAGE_KEYS.filter(function (k) { return canAccess(user, k); });
    return allowed.length ? allowed[0] : 'noAccess';
  }

  function applySidebar(user) {
    var admin = user.role === 'admin';
    PAGE_KEYS.forEach(function (key) {
      var link = document.querySelector('.sidebar [data-page="' + key + '"]');
      if (link) link.style.display = canAccess(user, key) ? '' : 'none';
    });
    /* Patient Messaging is hidden portal-wide for now. The page, its code and
       its access-control permission all stay in place; only the sidebar entry is
       suppressed, so nothing is lost and this is reversed by deleting these two
       lines. Runs after the loop above so it overrides the access check. */
    var pmLink = document.querySelector('.sidebar [data-page="patientMessaging"]');
    if (pmLink) pmLink.style.display = 'none';
    var nfLink = document.querySelector('.sidebar [data-page="notesFormTest"]');
    if (nfLink) nfLink.style.display = 'none';
    /* Command Center and Rooms are sub-pages of Appointment, so they don't
       appear in PAGE_KEYS. Gate their sidebar links by their own Access-Control
       sections so each can be shared independently of the calendar itself. */
    [['sideCommandCenter', 'appt.commandCenter'], ['sideApptRooms', 'appt.rooms']].forEach(function (pair) {
      var el = $(pair[0]);
      if (el) el.style.display = (canAccess(user, 'appointment') && canAccessSection(user, 'appointment', pair[1])) ? '' : 'none';
    });
    /* Providers are read-only on Exams and Daily Notes - hide the form-entry
       links (they can still view saved exams/notes from Patient Lists). */
    if (user.role === 'provider') {
      ['sideDay2', 'sideDailyNotes'].forEach(function (id) {
        var el = $(id); if (el) el.style.display = 'none';
      });
    }
    ['sideAccessControl', 'sideAdminDivider', 'sideAdminLabel', 'sideNotesFormTest'].forEach(function (id) {
      var el = $(id); if (el) el.style.display = admin ? '' : 'none';
    });
    /* Collapsible groups (e.g. "New Additions") aren't links themselves, so
       hiding every child still leaves the group header sitting there opening
       an empty drawer. Hide the whole group when nothing inside is visible. */
    document.querySelectorAll('.sidebar .side-group').forEach(function (group) {
      var anyVisible = Array.prototype.some.call(
        group.querySelectorAll('[data-page]'),
        function (a) { return a.style.display !== 'none'; });
      group.style.display = anyVisible ? '' : 'none';
    });
    document.querySelectorAll('.sidebar .side-section-label').forEach(function (label) {
      if (label.id === 'sideAdminLabel') return;
      var n = label.nextElementSibling, anyVisible = false;
      while (n && !n.classList.contains('side-section-label') && !n.classList.contains('side-divider')) {
        if ((n.classList.contains('side-link') || n.classList.contains('side-sublink')) && n.style.display !== 'none') { anyVisible = true; break; }
        n = n.nextElementSibling;
      }
      label.style.display = anyVisible ? '' : 'none';
    });
    var seenLink = false, lastShownDivider = null;
    Array.prototype.forEach.call(document.querySelectorAll('.sidebar > *'), function (el) {
      if (el.classList.contains('side-divider')) {
        if (el.id === 'sideAdminDivider') { // visibility owned by the admin toggle above
          if (el.style.display !== 'none') { lastShownDivider = el; seenLink = false; }
          return;
        }
        if (seenLink) { el.style.display = ''; lastShownDivider = el; seenLink = false; }
        else { el.style.display = 'none'; }
        return;
      }
      if ((el.classList.contains('side-link') || el.classList.contains('side-sublink')) && el.style.display !== 'none') seenLink = true;
    });
    if (lastShownDivider && !seenLink) lastShownDivider.style.display = 'none';
  }

  function applyChip(user) {
    var chip = $('userChip'); if (chip) chip.style.display = '';
    var sbtn = $('topbarSearchBtn'); if (sbtn) sbtn.style.display = '';
    var name = user.displayName || user.username;
    var roleLabel = ROLE_LABELS[user.role] || user.role;
    setText('userChipAv', (name || '?').trim().charAt(0).toUpperCase());
    setText('userChipName', name);
    setText('userChipRole', roleLabel);
    setText('userMenuName', name);
    setText('userMenuSub', roleLabel);
    var access = $('userMenuAccess'); if (access) access.style.display = user.role === 'admin' ? '' : 'none';
    // Sidebar account card mirrors the same top-bar chip data - one call
    // site, so the two can never drift out of sync with each other.
    setText('sideAccountAv', (name || '?').trim().charAt(0).toUpperCase());
    setText('sideAccountName', name);
    setText('sideAccountRole', roleLabel);
  }

  function installShowPageGuard() {
    var orig = window.showPage;
    if (typeof orig !== 'function') return;
    window.showPage = function (name) {
      if (CURRENT && !canAccess(CURRENT, name)) name = landingPage(CURRENT);
      rememberPage(CURRENT, name);
      var r = orig.call(this, name);
      if (name === 'accessControl') acRefreshAccessControl();
      return r;
    };
  }

  var IDLE_WARN_SECONDS = 60;
  var _idleTimeoutMs = 15 * 60 * 1000;
  var _idleLastActivity = 0;
  var _idleTicker = null;
  var _idleWarnEl = null;
  var _idleCountdownTimer = null;
  var ACTIVITY_PING_MS = 60000;
  var _activityDirty = false;
  var _activityPingAt = 0;

  window.ctgSetIdleTimeoutMinutes = function (minutes) {
    var m = parseInt(minutes, 10);
    if (m > 0) _idleTimeoutMs = m * 60 * 1000;
  };

  function idleNoteActivity() {
    _idleLastActivity = Date.now();
    _activityDirty = true;
    if (_idleWarnEl) idleDismissWarning();
  }

  function idleSendActivityPing() {
    if (!REMOTE || !CURRENT || !_activityDirty) return;
    if (Date.now() - _activityPingAt < ACTIVITY_PING_MS) return;
    _activityDirty = false;
    _activityPingAt = Date.now();
    /* Put the flag BACK on failure. It used to be cleared unconditionally, so
       a ping lost to a restart or a blip was never retried until the person
       happened to interact again - and the SERVER's clock, which is the one
       that actually ends the session, stayed stale in the meantime. */
    apiFetch('/api/activity', { method: 'POST' }).catch(function () { _activityDirty = true; });
  }

  function idleStart() {
    idleStop();
    _idleLastActivity = Date.now();
    // Sign-in already stamped the session, so the clock starts fresh; zeroing
    // this just means the first real interaction pings without waiting a minute.
    _activityDirty = false;
    _activityPingAt = Date.now();
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (evt) {
      document.addEventListener(evt, idleNoteActivity, { passive: true, capture: true });
    });
    _idleTicker = setInterval(idleCheck, 5000);
  }

  function idleStop() {
    if (_idleTicker) { clearInterval(_idleTicker); _idleTicker = null; }
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (evt) {
      document.removeEventListener(evt, idleNoteActivity, { capture: true });
    });
    idleDismissWarning();
  }

  function idleCheck() {
    if (!CURRENT) return;
    idleSendActivityPing();
    var idleMs = Date.now() - _idleLastActivity;
    var remainingMs = _idleTimeoutMs - idleMs;
    if (remainingMs <= 0) { idleExpire(); return; }
    if (remainingMs <= IDLE_WARN_SECONDS * 1000) idleShowWarning(remainingMs);
  }

  function idleShowWarning(remainingMs) {
    if (_idleWarnEl) return;
    var el = document.createElement('div');
    el.className = 'ctg-idle-overlay';
    el.innerHTML = '<div class="ctg-idle-card" role="alertdialog" aria-labelledby="ctgIdleTitle">'
      + '<div class="ctg-idle-icon">!</div>'
      + '<div id="ctgIdleTitle" class="ctg-idle-title">Still there?</div>'
      + '<div class="ctg-idle-copy">You\'ll be signed out automatically in <strong id="ctgIdleCount">' + Math.ceil(remainingMs / 1000) + '</strong> seconds to protect patient information.</div>'
      + '<div class="ctg-idle-actions">'
      + '<button type="button" class="btn btn-primary" id="ctgIdleStay">Keep me signed in</button>'
      + '<button type="button" class="btn" id="ctgIdleOut">Sign out now</button>'
      + '</div></div>';
    document.body.appendChild(el);
    _idleWarnEl = el;
    el.querySelector('#ctgIdleStay').addEventListener('click', function () { idleNoteActivity(); });
    el.querySelector('#ctgIdleOut').addEventListener('click', function () { idleStop(); window.logout(); });

    _idleCountdownTimer = setInterval(function () {
      var left = Math.ceil((_idleTimeoutMs - (Date.now() - _idleLastActivity)) / 1000);
      var span = document.getElementById('ctgIdleCount');
      if (span) span.textContent = Math.max(0, left);
      if (left <= 0) idleExpire();
    }, 1000);
  }

  function idleDismissWarning() {
    if (_idleCountdownTimer) { clearInterval(_idleCountdownTimer); _idleCountdownTimer = null; }
    if (_idleWarnEl) { try { _idleWarnEl.remove(); } catch (e) {} _idleWarnEl = null; }
  }

  /* Signed out by the server rather than by this tab's own idle timer, so
     there is no flush of pending work here the way idleExpire does one: the
     session is already gone, and the write would only come back 401. Anything
     unsent is held for this account and replayed when it signs in again. */
  function handleSessionRevoked() {
    if (!CURRENT) return;
    idleStop();
    _csrfToken = '';
    endLocalSession('You were signed out. Please sign in again.');
  }

  /* What this browser keeps that came from patient records (CTG-SEC-071):
     copies of chart notes and diagnoses, patient SMS threads and contacts,
     internal messages, the contact list, the old patient-list cache and its
     IndexedDB database, appointment undo history. All of it can be fetched
     again, and none of it was removed at sign-out or idle logoff, so on a
     shared clinic PC it stayed on disk for whoever signed in next. Unsaved
     work is deliberately not on the list: unsent chart saves and the Day 1
     draft are kept for the account that made them, and only ever sent or
     restored for that account. Only on the live portal - the offline copy
     keeps its records in this browser on purpose. */
  var PHI_CACHE_KEYS = ['ctg_patient_charts_v1', 'ctg_patient_charts_owner', 'ctg_patient_messaging_v1', 'ctg_patient_contacts_v1',
    'ctg_internal_messaging_v1', 'ctg_internal_messaging_drafts_v1', 'ctg_contacts_v1', 'ctg_portal_patients_v1',
    // No longer written, but left on PCs by the portal's earlier browser-only
    // version: patients and appointments, and account records with passwords.
    'ctg_appointments', 'ctg_break_blocks', 'ctg_auth_accounts_v1'];
  var PHI_CACHE_PREFIXES = ['ctg_appt_undo_'];
  var SIGNED_OUT_NOTE_KEY = 'ctg_signed_out_note';
  function wipeLocalPhi() {
    if (!REMOTE) return;
    try {
      PHI_CACHE_KEYS.forEach(function (k) { localStorage.removeItem(k); });
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && PHI_CACHE_PREFIXES.some(function (p) { return k.indexOf(p) === 0; })) localStorage.removeItem(k);
      }
    } catch (e) {}
    try { if (window.indexedDB) window.indexedDB.deleteDatabase('ctg_portal_db'); } catch (e) {}
  }
  window.ctgWipeLocalPhi = wipeLocalPhi;

  /* Ends the session on this device: keeps any unsent chart saves for this
     account, clears the copies above, and reloads, so nothing of the last
     user's - in memory, in the page behind the sign-in screen, or on disk - is
     there for the next person. The message is shown again after the reload. */
  function endLocalSession(message) {
    if (typeof window.ctgSavePatientOutbox === 'function') { try { window.ctgSavePatientOutbox(); } catch (e) {} }
    wipeLocalPhi();
    try { if (message) sessionStorage.setItem(SIGNED_OUT_NOTE_KEY, message); } catch (e) {}
    location.reload();
  }

  async function idleExpire() {
    idleStop();
    /* Write anything outstanding before the session goes away. An idle timeout
     comes through here too, and that is precisely when unsaved clinical work is
     most likely to be sitting in the buffer. */
  if (typeof window.ctgFlushPatientSaves === 'function') {
    try { await window.ctgFlushPatientSaves({ wait: true }); } catch (e) {}
  }
  try { await backend.logout(); } catch (e) {}
    _csrfToken = '';
    endLocalSession('You were signed out after a period of inactivity.');
  }

  /* ---------- login / logout flow ---------- */
  function showApp(user) {
    /* Nobody is signed in, as far as the rest of the page can tell, until the
       Authorized User Policy is accepted (CTG-SEC-087): Internal Messaging
       watches ctgCurrentUser() and loaded every conversation behind the policy
       screen. The server refuses those requests too (middleware/auth.js). */
    if (typeof window.ctgPolicyGate === 'function' && !user.__policyChecked) {
      CURRENT = null;
      window.ctgPolicyOnAccepted = function () {
        user.__policyChecked = true;
        showApp(user);
      };
      var proceed = window.ctgPolicyGate(user);
      if (proceed && typeof proceed.then === 'function') {
        proceed.then(function (ok) { if (ok) { user.__policyChecked = true; showApp(user); } });
        return;
      }
      /* Non-promise return is not expected, but falling through here keeps the
         old behaviour rather than leaving someone staring at a blank page. */
    }
    CURRENT = user;

    document.body.classList.remove('auth-active');
    var ov = $('authOverlay'); if (ov) ov.classList.add('hidden');

    applyChip(user);
    applySidebar(user);
    if (typeof window.syncSidebarLogo === 'function') window.syncSidebarLogo();
    if (typeof window.ctgLoadProviders === 'function') window.ctgLoadProviders();
    // Anything that never reached the server last session goes out now.
    if (typeof window.ctgRestorePatientOutbox === 'function') {
      setTimeout(function () { window.ctgRestorePatientOutbox(); }, 2500);
    }
    window.showPage(resumePage(user));
    refreshLawFirmsCache().then(function () {
      window.ctgRefreshLawFirmSelections();
      if (user.role === 'admin' && acActiveTab === 'lawFirms') renderAcLawFirms();
    });
    window.ctgRefreshLawFirmSelections();
    if (user.role === 'admin') acRefreshAccessControl();
    // Real data lives behind the login-gated API now - load it once we know
    // who's signed in (there's nothing to fetch before that).
    if (typeof window.ctgLoadPatientStore === 'function') window.ctgLoadPatientStore();
    if (typeof window.ctgLoadAppointmentsStore === 'function') window.ctgLoadAppointmentsStore();
    connectRealtime();
    /* The appointment watcher runs for the whole session, not just while the
       Command Center is open - the point of the alert is that you are looking
       at something else when it fires. */
    if (typeof window.ctgApptAlertsStart === 'function') window.ctgApptAlertsStart();
    idleStart();
  }
  function showLogin() {
    CURRENT = null;
    disconnectRealtime();
    if (typeof window.ctgApptAlertsStop === 'function') window.ctgApptAlertsStop();
    idleStop();
    document.body.classList.add('auth-active');
    document.body.classList.remove('appointments-active','patient-messaging-active','internal-messaging-active');
    var apptSummary = $('apptTopbarSummary'); if (apptSummary) apptSummary.style.display = 'none';
    var ov = $('authOverlay'); if (ov) ov.classList.remove('hidden');
    var chip = $('userChip'); if (chip) chip.style.display = 'none';
    var sbtn = $('topbarSearchBtn'); if (sbtn) sbtn.style.display = 'none';
    var menu = $('userMenu'); if (menu) menu.classList.remove('open');
    var overlay = $('sidebarOverlay'); if (overlay) overlay.classList.remove('open');
  }

  var SIGN_IN_BTN_HTML = 'Sign In <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  var VERIFY_BTN_HTML = 'Verify <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var _mfaChallengeId = null;

  function authShowError(msg) {
    var err = $('authError');
    if (err) { err.textContent = msg; err.classList.add('show'); }
  }
  function authClearError() { var err = $('authError'); if (err) err.classList.remove('show'); }

  // Swaps the card between the password step and the emailed-code step.
  function authShowMfaStep(on, emailHint) {
    var pwForm = $('authForm'), codeForm = $('authMfaForm'), hint = $('authHint');
    if (pwForm) pwForm.style.display = on ? 'none' : '';
    if (codeForm) codeForm.style.display = on ? '' : 'none';
    if (hint) hint.style.display = on ? 'none' : '';
    if (on) {
      setText('authMfaHint', emailHint || 'your email');
      setVal('authCode', '');
      var input = $('authCode'); if (input) setTimeout(function () { input.focus(); }, 50);
    }
  }

  window.ctgCancelMfa = function () {
    _mfaChallengeId = null;
    authClearError();
    authShowMfaStep(false);
    setVal('authPass', '');
    var u = $('authUser'); if (u) u.focus();
  };

  window.ctgResendCode = async function () {
    if (!_mfaChallengeId) return;
    var btn = $('authResendBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    authClearError();
    try {
      var d = await backend.resendLoginCode(_mfaChallengeId);
      _mfaChallengeId = d.challengeId;
      setText('authMfaHint', d.emailHint || 'your email');
      setVal('authCode', '');
      toast('A new code is on its way');
    } catch (e) {
      authShowError(e.message || 'Could not resend the code.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send a new code'; }
    }
  };

  /* ---- Self-service "Change Password" (already signed in): current
     password IS the proof of identity, so this is a single step - no
     emailed code. See POST /api/me/password in backend/src/routes/auth.js. */
  function pwFeedback(id, tagId, msg, cls) {
    var fb = $(id), tag = $(tagId);
    if (tag) { tag.textContent = msg; tag.className = 'tag ' + (cls || 'tr'); }
    if (fb) fb.style.display = '';
  }

  window.openChangePassword = function () {
    setVal('cpwCurrent', ''); setVal('cpwNew', ''); setVal('cpwConfirm', '');
    var fb = $('cpwFeedback'); if (fb) fb.style.display = 'none';
    var modal = $('changePasswordModal');
    if (modal) { modal.classList.add('show'); document.body.classList.add('modal-open'); }
  };
  window.closeChangePassword = function () {
    var modal = $('changePasswordModal');
    if (modal) { modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
  };

  window.submitChangePassword = async function () {
    var current = val('cpwCurrent'), next = val('cpwNew'), confirm = val('cpwConfirm');
    var fb = $('cpwFeedback'); if (fb) fb.style.display = 'none';
    if (!current || !next) { pwFeedback('cpwFeedback', 'cpwFeedbackTag', 'Enter your current and new password.'); return; }
    var pwErr = passwordPolicyError(next);
    if (pwErr) { pwFeedback('cpwFeedback', 'cpwFeedbackTag', pwErr); return; }
    if (next !== confirm) { pwFeedback('cpwFeedback', 'cpwFeedbackTag', 'New password and confirmation do not match.'); return; }

    var btn = $('cpwSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      var d = await apiFetch('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      _csrfToken = d.csrfToken || _csrfToken;
      window.closeChangePassword();
      toast('Password changed');
    } catch (e) {
      pwFeedback('cpwFeedback', 'cpwFeedbackTag', e.message || 'Could not change the password.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Password'; }
    }
  };

  /* ---- "Forgot password" (login screen, no session): username, then an
     emailed one-time code that's submitted together with the new password
     in one step. See POST /api/forgot-password/start|verify|resend. ---- */
  var _fpwChallengeId = null;

  window.openForgotPassword = function () {
    _fpwChallengeId = null;
    setVal('fpwUsername', val('authUser') || '');
    setVal('fpwCode', ''); setVal('fpwNew', ''); setVal('fpwConfirm', '');
    var fb1 = $('fpwFeedback'), fb2 = $('fpwResetFeedback');
    if (fb1) fb1.style.display = 'none';
    if (fb2) fb2.style.display = 'none';
    var form1 = $('fpwForm'), form2 = $('fpwResetForm');
    if (form1) form1.style.display = '';
    if (form2) form2.style.display = 'none';
    var sendBtn = $('fpwSendBtn'), resetBtn = $('fpwResetBtn');
    if (sendBtn) { sendBtn.style.display = ''; sendBtn.disabled = false; sendBtn.textContent = 'Send Code'; }
    if (resetBtn) resetBtn.style.display = 'none';
    var modal = $('forgotPasswordModal');
    if (modal) { modal.classList.add('show'); document.body.classList.add('modal-open'); }
  };
  window.closeForgotPassword = function () {
    var modal = $('forgotPasswordModal');
    if (modal) { modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
  };

  window.startForgotPassword = async function () {
    var username = val('fpwUsername').trim();
    var fb = $('fpwFeedback'); if (fb) fb.style.display = 'none';
    if (!username) { pwFeedback('fpwFeedback', 'fpwFeedbackTag', 'Enter your username.'); return; }

    var btn = $('fpwSendBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var d = await apiFetch('/api/forgot-password/start', { method: 'POST', body: JSON.stringify({ username: username }) });
      _fpwChallengeId = d.challengeId;
      setText('fpwCodeHint', d.emailHint || 'the email on file for that account');
      var form1 = $('fpwForm'), form2 = $('fpwResetForm');
      if (form1) form1.style.display = 'none';
      if (form2) form2.style.display = '';
      if (btn) btn.style.display = 'none';
      var resetBtn = $('fpwResetBtn'); if (resetBtn) resetBtn.style.display = '';
      var code = $('fpwCode'); if (code) setTimeout(function () { code.focus(); }, 50);
    } catch (e) {
      pwFeedback('fpwFeedback', 'fpwFeedbackTag', e.message || 'Could not send the code.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Code'; }
    }
  };

  window.submitForgotPasswordReset = async function () {
    if (!_fpwChallengeId) return;
    var code = String(val('fpwCode') || '').trim();
    var next = val('fpwNew'), confirm = val('fpwConfirm');
    var fb = $('fpwResetFeedback'); if (fb) fb.style.display = 'none';
    if (!/^\d{6}$/.test(code)) { pwFeedback('fpwResetFeedback', 'fpwResetFeedbackTag', 'Enter the 6-digit code from your email.'); return; }
    var pwErr = passwordPolicyError(next);
    if (pwErr) { pwFeedback('fpwResetFeedback', 'fpwResetFeedbackTag', pwErr); return; }
    if (next !== confirm) { pwFeedback('fpwResetFeedback', 'fpwResetFeedbackTag', 'New password and confirmation do not match.'); return; }

    var btn = $('fpwResetBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }
    try {
      await apiFetch('/api/forgot-password/verify', { method: 'POST', body: JSON.stringify({ challengeId: _fpwChallengeId, code: code, newPassword: next }) });
      _fpwChallengeId = null;
      window.closeForgotPassword();
      toast('Password reset — sign in with your new password');
      setVal('authPass', '');
      var u = $('authUser'); if (u) u.focus();
    } catch (e) {
      pwFeedback('fpwResetFeedback', 'fpwResetFeedbackTag', e.message || 'That code is not correct.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reset Password'; }
    }
  };

  window.resendForgotPasswordCode = async function () {
    if (!_fpwChallengeId) return;
    try {
      var d = await apiFetch('/api/forgot-password/resend', { method: 'POST', body: JSON.stringify({ challengeId: _fpwChallengeId }) });
      _fpwChallengeId = d.challengeId;
      setText('fpwCodeHint', d.emailHint || 'the email on file for that account');
      setVal('fpwCode', '');
      toast('A new code is on its way');
    } catch (e) {
      pwFeedback('fpwResetFeedback', 'fpwResetFeedbackTag', e.message || 'Could not resend the code.');
    }
  };

  async function handleLoginSubmit() {
    var btn = $('authSubmit');
    authClearError();
    if (btn) { btn.disabled = true; btn.innerHTML = 'Signing in…'; }
    try {
      var result = await backend.login(val('authUser'), val('authPass'));
      setVal('authPass', '');
      if (result && result.mfaRequired) {
        _mfaChallengeId = result.challengeId;
        authShowMfaStep(true, result.emailHint);
        return;
      }
      showApp(result);
    } catch (e) {
      authShowError(e.message || 'Invalid username or password.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = SIGN_IN_BTN_HTML; }
    }
  }

  async function handleMfaSubmit() {
    if (!_mfaChallengeId) return;
    var btn = $('authCodeSubmit');
    var code = String(val('authCode') || '').trim();
    if (!/^\d{6}$/.test(code)) { authShowError('Enter the 6-digit code from your email.'); return; }
    authClearError();
    if (btn) { btn.disabled = true; btn.innerHTML = 'Verifying…'; }
    try {
      var user = await backend.verifyLoginCode(_mfaChallengeId, code);
      _mfaChallengeId = null;
      authShowMfaStep(false);
      showApp(user);
    } catch (e) {
      authShowError(e.message || 'That code is not correct.');
      // An expired or exhausted challenge can't be retried - send them back
      // to the password step rather than letting them type into a dead form.
      if (e.status === 401 || e.status === 429) {
        if (/expired|sign in again/i.test(e.message || '')) { _mfaChallengeId = null; authShowMfaStep(false); }
      }
      setVal('authCode', '');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = VERIFY_BTN_HTML; }
    }
  }

  window.logout = async function () {
    // Send what is pending first, as idleExpire does; anything that still fails is held for this account.
    if (typeof window.ctgFlushPatientSaves === 'function') {
      try { await window.ctgFlushPatientSaves({ wait: true }); } catch (e) {}
    }
    try { await backend.logout(); } catch (e) {}
    endLocalSession('');
  };
  window.toggleUserMenu = function (e) { if (e) e.stopPropagation(); var m = $('userMenu'); if (m) m.classList.toggle('open'); };
  window.closeUserMenu = function () { var m = $('userMenu'); if (m) m.classList.remove('open'); };

  /* ======================================================================
     ACCESS CONTROL (admin panel)
     ====================================================================== */
  var acEditingId = null;

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var ICON_DEL  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICON_SLIDERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="10" r="2" fill="currentColor"/><circle cx="20" cy="14" r="2" fill="currentColor"/></svg>';
  var ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  var ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-3.5 3.5a5.5 5.5 0 1 1-7.778 7.778A5.5 5.5 0 0 1 15.5 7.5zm0 0L19 4m0 0l3 3-3.5 3.5"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_UNLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

  function acInitials(u) {
    var n = (u.displayName || u.username || '?').trim();
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  var acActiveTab = 'addAccount';
  var acOpenAccounts = {};
  var acOpenPages = {};
  function acOpenPageKey(accountId, pageKey) { return String(accountId || '') + '::' + String(pageKey || ''); }
  function acCaptureOpenPanels() {
    document.querySelectorAll('#acMatrixMount .ac-account-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      if (id) acOpenAccounts[id] = !!card.open;
    });
    document.querySelectorAll('#acMatrixMount .ac-page-perm').forEach(function (page) {
      var id = page.getAttribute('data-account-id');
      var pageKey = page.getAttribute('data-page-key');
      if (id && pageKey) acOpenPages[acOpenPageKey(id, pageKey)] = !!page.open;
    });
  }
  window.acRememberAccountOpen = function (el) {
    var id = el && el.getAttribute('data-id');
    if (id) acOpenAccounts[id] = !!el.open;
  };
  window.acRememberPageOpen = function (el) {
    var id = el && el.getAttribute('data-account-id');
    var pageKey = el && el.getAttribute('data-page-key');
    if (id && pageKey) acOpenPages[acOpenPageKey(id, pageKey)] = !!el.open;
  };

  window.acSwitchTab = function (tab) {
    acActiveTab = tab || 'addAccount';
    document.querySelectorAll('#acPageTabs .ac-page-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-ac-tab') === acActiveTab);
    });
    document.querySelectorAll('#page-accessControl .ac-page-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'acPanel-' + acActiveTab);
    });
    if (acActiveTab === 'accounts') renderAcMatrix();
    if (acActiveTab === 'lawFirms') renderAcLawFirms();
    if (acActiveTab === 'audit') auditOpen();
    if (acActiveTab === 'review') arRender();
    if (acActiveTab === 'pendingAmendments' && typeof window.renderPendingAmendments === 'function') window.renderPendingAmendments();
    if (acActiveTab === 'privacyRequests' && typeof window.renderPatientRequests === 'function') window.renderPatientRequests();
    if (acActiveTab === 'disclosureLog' && typeof window.renderDisclosureLog === 'function') window.renderDisclosureLog();
    if (acActiveTab === 'backup' && typeof window.renderBackups === 'function') window.renderBackups();
    if (acActiveTab === 'settings' && typeof window.stLoadSettings === 'function') window.stLoadSettings();
  };

  /* Audit logging: a read-only view over the audit_log table the backend has
     been writing to all along, covering every login and every account and
     patient change. Admin-only and paginated server-side, since the table can
     grow indefinitely and must never be loaded into the browser wholesale. */
  var AUDIT_PAGE_SIZE = 50;
  var auditOffset = 0;
  var auditTotal = 0;
  var auditFiltersLoaded = false;

  function auditOpen() {
    auditOffset = 0;
    if (!auditFiltersLoaded) {
      auditFiltersLoaded = true;
      apiFetch('/api/audit/filters').then(function (d) {
        var actionSel = $('auditAction');
        if (actionSel) {
          (d.actions || []).forEach(function (a) {
            var o = document.createElement('option');
            o.value = a; o.textContent = auditActionLabel(a);
            actionSel.appendChild(o);
          });
        }
        var actorSel = $('auditActor');
        if (actorSel) {
          (d.actors || []).forEach(function (u) {
            var o = document.createElement('option');
            o.value = u.id; o.textContent = u.displayName || u.username;
            actorSel.appendChild(o);
          });
        }
      }).catch(function () { auditFiltersLoaded = false; });
    }
    auditLoad();
  }

  window.auditReload = function () { auditOffset = 0; auditLoad(); };
  window.auditPage = function (dir) {
    var next = auditOffset + dir * AUDIT_PAGE_SIZE;
    if (next < 0 || next >= auditTotal) return;
    auditOffset = next;
    auditLoad();
  };
  window.auditClearFilters = function () {
    ['auditAction', 'auditActor', 'auditFrom', 'auditTo'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    auditOffset = 0;
    auditLoad();
  };

  var arEntries = [];
  var arVersion = 0;
  var arLoaded = false;

  function arFmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (m[2] + '/' + m[3] + '/' + m[1]) : '\u2014';
  }
  function arToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function arWho() {
    var u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null;
    return (u && (u.displayName || u.username)) || 'Staff';
  }

  function arLoad() {
    return apiFetch('/api/shared/doc/auditReviewLog').then(function (r) {
      arVersion = r.version || 0;
      var d = r.data || {};
      arEntries = Array.isArray(d.entries) ? d.entries : [];
      arLoaded = true;
    }).catch(function () { arLoaded = true; });
  }
  function arSave() {
    return apiFetch('/api/shared/doc/auditReviewLog', {
      method: 'PUT',
      body: JSON.stringify({ data: { entries: arEntries }, version: arVersion })
    }).then(function (r) { arVersion = r.version; }).catch(function (e) {
      toast((e && e.body && e.body.error) || 'Could not save \u2014 reload and try again', 'err');
      arVersion = (e && e.body && e.body.version) || arVersion;
      return arLoad().then(arRender);
    });
  }

  function arRender() {
    var mount = $('arListMount');
    if (!mount) return;
    if (!arLoaded) { arLoad().then(arRender); return; }
    var rows = arEntries.slice().sort(function (a, b) { return String(b.reviewedOn || '').localeCompare(String(a.reviewedOn || '')); });
    if (!rows.length) {
      mount.innerHTML = '<div class="pld-empty-state">No reviews logged yet. Log one after you have gone through the audit trail above.</div>';
      return;
    }
    var h = '<div class="dash-appt-list">';
    rows.forEach(function (e) {
      /* Escalated outranks "issues found": an anomaly that became an incident
         is the one a reviewer needs to see first. */
      var badge = e.status === 'Escalated'
        ? '<span class="pr-pill over">Escalated</span>'
        : (e.issuesFound
            ? '<span class="pr-pill soon">Issues found</span>'
            : '<span class="pr-pill ok">No issues found</span>');
      var facts = [];
      if (e.recordsReviewed) facts.push(Number(e.recordsReviewed).toLocaleString() + ' records reviewed');
      if (e.anomalies) facts.push(e.anomalies + ' anomal' + (Number(e.anomalies) === 1 ? 'y' : 'ies'));
      if (e.incidentsOpened) facts.push(e.incidentsOpened + ' incident referral' + (Number(e.incidentsOpened) === 1 ? '' : 's'));
      h += '<div class="dash-appt-row" data-cs="'+__cs+'cursor:default;align-items:flex-start">'
        + '<span class="dash-appt-main">'
        + '<span class="dash-appt-name">' + escHtml(arFmtDate(e.periodFrom)) + ' \u2013 ' + escHtml(arFmtDate(e.periodTo))
        + ' &nbsp;' + badge + '</span>'
        + '<span class="dash-recent-sub">Reviewed ' + escHtml(arFmtDate(e.reviewedOn)) + ' by ' + escHtml(e.by || 'Staff')
        + (facts.length ? '  \u00b7  ' + escHtml(facts.join('  \u00b7  ')) : '')
        + (e.notes ? '<br>' + escHtml(e.notes) : '') + '</span>'
        + '</span></div>';
    });
    h += '</div>';
    mount.innerHTML = h;
  }
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.arOpenAdd = function () {
    var body = $('arAddBody');
    if (!body) return;
    body.innerHTML = '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
      + '<div class="fg"><label>Period covered \u2014 from</label><input type="date" id="arFrom"></div>'
      + '<div class="fg"><label>Period covered \u2014 to</label><input type="date" id="arTo" value="' + arToday() + '"></div>'
      + '<div class="fg"><label>Reviewer</label><input type="text" id="arReviewer" value="' + escHtml(arWho()) + '"></div>'
      + '<div class="fg"><label>Records reviewed</label><input type="number" id="arCount" min="0" placeholder="e.g. 1842"></div>'
      + '</div>'
      + '<label class="plain-check" data-cs="'+__cs+'margin:10px 0 0"><input type="checkbox" id="arIssues" data-onchange="arIssuesChanged()"> Issues were found during this review</label>'
      /* The counts only make sense once something was actually found, so they
         stay hidden until then rather than inviting zeros everywhere. */
      + '<div id="arFindings" data-cs="'+__cs+'display:none;margin-top:10px">'
        + '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
          + '<div class="fg"><label>Anomalies found</label><input type="number" id="arAnomalies" min="0" value="1"></div>'
          + '<div class="fg"><label>Incident referrals opened</label><input type="number" id="arIncidents" min="0" value="0"></div>'
        + '</div>'
        + '<label class="plain-check" data-cs="'+__cs+'margin:6px 0 0"><input type="checkbox" id="arEscalated"> Escalated \u2014 referred as a security incident</label>'
      + '</div>'
      + '<div class="fg" data-cs="'+__cs+'margin-top:10px"><label>Findings / notes</label>'
      + '<textarea id="arNotes" rows="3" placeholder="What was checked, and what (if anything) was found"></textarea></div>'
      + '<div id="arAddErr" data-cs="'+__cs+'display:none;color:var(--red);font-size:12px;font-weight:700;margin-top:8px"></div>';
    $('arAddModal').classList.add('show');
  };
  window.arIssuesChanged = function () {
    var box = $('arIssues');
    var wrap = $('arFindings');
    if (wrap) wrap.style.display = (box && box.checked) ? '' : 'none';
  };
  window.arCloseAdd = function () {
    var m = $('arAddModal'); if (m) m.classList.remove('show');
  };
  window.arSubmitAdd = function () {
    var from = ($('arFrom') || {}).value || '';
    var to = ($('arTo') || {}).value || '';
    var err = $('arAddErr');
    if (!to) {
      if (err) { err.textContent = 'The date the review covers through is required.'; err.style.display = ''; }
      return;
    }
    if (!arLoaded) arEntries = [];
    var issues = !!($('arIssues') || {}).checked;
    var escalated = issues && !!($('arEscalated') || {}).checked;
    arEntries.push({
      id: 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      reviewedOn: arToday(),
      periodFrom: from,
      periodTo: to,
      issuesFound: issues,
      status: escalated ? 'Escalated' : 'Reviewed',
      recordsReviewed: Number(($('arCount') || {}).value || 0) || 0,
      anomalies: issues ? (Number(($('arAnomalies') || {}).value || 0) || 0) : 0,
      incidentsOpened: issues ? (Number(($('arIncidents') || {}).value || 0) || 0) : 0,
      notes: (($('arNotes') || {}).value || '').trim(),
      by: (($('arReviewer') || {}).value || '').trim() || arWho()
    });
    arLoaded = true;
    window.arCloseAdd();
    arRender();
    arSave().then(function () { toast('Review logged'); });
  };
  document.addEventListener('keydown', function (e) {
    var m = $('arAddModal');
    if (e.key === 'Escape' && m && m.classList.contains('show')) window.arCloseAdd();
  });

  // Raw action codes are how the rows are stored; these are what a compliance
  // reviewer actually needs to read.
  function auditActionLabel(action) {
    return ({
      login: 'Signed in',
      logout: 'Signed out',
      login_failed: 'Failed sign-in',
      login_blocked: 'Blocked (too many attempts)',
      create: 'Created',
      update: 'Updated',
      delete: 'Deleted',
      update_pages: 'Changed permissions',
      activate: 'Activated',
      deactivate: 'Deactivated',
      reset_password: 'Reset password',
      view: 'Viewed',
      export: 'Exported (download)',
      export_burst: 'Unusually many downloads',
      access_denied: 'Access denied',
      access_denied_burst: 'Repeatedly denied access',
      signed_record_change_refused: 'Change to a signed record refused',
      sign: 'Signed record',
      amend: 'Amended record',
      'meeting.recording.start': 'Started recording',
      'meeting.recording.stop': 'Stopped recording',
      'meeting.recording.view': 'Viewed recording',
      'meeting.recording.download': 'Downloaded recording',
      'meeting.recording.transcribe': 'Requested transcript',
      'meeting.recording.share.create': 'Created share link',
      'meeting.recording.share.revoke': 'Revoked share link',
      'meeting.recording.delete': 'Deleted recording',
      'shared.save': 'Saved shared document',
      'patient.chart.save': 'Saved patient chart',
      'policy.acknowledge': 'Acknowledged policy',
      'settings.grammarDeepCheck': 'Changed grammar Deep Check setting',
      accept: 'Accepted',
      admit: 'Admitted guest',
      attachment_upload: 'Uploaded attachment',
      'backup.create': 'Created backup',
      'backup.prune': 'Pruned backups',
      'backup.restore': 'Restored backup',
      'backup.verify': 'Verified backup',
      cancel: 'Cancelled',
      change_password: 'Changed password',
      change_password_failed: 'Failed password change',
      checkin: 'Checked in',
      end: 'Ended meeting',
      invite_sent: 'Invite sent',
      meeting_rename_participant: 'Renamed participant',
      meeting_transcript_download: 'Downloaded transcript',
      meeting_translation_set: 'Changed translation',
      mfa_blocked: 'MFA blocked',
      mfa_code_sent: 'Sign-in code sent',
      mfa_failed: 'Failed MFA',
      mfa_send_failed: 'MFA code send failed',
      mfa_unavailable: 'MFA unavailable',
      password_reset: 'Password reset',
      password_reset_blocked: 'Password reset blocked',
      password_reset_code_sent: 'Password reset code sent',
      password_reset_failed: 'Failed password reset',
      ready: 'Marked ready',
      reissue: 'Reissued',
      remove: 'Removed',
      submit: 'Submitted'
    })[action] || auditHumanAction(action);
  }
  /* An unmapped action used to print its raw key - "meeting_translation_set"
     sitting in a badge next to "Signed in". Anything the map misses, including
     actions added after this was written, at least reads as words. */
  function auditHumanAction(action) {
    var a = String(action == null ? '' : action).replace(/[._]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
    return a ? a.charAt(0).toUpperCase() + a.slice(1) : '';
  }
  /* The rows a reviewer should stop on. Every failed or blocked credential
     attempt belongs here, not just the sign-in ones - a run of failed MFA or
     password-reset attempts is the same signal wearing a different name. */
  var AUDIT_ALERT = ['login_failed', 'login_blocked', 'delete', 'mfa_failed', 'mfa_blocked',
    'change_password_failed', 'password_reset_failed', 'password_reset_blocked', 'export_burst', 'access_denied', 'access_denied_burst', 'signed_record_change_refused'];
  function auditIsAlert(action) {
    return AUDIT_ALERT.indexOf(action) !== -1;
  }
  // Groups the raw action codes into five visual categories so the badge
  // colour tells a reviewer what happened before they read the word: green for
  // a normal sign-in, blue for a routine content change, amber for something
  // that reduces access, red for anything that should draw a second look.
  function auditActionClass(action) {
    if (action === 'login' || action === 'activate' || action === 'sign') return 'act-ok';
    if (action === 'amend' || action === 'export') return 'act-warn';
    if (action === 'logout') return 'act-neutral';
    if (action === 'deactivate') return 'act-warn';
    if (auditIsAlert(action)) return 'act-danger';
    if (action === 'cancel' || action === 'remove' || action === 'backup.restore') return 'act-warn';
    return 'act-info'; // create, update, update_pages, reset_password, view
  }
  // Sign-in events target the account doing the signing in, so repeating the
  // name in the Target column just duplicates the User column. These read
  // better with the target left blank.
  function auditIsSelfAction(action) {
    return action === 'login' || action === 'logout' || action === 'login_failed' || action === 'login_blocked';
  }
  function auditEntityLabel(entityType) {
    return ({
      account: 'Account',
      patient_ace: 'Day 1 (ACE)',
      patient_exam: 'Examination',
      patient_daily_note: 'Daily Note',
      patient: 'Patient',
      patient_full: 'Patient record',
      appointment: 'Appointment',
      break_block: 'Break / block',
      law_firm: 'Law firm',
      message: 'Message',
      meeting: 'Meeting',
      meeting_recording: 'Recording',
      shared_doc: 'Shared document'
    })[entityType] || entityType || '';
  }
  // Turns the raw entity_type + ids into something a reviewer can read at a
  // glance: "Patient record - John Smith" rather than
  // "patient_full · patient pt_1785517793854_495c6b6df44ed8".
  function auditBytes(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return '';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(1) : String(n)) + ' ' + u[i];
  }
  /* "tl" means nothing to somebody reviewing an access log. Intl does this
     without shipping a language table, and falls back to the raw code. */
  function auditLangName(code) {
    var c = String(code == null ? '' : code).trim();
    if (!c) return '';
    try {
      var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c);
      if (n && n.toLowerCase() !== c.toLowerCase()) return n;
    } catch (_) {}
    return c;
  }
  function auditHumanKey(k) {
    return String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  }
  function auditDetailValue(key, val) {
    if (val === true) return 'yes';
    if (val === false) return 'no';
    if (val == null || val === '') return '';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '';
    /* Nested objects are skipped rather than stringified - one row of JSON
       braces would cost more legibility than the value it carries. */
    if (typeof val === 'object') return '';
    if (/bytes$/i.test(key)) return auditBytes(val);
    if (/(lang|read|speak)$/i.test(key)) return auditLangName(val);
    return String(val);
  }
  function auditDetailHTML(e) {
    var raw = e.detail;
    if (!raw) return '';
    var obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); }
      catch (_) {
        var t = raw.trim();
        return t ? '<span class="ac-audit-detail">' + esc(t) + '</span>' : '';
      }
    }
    if (!obj || typeof obj !== 'object') return '';
    var parts = [];
    Object.keys(obj).forEach(function (k) {
      // Opaque UUIDs - they identify the row for a developer, not for a reviewer.
      if (/id$/i.test(k)) return;
      var v = auditDetailValue(k, obj[k]);
      if (v === '') return;
      parts.push(auditHumanKey(k) + ': ' + v);
    });
    if (!parts.length) return '';
    return '<span class="ac-audit-detail">' + esc(parts.join(' · ')) + '</span>';
  }
  function auditDuration(ms) {
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm';
    return (s % 60) + 's';
  }
  function auditSessionCellHTML(e) {
    if (!e.sessionMs) return '<span class="ac-audit-dash">—</span>';
    var d = esc(auditDuration(e.sessionMs));
    if (e.sessionExact === false) {
      return '<span class="ac-audit-session-approx" title="This session has no recorded sign-out '
        + '(the tab was closed, or the sign-in expired), so this is the time to the last action on record.">'
        + '≥ ' + d + '</span>';
    }
    return '<span class="ac-audit-session-exact" title="Signed in to signed out">' + d + '</span>';
  }
  /* A dash means "nothing to show here". Once there is a line to show, the dash
     is no longer true, so it gives way rather than sitting above it. */
  function auditTargetCellHTML(e) {
    var target = auditTargetHTML(e), extra = auditDetailHTML(e);
    if (extra && target.indexOf('ac-audit-dash') !== -1) return extra;
    return target + extra;
  }
  function auditTargetHTML(e) {
    if (auditIsSelfAction(e.action)) return '<span class="ac-audit-dash">—</span>';
    var kind = auditEntityLabel(e.entityType);
    var name = e.targetName;
    if (!name && (e.entityId || e.patientId)) name = '(removed)';
    if (!kind && !name) return '<span class="ac-audit-dash">—</span>';
    return '<span class="ac-audit-kind">' + esc(kind) + '</span>'
      + (name ? '<span class="ac-audit-target-name">' + esc(name) + '</span>' : '');
  }
  function auditWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function auditLoad() {
    var rows = $('auditRows'); if (!rows) return;
    var params = ['limit=' + AUDIT_PAGE_SIZE, 'offset=' + auditOffset];
    var action = ($('auditAction') || {}).value;
    var actor = ($('auditActor') || {}).value;
    var from = ($('auditFrom') || {}).value;
    var to = ($('auditTo') || {}).value;
    if (action) params.push('action=' + encodeURIComponent(action));
    if (actor) params.push('accountId=' + encodeURIComponent(actor));
    if (from) params.push('from=' + encodeURIComponent(from));
    if (to) params.push('to=' + encodeURIComponent(to));

    setText('auditSummary', 'Loading audit trail…');
    apiFetch('/api/audit?' + params.join('&')).then(function (d) {
      auditTotal = d.total || 0;
      var entries = d.entries || [];
      if (!entries.length) {
        rows.innerHTML = '<tr><td colspan="6" class="ac-audit-empty">No audit entries match these filters.</td></tr>';
      } else {
        rows.innerHTML = entries.map(function (e) {
          // A deleted account keeps its history but loses its name - showing
          // "Removed account" is more honest than showing a blank cell.
          var who = e.displayName || e.username || 'Removed account';
          // Normalised by the server - the port is noise for a reviewer, and
          // stripping it in the browser used to truncate IPv6 addresses.
          var ip = e.ipDisplay || String(e.ipAddress || '');
          var loc = e.location || null;
          var place = loc ? (loc.private ? (loc.label || 'Local network') : (loc.country || '')) : '';
          return '<tr' + (auditIsAlert(e.action) ? ' class="is-alert"' : '') + '>'
            + '<td class="ac-audit-when">' + esc(auditWhen(e.createdAt)) + '</td>'
            + '<td>' + esc(who) + '</td>'
            + '<td><span class="ac-audit-action ' + auditActionClass(e.action) + '">' + esc(auditActionLabel(e.action)) + '</span></td>'
            + '<td class="ac-audit-target">' + auditTargetCellHTML(e) + '</td>'
            + '<td class="ac-audit-session">' + auditSessionCellHTML(e) + '</td>'
            /* Country, not city. City-level detail put the same district on every row
               for a practice that works from one region, so it stopped being read; the
               country is the line that changes when a row is worth a second look. The
               address stays underneath as the evidence the country was guessed from. */
            + '<td class="ac-audit-ip">'
              + (place
                  ? '<span class="ac-audit-place' + (loc.private ? ' is-local' : '') + '">'
                    + '<span class="ac-audit-placename">' + esc(place) + '</span>'
                    + (loc.approximate ? '<i title="Resolved from the IP address - a VPN reports its exit country rather than the person">approx.</i>' : '')
                    + '</span>'
                  : '')
              + '<span class="ac-audit-addr">' + esc(ip) + '</span>'
            + '</td>'
            + '</tr>';
        }).join('');
      }
      var first = auditTotal ? auditOffset + 1 : 0;
      var last = Math.min(auditOffset + AUDIT_PAGE_SIZE, auditTotal);
      setText('auditSummary', auditTotal ? ('Showing ' + first + '–' + last + ' of ' + auditTotal + ' recorded events') : 'No recorded events yet.');
      setText('auditPageLabel', auditTotal ? ('Page ' + (Math.floor(auditOffset / AUDIT_PAGE_SIZE) + 1) + ' of ' + Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))) : '');
      var prev = $('auditPrev'), next = $('auditNext');
      if (prev) prev.disabled = auditOffset <= 0;
      if (next) next.disabled = auditOffset + AUDIT_PAGE_SIZE >= auditTotal;
    }).catch(function (err) {
      rows.innerHTML = '<tr><td colspan="6" class="ac-audit-empty">Could not load the audit trail: ' + esc(err.message || 'unknown error') + '</td></tr>';
      setText('auditSummary', '');
    });
  }

  function renderAcLawFirms() {
    var mount = $('acLawFirmListMount');
    if (!mount) return;
    var firms = loadRegisteredLawFirms();
    setText('acLawFirmCountTag', firms.length + ' Law Firm' + (firms.length === 1 ? '' : 's'));
    if (!firms.length) {
      mount.innerHTML = '<div class="pld-empty-state">No law firms registered yet.</div>';
      return;
    }
    mount.innerHTML = '<div class="ac-law-firm-list">' + firms.map(function (name, index) {
      return '<div class="ac-law-firm-row"><span class="ac-law-firm-index">' + (index + 1) + '</span><span class="ac-law-firm-name">' + esc(name) + '</span>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="acRenameLawFirmByIndex(' + index + ')">Rename</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="acDeleteLawFirmByIndex(' + index + ')">Delete</button></div>';
    }).join('') + '</div>';
  }

  window.acAddLawFirm = async function () {
    var input = $('acNewLawFirmName');
    var name = input ? input.value.trim() : '';
    if (!name) { toast('Enter a law firm name', 'err'); return; }
    var firms = loadRegisteredLawFirms();
    if (firms.some(function (x) { return x.toLowerCase() === name.toLowerCase(); })) {
      toast('That law firm is already registered', 'err'); return;
    }
    if (REMOTE) {
      try { await apiFetch('/api/law-firms', { method: 'POST', body: JSON.stringify({ name: name }) }); await refreshLawFirmsCache(); }
      catch (e) {
        /* Resync on failure too. A 409 means the server HAS that firm while
           this list doesn't - the exact state that made the bug so confusing
           so reload and repaint, and the firm the user was told already exists
           actually appears. */
        await refreshLawFirmsCache();
        window.ctgRefreshLawFirmSelections();
        renderAcLawFirms();
        toast(e.message, 'err');
        return;
      }
    } else {
      firms.push(name);
      saveRegisteredLawFirms(firms);
    }
    if (input) input.value = '';
    window.ctgRefreshLawFirmSelections();
    renderAcLawFirms();
    toast('Law firm registered');
  };

  window.acRenameLawFirmByIndex = async function (index) {
    var current = loadRegisteredLawFirms()[index];
    if (!current) return;
    var next = await ctgPrompt('New name for this law firm', {
      title: 'Rename Law Firm',
      subtitle: current,
      value: current,
      rows: 1,
      okLabel: 'Rename',
      // A firm name is a proper noun. Grammar correction must not touch it.
      noGrammar: true,
      hint: 'Every account, patient and referral already linked to this firm will show the new name.'
    });
    if (next === null || next === undefined) return;
    next = String(next).trim();
    if (!next || next === current) return;

    var firms = loadRegisteredLawFirms();
    if (firms.some(function (x, i) { return i !== index && x.toLowerCase() === next.toLowerCase(); })) {
      toast('Another law firm is already registered under that name', 'err'); return;
    }

    if (REMOTE) {
      var row = _lawFirmsFull[index];
      if (!row) { await refreshLawFirmsCache(); renderAcLawFirms(); return; }
      try { await apiFetch('/api/law-firms/' + row.id, { method: 'PUT', body: JSON.stringify({ name: next }) }); await refreshLawFirmsCache(); }
      catch (e) {
        await refreshLawFirmsCache();
        window.ctgRefreshLawFirmSelections();
        renderAcLawFirms();
        toast(e.message, 'err');
        return;
      }
    } else {
      firms[index] = next;
      saveRegisteredLawFirms(firms);
    }
    window.ctgRefreshLawFirmSelections();
    renderAcLawFirms();
    toast('Law firm renamed');
  };

  window.acDeleteLawFirmByIndex = async function (index) {
    var name = loadRegisteredLawFirms()[index];
    if (!name) return;
    if (!(await ctgConfirm('Delete "' + name + '" from the registered law-firm list?', { danger: true, okLabel: 'Delete' }))) return;
    if (REMOTE) {
      var row = _lawFirmsFull[index];
      try { await apiFetch('/api/law-firms/' + row.id, { method: 'DELETE' }); await refreshLawFirmsCache(); }
      catch (e) { toast(e.message, 'err'); return; }
    } else {
      var firms = loadRegisteredLawFirms();
      firms.splice(index, 1);
      saveRegisteredLawFirms(firms);
    }
    window.ctgRefreshLawFirmSelections();
    renderAcLawFirms();
    toast('Law firm deleted');
  };

  function acRefreshAccessControl() {
    // The data:accounts push skips whoever made the change, so
    // the admin who just added a provider needs their own picker refreshed
    // here - otherwise it stays stale for them alone until a reload.
    if (typeof window.ctgLoadProviders === 'function') window.ctgLoadProviders();
    window.ctgRefreshLawFirmSelections();
    renderAcMatrix();
    renderAcLawFirms();
    window.acSwitchTab(acActiveTab);
  }

  async function renderAcMatrix() {
    var mount = $('acMatrixMount');
    if (!mount || !CURRENT || CURRENT.role !== 'admin') return;
    mount.innerHTML = '<div data-cs="'+__cs+'padding:18px;color:var(--muted);font-size:12px">Loading accounts…</div>';

    var list;
    try { list = await backend.listAccounts(); }
    catch (e) { mount.innerHTML = '<div data-cs="'+__cs+'padding:18px;color:var(--red);font-size:12px">' + esc(e.message) + '</div>'; return; }

    var adminCount = list.filter(function (u) { return u.role === 'admin'; }).length;
    setText('acUserCountTag', list.length + ' Account' + (list.length === 1 ? '' : 's'));

    if (!list.length) {
      mount.innerHTML = '<div class="pld-empty-state">No accounts found.</div>';
      return;
    }

    /* Grouped by role, provider at the top and admin last, with each role's
       accounts kept together and sorted by name inside the group. */
    var ROLE_ORDER = { provider: 0, ta: 1, compliance: 2, lawyer: 3, admin: 4 };
    var roleRank = function (r) { return ROLE_ORDER[r] != null ? ROLE_ORDER[r] : 90; };
    var sorted = list.slice().sort(function (a, b) {
      var d = roleRank(a.role) - roleRank(b.role);
      if (d) return d;
      return (a.displayName || a.username || '').localeCompare(b.displayName || b.username || '');
    });
    var counts = {};
    sorted.forEach(function (u) { counts[u.role] = (counts[u.role] || 0) + 1; });

    var h = '<div class="ac-list-view">';
    var lastRole = null;
    sorted.forEach(function (u) {
      if (u.role !== lastRole) {
        h += '<div class="ac-role-group"><span>' + esc(ROLE_LABELS[u.role] || u.role) + '</span>'
          + '<span class="ac-role-group-n">' + counts[u.role] + '</span></div>';
        lastRole = u.role;
      }
      h += acAccountCardHTML(u, adminCount);
    });
    h += '</div>';
    mount.innerHTML = h;
  }

  // Compact row-action icons for the accounts list (all four original actions
  // kept - just tighter). 16px stroke icons.
  var AC_ICO = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14.5 8.5l2.5 2.5"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>'
  };

  function acAccountCardHTML(u, adminCount) {
    var isAdmin = u.role === 'admin';
    var lastAdmin = isAdmin && adminCount <= 1;
    var isSelf = CURRENT && CURRENT.id === u.id;
    var inactive = u.active === false;
    var display = u.displayName || u.username;
    var meta = '@' + (u.username || '') + (u.role === 'lawyer' && u.lawFirm ? ' · ' + u.lawFirm : '');
    var accountOpen = !!acOpenAccounts[u.id];
    var h = '<details class="ac-account-card" data-id="' + esc(u.id) + '"' + (accountOpen ? ' open' : '') + ' data-ontoggle="acRememberAccountOpen(this)">'
      + '<summary class="ac-account-summary">'
      + '<span class="ac-account-left">'
      + '<span class="ac-account-caret">›</span>'
      + '<span class="ac-user-av' + (isAdmin ? ' admin' : '') + '">' + esc(acInitials(u)) + '</span>'
      + '<span class="ac-account-labels">'
      + '<span class="ac-user-name">' + esc(display) + '</span>'
      + '<span class="ac-user-meta">' + esc(meta) + '</span>'
      + '</span>'
      + '<span class="ac-role-badge' + (isAdmin ? ' admin' : '') + '">' + esc(ROLE_LABELS[u.role] || u.role) + '</span>'
      + (inactive ? '<span class="ac-role-badge inactive">Inactive</span>' : '')
      + '</span>'
      + '<span class="ac-account-actions">'
      + '<button type="button" class="ac-act" title="Edit account" aria-label="Edit account" data-onclick="event.preventDefault();event.stopPropagation();acEditAccount(\'' + esc(u.id) + '\')">' + AC_ICO.edit + '</button>'
      + '<button type="button" class="ac-act" title="Reset temporary password" aria-label="Reset temporary password" data-onclick="event.preventDefault();event.stopPropagation();acResetPassword(\'' + esc(u.id) + '\')">' + AC_ICO.key + '</button>'
      + '<button type="button" class="ac-act' + (inactive ? ' on' : ' danger') + '" title="' + (inactive ? 'Reactivate account' : 'Deactivate account') + '" aria-label="' + (inactive ? 'Reactivate account' : 'Deactivate account') + '" data-onclick="event.preventDefault();event.stopPropagation();acToggleActive(\'' + esc(u.id) + '\')"' + (isSelf ? ' disabled' : '') + '>' + AC_ICO.power + '</button>'
      + '<button type="button" class="ac-act danger" title="Delete account" aria-label="Delete account" data-onclick="event.preventDefault();event.stopPropagation();acDeleteAccount(\'' + esc(u.id) + '\')"' + ((lastAdmin || isSelf) ? ' disabled' : '') + '>' + AC_ICO.trash + '</button>'
      + '</span>'
      + '</summary>'
      + '<div class="ac-account-detail">';
    if (isAdmin) {
      h += '<div class="ac-admin-note">Administrators always have full access. Page and section checkboxes are locked for this account.</div>';
    }
    h += '<div class="ac-page-list">';
    var lastGroup = '';
    PAGES.forEach(function (pg) {
      if (pg.group !== lastGroup) {
        h += '<div class="ac-page-group-label">' + esc(pg.group || 'Pages') + '</div>';
        lastGroup = pg.group;
      }
      h += acPagePermissionHTML(u, pg, isAdmin);
    });
    h += '</div></div></details>';
    return h;
  }

  function acPagePermissionHTML(u, pg, isAdmin) {
    var pages = u.pages || [];
    var pageOn = isAdmin || pages.indexOf(pg.key) !== -1;
    var defs = SECTIONS[pg.key] || [];
    var keys = defs.map(function (s) { return s.key; });
    var configured = acHasSectionConfig(u, pg.key);
    var granted = pages.filter(function (k) { return keys.indexOf(k) !== -1; });
    var fullLegacy = pageOn && defs.length && !configured && !granted.length;
    var checkedCount = isAdmin ? defs.length : (fullLegacy ? defs.length : granted.length);
    var badge = !defs.length ? '' : (checkedCount === defs.length
      ? '<span class="ac-mini-badge full">All parts visible</span>'
      : '<span class="ac-mini-badge limited">' + checkedCount + '/' + defs.length + ' parts visible</span>');
    var disabled = isAdmin ? ' disabled' : '';
    var pageOpen = !!acOpenPages[acOpenPageKey(u.id, pg.key)];
    var h = '<details class="ac-page-perm' + (pageOn ? '' : ' off') + '" data-account-id="' + esc(u.id) + '" data-page-key="' + esc(pg.key) + '"' + (pageOpen ? ' open' : '') + ' data-ontoggle="acRememberPageOpen(this)">'
      + '<summary class="ac-page-summary">'
      + '<span class="ac-page-main">'
      + '<span class="ac-page-caret">›</span>'
      + '<input type="checkbox" data-acid="' + esc(u.id) + '" data-page="' + esc(pg.key) + '" ' + (pageOn ? 'checked' : '') + disabled + ' data-onclick="event.stopPropagation()" data-onchange="acTogglePage(this)">'
      + '<span class="ac-page-title">' + esc(pg.label) + '</span>'
      + '</span>'
      + badge
      + '</summary>';
    h += '<div class="ac-section-list" data-section-page="' + esc(pg.key) + '">';
    if (defs.length) {
      defs.forEach(function (sec) {
        var secOn = isAdmin || fullLegacy || granted.indexOf(sec.key) !== -1;
        h += '<label class="ac-section-row' + (pageOn ? '' : ' disabled') + '">'
          + '<input type="checkbox" data-acid="' + esc(u.id) + '" data-section="' + esc(sec.key) + '" data-section-parent="' + esc(pg.key) + '" ' + (secOn ? 'checked' : '') + (pageOn ? disabled : ' disabled') + ' data-onchange="acTogglePage(this)">'
          + '<span>' + esc(sec.label) + '</span>'
          + '</label>';
      });
    } else {
      h += '<div class="ac-section-empty">No separate controls available for this page.</div>';
    }
    h += '</div></details>';
    return h;
  }

  function acSelector(id) { return 'input[type=checkbox][data-acid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'; }

  // Resolve an account's display name (for confirmation prompts) from its row.
  function acAccountName(id) {
    var esc = window.CSS && CSS.escape ? CSS.escape(id) : id;
    var el = document.querySelector('.ac-account-card[data-id="' + esc + '"] .ac-user-name');
    return el ? el.textContent.trim() : 'this account';
  }
  // Friendly label for a section key (e.g. 'pl.exams' -> 'Exams').
  function acSectionLabel(sectionKey) {
    var lbl = sectionKey;
    Object.keys(SECTIONS).forEach(function (pg) {
      SECTIONS[pg].forEach(function (s) { if (s.key === sectionKey) lbl = s.label; });
    });
    return lbl;
  }

  async function acSavePermissions(id, revertEl) {
    acCaptureOpenPanels();
    // Collect page and section checkboxes for this account. Section keys are
    // only stored when the parent page remains checked. If not every section is
    // checked, save a configuration marker so unchecked parts stay hidden.
    var pages = [];
    var parentOn = {};
    document.querySelectorAll(acSelector(id) + '[data-page]').forEach(function (cb) {
      var key = cb.getAttribute('data-page');
      if (cb.checked && key) { parentOn[key] = true; pages.push(key); }
    });
    Object.keys(SECTIONS).forEach(function (pageKey) {
      if (!parentOn[pageKey]) return;
      var defs = SECTIONS[pageKey] || [];
      if (!defs.length) return;
      var checked = [];
      defs.forEach(function (s) {
        var cb = document.querySelector(acSelector(id) + '[data-section="' + s.key + '"]');
        if (cb && cb.checked) checked.push(s.key);
      });
      if (checked.length !== defs.length) pages.push(acSectionConfigKey(pageKey));
      checked.forEach(function (k) { pages.push(k); });
    });
    try {
      await backend.setPages(id, pages);
      if (CURRENT && CURRENT.id === id) { CURRENT.pages = pages.slice(); applySidebar(CURRENT); }
      toast('Access updated');
      // Re-render so each collapsed account/page reflects the new parent state,
      // section counts, and enabled/disabled controls.
      await renderAcMatrix();
    } catch (e) {
      if (revertEl) revertEl.checked = !revertEl.checked; // revert the box on failure
      toast(e.message || 'Could not update access', 'err');
    }
  }

  window.acTogglePage = async function (el) {
    var id = el.getAttribute('data-acid');
    if (!id) return;
    // Confirm every grant/revocation (page columns AND section chips) so an
    // accidental click doesn't silently change an account's access.
    var granting = el.checked;
    var pageKey = el.getAttribute('data-page');
    var sectionKey = el.getAttribute('data-section');
    var msg = '';
    if (pageKey) {
      var pageLabel = (PAGES.filter(function (p) { return p.key === pageKey; })[0] || {}).label || pageKey;
      msg = (granting ? 'Grant' : 'Remove') + ' "' + pageLabel + '" access '
        + (granting ? 'to ' : 'from ') + acAccountName(id) + '?';
    } else if (sectionKey) {
      msg = (granting ? 'Give ' + acAccountName(id) + ' access to' : 'Remove')
        + ' the "' + acSectionLabel(sectionKey) + '" section'
        + (granting ? '?' : ' from ' + acAccountName(id) + '?');
    }
    if (msg && !(await ctgConfirm(msg))) { el.checked = !el.checked; return; } // revert; do not save
    acSavePermissions(id, el);
  };

  // Quick action: tick / untick every section of a page at once.
  window.acSetSections = async function (id, pageKey, on) {
    var pageLabel = (PAGES.filter(function (p) { return p.key === pageKey; })[0] || {}).label || pageKey;
    var msg = on
      ? 'Select all "' + pageLabel + '" sections for ' + acAccountName(id) + '?'
      : 'Clear all "' + pageLabel + '" sections for ' + acAccountName(id) + '? This hides all parts inside that page until sections are selected again.';
    if (!(await ctgConfirm(msg))) return;
    var defs = SECTIONS[pageKey] || [];
    defs.forEach(function (s) {
      var cb = document.querySelector(acSelector(id) + '[data-section="' + s.key + '"]');
      if (cb && !cb.disabled) cb.checked = !!on;
    });
    acSavePermissions(id);
  };

  window.acToggleLawFirm = function () {
    window.ctgRefreshLawFirmSelections();
    var row = $('acLawFirmRow');
    if (row) row.style.display = val('acRole') === 'lawyer' ? '' : 'none';
  };

  window.acSaveAccount = async function () {
    var payload = {
      displayName: val('acDisplayName').trim(),
      username: val('acUsername').trim(),
      role: val('acRole'),
      password: val('acPassword'),
      lawFirm: val('acLawFirm').trim(),
      email: val('acEmail').trim(),
      mfaEnabled: !!($('acMfaEnabled') && $('acMfaEnabled').checked)
    };
    if (payload.password) {
      var pwErr = passwordPolicyError(payload.password);
      if (pwErr) { toast(pwErr, 'err'); return; }
    } else if (!acEditingId) {
      toast('Password is required', 'err'); return;
    }
    if (payload.mfaEnabled && !payload.email) { toast('Add an email address before requiring a sign-in code', 'err'); return; }
    if (payload.role === 'lawyer') {
      if (!payload.lawFirm) { toast('Register and select a law firm first', 'err'); return; }
      if (loadRegisteredLawFirms().indexOf(payload.lawFirm) === -1) { toast('Select a registered law firm', 'err'); return; }
    }
    var btn = $('acSaveBtn'); if (btn) btn.disabled = true;
    try {
      if (acEditingId) {
        await backend.updateAccount(acEditingId, payload); // password blank = keep
        toast('Account updated');
        if (CURRENT && CURRENT.id === acEditingId) { CURRENT = await backend.me(); applyChip(CURRENT); applySidebar(CURRENT); }
      } else {
        await backend.createAccount(payload);
        toast('Account created');
      }
      acResetForm();
      await renderAcMatrix();
    } catch (e) {
      toast(e.message || 'Could not save account', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.acEditAccount = async function (id) {
    var list;
    try { list = await backend.listAccounts(); } catch (e) { toast(e.message, 'err'); return; }
    var u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    acEditingId = id;
    window.acSwitchTab('addAccount');
    window.ctgRefreshLawFirmSelections();
    setVal('acDisplayName', u.displayName || '');
    setVal('acUsername', u.username);
    setVal('acRole', u.role);
    setVal('acLawFirm', u.lawFirm || '');
    acToggleLawFirm();
    setVal('acEmail', u.email || '');
    var mfa = $('acMfaEnabled'); if (mfa) mfa.checked = !!u.mfaEnabled;
    setVal('acPassword', '');
    acHidePassword();
    setText('acFormTitle', 'Edit Account');
    setText('acSaveBtn', 'Save Changes');
    var rb = $('acResetFormBtn'); if (rb) rb.style.display = '';
    setText('acPassLabel', 'Password (blank = keep)');
    var dn = $('acDisplayName'); if (dn) dn.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Reveal what is being TYPED. It cannot show an existing password: the
     stored value is a bcrypt hash, so the server has no way to produce one.
     Leaving this box empty on an edit keeps the current password unchanged. */
  window.acTogglePassword = function () {
    var input = $('acPassword');
    var btn = $('acPassReveal');
    if (!input || !btn) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.setAttribute('title', show ? 'Hide password' : 'Show password');
  };

  /* Never leave a password on screen when the form is reused for the next
     account - the box is cleared, so the reveal state has to go back too. */
  function acHidePassword() {
    var input = $('acPassword');
    var btn = $('acPassReveal');
    if (input) input.type = 'password';
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('title', 'Show password');
    }
  }

  window.acResetForm = function () {
    acEditingId = null;
    setVal('acDisplayName', '');
    setVal('acUsername', '');
    setVal('acRole', 'lawyer');
    window.ctgRefreshLawFirmSelections();
    setVal('acLawFirm', '');
    acToggleLawFirm();
    setVal('acEmail', '');
    var mfaReset = $('acMfaEnabled'); if (mfaReset) mfaReset.checked = false;
    setVal('acPassword', '');
    acHidePassword();
    setText('acFormTitle', 'Add Account');
    setText('acSaveBtn', 'Create Account');
    var rb = $('acResetFormBtn'); if (rb) rb.style.display = 'none';
    setText('acPassLabel', 'Password');
  };

  window.acDeleteAccount = async function (id) {
    if (CURRENT && CURRENT.id === id) { toast('You cannot delete the account you are signed in with', 'err'); return; }
    if (!(await ctgConfirm('Delete this account? This cannot be undone.', { danger: true, okLabel: 'Delete' }))) return;
    try {
      await backend.deleteAccount(id);
      if (acEditingId === id) acResetForm();
      await renderAcMatrix();
      toast('Account deleted');
    } catch (e) {
      toast(e.message || 'Could not delete account', 'err');
    }
  };

  window.acResetPassword = async function (id) {
    var name = acAccountName(id);
    if (!(await ctgConfirm('Reset the password for ' + name + '? A new temporary password will be generated and the current one will stop working.', { okLabel: 'Reset' }))) return;
    try {
      var temp = await backend.resetPassword(id);
      // Surface the temp password in a copyable prompt so the admin can share it.
      window.prompt('Temporary password for ' + name + '.\nCopy it and share it securely — they should change it after signing in:', temp);
      toast('Temporary password set');
    } catch (e) {
      toast(e.message || 'Could not reset password', 'err');
    }
  };

  window.acToggleActive = async function (id) {
    if (CURRENT && CURRENT.id === id) { toast('You cannot deactivate the account you are signed in with', 'err'); return; }
    var list;
    try { list = await backend.listAccounts(); } catch (e) { toast(e.message, 'err'); return; }
    var u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var deactivating = u.active !== false;
    var name = acAccountName(id);
    var msg = deactivating
      ? 'Deactivate ' + name + '? They will be unable to sign in until reactivated.'
      : 'Reactivate ' + name + '? They will be able to sign in again.';
    if (!(await ctgConfirm(msg, { danger: deactivating, okLabel: deactivating ? 'Deactivate' : 'Reactivate' }))) return;
    try {
      await backend.setActive(id, !deactivating);
      await renderAcMatrix();
      toast(deactivating ? 'Account deactivated' : 'Account reactivated');
    } catch (e) {
      toast(e.message || 'Could not update account', 'err');
    }
  };

  /* ============================== bootstrap ============================== */
  function wireLogin() {
    var form = $('authForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); handleLoginSubmit(); });
    var btn = $('authSubmit');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); handleLoginSubmit(); });
    var pass = $('authPass');
    if (pass) pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); handleLoginSubmit(); } });
    var mfaForm = $('authMfaForm');
    if (mfaForm) mfaForm.addEventListener('submit', function (e) { e.preventDefault(); handleMfaSubmit(); });
    var codeBtn = $('authCodeSubmit');
    if (codeBtn) codeBtn.addEventListener('click', function (e) { e.preventDefault(); handleMfaSubmit(); });
    var codeInput = $('authCode');
    if (codeInput) {
      // Codes are numeric; strip anything else so a pasted "123 456" or a
      // stray character doesn't fail validation for a correct code.
      codeInput.addEventListener('input', function () {
        var cleaned = codeInput.value.replace(/\D/g, '').slice(0, 6);
        if (cleaned !== codeInput.value) codeInput.value = cleaned;
        if (cleaned.length === 6) handleMfaSubmit();
      });
      codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); handleMfaSubmit(); } });
    }
    /* No role badge while the username is typed: answering "does this account
       exist, and is it an admin?" before a password is proven told that to
       anyone who asked. The role shows on the user chip once signed in. */
    document.addEventListener('click', function (e) {
      var chip = $('userChip');
      if (chip && !chip.contains(e.target)) window.closeUserMenu();
    });
    // Static build keeps the default credentials hint visible for first login.
    var hint = $('authHint'); if (hint) hint.style.display = '';
  }

  async function init() {
    installShowPageGuard();
    wireLogin();
    // No law-firm fetch here - see showApp(): there is no session yet at this
    // point, so the request can only 401.
    var user = await backend.me();
    if (user) {
      showApp(user);
    } else {
      showLogin();
      // Why the last session ended, carried across endLocalSession()'s reload.
      try {
        var note = sessionStorage.getItem(SIGNED_OUT_NOTE_KEY);
        if (note) { sessionStorage.removeItem(SIGNED_OUT_NOTE_KEY); authShowError(note); }
      } catch (e) {}
      setTimeout(function () { var u = $('authUser'); if (u) u.focus(); }, 60);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
