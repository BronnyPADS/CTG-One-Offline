
/* Billing entity constants. Boxes 32/33 are the same on every claim this
   practice files, so they are defaults, not questions. Edit here if the
   practice moves or re-enrolls. */
var CLAIM_PRACTICE = {
  name: 'Concussion Therapy Group',
  addr: '2411 Crofton Lane',
  suite: 'Suite 13A',
  cityStateZip: 'Crofton, MD 21114-1336',
  phone: '410 451 9870',
  npi: '1144274994',
  taxId: '99-4717315',
  taxIdType: 'ein',
  otherIdQual: 'TJ'
}

function cfBlank() {
  return {
    carrier: { name: '', line1: '', line2: '' },
    box1: '', box1a: '',
    box4: { last: '', first: '', mi: '' },
    box5: { addr: '', city: '', state: '', zip: '', phone: '' },
    box6: '',
    box7: { addr: '', city: '', state: '', zip: '', phone: '' },
    box9: { name: '', policy: '', planName: '' },
    box10: { employment: '', auto: '', autoPlace: '', other: '', codes: '' },
    box11: { group: '', dob: '', sex: '', otherClaimId: '', planName: '', another: '' },
    box12: { signature: 'Signature On File', date: '' },
    box13: { signature: 'Signature On File' },
    box14: { date: '', qual: '' },
    box15: { qual: '', date: '' },
    box16: { from: '', to: '' },
    box17: { name: '', qual: '', otherId: '', npi: '' },
    box18: { from: '', to: '' },
    box19: '',
    box20: { outside: '', charges: '' },
    box21: { icdInd: '0', codes: ['', '', '', '', '', '', '', '', '', '', '', ''] },
    box22: { code: '', originalRef: '' },
    box23: '',
    lines: [cfBlankLine()],
    box26: '', box27: '', box29: '', box30: '',
    box31: { name: '', date: '' },
    box32: { name: '', addr: '', suite: '', cityStateZip: '', npi: '', otherId: '' },
    /* Demo identity override (Load Demo only). When set, the read-only
       patient boxes render from this instead of the patient's record, so
       test data can never be written into a real chart - clearing it puts
       the real patient straight back. Null on every genuine claim. */
    demo: null,
    updatedAt: ''
  }
}
function cfBlankLine() {
  // Nothing pre-filled: an empty line is empty, including place of service,
  // the diagnosis pointer and units.
  return { from: '', to: '', pos: '', emg: '', cpt: '', mods: '', pointer: '', charges: '', units: '', epsdt: '', idQual: '', renderingId: '' }
}

/* Same backfill contract as intakeEnsure: keep whatever was saved, add fields
   introduced after the record was written, never clobber existing answers. */
function cfEnsure(p) {
  if (!p.claimForm || typeof p.claimForm !== 'object') p.claimForm = cfBlank()
  var blank = cfBlank()
  Object.keys(blank).forEach(function (k) {
    if (p.claimForm[k] === undefined) { p.claimForm[k] = blank[k]; return }
    if (blank[k] && typeof blank[k] === 'object' && !Array.isArray(blank[k])) {
      if (!p.claimForm[k] || typeof p.claimForm[k] !== 'object') { p.claimForm[k] = blank[k]; return }
      Object.keys(blank[k]).forEach(function (f) {
        if (p.claimForm[k][f] === undefined) p.claimForm[k][f] = blank[k][f]
      })
    }
  })
  if (!Array.isArray(p.claimForm.lines) || !p.claimForm.lines.length) p.claimForm.lines = [cfBlankLine()]
  return p.claimForm
}

/* ---------- small helpers ---------- */
function cfEsc(s) { return (typeof arEsc === 'function') ? arEsc(s == null ? '' : s) : String(s == null ? '' : s) }
function cfVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : '' }
function cfChecked(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : '' }
function cfOpt(v, label, cur) { return '<option value="' + cfEsc(v) + '"' + (v === cur ? ' selected' : '') + '>' + cfEsc(label) + '</option>' }
function cfMoney(n) {
  var x = parseFloat(String(n == null ? '' : n).replace(/[^0-9.\-]/g, ''))
  return isFinite(x) ? x : 0
}
function cfMoneyStr(n) { return cfMoney(n).toFixed(2) }

// The form prints dates as MM DD YY in three separately-boxed cells.
function cfDateParts(v) {
  var s = String(v || '').trim()
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)          // ISO from <input type=date>
  if (m) return { mm: m[2], dd: m[3], yy: m[1] }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)  // typed MM/DD/YYYY
  if (m) {
    var yr = m[3].length === 2 ? '20' + m[3] : m[3]
    return { mm: ('0' + m[1]).slice(-2), dd: ('0' + m[2]).slice(-2), yy: yr }
  }
  return { mm: '', dd: '', yy: '' }
}
function cfDateCells(v) {
  var d = cfDateParts(v)
  return d.mm || d.dd || d.yy ? (d.mm + ' ' + d.dd + ' ' + d.yy) : ''
}

/* Patient-record derived values. The portal already knows the patient's name,
   DOB, address and sex, so boxes 2/3/5 are shown read-only and sourced there
   rather than re-typed into a second place that could then disagree. */
var CF_STATE_NAMES = ('alabama AL alaska AK arizona AZ arkansas AR california CA colorado CO connecticut CT '
  + 'delaware DE district of columbia DC florida FL georgia GA hawaii HI idaho ID illinois IL indiana IN iowa IA '
  + 'kansas KS kentucky KY louisiana LA maine ME maryland MD massachusetts MA michigan MI minnesota MN '
  + 'mississippi MS missouri MO montana MT nebraska NE nevada NV new hampshire NH new jersey NJ new mexico NM '
  + 'new york NY north carolina NC north dakota ND ohio OH oklahoma OK oregon OR pennsylvania PA rhode island RI '
  + 'south carolina SC south dakota SD tennessee TN texas TX utah UT vermont VT virginia VA washington WA '
  + 'west virginia WV wisconsin WI wyoming WY puerto rico PR').match(/[a-z ]+?\s[A-Z]{2}/g).reduce(function (m, pair) {
    var i = pair.lastIndexOf(' ')
    m[pair.slice(0, i).trim()] = pair.slice(i + 1)
    return m
  }, {})

function cfSplitCsz(csz) {
  var v = String(csz || '').trim()
  if (!v) return { city: '', state: '', zip: '' }
  var zip = '', state = '', city = v
  var mz = city.match(/([0-9]{5}(?:-[0-9]{4})?)\s*$/)
  if (mz) { zip = mz[1]; city = city.slice(0, mz.index) }
  city = city.replace(/[,\s]+$/, '')
  var ms = city.match(/[,\s]+([A-Za-z]{2})$/)
  if (ms) { state = ms[1].toUpperCase(); city = city.slice(0, ms.index) }
  else {
    var mn = city.match(/[,\s]+([A-Za-z][A-Za-z ]+)$/)
    var key = mn ? mn[1].trim().toLowerCase() : ''
    if (key && CF_STATE_NAMES[key]) { state = CF_STATE_NAMES[key]; city = city.slice(0, mn.index) }
  }
  return { city: city.replace(/[,\s]+$/, '').trim(), state: state, zip: zip }
}

function cfPatientView(p) {
  // Load Demo substitutes a fake identity here rather than writing to
  // p.demographics, so the real record is never altered by a test.
  var cf = p && p.claimForm
  if (cf && cf.demo) return cf.demo
  var d = (p && p.demographics) || {}
  var addr = [d.addressLine, d.addressLine2].filter(Boolean).join(', ')
  /* Registration writes city, state and ZIP as their own fields now. Use them
     when they are there; older records only have the combined text. */
    var csz = (d.city || d.state || d.zip)
    ? { city: String(d.city || '').trim(), state: String(d.state || '').trim(), zip: String(d.zip || '').trim() }
    : cfSplitCsz(d.cityStateZip)
  /* Registration keeps city/state/zip in one free-text field, and some records
     have the whole address on the street line instead. When there is no
     city/state/zip of its own, take it off the end of the street line - a
     claim with an empty box 5 city or state is a rejection. */
  if (!csz.city && !csz.state && !csz.zip && addr) {
    var tail = cfSplitCsz(addr)
    var cut = tail.city.lastIndexOf(',')
    // Only when a comma marks where the city starts. Without one there is no
    // telling where the street ends, and a guess would mangle box 5.
    if (tail.state && tail.zip && cut > 0) {
      csz = { city: tail.city.slice(cut + 1).trim(), state: tail.state, zip: tail.zip }
      addr = tail.city.slice(0, cut).trim()
    }
  }
  var sex = String(d.gender || '').toLowerCase()
  return {
    last: d.lastName || '', first: d.firstName || '', mi: (p.claimForm && p.claimForm.patientMi) || '',
    dob: d.dob || '',
    sex: sex === 'male' ? 'M' : (sex === 'female' ? 'F' : ''),
    addr: addr,
    city: csz.city, state: csz.state, zip: csz.zip,
    phone: d.mobile || ''
  }
}

function cfTotalCharge(lines) {
  return (lines || []).reduce(function (t, l) { return t + cfMoney(l.charges) }, 0)
}


/* Same djb2 hash and seed as encounters.js encAcctNo() and registrationlist.js,
   so the account number on the claim is the same number the Encounters and
   Registration pages already show for this patient. Diverging here would put
   two different account numbers on the practice's own paperwork. */
function cfChartAcctNo(p) {
  var stored = p && p.billing && p.billing.accountNo
  if (stored) return String(stored)
  var h = 5381, str = 'acct' + (p ? p.id : '')
  for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return String(1000 + (h % 9000))
}

// Service lines per claim sheet - six on every page, the form's own capacity.
var CF_FIRST_PAGE_LINES = 6
var CF_NEXT_PAGE_LINES = 6

// Box 21 prints ICD-10 without the decimal: S06.0X1A on the chart, S060X1A here.
function cfNoDot(code) {
  var v = String(code || '').trim().toUpperCase()
  /* The chart stores a picked diagnosis as its whole label - "(S06.0X0A)
     Contusion without loss of consciousness, initial encounter". Box 21 prints
     the code ALONE on the issued form, so take it out of the label first. */
  var m = v.match(/\(\s*([A-Z][0-9][0-9A-Z]*(?:\.[0-9A-Z]+)?)\s*\)/)
    || v.match(/^([A-Z][0-9][0-9A-Z]*(?:\.[0-9A-Z]+)?)\b/)
  if (m) v = m[1]
  return v.replace(/\./g, '').trim()
}

/* Service lines from the Billing tab's derived statement - the same groups the
   billing PDF prints, so the claim and the statement can't disagree about what
   was done on which day for how much. */
