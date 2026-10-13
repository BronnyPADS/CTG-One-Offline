(function () {
  'use strict';

  var DOC_KEY = 'patientRequests';
  var prItems = [];
  var prVersion = 0;
  var prLoaded = false;
  var prFilter = 'open';

  var TYPES = {
    access: { label: 'Access to records', days: 30, ref: '164.524' },
    amendment: { label: 'Amendment of records', days: 60, ref: '164.526' },
    restriction: { label: 'Restriction request', days: null, ref: '164.522(a)' },
    confidential: { label: 'Confidential communication', days: null, ref: '164.522(b)' },
    complaint: { label: 'Complaint', days: null, ref: '164.530(d)' }
  };
  /* Each right has its own HIPAA mechanics, so each gets its own status
     pipeline rather than one borrowed set of labels stretched to cover all
     five. days: null means no statutory clock -- still logged and tracked,
     just never counted toward the Overdue KPI. */
  var ACCESS_STATUSES = ['Received', 'In progress', 'Fulfilled', 'Denied'];
  var AMENDMENT_STATUSES = ['Submitted', 'Under Review', 'Approved', 'Partially Approved', 'Denied', 'Completed'];
  var RESTRICTION_STATUSES = ['Received', 'Agreed', 'Declined', 'Terminated'];
  var CONFIDENTIAL_STATUSES = ['Received', 'Accommodated', 'Declined'];
  var COMPLAINT_STATUSES = ['Received', 'Under Investigation', 'Resolved', 'Escalated to HHS'];
  var CLOSED_STATUSES = ['Fulfilled', 'Denied', 'Completed', 'Declined', 'Terminated', 'Accommodated', 'Resolved', 'Escalated to HHS'];
  function statusesFor(type) {
    if (type === 'amendment') return AMENDMENT_STATUSES;
    if (type === 'restriction') return RESTRICTION_STATUSES;
    if (type === 'confidential') return CONFIDENTIAL_STATUSES;
    if (type === 'complaint') return COMPLAINT_STATUSES;
    return ACCESS_STATUSES;
  }
  var RECORD_TYPES = ['Demographics', 'Day 1 (ACE)', 'Examination', 'Daily Note', 'Billing', 'Other'];
  var FORMATS = ['Secure portal link', 'Paper copy', 'Email (encrypted)', 'Mail', 'In person'];
  var METHODS = ['In person', 'Phone', 'Email', 'Mail', 'Patient portal', 'Via attorney', 'Other'];
  var ID_METHODS = ['Photo ID in person', 'Known to staff', 'Verified by phone callback',
    'Portal login (authenticated)', 'Signed written request', 'Not yet verified'];
  var CONFIDENTIAL_PREFS = ['Phone only, do not mail', 'Email only, do not call',
    'Mail to alternate address only', 'Other — see notes'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function who() {
    var u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null;
    return (u && (u.displayName || u.username)) || 'Staff';
  }
  // Access Control itself is admin-only, so reaching this tab at all already
  // implies permission -- no separate section check needed underneath it.
  function can() { return true; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (m[2] + '/' + m[3] + '/' + m[1]) : '—';
  }
  function addDays(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }
  // The statutory deadline, including the single extension if one was taken.
  function dueDate(it) {
    var t = TYPES[it.type] || TYPES.access;
    if (t.days == null) return '';
    return addDays(it.received, t.days + (it.extended ? 30 : 0));
  }
  function daysLeft(it) {
    var due = dueDate(it);
    if (!due) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  }
  function isOpen(it) { return CLOSED_STATUSES.indexOf(it.status) === -1; }

  // ------------------------------ storage ------------------------------
  function prLoad() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/' + DOC_KEY).then(function (r) {
      prVersion = r.version || 0;
      var d = r.data || {};
      prItems = Array.isArray(d.items) ? d.items : [];
      prLoaded = true;
    }).catch(function () { prLoaded = true; });
  }
  function prSave() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/' + DOC_KEY, {
      method: 'PUT',
      body: JSON.stringify({ data: { items: prItems }, version: prVersion })
    }).then(function (r) { prVersion = r.version; }).catch(function (e) {
      toast((e && e.body && e.body.error) || 'Could not save — reload and try again', 'err');
      prVersion = (e && e.body && e.body.version) || prVersion;
      return prLoad().then(render);
    });
  }

  // ------------------------------ render -------------------------------
  function dueCell(it) {
    if (!isOpen(it)) {
      return '<span class="pr-pill done">Closed ' + esc(fmtDate(it.closedOn)) + '</span>';
    }
    var n = daysLeft(it);
    var due = esc(fmtDate(dueDate(it)));
    if (n === null) return '—';
    if (n < 0) return '<span class="pr-pill over">' + due + ' · ' + Math.abs(n) + 'd overdue</span>';
    if (n <= 7) return '<span class="pr-pill soon">' + due + ' · ' + n + 'd left</span>';
    return '<span class="pr-pill ok">' + due + ' · ' + n + 'd left</span>';
  }

  function render() {
    var mount = document.getElementById('patientRequestsMount');
    if (!mount) return;
    if (!prLoaded) { prLoad().then(render); return; }

    var all = prItems.slice();
    var open = all.filter(isOpen);
    var overdue = open.filter(function (i) { var n = daysLeft(i); return n !== null && n < 0; });
    var rows = (prFilter === 'all') ? all : (prFilter === 'overdue' ? overdue : open);
    rows.sort(function (a, b) {
      // Soonest deadline first while open; most recent first once closed.
      if (isOpen(a) && isOpen(b)) return String(dueDate(a)).localeCompare(String(dueDate(b)));
      return String(b.received || '').localeCompare(String(a.received || ''));
    });

    var h = '<div class="card"><div class="card-hd"><div class="card-ico ic-blue">PR</div><div class="card-title">Privacy Requests</div></div>'
      + '<div class="card-body">'
      + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:12px">Right of access (§164.524, 30 days), amendment (§164.526, 60 days), restriction and confidential-communication requests (§164.522), and privacy complaints (§164.530(d)). Access and amendment carry a hard deadline — the others are tracked to a documented outcome just as carefully, without a statutory clock.</div>'
      + '<div data-cs="'+__cs+'display:flex;justify-content:flex-end;margin:-4px 0 10px">'
        + '<button class="btn btn-primary btn-sm" data-onclick="prOpenAdd()">Log a request</button>'
      + '</div>';

    h += '<div class="dash-kpi-grid" data-cs="'+__cs+'grid-template-columns:repeat(3,minmax(0,1fr))">'
      + '<div class="dash-kpi k-blue"><span class="dash-kpi-accent"></span>'
        + '<div class="dash-kpi-top"><span class="dash-kpi-label">Open requests</span></div>'
        + '<div class="dash-kpi-value">' + open.length + '</div>'
        + '<div class="dash-kpi-sub">awaiting a response</div></div>'
      + '<div class="dash-kpi ' + (overdue.length ? 'k-amber' : 'k-green') + '"><span class="dash-kpi-accent"></span>'
        + '<div class="dash-kpi-top"><span class="dash-kpi-label">Overdue</span></div>'
        + '<div class="dash-kpi-value' + (overdue.length ? ' is-amber' : '') + '">' + overdue.length + '</div>'
        + '<div class="dash-kpi-sub">' + (overdue.length ? 'past the statutory deadline' : 'nothing past deadline') + '</div></div>'
      + '<div class="dash-kpi k-indigo"><span class="dash-kpi-accent"></span>'
        + '<div class="dash-kpi-top"><span class="dash-kpi-label">Total logged</span></div>'
        + '<div class="dash-kpi-value">' + all.length + '</div>'
        + '<div class="dash-kpi-sub">all time</div></div>'
      + '</div>';

    h += '<div class="sdiv" data-cs="'+__cs+'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px">'
        + '<span class="msg-tpl-seg">'
          + ['open', 'overdue', 'all'].map(function (f) {
              return '<button type="button" class="msg-tpl-seg-btn' + (prFilter === f ? ' active' : '')
                + '" data-onclick="prSetFilter(\'' + f + '\')">' + f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
            }).join('')
        + '</span>'
      + '</div>';

    if (!rows.length) {
      h += '<div class="pld-empty-state">'
        + (prFilter === 'overdue' ? 'Nothing is overdue.' : 'No requests logged yet. '
          + 'Log one whenever a patient asks for a copy of their records or asks for a correction.')
        + '</div>';
    } else {
      h += '<div class="rl-table-wrap"><table class="rl-table" data-cs="'+__cs+'min-width:1080px"><thead><tr>'
        + '<th>Received</th><th>Patient</th><th>Request</th><th>What was asked for</th>'
        + '<th>Deadline</th><th>Status</th><th>Handled by</th><th></th></tr></thead><tbody>';
      rows.forEach(function (it) {
        var t = TYPES[it.type] || TYPES.access;
        h += '<tr>'
          + '<td>' + esc(fmtDate(it.received)) + '</td>'
          + '<td>' + esc(it.patientName || '—') + '</td>'
          + '<td>' + esc(t.label) + (it.extended ? ' <span class="pr-pill soon">extended</span>' : '') + '</td>'
          + '<td class="rl-ellipsis" title="' + esc(it.what) + '">' + esc(it.what || '—') + '</td>'
          + '<td>' + dueCell(it) + '</td>'
          + '<td>' + esc(it.status || '—') + '</td>'
          + '<td>' + esc(it.by || '—') + '</td>'
          + '<td>' + (can('pr.update')
              ? '<button class="btn btn-ghost btn-sm" data-onclick="prOpenUpdate(\'' + esc(it.id) + '\')">Update</button>' : '')
            + '</td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    mount.innerHTML = h;
  }

  function prSetFilter(f) { prFilter = f; render(); }

  // ------------------------------ add ----------------------------------
  function patientOptions(sel) {
    var list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    var name = (typeof window.naturalPatientName === 'function')
      ? window.naturalPatientName : function (p) { return (p.demographics || {}).firstName || p.id; };
    return '<option value="">— Select patient —</option>' + list.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(name(p)) + '</option>';
    }).join('');
  }
  function optList(list, cur) {
    return list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('');
  }

  function prOpenAdd() {
    if (!can('pr.add')) { toast('You do not have permission to log requests', 'err'); return; }
    var body = document.getElementById('prAddBody');
    if (!body) return;
    body.innerHTML = '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
      + '<div class="fg"><label>Date received<span class="req">*</span></label>'
        + '<input type="date" id="prReceived" value="' + todayISO() + '"></div>'
      + '<div class="fg"><label>Patient<span class="req">*</span></label>'
        + '<select id="prPatient">' + patientOptions('') + '</select></div>'
      + '<div class="fg"><label>Type of request<span class="req">*</span></label>'
        + '<select id="prType" data-onchange="prTypeChanged()">'
          + '<option value="access">Access to records — 30 days (§164.524)</option>'
          + '<option value="amendment">Amendment of records — 60 days (§164.526)</option>'
          + '<option value="restriction">Restriction request (§164.522(a))</option>'
          + '<option value="confidential">Confidential communication (§164.522(b))</option>'
          + '<option value="complaint">Complaint (§164.530(d))</option>'
        + '</select></div>'
      + '<div class="fg"><label>Deliver as</label><select id="prFormat">' + optList(FORMATS, 'Secure portal link') + '</select></div>'
      + '</div>'
      + '<div class="small-muted" id="prTypeHint" data-cs="'+__cs+'margin-top:8px">Deadline: 30 days from today, one 30-day extension possible.</div>'
      + '<div id="prTypeExtra" data-cs="'+__cs+'margin-top:10px"></div>'
      + '<div class="fg" data-cs="'+__cs+'margin-top:10px"><label>What was asked for<span class="req">*</span></label>'
        + '<input type="text" id="prWhat" placeholder="e.g. Complete record from 01/2026 onwards"></div>'
      + '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
        + '<div class="fg"><label>How the request arrived</label><select id="prMethod">' + optList(METHODS, 'In person') + '</select></div>'
        + '<div class="fg"><label>Assigned to</label>'
          + '<input type="text" id="prOwner" placeholder="Privacy officer handling this" value="' + esc(who()) + '"></div>'
      + '</div>'
      /* Identity verification is its own field rather than a note: releasing a
         record to someone who has not been identified is the failure mode this
         module exists to prevent. */
      + '<div class="fg"><label>Identity verified by</label><select id="prIdMethod">' + optList(ID_METHODS, 'Photo ID in person') + '</select></div>'
      + '<div class="fg"><label>Notes</label><textarea id="prNotes" rows="2" placeholder="Anything else worth recording about this request"></textarea></div>'
      + '<div id="prAddErr" data-cs="'+__cs+'display:none;color:var(--red);font-size:12px;font-weight:700;margin-top:8px"></div>';
    document.getElementById('prAddModal').classList.add('show');
    prTypeChanged();
  }
  function prTypeChanged() {
    var sel = document.getElementById('prType');
    var hint = document.getElementById('prTypeHint');
    var extra = document.getElementById('prTypeExtra');
    if (!sel) return;
    var type = sel.value;
    var t = TYPES[type] || TYPES.access;
    if (hint) {
      hint.textContent = (t.days == null)
        ? 'No fixed statutory deadline for this request — respond within a reasonable time and record the outcome.'
        : 'Deadline: ' + t.days + ' days from today, one 30-day extension possible.';
    }
    if (extra) {
      if (type === 'restriction') {
        extra.innerHTML = '<label class="plain-check"><input type="checkbox" id="prMandatory"> '
          + 'Patient paid out of pocket in full — CTG must agree to this restriction (§164.522(a)(1)(vi))</label>';
      } else if (type === 'confidential') {
        extra.innerHTML = '<div class="fg"><label>Preferred contact arrangement</label>'
          + '<select id="prConfidentialPref">' + optList(CONFIDENTIAL_PREFS, CONFIDENTIAL_PREFS[0]) + '</select></div>';
      } else {
        extra.innerHTML = '';
      }
    }
  }
  function prCloseAdd() {
    var m = document.getElementById('prAddModal'); if (m) m.classList.remove('show');
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  function prSubmitAdd() {
    var err = document.getElementById('prAddErr');
    function fail(m) { if (err) { err.textContent = m; err.style.display = ''; } }
    var received = val('prReceived');
    var patientId = val('prPatient');
    var what = val('prWhat');
    if (!received) return fail('The date the request was received is required — it starts the clock.');
    if (!patientId) return fail('Select the patient making the request.');
    if (!what) return fail('Describe what was asked for.');

    var list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    var p = list.filter(function (x) { return x.id === patientId; })[0];
    var pname = (p && typeof window.naturalPatientName === 'function') ? window.naturalPatientName(p) : '';

    prItems.push({
      id: 'pr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      received: received,
      patientId: patientId,
      patientName: pname,
      type: val('prType') || 'access',
      // Amendment starts its own pipeline at 'Submitted'; access keeps 'Received'.
      status: (val('prType') === 'amendment') ? 'Submitted' : 'Received',
      format: val('prFormat'),
      requestMethod: val('prMethod'),
      idVerifiedBy: val('prIdMethod'),
      owner: val('prOwner') || who(),
      what: what,
      notes: val('prNotes'),
      mandatoryRestriction: !!(document.getElementById('prMandatory') || {}).checked,
      confidentialPreference: val('prConfidentialPref'),
      extended: false,
      by: who(),
      loggedAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), by: who(), note: 'Request logged' }]
    });
    prCloseAdd();
    render();
    prSave().then(function () { toast('Request logged'); });
  }

  // ------------------------------ update -------------------------------
  var prEditingId = null;
  function byId(id) { return prItems.filter(function (x) { return x.id === id; })[0]; }

  function prOpenUpdate(id) {
    if (!can('pr.update')) { toast('You do not have permission to update requests', 'err'); return; }
    var it = byId(id);
    if (!it) return;
    prEditingId = id;
    var t = TYPES[it.type] || TYPES.access;
    var body = document.getElementById('prUpdBody');
    var isAmendment = it.type === 'amendment';
    var isComplaint = it.type === 'complaint';
    var hasClock = t.days != null;
    var deadlineLine = hasClock
      ? (' · deadline ' + esc(fmtDate(dueDate(it))) + ' (§' + esc(t.ref) + ', ' + t.days + '-day clock)')
      : (' · no statutory deadline (§' + esc(t.ref) + ')');
    body.innerHTML = '<div class="dn-lock" data-cs="'+__cs+'display:flex;margin-bottom:12px">'
        + '<div class="dn-lock-main"><div>'
          + '<div class="dn-lock-title">' + esc(t.label) + ' — ' + esc(it.patientName || '') + '</div>'
          + '<div class="dn-lock-sub">Received ' + esc(fmtDate(it.received)) + deadlineLine + '</div>'
        + '</div></div></div>'
      + (it.mandatoryRestriction
          ? '<div class="small-muted" data-cs="'+__cs+'margin-bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(224,52,42,.08);color:var(--red);font-weight:700">'
            + 'Patient paid out of pocket in full — CTG is required to agree to this restriction (§164.522(a)(1)(vi)).</div>'
          : '')
      + (it.confidentialPreference
          ? '<div class="small-muted" data-cs="'+__cs+'margin-bottom:10px">Preferred contact arrangement: ' + esc(it.confidentialPreference) + '</div>'
          : '')
      + '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
        + '<div class="fg"><label>Status</label><select id="prStatus" data-onchange="prStatusChanged()">' + optList(statusesFor(it.type), it.status) + '</select></div>'
        + '<div class="fg"><label>Date closed</label><input type="date" id="prClosed" value="' + esc(it.closedOn || '') + '"></div>'
      + '</div>'
      + (hasClock
          /* The extension only counts if the patient was told why, inside the
             original window -- so the reason is captured, not assumed. Only
             Access/Amendment carry the statutory 30-day extension concept. */
          ? '<label class="plain-check" data-cs="'+__cs+'margin:8px 0 0"><input type="checkbox" id="prExtended" data-onchange="prExtendedChanged()"' + (it.extended ? ' checked' : '') + '> '
            + 'One 30-day extension taken (patient must be told in writing)</label>'
            + '<div class="fg" id="prExtWrap" data-cs="'+__cs+'margin-top:8px;display:' + (it.extended ? '' : 'none') + '">'
            + '<label>Reason given to the patient for the extension</label>'
            + '<textarea id="prExtReason" rows="2" placeholder="Written notice must reach the patient within the original period">' + esc(it.extensionReason || '') + '</textarea></div>'
          : '')
      + '<div class="g2" data-cs="'+__cs+'row-gap:10px;margin-top:10px">'
        + '<div class="fg"><label>Delivered as</label><select id="prDelivered">' + optList(FORMATS, it.format) + '</select></div>'
        + '<div class="fg"><label>Assigned to</label><input type="text" id="prOwner2" value="' + esc(it.owner || '') + '"></div>'
      + '</div>'
      // Approving (or partially approving) an amendment is not real until the
      // amendment is actually attached to the record it corrects - HHS
      // guidance is explicit that an approved amendment must be associated
      // with the affected record, not just noted in a tracker.
      + '<div id="prRecordBlock" data-cs="'+__cs+'display:none;margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--s2)">'
        + '<div data-cs="'+__cs+'font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Affected record</div>'
        + '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
          + '<div class="fg"><label>Record type</label><select id="prRecordType">' + optList(RECORD_TYPES, it.affectedRecordType) + '</select></div>'
          + '<div class="fg"><label>Which record</label><input type="text" id="prRecordRef" placeholder="e.g. Daily Note 07/22/2026" value="' + esc(it.affectedRecordRef || '') + '"></div>'
        + '</div>'
        + '<div class="small-muted" data-cs="'+__cs+'margin-top:4px">Required to approve an amendment, or to deny one — the outcome has to be tied to the specific record, not left as a bare status change.</div>'
      + '</div>'
      + '<div id="prDenialBlock" data-cs="'+__cs+'display:none;margin-top:10px">'
        + '<div class="fg"><label>' + (isComplaint ? 'Investigation outcome / resolution notes' : (isAmendment || it.type === 'access' ? 'Reason for denial' : 'Reason this was declined')) + '</label>'
        + '<textarea id="prDenial" rows="2" placeholder="' + (isComplaint ? 'What was found and how it was resolved' : 'Required for this outcome') + '">' + esc(it.denialReason || '') + '</textarea></div>'
        + (isComplaint
            ? '<label class="plain-check" data-cs="'+__cs+'margin:4px 0 0"><input type="checkbox" id="prNoRetaliation"' + (it.noRetaliationConfirmed ? ' checked' : '') + '> Confirmed: no retaliation taken against the person who complained</label>'
            : '<label class="plain-check" data-cs="'+__cs+'margin:4px 0 0"><input type="checkbox" id="prDenialWritten"' + (it.writtenDenialSent ? ' checked' : '') + '> Written notice sent to the patient</label>')
        + (isAmendment
            ? '<label class="plain-check" data-cs="'+__cs+'margin:8px 0 0"><input type="checkbox" id="prDisagree" data-onchange="prDisagreeChanged()"' + (it.disagreementSubmitted ? ' checked' : '') + '> '
              + 'Patient submitted a statement of disagreement</label>'
              + '<div class="fg" id="prDisagreeWrap" data-cs="'+__cs+'margin-top:8px;display:' + (it.disagreementSubmitted ? '' : 'none') + '"><label>Statement of disagreement</label>'
              + '<textarea id="prDisagreeText" rows="2" placeholder="Recorded and associated with the disputed record">' + esc(it.disagreementText || '') + '</textarea></div>'
            : '')
      + '</div>'
      + '<div class="fg" data-cs="'+__cs+'margin-top:10px"><label>Add a note to the history</label>'
        + '<textarea id="prNote" rows="2" placeholder="e.g. Records compiled and sent by secure link"></textarea></div>'
      + (Array.isArray(it.history) && it.history.length
          ? '<div data-cs="'+__cs+'margin-top:10px"><label data-cs="'+__cs+'font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--muted);text-transform:uppercase">History</label>'
            + '<div class="dash-appt-list" data-cs="'+__cs+'margin-top:6px">'
            + it.history.slice().reverse().map(function (hh) {
                return '<div class="dash-appt-row" data-cs="'+__cs+'cursor:default">'
                  + '<span class="dash-appt-main"><span class="dash-appt-name">' + esc(hh.note) + '</span>'
                  + '<span class="dash-recent-sub">' + esc(hh.by) + ' · ' + esc(new Date(hh.at).toLocaleString()) + '</span></span></div>';
              }).join('')
            + '</div></div>'
          : '')
      + '<div id="prUpdErr" data-cs="'+__cs+'display:none;color:var(--red);font-size:12px;font-weight:700;margin-top:8px"></div>';
    document.getElementById('prUpdModal').classList.add('show');
    prStatusChanged();
    prExtendedChanged();
  }
  function prStatusChanged() {
    var it = byId(prEditingId);
    var type = it ? it.type : 'access';
    var status = (document.getElementById('prStatus') || {}).value || '';
    var recBlock = document.getElementById('prRecordBlock');
    var denBlock = document.getElementById('prDenialBlock');
    if (recBlock) recBlock.style.display = (type === 'amendment' && (status === 'Approved' || status === 'Partially Approved' || status === 'Denied')) ? '' : 'none';
    var showOutcome = (type === 'access' || type === 'amendment') ? (status === 'Denied')
      : (type === 'restriction' || type === 'confidential') ? (status === 'Declined')
      : (type === 'complaint') ? (status === 'Resolved' || status === 'Escalated to HHS')
      : false;
    if (denBlock) denBlock.style.display = showOutcome ? '' : 'none';
  }
  function prExtendedChanged() {
    var box = document.getElementById('prExtended');
    var wrap = document.getElementById('prExtWrap');
    if (wrap) wrap.style.display = (box && box.checked) ? '' : 'none';
  }
  function prDisagreeChanged() {
    var box = document.getElementById('prDisagree');
    var wrap = document.getElementById('prDisagreeWrap');
    if (wrap) wrap.style.display = (box && box.checked) ? '' : 'none';
  }
  function prCloseUpdate() {
    prEditingId = null;
    var m = document.getElementById('prUpdModal'); if (m) m.classList.remove('show');
  }
  function prSubmitUpdate() {
    var it = byId(prEditingId);
    if (!it) { prCloseUpdate(); return; }
    var err = document.getElementById('prUpdErr');
    function fail(msg) { if (err) { err.textContent = msg; err.style.display = ''; } }
    var status = val('prStatus');
    var isAmendment = it.type === 'amendment';
    var isComplaint = it.type === 'complaint';
    var isRestriction = it.type === 'restriction';
    var denial = val('prDenial');
    var recordType = val('prRecordType');
    var recordRef = val('prRecordRef');

    // A mandatory restriction (the patient paid out of pocket in full) is not
    // discretionary -- CTG must agree to it, so declining it is not a valid
    // outcome regardless of who is updating the request.
    if (isRestriction && it.mandatoryRestriction && status === 'Declined') {
      return fail('This restriction is mandatory because the patient paid out of pocket in full \u2014 it cannot be declined (\u00a7164.522(a)(1)(vi)).');
    }
    /* A denial/decline without a stated reason is not a lawful one, so it
       cannot be recorded as one; a complaint needs its outcome documented
       the same way before it can be closed. */
    var needsOutcome = (status === 'Denied') || (status === 'Declined')
      || (isComplaint && (status === 'Resolved' || status === 'Escalated to HHS'));
    if (needsOutcome && !denial) {
      return fail(isComplaint ? 'Record the investigation outcome before closing this out.' : 'This outcome needs a stated reason.');
    }
    if ((document.getElementById('prExtended') || {}).checked && !val('prExtReason')) {
      return fail('An extension is only valid if the patient is told why \u2014 record the reason.');
    }
    // HHS guidance: an approved amendment has to be attached to the record it
    // corrects, and denial documentation has to reference the disputed
    // record too - neither outcome is real as a bare status change.
    if (isAmendment && (status === 'Approved' || status === 'Partially Approved' || status === 'Denied')) {
      if (!recordType || !recordRef) return fail('Link this outcome to the affected record — record type and which record are both required.');
    }

    var note = val('prNote');
    var closed = val('prClosed');
    if (CLOSED_STATUSES.indexOf(status) !== -1 && !closed) closed = todayISO();

    it.status = status;
    it.denialReason = denial;
    it.extended = !!(document.getElementById('prExtended') || {}).checked;
    it.extensionReason = it.extended ? val('prExtReason') : '';
    it.deliveredAs = val('prDelivered');
    if (val('prOwner2')) it.owner = val('prOwner2');
    it.closedOn = CLOSED_STATUSES.indexOf(status) !== -1 ? closed : '';
    it.affectedRecordType = recordType;
    it.affectedRecordRef = recordRef;
    it.writtenDenialSent = !!(document.getElementById('prDenialWritten') || {}).checked;
    it.noRetaliationConfirmed = !!(document.getElementById('prNoRetaliation') || {}).checked;
    if (isAmendment) {
      it.disagreementSubmitted = !!(document.getElementById('prDisagree') || {}).checked;
      it.disagreementText = it.disagreementSubmitted ? val('prDisagreeText') : '';
    }
    it.history = Array.isArray(it.history) ? it.history : [];
    var autoNote = 'Status set to ' + status;
    if ((status === 'Approved' || status === 'Partially Approved') && recordRef) autoNote += ' — linked to ' + recordType + ' (' + recordRef + ')';
    if (status === 'Denied' && isAmendment && it.disagreementSubmitted) autoNote += ' — statement of disagreement on file';
    it.history.push({
      at: new Date().toISOString(),
      by: who(),
      note: note || autoNote
    });
    prCloseUpdate();
    render();
    prSave().then(function () { toast('Request updated'); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var a = document.getElementById('prAddModal');
    var u = document.getElementById('prUpdModal');
    if (a && a.classList.contains('show')) prCloseAdd();
    if (u && u.classList.contains('show')) prCloseUpdate();
  });

  window.renderPatientRequests = render;
  window.ctgPrivacyRequestsRealtime = function () { prLoaded = false; prLoad().then(render); };
  window.prSetFilter = prSetFilter;
  window.prOpenAdd = prOpenAdd;
  window.prCloseAdd = prCloseAdd;
  window.prTypeChanged = prTypeChanged;
  window.prStatusChanged = prStatusChanged;
  window.prExtendedChanged = prExtendedChanged;
  window.prDisagreeChanged = prDisagreeChanged;
  window.prSubmitAdd = prSubmitAdd;
  window.prOpenUpdate = prOpenUpdate;
  window.prCloseUpdate = prCloseUpdate;
  window.prSubmitUpdate = prSubmitUpdate;
})();
