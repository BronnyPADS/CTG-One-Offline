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
  var ROLE_DEFAULT_KEYS = {"provider":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","neuroReferrals","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging"],"ta":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","registration","reg.patient","reg.address","reg.case","reg.pendingAce","__sections_configured__:registration","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","neuroReferrals","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","apptConfigs","acfg.visitTypes","acfg.eligibility","acfg.rooms","acfg.schedulers","acfg.workingHours","acfg.colorLegend","__sections_configured__:apptConfigs","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","day2","exam.context","exam.uploads","exam.sway","exam.reflex","exam.shoebox","exam.actions","__sections_configured__:day2","dailyNotes","dn.context","dn.exercise","dn.notes","dn.attachments","dn.actions","__sections_configured__:dailyNotes","intakeForm","intake.demographics","intake.insurance","intake.consent","intake.minorAuth","intake.documents","intake.pdfs","__sections_configured__:intakeForm","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging","patientMessaging","pm.read","pm.send","pm.call","pm.templates","pm.contacts","__sections_configured__:patientMessaging","invitePatient","msg.newInvite","msg.defaults","msg.newPatient","msg.history","__sections_configured__:invitePatient"],"compliance":["dashboard","dash.summary","dash.workflow","dash.shortcuts","__sections_configured__:dashboard","registration","reg.patient","reg.address","reg.case","reg.pendingAce","__sections_configured__:registration","referrals","ref.submit","ref.inbox","ref.details","ref.accept","ref.schedule","ref.decline","__sections_configured__:referrals","neuroReferrals","patientLists","pl.overview","pl.diagnosis","pl.policyLimits","pl.ace","pl.exams","pl.comparison","pl.notes","pl.notesForm","pl.billing","pl.documents","pl.fcr","__sections_configured__:patientLists","appointment","appt.calendar","appt.createEdit","appt.breakBlocks","appt.patientLink","appt.commandCenter","appt.rooms","appt.undo","__sections_configured__:appointment","meetings","mtg.view","mtg.create","mtg.host","mtg.invite","mtg.checkin","mtg.record","mtg.endAll","mtg.translate","__sections_configured__:meetings","apptConfigs","acfg.visitTypes","acfg.eligibility","acfg.rooms","acfg.schedulers","acfg.workingHours","acfg.colorLegend","__sections_configured__:apptConfigs","pendingAce","pace.list","pace.openAce","pace.status","__sections_configured__:pendingAce","incompleteAce","iace.list","iace.resume","iace.progress","__sections_configured__:incompleteAce","completedAce","cace.list","cace.open","cace.report","__sections_configured__:completedAce","pendingDay2","pd2.list","pd2.openDay2","pd2.status","__sections_configured__:pendingDay2","day1","ace.patient","ace.mechanism","ace.hpi","ace.pmh","ace.score","ace.diagnosis","ace.plan","__sections_configured__:day1","day2","exam.context","exam.uploads","exam.sway","exam.reflex","exam.shoebox","exam.actions","__sections_configured__:day2","dailyNotes","dn.context","dn.exercise","dn.notes","dn.attachments","dn.actions","__sections_configured__:dailyNotes","intakeForm","intake.demographics","intake.insurance","intake.consent","intake.minorAuth","intake.documents","intake.pdfs","__sections_configured__:intakeForm","arSummary","ar.patientInfo","ar.dates","ar.summary","ar.receivables","ar.payments","ar.notes","__sections_configured__:arSummary","collectionMgmt","cm.worklist","cm.filters","cm.followup","cm.notes","__sections_configured__:collectionMgmt","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging","patientMessaging","pm.read","pm.send","pm.call","pm.templates","pm.contacts","__sections_configured__:patientMessaging","invitePatient","msg.newInvite","msg.defaults","msg.newPatient","msg.history","__sections_configured__:invitePatient"],"lawyer":["patientLists","pl.billing","pl.fcr","__sections_configured__:patientLists","referrals","ref.submit","ref.inbox","ref.details","ref.decline","__sections_configured__:referrals","internalMessaging","im.read","im.send","im.create","im.editOwn","im.deleteOwn","im.react","im.manage","__sections_configured__:internalMessaging"]}

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
        if (is('PUT', 3)) { if (bi === -1) throw httpError(404, 'Break/Block not found'); blocks[bi] = blockRow(body || {}, P[2], u); save(K.blocks, blocks); return { breakBlock: blocks[bi] } }
        if (is('DELETE', 3)) { save(K.blocks, blocks.filter(function (x) { return x.id !== P[2] })); return { ok: true } }
      }
      var appts = load(K.appts, [])
      if (is('GET', 1)) return { appointments: appts }
      if (P[1] === 'board' && method === 'GET') {
        var day = /^\d{4}-\d{2}-\d{2}$/.test(r.query.date || '') ? r.query.date : today()
        return { date: day, slots: appts.filter(function (a) { return a.date === day }).map(function (a) { return Object.assign(clone(a), { meetingStatus: null, meetingStarted: null, waiting: 0, waitingSince: null, admitted: 0 }) }) }
      }
      if (is('POST', 1)) { var na = apptRow(body || {}); appts.push(na); save(K.appts, appts); return { appointment: na, guestToken: null } }
      var ai = appts.findIndex(function (x) { return x.id === P[1] })
      if (is('PUT', 2)) {
        if (ai === -1) throw httpError(404, 'Appointment not found')
        var keepCreated = appts[ai].createdAt
        appts[ai] = Object.assign(apptRow(body || {}, P[1]), { createdAt: keepCreated }); save(K.appts, appts)
        return { appointment: appts[ai], guestToken: null }
      }
      if (is('DELETE', 2)) { save(K.appts, appts.filter(function (x) { return x.id !== P[1] })); return { ok: true } }
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
