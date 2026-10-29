/* Neurologist Billing and Neurologist Payments.

   The practice's own tracking of what it owes the neurologist for the
   patients it refers (Neurologist Referrals): what the neurologist billed and
   what CTG has paid them. Money owed OUT, so it shares nothing with AR
   Summary / Collection Management, which follow money owed TO the practice.

   Neurologist Billing (page neuroBilling): per referred patient, the
   neurologist's bill laid out as on their claim - box 24 service lines and
   boxes 25-33 - with what is billed, paid and still owed.
   Neurologist Payments (page neuroPayments): payments recorded against those
   bills, the balance still owed per patient, and the payment history.

   Saved on the patient as p.neuroBilling:
     { lines: [{ from, to, pos, emg, cpt, mod, dxPtr, charge, units, npi }],
       accountNo, acceptAssignment ('yes' | 'no' | ''), signature, signDate,
       payments: [{ id, date, amount, method, ref, note, by, at }],
       updatedAt, updatedBy } */
(function () {
  'use strict';

  var N = function () { return window.ctgNeuro; };   // neuro-referrals.js, loaded first

  var NB_ICONS = {
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
  };
  function nbIcon(name, cls) {
    return '<svg class="' + (cls || 'rf-i') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + NB_ICONS[name] + '</svg>';
  }
  var esc = function (s) { return N().esc(s); };
  var us = function (iso) { return N().us(iso); };

  /* ------------------------------- the data ------------------------------- */
  var NB_LINE_KEYS = ['from', 'to', 'pos', 'emg', 'cpt', 'mod', 'dxPtr', 'charge', 'units', 'npi'];
  var NB_METHODS = ['Check', 'ACH / bank transfer', 'Credit card', 'Cash', 'Other'];

  function nbMoney(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function nbFmt(n) {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function nbBill(p) { return (p && p.neuroBilling) || null; }
  function nbBlank(p) {
    return { lines: [], accountNo: (p.demographics || {}).mrn || '', acceptAssignment: '', signature: '', signDate: '', payments: [] };
  }
  function nbTotals(b) {
    var billed = 0, paid = 0;
    ((b && b.lines) || []).forEach(function (l) { billed += nbMoney(l.charge); });
    ((b && b.payments) || []).forEach(function (x) { paid += nbMoney(x.amount); });
    billed = Math.round(billed * 100) / 100; paid = Math.round(paid * 100) / 100;
    return { billed: billed, paid: paid, balance: Math.round((billed - paid) * 100) / 100 };
  }
  /* Where a bill stands: none entered, unpaid, partly paid, paid in full. */
  function nbStage(b) {
    if (!b || !(b.lines || []).length) return 'none';
    var t = nbTotals(b);
    if (t.billed > 0 && t.balance <= 0) return 'paid';
    return t.paid > 0 ? 'partial' : 'unpaid';
  }
  var NB_STAGES = {
    none: { label: 'Bill Not Entered', icon: 'file' },
    unpaid: { label: 'Unpaid', icon: 'clock' },
    partial: { label: 'Partially Paid', icon: 'wallet' },
    paid: { label: 'Paid in Full', icon: 'check' }
  };
  function nbPill(stage) {
    var s = NB_STAGES[stage];
    return '<span class="nr-pill nb-st-' + stage + '">' + nbIcon(s.icon) + s.label + '</span>';
  }
  // Referred patients a bill can come for (submitted or scheduled), and anyone who already has one.
  function nbPatients() {
    return N().patients().filter(function (p) { return N().status(p) !== 'pending' || nbBill(p); });
  }
  function nbFirstService(b) {
    var d = ((b && b.lines) || []).map(function (l) { return l.from || ''; }).filter(Boolean).sort();
    return d[0] || '';
  }
  function nbName(p) { return typeof fullPatientName === 'function' ? fullPatientName(p) : ''; }
  function nbMe() {
    var me = typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null;
    return me ? (me.displayName || me.username || '') : '';
  }
  function nbFind(id) {
    var list = nbPatients();
    for (var i = 0; i < list.length; i++) if (N().idArg(list[i].id) === id) return list[i];
    return null;
  }
  function nbTile(cls, icon, label, value, sub) {
    return '<div class="nr-kpi ' + cls + '"><span class="nr-kpi-i">' + nbIcon(icon) + '</span>'
      + '<div class="nr-kpi-t"><div class="nr-kpi-v">' + value + '</div><div class="nr-kpi-l">' + label + '</div>'
      + '<div class="nr-kpi-s">' + sub + '</div></div></div>';
  }
  function nbHead(title, sub, actions) {
    return '<div class="rf-head"><div class="rf-head-t"><h1>' + title + '</h1><p>' + sub + '</p></div>'
      + '<div class="rf-head-actions">' + actions + '</div></div>';
  }
  /* Each search box names its handler in full: the click allowlist is read
     from the source (tools/actions-codemod.js), so it cannot come from a variable. */
  function nbSearchBox() {
    return '<div class="rf-search">' + nbIcon('search')
      + '<input id="nbSearch" type="search" autocomplete="off" placeholder="Search patient, account # or code" value="' + esc(nbQuery) + '" data-oninput="nbSearch(this.value)">'
      + '</div>';
  }
  function npSearchBox() {
    return '<div class="rf-search">' + nbIcon('search')
      + '<input id="npSearch" type="search" autocomplete="off" placeholder="Search patient or account #" value="' + esc(npQuery) + '" data-oninput="npSearch(this.value)">'
      + '</div>';
  }
  function nbSave(p, b) {
    b.updatedAt = new Date().toISOString();
    b.updatedBy = nbMe();
    p.neuroBilling = b;
    persistPatients();
  }

  /* =========================== Neurologist Billing ========================== */
  var nbFilter = 'none';
  var nbQuery = '';
  var nbSelectedId = null;
  var nbDrafts = {};            // patient id -> the bill being edited, until saved

  function nbDraftFor(p) {
    if (!nbDrafts[p.id]) nbDrafts[p.id] = JSON.parse(JSON.stringify(nbBill(p) || nbBlank(p)));
    return nbDrafts[p.id];
  }
  /* The form's totals: the lines being edited, against the payments as saved -
     payments are recorded on the Payments page, never through this copy. */
  function nbFormTotals(p) {
    return nbTotals({ lines: nbDraftFor(p).lines, payments: (nbBill(p) || {}).payments || [] });
  }
  function nbIsDirty(p) {
    var d = nbDrafts[p.id];
    if (!d) return false;
    var base = nbBill(p) || nbBlank(p);
    var pick = function (b) { return JSON.stringify({ l: b.lines, a: b.accountNo, s: b.acceptAssignment, g: b.signature, d: b.signDate }); };
    return pick(d) !== pick(base);
  }

  function renderNeuroBilling() {
    var mount = document.getElementById('neuroBillingMount');
    if (!mount || !N()) return;
    var all = nbPatients();
    var rows = nbRows(all);
    if (!rows.some(function (p) { return p.id === nbSelectedId; })) nbSelectedId = rows.length ? rows[0].id : null;
    var h = nbHead('Neurologist Billing',
      'What the neurologist billed for each referred patient, laid out as on their claim. For CTG One’s own tracking of what is owed to them.',
      '<button type="button" class="btn btn-primary" data-onclick="showPage(\'neuroPayments\')">' + nbIcon('wallet') + 'Neurologist Payments</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="nbRefresh()">' + nbIcon('refresh') + 'Refresh</button>');
    h += nbBillingKpis(all) + nbBillingToolbar(all);
    if (!all.length) {
      h += '<div class="card"><div class="card-body rf-empty">' + nbIcon('dollar', 'rf-empty-i') + '<b>No referred patients yet</b>'
        + '<p>A patient appears here once their neurologist referral is submitted on Neurologist Referrals.</p></div></div>';
    } else {
      h += '<div class="nr-split nb-split">' + nbListHTML(rows) + nbFormHTML(nbSelectedId ? getPatient(nbSelectedId) : null) + '</div>';
    }
    mount.innerHTML = h;
  }

  function nbRows(all) {
    var q = nbQuery.trim().toLowerCase();
    return all.filter(function (p) {
      if (nbFilter !== 'all' && nbStage(nbBill(p)) !== nbFilter) return false;
      if (!q) return true;
      var d = p.demographics || {}, b = nbBill(p) || {};
      return [d.firstName, d.lastName, d.mrn, d.lawFirm, b.accountNo].concat((b.lines || []).map(function (l) { return l.cpt; }))
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return nbName(a).localeCompare(nbName(b)); });
  }

  function nbBillingKpis(all) {
    var billed = 0, paid = 0, owedN = 0, entered = 0, none = 0, payN = 0;
    all.forEach(function (p) {
      var b = nbBill(p), t = nbTotals(b);
      if (nbStage(b) === 'none') { none++; return; }
      entered++; billed += t.billed; paid += t.paid; payN += (b.payments || []).length;
      if (t.balance > 0) owedN++;
    });
    return '<div class="nr-kpis">'
      + nbTile('k-total', 'dollar', 'Total Billed', nbFmt(billed), entered + (entered === 1 ? ' bill entered' : ' bills entered'))
      + nbTile('k-done', 'check', 'Total Paid', nbFmt(paid), payN + (payN === 1 ? ' payment recorded' : ' payments recorded'))
      + nbTile('k-pending', 'wallet', 'Balance Owed', nbFmt(Math.round((billed - paid) * 100) / 100), owedN + (owedN === 1 ? ' patient with a balance' : ' patients with a balance'))
      + nbTile('k-progress', 'file', 'Bill Not Entered', none, none ? 'Referred, bill not entered yet' : 'Every bill is entered')
      + '</div>';
  }

  function nbBillingToolbar(all) {
    var n = { none: 0, unpaid: 0, partial: 0, paid: 0 };
    all.forEach(function (p) { n[nbStage(nbBill(p))]++; });
    var tab = function (key, label, count) {
      return '<button type="button" class="rf-tab' + (nbFilter === key ? ' active' : '') + '" data-onclick="nbSetFilter(\'' + key + '\')">'
        + label + ' <span class="rf-badge">' + count + '</span></button>';
    };
    return '<div class="rf-toolbar"><div class="rf-tabs">'
      + tab('none', 'Not Entered', n.none) + tab('unpaid', 'Unpaid', n.unpaid) + tab('partial', 'Partially Paid', n.partial)
      + tab('paid', 'Paid in Full', n.paid) + tab('all', 'All', all.length)
      + '</div>' + nbSearchBox() + '</div>';
  }

  function nbListHTML(rows) {
    if (!rows.length) {
      return '<div class="nr-list card"><div class="nr-list-empty">'
        + (nbQuery ? 'No patients match “' + esc(nbQuery) + '”.' : nbFilter === 'none' ? 'Every referred patient’s bill has been entered.' : 'No bills at this stage.')
        + '</div></div>';
    }
    return '<div class="nr-list card" role="listbox" aria-label="Referred patients">' + rows.map(function (p) {
      var d = p.demographics || {}, id = N().idArg(p.id), b = nbBill(p), t = nbTotals(b), st = nbStage(b);
      var when = st === 'none' ? 'No bill entered yet' : 'Billed ' + nbFmt(t.billed) + (t.balance > 0 ? ' · Owed ' + nbFmt(t.balance) : ' · Paid in full');
      var initials = typeof initialsForPatient === 'function' ? initialsForPatient(p) : '';
      return '<div class="nr-item nb-is-' + st + (p.id === nbSelectedId ? ' active' : '') + (nbIsDirty(p) ? ' dirty' : '') + '" role="option" tabindex="0"'
        + ' aria-selected="' + (p.id === nbSelectedId ? 'true' : 'false') + '"'
        + ' data-onclick="nbSelect(\'' + id + '\')" data-onkeydown="nbItemKey(event,\'' + id + '\')">'
        + '<span class="nr-av">' + esc(initials) + '</span>'
        + '<span class="nr-item-main"><b>' + esc(nbName(p)) + '</b>'
        + '<span class="nr-item-sub">' + esc(N().step(N().status(p)).label) + (d.mrn ? ' · Acct # ' + esc(d.mrn) : '') + '</span>'
        + '<span class="nb-item-when">' + esc(when) + '</span></span>'
        + (nbFilter === 'all' ? nbPill(st) : '') + '</div>';
    }).join('') + '</div>';
  }

  /* The claim's service lines (box 24), as on the CMS-1500: each column
     titled with its box number. Charges are the line's total (24F). */
  var NB_COLS = [
    ['from', '24A', 'Date from', 'date'], ['to', '24A', 'Date to', 'date'], ['pos', '24B', 'Place of service', 'text'],
    ['emg', '24C', 'Emergency', 'text'], ['cpt', '24D', 'Procedure code', 'text'], ['mod', '24D', 'Modifiers', 'text'],
    ['dxPtr', '24E', 'Diagnosis pointer', 'text'], ['charge', '24F', 'Charges', 'money'], ['units', '24G', 'Days or units', 'text'],
    ['npi', '24J', 'Rendering provider NPI', 'text']
  ];
  function nbLinesHTML(b) {
    var head = '<div class="nb-svc-row nb-svc-head"><span></span>' + NB_COLS.map(function (c) {
      return '<span><i>' + c[1] + '</i>' + c[2] + '</span>';
    }).join('') + '<span></span></div>';
    var lines = b.lines.length ? b.lines.map(function (l, i) {
      return '<div class="nb-svc-row"><span class="nb-svc-n">' + (i + 1) + '</span>' + NB_COLS.map(function (c) {
        var ph = { pos: '11', emg: 'Y', cpt: '99203', mod: '59 GP', dxPtr: 'A', charge: '0.00', units: '1', npi: 'NPI' }[c[0]] || '';
        return '<input type="' + (c[3] === 'date' ? 'date' : 'text') + '" aria-label="Line ' + (i + 1) + ' ' + c[2] + '"'
          + (c[3] === 'money' ? ' inputmode="decimal" class="nb-money"' : '') + ' value="' + esc(l[c[0]] || '') + '"'
          + (ph ? ' placeholder="' + esc(ph) + '"' : '')
          + ' data-oninput="nbLine(' + i + ',\'' + c[0] + '\',this.value)">';
      }).join('')
        + '<button type="button" class="nb-svc-x" aria-label="Remove line ' + (i + 1) + '" data-onclick="nbRemoveLine(' + i + ')">' + nbIcon('x') + '</button></div>';
    }).join('') : '<div class="nb-svc-empty">No service lines yet. Add one for each service on the neurologist’s bill.</div>';
    return '<div class="nb-svc">' + head + lines + '</div>';
  }

  function nbFormHTML(p) {
    if (!p) return '<div class="nr-form card"><div class="nr-list-empty">Select a patient to enter their neurologist bill.</div></div>';
    var b = nbDraftFor(p), t = nbFormTotals(p), id = N().idArg(p.id), r = N().saved(p);
    var dirty = nbIsDirty(p), saved = nbBill(p);
    var head = '<div class="nr-form-hd"><div><h2>' + esc(typeof naturalPatientName === 'function' ? naturalPatientName(p) : nbName(p)) + '</h2>'
      + '<div class="nr-facts">'
        + '<span class="nr-fact nr-fact-va">' + nbIcon('send') + esc(N().step(N().status(p)).label) + '</span>'
        + (r.apptDate ? '<span class="nr-fact">Appointment: ' + esc(us(r.apptDate)) + '</span>' : '')
        + (r.form && r.form.partner ? '<span class="nr-fact">' + esc(r.form.partner) + '</span>' : '')
        + ((p.demographics || {}).mrn ? '<span class="nr-fact">Acct #: ' + esc(p.demographics.mrn) + '</span>' : '')
      + '</div></div>'
      + '<div class="nr-form-hd-r">' + nbPill(nbStage(saved))
      + '<button type="button" class="nr-link" data-onclick="nbOpenReferral(\'' + id + '\')">' + nbIcon('file') + 'Open Referral</button></div></div>';

    var body = '<div class="nr-form-body">'
      + '<h3 class="nr-sec nr-sec-first"><span>24 · Services</span></h3>'
      + '<p class="nb-sub">From the neurologist’s bill: one line for each service. Charges are each line’s total.</p>'
      + nbLinesHTML(b)
      + '<div class="nb-svc-foot"><button type="button" class="rf-btn rf-btn-quiet" data-onclick="nbAddLine()">' + nbIcon('plus') + 'Add service line</button>'
      + '<span class="nb-total">Total charge <b id="nbTotal">' + nbFmt(t.billed) + '</b></span></div>'
      + '<h3 class="nr-sec"><span>25–33 · Billing</span></h3>'
      + '<div class="nb-grid">'
        + '<div class="rf-f"><label for="nbf_accountNo">26 · Patient Account No.</label><input id="nbf_accountNo" type="text" value="' + esc(b.accountNo) + '" data-oninput="nbField(\'accountNo\',this.value)"></div>'
        + '<div class="rf-f"><span class="nb-lbl" id="nbAssignLbl">27 · Accept Assignment?</span><div class="nb-radios" role="radiogroup" aria-labelledby="nbAssignLbl">'
          + ['yes', 'no'].map(function (v) {
              return '<label class="nb-radio"><input type="radio" name="nbAssign" value="' + v + '"' + (b.acceptAssignment === v ? ' checked' : '')
                + ' data-onchange="nbField(\'acceptAssignment\',this.value)">' + (v === 'yes' ? 'Yes' : 'No') + '</label>';
            }).join('')
          + '<button type="button" class="nb-clear" data-onclick="nbClearAssign()">Clear</button></div></div>'
        + '<div class="rf-f"><label for="nbf_paid">29 · Amount Paid</label><input id="nbf_paid" type="text" class="rf-auto" readonly value="' + esc(nbFmt(t.paid)) + '">'
          + '<div class="nr-hint">' + nbIcon('info') + 'The payments recorded on Neurologist Payments</div></div>'
        + '<div class="rf-f"><label for="nbf_signature">31 · Signature of Physician or Supplier</label><input id="nbf_signature" type="text" value="' + esc(b.signature) + '" data-oninput="nbField(\'signature\',this.value)"></div>'
        + '<div class="rf-f"><label for="nbf_signDate">31 · Date</label><input id="nbf_signDate" type="date" value="' + esc(b.signDate) + '" data-oninput="nbField(\'signDate\',this.value)"></div>'
        + '<div class="nb-sum"><span>28 · Total Charge</span><b id="nbTotal2">' + nbFmt(t.billed) + '</b>'
          + '<span>Balance Owed</span><b id="nbBalance" class="' + (t.balance > 0 ? 'is-owed' : 'is-clear') + '">' + nbFmt(t.balance) + '</b></div>'
      + '</div></div>';

    var meta = saved && saved.updatedAt
      ? 'Last updated ' + esc(us(String(saved.updatedAt).slice(0, 10))) + (saved.updatedBy ? ' by ' + esc(saved.updatedBy) : '')
      : 'Not yet saved';
    var foot = '<div class="nr-form-ft"><span class="nr-meta"><b class="nr-unsaved"' + (dirty ? '' : ' hidden') + '>Unsaved changes · </b>' + meta + '</span>'
      + '<div class="nr-form-btns">'
      + (saved && t.balance > 0 ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nbGoPay(\'' + id + '\')">' + nbIcon('wallet') + 'Record a Payment</button>' : '')
      + '<button type="button" class="rf-btn rf-btn-go" data-onclick="nbSaveBill()">' + nbIcon('check') + 'Save Bill</button>'
      + '</div></div>';
    return '<div class="nr-form card">' + head + body + foot + '</div>';
  }

  // Typing does not repaint the form (that would lose the cursor): totals and flags are updated in place.
  function nbRefreshTotals() {
    var p = nbSelectedId ? getPatient(nbSelectedId) : null;
    if (!p) return;
    var t = nbFormTotals(p);
    ['nbTotal', 'nbTotal2'].forEach(function (k) { var el = document.getElementById(k); if (el) el.textContent = nbFmt(t.billed); });
    var bal = document.getElementById('nbBalance');
    if (bal) { bal.textContent = nbFmt(t.balance); bal.className = t.balance > 0 ? 'is-owed' : 'is-clear'; }
    var dirty = nbIsDirty(p);
    var flag = document.querySelector('#neuroBillingMount .nr-unsaved');
    if (flag) flag.hidden = !dirty;
    var item = document.querySelector('#neuroBillingMount .nr-item.active');
    if (item) item.classList.toggle('dirty', dirty);
  }
  function nbCurrent() { return nbSelectedId ? getPatient(nbSelectedId) : null; }
  function nbLine(i, key, value) {
    var p = nbCurrent(); if (!p || NB_LINE_KEYS.indexOf(key) === -1) return;
    var b = nbDraftFor(p); if (!b.lines[i]) return;
    b.lines[i][key] = String(value);
    nbRefreshTotals();
  }
  function nbField(key, value) {
    var p = nbCurrent(); if (!p || ['accountNo', 'acceptAssignment', 'signature', 'signDate'].indexOf(key) === -1) return;
    nbDraftFor(p)[key] = String(value);
    nbRefreshTotals();
  }
  function nbClearAssign() {
    var p = nbCurrent(); if (!p) return;
    nbDraftFor(p).acceptAssignment = '';
    renderNeuroBilling();
  }
  // A new line starts from the one above (same dates, place, NPI), as most bills repeat them.
  function nbAddLine() {
    var p = nbCurrent(); if (!p) return;
    var b = nbDraftFor(p), prev = b.lines[b.lines.length - 1] || {};
    var line = {};
    NB_LINE_KEYS.forEach(function (k) { line[k] = ['from', 'to', 'pos', 'npi'].indexOf(k) !== -1 ? (prev[k] || '') : (k === 'units' ? '1' : ''); });
    b.lines.push(line);
    renderNeuroBilling();
    var row = document.querySelectorAll('#neuroBillingMount .nb-svc-row:not(.nb-svc-head)');
    var last = row[row.length - 1];
    var cpt = last && last.querySelectorAll('input')[4];
    if (cpt) cpt.focus();
  }
  function nbRemoveLine(i) {
    var p = nbCurrent(); if (!p) return;
    nbDraftFor(p).lines.splice(i, 1);
    renderNeuroBilling();
  }
  function nbSaveBill() {
    var p = nbCurrent(); if (!p) return;
    var d = nbDraftFor(p);
    var bad = d.lines.filter(function (l) { return !l.from || !l.cpt || !(nbMoney(l.charge) > 0); }).length;
    if (bad) { showToast('Each service line needs a date, a procedure code and a charge.', 'err'); return; }
    var b = JSON.parse(JSON.stringify(d));
    b.lines.forEach(function (l) { if (!l.to) l.to = l.from; l.charge = nbMoney(l.charge).toFixed(2); });
    b.payments = ((nbBill(p) || {}).payments || []).slice();   // payments are kept by the Payments page
    nbSave(p, b);
    delete nbDrafts[p.id];
    showToast('Neurologist bill saved.', 'ok');
    renderNeuroBilling();
  }
  function nbSelect(id) { var p = nbFind(id); if (!p) return; nbSelectedId = p.id; renderNeuroBilling(); }
  function nbItemKey(ev, id) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nbSelect(id); } }
  function nbSetFilter(key) { nbFilter = key; renderNeuroBilling(); }
  function nbSearch(v) {
    nbQuery = String(v || '');
    renderNeuroBilling();
    var box = document.getElementById('nbSearch');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
  function nbRefresh() {
    var again = function () { renderNeuroBilling(); renderNeuroPayments(); };
    if (typeof loadPatientStore === 'function') Promise.resolve(loadPatientStore()).then(again, again); else again();
  }
  function nbOpenReferral(id) { if (N().openReferral) N().openReferral(id); }
  function nbGoPay(id) {
    var p = nbFind(id); if (!p) return;
    npTab = 'owed'; npQuery = '';
    showPage('neuroPayments');
    npOpenPay(id);
  }

  /* =========================== Neurologist Payments ========================= */
  var npTab = 'owed';           // 'owed' | 'paid' | 'history'
  var npQuery = '';
  var npOpen = {};              // patient id -> payment history shown
  var npModal = null;           // { id } while the Record Payment window is open

  function npBilled() {
    return nbPatients().filter(function (p) { return nbStage(nbBill(p)) !== 'none'; });
  }
  function npMatches(p) {
    var q = npQuery.trim().toLowerCase();
    if (!q) return true;
    var d = p.demographics || {};
    return [d.firstName, d.lastName, d.mrn, d.lawFirm].join(' ').toLowerCase().indexOf(q) !== -1;
  }

  function renderNeuroPayments() {
    var mount = document.getElementById('neuroPaymentsMount');
    if (!mount || !N()) return;
    var billed = npBilled();
    var h = nbHead('Neurologist Payments',
      'Record what CTG has paid the neurologist and see what is still owed for each referred patient.',
      '<button type="button" class="btn btn-ghost" data-onclick="showPage(\'neuroBilling\')">' + nbIcon('dollar') + 'Neurologist Billing</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="nbRefresh()">' + nbIcon('refresh') + 'Refresh</button>');
    h += npKpis(billed) + npToolbar(billed);
    if (!billed.length) {
      h += '<div class="card"><div class="card-body rf-empty">' + nbIcon('wallet', 'rf-empty-i') + '<b>No neurologist bills yet</b>'
        + '<p>Enter a bill on Neurologist Billing first; payments are recorded against it here.</p></div></div>';
    } else if (npTab === 'history') {
      h += npHistoryHTML(billed);
    } else {
      h += npBalancesHTML(billed);
    }
    mount.innerHTML = h;
  }

  function npKpis(billed) {
    var owed = 0, owedN = 0, month = N().today().slice(0, 7), monthPaid = 0, monthN = 0, allPaid = 0, oldest = null;
    billed.forEach(function (p) {
      var b = nbBill(p), t = nbTotals(b);
      allPaid += t.paid;
      if (t.balance > 0) {
        owed += t.balance; owedN++;
        var since = N().daysSince(nbFirstService(b));
        if (since !== null && (oldest === null || since > oldest)) oldest = since;
      }
      (b.payments || []).forEach(function (x) { if (String(x.date || '').slice(0, 7) === month) { monthPaid += nbMoney(x.amount); monthN++; } });
    });
    return '<div class="nr-kpis">'
      + nbTile('k-pending', 'wallet', 'Balance Owed', nbFmt(Math.round(owed * 100) / 100), owedN + (owedN === 1 ? ' patient' : ' patients') + ' with a balance')
      + nbTile('k-done', 'check', 'Paid This Month', nbFmt(Math.round(monthPaid * 100) / 100), monthN + (monthN === 1 ? ' payment' : ' payments'))
      + nbTile('k-total', 'dollar', 'Paid All Time', nbFmt(Math.round(allPaid * 100) / 100), billed.length + (billed.length === 1 ? ' bill' : ' bills'))
      + nbTile('k-progress', 'clock', 'Oldest Unpaid', oldest === null ? '—' : oldest + (oldest === 1 ? ' day' : ' days'), oldest === null ? 'Nothing owed' : 'Since the first service date')
      + '</div>';
  }

  function npToolbar(billed) {
    var owed = billed.filter(function (p) { return nbTotals(nbBill(p)).balance > 0; }).length;
    var pays = billed.reduce(function (n, p) { return n + (nbBill(p).payments || []).length; }, 0);
    var tab = function (key, label, count) {
      return '<button type="button" class="rf-tab' + (npTab === key ? ' active' : '') + '" data-onclick="npSetTab(\'' + key + '\')">'
        + label + ' <span class="rf-badge">' + count + '</span></button>';
    };
    return '<div class="rf-toolbar"><div class="rf-tabs">'
      + tab('owed', 'Balance Owed', owed) + tab('paid', 'Paid in Full', billed.length - owed) + tab('history', 'Payment History', pays)
      + '</div>' + npSearchBox() + '</div>';
  }

  function npBalancesHTML(billed) {
    var rows = billed.filter(function (p) {
      var owed = nbTotals(nbBill(p)).balance > 0;
      return (npTab === 'owed' ? owed : !owed) && npMatches(p);
    }).sort(function (a, b) { return nbFirstService(nbBill(a)).localeCompare(nbFirstService(nbBill(b))) || nbName(a).localeCompare(nbName(b)); });
    if (!rows.length) {
      return '<div class="card"><div class="card-body rf-empty">' + nbIcon(npTab === 'owed' ? 'check' : 'wallet', 'rf-empty-i')
        + '<b>' + (npQuery ? 'No patients match “' + esc(npQuery) + '”' : npTab === 'owed' ? 'Nothing owed' : 'No bills paid in full yet') + '</b>'
        + '<p>' + (npTab === 'owed' ? 'Every neurologist bill has been paid in full.' : 'Bills move here once their payments add up to the total charge.') + '</p></div></div>';
    }
    var h = '<div class="card nb-table-card"><div class="nb-table-scroll"><table class="nb-table"><thead><tr>'
      + '<th>Patient</th><th>Service dates</th><th class="nb-num">Billed</th><th class="nb-num">Paid</th><th class="nb-num">Balance</th>'
      + '<th>Last payment</th><th>Status</th><th><span class="nb-sr">Actions</span></th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var b = nbBill(p), t = nbTotals(b), id = N().idArg(p.id), st = nbStage(b);
      var dates = (b.lines || []).map(function (l) { return l.from; }).filter(Boolean).sort();
      var span = dates.length ? us(dates[0]) + (dates[dates.length - 1] !== dates[0] ? ' – ' + us(dates[dates.length - 1]) : '') : '—';
      var pays = (b.payments || []).slice().sort(function (a, c) { return String(c.date).localeCompare(String(a.date)); });
      var last = pays[0];
      var open = !!npOpen[p.id];
      h += '<tr class="nb-row' + (open ? ' is-open' : '') + '">'
        + '<td><button type="button" class="nb-expand" aria-expanded="' + open + '" data-onclick="npToggle(\'' + id + '\')">'
          + nbIcon('chevron', 'nb-chev') + '<b>' + esc(nbName(p)) + '</b></button>'
          + ((p.demographics || {}).mrn ? '<span class="nb-muted">Acct # ' + esc(p.demographics.mrn) + '</span>' : '') + '</td>'
        + '<td>' + esc(span) + '</td>'
        + '<td class="nb-num">' + nbFmt(t.billed) + '</td>'
        + '<td class="nb-num">' + nbFmt(t.paid) + '</td>'
        + '<td class="nb-num"><b class="' + (t.balance > 0 ? 'is-owed' : 'is-clear') + '">' + nbFmt(t.balance) + '</b></td>'
        + '<td>' + (last ? esc(us(last.date)) + ' · ' + nbFmt(nbMoney(last.amount)) : '<span class="nb-muted">None yet</span>') + '</td>'
        + '<td>' + nbPill(st) + '</td>'
        + '<td class="nb-act">' + (t.balance > 0 ? '<button type="button" class="rf-btn rf-btn-go nb-btn-sm" data-onclick="npOpenPay(\'' + id + '\')">' + nbIcon('plus') + 'Record Payment</button>' : '') + '</td>'
        + '</tr>';
      if (open) {
        h += '<tr class="nb-sub-row"><td colspan="8">' + (pays.length
          ? '<div class="nb-pays">' + pays.map(function (x) { return npPayRow(p, x); }).join('') + '</div>'
          : '<div class="nb-muted nb-pays-empty">No payments recorded for this bill yet.</div>') + '</td></tr>';
      }
    });
    return h + '</tbody></table></div></div>';
  }
  function npPayRow(p, x) {
    return '<div class="nb-pay"><span class="nb-pay-d">' + esc(us(x.date)) + '</span><b>' + nbFmt(nbMoney(x.amount)) + '</b>'
      + '<span>' + esc(x.method || '') + (x.ref ? ' · #' + esc(x.ref) : '') + '</span>'
      + '<span class="nb-muted">' + esc(x.note || '') + '</span>'
      + '<span class="nb-muted">' + (x.by ? 'Recorded by ' + esc(x.by) : '') + '</span>'
      + '<button type="button" class="nb-svc-x" aria-label="Delete this payment" data-onclick="npDeletePay(\'' + N().idArg(p.id) + '\',\'' + N().idArg(x.id) + '\')">' + nbIcon('x') + '</button></div>';
  }

  function npHistoryHTML(billed) {
    var list = [];
    billed.forEach(function (p) { if (npMatches(p)) (nbBill(p).payments || []).forEach(function (x) { list.push({ p: p, x: x }); }); });
    list.sort(function (a, b) { return String(b.x.date).localeCompare(String(a.x.date)) || String(b.x.at || '').localeCompare(String(a.x.at || '')); });
    if (!list.length) {
      return '<div class="card"><div class="card-body rf-empty">' + nbIcon('wallet', 'rf-empty-i') + '<b>' + (npQuery ? 'No payments match “' + esc(npQuery) + '”' : 'No payments recorded yet') + '</b>'
        + '<p>Payments recorded on the Balance Owed tab are listed here, newest first.</p></div></div>';
    }
    var total = list.reduce(function (s, e) { return s + nbMoney(e.x.amount); }, 0);
    return '<div class="card nb-table-card"><div class="nb-table-scroll"><table class="nb-table"><thead><tr>'
      + '<th>Date paid</th><th>Patient</th><th class="nb-num">Amount</th><th>Method</th><th>Reference #</th><th>Note</th><th>Recorded by</th><th><span class="nb-sr">Delete</span></th></tr></thead><tbody>'
      + list.map(function (e) {
          return '<tr><td>' + esc(us(e.x.date)) + '</td><td><b>' + esc(nbName(e.p)) + '</b></td><td class="nb-num">' + nbFmt(nbMoney(e.x.amount)) + '</td>'
            + '<td>' + esc(e.x.method || '') + '</td><td>' + esc(e.x.ref || '') + '</td><td>' + esc(e.x.note || '') + '</td>'
            + '<td><span class="nb-muted">' + esc(e.x.by || '') + '</span></td>'
            + '<td class="nb-act"><button type="button" class="nb-svc-x" aria-label="Delete this payment" data-onclick="npDeletePay(\'' + N().idArg(e.p.id) + '\',\'' + N().idArg(e.x.id) + '\')">' + nbIcon('x') + '</button></td></tr>';
        }).join('')
      + '</tbody><tfoot><tr><td colspan="2">Total paid' + (npQuery ? ' (this search)' : '') + '</td><td class="nb-num"><b>' + nbFmt(Math.round(total * 100) / 100) + '</b></td><td colspan="5"></td></tr></tfoot></table></div></div>';
  }

  /* ----------------------------- recording a payment ----------------------------- */
  function npModalHost() {
    var host = document.getElementById('npModalHost');
    if (!host) { host = document.createElement('div'); host.id = 'npModalHost'; document.body.appendChild(host); }
    return host;
  }
  function npOpenPay(id) {
    var p = nbFind(id); if (!p) return;
    var t = nbTotals(nbBill(p));
    npModal = { id: p.id };
    npModalHost().innerHTML = '<div class="rf-modal-back" data-onclick="npBackdrop(event)">'
      + '<div class="rf-modal nb-modal" role="dialog" aria-modal="true" aria-labelledby="npTitle">'
      + '<div class="rf-modal-hd"><div><h2 id="npTitle">Record a Payment</h2><p>' + esc(typeof naturalPatientName === 'function' ? naturalPatientName(p) : nbName(p))
        + ' · Billed ' + nbFmt(t.billed) + ' · Owed <b>' + nbFmt(t.balance) + '</b></p></div>'
        + '<button type="button" class="rf-x" aria-label="Close" data-onclick="npClosePay()">&times;</button></div>'
      + '<div class="rf-modal-body"><div class="rf-pair">'
        + '<div class="rf-f"><label for="npDate">Date Paid</label><input id="npDate" type="date" value="' + esc(N().today()) + '"></div>'
        + '<div class="rf-f"><label for="npAmount">Amount Paid</label><input id="npAmount" type="text" inputmode="decimal" class="nb-money" value="' + esc(t.balance > 0 ? t.balance.toFixed(2) : '') + '"></div>'
        + '<div class="rf-f"><label for="npMethod">Method</label><select id="npMethod">' + NB_METHODS.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>'
        + '<div class="rf-f"><label for="npRef">Check or Reference # <i>(optional)</i></label><input id="npRef" type="text" maxlength="60"></div>'
      + '</div>'
      + '<div class="rf-f"><label for="npNote">Note <i>(optional)</i></label><textarea id="npNote" rows="2" maxlength="500" placeholder="e.g. Paid for the 10/28 consultation"></textarea></div>'
      + '<div class="nr-err" id="npErr" role="alert" hidden></div></div>'
      + '<div class="rf-modal-ft"><button type="button" class="rf-btn rf-btn-quiet" data-onclick="npClosePay()">Cancel</button>'
        + '<button type="button" class="rf-btn rf-btn-go" data-onclick="npSavePay()">' + nbIcon('check') + 'Save Payment</button></div>'
      + '</div></div>';
    document.body.classList.add('rf-modal-open');
    var amt = document.getElementById('npAmount');
    if (amt) { amt.focus(); amt.select(); }
  }
  function npClosePay() {
    npModal = null;
    npModalHost().innerHTML = '';
    document.body.classList.remove('rf-modal-open');
  }
  function npBackdrop(ev) { if (ev && ev.target === ev.currentTarget) npClosePay(); }
  function npSavePay() {
    if (!npModal) return;
    var p = getPatient(npModal.id); if (!p) return npClosePay();
    var val = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var amount = nbMoney(val('npAmount')), date = val('npDate');
    var err = document.getElementById('npErr');
    var fail = function (msg, field) {
      if (err) { err.hidden = false; err.innerHTML = nbIcon('alert') + esc(msg); }
      var el = document.getElementById(field); if (el) el.focus();
    };
    if (!date) return fail('Enter the date the payment was made.', 'npDate');
    if (!(amount > 0)) return fail('Enter the amount paid, more than $0.00.', 'npAmount');
    var b = JSON.parse(JSON.stringify(nbBill(p) || nbBlank(p)));
    b.payments = b.payments || [];
    b.payments.push({
      id: 'pay_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      date: date, amount: amount.toFixed(2), method: val('npMethod'), ref: val('npRef'), note: val('npNote'),
      by: nbMe(), at: new Date().toISOString()
    });
    nbSave(p, b);
    var t = nbTotals(b);
    npClosePay();
    showToast('Payment of ' + nbFmt(amount) + ' recorded.' + (t.balance > 0 ? ' Still owed: ' + nbFmt(t.balance) + '.' : ' Paid in full.'), 'ok');
    renderNeuroPayments();
  }
  function npDeletePay(pid, payId) {
    var p = nbFind(pid); if (!p) return;
    var b = nbBill(p); if (!b) return;
    var x = (b.payments || []).filter(function (y) { return N().idArg(y.id) === payId; })[0];
    if (!x) return;
    ctgConfirm('Delete the payment of ' + nbFmt(nbMoney(x.amount)) + ' made ' + us(x.date) + ' for ' + nbName(p) + '? The balance owed goes back up by that amount.',
      { title: 'Delete payment', okLabel: 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      var nb = JSON.parse(JSON.stringify(b));
      nb.payments = nb.payments.filter(function (y) { return y.id !== x.id; });
      nbSave(p, nb);
      showToast('Payment deleted.', 'ok');
      renderNeuroPayments();
    });
  }
  function npToggle(id) { var p = nbFind(id); if (!p) return; npOpen[p.id] = !npOpen[p.id]; renderNeuroPayments(); }
  function npSetTab(t) { npTab = t; renderNeuroPayments(); }
  function npSearch(v) {
    npQuery = String(v || '');
    renderNeuroPayments();
    var box = document.getElementById('npSearch');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && npModal) npClosePay(); });

  window.renderNeuroBilling = renderNeuroBilling;
  window.renderNeuroPayments = renderNeuroPayments;
  window.nbSelect = nbSelect;
  window.nbItemKey = nbItemKey;
  window.nbSetFilter = nbSetFilter;
  window.nbSearch = nbSearch;
  window.nbRefresh = nbRefresh;
  window.nbLine = nbLine;
  window.nbField = nbField;
  window.nbClearAssign = nbClearAssign;
  window.nbAddLine = nbAddLine;
  window.nbRemoveLine = nbRemoveLine;
  window.nbSaveBill = nbSaveBill;
  window.nbOpenReferral = nbOpenReferral;
  window.nbGoPay = nbGoPay;
  window.npOpenPay = npOpenPay;
  window.npClosePay = npClosePay;
  window.npBackdrop = npBackdrop;
  window.npSavePay = npSavePay;
  window.npDeletePay = npDeletePay;
  window.npToggle = npToggle;
  window.npSetTab = npSetTab;
  window.npSearch = npSearch;
})();