function cfChartServiceLines(p) {
  var data = null
  try { if (typeof getBillingStatementData === 'function') data = getBillingStatementData(p) } catch (e) { data = null }
  if (!data || !Array.isArray(data.groups)) return []
  var out = []
  data.groups.forEach(function (g, gi) {
    var tag = String(g.id || ('t' + gi))
    ;(g.rows || []).forEach(function (r) {
      var code = String(r.code || '').trim()
      if (!code) return
      var date = r.date || g.date || ''
      out.push({
        from: date, to: date, pos: '', emg: '',
        cpt: code, mods: '',
        pointer: '',
        charges: cfMoneyStr(r.charges),
        units: String(r.qty || 1),
        epsdt: '', idQual: '',
        renderingId: CLAIM_PRACTICE.npi,
        grp: tag, grpNo: gi + 1, grpDate: g.date || date || ''
      })
    })
  })
  return out
}

function cfPageGroups(pageLines) {
  var seen = {}, out = []
  ;(pageLines || []).forEach(function (l) {
    var key = String(l.grp || '')
    if (seen[key]) return
    seen[key] = 1
    out.push({
      key: key,
      no: l.grpNo || 0,
      date: l.grpDate || '',
      label: key
        ? 'Billing Table ' + (l.grpNo || '?') + (l.grpDate ? ' \u00b7 ' + l.grpDate : '')
        : 'Added lines'
    })
  })
  return out
}

function cfPaginate(lines) {
  var all = (lines || []).slice()
  var chunks = []
  if (!all.length) chunks = [[]]
  else {
    chunks.push(all.slice(0, CF_FIRST_PAGE_LINES))
    for (var i = CF_FIRST_PAGE_LINES; i < all.length; i += CF_NEXT_PAGE_LINES) {
      chunks.push(all.slice(i, i + CF_NEXT_PAGE_LINES))
    }
  }
  var seen = {}
  return chunks.map(function (rows) {
    var groups = cfPageGroups(rows)
    // "(continued)" means this page opens with a table an earlier page started.
    var cont = !!(groups.length && groups[0].key && seen[groups[0].key])
    groups.forEach(function (g) { seen[g.key] = 1 })
    return { lines: rows, groups: groups, cont: cont }
  })
}

/* How many lines a page can hold. Two constants rather than one literal so a
   different rule for continuation sheets stays a one-line change. */
function cfPageCap(pageIndex) { return pageIndex === 0 ? CF_FIRST_PAGE_LINES : CF_NEXT_PAGE_LINES }

/* What the divider says above a page's rows. One table gets its own name and
   date; several sharing a page get listed by number, because two or three full
   "Billing Table N \u00b7 date" labels in a row are unreadable. */
function cfPageLabel(pg) {
  var gs = (pg && pg.groups) || []
  if (!gs.length) return ''
  if (gs.length === 1) return gs[0].label + (pg.cont ? ' (continued)' : '')
  return 'Billing Tables ' + gs.map(function (g) { return g.no || '?' }).join(', ')
    + (pg.cont ? ' (continued)' : '')
}

/* Everything the chart can answer, gathered in one place so both the pull and
   the on-screen note about what it will fill read from the same source. */
function cfChartFacts(p) {
  var d = (p && p.demographics) || {}
  var ace = (p && p.ace) || {}
  var ai = (ace.formState && ace.formState.inputs) || {}
  var intake = (p && p.intake) || {}
  var pip = intake.pip || {}
  var consent = intake.consent || {}
  var codes = Array.isArray(ace.diagnosisCodes) ? ace.diagnosisCodes : []
  return {
    acctNo: cfChartAcctNo(p),
    doi: ai.doi || ace.dateOfInjury || d.doi || '',
    dx: codes.map(cfNoDot).filter(Boolean).slice(0, 12),
    provider: String(ai.completedBy || d.provider || '').trim(),
    carrier: String(pip.autoInsuranceCompany || '').trim(),
    policy: String(pip.policyNumber || '').trim(),
    claimNo: String(pip.pipClaimNumber || '').trim(),
    isAuto: String(pip.hasPip || '').toLowerCase() === 'yes' || !!String(pip.autoInsuranceCompany || '').trim(),
    consentAt: consent.signedAt || '',
    state: d.state || '',
    lines: cfChartServiceLines(p)
  }
}

/* Applies the facts to a claim object, filling blanks only. Returns the list of
   boxes it actually filled, which is what the toast reports - a pull that
   silently did nothing is otherwise indistinguishable from a broken button. */
function cfApplyChart(c, f, pv) {
  var filled = []
  var put = function (obj, key, val, label) {
    if (!val) return
    if (String(obj[key] || '').trim()) return
    obj[key] = val
    filled.push(label)
  }

  put(c.carrier, 'name', f.carrier, 'carrier')
  put(c, 'box1a', f.policy || f.claimNo, '1a insured ID')
  if (!c.box1 && f.isAuto) { c.box1 = 'other'; filled.push('1 plan type') }
  if (!c.box6) { c.box6 = 'self'; filled.push('6 relationship') }
  put(c.box11, 'group', f.claimNo, '11 claim/group no.')
  put(c.box11, 'dob', pv.dob, '11a insured DOB')
  put(c.box11, 'sex', pv.sex, '11a insured sex')
  if (!c.box11.another) { c.box11.another = 'no'; filled.push('11d') }
  if (f.isAuto && !c.box10.auto) { c.box10.auto = 'yes'; filled.push('10b auto accident') }
  if (f.isAuto) put(c.box10, 'autoPlace', f.state, '10b place')
  put(c.box12, 'date', f.consentAt ? String(f.consentAt).slice(0, 10) : '', '12 signature date')
  put(c.box14, 'date', f.doi, '14 date of injury')
  if (f.doi && !c.box14.qual) { c.box14.qual = '431'; filled.push('14 qual') }
  if (!c.box20.outside) { c.box20.outside = 'no'; filled.push('20 outside lab') }

  if (f.dx.length && !c.box21.codes.filter(Boolean).length) {
    for (var i = 0; i < 12; i++) c.box21.codes[i] = f.dx[i] || ''
    filled.push(f.dx.length + ' diagnosis code' + (f.dx.length === 1 ? '' : 's'))
  }

  put(c, 'box26', f.acctNo, '26 account no.')
  if (!c.box27) { c.box27 = 'yes'; filled.push('27 assignment') }
  if (!c.box29) { c.box29 = '0.00'; filled.push('29 amount paid') }
  put(c.box31, 'name', f.provider, '31 provider')
  if (f.provider && !c.box31.date) { c.box31.date = cfFmtDate(new Date()); filled.push('31 date') }

  // Service lines come in only when the grid is still empty, so a pull can't
  // duplicate or reorder lines a biller has already worked on.
  var typed = (c.lines || []).filter(function (l) { return String(l.cpt || '').trim() || String(l.charges || '').trim() })
  if (f.lines.length && !typed.length) {
    c.lines = f.lines.map(function (l) { return { from: l.from, to: l.to, pos: l.pos, emg: l.emg, cpt: l.cpt, mods: l.mods, pointer: l.pointer, charges: l.charges, units: l.units, epsdt: l.epsdt, idQual: l.idQual, renderingId: l.renderingId, grp: l.grp || '', grpNo: l.grpNo || 0, grpDate: l.grpDate || '' } })
    filled.push(f.lines.length + ' service line' + (f.lines.length === 1 ? '' : 's'))
  }
  return filled
}

