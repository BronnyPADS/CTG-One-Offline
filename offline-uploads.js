/* CTG One - offline version only: upload a Day 1 file or a billing file in
 * place of filling the forms.
 *
 * Built into the offline folder by tools/build_offline.py, after every other
 * script, and never deployed: the online portal has none of this.
 *
 * Day 1 file   Saved as a patient document ("Day 1 File") and counts as a
 *              completed Day 1: the patient leaves Patients Pending for Day 1,
 *              shows Day 1 Saved, and Day 1 billing (99203) applies on the
 *              date of service given. Filling the Day 1 form afterwards makes
 *              the form the Day 1 record; the file stays in Documents.
 * Billing file Saved as a patient document ("Billing File"). While it is there
 *              the automatic billing from Day 1, Day 2 and notes is paused for
 *              that patient, and the total read from the file (or typed) is
 *              the patient's billing - Total Balance, AR Summary, Collections
 *              and the law firm view all follow it. Removing the file, here or
 *              in Documents, brings the automatic billing back. The Final Case
 *              Report carries the file in place of the generated statement
 *              (the build patches app.js for that).
 *
 * The app's own functions are wrapped, not edited: each wrapper falls through
 * to the original whenever no uploaded file is involved.
 */
(function () {
  'use strict'

  var DAY1_TYPE = 'Day 1 File'
  var BILL_TYPE = 'Billing File'
  var BILL_GROUP = 'uploadedBillingFile'
  var NOTE_TYPE = 'Daily Note File'

  /* ------------------------------ helpers ------------------------------ */
  function uploads(p) { return (p && p.documents && Array.isArray(p.documents.uploads)) ? p.documents.uploads : [] }
  function findUpload(p, id) { return id ? uploads(p).filter(function (d) { return d.id === id })[0] || null : null }
  function day1Info(p) { return (p && p.ace && p.ace.uploadedFile && !p.ace.formState) ? p.ace.uploadedFile : null }
  function day1Upload(p) { var f = day1Info(p); return f ? findUpload(p, f.docId) : null }
  function billingUpload(p) { var f = p && p.billing && p.billing.uploadedFile; return f ? findUpload(p, f.docId) : null }
  // Read by the Final Case Report (see build_offline.py).
  window.ctgOfflineBillingUpload = billingUpload
  window.ctgOfflineDay1Upload = day1Upload

  function esc(s) { return escHtml(String(s == null ? '' : s)) }
  function today() { return formatDay2Date(new Date()) }
  function parseMoney(s) {
    var n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, ''))
    return isNaN(n) ? null : Math.round(n * 100) / 100
  }
  function svg(body) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>' }
  var ICON = {
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    swap: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>'),
    pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
    bolt: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>')
  }
  function btn(action, pid, label, cls, extra, icon) {
    return '<button class="btn ' + (cls || 'btn-ghost') + ' btn-sm" data-ctgo="' + action + '" data-pid="' + esc(pid) + '"' + (extra || '') + '>' + (icon ? ICON[icon] : '') + esc(label) + '</button>'
  }

  function refresh(pid) {
    try { renderPatientWorkflow() } catch (e) { /* not on this page */ }
    try { renderPendingRows(); renderIncompleteAceRows(); renderCompletedAceRows() } catch (e) { /* not on this page */ }
    try { if (selectedPatientId === pid) renderPatientDetails(pid) } catch (e) { /* not on this page */ }
  }

  function pickFile() {
    return new Promise(function (resolve) {
      var inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = 'application/pdf,image/*'
      inp.addEventListener('change', function () { resolve((inp.files && inp.files[0]) || null) })
      inp.addEventListener('cancel', function () { resolve(null) })
      inp.click()
    })
  }

  // Same preparation as the Documents tab: images shrunk, size checked.
  async function prepareFile(file) {
    var dataUrl = await fileToDataURL(file), type = file.type || ''
    if (/^image\//i.test(type)) {
      var smaller = await shrinkImageDataUrl(dataUrl, type)
      if (smaller !== dataUrl) { dataUrl = smaller; type = 'image/jpeg' }
    }
    if (dataUrl.length > DOC_FILE_MAX_BYTES) {
      throw new Error('"' + (file.name || 'That file') + '" is ' + docBytesLabel(dataUrl.length) + ', over the ' + docBytesLabel(DOC_FILE_MAX_BYTES) + ' limit.')
    }
    return { name: file.name || 'file', type: type, dataUrl: dataUrl }
  }

  async function storeUpload(p, f, documentType) {
    var comma = f.dataUrl.indexOf(',')
    var res = await window.ctgApiFetch('/api/patients/' + encodeURIComponent(p.id) + '/documents/upload', {
      method: 'POST',
      body: JSON.stringify({ documentType: documentType, name: f.name, contentType: f.type, note: '', data: comma >= 0 ? f.dataUrl.slice(comma + 1) : '' })
    })
    var stored = res && res.document
    if (!stored) throw new Error('The upload was not confirmed')
    stored.dataUrl = f.dataUrl
    if (!p.documents) p.documents = {}
    if (!Array.isArray(p.documents.uploads)) p.documents.uploads = []
    p.documents.uploads.push(stored)
    return stored
  }

  async function removeUpload(p, doc) {
    if (!doc) return
    await window.ctgApiFetch('/api/patients/' + encodeURIComponent(p.id) + '/documents/' + encodeURIComponent(doc.id), { method: 'DELETE' })
    p.documents.uploads = uploads(p).filter(function (d) { return d.id !== doc.id })
  }

  async function viewUpload(pid, docId) {
    var p = getPatient(pid), d = findUpload(p, docId)
    if (!d) { showToast('That file is no longer in this patient\'s Documents.', 'err'); return }
    var url = await resolveUploadDataUrl(p, d)
    if (!url) { showToast('Could not open the file.', 'err'); return }
    var blob = await (await fetch(url)).blob()
    _showPdfModal(URL.createObjectURL(blob), d.name || 'File')
  }

  function saved(p) {
    p.updatedAt = new Date().toISOString()
    persistPatients()
    refresh(p.id)
  }

  /* -------------------------------- Day 1 ------------------------------ */
  // The text of a PDF, joined into one line per printed row. Scans and photos
  // have no text and come back empty.
  async function readPdfText(f) {
    if (!/pdf/i.test(f.type)) return { text: '', lines: [] }
    try {
      var lib = await ensurePdfJs()
      var pdf = await lib.getDocument({ data: dataUrlToBytes(f.dataUrl) }).promise
      var text = '', lines = []
      for (var i = 1; i <= pdf.numPages; i++) {
        var items = (await (await pdf.getPage(i)).getTextContent()).items.filter(function (it) { return String(it.str).trim() })
        text += items.map(function (it) { return it.str }).join(' ') + '\n'
        var rowsByY = []
        items.forEach(function (it) {
          var y = it.transform[5], x = it.transform[4]
          var r = rowsByY.filter(function (g) { return Math.abs(g.y - y) < 3 })[0]
          if (!r) { r = { y: y, parts: [] }; rowsByY.push(r) }
          r.parts.push({ x: x, s: it.str })
        })
        rowsByY.sort(function (a, b) { return b.y - a.y }).forEach(function (r) {
          lines.push(r.parts.sort(function (a, b) { return a.x - b.x }).map(function (q) { return q.s }).join(' '))
        })
      }
      return { text: text, lines: lines }
    } catch (e) { console.error('Could not read the PDF text', e); return { text: '', lines: [] } }
  }

  /* What the Case Discharge Summary needs from a Day 1 PDF. Three layouts are
     read: the portal's own Day 1, the practice's EnableDoc Day 1 and the
     table-style Day 1. All of them print the same Causation sentence, so the
     injury incident and its date come from there first. The patient's name and
     date of birth are read too, to catch a file uploaded to the wrong patient.
     Anything not found stays empty: the summary never guesses. */
  /* Whose file this is: the patient's name and date of birth as the portal's
     reports, the practice's EnableDoc Day 1, chart notes, Superbill and billing
     statement print them. Used to catch a file uploaded to the wrong patient. */
  function readPatientId(raw, billing) {
    var t = String(raw || '').replace(/\s+/g, ' ')
    // The bill's own patient box: a billing statement, or a Superbill.
    var bill = [
      /Patient Name\s*:\s*([A-Za-z][A-Za-z ,.'-]{0,79}?)\s+(?:\d|Date Of Birth).{0,120}?Date Of Birth\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /Patient Information Payor Information\s+([A-Za-z][A-Za-z .'-]{0,60}?)\s*,.{0,160}?Date of birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
    ]
    var res = [
      /\bName:\s*(.{1,80}?)\s+DOB:\s*([0-9\/-]{8,10})/i,
      /PATIENT NAME DATE OF BIRTH AGE DATE OF SERVICE\s+(.{1,80}?)\s+(\d{1,2}\/\d{1,2}\/\d{4})/,
      /Today the pati\w*,\s*(.{1,80}?)\s*,\s*(?:(?:Male|Female|Other)\s*,\s*)?DOB:\s*([0-9\/-]{8,10})/i,
      /\bPatient:\s*(.{1,80}?)\s+Acct #:.{0,80}?DOB:\s*(\d{1,2}\/\d{1,2}\/\d{4})/
    ]
    res = billing ? bill.concat(res) : res.concat(bill)
    for (var i = 0; i < res.length; i++) {
      var m = res[i].exec(t)
      if (m && /[A-Za-z]/.test(m[1])) return { patientName: m[1].trim(), dob: m[2] }
    }
    // Name only: "Today the patient, Johannser Bencosme, male, age 37".
    var n = /Today the pati\w*,\s*(.{1,80}?)\s*,\s*(?:Male|Female|Other)\b/i.exec(t)
    // The Superbill prints the name on a line of its own; its date of birth is labelled.
    var b = /Date of birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t)
    var out = {}
    if (n && /[A-Za-z]/.test(n[1])) out.patientName = n[1].trim()
    if (b) out.dob = b[1]
    return out
  }

  var DAY1_DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2})'
  var DX_CODE = '[A-Z]\\d{2}(?:\\.[0-9A-Z]{0,4})?'
  function parseDay1Text(raw) {
    // Page headers and footers land mid-sentence wherever a page breaks; drop them.
    var t = String(raw || '').replace(/\s+/g, ' ')
      .replace(/CONCUSSION THERAPY GROUP\s+2411 Crofton Lane.{0,120}?Fax:\s*\(?\d{3}\)?[\s-]*\d{3}-\d{4}(?:\s+\d+\s*\|\s*\d+)?/gi, ' ')
      .replace(/Concussion Therapy Group \/ .{0,120}? Page \d+ of \d+/gi, ' ')
      .replace(/\s+/g, ' ')
    var out = {}, m
    // An empty answer prints as a dash or an unreadable glyph: no letters, no value.
    var has = function (v) { return !!v && /[A-Za-z]/.test(v) && !/^None (identified|reported|selected)\b/i.test(v.trim()) }
    // The first of several patterns that captures a real value.
    var pick = function (res, src) {
      for (var i = 0; i < res.length; i++) { var r = res[i].exec(src || t); if (r && has(r[1])) return r[1].trim() }
      return ''
    }
    var date = function (labels) {
      for (var i = 0; i < labels.length; i++) { var r = new RegExp(labels[i] + DAY1_DATE, 'i').exec(t); if (r) return r[1] }
      return ''
    }
    // The ACE's own part of the file: one with a discharge summary in front
    // carries that summary's Causation, risk factors and diagnosis first.
    var aceAt = t.search(/ACUTE CONCUSSION EVALUATION/i)
    var ta = aceAt > 0 ? t.slice(aceAt) : t

    // "...between his injuries and the <incident> injury incident that occurred on <date>."
    // Also the Medical Necessity wording, and a template with no date filled in.
    var on = '(?: on ' + DAY1_DATE + ')?'
    m = new RegExp('causal connection between \\S+ injuries and the (.{1,300}?) injury incident that occurred' + on, 'i').exec(ta)
      || new RegExp('\\binjuries and the (.{1,300}?) injury incident that occurred' + on, 'i').exec(ta)
      || new RegExp('\\binjuries sustained in the (.{1,300}?) injury incident that occurred' + on, 'i').exec(ta)
    if (m && has(m[1])) out.injuryType = m[1].trim().replace(/[.\s]+$/, '')
    if (m && m[2]) out.dateOfInjury = m[2]
    // The portal prints a typed description after its type: "Others — Struck on the head...".
    if (out.injuryType) out.injuryType = out.injuryType.replace(/^(?:Others|No Vehicle Involved)\s*[^A-Za-z0-9\s]\s*/i, '')
    if (!out.injuryType) {
      // Only the portal's layout answers on the same line ("...Injury):"); the
      // practice's prints question 1a there instead, which is not the incident.
      var desc = pick([/Injury Description \(see above Mechanism of Injury\)\s*:\s*(.+?)\s+(?:1[a-z]\.\s|EARLY SIGNS|B\. Symptom Check List)/i], ta)
      if (desc) out.injuryType = desc.replace(/[.\s]+$/, '')
    }
    if (!out.dateOfInjury) out.dateOfInjury = date(['Date of Injury\\s*:?\\s*', '\\bDOI\\s*:\\s*', 'DATE OF INJURY\\s+'])

    // The Assessment's risk factors first; the history's when the Assessment has none.
    // The heading ends "...Neuroinflammatory Symptoms", with or without a colon.
    var risks = pick([
      /Risk Factors Associated with Increased Risk for Increased Severity.{0,160}?Neuroinflammatory Symptoms\s*:?\s*(.*?)\s*\b(?:Diagnosis|Prognosis)\b/i,
      /Risk Factors Associated with Increased Risk for Increased Severity[^:]{0,200}:\s*(.*?)\s*\b(?:Diagnosis|Prognosis)\b/i,
      /RISK FACTORS FOR ASSESSMENT\s+(.*?)\s+CAUSATION\b/,
      /Risk Factors for Injury Severity and Prolonged Recovery\s*:\s*(.*?)\s*\bPAST MEDICAL HISTORY\b/i
    ], ta)
    if (risks) out.riskFactors = risks

    // Diagnosis: the Assessment's full list ("Diagnosis (S06.0X0A) ..., (R42.) ... Prognosis"),
    // else section E. Codes in brackets, or a label then the code ("Concussion w/o LOC S06.0X0A").
    var lists = []
    m = new RegExp('\\bDiagnosis\\s+(\\(\\s*' + DX_CODE + '\\s*\\).{0,4000}?)\\s*\\b(?:Prognosis|Causation|F\\. Follow-Up)\\b').exec(ta)
    if (m) lists.push(m[1])
    m = /E\. Diagnosis \(ICD-10\)\s*:?\s*(.{0,4000}?)\s*\bF\. Follow-Up\b/i.exec(ta)
    if (m) lists.push(m[1])
    for (var i = 0; i < lists.length && !out.diagnosisCodes; i++) {
      var dx = [], d
      var re = new RegExp('\\(\\s*(' + DX_CODE + ')\\s*\\)\\s*(.*?)(?=,?\\s*\\(\\s*' + DX_CODE + '\\s*\\)|$)', 'g')
      while ((d = re.exec(lists[i]))) dx.push('(' + d[1].replace(/\.$/, '') + ') ' + d[2].replace(/[,\s]+$/, '').trim())
      if (!dx.length) {
        re = /(.*?)\s*\b([A-Z]\d{2}\.[0-9A-Z]{1,4})\b\s*,?\s*/g
        while ((d = re.exec(lists[i]))) dx.push(('(' + d[2] + ') ' + d[1].replace(/^[,\s]+|[,\s]+$/g, '')).trim())
      }
      if (dx.length) out.diagnosisCodes = dx
    }

    out.dateOfService = date(['INITIAL DATE OF SERVICE\\s*:?\\s*', 'Session Date\\s*:\\s*', '\\bDOS\\s*:\\s*'])
    // An ACE kept in the practice's EnableDoc chart notes: "Date 05/23/2025 Provider ...".
    if (!out.dateOfService) {
      m = /\bDate\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+Provider\b/.exec(t)
      if (m) out.dateOfService = m[1]
    }
    // With no labelled date, the report's own "today, 08/03/2026" is offered for staff to confirm.
    if (!out.dateOfService) {
      m = /\btoday,?\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/i.exec(t)
      if (m) out.dateOfServiceGuess = m[1]
    }

    var who = readPatientId(t)
    if (who.patientName) out.patientName = who.patientName
    if (who.dob) out.dob = who.dob

    // "No further testing has been scheduled" is the Day 1's No follow-up.
    if (/No further testing has been scheduled/i.test(t)) out.noFollowup = true
    for (var k in out) if (out[k] === '') delete out[k]
    return out
  }
  // A Day 1 read in the PDF's own text order, with any gaps filled from its
  // lines as printed: some files store their text out of order, splitting a
  // sentence across the page, while others read best as stored.
  function readDay1(pdfText) {
    var out = parseDay1Text(pdfText.text)
    var printed = parseDay1Text((pdfText.lines || []).join('\n'))
    for (var k in printed) if (out[k] === undefined) out[k] = printed[k]
    if (out.dateOfService) delete out.dateOfServiceGuess
    return out
  }
  window.ctgOfflineParseDay1 = parseDay1Text

  // A date as year-month-day numbers, so 7/31/2026, 07/31/2026 and 2026-07-31 compare equal.
  function dateKey(v) {
    var s = String(v || '').trim(), m
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return +m[1] + '-' + +m[2] + '-' + +m[3]
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return +m[3] + '-' + +m[1] + '-' + +m[2]
    return s
  }
  // What in the file disagrees with this patient's Registration: a Day 1 for
  // someone else would put their injury and diagnosis on this chart.
  function day1Mismatch(p, read) {
    var d = p.demographics || {}, out = []
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, '') }
    if (read.patientName) {
      // Any part of the last name will do ("Mr. Tenenbaum", "Johan Mejia" for
      // Mejia Serna); the first name only when Registration has no last name.
      var name = norm(read.patientName)
      var parts = String(d.lastName || d.firstName || '').split(/[\s-]+/).map(norm).filter(function (x) { return x.length > 1 })
      if (parts.length && !parts.some(function (x) { return name.indexOf(x) >= 0 })) out.push('name')
    }
    if (read.dob && d.dob && dateKey(read.dob) !== dateKey(d.dob)) out.push('date of birth')
    if (read.dateOfInjury && d.doi && dateKey(read.dateOfInjury) !== dateKey(d.doi)) out.push('date of injury')
    return out
  }
  window.ctgOfflineDay1Mismatch = day1Mismatch
  // Asks before a file that names someone else goes on this patient. True to go ahead.
  async function confirmPatient(p, read, what) {
    var off = day1Mismatch(p, read)
    if (!off.length) return true
    var d = p.demographics || {}
    return ctgConfirm('This ' + what + ' may be for a different patient. Its ' + off.join(', ') + ' do' + (off.length === 1 ? 'es' : '') + ' not match this patient\'s Registration.\n\n'
      + 'In the file: ' + [read.patientName, read.dob ? 'DOB ' + read.dob : '', read.dateOfInjury ? 'injury ' + read.dateOfInjury : ''].filter(Boolean).join(', ') + '\n'
      + 'Registration: ' + [[d.firstName, d.lastName].filter(Boolean).join(' '), d.dob ? 'DOB ' + d.dob : '', d.doi ? 'injury ' + d.doi : ''].filter(Boolean).join(', ') + '\n\n'
      + 'Upload it to this patient anyway?', { title: 'Check the Patient', okLabel: 'Upload anyway' })
  }

  async function uploadDay1(pid, given) {
    var p = getPatient(pid)
    if (!p) return
    if (p.ace && p.ace.signedAt) { showToast('This Day 1 is signed and locked, so it cannot be replaced.', 'err'); return }
    if (p.ace && p.ace.formState) {
      var ok = await ctgConfirm('Use an uploaded file as this patient\'s Day 1 instead of the saved form? The form is kept: removing the file brings it back.', { title: 'Upload Day 1 File', okLabel: 'Choose file' })
      if (!ok) return
    }
    var file = given || await pickFile()
    if (!file) return
    var f, read
    try {
      showToast('Reading Day 1 file…')
      f = await prepareFile(file)
      read = readDay1(await readPdfText(f))
    } catch (e) { console.error(e); showToast('Could not read the Day 1 file: ' + e.message, 'err'); return }
    if (!await confirmPatient(p, read, 'Day 1 file')) return
    var got = [read.injuryType ? 'injury incident' : '', read.dateOfInjury ? 'date of injury' : '', read.riskFactors ? 'risk factors' : '',
      read.diagnosisCodes ? read.diagnosisCodes.length + ' diagnosis code' + (read.diagnosisCodes.length === 1 ? '' : 's') : ''].filter(Boolean)
    // No made-up date: with none in the file, staff type it in.
    var dos = await ctgPrompt('Date of service of this Day 1 (MM/DD/YYYY). Day 1 billing uses this date.', {
      title: 'Upload Day 1 File', subtitle: file.name,
      hint: (got.length ? 'Read from the file for the Case Discharge Summary: ' + got.join(', ') + '.' : 'Nothing could be read from this file for the Case Discharge Summary.')
        + (read.dateOfService ? ''
          : read.dateOfServiceGuess ? ' The file has no labelled date of service; its report says "today, ' + read.dateOfServiceGuess + '", so that date is filled in. Please check it.'
          : ' No date of service was found in the file, so please type it in.'),
      value: day2FormatAnyDate(read.dateOfService || read.dateOfServiceGuess || '') || (day1Info(p) && p.ace.dateOfService) || (p.ace && p.ace.formState && getDay2AceDateOfService(p)) || '', rows: 1, okLabel: 'Upload', noGrammar: true
    })
    if (dos === null) return
    var date = day2FormatAnyDate(dos)
    if (!date) { showToast('Please enter the date of service as MM/DD/YYYY.', 'err'); return }
    try {
      showToast('Uploading Day 1 file…')
      var old = day1Upload(p)
      // A saved form is kept under the file, so removing the file restores it.
      var keep = day1Info(p) ? p.ace.previousForm : (p.ace && p.ace.formState ? { ace: p.ace, aceComplete: p.aceComplete } : null)
      var doc = await storeUpload(p, f, DAY1_TYPE)
      if (old) await removeUpload(p, old)
      p.ace = { uploadedFile: { docId: doc.id, name: doc.name, type: f.type, uploadedAt: doc.uploadedAt }, dateOfService: date, savedAt: new Date().toISOString() }
      // Read from the file, for the Case Discharge Summary (getCaseDischargeData).
      if (read.injuryType) p.ace.injuryType = read.injuryType
      if (read.riskFactors) p.ace.riskFactors = read.riskFactors
      if (read.diagnosisCodes) p.ace.diagnosisCodes = read.diagnosisCodes
      if (read.dateOfInjury) p.ace.dateOfInjury = read.dateOfInjury
      // isPatientAceNoFollowup reads this: the summary then says "Discharged. No concussion."
      if (read.noFollowup) p.ace.recommendation = 'No follow-up'
      if (keep) p.ace.previousForm = keep
      p.aceComplete = true
      p.pendingAce = false
      clearAceBillingLock(p)
      saved(p)
      showToast('Day 1 file uploaded ✓')
    } catch (e) { console.error(e); showToast('Could not upload the Day 1 file: ' + e.message, 'err') }
  }

  // Back to the form saved before the file, or to no Day 1 at all.
  function restoreDay1(p) {
    var prev = p.ace && p.ace.previousForm
    p.ace = prev ? prev.ace : null
    p.aceComplete = prev ? prev.aceComplete : false
    p.pendingAce = !prev
    clearAceBillingLock(p)
    return !!prev
  }

  /* The Case Discharge Summary names the incident as the Day 1 does: "the
     <incident> injury incident" for a type on the Day 1 list, also with an
     abbreviation after it ("motor vehicle collision (MVC)"); anything else in
     brackets, as before. */
  var origIncidentPhrase = window.dischargeIncidentPhrase
  window.dischargeIncidentPhrase = function (type) {
    var t = String(type || '').trim().replace(/[.\s]+$/, '')
    var base = t.replace(/\s*\([A-Z]{2,5}\)$/, '').toLowerCase()
    var listed = !!base && IT_GROUPS.some(function (g) { return (g.options || []).some(function (o) { return o.toLowerCase() === base }) })
    return listed ? t + ' injury incident' : origIncidentPhrase.call(this, t)
  }
  // Registration's date of injury wins; an uploaded Day 1's fills it when blank.
  var origDischargeData = window.getCaseDischargeData
  window.getCaseDischargeData = function (p) {
    var cd = origDischargeData.apply(this, arguments)
    if (!cd.doi && day1Info(p) && p.ace.dateOfInjury) cd.doi = p.ace.dateOfInjury
    return cd
  }

  async function removeDay1(pid) {
    var p = getPatient(pid)
    if (!p || !day1Info(p)) return
    var ok = await ctgConfirm(p.ace.previousForm
      ? 'Remove the Day 1 file? The Day 1 form saved before it becomes the Day 1 record again.'
      : 'Remove the Day 1 file? The patient goes back to Patients Pending for Day 1, and the Day 1 charge comes off billing.', { title: 'Remove Day 1 File', okLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await removeUpload(p, day1Upload(p))
      var back = restoreDay1(p)
      saved(p)
      showToast(back ? 'Day 1 file removed. The saved Day 1 form is back.' : 'Day 1 file removed')
    } catch (e) { console.error(e); showToast('Could not remove the Day 1 file: ' + e.message, 'err') }
  }

  async function fillDay1Form(pid) {
    var p = getPatient(pid)
    if (!p) return
    var ok = await ctgConfirm('Fill in the Day 1 form instead? Once the form is saved it becomes the Day 1 record. The uploaded file stays in Documents and in the Final Case Report.', { title: 'Fill Day 1 Form', okLabel: 'Open Day 1 Form' })
    if (!ok) return
    restoreDay1(p)
    saved(p)
    origStartAce(pid)
  }

  // Drop zone: a file dragged onto it, or Choose File, starts that upload.
  function dropZone(action, pid, title, sub, pill) {
    return '<div class="ctgo-drop" data-ctgo-drop="' + action + '" data-pid="' + esc(pid) + '">'
      + '<div class="ctgo-drop-icon">' + ICON.upload + '</div>'
      + '<div class="ctgo-drop-text"><div class="ctgo-drop-title">' + esc(title) + (pill || '') + '</div>'
      + '<div class="ctgo-drop-sub">' + esc(sub) + '</div></div>'
      + btn(action, pid, 'Choose File', 'btn-primary', '', 'upload')
      + '</div>'
  }

  function fileBadge(doc) {
    var img = /^image\//i.test(doc.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(doc.name || '')
    return '<div class="ctgo-badge' + (img ? ' is-img' : '') + '">' + ICON.doc + '<span>' + (img ? 'IMG' : 'PDF') + '</span></div>'
  }

  function infoNote(text) { return '<div class="ctgo-info">' + ICON.info + '<span>' + esc(text) + '</span></div>' }

  function day1FilePanel(p) {
    var info = day1Info(p), doc = day1Upload(p)
    var head = '<div class="pld-record-head"><div class="ctgo-head"><div class="pld-section-title ctgo-flat">Day 1</div>'
    if (!doc) {
      return '<div class="pld-panel"><div class="pld-card">' + head + '<span class="ctgo-pill is-warn">File missing</span></div></div>'
        + '<div class="ctgo-filecard is-missing"><div class="ctgo-filecard-top">' + fileBadge(info)
        + '<div class="ctgo-doc-main"><div class="ctgo-doc-name">' + esc(info.name) + '</div>'
        + '<div class="ctgo-doc-meta">This Day 1 file was deleted from Documents.</div></div></div>'
        + '<div class="ctgo-actions">' + btn('day1-upload', p.id, 'Upload Again', 'btn-primary', '', 'upload')
        + '<span class="ctgo-spacer"></span>' + btn('day1-remove', p.id, 'Clear Day 1', 'btn-ghost ctgo-danger', '', 'trash') + '</div></div>'
        + infoNote('Clearing Day 1 sends the patient back to Patients Pending for Day 1.')
        + '</div></div>'
    }
    var uploaded = typeof dnFmtStamp === 'function' ? dnFmtStamp(doc.uploadedAt || info.uploadedAt) : (doc.uploadedAt || '')
    return '<div class="pld-panel"><div class="pld-card">' + head + '<span class="ctgo-pill">' + ICON.check + 'Completed by file upload</span></div></div>'
      + '<div class="ctgo-filecard"><div class="ctgo-filecard-top">' + fileBadge(doc)
      + '<div class="ctgo-doc-main"><div class="ctgo-doc-name">' + esc(doc.name) + '</div>'
      + '<div class="ctgo-doc-meta"><span>Date of service <b>' + esc(p.ace.dateOfService || '—') + '</b></span><span>Uploaded ' + esc(uploaded) + '</span></div></div></div>'
      + '<div class="ctgo-actions">'
      + btn('view', p.id, 'View File', 'btn-primary', ' data-doc="' + esc(doc.id) + '"', 'eye')
      + btn('day1-upload', p.id, 'Replace', 'btn-ghost', '', 'swap')
      + btn('day1-form', p.id, p.ace.previousForm ? 'Use Saved Form' : 'Fill Day 1 Form', 'btn-ghost', '', 'pen')
      + '<span class="ctgo-spacer"></span>' + btn('day1-remove', p.id, 'Remove', 'btn-ghost ctgo-danger', '', 'trash')
      + '</div></div>'
      + infoNote('This file is the patient\'s Day 1 record. It goes into the Final Case Report, and Day 1 is billed on the date of service above.'
        + (p.ace.previousForm ? ' The Day 1 form saved before it is kept; removing the file brings it back.' : ''))
      + '</div></div>'
  }

  var origAcePanel = window.renderPatientAcePanel
  window.renderPatientAcePanel = function (p) {
    if (day1Info(p)) return day1FilePanel(p)
    var html = origAcePanel.apply(this, arguments)
    if (!p || currentUserIsLawyer()) return html
    if (!p.ace) {
      // No Day 1 yet: a drop zone under the header, beside Open Day 1 Form.
      var zone = dropZone('day1-upload', p.id, 'Have the Day 1 as a file?', 'Drop a PDF or photo here, or choose one. It counts as Day 1 done; no form needed.')
      return html.replace(/<\/div><\/div>\s*$/, zone + '</div></div>')
    }
    if (p.ace.formState && !p.ace.signedAt) {
      html = html.replace('<div class="pld-exam-actions">', '<div class="pld-exam-actions">' + btn('day1-upload', p.id, 'Upload Day 1 File', 'btn-ghost', '', 'upload'))
    }
    return html
  }

  var origStartAce = window.startAceForPatient
  window.startAceForPatient = function (id) {
    // "View Day 1" on an uploaded Day 1 opens the file's tab, not an empty form.
    if (day1Info(getPatient(id))) {
      selectPatient(id)
      setPatientDetailTab('ace')
      showPage('patientLists')
      return
    }
    return origStartAce.apply(this, arguments)
  }

  // The Day 1 queue: an upload button beside each Open Day 1.
  var origPendingRows = window.renderPendingRows
  window.renderPendingRows = function () {
    var out = origPendingRows.apply(this, arguments)
    var box = document.getElementById('pendingAceRows')
    if (box) {
      box.querySelectorAll('.patient-row').forEach(function (row) {
        var m = /startAceForPatient\('([^']+)'\)/.exec(row.getAttribute('data-onclick') || '')
        var open = row.querySelector('button')
        if (m && open && !row.querySelector('[data-ctgo]')) open.insertAdjacentHTML('beforebegin', btn('day1-upload', m[1], 'Upload Day 1 File', 'btn-ghost', '', 'upload'))
      })
    }
    return out
  }

  /* ----------------------------- Daily notes ---------------------------- */
  // A daily note can be a file instead of typed text. It is a daily note like
  // any other - listed with the rest, billed on its date - with the file kept
  // as a patient document ("Daily Note File").
  function isNoteFile(n) { return !!(n && n.uploadedFile) }
  function noteUpload(p, n) { return isNoteFile(n) ? findUpload(p, n.uploadedFile.docId) : null }
  function findNote(p, noteId) { return (p && Array.isArray(p.dailyNotes) ? p.dailyNotes : []).filter(function (n) { return n && n.id === noteId })[0] || null }
  // Read by the Final Case Report (see build_offline.py).
  window.ctgOfflineNoteUpload = noteUpload
  window.ctgOfflineNoteUploads = function (p) {
    return (p && Array.isArray(p.dailyNotes) ? p.dailyNotes : []).map(function (n) { return noteUpload(p, n) }).filter(Boolean)
  }

  /* The session dates a daily note file prints. The billing date is in the
     header: the portal's "Session Date: 05/26/2026", the practice's chart notes
     "Date 05/28/2025". Only with neither, the date in the note's sentence
     ("Patient Daily Note Following Treatment Session: 05-26-26"), which is its
     own field and can differ (noteTextDates reports it). */
  var NOTE_TEXT_DATE = /Daily Note Following Treatment Session:\s*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2}|\d{4})\b/gi
  function datesBy(raw, res) {
    var t = String(raw || '').replace(/\s+/g, ' '), out = [], m
    for (var i = 0; i < res.length && !out.length; i++) {
      res[i].lastIndex = 0
      while ((m = res[i].exec(t))) {
        var v = ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + (m[3].length === 2 ? '20' + m[3] : m[3])
        if (out.indexOf(v) < 0) out.push(v)
      }
    }
    return out
  }
  function noteDates(raw) {
    return datesBy(raw, [/Session Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/gi, /Chart Notes.{0,400}?\bDate\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/gi, NOTE_TEXT_DATE])
  }
  function noteTextDates(raw) { return datesBy(raw, [NOTE_TEXT_DATE]) }
  window.ctgOfflineNoteDates = noteDates

  async function uploadNote(pid, given, noteId, presetDate) {
    var p = getPatient(pid)
    if (!p) return
    var existing = noteId ? findNote(p, noteId) : null
    var file = given || await pickFile()
    if (!file) return
    var f, text = ''
    try {
      showToast('Reading note file…')
      f = await prepareFile(file)
      // The lines as printed keep each label next to its value.
      text = (await readPdfText(f)).lines.join('\n')
    } catch (e) { console.error(e); showToast('Could not read the note file: ' + e.message, 'err'); return }
    if (!await confirmPatient(p, readPatientId(text), 'note file')) return
    // The file's own date first: the form's date is often just today's.
    // (The Notes tab's button passes itself in presetDate's place.)
    var dates = noteDates(text), said = noteTextDates(text)
    var had = day2FormatAnyDate((existing && existing.sessionDate) || (typeof presetDate === 'string' ? presetDate : '') || '')
    var hint = dates.length
      ? 'Session date read from the file: ' + dates[0] + '.'
        + (dates.length > 1 ? ' The file holds notes for ' + dates.length + ' dates (' + dates.join(', ') + ') and is billed as one session on the date below.' : '')
        + (said.length && said[0] !== dates[0] ? ' The note\'s own text says ' + said[0] + ', so check which is right.' : '')
        + (had && had !== dates[0] ? ' The form had ' + had + '.' : '')
      : 'No session date was found in the file, so please check this date.'
    var dos = await ctgPrompt('Date of this session (MM/DD/YYYY). The note is billed on this date.', {
      title: existing ? 'Replace Note File' : 'Upload Daily Note File', subtitle: file.name, hint: hint,
      value: dates[0] || had || '', rows: 1, okLabel: 'Upload', noGrammar: true
    })
    if (dos === null) return
    var date = day2FormatAnyDate(dos)
    if (!date) { showToast('Please enter the session date as MM/DD/YYYY.', 'err'); return }
    try {
      showToast('Uploading note file…')
      var old = existing ? noteUpload(p, existing) : null
      var doc = await storeUpload(p, f, NOTE_TYPE)
      if (old) await removeUpload(p, old)
      var info = { docId: doc.id, name: doc.name, type: f.type, uploadedAt: doc.uploadedAt }
      if (existing) {
        existing.uploadedFile = info
        existing.sessionDate = date
        existing.savedAt = new Date().toISOString()
      } else {
        if (!Array.isArray(p.dailyNotes)) p.dailyNotes = []
        p.dailyNotes.push(_ensureDailyNoteId({ sessionDate: date, uploadedFile: info, savedAt: new Date().toISOString() }))
      }
      saved(p)
      showToast(existing ? 'Note file replaced ✓' : 'Daily note uploaded ✓')
      return true
    } catch (e) { console.error(e); showToast('Could not upload the note file: ' + e.message, 'err') }
  }

  async function removeNote(pid, given, noteId) {
    var p = getPatient(pid), n = findNote(p, noteId)
    if (!n) return
    var ok = await ctgConfirm('Remove this daily note (' + (n.sessionDate || 'no date') + ')? Its file is deleted and the note comes off billing.', { title: 'Remove Daily Note', okLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await removeUpload(p, noteUpload(p, n))
      p.dailyNotes = p.dailyNotes.filter(function (x) { return x !== n })
      saved(p)
      showToast('Daily note removed')
    } catch (e) { console.error(e); showToast('Could not remove the note: ' + e.message, 'err') }
  }

  // Uploaded notes are listed as file cards; typed notes are left as they are.
  var origNoteRow = window.dnManualRowHTML
  window.dnManualRowHTML = function (p, dn, i, pos, provider) {
    if (!isNoteFile(dn)) return origNoteRow.apply(this, arguments)
    var doc = noteUpload(p, dn), noteAttr = ' data-note="' + esc(dn.id) + '"'
    var head = '<div class="pld-record-head"><div class="pld-record-title"><span>Note #' + (pos + 1) + '</span>'
      + (dn.sessionDate ? '<span class="small-muted">' + esc(dn.sessionDate) + '</span>' : '')
      + '<span class="ctgo-pill">' + ICON.doc + 'Uploaded file</span></div><div class="pld-exam-actions">'
      + (doc ? btn('view', p.id, 'View File', 'btn-primary', ' data-doc="' + esc(doc.id) + '"', 'eye') : '')
      + (provider ? '' : btn('note-replace', p.id, 'Replace', 'btn-ghost', noteAttr, 'swap') + btn('note-remove', p.id, 'Remove', 'btn-ghost ctgo-danger', noteAttr, 'trash'))
      + '</div></div>'
    var body = doc
      ? '<div class="ctgo-file"><div class="ctgo-file-row">' + fileBadge(doc) + '<div class="ctgo-doc-main"><div class="ctgo-doc-name">' + esc(doc.name) + '</div>'
        + '<div class="ctgo-doc-meta"><span>Session <b>' + esc(dn.sessionDate || '—') + '</b></span><span>Uploaded ' + esc(typeof dnFmtStamp === 'function' ? dnFmtStamp(doc.uploadedAt) : (doc.uploadedAt || '')) + '</span></div></div></div></div>'
      : '<div class="ctgo-info">' + ICON.info + '<span>This note\'s file "' + esc(dn.uploadedFile.name) + '" was deleted from Documents. Replace it, or remove the note.</span></div>'
    return '<div class="pld-record-card ctgo-note">' + head + body + '</div>'
  }

  /* ------------------------------ Documents ---------------------------- */
  // Assignment of Benefits / Attorney Agreement: a type in the Documents tab's
  // Add Document list, saved as "Assignment of Benefits" - the type the Final
  // Case Report already places first among the documents (after the Case
  // Discharge Summary, before Valid ID and billing).
  var AOB_TYPE = 'Assignment of Benefits', AOB_LABEL = 'Assignment of Benefits / Attorney Agreement'
  var origDocAdd = window.docUploadSegmentHtml
  window.docUploadSegmentHtml = function (p) {
    var html = origDocAdd.apply(this, arguments)
    var aob = '<option value="' + AOB_TYPE + '">' + esc(AOB_LABEL) + '</option>'
    return html.indexOf('<option value="Valid ID">Valid ID</option>') >= 0
      ? html.replace('<option value="Valid ID">Valid ID</option>', '<option value="Valid ID">Valid ID</option>' + aob)
      : html.replace('</select>', aob + '</select>')
  }

  /* ------------------------ Total Dates of Service ---------------------- */
  // Counted automatically (Day 1, Day 2, re-exams, final exam, daily notes)
  // unless a number is typed for the patient; then that number is used on the
  // Case Discharge Summary, the FCR and everywhere else the count shows.
  // Clearing it goes back to counting. Kept on the patient's billing record.
  var origTdos = window.computeTotalDatesOfService
  function tdosSet(p) {
    var v = p && p.billing && p.billing.totalDatesOfService
    return v !== undefined && v !== null && v !== '' && +v > 0 ? +v : null
  }
  function tdosAuto(p) { try { return origTdos(p, { includeFinal: true }) } catch (e) { return 0 } }
  window.computeTotalDatesOfService = function (p) {
    var v = tdosSet(p)
    return v !== null ? v : origTdos.apply(this, arguments)
  }

  function tdosCard(p) {
    var set = tdosSet(p), auto = tdosAuto(p)
    return '<div class="ctgo-tdos" data-pid="' + esc(p.id) + '">'
      + '<div class="ctgo-tdos-main"><div class="ctgo-tdos-title">Total Dates of Service'
      + (set !== null ? '<span class="ctgo-pill is-warn">' + ICON.pen + 'Entered by hand</span>' : '<span class="ctgo-pill">' + ICON.bolt + 'Counted automatically</span>') + '</div>'
      + '<div class="ctgo-tdos-sub">Automatic count: <b>' + esc(auto) + '</b> (Day 1, Day 2, re-exams, final exam and daily notes). '
      + 'Type a number to use it on the Case Discharge Summary instead; leave it empty to count automatically.</div></div>'
      + '<div class="ctgo-tdos-edit"><input type="text" inputmode="numeric" class="ctgo-tdos-input" data-ctgo-tdos aria-label="Total Dates of Service" placeholder="' + esc(auto) + '" value="' + (set !== null ? esc(set) : '') + '">'
      + btn('tdos-save', p.id, 'Save', 'btn-primary')
      + (set !== null ? btn('tdos-auto', p.id, 'Count Automatically', 'btn-ghost') : '')
      + '</div></div>'
  }

  function tdosSave(pid, _f, _n, el) {
    var p = getPatient(pid)
    if (!p || !el) return
    var raw = String((el.closest('.ctgo-tdos').querySelector('[data-ctgo-tdos]') || {}).value || '').trim()
    if (raw && !/^\d{1,4}$/.test(raw)) { showToast('Enter a whole number of dates, for example 23.', 'err'); return }
    if (raw && +raw === 0) { showToast('Enter a number above 0, or leave it empty to count automatically.', 'err'); return }
    var b = Object.assign({}, p.billing || {})
    if (raw) b.totalDatesOfService = +raw
    else delete b.totalDatesOfService
    p.billing = b
    saved(p)
    syncNoteFormZone()
    showToast(raw ? 'Total Dates of Service set to ' + raw + ' ✓' : 'Total Dates of Service is counted automatically again ✓')
  }
  function tdosClear(pid) {
    var p = getPatient(pid)
    if (!p) return
    var b = Object.assign({}, p.billing || {})
    delete b.totalDatesOfService
    p.billing = b
    saved(p)
    syncNoteFormZone()
    showToast('Total Dates of Service is counted automatically again ✓')
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || !e.target.matches || !e.target.matches('[data-ctgo-tdos]')) return
    e.preventDefault()
    var box = e.target.closest('.ctgo-tdos')
    tdosSave(box.getAttribute('data-pid'), null, null, e.target)
  })

  var origNotesPanel = window.renderPatientNotesPanel
  window.renderPatientNotesPanel = function (p) {
    var html = origNotesPanel.apply(this, arguments)
    if (!p || currentUserIsLawyer() || currentUserIsProvider()) return html
    var zone = dropZone('note-upload', p.id, 'Have a daily note as a file?', 'Drop a PDF or photo here, or choose one. It is saved as a daily note on the date you enter and billed like one.')
    return html.replace('<div id="dailyNotesList">', tdosCard(p) + zone.replace('class="ctgo-drop"', 'class="ctgo-drop is-compact"') + '<div id="dailyNotesList">')
  }

  // "View Notes PDF" builds a PDF from typed notes; uploaded notes are files
  // already, opened from their own cards (and placed in the FCR by date).
  // The Daily Notes form: upload the note as a file instead of typing it. The
  // patient and date come from the form; afterwards the patient's Notes tab
  // opens, where the file is listed as the note.
  async function noteFormUpload(_pid, given) {
    var onNewNote = !!document.querySelector('#page-patientDailyNote.active')
    var pid = '', dateEl
    if (onNewNote) {
      pid = (typeof patientDailyNoteState !== 'undefined' && patientDailyNoteState && patientDailyNoteState.patientId) || ''
      dateEl = document.getElementById('pdnSessionDate')
    } else {
      var sel = document.getElementById('dnName')
      var opt = sel && sel.options[sel.selectedIndex]
      pid = (opt && opt.dataset && opt.dataset.patientId) || ''
      dateEl = document.getElementById('dnSessionDate')
    }
    if (!pid || !getPatient(pid)) { showToast('Choose the patient in Name first.', 'err'); return }
    var date = day2FormatAnyDate((dateEl || {}).value || '')
    if (await uploadNote(pid, given, null, date)) {
      selectPatient(pid)
      setPatientDetailTab('notes')
      showPage('patientLists')
    }
  }
  function formPatient() {
    if (document.querySelector('#page-patientDailyNote.active')) {
      var st = typeof patientDailyNoteState !== 'undefined' ? patientDailyNoteState : null
      return st && st.patientId ? getPatient(st.patientId) : null
    }
    var sel = document.getElementById('dnName'), opt = sel && sel.options[sel.selectedIndex]
    return opt && opt.dataset && opt.dataset.patientId ? getPatient(opt.dataset.patientId) : null
  }
  function syncTdos(holder) {
    if (!holder) return
    var p = formPatient()
    var slot = holder.querySelector('.ctgo-tdos-slot')
    if (!slot) { holder.insertAdjacentHTML('afterbegin', '<div class="ctgo-tdos-slot"></div>'); slot = holder.querySelector('.ctgo-tdos-slot') }
    slot.innerHTML = p && !currentUserIsProvider() && !currentUserIsLawyer() ? tdosCard(p) : ''
  }
  function syncNoteFormZone() {
    var name = document.getElementById('dnName')
    if (!name) return
    var card = name.closest('.card')
    var zone = document.getElementById('ctgoNoteFormZone')
    if (!zone && card) {
      card.insertAdjacentHTML('afterend', '<div id="ctgoNoteFormZone">' + dropZone('note-form-upload', '', 'Have this note as a file?', 'Drop a PDF or photo here, or choose one, instead of typing the note. It is saved for the patient and session date above.').replace('class="ctgo-drop"', 'class="ctgo-drop is-compact"') + '</div>')
      zone = document.getElementById('ctgoNoteFormZone')
    }
    // A patient's "+ New Note" page: the box goes above its form, new notes only.
    var mount = document.getElementById('patientDailyNoteMount')
    var st = typeof patientDailyNoteState !== 'undefined' ? patientDailyNoteState : null
    var card = mount && mount.querySelector('.pdn-card')
    if (card && st && st.mode === 'edit' && st.index < 0 && !currentUserIsProvider() && !mount.querySelector('.ctgo-drop')) {
      card.insertAdjacentHTML('beforebegin', '<div class="ctgo-pdn-zone">' + dropZone('note-form-upload', '', 'Have this note as a file?', 'Drop a PDF or photo here, or choose one, instead of typing the note. It is saved on the session date below.').replace('class="ctgo-drop"', 'class="ctgo-drop is-compact"') + '</div>')
    }
    syncTdos(zone)
    syncTdos(mount && mount.querySelector('.ctgo-pdn-zone'))
    if (!zone) return
    // New notes only: not while a saved note is open, and not for providers.
    var editing = typeof dnCurrentNoteIndex === 'number' && dnCurrentNoteIndex >= 0
    zone.style.display = (editing || currentUserIsProvider() || currentUserIsLawyer()) ? 'none' : ''
  }
  ;['showPage', 'dnPopulate', 'renderPatientDailyNoteDedicatedPage', 'dnOnPatientSelect'].forEach(function (name) {
    var orig = window[name]
    if (typeof orig !== 'function') return
    window[name] = function () {
      var out = orig.apply(this, arguments)
      try { syncNoteFormZone() } catch (e) { /* the form is not on this page */ }
      return out
    }
  })
  setTimeout(function () { try { syncNoteFormZone() } catch (e) {} }, 0)

  var origNotesPdf = window.downloadAllDailyNotesPdfForPatient
  window.downloadAllDailyNotesPdfForPatient = function (id, onDoc, notesOverride) {
    if (!Array.isArray(notesOverride)) {
      var p = getPatient(id)
      if (p && Array.isArray(p.dailyNotes) && p.dailyNotes.some(isNoteFile)) {
        notesOverride = p.dailyNotes.filter(function (n) { return !isNoteFile(n) })
        if (!notesOverride.length && typeof onDoc !== 'function') { showToast('All of this patient\'s notes are uploaded files. Open each one with View File.', 'err'); return }
      }
    }
    return origNotesPdf.call(this, id, onDoc, notesOverride)
  }

  /* ------------------------------- Billing ----------------------------- */
  // While a billing file is attached it is the patient's billing: one line
  // carrying its total, in place of the groups built from Day 1, Day 2 and
  // notes. Everything that reads billing goes through this function.
  var origDerive = window.deriveBillingServices
  window.deriveBillingServices = function (p) {
    var doc = billingUpload(p)
    if (!doc) return origDerive.apply(this, arguments)
    var info = p.billing.uploadedFile
    // Charge lines read from the file: one billing table per date, oldest first.
    if (Array.isArray(info.rows) && info.rows.length) {
      var byDate = {}, order = []
      info.rows.forEach(function (r) {
        var d = r.date || ''
        if (!byDate[d]) { byDate[d] = []; order.push(d) }
        byDate[d].push({ date: d, code: r.code || '', desc: r.desc || '', qty: r.qty || 1, charges: +r.charges || 0, payments: +r.payments || 0, adjustments: +r.adjustments || 0, balance: +r.balance || 0 })
      })
      order.sort(function (a, b) { return _bDateKey(a) - _bDateKey(b) })
      return applyBillingEditsToGroups(p, order.map(function (d) { return _bGroup(d, byDate[d], BILL_GROUP + '_' + String(d).replace(/[^0-9]/g, '')) }))
    }
    // No lines could be read: one line carrying the total.
    var total = Number(info.total) || 0
    var date = info.date || ''
    var row = { date: date, code: '', desc: 'Per uploaded billing file: ' + (doc.name || 'billing file'), qty: 1, charges: total, payments: 0, adjustments: 0, balance: total }
    return applyBillingEditsToGroups(p, [_bGroup(date, [row], BILL_GROUP)])
  }

  // Totals in billing files: the last amount after the strongest label wins
  // (statements put the grand total at the end).
  var TOTAL_LABELS = ['total\\s+balance', 'balance\\s+due', 'amount\\s+due', 'total\\s+due', 'grand\\s+total', 'total\\s+charges', 'balance', 'total']
  var MONEY = '\\$?\\s*(-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|-?\\d+\\.\\d{2})'
  function findTotal(text) {
    var t = String(text || '').replace(/\s+/g, ' ')
    for (var i = 0; i < TOTAL_LABELS.length; i++) {
      var re = new RegExp(TOTAL_LABELS[i] + '[^0-9$]{0,40}?' + MONEY, 'gi'), m, last = null
      while ((m = re.exec(t))) last = m[1]
      if (last !== null) return parseMoney(last)
    }
    return null
  }
  window.ctgOfflineFindTotal = findTotal

  // A charge line: date, 5-character procedure code, description, quantity,
  // then 1-4 amounts (charges [, payments, adjustments], balance) - the
  // layout of the portal's own statement and of most billing programs.
  var LINE = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Z0-9]\d{3}[A-Z0-9])\s+(.*?)\s+(\d{1,3})\s+((?:\(?-?\$?\s?[\d,]+\.\d{2}\)?\s*){1,4})$/
  function money(s) {
    var neg = /^\(.*\)$/.test(s.trim()) || /-/.test(s)
    var n = parseMoney(s)
    return n === null ? 0 : (neg ? -Math.abs(n) : n)
  }
  // The practice's EnableDoc Superbill: date, type (CSV), code, modifiers,
  // units, description, date of injury, place of service, tax, amount.
  var SUPERBILL_LINE = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+[A-Z]{2,4}\s+([A-Z0-9][A-Z0-9.]{2,7})\s+(?:[A-Z0-9]{2}\s+){0,4}(\d{1,3})\s+(.*?)(?:\s+\d{1,2}\/\d{1,2}\/\d{4})?\s+\d{1,2}\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})$/
  function findRows(lines) {
    var rows = []
    lines.forEach(function (line) {
      var l = line.replace(/\s+/g, ' ').trim()
      var m = LINE.exec(l)
      if (m) {
        var amts = m[5].match(/\(?-?\$?\s?[\d,]+\.\d{2}\)?/g).map(money)
        var row = { date: day2FormatAnyDate(m[1]) || m[1], code: m[2], desc: m[3], qty: +m[4] || 1, charges: amts[0], payments: 0, adjustments: 0, balance: amts[amts.length - 1] }
        if (amts.length === 4) { row.payments = amts[1]; row.adjustments = amts[2] }
        else if (amts.length === 3) row.payments = amts[1]
        rows.push(row)
        return
      }
      var s = SUPERBILL_LINE.exec(l)
      if (s) {
        var amount = Math.round((money(s[5]) + money(s[6])) * 100) / 100
        rows.push({ date: day2FormatAnyDate(s[1]) || s[1], code: s[2], desc: s[4], qty: +s[3] || 1, charges: amount, payments: 0, adjustments: 0, balance: amount })
      }
    })
    return rows
  }
  // A Superbill's balance: its "Total" (charges and tax) less "Total Payments".
  function superbillTotal(text) {
    var t = String(text || '').replace(/\s+/g, ' ')
    if (!/\bSuperbill\b/.test(t)) return null
    var last = function (re) { var m, v = null; while ((m = re.exec(t))) v = parseMoney(m[1]); return v }
    var total = last(/\bTotal\s+\$\s*(-?[\d,]+\.\d{2})/g)
    if (total === null) return null
    var paid = last(/\bTotal Payments\s+\$\s*(-?[\d,]+\.\d{2})/g) || 0
    return Math.round((total - paid) * 100) / 100
  }
  window.ctgOfflineFindRows = findRows

  // The file's text, rebuilt into lines by position on the page.
  async function readBillingFile(f) {
    if (!/pdf/i.test(f.type)) return { total: null, rows: [] }
    try {
      var lib = await ensurePdfJs()
      var pdf = await lib.getDocument({ data: dataUrlToBytes(f.dataUrl) }).promise
      var text = '', lines = []
      for (var i = 1; i <= pdf.numPages; i++) {
        var items = (await (await pdf.getPage(i)).getTextContent()).items.filter(function (it) { return String(it.str).trim() })
        text += items.map(function (it) { return it.str }).join(' ') + '\n'
        var rowsByY = []
        items.forEach(function (it) {
          var y = it.transform[5], x = it.transform[4]
          var r = rowsByY.filter(function (g) { return Math.abs(g.y - y) < 3 })[0]
          if (!r) { r = { y: y, parts: [] }; rowsByY.push(r) }
          r.parts.push({ x: x, s: it.str })
        })
        rowsByY.sort(function (a, b) { return b.y - a.y }).forEach(function (r) {
          lines.push(r.parts.sort(function (a, b) { return a.x - b.x }).map(function (q) { return q.s }).join(' '))
        })
      }
      // Totals from the lines as printed: in the PDF's own text order a label
      // can sit far from its amount ("Total Charges ... $265.00").
      var printed = lines.join('\n')
      var total = superbillTotal(printed)
      if (total === null) total = findTotal(printed)
      if (total === null) total = findTotal(text)
      return { total: total, rows: findRows(lines), who: readPatientId(printed, true) }
    } catch (e) { console.error('Could not read the billing file text', e); return { total: null, rows: [] } }
  }

  function rowsTotal(rows) { return Math.round(rows.reduce(function (a, r) { return a + (+r.balance || 0) }, 0) * 100) / 100 }

  async function askTotal(detected, current, fileName, rows) {
    var found = detected !== null && detected !== undefined
    var msg
    if (rows && rows.length) {
      msg = 'Read ' + rows.length + ' charge line' + (rows.length === 1 ? '' : 's') + ' from the file, totaling ' + _bMoney(rowsTotal(rows)) + '.'
        + (found && Math.abs(detected - rowsTotal(rows)) > 0.005 ? ' The file\'s own total says ' + _bMoney(detected) + '.' : '')
        + ' Keep this total to show the lines in the billing tables, or type a different total to use one line instead.'
    } else if (found) {
      msg = 'Total found in the file: ' + _bMoney(detected) + '. No charge lines could be read, so it will show as one line. Check the total against the file and correct it if needed.'
    } else {
      msg = current !== undefined ? 'Enter the billing total for this patient.' : 'No total could be read from this file (a scanned paper or photo cannot be read). Type the total balance shown on the file.'
    }
    var value = rows && rows.length ? rowsTotal(rows).toFixed(2) : found ? detected.toFixed(2) : (current !== undefined ? Number(current).toFixed(2) : '')
    var answer = await ctgPrompt(msg, {
      title: 'Billing File Total', subtitle: fileName || '', value: value,
      hint: 'Used for Total Balance, AR Summary and Collections while the file is attached.', rows: 2, okLabel: 'Save', noGrammar: true
    })
    if (answer === null) return null
    var amount = parseMoney(answer)
    if (amount === null) { showToast('Please enter an amount, for example 1250.00', 'err'); return null }
    return amount
  }

  function clearBillingEdits(p) {
    if (p.billingEdits) Object.keys(p.billingEdits).forEach(function (k) { if (k.indexOf(BILL_GROUP) === 0) delete p.billingEdits[k] })
  }

  async function uploadBilling(pid, given) {
    var p = getPatient(pid)
    if (!p) return
    var file = given || await pickFile()
    if (!file) return
    try {
      showToast('Reading billing file…')
      var f = await prepareFile(file)
      var read = await readBillingFile(f)
      if (!await confirmPatient(p, read.who || {}, 'billing file')) return
      var amount = await askTotal(read.total, undefined, f.name, read.rows)
      if (amount === null) return
      // The lines are kept only when the total confirmed is theirs.
      var rows = read.rows.length && Math.abs(amount - rowsTotal(read.rows)) < 0.005 ? read.rows : null
      showToast('Uploading billing file…')
      var old = billingUpload(p)
      var doc = await storeUpload(p, f, BILL_TYPE)
      if (old) await removeUpload(p, old)
      var b = Object.assign({}, p.billing || {})
      b.uploadedFile = { docId: doc.id, name: doc.name, type: f.type, uploadedAt: doc.uploadedAt, date: today(), total: amount, rows: rows,
        readFromFile: !!rows || (read.total !== null && Math.abs(read.total - amount) < 0.005) }
      clearBillingEdits(p)
      p.billing = b
      saved(p)
      showToast((rows ? rows.length + ' charge lines read ✓ ' : 'Billing file uploaded ✓ ') + 'Automatic billing is paused for this patient.')
    } catch (e) { console.error(e); showToast('Could not upload the billing file: ' + e.message, 'err') }
  }

  async function changeBillingTotal(pid) {
    var p = getPatient(pid)
    if (!p || !billingUpload(p)) return
    var amount = await askTotal(null, (getBillingStatementData(p).grandTotal || {}).balance, p.billing.uploadedFile.name)
    if (amount === null) return
    var b = Object.assign({}, p.billing)
    // A typed total replaces the lines read from the file and any Edit Table change.
    b.uploadedFile = Object.assign({}, b.uploadedFile, { total: amount, rows: null, readFromFile: false })
    clearBillingEdits(p)
    p.billing = b
    saved(p)
    showToast('Billing total saved ✓')
  }

  async function removeBilling(pid) {
    var p = getPatient(pid)
    if (!p || !p.billing || !p.billing.uploadedFile) return
    var ok = await ctgConfirm('Remove the billing file? Automatic billing from Day 1, Day 2 and notes comes back on for this patient.', { title: 'Remove Billing File', okLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await removeUpload(p, billingUpload(p))
      var b = Object.assign({}, p.billing)
      delete b.uploadedFile
      p.billing = b
      saved(p)
      showToast('Billing file removed. Automatic billing is back on.')
    } catch (e) { console.error(e); showToast('Could not remove the billing file: ' + e.message, 'err') }
  }

  function billingCard(p) {
    var doc = billingUpload(p)
    var head = '<div class="pld-record-head"><div class="ctgo-head"><div class="pld-record-title"><span>Billing File</span></div>'
    if (!doc) {
      return '<div class="pld-record-card ctgo-card">' + head + '<span class="ctgo-pill">' + ICON.bolt + 'Automatic billing on</span></div></div>'
        + dropZone('bill-upload', p.id, 'Have a billing statement already?', 'Drop the PDF or a photo here, or choose one. Its total replaces automatic billing from Day 1, Day 2 and notes until you remove it.')
        + '</div>'
    }
    var info = p.billing.uploadedFile
    var total = (getBillingStatementData(p).grandTotal || {}).balance || 0
    return '<div class="pld-record-card ctgo-card">' + head + '<span class="ctgo-pill is-warn">' + ICON.pause + 'Automatic billing paused</span></div></div>'
      + '<div class="ctgo-filecard"><div class="ctgo-filecard-top">' + fileBadge(doc)
      + '<div class="ctgo-doc-main"><div class="ctgo-doc-name">' + esc(doc.name) + '</div>'
      + '<div class="ctgo-doc-meta"><span>Uploaded ' + esc(info.date || '') + '</span></div></div>'
      + '<div class="ctgo-amount"><div class="ctgo-amount-label">Total</div><div class="ctgo-amount-value">' + esc(_bMoney(total)) + '</div>'
      + '<span class="ctgo-chip' + (info.readFromFile ? ' is-read' : '') + '">' + (Array.isArray(info.rows) && info.rows.length ? ICON.check + info.rows.length + ' line' + (info.rows.length === 1 ? '' : 's') + ' read from file' : info.readFromFile ? ICON.check + 'Read from file' : ICON.pen + 'Entered by hand') + '</span></div></div>'
      + '<div class="ctgo-actions">'
      + btn('view', p.id, 'View File', 'btn-primary', ' data-doc="' + esc(doc.id) + '"', 'eye')
      + btn('bill-total', p.id, 'Change Total', 'btn-ghost', '', 'pen')
      + btn('bill-upload', p.id, 'Replace', 'btn-ghost', '', 'swap')
      + '<span class="ctgo-spacer"></span>' + btn('bill-remove', p.id, 'Remove', 'btn-ghost ctgo-danger', '', 'trash')
      + '</div></div>'
      + infoNote((Array.isArray(info.rows) && info.rows.length ? 'The billing tables below show the charge lines read from this file. ' : '') + 'Charges from Day 1, Day 2 and notes are not added while this file is attached. Remove it to turn automatic billing back on.')
      + '</div>'
  }

  var origBillingPanel = window.renderPatientBillingPanel
  window.renderPatientBillingPanel = function (p) {
    var html = origBillingPanel.apply(this, arguments)
    if (!p || currentUserIsLawyer()) return html
    return html.replace('<div class="fcr-body">', '<div class="fcr-body">' + billingCard(p))
  }

  /* ------------------------------- clicks ------------------------------ */
  // Capture phase, so a button inside a clickable row does not also open the row.
  var ACTIONS = {
    'day1-upload': uploadDay1, 'day1-remove': removeDay1, 'day1-form': fillDay1Form,
    'bill-upload': uploadBilling, 'bill-total': changeBillingTotal, 'bill-remove': removeBilling,
    'note-upload': uploadNote, 'note-replace': uploadNote, 'note-remove': removeNote,
    'note-form-upload': noteFormUpload,
    'tdos-save': tdosSave, 'tdos-auto': tdosClear
  }
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-ctgo]')
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    var action = el.getAttribute('data-ctgo'), pid = el.getAttribute('data-pid')
    if (action === 'view') viewUpload(pid, el.getAttribute('data-doc'))
    else if (ACTIONS[action]) ACTIONS[action](pid, null, el.getAttribute('data-note'), el)
  }, true)

  // Drag and drop onto a drop zone.
  function zoneOf(e) { return e.target && e.target.closest && e.target.closest('[data-ctgo-drop]') }
  document.addEventListener('dragover', function (e) {
    var z = zoneOf(e)
    if (!z) return
    e.preventDefault()
    z.classList.add('is-over')
  })
  document.addEventListener('dragleave', function (e) {
    var z = zoneOf(e)
    if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over')
  })
  document.addEventListener('drop', function (e) {
    var z = zoneOf(e)
    if (!z) return
    e.preventDefault()
    z.classList.remove('is-over')
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    var action = ACTIONS[z.getAttribute('data-ctgo-drop')]
    if (file && action) action(z.getAttribute('data-pid'), file)
  })

  /* ---------------------------- provider list --------------------------- */
  // Online, the server tells every open page when accounts change and the
  // Provider pickers reload. Offline there is no server, so they reload here
  // after the Admin Center adds, switches off or deletes an account.
  ;['acSaveAccount', 'acToggleActive', 'acDeleteAccount'].forEach(function (name) {
    var orig = window[name]
    if (typeof orig !== 'function') return
    window[name] = function () {
      var out = orig.apply(this, arguments)
      Promise.resolve(out).then(function () { if (typeof window.ctgLoadProviders === 'function') window.ctgLoadProviders() }, function () {})
      return out
    }
  })

  // (CMS-1500 Print preview and Clear Demo are fixed in claimform.js itself
  // since 8 Oct, for the live portal and this copy alike.)

  var css = document.createElement('style')
  css.textContent = [
    // Initials circles keep their size: on narrower screens the patient header
    // squeezed them into ovals (they could shrink to the width of the letters).
    '.pld-profile-avatar,.pt-av,.pdn-avatar{flex-shrink:0!important;aspect-ratio:1/1}',
    // ...and the name keeps room: when the header is narrow the buttons move
    // below instead of crushing the name into a column of letters.
    '.pld-profile-top{flex-wrap:wrap}',
    '.pld-profile-main{flex:1 1 340px}',
    '.pld-profile-main > div:not(.pld-profile-avatar){flex:1;min-width:0}',
    '.ctgo-flat{margin-bottom:0}',
    '.ctgo-card{margin-bottom:14px}',
    '.ctgo-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    // status pills
    '.ctgo-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:700;letter-spacing:.01em;background:rgba(0,180,216,.1);color:#0284a8;border:1px solid rgba(0,180,216,.25)}',
    '.ctgo-pill svg,.ctgo-chip svg{width:13px;height:13px;flex:none}',
    '.ctgo-pill.is-warn{background:rgba(245,158,11,.12);color:#b45309;border-color:rgba(245,158,11,.32)}',
    // drop zone
    '.ctgo-drop{display:flex;align-items:center;gap:16px;margin-top:14px;padding:18px 20px;border:1.5px dashed var(--border2);border-radius:var(--r,14px);background:linear-gradient(135deg,rgba(0,119,182,.045),rgba(0,180,216,.06));transition:border-color .15s,background .15s,box-shadow .15s}',
    '.ctgo-drop:hover{border-color:rgba(0,119,182,.45)}',
    '.ctgo-drop.is-over{border-color:var(--accent);background:rgba(0,119,182,.1);box-shadow:0 0 0 4px rgba(0,119,182,.08)}',
    '.ctgo-tdos{display:flex;align-items:center;gap:14px 18px;flex-wrap:wrap;margin:12px 0;padding:14px 16px;border:1px solid var(--border);border-radius:var(--r,14px);background:var(--surface)}',
    '#ctgoNoteFormZone .ctgo-tdos,.ctgo-pdn-zone .ctgo-tdos{margin:0 0 12px}',
    '.ctgo-tdos-main{flex:1;min-width:240px}',
    '.ctgo-tdos-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:700;font-size:14px;color:var(--text)}',
    '.ctgo-tdos-sub{margin-top:4px;font-size:12.5px;line-height:1.5;color:var(--muted)}',
    '.ctgo-tdos-sub b{color:var(--text)}',
    '.ctgo-tdos-edit{display:flex;align-items:center;gap:8px;flex:none}',
    '.ctgo-tdos-edit .btn{flex:none;white-space:nowrap}',
    'html body .ctgo-tdos-input{width:84px!important;min-width:0!important;flex:none!important;height:36px;padding:0 12px;border:1px solid var(--border2);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:15px;font-weight:700;text-align:center}',
    '.ctgo-tdos-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,119,182,.12)}',
    '#ctgoNoteFormZone .ctgo-drop{margin:0 0 18px;background:var(--surface)}',
    '.ctgo-pdn-zone .ctgo-drop{margin:14px 0;background:var(--surface)}',
    '.ctgo-drop.is-compact{margin:12px 0;padding:12px 16px}.ctgo-drop.is-compact .ctgo-drop-icon{width:38px;height:38px;border-radius:12px}',
    '.ctgo-note .ctgo-file{margin-top:10px}.ctgo-file-row{display:flex;align-items:center;gap:12px;width:100%}.ctgo-note .ctgo-badge{width:36px;height:42px}',
    '.ctgo-drop-icon{flex:none;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#0077B6,#00B4D8);box-shadow:0 6px 16px rgba(0,119,182,.25)}',
    '.ctgo-drop-icon svg{width:22px;height:22px}',
    '.ctgo-drop-text{flex:1;min-width:0}',
    '.ctgo-drop-title{font-weight:700;font-size:14.5px;color:var(--text);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.ctgo-drop-sub{margin-top:3px;font-size:12.5px;color:var(--muted);line-height:1.5}',
    // file card
    '.ctgo-filecard{margin-top:14px;border:1px solid var(--border);border-radius:var(--r,14px);background:var(--surface);box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(0,119,182,.06);overflow:hidden}',
    '.ctgo-filecard.is-missing{border-color:rgba(245,158,11,.35)}',
    '.ctgo-filecard-top{display:flex;align-items:center;gap:14px;padding:16px 18px}',
    '.ctgo-badge{flex:none;width:44px;height:52px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;background:linear-gradient(160deg,#ef4444,#b91c1c);box-shadow:0 4px 12px rgba(185,28,28,.22)}',
    '.ctgo-badge.is-img{background:linear-gradient(160deg,#0096C7,#023E8A);box-shadow:0 4px 12px rgba(2,62,138,.22)}',
    '.ctgo-badge svg{width:18px;height:18px}',
    '.ctgo-badge span{font-size:9.5px;font-weight:800;letter-spacing:.06em}',
    '.ctgo-doc-main{flex:1;min-width:0}',
    '.ctgo-doc-name{font-weight:700;font-size:14.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ctgo-doc-meta{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12.5px;color:var(--muted)}',
    '.ctgo-doc-meta b{color:var(--text);font-weight:700}',
    '.ctgo-amount{flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px}',
    '.ctgo-amount-label{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}',
    '.ctgo-amount-value{font-size:24px;font-weight:800;line-height:1;color:var(--text);font-variant-numeric:tabular-nums}',
    '.ctgo-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--muted)}',
    '.ctgo-chip.is-read{color:#0284a8}',
    '.ctgo-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--border);background:var(--s2)}',
    '.ctgo-actions .btn{display:inline-flex;align-items:center;gap:6px}',
    '.ctgo-actions .btn svg,.pld-exam-actions .btn svg,.patient-row .btn svg,.ctgo-drop .btn svg{width:14px;height:14px;flex:none}',
    '.btn[data-ctgo]{display:inline-flex;align-items:center;gap:6px}',
    '.btn[data-ctgo] svg{width:14px;height:14px;flex:none}',
    '.ctgo-spacer{flex:1}',
    // The portal's button styles win over a plain class, hence the long selectors.
    'html body .btn.btn-ghost.ctgo-danger{color:#dc2626!important}',
    'html body .btn.btn-ghost.ctgo-danger:hover{color:#b91c1c!important;background:rgba(220,38,38,.08)!important;border-color:rgba(220,38,38,.35)!important}',
    '.ctgo-info{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12.5px;line-height:1.55;color:var(--muted)}',
    '.ctgo-info svg{width:15px;height:15px;flex:none;margin-top:2px;color:var(--accent)}',
    // dark theme
    'html[data-theme="dark"] .ctgo-pill{background:rgba(0,180,216,.14);color:#67e8f9;border-color:rgba(0,180,216,.3)}',
    'html[data-theme="dark"] .ctgo-pill.is-warn{background:rgba(251,191,36,.14);color:#fbbf24;border-color:rgba(251,191,36,.32)}',
    'html[data-theme="dark"] .ctgo-drop{background:rgba(0,180,216,.06)}',
    'html[data-theme="dark"] .ctgo-chip.is-read{color:#67e8f9}',
    'html[data-theme="dark"] body .btn.btn-ghost.ctgo-danger{color:#f87171!important}',
    'html[data-theme="dark"] body .btn.btn-ghost.ctgo-danger:hover{color:#fca5a5!important;background:rgba(248,113,113,.12)!important;border-color:rgba(248,113,113,.4)!important}',
    // phones and narrow panels
    '@media (max-width:720px){.ctgo-drop{flex-wrap:wrap}.ctgo-filecard-top{flex-wrap:wrap}.ctgo-amount{width:100%;align-items:flex-start;text-align:left}}'
  ].join('\n')
  document.head.appendChild(css)
})()
