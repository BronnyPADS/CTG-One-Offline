/* CTG One - auto-count the MOI totals.
   Total MVCs / Total SOCs are read from the (MVC n) / (SOC n) tags the story
   shows, so the number always matches the narrative. Total DHIs / Total IHIs
   are read from how many Direct / Indirect Head Impact description fields are
   filled. Each Total dropdown still works as a MANUAL OVERRIDE: pick a value
   yourself and the auto-count stops touching it (until the page reloads).
   Nothing here changes any saved data on load - it only reacts to edits made
   after the record is open. Offline/practice copy. */
(function () {
  var MVC = 'totalMVC', SOC = 'totalSOC', DHI = 'totalDHI', IHI = 'totalIHI'
  var TA = 'moiStoryData'
  var manual = {}, autoSetting = {}, lastCount = {}, baselined = false

  // The story's visible text (literal template text carries the "(MVC 1)" tags;
  // a chip's chosen words are included too). Reads the saved JSON, not the DOM.
  function storyText() {
    try {
      var el = document.getElementById(TA)
      if (el && el.value) {
        var d = JSON.parse(el.value)
        if (d && d.tokens && d.tokens.length) {
          return d.tokens.map(function (t) {
            if (t.k === 't') return t.s || ''
            if (t.k === 'c' && t.s && t.s.length) return t.s.join(' ')
            return ''
          }).join(' ')
        }
      }
    } catch (e) {}
    return ''
  }
  // The highest N in "(TAG N)" across the text (0 when the tag never appears).
  function highestTag(text, tag) {
    var re = new RegExp('\\(\\s*' + tag + '\\s+(\\d+)\\s*\\)', 'gi'), m, max = 0, seen = false
    while ((m = re.exec(text))) { seen = true; if (+m[1] > max) max = +m[1] }
    return seen ? max : 0
  }
  // How many of the given select fields hold a real (non-blank) choice.
  function filled(ids) {
    var n = 0
    ids.forEach(function (id) {
      var el = document.getElementById(id); if (!el) return
      var o = el.options ? el.options[el.selectedIndex] : null
      var v = o ? (o.value !== '' ? o.value : o.textContent) : el.value
      v = String(v || '').trim()
      if (v && !/^(—|-+|n\/a|none|—\s*select\s*—)$/i.test(v)) n++
    })
    return n
  }
  // The option on `sel` that best shows `count` (exact, else a "3+"/"4+" form, else nearest <=).
  function optionFor(sel, count) {
    var vals = Array.prototype.map.call(sel.options, function (o) { return (o.value !== '' ? o.value : o.textContent).trim() })
    if (vals.indexOf(String(count)) >= 0) return String(count)
    var plus = vals.filter(function (v) { return /^\d+\+$/.test(v) }).sort(function (a, b) { return parseInt(b) - parseInt(a) })[0]
    if (plus && count >= parseInt(plus)) return plus
    var nums = vals.filter(function (v) { return /^\d+$/.test(v) }).map(Number).sort(function (a, b) { return a - b })
    var best = nums.length ? nums[0] : 0
    nums.forEach(function (x) { if (x <= count) best = x })
    return String(best)
  }
  function curVal(el) { var o = el.options[el.selectedIndex]; return o ? (o.value !== '' ? o.value : o.textContent).trim() : '' }
  function setAuto(id, count) {
    var el = document.getElementById(id); if (!el || manual[id]) return
    var want = optionFor(el, count)
    if (curVal(el) === want) return
    var idx = -1
    Array.prototype.forEach.call(el.options, function (o, i) { if ((o.value !== '' ? o.value : o.textContent).trim() === want) idx = i })
    if (idx < 0) return
    autoSetting[id] = true
    el.selectedIndex = idx
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    autoSetting[id] = false
  }
  function recompute() {
    if (!document.getElementById(MVC)) return
    var text = storyText()
    var counts = {}
    counts[MVC] = highestTag(text, 'MVC')
    counts[SOC] = highestTag(text, 'SOC')
    counts[DHI] = filled(['dhi1', 'dhi2'])
    counts[IHI] = filled(['ihi1', 'ihi2'])
    // First pass after the record opens: record the baseline, don't touch the
    // saved values - so re-opening a record never rewrites its counts.
    if (!baselined) { lastCount = counts; baselined = true; return }
    ;[MVC, SOC, DHI, IHI].forEach(function (id) {
      if (counts[id] !== lastCount[id]) { setAuto(id, counts[id]); lastCount[id] = counts[id] }
    })
  }
  // A genuine user pick is preceded by a pointer/key press on the select (the
  // custom dropdown and the native one both fire these); a programmatic set -
  // on load, or ours - does not. A change within ~2.5s of such a press is the
  // user overriding, so stop auto-counting that total until reload.
  var interacting = {}
  function markInteract(e) { interacting[e.currentTarget.id] = Date.now() }
  function onTotalChange(e) {
    var id = e.target && e.target.id
    if (id && !autoSetting[id] && interacting[id] && Date.now() - interacting[id] < 2500) manual[id] = true
  }
  function wire() {
    [MVC, SOC, DHI, IHI].forEach(function (id) {
      var el = document.getElementById(id)
      if (el && !el.dataset.acTot) {
        el.dataset.acTot = '1'
        el.addEventListener('pointerdown', markInteract)
        el.addEventListener('mousedown', markInteract)
        el.addEventListener('keydown', markInteract)
        el.addEventListener('change', onTotalChange)
      }
    })
    ;['dhi1', 'dhi2', 'ihi1', 'ihi2'].forEach(function (id) {
      var el = document.getElementById(id)
      if (el && !el.dataset.acSrc) { el.dataset.acSrc = '1'; el.addEventListener('change', recompute); el.addEventListener('input', recompute) }
    })
  }
  // The story textarea is written programmatically (no event), so poll as a
  // backstop; recompute is a cheap no-op when nothing changed.
  function tick() { wire(); recompute() }
  if (document.readyState !== 'loading') tick(); else document.addEventListener('DOMContentLoaded', tick)
  setInterval(tick, 800)
  // When a different patient's Day 1 opens, re-baseline to its saved counts.
  window.ctgMoiAutoReset = function () { baselined = false; manual = {} }
})()
