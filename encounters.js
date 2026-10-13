(function () {
  'use strict';

  const ENC_FILTERS_KEY = 'ctg_enc_saved_filters_v1';
  const ENC_COLS_KEY = 'ctg_enc_columns_v1';

  // Fixed option lists - copied verbatim from the reference screen.
  const ENC_STATUS_OPTIONS = ['In-Progress', 'Signed', 'Saved', 'Nurse Review', 'Nurse Escalation', 'Supervisor Request'];
  const ENC_CLAIM_STATUS_OPTIONS = ['In Progress', 'Approved', 'On Hold', 'Finalized Paid', 'Sent To 1st', 'Denied',
    'Received', 'Errors', 'Send To 2nd', 'Send To 3rd', 'Bill Patient', 'Print 1st', 'Print 2nd', 'Print 3rd',
    'Sent To 2nd', 'Sent To 3rd', 'Accepted By Ins', 'Forwarded', 'Fax', 'Partially Paid', 'Claim Sent', 'Claim Finalized'];
  const ENC_SUPERBILL_OPTIONS = ['Not Entered', 'Open', 'Finalized', 'Non Billable', 'Finalize And Close Window',
    'Missing Insurance', 'Missing Codes', 'Issue Found', 'Ready for Review', 'Missing OP Report',
    'Missing Patient Demographics', 'Auth Required', 'On hold'];
  const ENC_REFERRED_BY_OPTIONS = ['Donald W. Hirsh D.C.', 'Dr. Jackie Syme', 'Dr. Kurylas', 'Dr. Stephen Kurylas',
    'Joshua Schmerling', 'Nicholas Grande', 'Stephen Rothschild'];
  const ENC_PROVIDER_OPTIONS = ['Vincent G Friedman', 'SMART Medical', 'Nicholas Grande'];
  const ENC_DATE_RANGE_OPTIONS = ['Today', 'This Week', 'Next Week', 'Next Two Week', 'Last Week', 'Last Two Week',
    'This Month', 'Next Month', 'Next Two Month'];
  const ENC_PROGRAM_OPTIONS = ['None', 'Discharged'];
  // The reference's Visit Type menu carries a few types this portal doesn't
  // schedule yet; the union keeps the menu faithful while still matching real
  // appointment data. Real VISIT_TYPES + custom config types get merged in at
  // render time.
  const ENC_VISIT_TYPE_EXTRA = ['ACE Virtual Screening', 'Consents', 'Discharge', 'NP Exam- Neuro-Only',
    'NP Exam_Virtual Neuro', 'Virtual Neuro'];
  // A representative slice of the reference payer list (the full EHR list runs
  // to hundreds). Kept as reference options only.
  const ENC_PAYER_OPTIONS = [
    'AAA Mid-Atlantic', 'AARP HealthUnited', 'AARP', 'ACE Medicare Supplement', 'Aetna', 'Aetna Medicare',
    'Aetna NAP', 'Aetna Senior Supplemental', 'Attorney', 'BlueCross BlueShield', 'Cigna', 'Humana',
    'Medicare', 'Self Pay', 'United Healthcare', 'Workers Comp'];

  // All result columns in reference order. `always:true` = not in the Columns
  // toggle menu (the leading action links). Everything else is toggleable.
  const ENC_COLUMNS = [
    { key: 'select', label: 'Select' },
    { key: 'superbillStatus', label: 'Superbill Status' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'primaryInsurer', label: 'Primary Insurer' },
    { key: 'cptCodes', label: 'CPTCodes' },
    { key: 'icdCodes', label: 'ICD Codes' },
    { key: 'charges', label: 'Charges' },
    { key: 'acc', label: 'Acc#' },
    { key: 'encounterNo', label: 'Encounter#' },
    { key: 'encounterDate', label: 'Encounter Date' },
    { key: 'claimDueDate', label: 'Claim Due Date' },
    { key: 'claimStatus', label: 'Claim Status' },
    { key: 'facility', label: 'Facility' },
    { key: 'provider', label: 'Provider' },
    { key: 'roomNo', label: 'RoomNo' },
    { key: 'healthStatus', label: 'Health Status' },
    { key: 'program', label: 'Program' },
    { key: 'noteStatus', label: 'Note Status' },
    { key: 'visitType', label: 'Visit Type' },
    { key: 'lastEncDt', label: 'Last Enc Dt' },
    { key: 'referredBy', label: 'Referred By' }
  ];

  let encFilters = encBlankFilters();
  let encDateBasis = 'encounter';   // 'encounter' | 'created'
  let encVisibleCols = null;         // Set of visible column keys
  let encFilterOpen = true;
  let encSelectedIds = {};           // per-row checkbox selection

  function encBlankFilters() {
    return {
      account: '', name: '', address: '', address2: '', mobile: '', home: '', encounterNo: '',
      facility: '', visitType: '', provider: '', referredBy: '', payerName: '',
      claimStatus: '', healthStatus: '', room: '', icd: '', cptCode: '',
      payerClaimControl: '', filterName: '', dateRange: 'Today', begin: '', end: '',
      claimDueFrom: '', claimDueTo: '', defaultOnly: false,
      status: new Set(), superbill: new Set(), program: new Set()
    };
  }

  function encEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function encToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function encAppts() { return (typeof ctgAppointments !== 'undefined' && Array.isArray(ctgAppointments)) ? ctgAppointments : []; }
  function encPatient(id) { return (typeof getPatient === 'function') ? getPatient(id) : null; }
  function encFacilities() { return (typeof APPT_FACILITIES !== 'undefined') ? APPT_FACILITIES : ['Concussion Therapy Group']; }
  // Falls back to the patient's real ACE diagnosis codes (the same list the
  // Patient List detail page and Patient Chart's Diagnosis tab show) when
  // nothing's been entered directly on Billing yet - keeps this column from
  // reading blank for every encounter of a patient who's actually had an ACE.
  function encAceIcdCodes(p) {
    const codes = (p && p.ace && Array.isArray(p.ace.diagnosisCodes)) ? p.ace.diagnosisCodes : [];
    return codes.join(', ');
  }

  // Deterministic id -> number hash so Acc#/Encounter# are stable per record
  // without ever being written back to storage.
  function encHash(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function encAcctNo(p) {
    const stored = p && p.billing && p.billing.accountNo;
    if (stored) return String(stored);
    return String(1000 + (encHash('acct' + (p ? p.id : '')) % 9000));
  }
  function encEncounterNo(a) { return String(12000 + (encHash('enc' + a.id) % 9000)); }

  // Same fix as Care Administration's caCfg(): call apptCfgLoad() directly
  // instead of trusting the module-level apptCfg var, which is only ever
  // populated once Appointment Configs has actually been opened this session.
  function encCfg() { return (typeof apptCfgLoad === 'function') ? apptCfgLoad() : (typeof apptCfg !== 'undefined' ? apptCfg : null); }
  function encVisitTypeOptions() {
    const set = [];
    const push = n => { if (n && set.indexOf(n) === -1) set.push(n); };
    if (typeof VISIT_TYPES !== 'undefined') Object.keys(VISIT_TYPES).forEach(push);
    const cfg = encCfg();
    if (cfg && Array.isArray(cfg.visitTypes)) cfg.visitTypes.forEach(v => push(v.name));
    ENC_VISIT_TYPE_EXTRA.forEach(push);
    return set.sort((a, b) => a.localeCompare(b));
  }
  function encRoomOptions() {
    const cfg = encCfg();
    if (cfg && Array.isArray(cfg.rooms) && cfg.rooms.length) {
      return cfg.rooms.map(r => r.name + (r.facility ? ' - ' + r.facility : '')).sort((a, b) => a.localeCompare(b));
    }
    return [];
  }
  function encVisitLabel(v) { return (typeof apptVisitLabel === 'function') ? apptVisitLabel(v) : String(v || '').replace(/_/g, ' '); }
  function encProviderName(p) {
    const raw = (p && p.demographics && p.demographics.provider) || 'Nicholas Grande, DC';
    return raw.replace(/,?\s*(DC|MD|DO|PhD|PT|DPT)\.?$/i, '').trim() || 'Nicholas Grande';
  }

  // ---- date helpers ----
  function encPad(n) { return String(n).padStart(2, '0'); }
  function encFmtDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    return encPad(d.getMonth() + 1) + '/' + encPad(d.getDate()) + '/' + d.getFullYear();
  }
  function encFmtDateTime(iso, hhmm) {
    const d = new Date(iso + 'T' + (hhmm || '00:00') + ':00');
    if (isNaN(d)) return '';
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' ' + h + ':' + encPad(m) + ':00 ' + ap;
  }
  function encFmtStamp(isoStamp) {
    const d = new Date(isoStamp);
    if (isNaN(d)) return '';
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    return encPad(d.getMonth() + 1) + '/' + encPad(d.getDate()) + '/' + d.getFullYear() + ' ' + h + ':' + encPad(m) + ap;
  }
  function encISO(d) { return d.getFullYear() + '-' + encPad(d.getMonth() + 1) + '-' + encPad(d.getDate()); }
  function encToMMDDYYYY(d) { return encPad(d.getMonth() + 1) + '/' + encPad(d.getDate()) + '/' + d.getFullYear(); }
  function encParseInput(v) {
    // Accepts MM/DD/YYYY or YYYY-MM-DD
    const s = String(v || '').trim(); if (!s) return null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  // Turn a Date-Range preset into a [beginISO, endISO] window.
  function encRangeWindow(preset) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today), end = new Date(today);
    const dow = today.getDay();
    switch (preset) {
      case 'Today': break;
      case 'This Week': start.setDate(today.getDate() - dow); end.setDate(start.getDate() + 6); break;
      case 'Next Week': start.setDate(today.getDate() - dow + 7); end.setDate(start.getDate() + 6); break;
      case 'Next Two Week': start.setDate(today.getDate() - dow + 7); end.setDate(start.getDate() + 13); break;
      case 'Last Week': start.setDate(today.getDate() - dow - 7); end.setDate(start.getDate() + 6); break;
      case 'Last Two Week': start.setDate(today.getDate() - dow - 14); end.setDate(start.getDate() + 13); break;
      case 'This Month': start.setDate(1); end.setMonth(start.getMonth() + 1, 0); break;
      case 'Next Month': start.setMonth(today.getMonth() + 1, 1); end.setMonth(start.getMonth() + 1, 0); break;
      case 'Next Two Month': start.setMonth(today.getMonth() + 1, 1); end.setMonth(start.getMonth() + 2, 0); break;
      default: return null;
    }
    return [encISO(start), encISO(end)];
  }

  function encMMDDYYYYtoISO(mmddyyyy) {
    const m = String(mmddyyyy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0')) : '';
  }
  function encBillingGroupsForPatient(p) {
    if (!p || typeof getBillingStatementData !== 'function') return [];
    try { return (getBillingStatementData(p).groups) || []; } catch (e) { return []; }
  }
  function encBillingGroupForAppt(p, a) {
    const groups = encBillingGroupsForPatient(p);
    return groups.find(g => encMMDDYYYYtoISO(g.date) === a.date) || null;
  }
  function encArRowForGroup(p, group) {
    if (!p || !group) return null;
    try {
      if (typeof arSyncFromBilling === 'function') arSyncFromBilling(p);
      if (typeof arComputeTotals !== 'function') return null;
      const gid = 'arbill_' + (group.id || String(group.date || '').replace(/[^a-z0-9]/gi, '_'));
      return arComputeTotals(p).rows.find(r => r.id === gid) || null;
    } catch (e) { return null; }
  }
  // A billing group's own id maps onto a visit-type key already used by the
  // Appointments module (see VISIT_TYPES in appointments.js), so a synthetic
  // row (below) filters/labels the same way a real scheduled visit would.
  function encGroupVisitType(g) {
    const id = String((g && g.id) || '');
    if (id === 'ace') return 'ACE_Neuro Only';
    if (id === 'initialExam') return 'Day 2 Exam_Neuro Only';
    if (id.indexOf('dailyNote_') === 0) return 'Therapy Visits_Neuro Only';
    if (id.indexOf('reExam_') === 0) return 'Re-Exam_Neuro Only';
    if (id === 'finalExam') return 'Final Exam_Neuro Only';
    return '';
  }
  function encGroupKey(patientId, g) { return String(patientId || '') + '|' + ((g && g.id) || (g && g.date) || ''); }

  // ---- build one encounter row from an appointment ----
  function encRowFromAppt(a) {
    const p = encPatient(a.patientId);
    const demo = (p && p.demographics) || {};
    const billing = (p && p.billing) || {};
    const insurer = demo.lawFirm ? 'Attorney' : (demo.insurer || demo.primaryInsurer || '');
    const group = encBillingGroupForAppt(p, a);
    const arRow = encArRowForGroup(p, group);
    const cptCodes = group ? Array.from(new Set((group.rows || []).map(r => r.code).filter(Boolean))).join(', ') : (billing.cptCodes || '');
    const chargesNum = group ? (group.subtotal && group.subtotal.charges) || 0
      : (parseFloat(String(billing.charges || '').replace(/[^0-9.]/g, '')) || 0);
    const claimStatus = arRow ? arRow.status : (billing.claimStatus || '');
    const encISODate = a.date;
    return {
      apptId: a.id,
      patientId: a.patientId || '',
      superbillStatus: billing.superbillStatus || 'Not Entered',
      firstName: demo.firstName || (a.patientName ? a.patientName.split(' ')[0] : '') || '',
      lastName: demo.lastName || (a.patientName ? a.patientName.split(' ').slice(1).join(' ') : '') || '',
      primaryInsurer: insurer,
      cptCodes: cptCodes,
      icdCodes: billing.icdCodes || encAceIcdCodes(p),
      charges: chargesNum,
      acc: encAcctNo(p),
      encounterNo: encEncounterNo(a),
      encISODate: encISODate,
      createdISO: (a.createdAt || '').slice(0, 10),
      encounterDate: encFmtDateTime(a.date, a.start),
      claimDueDate: encFmtDate(a.date),
      claimStatus: claimStatus,
      facility: a.facility || encFacilities()[0],
      provider: encProviderName(p),
      roomNo: a.room || '',
      healthStatus: demo.healthStatus || '',
      program: demo.program || '',
      noteStatus: 'In-Progress',
      visitType: a.visitType || '',
      visitTypeLabel: encVisitLabel(a.visitType || ''),
      lastEncDt: encFmtStamp(a.updatedAt || a.createdAt),
      referredBy: demo.referredBy || '',
      // Internal bookkeeping only (not a column, never rendered/exported) -
      // lets encAllRows know this billing group is already represented here
      // so it isn't also surfaced as a synthetic billing-only row below.
      _groupKey: group ? encGroupKey(a.patientId, group) : null
    };
  }

  function encRowFromBillingGroup(p, g) {
    const demo = (p && p.demographics) || {};
    const billing = (p && p.billing) || {};
    const insurer = demo.lawFirm ? 'Attorney' : (demo.insurer || demo.primaryInsurer || '');
    const arRow = encArRowForGroup(p, g);
    const cptCodes = Array.from(new Set((g.rows || []).map(r => r.code).filter(Boolean))).join(', ');
    const chargesNum = (g.subtotal && g.subtotal.charges) || 0;
    const claimStatus = arRow ? arRow.status : '';
    const encISODate = encMMDDYYYYtoISO(g.date);
    const syntheticId = 'billing_' + p.id + '_' + (g.id || g.date);
    const visitType = encGroupVisitType(g);
    return {
      apptId: syntheticId,
      patientId: p.id || '',
      superbillStatus: billing.superbillStatus || 'Not Entered',
      firstName: demo.firstName || '',
      lastName: demo.lastName || '',
      primaryInsurer: insurer,
      cptCodes: cptCodes,
      icdCodes: billing.icdCodes || encAceIcdCodes(p),
      charges: chargesNum,
      acc: encAcctNo(p),
      encounterNo: encEncounterNo({ id: syntheticId }),
      encISODate: encISODate,
      createdISO: encISODate,
      encounterDate: encFmtDate(encISODate),
      claimDueDate: encFmtDate(encISODate),
      claimStatus: claimStatus,
      facility: encFacilities()[0],
      provider: g.provider || encProviderName(p),
      roomNo: '',
      healthStatus: demo.healthStatus || '',
      program: demo.program || '',
      noteStatus: 'In-Progress',
      visitType: visitType,
      visitTypeLabel: encVisitLabel(visitType),
      lastEncDt: encFmtStamp(p.updatedAt || p.createdAt),
      referredBy: demo.referredBy || '',
      _groupKey: null
    };
  }

  function encAllRows() {
    const apptRows = encAppts().map(encRowFromAppt);
    const covered = {};
    apptRows.forEach(r => { if (r._groupKey) covered[r._groupKey] = true; });
    const billingOnlyRows = [];
    const patients = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    patients.forEach(p => {
      encBillingGroupsForPatient(p).forEach(g => {
        if (!g.date) return; // no service date recorded yet - nothing to place on the grid
        const key = encGroupKey(p.id, g);
        if (covered[key]) return; // already shown via a same-date appointment
        billingOnlyRows.push(encRowFromBillingGroup(p, g));
      });
    });
    return apptRows.concat(billingOnlyRows).sort((x, y) => {
      // Newest encounter first (date then start-time via the formatted stamp).
      return String(y.encISODate).localeCompare(String(x.encISODate));
    });
  }

  // ---- filtering ----
  function encMatches(row) {
    const f = encFilters;
    const has = (v, needle) => String(v || '').toLowerCase().indexOf(String(needle).trim().toLowerCase()) !== -1;
    if (f.account && !has(row.acc, f.account)) return false;
    if (f.name && !has((row.firstName + ' ' + row.lastName), f.name) && !has((row.lastName + ' ' + row.firstName), f.name)) return false;
    if (f.encounterNo && !has(row.encounterNo, f.encounterNo)) return false;
    if (f.facility && row.facility !== f.facility) return false;
    if (f.visitType && row.visitType !== f.visitType) return false;
    if (f.provider && row.provider !== f.provider) return false;
    if (f.referredBy && row.referredBy !== f.referredBy) return false;
    if (f.room && row.roomNo !== f.room) return false;
    if (f.program && f.program.size && !f.program.has(row.program || 'None')) return false;
    if (f.claimStatus && row.claimStatus !== f.claimStatus) return false;
    if (f.healthStatus && row.healthStatus !== f.healthStatus) return false;
    if (f.cptCode && !has(row.cptCodes, f.cptCode)) return false;
    if (f.icd && !has(row.icdCodes, f.icd)) return false;
    if (f.status && f.status.size && !f.status.has(row.noteStatus)) return false;
    if (f.superbill && f.superbill.size && !f.superbill.has(row.superbillStatus)) return false;
    // Date window: the preset feeds Begin/End; an explicit Begin/End overrides.
    const basisISO = encDateBasis === 'created' ? row.createdISO : row.encISODate;
    const beginD = encParseInput(f.begin), endD = encParseInput(f.end);
    if (beginD && basisISO && basisISO < encISO(beginD)) return false;
    if (endD && basisISO && basisISO > encISO(endD)) return false;
    return true;
  }

  function encFilteredRows() { return encAllRows().filter(encMatches); }

  // ---- columns ----
  function encLoadColumns() {
    if (encVisibleCols) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ENC_COLS_KEY) || 'null'); } catch (e) {}
    if (Array.isArray(saved) && saved.length) encVisibleCols = new Set(saved);
    else encVisibleCols = new Set(ENC_COLUMNS.map(c => c.key));
  }
  function encSaveColumns() {
    try { localStorage.setItem(ENC_COLS_KEY, JSON.stringify(Array.from(encVisibleCols))); } catch (e) {}
  }
  function encColVisible(key) { encLoadColumns(); return encVisibleCols.has(key); }

  // ============================ render ============================
  function renderPatientEncounters() {
    const mount = document.getElementById('encMount');
    if (!mount) return;
    encLoadColumns();
    mount.innerHTML = encShellHTML();
    encRenderRows();
  }

  function encInput(id, ph, val, extra) {
    return '<input type="text" id="' + id + '" placeholder="' + encEsc(ph || '') + '" value="' + encEsc(val || '') + '"' + (extra || '') + '>';
  }
  function encSelect(id, options, cur, placeholder) {
    const opts = ['<option value="">' + encEsc(placeholder || 'Select All') + '</option>']
      .concat(options.map(o => '<option value="' + encEsc(o) + '"' + (o === cur ? ' selected' : '') + '>' + encEsc(o) + '</option>'));
    return '<select id="' + id + '" data-onchange="encOnField(\'' + id + '\',this.value)">' + opts.join('') + '</select>';
  }
  // Reusable checkbox multi-select (Status, Superbill Status, Program).
  function encMultiSelect(id, options, selectedSet, placeholder) {
    const label = selectedSet && selectedSet.size ? (selectedSet.size + ' selected') : (placeholder || 'Select All');
    const rows = options.map(o =>
      '<label class="acfg-msel-row"><input type="checkbox" value="' + encEsc(o) + '"' + (selectedSet && selectedSet.has(o) ? ' checked' : '')
      + ' data-onchange="encMselToggle(\'' + id + '\',this.value,this.checked)"><span>' + encEsc(o) + '</span></label>').join('');
    return '<div class="acfg-msel" id="' + id + '">'
      + '<button type="button" class="acfg-msel-btn" data-onclick="encMselOpen(event,\'' + id + '\')"><span id="' + id + 'Label">' + encEsc(label) + '</span>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="acfg-msel-panel">' + rows + '</div></div>';
  }
  function encField(label, control) {
    return '<div class="enc-field"><label>' + encEsc(label) + '</label>' + control + '</div>';
  }

  function encShellHTML() {
    const f = encFilters;
    const facilities = encFacilities();
    const visitTypes = encVisitTypeOptions();
    const rooms = encRoomOptions();

    // Column 1
    const col1 = encField('Account#', encInput('encAccount', '', f.account, ' data-oninput="encOnField(\'encAccount\',this.value)"'))
      + encField('Visit Type', encSelect('encVisitType', visitTypes.map(encVisitLabel), encVisitLabel(f.visitType), 'Select All'))
      + encField('Address', encInput('encAddress', '', f.address, ' data-oninput="encOnField(\'encAddress\',this.value)"'))
      + encField('Mobile#', encInput('encMobile', '', f.mobile, ' data-oninput="encOnField(\'encMobile\',this.value)"'))
      + encField('Status', encMultiSelect('encStatus', ENC_STATUS_OPTIONS, f.status, 'Select All'))
      + encField('Claim Status', encSelect('encClaimStatus', ENC_CLAIM_STATUS_OPTIONS, f.claimStatus, 'Select All'))
      + encField('Payer Name', encSelect('encPayerName', ENC_PAYER_OPTIONS, f.payerName, 'Select'))
      + encField('Begin', encInput('encBegin', 'MM/DD/YYYY', f.begin, ' data-oninput="encOnField(\'encBegin\',this.value)"'))
      + encField('Room', encSelect('encRoom', rooms, f.room, 'Select'))
      + '<div class="enc-field"><label>Claim Due Date</label><div class="enc-range"><span>From</span>' + encInput('encClaimDueFrom', '', f.claimDueFrom, ' data-oninput="encOnField(\'encClaimDueFrom\',this.value)"') + '<span>To</span>' + encInput('encClaimDueTo', '', f.claimDueTo, ' data-oninput="encOnField(\'encClaimDueTo\',this.value)"') + '</div></div>'
      + encField('Columns', encColumnsControl());

    // Column 2
    const col2 = encField('Name', encInput('encName', '', f.name, ' data-oninput="encOnField(\'encName\',this.value)"'))
      + encField('Provider', encSelect('encProvider', ENC_PROVIDER_OPTIONS, f.provider, 'Select All'))
      + encField('Address2', encInput('encAddress2', '', f.address2, ' data-oninput="encOnField(\'encAddress2\',this.value)"'))
      + encField('Superbill Status', encMultiSelect('encSuperbill', ENC_SUPERBILL_OPTIONS, f.superbill, 'Select All'))
      + encField('ICD', encInput('encIcd', 'Select/Search Diagnosis by Code or Description', f.icd, ' class="enc-icd" data-oninput="encOnField(\'encIcd\',this.value)"'))
      + encField('Payer Claim Control Number', encInput('encPayerClaimControl', '', f.payerClaimControl, ' data-oninput="encOnField(\'encPayerClaimControl\',this.value)"'))
      + '<div class="enc-field enc-field-radios"><div class="enc-radio-row">'
        + '<label><input type="radio" name="encDateBasis" value="encounter"' + (encDateBasis === 'encounter' ? ' checked' : '') + ' data-onchange="encSetDateBasis(\'encounter\')"> Filter By Encounter Date</label>'
        + '<label><input type="radio" name="encDateBasis" value="created"' + (encDateBasis === 'created' ? ' checked' : '') + ' data-onchange="encSetDateBasis(\'created\')"> Filter By Encounter Created Date</label>'
      + '</div></div>'
      + encField('Date Range', encSelect('encDateRange', ENC_DATE_RANGE_OPTIONS, f.dateRange, 'Select'))
      + encField('End', encInput('encEnd', 'MM/DD/YYYY', f.end, ' data-oninput="encOnField(\'encEnd\',this.value)"'))
      + encField('Health Status', encSelect('encHealthStatus', [], f.healthStatus, 'Select'))
      + encField('Filter Name', encInput('encFilterName', '', f.filterName, ' data-oninput="encOnField(\'encFilterName\',this.value)"'));

    // Column 3
    const col3 = encField('Facility', encSelect('encFacility', facilities, f.facility, 'Select All'))
      + encField('Referred By', encSelect('encReferredBy', ENC_REFERRED_BY_OPTIONS, f.referredBy, 'Select All'))
      + encField('Home#', encInput('encHome', '', f.home, ' data-oninput="encOnField(\'encHome\',this.value)"'))
      + encField('Encounter#', encInput('encEncounterNo', '', f.encounterNo, ' data-oninput="encOnField(\'encEncounterNo\',this.value)"'))
      + encField('CPT Code', encInput('encCptCode', '', f.cptCode, ' data-oninput="encOnField(\'encCptCode\',this.value)"'))
      + '<div class="enc-field enc-field-inline"><label>Default</label><input type="checkbox" id="encDefault"' + (f.defaultOnly ? ' checked' : '') + ' data-onchange="encSetDefault(this.checked)"></div>'
      + encField('Program', encMultiSelect('encProgram', ENC_PROGRAM_OPTIONS, typeof f.program === 'object' ? f.program : new Set(), 'Select'));

    return '<div class="enc-topbar">'
      + '<div class="enc-topbar-title">Patient Encounters</div>'
      + '<div class="enc-topbar-actions">'
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="encAddPatient()">Add Patient</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encAddCharges()">Add Charges</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encSendClaim()">Send Claim</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encSetRefreshTime()">Set refresh time</button>'
        + '<button type="button" class="enc-icon-btn" data-onclick="renderPatientEncounters()" title="Refresh" aria-label="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>'
      + '</div></div>'
      + '<div class="enc-filter-card">'
      + '<button type="button" class="enc-filter-head' + (encFilterOpen ? ' open' : '') + '" data-onclick="encToggleFilter()"><span>Click Here To Filter</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="enc-filter-body"' + (encFilterOpen ? '' : ' data-cs="'+__cs+'display:none"') + '>'
      + '<div class="enc-filter-grid"><div class="enc-col">' + col1 + '</div><div class="enc-col">' + col2 + '</div><div class="enc-col">' + col3 + '</div></div>'
      + '<div class="enc-filter-actions">'
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="encApply()">Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encSaveFilter()">Save Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encDeleteFilter()">Delete Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="encClearFilter()">Clear Filter</button>'
      + '</div></div></div>'
      + '<div class="enc-results-bar"><div id="encTotals" class="enc-totals"></div><div class="enc-results-actions"><button type="button" class="btn btn-ghost btn-sm" data-onclick="encSaveView()">Save</button><button type="button" class="btn btn-ghost btn-sm" data-onclick="encExport()">Export</button></div></div>'
      + '<div class="enc-table-wrap"><table class="enc-table" id="encTable"></table></div>';
  }

  function encColumnsControl() {
    encLoadColumns();
    const allOn = ENC_COLUMNS.every(c => encVisibleCols.has(c.key));
    const rows = '<label class="acfg-msel-row enc-col-checkall"><input type="checkbox"' + (allOn ? ' checked' : '') + ' data-onchange="encToggleAllCols(this.checked)"><span>Check All</span></label>'
      + ENC_COLUMNS.map(c => '<label class="acfg-msel-row"><input type="checkbox" value="' + c.key + '"' + (encVisibleCols.has(c.key) ? ' checked' : '') + ' data-onchange="encToggleCol(\'' + c.key + '\',this.checked)"><span>' + encEsc(c.label) + '</span></label>').join('');
    return '<div class="acfg-msel" id="encColsMsel">'
      + '<button type="button" class="acfg-msel-btn" data-onclick="encMselOpen(event,\'encColsMsel\')"><span>All items checked</span>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="acfg-msel-panel enc-cols-panel">' + rows + '</div></div>';
  }

  function encRenderRows() {
    const table = document.getElementById('encTable');
    if (!table) return;
    const rows = encFilteredRows();
    const cols = ENC_COLUMNS.filter(c => c.key === 'select' ? encVisibleCols.has('select') : encVisibleCols.has(c.key));

    let thead = '<thead><tr><th class="enc-th-actions">Edit</th>';
    cols.forEach(c => {
      if (c.key === 'select') thead += '<th class="enc-th-select"><input type="checkbox" data-onchange="encToggleSelectAll(this.checked)"></th>';
      else thead += '<th>' + encEsc(c.label) + '</th>';
    });
    thead += '</tr></thead>';

    let tbody = '<tbody>';
    if (!rows.length) {
      tbody += '<tr><td class="enc-empty" colspan="' + (cols.length + 1) + '">No encounters match the current filter.</td></tr>';
    } else {
      rows.forEach(r => {
        tbody += '<tr>';
        tbody += '<td class="enc-links"><a data-onclick="encAlert(\'' + r.apptId + '\')">Alert</a><a data-onclick="encOpenNote(\'' + r.patientId + '\')">Open Note</a><a data-onclick="encSuperbill(\'' + r.apptId + '\')">Superbill</a><a data-onclick="encClaim(\'' + r.apptId + '\')">Claim</a></td>';
        cols.forEach(c => { tbody += '<td class="enc-col-' + c.key + '">' + encCell(r, c.key) + '</td>'; });
        tbody += '</tr>';
      });
    }
    tbody += '</tbody>';
    table.innerHTML = thead + tbody;

    const totalCharges = rows.reduce((s, r) => s + (r.charges || 0), 0);
    const totals = document.getElementById('encTotals');
    if (totals) totals.innerHTML = '<strong>Total Encounter:</strong> ' + rows.length + ' &nbsp; <strong>Total Charges:</strong> $' + totalCharges.toFixed(4);
  }

  function encDash(v) { return v == null || v === '' ? '<span class="enc-dash">—</span>' : encEsc(v); }
  function encIcdEntries(v) {
    const raw = String(v || '').trim();
    if (!raw) return [];
    return raw.split(/,\s+(?=\()/).map(s => s.trim()).filter(Boolean);
  }
  function encIcdChipsHtml(v) {
    const entries = encIcdEntries(v);
    if (!entries.length) return '<span class="enc-dash">—</span>';
    return '<div class="enc-icd-chips">' + entries.map(entry => {
      const m = entry.match(/^\((.+?)\)\s*(.*)$/);
      const code = m ? m[1] : '';
      const desc = m ? m[2] : entry;
      return '<div class="enc-icd-chip">' + (code ? '<span class="enc-icd-chip-code">' + encEsc(code) + '</span>' : '') + '<span class="enc-icd-chip-desc">' + encEsc(desc) + '</span></div>';
    }).join('') + '</div>';
  }
  // The cell itself just shows a compact "See ICD Codes" button so every row
  // stays the same short height - the full code+description list (built by
  // encIcdChipsHtml, same chip markup) only renders once the button is
  // clicked, inside a popup (see encViewIcdCodes/encShowIcdModal below).
  function encIcdCellHtml(r) {
    const count = encIcdEntries(r.icdCodes).length;
    if (!count) return '<span class="enc-dash">—</span>';
    return '<button type="button" class="enc-icd-btn" data-onclick="encViewIcdCodes(\'' + r.apptId + '\')">See ICD Code' + (count !== 1 ? 's' : '') + ' (' + count + ')</button>';
  }
  function encShowIcdModal(title, bodyHtml) {
    let ov = document.getElementById('encIcdModalOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'encIcdModalOverlay';
      ov.className = 'modal-overlay';
      ov.innerHTML = '<div class="modal" data-cs="'+__cs+'width:min(620px,100%);max-width:620px">'
        + '<div class="modal-hd"><div class="modal-title" id="encIcdModalTitle"></div><button class="modal-close" data-onclick="encCloseIcdModal()" aria-label="Close modal">×</button></div>'
        + '<div class="modal-body" data-cs="'+__cs+'max-height:70vh;overflow:auto" id="encIcdModalBody"></div>'
        + '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) encCloseIcdModal(); });
    }
    document.getElementById('encIcdModalTitle').textContent = title;
    document.getElementById('encIcdModalBody').innerHTML = bodyHtml;
    ov.classList.add('show');
  }
  function encCloseIcdModal() {
    const ov = document.getElementById('encIcdModalOverlay');
    if (ov) ov.classList.remove('show');
  }
  function encViewIcdCodes(apptId) {
    const row = encFilteredRows().find(r => r.apptId === apptId);
    if (!row) { encToast('Encounter not found', 'err'); return; }
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    encShowIcdModal('ICD Codes' + (name ? ' — ' + name : ''), encIcdChipsHtml(row.icdCodes));
  }
  function encCell(r, key) {
    switch (key) {
      case 'select': return '<input type="checkbox"' + (encSelectedIds[r.apptId] ? ' checked' : '') + ' data-onchange="encSelectRow(\'' + r.apptId + '\',this.checked)">';
      case 'superbillStatus': return encEsc(r.superbillStatus);
      case 'firstName': return encDash(r.firstName);
      case 'lastName': return encDash(r.lastName);
      case 'primaryInsurer': return encDash(r.primaryInsurer);
      case 'cptCodes': return encDash(r.cptCodes);
      case 'icdCodes': return encIcdCellHtml(r);
      case 'charges': return '$' + (r.charges || 0).toFixed(4);
      case 'acc': return encEsc(r.acc);
      case 'encounterNo': return encEsc(r.encounterNo);
      case 'encounterDate': return encEsc(r.encounterDate);
      case 'claimDueDate': return encEsc(r.claimDueDate);
      case 'claimStatus': return encDash(r.claimStatus);
      case 'facility': return encEsc(r.facility);
      case 'provider': return encDash(r.provider);
      case 'roomNo': return encDash(r.roomNo);
      case 'healthStatus': return encDash(r.healthStatus);
      case 'program': return encDash(r.program);
      case 'noteStatus': return '<span class="enc-note-status">' + encEsc(r.noteStatus) + '</span>';
      case 'visitType': return encDash(r.visitTypeLabel);
      case 'lastEncDt': return encEsc(r.lastEncDt);
      case 'referredBy': return encDash(r.referredBy);
      default: return '';
    }
  }

  // ============================ interaction ============================
  const ENC_FIELD_MAP = {
    encAccount: 'account', encName: 'name', encAddress: 'address', encAddress2: 'address2', encMobile: 'mobile',
    encHome: 'home', encEncounterNo: 'encounterNo', encClaimStatus: 'claimStatus', encPayerName: 'payerName',
    encBegin: 'begin', encEnd: 'end', encRoom: 'room', encClaimDueFrom: 'claimDueFrom', encClaimDueTo: 'claimDueTo',
    encProvider: 'provider', encIcd: 'icd', encPayerClaimControl: 'payerClaimControl', encHealthStatus: 'healthStatus',
    encFilterName: 'filterName', encFacility: 'facility', encReferredBy: 'referredBy', encCptCode: 'cptCode'
  };
  function encOnField(id, value) {
    if (id === 'encVisitType') {
      // Stored underscored; the menu shows the spaced label, so map back.
      const match = encVisitTypeOptions().find(v => encVisitLabel(v) === value);
      encFilters.visitType = match || '';
      return;
    }
    if (id === 'encDateRange') {
      encFilters.dateRange = value;
      const win = encRangeWindow(value);
      if (win) { encFilters.begin = encToMMDDYYYY(new Date(win[0] + 'T00:00:00')); encFilters.end = encToMMDDYYYY(new Date(win[1] + 'T00:00:00')); }
      const b = document.getElementById('encBegin'), e = document.getElementById('encEnd');
      if (b) b.value = encFilters.begin; if (e) e.value = encFilters.end;
      return;
    }
    const key = ENC_FIELD_MAP[id];
    if (key) encFilters[key] = value;
  }
  function encSetDateBasis(v) { encDateBasis = v; }
  function encSetDefault(on) { encFilters.defaultOnly = on; }

  function encMselOpen(ev, id) {
    ev.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    document.querySelectorAll('#encMount .acfg-msel.open').forEach(m => m.classList.remove('open'));
    if (!wasOpen) el.classList.add('open');
  }
  function encMselToggle(id, value, checked) {
    const bucket = id === 'encStatus' ? encFilters.status : id === 'encSuperbill' ? encFilters.superbill : id === 'encProgram' ? (encFilters.program instanceof Set ? encFilters.program : (encFilters.program = new Set())) : null;
    if (!bucket) return;
    if (checked) bucket.add(value); else bucket.delete(value);
    const lbl = document.getElementById(id + 'Label');
    if (lbl) lbl.textContent = bucket.size ? bucket.size + ' selected' : 'Select All';
  }

  function encToggleFilter() {
    encFilterOpen = !encFilterOpen;
    const body = document.querySelector('#encMount .enc-filter-body');
    const head = document.querySelector('#encMount .enc-filter-head');
    if (body) body.style.display = encFilterOpen ? '' : 'none';
    if (head) head.classList.toggle('open', encFilterOpen);
  }

  function encToggleCol(key, on) {
    encLoadColumns();
    if (on) encVisibleCols.add(key); else encVisibleCols.delete(key);
    encSaveColumns();
    encRenderRows();
  }
  function encToggleAllCols(on) {
    encLoadColumns();
    if (on) ENC_COLUMNS.forEach(c => encVisibleCols.add(c.key)); else encVisibleCols.clear();
    encSaveColumns();
    // Re-sync the individual checkboxes in the open panel.
    document.querySelectorAll('#encColsMsel .acfg-msel-panel input[type=checkbox]').forEach(cb => { cb.checked = on; });
    encRenderRows();
  }

  function encSelectRow(id, on) { if (on) encSelectedIds[id] = true; else delete encSelectedIds[id]; }
  function encToggleSelectAll(on) {
    encSelectedIds = {};
    if (on) encFilteredRows().forEach(r => { encSelectedIds[r.apptId] = true; });
    encRenderRows();
  }

  function encApply() { encRenderRows(); encToast('Filter applied', 'ok'); }
  function encClearFilter() {
    encFilters = encBlankFilters();
    encDateBasis = 'encounter';
    renderPatientEncounters();
  }

  // ---- named saved filters ----
  function encSavedFilters() {
    try { return JSON.parse(localStorage.getItem(ENC_FILTERS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function encWriteSavedFilters(obj) { try { localStorage.setItem(ENC_FILTERS_KEY, JSON.stringify(obj)); } catch (e) {} }
  function encSerializeFilters() {
    const f = encFilters;
    return Object.assign({}, f, { status: Array.from(f.status || []), superbill: Array.from(f.superbill || []), program: f.program instanceof Set ? Array.from(f.program) : [] });
  }
  function encSaveFilter() {
    const name = (encFilters.filterName || '').trim();
    if (!name) { encToast('Enter a Filter Name first', 'err'); return; }
    const all = encSavedFilters();
    all[name] = { basis: encDateBasis, filters: encSerializeFilters() };
    encWriteSavedFilters(all);
    encToast('Filter "' + name + '" saved ✓', 'ok');
  }
  function encDeleteFilter() {
    const name = (encFilters.filterName || '').trim();
    const all = encSavedFilters();
    if (!name || !all[name]) { encToast('No saved filter with that name', 'err'); return; }
    delete all[name];
    encWriteSavedFilters(all);
    encToast('Filter "' + name + '" deleted', 'ok');
  }
  function encSaveView() { encSaveColumns(); encToast('Column layout saved ✓', 'ok'); }

  // ---- export ----
  function encExport() {
    const rows = encFilteredRows();
    if (!rows.length) { encToast('Nothing to export', 'err'); return; }
    const cols = ENC_COLUMNS.filter(c => c.key !== 'select' && encVisibleCols.has(c.key));
    const header = cols.map(c => c.label);
    const csvVal = (r, key) => {
      if (key === 'charges') return '$' + (r.charges || 0).toFixed(4);
      if (key === 'visitType') return r.visitTypeLabel;
      return r[key] == null ? '' : String(r[key]);
    };
/* Spreadsheet formula injection: Excel runs a cell that starts with = + - @ (or a
       tab / carriage return) as a formula even inside quotes. Data typed on the public
       patient form or a law-firm referral lands in these files, so such cells get a
       leading apostrophe and open as text. Plain numbers (amounts, negatives) stay numbers. */
    const csvSafe = v => { const s = String(v == null ? '' : v); return (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s };
    const esc = v => '"' + csvSafe(v).replace(/"/g, '""') + '"';
    const lines = [header.map(esc).join(',')];
    rows.forEach(r => lines.push(cols.map(c => esc(csvVal(r, c.key))).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'patient-encounters.csv';
    if (typeof ctgAuditListExport === 'function') ctgAuditListExport('encounters', rows.length);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    encToast('Exported ' + rows.length + ' encounter' + (rows.length === 1 ? '' : 's') + ' ✓', 'ok');
  }

  // ---- header + row actions (kept read-only / navigational so existing
  //      portal flows are never mutated from here) ----
  function encAddPatient() { if (typeof showPage === 'function') showPage('registration'); }
  function encAddCharges() {
    const n = Object.keys(encSelectedIds).length;
    encToast(n ? 'Add charges for ' + n + ' selected encounter' + (n === 1 ? '' : 's') + ' — open the encounter to enter CPT charges.' : 'Select one or more encounters first.', n ? '' : 'err');
  }
  function encSendClaim() {
    const n = Object.keys(encSelectedIds).length;
    encToast(n ? 'Send claim for ' + n + ' selected encounter' + (n === 1 ? '' : 's') + '.' : 'Select one or more encounters first.', n ? '' : 'err');
  }
  function encSetRefreshTime() { encToast('Auto-refresh interval is managed by your session settings.'); }
  function encAlert(apptId) { encToast('No alerts on this encounter.'); }
  function encOpenNote(patientId) {
    if (!patientId || (typeof getPatient === 'function' && !getPatient(patientId))) { encToast('This encounter has no linked patient record.', 'err'); return; }
    if (typeof selectedPatientId !== 'undefined') window.selectedPatientId = patientId;
    if (typeof showPage === 'function') showPage('patientLists');
    if (typeof renderPatientDetails === 'function') renderPatientDetails(patientId);
  }
  function encSuperbill(apptId) { encToast('Superbill entry opens from the patient\'s Billing tab.'); }
  function encClaim(apptId) { encToast('Claim status is managed from AR Summary.'); }

  // Close any open multi-select when clicking elsewhere.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#encMount .acfg-msel')) {
      document.querySelectorAll('#encMount .acfg-msel.open').forEach(m => m.classList.remove('open'));
    }
  });

  // Expose the handlers the inline markup calls.
  window.renderPatientEncounters = renderPatientEncounters;
  window.encOnField = encOnField;
  window.encSetDateBasis = encSetDateBasis;
  window.encSetDefault = encSetDefault;
  window.encMselOpen = encMselOpen;
  window.encMselToggle = encMselToggle;
  window.encToggleFilter = encToggleFilter;
  window.encToggleCol = encToggleCol;
  window.encToggleAllCols = encToggleAllCols;
  window.encSelectRow = encSelectRow;
  window.encToggleSelectAll = encToggleSelectAll;
  window.encApply = encApply;
  window.encClearFilter = encClearFilter;
  window.encSaveFilter = encSaveFilter;
  window.encDeleteFilter = encDeleteFilter;
  window.encSaveView = encSaveView;
  window.encExport = encExport;
  window.encAddPatient = encAddPatient;
  window.encAddCharges = encAddCharges;
  window.encSendClaim = encSendClaim;
  window.encSetRefreshTime = encSetRefreshTime;
  window.encAlert = encAlert;
  window.encOpenNote = encOpenNote;
  window.encSuperbill = encSuperbill;
  window.encClaim = encClaim;
  window.encViewIcdCodes = encViewIcdCodes;
  window.encCloseIcdModal = encCloseIcdModal;
})();