/* ---------- tab body ---------- */
function cfTabHTML(p) {
  var c = cfEnsure(p)
  var pv = cfPatientView(p)
  var autoFilled = cfApplyChart(c, cfChartFacts(p), pv)
  var yn = function (name, cur) {
    return '<div class="cf-yn">'
      + '<label class="plain-check"><input type="radio" name="' + name + '" value="yes"' + (cur === 'yes' ? ' checked' : '') + '> Yes</label>'
      + '<label class="plain-check"><input type="radio" name="' + name + '" value="no"' + (cur === 'no' ? ' checked' : '') + '> No</label>'
      + '<button type="button" class="cf-clear" data-onclick="cfClearRadio(\'' + name + '\')">Clear</button>'
      + '</div>'
  }

  return '<div class="cf-wrap">'

    + (c.demo
        ? '<div class="cf-demo-flag"><b>Demo data loaded.</b> The patient boxes below show a made-up identity ('
          + cfEsc([c.demo.first, c.demo.last].filter(Boolean).join(' '))
          + '), not this patient\'s record — nothing has been written to their chart. Use <b>Clear Demo</b> to go back.</div>'
        : '<div class="cf-note">The patient\'s name, date of birth and sex are filled from their Registration record and shown read-only, so the claim and the chart can\'t disagree. The address prints from Registration as well, but can be corrected for this claim below. Edit the record itself on <a href="#" data-onclick="showPage(\'registration\');return false">Patient Registration</a>.</div>')

    + (autoFilled.length
        ? '<div class="cf-note cf-pulled"><b>Filled in automatically from ' + cfEsc([pv.first, pv.last].filter(Boolean).join(' ') || 'this patient') + '&rsquo;s chart:</b> '
          + cfEsc(autoFilled.join(', '))
          + '. Anything you type over stays typed. Nothing is written to the claim until you press Save Claim.</div>'
        : '')

    /* ---- carrier ---- */
    + cfSection('Carrier', 'Who the claim is being submitted to — printed in the block at the top of the form.')
    + '<div class="g2">'
      + cfText('cfCarrierName', 'Carrier name', c.carrier.name, 'e.g. Injured Workers\' Insurance Fund')
      + cfText('cfCarrierLine1', 'Address line', c.carrier.line1, 'e.g. P.O. Box 9899')
    + '</div>'
    + '<div class="g2">'
      + cfText('cfCarrierLine2', 'City, state, ZIP', c.carrier.line2, 'e.g. Towson, MD 21284-9899')
      + '<div class="fg"></div>'
    + '</div>'

    /* ---- 1 / 1a ---- */
    + cfSection('1–1a · Plan type and insured\'s ID')
    + '<div class="g2">'
      + '<div class="fg"><label>1 · Insurance program</label><select id="cfBox1">'
        + cfOpt('', '— Select —', c.box1) + cfOpt('medicare', 'Medicare', c.box1) + cfOpt('medicaid', 'Medicaid', c.box1)
        + cfOpt('tricare', 'TRICARE', c.box1) + cfOpt('champva', 'CHAMPVA', c.box1) + cfOpt('group', 'Group Health Plan', c.box1)
        + cfOpt('feca', 'FECA Black Lung', c.box1) + cfOpt('other', 'Other', c.box1)
        + '</select></div>'
      + cfText('cfBox1a', '1a · Insured\'s ID number', c.box1a, '')
    + '</div>'

    + cfSection('2, 3 & 5 · Patient', 'Name, birth date and sex come from Registration. The address below prints from Registration too — type in a field only to correct what THIS claim prints.')
    + '<div class="cf-ro">'
      + cfRo('Name (2)', [pv.last, pv.first].filter(Boolean).join(', ') || '—')
      + cfRo('Birth date · sex (3)', (pv.dob || '—') + (pv.sex ? '  ·  ' + pv.sex : ''))
    + '</div>'
    + '<div class="g2">'
      + cfText('cfBox5Addr', '5 · Patient address (No., Street)', c.box5.addr, pv.addr || 'Street address')
      + cfText('cfBox5Phone', '5 · Telephone', c.box5.phone, pv.phone || '(000) 000-0000')
    + '</div>'
    + '<div class="g3">'
      + cfText('cfBox5City', '5 · City', c.box5.city, pv.city || 'City')
      + cfText('cfBox5State', '5 · State', c.box5.state, pv.state || 'State')
      + cfText('cfBox5Zip', '5 · ZIP code', c.box5.zip, pv.zip || 'ZIP code')
    + '</div>'

    /* ---- 4 / 6 / 7 ---- */
    + cfSection('4, 6 & 7 · Insured', 'Leave the insured\'s name blank to print the patient\'s own name — the usual case when the patient is the insured.')
    + '<div class="g3">'
      + cfText('cfBox4Last', '4 · Insured last name', c.box4.last, 'blank = same as patient')
      + cfText('cfBox4First', '4 · First name', c.box4.first, '')
      + cfText('cfBox4Mi', '4 · MI', c.box4.mi, '')
    + '</div>'
    + '<div class="g2">'
      + '<div class="fg"><label>6 · Patient relationship to insured</label><select id="cfBox6">'
        + cfOpt('', '— Select —', c.box6) + cfOpt('self', 'Self', c.box6) + cfOpt('spouse', 'Spouse', c.box6)
        + cfOpt('child', 'Child', c.box6) + cfOpt('other', 'Other', c.box6)
        + '</select></div>'
      + cfText('cfBox7Addr', '7 · Insured address', c.box7.addr, 'blank = same as patient')
    + '</div>'
    + '<div class="g4">'
      + cfText('cfBox7City', 'City', c.box7.city, '')
      + cfText('cfBox7State', 'State', c.box7.state, '')
      + cfText('cfBox7Zip', 'ZIP', c.box7.zip, '')
      + cfText('cfBox7Phone', 'Telephone', c.box7.phone, '')
    + '</div>'

    /* ---- 9 ---- */
    + cfSection('9 · Other insured', 'Only when a second policy is involved.')
    + '<div class="g3">'
      + cfText('cfBox9Name', '9 · Other insured\'s name', c.box9.name, '')
      + cfText('cfBox9Policy', '9a · Policy or group number', c.box9.policy, '')
      + cfText('cfBox9Plan', '9d · Insurance plan name', c.box9.planName, '')
    + '</div>'

    /* ---- 10 ---- */
    + cfSection('10 · Is the condition related to…')
    + '<div class="g3">'
      + '<div class="fg"><label>10a · Employment (current or previous)</label>' + yn('cfBox10a', c.box10.employment) + '</div>'
      + '<div class="fg"><label>10b · Auto accident</label>' + yn('cfBox10b', c.box10.auto) + '</div>'
      + '<div class="fg"><label>10c · Other accident</label>' + yn('cfBox10c', c.box10.other) + '</div>'
    + '</div>'
    + '<div class="g2">'
      + cfText('cfBox10bPlace', '10b · Place (state)', c.box10.autoPlace, 'e.g. MD')
      + cfText('cfBox10dCodes', '10d · Claim codes', c.box10.codes, '')
    + '</div>'

    /* ---- 11 ---- */
    + cfSection('11 · Insured\'s policy')
    + '<div class="g3">'
      + cfText('cfBox11Group', '11 · Policy group or FECA number', c.box11.group, '')
      + cfDate('cfBox11Dob', '11a · Insured\'s date of birth', c.box11.dob)
      + '<div class="fg"><label>11a · Sex</label><select id="cfBox11Sex">'
        + cfOpt('', '—', c.box11.sex) + cfOpt('M', 'M', c.box11.sex) + cfOpt('F', 'F', c.box11.sex) + '</select></div>'
    + '</div>'
    + '<div class="g3">'
      + cfText('cfBox11b', '11b · Other claim ID', c.box11.otherClaimId, '')
      + cfText('cfBox11c', '11c · Insurance plan or program name', c.box11.planName, '')
      + '<div class="fg"><label>11d · Another health benefit plan?</label>' + yn('cfBox11d', c.box11.another) + '</div>'
    + '</div>'

    /* ---- 12 / 13 ---- */
    + cfSection('12 & 13 · Signatures')
    + '<div class="g3">'
      + cfText('cfBox12Sig', '12 · Patient\'s signature', c.box12.signature, 'Signature On File')
      + cfDate('cfBox12Date', '12 · Date', c.box12.date)
      + cfText('cfBox13Sig', '13 · Insured\'s signature', c.box13.signature, 'Signature On File')
    + '</div>'

    /* ---- 14 - 18 ---- */
    + cfSection('14–18 · Dates and referral')
    + '<div class="g3">'
      + cfDate('cfBox14Date', '14 · Date of current illness or injury', c.box14.date)
      + cfText('cfBox14Qual', '14 · Qualifier', c.box14.qual, 'e.g. 431')
      + cfText('cfBox15Qual', '15 · Other date qualifier', c.box15.qual, '')
    + '</div>'
    + '<div class="g3">'
      + cfDate('cfBox15Date', '15 · Other date', c.box15.date)
      + cfDate('cfBox16From', '16 · Unable to work from', c.box16.from)
      + cfDate('cfBox16To', '16 · Unable to work to', c.box16.to)
    + '</div>'
    + '<div class="g4">'
      + cfText('cfBox17Name', '17 · Referring provider', c.box17.name, '')
      + cfText('cfBox17Qual', '17 · Qualifier', c.box17.qual, 'DN / DK / DQ')
      + cfText('cfBox17Other', '17a · Other ID', c.box17.otherId, '')
      + cfText('cfBox17Npi', '17b · NPI', c.box17.npi, '')
    + '</div>'
    + '<div class="g2">'
      + cfDate('cfBox18From', '18 · Hospitalization from', c.box18.from)
      + cfDate('cfBox18To', '18 · Hospitalization to', c.box18.to)
    + '</div>'

    /* ---- 19 - 23 ---- */
    + cfSection('19–23 · Claim information')
    + '<div class="fg"><label>19 · Additional claim information</label><input type="text" id="cfBox19" value="' + cfEsc(c.box19) + '"></div>'
    + '<div class="g3">'
      + '<div class="fg"><label>20 · Outside lab?</label>' + yn('cfBox20', c.box20.outside) + '</div>'
      + cfText('cfBox20Charges', '20 · Charges', c.box20.charges, '')
      + cfText('cfBox21Ind', '21 · ICD indicator', c.box21.icdInd, '0 = ICD-10')
    + '</div>'
    + '<div class="fg"><label>21 · Diagnosis codes (A–L)</label><div class="cf-dx">'
      + c.box21.codes.map(function (code, i) {
          return '<div class="cf-dx-cell"><span>' + String.fromCharCode(65 + i) + '</span>'
            + '<input type="text" id="cfDx' + i + '" value="' + cfEsc(code) + '" placeholder="' + (i === 0 ? 'S060X1A' : '') + '"></div>'
        }).join('')
      + '</div></div>'
    + '<div class="g3">'
      + cfText('cfBox22Code', '22 · Resubmission code', c.box22.code, '')
      + cfText('cfBox22Ref', '22 · Original reference no.', c.box22.originalRef, '')
      + cfText('cfBox23', '23 · Prior authorization number', c.box23, '')
    + '</div>'

    /* ---- 24 service lines ---- */
    + cfSection('24 · Services', 'Pulled from the patient\'s Billing tables. Six service lines print per claim page — the dividers below show where each sheet breaks and which Billing tables land on it.')
    + '<div class="cf-lines-scroll"><table class="cf-lines" id="cfLines"><thead><tr>'
      + '<th></th>'
      + cfTh('24A', 'Date from', 'First date of service on this line')
      + cfTh('24A', 'Date to', 'Last date of service on this line')
      + cfTh('24B', 'Place of service', 'Place of service code \u2014 11 is Office')
      + cfTh('24C', 'Emergency', 'Emergency indicator \u2014 Y or N')
      + cfTh('24D', 'Procedure code', 'The CPT or HCPCS code billed')
      + cfTh('24D', 'Modifiers', 'Modifiers for the procedure, e.g. 59 GP')
      + cfTh('24E', 'Diagnosis pointer', 'Which diagnosis in box 21 this service relates to \u2014 A to L')
      + cfTh('24F', 'Charges', 'Amount charged for this line')
      + cfTh('24G', 'Days or units', 'Days or units billed')
      + cfTh('24J', 'Rendering provider NPI', 'NPI of the provider who performed the service')
      + '<th></th>'
      + '</tr></thead><tbody id="cfLinesBody">' + cfLinesHTML(c.lines) + '</tbody></table></div>'
    + '<div class="cf-lines-foot">'
      + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="cfAddLine()">Add service line</button>'
      + '<span class="cf-total">Total charge <b id="cfTotalPreview">$' + cfMoneyStr(cfTotalCharge(c.lines)) + '</b></span>'
    + '</div>'

    /* ---- 25 - 33 ---- */
    + cfSection('25–33 · Billing', 'Boxes 32 and 33 print the practice\'s own details and are not asked here.')
    + '<div class="g3">'
      + cfText('cfBox26', '26 · Patient account no.', c.box26, '')
      + '<div class="fg"><label>27 · Accept assignment?</label>' + yn('cfBox27', c.box27) + '</div>'
      + cfText('cfBox29', '29 · Amount paid', c.box29, '0.00')
    + '</div>'
    + '<div class="g3">'
      + cfText('cfBox31Name', '31 · Signature of physician or supplier', c.box31.name, 'e.g. Nicholas A. Grande')
      + cfDate('cfBox31Date', '31 · Date', c.box31.date)
      + cfRo('28 · Total charge', '$' + cfMoneyStr(cfTotalCharge(c.lines)))
    + '</div>'

    + '<div class="cf-actions">'
      + '<button type="button" class="btn btn-primary" data-onclick="cfSave()">Save Claim</button>'
      + '<button type="button" class="btn btn-primary" data-onclick="cfDownloadPdf()">Save &amp; Download PDF</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="cfPrint()">Print preview</button>'
      + '<button type="button" class="btn btn-ghost" data-onclick="cfLoadDemo()">Load Demo</button>'
      + (c.demo ? '<button type="button" class="btn btn-ghost" data-onclick="cfClearDemo()">Clear Demo</button>' : '')
      + '<span class="cf-saved" id="cfSavedAt">' + (c.updatedAt ? 'Last saved ' + cfEsc(new Date(c.updatedAt).toLocaleString()) : '') + '</span>'
    + '</div>'
  + '</div>'
}

function cfSection(title, sub) {
  return '<div class="cf-sec"><div class="cf-sec-t">' + cfEsc(title) + '</div>'
    + (sub ? '<div class="cf-sec-s">' + cfEsc(sub) + '</div>' : '') + '</div>'
}
function cfText(id, label, v, ph) {
  return '<div class="fg"><label for="' + id + '">' + cfEsc(label) + '</label>'
    + '<input type="text" id="' + id + '" value="' + cfEsc(v) + '"' + (ph ? ' placeholder="' + cfEsc(ph) + '"' : '') + '></div>'
}
function cfDate(id, label, v) {
  return '<div class="fg"><label for="' + id + '">' + cfEsc(label) + '</label>'
    + '<input type="date" id="' + id + '" value="' + cfEsc(cfToIso(v)) + '"></div>'
}
function cfRo(label, v) {
  return '<div class="cf-ro-item"><span>' + cfEsc(label) + '</span><b>' + cfEsc(v) + '</b></div>'
}
function cfToIso(v) {
  var d = cfDateParts(v)
  return (d.yy && d.mm && d.dd) ? d.yy + '-' + d.mm + '-' + d.dd : ''
}

