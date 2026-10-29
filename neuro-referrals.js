/* Neurologist Referrals.

   Every patient whose Day 1 (ACE) says the incident happened in Virginia
   (Location / Jurisdiction, p.ace.formState.selects.jurisdiction) is listed
   here. Clicking a patient opens the neurologist referral form - the same
   sections and fields the practice fills in on the partner's referral form -
   filled from the chart, so staff only correct what is wrong and save.

   Saved on the patient as p.neuroReferral:
     { status: 'needed' | 'referred', referredOn, notes, form: {...},
       updatedAt, updatedBy }
   A field never saved shows the chart's value, so a chart edit made before
   the referral is filled in still comes through. */
(function () {
  'use strict';

  var nrFilter = 'needed';      // 'needed' | 'referred' | 'all'
  var nrQuery = '';
  var nrSelectedId = null;
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
  var NR_CONDITIONS = ['Concussion/TBI'];

  var NR_ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    chart: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'
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

  /* ------------------------------- the data ------------------------------- */
  function nrAce(p) { return (p && p.ace && p.ace.formState) || null; }
  function nrIsVirginia(p) {
    var fs = nrAce(p);
    return !!(fs && fs.selects && String(fs.selects.jurisdiction || '').trim() === 'Virginia');
  }
  function nrStatus(p) { return (p.neuroReferral && p.neuroReferral.status) === 'referred' ? 'referred' : 'needed'; }
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
  function nrSaved(p) { return p.neuroReferral || {}; }
  // Draft over saved over chart, field by field.
  function nrFormValues(p) {
    var out = nrChartDefaults(p), saved = nrSaved(p).form || {}, draft = nrDrafts[p.id] || {};
    Object.keys(out).forEach(function (k) {
      if (saved[k] !== undefined) out[k] = saved[k];
      if (draft[k] !== undefined) out[k] = draft[k];
    });
    var t = draft.__track || {};
    out.referredOn = t.referredOn !== undefined ? t.referredOn : (nrSaved(p).referredOn || '');
    out.notes = t.notes !== undefined ? t.notes : (nrSaved(p).notes || '');
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
          'A patient appears here as soon as their Day 1 is saved with Location / Jurisdiction set to Virginia.'));
  }

  function nrRows(all) {
    var q = nrQuery.trim().toLowerCase();
    return all.filter(function (p) {
      if (nrFilter !== 'all' && nrStatus(p) !== nrFilter) return false;
      if (!q) return true;
      var d = p.demographics || {};
      return [d.firstName, d.lastName, d.mrn, d.lawFirm].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      // Still to refer: longest wait first. Referred: most recent first.
      var sa = nrStatus(a), sb = nrStatus(b);
      if (sa !== sb) return sa === 'needed' ? -1 : 1;
      if (sa === 'needed') return nrDay1Date(a).localeCompare(nrDay1Date(b));
      return String(nrSaved(b).referredOn || '').localeCompare(String(nrSaved(a).referredOn || ''));
    });
  }

  function nrHeaderHTML() {
    return '<div class="rf-head"><div class="rf-head-t"><h1>Neurologist Referrals</h1>'
      + '<p>Patients whose incident happened in Virginia (from Day 1, Location / Jurisdiction). Click a patient to fill in their neurologist referral.</p></div>'
      + '<div class="rf-head-actions"><button type="button" class="btn btn-ghost" data-onclick="nrRefresh()">'
      + nrIcon('refresh') + 'Refresh</button></div></div>';
  }

  function nrKpisHTML(all) {
    var needed = all.filter(function (p) { return nrStatus(p) === 'needed'; });
    var referred = all.length - needed.length;
    var month = nrToday().slice(0, 7);
    var thisMonth = all.filter(function (p) { return nrStatus(p) === 'referred' && String(nrSaved(p).referredOn || '').slice(0, 7) === month; }).length;
    var oldest = needed.reduce(function (m, p) { var n = nrDaysSince(nrDay1Date(p)); return n !== null && n > m ? n : m; }, -1);
    function tile(cls, icon, label, value, sub) {
      return '<div class="nr-kpi ' + cls + '"><span class="nr-kpi-i">' + nrIcon(icon) + '</span>'
        + '<div><div class="nr-kpi-v">' + value + '</div><div class="nr-kpi-l">' + label + '</div>'
        + (sub ? '<div class="nr-kpi-s">' + sub + '</div>' : '') + '</div></div>';
    }
    return '<div class="nr-kpis">'
      + tile('k-total', 'pin', 'Virginia patients', all.length, 'Incident in Virginia')
      + tile('k-need', 'users', 'Need a referral', needed.length, needed.length ? 'Not sent to a neurologist yet' : 'All caught up')
      + tile('k-done', 'send', 'Referred', referred, thisMonth + ' this month')
      + tile('k-wait', 'clock', 'Longest wait', oldest < 0 ? '—' : oldest + (oldest === 1 ? ' day' : ' days'), oldest < 0 ? 'Nobody waiting' : 'Since Day 1, not referred')
      + '</div>';
  }

  function nrToolbarHTML(all) {
    var n = { needed: 0, referred: 0 };
    all.forEach(function (p) { n[nrStatus(p)]++; });
    function tab(key, label, count) {
      return '<button type="button" class="rf-tab' + (nrFilter === key ? ' active' : '') + '" data-onclick="nrSetFilter(\'' + key + '\')">'
        + label + ' <span class="rf-badge">' + count + '</span></button>';
    }
    return '<div class="rf-toolbar"><div class="rf-tabs">'
      + tab('needed', 'Needs referral', n.needed) + tab('referred', 'Referred', n.referred) + tab('all', 'All', all.length)
      + '</div><div class="rf-search">' + nrIcon('search')
      + '<input id="nrSearch" type="search" autocomplete="off" placeholder="Search patient, account # or firm" value="' + nrEsc(nrQuery) + '" data-oninput="nrSearch(this.value)">'
      + (nrQuery ? '<button type="button" class="rf-search-x" data-onclick="nrSearchClear()" aria-label="Clear search">&times;</button>' : '')
      + '</div></div>';
  }

  function nrPill(p) {
    return nrStatus(p) === 'referred'
      ? '<span class="nr-pill nr-pill-done">' + nrIcon('check') + 'Referred</span>'
      : '<span class="nr-pill nr-pill-need">Needs referral</span>';
  }

  function nrListHTML(rows) {
    if (!rows.length) {
      return '<div class="nr-list card"><div class="nr-list-empty">'
        + (nrQuery ? 'No match for “' + nrEsc(nrQuery) + '”.' : nrFilter === 'needed' ? 'Everyone here has been referred.' : 'Nobody in this list yet.')
        + '</div></div>';
    }
    return '<div class="nr-list card" role="listbox" aria-label="Virginia patients">' + rows.map(function (p) {
      var d = p.demographics || {}, id = nrIdArg(p.id);
      var wait = nrStatus(p) === 'needed' ? nrDaysSince(nrDay1Date(p)) : null;
      var when = nrStatus(p) === 'referred'
        ? 'Referred ' + nrUs(nrSaved(p).referredOn)
        : (wait === null ? 'Day 1 date not saved' : wait === 0 ? 'Day 1 was today' : wait + (wait === 1 ? ' day' : ' days') + ' since Day 1');
      var initials = typeof initialsForPatient === 'function' ? initialsForPatient(p) : ((d.firstName || ' ')[0] + (d.lastName || ' ')[0]);
      return '<div class="nr-item' + (p.id === nrSelectedId ? ' active' : '') + (nrDrafts[p.id] ? ' dirty' : '') + '" role="option" tabindex="0"'
        + ' aria-selected="' + (p.id === nrSelectedId ? 'true' : 'false') + '"'
        + ' data-onclick="nrSelect(\'' + id + '\')" data-onkeydown="nrItemKey(event,\'' + id + '\')">'
        + '<span class="nr-av">' + nrEsc(initials) + '</span>'
        + '<span class="nr-item-main"><b>' + nrEsc(typeof fullPatientName === 'function' ? fullPatientName(p) : (d.lastName + ', ' + d.firstName)) + '</b>'
        + '<span class="nr-item-sub">DOI ' + nrEsc(nrUs(nrDoi(p)) || '—') + (d.lawFirm ? ' · ' + nrEsc(d.lawFirm) : '') + '</span>'
        + '<span class="nr-item-when">' + nrEsc(when) + '</span></span>'
        // The tab already names the status; only the mixed list needs it per row.
        + (nrFilter === 'all' ? nrPill(p) : '') + '</div>';
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
    return '<div class="rf-f"><label for="nrf_' + field + '">' + label + '</label>' + control
      + (hint ? '<div class="nr-hint">' + nrIcon('info') + hint + '</div>' : '') + '</div>';
  }

  function nrFormHTML(p) {
    if (!p) return '<div class="nr-form card"><div class="nr-list-empty">Pick a patient on the left.</div></div>';
    var f = nrFormValues(p), saved = nrSaved(p), st = nrStatus(p), id = nrIdArg(p.id);
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
      + '<div class="nr-form-hd-r">' + nrPill(p)
      + '<button type="button" class="nr-link" data-onclick="nrOpenChart(\'' + id + '\')">' + nrIcon('chart') + 'Open chart</button></div>'
      + '</div>';

    var body = '<div class="nr-form-body">'
      + '<div class="nr-autofill">' + nrIcon('info') + 'Filled in from the patient’s chart and Day 1. Changes here are saved with this referral only; the chart stays as it is.</div>'
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
      + '<h3 class="nr-sec nr-sec-track">Referral</h3>'
      + '<div class="rf-pair">'
        + nrF('Date Referred', 'referredOn', '<input id="nrf_referredOn" type="date" value="' + nrEsc(f.referredOn) + '" data-oninput="nrTrack(\'referredOn\',this.value)">')
        + '<div></div>'
      + '</div>'
      + nrF('Notes <i>(optional)</i>', 'notes', '<textarea id="nrf_notes" rows="2" placeholder="e.g. Sent through the partner form; waiting for their call" data-oninput="nrTrack(\'notes\',this.value)">' + nrEsc(f.notes) + '</textarea>')
      + '</div>';

    var meta = saved.updatedAt
      ? 'Last saved ' + nrEsc(nrUs(String(saved.updatedAt).slice(0, 10))) + (saved.updatedBy ? ' by ' + nrEsc(saved.updatedBy) : '')
      : 'Not saved yet';
    var foot = '<div class="nr-form-ft"><span class="nr-meta">' + (dirty ? '<b class="nr-unsaved">Unsaved changes</b> · ' : '') + meta + '</span>'
      + '<div class="nr-form-btns">'
      + (st === 'referred'
        ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nrSave(\'needed\')">' + nrIcon('undo') + 'Back to Needs referral</button>'
          + '<button type="button" class="rf-btn rf-btn-go" data-onclick="nrSave(\'keep\')">' + nrIcon('check') + 'Save</button>'
        : '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nrSave(\'keep\')">Save</button>'
          + '<button type="button" class="rf-btn rf-btn-go" data-onclick="nrSave(\'referred\')">' + nrIcon('send') + 'Save &amp; mark referred</button>')
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
    nrMarkDirty();
  }
  /* mode: 'keep' saves the form as it is, 'referred' also marks it sent
     (dated today unless a date is entered), 'needed' moves it back. */
  function nrSave(mode) {
    var p = nrSelectedId ? getPatient(nrSelectedId) : null;
    if (!p) return;
    var f = nrFormValues(p);
    if (!f.partner) { showToast('Choose the partner first.', 'error'); return; }
    var form = {};
    Object.keys(nrChartDefaults(p)).forEach(function (k) { form[k] = String(f[k] == null ? '' : f[k]).trim(); });
    var status = mode === 'referred' ? 'referred' : mode === 'needed' ? 'needed' : nrStatus(p);
    var referredOn = f.referredOn || '';
    if (status === 'referred' && !referredOn) referredOn = nrToday();
    var me = typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null;
    p.neuroReferral = {
      status: status, referredOn: referredOn, notes: String(f.notes || '').trim(), form: form,
      updatedAt: new Date().toISOString(), updatedBy: me ? (me.displayName || me.username || '') : ''
    };
    delete nrDrafts[p.id];
    persistPatients();
    showToast(mode === 'referred' ? 'Marked as referred.' : mode === 'needed' ? 'Moved back to Needs referral.' : 'Referral saved.', 'ok');
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
  window.nrSave = nrSave;
  window.nrOpenChart = nrOpenChart;
  window.nrSetFilter = nrSetFilter;
  window.nrSearch = nrSearch;
  window.nrSearchClear = nrSearchClear;
  window.nrRefresh = nrRefresh;
})();
