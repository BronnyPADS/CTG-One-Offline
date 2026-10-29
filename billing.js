
const AR_STATUSES = ['InProgress Claims', 'Finalized Paid', 'Sent To Insurance', 'Patient Owes', 'Error', 'Special Fee']
const AR_STATUS_COLORS = {
  'InProgress Claims': '#0096C7',
  'Finalized Paid':    '#00B4D8',
  'Sent To Insurance':  '#0077B6',
  'Patient Owes':       '#00B4D8',
  'Error':              '#03045E',
  'Special Fee':        '#0077B6'
}

let arSelectedPatientId = null
let arStatusTab = 'All'
let arChargeEditingId = null

function arEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function arFmtMoney(n) {
  const v = Number(n) || 0
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function arParseMoney(s) { const n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
function arMMDDYYYY(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear() }
function arParseDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]))
}
function arCalcAge(dobStr) {
  const d = arParseDate(dobStr)
  if (!d) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const monthDiff = now.getMonth() - d.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 ? age : null
}

/* ---------- data model ---------- */
function arEnsure(p) {
  if (!p.ar) {
    p.ar = {
      billingFacility: (p.demographics && p.demographics.facility) || 'Concussion Therapy Group',
      lastInsurancePaymentDate: '', lastPatientPaymentDate: '', lastStatementPrintDate: '',
      notesCurrent: '', notesHistory: [], receivables: [], claimSeq: 7001,
      payments: [], unpostedPayments: 0
    }
  }
  if (!Array.isArray(p.ar.receivables)) p.ar.receivables = []
  if (!Array.isArray(p.ar.notesHistory)) p.ar.notesHistory = []
  // Accounts created before account-level payments existed are missing these.
  if (!Array.isArray(p.ar.payments)) p.ar.payments = []
  if (typeof p.ar.unpostedPayments !== 'number') p.ar.unpostedPayments = arParseMoney(p.ar.unpostedPayments)
  return p.ar
}
function arComputeReceivable(r) {
  const charges = arParseMoney(r.charges), insCharges = Math.min(arParseMoney(r.insCharges), charges)
  const insPayments = arParseMoney(r.insPayments), insAdjs = arParseMoney(r.insAdjs)
  const patPayments = arParseMoney(r.patPayments), patDiscounts = arParseMoney(r.patDiscounts)
  const patCharges = charges - insCharges
  const insBalance = Math.max(0, insCharges - insPayments - insAdjs)
  const patientBal = Math.max(0, patCharges - patPayments - patDiscounts)
  return Object.assign({}, r, { _charges: charges, _insCharges: insCharges, _insPayments: insPayments, _insAdjs: insAdjs, _patCharges: patCharges, _patPayments: patPayments, _patDiscounts: patDiscounts, _insBalance: insBalance, _patientBal: patientBal })
}
function arComputeTotals(p) {
  const ar = arEnsure(p)
  const rows = ar.receivables.map(arComputeReceivable)
  const totals = rows.reduce((acc, r) => {
    acc.charges += r._charges; acc.insCharges += r._insCharges; acc.insPayments += r._insPayments
    acc.insAdjs += r._insAdjs; acc.patPayments += r._patPayments; acc.patDiscounts += r._patDiscounts
    acc.insBalance += r._insBalance; acc.patientBal += r._patientBal
    return acc
  }, { charges: 0, insCharges: 0, insPayments: 0, insAdjs: 0, patPayments: 0, patDiscounts: 0, insBalance: 0, patientBal: 0 })
  totals.totalBalance = totals.insBalance + totals.patientBal
  return { rows, totals }
}

function arBillingStatement(p) {
  try { return (typeof getBillingStatementData === 'function') ? getBillingStatementData(p) : null }
  catch (e) { return null }
}
/* Deterministic, human-readable claim id from a billing group's id, so a
   given billing table keeps the same claim number across reloads. */
