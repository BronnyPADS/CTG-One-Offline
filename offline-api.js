/* CTG One - offline version: a stand-in for the server.
 *
 * Built into the offline folder by tools/build_offline.py; never deployed.
 * Every call the portal makes to /api/... is answered here from this
 * browser's IndexedDB on the PC's own drive, so the copy runs from a folder
 * with no server, no database and no internet - the way the portal worked
 * before it was deployed.
 *
 * What works: sign-in (offline accounts), Access Control, patients, Day 1,
 * exams, daily notes, intake, billing, documents, comments,
 * appointments, break/blocks, referrals, shared settings, patient chart notes.
 * What does not: video meetings, messaging, patient texts and emails, emailed
 * codes, RecoverArc notes, backups. Those answer "not available offline".
 *
 * Nothing here is secret: the passwords below exist only in this copy, which
 * is for checking the portal works on a device - not for real patients.
 */
(function () {
  'use strict'

  // Filled in by tools/build_offline.py from backend/src/rbac.js.
  var ROLE_DEFAULT_KEYS = {"provider":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","neuroReferrals","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging"],"ta":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","registration","reg.patient","reg.address","reg.case","reg.pendingAce","__sections_configured__:registration","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","neuroReferrals","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","apptConfigs","acfg.visitTypes","acfg.eligibility","acfg.rooms","acfg.schedulers","acfg.workingHours","acfg.colorLegend","__sections_configured__:apptConfigs","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","day2","exam.context","exam.uploads","exam.sway","exam.reflex","exam.shoebox","exam.actions","__sections_configured__:day2","dailyNotes","dn.context","dn.exercise","dn.notes","dn.attachments","dn.actions","__sections_configured__:dailyNotes","intakeForm","intake.demographics","intake.insurance","intake.consent","intake.minorAuth","intake.documents","intake.pdfs","__sections_configured__:intakeForm","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging","patientMessaging","pm.read","pm.send","pm.call","pm.templates","pm.contacts","__sections_configured__:patientMessaging","invitePatient","msg.newInvite","msg.defaults","msg.newPatient","msg.history","__sections_configured__:invitePatient"],"compliance":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","registration","reg.patient","reg.address","reg.case","reg.pendingAce","__sections_configured__:registration","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","outreach","or.list","or.add","or.accept","or.delete","__sections_configured__:outreach","neuroReferrals","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","apptConfigs","acfg.visitTypes","acfg.eligibility","acfg.rooms","acfg.schedulers","acfg.workingHours","acfg.colorLegend","__sections_configured__:apptConfigs","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","day2","exam.context","exam.uploads","exam.sway","exam.reflex","exam.shoebox","exam.actions","__sections_configured__:day2","dailyNotes","dn.context","dn.exercise","dn.notes","dn.attachments","dn.actions","__sections_configured__:dailyNotes","intakeForm","intake.demographics","intake.insurance","intake.consent","intake.minorAuth","intake.documents","intake.pdfs","__sections_configured__:intakeForm","arSummary","ar.patientInfo","ar.dates","ar.summary","ar.receivables","ar.payments","ar.notes","__sections_configured__:arSummary","collectionMgmt","cm.worklist","cm.filters","cm.followup","cm.notes","__sections_configured__:collectionMgmt","neuroBilling","neuroPayments","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging","patientMessaging","pm.read","pm.send","pm.call","pm.templates","pm.contacts","__sections_configured__:patientMessaging","invitePatient","msg.newInvite","msg.defaults","msg.newPatient","msg.history","__sections_configured__:invitePatient"],"lawyer":["patientLists","pl.billing","pl.fcr","__sections_configured__:patientLists","referrals","ref.submit","ref.inbox","ref.details","ref.decline","__sections_configured__:referrals","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging"]}

  var OFFLINE_PASSWORD = 'CTGPassword'
  var OFFLINE_ACCOUNTS = [
    { username: 'CTG User', displayName: 'CTG User', role: 'admin' },
    { username: 'Provider', displayName: 'Nicholas A. Grande', role: 'provider' }
  ]

  // Read by the patched localDefaultAccounts() in ctg-auth.js.
  window.ctgOfflineAccounts = function () {
    return OFFLINE_ACCOUNTS.map(function (a, i) {
      return {
        id: 'offline-' + a.role + '-' + i, username: a.username, displayName: a.displayName,
        role: a.role, lawFirm: a.lawFirm || '', password: OFFLINE_PASSWORD, active: true,
        pages: a.role === 'admin' ? [] : (ROLE_DEFAULT_KEYS[a.role] || []).slice()
      }
    })
  }

  /* ------------------------------ storage ------------------------------ */
  var K = {
    patients: 'ctg_offline_patients_v1',
    appts: 'ctg_offline_appointments_v1',
    blocks: 'ctg_offline_breakblocks_v1',
    referrals: 'ctg_offline_referrals_v1',
    outreach: 'ctg_offline_outreach_v1',
    docs: 'ctg_offline_docs_v1',
    charts: 'ctg_offline_charts_v1',
    seeded: 'ctg_offline_seeded_v1'
  }
  /* Everything this copy saves lives in IndexedDB on the PC's own drive, not
   * localStorage: localStorage holds about 5 MB for every file:// page
   * together, which a few scans - or in time a long patient list - filled.
   * IndexedDB can use a large share of the free disk.
   *   records  key -> JSON text (patients, appointments, referrals...), read
   *            into memory once at start-up so the router stays synchronous;
   *            every change is written through, and a call answers only once
   *            its writes are on disk.
   *   docs     document id -> data URL, read when a document is opened.
   * Without IndexedDB everything stays in localStorage as before. */
  var FULL_ERR = 'This browser\'s offline storage is full. Remove some documents and try again.'
  var MOVED = 'ctgone_offline_in_idb'   // set once the data lives in IndexedDB
  var db = null, rec = null, ready = null
  var lastWrite = Promise.resolve(), writeErr = null

  function isRecordKey(k) { return k.indexOf('ctg_offline_') === 0 && k !== K.docs }
  function storeError(e) {
    return e && e.name === 'QuotaExceededError' ? httpError(413, FULL_ERR) : httpError(500, (e && e.message) || 'Offline storage error')
  }
  function idbTx(stores, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(stores, mode), out = fn(tx)
      tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out) }
      tx.onerror = tx.onabort = function () { reject(storeError(tx.error)) }
    })
  }
  function idbOpen() {
    return new Promise(function (resolve) {
      var req
      try { req = window.indexedDB && window.indexedDB.open('ctg_offline_docs', 2) } catch (e) { req = null }
      if (!req) return resolve(null)
      req.onupgradeneeded = function () {
        var d = req.result
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs')
        if (!d.objectStoreNames.contains('records')) d.createObjectStore('records')
      }
      req.onerror = function () { resolve(null) }
      req.onsuccess = function () { resolve(req.result) }
    })
  }
  function readRecords() {
    return new Promise(function (resolve, reject) {
      var all = {}, req = db.transaction('records').objectStore('records').openCursor()
      req.onsuccess = function () { var c = req.result; if (c) { all[c.key] = c.value; c.continue() } else resolve(all) }
      req.onerror = function () { reject(storeError(req.error)) }
    })
  }
  // One-time move of what earlier copies kept in localStorage.
  function moveFromLocalStorage() {
    var keys = []
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && isRecordKey(k)) keys.push(k) }
    var oldDocs = null
    try { oldDocs = JSON.parse(localStorage.getItem(K.docs)) } catch (e) { oldDocs = null }
    if (!keys.length && !oldDocs) { localStorage.setItem(MOVED, '1'); return null }
    var moved = {}
    return idbTx(['records', 'docs'], 'readwrite', function (tx) {
      keys.forEach(function (k) { if (!(k in rec)) { moved[k] = localStorage.getItem(k); tx.objectStore('records').put(moved[k], k) } })
      Object.keys(oldDocs || {}).forEach(function (id) { tx.objectStore('docs').put(oldDocs[id], id) })
    }).then(function () {
      Object.keys(moved).forEach(function (k) { rec[k] = moved[k] })
      keys.forEach(function (k) { localStorage.removeItem(k) })
      localStorage.removeItem(K.docs)
      localStorage.setItem(MOVED, '1')
    })
  }
  function init() {
    if (ready) return ready
    ready = idbOpen().then(function (d) {
      if (!d) {
        // Never fall back once the data has moved: that would show an empty copy.
        if (localStorage.getItem(MOVED) === '1') throw httpError(503, 'The offline storage on this PC could not be opened. Close other CTG One tabs and reload the page.')
        return
      }
      db = d
      db.onversionchange = function () { db.close() }
      return readRecords().then(function (all) { rec = all; return moveFromLocalStorage() })
    }).catch(function (e) { ready = null; db = null; rec = null; throw e })
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist() } catch (e) { /* best effort */ }
    return ready
  }

  function load(key, fallback) {
    try {
      var s = rec ? rec[key] : localStorage.getItem(key)
      var v = s == null ? null : JSON.parse(s)
      return v == null ? fallback : v
    } catch (e) { return fallback }
  }
  function save(key, value) {
    var s = JSON.stringify(value)
    if (!rec) {
      try { localStorage.setItem(key, s) } catch (e) { throw httpError(413, FULL_ERR) }
      return
    }
    var prev = rec[key]
    rec[key] = s
    lastWrite = idbTx('records', 'readwrite', function (tx) { tx.objectStore('records').put(s, key) })
    lastWrite.catch(function (e) {
      writeErr = e
      if (rec[key] === s) { if (prev === undefined) delete rec[key]; else rec[key] = prev }
    })
  }

  function docOp(mode, fn) {
    if (!db) {
      return Promise.resolve().then(function () {
        var docs = load(K.docs, {})
        var out = fn(null, docs)
        if (mode === 'readwrite') save(K.docs, docs)
        return out
      })
    }
    return idbTx('docs', mode, function (tx) { return fn(tx.objectStore('docs'), null) })
  }
  function docPut(id, dataUrl) { return docOp('readwrite', function (s, m) { if (s) s.put(dataUrl, id); else m[id] = dataUrl }) }
  function docGet(id) { return docOp('readonly', function (s, m) { return s ? s.get(id) : (m[id] || '') }) }
  function docDel(ids) { return docOp('readwrite', function (s, m) { ids.forEach(function (id) { if (s) s.delete(id); else delete m[id] }) }) }

  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
  function now() { return new Date().toISOString() }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)) }

  function httpError(status, message, body) {
    var e = new Error(message); e.status = status; e.body = body || { error: message }; return e
  }
  var OFFLINE_MSG = 'Not available in the offline version.'

  /* Fictional starting data, written once per browser. */
  function seed() {
    if (load(K.seeded, null)) return
    try {
      var firms = JSON.parse(localStorage.getItem('ctg_registered_law_firms_v1') || '[]')
      if (firms.indexOf('Sample Law Firm') === -1) firms.push('Sample Law Firm')
      localStorage.setItem('ctg_registered_law_firms_v1', JSON.stringify(firms))
    } catch (e) { /* the firm list is a convenience */ }
    var mk = function (id, first, last, dob, extra) {
      return Object.assign(emptyPatient(id), {
        demographics: Object.assign({
          firstName: first, lastName: last, dob: dob, gender: '', mrn: 'S-' + id.slice(-3),
          addressLine: '100 Sample Street', city: 'Baltimore', state: 'MD', zip: '21201',
          email: '', mobile: '', doi: '2026-09-01', lawFirm: 'Sample Law Firm',
          facility: 'Concussion Therapy Group', provider: 'Provider', case: 'Neuro 1', device: ''
        }, extra || {})
      })
    }
    save(K.patients, [
      Object.assign(mk('pt_sample_001', 'Taylor', 'Sample', '1990-04-12'), { pendingAce: true }),
      mk('pt_sample_002', 'Jordan', 'Example', '1985-11-03'),
      mk('pt_sample_003', 'Casey', 'Placeholder', '1978-02-20', { lawFirm: '' })
    ])
    save(K.appts, [
      apptRow({ patientId: 'pt_sample_002', patientName: 'Example, Jordan', date: today(), start: '10:00', end: '11:00', visitType: 'Daily Note', status: 'Unconfirmed', facility: 'Concussion Therapy Group' })
    ])
    save(K.referrals, [referralRow({
      lawFirm: 'Sample Law Firm', kind: 'refer', submittedByName: 'Law Firm User',
      patient: { firstName: 'Riley', lastName: 'Sample', dob: '1995-06-30', mobile: '', email: '', doi: '2026-09-20' },
      notes: 'Sample referral.'
    })])
    save(K.seeded, 1)
  }

  function emptyPatient(id) {
    var t = now()
    return {
      id: id, demographics: {}, inactive: false, inactiveSince: null, dischargeDate: null, adminDischarged: false,
      pendingAce: false, aceComplete: false, pregnancy: null, notesPatientId: '', notes: { text: '' },
      createdAt: t, updatedAt: t, ace: null, aceVersion: 0, initialExam: null, reExams: [], finalExam: null,
      dailyNotes: [], intake: {}, billing: { ar: {}, billingEdits: {} }, documents: { uploads: [] }, comments: []
    }
  }

  function currentUser() {
    try { return (typeof window.ctgCurrentUser === 'function' && window.ctgCurrentUser()) || null } catch (e) { return null }
  }
  function lawFirmOf(u) { return u && u.role === 'lawyer' ? String(u.lawFirm || '') : null }

  /* ------------------------------ patients ----------------------------- */
  var CONTROL_KEYS = { aceBaseVersion: 1, aceForceOverwrite: 1, fullyLoaded: 1 }
  function patientsFor(u) {
    var list = load(K.patients, [])
    var firm = lawFirmOf(u)
    return firm === null ? list : list.filter(function (p) { return String((p.demographics || {}).lawFirm || '') === firm })
  }
  function findPatient(id) { return load(K.patients, []).filter(function (p) { return p.id === id })[0] || null }
  function putPatient(p) {
    var list = load(K.patients, [])
    var i = list.findIndex(function (x) { return x.id === p.id })
    if (i === -1) list.push(p); else list[i] = p
    save(K.patients, list)
  }
  function saveFull(id, body) {
    var u = currentUser()
    if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
    var p = findPatient(id) || emptyPatient(id)
    // The report files are the upload route's to change, never a save's (as on the server).
    var keepFiles = p.neuroReferral && Array.isArray(p.neuroReferral.reportFiles) && p.neuroReferral.reportFiles.length ? p.neuroReferral.reportFiles : null
    if (keepFiles && body && body.neuroReferral) body = Object.assign({}, body, { neuroReferral: Object.assign({}, body.neuroReferral, { reportFiles: keepFiles }) })
    Object.keys(body || {}).forEach(function (k) {
      if (CONTROL_KEYS[k]) return
      p[k] = clone(body[k])
    })
    if (body && body.ace !== undefined) p.aceVersion = (p.aceVersion || 0) + 1
    p.updatedAt = now()
    putPatient(p)
    var out = clone(p); out.fullyLoaded = true
    return { patient: out }
  }

  /* ---------------------------- appointments --------------------------- */
  function apptRow(b, id) {
    var t = now()
    return {
      id: id || newId('ap_'), patientId: b.patientId || null, patientName: b.patientName || 'Unnamed',
      date: b.date, start: b.start, end: b.end, visitType: b.visitType || null, status: b.status || 'Unconfirmed',
      room: b.room || null, notes: b.notes || null, facility: b.facility || null, case: b.case || null,
      meetingId: null, checkedInAt: null, readyAt: null, createdAt: t, updatedAt: t
    }
  }
  function blockRow(b, id, u) {
    return {
      id: id || newId('bb_'), facility: b.facility || null, schedule: b.schedule || (u && u.displayName) || '',
      category: b.category || 'General', label: b.label || null, date: b.date, start: b.start, end: b.end,
      createdAt: now(), appointmentId: null
    }
  }

  /* One calendar per provider account, as the server's providerCalendars.js:
     'Provider' is the first provider account's (Dr. Grande's), kept from then
     on; every other provider's is 'Provider:<id>'. ACE visits are copied onto
     the picked provider's calendar as a block, as providerBlock.js does. */
  function offlineAccounts() {
    try { return JSON.parse(localStorage.getItem('ctg_auth_accounts_v1')) || [] } catch (e) { return [] }
  }
  function providerCalendars() {
    var provs = offlineAccounts().filter(function (a) { return a.role === 'provider' })
    var owner = null
    try { owner = localStorage.getItem('ctg_offline_provider_owner') } catch (e) { owner = null }
    if (!owner || !provs.some(function (a) { return String(a.id) === owner })) {
      var first = provs.filter(function (a) { return a.active !== false })[0] || provs[0]
      if (first && !owner) { owner = String(first.id); try { localStorage.setItem('ctg_offline_provider_owner', owner) } catch (e) {} }
    }
    var label = function (n) { n = String(n || '').trim(); return !n ? 'Provider\u2019s Calendar' : /^dr\.?\s/i.test(n) ? n : 'Dr. ' + n }
    var list = provs.map(function (a) {
      return { facility: String(a.id) === owner ? 'Provider' : 'Provider:' + a.id, label: label(a.displayName), accountId: String(a.id), active: a.active !== false }
    })
    if (!list.some(function (c) { return c.facility === 'Provider' })) list.unshift({ facility: 'Provider', label: label(''), accountId: null, active: true })
    return list
  }
  function isAce(v) { return String(v || '').toUpperCase().split(/[^A-Z0-9]+/).indexOf('ACE') !== -1 }
  // The block that mirrors an ACE visit, kept with it; returns the calendar it is on.
  function syncMirror(appt, picked, u) {
    var blocks = load(K.blocks, []), i = blocks.findIndex(function (x) { return x.appointmentId === appt.id })
    if (!isAce(appt.visitType)) { if (i !== -1) { blocks.splice(i, 1); save(K.blocks, blocks) } return null }
    var ok = picked && providerCalendars().some(function (c) { return c.facility === picked && c.active })
    var facility = (ok && picked) || (i !== -1 && blocks[i].facility) || 'Provider'
    var row = blockRow({ facility: facility, schedule: '', category: 'ACE', label: appt.patientName || 'Patient', date: appt.date, start: appt.start, end: appt.end }, i !== -1 ? blocks[i].id : null, u)
    row.appointmentId = appt.id
    if (i !== -1) blocks[i] = row; else blocks.push(row)
    save(K.blocks, blocks)
    return facility
  }
  function withProvider(appts) {
    var by = {}
    load(K.blocks, []).forEach(function (b) { if (b.appointmentId) by[b.appointmentId] = b.facility })
    return appts.map(function (a) { return Object.assign(clone(a), { providerCalendar: by[a.id] || null }) })
  }

  /* ------------------------------ referrals ---------------------------- */
  function referralRow(b) {
    var p = b.patient || {}, pref = b.preferred || {}
    return {
      id: newId('rf_'), lawFirmId: b.lawFirm || null, lawFirm: b.lawFirm || '', submittedByName: b.submittedByName || '',
      referringParty: b.referringParty || '', caseManager: b.caseManager || '', kind: b.kind === 'book' ? 'book' : 'refer',
      status: 'new',
      patient: {
        firstName: p.firstName || '', lastName: p.lastName || '', dob: p.dob || '', gender: p.gender || '',
        mobile: p.mobile || '', email: p.email || '', addressLine: p.addressLine || '', city: p.city || '',
        state: p.state || '', zip: p.zip || '', doi: p.doi || '', caseType: p.caseType || ''
      },
      attorney: { name: (b.attorney || {}).name || '', phone: (b.attorney || {}).phone || '' },
      insurance: { carrier: (b.insurance || {}).carrier || '', claimNumber: (b.insurance || {}).claimNumber || '' },
      notes: b.notes || '', symptoms: b.symptoms || {},
      preferred: { date: pref.date || '', time: pref.time || '', facility: pref.facility || '', visitType: pref.visitType || '', videoVisit: false },
      patientId: null, appointmentId: null, patientDeleted: false, decisionNote: '', decidedAt: null,
      createdAt: now(), updatedAt: now()
    }
  }
  function referralsFor(u) {
    var firm = lawFirmOf(u)
    var list = load(K.referrals, [])
    return firm === null ? list : list.filter(function (r) { return r.lawFirm === firm })
  }

  /* ------------------------------- router ------------------------------ */
  function parse(url) {
    var q = url.indexOf('?')
    var path = (q === -1 ? url : url.slice(0, q)).replace(/^\/api/, '')
    var query = {}
    if (q !== -1) url.slice(q + 1).split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1))
    })
    return { path: path, query: query, parts: path.split('/').filter(Boolean).map(decodeURIComponent) }
  }

  function handle(method, url, body) {
    seed()
    var r = parse(url), P = r.parts, u = currentUser()
    var is = function (m, n) { return method === m && P.length === n }

    // --- patients
    if (P[0] === 'patients') {
      if (is('GET', 1)) return { patients: patientsFor(u).map(function (p) { var c = clone(p); c.fullyLoaded = true; return c }) }
      var p = P[1] ? findPatient(P[1]) : null
      if (p && lawFirmOf(u) !== null && String((p.demographics || {}).lawFirm || '') !== lawFirmOf(u)) throw httpError(403, 'Not permitted')
      if (is('GET', 2)) { if (!p) throw httpError(404, 'Patient not found'); var c = clone(p); c.fullyLoaded = true; return { patient: c } }
      if (method === 'PUT' && P[2] === 'full') return saveFull(P[1], body)
      // Save Claim on the CMS-1500 tab, as the server's own route does it.
      if (method === 'PUT' && P[2] === 'claim-form') {
        if (!p) throw httpError(404, 'Patient not found')
        var claim = body && body.claimForm
        if (!claim || typeof claim !== 'object' || claim.demo) throw httpError(400, 'Clear the demo claim before saving.')
        p.claimForm = clone(claim)
        p.updatedAt = now()
        putPatient(p)
        return { ok: true }
      }
      // FCR sent to the law firm (Analytics), as the server's own routes do it.
      if (P[2] === 'fcr-sent') {
        if (!p) throw httpError(404, 'Patient not found')
        if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
        if (method === 'POST') {
          var on = String((body || {}).on || '')
          if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw httpError(400, 'Pick the date the FCR was sent (not a future date).')
          p.fcrSent = { on: on, by: (u && (u.displayName || u.username)) || '', at: now() }
          putPatient(p)
          return { fcrSent: clone(p.fcrSent) }
        }
        if (method === 'DELETE') { p.fcrSent = null; putPatient(p); return { fcrSent: null } }
      }
      if (method === 'POST' && P[1] === 'export-list') return { logged: false }
      if (method === 'POST' && (P[2] === 'view' || P[2] === 'export')) return { ok: true }
      if (is('DELETE', 2)) {
        if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
        save(K.patients, load(K.patients, []).filter(function (x) { return x.id !== P[1] }))
        // The patient's files go with them, so they stop taking space.
        var gone = p && p.documents && p.documents.uploads || []
        return docDel(gone.map(function (x) { return x.id })).then(function () { return { ok: true } }, function () { return { ok: true } })
      }
      if (P[2] === 'notes-form') throw httpError(503, 'The RecoverArc notes connection is not available in the offline version.', { error: OFFLINE_MSG, code: 'NOT_CONFIGURED' })
      // The NeuraHealth report on Neurologist Referrals, as the server's own routes do it.
      if (P[2] === 'neuro-report') {
        if (!p) throw httpError(404, 'Patient not found')
        if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
        var nref = p.neuroReferral
        var nfiles = nref && Array.isArray(nref.reportFiles) ? nref.reportFiles : []
        if (method === 'POST' && !P[3]) {
          if (!nref) throw httpError(409, 'Save the referral first, then upload the report.')
          if (nfiles.length >= 20) throw httpError(400, 'This referral already has 20 report files. Remove one first.')
          var nrec = { id: newId('doc_'), documentType: 'Neurologist Report', name: body.name || 'report', type: body.contentType || '', blobKey: '', note: '', uploadedAt: now() }
          var nfile = { id: nrec.id, name: nrec.name, type: nrec.type, at: nrec.uploadedAt, by: (u && (u.displayName || u.username)) || '' }
          return docPut(nrec.id, 'data:' + (nrec.type || 'application/octet-stream') + ';base64,' + (body.data || '')).then(function () {
            p.documents = p.documents || { uploads: [] }
            if (!Array.isArray(p.documents.uploads)) p.documents.uploads = []
            p.documents.uploads.push(nrec)
            p.neuroReferral = Object.assign({}, nref, { reportFiles: nfiles.concat([nfile]) })
            putPatient(p)
            return { file: nfile, neuroReferral: clone(p.neuroReferral) }
          })
        }
        var nf = nfiles.filter(function (x) { return x.id === P[3] })[0]
        if (!nf) throw httpError(404, 'Report not found')
        if (method === 'GET' && P[4] === 'content') {
          return docGet(nf.id).then(function (v) {
            if (!v) throw httpError(404, 'That report file is no longer on the chart.')
            return { file: { id: nf.id, name: nf.name, type: nf.type }, dataUrl: v }
          })
        }
        if (method === 'DELETE') {
          return docDel([nf.id]).then(function () {
            p.neuroReferral = Object.assign({}, nref, { reportFiles: nfiles.filter(function (x) { return x.id !== nf.id }) })
            if (p.documents && Array.isArray(p.documents.uploads)) p.documents.uploads = p.documents.uploads.filter(function (x) { return x.id !== nf.id })
            putPatient(p)
            return { ok: true, neuroReferral: clone(p.neuroReferral) }
          })
        }
      }
      if (P[2] === 'documents') {
        if (!p) throw httpError(404, 'Patient not found')
        if (method === 'POST' && P[3] === 'upload') {
          var rec = { id: newId('doc_'), documentType: body.documentType || '', name: body.name || 'file', type: body.contentType || '', blobKey: '', note: body.note || '', uploadedAt: now() }
          return docPut(rec.id, 'data:' + (rec.type || 'application/octet-stream') + ';base64,' + (body.data || '')).then(function () {
            p.documents = p.documents || { uploads: [] }; p.documents.uploads.push(rec); putPatient(p)
            return { document: rec }
          })
        }
        var d = (p.documents && p.documents.uploads || []).filter(function (x) { return x.id === P[3] })[0]
        if (!d) throw httpError(404, 'Document not found')
        if (method === 'GET' && P[4] === 'content') return docGet(d.id).then(function (v) { return { document: d, dataUrl: v || '' } })
        if (method === 'DELETE') {
          return docDel([d.id]).then(function () {
            p.documents.uploads = p.documents.uploads.filter(function (x) { return x.id !== d.id }); putPatient(p)
            return { ok: true }
          })
        }
      }
    }

    // --- appointments and break/blocks
    if (P[0] === 'appointments') {
      if (P[1] === 'break-blocks') {
        var blocks = load(K.blocks, [])
        if (is('GET', 2)) return { breakBlocks: blocks }
        if (is('POST', 2)) { var nb = blockRow(body || {}, null, u); blocks.push(nb); save(K.blocks, blocks); return { breakBlock: nb } }
        var bi = blocks.findIndex(function (x) { return x.id === P[2] })
        if (is('PUT', 3)) { if (bi === -1) throw httpError(404, 'Break/Block not found'); blocks[bi] = Object.assign(blockRow(body || {}, P[2], u), { appointmentId: blocks[bi].appointmentId || null }); save(K.blocks, blocks); return { breakBlock: blocks[bi] } }
        if (is('DELETE', 3)) { save(K.blocks, blocks.filter(function (x) { return x.id !== P[2] })); return { ok: true } }
      }
      var appts = load(K.appts, [])
      if (is('GET', 1)) return { appointments: withProvider(appts) }
      if (P[1] === 'calendars' && method === 'GET') return { calendars: providerCalendars() }
      if (P[1] === 'board' && method === 'GET') {
        var day = /^\d{4}-\d{2}-\d{2}$/.test(r.query.date || '') ? r.query.date : today()
        var cals = providerCalendars(), list = withProvider(appts.filter(function (a) { return a.date === day })), mine = null
        // A provider sees only the patients on their own calendar; anyone else may narrow to one provider.
        if (u && u.role === 'provider') {
          var own = cals.filter(function (c) { return c.accountId === String(u.id) })[0]
          mine = own ? own.facility : null
          list = list.filter(function (a) { return mine && a.providerCalendar === mine })
        } else if (r.query.provider) list = list.filter(function (a) { return a.providerCalendar === r.query.provider })
        return { date: day, mine: mine, calendars: cals.map(function (c) { return { facility: c.facility, label: c.label, active: c.active } }),
          slots: list.map(function (a) { return Object.assign(a, { meetingStatus: null, meetingStarted: null, waiting: 0, waitingSince: null, admitted: 0 }) }) }
      }
      if (is('POST', 1)) {
        var na = apptRow(body || {}); appts.push(na); save(K.appts, appts)
        na = Object.assign(clone(na), { providerCalendar: syncMirror(na, (body || {}).providerCalendar, u) })
        return { appointment: na, guestToken: null }
      }
      var ai = appts.findIndex(function (x) { return x.id === P[1] })
      if (is('PUT', 2)) {
        if (ai === -1) throw httpError(404, 'Appointment not found')
        var keepCreated = appts[ai].createdAt
        appts[ai] = Object.assign(apptRow(body || {}, P[1]), { createdAt: keepCreated }); save(K.appts, appts)
        return { appointment: Object.assign(clone(appts[ai]), { providerCalendar: syncMirror(appts[ai], (body || {}).providerCalendar, u) }), guestToken: null }
      }
      if (is('DELETE', 2)) {
        save(K.appts, appts.filter(function (x) { return x.id !== P[1] }))
        save(K.blocks, load(K.blocks, []).filter(function (x) { return x.appointmentId !== P[1] }))
        return { ok: true }
      }
      if (P[2] === 'room') throw httpError(503, 'Video rooms are not available in the offline version.')
    }

    // --- referrals
    if (P[0] === 'referrals') {
      var refs = load(K.referrals, [])
      if (P[1] === 'meta' && P[2] === 'counts') {
        var counts = {}; referralsFor(u).forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1 }); return { counts: counts }
      }
      if (P[1] === 'meta' && P[2] === 'availability') {
        var busy = []
        load(K.appts, []).filter(function (a) { return a.date === r.query.date }).forEach(function (a) { busy.push(a.start) })
        return { date: r.query.date, firstSlot: '08:00', lastSlot: '17:45', stepMinutes: 15, busy: busy.sort() }
      }
      if (is('GET', 1)) {
        var st = r.query.status
        return { referrals: referralsFor(u).filter(function (x) { return !st || st === 'all' || x.status === st }) }
      }
      if (is('POST', 1)) {
        var b = body || {}
        var firm = lawFirmOf(u) !== null ? lawFirmOf(u) : (b.lawFirm || '')
        var nr = referralRow(Object.assign({}, b, { lawFirm: firm, submittedByName: (u && u.displayName) || '' }))
        refs.unshift(nr); save(K.referrals, refs)
        return { referral: nr }
      }
      var ri = refs.findIndex(function (x) { return x.id === P[1] })
      var ref = ri === -1 ? null : refs[ri]
      if (ref && lawFirmOf(u) !== null && ref.lawFirm !== lawFirmOf(u)) ref = null
      if (!ref) throw httpError(404, 'Referral not found')
      if (is('GET', 2)) return { referral: ref }
      if (method === 'POST' && P[2] === 'accept') {
        if (u && u.role === 'lawyer') throw httpError(403, 'Referrals are accepted by the clinic, not the referring firm')
        if (ref.patientId) throw httpError(409, 'This referral has already been accepted')
        var pid = 'pt_' + Date.now().toString(36)
        var np = emptyPatient(pid)
        np.pendingAce = true
        np.demographics = {
          firstName: ref.patient.firstName, lastName: ref.patient.lastName, dob: ref.patient.dob, gender: ref.patient.gender,
          addressLine: ref.patient.addressLine, city: ref.patient.city, state: ref.patient.state, zip: ref.patient.zip,
          email: ref.patient.email, mobile: ref.patient.mobile, doi: ref.patient.doi, lawFirm: ref.lawFirm, case: ref.patient.caseType
        }
        putPatient(np)
        Object.assign(ref, { status: 'accepted', patientId: pid, decisionNote: (body && body.note) || '', decidedAt: now(), updatedAt: now() })
        refs[ri] = ref; save(K.referrals, refs)
        return { referral: ref, patientId: pid, appointmentId: null }
      }
      if (method === 'POST' && P[2] === 'decline') {
        if (ref.patientId) throw httpError(409, 'This referral has already been accepted')
        var lawyer = u && u.role === 'lawyer'
        if (lawyer && ref.status !== 'new') throw httpError(409, 'The clinic has already actioned this referral')
        Object.assign(ref, { status: lawyer ? 'withdrawn' : 'declined', decisionNote: (body && body.note) || '', decidedAt: now(), updatedAt: now() })
        refs[ri] = ref; save(K.referrals, refs)
        return { referral: ref }
      }
      if (is('DELETE', 2)) {
        if (!u || u.role !== 'admin') throw httpError(403, 'Only an administrator can delete a referral')
        save(K.referrals, refs.filter(function (x) { return x.id !== ref.id })); return { ok: true }
      }
    }

    // --- Outreach (18 Nov 2026), as routes/outreach.js: email referrals typed in by the practice;
    // accepting schedules the ACE, then creates the patient (Pending Day 1) and books it.
    if (P[0] === 'outreach') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var ors = load(K.outreach, [])
      var oneLine = function (v, max) { var t = String(v == null ? '' : v).trim(); if (!t) return null; if (t.length > max || /[\u0000-\u001f\u007f]/.test(t)) return false; return t }
      var okIso = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v }
      var orView = function (r) {
        var a = r.appointmentId ? load(K.appts, []).filter(function (x) { return x.id === r.appointmentId })[0] : null
        return Object.assign({}, r, { ace: a ? { date: a.date, start: a.start, end: a.end, facility: a.facility || '' } : null })
      }
      if (is('GET', 1)) return { outreach: ors.slice().sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)) }).map(orView) }
      if (is('GET', 2) && P[1] === 'calendars') {
        return { calendars: providerCalendars().filter(function (c) { return c.active }).map(function (c) { return { facility: c.facility, label: c.label } }), facilities: ['Concussion Therapy Group', 'Provider'] }
      }
      if (method === 'POST' && P.length === 1) {
        var ob = body || {}
        var fn = oneLine(ob.firstName, 100), ln = oneLine(ob.lastName, 100)
        if (!fn || !ln) throw httpError(400, 'The patient\u2019s first and last name are required (100 characters at most).')
        var dob = ob.dob ? String(ob.dob) : ''
        if (dob && !okIso(dob)) throw httpError(400, 'The date of birth is not a valid date.')
        if (dob && dob > today()) throw httpError(400, 'The date of birth is in the future.')
        if (dob) { var td = today(), ag = +td.slice(0, 4) - +dob.slice(0, 4) - (td.slice(5) < dob.slice(5) ? 1 : 0); if (ag < 13) throw httpError(400, 'Patients aged 12 and under cannot be referred.') }
        var ph = oneLine(ob.phone, 40)
        if (ph === false || (ph && !/^[0-9+()\-.\s]{7,40}$/.test(ph))) throw httpError(400, 'The phone number is not valid.')
        var em = oneLine(ob.email, 200)
        if (em === false || (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))) throw httpError(400, 'The email address is not valid.')
        var nt = String(ob.note == null ? '' : ob.note).replace(/\r\n/g, '\n').trim()
        if (nt.length > 1000) throw httpError(400, 'The note is too long (1000 characters at most).')
        var nr = { id: newId('or_'), status: 'in_progress', firstName: fn, lastName: ln, dob: dob, phone: ph || '', email: em || '', note: nt,
          createdAt: now(), createdBy: (u && u.displayName) || '', acceptedAt: null, acceptedBy: '', patientId: null, appointmentId: null }
        ors.unshift(nr); save(K.outreach, ors)
        return { outreach: orView(nr) }
      }
      var oi = ors.findIndex(function (x) { return x.id === P[1] })
      if (oi === -1) throw httpError(404, 'Not found')
      var orow = ors[oi]
      if (method === 'POST' && P[2] === 'accept') {
        var ab = body || {}
        var hm = function (v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : null }
        if (!okIso(ab.date)) throw httpError(400, 'Pick the ACE date.')
        var st = hm(ab.start)
        if (!st) throw httpError(400, 'Pick the ACE start time.')
        var en = ab.end ? hm(ab.end) : null
        if (!en) { var tm = Math.min(23 * 60 + 59, +st.slice(0, 2) * 60 + +st.slice(3) + 60); en = ('0' + Math.floor(tm / 60)).slice(-2) + ':' + ('0' + tm % 60).slice(-2) }
        if (en <= st) throw httpError(400, 'The end time must be after the start time.')
        if (['Concussion Therapy Group', 'Provider'].indexOf(ab.facility) === -1) throw httpError(400, 'Pick the facility.')
        if (ab.providerCalendar && !providerCalendars().some(function (c) { return c.facility === ab.providerCalendar && c.active })) throw httpError(400, 'That provider\u2019s calendar is not available.')
        if (orow.status !== 'in_progress') throw httpError(409, 'This one is already accepted.')
        var opid = 'pt_' + Date.now().toString(36)
        var op = emptyPatient(opid)
        op.pendingAce = true
        op.demographics = { firstName: orow.firstName, lastName: orow.lastName,
          dob: orow.dob ? orow.dob.slice(5, 7) + '/' + orow.dob.slice(8, 10) + '/' + orow.dob.slice(0, 4) : '', email: orow.email || '', mobile: orow.phone || '' }
        putPatient(op)
        var oa = apptRow({ patientId: opid, patientName: [orow.lastName, orow.firstName].filter(Boolean).join(', '), date: ab.date, start: st, end: en,
          visitType: 'ACE_Neuro Only', status: 'Unconfirmed', notes: 'Booked from outreach.', facility: ab.facility })
        var oas = load(K.appts, []); oas.push(oa); save(K.appts, oas)
        syncMirror(oa, ab.providerCalendar || null, u)
        Object.assign(orow, { status: 'accepted', patientId: opid, appointmentId: oa.id, acceptedAt: now(), acceptedBy: (u && u.displayName) || '' })
        ors[oi] = orow; save(K.outreach, ors)
        return { outreach: orView(orow), patientId: opid, appointmentId: oa.id }
      }
      if (is('DELETE', 2)) {
        if (orow.status !== 'in_progress') throw httpError(409, 'An accepted one cannot be deleted: the patient is in Registration.')
        ors.splice(oi, 1); save(K.outreach, ors)
        return { ok: true }
      }
    }

    // --- Analytics: counts only, as GET /api/analytics/summary works them out
    if (P[0] === 'analytics' && (P[1] === 'summary' || P[1] === 'missing') && method === 'GET') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var all = load(K.patients, [])
      var ups = function (x) { return (x.documents && Array.isArray(x.documents.uploads)) ? x.documents.uploads : [] }
      var has = function (x, t) { return ups(x).some(function (d) { return d && d.documentType === t }) }
      // The same date filter as the server: sent date, discharge date, registration date.
      var okDay = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') }
      var from = r.query.from || '', to = r.query.to || ''
      if ((from && !okDay(from)) || (to && !okDay(to))) throw httpError(400, 'Dates must be YYYY-MM-DD.')
      if (from && to && from > to) throw httpError(400, 'The From date is after the To date.')
      var inR = function (d) { return !!d && (!from || d >= from) && (!to || d <= to) }
      var anyR = !from && !to
      var dayOf = function (v) {
        var t = String(v || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
        if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2)
        return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''
      }
      var regDay = function (x) { var d = x.createdAt ? new Date(x.createdAt) : null; return d && !isNaN(d) ? d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) : '' }
      var out = { fcr: { sent: 0, pending: 0, awaiting: 0 }, toSubmit: { id: 0, intake: 0, aic: 0 }, active: 0, range: { from: from || null, to: to || null }, at: now() }
      var who = { id: [], intake: [], aic: [] }
      var nm = function (x) { return { id: x.id, name: [x.firstName, x.lastName].filter(Boolean).join(' ').trim() || '(no name)', last: x.lastName || '', first: x.firstName || '' } }
      all.forEach(function (x) {
        if (x.fcrSent && (anyR || inR(x.fcrSent.on))) out.fcr.sent++
        if (x.inactive || x.archived) return
        var discharged = !!(x.adminDischarged || String(x.dischargeDate || '').trim())
        if (discharged && !x.fcrSent && (anyR || inR(dayOf(x.dischargeDate)))) out.fcr.pending++
        // Awaiting discharge: Day 1 saved as complete, not discharged, no FCR sent (19 Nov 2026).
        if (!discharged && !x.fcrSent && x.aceComplete && (anyR || inR(x.ace ? (dayOf(x.ace.dateOfService) || regDay({ createdAt: x.ace.savedAt })) : ''))) out.fcr.awaiting++
        if (!anyR && !inR(regDay(x))) return
        out.active++
        if (!has(x, 'Valid ID') && !(x.documents && x.documents.validId)) { out.toSubmit.id++; who.id.push(nm(x)) }
        if (!has(x, 'Intake Form') && !(x.intake && x.intake.formSubmission && x.intake.formSubmission.submittedAt)) { out.toSubmit.intake++; who.intake.push(nm(x)) }
        if (!has(x, 'Auto Insurance Card')) { out.toSubmit.aic++; who.aic.push(nm(x)) }
      })
      out.outreach = { inProgress: load(K.outreach, []).filter(function (x) { return x.status === 'in_progress' }).length }
      if (P[1] === 'missing' && (r.query.item || '') === 'outreach') {
        var ol = load(K.outreach, []).filter(function (x) { return x.status === 'in_progress' })
          .sort(function (a, b) { return (a.lastName + ' ' + a.firstName).localeCompare(b.lastName + ' ' + b.firstName) })
        return { item: 'outreach', total: ol.length, patients: ol.slice(0, 200).map(function (x) { return { id: x.id, name: [x.firstName, x.lastName].join(' ') } }) }
      }
      if (P[1] === 'missing') {
        var it = r.query.item || ''
        if (!who[it]) throw httpError(400, 'Unknown item.')
        var list = who[it].sort(function (a, b) { return (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first) })
        return { item: it, total: list.length, patients: list.slice(0, 200).map(function (x) { return { id: x.id, name: x.name } }) }
      }
      return out
    }

    // --- Analytics, Technical Assistant: appointment counts, as GET /api/analytics/appointments
    if (P[0] === 'analytics' && P[1] === 'appointments' && method === 'GET') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var dOk = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') }
      var rf = r.query.from || '', rt = r.query.to || ''
      if ((rf && !dOk(rf)) || (rt && !dOk(rt))) throw httpError(400, 'Dates must be YYYY-MM-DD.')
      if (rf && rt && rf > rt) throw httpError(400, 'The From date is after the To date.')
      var tday = today(), dd = new Date(tday + 'T00:00:00'); dd.setDate(dd.getDate() - 1)
      var yday = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2)
      var ranged = !!(rf || rt)
      var last = new Date(+tday.slice(0, 4), +tday.slice(5, 7), 0)
      var pf = ranged ? (rf || '0000-01-01') : tday.slice(0, 8) + '01'
      var pt = ranged ? (rt || '9999-12-31') : tday.slice(0, 8) + ('0' + last.getDate()).slice(-2)
      var ap = load(K.appts, [])
      var live = function (x) { return String(x.status || '') !== 'Cancelled' }
      var vt = function (x, re) { return re.test(String(x.visitType || '')) }
      var on = function (d) { return ap.filter(function (x) { return x.date === d }) }
      var yl = on(yday), tl = on(tday).filter(live), pl = ap.filter(function (x) { return x.date >= pf && x.date <= pt })
      var st = function (l, v) { return l.filter(function (x) { return x.status === v }).length }
      return {
        yesterday: { date: yday, scheduled: yl.filter(live).length, completed: st(yl, 'Check-in'), rescheduled: st(yl, 'Reschedule'), pending: st(yl, 'Unconfirmed'), missed: st(yl, 'Missed') },
        today: { date: tday, scheduled: tl.length, therapy: tl.filter(function (x) { return vt(x, /^Therapy Visit/) }).length,
          initial: tl.filter(function (x) { return vt(x, /^(Day 2 Exam|Initial Exam)/) }).length, reExam: tl.filter(function (x) { return vt(x, /^Re-Exam/) }).length,
          final: tl.filter(function (x) { return vt(x, /^Final Exam/) }).length, ace: tl.filter(function (x) { return vt(x, /^ACE/) }).length },
        period: { ranged: ranged, from: ranged ? (rf || null) : pf, to: ranged ? (rt || null) : pt,
          scheduled: pl.filter(live).length, completed: st(pl, 'Check-in'), rescheduled: st(pl, 'Reschedule'), missed: st(pl, 'Missed') }
      }
    }
    // --- Analytics, Technical Assistant: Appointment Adherence from the appointment book, as /api/analytics/adherence-weeks
    var addD = function (d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
    var liveA = function (x) { return String(x.status || '') !== 'Cancelled' }
    if (P[0] === 'analytics' && P[1] === 'adherence-weeks' && method === 'GET') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var okD = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') }
      var qf = r.query.from || '', qt = r.query.to || '', qm = r.query.month || ''
      if ((qf && !okD(qf)) || (qt && !okD(qt))) throw httpError(400, 'Dates must be YYYY-MM-DD.')
      if (qf && qt && qf > qt) throw httpError(400, 'The From date is after the To date.')
      if (qm && !/^\d{4}-(0[1-9]|1[0-2])$/.test(qm)) throw httpError(400, 'The month must be YYYY-MM.')
      var td = today(), per
      var mOf = function (d) { var y = +d.slice(0, 4), m = +d.slice(5, 7); return { from: d.slice(0, 8) + '01', to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) } }
      if (qf || qt) { var en = qt || td; per = { from: qf || mOf(en).from, to: en, ranged: true } }
      else { per = mOf((qm || td.slice(0, 7)) + '-01'); per.ranged = false }
      var thr = per.to < td ? per.to : td
      var rows = load(K.appts, []).filter(function (x) { return liveA(x) && x.date >= per.from && x.date <= thr })
      var wks = [], st0 = per.from
      while (st0 <= per.to) {
        var dow = new Date(st0 + 'T00:00:00Z').getUTCDay(), en0 = addD(st0, dow === 0 ? 0 : 7 - dow)
        if (en0 > per.to) en0 = per.to
        var inW = rows.filter(function (x) { return x.date >= st0 && x.date <= en0 })
        var pset = {}; inW.forEach(function (x) { if (x.patientId) pset[x.patientId] = 1 })
        wks.push({ start: st0, end: en0, p: Object.keys(pset).length, s: inW.length, c: inW.filter(function (x) { return x.status === 'Check-in' }).length, future: st0 > thr })
        st0 = addD(en0, 1)
      }
      return { period: per, through: thr, today: td, weeks: wks }
    }
    // --- Analytics, Technical Assistant: patient adherence by week, as /api/analytics/adherence
    // For ACE / For Initial Exam by today, yesterday, this week or this month (20 Nov 2026), as the server.
    if (P[0] === 'analytics' && P[1] === 'exams' && method === 'GET') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var ew = r.query.when || 'week', etd = today(), ef, et
      if (ew === 'today') { ef = et = etd }
      else if (ew === 'yesterday') { ef = et = addD(etd, -1) }
      else if (ew === 'week') { var edw = new Date(etd + 'T00:00:00Z').getUTCDay(); ef = addD(etd, edw === 0 ? -6 : 1 - edw); et = addD(ef, 6) }
      else if (ew === 'month') { ef = etd.slice(0, 8) + '01'; var eld = new Date(Date.UTC(+etd.slice(0, 4), +etd.slice(5, 7), 0)); et = eld.toISOString().slice(0, 10) }
      else throw httpError(400, 'Pick today, yesterday, this week or this month.')
      var eName = {}; load(K.patients, []).forEach(function (x) { eName[x.id] = [x.firstName, x.lastName].filter(Boolean).join(' ').trim() })
      var eA = load(K.appts, []).filter(function (x) { return liveA(x) && x.date >= ef && x.date <= et })
      var eOf = function (y) { return { id: y.patientId || null, name: eName[y.patientId] || y.patientName || '(no name)', date: y.date, time: y.start || '', status: y.status || '' } }
      var eBy = function (p, q) { return (p.date + p.time).localeCompare(q.date + q.time) }
      return { when: ew, from: ef, to: et, today: etd, exams: {
        ace: eA.filter(function (y) { return /^ACE/i.test(y.visitType || '') }).map(eOf).sort(eBy),
        ie: eA.filter(function (y) { return /^(Day 2 Exam|Initial Exam)/i.test(y.visitType || '') }).map(eOf).sort(eBy) } }
    }
    if (P[0] === 'analytics' && P[1] === 'adherence') {
      if (u && u.role === 'lawyer') throw httpError(403, 'Not permitted')
      var ADH_KEY = 'ctg_offline_patient_adherence'
      var marks = load(ADH_KEY, {})
      var isMon = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && new Date(v + 'T00:00:00Z').getUTCDay() === 1 }
      if (method === 'GET' && P.length === 2) {
        var wa = r.query.a, wb = r.query.b
        if (!isMon(wa) || !isMon(wb) || wa === wb) throw httpError(400, 'Pick two different weeks (each by its Monday).')
        // Filled in from the appointment book, as the server does it; a hand-set mark wins.
        var td2 = today(), lo = wa < wb ? wa : wb, hi = addD(wa < wb ? wb : wa, 6)
        var allA = load(K.appts, []).filter(function (x) { return liveA(x) && x.patientId && x.date >= lo && x.date <= hi })
        var IE = /^(ACE|Day 2 Exam|Initial Exam)/i
        var dday = function (x) {
          var t = String(x.dischargeDate || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
          if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2)
          return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''
        }
        // As the server: Adherent / Non-adherent. A visit = a checked-in Therapy Visit appointment.
        // 3 a week; an ACE week (Day 1 that week, or pending Day 1 now) needs 1, an IE week (Initial Exam
        // that week, or pending Day 2 now) needs 2.
        var visitsBy = {}, bookedBy = {}
        allA.forEach(function (y) {
          if (!/^Therapy Visit/i.test(y.visitType || '')) return
          var m = y.status === 'Check-in' ? visitsBy : bookedBy
          ;(m[y.patientId] = m[y.patientId] || []).push(y.date)
        })
        var dayOf = function (v) {
          var t = String(v || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
          if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2)
          return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''
        }
        var localDay = function (ts) { var d = ts ? new Date(ts) : null; return d && !isNaN(d) ? d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) : '' }
        var recOf = function (x) {
          var ace = x.ace || null, ie = x.initialExam && x.initialExam.savedAt ? x.initialExam : null
          var fs = ace && ace.formState && ace.formState.inputs ? ace.formState.inputs : {}
          return {
            visits: visitsBy[x.id] || [], scheduled: bookedBy[x.id] || [],
            day1: ace ? (dayOf(ace.dateOfService) || dayOf(fs.dos) || localDay(ace.savedAt)) : '',
            day2: ie ? (dayOf(ie.examDate) || localDay(ie.savedAt)) : '',
            pendingDay1: !(x.inactive || x.archived) && !!x.pendingAce && !ace,
            pendingDay2: !(x.inactive || x.archived) && !!ace && x.aceComplete === true && !ie
          }
        }
        var auto = function (x, wk) {
          var we = addD(wk, 6), dd = dday(x)
          if (dd && dd < wk) return null
          if (wk > td2) return null
          var rc = recOf(x)
          var inW = function (d) { return !!d && d >= wk && d <= we }
          var thisWeek = td2 >= wk && td2 <= we
          var hasACE = inW(rc.day1) || (thisWeek && rc.pendingDay1)
          var hasIE = inW(rc.day2) || (thisWeek && rc.pendingDay2)
          var need = hasIE ? 2 : hasACE ? 1 : 3
          var kind = hasIE && hasACE ? 'ACE and IE' : hasIE ? 'IE' : hasACE ? 'ACE' : ''
          var att = rc.visits.filter(function (d) { return inW(d) && d <= td2 }).length
          if (!rc.visits.concat(rc.scheduled).some(inW)) return { status: 'not_scheduled', kind: kind, need: need, attended: 0, soFar: we >= td2, note: '', auto: true }
          return { status: att >= need ? 'adherent' : 'non_adherent', kind: kind, need: need, attended: att, soFar: we >= td2, note: '', auto: true }
        }
        var withAppt = {}; allA.forEach(function (y) { withAppt[y.patientId] = 1 })
        load(K.patients, []).forEach(function (x) {
          var rc = recOf(x)
          if (rc.pendingDay1 || rc.pendingDay2) withAppt[x.id] = 1
        })
        var pts = load(K.patients, []).filter(function (x) { return marks[x.id + '|' + wa] || marks[x.id + '|' + wb] || withAppt[x.id] })
        var ptName = {}; load(K.patients, []).forEach(function (x) { ptName[x.id] = [x.firstName, x.lastName].filter(Boolean).join(' ').trim() })
        var exOf = function (y) { return { id: y.patientId || null, name: ptName[y.patientId] || y.patientName || '(no name)', date: y.date, time: y.start || '', status: y.status || '' } }
        var byWhen = function (p, q) { return (p.date + p.time).localeCompare(q.date + q.time) }
        var exams = {
          ace: allA.filter(function (y) { return /^ACE/i.test(y.visitType || '') }).map(exOf).sort(byWhen),
          ie: allA.filter(function (y) { return /^(Day 2 Exam|Initial Exam)/i.test(y.visitType || '') }).map(exOf).sort(byWhen)
        }
        return { weeks: { a: wa, b: wb }, today: td2, exams: exams, patients: pts.map(function (x) {
          var dm = x.demographics || {}
          return { id: x.id, name: [dm.firstName, dm.lastName].filter(Boolean).join(' ') || '(no name)', first: dm.firstName || '', last: dm.lastName || '',
            inactive: !!(x.inactive || x.archived), a: marks[x.id + '|' + wa] || auto(x, wa), b: marks[x.id + '|' + wb] || auto(x, wb) }
        }).filter(function (x) { return x.a || x.b }).sort(function (x, y) { return (x.last + ' ' + x.first).localeCompare(y.last + ' ' + y.first) }) }
      }
      if (method === 'PUT' && P.length === 4) {
        var pid = P[2], wk = P[3], body2 = body || {}
        if (!isMon(wk)) throw httpError(400, 'The week must be given by its Monday (YYYY-MM-DD).')
        var stv = body2.status || ''
        if (stv && ['adherent', 'non_adherent'].indexOf(stv) === -1) throw httpError(400, 'Unknown status.')
        if (!findPatient(pid)) throw httpError(404, 'Patient not found')
        var note2 = String(body2.note || '').trim().slice(0, 300)
        if (stv) marks[pid + '|' + wk] = { status: stv, note: note2, by: (u && (u.displayName || u.username)) || '', at: now() }
        else delete marks[pid + '|' + wk]
        save(ADH_KEY, marks)
        return { week: wk, status: stv || null, note: stv ? note2 : '' }
      }
    }

    // --- shared settings documents and patient chart notes
    if (P[0] === 'shared' && P[1] === 'doc' && P[2]) {
      var key = 'ctg_offline_shared_' + P[2]
      var cur = load(key, null)
      if (method === 'GET') return cur ? { data: cur.data, version: cur.version, updatedAt: cur.updatedAt } : { data: null, version: 0 }
      if (method === 'PUT') {
        var v = cur ? cur.version : 0
        if (body && body.version !== undefined && Number(body.version) !== v) throw httpError(409, 'Saved in another tab. Reload to see the changes.', { version: v })
        save(key, { data: body.data, version: v + 1, updatedAt: now() })
        return { version: v + 1 }
      }
    }
    if (P[0] === 'shared' && P[1] === 'charts') {
      var charts = load(K.charts, {})
      if (is('GET', 2)) return { charts: charts }
      if (method === 'PUT' && P[2]) { charts[P[2]] = (body && body.chart) || {}; save(K.charts, charts); return { ok: true } }
    }

    // --- small things the screens ask for
    if (P[0] === 'accounts' && P[1] === 'providers') {
      // Accounts belong to ctg-auth.js and stay in localStorage, not the offline store.
      var accts = []
      try { accts = JSON.parse(localStorage.getItem('ctg_auth_accounts_v1')) || [] } catch (e) { accts = [] }
      return { providers: accts.filter(function (a) { return a.role === 'provider' && a.active !== false }).map(function (a) { return { id: a.id, displayName: a.displayName } }) }
    }
    if (P[0] === 'policy' && P[1] === 'status') return { policy: 'authorized-user', version: 'offline', accepted: true, acceptedAt: now(), exempt: true }
    if (P[0] === 'policy' && P[1] === 'accept') return { accepted: true, version: 'offline' }
    if (P[0] === 'grammar-deep-check' && P[1] === 'admin-toggle') return { enabled: false, roles: [] }
    if (P[0] === 'meetings') {
      if (is('GET', 1)) return { meetings: [] }
      if (P[1] === 'recordings' && P[2] === 'all') return { recordings: [] }
      if (P[1] === 'recording' && P[2] === 'capabilities') return { recording: false, transcription: false, missing: ['offline version'] }
    }
    if (P[0] === 'messaging' && P[1] === 'conversations' && method === 'GET' && P.length === 2) return { conversations: [] }
    if (P[0] === 'patient-messages' && method === 'GET') return { messages: [] }
    if (P[0] === 'invites' && P[1] === 'channels') return { email: false, sms: false }
    if (P[0] === 'backup' && method === 'GET' && P.length === 1) return { backups: [] }
    if (P[0] === 'activity') return { ok: true }

    throw httpError(503, OFFLINE_MSG)
  }

  // Same contract as ctg-auth.js apiFetch: resolves with the JSON body,
  // rejects with an Error carrying .status and .body.
  window.ctgOfflineApi = function (url, opts) {
    opts = opts || {}
    var method = String(opts.method || 'GET').toUpperCase()
    var body = null
    if (opts.body) { try { body = JSON.parse(opts.body) } catch (e) { body = null } }
    // Async like the real thing, so screens never depend on a same-tick answer.
    // handle() answers directly, or with a promise for document contents; the
    // answer waits for its writes to reach the disk, and reports if they failed.
    return new Promise(function (resolve) { setTimeout(resolve, 0) })
      .then(init)
      .then(function () { return handle(method, String(url), body) })
      .then(function (r) {
        var done = function () {
          if (writeErr) { var e = writeErr; writeErr = null; throw e }
          return clone(r)
        }
        return lastWrite.then(done, done)
      })
      .catch(function (e) { throw e.status ? e : httpError(500, e.message || 'Offline error') })
  }

})()
