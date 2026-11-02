/* Day 1: Diagnosis codes that tick themselves from the answers (2 Nov 2026).

   A Yes on a question in the practice's code sheet - an HPI question,
   Previous Concussion, an ACE symptom scored 1, or a Vision Problems pick
   other than "No" - ticks its ICD-10 code in Section 6. Changing that answer
   to No or N/A unticks it again, but only a code this ticked itself, and only
   when no other Yes still calls for it. A code staff tick or untick by hand
   is theirs from then on.

   The codes this ticked ride along with the Day 1 in the hidden #dxAutoCodes
   box (saved like any other text field), so a No on a later visit still
   unticks the right ones. Opening a saved Day 1 ticks nothing: only answers
   given from then on count. */
(function () {
  'use strict'

  // [code, description] as in ICD_CODES (app.js). There are two R42. rows, so the description picks one.
  var DX = {
    dysphagia: ['R13.10', 'Dysphagia, unspecified'],
    smellTaste: ['R43.8', 'Other disturbance of smell and taste'],
    fluency: ['R47.82', 'Stuttering and fluency disorder conditions classified elsewhere'],
    aphasia: ['R47.01', 'Aphasia'],
    tinnitus: ['H93.19', 'Tinnitus, unspecified ear'],
    vestibular: ['H81.93', 'Vestibular function disorder, unspecified, bilateral'],
    photophobia: ['H53.14', 'Visual discomfort, photophobia, asthenopia'],
    visualDist: ['H53.19', 'Visual disturbances, haloes, flashes'],
    dizziness: ['R42.', 'Dizziness'],
    cognitive: ['R41.89', 'Other signs and symptoms involving cognitive functions and awareness'],
    lability: ['R45.86', 'Emotional lability'],
    priorTbi: ['Z87.820', 'Personal history of traumatic brain injury'],
    headache: ['G44.309', 'Headache, post-traumatic']
  }
  /* The code sheet. hpi: an HPI Yes/No question (its HPI_ITEMS wording);
     sym: an ACE symptom list and item, scored 1; select: a Yes/No dropdown;
     pick: a pick list, where anything but "No" counts. */
  var MAP = [
    { hpi: 'Change in Swallowing', dx: 'dysphagia' },
    { hpi: 'Change in Sense of Smell', dx: 'smellTaste' },
    { hpi: 'Change in Sense of Taste', dx: 'smellTaste' },
    { hpi: 'Slurring Speech', dx: 'fluency' },
    { hpi: 'Stuttering Speech', dx: 'fluency' },
    { hpi: 'Stammering Speech', dx: 'cognitive' },
    { hpi: 'Aphasia - comprehension lag time', dx: 'aphasia' },
    { hpi: 'Aphasia - a word choice lag time', dx: 'aphasia' },
    { hpi: 'Aphasia - phonation lag time', dx: 'aphasia' },
    { hpi: 'Tinnitus (Ringing in Ears)', dx: 'tinnitus' },
    { hpi: 'Hearing Difficulty', dx: 'vestibular' },
    { hpi: 'Feeling of Fullness or Pressure in Ear', dx: 'vestibular' },
    { hpi: 'Visual Discomfort', dx: 'photophobia' },
    { hpi: 'Visual Disturbance', dx: 'visualDist' },
    { hpi: 'Dizziness / Vertigo', dx: 'dizziness' },
    { hpi: 'Cried Since Injury Date', dx: 'lability' },
    { pick: 'xq_visionProblems', dx: 'photophobia' },
    { select: 'rpr_priorConc', dx: 'priorTbi' },
    { sym: 'acePhysical', item: 'Headache', dx: 'headache' },
    { sym: 'acePhysical', item: 'Visual problems', dx: 'visualDist' },
    { sym: 'acePhysical', item: 'Sensitivity to light', dx: 'photophobia' },
    { sym: 'aceCognitive', item: 'Feeling mentally foggy', dx: 'cognitive' },
    { sym: 'aceCognitive', item: 'Feeling slowed down', dx: 'cognitive' },
    { sym: 'aceCognitive', item: 'Difficulty concentrating', dx: 'cognitive' },
    { sym: 'aceCognitive', item: 'Difficulty remembering', dx: 'cognitive' }
  ]
  var NOT_A_PROBLEM = /^(no|no vision problems)$/i

  var restoring = false
  var each = function (sel, f) { Array.prototype.forEach.call(document.querySelectorAll(sel), f) }
  function find(sel, test) {
    var hit = null
    each(sel, function (el) { if (!hit && test(el)) hit = el })
    return hit
  }
  function symItem(m) {
    return find('#' + m.sym + ' .sym-score-item', function (el) { var s = el.querySelector('span'); return !!s && s.textContent.trim() === m.item })
  }
  function isYes(m) {
    if (m.hpi) {
      var row = find('#hpiList .yn-row', function (r) { return r.dataset.item === m.hpi })
      return !!(row && row.querySelector('.yn-btn.yes.active'))
    }
    if (m.sym) { var it = symItem(m); return !!(it && it.querySelector('.sym-btn.active[data-val="1"]')) }
    if (m.select) { var sel = document.getElementById(m.select); return !!sel && sel.value === 'Yes' }
    if (m.pick) {
      var ta = document.getElementById(m.pick), picked = []
      try { picked = (JSON.parse(ta.value) || {}).s || [] } catch (e) { picked = [] }
      return picked.some(function (v) { return !NOT_A_PROBLEM.test(String(v).trim()) })
    }
    return false
  }
  function dxKey(k) { return DX[k][0] + '|' + DX[k][1] }
  function dxItem(k) {
    return find('#icdGrid .icd-item', function (el) {
      var c = el.querySelector('.icd-code'), d = el.querySelector('.icd-desc')
      return !!c && !!d && c.textContent.trim() === DX[k][0] && d.textContent.trim() === DX[k][1]
    })
  }

  // The codes ticked here, kept in the Day 1 itself (a text field, so its save and restore carry it).
  function box() {
    var el = document.getElementById('dxAutoCodes')
    if (el) return el
    var host = document.getElementById('aceFormHost')
    if (!host) return null
    el = document.createElement('input')
    el.type = 'text'; el.id = 'dxAutoCodes'; el.hidden = true; el.tabIndex = -1
    el.setAttribute('aria-hidden', 'true')
    host.appendChild(el)
    return el
  }
  function readAuto() {
    var b = box(), list = []
    try { list = JSON.parse((b && b.value) || '[]') } catch (e) { list = [] }
    return Array.isArray(list) ? list : []
  }
  function writeAuto(list) { var b = box(); if (b) b.value = list.length ? JSON.stringify(list) : '' }

  function counts() {
    var n = document.querySelectorAll('#icdGrid .icd-item.checked').length
    var dx = document.getElementById('dxCount'); if (dx) dx.textContent = n + ' selected'
    var sc = document.getElementById('icdSelCount'); if (sc) sc.textContent = n + ' codes selected'
  }
  function label(k) { return DX[k][0] + ' ' + DX[k][1] }

  // One answer just changed: tick its code on a Yes, or untick the one ticked here once nothing calls for it.
  function apply(m) {
    var auto = readAuto(), key = dxKey(m.dx), el = dxItem(m.dx)
    if (!el) return
    if (isYes(m)) {
      if (el.classList.contains('checked')) return
      el.classList.add('checked')
      if (auto.indexOf(key) === -1) auto.push(key)
      writeAuto(auto)
      counts()
      if (typeof showToast === 'function') showToast('Added to Diagnosis: ' + label(m.dx))
    } else {
      if (auto.indexOf(key) === -1) return
      if (MAP.some(function (o) { return o.dx === m.dx && o !== m && isYes(o) })) return
      auto.splice(auto.indexOf(key), 1)
      writeAuto(auto)
      if (!el.classList.contains('checked')) return
      el.classList.remove('checked')
      counts()
      if (typeof showToast === 'function') showToast('Removed from Diagnosis: ' + label(m.dx))
    }
    if (typeof scheduleDraftSave === 'function') scheduleDraftSave()
  }
  // After the click's own handler has recorded the answer.
  function soon(m) { if (m) setTimeout(function () { apply(m) }, 0) }

  function init() {
    var host = document.getElementById('aceFormHost')
    if (!host) return
    box()
    host.addEventListener('click', function (e) {
      var t = e.target
      if (!t || !t.closest) return
      var row = t.closest('#hpiList .yn-row')
      if (row && t.closest('.yn-btn')) {
        soon(MAP.filter(function (m) { return m.hpi === row.dataset.item })[0])
        return
      }
      var sym = t.closest('.sym-btn') && t.closest('.sym-score-item')
      if (sym) {
        var list = sym.parentElement && sym.parentElement.id, s = sym.querySelector('span')
        soon(MAP.filter(function (m) { return m.sym === list && s && m.item === s.textContent.trim() })[0])
        return
      }
      // Ticking or unticking a code by hand makes it staff's choice: never auto-unticked after that.
      var icd = t.closest('#icdGrid .icd-item')
      if (icd) {
        var c = icd.querySelector('.icd-code'), d = icd.querySelector('.icd-desc')
        var auto = readAuto(), key = (c ? c.textContent.trim() : '') + '|' + (d ? d.textContent.trim() : '')
        if (auto.indexOf(key) !== -1) { auto.splice(auto.indexOf(key), 1); writeAuto(auto) }
      }
    })
    // Dropdowns and pick lists announce a change; a saved Day 1 being opened fires these too, and is skipped.
    host.addEventListener('change', function (e) {
      if (restoring || !e.target) return
      var id = e.target.id
      soon(MAP.filter(function (m) { return m.select === id || m.pick === id })[0])
    })
    if (window.ctgDay1Hooks) {
      window.ctgDay1Hooks.beforeRestore.push(function () {
        restoring = true
        // A Day 1 saved before this existed has no list: do not inherit the last patient's.
        writeAuto([])
        setTimeout(function () { restoring = false }, 0)
      })
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  window.ctgDxAuto = { map: MAP, codes: DX }
})()
