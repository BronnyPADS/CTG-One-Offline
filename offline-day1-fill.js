/* CTG One - offline version only: fill the Day 1 form from an uploaded Day 1 file.
 *
 * A Day 1 uploaded as a file (offline-uploads.js) is a PDF the portal cannot
 * answer questions from: daily notes, exams and the Final Case Report have
 * none of its answers. "Fill Day 1 Form from File" reads the file and fills
 * the Day 1 form with what it says (staff, 5 Nov 2026):
 *
 *   - the file is read line by line, and split into answers at the Day 1
 *     report's own labels ("Job Duties:", "1b. Is there evidence ...?",
 *     "Previous #:") and headings, so an answer ends where the next one starts
 *     even in the side-by-side tables;
 *   - each answer is put in the form the way staff would: the option picked,
 *     Yes / No / N/A clicked, the box ticked, the score set, a typed choice
 *     added to its list. Everything filled is marked, and a banner asks staff
 *     to check the answers, fill anything missing and click Save;
 *   - until Save the file stays the Day 1 record (offline-uploads.js keeps the
 *     form's autosave off for an uploaded Day 1). On Save the form becomes the
 *     record and the Final Case Report prints a fresh Day 1 from it; the file
 *     stays in Documents but is no longer printed in the FCR.
 *
 * Built for the portal's own Day 1 report, old and new wording. Another
 * layout fills only what it shares with it; nothing is guessed.
 */
