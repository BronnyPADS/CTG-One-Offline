(function () {
  'use strict';

  var DOC_KEY = 'disclosureLog';
  var dlEntries = [];
  var dlVersion = 0;
  var dlLoaded = false;

  /* The recipients this practice actually discloses to. "Law firm" is first
     because it is the common case here. */
  var RECIPIENT_TYPES = ['Law firm', 'Patient', 'Insurer', 'Another provider',
    'Court / subpoena', 'Public health authority', 'Other'];
  var METHODS = ['Secure portal link', 'Email', 'Mail', 'Fax', 'In person', 'Other'];

  var LEGAL_BASES = [
    { key: 'authorization', label: 'Patient authorization (§164.508)', accountable: false,
      hint: 'Signed patient authorization on file — e.g. FCR released to the patient’s attorney.' },
    { key: 'tpo', label: 'Treatment / payment / operations (§164.506)', accountable: false,
      hint: 'Care coordination, billing, or internal operations.' },
    { key: 'toPatient', label: 'Disclosure to the patient themselves', accountable: false,
      hint: 'The patient receiving their own information.' },
    { key: 'legalProcess', label: 'Subpoena / court order / legal process (§164.512(e))', accountable: true,
      hint: 'Compelled by legal process rather than authorized by the patient.' },
    { key: 'requiredByLaw', label: 'Required by law (§164.512(a))', accountable: true,
      hint: 'A statute or regulation compels the release.' },
    { key: 'publicHealth', label: 'Public health / oversight (§164.512(b),(d))', accountable: true,
      hint: 'Reporting to a public health or oversight authority.' },
    { key: 'other', label: 'Other permitted disclosure', accountable: true,
      hint: 'Anything else — record the reason in Notes.' }
  ];
  function basisByKey(k) {
    for (var i = 0; i < LEGAL_BASES.length; i++) if (LEGAL_BASES[i].key === k) return LEGAL_BASES[i];
    return null;
  }
  // Whether this entry belongs in the patient's formal 164.528 accounting.
  function isAccountable(e) {
    var b = basisByKey(e && e.legalBasis);
    return b ? !!b.accountable : false;
  }

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
  // Access Control (now "Admin Center") is admin-only, so reaching this tab
  // at all already implies permission.
  function can() { return true; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (m) return m[2] + '/' + m[3] + '/' + m[1];
    try { return new Date(iso).toLocaleDateString(); } catch (e) { return String(iso); }
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ------------------------------ storage ------------------------------
  function dlLoad() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/' + DOC_KEY).then(function (r) {
      dlVersion = r.version || 0;
      var d = r.data || {};
      dlEntries = Array.isArray(d.entries) ? d.entries : [];
      dlLoaded = true;
    }).catch(function () { dlLoaded = true; });
  }
  function dlSave() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/' + DOC_KEY, {
      method: 'PUT',
      body: JSON.stringify({ data: { entries: dlEntries }, version: dlVersion })
    }).then(function (r) { dlVersion = r.version; }).catch(function (e) {
      /* Someone else logged a disclosure while this form was open. Reload and
         ask for it again rather than overwriting their entry. */
      toast((e && e.body && e.body.error) || 'Could not save the disclosure — reload and try again', 'err');
      dlVersion = (e && e.body && e.body.version) || dlVersion;
      return dlLoad().then(render);
    });
  }

  // ------------------------------ render -------------------------------
  function render() {
    var mount = document.getElementById('disclosureMount');
    if (!mount) return;
    if (!dlLoaded) { dlLoad().then(render); return; }

    var rows = dlEntries.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });

    var h = '<div class="card"><div class="card-hd"><div class="card-ico ic-blue">DL</div><div class="card-title">Disclosure Log</div></div>'
      + '<div class="card-body">'
      + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:12px">Accounting of disclosures under HIPAA §164.528 — every release of patient information outside the practice.</div>'
      + '<div data-cs="'+__cs+'display:flex;justify-content:flex-end;margin:-4px 0 10px">'
        + '<button class="btn btn-primary btn-sm" data-onclick="dlOpenAdd()">Record a disclosure</button>'
      + '</div>';

    h += '<div class="sdiv" data-cs="'+__cs+'display:flex;align-items:center;justify-content:space-between;gap:12px">'
        + '<span>' + rows.length + ' disclosure' + (rows.length === 1 ? '' : 's') + ' recorded</span>'
        + (rows.length ? '<button class="btn btn-ghost btn-sm" data-onclick="dlExportCsv()">Export CSV</button>' : '')
      + '</div>';

    if (!rows.length) {
      h += '<div class="pld-empty-state">No disclosures recorded yet. '
        + 'Log one each time patient information leaves the practice — for example when a '
        + 'Final Case Report is sent to a law firm.</div>';
    } else {
      h += '<div class="rl-table-wrap"><table class="rl-table" data-cs="'+__cs+'min-width:1100px"><thead><tr>'
        + '<th>Date</th><th>Patient</th><th>Sent to</th><th>Information</th>'
        + '<th>Reason</th><th>Legal basis</th><th>In accounting?</th><th>Logged by</th>'
        + '</tr></thead><tbody>';
      rows.forEach(function (e) {
        var basis = basisByKey(e.legalBasis);
        var acc = isAccountable(e);
        h += '<tr>'
          + '<td>' + esc(fmtDate(e.date)) + '</td>'
          + '<td>' + esc(e.patientName || '—') + '</td>'
          + '<td>' + esc(e.recipient || '—')
            + (e.recipientType ? '<span class="dl-sub">' + esc(e.recipientType) + '</span>' : '') + '</td>'
          + '<td class="rl-ellipsis" title="' + esc(e.what) + '">' + esc(e.what || '—') + '</td>'
          + '<td class="rl-ellipsis" title="' + esc(e.purpose) + '">' + esc(e.purpose || '—') + '</td>'
          + '<td>' + esc(basis ? basis.label : '—') + '</td>'
          + '<td>' + (acc
              ? '<span class="pr-pill over">Yes — accountable</span>'
              : '<span class="pr-pill done">No — excluded</span>') + '</td>'
          + '<td>' + esc(e.by || '—') + '</td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    mount.innerHTML = h;
  }

  // ------------------------------ add form -----------------------------
  function opts(list, cur) {
    return list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('');
  }
  function patientOptions() {
    var list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    var name = (typeof window.naturalPatientName === 'function')
      ? window.naturalPatientName : function (p) { return (p.demographics || {}).firstName || p.id; };
    return '<option value="">— Select patient —</option>' + list.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(name(p)) + '</option>';
    }).join('');
  }

  function dlOpenAdd() {
    if (!can('disc.add')) { toast('You do not have permission to record disclosures', 'err'); return; }
    var body = document.getElementById('dlAddBody');
    if (!body) return;
    body.innerHTML = '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
      + '<div class="fg"><label>Date of disclosure<span class="req">*</span></label>'
        + '<input type="date" id="dlDate" value="' + todayISO() + '"></div>'
      + '<div class="fg"><label>Patient<span class="req">*</span></label>'
        + '<select id="dlPatient">' + patientOptions() + '</select></div>'
      + '<div class="fg"><label>Recipient name<span class="req">*</span></label>'
        + '<input type="text" id="dlRecipient" placeholder="e.g. Barnes Law Firm"></div>'
      + '<div class="fg"><label>Recipient type</label>'
        + '<select id="dlRecipientType">' + opts(RECIPIENT_TYPES, 'Law firm') + '</select></div>'
      + '</div>'
      + '<div class="fg" data-cs="'+__cs+'margin-top:10px"><label>Information disclosed<span class="req">*</span></label>'
        + '<input type="text" id="dlWhat" placeholder="e.g. Final Case Report and itemised billing"></div>'
      + '<div class="fg"><label>Legal basis<span class="req">*</span></label>'
        + '<select id="dlBasis" data-onchange="dlBasisChanged()">'
          + LEGAL_BASES.map(function (b) {
              return '<option value="' + esc(b.key) + '">' + esc(b.label) + '</option>';
            }).join('')
        + '</select>'
        + '<div class="small-muted" id="dlBasisHint" data-cs="'+__cs+'margin-top:4px"></div></div>'
      + '<div class="g2" data-cs="'+__cs+'row-gap:10px">'
        + '<div class="fg"><label>Reason for the release</label>'
          + '<input type="text" id="dlPurpose" placeholder="e.g. Legal representation"></div>'
        + '<div class="fg"><label>Method</label><select id="dlMethod">' + opts(METHODS, 'Secure portal link') + '</select></div>'
      + '</div>'
      + '<label class="plain-check" data-cs="'+__cs+'margin:6px 0 0"><input type="checkbox" id="dlAuth" checked> '
        + 'Signed patient authorisation is on file</label>'
      + '<div class="fg" data-cs="'+__cs+'margin-top:10px"><label>Notes</label>'
        + '<textarea id="dlNotes" rows="2" placeholder="Anything worth recording about this release"></textarea></div>'
      + '<div id="dlAddErr" data-cs="'+__cs+'display:none;color:var(--red);font-size:12px;font-weight:700;margin-top:8px"></div>';
    document.getElementById('dlAddModal').classList.add('show');
    dlBasisChanged();
  }
  /* Show what the chosen basis means, and say plainly whether it lands in
     the patient's formal accounting -- that is the distinction people get
     wrong, so the form states it rather than assuming knowledge. */
  function dlBasisChanged() {
    var sel = document.getElementById('dlBasis');
    var hint = document.getElementById('dlBasisHint');
    if (!sel || !hint) return;
    var b = basisByKey(sel.value);
    if (!b) { hint.textContent = ''; return; }
    hint.innerHTML = esc(b.hint) + '<br><strong>'
      + (b.accountable
          ? 'Included in the patient’s §164.528 accounting.'
          : 'Excluded from the §164.528 accounting — still recorded here as evidence.')
      + '</strong>';
  }
  function dlCloseAdd() {
    var m = document.getElementById('dlAddModal');
    if (m) m.classList.remove('show');
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  function dlSubmitAdd() {
    var err = document.getElementById('dlAddErr');
    function fail(msg) { if (err) { err.textContent = msg; err.style.display = ''; } }

    var date = val('dlDate');
    var patientId = val('dlPatient');
    var recipient = val('dlRecipient');
    var what = val('dlWhat');
    if (!date) return fail('The date of the disclosure is required.');
    if (!patientId) return fail('Select the patient whose information was disclosed.');
    if (!recipient) return fail('Enter who received the information.');
    if (!what) return fail('Describe what was disclosed.');

    var pList = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    var p = pList.filter(function (x) { return x.id === patientId; })[0];
    var pname = (p && typeof window.naturalPatientName === 'function') ? window.naturalPatientName(p) : '';

    dlEntries.push({
      id: 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      date: date,
      patientId: patientId,
      patientName: pname,
      recipient: recipient,
      recipientType: val('dlRecipientType'),
      what: what,
      purpose: val('dlPurpose'),
      legalBasis: val('dlBasis') || 'authorization',
      method: val('dlMethod'),
      authOnFile: !!(document.getElementById('dlAuth') || {}).checked,
      notes: val('dlNotes'),
      by: who(),
      recordedAt: new Date().toISOString()
    });
    dlCloseAdd();
    render();
    dlSave().then(function () { toast('Disclosure recorded'); });
  }

  // ------------------------------ export -------------------------------
  /* A patient asking for their accounting is entitled to a copy, so the log has
     to leave the portal in a readable form. */
  function dlExportCsv() {
    if (!can('disc.export')) { toast('You do not have permission to export the log', 'err'); return; }
    var cols = ['Date', 'Patient', 'Recipient', 'Recipient type', 'Information disclosed',
      'Reason', 'Legal basis', 'In 164.528 accounting', 'Method', 'Authorisation on file',
      'Logged by', 'Recorded at', 'Notes'];
/* Spreadsheet formula injection: Excel runs a cell that starts with = + - @ (or a
       tab / carriage return) as a formula even inside quotes. Data typed on the public
       patient form or a law-firm referral lands in these files, so such cells get a
       leading apostrophe and open as text. Plain numbers (amounts, negatives) stay numbers. */
    var csvSafe = function (v) {  var s = String(v == null ? '' : v); return (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s; };
    function cell(v) { return '"' + csvSafe(v).replace(/"/g, '""') + '"'; }
    var lines = [cols.map(cell).join(',')];
    dlEntries.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .forEach(function (e) {
        var b = basisByKey(e.legalBasis);
        lines.push([e.date, e.patientName, e.recipient, e.recipientType, e.what, e.purpose,
          b ? b.label : '', isAccountable(e) ? 'Yes' : 'No',
          e.method, e.authOnFile ? 'Yes' : 'No', e.by, e.recordedAt, e.notes].map(cell).join(','));
      });
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'disclosure-log-' + todayISO() + '.csv';
    if (typeof ctgAuditListExport === 'function') ctgAuditListExport('disclosure_log', dlEntries.length);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  document.addEventListener('keydown', function (e) {
    var m = document.getElementById('dlAddModal');
    if (e.key === 'Escape' && m && m.classList.contains('show')) dlCloseAdd();
  });

  window.renderDisclosureLog = render;
  window.ctgDisclosureLogRealtime = function () { dlLoaded = false; dlLoad().then(render); };
  window.dlOpenAdd = dlOpenAdd;
  window.dlBasisChanged = dlBasisChanged;
  window.dlCloseAdd = dlCloseAdd;
  window.dlSubmitAdd = dlSubmitAdd;
  window.dlExportCsv = dlExportCsv;
})();
