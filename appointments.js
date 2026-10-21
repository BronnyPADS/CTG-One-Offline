
const APPT_STORE_KEY = 'ctg_appointments'
const APPT_BIZ_START_HOUR = 8   // 8:00 AM
const APPT_BIZ_END_HOUR = 19    // 7:00 PM
const APPT_FULL_START_HOUR = 0
const APPT_FULL_END_HOUR = 24
const APPT_SLOT_MIN = 15
const APPT_DEFAULT_MIN = 60 // default appointment length: 1 hour from start to end
const BREAK_DEFAULT_MIN = 30 // default break/block length: 30 mins from start to end
const APPT_PX_PER_SLOT = 20
const APPT_DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const APPT_DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const APPT_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const APPT_MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const APPT_FACILITIES = ['Concussion Therapy Group', 'Provider']
const APPT_VIEW_MODES = [['day','Day'], ['week','Week'], ['month','Month'], ['agenda','Agenda']]

/* bg is intentionally saturated enough to read clearly against both the
   light and dark theme's grid background - the original ~9% opacity made
   short appointments nearly invisible (just a thin colored sliver).
   Names/colors match Concussion Therapy Group's own visit-type scheme. */
const VISIT_TYPES = {
  'Day 2 Exam_Neuro Only':   { dot:'#1FCECB', bg:'rgba(31,206,203,.30)',  border:'#1FCECB' }, // Robin Egg Blue
  /* Appointments booked before the Day 1 / Day 2 relabel still carry the old
     key. visitType is stored, so the legacy spelling has to keep resolving or
     those appointments lose their colour on the calendar. */
  'Initial Exam_Neuro Only': { dot:'#1FCECB', bg:'rgba(31,206,203,.30)',  border:'#1FCECB' },
  'Therapy Visits_Neuro Only': { dot:'#1A56DB', bg:'rgba(26,86,219,.30)',   border:'#1A56DB' }, // Blue
  'Re-Exam_Neuro Only':        { dot:'#0A6E3F', bg:'rgba(34,163,105,.30)',  border:'#0A6E3F' }, // Green
  'ACE_Neuro Only':            { dot:'#C2540A', bg:'rgba(194,84,10,.30)',   border:'#C2540A' }, // Burnt Orange
  'Final Exam_Neuro Only':     { dot:'#F5C518', bg:'rgba(245,197,24,.30)',  border:'#F5C518' }  // Yellow
}
/* Safety net for appointments saved under a visit-type name that no longer
   exists (e.g. the old "Consultation"/"Other"/"Day 2 Exam" before this was
   renamed) - a missing key here must never throw, just render neutral. */
const VISIT_TYPE_FALLBACK = { dot:'#7A776C', bg:'rgba(150,146,134,.30)', border:'#7A776C' }

const BREAK_CATEGORIES = {
  'Sway Review':           '#C2540A', // Burnt Orange
  "Epley's Review":        '#B57EDC', // Lilac
  "Epley's Coaching":      '#F5D913', // Lemon Yellow
  'Balance Review':        '#F8B8D0', // Pale Pink
  'ACE':                   '#E8112D', // Bright Red
  'Day 1 Report Completion': '#B22222', // Deep Red
  'General':               '#2E8B57'  // Green
}
const BREAK_STORE_KEY = 'ctg_break_blocks'

function apptBreakCategoryColor(category) {
  if (typeof apptCfgLoad === 'function') {
    const row = apptCfgLoad().breakBlockTexts.find(s => s.name === category)
    if (row && row.color) return row.color
  }
  return BREAK_CATEGORIES[category] || BREAK_CATEGORIES['General']
}

/* A break/block is attributed to whoever created it - the signed-in account
   (e.g. a TA account). Returns that account's display name. */
function breakCurrentAccountName() {
  try {
    const u = (typeof ctgCurrentUser === 'function') ? ctgCurrentUser() : null
    return (u && (u.displayName || u.username)) || 'Unknown account'
  } catch (e) { return 'Unknown account' }
}

/* Perceived-luminance check so category text stays legible whether the
   category color is light (Lemon Yellow, Pale Pink) or dark (Deep Red). */
function apptContrastText(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return '#03045E'
  const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16))
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#03045E' : '#FFFFFF'
}

let ctgAppointments = []
let ctgBreakBlocks = []
let apptCursorDate = apptMidnight(new Date())
// A seven-day grid cannot fit a phone; a phone opens on the single day instead.
let apptViewMode = (window.innerWidth <= 560 ? 'day' : 'week') // 'day' | 'week' | 'month' | 'agenda'
let apptFacilityFilter = 'both' // 'both' | one of APPT_FACILITIES
let apptShowAllHours = false // false = business hours only (8am-7pm), true = full 24 hours
let apptEditingId = null
let breakEditingId = null

function apptStartHour() { return apptShowAllHours ? APPT_FULL_START_HOUR : APPT_BIZ_START_HOUR }
function apptEndHour() { return apptShowAllHours ? APPT_FULL_END_HOUR : APPT_BIZ_END_HOUR }
function apptGridHeightPx() { return ((apptEndHour() - apptStartHour()) * 60 / APPT_SLOT_MIN) * APPT_PX_PER_SLOT }
function apptIsBusinessMinute(m) { return m >= APPT_BIZ_START_HOUR * 60 && m < APPT_BIZ_END_HOUR * 60 }
function apptToggleHours() { apptShowAllHours = !apptShowAllHours; renderAppointments() }

function apptEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
// Display label for a visit type - the stored keys use underscores (e.g.
// "Day 2 Exam_Neuro Only") as identifiers for color lookup, but they read
// nicer with a space. Transform only at render time; never store this.
function apptVisitLabel(v) { return String(v == null ? '' : v).replace(/_/g, ' ') }
/* Calendar color for a visit type: the five built-ins first (their colors are
   fixed), then custom visit types from Appointment Configs (palette colors
   only), else the neutral fallback. */
function apptVisitMeta(v) {
  return VISIT_TYPES[v]
    || (typeof apptConfigVisitMeta === 'function' && apptConfigVisitMeta(v))
    || VISIT_TYPE_FALLBACK
}

async function loadAppointments() {
  try {
    const d = await window.ctgApiFetch('/api/appointments')
    ctgAppointments = d.appointments || []
  } catch (e) { console.error('Could not load appointments', e); ctgAppointments = [] }
}
async function loadBreakBlocks() {
  try {
    const d = await window.ctgApiFetch('/api/appointments/break-blocks')
    ctgBreakBlocks = d.breakBlocks || []
  } catch (e) { console.error('Could not load break/blocks', e); ctgBreakBlocks = [] }
}
window.ctgLoadAppointmentsStore = async function () {
  await Promise.all([loadAppointments(), loadBreakBlocks()])
  renderAppointments()
}

/* ---------- date helpers (local time, no UTC shifting) ---------- */
function apptMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function apptStartOfWeek(d) { const x = apptMidnight(d); x.setDate(x.getDate() - x.getDay()); return x }
function apptAddDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function apptAddMonths(d, n) { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x }
function apptISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function apptMMDDYYYY(d) {
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear()
}
function apptParseMMDDYYYY(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]))
}
function apptMinutesFromTime(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}
function apptFormat12h(hhmm) {
  const min = apptMinutesFromTime(hhmm)
  if (min == null) return ''
  let h = Math.floor(min / 60), m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12; if (h === 0) h = 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}
/* Rows written before the second facility was renamed still say the old
   name. Without this they fail the APPT_FACILITIES[1] test and quietly render
   on the Concussion Therapy Group calendar instead of the provider's - which
   is what happened during the rename, and it looked like data loss. */
const APPT_FACILITY_ALIASES = { 'grande chiropractic, llc': APPT_FACILITIES[1] }
function apptNormalizeFacility(v) {
  const raw = String(v == null ? '' : v).trim()
  if (!raw) return APPT_FACILITIES[0]
  return APPT_FACILITY_ALIASES[raw.toLowerCase()] || raw
}
function apptFacilityOf(a) { return apptNormalizeFacility(a && a.facility) }
function apptFacilitySlug(facility) { return apptNormalizeFacility(facility) === APPT_FACILITIES[1] ? 'fac-b' : 'fac-a' }
// The second facility is the provider's own schedule, so both the dropdown
// and the calendar panel call it that; Concussion Therapy Group keeps its
// real name. Rows saved under the old label were migrated with it.
function apptFacilityHeadLabel(facility) { return apptNormalizeFacility(facility) === APPT_FACILITIES[1] ? 'Provider\'s Calendar' : apptEsc(facility) }
function breakFacilityOf(b) { return apptNormalizeFacility(b && b.facility) }

/* No manual category picker - the color-coded category is detected from
   whatever's typed into Name/Agenda, checking the more specific patterns
   ("Day 1 Report Completion", "Epley's Coaching") before their broader
   siblings ("ACE", "Epley's Review") so they don't get misclassified. */
function apptDetectBreakCategory(text) {
  const t = String(text || '').toLowerCase()
  if (/report\s*completion/.test(t)) return 'Day 1 Report Completion'
  if (/\bace\b/.test(t)) return 'ACE'
  if (/sway/.test(t)) return 'Sway Review'
  if (/epley.?s?\s*coach/.test(t)) return "Epley's Coaching"
  if (/epley/.test(t)) return "Epley's Review"
  if (/balance/.test(t)) return 'Balance Review'
  // Custom categories added in Appointment Configs -> Break & Block, matched
  // by keyword the same way - checked only after the 7 built-ins above, so
  // nothing already working here changes.
  if (typeof apptCfgLoad === 'function') {
    const custom = apptCfgLoad().breakBlockTexts.find(s => !s.builtin && s.active !== false && s.name && t.indexOf(s.name.toLowerCase()) !== -1)
    if (custom) return custom.name
  }
  return 'General'
}

// The same trigger each built-in category is detected by in
// apptDetectBreakCategory, so apptComposeBreakLabel can recognize "just the
// keyword" and not only an exact match of the full category name.
function apptBreakCategoryTrigger(category) {
  switch (category) {
    case 'Day 1 Report Completion': return /report\s*completion/i
    case 'ACE': return /\bace\b/i
    case 'Sway Review': return /sway/i
    case "Epley's Coaching": return /epley.?s?\s*coach/i
    case "Epley's Review": return /epley/i
    case 'Balance Review': return /balance/i
    default: return null // custom category - name IS the whole keyword
  }
}

function apptComposeBreakLabel(category, name, agenda) {
  const n = String(name || '').trim(), rawA = String(agenda || '').trim()
  if (category === 'General') {
    if (!n || !rawA) return n || rawA
    // Only "Meeting" reads naturally as "Meeting with X" - everything else
    // (e.g. "Talk to Patient") stays Name-first, matching "Curtis, Krysta
    // Talk to Patient" rather than forcing every agenda into "X with Name".
    return /^meeting\b/i.test(rawA) ? (rawA + ' with ' + n) : (n + ' — ' + rawA)
  }
  let extra = rawA
  if (rawA.toLowerCase() === category.toLowerCase()) {
    extra = ''
  } else {
    // "Sway" alone (typed just to trigger the color) leaves nothing once the
    // keyword itself is stripped out - that used to slip through the exact-
    // match check above and get repeated verbatim right after its own
    // category name ("Sway Review, Sway").
    const trigger = apptBreakCategoryTrigger(category)
    if (trigger) {
      const stripped = rawA.replace(trigger, '').replace(/^[\s,\-–—:;]+|[\s,\-–—:;]+$/g, '')
      if (!stripped) extra = ''
    }
  }
  if (category === 'ACE' || category === 'Day 1 Report Completion') {
    return n ? (category + ': ' + n + (extra ? ' — ' + extra : '')) : (category + (extra ? ': ' + extra : ''))
  }
  return (n + ' ' + category + (extra ? ', ' + extra : '')).trim()
}
function breakLabel(b) { return b.label || apptComposeBreakLabel(b.category, b.name, b.agenda) || 'Block' }

