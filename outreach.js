/* Outreach page (18 Nov 2026): referrals that reach the practice by email,
 * outside CTG One. The practice types them in (name, date of birth, phone,
 * email, a note); they show as In progress and are counted as "Outreach in
 * progress" on Analytics. When one is confirmed, Accepted asks for the ACE
 * (Day 1) schedule first - date, time, facility, provider - and then the
 * patient is created in Registration (Pending Day 1) with the ACE booked.
 *
 * Server: /api/outreach (routes/outreach.js). Listeners are attached here, not
 * inline (the CSP forbids inline handlers and style attributes).
 */
(function () {
  'use strict'

  var state = { list: [], loaded: false, loading: false, error: '', tab: 'in_progress', search: '',
    saving: false, accepting: null, acceptBusy: false, facilities: ['Concussion Therapy Group', 'Provider'] }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
    })
  }
  function api(url, opts) { return window.ctgApiFetch(url, opts) }
  function toast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || '') }
  function confirmBox(msg, opts) { return typeof window.ctgConfirm === 'function' ? window.ctgConfirm(msg, opts) : Promise.resolve(window.confirm(msg)) }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : '' }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  function mdy(isoDay) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay || '')); return m ? m[2] + '/' + m[3] + '/' + m[1] : '' }
  function when(ts) { var d = ts ? new Date(ts) : null; return d && !isNaN(d) ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '' }
  function contact(r) {
    var parts = [r.phone, r.email].filter(Boolean)
    return parts.length ? parts.map(function (x) { return '<span>' + esc(x) + '</span>' }).join('') : '—'
  }
  function time12(t) {
    var m = /^(\d{2}):(\d{2})/.exec(String(t || '')); if (!m) return ''
    var h = +m[1]; return (h % 12 || 12) + ':' + m[2] + (h < 12 ? ' AM' : ' PM')
  }
  function plus60(t) {
    var m = /^(\d{2}):(\d{2})$/.exec(t || ''); if (!m) return ''
    var total = Math.min(23 * 60 + 59, +m[1] * 60 + +m[2] + 60)
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
  }
  function fullName(r) { return [r.firstName, r.lastName].filter(Boolean).join(' ') }
  // The parts of this page an account may use (Access Control, 19 Nov 2026); all when none are set.
  function can(part) { return typeof window.ctgCanSection !== 'function' || window.ctgCanSection('outreach', part) }
  // The Referrals form's age rule (19 Nov 2026): 13 or older, so the latest birthday allowed is 13 years ago today.
  var MIN_AGE = 13
  function newestQualifyingDob() { var t = new Date(); return iso(new Date(t.getFullYear() - MIN_AGE, t.getMonth(), t.getDate())) }

  function load() {
    if (!can('or.list')) { state.loaded = true; state.list = []; paint(); return Promise.resolve() }
    state.loading = true; state.error = ''; paint()
    return api('/api/outreach')
      .then(function (r) { state.list = (r && r.outreach) || []; state.loaded = true })
      .catch(function (e) { state.error = (e && e.message) || 'Could not load.' })
      .then(function () { state.loading = false; paint() })
  }
  // The provider picker (19 Nov 2026): the provider accounts, as on the referral booking form.
  function providers() { return typeof window.ctgGetProviders === 'function' ? window.ctgGetProviders() : [] }
  function providerOptions(selected) {
    return '<option value="">— Select —</option>' + providers().map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (String(p.id).toLowerCase() === String(selected || '').toLowerCase() ? ' selected' : '') + '>' + esc(p.displayName || '') + '</option>'
    }).join('')
  }
  function ensureProviders() {
    if (providers().length || typeof window.ctgLoadProviders !== 'function') return
    window.ctgLoadProviders().then(function () { if (providers().length) paint() })
  }

  /* ---------------- the page ---------------- */
  function formCard() {
    var today = iso(new Date())
    var f = function (id, label, input, cls) { return '<label class="or-field' + (cls ? ' ' + cls : '') + '" for="' + id + '"><span>' + label + '</span>' + input + '</label>' }
    return '<section class="or-card" aria-label="Add an outreach referral"><div class="or-card-head"><h2>Add a referral</h2>'
      + '<span class="or-sub">From an email. It shows as In progress until it is accepted.</span></div>'
      + '<div class="or-form">'
      + f('orFirst', 'First name <b aria-hidden="true">*</b>', '<input id="orFirst" type="text" maxlength="100" autocomplete="off" required aria-required="true">')
      + f('orLast', 'Last name <b aria-hidden="true">*</b>', '<input id="orLast" type="text" maxlength="100" autocomplete="off" required aria-required="true">')
      + f('orDob', 'Date of birth', '<input id="orDob" type="date" max="' + newestQualifyingDob() + '">')
      + f('orPhone', 'Phone', '<input id="orPhone" type="tel" maxlength="40" autocomplete="off">')
      + f('orEmail', 'Email', '<input id="orEmail" type="email" maxlength="200" autocomplete="off">')
      + f('orProv', 'Provider', '<select id="orProv">' + providerOptions('') + '</select>')
      + f('orNote', 'Note', '<textarea id="orNote" rows="2" maxlength="1000" placeholder="e.g. what the email said" data-gc="off"></textarea>', 'or-wide')
      + '</div><div class="or-actions"><button type="button" class="or-btn or-btn-primary" data-or="add"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? 'Adding…' : 'Add referral') + '</button></div></section>'
  }

  function acceptPanel(r) {
    var provSel = '<select id="orAccProv">' + providerOptions(r.providerId) + '</select>'
    var f = function (id, label, input) { return '<label class="or-field" for="' + id + '"><span>' + label + '</span>' + input + '</label>' }
    return '<div class="or-accept" role="group" aria-label="Schedule the ACE for ' + esc(fullName(r)) + '">'
      + '<div class="or-accept-title">Schedule the ACE (Day 1) for ' + esc(fullName(r)) + '</div>'
      + '<div class="or-accept-hint">Accepting adds the patient to Registration (Pending Day 1) and books this ACE on the calendar.</div>'
      + '<div class="or-form or-form-accept">'
      + f('orAccDate', 'ACE date <b aria-hidden="true">*</b>', '<input id="orAccDate" type="date" min="' + iso(new Date()) + '" required aria-required="true">')
      + f('orAccStart', 'Start <b aria-hidden="true">*</b>', '<input id="orAccStart" type="time" value="09:00" step="300" required aria-required="true">')
      + f('orAccEnd', 'End', '<input id="orAccEnd" type="time" value="10:00" step="300">')
      + f('orAccFac', 'Facility', '<select id="orAccFac">' + state.facilities.map(function (x) { return '<option>' + esc(x) + '</option>' }).join('') + '</select>')
      + f('orAccProv', 'Provider', provSel)
      + '</div><div class="or-actions">'
      + '<button type="button" class="or-btn or-btn-primary" data-or="accept-confirm" data-id="' + esc(r.id) + '"' + (state.acceptBusy ? ' disabled' : '') + '>' + (state.acceptBusy ? 'Saving…' : 'Confirm accepted') + '</button>'
      + '<button type="button" class="or-btn" data-or="accept-cancel">Cancel</button></div></div>'
  }

  function visible() {
    var q = state.search.toLowerCase()
    return state.list.filter(function (r) {
      if (r.status !== state.tab) return false
      if (!q) return true
      return (fullName(r) + ' ' + r.phone + ' ' + r.email + ' ' + r.note).toLowerCase().indexOf(q) !== -1
    })
  }

  function listCard() {
    var n = { in_progress: 0, accepted: 0 }
    state.list.forEach(function (r) { if (n[r.status] !== undefined) n[r.status]++ })
    var tab = function (k, label) {
      return '<button type="button" class="or-tab' + (state.tab === k ? ' is-on' : '') + '" data-or="tab" data-t="' + k + '" aria-pressed="' + (state.tab === k) + '">' + label + ' <span>' + n[k] + '</span></button>'
    }
    var rows = visible()
    var body
    if (state.error) body = '<div class="or-error" role="alert">' + esc(state.error) + '</div>'
    else if (!state.loaded) body = '<div class="or-muted or-pad">Loading…</div>'
    else if (!rows.length) body = '<div class="or-muted or-pad">' + (state.search ? 'No one matches.' : state.tab === 'in_progress' ? 'Nothing in progress.' : 'None accepted yet.') + '</div>'
    else if (state.tab === 'in_progress') {
      body = '<div class="or-table-wrap"><table class="or-table"><thead><tr><th>Patient</th><th>Date of birth</th><th>Contact</th><th>Note</th><th>Added</th><th><span class="or-sr">Actions</span></th></tr></thead><tbody>'
        + rows.map(function (r) {
          var open = state.accepting === r.id
          return '<tr' + (open ? ' class="is-open"' : '') + '><td class="or-name">' + esc(fullName(r)) + (r.provider ? '<span class="or-prov">' + esc(r.provider) + '</span>' : '') + '</td><td>' + esc(mdy(r.dob) || '—') + '</td><td class="or-contact">' + contact(r) + '</td>'
            + '<td class="or-note">' + esc(r.note || '—') + '</td>'
            + '<td class="or-when">' + esc(when(r.createdAt)) + (r.createdBy ? '<span>' + esc(r.createdBy) + '</span>' : '') + '</td>'
            + '<td class="or-row-actions">' + (open ? '' : (can('or.accept') ? '<button type="button" class="or-btn or-btn-primary or-btn-sm" data-or="accept" data-id="' + esc(r.id) + '">Accepted…</button>' : '')
              + (can('or.delete') ? '<button type="button" class="or-btn or-btn-sm or-btn-quiet" data-or="delete" data-id="' + esc(r.id) + '" aria-label="Delete ' + esc(fullName(r)) + '">Delete</button>' : '')) + '</td></tr>'
            + (open ? '<tr class="or-accept-row"><td colspan="6">' + acceptPanel(r) + '</td></tr>' : '')
        }).join('') + '</tbody></table></div>'
    } else {
      body = '<div class="or-table-wrap"><table class="or-table"><thead><tr><th>Patient</th><th>ACE (Day 1)</th><th>Facility</th><th>Contact</th><th>Accepted</th></tr></thead><tbody>'
        + rows.map(function (r) {
          var a = r.ace
          return '<tr><td class="or-name">' + esc(fullName(r)) + (r.provider ? '<span class="or-prov">' + esc(r.provider) + '</span>' : '') + '</td>'
            + '<td>' + (a ? esc(mdy(a.date)) + ' · ' + esc(time12(a.start)) : '—') + '</td><td>' + esc((a && a.facility) || '—') + '</td><td class="or-contact">' + contact(r) + '</td>'
            + '<td class="or-when">' + esc(when(r.acceptedAt)) + (r.acceptedBy ? '<span>' + esc(r.acceptedBy) + '</span>' : '') + '</td></tr>'
        }).join('') + '</tbody></table></div>'
    }
    return '<section class="or-card" aria-label="Outreach referrals"><div class="or-card-head"><div class="or-tabs" role="group" aria-label="Status">'
      + tab('in_progress', 'In progress') + tab('accepted', 'Accepted') + '</div>'
      + '<input type="search" class="or-search" id="orSearch" placeholder="Search…" value="' + esc(state.search) + '" aria-label="Search outreach referrals"></div>'
      + body + '</section>'
  }

  function paint() {
    var mount = document.getElementById('outreachMount')
    if (!mount) return
    var keepSearch = document.activeElement && document.activeElement.id === 'orSearch'
    var draft = {}
    ;['orFirst', 'orLast', 'orDob', 'orPhone', 'orEmail', 'orNote', 'orProv', 'orAccDate', 'orAccStart', 'orAccEnd', 'orAccFac', 'orAccProv'].forEach(function (id) { var e = document.getElementById(id); if (e) draft[id] = e.value })
    mount.innerHTML = '<div class="or-page"><div class="or-top"><div><h1>Outreach</h1><div class="or-top-sub">Referrals that came in by email</div></div>'
      + '<button type="button" class="or-btn" data-or="refresh"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Refreshing…' : 'Refresh') + '</button></div>'
      + (can('or.add') ? formCard() : '')
      + (can('or.list') ? listCard() : '')
      + (!can('or.add') && !can('or.list') ? '<section class="or-card"><div class="or-muted">Nothing on this page is turned on for your account.</div></section>' : '')
      + '</div>'
    Object.keys(draft).forEach(function (id) { var e = document.getElementById(id); if (e && draft[id]) e.value = draft[id] })
    if (keepSearch) { var s = document.getElementById('orSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length) } }
  }

  /* ---------------- actions ---------------- */
  function add() {
    var body = { firstName: val('orFirst'), lastName: val('orLast'), dob: val('orDob'), phone: val('orPhone'), email: val('orEmail'), note: val('orNote'), providerId: val('orProv') }
    if (!body.firstName || !body.lastName) { toast('Enter the patient’s first and last name.', 'err'); return }
    if (body.dob && body.dob > newestQualifyingDob()) { toast('Patients aged 12 and under cannot be referred.', 'err'); return }
    state.saving = true; paint()
    api('/api/outreach', { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) {
        if (r && r.outreach) state.list.unshift(r.outreach)
        ;['orFirst', 'orLast', 'orDob', 'orPhone', 'orEmail', 'orNote', 'orProv'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = '' })
        state.tab = 'in_progress'
        toast(fullName(body) + ' added - In progress')
      })
      .catch(function (e) { toast((e && e.message) || 'Could not add.', 'err') })
      .then(function () { state.saving = false; paint() })
  }

  function openAccept(id) {
    state.accepting = id; paint()
    ensureProviders()
  }

  function confirmAccept(id) {
    var r = state.list.filter(function (x) { return x.id === id })[0]
    if (!r) return
    var body = { date: val('orAccDate'), start: val('orAccStart'), end: val('orAccEnd'), facility: val('orAccFac'), providerId: val('orAccProv') }
    if (!body.date) { toast('Pick the ACE date.', 'err'); return }
    if (!body.start) { toast('Pick the ACE start time.', 'err'); return }
    if (body.end && body.end <= body.start) { toast('The end time must be after the start time.', 'err'); return }
    state.acceptBusy = true; paint()
    api('/api/outreach/' + encodeURIComponent(id) + '/accept', { method: 'POST', body: JSON.stringify(body) })
      .then(function (res) {
        state.list = state.list.map(function (x) { return x.id === id && res && res.outreach ? res.outreach : x })
        state.accepting = null
        toast(fullName(r) + ' accepted - in Registration, ACE booked ' + mdy(body.date) + ' ' + time12(body.start))
        // The roster in memory predates this new chart; refresh it so Registration finds them.
        if (typeof window.ctgLoadPatientStore === 'function') { try { window.ctgLoadPatientStore() } catch (e) {} }
      })
      .catch(function (e) { toast((e && e.message) || 'Could not accept.', 'err') })
      .then(function () { state.acceptBusy = false; paint() })
  }

  function remove(id) {
    var r = state.list.filter(function (x) { return x.id === id })[0]
    if (!r) return
    confirmBox('Delete ' + fullName(r) + '? Use this only for an entry added by mistake.', { okLabel: 'Delete' }).then(function (ok) {
      if (!ok) return
      api('/api/outreach/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () { state.list = state.list.filter(function (x) { return x.id !== id }); toast(fullName(r) + ' deleted'); paint() })
        .catch(function (e) { toast((e && e.message) || 'Could not delete.', 'err') })
    })
  }

  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest('[data-or]')
    if (!b || b.disabled) return
    var a = b.getAttribute('data-or'), id = b.getAttribute('data-id')
    if (a === 'refresh') load()
    else if (a === 'add') add()
    else if (a === 'tab') { state.tab = b.getAttribute('data-t'); state.accepting = null; paint() }
    else if (a === 'accept') openAccept(id)
    else if (a === 'accept-cancel') { state.accepting = null; paint() }
    else if (a === 'accept-confirm') confirmAccept(id)
    else if (a === 'delete') remove(id)
  }
  function onInput(ev) {
    if (ev.target && ev.target.id === 'orSearch') { state.search = ev.target.value; paint() }
  }
  function onChange(ev) {
    // A new start moves the end along to an hour later.
    if (ev.target && ev.target.id === 'orAccStart') { var e = document.getElementById('orAccEnd'), n = plus60(ev.target.value); if (e && n) e.value = n }
  }
  function onKey(ev) {
    if (ev.key === 'Enter' && ev.target && /^or(First|Last|Phone|Email)$/.test(ev.target.id || '')) { ev.preventDefault(); add() }
  }

  var wired = false
  window.renderOutreach = function () {
    var mount = document.getElementById('outreachMount')
    if (mount && !wired) {
      mount.addEventListener('click', onClick)
      mount.addEventListener('input', onInput)
      mount.addEventListener('change', onChange)
      mount.addEventListener('keydown', onKey)
      wired = true
    }
    state.accepting = null
    ensureProviders()
    load()
  }
})()
