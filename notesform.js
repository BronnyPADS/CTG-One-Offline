(function () {
  'use strict';

  var nfStatus = null;
  var nfResult = null;
  var nfError = '';
  var nfBusy = false;
  var nfKey = '';
  var nfShowRaw = false;
  var nfErrDetail = null;    // what the other server said about a refusal
  var nfToken = null;        // what this server's own token claims to be
  var nfTokenErr = '';
  var nfTokenBusy = false;

  var DASH = '—';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mount() { return document.getElementById('notesFormTestMount'); }

  var ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    brain: '<path d="M9.5 3a3 3 0 0 0-3 3 3 3 0 0 0-2.5 4.8A3.5 3.5 0 0 0 6 17a3 3 0 0 0 3.5 4 2.5 2.5 0 0 0 2.5-2.5V5.5A2.5 2.5 0 0 0 9.5 3z"/><path d="M14.5 3a3 3 0 0 1 3 3 3 3 0 0 1 2.5 4.8A3.5 3.5 0 0 1 18 17a3 3 0 0 1-3.5 4 2.5 2.5 0 0 1-2.5-2.5"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>'
  };
  function icon(name, cls) {
    return '<svg class="nfb-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  function render() {
    var el = mount();
    if (!el) return;
    el.innerHTML = '<div class="wrap nf-wrap">'
      + heroHTML()
      + '<div class="nfb-grid">'
      + '<div class="nfb-col">' + probeHTML() + linkedHTML() + statusHTML() + '</div>'
      + '<div class="nfb-col nfb-col-main">' + resultHTML() + '</div>'
      + '</div></div>';
  }

  function stateOf() {
    if (!nfStatus) return { cls: 'is-wait', label: 'Checking connection' };
    return nfStatus.enabled
      ? { cls: 'is-live', label: 'Connected' }
      : { cls: 'is-idle', label: 'Not switched on' };
  }

  /* The two systems and the line between them. The dots only travel when
     the connection is switched on. */
  function heroHTML() {
    var st = stateOf();
    var timeout = nfStatus ? Math.round((nfStatus.timeoutMs || 0) / 1000) + 's timeout' : '';
    return '<header class="nfb-hero ' + st.cls + '">'
      + '<div class="nfb-hero-top">'
      + '<div class="nfb-hero-t">'
      + '<span class="nfb-eyebrow">Integration · Daily notes source</span>'
      + '<h1>Notes Form</h1>'
      + '<p>Session notes and exercise results, read live from RecoverArc and gathered by day of care.</p>'
      + '</div>'
      + '<div class="nfb-hero-actions">'
      + '<button type="button" class="nfb-glass" data-onclick="nfLoadStatus(true)">' + icon('refresh') + 'Refresh</button>'
      + '</div></div>'
      + '<div class="nfb-flow">'
      + '<div class="nfb-node">' + icon('pulse') + '<div><b>RecoverArc</b><span>Notes Form app</span></div></div>'
      + '<div class="nfb-wire"><i></i><i></i><i></i><em>' + (nfStatus && nfStatus.enabled ? 'Managed identity · read-only' : 'No calls made') + '</em></div>'
      + '<div class="nfb-node">' + icon('brain') + '<div><b>CTG One</b><span>Patient charts</span></div></div>'
      + '</div>'
      + '<div class="nfb-meta">'
      + '<span class="nfb-state"><i></i>' + esc(st.label) + '</span>'
      + (nfStatus ? '<span>' + esc(nfStatus.auth || DASH) + '</span><span>' + esc(timeout) + '</span>'
        + '<span>' + esc(lookupLabel(nfStatus.lookupBy)) + '</span>' : '')
      + '</div>'
      + '</header>';
  }

  function card(title, right, body, ico, extra) {
    return '<section class="card nf-card nfb-card' + (extra ? ' ' + extra : '') + '"><div class="card-hd">'
      + '<div class="card-title nfb-title">' + (ico ? '<span class="nfb-title-ico">' + icon(ico) + '</span>' : '') + esc(title) + '</div>'
      + (right ? '<div class="nf-card-right">' + right + '</div>' : '')
      + '</div><div class="card-body">' + body + '</div></section>';
  }
  function pill(text, cls) { return '<span class="nf-pill ' + cls + '">' + esc(text) + '</span>'; }
  function fact(label, value, state) {
    return '<div class="nf-fact"><span>' + esc(label) + '</span>'
      + '<b' + (state ? ' class="nf-' + state + '"' : '') + '>' + esc(value || DASH) + '</b></div>';
  }

  /* The wiring. Nobody needs it day to day, so it folds away until a
     token check or a not-switched-on state has something to say. */
  function statusHTML() {
    if (!nfStatus) return card('Connection details', '', '<div class="nfb-skel"><i></i><i></i><i></i></div>', 'shield');
    var on = nfStatus.enabled;
    var facts = '<div class="nf-facts">'
      + fact('Reads', (nfStatus.baseUrl || 'not set yet') + (nfStatus.endpoint || ''))
      /* On the page because a wrong audience is a 401 with no clue why. */
      + fact('Token audience', nfStatus.resourceAppId ? ('api://' + nfStatus.resourceAppId) : DASH)
      + fact('Authenticating as', nfStatus.auth)
      + fact('Gives up after', Math.round((nfStatus.timeoutMs || 0) / 1000) + ' seconds')
      + '</div>';
    var inspect = on
      ? '<button type="button" class="btn btn-ghost btn-sm nfb-btn-soft" data-onclick="nfCheckToken()"'
        + (nfTokenBusy ? ' disabled' : '') + '>' + icon('key')
        + (nfTokenBusy ? 'Checking…' : 'Check this server’s token') + '</button>'
      : '';
    var open = !on || nfToken || nfTokenErr || nfTokenBusy;
    return '<details class="card nf-card nfb-card nfb-fold"' + (open ? ' open' : '') + '>'
      + '<summary class="card-hd"><div class="card-title nfb-title"><span class="nfb-title-ico">' + icon('shield') + '</span>Connection details</div>'
      + '<div class="nf-card-right">' + pill(on ? 'Ready' : 'Not switched on', on ? 'is-on' : 'is-off')
      + icon('chevron', 'nfb-chev') + '</div></summary>'
      + '<div class="card-body">' + (on ? '' : setupStepsHTML()) + facts
      + (inspect ? '<div class="nfb-inspect">' + inspect + '</div>' : '') + tokenHTML() + '</div>'
      + '</details>';
  }

  function lookupLabel(by) {
    if (by === 'mrn') return 'Matched by MRN';
    if (by === 'email') return 'Matched by email';
    return 'Matched per chart';
  }

  function setupStepsHTML() {
    return '<ol class="nf-steps">'
      + '<li><b>Set the base URL</b><span>Add <code>NOTES_API_BASE_URL</code> to the App Service configuration — the Notes Form app’s host only, with no path. '
      + 'Nothing is called until it is set, and saving it restarts this app.</span></li>'
      + '</ol>'
      /* The role and consent were done 23 Sep 2026 and cannot be read back
         from here. */
      + '<p class="nf-note">The app role and the consent are already in place. If a probe comes back <b>401</b> the token '
      + 'audience or tenant is wrong; <b>403</b> means <code>NotesResults.Read</code> is not reaching this app’s managed identity.</p>';
  }

  /* A 401 from the other side is one of four things, and every one of them is
     written in the token's own claims. */
  function tokenHTML() {
    if (nfTokenErr) {
      return '<div class="nf-warn" data-cs="'+__cs+'margin-top:16px"><b>Could not get a token at all.</b>'
        + '<span>' + esc(nfTokenErr) + ' — that is this server’s own managed identity failing, before the Notes Form app is ever contacted.</span></div>';
    }
    if (!nfToken) return '';
    var verdicts = [];
    if (!nfToken.audienceMatches) {
      verdicts.push('The token was minted for <code>' + esc(nfToken.audience || '(nothing)')
        + '</code>, but the Notes Form app expects <code>' + esc(nfToken.wantedAudience) + '</code>.');
    }
    if (String(nfToken.tokenVersion) === '1.0') {
      verdicts.push('This is a <b>v1</b> token. The token version is set by the API being called, never by the '
        + 'caller — <code>requestedAccessTokenVersion</code> on its registration changes the JWT “independent of '
        + 'the endpoint or client used to request the access token”, so nothing on this side can produce a v2 '
        + 'token while that property is <code>null</code> or <code>1</code>. Two fixes, both on the Notes Form side: '
        + '<b>(a)</b> trust the v1 issuer <code>' + esc(nfToken.issuer) + '</code> alongside the v2 one — same signing '
        + 'keys, nothing else changes; or <b>(b)</b> set <code>api.requestedAccessTokenVersion: 2</code> '
        + '(older manifests call it <code>accessTokenAcceptedVersion</code>) on the API’s registration — but then its '
        + 'audience check must also accept the bare client id <code>' + esc(nfToken.wantedAudience.replace('api://', ''))
        + '</code>, because v2 tokens carry the client id as <code>aud</code> rather than the App ID URI.');
    }
    if (!(nfToken.roles || []).length) {
      verdicts.push('The token carries <b>no app role</b>. <code>NotesResults.Read</code> is not reaching this '
        + 'identity — or the role was assigned after this token was cached, in which case restart this app and check again.');
    }
    var body = '<div class="nf-facts">'
      + fact('Token audience', nfToken.audience, nfToken.audienceMatches ? '' : 'bad')
      + fact('Issued by', nfToken.issuer)
      + fact('Token version', nfToken.tokenVersion || 'not stated')
      + fact('Tenant', nfToken.tenantId)
      + fact('Calling app id', nfToken.callingAppId)
      + fact('App roles in the token', (nfToken.roles || []).join(', ') || 'none',
             (nfToken.roles || []).length ? '' : 'bad')
      + '</div>';
    var note = verdicts.length
      ? '<div class="nf-warn" data-cs="'+__cs+'margin-top:14px"><b>' + verdicts.length + ' reason'
        + (verdicts.length === 1 ? '' : 's') + ' the Notes Form app would refuse this token</b>'
        + '<span><ul class="nf-verdicts"><li>' + verdicts.join('</li><li>') + '</li></ul></span></div>'
      : '<div class="nf-ok-note" data-cs="'+__cs+'margin-top:14px">Audience, issuer and role all look right — '
        + 'a 401 with these claims is a validation rule on the Notes Form side.</div>';
    return '<div class="nf-tokenbox">' + body + note + '</div>';
  }

  function probeHTML() {
    var off = !nfStatus || !nfStatus.enabled;
    var dis = (off || nfBusy) ? ' disabled' : '';
    return card('Look up notes', '',
      '<div class="nfb-search' + (off ? ' is-off' : '') + '">' + icon('search')
      + '<input type="text" id="nfKey" autocomplete="off" spellcheck="false" placeholder="'
      + (off ? 'Available once the connection is switched on' : 'Notes Form patient id, e.g. patient_0f3c…') + '"'
      + ' value="' + esc(nfKey) + '"' + (off ? ' disabled' : '')
      + ' data-onkeydown="if(event.key===&quot;Enter&quot;)nfProbe()">'
      + '<button type="button" class="btn btn-primary" data-onclick="nfProbe()"' + dis + '>'
      + (nfBusy ? 'Reading…' : 'Read notes') + '</button>'
      + '</div>'
      /* The first read should never be a real person. An id that cannot
         exist proves the token was accepted without reading anybody. */
      + '<button type="button" class="nfb-safe" data-onclick="nfProbeFake()"' + dis + '>'
      + '<span class="nfb-safe-ico">' + icon('flask') + '</span>'
      + '<span><b>Run a safe connection test</b><small>Uses an id that cannot exist. A 404 back means the token was accepted and nothing of anyone’s was read.</small></span>'
      + icon('chevron', 'nfb-chev') + '</button>'
      + '<p class="nfb-audit">' + icon('shield') + 'Every read is real patient data and is written to the audit log.</p>',
      'search');
  }

  /* Charts already linked to a Notes Form id, so a read is one click
     instead of copying an id out of the chart. */
  function linkedHTML() {
    var list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients) ? ctgPatients : [])
      .filter(function (p) { return p && p.notesPatientId; });
    if (!list.length) return '';
    var off = !nfStatus || !nfStatus.enabled || nfBusy;
    var rows = list.map(function (p) {
      var id = String(p.notesPatientId);
      var name = (typeof naturalPatientName === 'function') ? naturalPatientName(p) : id;
      var ini = (typeof initialsForPatient === 'function') ? initialsForPatient(p) : 'PT';
      return '<button type="button" class="nfb-pt' + (id === nfKey ? ' is-on' : '') + '"'
        + ' data-key="' + esc(id) + '" data-onclick="nfProbeKey(this.dataset.key)"' + (off ? ' disabled' : '') + '>'
        + '<span class="nfb-av">' + esc(ini) + '</span>'
        + '<span class="nfb-pt-t"><b>' + esc(name) + '</b><small>' + esc(id) + '</small></span>'
        + icon('chevron', 'nfb-chev') + '</button>';
    }).join('');
    return card('Linked charts', '<span class="nfb-count">' + list.length + '</span>',
      '<div class="nfb-pts">' + rows + '</div>', 'link');
  }

  function emptyHTML(ico, title, text, cls) {
    return '<div class="nfb-empty' + (cls ? ' ' + cls : '') + '"><span class="nfb-empty-ico">' + icon(ico) + '</span>'
      + '<b>' + title + '</b><span>' + text + '</span></div>';
  }

  function resultHTML() {
    if (nfBusy) {
      return card('Notes', pill('Reading', 'is-on'),
        '<div class="nfb-loading">' + [0, 1, 2].map(function () {
          return '<div class="nfb-skel-day"><i class="d"></i><div><i></i><i></i><i class="s"></i></div></div>';
        }).join('') + '</div>', 'notes', 'nfb-result');
    }
    if (nfError) {
      return card('Notes', pill('Failed', 'is-err'),
        emptyHTML('alert', esc(nfError), 'That is exactly what the server reported.', 'is-err')
        + upstreamHTML(), 'notes', 'nfb-result');
    }
    if (!nfResult) {
      return card('Notes', '',
        emptyHTML('notes', 'No patient selected',
          'Pick a linked chart or enter a Notes Form id, and their sessions appear here day by day.'),
        'notes', 'nfb-result');
    }
    if (nfResult.notFound) {
      return card('Notes', pill('Authenticated · no such patient', 'is-on'),
        emptyHTML('check', 'The connection works.',
          'The token was accepted and the Notes Form app looked — it has no patient with that id. '
          + 'For the deliberately fake id, this is the result you want.', 'is-ok'), 'notes', 'nfb-result');
    }
    var notes = nfResult.notes || [];
    if (!notes.length) {
      return card('Notes', pill('Connected', 'is-on'),
        emptyHTML('check', 'The connection works.', 'That patient has no notes or exercise results yet.', 'is-ok'),
        'notes', 'nfb-result');
    }
    var toggle = '<div class="nfb-seg">'
      + '<button type="button" class="' + (nfShowRaw ? '' : 'is-on') + '"' + (nfShowRaw ? ' data-onclick="nfToggleRaw()"' : '') + '>'
      + icon('notes') + 'By day</button>'
      + '<button type="button" class="' + (nfShowRaw ? 'is-on' : '') + '"' + (nfShowRaw ? '' : ' data-onclick="nfToggleRaw()"') + '>'
      + icon('code') + 'Raw JSON</button></div>';
    return card('Notes', toggle, nfShowRaw ? rawHTML(notes) : mappedHTML(notes), 'notes', 'nfb-result');
  }

  /* A refusal in the other system's own words: WWW-Authenticate carries a
     bearer rejection's reason, and an HTML body means something in front of
     their app answered. */
  function upstreamHTML() {
    var u = nfErrDetail && nfErrDetail.upstream;
    var st = nfErrDetail && nfErrDetail.upstreamStatus;
    if (!u) return '';
    var rows = '<div class="nf-facts">'
      + fact('HTTP status', st ? String(st) : DASH)
      + fact('WWW-Authenticate', u.wwwAuthenticate || 'not sent')
      + fact('Content type', u.contentType || DASH)
      + '</div>';
    var body = u.body
      ? '<pre class="nf-raw">' + esc(u.body) + (u.bodyBytes > u.body.length ? '…' : '') + '</pre>'
      : '<p class="nf-note">The response had no body at all.</p>';
    return '<div class="nf-tokenbox"><p class="nf-note"><b>What their server said</b></p>' + rows + body + '</div>';
  }

  /* The whole envelope as it arrived - patientId and generatedAt sit outside
     the records. Falls back to the per-record copies for an older server. */
  function rawHTML(notes) {
    var raw = nfResult && nfResult.raw;
    if (!raw || !raw.text) {
      return '<pre class="nf-raw">' + esc(JSON.stringify(notes.map(function (n) { return n.raw; }), null, 2)) + '</pre>';
    }
    var cut = raw.truncated
      ? '<div class="nf-warn"><b>Showing the first ' + raw.text.length.toLocaleString() + ' characters of '
        + raw.bytes.toLocaleString() + '.</b><span>The rest is not displayed here.</span></div>'
      : '';
    return cut + '<pre class="nf-raw">' + esc(raw.text) + '</pre>';
  }

  function shortDay(day) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!p) return null;
    var d = new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
    if (isNaN(d.getTime())) return null;
    return {
      d: String(d.getDate()),
      m: d.toLocaleDateString('en-US', { month: 'short' }),
      w: d.toLocaleDateString('en-US', { weekday: 'short' }),
      mdy: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
  }

  /* Same day grouping as the chart tab, from the same module, so the two
     cannot disagree. The adapter diagnosis folds away under the notes. */
  function mappedHTML(notes) {
    var days = window.ctgNotesByDay.group(notes);
    var noText = notes.filter(function (n) { return !n.text; }).length;
    var noDate = notes.filter(function (n) { return !(n.day || n.date); }).length;
    var dated = days.filter(function (d) { return d.day !== 'undated'; });
    var first = dated.length ? shortDay(dated[0].day) : null;
    var last = dated.length ? shortDay(dated[dated.length - 1].day) : null;

    var stats = '<div class="nfb-stats">'
      + '<div><b>' + notes.length + '</b><span>record' + (notes.length === 1 ? '' : 's') + '</span></div>'
      + '<div><b>' + days.length + '</b><span>day' + (days.length === 1 ? '' : 's') + ' of care</span></div>'
      + '<div class="nfb-span"><b>' + (first ? esc(first.mdy) + (last && last.mdy !== first.mdy ? ' <i>→</i> ' + esc(last.mdy) : '') : DASH)
      + '</b><span>date range</span></div>'
      + '</div>';

    var keys = (nfResult && nfResult.keys) || [];
    var keyLine = keys.length
      ? '<div class="nf-keys"><span>Fields in the payload</span><b>'
        + keys.map(function (k) { return '<code>' + esc(k) + '</code>'; }).join(' ') + '</b></div>'
      : '';
    var problems = [];
    if (noText) {
      problems.push(noText + ' of ' + notes.length + ' records came back with no readable text — '
        + '<code>normalizeNotes()</code> in <code>src/notesApi.js</code> is reading the wrong key. '
        + 'The field names above say which.');
    }
    if (noDate) {
      problems.push(noDate + ' record' + (noDate === 1 ? '' : 's') + ' had no readable date, so they cannot be '
        + 'placed in the run of treatment and are listed last.');
    }
    var verdict = problems.length
      ? '<div class="nf-warn"><b>' + problems.length + ' thing' + (problems.length === 1 ? '' : 's')
        + ' to fix in the adapter</b><span><ul class="nf-verdicts"><li>'
        + problems.join('</li><li>') + '</li></ul></span></div>'
      : '<div class="nf-ok-note">Every record has a date and text — the adapter matches this payload.</div>';
    var check = '<details class="nfb-adapter' + (problems.length ? ' is-bad' : '') + '"' + (problems.length ? ' open' : '') + '>'
      + '<summary>' + icon(problems.length ? 'alert' : 'check')
      + (problems.length ? problems.length + ' adapter issue' + (problems.length === 1 ? '' : 's') : 'Adapter matches this payload')
      + icon('chevron', 'nfb-chev') + '</summary>'
      + '<div class="nfb-adapter-body">' + keyLine + verdict + '</div></details>';

    return stats + check
      + '<div class="nfb-days">' + days.map(dayHTML).join('') + '</div>'
      + '<p class="nfb-foot">Read live from RecoverArc. Not stored in any chart.</p>';
  }

  function dayHTML(d) {
    var s = shortDay(d.day);
    var badge = s
      ? '<div class="nfb-date"><span>' + esc(s.m) + '</span><b>' + esc(s.d) + '</b><small>' + esc(s.w) + '</small></div>'
      : '<div class="nfb-date is-undated"><b>?</b><small>No date</small></div>';
    return '<section class="nfb-day">' + badge
      + '<div class="nfb-day-body">'
      + '<header><h4>' + esc(d.label) + '</h4>'
      + '<span>' + d.notes.length + ' note' + (d.notes.length === 1 ? '' : 's') + '</span></header>'
      + '<ol class="nfb-notes">' + d.notes.map(noteHTML).join('') + '</ol>'
      + '</div></section>';
  }

  function noteHTML(n) {
    if (!n.text) {
      return '<li class="nfb-note is-raw"><pre class="nf-raw">'
        + esc(JSON.stringify(n.raw || n, null, 2)) + '</pre></li>';
    }
    return '<li class="nfb-note"><p>' + esc(n.text) + '</p></li>';
  }

  async function loadStatus(force) {
    if (nfStatus && !force) return;
    try {
      nfStatus = await window.ctgApiFetch('/api/notes-form/status');
      nfError = '';
    } catch (e) {
      nfStatus = null;
      nfError = (e && e.message) || 'Could not read the integration status';
    }
    render();
  }

  async function probe() {
    var input = document.getElementById('nfKey');
    nfKey = input ? String(input.value || '').trim() : '';
    if (!nfKey) {
      if (typeof showToast === 'function') showToast('Enter a Notes Form patient id first', 'err');
      return;
    }
    nfBusy = true; nfError = ''; nfResult = null; nfShowRaw = false; nfErrDetail = null;
    render();
    try {
      nfResult = await window.ctgApiFetch('/api/notes-form/probe?key=' + encodeURIComponent(nfKey));
    } catch (e) {
      nfError = (e && e.message) || 'The probe failed';
      nfErrDetail = (e && e.body) || null;
    }
    nfBusy = false;
    render();
  }

  async function checkToken() {
    nfTokenBusy = true; nfTokenErr = ''; nfToken = null;
    render();
    try {
      nfToken = await window.ctgApiFetch('/api/notes-form/token');
    } catch (e) {
      nfTokenErr = (e && e.message) || 'Could not read the token';
    }
    nfTokenBusy = false;
    render();
  }

  window.renderNotesFormTest = function () { render(); loadStatus(false); };
  window.nfLoadStatus = function (force) { loadStatus(force); };
  window.nfProbe = function () { probe(); };
  window.nfCheckToken = function () { checkToken(); };
  window.nfProbeFake = function () {
    var input = document.getElementById('nfKey');
    if (input) input.value = 'patient-integration-test-does-not-exist';
    probe();
  };
  window.nfToggleRaw = function () { nfShowRaw = !nfShowRaw; render(); };
  window.nfProbeKey = function (key) {
    var input = document.getElementById('nfKey');
    if (input) input.value = String(key || '');
    probe();
  };
})();
