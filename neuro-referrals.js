/* Neurologist Referrals.

   Every patient whose Day 1 (ACE) says the incident happened in Virginia
   (Location / Jurisdiction, p.ace.formState.selects.jurisdiction) is listed
   here. Clicking a patient opens the neurologist referral form - the same
   sections and fields the practice fills in on the partner's referral form.

   The patient's details (name, DOB, contact, state, ZIP from Registration;
   language from Day 1) are read live from the chart and cannot be edited
   here, so the referral always matches the chart; a correction is made in
   the chart. Only Partner and Condition Focus are chosen on this page.

   Saved on the patient as p.neuroReferral:
     { status: 'pending' | 'submitted' | 'scheduled',
       referredOn, apptDate, notes, form: {...},
       updatedAt, updatedBy }
   form is a copy of every field as it stood at the last save (what the
   referral said); the page itself always shows the chart's current values. */
(function () {
  'use strict';

  /* The referral's three stages, in order; Appointment Scheduled is the last,
     where the referral is complete. `date` is the field that stage records:
     Submitted defaults to the day it is marked, Scheduled needs the
     appointment date entered. */
  var NR_STEPS = [
    { key: 'pending', label: 'Pending Referral', tab: 'Pending', icon: 'clock' },
    { key: 'submitted', label: 'Referral Submitted', tab: 'Submitted', icon: 'send', date: 'referredOn', dateLabel: 'Date Submitted', today: true },
    { key: 'scheduled', label: 'Appointment Scheduled', tab: 'Scheduled', icon: 'calendar', date: 'apptDate', dateLabel: 'Appointment Date' }
  ];
  var NR_STEP_KEYS = NR_STEPS.map(function (s) { return s.key; });
  var NR_LAST = NR_STEP_KEYS[NR_STEP_KEYS.length - 1];
  // Statuses saved by earlier versions of this page (a Completed stage existed briefly).
  var NR_LEGACY = { needed: 'pending', referred: 'submitted', completed: 'scheduled' };
  var NR_TRACK = ['status', 'referredOn', 'apptDate', 'notes'];

  var nrFilter = 'pending';     // a step key, or 'all'
  var nrQuery = '';
  var nrSelectedId = null;
  var nrError = null;           // { field, text } shown under that field until it changes
  /* Typing is kept per patient until it is saved, so clicking another
     patient and coming back does not lose a half-filled form. */
  var nrDrafts = {};

  var NR_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
    'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming'];
  var NR_STATE_ABBR = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
    LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
  var NR_PARTNERS = ['Concussion Therapy Group'];
  // The partner form's Condition Focus list, in its order.
  var NR_CONDITIONS = ['Concussion/TBI', 'Headache/Migraine', 'Sleep', 'Epilepsy', 'Stroke', 'Tremor', 'Memory'];

  var NR_ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    chart: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    sync: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    sortBoth: '<polyline points="8 9 12 5 16 9"/><polyline points="16 15 12 19 8 15"/>',
    sortUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>',
    sortDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  };
  function nrIcon(name, cls) {
    return '<svg class="' + (cls || 'rf-i') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + NR_ICONS[name] + '</svg>';
  }
  function nrEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  // Ids go into data-onclick="nrSelect('...')"; anything but plain id characters is dropped.
  function nrIdArg(id) { return String(id || '').replace(/[^A-Za-z0-9_-]/g, ''); }
  function nrStep(key) { return NR_STEPS[Math.max(0, NR_STEP_KEYS.indexOf(key))]; }

  /* ------------------------------- the data ------------------------------- */
  function nrAce(p) { return (p && p.ace && p.ace.formState) || null; }
  function nrIsVirginia(p) {
    var fs = nrAce(p);
    return !!(fs && fs.selects && String(fs.selects.jurisdiction || '').trim() === 'Virginia');
  }
  function nrSaved(p) { return p.neuroReferral || {}; }
  function nrStatus(p) {
    var s = nrSaved(p).status;
    s = NR_LEGACY[s] || s;
    return NR_STEP_KEYS.indexOf(s) !== -1 ? s : 'pending';
  }
  function nrPatients() {
    var all = Array.isArray(window.ctgPatients) ? window.ctgPatients : (typeof ctgPatients !== 'undefined' ? ctgPatients : []);
    if (typeof patientsVisibleToCurrentUser === 'function') all = patientsVisibleToCurrentUser(all);
    return all.filter(nrIsVirginia);
  }
  function nrDay1Date(p) {
    var fs = nrAce(p) || {};
    var dos = (fs.inputs || {}).dos;
    if (dos) return String(dos).slice(0, 10);
    return p.ace && p.ace.savedAt ? String(p.ace.savedAt).slice(0, 10) : '';
  }
  function nrDoi(p) {
    var fs = nrAce(p) || {};
    return String((fs.inputs || {}).doi || (p.demographics || {}).doi || '').slice(0, 10);
  }
  function nrInjury(p) {
    var fs = nrAce(p) || {};
    if (typeof roInjuryTypeVal === 'function') return roInjuryTypeVal(fs);
    return (fs.selects || {}).injuryType || '';
  }
  // Day count from an ISO date (yyyy-mm-dd) to today, in local calendar days.
  function nrDaysSince(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return null;
    var then = new Date(+m[1], +m[2] - 1, +m[3]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((now - then) / 86400000));
  }
  function nrUs(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[2] + '/' + m[3] + '/' + m[1] : '';
  }
  function nrToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nrStateName(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (NR_STATE_ABBR[s.toUpperCase()]) return NR_STATE_ABBR[s.toUpperCase()];
    var hit = NR_STATES.filter(function (n) { return n.toLowerCase() === s.toLowerCase(); })[0];
    return hit || s;
  }
  // Registration takes the DOB as typed; the date box needs yyyy-mm-dd.
  function nrIsoDate(v) {
    var s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : '';
  }

  /* The patient's details as the chart holds them right now. */
  function nrChartValues(p) {
    var d = p.demographics || {}, fs = nrAce(p) || {};
    return {
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      dob: nrUs(nrIsoDate(d.dob)) || String(d.dob || ''),
      language: (fs.selects || {}).languageField || '',
      email: d.email || '',
      phone: d.mobile || d.phone || '',
      state: nrStateName(d.state),
      zip: d.zip || ''
    };
  }
  // The two fields chosen on this page, and what each starts as.
  var NR_CHOSEN = { partner: NR_PARTNERS[0], conditionFocus: NR_CONDITIONS[0] };
  // A chosen field's value before this visit's changes: last saved, else the default.
  function nrBaseValue(p, k) {
    if (NR_CHOSEN[k] !== undefined) { var sf = nrSaved(p).form || {}; return sf[k] !== undefined ? sf[k] : NR_CHOSEN[k]; }
    return k === 'status' ? nrStatus(p) : (nrSaved(p)[k] || '');
  }
  // Chart details, plus the chosen fields and the status (draft over saved).
  function nrFormValues(p) {
    var out = nrChartValues(p), draft = nrDrafts[p.id] || {};
    Object.keys(NR_CHOSEN).forEach(function (k) { out[k] = draft[k] !== undefined ? draft[k] : nrBaseValue(p, k); });
    var t = draft.__track || {};
    NR_TRACK.forEach(function (k) { out[k] = t[k] !== undefined ? t[k] : nrBaseValue(p, k); });
    return out;
  }
  // Unsaved only when something differs from what was saved (picking the same value back is no change).
  function nrIsDirty(id) {
    var d = nrDrafts[id];
    return !!d && (Object.keys(d).some(function (k) { return k !== '__track'; }) || !!(d.__track && Object.keys(d.__track).length));
  }

  /* -------------------------------- render -------------------------------- */
  function renderNeuroReferrals() {
    var mount = document.getElementById('neuroReferralsMount');
    if (!mount) return;
    var all = nrPatients();
    var rows = nrRows(all);
    if (!rows.some(function (p) { return p.id === nrSelectedId; })) nrSelectedId = rows.length ? rows[0].id : null;
    mount.innerHTML = nrHeaderHTML() + nrKpisHTML(all) + nrToolbarHTML(all)
      + (all.length ? '<div class="nr-split">' + nrListHTML(rows) + nrFormHTML(nrSelectedId ? getPatient(nrSelectedId) : null) + '</div>'
        : nrEmptyHTML('No Virginia patients yet',
          'Patients appear here once their Day 1 is saved with Location / Jurisdiction set to Virginia.'));
  }

  function nrRows(all) {
    var q = nrQuery.trim().toLowerCase();
    return all.filter(function (p) {
      if (nrFilter !== 'all' && nrStatus(p) !== nrFilter) return false;
      if (!q) return true;
      var d = p.demographics || {};
      return [d.firstName, d.lastName, d.mrn, d.lawFirm].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      var sa = NR_STEP_KEYS.indexOf(nrStatus(a)), sb = NR_STEP_KEYS.indexOf(nrStatus(b));
      if (sa !== sb) return sa - sb;
      var ra = nrSaved(a), rb = nrSaved(b);
      switch (NR_STEP_KEYS[sa]) {
        case 'pending': return nrDay1Date(a).localeCompare(nrDay1Date(b));                       // longest wait first
        case 'submitted': return String(ra.referredOn || '').localeCompare(String(rb.referredOn || '')); // longest awaiting a date first
        default: return String(ra.apptDate || '').localeCompare(String(rb.apptDate || ''));              // soonest appointment first
      }
    });
  }

  function nrHeaderHTML() {
    return '<div class="rf-head"><div class="rf-head-t"><h1>Neurologist Referrals</h1>'
      + '<p>Patients whose incident occurred in Virginia, per the Day 1 Location / Jurisdiction. Select a patient to complete and track their neurologist referral.</p></div>'
      + '<div class="rf-head-actions">'
      + '<button type="button" class="btn btn-primary" data-onclick="showPage(\'neuroReferralLog\')">' + nrIcon('sheet') + 'Referral Log</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="nrRefresh()">' + nrIcon('refresh') + 'Refresh</button>'
      + '</div></div>';
  }

  function nrCounts(all) {
    var n = { pending: 0, submitted: 0, scheduled: 0 };
    all.forEach(function (p) { n[nrStatus(p)]++; });
    return n;
  }

  function nrKpisHTML(all) {
    var n = nrCounts(all);
    var today = nrToday();
    var upcoming = all.filter(function (p) { return nrStatus(p) === 'scheduled' && String(nrSaved(p).apptDate || '') >= today; }).length;
    var oldest = all.filter(function (p) { return nrStatus(p) === 'pending'; })
      .reduce(function (m, p) { var d = nrDaysSince(nrDay1Date(p)); return d !== null && d > m ? d : m; }, -1);
    function tile(cls, icon, label, value, sub) {
      return '<div class="nr-kpi ' + cls + '"><span class="nr-kpi-i">' + nrIcon(icon) + '</span>'
        + '<div class="nr-kpi-t"><div class="nr-kpi-v">' + value + '</div><div class="nr-kpi-l">' + label + '</div>'
        + '<div class="nr-kpi-s">' + sub + '</div></div></div>';
    }
    return '<div class="nr-kpis">'
      + tile('k-total', 'pin', 'Virginia Patients', all.length, 'Incident location: Virginia')
      + tile('k-pending', 'clock', 'Pending Referral', n.pending, oldest < 0 ? 'No patients awaiting referral' : 'Longest wait: ' + oldest + (oldest === 1 ? ' day' : ' days'))
      + tile('k-progress', 'send', 'Referral Submitted', n.submitted, 'Awaiting appointment')
      + tile('k-done', 'calendar', 'Appointment Scheduled', n.scheduled, upcoming + ' upcoming')
      + '</div>';
  }

  function nrToolbarHTML(all) {
    var n = nrCounts(all);
    function tab(key, label, count) {
      return '<button type="button" class="rf-tab' + (nrFilter === key ? ' active' : '') + '" data-onclick="nrSetFilter(\'' + key + '\')">'
        + label + ' <span class="rf-badge">' + count + '</span></button>';
    }
    return '<div class="rf-toolbar"><div class="rf-tabs">'
      + NR_STEPS.map(function (s) { return tab(s.key, s.tab, n[s.key]); }).join('')
      + tab('all', 'All', all.length)
      + '</div><div class="rf-search">' + nrIcon('search')
      + '<input id="nrSearch" type="search" autocomplete="off" placeholder="Search patient, account # or firm" value="' + nrEsc(nrQuery) + '" data-oninput="nrSearch(this.value)">'
      + (nrQuery ? '<button type="button" class="rf-search-x" data-onclick="nrSearchClear()" aria-label="Clear search">&times;</button>' : '')
      + '</div></div>';
  }

  function nrPill(key) {
    var s = nrStep(key);
    return '<span class="nr-pill nr-st-' + s.key + '">' + nrIcon(s.icon) + s.label + '</span>';
  }

  // One line under the patient's name saying where the referral stands.
  function nrWhen(p) {
    var r = nrSaved(p);
    switch (nrStatus(p)) {
      case 'submitted': return r.referredOn ? 'Submitted ' + nrUs(r.referredOn) : 'Submitted';
      case 'scheduled': return r.apptDate ? 'Appointment ' + nrUs(r.apptDate) : 'Appointment scheduled';
    }
    var wait = nrDaysSince(nrDay1Date(p));
    return wait === null ? 'Day 1 date not recorded' : wait === 0 ? 'Day 1 completed today' : wait + (wait === 1 ? ' day' : ' days') + ' since Day 1';
  }

  function nrListHTML(rows) {
    if (!rows.length) {
      var empty = nrQuery ? 'No patients match “' + nrEsc(nrQuery) + '”.'
        : nrFilter === 'pending' ? 'No referrals pending. Every Virginia patient has been referred.'
        : 'No patients at this stage.';
      return '<div class="nr-list card"><div class="nr-list-empty">' + empty + '</div></div>';
    }
    return '<div class="nr-list card" role="listbox" aria-label="Virginia patients">' + rows.map(function (p) {
      var d = p.demographics || {}, id = nrIdArg(p.id), st = nrStatus(p);
      var initials = typeof initialsForPatient === 'function' ? initialsForPatient(p) : ((d.firstName || ' ')[0] + (d.lastName || ' ')[0]);
      return '<div class="nr-item nr-is-' + st + (p.id === nrSelectedId ? ' active' : '') + (nrIsDirty(p.id) ? ' dirty' : '') + '" role="option" tabindex="0"'
        + ' aria-selected="' + (p.id === nrSelectedId ? 'true' : 'false') + '"'
        + ' data-onclick="nrSelect(\'' + id + '\')" data-onkeydown="nrItemKey(event,\'' + id + '\')">'
        + '<span class="nr-av">' + nrEsc(initials) + '</span>'
        + '<span class="nr-item-main"><b>' + nrEsc(typeof fullPatientName === 'function' ? fullPatientName(p) : (d.lastName + ', ' + d.firstName)) + '</b>'
        + '<span class="nr-item-sub">DOI ' + nrEsc(nrUs(nrDoi(p)) || '—') + (d.lawFirm ? ' · ' + nrEsc(d.lawFirm) : '') + '</span>'
        + '<span class="nr-item-when">' + nrIcon(nrStep(st).icon) + nrEsc(nrWhen(p)) + '</span></span>'
        // The tab already names the stage; only the mixed list needs it per row.
        + (nrFilter === 'all' ? nrPill(st) : '') + '</div>';
    }).join('') + '</div>';
  }

  function nrSelectHTML(field, value, options, required) {
    var opts = options.slice();
    if (value && opts.indexOf(value) === -1) opts.push(value);
    return '<select id="nrf_' + field + '" data-onchange="nrField(\'' + field + '\',this.value)"' + (required ? ' required' : '') + '>'
      + (required ? '' : '<option value="">— Select —</option>')
      + opts.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + nrEsc(o) + '</option>'; }).join('')
      + '</select>';
  }
  /* A detail read from the chart: read-only, in the portal's "worked out for
     you" style (.rf-auto, as Age on the referral form). An empty one says
     where it is missing, so it reads as "not on file", not "forgot to fill". */
  function nrAutoHTML(field, value, missing) {
    return '<input id="nrf_' + field + '" class="rf-auto" type="text" readonly aria-readonly="true" value="' + nrEsc(value) + '"'
      + ' placeholder="' + nrEsc(missing) + '">';
  }
  function nrSrcHTML(text) {
    return '<span class="nr-src">' + nrIcon('sync') + text + '</span>';
  }
  // A real <label for>, so clicking the label focuses the field and screen readers name it.
  function nrF(label, field, control, hint) {
    var err = nrError && nrError.field === field;
    return '<div class="rf-f' + (err ? ' nr-has-err' : '') + '"><label for="nrf_' + field + '">' + label + '</label>' + control
      + (err ? '<div class="nr-err" id="nrf_' + field + '_err" role="alert">' + nrIcon('alert') + nrEsc(nrError.text) + '</div>'
        : hint ? '<div class="nr-hint">' + nrIcon('info') + hint + '</div>' : '') + '</div>';
  }

  /* The stages as a progress tracker. Every stage is a button, so a
     referral entered late can be set straight to where it really is. */
  function nrStepperHTML(f) {
    var cur = NR_STEP_KEYS.indexOf(f.status);
    return '<ol class="nr-steps' + (f.status === NR_LAST ? ' is-complete' : '') + '" aria-label="Referral status">' + NR_STEPS.map(function (s, i) {
      var state = i < cur ? 'is-done' : i === cur ? 'is-current' : 'is-next';
      var when = s.date && f[s.date] ? nrUs(f[s.date]) : (i === 0 && cur === 0 ? 'Awaiting referral' : '');
      return '<li class="nr-step ' + state + ' nr-st-' + s.key + '">'
        + '<button type="button" data-onclick="nrSetStep(\'' + s.key + '\')"' + (i === cur ? ' aria-current="step"' : '') + '>'
        + '<span class="nr-step-dot">' + (i < cur || (i === cur && s.key === NR_LAST) ? nrIcon('check') : nrIcon(s.icon)) + '</span>'
        + '<span class="nr-step-t">' + s.label + '</span>'
        + '<span class="nr-step-d">' + nrEsc(when) + '</span>'
        + '</button></li>';
    }).join('') + '</ol>';
  }

  function nrDateInput(field, value) {
    return '<input id="nrf_' + field + '" type="date" value="' + nrEsc(value) + '"'
      + (nrError && nrError.field === field ? ' aria-invalid="true" aria-describedby="nrf_' + field + '_err"' : '')
      + ' data-oninput="nrTrack(\'' + field + '\',this.value)">';
  }

  function nrFormHTML(p) {
    if (!p) return '<div class="nr-form card"><div class="nr-list-empty">Select a patient to view their referral.</div></div>';
    var f = nrFormValues(p), saved = nrSaved(p), id = nrIdArg(p.id);
    var cur = NR_STEP_KEYS.indexOf(f.status);
    var dirty = nrIsDirty(p.id);
    var head = '<div class="nr-form-hd">'
      + '<div><h2>' + nrEsc(typeof naturalPatientName === 'function' ? naturalPatientName(p) : f.firstName + ' ' + f.lastName) + '</h2>'
      + '<div class="nr-facts">'
        + '<span class="nr-fact nr-fact-va">' + nrIcon('pin') + 'Incident in Virginia</span>'
        + '<span class="nr-fact">DOI: ' + nrEsc(nrUs(nrDoi(p)) || '—') + '</span>'
        + '<span class="nr-fact">Day 1: ' + nrEsc(nrUs(nrDay1Date(p)) || '—') + '</span>'
        + (nrInjury(p) ? '<span class="nr-fact">' + nrEsc(nrInjury(p)) + '</span>' : '')
        + ((p.demographics || {}).mrn ? '<span class="nr-fact">Acct #: ' + nrEsc(p.demographics.mrn) + '</span>' : '')
      + '</div></div>'
      + '<div class="nr-form-hd-r">' + nrPill(f.status)
      + '<button type="button" class="nr-link" data-onclick="nrOpenChart(\'' + id + '\')">' + nrIcon('chart') + 'Open Chart</button></div>'
      + '</div>';

    var closed = f.status === NR_LAST && f.apptDate
      ? '<div class="nr-closed">' + nrIcon('checkCircle') + '<div><b>Referral complete · Appointment scheduled for ' + nrEsc(nrUs(f.apptDate)) + '</b>'
        + '<span>No further action is needed. Select an earlier stage above to reopen it.</span></div></div>'
      : '';

    // Only the dates of stages reached so far, so the form asks for nothing ahead of time.
    var dates = NR_STEPS.filter(function (s, i) { return s.date && i <= cur; }).map(function (s) {
      return nrF(s.dateLabel, s.date, nrDateInput(s.date, f[s.date]));
    });
    while (dates.length % 2) dates.push('<div></div>');

    var body = '<div class="nr-form-body">'
      + '<h3 class="nr-sec nr-sec-first">Referral Status</h3>'
      + nrStepperHTML(f) + closed
      + (dates.length ? '<div class="rf-pair nr-dates">' + dates.join('') + '</div>' : '')
      + nrF('Notes <i>(optional)</i>', 'notes', '<textarea id="nrf_notes" rows="2" placeholder="e.g. Submitted through the partner portal; awaiting scheduling" data-oninput="nrTrack(\'notes\',this.value)">' + nrEsc(f.notes) + '</textarea>')
      + '<div class="nr-autofill">' + nrIcon('sync') + '<span>Patient details are pulled automatically from <b>Registration</b> and <b>Day 1</b>, so they always match the chart. To correct one, update it in the patient’s chart (<b>Open Chart</b>).</span></div>'
      + '<h3 class="nr-sec">Partner’s Info</h3>'
      + '<div class="rf-pair">' + nrF('Partner<span class="req-star" aria-hidden="true">*</span>', 'partner', nrSelectHTML('partner', f.partner, NR_PARTNERS, true)) + '<div></div></div>'
      + '<h3 class="nr-sec"><span>Patient’s Basic Info</span>' + nrSrcHTML('Auto-filled from Registration &amp; Day 1') + '</h3>'
      + '<div class="rf-pair">'
        + nrF('First Name', 'firstName', nrAutoHTML('firstName', f.firstName, 'Not on file in Registration'))
        + nrF('Last Name', 'lastName', nrAutoHTML('lastName', f.lastName, 'Not on file in Registration'))
        + nrF('Date of Birth <i>(MM/DD/YYYY)</i>', 'dob', nrAutoHTML('dob', f.dob, 'Not on file in Registration'))
        + nrF('Language Preference', 'language', nrAutoHTML('language', f.language, 'Not recorded on Day 1'))
      + '</div>'
      + '<h3 class="nr-sec"><span>Contact Info</span>' + nrSrcHTML('Auto-filled from Registration') + '</h3>'
      + '<div class="rf-pair">'
        + nrF('Email', 'email', nrAutoHTML('email', f.email, 'Not on file in Registration'))
        + nrF('Phone Number', 'phone', nrAutoHTML('phone', f.phone, 'Not on file in Registration'))
        + nrF('State', 'state', nrAutoHTML('state', f.state, 'Not on file in Registration'))
        + nrF('ZIP Code', 'zip', nrAutoHTML('zip', f.zip, 'Not on file in Registration'))
      + '</div>'
      + '<h3 class="nr-sec">Care</h3>'
      + '<div class="rf-pair">' + nrF('Condition Focus', 'conditionFocus', nrSelectHTML('conditionFocus', f.conditionFocus, NR_CONDITIONS)) + '<div></div></div>'
      + '</div>';

    var meta = saved.updatedAt
      ? 'Last updated ' + nrEsc(nrUs(String(saved.updatedAt).slice(0, 10))) + (saved.updatedBy ? ' by ' + nrEsc(saved.updatedBy) : '')
      : 'Not yet saved';
    /* The main button moves the referral one stage on from where it was SAVED,
       so it still reads "Schedule Appointment" while the date is being entered.
       A stage picked on the tracker instead is saved as it is. */
    var NEXT = { pending: ['submitted', 'send', 'Submit Referral'], submitted: ['scheduled', 'calendar', 'Schedule Appointment'] };
    var savedSt = nrStatus(p), next = NEXT[savedSt];
    if (f.status !== savedSt && !(next && next[0] === f.status)) next = null;
    var foot = '<div class="nr-form-ft"><span class="nr-meta"><b class="nr-unsaved"' + (dirty ? '' : ' hidden') + '>Unsaved changes · </b>' + meta + '</span>'
      + '<div class="nr-form-btns">'
      + (next
        ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nrSave(\'\')">Save Changes</button>'
          + '<button type="button" class="rf-btn rf-btn-go" data-onclick="nrSave(\'' + next[0] + '\')">' + nrIcon(next[1]) + next[2] + '</button>'
        : '<button type="button" class="rf-btn rf-btn-go" data-onclick="nrSave(\'\')">' + nrIcon('check') + 'Save Changes</button>')
      + '</div></div>';

    return '<div class="nr-form card">' + head + body + foot + '</div>';
  }

  function nrEmptyHTML(title, body) {
    return '<div class="card"><div class="card-body rf-empty">' + nrIcon('pin', 'rf-empty-i')
      + '<b>' + nrEsc(title) + '</b><p>' + nrEsc(body) + '</p></div></div>';
  }

  /* -------------------------------- actions -------------------------------- */
  function nrFind(id) {
    var list = nrPatients();
    for (var i = 0; i < list.length; i++) if (nrIdArg(list[i].id) === id) return list[i];
    return null;
  }
  function nrSelect(id) {
    var p = nrFind(id);
    if (!p) return;
    nrSelectedId = p.id;
    nrError = null;
    renderNeuroReferrals();
  }
  function nrItemKey(ev, id) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nrSelect(id); }
  }
  function nrDraft() {
    if (!nrSelectedId) return null;
    return nrDrafts[nrSelectedId] || (nrDrafts[nrSelectedId] = {});
  }
  /* Typing does not repaint (that would steal the cursor); it only flags the
     row and footer, and unflags them when the value is put back as saved. */
  function nrMarkDirty() {
    var dirty = nrIsDirty(nrSelectedId);
    if (!dirty) delete nrDrafts[nrSelectedId];
    var item = document.querySelector('#neuroReferralsMount .nr-item.active');
    if (item) item.classList.toggle('dirty', dirty);
    var flag = document.querySelector('#neuroReferralsMount .nr-unsaved');
    if (flag) flag.hidden = !dirty;
  }
  function nrField(field, value) {
    var d = nrDraft(); if (!d || NR_CHOSEN[field] === undefined) return;
    if (value === nrBaseValue(getPatient(nrSelectedId), field)) delete d[field];
    else d[field] = value;
    nrMarkDirty();
  }
  function nrTrack(field, value) {
    var d = nrDraft(); if (!d) return;
    d.__track = d.__track || {};
    if (value === nrBaseValue(getPatient(nrSelectedId), field)) delete d.__track[field];
    else d.__track[field] = value;
    if (nrError && nrError.field === field && value) {
      nrError = null;
      var box = document.getElementById('nrf_' + field);
      var wrap = box && box.closest('.rf-f');
      if (wrap) { wrap.classList.remove('nr-has-err'); var e = wrap.querySelector('.nr-err'); if (e) e.remove(); box.removeAttribute('aria-invalid'); }
    }
    nrMarkDirty();
  }
  /* Moving to a stage fills in its date when that date is simply "today"
     (submitted, completed); an appointment date has to be entered. */
  function nrApplyStep(key) {
    var d = nrDraft(); if (!d) return null;
    var p = getPatient(nrSelectedId);
    d.__track = d.__track || {};
    if (key === nrBaseValue(p, 'status')) delete d.__track.status;
    else d.__track.status = key;
    var s = nrStep(key);
    if (s.today && !nrFormValues(p)[s.date]) d.__track[s.date] = nrToday();
    if (!nrIsDirty(p.id)) delete nrDrafts[p.id];
    return nrFormValues(p);
  }
  function nrSetStep(key) {
    if (NR_STEP_KEYS.indexOf(key) === -1) return;
    nrError = null;
    nrApplyStep(key);
    renderNeuroReferrals();
  }
  function nrShowError(field, text) {
    nrError = { field: field, text: text };
    renderNeuroReferrals();
    var box = document.getElementById('nrf_' + field);
    if (box) { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.focus({ preventScroll: true }); }
  }
  /* advance: '' saves as it is; a stage key moves the referral there first. */
  function nrSave(advance) {
    var p = nrSelectedId ? getPatient(nrSelectedId) : null;
    if (!p) return;
    var f = advance ? nrApplyStep(advance) : nrFormValues(p);
    if (!f.partner) { nrShowError('partner', 'Select the partner.'); return; }
    if (f.status === 'scheduled' && !f.apptDate) { nrShowError('apptDate', 'Enter the appointment date, then save.'); return; }
    // A copy of what the referral said at this save: the chart's details as they are now, plus the choices.
    var form = {};
    Object.keys(nrChartValues(p)).concat(Object.keys(NR_CHOSEN)).forEach(function (k) { form[k] = String(f[k] == null ? '' : f[k]).trim(); });
    var me = typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null;
    var cur = NR_STEP_KEYS.indexOf(f.status);
    // A date belongs to a stage the referral has reached; stepping back clears the later ones.
    var dateFor = function (key) { var s = nrStep(key); return NR_STEP_KEYS.indexOf(key) <= cur ? (f[s.date] || '') : ''; };
    p.neuroReferral = {
      status: f.status,
      referredOn: dateFor('submitted'), apptDate: dateFor('scheduled'),
      notes: String(f.notes || '').trim(), form: form,
      updatedAt: new Date().toISOString(), updatedBy: me ? (me.displayName || me.username || '') : ''
    };
    delete nrDrafts[p.id];
    nrError = null;
    persistPatients();
    var MSG = { submitted: 'Referral submitted.', scheduled: 'Appointment scheduled. Referral complete.' };
    showToast(MSG[advance] || 'Changes saved.', 'ok');
    renderNeuroReferrals();
  }
  function nrOpenChart(id) {
    var p = nrFind(id);
    if (!p) return;
    showPage('patientLists');
    selectPatient(p.id);
  }
  function nrSetFilter(key) { nrFilter = key; renderNeuroReferrals(); }
  function nrSearch(v) {
    nrQuery = String(v || '');
    renderNeuroReferrals();
    var box = document.getElementById('nrSearch');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
  function nrSearchClear() { nrQuery = ''; renderNeuroReferrals(); }
  function nrRefresh() {
    if (typeof loadPatientStore === 'function') {
      Promise.resolve(loadPatientStore()).then(renderNeuroReferrals, renderNeuroReferrals);
    } else renderNeuroReferrals();
  }

  /* ============================ Referral Log ==============================
     Every referral that has been submitted or scheduled, laid out like a
     spreadsheet (column letters, row numbers, a frozen header and first
     column, a cell bar, sheet tabs), and downloadable as Excel or CSV.
     It has no sidebar link of its own: it opens from the Referral Log
     button on Neurologist Referrals and shares that page's permission
     (SUBPAGE_PARENT in ctg-auth.js / rbac.js). Read-only: a referral is
     changed on its own form (the Open link). */
  var nrlTab = 'all';           // 'all' | 'submitted' | 'scheduled'
  var nrlQuery = '';
  var nrlSort = { key: 'patient', dir: 1 };
  var NRL_TABS = [['all', 'All Referrals'], ['submitted', 'Referral Submitted'], ['scheduled', 'Appointment Scheduled']];
  // date: the value is yyyy-mm-dd (sorted as such, shown and exported as MM/DD/YYYY).
  // link: an action in the sheet only, left out of the downloads.
  // w: on-screen width; each is wide enough for its header label plus the sort arrow.
  var NRL_COLS = [
    { key: 'patient', label: 'Patient', w: 190 },
    { key: 'referral', label: 'Referral', w: 90, link: true, text: 'Open' },
    { key: 'chart', label: 'Chart', w: 110, link: true, text: 'Open Chart' },
    { key: 'status', label: 'Status', w: 210 },
    { key: 'referredOn', label: 'Date Submitted', w: 170, date: true },
    { key: 'apptDate', label: 'Appointment Date', w: 170, date: true },
    { key: 'partner', label: 'Partner', w: 210 },
    { key: 'conditionFocus', label: 'Condition Focus', w: 170 },
    { key: 'dob', label: 'Date of Birth', w: 150, date: true },
    { key: 'phone', label: 'Phone Number', w: 160 },
    { key: 'email', label: 'Email', w: 210 },
    { key: 'state', label: 'State', w: 120 },
    { key: 'zip', label: 'ZIP Code', w: 120 },
    { key: 'language', label: 'Language', w: 130 },
    { key: 'doi', label: 'DOI', w: 110, date: true },
    { key: 'day1', label: 'Day 1 Date', w: 130, date: true },
    { key: 'injury', label: 'Injury Type', w: 210 },
    { key: 'lawFirm', label: 'Law Firm', w: 170 },
    { key: 'mrn', label: 'Acct #', w: 90 },
    { key: 'notes', label: 'Notes', w: 260 },
    { key: 'updated', label: 'Last Updated', w: 210 }
  ];

  function nrlColLetter(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  // One row per submitted or scheduled referral: chart details live, referral fields as saved.
  function nrlAllRows() {
    return nrPatients().filter(function (p) { return nrStatus(p) !== 'pending'; }).map(function (p) {
      var d = p.demographics || {}, r = nrSaved(p), c = nrChartValues(p), f = r.form || {};
      return {
        id: p.id, st: nrStatus(p),
        patient: typeof fullPatientName === 'function' ? fullPatientName(p) : (d.lastName + ', ' + d.firstName),
        status: nrStep(nrStatus(p)).label,
        referredOn: r.referredOn || '', apptDate: r.apptDate || '',
        partner: f.partner || NR_CHOSEN.partner, conditionFocus: f.conditionFocus || NR_CHOSEN.conditionFocus,
        dob: nrIsoDate(d.dob), phone: c.phone, email: c.email, state: c.state, zip: c.zip, language: c.language,
        doi: nrDoi(p), day1: nrDay1Date(p), injury: nrInjury(p), lawFirm: d.lawFirm || '', mrn: d.mrn || '',
        notes: r.notes || '',
        updated: r.updatedAt ? nrUs(String(r.updatedAt).slice(0, 10)) + (r.updatedBy ? ' · ' + r.updatedBy : '') : '',
        updatedSort: r.updatedAt || ''
      };
    });
  }
  function nrlRows() {
    var q = nrlQuery.trim().toLowerCase(), k = nrlSort.key, dir = nrlSort.dir;
    var sortKey = k === 'updated' ? 'updatedSort' : k;
    return nrlAllRows().filter(function (r) {
      if (nrlTab !== 'all' && r.st !== nrlTab) return false;
      if (!q) return true;
      return [r.patient, r.partner, r.conditionFocus, r.phone, r.email, r.lawFirm, r.mrn, r.notes, r.injury].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      var x = String(a[sortKey] || ''), y = String(b[sortKey] || '');
      if (!x !== !y) return x ? -1 : 1;            // blanks last, either direction
      var c = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
      return (c || a.patient.localeCompare(b.patient)) * dir;
    });
  }
  function nrlCellText(r, col) {
    var v = r[col.key];
    return col.date ? nrUs(v) : String(v == null ? '' : v);
  }

  function renderNeuroReferralLog() {
    var mount = document.getElementById('neuroReferralLogMount');
    if (!mount) return;
    var all = nrlAllRows(), rows = nrlRows();
    var n = { all: all.length, submitted: 0, scheduled: 0 };
    all.forEach(function (r) { n[r.st]++; });

    var h = '<div class="rf-head"><div class="rf-head-t"><h1>Neurologist Referral Log</h1>'
      + '<p>Every Virginia patient whose neurologist referral has been submitted or scheduled, in one sheet. Download it as Excel or CSV.</p></div>'
      + '<div class="rf-head-actions">'
      + '<button type="button" class="btn btn-ghost" data-onclick="showPage(\'neuroReferrals\')">' + nrIcon('back') + 'Neurologist Referrals</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="nrlDownload(\'csv\')">' + nrIcon('download') + 'Download CSV</button>'
      + '<button type="button" class="btn btn-primary" data-onclick="nrlDownload(\'xlsx\')">' + nrIcon('download') + 'Download Excel</button>'
      + '</div></div>';

    h += nrlKpisHTML(all, n);

    h += '<div class="nrs card">'
      + '<div class="nrs-bar">'
        + '<div class="rf-search">' + nrIcon('search')
        + '<input id="nrlSearch" type="search" autocomplete="off" placeholder="Search patient, partner, firm, phone…" value="' + nrEsc(nrlQuery) + '" data-oninput="nrlSearch(this.value)">'
        + (nrlQuery ? '<button type="button" class="rf-search-x" data-onclick="nrlSearch(\'\')" aria-label="Clear search">&times;</button>' : '')
        + '</div>'
        + '<div class="nrs-meta">'
          + '<span class="nrs-key"><i class="nrs-key-sw" aria-hidden="true"></i>Yellow rows: awaiting an appointment</span>'
          + '<span class="nrs-count">' + rows.length + (rows.length === 1 ? ' row' : ' rows') + ' · sorted by ' + nrEsc(nrlSortLabel()) + '</span>'
        + '</div>'
      + '</div>'
      // The cell bar: the selected cell's reference and its full text, as in a spreadsheet.
      + '<div class="nrs-fx"><span class="nrs-fx-ref" id="nrlFxRef">A1</span><span class="nrs-fx-ico">fx</span><span class="nrs-fx-val" id="nrlFxVal">Patient</span></div>';

    h += '<div class="nrs-scroll" role="region" aria-label="Neurologist referral log" tabindex="0">'
      + '<table class="nrs-grid" data-onclick="nrlCellClick(event)"><thead>'
      + '<tr class="nrs-letters"><th class="nrs-corner" aria-hidden="true"></th>'
      + NRL_COLS.map(function (c, i) { return '<th class="nrs-w' + c.w + (i === 0 ? ' nrs-fix' : '') + '" aria-hidden="true">' + nrlColLetter(i) + '</th>'; }).join('')
      + '</tr><tr class="nrs-head"><th class="nrs-num" aria-hidden="true">1</th>'
      + NRL_COLS.map(function (c, i) {
          var on = nrlSort.key === c.key;
          var sortable = !c.link;
          return '<th class="nrs-w' + c.w + (i === 0 ? ' nrs-fix' : '') + '" data-ref="' + nrlColLetter(i) + '1"'
            + (sortable ? ' aria-sort="' + (on ? (nrlSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"' : '') + '>'
            + (sortable
              ? '<button type="button" class="nrs-sort' + (on ? ' on' : '') + '" data-onclick="nrlSortBy(\'' + c.key + '\')"><span class="nrs-hl">' + nrEsc(c.label) + '</span>'
                + nrIcon(on ? (nrlSort.dir > 0 ? 'sortUp' : 'sortDown') : 'sortBoth', 'nrs-sort-i') + '</button>'
              : '<span class="nrs-hlabel">' + nrEsc(c.label) + '</span>')
            + '</th>';
        }).join('')
      + '</tr></thead><tbody>';
    if (!rows.length) {
      h += '<tr><td class="nrs-num">2</td><td class="nrs-empty" colspan="' + NRL_COLS.length + '">'
        + (nrlQuery ? 'No referrals match “' + nrEsc(nrlQuery) + '”.' : all.length ? 'No referrals at this stage.' : 'No referrals yet. A patient is added here once their neurologist referral is submitted.')
        + '</td></tr>';
    }
    rows.forEach(function (r, ri) {
      var rn = ri + 2, id = nrIdArg(r.id);
      h += '<tr class="nrs-row nr-is-' + r.st + '"><td class="nrs-num">' + rn + '</td>'
        + NRL_COLS.map(function (c, ci) {
            var ref = nrlColLetter(ci) + rn, cls = 'nrs-w' + c.w + (ci === 0 ? ' nrs-fix' : '');
            if (c.link) {
              // Function names written out: the click allowlist is read from the source (tools/actions-codemod.js).
              var act = c.key === 'referral' ? 'data-onclick="nrlOpenReferral(\'' + id + '\')"' : 'data-onclick="nrOpenChart(\'' + id + '\')"';
              return '<td class="' + cls + '" data-ref="' + ref + '"><button type="button" class="nrs-link" ' + act + '>'
                + nrEsc(c.text) + '</button></td>';
            }
            if (c.key === 'status') {
              return '<td class="' + cls + '" data-ref="' + ref + '" data-val="' + nrEsc(r.status) + '"><span class="nrs-chip nr-st-' + r.st + '">'
                + nrIcon(nrStep(r.st).icon) + nrEsc(r.status) + '</span></td>';
            }
            var t = nrlCellText(r, c);
            return '<td class="' + cls + '" data-ref="' + ref + '" title="' + nrEsc(t) + '">' + nrEsc(t) + '</td>';
          }).join('')
        + '</tr>';
    });
    /* Empty numbered rows below the data, at least enough to fill the sheet
       (it stretches to the bottom of the window, styles.css), so a short list
       still reads as a sheet rather than a box with a gap under it. */
    var fillTo = Math.max(10, Math.ceil(((window.innerHeight || 900) - 330) / 30));
    for (var fr = Math.max(rows.length, 1) + 2; fr <= fillTo + 1; fr++) {
      h += '<tr class="nrs-fill" aria-hidden="true"><td class="nrs-num">' + fr + '</td>'
        + NRL_COLS.map(function (c, ci) { return '<td class="nrs-w' + c.w + (ci === 0 ? ' nrs-fix' : '') + '"></td>'; }).join('') + '</tr>';
    }
    h += '</tbody></table></div>';

    // Sheet tabs along the bottom, as in a spreadsheet.
    h += '<div class="nrs-tabs" role="tablist" aria-label="Referral stage">'
      + NRL_TABS.map(function (t) {
          return '<button type="button" role="tab" aria-selected="' + (nrlTab === t[0]) + '" class="nrs-tab' + (nrlTab === t[0] ? ' active' : '') + '" data-onclick="nrlSetTab(\'' + t[0] + '\')">'
            + nrEsc(t[1]) + '<span class="nrs-tab-n">' + n[t[0]] + '</span></button>';
        }).join('')
      + '</div></div>';
    mount.innerHTML = h;
  }

  // "Patient (A→Z)", or for a date column "Appointment Date (oldest first)".
  function nrlSortLabel() {
    var col = NRL_COLS.filter(function (c) { return c.key === nrlSort.key; })[0] || NRL_COLS[0];
    var dir = col.date ? (nrlSort.dir > 0 ? 'oldest first' : 'newest first') : (nrlSort.dir > 0 ? 'A→Z' : 'Z→A');
    return col.label + ' (' + dir + ')';
  }
  // What the log holds at a glance, as the tiles on Neurologist Referrals.
  function nrlKpisHTML(all, n) {
    var today = nrToday();
    var waits = all.filter(function (r) { return r.st === 'submitted'; }).map(function (r) { return nrDaysSince(r.referredOn); })
      .filter(function (d) { return d !== null; });
    var longest = waits.length ? Math.max.apply(null, waits) : null;
    var upcoming = all.filter(function (r) { return r.st === 'scheduled' && r.apptDate >= today; })
      .sort(function (a, b) { return a.apptDate.localeCompare(b.apptDate); });
    var next = upcoming[0];
    function tile(cls, icon, label, value, sub) {
      return '<div class="nr-kpi ' + cls + '"><span class="nr-kpi-i">' + nrIcon(icon) + '</span>'
        + '<div class="nr-kpi-t"><div class="nr-kpi-v">' + value + '</div><div class="nr-kpi-l">' + label + '</div>'
        + '<div class="nr-kpi-s">' + sub + '</div></div></div>';
    }
    return '<div class="nr-kpis">'
      + tile('k-total', 'sheet', 'Referrals in Log', n.all, 'Submitted or scheduled')
      + tile('k-pending', 'clock', 'Awaiting Appointment', n.submitted,
          longest === null ? 'None waiting' : 'Longest wait: ' + longest + (longest === 1 ? ' day' : ' days') + ' since submitted')
      + tile('k-done', 'calendar', 'Appointment Scheduled', n.scheduled, upcoming.length + ' upcoming')
      + tile('k-progress', 'send', 'Next Appointment', next ? nrEsc(nrUs(next.apptDate)) : '—', next ? nrEsc(next.patient) : 'Nothing upcoming')
      + '</div>';
  }

  function nrlCellClick(ev) {
    var cell = ev && ev.target && ev.target.closest ? ev.target.closest('td[data-ref],th[data-ref]') : null;
    if (!cell) return;
    var grid = cell.closest('.nrs-grid');
    var prev = grid && grid.querySelector('.is-sel');
    if (prev) prev.classList.remove('is-sel');
    cell.classList.add('is-sel');
    var ref = document.getElementById('nrlFxRef'), val = document.getElementById('nrlFxVal');
    if (ref) ref.textContent = cell.getAttribute('data-ref');
    if (val) val.textContent = cell.getAttribute('data-val') || cell.textContent;
  }
  function nrlSortBy(key) {
    nrlSort = nrlSort.key === key ? { key: key, dir: -nrlSort.dir } : { key: key, dir: 1 };
    renderNeuroReferralLog();
  }
  function nrlSetTab(t) { nrlTab = t; renderNeuroReferralLog(); }
  function nrlSearch(v) {
    nrlQuery = String(v || '');
    renderNeuroReferralLog();
    var box = document.getElementById('nrlSearch');
    if (box && nrlQuery) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
  // Open the referral's own form, on the tab that holds it.
  function nrlOpenReferral(id) {
    var p = nrFind(id);
    if (!p) return;
    nrFilter = nrStatus(p);
    nrSelectedId = p.id;
    nrQuery = '';
    showPage('neuroReferrals');
  }

  /* -------------------------------- downloads ------------------------------- */
  function nrlExportCols() { return NRL_COLS.filter(function (c) { return !c.link; }); }
  function nrlFileName(ext) {
    var tab = NRL_TABS.filter(function (t) { return t[0] === nrlTab; })[0][1];
    return 'Neurologist Referral Log - ' + tab + ' - ' + nrUs(nrToday()).replace(/\//g, '-') + '.' + ext;
  }
  function nrlSave(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  /* Spreadsheet formula injection: a cell starting with = + - @ (or a tab or
     carriage return) runs as a formula in Excel even inside quotes, so it gets
     a leading apostrophe - the same rule as the Registration List export. */
  function nrlCsv(rows, cols) {
    var safe = function (v) { var s = String(v == null ? '' : v); return (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s; };
    var esc = function (v) { return '"' + safe(v).replace(/"/g, '""') + '"'; };
    var lines = [cols.map(function (c) { return esc(c.label); }).join(',')];
    rows.forEach(function (r) { lines.push(cols.map(function (c) { return esc(nrlCellText(r, c)); }).join(',')); });
    // The byte-order mark makes Excel read the file as UTF-8 (names with accents).
    return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }
  function nrlXml(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Days since 1899-12-30: how Excel stores a date, so its filters sort and group them as dates.
  function nrlSerial(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null;
  }
  /* The workbook's cell styles, made on demand: get({bold, size, color,
     fill, border, date, wrap}) returns the style's index, reusing an
     identical one. Index 0 is the plain default Excel expects first. */
  function nrlStyles() {
    var fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], xfs = [];
    var idx = function (list, xml) { var i = list.indexOf(xml); if (i === -1) { list.push(xml); i = list.length - 1; } return i; };
    var get = function (o) {
      o = o || {};
      var font = '<font>' + (o.bold ? '<b/>' : '') + '<sz val="' + (o.size || 11) + '"/><color rgb="FF' + (o.color || '1F2937') + '"/>'
        + '<name val="Calibri"/><family val="2"/></font>';
      var fill = o.fill ? '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>' : fills[0];
      var align = '<alignment vertical="center"' + (o.border ? ' horizontal="left" indent="1"' : '') + (o.wrap ? ' wrapText="1"' : '') + '/>';
      return idx(xfs, '<xf numFmtId="' + (o.date ? 164 : 0) + '" fontId="' + idx(fonts, font) + '" fillId="' + idx(fills, fill)
        + '" borderId="' + (o.border ? 1 : 0) + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'
        + align + '</xf>');
    };
    get({});
    return {
      get: get,
      xml: function () {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          + '<numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts>'
          + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
          + '<fills count="' + fills.length + '">' + fills.join('') + '</fills>'
          + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
          + '<border><left style="thin"><color rgb="FFDDE3EA"/></left><right style="thin"><color rgb="FFDDE3EA"/></right>'
          + '<top style="thin"><color rgb="FFDDE3EA"/></top><bottom style="thin"><color rgb="FFDDE3EA"/></bottom><diagonal/></border></borders>'
          + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
          + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      }
    };
  }
  /* A real .xlsx built from scratch (JSZip, already used for the Excel
     importer), laid out as a report: a heading block saying what the sheet
     is (title, scope, the view's counts, search and sort, a colour key, who
     made it and when, a PHI notice), then the table - navy header, frozen
     header and first column, filters, banded rows, awaiting-appointment rows
     tinted as on screen, status cells coloured by stage, real Excel dates.
     Prints landscape, one page wide, header row repeated, numbered pages.
     Text cells are inline strings, so nothing in them is read as a formula. */
  var NRL_HEAD_ROW = 7;          // rows 1-5 heading block, 6 a spacer, 7 the table header
  function nrlXlsx(rows, cols, meta) {
    var S = nrlStyles(), H = NRL_HEAD_ROW, lastCol = nrlColLetter(cols.length - 1), lastRow = H + rows.length;
    var text = function (ref, v, s) {
      return '<c r="' + ref + '" t="inlineStr" s="' + s + '"><is><t xml:space="preserve">' + nrlXml(v) + '</t></is></c>';
    };
    var row = function (n, ht, cells) { return '<row r="' + n + '" ht="' + ht + '" customHeight="1">' + cells + '</row>'; };
    var n = { submitted: 0, scheduled: 0 };
    rows.forEach(function (r) { n[r.st]++; });

    var out = [
      row(1, 30, text('A1', 'Neurologist Referral Log', S.get({ size: 18, bold: true, color: '03045E' }))),
      row(2, 18, text('A2', 'Concussion Therapy Group · Patients whose incident occurred in Virginia (Day 1 Location / Jurisdiction) '
        + 'and whose neurologist referral has been submitted or scheduled.', S.get({ color: '475569' }))),
      row(3, 20, text('A3', 'View: ' + meta.view + '   ·   ' + rows.length + (rows.length === 1 ? ' referral' : ' referrals')
        + ' (' + n.submitted + ' Referral Submitted, ' + n.scheduled + ' Appointment Scheduled)'
        + (meta.search ? '   ·   Search: "' + meta.search + '"' : '') + '   ·   Sorted by ' + meta.sort,
        S.get({ bold: true, color: '0F172A' }))),
      row(4, 18, text('A4', 'Yellow rows: referral submitted, still awaiting an appointment. Use the filter arrows on the header row to sort or filter.'
        + '   Generated ' + meta.when + (meta.by ? ' by ' + meta.by : '') + ' from CTG One.', S.get({ size: 10, color: '475569' }))),
      row(5, 18, text('A5', 'CONFIDENTIAL: contains protected health information (PHI). Store and share it only as the practice’s HIPAA policy allows.',
        S.get({ size: 10, bold: true, color: 'B42318' }))),
      row(6, 8, ''),
      row(H, 30, cols.map(function (c, i) {
        return text(nrlColLetter(i) + H, c.label, S.get({ bold: true, color: 'FFFFFF', fill: '0F172A', border: true, wrap: true }));
      }).join(''))
    ];
    rows.forEach(function (r, ri) {
      var rn = H + 1 + ri;
      var fill = r.st === 'submitted' ? 'FFF8E1' : (ri % 2 ? 'F5F8FB' : null);
      out.push(row(rn, 22, cols.map(function (c, ci) {
        var ref = nrlColLetter(ci) + rn;
        if (c.key === 'status') {
          return text(ref, r.status, S.get({ bold: true, border: true, color: r.st === 'submitted' ? '0077B6' : '15803D', fill: r.st === 'submitted' ? 'E0F2FE' : 'DCFCE7' }));
        }
        if (c.date) {
          var d = nrlSerial(r[c.key]), s = S.get({ border: true, date: true, fill: fill });
          return d === null ? '<c r="' + ref + '" s="' + s + '"/>' : '<c r="' + ref + '" s="' + s + '"><v>' + d + '</v></c>';
        }
        return text(ref, nrlCellText(r, c), S.get({ border: true, fill: fill, bold: c.key === 'patient' }));
      }).join('')));
    });

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'
      + '<pane xSplit="1" ySplit="' + H + '" topLeftCell="B' + (H + 1) + '" activePane="bottomRight" state="frozen"/>'
      + '<selection pane="bottomRight" activeCell="B' + (H + 1) + '" sqref="B' + (H + 1) + '"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + '<cols>' + cols.map(function (c, i) {
          /* Wide enough for the header on one line, and dates get room to
             spare: shrunk to fit a printed page, a date that only just fits
             on screen prints as ##### otherwise. */
          var w = Math.max(c.label.length + 5, c.date ? 17 : Math.max(10, Math.round(c.w / 7)));
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join('') + '</cols>'
      + '<sheetData>' + out.join('') + '</sheetData>'
      + '<autoFilter ref="A' + H + ':' + lastCol + lastRow + '"/>'
      + '<mergeCells count="5">' + [1, 2, 3, 4, 5].map(function (r) { return '<mergeCell ref="A' + r + ':' + lastCol + r + '"/>'; }).join('') + '</mergeCells>'
      + '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
      + '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      + '<headerFooter><oddHeader>&amp;L&amp;"Calibri,Bold"Neurologist Referral Log&amp;R&amp;"Calibri,Bold"CONFIDENTIAL - PHI</oddHeader>'
      + '<oddFooter>&amp;LConcussion Therapy Group&amp;CGenerated ' + nrlXml(meta.when) + '&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>'
      + '</worksheet>';
    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="Referral Log" sheetId="1" r:id="rId1"/></sheets><definedNames>'
      + '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'Referral Log\'!$A$' + H + ':$' + lastCol + '$' + lastRow + '</definedName>'
      + '<definedName name="_xlnm.Print_Titles" localSheetId="0">\'Referral Log\'!$' + H + ':$' + H + '</definedName>'
      + '</definedNames></workbook>';
    var styles = S.xml();
    return ensureJSZip().then(function (JSZip) {
      var zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>');
      zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>');
      zip.file('xl/workbook.xml', workbook);
      zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>');
      zip.file('xl/worksheets/sheet1.xml', sheet);
      zip.file('xl/styles.xml', styles);
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }
  // Downloads the rows on screen (this tab, search and sort).
  function nrlDownload(kind) {
    var rows = nrlRows(), cols = nrlExportCols();
    if (!rows.length) { showToast('Nothing to download in this view.', 'err'); return; }
    var done = function () {
      if (typeof ctgAuditListExport === 'function') ctgAuditListExport('neuro_referral_log', rows.length);
      showToast('Downloaded ' + rows.length + (rows.length === 1 ? ' referral.' : ' referrals.'), 'ok');
    };
    // The CSV stays a plain table (no heading block), so it imports cleanly anywhere.
    if (kind === 'csv') { nrlSave(nrlCsv(rows, cols), nrlFileName('csv')); done(); return; }
    var me = typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null;
    var meta = {
      view: NRL_TABS.filter(function (t) { return t[0] === nrlTab; })[0][1],
      search: nrlQuery.trim(),
      sort: nrlSortLabel(),
      when: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', ''),
      by: me ? (me.displayName || me.username || '') : ''
    };
    nrlXlsx(rows, cols, meta).then(function (blob) { nrlSave(blob, nrlFileName('xlsx')); done(); })
      .catch(function (e) { showToast('Excel download failed: ' + (e && e.message ? e.message : e), 'err'); });
  }

  window.renderNeuroReferralLog = renderNeuroReferralLog;
  window.nrlCellClick = nrlCellClick;
  window.nrlSortBy = nrlSortBy;
  window.nrlSetTab = nrlSetTab;
  window.nrlSearch = nrlSearch;
  window.nrlOpenReferral = nrlOpenReferral;
  window.nrlDownload = nrlDownload;

  window.renderNeuroReferrals = renderNeuroReferrals;
  window.nrSelect = nrSelect;
  window.nrItemKey = nrItemKey;
  window.nrField = nrField;
  window.nrTrack = nrTrack;
  window.nrSetStep = nrSetStep;
  window.nrSave = nrSave;
  window.nrOpenChart = nrOpenChart;
  window.nrSetFilter = nrSetFilter;
  window.nrSearch = nrSearch;
  window.nrSearchClear = nrSearchClear;
  window.nrRefresh = nrRefresh;
})();
