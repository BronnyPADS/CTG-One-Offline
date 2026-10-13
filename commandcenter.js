(function () {
  'use strict'

  var slots = []
  var boardDate = null
  var timer = null
  var tick = null
  var autoPilot = false
  var holdUntil = 0          // epoch ms - Hold on the countdown card
  // Remembers a PROVIDER's own choice across logins - 'on' or 'off'. Never
  // read for any other role, so it can never turn Auto-Pilot on for someone
  // whose patients these are not.
  var AP_PREF_KEY = 'ctg_cc_autopilot_pref'
  // "Not today" only skips the prompt for the rest of this login - it does
  // not touch the remembered preference, so tomorrow starts fresh again.
  var startPromptDismissed = false
  var joined = {}            // meetingId -> true, so one visit is joined once
  var counting = null        // meetingId currently showing the countdown
  // The last HTML this function actually wrote to the DOM - see render().
  var lastRenderedHTML = null

  // Which single status the wall is narrowed to - 'all' shows everything (and
  // still sinks Finished to the bottom, per orderedSlots()). Picking anything
  // else shows only that status, Finished included, because asking to see
  // Finished should show Finished, not hide it again.
  var filterKey = 'all'
  var filterMenuOpen = false
  var FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'due', label: 'Due now' },
    { key: 'live', label: 'In session' },
    { key: 'over', label: 'Running over' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'ready', label: 'Ready for provider' },
    { key: 'checkedin', label: 'Checked in' },
    { key: 'missed', label: 'No-show', always: true },
    { key: 'reschedule', label: 'To reschedule', always: true },
    { key: 'cancelled', label: 'Cancelled', always: true },
    { key: 'inperson', label: 'In person' },
    { key: 'soon', label: 'Upcoming' },
    { key: 'done', label: 'Finished' }
  ]
  // Same hex each status already wears on its tile (see .cc-missed, .cc-live,
  // etc. in styles.css) - picked a filter and the button itself is now that
  // status's color, not just a generic accent, so the button reads as "I am
  // showing you the pink ones" without needing to read its own label.
  var FILTER_COLORS = {
    due: '#0096C7', live: '#2fa36b', over: '#e0342a', waiting: '#f0a020',
    ready: '#7B1FA2', checkedin: '#2E7D32', missed: '#C2185B',
    reschedule: '#8D6E63', cancelled: '#78909C', inperson: '#7c8698',
    soon: '#64748B', done: '#64748B'
  }

  var LEAD_MS = 60 * 1000    // how long the countdown card runs before joining

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function todayISO() {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  // Appointment times are the clinic's wall clock, and so is the browser's -
  // so all scheduling maths lives here rather than on the UTC server.
  function slotStart(s) { return new Date(s.date + 'T' + s.start + ':00').getTime() }
  function slotEnd(s) { return new Date(s.date + 'T' + s.end + ':00').getTime() }
  function fmt(t) {
    var h = parseInt(t.slice(0, 2), 10), m = t.slice(3, 5)
    var ap = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return h + ':' + m + ' ' + ap
  }
  function mins(ms) { return Math.round(ms / 60000) }

  /* One slot's state, in the order that matters to whoever is looking at it. */
  function stateOf(s) {
    var now = Date.now()
    if (!s.meetingId) return { key: 'inperson', label: 'In person' }
    if (s.meetingStatus === 'ended') return { key: 'done', label: 'Finished' }
    if (s.waiting > 0) return { key: 'waiting', label: s.waiting + ' waiting' }
    if (s.meetingStatus === 'live') {
      return now > slotEnd(s)
        ? { key: 'over', label: 'Running over' }
        : { key: 'live', label: 'In session' }
    }
    var booking = String(s.status || '')
    if (booking === 'Cancelled') return { key: 'cancelled', label: 'Cancelled' }
    if (booking === 'Reschedule') return { key: 'reschedule', label: 'To reschedule' }
    if (booking === 'Missed') return { key: 'missed', label: 'Missed' }

    // The TA has finished prepping and called the clinician in - see
    // POST /api/meetings/:id/ready. Outranks "checked in", which it implies.
    if (s.readyAt) return { key: 'ready', label: 'Ready for provider' }
    if (s.checkedInAt) return { key: 'checkedin', label: 'Checked in' }
    if (now > slotEnd(s)) return { key: 'missed', label: 'No-show?' }
    if (now >= slotStart(s) - LEAD_MS) return { key: 'due', label: 'Due now' }
    return { key: 'soon', label: 'in ' + mins(slotStart(s) - now) + ' min' }
  }

  var LATE_GRACE_MS = 10 * 60 * 1000

  function nextUp() {
    var now = Date.now()
    return slots.filter(function (s) {
      return s.meetingId && s.meetingStatus !== 'ended' && !joined[s.meetingId]
        && slotStart(s) > now - LATE_GRACE_MS
    }).sort(function (a, b) { return slotStart(a) - slotStart(b) })[0] || null
  }

  function inCall() {
    return typeof window.mtgInCall === 'function' && window.mtgInCall()
  }

  function isProvider() {
    return typeof window.currentUserIsProvider === 'function' && window.currentUserIsProvider()
  }
  function apPref() {
    try { return localStorage.getItem(AP_PREF_KEY) } catch (e) { return null }
  }
  function setApPref(v) {
    try { localStorage.setItem(AP_PREF_KEY, v) } catch (e) { /* private browsing - just not remembered */ }
  }
  /* Shown when: this account is a provider, Auto-Pilot is not already on,
     the provider has not explicitly turned it off before (or never chosen),
     and they have not already waved it off once this session. Everyone else
 - TA, compliance, admin - never sees this, at any point. */
  function shouldOfferStart() {
    return isProvider() && !autoPilot && apPref() !== 'off' && !startPromptDismissed
  }
  function greeting() {
    var h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  }

  // ---------------------------------------------------------------- data

  async function load() {
    if (filterMenuOpen) return
    if (!window.ctgApiFetch) return
    var date = boardDate || todayISO()
    try {
      var d = await window.ctgApiFetch('/api/appointments/board?date=' + encodeURIComponent(date))
      slots = d.slots || []
      boardDate = d.date
    } catch (e) { /* keep whatever is on screen */ }
    render()
  }

  window.renderCommandCenter = function () {
    if (!boardDate) boardDate = todayISO()
    render()
    load()
    clearInterval(timer)
    clearInterval(tick)
    /* Two clocks. The slow one re-reads the board; the fast one only
       re-evaluates the countdown, which has to be accurate to the second
       without asking the server anything. */
    timer = setInterval(function () { if (isVisible() || autoPilot) load() }, 20000)
    tick = setInterval(autoPilotTick, 1000)
  }

  function isVisible() {
    var p = document.getElementById('page-commandCenter')
    return p && p.classList.contains('active')
  }

  // Any room event anywhere refreshes the wall - this is what makes a knock
  // appear without anyone refreshing anything.
  window.ctgCommandCenterRealtime = function () { if (isVisible()) load() }

  var focused = null
  var focusTimer = null

  window.ccFocusMeeting = function (meetingId) {
    if (!meetingId) return
    focused = meetingId
    clearTimeout(focusTimer)
    // Drop the mark after a while - it says "this is the one you came for",
    // not "this room is special".
    focusTimer = setTimeout(function () { focused = null; paintFocus() }, 12000)
    var tries = 0
    ;(function attempt() {
      if (focused !== meetingId) return
      if (paintFocus(true) || ++tries > 20) return
      setTimeout(attempt, 150)
    })()
  }

  /* Applies the mark to whatever is on screen now. Returns whether the tile
     was actually found, so the retry above knows when to stop. */
  function paintFocus(scroll) {
    var host = document.getElementById('commandCenterMount')
    if (!host) return false
    var tiles = host.querySelectorAll('.cc-tile')
    var hit = null
    for (var i = 0; i < tiles.length; i++) {
      var on = focused && tiles[i].getAttribute('data-mid') === focused
      tiles[i].classList.toggle('cc-focus', !!on)
      if (on) hit = tiles[i]
    }
    if (hit && scroll && hit.scrollIntoView) {
      hit.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    return !!hit
  }

  // ---------------------------------------------------------------- render

  function isStale(s) {
    var key = stateOf(s).key
    // Cancelled and to-reschedule join finished/no-show: a decision has been
    // taken, so they are a log entry rather than something still needing the
    // provider. Still reachable by picking that status in the filter.
    if (key === 'done' || key === 'missed' || key === 'cancelled' || key === 'reschedule') return true
    if (key === 'inperson') return Date.now() > slotEnd(s)
    return false
  }

  function providerStart(s) {
    if (typeof window.ctgBreakTitlesFor !== 'function') return null
    var blocks = window.ctgBreakTitlesFor(s.patientName, s.date)
    var best = null
    blocks.forEach(function (b) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(b.start || '')
      if (!m) return
      var mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
      if (best === null || mins < best) best = mins
    })
    return best
  }
  function effectiveStart(s) {
    var p = providerStart(s)
    return p === null ? slotStart(s) : new Date(s.date + 'T00:00:00').getTime() + p * 60000
  }

  function orderedSlots() {
    var pool = filterKey === 'all'
      ? slots.filter(function (s) { return !isStale(s) })
      : slots.filter(function (s) { return stateOf(s).key === filterKey })
    return pool.slice().sort(function (a, b) {
      // The provider's own clock first, then the booking's, so a tie on one is
      // still broken by the other rather than left to array order.
      return (effectiveStart(a) - effectiveStart(b)) || (slotStart(a) - slotStart(b))
    })
  }

  function render() {
    var host = document.getElementById('commandCenterMount')
    if (!host) return

    var video = slots.filter(function (s) { return s.meetingId })
    var waiting = video.reduce(function (n, s) { return n + (s.waiting || 0) }, 0)
    var live = video.filter(function (s) { return s.meetingStatus === 'live' }).length
    var next = nextUp()
    var orderedResult = orderedSlots()

    var html =
      '<div class="wrap cc-wrap">'
      + startPromptHTML()
      + '<div class="pt-strip cc-strip">'
        + '<div><div class="cc-title">Provider\'s Dashboard</div>'
        + '<div class="cc-sub">' + esc(prettyDate(boardDate)) + ' — today’s patients, all in one place. Tap Join to start a video visit.</div></div>'
        + '<div class="cc-head-right">'
          + '<div class="cc-counts">'
            + '<div class="cc-count"><strong>' + video.length + '</strong><span>Video visits</span></div>'
            + '<div class="cc-count' + (live ? ' on' : '') + '"><strong>' + live + '</strong><span>In session</span></div>'
            + '<div class="cc-count' + (waiting ? ' warn' : '') + '"><strong>' + waiting + '</strong><span>Waiting</span></div>'
          + '</div>'
          + '<button class="cc-onair' + (autoPilot ? ' on' : '') + '" data-onclick="ccToggleAutoPilot()"'
            + ' aria-pressed="' + (autoPilot ? 'true' : 'false') + '">'
            + '<i></i>' + (autoPilot ? 'Auto-Pilot: On' : 'Auto-Pilot: Off')
          + '</button>'
        + '</div>'
      + '</div>'

      + filterHTML()

      + autoPilotCardHTML(next)

      + (slots.length
          ? (orderedResult.length
              // index passed through so each tile can state its own position
              ? '<div class="cc-grid">' + orderedResult.map(function (s, i) { return tileHTML(s, i) }).join('') + '</div>'
              : '<div class="card"><div class="card-body"><div class="pld-empty-state">'
                + (filterKey === 'all'
                    ? 'All caught up — nothing needs you right now. Use the filter to see earlier finished or no-show visits.'
                    : 'Nothing is "' + esc(filterLabel(filterKey)) + '" right now.')
                + '</div></div></div>')
          : '<div class="card"><div class="card-body"><div class="pld-empty-state">'
            + 'Nothing booked for this day. Appointments scheduled into a video room appear here as soon as they are saved.'
            + '</div></div></div>')
      + '</div>'

    if (html === lastRenderedHTML) return
    lastRenderedHTML = html
    host.innerHTML = html

    // The board rebuilds itself every 20s and on every room event, so the
    // alert's mark has to be re-applied after each render or it survives less
    // than one poll.
    paintFocus()
  }

  function prettyDate(iso) {
    if (!iso) return ''
    var d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      + (iso === todayISO() ? ' · today' : '')
  }

  /* The matching Provider's Calendar block for this same patient and time, so
     the board reads as one merged calendar rather than sending the provider
     off to the week grid to see what the visit is really for. */
  function breakTitleHTML(s) {
    if (typeof window.ctgBreakTitlesFor !== 'function') return ''
    // All of the patient's blocks that day, not just one - they are matched on
    // the day rather than the minute, so a second one is a real possibility.
    return window.ctgBreakTitlesFor(s.patientName, s.date).map(function (b) {
      return '<div class="cc-blocktitle" data-cs="'+__cs+'--block-color:' + esc(b.color) + '">'
        + esc(b.title)
        + (b.time ? '<span class="cc-blocktime">' + esc(b.time) + '</span>' : '')
        + '</div>'
    }).join('')
  }

  function handoverOf(s) {
    if (s.readyAt) return { key: 'ready', label: 'Ready for provider' }
    if (s.checkedInAt) return { key: 'checkedin', label: 'Checked in' }
    return null
  }

  function tileHTML(s, i) {
    var st = stateOf(s)
    var hand = handoverOf(s)
    var handTakesOver = hand && (st.key === 'live' || st.key === 'over' || st.key === 'ready' || st.key === 'checkedin')
    /* All in the top-right, where "In session" sits. Once the patient is
       checked in, "Checked in" replaces the live state there; marking ready
       adds "Ready for provider" beside it, same size. They wrap to a second
       line only on a genuinely narrow tile. */
    var topBadgeHTML
    if (handTakesOver && hand.key === 'ready') {
      topBadgeHTML = '<span class="cc-state cc-state-checkedin">Checked in</span>'
                   + '<span class="cc-state cc-state-ready">Ready for provider</span>'
    } else if (handTakesOver) {
      topBadgeHTML = '<span class="cc-state cc-state-checkedin">Checked in</span>'
    } else {
      topBadgeHTML = '<span class="cc-state">' + esc(st.label) + '</span>'
    }
    var waitedFor = s.waitingSince ? mins(Date.now() - new Date(s.waitingSince).getTime()) : 0
    var rank = (typeof i === 'number')
      ? '<span class="cc-rank' + (i === 0 ? ' cc-rank-first' : '') + '">'
          + (i === 0 ? 'First up' : '#' + (i + 1)) + '</span>'
      : ''
    // data-mid is how the appointment alert finds this tile to light it up.
    return '<div class="cc-tile cc-' + st.key + (i === 0 ? ' cc-tile-first' : '') + '"'
      + (s.meetingId ? ' data-mid="' + esc(s.meetingId) + '"' : '') + '>'
      + '<div class="cc-tile-top">'
        + '<span class="cc-time">' + esc(fmt(s.start)) + '</span>'
        + '<span class="cc-badges">' + topBadgeHTML + '</span>'
      + '</div>'
      + rank
      + '<div class="cc-name">' + esc(s.patientName || 'Unnamed') + '</div>'
      + breakTitleHTML(s)
      + '<div class="cc-meta">' + esc(s.visitType || '—') + (s.room ? ' · ' + esc(s.room) : '') + '</div>'
      + (st.key === 'waiting'
          ? '<div class="cc-wait">Waiting ' + waitedFor + ' min at the door</div>' : '')
      + '<div class="cc-tile-actions">'
        + (s.meetingId
            ? (st.key === 'waiting'
                ? '<button class="btn btn-primary btn-sm" data-onclick="ccAdmitAll(\'' + esc(s.meetingId) + '\')">Admit</button>' : '')
              + '<button class="btn btn-ghost btn-sm" data-onclick="ccJoin(\'' + esc(s.meetingId) + '\')">'
                + (st.key === 'live' ? 'Join' : 'Open') + '</button>'
              + '<button class="btn btn-ghost btn-sm" data-onclick="ccCopyLink(\'' + esc(s.meetingId) + '\')">Copy Link</button>'
            : '<span class="cc-inperson-note">No video room</span>')
      + '</div>'
    + '</div>'
  }

  function filterLabel(key) {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].key === key) return FILTERS[i].label
    return 'All'
  }

  function filterHTML() {
    var counts = {}
    for (var i = 0; i < slots.length; i++) {
      var k = stateOf(slots[i]).key
      counts[k] = (counts[k] || 0) + 1
    }
    var available = FILTERS.filter(function (f) {
      return f.key === 'all' || f.always || (counts[f.key] || 0) > 0
    })
    var active = filterKey !== 'all'
    var rows = available.map(function (f) {
      var n = f.key === 'all' ? slots.length : counts[f.key]
      var isActive = f.key === filterKey
      var c = FILTER_COLORS[f.key] || '#0077B6'
      return '<button type="button" class="cc-filter-opt' + (isActive ? ' active' : '') + '"'
        + (isActive ? ' data-cs="'+__cs+'--cc-filter-c:' + c + '"' : '')
        + ' data-onclick="ccSetFilter(\'' + f.key + '\')">'
        + '<span>' + esc(f.label) + '</span><span class="cc-filter-count">' + n + '</span>'
      + '</button>'
    }).join('')
    var activeColor = active ? (FILTER_COLORS[filterKey] || '#0077B6') : null
    return '<div class="cc-filter">'
      + '<button type="button" class="cc-filter-btn' + (active ? ' active' : '') + '"'
        + (activeColor ? ' data-cs="'+__cs+'--cc-filter-c:' + activeColor + '"' : '')
        + ' data-onclick="ccToggleFilterMenu(event)" aria-expanded="' + (filterMenuOpen ? 'true' : 'false') + '" aria-haspopup="true">'
        + ICON.filter + '<span>Filter</span>'
        + (active ? '<span class="cc-filter-dot"></span>' : '')
      + '</button>'
      + (filterMenuOpen
          ? '<div class="cc-filter-backdrop" data-onclick="ccCloseFilterMenu()"></div>'
            + '<div class="cc-filter-menu">' + rows + '</div>'
          : '')
    + '</div>'
  }

  window.ccToggleFilterMenu = function (e) {
    if (e) e.stopPropagation()
    filterMenuOpen = !filterMenuOpen
    render()
  }
  window.ccCloseFilterMenu = function () {
    filterMenuOpen = false
    render()
  }
  window.ccSetFilter = function (key) {
    filterKey = key
    filterMenuOpen = false
    render()
  }

  /* The one-tap prompt that stands in for automatic, within what a browser
     allows. Big, because this is a daily decision rather than a setting to go
     hunting for, and the person reading it may not want to squint at a small
     switch. Provider accounts only; see shouldOfferStart(). */
  function startPromptHTML() {
    if (!shouldOfferStart()) return ''
    return '<div class="cc-startday">'
      + '<div class="cc-startday-ico">' + ICON.pilot + '</div>'
      + '<div class="cc-startday-copy">'
        + '<strong>' + esc(greeting()) + ' — ready to start?</strong>'
        + '<span>Turn on Auto-Pilot and each patient’s video room will open for you by itself, one at a time. Your microphone stays muted until you unmute it.</span>'
      + '</div>'
      + '<div class="cc-startday-actions">'
        + '<button class="btn btn-ghost" data-onclick="ccDismissStart()">Not today</button>'
        + '<button class="cc-startday-btn" data-onclick="ccStartMyDay()">▶&nbsp; Start My Day</button>'
      + '</div>'
    + '</div>'
  }

  /* The countdown card. Also the place the queue is explained - if a call is
     already running, this is where the next patient's wait is acknowledged
     rather than left to be discovered. */
  function autoPilotCardHTML(next) {
    if (!autoPilot || !next) return ''
    var left = slotStart(next) - Date.now()
    var busy = inCall()
    if (!busy && left > LEAD_MS) {
      return '<div class="cc-pilot"><div class="cc-pilot-ico">' + ICON.pilot + '</div>'
        + '<div class="cc-pilot-copy"><strong>Next: ' + esc(next.patientName || 'Unnamed') + ' at ' + esc(fmt(next.start)) + '</strong>'
        + '<small>The room opens by itself a minute before it starts. Your microphone stays muted until you unmute it.</small></div></div>'
    }
    if (busy) {
      return '<div class="cc-pilot cc-pilot-queued"><div class="cc-pilot-ico">' + ICON.pilot + '</div>'
        + '<div class="cc-pilot-copy"><strong>' + esc(next.patientName || 'Unnamed') + ' is next — queued</strong>'
        + '<small>You are in another room, so nothing will interrupt you. End that call and this one opens.</small></div>'
        + '<div class="cc-pilot-actions"><button class="btn btn-primary btn-sm" data-onclick="ccEndAndNext()">End &amp; next</button></div></div>'
    }
    var secs = Math.max(0, Math.ceil(left / 1000))
    var held = Date.now() < holdUntil
    return '<div class="cc-pilot cc-pilot-live"><div class="cc-pilot-ico">' + ICON.pilot + '</div>'
      + '<div class="cc-pilot-copy"><strong>' + esc(next.patientName || 'Unnamed')
        + (held ? ' — held' : ' — joining in ' + secs + 's') + '</strong>'
        + '<small>' + esc(next.visitType || 'Appointment') + (next.room ? ' · ' + esc(next.room) : '') + '</small></div>'
      + '<div class="cc-pilot-actions">'
        + (held
            ? '<button class="btn btn-ghost btn-sm" data-onclick="ccResume()">Resume</button>'
            : '<button class="btn btn-ghost btn-sm" data-onclick="ccHold()">Hold</button>')
        + '<button class="btn btn-primary btn-sm" data-onclick="ccJoin(\'' + esc(next.meetingId) + '\')">Join now</button>'
      + '</div></div>'
  }

  var ICON = {
    pilot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>'
  }

  // ---------------------------------------------------------------- actions

  window.ccToggleAutoPilot = function () {
    autoPilot = !autoPilot
    holdUntil = 0
    // A provider's own choice here IS the "off" that shouldOfferStart() has
    // to respect - otherwise turning it off manually would just get asked
    // again, unprompted, the next time they logged in.
    if (isProvider()) setApPref(autoPilot ? 'on' : 'off')
    if (autoPilot) {
      showToast('Auto-Pilot on — the next room opens by itself, muted', 'ok')
    } else {
      counting = null
      showToast('Auto-Pilot off', 'ok')
    }
    render()
  }

  /* The provider's one-tap "yes" - see startPromptHTML(). Same effect as the
     switch above, just reached from the banner instead of the header, and
     framed as starting the day rather than flipping a setting. */
  window.ccStartMyDay = function () {
    autoPilot = true
    holdUntil = 0
    setApPref('on')
    showToast('Auto-Pilot on — the next room opens by itself, muted', 'ok')
    render()
  }

  // "Not today": leaves the remembered preference alone, so the prompt is
  // back tomorrow rather than gone for good over one busy morning.
  window.ccDismissStart = function () {
    startPromptDismissed = true
    render()
  }

  window.ccHold = function () {
    // Long enough to finish what you are doing; short enough that it is a
    // pause, not a silent opt-out.
    holdUntil = Date.now() + 5 * 60 * 1000
    render()
  }
  window.ccResume = function () { holdUntil = 0; render() }

  window.ccJoin = function (meetingId) {
    if (!meetingId) return
    joined[meetingId] = true
    counting = null
    if (typeof window.mtgJoin === 'function') window.mtgJoin(meetingId)
    else showPage('meetings')
  }

  window.ccEndAndNext = async function () {
    if (typeof window.mtgLeave === 'function') window.mtgLeave(true)
    // The SDK needs a moment to tear the call down before the next one opens.
    setTimeout(function () {
      var n = nextUp()
      if (n) window.ccJoin(n.meetingId)
    }, 900)
  }

  window.ccAdmitAll = async function (meetingId) {
    try {
      var d = await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(meetingId) + '/lobby')
      var list = d.waiting || []
      if (!list.length) { showToast('Nobody is waiting at that door', 'ok'); load(); return }

      var names = list.map(function (g) { return (g.displayName || 'Guest') }).join(', ')
      var one = list.length === 1
      var ok = true
      if (typeof ctgConfirm === 'function') {
        ok = await ctgConfirm(
          (one ? names + ' will' : 'They will')
            + ' see and hear everything in this meeting, including anything already on screen. '
            + 'Admit only if you are expecting ' + (one ? 'them' : 'all of them') + '.'
            + (one ? '' : ' Waiting: ' + names + '.'),
          { title: one ? 'Admit ' + names + '?' : 'Admit ' + list.length + ' people?', okLabel: 'Admit' })
      }
      if (!ok) return

      for (var i = 0; i < list.length; i++) {
        await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(meetingId) + '/lobby/' + encodeURIComponent(list[i].id),
          { method: 'POST', body: JSON.stringify({ admit: true }) })
      }
      showToast(list.length === 1 ? 'Admitted' : 'Admitted ' + list.length, 'ok')
      load()
    } catch (e) { showToast(e.message || 'Could not admit', 'err') }
  }

  window.ccCopyLink = async function (meetingId) {
    try {
      var d = await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(meetingId) + '/link', { method: 'POST' })
      var url = location.origin + location.pathname + '#mtg=' + encodeURIComponent(d.guestToken)
      await navigator.clipboard.writeText(url)
      showToast('Patient link copied — it replaces any link sent before', 'ok')
    } catch (e) { showToast(e.message || 'Could not create the link', 'err') }
  }

  // ---------------------------------------------------------------- pilot

  function autoPilotTick() {
    if (!autoPilot) return
    var next = nextUp()
    if (!next || !next.meetingId) { if (counting) { counting = null; paint() } return }

    var left = slotStart(next) - Date.now()

    // Re-render once a second only while the countdown is on screen, so the
    // rest of the day's wall is not rebuilt every tick. paint() is a no-op
    // when the board is not the page being looked at.
    if (left <= LEAD_MS && left > -30000 && !inCall()) {
      if (counting !== next.meetingId) counting = next.meetingId
      paint()
    } else if (counting) {
      counting = null
      paint()
    }

    if (Date.now() < holdUntil) return
    if (inCall()) return                      // never interrupt a live call
    if (left > 0) return                      // not yet
    if (left < -LATE_GRACE_MS) return          // too late to barge in - click the tile instead
    if (joined[next.meetingId]) return
    autoEnter(next.meetingId)
  }

  // Render only when the board is actually on screen - the tick now runs on
  // every page, and rebuilding a hidden DOM every second is pure waste. Also
  // skipped while the filter menu is open, same reasoning as load() above.
  function paint() { if (isVisible() && !filterMenuOpen) render() }

  var entering = false

  function autoEnter(meetingId) {
    if (entering) return
    entering = true
    counting = null
    var done = function (ok) {
      entering = false
      if (ok) { joined[meetingId] = true }
      paint()
    }
    if (typeof window.mtgAutoJoin !== 'function') { done(false); return }
    Promise.resolve(window.mtgAutoJoin(meetingId)).then(done, function () { done(false) })
  }
})()
