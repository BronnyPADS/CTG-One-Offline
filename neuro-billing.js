/* Neurologist Billing and Neurologist Payments.

   The practice's own tracking of what it owes the neurologist for the
   patients it refers (Neurologist Referrals): what the neurologist billed and
   what CTG has paid them. Money owed OUT, so it shares nothing with AR
   Summary / Collection Management, which follow money owed TO the practice.

   Neurologist Billing (page neuroBilling): per referred patient, the
   neurologist's bill laid out as on their claim - the service lines and the
   billing details (without the claim's box numbers) - with what is billed,
   paid and still owed.
   Neurologist Payments (page neuroPayments): payments recorded against those
   bills, the balance still owed per patient, and the payment history.
   Billing Provider List (page neuroProviderList, a part of Neurologist Billing):
   the billing providers registered once, each with its treating physicians,
   and picked on each bill (10 Nov 2026).

   Saved on the patient as p.neuroBilling:
     { lines: [{ from, to, pos, emg, cpt, mod, dxPtr, charge, units, npi }],
       accountNo, acceptAssignment ('yes' | 'no' | ''), signature, signDate,
       practiceName, practiceAddress, practicePhone, practiceNpi, practiceTaxId (who billed: CTG or an outside practice),
       physicianName, physicianCred (the Day 1 list), physicianCredOther (typed for Other), physicianNpi
         (the treating physician; one per bill),
       signatureImage (a PNG data URL of the signature, printed in place of the typed one),
       payments: [{ id, date, amount, method, ref, note, by, at }],
       updatedAt, updatedBy }

   The practices and physicians to pick from are one list for the whole
   practice, the shared document neuroProviders (6 Nov 2026); since 10 Nov each
   physician names its practice (practiceId). A bill keeps its own copy of what
   was picked, so changing the list never rewrites a bill. */
