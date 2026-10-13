
const APPT_CFG_KEY = 'ctg_appt_config_v1'

const APPT_CFG_ENCOUNTER_CODES = ['None', 'New Office Consultation', 'Established Office Consultation',
  'New Outpatient Consultation', 'New Inpatient Consultation', 'New ER', 'Initial Hospital', 'Subsequent Hospital',
  'Initial Observation', 'Subsequent Observation', 'Initial Nursing Facility', 'Subsequent Nursing Facility',
  'Other Nursing Facility', 'Initial Domiciliary', 'Subsequent Domiciliary', 'Initial Home Care',
  'Subsequent Home Care', 'CCM', 'TCM', 'Virtual', 'Pre-admission', 'Short Stay']

const APPT_CFG_PAYER_CASES = ['Accident 1', 'Accident 2', 'Accident 3', 'Attorney', 'Health Insurance',
  'Neuro', 'Neuro 2', 'Neuro 3', 'Neuro 4', 'Personal Accident', 'PI', 'PI 2', 'PI 3', 'Self Pay', 'Work Comp']

const APPT_CFG_ELIG_TESTS = ['General', 'Professional', 'Chiropractic', 'Surgery']

const APPT_CFG_BILLING_PROVIDERS = ['Nicholas Grande', 'SMART Medical', 'Vincent Friedman']

/* The portal's existing colors only (visit types + break/block categories +
   appointment statuses). Violet is Reschedule's real status color - it was
   missing here, which is why the Color Legend showed its raw hex instead of
   a name. */
const APPT_CFG_PALETTE = [
  ['#1FCECB', 'Robin Egg Blue'], ['#1A56DB', 'Blue'], ['#0A6E3F', 'Green'],
  ['#C2540A', 'Burnt Orange'], ['#F5C518', 'Yellow'], ['#B57EDC', 'Lilac'],
  ['#F5D913', 'Lemon Yellow'], ['#F8B8D0', 'Pale Pink'], ['#E8112D', 'Bright Red'],
  ['#B22222', 'Deep Red'], ['#2E8B57', 'Sea Green'], ['#7C3AED', 'Violet'], ['#7A776C', 'Neutral']
]
function apptCfgColorName(hex) { const m = APPT_CFG_PALETTE.find(c => c[0].toLowerCase() === String(hex || '').toLowerCase()); return m ? m[1] : (hex || '—') }

const APPT_CFG_MINUTES = [15, 30, 45, 60, 75, 90]
const APPT_CFG_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

let apptCfg = null
let apptCfgTab = 'visitTypes'
let apptCfgEditing = { visitTypes: null, eligibility: null, rooms: null, schedulers: null, employeeRs: null }
// Working Hours state: which Calendar is in context (shared across its three
// sub-tabs so switching between them doesn't lose your place), and which
// calTiming record the day-grid is currently showing.
let apptCfgWhCalendarId = null
let apptCfgWhFacility = ''
let apptCfgActiveTimingId = null

function apptCfgNewId() { return 'cfg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

/* Seed the visit-type list from the calendar's VISIT_TYPES so the existing
   five keep their exact colors, locked. */
function apptCfgLoad() {
  if (apptCfg) return apptCfg
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(APPT_CFG_KEY)) } catch (e) {}
  apptCfg = stored && typeof stored === 'object' ? stored : {}
  if (!Array.isArray(apptCfg.visitTypes)) apptCfg.visitTypes = []
  if (!Array.isArray(apptCfg.eligibility)) apptCfg.eligibility = []
  if (!Array.isArray(apptCfg.rooms)) apptCfg.rooms = []
  if (!Array.isArray(apptCfg.schedulers)) apptCfg.schedulers = []
  // "Calendar" = a schedulable resource - the provider, plus whichever staff
  // the clinic adds. Seeded with the one name already used elsewhere in the
  // portal (the top-bar provider); everyone else is added by the admin rather
  // than guessed here, since this app has no other roster to seed from.
  if (!Array.isArray(apptCfg.calendars)) apptCfg.calendars = [{ id: apptCfgNewId(), name: 'Nicholas Grande' }]
  // Resource Scheduler display name + sequence are per-calendar overrides on
  // top of that same roster - default the name and seed an order index the
  // first time each entry is seen, never overwriting an admin's later edit.
  apptCfg.calendars.forEach((c, i) => {
    if (!c.rsName) c.rsName = c.name
    if (c.order == null) c.order = i
    if (!c.defaultFacility) c.defaultFacility = APPT_FACILITIES[0]
  })
  if (!Array.isArray(apptCfg.encounterVisitCounts)) apptCfg.encounterVisitCounts = []
  if (!Array.isArray(apptCfg.orderSets)) apptCfg.orderSets = []
  if (!Array.isArray(apptCfg.visitTypeOrderSets)) apptCfg.visitTypeOrderSets = []
  // Seeded with the two examples actually seen in the reference screen -
  // there's no other source for what a "Plan Set" should be called.
  if (!Array.isArray(apptCfg.planSets)) apptCfg.planSets = ['Diagnosis List', 'New patient']
  if (!Array.isArray(apptCfg.visitTypePlanSets)) apptCfg.visitTypePlanSets = []
  if (!apptCfg.classesConfig || typeof apptCfg.classesConfig !== 'object') apptCfg.classesConfig = {}
  if (!apptCfg.servicesConfig || typeof apptCfg.servicesConfig !== 'object') apptCfg.servicesConfig = {}
  if (!Array.isArray(apptCfg.calTimings)) apptCfg.calTimings = []
  if (!Array.isArray(apptCfg.visitDurations)) apptCfg.visitDurations = []
  if (!Array.isArray(apptCfg.legendStatuses)) apptCfg.legendStatuses = []
  if (!Array.isArray(apptCfg.breakBlockTexts)) apptCfg.breakBlockTexts = []
  Object.keys(BREAK_CATEGORIES).forEach((name, i) => {
    let row = apptCfg.breakBlockTexts.find(s => s.name === name)
    if (!row) { row = { id: apptCfgNewId(), name, builtin: true, active: true, order: i, color: BREAK_CATEGORIES[name] }; apptCfg.breakBlockTexts.push(row) }
    row.builtin = true
  })
  Object.keys(APPT_STATUS_COLORS).forEach((name, i) => {
    let row = apptCfg.legendStatuses.find(s => s.name === name)
    if (!row) { row = { id: apptCfgNewId(), name, builtin: true, order: i, color: APPT_STATUS_COLORS[name] }; apptCfg.legendStatuses.push(row) }
    row.builtin = true
  })
  // Seed / re-sync built-ins (their color always mirrors VISIT_TYPES).
  Object.keys(VISIT_TYPES).forEach((name, i) => {
    let row = apptCfg.visitTypes.find(v => v.name === name)
    if (!row) {
      row = { id: apptCfgNewId(), name: name, builtin: true, encounterCode: 'None', payerCase: '', facility: '',
        active: true, autoSign: false, nonBillable: false, sickVisit: false, televisit: false, considerRemaining: true, order: i }
      apptCfg.visitTypes.push(row)
    }
    row.builtin = true
    row.color = VISIT_TYPES[name].dot
  })
  return apptCfg
}
function apptCfgSave() {
  try { localStorage.setItem(APPT_CFG_KEY, JSON.stringify(apptCfg)) } catch (e) {}
  /* Scheduling configuration is shared: rooms, visit types, working hours and
     colour legend have to be the same for everyone or two people book against
     different rules. */
  if (typeof window.ctgApiFetch === 'function') {
    window.ctgApiFetch('/api/shared/doc/apptConfig', {
      method: 'PUT', body: JSON.stringify({ data: apptCfg, version: apptCfgVersion })
    }).then(function (r) { apptCfgVersion = r.version })
      .catch(function (e) {
        if (e && e.status === 409) {
          if (typeof showToast === 'function') showToast('Appointment Configs were changed by someone else — reloading.', 'err')
          apptCfgLoadRemote(true)
        }
      })
  }
  apptCfgPopulateVisitSelect()
}

/* ---------- Integration with the calendar / booking modal ---------- */
/* Colors for custom visit types (built-ins are answered by VISIT_TYPES first). */
function apptConfigVisitMeta(name) {
  const row = apptCfgLoad().visitTypes.find(v => v.name === name && !v.builtin)
  if (!row || !row.color) return null
  const m = row.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  const bg = m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',.30)' : 'rgba(150,146,134,.30)'
  return { dot: row.color, bg: bg, border: row.color }
}
/* Booking modal dropdown = active visit types in calendar order. */
function apptCfgPopulateVisitSelect() {
  const sel = document.getElementById('apptVisitType')
  if (!sel) return
  const cur = sel.value
  const rows = apptCfgLoad().visitTypes.filter(v => v.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)))
  sel.innerHTML = rows.map(v => '<option value="' + apptEsc(v.name) + '">' + apptEsc(apptVisitLabel(v.name)) + '</option>').join('')
  if (rows.some(v => v.name === cur)) sel.value = cur
}

/* ---------- Page ---------- */
/* Visit Type is one tab with two sub-tabs (Manage visit-type / Manage
   Visittype-eligibility test), mirroring the EHR's layout. */
const APPT_CFG_TABS = [
  ['visitTypes', 'Visit Type'], ['schedulers', 'Non Provider Scheduler'], ['workingHours', 'Working Hours'], ['legend', 'Color Legend'],
  ['breakBlock', 'Break & Block'], ['employeeRs', 'Employee RS Name'], ['employeeOrder', 'Employee Order For RS'], ['defaultFacility', 'Default Facility For RS'],
  ['classes', 'Classes'], ['services', 'Services'], ['encounterCount', 'Encounter Visit Type Count'],
  ['orderSet', 'Visit Type Order Set Configuration'], ['planSet', 'Visit Type PlanSet Configuration']
]
let apptCfgVisitSub = 'manage' // 'manage' | 'eligibility'
let apptCfgWhSub = 'timings' // 'timings' | 'duration' | 'group'

/* Pull the shared configuration. Called before the page first renders, and
   again whenever another user saves. */
let apptCfgVersion = 0
function apptCfgLoadRemote(rerender) {
  if (typeof window.ctgApiFetch !== 'function') return Promise.resolve()
  return window.ctgApiFetch('/api/shared/doc/apptConfig').then(function (r) {
    apptCfgVersion = r.version || 0
    if (r.data && typeof r.data === 'object') {
      apptCfg = r.data
      try { localStorage.setItem(APPT_CFG_KEY, JSON.stringify(apptCfg)) } catch (e) {}
    } else if (apptCfgVersion === 0) {
      apptCfgSave()   // seed from whatever this browser already had
    }
    if (rerender && typeof renderApptConfigs === 'function') renderApptConfigs()
  }).catch(function () { /* offline - the cached copy stands */ })
}
window.ctgApptConfigRealtime = function () { apptCfgLoadRemote(true) }

