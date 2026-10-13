(function () {
  'use strict';

  const RL_PAGE_SIZE_KEY = 'ctg_reglist_pagesize_v1';
  const RL_LOCK_KEY = 'ctg_reglist_lockname_v1';
  const RL_PREFS_KEY = 'ctg_reglist_prefs_v1';   // per-account view prefs (filters + sort)

  const RL_SHOW_WITH = ['All Patients', 'Pending Day 1', 'Intake Form Not Sent', 'Intake Form Sent (Not Completed)',
    'Intake Form Completed', 'Has Upcoming Appointment', 'No Upcoming Appointment'];

  const RL_COLS = [
    { key: 'firstName', label: 'First Name', filter: 'text' },
    { key: 'lastName', label: 'Last Name', filter: 'text' },
    { key: 'account', label: 'Account#', filter: 'text' },
    { key: 'dob', label: 'Date Of Birth', filter: 'text' },
    { key: 'gender', label: 'Gender', filter: 'select', options: ['Male', 'Female', 'Other'] },
    { key: 'identity', label: 'Identity#', filter: 'text' },
    { key: 'photo', label: 'Photo', filter: 'none' },
    { key: 'email', label: 'Email Id', filter: 'text' },
    { key: 'prevAppt', label: 'Prev. Appt', filter: 'text' },
    { key: 'nextAppt', label: 'Next Appt', filter: 'text' },
    { key: 'eligibility', label: 'Eligibility Status', filter: 'none' },
    { key: 'intakeStatus', label: 'Intake Form Status', filter: 'select', options: ['Intake Form Opened', 'Intake Form Sent', 'Intake Form Completed', 'Not Sent'] },
    { key: 'insuranceCard', label: 'Insurance Card Saved', filter: 'none' },
    { key: 'address', label: 'Address', filter: 'text' },
    { key: 'city', label: 'City', filter: 'text' },
    { key: 'state', label: 'State', filter: 'text' },
    { key: 'zip', label: 'Zip Code', filter: 'text' },
    { key: 'phone', label: 'Phone No.', filter: 'text' },
    { key: 'mobile', label: 'Mobile No.', filter: 'text' },
    { key: 'primaryPayer', label: 'Primary Payer', filter: 'select', options: ['Attorney', 'Self Pay'] },
    { key: 'primaryPolicy', label: 'Primary Policy#', filter: 'text' }
  ];

  let rlColFilters = {};
  let rlShowWith = 'All Patients';
  let rlPaymentCase = 'Default Payment Case';
  let rlTagFilter = '';           // '' | 'missing' | 'verify'
  let rlLockName = false;
  let rlPage = 1;
  let rlPageSize = 50;
  let rlSortKey = '';         // '' = default order (newest first); else a RL_COLS key
  let rlSortDir = 1;          // 1 = ascending, -1 = descending
  let rlPrefsLoaded = false;  // load saved view prefs once, when the page first opens

  function rlEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rlToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function rlDash(v) { return v == null || v === '' ? '<span class="rl-dash">—</span>' : rlEsc(v); }

  function rlInit() {
    try { rlPageSize = parseInt(localStorage.getItem(RL_PAGE_SIZE_KEY), 10) || 50; } catch (e) {}
    try { rlLockName = localStorage.getItem(RL_LOCK_KEY) === '1'; } catch (e) {}
  }
  rlInit();

  // ---- Remembered view preferences (filters + sort), scoped per account -------
  // Purely a view convenience: nothing here touches patient data or any write.
  function rlPrefsKey() {
    let uid = '';
    try {
      const u = (typeof ctgCurrentUser === 'function') ? ctgCurrentUser() : null;
      if (u && u.id != null) uid = String(u.id);
    } catch (e) {}
    return RL_PREFS_KEY + (uid ? ':' + uid : '');
  }
  function rlSavePrefs() {
    try {
      localStorage.setItem(rlPrefsKey(), JSON.stringify({
        colFilters: rlColFilters, showWith: rlShowWith, paymentCase: rlPaymentCase,
        tag: rlTagFilter, sortKey: rlSortKey, sortDir: rlSortDir
      }));
    } catch (e) {}
  }
  function rlLoadPrefs() {
    try {
      const raw = localStorage.getItem(rlPrefsKey());
      if (!raw) return;
      const p = JSON.parse(raw) || {};
      if (p.colFilters && typeof p.colFilters === 'object') rlColFilters = p.colFilters;
      if (typeof p.showWith === 'string' && RL_SHOW_WITH.indexOf(p.showWith) !== -1) rlShowWith = p.showWith;
      if (typeof p.paymentCase === 'string') rlPaymentCase = p.paymentCase;
      if (p.tag === '' || p.tag === 'missing' || p.tag === 'verify') rlTagFilter = p.tag;
      if (typeof p.sortKey === 'string' && (p.sortKey === '' || RL_COLS.some(c => c.key === p.sortKey))) rlSortKey = p.sortKey;
      if (p.sortDir === 1 || p.sortDir === -1) rlSortDir = p.sortDir;
    } catch (e) {}
  }
  // Sort the already-filtered rows in place. Blanks always sink to the bottom so
  // a sort never hides real values behind a wall of " - ".
  function rlSortRows(rows) {
    if (!rlSortKey) return rows;
    const key = rlSortKey, dir = rlSortDir;
    rows.sort((a, b) => {
      const as = (a[key] == null ? '' : String(a[key]));
      const bs = (b[key] == null ? '' : String(b[key]));
      if (as === '' && bs !== '') return 1;
      if (bs === '' && as !== '') return -1;
      return as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
    return rows;
  }

  function rlAccountNo(p) {
    const stored = p && p.billing && p.billing.accountNo;
    if (stored) return String(stored);
    let h = 5381; const s = 'acct' + (p ? p.id : '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return String(1000 + (h % 9000));
  }

  function rlApptStamp(a) {
    if (!a) return '';
    const d = new Date(a.date + 'T00:00:00');
    const mmddyyyy = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
    const who = (typeof naturalPatientName === 'function' && a.provider) ? a.provider : 'Nicholas Grande';
    return mmddyyyy + ' ' + (typeof apptFormat12h === 'function' ? apptFormat12h(a.start).replace(' ', '') : a.start) + ' (' + who + ')';
  }
  function rlPatientAppts(pid) {
    if (typeof ctgAppointments === 'undefined') return [];
    return ctgAppointments.filter(a => a.patientId === pid).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }
  function rlPrevNextAppt(pid) {
    const now = new Date();
    const nowKey = (typeof apptISODate === 'function' ? apptISODate(now) : now.toISOString().slice(0, 10)) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const appts = rlPatientAppts(pid);
    let prev = null, next = null;
    appts.forEach(a => {
      const key = a.date + ' ' + a.start;
      if (key <= nowKey) prev = a; else if (!next) next = a;
    });
    return { prev, next };
  }
  function rlIntakeStatus(p) {
    if (p.formSubmission) return 'Intake Form Completed';
    if (Array.isArray(p.invites) && p.invites.length) {
      const pending = p.invites.some(inv => !inv.completedAt);
      return pending ? 'Intake Form Sent' : 'Intake Form Completed';
    }
    return 'Not Sent';
  }
  function rlPrimaryPayer(d) { return d.lawFirm ? 'Attorney' : 'Self Pay'; }
  function rlIsMissing(p) {
    const d = p.demographics || {};
    return !d.dob || !d.gender || !d.email || !d.mobile || !d.addressLine;
  }

  function rlRow(p) {
    const d = p.demographics || {};
    const cityStateZip = String(d.cityStateZip || '');
    const czMatch = cityStateZip.match(/^(.*?),\s*([A-Za-z .]+)\s+(\d{5}(-\d{4})?)$/);
    const city = czMatch ? czMatch[1].trim() : cityStateZip;
    const state = czMatch ? czMatch[2].trim() : '';
    const zip = czMatch ? czMatch[3].trim() : '';
    const { prev, next } = rlPrevNextAppt(p.id);
    return {
      id: p.id,
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      account: rlAccountNo(p),
      dob: d.dob || '',
      gender: d.gender || '',
      identity: '',
      photo: '',
      email: d.email || '',
      prevAppt: rlApptStamp(prev),
      nextAppt: rlApptStamp(next),
      eligibility: '',
      intakeStatus: rlIntakeStatus(p),
      insuranceCard: 'No Card Saved',
      address: [d.addressLine, d.addressLine2].filter(Boolean).join(', '),
      city: city, state: state, zip: zip,
      phone: d.mobile || '',
      mobile: d.mobile || '',
      primaryPayer: rlPrimaryPayer(d),
      primaryPolicy: '',
      _missing: rlIsMissing(p),
      // Same rule as the Day 1 queue: a stale flag on a chart that already
      // has a Day 1 must not keep showing it as pending.
      _pendingAce: !!(p.pendingAce && !p.ace),
      _hasUpcoming: !!next,
      _createdAt: p.createdAt || ''
    };
  }

  function rlAllRows() {
    const list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    return list.map(rlRow).sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)));
  }

  function rlFilteredRows() {
    let rows = rlAllRows();
    if (rlShowWith === 'Pending Day 1') rows = rows.filter(r => r._pendingAce);
    else if (rlShowWith === 'Intake Form Not Sent') rows = rows.filter(r => r.intakeStatus === 'Not Sent');
    else if (rlShowWith === 'Intake Form Sent (Not Completed)') rows = rows.filter(r => r.intakeStatus === 'Intake Form Sent');
    else if (rlShowWith === 'Intake Form Completed') rows = rows.filter(r => r.intakeStatus === 'Intake Form Completed');
    else if (rlShowWith === 'Has Upcoming Appointment') rows = rows.filter(r => r._hasUpcoming);
    else if (rlShowWith === 'No Upcoming Appointment') rows = rows.filter(r => !r._hasUpcoming);

    if (rlTagFilter === 'missing') rows = rows.filter(r => r._missing);
    else if (rlTagFilter === 'verify') rows = rows.filter(r => r._pendingAce);

    Object.keys(rlColFilters).forEach(key => {
      const needle = String(rlColFilters[key] || '').trim().toLowerCase();
      if (!needle) return;
      rows = rows.filter(r => String(r[key] || '').toLowerCase().indexOf(needle) !== -1);
    });
    return rows;
  }

  // ============================ render ============================
  function renderRegistrationList() {
    const mount = document.getElementById('regListMount');
    if (!mount) return;
    if (!rlPrefsLoaded) { rlLoadPrefs(); rlPrefsLoaded = true; }
    if (rlPage < 1) rlPage = 1;
    mount.innerHTML = rlShellHTML();
    rlRenderTable();
  }

  function rlShellHTML() {
    const showWithOpts = RL_SHOW_WITH.map(o => '<option value="' + rlEsc(o) + '"' + (o === rlShowWith ? ' selected' : '') + '>' + rlEsc(o) + '</option>').join('');
    const caseOpts = ['Default Payment Case'].concat((typeof APPT_CFG_PAYER_CASES !== 'undefined' ? APPT_CFG_PAYER_CASES : []))
      .map(o => '<option value="' + rlEsc(o) + '"' + (o === rlPaymentCase ? ' selected' : '') + '>' + rlEsc(o) + '</option>').join('');

    const total = rlAllRows().length;
    return '<div class="rl-page">'
      + '<div class="rl-header">'
        + '<div class="rl-header-titles"><div class="rl-header-title">Registration List</div><div class="rl-header-sub">' + total + ' patient' + (total === 1 ? '' : 's') + ' on file</div></div>'
        + '<div class="rl-tags"><button type="button" class="rl-tag rl-tag-missing' + (rlTagFilter === 'missing' ? ' active' : '') + '" data-onclick="rlSetTag(\'missing\')">Missing</button><button type="button" class="rl-tag rl-tag-verify' + (rlTagFilter === 'verify' ? ' active' : '') + '" data-onclick="rlSetTag(\'verify\')">Verify</button></div>'
      + '</div>'
      + '<div class="rl-toolbar-card">'
        + '<div class="rl-toolbar-row">'
          + '<label class="rl-lock"><span>Lock Patient Name Column</span><button type="button" class="rl-switch' + (rlLockName ? ' on' : '') + '" data-onclick="rlToggleLock()"><i></i></button></label>'
          + '<span class="rl-toolbar-div"></span>'
          + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="rlToast(\'Column order is fixed in this portal.\')">Save Column Order</button>'
          + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="rlClearFilters()">Clear Filters</button>'
          + '<span class="rl-toolbar-spacer"></span>'
          + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="rlExport(false)">Export Current Page</button>'
          + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="rlExport(true)">Export All Data</button>'
        + '</div>'
        + '<div class="rl-toolbar-row rl-toolbar-row-2">'
          + '<label class="rl-special"><span class="rl-special-kicker">Special Filters</span><span class="rl-special-lbl">Show Patients With</span><select data-onchange="rlSetShowWith(this.value)">' + showWithOpts + '</select></label>'
          + '<label class="rl-special"><span class="rl-special-kicker">Payment Case</span><span class="rl-special-lbl">Show By</span><select data-onchange="rlSetPaymentCase(this.value)">' + caseOpts + '</select></label>'
        + '</div>'
      + '</div>'
      + '<div class="rl-table-wrap"><table class="rl-table" id="rlTable"></table></div>'
      + '<div class="rl-pagebar" id="rlPageBar"></div>'
      + '</div>';
  }

  function rlColFilterControl(col) {
    if (col.filter === 'none') return '<th></th>';
    if (col.filter === 'select') {
      const opts = ['<option value="">All</option>'].concat(col.options.map(o => '<option value="' + rlEsc(o) + '"' + (rlColFilters[col.key] === o ? ' selected' : '') + '>' + rlEsc(o) + '</option>'));
      return '<th><select data-onchange="rlSetColFilter(\'' + col.key + '\',this.value)">' + opts.join('') + '</select></th>';
    }
    return '<th><input type="text" value="' + rlEsc(rlColFilters[col.key] || '') + '" data-oninput="rlSetColFilter(\'' + col.key + '\',this.value)"></th>';
  }

  function rlRenderTable() {
    const table = document.getElementById('rlTable');
    if (!table) return;
    const all = rlSortRows(rlFilteredRows());
    const totalPages = Math.max(1, Math.ceil(all.length / rlPageSize));
    if (rlPage > totalPages) rlPage = totalPages;
    const start = (rlPage - 1) * rlPageSize;
    const pageRows = all.slice(start, start + rlPageSize);

    let head = '<thead><tr>';
    RL_COLS.forEach((c, i) => {
      const cls = ['rl-th'];
      if (rlLockName && i < 2) cls.push('rl-sticky');
      const sortable = c.filter !== 'none';   // the always-" - " columns aren't worth sorting
      if (sortable) {
        cls.push('rl-sortable');
        const active = rlSortKey === c.key;
        if (active) cls.push('rl-sorted');
        const ind = active ? (rlSortDir === 1 ? '▲' : '▼') : '';
        head += '<th class="' + cls.join(' ') + '" data-onclick="rlSetSort(\'' + c.key + '\')" title="Sort by ' + rlEsc(c.label) + '">'
          + '<span class="rl-th-lbl">' + rlEsc(c.label) + '</span><span class="rl-sort-ind">' + ind + '</span></th>';
      } else {
        head += '<th class="' + cls.join(' ') + '">' + rlEsc(c.label) + '</th>';
      }
    });
    head += '</tr><tr class="rl-filter-row">';
    RL_COLS.forEach((c, i) => { head += rlColFilterControl(c).replace('<th>', '<th' + (rlLockName && i < 2 ? ' class="rl-sticky"' : '') + '>'); });
    head += '</tr></thead>';

    let body = '<tbody>';
    if (!pageRows.length) {
      body += '<tr><td class="rl-empty" colspan="' + RL_COLS.length + '">No patients match the current filters.</td></tr>';
    } else {
      pageRows.forEach(r => {
        body += '<tr>'
          + '<td class="rl-name-cell' + (rlLockName ? ' rl-sticky' : '') + '"><a data-onclick="rlEditPatient(\'' + r.id + '\')">' + rlEsc(r.firstName || '(No name)') + '</a></td>'
          + '<td class="' + (rlLockName ? 'rl-sticky' : '') + '">' + rlDash(r.lastName) + '</td>'
          + '<td>' + rlEsc(r.account) + '</td>'
          + '<td>' + rlDash(r.dob) + '</td>'
          + '<td>' + rlDash(r.gender) + '</td>'
          + '<td class="rl-dash-cell">—</td>'
          + '<td class="rl-dash-cell">—</td>'
          + '<td class="rl-ellipsis" title="' + rlEsc(r.email) + '">' + rlDash(r.email) + '</td>'
          + '<td>' + rlDash(r.prevAppt) + '</td>'
          + '<td>' + rlDash(r.nextAppt) + '</td>'
          + '<td class="rl-dash-cell">—</td>'
          + '<td>' + rlEsc(r.intakeStatus) + '</td>'
          + '<td>' + rlEsc(r.insuranceCard) + '</td>'
          + '<td>' + rlDash(r.address) + '</td>'
          + '<td>' + rlDash(r.city) + '</td>'
          + '<td>' + rlDash(r.state) + '</td>'
          + '<td>' + rlDash(r.zip) + '</td>'
          + '<td>' + rlDash(r.phone) + '</td>'
          + '<td>' + rlDash(r.mobile) + '</td>'
          + '<td class="rl-payer-cell">' + rlEsc(r.primaryPayer) + '</td>'
          + '<td>' + rlDash(r.primaryPolicy) + '</td>'
          + '</tr>';
      });
    }
    body += '</tbody>';
    table.innerHTML = head + body;

    rlRenderPageBar(all.length, totalPages);
  }

  function rlRenderPageBar(total, totalPages) {
    const bar = document.getElementById('rlPageBar');
    if (!bar) return;
    const start = total ? (rlPage - 1) * rlPageSize + 1 : 0;
    const end = Math.min(total, rlPage * rlPageSize);
    const pages = [];
    const span = 4;
    for (let p = Math.max(1, rlPage - span); p <= Math.min(totalPages, rlPage + span); p++) pages.push(p);
    bar.innerHTML = '<div class="rl-page-nav">'
      + '<button type="button" ' + (rlPage <= 1 ? 'disabled' : '') + ' data-onclick="rlGoPage(1)">«</button>'
      + '<button type="button" ' + (rlPage <= 1 ? 'disabled' : '') + ' data-onclick="rlGoPage(' + (rlPage - 1) + ')">‹</button>'
      + pages.map(p => '<button type="button" class="' + (p === rlPage ? 'active' : '') + '" data-onclick="rlGoPage(' + p + ')">' + p + '</button>').join('')
      + '<button type="button" ' + (rlPage >= totalPages ? 'disabled' : '') + ' data-onclick="rlGoPage(' + (rlPage + 1) + ')">›</button>'
      + '<button type="button" ' + (rlPage >= totalPages ? 'disabled' : '') + ' data-onclick="rlGoPage(' + totalPages + ')">»</button>'
      + '<select data-onchange="rlSetPageSize(this.value)">' + [25, 50, 100, 250].map(n => '<option value="' + n + '"' + (n === rlPageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select><span>items per page</span>'
      + '</div>'
      + '<div class="rl-page-count">' + (total ? (start + '-' + end + ' of ' + total + ' items') : '0 items') + '</div>';
  }

  // ============================ interaction ============================
  function rlSetColFilter(key, v) { rlColFilters[key] = v; rlPage = 1; rlSavePrefs(); rlRenderTable(); }
  function rlSetShowWith(v) { rlShowWith = v; rlPage = 1; rlSavePrefs(); rlRenderTable(); }
  function rlSetPaymentCase(v) { rlPaymentCase = v; rlPage = 1; rlSavePrefs(); rlRenderTable(); }
  function rlSetTag(tag) { rlTagFilter = (rlTagFilter === tag ? '' : tag); rlPage = 1; rlSavePrefs(); renderRegistrationList(); }
  // Click cycles a column: none -> ascending -> descending -> none.
  function rlSetSort(key) {
    if (rlSortKey !== key) { rlSortKey = key; rlSortDir = 1; }
    else if (rlSortDir === 1) { rlSortDir = -1; }
    else { rlSortKey = ''; rlSortDir = 1; }
    rlPage = 1; rlSavePrefs(); rlRenderTable();
  }
  function rlClearFilters() {
    rlColFilters = {}; rlShowWith = 'All Patients'; rlPaymentCase = 'Default Payment Case'; rlTagFilter = '';
    rlSortKey = ''; rlSortDir = 1; rlPage = 1;
    rlSavePrefs();
    renderRegistrationList();
  }
  function rlToggleLock() {
    rlLockName = !rlLockName;
    try { localStorage.setItem(RL_LOCK_KEY, rlLockName ? '1' : '0'); } catch (e) {}
    renderRegistrationList();
  }
  function rlGoPage(p) { rlPage = p; rlRenderTable(); }
  function rlSetPageSize(v) {
    rlPageSize = parseInt(v, 10) || 50;
    try { localStorage.setItem(RL_PAGE_SIZE_KEY, String(rlPageSize)); } catch (e) {}
    rlPage = 1;
    rlRenderTable();
  }
  function rlEditPatient(id) {
    if (typeof showPage === 'function') showPage('registration');
    if (typeof regEditPatient === 'function') regEditPatient(id);
  }
  function rlExport(allData) {
    const rows = allData ? rlFilteredRows() : rlFilteredRows().slice((rlPage - 1) * rlPageSize, rlPage * rlPageSize);
    if (!rows.length) { rlToast('Nothing to export', 'err'); return; }
    const header = RL_COLS.map(c => c.label);
/* Spreadsheet formula injection: Excel runs a cell that starts with = + - @ (or a
       tab / carriage return) as a formula even inside quotes. Data typed on the public
       patient form or a law-firm referral lands in these files, so such cells get a
       leading apostrophe and open as text. Plain numbers (amounts, negatives) stay numbers. */
    const csvSafe = v => { const s = String(v == null ? '' : v); return (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s };
    const esc = v => '"' + csvSafe(v).replace(/"/g, '""') + '"';
    const lines = [header.map(esc).join(',')];
    rows.forEach(r => lines.push(RL_COLS.map(c => esc(c.filter === 'none' ? '' : r[c.key])).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'registration-list.csv';
    if (typeof ctgAuditListExport === 'function') ctgAuditListExport('registration_list', rows.length);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    rlToast('Exported ' + rows.length + ' patient' + (rows.length === 1 ? '' : 's') + ' ✓', 'ok');
  }

  window.renderRegistrationList = renderRegistrationList;
  window.rlSetColFilter = rlSetColFilter;
  window.rlSetShowWith = rlSetShowWith;
  window.rlSetPaymentCase = rlSetPaymentCase;
  window.rlSetTag = rlSetTag;
  window.rlSetSort = rlSetSort;
  window.rlClearFilters = rlClearFilters;
  window.rlToggleLock = rlToggleLock;
  window.rlGoPage = rlGoPage;
  window.rlSetPageSize = rlSetPageSize;
  window.rlEditPatient = rlEditPatient;
  window.rlExport = rlExport;
  window.rlToast = rlToast;
})();