(function () {
  'use strict'

  /* ------------------------------ reading ------------------------------ */
  // pdf.js reads the dashes of jsPDF's built-in fonts as U+FFFD; the report's dashes are em dashes.
  var fixChars = function (s) { return String(s).replace(/\ufffd/g, '\u2014') }

  /* The file's lines in reading order, without the letterhead and page footers.
     Each line: { page, y, size, x, right, text }. The Risk Factors for
     Protracted Recovery table is four columns side by side; it is read column
     by column, so each question is followed by its own answer. */
  async function readLines(dataUrl) {
    var lib = await ensurePdfJs()
    var pdf = await lib.getDocument({ data: dataUrlToBytes(dataUrl), isEvalSupported: false }).promise
    var out = []
    try {
      for (var n = 1; n <= pdf.numPages; n++) {
        var page = await pdf.getPage(n)
        var h = page.getViewport({ scale: 1 }).height
        var items = (await page.getTextContent()).items.filter(function (it) { return it.str && it.str.trim() })
        var rows = []
        items.forEach(function (it) {
          var y = it.transform[5], size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10
          var r = rows.filter(function (g) { return Math.abs(g.y - y) < Math.max(2, Math.min(size, g.size) * 0.5) })[0]
          if (!r) { r = { y: y, size: size, parts: [] }; rows.push(r) }
          r.parts.push({ x: it.transform[4], w: it.width || 0, s: fixChars(it.str) })
        })
        // Parts of one line joined as printed: a space only where there is a gap.
        var join = function (parts, size) {
          var t = ''
          parts.forEach(function (q, i) {
            var prev = parts[i - 1]
            var gap = prev ? q.x - (prev.x + prev.w) : 0
            // ...or after a label's colon, whose space can sit inside the label's own width.
            t += (prev && (gap > size * 0.12 || /[:;,]$/.test(t)) && !/\s$/.test(t) && !/^\s/.test(q.s) ? ' ' : '') + q.s
          })
          return t.replace(/\s+/g, ' ').trim()
        }
        var lines = []
        rows.sort(function (a, b) { return b.y - a.y }).forEach(function (r) {
          r.parts.sort(function (a, b) { return a.x - b.x })
          var text = join(r.parts, r.size)
          var top = h - r.y
          if (top < 118 && /CONCUSSION THERAPY GROUP|2411 Crofton|Crofton, MD|Phone: 410|Fax: 410/i.test(text)) return
          if (top > h - 40 && (/^Concussion Therapy Group \//.test(text) || /^(page\s+)?\d+\s*(of|\|)\s*\d+$/i.test(text))) return
          var last = r.parts[r.parts.length - 1]
          lines.push({ page: n, y: r.y, size: r.size, x: r.parts[0].x, right: last.x + last.w, text: text, parts: r.parts })
        })
        // The side-by-side table: its header row starts "Concussion History?".
        for (var i = 0; i < lines.length; i++) {
          var hd = lines[i]
          if (!/^Concussion History\?/.test(hd.text) || hd.parts.length < 2) continue
          // A column starts where the header row has a wide gap (a label and its answer can be two parts).
          var cols = []
          hd.parts.forEach(function (q, k) { var pv = hd.parts[k - 1]; if (!pv || q.x - (pv.x + pv.w) > 15) cols.push(q.x) })
          if (cols.length < 2) continue
          var run = [hd]
          for (var j = i + 1; j < lines.length && Math.abs(lines[j].size - hd.size) < 0.6; j++) run.push(lines[j])
          var byCol = cols.map(function () { return [] })
          run.forEach(function (ln) {
            var cells = cols.map(function () { return [] })
            ln.parts.forEach(function (q) {
              var c = 0
              cols.forEach(function (x, k) { if (q.x >= x - 2) c = k })
              cells[c].push(q)
            })
            cells.forEach(function (cell, k) {
              if (cell.length) byCol[k].push({ page: n, y: ln.y, size: ln.size, x: cell[0].x, right: cell[cell.length - 1].x + cell[cell.length - 1].w, text: join(cell, ln.size), parts: cell, table: true })
            })
          })
          var flat = [].concat.apply([], byCol)
          lines.splice.apply(lines, [i, run.length].concat(flat))
          i += flat.length - 1
        }
        lines.forEach(function (ln) { delete ln.parts; out.push(ln) })
      }
    } finally { try { pdf.destroy() } catch (e) {} }
    return out
  }

  /* ------------------------------ splitting ----------------------------- */
  var esc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
  var norm = function (s) { return fixChars(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim() }
  // For comparing: any case, any dash, without the closing full stop.
  var low = function (s) { return norm(s).toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/[.\s]+$/, '') }
  var noDot = function (s) { return norm(s).replace(/\s*\.$/, '') }
  var blank = function (v) { var s = norm(v); return !s || /^[\u2014\u2013-]+$/.test(s) }
  // A label or heading as a pattern: any spacing (it may wrap), any dash.
  var pat = function (s) { return esc(s).replace(/ /g, '\\s+').replace(/[\u2013\u2014]/g, '[\u2013\u2014-]') }

  /* Headings end an answer and are not answers. A line of capitals is a
     heading too ("SUMMARY OF MOTOR VEHICLE COLLISIONS ..." wraps onto two). */
  var HEADINGS = ['Impression', 'Diagnosis', 'Prognosis', 'Causation', 'Medical Necessity', 'Reasonableness',
    'Developmental History', 'Psychiatric History', 'Glossary: Terms and Abbreviations', 'Evaluation and Treatment:',
    'A. Injury Characteristics', 'B. Symptom Check List*', 'C. Risk Factors for Protracted Recovery (Yes or No)',
    'D. RED FLAGS for acute emergency management', 'E. Diagnosis (ICD-10)', 'F. Follow-Up Action Plan',
    'Acute Concussion Evaluation (ACE)', 'Neuropsychologic and Vestibular Test Indication:', 'Traumatic Brain Injury Explanation:',
    'Significance of Second Head Impact on Concussion Severity', 'Definition of Concussion from The United States Centers for Disease Control and Prevention (CDC):']
  // ...and these start a line with more after them.
  var LEADS = ['INITIAL DATE OF SERVICE', 'PHYSICAL (10)', 'COGNITIVE (4)', 'SLEEP (4)', 'EMOTIONAL (4)',
    'Since the injury, has the person experienced', 'Refer to the emergency department', 'Complete ACE Care Plan',
    'Neurocognitive Examination and Vestibular Examination', 'Peer-Reviewed Validation Research']

  // Labels the Day 1 report prints before an answer.
  var QUAD = ['Concussion History?', 'Previous #', 'Longest symptom duration', 'If multiple concussions, less force caused reinjury?',
    'Headache History?', 'Prior treatment for headache', 'History of migraine headache', 'Learning disabilities',
    'Attention-Deficit/Hyperactivity Disorder', 'Other developmental disorder', 'Anxiety', 'Depression', 'Sleep disorder', 'Other psychiatric disorder']
  var LABELS = ['Chief Complaint', 'Activity of Daily Living (ADL) Limitations', 'Vision Problems', 'Employment Status', 'Patient Goals',
    'Risk Factors for Injury Severity and Prolonged Recovery', 'Language', 'Native Country/Region', 'Residual Effects of Concussion',
    'Previous Concussions Resulting in', 'Loss of Consciousness (previous concussions)', 'Other Significant Medical History',
    'Job Duties', 'Social Habits', 'Diet and Nutrition', 'Exercise Habits', 'Family History', 'Total MVCs', 'Total SOCs',
    'Total Collisions to Unit 1', 'DHI 1', 'DHI 2', 'DHI 3', 'IHI 1', 'IHI 2', 'IHI 3', 'Total Head Impacts', 'Head Impacts', 'Date of Injury', 'Reporter',
    '1. Injury Description (see above Mechanism of Injury)', '1a. Is there evidence of a forcible blow to the head (direct or indirect)?',
    '1b. Is there evidence of intracranial injury or skull fracture?', '1c. Location of Impact', 'Cause: MVC',
    '1. Amnesia Before (Retrograde)', '2. Amnesia After (Anterograde)', '3. Loss of Consciousness', 'EARLY SIGNS', 'Seizures observed?',
    'Total Symptom Score (0-22)', 'Overall Rating (Normal 0 1 2 3 4 5 6 Different)', 'Exertion \u2014 Physical Activity',
    'Exertion \u2014 Cognitive Activity', 'List other comorbid medical disorders or medication usage', 'Red Flag Screening', 'Notes',
    'Follow-Up', 'Referral', 'ACE Completed by', 'Plan', 'Treatment Effectiveness', 'Home/Self Care', 'Recommendation',
    'Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Long-Term Recurring Episodes of Neuroinflammation and Neuroinflammatory Symptoms',
    'Acute Concussion Evaluation (ACE) score', 'Name', 'DOB', 'DOI', 'Session Date', 'Provider'].concat(QUAD)

  /* Questions as earlier reports worded them, and the question now in that
     place (answers are kept by position, so the answer is the same question). */
  var OLD_LABELS = {
    'Aphasia (lag time between ideation and speech)': 'Aphasia - comprehension lag time',
    'Aphasia (chosen wrong words when speaking)': 'Aphasia - word choice lag time',
    'Aphasia (the patient takes longer to produce words, omits syllables within words, and repeatedly goes back and forth, restating the word to self-correct.)': 'Aphasia - phonation lag time',
    'Aphasia - a word choice lag time': 'Aphasia - word choice lag time',
    'Strenuous exercise in last 3 hours': 'Strenuous exercise in the last 3 hours',
    'Do you have any orthopedic problem or injuries?': 'Do you have any orthopedic problems or injuries?'
  }

  // The text the answers are read from, with a blank line between paragraphs.
  function textOf(lines) {
    var maxRight = lines.reduce(function (m, l) { return Math.max(m, l.right || 0) }, 0)
    var text = ''
    lines.forEach(function (ln, i) {
      var prev = lines[i - 1], brk = ''
      if (prev) {
        brk = '\n'
        if (prev.page === ln.page) { if (prev.y - ln.y > ln.size * 1.35) brk = '\n\n' }
        // Across a page: a paragraph ended if its last line stopped short with a full stop.
        else if (prev.right < maxRight - 40 && /[.!?:"')]$/.test(prev.text)) brk = '\n\n'
      }
      text += brk + ln.text
    })
    return text
  }

  /* The answers: { label: [value, value...] } in the order printed, plus the
     text under each heading for the paragraphs (Mechanism of Injury,
     Impression, the Assessment's Diagnosis). The glossary (its "DHI 1:" is a
     definition) and the Case Discharge Summary after the Day 1 are left out. */
  function splitAnswers(lines) {
    var cut = [], skip = false, extra = {}
    lines.forEach(function (ln) {
      if (/^Glossary: Terms and Abbreviations/.test(ln.text)) skip = 'glossary'
      else if (skip === 'glossary' && /^(MECHANISM OF INJURY|HISTORY OF PRESENT ILLNESS)/.test(ln.text)) skip = false
      else if (/^CASE DISCHARGE SUMMARY$/.test(ln.text)) skip = 'cds'
      if (skip === 'cds') { var a = /\bAge:\s*(\d{1,3})\b/.exec(ln.text); if (a) extra.age = a[1] }
      if (!skip) cut.push(ln)
    })
    var qs = typeof HPI_ITEMS !== 'undefined' ? HPI_ITEMS.concat(PMH_ITEMS) : []
    var olds = Object.keys(OLD_LABELS).filter(function (o) { return qs.indexOf(OLD_LABELS[o]) !== -1 })
    var all = LABELS.concat(qs, olds), canon = {}
    var key = function (s) { return low(s).replace(/\s+/g, ' ').replace(/:$/, '') }
    all.forEach(function (l) { canon[key(l)] = OLD_LABELS[l] && olds.indexOf(l) !== -1 ? OLD_LABELS[l] : l })
    // Longest first, so "1. Amnesia Before ..." wins over a shorter label inside it.
    var alts = all.slice().sort(function (a, b) { return b.length - a.length }).map(function (l) {
      return /\?$/.test(l) ? pat(l) + ':?' : pat(l) + '\\s*:'   // "...unaided? No" and the old "...unaided?: No"
    })
    var text = textOf(cut), marks = [], m
    var re = new RegExp('(^|[\\s(])(' + alts.join('|') + ')', 'g')
    while ((m = re.exec(text))) {
      var label = canon[key(m[2].replace(/\?:$/, '?'))]
      if (label) marks.push({ at: m.index + m[1].length, end: m.index + m[0].length, label: label })
    }
    var hre = new RegExp('(^|\\n)(?:(' + HEADINGS.map(pat).join('|') + ')(?=\\n|$)|(' + LEADS.map(pat).join('|') + '))', 'g')
    while ((m = hre.exec(text))) {
      var hName = HEADINGS.concat(LEADS).filter(function (hh) { return key(hh) === key(m[2] || m[3]) })[0] || norm(m[2] || m[3])
      marks.push({ at: m.index + m[1].length, end: m.index + m[0].length, heading: hName })
    }
    // A line of capitals ("HISTORY OF PRESENT ILLNESS (HPI)", "SUMMARY OF MOTOR ...").
    var cre = /(^|\n)([^a-z\n]*[A-Z]{3}[^a-z\n]*)(?=\n|$)/g
    while ((m = cre.exec(text))) {
      if ((m[2].match(/[A-Z]/g) || []).length >= 6) marks.push({ at: m.index + m[1].length, end: m.index + m[0].length, heading: norm(m[2]) })
    }
    marks.sort(function (a, b) { return a.at - b.at || (a.heading ? -1 : 1) })
    var answers = {}, sections = {}
    marks.forEach(function (mk, i) {
      var k = i + 1
      while (marks[k] && marks[k].at < mk.end) k++   // a heading inside a label (or the other way round)
      var next = marks[k], body = mk.end <= (next ? next.at : text.length) ? text.slice(mk.end, next ? next.at : text.length) : ''
      if (mk.heading) { (sections[mk.heading] = sections[mk.heading] || []).push(body.replace(/^\s+|\s+$/g, '')); return }
      ;(answers[mk.label] = answers[mk.label] || []).push(norm(body))
    })
    return { answers: answers, sections: sections, text: text, extra: extra }
  }

  /* ------------------------------ filling ------------------------------ */
  var filled = []   // elements marked as read from the file
  /* What shows a field's answer: the field itself, or for a dropdown drawn as
     a pick list or as Yes / No buttons (the dropdown is hidden), what is drawn. */
  var hiddenEl = function (el) { return el.hidden || el.style.display === 'none' || getComputedStyle(el).display === 'none' }
  function markTarget(el) {
    if (!el) return null
    var box = el.closest('.yn-row') || el.closest('.sym-score-item') || el.closest('.icd-item')
    if (box) return box
    if (el.tagName === 'LABEL' || !hiddenEl(el)) return el
    var fg = el.closest('.fg')
    return (fg && (fg.querySelector('.xq-chip') || fg.querySelector('.xo-yn-btns') || fg.querySelector('.it-display'))) || fg
  }
  var mark = function (el) { var t = markTarget(el); if (t) { t.classList.add('ctgo-filled'); filled.push(t) } }
  var fire = function (el, type) { el.dispatchEvent(new Event(type, { bubbles: true })) }
  var byId = function (id) { return document.getElementById(id) }

  function setText(id, v) {
    var el = byId(id)
    if (!el || blank(v)) return false
    el.value = norm(v)
    fire(el, 'input'); fire(el, 'change'); mark(el)
    return true
  }
  // The option whose text is the answer (any case, with or without its full stop).
  function findOption(el, v) {
    var t = low(v)
    return Array.prototype.filter.call(el.options || [], function (o) { return low(o.textContent) === t || (o.value && low(o.value) === t) })[0] || null
  }
  function setSelect(id, v, addIfMissing) {
    var el = byId(id)
    if (!el || blank(v)) return false
    var o = findOption(el, v)
    if (!o && addIfMissing) { o = document.createElement('option'); o.value = noDot(v); o.textContent = noDot(v); el.appendChild(o) }
    if (!o) return false
    el.value = o.value
    fire(el, 'change'); mark(el)
    return true
  }
  // "Yes, a comment." -> the option and the note after it.
  function optionAndNote(el, v) {
    var s = noDot(v)
    if (!el) return null
    var opts = Array.prototype.map.call(el.options, function (o) { return o.textContent.trim() }).filter(Boolean)
      .sort(function (a, b) { return b.length - a.length })
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i]
      if (low(s) === low(o)) return { opt: o, note: '' }
      if (s.toLowerCase().indexOf(o.toLowerCase() + ', ') === 0) return { opt: o, note: s.slice(o.length + 2).trim() }
    }
    return null
  }

  /* A yellow pick list (day1-extras.js / day1-moi.js): its choices are read
     from the open list, the answer's choices ticked, anything else added. */
  function pickChoices(chip) {
    if (!chip || !window.ctgPicker) return []
    chip.click()
    var opts = Array.prototype.map.call(document.querySelectorAll('.moi-pop .moi-pop-item span'), function (s) { return s.textContent.trim() })
    window.ctgPicker.close()
    return opts
  }
  // "a, b and c" back into choices: known choices first (they may hold commas or "and").
  function splitChoices(v, known) {
    var s = noDot(v), out = []
    var ks = known.slice().sort(function (a, b) { return b.length - a.length })
    while (s) {
      s = s.replace(/^(,\s*|and\s+)/i, '')
      if (!s) break
      var hit = null
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i]
        if (s.toLowerCase().indexOf(k.toLowerCase()) === 0 && /^($|,\s|\sand\s)/i.test(s.slice(k.length))) { hit = k; break }
      }
      if (!hit) { var m = /^(.+?)(?=,\s|\sand\s|$)/i.exec(s); hit = m ? m[1].trim() : s }
      out.push(hit)
      s = s.slice(hit.length).trim()
    }
    return out.filter(Boolean)
  }
  function setPick(taId, v, selectId) {
    var ta = byId(taId)
    if (!ta || blank(v)) return false
    var fg = ta.closest('.fg'), chip = fg && fg.querySelector('.xq-chip')
    var known = pickChoices(chip)
    var s = splitChoices(v, known)
    if (!s.length) return false
    var o = known.slice()
    s.forEach(function (c) { if (!o.some(function (k) { return k.toLowerCase() === c.toLowerCase() })) o.push(c) })
    s = s.map(function (c) { return o.filter(function (k) { return k.toLowerCase() === c.toLowerCase() })[0] || c })
    ta.value = JSON.stringify({ o: o, s: s })
    fire(ta, 'input')
    if (selectId) {   // a dropdown shown as a pick list keeps the joined choices in the dropdown itself
      var el = byId(selectId), text = window.ctgPicker.joinNice(s)
      if (el) {
        if (el.tagName === 'SELECT' && !Array.prototype.some.call(el.options, function (op) { return op.value === text })) {
          var op = document.createElement('option'); op.value = text; op.textContent = text; el.appendChild(op)
        }
        el.value = text; fire(el, 'input'); fire(el, 'change')
      }
    }
    mark(ta)
    return true
  }
  function setPickOrSelect(id, v) { return byId('xq_' + id) ? setPick('xq_' + id, v, id) : setSelect(id, v, true) }

  // A tick list (risk factors, early signs, referral types): known boxes ticked, others added.
  function setChecks(listId, v, joiner) {
    var box = byId(listId)
    if (!box || blank(v) || /^None (reported|observed|identified)/i.test(norm(v))) return false
    var labels = Array.prototype.slice.call(box.querySelectorAll('label'))
    var known = labels.map(function (l) { return chkTxt(l) })
    var picks = splitChoices(joiner ? norm(v).replace(joiner, ', ') : v, known)
    picks.forEach(function (t) {
      var l = labels.filter(function (x) { return chkTxt(x).toLowerCase() === t.toLowerCase() })[0]
      if (l) applyStyledLabelCheck(l, true)
      else if (typeof addCustomRiskLabel === 'function') l = addCustomRiskLabel(listId, t, true)
      if (l) mark(l)
    })
    fire(box, 'change')
    return picks.length > 0
  }

  function setYesNo(item, v) {
    var row = Array.prototype.filter.call(document.querySelectorAll('#hpiList .yn-row, #pmhList .yn-row'), function (r) { return r.dataset.item === item })[0]
    if (!row || blank(v)) return false
    var m = /^(Yes|No|N\/A)\b,?\s*(.*)$/i.exec(noDot(v))
    if (!m) return false
    var want = { yes: 'yes', no: 'no', 'n/a': 'na' }[m[1].toLowerCase()]
    var btn = row.querySelector('.yn-btn.' + want)
    if (btn && !btn.classList.contains('active')) btn.click()
    var cmt = row.querySelector('.yn-comment-input')
    if (cmt && m[2]) { cmt.value = m[2]; fire(cmt, 'input') }
    mark(row)
    return true
  }

  // The four symptom tables: "Headache 1".
  function setSymptoms(text) {
    var done = 0
    ;[['acePhysical', typeof ACE_PHYSICAL !== 'undefined' ? ACE_PHYSICAL : []], ['aceCognitive', typeof ACE_COGNITIVE !== 'undefined' ? ACE_COGNITIVE : []],
      ['aceSleep', typeof ACE_SLEEP !== 'undefined' ? ACE_SLEEP : []], ['aceEmotional', typeof ACE_EMOTIONAL !== 'undefined' ? ACE_EMOTIONAL : []]].forEach(function (pair) {
      var items = document.querySelectorAll('#' + pair[0] + ' .sym-score-item')
      pair[1].forEach(function (label, i) {
        var m = new RegExp('(?:^|\\n)' + esc(label) + '\\s+([01])(?=\\s*(?:\\n|$))').exec(text)
        if (!m || !items[i]) return
        var b = items[i].querySelector('.sym-btn[data-val="' + m[1] + '"]')
        if (b && !b.classList.contains('active')) b.click()
        mark(items[i]); done++
      })
    })
    return done
  }

  // "(S06.0X0A)  Concussion w/o LOC, initial encounter" lines: the Diagnosis list exactly.
  function setDiagnoses(body) {
    var dx = [], re = /\(\s*([A-Z]\d{2}(?:\.[0-9A-Z]{0,4})?)\s*\)\s*([^\n(]*)/g, m
    while ((m = re.exec(body || ''))) dx.push({ code: m[1].replace(/\.$/, ''), desc: norm(m[2]).replace(/[,\s]+$/, '') })
    if (!dx.length) return 0
    var items = Array.prototype.slice.call(document.querySelectorAll('#icdGrid .icd-item'))
    var code = function (el) { return (el.querySelector('.icd-code') || {}).textContent.trim().replace(/\.$/, '') }
    var desc = function (el) { return norm((el.querySelector('.icd-desc') || {}).textContent) }
    var want = new Set()
    dx.forEach(function (d) {
      var el = items.filter(function (x) { return code(x) === d.code && low(desc(x)) === low(d.desc) })[0]
        || items.filter(function (x) { return code(x) === d.code })[0]
      if (el) want.add(el)
    })
    items.forEach(function (el) {
      var on = el.classList.contains('checked')
      if (want.has(el) !== on) el.click()
    })
    want.forEach(function (el) { mark(el) })
    return want.size
  }

  // The injury type picker: a listed type is picked, anything else is a typed type.
  function setInjuryType(v) {
    if (blank(v) || typeof itSync !== 'function') return false
    var t = noDot(v).replace(/^(?:Others|No Vehicle Involved)\s*[^A-Za-z0-9\s]\s*/i, '')
    var opts = typeof itOptions !== 'undefined' ? itOptions : []
    var hit = opts.filter(function (o) { return o.toLowerCase() === t.toLowerCase() })[0]
    if (!hit) { opts.push(t); hit = t }
    itSelected = hit
    itSync()
    mark(byId('itDisplay') || byId('injuryType'))
    return true
  }

  /* The story as written, paragraph by paragraph, into the story box
     (day1-moi.js). The patient's name, first name and date of injury become
     the story's own name and date words, so they follow Registration. */
  function setStory(body) {
    var ta = byId('moiStoryData')
    if (!ta || blank(body)) return false
    var paras = body.split(/\n\n+/).map(function (p) { return norm(p.replace(/\n/g, ' ')) }).filter(Boolean)
    if (!paras.length) return false
    var full = norm((byId('ptName') || {}).value), fname = full.split(' ')[0] || '', doi = norm((byId('doi') || {}).value)
    var words = [[full, 'name'], [doi, 'doi'], [fname, 'fname']].filter(function (w) { return w[0].length > 1 })
    var tokens = []
    paras.forEach(function (p, i) {
      if (i) tokens.push({ k: 'br' })
      var parts = [{ k: 't', s: p }]
      words.forEach(function (w) {
        var re = new RegExp('(^|[^A-Za-z0-9])' + esc(w[0]) + '(?![A-Za-z0-9])')
        parts = [].concat.apply([], parts.map(function (t) {
          if (t.k !== 't') return [t]
          var out = [], s = t.s, m
          while ((m = re.exec(s))) {
            var at = m.index + m[1].length
            if (at) out.push({ k: 't', s: s.slice(0, at) })
            out.push({ k: 'a', f: w[1] })
            s = s.slice(at + w[0].length)
          }
          if (s) out.push({ k: 't', s: s })
          return out
        }))
      })
      tokens = tokens.concat(parts)
    })
    var kind = typeof aceNoVehicleSelected === 'function' && aceNoVehicleSelected() ? 'nonvehicle' : 'vehicle'
    ta.value = JSON.stringify({ v: 1, kind: kind, pristine: false, tokens: tokens })
    fire(ta, 'input')
    mark(byId('moiStoryEditor') || ta)
    return true
  }

  /* The Mechanism of Injury sentences the report writes from the vehicle questions. */
  function setFromStory(t, name) {
    var s = norm(t).replace(new RegExp(esc(name || '\u0000'), 'g'), 'NAME'), m, n = 0
    m = /was the (.+?) of an? (.+?)(?: \(Unit 1\))? that was struck on the (.+?) \(MVC 1\) by (?:an?|another) (.+?) \(Unit 2\)/i.exec(s)
    if (m) { n += setSelect('ptRole', m[1]) + setSelect('unit1Type', m[2]) + setSelect('strikeDir', m[3]) + setSelect('unit2Type', m[4]) }
    m = /\(Unit 1\) was struck on the (.+?) \(MVC 2\)(?: and on the (.+?) \(MVC 3\))? by (?:an?|another) (.+?) \(Unit 3\)/i.exec(s)
    if (m) { n += setSelect('strikeDir2', m[1]) + (m[2] ? setSelect('strikeDir3', m[2]) : 0) + setSelect('unit3Type', m[3]) }
    m = /went to the ED at (.+?) where/i.exec(s)
    if (m) n += setSelect('hospitalAdmitted', m[1])
    if (/did not seek emergency department care/i.test(s)) n += setSelect('erVisit', 'No')
    m = /vehicle \(Unit 1\) was (.+?)(?: at the time of the incident|\.)/i.exec(s)
    if (m) n += setSelect('vehicleDirection', m[1])
    m = /classified as an? (.+?)\./i.exec(s)
    if (m) n += setSelect('trafficType', m[1])
    m = /received the following additional treatment: (.+?)\.(?:\s|$)/i.exec(s)
    if (m) n += setText('otherPostTx', m[1])
    m = /Mechanism of injury ICD-10 diagnosis codes: (.+?)\.(?:\s|$)/i.exec(s)
    if (m) n += setText('moiDx', m[1])
    return n
  }

  // A dropdown answered "Yes, duration: 5 minutes." -> the dropdown and its duration box.
  function setWithDuration(id, durId, v) {
    var s = noDot(v)
    if (blank(s)) return 0
    var m = /^(.*?)(?:,\s*)?duration:\s*(.+)$/i.exec(s)
    var ans = m ? m[1] : s, dur = m ? m[2] : ''
    return (ans ? setSelect(id, ans) : 0) + (dur ? setText(durId, dur) : 0)
  }

  /* --------------------------- the whole form --------------------------- */
  function fillForm(parsed, p) {
    filled = []
    // The totals auto-count counts from the form as it opened; it takes that
    // count on its next pass, so make it now, before anything is filled in.
    if (byId('dhi1')) fire(byId('dhi1'), 'input')
    var A = parsed.answers, S = parsed.sections, n = 0
    var first = function (l) { return (A[l] || [])[0] }
    var last = function (l) { var a = A[l] || []; return a[a.length - 1] }
    var name = (typeof naturalPatientName === 'function' && naturalPatientName(p)) || ''

    // Patient and session (Registration fills name, date of birth, gender and injury date first).
    // The date of service staff typed when uploading wins (Day 1 billing uses it); else the file's.
    var dos = (p && p.ace && p.ace.dateOfService) || (parsed.text.match(/INITIAL DATE OF SERVICE\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/) || [])[1] || first('Session Date')
    if (dos) n += setText('dos', typeof day2FormatAnyDate === 'function' ? (day2FormatAnyDate(dos) || dos) : dos)
    var intro = /Today the pati\w*,[\s\S]{1,120}?age\s+(\d{1,3})/i.exec(parsed.text)
    var age = (intro && intro[1]) || parsed.extra.age
    if (age && byId('ptAge') && !byId('ptAge').value) n += setText('ptAge', age)
    // "... sustained in a <type> on <date> in <place>." The place by the list's own names ("Washington D.C.").
    var js = byId('jurisdiction'), intro2 = norm(parsed.text)
    var jo = js && Array.prototype.filter.call(js.options, function (o) {
      return o.value && new RegExp('possible injuries sustained in .{1,300}? on [0-9/-]{6,10} in ' + pat(o.textContent.trim().replace(/\.$/, '')) + '\\.', 'i').test(intro2)
    }).sort(function (a, b) { return b.textContent.length - a.textContent.length })[0]
    if (jo) n += setSelect('jurisdiction', jo.textContent)
    if (!byId('ptGender').value) {
      var pr = /causal connection between (his|her) injuries/i.exec(parsed.text)
      if (pr) n += setSelect('ptGender', pr[1].toLowerCase() === 'his' ? 'Male' : 'Female')
    }
    var rep = first('Reporter')
    if (rep && !setSelect('reporter', rep)) { n += setSelect('reporter', 'Other') + setText('reporterOther', rep) } else if (rep) n++
    n += setInjuryType(first('1. Injury Description (see above Mechanism of Injury)'))

    // Mechanism of Injury
    var moi = (S['MECHANISM OF INJURY'] || [])[0]
    if (moi) { n += setStory(moi); n += setFromStory(moi, name) }

    // HPI and PMH: the questions by their own wording.
    ;(typeof HPI_ITEMS !== 'undefined' ? HPI_ITEMS.concat(PMH_ITEMS) : []).forEach(function (q) { if (A[q]) n += setYesNo(q, A[q][0]) })
    n += setText('immediateSyms', noDot(first('Chief Complaint') || ''))
    n += setPickOrSelect('adlLimit', first('Activity of Daily Living (ADL) Limitations'))
    n += setPick('xq_visionProblems', first('Vision Problems'))
    n += setPickOrSelect('employStatus', first('Employment Status'))
    n += setPickOrSelect('ptGoals', first('Patient Goals'))
    n += setChecks('riskFactorsList', first('Risk Factors for Injury Severity and Prolonged Recovery'))
    n += setSelect('languageField', first('Language'), true) || setText('languageField', first('Language'))
    n += setPick('xq_nativeCountry', first('Native Country/Region'))
    n += setPick('xq_residualConc', first('Residual Effects of Concussion'))
    n += setPick('xq_prevConcResult', first('Previous Concussions Resulting in'))
    n += setPick('xq_priorLoc', first('Loss of Consciousness (previous concussions)'))
    n += setPick('xq_otherMedHx', first('Other Significant Medical History'))
    n += setText('jobDuties', noDot(first('Job Duties') || ''))
    var habits = first('Social Habits')
    if (habits && !/^None\.?$/i.test(habits)) n += setPick('xq_socialHabits', habits)
    n += setSelect('diet', first('Diet and Nutrition'))
    n += setSelect('exercise', first('Exercise Habits'))
    var fam = first('Family History')
    if (fam && !/^non-contributory\.?$/i.test(fam)) n += setPick('xq_familyHistory', fam)

    // Summary of collisions and head impacts
    ;['dhi1', 'dhi2', 'dhi3', 'ihi1', 'ihi2', 'ihi3'].forEach(function (id) { n += setPickOrSelect(id, first(id.toUpperCase().replace(/(\d)$/, ' $1'))) })
    /* A total of 0 leaves its line out. The heading names stationary object
       collisions only when there are some, and "Total Collisions to Unit 1" is
       the two added up, so a missing total can still be told. */
    var mvc = first('Total MVCs'), soc = first('Total SOCs'), both = first('Total Collisions to Unit 1')
    var summary = /SUMMARY OF MOTOR VEHICLE COLLISIONS[^\n]*(?:\n[^\n]*)?/.exec(parsed.text)
    if (soc === undefined && summary && !/STATIONARY OBJECT/.test(summary[0])) soc = '0'
    // No "Total Collisions to Unit 1" line under its heading: the two add up to 0.
    if (both === undefined && /\nCOLLISIONS TO UNIT 1\n/.test(parsed.text)) both = '0'
    // Added up as the report does it: "3+" counts as 3.
    var num = function (v) { return parseInt(noDot(v || ''), 10) }
    if (mvc === undefined && !isNaN(num(both)) && !isNaN(num(soc === undefined ? '0' : soc))) mvc = String(Math.max(0, num(both) - num(soc === undefined ? '0' : soc)))
    // Read from the file, so kept as a staff choice: the auto-count (moi-autocount.js) then leaves it.
    ;[['totalMVC', mvc], ['totalSOC', soc]].forEach(function (t) {
      var el = byId(t[0])
      if (el && !blank(t[1]) && findOption(el, t[1])) { el.dispatchEvent(new Event('pointerdown')); n += setSelect(t[0], t[1]) }
    })

    // ACE A. Injury Characteristics
    var blow = optionAndNote(byId('ace_blow'), first('1a. Is there evidence of a forcible blow to the head (direct or indirect)?') || '')
    if (blow) { n += setPickOrSelect('ace_blow', blow.opt); if (blow.note) n += setText('ace_blow_comment', blow.note) }
    n += setPickOrSelect('ace_icf', first('1b. Is there evidence of intracranial injury or skull fracture?'))
    var loc = first('1c. Location of Impact')
    if (!blank(loc) && byId('ace_loc')) {
      byId('ace_loc').value = noDot(loc)
      if (typeof aceLocSyncFromValue === 'function') aceLocSyncFromValue()
      fire(byId('ace_loc'), 'input'); mark(byId('aceLocDisplay') || byId('ace_loc')); n++
    }
    n += setPickOrSelect('assessCollisionType', first('Cause: MVC'))
    n += setWithDuration('ace_retro', 'ace_retro_dur', first('1. Amnesia Before (Retrograde)'))
    n += setWithDuration('ace_antero', 'ace_antero_dur', first('2. Amnesia After (Anterograde)'))
    var lv = first('3. Loss of Consciousness')
    if (!blank(lv)) {
      var lm = /^(.*?)(?:,\s*duration:\s*(.+))?$/i.exec(noDot(lv))
      var base = lm[1], dur = lm[2] || ''
      var el = byId('ace_loc2'), ok = 0
      if (el) {
        // "Yes, brief (seconds)" is the choice "Yes — brief (seconds)".
        var o = findOption(el, base) || findOption(el, base.replace(/^(Yes|No),\s*/i, '$1 — '))
        if (o) ok = setPickOrSelect('ace_loc2', o.textContent)
      }
      n += ok + (dur ? setText('ace_loc_dur', dur) : 0)
    }
    n += setChecks('earlySignsList', first('EARLY SIGNS'))
    var sz = optionAndNote(byId('ace_seiz'), first('Seizures observed?') || '')
    if (sz) { n += setSelect('ace_seiz', sz.opt); if (sz.note) n += setText('ace_seiz_detail', sz.note) }
    else if (!blank(first('Seizures observed?'))) n += setText('ace_seiz_detail', noDot(first('Seizures observed?')))

    // ACE B. Symptoms
    n += setSymptoms(parsed.text)
    n += setSelect('ace_rating', first('Overall Rating (Normal 0 1 2 3 4 5 6 Different)'))
    n += setSelect('ace_physact', first('Exertion — Physical Activity'))
    n += setSelect('ace_cogact', first('Exertion — Cognitive Activity'))

    // ACE C. Risk factors for protracted recovery: the answer, and a note after a comma.
    var rpr = [['Concussion History?', 'rpr_priorConc'], ['Previous #', 'rpr_concNum'], ['Longest symptom duration', 'rpr_concDur'],
      ['If multiple concussions, less force caused reinjury?', 'rpr_reinjury'], ['Headache History?', 'rpr_priorHA'],
      ['Prior treatment for headache', 'rpr_haTx'], ['History of migraine headache', 'rpr_migraine'], ['Learning disabilities', 'rpr_learningDis'],
      ['Attention-Deficit/Hyperactivity Disorder', 'rpr_adhd'], ['Other developmental disorder', 'rpr_otherDevYN', 'rpr_otherDx'],
      ['Anxiety', 'rpr_anxiety'], ['Depression', 'rpr_depression'], ['Sleep disorder', 'rpr_sleepDisorder'],
      ['Other psychiatric disorder', 'rpr_otherPsychYN', 'rpr_otherPsychDx']]
    // The table leaves out a question answered 0 ("Previous #").
    if (A['Concussion History?'] && !A['Previous #'] && byId('rpr_concNum') && findOption(byId('rpr_concNum'), '0')) n += setSelect('rpr_concNum', '0')
    rpr.forEach(function (r) {
      var v = first(r[0])
      if (blank(v) || /^N\/A$/i.test(noDot(v)) && !findOption(byId(r[1]) || {}, 'N/A')) return
      var on = optionAndNote(byId(r[1]), v)
      if (on) {
        n += setSelect(r[1], on.opt)
        if (on.note && byId(r[1] + '_cmt')) n += setText(r[1] + '_cmt', on.note)
      } else if (r[2]) { n += setSelect(r[1], 'Yes') + setText(r[2], noDot(v)) }
    })
    var com = first('List other comorbid medical disorders or medication usage')
    if (com && !/^None\.?$/i.test(com)) n += setText('rpr_comorbid', noDot(com))

    // ACE D. Red flags (inside the red box). The longest choice the answer starts with: a
    // report printed before 5 Nov 2026 can have the end of the box cut off at the page edge.
    var rf = first('Red Flag Screening')
    if (rf && byId('redFlagStatus')) {
      var rfo = Array.prototype.filter.call(byId('redFlagStatus').options, function (o) { return o.value && low(rf).indexOf(low(o.textContent)) === 0 })
        .sort(function (a, b) { return b.textContent.length - a.textContent.length })[0]
      if (rfo) n += setSelect('redFlagStatus', rfo.textContent)
    }
    var rfn = first('Notes')
    if (rfn) n += setText('redFlagNotes', noDot(rfn))

    // ACE F. Follow-up
    var fu = first('Follow-Up')
    if (fu) {
      var fm = /^(.*?)(?:\s+—\s+Next follow-up date:\s*(.+))?$/.exec(fu)
      n += setSelect('followupPlan', fm[1])
      if (fm[2]) n += setText('followupDate', fm[2])
    }
    var ref = first('Referral')
    if (ref) {
      n += setSelect('followupPlan', 'Referral')
      var other = /(?:^|,\s*)Other:\s*(.+)$/.exec(noDot(ref))
      n += setChecks('referralTypeList', other ? noDot(ref).slice(0, other.index) : ref)
      if (other) n += setText('referralOther', other[1])
    }
    var by = first('ACE Completed by')
    if (by) {
      var bm = /^(.*?),\s*([A-Za-z]{2,4})$/.exec(noDot(by))
      if (bm && findOption(byId('completedByCred'), bm[2])) { n += setText('completedBy', bm[1]) + setSelect('completedByCred', bm[2]) }
      else n += setText('completedBy', noDot(by))
    }

    // PLAN first: "No follow-up" changes the Impression's standard wording.
    n += setSelect('txPlan', last('Plan'))
    var rec = last('Recommendation')
    if (rec) n += setSelect('recommendation', rec)

    // ASSESSMENT
    var imp = norm(((S['Impression'] || [])[0] || '').replace(/\n/g, ' '))
    var ie = byId('impression')
    if (imp && ie) {
      var stds = [typeof ACE_STANDARD_IMPRESSION_TEXT !== 'undefined' ? ACE_STANDARD_IMPRESSION_TEXT : '',
        typeof ACE_NO_FOLLOWUP_IMPRESSION_TEXT !== 'undefined' ? ACE_NO_FOLLOWUP_IMPRESSION_TEXT : '']
      var io = Array.prototype.filter.call(ie.options, function (o) { return o.value !== 'custom' && low(o.textContent) === low(imp) })[0]
      if (!io && stds.some(function (s) { return s && low(s) === low(imp) })) io = Array.prototype.filter.call(ie.options, function (o) { return o.value === 'std' })[0]
      if (io) { ie.value = io.value; fire(ie, 'change'); mark(ie); n++ }
      else {
        var co = Array.prototype.filter.call(ie.options, function (o) { return o.value === 'custom' })[0]
        if (co) { ie.value = co.value; fire(ie, 'change'); mark(ie); n += setText('customImp', imp) }
      }
    }
    n += setChecks('assessRiskList', first('Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Long-Term Recurring Episodes of Neuroinflammation and Neuroinflammatory Symptoms'))
    var dxBody = (S['Diagnosis'] || []).filter(function (b) { return /\(\s*[A-Z]\d{2}/.test(b) })[0]
    if (dxBody) n += setDiagnoses(dxBody)
    var prog = norm(((S['Prognosis'] || [])[0] || '').replace(/\n/g, ' '))
    var pe = byId('prognosis')
    if (prog && pe) {
      // As the report prints a choice: the name for "PT Name", the patient's pronouns for "their".
      var g = (byId('ptGender') || {}).value || ''
      var pn = /^male$/i.test(g) ? ['his', 'he'] : /^female$/i.test(g) ? ['her', 'she'] : ['their', 'they']
      var printed = function (t) { return t.replace(/PT Name/g, name).replace(/\btheirs\b/g, pn[0]).replace(/\btheir\b/g, pn[0]).replace(/\bthey\b/g, pn[1]) }
      // A file for the same patient under another spelling of the name: compared without it.
      var loose = function (s) { return low(s).replace(/^.{0,60}? is expected/, 'X is expected').replace(/\b(his|her|their|he|she|they)\b/g, 'P') }
      var po = Array.prototype.filter.call(pe.options, function (o) { return low(printed(o.textContent)) === low(prog) })[0]
        || Array.prototype.filter.call(pe.options, function (o) { return o.value && loose(printed(o.textContent)) === loose(prog) })[0]
      if (po) { pe.value = po.value; fire(pe, 'change'); mark(pe); n++ }
    }

    // What the form works out from the answers: totals, the header, the follow-up boxes.
    ;['updateAceTotals', 'updateBoilerplates', 'updateBanner', 'toggleFollowupFields', 'applyPregnancyGate', 'updateAceSavePanel', 'updatePatientAceBar']
      .forEach(function (f) { if (typeof window[f] === 'function') try { window[f]() } catch (e) {} })
    return n
  }

  /* --------------------------- the whole flow --------------------------- */
  var pending = {}   // patient id -> the file the open form was filled from

  /* What the file did not answer: the questions Save asks for (the form's own
     required list) and the Yes / No questions, left empty and marked. */
  function markMissing() {
    var shown = function (el) { return el && el.offsetParent !== null }
    var count = 0
    var flag = function (t) { if (t && !t.classList.contains('ctgo-filled') && !t.classList.contains('ctgo-missing')) { t.classList.add('ctgo-missing'); count++ } }
    var req = [].concat(typeof ACE_REQUIRED_INPUTS !== 'undefined' ? ACE_REQUIRED_INPUTS : [], typeof ACE_REQUIRED_SELECTS !== 'undefined' ? ACE_REQUIRED_SELECTS : [])
    req.forEach(function (f) {
      var el = byId(f.id), fg = el && el.closest('.fg')
      // Only questions on show (a vehicle question is hidden for No Vehicle Involved).
      if (fg && shown(fg) && !String(el.value || '').trim()) flag(markTarget(el))
    })
    document.querySelectorAll('#hpiList .yn-row, #pmhList .yn-row').forEach(function (row) {
      if (shown(row) && !row.querySelector('.yn-btn.active')) flag(row)
    })
    return count
  }

  function banner(doc, n, missing) {
    var host = byId('aceFormHost')
    if (!host) return
    var old = byId('ctgoFillBanner'); if (old) old.remove()
    var b = document.createElement('div')
    b.id = 'ctgoFillBanner'; b.className = 'ctgo-fill-banner'; b.setAttribute('role', 'status')
    var strong = document.createElement('strong'); strong.textContent = n + ' answers read from "' + doc.name + '". '
    b.appendChild(strong)
    b.appendChild(document.createTextNode('They are marked in blue. '
      + (missing ? missing + ' question' + (missing === 1 ? '' : 's') + ' the file does not answer ' + (missing === 1 ? 'is' : 'are') + ' marked in orange. ' : '')
      + 'Check each answer, fill in anything still empty, then click Save. Until you Save, the uploaded file stays the Day 1 record.'))
    host.insertBefore(b, host.firstChild)
  }
  function unmark() {
    var b = byId('ctgoFillBanner'); if (b) b.remove()
    document.querySelectorAll('.ctgo-filled, .ctgo-missing').forEach(function (el) { el.classList.remove('ctgo-filled', 'ctgo-missing') })
  }
  // Answering a marked question takes its orange mark off.
  var answered = function (e) {
    if (!e.target || !e.target.closest || !document.querySelector('.ctgo-missing')) return
    var t = markTarget(e.target)
    if (t && String(e.target.value || '').trim()) t.classList.remove('ctgo-missing')
  }
  document.addEventListener('change', answered, true)
  document.addEventListener('input', answered, true)
  document.addEventListener('click', function (e) { var row = e.target && e.target.closest && e.target.closest('.yn-row.ctgo-missing'); if (row && e.target.closest('.yn-btn')) row.classList.remove('ctgo-missing') }, true)

  async function fillFromFile(pid) {
    var p = getPatient(pid)
    var doc = p && window.ctgOfflineDay1Upload ? window.ctgOfflineDay1Upload(p) : null
    if (!doc) { showToast('There is no Day 1 file to read.', 'err'); return false }
    var url = await resolveUploadDataUrl(p, doc)
    var isPdf = /pdf/i.test(doc.type || '') || /^data:application\/pdf/i.test(String(url))
    if (!url || !isPdf) { showToast('This Day 1 file is a picture, so its answers cannot be read. Fill in the form by hand.', 'err'); return false }
    showToast('Reading the Day 1 file…')
    var lines
    try { lines = await readLines(url) } catch (e) { console.error(e); showToast('Could not read the Day 1 file: ' + e.message, 'err'); return false }
    var parsed = splitAnswers(lines)
    if (window.ctgOfflineOpenAceForm) window.ctgOfflineOpenAceForm(pid)
    await new Promise(function (r) { setTimeout(r, 350) })
    var n = 0, missing = 0
    try { n = fillForm(parsed, p) } catch (e) { console.error('Day 1 fill', e) }
    // The pick lists and Yes / No buttons catch up with their dropdowns on a timer.
    await new Promise(function (r) { setTimeout(r, 700) })
    try { missing = markMissing() } catch (e) { console.error('Day 1 fill marks', e) }
    pending[pid] = { docId: doc.id, name: doc.name }
    banner(doc, n, missing)
    showToast(n ? n + ' answers filled in from the file. Check them, then Save.' : 'No answers could be read from this file. Fill in the form by hand.', n ? 'ok' : 'err')
    return true
  }
  window.ctgOfflineDay1Fill = fillFromFile
  // For tests: the two halves without the form opening.
  window.ctgOfflineDay1Read = { readLines: readLines, split: splitAnswers, fill: fillForm }

  // Saved: the form is the Day 1 record now, filled from that file.
  var origSave = window.saveAceForCurrentPatient
  window.saveAceForCurrentPatient = function () {
    var pid = typeof getActiveAcePatientId === 'function' ? getActiveAcePatientId() : null
    var from = pid && pending[pid]
    var out = origSave.apply(this, arguments)
    var p = pid && getPatient(pid)
    if (from && p && p.ace && !p.ace.uploadedFile) {
      p.ace.filledFromFile = { docId: from.docId, name: from.name, at: new Date().toISOString() }
      delete pending[pid]
      unmark()
      if (typeof persistPatients === 'function') persistPatients()
    }
    return out
  }
  // The Final Case Report prints the Day 1 made from the file, not the file as well.
  window.ctgOfflineFilledDay1Uploads = function (p) {
    var f = p && p.ace && p.ace.filledFromFile
    var ups = (p && p.documents && Array.isArray(p.documents.uploads)) ? p.documents.uploads : []
    return f ? ups.filter(function (d) { return d.id === f.docId }) : []
  }
  // Leaving the Day 1 page drops the marks.
  var origShow = window.showPage
  window.showPage = function (name) {
    if (name !== 'patientAce' && name !== 'day1') unmark()
    return origShow.apply(this, arguments)
  }

  var css = document.createElement('style')
  css.textContent = [
    // Outlines: the form's own fields and rows already use box-shadow and borders.
    '.ctgo-filled{outline:2px solid rgba(0,119,182,.55)!important;outline-offset:-1px;background-color:rgba(0,180,216,.07)!important}',
    '.ctgo-missing{outline:2px solid rgba(230,126,34,.85)!important;outline-offset:-1px;background-color:rgba(230,126,34,.08)!important}',
    '.ctgo-fill-banner{margin:0 0 12px;padding:12px 14px;border-radius:12px;background:rgba(0,180,216,.10);border:1px solid rgba(0,119,182,.35);color:var(--text);font-size:13px;line-height:1.45}',
    '.ctgo-fill-banner strong{color:#03045E}'
  ].join('\n')
  document.head.appendChild(css)
})()
