(function () {
  'use strict';

  const PM_STORE_KEY = 'ctg_patient_messaging_v1';
  const PM_CONTACTS_KEY = 'ctg_patient_contacts_v1';
  const PM_CHANNEL_NAME = 'ctg_patient_messaging';
  const PM_SMS_SINGLE = 160;   // GSM-7 single segment
  const PM_SMS_MULTI = 153;    // per segment once concatenated

  let pmData = null;
  let pmActivePatientId = null;
  let pmSearch = '';
  let pmReachFilter = 'all';      // all | sms | email | none
  let pmComposerTab = 'sms';      // sms | email | call
  let pmBroadcast = null;
  let pmMobileDetail = false;

  let pmCall = null;              // live dialer session
  let pmCallTimer = null;
  let pmNoteEditId = null;        // call record whose note is being edited
  let pmManualOpen = false;       // "log a past call" form visibility
  let pmView = 'messages';        // messages | contacts
  let pmBook = null;              // contact-book store
  let pmBookSearch = '';
  let pmcSelected = null;         // patient selected in the contact rail
  let pmcTab = 'all';             // all | phone | added | none
  let pmModal = null;             // { mode:'edit'|'delete', patientId, pointId }
  // Chosen destination per channel. Kept separate so picking a guardian's
  // phone doesn't disturb which email address is selected, and vice versa.
  let pmDestOpen = '';           // which destination picker is open ('phone'|'email')
  let pmTargetPhoneId = '';
  let pmTargetEmailId = '';

  function pmEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pmNow() { return Date.now(); }
  function pmId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pmToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function pmCurrentUser() {
    try { return typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null; }
    catch (e) { return null; }
  }
  function pmCan(section) {
    try {
      if (typeof window.ctgCanSection !== 'function') return true;
      return window.ctgCanSection('patientMessaging', section);
    } catch (e) { return true; }
  }
  function pmPageActive() {
    const page = document.getElementById('page-patientMessaging');
    return !!(page && page.classList.contains('active'));
  }

  /* ---------- data ---------- */
  function pmEmpty() { return { version: 1, threads: [], messages: [] }; }
  function pmNormalize(store) {
    const out = store && typeof store === 'object' ? store : pmEmpty();
    if (!Array.isArray(out.threads)) out.threads = [];
    if (!Array.isArray(out.messages)) out.messages = [];
    out.version = 1;
    return out;
  }
  function pmRead() {
    try { return pmNormalize(JSON.parse(localStorage.getItem(PM_STORE_KEY) || 'null')); }
    catch (e) { return pmEmpty(); }
  }
  function pmLoad() { if (!pmData) pmData = pmRead(); return pmData; }
  function pmWrite() {
    if (!pmData) return false;
    try {
      localStorage.setItem(PM_STORE_KEY, JSON.stringify(pmData));
      if (pmBroadcast) pmBroadcast.postMessage({ type: 'store', at: pmNow() });
      pmUpdateSidebarBadge();
      return true;
    } catch (e) {
      pmToast('Could not save — browser storage may be full.', 'err');
      return false;
    }
  }

  /* ---------- patients as contacts ---------- */
  function pmAllPatients() {
    return (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
  }
  function pmPatient(id) {
    if (typeof getPatient === 'function') { const p = getPatient(id); if (p) return p; }
    return pmAllPatients().find(p => p.id === id) || null;
  }
  function pmName(p) {
    if (typeof fullPatientName === 'function') return fullPatientName(p);
    const d = (p && p.demographics) || {};
    return ((d.lastName || '') + ', ' + (d.firstName || '')).replace(/^,\s*/, '').trim() || 'Unnamed Patient';
  }
  function pmFirst(p) { return ((p && p.demographics) || {}).firstName || 'this patient'; }
  function pmInitials(name) {
    const w = String(name || '?').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
    return (((w[0] || '')[0] || '') + ((w.length > 1 ? w[w.length - 1] : '')[0] || '')).toUpperCase() || '?';
  }
  // Single source of truth for "can we reach this patient, and how".
  function pmContact(p) {
    const d = (p && p.demographics) || {};
    const mobile = String(d.mobile || '').trim();
    const email = String(d.email || '').trim();
    return { mobile, email, canSms: !!mobile, canEmail: !!email, reachable: !!(mobile || email) };
  }
  /* ---------- contact book store ---------- */
  const PM_LABELS = ['Patient', 'Parent', 'Guardian', 'Spouse', 'Caregiver', 'Emergency contact', 'Home', 'Work', 'Other'];
  function pmBookLoad() {
    if (pmBook) return pmBook;
    try {
      const raw = JSON.parse(localStorage.getItem(PM_CONTACTS_KEY) || 'null');
      pmBook = (raw && Array.isArray(raw.entries)) ? raw : { version: 1, entries: [] };
    } catch (e) { pmBook = { version: 1, entries: [] }; }
    return pmBook;
  }
  function pmBookSave() {
    try {
      localStorage.setItem(PM_CONTACTS_KEY, JSON.stringify(pmBookLoad()));
      if (pmBroadcast) pmBroadcast.postMessage({ type: 'contacts', at: pmNow() });
      return true;
    } catch (e) { pmToast('Could not save the contact — storage may be full.', 'err'); return false; }
  }
  function pmBookEntries(patientId) {
    return pmBookLoad().entries.filter(e => e.patientId === patientId);
  }
  /* Favourites live in the same store as the extra numbers so they survive a
     reload and follow the staff member's own browser, like the rest of this
     module's local state. */
  function pmFavs() {
    const b = pmBookLoad();
    if (!Array.isArray(b.favorites)) b.favorites = [];
    return b.favorites;
  }
  function pmIsFav(patientId) { return pmFavs().indexOf(patientId) !== -1; }
  function pmToggleFav(patientId, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const favs = pmFavs();
    const i = favs.indexOf(patientId);
    if (i === -1) favs.push(patientId); else favs.splice(i, 1);
    pmBookSave();
    pmcRenderList();
    pmcRenderDetail();
    pmToast(i === -1 ? 'Added to favourites' : 'Removed from favourites');
  }
  /* Every way we can reach this patient, registered details first. The two
     'registration' rows are synthesised on read, never stored. */
  function pmContactPoints(p) {
    if (!p) return [];
    const c = pmContact(p);
    const out = [];
    // Labelled "Patient" - this is the patient's OWN number/address from the
    // chart. Calling it "Mobile" made it indistinguishable from an added
    // mobile belonging to a parent or guardian.
    if (c.mobile) out.push({ id: 'reg:mobile', kind: 'phone', label: 'Patient', value: c.mobile, source: 'registration', primary: true });
    if (c.email) out.push({ id: 'reg:email', kind: 'email', label: 'Patient', value: c.email, source: 'registration', primary: true });
    pmBookEntries(p.id).forEach(e => out.push({
      id: e.id, kind: e.kind, label: e.label, value: e.value, note: e.note || '', source: 'book', primary: false
    }));
    return out;
  }
  function pmPointsFor(p, kind) { return pmContactPoints(p).filter(pt => pt.kind === kind); }
  /* Reachability across both sources - a patient with no registered mobile but
     a guardian's number in the book is still textable. */
  function pmReach(p) {
    const phones = pmPointsFor(p, 'phone');
    const emails = pmPointsFor(p, 'email');
    return { phones, emails, canSms: phones.length > 0, canEmail: emails.length > 0, reachable: phones.length + emails.length > 0 };
  }
  function pmFindPoint(p, id) { return pmContactPoints(p).find(pt => pt.id === id) || null; }
  // Falls back to the first usable destination whenever the stored choice is
  // gone (contact deleted, number removed from Registration, channel switch).
  function pmResolveTarget(p, kind) {
    const points = pmPointsFor(p, kind);
    if (!points.length) return null;
    const want = kind === 'email' ? pmTargetEmailId : pmTargetPhoneId;
    return points.find(pt => pt.id === want) || points[0];
  }

  function pmPrettyPhone(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length === 11 && d[0] === '1') return '+1 (' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7);
    return String(v || '');
  }

  /* ---------- threads & messages ---------- */
  function pmFromServer(m) {
    return {
      id: m.id,
      threadId: '',                       // resolved below, per patient
      patientId: m.patientId,
      direction: m.direction,
      channel: m.channel,
      to: m.counterparty,
      toLabel: '',
      subject: m.subject || '',
      body: m.body || '',
      createdAt: m.createdAt,
      status: m.status,
      error: m.error || '',
      sentBy: m.sentByName || '',
      readAt: m.readAt || null
    };
  }

  // Inserts or replaces a message by id, keeping the local store in step with
  // the server without disturbing anything already on screen.
  function pmUpsert(serverMsg) {
    pmLoad();
    const local = pmFromServer(serverMsg);
    if (!local.patientId) return null;      // reply from an unrecognised number
    const thread = pmThread(local.patientId, true);
    local.threadId = thread.id;
    const i = pmData.messages.findIndex(m => m.id === local.id);
    if (i === -1) pmData.messages.push(local); else pmData.messages[i] = local;
    if (!thread.lastMessageAt || local.createdAt > thread.lastMessageAt) thread.lastMessageAt = local.createdAt;
    if (local.direction === 'in' && !local.readAt) thread.unread = (thread.unread || 0) + 1;
    return local;
  }

  let _pmBootstrapped = false;
  function pmBootstrapFromServer() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    // A week of history is plenty for the working view; older messages load
    // per-patient when a thread is opened.
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    return window.ctgApiFetch('/api/patient-messages/recent?since=' + encodeURIComponent(since))
      .then(function (d) {
        pmLoad();
        (d.messages || []).forEach(pmUpsert);
        pmWrite();
        _pmBootstrapped = true;
        if (pmPageActive()) { pmRenderDirectory(); pmRenderWorkspace(); }
        pmUpdateSidebarBadge();
      })
      .catch(function (e) { console.warn('Could not load patient messages', e); });
  }

  // Full history for one patient - called when a thread is opened, so older
  // conversations are complete rather than truncated to the recent window.
  function pmLoadThreadFromServer(patientId) {
    if (typeof window.ctgApiFetch !== 'function' || !patientId) return Promise.resolve();
    return window.ctgApiFetch('/api/patient-messages?patientId=' + encodeURIComponent(patientId))
      .then(function (d) {
        pmLoad();
        (d.messages || []).forEach(pmUpsert);
        pmWrite();
        if (pmPageActive()) pmRenderWorkspace();
      })
      .catch(function () {});
  }

  // Live push from the server: a colleague sent something, or a patient replied.
  window.ctgPmHandleRealtime = function (type, payload) {
    if (type !== 'patient:message' || !payload) return;
    // The server now pushes only to accounts that may read threads; this keeps
    // a stray push out of browser storage for anyone who may not.
    if (!pmCan('pm.read')) return;
    const added = pmUpsert(payload);
    if (!added) return;
    pmWrite();
    if (pmPageActive()) { pmRenderDirectory(); pmRenderWorkspace(); }
    pmUpdateSidebarBadge();
    if (payload.direction === 'in') {
      const p = pmPatient(payload.patientId);
      pmToast('New reply from ' + (p ? pmName(p) : payload.counterparty));
    }
  };

  function pmThread(patientId, create) {
    pmLoad();
    let t = pmData.threads.find(x => x.patientId === patientId);
    if (!t && create) {
      t = { id: pmId('pth'), patientId: patientId, createdAt: new Date().toISOString(), lastMessageAt: '', unread: 0 };
      pmData.threads.push(t);
    }
    return t || null;
  }
  function pmMessages(patientId) {
    pmLoad();
    return pmData.messages.filter(m => m.patientId === patientId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  function pmLastMessage(patientId) {
    const rows = pmMessages(patientId);
    return rows.length ? rows[rows.length - 1] : null;
  }
  function pmQueuedCount() {
    pmLoad();
    return pmData.messages.filter(m => m.direction === 'out' && m.status === 'queued' && !m.call).length;
  }
  function pmUnreadTotal() {
    pmLoad();
    return pmData.threads.reduce((n, t) => n + (t.unread || 0), 0);
  }
  function pmIsToday(v) {
    const d = new Date(v);
    return !isNaN(d) && d.toDateString() === new Date().toDateString();
  }

  /* ---------- time helpers ---------- */
  function pmIso(v) { const t = Date.parse(v || ''); return isNaN(t) ? 0 : t; }
  function pmTime(v) {
    const d = new Date(v); if (isNaN(d)) return '';
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function pmRelative(v) {
    const t = pmIso(v); if (!t) return '';
    const diff = pmNow() - t;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    const d = new Date(t);
    if (d.toDateString() === new Date().toDateString()) return pmTime(v);
    if (diff < 7 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
  }
  function pmDayLabel(v) {
    const d = new Date(v); if (isNaN(d)) return '';
    const today = new Date(); const yest = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function pmDuration(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function pmSmsSegments(text) {
    const len = String(text || '').length;
    if (!len) return { len: 0, segments: 0, per: PM_SMS_SINGLE };
    if (len <= PM_SMS_SINGLE) return { len, segments: 1, per: PM_SMS_SINGLE };
    return { len, segments: Math.ceil(len / PM_SMS_MULTI), per: PM_SMS_MULTI };
  }

  /* ---------- templates ---------- */
  const PM_TEMPLATES = [
    { id: 'appt', name: 'Appointment reminder', channel: 'both', subject: 'Your upcoming appointment', body: 'Hi {first}, this is a reminder of your appointment with Concussion Therapy Group. Please reply here if you need to reschedule.' },
    { id: 'forms', name: 'Forms reminder', channel: 'both', subject: 'Please complete your intake forms', body: 'Hi {first}, your intake forms are still outstanding. Please complete them before your next visit so we can start on time. Thank you — Concussion Therapy Group.' },
    { id: 'followup', name: 'Follow-up check-in', channel: 'both', subject: 'Checking in on your recovery', body: 'Hi {first}, checking in on how you have been feeling since your last visit. Let us know if your symptoms have changed.' },
    { id: 'results', name: 'Results ready', channel: 'both', subject: 'Your results are ready', body: 'Hi {first}, your results are ready to review. Please call the clinic and we will walk you through them.' },
    { id: 'billing', name: 'Billing / balance', channel: 'email', subject: 'Regarding your account balance', body: 'Hi {first}, we are reaching out regarding the balance on your account. Please contact the clinic at your convenience so we can help sort it out.' },
    { id: 'missed', name: 'Missed call follow-up', channel: 'sms', subject: 'We tried to reach you', body: 'Hi {first}, we tried reaching you by phone today. Please give Concussion Therapy Group a call back when you have a moment.' }
  ];
  function pmFillTemplate(text, p) {
    const d = (p && p.demographics) || {};
    return String(text || '')
      .replace(/\{first\}/g, d.firstName || 'there')
      .replace(/\{last\}/g, d.lastName || '')
      .replace(/\{name\}/g, pmName(p))
      .replace(/\{clinic\}/g, 'Concussion Therapy Group');
  }

  /* ============================ render ============================ */
  function renderPatientMessaging() {
    const mount = document.getElementById('pmMount');
    if (!mount) return;
    if (!pmCurrentUser()) {
      mount.innerHTML = '<div class="pm-no-access"><strong>Sign in to use Patient Messaging.</strong></div>';
      return;
    }
    if (!pmCan('pm.read')) {
      mount.innerHTML = '<div class="pm-no-access"><strong>Patient Messaging access is limited.</strong><span>An administrator can enable “View patient threads” in Access Control.</span></div>';
      return;
    }
    pmLoad(); pmBookLoad();
    // Server is the source of truth; the cached copy paints first so the page
    // isn't blank, then the fetch fills in anything sent from elsewhere.
    if (!_pmBootstrapped) pmBootstrapFromServer();
    mount.innerHTML = pmShellHTML();
    if (pmView === 'contacts') { pmRenderContactBook(); }
    else { pmRenderDirectory(); pmRenderWorkspace(); }
    pmUpdateSidebarBadge();
  }

  function pmShellHTML() {
    const body = pmView === 'contacts'
      ? '<div class="pm-bookwrap" id="pmBookWrap"></div>'
      : '<div class="pm-body">' + pmDirectoryHTML() + '<section class="pm-workspace" id="pmWorkspace"></section></div>';
    return '<div class="pm-shell' + (pmMobileDetail ? ' pm-show-detail' : '') + '" id="pmShell">'
      + pmHeroHTML() + body + '</div>';
  }
  function pmSetView(v) {
    pmView = v;
    pmEditDraft = null;   // never carry a half-finished edit dialog across views
    renderPatientMessaging();
  }

  /* Hero strip: what a front desk wants at a glance before picking anyone. */
  function pmHeroHTML() {
    const patients = pmScopedPatients();
    const reachable = patients.filter(p => pmReach(p).reachable).length;
    pmLoad();
    const queued = pmQueuedCount();
    const sentToday = pmData.messages.filter(m => !m.call && m.direction === 'out' && pmIsToday(m.createdAt)).length;
    const callsToday = pmData.messages.filter(m => m.call && pmIsToday(m.createdAt)).length;
    const tile = (val, label, cls, hint) =>
      '<div class="pm-tile' + (cls ? ' ' + cls : '') + '"' + (hint ? ' title="' + pmEsc(hint) + '"' : '') + '>'
      + '<b>' + val + '</b><span>' + label + '</span></div>';
    return '<header class="pm-hero">'
      + '<div class="pm-hero-lead">'
        + '<span class="pm-hero-ico">' + PM_ICON.broadcast + '</span>'
        + '<div><div class="pm-hero-kicker">Messaging</div>'
        + '<h2 class="pm-hero-title">Patient Communication</h2>'
        + '<p class="pm-hero-sub">Contacts come from each patient’s registered mobile number and email address.</p></div>'
      + '</div>'
      + '<div class="pm-hero-tiles">'
        + tile(reachable + '<i>/' + patients.length + '</i>', 'Reachable', '', 'Patients with a mobile number or email on file')
        + tile(sentToday, 'Sent today', '')
        + tile(callsToday, 'Calls today', '')
        + tile(queued, 'Queued', queued ? 'pm-tile-warn' : '', 'Waiting to send — use Refresh to retry')
      + '</div>'
      + '<div class="pm-hero-views">'
        + '<button type="button" class="pm-hero-view' + (pmView === 'messages' ? ' active' : '') + '" data-onclick="pmSetView(\'messages\')">' + PM_ICON.chatMini + 'Messages</button>'
        + '<button type="button" class="pm-hero-view' + (pmView === 'contacts' ? ' active' : '') + '" data-onclick="pmSetView(\'contacts\')">' + PM_ICON.book + 'Contact Book</button>'
      + '</div>'
      + '<button type="button" class="pm-hero-refresh" data-onclick="renderPatientMessaging()" title="Reload from patient records">' + PM_ICON.refresh + '</button>'
      + '</header>';
  }

  function pmDirectoryHTML() {
    const filters = [
      { k: 'all', label: 'All' },
      { k: 'sms', label: 'Textable' },
      { k: 'email', label: 'Emailable' },
      { k: 'none', label: 'Unreachable' }
    ];
    return '<aside class="pm-directory">'
      + '<div class="pm-dir-head">'
        + '<div class="pm-dir-search">' + PM_ICON.search
          + '<input type="text" id="pmSearchInput" placeholder="Search name, number or email" value="' + pmEsc(pmSearch) + '" data-oninput="pmSetSearch(this.value)">'
        + '</div>'
        + '<div class="pm-dir-filters">' + filters.map(f =>
            '<button type="button" class="pm-dir-filter' + (pmReachFilter === f.k ? ' active' : '') + '" data-k="' + f.k + '" data-onclick="pmSetReachFilter(\'' + f.k + '\')">' + f.label + '</button>'
          ).join('') + '</div>'
      + '</div>'
      + '<div class="pm-dir-list" id="pmDirList"></div>'
      + '</aside>';
  }

  function pmScopedPatients() {
    let list = pmAllPatients().slice();
    if (typeof patientsVisibleToCurrentUser === 'function') {
      try { list = patientsVisibleToCurrentUser(list); } catch (e) {}
    }
    return list;
  }
  function pmVisibleContacts() {
    const q = pmSearch.trim().toLowerCase();
    return pmScopedPatients().filter(p => {
      const r = pmReach(p);
      if (pmReachFilter === 'sms' && !r.canSms) return false;
      if (pmReachFilter === 'email' && !r.canEmail) return false;
      if (pmReachFilter === 'none' && r.reachable) return false;
      if (!q) return true;
      const hay = pmName(p) + ' ' + pmContactPoints(p).map(pt => pt.value).join(' ');
      return hay.toLowerCase().indexOf(q) !== -1;
    }).sort((a, b) => {
      const la = pmIso((pmThread(a.id) || {}).lastMessageAt);
      const lb = pmIso((pmThread(b.id) || {}).lastMessageAt);
      if (la !== lb) return lb - la;
      return pmName(a).localeCompare(pmName(b));
    });
  }

  /* Directory entries are CARDS, not chat rows - channel availability is the
     headline, because that is what decides whether you can act at all. */
  function pmRenderDirectory() {
    const mount = document.getElementById('pmDirList');
    if (!mount) return;
    const rows = pmVisibleContacts();
    if (!rows.length) {
      mount.innerHTML = '<div class="pm-dir-empty">' + PM_ICON.search
        + '<strong>' + (pmSearch ? 'No matches' : 'No patients') + '</strong>'
        + '<span>' + (pmSearch ? 'Try a different name, number or email.' : 'Patients appear here once they are registered.') + '</span></div>';
      return;
    }
    mount.innerHTML = rows.map(p => {
      const r = pmReach(p);
      const t = pmThread(p.id);
      const last = pmLastMessage(p.id);
      const unread = (t && t.unread) || 0;
      const when = t && t.lastMessageAt ? pmRelative(t.lastMessageAt) : '';
      let meta = 'Never contacted';
      if (last) meta = (last.call ? pmCallSummary(last) : (last.direction === 'out' ? 'Sent ' : 'Received ') + (last.channel === 'email' ? 'email' : 'text'));
      const phoneTitle = r.phones.map(pt => pt.label + ': ' + pmPrettyPhone(pt.value)).join('\n');
      const emailTitle = r.emails.map(pt => pt.label + ': ' + pt.value).join('\n');
      const chips = '<span class="pm-dir-chips">'
        + (r.canSms ? '<span class="pm-chip sms" title="' + pmEsc(phoneTitle) + '">' + PM_ICON.chatMini + 'Text' + (r.phones.length > 1 ? ' ×' + r.phones.length : '') + '</span>' : '')
        + (r.canEmail ? '<span class="pm-chip email" title="' + pmEsc(emailTitle) + '">' + PM_ICON.mailMini + 'Email' + (r.emails.length > 1 ? ' ×' + r.emails.length : '') + '</span>' : '')
        + (!r.reachable ? '<span class="pm-chip none">' + PM_ICON.slash + 'No contact info</span>' : '')
        + '</span>';
      return '<button type="button" class="pm-dir-card' + (p.id === pmActivePatientId ? ' active' : '') + (r.reachable ? '' : ' muted') + '" data-onclick="pmOpenPatient(\'' + pmEsc(p.id) + '\')">'
        + '<span class="pm-dir-card-top">'
          + '<span class="pm-av">' + pmEsc(pmInitials(pmName(p))) + (unread ? '<i class="pm-av-dot"></i>' : '') + '</span>'
          + '<span class="pm-dir-card-id">'
            + '<span class="pm-dir-name">' + pmEsc(pmName(p)) + '</span>'
            + '<span class="pm-dir-meta">' + pmEsc(meta) + (when ? ' · ' + pmEsc(when) : '') + '</span>'
          + '</span>'
        + '</span>'
        + chips
        + '</button>';
    }).join('');
  }


  function pmModalEl() {
    let el = document.getElementById('pmBookModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pmBookModal';
      el.className = 'pm-modal-overlay';
      el.addEventListener('click', function (e) { if (e.target === el) pmcEditCancel(); });
      document.body.appendChild(el);
    }
    return el;
  }
  /* Registered values are part of the patient chart, so writes go through the
     app's own patient store and persistPatients() - the same path Registration
     uses. Every other page reads that store, so a correction here shows up on
     Patient Lists, Appointments, invites and forms immediately. */
  function pmWritePatientContact(patientId, kind, value) {
    const p = pmPatient(patientId); if (!p) return false;
    p.demographics = Object.assign({}, p.demographics, kind === 'phone' ? { mobile: value } : { email: value });
    p.updatedAt = new Date().toISOString();
    if (typeof persistPatients === 'function') persistPatients();
    try {
      if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow();
      if (typeof selectedPatientId !== 'undefined' && selectedPatientId === patientId
          && typeof renderPatientDetails === 'function') renderPatientDetails(patientId);
    } catch (e) {}
    return true;
  }

  const PMC_AV_COLORS = ['#0077B6', '#00B4D8', '#023E8A', '#0096C7', '#1A9A6B', '#5B5BD6', '#C6851F', '#0A6C8F'];
  function pmcColor(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PMC_AV_COLORS[h % PMC_AV_COLORS.length];
  }
  function pmcAvatar(p, cls) {
    const n = pmName(p);
    return '<span class="pmc-av' + (cls ? ' ' + cls : '') + '" data-cs="'+__cs+'background:' + pmcColor(n) + '">' + pmEsc(pmInitials(n)) + '</span>';
  }

  function pmRenderContactBook() {
    const mount = document.getElementById('pmBookWrap');
    if (!mount) return;
    pmBookLoad();
    // Keep a valid selection so the detail pane is never pointlessly empty.
    const list = pmcList();
    if (!list.some(p => p.id === pmcSelected)) pmcSelected = list.length ? list[0].id : null;
    mount.innerHTML = '<div class="pmc">'
      + '<aside class="pmc-rail">'
        + '<div class="pmc-rail-hd">'
          + '<h3>Contacts</h3>'
          + '<button type="button" class="pmc-hd-btn" data-onclick="renderPatientMessaging()" title="Refresh from patient records">' + PM_ICON.refresh + '</button>'
          + '<button type="button" class="pmc-hd-btn primary" data-onclick="pmcEditOpen()" title="Add a contact number"' + (pmcSelected ? '' : ' disabled') + '>' + PM_ICON.plus + '</button>'
        + '</div>'
        + '<div class="pmc-tabs">' + [
            ['all', 'All'], ['phone', 'Phone'], ['email', 'Email'], ['added', 'Added'], ['none', 'Missing']
          ].map(([k, l]) => '<button type="button" class="pmc-tab' + (pmcTab === k ? ' active' : '') + '" data-k="' + k + '" data-onclick="pmcSetTab(\'' + k + '\')">' + l + '</button>').join('') + '</div>'
        + '<div class="pmc-search">' + PM_ICON.search
          + '<input type="text" id="pmcSearch" placeholder="Search all contacts" value="' + pmEsc(pmBookSearch) + '" data-oninput="pmcSetSearch(this.value)">'
        + '</div>'
        + '<div class="pmc-list" id="pmcList"></div>'
      + '</aside>'
      + '<section class="pmc-detail" id="pmcDetail"></section>'
      + '</div>';
    pmcRenderList();
    pmcRenderDetail();
  }

  function pmcList() {
    const q = pmBookSearch.trim().toLowerCase();
    return pmScopedPatients().filter(p => {
      const r = pmReach(p);
      if (pmcTab === 'phone' && !r.canSms) return false;
      if (pmcTab === 'email' && !r.canEmail) return false;
      if (pmcTab === 'added' && !pmBookEntries(p.id).length) return false;
      if (pmcTab === 'none' && r.reachable) return false;
      if (!q) return true;
      const hay = pmName(p) + ' ' + pmContactPoints(p).map(pt => pt.label + ' ' + pt.value).join(' ');
      return hay.toLowerCase().indexOf(q) !== -1;
    }).sort((a, b) => pmName(a).localeCompare(pmName(b)));
  }

  function pmcRenderList() {
    const mount = document.getElementById('pmcList');
    if (!mount) return;
    const rows = pmcList();
    if (!rows.length) {
      mount.innerHTML = '<div class="pmc-empty">' + PM_ICON.search + '<strong>No contacts</strong><span>Try a different search or filter.</span></div>';
      return;
    }
    const favs = rows.filter(p => pmIsFav(p.id));
    const rest = rows.filter(p => !pmIsFav(p.id));
    const group = (label, n) => '<div class="pmc-group">' + label + '<span>' + n + '</span></div>';
    mount.innerHTML = (favs.length ? group('★ Favourites', favs.length) + favs.map(pmcRowHTML).join('') : '')
      + group('All contacts', rest.length) + rest.map(pmcRowHTML).join('');
  }
  function pmcRowHTML(p) {
    const pts = pmContactPoints(p);
    const phones = pts.filter(pt => pt.kind === 'phone');
    const emails = pts.filter(pt => pt.kind === 'email');
    const extras = pmBookEntries(p.id).length;
    const fav = pmIsFav(p.id);
    // Show both channels - a patient reachable only by email looked like a
    // dead contact when the row showed a phone line and nothing else.
    const lines = [];
    if (phones.length) {
      lines.push('<span class="pmc-row-sub">' + PM_ICON.phoneMini + '<em>' + pmEsc(pmPrettyPhone(phones[0].value)) + '</em>'
        + (phones.length > 1 ? '<b>+' + (phones.length - 1) + '</b>' : '') + '</span>');
    }
    if (emails.length) {
      lines.push('<span class="pmc-row-sub">' + PM_ICON.mailMini + '<em>' + pmEsc(emails[0].value) + '</em>'
        + (emails.length > 1 ? '<b>+' + (emails.length - 1) + '</b>' : '') + '</span>');
    }
    if (!lines.length) lines.push('<span class="pmc-row-sub none">No contact details on file</span>');
    return '<div class="pmc-row' + (p.id === pmcSelected ? ' active' : '') + '" data-onclick="pmcSelect(\'' + pmEsc(p.id) + '\')">'
      + pmcAvatar(p)
      + '<span class="pmc-row-copy">'
        + '<span class="pmc-row-name">' + pmEsc(pmName(p))
          + (extras ? '<i class="pmc-src" title="' + extras + ' contact' + (extras === 1 ? '' : 's') + ' added here">' + PM_ICON.book + '</i>' : '')
        + '</span>'
        + lines.join('')
      + '</span>'
      + '<button type="button" class="pmc-fav' + (fav ? ' on' : '') + '" data-onclick="pmToggleFav(\'' + pmEsc(p.id) + '\',event)" title="' + (fav ? 'Remove from favourites' : 'Add to favourites') + '" aria-label="Favourite">' + PM_ICON.star + '</button>'
      + '</div>';
  }

  function pmcRenderDetail() {
    const mount = document.getElementById('pmcDetail');
    if (!mount) return;
    const p = pmcSelected ? pmPatient(pmcSelected) : null;
    if (!p) {
      mount.innerHTML = '<div class="pmc-blank"><div class="pmc-blank-art">' + PM_ICON.book + '</div>'
        + '<strong>Select a contact</strong><span>Pick a patient to see every number and email address on file.</span></div>';
      return;
    }
    const pts = pmContactPoints(p);
    const phones = pts.filter(pt => pt.kind === 'phone');
    const emails = pts.filter(pt => pt.kind === 'email');
    const d = p.demographics || {};
    const canCall = phones.length && pmCan('pm.call');
    const card = (title, inner) => '<div class="pmc-card"><div class="pmc-card-t">' + title + '</div>' + inner + '</div>';
    const valRow = (pt) => '<div class="pmc-val">'
      + '<span class="pmc-val-lbl">' + pmEsc(pt.label) + (pt.source === 'registration' ? '<i>Registration</i>' : '<i class="alt">Contact Book</i>') + '</span>'
      + (pt.kind === 'phone'
          ? '<button type="button" class="pmc-val-link" data-onclick="pmDialNumber(\'' + pmEsc(p.id) + '\',\'' + pmEsc(pt.value) + '\')"' + (pmCan('pm.call') ? '' : ' disabled') + '>' + pmEsc(pmPrettyPhone(pt.value)) + '</button>'
          : '<a class="pmc-val-link" href="mailto:' + pmEsc(pt.value) + '">' + pmEsc(pt.value) + '</a>')
      + (pt.note ? '<span class="pmc-val-note">' + pmEsc(pt.note) + '</span>' : '')
      + '</div>';

    mount.innerHTML = '<div class="pmc-detail-top">'
        + '<button type="button" class="pmc-hd-btn pmc-fav-btn' + (pmIsFav(p.id) ? ' on' : '') + '" data-onclick="pmToggleFav(\'' + pmEsc(p.id) + '\',event)" title="' + (pmIsFav(p.id) ? 'Remove from favourites' : 'Add to favourites') + '">' + PM_ICON.star + '</button>'
        + '<button type="button" class="pmc-hd-btn" data-onclick="pmcEditOpen()" title="Edit contact">' + PM_ICON.pencil + '</button>'
        + '<button type="button" class="pmc-hd-btn" data-onclick="pmcDeselect()" title="Close">' + PM_ICON.close + '</button>'
      + '</div>'
      + '<div class="pmc-hero">'
        + pmcAvatar(p, 'lg')
        + '<h2>' + pmEsc(pmName(p)) + '</h2>'
        + (d.dob ? '<span class="pmc-hero-sub">DOB ' + pmEsc(d.dob) + '</span>' : '')
        + '<div class="pmc-actions">'
          + '<button type="button" class="pmc-act" data-onclick="pmDialNumber(\'' + pmEsc(p.id) + '\',\'' + pmEsc(phones.length ? phones[0].value : '') + '\')"' + (canCall ? '' : ' disabled') + ' title="Call">' + PM_ICON.phone + '</button>'
          + '<button type="button" class="pmc-act" data-onclick="pmJumpToMessages(\'' + pmEsc(p.id) + '\')" title="Message">' + PM_ICON.chatMini + '</button>'
          + '<button type="button" class="pmc-act" data-onclick="pmOpenRecordFor(\'' + pmEsc(p.id) + '\')" title="Patient record">' + PM_ICON.note + '</button>'
        + '</div>'
      + '</div>'
      + '<div class="pmc-cards">'
        + card('Source', '<div class="pmc-source">' + PM_ICON.user + 'Registration record'
            + (pmBookEntries(p.id).length ? '<span class="pmc-source-add">+ ' + pmBookEntries(p.id).length + ' added in Contact Book</span>' : '') + '</div>')
        + card('Phone number' + (phones.length > 1 ? 's' : ''), phones.length
            ? phones.map(valRow).join('')
            : '<div class="pmc-none">No number on file</div>')
        + card('Email' + (emails.length > 1 ? 's' : ''), emails.length
            ? emails.map(valRow).join('')
            : '<div class="pmc-none">No email address on file</div>')
        + '<button type="button" class="pmc-delete" data-onclick="pmcEditOpen(1)">' + PM_ICON.trash + 'Edit or remove contact details</button>'
      + '</div>';
  }

  function pmcSelect(id) { pmcSelected = id; pmcRenderList(); pmcRenderDetail(); }
  function pmcDeselect() { pmcSelected = null; pmcRenderList(); pmcRenderDetail(); }
  function pmcSetTab(k) {
    pmcTab = k;
    document.querySelectorAll('#pmMount .pmc-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-k') === k));
    pmcRenderList();
  }
  // Search box is rendered once and never rewritten, so typing keeps focus.
  function pmcSetSearch(v) { pmBookSearch = v; pmcRenderList(); }

  let pmEditDraft = null;
  function pmcEditOpen(focusExtras) {
    const p = pmcSelected ? pmPatient(pmcSelected) : null; if (!p) return;
    const c = pmContact(p);
    pmEditDraft = {
      patientId: p.id,
      mobile: c.mobile, email: c.email,
      extras: pmBookEntries(p.id).map(e => ({ id: e.id, kind: e.kind, label: e.label, value: e.value, note: e.note || '' })),
      removed: []
    };
    if (focusExtras && !pmEditDraft.extras.length) pmEditDraft.extras.push({ kind: 'phone', label: 'Parent', value: '', note: '' });
    pmcRenderEdit();
  }
  function pmcEditSync() {
    if (!pmEditDraft) return;
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    pmEditDraft.mobile = g('pmeMobile').trim();
    pmEditDraft.email = g('pmeEmail').trim();
    pmEditDraft.extras.forEach((row, i) => {
      row.value = g('pmeVal' + i).trim();
      row.label = g('pmeLbl' + i) || row.label;
      row.kind = g('pmeKind' + i) || row.kind;
      row.note = g('pmeNote' + i).trim();
    });
  }
  function pmcEditAddRow() {
    pmcEditSync();
    pmEditDraft.extras.push({ kind: 'phone', label: 'Parent', value: '', note: '' });
    pmcRenderEdit();
    const el = document.getElementById('pmeVal' + (pmEditDraft.extras.length - 1));
    if (el) el.focus();
  }
  function pmcEditRemoveRow(i) {
    pmcEditSync();
    const row = pmEditDraft.extras[i];
    if (row && row.id) pmEditDraft.removed.push(row.id);
    pmEditDraft.extras.splice(i, 1);
    pmcRenderEdit();
  }
  function pmcEditCancel() { pmEditDraft = null; pmcRenderEdit(); }

  function pmcRenderEdit() {
    const el = pmModalEl();
    if (!pmEditDraft) { el.className = 'pm-modal-overlay'; el.innerHTML = ''; return; }
    const p = pmPatient(pmEditDraft.patientId);
    if (!p) return pmcEditCancel();
    const d = p.demographics || {};
    const rows = pmEditDraft.extras.map((row, i) =>
      '<div class="pme-row">'
        + '<div class="pme-f"><label>' + (row.kind === 'email' ? 'Email address' : 'Phone number') + '</label>'
          + '<input type="text" id="pmeVal' + i + '" value="' + pmEsc(row.value) + '" placeholder="' + (row.kind === 'email' ? 'name@example.com' : '(301) 555-0142') + '"></div>'
        + '<div class="pme-f pme-f-sm"><label>Type</label><select id="pmeKind' + i + '" data-onchange="pmcEditRefresh()">'
          + '<option value="phone"' + (row.kind === 'phone' ? ' selected' : '') + '>Phone</option>'
          + '<option value="email"' + (row.kind === 'email' ? ' selected' : '') + '>Email</option></select></div>'
        + '<div class="pme-f pme-f-sm"><label>Label</label><select id="pmeLbl' + i + '">'
          + PM_LABELS.map(l => '<option' + (row.label === l ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>'
        + '<button type="button" class="pme-x" data-onclick="pmcEditRemoveRow(' + i + ')" title="Remove">' + PM_ICON.close + '</button>'
        + '<div class="pme-f pme-f-note"><label>Note</label>'
          + '<input type="text" id="pmeNote' + i + '" value="' + pmEsc(row.note) + '" placeholder="e.g. Maria Andre — mother · best after 5pm"></div>'
      + '</div>').join('');

    el.className = 'pm-modal-overlay show';
    el.innerHTML = '<div class="pm-modal pme-modal">'
      + '<div class="pme-head"><h3>Edit contact</h3>'
        + '<button type="button" class="pm-modal-x" data-onclick="pmcEditCancel()" aria-label="Close">' + PM_ICON.close + '</button></div>'
      + '<div class="pme-body">'
        + '<div class="pme-ident">' + pmcAvatar(p, 'lg')
          + '<div class="pme-ident-copy"><strong>' + pmEsc(pmName(p)) + '</strong>'
          + '<span>' + pmEsc(d.dob ? 'DOB ' + d.dob : 'Patient') + ' · name is edited on the Registration record</span></div></div>'
        + '<div class="pme-sec">Registered details<i>saved to the patient record — updates the whole portal</i></div>'
        + '<div class="pme-row pme-row-reg">'
          + '<div class="pme-f"><label>Mobile number</label><input type="text" id="pmeMobile" value="' + pmEsc(pmEditDraft.mobile) + '" placeholder="(301) 555-0142"></div>'
          + '<div class="pme-f"><label>Email address</label><input type="text" id="pmeEmail" value="' + pmEsc(pmEditDraft.email) + '" placeholder="name@example.com"></div>'
        + '</div>'
        + '<div class="pme-sec">Additional contacts<i>stored with Patient Messaging only</i></div>'
        + (rows || '<div class="pme-noextra">No extra numbers yet.</div>')
        + '<button type="button" class="pme-add" data-onclick="pmcEditAddRow()">' + PM_ICON.plus + 'Add another number or email</button>'
      + '</div>'
      + '<div class="pme-foot">'
        + '<button type="button" class="pm-mini" data-onclick="pmcEditCancel()">Cancel</button>'
        + '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" data-onclick="pmcEditSave()">' + PM_ICON.check + 'Save</button>'
      + '</div></div>';
  }
  function pmcEditRefresh() { pmcEditSync(); pmcRenderEdit(); }

  function pmcEditSave() {
    pmcEditSync();
    const draft = pmEditDraft; if (!draft) return;
    const p = pmPatient(draft.patientId); if (!p) return;
    // Validate before writing anything, so a typo can't half-apply.
    if (draft.mobile && draft.mobile.replace(/\D/g, '').length < 7) { pmToast('That mobile number does not look valid', 'err'); return; }
    if (draft.email && draft.email.indexOf('@') === -1) { pmToast('That email address does not look valid', 'err'); return; }
    for (const row of draft.extras) {
      if (!row.value) continue;
      if (row.kind === 'email' && row.value.indexOf('@') === -1) { pmToast('“' + row.value + '” is not a valid email address', 'err'); return; }
      if (row.kind === 'phone' && row.value.replace(/\D/g, '').length < 7) { pmToast('“' + row.value + '” is not a valid phone number', 'err'); return; }
    }
    const c = pmContact(p);
    if (draft.mobile !== c.mobile) pmWritePatientContact(p.id, 'phone', draft.mobile);
    if (draft.email !== c.email) pmWritePatientContact(p.id, 'email', draft.email);
    pmBookLoad();
    draft.removed.forEach(id => { pmBook.entries = pmBook.entries.filter(x => x.id !== id); });
    const user = pmCurrentUser() || {};
    draft.extras.forEach(row => {
      if (!row.value) {                                  // emptied out = remove
        if (row.id) pmBook.entries = pmBook.entries.filter(x => x.id !== row.id);
        return;
      }
      if (row.id) {
        const e = pmBook.entries.find(x => x.id === row.id);
        if (e) { e.kind = row.kind; e.label = row.label; e.value = row.value; e.note = row.note; }
      } else {
        pmBook.entries.push({
          id: pmId('pct'), patientId: p.id, kind: row.kind, label: row.label, value: row.value, note: row.note,
          addedAt: new Date().toISOString(), addedBy: user.displayName || user.username || ''
        });
      }
    });
    pmBookSave();
    pmEditDraft = null;
    pmcRenderEdit();
    pmRenderContactBook();
    pmToast('Contact saved ✓');
  }

  function pmJumpToMessages(patientId) {
    pmView = 'messages';
    renderPatientMessaging();
    pmOpenPatient(patientId);
  }
  function pmOpenRecordFor(patientId) {
    pmActivePatientId = patientId;
    pmOpenPatientRecord();
  }
  function pmDialNumber(patientId, number) {
    if (!pmCan('pm.call')) { pmToast('Calling is disabled for your account', 'err'); return; }
    if (!number) { pmToast('No number on file for this patient', 'err'); return; }
    pmActivePatientId = patientId;
    pmCall = { patientId: patientId, number: number, startedAt: pmNow(), muted: false, speaker: false, keypadOpen: false, digits: '' };
    pmRenderCallOverlay();
    clearInterval(pmCallTimer);
    pmCallTimer = setInterval(function () {
      const el = document.getElementById('pmCallTimer');
      if (el && pmCall) el.textContent = pmDuration((pmNow() - pmCall.startedAt) / 1000);
    }, 1000);
  }

  function pmCallSummary(m) {
    const c = m.call || {};
    const dir = c.direction === 'in' ? 'Incoming call' : 'Outgoing call';
    return c.outcome === 'connected' ? dir + ' · ' + pmDuration(c.durationSec) : dir + ' · ' + pmOutcomeLabel(c.outcome);
  }
  function pmOutcomeLabel(o) {
    return ({ connected: 'Connected', noanswer: 'No answer', voicemail: 'Left voicemail', busy: 'Busy', wrong: 'Wrong number' })[o] || 'Logged';
  }

  /* ---------- workspace (right side) ---------- */
  function pmOpenPatient(id) {
    const p = pmPatient(id); if (!p) return;
    pmActivePatientId = id;
    // Pull this patient's complete history - the initial bootstrap only
    // fetches a recent window, so older threads would otherwise look empty.
    pmLoadThreadFromServer(id);
    const t = pmThread(id);
    if (t && t.unread) { t.unread = 0; pmWrite(); }
    const r = pmReach(p);
    if (pmComposerTab === 'sms' && !r.canSms && r.canEmail) pmComposerTab = 'email';
    if (pmComposerTab === 'email' && !r.canEmail && r.canSms) pmComposerTab = 'sms';
    pmTargetPhoneId = ''; pmTargetEmailId = '';
    pmMobileDetail = true;
    const shell = document.getElementById('pmShell');
    if (shell) shell.classList.add('pm-show-detail');
    pmRenderDirectory();
    pmRenderWorkspace();
  }

  function pmRenderWorkspace() {
    const mount = document.getElementById('pmWorkspace');
    if (!mount) return;
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null;
    if (!p) {
      mount.innerHTML = '<div class="pm-blank">'
        + '<div class="pm-blank-art">' + PM_ICON.broadcast + '</div>'
        + '<strong>Pick a patient to start</strong>'
        + '<span>Texts, emails and phone calls all land on one timeline per patient, so you can see exactly when and how they were last reached.</span>'
        + '</div>';
      return;
    }
    const isCall = pmComposerTab === 'call';
    mount.classList.toggle('pm-pinned', !isCall);
    if (isCall) {
      mount.innerHTML = pmPatientCardHTML(p) + pmComposerHTML(p);
    } else {
      mount.innerHTML = pmPatientCardHTML(p) + pmTimelineHTML(p, pmComposerTab) + pmComposerHTML(p);
      // Open at the newest message rather than the top of the thread.
      const conv = mount.querySelector('.pm-timeline-card');
      if (conv) requestAnimationFrame(function () { conv.scrollTop = conv.scrollHeight; });
    }
    const box = document.getElementById('pmBody');
    if (box) pmAutoSize(box);
    pmUpdateSegCounter();
  }

  /* One line per channel. With several numbers (or emails) on file - a
     guardian's mobile, a work line - the line becomes a picker, and whatever
     is chosen here is the destination both the composer and the Call button
     use. One control, so there's no doubt which number a text or call goes to. */
  function pmDestLineHTML(p, kind) {
    const points = pmPointsFor(p, kind);
    const icon = kind === 'phone' ? PM_ICON.phoneMini : PM_ICON.mailMini;
    if (!points.length) {
      return '<div class="pm-cline missing">' + icon
        + '<span>No ' + (kind === 'phone' ? 'phone number' : 'email address') + ' on file</span></div>';
    }
    const chosen = pmResolveTarget(p, kind) || points[0];
    const fmt = pt => (pt.kind === 'phone' ? pmPrettyPhone(pt.value) : pt.value);
    if (points.length === 1) {
      return '<div class="pm-cline">' + icon + '<span>' + pmEsc(fmt(chosen)) + '</span>'
        + '<span class="pm-cline-tag' + (chosen.source === 'book' ? ' book' : '') + '">' + pmEsc(chosen.label) + '</span></div>';
    }
    /* Custom picker rather than a <select>: the trigger shows only the number
       (the blue chip beside it is the identifier), while the open menu still
       shows who each number belongs to - a native select can't differ between
       its closed and open text, which would leave a list of bare numbers. */
    const open = pmDestOpen === kind;
    return '<div class="pm-cline pm-cline-pick' + (open ? ' open' : '') + '">' + icon
      + '<div class="pm-dest">'
        + '<button type="button" class="pm-dest-btn" data-onclick="pmToggleDest(\'' + kind + '\',event)" title="Choose which ' + (kind === 'phone' ? 'number is texted and called' : 'address is emailed') + '">'
          + '<span>' + pmEsc(fmt(chosen)) + '</span>' + PM_ICON.chevron + '</button>'
        + '<div class="pm-dest-menu' + (open ? ' open' : '') + '">'
          + points.map(pt => '<button type="button" class="pm-dest-opt' + (pt.id === chosen.id ? ' on' : '') + '" data-onclick="pmSetTarget(\'' + kind + '\',\'' + pmEsc(pt.id) + '\')">'
              + '<span class="pm-dest-opt-copy"><strong>' + pmEsc(fmt(pt)) + '</strong>'
              + '<span>' + pmEsc(pt.label + (pt.note ? ' · ' + pt.note : '')) + '</span></span>'
              + (pt.id === chosen.id ? '<i>' + PM_ICON.check + '</i>' : '') + '</button>').join('')
        + '</div>'
      + '</div>'
      + '<span class="pm-cline-tag' + (chosen.source === 'book' ? ' book' : '') + '">' + pmEsc(chosen.label) + '</span></div>';
  }

  function pmPatientCardHTML(p) {
    const r = pmReach(p);
    const points = pmContactPoints(p);
    const d = p.demographics || {};
    const rows = pmMessages(p.id);
    const sms = rows.filter(m => !m.call && m.channel === 'sms').length;
    const emails = rows.filter(m => !m.call && m.channel === 'email').length;
    const calls = rows.filter(m => m.call).length;
    const queued = rows.filter(m => !m.call && m.status === 'queued').length;
    return '<section class="pm-card pm-patient-card">'
      + '<button type="button" class="pm-back-btn" data-onclick="pmMobileBack()" aria-label="Back to directory">' + PM_ICON.back + '</button>'
      + '<div class="pm-pc-top">'
        + '<span class="pm-av pm-av-lg">' + pmEsc(pmInitials(pmName(p))) + '</span>'
        + '<div class="pm-pc-id">'
          + '<h3>' + pmEsc(pmName(p)) + '</h3>'
          + '<span>' + pmEsc(d.dob ? 'DOB ' + d.dob : 'Patient record') + '</span>'
        + '</div>'
        + '<div class="pm-pc-actions">'
          + '<button type="button" class="pm-btn pm-btn-call" data-onclick="pmOpenDialer()"' + (r.canSms && pmCan('pm.call') ? '' : ' disabled title="No phone number on file"') + '>' + PM_ICON.phone + 'Call</button>'
          + '<button type="button" class="pm-btn pm-btn-ghost" data-onclick="pmOpenPatientRecord()">' + PM_ICON.user + 'Record</button>'
          + '<button type="button" class="pm-btn pm-btn-ghost pm-btn-danger" data-onclick="pmClearThread()"' + (pmCan('pm.send') ? '' : ' disabled') + ' title="Clear this conversation">' + PM_ICON.trash + '</button>'
        + '</div>'
      + '</div>'
      + '<div class="pm-pc-contact">'
        + (points.length
            ? pmDestLineHTML(p, 'phone') + pmDestLineHTML(p, 'email')
            : '<div class="pm-cline missing">' + PM_ICON.slash + '<span>No contact details on file</span></div>')
      + '</div>'
      + '<button type="button" class="pm-pc-book" data-onclick="pmSetView(\'contacts\')">' + PM_ICON.book + 'Manage contact numbers in the Contact Book</button>'
      + '</section>';
  }

  /* Composer is a card with three tabs - the third logs a call that already
     happened, which a chat composer has no equivalent for. */
  function pmComposerHTML(p) {
    if (!pmCan('pm.send') && !pmCan('pm.call')) {
      return '<section class="pm-card pm-locked">You have read-only access to patient communication.</section>';
    }
    const r = pmReach(p);
    if (!r.reachable && pmComposerTab !== 'call') {
      return '<section class="pm-card pm-locked pm-locked-warn">' + PM_ICON.alert
        + '<span><strong>No contact details on file.</strong> Add a mobile number or email on this patient’s Registration record, or add one in the Contact Book.</span>'
        + '<button type="button" class="pm-btn pm-btn-ghost" data-onclick="pmOpenPatientRecord()">Open record</button>'
        + '<button type="button" class="pm-btn pm-btn-ghost" data-onclick="pmSetView(\'contacts\')">Contact Book</button>'
        + (pmCan('pm.call') ? '<button type="button" class="pm-btn pm-btn-ghost" data-onclick="pmSetTab(\'call\')">Call log</button>' : '')
        + '</section>';
    }
    // One compact selector replaces the old three-tab strip. A native <details>
    // dropdown: click to pick Text / Email / Call log, closes on choice (the
    // workspace re-renders). Keeps all three views reachable from one button.
    const CH = { sms: ['Text', PM_ICON.chatMini], email: ['Email', PM_ICON.mailMini], call: ['Call log', PM_ICON.phoneMini] };
    const opt = (k, ok) =>
      '<button type="button" class="pm-chan-opt' + (pmComposerTab === k ? ' on' : '') + '" data-onclick="pmSetTab(\'' + k + '\')"'
      + (ok ? '' : ' disabled title="Not available for this patient"') + '>' + CH[k][1] + CH[k][0] + '</button>';
    const channel = '<details class="pm-chan"><summary class="pm-chan-btn">'
      + CH[pmComposerTab][1] + '<span>' + CH[pmComposerTab][0] + '</span>' + PM_ICON.chevron + '</summary>'
      + '<div class="pm-chan-menu">'
        + opt('sms', r.canSms && pmCan('pm.send'))
        + opt('email', r.canEmail && pmCan('pm.send'))
        + opt('call', pmCan('pm.call'))
      + '</div></details>';
    return '<section class="pm-card pm-composer-card">'
      + '<div class="pm-tabs">' + channel + '</div>'
      + '<div class="pm-tab-body">' + (pmComposerTab === 'call' ? pmCallLogHTML(p) : pmMessageFormHTML(p)) + '</div>'
      + '</section>';
  }

  function pmMessageFormHTML(p) {
    const useEmail = pmComposerTab === 'email';
    const kind = useEmail ? 'email' : 'phone';
    const points = pmPointsFor(p, kind);
    const chosen = pmResolveTarget(p, kind);
    // The destination is picked once, on the contact card above. Echo it here
    // (rather than offering a second competing picker) so there is exactly one
    // place that decides where a message goes.
    const toControl = '<span class="pm-to">To <strong>'
      + pmEsc(chosen ? (chosen.kind === 'phone' ? pmPrettyPhone(chosen.value) : chosen.value) : '—') + '</strong>'
      + (chosen ? '<span class="pm-to-tag">' + pmEsc(chosen.label) + '</span>' : '')
      + (points.length > 1 ? '<span class="pm-to-hint">change above</span>' : '') + '</span>';
    void toControl;
    return (useEmail ? '<input type="text" class="pm-input" id="pmSubject" placeholder="Subject line" maxlength="180">' : '')
      + '<div class="pm-inputbar">'
        + '<div class="pm-tpl-wrap">'
          + '<button type="button" class="pm-mini pm-tpl-icon" data-onclick="pmToggleTemplates(event)" title="Message templates">' + PM_ICON.template + '</button>'
          + '<div class="pm-tpl-menu" id="pmTplMenu">' + pmTemplateMenuHTML(p) + '</div>'
        + '</div>'
        + '<textarea class="pm-textarea" id="pmBody" rows="1" placeholder="' + (useEmail ? 'Write an email to ' : 'Message ') + pmEsc(pmFirst(p)) + '…" data-oninput="pmComposerChanged()" data-onkeydown="pmComposerKey(event)"></textarea>'
        + '<button type="button" class="pm-btn pm-btn-primary pm-send-btn" data-onclick="pmSend()" title="' + (useEmail ? 'Send email' : 'Send text') + '">' + PM_ICON.send + '</button>'
      + '</div>'
      + '<span class="pm-counter" id="pmSegCounter" hidden></span>';
  }

  const PM_OUTCOMES = [
    { k: 'connected', label: 'Connected' },
    { k: 'voicemail', label: 'Left voicemail' },
    { k: 'noanswer', label: 'No answer' },
    { k: 'busy', label: 'Busy' },
    { k: 'wrong', label: 'Wrong number' }
  ];

  function pmCallLogHTML(p) {
    const r = pmReach(p);
    const calls = pmMessages(p.id).filter(m => m.call).reverse();
    return '<div class="pm-form-head">'
        + '<span class="pm-to">Calls are recorded automatically when you use the dialer.</span>'
        + '<div class="pm-foot-right">'
          + '<button type="button" class="pm-mini" data-onclick="pmToggleManualCall()">' + PM_ICON.plus + (pmManualOpen ? 'Cancel' : 'Add past call') + '</button>'
          + (r.canSms ? '<button type="button" class="pm-btn pm-btn-call" data-onclick="pmOpenDialer()">' + PM_ICON.phone + 'Start call</button>' : '')
        + '</div>'
      + '</div>'
      + (pmManualOpen ? pmManualCallFormHTML(p) : '')
      + (calls.length ? pmCallTimelineHTML(calls)
        : '<div class="pm-calllog-empty">' + PM_ICON.phone
          + '<strong>No calls recorded yet</strong>'
          + '<span>' + (r.canSms
              ? 'Start a call and the time, duration and outcome are written here automatically when you hang up.'
              : 'This patient has no phone number on file. Add one in Registration, or use “Add past call” to record one manually.') + '</span></div>');
  }

  /* Timeline layout - a connecting rail with a dot per call, grouped under day
     dividers, newest first. Each entry stays editable (outcome + note). */
  function pmCallTimelineHTML(calls) {
    let lastDay = '';
    return '<div class="pm-tl">' + calls.map(m => {
      const day = pmDayLabel(m.createdAt);
      const head = day !== lastDay ? '<div class="pm-tl-day"><span>' + pmEsc(day) + '</span></div>' : '';
      lastDay = day;
      return head + pmCallRowHTML(m);
    }).join('') + '</div>';
  }

  function pmCallRowHTML(m) {
    const c = m.call || {};
    const d = new Date(m.createdAt);
    const connected = c.outcome === 'connected';
    const editing = pmNoteEditId === m.id;
    const stamp = (isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) + ' · ' + pmTime(m.createdAt);
    const outcomePills = PM_OUTCOMES.map(o =>
      '<button type="button" class="pm-outcome' + (c.outcome === o.k ? ' active' : '') + '" data-onclick="pmSetCallOutcome(\'' + m.id + '\',\'' + o.k + '\')">' + o.label + '</button>'
    ).join('');
    const noteBlock = editing
      ? '<div class="pm-cl-noteedit">'
          + '<textarea class="pm-textarea" id="pmNoteBox-' + m.id + '" rows="2" placeholder="What was discussed, follow-up needed, who you spoke to…">' + pmEsc(c.note || '') + '</textarea>'
          + '<div class="pm-cl-noteactions">'
            + '<button type="button" class="pm-mini" data-onclick="pmCancelNote()">Cancel</button>'
            + '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" data-onclick="pmSaveNote(\'' + m.id + '\')">' + PM_ICON.check + 'Save note</button>'
          + '</div></div>'
      : (c.note
          ? '<div class="pm-cl-note" data-onclick="pmStartNote(\'' + m.id + '\')" title="Click to edit">' + PM_ICON.note + '<span>' + pmEsc(c.note).replace(/\n/g, '<br>') + '</span></div>'
          : '<button type="button" class="pm-cl-addnote" data-onclick="pmStartNote(\'' + m.id + '\')">' + PM_ICON.note + 'Add a note</button>');
    return '<article class="pm-tl-item pm-cl-' + pmEsc(c.outcome || 'logged') + '">'
      + '<span class="pm-tl-dot">' + PM_ICON.phoneMini + '</span>'
      + '<div class="pm-tl-body">'
        + '<div class="pm-cl-main">'
          + '<div class="pm-cl-id">'
            + '<div class="pm-cl-line1">'
              + '<strong>' + (c.direction === 'in' ? 'Incoming call' : 'Outgoing call') + '</strong>'
              + '<span class="pm-cl-badge">' + pmEsc(pmOutcomeLabel(c.outcome)) + '</span>'
            + '</div>'
            + '<div class="pm-cl-line2">' + pmEsc(stamp) + (c.number ? ' · ' + pmEsc(pmPrettyPhone(c.number)) : '') + (m.sentBy ? ' · ' + pmEsc(m.sentBy) : '') + '</div>'
          + '</div>'
          + '<div class="pm-cl-dur"' + (connected ? '' : ' data-muted="1"') + '>'
            + '<b>' + pmDuration(c.durationSec) + '</b><span>duration</span></div>'
        + '</div>'
        + '<div class="pm-cl-outcomes"><span class="pm-cl-outcomes-label">Outcome</span>' + outcomePills + '</div>'
        + noteBlock
      + '</div></article>';
  }

  /* Kept for calls made on a desk phone, which the dialer never sees. */
  function pmManualCallFormHTML(p) {
    const phones = pmPointsFor(p, 'phone');
    return '<div class="pm-manual" id="pmManualCall">'
      + '<div class="pm-manual-hd">' + PM_ICON.note + 'Record a call that happened outside the portal</div>'
      + '<div class="pm-field"><label>Direction</label><div class="pm-seg">'
        + '<button type="button" class="pm-seg-btn active" data-dir="out" data-onclick="pmDispSetDir(this)">Outgoing</button>'
        + '<button type="button" class="pm-seg-btn" data-dir="in" data-onclick="pmDispSetDir(this)">Incoming</button>'
        + '</div></div>'
      + '<div class="pm-field"><label>Outcome</label><div class="pm-outcomes">'
        + PM_OUTCOMES.map((o, i) => '<button type="button" class="pm-outcome' + (i === 0 ? ' active' : '') + '" data-k="' + o.k + '" data-onclick="pmDispSetOutcome(this)">' + o.label + '</button>').join('')
        + '</div></div>'
      + '<div class="pm-field-row">'
        + '<div class="pm-field"><label>Duration (mm:ss)</label><input type="text" class="pm-input" id="pmManualDuration" value="00:00"></div>'
        + '<div class="pm-field"><label>Number</label><input type="text" class="pm-input" id="pmManualNumber" value="' + pmEsc(phones.length ? phones[0].value : '') + '"></div>'
      + '</div>'
      + '<div class="pm-field"><label>Notes</label><textarea class="pm-textarea" id="pmManualNote" rows="2" placeholder="What was discussed…"></textarea></div>'
      + '<div class="pm-manual-foot">'
        + '<button type="button" class="pm-mini" data-onclick="pmToggleManualCall()">Cancel</button>'
        + '<button type="button" class="pm-btn pm-btn-primary pm-btn-sm" data-onclick="pmSaveManualCall()">' + PM_ICON.check + 'Add to log</button>'
      + '</div></div>';
  }

  function pmTemplateMenuHTML(p) {
    const list = PM_TEMPLATES.filter(t => t.channel === 'both' || t.channel === pmComposerTab);
    if (!list.length) return '<div class="pm-tpl-empty">No templates for this channel.</div>';
    return list.map(t => '<button type="button" class="pm-tpl-item" data-onclick="pmApplyTemplate(\'' + t.id + '\')">'
      + '<strong>' + pmEsc(t.name) + '</strong>'
      + '<span>' + pmEsc(pmFillTemplate(t.body, p).slice(0, 76)) + '…</span></button>').join('');
  }

  /* ---------- activity timeline (newest first, rail + dots) ---------- */
  /* Messages only - chronological (oldest first, like any chat), outbound on
     the right, anything from the patient on the left. Calls are
     excluded: they have their own Call log tab, and mixing them in made this
     read as a mixed audit trail rather than a conversation. */
  function pmTimelineHTML(p, channel) {
    // Text and email are separate threads. A patient replying by SMS to an
    // emailed message would read as one muddled conversation otherwise, and
    // the two channels carry different content (emails have subjects).
    const isEmail = channel === 'email';
    const title = isEmail ? 'Email conversation' : 'Text conversation';
    const icon = isEmail ? PM_ICON.mailMini : PM_ICON.chatMini;
    const rows = pmMessages(p.id).filter(m => !m.call && (isEmail ? m.channel === 'email' : m.channel !== 'email'));
    if (!rows.length) {
      return '<section class="pm-card pm-timeline-card">'
        + '<div class="pm-card-hd">' + icon + '<h4>' + title + '</h4></div>'
        + '<div class="pm-tl-empty">No ' + (isEmail ? 'emails' : 'text messages') + ' yet. '
        + (isEmail ? 'Emails' : 'Texts') + ' with this patient will appear here as a conversation.</div>'
        + '</section>';
    }
    let lastDay = '';
    const items = rows.map(m => {
      const day = pmDayLabel(m.createdAt);
      const head = day !== lastDay ? '<div class="pm-chat-day"><span>' + pmEsc(day) + '</span></div>' : '';
      lastDay = day;
      return head + pmChatMsgHTML(m, p);
    }).join('');
    return '<section class="pm-card pm-timeline-card">'
      + '<div class="pm-card-hd">' + icon + '<h4>' + title + '</h4><span class="pm-card-count">' + rows.length + '</span></div>'
      + '<div class="pm-chat">' + items + '</div>'
      + '</section>';
  }

  // WhatsApp-style delivery tick shown inside the bubble stamp, outbound only:
  // double check for a sent message, a single check while queued, a red mark on
  // failure. Colour is handled in CSS (read = blue, pending = grey, fail = red).
  function pmChatTick(m) {
    if (m.direction !== 'out') return '';
    if (m.status === 'failed') return '<span class="pm-tick fail" title="Failed to send">!</span>';
    if (m.status === 'queued') return '<span class="pm-tick pend" title="Queued">✓</span>';
    return '<span class="pm-tick read" title="Sent">✓✓</span>';
  }

  function pmChatMsgHTML(m, p) {
    const out = m.direction === 'out';
    const who = out ? (m.sentBy || 'Clinic') : pmName(p);
    const avatar = '<span class="pm-chat-av' + (out ? ' out' : '') + '">' + pmEsc(pmInitials(who)) + '</span>';
    // No per-bubble channel chip - the card header already says which thread
    // this is, and every message in it is that channel. Time + tick live inside
    // the bubble (WhatsApp-style); the old below-bubble foot is kept in the
    // markup but hidden by the skin.
    return '<article class="pm-chat-msg' + (out ? ' out' : ' in') + '">'
      + avatar
      + '<div class="pm-chat-col">'
        + '<div class="pm-chat-meta"><strong>' + pmEsc(who) + '</strong>'
          + '<time>' + pmTime(m.createdAt) + '</time></div>'
        + '<div class="pm-chat-bubble">'
          + (m.subject ? '<div class="pm-chat-subject">' + pmEsc(m.subject) + '</div>' : '')
          + '<span class="pm-chat-text">' + pmEsc(m.body || '').replace(/\n/g, '<br>') + '</span>'
          + '<span class="pm-chat-stamp">' + pmTime(m.createdAt) + pmChatTick(m) + '</span>'
        + '</div>'
        + '<div class="pm-chat-foot">' + (m.to ? '<span>' + pmEsc(m.to) + '</span>' : '') + pmStatusHTML(m) + '</div>'
      + '</div></article>';
  }

  function pmStatusHTML(m) {
    if (m.direction !== 'out') return '';
    if (m.status === 'queued') return '<span class="pm-badge queued" title="Not delivered yet — use Refresh to retry">' + PM_ICON.clock + 'Queued</span>';
    if (m.status === 'failed') return '<span class="pm-badge failed">' + PM_ICON.alert + 'Failed</span>';
    if (m.status === 'delivered') return '<span class="pm-badge ok">' + PM_ICON.check + 'Delivered</span>';
    return '<span class="pm-badge ok">' + PM_ICON.check + 'Sent</span>';
  }

  /* ---------- composer behaviour ---------- */
  function pmSetTab(k) {
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null; if (!p) return;
    const r = pmReach(p);
    if (k === 'sms' && !r.canSms) return;
    if (k === 'email' && !r.canEmail) return;
    if (k === 'call' && !pmCan('pm.call')) return;
    pmComposerTab = k;

    pmRenderWorkspace();
  }
  function pmSetTarget(kind, id) {
    if (kind === 'email') pmTargetEmailId = id; else pmTargetPhoneId = id;
    pmDestOpen = '';
    pmRenderWorkspace();
  }
  function pmToggleDest(kind, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    pmDestOpen = (pmDestOpen === kind) ? '' : kind;
    pmRenderWorkspace();
  }
  function pmAutoSize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }
  function pmUpdateSegCounter() {
    const counter = document.getElementById('pmSegCounter');
    if (!counter) return;
    if (pmComposerTab === 'email') { counter.textContent = 'Email · no length limit'; counter.classList.remove('over'); return; }
    if (pmComposerTab === 'call') return;
    const box = document.getElementById('pmBody');
    const s = pmSmsSegments(box ? box.value : '');
    counter.textContent = s.len + ' characters · ' + s.segments + ' SMS segment' + (s.segments === 1 ? '' : 's');
    counter.classList.toggle('over', s.segments > 1);
  }
  function pmComposerChanged() { pmAutoSize(document.getElementById('pmBody')); pmUpdateSegCounter(); }
  function pmComposerKey(ev) {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); pmSend(); }
  }
  function pmToggleTemplates(ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('pmTplMenu');
    if (menu) menu.classList.toggle('open');
  }
  function pmApplyTemplate(id) {
    const t = PM_TEMPLATES.find(x => x.id === id); if (!t) return;
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null;
    const body = document.getElementById('pmBody');
    const subject = document.getElementById('pmSubject');
    if (body) { body.value = pmFillTemplate(t.body, p); pmAutoSize(body); }
    if (subject && t.subject) subject.value = pmFillTemplate(t.subject, p);
    const menu = document.getElementById('pmTplMenu'); if (menu) menu.classList.remove('open');
    pmUpdateSegCounter();
    if (body) body.focus();
  }

  function pmSend() {
    if (!pmCan('pm.send')) { pmToast('Sending is disabled for your account', 'err'); return; }
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null; if (!p) return;
    const box = document.getElementById('pmBody');
    const subjectEl = document.getElementById('pmSubject');
    const body = box ? box.value.trim() : '';
    if (!body) { pmToast('Write a message first', 'err'); return; }
    const useEmail = pmComposerTab === 'email';
    const target = pmResolveTarget(p, useEmail ? 'email' : 'phone');
    if (!target) { pmToast('This patient has no ' + (useEmail ? 'email address' : 'phone number') + ' on file', 'err'); return; }
    const user = pmCurrentUser() || {};
    const now = new Date().toISOString();
    pmLoad();
    const thread = pmThread(p.id, true);
    // Optimistic row so the message appears instantly; it's replaced by the
    // server's authoritative version (real id and status) once the send
    // returns, or marked failed with the reason if it doesn't.
    const tempId = pmId('pmsg');
    pmData.messages.push({
      id: tempId, threadId: thread.id, patientId: p.id,
      direction: 'out', channel: useEmail ? 'email' : 'sms',
      to: target.kind === 'phone' ? pmPrettyPhone(target.value) : target.value,
      toLabel: target.source === 'book' ? target.label : '',
      subject: useEmail && subjectEl ? subjectEl.value.trim() : '',
      body: body, createdAt: now, status: 'queued',
      sentBy: user.displayName || user.username || ''
    });
    thread.lastMessageAt = now;
    if (!pmWrite()) return;
    if (box) box.value = '';
    if (useEmail && subjectEl) subjectEl.value = '';
    pmRenderDirectory();
    pmRenderWorkspace();

    if (typeof window.ctgApiFetch !== 'function') {
      pmToast('Saved locally — delivery is unavailable offline', 'err');
      return;
    }
    window.ctgApiFetch('/api/patient-messages', {
      method: 'POST',
      body: JSON.stringify({
        patientId: p.id,
        channel: useEmail ? 'email' : 'sms',
        to: target.value,
        subject: useEmail && subjectEl ? subjectEl.value.trim() : '',
        body: body
      })
    }).then(function (res) {
      // Swap the optimistic row for the server's version.
      const i = pmData.messages.findIndex(m => m.id === tempId);
      if (i !== -1) pmData.messages.splice(i, 1);
      pmUpsert(res.message);
      pmWrite(); pmRenderDirectory(); pmRenderWorkspace();
      pmToast(useEmail ? 'Email sent' : 'Text sent');
    }).catch(function (e) {
      const m = pmData.messages.find(x => x.id === tempId);
      if (m) { m.status = 'failed'; m.error = e.message || 'Delivery failed'; }
      pmWrite(); pmRenderDirectory(); pmRenderWorkspace();
      pmToast('Not sent — ' + (e.message || 'delivery failed'), 'err');
    });
  }

  /* Retry a message the server recorded as failed. The row already exists
     server-side, so this re-sends it there rather than posting a duplicate. */
  function pmDeliverMessage(m) {
    if (!m || m.status === 'sent') return Promise.resolve(false);
    if (typeof window.ctgApiFetch !== 'function') { pmToast('Delivery is unavailable offline', 'err'); return Promise.resolve(false); }
    // Optimistic rows that never reached the server have no server id yet.
    if (String(m.id || '').indexOf('pmsg_') === 0) { pmToast('This message was never sent — write it again', 'err'); return Promise.resolve(false); }
    return window.ctgApiFetch('/api/patient-messages/' + encodeURIComponent(m.id) + '/retry', { method: 'POST' })
      .then(function (res) {
        pmUpsert(res.message);
        pmWrite(); pmRenderDirectory(); pmRenderWorkspace();
        return res.message.status === 'sent';
      })
      .catch(function (e) {
        m.error = e.message || 'Delivery failed';
        pmWrite(); pmRenderDirectory(); pmRenderWorkspace();
        return false;
      });
  }

  /* Retries everything still unsent (the refresh button in the header). */
  function pmDeliverQueued() {
    const pending = (pmData && pmData.messages ? pmData.messages : [])
      .filter(function (m) { return m.direction === 'out' && m.status !== 'sent' && !m.call; });
    if (!pending.length) { pmToast('Nothing is waiting to send'); return; }
    pmToast('Retrying ' + pending.length + ' message' + (pending.length === 1 ? '' : 's') + '…');
    // Sequential, not parallel: providers rate-limit, and a burst of
    // simultaneous sends is the fastest way to get throttled.
    pending.reduce(function (chain, m) {
      return chain.then(function () { return pmDeliverMessage(m); });
    }, Promise.resolve()).then(function () {
      const left = pmQueuedCount();
      pmToast(left ? (left + ' still unsent — check the errors shown') : 'All messages sent', left ? 'err' : '');
    });
  }

  function pmOpenPatientRecord() {
    if (!pmActivePatientId) return;
    if (typeof showPage === 'function') showPage('patientLists');
    try { selectedPatientId = pmActivePatientId; } catch (e) {}
    if (typeof renderPatientDetails === 'function') renderPatientDetails(pmActivePatientId);
    if (typeof setPatientDetailTab === 'function') setPatientDetailTab('overview');
  }
  async function pmClearThread() {
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null; if (!p) return;
    const msg = 'Clear the whole communication history with ' + pmName(p) + '? Texts, emails and call logs on this timeline are removed.';
    const ok = (typeof ctgConfirm === 'function') ? await ctgConfirm(msg, { danger: true, okLabel: 'Clear' }) : confirm(msg);
    if (!ok) return;
    pmLoad();
    pmData.messages = pmData.messages.filter(m => m.patientId !== p.id);
    const t = pmThread(p.id);
    if (t) { t.lastMessageAt = ''; t.unread = 0; }
    pmWrite();
    pmRenderDirectory();
    pmRenderWorkspace();
    pmToast('Conversation cleared');
  }
  function pmMobileBack() {
    pmMobileDetail = false;
    const shell = document.getElementById('pmShell');
    if (shell) shell.classList.remove('pm-show-detail');
  }

  /* ============================ CALLING ============================ */
  function pmOpenDialer() {
    if (!pmCan('pm.call')) { pmToast('Calling is disabled for your account', 'err'); return; }
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null; if (!p) return;
    const phones = pmPointsFor(p, 'phone');
    if (!phones.length) { pmToast('This patient has no phone number on file', 'err'); return; }
    const pick = pmResolveTarget(p, 'phone') || phones[0];
    pmCall = { patientId: p.id, number: pick.value, startedAt: pmNow(), muted: false, speaker: false, keypadOpen: false, digits: '' };
    pmRenderCallOverlay();
    clearInterval(pmCallTimer);
    pmCallTimer = setInterval(function () {
      const el = document.getElementById('pmCallTimer');
      if (el && pmCall) el.textContent = pmDuration((pmNow() - pmCall.startedAt) / 1000);
    }, 1000);
  }
  function pmCallOverlayEl() {
    let el = document.getElementById('pmCallOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'pmCallOverlay'; el.className = 'pm-call-overlay'; document.body.appendChild(el); }
    return el;
  }
  function pmRenderCallOverlay() {
    const el = pmCallOverlayEl();
    if (!pmCall) { el.className = 'pm-call-overlay'; el.innerHTML = ''; return; }
    const p = pmPatient(pmCall.patientId);
    const name = p ? pmName(p) : 'Patient';
    el.className = 'pm-call-overlay show';
    el.innerHTML = '<div class="pm-call-modal">'
      + '<div class="pm-call-note">' + PM_ICON.alert + 'Telephony provider not connected — this records the call, it does not dial out yet.</div>'
      + '<div class="pm-call-av">' + pmEsc(pmInitials(name)) + '</div>'
      + '<div class="pm-call-name">' + pmEsc(name) + '</div>'
      + '<div class="pm-call-num">' + pmEsc(pmPrettyPhone(pmCall.number)) + '</div>'
      + '<div class="pm-call-timer" id="pmCallTimer">' + pmDuration((pmNow() - pmCall.startedAt) / 1000) + '</div>'
      + (pmCall.keypadOpen ? pmKeypadHTML() : '')
      + '<div class="pm-call-ctls">'
        + '<button type="button" class="pm-cctl' + (pmCall.muted ? ' on' : '') + '" data-onclick="pmCallToggleMute()">' + (pmCall.muted ? PM_ICON.micOff : PM_ICON.micOn) + '<span>Mute</span></button>'
        + '<button type="button" class="pm-cctl' + (pmCall.keypadOpen ? ' on' : '') + '" data-onclick="pmCallToggleKeypad()">' + PM_ICON.grid + '<span>Keypad</span></button>'
        + '<button type="button" class="pm-cctl' + (pmCall.speaker ? ' on' : '') + '" data-onclick="pmCallToggleSpeaker()">' + PM_ICON.speaker + '<span>Speaker</span></button>'
      + '</div>'
      + '<button type="button" class="pm-call-hang" data-onclick="pmEndCall()" aria-label="End call">' + PM_ICON.phone + '</button>'
      + '<div class="pm-call-hint">Ending the call opens the disposition log.</div>'
      + '</div>';
  }
  function pmKeypadHTML() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    return '<div class="pm-keypad"><div class="pm-keypad-display">' + pmEsc(pmCall.digits || '') + '</div>'
      + '<div class="pm-keypad-grid">' + keys.map(k => '<button type="button" data-onclick="pmKeypadPress(\'' + k + '\')">' + k + '</button>').join('') + '</div></div>';
  }
  function pmKeypadPress(k) {
    if (!pmCall) return;
    pmCall.digits = (pmCall.digits || '') + k;
    const d = document.querySelector('#pmCallOverlay .pm-keypad-display');
    if (d) d.textContent = pmCall.digits;
  }
  function pmCallToggleMute() { if (!pmCall) return; pmCall.muted = !pmCall.muted; pmRenderCallOverlay(); }
  function pmCallToggleSpeaker() { if (!pmCall) return; pmCall.speaker = !pmCall.speaker; pmRenderCallOverlay(); }
  function pmCallToggleKeypad() { if (!pmCall) return; pmCall.keypadOpen = !pmCall.keypadOpen; pmRenderCallOverlay(); }

  const PM_CONNECTED_MIN_SEC = 5;
  function pmEndCall() {
    if (!pmCall) return;
    clearInterval(pmCallTimer); pmCallTimer = null;
    const elapsed = Math.round((pmNow() - pmCall.startedAt) / 1000);
    const patientId = pmCall.patientId, number = pmCall.number;
    pmCall = null;
    pmCloseCall();
    const id = pmCommitCall(patientId, number, {
      direction: 'out',
      outcome: elapsed >= PM_CONNECTED_MIN_SEC ? 'connected' : 'noanswer',
      durationSec: elapsed,
      note: ''
    });
    // Land the user straight in the log with the note box open for this call.
    // The dialer can be launched from the Contact Book too, so make sure the
    // Messages view is actually on screen before trying to render into it.
    pmActivePatientId = patientId;
    pmComposerTab = 'call';
    pmNoteEditId = id;
    pmManualOpen = false;
    if (pmView !== 'messages') { pmView = 'messages'; pmMobileDetail = true; renderPatientMessaging(); }
    else { pmRenderDirectory(); pmRenderWorkspace(); }
    pmFocusNote(id);
    pmToast('Call logged · ' + pmDuration(elapsed) + ' — add a note if needed');
  }

  // Scoped so the same controls work in the modal AND the inline "Log a call" tab.
  function pmDispSetDir(btn) {
    const wrap = btn.closest('.pm-seg'); if (!wrap) return;
    wrap.querySelectorAll('.pm-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
  }
  function pmDispSetOutcome(btn) {
    const wrap = btn.closest('.pm-outcomes'); if (!wrap) return;
    wrap.querySelectorAll('.pm-outcome').forEach(b => b.classList.toggle('active', b === btn));
  }
  function pmParseDuration(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }
  function pmCommitCall(patientId, number, disp) {
    const user = pmCurrentUser() || {};
    const now = new Date().toISOString();
    const id = pmId('pcall');
    pmLoad();
    const thread = pmThread(patientId, true);
    pmData.messages.push({
      id: id, threadId: thread.id, patientId: patientId,
      direction: disp.direction, channel: 'call', body: '', createdAt: now, status: 'logged',
      sentBy: user.displayName || user.username || '',
      call: { direction: disp.direction, number: number || '', outcome: disp.outcome, durationSec: disp.durationSec, note: disp.note || '' }
    });
    thread.lastMessageAt = now;
    pmWrite();
    return id;
  }
  function pmCallRecord(id) {
    pmLoad();
    return pmData.messages.find(m => m.id === id && m.call) || null;
  }
  function pmFocusNote(id) {
    requestAnimationFrame(function () {
      const box = document.getElementById('pmNoteBox-' + id);
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    });
  }
  function pmStartNote(id) {
    if (!pmCan('pm.call')) return;
    pmNoteEditId = id;
    pmRenderWorkspace();
    pmFocusNote(id);
  }
  function pmCancelNote() { pmNoteEditId = null; pmRenderWorkspace(); }
  function pmSaveNote(id) {
    const box = document.getElementById('pmNoteBox-' + id);
    const rec = pmCallRecord(id);
    if (!rec) { pmNoteEditId = null; pmRenderWorkspace(); return; }
    rec.call.note = box ? box.value.trim() : '';
    pmWrite();
    pmNoteEditId = null;
    pmRenderDirectory();
    pmRenderWorkspace();
    pmToast('Note saved ✓');
  }
  function pmSetCallOutcome(id, outcome) {
    if (!pmCan('pm.call')) return;
    const rec = pmCallRecord(id); if (!rec) return;
    rec.call.outcome = outcome;
    // A call marked unanswered has no talk time to report.
    if (outcome !== 'connected') rec.call.durationSec = 0;
    pmWrite();
    pmRenderDirectory();
    pmRenderWorkspace();
  }
  function pmToggleManualCall() {
    pmManualOpen = !pmManualOpen;
    pmRenderWorkspace();
  }
  function pmSaveManualCall() {
    if (!pmCan('pm.call')) { pmToast('Calling is disabled for your account', 'err'); return; }
    const p = pmActivePatientId ? pmPatient(pmActivePatientId) : null; if (!p) return;
    const scope = document.getElementById('pmManualCall'); if (!scope) return;
    const dirBtn = scope.querySelector('.pm-seg-btn.active');
    const outBtn = scope.querySelector('.pm-outcome.active');
    const outcome = outBtn ? outBtn.getAttribute('data-k') : 'connected';
    const durEl = scope.querySelector('#pmManualDuration');
    const numEl = scope.querySelector('#pmManualNumber');
    const noteEl = scope.querySelector('#pmManualNote');
    pmCommitCall(p.id, numEl ? numEl.value.trim() : '', {
      direction: dirBtn ? dirBtn.getAttribute('data-dir') : 'out',
      outcome: outcome,
      durationSec: outcome === 'connected' ? pmParseDuration(durEl ? durEl.value : '') : 0,
      note: noteEl ? noteEl.value.trim() : ''
    });
    pmManualOpen = false;
    pmRenderDirectory();
    pmRenderWorkspace();
    pmToast('Call added to the log ✓');
  }
  function pmCloseCall() {
    clearInterval(pmCallTimer); pmCallTimer = null;
    pmCall = null;
    const el = document.getElementById('pmCallOverlay');
    if (el) { el.className = 'pm-call-overlay'; el.innerHTML = ''; }
  }

  /* ---------- misc ---------- */
  function pmSetSearch(v) { pmSearch = v; pmRenderDirectory(); }
  function pmSetReachFilter(k) {
    pmReachFilter = k;
    document.querySelectorAll('#pmMount .pm-dir-filter').forEach(b => b.classList.toggle('active', b.getAttribute('data-k') === k));
    pmRenderDirectory();
  }
  function pmUpdateSidebarBadge() {
    const el = document.getElementById('pmSidebarBadge');
    if (!el) return;
    const n = pmUnreadTotal();
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.display = n ? '' : 'none';
  }
  function pmInstallSync() {
    try {
      if ('BroadcastChannel' in window) {
        pmBroadcast = new BroadcastChannel(PM_CHANNEL_NAME);
        pmBroadcast.onmessage = function () {
          pmData = pmRead();
          if (pmPageActive()) { pmRenderDirectory(); pmRenderWorkspace(); }
          pmUpdateSidebarBadge();
        };
      }
    } catch (e) { pmBroadcast = null; }
    window.addEventListener('storage', function (event) {
      if (event.key !== PM_STORE_KEY) return;
      pmData = pmRead();
      if (pmPageActive()) { pmRenderDirectory(); pmRenderWorkspace(); }
      pmUpdateSidebarBadge();
    });
  }
  document.addEventListener('click', function (e) {
    if (pmDestOpen && !e.target.closest('.pm-dest')) { pmDestOpen = ''; if (pmPageActive()) pmRenderWorkspace(); }
    if (!e.target.closest('.pm-tpl-wrap')) {
      const m = document.getElementById('pmTplMenu');
      if (m) m.classList.remove('open');
    }
  });

  /* ---------- icons ---------- */
  const PM_ICON = {
    broadcast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    phoneMini: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    chatMini: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-8.5h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
    mailMini: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    slash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="3.5" cy="18" r="1.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    micOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1.7"/><circle cx="12" cy="6" r="1.7"/><circle cx="18" cy="6" r="1.7"/><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/><circle cx="6" cy="18" r="1.7"/><circle cx="12" cy="18" r="1.7"/><circle cx="18" cy="18" r="1.7"/></svg>'
  };

  /* ---------- exports ---------- */
  window.renderPatientMessaging = renderPatientMessaging;
  window.pmOpenPatient = pmOpenPatient;
  window.pmSetSearch = pmSetSearch;
  window.pmSetReachFilter = pmSetReachFilter;
  window.pmSetTab = pmSetTab;
  window.pmSend = pmSend;
  window.pmComposerChanged = pmComposerChanged;
  window.pmComposerKey = pmComposerKey;
  window.pmToggleTemplates = pmToggleTemplates;
  window.pmApplyTemplate = pmApplyTemplate;
  window.pmMobileBack = pmMobileBack;
  window.pmOpenPatientRecord = pmOpenPatientRecord;
  window.pmClearThread = pmClearThread;
  window.pmOpenDialer = pmOpenDialer;
  window.pmEndCall = pmEndCall;
  window.pmCloseCall = pmCloseCall;
  window.pmCallToggleMute = pmCallToggleMute;
  window.pmCallToggleSpeaker = pmCallToggleSpeaker;
  window.pmCallToggleKeypad = pmCallToggleKeypad;
  window.pmKeypadPress = pmKeypadPress;
  window.pmDispSetDir = pmDispSetDir;
  window.pmDispSetOutcome = pmDispSetOutcome;
  window.pmStartNote = pmStartNote;
  window.pmCancelNote = pmCancelNote;
  window.pmSaveNote = pmSaveNote;
  window.pmSetCallOutcome = pmSetCallOutcome;
  window.pmToggleManualCall = pmToggleManualCall;
  window.pmSaveManualCall = pmSaveManualCall;
  window.pmSetView = pmSetView;
  window.pmToggleFav = pmToggleFav;
  window.pmcSelect = pmcSelect;
  window.pmcDeselect = pmcDeselect;
  window.pmcSetTab = pmcSetTab;
  window.pmcSetSearch = pmcSetSearch;
  window.pmcEditOpen = pmcEditOpen;
  window.pmcEditCancel = pmcEditCancel;
  window.pmcEditAddRow = pmcEditAddRow;
  window.pmcEditRemoveRow = pmcEditRemoveRow;
  window.pmcEditRefresh = pmcEditRefresh;
  window.pmcEditSave = pmcEditSave;
  window.pmSetTarget = pmSetTarget;
  window.pmToggleDest = pmToggleDest;
  window.pmJumpToMessages = pmJumpToMessages;
  window.pmOpenRecordFor = pmOpenRecordFor;
  window.pmDialNumber = pmDialNumber;
  window.pmDeliverQueued = pmDeliverQueued;

  pmInstallSync();
  setTimeout(pmUpdateSidebarBadge, 0);
})();
