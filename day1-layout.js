/* CTG One - Day 1 on screen in the order of the practice's EnableDoc
 * template (HPI, PMH, Social, Family, the MVC/SOC/DHI/IHI summary, then ACE),
 * in even two-column rows. The Day 1 PDF keeps its own arrangement.
 *
 * The Yes/No rows in #hpiList and #pmhList are matched to saved answers by
 * their place in the page, so they are never moved: their containers are
 * flattened (display: contents) and the order is set with CSS flex `order`
 * only. Whole fields with their own ids (Chief Complaint, the summary fields,
 * the prior-concussion questions) are moved between cards, which is safe:
 * Day 1 saves and restores those by id.
 */
(function () {
  'use strict'

  var HPI = [
    'id:immediateSyms',
    'yn:Change in Swallowing', 'yn:Change in Appetite', 'yn:Change in Sense of Smell', 'yn:Change in Sense of Taste',
    'yn:Slurring Speech', 'yn:Stuttering Speech',
    'yn:Aphasia - comprehension lag time', 'yn:Aphasia - a word choice lag time', 'yn:Aphasia - phonation lag time',
    'yn:Tinnitus (Ringing in Ears)', 'yn:Hearing Difficulty', 'yn:Feeling of Fullness or Pressure in Ear',
    'id:xq_visionProblems', 'yn:Visual Disturbance', 'yn:Dizziness / Vertigo',
    'yn:Head Shake Screening Test — Possible Vestibular Dysfunction',
    // Ours, not on the EnableDoc template: kept, after its Yes/No questions.
    'yn:Stammering Speech',
    'yn:Cried Since Injury Date', 'yn:Visual Discomfort', 'yn:Are you able to stand on two feet unaided?',
    'yn:Do you have full use of your upper body, lower body, and head?', 'yn:Are there any exercises that this patient cannot do at the moment?',
    'id:adlLimit', 'id:employStatus', 'id:ptGoals', 'id:riskFactorsList'
  ]

  var PMH = [
    'yn:Strenuous exercise in last 3 hours', 'id:xq_nativeCountry', 'id:languageField',
    'yn:Previous Motor Vehicle Collision', 'yn:Residual Effects of Previous MVC',
    'id:rpr_priorConc', 'id:xq_residualConc', 'id:xq_prevConcResult', 'id:xq_priorLoc',
    'yn:Legally Blind in One or Both Eyes', 'yn:Wear Corrective Lenses', 'yn:History of Cerebral Infarct (Stroke)',
    'yn:History of TIA / Vasospasm', 'yn:History of Headaches (diagnosed)', 'yn:Migraine Headaches (diagnosed by physician)',
    'yn:History of Seizures', 'yn:History of Tinnitus', 'yn:History of Diminished Eyesight', 'yn:History of Sleep Disorder',
    'yn:History of Military Service', 'yn:Diagnosed with PTSD', 'yn:History of Anxiety', 'yn:History of Depression',
    'yn:Diagnosed with ADHD', 'yn:Diagnosed with Dyslexia', 'yn:Diagnosed with Autism', 'yn:Psychiatric Diagnosis',
    'id:rpr_otherDevYN', 'id:rpr_otherDx', 'id:rpr_learningDis',
    'yn:Brain Surgery', 'yn:Meningitis', 'yn:History of Rehab for Alcohol Abuse', 'yn:History of Rehab for Drug Abuse',
    'yn:Received Speech Therapy', 'yn:Attended IEP or Special Education Classes',
    'yn:Repeated One or More Grades', 'yn:Advanced One or More Grades',
    // Ours, not on the template.
    'yn:Played Organized Contact Sport on Team', 'yn:Do you have any orthopedic problem or injuries?', 'yn:Are you currently pregnant?',
    'id:xq_otherMedHx',
    'sdiv:Social History', 'id:jobDuties', 'id:xq_socialHabits', 'id:diet', 'id:exercise',
    'sdiv:Family History', 'id:xq_familyHistory',
    'sdiv:Summary', 'id:totalMVC', 'id:totalSOC',
    'sdiv:Head Impacts', 'id:xq_headImpacts', 'id:xq_headImpactsText', 'id:dhi1', 'id:dhi2', 'id:ihi1', 'id:ihi2', 'id:totalDHI', 'id:totalIHI'
  ]

  var ACE = [
    'sdiv:A. Injury Characteristics',
    'id:ace_blow', 'id:ace_blow_comment_row', 'id:ace_icf', 'id:ace_loc', 'id:assessCollisionType',
    'id:ace_retro', 'id:ace_retro_dur', 'id:ace_antero', 'id:ace_antero_dur',
    'id:ace_loc2', 'id:ace_loc_dur', 'id:earlySignsList', 'id:ace_seiz', 'id:ace_seiz_detail'
  ]

  var SUMMARY_TITLE = 'Summary of Motor Vehicle Collisions (MVC), Stationary Object Collisions (SOC), Direct Head Impacts (DHI) and Indirect Head Impacts (IHI)'

  function fgOf(id) { var el = document.getElementById(id); return el && (el.closest('.fg') || el) }
  function sdiv(text) { var d = document.createElement('div'); d.className = 'sdiv'; var t = document.createElement('span'); t.textContent = text; d.appendChild(t); return d }

  /* Moves done once: fields to the card EnableDoc shows them in. */
  function relocate() {
    var hpiBody = document.querySelector('#sec-hpi .card-body')
    var pmhBody = document.querySelector('#sec-pmh .card-body')
    var aceGrid = document.querySelector('#sec-ace .card-body .g3')
    if (!hpiBody || !pmhBody || !aceGrid) return false
    var cc = fgOf('immediateSyms'); if (cc) hpiBody.appendChild(cc)
    ;['rpr_priorConc', 'rpr_otherDevYN', 'rpr_otherDx', 'rpr_learningDis'].forEach(function (id) { var f = fgOf(id); if (f) pmhBody.appendChild(f) })
    var priorLabel = fgOf('rpr_priorConc'); if (priorLabel) priorLabel.querySelector('label').textContent = 'Previous Concussion [Traumatic Brain Injury (TBI)]'
    var dev = fgOf('rpr_otherDevYN'); if (dev) dev.querySelector('label').textContent = 'Diagnosed with Other Developmental Disorder'
    var ld = fgOf('rpr_learningDis'); if (ld) ld.querySelector('label').textContent = 'Diagnosed with Learning Disability'
    // The collision summary sits after Family History, as on the template.
    var summary = sdiv(SUMMARY_TITLE); summary.dataset.key = 'sdiv:Summary'
    pmhBody.appendChild(summary)
    ;['totalMVC', 'totalSOC'].forEach(function (id) { var f = fgOf(id); if (f) pmhBody.appendChild(f) })
    var heads = document.getElementById('moiHeadImpactsSection'); if (heads) pmhBody.appendChild(heads)
    // Cause sits with the injury characteristics in ACE.
    var cause = fgOf('assessCollisionType')
    if (cause) { cause.querySelector('label').textContent = 'Cause'; aceGrid.appendChild(cause) }
    // Early Signs comes before Seizures on the template.
    var signs = fgOf('earlySignsList'); if (signs) aceGrid.appendChild(signs)
    ;['ace_seiz', 'ace_seiz_detail'].forEach(function (id) { var f = fgOf(id); if (f) aceGrid.appendChild(f) })
    // A heading the reordering made meaningless.
    var extra = Array.prototype.filter.call(pmhBody.querySelectorAll('.sdiv'), function (d) { return /Additional Past Medical History/.test(d.textContent) })[0]
    if (extra) extra.style.display = 'none'
    // HPI's "Other" heading no longer heads anything (its fields are placed above).
    var other = Array.prototype.filter.call(hpiBody.querySelectorAll('.sdiv'), function (d) { return d.textContent.trim() === 'Other' })[0]
    if (other) other.style.display = 'none'
    return true
  }

  function keyOf(el) {
    if (el.dataset && el.dataset.key) return el.dataset.key
    if (el.classList.contains('yn-row')) return el.querySelector('#languageField') ? 'id:languageField' : 'yn:' + (el.dataset.item || '')
    if (el.classList.contains('sdiv')) return 'sdiv:' + el.textContent.trim()
    if (el.id) return 'id:' + el.id
    var withId = el.querySelector('[id]')
    return withId ? 'id:' + withId.id : ''
  }

  /* Flatten the given wrappers so their children become items of the card
     body, then give every item an order: listed keys first, in list order;
     everything else after, in its existing page order. */
  function arrange(cardId, flatten, list) {
    var body = document.querySelector('#' + cardId + ' .card-body')
    if (!body) return
    body.classList.add('xo-flex')
    flatten.forEach(function (sel) { Array.prototype.forEach.call(body.querySelectorAll(sel), function (w) { w.classList.add('xo-flat') }) })
    var items = []
    var walk = function (node) {
      Array.prototype.forEach.call(node.children, function (c) {
        if (c.classList.contains('xo-flat')) walk(c); else items.push(c)
      })
    }
    walk(body)
    var rest = 0
    items.forEach(function (el) {
      var k = keyOf(el)
      var i = list.indexOf(k)
      if (i === -1 && k.indexOf('sdiv:') === 0) {
        // Headings match on their start ("Summary of Motor Vehicle...").
        i = list.findIndex(function (x) { return x.indexOf('sdiv:') === 0 && k.indexOf(x) === 0 })
      }
      el.style.order = i === -1 ? String(1000 + (rest++)) : String(10 + i)
    })
  }

  /* Two columns, filled top to bottom: the first half of a block runs down the
     left column (1, 2, 3...), the rest down the right. Headings and wide
     items span both columns and start a new block. Placement is by CSS grid
     row/column only - nothing moves in the page, so saving is unaffected. */
  var FULL_WIDTH = { 'id:immediateSyms': 1, 'id:riskFactorsList': 1, 'id:rpr_comorbid': 1, 'id:earlySignsList': 1 }
  // ACE: only the A. Injury Characteristics questions go in the two columns;
  // the symptom checklist, scores and red flags below keep their own layout.
  var CELL_FILTER = {
    'sec-ace': function (el) { return el.classList.contains('fg') && ACE.indexOf(keyOf(el)) !== -1 }
  }
  function layoutTwoColumns(cardId) {
    var body = document.querySelector('#' + cardId + ' .card-body')
    if (!body) return
    body.classList.add('xo-grid2')
    var items = []
    var walk = function (node) {
      Array.prototype.forEach.call(node.children, function (c) {
        if (c.classList.contains('xo-flat')) walk(c); else items.push(c)
      })
    }
    walk(body)
    var visible = items.filter(function (el) { return getComputedStyle(el).display !== 'none' })
    visible.sort(function (a, b) { return (parseInt(a.style.order, 10) || 0) - (parseInt(b.style.order, 10) || 0) })
    var row = 1, block = []
    var flush = function () {
      var half = Math.ceil(block.length / 2)
      block.forEach(function (el, i) {
        var col = i < half ? 1 : 2
        var r = row + (i < half ? i : i - half)
        el.classList.add('xo-item')
        if (el.style.gridRow !== String(r)) el.style.gridRow = String(r)
        if (el.style.gridColumn !== String(col)) el.style.gridColumn = String(col)
      })
      row += half
      block = []
    }
    var isCell = CELL_FILTER[cardId] || function () { return true }
    visible.forEach(function (el) {
      var k = keyOf(el)
      var wide = !!FULL_WIDTH[k] || !isCell(el)
      // Wide fields keep their own layout; every other field is drawn as a row like the Yes/No questions.
      el.classList.toggle('xo-wide', wide && el.classList.contains('fg'))
      if (el.classList.contains('sdiv') || wide) {
        flush()
        el.classList.add('xo-item')
        el.style.gridRow = String(row); el.style.gridColumn = '1 / -1'
        row++
      } else block.push(el)
    })
    flush()
  }
  var lastSig = {}
  function relayout() {
    ;['sec-hpi', 'sec-pmh', 'sec-ace'].forEach(function (id) {
      var body = document.querySelector('#' + id + ' .card-body')
      if (!body) return
      // Re-place only when what is shown changed (a row revealed or hidden).
      var sig = Array.prototype.map.call(body.querySelectorAll('.yn-row, .fg, .sdiv'), function (el) { return getComputedStyle(el).display === 'none' ? 0 : 1 }).join('')
      if (sig !== lastSig[id]) { lastSig[id] = sig; layoutTwoColumns(id) }
    })
  }

  function arrangeAll() {
    arrange('sec-hpi', ['#hpiList', '.g2', '.g3'], HPI)
    arrange('sec-pmh', ['#pmhList', '.g2', '.g3', '#moiHeadImpactsSection'], PMH)
    lastSig = {}
    relayout()
    var aceA = document.querySelector('#sec-ace .card-body .g3')
    if (aceA) aceA.classList.add('xo-ace-a')
    arrange('sec-ace', ['.xo-ace-a'], ACE)
  }

  /* The "not filled in yet" glow on EVERY Day 1 question, not only the
     required ones Day 1 itself highlights. Visual only: the fields-remaining
     count and the required rules are unchanged. Rows (Yes/No, symptom,
     two-column field rows) glow as a whole; anything else glows on its control.
     "Check all that apply" lists are left out - ticking none is an answer. */
  function isShown(el) { return !!(el && el.getClientRects().length) }
  function controlEmpty(fg) {
    var chip = fg.querySelector(':scope > .xq-chip')
    if (chip) return { el: chip, empty: chip.classList.contains('moi-chip-empty') }
    var itd = fg.querySelector('.it-display')
    if (itd && isShown(itd)) {
      var hidden = fg.querySelector('input[type=text]')
      return { el: itd, empty: !String((hidden && hidden.value) || '').trim() }
    }
    var ctl = Array.prototype.filter.call(fg.querySelectorAll('select, input[type=text], input[type=date], input[type=number], input:not([type]), textarea'),
      function (c) { return isShown(c) && !c.closest('.moi-story-wrap') })[0]
    if (!ctl || ctl.disabled) return null
    return { el: ctl, empty: !String(ctl.value || '').trim() }
  }
  function glowPass() {
    var host = document.getElementById('aceFormHost')
    if (!host || !isShown(host)) return
    var want = new Set()
    host.querySelectorAll('.yn-row').forEach(function (row) {
      if (!isShown(row)) return
      if (row.querySelector('#languageField')) { if (!row.querySelector('#languageField').value) want.add(row); return }
      if (!row.querySelector('.yn-btn.active')) want.add(row)
    })
    host.querySelectorAll('.sym-score-item').forEach(function (it) { if (isShown(it) && !it.querySelector('.sym-btn.active')) want.add(it) })
    host.querySelectorAll('.card .fg').forEach(function (fg) {
      if (!isShown(fg) || fg.closest('.moi-story-wrap') || fg.querySelector('#riskFactorsList, #earlySignsList, #immedExperienceList, .icd-item')) return
      var c = controlEmpty(fg)
      if (!c || !c.empty) return
      var asRow = fg.classList.contains('xo-item') && !fg.classList.contains('xo-wide')
      want.add(asRow ? fg : c.el)
    })
    host.querySelectorAll('.xo-unfilled').forEach(function (el) { if (!want.has(el)) el.classList.remove('xo-unfilled') })
    want.forEach(function (el) { el.classList.add('xo-unfilled') })
  }

  var pending = null
  function schedule() { if (!pending) pending = setTimeout(function () { pending = null; arrangeAll() }, 30) }

  function setup() {
    if (!relocate()) return
    arrangeAll()
    // The Yes/No lists and the Language row are built after load; re-order when they appear.
    ;['sec-hpi', 'sec-pmh', 'sec-ace'].forEach(function (id) {
      var body = document.querySelector('#' + id + ' .card-body')
      if (body) new MutationObserver(schedule).observe(body, { childList: true, subtree: true })
    })
    // Conditional rows (shown on "Yes", hidden for no-vehicle) change what is visible without adding nodes.
    setInterval(relayout, 700)
    setInterval(glowPass, 500)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup)
  else setTimeout(setup, 0)
})()