function breakParseLabel(label, storedCategory) {
  const text = String(label || '')
  const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
  const category = storedCategory || apptDetectBreakCategory(text)

  const catTokens = apptNameTokens(category === 'General' ? '' : category)
  const sig = apptNameTokens(text).filter(t => catTokens.indexOf(t) === -1)
  let patientName = '', bestLen = 0
  list.forEach(p => {
    const name = (typeof naturalPatientName === 'function') ? naturalPatientName(p) : ''
    const want = apptNameTokens(name)
    // Longest name wins, so "Mary Jane Watson" is preferred over a "Mary Jane"
    // that matches the same label just as legitimately.
    if (name && want.length && apptNameMatches(want, sig) && want.length > bestLen) {
      bestLen = want.length
      patientName = name
    }
  })

  let rest = text
  if (patientName) {
    const idx = rest.toLowerCase().indexOf(patientName.toLowerCase())
    if (idx !== -1) {
      rest = rest.slice(0, idx) + rest.slice(idx + patientName.length)
    } else {
      // Matched on words rather than as a run of characters, so take it back
      // out the same way - the label spells the name differently than we do.
      const want = apptNameTokens(patientName)
      rest = rest.split(/\s+/)
        .filter(w => want.indexOf(w.toLowerCase().replace(/[^a-z0-9]/g, '')) === -1)
        .join(' ')
    }
  }
  if (category !== 'General') {
    rest = rest.replace(new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
  }
  rest = rest
    .replace(/^\s*with\b/i, '').replace(/\bwith\s*$/i, '')
    .replace(/^[\s:,\-–—]+|[\s:,\-–—]+$/g, '')
    .trim()
  // Folding a bare keyword into the category (see apptComposeBreakLabel)
  // loses the exact original text - recovering the category's own name
  // instead still redetects the same color and reads sensibly either way.
  const agenda = rest || (category !== 'General' ? category : '')
  return { patientName, agenda }
}

function apptNameTokens(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

/* "2:00 - 2:30 AM". The meridiem is written once when both ends share it,
   which is the usual case for a block half an hour long - the merged pill it
   goes in is a single ellipsized line, so every character it does not spend
   is one the category name keeps. */
function apptBreakTimeRange(start, end) {
  const s = apptFormat12h(start), e = apptFormat12h(end)
  if (!s) return ''
  if (!e) return s
  return (s.slice(-2) === e.slice(-2) ? s.slice(0, -3) : s) + ' – ' + e
}

/* The name a block is FOR, with the category's own words taken back out.
   "Mary Jane Watson Sway Review" is the patient "Mary Jane Watson"; without
   this the words "sway" and "review" would count as part of her name and let
   any other Sway Review that day look like a partial match for her. */
function apptBreakNameSig(b) {
  const cat = apptNameTokens(b.category || '')
  return apptNameTokens(breakLabel(b)).filter(t => cat.indexOf(t) === -1)
}

function apptNameMatches(want, sig) {
  if (!want.length || !sig.length) return false
  const shared = want.filter(w => sig.indexOf(w) !== -1).length
  if (shared < (want.length === 1 ? 1 : 2)) return false
  return shared === want.length || shared === sig.length
}

window.ctgBreakTitlesFor = function (patientName, date) {
  const want = apptNameTokens(patientName)
  if (!want.length || !date) return []
  return ctgBreakBlocks
    .filter(b => b.date === date && apptNameMatches(want, apptBreakNameSig(b)))
    .sort((x, y) => String(x.start).localeCompare(String(y.start)))
    .map(b => {
      const label = breakLabel(b)
      const category = b.category || apptDetectBreakCategory(label)
      // A General block has no category worth showing, so what is left of the
      // label once the patient's own name is removed stands in as the agenda.
      const title = (category && category !== 'General')
        ? category
        : label.split(/\s+/).filter(w => want.indexOf(w.toLowerCase().replace(/[^a-z0-9]/g, '')) === -1)
            .join(' ').replace(/^[\s:,\-–—]+|[\s:,\-–—]+$/g, '').trim()
      // `start` is the raw 'HH:MM'. Command Center sorts on it: several patients
      // routinely share one appointment slot, and the provider's own block is
      // the only thing that says which of them is actually seen first.
      return title
        ? { title, start: b.start, time: apptBreakTimeRange(b.start, b.end), color: apptBreakCategoryColor(category) }
        : null
    })
    .filter(Boolean)
}

window.ctgBreakMatchDebug = function (patientName, date) {
  const want = apptNameTokens(patientName)
  const onDate = ctgBreakBlocks.filter(b => b.date === date)
  const out = {
    lookingFor: { name: patientName, tokens: want, date },
    blocksLoadedTotal: ctgBreakBlocks.length,
    blocksOnThatDate: onDate.length,
    candidates: onDate.map(b => {
      const sig = apptBreakNameSig(b)
      return {
        label: breakLabel(b), category: b.category, facility: b.facility,
        start: b.start, nameSignature: sig,
        sharedWords: want.filter(w => sig.indexOf(w) !== -1),
        matches: apptNameMatches(want, sig)
      }
    }),
    result: window.ctgBreakTitlesFor(patientName, date)
  }
  if (!out.blocksLoadedTotal) out.verdict = 'No break/blocks loaded in this tab at all — reload the page.'
  else if (!out.blocksOnThatDate) out.verdict = 'No break/block is stored on that date. Check the block\'s DATE field.'
  else if (!out.result.length) {
    out.verdict = 'Blocks exist that day but none names this patient — see candidates[].nameSignature. '
      + 'A signature of [] means the block was saved with PATIENT = N/A, so it carries no name to match.'
  } else out.verdict = 'Matched ' + out.result.length + ' block(s): '
    + out.result.map(r => r.title + ' ' + r.time).join(' | ')
  console.log(out.verdict)
  return out
}

/* Appointments + Break/Blocks rendered together wherever the calendar shows
   entries for a given day+facility - both compete for the same grid space. */
function apptCombinedEntries(dateISO, facility) {
  const appts = ctgAppointments.filter(a => a.date === dateISO && apptFacilityOf(a) === facility).map(a => Object.assign({ _kind: 'appt' }, a))
  const breaks = ctgBreakBlocks.filter(b => b.date === dateISO && breakFacilityOf(b) === facility).map(b => Object.assign({ _kind: 'break' }, b))
  return appts.concat(breaks)
}

/* days array covering the current display range (day/week/agenda share this) */
function apptDaysForMode() {
  if (apptViewMode === 'day') return [apptCursorDate]
  const start = apptStartOfWeek(apptCursorDate)
  const days = []
  for (let i = 0; i < 7; i++) days.push(apptAddDays(start, i))
  return days
}

/* ---------- navigation ---------- */
function apptPrev() {
  if (apptViewMode === 'day') apptCursorDate = apptAddDays(apptCursorDate, -1)
  else if (apptViewMode === 'month') apptCursorDate = apptAddMonths(apptCursorDate, -1)
  else apptCursorDate = apptAddDays(apptCursorDate, -7)
  renderAppointments()
}
function apptNext() {
  if (apptViewMode === 'day') apptCursorDate = apptAddDays(apptCursorDate, 1)
  else if (apptViewMode === 'month') apptCursorDate = apptAddMonths(apptCursorDate, 1)
  else apptCursorDate = apptAddDays(apptCursorDate, 7)
  renderAppointments()
}
function apptToday() { apptCursorDate = apptMidnight(new Date()); renderAppointments() }
function apptSetFacilityFilter(f) { apptFacilityFilter = f; renderAppointments() }
// Sliding pill under Day/Week/Month/Agenda. The toolbar re-renders on switch, so we
// remember the last glider position and animate the fresh glider from there.
let apptViewGliderLast = null
function ctgPlaceApptViewGlider(tabs) {
  try {
    if (!tabs) return
    const g = tabs.querySelector('.appt-view-glider'), act = tabs.querySelector('.appt-facility-tab.active')
    if (!g || !act) { if (g) g.style.opacity = '0'; return }
    requestAnimationFrame(() => {
      const x = act.offsetLeft, y = act.offsetTop, w = act.offsetWidth, h = act.offsetHeight
      if (apptViewGliderLast) {
        g.style.transition = 'none'
        g.style.transform = 'translate(' + apptViewGliderLast.x + 'px,' + apptViewGliderLast.y + 'px)'
        g.style.width = apptViewGliderLast.w + 'px'; g.style.height = apptViewGliderLast.h + 'px'; g.style.opacity = '1'
        void g.offsetWidth; g.style.transition = ''
        requestAnimationFrame(() => { g.style.transform = 'translate(' + x + 'px,' + y + 'px)'; g.style.width = w + 'px'; g.style.height = h + 'px' })
      } else {
        g.style.transition = 'none'; g.style.opacity = '1'
        g.style.transform = 'translate(' + x + 'px,' + y + 'px)'; g.style.width = w + 'px'; g.style.height = h + 'px'
        void g.offsetWidth; g.style.transition = ''
      }
      apptViewGliderLast = { x, y, w, h }
    })
  } catch (e) {}
}
function apptSetViewMode(mode) { apptViewMode = mode; renderAppointments() }
function apptGoToDay(iso) { apptCursorDate = apptMidnight(new Date(iso + 'T00:00:00')); apptViewMode = 'day'; renderAppointments() }

function apptLegendGroupHTML(facility, colorEntries) {
  const slug = apptFacilitySlug(facility)
  const items = colorEntries.map(([label, color]) =>
    '<span class="appt-legend-item"><span class="appt-legend-dot" data-cs="'+__cs+'background:' + color + '"></span>' + apptEsc(apptVisitLabel(label)) + '</span>'
  ).join('')
  return '<div class="appt-legend-group"><span class="appt-legend-group-label ' + slug + '">' + apptEsc(facility) + '</span>' + items + '</div>'
}

function apptRangeLabel() {
  if (apptViewMode === 'day') {
    return APPT_DAY_NAMES_FULL[apptCursorDate.getDay()] + ', ' + APPT_MONTH_NAMES[apptCursorDate.getMonth()] + ' ' + apptCursorDate.getDate() + ', ' + apptCursorDate.getFullYear()
  }
  if (apptViewMode === 'month') {
    return APPT_MONTH_NAMES_FULL[apptCursorDate.getMonth()] + ' ' + apptCursorDate.getFullYear()
  }
  const start = apptStartOfWeek(apptCursorDate), end = apptAddDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const startStr = APPT_MONTH_NAMES[start.getMonth()] + ' ' + start.getDate()
  const endStr = (sameMonth ? '' : APPT_MONTH_NAMES[end.getMonth()] + ' ') + end.getDate() + ', ' + end.getFullYear()
  return startStr + ' – ' + endStr
}

/* ---------- rendering ---------- */
function renderAppointments() {
  const mount = document.getElementById('apptGridMount')
  if (!mount) return
  const label = document.getElementById('apptWeekRangeLabel')
  if (label) label.textContent = apptRangeLabel()

  const todayISO = apptISODate(new Date())
  const visibleFacilities = apptFacilityFilter === 'both' ? APPT_FACILITIES : [apptFacilityFilter]

  // Compact top-bar status: patient appointments scheduled for the real current day.
  const tag = document.getElementById('apptWeekTag')
  const scheduledToday = ctgAppointments.filter(a => a.date === todayISO && visibleFacilities.indexOf(apptFacilityOf(a)) !== -1).length
  if (tag) tag.textContent = scheduledToday + (scheduledToday === 1 ? ' Patient Scheduled Today' : ' Patients Scheduled Today')
  const viewTabs = document.getElementById('apptViewTabs')
  if (viewTabs) {
    viewTabs.innerHTML = APPT_VIEW_MODES.map(([key, lbl]) =>
      '<button type="button" class="appt-facility-tab' + (apptViewMode === key ? ' active' : '') + '" data-onclick="apptSetViewMode(\'' + key + '\')">' + lbl + '</button>'
    ).join('') + '<span class="appt-view-glider" aria-hidden="true"></span>'
    ctgPlaceApptViewGlider(viewTabs)
  }

  const facSelect = document.getElementById('apptFacilityFilterSelect')
  if (facSelect) facSelect.value = apptFacilityFilter

  apptRenderUndo()

  if (apptViewMode === 'agenda') {
    mount.innerHTML = apptBuildAgendaView(apptDaysForMode(), visibleFacilities)
    return
  }

  const compact = visibleFacilities.length > 1
  let h = '<div class="appt-body-scroll appt-body-scroll-' + apptViewMode + '"><div class="appt-facilities-row">'
  if (apptViewMode === 'month') {
    visibleFacilities.forEach(facility => { h += apptBuildMonthPanel(facility, compact) })
  } else {
    const days = apptDaysForMode()
    const daysISOs = days.map(apptISODate)
    visibleFacilities.forEach(facility => { h += apptBuildFacilityPanel(facility, compact, days, daysISOs, todayISO) })
  }
  h += '</div></div>'
  mount.innerHTML = h
  if (apptViewMode !== 'month') {
    // Force the scroll position back to the very top on every render - some
    // browsers' scroll-anchoring will otherwise nudge a freshly-built
    // scrollable box down by a few pixels to "preserve" a prior scroll
    // position, which was hiding the first (8 AM) row.
    mount.querySelectorAll('.appt-grid-scroll').forEach(box => { box.scrollTop = 0 })
    apptFitGridScrollHeightSettled()
    apptWireScrollSync()
  }
}

function apptWireScrollSync() {
  const boxes = [...document.querySelectorAll('#apptGridMount .appt-grid-scroll')]
  if (boxes.length < 2) return
  let syncing = false
  boxes.forEach(box => {
    box.addEventListener('scroll', () => {
      if (syncing) return
      syncing = true
      boxes.forEach(other => { if (other !== box) other.scrollTop = box.scrollTop })
      syncing = false
    })
  })
}

function apptFitGridScrollHeight() {
  const boxes = document.querySelectorAll('#apptGridMount .appt-grid-scroll')
  boxes.forEach(box => {
    box.style.maxHeight = 'none'
    box.style.height = ''
    if (box.scrollTop !== 0) box.scrollTop = 0
  })
}
let apptFitRetryTimer = null
function apptFitGridScrollHeightSettled() {
  apptFitGridScrollHeight()
  clearTimeout(apptFitRetryTimer)
  apptFitRetryTimer = setTimeout(apptFitGridScrollHeight, 760)
}
window.addEventListener('resize', () => {
  if (document.getElementById('page-appointment') && document.getElementById('page-appointment').classList.contains('active')) {
    apptFitGridScrollHeight()
  }
})

/* ---------- Day / Week grid (also used for the single-day view) ---------- */
function apptBuildFacilityPanel(facility, compact, days, daysISOs, todayISO) {
  const slug = apptFacilitySlug(facility)
  const wide = days.length === 1 // day view needs less minimum width than week
  const panelClass = compact ? (wide ? ' wide-day' : ' compact') : ''
  const rangeCount = ctgAppointments.filter(a => daysISOs.indexOf(a.date) !== -1 && apptFacilityOf(a) === facility).length
    + ctgBreakBlocks.filter(b => daysISOs.indexOf(b.date) !== -1 && breakFacilityOf(b) === facility).length
  let h = '<div class="appt-facility-panel' + panelClass + '">'
  h += '<div class="appt-facility-head ' + slug + '">' + apptFacilityHeadLabel(facility) + '<span class="appt-facility-count">' + rangeCount + ' in range</span></div>'

  h += '<div class="appt-grid-scroll"><div class="appt-header"><div class="appt-header-gutter"></div>'
  days.forEach((d, i) => {
    const iso = daysISOs[i]
    const isToday = iso === todayISO
    h += '<div class="appt-header-day' + (isToday ? ' today' : '') + '">'
      + '<div class="appt-header-dayname">' + APPT_DAY_NAMES[d.getDay()] + '</div>'
      + '<div class="appt-header-daynum">' + d.getDate() + '</div>'
      + '</div>'
  })
  h += '</div>'

  h += '<div class="appt-grid" data-cs="'+__cs+'height:' + apptGridHeightPx() + 'px">'
  h += '<div class="appt-gutter">'
  const startH = apptStartHour(), endH = apptEndHour()
  for (let m = startH * 60; m <= endH * 60; m += APPT_SLOT_MIN) {
    const top = ((m - startH * 60) / APPT_SLOT_MIN) * APPT_PX_PER_SLOT
    const isHour = m % 60 === 0
    h += '<div class="appt-gutter-label' + (isHour ? ' hour' : '') + '" data-cs="'+__cs+'top:' + top + 'px">' + apptGutterLabel(m) + '</div>'
  }
  h += '</div>'

  h += '<div class="appt-daycols">'
  days.forEach((d, i) => {
    const iso = daysISOs[i]
    const isToday = iso === todayISO
    const dayEntries = apptLayoutDay(apptCombinedEntries(iso, facility))
    h += '<div class="appt-daycol' + (isToday ? ' today' : '') + '">'
    h += apptSlotRowsHTML(iso, facility)
    if (days.length > 1) {
      // Week view: crowded slots (3+ overlaps) render as vertical name-only lanes.
      h += apptRenderWeekDay(dayEntries)
    } else {
      dayEntries.forEach(a => { h += (a._kind === 'break' ? apptBreakBlockHTML(a, false) : apptBlockHTML(a, false)) })
    }
    h += '</div>'
  })
  h += '</div></div></div>'
  h += '<div class="appt-hours-toggle" data-onclick="apptToggleHours()">' + (apptShowAllHours ? 'Show business hours (8 AM – 7 PM)…' : 'Show 24 hours…') + '</div>'
  h += '</div>'
  return h
}

function apptGutterLabel(minutesFromMidnight) {
  let hr = Math.floor(minutesFromMidnight / 60), min = minutesFromMidnight % 60
  const ampm = hr >= 12 ? 'PM' : 'AM'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return min === 0 ? (h12 + ' ' + ampm) : (h12 + ':' + String(min).padStart(2, '0'))
}

/* Real per-slot rows (rather than a background gradient) so each 15-minute
   slot can be individually hover-highlighted and carries its own click
   target - matches EnableMyPractice's row-highlight-on-hover behavior.
   In 24-hour mode, minutes outside business hours (8 AM - 7 PM) are dimmed. */
function apptBlankSlotClick(iso, time, facility) {
  if (facility === APPT_FACILITIES[1]) openBreakBlockModal(iso, time, facility)
  else openApptModal(iso, time, facility)
}

function apptSlotRowsHTML(iso, facility) {
  let h = ''
  const startH = apptStartHour(), endH = apptEndHour()
  for (let m = startH * 60; m < endH * 60; m += APPT_SLOT_MIN) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    const isHour = m % 60 === 0
    const outsideBiz = apptShowAllHours && !apptIsBusinessMinute(m)
    h += '<div class="appt-slot' + (isHour ? ' hour' : '') + (outsideBiz ? ' outside-biz' : '') + '" data-cs="'+__cs+'height:' + APPT_PX_PER_SLOT + 'px" '
      + 'data-onclick="apptBlankSlotClick(\'' + iso + '\',\'' + hh + ':' + mm + '\',\'' + apptEsc(facility) + '\')" '
      + 'data-oncontextmenu="apptOpenContextMenu(event,\'' + iso + '\',\'' + hh + ':' + mm + '\',\'' + apptEsc(facility) + '\')" '
      + 'title="' + apptGutterLabel(m) + ' — right-click for more options"></div>'
  }
  return h
}

function apptLayoutDay(list) {
  const sorted = list.slice().sort((a, b) => apptMinutesFromTime(a.start) - apptMinutesFromTime(b.start))
  const placed = []
  let colEnds = []
  let cluster = []
  let clusterId = 0
  // Tag each entry with its overlap cluster's id and size so the week renderer
  // can switch a crowded slot (3+ overlaps) to vertical name-only lanes.
  const flushCluster = () => {
    const cols = colEnds.length || 1
    cluster.forEach(p => { p._cols = cols; p._clusterId = clusterId; p._clusterSize = cluster.length })
    clusterId++
    cluster = []
  }
  sorted.forEach(a => {
    const startMin = apptMinutesFromTime(a.start) ?? apptStartHour() * 60
    const endMin = Math.max(startMin + APPT_SLOT_MIN, apptMinutesFromTime(a.end) ?? (startMin + APPT_SLOT_MIN))
    if (colEnds.length && startMin >= Math.max(...colEnds)) { flushCluster(); colEnds = [] }
    let col = colEnds.findIndex(end => end <= startMin)
    if (col === -1) { col = colEnds.length; colEnds.push(0) }
    colEnds[col] = endMin
    const p = Object.assign({}, a, { _startMin: startMin, _endMin: endMin, _col: col })
    placed.push(p)
    cluster.push(p)
  })
  flushCluster()
  return placed
}

function apptBlockInnerHTML(timeStr, name, cols, visitType) {
  // Not colored to match the block's own visit-type tint - the
  // block background is already that color (translucent), so text in the
  // same hue was low-contrast against it. A fixed accent color reads clearly
  // against every visit-type tint and both themes.
  const visitLine = visitType ? '<div class="appt-block-visittype">Visit Type- ' + apptEsc(apptVisitLabel(visitType)) + '</div>' : ''
  return '<div class="appt-block-time">' + timeStr + '</div><div class="appt-block-name">' + apptEsc(name) + '</div>' + visitLine
}

function apptCascadeGeometry(col, cols) {
  // Keep the rightmost 10% of every Day/Week calendar cell uncovered so the
  // underlying time slot remains clickable even when appointments fill that time.
  const usablePct = 90
  const widthPct = usablePct / cols
  return { widthPct, leftPct: col * widthPct }
}

const APPT_WEEK_VERTICAL_THRESHOLD = 3
function apptRenderWeekDay(dayEntries) {
  let html = ''
  const byCluster = {}
  dayEntries.forEach(a => { (byCluster[a._clusterId] = byCluster[a._clusterId] || []).push(a) })
  Object.keys(byCluster).forEach(cid => {
    const grp = byCluster[cid]
    const vertical = grp.length >= APPT_WEEK_VERTICAL_THRESHOLD
    grp.forEach(a => {
      if (vertical) a._vertical = true
      html += (a._kind === 'break' ? apptBreakBlockHTML(a, true) : apptBlockHTML(a, true))
    })
  })
  return html
}

function apptBlockHTML(a, isWeek) {
  const meta = apptVisitMeta(a.visitType)
  const startH = apptStartHour(), endH = apptEndHour()
  const clampedStart = Math.min(Math.max(a._startMin, startH * 60), endH * 60)
  const clampedEnd = Math.min(Math.max(a._endMin, clampedStart + APPT_SLOT_MIN), endH * 60)
  const top = ((clampedStart - startH * 60) / APPT_SLOT_MIN) * APPT_PX_PER_SLOT
  // 26px minimum so even a single 15-minute slot has room to show both the
  // time and patient name lines instead of clipping the name off.
  const height = Math.max(26, ((clampedEnd - clampedStart) / APPT_SLOT_MIN) * APPT_PX_PER_SLOT - 2)
  const { widthPct, leftPct } = apptCascadeGeometry(a._col, a._cols)
  const name = a.patientName || 'Unnamed'
  const fill = meta.border
  const txt = '#FFFFFF'
  // Vertical name-only mode: a crowded week slot (3+ overlaps) renders each
  // appointment as a narrow lane with just the patient's name written down the
  // column, so the full name stays readable instead of wrapping into cramped
  // "8:3 / Ja / Vis" fragments (see apptRenderWeekDay).
  /* No video-visit camera badge here. A week column packed with overlapping
     blocks gave every one the same small icon in the same corner, which read
     as decoration rather than information. Whether a visit is attended from a
     desk or in person is spelled out on the hover card instead. */
  const inner = (a._vertical
    ? '<div class="appt-block-vname">' + apptEsc(name) + '</div>'
    : apptBlockInnerHTML(apptFormat12h(a.start), name, a._cols, a.visitType))
  return '<div class="appt-block' + (a.meetingId ? ' has-room' : '') + (a._cols >= 3 ? ' narrow' : '') + (isWeek ? ' appt-week' : '') + (a._vertical ? ' appt-vert' : '') + '" data-cs="'+__cs+'top:' + top + 'px;height:' + height + 'px;left:calc(' + leftPct + '% + 2px);width:calc(' + widthPct + '% - 4px);background:' + fill + ';color:' + txt + ';border-left-color:' + apptStatusColor(apptNormalizeStatus(a.status)) + '" '
    + apptHoverAttrs(a.id)
    // No title attribute here - the browser's native tooltip used to show
    // "name - visit type - time" on hover, but now duplicates (and visually
    // clashes with) the richer apptHoverCard popup that already shows this.
    + 'data-oncontextmenu="apptOpenBlockContextMenu(event,\'' + a.id + '\')" '
    + 'data-onclick="event.stopPropagation();editAppointment(\'' + a.id + '\')">'
    + inner
    + '</div>'
}

/* Break/Block entries render as a SOLID category color (not the translucent
   tint appointments use) so they read as distinct, placed
   reservations on the calendar - matching how EnableMyPractice renders its
   team-meeting/out-of-clinic/ACE blocks as bold flat color. */
function apptBreakBlockHTML(b, isWeek) {
  const color = apptBreakCategoryColor(b.category)
  // Always white text (matching appointment blocks) - the block's dark
  // text-shadow keeps it legible even on the lighter category colors (yellow).
  const textColor = '#FFFFFF'
  const startH = apptStartHour(), endH = apptEndHour()
  const clampedStart = Math.min(Math.max(b._startMin, startH * 60), endH * 60)
  const clampedEnd = Math.min(Math.max(b._endMin, clampedStart + APPT_SLOT_MIN), endH * 60)
  const top = ((clampedStart - startH * 60) / APPT_SLOT_MIN) * APPT_PX_PER_SLOT
  const height = Math.max(26, ((clampedEnd - clampedStart) / APPT_SLOT_MIN) * APPT_PX_PER_SLOT - 2)
  const { widthPct, leftPct } = apptCascadeGeometry(b._col, b._cols)
  const label = breakLabel(b)
  const tooltip = label + ' — ' + apptFormat12h(b.start) + (b.schedule ? ' — ' + b.schedule : '')
  const inner = b._vertical
    ? '<div class="appt-block-vname">' + apptEsc(label) + '</div>'
    : apptBlockInnerHTML(apptFormat12h(b.start), label, b._cols)
  return '<div class="appt-block appt-break-block' + (b._cols >= 3 ? ' narrow' : '') + (isWeek ? ' appt-week' : '') + (b._vertical ? ' appt-vert' : '') + '" data-cs="'+__cs+'top:' + top + 'px;height:' + height + 'px;left:calc(' + leftPct + '% + 2px);width:calc(' + widthPct + '% - 4px);background:' + color + ';border-left-color:' + color + ';color:' + textColor + '" '
    + 'data-onclick="event.stopPropagation();editBreakBlock(\'' + b.id + '\')" title="' + apptEsc(tooltip) + '">'
    + inner
    + '</div>'
}

/* Appointment snapshot hover card. Break blocks are not tied to a patient
   record, so this only wires onto real appointments. Trimmed to the fields
   worth surfacing on hover: last updated, date of birth, gender, status and
   next appointment. */
let apptHoverTimer = null
let apptHoverHideTimer = null
function apptHoverAttrs(id) {
  return 'data-onmouseenter="apptShowHoverCard(event,\'' + id + '\')" data-onmouseleave="apptScheduleHideHoverCard()" '
}
function apptShowHoverCard(evt, apptId) {
  clearTimeout(apptHoverHideTimer)
  clearTimeout(apptHoverTimer)
  // Anchor to the cursor position, not the hovered element's bounding box -
  // a single-appointment day-view block can span the entire grid width, so
  // anchoring to its edges pushed the card off toward the sidebar instead of
  // tracking where the user was actually pointing.
  const point = { x: evt.clientX, y: evt.clientY }
  apptHoverTimer = setTimeout(() => apptRenderHoverCard(point, apptId), 200)
}
function apptScheduleHideHoverCard() {
  clearTimeout(apptHoverTimer)
  apptHoverHideTimer = setTimeout(apptHideHoverCard, 120)
}
function apptHoverCardHover() { clearTimeout(apptHoverHideTimer) }
function apptHideHoverCard() {
  const card = document.getElementById('apptHoverCard')
  if (card) card.classList.remove('show')
}
/* Next chronological appointment for this patient strictly after the one
   being hovered - matches "Next Appointment" on the reference card. */
function apptNextAppointmentFor(patientId, afterDateISO, afterStart) {
  if (!patientId) return null
  const afterKey = afterDateISO + ' ' + (afterStart || '00:00')
  const future = ctgAppointments
    .filter(x => x.patientId === patientId && (x.date + ' ' + x.start) > afterKey)
    .sort((x, y) => (x.date + ' ' + x.start).localeCompare(y.date + ' ' + y.start))
  return future[0] || null
}
function apptFmtDateTimeShort(iso, hhmm) {
  const d = new Date(iso + 'T00:00:00')
  return APPT_MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear() + ' ' + apptFormat12h(hhmm).replace(' ', '')
}
/* Initials for the header avatar chip - prefers the real patient record
   (same rule as initialsForPatient elsewhere) but falls back to splitting
   the free-text patientName so quick-added "not yet registered" appointments
   still get a sensible chip instead of a blank circle. */
function apptHoverInitials(p, name) {
  if (p && typeof initialsForPatient === 'function') return initialsForPatient(p)
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'PT'
}
function apptHoverCardHTML(a) {
  const p = a.patientId && typeof getPatient === 'function' ? getPatient(a.patientId) : null
  const dob = p?.demographics?.dob || '—'
  const gender = p?.demographics?.gender || '—'
  const device = p?.demographics?.device || '—'
  const email = p?.demographics?.email || '—'
  const status = apptNormalizeStatus(a.status)
  const updatedBy = a.updatedBy || a.createdBy || ''
  const updatedAt = a.updatedAt || a.createdAt
  const updatedAtLabel = updatedAt ? new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  // Graceful fallback chain - demo/imported appointments predating the
  // audit-stamp feature have neither field, so "Last updated by - at - "
  // (a bare em dash either side) is never shown.
  let updatedLine
  if (updatedBy && updatedAtLabel) updatedLine = 'Updated by <strong>' + apptEsc(updatedBy) + '</strong> · ' + apptEsc(updatedAtLabel)
  else if (updatedAtLabel) updatedLine = 'Updated ' + apptEsc(updatedAtLabel)
  else updatedLine = 'No update history yet'
  const next = apptNextAppointmentFor(a.patientId, a.date, a.start)
  const nextLabel = next ? apptFmtDateTimeShort(next.date, next.start) + ' (Nicholas Grande)' : 'None scheduled'
  const name = a.patientName || 'Unnamed'
  // Status colour drives the top strip, the avatar chip and the Status pill,
  // the same solid accent as the block's left edge, so hovering a block and
  // seeing its card feels like one object. Visit type still shows through the
  // icon and label beside the name.
  const statusColor = apptStatusColor(status)
  const statusTextColor = apptContrastText(statusColor)
  return '<div class="appt-hover-accent" data-cs="'+__cs+'background:' + statusColor + '"></div>'
    + '<div class="appt-hover-hd">'
    + '<div class="appt-hover-av" data-cs="'+__cs+'background:' + statusColor + ';color:' + statusTextColor + '">' + apptEsc(apptHoverInitials(p, name)) + '</div>'
    + '<div class="appt-hover-idblock"><div class="appt-hover-name">' + apptEsc(name) + '</div><div class="appt-hover-visit">' + apptEsc(apptVisitLabel(a.visitType || '')) + '</div></div>'
    + '</div>'
    + '<div class="appt-hover-updated">' + updatedLine + '</div>'
    + '<div class="appt-hover-body">'
    + '<div class="appt-hover-grid">'
    + '<div class="appt-hover-cell"><span class="appt-hover-label">DOB</span><span class="appt-hover-val">' + apptEsc(dob) + '</span></div>'
    + '<div class="appt-hover-cell"><span class="appt-hover-label">Gender</span><span class="appt-hover-val">' + apptEsc(gender) + '</span></div>'
    + '<div class="appt-hover-cell"><span class="appt-hover-label">Device</span><span class="appt-hover-val">' + apptEsc(device) + '</span></div>'
    + '<div class="appt-hover-cell"><span class="appt-hover-label">Email</span><span class="appt-hover-val" data-cs="'+__cs+'font-size:11.5px;overflow-wrap:anywhere">' + apptEsc(email) + '</span></div>'
    + '</div>'
    // Stated in words for every appointment, not just the video ones - the
    // camera badge this replaced was only ever present on telehealth blocks,
    // so "no icon" had to be read as "in person", which is not something a
    // calendar should ask anyone to infer from an absence.
    + '<div class="appt-hover-row"><span class="appt-hover-label">Visit</span><span class="appt-hover-val">' + (a.meetingId ? 'Video visit' : 'In person') + '</span></div>'
    + '<div class="appt-hover-row"><span class="appt-hover-label">Status</span><span class="appt-hover-status" data-cs="'+__cs+'background:' + statusColor + ';color:' + statusTextColor + '">' + apptEsc(status) + '</span></div>'
    + (a.room ? '<div class="appt-hover-row"><span class="appt-hover-label">Room</span><span class="appt-hover-val">' + apptEsc(a.room) + '</span></div>' : '')
    + '<div class="appt-hover-row appt-hover-next"><span class="appt-hover-label">Next Appointment</span><span class="appt-hover-val' + (next ? '' : ' appt-hover-val-muted') + '">' + apptEsc(nextLabel) + '</span></div>'
    + '</div>'
}
function apptRenderHoverCard(point, apptId) {
  const a = ctgAppointments.find(x => x.id === apptId)
  const card = document.getElementById('apptHoverCard')
  if (!a || !card) return
  card.innerHTML = apptHoverCardHTML(a)
  card.classList.add('show')
  apptPositionHoverCard(point)
}
function apptPositionHoverCard(point) {
  const card = document.getElementById('apptHoverCard')
  if (!card) return
  const cw = card.offsetWidth || 280
  let left = point.x + 16
  if (left + cw > window.innerWidth - 8) left = point.x - cw - 16
  left = Math.max(8, Math.min(left, window.innerWidth - cw - 8))
  card.style.left = left + 'px'
  card.style.top = Math.max(8, point.y - 10) + 'px'
  requestAnimationFrame(() => {
    const cr = card.getBoundingClientRect()
    if (cr.bottom > window.innerHeight - 8) card.style.top = Math.max(8, window.innerHeight - cr.height - 8) + 'px'
  })
}

/* ---------- Month view ---------- */
function apptMonthGridWeeks(anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth()
  const firstOfMonth = new Date(y, m, 1)
  const lastOfMonth = new Date(y, m + 1, 0)
  const gridStart = apptStartOfWeek(firstOfMonth)
  const gridEnd = apptAddDays(apptStartOfWeek(lastOfMonth), 6)
  const weeks = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    const week = []
    for (let i = 0; i < 7; i++) { week.push(cursor); cursor = apptAddDays(cursor, 1) }
    weeks.push(week)
  }
  return weeks
}

