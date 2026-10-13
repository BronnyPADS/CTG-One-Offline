(function () {
  'use strict';

  var MAX_PER_GROUP = 5;     // one source can never crowd out the others
  var MAX_TOTAL = 24;

  var spOpen = false;
  var spQuery = '';
  var spActive = 0;
  var spResults = [];
  var spClaimCache = null;   // see spClaims() - rebuilt per open, not per keystroke
  var spLastFocus = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function can(pageKey) {
    return typeof window.ctgCanPage !== 'function' || window.ctgCanPage(pageKey);
  }
  function go(pageKey) {
    if (typeof window.showPage === 'function') window.showPage(pageKey);
  }

  function signedIn() {
    if (typeof window.ctgCurrentUser === 'function') return !!window.ctgCurrentUser();
    return !document.body.classList.contains('auth-active');
  }

  function scoreOne(hay, term) {
    var i = hay.indexOf(term);
    if (i === -1) return 0;
    if (i === 0) return 100;                                  // starts the field
    if (/[\s,.\-_/]/.test(hay.charAt(i - 1))) return 60;      // starts a word
    return 25;                                                // buried inside
  }
  function score(item, terms) {
    var hay = item._hay || (item._hay = (item.title + ' ' + (item.subtitle || '') + ' '
      + (item.keywords || '')).toLowerCase());
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var s = scoreOne(hay, terms[i]);
      if (!s) return 0;   // every term must land, or it is not a match
      total += s;
    }
    // A short title matching beats the same words buried in a long one.
    return total + Math.max(0, 24 - item.title.length) / 4;
  }

  /* ----------------------------------------------------------------- sources
     Each returns plain objects: { group, title, subtitle, icon, keywords, run }.
     A source that cannot run (page not granted, store not loaded) returns []
     rather than throwing - Spotlight must never be the thing that breaks. */

  function spNavHidden(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.style && n.style.display === 'none') return true;
    }
    return false;
  }
  /* Direct text nodes only: skips the icon and the count badge alike, so
     "Incomplete Day 1" does not come back as "Incomplete Day 1 2". */
  function spNavLabel(el) {
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) out += el.childNodes[i].nodeValue;
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  var spGroupByKey = null;
  function spPageGroup(key) {
    if (!spGroupByKey) {
      spGroupByKey = {};
      if (typeof window.ctgPages === 'function') {
        window.ctgPages().forEach(function (p) { spGroupByKey[p.key] = p.group; });
      }
    }
    return spGroupByKey[key] || '';
  }
  function spNav() {
    var nodes = document.querySelectorAll('.sidebar .side-section-label, .sidebar [data-page]');
    var section = '', out = [];
    Array.prototype.forEach.call(nodes, function (el) {
      // Document order, so the last label seen is the one this link sits under.
      if (el.classList.contains('side-section-label')) {
        if (!spNavHidden(el)) section = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return;
      }
      var key = el.getAttribute('data-page');
      if (!key || spNavHidden(el)) return;
      var label = spNavLabel(el);
      if (!label) return;
      var grp = el.closest ? el.closest('.side-group') : null;
      var toggle = grp && grp.querySelector('.side-group-toggle span');
      /* The links above the first section heading have no label of their own,
         so fall back to the group Access Control files them under - that is
         the name these pages are known by everywhere else. */
      var where = (toggle && (toggle.textContent || '').trim()) || section
        || spPageGroup(key) || 'Navigation';
      out.push({
        group: 'Go to', title: label, subtitle: where, icon: 'page', keywords: key,
        run: function () { go(key); }
      });
    });
    return out;
  }

  /* The sidebar is the source of truth, but it only exists once someone is
     signed in and applySidebar() has run. ctgPages() stays as the fallback so
     the palette is never empty. */
  function spPages() {
    var nav = spNav();
    if (nav.length) return nav;
    if (typeof window.ctgPages !== 'function') return [];
    return window.ctgPages().filter(function (p) { return can(p.key); }).map(function (p) {
      return {
        group: 'Go to', title: p.label, subtitle: p.group, icon: 'page', keywords: p.key,
        run: function () { go(p.key); }
      };
    });
  }

  /* Admin Center is ten destinations behind one sidebar link - Audit Logging,
     Backup & Restore, Privacy Requests and the rest are places people look for
     by name, and none of them were reachable from search. */
  function spAdminTabs() {
    if (!can('accessControl')) return [];
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-ac-tab]'), function (el) {
      var key = el.getAttribute('data-ac-tab');
      var label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!key || !label) return;
      out.push({
        group: 'Admin Center', title: label, subtitle: 'Admin Center', icon: 'shield', keywords: key,
        run: function () {
          go('accessControl');
          // After showPage has built the panel, or the tab has nothing to open.
          if (typeof window.acSwitchTab === 'function') setTimeout(function () { window.acSwitchTab(key); }, 0);
        }
      });
    });
    return out;
  }

  function spPatients() {
    if (typeof ctgPatients === 'undefined' || !Array.isArray(ctgPatients)) return [];
    if (!can('patientLists')) return [];
    return ctgPatients.map(function (p) {
      var d = p.demographics || {};
      var name = (typeof naturalPatientName === 'function') ? naturalPatientName(p)
        : ((d.firstName || '') + ' ' + (d.lastName || '')).trim();
      var bits = [];
      if (d.dob) bits.push('DOB ' + d.dob);
      if (d.mobile || d.phone) bits.push(d.mobile || d.phone);
      if (p.inactive) bits.push('Inactive');
      return {
        group: 'Patients', title: name || 'Unnamed patient',
        subtitle: bits.join(' · '), icon: 'patient',
        keywords: [d.email, p.id, d.caseType].filter(Boolean).join(' '),
        run: function () {
          go('patientLists');
          if (typeof selectPatient === 'function') selectPatient(p.id);
        }
      };
    });
  }

  function spAppointments() {
    if (typeof ctgAppointments === 'undefined' || !Array.isArray(ctgAppointments)) return [];
    if (!can('appointment')) return [];
    return ctgAppointments.map(function (a) {
      var when = [a.date, a.start].filter(Boolean).join(' ');
      return {
        group: 'Appointments', title: a.patientName || 'Appointment',
        subtitle: [when, a.visitType, a.facility].filter(Boolean).join(' · '),
        icon: 'calendar',
        keywords: [a.provider, a.status, a.notes].filter(Boolean).join(' '),
        run: function () { go('appointment'); }
      };
    });
  }

  /* Claims are DERIVED - wcAllClaims() walks every patient's billing tables
     so unlike the other sources this one is genuinely expensive. Built once
     when the palette opens and thrown away when it closes, never per
     keystroke. */
  function spClaims() {
    if (typeof wcAllClaims !== 'function') return [];
    if (!can('arSummary') && !can('collectionMgmt')) return [];
    if (spClaimCache) return spClaimCache;
    var rows = [];
    try { rows = wcAllClaims() || []; } catch (e) { rows = []; }
    spClaimCache = rows.map(function (c) {
      return {
        group: 'Claims', title: c.patientName || 'Claim',
        subtitle: [c.billDate, c.status, c.total != null ? ('$' + c.total) : ''].filter(Boolean).join(' · '),
        icon: 'claim',
        keywords: [c.claimNumber, c.provider, c.payer].filter(Boolean).join(' '),
        run: function () {
          go(can('arSummary') ? 'arSummary' : 'collectionMgmt');
          if (c.patientId && typeof selectPatient === 'function') selectPatient(c.patientId);
        }
      };
    });
    return spClaimCache;
  }

  function spContacts() {
    if (typeof window.ctgContactsAll !== 'function' || !can('contacts')) return [];
    var rows = [];
    try { rows = window.ctgContactsAll() || []; } catch (e) { rows = []; }
    return rows.map(function (c) {
      var name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
      return {
        group: 'Providers & Contacts', title: name || 'Contact',
        subtitle: [c.category, c.organization, c.phone || c.mobile].filter(Boolean).join(' · '),
        icon: 'contact',
        keywords: [c.email, c.specialty, c.notes].filter(Boolean).join(' '),
        run: function () { go('contacts'); }
      };
    });
  }

  function spForms() {
    if (typeof window.ctgFormCatalog !== 'function' || !can('intakeForm')) return [];
    return window.ctgFormCatalog().map(function (f) {
      return {
        group: 'Forms', title: f.label || f.key, subtitle: 'Patient form',
        icon: 'form', keywords: f.key,
        run: function () { go('intakeForm'); }
      };
    });
  }

  var SOURCES = [spPages, spAdminTabs, spPatients, spAppointments, spClaims, spContacts, spForms];

  function collect() {
    var all = [];
    for (var i = 0; i < SOURCES.length; i++) {
      try { all = all.concat(SOURCES[i]() || []); }
      catch (e) { /* one broken source must not empty the whole palette */ }
    }
    return all;
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    /* Empty query shows the destinations, which is the useful default: it
       makes Ctrl+K a keyboard nav menu before anyone has typed anything. */
    if (!terms.length) return spPages().slice(0, 8);

    var scored = [];
    var all = collect();
    for (var i = 0; i < all.length; i++) {
      var s = score(all[i], terms);
      if (s > 0) { all[i]._score = s; scored.push(all[i]); }
    }
    scored.sort(function (a, b) { return b._score - a._score || a.title.localeCompare(b.title); });

    /* Capped per group so one big roster cannot push every other kind of
       result off the list - the point is that this searches the whole
       portal, not whichever table happens to be largest. */
    var perGroup = {}, out = [];
    for (var j = 0; j < scored.length && out.length < MAX_TOTAL; j++) {
      var g = scored[j].group;
      perGroup[g] = (perGroup[g] || 0) + 1;
      if (perGroup[g] <= MAX_PER_GROUP) out.push(scored[j]);
    }
    return out;
  }

  /* -------------------------------------------------------------------- UI */
  var ICONS = {
    page: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16"/>',
    patient: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    claim: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 18h4"/>',
    contact: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    form: '<path d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
  };
  function icon(name) {
    return '<span class="sp-tile">'
      + '<svg class="sp-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (ICONS[name] || ICONS.page) + '</svg></span>';
  }

  function host() {
    var el = document.getElementById('spotlightHost');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spotlightHost';
      document.body.appendChild(el);
    }
    return el;
  }

  function paintResults() {
    var list = document.getElementById('spList');
    if (!list) return;
    if (!spResults.length) {
      list.innerHTML = '<div class="sp-empty"><b>Nothing matches “' + esc(spQuery) + '”</b>'
        + '<span>Try a patient name, a date, or the name of a page.</span></div>';
      return;
    }
    var html = '', lastGroup = '';
    for (var i = 0; i < spResults.length; i++) {
      var r = spResults[i];
      if (r.group !== lastGroup) {
        html += '<div class="sp-group">' + esc(r.group) + '</div>';
        lastGroup = r.group;
      }
      html += '<button type="button" class="sp-row' + (i === spActive ? ' on' : '') + '" data-i="' + i + '">'
        + icon(r.icon)
        + '<span class="sp-txt"><b>' + esc(r.title) + '</b>'
        + (r.subtitle ? '<i>' + esc(r.subtitle) + '</i>' : '') + '</span>'
        + '<span class="sp-enter">↵</span></button>';
    }
    list.innerHTML = html;
    var on = list.querySelector('.sp-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function rerun() {
    spResults = search(spQuery);
    spActive = 0;
    paintResults();
  }

  function open() {
    if (spOpen) return;
    spOpen = true;
    spQuery = '';
    spClaimCache = null;
    spLastFocus = document.activeElement;
    host().innerHTML =
      '<div class="sp-back" id="spBack">'
      + '<div class="sp-card" role="dialog" aria-modal="true" aria-label="Search the portal">'
        + '<div class="sp-inputrow">'
          + '<svg class="sp-searchi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
          + '<input type="text" id="spInput" autocomplete="off" spellcheck="false" '
            + 'placeholder="Search patients, appointments, claims, forms, pages…" aria-label="Search the portal">'
          + '<button type="button" class="sp-esc" id="spClose">esc</button>'
        + '</div>'
        + '<div class="sp-list" id="spList"></div>'
        + '<div class="sp-foot">'
          + '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>esc</b> close</span>'
          + '<span class="sp-foot-note">Searches only what your account can already open</span>'
        + '</div>'
      + '</div></div>';
    document.body.classList.add('sp-open');
    rerun();

    var input = document.getElementById('spInput');
    input.addEventListener('input', function () { spQuery = input.value; rerun(); });
    document.getElementById('spClose').onclick = close;
    document.getElementById('spBack').addEventListener('mousedown', function (e) {
      if (e.target && e.target.id === 'spBack') close();
    });
    document.getElementById('spList').addEventListener('click', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.sp-row') : null;
      if (row) run(parseInt(row.getAttribute('data-i'), 10));
    });
    setTimeout(function () { input.focus(); }, 20);
  }

  function close() {
    if (!spOpen) return;
    spOpen = false;
    spClaimCache = null;
    host().innerHTML = '';
    document.body.classList.remove('sp-open');
    // Put the caret back where it was, so Ctrl+K mid-form is not a trap.
    try { if (spLastFocus && spLastFocus.focus) spLastFocus.focus(); } catch (e) {}
    spLastFocus = null;
  }

  function run(i) {
    var r = spResults[i];
    if (!r) return;
    close();
    try { r.run(); } catch (e) { console.error('Spotlight action failed', e); }
  }

  function toggle() { if (spOpen) close(); else open(); }

  document.addEventListener('keydown', function (e) {
    /* Ctrl+K / Cmd+K from anywhere, text fields included - the point is that
       it is reachable without leaving what you are doing. preventDefault() is
       what stops the browser's own Ctrl+K (focus the address bar), so it has
       to run before anything can return early. */
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      if (!signedIn()) return;
      e.preventDefault();
      toggle();
      return;
    }
    if (!spOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); spActive = Math.min(spActive + 1, spResults.length - 1); paintResults(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); spActive = Math.max(spActive - 1, 0); paintResults(); return; }
    if (e.key === 'Enter') { e.preventDefault(); run(spActive); }
  });

  window.ctgSpotlight = { open: open, close: close, toggle: toggle };
  window.ctgOpenSpotlight = function () { open(); };
})();
