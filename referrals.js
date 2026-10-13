(function () {
  'use strict';

  var RF_CASE_TYPES = ['Personal Injury', 'Auto Accident', 'Workers Compensation', 'Slip and Fall', 'Other'];
  /* A referral books one thing at one place. Both were dropdowns of options
     the firm could not actually choose between, so they are fixed values now
     and the select stays only so the form reads back the same way. */
  var RF_VISIT_TYPE = 'ACE Evaluation';
  var RF_FACILITY = 'Concussion Therapy Group';
  var RF_VISIT_TYPES = [
    ['ACE_Neuro Only', 'ACE Neuro Only']
  ];

  /* The bookable day: 08:00 to 17:45 in quarter-hours, 40 slots. The clinic's
     own calendar decides which of them are already taken - see rfLoadAvail. */
  var RF_SLOT_FIRST = 8 * 60, RF_SLOT_LAST = 17 * 60 + 45, RF_SLOT_STEP = 15;
  var RF_TIME_SLOTS = (function () {
    var out = [], t;
    for (t = RF_SLOT_FIRST; t <= RF_SLOT_LAST; t += RF_SLOT_STEP) out.push(rfPad2(Math.floor(t / 60)) + ':' + rfPad2(t % 60));
    return out;
  })();
  function rfPad2(n) { return (n < 10 ? '0' : '') + n; }
  var RF_STATES = ['MD', 'DC', 'VA', 'DE', 'PA', 'WV', 'NJ', 'NY', 'NC', 'Other'];
  var RF_STATUS_LABEL = {
    new: 'New', accepted: 'Accepted', scheduled: 'Scheduled',
    declined: 'Declined', withdrawn: 'Withdrawn'
  };

  var rfList = [];
  var rfLoaded = false;
  var rfLoading = false;
  var rfError = '';
  var rfStatusFilter = 'open';      // 'open' | 'all' | one status key
  var rfQuery = '';                 // inbox search box
  var rfTimeOpen = false;           // the preferred-time picker panel
  var rfAvail = { date: '', busy: {}, loading: false, error: '' };
  var rfOpenId = null;              // expanded row
  var rfBusyId = null;

  function rfEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rfToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function rfIsLawyer() { return typeof window.ctgIsLawyer === 'function' && window.ctgIsLawyer(); }
  function rfCan(section) {
    return typeof window.ctgCanSection !== 'function' || window.ctgCanSection('referrals', section);
  }
  function rfVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function rfDash(v) { return v ? rfEsc(v) : '<span class="rf-dash">—</span>'; }
  function rfWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function rfName(r) { return [r.patient.lastName, r.patient.firstName].filter(Boolean).join(', '); }

  /* ---------------------------------- data --------------------------------- */
  async function rfLoad(force) {
    if (rfLoading) return;
    if (rfLoaded && !force) return;
    rfLoading = true; rfError = '';
    try {
      var d = await window.ctgApiFetch('/api/referrals?status=all');
      rfList = (d && d.referrals) || [];
      rfLoaded = true;
    } catch (e) {
      // Shown in the page rather than only as a toast: an empty list and a
      // failed load look identical otherwise, and "no referrals" is a very
      // different thing to tell a firm than "we couldn't reach the server".
      rfError = e.message || 'Could not load referrals';
      rfList = [];
    }
    rfLoading = false;
    rfPaint();
  }

  function rfFiltered() {
    var rows = rfList;
    if (rfStatusFilter === 'open') rows = rows.filter(function (r) { return r.status === 'new'; });
    else if (rfStatusFilter !== 'all') rows = rows.filter(function (r) { return r.status === rfStatusFilter; });
    return rfSearchFilter(rows);
  }

  /* Search reads only what the account is already allowed to SEE: without
     ref.details the patient's name is hidden on the row, so matching on it
     would answer "is this person in your inbox?" for someone who may not ask. */
  function rfSearchFilter(rows) {
    var q = rfQuery.trim().toLowerCase();
    if (!q) return rows;
    var withNames = rfCan('ref.details');
    return rows.filter(function (r) {
      var hay = [r.lawFirm, r.referringParty, r.caseManager, r.submittedByName];
      if (withNames) hay = hay.concat([r.patient.firstName, r.patient.lastName, r.patient.mobile, r.patient.email]);
      return hay.filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }
  function rfCount(status) {
    return rfList.filter(function (r) { return r.status === status; }).length;
  }

  /* --------------------------------- render -------------------------------- */
  function renderReferrals() {
    rfPaint();
    rfLoad(false);
  }

  function rfPaint() {
    var mount = document.getElementById('referralsMount');
    if (!mount) return;
    /* Only the page is repainted here. The submission form lives in the modal
       host, a child of <body> rather than of this mount, precisely so that a
       background list refresh can never destroy a half-filled form - the
       failure that had to be fixed while the form was inline. */
    mount.innerHTML = rfIsLawyer() ? rfFirmHTML() : rfClinicHTML();
  }

  /* One place for the inline SVGs so the markup below stays readable. Sized
     by CSS, not by attributes, so a button and a meta line can share one. */
  var RF_ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    firm: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-6h4v6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
  };
  function rfIcon(name, cls) {
    return '<svg class="' + (cls || 'rf-i') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + RF_ICONS[name] + '</svg>';
  }

  function rfHeader(title, sub) {
    /* Own header block rather than a shared .page-header class - there isn't
       one in styles.css; the other module pages each draw their own top. */
    return '<div class="rf-head"><div class="rf-head-t"><h1>' + rfEsc(title) + '</h1>'
      + '<p>' + rfEsc(sub) + '</p></div>'
      + '<div class="rf-head-actions">'
      + '<button type="button" class="btn btn-ghost rf-refresh" data-onclick="rfRefresh()">'
        + rfIcon('refresh') + 'Refresh</button>'
      + '</div></div>';
  }

  /* The two ways to send a patient in, as a banner rather than two small
     buttons in the top corner: on a page whose list is usually short they read
     as page furniture and were easy to miss entirely. Each is labelled with
     what it does, so nobody has to click one to find out. */
  function rfCtaBarHTML(firmSide) {
    if (!rfCan('ref.submit')) return '';
    return '<div class="rf-cta-bar">'
      + '<div class="rf-cta-copy"><b>' + (firmSide ? 'Send a patient to Concussion Therapy Group' : 'Send a referral yourself') + '</b>'
        + '<span>Book the appointment directly, or send a referral with the symptom questionnaire.</span></div>'
      + '<div class="rf-cta-btns">'
        + '<button type="button" class="rf-cta rf-cta-go" data-onclick="rfOpenWizard()">'
          + rfIcon('calendar') + 'Direct Booking Referral</button>'
        + '<button type="button" class="rf-cta rf-cta-alt" data-onclick="rfOpenReferral()">'
          + rfIcon('external') + 'Submit Patient Referral</button>'
      + '</div></div>';
  }

  /* ------------------------------ law-firm view ---------------------------- */
  function rfFirmHTML() {
    var firm = (typeof window.ctgUserFirm === 'function' && window.ctgUserFirm()) || 'your firm';
    var canSend = rfCan('ref.submit');
    var canList = rfCan('ref.inbox');

    var h = rfHeader('Referrals', 'Send a client to Concussion Therapy Group and follow what happens to the referral.')
      + rfCtaBarHTML(true);
    /* No status tabs on this side - a firm's own list is short and it wants to
       see everything - but once it runs past a screen, search earns its place. */
    if (canList && rfList.length > 5) h += '<div class="rf-toolbar rf-toolbar-end">' + rfSearchHTML() + '</div>';
    if (canList) h += rfListHTML(true);
    else if (canSend) h += rfEmptyHTML('inbox', 'Nothing sent yet', 'Use Direct Booking Referral above to book a client with the clinic.', '');
    else h += rfEmptyHTML('inbox', 'No referral access', 'Your account cannot submit or view referrals. Ask the clinic administrator to enable them.', '');
    return h;
  }


  var RF_SYMPTOM_GROUPS = [
    { title: 'Verbal Communication', questions: [
      { id: 'verbal.understand', text: 'Is it taking longer to understand the meaning of what somebody is saying to you?' },
      { id: 'verbal.findWords', text: 'Is it taking longer to find the words to say what you want to say?' },
      { id: 'verbal.sayWords', text: 'Is it taking longer to say the words once you know what you want to say?' }
    ] },
    { title: 'Light Sensitivity', questions: [
      { id: 'light.sensitive', text: 'Are you more sensitive to light than before the accident?' }
    ] },
    { title: 'Sleep Difficulty', questions: [
      { id: 'sleep.less', text: 'Are you sleeping less than usual?' },
      { id: 'sleep.falling', text: 'Are you having difficulty falling asleep?' }
    ] },
    { title: 'Fear of Travel', questions: [
      { id: 'travel.afraid', text: 'Are you afraid to travel or drive in a car?' }
    ] },
    { title: 'Headaches', questions: [
      { id: 'headache.more', text: 'Are you having more headaches or more intense headaches since the accident?' }
    ] },
    { title: 'Wooziness', questions: [
      { id: 'wooziness.any', text: 'Do you feel any wooziness?' }
    ] },
    { title: 'Lightheadedness', questions: [
      { id: 'lightheaded.any', text: 'Do you feel lightheadedness?' }
    ] },
    { title: 'Emotional', questions: [
      { id: 'emotional.more', text: 'Do you feel more emotional since the accident?' }
    ] },
    { title: 'Nervousness', questions: [
      { id: 'nervous.more', text: 'Do you feel more nervous since the accident?' }
    ] }
  ];

  function rfSymptomById(id) {
    for (var g = 0; g < RF_SYMPTOM_GROUPS.length; g++) {
      var qs = RF_SYMPTOM_GROUPS[g].questions;
      for (var i = 0; i < qs.length; i++) if (qs[i].id === id) return qs[i];
    }
    return null;
  }

  var rfWizStep = 1;          // 1 details · 2 confirmation
  var rfDetails = {};         // the form, kept while the modal is open
  var rfSending = false;
  /* Which form the modal holds. 'book' is Direct Booking (one step, picks a
     slot); 'refer' is Submit Patient Referral (details, then the symptom
     questionnaire). The refer form used to be an external website that posted
     to a Google Apps Script - it lives here now, behind the login and audit. */
  var rfMode = 'book';
  var rfRefStep = 1;          // refer only: 1 details · 2 questionnaire
  var rfSymAnswers = {};      // refer only: {questionId: 'yes'|'no'}

  function rfOpenReferral() {
    rfMode = 'refer';
    rfRefStep = 1;
    rfSymAnswers = {};
    rfWizStep = 1;
    rfDetails = {};
    rfSending = false;
    rfPaintWizard();
  }

  function rfOpenWizard() {
    rfMode = 'book';
    rfWizStep = 1;
    rfDetails = {};
    rfTimeOpen = false;
    rfAvail = { date: '', busy: {}, loading: false, error: '' };
    rfSending = false;
    rfPaintWizard();
  }

  function rfCloseWizard() {
    // Capture first, so a mis-click on the backdrop doesn't drop what was
    // typed - rfOpenWizard is what clears it.
    if (rfWizStep === 1) rfCaptureDetails();
    rfWizStep = 0;
    rfModalHost().innerHTML = '';
    document.body.classList.remove('rf-modal-open');
  }

  /* The modal is mounted on <body>, not inside #referralsMount: the page
     repaints itself whenever the list reloads, and anything living in that
     mount would be destroyed mid-typing. */
  function rfModalHost() {
    var host = document.getElementById('rfModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'rfModalHost';
      document.body.appendChild(host);
    }
    return host;
  }

  function rfPaintWizard() {
    var host = rfModalHost();
    host.innerHTML = rfWizStep ? rfWizardHTML() : '';
    document.body.classList.toggle('rf-modal-open', !!rfWizStep);
    var body = document.getElementById('rfModalBody');
    if (body) body.scrollTop = 0;
  }

  function rfWizardHTML() {
    if (rfWizStep === 2) return rfDoneHTML();
    if (rfMode === 'refer') return rfReferralHTML();
    return '<div class="rf-modal-back" data-onclick="rfBackdropClose(event)">'
      + '<div class="rf-modal" role="dialog" aria-modal="true" aria-label="Direct booking referral">'
        + '<div class="rf-modal-hd">'
          + '<div><h2>Direct Booking Referral</h2><p>All fields are secure and confidential</p></div>'
          + '<button type="button" class="rf-x" data-onclick="rfCloseWizard()" aria-label="Close">&times;</button>'
        + '</div>'
        + '<div class="rf-modal-body" id="rfModalBody">' + rfStep1HTML() + '</div>'
        + '<div class="rf-modal-ft">'
          + '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="rfCloseWizard()">Cancel</button>'
          + '<button type="button" class="rf-btn rf-btn-go" id="rfSubmitBtn" data-onclick="rfSubmit()">Submit Secure Referral '
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></button>'
        + '</div>'
      + '</div></div>';
  }

  function rfStep1HTML() {
    var d = rfDetails;
    var firm = d.referringParty != null ? d.referringParty
      : ((typeof window.ctgUserFirm === 'function' && window.ctgUserFirm()) || '');
    var opt = function (v, cur) { return '<option value="' + rfEsc(v) + '"' + (v === cur ? ' selected' : '') + '>' + rfEsc(v) + '</option>'; };

    return '<div class="rf-fsec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Referring Party</div>'
      + rfField('rfFirmName', 'Law Firm', 'Enter firm or provider name', firm)
      + rfField('rfCaseMgr', 'Case Manager / Paralegal', 'Primary contact name', d.caseManager)

      + '<div class="rf-fsec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>Patient Information</div>'
      + '<div class="rf-pair">'
        + rfField('rfFirst', "Patient's First Name", 'First name', d.firstName)
        + rfField('rfLast', "Patient's Last Name", 'Last name', d.lastName)
      + '</div>'
      + rfField('rfAddress', "Patient's Full Address", 'Street, City, State, ZIP', d.addressLine)
      + '<div class="rf-pair">'
        + '<div class="rf-f"><label for="rfDob">Date of Birth</label>'
          + '<input type="date" id="rfDob" value="' + rfEsc(d.dob || '') + '" max="' + rfNewestQualifyingDob() + '" data-oninput="rfSyncAge()" data-onchange="rfSyncAge()"></div>'
        /* Age is read from the date of birth, never typed. Two fields holding
           one fact drift apart the moment somebody edits one of them, and an
           age is only true for a year while the date it came from stays true
           forever - which is also why nothing stores it. */
        + '<div class="rf-f"><label for="rfAge">Age</label>'
          + '<input type="text" id="rfAge" class="rf-auto" readonly tabindex="-1" placeholder="—"'
            + ' value="' + rfEsc(rfAgeLabel(d.dob)) + '"></div>'
      + '</div>'
      + '<div class="rf-pair">'
        + '<div class="rf-f"><label for="rfGender">Gender</label>'
          + '<select id="rfGender"><option value=""' + (d.gender ? '' : ' selected') + '>— Select —</option>'
            + opt('Male', d.gender) + opt('Female', d.gender)
            + opt('Non-binary', d.gender) + opt('Prefer not to say', d.gender)
          + '</select></div>'
        + rfField('rfDoi', 'Date of Incident', '', d.doi, 'date')
      + '</div>'
      + '<div class="rf-pair">'
        + rfField('rfMobile', 'Phone Number', '(000) 000-0000', d.mobile, 'tel')
        + rfField('rfEmail', 'Patient Email Address', 'name@example.com', d.email, 'email')
      + '</div>'
      + '<div class="rf-f"><label for="rfNotes">Notes <i>(if applicable)</i></label>'
        + '<textarea id="rfNotes" rows="4" placeholder="Additional insurance or case details...">' + rfEsc(d.notes || '') + '</textarea></div>'

      /* Every referral is a booking request: the firm picks the slot and the
         clinic confirms it. There is no "information only" branch any more, so
         these sit directly under Notes instead of behind a radio. */
      + '<div class="rf-fsec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Scheduling</div>'
      + '<div class="rf-pair">'
        + '<div class="rf-f"><label for="rfPrefDate">Preferred Date</label>'
          + '<input type="date" id="rfPrefDate" value="' + rfEsc(d.prefDate || '') + '" data-onchange="rfDateChanged()"></div>'
        + rfTimeFieldHTML(d.prefTime || '')
      + '</div>'
      + '<div class="rf-pair">'
        + '<div class="rf-f"><label for="rfVisitType">Visit Type</label><select id="rfVisitType">'
          + RF_VISIT_TYPES.map(function (o) {
              var sel = (d.visitType || RF_VISIT_TYPES[0][0]) === o[0] ? ' selected' : '';
              return '<option value="' + rfEsc(o[0]) + '"' + sel + '>' + rfEsc(o[1]) + '</option>';
            }).join('')
          + '</select></div>'
        + '<div class="rf-f"><label for="rfFacility">Facility</label><select id="rfFacility">'
          + '<option value="' + rfEsc(RF_FACILITY) + '" selected>' + rfEsc(RF_FACILITY) + '</option>'
          + '</select></div>'
      + '</div>'
      // Video visit: the same option the calendar's appointment form offers.
      // Accepting a video booking creates the patient's meeting room.
      + '<div class="rf-f rf-video">'
        + '<label class="rf-videochk"><input type="checkbox" id="rfVideoVisit"' + (d.videoVisit ? ' checked' : '') + '>'
          + '<span>Video visit</span></label>'
        + '<div class="rf-videohint">Creates a meeting room for this appointment with a link the patient can open.</div>'
      + '</div>';
  }


  function rfTimeFieldHTML(val) {
    return '<div class="rf-f rf-timef" id="rfTimeWrap">'
      + '<label for="rfPrefTimeBtn">Preferred Time</label>'
      + '<input type="hidden" id="rfPrefTime" value="' + rfEsc(val) + '">'
      + '<button type="button" class="rf-time-btn' + (rfTimeOpen ? ' open' : '') + '" id="rfPrefTimeBtn"'
        + ' aria-expanded="' + (rfTimeOpen ? 'true' : 'false') + '" data-onclick="rfToggleTimePicker(event)">'
        + '<span' + (val ? '' : ' class="ph"') + '>' + (val ? rfEsc(rfTimeLabel(val)) : 'Select a time') + '</span>'
        + rfIcon('clock')
      + '</button>'
      + (rfTimeOpen ? rfTimePanelHTML(val) : '')
    + '</div>';
  }

  function rfTimePanelHTML(val) {
    var date = rfCurrentPrefDate();
    var known = !!date && rfAvail.date === date && !rfAvail.loading && !rfAvail.error;
    var h = '<div class="rf-time-pop" data-onclick="event.stopPropagation()">'
      + '<div class="rf-time-hd"><b>Time Picker</b>'
        + '<i>' + (date ? rfEsc(rfSlotLabel(date)) : 'Pick a date to see what is free') + '</i></div>';
    if (date && rfAvail.loading) h += '<div class="rf-time-note">Checking the clinic calendar\u2026</div>';
    else if (date && rfAvail.error) h += '<div class="rf-time-note err">' + rfEsc(rfAvail.error) + '</div>';
    h += '<div class="rf-time-grid">';
    RF_TIME_SLOTS.forEach(function (t) {
      var busy = known && !!rfAvail.busy[t];
      h += '<button type="button" class="rf-slot' + (busy ? ' busy' : '') + (t === val ? ' on' : '') + '"'
        + (busy ? ' disabled title="Already booked on the clinic calendar"' : '')
        + ' data-onclick="rfPickTime(\'' + t + '\')">' + rfEsc(rfTimeLabel(t)) + '</button>';
    });
    h += '</div>'
      + '<div class="rf-time-legend"><span class="k"></span>Free'
        + '<span class="k busy"></span>Already booked'
        + (known ? '<em>' + rfBusyCount() + ' of ' + RF_TIME_SLOTS.length + ' taken</em>' : '')
      + '</div>';
    return h + '</div>';
  }

  function rfBusyCount() {
    return RF_TIME_SLOTS.filter(function (t) { return !!rfAvail.busy[t]; }).length;
  }

  function rfCurrentPrefDate() {
    var el = document.getElementById('rfPrefDate');
    return el ? String(el.value || '').trim() : (rfDetails.prefDate || '');
  }

  function rfPaintTimeField() {
    var wrap = document.getElementById('rfTimeWrap');
    if (!wrap) return;
    var cur = rfVal('rfPrefTime');
    var next = document.createElement('div');
    next.innerHTML = rfTimeFieldHTML(cur);
    wrap.parentNode.replaceChild(next.firstChild, wrap);
    if (rfTimeOpen) rfPositionTimePop();
  }

  function rfPositionTimePop() {
    var pop = document.querySelector('.rf-time-pop');
    var btn = document.getElementById('rfPrefTimeBtn');
    if (!pop || !btn) return;
    var r = btn.getBoundingClientRect();

    /* Scrolled out of the modal body: a panel still hovering over an unrelated
       part of the form reads as a stuck overlay, so close it instead. */
    var body = document.getElementById('rfModalBody');
    if (body) {
      var br = body.getBoundingClientRect();
      if (r.bottom < br.top + 4 || r.top > br.bottom - 4) { rfTimeOpen = false; rfPaintTimeField(); return; }
    }

    var GAP = 8, EDGE = 10;
    pop.style.width = Math.max(r.width, 320) + 'px';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var roomBelow = window.innerHeight - r.bottom - GAP;
    var top = (roomBelow >= h || roomBelow >= r.top - GAP) ? r.bottom + GAP : r.top - GAP - h;
    pop.style.top = Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE)) + 'px';
    pop.style.left = Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE)) + 'px';
  }

  /* Capture phase, so a scroll inside the modal body reaches this too - a
     scroll on an inner element does not bubble to window. */
  document.addEventListener('scroll', function () { if (rfTimeOpen) rfPositionTimePop(); }, true);
  window.addEventListener('resize', function () { if (rfTimeOpen) rfPositionTimePop(); });

  function rfToggleTimePicker(e) {
    if (e) e.stopPropagation();
    rfTimeOpen = !rfTimeOpen;
    rfPaintTimeField();
    if (!rfTimeOpen) return;
    rfEnsureAvail();
  }

  function rfPickTime(t) {
    var el = document.getElementById('rfPrefTime');
    if (el) el.value = t;
    rfDetails.prefTime = t;
    rfTimeOpen = false;
    rfPaintTimeField();
  }

  function rfDateChanged() {
    rfAvail = { date: '', busy: {}, loading: false, error: '' };
    if (rfTimeOpen) { rfPaintTimeField(); rfEnsureAvail(); }
  }

  function rfEnsureAvail() {
    var date = rfCurrentPrefDate();
    if (!date || rfAvail.date === date || rfAvail.loading) return;
    rfLoadAvail(date);
  }

  async function rfLoadAvail(date) {
    rfAvail = { date: '', busy: {}, loading: true, error: '' };
    rfPaintTimeField();
    try {
      var d = await window.ctgApiFetch('/api/referrals/meta/availability?date=' + encodeURIComponent(date)
        + '&facility=' + encodeURIComponent(RF_FACILITY));
      var busy = {};
      ((d && d.busy) || []).forEach(function (t) { busy[t] = true; });
      rfAvail = { date: date, busy: busy, loading: false, error: '' };
    } catch (e) {
      /* Fail OPEN, and say so: an unreachable calendar must not stop a firm
         sending a referral, but it must not quietly show every slot as free
         either. */
      rfAvail = { date: date, busy: {}, loading: false, error: 'Could not read the clinic calendar \u2014 every time is shown as available.' };
    }
    if (rfTimeOpen) rfPaintTimeField();
  }

  /* Age gate for direct referrals. The clinic does not take paediatric
     concussion cases through this route, so a patient aged 12 or under on the
     day the referral is filed is refused. The same rule runs in
     POST /api/referrals - this side is the courtesy, the server is the rule. */
  var RF_MIN_AGE = 13;

  function rfAgeFromDob(dob) {
    var b = new Date(String(dob || '') + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    var now = new Date();
    var age = now.getFullYear() - b.getFullYear();
    var m = now.getMonth() - b.getMonth();
    // Birthday not reached yet this year - still a year younger.
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }

  /* What the read-only Age box shows: the number, or empty when there is no
     usable date yet. An impossible age (a date in the future) shows nothing
     rather than a negative number - rfSubmit reports that properly. */
  function rfAgeLabel(dob) {
    var a = rfAgeFromDob(dob);
    return (a === null || a < 0) ? '' : String(a);
  }

  /* Keeps Age in step with the date of birth as it is typed or picked. */
  function rfSyncAge() {
    var dobEl = document.getElementById('rfDob');
    var ageEl = document.getElementById('rfAge');
    if (dobEl && ageEl) ageEl.value = rfAgeLabel(dobEl.value);
  }

  /* The latest date of birth that still clears the gate, as a yyyy-mm-dd the
     date input can use for its own max - so the picker never offers a date
     the form is going to reject a moment later. */
  function rfNewestQualifyingDob() {
    var t = new Date();
    var d = new Date(t.getFullYear() - RF_MIN_AGE, t.getMonth(), t.getDate());
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function rfField(id, label, ph, val, type) {
    return '<div class="rf-f"><label for="' + id + '">' + rfEsc(label) + '</label>'
      + '<input type="' + (type || 'text') + '" id="' + id + '" value="' + rfEsc(val || '') + '"'
      + (ph ? ' placeholder="' + rfEsc(ph) + '"' : '') + '></div>';
  }

  function rfDoneHTML() {
    return '<div class="rf-modal-back rf-done-back">'
      + '<div class="rf-done">'
        + '<div class="rf-done-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
        + '<h2>Referral Submitted!</h2>'
        + '<p>Your referral has been successfully received by Concussion Therapy Group.</p>'
        + '<p>Our clinical team will review the information and follow up within 24 hours to schedule the patient&rsquo;s initial assessment.</p>'
        + '<button type="button" class="rf-btn rf-btn-go" data-onclick="rfCloseWizard()">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>'
          + 'Back to my referrals</button>'
      + '</div></div>';
  }

  /* Reads step 1 out of the DOM into rfDetails. Called before any navigation
     away from it - Continue, Cancel, or the backdrop - so nothing typed is
     lost by leaving the step. */
  function rfCaptureDetails() {
    if (!document.getElementById('rfFirst')) return;
    rfDetails = {
      referringParty: rfVal('rfFirmName'), caseManager: rfVal('rfCaseMgr'),
      firstName: rfVal('rfFirst'), lastName: rfVal('rfLast'),
      addressLine: rfVal('rfAddress'), dob: rfVal('rfDob'), gender: rfVal('rfGender'), doi: rfVal('rfDoi'),
      mobile: rfVal('rfMobile'), email: rfVal('rfEmail'), notes: rfVal('rfNotes'),
      kind: rfMode,
      prefDate: rfVal('rfPrefDate'), prefTime: rfVal('rfPrefTime'),
      visitType: rfVal('rfVisitType'), facility: rfVal('rfFacility'),
      videoVisit: !!(document.getElementById('rfVideoVisit') && document.getElementById('rfVideoVisit').checked)
    };
  }

  function rfBackdropClose(e) {
    if (e && e.target && e.target.classList.contains('rf-modal-back')) rfCloseWizard();
  }

  /* ------------------------------- clinic view ----------------------------- */
  function rfClinicHTML() {
    if (!rfCan('ref.inbox')) {
      return rfHeader('Referrals', 'Referrals from partner law firms.')
        + rfCtaBarHTML(false)
        + rfEmptyHTML('inbox', 'No inbox access', 'Your account does not have access to the referral list.', false);
    }
    var h = rfHeader('Referrals', 'Patients sent in by partner law firms. Registering or accepting one creates the patient record.')
      + rfCtaBarHTML(false);
    h += '<div class="rf-toolbar">'
      + '<div class="rf-tabs">'
        + rfFilterBtn('open', 'Needs action', rfCount('new'))
        + rfFilterBtn('accepted', 'Accepted', rfCount('accepted'))
        + rfFilterBtn('scheduled', 'Scheduled', rfCount('scheduled'))
        + rfFilterBtn('declined', 'Declined', rfCount('declined'))
        + rfFilterBtn('all', 'All', rfList.length)
      + '</div>'
      + rfSearchHTML()
      + '</div>';
    h += rfListHTML(false);
    return h;
  }

  /* The search box is part of the toolbar rather than a filter tab: with one
     firm sending in several patients a week, "find the Padunan referral" is
     the question this page gets asked, and scrolling was the only answer. */
  function rfSearchHTML() {
    return '<div class="rf-search">' + rfIcon('search')
      + '<input id="rfSearch" type="search" autocomplete="off" placeholder="Search patient, firm or case manager"'
      + ' value="' + rfEsc(rfQuery) + '" data-oninput="rfSearch(this.value)">'
      + (rfQuery ? '<button type="button" class="rf-search-x" data-onclick="rfSearchClear()" aria-label="Clear search">&times;</button>' : '')
      + '</div>';
  }

  function rfFilterBtn(key, label, n) {
    return '<button type="button" class="rf-tab' + (rfStatusFilter === key ? ' active' : '') + '" data-onclick="rfSetFilter(\'' + key + '\')">'
      + rfEsc(label) + ' <span class="rf-badge">' + n + '</span></button>';
  }

  function rfListHTML(firmSide) {
    if (rfLoading && !rfLoaded) return rfEmptyHTML('inbox', 'Loading referrals…', 'One moment.', false);
    if (rfError) return '<div class="card"><div class="card-body rf-empty rf-err">' + rfEsc(rfError) + '</div></div>';
    var rows = firmSide ? rfSearchFilter(rfList) : rfFiltered();
    if (!rows.length) {
      if (rfQuery) return rfEmptyHTML('search', 'No match for “' + rfEsc(rfQuery) + '”', 'Try part of the patient’s name, the firm, or the case manager.', true);
      return firmSide
        ? rfEmptyHTML('inbox', 'Nothing sent yet', 'Referrals you send appear here with their live status.', false)
        : rfEmptyHTML('inbox', 'Nothing in this list', 'New referrals from partner law firms land in Needs action.', false);
    }
    return '<div class="card"><div class="card-body rf-rows">'
      + rows.map(function (r) { return rfRowHTML(r, firmSide); }).join('')
      + '</div></div>';
  }

  /* Every empty state on the page goes through here so that "no referrals",
     "no access" and "no search match" look like the same considered thing
     rather than three stray sentences. */
  function rfEmptyHTML(icon, title, body, clearable) {
    return '<div class="card"><div class="card-body rf-empty">'
      + rfIcon(icon, 'rf-empty-i')
      + '<b>' + title + '</b><p>' + body + '</p>'
      + (clearable ? '<button type="button" class="btn btn-ghost" data-onclick="rfSearchClear()">Clear search</button>' : '')
      + '</div></div>';
  }

  function rfRowHTML(r, firmSide) {
    var open = rfOpenId === r.id;
    var kindLabel = r.kind === 'book' ? 'Booking request' : 'Referral';
    var when = r.preferred.date
      ? rfSlotLabel(r.preferred.date) + (r.preferred.time ? ' · ' + rfTimeLabel(r.preferred.time) : '')
      : '';
    var showDetails = rfCan('ref.details');

    var h = '<div class="rf-row st-' + r.status + (open ? ' open' : '') + '">'
      /* The head is a real button for the keyboard: it toggles the row, and
         the quick actions inside it stop the click from reaching it. */
      + '<div class="rf-row-head' + (firmSide ? ' is-firm' : '') + '" role="button" tabindex="0"'
        + ' aria-expanded="' + (open ? 'true' : 'false') + '"'
        + ' data-onclick="rfToggle(\'' + r.id + '\')" data-onkeydown="rfRowKey(event,\'' + r.id + '\')">'
        + '<span class="rf-chev">' + rfIcon('chevron') + '</span>'
        + '<div class="rf-row-main">'
          + '<b>' + (showDetails ? rfEsc(rfName(r)) : 'Referred patient') + '</b>'
          /* The referral's own status stays Accepted - that is what the clinic
             decided, and it is history. This says what became of the record
             that decision produced. */
          + (r.patientDeleted ? '<span class="rf-gone" title="The patient record and appointment created from this referral no longer exist on CTG One">'
              + rfIcon('trash') + 'Deleted on CTG One</span>' : '')
        + '</div>'
        + '<span class="rf-status rf-' + r.status + '">'
          + (r.kind !== 'book' && r.status === 'accepted' ? 'Registered' : (RF_STATUS_LABEL[r.status] || r.status)) + '</span>'
        + '<span class="rf-kind' + (r.kind === 'book' ? ' book' : '') + '">' + kindLabel + '</span>'
        + '<div class="rf-row-meta">'
          /* Not .rf-slot - that class belongs to the time picker's buttons, and
             this cell was silently inheriting their white pill, border and
             pointer cursor, so a plain date looked like something to click. */
          + '<span class="rf-req">' + (when ? rfIcon('calendar') + rfEsc(when) : '') + '</span>'
          + (firmSide ? '' : '<span class="rf-mfirm">' + rfIcon('firm') + rfDash(r.lawFirm) + '</span>')
          + '<span class="rf-made">' + rfIcon('clock') + rfEsc(rfWhen(r.createdAt)) + '</span>'
        + '</div>'
        + (firmSide ? '' : '<div class="rf-row-quick">' + (open ? '' : rfQuickActions(r)) + '</div>')
      + '</div>';

    if (open) {
      h += '<div class="rf-row-body">';
      if (showDetails) {
        h += rfDetailHTML(r)
          + (r.notes ? '<div class="rf-notes"><span>Notes from the firm</span><p>' + rfEsc(r.notes) + '</p></div>' : '')
          + rfSymptomSummaryHTML(r);
      } else {
        /* ref.inbox without ref.details: the row still shows that a referral
           arrived and from whom, which is what makes this a usable setting
           rather than just a hidden page. */
        h += '<div class="rf-notes"><p>Your account can see that this referral exists, but not the referred person’s details.</p></div>';
      }

      if (r.decisionNote) {
        h += '<div class="rf-notes"><span>' + (r.status === 'withdrawn' ? 'Withdrawn' : r.status === 'declined' ? 'Declined' : 'Note') + '</span><p>' + rfEsc(r.decisionNote) + '</p></div>';
      }
      if (r.patientId) {
        h += '<div class="rf-linked">Patient record created'
          + (r.appointmentId ? ' and appointment booked' : '')
          + '.'
          + (firmSide ? '' : ' <a data-onclick="rfOpenPatient(\'' + rfEsc(r.patientId) + '\')">Open the chart</a>')
          + '</div>';
      } else if (r.patientDeleted) {
        h += '<div class="rf-linked is-gone">' + rfIcon('trash')
          + 'The patient record created from this referral, and any appointment booked with it, '
          + 'have since been deleted on CTG One.</div>';
      }

      h += '<div class="rf-row-actions">' + rfRowActions(r, firmSide) + '</div>';
      h += '</div>';
    }
    return h + '</div>';
  }

  /* Accept / Decline on the collapsed row. Those two decisions are the entire
     point of the inbox, and having to expand a row first made every one of
     them a two-click job. The expanded row keeps the fully labelled buttons;
     these are the same actions, in reach. */
  /* Clinic side only - the caller owns the wrapper cell, which stays in the
     grid even when there is nothing to put in it. */
  function rfQuickActions(r) {
    if (r.status !== 'new') return '';
    var busy = rfBusyId === r.id ? ' disabled' : '';
    var out = '';
    /* A plain referral is not approved or turned down - it is registered.
       One button, and no Decline; a junk one is removed with Delete. */
    if (r.kind !== 'book') {
      return rfCan('ref.accept')
        ? '<button type="button" class="rf-quick rf-quick-go"' + busy
          + ' title="Create the patient record from this referral"'
          + ' data-onclick="event.stopPropagation();rfAccept(\'' + r.id + '\')">'
          + rfIcon('check') + 'Register patient</button>'
        : '';
    }
    if (rfCan('ref.accept')) {
      var books = r.kind === 'book' && r.preferred.date && rfCan('ref.schedule');
      out += '<button type="button" class="rf-quick rf-quick-go"' + busy
        + ' title="' + (books ? 'Create the patient record and book the requested appointment' : 'Create the patient record') + '"'
        + ' data-onclick="event.stopPropagation();rfAccept(\'' + r.id + '\')">'
        + rfIcon('check') + (books ? 'Accept &amp; book' : 'Accept') + '</button>';
    }
    if (rfCan('ref.decline')) {
      out += '<button type="button" class="rf-quick rf-quick-no"' + busy
        + ' data-onclick="event.stopPropagation();rfDecline(\'' + r.id + '\')">' + rfIcon('x') + 'Decline</button>';
    }
    return out;
  }

  /* Dates and times as people read them, not as the API stores them. Both fall
     back to the raw value: a malformed date should still be visible. */
  function rfSlotLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function rfTimeLabel(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return String(hhmm || '');
    var hr = Number(m[1]), ap = hr >= 12 ? 'PM' : 'AM';
    return ((hr % 12) || 12) + ':' + m[2] + ' ' + ap;
  }

  /* The questionnaire, as the clinic needs to read it: what the patient said
     YES to, first and grouped, then the negatives as a plain list. A wall of
     nine groups each repeating "No" is unreadable, and the positives are the
     entire clinical point of asking. */
  function rfSymptomSummaryHTML(r) {
    var answers = r.symptoms || {};
    var ids = Object.keys(answers);
    if (!ids.length) return '';
    var yes = [], no = [];
    RF_SYMPTOM_GROUPS.forEach(function (g) {
      g.questions.forEach(function (q) {
        if (answers[q.id] === 'yes') yes.push({ g: g.title, q: q });
        else if (answers[q.id] === 'no') no.push(g.title);
      });
    });
    var unanswered = 0;
    RF_SYMPTOM_GROUPS.forEach(function (g) {
      g.questions.forEach(function (q) { if (!answers[q.id]) unanswered++; });
    });
    return '<div class="rf-symp">'
      + '<span>Symptom questionnaire &middot; ' + yes.length + ' reported'
      + (unanswered ? ' &middot; ' + unanswered + ' unanswered' : '') + '</span>'
      + (yes.length
          ? '<ul class="rf-symp-yes">' + yes.map(function (x) {
              return '<li><b>' + rfEsc(x.g) + '</b>' + rfEsc(x.q.text) + '</li>';
            }).join('') + '</ul>'
          : '<p class="rf-symp-none">No symptoms reported.</p>')
      + '</div>';
  }

  function rfDetailHTML(r) {
    var p = r.patient, pref = r.preferred || {};
    var age = rfAgeLabel(p.dob);
    return '<div class="rf-detail">'
      + rfPanel('user', 'Patient', [
          ['Name', rfName(r)],
          ['Date of birth', p.dob ? rfSlotLabel(p.dob) + (age ? ' · ' + age + ' yrs' : '') : ''],
          ['Gender', p.gender],
          ['Date of incident', p.doi ? rfSlotLabel(p.doi) : '']
        ])
      + rfPanel('mail', 'Contact', [
          ['Phone', p.mobile],
          ['Email', p.email],
          ['Address', [p.addressLine, p.city, p.state, p.zip].filter(Boolean).join(', ')]
        ])
      + rfPanel('firm', 'Referring party', [
          ['Law firm', r.referringParty || r.lawFirm],
          ['Case manager', r.caseManager],
          ['Submitted by', r.submittedByName],
          ['Submitted', rfWhen(r.createdAt)]
        ])
      // A plain referral asks for no appointment, so there is nothing to show.
      + (r.kind === 'book' ? rfPanel('calendar', 'Requested appointment', [
          ['Date', pref.date ? rfSlotLabel(pref.date) : ''],
          ['Time', pref.time ? rfTimeLabel(pref.time) : ''],
          ['Visit type', pref.visitType],
          ['Facility', pref.facility],
          ['Video visit', pref.videoVisit ? 'Yes' : 'No']
        ], 'is-req') : '')
      + '</div>';
  }

  function rfPanel(icon, title, rows, cls) {
    return '<section class="rf-panel' + (cls ? ' ' + cls : '') + '">'
      + '<h4>' + rfIcon(icon, 'rf-panel-i') + rfEsc(title) + '</h4>'
      + '<dl>' + rows.map(function (row) {
          return '<dt>' + rfEsc(row[0]) + '</dt>'
            + '<dd>' + (row[1] ? rfEsc(row[1]) : '<span class="rf-dash">—</span>') + '</dd>';
        }).join('') + '</dl>'
      + '</section>';
  }

  function rfRowActions(r, firmSide) {
    var busy = rfBusyId === r.id;
    if (firmSide) {
      if (r.status !== 'new' || !rfCan('ref.decline')) return '<span class="rf-hint">No action available.</span>';
      return '<button type="button" class="btn btn-ghost btn-sm"' + (busy ? ' disabled' : '')
        + ' data-onclick="rfWithdraw(\'' + r.id + '\')">Withdraw this referral</button>';
    }
    /* Deleting a referral is for administrators, and only once it leads to no
       chart - the server enforces the same rule. */
    var me = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
    var del = (me.role === 'admin' && !r.patientId)
      ? '<button type="button" class="btn btn-ghost btn-sm" data-cs="'+__cs+'color:var(--red)"' + (busy ? ' disabled' : '')
        + ' data-onclick="rfDelete(\'' + r.id + '\')">Delete referral</button>'
      : '';
    if (r.patientDeleted) {
      return '<span class="rf-hint">Accepted ' + rfEsc(rfWhen(r.decidedAt))
        + '. The patient record created from it has since been deleted on this portal.</span>' + del;
    }
    if (r.status === 'declined' || r.status === 'withdrawn' || r.patientId) {
      return '<span class="rf-hint">' + (r.kind !== 'book' && r.patientId ? 'Registered ' : 'Closed ')
        + rfEsc(rfWhen(r.decidedAt)) + '.</span>' + del;
    }
    if (r.kind !== 'book') {
      return (rfCan('ref.accept')
        ? '<button type="button" class="btn btn-primary btn-sm"' + (busy ? ' disabled' : '')
          + ' data-onclick="rfAccept(\'' + r.id + '\')">Register patient</button>'
        : '<span class="rf-hint">Your account can view referrals but not register patients.</span>') + del;
    }
    var out = '';
    if (rfCan('ref.accept')) {
      var wantsBooking = r.kind === 'book' && r.preferred.date && rfCan('ref.schedule');
      out += '<button type="button" class="btn btn-primary btn-sm"' + (busy ? ' disabled' : '')
        + ' data-onclick="rfAccept(\'' + r.id + '\')">'
        + (wantsBooking ? 'Accept &amp; book the appointment' : 'Accept &amp; create patient')
        + '</button>';
      if (r.kind === 'book' && r.preferred.date && !rfCan('ref.schedule')) {
        out += '<span class="rf-hint">The firm asked for '
          + rfEsc(r.preferred.date + (r.preferred.time ? ' at ' + r.preferred.time : ''))
          + ', but your account cannot book appointments — someone else will need to schedule it.</span>';
      }
    }
    if (rfCan('ref.decline')) {
      out += '<button type="button" class="btn btn-ghost btn-sm"' + (busy ? ' disabled' : '')
        + ' data-onclick="rfDecline(\'' + r.id + '\')">Decline</button>';
    }
    return out || '<span class="rf-hint">Your account can view referrals but not action them.</span>';
  }

  /* -------------------------------- actions -------------------------------- */
  function rfSetFilter(f) { rfStatusFilter = f; rfOpenId = null; rfPaint(); }

  /* Painting replaces the whole toolbar, so the box loses focus on every
     keystroke unless it is put back - caret at the end, or typing reverses
     itself. Cheap enough to do synchronously: the list is one card. */
  function rfSearch(v) {
    rfQuery = String(v || '');
    rfOpenId = null;
    rfPaint();
    var el = document.getElementById('rfSearch');
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
  }
  function rfSearchClear() { rfQuery = ''; rfOpenId = null; rfPaint(); }

  /* Enter or Space on a focused row, since the head is role="button". */
  function rfRowKey(e, id) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    rfToggle(id);
  }
  function rfToggle(id) { rfOpenId = (rfOpenId === id) ? null : id; rfPaint(); }
  function rfRefresh() { rfLoad(true); }
  function rfOpenPatient(patientId) {
    /* Same hand-off the other list pages use: select the patient, then show
       the chart. Guarded because a coordinator may have referrals without
       Patient Lists, and a hard call would throw instead of explaining. */
    if (typeof window.selectPatient === 'function' && typeof window.showPage === 'function') {
      try { window.selectPatient(patientId); } catch (e) {}
      window.showPage('patientLists');
      return;
    }
    rfToast('Open Patient Lists to see the new record', '');
  }

  async function rfSubmit() {
    if (rfSending) return;
    /* The form is the only step now, so Submit reads it out of the DOM and
       validates it here - there is no Continue left to do that first. */
    rfCaptureDetails();
    var d = rfDetails;
    if (!rfCheckPatient(d)) return;
    if (!d.prefDate) {
      rfToast('Choose the preferred date for the booking', 'err');
      var dateEl = document.getElementById('rfPrefDate');
      if (dateEl) dateEl.focus();
      return;
    }

    var body = {
      kind: 'book',
      referringParty: d.referringParty || '',
      caseManager: d.caseManager || '',
      patient: {
        firstName: d.firstName, lastName: d.lastName, dob: d.dob || '',
        gender: d.gender || '',
        mobile: d.mobile || '', email: d.email || '',
        addressLine: d.addressLine || '', doi: d.doi || ''
      },
      notes: d.notes || '',
      preferred: { date: d.prefDate, time: d.prefTime, facility: d.facility, visitType: d.visitType, videoVisit: !!d.videoVisit }
    };

    rfSending = true;
    var btn = document.getElementById('rfSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      await window.ctgApiFetch('/api/referrals', { method: 'POST', body: JSON.stringify(body) });
      rfWizStep = 2;
      rfPaintWizard();
      // Refresh the list underneath, so closing the confirmation reveals the
      // referral that was just sent rather than a stale one.
      rfLoad(true);
    } catch (e) {
      rfSending = false;
      rfToast(e.message || 'Could not send the referral', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Secure Referral'; }
    }
  }

  /* Name and date of birth, shared by both forms. Date of birth is required
     BECAUSE of the age gate - without it there is nothing to check against. */
  function rfCheckPatient(d) {
    var fail = function (msg, id) {
      rfToast(msg, 'err');
      var el = document.getElementById(id);
      if (el) el.focus();
      return false;
    };
    if (!d.firstName || !d.lastName) {
      return fail('The patient’s first and last name are required', d.firstName ? 'rfLast' : 'rfFirst');
    }
    var age = rfAgeFromDob(d.dob);
    if (age === null) return fail(d.dob ? 'That date of birth is not a valid date' : 'The patient’s date of birth is required', 'rfDob');
    if (age < 0) return fail('That date of birth is in the future', 'rfDob');
    if (age < RF_MIN_AGE) return fail('Patients aged 12 and under cannot be referred through this form — please call the clinic', 'rfDob');
    return true;
  }

  /* ------------------------ Submit Patient Referral ------------------------ */
  var RF_ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var RF_ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  var RF_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  function rfReferralHTML() {
    var two = rfRefStep === 2;
    var step = function (n, label) {
      var cls = n === rfRefStep ? ' is-on' : (n < rfRefStep ? ' is-done' : '');
      return '<div class="rf-stp' + cls + '"><span>' + n + '</span>' + label + '</div>';
    };
    return '<div class="rf-modal-back" data-onclick="rfBackdropClose(event)">'
      + '<div class="rf-modal is-refer" role="dialog" aria-modal="true" aria-label="Submit a patient referral">'
        + '<div class="rf-modal-hd">'
          + '<div><h2>Submit a Patient Referral</h2><p>All fields are secure and confidential</p></div>'
          + '<button type="button" class="rf-x" data-onclick="rfCloseWizard()" aria-label="Close">&times;</button>'
        + '</div>'
        + '<div class="rf-modal-body" id="rfModalBody">'
          + '<div class="rf-stepper">' + step(1, 'Referral Details') + '<i></i>' + step(2, 'Symptom Questionnaire') + '</div>'
          + (two ? rfQuestionnaireHTML() : rfRefDetailsHTML())
          + '<div class="rf-ref-ft">'
            + (two
              ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="rfRefBack()">' + RF_ARROW_L + 'Back</button>'
                + '<button type="button" class="rf-btn rf-btn-go" id="rfSubmitBtn" data-onclick="rfSubmitReferral()">Submit Secure Referral ' + RF_SHIELD + '</button>'
              : '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="rfCloseWizard()">Cancel</button>'
                + '<button type="button" class="rf-btn rf-btn-go" data-onclick="rfRefContinue()">Continue ' + RF_ARROW_R + '</button>')
          + '</div>'
        + '</div>'
      + '</div></div>';
  }

  function rfRefDetailsHTML() {
    var d = rfDetails;
    var firm = d.referringParty != null ? d.referringParty
      : ((typeof window.ctgUserFirm === 'function' && window.ctgUserFirm()) || '');
    return '<div class="rf-fsec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Referring Party</div>'
      + rfField('rfFirmName', 'Law Firm', 'Enter firm or provider name', firm)
      + rfField('rfCaseMgr', 'Case Manager / Paralegal', 'Primary contact name', d.caseManager)
      + '<div class="rf-fsec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>Patient Information</div>'
      + '<div class="rf-pair">'
        + rfField('rfFirst', "Patient's First Name", 'First name', d.firstName)
        + rfField('rfLast', "Patient's Last Name", 'Last name', d.lastName)
      + '</div>'
      + rfField('rfAddress', "Patient's Full Address", 'Street, City, State, ZIP', d.addressLine)
      + '<div class="rf-pair">'
        + '<div class="rf-f"><label for="rfDob">Date of Birth</label>'
          + '<input type="date" id="rfDob" value="' + rfEsc(d.dob || '') + '" max="' + rfNewestQualifyingDob() + '"></div>'
        + rfField('rfDoi', 'Date of Incident', '', d.doi, 'date')
      + '</div>'
      + '<div class="rf-pair">'
        + rfField('rfMobile', 'Phone Number', '(000) 000-0000', d.mobile, 'tel')
        + rfField('rfEmail', 'Patient Email Address', 'name@example.com', d.email, 'email')
      + '</div>'
      + '<div class="rf-f"><label for="rfNotes">Notes <i>(if applicable)</i></label>'
        + '<textarea id="rfNotes" rows="4" placeholder="Additional insurance or case details...">' + rfEsc(d.notes || '') + '</textarea></div>';
  }

  function rfQuestionnaireHTML() {
    return '<div class="rf-q-info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
      + 'Please answer each symptom question on behalf of the patient.</div>'
      + RF_SYMPTOM_GROUPS.map(function (g, gi) {
          return '<section class="rf-q-group"><header><span>' + (gi + 1) + '</span>' + rfEsc(g.title) + '</header>'
            + g.questions.map(function (q) {
                var a = rfSymAnswers[q.id] || '';
                var yn = function (v, label) {
                  return '<button type="button" class="rf-yn' + (a === v ? ' is-on' : '') + '" data-v="' + v + '"'
                    + ' aria-pressed="' + (a === v ? 'true' : 'false') + '" data-onclick="rfAnswer(\'' + q.id + '\',\'' + v + '\',this)">' + label + '</button>';
                };
                return '<div class="rf-q" id="rfq-' + q.id.replace('.', '-') + '"><p>' + rfEsc(q.text) + '</p>'
                  + '<div class="rf-yns">' + yn('yes', 'Yes') + yn('no', 'No') + '</div></div>';
              }).join('')
            + '</section>';
        }).join('');
  }

  function rfRefContinue() {
    rfCaptureDetails();
    if (!rfCheckPatient(rfDetails)) return;
    rfRefStep = 2;
    rfPaintWizard();
  }

  function rfRefBack() {
    rfRefStep = 1;
    rfPaintWizard();
  }

  // Updated in place, not repainted, so the list does not jump back to the top.
  function rfAnswer(id, v, btn) {
    rfSymAnswers[id] = v;
    var row = btn && btn.closest('.rf-q');
    if (!row) return;
    row.classList.remove('is-missing');
    row.querySelectorAll('.rf-yn').forEach(function (b) {
      var on = b.getAttribute('data-v') === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  async function rfSubmitReferral() {
    if (rfSending) return;
    var missing = [];
    RF_SYMPTOM_GROUPS.forEach(function (g) {
      g.questions.forEach(function (q) { if (!rfSymAnswers[q.id]) missing.push(q.id); });
    });
    if (missing.length) {
      missing.forEach(function (id) {
        var row = document.getElementById('rfq-' + id.replace('.', '-'));
        if (row) row.classList.add('is-missing');
      });
      var first = document.getElementById('rfq-' + missing[0].replace('.', '-'));
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      rfToast(missing.length === 1 ? 'One question still needs an answer' : missing.length + ' questions still need an answer', 'err');
      return;
    }
    var d = rfDetails;
    var body = {
      kind: 'refer',
      referringParty: d.referringParty || '',
      caseManager: d.caseManager || '',
      patient: {
        firstName: d.firstName, lastName: d.lastName, dob: d.dob || '',
        mobile: d.mobile || '', email: d.email || '',
        addressLine: d.addressLine || '', doi: d.doi || ''
      },
      notes: d.notes || '',
      symptoms: rfSymAnswers
    };
    rfSending = true;
    var btn = document.getElementById('rfSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      await window.ctgApiFetch('/api/referrals', { method: 'POST', body: JSON.stringify(body) });
      rfWizStep = 2;
      rfPaintWizard();
      rfLoad(true);
    } catch (e) {
      rfSending = false;
      rfToast(e.message || 'Could not send the referral', 'err');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Secure Referral ' + RF_SHIELD; }
    }
  }

  function rfAsk(msg, opts) {
    if (typeof window.ctgConfirm === 'function') return window.ctgConfirm(msg, opts);
    return Promise.resolve(window.confirm(msg));
  }
  function rfAskText(msg, opts) {
    if (typeof window.ctgPrompt === 'function') return window.ctgPrompt(msg, opts);
    return Promise.resolve(window.prompt(msg, ''));
  }

  async function rfAccept(id) {
    var r = rfList.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var books = r.kind === 'book' && r.preferred.date && rfCan('ref.schedule');
    var register = r.kind !== 'book';
    var msg = 'A patient record will be created for ' + rfName(r)
      + (books
        ? ', and an appointment booked for ' + rfSlotLabel(r.preferred.date)
          + (r.preferred.time ? ' at ' + rfTimeLabel(r.preferred.time) : '') + '.'
        : (register ? ' from the details in this referral.' : '.'));
    var dlg = register
      ? { title: 'Register Patient', okLabel: 'Register patient' }
      : { title: 'Accept Referral', okLabel: books ? 'Accept & Book' : 'Accept' };
    if (!(await rfAsk(msg, dlg))) return;
    rfBusyId = id; rfPaint();
    try {
      var d = await window.ctgApiFetch('/api/referrals/' + encodeURIComponent(id) + '/accept', {
        method: 'POST', body: JSON.stringify({})
      });
      rfToast(d && d.appointmentId ? 'Patient created and appointment booked' : (register ? 'Patient registered' : 'Patient record created'), 'ok');
      /* The roster in memory predates this new chart, so refresh it - without
         this the patient exists on the server but nothing on the Patient Lists
         page can find them until a reload. */
      if (typeof window.ctgLoadPatientStore === 'function') { try { await window.ctgLoadPatientStore(); } catch (e) {} }
      await rfLoad(true);
    } catch (e) {
      rfToast(e.message || 'Could not accept the referral', 'err');
    }
    rfBusyId = null; rfPaint();
  }

  async function rfDecline(id) {
    var note = await rfAskText('What should the firm be told?', {
      title: 'Decline Referral', okLabel: 'Decline',
      placeholder: 'Reason for declining…',
      hint: 'This note goes back to the referring firm with the decline.'
    });
    if (note === null) return;
    await rfClose(id, note, 'Referral declined');
  }
  async function rfWithdraw(id) {
    var note = await rfAskText('Why is this referral being withdrawn?', {
      title: 'Withdraw Referral', okLabel: 'Withdraw',
      placeholder: 'Reason (optional)…',
      hint: 'Optional — leave this blank to withdraw without a note.'
    });
    if (note === null) return;
    await rfClose(id, note, 'Referral withdrawn');
  }
  async function rfDelete(id) {
    if (!(await window.ctgConfirm('Permanently delete this referral? The firm, dates and status are removed along with it. This is recorded in the audit log and cannot be undone.', { danger: true, okLabel: 'Delete' }))) return;
    rfBusyId = id; rfPaint();
    try {
      await window.ctgApiFetch('/api/referrals/' + encodeURIComponent(id), { method: 'DELETE' });
      rfToast('Referral deleted', 'ok');
      rfOpenId = null;
      await rfLoad(true);
    } catch (e) {
      rfToast((e && e.message) || 'Could not delete the referral', 'err');
    } finally {
      rfBusyId = null; rfPaint();
    }
  }
  async function rfClose(id, note, okMsg) {
    rfBusyId = id; rfPaint();
    try {
      await window.ctgApiFetch('/api/referrals/' + encodeURIComponent(id) + '/decline', {
        method: 'POST', body: JSON.stringify({ note: note || '' })
      });
      rfToast(okMsg, 'ok');
      await rfLoad(true);
    } catch (e) {
      rfToast(e.message || 'Could not update the referral', 'err');
    }
    rfBusyId = null; rfPaint();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    // The picker closes first: Escape with it open should not throw the whole
    // half-filled referral away.
    if (rfTimeOpen) { rfTimeOpen = false; rfPaintTimeField(); return; }
    if (rfWizStep) rfCloseWizard();
  });

  document.addEventListener('click', function () {
    if (!rfTimeOpen) return;
    rfTimeOpen = false;
    rfPaintTimeField();
  });

  window.renderReferrals = renderReferrals;
  window.rfOpenWizard = rfOpenWizard;
  window.rfOpenReferral = rfOpenReferral;
  window.rfRefContinue = rfRefContinue;
  window.rfRefBack = rfRefBack;
  window.rfAnswer = rfAnswer;
  window.rfSubmitReferral = rfSubmitReferral;
  window.rfCloseWizard = rfCloseWizard;
  window.rfBackdropClose = rfBackdropClose;
  window.rfSetFilter = rfSetFilter;
  window.rfSearch = rfSearch;
  window.rfSearchClear = rfSearchClear;
  window.rfToggleTimePicker = rfToggleTimePicker;
  window.rfPickTime = rfPickTime;
  window.rfDateChanged = rfDateChanged;
  window.rfSyncAge = rfSyncAge;
  window.rfRowKey = rfRowKey;
  window.rfToggle = rfToggle;
  window.rfRefresh = rfRefresh;
  window.rfSubmit = rfSubmit;
  window.rfAccept = rfAccept;
  window.rfDecline = rfDecline;
  window.rfDelete = rfDelete;
  window.rfWithdraw = rfWithdraw;
  window.rfOpenPatient = rfOpenPatient;
})();