let apptCfgFetched = false
function renderApptConfigs() {
  if (!apptCfgFetched) { apptCfgFetched = true; apptCfgLoadRemote(true) }
  apptCfgLoad()
  const tabs = document.getElementById('apptCfgTabs')
  if (tabs) tabs.innerHTML = APPT_CFG_TABS.map(t =>
    '<div class="msg-tab' + (t[0] === apptCfgTab ? ' active' : '') + '" data-onclick="apptCfgSwitch(\'' + t[0] + '\')">' + t[1] + '</div>').join('')
  const body = document.getElementById('apptCfgBody')
  if (!body) return
  if (apptCfgTab === 'visitTypes') {
    const sub = (id, label) => '<button type="button" class="acfg-subtab' + (apptCfgVisitSub === id ? ' active' : '') + '" data-onclick="apptCfgVisitSubSwitch(\'' + id + '\')">' + label + '</button>'
    body.innerHTML = '<div class="acfg-subtabs">' + sub('manage', 'Manage visit-type') + sub('eligibility', 'Manage Visittype-eligibility test') + '</div>'
      + (apptCfgVisitSub === 'eligibility' ? apptCfgEligibilityHTML() : apptCfgVisitTypesHTML())
  }
  else if (apptCfgTab === 'schedulers') body.innerHTML = apptCfgSchedulersHTML()
  else if (apptCfgTab === 'legend') body.innerHTML = apptCfgLegendHTML()
  else if (apptCfgTab === 'breakBlock') body.innerHTML = apptCfgBreakBlockHTML()
  else if (apptCfgTab === 'employeeRs') body.innerHTML = apptCfgEmployeeRsHTML()
  else if (apptCfgTab === 'employeeOrder') body.innerHTML = apptCfgEmployeeOrderHTML()
  else if (apptCfgTab === 'defaultFacility') body.innerHTML = apptCfgDefaultFacilityHTML()
  else if (apptCfgTab === 'classes') body.innerHTML = apptCfgClassesHTML()
  else if (apptCfgTab === 'services') body.innerHTML = apptCfgServicesHTML()
  else if (apptCfgTab === 'encounterCount') body.innerHTML = apptCfgEncounterCountHTML()
  else if (apptCfgTab === 'orderSet') body.innerHTML = apptCfgOrderSetHTML()
  else if (apptCfgTab === 'planSet') body.innerHTML = apptCfgPlanSetHTML()
  else if (apptCfgTab === 'workingHours') {
    const sub = (id, label) => '<button type="button" class="acfg-subtab' + (apptCfgWhSub === id ? ' active' : '') + '" data-onclick="apptCfgWhSubSwitch(\'' + id + '\')">' + label + '</button>'
    body.innerHTML = '<div class="acfg-subtabs">' + sub('timings', 'Calendar Timings') + sub('duration', 'Visit Type Duration') + sub('group', 'Visit Group Durations') + '</div>'
      + (apptCfgWhSub === 'duration' ? apptCfgVisitDurationHTML() : apptCfgWhSub === 'group' ? apptCfgVisitGroupHTML() : apptCfgCalTimingsHTML())
  }
}
function apptCfgSwitch(tab) { apptCfgTab = tab; renderApptConfigs() }
function apptCfgVisitSubSwitch(sub) { apptCfgVisitSub = sub; renderApptConfigs() }
function apptCfgWhSubSwitch(sub) { apptCfgWhSub = sub; renderApptConfigs() }

const apptCfgOpt = (v, cur, label) => '<option value="' + apptEsc(v) + '"' + (v === cur ? ' selected' : '') + '>' + apptEsc(label || v || '— Select —') + '</option>'
// Pill-style toggle chip (reuses the same visual language as the Forms-to-Send
// checklist) - filled/accent when checked, via :has(), so no onchange wiring.
function apptCfgChk(id, label, on, disabled) {
  return '<label class="acfg-chk' + (disabled ? ' is-disabled' : '') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span>' + label + '</span></label>'
}
// Small inline icon + section title, echoing pld-info-title elsewhere in the portal.
function apptCfgSectionHead(icon, title, badge) {
  return '<div class="acfg-section-head"><span class="acfg-section-ico">' + icon + '</span><span class="acfg-section-title">' + title + '</span>' + (badge || '') + '</div>'
}

/* ---- Compact multi-select dropdown (Scheduler -> Facility) ----
   A single-line control, matching the height of the fields on either side of
   it, instead of a stack of checkboxes that made the row uneven. */
function apptCfgFacLabel(list) {
  if (!list.length) return '— Select —'
  if (APPT_FACILITIES.length > 1 && list.length >= APPT_FACILITIES.length) return 'All Facilities'
  return list.join(', ')
}
function apptCfgToggleFacSel(evt) {
  if (evt) evt.stopPropagation()
  const sel = document.getElementById('cfgSchFacSel')
  if (sel) sel.classList.toggle('open')
}
function apptCfgSyncFacLabel() {
  const label = document.getElementById('cfgSchFacLabel')
  if (!label) return
  const chosen = [...document.querySelectorAll('.cfgSchFac:checked')].map(c => c.value)
  label.textContent = apptCfgFacLabel(chosen)
}
document.addEventListener('click', e => {
  const sel = document.getElementById('cfgSchFacSel')
  if (sel && sel.classList.contains('open') && !sel.contains(e.target)) sel.classList.remove('open')
})
const ACFG_ICONS = {
  visitType: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83 3.83 11l9.58 9.59a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>',
  eligibility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M15 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/><circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none"/></svg>',
  scheduler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>',
  hours: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  legend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 0 0 10-10c0-1-.6-1.6-1.6-1.6H16a2 2 0 0 1-2-2V5.6C14 4.6 13.4 4 12.4 4A10 10 0 0 0 12 22Z"/><circle cx="7.5" cy="11.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="11" cy="7" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="12.5" r="1.4" fill="currentColor" stroke="none"/></svg>'
}

/* ---- Tab 1: Visit Types ---- */
function apptCfgVisitTypesHTML() {
  const e = apptCfgEditing.visitTypes ? apptCfg.visitTypes.find(v => v.id === apptCfgEditing.visitTypes) : null
  const d = e || { name: '', encounterCode: 'None', color: '', payerCase: '', facility: '', active: true, autoSign: false, nonBillable: false, sickVisit: false, televisit: false, considerRemaining: true, order: apptCfg.visitTypes.length }
  const locked = !!(e && e.builtin)
  const colorOpts = '<option value="">— Select —</option>' + APPT_CFG_PALETTE.map(c => apptCfgOpt(c[0], d.color, c[1])).join('')
  const rows = apptCfg.visitTypes.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(v => {
    const meta = VISIT_TYPES[v.name] || (apptConfigVisitMeta(v.name) || {})
    const sw = meta.dot ? '<span class="acfg-swatch" data-cs="'+__cs+'background:' + meta.dot + '"></span>' : ''
    return '<tr class="' + (v.active === false ? 'acfg-off' : '') + '">'
      + '<td>' + sw + apptEsc(apptVisitLabel(v.name)) + (v.builtin ? ' <span class="acfg-badge">Built-in</span>' : '') + '</td>'
      + '<td>' + apptEsc(v.encounterCode || 'None') + '</td>'
      + '<td>' + apptEsc(apptCfgColorName(meta.dot)) + '</td>'
      + '<td>' + apptEsc(v.payerCase || '—') + '</td>'
      + '<td>' + apptEsc(v.facility || 'Both') + '</td>'
      + '<td class="acfg-flags">' + ['autoSign', 'nonBillable', 'sickVisit', 'televisit', 'considerRemaining'].filter(k => v[k]).map(k => ({ autoSign: 'Auto Sign', nonBillable: 'Non-Billable', sickVisit: 'Sick', televisit: 'Televisit', considerRemaining: 'Enc. Remaining' })[k]).join(', ') + '</td>'
      + '<td>' + (v.order || 0) + '</td>'
      + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEdit(\'visitTypes\',\'' + v.id + '\')">Edit</button>'
      + (v.builtin ? '' : '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDelete(\'visitTypes\',\'' + v.id + '\')">Delete</button>') + '</td>'
      + '</tr>'
  }).join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.visitType, e ? 'Edit Visit Type' : 'New Visit Type', locked ? ' <span class="acfg-badge">Built-in — name &amp; color locked</span>' : '')
    + '<div class="g3">'
    + '<div class="fg"><label>Visit Name</label><input type="text" id="cfgVtName" value="' + apptEsc(d.name) + '"' + (locked ? ' readonly class="int-readonly"' : '') + '></div>'
    + '<div class="fg"><label>Encounter Code</label><select id="cfgVtCode">' + APPT_CFG_ENCOUNTER_CODES.map(c => apptCfgOpt(c, d.encounterCode)).join('') + '</select></div>'
    + '<div class="fg"><label>Color' + (locked ? ' (locked)' : '') + '</label><div class="acfg-color-row"><span class="acfg-swatch acfg-swatch-lg" id="cfgVtColorSwatch" data-cs="'+__cs+'background:' + apptEsc(d.color || '#7A776C') + '"></span><select id="cfgVtColor" data-onchange="apptCfgPreviewColor(this.value)"' + (locked ? ' disabled' : '') + '>' + colorOpts + '</select></div></div>'
    + '<div class="fg"><label>Default Payer Case</label><select id="cfgVtPayer"><option value="">— Select —</option>' + APPT_CFG_PAYER_CASES.map(c => apptCfgOpt(c, d.payerCase)).join('') + '</select></div>'
    + '<div class="fg"><label>Facility</label><select id="cfgVtFacility"><option value="">Both</option>' + APPT_FACILITIES.map(f => apptCfgOpt(f, d.facility)).join('') + '</select></div>'
    + '<div class="fg"><label>Calendar Order</label><input type="number" id="cfgVtOrder" value="' + (d.order || 0) + '" min="0"></div>'
    + '</div>'
    + '<div class="acfg-checkrow">'
    + apptCfgChk('cfgVtActive', 'Active', d.active !== false)
    + apptCfgChk('cfgVtAutoSign', 'Auto Sign Note', d.autoSign)
    + apptCfgChk('cfgVtNonBillable', 'Non-Billable', d.nonBillable)
    + apptCfgChk('cfgVtSick', 'Sick Visit Type', d.sickVisit)
    + apptCfgChk('cfgVtTelevisit', 'Generate Televisit Link', d.televisit)
    + apptCfgChk('cfgVtRemaining', 'Consider in Encounter Remaining', d.considerRemaining)
    + '</div>'
    + '<div class="acfg-form-actions">'
    + (e ? '<button class="btn btn-ghost" data-onclick="apptCfgCancelEdit(\'visitTypes\')">Cancel</button>' : '')
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveVisitType()">' + (e ? 'Save Changes' : 'Add Visit Type') + '</button>'
    + '</div>'
    + '</div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Visit Name</th><th>Encounter Code</th><th>Color</th><th>Default Payer Case</th><th>Facility</th><th>Flags</th><th>Order</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '</div>'
}
function apptCfgPreviewColor(hex) {
  const sw = document.getElementById('cfgVtColorSwatch')
  if (sw) sw.style.background = hex || '#7A776C'
}
function apptCfgSaveVisitType() {
  const name = (document.getElementById('cfgVtName').value || '').trim()
  if (!name) { showToast('Enter a visit name', 'err'); return }
  const editingId = apptCfgEditing.visitTypes
  const clash = apptCfg.visitTypes.find(v => v.name === name && v.id !== editingId)
  if (clash) { showToast('A visit type with that name already exists', 'err'); return }
  const row = editingId ? apptCfg.visitTypes.find(v => v.id === editingId) : { id: apptCfgNewId(), builtin: false }
  if (!row) return
  if (!row.builtin) { row.name = name; row.color = document.getElementById('cfgVtColor').value || '#7A776C' }
  row.encounterCode = document.getElementById('cfgVtCode').value
  row.payerCase = document.getElementById('cfgVtPayer').value
  row.facility = document.getElementById('cfgVtFacility').value
  row.order = parseInt(document.getElementById('cfgVtOrder').value, 10) || 0
  row.active = document.getElementById('cfgVtActive').checked
  row.autoSign = document.getElementById('cfgVtAutoSign').checked
  row.nonBillable = document.getElementById('cfgVtNonBillable').checked
  row.sickVisit = document.getElementById('cfgVtSick').checked
  row.televisit = document.getElementById('cfgVtTelevisit').checked
  row.considerRemaining = document.getElementById('cfgVtRemaining').checked
  if (!editingId) apptCfg.visitTypes.push(row)
  apptCfgEditing.visitTypes = null
  apptCfgSave(); renderApptConfigs()
  showToast(editingId ? 'Visit type updated ✓' : 'Visit type added ✓', 'ok')
}

