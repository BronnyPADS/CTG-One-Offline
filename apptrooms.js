(function () {
  'use strict'

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // The rooms list lives in the shared appointment config, loaded and saved by
  // apptconfig.js. This page is another editor of the same document, not a
  // second store - two stores would drift the moment anyone used both.
  function cfg() {
    return (typeof apptCfgLoad === 'function') ? apptCfgLoad() : { rooms: [] }
  }
  function rooms() {
    var c = cfg()
    if (!Array.isArray(c.rooms)) c.rooms = []
    return c.rooms
  }
  function facilities() {
    return (typeof APPT_FACILITIES !== 'undefined' && APPT_FACILITIES) || []
  }

  var editingId = null

  /* How many of today's bookings use each room, and how many of those already
     have their video room open. Counting from the live appointment list rather
     than storing a tally means the number cannot go stale. */
  function usageFor(room) {
    var list = (typeof ctgAppointments !== 'undefined' && ctgAppointments) || []
    var today = new Date()
    var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0')
      + '-' + String(today.getDate()).padStart(2, '0')
    var mine = list.filter(function (a) { return a.room === room.name && a.facility === room.facility })
    return {
      today: mine.filter(function (a) { return a.date === iso }).length,
      upcoming: mine.filter(function (a) { return a.date >= iso }).length,
      withRoom: mine.filter(function (a) { return a.date >= iso && a.meetingId }).length
    }
  }

  window.renderApptRooms = function () {
    var host = document.getElementById('apptRoomsMount')
    if (!host) return
    // Pull the shared document before drawing, so a room another user added
    // shows up without a reload.
    if (typeof apptCfgLoadRemote === 'function' && !window._apptRoomsFetched) {
      window._apptRoomsFetched = true
      apptCfgLoadRemote(false).then(function () { window.renderApptRooms() })
    }

    var list = rooms().slice().sort(function (a, b) {
      return String(a.facility || '').localeCompare(String(b.facility || ''))
        || String(a.name).localeCompare(String(b.name))
    })
    var e = editingId ? list.find(function (x) { return x.id === editingId }) : null
    var d = e || { name: '', facility: '', active: true, telehealth: false }

    host.innerHTML =
      '<div class="wrap arm-wrap">'
      + '<div class="pt-strip arm-strip">'
        + '<div><div class="arm-strip-title">Rooms</div>'
        + '<div class="arm-strip-sub">Where appointments happen. A video room turns every booking into its own meeting, with a link the patient can open without an account.</div></div>'
      + '</div>'

      + '<div class="card"><div class="card-hd"><strong>' + (e ? 'Edit room' : 'New room') + '</strong></div>'
      + '<div class="card-body">'
        + '<div class="arm-form">'
          + '<div class="fg"><label for="armName">Room</label>'
            + '<input type="text" id="armName" placeholder="e.g. Exam 1, Telehealth A" value="' + esc(d.name) + '"></div>'
          + '<div class="fg"><label for="armFacility">Facility</label><select id="armFacility">'
            + '<option value="">— Select —</option>'
            + facilities().map(function (f) {
                return '<option value="' + esc(f) + '"' + (f === d.facility ? ' selected' : '') + '>' + esc(f) + '</option>'
              }).join('')
          + '</select></div>'
        + '</div>'

        + '<div class="arm-row">'
          + '<label class="arm-chk"><input type="checkbox" id="armVideo"' + (d.telehealth ? ' checked' : '') + '>'
            + '<span>Video room</span></label>'
          + '<label class="arm-chk"><input type="checkbox" id="armActive"' + (d.active !== false ? ' checked' : '') + '>'
            + '<span>Active</span></label>'
          + '<div class="arm-actions">'
            + (e ? '<button class="btn btn-ghost" data-onclick="armCancel()">Cancel</button>' : '')
            + '<button class="btn btn-primary" data-onclick="armSave()">' + (e ? 'Save changes' : 'Add room') + '</button>'
          + '</div>'
        + '</div>'
        + '<p class="arm-hint">A <strong>video room</strong> gives every appointment booked into it a meeting, a lobby and a patient link — automatically.</p>'
      + '</div></div>'

      + (list.length
          ? '<div class="card"><div class="card-body">'
            + '<div class="acfg-table-wrap"><table class="acfg-table">'
            + '<thead><tr><th>Room</th><th>Facility</th><th>Type</th><th>Status</th><th></th></tr></thead>'
            + '<tbody>' + list.map(rowHTML).join('') + '</tbody></table></div>'
            + '</div></div>'
          : '<div class="card"><div class="card-body"><div class="pld-empty-state">'
            + 'No rooms yet — add the first one above.'
            + '</div></div></div>')
      + '</div>'
  }

  function rowHTML(r) {
    var u = usageFor(r)
    return '<tr class="' + (r.active === false ? 'acfg-off' : '') + '">'
      + '<td><span class="arm-name">' + esc(r.name) + '</span>'
        + (u.upcoming ? '<span class="arm-use">' + u.upcoming + ' upcoming</span>' : '') + '</td>'
      + '<td>' + esc(r.facility || '—') + '</td>'
      + '<td>' + (r.telehealth
          ? '<span class="arm-badge arm-badge-video">' + ICON.video + 'Video</span>'
          : '<span class="arm-badge">In person</span>') + '</td>'
      + '<td>' + (r.active !== false ? 'Active' : 'Inactive') + '</td>'
      + '<td class="acfg-actions">'
        + '<button class="btn btn-ghost btn-sm" data-onclick="armEdit(\'' + esc(r.id) + '\')">Edit</button>'
        + '<button class="btn btn-ghost btn-sm acfg-del" data-onclick="armDelete(\'' + esc(r.id) + '\')">Delete</button>'
      + '</td></tr>'
  }

  var ICON = {
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M15 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
  }

  window.armEdit = function (id) {
    editingId = id
    window.renderApptRooms()
    var el = document.getElementById('armName')
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }
  window.armCancel = function () { editingId = null; window.renderApptRooms() }

  window.armSave = function () {
    var name = (document.getElementById('armName').value || '').trim()
    var facility = document.getElementById('armFacility').value
    if (!name) { showToast('Enter a room name', 'err'); return }
    if (!facility) { showToast('Select a facility', 'err'); return }

    var list = rooms()
    var clash = list.find(function (x) {
      return String(x.name).toLowerCase() === name.toLowerCase() && x.facility === facility && x.id !== editingId
    })
    if (clash) { showToast('That room already exists for this facility', 'err'); return }

    var row = editingId ? list.find(function (x) { return x.id === editingId }) : { id: newId() }
    if (!row) return
    row.name = name
    row.facility = facility
    row.active = document.getElementById('armActive').checked
    row.telehealth = document.getElementById('armVideo').checked
    if (!editingId) list.push(row)

    editingId = null
    if (typeof apptCfgSave === 'function') apptCfgSave()
    window.renderApptRooms()
    showToast('Room saved', 'ok')
  }

  window.armDelete = async function (id) {
    var list = rooms()
    var row = list.find(function (x) { return x.id === id })
    if (!row) return
    var u = usageFor(row)
    /* Deleting a room that still has bookings would leave those appointments
       pointing at a room nobody can find. Say so, and offer the reversible
       option instead. */
    if (u.upcoming) {
      var keep = await ctgConfirm(
        row.name + ' has ' + u.upcoming + ' upcoming appointment' + (u.upcoming === 1 ? '' : 's') + '. '
        + 'Deleting it leaves those bookings pointing at a room that no longer exists. '
        + 'Marking it inactive keeps them intact and stops anything new being booked into it.',
        { title: 'Room is in use', okLabel: 'Mark inactive' }
      )
      if (keep) {
        row.active = false
        if (typeof apptCfgSave === 'function') apptCfgSave()
        window.renderApptRooms()
        showToast('Room marked inactive', 'ok')
      }
      return
    }
    if (!(await ctgConfirm('Delete ' + row.name + '?', { danger: true, okLabel: 'Delete' }))) return
    var c = cfg()
    c.rooms = list.filter(function (x) { return x.id !== id })
    if (typeof apptCfgSave === 'function') apptCfgSave()
    window.renderApptRooms()
    showToast('Room deleted', 'ok')
  }

  function newId() {
    return (typeof apptCfgNewId === 'function')
      ? apptCfgNewId()
      : 'rm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  }

  /* Any page can ask whether a room does video - the appointment modal uses it
     to decide whether to offer a meeting for the booking. */
  window.apptRoomIsVideo = function (name, facility) {
    var r = rooms().find(function (x) {
      return x.name === name && (!facility || x.facility === facility)
    })
    return !!(r && r.telehealth)
  }
})()