function arStableClaimId(seed) {
  let h = 0
  const s = String(seed || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
  return 'B' + (1000 + (h % 9000))
}
function arSyncFromBilling(p) {
  if (!p) return
  const ar = arEnsure(p)
  const data = arBillingStatement(p)
  if (!data) return
  const groups = data.groups || []
  const seen = {}
  groups.forEach(g => {
    const gid = 'arbill_' + (g.id || String(g.date || '').replace(/[^a-z0-9]/gi, '_'))
    seen[gid] = true
    const charges = String((g.subtotal && g.subtotal.charges) || 0)
    let r = ar.receivables.find(x => x.id === gid)
    if (!r) {
      ar.receivables.push({
        id: gid, billingGroupId: g.id || gid, fromBilling: true,
        claimId: arStableClaimId(gid), encNo: '',
        serviceDate: g.date || '', billDate: g.date || '',
        provider: g.provider || 'Nicholas Grande', status: 'InProgress Claims',
        charges, insCharges: '0', insPayments: '0', insAdjs: '0',
        patPayments: '0', patDiscounts: '0', notes: ''
      })
    } else {
      // Billing owns the charge amount; the user owns status/payments/adjustments.
      r.charges = charges
      r.fromBilling = true
      if (!r.serviceDate) r.serviceDate = g.date || ''
      if (!r.billDate) r.billDate = g.date || ''
      if (!r.provider && g.provider) r.provider = g.provider
    }
  })
  // Drop stale billing-derived rows whose billing table no longer exists, but
  // KEEP any manually-added charges (those without an 'arbill_' id) - billing
  // and manual "+ Add Charge" entries coexist.
  ar.receivables = ar.receivables.filter(r => String(r.id || '').indexOf('arbill_') !== 0 || seen[r.id])
}
/* Single source of truth for a patient's outstanding balance, used by the
   patient list, AR Summary and Collection Management alike. */
function patientBillingBalance(p) {
  arSyncFromBilling(p)
  return arComputeTotals(p).totals.totalBalance
}

/* ---------- patient list / selector ---------- */
function arFilteredPatients() {
  const filter = document.getElementById('arStatusFilter')
  const mode = filter ? filter.value : 'active'
  const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
  if (mode === 'all') return list
  const discharged = p => (typeof isPatientDischarged === 'function') && isPatientDischarged(p)
  return list.filter(p => mode === 'inactive' ? discharged(p) : !discharged(p))
}
function arRenderPatientOptions() {
  const sel = document.getElementById('arPatientSelect')
  if (!sel) return
  const list = arFilteredPatients()
  const countTag = document.getElementById('arPatientCountTag')
  if (countTag) countTag.textContent = list.length + (list.length === 1 ? ' Patient' : ' Patients')
  if (!list.length) {
    sel.innerHTML = '<option value="">No patients</option>'
    arSelectedPatientId = null
    renderArSummary()
    return
  }
  const keepId = list.some(p => p.id === arSelectedPatientId) ? arSelectedPatientId : list[0].id
  sel.innerHTML = list.map(p =>
    '<option value="' + arEsc(p.id) + '"' + (p.id === keepId ? ' selected' : '') + '>' + arEsc(naturalPatientName(p)) + '</option>'
  ).join('')
  arSelectedPatientId = keepId
  renderArSummary()
}
function arSelectPatient(id) { arSelectedPatientId = id; renderArSummary() }

/* ---------- last/next appointment lookup (reads the Appointments module's data) ---------- */
function arLastNextAppointment(patientId) {
  if (typeof ctgAppointments === 'undefined') return { last: null, next: null }
  const mine = ctgAppointments.filter(a => a.patientId === patientId)
  // Local calendar date - matches how the Appointments module itself stores
  // and compares dates (see apptISODate); toISOString() reads the UTC date
  // instead and can misclassify "today" near local midnight.
  const todayISO = (typeof apptISODate === 'function') ? apptISODate(new Date()) : (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })()
  const past = mine.filter(a => a.date < todayISO || (a.date === todayISO)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
  const future = mine.filter(a => a.date > todayISO).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  return { last: past[0] || null, next: future[0] || null }
}
function arFmtApptRef(a) {
  if (!a) return null
  const d = new Date(a.date + 'T00:00:00')
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' ' + apptFormat12h(a.start)
}

/* ---------- main render ---------- */
function renderArSummary() {
  arRenderPatientOptionsIfEmpty()
  const mount = document.getElementById('arContentMount')
  if (!mount) return
  const p = arSelectedPatientId ? getPatient(arSelectedPatientId) : null
  if (!p) {
    mount.innerHTML = '<div class="card"><div class="card-body" data-cs="'+__cs+'padding:44px 24px;text-align:center;color:var(--muted);font-size:13px">No patient selected.</div></div>'
    return
  }
  const d = p.demographics || {}
  arSyncFromBilling(p)
  const ar = arEnsure(p)
  const { rows, totals } = arComputeTotals(p)
  const age = arCalcAge(d.dob)
  const { last, next } = arLastNextAppointment(p.id)

  let h = ''

  // Patient info strip
  h += '<div class="card"><div class="card-body ar-info-strip">'
  h += '<div class="ar-info-name">' + arEsc(naturalPatientName(p)) + '</div>'
  h += '<div class="ar-info-meta">'
    + (d.dob ? 'DOB: <strong>' + arEsc(d.dob) + '</strong>' : '')
    + (age != null ? ' &nbsp;·&nbsp; Age: <strong>' + age + '</strong>' : '')
    + (d.gender ? ' &nbsp;·&nbsp; Gender: <strong>' + arEsc(d.gender) + '</strong>' : '')
    + (d.mobile ? ' &nbsp;·&nbsp; Mobile: <strong>' + arEsc(d.mobile) + '</strong>' : '')
    + (d.email ? ' &nbsp;·&nbsp; Email: <strong>' + arEsc(d.email) + '</strong>' : '')
    + (d.mrn ? ' &nbsp;·&nbsp; Account#: <strong>' + arEsc(d.mrn) + '</strong>' : '')
    + '</div>'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arGoToPatientDetails(\'' + p.id + '\')" data-cs="'+__cs+'margin-left:auto">Patient Details →</button>'
  h += '</div></div>'

  // Diagnosis (ICD-10) - same list the Patient List detail page and Patient
  // Chart's Diagnosis tab read from this patient's ACE record.
  const aceCodes = (p.ace && Array.isArray(p.ace.diagnosisCodes)) ? p.ace.diagnosisCodes : []
  if (aceCodes.length) {
    h += '<div class="card"><div class="card-body" data-cs="'+__cs+'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px">'
    h += '<strong data-cs="'+__cs+'font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)">Diagnosis (ICD-10)</strong>'
    h += '<div data-cs="'+__cs+'display:flex;gap:6px;flex-wrap:wrap;flex:1">'
      + aceCodes.slice(0, 8).map(c => '<span class="tag tb" data-cs="'+__cs+'font-family:\'DM Mono\',monospace">' + arEsc(c) + '</span>').join('')
      + (aceCodes.length > 8 ? '<span class="tag" data-cs="'+__cs+'color:var(--muted);background:var(--s3)">+' + (aceCodes.length - 8) + ' more</span>' : '')
      + '</div>'
    h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arGoToAce(\'' + p.id + '\')">View in Day 1</button>'
    h += '</div></div>'
  }

  // Key dates
  h += '<div class="card"><div class="card-body ar-dates-row">'
  h += arDateBlock('Last Insurance Payment', ar.lastInsurancePaymentDate || '—')
  h += arDateBlock('Last Appointment', arFmtApptRef(last) || '—')
  h += arDateBlock('Next Appointment', arFmtApptRef(next) || 'None Scheduled')
  h += arDateBlock('Last Patient Payment', ar.lastPatientPaymentDate || '—')
  h += arDateBlock('Last Statement Print', ar.lastStatementPrintDate || '—')
  h += '</div></div>'

  // Financial summary cards
  h += '<div class="ar-summary-grid">'
  h += arSummaryCard('Patient Owes', arFmtMoney(totals.patientBal), 'ic-green')
  h += arSummaryCard('Insurance Owes', arFmtMoney(totals.insBalance), 'ic-amber')
  h += arSummaryCard('Total Balance', arFmtMoney(totals.totalBalance), 'ic-blue')
  h += arSummaryCard('Patient Payments', arFmtMoney(totals.patPayments), 'ic-green')
  h += arSummaryCard('Insurance Payments', arFmtMoney(totals.insPayments), 'ic-blue')
  h += '</div>'

  // Billing facility + notes
  h += '<div class="card"><div class="card-body ar-billing-body">'
  h += '<div class="g2">'
  h += '<div class="fg"><label>Billing Facility</label><select id="arBillingFacility" data-onchange="arSaveBillingFacility()">'
    + '<option' + (ar.billingFacility === 'Concussion Therapy Group' ? ' selected' : '') + '>Concussion Therapy Group</option>'
    + '</select></div>'
  h += '<div class="fg"><label>Unposted Payments</label><div class="static-field">' + arFmtMoney(ar.unpostedPayments) + '</div></div>'
  h += '</div>'
  h += '<div class="fg" data-cs="'+__cs+'margin-bottom:6px"><label>Notes</label><textarea id="arNotesInput" rows="3" placeholder="Add a note...">' + arEsc(ar.notesCurrent) + '</textarea></div>'
  h += '<div data-cs="'+__cs+'display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arSaveNote()">Save Note</button>'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arToggleOldNotes()">Old Notes (' + ar.notesHistory.length + ')</button>'
  h += '</div>'
  h += '<div id="arOldNotesPanel" data-cs="'+__cs+'display:none;margin-top:10px"></div>'
  h += '</div></div>'

  // Action toolbar
  h += '<div class="card"><div class="card-body"><div class="ar-action-toolbar">'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arPrintStatement()">Print Statement</button>'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arPrintSummary()">Print Summary</button>'
  h += '<button type="button" class="btn btn-ghost btn-sm" data-onclick="arAddTask()">Add Task</button>'
  h += '<button type="button" class="btn btn-ghost btn-sm btn-writeoff" data-onclick="arWriteOff()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>Write Off</button>'
  h += '<button type="button" class="btn btn-primary btn-sm" data-cs="'+__cs+'margin-left:auto" data-onclick="openArChargeModal()">+ Add Charge</button>'
  h += '</div>'
  /* One payment for the whole account. Collecting used to mean picking a
     claim row first, which is backwards: the patient hands over an amount,
     and which claim it settles is arithmetic. The button carries the number
     it is going to collect so nobody has to read it off a card above. */
  h += '<button type="button" class="ar-pay-cta" data-onclick="openArPaymentModal()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
    + '<span class="ar-pay-cta-main">Make a Payment</span>'
    + '<span class="ar-pay-cta-sub">' + (totals.totalBalance > 0 ? 'Entire balance ' + arFmtMoney(totals.totalBalance) : 'No outstanding balance') + '</span>'
    + '</button>'
  h += '</div></div>'

  // Receivables table
  h += '<div class="card">'
  h += '<div class="card-hd" data-cs="'+__cs+'flex-wrap:wrap;gap:8px"><div class="card-title">Receivables</div><div class="ar-status-tabs" id="arStatusTabs"></div></div>'
  h += '<div class="card-body" data-cs="'+__cs+'padding:0"><div class="ar-table-scroll">' + arReceivablesTableHTML(rows) + '</div></div>'
  h += '</div>'

  // Payment history. Only worth a card once there is something in it - a
  // check number and a comment that land nowhere are just decoration.
  if (ar.payments.length) h += arPaymentHistoryHTML(ar)

  mount.innerHTML = h
  arRenderStatusTabs(rows)
}
function arRenderPatientOptionsIfEmpty() {
  const sel = document.getElementById('arPatientSelect')
  if (!sel) return
  if (!sel.options.length) { arRenderPatientOptions(); return }
  const placeholderOnly = sel.options.length === 1 && !sel.options[0].value
  if (placeholderOnly && arFilteredPatients().length) arRenderPatientOptions()
}
function arDateBlock(label, value) {
  return '<div class="ar-date-block"><div class="ar-date-label">' + arEsc(label) + '</div><div class="ar-date-value">' + arEsc(value) + '</div></div>'
}
function arSummaryCard(label, value, iconClass) {
  return '<div class="ar-summary-card"><div class="ar-summary-label">' + arEsc(label) + '</div><div class="ar-summary-value">' + value + '</div></div>'
}

function arRenderStatusTabs(rows) {
  const el = document.getElementById('arStatusTabs')
  if (!el) return
  const counts = {}
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
  let h = '<button type="button" class="ar-tab' + (arStatusTab === 'All' ? ' active' : '') + '" data-onclick="arSetStatusTab(\'All\')">All (' + rows.length + ')</button>'
  AR_STATUSES.forEach(s => {
    if (!counts[s]) return
    h += '<button type="button" class="ar-tab' + (arStatusTab === s ? ' active' : '') + '" data-onclick="arSetStatusTab(\'' + s + '\')">' + arEsc(s) + ' (' + counts[s] + ')</button>'
  })
  el.innerHTML = h
}
function arSetStatusTab(status) {
  arStatusTab = status
  const p = getPatient(arSelectedPatientId)
  if (!p) return
  const { rows } = arComputeTotals(p)
  document.querySelector('.ar-table-scroll').innerHTML = arReceivablesTableHTML(rows)
  arRenderStatusTabs(rows)
}

function arReceivablesTableHTML(rows) {
  const filtered = arStatusTab === 'All' ? rows : rows.filter(r => r.status === arStatusTab)
  if (!filtered.length) return '<div data-cs="'+__cs+'padding:36px 20px;text-align:center;color:var(--muted);font-size:13px">No charges yet.</div>'
  const sorted = filtered.slice().sort((a, b) => (b.billDate || '').localeCompare(a.billDate || ''))
  let h = '<table class="ar-table"><thead><tr>'
    + '<th>Claim ID</th><th>Bill Date</th><th>Service Date</th><th>Provider</th><th>Status</th>'
    + '<th>Charges</th><th>Ins Charges</th><th>Ins Payments</th><th>Ins Adjs</th><th>Ins Balance</th>'
    + '<th>Patient Charges</th><th>Pat Payments</th><th>Pat Discounts</th><th>Patient Bal</th>'
    + '</tr></thead><tbody>'
  sorted.forEach(r => {
    const color = AR_STATUS_COLORS[r.status] || AR_STATUS_COLORS['InProgress Claims']
    h += '<tr data-onclick="editArCharge(\'' + r.id + '\')">'
      + '<td class="ar-claim-id" data-cs="'+__cs+'border-left:4px solid ' + color + '">' + arEsc(r.claimId) + '</td>'
      + '<td>' + arEsc(r.billDate) + '</td>'
      + '<td>' + arEsc(r.serviceDate) + '</td>'
      + '<td>' + arEsc(r.provider || 'Nicholas Grande') + '</td>'
      + '<td><span class="ar-status-pill" data-cs="'+__cs+'background:' + color + ';color:' + apptContrastText(color) + '">' + arEsc(r.status) + '</span></td>'
      + '<td>' + arFmtMoney(r._charges) + '</td>'
      + '<td>' + arFmtMoney(r._insCharges) + '</td>'
      + '<td>' + arFmtMoney(r._insPayments) + '</td>'
      + '<td>' + arFmtMoney(r._insAdjs) + '</td>'
      + '<td>' + arFmtMoney(r._insBalance) + '</td>'
      + '<td>' + arFmtMoney(r._patCharges) + '</td>'
      + '<td>' + arFmtMoney(r._patPayments) + '</td>'
      + '<td>' + arFmtMoney(r._patDiscounts) + '</td>'
      + '<td><strong>' + arFmtMoney(r._patientBal) + '</strong></td>'
      + '</tr>'
  })
  h += '</tbody></table>'
  return h
}

/* ---------- actions ---------- */
function arGoToPatientDetails(patientId) {
  if (typeof selectPatient === 'function') selectPatient(patientId)
  showPage('patientLists')
}
function arGoToAce(patientId) {
  if (typeof selectPatient === 'function') selectPatient(patientId)
  if (typeof setPatientDetailTab === 'function') setPatientDetailTab('ace')
  showPage('patientLists')
}
function arSaveBillingFacility() {
  const p = getPatient(arSelectedPatientId); if (!p) return
  arEnsure(p).billingFacility = document.getElementById('arBillingFacility').value
  persistPatients()
  showToast('Billing facility updated', 'ok')
}
function arSaveNote() {
  const p = getPatient(arSelectedPatientId); if (!p) return
  const ar = arEnsure(p)
  const text = document.getElementById('arNotesInput').value.trim()
  if (ar.notesCurrent && ar.notesCurrent !== text) {
    ar.notesHistory.unshift({ text: ar.notesCurrent, date: new Date().toISOString() })
  }
  ar.notesCurrent = text
  persistPatients()
  showToast('Note saved', 'ok')
  renderArSummary()
}
function arToggleOldNotes() {
  const p = getPatient(arSelectedPatientId); if (!p) return
  const ar = arEnsure(p)
  const panel = document.getElementById('arOldNotesPanel')
  if (!panel) return
  const showing = panel.style.display !== 'none'
  if (showing) { panel.style.display = 'none'; return }
  if (!ar.notesHistory.length) {
    panel.innerHTML = '<div class="small-muted">No previous notes.</div>'
  } else {
    panel.innerHTML = ar.notesHistory.map(n =>
      '<div class="ar-old-note"><div class="ar-old-note-date">' + new Date(n.date).toLocaleString() + '</div><div>' + arEsc(n.text) + '</div></div>'
    ).join('')
  }
  panel.style.display = ''
}
function arPrintStatement() { window.print(); if (typeof ctgAuditExport === 'function') ctgAuditExport(arSelectedPatientId, 'ar_statement', 'print') }
function arPrintSummary() { window.print(); if (typeof ctgAuditExport === 'function') ctgAuditExport(arSelectedPatientId, 'ar_summary', 'print') }
function arAddTask() {
  const text = window.prompt('Task description:')
  if (!text) return
  const p = getPatient(arSelectedPatientId); if (!p) return
  const ar = arEnsure(p)
  if (ar.notesCurrent) ar.notesHistory.unshift({ text: ar.notesCurrent, date: new Date().toISOString() })
  ar.notesCurrent = '[Task] ' + text
  persistPatients()
  showToast('Task added to notes', 'ok')
  renderArSummary()
}
/* AR Summary Write Off now opens the same rich modal as Collection Management
   (Type / Group Code / Reason Code), but scoped to the currently-open patient's
   receivables instead of the bulk checked-claim set. */
function arWriteOff() {
  const p = getPatient(arSelectedPatientId); if (!p) return
  const { totals } = arComputeTotals(p)
  if (totals.totalBalance <= 0) { showToast('No outstanding balance to write off', 'err'); return }
  wcWriteOffMode = 'arPatient'
  wcArPatientId = arSelectedPatientId
  document.getElementById('wcTypeSelect').value = 'patientBalanceSelected'
  document.getElementById('wcAmount').value = ''
  document.getElementById('wcGroupInput').value = ''; document.getElementById('wcGroupInput').dataset.value = ''
  document.getElementById('wcReasonInput').value = ''; document.getElementById('wcReasonInput').dataset.value = ''
  wcTypeChange()
  document.getElementById('wcWriteOffModal').classList.add('show')
}

/* ---------- Add/Edit Charge modal ---------- */
function openArChargeModal() {
  arChargeEditingId = null
  const modal = document.getElementById('arChargeModal'); if (!modal) return
  document.getElementById('arChargeModalTitle').textContent = 'Add Charge'
  document.getElementById('arChargeDeleteBtn').style.display = 'none'
  document.getElementById('arServiceDate').value = arMMDDYYYY(new Date())
  document.getElementById('arBillDate').value = arMMDDYYYY(new Date())
  document.getElementById('arChargeStatus').value = 'InProgress Claims'
  document.getElementById('arCharges').value = ''
  document.getElementById('arInsCharges').value = ''
  document.getElementById('arChargeNotes').value = ''
  modal.classList.add('show')
}
function editArCharge(id) {
  const p = getPatient(arSelectedPatientId); if (!p) return
  const ar = arEnsure(p)
  const r = ar.receivables.find(x => x.id === id); if (!r) return
  arChargeEditingId = id
  const modal = document.getElementById('arChargeModal'); if (!modal) return
  document.getElementById('arChargeModalTitle').textContent = 'Edit Charge — ' + r.claimId
  document.getElementById('arChargeDeleteBtn').style.display = ''
  document.getElementById('arServiceDate').value = r.serviceDate || ''
  document.getElementById('arBillDate').value = r.billDate || ''
  document.getElementById('arChargeStatus').value = r.status || 'InProgress Claims'
  document.getElementById('arCharges').value = r.charges || ''
  document.getElementById('arInsCharges').value = r.insCharges || ''
  document.getElementById('arChargeNotes').value = r.notes || ''
  modal.classList.add('show')
}
function closeArChargeModal() {
  const modal = document.getElementById('arChargeModal'); if (modal) modal.classList.remove('show')
  arChargeEditingId = null
}
function saveArCharge() {
  const p = getPatient(arSelectedPatientId); if (!p) { showToast('Select a patient first', 'err'); return }
  const ar = arEnsure(p)
  const serviceDate = document.getElementById('arServiceDate').value.trim()
  const billDate = document.getElementById('arBillDate').value.trim()
  const status = document.getElementById('arChargeStatus').value
  const charges = document.getElementById('arCharges').value.trim()
  const insCharges = document.getElementById('arInsCharges').value.trim()
  const notes = document.getElementById('arChargeNotes').value.trim()
  if (!serviceDate || !billDate) { showToast('Enter both dates', 'err'); return }
  if (!arParseMoney(charges)) { showToast('Enter a charge amount', 'err'); return }

  if (arChargeEditingId) {
    const r = ar.receivables.find(x => x.id === arChargeEditingId)
    if (r) Object.assign(r, { serviceDate, billDate, status, charges, insCharges, notes })
    showToast('Charge updated', 'ok')
  } else {
    ar.claimSeq = (ar.claimSeq || 7001) + 1
    ar.receivables.push({
      id: 'ar' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      claimId: String(ar.claimSeq - 1), encNo: String(10000 + ar.receivables.length),
      serviceDate, billDate, provider: 'Nicholas Grande', status,
      charges, insCharges, insPayments: '0', insAdjs: '0', patPayments: '0', patDiscounts: '0', notes
    })
    showToast('Charge added', 'ok')
  }
  persistPatients()
  closeArChargeModal()
  renderArSummary()
}
async function deleteArCharge() {
  if (!arChargeEditingId) return
  const p = getPatient(arSelectedPatientId); if (!p) return
  if (!(await ctgConfirm('Delete this charge?', { danger: true, okLabel: 'Delete' }))) return
  const ar = arEnsure(p)
  ar.receivables = ar.receivables.filter(x => x.id !== arChargeEditingId)
  persistPatients()
  closeArChargeModal()
  renderArSummary()
  showToast('Charge deleted', 'ok')
}


/* Which balance each application type is allowed to consume, and which column
   on the claim it is written back to. */
const AR_PAY_TYPES = {
  patPayments:  { bal: 'patient',   reason: 'Patient Payment',   label: 'Patient Payment' },
  insPayments:  { bal: 'insurance', reason: 'Insurance Payment', label: 'Insurance Payment' },
  patDiscounts: { bal: 'patient',   reason: 'Adjustment Reason', label: 'Patient Discount' },
  insAdjs:      { bal: 'insurance', reason: 'Adjustment Reason', label: 'Insurance Adjustment' }
}
function arPayCfg(type) { return AR_PAY_TYPES[type] || AR_PAY_TYPES.patPayments }
function arRound(n) { return Math.round((Number(n) || 0) * 100) / 100 }
function arPayVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : '' }
function arPayType() { return arPayVal('arPaymentType') || 'patPayments' }
function arPayBalanceKey(type) { return arPayCfg(type).bal === 'insurance' ? '_insBalance' : '_patientBal' }
function arPayBalanceFor(type) {
  const p = getPatient(arSelectedPatientId)
  if (!p) return 0
  const t = arComputeTotals(p).totals
  return arPayCfg(type).bal === 'insurance' ? t.insBalance : t.patientBal
}

/* Oldest claim first. The table above reads newest-first, but money has to
   settle the other way round: the oldest debt is the one aging toward
   collections, and it is the one a statement will chase. */
function arPayOrder(a, b) {
  const da = arParseDate(a.billDate || a.serviceDate)
  const db = arParseDate(b.billDate || b.serviceDate)
  /* An undated row sorts last rather than first - it must not silently
     swallow a payment ahead of a claim carrying a real date. */
  const ta = da ? da.getTime() : Number.MAX_SAFE_INTEGER
  const tb = db ? db.getTime() : Number.MAX_SAFE_INTEGER
  return ta - tb
}

/* Split one amount across the open claims. Anything left over comes back as
   `unapplied` rather than being forced onto a settled claim or quietly
   dropped: an overpayment is real money and has to land somewhere visible. */
function arPayAllocate(rows, type, amount, auto) {
  const key = arPayBalanceKey(type)
  let left = arRound(amount)
  const alloc = []
  if (auto) {
    rows.filter(r => r[key] > 0.005).sort(arPayOrder).forEach(r => {
      if (left <= 0.005) return
      const take = arRound(Math.min(left, r[key]))
      alloc.push({ id: r.id, claimId: r.claimId, amount: take })
      left = arRound(left - take)
    })
  }
  return { alloc: alloc, unapplied: Math.max(0, arRound(left)) }
}

/* The split, shown before anything is committed. This is what the per-claim
   buttons used to give you for free - certainty about where the money went
   and it is the reason removing them costs nothing. */
function arPayRenderPreview() {
  const el = document.getElementById('arPayAlloc')
  if (!el) return
  const p = getPatient(arSelectedPatientId)
  if (!p) { el.innerHTML = ''; return }
  const type = arPayType()
  const amount = arRound(arParseMoney(arPayVal('arPaymentAmount')))
  const autoEl = document.getElementById('arPaymentAutoApply')
  const auto = !!(autoEl && autoEl.checked)
  if (amount <= 0) {
    el.innerHTML = '<div class="ar-pay-alloc-empty">Enter an amount to see how it will be applied.</div>'
    return
  }
  const { rows } = arComputeTotals(p)
  const split = arPayAllocate(rows, type, amount, auto)
  let h = '<div class="ar-pay-alloc-hd">' + arEsc(arPayCfg(type).label) + ' of ' + arFmtMoney(amount) + ' applies to</div>'
  if (!split.alloc.length) {
    h += '<div class="ar-pay-alloc-empty">' + (auto
      ? 'No open claim can take it &mdash; the full amount will be held as unapplied.'
      : 'Nothing &mdash; Auto apply is off, so the full amount will be held as unapplied.') + '</div>'
  } else {
    h += split.alloc.map(a =>
      '<div class="ar-pay-alloc-row"><span>Claim ' + arEsc(a.claimId) + '</span><strong>' + arFmtMoney(a.amount) + '</strong></div>'
    ).join('')
  }
  if (split.unapplied > 0.005) {
    h += '<div class="ar-pay-alloc-row is-unapplied"><span>Unapplied &mdash; held on the account</span><strong>' + arFmtMoney(split.unapplied) + '</strong></div>'
  }
  el.innerHTML = h
}

/* Special Fee Provider. The configured billing providers, plus anyone who is
   actually on this patient's claims - the config has not necessarily heard of
   them, and a payment still has to be attributable. */
function arPayFillProviders(p) {
  const sel = document.getElementById('arPaymentProvider')
  if (!sel) return
  const list = (typeof APPT_CFG_BILLING_PROVIDERS !== 'undefined' && APPT_CFG_BILLING_PROVIDERS.length)
    ? APPT_CFG_BILLING_PROVIDERS.slice() : ['Nicholas Grande']
  arEnsure(p).receivables.forEach(r => {
    if (r.provider && list.indexOf(r.provider) < 0) list.push(r.provider)
  })
  sel.innerHTML = list.map(n => '<option>' + arEsc(n) + '</option>').join('')
}

function arPayRefreshHeader() {
  const p = getPatient(arSelectedPatientId)
  if (!p) return
  const { totals } = arComputeTotals(p)
  document.getElementById('arPayStatPat').textContent = arFmtMoney(totals.patientBal)
  document.getElementById('arPayStatIns').textContent = arFmtMoney(totals.insBalance)
  document.getElementById('arPayStatTotal').textContent = arFmtMoney(totals.totalBalance)
}

function openArPaymentModal() {
  const p = getPatient(arSelectedPatientId)
  if (!p) { showToast('Select a patient first', 'err'); return }
  const modal = document.getElementById('arPaymentModal')
  if (!modal) return
  const d = p.demographics || {}
  const today = arMMDDYYYY(new Date())
  document.getElementById('arPayPatientName').textContent = naturalPatientName(p)
  const meta = []
  if (d.mrn) meta.push('Acct# ' + d.mrn)
  if (d.dob) meta.push('DOB ' + d.dob)
  if (d.mobile) meta.push(d.mobile)
  document.getElementById('arPayPatientMeta').innerHTML = meta.map(arEsc).join(' &middot; ')
  arPayRefreshHeader()
  document.getElementById('arPaymentType').value = 'patPayments'
  document.getElementById('arPaymentMethod').value = 'Check'
  document.getElementById('arPaymentTypeOfPayment').value = 'Attorney Lien'
  document.getElementById('arPaymentCheckNo').value = ''
  document.getElementById('arPaymentDepositNo').value = ''
  document.getElementById('arPaymentComments').value = ''
  document.getElementById('arPaymentCheckDate').value = today
  document.getElementById('arPaymentReceivedDate').value = today
  document.getElementById('arPaymentAutoApply').checked = true
  arPayFillProviders(p)
  arPayTypeChange()
  modal.classList.add('show')
}

function closeArPaymentModal() {
  const modal = document.getElementById('arPaymentModal')
  if (modal) modal.classList.remove('show')
}

/* Switching what the payment IS re-arms the amount, because the balance it
   can consume has changed: an insurance payment cannot pay down the patient
   half of a claim. */
function arPayTypeChange() {
  const type = arPayType()
  const reason = document.getElementById('arPaymentReason')
  if (reason) reason.value = arPayCfg(type).reason
  document.getElementById('arPaymentAmount').value = arPayBalanceFor(type).toFixed(2)
  arPayMethodChange()
  arPayRenderPreview()
}

function arPayFillFull() {
  document.getElementById('arPaymentAmount').value = arPayBalanceFor(arPayType()).toFixed(2)
  arPayRenderPreview()
}

/* A check number and a check date belong to a check. Left live for a cash
   payment they collect stray values that then print on a statement. */
function arPayMethodChange() {
  const isCheck = arPayVal('arPaymentMethod') === 'Check'
  const fields = ['arPayCheckNoField', 'arPayCheckDateField']
  fields.forEach(id => {
    const f = document.getElementById(id)
    if (!f) return
    f.classList.toggle('is-off', !isCheck)
    f.querySelectorAll('input, button').forEach(el => { el.disabled = !isCheck })
  })
  if (!isCheck) {
    document.getElementById('arPaymentCheckNo').value = ''
    document.getElementById('arPaymentCheckDate').value = ''
  } else if (!arPayVal('arPaymentCheckDate')) {
    document.getElementById('arPaymentCheckDate').value = arMMDDYYYY(new Date())
  }
}

function saveArPayment(andNew) {
  const p = getPatient(arSelectedPatientId)
  if (!p) { showToast('Select a patient first', 'err'); return }
  const ar = arEnsure(p)
  const type = arPayType()
  const amount = arRound(arParseMoney(arPayVal('arPaymentAmount')))
  if (amount <= 0) { showToast('Enter a payment amount', 'err'); return }
  /* The received date is what stamps Last Patient Payment on the summary and
     what a deposit is reconciled against, so it is the one date that cannot be
     left blank or malformed. */
  const received = arPayVal('arPaymentReceivedDate')
  if (!arParseDate(received)) { showToast('Enter a valid Received Date (MM/DD/YYYY)', 'err'); return }
  const checkDate = arPayVal('arPaymentCheckDate')
  if (checkDate && !arParseDate(checkDate)) { showToast('Enter a valid Check Date (MM/DD/YYYY)', 'err'); return }

  const autoEl = document.getElementById('arPaymentAutoApply')
  const auto = !!(autoEl && autoEl.checked)
  const { rows } = arComputeTotals(p)
  const split = arPayAllocate(rows, type, amount, auto)
  split.alloc.forEach(a => {
    const r = ar.receivables.find(x => x.id === a.id)
    if (r) r[type] = String(arRound(arParseMoney(r[type]) + a.amount))
  })
  if (split.unapplied > 0.005) ar.unpostedPayments = arRound(ar.unpostedPayments + split.unapplied)
  if (type === 'patPayments') ar.lastPatientPaymentDate = received
  if (type === 'insPayments') ar.lastInsurancePaymentDate = received

  /* Kept as a ledger entry, not just folded into the claim totals: the check
     number, the deposit number and the comment are exactly what a later
     reconciliation asks for, and a running total cannot answer any of them. */
  ar.payments.unshift({
    id: 'arp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    receivedDate: received,
    checkDate: checkDate,
    type: type,
    reason: arPayVal('arPaymentReason'),
    method: arPayVal('arPaymentMethod'),
    typeOfPayment: arPayVal('arPaymentTypeOfPayment'),
    checkNo: arPayVal('arPaymentCheckNo'),
    depositNo: arPayVal('arPaymentDepositNo'),
    provider: arPayVal('arPaymentProvider'),
    comments: arPayVal('arPaymentComments'),
    amount: amount,
    unapplied: split.unapplied,
    applied: split.alloc.map(a => ({ claimId: a.claimId, amount: a.amount })),
    at: new Date().toISOString()
  })

  persistPatients()
  const spread = split.alloc.length
  showToast(arFmtMoney(amount) + ' recorded'
    + (spread ? ' across ' + spread + (spread === 1 ? ' claim' : ' claims') : '')
    + (split.unapplied > 0.005 ? ' (' + arFmtMoney(split.unapplied) + ' unapplied)' : ''), 'ok')
  renderArSummary()
  if (andNew) {
    /* Submit and New keeps the check and deposit details
       a deposit is usually several payments off the same batch. Only the
       amount, the comment and the balances are re-armed. */
    arPayRefreshHeader()
    arPayFillProviders(p)
    document.getElementById('arPaymentAmount').value = arPayBalanceFor(arPayType()).toFixed(2)
    document.getElementById('arPaymentComments').value = ''
    arPayRenderPreview()
  } else {
    closeArPaymentModal()
  }
}

/* Every payment taken on the account, newest first. Rendered only once there
   is something to render. */
function arPaymentHistoryHTML(ar) {
  let h = '<div class="card"><div class="card-hd"><div class="card-title">Payment History</div>'
    + '<span class="ar-pay-hist-count">' + ar.payments.length + '</span></div>'
  h += '<div class="card-body" data-cs="'+__cs+'padding:0"><div class="ar-table-scroll">'
  h += '<table class="ar-table ar-pay-table"><thead><tr>'
    + '<th>Received</th><th>Check Date</th><th>Applied As</th><th>Reason</th><th>Type of Payment</th><th>Method</th>'
    + '<th>Check #</th><th>Deposit #</th><th>Applied To</th><th>Amount</th><th>Unapplied</th><th>Comments</th>'
    + '</tr></thead><tbody>'
  ar.payments.forEach(pay => {
    const applied = (pay.applied || []).map(a => a.claimId).join(', ')
    h += '<tr>'
      + '<td><strong>' + arEsc(pay.receivedDate) + '</strong></td>'
      + '<td>' + arEsc(pay.checkDate || '') + '</td>'
      + '<td>' + arEsc(arPayCfg(pay.type).label) + '</td>'
      + '<td>' + arEsc(pay.reason || '') + '</td>'
      + '<td>' + arEsc(pay.typeOfPayment || '') + '</td>'
      + '<td>' + arEsc(pay.method || '') + '</td>'
      + '<td>' + arEsc(pay.checkNo || '') + '</td>'
      + '<td>' + arEsc(pay.depositNo || '') + '</td>'
      + '<td>' + (applied ? arEsc(applied) : '<span class="small-muted">Unapplied</span>') + '</td>'
      + '<td><strong>' + arFmtMoney(pay.amount) + '</strong></td>'
      + '<td>' + (pay.unapplied > 0.005 ? arFmtMoney(pay.unapplied) : '') + '</td>'
      + '<td class="ar-pay-comment">' + arEsc(pay.comments || '') + '</td>'
      + '</tr>'
  })
  h += '</tbody></table></div></div></div>'
  return h
}

const WC_GROUP_CODES = [
  ['CO', 'Contractual Obligations'],
  ['CR', 'Correction and Reversals'],
  ['OA', 'Other adjustments'],
  ['P', 'Provider Adjustment'],
  ['PI', 'Payor Initiated Reductions'],
  ['PR', 'Patient Responsibility'],
  ['PW', 'Patient Writeoff']
]

const WC_REASON_CODES = [
  ['1', 'Deductible Amount'], ['2', 'Coinsurance Amount'], ['3', 'Co-payment Amount'],
  ['4', 'The procedure code is inconsistent with the modifier used or a required modifier is missing.'],
  ['5', 'The procedure code/bill type is inconsistent with the place of service.'],
  ['6', 'The procedure/revenue code is inconsistent with the patients age.'],
  ['7', 'The procedure/revenue code is inconsistent with the patients gender.'],
  ['8', 'The procedure code is inconsistent with the provider type/specialty (taxonomy).'],
  ['9', 'The diagnosis is inconsistent with the patients age.'],
  ['10', 'The diagnosis is inconsistent with the patients gender.'],
  ['11', 'The diagnosis is inconsistent with the procedure.'],
  ['12', 'The diagnosis is inconsistent with the provider type.'],
  ['13', 'The date of death precedes the date of service.'],
  ['14', 'The date of birth follows the date of service.'],
  ['15', '"The authorization number is missing, invalid, or does not apply to the billed services or provider."'],
  ['16', 'Claim/service lacks information which is needed for adjudication. At least one Remark Code must be provided.'],
  ['18', 'Duplicate claim/service.'],
  ['19', 'This is a work-related injury/illness and thus the liability of the Workers Compensation Carrier.'],
  ['20', 'This injury/illness is covered by the liability carrier.'],
  ['21', 'This injury/illness is the liability of the no-fault carrier.'],
  ['22', 'This care may be covered by another payer per coordination of benefits.'],
  ['23', 'The impact of prior payer(s) adjudication including payments and/or adjustments.'],
  ['24', 'Charges are covered under a capitation agreement/managed care plan.'],
  ['26', 'Expenses incurred prior to coverage.'], ['27', 'Expenses incurred after coverage terminated.'],
  ['29', 'The time limit for filing has expired.'],
  ['31', 'Patient cannot be identified as our insured.'],
  ['32', 'Our records indicate that this dependent is not an eligible dependent as defined.'],
  ['33', 'Insured has no dependent coverage.'], ['34', 'Insured has no coverage for newborns.'],
  ['35', 'Lifetime benefit maximum has been reached.'],
  ['38', 'Services not provided or authorized by designated (network/primary care) providers.'],
  ['39', 'Services denied at the time authorization/pre-certification was requested.'],
  ['40', 'Charges do not meet qualifications for emergent/urgent care.'],
  ['44', 'Prompt-pay discount.'],
  ['45', 'Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement. (Use Group Codes PR or CO depending upon liability).'],
  ['49', 'These are non-covered services because this is a routine exam or screening procedure done in conjunction with a routine exam.'],
  ['50', 'These are non-covered services because this is not deemed a medical necessity by the payer.'],
  ['51', 'These are non-covered services because this is a pre-existing condition.'],
  ['53', 'Services by an immediate relative or a member of the same household are not covered.'],
  ['54', 'Multiple physicians/assistants are not covered in this case.'],
  ['55', 'Procedure/treatment is deemed experimental/investigational by the payer.'],
  ['56', 'Procedure/treatment has not been deemed proven to be effective by the payer.'],
  ['58', 'Treatment was deemed by the payer to have been rendered in an inappropriate or invalid place of service.'],
  ['59', '"Processed based on multiple or concurrent procedure rules. (For example multiple surgery or diagnostic imaging, concurrent anesthesia.)"'],
  ['60', 'Charges for outpatient services are not covered when performed within a period of time prior to or after inpatient services.'],
  ['61', 'Penalty for failure to obtain second surgical opinion.'],
  ['66', 'Blood Deductible.'], ['69', 'Day outlier amount.'],
  ['70', 'Cost outlier - Adjustment to compensate for additional costs.'],
  ['72', 'Authorized Return'], ['74', 'Indirect Medical Education Adjustment.'],
  ['75', 'Direct Medical Education Adjustment.'], ['76', 'Disproportionate Share Adjustment.'],
  ['78', 'Non-Covered days/Room charge adjustment.'],
  ['85', 'Patient Interest Adjustment (Use Only Group code PR)'], ['87', 'Transfer amount.'],
  ['89', 'Professional fees removed from charges.'], ['90', 'Ingredient cost adjustment.'],
  ['91', 'Dispensing fee adjustment.'], ['94', 'Processed in Excess of charges.'],
  ['95', 'Plan procedures not followed.'],
  ['96', 'Non-covered charge(s). At least one Remark Code must be provided.'],
  ['97', 'The benefit for this service is included in the payment/allowance for another service/procedure that has already been adjudicated.'],
  ['100', 'Payment made to patient/insured/responsible party/employer.'],
  ['101', 'Predetermination: anticipated payment upon completion of services or claim adjudication.'],
  ['102', 'Major Medical Adjustment.'], ['103', '"Provider promotional discount (e.g., Senior citizen discount)."'],
  ['104', 'Managed care withholding.'], ['105', 'Tax withholding.'],
  ['106', 'Patient payment option/election not in effect.'],
  ['107', 'The related or qualifying claim/service was not identified on this claim.'],
  ['108', 'Rent/purchase guidelines were not met.'],
  ['109', 'Claim not covered by this payer/contractor. You must send the claim to the correct payer/contractor.'],
  ['110', 'Billing date predates service date.'], ['111', 'Not covered unless the provider accepts assignment.'],
  ['112', 'Service not furnished directly to the patient and/or not documented.'],
  ['114', 'Procedure/product not approved by the Food and Drug Administration.'],
  ['115', '"Procedure postponed, canceled, or delayed."'],
  ['116', 'The advance indemnification notice signed by the patient did not comply with requirements.'],
  ['117', 'Transportation is only covered to the closest facility that can provide the necessary care.'],
  ['118', 'ESRD network support adjustment.'],
  ['119', 'Benefit maximum for this time period or occurrence has been reached.'],
  ['121', 'Indemnification adjustment - compensation for outstanding member responsibility.'],
  ['122', 'Psychiatric reduction.'],
  ['125', 'Submission/billing error(s). At least one Remark Code must be provided.'],
  ['128', 'Newborns services are covered in the mothers Allowance.'],
  ['129', 'Prior processing information appears incorrect.'], ['130', 'Claim submission fee.'],
  ['131', 'Claim specific negotiated discount.'], ['132', 'Prearranged demonstration project adjustment.'],
  ['133', 'The disposition of this claim/service is pending further review.'],
  ['134', 'Technical fees removed from charges.'], ['135', 'Interim bills cannot be processed.'],
  ['136', 'Failure to follow prior payers coverage rules. (Use Group Code OA).'],
  ['137', '"Regulatory Surcharges, Assessments, Allowances or Health Related Taxes."'],
  ['138', 'Appeal procedures not followed or time limits not met.'],
  ['139', 'Contracted funding agreement - Subscriber is employed by the provider of services.'],
  ['140', 'Patient/Insured health identification number and name do not match.'],
  ['141', 'Claim spans eligible and ineligible periods of coverage.'],
  ['142', 'Monthly Medicaid patient liability amount.'], ['143', 'Portion of payment deferred.'],
  ['144', '"Incentive adjustment, e.g. preferred product/service."'],
  ['146', 'Diagnosis was invalid for the date(s) of service reported.'],
  ['147', 'Provider contracted/negotiated rate expired or not on file.'],
  ['148', 'Information from another provider was not provided or was insufficient/incomplete. At least one Remark Code must be provided.'],
  ['149', 'Lifetime benefit maximum has been reached for this service/benefit category.'],
  ['150', 'Payer deems the information submitted does not support this level of service.'],
  ['151', 'Payment adjusted because the payer deems the information submitted does not support this many/frequency of services.'],
  ['152', 'Payer deems the information submitted does not support this length of service.'],
  ['153', 'Payer deems the information submitted does not support this dosage.'],
  ['154', 'Payer deems the information submitted does not support this days supply.'],
  ['155', 'Patient refused the service/procedure.'],
  ['157', 'Service/procedure was provided as a result of an act of war.'],
  ['158', 'Service/procedure was provided outside the United States.'],
  ['159', 'Service/procedure was provided as a result of terrorism.'],
  ['160', 'Injury/illness was the result of an activity that is a benefit exclusion.'],
  ['161', 'Provider performance bonus'],
  ['162', '"State-mandated Requirement for Property and Casualty, see Claim Payment Remarks Code for specific explanation."'],
  ['163', 'Attachment referenced on the claim was not received.'],
  ['164', 'Attachment referenced on the claim was not received in a timely fashion.'],
  ['165', 'Referral absent or exceeded.'],
  ['166', 'These services were submitted after this payers responsibility for processing claims under this plan ended.'],
  ['167', 'This(these) diagnosis(es) is (are) not covered.'],
  ['168', 'Service(s) have been considered under the patients medical plan. Benefits are not available under this dental plan.'],
  ['169', 'Alternate benefit has been provided.'],
  ['170', 'Payment is denied when performed/billed by this type of provider.'],
  ['171', 'Payment is denied when performed/billed by this type of provider in this type of facility.'],
  ['172', 'Payment is adjusted when performed/billed by a provider of this specialty.'],
  ['173', 'Service was not prescribed by a physician.'], ['174', 'Service was not prescribed prior to delivery.'],
  ['175', 'Prescription is incomplete.'], ['176', 'Prescription is not current.'],
  ['177', 'Patient has not met the required eligibility requirements.'],
  ['178', 'Patient has not met the required spend down requirements.'],
  ['179', 'Patient has not met the required waiting requirements.'],
  ['180', 'Patient has not met the required residency requirements.'],
  ['181', 'Procedure code was invalid on the date of service.'],
  ['182', 'Procedure modifier was invalid on the date of service.'],
  ['183', 'The referring provider is not eligible to refer the service billed.'],
  ['184', 'The prescribing/ordering provider is not eligible to prescribe/order the service billed.'],
  ['185', 'The rendering provider is not eligible to perform the service billed.'],
  ['186', 'Level of care change adjustment.'],
  ['187', '"Consumer Spending Account payments (includes but is not limited to Flexible Spending Account, Health Savings Account, Health Reimbursement Account, etc.)"'],
  ['188', 'This product/procedure is only covered when used according to FDA recommendations.'],
  ['189', 'Not otherwise classified or unlisted procedure code (CPT/HCPCS) was billed when there is a specific procedure code for this procedure/service.'],
  ['190', 'Payment is included in the allowance for a Skilled Nursing Facility (SNF) qualified stay.'],
  ['191', 'Not a work related injury/illness and thus not the liability of the workers compensation carrier.'],
  ['192', 'Non standard adjustment code from paper remittance.'],
  ['193', '"Original payment decision is being maintained. Upon review, it was determined that this claim was processed properly."'],
  ['194', '"Anesthesia performed by the operating physician, the assistant surgeon or the attending physician."'],
  ['195', 'Refund issued to an erroneous priority payer for this claim/service.'],
  ['197', 'Precertification/authorization absent.'], ['198', 'Precertification/authorization exceeded.'],
  ['199', 'Revenue code and Procedure code do not match.'],
  ['200', 'Expenses incurred during lapse in coverage.'],
  ['201', 'Workers Compensation case settled. Patient is responsible for amount of this claim/service through WC Medicare set aside arrangement or other agreement. (Use group code PR).'],
  ['202', 'Non-covered personal comfort or convenience services.'],
  ['203', 'Discontinued or reduced service.'],
  ['204', 'This service/equipment/drug is not covered under the patients current benefit plan.'],
  ['205', 'Pharmacy discount card processing fee.'], ['206', 'National Provider Identifier - missing.'],
  ['207', 'National Provider identifier - Invalid format.'], ['208', 'National Provider Identifier - Not matched.'],
  ['209', '"Per regulatory or other agreement. The provider cannot collect this amount from the patient. However, this amount may be billed to subsequent payer. Refund to patient if collected. (Use Group code OA)"'],
  ['210', 'Payment adjusted because pre-certification/authorization not received in a timely fashion.'],
  ['211', '"National Drug Codes (NDC) not eligible for rebate, are not covered."'],
  ['212', 'Administrative surcharges are not covered.'],
  ['213', 'Non-compliance with the physician self referral prohibition legislation or payer policy.'],
  ['214', 'Workers Compensation claim adjudicated as non-compensable. This Payer not liable for claim or service/treatment. (Note: To be used for Workers Compensation only).'],
  ['215', 'Based on subrogation of a third party settlement.'],
  ['216', 'Based on the findings of a review organization.'],
  ['217', 'Based on payer reasonable and customary fees. No maximum allowable defined by legislated fee arrangement. (Note: To be used for Workers Compensation only).'],
  ['218', 'Based on entitlement to benefits. (Note: To be used for Workers Compensation only)'],
  ['219', 'Based on extent of injury. (Note: To be used for Workers Compensation only)'],
  ['220', 'The applicable fee schedule does not contain the billed code. Please resubmit a bill with the appropriate fee schedule code(s) that best describe the service(s) provided and supporting documentation if required. (Note: To be used for Workers Compensation only).'],
  ['221', 'Workers Compensation claim is under investigation. (Note: To be used for Workers Compensation only. Claim pending final resolution)'],
  ['222', 'Exceeds the contracted maximum number of hours/days/units by this provider for this period. This is not patient specific.'],
  ['223', '"Adjustment code for mandated federal, state or local law/regulation that is not already covered by another code and is mandated before a new code can be created."'],
  ['224', 'Patient identification compromised by identity theft. Identity verification required for processing this and future claims.'],
  ['225', 'Penalty or Interest Payment by Payer'],
  ['226', 'Information requested from the Billing/Rendering Provider was not provided or was insufficient/incomplete. At least one Remark Code must be provided.'],
  ['227', 'Information requested from the patient/insured/responsible party was not provided or was insufficient/incomplete. At least one Remark Code must be provided.'],
  ['228', '"Denied for failure of this provider, another provider or the subscriber to supply requested information to a previous payer for their adjudication."'],
  ['229', 'Partial charge amount not considered by Medicare due to the initial claim Type of Bill being 12X.'],
  ['230', 'No available or correlating CPT/HCPCS code to describe this service. Note: Used only by Property and Casualty.'],
  ['231', 'Mutually exclusive procedures cannot be done in the same day/setting.'],
  ['232', 'Institutional Transfer Amount.'],
  ['233', 'Services/charges related to the treatment of a hospital-acquired condition or preventable medical error.'],
  ['234', '"This procedure is not paid separately. At least one Remark Code must be provided (may be comprised of either the NCPDP Reject Reason Code, or Remittance Advice Remark Code that is not an ALERT.)"'],
  ['235', 'Sales Tax'],
  ['236', 'This procedure or procedure modifier combination is not compatible with another procedure or procedure modifier combination provided on the same day according to the National Correct Coding Initiative or workers compensation state regulations/fee schedule requirements.'],
  ['237', 'Legislated Regulatory Penalty. At least one Remark Code must be provided.'],
  ['238', 'Claim spans eligible and ineligible periods of coverage this is the reduction for the ineligible period.'],
  ['239', 'Claim spans eligible and ineligible periods of coverage. Rebill separate claims.'],
  ['240', 'The diagnosis is inconsistent with the patients birth weight.'],
  ['241', 'Low Income Subsidy Co-payment Amount'], ['242', 'Services not provided by network primary care providers.'],
  ['243', 'Services not authorized by network primary care providers.'],
  ['244', 'Payment reduced to zero due to litigation. Additional information will be sent following the conclusion of litigation. To be used for Property Casualty only.'],
  ['245', 'Provider performance program withhold.'],
  ['246', 'This non-payable code is for required reporting only.'],
  ['247', 'Deductible for Professional service rendered in an Institutional setting and billed on an Institutional claim.'],
  ['248', 'Coinsurance for Professional service rendered in an Institutional setting and billed on an Institutional claim.'],
  ['249', 'This claim has been identified as a readmission.'],
  ['250', 'The attachment other documentation content received is inconsistent with the expected content.'],
  ['251', 'The attachment other documentation content received did not contain the content required to process this claim or service.'],
  ['252', 'An attachment other documentation is required to adjudicate this claim service. At least one Remark Code must be provided.'],
  ['253', 'Sequestration - reduction in federal payment.'],
  ['254', 'Claim received by the dental plan but benefits not available under this plan. Submit these services to the patients medical plan for further consideration.'],
  ['255', 'The disposition of the related Property Casualty claim is pending due to litigation.'],
  ['256', 'Service not payable per managed care contract.'],
  ['257', 'The disposition of the claim service is undetermined during the premium payment grace period per Health Insurance Exchange requirements. This claim service will be reversed and corrected when the grace period ends.'],
  ['258', 'Claim service not covered when patient is in custody incarcerated. Applicable federal state or local authority may cover the claim service.'],
  ['259', 'Additional payment for Dental Vision service utilization.'],
  ['260', 'Processed under Medicaid ACA Enhanced Fee Schedule.'],
  ['261', 'The procedure or service is inconsistent with the patients history.'],
  ['262', 'Adjustment for delivery cost. Usage: To be used for pharmaceuticals only.'],
  ['263', 'Adjustment for shipping cost. Usage: To be used for pharmaceuticals only.'],
  ['264', 'Adjustment for postage cost. Usage: To be used for pharmaceuticals only.'],
  ['265', 'Adjustment for administrative cost. Usage: To be used for pharmaceuticals only.'],
  ['266', 'Adjustment for compound preparation cost. Usage: To be used for pharmaceuticals only.'],
  ['267', 'Claim/service spans multiple months. At least one Remark Code must be provided.'],
  ['268', 'The Claim spans two calendar years. Please resubmit one claim per calendar year.'],
  ['269', 'Anesthesia not covered for this service/procedure.'],
  ['270', 'Claim received by the medical plan, but benefits not available under this plan. Submit these services to the patients dental plan.'],
  ['271', 'Prior contractual reductions related to a current periodic payment.'],
  ['272', 'Coverage/program guidelines were not met.'], ['273', 'Coverage/program guidelines were exceeded.'],
  ['274', 'Fee/Service not payable per patient Care Coordination arrangement.'],
  ['275', 'Prior payers patient responsibility.'],
  ['276', 'Services denied by the prior payer(s) are not covered by this payer.'],
  ['277', 'The disposition of the claim/service is undetermined during the premium payment grace period.'],
  ['278', 'Performance program proficiency requirements not met.'],
  ['279', 'Services not provided by Preferred network providers.'],
  ['280', 'Submit these services to the patients Pharmacy plan.'],
  ['281', 'Deductible waived per contractual agreement. Use only with Group Code CO.'],
  ['282', 'The procedure/revenue code is inconsistent with the type of bill.'],
  ['283', 'Attending provider is not eligible to provide direction of care.'],
  ['284', 'Precertification/authorization/notification/pre-treatment number may be valid but does not apply to the billed services.'],
  ['285', 'Appeal procedures not followed.'], ['286', 'Appeal time limits not met.'],
  ['287', 'Referral exceeded.'], ['288', 'Referral absent.'],
  ['289', 'Services considered under the dental and medical plans, benefits not available.'],
  ['290', 'Claim has been forwarded to the patients medical plan for further consideration.'],
  ['291', 'Claim has been forwarded to the patients dental plan for further consideration.'],
  ['292', 'Claim has been forwarded to the patients pharmacy plan for further consideration.'],
  ['293', 'Payment made to employer.'],
  ['A0', 'Patient refund amount.'], ['A1', 'Claim/Service denied. At least one Remark Code must be provided.'],
  ['A5', 'Medicare Claim PPS Capital Cost Outlier Amount.'],
  ['A6', 'Prior hospitalization or 30 day transfer requirement not met.'],
  ['A7', 'Presumptive Payment Adjustment.'], ['A8', 'Ungroupable DRG.'],
  ['AM', 'Applied to Borrower\'s Account.'], ['AP', 'Acceleration of Benefits.'],
  ['B1', 'Non-covered visits.'],
  ['B10', 'Allowed amount has been reduced because a component of the basic procedure/test was paid. The beneficiary is not liable for more than the charge limit for the basic procedure/test.'],
  ['B11', 'The claim/service has been transferred to the proper payer/processor for processing. Claim/service not covered by this payer/processor.'],
  ['B12', 'Services not documented in patients medical records.'],
  ['B13', 'Previously paid. Payment for this claim/service may have been provided in a previous payment.'],
  ['B14', 'Only one visit or consultation per physician per day is covered.'],
  ['B15', 'This service/procedure requires that a qualifying service/procedure be received and covered. The qualifying other service/procedure has not been received/adjudicated.'],
  ['B16', 'New Patient qualifications were not met.'],
  ['B2', 'Rebate'], ['B20', 'Procedure/service was partially or fully furnished by another provider.'],
  ['B22', 'This payment is adjusted based on the diagnosis.'],
  ['B23', 'Procedure billed is not authorized per your Clinical Laboratory Improvement Amendment (CLIA) proficiency test.'],
  ['B3', 'Recovery Allowance'], ['B4', 'Late filing penalty.'],
  ['B5', 'Coverage/program guidelines were not met or were exceeded.'],
  ['B7', 'This provider was not certified/eligible to be paid for this procedure/service on this date of service.'],
  ['B8', '"Alternative services were available, and should have been utilized."'],
  ['B9', 'Patient is enrolled in a Hospice.'], ['BD', 'Bad Debt Adjustment'], ['BN', 'Bonus'],
  ['C5', 'Temporary Allowance'], ['CS', 'Adjustment'], ['CT', 'Capitation Payment'], ['CV', 'Capital Passthru'],
  ['CW', 'Certified Registered Nurse Anesthetist Passthru'],
  ['D23', '"This dual eligible patient is covered by Medicare Part D per Medicare Retro-Eligibility. At least one Remark Code must be provided (may be comprised of either the NCPDP Reject Reason Code, or Remittance Advice Remark Code that is not an ALERT.)"'],
  ['DM', 'Direct Medical Education Passthru'], ['E3', 'Withholding'], ['FB', 'Forwarding Balance'],
  ['FC', 'Fund Allocation'], ['GO', 'Graduate Medical Education Passthru'],
  ['IR', 'Internal Revenue Service Withholding'], ['J1', 'Nonreimbursable'], ['L3', 'Penalty'],
  ['L6', 'Interest Owed'], ['LE', 'Levy'], ['LS', 'Lump Sum'], ['OA', 'Organ Acquisition Passthru'],
  ['OB', 'Offset for Affiliated Providers'],
  ['P1', '"State-mandated Requirement for Property and Casualty see Claim Payment Remarks Code for specific explanation. To be used for Property and Casualty only."'],
  ['P10', 'Payment reduced to zero due to litigation. Additional information will be sent following the conclusion of litigation. To be used for Property and Casualty only.'],
  ['P11', 'The disposition of the related Property Casualty claim is pending due to litigation. To be used for Property and Casualty only.'],
  ['P12', 'Workers compensation jurisdictional fee schedule adjustment.'],
  ['P13', 'Payment reduced or denied based on workers compensation jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['P14', 'The Benefit for this Service is included in the payment allowance for another service procedure that has been performed on the same day.'],
  ['P15', 'Workers Compensation Medical Treatment Guideline Adjustment. To be used for Workers Compensation only.'],
  ['P16', 'Medical provider not authorized certified to provide treatment to injured workers in this jurisdiction. To be used for Workers Compensation only.'],
  ['P17', 'Referral not authorized by attending physician per regulatory requirement. To be used for Property and Casualty only.'],
  ['P18', 'Procedure is not listed in the jurisdiction fee schedule. An allowance has been made for a comparable service. To be used for Property and Casualty only.'],
  ['P19', 'Procedure has a relative value of zero in the jurisdiction fee schedule therefore no payment is due. To be used for Property and Casualty only.'],
  ['P2', 'Not a work related injury illness and thus not the liability of the workers compensation carrier.'],
  ['P20', 'Service not paid under jurisdiction allowed outpatient facility fee schedule. To be used for Property and Casualty only.'],
  ['P21', 'Payment denied based on Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['P22', 'Payment adjusted based on Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['P23', 'Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional fee schedule adjustment.'],
  ['P3', 'Workers Compensation case settled. Patient is responsible for amount of this claim service through WC Medicare set aside arrangement or other agreement. To be used for Workers Compensation only.'],
  ['P4', 'Workers Compensation claim adjudicated as non-compensable. This Payer not liable for claim or service treatment.'],
  ['P5', 'Based on payer reasonable and customary fees. No maximum allowable defined by legislated fee arrangement. To be used for Property and Casualty only.'],
  ['P6', 'Based on entitlement to benefits.'],
  ['P7', 'The applicable fee schedule fee database does not contain the billed code. Please resubmit a bill with the appropriate fee schedule fee database code that best describe the service provided and supporting documentation if required.'],
  ['P8', 'Claim is under investigation.'],
  ['P9', 'No available or correlating CPT HCPCS code to describe this service. To be used for Property and Casualty only.'],
  ['PI', 'Periodic Interim Payment'], ['PL', 'Payment Final'],
  ['PW1', 'Bad Debt'], ['PW2', 'Bankruptcy'], ['PW3', 'Collection Agency'],
  ['PW4', 'Professional Courtesy Discount'], ['PW5', 'Refund'],
  ['RA', 'Retro-activity Adjustment'], ['RE', 'Return on Equity'], ['SL', 'Student Loan Repayment'],
  ['TL', 'Third Party Liability'],
  ['W1', 'Workers Compensation State Fee Schedule Adjustment.'],
  ['W2', 'Payment reduced or denied based on workers compensation jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['W3', 'The Benefit for this Service is included in the payment allowance for another service procedure that has been performed on the same day.'],
  ['W4', 'Workers Compensation Medical Treatment Guideline Adjustment.'],
  ['W5', 'Medical provider not authorized certified to provide treatment to injured workers in this jurisdiction.'],
  ['W6', 'Referral not authorized by attending physician per regulatory requirement.'],
  ['W7', 'Procedure is not listed in the jurisdiction fee schedule. An allowance has been made for a comparable service.'],
  ['W8', 'Procedure has a relative value of zero in the jurisdiction fee schedule therefore no payment is due.'],
  ['W9', 'Service not paid under jurisdiction allowed outpatient facility fee schedule.'],
  ['WO', 'Overpayment Recovery'], ['WU', 'Unspecified Recovery'],
  ['Y1', 'Payment denied based on Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['Y2', 'Payment adjusted based on Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional regulations or payment policies use only if no other code is applicable.'],
  ['Y3', 'Medical Payments Coverage or Personal Injury Protection Benefits jurisdictional fee schedule adjustment.']
]

let wcSelected = new Set()
// The Write Off modal is shared between Collection Management (bulk, operates
// on the checked claims across patients) and the AR Summary (operates on the
// single currently-open patient's receivables). This flag tells wcSubmitWriteOff
// which target to apply to; wcArPatientId holds the AR patient in that mode.
let wcWriteOffMode = 'collection'
let wcArPatientId = null

// Apply one write-off/adjustment to a single receivable, per the modal's Type.
function wcApplyWriteOffToReceivable(r, type, amount, groupCode, reasonCode) {
  const computed = arComputeReceivable(r)
  if (type === 'patientBalanceSelected') r.patDiscounts = String(arParseMoney(r.patDiscounts) + computed._patientBal)
  else if (type === 'insuranceBalanceSelected') r.insAdjs = String(arParseMoney(r.insAdjs) + computed._insBalance)
  else if (type === 'patientBalanceAmount') r.patDiscounts = String(arParseMoney(r.patDiscounts) + Math.min(amount, computed._patientBal))
  else if (type === 'insuranceBalanceAmount') r.insAdjs = String(arParseMoney(r.insAdjs) + Math.min(amount, computed._insBalance))
  r.writeOffGroupCode = groupCode; r.writeOffReasonCode = reasonCode
}

function wcAllClaims() {
  const out = []
  ;(typeof ctgPatients !== 'undefined' ? ctgPatients : []).forEach(p => {
    arSyncFromBilling(p)
    const ar = arEnsure(p)
    ar.receivables.forEach(r => {
      out.push(Object.assign(arComputeReceivable(r), { patientId: p.id, patientName: naturalPatientName(p) }))
    })
  })
  return out.sort((a, b) => (b.billDate || '').localeCompare(a.billDate || ''))
}
function wcRowKey(c) { return c.patientId + '::' + c.id }

/* Collection Management is grouped by PATIENT, not by individual billing table:
   one consolidated row per patient sums every one of their bills, and can be
   expanded to reveal the individual billing tables underneath. Selection and
   write-off therefore operate on a whole patient (all their bills) at once. */
let wcExpanded = new Set()
function wcPatientGroups() {
  const out = []
  ;(typeof ctgPatients !== 'undefined' ? ctgPatients : []).forEach(p => {
    arSyncFromBilling(p)
    const ar = arEnsure(p)
    if (!ar.receivables.length) return
    const { rows, totals } = arComputeTotals(p)
    // Collection Management is only about money still owed - skip any patient
    // whose bills are fully paid / written off (nothing left to collect).
    if (totals.totalBalance <= 0) return
    const sorted = rows.slice().sort((a, b) => (b.billDate || '').localeCompare(a.billDate || ''))
    const statuses = Array.from(new Set(rows.map(r => r.status)))
    out.push({
      patientId: p.id, patientName: naturalPatientName(p),
      rows: sorted, count: rows.length,
      billDate: (sorted[0] && sorted[0].billDate) || '',
      serviceDate: (sorted[0] && sorted[0].serviceDate) || '',
      status: statuses.length === 1 ? statuses[0] : 'Mixed',
      t: totals
    })
  })
  return out.sort((a, b) => a.patientName.localeCompare(b.patientName))
}

function renderCollectionMgmt() {
  wcSelected.clear()
  const groups = wcPatientGroups()
  const tag = document.getElementById('wcClaimCountTag')
  if (tag) tag.textContent = groups.length + (groups.length === 1 ? ' Patient' : ' Patients')
  const mount = document.getElementById('wcTableMount')
  if (!mount) return
  if (!groups.length) {
    mount.innerHTML = '<div data-cs="'+__cs+'padding:44px 24px;text-align:center;color:var(--muted);font-size:13px">No claims yet. Claims are generated from each patient\'s Billing tables (Day 1, exams, and daily notes), or add charges manually from AR Summary.</div>'
    wcUpdateSelectionUI()
    return
  }
  const caret = open => '<svg class="wc-caret' + (open ? ' open' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
  let h = '<table class="ar-table"><thead><tr><th></th><th>Patient</th><th>Bills</th><th>Latest Bill</th><th>Latest Service</th><th>Status</th>'
    + '<th>Charges</th><th>Ins Charges</th><th>Ins Payments</th><th>Ins Adjs</th><th>Ins Balance</th>'
    + '<th>Patient Charges</th><th>Pat Payments</th><th>Pat Discounts</th><th>Patient Bal</th></tr></thead><tbody>'
  groups.forEach(g => {
    const isOpen = wcExpanded.has(g.patientId)
    const color = AR_STATUS_COLORS[g.status] || AR_STATUS_COLORS['InProgress Claims']
    const patCharges = g.t.charges - g.t.insCharges
    h += '<tr class="wc-patient-row" data-onclick="wcToggleExpand(\'' + arEsc(g.patientId) + '\')">'
      + '<td data-cs="'+__cs+'border-left:4px solid ' + color + '" data-onclick="event.stopPropagation()"><input type="checkbox" data-wcpid="' + arEsc(g.patientId) + '" data-onchange="wcToggleRow(\'' + arEsc(g.patientId) + '\',this.checked)"></td>'
      + '<td><span class="wc-patient-name">' + caret(isOpen) + arEsc(g.patientName) + '</span></td>'
      + '<td><span class="wc-bill-count">' + g.count + (g.count === 1 ? ' bill' : ' bills') + '</span></td>'
      + '<td>' + arEsc(g.billDate) + '</td>'
      + '<td>' + arEsc(g.serviceDate) + '</td>'
      + '<td>' + (g.status === 'Mixed' ? '<span class="ar-status-pill" data-cs="'+__cs+'background:var(--s2);color:var(--muted)">Mixed</span>' : '<span class="ar-status-pill" data-cs="'+__cs+'background:' + color + ';color:' + apptContrastText(color) + '">' + arEsc(g.status) + '</span>') + '</td>'
      + '<td>' + arFmtMoney(g.t.charges) + '</td>'
      + '<td>' + arFmtMoney(g.t.insCharges) + '</td>'
      + '<td>' + arFmtMoney(g.t.insPayments) + '</td>'
      + '<td>' + arFmtMoney(g.t.insAdjs) + '</td>'
      + '<td>' + arFmtMoney(g.t.insBalance) + '</td>'
      + '<td>' + arFmtMoney(patCharges) + '</td>'
      + '<td>' + arFmtMoney(g.t.patPayments) + '</td>'
      + '<td>' + arFmtMoney(g.t.patDiscounts) + '</td>'
      + '<td><strong>' + arFmtMoney(g.t.patientBal) + '</strong></td>'
      + '</tr>'
    if (isOpen) {
      g.rows.forEach(r => {
        const rc = AR_STATUS_COLORS[r.status] || AR_STATUS_COLORS['InProgress Claims']
        h += '<tr class="wc-bill-row">'
          + '<td data-cs="'+__cs+'border-left:4px solid ' + rc + '"></td>'
          + '<td></td>'
          + '<td class="ar-claim-id">' + arEsc(r.claimId) + '</td>'
          + '<td>' + arEsc(r.billDate) + '</td>'
          + '<td>' + arEsc(r.serviceDate) + '</td>'
          + '<td><span class="ar-status-pill" data-cs="'+__cs+'background:' + rc + ';color:' + apptContrastText(rc) + '">' + arEsc(r.status) + '</span></td>'
          + '<td>' + arFmtMoney(r._charges) + '</td>'
          + '<td>' + arFmtMoney(r._insCharges) + '</td>'
          + '<td>' + arFmtMoney(r._insPayments) + '</td>'
          + '<td>' + arFmtMoney(r._insAdjs) + '</td>'
          + '<td>' + arFmtMoney(r._insBalance) + '</td>'
          + '<td>' + arFmtMoney(r._patCharges) + '</td>'
          + '<td>' + arFmtMoney(r._patPayments) + '</td>'
          + '<td>' + arFmtMoney(r._patDiscounts) + '</td>'
          + '<td><strong>' + arFmtMoney(r._patientBal) + '</strong></td>'
          + '</tr>'
      })
    }
  })
  h += '</tbody></table>'
  mount.innerHTML = h
  wcUpdateSelectionUI()
}
function wcToggleExpand(patientId) {
  if (wcExpanded.has(patientId)) wcExpanded.delete(patientId); else wcExpanded.add(patientId)
  // Re-render just the table body; keep current selection intact.
  const selected = new Set(wcSelected)
  renderCollectionMgmt()
  wcSelected = selected
  document.querySelectorAll('#wcTableMount input[data-wcpid]').forEach(cb => { cb.checked = wcSelected.has(cb.getAttribute('data-wcpid')) })
  wcUpdateSelectionUI()
}
function wcToggleRow(patientId, checked) {
  if (checked) wcSelected.add(patientId); else wcSelected.delete(patientId)
  wcUpdateSelectionUI()
}
function wcToggleSelectAll(checked) {
  document.querySelectorAll('#wcTableMount input[data-wcpid]').forEach(cb => {
    cb.checked = checked
    if (checked) wcSelected.add(cb.getAttribute('data-wcpid')); else wcSelected.delete(cb.getAttribute('data-wcpid'))
  })
  wcUpdateSelectionUI()
}
function wcUpdateSelectionUI() {
  const label = document.getElementById('wcSelectedCountLabel')
  if (label) label.textContent = wcSelected.size + (wcSelected.size === 1 ? ' patient selected' : ' patients selected')
  const btn = document.getElementById('wcWriteOffBtn')
  if (btn) btn.disabled = wcSelected.size === 0
  const selectAll = document.getElementById('wcSelectAll')
  const allBoxes = document.querySelectorAll('#wcTableMount input[data-wcpid]')
  if (selectAll) selectAll.checked = allBoxes.length > 0 && wcSelected.size === allBoxes.length
}

/* ---------- searchable combo (Group Code / Reason Code) ----------
   A plain <select> with 250+ options is unusable - this is a small,
   dependency-free searchable dropdown: type to filter, click/Enter to pick. */
function wcComboOptionsHTML(list, query, onSelectFn) {
  const q = (query || '').trim().toLowerCase()
  const filtered = q ? list.filter(([c, t]) => c.toLowerCase().includes(q) || t.toLowerCase().includes(q)) : list
  const shown = filtered.slice(0, 60)
  if (!shown.length) return '<div class="ar-combo-empty">No matches</div>'
  let h = shown.map(([c, t]) =>
    '<div class="ar-combo-option" data-onmousedown="event.preventDefault();' + onSelectFn + '(\'' + arEsc(c) + '\')"><span class="ar-combo-code">' + arEsc(c) + '</span><span class="ar-combo-text">' + arEsc(t) + '</span></div>'
  ).join('')
  if (filtered.length > shown.length) h += '<div class="ar-combo-empty">+' + (filtered.length - shown.length) + ' more — keep typing to narrow down</div>'
  return h
}
let wcComboActiveInputId = null
function wcPositionComboPanel(inputId) {
  const input = document.getElementById(inputId)
  const panel = document.getElementById('wcComboPanel')
  if (!input || !panel) return
  const r = input.getBoundingClientRect()
  const maxLeft = window.innerWidth - r.width - 12
  panel.style.left = Math.max(8, Math.min(r.left, maxLeft)) + 'px'
  panel.style.top = (r.bottom + 4) + 'px'
  panel.style.width = r.width + 'px'
}
function wcOpenCombo(inputId, list, selectFn) {
  wcComboActiveInputId = inputId
  const panel = document.getElementById('wcComboPanel')
  panel.innerHTML = wcComboOptionsHTML(list, document.getElementById(inputId).value, selectFn)
  wcPositionComboPanel(inputId)
  panel.classList.add('show')
}
function wcCloseCombo() {
  const panel = document.getElementById('wcComboPanel')
  if (panel) panel.classList.remove('show')
  wcComboActiveInputId = null
}
function wcOpenGroup() { wcOpenCombo('wcGroupInput', WC_GROUP_CODES, 'wcSelectGroup') }
function wcFilterGroup() { wcOpenCombo('wcGroupInput', WC_GROUP_CODES, 'wcSelectGroup') }
function wcSelectGroup(code) {
  const item = WC_GROUP_CODES.find(x => x[0] === code)
  const input = document.getElementById('wcGroupInput')
  input.value = item ? item[0] + ' — ' + item[1] : code
  input.dataset.value = code
  wcCloseCombo()
}
function wcOpenReason() { wcOpenCombo('wcReasonInput', WC_REASON_CODES, 'wcSelectReason') }
function wcFilterReason() { wcOpenCombo('wcReasonInput', WC_REASON_CODES, 'wcSelectReason') }
function wcSelectReason(code) {
  const item = WC_REASON_CODES.find(x => x[0] === code)
  const input = document.getElementById('wcReasonInput')
  input.value = item ? item[0] + ' — ' + item[1] : code
  input.dataset.value = code
  wcCloseCombo()
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ar-combo') && !e.target.closest('#wcComboPanel')) wcCloseCombo()
})
window.addEventListener('resize', () => { if (wcComboActiveInputId) wcPositionComboPanel(wcComboActiveInputId) })
document.addEventListener('scroll', () => { if (wcComboActiveInputId) wcPositionComboPanel(wcComboActiveInputId) }, true)

/* ---------- Write Off modal ---------- */
function wcTypeChange() {
  const type = document.getElementById('wcTypeSelect').value
  const isAmount = type === 'patientBalanceAmount' || type === 'insuranceBalanceAmount'
  document.getElementById('wcAmountRow').style.display = isAmount ? '' : 'none'
  const target = wcWriteOffMode === 'arPatient' ? "this patient's claims" : 'the selected claims'
  document.getElementById('wcConfirmText').textContent = isAmount
    ? 'Are you sure you want to adjust the ' + (type.indexOf('patient') === 0 ? 'patient' : 'insurance') + ' balance by the amount entered for ' + target + '?'
    : 'Are you sure you want to write off ' + target + '?'
}
function wcOpenWriteOffModal() {
  if (!wcSelected.size) return
  wcWriteOffMode = 'collection'
  document.getElementById('wcTypeSelect').value = 'patientBalanceSelected'
  document.getElementById('wcAmount').value = ''
  document.getElementById('wcGroupInput').value = ''
  document.getElementById('wcGroupInput').dataset.value = ''
  document.getElementById('wcReasonInput').value = ''
  document.getElementById('wcReasonInput').dataset.value = ''
  wcTypeChange()
  document.getElementById('wcWriteOffModal').classList.add('show')
}
function wcCloseWriteOffModal() { document.getElementById('wcWriteOffModal').classList.remove('show') }

async function wcSubmitWriteOff() {
  const type = document.getElementById('wcTypeSelect').value
  const groupCode = document.getElementById('wcGroupInput').dataset.value || ''
  const reasonCode = document.getElementById('wcReasonInput').dataset.value || ''
  const amount = arParseMoney(document.getElementById('wcAmount').value)
  const isAmountType = type === 'patientBalanceAmount' || type === 'insuranceBalanceAmount'
  if (isAmountType && !amount) { showToast('Enter an amount', 'err'); return }

  // AR Summary mode - apply to the single open patient's receivables.
  if (wcWriteOffMode === 'arPatient') {
    const p = getPatient(wcArPatientId)
    if (!p) { wcCloseWriteOffModal(); return }
    if (!(await ctgConfirm("Are you sure you want to write off this patient's claims?", { danger: true, okLabel: 'Write Off' }))) return
    const ar = arEnsure(p)
    let applied = 0
    ar.receivables.forEach(r => { wcApplyWriteOffToReceivable(r, type, amount, groupCode, reasonCode); applied++ })
    persistPatients()
    wcCloseWriteOffModal()
    renderArSummary()
    showToast(applied + (applied === 1 ? ' claim' : ' claims') + ' written off', 'ok')
    return
  }

  const patientCount = wcSelected.size
  if (!(await ctgConfirm('Are you sure you want to write off ' + patientCount + (patientCount === 1 ? " patient's" : " patients'") + ' balances?', { danger: true, okLabel: 'Write Off' }))) return
  let appliedPatients = 0, appliedClaims = 0
  ;(typeof ctgPatients !== 'undefined' ? ctgPatients : []).forEach(p => {
    if (!wcSelected.has(p.id)) return
    const ar = arEnsure(p)
    ar.receivables.forEach(r => { wcApplyWriteOffToReceivable(r, type, amount, groupCode, reasonCode); appliedClaims++ })
    appliedPatients++
  })
  persistPatients()
  wcCloseWriteOffModal()
  renderCollectionMgmt()
  showToast(appliedClaims + (appliedClaims === 1 ? ' bill' : ' bills') + ' across ' + appliedPatients + (appliedPatients === 1 ? ' patient' : ' patients') + ' written off', 'ok')
}