function apptMonthChipHTML(entry) {
  if (entry._kind === 'break') {
    const color = apptBreakCategoryColor(entry.category)
    const label = breakLabel(entry)
    return '<div class="appt-month-chip" data-cs="'+__cs+'background:' + color + ';border-left-color:' + color + ';color:' + apptContrastText(color) + '" data-onclick="event.stopPropagation();editBreakBlock(\'' + entry.id + '\')" title="' + apptEsc(label) + '">'
      + apptFormat12h(entry.start).replace(':00', '') + ' ' + apptEsc(label) + '</div>'
  }
  const meta = apptVisitMeta(entry.visitType)
  return '<div class="appt-month-chip" data-cs="'+__cs+'background:' + meta.bg + ';border-left-color:' + apptStatusColor(apptNormalizeStatus(entry.status)) + '" '
    + apptHoverAttrs(entry.id)
    + 'data-oncontextmenu="apptOpenBlockContextMenu(event,\'' + entry.id + '\')" '
    + 'data-onclick="event.stopPropagation();editAppointment(\'' + entry.id + '\')">'
    + '<div class="appt-month-chip-time">' + apptFormat12h(entry.start).replace(':00', '') + ' ' + apptEsc(entry.patientName || 'Unnamed') + '</div>'
    + '<div class="appt-month-chip-visittype">' + apptEsc(apptVisitLabel(entry.visitType)) + '</div>'
    + '</div>'
}