(function () {
  'use strict';

  var N = function () { return window.ctgNeuro; };   // neuro-referrals.js, loaded first

  var NB_ICONS = {
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
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
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    building: '<path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21"/><path d="M14 10h4.5a1.5 1.5 0 0 1 1.5 1.5V21"/><path d="M2.5 21h19"/><path d="M8 8h2M8 12h2M8 16h2"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
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
  var NB_CREDENTIALS = ['DC', 'MD', 'RN', 'NP', 'PhD', 'ATC', 'Other'];   // the Day 1 form's list
  /* An uploaded signature: always a PNG redrawn here (nbSigPrepare), so only
     the picture is kept, never the file it came in. The server holds it to the
     same shape and size. */
  var NB_SIG_MAX = 300000;
  function nbSigOk(v) { return typeof v === 'string' && v.length <= NB_SIG_MAX && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v); }
  // "Jane Doe, MD"; for Other, the credential typed in.
  function nbPhysician(b) {
    var name = String((b && b.physicianName) || '').trim();
    var cred = b && b.physicianCred === 'Other' ? String(b.physicianCredOther || '').trim() : String((b && b.physicianCred) || '');
    return [name, cred].filter(Boolean).join(', ');
  }
  // The bill's provider fields, all text: who billed, and the treating physician's NPI.
  var NB_PROV_FIELDS = ['practiceName', 'practiceAddress', 'practicePhone', 'practiceEmail', 'practiceNpi', 'practiceTaxId', 'physicianNpi'];
  function nbBlank(p) {
    var b = { lines: [], accountNo: (p.demographics || {}).mrn || '', acceptAssignment: '', signature: '', signDate: '',
      physicianName: '', physicianCred: '', physicianCredOther: '', signatureImage: '', payments: [] };
    NB_PROV_FIELDS.forEach(function (k) { b[k] = ''; });
    return b;
  }

  /* --------------------- the saved providers and physicians --------------------- */
  /* One list for the whole practice (the shared document neuroProviders), so an
     outside practice typed in once is there on every bill. A copy is kept in the
     browser too: the offline version has no server, and a list that cannot be
     reached for a moment still shows what was there. */
  var NB_PROV_KEY = 'ctg_neuro_providers_v1';
  var nbProv = { practices: [], physicians: [] }, nbProvVersion = 0, nbProvLoadedAt = 0;
  function nbProvTake(d) {
    var ok = d && typeof d === 'object' && Array.isArray(d.practices) && Array.isArray(d.physicians);
    if (ok) nbProv = { practices: d.practices.slice(), physicians: d.physicians.slice() };
    return ok;
  }
  function nbProvKeep() { try { localStorage.setItem(NB_PROV_KEY, JSON.stringify(nbProv)); } catch (e) { /* private window */ } }
  (function () { try { nbProvTake(JSON.parse(localStorage.getItem(NB_PROV_KEY) || 'null')); } catch (e) { /* none yet */ } })();
  // The server's list, at most every 30 seconds; repaints when it differs from what is shown.
  function nbProvLoad(force) {
    if (typeof window.ctgApiFetch !== 'function') return;
    if (!force && Date.now() - nbProvLoadedAt < 30000) return;
    nbProvLoadedAt = Date.now();
    var before = JSON.stringify(nbProv);
    window.ctgApiFetch('/api/shared/doc/neuroProviders').then(function (r) {
      nbProvVersion = (r && r.version) || 0;
      if (r && r.data && nbProvTake(r.data)) nbProvKeep();
      if (JSON.stringify(nbProv) !== before) { renderNeuroBilling(); renderNeuroProviderList(); }
    }).catch(function () { /* offline: the browser's copy stands */ });
  }
  var nbSame = function (a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
  /* Applies a change to this browser's list and to the newest server copy (a
     clash with someone else's save is retried once). Resolves true when saved. */
  function nbProvWrite(change, failMsg, failTail) {
    change(nbProv); nbProvKeep();
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve(true);
    var attempt = function (retried) {
      return window.ctgApiFetch('/api/shared/doc/neuroProviders').then(function (r) {
        var list = r && r.data && Array.isArray(r.data.practices) ? { practices: r.data.practices, physicians: r.data.physicians || [] } : { practices: [], physicians: [] };
        change(list);
        return window.ctgApiFetch('/api/shared/doc/neuroProviders', { method: 'PUT', body: JSON.stringify({ data: list, version: (r && r.version) || 0 }) })
          .then(function (w) { nbProvVersion = w.version; nbProvTake(list); nbProvKeep(); return true; });
      }).catch(function (e) {
        if (e && e.status === 409 && !retried) return attempt(true);
        if (e && e.status) showToast(failMsg + ': ' + (e.message || 'try again') + '.' + (failTail || ''), 'err');
        return false;
      });
    };
    return attempt(false);
  }
  function nbNewId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nbPhysicianOf(x) {
    var cred = x.cred === 'Other' ? String(x.credOther || '').trim() : String(x.cred || '');
    return [String(x.name || '').trim(), cred].filter(Boolean).join(', ');
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
  function nbTile(cls, icon, label, value) {
    return '<div class="nr-kpi ' + cls + '"><span class="nr-kpi-i">' + nbIcon(icon) + '</span>'
      + '<div class="nr-kpi-t"><div class="nr-kpi-v">' + value + '</div><div class="nr-kpi-l">' + label + '</div></div></div>';
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
  var nbLastSel = null, nbLastFilter = null;   // what was last painted (a change eases in)

  function nbDraftFor(p) {
    if (!nbDrafts[p.id]) {
      var d = JSON.parse(JSON.stringify(nbBill(p) || nbBlank(p)));
      // A bill saved before the physician fields (5 Nov 2026) or the provider fields (6 Nov) has them blank.
      ['physicianName', 'physicianCred', 'physicianCredOther', 'signatureImage'].concat(NB_PROV_FIELDS).forEach(function (k) { if (d[k] == null) d[k] = ''; });
      nbDrafts[p.id] = d;
    }
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
    var pick = function (b) {
      return JSON.stringify({ l: b.lines, a: b.accountNo, s: b.acceptAssignment, g: b.signature, d: b.signDate,
        n: b.physicianName || '', c: b.physicianCred || '', o: b.physicianCredOther || '', i: b.signatureImage || '',
        p: NB_PROV_FIELDS.map(function (k) { return b[k] || ''; }) });
    };
    return pick(d) !== pick(base);
  }

  function renderNeuroBilling() {
    var mount = document.getElementById('neuroBillingMount');
    if (!mount || !N()) return;
    nbProvLoad();
    var all = nbPatients();
    var rows = nbRows(all);
    if (!rows.some(function (p) { return p.id === nbSelectedId; })) nbSelectedId = rows.length ? rows[0].id : null;
    var h = nbHead('Neurologist Billing',
      'What the neurologist billed for each referred patient, laid out as on their claim. For CTG One’s own tracking of what is owed to them.',
      '<button type="button" class="btn btn-primary" data-onclick="showPage(\'neuroPayments\')">' + nbIcon('wallet') + 'Neurologist Payments</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="showPage(\'neuroProviderList\')">' + nbIcon('list') + 'Billing Provider List</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="nbRefresh()">' + nbIcon('refresh') + 'Refresh</button>');
    h += nbBillingKpis(all) + nbBillingToolbar(all);
    if (!all.length) {
      h += '<div class="card"><div class="card-body rf-empty">' + nbIcon('dollar', 'rf-empty-i') + '<b>No referred patients yet</b>'
        + '<p>A patient appears here once their neurologist referral is submitted on Neurologist Referrals.</p></div></div>';
    } else {
      h += '<div class="nr-solo">' + (rows.length ? nbFormHTML(nbSelectedId ? getPatient(nbSelectedId) : null)
        : '<div class="nr-form card"><div class="nr-list-empty">' + nbEmptyText() + '</div></div>') + '</div>';
    }
    N().paint(mount, 'page-neuroBilling', h, [(nbFilter !== nbLastFilter || nbSelectedId !== nbLastSel) && '.nr-form']);
    nbLastSel = nbSelectedId; nbLastFilter = nbFilter;
    if (nbPickOpen) nbPickFocus();
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
    var billed = 0, paid = 0, none = 0;
    all.forEach(function (p) {
      var b = nbBill(p), t = nbTotals(b);
      if (nbStage(b) === 'none') { none++; return; }
      billed += t.billed; paid += t.paid;
    });
    return '<div class="nr-kpis">'
      + nbTile('k-total', 'dollar', 'Total Billed', nbFmt(billed))
      + nbTile('k-done', 'check', 'Total Paid', nbFmt(paid))
      + nbTile('k-pending', 'wallet', 'Balance Owed', nbFmt(Math.round((billed - paid) * 100) / 100))
      + nbTile('k-progress', 'file', 'Bill Not Entered', none)
      + '</div>';
  }

  function nbBillingToolbar(all) {
    var n = { none: 0, unpaid: 0, partial: 0, paid: 0 };
    all.forEach(function (p) { n[nbStage(nbBill(p))]++; });
    var tab = function (key, label, count) {
      return '<button type="button" class="rf-tab' + (nbFilter === key ? ' active' : '') + '" data-onclick="nbSetFilter(\'' + key + '\')">'
        + '<span class="nr-tl">' + label + ' <span class="rf-badge">' + count + '</span></span></button>';
    };
    return '<div class="rf-toolbar"><div class="rf-tabs">'
      + tab('none', 'Not Entered', n.none) + tab('unpaid', 'Unpaid', n.unpaid) + tab('partial', 'Partially Paid', n.partial)
      + tab('paid', 'Paid in Full', n.paid) + tab('all', 'All', all.length)
      + '</div>' + nbPickHTML(nbRows(all)) + nbSearchBox() + '</div>';
  }

  function nbEmptyText() {
    return nbQuery ? 'No patients match “' + esc(nbQuery) + '”.' : nbFilter === 'none' ? 'Every referred patient’s bill has been entered.' : 'No bills at this stage.';
  }

  /* The patient picker, as on Neurologist Referrals: a pill beside the tabs
     showing whose bill is open; it drops down the patients in the current tab
     (and the search matches). */
  var nbPickOpen = false;
  function nbPickHTML(rows) {
    var sel = nbSelectedId && rows.filter(function (p) { return p.id === nbSelectedId; })[0];
    var open = nbPickOpen && rows.length;
    var face = sel
      ? '<span class="nr-av">' + esc(typeof initialsForPatient === 'function' ? initialsForPatient(sel) : '') + '</span><span class="nr-pick-name">' + esc(nbName(sel)) + '</span>'
      : '<span class="nr-pick-name nr-pick-none">No patients</span>';
    return '<div class="nr-pick' + (open ? ' open' : '') + (sel && nbIsDirty(sel) ? ' dirty' : '') + '">'
      + '<button type="button" class="nr-pick-btn" aria-haspopup="listbox" aria-expanded="' + (open ? 'true' : 'false') + '"'
      + (rows.length ? '' : ' disabled') + ' aria-label="Choose a patient" data-onclick="nbPickToggle()">'
      + face + '<span class="nr-pick-chev">' + N().icon('chevronDown') + '</span></button>'
      + '<div class="nr-pick-panel">' + (rows.length ? nbListHTML(rows) : '') + '</div></div>';
  }
  function nbPickSet(open) {
    nbPickOpen = !!open;
    var box = document.querySelector('#neuroBillingMount .nr-pick');
    if (!box) return;
    var can = !!box.querySelector('.nr-item');
    box.classList.toggle('open', nbPickOpen && can);
    var btn = box.querySelector('.nr-pick-btn');
    if (btn) btn.setAttribute('aria-expanded', nbPickOpen && can ? 'true' : 'false');
  }
  function nbPickFocus() {
    var it = document.querySelector('#neuroBillingMount .nr-pick.open .nr-item.active') || document.querySelector('#neuroBillingMount .nr-pick.open .nr-item');
    var list = it && it.parentNode;
    if (it && list) list.scrollTop = Math.max(0, it.offsetTop - list.clientHeight / 2);
    return it;
  }
  function nbPickToggle() {
    nbPickSet(!nbPickOpen);
    var it = nbPickOpen && nbPickFocus();
    if (it) it.focus({ preventScroll: true });
  }
  // Click outside or press Escape: the dropdown closes.
  document.addEventListener('click', function (ev) {
    if (!nbPickOpen) return;
    var t = ev.target;
    if (t && t.closest && (t.closest('#neuroBillingMount .nr-pick') || t.closest('#neuroBillingMount .rf-search'))) return;
    nbPickSet(false);
  });
  document.addEventListener('keydown', function (ev) {
    if (!nbPickOpen || ev.key !== 'Escape') return;
    nbPickSet(false);
    var btn = document.querySelector('#neuroBillingMount .nr-pick-btn');
    if (btn) btn.focus();
  });

  function nbListHTML(rows) {
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

  /* The service lines, in the order of the claim's service section (the box
     numbers themselves are not shown - the user asked for them off), headed in
     the claim's own words (10 Nov 2026). Charges are each line's total. */
  var NB_COLS = [
    ['from', 'Date of Service From', 'date'], ['to', 'Date of Service To', 'date'], ['pos', 'Place of Service', 'text'],
    ['emg', 'EMG', 'text'], ['cpt', 'CPT/HCPCS', 'text'], ['mod', 'Modifier', 'text'],
    ['dxPtr', 'Diagnosis Pointer', 'text'], ['charge', '$ Charges', 'money'], ['units', 'Days or Units', 'text'],
    ['npi', 'Rendering Provider ID. #', 'text']
  ];
  function nbLinesHTML(b) {
    var head = '<div class="nb-svc-row nb-svc-head"><span></span>' + NB_COLS.map(function (c) {
      return '<span>' + c[1] + '</span>';
    }).join('') + '<span></span></div>';
    var lines = b.lines.length ? b.lines.map(function (l, i) {
      return '<div class="nb-svc-row"><span class="nb-svc-n">' + (i + 1) + '</span>' + NB_COLS.map(function (c) {
        var ph = { pos: '11', emg: 'Y', cpt: '99203', mod: '59 GP', dxPtr: 'A', charge: '0.00', units: '1', npi: 'NPI' }[c[0]] || '';
        return '<input type="' + (c[2] === 'date' ? 'date' : 'text') + '" aria-label="Line ' + (i + 1) + ' ' + c[1] + '"'
          + (c[2] === 'money' ? ' inputmode="decimal" class="nb-money"' : '') + ' value="' + esc(l[c[0]] || '') + '"'
          + (ph ? ' placeholder="' + esc(ph) + '"' : '')
          + ' data-oninput="nbLine(' + i + ',\'' + c[0] + '\',this.value)">';
      }).join('')
        + '<button type="button" class="nb-svc-x" aria-label="Remove line ' + (i + 1) + '" data-onclick="nbRemoveLine(' + i + ')">' + nbIcon('x') + '</button></div>';
    }).join('') : '<div class="nb-svc-empty">No service lines yet. Add one for each service on the neurologist’s bill.</div>';
    return '<div class="nb-svc">' + head + lines + '</div>';
  }

  function nbFormHTML(p) {
    if (!p) return '<div class="nr-form card"><div class="nr-list-empty">Select a patient to enter their neurologist bill.</div></div>';
    var b = nbDraftFor(p), t = nbFormTotals(p), id = N().idArg(p.id);
    var dirty = nbIsDirty(p), saved = nbBill(p);
    var head = '<div class="nr-form-hd"><div><h2>' + esc(typeof naturalPatientName === 'function' ? naturalPatientName(p) : nbName(p)) + '</h2></div>'
      + '<div class="nr-form-hd-r">' + nbPill(nbStage(saved))
      + '<button type="button" class="nr-link" data-onclick="nbOpenReferral(\'' + id + '\')">' + nbIcon('file') + 'Open Referral</button></div></div>';

    var prov = nbProvidersHTML(b);
    var body = '<div class="nr-form-body">'
      // First on the form (10 Nov 2026, as the user asked); the PDF keeps it last, as box 33.
      + prov.practice
      + '<h3 class="nr-sec"><span>Services</span></h3>'
      + nbLinesHTML(b)
      + '<div class="nb-svc-foot"><button type="button" class="rf-btn rf-btn-quiet" data-onclick="nbAddLine()">' + nbIcon('plus') + 'Add service line</button>'
      + '<span class="nb-total">Total charge <b id="nbTotal">' + nbFmt(t.billed) + '</b></span></div>'
      + '<h3 class="nr-sec"><span>Billing</span></h3>'
      + '<div class="nb-grid">'
        + prov.taxId
        + '<div class="rf-f"><label for="nbf_accountNo">Patient Account No.</label><input id="nbf_accountNo" type="text" value="' + esc(b.accountNo) + '" data-oninput="nbField(\'accountNo\',this.value)"></div>'
        + '<div class="rf-f"><span class="nb-lbl" id="nbAssignLbl">Accept Assignment?</span><div class="nb-radios" role="radiogroup" aria-labelledby="nbAssignLbl">'
          + ['yes', 'no'].map(function (v) {
              return '<label class="nb-radio"><input type="radio" name="nbAssign" value="' + v + '"' + (b.acceptAssignment === v ? ' checked' : '')
                + ' data-onchange="nbField(\'acceptAssignment\',this.value)">' + (v === 'yes' ? 'Yes' : 'No') + '</label>';
            }).join('')
          + '<button type="button" class="nb-clear" data-onclick="nbClearAssign()">Clear</button></div></div>'
        + '<div class="rf-f"><label for="nbf_paid">Amount Paid</label><input id="nbf_paid" type="text" class="rf-auto" readonly value="' + esc(nbFmt(t.paid)) + '">'
          + '<div class="nr-hint">' + nbIcon('info') + 'The payments recorded on Neurologist Payments</div></div>'
        + prov.physician
        + '<div class="rf-f"><label for="nbf_signature">Signature of Provider</label><input id="nbf_signature" type="text" value="' + esc(b.signature) + '" data-oninput="nbField(\'signature\',this.value)">'
          // Or a picture of the signature (5 Nov 2026): it prints on the bill in place of the typed one.
          + '<div class="nb-sig">'
            + (nbSigOk(b.signatureImage) ? '<img class="nb-sig-img" alt="Uploaded signature" src="' + esc(b.signatureImage) + '">' : '')
            + '<label class="rf-btn rf-btn-quiet nb-sig-btn">' + nbIcon('file') + (nbSigOk(b.signatureImage) ? 'Replace picture' : 'Upload signature')
              + '<input type="file" class="nb-sig-file" accept="image/png,image/jpeg" aria-label="Upload a picture of the signature (PNG or JPG)" data-onchange="nbSigUpload(this)"></label>'
            + (nbSigOk(b.signatureImage) ? '<button type="button" class="nb-clear" data-onclick="nbSigRemove()">Remove</button>' : '')
          + '</div>'
          + '<div class="nr-hint">' + nbIcon('info') + (nbSigOk(b.signatureImage) ? 'This picture prints on the bill as the signature.' : 'PNG or JPG. It prints on the bill as the signature.') + '</div>'
        + '</div>'
        + '<div class="rf-f"><label for="nbf_signDate">Date Signed</label><input id="nbf_signDate" type="date" value="' + esc(b.signDate) + '" data-oninput="nbField(\'signDate\',this.value)"></div>'
        + '<div class="nb-sum"><span>Total Charge</span><b id="nbTotal2">' + nbFmt(t.billed) + '</b>'
          + '<span>Balance Owed</span><b id="nbBalance" class="' + (t.balance > 0 ? 'is-owed' : 'is-clear') + '">' + nbFmt(t.balance) + '</b></div>'
      + '</div>'
      + '</div>';

    var meta = saved && saved.updatedAt
      ? 'Last updated ' + esc(us(String(saved.updatedAt).slice(0, 10))) + (saved.updatedBy ? ' by ' + esc(saved.updatedBy) : '')
      : 'Not yet saved';
    var foot = '<div class="nr-form-ft"><span class="nr-meta"><b class="nr-unsaved"' + (dirty ? '' : ' hidden') + '>Unsaved changes · </b>' + meta + '</span>'
      + '<div class="nr-form-btns">'
      + (saved && (saved.lines || []).length ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nbDownloadPdf()">' + nbIcon('download') + 'Download PDF</button>' : '')
      + (saved && t.balance > 0 ? '<button type="button" class="rf-btn rf-btn-quiet" data-onclick="nbGoPay(\'' + id + '\')">' + nbIcon('wallet') + 'Record a Payment</button>' : '')
      + '<button type="button" class="rf-btn rf-btn-go" data-onclick="nbSaveBill()">' + nbIcon('check') + 'Save Bill</button>'
      + '</div></div>';
    return '<div class="nr-form card">' + head + body + foot + '</div>';
  }

  /* Who billed and who treated, both picked from the Billing Provider List
     (10 Nov 2026), where each practice is registered with its physicians. A
     pick copies the details onto the bill, so a later change to the list does
     not rewrite a saved bill. */
  function nbPracticeOf(b) { return nbProv.practices.filter(function (x) { return nbSame(x.name, b.practiceName); })[0] || null; }
  function nbProvidersHTML(b) {
    var pracAt = nbPracticeOf(b);
    var physName = nbPhysician(b);
    // The picked practice's own physicians; with none picked, everyone, under their practice.
    var pool = pracAt ? nbProv.physicians.filter(function (x) { return x.practiceId === pracAt.id; }) : nbProv.physicians;
    var physAt = pool.filter(function (x) { return nbSame(x.name, b.physicianName) && nbSame(nbPhysicianOf(x), physName); })[0]
      || pool.filter(function (x) { return nbSame(x.name, b.physicianName); })[0];
    var opt = function (x, at, label) { return '<option value="' + esc(x.id) + '"' + (at && at.id === x.id ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var own = function (text, at) { return text && !at ? '<option value="__bill" selected>' + esc(text) + ' (on this bill)</option>' : ''; };
    var docLabel = function (x) { return nbPhysicianOf(x) + (x.npi ? ' · NPI ' + x.npi : ''); };
    var byName = function (a, c) { return String(a.name).localeCompare(String(c.name)); };
    var docOpts;
    if (pracAt) docOpts = pool.slice().sort(byName).map(function (x) { return opt(x, physAt, docLabel(x)); }).join('');
    else {
      docOpts = nbProv.practices.map(function (pr) {
        var list = nbProv.physicians.filter(function (x) { return x.practiceId === pr.id; }).sort(byName);
        return list.length ? '<optgroup label="' + esc(pr.name) + '">' + list.map(function (x) { return opt(x, physAt, docLabel(x)); }).join('') + '</optgroup>' : '';
      }).join('');
      var loose = nbProv.physicians.filter(function (x) { return !nbProv.practices.some(function (pr) { return pr.id === x.practiceId; }); }).sort(byName);
      if (loose.length) docOpts += '<optgroup label="Not linked to a practice">' + loose.map(function (x) { return opt(x, physAt, docLabel(x)); }).join('') + '</optgroup>';
    }
    var practice = '<div class="rf-f"><label for="nbf_practice">Billing Provider</label><select id="nbf_practice" data-onchange="nbPickPractice(this.value)">'
        + '<option value="">— Select —</option>' + nbProv.practices.map(function (x) { return opt(x, pracAt, x.name); }).join('') + own(b.practiceName, pracAt) + '</select>'
        + (nbProv.practices.length ? '' : '<button type="button" class="nb-clear" data-onclick="showPage(\'neuroProviderList\')">Register a billing provider</button>')
      + '</div>';
    // In the CMS-1500's words (box 31), without "Signature of": the signature has its own box below (10 Nov 2026).
    var physician = '<div class="rf-f nb-span2"><label for="nbf_physician">Physician or Supplier Including Degrees or Credentials</label>'
        + '<select id="nbf_physician" data-onchange="nbPickPhysician(this.value)"><option value="">— Select —</option>' + docOpts + own(physName, physAt) + '</select>'
        + (pracAt && !pool.length ? '<button type="button" class="nb-clear" data-onclick="showPage(\'neuroProviderList\')">Register physicians for ' + esc(pracAt.name) + '</button>' : '')
      + '</div>';
    /* In the CMS-1500's places (10 Nov 2026): the federal tax ID opens Billing (box 25), the treating
       physician goes with the signature (box 31), and the billing provider comes last on the PDF (box 33); the form shows it first. */
    return {
      // From the billing provider picked below (box 25 is the billing provider's).
      taxId: '<div class="rf-f"><label for="nbf_practiceTaxId">Federal Tax ID</label><input id="nbf_practiceTaxId" type="text" class="rf-auto" readonly value="' + esc(b.practiceTaxId || '') + '" placeholder="From the billing provider"></div>',
      physician: physician,
      practice: '<h3 class="nr-sec nr-sec-first"><span>Billing Provider</span></h3>'
        + '<div class="nb-grid">' + practice + '</div>'
    };
  }
  function nbUsePractice(b, x) {
    b.practiceName = x.name || ''; b.practiceAddress = x.address || ''; b.practicePhone = x.phone || ''; b.practiceEmail = x.email || '';
    b.practiceNpi = x.npi || ''; b.practiceTaxId = x.taxId || '';
  }
  function nbPickPractice(v) {
    var p = nbCurrent(); if (!p) return;
    if (v === '__bill') return;
    var b = nbDraftFor(p), x = nbProv.practices.filter(function (e) { return e.id === v; })[0] || {};
    nbUsePractice(b, x);
    // A physician from another practice does not stay on the bill.
    var doc = nbProv.physicians.filter(function (d) { return nbSame(d.name, b.physicianName); });
    if (x.id && b.physicianName && !doc.some(function (d) { return d.practiceId === x.id; })) nbUsePhysician(b, {});
    renderNeuroBilling();
  }
  // A physician's NPI also goes on the service lines that have none yet (each line's rendering NPI).
  function nbUsePhysician(b, x) {
    b.physicianName = x.name || ''; b.physicianCred = x.cred || ''; b.physicianCredOther = x.cred === 'Other' ? (x.credOther || '') : '';
    b.physicianNpi = x.npi || '';
    if (x.npi) (b.lines || []).forEach(function (l) { if (!String(l.npi || '').trim()) l.npi = x.npi; });
  }
  function nbPickPhysician(v) {
    var p = nbCurrent(); if (!p) return;
    if (v === '__bill') return;
    var b = nbDraftFor(p), x = nbProv.physicians.filter(function (e) { return e.id === v; })[0] || {};
    nbUsePhysician(b, x);
    // Picked before the practice: the physician's practice becomes the billing provider.
    var pr = x.practiceId && nbProv.practices.filter(function (e) { return e.id === x.practiceId; })[0];
    if (pr && !nbPracticeOf(b)) nbUsePractice(b, pr);
    renderNeuroBilling();
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
    var pick = document.querySelector('#neuroBillingMount .nr-pick');
    if (pick) pick.classList.toggle('dirty', dirty);
  }
  function nbCurrent() { return nbSelectedId ? getPatient(nbSelectedId) : null; }
  function nbLine(i, key, value) {
    var p = nbCurrent(); if (!p || NB_LINE_KEYS.indexOf(key) === -1) return;
    var b = nbDraftFor(p); if (!b.lines[i]) return;
    b.lines[i][key] = String(value);
    nbRefreshTotals();
  }
  function nbField(key, value) {
    var p = nbCurrent(); if (!p || ['accountNo', 'acceptAssignment', 'signature', 'signDate', 'physicianName', 'physicianCred', 'physicianCredOther'].concat(NB_PROV_FIELDS).indexOf(key) === -1) return;
    nbDraftFor(p)[key] = String(value);
    // Other: the credential is typed in a box under the list.
    if (key === 'physicianCred') {
      var other = document.getElementById('nbf_physicianCredOther');
      if (other) { other.hidden = value !== 'Other'; if (value === 'Other') other.focus(); }
    }
    nbRefreshTotals();
  }
  function nbClearAssign() {
    var p = nbCurrent(); if (!p) return;
    nbDraftFor(p).acceptAssignment = '';
    renderNeuroBilling();
  }

  /* A picture of the signature. It is redrawn as a PNG: cut to the signature
     itself (the empty paper around it left out) and no bigger than 600 x 200,
     so it prints at a sensible size and stays small on the bill. */
  function nbSigPrepare(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onerror = function () { reject(new Error('That file could not be read as a picture.')); };
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight;
        if (!w || !h) { reject(new Error('That picture is empty.')); return; }
        // Read at up to 1600 px to find where the ink is.
        var s0 = Math.min(1, 1600 / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s0)); c.height = Math.max(1, Math.round(h * s0));
        var x = c.getContext('2d');
        x.drawImage(im, 0, 0, c.width, c.height);
        var d = x.getImageData(0, 0, c.width, c.height).data;
        var L = c.width, T = c.height, R = -1, B = -1;
        for (var yy = 0; yy < c.height; yy++) {
          for (var xx = 0; xx < c.width; xx++) {
            var i = (yy * c.width + xx) * 4;
            // Ink: not see-through and darker than the paper.
            if (d[i + 3] > 40 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) {
              if (xx < L) L = xx; if (xx > R) R = xx; if (yy < T) T = yy; if (yy > B) B = yy;
            }
          }
        }
        if (R < 0) { reject(new Error('No signature could be seen in that picture.')); return; }
        var pad = 6;
        L = Math.max(0, L - pad); T = Math.max(0, T - pad); R = Math.min(c.width - 1, R + pad); B = Math.min(c.height - 1, B + pad);
        var cw = R - L + 1, ch = B - T + 1;
        var tries = [1, 0.7, 0.5], out = '';
        for (var k = 0; k < tries.length; k++) {
          var s = Math.min(1, 600 / cw, 200 / ch) * tries[k];
          var o = document.createElement('canvas');
          o.width = Math.max(1, Math.round(cw * s)); o.height = Math.max(1, Math.round(ch * s));
          o.getContext('2d').drawImage(c, L, T, cw, ch, 0, 0, o.width, o.height);
          out = o.toDataURL('image/png');
          if (nbSigOk(out)) { resolve(out); return; }
        }
        reject(new Error('That picture is too detailed to keep. Please use a plain scan or photo of the signature on white paper.'));
      };
      im.src = src;
    });
  }
  function nbSigUpload(input) {
    var p = nbCurrent(), file = input && input.files && input.files[0];
    if (input) input.value = '';   // the same file can be chosen again
    if (!p || !file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type || '')) { showToast('Please choose a PNG or JPG picture of the signature.', 'err'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('That picture is over 10 MB. Please choose a smaller one.', 'err'); return; }
    var reader = new FileReader();
    reader.onerror = function () { showToast('That file could not be read.', 'err'); };
    reader.onload = function () {
      nbSigPrepare(String(reader.result)).then(function (url) {
        if (nbCurrent() !== p) return;   // another patient was opened meanwhile
        nbDraftFor(p).signatureImage = url;
        renderNeuroBilling();
        showToast('Signature picture added. Click Save Bill to keep it.', 'ok');
      }, function (e) { showToast(e.message, 'err'); });
    };
    reader.readAsDataURL(file);
  }
  function nbSigRemove() {
    var p = nbCurrent(); if (!p) return;
    nbDraftFor(p).signatureImage = '';
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
    if (b.physicianCred !== 'Other') b.physicianCredOther = '';   // typed only for Other (as the server keeps it)
    nbSave(p, b);
    delete nbDrafts[p.id];
    showToast('Neurologist bill saved.', 'ok');
    renderNeuroBilling();
  }
  function nbSelect(id) {
    var p = nbFind(id); if (!p) return;
    nbSelectedId = p.id; nbPickOpen = false;
    renderNeuroBilling();
    var btn = document.querySelector('#neuroBillingMount .nr-pick-btn');
    if (btn) btn.focus({ preventScroll: true });
  }
  function nbItemKey(ev, id) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nbSelect(id); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      var cur = ev.target && ev.target.closest ? ev.target.closest('.nr-item') : null;
      var next = cur && (ev.key === 'ArrowDown' ? cur.nextElementSibling : cur.previousElementSibling);
      if (next) next.focus();
    }
  }
  function nbSetFilter(key) { nbFilter = key; nbPickOpen = false; renderNeuroBilling(); }
  function nbSearch(v) {
    nbQuery = String(v || '');
    nbPickOpen = !!nbQuery;
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

  /* ---------------------------- the bill as a PDF ---------------------------- */
  /* The saved bill on the practice letterhead, laid out as an invoice (the
     approved draft of 10 Nov 2026): the service lines, the billing details and
     the billing provider with the totals, and the payments recorded. Unsaved changes are not in it, so the button asks for a save
     first. The PDF's fonts are Latin-1 only, hence nbPdfText. */
  var NB_PDF_SERVICES = [
    ['from', 'Date of Service From', 60], ['to', 'Date of Service To', 60], ['pos', 'Place of Service', 48], ['emg', 'EMG', 34],
    ['cpt', 'CPT/HCPCS', 56], ['mod', 'Modifier', 48], ['dxPtr', 'Diagnosis Pointer', 50], ['charge', '$ Charges', 64],
    ['units', 'Days or Units', 40], ['npi', 'Rendering Provider ID. #', 72]
  ];
  var NB_PDF_PAYMENTS = [
    ['date', 'Date', 70], ['amount', 'Amount', 74], ['method', 'Method', 90], ['ref', 'Reference', 90],
    ['note', 'Note', 128], ['by', 'Recorded by', 80]
  ];
  function nbPdfText(v) {
    return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  }
  function nbPdfDate(v) { var s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? us(s.slice(0, 10)) : s; }
  function nbBuildBillPdf(p) {
    /* Laid out as the approved invoice draft (Neurologist-Bill-Draft, 10 Nov 2026): letterhead with a
       navy rule, Patient and Referral boxes, the service lines under a navy header, Billing and the
       signature beside the Billing Provider with the totals under it, then the payments. No status
       badge (the user asked it off). */
    var b = nbBill(p), t = nbTotals(b), r = N().saved(p), chart = N().chart(p), T = nbPdfText;
    var name = (typeof naturalPatientName === 'function' ? naturalPatientName(p) : '') || nbName(p);
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    var PW = 612, PH = 792, ML = 40, MR = 40, CW = PW - ML - MR, BOTTOM = 52, y = 0;
    var NAVY = [15, 47, 102], INK = [17, 24, 39], MUTED = [91, 100, 116], LINE = [213, 218, 227], SOFT = [243, 245, 249], ZEBRA = [250, 251, 253];
    function f(style, size, color) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 9); doc.setTextColor.apply(doc, color || INK); }
    function stroke(c, w) { doc.setDrawColor.apply(doc, c); doc.setLineWidth(w); }
    function fill(c) { doc.setFillColor.apply(doc, c); }
    function one(text, width) { return doc.splitTextToSize(T(text), width)[0] || ''; }
    // The letterhead every CTG document carries, with a navy rule under it.
    function letterhead() {
      doc.setTextColor(0, 0, 0); doc.setFont('times', 'bold'); doc.setFontSize(12);
      doc.text('CONCUSSION THERAPY GROUP', ML, 56);
      doc.setFont('times', 'normal'); doc.setFontSize(10);
      ['2411 Crofton Lane, Suite 13A', 'Crofton, MD, 21114-1336', 'Phone: 410-451-9870', 'Fax: 410-451-9872'].forEach(function (l, i) {
        doc.text(l, PW - MR, 40 + i * 13, { align: 'right' });
      });
      stroke(NAVY, 1.5); doc.line(ML, 94, PW - MR, 94);
      y = 124;
    }
    function newPage() { doc.addPage(); letterhead(); }
    // A section title in spaced navy capitals over a thin rule.
    function sec(text, x, w) {
      f('bold', 8.5, NAVY); doc.text(text.toUpperCase(), x, y, { charSpace: 1.1 });
      stroke(LINE, 0.6); doc.line(x, y + 6, x + w, y + 6);
    }
    // A table: header labels (wrapped, bottom-aligned), rows with a rule under each; right-aligned columns named in `right`.
    function table(cols, rows, right, style) {
      var X = [], cx = ML;
      cols.forEach(function (c) { X.push(cx); cx += c[2]; });
      var tx = function (i) { return right.indexOf(cols[i][0]) !== -1 ? [X[i] + cols[i][2] - 5, { align: 'right' }] : [X[i] + 5, {}]; };
      function head() {
        f('bold', 7, style === 'navy' ? [255, 255, 255] : MUTED);
        var ls = cols.map(function (c) { return doc.splitTextToSize(style === 'navy' ? c[1] : c[1].toUpperCase(), c[2] - 9); });
        var n = Math.max.apply(null, ls.map(function (l) { return l.length; })), h = n * 8.5 + 11;
        if (y + h + 24 > PH - BOTTOM) newPage();
        if (style === 'navy') { fill(NAVY); doc.rect(ML, y, CW, h, 'F'); }
        f('bold', 7, style === 'navy' ? [255, 255, 255] : MUTED);
        ls.forEach(function (l, i) {
          var a = tx(i);
          l.forEach(function (s, k) { doc.text(s, a[0], y + h - 6 - (l.length - 1 - k) * 8.5, a[1]); });
        });
        if (style !== 'navy') { stroke(NAVY, 1.1); doc.line(ML, y + h, ML + CW, y + h); }
        y += h;
      }
      head();
      rows.forEach(function (row, ri) {
        f('normal', 8.5, row._muted ? MUTED : INK);
        var ls = row._muted ? [[row._muted]] : cols.map(function (c) { return doc.splitTextToSize(T(row[c[0]]), c[2] - 9); });
        var h = Math.max.apply(null, ls.map(function (l) { return l.length || 1; })) * 10.5 + 10;
        if (y + h > PH - BOTTOM) { newPage(); head(); f('normal', 8.5, row._muted ? MUTED : INK); }
        if (style === 'navy' && ri % 2 === 1) { fill(ZEBRA); doc.rect(ML, y, CW, h, 'F'); }
        if (row._muted) doc.text(row._muted, ML + 5, y + 14);
        else ls.forEach(function (l, i) { var a = tx(i); l.forEach(function (s, k) { doc.text(s, a[0], y + 14 + k * 10.5, a[1]); }); });
        stroke(LINE, 0.6); doc.line(ML, y + h, ML + CW, y + h);
        y += h;
      });
      return X;
    }
    // Label / value lines; values may wrap to `lines` lines. Returns the y under the last one.
    function pairs(list, x, w, labelW, lines) {
      var ly = y;
      list.forEach(function (pr) {
        f('normal', 8.5, MUTED); doc.text(pr[0], x, ly);
        f('bold', 8.5, INK);
        var v = doc.splitTextToSize(T(pr[1]), w - labelW).slice(0, pr[2] || lines || 1);
        if (!v.length) v = [''];
        v.forEach(function (s, k) { doc.text(s, x + labelW, ly + k * 11); });
        ly += 15 + (v.length - 1) * 11;
      });
      return ly;
    }

    letterhead();
    f('bold', 17, NAVY); doc.text('NEUROLOGIST BILL', ML, y, { charSpace: 0.4 });
    y += 16;
    var made = us(N().today());
    f('bold', 8.5, INK); doc.text(made, PW - MR, y, { align: 'right' });
    var mw = doc.getTextWidth(made);
    f('normal', 8.5, MUTED); doc.text('Printed', PW - MR - mw - 8, y, { align: 'right' });
    f('normal', 8, MUTED);
    doc.text(one("Concussion Therapy Group's own record of what the neurologist billed for this referred patient and what has been paid.", CW - mw - 60), ML, y);
    y += 20;

    // Patient and Referral, side by side.
    var gap = 12, bw = (CW - gap) / 2;
    var card = function (x, title, list) {
      var h = 18 + 12 + list.length * 14 + 2;
      fill(SOFT); doc.roundedRect(x, y, bw, 18, 4, 4, 'F'); doc.rect(x, y + 9, bw, 9, 'F');
      stroke(LINE, 0.7); doc.roundedRect(x, y, bw, h, 4, 4, 'S'); doc.line(x, y + 18, x + bw, y + 18);
      f('bold', 7, NAVY); doc.text(title.toUpperCase(), x + 10, y + 12, { charSpace: 1.1 });
      list.forEach(function (pr, i) {
        var ty = y + 18 + 15 + i * 14;
        f('normal', 8.5, MUTED); doc.text(pr[0], x + 10, ty);
        f('bold', 8.5, INK); doc.text(one(pr[1], bw - 104), x + 96, ty);
      });
      return h;
    };
    var hc = Math.max(
      card(ML, 'Patient', [['Name', name], ['Date of Birth', chart.dob], ['Referred On', nbPdfDate(r.referredOn)]]),
      card(ML + bw + gap, 'Referral', [['Partner', (r.form || {}).partner || ''], ['Status', N().step(N().status(p)).label], ['Appointment', nbPdfDate(r.apptDate)]]));
    y += hc + 28;

    // Services
    if (y + 80 > PH - BOTTOM) newPage();
    sec('Services', ML, CW); y += 14;
    var X = table(NB_PDF_SERVICES, (b.lines || []).map(function (l) {
      return { from: nbPdfDate(l.from), to: nbPdfDate(l.to), pos: l.pos, emg: l.emg, cpt: l.cpt, mod: l.mod, dxPtr: l.dxPtr,
        charge: nbFmt(nbMoney(l.charge)), units: l.units, npi: l.npi };
    }), ['charge', 'units'], 'navy');
    if (y + 22 > PH - BOTTOM) newPage();
    var ci = 7;   // the $ Charges column
    f('bold', 8.5, MUTED); doc.text('Total Charge', X[ci] - 12, y + 15, { align: 'right' });
    f('bold', 8.5, INK); doc.text(nbFmt(t.billed), X[ci] + NB_PDF_SERVICES[ci][2] - 5, y + 15, { align: 'right' });
    y += 46;

    // Billing (left) and the Billing Provider with the totals (right).
    var sig = null, colW = (CW - 20) / 2, LX = ML, RX = ML + colW + 20;
    if (nbSigOk(b.signatureImage)) {
      try {
        var ip = doc.getImageProperties(b.signatureImage);
        var s = Math.min(30 / ip.height, (colW * 0.7) / ip.width);
        if (s > 0 && isFinite(s)) sig = { w: ip.width * s, h: ip.height * s };
      } catch (e) { sig = null; }
    }
    if (y + 215 > PH - BOTTOM) newPage();
    var top = y;
    sec('Billing', LX, colW); sec('Billing Provider', RX, colW);
    y = top + 24;
    var leftEnd = pairs([
      ['Federal Tax ID', b.practiceTaxId],
      ['Patient Account No.', b.accountNo],
      ['Accept Assignment?', b.acceptAssignment === 'yes' ? 'Yes' : b.acceptAssignment === 'no' ? 'No' : ''],
      ['Physician or Supplier', nbPhysician(b)],
      ['Physician NPI', b.physicianNpi]], LX, colW, 104);
    // The signature on its line: the uploaded picture, else the typed name.
    var lineY = leftEnd + 26;
    var drawn = false;
    if (sig) { try { doc.addImage(b.signatureImage, 'PNG', LX + 2, lineY - sig.h - 2, sig.w, sig.h); drawn = true; } catch (e) { drawn = false; } }
    if (!drawn && b.signature) { doc.setFont('times', 'italic'); doc.setFontSize(15); doc.setTextColor.apply(doc, INK); doc.text(one(b.signature, colW - 8), LX + 2, lineY - 5); }
    stroke(INK, 0.8); doc.line(LX, lineY, LX + colW, lineY);
    f('normal', 7.5, MUTED); doc.text('Signature of Provider', LX, lineY + 11);
    var sd = nbPdfDate(b.signDate) || '';
    f('bold', 7.5, MUTED); doc.text(sd, LX + colW, lineY + 11, { align: 'right' });
    var sdw = doc.getTextWidth(sd);
    f('normal', 7.5, MUTED); doc.text('Date Signed:' + (sd ? ' ' : ''), LX + colW - sdw, lineY + 11, { align: 'right' });
    leftEnd = lineY + 14;

    var rightEnd = pairs([
      ['Billing Provider', b.practiceName],
      ['Address', b.practiceAddress, 2],
      ['Phone', b.practicePhone],
      ['Email', b.practiceEmail],
      ['Provider NPI', b.practiceNpi]], RX, colW, 104);
    var tb = rightEnd + 4, rh = 21;
    stroke(LINE, 0.7);
    fill(NAVY); doc.roundedRect(RX, tb + rh * 2, colW, rh + 3, 4, 4, 'F'); doc.rect(RX, tb + rh * 2, colW, 8, 'F');
    doc.roundedRect(RX, tb, colW, rh * 3 + 3, 4, 4, 'S'); doc.line(RX, tb + rh, RX + colW, tb + rh);
    [['Total Charge', nbFmt(t.billed)], ['Amount Paid', nbFmt(t.paid)]].forEach(function (s2, i) {
      f('normal', 9, INK); doc.text(s2[0], RX + 11, tb + rh * i + 14);
      f('bold', 9, INK); doc.text(s2[1], RX + colW - 11, tb + rh * i + 14, { align: 'right' });
    });
    f('bold', 10.5, [255, 255, 255]); doc.text('Balance Owed', RX + 11, tb + rh * 2 + 15.5);
    doc.text(nbFmt(t.balance), RX + colW - 11, tb + rh * 2 + 15.5, { align: 'right' });
    rightEnd = tb + rh * 3 + 3;
    y = Math.max(leftEnd, rightEnd) + 32;

    // Payments
    if (y + 60 > PH - BOTTOM) newPage();
    sec('Payments', ML, CW); y += 12;
    var pays = ((b.payments) || []).slice().sort(function (a, c) { return String(a.date || '').localeCompare(String(c.date || '')); });
    table(NB_PDF_PAYMENTS, pays.length ? pays.map(function (x) {
      return { date: nbPdfDate(x.date), amount: nbFmt(nbMoney(x.amount)), method: x.method, ref: x.ref, note: x.note, by: x.by };
    }) : [{ _muted: 'No payments recorded yet.' }], ['amount'], 'plain');

    // Footer on every page: who and what, the day it was made, and the page count.
    var total = doc.internal.getNumberOfPages();
    var left = T(['Concussion Therapy Group', 'Neurologist Bill', name, chart.dob].filter(Boolean).join(' / '));
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      stroke(LINE, 0.6); doc.line(ML, PH - 36, PW - MR, PH - 36);
      f('normal', 7.5, MUTED);
      var rt = 'Printed ' + made + '   Page ' + i + ' of ' + total;
      doc.text(doc.splitTextToSize(left, CW - doc.getTextWidth(rt) - 18)[0], ML, PH - 22);
      doc.text(rt, PW - MR, PH - 22, { align: 'right' });
    }
    return doc;
  }

  function nbDownloadPdf() {
    var p = nbCurrent(); if (!p) return;
    if (nbIsDirty(p)) { showToast('Save the bill first. The PDF is made from the saved bill.', 'err'); return; }
    if (!nbBill(p) || !(nbBill(p).lines || []).length) { showToast('Enter and save the bill first.', 'err'); return; }
    loadJsPDF(function () {
      try {
        var doc = nbBuildBillPdf(p);
        doc.save('CTG_Neurologist_Bill_' + ((nbName(p) || 'Patient').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')) + '_' + N().today() + '.pdf');
        if (typeof ctgAuditExport === 'function') ctgAuditExport(p.id, 'neuro_bill');
        showToast('Neurologist bill PDF downloaded.', 'ok');
      } catch (e) {
        console.error('Neurologist bill PDF', e);
        showToast('Could not make the PDF: ' + e.message, 'err');
      }
    });
  }

  /* ========================= Billing Provider List ========================= */
  /* The billing providers (practices), each with its treating physicians, as
     cards. A practice's name opens it with its physicians; Edit is where the
     practice and its physicians are registered (10 Nov 2026). */
  var plModal = null;           // { mode: 'view' | 'edit', id } while a window is open (id '' = a new practice)
  var plQuery = '';
  var PL_FIELDS = [
    ['name', 'Practice Name', 200, 'e.g. Northern Virginia Neurology'],
    ['address', 'Provider Address', 300, 'Street, city, state ZIP'],
    ['phone', 'Provider Phone', 60, ''],
    ['email', 'Provider Email', 200, 'name@example.com'],
    ['npi', 'Provider NPI', 40, ''],
    ['taxId', 'Federal Tax ID', 40, '']
  ];
  function plFind(id) { return nbProv.practices.filter(function (x) { return N().idArg(x.id) === id || x.id === id; })[0] || null; }
  function plDocs(prId) {
    return nbProv.physicians.filter(function (x) { return x.practiceId === prId; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function plInitials(name) {
    var w = String(name || '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : (w[0] || '').charAt(1))).toUpperCase();
  }
  function plFact(label, v) {
    return '<div class="bpl-fact"><dt>' + label + '</dt><dd>' + (v ? esc(v) : '<span class="bpl-none">—</span>') + '</dd></div>';
  }

  function renderNeuroProviderList() {
    var mount = document.getElementById('neuroProviderListMount');
    if (!mount || !N()) return;
    nbProvLoad();
    var all = nbProv.practices.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var q = plQuery.trim().toLowerCase();
    var list = all.filter(function (x) {
      return !q || [x.name, x.address, x.phone, x.email, x.npi, x.taxId].concat(plDocs(x.id).map(function (d) { return nbPhysicianOf(d) + ' ' + (d.npi || ''); }))
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var h = nbHead('Billing Provider List',
      'Register each billing provider and its treating physicians once, then pick them on any neurologist bill.',
      '<button type="button" class="btn btn-primary" data-onclick="plEdit(\'\')">' + nbIcon('plus') + 'Register a Provider</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="showPage(\'neuroBilling\')">' + nbIcon('dollar') + 'Neurologist Billing</button>');
    if (all.length) {
      h += '<div class="rf-toolbar"><div class="rf-tabs"><span class="rf-tab active"><span class="nr-tl">Billing Providers <span class="rf-badge">' + all.length + '</span></span></span></div>'
        + '<div class="rf-search">' + nbIcon('search')
        + '<input id="plSearch" type="search" autocomplete="off" placeholder="Search practice, physician or NPI" value="' + esc(plQuery) + '" data-oninput="plSearch(this.value)">'
        + '</div></div>';
    }
    if (!all.length) {
      h += '<div class="card"><div class="card-body rf-empty">' + nbIcon('building', 'rf-empty-i') + '<b>No billing providers yet</b>'
        + '<p>Register a practice and its physicians, and they can be picked on every neurologist bill.</p>'
        + '<button type="button" class="rf-btn rf-btn-go" data-onclick="plEdit(\'\')">' + nbIcon('plus') + 'Register a Provider</button></div></div>';
    } else if (!list.length) {
      h += '<div class="card"><div class="card-body rf-empty">' + nbIcon('search', 'rf-empty-i') + '<b>Nothing matches “' + esc(plQuery) + '”</b>'
        + '<p>Try a practice name, a physician’s name or an NPI.</p></div></div>';
    } else {
      h += '<div class="bpl-grid">' + list.map(plCardHTML).join('') + '</div>';
    }
    N().paint(mount, 'page-neuroProviderList', h, []);
  }
  function plCardHTML(x) {
    var docs = plDocs(x.id), id = N().idArg(x.id);
    return '<article class="bpl-card">'
      + '<div class="bpl-top"><span class="bpl-mono" aria-hidden="true">' + esc(plInitials(x.name)) + '</span>'
        + '<div class="bpl-id"><button type="button" class="bpl-name" data-onclick="plView(\'' + id + '\')">' + esc(x.name) + '</button>'
          + '<span class="bpl-addr">' + (x.address ? esc(x.address) : '<span class="bpl-none">No address</span>') + '</span></div>'
        + '<div class="bpl-acts">'
          + '<button type="button" class="bpl-ic" title="Edit" aria-label="Edit ' + esc(x.name) + '" data-onclick="plEdit(\'' + id + '\')">' + nbIcon('edit') + '</button>'
          + '<button type="button" class="bpl-ic bpl-ic-del" title="Delete" aria-label="Delete ' + esc(x.name) + '" data-onclick="plDelete(\'' + id + '\')">' + nbIcon('trash') + '</button>'
        + '</div></div>'
      + '<dl class="bpl-facts">' + plFact('Phone', x.phone) + plFact('Email', x.email) + plFact('NPI', x.npi) + plFact('Federal Tax ID', x.taxId) + '</dl>'
      + '<button type="button" class="bpl-foot" data-onclick="plView(\'' + id + '\')">'
        + (docs.length ? '<span class="bpl-stack" aria-hidden="true">' + docs.slice(0, 3).map(function (d) { return '<span class="bpl-av">' + esc(plInitials(d.name)) + '</span>'; }).join('') + '</span>'
                       : '<span class="bpl-av bpl-av-empty" aria-hidden="true">' + nbIcon('user') + '</span>')
        + '<span class="bpl-count">' + (docs.length ? docs.length + (docs.length === 1 ? ' Treating Physician' : ' Treating Physicians') : 'No physicians yet') + '</span>'
        + nbIcon('chevron', 'bpl-chev') + '</button>'
      + '</article>';
  }
  function plShow(html) {
    npModalHost().innerHTML = '<div class="rf-modal-back" data-onclick="plBackdrop(event)">'
      + '<div class="rf-modal nb-modal bpl-modal" role="dialog" aria-modal="true" aria-labelledby="plTitle">' + html + '</div></div>';
    document.body.classList.add('rf-modal-open');
  }
  // A practice and its physicians, read-only, with the details the CMS-1500 prints.
  function plView(id) {
    var x = plFind(id); if (!x) return;
    plModal = { mode: 'view', id: x.id };
    var docs = plDocs(x.id), aid = N().idArg(x.id);
    plShow('<div class="rf-modal-hd"><div class="bpl-hd"><span class="bpl-mono" aria-hidden="true">' + esc(plInitials(x.name)) + '</span>'
        + '<div><h2 id="plTitle">' + esc(x.name) + '</h2>' + (x.address ? '<p>' + esc(x.address) + '</p>' : '') + '</div></div>'
        + '<button type="button" class="rf-x" aria-label="Close" data-onclick="plClose()">&times;</button></div>'
      + '<div class="rf-modal-body">'
        + '<dl class="bpl-facts bpl-facts-lg">' + plFact('Phone', x.phone) + plFact('Email', x.email) + plFact('Provider NPI', x.npi) + plFact('Federal Tax ID', x.taxId) + '</dl>'
        + '<div class="bpl-sec-hd"><h3>Treating Physicians <span class="bpl-badge">' + docs.length + '</span></h3></div>'
        + (docs.length
          ? '<div class="bpl-docs"><div class="bpl-docs-hd"><span>Physician or Supplier, Degrees or Credentials</span><span>NPI</span></div>'
            + docs.map(function (d) {
                return '<div class="bpl-doc"><div class="bpl-doc-who"><span class="bpl-av">' + esc(plInitials(d.name)) + '</span><b>' + esc(nbPhysicianOf(d)) + '</b></div>'
                  + '<span class="bpl-doc-npi">' + (d.npi ? esc(d.npi) : '<span class="bpl-none">—</span>') + '</span></div>';
              }).join('') + '</div>'
          : '<div class="bpl-empty">No physicians registered for this practice yet. Click Edit to add them.</div>')
      + '</div>'
      + '<div class="rf-modal-ft"><button type="button" class="rf-btn rf-btn-quiet" data-onclick="plClose()">Close</button>'
        + '<button type="button" class="rf-btn rf-btn-go" data-onclick="plEdit(\'' + aid + '\')">' + nbIcon('edit') + 'Edit Provider &amp; Physicians</button></div>');
  }
  function plDocRow(d) {
    d = d || {};
    return '<div class="bpl-row" data-id="' + esc(d.id || '') + '">'
      + '<div class="rf-f bpl-cell bpl-cell-name"><input class="bpl-d-name" type="text" maxlength="200" placeholder="e.g. Jane Doe" aria-label="Physician name" value="' + esc(d.name || '') + '"></div>'
      + '<div class="rf-f bpl-cell"><select class="bpl-d-cred" aria-label="Degree or credential" data-onchange="plCred(this)"><option value="">— Select —</option>'
        + NB_CREDENTIALS.map(function (c) { return '<option' + (d.cred === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>'
        + '<input class="bpl-d-other" type="text" maxlength="40" placeholder="Type it, e.g. DO" aria-label="Other degree or credential" value="' + esc(d.credOther || '') + '"' + (d.cred === 'Other' ? '' : ' hidden') + '></div>'
      + '<div class="rf-f bpl-cell"><input class="bpl-d-npi" type="text" maxlength="40" placeholder="NPI" aria-label="Physician NPI" value="' + esc(d.npi || '') + '"></div>'
      + '<button type="button" class="bpl-ic bpl-ic-del" title="Remove" aria-label="Remove this physician" data-onclick="plRemoveDoc(this)">' + nbIcon('trash') + '</button>'
      + '</div>';
  }
  // Register or edit a practice and its physicians in one window.
  function plEdit(id) {
    var x = id ? plFind(id) : null;
    if (id && !x) return;
    plModal = { mode: 'edit', id: x ? x.id : '' };
    var docs = x ? plDocs(x.id) : [];
    var f = function (d) {
      var k = d[0];
      return '<div class="rf-f' + (k === 'address' || k === 'name' ? ' pl-wide' : '') + '"><label for="pl_' + k + '">' + d[1] + (k === 'name' ? '<span class="req-star" aria-hidden="true">*</span>' : '') + '</label>'
        + '<input id="pl_' + k + '" type="' + (k === 'email' ? 'email' : 'text') + '" maxlength="' + d[2] + '" value="' + esc(x ? x[k] || '' : '') + '"' + (d[3] ? ' placeholder="' + esc(d[3]) + '"' : '') + (k === 'name' ? ' required' : '') + '></div>';
    };
    plShow('<div class="rf-modal-hd"><div><h2 id="plTitle">' + (x ? 'Edit Billing Provider' : 'Register a Billing Provider') + '</h2></div>'
        + '<button type="button" class="rf-x" aria-label="Close" data-onclick="plClose()">&times;</button></div>'
      + '<div class="rf-modal-body">'
        + '<div class="bpl-sec-hd bpl-sec-first"><h3>' + nbIcon('building') + 'Practice</h3></div>'
        + '<div class="rf-pair pl-pair">' + PL_FIELDS.map(f).join('') + '</div>'
        + '<div class="bpl-sec-hd"><h3>' + nbIcon('user') + 'Treating Physicians</h3>'
          + '<button type="button" class="rf-btn rf-btn-quiet nb-btn-sm" data-onclick="plAddDoc()">' + nbIcon('plus') + 'Add Physician</button></div>'
        + '<div class="bpl-rows-hd" aria-hidden="true"><span>Physician Name</span><span>Degree or Credential</span><span>NPI</span><span></span></div>'
        + '<div id="plDocs">' + (docs.length ? docs.map(plDocRow).join('') : plDocRow()) + '</div>'
        + '<div class="nr-err" id="plErr" role="alert" hidden></div>'
      + '</div>'
      + '<div class="rf-modal-ft"><button type="button" class="rf-btn rf-btn-quiet" data-onclick="plClose()">Cancel</button>'
        + '<button type="button" class="rf-btn rf-btn-go" data-onclick="plSave()">' + nbIcon('check') + (x ? 'Save Changes' : 'Register Provider') + '</button></div>');
    var first = document.getElementById('pl_name'); if (first) first.focus();
  }
  function plAddDoc() {
    var box = document.getElementById('plDocs'); if (!box) return;
    box.insertAdjacentHTML('beforeend', plDocRow());
    var rows = box.querySelectorAll('.bpl-row');
    var n = rows[rows.length - 1].querySelector('.bpl-d-name'); if (n) n.focus();
  }
  function plRemoveDoc(btn) {
    var row = btn && btn.closest ? btn.closest('.bpl-row') : null; if (!row) return;
    var box = row.parentNode; row.remove();
    if (box && !box.querySelector('.bpl-row')) box.insertAdjacentHTML('beforeend', plDocRow());
  }
  function plCred(sel) {
    var other = sel && sel.parentNode ? sel.parentNode.querySelector('.bpl-d-other') : null;
    if (other) { other.hidden = sel.value !== 'Other'; if (sel.value === 'Other') other.focus(); }
  }
  function plClose() {
    plModal = null;
    npModalHost().innerHTML = '';
    document.body.classList.remove('rf-modal-open');
  }
  function plBackdrop(ev) { if (ev && ev.target === ev.currentTarget) plClose(); }
  function plSave() {
    if (!plModal || plModal.mode !== 'edit') return;
    var val = function (k) { var el = document.getElementById('pl_' + k); return el ? String(el.value || '').trim() : ''; };
    var err = document.getElementById('plErr');
    var fail = function (msg, el) {
      if (err) { err.hidden = false; err.innerHTML = nbIcon('alert') + esc(msg); }
      if (typeof el === 'string') el = document.getElementById('pl_' + el);
      if (el) el.focus();
    };
    var entry = {};
    PL_FIELDS.forEach(function (d) { entry[d[0]] = val(d[0]); });
    if (!entry.name) return fail('Enter the practice name.', 'name');
    if (entry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return fail('Enter the email as name@example.com.', 'email');
    var id = plModal.id;
    if (nbProv.practices.some(function (x) { return x.id !== id && nbSame(x.name, entry.name); })) return fail('A provider named “' + entry.name + '” is already on the list.', 'name');
    entry.id = id || nbNewId();
    // The physicians: rows left empty are skipped; a row with anything in it needs a name.
    var docs = [], bad = null;
    Array.prototype.forEach.call(document.querySelectorAll('#plDocs .bpl-row'), function (row) {
      if (bad) return;
      var get = function (c) { var el = row.querySelector(c); return el ? String(el.value || '').trim() : ''; };
      var d = { name: get('.bpl-d-name'), cred: get('.bpl-d-cred'), credOther: get('.bpl-d-other'), npi: get('.bpl-d-npi') };
      if (d.cred !== 'Other') d.credOther = '';
      if (!d.name && !d.cred && !d.npi && !d.credOther) return;
      if (!d.name) { bad = ['Enter the physician’s name, or remove the row.', row.querySelector('.bpl-d-name')]; return; }
      if (docs.some(function (o) { return nbSame(nbPhysicianOf(o), nbPhysicianOf(d)); })) { bad = ['“' + nbPhysicianOf(d) + '” is listed twice.', row.querySelector('.bpl-d-name')]; return; }
      d.id = row.getAttribute('data-id') || nbNewId();
      d.practiceId = entry.id;
      if (NB_CREDENTIALS.indexOf(d.cred) === -1) d.cred = '';
      Object.keys(d).forEach(function (k) { if (!d[k] && k !== 'cred') delete d[k]; });
      docs.push(d);
    });
    if (bad) return fail(bad[0], bad[1]);
    Object.keys(entry).forEach(function (k) { if (k !== 'id' && k !== 'name' && !entry[k]) delete entry[k]; });
    plClose();
    var byName = function (a, b) { return String(a.name).localeCompare(String(b.name)); };
    nbProvWrite(function (list) {
      var at = -1;
      list.practices.forEach(function (x, i) { if (x.id === entry.id) at = i; });
      if (at >= 0) list.practices[at] = entry; else list.practices.push(entry);
      list.practices.sort(byName);
      list.physicians = list.physicians.filter(function (d) { return d.practiceId !== entry.id; }).concat(docs).sort(byName);
    }, 'The billing provider could not be saved').then(function (ok) {
      renderNeuroProviderList();
      if (ok) showToast(id ? 'Billing provider updated. Bills already saved keep the details they were saved with.' : 'Billing provider registered. It can now be picked on any neurologist bill.', 'ok');
    });
    renderNeuroProviderList();
  }
  function plDelete(id) {
    var x = plFind(id); if (!x) return;
    var n = plDocs(x.id).length;
    ctgConfirm('Remove “' + x.name + '”' + (n ? ' and its ' + (n === 1 ? 'physician' : n + ' physicians') : '') + ' from the Billing Provider List? Bills already saved with them keep their details.',
      { title: 'Remove billing provider', okLabel: 'Remove', danger: true }).then(function (ok) {
      if (!ok) return;
      nbProvWrite(function (list) {
        list.practices = list.practices.filter(function (y) { return y.id !== x.id; });
        list.physicians = list.physicians.filter(function (d) { return d.practiceId !== x.id; });
      }, 'The billing provider could not be removed')
        .then(function (done) { renderNeuroProviderList(); if (done) showToast('Billing provider removed from the list.', 'ok'); });
      renderNeuroProviderList();
    });
  }
  function plSearch(v) {
    plQuery = String(v || '');
    renderNeuroProviderList();
    var box = document.getElementById('plSearch');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }

  /* =========================== Neurologist Payments ========================= */
  var npTab = 'owed';           // 'owed' | 'paid' | 'history'
  var npQuery = '';
  var npOpen = {};              // patient id -> payment history shown
  var npModal = null;           // { id } while the Record Payment window is open
  var npLastTab = null;         // the tab last painted (its table eases in when it changes)
  var npJustOpened = null;      // a payment history just opened (it eases in once)

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
    N().paint(mount, 'page-neuroPayments', h, [npTab !== npLastTab && '.rf-toolbar + .card',
      npJustOpened && '.nb-sub-row[data-id="' + N().idArg(npJustOpened) + '"]']);
    npLastTab = npTab; npJustOpened = null;
  }

  function npKpis(billed) {
    var owed = 0, month = N().today().slice(0, 7), monthPaid = 0, allPaid = 0, oldest = null;
    billed.forEach(function (p) {
      var b = nbBill(p), t = nbTotals(b);
      allPaid += t.paid;
      if (t.balance > 0) {
        owed += t.balance;
        var since = N().daysSince(nbFirstService(b));
        if (since !== null && (oldest === null || since > oldest)) oldest = since;
      }
      (b.payments || []).forEach(function (x) { if (String(x.date || '').slice(0, 7) === month) monthPaid += nbMoney(x.amount); });
    });
    return '<div class="nr-kpis">'
      + nbTile('k-pending', 'wallet', 'Balance Owed', nbFmt(Math.round(owed * 100) / 100))
      + nbTile('k-done', 'check', 'Paid This Month', nbFmt(Math.round(monthPaid * 100) / 100))
      + nbTile('k-total', 'dollar', 'Paid All Time', nbFmt(Math.round(allPaid * 100) / 100))
      + nbTile('k-progress', 'clock', 'Oldest Unpaid', oldest === null ? '—' : oldest + (oldest === 1 ? ' day' : ' days'))
      + '</div>';
  }

  function npToolbar(billed) {
    var owed = billed.filter(function (p) { return nbTotals(nbBill(p)).balance > 0; }).length;
    var pays = billed.reduce(function (n, p) { return n + (nbBill(p).payments || []).length; }, 0);
    var tab = function (key, label, count) {
      return '<button type="button" class="rf-tab' + (npTab === key ? ' active' : '') + '" data-onclick="npSetTab(\'' + key + '\')">'
        + '<span class="nr-tl">' + label + ' <span class="rf-badge">' + count + '</span></span></button>';
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
        h += '<tr class="nb-sub-row" data-id="' + id + '"><td colspan="8">' + (pays.length
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
  function npToggle(id) {
    var p = nbFind(id); if (!p) return;
    npOpen[p.id] = !npOpen[p.id];
    if (npOpen[p.id]) npJustOpened = p.id;
    renderNeuroPayments();
  }
  function npSetTab(t) { npTab = t; renderNeuroPayments(); }
  function npSearch(v) {
    npQuery = String(v || '');
    renderNeuroPayments();
    var box = document.getElementById('npSearch');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (npModal) npClosePay(); else if (plModal) plClose();
  });

  window.renderNeuroBilling = renderNeuroBilling;
  window.nbPickPractice = nbPickPractice;
  window.nbPickPhysician = nbPickPhysician;
  window.renderNeuroPayments = renderNeuroPayments;
  window.renderNeuroProviderList = renderNeuroProviderList;
  window.plView = plView;
  window.plEdit = plEdit;
  window.plClose = plClose;
  window.plBackdrop = plBackdrop;
  window.plSave = plSave;
  window.plDelete = plDelete;
  window.plSearch = plSearch;
  window.plAddDoc = plAddDoc;
  window.plRemoveDoc = plRemoveDoc;
  window.plCred = plCred;
  window.nbSelect = nbSelect;
  window.nbItemKey = nbItemKey;
  window.nbPickToggle = nbPickToggle;
  window.nbSetFilter = nbSetFilter;
  window.nbSearch = nbSearch;
  window.nbRefresh = nbRefresh;
  window.nbLine = nbLine;
  window.nbField = nbField;
  window.nbClearAssign = nbClearAssign;
  window.nbSigUpload = nbSigUpload;
  window.nbSigRemove = nbSigRemove;
  window.nbAddLine = nbAddLine;
  window.nbRemoveLine = nbRemoveLine;
  window.nbSaveBill = nbSaveBill;
  window.nbOpenReferral = nbOpenReferral;
  window.nbGoPay = nbGoPay;
  window.nbDownloadPdf = nbDownloadPdf;
  window.nbBuildBillPdf = nbBuildBillPdf;
  window.npOpenPay = npOpenPay;
  window.npClosePay = npClosePay;
  window.npBackdrop = npBackdrop;
  window.npSavePay = npSavePay;
  window.npDeletePay = npDeletePay;
  window.npToggle = npToggle;
  window.npSetTab = npSetTab;
  window.npSearch = npSearch;
})();