/* One row per service line, plus a divider before each claim page so the
   biller sees on screen exactly where the printed form will break. The index
   on each row is its position in c.lines - pagination only groups, never
   reorders - so cfRemoveLine and cfReadLines keep working off it. */
/* A column heading: the CMS-1500 box letter above the full name, with the
   explanation on hover. The abbreviations the form itself prints (POS, EMG,
   DX PTR) mean nothing to anyone who is not looking at the paper form. */
function cfTh(box, name, tip) {
  return '<th title="' + cfEsc(tip) + '"><span class="cf-th-b">' + cfEsc(box) + '</span>' + cfEsc(name) + '</th>'
}

function cfLinesHTML(lines) {
  var pages = cfPaginate(lines)
  var tagged = (lines || []).some(function (l) { return !!l.grp })
  if (!tagged && pages.length < 2) return cfLineRowsHTML(lines, 0)
  var out = '', n = 0
  pages.forEach(function (pg, pi) {
    out += '<tr class="cf-grp"><td colspan="12">'
      + '<b>Claim page ' + (pi + 1) + '</b>'
      + (cfPageLabel(pg) ? '<span>' + cfEsc(cfPageLabel(pg)) + '</span>' : '')
      + '<i>' + pg.lines.length + ' of ' + cfPageCap(pi) + ' lines</i></td></tr>'
    out += cfLineRowsHTML(pg.lines, n)
    n += pg.lines.length
  })
  return out
}

function cfLineRowsHTML(lines, start) {
  return lines.map(function (l, k) {
    var i = start + k
    return '<tr data-i="' + i + '" data-grp="' + cfEsc(l.grp || '') + '"'
      + ' data-grpno="' + cfEsc(l.grpNo || '') + '" data-grpdate="' + cfEsc(l.grpDate || '') + '">'
      + '<td class="cf-ln">' + (i + 1) + '</td>'
      + '<td><input type="date" class="cf-i" id="cfL' + i + 'From" value="' + cfEsc(cfToIso(l.from)) + '"></td>'
      + '<td><input type="date" class="cf-i" id="cfL' + i + 'To" value="' + cfEsc(cfToIso(l.to)) + '"></td>'
      + '<td><input type="text" class="cf-i cf-xs" id="cfL' + i + 'Pos" value="' + cfEsc(l.pos) + '"></td>'
      + '<td><input type="text" class="cf-i cf-xs" id="cfL' + i + 'Emg" value="' + cfEsc(l.emg) + '"></td>'
      + '<td><input type="text" class="cf-i cf-sm" id="cfL' + i + 'Cpt" value="' + cfEsc(l.cpt) + '" placeholder="97110"></td>'
      + '<td><input type="text" class="cf-i cf-sm" id="cfL' + i + 'Mods" value="' + cfEsc(l.mods) + '" placeholder="59 GP"></td>'
      + '<td><input type="text" class="cf-i cf-xs" id="cfL' + i + 'Ptr" value="' + cfEsc(l.pointer) + '"></td>'
      + '<td><input type="text" class="cf-i cf-sm" id="cfL' + i + 'Chg" value="' + cfEsc(l.charges) + '" data-oninput="cfRecalc()" placeholder="135.00"></td>'
      + '<td><input type="text" class="cf-i cf-xs" id="cfL' + i + 'Units" value="' + cfEsc(l.units) + '"></td>'
      + '<td><input type="text" class="cf-i" id="cfL' + i + 'Npi" value="' + cfEsc(l.renderingId) + '" placeholder="' + cfEsc(CLAIM_PRACTICE.npi) + '"></td>'
      + '<td><button type="button" class="cf-del" data-onclick="cfRemoveLine(' + i + ')" aria-label="Remove line ' + (i + 1) + '">&times;</button></td>'
      + '</tr>'
  }).join('')
}

/* ---------- reading the form ---------- */
function cfReadLines() {
  // tr[data-i] only: the claim-page dividers are rows too, and they carry no
  // fields to read.
  var rows = document.querySelectorAll('#cfLinesBody tr[data-i]')
  var out = []
  Array.prototype.forEach.call(rows, function (tr) {
    var i = tr.getAttribute('data-i')
    out.push({
      from: cfVal('cfL' + i + 'From'), to: cfVal('cfL' + i + 'To'),
      pos: cfVal('cfL' + i + 'Pos'), emg: cfVal('cfL' + i + 'Emg'),
      cpt: cfVal('cfL' + i + 'Cpt'), mods: cfVal('cfL' + i + 'Mods'),
      pointer: cfVal('cfL' + i + 'Ptr'), charges: cfVal('cfL' + i + 'Chg'),
      units: cfVal('cfL' + i + 'Units'), epsdt: '', idQual: '',
      renderingId: cfVal('cfL' + i + 'Npi'),
      grp: tr.getAttribute('data-grp') || '',
      grpNo: Number(tr.getAttribute('data-grpno') || 0) || 0,
      grpDate: tr.getAttribute('data-grpdate') || ''
    })
  })
  return out.length ? out : [cfBlankLine()]
}

function cfReadForm() {
  var dx = []
  for (var i = 0; i < 12; i++) dx.push(cfVal('cfDx' + i))
  return {
    carrier: { name: cfVal('cfCarrierName'), line1: cfVal('cfCarrierLine1'), line2: cfVal('cfCarrierLine2') },
    box1: cfVal('cfBox1'), box1a: cfVal('cfBox1a'),
    box4: { last: cfVal('cfBox4Last'), first: cfVal('cfBox4First'), mi: cfVal('cfBox4Mi') },
    box5: { addr: cfVal('cfBox5Addr'), city: cfVal('cfBox5City'), state: cfVal('cfBox5State'), zip: cfVal('cfBox5Zip'), phone: cfVal('cfBox5Phone') },
    box6: cfVal('cfBox6'),
    box7: { addr: cfVal('cfBox7Addr'), city: cfVal('cfBox7City'), state: cfVal('cfBox7State'), zip: cfVal('cfBox7Zip'), phone: cfVal('cfBox7Phone') },
    box9: { name: cfVal('cfBox9Name'), policy: cfVal('cfBox9Policy'), planName: cfVal('cfBox9Plan') },
    box10: { employment: cfChecked('cfBox10a'), auto: cfChecked('cfBox10b'), autoPlace: cfVal('cfBox10bPlace'), other: cfChecked('cfBox10c'), codes: cfVal('cfBox10dCodes') },
    box11: { group: cfVal('cfBox11Group'), dob: cfVal('cfBox11Dob'), sex: cfVal('cfBox11Sex'), otherClaimId: cfVal('cfBox11b'), planName: cfVal('cfBox11c'), another: cfChecked('cfBox11d') },
    box12: { signature: cfVal('cfBox12Sig'), date: cfVal('cfBox12Date') },
    box13: { signature: cfVal('cfBox13Sig') },
    box14: { date: cfVal('cfBox14Date'), qual: cfVal('cfBox14Qual') },
    box15: { qual: cfVal('cfBox15Qual'), date: cfVal('cfBox15Date') },
    box16: { from: cfVal('cfBox16From'), to: cfVal('cfBox16To') },
    box17: { name: cfVal('cfBox17Name'), qual: cfVal('cfBox17Qual'), otherId: cfVal('cfBox17Other'), npi: cfVal('cfBox17Npi') },
    box18: { from: cfVal('cfBox18From'), to: cfVal('cfBox18To') },
    box19: cfVal('cfBox19'),
    box20: { outside: cfChecked('cfBox20'), charges: cfVal('cfBox20Charges') },
    box21: { icdInd: cfVal('cfBox21Ind'), codes: dx },
    box22: { code: cfVal('cfBox22Code'), originalRef: cfVal('cfBox22Ref') },
    box23: cfVal('cfBox23'),
    lines: cfReadLines(),
    box26: cfVal('cfBox26'), box27: cfChecked('cfBox27'), box29: cfVal('cfBox29'), box30: '',
    box31: { name: cfVal('cfBox31Name'), date: cfVal('cfBox31Date') },
    box32: { name: '', addr: '', suite: '', cityStateZip: '', npi: '', otherId: '' }
  }
}

/* ---------- actions ---------- */
function cfCurrentPatient() {
  var id = (typeof intakeSelectedPatientId !== 'undefined') ? intakeSelectedPatientId : null
  return id ? getPatient(id) : null
}
function cfClearRadio(name) {
  Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function (r) { r.checked = false })
}
function cfRecalc() {
  var el = document.getElementById('cfTotalPreview')
  if (el) el.textContent = '$' + cfMoneyStr(cfTotalCharge(cfReadLines()))
}
function cfAddLine() {
  var p = cfCurrentPatient(); if (!p) return
  var c = cfEnsure(p)
  c.lines = cfReadLines()
  c.lines.push(cfBlankLine())
  var body = document.getElementById('cfLinesBody')
  if (body) { body.innerHTML = cfLinesHTML(c.lines); cfRecalc() }
}
function cfRemoveLine(i) {
  var p = cfCurrentPatient(); if (!p) return
  var c = cfEnsure(p)
  var lines = cfReadLines()
  if (lines.length <= 1) { showToast('A claim needs at least one service line', 'err'); return }
  lines.splice(i, 1)
  c.lines = lines
  var body = document.getElementById('cfLinesBody')
  if (body) { body.innerHTML = cfLinesHTML(c.lines); cfRecalc() }
}
/* Save Claim. Writes through its own route (PUT /api/patients/:id/claim-form):
   the claim used to live only in the page and was gone at the next reload.
   forExport: called by Print / Download, which go ahead on the screen's claim
   even when it is a demo, but a demo is never stored on the patient. */
function cfSave(forExport) {
  var p = cfCurrentPatient()
  if (!p) { showToast('Select a patient first', 'err'); return false }
  if (cfEnsure(p).demo) {
    if (!forExport) showToast('A demo claim is loaded. Use Clear Demo before saving - demo data is never saved to a patient.', 'err')
    return !!forExport
  }
  var form = cfReadForm()
  form.updatedAt = new Date().toISOString()
  p.claimForm = form
  var stamp = document.getElementById('cfSavedAt')
  if (typeof window.ctgApiFetch !== 'function') { showToast('Could not save the claim: not connected', 'err'); return true }
  window.ctgApiFetch('/api/patients/' + encodeURIComponent(p.id) + '/claim-form', { method: 'PUT', body: JSON.stringify({ claimForm: form }) })
    .then(function () {
      if (stamp) stamp.textContent = 'Last saved ' + new Date(form.updatedAt).toLocaleString()
      if (!forExport) showToast('Claim form saved', 'ok')
    })
    .catch(function (e) {
      showToast('The claim was NOT saved: ' + ((e && e.message) || 'the server did not answer') + '. Try Save Claim again.', 'err')
    })
  return true
}

