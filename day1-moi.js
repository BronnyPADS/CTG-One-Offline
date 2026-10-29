/* CTG One - Mechanism of Injury as an editable story (Day 1).
 *
 * Modelled on the EnableDoc template the practice uses:
 * ordinary text you can type into, with yellow dropdowns sitting inside the
 * sentences. Every dropdown is a checkbox list with "Type Here / Add / Select
 * All"; a dropdown whose choices are only Yes/No takes no new choices. The
 * dropdowns can be dragged to another place in the story, added and removed.
 * Grey words (name, date of injury, he/his) fill in from the patient.
 *
 * Edits belong to this patient only. The story is saved as JSON in a hidden
 * textarea (#moiStoryData) inside the Day 1 form, so Day 1's own save, draft
 * and restore carry it with no other change, and the Day 1 PDF / FCR print it
 * (see ctgMoiStory.paragraphs, called from the patched buildPDF).
 */
(function () {
  'use strict'

  var TA_ID = 'moiStoryData'
  var AUTO = { name: 1, fname: 1, doi: 1, he: 1, his: 1, him: 1 }
  // The patient's first name (first word of the full name) - "the patient" on
  // repeat mentions, per the practice (26 Oct 2026).
  function firstName(n) { n = String(n || '').trim(); return n ? n.split(/\s+/)[0] : '' }

  /* ------------------------------ templates ------------------------------ */
  function optionsOf(selectId, extra, transform) {
    var out = []
    var el = document.getElementById(selectId)
    if (el) Array.prototype.forEach.call(el.options, function (o) {
      var t = String(o.textContent || '').trim()
      if (!t || /select/i.test(t) || t === 'Other' || t === 'N/A' || /^Not admitted/i.test(t)) return
      out.push(transform ? transform(t) : t)
    })
    ;(extra || []).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t) })
    return out
  }
  var lower = function (t) { return t.charAt(0).toLowerCase() + t.slice(1) }

  function chipSpecs() {
    var symptoms = (typeof IMMEDIATE_EXPERIENCE !== 'undefined' ? IMMEDIATE_EXPERIENCE : ['Headache', 'Dizziness', 'Nausea/Vomiting'])
      .filter(function (s) { return !/loss of consciousness/i.test(s) }).map(lower)
    var hospitals = optionsOf('hospitalAdmitted', ['UMD Eastern Shore in Queenstown, Maryland'])
    var loc = ['did not lose consciousness', 'lost consciousness briefly', 'is unsure whether {he} lost consciousness']
    var edOutcome = ['was examined and discharged the same day',
      'was examined, advised to take OTC Tylenol and Motrin, and discharged same day from the ED',
      'had a CT scan of the head and was discharged the same day', 'was admitted for observation']
    var trend = ['have increased, and {his} quality of life has decreased', 'have stayed about the same', 'have improved slightly but persist']
    return {
      role: optionsOf('ptRole'),
      dir: optionsOf('vehicleDirection', ['stopped at a red light', 'pushed left', 'pushed right']),
      u1: optionsOf('unit1Type', null, lower),
      u2: optionsOf('unit2Type', null, lower),
      side: optionsOf('strikeDir'),
      impact: ['head jolted forward and snapped back', 'head jolted forward and the front of {his} head struck the steering wheel',
        'head jolted sideways and struck the window', 'head struck the headrest', 'head struck the airbag']
        .concat(optionsOf('ihi1')).filter(function (v, i, a) { return a.indexOf(v) === i }),
      loc: loc,
      symptoms: symptoms,
      police: ['Police arrived at the collision scene', 'Police did not come to the scene', 'A police report was filed later'],
      u1status: ['disabled', 'drivable', 'towed from the scene', 'declared a total loss'],
      transport: ['was picked up at the collision site and driven home', 'drove home', 'was taken by ambulance to the hospital',
        'was driven to the hospital by family'],
      hospital: hospitals,
      edOutcome: edOutcome,
      trend: trend,
      how: ['slipped and fell', 'fell from a height', 'was struck in the head while playing sports', 'was assaulted',
        'was struck in the head by a falling object'],
      head: ['struck {his} head on the ground', 'struck {his} head on a hard surface', 'did not strike {his} head']
    }
  }

  var TEMPLATES = {
    vehicle:
      'On {doi}, {name} was the [[role]] of a [[dir]] [[u1]] (Unit 1) that was struck on the [[side]] (MVC 1) by a [[u2]] (Unit 2).\n\n' +
      'Following impact {fname}\'s [[impact]]. {fname} [[loc]].\n\n' +
      'In the aftermath of the collision, {fname} experienced [[symptoms]].\n\n' +
      '[[police]]. Unit 1 was [[u1status]], {fname} [[transport]]. At home, {fname} tried to rest. On {blank}, {fname} went to ' +
      'the Emergency Department at [[hospital]] where {he} [[edOutcome]].\n\n' +
      'Since the DOI {fname}\'s symptoms [[trend]].',
    nonvehicle:
      'On {doi}, {name} [[how]] and [[head]]. {fname} [[loc]].\n\n' +
      'In the aftermath of the incident, {fname} experienced [[symptoms]].\n\n' +
      'On {blank}, {fname} went to the Emergency Department at [[hospital]] where {he} [[edOutcome]].\n\n' +
      'Since the DOI {fname}\'s symptoms [[trend]].'
  }

  function currentKind() {
    try { return (typeof aceNoVehicleSelected === 'function' && aceNoVehicleSelected()) ? 'nonvehicle' : 'vehicle' } catch (e) { return 'vehicle' }
  }

  function fromTemplate(kind) {
    var specs = chipSpecs()
    var tokens = []
    String(TEMPLATES[kind] || TEMPLATES.vehicle).split(/(\{(?:doi|name|fname|he|his|him|blank)\}|\[\[\w+\]\]|\n)/).forEach(function (part) {
      if (!part) return
      if (part === '\n') return tokens.push({ k: 'br' })
      var a = /^\{(\w+)\}$/.exec(part)
      if (a) return tokens.push(a[1] === 'blank' ? { k: 'b', v: '' } : { k: 'a', f: a[1] })
      var c = /^\[\[(\w+)\]\]$/.exec(part)
      if (c) return tokens.push({ k: 'c', n: c[1], o: (specs[c[1]] || []).slice(), s: [] })
      tokens.push({ k: 't', s: part })
    })
    return { v: 1, kind: kind, pristine: true, tokens: tokens }
  }

  /* ------------------------------- helpers ------------------------------- */
  function ctxFromForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : '' }
    return { name: g('ptName'), doi: g('doi'), gender: g('ptGender') }
  }
  function pronouns(gender) {
    if (/^male$/i.test(gender)) return { he: 'he', his: 'his', him: 'him' }
    if (/^female$/i.test(gender)) return { he: 'she', his: 'her', him: 'her' }
    return { he: 'they', his: 'their', him: 'them' }
  }
  function autoText(f, ctx) {
    if (f === 'name') return ctx.name || 'the patient'
    if (f === 'fname') return firstName(ctx.name) || 'the patient'
    if (f === 'doi') return ctx.doi || '[date of injury]'
    return pronouns(ctx.gender)[f] || f
  }
  function fill(text, ctx) {
    return String(text).replace(/\{(name|doi|he|his|him)\}/g, function (_, f) { return autoText(f, ctx) })
  }
  function joinNice(list) {
    if (list.length <= 1) return list.join('')
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]
  }
  // Locked only once it really is a Yes/No list: both Yes and No present, and
  // nothing else but N/A. A list holding just "Yes" so far must still take "No".
  function isYesNo(opts) {
    var norm = opts.map(function (o) { return String(o).trim().toLowerCase() })
    return norm.indexOf('yes') !== -1 && norm.indexOf('no') !== -1 &&
      norm.every(function (o) { return o === 'yes' || o === 'no' || o === 'n/a' || o === 'na' })
  }
  function isYesNoWord(o) { return /^(yes|no|n\/a|na)$/i.test(String(o).trim()) }
  function parseData(raw) {
    try { var d = JSON.parse(raw); return d && Array.isArray(d.tokens) ? d : null } catch (e) { return null }
  }

  /* -------------------------------- editor ------------------------------- */
  var editor, ta, pop, last = null, chips = {}, seq = 0, savedRange = null

  function chipLabel(c) {
    var ctx = ctxFromForm()
    return c.s.length ? joinNice(c.s.map(function (s) { return fill(s, ctx) })) : 'choose'
  }
  function makeChip(c) {
    var id = 'mc' + (++seq)
    chips[id] = { o: c.o.slice(), s: c.s.slice() }
    var el = document.createElement('span')
    el.className = 'moi-chip' + (c.s.length ? '' : ' moi-chip-empty')
    el.contentEditable = 'false'
    el.draggable = true
    el.dataset.id = id
    el.textContent = chipLabel(chips[id])
    var caret = document.createElement('i'); caret.className = 'moi-caret'; caret.textContent = '▾'
    el.appendChild(caret)
    return el
  }
  function refreshChip(el) {
    var c = chips[el.dataset.id]; if (!c) return
    el.firstChild.nodeValue = chipLabel(c)
    el.classList.toggle('moi-chip-empty', !c.s.length)
  }
  function makeAuto(f) {
    var el = document.createElement('span')
    el.className = 'moi-auto'; el.contentEditable = 'false'; el.dataset.f = f
    el.textContent = autoText(f, ctxFromForm())
    return el
  }
  function makeBlank(v) {
    var w = document.createElement('span')
    w.className = 'moi-blank-wrap'; w.contentEditable = 'false'
    var i = document.createElement('input')
    i.type = 'text'; i.className = 'moi-blank'; i.value = v || ''; i.setAttribute('aria-label', 'Type here')
    w.appendChild(i)
    return w
  }

  function render(data) {
    chips = {}
    editor.replaceChildren()
    data.tokens.forEach(function (t) {
      if (t.k === 't') {
        // A possessive/contraction ('s) right after a grey auto-word should hug
        // it, not sit a chip-padding away: "Jordan 's" -> "Jordan's".
        if (/^['’]/.test(t.s)) {
          var prev = editor.lastChild
          if (prev && prev.nodeType === 1 && prev.classList && prev.classList.contains('moi-auto')) prev.classList.add('moi-auto-tight')
        }
        editor.appendChild(document.createTextNode(t.s))
      }
      else if (t.k === 'br') editor.appendChild(document.createElement('br'))
      else if (t.k === 'a' && AUTO[t.f]) editor.appendChild(makeAuto(t.f))
      else if (t.k === 'c') editor.appendChild(makeChip({ o: t.o || [], s: t.s || [] }))
      else if (t.k === 'b') editor.appendChild(makeBlank(t.v))
    })
    // Somewhere to put the caret after a trailing dropdown.
    editor.appendChild(document.createTextNode(' '))
    editor.dataset.kind = data.kind || 'vehicle'
    editor.dataset.pristine = data.pristine ? '1' : ''
  }

  function serialize() {
    var tokens = []
    var pushText = function (s) {
      s = s.replace(/​/g, '').replace(/ /g, ' ')
      if (!s) return
      var prev = tokens[tokens.length - 1]
      if (prev && prev.k === 't') prev.s += s; else tokens.push({ k: 't', s: s })
    }
    var walk = function (node, top) {
      Array.prototype.forEach.call(node.childNodes, function (n, idx) {
        if (n.nodeType === 3) return pushText(n.nodeValue)
        if (n.nodeType !== 1) return
        if (n.tagName === 'BR') return tokens.push({ k: 'br' })
        if (n.classList.contains('moi-chip')) { var c = chips[n.dataset.id]; if (c) tokens.push({ k: 'c', o: c.o.slice(), s: c.s.slice() }); return }
        if (n.classList.contains('moi-auto')) return tokens.push({ k: 'a', f: n.dataset.f })
        if (n.classList.contains('moi-blank-wrap')) { var i = n.querySelector('input'); return tokens.push({ k: 'b', v: i ? i.value : '' }) }
        // A block the browser made on Enter: a line break, then its contents.
        if (/^(DIV|P)$/.test(n.tagName)) { if (tokens.length) tokens.push({ k: 'br' }); walk(n, false); return }
        walk(n, false)
      })
    }
    walk(editor, true)
    while (tokens.length && tokens[tokens.length - 1].k === 't' && !tokens[tokens.length - 1].s.trim()) tokens.pop()
    return { v: 1, kind: editor.dataset.kind || 'vehicle', pristine: false, tokens: tokens }
  }

  function writeTa(data, notify) {
    var raw = JSON.stringify(data)
    ta.value = raw
    last = raw
    if (notify) {
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  /* Undo / redo. The browser's own undo cannot see dropdown picks, drags or
     Start over, and render() wipes it, so the story keeps its own history:
     snapshots of the token list. Typing in quick succession is one step;
     every pick, drag, insert, removal or Start over is a step of its own. */
  var undoStack = [], redoStack = [], lastSnap = null, lastPushAt = 0, lastWasTyping = false
  var HISTORY_MAX = 100, TYPING_GROUP_MS = 1000
  var undoBtn = null, redoBtn = null
  function snapOf(data) { return JSON.stringify(data.tokens) }
  function syncHistoryButtons() {
    if (undoBtn) undoBtn.disabled = !undoStack.length || locked()
    if (redoBtn) redoBtn.disabled = !redoStack.length || locked()
  }
  function resetHistory(data) {
    undoStack = []; redoStack = []; lastSnap = data ? snapOf(data) : null; lastWasTyping = false
    syncHistoryButtons()
  }
  function record(data, typing) {
    var snap = snapOf(data)
    if (snap === lastSnap) return
    var now = Date.now()
    var sameBurst = typing && lastWasTyping && now - lastPushAt < TYPING_GROUP_MS
    if (!sameBurst && lastSnap !== null) {
      undoStack.push(lastSnap)
      if (undoStack.length > HISTORY_MAX) undoStack.shift()
    }
    redoStack = []
    lastSnap = snap; lastPushAt = now; lastWasTyping = !!typing
    syncHistoryButtons()
  }
  function applySnap(snap) {
    closePop()
    var data = { v: 1, kind: editor.dataset.kind || 'vehicle', pristine: false, tokens: JSON.parse(snap) }
    render(data)
    writeTa(data, true)
    lastSnap = snap; lastWasTyping = false
    editor.focus()
    var r = document.createRange(); r.selectNodeContents(editor); r.collapse(false)
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    syncHistoryButtons()
  }
  function undo() { if (locked() || !undoStack.length) return; redoStack.push(lastSnap); applySnap(undoStack.pop()) }
  function redo() { if (locked() || !redoStack.length) return; undoStack.push(lastSnap); applySnap(redoStack.pop()) }

  // e is the editor's input event when the change is typing.
  function commit(e) {
    editor.dataset.pristine = ''
    var data = serialize()
    record(data, !!(e && e.type === 'input'))
    writeTa(data, true)
  }

  function locked() { return !!(ta && (ta.disabled || ta.readOnly)) }
  /* Is the record whose answers are in the form signed (and not being amended)?
     Asked of the record, not the editor: the FCR and the Day 1 download fill the
     form in the background, where no lock is ever painted. */
  function signedInForm() {
    try {
      var host = document.getElementById('aceFormHost')
      var id = (host && host.dataset.patientId) || currentAcePatientId
      var p = id ? getPatient(id) : null
      return !!(p && p.ace && p.ace.signedAt) && !aceAmendEditing
    } catch (e) { return locked() }
  }

  /* ------------------------------- popover ------------------------------- */
  function closePop() { if (pop) { pop.remove(); pop = null } }

  function openPop(chipEl) {
    if (locked()) return
    var c = chips[chipEl.dataset.id]; if (!c) return
    openPicker(chipEl, c, function () { refreshChip(chipEl); commit() }, function () { chipEl.remove(); commit() })
  }

  /* The yellow checkbox list, shared with the extra Day 1 questions
     (day1-extras.js). c is {o: choices, s: selected}, changed in place;
     onChange runs after every change; onRemove (optional) adds the
     "Remove this dropdown" button. opts.allowAdd: a Yes/No list that still
     takes typed choices (Type Here / Add); its Yes, No and NA cannot be
     removed, and Select All is left off - ticking Yes and No together says
     nothing. */
  function openPicker(chipEl, c, onChange, onRemove, opts) {
    var allowAdd = !!(opts && opts.allowAdd)
    closePop()
    var ctx = ctxFromForm()
    var refreshChip = function () {}, commit = onChange
    pop = document.createElement('div')
    pop.className = 'moi-pop'
    pop.addEventListener('mousedown', function (e) { e.stopPropagation() })

    var draw = function () {
      pop.replaceChildren()
      var locked = isYesNo(c.o) && !allowAdd
      var hasYesNo = allowAdd && c.o.some(isYesNoWord)
      if (!locked) {
        var row = document.createElement('div'); row.className = 'moi-pop-add'
        var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Type Here'
        var add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add'
        var all = document.createElement('button'); all.type = 'button'; all.textContent = 'Select All'
        var doAdd = function () {
          var v = inp.value.trim()
          if (!v) return
          var hit = c.o.filter(function (o) { return o.toLowerCase() === v.toLowerCase() })[0]
          if (!hit) { c.o.push(v); hit = v }
          if (c.s.indexOf(hit) === -1) c.s.push(hit)
          refreshChip(chipEl); commit(); draw()
          var again = pop && pop.querySelector('.moi-pop-add input'); if (again) again.focus()
        }
        add.addEventListener('click', doAdd)
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd() } })
        all.addEventListener('click', function () {
          c.s = c.s.length === c.o.length ? [] : c.o.slice()
          refreshChip(chipEl); commit(); draw()
        })
        row.appendChild(inp); row.appendChild(add)
        if (!hasYesNo) row.appendChild(all)
        pop.appendChild(row)
      }
      var list = document.createElement('div'); list.className = 'moi-pop-list'
      if (!c.o.length) {
        var none = document.createElement('div'); none.className = 'moi-pop-none'; none.textContent = 'No choices yet - type one above and press Add.'
        list.appendChild(none)
      }
      c.o.forEach(function (o, i) {
        var lab = document.createElement('label'); lab.className = 'moi-pop-item'
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.s.indexOf(o) !== -1
        cb.addEventListener('change', function () {
          if (cb.checked) { c.s = c.o.filter(function (x) { return x === o || c.s.indexOf(x) !== -1 }) }
          else c.s = c.s.filter(function (x) { return x !== o })
          refreshChip(chipEl); commit()
        })
        var txt = document.createElement('span'); txt.textContent = fill(o, ctx)
        lab.appendChild(cb); lab.appendChild(txt)
        if (!locked && !(hasYesNo && isYesNoWord(o))) {
          var del = document.createElement('button'); del.type = 'button'; del.className = 'moi-pop-del'; del.title = 'Remove this choice'; del.textContent = '×'
          del.addEventListener('click', function (e) {
            e.preventDefault()
            c.o.splice(i, 1); c.s = c.s.filter(function (x) { return x !== o })
            refreshChip(chipEl); commit(); draw()
          })
          lab.appendChild(del)
        }
        list.appendChild(lab)
      })
      pop.appendChild(list)
      var foot = document.createElement('div'); foot.className = 'moi-pop-foot'
      if (onRemove) {
        var rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove this dropdown from the story'
        rm.addEventListener('click', function () { closePop(); onRemove() })
        foot.appendChild(rm)
      } else foot.appendChild(document.createElement('span'))
      var done = document.createElement('button'); done.type = 'button'; done.className = 'moi-pop-done'; done.textContent = 'Done'
      done.addEventListener('click', closePop)
      foot.appendChild(done)
      pop.appendChild(foot)
    }
    draw()
    document.body.appendChild(pop)
    var r = chipEl.getBoundingClientRect()
    var left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12)
    pop.style.left = Math.max(window.scrollX + 8, left) + 'px'
    pop.style.top = (window.scrollY + r.bottom + 4) + 'px'
    var first = pop.querySelector('.moi-pop-add input'); if (first && !c.o.length) first.focus()
  }

  /* ------------------------------- inserting ----------------------------- */
  function insertAtCaret(node) {
    var range = savedRange
    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange(); range.selectNodeContents(editor); range.collapse(false)
    }
    range.deleteContents()
    var space = document.createTextNode(' ')
    range.insertNode(space)
    range.insertNode(node)
    // A word or full stop right before the new box gets a space too.
    var before = node.previousSibling
    if (before && before.nodeType === 3 && /\S$/.test(before.nodeValue)) before.nodeValue += ' '
    range.setStartAfter(space); range.collapse(true)
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
    savedRange = range.cloneRange()
  }

  /* --------------------------------- setup ------------------------------- */
  function setup() {
    var sec = document.getElementById('sec-moi')
    var body = sec && sec.querySelector('.card-body')
    if (!body || document.getElementById('moiStoryEditor')) return
    document.documentElement.classList.add('ctg-moi-story')

    var wrap = document.createElement('div'); wrap.className = 'moi-story-wrap'
    var bar = document.createElement('div'); bar.className = 'moi-story-bar'
    var mkBtn = function (label, title, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost btn-sm'; b.textContent = label; b.title = title
      b.addEventListener('mousedown', function (e) { e.preventDefault() }) // keep the caret where it was
      b.addEventListener('click', fn); bar.appendChild(b); return b
    }
    undoBtn = mkBtn('↶ Undo', 'Undo (Ctrl+Z)', function () { undo() })
    redoBtn = mkBtn('↷ Redo', 'Redo (Ctrl+Y)', function () { redo() })
    mkBtn('+ Dropdown', 'Insert a new dropdown where the cursor is', function () {
      if (locked()) return
      var el = makeChip({ o: [], s: [] }); insertAtCaret(el); commit(); openPop(el)
    })
    mkBtn('+ Blank', 'Insert a box to type into where the cursor is', function () {
      if (locked()) return
      var el = makeBlank(''); insertAtCaret(el); commit(); el.querySelector('input').focus()
    })
    mkBtn('Start over', 'Replace this story with the standard one', function () {
      if (locked()) return
      if (!window.confirm('Replace this Mechanism of Injury story with the standard one? Your edits to it will be lost.')) return
      var d = fromTemplate(currentKind()); record(d, false); render(d); writeTa(d, true)
    })
    var hint = document.createElement('div'); hint.className = 'moi-story-hint'
    hint.textContent = 'Type anywhere in the story. Click a blue box to choose, add or remove options; drag it to move it. Grey words fill in from the patient. Ctrl+Z undoes, Ctrl+Y redoes.'

    editor = document.createElement('div')
    editor.id = 'moiStoryEditor'; editor.className = 'moi-story'; editor.contentEditable = 'true'; editor.spellcheck = true
    editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-multiline', 'true'); editor.setAttribute('aria-label', 'Mechanism of injury story')

    ta = document.createElement('textarea'); ta.id = TA_ID; ta.hidden = true; ta.tabIndex = -1

    wrap.appendChild(bar); wrap.appendChild(editor); wrap.appendChild(hint); wrap.appendChild(ta)
    body.insertBefore(wrap, body.firstChild)

    // The fields other parts of Day 1 still print, gathered under the story.
    var keep = ['totalMVC', 'totalSOC', 'immediateSyms', 'moiDx']
    var title = document.createElement('div'); title.className = 'sdiv'
    var titleText = document.createElement('span'); titleText.textContent = 'Other MOI Details'; title.appendChild(titleText)
    var grid = document.createElement('div'); grid.className = 'g2 moi-keep-grid'
    keep.forEach(function (id) { var el = document.getElementById(id); var fg = el && el.closest('.fg'); if (fg) grid.appendChild(fg) })
    wrap.parentNode.insertBefore(title, wrap.nextSibling)
    title.parentNode.insertBefore(grid, title.nextSibling)


    /* --- editor events */
    editor.addEventListener('input', commit)
    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && e.target === editor) { e.preventDefault(); document.execCommand('insertLineBreak') }
    })
    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (Cmd on a Mac) use the story's own history,
    // also from a blank box inside the story.
    editor.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      var k = String(e.key || '').toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    })
    // Edit > Undo from the right-click menu.
    editor.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo() }
      else if (e.inputType === 'historyRedo') { e.preventDefault(); redo() }
    })
    editor.addEventListener('paste', function (e) {
      if (e.target !== editor) return
      e.preventDefault()
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'))
    })
    editor.addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.moi-chip')
      if (chip && editor.contains(chip)) { e.preventDefault(); openPop(chip) }
    })
    document.addEventListener('selectionchange', function () {
      var s = window.getSelection()
      if (s.rangeCount && editor.contains(s.getRangeAt(0).startContainer)) savedRange = s.getRangeAt(0).cloneRange()
    })
    document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target)) closePop() })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop() })

    /* --- drag a dropdown to another place in the story */
    var dragging = null
    editor.addEventListener('dragstart', function (e) {
      var chip = e.target.closest && e.target.closest('.moi-chip')
      if (!chip || locked()) { e.preventDefault(); return }
      dragging = chip; closePop()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', '')
      chip.classList.add('moi-dragging')
    })
    editor.addEventListener('dragend', function () { if (dragging) dragging.classList.remove('moi-dragging'); dragging = null })
    editor.addEventListener('dragover', function (e) { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } })
    editor.addEventListener('drop', function (e) {
      e.preventDefault()
      if (!dragging) return
      var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null
      if (!range || !editor.contains(range.startContainer) || dragging.contains(range.startContainer)) return
      var chip = dragging
      chip.classList.remove('moi-dragging')
      range.insertNode(document.createTextNode(' '))
      range.insertNode(chip)
      dragging = null
      commit()
    })

    /* --- Day 1 restore: clear the story first, so a patient saved before the
       story existed does not inherit the previous patient's. */
    if (window.ctgDay1Hooks) window.ctgDay1Hooks.beforeRestore.push(function () { if (ta) ta.value = '' })

    tick()
    setInterval(tick, 400)
  }

  /* Keeps the editor in step with the textarea (restore, clear, lock) and the
     grey words in step with the patient's name, date and gender. */
  function tick() {
    if (!editor || !ta) return
    if (ta.value !== last) {
      var d = parseData(ta.value)
      // Another patient (or a cleared form): a fresh story, so a fresh history.
      if (!d && signedInForm()) {
        // A signed Day 1 from before the story: show and print exactly what was
        // signed (the old MOI fields), never a story built after the fact.
        setLegacy(true); last = ta.value; resetHistory(null)
      } else {
        setLegacy(false)
        if (!d) { d = fromLegacy(currentKind()); render(d); writeTa(d, false) }
        else { render(d); last = ta.value }
        resetHistory(d)
      }
    } else if (!ta.value && !signedInForm() && document.getElementById('sec-moi').classList.contains('moi-legacy')) {
      // Unlocked to amend: the story takes over, pre-filled from the old answers.
      setLegacy(false); var ad = fromLegacy(currentKind()); render(ad); writeTa(ad, false); resetHistory(ad)
    } else if (editor.dataset.pristine === '1' && editor.dataset.kind !== currentKind() && document.activeElement !== editor) {
      // Injury type changed before anyone touched the story: switch template.
      var nd = fromTemplate(currentKind()); render(nd); writeTa(nd, false); resetHistory(nd)
    }
    syncHistoryButtons()
    var ctx = ctxFromForm()
    Array.prototype.forEach.call(editor.querySelectorAll('.moi-auto'), function (el) {
      var t = autoText(el.dataset.f, ctx); if (el.textContent !== t) el.textContent = t
    })
    var isLocked = locked()
    editor.contentEditable = isLocked ? 'false' : 'true'
    editor.classList.toggle('moi-locked', isLocked)
    Array.prototype.forEach.call(editor.querySelectorAll('.moi-blank'), function (i) { i.disabled = isLocked })
    if (isLocked) closePop()
  }

  /* --------------------------- printing the story ------------------------ */
  // ctx: { name, doi, pn: {subj, poss, obj} } from buildPDF; segments as its para() takes them.
  function paragraphsFrom(data, ctx) {
    var p = ctx.pn || {}
    var auto = function (f) {
      if (f === 'name') return ctx.name || 'the patient'
      if (f === 'fname') return firstName(ctx.name) || 'the patient'
      if (f === 'doi') return ctx.doi || ''
      return ({ he: p.subj, his: p.poss, him: p.obj })[f] || f
    }
    var subst = function (s) { return String(s).replace(/\{(name|fname|doi|he|his|him)\}/g, function (_, f) { return auto(f) }) }
    var paras = [[]]
    data.tokens.forEach(function (t) {
      var cur = paras[paras.length - 1]
      if (t.k === 'br') { if (cur.length) paras.push([]); return }
      if (t.k === 't') cur.push({ t: t.s })
      else if (t.k === 'a') cur.push({ t: auto(t.f), b: true })
      else if (t.k === 'c' && t.s && t.s.length) cur.push({ t: joinNice(t.s.map(subst)), b: true })
      else if (t.k === 'b' && String(t.v || '').trim()) cur.push({ t: String(t.v).trim(), b: true })
    })
    return paras.map(function (segs) {
      // Tidy the joins a skipped dropdown leaves behind: doubled spaces, " ." and " ,".
      var out = []
      segs.forEach(function (s) {
        var txt = String(s.t).replace(/\s+/g, ' ')
        if (!txt) return
        var prev = out[out.length - 1]
        if (prev && / $/.test(prev.t) && /^ /.test(txt)) txt = txt.replace(/^ +/, '')
        if (prev && /^[.,;:]/.test(txt)) prev.t = prev.t.replace(/ +$/, '')
        out.push({ t: txt, b: !!s.b })
      })
      if (out.length) { out[0].t = out[0].t.replace(/^ +/, ''); out[out.length - 1].t = out[out.length - 1].t.replace(/ +$/, '') }
      return out.filter(function (s) { return s.t })
    }).filter(function (segs) { return segs.length })
  }

  window.ctgPicker = { open: openPicker, close: closePop, joinNice: joinNice, isYesNo: isYesNo }

  window.ctgMoiStory = {
    paragraphs: function (ctx) {
      var el = document.getElementById(TA_ID)
      var d = el && parseData(el.value)
      // No story yet (the PDF can run before the editor's next tick): a signed
      // record prints what was signed; any other prints what the editor shows.
      if (!d && el && !signedInForm()) d = fromLegacy(currentKind())
      return d ? paragraphsFrom(d, ctx || {}) : null
    }
  }

  /* Read-only view of a completed Day 1 (null = no story: Day 1 shows the old fields). */
  if (window.ctgDay1Hooks) {
    window.ctgDay1Hooks.moiReadOnly = function (fs) {
      var inp = (fs && fs.inputs) || {}, sel = (fs && fs.selects) || {}
      var d = parseData(inp[TA_ID])
      if (!d) return null
      var g = sel.ptGender || ''
      var pn = /^male$/i.test(g) ? { subj: 'he', poss: 'his', obj: 'him' } : /^female$/i.test(g) ? { subj: 'she', poss: 'her', obj: 'her' } : { subj: 'they', poss: 'their', obj: 'them' }
      var text = paragraphsFrom(d, { name: inp.ptName, doi: inp.doi, pn: pn })
        .map(function (segs) { return segs.map(function (s) { return s.t }).join('') }).join('\n\n')
      return roItem('Mechanism of Injury', text, true)
        + roItem('Total MVCs', sel.totalMVC) + roItem('Total SOCs (Stationary Objects)', sel.totalSOC)
        + roItem('DHI 1 — Direct Head Impact Description', sel.dhi1, true) + roItem('IHI 1 — Indirect Head Impact Description', sel.ihi1, true)
        + roItem('Total DHIs', sel.totalDHI) + roItem('Total IHIs', sel.totalIHI)
        + roItem('Chief Complaint', inp.immediateSyms, true)
        + roItem('MOI Dx (ICD-10 codes related to mechanism of injury)', inp.moiDx)
    }
  }

  /* ------------------------- older records (before the story) ---------------------- */
  var LEGACY_SELECTS = ['ptRole', 'unit1Type', 'strikeDir', 'unit2Type', 'unit3Type', 'strikeDir2', 'strikeDir3',
    'vehicleDirection', 'trafficType', 'erVisit', 'hospitalAdmitted']

  function setLegacy(on) {
    var sec = document.getElementById('sec-moi')
    if (sec) sec.classList.toggle('moi-legacy', !!on)
  }
  function domVal(id) {
    var el = document.getElementById(id)
    if (!el) return ''
    if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; return o && o.value ? String(o.textContent || '').trim() : '' }
    return String(el.value || '').trim()
  }
  function blankish(v) { return !v || v === '\u2014' || /^(n\/a|none)$/i.test(v) }

  /* A story for a record saved with the old MOI fields: the template, with the
     old answers ticked, plus a closing paragraph for anything the story has no
     dropdown for, worded as the old PDF paragraph worded it - nothing is lost. */
  function fromLegacy(kind) {
    var noVehicle = String(domVal('moiNoVehicleText') || '').replace(/\s+/g, ' ').trim()
    if (kind === 'nonvehicle' && noVehicle) {
      var nv = fromTemplate('nonvehicle')
      var cut = nv.tokens.findIndex(function (t) { return t.k === 'br' })
      var head = [{ k: 't', s: 'On ' }, { k: 'a', f: 'doi' }, { k: 't', s: ', ' }, { k: 'a', f: 'name' },
        { k: 't', s: ' was injured when ' + noVehicle.replace(/\.+$/, '') + '.' }]
      return { v: 1, kind: 'nonvehicle', pristine: false, tokens: head.concat(cut === -1 ? [] : nv.tokens.slice(cut)) }
    }
    var d = fromTemplate(kind)
    var low = function (v) { return v ? v.charAt(0).toLowerCase() + v.slice(1) : v }
    var impacts = [domVal('dhi1'), domVal('ihi1')].filter(function (v) { return !blankish(v) })
    var symptoms = Array.prototype.map.call(document.querySelectorAll('#immedExperienceList label.checked'), function (l) {
      return typeof chkTxt === 'function' ? chkTxt(l) : l.textContent.trim()
    }).filter(function (v) { return v && !/loss of consciousness/i.test(v) }).map(low)
    var hospital = domVal('hospitalAdmitted')
    var fills = {
      role: [domVal('ptRole')], dir: [domVal('vehicleDirection')], u1: [low(domVal('unit1Type'))], side: [domVal('strikeDir')],
      u2: [low(domVal('unit2Type'))], impact: impacts, symptoms: symptoms,
      hospital: [/^(Not admitted|Other$)/i.test(hospital) ? '' : hospital]
    }
    var any = false
    d.tokens.forEach(function (t) {
      if (t.k !== 'c' || !fills[t.n]) return
      fills[t.n].filter(function (v) { return !blankish(v) }).forEach(function (v) {
        var hit = t.o.filter(function (o) { return o.toLowerCase() === v.toLowerCase() })[0]
        if (!hit) { t.o.push(v); hit = v }
        if (t.s.indexOf(hit) === -1) t.s.push(hit)
        any = true
      })
    })
    var extra = []
    var name = { k: 'a', f: 'name' }
    var u3 = domVal('unit3Type'), s2 = domVal('strikeDir2'), s3 = domVal('strikeDir3')
    if (!blankish(u3)) {
      extra.push({ k: 't', s: 'Additionally, ' }, name, { k: 't', s: "'s vehicle (Unit 1) was struck on the " + (s2 || '') + ' (MVC 2)' +
        (!blankish(s3) ? ' and on the ' + s3 + ' (MVC 3)' : '') + ' by a ' + low(u3) + ' (Unit 3). ' })
    }
    var traffic = domVal('trafficType')
    if (!blankish(traffic)) extra.push({ k: 't', s: 'The incident was classified as a ' + traffic + '. ' })
    var er = domVal('erVisit'), erOther = domVal('erVisitOther')
    if (er === 'Other' && !blankish(erOther)) extra.push({ k: 't', s: erOther.replace(/\.?$/, '. ') })
    else if (/^No/i.test(er)) extra.push(name, { k: 't', s: ' did not seek emergency department care following the incident. ' })
    var post = domVal('otherPostTx')
    if (!blankish(post)) extra.push({ k: 't', s: 'Following the injury incident, ' }, name, { k: 't', s: ' received the following additional treatment: ' + post.replace(/\.+$/, '') + '.' })
    if (extra.length) { d.tokens.push({ k: 'br' }, { k: 'br' }); d.tokens = d.tokens.concat(extra); any = true }
    if (any) d.pristine = false
    return d
  }

  /* "At least one MOI choice made" - the practice's rule (2 Oct 2026) in place
     of the eleven old MOI fields. state = a saved formState, or null for the
     form on screen. A record from before the story counts by its old answers. */
  function storyHasChoice(raw) {
    var d = parseData(raw)
    return !!(d && d.tokens.some(function (t) { return t.k === 'c' && t.s && t.s.length }))
  }
  window.ctgMoiAnswered = function (state) {
    if (state) {
      var inp = state.inputs || {}, sel = state.selects || {}
      if (inp[TA_ID]) return storyHasChoice(inp[TA_ID])
      return LEGACY_SELECTS.some(function (id) { return !!sel[id] }) || !!String(inp.moiNoVehicleText || '').trim()
    }
    var el = document.getElementById(TA_ID)
    if (el && el.value) return storyHasChoice(el.value)
    return LEGACY_SELECTS.some(function (id) { return !!domVal(id) }) || !!domVal('moiNoVehicleText')
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup)
  else setup()
})()