function apptBuildMonthPanel(facility, compact) {
  const slug = apptFacilitySlug(facility)
  const weeks = apptMonthGridWeeks(apptCursorDate)
  const curMonth = apptCursorDate.getMonth()
  const todayISO = apptISODate(new Date())
  const rangeStartISO = apptISODate(weeks[0][0]), rangeEndISO = apptISODate(weeks[weeks.length - 1][6])
  const rangeCount = ctgAppointments.filter(a => apptFacilityOf(a) === facility && a.date >= rangeStartISO && a.date <= rangeEndISO).length
    + ctgBreakBlocks.filter(b => breakFacilityOf(b) === facility && b.date >= rangeStartISO && b.date <= rangeEndISO).length

  let h = '<div class="appt-facility-panel appt-month-panel' + (compact ? ' compact-month' : '') + '">'
  h += '<div class="appt-facility-head ' + slug + '">' + apptFacilityHeadLabel(facility) + '<span class="appt-facility-count">' + rangeCount + ' in view</span></div>'
  h += '<div class="appt-header appt-month-headerrow">' + APPT_DAY_NAMES.map(n => '<div class="appt-header-day">' + n + '</div>').join('') + '</div>'
  h += '<div class="appt-month-grid">'
  weeks.forEach(week => {
    h += '<div class="appt-month-week">'
    week.forEach(d => {
      const iso = apptISODate(d)
      const outside = d.getMonth() !== curMonth
      const isToday = iso === todayISO
      const dayEntries = apptCombinedEntries(iso, facility).sort((a, b) => apptMinutesFromTime(a.start) - apptMinutesFromTime(b.start))
      const shown = dayEntries.slice(0, 3)
      const extra = dayEntries.length - shown.length
      h += '<div class="appt-month-cell' + (outside ? ' outside' : '') + (isToday ? ' today' : '') + '" data-onclick="apptMonthCellClick(event,\'' + iso + '\',\'' + apptEsc(facility) + '\')" data-oncontextmenu="apptOpenContextMenu(event,\'' + iso + '\',\'09:00\',\'' + apptEsc(facility) + '\')">'
        + '<span class="appt-month-daynum" data-onclick="event.stopPropagation();apptGoToDay(\'' + iso + '\')">' + d.getDate() + '</span>'
      shown.forEach(entry => { h += apptMonthChipHTML(entry) })
      if (extra > 0) h += '<div class="appt-month-more" data-onclick="event.stopPropagation();apptGoToDay(\'' + iso + '\')">+' + extra + ' more</div>'
      h += '</div>'
    })
    h += '</div>'
  })
  h += '</div></div>'
  return h
}

function apptMonthCellClick(evt, iso, facility) { apptBlankSlotClick(iso, '09:00', facility) }

/* ---------- Agenda view ---------- */
function apptAgendaRowHTML(entry) {
  const slug = apptFacilitySlug(entry._kind === 'break' ? breakFacilityOf(entry) : apptFacilityOf(entry))
  if (entry._kind === 'break') {
    const color = apptBreakCategoryColor(entry.category)
    const label = breakLabel(entry)
    return '<tr class="appt-agenda-row" data-onclick="editBreakBlock(\'' + entry.id + '\')">'
      + '<td class="appt-agenda-time">' + apptFormat12h(entry.start) + ' – ' + apptFormat12h(entry.end) + '</td>'
      + '<td><span class="appt-agenda-fac-dot ' + slug + '"></span>' + apptEsc(breakFacilityOf(entry)) + '</td>'
      + '<td><span class="appt-legend-dot" data-cs="'+__cs+'background:' + color + ';display:inline-block;margin-right:5px"></span>' + apptEsc(label) + '</td>'
      + '<td class="appt-agenda-type">' + apptEsc(entry.category) + '</td>'
      + '</tr>'
  }
  const meta = apptVisitMeta(entry.visitType)
  return '<tr class="appt-agenda-row" ' + apptHoverAttrs(entry.id)
    + 'data-oncontextmenu="apptOpenBlockContextMenu(event,\'' + entry.id + '\')" '
    + 'data-onclick="editAppointment(\'' + entry.id + '\')">'
    + '<td class="appt-agenda-time">' + apptFormat12h(entry.start) + ' – ' + apptFormat12h(entry.end) + '</td>'
    + '<td><span class="appt-agenda-fac-dot ' + slug + '"></span>' + apptEsc(apptFacilityOf(entry)) + '</td>'
    + '<td><span class="appt-legend-dot" data-cs="'+__cs+'background:' + meta.dot + ';display:inline-block;margin-right:5px"></span>' + apptEsc(entry.patientName || 'Unnamed') + '</td>'
    + '<td class="appt-agenda-type">' + apptEsc(apptVisitLabel(entry.visitType)) + '</td>'
    + '</tr>'
}

function apptBuildAgendaView(days, visibleFacilities) {
  let rows = '', any = false
  days.forEach(d => {
    const iso = apptISODate(d)
    let dayEntries = []
    visibleFacilities.forEach(fac => { dayEntries = dayEntries.concat(apptCombinedEntries(iso, fac)) })
    dayEntries.sort((a, b) => apptMinutesFromTime(a.start) - apptMinutesFromTime(b.start))
    if (!dayEntries.length) return
    any = true
    rows += '<tr class="appt-agenda-daterow"><td colspan="4">' + APPT_DAY_NAMES_FULL[d.getDay()] + ', ' + APPT_MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + '</td></tr>'
    dayEntries.forEach(entry => { rows += apptAgendaRowHTML(entry) })
  })
  if (!any) return '<div data-cs="'+__cs+'padding:48px 20px;text-align:center;color:var(--muted);font-size:13px">No appointments in this range.</div>'
  return '<div class="appt-body-scroll"><table class="appt-agenda-table"><thead><tr><th>Time</th><th>Facility</th><th>Patient</th><th>Visit Type</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
}

/* ---------- modal: create / edit ---------- */
// Rooms come from the Rooms tab in Appointment Configs, each scoped to a
// facility. apptCfgLoad() is called directly rather than reading the
// module-level apptCfg, so this works even if Appointment Configs was never
// opened this session.
function apptRoomsForFacility(facility) {
  try {
    const cfg = (typeof apptCfgLoad === 'function') ? apptCfgLoad() : null
    const rooms = (cfg && Array.isArray(cfg.rooms)) ? cfg.rooms : []
    return rooms.filter(r => r.active !== false && (!facility || r.facility === facility)).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  } catch (e) { return [] }
}
function apptPopulateRoomSelect(facility, selected) {
  const sel = document.getElementById('apptRoom')
  if (!sel) return
  const rooms = apptRoomsForFacility(facility)
  sel.innerHTML = '<option value="">— Select —</option>'
    + rooms.map(r => '<option value="' + apptEsc(r.name) + '"' + (r.name === selected ? ' selected' : '') + '>' + apptEsc(r.name) + '</option>').join('')
  // A saved room from a facility that no longer lists it (config edited
  // after the fact) still shows as a real option rather than silently
  // reverting to blank.
  if (selected && !rooms.some(r => r.name === selected)) {
    sel.insertAdjacentHTML('beforeend', '<option value="' + apptEsc(selected) + '" selected>' + apptEsc(selected) + '</option>')
  }
  sel.value = selected || ''
}
function apptFacilityChange() {
  apptPopulateRoomSelect(document.getElementById('apptFacility').value, '')
  apptRoomChanged()
}