/* ---------- printable facsimile ---------- */
/* Printed from a hidden frame in this page. It used to open a new window and
   print from it: that window's print dialog paused this page too and could
   open behind it, so the portal looked stopped, and a pop-up blocker could
   stop it altogether. */
function cfPrint() {
  var p = cfCurrentPatient()
  if (!p) { showToast('Select a patient first', 'err'); return }
  cfSave(true)
  Array.prototype.forEach.call(document.querySelectorAll('iframe[data-cf-print]'), function (f) { f.parentNode.removeChild(f) })
  var frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('data-cf-print', '1')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:850px;height:1120px;border:0'
  var started = false
  frame.onload = function () {
    // The frame's first, empty page loads too; wait for the claim itself.
    var doc = frame.contentDocument
    if (started || !doc || !doc.querySelector('.pg')) return
    started = true
    // The frame shares the page's security policy but not csp-styles.js.
    if (typeof ctgApplyCs === 'function') ctgApplyCs(doc)
    if (typeof ctgAuditExport === 'function') ctgAuditExport(p.id, 'claim_form', 'print')
    var win = frame.contentWindow
    win.addEventListener('afterprint', function () { setTimeout(function () { if (frame.parentNode) frame.parentNode.removeChild(frame) }, 0) })
    // A moment for the QR image and fonts, as the PDF download allows.
    setTimeout(function () {
      try { win.focus(); win.print() } catch (e) { showToast('Could not open the print preview: ' + e.message, 'err') }
    }, 250)
  }
  document.body.appendChild(frame)
  frame.srcdoc = cfRenderClaimHTML(p, cfEnsure(p))
}

function cfLoadScript(src, ok, fail) {
  var el = document.createElement('script')
  el.src = src
  el.onload = ok
  el.onerror = fail
  document.head.appendChild(el)
}

function cfPdfLibs(cb, fail) {
  var needCanvas = !window.html2canvas
  var needPdf = !(window.jspdf && window.jspdf.jsPDF)
  var pending = (needCanvas ? 1 : 0) + (needPdf ? 1 : 0)
  if (!pending) { cb(); return }
  var done = function () { if (--pending <= 0) cb() }
  if (needPdf) cfLoadScript('vendor/jspdf.umd.min.js', done, fail)
  if (needCanvas) cfLoadScript('vendor/html2canvas.min.js', done, fail)
}

function cfPdfName(pv) {
  var who = [pv.last, pv.first].filter(Boolean).join('_').replace(/[^A-Za-z0-9_]+/g, '') || 'Patient'
  return 'CMS1500_' + who + '_' + new Date().toISOString().slice(0, 10) + '.pdf'
}

function cfDownloadPdf() {
  var p = cfCurrentPatient()
  if (!p) { showToast('Select a patient first', 'err'); return }
  if (cfSave(true) === false) return
  var c = cfEnsure(p)
  var pv = cfPatientView(p)
  var html = cfRenderClaimHTML(p, c)
  var btn = document.querySelector('.cf-actions .btn-primary + .btn-primary')
  if (btn) { btn.disabled = true; btn.textContent = 'Building PDF\u2026' }
  var restore = function () { if (btn) { btn.disabled = false; btn.innerHTML = 'Save &amp; Download PDF' } }

  cfPdfLibs(function () {
    var frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:850px;height:1120px;border:0;opacity:0'
    document.body.appendChild(frame)
    var cleanup = function () { try { document.body.removeChild(frame) } catch (e) {} restore() }

    frame.onload = function () {
      var doc = frame.contentDocument
      var pages = doc.querySelectorAll('.pg')
      if (!pages.length) { cleanup(); showToast('Nothing to export', 'err'); return }
      // The frame shares the page's security policy but not csp-styles.js:
      // without this the claim's own layout styles (box 12's date, box 14's
      // qualifier) were dropped from the PDF.
      if (typeof ctgApplyCs === 'function') ctgApplyCs(doc)
      var pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
      var i = 0
      var next = function () {
        if (i >= pages.length) {
          pdf.save(cfPdfName(pv))
          cleanup()
          showToast('CMS-1500 downloaded \u2713', 'ok')
          return
        }
        window.html2canvas(pages[i], {
          scale: 2, backgroundColor: '#ffffff', logging: false,
          width: 816, height: 1056, windowWidth: 850, windowHeight: 1120
        }).then(function (canvas) {
          if (i) pdf.addPage('letter', 'portrait')
          // 8.5in x 11in at 72pt/in - the sheet fills the page exactly.
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 612, 792, undefined, 'FAST')
          i++
          next()
        })['catch'](function () {
          cleanup()
          showToast('Could not build the PDF \u2014 use Print preview instead', 'err')
        })
      }
      // Let the QR data-URI and web fonts settle before the first capture.
      setTimeout(next, 250)
    }
    frame.srcdoc = html
  }, function () {
    restore()
    showToast('Could not load the PDF library \u2014 use Print preview instead', 'err')
  })
}

function cfRenderClaimHTML(p, c) {
  var pv = cfPatientView(p)
  // Pages follow the Billing tables (see cfPaginate), not a blind count of six.
  var pages = cfPaginate(c.lines || [])

  var title = 'CMS-1500 — ' + [pv.last, pv.first].filter(Boolean).join(', ')
  var body = pages.map(function (pg, idx) {
    return cfClaimPage(p, c, pv, pg.lines, idx, pages.length)
  }).join('')

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + cfEsc(title) + '</title>'
    /* A stylesheet file, not an inline <style> block: the print window and the
       PDF frame inherit the portal's security policy, which forbids inline
       style blocks. The absolute URL works in both (about:blank and srcdoc). */
    + '<link rel="stylesheet" href="' + new URL('claimform-print.css', location.href).href + '?v=20260930a">'
    + '</head><body>' + body + '</body></html>'
}

var CLAIM_QR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPMAAADzAQAAAAB7jR2SAAABl0lEQVR42u2ZsW3rQBBEZ0wBVEZ1QHfwSzh18EsS3RnZySn8wQekjAQoPQckIduBfXbqveh4kw12Z2eW0noa0CnXoJTr+/aqJ31+fjsuJQByA5Al0au+CwC64O9r/Gq7k27WSwKUsiQN9lPw8x4/DbZ9bMeon5/g7lqA/rwPfkrxndQg6bx8TntJ7YiUCH6K5sM2X2fRtWMV8/V9fbHdbm87dXs9R319gft4tW0fKkyuJ9O3I7Zjfhb1J8Bdai8VkOtZwGiU4K5TDv1KjKaTKnTijfNQdY/6KcAH7zEwWVINC6FKzI58UDAfhr//9tL5zwUvDTs855s1HP7vgp8P+sUowZLiL1XoVwl/fTMasiqklvnhP0LfyvGXxGTI024ryHRR6Nu6DoJOzSypHSsegcAQ/VmibwDMYs3vqoFeCv5K8sF6DhVm8E5KWcsoxX4O/tb9rW6WVM/ycdP/2N8W5YOLpFNu5tV50Ac/39qvPbYeaq+WEtNeUhP+9vt4PWtLWeE/Pv6fWvI75NC3H+1vV/+WAIKfMvwVzk8MzcVcAB8AAAAASUVORK5CYII='
function cfQrTag() { return '<img class="qr" alt="" src="' + CLAIM_QR_PNG + '">' }

/* One of box 1's seven plan columns. The name may carry a <br> - GROUP HEALTH
   PLAN and FECA BLK LUNG print on two lines on the issued form - so it is not
   escaped here; every caller passes a literal. */
function cfB1(name, sub, on, w) {
  return '<div class="b1c" data-cs="'+__cs+'flex:0 0 ' + w + '"><span class="cap">' + name + '</span>'
    + '<div class="b1k">' + cfChk(on) + '<i>' + sub + '</i></div></div>'
}

function cfChk(on) { return on ? '<span class="chk on"><span class="chk-x">X</span></span>' : '<span class="chk"></span>' }

/* One claim page: this page's six service lines and this page's own Box 28
   total, which is how a claim of more than six lines is actually filed. */