/* ---- Tab 2: Eligibility Tests ---- */
function apptCfgEligibilityHTML() {
  const e = apptCfgEditing.eligibility ? apptCfg.eligibility.find(x => x.id === apptCfgEditing.eligibility) : null
  const d = e || { visitType: '', test: '', active: true }
  const vtOpts = '<option value="">— Select —</option>' + apptCfg.visitTypes.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(v => apptCfgOpt(v.name, d.visitType, apptVisitLabel(v.name))).join('')
  const rows = apptCfg.eligibility.map(x => '<tr class="' + (x.active === false ? 'acfg-off' : '') + '">'
    + '<td>' + apptEsc(apptVisitLabel(x.visitType)) + '</td><td>' + apptEsc(x.test) + '</td>'
    + '<td>' + (x.active !== false ? 'Active' : 'Inactive') + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEdit(\'eligibility\',\'' + x.id + '\')">Edit</button>'
    + '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDelete(\'eligibility\',\'' + x.id + '\')">Delete</button></td></tr>').join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.eligibility, e ? 'Edit Eligibility Test' : 'New Eligibility Test')
    + '<div class="g3">'
    + '<div class="fg"><label>Visit-type</label><select id="cfgElVisit">' + vtOpts + '</select></div>'
    + '<div class="fg"><label>Eligibility Test</label><select id="cfgElTest"><option value="">— Select —</option>' + APPT_CFG_ELIG_TESTS.map(t => apptCfgOpt(t, d.test)).join('') + '</select></div>'
    + '<div class="fg"><label>&nbsp;</label><div class="acfg-inline-check">' + apptCfgChk('cfgElActive', 'Active', d.active !== false) + '</div></div>'
    + '</div>'
    + '<div class="acfg-form-actions">'
    + (e ? '<button class="btn btn-ghost" data-onclick="apptCfgCancelEdit(\'eligibility\')">Cancel</button>' : '')
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveEligibility()">' + (e ? 'Save Changes' : 'Add') + '</button>'
    + '</div>'
    + '</div>'
    + (rows ? '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Visit Type</th><th>Eligibility Test</th><th>Active</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="pld-empty-state">No records to display.</div>')
    + '</div>'
}
function apptCfgSaveEligibility() {
  const visitType = document.getElementById('cfgElVisit').value
  const test = document.getElementById('cfgElTest').value
  if (!visitType || !test) { showToast('Select a visit-type and an eligibility test', 'err'); return }
  const editingId = apptCfgEditing.eligibility
  const row = editingId ? apptCfg.eligibility.find(x => x.id === editingId) : { id: apptCfgNewId() }
  if (!row) return
  row.visitType = visitType; row.test = test; row.active = document.getElementById('cfgElActive').checked
  if (!editingId) apptCfg.eligibility.push(row)
  apptCfgEditing.eligibility = null
  apptCfgSave(); renderApptConfigs(); showToast('Eligibility test saved ✓', 'ok')
}

/* Rooms are not a tab here at all any more - they are a page of their own,
   Appointment ▸ Rooms (apptrooms.js), because they decide whether a booking
   becomes a video visit. Nothing about them is edited from this screen. */

/* ---- Tab 4: Non Provider Schedulers ---- */
function apptCfgSchedulersHTML() {
  const e = apptCfgEditing.schedulers ? apptCfg.schedulers.find(x => x.id === apptCfgEditing.schedulers) : null
  const d = e || { name: '', facilities: [], billingProvider: '', allowMultiple: false, singleSlotMultiple: false, active: true }
  // A one-line dropdown, not stacked chips - Facility sits between two other
  // single-line fields (Scheduler, Billing Provider) in the same row, and
  // stacked chips threw that row's height out of alignment with its siblings.
  const facRows = APPT_FACILITIES.map(f =>
    '<label class="acfg-msel-row"><input type="checkbox" class="cfgSchFac" value="' + apptEsc(f) + '" data-onchange="apptCfgSyncFacLabel()"' + ((d.facilities || []).indexOf(f) !== -1 ? ' checked' : '') + '><span>' + apptEsc(f) + '</span></label>').join('')
  const facLabel = apptCfgFacLabel(d.facilities || [])
  const rows = apptCfg.schedulers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(x =>
    '<tr class="' + (x.active === false ? 'acfg-off' : '') + '"><td>' + apptEsc(x.name) + '</td>'
    + '<td>' + apptEsc((x.facilities || []).join(', ') || '—') + '</td>'
    + '<td>' + apptEsc(x.billingProvider || '—') + '</td>'
    + '<td>' + (x.allowMultiple ? 'Yes' : 'No') + '</td>'
    + '<td>' + (x.active !== false ? 'Active' : 'Inactive') + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEdit(\'schedulers\',\'' + x.id + '\')">Edit</button>'
    + '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDelete(\'schedulers\',\'' + x.id + '\')">Delete</button></td></tr>').join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.scheduler, e ? 'Edit Scheduler' : 'New Scheduler')
    + '<div class="g3">'
    + '<div class="fg"><label>Scheduler</label><input type="text" id="cfgSchName" value="' + apptEsc(d.name) + '"></div>'
    + '<div class="fg"><label>Facility</label><div class="acfg-msel" id="cfgSchFacSel">'
      + '<button type="button" class="acfg-msel-btn" data-onclick="apptCfgToggleFacSel(event)"><span id="cfgSchFacLabel">' + apptEsc(facLabel) + '</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="acfg-msel-panel" id="cfgSchFacPanel">' + facRows + '</div>'
      + '</div></div>'
    + '<div class="fg"><label>Default Billing Provider</label><select id="cfgSchProvider"><option value="">— Select —</option>' + APPT_CFG_BILLING_PROVIDERS.map(b => apptCfgOpt(b, d.billingProvider)).join('') + '</select></div>'
    + '</div>'
    + '<div class="acfg-checkrow">'
    + apptCfgChk('cfgSchMulti', 'Allow Multiple Appointments On Single TimeSlot', d.allowMultiple)
    + apptCfgChk('cfgSchMultiVt', 'Allow Multiple VisitTypeSlot Appointment Booking', d.singleSlotMultiple)
    + apptCfgChk('cfgSchActive', 'Active', d.active !== false)
    + '</div>'
    + '<div class="acfg-form-actions">'
    + (e ? '<button class="btn btn-ghost" data-onclick="apptCfgCancelEdit(\'schedulers\')">Cancel</button>' : '')
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveScheduler()">' + (e ? 'Save Changes' : 'Add Scheduler') + '</button>'
    + '</div>'
    + '</div>'
    + (rows ? '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Scheduler</th><th>Facility</th><th>Billing Provider</th><th>Multi-slot</th><th>Active</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="pld-empty-state">No schedulers yet — add the first one above.</div>')
    + '</div>'
}
function apptCfgSaveScheduler() {
  const name = (document.getElementById('cfgSchName').value || '').trim()
  if (!name) { showToast('Enter a scheduler name', 'err'); return }
  const editingId = apptCfgEditing.schedulers
  const row = editingId ? apptCfg.schedulers.find(x => x.id === editingId) : { id: apptCfgNewId() }
  if (!row) return
  row.name = name
  row.facilities = [...document.querySelectorAll('.cfgSchFac:checked')].map(c => c.value)
  row.billingProvider = document.getElementById('cfgSchProvider').value
  row.allowMultiple = document.getElementById('cfgSchMulti').checked
  row.singleSlotMultiple = document.getElementById('cfgSchMultiVt').checked
  row.active = document.getElementById('cfgSchActive').checked
  if (!editingId) apptCfg.schedulers.push(row)
  apptCfgEditing.schedulers = null
  apptCfgSave(); renderApptConfigs(); showToast('Scheduler saved ✓', 'ok')
}

