/* Analytics page (17 Nov 2026). Counts only, minimal text.
 *
 *   Compliance          FCRs sent, FCRs pending (from the charts),
 *                       Outreach in progress (counted from the Outreach tab:
 *                       email referrals not yet accepted; hover for the names)
 *   Patients to submit  active patients still missing a Valid ID, an Intake
 *                       Form, an Auto Insurance Card
 *
 * The counts come from GET /api/analytics/summary, which returns numbers and
 * never a name.
 *   Technical Assistant Appointment Adherence by month (or the date range),
 *                       worked out by CTG One from the appointment book
 *                       (/api/analytics/adherence-weeks): per week, patients,
 *                       scheduled (not Cancelled), completed (Check-in); every
 *                       rate here is completed / scheduled. Nothing is typed in.
 *
 * Technical Assistant also has, from the appointment book (no names):
 * Yesterday / Today / Current month, and a Patient detail table: each
 * patient's adherence for two weeks - from the appointment book, or set by hand
 * where staff override it - with the movement between them
 * (/api/analytics/adherence; names, so the server audits each view).
 *
 * Date filter (From / To, 17 Nov 2026) applies to the whole page: the server
 * filters the counts (sent date, discharge date, registration date) and
 * Appointment Adherence covers the range. Outreach in progress is current,
 * not by date, so it is not filtered.
 *
 * Listeners are attached here (no inline handlers: the CSP forbids them).
 */