function cfClaimPage(p, c, pv, pageLines, idx, total) {
  var insuredName = (c.box4.last || c.box4.first)
    ? [c.box4.last, c.box4.first, c.box4.mi].filter(Boolean).join(', ')
    : [pv.last, pv.first].filter(Boolean).join(', ')
  var ptAddr = c.box5.addr || pv.addr
  var ptCity = c.box5.city || pv.city
  var ptState = c.box5.state || pv.state
  var ptZip = c.box5.zip || pv.zip
  var ptPhone = c.box5.phone || pv.phone
  var insAddr = c.box7.addr || ptAddr
  var insCity = c.box7.city || ptCity
  var insState = c.box7.state || ptState
  var insZip = c.box7.zip || ptZip
  var insPhone = c.box7.phone || ptPhone
  var dob = cfDateParts(pv.dob)
  var idob = cfDateParts(c.box11.dob)
  var pageTotal = cfTotalCharge(pageLines)
  var patName = [pv.last, pv.first].filter(Boolean).join(', ')

  // Six service lines, each a shaded supplemental band over a data line.
  var svcRows = ''
  for (var i = 0; i < 6; i++) {
    var l = pageLines[i]
    var f = l ? cfDateParts(l.from) : null
    var t = l ? cfDateParts(l.to) : null
    var mods = (l && l.mods) ? String(l.mods).split(/\s+/) : []
    var cellTop = '<div class="shade"></div>'
    var d = function (txt, cls) {
      return '<div class="dline' + (cls ? ' ' + cls : '') + '">' + txt + '</div>'
    }
    svcRows += '<tr class="svcrow">'
      + '<td class="n">' + (i + 1) + '</td>'
      // 24A holds "MM DD YY", as the form's heading says; a full year did not
      // fit the column and printed as "08 03 202".
      + '<td>' + cellTop + d(f && f.mm ? f.mm + '&nbsp;' + f.dd + '&nbsp;' + String(f.yy).slice(-2) : '&nbsp;') + '</td>'
      + '<td>' + cellTop + d(t && t.mm ? t.mm + '&nbsp;' + t.dd + '&nbsp;' + String(t.yy).slice(-2) : '&nbsp;') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.pos : '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.emg : '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.cpt : '') || '&nbsp;') + '</td>'
      + '<td>' + cellTop + d(cfEsc(mods[0] || '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(cfEsc(mods[1] || '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.pointer : '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(l && l.charges ? cfMoneyStr(l.charges) : '&nbsp;', 'r') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.units : '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d('&nbsp;', 'c') + '</td>'
      + '<td>' + cellTop + d(cfEsc(l ? l.idQual : '') || '&nbsp;', 'c') + '</td>'
      + '<td>' + '<div class="shade"></div>' + d('<span class="npil">NPI</span> ' + cfEsc(l ? l.renderingId : '')) + '</td>'
      + '</tr>'
  }

  // Diagnosis A-L, four to a row, as ruled blanks like the printed form.
  var dxCells = ''
  for (var k = 0; k < 12; k++) {
    dxCells += '<div class="dxc"><span>' + String.fromCharCode(65 + k) + '.</span><u>'
      + cfEsc(c.box21.codes[k] || '') + '</u></div>'
  }

  var h = '<div class="pg">'
  if (total > 1) h += '<div class="pgno">Claim page ' + (idx + 1) + ' of ' + total + '</div>'

  // rotated labels down the right edge
  h += '<div class="edge">'
    + '<b data-cs="'+__cs+'top:.30in">CARRIER</b>'
    + '<b data-cs="'+__cs+'top:1.15in">PATIENT AND INSURED INFORMATION</b>'
    + '<b data-cs="'+__cs+'top:5.30in">PHYSICIAN OR SUPPLIER INFORMATION</b>'
    + '</div>'
  h += '<div class="fold" data-cs="'+__cs+'top:2.6in">SECOND FOLD</div>'
    + '<div class="fold" data-cs="'+__cs+'top:5.9in">FIRST FOLD</div>'

  /* QR on top, form title underneath it - stacked, not side by side. */
  h += '<div class="hdr">'
    + '<div class="hdr-l">' + cfQrTag()
    + '<div class="hdr-mid"><div class="ttl">HEALTH INSURANCE CLAIM FORM</div>'
    + '<div class="ttl-s">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12</div></div></div>'
    + '<div class="carrier">' + cfEsc(c.carrier.name) + '<br>' + cfEsc(c.carrier.line1) + '<br>' + cfEsc(c.carrier.line2) + '</div>'
    + '</div>'
    + '<div class="pica"><span><i></i><i></i><i class="end"></i><b>PICA</b></span><span><b>PICA</b><i></i><i></i><i class="end"></i></span></div>'
    + '<div class="band"></div>'

  h += '<div class="grid">'

  // 1 / 1a
  h += '<div class="row" data-cs="'+__cs+'min-height:.4in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 58%"><span class="cap b1n">1.</span>'
    /* Seven columns, each programme sitting directly above its own box - the
       way the issued form reads. A single caption line with a row of boxes
       underneath lines nothing up with anything. */
    + '<div class="b1">'
      + cfB1('Medicare', '(Medicare#)', c.box1 === 'medicare', '15%')
      + cfB1('Medicaid', '(Medicaid#)', c.box1 === 'medicaid', '15%')
      + cfB1('TRICARE', '(ID#/DoD#)', c.box1 === 'tricare', '14.5%')
      + cfB1('CHAMPVA', '(Member ID#)', c.box1 === 'champva', '16.5%')
      + cfB1('Group<br>Health Plan', '(ID#)', c.box1 === 'group', '14%')
      + cfB1('FECA<br>Blk Lung', '(ID#)', c.box1 === 'feca', '13%')
      + cfB1('Other', '(ID#)', c.box1 === 'other', '12%')
    + '</div></div>'
    + '<div class="cell last"><span class="cap"><i>1a.</i> Insured&rsquo;s I.D. Number &nbsp; <i>(For Program in Item 1)</i></span><div class="v">' + cfEsc(c.box1a) + '</div></div>'
    + '</div>'

  // 2 / 3 / 4
  h += '<div class="row" data-cs="'+__cs+'min-height:.33in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 34%"><span class="cap">2. Patient&rsquo;s Name <i>(Last Name, First Name, Middle Initial)</i></span><div class="v">' + cfEsc(patName) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 24%"><span class="cap">3. Patient&rsquo;s Birth Date &nbsp;&nbsp; MM &nbsp; DD &nbsp; YY &nbsp;&nbsp; Sex</span>'
    + '<div class="v">' + (dob.mm ? dob.mm + '&nbsp;' + dob.dd + '&nbsp;' + dob.yy : '') + ' &nbsp;M' + cfChk(pv.sex === 'M') + ' F' + cfChk(pv.sex === 'F') + '</div></div>'
    + '<div class="cell last"><span class="cap">4. Insured&rsquo;s Name <i>(Last Name, First Name, Middle Initial)</i></span><div class="v">' + cfEsc(insuredName) + '</div></div>'
    + '</div>'

  // 5 / 6 / 7
  h += '<div class="row" data-cs="'+__cs+'min-height:.33in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 34%"><span class="cap">5. Patient&rsquo;s Address <i>(No., Street)</i></span><div class="v">' + cfEsc(ptAddr) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 24%"><span class="cap">6. Patient Relationship to Insured</span>'
    + '<div class="v sm">Self' + cfChk(c.box6 === 'self') + ' Spouse' + cfChk(c.box6 === 'spouse') + ' Child' + cfChk(c.box6 === 'child') + ' Other' + cfChk(c.box6 === 'other') + '</div></div>'
    + '<div class="cell last"><span class="cap">7. Insured&rsquo;s Address <i>(No., Street)</i></span><div class="v">' + cfEsc(insAddr) + '</div></div>'
    + '</div>'

  h += '<div class="row" data-cs="'+__cs+'min-height:.6in">'
    + '<div class="col" data-cs="'+__cs+'flex:0 0 34%">'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in">'
        + '<div class="cell" data-cs="'+__cs+'flex:0 0 76.5%"><span class="cap">City</span><div class="v">' + cfEsc(ptCity) + '</div></div>'
        + '<div class="cell last"><span class="cap">State</span><div class="v">' + cfEsc(ptState) + '</div></div>'
      + '</div>'
      + '<div class="row sub nb" data-cs="'+__cs+'min-height:.3in">'
        + '<div class="cell" data-cs="'+__cs+'flex:0 0 47%"><span class="cap">Zip Code</span><div class="v">' + cfEsc(ptZip) + '</div></div>'
        + '<div class="cell last"><span class="cap">Telephone <i>(Include Area Code)</i></span><div class="v">' + cfEsc(ptPhone) + '</div></div>'
      + '</div>'
    + '</div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 24%"><span class="cap">8. Reserved for NUCC Use</span><div class="v"></div></div>'
    + '<div class="col last" data-cs="'+__cs+'flex:1">'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in">'
        + '<div class="cell" data-cs="'+__cs+'flex:0 0 62%"><span class="cap">City</span><div class="v">' + cfEsc(insCity) + '</div></div>'
        + '<div class="cell last"><span class="cap">State</span><div class="v">' + cfEsc(insState) + '</div></div>'
      + '</div>'
      + '<div class="row sub nb" data-cs="'+__cs+'min-height:.3in">'
        + '<div class="cell" data-cs="'+__cs+'flex:0 0 38%"><span class="cap">Zip Code</span><div class="v">' + cfEsc(insZip) + '</div></div>'
        + '<div class="cell last"><span class="cap">Telephone <i>(Include Area Code)</i></span><div class="v">' + cfEsc(insPhone) + '</div></div>'
      + '</div>'
    + '</div>'
    + '</div>'

  /* 9 / 10 / 11 - one row, not four. Box 10 is a single tall cell on the issued
     form: its heading and the a/b/c questions share one box with no rules
     between them, while boxes 9 and 11 keep their own a/b/c dividers either
     side. Four stacked rows drew three extra lines straight through box 10. */
  h += '<div class="row" data-cs="'+__cs+'min-height:1.2in">'
    + '<div class="col" data-cs="'+__cs+'flex:0 0 34%">'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap">9. Other Insured&rsquo;s Name <i>(Last Name, First Name, Middle Initial)</i></span><div class="v">' + cfEsc(c.box9.name) + '</div></div></div>'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>a.</i> Other Insured&rsquo;s Policy or Group Number</span><div class="v">' + cfEsc(c.box9.policy) + '</div></div></div>'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>b.</i> Reserved for NUCC Use</span><div class="v"></div></div></div>'
      + '<div class="row sub nb" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>c.</i> Reserved for NUCC Use</span><div class="v"></div></div></div>'
    + '</div>'
    + '<div class="cell b10" data-cs="'+__cs+'flex:0 0 24%">'
      + '<div class="b10q"><span class="cap">10. Is Patient&rsquo;s Condition Related To:</span></div>'
      + '<div class="b10q"><span class="cap"><i>a.</i> Employment? <i>(Current or Previous)</i></span>'
        + '<div class="v sm">' + cfChk(c.box10.employment === 'yes') + 'YES &nbsp;' + cfChk(c.box10.employment === 'no') + 'NO</div></div>'
      + '<div class="b10q"><span class="cap"><i>b.</i> Auto Accident? &nbsp;&nbsp; Place <i>(State)</i></span>'
        + '<div class="v sm">' + cfChk(c.box10.auto === 'yes') + 'YES &nbsp;' + cfChk(c.box10.auto === 'no') + 'NO &nbsp; ' + cfEsc(c.box10.autoPlace) + '</div></div>'
      + '<div class="b10q"><span class="cap"><i>c.</i> Other Accident?</span>'
        + '<div class="v sm">' + cfChk(c.box10.other === 'yes') + 'YES &nbsp;' + cfChk(c.box10.other === 'no') + 'NO</div></div>'
    + '</div>'
    + '<div class="col last" data-cs="'+__cs+'flex:1">'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap">11. Insured&rsquo;s Policy Group or FECA Number</span><div class="v">' + cfEsc(c.box11.group) + '</div></div></div>'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>a.</i> Insured&rsquo;s Date of Birth &nbsp; MM &nbsp; DD &nbsp; YY &nbsp;&nbsp; Sex</span>'
        + '<div class="v">' + (idob.mm ? idob.mm + '&nbsp;' + idob.dd + '&nbsp;' + idob.yy : '') + ' &nbsp;M' + cfChk(c.box11.sex === 'M') + ' F' + cfChk(c.box11.sex === 'F') + '</div></div></div>'
      + '<div class="row sub" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>b.</i> Other Claim ID <i>(Designated by NUCC)</i></span><div class="v">' + cfEsc(c.box11.otherClaimId) + '</div></div></div>'
      + '<div class="row sub nb" data-cs="'+__cs+'min-height:.3in"><div class="cell last"><span class="cap"><i>c.</i> Insurance Plan Name or Program Name</span><div class="v">' + cfEsc(c.box11.planName) + '</div></div></div>'
    + '</div>'
    + '</div>'

  h += '<div class="row" data-cs="'+__cs+'min-height:.3in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 34%"><span class="cap"><i>d.</i> Insurance Plan Name or Program Name</span><div class="v">' + cfEsc(c.box9.planName) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 24%"><span class="cap"><i>10d.</i> Claim Codes <i>(Designated by NUCC)</i></span><div class="v">' + cfEsc(c.box10.codes) + '</div></div>'
    + '<div class="cell last"><span class="cap"><i>d.</i> Is There Another Health Benefit Plan?</span>'
    + '<div class="v sm">' + cfChk(c.box11.another === 'yes') + 'YES &nbsp;' + cfChk(c.box11.another === 'no') + 'NO &nbsp;&nbsp;<i data-cs="'+__cs+'font-size:4.6pt;color:#e3554f">If yes, complete items 9, 9a, and 9d.</i></div></div>'
    + '</div>'

  // 12 / 13 with the read-back notice
  h += '<div class="row" data-cs="'+__cs+'min-height:.56in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 58%">'
    + '<span class="cap" data-cs="'+__cs+'text-align:center;font-weight:700">Read Back of Form Before Completing &amp; Signing This Form.</span>'
    + '<span class="cap">12. Patient&rsquo;s or Authorized Person&rsquo;s Signature &nbsp;<i>I authorize the release of any medical or other information necessary to process this claim. I also request payment of government benefits either to myself or to the party who accepts assignment below.</i></span>'
    + '<div class="v" data-cs="'+__cs+'padding-top:6px">' + cfEsc(c.box12.signature)
    + '<span data-cs="'+__cs+'float:right">DATE ' + cfEsc(cfDateCells(c.box12.date)) + '</span></div>'
    + '<span class="cap" data-cs="'+__cs+'padding-top:2px">Signed</span></div>'
    + '<div class="cell last"><span class="cap">13. Insured&rsquo;s or Authorized Person&rsquo;s Signature &nbsp;<i>I authorize payment of medical benefits to the undersigned physician or supplier for services described below.</i></span>'
    + '<div class="v" data-cs="'+__cs+'padding-top:6px">' + cfEsc(c.box13.signature) + '</div>'
    + '<span class="cap" data-cs="'+__cs+'padding-top:2px">Signed</span></div>'
    + '</div>'

  h += '<div class="band"></div>'

  // 14 / 15 / 16
  h += '<div class="row" data-cs="'+__cs+'min-height:.34in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 29%"><span class="cap">14. Date of Current Illness, Injury, or Pregnancy <i>(LMP)</i> &nbsp; MM DD YY</span>'
    + '<div class="v">' + cfEsc(cfDateCells(c.box14.date)) + ' &nbsp;<span data-cs="'+__cs+'font-size:5pt;color:#e3554f">QUAL</span> ' + cfEsc(c.box14.qual) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 29%"><span class="cap">15. Other Date &nbsp; QUAL &nbsp;&nbsp; MM DD YY</span>'
    + '<div class="v">' + cfEsc(c.box15.qual) + ' &nbsp;' + cfEsc(cfDateCells(c.box15.date)) + '</div></div>'
    + '<div class="cell last"><span class="cap">16. Dates Patient Unable to Work in Current Occupation</span>'
    + '<div class="v sm">FROM ' + cfEsc(cfDateCells(c.box16.from)) + ' &nbsp; TO ' + cfEsc(cfDateCells(c.box16.to)) + '</div></div>'
    + '</div>'

  // 17 / 18
  h += '<div class="row" data-cs="'+__cs+'min-height:.34in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 43%"><span class="cap">17. Name of Referring Provider or Other Source</span>'
    + '<div class="v">' + cfEsc(c.box17.qual) + ' ' + cfEsc(c.box17.name) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 15%"><span class="cap"><i>17a.</i></span>'
    + '<div class="v sm">' + cfEsc(c.box17.otherId) + '</div>'
    + '<span class="cap"><i>17b.</i> NPI ' + cfEsc(c.box17.npi) + '</span></div>'
    + '<div class="cell last"><span class="cap">18. Hospitalization Dates Related to Current Services</span>'
    + '<div class="v sm">FROM ' + cfEsc(cfDateCells(c.box18.from)) + ' &nbsp; TO ' + cfEsc(cfDateCells(c.box18.to)) + '</div></div>'
    + '</div>'

  // 19 / 20
  h += '<div class="row" data-cs="'+__cs+'min-height:.32in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 58%"><span class="cap">19. Additional Claim Information <i>(Designated by NUCC)</i></span><div class="v">' + cfEsc(c.box19) + '</div></div>'
    + '<div class="cell last"><span class="cap">20. Outside Lab? &nbsp;&nbsp;&nbsp; $ Charges</span>'
    + '<div class="v sm">' + cfChk(c.box20.outside === 'yes') + 'YES &nbsp;' + cfChk(c.box20.outside === 'no') + 'NO &nbsp;&nbsp; ' + cfEsc(c.box20.charges) + '</div></div>'
    + '</div>'

  // 21 / 22 / 23
  h += '<div class="row" data-cs="'+__cs+'min-height:.56in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 58%"><span class="cap">21. Diagnosis or Nature of Illness or Injury &nbsp;<i>Relate A-L to service line below (24E)</i> &nbsp;&nbsp; ICD Ind. ' + cfEsc(c.box21.icdInd) + '</span>'
    + '<div class="dx">' + dxCells + '</div></div>'
    + '<div class="cell last" data-cs="'+__cs+'padding:0">'
    + '<div data-cs="'+__cs+'border-bottom:1px solid #e3554f;padding:1px 3px;min-height:.27in"><span class="cap">22. Resubmission Code &nbsp;&nbsp;&nbsp; Original Ref. No.</span><div class="v sm">' + cfEsc(c.box22.code) + ' &nbsp; ' + cfEsc(c.box22.originalRef) + '</div></div>'
    + '<div data-cs="'+__cs+'padding:1px 3px"><span class="cap">23. Prior Authorization Number</span><div class="v sm">' + cfEsc(c.box23) + '</div></div>'
    + '</div></div>'

  // 24 service grid
  h += '<div class="row nb"><div class="cell last" data-cs="'+__cs+'padding:0;border-right:0">'
    /* 14 columns, and the body rows below emit exactly 14 cells: line number,
       From, To, POS, EMG, CPT, two modifier cells, Dx pointer, charges, units,
       EPSDT (H), ID Qual (I), Rendering Provider ID (J). The header spans have
       to add up to the same 14 or every column downstream shifts. */
    + '<table class="svc"><colgroup>'
    + '<col data-cs="'+__cs+'width:2.6%"><col data-cs="'+__cs+'width:10%"><col data-cs="'+__cs+'width:10%"><col data-cs="'+__cs+'width:4.2%"><col data-cs="'+__cs+'width:3.4%">'
    + '<col data-cs="'+__cs+'width:10.5%"><col data-cs="'+__cs+'width:4.6%"><col data-cs="'+__cs+'width:4.6%"><col data-cs="'+__cs+'width:5.8%"><col data-cs="'+__cs+'width:10%">'
    + '<col data-cs="'+__cs+'width:4.6%"><col data-cs="'+__cs+'width:4%"><col data-cs="'+__cs+'width:4.2%"><col data-cs="'+__cs+'width:21.5%">'
    + '</colgroup><thead><tr>'
    + '<th data-cs="'+__cs+'border:0"></th>'
    + '<th colspan="2" data-cs="'+__cs+'border-left:1px solid #e3554f">24. A. &nbsp; Date(s) of Service<br>From &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; To<br>MM &nbsp; DD &nbsp; YY &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; MM &nbsp; DD &nbsp; YY</th>'
    + '<th>B.<br>Place of<br>Service</th><th>C.<br>EMG</th>'
    + '<th colspan="3">D. Procedures, Services, or Supplies<br><i>(Explain Unusual Circumstances)</i><br>CPT/HCPCS &nbsp;&nbsp; MODIFIER</th>'
    + '<th>E.<br>Diagnosis<br>Pointer</th><th>F.<br><br>$ Charges</th><th>G.<br>Days<br>or Units</th>'
    + '<th>H.<br>EPSDT<br>Family<br>Plan</th>'
    + '<th>I.<br>ID.<br>QUAL.</th>'
    + '<th>J.<br>Rendering<br>Provider ID. #</th>'
    + '</tr></thead><tbody>' + svcRows + '</tbody></table>'
    + '</div></div>'

  // 25 - 30
  h += '<div class="row" data-cs="'+__cs+'min-height:.38in;border-top:1px solid #e3554f">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 19%"><span class="cap">25. Federal Tax I.D. Number &nbsp; SSN EIN</span>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.taxId) + ' ' + cfChk(CLAIM_PRACTICE.taxIdType === 'ssn') + cfChk(CLAIM_PRACTICE.taxIdType === 'ein') + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 16%"><span class="cap">26. Patient&rsquo;s Account No.</span><div class="v">' + cfEsc(c.box26) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 17%"><span class="cap">27. Accept Assignment? <i>(For govt. claims, see back)</i></span>'
    + '<div class="v sm">' + cfChk(c.box27 === 'yes') + 'YES &nbsp;' + cfChk(c.box27 === 'no') + 'NO</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 17%"><span class="cap">28. Total Charge</span><div class="v">$ ' + cfMoneyStr(pageTotal) + '</div></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 16%"><span class="cap">29. Amount Paid</span><div class="v">$ ' + cfEsc(c.box29 || '0.00') + '</div></div>'
    + '<div class="cell last"><span class="cap">30. Rsvd for NUCC Use</span><div class="v"></div></div>'
    + '</div>'

  // 31 / 32 / 33
  h += '<div class="row nb" data-cs="'+__cs+'min-height:.62in">'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 34%"><span class="cap">31. Signature of Physician or Supplier Including Degrees or Credentials &nbsp;<i>(I certify that the statements on the reverse apply to this bill and are made a part thereof.)</i></span>'
    /* Name over SIGNED, date over DATE. Both rows share one layout so the
       entry always sits above its own label instead of stacking on the left. */
    + '<div class="v sm b31" data-cs="'+__cs+'padding-top:5px"><span>' + cfEsc(c.box31.name) + '</span>'
      + '<span>' + cfEsc(cfDateCells(c.box31.date)) + '</span></div>'
    + '<span class="cap b31"><span>Signed</span><span>Date</span></span></div>'
    + '<div class="cell" data-cs="'+__cs+'flex:0 0 33%"><span class="cap">32. Service Facility Location Information</span>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.name) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.addr) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.suite) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.cityStateZip) + '</div>'
    + '<span class="cap" data-cs="'+__cs+'padding-top:1px"><i>a.</i> ' + cfEsc(CLAIM_PRACTICE.npi) + ' &nbsp;&nbsp; b.</span></div>'
    + '<div class="cell last"><span class="cap">33. Billing Provider Info &amp; Ph # &nbsp; ( ' + cfEsc(CLAIM_PRACTICE.phone) + ' )</span>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.name) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.addr) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.suite) + '</div>'
    + '<div class="v sm">' + cfEsc(CLAIM_PRACTICE.cityStateZip) + '</div>'
    + '<span class="cap" data-cs="'+__cs+'padding-top:1px"><i>a.</i> ' + cfEsc(CLAIM_PRACTICE.npi) + ' &nbsp;&nbsp; b. ' + cfEsc(CLAIM_PRACTICE.otherIdQual) + '</span></div>'
    + '</div>'

  h += '</div>'
  h += '<div class="ftr"><span>NUCC Instruction Manual available at: www.nucc.org</span>'
    + '<span data-cs="'+__cs+'font-style:italic;font-weight:700">PLEASE PRINT OR TYPE</span>'
    + '<span>APPROVED OMB-0938-1197 FORM 1500 (02-12)</span></div>'
  h += '<div class="ftr-l">MB-0D3W-M7PA</div>'
  h += '</div>'
  return h
}