let apptCfgLegendEditing = null // id of a custom (non-builtin) row being edited, or null = adding new
function apptCfgLegendHTML() {
  const editRow = apptCfgLegendEditing ? apptCfg.legendStatuses.find(s => s.id === apptCfgLegendEditing) : null
  const editBuiltin = !!(editRow && editRow.builtin)
  const rows = apptCfg.legendStatuses.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(s =>
    '<tr' + (apptCfgLegendEditing === s.id ? ' class="acfg-row-active"' : '') + '>'
    + '<td>' + apptEsc(s.name) + (s.builtin ? ' <span class="acfg-badge">Built-in — controls the live calendar</span>' : ' <span class="acfg-badge" data-cs="'+__cs+'color:var(--muted);background:var(--s3)">Custom — selectable on appointments</span>') + '</td>'
    + '<td><span class="acfg-legend-bar" data-cs="'+__cs+'background:' + apptEsc(s.color) + '"></span> ' + apptEsc(apptCfgColorName(s.color)) + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEditLegend(\'' + s.id + '\')">Edit</button>' + (s.builtin ? '' : '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDeleteLegend(\'' + s.id + '\')">Delete</button>') + '</td>'
    + '</tr>').join('')
  const badge = editBuiltin
    ? ' <span class="acfg-badge">Built-in — its name is locked, but its color updates the live calendar</span>'
    : ' <span class="acfg-badge">Custom statuses become selectable on real appointments too</span>'
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.legend, editRow ? 'Edit Status' : 'Add Custom Status', badge)
    + '<div class="g3">'
    + '<div class="fg"><label>Status</label><input type="text" id="cfgLgName" value="' + apptEsc(editRow?.name || '') + '" placeholder="e.g. Patient Arrived"' + (editBuiltin ? ' disabled title="Built-in status names can\'t be changed"' : '') + '></div>'
    + '<div class="fg"><label>Color</label><div class="acfg-color-row">'
      + '<input type="color" id="cfgLgColor" class="acfg-color-native" value="' + apptEsc(editRow?.color || '#7C3AED') + '" data-oninput="apptCfgSyncLegendHex(this.value)">'
      + '<input type="text" id="cfgLgColorHex" class="acfg-color-hex" value="' + apptEsc(editRow?.color || '#7C3AED') + '" placeholder="#RRGGBB" data-oninput="apptCfgSyncLegendPicker(this.value)">'
      + '</div></div>'
    + '<div class="fg"></div>'
    + '</div>'
    + '<div class="acfg-form-actions">'
    + (editRow ? '<button class="btn btn-ghost" data-onclick="apptCfgCancelLegendEdit()">Cancel</button>' : '')
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveLegend()">' + (editRow ? 'Save Changes' : 'Add Status') + '</button>'
    + '</div>'
    + '</div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Status</th><th>Color</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '</div>'
}
function apptCfgEditLegend(id) { apptCfgLegendEditing = id; renderApptConfigs() }
function apptCfgCancelLegendEdit() { apptCfgLegendEditing = null; renderApptConfigs() }
// Native <input type=color> and the hex text field mirror each other - either
// one can drive the value, so Save can trust whichever was edited last.
function apptCfgSyncLegendHex(v) { const h = document.getElementById('cfgLgColorHex'); if (h) h.value = v.toUpperCase() }
function apptCfgSyncLegendPicker(v) {
  const clean = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(clean)) { const p = document.getElementById('cfgLgColor'); if (p) p.value = clean }
}
function apptCfgSaveLegend() {
  const editRow = apptCfgLegendEditing ? apptCfg.legendStatuses.find(s => s.id === apptCfgLegendEditing) : null
  const hexField = document.getElementById('cfgLgColorHex').value.trim()
  const color = /^#[0-9a-f]{6}$/i.test(hexField) ? hexField.toUpperCase() : document.getElementById('cfgLgColor').value
  if (!/^#[0-9a-f]{6}$/i.test(color)) { showToast('Enter a valid color (e.g. #6C40D8)', 'err'); return }
  // Editing a built-in row only ever changes its color - its name drives the
  // live calendar's status-matching logic, so it can't be touched here.
  if (editRow && editRow.builtin) {
    editRow.color = color
    apptCfgLegendEditing = null
    apptCfgSave(); renderApptConfigs()
    showToast('Status color updated ✓', 'ok')
    return
  }
  const name = document.getElementById('cfgLgName').value.trim()
  if (!name) { showToast('Enter a status name', 'err'); return }
  if (Object.keys(APPT_STATUS_COLORS).some(n => n.toLowerCase() === name.toLowerCase())) { showToast('That name is one of the 5 built-in statuses — pick a different name', 'err'); return }
  const clash = apptCfg.legendStatuses.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== apptCfgLegendEditing)
  if (clash) { showToast('A status with that name already exists', 'err'); return }
  const row = apptCfgLegendEditing ? apptCfg.legendStatuses.find(s => s.id === apptCfgLegendEditing) : { id: apptCfgNewId(), builtin: false, order: apptCfg.legendStatuses.length }
  if (!row) return
  row.name = name; row.color = color
  if (!apptCfgLegendEditing) apptCfg.legendStatuses.push(row)
  const wasEditing = apptCfgLegendEditing
  apptCfgLegendEditing = null
  apptCfgSave(); renderApptConfigs()
  showToast(wasEditing ? 'Status updated ✓' : 'Status added ✓', 'ok')
}
async function apptCfgDeleteLegend(id) {
  const row = apptCfg.legendStatuses.find(s => s.id === id)
  if (!row) return
  if (row.builtin) { showToast('Built-in statuses cannot be deleted', 'err'); return }
  if (!(await ctgConfirm('Delete "' + row.name + '"?', { danger: true, okLabel: 'Delete' }))) return
  apptCfg.legendStatuses = apptCfg.legendStatuses.filter(s => s.id !== id)
  if (apptCfgLegendEditing === id) apptCfgLegendEditing = null
  apptCfgSave(); renderApptConfigs(); showToast('Deleted', 'ok')
}