(function () {
  'use strict'

  var state = { summary: null, error: '', loading: false,
    aw: null, awErr: '', awMonth: '', from: '', to: '',
    appt: null, pd: null, pdErr: '', pdTab: 'all', pdSearch: '', pdSort: { key: 'patient', dir: 1 }, pdEdit: null, pdSaving: false, pdWeeks: null }
  var RANGE_KEY = 'ctg_analytics_range_v1'   // per-browser convenience: the last range picked
  try { var _r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); if (_r) { state.from = _r.from || ''; state.to = _r.to || '' } } catch (e) {}
  function saveRange() { try { localStorage.setItem(RANGE_KEY, JSON.stringify({ from: state.from, to: state.to })) } catch (e) {} }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  function presetRange(name) {
    var t = new Date(), y = t.getFullYear(), m = t.getMonth()
    // This week: Monday (the page's weeks start on Monday) up to today.
    if (name === 'week') return { from: iso(new Date(y, m, t.getDate() - ((t.getDay() + 6) % 7))), to: iso(t) }
    if (name === 'month') return { from: iso(new Date(y, m, 1)), to: iso(t) }
    if (name === 'last') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    if (name === '90') { var a = new Date(t); a.setDate(a.getDate() - 89); return { from: iso(a), to: iso(t) } }
    if (name === 'year') return { from: iso(new Date(y, 0, 1)), to: iso(t) }
    return { from: '', to: '' }
  }
  function activePreset() {
    var names = ['week', 'month', 'last', '90', 'year', 'all']
    for (var i = 0; i < names.length; i++) { var r = presetRange(names[i]); if (r.from === state.from && r.to === state.to) return names[i] }
    return ''
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  function monthName(key) { var m = /^(\d{4})-(\d{2})$/.exec(key || ''); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : key }
  function f2(n) { return (Math.round(n * 100) / 100).toFixed(2) }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
    })
  }
  function api(url, opts) { return window.ctgApiFetch(url, opts) }
  function toast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || '') }
  function timeOf(iso) {
    var d = iso ? new Date(iso) : null
    if (!d || isNaN(d)) return ''
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  // The parts of this page an account may see (Access Control, 19 Nov 2026); all when none are set.
  function can(part) { return typeof window.ctgCanSection !== 'function' || window.ctgCanSection('analytics', part) }
  function none() { return Promise.resolve(null) }

  function load() {
    state.loading = true
    state.error = ''
    paint()
    return Promise.all([
      can('an.compliance') ? api('/api/analytics/summary' + rangeQuery()) : none(),
      can('an.appointments') ? loadAdherenceWeeks(true) : none(),
      can('an.appointments') ? api('/api/analytics/appointments' + rangeQuery()).catch(function () { return null }) : none(),
      can('an.patients') ? loadPatientDetail(true) : none()
    ]).then(function (r) {
      state.appt = r[2] || null
      state.summary = r[0] || null
    }).catch(function (e) {
      state.error = (e && e.message) || 'Could not load.'
    }).then(function () {
      state.loading = false
      paint()
    })
  }

  /* ---- look (18 Nov 2026): frosted glass on a soft colour wash, big numbers,
     short labels, no icons - buttons say what they do. ---- */
  function pct(n, of) { return of > 0 ? Math.round((n / of) * 100) : 0 }

  /* The number strip under the heading (18 Nov 2026, the practice's reference): a label
     over a rounded pill, and the active-patient count large on the right. FCRs sent /
     pending are in the FCR status donut (the strip's copies were removed, user 18 Nov). */
  function kpiStrip(s, ranged) {
    var pill = function (label, inner, cls, title) {
      return '<div class="an-kpi' + (cls ? ' ' + cls : '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="an-kpi-k">' + esc(label) + '</div><div class="an-kpi-pill">' + inner + '</div></div>'
    }
    // Outreach in progress: counted from the Outreach tab (email referrals not yet accepted);
    // hover, focus or tap for the names, as on Patients to submit.
    var n = (s.outreach && s.outreach.inProgress) || 0
    var hov = n > 0 && can('an.names')
    return '<section class="an-kpis" aria-label="Compliance">'
      + '<div class="an-kpi an-kpi-outreach' + (hov ? ' an-row-who' : '') + '"' + (hov ? ' data-need="outreach" tabindex="0" aria-describedby="anWho-outreach"' : '') + '>'
      + '<div class="an-kpi-k">Outreach in progress</div>'
      + '<div class="an-kpi-pill"><span class="an-kpi-v">' + esc(n) + '</span><span class="an-kpi-hint">' + (n ? 'email referrals waiting' : 'none waiting') + '</span></div>'
      + (hov ? '<div class="an-who" id="anWho-outreach" role="tooltip"></div>' : '')
      + '</div>'
      + '<div class="an-kpi-big"><div class="an-kpi-bigv">' + esc(s.active) + '</div><div class="an-kpi-bigt"><div class="an-kpi-bigk">Active patients</div><div class="an-kpi-bigs">' + (ranged ? 'registered in this range' : 'in the portal') + '</div></div></div>'
      + '</section>'
  }

  /* "Patients to submit": hover a row (or focus / tap it) to see who has not submitted.
     The names are fetched only then (GET /api/analytics/missing, audited) and kept
     until the next refresh or date change. */
  var who = {}   // item|from|to -> { total, patients } or 'loading' or { err }
  function whoKey(item) { return item + '|' + (state.from || '') + '|' + (state.to || '') }
  /* Any count can carry a hover list (19 Nov 2026: FCR Sent / Pending, the appointment rows):
     the element gets data-need=<item> and its own heading; nothing when the count is 0. */
  function whoHost(cls, item, head, n, inner) {
    if (!n || !can('an.names')) return '<div class="' + cls + '">' + inner + '</div>'
    var id = 'anWho-' + String(item).replace(/[^a-z0-9]/gi, '-')
    return '<div class="' + cls + ' an-row-who" data-need="' + esc(item) + '" data-who-head="' + esc(head) + '" tabindex="0" aria-describedby="' + id + '">'
      + inner + '<div class="an-who" id="' + id + '" role="tooltip"></div></div>'
  }
  function whenLabel(w) {
    var m = /^(?:(\d{4})-(\d{2})-(\d{2}))?\s*(?:(\d{1,2}):(\d{2}))?$/.exec(String(w || '').trim())
    if (!m) return String(w || '')
    var out = []
    if (m[1]) out.push(MONTHS[+m[2] - 1].slice(0, 3) + ' ' + (+m[3]))
    if (m[4]) { var h = +m[4]; out.push((h % 12 || 12) + ':' + m[5] + (h < 12 ? ' AM' : ' PM')) }
    return out.join(' · ')
  }
  function whoFill(box, item) {
    var w = who[whoKey(item)]
    while (box.firstChild) box.removeChild(box.firstChild)
    var add = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; box.appendChild(e); return e }
    if (!w || w === 'loading') { add('div', 'an-who-muted', 'Loading…'); return }
    if (w.err) { add('div', 'an-who-muted', w.err); return }
    var host = box.closest ? box.closest('[data-need]') : null
    var head = (host && host.getAttribute('data-who-head')) || (item === 'outreach' ? 'In progress' : 'Not yet submitted')
    add('div', 'an-who-head', head + ' · ' + w.total)
    if (!w.patients.length) { add('div', 'an-who-muted', item === 'outreach' ? 'None waiting.' : /^(id|intake|aic)$/.test(item) ? 'Everyone has.' : 'None.'); return }
    var ul = add('ul', 'an-who-list')
    w.patients.forEach(function (p) {
      var li = document.createElement('li'), who = document.createElement('span')
      who.className = 'an-who-name'; who.textContent = p.name
      // The visit type, small, under the name (appointment lists).
      if (p.type) { var ty = document.createElement('span'); ty.className = 'an-who-type'; ty.textContent = p.type; who.appendChild(ty) }
      li.appendChild(who)
      if (p.when) { var t = document.createElement('span'); t.className = 'an-who-when'; t.textContent = whenLabel(p.when); li.appendChild(t) }
      ul.appendChild(li)
    })
    if (w.total > w.patients.length) add('div', 'an-who-muted', '+ ' + (w.total - w.patients.length) + ' more')
  }
  function whoOpen(row) {
    var item = row.getAttribute('data-need'), box = row.querySelector('.an-who')
    if (!item || !box) return
    var k = whoKey(item)
    if (who[k] && who[k] !== 'loading' && !who[k].err) { whoFill(box, item); return }
    if (who[k] === 'loading') return
    who[k] = 'loading'; whoFill(box, item)
    var q = '/api/analytics/missing?item=' + encodeURIComponent(item) + (state.from ? '&from=' + state.from : '') + (state.to ? '&to=' + state.to : '')
    api(q).then(function (r) { who[k] = { total: r.total || 0, patients: Array.isArray(r.patients) ? r.patients : [] } })
      .catch(function (e) { who[k] = { err: (e && e.message) || 'Could not load the names.' } })
      .then(function () {
        var live = document.querySelector('#analyticsMount .an-row-who[data-need="' + item + '"] .an-who')
        if (live) whoFill(live, item)
      })
  }
  function onOver(ev) {
    var row = ev.target && ev.target.closest ? ev.target.closest('.an-row-who[data-need]') : null
    if (row) whoOpen(row)
  }

  // One row of "Patients to submit", laid out like a region row: name, status, a meter.
  function needRow(key, name, full, missing, active) {
    var share = pct(missing, active)
    var ok = missing === 0
    var hover = missing > 0 && can('an.names')
    return '<div class="an-row' + (hover ? ' an-row-who' : '') + '"' + (hover ? ' data-need="' + key + '" tabindex="0" aria-describedby="anWho-' + key + '"' : '') + '>'
      + '<div class="an-row-name"><div class="an-row-title">' + esc(name) + '</div><div class="an-row-sub">' + esc(full) + '</div></div>'
      + '<span class="an-pill ' + (ok ? 'an-pill-ok' : 'an-pill-warn') + '"><i></i>' + (ok ? 'All in' : 'Missing') + '</span>'
      + '<div class="an-row-metric"><div class="an-row-k">Patients</div><div class="an-row-v">' + esc(missing) + '</div></div>'
      + '<div class="an-row-meter"><div class="an-row-k">Of active</div><div class="an-row-v">' + share + '%</div>'
      + '<div class="an-bar"><span data-w="' + share + '" class="' + (ok ? 'is-ok' : 'is-warn') + '"></span></div></div>'
      + (hover ? '<div class="an-who" id="anWho-' + key + '" role="tooltip"></div>' : '')
      + '</div>'
  }

  function paint() {
    var mount = document.getElementById('analyticsMount')
    if (!mount) return
    var s = state.summary
    var h = '<div class="an-board">'
      + '<div class="an-top"><div><h1 class="an-title">Analytics</h1>'
      + '<div class="an-updated"><i></i>Counted from CTG One' + (s ? ' · updated ' + esc(timeOf(s.at)) : '') + '</div></div>'
      + '<button type="button" class="an-btn an-top-btn an-refresh" data-an="refresh"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Refreshing…' : 'Refresh') + '</button></div>'
      + filterBar()
    var parts = ['an.compliance', 'an.appointments', 'an.patients'].filter(can)
    if (state.error) {
      h += '<div class="an-error" role="alert">' + esc(state.error) + '</div>'
    } else if (!parts.length) {
      h += '<div class="an-muted an-pad">Nothing on this page is turned on for your account.</div>'
    } else if (state.loading && !s && !state.appt && !state.aw && !state.pd) {
      h += '<div class="an-muted">Loading…</div>'
    } else if (!s || !can('an.compliance')) {
      h += adhSection()
    } else {
      var awaiting = Number(s.fcr.awaiting) || 0
      var total = s.fcr.sent + s.fcr.pending + awaiting
      var ranged = !!(state.from || state.to)
      h += kpiStrip(s, ranged)
        + '<div class="an-panels">'
        + '<section class="an-card an-panel an-panel-need" aria-label="Patients to submit"><div class="an-panel-head"><h2>Patients to submit</h2><span class="an-tag">' + esc(s.active) + ' active</span></div>'
        + needRow('id', 'ID', 'Valid ID', s.toSubmit.id, s.active)
        + needRow('intake', 'Intake Form', 'Online or uploaded', s.toSubmit.intake, s.active)
        + needRow('aic', 'AIC', 'Auto Insurance Card', s.toSubmit.aic, s.active)
        + '</section>'
        + '<section class="an-card an-panel" aria-label="FCR status"><div class="an-panel-head"><h2>FCR status</h2></div>'
        + '<div class="an-donut-wrap"><div class="an-donut" id="anDonut" role="img" aria-label="' + esc(s.fcr.sent) + ' sent, ' + esc(s.fcr.pending) + ' pending, ' + esc(awaiting) + ' awaiting discharge">'
        + '<div class="an-donut-hole"><div class="an-donut-num">' + esc(total) + '</div><div class="an-donut-cap">FCRs</div></div></div>'
        + '<div class="an-legend">'
        + whoHost('an-leg', 'fcr_sent', 'FCR sent', s.fcr.sent, '<i class="an-dot-sent"></i><span>Sent</span><b>' + esc(s.fcr.sent) + '</b><em>' + pct(s.fcr.sent, total) + '%</em>')
        + whoHost('an-leg', 'fcr_pending', 'FCR pending', s.fcr.pending, '<i class="an-dot-pending"></i><span>Pending</span><b>' + esc(s.fcr.pending) + '</b><em>' + pct(s.fcr.pending, total) + '%</em>')
        // Day 1 saved as complete, not discharged yet (19 Nov 2026).
        + whoHost('an-leg', 'fcr_awaiting', 'Awaiting discharge', awaiting, '<i class="an-dot-awaiting"></i><span>Awaiting discharge</span><b>' + esc(awaiting) + '</b><em>' + pct(awaiting, total) + '%</em>')
        + '</div></div>'
        + '</section>'
        + '</div>'
        + adhSection()
    }
    h += '</div>'
    mount.innerHTML = h
    /* Widths and the donut through the CSSOM: the CSP forbids style attributes. */
    Array.prototype.forEach.call(mount.querySelectorAll('.an-bar span[data-w]'), function (el) {
      el.style.width = Math.max(0, Math.min(100, Number(el.getAttribute('data-w')) || 0)) + '%'
    })
    var donut = document.getElementById('anDonut')
    if (donut && s) {
      var aw = Number(s.fcr.awaiting) || 0
      var tot = s.fcr.sent + s.fcr.pending + aw
      var deg = tot ? Math.round((s.fcr.sent / tot) * 360) : 0
      var deg2 = tot ? Math.round(((s.fcr.sent + s.fcr.pending) / tot) * 360) : 0
      donut.style.background = tot
        ? 'conic-gradient(var(--an-accent) 0deg ' + deg + 'deg, var(--an-amber) ' + deg + 'deg ' + deg2 + 'deg, var(--an-gray) ' + deg2 + 'deg 360deg)'
        : 'conic-gradient(var(--an-line) 0deg 360deg)'
    }
    Array.prototype.forEach.call(mount.querySelectorAll('[data-h]'), function (el) {
      el.style.height = Math.max(0, Math.min(100, Number(el.getAttribute('data-h')) || 0)) + '%'
    })
    Array.prototype.forEach.call(mount.querySelectorAll('[data-b]'), function (el) {
      el.style.bottom = Math.max(0, Math.min(100, Number(el.getAttribute('data-b')) || 0)) + '%'
    })
  }

  function filterBar() {
    var on = activePreset()
    var chip = function (name, label) {
      return '<button type="button" class="an-chip-btn' + (on === name ? ' is-on' : '') + '" data-an="preset" data-p="' + name + '" aria-pressed="' + (on === name) + '">' + label + '</button>'
    }
    return '<div class="an-filter" role="group" aria-label="Date range">'
      + '<div class="an-presets">' + chip('all', 'All time') + chip('week', 'This week') + chip('month', 'This month') + chip('last', 'Last month') + chip('90', 'Last 90 days') + chip('year', 'This year') + '</div>'
      + '<div class="an-dates">'
      + '<label class="an-date"><span>From</span><input type="date" id="anFrom" value="' + esc(state.from) + '"' + (state.to ? ' max="' + esc(state.to) + '"' : '') + '></label>'
      + '<span class="an-dash" aria-hidden="true">–</span>'
      + '<label class="an-date"><span>To</span><input type="date" id="anTo" value="' + esc(state.to) + '"' + (state.from ? ' min="' + esc(state.from) + '"' : '') + '></label>'
      + (state.from || state.to ? '<button type="button" class="an-btn" data-an="clear-range">Clear</button>' : '')
      + '</div></div>'
  }
  function setRange(from, to) {
    if (from && to && from > to) { toast('The From date is after the To date.', 'err'); paint(); return }
    state.from = from || ''; state.to = to || ''
    state.pdWeeks = null; state.pdEdit = null
    saveRange()
    load()
  }
  function rangeQuery() {
    return state.from || state.to ? '?' + [state.from ? 'from=' + state.from : '', state.to ? 'to=' + state.to : ''].filter(Boolean).join('&') : ''
  }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  function dayLabel(isoDay) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay || ''); if (!m) return ''
    var d = new Date(+m[1], +m[2] - 1, +m[3])
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate()
  }

  /* ---------------- Yesterday / Today / Current month ---------------- */
  function apptBlock() {
    var a = state.appt
    if (!a || !a.yesterday || !a.today || !a.period) return ''
    // Hover any row (or the big number) for whose appointments they are (19 Nov 2026).
    var day = 'y', dayWord = ''
    var row = function (tone, label, v, of, key) {
      return whoHost('an-mrow an-t-' + tone, 'appt:' + day + ':' + key, label + ' · ' + dayWord, v,
        '<i class="an-dot"></i><span>' + esc(label) + '</span><b>' + esc(v) + '</b>'
        + (of !== undefined ? '<div class="an-mbar"><span data-w="' + pct(v, of) + '"></span></div>' : ''))
    }
    var card = function (icon, title, sub, big, bigLabel, rows) {
      return '<div class="an-card an-appt"><div class="an-appt-head"><div><div class="an-appt-title">' + esc(title) + '</div>'
        + '<div class="an-appt-sub">' + esc(sub) + '</div></div></div>'
        + whoHost('an-appt-big', 'appt:' + day + ':scheduled', 'Scheduled · ' + dayWord, big, '<span>' + esc(big) + '</span><small>' + esc(bigLabel) + '</small>')
        + '<div class="an-mrows">' + rows + '</div></div>'
    }
    var dayCard = function (d, word, build) { day = d; dayWord = word; return build() }
    var y = a.yesterday, t = a.today, p = a.period
    var periodTitle = p.ranged ? 'Selected range' : 'Current month'
    var periodSub = p.ranged ? ((p.from ? dayLabel(p.from) : 'Start') + ' – ' + (p.to ? dayLabel(p.to) : 'today')) : monthName(String(p.from).slice(0, 7))
    return '<div class="an-appts">'
      + dayCard('y', 'yesterday', function () {
        return card('cal', 'Yesterday', dayLabel(y.date), y.scheduled, 'scheduled patients',
          row('green', 'Completed', y.completed, y.scheduled, 'completed') + row('blue', 'Rescheduled', y.rescheduled, y.scheduled, 'rescheduled')
          + row('amber', 'Pending', y.pending, y.scheduled, 'pending') + row('red', 'Missed', y.missed, y.scheduled, 'missed'))
      })
      + dayCard('t', 'today', function () {
        return card('today', 'Today', dayLabel(t.date), t.scheduled, 'scheduled patients',
          row('blue', 'Therapy Visits', t.therapy, t.scheduled, 'therapy') + row('cyan', 'Initial Exam', t.initial, t.scheduled, 'initial')
          + row('green', 'Re-Exam', t.reExam, t.scheduled, 'reExam') + row('amber', 'Final Exam', t.final, t.scheduled, 'final') + row('red', 'ACE', t.ace, t.scheduled, 'ace'))
      })
      + dayCard('p', p.ranged ? 'in this range' : 'this month', function () {
        return card('month', periodTitle, periodSub, p.scheduled, 'scheduled',
          row('green', 'Completed', p.completed, p.scheduled, 'completed') + row('blue', 'Rescheduled', p.rescheduled, p.scheduled, 'rescheduled') + row('red', 'Missed', p.missed, p.scheduled, 'missed'))
      })
      + '</div>'
  }

  /* ---------------- Patient detail (adherence by week) ---------------- */
  /* Just Adherent / Non-adherent (the practice, 18 Nov 2026). A visit = a Daily
     Note date, the Day 1 (ACE) or the Day 2 (Initial Exam); 3 a week, 1 in an ACE
     week, 2 in an IE week - shown in its own "For" column, like their sheet. */
  var ST = {
    adherent: { label: 'Adherent', cls: 'ok' },
    non_adherent: { label: 'Non-adherent', cls: 'bad' }
  }
  // Worked out only, never set by hand: no Therapy Visit booked that week (19 Nov 2026).
  var NOT_SCHEDULED = { label: 'Not scheduled', cls: 'gray' }
  var MOVES = [
    ['all', 'All'], ['adherent', 'Adherent'], ['non_adherent', 'Non-adherent'], ['improved', 'Improved'], ['declined', 'Declined']
  ]
  var MOVE_LABEL = { improved: 'Improved', declined: 'Declined', still_adh: 'Still adherent', still_non: 'Still non-adherent', new: 'First week', none: '' }
  function movement(p) {
    var judged = function (m) { return m && ST[m.status] ? m.status : null }
    var A = judged(p.a), B = judged(p.b)
    if (!B) return 'none'
    if (!A) return 'new'
    if (A === 'non_adherent' && B === 'adherent') return 'improved'
    if (A === 'adherent' && B === 'non_adherent') return 'declined'
    return B === 'adherent' ? 'still_adh' : 'still_non'
  }
  function mondayOf(isoDay) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay || ''); var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return iso(d)
  }
  function shiftWeek(isoDay, n) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay); var d = new Date(+m[1], +m[2] - 1, +m[3] + 7 * n); return iso(d) }
  function weekLabel(mon) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mon || ''); if (!m) return ''
    var a = new Date(+m[1], +m[2] - 1, +m[3]), b = new Date(+m[1], +m[2] - 1, +m[3] + 4)
    var mo = function (d) { return MONTHS[d.getMonth()].slice(0, 3) }
    return mo(a) + ' ' + a.getDate() + ' – ' + (a.getMonth() === b.getMonth() ? '' : mo(b) + ' ') + b.getDate()
  }
  // The two weeks: picked, else the To/From of the range, else last week and this week.
  function pdWeeks() {
    if (state.pdWeeks) return state.pdWeeks
    var b = mondayOf(state.to || iso(new Date()))
    var a = state.from ? mondayOf(state.from) : ''
    if (!a || a >= b) a = shiftWeek(b, -1)
    return { a: a, b: b }
  }
  function loadPatientDetail(quiet) {
    var w = pdWeeks()
    return api('/api/analytics/adherence?a=' + w.a + '&b=' + w.b).then(function (r) {
      state.pd = r; state.pdErr = ''
      if (!quiet) paint()
    }).catch(function (e) {
      state.pd = null; state.pdErr = (e && e.message) || 'Could not load the patient list.'
      if (!quiet) paint()
    })
  }

  function pdRows() {
    var list = (state.pd && state.pd.patients) || []
    list.forEach(function (p) { p.move = movement(p) })
    return list
  }
  function pdVisible(all) {
    var q = state.pdSearch.trim().toLowerCase()
    var rows = all.filter(function (p) {
      if (state.pdTab === 'adherent' || state.pdTab === 'non_adherent') { if (!p.b || p.b.status !== state.pdTab) return false }
      else if (state.pdTab !== 'all' && p.move !== state.pdTab) return false
      return !q || p.name.toLowerCase().indexOf(q) !== -1
    })
    var k = state.pdSort.key, dir = state.pdSort.dir
    var order = { adherent: 1, non_adherent: 2, not_scheduled: 3 }
    var val = function (p) {
      if (k === 'a' || k === 'b') return (p[k] && order[p[k].status]) || 9
      if (k === 'move') return MOVE_LABEL[p.move] || ''
      return (p.last + ' ' + p.first).toLowerCase()
    }
    return rows.sort(function (x, y) { var a = val(x), b = val(y); return (a < b ? -1 : a > b ? 1 : 0) * dir })
  }

  function pdCell(p, wk) {
    var mark = p[wk]
    var editing = state.pdEdit && state.pdEdit.id === p.id && state.pdEdit.wk === wk
    if (editing) {
      var cur = mark && !mark.auto ? mark.status : ''
      return '<div class="an-pd-edit">'
        + '<select class="an-select an-pd-sel" id="anPdStatus" aria-label="Status for ' + esc(p.name) + '">'
        + '<option value=""' + (cur ? '' : ' selected') + '>— From the records</option>'
        + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + ST[k].label + '</option>' }).join('')
        + '</select>'
        + '<input class="an-pd-note" id="anPdNote" type="text" maxlength="300" placeholder="Note (optional)" value="' + esc(mark && !mark.auto ? mark.note : '') + '" aria-label="Note">'
        + '<div class="an-pd-actions"><button type="button" class="an-btn an-btn-primary" data-an="pd-save"' + (state.pdSaving ? ' disabled' : '') + '>Save</button>'
        + '<button type="button" class="an-btn" data-an="pd-cancel">Cancel</button></div></div>'
    }
    if (!mark) return '<span class="an-pd-none">—</span>'
    var st = ST[mark.status] || (mark.status === 'not_scheduled' ? NOT_SCHEDULED : { label: mark.status, cls: 'gray' })
    var title = st.label + (mark.auto ? ' · worked out from the records' + (can('an.setStatus') ? ' - click to change' : '') : (mark.by ? ' · set by ' + mark.by : ''))
    if (!can('an.setStatus')) {
      return '<span class="an-status is-' + st.cls + (mark.auto ? '' : ' is-manual') + ' is-static" title="' + esc(title) + '"><i></i>' + st.label
        + (mark.auto ? '' : '<b class="an-hand" aria-label="set by hand">✎</b>') + '</span>'
        + (!mark.auto && mark.note ? '<div class="an-pd-cellnote">' + esc(mark.note) + '</div>' : '')
    }
    return '<button type="button" class="an-status is-' + st.cls + (mark.auto ? '' : ' is-manual') + '" data-an="pd-edit" data-id="' + esc(p.id) + '" data-wk="' + wk + '" title="' + esc(title) + '">'
      + '<i></i>' + st.label + (mark.auto ? '' : '<b class="an-hand" aria-label="set by hand">✎</b>') + '</button>'
      + (!mark.auto && mark.note ? '<div class="an-pd-cellnote">' + esc(mark.note) + '</div>' : '')
  }
  // "Attended": visits that week out of what was needed.
  function pdAtt(mark) {
    if (!mark || !mark.auto || mark.need == null || mark.status === 'not_scheduled') return '<span class="an-pd-none">—</span>'
    return '<span class="an-att' + (mark.attended >= mark.need ? ' is-met' : '') + '"><b>' + esc(mark.attended) + '</b> of ' + esc(mark.need) + '</span>'
      + (mark.soFar ? '<span class="an-att-sofar">so far</span>' : '')
  }

  function pdTable() {
    var all = pdRows(), rows = pdVisible(all), w = (state.pd && state.pd.weeks) || pdWeeks()
    var sortH = function (key, label, span) {
      var on = state.pdSort.key === key
      return '<th' + (span ? ' colspan="' + span + '" class="an-th-group"' : ' rowspan="2"') + '><button type="button" class="an-sort' + (on ? ' is-on' : '') + '" data-an="pd-sort" data-k="' + key + '" aria-label="Sort by ' + esc(label) + '">'
        + esc(label) + '<span aria-hidden="true">' + (on ? (state.pdSort.dir > 0 ? '▲' : '▼') : '↕') + '</span></button></th>'
    }
    if (!rows.length) return '<div class="an-muted an-pad">' + (all.length ? 'No patients match.' : 'No patients with visits in these weeks.') + '</div>'
    // No "For" column (19 Nov 2026): the For ACE / For Initial Exam tables below show who is booked for which.
    var sub = '<th>Status</th><th>Attended</th>'
    return '<div class="an-table-wrap"><table class="an-table an-pd-table"><thead><tr>'
      + sortH('patient', 'Patient') + sortH('a', weekLabel(w.a), 2) + sortH('b', weekLabel(w.b), 2) + sortH('move', 'Movement')
      + '</tr><tr class="an-th-sub">' + sub + sub + '</tr></thead><tbody>'
      + rows.map(function (p) {
        return '<tr><td class="an-pd-name">' + esc(p.name) + (p.inactive ? ' <span class="an-pd-inactive">inactive</span>' : '') + '</td>'
          + '<td>' + pdCell(p, 'a') + '</td><td>' + pdAtt(p.a) + '</td>'
          + '<td class="an-wk2">' + pdCell(p, 'b') + '</td><td>' + pdAtt(p.b) + '</td>'
          + '<td><span class="an-move is-' + p.move + '">' + (p.move === 'improved' ? '▲ ' : p.move === 'declined' ? '▼ ' : '') + esc(MOVE_LABEL[p.move] || '') + '</span></td></tr>'
      }).join('') + '</tbody></table></div>'
  }

  /* "For ACE" (Day 1) and "For Initial Exam" (Day 2): who is on the calendar for one in the
     same two weeks as Patient detail (18 Nov 2026). */
  function examBlock() {
    var ex = state.pd && !state.pdErr && state.pd.exams
    if (!ex) return ''
    var tone = { 'Check-in': ['ok', 'Checked in'], 'Missed': ['bad', 'Missed'], 'Reschedule': ['warn', 'Rescheduled'] }
    var pill = function (s) { var t = tone[s] || ['gray', s || 'Scheduled']; return '<span class="an-status is-' + t[0] + ' is-static"><i></i>' + esc(t[1]) + '</span>' }
    // Unconfirmed (or no status yet) at the bottom; the rest first. Date order kept within each (19 Nov 2026).
    var unsure = function (r) { return !r.status || r.status === 'Unconfirmed' ? 1 : 0 }
    var settledFirst = function (rows) {
      return rows.map(function (r, i) { return { r: r, i: i } })
        .sort(function (x, y) { return unsure(x.r) - unsure(y.r) || x.i - y.i })
        .map(function (x) { return x.r })
    }
    var table = function (title, sub, rows) {
      rows = settledFirst(rows)
      return '<section class="an-card an-panel an-exam" aria-label="' + esc(title) + '"><div class="an-panel-head"><h2>' + esc(title) + ' <span class="an-h-sub">' + esc(sub) + '</span></h2>'
        + '<span class="an-tag">' + rows.length + (rows.length === 1 ? ' patient' : ' patients') + '</span></div>'
        + (rows.length
          ? '<div class="an-table-wrap"><table class="an-table"><thead><tr><th>Patient</th><th>Date</th><th>Status</th></tr></thead><tbody>'
            + rows.map(function (r) {
              return '<tr><td class="an-pd-name">' + esc(r.name) + '</td><td>' + esc(dayLabel(r.date)) + (r.time ? ' · ' + esc(r.time) : '') + '</td><td>' + pill(r.status) + '</td></tr>'
            }).join('') + '</tbody></table></div>'
          : '<div class="an-muted an-pad">No one on the calendar for this in these two weeks.</div>')
        + '</section>'
    }
    return '<div class="an-exams">' + table('For ACE', 'Day 1', ex.ace || []) + table('For Initial Exam', 'Day 2', ex.ie || []) + '</div>'
  }

  function patientBlock() {
    var w = (state.pd && state.pd.weeks) || pdWeeks()
    var all = pdRows()
    var count = function (k) {
      if (k === 'all') return all.length
      if (k === 'adherent' || k === 'non_adherent') return all.filter(function (p) { return p.b && p.b.status === k }).length
      return all.filter(function (p) { return p.move === k }).length
    }
    var tabs = MOVES.map(function (m) {
      return '<button type="button" class="an-chip-btn' + (state.pdTab === m[0] ? ' is-on' : '') + '" data-an="pd-tab" data-t="' + m[0] + '" aria-pressed="' + (state.pdTab === m[0]) + '">'
        + m[1] + ' <span class="an-count">' + count(m[0]) + '</span></button>'
    }).join('')
    return '<div class="an-card an-panel an-pd" aria-label="Patient detail">'
      + '<div class="an-panel-head"><h2>Patient detail</h2>'
      + '<div class="an-pd-weeks"><label class="an-date"><span>Week 1</span><input type="date" id="anPdA" value="' + esc(w.a) + '"></label>'
      + '<label class="an-date"><span>Week 2</span><input type="date" id="anPdB" value="' + esc(w.b) + '"></label></div></div>'
      + (state.pdErr ? '<div class="an-error" role="alert">' + esc(state.pdErr) + '</div>' :
        '<div class="an-presets an-pd-tabs" role="group" aria-label="Movement">' + tabs + '</div>'
        + '<input type="search" class="an-search" id="anPdSearch" placeholder="Search patient…" value="' + esc(state.pdSearch) + '" aria-label="Search patient">'
        + '<div id="anPdBody">' + pdTable() + '</div>')
      + '</div>'
  }

  function pdSave() {
    var e = state.pdEdit; if (!e) return
    var sel = document.getElementById('anPdStatus'), note = document.getElementById('anPdNote')
    var status = sel ? sel.value : '', text = note ? note.value.trim() : ''
    var w = (state.pd && state.pd.weeks) || pdWeeks()
    var week = e.wk === 'a' ? w.a : w.b
    state.pdSaving = true; paint()
    api('/api/analytics/adherence/' + encodeURIComponent(e.id) + '/' + week, { method: 'PUT', body: JSON.stringify({ status: status, note: status ? text : '' }) })
      .then(function () {
        state.pdEdit = null
        return loadPatientDetail(true)   // a cleared one goes back to the appointment book's status
      })
      .catch(function (err) { toast((err && err.message) || 'Could not save.', 'err') })
      .then(function () { state.pdSaving = false; paint() })
  }
  function pdRefreshBody() {
    var body = document.getElementById('anPdBody')
    if (body) body.innerHTML = pdTable()
  }


  /* ---------------- Technical Assistant: Appointment Adherence ---------------- */
  function awQuery() {
    if (state.from || state.to) return rangeQuery()
    return state.awMonth ? '?month=' + state.awMonth : ''
  }
  function loadAdherenceWeeks(quiet) {
    return api('/api/analytics/adherence-weeks' + awQuery()).then(function (r) {
      state.aw = r; state.awErr = ''
      if (!quiet) paint()
    }).catch(function (e) {
      state.aw = null; state.awErr = (e && e.message) || 'Could not load Appointment Adherence.'
      if (!quiet) paint()
    })
  }
  function ymd(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null }
  function spanLabel(a, b) {
    var x = ymd(a), y = ymd(b); if (!x || !y) return ''
    var mo = function (k) { return MONTHS[k - 1].slice(0, 3) }
    if (a === b) return mo(x.m) + ' ' + x.d
    return mo(x.m) + ' ' + x.d + ' – ' + (x.m === y.m ? '' : mo(y.m) + ' ') + y.d
  }
  function adhCalc(weeks) {
    var w = (weeks || []).filter(function (x) { return !x.future }).map(function (x, i) {
      var span = spanLabel(x.start, x.end)
      return { n: i + 1, lab: 'Week ' + (i + 1) + ' · ' + span, short: 'Week ' + (i + 1), span: span, p: x.p, s: x.s, c: x.c, r: x.s > 0 ? x.c / x.s * 100 : 0 }
    })
    var S = w.reduce(function (a, x) { return a + x.s }, 0), C = w.reduce(function (a, x) { return a + x.c }, 0)
    var rated = w.filter(function (x) { return x.s > 0 })
    var best = rated.reduce(function (a, x) { return !a || x.r > a.r ? x : a }, null)
    var low = rated.reduce(function (a, x) { return !a || x.r < a.r ? x : a }, null)
    return { w: w, S: S, C: C, rate: S > 0 ? C / S * 100 : 0, best: rated.length > 1 ? best : null, low: rated.length > 1 ? low : null }
  }

  function adhSection() {
    var showA = can('an.appointments'), showP = can('an.patients')
    var tail = showP ? patientBlock() + examBlock() : ''
    if (!showA) return tail ? '<section class="an-ta" aria-label="Technical Assistant">' + tail + '</section>' : ''
    var head = apptBlock()
    var aw = state.aw && state.aw.period && Array.isArray(state.aw.weeks) ? state.aw : null, ranged = !!(state.from || state.to)
    var period = aw && aw.period
    var title = !period ? '' : (period.ranged ? spanLabel(period.from, period.to) + ', ' + period.to.slice(0, 4) : monthName(period.from.slice(0, 7)))
    var monthVal = state.awMonth || (period && !period.ranged ? period.from.slice(0, 7) : '')
    var tools = '<div class="an-adh-tools">'
      + (ranged ? '<span class="an-tag">Date range</span>'
        : '<label class="an-date"><span>Month</span><input type="month" class="an-month-in" id="anAwMonth" value="' + esc(monthVal) + '"' + (aw && aw.today ? ' max="' + esc(aw.today.slice(0, 7)) + '"' : '') + '></label>')
      + '<button type="button" class="an-btn an-btn-ghost" data-an="adh-print">Print</button>'
      + '</div>'
    var bar = '<div class="an-card an-panel an-adh-bar"><div class="an-panel-head"><h2>Appointment Adherence <span class="an-h-sub">' + esc(title) + '</span></h2>' + tools + '</div></div>'
    var wrap = function (inner) { return '<section class="an-ta" aria-label="Technical Assistant">' + head + bar + inner + tail + '</section>' }
    if (state.awErr) return wrap('<div class="an-error" role="alert">' + esc(state.awErr) + '</div>')
    if (!aw) return wrap('<div class="an-muted an-pad">Loading…</div>')
    var d = adhCalc(aw.weeks)
    if (!d.S) return wrap('<div class="an-card an-panel"><div class="an-muted an-pad">No appointments in ' + esc(title) + (aw.through < period.to ? ' up to today' : '') + '.</div></div>')
    var word = period.ranged ? 'range' : 'month'
    var periodWord = period.ranged ? 'Range' : MONTHS[+period.from.slice(5, 7) - 1]
    var R = 52, CIRC = 2 * Math.PI * R, off = CIRC * (1 - Math.min(100, d.rate) / 100)
    var gauge = '<div class="an-card an-gauge-card">'
      + '<div class="an-k">' + (period.ranged ? 'Adherence in this range' : 'Monthly adherence') + '</div>'
      + '<div class="an-gauge"><svg viewBox="0 0 120 120" aria-hidden="true">'
      + '<defs><linearGradient id="anGArc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00B4D8"/><stop offset="1" stop-color="#03045E"/></linearGradient></defs>'
      + '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="#E4F6FA" stroke-width="9"/>'
      + '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="url(#anGArc)" stroke-width="9" stroke-linecap="round" transform="rotate(-90 60 60)"'
      + ' stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/></svg>'
      + '<div class="an-gauge-val"><div class="an-gauge-num">' + f2(d.rate) + '<small>%</small></div><div class="an-gauge-sub">of scheduled visits completed</div></div></div>'
      + '<div class="an-formula">' + esc(d.C) + ' ÷ ' + esc(d.S) + ' × 100 = <b>' + f2(d.rate) + '%</b></div></div>'
    var mini = function (tone, label, value, sub, w) {
      return '<div class="an-card an-mini an-t-' + tone + '"><div class="an-k"><i class="an-dot"></i>' + esc(label) + '</div>'
        + '<div class="an-mini-v">' + value + '</div><div class="an-sub">' + sub + '</div>'
        + '<div class="an-bar"><span data-w="' + w + '"></span></div></div>'
    }
    var weeksWord = d.w.length + ' week' + (d.w.length === 1 ? '' : 's')
    var minis = '<div class="an-minis">'
      + mini('slate', 'Scheduled appointments', esc(d.S), 'scheduled, ' + weeksWord, 100)
      + mini('violet', 'Completed appointments', esc(d.C), 'checked in', d.rate)
      + (d.low ? mini('red', 'Lowest week', esc(d.low.short), esc(d.low.span) + ' · ' + f2(d.low.r) + '% · ' + d.low.c + ' of ' + d.low.s, d.low.r)
        : mini('red', 'Lowest week', '—', 'needs two weeks with visits', 0))
      + (d.best ? mini('green', 'Best week', esc(d.best.short), esc(d.best.span) + ' · ' + f2(d.best.r) + '% · ' + (d.best.r >= d.rate ? '+' : '') + f2(d.best.r - d.rate) + ' pts vs ' + word, d.best.r)
        : mini('green', 'Best week', '—', 'needs two weeks with visits', 0))
      + '</div>'
    var dense = d.w.length > 6
    var chart = '<div class="an-card an-panel an-chart-card"><div class="an-panel-head"><h2>Weekly trend</h2>'
      + '<div class="an-legend-inline"><span><i class="an-sw-rate"></i>Adherence</span><span><i class="an-sw-avg"></i>' + esc(periodWord) + ' ' + f2(d.rate) + '%</span></div></div>'
      + '<div class="an-wk-chart"><div class="an-wk-plot"><div class="an-wk-avg" data-b="' + f2(d.rate) + '"></div></div>'
      + d.w.map(function (x) {
        var cls = d.best && x.n === d.best.n ? ' is-best' : (d.low && x.n === d.low.n ? ' is-low' : '')
        return '<div class="an-wk' + cls + (dense ? ' is-dense' : '') + '" title="' + esc(x.lab) + ': ' + x.c + ' of ' + x.s + ' completed, ' + x.p + ' patients">'
          + '<div class="an-wk-track"><div class="an-wk-fill" data-h="' + f2(x.r) + '"><span>' + (x.s ? (dense ? Math.round(x.r) : f2(x.r)) + '%' : '—') + '</span></div></div>'
          + '<div class="an-wk-lab">' + esc(dense ? 'W' + x.n : x.short) + '</div><div class="an-wk-sub">' + esc(x.span) + '</div></div>'
      }).join('') + '</div></div>'
    var table = '<div class="an-card an-panel"><div class="an-panel-head"><h2>Summary</h2><span class="an-tag">' + esc(title) + '</span></div>'
      + '<div class="an-table-wrap"><table class="an-table"><thead><tr><th>Week</th><th>Patients</th><th>Scheduled</th><th>Completed</th><th>Adherence</th></tr></thead><tbody>'
      + d.w.map(function (x) {
        return '<tr><td>' + esc(x.lab) + '</td><td>' + x.p + '</td><td>' + x.s + '</td><td>' + x.c + '</td>'
          + '<td>' + (x.s ? '<span class="an-pct"><span class="an-bar"><span data-w="' + f2(x.r) + '"></span></span>' + f2(x.r) + '%</span>' : '—') + '</td></tr>'
      }).join('')
      + '</tbody><tfoot><tr><td>' + esc(period.ranged ? 'Range' : periodWord) + ' total</td><td>—</td><td>' + d.S + '</td><td>' + d.C + '</td><td>' + f2(d.rate) + '%</td></tr></tfoot></table></div>'
      + '<div class="an-method">From the appointment book: scheduled = appointments not Cancelled, completed = Check-in; adherence = completed ÷ scheduled × 100 over the ' + word + '. Patients is how many different patients had a visit that week (not added up).'
      + (aw.through < period.to ? ' Counted up to today (' + esc(spanLabel(aw.through, aw.through)) + ').' : '') + '</div></div>'
    return wrap('<div class="an-adh-hero">' + gauge + minis + '</div>' + chart + table)
  }

  function adhPrint() {
    document.body.classList.add('an-printing')
    var done = function () { document.body.classList.remove('an-printing'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
    setTimeout(done, 1500)
  }

  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest('[data-an]')
    if (!b) {
      // A tap on a "Patients to submit" row (touch screens have no hover): open / close its list.
      var nr = ev.target.closest && ev.target.closest('.an-row-who[data-need]')
      if (nr) { var was = nr.classList.contains('is-open'); document.querySelectorAll('#analyticsMount .an-row-who.is-open').forEach(function (x) { x.classList.remove('is-open') }); if (!was) { nr.classList.add('is-open'); whoOpen(nr) } }
      return
    }
    if (b.disabled) return
    var a = b.getAttribute('data-an')
    if (a === 'refresh') load()
    else if (a === 'preset') { var pr = presetRange(b.getAttribute('data-p')); setRange(pr.from, pr.to) }
    else if (a === 'clear-range') setRange('', '')
    else if (a === 'pd-tab') { state.pdTab = b.getAttribute('data-t'); paint() }
    else if (a === 'pd-sort') { var k = b.getAttribute('data-k'); state.pdSort = { key: k, dir: state.pdSort.key === k ? -state.pdSort.dir : 1 }; paint() }
    else if (a === 'pd-edit') { state.pdEdit = { id: b.getAttribute('data-id'), wk: b.getAttribute('data-wk') }; paint(); var s0 = document.getElementById('anPdStatus'); if (s0) s0.focus() }
    else if (a === 'pd-cancel') { state.pdEdit = null; paint() }
    else if (a === 'pd-save') pdSave()
    else if (a === 'adh-print') adhPrint()
  }
  function onChange(ev) {
    if (ev.target && ev.target.id === 'anAwMonth') { state.awMonth = /^\d{4}-\d{2}$/.test(ev.target.value) ? ev.target.value : ''; loadAdherenceWeeks(false) }
    else if (ev.target && (ev.target.id === 'anPdA' || ev.target.id === 'anPdB')) {
      var wa = document.getElementById('anPdA'), wb = document.getElementById('anPdB')
      var na = wa && wa.value ? mondayOf(wa.value) : '', nb = wb && wb.value ? mondayOf(wb.value) : ''
      if (!na || !nb) return
      if (na === nb) { toast('Pick two different weeks.', 'err'); paint(); return }
      state.pdWeeks = na < nb ? { a: na, b: nb } : { a: nb, b: na }
      state.pdEdit = null
      loadPatientDetail(false)
    }
    else if (ev.target && (ev.target.id === 'anFrom' || ev.target.id === 'anTo')) {
      var f = document.getElementById('anFrom'), t = document.getElementById('anTo')
      setRange(f ? f.value : '', t ? t.value : '')
    }
  }
  function onInput(ev) {
    if (ev.target && ev.target.id === 'anPdSearch') { state.pdSearch = ev.target.value; pdRefreshBody() }
  }
  function onKey(ev) {
    if (ev.target && (ev.target.id === 'anPdNote' || ev.target.id === 'anPdStatus')) {
      if (ev.key === 'Enter') { ev.preventDefault(); pdSave() }
      else if (ev.key === 'Escape') { state.pdEdit = null; paint() }
      return
    }
  }

  /* Live (19 Nov 2026): while this page is open it re-counts by itself - on the portal's
     change messages (patients, appointments, Outreach, adherence marks), every minute as a
     fallback, and when the browser tab comes back. Quietly: the numbers are swapped in
     without a "Loading", a failed fetch keeps what is shown, and it waits while someone is
     typing in a field here, editing a status or reading a hover list. */
  var LIVE_TYPES = { 'data:patients': 1, 'data:appointments': 1, 'data:outreach': 1, 'data:analytics': 1 }
  var liveTimer = null, liveBusy = false, lastLive = 0
  function onAnalyticsPage() { var pg = document.getElementById('page-analytics'); return !!(pg && pg.classList.contains('active')) }
  function userBusy() {
    if (state.loading || state.pdEdit || state.pdSaving) return true
    var mount = document.getElementById('analyticsMount'), a = document.activeElement
    if (mount && a && mount.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return true
    return !!(mount && mount.querySelector('.an-row-who:hover, .an-row-who.is-open'))
  }
  function scheduleLive(ms) { clearTimeout(liveTimer); liveTimer = setTimeout(liveRefresh, ms == null ? 1200 : ms) }
  function liveRefresh() {
    if (!onAnalyticsPage() || document.visibilityState === 'hidden' || liveBusy || state.loading) return
    if (userBusy()) { scheduleLive(4000); return }
    liveBusy = true
    var keep = function (fn) { return function (r) { if (r) fn(r) } }
    var w = pdWeeks()
    Promise.all([
      can('an.compliance') ? api('/api/analytics/summary' + rangeQuery()).then(keep(function (r) { state.summary = r })).catch(function () {}) : none(),
      can('an.appointments') ? api('/api/analytics/appointments' + rangeQuery()).then(keep(function (r) { state.appt = r })).catch(function () {}) : none(),
      can('an.appointments') ? api('/api/analytics/adherence-weeks' + awQuery()).then(keep(function (r) { state.aw = r; state.awErr = '' })).catch(function () {}) : none(),
      can('an.patients') ? api('/api/analytics/adherence?a=' + w.a + '&b=' + w.b).then(keep(function (r) { state.pd = r; state.pdErr = '' })).catch(function () {}) : none()
    ]).then(function () {
      liveBusy = false; lastLive = Date.now()
      who = {}   // the hover lists are fetched again when next opened
      if (!onAnalyticsPage()) return
      if (userBusy()) { scheduleLive(4000); return }
      paint()
    })
  }
  window.addEventListener('ctg:realtime', function (e) {
    if (e && e.detail && LIVE_TYPES[e.detail.type]) scheduleLive()
  })
  setInterval(function () { if (Date.now() - lastLive > 55000) liveRefresh() }, 60000)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - lastLive > 15000) scheduleLive(300)
  })

  var wired = false
  window.renderAnalytics = function () {
    var mount = document.getElementById('analyticsMount')
    if (mount && !wired) {
      mount.addEventListener('click', onClick)
      mount.addEventListener('keydown', onKey)
      mount.addEventListener('change', onChange)
      mount.addEventListener('input', onInput)
      mount.addEventListener('mouseover', onOver)
      mount.addEventListener('focusin', onOver)
      wired = true
    }
    state.pdEdit = null
    lastLive = Date.now()
    load()
  }
})()