var CF_DEMO_NAME = { last: 'Moon', first: 'Jaylen', mi: 'R' }

// Fee pairs taken from this practice's own schedule so totals look real.
var CF_DEMO_SERVICES = [
  { cpt: '99203', mods: '25', charge: '265.00' },
  { cpt: '99213', mods: '25', charge: '225.00' },
  { cpt: '96146', mods: '', charge: '350.00' },
  { cpt: '92551', mods: '', charge: '335.00' },
  { cpt: '97110', mods: '59 GP', charge: '135.00' },
  { cpt: '97112', mods: 'GP', charge: '135.00' },
  { cpt: '97129', mods: '59 GP', charge: '150.00' },
  { cpt: '97130', mods: '59 GP', charge: '150.00' }
]
var CF_DEMO_CARRIERS = [
  { name: "Injured Workers' Insurance Fund", line1: 'P.O. Box 9899', line2: 'Towson, MD 21284-9899' },
  { name: 'CareFirst BlueCross BlueShield', line1: 'P.O. Box 14116', line2: 'Lexington, KY 40512-4116' },
  { name: 'Maryland Auto Insurance', line1: '1750 Forest Drive', line2: 'Annapolis, MD 21401-4200' },
  { name: 'GEICO Casualty Company', line1: 'P.O. Box 9095', line2: 'Fredericksburg, VA 22403-9095' }
]
var CF_DEMO_DX = ['S060X1A', 'S060X9A', 'M5432', 'R51', 'H8109', 'R42']
var CF_DEMO_STREETS = ['2909 West Strathmore Ave', '118 Ridgely Ave', '4407 Old York Rd', '77 Kingston Lane', '312 Fairmount Ave']
var CF_DEMO_CITIES = [
  { city: 'Baltimore', state: 'MD', zip: '21209' },
  { city: 'Annapolis', state: 'MD', zip: '21401' },
  { city: 'Columbia', state: 'MD', zip: '21044' },
  { city: 'Crofton', state: 'MD', zip: '21114' }
]
var CF_DEMO_REFERRERS = [
  { name: 'Alicia Trent, MD', npi: '1710982345' },
  { name: 'Marcus Bell, DO', npi: '1487206611' },
  { name: 'Priya Raman, MD', npi: '1265488730' }
]
var CF_DEMO_SURNAMES = ['Moon', 'Alvarez', 'Whitfield', 'Okafor', 'Lindqvist']
var CF_DEMO_FORENAMES = ['Denise', 'Marcus', 'Rosa', 'Terrence', 'Yuki']