let apptTeleWanted = false      // what the checkbox says right now
let apptTeleExisting = null     // meetingId already attached to this booking

function apptRoomChanged() {
  const room = document.getElementById('apptRoom')
  const fac = document.getElementById('apptFacility')
  if (!room) return
  if (!apptTeleExisting && typeof window.apptRoomIsVideo === 'function') {
    apptTeleWanted = window.apptRoomIsVideo(room.value, fac ? fac.value : '')
  }
  apptSyncTelehealthRow()
}

window.apptRoomChanged = apptRoomChanged

window.apptToggleTelehealth = function () {
  if (apptTeleExisting) return
  apptTeleWanted = !apptTeleWanted
  apptSyncTelehealthRow()
}

function apptSyncTelehealthRow() {
  const row = document.getElementById('apptTeleRow')
  if (!row) return
  const roomSel = document.getElementById('apptRoom')
  const facSel = document.getElementById('apptFacility')
  const isVideoRoom = (typeof window.apptRoomIsVideo === 'function')
    && window.apptRoomIsVideo(roomSel ? roomSel.value : '', facSel ? facSel.value : '')

  if (apptTeleExisting) {
    row.innerHTML =
      '<div class="appt-tele appt-tele-live">'
      + '<div class="appt-tele-ico">' + APPT_TELE_ICON + '</div>'
      + '<div class="appt-tele-copy"><strong>Video room is open</strong>'
      + '<small>The patient joins from their link — no account needed.</small></div>'
      + '<div class="appt-tele-actions">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="apptCopyRoomLink()">Copy patient link</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="apptOpenRoom()">Open</button>'
        + '<button type="button" class="btn btn-ghost btn-sm acfg-del" data-onclick="apptRemoveRoom()">Remove</button>'
      + '</div></div>'
    return
  }
  row.innerHTML =
    '<label class="appt-tele' + (apptTeleWanted ? ' on' : '') + '" data-onclick="apptToggleTelehealth();return false">'
    + '<input type="checkbox" id="apptTelehealth"' + (apptTeleWanted ? ' checked' : '') + ' tabindex="-1">'
    + '<div class="appt-tele-ico">' + APPT_TELE_ICON + '</div>'
    + '<div class="appt-tele-copy"><strong>Video visit</strong>'
    + '<small>' + (isVideoRoom
        ? 'This room does video, so saving creates the meeting and the patient link.'
        : 'Creates a meeting room for this appointment with a link the patient can open.')
    + '</small></div></label>'
}

const APPT_TELE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'

/* Guest links are single-issue by design - only a hash is stored - so the link
   is re-minted on demand rather than kept anywhere it could leak. */
window.apptCopyRoomLink = async function () {
  if (!apptTeleExisting) return
  try {
    const d = await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(apptTeleExisting) + '/link', { method: 'POST' })
    const url = location.origin + location.pathname + '#mtg=' + encodeURIComponent(d.guestToken)
    await navigator.clipboard.writeText(url)
    showToast('Patient link copied — it replaces any link sent before', 'ok')
  } catch (e) { showToast(e.message || 'Could not create the link', 'err') }
}

window.apptOpenRoom = function () {
  if (!apptTeleExisting) return
  closeApptModal()
  if (typeof showPage === 'function') showPage('meetings')
}

window.apptRemoveRoom = async function () {
  if (!apptTeleExisting || !apptEditingId) return
  const ok = await ctgConfirm(
    'Remove the video room from this appointment? Any link already sent to the patient stops working. '
    + 'The room itself is kept, along with anything recorded in it.',
    { danger: true, okLabel: 'Remove room', title: 'Remove video room' }
  )
  if (!ok) return
  try {
    await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(apptEditingId) + '/room', { method: 'DELETE' })
  } catch (e) { showToast(e.message || 'Could not remove the room', 'err'); return }
  const a = ctgAppointments.find(x => x.id === apptEditingId)
  if (a) a.meetingId = null
  apptTeleExisting = null
  apptTeleWanted = false
  apptSyncTelehealthRow()
  renderAppointments()
  showToast('Video room removed', 'ok')
}

function apptPatientOptionsHTML(selectedId) {
  const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
  let h = '<option value="">— Not yet registered —</option>'
  list.forEach(p => {
    const name = (typeof naturalPatientName === 'function') ? naturalPatientName(p) : (p.demographics?.firstName + ' ' + p.demographics?.lastName)
    h += '<option value="' + apptEsc(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' + apptEsc(name) + '</option>'
  })
  return h
}

function apptPatientSelectChange() {
  const sel = document.getElementById('apptPatientSelect')
  const block = document.getElementById('apptNewPatientBlock')
  if (!sel || !block) return
  if (sel.value) {
    const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
    const p = list.find(x => x.id === sel.value)
    block.style.display = 'none'
    if (p) {
      const fac = document.getElementById('apptFacility')
      const cs = document.getElementById('apptCase')
      if (fac && p.demographics?.facility) fac.value = p.demographics.facility
      if (cs && p.demographics?.case) cs.value = p.demographics.case
    }
  } else {
    block.style.display = ''
  }
}

function apptSyncEndTime() {
  const start = document.getElementById('apptStart')
  const end = document.getElementById('apptEnd')
  if (!start || !end || !start.value) return
  const startMin = apptMinutesFromTime(start.value)
  const endMin = apptMinutesFromTime(end.value)
  if (endMin == null || endMin <= startMin) {
    const newEnd = Math.min(startMin + APPT_DEFAULT_MIN, 23 * 60 + 59)
    end.value = String(Math.floor(newEnd / 60)).padStart(2, '0') + ':' + String(newEnd % 60).padStart(2, '0')
  }
}

function apptClearNewPatientFields() {
  ['apptNewLastName', 'apptNewFirstName', 'apptNewMRN', 'apptNewDOB', 'apptNewLawFirm', 'apptNewAddressLine', 'apptNewAddressLine2', 'apptNewCityStateZip', 'apptNewEmail', 'apptNewMobile', 'apptNewDOI'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  const g = document.getElementById('apptNewGender'); if (g) g.selectedIndex = 0
}

function openApptModal(dateISO, timeHHMM, facility) {
  apptEditingId = null
  const modal = document.getElementById('apptModal')
  if (!modal) return
  if (typeof window.ctgRefreshLawFirmSelections === 'function') window.ctgRefreshLawFirmSelections()
  document.getElementById('apptModalTitle').textContent = 'New Appointment'
  document.getElementById('apptDeleteBtn').style.display = 'none'
  document.getElementById('apptPatientSelect').innerHTML = apptPatientOptionsHTML(null)
  apptClearNewPatientFields()
  document.getElementById('apptNewPatientBlock').style.display = ''
  document.getElementById('apptFacility').value = facility || (apptFacilityFilter !== 'both' ? apptFacilityFilter : APPT_FACILITIES[0])
  apptPopulateRoomSelect(document.getElementById('apptFacility').value, '')
  document.getElementById('apptCase').value = 'Neuro 1'
  const defaultDate = dateISO ? new Date(dateISO + 'T00:00:00') : (apptViewMode === 'day' ? apptCursorDate : new Date())
  document.getElementById('apptDate').value = apptMMDDYYYY(defaultDate)
  document.getElementById('apptStart').value = timeHHMM || '09:00'
  const startMin = apptMinutesFromTime(document.getElementById('apptStart').value) || (9 * 60)
  // Clamped, not wrapped - see apptSyncEndTime for why a plain `% 24` here
  // silently produced an unsavable default appointment for any late-evening
  // start time (this clinic books as late as 10:30-11:30 PM).
  const endMin = Math.min(startMin + APPT_DEFAULT_MIN, 23 * 60 + 59)
  document.getElementById('apptEnd').value = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0')
  document.getElementById('apptVisitType').value = 'Day 2 Exam_Neuro Only'
  apptPopulateStatusSelect('Unconfirmed')
  document.getElementById('apptNotes').value = ''
  apptTeleExisting = null
  apptTeleWanted = true
  apptRoomChanged()
  apptTeleWanted = true
  apptSyncTelehealthRow()
  modal.classList.add('show')
}

function editAppointment(id) {
  const a = ctgAppointments.find(x => x.id === id)
  if (!a) return
  apptEditingId = id
  const modal = document.getElementById('apptModal')
  if (!modal) return
  document.getElementById('apptModalTitle').textContent = 'Edit Appointment'
  document.getElementById('apptDeleteBtn').style.display = ''
  document.getElementById('apptPatientSelect').innerHTML = apptPatientOptionsHTML(a.patientId || null)
  apptClearNewPatientFields()
  document.getElementById('apptNewPatientBlock').style.display = a.patientId ? 'none' : ''
  document.getElementById('apptFacility').value = apptFacilityOf(a)
  apptPopulateRoomSelect(apptFacilityOf(a), a.room || '')
  document.getElementById('apptCase').value = a.case || 'Neuro 1'
  document.getElementById('apptDate').value = apptMMDDYYYY(new Date(a.date + 'T00:00:00'))
  document.getElementById('apptStart').value = a.start
  document.getElementById('apptEnd').value = a.end
  document.getElementById('apptVisitType').value = a.visitType
  apptPopulateStatusSelect(apptNormalizeStatus(a.status))
  document.getElementById('apptNotes').value = a.notes || ''
  apptTeleExisting = a.meetingId || null
  apptTeleWanted = !!a.meetingId
  apptSyncTelehealthRow()
  modal.classList.add('show')
}

function closeApptModal() {
  const modal = document.getElementById('apptModal')
  if (modal) modal.classList.remove('show')
  apptEditingId = null
}

/* Creates a lightweight patient record from the "New Patient Details" block
   mirrors saveRegistration()'s shape so the patient shows up in Patient Lists
   without the front desk having to re-enter the same person twice. */
function apptCreatePatientFromForm(facility, caseVal) {
  const lastName = document.getElementById('apptNewLastName').value.trim()
  const firstName = document.getElementById('apptNewFirstName').value.trim()
  if (!lastName || !firstName) return { error: 'Enter the new patient’s first and last name' }
  const d = {
    lastName, firstName,
    mrn: document.getElementById('apptNewMRN').value.trim(),
    dob: document.getElementById('apptNewDOB').value.trim(),
    gender: document.getElementById('apptNewGender').value,
    addressLine: document.getElementById('apptNewAddressLine').value.trim(),
    addressLine2: document.getElementById('apptNewAddressLine2').value.trim(),
    cityStateZip: document.getElementById('apptNewCityStateZip').value.trim(),
    email: document.getElementById('apptNewEmail').value.trim(),
    mobile: document.getElementById('apptNewMobile').value.trim(),
    doi: document.getElementById('apptNewDOI').value.trim(),
    lawFirm: document.getElementById('apptNewLawFirm').value.trim(),
    facility, provider: 'Nicholas Grande, DC', case: caseVal
  }
  const now = new Date().toISOString()
  const patient = {
    id: 'pt_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    demographics: d, pendingAce: false, ace: null,
    billing: { statementDate: '', accountNo: '', status: '', charges: '', notes: '' },
    notes: { text: '' }, createdAt: now, updatedAt: now
  }
  ctgPatients.push(patient)
  persistPatients()
  return { patient }
}

async function saveAppointment() {
  const facility = document.getElementById('apptFacility').value
  const caseVal = document.getElementById('apptCase').value
  let patientId = document.getElementById('apptPatientSelect').value || null
  let patientName = ''

  if (patientId) {
    const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
    const p = list.find(x => x.id === patientId)
    if (p) patientName = (typeof naturalPatientName === 'function') ? naturalPatientName(p) : ''
  } else {
    const result = apptCreatePatientFromForm(facility, caseVal)
    if (result.error) { showToast(result.error, 'err'); return }
    patientId = result.patient.id
    patientName = (typeof naturalPatientName === 'function') ? naturalPatientName(result.patient) : (result.patient.demographics.firstName + ' ' + result.patient.demographics.lastName)
  }

  const dateVal = apptParseMMDDYYYY(document.getElementById('apptDate').value.trim())
  const start = document.getElementById('apptStart').value
  const end = document.getElementById('apptEnd').value
  const visitType = document.getElementById('apptVisitType').value
  const status = document.getElementById('apptStatus').value
  const room = document.getElementById('apptRoom').value
  const notes = document.getElementById('apptNotes').value.trim()

  if (!dateVal) { showToast('Enter a valid appointment date', 'err'); return }
  if (!start || !end) { showToast('Set a start and end time', 'err'); return }
  const startMinVal = apptMinutesFromTime(start), endMinVal = apptMinutesFromTime(end)
  // A time field that fails to parse (null) used to fall through to the
  // comparison below anyway, where `null <= someNumber` coerces to `0 <=
  // someNumber` - always true - and reported "End time must be after start
  // time" for a problem that was never about ordering.
  if (startMinVal == null || endMinVal == null) { showToast('Enter valid start and end times', 'err'); return }
  if (endMinVal <= startMinVal) { showToast('End time must be after start time', 'err'); return }

  const dateISO = apptISODate(dateVal)
  // Same patient, same day, same start time is a duplicate, not a second
  // appointment - without this a double-click on Save (or re-saving a modal
  // that was already saved) silently created another identical booking, which
  // then showed up as repeated rows in Patient Encounters.
  const clash = ctgAppointments.find(x =>
    x.id !== apptEditingId && x.patientId === patientId && x.date === dateISO && x.start === start
  )
  if (clash) {
    showToast('This patient already has an appointment at that date and time', 'err')
    return
  }
  /* `telehealth` is only sent when it would change something. Sending false on
     every save would close the room of any appointment edited for an unrelated
     reason - a rescheduled visit would silently lose its patient link. */
  const payload = { patientId, patientName, date: dateISO, start, end, visitType, status, room, notes, facility, case: caseVal }
  if (apptTeleWanted && !apptTeleExisting) payload.telehealth = true
  let newToken = null
  try {
    if (apptEditingId) {
      const d = await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(apptEditingId), { method: 'PUT', body: JSON.stringify(payload) })
      const a = ctgAppointments.find(x => x.id === apptEditingId)
      if (a) Object.assign(a, d.appointment)
      newToken = d.guestToken || null
      showToast('Appointment updated', 'ok')
    } else {
      const d = await window.ctgApiFetch('/api/appointments', { method: 'POST', body: JSON.stringify(payload) })
      ctgAppointments.push(d.appointment)
      newToken = d.guestToken || null
      showToast('Appointment scheduled', 'ok')
    }
  } catch (e) { showToast(e.message || 'Could not save appointment', 'err'); return }
  closeApptModal()
  // The raw token is returned exactly once. Put it in front of whoever booked
  // the visit now, or it has to be re-issued later to be used at all.
  if (newToken) apptShowRoomLink(newToken)
  /* The server mirrors this visit onto the provider's calendar as it saves, so
     re-read the blocks before drawing. Other browsers get it from the
     data:appointments broadcast; without this the one that did the booking is
     the only one that cannot see the block it just created. */
  await loadBreakBlocks()
  renderAppointments()
  if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow()
}

/* The one moment the patient's link exists in the clear. Shown as a modal
   rather than a toast because it has to be copied, not just noticed. */
function apptShowRoomLink(token) {
  const url = location.origin + location.pathname + '#mtg=' + encodeURIComponent(token)
  const el = document.getElementById('apptRoomLinkModal') || (function () {
    const d = document.createElement('div')
    d.id = 'apptRoomLinkModal'
    d.className = 'modal-overlay'
    document.body.appendChild(d)
    return d
  })()
  el.className = 'modal-overlay show'
  el.innerHTML =
    '<div class="modal" data-cs="'+__cs+'width:min(560px,100%)">'
    + '<div class="modal-hd"><div><div class="modal-title">Video room created</div>'
      + '<div class="modal-sub">Send this link to the patient. They open it in a browser — no account, no app.</div></div>'
      + '<button class="modal-close" data-onclick="apptCloseRoomLink()">×</button></div>'
    + '<div class="modal-body">'
      + '<div class="appt-link-box" id="apptRoomLinkText">' + apptEsc(url) + '</div>'
      + '<div class="small-muted" data-cs="'+__cs+'margin-top:10px">Anyone with this link can knock at the room\'s lobby. '
      + 'You still admit them. If it is ever sent to the wrong person, re-issue it from the appointment and the old one stops working.</div>'
    + '</div>'
    + '<div class="modal-ft">'
      + '<button class="btn btn-ghost" data-onclick="apptCloseRoomLink()">Done</button>'
      + '<button class="btn btn-primary" data-onclick="apptCopyShownLink()">Copy link</button>'
    + '</div></div>'
}
window.apptCloseRoomLink = function () {
  const el = document.getElementById('apptRoomLinkModal')
  if (el) { el.className = 'modal-overlay'; el.innerHTML = '' }
}
window.apptCopyShownLink = function () {
  const t = document.getElementById('apptRoomLinkText')
  if (!t) return
  navigator.clipboard.writeText(t.textContent).then(
    function () { showToast('Link copied', 'ok'); apptCloseRoomLink() },
    function () { showToast('Copy failed — select the link and copy it manually', 'err') }
  )
}

const APPT_UNDO_PREFIX = 'ctg_appt_undo_'
const APPT_UNDO_WINDOW_MS = 60 * 60 * 1000 // one hour
let apptUndoTimer = null

function apptUndoAccountId() {
  try {
    const u = (typeof ctgCurrentUser === 'function') ? ctgCurrentUser() : null
    return (u && u.id) || 'anon'
  } catch (e) { return 'anon' }
}
function apptUndoKey() { return APPT_UNDO_PREFIX + apptUndoAccountId() }
function apptUndoLoad() {
  try {
    const list = JSON.parse(localStorage.getItem(apptUndoKey()) || '[]')
    const now = Date.now()
    const fresh = list.filter(e => e && (now - e.deletedAt) < APPT_UNDO_WINDOW_MS)
    if (fresh.length !== list.length) apptUndoSave(fresh) // prune expired
    return fresh
  } catch (e) { return [] }
}
function apptUndoSave(list) {
  try { localStorage.setItem(apptUndoKey(), JSON.stringify(list.slice(-10))) } catch (e) {}
}
function apptUndoPush(kind, data, label) {
  const list = apptUndoLoad()
  list.push({ kind, data, label, deletedAt: Date.now() })
  apptUndoSave(list)
}

async function apptUndoLast() {
  const list = apptUndoLoad()
  if (!list.length) { showToast('Nothing to undo, or the one-hour window has passed', 'err'); apptRenderUndo(); return }
  const entry = list[list.length - 1]
  try {
    if (entry.kind === 'appt') {
      const d = entry.data
      const payload = {
        patientId: d.patientId || null, patientName: d.patientName, date: d.date,
        start: d.start, end: d.end, visitType: d.visitType, status: d.status,
        room: d.room, notes: d.notes, facility: d.facility, case: d.case
      }
      // A telehealth appointment restores WITH a room, matching what was deleted.
      if (d.meetingId) payload.telehealth = true
      const res = await window.ctgApiFetch('/api/appointments', { method: 'POST', body: JSON.stringify(payload) })
      if (res && res.appointment) ctgAppointments.push(res.appointment)
    } else {
      const d = entry.data
      const res = await window.ctgApiFetch('/api/appointments/break-blocks', {
        method: 'POST',
        body: JSON.stringify({ facility: d.facility, schedule: d.schedule, category: d.category, label: d.label, date: d.date, start: d.start, end: d.end })
      })
      if (res && res.breakBlock) ctgBreakBlocks.push(res.breakBlock)
    }
  } catch (e) { showToast(e.message || 'Could not undo the delete', 'err'); return }
  list.pop(); apptUndoSave(list)
  renderAppointments()
  showToast('Restored ' + (entry.label || 'the deleted item'), 'ok')
}

/* Paints the toolbar Undo button from the current account's fresh undo stack,
   and schedules one re-render at the moment the newest entry expires so the
   button clears itself even on a page left open. */
function apptRenderUndo() {
  const slot = document.getElementById('apptUndoSlot')
  if (!slot) return
  const list = apptUndoLoad()
  if (apptUndoTimer) { clearTimeout(apptUndoTimer); apptUndoTimer = null }
  if (!list.length) { slot.innerHTML = ''; return }
  const newest = list[list.length - 1]
  const leftMs = APPT_UNDO_WINDOW_MS - (Date.now() - newest.deletedAt)
  const leftMin = Math.max(1, Math.round(leftMs / 60000))
  slot.innerHTML = '<button type="button" class="btn btn-ghost btn-sm appt-undo-btn" data-onclick="apptUndoLast()"'
    + ' title="Undo your last delete — available for one hour (' + leftMin + ' min left)">'
    + '<span class="appt-undo-ico">↩</span> Undo delete</button>'
  apptUndoTimer = setTimeout(function () { apptRenderUndo() }, Math.min(leftMs + 500, 0x7fffffff))
}

async function deleteAppointment() {
  if (!apptEditingId) return
  if (!(await ctgConfirm('Delete this appointment?', { danger: true, okLabel: 'Delete' }))) return
  const deleted = ctgAppointments.find(x => x.id === apptEditingId)
  try { await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(apptEditingId), { method: 'DELETE' }) }
  catch (e) { showToast(e.message || 'Could not delete appointment', 'err'); return }
  if (deleted) apptUndoPush('appt', deleted, (deleted.patientName || 'appointment') + ' at ' + apptFormat12h(deleted.start))
  ctgAppointments = ctgAppointments.filter(x => x.id !== apptEditingId)
  closeApptModal()
  renderAppointments()
  showToast('Appointment deleted', 'ok')
}

