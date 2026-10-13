(function () {
  'use strict'

  var LEAD_MS = 60 * 1000          // "starting now" begins a minute out
  var STALE_MS = 20 * 60 * 1000    // stop shouting about a visit this long past
  var POLL_MS = 30000

  var poll = null
  var slots = []
  var seen = {}                    // key -> true, so one event alerts once
  var current = null               // the alert on screen
  var dismissed = {}
  var askedForPermission = false

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function todayISO() {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  // Wall-clock maths belongs in the browser: appointment times are the
  // clinic's local time and the server runs on UTC.
  function startOf(s) { return new Date(s.date + 'T' + s.start + ':00').getTime() }
  function fmt(t) {
    var h = parseInt(t.slice(0, 2), 10), m = t.slice(3, 5)
    var ap = h >= 12 ? 'PM' : 'AM'
    return (h % 12 || 12) + ':' + m + ' ' + ap
  }

  // ---------------------------------------------------------------- lifecycle

  window.ctgApptAlertsStart = function () {
    window.ctgApptAlertsStop()
    check()
    poll = setInterval(check, POLL_MS)
  }
  window.ctgApptAlertsStop = function () {
    clearInterval(poll); poll = null
    slots = []; seen = {}; dismissed = {}
    hide()
  }
  // A knock or a room change is worth looking at immediately rather than
  // waiting out the poll - this is what makes "patient is waiting" instant.
  window.ctgApptAlertsPing = function () { check() }

  async function check() {
    if (!window.ctgApiFetch) return
    try {
      var d = await window.ctgApiFetch('/api/appointments/board?date=' + encodeURIComponent(todayISO()))
      slots = d.slots || []
    } catch (e) { return }
    evaluate()
  }

  /* Pick the single most deserving thing to say. One alert at a time is a
     deliberate limit: a stack of five cards is noise, and noise is how a real
     one gets ignored. */
  function evaluate() {
    var now = Date.now()
    var best = null

    slots.forEach(function (s) {
      if (!s.meetingId || s.meetingStatus === 'ended') return
      var start = startOf(s)
      if (now - start > STALE_MS) return

      if (s.waiting > 0) {
        var wk = 'wait:' + s.meetingId + ':' + s.waiting
        if (!dismissed[wk] && (!best || best.rank > 1)) {
          best = { rank: 1, key: wk, slot: s, kind: 'waiting' }
        }
        return
      }
      if (now >= start - LEAD_MS && s.meetingStatus !== 'live') {
        var dk = 'due:' + s.meetingId
        if (!dismissed[dk] && (!best || best.rank > 2)) {
          best = { rank: 2, key: dk, slot: s, kind: 'due' }
        }
      }
    })

    if (!best) { hide(); return }
    if (current && current.key === best.key) return   // already on screen

    current = best
    show(best)
    if (!seen[best.key]) {
      seen[best.key] = true
      desktop(best)      // fires once per event, not on every poll
    }
  }

  // ---------------------------------------------------------------- in-app

  function show(a) {
    var host = document.getElementById('ctgApptAlert') || (function () {
      var d = document.createElement('div')
      d.id = 'ctgApptAlert'
      document.body.appendChild(d)
      return d
    })()

    var s = a.slot
    var waiting = a.kind === 'waiting'
    var canAskDesktop = ('Notification' in window) && Notification.permission === 'default' && !askedForPermission

    host.className = 'ctg-alert show' + (waiting ? ' waiting' : '')
    host.innerHTML =
      '<div class="ctg-alert-bar"></div>'
      + '<div class="ctg-alert-body" data-onclick="ctgApptAlertOpen()">'
        + '<div class="ctg-alert-kicker">' + (waiting ? 'Patient waiting' : 'Appointment starting') + '</div>'
        + '<div class="ctg-alert-name">' + esc(s.patientName || 'Unnamed') + '</div>'
        + '<div class="ctg-alert-meta">' + esc(fmt(s.start))
          + (s.visitType ? ' · ' + esc(s.visitType) : '')
          + (s.room ? ' · ' + esc(s.room) : '') + '</div>'
        + '<div class="ctg-alert-cta">' + (waiting ? 'Open the room and let them in' : 'Open the room') + ' →</div>'
      + '</div>'
      + (canAskDesktop
          ? '<button class="ctg-alert-perm" data-onclick="ctgApptAlertAskDesktop()">Also alert me when the portal is not in front</button>'
          : '')
      + '<button class="ctg-alert-x" data-onclick="ctgApptAlertDismiss()" aria-label="Dismiss">×</button>'
  }

  function hide() {
    var host = document.getElementById('ctgApptAlert')
    if (host) { host.className = 'ctg-alert'; host.innerHTML = '' }
    current = null
  }

  window.ctgApptAlertDismiss = function () {
    if (current) dismissed[current.key] = true
    hide()
    evaluate()      // something else may still deserve the slot
  }

  window.ctgApptAlertOpen = function () {
    if (!current) return
    var id = current.slot.meetingId
    dismissed[current.key] = true
    hide()
    if (typeof window.mtgJoin === 'function') {
      window.mtgJoin(id)
      return
    }
    /* meetings.js hasn't loaded (shouldn't happen post-login, but a page
       reload mid-navigation could catch it) - fall back to wherever the
       account can actually get to the room. */
    var canBoard = typeof window.ctgCanPage !== 'function' || window.ctgCanPage('commandCenter')
    if (typeof showPage === 'function') showPage(canBoard ? 'commandCenter' : 'meetings')
    if (canBoard && typeof window.ccFocusMeeting === 'function') window.ccFocusMeeting(id)
  }

  // ---------------------------------------------------------------- desktop

  window.ctgApptAlertAskDesktop = function () {
    askedForPermission = true
    if (!('Notification' in window)) return
    // Must be called from a click - browsers refuse the prompt otherwise.
    Notification.requestPermission().then(function (p) {
      if (current) show(current)
      if (p === 'granted' && typeof showToast === 'function') {
        showToast('Desktop alerts on — appointments will reach you outside the portal', 'ok')
      }
    })
  }

  function desktop(a) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    // Only when the portal is not the window being looked at. A desktop
    // notification on top of the page you are already reading is just noise.
    if (document.visibilityState === 'visible' && document.hasFocus()) return
    var s = a.slot
    try {
      var n = new Notification(
        a.kind === 'waiting' ? (s.patientName || 'A patient') + ' is waiting' : (s.patientName || 'Appointment') + ' — starting now',
        {
          body: fmt(s.start) + (s.visitType ? ' · ' + s.visitType : '') + '\nClick to open the room.',
          /* Tag keeps a re-fired alert replacing the old one instead of
             stacking three identical banners. renotify makes the replacement
             still announce itself. */
          tag: a.key,
          renotify: true,
          requireInteraction: a.kind === 'waiting'
        }
      )
      n.onclick = function () {
        window.focus()
        n.close()
        window.ctgApptAlertOpen()
      }
    } catch (e) { /* a blocked notification must never break the page */ }
  }
})()