let apptCfgBreakBlockEditing = null
function apptCfgBreakBlockHTML() {
  const editRow = apptCfgBreakBlockEditing ? apptCfg.breakBlockTexts.find(s => s.id === apptCfgBreakBlockEditing) : null
  const editBuiltin = !!(editRow && editRow.builtin)
  const rows = apptCfg.breakBlockTexts.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(s =>
    '<tr' + (apptCfgBreakBlockEditing === s.id ? ' class="acfg-row-active"' : '') + '>'
    + '<td><span class="acfg-legend-bar" data-cs="'+__cs+'background:' + apptEsc(s.color) + '"></span> ' + apptEsc(apptCfgColorName(s.color)) + '</td>'
    + '<td>' + apptEsc(s.name) + (s.builtin ? ' <span class="acfg-badge">Built-in — controls the live calendar</span>' : ' <span class="acfg-badge" data-cs="'+__cs+'color:var(--muted);background:var(--s3)">Custom — detected on real breaks/blocks</span>') + '</td>'
    + '<td>' + (s.active !== false ? '✓' : '—') + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEditBreakBlock(\'' + s.id + '\')">Edit</button>' + (s.builtin ? '' : '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDeleteBreakBlock(\'' + s.id + '\')">Delete</button>') + '</td>'
    + '</tr>').join('')
  const badge = editBuiltin
    ? ' <span class="acfg-badge">Built-in — its text is locked, but its color updates the live calendar</span>'
    : ' <span class="acfg-badge">Custom categories are detected by keyword match, same as the built-ins</span>'
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.legend, editRow ? 'Edit Break/Block Text' : 'Manage Break/Block Text', badge)
    + '<div class="g3">'
    + '<div class="fg"><label>Color</label><div class="acfg-color-row">'
      + '<input type="color" id="cfgBbColor" class="acfg-color-native" value="' + apptEsc(editRow?.color || '#2E8B57') + '" data-oninput="apptCfgSyncBbHex(this.value)">'
      + '<input type="text" id="cfgBbColorHex" class="acfg-color-hex" value="' + apptEsc(editRow?.color || '#2E8B57') + '" placeholder="#RRGGBB" data-oninput="apptCfgSyncBbPicker(this.value)">'
      + '</div></div>'
    + '<div class="fg"><label>Custom Text</label><input type="text" id="cfgBbText" value="' + apptEsc(editRow?.name || '') + '"' + (editBuiltin ? ' disabled title="Built-in category text can\'t be changed"' : '') + '></div>'
    + '<div class="fg"><label>&nbsp;</label><div class="acfg-inline-check">' + apptCfgChk('cfgBbActive', 'Active', editRow ? editRow.active !== false : true, editBuiltin) + '</div></div>'
    + '</div>'
    + '<div class="acfg-form-actions">'
    + (editRow ? '<button class="btn btn-ghost" data-onclick="apptCfgCancelBreakBlockEdit()">Cancel</button>' : '')
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveBreakBlock()">' + (editRow ? 'Save Changes' : 'Save') + '</button>'
    + '</div>'
    + '</div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>ColorName</th><th>CustomText</th><th>Active</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '</div>'
}
function apptCfgEditBreakBlock(id) { apptCfgBreakBlockEditing = id; renderApptConfigs() }
function apptCfgCancelBreakBlockEdit() { apptCfgBreakBlockEditing = null; renderApptConfigs() }
// Native <input type=color> and the hex text field mirror each other, same
// as Color Legend - either one can drive the value, Save trusts whichever
// was edited last.
function apptCfgSyncBbHex(v) { const h = document.getElementById('cfgBbColorHex'); if (h) h.value = v.toUpperCase() }
function apptCfgSyncBbPicker(v) {
  const clean = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(clean)) { const p = document.getElementById('cfgBbColor'); if (p) p.value = clean }
}
function apptCfgSaveBreakBlock() {
  const editRow = apptCfgBreakBlockEditing ? apptCfg.breakBlockTexts.find(s => s.id === apptCfgBreakBlockEditing) : null
  const hexField = document.getElementById('cfgBbColorHex').value.trim()
  const color = /^#[0-9a-f]{6}$/i.test(hexField) ? hexField.toUpperCase() : document.getElementById('cfgBbColor').value
  if (!/^#[0-9a-f]{6}$/i.test(color)) { showToast('Enter a valid color (e.g. #6C40D8)', 'err'); return }
  // Editing a built-in row only ever changes its color - its text drives the
  // live calendar's keyword-detection, so it can't be touched here.
  if (editRow && editRow.builtin) {
    editRow.color = color
    apptCfgBreakBlockEditing = null
    apptCfgSave(); renderApptConfigs()
    showToast('Category color updated ✓', 'ok')
    return
  }
  const text = document.getElementById('cfgBbText').value.trim()
  if (!text) { showToast('Enter custom text', 'err'); return }
  if (Object.keys(BREAK_CATEGORIES).some(n => n.toLowerCase() === text.toLowerCase())) { showToast('That text is one of the 7 built-in categories — pick different text', 'err'); return }
  const clash = apptCfg.breakBlockTexts.find(s => s.name.toLowerCase() === text.toLowerCase() && s.id !== apptCfgBreakBlockEditing)
  if (clash) { showToast('That text already exists', 'err'); return }
  const row = apptCfgBreakBlockEditing ? apptCfg.breakBlockTexts.find(s => s.id === apptCfgBreakBlockEditing) : { id: apptCfgNewId(), builtin: false, order: apptCfg.breakBlockTexts.length }
  if (!row) return
  row.name = text; row.color = color; row.active = document.getElementById('cfgBbActive').checked
  if (!apptCfgBreakBlockEditing) apptCfg.breakBlockTexts.push(row)
  const wasEditing = apptCfgBreakBlockEditing
  apptCfgBreakBlockEditing = null
  apptCfgSave(); renderApptConfigs(); showToast(wasEditing ? 'Break/Block text updated ✓' : 'Break/Block text saved ✓', 'ok')
}
async function apptCfgDeleteBreakBlock(id) {
  const row = apptCfg.breakBlockTexts.find(s => s.id === id)
  if (!row) return
  if (row.builtin) { showToast('Built-in categories cannot be deleted', 'err'); return }
  if (!(await ctgConfirm('Delete "' + row.name + '"?', { danger: true, okLabel: 'Delete' }))) return
  apptCfg.breakBlockTexts = apptCfg.breakBlockTexts.filter(s => s.id !== id)
  if (apptCfgBreakBlockEditing === id) apptCfgBreakBlockEditing = null
  apptCfgSave(); renderApptConfigs(); showToast('Deleted', 'ok')
}

/* Employee RS Name: renames how a roster member displays in the Resource
   Scheduler, without touching their real name anywhere else. No add or delete
   here, since people are added through the Working Hours Calendar field; this
   is purely a rename tool over that roster. */
function apptCfgEmployeeRsHTML() {
  const editingId = apptCfgEditing.employeeRs
  const e = editingId ? apptCfg.calendars.find(c => c.id === editingId) : null
  const rows = apptCfg.calendars.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(c =>
    '<tr' + (editingId === c.id ? ' class="acfg-row-active"' : '') + '>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm" data-onclick="apptCfgEdit(\'employeeRs\',\'' + c.id + '\')">Edit</button></td>'
    + '<td>' + apptEsc(c.name) + '</td>'
    + '<td>' + apptEsc(c.rsName || c.name) + '</td>'
    + '</tr>').join('')
  return '<div class="acfg-pad">'
    + (e ? (
      '<div class="acfg-form-panel">'
      + apptCfgSectionHead(ACFG_ICONS.scheduler, 'Edit Resource Scheduler Name')
      + '<div class="g3">'
      + '<div class="fg"><label>Employee</label><input type="text" value="' + apptEsc(e.name) + '" disabled></div>'
      + '<div class="fg"><label>Name For Resource Scheduler</label><input type="text" id="cfgRsName" value="' + apptEsc(e.rsName || e.name) + '"></div>'
      + '<div class="fg"></div>'
      + '</div>'
      + '<div class="acfg-form-actions">'
      + '<button class="btn btn-ghost" data-onclick="apptCfgCancelEdit(\'employeeRs\')">Cancel</button>'
      + '<button class="btn btn-primary" data-onclick="apptCfgSaveEmployeeRs()">Save Changes</button>'
      + '</div></div>'
    ) : '')
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th></th><th>Employee</th><th>Name For Resource Scheduler</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '</div>'
}
function apptCfgSaveEmployeeRs() {
  const editingId = apptCfgEditing.employeeRs
  const row = editingId && apptCfg.calendars.find(c => c.id === editingId)
  if (!row) return
  const val = (document.getElementById('cfgRsName').value || '').trim()
  row.rsName = val || row.name
  apptCfgEditing.employeeRs = null
  apptCfgSave(); renderApptConfigs(); showToast('Resource Scheduler name saved ✓', 'ok')
}

let apptCfgEmpOrderDraft = null
let apptCfgEmpDraggingId = null
function apptCfgEmployeeOrderHTML() {
  if (!apptCfgEmpOrderDraft) apptCfgEmpOrderDraft = apptCfg.calendars.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(c => c.id)
  const rows = apptCfgEmpOrderDraft.map((id, i) => {
    const c = apptCfg.calendars.find(x => x.id === id)
    if (!c) return ''
    return '<tr draggable="true" class="acfg-drag-row" data-ondragstart="apptCfgEmpDragStart(event,\'' + id + '\')" data-ondragover="apptCfgEmpDragOver(event)" data-ondrop="apptCfgEmpDrop(event,\'' + id + '\')">'
      + '<td class="acfg-drag-handle">⠿</td><td>' + (i + 1) + '</td><td>' + apptEsc(c.rsName || c.name) + '</td></tr>'
  }).join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-order-head"><strong>Manage Resource Order For Resource Scheduler</strong><button class="btn btn-primary btn-sm" data-onclick="apptCfgEmpOrderUpdate()">Update</button></div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th></th><th>Sequence</th><th>Employee Name</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '</div>'
}
function apptCfgEmpDragStart(e, id) { apptCfgEmpDraggingId = id; e.dataTransfer.effectAllowed = 'move' }
function apptCfgEmpDragOver(e) { e.preventDefault() }
function apptCfgEmpDrop(e, overId) {
  e.preventDefault()
  if (!apptCfgEmpDraggingId || apptCfgEmpDraggingId === overId || !apptCfgEmpOrderDraft) return
  const from = apptCfgEmpOrderDraft.indexOf(apptCfgEmpDraggingId)
  const to = apptCfgEmpOrderDraft.indexOf(overId)
  if (from === -1 || to === -1) return
  apptCfgEmpOrderDraft.splice(from, 1)
  apptCfgEmpOrderDraft.splice(to, 0, apptCfgEmpDraggingId)
  apptCfgEmpDraggingId = null
  renderApptConfigs()
}
function apptCfgEmpOrderUpdate() {
  if (!apptCfgEmpOrderDraft) return
  apptCfgEmpOrderDraft.forEach((id, i) => { const c = apptCfg.calendars.find(x => x.id === id); if (c) c.order = i })
  apptCfgSave()
  showToast('Resource order saved ✓', 'ok')
}

/* ---- Default Facility For RS ----
   Per-calendar default facility. Reset always lands back on APPT_FACILITIES[0]
   ('Concussion Therapy Group') - that's this portal's real primary facility,
   never an invented value. */
let apptCfgDefFacCalId = null
function apptCfgDefaultFacilityHTML() {
  const cals = apptCfg.calendars.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  if (!apptCfgDefFacCalId || !cals.some(c => c.id === apptCfgDefFacCalId)) apptCfgDefFacCalId = cals[0]?.id || null
  const cur = cals.find(c => c.id === apptCfgDefFacCalId)
  return '<div class="acfg-pad">'
    + '<div class="acfg-order-head"><strong>Manage Default For Resource Scheduler</strong>'
    + '<span><button class="btn btn-ghost btn-sm" data-onclick="apptCfgResetDefaultFacility()">Reset</button> <button class="btn btn-primary btn-sm" data-onclick="apptCfgSaveDefaultFacility()">Save/Update</button></span></div>'
    + '<div class="g3">'
    + '<div class="fg"><label>Calendar</label><select id="cfgDefFacCal" data-onchange="apptCfgSetDefFacCal(this.value)">' + cals.map(c => apptCfgOpt(c.id, apptCfgDefFacCalId, c.name)).join('') + '</select></div>'
    + '<div class="fg"><label>Facility</label><select id="cfgDefFacFacility">' + APPT_FACILITIES.map(f => apptCfgOpt(f, cur?.defaultFacility || APPT_FACILITIES[0])).join('') + '</select></div>'
    + '<div class="fg"></div>'
    + '</div></div>'
}
function apptCfgSaveDefaultFacility() {
  const cal = apptCfg.calendars.find(c => c.id === apptCfgDefFacCalId)
  if (!cal) return
  cal.defaultFacility = document.getElementById('cfgDefFacFacility').value
  apptCfgSave(); renderApptConfigs(); showToast('Default facility saved ✓', 'ok')
}
function apptCfgResetDefaultFacility() {
  const cal = apptCfg.calendars.find(c => c.id === apptCfgDefFacCalId)
  if (cal) cal.defaultFacility = APPT_FACILITIES[0]
  apptCfgSave(); renderApptConfigs(); showToast('Reset to ' + APPT_FACILITIES[0] + ' ✓', 'ok')
}

/* Classes and Services, policy settings. Neither concept exists anywhere else
   in this portal, so these two tabs are inert settings screens: they persist
   like everything else here, but nothing in the live calendar reads them yet.
   One shared builder, since the two forms are identical apart from labels. */
function apptCfgPolicySettingsHTML(kind, opts) {
  const cfg = apptCfg[kind]
  const units = u => ['days', 'weeks', 'months'].map(x => apptCfgOpt(x, u)).join('')
  const toggle = (id, on, label, desc) => '<label class="acfg-toggle-row"><span class="acfg-toggle-copy"><strong>' + label + '</strong><small>' + desc + '</small></span><span class="acfg-toggle-switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><i></i></span></label>'
  return '<div class="acfg-pad">'
    + '<div class="acfg-settings-head"><span class="acfg-section-ico">' + ACFG_ICONS.hours + '</span>'
      + '<span class="acfg-settings-headcopy"><strong>' + opts.title + '</strong><span>' + opts.subtitle + '</span></span></div>'
    + '<div class="acfg-toggle-list">'
    + toggle('cfgPolEnable', !!cfg.enable, opts.enableLabel, opts.enableDesc)
    + toggle('cfgPolWeekView', !!cfg.defaultWeekView, opts.weekViewLabel, 'Show the week view first when patients open ' + opts.itemWord)
    + toggle('cfgPolNotify', !!cfg.notifyInstructor, 'Notify instructor on member additions or cancellations', 'Email the instructor whenever someone joins or drops')
    + toggle('cfgPolPayment', !!cfg.requirePayment, 'Require payment to book online', 'Members must pay before an online booking is confirmed')
    + '</div>'
    + '<div class="acfg-policy-list">'
    + '<div class="acfg-policy-card"><div class="acfg-policy-ico">📅</div><div class="acfg-policy-copy"><strong>Registration window</strong><div class="acfg-policy-row">Members can register online for ' + opts.itemWord + ' up to '
      + '<input type="number" min="0" id="cfgPolRegAdv" value="' + (cfg.registerAdvance ?? 90) + '"> '
      + '<select id="cfgPolRegUnit">' + units(cfg.registerUnit || 'days') + '</select> in advance.</div></div></div>'
    + '<div class="acfg-policy-card"><div class="acfg-policy-ico">✕</div><div class="acfg-policy-copy"><strong>Cancellation window</strong><div class="acfg-policy-row">Members can cancel their ' + opts.enrollWord + ' enrollment online up to '
      + '<input type="number" min="0" id="cfgPolCancelAdv" value="' + (cfg.cancelAdvance ?? 12) + '"> '
      + '<select id="cfgPolCancelUnit">' + units(cfg.cancelUnit || 'days') + '</select> before ' + opts.beforeWord + '.</div></div></div>'
    + '<div class="acfg-policy-card"><div class="acfg-policy-ico">⏱</div><div class="acfg-policy-copy"><strong>Minimum lead time</strong><div class="acfg-policy-row">Members registering online must enroll at least '
      + '<input type="number" min="0" id="cfgPolLeadAdv" value="' + (cfg.leadAdvance ?? 2) + '"> '
      + '<select id="cfgPolLeadUnit">' + units(cfg.leadUnit || 'days') + '</select> before ' + opts.beforeWord + '.</div></div></div>'
    + '</div>'
    + '<div class="acfg-form-actions" data-cs="'+__cs+'margin-top:20px"><button class="btn btn-primary" data-onclick="apptCfgSavePolicy(\'' + kind + '\')">Save/Update</button></div>'
    + '</div>'
}
function apptCfgSavePolicy(kind) {
  const cfg = apptCfg[kind]
  cfg.enable = document.getElementById('cfgPolEnable').checked
  cfg.defaultWeekView = document.getElementById('cfgPolWeekView').checked
  cfg.notifyInstructor = document.getElementById('cfgPolNotify').checked
  cfg.requirePayment = document.getElementById('cfgPolPayment').checked
  cfg.registerAdvance = parseInt(document.getElementById('cfgPolRegAdv').value, 10) || 0
  cfg.registerUnit = document.getElementById('cfgPolRegUnit').value
  cfg.cancelAdvance = parseInt(document.getElementById('cfgPolCancelAdv').value, 10) || 0
  cfg.cancelUnit = document.getElementById('cfgPolCancelUnit').value
  cfg.leadAdvance = parseInt(document.getElementById('cfgPolLeadAdv').value, 10) || 0
  cfg.leadUnit = document.getElementById('cfgPolLeadUnit').value
  apptCfgSave(); renderApptConfigs(); showToast('Settings saved ✓', 'ok')
}
function apptCfgClassesHTML() {
  return apptCfgPolicySettingsHTML('classesConfig', {
    title: 'Class Configuration', subtitle: 'Control how patients discover, book, and manage classes from the patient portal.',
    itemWord: 'Classes', enableLabel: 'Enable classes', enableDesc: 'Turn class scheduling on for this portal',
    weekViewLabel: 'Default classes to week view on portal', enrollWord: 'class', beforeWord: 'the class begins'
  })
}
function apptCfgServicesHTML() {
  return apptCfgPolicySettingsHTML('servicesConfig', {
    title: 'Service Configuration', subtitle: 'Control how patients discover, book, and manage service appointments from the patient portal.',
    itemWord: 'Service Schedules', enableLabel: 'Enable service schedules', enableDesc: 'Turn service scheduling on for this portal',
    weekViewLabel: 'Default services to week view on portal', enrollWord: 'Service', beforeWord: 'the appointment'
  })
}

let apptCfgVtState = {
  enc: { primaryFilter: '', visitFilter: '', primarySel: new Set(), visitSel: new Set(), duration: 0 },
  orderSet: { filter: '', sel: new Set(), choice: '' },
  planSet: { filter: '', sel: new Set(), choice: '' }
}
function apptCfgVtToggle(bucket, name, checked) {
  const set = bucket === 'encPrimary' ? apptCfgVtState.enc.primarySel
    : bucket === 'encVisit' ? apptCfgVtState.enc.visitSel
    : bucket === 'orderSet' ? apptCfgVtState.orderSet.sel
    : apptCfgVtState.planSet.sel
  if (checked) set.add(name); else set.delete(name)
}
function apptCfgVtFilter(bucket, value) {
  if (bucket === 'encPrimary') apptCfgVtState.enc.primaryFilter = value
  else if (bucket === 'encVisit') apptCfgVtState.enc.visitFilter = value
  else if (bucket === 'orderSet') apptCfgVtState.orderSet.filter = value
  else apptCfgVtState.planSet.filter = value
  renderApptConfigs()
}
function apptCfgVisitCheckList(bucket, filterValue, checkedSet) {
  const names = apptCfg.visitTypes.slice().sort((a, b) => a.name.localeCompare(b.name)).map(v => v.name)
  const q = filterValue.trim().toLowerCase()
  const list = names.filter(n => !q || n.toLowerCase().includes(q))
  if (!list.length) return '<div class="acfg-details-empty">No matches.</div>'
  return list.map(n => '<label class="acfg-vtchk-row"><input type="checkbox"' + (checkedSet.has(n) ? ' checked' : '') + ' data-onchange="apptCfgVtToggle(\'' + bucket + '\',\'' + apptEsc(n).replace(/'/g, "\\'") + '\',this.checked)"><span>' + apptEsc(n) + '</span></label>').join('')
}
function apptCfgEncounterCountHTML() {
  const state = apptCfgVtState.enc
  const rows = apptCfg.encounterVisitCounts.map(r =>
    '<tr><td>' + apptEsc(r.primaryTypes.map(apptVisitLabel).join(', ') || '—') + '</td><td>' + apptEsc(r.visitTypes.map(apptVisitLabel).join(', ') || '—') + '</td><td>' + r.visitTypes.length + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDeleteEncounterCount(\'' + r.id + '\')">Delete</button></td></tr>').join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-dual-panel">'
    + '<div class="acfg-vtbox"><div class="acfg-vtbox-hd">Primary Visit Type</div><input type="text" placeholder="Visit-Type" class="acfg-vtbox-filter" data-oninput="apptCfgVtFilter(\'encPrimary\',this.value)" value="' + apptEsc(state.primaryFilter) + '"><div class="acfg-vtbox-list">' + apptCfgVisitCheckList('encPrimary', state.primaryFilter, state.primarySel) + '</div></div>'
    + '<div class="acfg-vtbox"><div class="acfg-vtbox-hd">Visit Type</div><input type="text" placeholder="Visit-Type" class="acfg-vtbox-filter" data-oninput="apptCfgVtFilter(\'encVisit\',this.value)" value="' + apptEsc(state.visitFilter) + '"><div class="acfg-vtbox-list">' + apptCfgVisitCheckList('encVisit', state.visitFilter, state.visitSel) + '</div></div>'
    + '<div class="acfg-vtbox-side"><div class="fg"><label>Duration</label><input type="number" min="0" id="cfgEncDuration" value="' + state.duration + '" data-oninput="apptCfgVtSetDuration(this.value)"></div>'
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveEncounterCount()">Save</button></div>'
    + '</div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>PrimaryVisitType</th><th>Visit Types</th><th>Encounter Count</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + (rows ? '' : '<div class="pld-empty-state">No records to display.</div>') + '</div>'
    + '</div>'
}
function apptCfgSaveEncounterCount() {
  const state = apptCfgVtState.enc
  const primary = Array.from(state.primarySel), visit = Array.from(state.visitSel)
  if (!primary.length) { showToast('Select at least one Primary Visit Type', 'err'); return }
  if (!visit.length) { showToast('Select at least one Visit Type', 'err'); return }
  apptCfg.encounterVisitCounts.push({ id: apptCfgNewId(), primaryTypes: primary, visitTypes: visit, duration: state.duration })
  state.primarySel = new Set(); state.visitSel = new Set(); state.duration = 0
  apptCfgSave(); renderApptConfigs(); showToast('Encounter count saved ✓', 'ok')
}
function apptCfgDeleteEncounterCount(id) {
  apptCfg.encounterVisitCounts = apptCfg.encounterVisitCounts.filter(r => r.id !== id)
  apptCfgSave(); renderApptConfigs(); showToast('Deleted', 'ok')
}
function apptCfgAddOption(bucket) {
  const input = document.getElementById('cfgVtNew_' + bucket)
  const val = (input?.value || '').trim()
  if (!val) return
  const list = bucket === 'orderSet' ? apptCfg.orderSets : apptCfg.planSets
  if (!list.some(o => o.toLowerCase() === val.toLowerCase())) list.push(val)
  const state = bucket === 'orderSet' ? apptCfgVtState.orderSet : apptCfgVtState.planSet
  state.choice = val
  apptCfgSave(); renderApptConfigs()
}
function apptCfgChoiceChange(bucket, val) {
  const state = bucket === 'orderSet' ? apptCfgVtState.orderSet : apptCfgVtState.planSet
  state.choice = val
}
function apptCfgSaveVisitAssign(bucket) {
  const state = bucket === 'orderSet' ? apptCfgVtState.orderSet : apptCfgVtState.planSet
  const targetArr = bucket === 'orderSet' ? apptCfg.visitTypeOrderSets : apptCfg.visitTypePlanSets
  const selected = Array.from(state.sel)
  if (!selected.length) { showToast('Select at least one Visit-Type', 'err'); return }
  if (!state.choice) { showToast('Choose (or add) a ' + (bucket === 'orderSet' ? 'Order Set' : 'Plan Set'), 'err'); return }
  selected.forEach(vt => {
    let row = targetArr.find(r => r.visitType === vt)
    if (!row) { row = { id: apptCfgNewId(), visitType: vt }; targetArr.push(row) }
    row.value = state.choice
  })
  state.sel = new Set()
  apptCfgSave(); renderApptConfigs(); showToast('Saved ✓', 'ok')
}
function apptCfgDeleteVisitAssign(bucket, id) {
  if (bucket === 'orderSet') apptCfg.visitTypeOrderSets = apptCfg.visitTypeOrderSets.filter(r => r.id !== id)
  else apptCfg.visitTypePlanSets = apptCfg.visitTypePlanSets.filter(r => r.id !== id)
  apptCfgSave(); renderApptConfigs(); showToast('Deleted', 'ok')
}
function apptCfgVisitAssignHTML(bucket, label) {
  const state = bucket === 'orderSet' ? apptCfgVtState.orderSet : apptCfgVtState.planSet
  const options = bucket === 'orderSet' ? apptCfg.orderSets : apptCfg.planSets
  const rows = (bucket === 'orderSet' ? apptCfg.visitTypeOrderSets : apptCfg.visitTypePlanSets).map(r =>
    '<tr><td>' + apptEsc(apptVisitLabel(r.visitType)) + '</td><td>' + apptEsc(r.value) + '</td>'
    + '<td class="acfg-actions"><button class="btn btn-ghost btn-sm acfg-del" data-onclick="apptCfgDeleteVisitAssign(\'' + bucket + '\',\'' + r.id + '\')">Delete</button></td></tr>').join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-dual-panel">'
    + '<div class="acfg-vtbox"><div class="acfg-vtbox-hd">Visit Type</div><input type="text" placeholder="Visit-Type" class="acfg-vtbox-filter" data-oninput="apptCfgVtFilter(\'' + bucket + '\',this.value)" value="' + apptEsc(state.filter) + '"><div class="acfg-vtbox-list">' + apptCfgVisitCheckList(bucket, state.filter, state.sel) + '</div></div>'
    + '<div class="acfg-vtbox-side">'
    + '<div class="fg"><label>' + label + '</label><select data-onchange="apptCfgChoiceChange(\'' + bucket + '\',this.value)"><option value=""' + (state.choice ? '' : ' selected') + '>Select</option>' + options.map(o => '<option value="' + apptEsc(o) + '"' + (o === state.choice ? ' selected' : '') + '>' + apptEsc(o) + '</option>').join('') + '</select></div>'
    + '<div class="fg"><label>&nbsp;</label><div class="acfg-inline-add"><input type="text" id="cfgVtNew_' + bucket + '" placeholder="Add new ' + label + '"><button type="button" class="btn btn-ghost btn-sm" data-onclick="apptCfgAddOption(\'' + bucket + '\')">+ Add</button></div></div>'
    + '<button class="btn btn-primary" data-onclick="apptCfgSaveVisitAssign(\'' + bucket + '\')">Save</button>'
    + '</div>'
    + '</div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>VisitType</th><th>' + label + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + (rows ? '' : '<div class="pld-empty-state">No records to display.</div>') + '</div>'
    + '</div>'
}
function apptCfgOrderSetHTML() { return apptCfgVisitAssignHTML('orderSet', 'Order Set') }
function apptCfgPlanSetHTML() { return apptCfgVisitAssignHTML('planSet', 'Plan Set') }

function apptCfgCalendarOpts(cur) {
  return '<option value="">Choose a Calendar</option>' + apptCfg.calendars.map(c => apptCfgOpt(c.id, cur, c.name)).join('')
}
function apptCfgDefaultDayHours() {
  const days = {}
  APPT_CFG_DAYS.forEach(d => { days[d] = { from: '8:00 AM', to: '6:00 PM', exclude: false } })
  return days
}
// A person can be added on the spot from the Calendar field itself - this app
// has no separate staff-roster page to pull names from, so typing one in here
// is the only way to grow the list.
function apptCfgQuickAddCalendar() {
  const input = document.getElementById('cfgWhNewCalName')
  const name = (input?.value || '').trim()
  if (!name) { showToast('Type a name for the new calendar', 'err'); return }
  if (apptCfg.calendars.some(c => c.name.toLowerCase() === name.toLowerCase())) { showToast('That calendar already exists', 'err'); return }
  const row = { id: apptCfgNewId(), name }
  apptCfg.calendars.push(row)
  apptCfgWhCalendarId = row.id
  apptCfgSave(); renderApptConfigs(); showToast('Calendar added ✓', 'ok')
}

/* ---- Sub-tab: Calendar Timings ---- */
function apptCfgCalTimingsHTML() {
  const calId = apptCfgWhCalendarId
  const facility = apptCfgWhFacility || ''
  const timings = apptCfg.calTimings.filter(t => t.calendarId === calId && t.facility === facility)
    .sort((a, b) => String(b.dateFrom || '').localeCompare(a.dateFrom || ''))
  let active = apptCfgActiveTimingId ? timings.find(t => t.id === apptCfgActiveTimingId) : null
  if (!active && timings.length) active = timings[0]
  const days = active ? active.days : apptCfgDefaultDayHours()

  const listRows = timings.length ? timings.map(t =>
    '<div class="acfg-wh-list-row' + (active && t.id === active.id ? ' is-active' : '') + '">'
    + '<span>' + apptEsc(t.dateFrom || '—') + '</span><span>' + apptEsc(t.noEndDate ? 'No End Date' : (t.dateTo || '—')) + '</span>'
    + '<span class="acfg-wh-list-actions"><a href="#" data-onclick="apptCfgEditTiming(\'' + t.id + '\');return false">Edit</a><a href="#" class="acfg-del" data-onclick="apptCfgDeleteTiming(\'' + t.id + '\');return false">Delete</a></span>'
    + '</div>').join('')
    : '<div class="pld-empty-state">No schedules yet for this calendar &amp; facility.</div>'

  const dayRows = APPT_CFG_DAYS.map(d => {
    const dv = days[d] || { from: '', to: '', exclude: false }
    return '<tr><td class="acfg-wh-day">' + d + '</td>'
      + '<td><div class="date-field"><input type="text" id="cfgWhFrom_' + d + '" value="' + apptEsc(dv.from) + '" placeholder="8:00 AM"><button type="button" class="cal-btn" data-onclick="toggleTimePicker(\'cfgWhFrom_' + d + '\')" aria-label="Open time picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></button></div></td>'
      + '<td><div class="date-field"><input type="text" id="cfgWhTo_' + d + '" value="' + apptEsc(dv.to) + '" placeholder="6:00 PM"><button type="button" class="cal-btn" data-onclick="toggleTimePicker(\'cfgWhTo_' + d + '\')" aria-label="Open time picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></button></div></td>'
      + '<td class="acfg-wh-excl"><input type="checkbox" id="cfgWhExcl_' + d + '"' + (dv.exclude ? ' checked' : '') + '></td>'
      + '</tr>'
  }).join('')

  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.hours, 'Calendar Timings')
    + '<div class="acfg-wh-layout">'
      + '<div class="acfg-wh-form">'
        + '<div class="fg"><label>Facility</label><select id="cfgWhFacility" data-onchange="apptCfgSetWhFacility(this.value)">' + apptCfgOpt('', facility, '— Select —') + APPT_FACILITIES.map(f => apptCfgOpt(f, facility)).join('') + '</select></div>'
        + '<div class="fg"><label>Calendar</label><select id="cfgWhCalendar" data-onchange="apptCfgSetWhCalendar(this.value)">' + apptCfgCalendarOpts(calId) + '</select>'
        + '<div class="acfg-quickadd"><input type="text" id="cfgWhNewCalName" placeholder="Add a person or resource…"><button type="button" class="btn btn-ghost btn-sm" data-onclick="apptCfgQuickAddCalendar()">+ Add</button></div></div>'
        + '<div class="fg"><label>From</label><div class="date-field"><input type="text" id="cfgWhDateFrom" value="' + apptEsc(active?.dateFrom || '') + '" placeholder="MM/DD/YYYY"><button type="button" class="cal-btn" data-onclick="toggleDatePicker(\'cfgWhDateFrom\')" aria-label="Open date picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div></div>'
        + '<div class="fg"><label>To</label><div class="date-field"><input type="text" id="cfgWhDateTo" value="' + apptEsc(active?.dateTo || '') + '" placeholder="MM/DD/YYYY"' + (active?.noEndDate ? ' disabled' : '') + '><button type="button" class="cal-btn" data-onclick="toggleDatePicker(\'cfgWhDateTo\')" aria-label="Open date picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div>'
        + '<label class="acfg-chk"><input type="checkbox" id="cfgWhNoEnd" data-onchange="apptCfgToggleNoEnd(this.checked)"' + (active ? (active.noEndDate ? ' checked' : '') : ' checked') + '><span>No End Date</span></label></div>'
        + '<div class="acfg-form-actions" data-cs="'+__cs+'justify-content:flex-start">'
        + '<button class="btn btn-ghost" data-onclick="apptCfgNewTiming()">New</button>'
        + '<button class="btn btn-primary" data-onclick="apptCfgUpdateTiming()">Update</button>'
        + '</div>'
      + '</div>'
      + '<div class="acfg-wh-list-wrap"><div class="acfg-wh-list-hd"><span>DateFrom</span><span>DateTo</span><span></span></div>' + listRows + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="acfg-form-panel">'
    + '<div class="acfg-section-head" data-cs="'+__cs+'margin-bottom:12px"><span class="acfg-section-title" data-cs="'+__cs+'font-size:13px">' + (active ? 'Weekly Hours' : 'Weekly Hours (default — click New above to save this schedule)') + '</span></div>'
    + '<div class="acfg-table-wrap"><table class="acfg-table acfg-wh-daytable"><thead><tr><th>Day</th><th>From Time</th><th>To Time</th><th>Exclude</th></tr></thead><tbody>' + dayRows + '</tbody></table></div>'
    + '</div>'
    + '</div>'
}
function apptCfgSetWhFacility(v) { apptCfgWhFacility = v; apptCfgActiveTimingId = null; renderApptConfigs() }
function apptCfgSetWhCalendar(v) { apptCfgWhCalendarId = v; apptCfgActiveTimingId = null; renderApptConfigs() }
function apptCfgEditTiming(id) { apptCfgActiveTimingId = id; renderApptConfigs() }
function apptCfgToggleNoEnd(checked) {
  const to = document.getElementById('cfgWhDateTo')
  if (to) { to.disabled = checked; if (checked) to.value = '' }
}
function apptCfgReadDayHours() {
  const days = {}
  APPT_CFG_DAYS.forEach(d => {
    days[d] = {
      from: document.getElementById('cfgWhFrom_' + d)?.value || '',
      to: document.getElementById('cfgWhTo_' + d)?.value || '',
      exclude: !!document.getElementById('cfgWhExcl_' + d)?.checked
    }
  })
  return days
}
function apptCfgNewTiming() {
  if (!apptCfgWhCalendarId) { showToast('Choose a Calendar first', 'err'); return }
  if (!apptCfgWhFacility) { showToast('Choose a Facility first', 'err'); return }
  const dateFrom = document.getElementById('cfgWhDateFrom').value.trim()
  if (!dateFrom) { showToast('Enter a From date', 'err'); return }
  const row = {
    id: apptCfgNewId(), calendarId: apptCfgWhCalendarId, facility: apptCfgWhFacility,
    dateFrom, dateTo: document.getElementById('cfgWhDateTo').value.trim(),
    noEndDate: document.getElementById('cfgWhNoEnd').checked,
    days: apptCfgDefaultDayHours()
  }
  apptCfg.calTimings.push(row)
  apptCfgActiveTimingId = row.id
  apptCfgSave(); renderApptConfigs(); showToast('Schedule created — set its weekly hours below, then Update ✓', 'ok')
}
function apptCfgUpdateTiming() {
  const row = apptCfg.calTimings.find(t => t.id === apptCfgActiveTimingId)
  if (!row) { showToast('Click New to start a schedule for this calendar first', 'err'); return }
  row.dateFrom = document.getElementById('cfgWhDateFrom').value.trim()
  row.dateTo = document.getElementById('cfgWhDateTo').value.trim()
  row.noEndDate = document.getElementById('cfgWhNoEnd').checked
  row.days = apptCfgReadDayHours()
  apptCfgSave(); renderApptConfigs(); showToast('Schedule updated ✓', 'ok')
}
async function apptCfgDeleteTiming(id) {
  const row = apptCfg.calTimings.find(t => t.id === id)
  if (!row) return
  if (!(await ctgConfirm('Delete this schedule (' + (row.dateFrom || 'undated') + ')?', { danger: true, okLabel: 'Delete' }))) return
  apptCfg.calTimings = apptCfg.calTimings.filter(t => t.id !== id)
  if (apptCfgActiveTimingId === id) apptCfgActiveTimingId = null
  apptCfgSave(); renderApptConfigs(); showToast('Schedule deleted', 'ok')
}

/* ---- Duration store shared by "Visit Type Duration" and "Visit Group Durations" ---- */
function apptCfgGetDuration(calendarId, visitType) {
  return apptCfg.visitDurations.find(d => d.calendarId === calendarId && d.visitType === visitType) || null
}
function apptCfgSetDuration(calendarId, visitType, minutes, status) {
  let row = apptCfgGetDuration(calendarId, visitType)
  if (!row) { row = { id: apptCfgNewId(), calendarId, visitType, minutes, status: status || 'Active' }; apptCfg.visitDurations.push(row) }
  else { row.minutes = minutes; if (status) row.status = status }
}

/* ---- Sub-tab: Visit Type Duration ---- */
function apptCfgVisitDurationHTML() {
  const calId = apptCfgWhCalendarId
  const activeTypes = apptCfg.visitTypes.filter(v => v.active !== false).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
  const rows = !calId ? '' : activeTypes.map(v => {
    const d = apptCfgGetDuration(calId, v.name)
    return '<tr><td>' + apptEsc(apptVisitLabel(v.name)) + '</td>'
      + '<td><input type="number" min="0" class="acfg-dur-input" value="' + (d ? d.minutes : '') + '" placeholder="—" data-onchange="apptCfgSaveDurationCell(\'' + apptEsc(v.name) + '\',this.value,null)"></td>'
      + '<td><select class="acfg-dur-status" data-onchange="apptCfgSaveDurationCell(\'' + apptEsc(v.name) + '\',null,this.value)">' + apptCfgOpt('Active', (d ? d.status : 'Active')) + apptCfgOpt('Inactive', (d ? d.status : 'Active')) + '</select></td>'
      + '</tr>'
  }).join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.hours, 'Visit Type Duration')
    + '<div class="g3">'
    + '<div class="fg"><label>Calendar</label><select id="cfgVdCalendar" data-onchange="apptCfgSetWhCalendar(this.value)">' + apptCfgCalendarOpts(calId) + '</select></div>'
    + '<div class="fg"><label>Set Default Time</label><select id="cfgVdDefaultMinutes" data-onchange="apptCfgApplyDefaultMinutes(this.value)"' + (calId ? '' : ' disabled') + '><option value="">— Select —</option>' + APPT_CFG_MINUTES.map(m => '<option value="' + m + '">' + m + '</option>').join('') + '</select></div>'
    + '<div class="fg"><label>&nbsp;</label><div class="acfg-inline-check" data-cs="'+__cs+'color:var(--muted);font-size:12.5px">Minutes — applied to every Active row below</div></div>'
    + '</div>'
    + '</div>'
    + (calId
      ? '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Visit Type</th><th>Time Duration (min)</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="pld-empty-state">No records to display. Choose a Calendar above.</div>')
    + '</div>'
}
function apptCfgApplyDefaultMinutes(v) {
  const minutes = parseInt(v, 10)
  if (!apptCfgWhCalendarId || !minutes) return
  apptCfg.visitTypes.filter(vt => vt.active !== false).forEach(vt => {
    const existing = apptCfgGetDuration(apptCfgWhCalendarId, vt.name)
    if (existing && existing.status === 'Inactive') return // don't override a row turned off
    apptCfgSetDuration(apptCfgWhCalendarId, vt.name, minutes, 'Active')
  })
  apptCfgSave(); renderApptConfigs(); showToast('Default time applied ✓', 'ok')
}
function apptCfgSaveDurationCell(visitType, minutes, status) {
  if (!apptCfgWhCalendarId) return
  const existing = apptCfgGetDuration(apptCfgWhCalendarId, visitType)
  const mins = minutes !== null ? (parseInt(minutes, 10) || 0) : (existing ? existing.minutes : 0)
  const st = status || (existing ? existing.status : 'Active')
  apptCfgSetDuration(apptCfgWhCalendarId, visitType, mins, st)
  apptCfgSave()
}

/* ---- Sub-tab: Visit Group Durations (bulk: many calendars × many visit types) ---- */
function apptCfgVisitGroupHTML() {
  const calRows = apptCfg.calendars.map(c => '<label class="acfg-msel-row"><input type="checkbox" class="cfgVgCal" value="' + apptEsc(c.id) + '"><span>' + apptEsc(c.name) + '</span></label>').join('')
  const vtRows = apptCfg.visitTypes.filter(v => v.active !== false).map(v => '<label class="acfg-msel-row"><input type="checkbox" class="cfgVgVt" value="' + apptEsc(v.name) + '"><span>' + apptEsc(apptVisitLabel(v.name)) + '</span></label>').join('')
  const slotRows = APPT_CFG_MINUTES.map(m => '<label class="acfg-vg-slot-row"><input type="radio" name="cfgVgSlot" value="' + m + '"><span>' + m + '</span></label>').join('')
  return '<div class="acfg-pad">'
    + '<div class="acfg-form-panel">'
    + apptCfgSectionHead(ACFG_ICONS.hours, 'Visit Group Durations')
    + '<div class="acfg-vg-cols">'
    + '<div class="acfg-vg-col"><div class="acfg-vg-col-hd">Calendar</div><input type="text" class="acfg-vg-search" placeholder="Search…" data-oninput="apptCfgFilterRows(this,\'.acfg-vg-col:nth-child(1) .acfg-msel-row\')"><div class="acfg-vg-list">' + (calRows || '<div class="pld-empty-state">No calendars yet.</div>') + '</div></div>'
    + '<div class="acfg-vg-col"><div class="acfg-vg-col-hd">Visit-type</div><input type="text" class="acfg-vg-search" placeholder="Search…" data-oninput="apptCfgFilterRows(this,\'.acfg-vg-col:nth-child(2) .acfg-msel-row\')"><div class="acfg-vg-list">' + vtRows + '</div></div>'
    + '<div class="acfg-vg-col"><div class="acfg-vg-col-hd">Set Time-Slot (Minutes)</div><div class="acfg-vg-list acfg-vg-slots">' + slotRows + '</div></div>'
    + '</div>'
    + '<div class="acfg-form-actions"><button class="btn btn-primary" data-onclick="apptCfgSaveVisitGroup()">Save / Update</button></div>'
    + '</div>'
    + '</div>'
}
function apptCfgFilterRows(input, selector) {
  const q = input.value.trim().toLowerCase()
  document.querySelectorAll(selector).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none'
  })
}
function apptCfgSaveVisitGroup() {
  const cals = [...document.querySelectorAll('.cfgVgCal:checked')].map(c => c.value)
  const vts = [...document.querySelectorAll('.cfgVgVt:checked')].map(c => c.value)
  const slot = document.querySelector('input[name="cfgVgSlot"]:checked')?.value
  if (!cals.length) { showToast('Select at least one Calendar', 'err'); return }
  if (!vts.length) { showToast('Select at least one Visit-type', 'err'); return }
  if (!slot) { showToast('Choose a Time-Slot', 'err'); return }
  const minutes = parseInt(slot, 10)
  let n = 0
  cals.forEach(calId => vts.forEach(vt => { apptCfgSetDuration(calId, vt, minutes, 'Active'); n++ }))
  apptCfgSave(); renderApptConfigs()
  showToast(n + ' duration' + (n === 1 ? '' : 's') + ' saved ✓', 'ok')
}