/* ---------- right-click context menu (Add Appointment / Break-Block) ---------- */
let apptCtxPending = null // {iso, time, facility} for whichever slot was right-clicked

function apptOpenContextMenu(evt, iso, time, facility) {
  evt.preventDefault()
  const menu = document.getElementById('apptContextMenu')
  if (!menu) return
  apptCtxPending = { iso, time, facility }
  const addAppointmentBtn = document.getElementById('apptContextAddAppointmentBtn')
  const addBreakBtn = document.getElementById('apptContextAddBreakBtn')
  const isGrande = facility === APPT_FACILITIES[1]
  if (addAppointmentBtn) addAppointmentBtn.style.display = isGrande ? 'none' : 'flex'
  if (addBreakBtn) addBreakBtn.style.display = isGrande ? 'flex' : 'none'
  // Keep the single-action menu on-screen even when the click is near an edge.
  const menuW = 200, menuH = 52
  const left = Math.min(evt.clientX, window.innerWidth - menuW - 8)
  const top = Math.min(evt.clientY, window.innerHeight - menuH - 8)
  menu.style.left = Math.max(8, left) + 'px'
  menu.style.top = Math.max(8, top) + 'px'
  menu.classList.add('show')
}
function apptCloseContextMenu() {
  const menu = document.getElementById('apptContextMenu')
  if (menu) menu.classList.remove('show')
  apptCtxPending = null
}
function apptContextAddAppointment() {
  if (!apptCtxPending) return
  const { iso, time, facility } = apptCtxPending
  apptCloseContextMenu()
  openApptModal(iso, time, facility)
}
function apptContextAddBreakBlock() {
  if (!apptCtxPending) return
  const { iso, time, facility } = apptCtxPending
  apptCloseContextMenu()
  openBreakBlockModal(iso, time, facility)
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('apptContextMenu')
  if (menu && menu.classList.contains('show') && !menu.contains(e.target)) apptCloseContextMenu()
})
document.addEventListener('contextmenu', (e) => {
  const menu = document.getElementById('apptContextMenu')
  if (menu && menu.classList.contains('show') && !e.target.closest('.appt-slot')) apptCloseContextMenu()
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') apptCloseContextMenu() })
document.addEventListener('scroll', () => apptCloseContextMenu(), true)

/* Right-click context menu on an appointment block: Edit Appointment, Status
   (Unconfirmed, Check-in, Reschedule, Missed, Cancel), Patient (Registration,
   Patient Chart, Patient Center, Print Appointment, Invite For Chat) and
   Delete Appointment. */
const APPT_STATUSES = ['Unconfirmed', 'Check-in', 'Reschedule', 'Missed', 'Cancelled']

const APPT_STATUS_COLORS = {
  'Unconfirmed': '#F5C518', // Yellow
  'Check-in':    '#0A6E3F', // Green
  'Reschedule':  '#7C3AED', // Violet (distinct from the blue therapy-visit tint)
  'Missed':      '#C2540A', // Orange
  'Cancelled':   '#E8112D'  // Red
}
function apptStatusColor(status) {
  if (typeof apptCfgLoad === 'function') {
    const row = apptCfgLoad().legendStatuses.find(s => s.name === status)
    if (row && row.color) return row.color
  }
  return APPT_STATUS_COLORS[status] || VISIT_TYPE_FALLBACK.border
}
/* All selectable statuses: the five built-ins plus any custom status added
   in Color Legend, so a custom entry there is actually assignable here. */
function apptStatusOptions() {
  const list = APPT_STATUSES.slice()
  if (typeof apptCfgLoad === 'function') {
    apptCfgLoad().legendStatuses.forEach(s => { if (!s.builtin && s.name && list.indexOf(s.name) === -1) list.push(s.name) })
  }
  return list
}
function apptPopulateStatusSelect(current) {
  const sel = document.getElementById('apptStatus')
  if (!sel) return
  sel.innerHTML = apptStatusOptions().map(s => '<option' + (s === current ? ' selected' : '') + '>' + apptEsc(s) + '</option>').join('')
  apptRenderStatusColorKey()
}

/* Rebuilt every time the modal opens (not cached) so an edit or addition made
   in Appointment Configs -> Color Legend shows up here immediately, the same
   way it already reaches the calendar block's accent color via apptStatusColor. */
function apptRenderStatusColorKey() {
  const mount = document.getElementById('apptModalStatusColorItems')
  if (!mount) return
  mount.innerHTML = apptStatusOptions().map(s =>
    '<span><i data-cs="'+__cs+'background:' + apptStatusColor(s) + '"></i>' + apptEsc(s) + '</span>'
  ).join('')
}

/* Anything that is not already one of the five current statuses folds into
   its closest equivalent. That covers genuinely old data and the fuller
   reference list that briefly lived here, so editing an appointment never
   lands the Status select on a value it no longer contains. */
function apptNormalizeStatus(status) {
  const map = {
    'Scheduled': 'Unconfirmed', 'UnConf': 'Unconfirmed', 'Confir': 'Unconfirmed',
    'Confirmed': 'Unconfirmed', 'Confirmed By Provider': 'Unconfirmed', 'Request': 'Unconfirmed',
    'Approved_Request': 'Unconfirmed', 'NotCheckedIn': 'Unconfirmed', 'Open Superbill': 'Unconfirmed',
    'Note': 'Unconfirmed',
    'Chk-in': 'Check-in', 'Patient Arrived (Portal)': 'Check-in', 'Arrived': 'Check-in',
    'Chk-out': 'Check-in', 'Check-out with Patient education material': 'Check-in',
    'Completed': 'Check-in', 'Superbill Finalized': 'Check-in', 'Claim Sent': 'Check-in',
    'Claim Finalized': 'Check-in', 'Non-Billable': 'Check-in',
    'RESCHEDULED': 'Reschedule',
    'No Show': 'Missed', 'No-Show': 'Missed',
    'Cancel': 'Cancelled', 'Deleted': 'Cancelled'
  }
  if (apptStatusOptions().indexOf(status) !== -1) return status
  return map[status] || 'Unconfirmed'
}

let apptBlockCtxId = null // appointment id the block menu is open for

function apptOpenBlockContextMenu(evt, apptId) {
  evt.preventDefault()
  evt.stopPropagation()
  const menu = document.getElementById('apptBlockContextMenu')
  const a = ctgAppointments.find(x => x.id === apptId)
  if (!menu || !a) return
  apptCloseContextMenu()       // the empty-slot menu, if it was open
  apptHideHoverCard()          // don't stack the hover card behind the menu
  clearTimeout(apptHoverTimer) // ...or let a pending one pop up over it
  apptBlockCtxId = apptId
  menu.innerHTML = apptBlockCtxHTML(a)
  // Keep the menu on-screen near the click; if the submenu flyout (opens to
  // the right) would run off the viewport, flip it to open leftward instead.
  const menuW = 210, menuH = 210, subW = 240
  const left = Math.max(8, Math.min(evt.clientX, window.innerWidth - menuW - 8))
  const top = Math.max(8, Math.min(evt.clientY, window.innerHeight - menuH - 8))
  menu.style.left = left + 'px'
  menu.style.top = top + 'px'
  menu.classList.toggle('flip-left', left + menuW + subW > window.innerWidth - 8)
  menu.classList.add('show')
}
function apptCloseBlockContextMenu() {
  const menu = document.getElementById('apptBlockContextMenu')
  if (menu) menu.classList.remove('show')
  apptBlockCtxId = null
}
function apptBlockCtxHTML(a) {
  const current = apptNormalizeStatus(a.status)
  let h = '<button type="button" data-onclick="apptBlockCtxEdit()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    + 'Edit Appointment</button>'
  h += '<div class="appt-ctx-sub"><button type="button">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    + 'Status<span class="appt-ctx-caret">▸</span></button>'
    + '<div class="appt-ctx-submenu appt-ctx-submenu-scroll">'
    + apptStatusOptions().map(s =>
      '<button type="button" class="' + (s === current ? 'active' : '') + '" data-onclick="apptBlockCtxSetStatus(\'' + apptEsc(s) + '\')">'
      + apptEsc(s) + (s === current ? '<span class="appt-ctx-check">✓</span>' : '') + '</button>'
    ).join('')
    + '</div></div>'
  h += '<button type="button" data-onclick="apptBlockCtxRegistration()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    + 'Registration</button>'
  h += '<button type="button" data-onclick="apptBlockCtxPatientComment()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    + 'Patient Comment</button>'
  h += '<button type="button" class="appt-ctx-danger" data-onclick="apptBlockCtxDelete()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
    + 'Delete Appointment</button>'
  return h
}
function apptBlockCtxEdit() {
  const id = apptBlockCtxId
  apptCloseBlockContextMenu()
  if (id) editAppointment(id)
}
let apptRescheduleCtxId = null
function apptFormat12hLower(hhmm) {
  const min = apptMinutesFromTime(hhmm)
  if (min == null) return ''
  let h = Math.floor(min / 60), m = min % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm
}
function apptFormatRescheduleDateTime(dateISO, timeHHMM) {
  const d = new Date(dateISO + 'T00:00:00')
  if (isNaN(d.getTime())) return String(dateISO || '') + (timeHHMM ? ' ' + apptFormat12hLower(timeHHMM) : '')
  return APPT_MONTH_NAMES_FULL[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' + apptFormat12hLower(timeHHMM)
}
function openApptRescheduleModal(apptId) {
  const a = ctgAppointments.find(x => x.id === apptId)
  if (!a) return
  if (!a.patientId) { showToast('Link a patient to this appointment before adding a reschedule comment', 'err'); return }
  apptRescheduleCtxId = apptId
  const modal = document.getElementById('apptRescheduleModal')
  if (!modal) return
  const current = document.getElementById('apptRescheduleCurrent')
  const dateInput = document.getElementById('apptRescheduleDate')
  const timeInput = document.getElementById('apptRescheduleTime')
  if (current) current.textContent = 'Current appointment: ' + apptFormatRescheduleDateTime(a.date, a.start)
  if (dateInput) dateInput.value = ''
  if (timeInput) timeInput.value = ''
  modal.classList.add('show')
}
function closeApptRescheduleModal() {
  const modal = document.getElementById('apptRescheduleModal')
  if (modal) modal.classList.remove('show')
  apptRescheduleCtxId = null
}
async function confirmApptReschedule() {
  const a = ctgAppointments.find(x => x.id === apptRescheduleCtxId)
  if (!a) { closeApptRescheduleModal(); return }
  const p = getPatient(a.patientId)
  if (!p) { showToast('Linked patient record was not found', 'err'); return }
  const dateInput = document.getElementById('apptRescheduleDate')
  const timeInput = document.getElementById('apptRescheduleTime')
  const newDate = apptParseMMDDYYYY((dateInput?.value || '').trim())
  const newTime = timeInput?.value || ''
  if (!newDate) { showToast('Enter a valid reschedule date', 'err'); return }
  if (!newTime) { showToast('Enter a reschedule time', 'err'); return }

  const who = (typeof window.ctgCurrentUser === 'function' && window.ctgCurrentUser()?.displayName) || 'Staff'
  const newDateISO = apptISODate(newDate)
  const oldText = apptFormatRescheduleDateTime(a.date, a.start)
  const newText = apptFormatRescheduleDateTime(newDateISO, newTime)
  const note = 'Rescheduled: ' + oldText + ' to ' + newText
  const now = new Date().toISOString()

  if (!Array.isArray(p.comments)) p.comments = []
  p.comments.push({
    id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    note, addedBy: who, addedAt: now, updatedBy: '', updatedAt: ''
  })
  p.updatedAt = now

  // Only spin up a new appointment on the target date if the patient doesn't
  // already have one there - otherwise the reschedule note above is enough
  // and a second block on the same day would just be a duplicate.
  const hasApptOnNewDate = ctgAppointments.some(x =>
    x.id !== a.id && x.patientId === a.patientId && x.date === newDateISO
  )
  try {
    const updated = await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(a.id), {
      method: 'PUT', body: JSON.stringify({ patientId: a.patientId, patientName: a.patientName, date: a.date, start: a.start, end: a.end, visitType: a.visitType, status: 'Reschedule', room: a.room, notes: a.notes, facility: a.facility, case: a.case })
    })
    Object.assign(a, updated.appointment)
    if (!hasApptOnNewDate) {
      const durationMin = apptMinutesFromTime(a.end) - apptMinutesFromTime(a.start)
      const startMin = apptMinutesFromTime(newTime)
      const endMin = Math.min(startMin + (durationMin > 0 ? durationMin : 30), 23 * 60 + 59)
      const newEnd = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0')
      const created = await window.ctgApiFetch('/api/appointments', {
        method: 'POST', body: JSON.stringify({ patientId: a.patientId, patientName: a.patientName, date: newDateISO, start: newTime, end: newEnd, visitType: a.visitType, status: 'Unconfirmed', notes: a.notes || '', facility: a.facility, case: a.case })
      })
      ctgAppointments.push(created.appointment)
    }
  } catch (e) { showToast(e.message || 'Could not reschedule appointment', 'err'); return }

  closeApptRescheduleModal()
  renderAppointments()
  showToast(hasApptOnNewDate ? 'Reschedule comment added' : 'Reschedule comment added and new appointment created', 'ok')
}
async function apptBlockCtxSetStatus(status) {
  const a = ctgAppointments.find(x => x.id === apptBlockCtxId)
  const id = apptBlockCtxId
  apptCloseBlockContextMenu()
  if (!a) return
  if (status === 'Reschedule') { openApptRescheduleModal(id); return }
  try {
    const updated = await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(a.id), {
      method: 'PUT', body: JSON.stringify({ patientId: a.patientId, patientName: a.patientName, date: a.date, start: a.start, end: a.end, visitType: a.visitType, status, room: a.room, notes: a.notes, facility: a.facility, case: a.case })
    })
    Object.assign(a, updated.appointment)
  } catch (e) { showToast(e.message || 'Could not update status', 'err'); return }
  renderAppointments()
  showToast('Status set to ' + status, 'ok')
}
async function apptBlockCtxDelete() {
  const id = apptBlockCtxId
  apptCloseBlockContextMenu()
  if (!id) return
  if (!(await ctgConfirm('Delete this appointment?', { danger: true, okLabel: 'Delete' }))) return
  try { await window.ctgApiFetch('/api/appointments/' + encodeURIComponent(id), { method: 'DELETE' }) }
  catch (e) { showToast(e.message || 'Could not delete appointment', 'err'); return }
  ctgAppointments = ctgAppointments.filter(x => x.id !== id)
  renderAppointments()
  if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow()
  showToast('Appointment deleted', 'ok')
}
let apptRegLinkApptId = null
function apptBlockCtxRegistration() {
  const a = ctgAppointments.find(x => x.id === apptBlockCtxId)
  apptCloseBlockContextMenu()
  if (!a) return
  showPage('registration')
  // Arm the link after showPage (which resets it on every navigation) so this
  // appointment stays linked for saveRegistration; the banner is shown below.
  apptRegLinkApptId = a.id
  // Sidebar stays on "Appointments" rather than jumping to "Patient
  // Registration" - this is a dedicated sub-step of the appointment
  // workflow, not a navigation away from it, so the nav highlight should
  // reflect where the user conceptually still is.
  document.querySelectorAll('.sidebar .side-link,.sidebar .side-sublink').forEach(el => el.classList.remove('active'))
  const apptNavLink = document.querySelector('.sidebar [data-page="appointment"]')
  if (apptNavLink) apptNavLink.classList.add('active')
  // Right-clicking a patient's name on the calendar edits that patient
  // directly - no picker. If the appointment already has a linked patient
  // record, load it into the form for editing; saving updates that record.
  const edited = (a.patientId && typeof regEditPatient === 'function') ? regEditPatient(a.patientId) : false
  if (!edited) {
    // No linked patient record yet (appointment was created with just a typed
    // name) - fall back to a new-patient form pre-filled from that name.
    const parts = String(a.patientName || '').trim().split(/\s+/).filter(Boolean)
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v }
    setVal('regFirstName', parts[0])
    setVal('regLastName', parts.slice(1).join(' '))
    const fac = document.getElementById('regFacility'); if (fac && a.facility) fac.value = a.facility
    const cs = document.getElementById('regCase'); if (cs && a.case) cs.value = a.case
  }
  const banner = document.getElementById('regApptLinkBanner')
  const text = document.getElementById('regApptLinkText')
  if (banner && text) {
    // textContent is safe by itself here - no HTML-escaping needed (that's
    // only for the innerHTML string-building used elsewhere in this file).
    const who = String(a.patientName || 'patient').trim()
    text.textContent = edited
      ? 'Editing ' + who + ' for the ' + apptFormat12h(a.start) + ' ' + apptVisitLabel(a.visitType || '') + ' appointment on ' + a.date + ' — saving updates their record.'
      : 'Registering ' + who + ' for the ' + apptFormat12h(a.start) + ' ' + apptVisitLabel(a.visitType || '') + ' appointment on ' + a.date + ' — saving links them to this appointment.'
    banner.style.display = ''
  }
}
/* Patient Comment from the right-click menu only makes sense once the
   appointment has an actual linked patient record (comments live on the
   patient, not the appointment) - an appointment created with just a typed
   name has nothing to attach a comment to yet. */
