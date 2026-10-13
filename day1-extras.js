/* CTG One - Day 1 questions from the practice's EnableDoc template that the
 * original Day 1 did not ask, and existing fields shown as pick lists.
 *
 * The "pick" questions use the same checkbox list as the MOI story
 * (window.ctgPicker from day1-moi.js): Type Here / Add / Select All, no
 * adding on a Yes/No list. Each one is stored as JSON {o: choices, s: ticked}
 * in a hidden textarea inside the Day 1 form, so Day 1's own save, draft and
 * restore carry it. Choices added are kept for that patient only.
 *
 * The Day 1 PDF / FCR prints them through window.ctgXq (see buildPDF in app.js).
 */
(function () {
  'use strict'

  var CHOICES = {
    xq_visionProblems: ['Floaters when I stand up', 'Floaters all the time', 'No vision problems', 'Blurred vision',
      'Sensitive to sunlight', 'light sensitivity (photophobia)', 'light sensitivity', 'No', 'Yes'],
    xq_nativeCountry: ['United States', 'Canada', 'China', 'France', 'Germany', 'Ireland', 'Italy', 'Japan', 'Latin America',
      'Mexico', 'Spain', 'Taiwan'],
    xq_residualConc: ['No', 'Yes', 'NA'],
    xq_prevConcResult: [],
    xq_priorLoc: ['0', '1', '2', '3', '4'],
    xq_otherMedHx: ['No significant past medical issues', 'abdominal pain (chronic)', 'allergies', 'anemia', 'Arthritis / Rheumatism',
      'asthma / wheezing', 'back pain (chronic)', 'blood in stools', 'Blood in Urine', 'bone fracture / joint repair',
      'Bronchitis (chronic)', 'chronic fatigue', 'cold numb feet', 'can\'t control urination', 'convulsions / seizures',
      'decreased force in urination', 'decreased hearing', 'depression', 'Diabetes', 'diarrhea / constipation',
      'difficulty sleeping', 'difficulty swallowing', 'Diverticulosis', 'dizzy spells'],
    xq_socialHabits: ['normal', 'aloof', 'uncooperative', 'angry', 'disruptive', 'unsociable', 'argumentative', 'shy',
      'diabetic diet', 'Tobacco', 'Does not use alcohol, cannabis or illicit drugs'],
    xq_familyHistory: ['Non-contributory.', 'Cancer', 'Diabetes', 'Autism', 'Learning disabilities'],
    xq_headImpacts: [
      'head and body jolted left and head struck the head restraint, then patient\'s head and body jolted to the right',
      'head and body jolted right and head struck the head restraint, then patient\'s head and body jolted to the left',
      'head and body jolted back and head struck the head restraint, then patient\'s head and body jolted forward',
      'head and body jolted forward, then patient\'s head and body jolted backward hitting head restraint',
      'head and body jolted back and head struck the head restraint, then patient\'s head and body jolted forward hitting steering wheel',
      'head went forward and hit the windshield',
      'Top of head struck ceiling. Then head jolted forward.',
      'Jaw sprain']
  }

  // Where each question goes. "after" is a field id whose .fg the new one follows;
  // "into" is a container built below.
  var PICKS = [
    { id: 'xq_visionProblems', label: 'Vision Problems', after: 'adlLimit' },
    { id: 'xq_nativeCountry', label: 'Native Country/Region', into: 'pmhExtra' },
    { id: 'xq_residualConc', label: 'Residual Effects of Concussion', into: 'pmhExtra' },
    { id: 'xq_prevConcResult', label: 'Previous Concussions Resulting in', into: 'pmhExtra' },
    { id: 'xq_priorLoc', label: 'Loss of Consciousness (previous concussions)', into: 'pmhExtra' },
    { id: 'xq_otherMedHx', label: 'Other Significant Medical History', into: 'pmhExtra', full: true },
    { id: 'xq_socialHabits', label: 'Social Habits', after: 'jobDuties' },
    { id: 'xq_familyHistory', label: 'Family History', into: 'familyHx', full: true },
    { id: 'xq_headImpacts', label: 'Head Impacts', into: 'headImpacts', full: true }
  ]
  var PLAIN_IDS = ['xq_headImpactsText', 'dhi2', 'ihi2', 'ace_loc_dur']
  // Risk Factors for Protracted Recovery questions that take an optional comment.
  var RPR_IDS = ['rpr_priorConc', 'rpr_concNum', 'rpr_concDur', 'rpr_reinjury', 'rpr_priorHA', 'rpr_haTx', 'rpr_migraine',
    'rpr_learningDis', 'rpr_adhd', 'rpr_otherDevYN', 'rpr_anxiety', 'rpr_depression', 'rpr_sleepDisorder', 'rpr_otherPsychYN']
  /* PMH questions still asked through a Yes/No dropdown, drawn as the same
     Yes / No / N/A buttons as the rest of PMH (12 Oct 2026). The dropdown stays
     in the form, out of sight, and holds the answer, so saving, the required
     check, the PDF and the read-only chart work exactly as before. */
  var PMH_YN_SELECTS = ['rpr_priorConc', 'rpr_otherDevYN', 'rpr_learningDis']
  function syncYnSelects() {
    PMH_YN_SELECTS.forEach(function (id) {
      var sel = document.getElementById(id), grp = sel && sel.parentNode && sel.parentNode.querySelector('.xo-yn-btns')
      if (!grp) return
      Array.prototype.forEach.call(grp.children, function (b) {
        b.classList.toggle('active', b.dataset.v === sel.value)
        b.disabled = sel.disabled
      })
    })
  }
  function buildYnSelects() {
    PMH_YN_SELECTS.forEach(function (id) {
      var sel = document.getElementById(id)
      if (!sel || sel.parentNode.querySelector('.xo-yn-btns')) return
      if (!Array.prototype.some.call(sel.options, function (o) { return o.value === 'N/A' })) {
        var na = document.createElement('option'); na.value = 'N/A'; na.textContent = 'N/A'; sel.appendChild(na)
      }
      var grp = document.createElement('div'); grp.className = 'yn-btns xo-yn-btns'
      ;[['Yes', 'yes'], ['No', 'no'], ['N/A', 'na']].forEach(function (pair) {
        var btn = document.createElement('button')
        btn.type = 'button'; btn.className = 'yn-btn ' + pair[1]; btn.dataset.v = pair[0]; btn.textContent = pair[0]
        btn.addEventListener('click', function () {
          if (sel.disabled) return
          // As on the other Yes/No rows, N/A takes no comment (cleared, so none is printed).
          if (pair[0] === 'N/A') { var cmt = document.getElementById(id + '_cmt'); if (cmt) cmt.value = '' }
          sel.value = pair[0]
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          syncYnSelects()
        })
        grp.appendChild(btn)
      })
      sel.classList.add('xo-yn-select'); sel.tabIndex = -1
      sel.parentNode.insertBefore(grp, sel.nextSibling)
    })
    // A restore, Clear or lock changes the dropdown without a click, so this also runs on a timer.
    setInterval(syncYnSelects, 600)
  }
  function syncRprComments() {
    RPR_IDS.forEach(function (id) {
      var sel = document.getElementById(id), inp = document.getElementById(id + '_cmt')
      var box = inp && inp.parentNode
      // Shown once answered; the Yes/No/N/A button questions (PMH) like the other Yes/No rows: not on N/A.
      var na = sel && sel.value === 'N/A' && PMH_YN_SELECTS.indexOf(id) !== -1
      if (sel && box) box.style.display = sel.value && !na ? '' : 'none'
    })
  }

  var nodes = {}   // id -> { ta, chip }
  var lastVal = {}

  function model(id) {
    var ta = nodes[id] && nodes[id].ta
    try { var m = JSON.parse(ta && ta.value); if (m && Array.isArray(m.o) && Array.isArray(m.s)) return m } catch (e) {}
    return { o: (CHOICES[id] || []).slice(), s: [] }
  }
  // Same placeholder as the portal's own dropdowns.
  function label(m) { return m.s.length ? window.ctgPicker.joinNice(m.s) : '— Select —' }
  function render(id) {
    var n = nodes[id]; if (!n) return
    var m = model(id)
    n.chip.firstChild.nodeValue = label(m)
    n.chip.classList.toggle('moi-chip-empty', !m.s.length)
    lastVal[id] = n.ta.value
  }
  function write(id, m) {
    var ta = nodes[id].ta
    ta.value = JSON.stringify(m)
    lastVal[id] = ta.value
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.dispatchEvent(new Event('change', { bubbles: true }))
    render(id)
  }

  function fgFor(labelText, full) {
    var fg = document.createElement('div'); fg.className = 'fg' + (full ? ' full' : '')
    var lab = document.createElement('label'); lab.textContent = labelText
    fg.appendChild(lab)
    return fg
  }
  function buildPick(q) {
    var fg = fgFor(q.label, q.full)
    var chip = document.createElement('span')
    chip.className = 'moi-chip xq-chip'; chip.tabIndex = 0; chip.setAttribute('role', 'button')
    chip.appendChild(document.createTextNode('— Select —'))
    var caret = document.createElement('i'); caret.className = 'moi-caret'; caret.textContent = '▾'; chip.appendChild(caret)
    var ta = document.createElement('textarea'); ta.id = q.id; ta.hidden = true; ta.tabIndex = -1
    var open = function () {
      if (ta.disabled || !window.ctgPicker) return
      var m = model(q.id)
      window.ctgPicker.open(chip, m, function () { write(q.id, m) })
    }
    chip.addEventListener('click', open)
    chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } })
    fg.appendChild(chip); fg.appendChild(ta)
    nodes[q.id] = { ta: ta, chip: chip }
    return fg
  }
  function insertAfterField(fieldId, fg) {
    var el = document.getElementById(fieldId)
    var host = el && el.closest('.fg')
    if (host) host.parentNode.insertBefore(fg, host.nextSibling)
    return !!host
  }
  function section(card, title) {
    var body = document.querySelector('#' + card + ' .card-body')
    var t = document.createElement('div'); t.className = 'sdiv'
    var tt = document.createElement('span'); tt.textContent = title; t.appendChild(tt)
    var g = document.createElement('div'); g.className = 'g2'
    return { body: body, title: t, grid: g }
  }

  function setup() {
    if (document.getElementById('xq_visionProblems') || !window.ctgPicker) return

    // PMH additions sit above Social History; Family History goes last.
    var pmh = section('sec-pmh', 'Additional Past Medical History')
    var socialTitle = pmh.body && Array.prototype.filter.call(pmh.body.querySelectorAll('.sdiv'), function (d) { return /Social History/i.test(d.textContent) })[0]
    if (pmh.body) {
      pmh.body.insertBefore(pmh.title, socialTitle || null)
      pmh.body.insertBefore(pmh.grid, socialTitle || null)
    }
    var fam = section('sec-pmh', 'Family History')
    if (fam.body) { fam.body.appendChild(fam.title); fam.body.appendChild(fam.grid) }
    var headGrid = document.querySelector('#moiHeadImpactsSection .g2')
    var containers = { pmhExtra: pmh.grid, familyHx: fam.grid, headImpacts: headGrid }

    PICKS.forEach(function (q) {
      var fg = buildPick(q)
      if (q.after) { if (!insertAfterField(q.after, fg) && pmh.grid) pmh.grid.appendChild(fg) }
      else if (containers[q.into]) {
        if (q.into === 'headImpacts') containers[q.into].insertBefore(fg, containers[q.into].firstChild)
        else containers[q.into].appendChild(fg)
      }
      render(q.id)
    })

    // Head Impacts free text, right after its dropdown.
    var hi = nodes.xq_headImpacts && nodes.xq_headImpacts.chip.closest('.fg')
    if (hi) {
      var tfg = fgFor('Head Impacts — additional detail (free text)', true)
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = 'xq_headImpactsText'
      inp.placeholder = 'e.g. head and body jolted left, head struck head restraint.'
      tfg.appendChild(inp)
      hi.parentNode.insertBefore(tfg, hi.nextSibling)
    }

    // DHI 2 with the same choices as DHI 1.
    var dhi1 = document.getElementById('dhi1')
    if (dhi1) {
      var dfg = fgFor('DHI 2 — Second Direct Head Impact Description')
      var sel = document.createElement('select'); sel.id = 'dhi2'
      Array.prototype.forEach.call(dhi1.options, function (o) { var n = document.createElement('option'); n.value = o.value; n.textContent = o.textContent; sel.appendChild(n) })
      sel.value = ''
      dfg.appendChild(sel)
      insertAfterField('dhi1', dfg)
    }

    // IHI 2 with the same choices as IHI 1 (12 Oct 2026), mirroring DHI 2.
    var ihi1 = document.getElementById('ihi1')
    if (ihi1) {
      var ifg = fgFor('IHI 2 — Second Indirect Head Impact Description')
      var isel = document.createElement('select'); isel.id = 'ihi2'
      Array.prototype.forEach.call(ihi1.options, function (o) { var n = document.createElement('option'); n.value = o.value; n.textContent = o.textContent; isel.appendChild(n) })
      isel.value = ''
      ifg.appendChild(isel)
      insertAfterField('ihi1', ifg)
    }

    // ACE: Loss of Consciousness duration (free text).
    var lfg = fgFor('Loss of Consciousness Duration')
    var lin = document.createElement('input'); lin.type = 'text'; lin.id = 'ace_loc_dur'; lin.placeholder = 'e.g. a few seconds'
    lfg.appendChild(lin)
    insertAfterField('ace_loc2', lfg)

    /* An optional comment under each Risk Factors for Protracted Recovery
       answer, shown once the question is answered (12 Oct 2026). Saved as an
       ordinary text field, <id>_cmt, and printed after the answer in the PDF,
       the Word file and the read-only chart. */
    RPR_IDS.forEach(function (id) {
      var sel = document.getElementById(id), fg = sel && sel.closest('.fg')
      if (!fg || document.getElementById(id + '_cmt')) return
      var box = document.createElement('div'); box.className = 'yn-comment rpr-comment'; box.style.display = 'none'
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = id + '_cmt'
      inp.className = 'yn-comment-input'; inp.placeholder = 'Optional comment…'
      box.appendChild(inp); fg.appendChild(box); fg.classList.add('xo-has-comment')
      sel.addEventListener('change', syncRprComments)
    })
    // A restore or Clear sets the answers without a change event, so this also runs on a timer.
    setInterval(syncRprComments, 600)
    buildYnSelects()

    // Restoring a patient saved before these existed must not inherit the last patient's answers.
    if (window.ctgDay1Hooks) {
      window.ctgDay1Hooks.beforeRestore.push(function (state) {
        Object.keys(nodes).forEach(function (id) { nodes[id].ta.value = '' })
        Object.keys(converted).forEach(function (k) { converted[k].ta.value = '' })
        /* A typed-in choice ("driving more than 20 minutes") is not one of the
           select's own options, and the restore drops any value it cannot
           find - the field came back empty and the PDF lost the line. Give the
           select that option first, so the saved value lands. */
        Object.keys(converted).forEach(function (k) {
          var el = converted[k].el
          var v = el.tagName === 'SELECT' && state && state.selects && state.selects[el.id]
          if (v && !Array.prototype.some.call(el.options, function (o) { return o.value === v || o.text === v })) {
            var opt = document.createElement('option'); opt.value = v; opt.textContent = v; el.appendChild(opt)
          }
        })
        PLAIN_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = '' })
        RPR_IDS.forEach(function (id) { var el = document.getElementById(id + '_cmt'); if (el) el.value = '' })
      })
    }

    setupConverted()

    setInterval(function () {
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id]
        if (n.ta.value !== lastVal[id]) render(id)
        n.chip.classList.toggle('xq-locked', !!n.ta.disabled)
      })
      // Restored, cleared or changed elsewhere: redraw the converted fields.
      Object.keys(converted).forEach(function (k) {
        var c = converted[k]
        if (c.ta.value !== c.lastTa || c.el.value !== c.lastField) renderConverted(c)
        c.chip.classList.toggle('xq-locked', !!c.el.disabled)
      })
    }, 400)
  }

  /* Printing: the ticked choices joined "a, b and c", or '' when none. */
  window.ctgXq = function (id) {
    var ta = document.getElementById(id)
    if (!ta) return ''
    try { var m = JSON.parse(ta.value); return m && m.s && m.s.length ? window.ctgPicker.joinNice(m.s) : '' } catch (e) { return '' }
  }
  window.ctgXqText = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : '' }

  /* Read-only view of a completed Day 1. */
  function savedPick(fs, id) {
    try { var m = JSON.parse(((fs && fs.inputs) || {})[id]); return m && m.s && m.s.length ? window.ctgPicker.joinNice(m.s) : '' } catch (e) { return '' }
  }
  var ro = (window.ctgDay1Hooks && window.ctgDay1Hooks.ro) || {}
  var wrapRo = function (section, extra) { ro[section] = extra }
  wrapRo('hpi', function (fs) { return roItem('Vision Problems', savedPick(fs, 'xq_visionProblems')) })
  wrapRo('pmh', function (fs) {
    var inp = fs.inputs || {}
    return roItem('Native Country/Region', savedPick(fs, 'xq_nativeCountry'))
      + roItem('Residual Effects of Concussion', savedPick(fs, 'xq_residualConc'))
      + roItem('Previous Concussions Resulting in', savedPick(fs, 'xq_prevConcResult'))
      + roItem('Loss of Consciousness (previous concussions)', savedPick(fs, 'xq_priorLoc'))
      + roItem('Other Significant Medical History', savedPick(fs, 'xq_otherMedHx'), true)
      + roItem('Social Habits', savedPick(fs, 'xq_socialHabits'))
      + roItem('Family History', savedPick(fs, 'xq_familyHistory'), true)
  })
  wrapRo('moi', function (fs) {
    var inp = fs.inputs || {}, sel = fs.selects || {}
    return roItem('Head Impacts', [savedPick(fs, 'xq_headImpacts'), inp.xq_headImpactsText].filter(Boolean).join('. '), true)
      + roItem('DHI 2 — Second Direct Head Impact Description', sel.dhi2, true)
      + roItem('IHI 2 — Second Indirect Head Impact Description', sel.ihi2, true)
  })

  /* Existing Day 1 fields shown as yellow pick lists. The original select /
     textarea stays (hidden) and is filled with the ticked choices, so saving,
     the required-field check and the PDF use it exactly as before. The list
     itself (with any added choices) is kept per patient in a hidden textarea. */
  var CONVERT = [
    { field: 'adlLimit', key: 'xq_adlLimit', opts: ['Significant — unable to perform most ADLs', 'Moderate — difficulty with many ADLs',
      'Mild — some limitations', 'Minimal — mostly functioning', 'None reported',
      'staying on task at home and staying on task at work'] },
    { field: 'employStatus', key: 'xq_employStatus', opts: ['Employed full time', 'Employed part time', 'Self-employed',
      'Unable to work due to injury', 'Unemployed', 'Retired', 'Student', 'working full time, otherwise will lose job'] },
    { field: 'ptGoals', key: 'xq_ptGoals', opts: ['work without increased neurologic symptoms and do daily activities without increased symptoms',
      'work without increased neurologic symptoms', 'do daily activities without increased symptoms'] },
    // ACE - A. Injury Characteristics. opts null = the select's own choices.
    // Pure Yes/No questions (retrograde, anterograde, seizures) keep their own
    // dropdown - the practice's decision of 2 Oct 2026.
    { field: 'ace_blow', key: 'xq_ace_blow', opts: null },
    { field: 'ace_icf', key: 'xq_ace_icf', opts: null },
    { field: 'assessCollisionType', key: 'xq_assessCollisionType', opts: null },
    { field: 'ace_loc2', key: 'xq_ace_loc2', opts: null },
    // Head impact descriptions (13 Oct 2026): pick one or more, or Type Here + Add.
    { field: 'dhi1', key: 'xq_dhi1', opts: null },
    { field: 'dhi2', key: 'xq_dhi2', opts: null },
    { field: 'ihi1', key: 'xq_ihi1', opts: null },
    { field: 'ihi2', key: 'xq_ihi2', opts: null }
  ]
  function ownOptions(el) {
    return Array.prototype.filter.call(el.options || [], function (o) { return o.value !== '' })
      .map(function (o) { return String(o.textContent || '').trim() }).filter(Boolean)
  }
  var converted = {}   // key -> { el, ta, chip, opts }

  function convertedModel(c) {
    try { var m = JSON.parse(c.ta.value); if (m && Array.isArray(m.o) && Array.isArray(m.s)) return m } catch (e) {}
    // Nothing saved for the list yet (new chart, or one saved before this
    // existed): start from the field's own value.
    var v = String(c.el.value || '').trim()
    var o = c.opts.slice()
    if (v && o.indexOf(v) === -1) o.push(v)
    return { o: o, s: v ? [v] : [] }
  }
  function syncField(c, m) {
    var text = m.s.length ? window.ctgPicker.joinNice(m.s) : ''
    if (c.el.tagName === 'SELECT') {
      if (text && !Array.prototype.some.call(c.el.options, function (o) { return o.value === text })) {
        var opt = document.createElement('option'); opt.value = text; opt.textContent = text; c.el.appendChild(opt)
      }
    }
    c.el.value = text
    c.el.dispatchEvent(new Event('input', { bubbles: true }))
    c.el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function renderConverted(c) {
    var m = convertedModel(c)
    c.chip.firstChild.nodeValue = label(m)
    c.chip.classList.toggle('moi-chip-empty', !m.s.length)
    c.lastTa = c.ta.value; c.lastField = c.el.value
  }
  function setupConverted() {
    CONVERT.forEach(function (spec) {
      var el = document.getElementById(spec.field)
      var fg = el && el.closest('.fg')
      if (!fg || converted[spec.key]) return
      var chip = document.createElement('span')
      chip.className = 'moi-chip xq-chip'; chip.tabIndex = 0; chip.setAttribute('role', 'button')
      chip.appendChild(document.createTextNode('— Select —'))
      var caret = document.createElement('i'); caret.className = 'moi-caret'; caret.textContent = '▾'; chip.appendChild(caret)
      var ta = document.createElement('textarea'); ta.id = spec.key; ta.hidden = true; ta.tabIndex = -1
      el.style.display = 'none'
      fg.appendChild(chip); fg.appendChild(ta)   // after the field, so the field's id stays first in the .fg
      var c = { el: el, ta: ta, chip: chip, opts: spec.opts || ownOptions(el) }
      converted[spec.key] = c
      var open = function () {
        if (el.disabled || !window.ctgPicker) return
        var m = convertedModel(c)
        window.ctgPicker.open(chip, m, function () {
          ta.value = JSON.stringify(m)
          syncField(c, m)
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          renderConverted(c)
        })
      }
      chip.addEventListener('click', open)
      chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } })
      renderConverted(c)
    })
  }

  wrapRo('ace', function (fs) { return roItem('Loss of Consciousness Duration', ((fs && fs.inputs) || {}).ace_loc_dur) })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup)
  else setup()
})()