function cfRand(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function cfRandInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)) }
function cfPad(n) { return ('0' + n).slice(-2) }
function cfFmtDate(d) { return cfPad(d.getMonth() + 1) + '/' + cfPad(d.getDate()) + '/' + d.getFullYear() }
function cfAddDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x }

function cfLoadDemo() {
  var p = cfCurrentPatient()
  if (!p) { showToast('Select a patient first', 'err'); return }

  var c = cfBlank()
  var loc = cfRand(CF_DEMO_CITIES)
  var carrier = cfRand(CF_DEMO_CARRIERS)
  var sex = cfRand(['M', 'F'])
  var referrer = cfRand(CF_DEMO_REFERRERS)

  // Injury a few weeks back, first visit ~2 weeks later, then a course of care.
  var injury = cfAddDays(new Date(), -cfRandInt(70, 140))
  var firstVisit = cfAddDays(injury, cfRandInt(8, 20))

  c.demo = {
    last: CF_DEMO_NAME.last, first: CF_DEMO_NAME.first, mi: CF_DEMO_NAME.mi,
    dob: cfFmtDate(new Date(cfRandInt(1985, 2006), cfRandInt(0, 11), cfRandInt(1, 28))),
    sex: sex,
    addr: cfRand(CF_DEMO_STREETS),
    city: loc.city, state: loc.state, zip: loc.zip,
    phone: '410' + cfRandInt(2000000, 9999999)
  }

  /* Relationship drives boxes 4 and 7. "Self" legitimately leaves them blank
     (the form then prints the patient), so the demo picks a dependent
     relationship - that is the case where 4 and 7 actually carry data and
     therefore the case worth exercising. */
  c.box6 = cfRand(['spouse', 'child'])
  var insLoc = cfRand(CF_DEMO_CITIES)
  c.box4 = { last: CF_DEMO_NAME.last, first: cfRand(CF_DEMO_FORENAMES), mi: 'A' }
  c.box7 = {
    addr: cfRand(CF_DEMO_STREETS), city: insLoc.city, state: insLoc.state,
    zip: insLoc.zip, phone: '443' + cfRandInt(2000000, 9999999)
  }

  c.carrier = { name: carrier.name, line1: carrier.line1, line2: carrier.line2 }
  c.box1 = cfRand(['other', 'group'])
  c.box1a = String(cfRandInt(1000000, 9999999))

  c.box10 = {
    employment: cfRand(['yes', 'no']),
    auto: cfRand(['yes', 'no']),
    autoPlace: loc.state,
    other: 'no',
    codes: cfRand(['BL', 'AA', 'OA'])
  }

  /* 11d = yes so boxes 9 / 9a / 9d are in play - the form's own instruction
     is "if yes, complete items 9, 9a and 9d", so filling them together keeps
     the demo internally consistent rather than merely non-empty. */
  var secondary = cfRand(CF_DEMO_CARRIERS.filter(function (x) { return x.name !== carrier.name }))
  c.box9 = {
    name: cfRand(CF_DEMO_SURNAMES) + ', ' + cfRand(CF_DEMO_FORENAMES),
    policy: 'GRP' + cfRandInt(10000, 99999),
    planName: secondary.name
  }
  c.box11 = {
    group: 'GRP' + cfRandInt(1000, 9999),
    dob: cfFmtDate(new Date(cfRandInt(1960, 1990), cfRandInt(0, 11), cfRandInt(1, 28))),
    sex: cfRand(['M', 'F']),
    otherClaimId: 'Y' + cfRandInt(100000, 999999),
    planName: carrier.name,
    another: 'yes'
  }

  c.box12 = { signature: 'Signature On File', date: cfFmtDate(firstVisit) }
  c.box13 = { signature: 'Signature On File' }

  c.box14 = { date: cfFmtDate(injury), qual: '431' }                       // onset
  c.box15 = { qual: '454', date: cfFmtDate(cfAddDays(injury, 3)) }         // initial treatment
  c.box16 = { from: cfFmtDate(injury), to: cfFmtDate(cfAddDays(injury, cfRandInt(14, 45))) }
  c.box17 = { name: referrer.name, qual: 'DN', otherId: 'G2' + cfRandInt(10000, 99999), npi: referrer.npi }
  c.box18 = { from: cfFmtDate(injury), to: cfFmtDate(cfAddDays(injury, 1)) }
  c.box19 = 'Post-concussive syndrome; care per treating provider'
  c.box20 = { outside: 'no', charges: '0.00' }

  var dxCodes = ['', '', '', '', '', '', '', '', '', '', '', '']
  var dxCount = cfRandInt(2, 4)
  var pool = CF_DEMO_DX.slice()
  for (var d = 0; d < dxCount; d++) {
    dxCodes[d] = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
  }
  c.box21 = { icdInd: '0', codes: dxCodes }
  c.box22 = { code: cfRand(['7', '8']), originalRef: String(cfRandInt(100000000, 999999999)) }
  c.box23 = 'PA' + cfRandInt(100000, 999999)

  // 7-11 lines: more than the six a single form holds, so the
  // multi-page split and the per-page Box 28 total both get exercised.
  var nLines = cfRandInt(7, 11)
  var lines = []
  var visit = firstVisit
  for (var i = 0; i < nLines; i++) {
    var svc = (i === 0) ? CF_DEMO_SERVICES[0] : cfRand(CF_DEMO_SERVICES.slice(2))
    var ds = cfFmtDate(visit)
    lines.push({
      from: ds, to: ds, pos: '11',
      emg: cfRand(['N', 'N', 'Y']),
      cpt: svc.cpt, mods: svc.mods,
      pointer: String.fromCharCode(65 + cfRandInt(0, dxCount - 1)),
      charges: svc.charge, units: '1',
      epsdt: 'N', idQual: 'G2',
      renderingId: CLAIM_PRACTICE.npi
    })
    if (i % 3 !== 1) visit = cfAddDays(visit, cfRandInt(1, 4))
  }
  c.lines = lines

  c.box26 = String(cfRandInt(10000, 99999))
  c.box27 = 'yes'
  c.box29 = '0.00'
  c.box31 = { name: 'Nicholas A. Grande', date: cfFmtDate(new Date()) }
  c.updatedAt = ''

  // On screen only - Save Claim refuses a demo. The real claim is kept aside
  // so Clear Demo can put it back.
  if (!(p.claimForm && p.claimForm.demo)) cfBeforeDemo[p.id] = p.claimForm ? JSON.parse(JSON.stringify(p.claimForm)) : null
  p.claimForm = c
  cfRerender(p)

  var gaps = cfDemoGaps(c)
  if (gaps.length && window.console) console.warn('[claim demo] fields with no demo answer:', gaps)
  showToast('Demo claim loaded — ' + nLines + ' service lines, not yet saved', 'ok')
}

/* Reports any claim field the demo left empty. Backs the maintenance rule at
   the top of this block: add a question, add its demo answer. Deliberately
   ignores fields that are correctly blank - the demo identity block, the save
   stamp, the NUCC-reserved box 30, and box 32, which prints from constants. */
function cfDemoGaps(c) {
  var SKIP = { demo: 1, updatedAt: 1, box30: 1, box32: 1 }
  var gaps = []
  function walk(o, path) {
    Object.keys(o).forEach(function (k) {
      if (SKIP[k]) return
      var v = o[k], pth = path ? path + '.' + k : k
      if (Array.isArray(v)) {
        if (k === 'codes' && !v.filter(Boolean).length) gaps.push(pth)
        if (k === 'lines') {
          v.slice(0, 1).forEach(function (ln) {
            Object.keys(ln).forEach(function (f) { if (ln[f] === '' || ln[f] == null) gaps.push('lines[].' + f) })
          })
        }
        return
      }
      if (v && typeof v === 'object') return walk(v, pth)
      if (v === '' || v == null) gaps.push(pth)
    })
  }
  walk(c, '')
  return gaps
}

/* The claim each patient had before Load Demo. Clear Demo used to drop only
   the made-up name, leaving the demo carrier, codes and service lines on the
   real patient's claim. */
var cfBeforeDemo = {}
function cfClearDemo() {
  var p = cfCurrentPatient(); if (!p) return
  if (Object.prototype.hasOwnProperty.call(cfBeforeDemo, p.id)) {
    if (cfBeforeDemo[p.id]) p.claimForm = cfBeforeDemo[p.id]
    else delete p.claimForm
    delete cfBeforeDemo[p.id]
  } else {
    cfEnsure(p).demo = null
  }
  cfRerender(p)
  showToast('Demo cleared. The real claim is back.', 'ok')
}

function cfRerender(p) {
  var body = document.getElementById('intakeTabBody')
  if (body) body.innerHTML = cfTabHTML(p)
}
