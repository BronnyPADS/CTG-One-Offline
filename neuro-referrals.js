/* Neurologist Referrals.

   Every patient whose Day 1 (ACE) says the incident happened in Virginia
   (Location / Jurisdiction, p.ace.formState.selects.jurisdiction) is listed
   here. Clicking a patient opens the neurologist referral form - the same
   sections and fields the practice fills in on the partner's referral form -
   filled from the chart, so staff only correct what is wrong and save.

   Saved on the patient as p.neuroReferral:
     { status: 'pending' | 'submitted' | 'scheduled',
       referredOn, apptDate, notes, form: {...},
       updatedAt, updatedBy }
   A field never saved shows the chart's value, so a chart edit made before
   the referral is filled in still comes through. */
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
  // The Day 1 Language list (app.js, #languageField), so a saved Day 1 answer is always an option.
  var NR_LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Chinese (Mandarin)', 'Japanese', 'Korean',
    'Portuguese', 'Russian', 'Arabic', 'Hindi', 'Italian', 'Dutch', 'Swedish', 'Polish', 'Vietnamese', 'Thai',
    'Turkish', 'Other'];
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

  /* What the chart already says, for every field of the referral form. */
  function nrChartDefaults(p) {
    var d = p.demographics || {}, fs = nrAce(p) || {};
    return {
      partner: NR_PARTNERS[0],
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      dob: nrIsoDate(d.dob),
      language: (fs.selects || {}).languageField || 'English',
      email: d.email || '',
      phone: d.mobile || d.phone || '',
      // The patient's home state; the incident state when no address is on file.
      state: nrStateName(d.state) || 'Virginia',
      zip: d.zip || '',
      conditionFocus: NR_CONDITIONS[0]
    };
  }
  // Draft over saved over chart, field by field.
  function nrFormValues(p) {
    var out = nrChartDefaults(p), saved = nrSaved(p), sform = saved.form || {}, draft = nrDrafts[p.id] || {};
    Object.keys(out).forEach(function (k) {
      if (sform[k] !== undefined) out[k] = sform[k];
      if (draft[k] !== undefined) out[k] = draft[k];
    });
    var t = draft.__track || {};
    NR_TRACK.forEach(function (k) {
      out[k] = t[k] !== undefined ? t[k] : (k === 'status' ? nrStatus(p) : (saved[k] || ''));
    });
    return out;
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
      + '<div class="rf-head-actions"><button type="button" class="btn btn-ghost" data-onclick="nrRefresh()">'
      + nrIcon('refresh') + 'Refresh</button></div></div>';
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
      return '<div class="nr-item nr-is-' + st + (p.id === nrSelectedId ? ' active' : '') + (nrDrafts[p.id] ? ' dirty' : '') + '" role="option" tabindex="0"'
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
  function nrInputHTML(field, value, type, placeholder) {
    return '<input id="nrf_' + field + '" type="' + (type || 'text') + '" value="' + nrEsc(value) + '"'
      + (placeholder ? ' placeholder="' + nrEsc(placeholder) + '"' : '')
      + ' data-oninput="nrField(\'' + field + '\',this.value)">';
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
    var dirty = !!nrDrafts[p.id];
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
      + '<div class="nr-autofill">' + nrIcon('info') + 'Pre-filled from the patient’s chart and Day 1 evaluation. Edits below apply to this referral only and do not change the chart.</div>'
      + '<h3 class="nr-sec">Partner’s Info</h3>'
      + '<div class="rf-pair">' + nrF('Partner<span class="req-star" aria-hidden="true">*</span>', 'partner', nrSelectHTML('partner', f.partner, NR_PARTNERS, true)) + '<div></div></div>'
      + '<h3 class="nr-sec">Patient’s Basic Info</h3>'
      + '<div class="rf-pair">'
        + nrF('First Name', 'firstName', nrInputHTML('firstName', f.firstName))
        + nrF('Last Name', 'lastName', nrInputHTML('lastName', f.lastName))
        + nrF('Date of Birth <i>(MM/DD/YYYY)</i>', 'dob', nrInputHTML('dob', f.dob, 'date'))
        + nrF('Language Preference', 'language', nrSelectHTML('language', f.language, NR_LANGUAGES))
      + '</div>'
      + '<h3 class="nr-sec">Contact Info</h3>'
      + '<div class="rf-pair">'
        + nrF('Email', 'email', nrInputHTML('email', f.email, 'email'), 'Leave blank if unknown')
        + nrF('Phone Number', 'phone', nrInputHTML('phone', f.phone, 'tel'))
        + nrF('State', 'state', nrSelectHTML('state', f.state, NR_STATES))
        + nrF('ZIP Code', 'zip', nrInputHTML('zip', f.zip, 'text'))
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
    var foot = '<div class="nr-form-ft"><span class="nr-meta">' + (dirty ? '<b class="nr-unsaved">Unsaved changes</b> · ' : '') + meta + '</span>'
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
  // Typing does not repaint (that would steal the cursor); it only flags the row and footer.
  function nrMarkDirty() {
    var item = document.querySelector('#neuroReferralsMount .nr-item.active');
    if (item) item.classList.add('dirty');
    var meta = document.querySelector('#neuroReferralsMount .nr-meta');
    if (meta && !meta.querySelector('.nr-unsaved')) meta.insertAdjacentHTML('afterbegin', '<b class="nr-unsaved">Unsaved changes</b> · ');
  }
  function nrField(field, value) {
    var d = nrDraft(); if (!d) return;
    d[field] = value;
    nrMarkDirty();
  }
  function nrTrack(field, value) {
    var d = nrDraft(); if (!d) return;
    d.__track = d.__track || {};
    d.__track[field] = value;
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
    d.__track.status = key;
    var s = nrStep(key);
    if (s.today && !nrFormValues(p)[s.date]) d.__track[s.date] = nrToday();
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
    var form = {};
    Object.keys(nrChartDefaults(p)).forEach(function (k) { form[k] = String(f[k] == null ? '' : f[k]).trim(); });
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