/* ---- Shared edit/delete ---- */
function apptCfgEdit(kind, id) { apptCfgEditing[kind] = id; renderApptConfigs() }
function apptCfgCancelEdit(kind) { apptCfgEditing[kind] = null; renderApptConfigs() }
async function apptCfgDelete(kind, id) {
  const list = apptCfg[kind]
  const row = list.find(x => x.id === id)
  if (!row) return
  if (row.builtin) { showToast('Built-in visit types cannot be deleted', 'err'); return }
  const label = row.name || apptVisitLabel(row.visitType || '') || 'entry'
  if (!(await ctgConfirm('Delete "' + label + '"?', { danger: true, okLabel: 'Delete' }))) return
  apptCfg[kind] = list.filter(x => x.id !== id)
  if (apptCfgEditing[kind] === id) apptCfgEditing[kind] = null
  apptCfgSave(); renderApptConfigs(); showToast('Deleted', 'ok')
}

/* Populate the booking dropdown once the DOM is ready. */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apptCfgPopulateVisitSelect)
else apptCfgPopulateVisitSelect()

;/* Named handlers for what were assignments inside onchange/oninput attributes. */
function apptCfgSetDefFacCal(v) { apptCfgDefFacCalId = v; renderApptConfigs() }
function apptCfgVtSetDuration(v) { apptCfgVtState.enc.duration = parseInt(v, 10) || 0 }