function apptBlockCtxPatientComment() {
  const a = ctgAppointments.find(x => x.id === apptBlockCtxId)
  apptCloseBlockContextMenu()
  if (!a) return
  if (!a.patientId) { showToast('Link a patient to this appointment first (see Registration)', 'err'); return }
  patientCommentsOpenFor(a.patientId)
}
function apptCancelRegistrationLink() {
  apptRegLinkApptId = null
  const banner = document.getElementById('regApptLinkBanner')
  if (banner) banner.style.display = 'none'
  if (typeof clearRegistrationForm === 'function') clearRegistrationForm()
  showPage('appointment')
}
/* Patient Comments: a per-patient note log of status, free text and who
   added or updated it. Stored on patient.comments as an array of
   { id, note, status, addedBy, addedAt, updatedBy, updatedAt }. */
let pcPatientId = null
let pcEditingId = null

function patientCommentsOpenFor(patientId) {
  const p = getPatient(patientId)
  if (!p) { showToast('No linked patient yet — save/select a patient first', 'err'); return }
  pcPatientId = patientId
  pcEditingId = null
  const modal = document.getElementById('patientCommentsModal')
  if (!modal) return
  const summary = document.getElementById('pcSummary')
  if (summary) {
    const dem = p.demographics || {}
    summary.textContent = naturalPatientName(p) + (dem.dob ? ' — DOB ' + dem.dob : '') + (dem.mobile ? ' — Mobile# ' + dem.mobile : '')
  }
  patientCommentsShowList()
  modal.classList.add('show')
}
function closePatientCommentsModal() {
  const modal = document.getElementById('patientCommentsModal')
  if (modal) modal.classList.remove('show')
  pcPatientId = null
}
function patientCommentsShowList() {
  document.getElementById('pcEditorView').style.display = 'none'
  document.getElementById('pcListView').style.display = ''
  patientCommentsRenderTable()
}
function patientCommentsRenderTable() {
  const p = getPatient(pcPatientId)
  const wrap = document.getElementById('pcTableWrap')
  if (!p || !wrap) return
  const list = (p.comments || []).slice().sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
  if (!list.length) { wrap.innerHTML = '<div data-cs="'+__cs+'padding:24px;text-align:center;color:var(--muted);font-size:12.5px">No records to display.</div>'; return }
  // table-layout:fixed + a colgroup so a long unbroken note token wraps within
  // its own column (overflow-wrap:anywhere) instead of blowing the table wide
  // and bleeding over the neighboring columns.
  wrap.innerHTML = '<table class="dtable" data-cs="'+__cs+'table-layout:fixed;width:100%">'
    + '<colgroup><col data-cs="'+__cs+'width:32%"><col data-cs="'+__cs+'width:14%"><col data-cs="'+__cs+'width:18%"><col data-cs="'+__cs+'width:12%"><col data-cs="'+__cs+'width:12%"><col data-cs="'+__cs+'width:12%"></colgroup>'
    + '<tr><th>Note</th><th>Added By</th><th>Added Date</th><th>Updated By</th><th>Updated Date</th><th></th></tr>'
    + list.map(c => '<tr>'
      + '<td data-cs="'+__cs+'white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word">' + apptEsc(c.note) + '</td>'
      + '<td data-cs="'+__cs+'overflow-wrap:anywhere">' + apptEsc(c.addedBy) + '</td>'
      + '<td>' + apptEsc(new Date(c.addedAt).toLocaleString()) + '</td>'
      + '<td data-cs="'+__cs+'overflow-wrap:anywhere">' + apptEsc(c.updatedBy || '') + '</td>'
      + '<td>' + (c.updatedAt ? apptEsc(new Date(c.updatedAt).toLocaleString()) : '') + '</td>'
      + '<td><div data-cs="'+__cs+'display:flex;flex-direction:column;gap:5px">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="patientCommentsEdit(\'' + c.id + '\')">Edit</button>'
        + '<button type="button" class="btn btn-ghost btn-sm pc-del-btn" data-onclick="patientCommentsDelete(\'' + c.id + '\')">Delete</button>'
      + '</div></td>'
      + '</tr>').join('')
    + '</table>'
}
function patientCommentsShowEditor() {
  pcEditingId = null
  document.getElementById('pcNoteText').value = ''
  document.getElementById('pcListView').style.display = 'none'
  document.getElementById('pcEditorView').style.display = ''
}
function patientCommentsEdit(id) {
  const p = getPatient(pcPatientId)
  const c = (p?.comments || []).find(x => x.id === id)
  if (!c) return
  pcEditingId = id
  document.getElementById('pcNoteText').value = c.note
  document.getElementById('pcListView').style.display = 'none'
  document.getElementById('pcEditorView').style.display = ''
}
function patientCommentsCancelEditor() { patientCommentsShowList() }
function patientCommentsSaveNote() {
  const p = getPatient(pcPatientId)
  if (!p) return
  const note = document.getElementById('pcNoteText').value.trim()
  if (!note) { showToast('Enter a note', 'err'); return }
  const who = (typeof window.ctgCurrentUser === 'function' && window.ctgCurrentUser()?.displayName) || 'Staff'
  if (!p.comments) p.comments = []
  if (pcEditingId) {
    const c = p.comments.find(x => x.id === pcEditingId)
    if (c) { c.note = note; c.updatedBy = who; c.updatedAt = new Date().toISOString() }
  } else {
    p.comments.push({ id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), note, addedBy: who, addedAt: new Date().toISOString(), updatedBy: '', updatedAt: '' })
  }
  p.updatedAt = new Date().toISOString()
  persistPatients()
  showToast('Comment saved', 'ok')
  patientCommentsShowList()
}
async function patientCommentsDelete(id) {
  const p = getPatient(pcPatientId)
  if (!p) return
  if (!(await ctgConfirm('Delete this comment?', { danger: true, okLabel: 'Delete' }))) return
  p.comments = (p.comments || []).filter(x => x.id !== id)
  p.updatedAt = new Date().toISOString()
  persistPatients()
  showToast('Comment deleted', 'ok')
  patientCommentsRenderTable()
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('apptBlockContextMenu')
  if (menu && menu.classList.contains('show') && !menu.contains(e.target)) apptCloseBlockContextMenu()
})
document.addEventListener('contextmenu', (e) => {
  const menu = document.getElementById('apptBlockContextMenu')
  if (menu && menu.classList.contains('show') && !menu.contains(e.target) && !e.target.closest('.appt-block')) apptCloseBlockContextMenu()
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') apptCloseBlockContextMenu() })
document.addEventListener('scroll', () => apptCloseBlockContextMenu(), true)

/* ---------- Break/Block modal ---------- */
/* Live-updates the "Detected as X" preview as the admin types, so the color
   that's about to be used is obvious before saving. */
// Rebuilds the "Break / Block Colors" key from apptCfg.breakBlockTexts, so an
// edited built-in color or an added custom category shows up here too.
function apptRenderBreakColorKey() {
  const mount = document.getElementById('breakColorKeyItems')
  if (!mount || typeof apptCfgLoad !== 'function') return
  const rows = apptCfgLoad().breakBlockTexts.filter(s => s.active !== false).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
  mount.innerHTML = rows.map(s => '<span><i data-cs="'+__cs+'background:' + apptEsc(s.color) + '"></i>' + apptEsc(s.name) + '</span>').join('')
}
// The trigger keywords ("ACE", "Sway", "Epley's"...) live in the agenda, not
// a patient's name, so detection reads the Agenda field alone - same as what
// saveBreakBlock uses to build the real category and the composed label.
function breakPreviewColor() {
  apptRenderBreakColorKey()
  const text = document.getElementById('breakAgendaInput').value
  const category = apptDetectBreakCategory(text)
  const color = apptBreakCategoryColor(category)
  const dot = document.getElementById('breakColorDot')
  const lbl = document.getElementById('breakColorLabel')
  if (dot) dot.style.background = color
  if (lbl) lbl.textContent = category
}

function breakSyncEndTime() {
  const start = document.getElementById('breakStart')
  const end = document.getElementById('breakEnd')
  if (!start || !end || !start.value) return
  const startMin = apptMinutesFromTime(start.value)
  const endMin = apptMinutesFromTime(end.value)
  if (endMin == null || endMin <= startMin) {
    const newEnd = Math.min(startMin + BREAK_DEFAULT_MIN, 23 * 60 + 59)
    end.value = String(Math.floor(newEnd / 60)).padStart(2, '0') + ':' + String(newEnd % 60).padStart(2, '0')
  }
}

function breakPatientOptionsHTML() {
  const list = (typeof sortedPatients === 'function') ? sortedPatients() : []
  let h = '<option value="">N/A</option>'
  list.forEach(p => {
    const name = (typeof naturalPatientName === 'function') ? naturalPatientName(p) : (p.demographics?.firstName + ' ' + p.demographics?.lastName)
    h += '<option value="' + apptEsc(name) + '">' + apptEsc(name) + '</option>'
  })
  return h
}

function openBreakBlockModal(dateISO, timeHHMM, facility) {
  breakEditingId = null
  const modal = document.getElementById('breakBlockModal')
  if (!modal) return
  document.getElementById('breakModalTitle').textContent = 'New Break / Block'
  document.getElementById('breakDeleteBtn').style.display = 'none'
  document.getElementById('breakFacility').value = facility || (apptFacilityFilter !== 'both' ? apptFacilityFilter : APPT_FACILITIES[0])
  document.getElementById('breakSchedule').value = breakCurrentAccountName()
  document.getElementById('breakPatientSelect').innerHTML = breakPatientOptionsHTML()
  document.getElementById('breakPatientSelect').value = ''
  document.getElementById('breakAgendaInput').value = ''
  breakPreviewColor()
  const defaultDate = dateISO ? new Date(dateISO + 'T00:00:00') : (apptViewMode === 'day' ? apptCursorDate : new Date())
  document.getElementById('breakDate').value = apptMMDDYYYY(defaultDate)
  document.getElementById('breakStart').value = timeHHMM || '09:00'
  const startMin = apptMinutesFromTime(document.getElementById('breakStart').value) || (9 * 60)
  // Clamped, not wrapped - same fix as openApptModal/apptSyncEndTime: a
  // plain `% 24` here silently produced an unsavable default block for any
  // late-evening start time.
  const endMin = Math.min(startMin + BREAK_DEFAULT_MIN, 23 * 60 + 59)
  document.getElementById('breakEnd').value = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0')
  modal.classList.add('show')
}

function editBreakBlock(id) {
  const b = ctgBreakBlocks.find(x => x.id === id)
  if (!b) return
  breakEditingId = id
  const modal = document.getElementById('breakBlockModal')
  if (!modal) return
  document.getElementById('breakModalTitle').textContent = 'Edit Break / Block'
  document.getElementById('breakDeleteBtn').style.display = ''
  document.getElementById('breakFacility').value = breakFacilityOf(b)
  document.getElementById('breakSchedule').value = b.schedule || breakCurrentAccountName()
  document.getElementById('breakPatientSelect').innerHTML = breakPatientOptionsHTML()
  const parsed = breakParseLabel(breakLabel(b), b.category)
  document.getElementById('breakPatientSelect').value = parsed.patientName
  document.getElementById('breakAgendaInput').value = parsed.agenda
  breakPreviewColor()
  document.getElementById('breakDate').value = apptMMDDYYYY(new Date(b.date + 'T00:00:00'))
  document.getElementById('breakStart').value = b.start
  document.getElementById('breakEnd').value = b.end
  modal.classList.add('show')
}

function closeBreakBlockModal() {
  const modal = document.getElementById('breakBlockModal')
  if (modal) modal.classList.remove('show')
  breakEditingId = null
}

async function saveBreakBlock() {
  const facility = document.getElementById('breakFacility').value
  const schedule = document.getElementById('breakSchedule').value || breakCurrentAccountName()
  const patientName = document.getElementById('breakPatientSelect').value
  const agenda = document.getElementById('breakAgendaInput').value.trim()
  if (!patientName && !agenda) { showToast('Pick a patient or enter an agenda', 'err'); return }
  // Category comes from the agenda alone (see breakPreviewColor); the label
  // actually saved is the two reconnected the same way the tile shows them.
  const category = apptDetectBreakCategory(agenda)
  const label = apptComposeBreakLabel(category, patientName, agenda)

  const dateVal = apptParseMMDDYYYY(document.getElementById('breakDate').value.trim())
  const start = document.getElementById('breakStart').value
  const end = document.getElementById('breakEnd').value
  if (!dateVal) { showToast('Enter a valid date', 'err'); return }
  if (!start || !end) { showToast('Set a start and end time', 'err'); return }
  const startMinVal = apptMinutesFromTime(start), endMinVal = apptMinutesFromTime(end)
  if (startMinVal == null || endMinVal == null) { showToast('Enter valid start and end times', 'err'); return }
  if (endMinVal <= startMinVal) { showToast('End time must be after start time', 'err'); return }

  const dateISO = apptISODate(dateVal)
  const payload = { facility, schedule, category, label, date: dateISO, start, end }
  try {
    if (breakEditingId) {
      const d = await window.ctgApiFetch('/api/appointments/break-blocks/' + encodeURIComponent(breakEditingId), { method: 'PUT', body: JSON.stringify(payload) })
      const b = ctgBreakBlocks.find(x => x.id === breakEditingId)
      if (b) Object.assign(b, d.breakBlock)
      showToast('Break/Block updated', 'ok')
    } else {
      const d = await window.ctgApiFetch('/api/appointments/break-blocks', { method: 'POST', body: JSON.stringify(payload) })
      ctgBreakBlocks.push(d.breakBlock)
      showToast('Break/Block scheduled', 'ok')
    }
  } catch (e) { showToast(e.message || 'Could not save break/block', 'err'); return }
  closeBreakBlockModal()
  renderAppointments()
}

async function deleteBreakBlock() {
  if (!breakEditingId) return
  if (!(await ctgConfirm('Delete this break/block entry?', { danger: true, okLabel: 'Delete' }))) return
  const deleted = ctgBreakBlocks.find(x => x.id === breakEditingId)
  try { await window.ctgApiFetch('/api/appointments/break-blocks/' + encodeURIComponent(breakEditingId), { method: 'DELETE' }) }
  catch (e) { showToast(e.message || 'Could not delete break/block', 'err'); return }
  if (deleted) apptUndoPush('break', deleted, breakLabel(deleted) || 'break/block')
  ctgBreakBlocks = ctgBreakBlocks.filter(x => x.id !== breakEditingId)
  closeBreakBlockModal()
  renderAppointments()
  showToast('Break/Block deleted', 'ok')
}

function ctgFindDuplicateAppointments() {
  const seen = new Map()
  const dupes = []
  ctgAppointments.slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .forEach(a => {
      const key = [a.patientId, a.date, a.start].join('|')
      if (seen.has(key)) dupes.push(a); else seen.set(key, a)
    })
  return dupes
}
async function ctgRemoveDuplicateAppointments() {
  const dupes = ctgFindDuplicateAppointments()
  if (!dupes.length) { showToast('No duplicate appointments found', 'ok'); return 0 }
  const ok = await ctgConfirm(
    'Remove ' + dupes.length + ' duplicate appointment' + (dupes.length === 1 ? '' : 's') + '?\n\n'
    + 'These are exact repeats — same patient, same date, same start time. The original of each is kept.',
    { title: 'Remove Duplicates', danger: true, okLabel: 'Remove' })
  if (!ok) return 0
  const ids = new Set(dupes.map(d => d.id))
  await Promise.all(Array.from(ids).map(id =>
    window.ctgApiFetch('/api/appointments/' + encodeURIComponent(id), { method: 'DELETE' }).catch(e => console.error('Could not delete duplicate ' + id, e))
  ))
  ctgAppointments = ctgAppointments.filter(a => !ids.has(a.id))
  if (typeof renderAppointments === 'function') renderAppointments()
  if (typeof renderPatientEncounters === 'function') renderPatientEncounters()
  if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow()
  showToast(dupes.length + ' duplicate appointment' + (dupes.length === 1 ? '' : 's') + ' removed', 'ok')
  return dupes.length
}
