(function () {
  'use strict';

  let mtgList = [];
  let mtgLobby = [];          // guests currently knocking, across all meetings
  let mtgLobbySig = '';       // last rendered lobby state; see mtgRefreshLobby
  let mtgActive = null;       // The meeting we are in, and whether staff have confirmed the patient is
// actually present. That is separate from being admitted; see the note on
// the /checkin route. Reset whenever a new meeting is joined, so a
// confirmation never carries over into the next patient's visit.
  let mtgPatientChecked = false;
  let mtgCheckinBusy = false;
  let mtgReadyForProvider = false;
  let mtgReadyBusy = false;

  let mtgTouchOpen = false;
  let mtgTouchQueue = [];     // every other slot worth a look, soonest/most urgent first
  let mtgTouchPoll = null;
  let mtgCall = null, mtgAgent = null, mtgDeviceMgr = null;
  let mtgLastJoinPrefs = null;   // device/background choices carried between rooms
  let mtgLocalStream = null, mtgLocalView = null, mtgLocalRenderer = null;
  let mtgRemoteViews = {};    // acsUserId -> { renderer, view }
  let mtgMuted = false, mtgVideoOn = false;
  let mtgDocked = false;
  // Did screen sharing dock it? Only then does stopping the share undock.
  let mtgDockedByShare = false;

  let mtgOverlayEl = null;
  function mtgOverlay() {
    if (mtgOverlayEl && mtgOverlayEl.isConnected) return mtgOverlayEl;
    mtgOverlayEl = document.getElementById('mtgCallOverlay');
    return mtgOverlayEl;
  }

  function mtgOverlayClass() {
    /* Floating replaces docking rather than stacking with it: the docked rules
       position a card inside the portal, which is meaningless once the call is
       its own OS window. mtgDocked itself is left alone, so closing the
       floating window puts the card back where it was. */
    if (mtgMiniWin && !mtgMiniWin.closed) return 'mtg-call mini';
    return 'mtg-call' + (mtgDocked ? ' docked' : '');
  }
  let mtgMiniWin = null;      // the Document Picture-in-Picture window
  let mtgTimer = null, mtgStartedAt = 0;
  let mtgMyAcsId = '';        // my own ACS id - how other clients key my tile

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mtgAltDoc() {
    const el = mtgOverlay();
    const doc = el && el.ownerDocument;
    return (doc && doc !== document) ? doc : null;
  }

  const toast = function (m, k) {
    const doc = mtgAltDoc();
    if (doc) return mtgLocalToast(doc, m, k);
    if (typeof showToast === 'function') showToast(m, k);
  };

  function mtgLocalToast(doc, msg, kind) {
    let host = doc.getElementById('mtgToastHost');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'mtgToastHost';
      host.className = 'mtg-toast-host';
      doc.body.appendChild(host);
    }
    const t = doc.createElement('div');
    t.className = 'mtg-toast' + (kind === 'err' ? ' err' : (kind === 'ok' ? ' ok' : ''));
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 5200);
  }

  /* A confirmation that appears where the meeting is. Falls straight through
     to the portal's ctgConfirm whenever the call is in the portal's own
     window, so the normal case is unchanged. */
  function mtgAsk(message, opts) {
    opts = opts || {};
    const doc = mtgAltDoc();
    if (!doc) {
      return (typeof ctgConfirm === 'function') ? ctgConfirm(message, opts) : Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      const win = doc.defaultView;
      const box = doc.createElement('div');
      box.className = 'mtg-ask';
      box.innerHTML = '<div class="mtg-ask-card" role="alertdialog" aria-modal="true">'
        + '<div class="mtg-ask-title">' + esc(opts.title || 'Please confirm') + '</div>'
        + '<div class="mtg-ask-body">' + esc(message) + '</div>'
        + '<div class="mtg-ask-actions">'
          + '<button class="mtg-ask-btn" data-a="0">' + esc(opts.cancelLabel || 'Cancel') + '</button>'
          + '<button class="mtg-ask-btn primary' + (opts.danger ? ' danger' : '') + '" data-a="1">'
          + esc(opts.okLabel || 'OK') + '</button>'
        + '</div></div>';

      let settled = false;
      const done = function (v) {
        if (settled) return;
        settled = true;
        doc.removeEventListener('keydown', onKey, true);
        if (win) win.removeEventListener('pagehide', onGone);
        try { box.remove(); } catch (e) {}
        resolve(v);
      };
      /* The window can be closed out from under an open question. Answering
         "no" is the safe reading, and it stops the caller awaiting forever. */
      const onGone = function () { done(false); };
      const onKey = function (ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); done(false); }
        else if (ev.key === 'Enter') { ev.stopPropagation(); done(true); }
      };
      box.addEventListener('click', function (ev) {
        const b = ev.target.closest && ev.target.closest('[data-a]');
        if (b) return done(b.getAttribute('data-a') === '1');
        if (ev.target === box) done(false);
      });
      doc.addEventListener('keydown', onKey, true);
      if (win) win.addEventListener('pagehide', onGone);
      /* On body, not on the overlay: mtgRenderCall() rewrites the overlay's
         innerHTML on every participant change, which would delete the dialog
         mid-question and leave the promise pending. */
      doc.body.appendChild(box);
      const ok = box.querySelector('.mtg-ask-btn.primary');
      if (ok) ok.focus();
    });
  }

  /* The clinic's wall clock, for the top-right of the stage. Appointment times
     are wall-clock everywhere else in the portal, so the one in the call has to
     agree with the one on the schedule. */
  const mtgWallClock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  var mtgAudioCtx = null;

  function mtgTone(notes, step, peak) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!mtgAudioCtx) mtgAudioCtx = new AC();
      // Browsers start the context suspended until a gesture; joining a call
      // is one, but resume defensively in case this is the first sound.
      if (mtgAudioCtx.state === 'suspended') mtgAudioCtx.resume().catch(function () {});
      const t0 = mtgAudioCtx.currentTime;
      notes.forEach(function (freq, i) {
        const osc = mtgAudioCtx.createOscillator();
        const gain = mtgAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = t0 + i * step;
        /* Ramped rather than gated. Switching a sine on and off at full
           amplitude produces an audible click at each edge, which on a soft
           two-note chime is most of what you would hear. */
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + step);
        osc.connect(gain); gain.connect(mtgAudioCtx.destination);
        osc.start(start);
        osc.stop(start + step + 0.03);
      });
    } catch (e) { /* a chime is never worth breaking a call over */ }
  }


  var mtgMeter = { ctx: null, raf: 0, stream: null, on: false, quietSince: 0 };

  /* The microphone the meeting is actually using, so the ring is measuring the
     same device the far end is hearing rather than the system default. */
  function mtgSelfMicId() {
    try { return (mtgDeviceMgr && mtgDeviceMgr.selectedMicrophone && mtgDeviceMgr.selectedMicrophone.id) || ''; }
    catch (e) { return ''; }
  }

  window.mtgSelfMeter = {
    start: function (deviceId, onChange) {
      window.mtgSelfMeter.stop();
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !navigator.mediaDevices) return;
      var want = deviceId ? { deviceId: { exact: deviceId } } : true;
      navigator.mediaDevices.getUserMedia({ audio: want }).then(function (stream) {
        mtgMeter.stream = stream;
        try {
          mtgMeter.ctx = new AC();
          if (mtgMeter.ctx.state === 'suspended') mtgMeter.ctx.resume().catch(function () {});
          var src = mtgMeter.ctx.createMediaStreamSource(stream);
          var an = mtgMeter.ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          var buf = new Uint8Array(an.fftSize);
          var tick = function () {
            if (!mtgMeter.ctx) return;
            an.getByteTimeDomainData(buf);
            var sum = 0;
            for (var i = 0; i < buf.length; i++) { var d = (buf[i] - 128) / 128; sum += d * d; }
            var rms = Math.sqrt(sum / buf.length);
            var now = Date.now();
            /* Held for a moment after the level drops. Speech has gaps between
               words, and a ring that blinks on every one of them is worse than
               no ring at all. */
            if (rms > 0.045) { mtgMeter.quietSince = 0; if (!mtgMeter.on) { mtgMeter.on = true; onChange(true); } }
            else {
              if (!mtgMeter.quietSince) mtgMeter.quietSince = now;
              if (mtgMeter.on && now - mtgMeter.quietSince > 400) { mtgMeter.on = false; onChange(false); }
            }
            mtgMeter.raf = requestAnimationFrame(tick);
          };
          mtgMeter.raf = requestAnimationFrame(tick);
        } catch (e) { window.mtgSelfMeter.stop(); }
      }).catch(function () { /* no mic, or refused - the ring just stays dark */ });
    },
    stop: function () {
      if (mtgMeter.raf) cancelAnimationFrame(mtgMeter.raf);
      mtgMeter.raf = 0;
      if (mtgMeter.ctx) { try { mtgMeter.ctx.close(); } catch (e) {} mtgMeter.ctx = null; }
      if (mtgMeter.stream) {
        try { mtgMeter.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        mtgMeter.stream = null;
      }
      mtgMeter.on = false; mtgMeter.quietSince = 0;
    }
  };

  var mtgSpeaking = {};

  function mtgSetSpeaking(key, on) {
    if (!key) return;
    if (on) mtgSpeaking[key] = true; else delete mtgSpeaking[key];
    mtgPaintSpeaking();
  }

  function mtgPaintSpeaking() {
    var root = mtgOverlay();
    if (!root) return;
    root.querySelectorAll('.mtg-tile').forEach(function (tile) {
      var holder = tile.querySelector('.mtg-tile-video');
      var id = holder ? String(holder.id).replace(/^mtgV_/, '') : '';
      tile.classList.toggle('speaking', !!mtgSpeaking[id]);
    });
  }
  window.mtgPaintSpeaking = mtgPaintSpeaking;

  window.mtgPlayJoin = function () { mtgTone([587.33, 880.00], 0.12, 0.13); };  // D5 -> A5, rising
  window.mtgPlayLeave = function () { mtgTone([587.33, 392.00], 0.15, 0.11); }; // D5 -> G4, falling

  /* Walking into a room of five should not fire five chimes. The SDK reports
     everyone already present as "added" the moment you connect, so sounds stay
     muted for a moment after joining. */
  var mtgJoinedAt = 0;
  window.mtgSoundsReady = function () { return !!mtgJoinedAt && (Date.now() - mtgJoinedAt) > 2500; };
  window.mtgMarkJoined = function () { mtgJoinedAt = Date.now(); };

  /* ---------------- data ---------------- */

  async function mtgLoad() {
    // The server refuses the list without "View Meetings"; say so plainly
    // rather than showing an empty page, and do not poll for anything.
    if (!mtgCan('mtg.view')) { mtgList = []; mtgRenderList(); return; }
    try {
      const d = await window.ctgApiFetch('/api/meetings');
      mtgList = (d && d.meetings) || [];
    } catch (e) { mtgList = []; }
    mtgRenderList();
    mtgRefreshLobby();
  }
  window.ctgLoadMeetings = mtgLoad;

  async function mtgRefreshLobby() {
    // Only live meetings can have anyone waiting.
    const live = mtgList.filter(m => m.status === 'live');
    let all = [];
    for (const m of live) {
      try {
        const d = await window.ctgApiFetch('/api/meetings/' + m.id + '/lobby');
        ((d && d.waiting) || []).forEach(g => all.push(Object.assign({ meetingId: m.id, meetingTitle: m.title }, g)));
        // Who is in the room BY LINK, for the meeting you are actually in.
        // The calling SDK's roster knows only ACS ids and cannot tell a link
        // guest from a colleague, so this is the only list that can.
        if (mtgActive && mtgActive.id === m.id) mtgGuests = (d && d.guests) || [];
      } catch (e) { /* a meeting ended mid-poll */ }
    }
    mtgLobby = all;
    const sig = JSON.stringify([
      all.map(g => g.meetingId + ':' + g.guestId + ':' + g.displayName),
      (mtgGuests || []).map(g => g.guestId + ':' + g.displayName + ':' + g.state)
    ]);
    const changed = sig !== mtgLobbySig;
    mtgLobbySig = sig;
    if (changed) {
      mtgRenderLobby();
      /* The roster inside the call has its own copy of this list. Without this
         a knock only ever updated the meetings PAGE - so a host who was already
         in the meeting, which is the normal case, never saw anyone arrive. */
      if (mtgActive && mtgOverlay()) mtgRenderCall();
    }
    const badge = document.getElementById('mtgLobbyBadge');
    if (badge) { badge.textContent = String(all.length); badge.style.display = all.length ? '' : 'none'; }
  }

  const MTG_LOBBY_POLL_MS = 5000;
  let mtgLobbyPoll = null;
  let mtgLobbyBusy = false;

  function mtgLobbyPollDue() {
    if (document.hidden) return false;              // background tab
    if (mtgActive) return true;                     // in a call: always relevant
    const page = document.getElementById('page-meetings');
    return !!(page && page.offsetParent !== null);  // meetings page on screen
  }

  async function mtgLobbyTick() {
    if (mtgLobbyBusy || !mtgLobbyPollDue()) return;
    mtgLobbyBusy = true;
    try { await mtgRefreshLobby(); }
    catch (e) { /* transient: the next tick tries again */ }
    finally { mtgLobbyBusy = false; }
  }

  clearInterval(mtgLobbyPoll);
  mtgLobbyPoll = setInterval(mtgLobbyTick, MTG_LOBBY_POLL_MS);

  /* Coming back to the tab should not wait out a whole interval - a host who
     alt-tabs away while someone knocks would otherwise stare at an empty
     lobby for five seconds. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) mtgLobbyTick();
  });

  // Realtime: a guest knocking must appear without the host refreshing.
  window.ctgMeetingsRealtime = function (type, payload) {
    /* "End meeting for everyone" used to send only a list refresh, so a
       colleague sitting IN the room had their meetings list quietly updated
       behind the call overlay and stayed in a meeting the host had closed.
       This is aimed at the call itself. */
    if (type === 'meeting:ended') { mtgRoomClosed(payload && payload.meetingId, payload && payload.reason); return; }
    // Hands and renames travel on the same response as chat, so one reload
    // picks up all three.
    if (type === 'meeting:chat' || type === 'meeting:room') { mtgLoadChat(); return; }
    if (type === 'meeting:knock' || type === 'meeting:lobby') mtgRefreshLobby();
    else if (type === 'meeting:recording') { mtgSyncRecording(); mtgLoadRecordings(); }
    else if (type === 'data:meetings') mtgLoad();
  };

  /* The host closed this room. Leave it - but through mtgLeave, so the
     end-of-meeting transcript still lands on this machine on the way out. */
  let mtgClosing = false;
  function mtgRoomClosed(meetingId, reason) {
    if (!mtgActive || !meetingId || mtgActive.id !== meetingId) { mtgLoad(); return; }
    if (mtgClosing) return;
    mtgClosing = true;
    toast(reason === 'cancelled' ? 'This meeting was cancelled.' : 'The host ended this meeting.', 'err');
    try { mtgLeave(); } finally { setTimeout(function () { mtgClosing = false; }, 3000); }
  }

  /* ---------------- list ---------------- */

  function mtgWhen(m) {
    if (m.status === 'live') return 'In progress';
    if (!m.scheduledFor) return 'Instant';
    const d = new Date(m.scheduledFor);
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  const MTG_PER_PAGE = 10;
  let mtgPage = 1;

  window.mtgGoPage = function (n) {
    mtgPage = n;
    mtgRenderList();
    const box = document.getElementById('mtgList');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /* Windowed page numbers: first, last, and the three around the current one,
     with gaps marked. Printing all of them is fine at 4 pages and unusable at
     40. */
  function mtgPagerHtml(total, pages, from, shown) {
    if (pages <= 1) return '';
    const want = new Set([1, pages, mtgPage - 1, mtgPage, mtgPage + 1]);
    let out = '', prev = 0;
    for (let n = 1; n <= pages; n++) {
      if (!want.has(n)) continue;
      if (n - prev > 1) out += '<span class="mtg-pager-gap">…</span>';
      out += '<button class="mtg-pager-num' + (n === mtgPage ? ' active' : '') + '"'
        + (n === mtgPage ? ' aria-current="page"' : '')
        + ' data-onclick="mtgGoPage(' + n + ')">' + n + '</button>';
      prev = n;
    }
    return '<div class="mtg-pager" role="navigation" aria-label="Meeting list pages">'
      + '<span class="mtg-pager-count">' + (from + 1) + '–' + (from + shown) + ' of ' + total + '</span>'
      + '<div class="mtg-pager-btns">'
        + '<button class="mtg-pager-step" data-onclick="mtgGoPage(' + (mtgPage - 1) + ')"'
          + (mtgPage <= 1 ? ' disabled' : '') + ' aria-label="Previous page">‹ Prev</button>'
        + out
        + '<button class="mtg-pager-step" data-onclick="mtgGoPage(' + (mtgPage + 1) + ')"'
          + (mtgPage >= pages ? ' disabled' : '') + ' aria-label="Next page">Next ›</button>'
      + '</div></div>';
  }

  function mtgRenderList() {
    const box = document.getElementById('mtgList');
    if (!box) return;
    ['mtgScheduleBtn', 'mtgInstantBtn'].forEach(function (id) {
      const b = document.getElementById(id);
      if (b) b.style.display = mtgCan('mtg.view') && mtgCan('mtg.create') ? '' : 'none';
    });
    if (!mtgCan('mtg.view')) {
      box.innerHTML = '<div class="patient-empty">Your account does not have access to meetings. An administrator can turn on View Meetings in Access Control.</div>';
      return;
    }
    if (!mtgList.length) {
      box.innerHTML = '<div class="patient-empty">No meetings yet. Start an instant meeting or schedule one, then send the guest link to anyone you want in the room.</div>';
      return;
    }

    /* Live rooms are pinned to the front before slicing. Paging must never be
       able to hide the one meeting somebody is sitting in right now - and it
       could, since a room that has been running a while is not the newest row.
       Everything else keeps the order the API sent. */
    const rows = mtgList
      .map((m, i) => [m, i])
      .sort((a, b) => ((b[0].status === 'live') - (a[0].status === 'live')) || (a[1] - b[1]))
      .map(pair => pair[0]);

    const pages = Math.max(1, Math.ceil(rows.length / MTG_PER_PAGE));
    // Clamp rather than reset: cancelling the last meeting on page 5 should
    // land on the new page 4, not back at the top of the list.
    mtgPage = Math.min(Math.max(1, mtgPage), pages);
    const from = (mtgPage - 1) * MTG_PER_PAGE;
    const page = rows.slice(from, from + MTG_PER_PAGE);

    box.innerHTML = '<div class="mtg-rows">' + page.map(m => {
      const live = m.status === 'live';
      const ended = m.status === 'ended';
      return '<div class="mtg-row' + (live ? ' is-live' : '') + '">'
        + '<div class="mtg-row-main">'
          + '<div class="mtg-row-title">' + esc(m.title)
            + (live ? '<span class="mtg-live">● LIVE</span>' : '') + '</div>'
          + '<div class="mtg-row-sub">' + esc(mtgWhen(m)) + ' · Host ' + esc(m.hostName)
            + (m.notes ? ' · ' + esc(m.notes) : '') + '</div>'
        + '</div>'
        + '<div class="mtg-row-actions">'
          + (ended ? '<span class="small-muted">Ended</span>'
            : (mtgCan('mtg.invite') ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgCopyLink(\'' + m.id + '\')">Get guest link</button>' : '')
              + '<button class="btn btn-primary btn-sm" data-onclick="mtgJoin(\'' + m.id + '\')">' + (live ? 'Join' : 'Start') + '</button>'
              + (mtgCan('mtg.create') ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgCancel(\'' + m.id + '\')">Cancel</button>' : ''))
        + '</div></div>';
    }).join('') + '</div>'
      + mtgPagerHtml(rows.length, pages, from, page.length);
  }

  /* Section-level access from Access Control -> Meeting Rooms. A missing helper
     or an unconfigured account defaults to allowed, so nothing is taken away
     from anyone who already had it; an admin opts in to restricting a capability
     by turning its section off for a specific account. */
  function mtgCan(section) {
    return typeof window.ctgCanSection !== 'function' || window.ctgCanSection('meetings', section);
  }
  const MTG_REMOVE_ROLES = ['admin', 'ta', 'compliance'];
  function mtgCanRemoveGuests() {
    const u = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
    return MTG_REMOVE_ROLES.indexOf(u.role) !== -1 && mtgCan('mtg.host');
  }

  function mtgGuestRowHtml(g) {
    const name = g.displayName || 'Guest';
    return '<div class="mtg-side-row mtg-side-guest">'
      + '<span class="im-call-avatar tiny">' + esc(mtgInitials(name).toUpperCase()) + '</span>'
      + '<span class="mtg-side-name">' + esc(name) + '</span>'
      + '<span class="mtg-guest-tag">Link</span>'
      + (mtgCanRemoveGuests()
          ? '<button class="mtg-side-remove" data-onclick="mtgRemoveGuest(\'' + esc(g.id) + '\',\''
              + esc(name).replace(/'/g, '&#39;') + '\')" title="Remove ' + esc(name) + ' from this meeting"'
              + ' aria-label="Remove ' + esc(name) + ' from this meeting">' + ICON_REMOVE + '</button>'
          : '')
      + '</div>';
  }

  var ICON_REMOVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>'
    + '<circle cx="9" cy="7" r="4"/><path d="M17 8l5 5M22 8l-5 5"/></svg>';

  /* Removing somebody from a live clinical session is not undoable - their
     link is spent and they have to knock again - so it asks first, by name. */
  window.mtgRemoveGuest = async function (guestId, name) {
    if (!mtgActive || !mtgActive.id) return;
    const msg = name + ' will be dropped from this meeting straight away. Their guest link stops working, '
      + 'so they would have to be sent a new one and admitted again.';
    const ok = await mtgAsk(msg, { title: 'Remove ' + name + '?', okLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(mtgActive.id)
        + '/remove/' + encodeURIComponent(guestId), { method: 'POST' });
      /* Out of the call itself, not just off the list (CTG-SEC-085): their own
         page hangs up when told, but a page that does not would stay in. */
      const p = (r && r.acsUserId) ? mtgFindRemote(r.acsUserId) : null;
      if (p && mtgCall) { try { await mtgCall.removeParticipant(p.identifier); } catch (e) { console.error('Could not drop the guest from the call', e); } }
      toast(name + ' was removed from the meeting', 'ok');
      mtgRefreshLobby();
    } catch (e) { toast(e.message || 'Could not remove them', 'err'); }
  };

  function mtgLobbyRowHtml(g) {
    return '<div class="mtg-side-row mtg-side-knock">'
      + '<span class="im-call-avatar tiny">' + esc((g.displayName || '?').slice(0, 2).toUpperCase()) + '</span>'
      + '<span class="mtg-side-name">' + esc(g.displayName || 'Guest') + '</span>'
      + '<button class="mtg-deny" title="Deny" data-onclick="mtgDecide(\'' + esc(g.meetingId) + '\',\'' + esc(g.id) + '\',false)">✕</button>'
      + '<button class="mtg-admit" title="Admit" data-onclick="mtgDecide(\'' + esc(g.meetingId) + '\',\'' + esc(g.id) + '\',true)">✓</button>'
      + '</div>';
  }

  function mtgRenderLobby() {
    const wrap = document.getElementById('mtgLobbyWrap');
    if (!wrap) return;
    if (!mtgLobby.length || !mtgCan('mtg.host')) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<div class="card mtg-lobby"><div class="card-body">'
      + '<div class="sdiv"><span>Request to Join</span></div>'
      + mtgLobby.map(g =>
        '<div class="mtg-lobby-row">'
        + '<span class="im-call-avatar tiny">' + esc((g.displayName || '?').slice(0, 2).toUpperCase()) + '</span>'
        + '<div class="mtg-lobby-name">' + esc(g.displayName)
          + '<span class="small-muted"> · ' + esc(g.meetingTitle) + '</span></div>'
        + '<button class="mtg-deny" title="Deny" data-onclick="mtgDecide(\'' + g.meetingId + '\',\'' + g.id + '\',false)">✕</button>'
        + '<button class="mtg-admit" title="Admit" data-onclick="mtgDecide(\'' + g.meetingId + '\',\'' + g.id + '\',true)">✓</button>'
        + '</div>').join('')
      + '</div></div>';
  }

  /* ---------------- actions ---------------- */

  /* Create and schedule dialog. Replaces two chained window.prompt() boxes,
     which looked like a browser error, gave no validation and made scheduling
     a date awkward. A real form also lets the date and duration be native
     inputs rather than free text the user has to format correctly. */
  function mtgDialogEl() {
    let el = document.getElementById('mtgNewModal');
    if (!el) { el = document.createElement('div'); el.id = 'mtgNewModal'; document.body.appendChild(el); }
    return el;
  }

  function mtgOpenNew(scheduled) {
    const el = mtgDialogEl();
    // Default to the next round half-hour - a sensible starting point rather
    // than an empty box.
    const d = new Date(Date.now() + 30 * 60000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">' + (scheduled ? 'Schedule a meeting' : 'New instant meeting') + '</div>'
      + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:16px">'
        + (scheduled ? 'Everyone joins from one link. They need no account.'
                     : 'Starts right away. You will get a link to send to anyone you want in the room.')
      + '</div>'
      + '<label class="mtg-f-label">Meeting name</label>'
      + '<input type="text" id="mtgNewTitle" maxlength="200" placeholder="e.g. Case review with Atty. Cruz">'
      + (scheduled
          ? '<div class="mtg-f-row">'
            + '<div><label class="mtg-f-label">Date &amp; time</label>'
              + '<input type="datetime-local" id="mtgNewWhen" value="' + local + '"></div>'
            + '<div><label class="mtg-f-label">Length</label>'
              + '<select id="mtgNewDur">'
                + '<option value="15">15 minutes</option>'
                + '<option value="30" selected>30 minutes</option>'
                + '<option value="45">45 minutes</option>'
                + '<option value="60">1 hour</option>'
                + '<option value="90">1.5 hours</option>'
                + '<option value="120">2 hours</option>'
              + '</select></div></div>'
          : '')
      + '<label class="mtg-f-label">Note <span class="small-muted">(optional)</span></label>'
      + '<input type="text" id="mtgNewNote" maxlength="200" placeholder="What is this meeting about?">'
      + '<div id="mtgNewErr" class="mtg-f-err"></div>'
      + '<div class="mtg-modal-actions">'
        + '<button class="btn btn-ghost" data-onclick="mtgCloseNew()">Cancel</button>'
        + '<button class="btn btn-primary" id="mtgNewGo" data-onclick="mtgSubmitNew(' + (scheduled ? 'true' : 'false') + ')">'
        + (scheduled ? 'Schedule meeting' : 'Start meeting') + '</button>'
      + '</div></div>';
    const t = document.getElementById('mtgNewTitle');
    if (t) { t.focus(); t.addEventListener('keydown', e => { if (e.key === 'Enter') mtgSubmitNew(scheduled); }); }
  }
  window.mtgCloseNew = function () { const e = document.getElementById('mtgNewModal'); if (e) e.className = 'mtg-modal'; };
  window.mtgStartInstant = function () { mtgOpenNew(false); };
  window.mtgOpenSchedule = function () { mtgOpenNew(true); };

  window.mtgSubmitNew = async function (scheduled) {
    if (!mtgCan('mtg.create')) { toast('Your account cannot create meetings', 'err'); return; }
    const err = document.getElementById('mtgNewErr');
    const btn = document.getElementById('mtgNewGo');
    const title = (document.getElementById('mtgNewTitle').value || '').trim();
    if (!title) { err.textContent = 'Please give the meeting a name.'; return; }
    const body = { title, notes: (document.getElementById('mtgNewNote').value || '').trim() };
    if (scheduled) {
      const raw = (document.getElementById('mtgNewWhen').value || '').trim();
      const at = new Date(raw);
      if (!raw || isNaN(at.getTime())) { err.textContent = 'Please choose a date and time.'; return; }
      if (at.getTime() < Date.now() - 60000) { err.textContent = 'That time is in the past.'; return; }
      body.scheduledFor = at.toISOString();
      body.durationMinutes = parseInt(document.getElementById('mtgNewDur').value, 10) || 30;
    }
    err.textContent = '';
    btn.disabled = true; btn.textContent = scheduled ? 'Scheduling…' : 'Starting…';
    try {
      const d = await window.ctgApiFetch('/api/meetings', { method: 'POST', body: JSON.stringify(body) });
      window.mtgCloseNew();
      await mtgLoad();
      // The server returns a link only to accounts allowed to share one.
      if (scheduled) { if (d.guestToken) mtgShowLink(d.guestToken, d.meeting.title); else toast('Meeting scheduled', 'ok'); }
      else mtgJoin(d.meeting.id, d.guestToken);   // link lives in the green room
    } catch (e) {
      btn.disabled = false; btn.textContent = scheduled ? 'Schedule meeting' : 'Start meeting';
      err.textContent = 'Could not create the meeting: ' + (e.message || 'server error');
    }
  };

  // The raw token is returned exactly once, so it has to be surfaced now.
  function mtgShowLink(token, title) {
    const url = location.origin + location.pathname + '#mtg=' + encodeURIComponent(token);
    const el = document.getElementById('mtgLinkModal') || (function () {
      const d = document.createElement('div'); d.id = 'mtgLinkModal'; document.body.appendChild(d); return d;
    })();
    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">Guest link for “' + esc(title) + '”</div>'
      + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:10px">Send this to anyone you want in the meeting — a patient, a law firm, a colleague, an interpreter. They need no account. Everyone waits in the lobby until you admit them. This link is shown once.</div>'
      + '<input type="text" id="mtgLinkInput" readonly value="' + esc(url) + '">'
      + '<div data-cs="'+__cs+'display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
      + '<button class="btn btn-ghost" data-onclick="mtgCloseLink()">Close</button>'
      + '<button class="btn btn-primary" data-onclick="mtgCopyFromInput()">Copy link</button></div></div>';
  }
  window.mtgCloseLink = function () { const e = document.getElementById('mtgLinkModal'); if (e) e.className = 'mtg-modal'; };
  window.mtgCopyFromInput = function () {
    const i = document.getElementById('mtgLinkInput'); if (!i) return;
    i.select();
    navigator.clipboard.writeText(i.value).then(function () { toast('Link copied', 'ok'); }, function () { document.execCommand('copy'); });
  };
  /* Issues a FRESH link. The stored hash can't be reversed, so the original
     token is unrecoverable by design - re-issuing is the honest way to let a
     host re-send an invite, and it also revokes a link sent to the wrong
     person. */
  /* "Copy guest link" from inside the room. Same endpoint as the list button
     it just already knows which meeting you are in, so there is no id to pass
     and no way to hand out a link to the wrong room. */
  window.mtgInviteFromCall = function () {
    if (!mtgActive || !mtgActive.id) { toast('Not in a meeting', 'err'); return; }
    window.mtgCopyLink(mtgActive.id);
  };

  window.mtgCopyLink = async function (id) {
    if (!mtgCan('mtg.invite')) { toast('Your account cannot share guest links', 'err'); return; }
    try {
      const d = await window.ctgApiFetch('/api/meetings/' + id + '/link', { method: 'POST' });
      mtgShowLink(d.guestToken, d.title);
    } catch (e) { toast('Could not create a link: ' + (e.message || ''), 'err'); }
  };

  window.mtgDecide = async function (meetingId, guestId, admit) {
    if (admit) {
      const row = mtgLobby.find(function (g) { return g.id === guestId; });
      const who = (row && row.displayName) || 'This guest';
      const ok = await mtgAsk(
        who + ' will see and hear everything in this meeting, including anything already on screen. '
        + 'Admit them only if you are expecting them.',
        { title: 'Admit ' + who + '?', okLabel: 'Admit' });
      if (!ok) return;
    }
    try {
      await window.ctgApiFetch('/api/meetings/' + meetingId + '/lobby/' + guestId, {
        method: 'POST', body: JSON.stringify({ admit: !!admit })
      });
      toast(admit ? 'Admitted' : 'Denied', 'ok');
      mtgRefreshLobby();
    } catch (e) { toast('Could not update: ' + (e.message || ''), 'err'); }
  };

  window.mtgCancel = async function (id) {
    if (typeof ctgConfirm === 'function' && !(await ctgConfirm('Cancel this meeting?', { danger: true, okLabel: 'Cancel meeting' }))) return;
    try { await window.ctgApiFetch('/api/meetings/' + id, { method: 'DELETE' }); mtgLoad(); }
    catch (e) { toast('Could not cancel: ' + (e.message || ''), 'err'); }
  };

  /* ---------------- the call ---------------- */

  /* What the green room needs in order to offer a background before anyone is
     in the meeting. Does not apply the effect - see the note in
     meeting-greenroom.js - it only records the choice, which mtgRestoreBg then
     picks up the moment the camera starts. */
  function mtgBgProvider() {
    return {
      list: mtgBgLibrary,
      get: function () {
        try { return localStorage.getItem(MTG_BG_CHOICE_KEY) || 'none'; } catch (e) { return 'none'; }
      },
      set: function (choice) {
        try {
          if (choice === 'none') localStorage.removeItem(MTG_BG_CHOICE_KEY);
          else localStorage.setItem(MTG_BG_CHOICE_KEY, choice);
        } catch (e) {}
        mtgBg = choice;
      },
      remove: function (id) {
        mtgBgSave(mtgBgLibrary().filter(function (b) { return b.id !== id; }));
        try {
          if ((localStorage.getItem(MTG_BG_CHOICE_KEY) || '') === 'img:' + id) {
            localStorage.removeItem(MTG_BG_CHOICE_KEY);
          }
        } catch (e) {}
      },
      upload: function (file) {
        if (!/^image\//.test(file.type)) { toast('Please choose an image file.', 'err'); return Promise.reject(); }
        return mtgBgDownscale(file).then(function (dataUrl) {
          // ACS fetches the image over HTTP and rejects data:/blob: outright,
          // so it has to live at a real URL; the thumbnail keeps a local copy.
          return window.ctgApiFetch('/api/meetings/background', {
            method: 'POST', body: JSON.stringify({ dataUrl })
          }).then(function (res) {
            const lib = mtgBgLibrary();
            const id = 'bg' + Date.now();
            lib.unshift({ id: id, name: file.name.slice(0, 40), data: dataUrl, url: res.url });
            mtgBgSave(lib.slice(0, 12));
            try { localStorage.setItem(MTG_BG_CHOICE_KEY, 'img:' + id); } catch (e) {}
            mtgBg = 'img:' + id;
          });
        }).catch(function (e) {
          toast((e && e.message) || 'Could not upload that image.', 'err');
          throw e;
        });
      }
    };
  }

  /* Staff get the same device check as guests before entering the room. They
     do not wait for admission, so this is a stop rather than dead time, but
     the problem is the same either way: the first time anyone saw their own
     camera used to be the moment everybody else could see it too. */
  async function mtgFind(id) {
    let m = mtgList.find(x => x.id === id);
    if (m) return m;
    await mtgLoad();
    m = mtgList.find(x => x.id === id);
    if (!m) toast('That meeting could not be found. It may have been cancelled or already ended.', 'err');
    return m || null;
  }

  async function mtgJoin(id, guestToken) {
    const m = await mtgFind(id);
    if (!m) return;
    /* Staff get the same warning as guests. Someone joining a session that is
       already being recorded is entitled to know before they are in it,
       whether or not they work here. */
    let alreadyRecording = false;
    try {
      const st = await window.ctgApiFetch('/api/meetings/' + id + '/recording');
      alreadyRecording = !!st.active;
    } catch (e) { /* unknown - the in-call badge still covers it */ }
    if (!window.ACS) { toast('Calling is still loading — try again in a moment.', 'err'); return; }
    const el = document.getElementById('mtgGrModal') || (function () {
      const d = document.createElement('div'); d.id = 'mtgGrModal'; document.body.appendChild(d); return d;
    })();
    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card mtg-gr-modal"><div id="mtgGrHost"></div></div>';
    window.mtgGreenRoom.mount(document.getElementById('mtgGrHost'), {
      title: m.title,
      subtitle: m.status === 'live' ? 'This meeting is live' : 'Ready when you are',
      showName: false,
      status: 'Check your camera, microphone and background before you go in.',
      bg: mtgBgProvider(),
      recording: alreadyRecording,
      primary: m.status === 'live' ? 'Join now' : 'Start meeting',
      secondary: guestToken ? 'Copy guest link' : 'Cancel',
      keepOpenOnSecondary: !!guestToken,
      onPrimary: function () {
        window.mtgGreenRoom.busy(true, 'Connecting…');
        const prefs = window.mtgGreenRoom.settings();
        window.mtgGreenRoom.release();
        el.className = 'mtg-modal';
        el.innerHTML = '';
        mtgDoJoin(id, prefs);
      },
      onSecondary: function () {
        if (guestToken) {
          // Copy in place - the preview keeps running behind the toast.
          const url = location.origin + location.pathname + '#mtg=' + encodeURIComponent(guestToken);
          navigator.clipboard.writeText(url).then(
            function () { toast('Guest link copied — send it to anyone you want in the room', 'ok'); },
            function () { mtgShowLink(guestToken, m.title); }
          );
          return;
        }
        window.mtgGreenRoom.release();
        el.className = 'mtg-modal';
        el.innerHTML = '';
      }
    });
  }

  async function mtgDoJoin(id, prefs) {
    const m = await mtgFind(id);
    if (!m) return;
    // Remembered so hopping straight to the next room can carry the camera,
    // microphone and background already chosen for this shift - see
    // mtgHopToNext, which skips the green room entirely.
    if (prefs) mtgLastJoinPrefs = prefs;
    try {
      if (m.status !== 'live') await window.ctgApiFetch('/api/meetings/' + id + '/start', { method: 'POST' });
      const t = await window.ctgApiFetch('/api/calling/token');
      /* Keep my own ACS id: it is how everyone else's client identifies my
         tile, so anything I publish about myself (a raised hand) has to be
         keyed by it rather than by my portal account id. */
      mtgMyAcsId = t.acsUserId || '';
      // The vendored bundle namespaces these under ACS.Calling / ACS.Common -
      // the flat window.ACS.CallClient form is undefined, which is why joining
      // silently failed.
      const client = new window.ACS.Calling.CallClient();
      window.__mtgVSR = window.ACS.Calling.VideoStreamRenderer;
      const cred = new window.ACS.Common.AzureCommunicationTokenCredential({
        token: t.token,
        refreshProactively: true,
        tokenRefresher: function () {
          return window.ctgApiFetch('/api/calling/token').then(function (d) { return d.token; });
        }
      });
      mtgAgent = await client.createCallAgent(cred, { displayName: (window.ctgCurrentUser() || {}).displayName || 'Host' });
      mtgDeviceMgr = await client.getDeviceManager();
      try { await mtgDeviceMgr.askDevicePermission({ audio: true, video: true }); } catch (e) { /* audio-only is fine */ }
      mtgActive = m;
      mtgPatientChecked = false; mtgCheckinBusy = false;
      mtgReadyForProvider = false; mtgReadyBusy = false;
      mtgCall = mtgAgent.join({ groupId: m.callGroupId });
      mtgMuted = false; mtgVideoOn = false;
      mtgStartedAt = Date.now();
      mtgWire(mtgCall);
      /* Request 720p out. Left to itself the SDK can settle on a much lower
         send resolution, and no amount of background quality survives that on
         the receiving end. Wrapped because the constraints feature is not
         present in every SDK build. */
      try {
        const vc = mtgCall.feature(window.ACS.Calling.Features.VideoConstraints);
        if (vc && vc.setConstraints) {
          vc.setConstraints({ video: { send: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } } } });
        }
      } catch (e) { /* older SDK build - carry on at whatever it negotiates */ }
      await mtgApplyGreenRoom(prefs);
      // Starts the quiet window that stops a room full of people chiming at you.
      window.mtgMarkJoined();
      await mtgSyncRecording();
      /* Rejoining counts as arriving. The spoken notice is suppressed after the
         first time per page so a poll cannot nag, but somebody who left and came
         back has to be told again that recording is still running - that is the
         whole point of the notice. */
      if (window.mtgResetAnnouncement) window.mtgResetAnnouncement();
      mtgLoadChat();
      // Arm automatic floating for this call - see mtgArmAutoFloat.
      mtgArmAutoFloat();
      mtgTouchStart();
      // Walked into a session already being recorded - say so out loud.
      if (mtgRecState.active) { window.mtgAnnounceRecording(true); mtgRecBar(); }
      mtgRenderCall();
      clearInterval(mtgTimer);
      mtgTimer = setInterval(function () {
        const el = document.getElementById('mtgTimer');
        if (el) {
          const s = Math.floor((Date.now() - mtgStartedAt) / 1000);
          const h = Math.floor(s / 3600);
          el.textContent = (h ? h + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0')
                              : String(Math.floor(s / 60)).padStart(2, '0'))
            + ':' + String(s % 60).padStart(2, '0');
        }
        const wc = document.getElementById('mtgWallClock');
        if (wc) wc.textContent = mtgWallClock();
      }, 1000);
      mtgLoad();
    } catch (e) {
      toast('Could not join: ' + (e.message || 'unknown error'), 'err');
    }
  }
  window.mtgJoin = mtgJoin;

  window.mtgAutoJoin = async function (id) {
    if (!window.ACS) { toast('Calling is still loading — Auto-Pilot will retry.', 'err'); return false; }
    const m = await mtgFind(id);
    if (!m) return false;
    try {
      await mtgDoJoin(id, { camOn: true, micOn: false });
      return true;
    } catch (e) {
      toast('Auto-Pilot could not open the room: ' + ((e && e.message) || 'unknown error'), 'err');
      return false;
    }
  };
  /* Whether this browser is in a call right now. The Command Center's
     Auto-Pilot asks before opening the next room - interrupting a consultation
     to join the following one would be worse than being late to it. */
  window.mtgInCall = function () { return !!mtgActive; };

  function mtgWire(call) {
    call.on('stateChanged', function () {
      if (call.state === 'Disconnected') mtgLeave(true);
      else {
        if (call.state === 'Connected') mtgAutoStartTranscript();
        mtgRenderCall();
      }
    });
    call.on('remoteParticipantsUpdated', function (e) {
      (e.added || []).forEach(mtgWatch);
      /* One chime per event, not one per person: three people leaving at the
         end of a session should sound like an event, not an alarm. */
      if (window.mtgSoundsReady()) {
        if ((e.added || []).length) window.mtgPlayJoin();
        if ((e.removed || []).length) window.mtgPlayLeave();
      }
      mtgRenderCall();
    });
    /* Your OWN tile. The SDK reports isSpeaking for other people but not for
       you, so the dominant-speaker feature stands in: if my ACS id is among
       the loudest, I am the one talking. Wrapped because not every SDK build
       ships the feature, and losing your own glow must not break the call. */
    window.mtgSelfMeter.start(mtgSelfMicId(), function (talking) {
      mtgSetSpeaking('self', talking && !mtgMuted);
    });

    // Without this, your own share only appeared after some other event
    // happened to trigger a re-render.
    call.on('isScreenSharingOnChanged', function () { mtgRenderCall(); });
    call.on('localVideoStreamsUpdated', function () { mtgRenderCall(); });

    /* Somebody else can mute me. Without this the SDK silences my microphone
       while my own button still shows me live - so I keep talking into a dead
       mic. Read the truth back off the call rather than trusting our own flag. */
    call.on('isMutedChanged', function () {
      mtgMuted = !!call.isMuted;
      // The meter reads its own capture, which keeps hearing you after ACS has
      // muted the call - so the ring has to be put out here rather than
      // waiting for the next time you stop talking.
      if (mtgMuted) mtgSetSpeaking('self', false);
      mtgTxSyncMute();
      mtgRenderCall();
    });

    call.on('mutedByOthers', function () {
      mtgMuted = true;
      try { if (!call.isMuted) call.mute(); } catch (e) {}
      toast('The host muted your microphone. Press the microphone button to unmute yourself.', 'err');
      mtgTxSyncMute();
      mtgRenderCall();
    });
    (call.remoteParticipants || []).forEach(mtgWatch);
  }

  function mtgWatch(p) {
    p.on('videoStreamsUpdated', function () { mtgRenderCall(); });
    p.on('stateChanged', function () { mtgRenderCall(); });
    // Everyone's mic indicator has to move the moment it changes, not on the
    // next unrelated re-render - that delay is what made muting look broken.
    p.on('isMutedChanged', function () {
      const key = (p.identifier && p.identifier.communicationUserId) || '';
      if (p.isMuted) mtgSetSpeaking(key, false);   // muted can't be speaking
      mtgRenderCall();
    });
    /* Speaking state changes several times a sentence. It therefore toggles a
       class on the existing tile rather than going through mtgRenderCall
       rebuilding the overlay at that rate would tear down and re-attach every
       video renderer, and the call would visibly flicker while anyone talked. */
    p.on('isSpeakingChanged', function () {
      const key = (p.identifier && p.identifier.communicationUserId) || '';
      mtgSetSpeaking(key, !!p.isSpeaking && !p.isMuted);
    });
    (p.videoStreams || []).forEach(function (v) { v.on('isAvailableChanged', function () { mtgRenderCall(); }); });
  }

  /* Start the call in the state the green room was left in, so the check that
     was just done actually carries into the meeting. */
  async function mtgApplyGreenRoom(prefs) {
    if (!prefs) return;
    try {
      if (prefs.micId && mtgDeviceMgr.selectMicrophone) {
        const mics = await mtgDeviceMgr.getMicrophones();
        const d = window.mtgGreenRoom.pick(mics, prefs.micId, prefs.micLabel);
        if (d) await mtgDeviceMgr.selectMicrophone(d);
      }
      if (prefs.spkId && mtgDeviceMgr.selectSpeaker) {
        const spks = await mtgDeviceMgr.getSpeakers();
        const d = window.mtgGreenRoom.pick(spks, prefs.spkId, prefs.spkLabel);
        if (d) await mtgDeviceMgr.selectSpeaker(d);
      }
    } catch (e) { /* device selection is a nicety, never a blocker */ }

    if (!prefs.micOn) {
      mtgMuted = true;
      mtgTxSyncMute();
      try { await mtgCall.mute(); } catch (e) {}
    }
    // Not silent: the camera was ON in the green room, so if it fails to start
    // here the person needs telling rather than quietly appearing as initials.
    if (prefs.camOn) mtgStartVideo(prefs).catch(function (e) {
      toast('Could not start your camera: ' + ((e && e.message) || 'unknown error'), 'err');
    });
  }

  /* Camera on, using the camera chosen in the green room. Shared with the
     in-call camera button so both honour the same choice. */
  async function mtgStartVideo(prefs) {
    const cams = await mtgDeviceMgr.getCameras();
    if (!cams.length) { toast('No camera found', 'err'); return; }
    // New stream, so any previous view is stale by definition.
    try { if (mtgLocalRenderer) mtgLocalRenderer.dispose(); } catch (e) {}
    mtgLocalRenderer = null; mtgLocalView = null;
    /* Fall back to the first camera if the green room module is not loaded.
       It normally is, but the camera button must not depend on it - when
       mtgGreenRoom was missing this line threw before the camera was even
       tried, and the failure looked like "the camera is broken". */
    const dev = (window.mtgGreenRoom && window.mtgGreenRoom.pick)
      ? window.mtgGreenRoom.pick(cams, prefs && prefs.camId, prefs && prefs.camLabel)
      : cams[0];
    mtgLocalStream = new window.ACS.Calling.LocalVideoStream(dev);
    await mtgCall.startVideo(mtgLocalStream);
    mtgVideoOn = true;
    mtgRenderCall();
    // Wait for frames before restoring, or the effect is rejected.
    mtgWaitForVideo(8000).then(function () { mtgRestoreBg(); });
  }

  /* Tell the live transcript what the microphone is doing. Harmless where
     the voice gate is running - it reads the same flag itself - and the only
     thing that stops the recogniser where the browser has no gate. */
  function mtgTxSyncMute() {
    try { if (mtgTxSession && mtgTxSession.setMuted) mtgTxSession.setMuted(mtgMuted); }
    catch (e) {}
  }

  async function mtgToggleMute() {
    if (!mtgCall || mtgBusy.mic) return;
    mtgBusy.mic = true;
    mtgMuted = !mtgMuted;
    mtgTxSyncMute();
    mtgRenderCall();
    /* unmute() can sit for a second or two while the SDK re-acquires the
       microphone. Two clicks inside that window used to land in either order
       and leave the icon disagreeing with the call. */
    try { mtgMuted ? await mtgCall.mute() : await mtgCall.unmute(); }
    catch (e) { mtgMuted = !mtgMuted; toast('Could not change your microphone', 'err'); }
    finally { mtgBusy.mic = false; }
    mtgTxSyncMute();
    mtgRenderCall();
  }

  /* True once the call reports no outgoing camera stream. */
  function mtgWaitForSenderGone(timeoutMs) {
    const until = Date.now() + (timeoutMs || 4000);
    return new Promise(function (resolve) {
      (function tick() {
        const streams = (mtgCall && mtgCall.localVideoStreams) || [];
        const stillSending = streams.some(function (v) { return v.mediaStreamType !== 'ScreenSharing'; });
        if (!stillSending || Date.now() > until) return resolve();
        setTimeout(tick, 150);
      })();
    });
  }

  async function mtgConfirmSending() {
    const attached = function () {
      return ((mtgCall && mtgCall.localVideoStreams) || [])
        .some(function (v) { return v.mediaStreamType !== 'ScreenSharing'; });
    };
    for (let i = 0; i < 12; i++) {
      if (attached()) return true;
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    // One clean retry from scratch.
    try {
      if (mtgLocalStream) { try { await mtgCall.stopVideo(mtgLocalStream); } catch (e) {} }
      try { if (mtgLocalRenderer) mtgLocalRenderer.dispose(); } catch (e) {}
      mtgLocalRenderer = null; mtgLocalView = null; mtgLocalStream = null; mtgVideoOn = false;
      await mtgWaitForSenderGone(3000);
      await mtgStartVideo(window.mtgGreenRoom.settings());
      for (let i = 0; i < 12; i++) {
        if (attached()) return true;
        await new Promise(function (r) { setTimeout(r, 250); });
      }
    } catch (e) { /* fall through to the warning */ }
    toast('Your camera turned on here but is not reaching the others — try turning it off and on again.', 'err');
    return false;
  }

  /* getUserMedia failures all arrive as one opaque exception, and "Camera
     error: Could not start video source" tells nobody what to do. These are the
     four that actually happen, each with the action that fixes it. The raw
     error is kept for Diagnostics. */
  function mtgCameraErrorText(e) {
    const s = ((e && e.name) || '') + ' ' + ((e && e.message) || '');
    if (/NotReadable|TrackStart|in use|Could not start video/i.test(s)) {
      return 'Your camera is already being used by another tab or app. Close that one — including any other meeting tab — then try again.';
    }
    if (/NotAllowed|Permission|denied/i.test(s)) {
      return 'Your browser is blocking the camera for this site. Allow it from the padlock in the address bar, then try again.';
    }
    if (/NotFound|DevicesNotFound/i.test(s)) {
      return 'No camera was found. Check it is plugged in and not switched off.';
    }
    if (/Overconstrained|Constraint/i.test(s)) {
      return 'That camera cannot provide the video size the meeting asked for. Pick a different one under the settings button.';
    }
    return 'Camera error: ' + ((e && e.message) || 'unknown');
  }

  const mtgBusy = { video: false, mic: false, share: false };

  async function mtgToggleVideo() {
    if (!mtgCall || mtgBusy.video) return;
    mtgBusy.video = true;
    mtgRenderCall();
    try {
      if (mtgVideoOn) {
        if (mtgLocalStream) await mtgCall.stopVideo(mtgLocalStream);
        /* The view belongs to this stream. Stopping the camera destroys the stream,
           so the view has to go with it: keeping it meant the next camera-on reused
           a dead view and rendered nothing. Disposing on an effect change is a
           different case, and wrong, because that tears down a live pipeline. */
        try { if (mtgLocalRenderer) mtgLocalRenderer.dispose(); } catch (e) {}
        mtgLocalRenderer = null; mtgLocalView = null;
        mtgLocalStream = null; mtgVideoOn = false; mtgBg = 'none';
        /* Wait for the SDK to actually drop the sender. stopVideo() resolves
           before teardown finishes, and starting again into that gap gives you
           a working local preview while the track never reaches anyone else. */
        await mtgWaitForSenderGone(4000);
      } else {
        const prefs = (window.mtgGreenRoom && window.mtgGreenRoom.settings)
          ? window.mtgGreenRoom.settings() : null;
        await mtgStartVideo(prefs);
        await mtgConfirmSending();
      }
    } catch (e) {
      // Kept raw for the Diagnostics panel; the person gets the plain-English
      // version with the thing they can actually do about it.
      window.__mtgLastCameraError = ((e && e.name) || '') + ': ' + ((e && e.message) || e);
      console.error('camera toggle failed', e);
      toast(mtgCameraErrorText(e), 'err');
    } finally {
      mtgBusy.video = false;
    }
    mtgRenderCall();
  }
  async function mtgToggleShare() {
    if (!mtgCall || mtgBusy.share) return;
    mtgBusy.share = true;
    mtgRenderCall();
    try {
      if (mtgCall.isScreenSharingOn) {
        if (!(await mtgAsk('Stop sharing your screen? Everyone goes back to the camera view.',
                           { okLabel: 'Stop sharing', title: 'Stop sharing' }))) {
          mtgBusy.share = false;
          mtgRenderCall();
          return;
        }
        await mtgCall.stopScreenSharing();
        /* Only put it back if sharing is what moved it. Someone who docked or
           floated, presented, and stopped presenting still wants
           the meeting where they put it. */
        if (mtgDockedByShare) {
          if (window.mtgMiniOpen()) { try { mtgMiniWin.close(); } catch (e) {} }
          else if (mtgDocked) window.mtgToggleDock();
        }
        mtgDockedByShare = false;
      } else {
        await mtgCall.startScreenSharing();
        if (!window.mtgMiniOpen()) {
          mtgDockedByShare = true;
          try {
            await window.mtgToggleMini();
          } catch (e) { /* handled below */ }
          if (!window.mtgMiniOpen() && !mtgDocked) window.mtgToggleDock();
        }
      }
    } catch (e) {
      if (!/permission|denied|cancel|abort/i.test(e.message || '')) toast('Could not share your screen', 'err');
    } finally {
      mtgBusy.share = false;
    }
    mtgRenderCall();
  }
  window.mtgToggleMute = mtgToggleMute;
  window.mtgToggleVideo = mtgToggleVideo;
  window.mtgToggleShare = mtgToggleShare;

  function mtgFindRemote(key) {
    return (mtgCall && mtgCall.remoteParticipants || []).filter(function (p) {
      return ((p.identifier && p.identifier.communicationUserId) || '') === key;
    })[0];
  }

  window.mtgMuteParticipant = async function (key) {
    if (!mtgCall) return;
    const p = mtgFindRemote(key);
    if (!p) { toast('They have already left the meeting.', 'err'); mtgRenderCall(); return; }
    if (typeof p.mute !== 'function') {
      toast('This build of the calling library cannot mute someone else — ask them to mute instead.', 'err');
      return;
    }
    try {
      await p.mute();
      toast('Muted ' + (p.displayName || 'that participant') + ' — only they can unmute themselves', 'ok');
    } catch (e) {
      toast('Could not mute them: ' + (e.message || ''), 'err');
    }
    mtgRenderCall();
  };

  window.mtgMuteEveryone = async function () {
    if (!mtgCall) return;
    if (typeof mtgCall.muteAllRemoteParticipants !== 'function') {
      toast('This build of the calling library cannot mute everyone at once.', 'err');
      return;
    }
    const ok = await mtgAsk(
      'Mute everyone else in this meeting? They can each turn their own microphone back on.',
      { title: 'Mute everyone', okLabel: 'Mute everyone' }
    );
    if (!ok) return;
    try {
      await mtgCall.muteAllRemoteParticipants();
      toast('Everyone else has been muted', 'ok');
    } catch (e) {
      toast('Could not mute everyone: ' + (e.message || ''), 'err');
    }
    mtgRenderCall();
  };

  function mtgLeave(silent) {
    if (!mtgActive) return;
    /* First, before anything is torn down. Every way out of a meeting comes
       through here - leaving, being ended on by the host, the call dropping
       so this is the one place that catches all of them. */
    try {
      if (mtgTxSession) { mtgTxSession.dispose(); mtgTxSession = null; }
      mtgAutoSaveTranscript();
    } catch (e) { /* never block the exit */ }
    // Releases the meter's own microphone capture; leaving it running would
    // keep the browser's "in use" indicator lit after the call had ended.
    try { window.mtgSelfMeter.stop(); } catch (e) {}
    mtgTx = []; mtgTxSeq = 0; mtgTxUsed = false; mtgTxSaved = false;
    mtgTxState = 'stopped'; mtgTxError = ''; mtgTxPartial = '';
    mtgTranslation = { patientLang: '', subtitles: true, clinicSpeak: 'en-US', clinicRead: 'en' };
    // Per-meeting, not per-session: the next call transcribes itself again,
    // and stopping it in one meeting does not silence the next one.
    mtgTxAutoTried = false; mtgTxStoppedByUser = false;

    mtgRecState = { active: false, id: '', busy: false };
    // So the next meeting speaks its own notice rather than staying silent.
    if (window.mtgResetAnnouncement) window.mtgResetAnnouncement();
    mtgCloseShareWin();
    clearInterval(mtgTimer); mtgTimer = null;
    try { if (mtgCall && mtgCall.state !== 'Disconnected') mtgCall.hangUp(); } catch (e) {}
    try { if (mtgAgent) mtgAgent.dispose(); } catch (e) {}
    mtgCall = null; mtgAgent = null; mtgLocalStream = null; mtgVideoOn = false;
    Object.keys(mtgRemoteViews).forEach(function (k) { try { mtgRemoteViews[k].renderer.dispose(); } catch (e) {} });
    mtgRemoteViews = {};
    /* Shut the ⋮ menu before the overlay goes: closing it afterwards finds no
       menu to render and would leave its click-away listener bound to a
       document that no longer has a meeting in it. */
    mtgMoreOpen = false; mtgMoreListen(false);
    const o = mtgOverlay(); if (o) o.remove();
    mtgTouchStop();
    /* Leave docked and the body class outlives the call it belonged to, which
       leaves the appointment alert permanently shoved up the screen making room
       for a card that is gone. */
    mtgDocked = false;
    document.body.classList.remove('mtg-docked');
    mtgDisarmAutoFloat();
    if (window.mtgMiniOpen()) { try { mtgMiniWin.close(); } catch (e) {} }
    mtgActive = null;
    if (!silent) mtgLoad();
  }
  window.mtgLeave = mtgLeave;

  // ------------------------------------------------------------- AssistiveTouch

  function mtgTouchEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mtgTouchFmtTime(hhmm) {
    var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    var h = parseInt(m[1], 10), min = m[2];
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + min + ' ' + ap;
  }

  var MTG_TOUCH_MAX = 3;

  async function mtgTouchRefresh() {
    if (!mtgActive || !window.ctgApiFetch) { mtgTouchQueue = []; return; }
    try {
      var d = new Date();
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var res = await window.ctgApiFetch('/api/appointments/board?date=' + encodeURIComponent(iso));
      var slots = (res && res.slots) || [];
      if (!mtgActive) return; // left the call while the fetch was in flight
      var now = Date.now();
      var startOf = function (s) { return new Date(s.date + 'T' + s.start + ':00').getTime(); };
      var endOf = function (s) {
        var e = s.end ? new Date(s.date + 'T' + s.end + ':00').getTime() : NaN;
        return (isNaN(e) || e <= startOf(s)) ? startOf(s) + 60 * 60 * 1000 : e;
      };
      mtgTouchQueue = slots.filter(function (s) {
        if (!s.meetingId || s.meetingId === mtgActive.id || s.meetingStatus === 'ended') return false;
        // Someone actually knocking outranks the clock entirely - they are at
        // the door now, whatever their slot said it would be.
        return s.waiting > 0 || endOf(s) > now;
      }).sort(function (a, b) {
        // A patient already waiting outranks the clock, same as Auto-Pilot.
        var aw = a.waiting > 0 ? 0 : 1, bw = b.waiting > 0 ? 0 : 1;
        if (aw !== bw) return aw - bw;
        return startOf(a) - startOf(b);
      }).slice(0, MTG_TOUCH_MAX);
    } catch (e) { /* keep whatever we had */ }
    mtgTouchRender();
  }

  function mtgTouchUrgent() {
    return mtgTouchQueue.some(function (n) {
      if (n.waiting > 0) return true;
      return Date.now() >= new Date(n.date + 'T' + n.start + ':00').getTime() - 60000;
    });
  }

  function mtgTouchBlockTitleHTML(n) {
    if (typeof window.ctgBreakTitlesFor !== 'function') return '';
    return window.ctgBreakTitlesFor(n.patientName, n.date).map(function (b) {
      return '<div class="mtg-touch-block" data-cs="'+__cs+'--block-color:' + mtgTouchEsc(b.color) + '">'
        + mtgTouchEsc(b.title)
        + (b.time ? '<span class="mtg-touch-blocktime">' + mtgTouchEsc(b.time) + '</span>' : '')
        + '</div>';
    }).join('');
  }

  /* The same handover status Command Center shows, in a smaller pill sized for
     the narrow in-call panel: 'Checked in', plus 'Ready for provider' once a
     TA has prepped the room, so the provider sees a patient is ready without
     leaving the call. Read off the board's own checked_in_at and ready_at. */
  function mtgTouchStatusHTML(n) {
    // One pill, showing the furthest point reached. "Ready for provider"
    // supersedes "Checked in", so a room that is both shows only "Ready for
    // provider"; a room that is only checked in shows "Checked in".
    var chip = '';
    if (n.readyAt) {
      chip = '<span class="mtg-touch-stat is-ready">Ready for provider</span>';
    } else if (n.checkedInAt) {
      chip = '<span class="mtg-touch-stat is-checkedin">Checked in</span>';
    }
    return chip ? '<div class="mtg-touch-stats">' + chip + '</div>' : '';
  }

  function mtgTouchRowHTML(n, i) {
    return '<div class="mtg-touch-row">'
      + '<div class="mtg-touch-row-info">'
        + '<div class="mtg-touch-kicker">' + (n.waiting > 0 ? 'Waiting for you' : 'Next up') + '</div>'
        + '<div class="mtg-touch-name">' + mtgTouchEsc(n.patientName || 'Unnamed') + '</div>'
        + mtgTouchBlockTitleHTML(n)
        + mtgTouchStatusHTML(n)
        + '<div class="mtg-touch-time">' + mtgTouchFmtTime(n.start) + (n.visitType ? ' · ' + mtgTouchEsc(n.visitType) : '') + '</div>'
      + '</div>'
      // "Leave," not "End" - this only removes the provider (see mtgLeave,
      // same one the red Leave button uses); the patient and any TA already
      // in the room stay in it and can keep going without the provider.
      + '<button type="button" class="btn btn-primary btn-sm" data-onclick="mtgHopToNext(' + i + ')">Join &amp; leave this call</button>'
    + '</div>';
  }

  function mtgTouchPanelHTML() {
    if (!mtgTouchQueue.length) {
      return '<div class="mtg-touch-panel"><div class="mtg-touch-empty">Nothing else on today’s board needs you right now.</div></div>';
    }
    return '<div class="mtg-touch-panel">' + mtgTouchQueue.map(mtgTouchRowHTML).join('<hr class="mtg-touch-sep">') + '</div>';
  }

  function mtgTouchRender() {
    if (!mtgActive) return;
    var host = document.getElementById('mtgTouch') || (function () {
      var el = document.createElement('div'); el.id = 'mtgTouch'; document.body.appendChild(el); return el;
    })();
    var urgent = mtgTouchUrgent();
    host.className = 'mtg-touch' + (mtgTouchOpen ? ' open' : '');
    host.innerHTML =
      '<button type="button" class="mtg-touch-btn' + (urgent ? ' urgent' : '') + '" data-onclick="mtgToggleTouch(event)"'
        + ' aria-label="Other appointments" aria-expanded="' + (mtgTouchOpen ? 'true' : 'false') + '">'
        + ICON_TOUCH
        + (urgent ? '<span class="mtg-touch-dot"></span>' : '')
      + '</button>'
      + (mtgTouchOpen ? mtgTouchPanelHTML() : '');
  }

  var mtgTouchAway = null;
  function mtgTouchListen(on) {
    if (mtgTouchAway) {
      document.removeEventListener('click', mtgTouchAway.click, true);
      document.removeEventListener('keydown', mtgTouchAway.key, true);
      mtgTouchAway = null;
    }
    if (!on) return;
    var click = function (ev) {
      var host = document.getElementById('mtgTouch');
      if (host && host.contains(ev.target)) return;
      mtgTouchOpen = false;
      mtgTouchRender();
      mtgTouchListen(false);
    };
    var key = function (ev) {
      if (ev.key !== 'Escape') return;
      mtgTouchOpen = false;
      mtgTouchRender();
      mtgTouchListen(false);
    };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    mtgTouchAway = { click: click, key: key };
  }

  window.mtgToggleTouch = function (e) {
    if (e) e.stopPropagation();
    mtgTouchOpen = !mtgTouchOpen;
    mtgTouchListen(mtgTouchOpen);
    if (mtgTouchOpen) mtgTouchRefresh();   // freshest possible the moment it opens
    else mtgTouchRender();
  };

  window.mtgHopToNext = function (i) {
    var n = mtgTouchQueue[i || 0];
    if (!n || !n.meetingId) return;
    var targetId = n.meetingId;
    mtgTouchOpen = false;
    mtgLeave(true);
    setTimeout(function () {
      if (!window.ACS) { toast('Calling is still loading — try again in a moment.', 'err'); return; }
      mtgDoJoin(targetId, mtgLastJoinPrefs);
    }, 900);
  };

  function mtgTouchStart() {
    mtgTouchOpen = false;
    mtgTouchQueue = [];
    mtgTouchRefresh();
    clearInterval(mtgTouchPoll);
    mtgTouchPoll = setInterval(mtgTouchRefresh, 20000);
  }
  function mtgTouchStop() {
    clearInterval(mtgTouchPoll); mtgTouchPoll = null;
    mtgTouchOpen = false; mtgTouchQueue = [];
    mtgTouchListen(false);
    var el = document.getElementById('mtgTouch');
    if (el) el.remove();
  }

  var ICON_TOUCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>';

  window.mtgConfirmLeave = async function () {
    if (!(await mtgAsk('Leave this meeting? Everyone else stays in the room. To close it for all of them, use "End meeting for everyone" instead.',
                       { danger: true, okLabel: 'Leave meeting', title: 'Leave meeting' }))) return;
    mtgLeave();
  };

  /* Ends the meeting for EVERYONE. Distinct from the red button in the rail,
     which only hangs up your own connection and leaves the room running for
     the people still in it. */
  window.mtgEndForAll = async function () {
    if (!mtgActive) return;
    const id = mtgActive.id;
    if (!(await mtgAsk('This closes the meeting for everyone still in it, including guests. To step out on your own instead, use the red leave button.',
                       { danger: true, okLabel: 'End for everyone', title: 'End meeting' }))) return;
    try {
      await window.ctgApiFetch('/api/meetings/' + id + '/end', { method: 'POST' });
    } catch (e) {
      /* Previously swallowed. If the call to end it fails, leaving anyway
         drops the host out of a meeting that is still live for the patient
         the exact opposite of what was asked for, with no hint anything went
         wrong. Stay in the room and say so. */
      toast('Could not end the meeting for everyone: ' + ((e && e.message) || 'unknown error'), 'err');
      return;
    }
    mtgLeave();
  };

  const IC = {
    checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M17 11l2 2 4-4"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V4a3 3 0 0 0-5.9-.7"/><path d="M19 10v2a7 7 0 0 1-.7 3"/><path d="M12 19v4"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22"/><path d="M16 16H3a2 2 0 0 1-2-2V7"/><path d="M23 7l-7 5"/></svg>',
    blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11"/><path d="M15 10.5V4.5a1.5 1.5 0 0 0-3 0V11"/><path d="M12 10.5v-5a1.5 1.5 0 0 0-3 0V13"/><path d="M9 11.5v-2a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-3a1.5 1.5 0 0 0-3 0"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3h11l3 3v15H5z"/><path d="M9 9h7M9 13h7M9 17h4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.63.68 1.09 1.32 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
    /* Three dots - the one glyph everyone already reads as "the rest of
       the controls are in here". */
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
  };

  /* Background effects: blur, or a photo you upload. The effect classes live
     in a separate bundle from the calling SDK and load on demand, since it is
     around 8 MB of ML models and most meetings never use it. If the load
     fails, effects are unavailable and the call carries on. */
  const MTG_BG_KEY = 'ctg_meeting_backgrounds';
  const MTG_BG_CHOICE_KEY = 'ctg_meeting_bg_choice';
  let mtgBg = 'none';                  // 'none' | 'blur' | 'img:<id>'
  // Survives a re-render: mtgRenderCall() rebuilds the overlay and would
  // otherwise wipe the panel out from under the user mid-choice.
  let mtgBgOpen = false;
  let mtgEffectsLoading = null;

  function mtgLoadEffects() {
    // Effects now ship inside the calling bundle - they must share one module
    // instance or startEffects() silently does nothing.
    if (window.ACSEffects) return Promise.resolve(true);
    if (mtgEffectsLoading) return mtgEffectsLoading;
    mtgEffectsLoading = new Promise(function (resolve) {
      const sc = document.createElement('script');
      sc.src = 'acs-effects-bundle.js?v=20260805l';
      sc.onload = function () { resolve(!!window.ACSEffects); };
      sc.onerror = function () { resolve(false); };
      document.head.appendChild(sc);
    });
    return mtgEffectsLoading;
  }

  /* The user's own uploaded backgrounds, kept per-browser.
     Images are downscaled before storing - a phone photo is several megabytes
     and would blow the localStorage quota after two or three uploads. */
  function mtgBgLibrary() {
    let lib = [];
    try { lib = JSON.parse(localStorage.getItem(MTG_BG_KEY) || '[]'); } catch (e) { return []; }
    const usable = lib.filter(function (b) { return b && b.url; });
    if (usable.length !== lib.length) {
      try { localStorage.setItem(MTG_BG_KEY, JSON.stringify(usable)); } catch (e) {}
      const stale = lib.length - usable.length;
      // Say so plainly rather than leaving the picker mysteriously shorter.
      setTimeout(function () {
        toast(stale + (stale === 1 ? ' background needs' : ' backgrounds need')
          + ' re-uploading after the last update — please add ' + (stale === 1 ? 'it' : 'them') + ' again.', 'err');
      }, 800);
      // A remembered choice pointing at one of them must go too.
      try {
        const saved = localStorage.getItem(MTG_BG_CHOICE_KEY) || '';
        if (saved.indexOf('img:') === 0 && !usable.some(function (b) { return b.id === saved.slice(4); })) {
          localStorage.removeItem(MTG_BG_CHOICE_KEY);
        }
      } catch (e) {}
    }
    return usable;
  }
  function mtgBgSave(list) {
    try { localStorage.setItem(MTG_BG_KEY, JSON.stringify(list)); }
    catch (e) { toast('No room to save that background on this device.', 'err'); }
  }

  function mtgBgDownscale(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const W = 1920, H = 1080;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Cover: scale so the image fills the frame, then centre it.
        const scale = Math.max(W / img.width, H / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
      img.src = url;
    });
  }

  window.mtgBgUpload = function (input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Please choose an image file.', 'err'); return; }
    mtgBgDownscale(file).then(function (dataUrl) {
      /* Upload it. ACS fetches backgroundImageUrl over HTTP and rejects blob:
         and data: URLs outright, so the picture has to live at a real URL
         the thumbnail keeps the local copy so the panel stays instant. */
      return window.ctgApiFetch('/api/meetings/background', {
        method: 'POST', body: JSON.stringify({ dataUrl })
      }).then(function (res) {
        const lib = mtgBgLibrary();
        lib.unshift({ id: 'bg' + Date.now(), name: file.name.slice(0, 40), data: dataUrl, url: res.url });
        mtgBgSave(lib.slice(0, 12));
        mtgRenderBgPanel();
        mtgApplyBg('img:' + lib[0].id);
      });
    }).catch(function (e) { toast(e.message || 'Could not upload that image.', 'err'); });
    input.value = '';
  };

  window.mtgBgRemove = function (id) {
    mtgBgSave(mtgBgLibrary().filter(function (b) { return b.id !== id; }));
    if (mtgBg === 'img:' + id) mtgApplyBg('none'); else mtgRenderBgPanel();
  };

  /* ACS rejects an effect if the camera stream is not yet producing frames,
     with the generic "Error starting video effects". Restoring a saved
     background immediately after startVideo() hit exactly that race. */
  async function mtgWaitForVideo(timeoutMs) {
    const until = Date.now() + (timeoutMs || 6000);
    while (Date.now() < until) {
      const v = document.querySelector('#mtgV_self video');
      if (v && v.videoWidth > 0 && !v.paused) return true;
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    return false;
  }

  let mtgBgQueue = Promise.resolve();
  /* Background changes are serialised. Clicking two backgrounds quickly used to
     interleave their stop/start pairs, and whichever finished last won
     usually the wrong one. */
  async function mtgApplyBg(choice) {
    const run = mtgBgQueue.then(function () { return mtgApplyBgNow(choice); });
    mtgBgQueue = run.catch(function () {});
    return run;
  }

  async function mtgApplyBgNow(choice) {
    if (!mtgCall) return;
    if (!mtgVideoOn || !mtgLocalStream) { toast('Turn your camera on first', 'err'); return; }
    const panel = document.getElementById('mtgBgPanel');
    if (panel) panel.classList.add('busy');
    try {
      if (choice !== 'none' && !(await mtgLoadEffects())) {
        toast('Background effects could not load. Please try again.', 'err');
        return;
      }
      const feature = mtgLocalStream.feature(window.ACS.Calling.Features.VideoEffects);

      /* startEffects() resolving only means the request was accepted. The SDK
         reports whether the effect actually ran on these events, asynchronously
 - without them a failure is completely silent, which is exactly how
         this appeared to do nothing. */
      if (!feature.__ctgWired) {
        feature.__ctgWired = true;
        feature.on('effectsError', function (err) {
          const reason = (err && (err.reason || err.message)) || 'unknown reason';
          // The troubleshooting link is keyed on these; without them the
          // message alone cannot be looked up.
          const codes = [];
          if (err && err.code !== undefined) codes.push('code=' + err.code);
          if (err && err.subCode !== undefined) codes.push('subCode=' + err.subCode);
          mtgLastEffectError = reason + (codes.length ? ' [' + codes.join(' ') + ']' : '');
          console.error('ACS video effect error', err);
          toast('Background effect failed: ' + reason, 'err');
          mtgBg = 'none';
          try { localStorage.removeItem(MTG_BG_CHOICE_KEY); } catch (e) {}
          mtgRenderBgPanel();
          mtgRenderCall();
        });
        feature.on('effectsStarted', function () { mtgRebuildSelfView().then(mtgRenderCall); });
        feature.on('effectsStopped', function () { mtgRebuildSelfView().then(mtgRenderCall); });
      }

      // isSupported can be a property or a method depending on SDK build.
      let supported = true;
      try {
        if (typeof feature.isSupported === 'function' && choice !== 'none') {
          // It takes the effect instance - calling it bare throws
          // "Invalid effect provided", which reads like an unsupported device.
          const probe = new window.ACSEffects.BackgroundBlurEffect();
          supported = await feature.isSupported(probe);
        } else {
          supported = (feature.isSupported !== false);
        }
      } catch (e) { supported = true; }
      if (choice !== 'none' && !supported) {
        toast('Background effects are not supported on this device or browser. They need a recent Chrome or Edge on desktop.', 'err');
        return;
      }
      /* Always clear first, and wait for it to actually stop. stopEffects()
         resolves before the processor is torn down, so starting the next effect
         immediately applies it to a pipeline still running the previous one: the
         SDK drops it and you keep seeing the first background you ever picked. */
      const wasRunning = !!mtgBg && mtgBg !== 'none';
      try {
        const stopped = new Promise(function (resolve) {
          if (!wasRunning) return resolve();
          let done = false;
          const onStop = function () { if (!done) { done = true; resolve(); } };
          feature.on('effectsStopped', onStop);
          // Never hang on an event that may not fire for a no-op stop.
          setTimeout(function () { if (!done) { done = true; resolve(); } }, 2500);
        });
        await feature.stopEffects();
        await stopped;
      } catch (e) { /* nothing was running */ }
      if (choice !== 'none') await mtgWaitForVideo(6000);

      if (choice === 'blur') {
        await feature.startEffects(new window.ACSEffects.BackgroundBlurEffect());
      } else if (choice.indexOf('img:') === 0) {
        const item = mtgBgLibrary().filter(function (b) { return b.id === choice.slice(4); })[0];
        if (!item) { toast('That background is no longer saved.', 'err'); mtgBg = 'none'; return; }
        if (!item.url) {
          // Saved before backgrounds were server-hosted; blob/data URLs cannot work.
          toast('That background needs re-uploading — please add it again.', 'err');
          mtgBg = 'none';
          return;
        }
        await feature.startEffects(new window.ACSEffects.BackgroundReplacementEffect({
          backgroundImageUrl: location.origin + item.url
        }));
      }
      mtgBg = choice;
      mtgBg = choice;
      // Remembered per browser, so the next meeting starts how you left this one.
      try { localStorage.setItem(MTG_BG_CHOICE_KEY, choice); } catch (e) {}
      /* The preview is a renderer created before the effect existed, so it keeps
         painting the raw camera - the effect is live for everyone else while you
         appear unchanged, which looks exactly like a broken feature. Tear the
         view down so the next render rebuilds it from the processed stream. */
      await mtgRebuildSelfView();
    } catch (e) {
      // One retry: the camera is often a beat behind on the first attempt.
      if (!mtgApplyBgNow.__retried && choice !== 'none') {
        mtgApplyBgNow.__retried = true;
        await new Promise(function (r) { setTimeout(r, 1500); });
        /* Straight to the inner function, not through mtgApplyBg: we are
           already inside a queued run, and going back through the queue would
           wait on ourselves and hang for ever. */
        try { await mtgApplyBgNow(choice); } catch (e2) {}
        mtgApplyBgNow.__retried = false;
      } else {
        toast('Background failed: ' + ((e && e.message) || 'unknown error'), 'err');
      }
    } finally {
      if (panel) panel.classList.remove('busy');
      mtgRenderBgPanel();
      mtgRenderCall();
    }
  }
  window.mtgApplyBg = mtgApplyBg;

  async function mtgRebuildSelfView() {
    if (!mtgLocalStream || !window.__mtgVSR) return false;
    const oldRenderer = mtgLocalRenderer;
    let renderer = null, view = null;
    try {
      renderer = new window.__mtgVSR(mtgLocalStream);
      view = await renderer.createView({ scalingMode: 'Crop' });
    } catch (e) {
      return false;                       // keep whatever is on screen
    }

    // Off-screen until it has real frames, so a blank view is never displayed.
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;overflow:hidden';
    holder.appendChild(view.target);
    document.body.appendChild(holder);

    let ready = false;
    for (let i = 0; i < 60; i++) {         // up to ~15s: a real camera is slow
      const v = holder.querySelector('video');
      if (v) {
        v.autoplay = true; v.playsInline = true; v.muted = true;
        if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        if (v.videoWidth > 0 && !v.paused) { ready = true; break; }
      }
      await new Promise(function (r) { setTimeout(r, 250); });
    }

    if (!ready) {
      // Never swap in something blank - leave the existing preview alone.
      try { renderer.dispose(); } catch (e) {}
      holder.remove();
      return false;
    }

    mtgLocalRenderer = renderer;
    mtgLocalView = view;
    holder.remove();
    mtgRenderCall();                       // attaches the new, already-live view
    try { if (oldRenderer && oldRenderer !== renderer) oldRenderer.dispose(); } catch (e) {}
    return true;
  }

  /* Re-applies the remembered background once the camera is on. */
  async function mtgRestoreBg() {
    let saved = 'none';
    try { saved = localStorage.getItem(MTG_BG_CHOICE_KEY) || 'none'; } catch (e) {}
    if (saved === 'none') return;
    // An image that has since been deleted must not leave the button lit.
    if (saved.indexOf('img:') === 0
        && !mtgBgLibrary().some(function (b) { return b.id === saved.slice(4); })) {
      try { localStorage.removeItem(MTG_BG_CHOICE_KEY); } catch (e) {}
      return;
    }
    await mtgApplyBg(saved);
  }


  /* Device switching from inside the call. The green room lets you pick a
     microphone before joining, but a headset gets unplugged mid-meeting and
     the only remedy used to be leaving and coming back. Same picker, without
     dropping the call. */
  let mtgDevOpen = false;

  window.mtgToggleDevices = async function () {
    mtgDevOpen = !mtgDevOpen;
    mtgRenderDevPanel();
    if (mtgDevOpen) await mtgRenderDevPanel(true);
  };

  async function mtgRenderDevPanel(reload) {
    const p = document.getElementById('mtgDevPanel');
    if (!p) return;
    p.classList.toggle('show', mtgDevOpen);
    if (!mtgDevOpen) { p.innerHTML = ''; return; }
    if (!p.innerHTML) p.innerHTML = '<div class="mtg-bg-title">Devices</div><div class="small-muted">Loading…</div>';
    if (!reload) return;

    let mics = [], cams = [], spks = [];
    try { mics = await mtgDeviceMgr.getMicrophones(); } catch (e) {}
    try { cams = await mtgDeviceMgr.getCameras(); } catch (e) {}
    try { spks = mtgDeviceMgr.getSpeakers ? await mtgDeviceMgr.getSpeakers() : []; } catch (e) {}

    let selMic = null, selSpk = null;
    try { selMic = mtgDeviceMgr.selectedMicrophone; } catch (e) {}
    try { selSpk = mtgDeviceMgr.selectedSpeaker; } catch (e) {}
    const camId = mtgLocalStream && mtgLocalStream.source ? mtgLocalStream.source.id : '';

    const list = (label, id, items, sel, handler) =>
      '<label class="mtg-dev-lb">' + label + '</label>'
      + (items.length
          ? '<select id="' + id + '" data-onchange="' + handler + '(this.value)">'
            + items.map(function (d) {
                return '<option value="' + esc(d.id) + '"' + (sel && sel.id === d.id ? ' selected' : '') + '>'
                  + esc(d.name || 'Device') + '</option>';
              }).join('') + '</select>'
          : '<select disabled><option>None found</option></select>');

    p.innerHTML = '<div class="mtg-bg-title">Devices</div>'
      + list('Microphone', 'mtgDevMic', mics, selMic, 'mtgPickMic')
      + list('Speaker', 'mtgDevSpk', spks, selSpk, 'mtgPickSpk')
      + list('Camera', 'mtgDevCam', cams, { id: camId }, 'mtgPickCam')
      + '<div class="mtg-bg-note">Changes apply straight away — you stay in the meeting.</div>';
  }

  window.mtgPickMic = async function (id) {
    try {
      const mics = await mtgDeviceMgr.getMicrophones();
      const d = mics.filter(function (x) { return x.id === id; })[0];
      if (d) { await mtgDeviceMgr.selectMicrophone(d); toast('Microphone switched to ' + d.name, 'ok'); }
    } catch (e) { toast('Could not switch microphone: ' + (e.message || ''), 'err'); }
  };

  window.mtgPickSpk = async function (id) {
    try {
      const spks = await mtgDeviceMgr.getSpeakers();
      const d = spks.filter(function (x) { return x.id === id; })[0];
      if (d) { await mtgDeviceMgr.selectSpeaker(d); toast('Speaker switched to ' + d.name, 'ok'); }
    } catch (e) { toast('Could not switch speaker: ' + (e.message || ''), 'err'); }
  };

  /* Switching camera means a new LocalVideoStream. `switchSource` keeps the
     same stream object, so the call keeps sending and any running background
     effect stays applied - stopping and restarting video would drop both. */
  window.mtgPickCam = async function (id) {
    try {
      const cams = await mtgDeviceMgr.getCameras();
      const d = cams.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      if (mtgLocalStream && mtgLocalStream.switchSource) {
        await mtgLocalStream.switchSource(d);
        await mtgRebuildSelfView();
        mtgRenderCall();
        toast('Camera switched to ' + d.name, 'ok');
      } else {
        toast('Turn your camera on first', 'err');
      }
    } catch (e) { toast('Could not switch camera: ' + (e.message || ''), 'err'); }
  };

  window.mtgToggleBgPanel = function () {
    // Two panels sharing the same corner would overlap.
    if (mtgDevOpen) { mtgDevOpen = false; mtgRenderDevPanel(); }
    mtgBgOpen = !mtgBgOpen;
    mtgRenderBgPanel();
  };

  function mtgRenderBgPanel() {
    const p = document.getElementById('mtgBgPanel');
    if (!p) return;
    p.classList.toggle('show', mtgBgOpen);
    if (!mtgBgOpen) { p.innerHTML = ''; return; }
    const lib = mtgBgLibrary();

    const camOff = !mtgVideoOn || !mtgLocalStream;
    const dis = camOff ? ' disabled' : '';

    p.innerHTML = '<div class="mtg-bg-title">Background</div>'
      + (camOff ? '<div class="mtg-bg-warn">Turn your camera on to change your background.</div>' : '')
      + '<div class="mtg-bg-grid' + (camOff ? ' is-off' : '') + '">'
        + '<button class="mtg-bg-opt' + (mtgBg === 'none' ? ' on' : '') + '"' + dis + ' data-onclick="mtgApplyBg(\'none\')">'
          + '<span class="mtg-bg-none">None</span></button>'
        + '<button class="mtg-bg-opt' + (mtgBg === 'blur' ? ' on' : '') + '"' + dis + ' data-onclick="mtgApplyBg(\'blur\')">'
          + '<span class="mtg-bg-blur">Blur</span></button>'
        + lib.map(function (b) {
            return '<button class="mtg-bg-opt' + (mtgBg === 'img:' + b.id ? ' on' : '') + '"' + dis
              + ' data-onclick="mtgApplyBg(\'img:' + b.id + '\')" title="' + esc(b.name) + '">'
              + '<img src="' + b.data + '" alt="' + esc(b.name) + '">'
              + '<span class="mtg-bg-x" data-onclick="event.stopPropagation();mtgBgRemove(\'' + b.id + '\')">&#10005;</span>'
              + '</button>';
          }).join('')
        + '<label class="mtg-bg-opt mtg-bg-add' + (camOff ? ' is-off' : '') + '" title="Upload an image">+'
          + '<input type="file" accept="image/*" data-onchange="mtgBgUpload(this)" hidden' + dis + '></label>'
      + '</div>'
      + '<div class="mtg-bg-note">Only you upload these; they stay on this device.</div>';
  }

  function mtgPipVideo() {
    // Prefer whatever is worth watching: a screen share, else the first remote
    // camera. Never the self view - nobody needs to float their own face.
    var share = document.querySelector('.mtg-present-main video');
    if (share) return share;
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.mtg-tile-video video'));
    for (var i = 0; i < tiles.length; i++) {
      var holder = tiles[i].closest('.mtg-tile-video');
      if (holder && holder.id !== 'mtgV_self' && tiles[i].videoWidth > 0) return tiles[i];
    }
    return tiles[0] || null;
  }

  window.mtgFullscreenShare = function () {
    const frame = document.querySelector('.mtg-present-main');
    if (!frame) { toast('Nobody is presenting right now.', 'err'); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
    const go = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (!go) { toast('This browser will not allow fullscreen here.', 'err'); return; }
    Promise.resolve(go.call(frame)).catch(function (e) {
      toast('Could not go fullscreen: ' + ((e && e.message) || ''), 'err');
    });
  };

  window.mtgTogglePip = async function () {
    if (!document.pictureInPictureEnabled) {
      toast('Picture-in-Picture is switched off in this browser’s settings.', 'err');
      return;
    }
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
      var v = mtgPipVideo();
      if (!v) {
        toast('Nobody has a camera on yet — there is nothing to float. Turn a camera on first.', 'err');
        return;
      }
      /* The calling SDK marks the <video> elements it creates as PiP-disabled.
         Without clearing both the property and the attribute the request dies
         with InvalidStateError, which is why the button appeared to do nothing. */
      try {
        v.disablePictureInPicture = false;
        v.removeAttribute('disablepictureinpicture');
      } catch (e) {}
      /* A video with no metadata yet cannot enter PiP. Renderers attach before
         the first frame arrives, so give it a moment rather than failing. */
      if (!v.readyState) {
        await new Promise(function (resolve) {
          var t = setTimeout(resolve, 1500);
          v.addEventListener('loadedmetadata', function () { clearTimeout(t); resolve(); }, { once: true });
        });
      }
      await v.requestPictureInPicture();
    } catch (e) {
      // Kept for Diagnostics; the toast now names the real reason instead of
      // leaving "it doesn't work" as the only available description.
      window.__mtgLastPipError = ((e && e.name) || '') + ': ' + ((e && e.message) || e);
      console.error('Picture-in-Picture failed', e);
      toast('Floating window refused: ' + ((e && e.name) || '') + ' ' + ((e && e.message) || ''), 'err');
    }
  };

  var mtgPipHinted = false;

  document.addEventListener('visibilitychange', function () {
    if (!mtgActive || !mtgCall) return;
    if (document.hidden) {
      if (document.pictureInPictureElement || !document.pictureInPictureEnabled) return;
      var v = mtgPipVideo();
      if (!v) return;
      try {
        v.requestPictureInPicture().catch(function () {
          if (mtgPipHinted) return;
          mtgPipHinted = true;
          // Fires when they come back to the tab, which is when it can be read.
          setTimeout(function () {
            toast('Tip: press the floating-window button before switching tabs — the meeting then stays on top while you work.', 'ok');
          }, 400);
        });
      } catch (e) { /* older browser with no PiP at all */ }
    } else if (document.pictureInPictureElement) {
      /* Not auto-closing: if someone opened the floating window on
         purpose they may want it kept while they move around. Only the
         automatic one is transient, and that one rarely opens at all. */
    }
  });

  let mtgShareWin = null, mtgShareHomeId = null;

  window.mtgPopOutShare = function (viewKey) {
    const src = document.getElementById('mtgV_' + viewKey);
    const video = src && src.querySelector('video');
    if (!video) { toast('Nothing is being shared yet.', 'err'); return; }
    if (mtgShareWin && !mtgShareWin.closed) { mtgShareWin.focus(); return; }

    mtgShareWin = window.open('', 'ctgSharedScreen', 'width=1280,height=760,menubar=no,toolbar=no');
    if (!mtgShareWin) { toast('Your browser blocked the pop-out window. Allow pop-ups for this site.', 'err'); return; }
    mtgShareHomeId = 'mtgV_' + viewKey;

    const d = mtgShareWin.document;
    d.title = 'Shared screen — ' + (mtgActive ? mtgActive.title : 'Meeting');
    d.body.style.cssText = 'margin:0;background:#0f1216;display:flex;align-items:center;justify-content:center;height:100vh';
    const holder = d.createElement('div');
    holder.id = 'shareHolder';
    holder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center';
    d.body.appendChild(holder);
    holder.appendChild(video);
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#0f1216';
    video.autoplay = true; video.playsInline = true; video.muted = true;
    const pr = video.play(); if (pr && pr.catch) pr.catch(function () {});

    // Put it back rather than leaving a dead frame in the meeting.
    mtgShareWin.addEventListener('beforeunload', function () {
      const home = document.getElementById(mtgShareHomeId);
      if (home && video) {
        home.appendChild(video);
        video.style.cssText = '';
        const p2 = video.play(); if (p2 && p2.catch) p2.catch(function () {});
      }
      mtgShareWin = null;
      setTimeout(mtgRenderCall, 60);
    });
    mtgRenderCall();
  };

  function mtgCloseShareWin() {
    try { if (mtgShareWin && !mtgShareWin.closed) mtgShareWin.close(); } catch (e) {}
    mtgShareWin = null;
  }

  /* On-screen diagnostics. Background effects and screen-share detection both
     behave differently on real hardware than in a headless test browser, and a
     fake camera reports success either way, so this prints what the SDK
     actually reports to be read off the screen. */
  let mtgLastEffectError = '';

  window.mtgDiagnostics = async function () {
    const lines = [];
    const add = (k, v) => lines.push(k + ': ' + v);

    add('browser', navigator.userAgent.replace(/^Mozilla\/[\d.]+ /, '').slice(0, 90));
    add('camera on', mtgVideoOn);
    add('screen sharing (me)', !!(mtgCall && mtgCall.isScreenSharingOn));
    add('background choice', mtgBg);
    add('effects bundle loaded', !!window.ACSEffects);

    // WebGL2 / WASM are what the effect actually runs on.
    let webgl2 = false;
    try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (e) {}
    add('WebGL2', webgl2);
    add('WebAssembly', typeof WebAssembly !== 'undefined');

    if (mtgLocalStream) {
      try {
        const f = mtgLocalStream.feature(window.ACS.Calling.Features.VideoEffects);
        let sup;
        try {
          if (typeof f.isSupported === 'function' && window.ACSEffects) {
            sup = await f.isSupported(new window.ACSEffects.BackgroundBlurEffect());
          } else { sup = f.isSupported; }
        } catch (e) { sup = 'threw: ' + e.message; }
        add('effects isSupported', String(sup));
        add('activeEffects', JSON.stringify(f.activeEffects || []));
      } catch (e) { add('effects feature', 'ERROR ' + e.message); }
    } else {
      add('effects feature', 'no local stream (camera off)');
    }
    add('last effect error', mtgLastEffectError || 'none');

    // The stream types are what decide whether a share replaces a face.
    const parts = (mtgCall && mtgCall.remoteParticipants) || [];
    add('remote participants', parts.length);
    parts.forEach(function (p, i) {
      const streams = (p.videoStreams || []).map(function (v) {
        return (v.mediaStreamType || 'unknown') + (v.isAvailable ? '/on' : '/off');
      });
      add('  #' + (i + 1) + ' ' + (p.displayName || 'guest'), streams.length ? streams.join(', ') : 'no video streams');
    });

    const text = lines.join('\n');
    const el = document.getElementById('mtgDiagBox') || (function () {
      const d = document.createElement('div'); d.id = 'mtgDiagBox'; document.body.appendChild(d); return d;
    })();
    el.className = 'mtg-diag show';
    el.innerHTML = '<div class="mtg-diag-head">Meeting diagnostics'
      + '<button data-onclick="mtgCopyDiag()">Copy</button>'
      + '<button data-onclick="mtgCloseDiag()">Close</button></div>'
      + '<pre id="mtgDiagText">' + esc(text) + '</pre>';
    return text;
  };

  window.mtgCopyDiag = function () {
    const t = (document.getElementById('mtgDiagText') || {}).textContent || '';
    navigator.clipboard.writeText(t).then(
      function () { toast('Diagnostics copied — paste them in the chat', 'ok'); },
      function () { toast('Could not copy; select the text and copy manually', 'err'); }
    );
  };

  function mtgInitials(n) {
    var parts = String(n || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?') + ((parts[1] || '')[0] || '');
  }

  function mtgTiles() {
    var me = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
    var tiles = [{
      key: 'self',
      name: (me.displayName || 'You') + ' (you)',
      muted: mtgMuted,
      video: mtgVideoOn && !!mtgLocalStream,
      isSelf: true
    }];
    (mtgCall && mtgCall.remoteParticipants || []).forEach(function (p) {
      if (p.state !== 'Connected') return;
      // A participant sharing their screen sends a second stream. Treating it
      // as their camera is what made the share replace their face.
      var cam = (p.videoStreams || []).filter(function (v) {
        return v.isAvailable && v.mediaStreamType !== 'ScreenSharing';
      });
      tiles.push({
        key: (p.identifier && p.identifier.communicationUserId) || String(Math.random()).slice(2),
        name: p.displayName || 'Guest',
        muted: !!p.isMuted,
        video: cam.length > 0,
        stream: cam[0]
      });
    });
    return tiles;
  }

  // The screen being shared, if anyone is sharing. Rendered in its own frame
  // so cameras stay visible alongside it.
  /* The screen currently being presented, yours or someone else's. This used
     to read only remoteParticipants, so sharing your own screen showed you
     nothing: everyone else saw it while your side of the call had no frame at
     all. Your share arrives on call.localVideoStreams, which nothing read. */
  function mtgScreenShare() {
    // Your own share first - it is the one you are most likely to want to see.
    if (mtgCall && mtgCall.isScreenSharingOn) {
      const local = (mtgCall.localVideoStreams || []).filter(function (v) {
        return v.mediaStreamType === 'ScreenSharing';
      })[0];
      if (local) {
        const me = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
        return { key: 'screen_self', name: (me.displayName || 'You'), stream: local, isSelf: true };
      }
    }
    let found = null;
    (mtgCall && mtgCall.remoteParticipants || []).forEach(function (p) {
      if (found || p.state !== 'Connected') return;
      const sc = (p.videoStreams || []).filter(function (v) {
        return v.isAvailable && v.mediaStreamType === 'ScreenSharing';
      });
      if (sc.length) {
        found = {
          key: 'screen_' + ((p.identifier && p.identifier.communicationUserId) || 'x'),
          name: p.displayName || 'Guest',
          stream: sc[0]
        };
      }
    });
    return found;
  }

  window.mtgFitGrid = function (grid) {
    if (!grid) return;
    var n = grid.children.length;
    if (!n) return;
    var cs = getComputedStyle(grid);
    var gap = parseFloat(cs.rowGap || cs.gap) || 10;
    var W = grid.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var H = grid.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (!(W > 0 && H > 0)) {
      /* Stage has no size yet - usually the overlay is still hidden on the
         frame it was built. Returning silently used to leave the tiles at
         their CSS fallback size for good, so try again next frame; the guard
         stops that turning into an endless loop while it stays hidden. */
      if (!grid.__mtgFitRetry) {
        grid.__mtgFitRetry = true;
        requestAnimationFrame(function () {
          grid.__mtgFitRetry = false;
          window.mtgFitGrid(grid);
        });
      }
      return;
    }
    var best = { w: 0, cols: 1 };
    for (var cols = 1; cols <= n; cols++) {
      var rows = Math.ceil(n / cols);
      // Widest a tile can be in this arrangement, limited by both axes.
      var w = Math.min((W - gap * (cols - 1)) / cols,
                       ((H - gap * (rows - 1)) / rows) * (16 / 9));
      if (w > best.w) best = { w: w, cols: cols };
    }
    var tw = Math.max(120, Math.floor(best.w));
    var th = Math.floor(tw * 9 / 16);

    for (var i = 0; i < n; i++) {
      var tile = grid.children[i];
      if (!tile || !tile.style) continue;
      tile.style.width = tw + 'px';
      tile.style.height = th + 'px';
    }
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
    grid.style.gridAutoRows = '';
  };

  var mtgGridRO = null;
  var mtgObservedGrid = null;

  window.mtgObserveGrid = function (grid) {
    if (typeof ResizeObserver === 'undefined') return;   // falls back to the resize listener below
    if (!mtgGridRO) {
      mtgGridRO = new ResizeObserver(function (entries) {
        /* Deferred a frame: mtgFitGrid writes grid-template styles, and writing
           layout from inside the callback trips "ResizeObserver loop completed
           with undelivered notifications" in Chrome. */
        requestAnimationFrame(function () {
          entries.forEach(function (entry) {
            var g = entry.target;
            var w = g.clientWidth, h = g.clientHeight;
            // Only act on a real size change, so a re-fit can't feed itself.
            if (g.__mtgFitW === w && g.__mtgFitH === h) return;
            g.__mtgFitW = w; g.__mtgFitH = h;
            window.mtgFitGrid(g);
          });
        });
      });
    }
    if (mtgObservedGrid === grid) return;
    if (mtgObservedGrid) mtgGridRO.unobserve(mtgObservedGrid);
    mtgObservedGrid = grid || null;
    if (grid) mtgGridRO.observe(grid);
  };

  /* Tile size depends on the stage size, so it has to be recomputed when the
     window changes. Throttled to a frame - resize fires continuously. */
  var mtgFitPending = false;
  window.addEventListener('resize', function () {
    if (mtgFitPending) return;
    mtgFitPending = true;
    requestAnimationFrame(function () {
      mtgFitPending = false;
      window.mtgFitGrid(document.getElementById('mtgGrid'));
      window.mtgFitGrid(document.getElementById('mtgGuestGrid'));
    });
  });


  let mtgRecState = { active: false, id: '', busy: false };
  let mtgRecCaps = null;

  async function mtgRecCapabilities() {
    if (mtgRecCaps) return mtgRecCaps;
    try { mtgRecCaps = await window.ctgApiFetch('/api/meetings/recording/capabilities'); }
    catch (e) { mtgRecCaps = { recording: false, transcription: false, missing: ['server unreachable'] }; }
    return mtgRecCaps;
  }

  /* Everyone the recording would capture, by name - this is what gets stored
     as the consent record, so it has to be the real roster, not a count. */
  function mtgRecParties() {
    return mtgTiles().map(function (t) { return t.name.replace(/ \(you\)$/, ''); });
  }

  /* Announcement banner for the moment recording starts. The REC badge is the
     standing notice; this is the change, which is the part people miss. */
  function mtgRecBar() {
    const stage = (mtgOverlay() && mtgOverlay().querySelector('.mtg-stage'));
    if (!stage) return;
    const prev = stage.querySelector('.mtg-rec-toastbar');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.className = 'mtg-rec-toastbar';
    el.textContent = 'This meeting is being recorded.';
    stage.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 9000);
  }


  window.mtgConfirmPresent = async function () {
    if (!mtgActive || mtgPatientChecked) return
    // Optimistic, and reverts on failure with a plain reason - the same
    // treatment as Ready for Provider, so the two buttons behave alike.
    mtgPatientChecked = true
    mtgRenderCall()
    try {
      await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(mtgActive.id) + '/checkin', { method: 'POST' })
      toast('Patient marked as checked in', 'ok')
    } catch (e) {
      mtgPatientChecked = false
      console.error('checkin failed', e)
      var msg = (e && e.message) || ''
      if (/no appointment|not linked/i.test(msg)) {
        toast('This room has no scheduled appointment, so there is no visit to check the patient in to. Open the visit from Provider\'s Dashboard to use this.', 'err')
      } else {
        toast(msg || 'Could not mark the patient checked in', 'err')
      }
      mtgRenderCall()
    }
  }

  window.mtgMarkReady = async function () {
    if (!mtgActive || mtgReadyForProvider) return
    /* Optimistic on this button only. It used to flip 'checked in' up front too,
       so a failed call made both buttons blink on and back, which read as
       everything flickering and nothing happening. Check-in is now marked only
       once the server confirms, so a failure reverts one button, not two. */
    mtgReadyForProvider = true
    mtgRenderCall()
    try {
      await window.ctgApiFetch('/api/meetings/' + encodeURIComponent(mtgActive.id) + '/ready', { method: 'POST' })
      mtgPatientChecked = true          // confirmed present as a side effect
      toast('Provider notified — this room is ready', 'ok')
      mtgRenderCall()
    } catch (e) {
      mtgReadyForProvider = false
      console.error('mark-ready failed', e)
      /* Name the real reason. The overwhelmingly common one is a room with no
         appointment behind it - an instant meeting rather than one opened from
         Command Center - and "Could not mark ready" hid that. */
      var msg = (e && e.message) || ''
      if (/no appointment|not linked/i.test(msg)) {
        toast('This room has no scheduled appointment, so there is nothing to mark ready. Open the visit from Provider\'s Dashboard to use this.', 'err')
      } else {
        toast(msg || 'Could not mark this room ready', 'err')
      }
      mtgRenderCall()
    }
  }

  window.mtgToggleRecord = async function () {
    if (mtgRecState.busy) return;
    if (mtgRecState.active) return mtgStopRecording();
    const caps = await mtgRecCapabilities();
    if (!caps.recording) {
      toast('Recording is not set up yet — still needed: ' + (caps.missing || []).join(', '), 'err');
      return;
    }
    mtgRecConsentDialog(caps);
  };

  function mtgRecConsentDialog(caps) {
    const el = document.getElementById('mtgRecModal') || (function () {
      const d = document.createElement('div'); d.id = 'mtgRecModal'; document.body.appendChild(d); return d;
    })();
    const parties = mtgRecParties();
    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">Record this meeting</div>'
      + '<div class="mtg-rec-law">'
        + '<strong>Maryland requires everyone\u2019s consent.</strong> Under Md. Code, Cts. &amp; Jud. Proc. '
        + '\u00a710-402 every party to a recorded conversation must agree to it. A recorded clinical session is '
        + 'also protected health information. Tell everyone in the meeting that you are about to record, out loud, '
        + 'and only continue once each of them has agreed.'
      + '</div>'
      + '<div class="mtg-f-label">Everyone in the meeting right now</div>'
      + '<div class="mtg-rec-parties">' + parties.map(function (p) {
          return '<span class="mtg-rec-party">' + esc(p) + '</span>';
        }).join('') + '</div>'
      + '<div class="mtg-f-label">What to record</div>'
      /* "Audio only (MP3)" existed to feed the after-the-fact transcriber. The
         live transcript replaces that, so recording is now about keeping a
         recording \u2014 leaving the MP3 option would offer a worse route to a
         transcript than the one running in the sidebar. */
      + '<select id="mtgRecKind">'
        + '<option value="audioVideo">Audio and video (MP4)</option>'
      + '</select>'
      + (caps.transcription
          ? '<div class="small-muted" data-cs="'+__cs+'margin-top:8px">A transcript is produced automatically once the recording is ready.</div>'
          : '<div class="small-muted" data-cs="'+__cs+'margin-top:8px">Transcription is not configured yet, so this will be recorded without one.</div>')
      + '<label class="plain-check mtg-rec-check">'
        + '<input type="checkbox" id="mtgRecConsent" data-onchange="mtgRecConsentToggle()">'
        + '<span>I have told everyone above that this meeting is being recorded, and every one of them has consented.</span>'
      + '</label>'
      + '<div class="mtg-f-err" id="mtgRecErr"></div>'
      + '<div class="mtg-modal-actions">'
        + '<button class="btn btn-ghost" data-onclick="mtgCloseRec()">Cancel</button>'
        + '<button class="btn btn-primary" id="mtgRecGo" disabled data-onclick="mtgStartRecording()">Start recording</button>'
      + '</div></div>';
  }
  window.mtgRecConsentToggle = function () {
    const c = document.getElementById('mtgRecConsent'), b = document.getElementById('mtgRecGo');
    if (c && b) b.disabled = !c.checked;
  };
  window.mtgCloseRec = function () {
    const e = document.getElementById('mtgRecModal');
    if (e) { e.className = 'mtg-modal'; e.innerHTML = ''; }
  };

  window.mtgStartRecording = async function () {
    if (!mtgActive || !mtgCall) return;
    const err = document.getElementById('mtgRecErr');
    const btn = document.getElementById('mtgRecGo');
    const kind = (document.getElementById('mtgRecKind') || {}).value || 'audioVideo';
    if (btn) { btn.disabled = true; btn.textContent = 'Starting\u2026'; }
    try {
      /* The server call id is what Call Automation records against, and it does
         not exist until the call is genuinely connected - asking too early is
         the one reliable way to make this fail. */
      const serverCallId = await mtgCall.info.getServerCallId();
      const parties = mtgRecParties();
      const res = await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/recording/start', {
        method: 'POST',
        body: JSON.stringify({
          serverCallId: serverCallId,
          kind: kind,
          consent: {
            allConsented: true,
            parties: parties,
            notice: 'Verbal all-party consent obtained in-meeting (Maryland, Md. Code Cts. & Jud. Proc. 10-402).'
          }
        })
      });
      mtgRecState = { active: true, id: res.id, kind: kind, busy: false };
      window.mtgCloseRec();
      toast('Recording \u2014 press REC at the top of the screen to stop', 'ok');
      mtgRenderCall();
      // The host is a party to the recording too, and hearing the same notice
      // everyone else hears is a useful confirmation it actually went out.
      window.mtgAnnounceRecording(true);
      mtgRecBar();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Start recording'; }
      if (err) err.textContent = (e && e.message) || 'Could not start recording.';
    }
  };

  async function mtgStopRecording() {
    if (!mtgActive) return;
    mtgRecState.busy = true; mtgRenderCall();
    try {
      await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/recording/stop', { method: 'POST' });
      toast('Recording stopped \u2014 it will appear under Recordings in a few minutes', 'ok');
    } catch (e) {
      toast('Could not stop the recording: ' + ((e && e.message) || ''), 'err');
    }
    mtgRecState = { active: false, id: '', busy: false };
    mtgRenderCall();
    mtgLoadRecordings();
  }

  /* Sync the indicator from the server so a second host, or a page reload,
     shows the true state rather than this tab's guess. */
  async function mtgSyncRecording() {
    if (!mtgActive) return;
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/recording');
      const was = mtgRecState.active;
      mtgRecState.active = !!r.active;
      mtgRecState.id = (r.recording && r.recording.id) || '';
      mtgRecState.kind = (r.recording && r.recording.kind) || '';
      if (was !== mtgRecState.active) {
        mtgRenderCall();
        // Only on the transition into recording - not on every poll.
        if (mtgRecState.active) { window.mtgAnnounceRecording(true); mtgRecBar(); }
      }
    } catch (e) { /* transient */ }
  }


  /* ---------------- in-meeting chat ---------------- */

  /* The side panel is re-rendered on every participant change, which would
     wipe whatever someone was halfway through typing. The draft is therefore
     held here rather than only in the DOM, and restored after each render. */
  let mtgSidePane = 'people';
  let mtgSideHidden = false;
  /* Admitted link guests in the meeting you are in, refreshed on the lobby
     poll. Kept separate from the ACS roster: only these people can
     be removed, and only this list carries the guest id to remove them by. */
  let mtgGuests = [];
  let mtgChat = [];
  let mtgChatDraft = '';
  let mtgChatSeen = 0;

  window.mtgSetPane = function (pane) {
    mtgSidePane = pane;
    // Asking for a pane means you want to look at it. Opening the panel is
    // implied - otherwise clicking Chat while collapsed appears to do nothing.
    mtgSideHidden = false;
    if (pane === 'transcript') { mtgRenderCall(); mtgTxToBottom(); return; }
    if (pane === 'chat') mtgChatSeen = mtgChat.length;
    mtgRenderCall();
    if (pane === 'chat') {
      const i = document.getElementById('mtgChatInput');
      if (i) i.focus();
      mtgChatToBottom();
    }
  };

  /* A one-field prompt in the meeting's own dialog styling. Native prompt()
     would work, but it renders as browser chrome on top of a full-screen call,
     and on a clinical page that reads as an error. */
  function mtgPrompt(label, value) {
    return new Promise(function (resolve) {
      let el = document.getElementById('mtgPromptModal');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mtgPromptModal';
        document.body.appendChild(el);
      }
      el.className = 'mtg-modal show';
      el.innerHTML = '<div class="mtg-modal-card">'
        + '<div class="mtg-modal-title">Rename participant</div>'
        + '<div class="mtg-f-label" data-cs="'+__cs+'margin-bottom:6px">' + esc(label) + '</div>'
        + '<input id="mtgPromptInput" type="text" maxlength="120" value="' + esc(value) + '">'
        + '<div class="mtg-modal-actions">'
          + '<button class="btn btn-ghost" id="mtgPromptCancel">Cancel</button>'
          + '<button class="btn btn-primary" id="mtgPromptOk">Save</button>'
        + '</div></div>';

      const input = document.getElementById('mtgPromptInput');
      const done = function (result) {
        el.className = 'mtg-modal';
        el.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = function (e) {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter' && document.activeElement === input) done(input.value);
      };
      document.getElementById('mtgPromptOk').onclick = function () { done(input.value); };
      document.getElementById('mtgPromptCancel').onclick = function () { done(null); };
      document.addEventListener('keydown', onKey);
      input.focus();
      input.select();
    });
  }

  /* Raised hands and host name corrections, keyed by ACS user id. Both ride
     along on the chat response rather than having their own poll. */
  let mtgHands = [];
  let mtgNames = {};

  /* Live transcript. Lines arrive on the same poll; `mtgTxSeq` is the highest
     line we hold, so the server sends only what is new rather than the whole
     transcript every few seconds. */
  let mtgTx = [];
  let mtgTxSeq = 0;
  let mtgTxSession = null;
  let mtgTxState = 'stopped';   // stopped | starting | listening | error
  let mtgTxError = '';
  let mtgTxPartial = '';
  /* Whether this person switched the transcript on during this meeting, and
     whether the end-of-meeting copy has already been written. The transcript
     lives only in memory, so leaving without saving loses it - the automatic
     save on exit is what makes that acceptable. */
  let mtgTxUsed = false;
  let mtgTxSaved = false;

  /* Live translation. `mtgTxSpeak` is what this person speaks (it configures
     the recogniser); `mtgTxRead` is the language they want to READ, which the
     server uses to decide what to translate each finished phrase into. Empty
     means off, and off costs nothing. */
  const MTG_SPEAK = [
    // Auto first, and the default: someone who has never used this should not
    // have to choose before they can be understood. Every manual option below
    // is unchanged, for when the detector needs overruling.
    ['auto', 'Detect automatically'],
    ['en-US', 'English'], ['es-MX', 'Spanish (Mexico)'], ['es-ES', 'Spanish (Spain)'],
    ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Mandarin)'], ['vi-VN', 'Vietnamese'],
    ['ru-RU', 'Russian'], ['ar-SA', 'Arabic'], ['fr-FR', 'French'], ['fil-PH', 'Tagalog'],
    ['ja-JP', 'Japanese'], ['ur-IN', 'Urdu'], ['am-ET', 'Amharic'], ['ne-NP', 'Nepali']
  ];
  const MTG_READ = [
    ['en', 'English'], ['es', 'Spanish'], ['ko', 'Korean'], ['zh-Hans', 'Chinese (Simplified)'],
    ['vi', 'Vietnamese'], ['ru', 'Russian'], ['ar', 'Arabic'], ['fr', 'French'],
    ['fil', 'Tagalog'], ['ja', 'Japanese'], ['ur', 'Urdu'], ['am', 'Amharic'], ['ne', 'Nepali'],
    ['ht', 'Haitian Creole']
  ];
  /* Read-language code -> the label a person recognises. The stored
     transcript keys translations by code ('en', 'es', 'zh-Hans'), which is
     right for a data structure and wrong on screen. Falls back to the code so
     a language added later still renders something honest. */
  function mtgLangLabel(code) {
    const hit = MTG_READ.find(function (o) { return o[0] === code; });
    return hit ? hit[1] : code;
  }

  let mtgTxSpeak = 'en-US';
  let mtgTxDetected = '';      // what auto-detect last heard, for the label
  let mtgTxLocales = [];       // candidates published by the server
  /* Everyone on the clinic side works in English, so English is the default
     rather than something to infer. A patient speaking Tagalog is read in
     English from the first line, with nobody hunting a menu mid-appointment.
     Still a dropdown: a default is a default, not a decision made for them. */
  let mtgTxRead = 'en';
  /* What the server has actually been told. The room only translates into
     languages somebody has REGISTERED, so holding 'en' in this tab means
     nothing until it has been sent - and the poll below is what makes that
     self-healing after a reconnect or a server restart. */
  /* The room's four language settings, mirrored from the poll. This tab
     never decides them - it either sets them (with the permission) or
     follows them. */
  let mtgTranslation = { patientLang: '', subtitles: true, clinicSpeak: 'en-US', clinicRead: 'en' };
  /* Subtitles over the video. The side panel is a record you read afterwards;
     during the visit nobody looks away from the person they are talking to, so
     the line has to be under the face. */
  let mtgCCOn = true;   // mirrors mtgTranslation.subtitles
  // seq -> when the line first went on screen, so a re-render can resume its
  // fade rather than restart it.
  const mtgCCSeen = new Map();

  // A corrected name always wins over whatever the person typed into the SDK.
  function mtgLabel(key, fallback) {
    return (key && mtgNames[key]) || fallback;
  }

  let mtgChatLoading = false;
  let mtgChatQueued = false;

  function mtgPanelBusy() {
    const a = document.activeElement;
    return !!(a && a.tagName === 'SELECT');
  }

  async function mtgLoadChat() {
    if (!mtgActive) return;
    if (mtgChatLoading) { mtgChatQueued = true; return; }
    mtgChatLoading = true;
    const forMeeting = mtgActive.id;
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + forMeeting + '/chat?since=' + mtgTxSeq);
      if (!mtgActive || mtgActive.id !== forMeeting) return;
      mtgChat = r.messages || [];
      // Whatever the controller last set, for every participant alike.
      if (r.translation) mtgApplyTranslation(r.translation);
      mtgHands = r.hands || [];
      mtgNames = r.names || {};
      if (r.transcript && r.transcript.length) {
        r.transcript.forEach(function (line) {
          if (line.seq > mtgTxSeq) { mtgTx.push(line); mtgTxSeq = line.seq; }
        });
      } else if (typeof r.transcriptSeq === 'number' && r.transcriptSeq < mtgTxSeq) {
        /* The server restarted and lost the room, so its counter went
           backwards. Ours is now ahead of anything it will send and we would
           never see another line - reset and take the transcript again. */
        mtgTx = []; mtgTxSeq = 0;
      }
      /* Belt and braces for the host ending the meeting. The WebSocket is the
         fast path, but a socket that dropped and has not reconnected would
         leave this browser sitting in a closed room - and that is the one
         message where arriving late is not acceptable. */
      if (r.meetingStatus === 'ended' || r.meetingStatus === 'cancelled') {
        mtgRoomClosed(mtgActive && mtgActive.id, r.meetingStatus === 'cancelled' ? 'cancelled' : 'ended');
        return;
      }
      if (mtgSidePane === 'chat') mtgChatSeen = mtgChat.length;
      if (!mtgPanelBusy()) {
        mtgRenderCall();
        mtgChatToBottom();
        mtgTxToBottom();
      }
      // Subtitles are painted into their node directly, so they keep arriving
      // even while a dropdown is held open.
      mtgCCPaint();
    } catch (e) { /* chat is not worth breaking the call over */ }
    finally {
      mtgChatLoading = false;
      // Something asked while we were busy - serve it now, once.
      if (mtgChatQueued) { mtgChatQueued = false; mtgLoadChat(); }
    }
  }

  /* ---------------- live transcript ---------------- */

  function mtgTxToBottom() {
    const b = document.getElementById('mtgTxBody');
    if (b) b.scrollTop = b.scrollHeight;
  }

  /* Rail shortcut: reveal the sidebar AND switch to the transcript tab.
     Switching tabs on a hidden panel looks like the button did nothing, which
     is exactly how the first version of this got lost. */
  window.mtgOpenTranscript = function () {
    mtgSetPane('transcript');   // un-collapses the panel on its way through
  };

  function mtgWriteTranscriptFile(reason) {
    if (!mtgTx.length) return null;
    const me = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
    const file = window.mtgTranscript.download(mtgTx, {
      title: mtgActive ? mtgActive.title : '',
      savedBy: me.displayName || me.username || '',
      // So the file names languages the way the picker does, rather than
      // leaving a bare 'ko' for whoever opens it in a year's time.
      langNames: MTG_READ.reduce(function (m, o) { m[o[0]] = o[1]; return m; }, {})
    });
    if (!file) return null;
    /* Audited, but never awaited. A logging failure must not stop a clinician
       getting the file - the download has already happened by the time this
       fires, and on the way out of a meeting the page may be torn down before
       any response arrives. */
    if (mtgActive) {
      window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/transcript/download', {
        method: 'POST', body: JSON.stringify({ lines: mtgTx.length, reason: reason || 'manual' })
      }).catch(function () {});
    }
    return file;
  }

  window.mtgSaveTranscript = function () {
    if (!mtgTx.length) { toast('Nothing has been transcribed yet.', 'err'); return; }
    const file = mtgWriteTranscriptFile('manual');
    if (!file) { toast('Could not save the transcript.', 'err'); return; }
    mtgTxSaved = true;
    toast('Saved ' + file, 'ok');
  };

  function mtgAutoSaveTranscript() {
    if (mtgTxSaved || !mtgTx.length) return;
    mtgTxSaved = true;
    const file = mtgWriteTranscriptFile(mtgTxUsed ? 'meeting-ended' : 'meeting-ended-handover');
    if (file) {
      toast(mtgTxUsed
        ? 'Transcript saved to this computer as ' + file
        : 'A transcript was running in this meeting — it has been saved to this computer as ' + file, 'ok');
    } else {
      toast('The transcript could not be saved automatically — it has been lost.', 'err');
    }
  }

  let mtgTxAutoTried = false;
  let mtgTxStoppedByUser = false;

  function mtgAutoStartTranscript() {
    if (mtgTxAutoTried || mtgTxStoppedByUser) return;
    if (!mtgActive || !window.mtgTranscript) return;
    if (mtgTxSession && mtgTxSession.isRunning()) return;
    mtgTxAutoTried = true;
    mtgStartLiveTranscript({ silent: true });
  }

  /* Painted straight into the node rather than through mtgRenderCall: a
     re-render per interim word would rebuild every video tile several times a
     second. Clears itself after a pause so a stale line does not sit over
     somebody's face for the rest of the meeting. */
  function mtgCCLife(text) {
    return Math.min(9000, Math.max(2800, 1800 + String(text || '').length * 55));
  }

  function mtgCCPaint() {
    const el = document.getElementById('mtgCC');
    if (!el) return;
    if (!mtgTx.length) mtgCCSeen.clear();
    if (!mtgCCOn) { el.innerHTML = ''; el.style.display = 'none'; return; }

    const now = Date.now();
    mtgTx.slice(-3).forEach(function (l) {
      if (el.querySelector('[data-seq="' + l.seq + '"]')) return;
      const shown = (mtgTxRead && l.tr && l.tr[mtgTxRead]) || l.text;
      if (!shown) return;
      let first = mtgCCSeen.get(l.seq);
      if (first === undefined) { first = now; mtgCCSeen.set(l.seq, first); }
      const life = mtgCCLife(shown);
      const elapsed = now - first;
      if (elapsed >= life) return;            // it has already had its turn
      const d = document.createElement('div');
      d.className = 'mtg-cc-line';
      d.setAttribute('data-seq', l.seq);
      d.style.setProperty('--life', life + 'ms');
      d.style.animationDelay = (-elapsed) + 'ms';
      d.innerHTML = '<b>' + esc(mtgLabel(l.key, l.name)) + '</b>' + esc(shown);
      d.addEventListener('animationend', function () {
        d.remove();
        if (!el.children.length) el.style.display = 'none';
      });
      const live = el.querySelector('.mtg-cc-line.live');
      if (live) el.insertBefore(d, live); else el.appendChild(d);
    });

    // The interim line is updated in place and never fades - it is replaced by
    // the finished phrase the moment there is one.
    let live = el.querySelector('.mtg-cc-line.live');
    if (mtgTxPartial) {
      if (!live) {
        live = document.createElement('div');
        live.className = 'mtg-cc-line live';
        el.appendChild(live);
      }
      live.innerHTML = '<b>You</b>' + esc(mtgTxPartial);
    } else if (live) { live.remove(); }

    /* Pruned, never wiped. Clearing this made lines that had already faded
       look unseen again, so they came back on screen. */
    if (mtgCCSeen.size > 400) {
      const keep = {};
      mtgTx.slice(-6).forEach(function (l) { keep[l.seq] = 1; });
      mtgCCSeen.forEach(function (_v, k) { if (!keep[k]) mtgCCSeen.delete(k); });
    }
    el.style.display = el.children.length ? '' : 'none';
  }

  function mtgTxAutoCandidates() {
    const fromServer = (mtgTxLocales && mtgTxLocales.length) ? mtgTxLocales : [];
    if (fromServer.length > 1) return fromServer;
    return ['en-US', 'es-MX', 'fil-PH', 'ko-KR'];
  }

  function mtgTxDetectedLabel() {
    if (mtgTxSpeak !== 'auto' || !mtgTxDetected) return '';
    const hit = MTG_SPEAK.filter(function (o) {
      return o[0].toLowerCase() === mtgTxDetected.toLowerCase();
    })[0];
    return hit ? hit[1] : mtgTxDetected;
  }

  /* Subtitles are the meeting's, not this screen's. Turning them off used to
     clear them from the clinician's own video while leaving them burned across
     the patient's - the one person with no way to turn them off. */
  window.mtgToggleSubtitles = function () {
    if (!mtgActive || !mtgCanSetTranslation()) return;
    const want = !mtgCCOn;
    mtgApplyTranslation(Object.assign({}, mtgTranslation, { subtitles: want }));
    window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/translation', {
      method: 'POST', body: JSON.stringify({ subtitles: want })
    }).then(function (d) {
      if (d && d.translation) mtgApplyTranslation(d.translation);
    }).catch(function () {
      toast('Could not change subtitles for the meeting.', 'err');
    });
  };

  function mtgCanSetTranslation() { return mtgCan('mtg.translate'); }

  /* No "Detect automatically": the choice has to yield a language
     to translate INTO as well as one to listen for, and detection cannot give
     that until somebody has already spoken. Empty means both sides are in
     English, so nothing is translated and nothing is charged. */
  const MTG_PATIENT_LANGS = [['', 'English — no translation']].concat(
    MTG_SPEAK.filter(function (o) { return o[0] !== 'auto' && o[0] !== 'en-US'; })
  );

  window.mtgSetPatientLang = function (value) {
    if (!mtgActive || !mtgCanSetTranslation()) return;
    const lang = String(value == null ? '' : value);
    // Painted at once; the poll confirms. Waiting for the round trip made the
    // dropdown feel broken on a slow connection.
    mtgApplyTranslation(Object.assign({}, mtgTranslation, { patientLang: lang }));
    window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/translation', {
      method: 'POST', body: JSON.stringify({ patientLang: lang })
    }).then(function (d) {
      if (d && d.translation) mtgApplyTranslation(d.translation);
      if (lang && d && d.available === false) toast('Translation is not configured on this server yet.', 'err');
    }).catch(function () {
      toast('Could not change the meeting language.', 'err');
    });
  };

  /* The room's setting arriving from a poll, a socket nudge, or this tab's own
     change. Cycling the recogniser is why this is a function and not an
     assignment: it is built with a language, so a running one keeps the old
     model until it is restarted. */
  function mtgApplyTranslation(t) {
    if (!t) return;
    const next = {
      patientLang: t.patientLang || '',
      subtitles: t.subtitles !== false,
      clinicSpeak: t.clinicSpeak || 'en-US',
      clinicRead: t.clinicRead || 'en'
    };
    /* Runs on every poll, so it must cost nothing when nothing changed
       re-rendering the stage twice a second would rebuild every video tile and
       restart each subtitle's fade. */
    if (JSON.stringify(next) === JSON.stringify(mtgTranslation)) return;
    const prev = mtgTranslation;
    const prevSpeak = mtgTxSpeak;
    mtgTranslation = next;
    mtgCCOn = next.subtitles;
    mtgTxSpeak = next.clinicSpeak;
    mtgTxRead = next.clinicRead;
    if (prevSpeak !== mtgTxSpeak && mtgTxSession && mtgTxSession.isRunning()) {
      mtgTxSession.stop();
      setTimeout(function () { mtgStartLiveTranscript({ silent: true }); }, 400);
    }
    const stageAffected = prev.subtitles !== next.subtitles || prev.clinicRead !== next.clinicRead;
    const panel = document.querySelector('.mtg-tx-langs');
    if (stageAffected) mtgRenderCall();
    else if (panel) panel.outerHTML = mtgLangPanelHtml();
    mtgCCPaint();
  }

  /* One labelled row, always visible to the controller - a toggle to reveal a
     single dropdown is a click that buys nothing. */
  function mtgLangPanelHtml() {
    if (!mtgCanSetTranslation()) return '';
    return '<div class="mtg-tx-langs">'
      + '<label class="mtg-tx-lang">'
        + '<span class="mtg-tx-lang-k">Patient speaks</span>'
        + '<span class="mtg-tx-lang-v">'
          + '<select data-onchange="mtgSetPatientLang(this.value)">'
            + MTG_PATIENT_LANGS.map(function (o) {
                return '<option value="' + esc(o[0]) + '"' + (o[0] === mtgTranslation.patientLang ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
              }).join('')
          + '</select>'
        + '</span>'
      + '</label>'
      + '<div class="mtg-tx-langs-ft">'
        + (mtgTranslation.patientLang
            ? 'The patient reads this meeting in their language; you read it in English.'
            : 'Everyone is in English. Pick a language to start translating.')
      + '</div>'
    + '</div>';
  }

  window.mtgToggleLiveTranscript = function () {
    if (mtgTxSession && mtgTxSession.isRunning()) { mtgTxStoppedByUser = true; }
    return mtgToggleLiveTranscriptInner();
  };

  function mtgToggleLiveTranscriptInner() {
    if (!mtgActive) return;
    if (mtgTxSession && mtgTxSession.isRunning()) { mtgTxSession.stop(); return; }
    if (!window.mtgTranscript) { toast('Transcript module failed to load.', 'err'); return; }
    mtgStartLiveTranscript({ silent: false });
  }

  function mtgStartLiveTranscript(opts) {
    const silent = !!(opts && opts.silent);
    if (!mtgActive || !window.mtgTranscript) return;

    mtgTxError = '';
    /* Every start builds a NEW session, so the previous one has to be let go
       rather than merely stopped - otherwise its keep-alive watchdog and its
       window listeners outlive it, and a meeting with a few language changes
       accumulates one set per change. */
    try { if (mtgTxSession) mtgTxSession.dispose(); } catch (e) {}
    mtgTxSession = window.mtgTranscript.createSession({
      fetchToken: function () {
        return window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/transcribe/token')
          .then(function (cred) {
            // The server's candidate list for auto-detect rides along with the
            // token; no second request, and no list hard-coded in the client.
            if (cred && cred.locales && cred.locales.length) mtgTxLocales = cred.locales;
            return cred;
          });
      },
      /* Fire-and-forget. A dropped phrase must never stall the recogniser
         the next one is already arriving. */
      postLine: function (text, detected) {
        window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/transcript', {
          method: 'POST',
          /* `lang` tells the translator what it is reading, which is far more
             reliable than letting it guess from one short phrase. Under
             auto-detect that is whatever the recogniser just heard; otherwise
             it is what the person picked. */
          body: JSON.stringify({
            text: text, key: mtgSelfKey(),
            lang: detected || (mtgTxSpeak === 'auto' ? '' : mtgTxSpeak)
          })
        }).then(mtgLoadChat).catch(function () {});
      },
      language: function () { return mtgTxSpeak; },
      autoDetect: function () { return mtgTxAutoCandidates(); },
      onLanguage: function (lang) {
        if (!lang || lang === mtgTxDetected) return;
        mtgTxDetected = lang;
        mtgRenderCall();
      },
      micId: function () {
        try { return mtgDeviceMgr && mtgDeviceMgr.selectedMicrophone && mtgDeviceMgr.selectedMicrophone.id; }
        catch (e) { return ''; }
      },
      /* The transcript opens its own microphone stream, so muting the call
         does not mute it - without this, an aside said while muted would be
         recognised, shown to everyone in the meeting and saved to the
         record. Read live, so a session that starts muted starts quiet. */
      muted: function () { return mtgMuted; },
      onState: function (state, detail) {
        mtgTxState = state;
        if (state === 'error') {
          mtgTxError = detail || 'Transcript stopped.';
          /* An auto-start that fails because Speech is not configured on this
             server would otherwise throw the same red banner into every single
             meeting. The panel still shows what happened. */
          if (!silent) toast(mtgTxError, 'err');
        }
        if (state === 'listening' && !silent) toast('Live transcript is on — only your microphone is transcribed here', 'ok');
        if (state === 'listening' && silent) toast('Live transcript started automatically', 'ok');
        mtgRenderCall();
      },
      onPartial: function (text) {
        mtgTxPartial = text || '';
        // Painted directly: a re-render per interim word would rebuild every
        // video tile several times a second.
        const el = document.getElementById('mtgTxPartial');
        if (el) { el.textContent = mtgTxPartial; el.style.display = mtgTxPartial ? '' : 'none'; }
        mtgCCPaint();
        mtgTxToBottom();
      }
    });
    mtgTxUsed = true;   // earns this person the automatic copy on the way out
    mtgTxSession.start();
    // Only a deliberate click changes what you are looking at. Starting by
    // itself must not yank the sidebar away from the roster or the chat.
    if (!silent) mtgSidePane = 'transcript';
    mtgRenderCall();
  }

  function mtgTxHtml() {
    const rows = mtgTx.length
      ? mtgTx.map(function (l) {
          const t = new Date(l.at);
          /* When a translation exists for the language this person is reading,
             it leads and the original sits under it in a quieter style. Both
             are kept: a clinician needs to be able to see what was actually
             said, not only what a machine made of it. */
          const shown = (mtgTxRead && l.tr && l.tr[mtgTxRead]) || '';
          return '<div class="mtg-tx-row"><div class="mtg-tx-who">' + esc(mtgLabel(l.key, l.name))
            + '<span class="mtg-tx-at">' + String(t.getHours()).padStart(2, '0') + ':'
            + String(t.getMinutes()).padStart(2, '0') + '</span></div>'
            + '<div class="mtg-tx-text">' + esc(shown || l.text) + '</div>'
            + (shown ? '<div class="mtg-tx-orig">' + esc(l.text) + '</div>' : '')
            + '</div>';
        }).join('')
      : '<div class="mtg-chat-empty">Nothing transcribed yet. Each person\'s own device transcribes their own microphone, so everyone who wants to be included has to switch it on.</div>';

    const on = mtgTxState === 'listening';
    const busy = mtgTxState === 'starting';
    /* Somebody else is transcribing and this person is not. Worth saying out
       loud: it tells them the session is being written down, and that the file
       will land on their machine when the meeting ends - which is otherwise a
       surprise download. */
    const inherited = !mtgTxUsed && mtgTx.length > 0;
    return (inherited
      ? '<div class="mtg-tx-note">A transcript is running in this meeting. '
        + 'A copy will be saved to this computer when the meeting ends.</div>'
      : '')
      + '<div class="mtg-tx-bar">'
      + '<button class="mtg-tx-toggle' + (on ? ' on' : '') + '" data-onclick="mtgToggleLiveTranscript()"' + (busy ? ' disabled' : '') + '>'
        + (busy ? 'Starting…' : on ? 'Stop my transcript' : 'Transcribe my mic') + '</button>'
      + '<button class="mtg-tx-save" data-onclick="mtgSaveTranscript()" title="Save the transcript to this computer as a text file"'
        + (mtgTx.length ? '' : ' disabled') + '>' + IC.download + '</button>'
      + (on ? '<span class="mtg-tx-live"><i></i>Listening</span>' : '')
      + '</div>'
      /* Its own row. The bar above is 296px holding a toggle, a save button and
         a listening indicator - a fourth control was being cut in half. */
      + '<div class="mtg-tx-tools">'
        /* Same permission as the language: subtitles are what the ROOM sees,
           so only the account that sets the room's translation turns them on
           and off. Everyone else follows and has nothing to press. */
        + (mtgCanSetTranslation()
            ? '<button class="mtg-tx-tr' + (mtgCCOn ? ' on' : '') + '" data-onclick="mtgToggleSubtitles()"'
              + ' title="Show or hide captions for everyone in this meeting">'
              + (mtgCCOn ? 'Subtitles on' : 'Subtitles off') + '</button>'
            : '')
      + '</div>'
      + mtgLangPanelHtml()
      + (mtgTxError ? '<div class="mtg-tx-err">' + esc(mtgTxError) + '</div>' : '')
      + '<div class="mtg-tx-list" id="mtgTxBody">' + rows
        + '<div class="mtg-tx-partial" id="mtgTxPartial" data-cs="'+__cs+'display:none"></div>'
      + '</div>';
  }

  /* Hands drop themselves after 15 seconds. The server is the authority, but
     it is only consulted on the chat poll - so the same rule is applied here
     too, or a hand would linger for however long is left of the poll interval
     after it should have gone. */
  var MTG_HAND_TTL_MS = 15000;

  function mtgFreshHands() {
    var cutoff = Date.now() - MTG_HAND_TTL_MS;
    return mtgHands.filter(function (h) { return h.at >= cutoff; });
  }

  function mtgHandUp(key) {
    return mtgFreshHands().some(function (h) { return h.key === key; });
  }

  /* Re-render exactly when the oldest hand expires, so it disappears on time
     rather than whenever something else happens to trigger a render. One
     timer for the whole room, not one per hand. */
  var mtgHandTimer = null;
  function mtgScheduleHandExpiry() {
    clearTimeout(mtgHandTimer);
    var fresh = mtgFreshHands();
    if (!fresh.length) return;
    var soonest = Math.min.apply(null, fresh.map(function (h) {
      return h.at + MTG_HAND_TTL_MS - Date.now();
    }));
    mtgHandTimer = setTimeout(function () { mtgRenderCall(); }, Math.max(250, soonest + 60));
  }

  /* My own hand is keyed by MY acs id so it lands on my tile for everyone
     else, falling back to the account id if the call has not connected yet. */
  function mtgSelfKey() {
    const me = (window.ctgCurrentUser && window.ctgCurrentUser()) || {};
    return mtgMyAcsId || me.id || 'self';
  }

  function mtgRoomKey(t) { return t && t.isSelf ? mtgSelfKey() : (t && t.key); }

  window.mtgToggleHand = async function () {
    if (!mtgActive) return;
    const key = mtgSelfKey();
    const raised = !mtgHandUp(key);
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/hand', {
        method: 'POST', body: JSON.stringify({ key: key, raised: raised })
      });
      mtgHands = r.hands || [];
      mtgRenderCall();
      if (raised) toast('Your hand is up — the host can see it', 'ok');
    } catch (e) { toast('Could not raise your hand: ' + (e.message || ''), 'err'); }
  };

  window.mtgLowerHandFor = async function (key) {
    if (!mtgActive) return;
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/hand', {
        method: 'POST', body: JSON.stringify({ key: key, raised: false })
      });
      mtgHands = r.hands || [];
      mtgRenderCall();
    } catch (e) { toast('Could not lower that hand.', 'err'); }
  };

  /* Renaming cannot change what the person typed into the calling SDK - ACS
     lets only the participant set that - so this stores a label the portal
     applies on top, for everyone. */
  window.mtgRenameParticipant = async function (key, current) {
    if (!mtgActive) return;
    const name = await mtgPrompt('Display name for this participant', current || '');
    if (name === null) return;
    const clean = String(name).trim();
    if (!clean) { toast('Enter a name.', 'err'); return; }
    try {
      const r = await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/rename', {
        method: 'POST', body: JSON.stringify({ key: key, name: clean })
      });
      mtgNames = r.names || {};
      mtgRenderCall();
      toast('Renamed to ' + clean, 'ok');
    } catch (e) { toast('Could not rename: ' + (e.message || ''), 'err'); }
  };

  function mtgChatToBottom() {
    const b = document.getElementById('mtgChatBody');
    if (b) b.scrollTop = b.scrollHeight;
  }

  window.mtgChatKey = function (ev) {
    mtgChatDraft = ev.target.value;
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); window.mtgChatSend(); }
  };

  window.mtgChatSend = async function () {
    const i = document.getElementById('mtgChatInput');
    const body = (i && i.value || '').trim();
    if (!body || !mtgActive) return;
    i.value = ''; mtgChatDraft = '';
    try {
      await window.ctgApiFetch('/api/meetings/' + mtgActive.id + '/chat', {
        method: 'POST', body: JSON.stringify({ body: body })
      });
      await mtgLoadChat();
    } catch (e) {
      toast((e && e.message) || 'Message not sent.', 'err');
      if (i) { i.value = body; mtgChatDraft = body; }
    }
  };

  function mtgChatHtml() {
    const rows = mtgChat.length
      ? mtgChat.map(function (m) {
          const t = new Date(m.at);
          return '<div class="mtg-chat-row">'
            + '<div class="mtg-chat-who">' + esc(m.name)
              + (m.isGuest ? '<span class="mtg-chat-guest">guest</span>' : '')
              + '<span class="mtg-chat-at">' + String(t.getHours()).padStart(2, '0') + ':'
              + String(t.getMinutes()).padStart(2, '0') + '</span></div>'
            + '<div class="mtg-chat-body">' + esc(m.body) + '</div></div>';
        }).join('')
      : '<div class="mtg-chat-empty">No messages yet. Anything typed here is visible to everyone in the meeting, including guests.</div>';
    return '<div class="mtg-chat-list" id="mtgChatBody">' + rows + '</div>'
      + '<div class="mtg-chat-compose">'
        + '<textarea id="mtgChatInput" rows="2" placeholder="Message everyone…" '
          + 'data-onkeydown="mtgChatKey(event)" data-oninput="mtgChatKey(event)">' + esc(mtgChatDraft) + '</textarea>'
        + '<button class="btn btn-primary btn-sm" data-onclick="mtgChatSend()">Send</button>'
      + '</div>';
  }

  /* The overflow menu. The control bar carries the five things you have to be
     able to hit without reading: microphone, camera, present, more, leave.
     Everything else lives in here, written out in words. Each item calls the
     same function its old rail button called. */
  let mtgMoreOpen = false;

  /* The overlay is MOVED into the Document Picture-in-Picture window when the
     meeting is floated, so document.getElementById() finds nothing while it is
     out there. Search the overlay itself and the menu keeps working in both
     documents. */
  function mtgQ(id) {
    const el = mtgOverlay();
    if (el) {
      const hit = (el.ownerDocument || document).getElementById(id);
      if (hit) return hit;
    }
    return document.getElementById(id);
  }

  // Anything inside the menu that is asking to be looked at.
  function mtgMoreAlert() {
    return mtgChat.length > mtgChatSeen || mtgRecState.active
      || mtgTxState === 'listening' || mtgHandUp(mtgSelfKey());
  }

  window.mtgToggleMore = function (ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    // Menu, background picker and device picker share the same patch of screen.
    if (mtgBgOpen) { mtgBgOpen = false; mtgRenderBgPanel(); }
    if (mtgDevOpen) { mtgDevOpen = false; mtgRenderDevPanel(); }
    mtgMoreOpen = !mtgMoreOpen;
    mtgRenderMore();
  };

  window.mtgCloseMore = function () {
    if (!mtgMoreOpen) return;
    mtgMoreOpen = false;
    mtgRenderMore();
  };

  /* Click-away and Escape, bound only while the menu is open - and bound to
     whichever document the overlay currently lives in, for the same
     floating-window reason as mtgQ(). Capture, so the handler runs before the
     button's own onclick and cannot fight it. */
  let mtgMoreAway = null;
  function mtgMoreListen(on) {
    if (mtgMoreAway) {
      mtgMoreAway.doc.removeEventListener('click', mtgMoreAway.click, true);
      mtgMoreAway.doc.removeEventListener('keydown', mtgMoreAway.key, true);
      mtgMoreAway = null;
    }
    if (!on) return;
    const doc = (mtgOverlay() && mtgOverlay().ownerDocument) || document;
    const click = function (ev) {
      const m = mtgQ('mtgMoreMenu'), b = mtgQ('mtgMoreBtn');
      if ((m && m.contains(ev.target)) || (b && b.contains(ev.target))) return;
      window.mtgCloseMore();
    };
    const key = function (ev) {
      if (ev.key === 'Escape') { window.mtgCloseMore(); const b = mtgQ('mtgMoreBtn'); if (b) b.focus(); }
    };
    doc.addEventListener('click', click, true);
    doc.addEventListener('keydown', key, true);
    mtgMoreAway = { doc: doc, click: click, key: key };
  }

  function mtgRenderMore() {
    const m = mtgQ('mtgMoreMenu');
    if (!m) return;
    m.classList.toggle('show', mtgMoreOpen);
    const b = mtgQ('mtgMoreBtn');
    if (b) b.setAttribute('aria-expanded', mtgMoreOpen ? 'true' : 'false');
    mtgMoreListen(mtgMoreOpen);
    if (!mtgMoreOpen) { m.innerHTML = ''; return; }

    const unread = mtgChat.length - mtgChatSeen;
    const floating = typeof window.mtgMiniOpen === 'function' && window.mtgMiniOpen();
    const recording = mtgRecState.active && mtgRecState.kind !== 'audio';
    const handUp = mtgHandUp(mtgSelfKey());
    const item = function (o) {
      return '<button class="mtg-menu-item' + (o.on ? ' on' : '') + '" role="menuitem"'
        + ' data-onclick="' + o.fn + '"' + (o.on == null ? '' : ' aria-pressed="' + (o.on ? 'true' : 'false') + '"')
        + '>' + o.icon + '<span>' + esc(o.lbl) + '</span>'
        + (o.tag ? '<span class="mtg-menu-tag' + (o.tagCls ? ' ' + o.tagCls : '') + '">' + esc(o.tag) + '</span>' : '')
        + '</button>';
    };

    m.innerHTML =
        item({ fn: 'mtgMoreDo(\'people\')', icon: IC.people, lbl: 'People and chat',
               tag: unread > 0 ? String(unread) : '' })
      + item({ fn: 'mtgMoreDo(\'hand\')', icon: IC.hand, on: handUp,
               lbl: handUp ? 'Lower your hand' : 'Raise your hand' })
      + '<div class="mtg-menu-sep"></div>'
      /* Same action the header button calls - the only reason this exists too
         is that the header button hides on a narrow phone and on the docked
         and floating cards (no room), and confirming presence matters too
         much to only be reachable on a wide window. */
      + item({ fn: 'mtgMoreDo(\'checkin\')', icon: IC.checkin, on: mtgPatientChecked,
               lbl: mtgPatientChecked ? 'Patient checked in' : 'Confirm patient present' })
      // Also in the ⋮ menu, for the narrow phone and docked cases where the
      // header button is hidden - same reasoning as check-in above.
      + item({ fn: 'mtgMoreDo(\'ready\')', icon: IC.checkin, on: mtgReadyForProvider,
               lbl: mtgReadyForProvider ? 'Ready for provider' : 'Mark ready for provider' })
      + '<div class="mtg-menu-sep"></div>'
      /* Floats the whole meeting in its own OS window - over other tabs, other
         applications, the desktop. Falls back to video-only PiP on browsers
         without Document Picture-in-Picture. */
      + item({ fn: 'mtgMoreDo(\'float\')', icon: IC.pip, on: floating,
               lbl: floating ? 'Stop floating' : 'Float over other apps' })
      /* Live transcript: written down as it is said. Distinct from recording,
         which produces a file to be transcribed afterwards. */
      + (mtgCan('mtg.record')
          ? item({ fn: 'mtgMoreDo(\'transcript\')', icon: IC.script, on: mtgTxState === 'listening',
                   lbl: 'Live transcript', tag: mtgTxState === 'listening' ? 'ON' : '' })
            + item({ fn: 'mtgMoreDo(\'record\')', icon: IC.rec, on: recording,
                     lbl: recording ? 'Stop recording' : 'Record video and audio',
                     tag: recording ? 'REC' : '', tagCls: 'rec' })
          : '')
      + '<div class="mtg-menu-sep"></div>'
      + item({ fn: 'mtgMoreDo(\'background\')', icon: IC.blur, on: mtgBg !== 'none',
               lbl: mtgBg !== 'none' ? 'Background · on' : 'Change background' })
      + item({ fn: 'mtgMoreDo(\'devices\')', icon: IC.gear, lbl: 'Camera, mic and speaker' });
  }

  window.mtgMoreDo = function (what) {
    window.mtgCloseMore();
    if (what === 'people') {
      // Chat first if there is something unread; otherwise whichever pane was
      // last open, un-collapsed by mtgSetPane on its way through.
      return window.mtgSetPane(mtgChat.length > mtgChatSeen ? 'chat' : mtgSidePane);
    }
    if (what === 'hand') return window.mtgToggleHand();
    if (what === 'checkin') return window.mtgConfirmPresent();
    if (what === 'ready') return window.mtgMarkReady();
    if (what === 'float') return window.mtgToggleMini();
    if (what === 'transcript') return window.mtgOpenTranscript();
    if (what === 'record') return window.mtgToggleRecord();
    if (what === 'background') return window.mtgToggleBgPanel();
    if (what === 'devices') return window.mtgToggleDevices();
  };

  function mtgRenderCall() {
    if (!mtgActive) return;
    var el = mtgOverlay();
    if (!el) {
      el = document.createElement('div');
      el.id = 'mtgCallOverlay';
      document.body.appendChild(el);
    }
    el.className = mtgOverlayClass();
    var tiles = mtgTiles();
    var sharing = !!(mtgCall && mtgCall.isScreenSharingOn);
    // Column count follows the head count; CSS clamps it further on narrow
    // screens. A fixed grid left dead space at two people and unreadable
    // slivers at eight.
    var screen = mtgScreenShare();
    var tileHtml = function (t) {
      var rk = mtgRoomKey(t);
      var label = mtgLabel(rk, t.name);
      return '<div class="mtg-tile' + (mtgHandUp(rk) ? ' handup' : '') + '">'
        + '<div class="mtg-tile-video" id="mtgV_' + esc(t.key) + '"></div>'
        + (t.video ? '' : '<div class="mtg-tile-avatar">' + esc(mtgInitials(label).toUpperCase()) + '</div>')
        + (mtgHandUp(rk) ? '<div class="mtg-tile-hand" title="Hand raised">' + IC.hand + '</div>' : '')
        + '<div class="mtg-tile-bar">'
          + '<span class="mtg-tile-name">' + esc(label) + '</span>'
          + (t.muted ? '<span class="mtg-tile-mic">' + IC.micOff + '</span>' : '')
        + '</div></div>';
    };

    /* One control-bar button. Collapsing the hand-written <button> strings
       into this is what makes it cheap to give every one of them a visible
       label - and it keeps the label, the aria-label and the tooltip from
       drifting apart, which they already had. */
    const ICON_DOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/>'
      + '<rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>';
    const ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3'
      + 'M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

    const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/>'
      + '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

    /* One chevron, rotated by CSS depending on which way the panel will go
       so the glyph can never disagree with the state it is describing. */
    const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"'
      + ' stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

    /* `busy` disables the button and spins it for as long as its action is in
       flight. Left live, a slow camera or a screen-share picker collected
       three more clicks that all raced each other. */
    const rbtn = o =>
      '<button class="mtg-rbtn' + (o.on ? ' on' : '') + (o.busy ? ' busy' : '') + (o.cls ? ' ' + o.cls : '') + '"'
      + (o.id ? ' id="' + o.id + '"' : '')
      + ' data-onclick="' + o.fn + '"' + (o.busy ? ' disabled' : '')
      + ' data-lbl="' + esc(o.busy ? 'Working…' : o.lbl) + '"'
      + ' aria-label="' + esc(o.lbl) + '" title="' + esc(o.lbl) + '"'
      + (o.busy ? ' aria-busy="true"' : '')
      + (o.on == null ? '' : ' aria-pressed="' + (o.on ? 'true' : 'false') + '"')
      + '>' + o.icon + '</button>';

    let __html;
    try {
      __html = '<div class="mtg-call-inner">'
      + '<div class="mtg-stage">'
        /* Elapsed time reads before the name - "12:04 | Follow-up". How long
           you have been in the room is the thing a clinician glances up for,
           and a number pinned to the far corner is not where the eye lands.
           The wall clock keeps the right-hand slot it used to sit in. */
        + '<div class="mtg-stage-head" data-onpointerdown="mtgDockDragStart(event)">'
        + '<div class="mtg-stage-id">'
          + '<span class="mtg-stage-timer" id="mtgTimer">00:00</span>'
          + '<span class="mtg-stage-div"></span>'
          + '<span class="mtg-stage-name">' + esc(mtgActive.title) + '</span>'
        + '</div>'
        /* The badge doubles as the stop control - and now that recording lives
           in the ⋮ menu it is the only stop control on screen. */
        + (mtgRecState.active
            ? '<button class="mtg-rec-dot" data-onclick="mtgToggleRecord()" title="Stop recording">REC'
              + '<span class="mtg-rec-stop">' + (mtgRecState.busy ? 'Stopping…' : 'Stop') + '</span></button>'
            : '')
        + (!mtgCan('mtg.checkin') ? ''
            : mtgPatientChecked
            ? '<span class="mtg-checkin-btn is-done" title="Patient confirmed present">' + IC.checkin + 'Patient Checked In</span>'
            : '<button class="mtg-checkin-btn" data-onclick="mtgConfirmPresent()"'
              + ' title="Confirm the patient is actually here, on camera">'
              + IC.checkin + 'Confirm Patient Present'
            + '</button>')
        /* Sits beside check-in because it is the next step in the same
           handover, and reads as the more emphatic of the two - it is the one
           that actually summons a clinician. */
        + (!mtgCan('mtg.checkin') ? ''
            : mtgReadyForProvider
            ? '<span class="mtg-ready-btn is-done" title="The provider has been told this room is ready">'
              + IC.checkin + 'Ready for Provider</span>'
            : '<button class="mtg-ready-btn" data-onclick="mtgMarkReady()"'
              + ' title="Tell the provider this room is prepped and they can come in">'
              + IC.checkin + 'Ready for Provider'
            + '</button>')
        + '<span class="mtg-stage-clock" id="mtgWallClock">' + mtgWallClock() + '</span>'
        /* Dock / restore. Sits in the header where minimise lives in every
           other application, rather than as another circle in the bar. */
        + '<button class="mtg-dock-btn" data-onclick="mtgToggleDock()"'
          + ' aria-label="' + (mtgDocked ? 'Back to full screen' : 'Use the portal while staying in this meeting') + '"'
          + ' title="' + (mtgDocked ? 'Back to full screen' : 'Use the portal while staying in this meeting') + '">'
          + (mtgDocked ? ICON_EXPAND : ICON_DOCK)
        + '</button></div>'
        + (screen
            ? '<div class="mtg-present">'
                + '<div class="mtg-present-main">'
                  + '<div class="mtg-tile-video" id="mtgV_' + esc(screen.key) + '"></div>'
                  + '<div class="mtg-tile-bar"><span class="mtg-tile-name">'
                  + esc(screen.name) + (screen.isSelf ? ' — you are presenting' : ' is presenting') + '</span>'
                  + '<span class="mtg-present-bar-btns">'
                    + '<button class="mtg-popout" data-onclick="mtgFullscreenShare()">Fullscreen</button>'
                    + '<button class="mtg-popout" data-onclick="mtgPopOutShare(\'' + esc(screen.key) + '\')">'
                    + (mtgShareWin && !mtgShareWin.closed ? 'In separate window' : 'Open in new window') + '</button>'
                  + '</span></div>'
                + '</div>'
                + '<div class="mtg-present-strip">' + tiles.map(tileHtml).join('') + '</div>'
              + '</div>'
            : '<div class="mtg-grid" id="mtgGrid">' + tiles.map(tileHtml).join('') + '</div>')
        + '<div class="mtg-cc" id="mtgCC" aria-live="polite" data-cs="'+__cs+'display:none"></div>'
        + '<div class="mtg-rail" role="toolbar" aria-label="Meeting controls">'
          + rbtn({ fn: 'mtgToggleMute()', cls: 'mtg-rbtn-primary' + (mtgMuted ? ' off' : ''),
                   icon: mtgMuted ? IC.micOff : IC.mic, busy: mtgBusy.mic,
                   lbl: mtgMuted ? 'Unmute yourself' : 'Mute yourself' })
          + rbtn({ fn: 'mtgToggleVideo()', cls: 'mtg-rbtn-primary' + (mtgVideoOn ? '' : ' off'),
                   icon: mtgVideoOn ? IC.cam : IC.camOff, busy: mtgBusy.video,
                   lbl: mtgVideoOn ? 'Turn camera off' : 'Turn camera on' })
          + rbtn({ fn: 'mtgToggleShare()', lbl: sharing ? 'Stop sharing' : 'Share screen', icon: IC.screen,
                   on: sharing, busy: mtgBusy.share, cls: 'mtg-rbtn-share' })
          /* Everything the bar no longer shows is one click inside here. The
             dot is the only way an unread message, a running recording or a
             raised hand can still announce itself from a collapsed menu. */
          + rbtn({ fn: 'mtgToggleMore(event)', id: 'mtgMoreBtn', cls: 'mtg-rbtn-more',
                   icon: IC.more + (mtgMoreAlert() ? '<i class="mtg-rbtn-dot"></i>' : ''),
                   lbl: 'More options' })
          + rbtn({ fn: 'mtgConfirmLeave()', cls: 'mtg-hang', icon: IC.hang,
                   lbl: 'Leave — everyone else stays' })
        + '</div>'
        + '<div class="mtg-menu" id="mtgMoreMenu" role="menu" aria-label="More options"></div>'
        + '<div class="mtg-bg-panel" id="mtgBgPanel"></div>'
        + '<div class="mtg-bg-panel mtg-dev-panel" id="mtgDevPanel"></div>'
      + '</div>'
      + '<button class="mtg-side-grip' + (mtgSideHidden ? ' collapsed' : '') + '"'
        + ' data-onclick="mtgTogglePanel()" aria-controls="mtgSide"'
        + ' aria-expanded="' + (mtgSideHidden ? 'false' : 'true') + '"'
        + ' data-lbl="' + (mtgSideHidden ? 'Show people &amp; chat' : 'Hide panel') + '"'
        + ' aria-label="' + (mtgSideHidden ? 'Show people and chat' : 'Hide people and chat') + '"'
        + ' title="' + (mtgSideHidden ? 'Show people and chat' : 'Hide people and chat') + '">'
        + ICON_CHEVRON
        /* Unread chat has to survive the panel being shut, or closing it is a
           way to silently miss a patient's message. */
        + (mtgSideHidden && mtgChat.length > mtgChatSeen
            ? '<i class="mtg-side-grip-dot">' + (mtgChat.length - mtgChatSeen) + '</i>' : '')
      + '</button>'
      + '<aside class="mtg-side' + (mtgSideHidden ? ' hidden' : '') + '" id="mtgSide">'
        + '<div class="mtg-side-tabs">'
          + '<button class="mtg-side-tab' + (mtgSidePane === 'people' ? ' active' : '') + '" data-onclick="mtgSetPane(\'people\')">People<span>' + tiles.length + '</span></button>'
          + '<button class="mtg-side-tab' + (mtgSidePane === 'chat' ? ' active' : '') + '" data-onclick="mtgSetPane(\'chat\')">Chat'
            + (mtgChat.length > mtgChatSeen ? '<span class="mtg-side-dot">' + (mtgChat.length - mtgChatSeen) + '</span>' : '')
          + '</button>'
          + '<button class="mtg-side-tab' + (mtgSidePane === 'transcript' ? ' active' : '') + '" data-onclick="mtgSetPane(\'transcript\')">Transcript'
            /* Green dot for my own live capture; amber when somebody ELSE is
               transcribing - so a colleague who joins a running session can
               see it without opening the tab. */
            + (mtgTxState === 'listening' ? '<span class="mtg-side-live"></span>'
               : (mtgTx.length ? '<span class="mtg-side-live other"></span>' : ''))
          + '</button>'
        + '</div>'
        + (mtgSidePane === 'transcript'
            ? mtgTxHtml()
            : mtgSidePane === 'chat'
            ? mtgChatHtml()
            : '<div class="mtg-side-list">'
                + (!mtgCan('mtg.invite') ? '' : '<button class="mtg-invite" data-onclick="mtgInviteFromCall()">'
                  + ICON_LINK + 'Copy guest link</button>')
                /* Everyone in the room who arrived through the link, listed apart from
                   staff. They are the only people who can be removed, and who from outside
                   the practice is in a clinical room is worth reading off at a glance. */
                + (mtgGuests.length
                    ? '<div class="mtg-side-head mtg-guest-head">Joined by link<span>'
                        + mtgGuests.length + '</span></div>'
                      + mtgGuests.map(mtgGuestRowHtml).join('')
                    : '')
                + (tiles.length > 1
                    ? '<button class="btn btn-ghost btn-sm mtg-mute-all" data-onclick="mtgMuteEveryone()">Mute everyone</button>'
                    : '')
                + tiles.map(function (t) {
                    var rk = mtgRoomKey(t);
                    var label = mtgLabel(rk, t.name);
                    return '<div class="mtg-side-row"><span class="im-call-avatar tiny">'
                      + esc(mtgInitials(label).toUpperCase()) + '</span><span class="mtg-side-name">'
                      + esc(label) + '</span>'
                      + (mtgHandUp(rk) ? '<span class="mtg-side-hand" title="Hand raised">' + IC.hand + '</span>' : '')
                      + (t.muted ? '<span class="mtg-side-mic">' + IC.micOff + '</span>' : '')
                      + '<button class="mtg-side-mute" title="Rename"'
                        + ' data-onclick="mtgRenameParticipant(\'' + esc(rk) + '\',\'' + esc(label).replace(/'/g, '&#39;') + '\')">'
                        + IC.pencil + '</button>'
                      /* Muting someone else is a host action and one-way: the
                         SDK offers no un-mute for another person,
                         so the button disappears once they are muted rather
                         than pretending to toggle. */
                      + (!t.isSelf && !t.muted
                          ? '<button class="mtg-side-mute" title="Mute ' + esc(label) + ' for everyone"'
                            + ' data-onclick="mtgMuteParticipant(\'' + esc(t.key) + '\')">' + IC.mic + '</button>'
                          : '')
                      + '</div>';
                  }).join('')
              + '</div>')
        /* The waiting list sits outside the tab switch. It used to be
           inside the People branch, so a host who was reading chat never saw
           anyone knocking and left patients sitting in the lobby. */
        + (mtgLobby.length
            ? '<div class="mtg-side-head">Waiting<span>' + mtgLobby.length + '</span></div>'
              + mtgLobby.map(mtgLobbyRowHtml).join('')
            : '')
        /* Footer. These two were identical ghost buttons, which put a
           developer troubleshooting tool at exactly the same visual weight as
           the control that closes the appointment for the patient. Now the
           destructive one looks destructive and Diagnostics recedes. */
        + '<div class="mtg-side-foot">'
          + (mtgCan('mtg.endAll') ? '<button class="mtg-danger-btn" data-onclick="mtgEndForAll()">End meeting for everyone</button>' : '')
          + '<button class="mtg-quiet-btn" data-onclick="mtgDiagnostics()">Diagnostics</button>'
        + '</div>'
      + '</aside></div>';
    } catch (renderErr) {
      console.error('meeting render failed', renderErr);
      window.__mtgLastRenderError = String((renderErr && renderErr.message) || renderErr);
      toast('Something went wrong drawing the meeting — the call is still connected.', 'err');
      return;
    }
    el.innerHTML = __html;

    mtgScheduleHandExpiry();

    /* Size the tiles for the stage that now exists. This must run after the
       markup is in the DOM - before it there are no children to measure, and
       without it the tiles keep whatever size the previous render left them at
       until something happens to fire a window resize. */
    /* mtgQ, not document.getElementById: while the meeting is floating the
       grid is in the Picture-in-Picture document, so this found nothing and
       the tiles kept whatever size the last fit in the main window had given
       them - stale from the moment anyone joined or left. */
    var __grid = mtgQ('mtgGrid');
    window.mtgFitGrid(__grid);
    window.mtgObserveGrid(__grid);

    if (mtgSidePane === 'chat') {
      const ci = mtgQ('mtgChatInput');
      if (ci && mtgChatDraft && ci.value !== mtgChatDraft) ci.value = mtgChatDraft;
      mtgChatToBottom();
    }
    mtgRenderBgPanel();
    mtgRenderMore();
    mtgAttachTiles(screen ? tiles.concat([{ key: screen.key, video: true, stream: screen.stream }]) : tiles);
    // The render just replaced every tile, so the speaking marks went with
    // them. Repaint from state rather than waiting for the next time somebody
    // happens to start or stop talking.
    mtgPaintSpeaking();
    mtgCCPaint();
  }
  window.mtgToggleDock = function () {
    if (!mtgActive) return;
    mtgDocked = !mtgDocked;
    var el = mtgOverlay();
    if (el) { el.className = mtgOverlayClass(); mtgApplyDockPos(el); }
    document.body.classList.toggle('mtg-docked', mtgDocked);
    mtgRenderCall();          // swaps the button glyph and its label
    var refit = function () {
      var g = document.getElementById('mtgGrid');
      if (g && window.mtgFitGrid) window.mtgFitGrid(g);
    };
    refit();
    setTimeout(refit, 260);   // after the width/height transition settles
    if (mtgDocked) {
      toast('Meeting docked — the portal is yours. Share your screen if you want everyone to follow along.', 'ok');
    }
  };

  var mtgDragState = null;
  var mtgDockPos = null;      // {left, top} once the card has been moved

  window.mtgDockDragStart = function (ev) {
    if (!mtgDocked) return;
    // Buttons in the header keep working - only bare header space drags.
    if (ev.target && ev.target.closest && ev.target.closest('button')) return;
    var el = mtgOverlay();
    if (!el) return;
    var r = el.getBoundingClientRect();
    mtgDragState = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, w: r.width, h: r.height };
    el.classList.add('dragging');
    ev.preventDefault();
    window.addEventListener('pointermove', mtgDockDragMove);
    window.addEventListener('pointerup', mtgDockDragEnd, { once: true });
    window.addEventListener('pointercancel', mtgDockDragEnd, { once: true });
  };

  function mtgDockDragMove(ev) {
    if (!mtgDragState) return;
    var el = mtgOverlay();
    if (!el) return;
    // Clamped so the card can never be dragged off-screen and stranded.
    var x = Math.min(Math.max(0, ev.clientX - mtgDragState.dx), window.innerWidth - mtgDragState.w);
    var y = Math.min(Math.max(0, ev.clientY - mtgDragState.dy), window.innerHeight - mtgDragState.h);
    mtgDockPos = { left: x, top: y };
    mtgApplyDockPos(el);
  }

  function mtgDockDragEnd() {
    mtgDragState = null;
    window.removeEventListener('pointermove', mtgDockDragMove);
    var el = mtgOverlay();
    if (el) el.classList.remove('dragging');
  }

  function mtgApplyDockPos(el) {
    if (!el) return;
    if (mtgDocked && mtgDockPos) {
      el.style.left = mtgDockPos.left + 'px';
      el.style.top = mtgDockPos.top + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      // Full screen is driven entirely by the stylesheet; leftover inline
      // offsets from a drag would pin the restored call to a corner.
      el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    }
  }

  window.mtgMiniOpen = function () { return !!(mtgMiniWin && !mtgMiniWin.closed); };

  var mtgAutoFloated = false;

  function mtgArmAutoFloat() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setActionHandler) return;
    try {
      // Chrome will not offer the action without metadata to attach it to.
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: (mtgActive && mtgActive.title) || 'Meeting',
        artist: 'Concussion Therapy Group'
      });
    } catch (e) { /* metadata is a nicety */ }
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', function () {
        if (!mtgActive || window.mtgMiniOpen()) return;
        mtgAutoFloated = true;
        window.mtgToggleMini();
      });
    } catch (e) {
      /* Older Chrome does not know this action. Nothing to arm, and nothing
         worth telling the user about - "Float over other apps" in the ⋮ menu
         still works. */
    }
  }

  function mtgDisarmAutoFloat() {
    try { navigator.mediaSession.setActionHandler('enterpictureinpicture', null); } catch (e) {}
    try { navigator.mediaSession.metadata = null; } catch (e) {}
    mtgAutoFloated = false;
  }

  /* Coming back to the portal puts the meeting back inline - but only if it
     floated by itself. A window you opened stays where you put it. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (mtgAutoFloated && window.mtgMiniOpen()) {
      mtgAutoFloated = false;
      try { mtgMiniWin.close(); } catch (e) {}
    }
  });

  window.mtgToggleMini = async function () {
    if (window.mtgMiniOpen()) { try { mtgMiniWin.close(); } catch (e) {} return; }
    if (!window.documentPictureInPicture) {
      // Better than refusing: float the video, which is all these browsers can do.
      toast('This browser cannot float the whole meeting — floating the video instead.', 'ok');
      return window.mtgTogglePip();
    }
    var el = mtgOverlay();
    if (!el) return;
    try {
      var pip = await window.documentPictureInPicture.requestWindow({ width: 400, height: 300 });
      mtgMiniWin = pip;

      /* The mini window is a blank document: it inherits no styles at all.
         Linking the same stylesheet is safer than copying cssRules, which
         throws on any sheet the browser considers cross-origin. */
      Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"], style'), function (node) {
        pip.document.head.appendChild(node.cloneNode(true));
      });
      pip.document.documentElement.setAttribute('data-theme',
        document.documentElement.getAttribute('data-theme') || '');
      pip.document.body.className = 'mtg-mini-body';

      /* Inline onclick handlers inside the moved markup resolve against the
         MINI window's globals, not this one. Without this every control in the
         floating window is a no-op that throws. */
      Object.keys(window).forEach(function (k) {
        if (/^(mtg|ctg)/.test(k) && typeof window[k] === 'function') {
          try { pip[k] = window[k]; } catch (e) {}
        }
      });
      pip.showToast = window.showToast;
      pip.showPage = window.showPage;

      pip.document.body.appendChild(el);      // the move
      mtgOverlayEl = el;
      el.className = mtgOverlayClass();       // mtgMiniWin is set, so: mini
      el.style.left = el.style.top = el.style.right = el.style.bottom = '';

      /* Closing the window - by its own X, or by the browser - has to put the
         meeting back. Otherwise the call is still connected with its entire UI
         inside a document that no longer exists. */
      pip.addEventListener('pagehide', function () {
        mtgMiniWin = null;
        if (el && mtgActive) {
          document.body.appendChild(el);
          mtgOverlayEl = el;
          el.className = mtgOverlayClass();
          mtgApplyDockPos(el);
          mtgRenderCall();
          var g = document.getElementById('mtgGrid');
          if (g && window.mtgFitGrid) window.mtgFitGrid(g);
        } else if (el) { el.remove(); }
        document.body.classList.remove('mtg-mini');
      });

      document.body.classList.add('mtg-mini');
      mtgRenderCall();
      setTimeout(function () {
        var g = pip.document.getElementById('mtgGrid');
        if (g && window.mtgFitGrid) window.mtgFitGrid(g);
      }, 200);
      toast('Meeting floating — it stays on top of other apps. Close it to bring the meeting back.', 'ok');
    } catch (e) {
      mtgMiniWin = null;
      toast('Could not open the floating window: ' + ((e && e.message) || 'unknown'), 'err');
    }
  };

  window.mtgTogglePanel = function () {
    mtgSideHidden = !mtgSideHidden;
    mtgRenderCall();
  };

  /* Mounts each stream into its own tile. Views are cached because a re-render
     must not tear down a live renderer, and moving a <video> between parents
     pauses it in Chromium, where a paused video paints black. */
  async function mtgAttachTiles(tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var box = document.getElementById('mtgV_' + t.key);
      if (!box || !t.video) continue;
      // Leave it alone while it is displayed in the pop-out window.
      if (mtgShareWin && !mtgShareWin.closed && ('mtgV_' + t.key) === mtgShareHomeId) continue;
      try {
        if (t.isSelf && t.key === 'self') {
          if (!mtgLocalView) {
            mtgLocalRenderer = new window.__mtgVSR(mtgLocalStream);
            mtgLocalView = await mtgLocalRenderer.createView({ scalingMode: 'Crop' });
          }
          // Clear first: a disposed renderer leaves its old <video> behind, and
          // a dead element painting black sits on top of the live one.
          box.innerHTML = '';
          box.appendChild(mtgLocalView.target);
        } else {
          var cached = mtgRemoteViews[t.key];
          if (cached && cached.stream !== t.stream) {
            try { cached.renderer.dispose(); } catch (e) {}
            delete mtgRemoteViews[t.key];
            cached = null;
          }
          if (!cached) {
            var rr = new window.__mtgVSR(t.stream);
            mtgRemoteViews[t.key] = {
              renderer: rr,
              view: await rr.createView({ scalingMode: 'Crop' }),
              stream: t.stream
            };
          }
          box.innerHTML = '';
          box.appendChild(mtgRemoteViews[t.key].view.target);
        }
      } catch (e) { /* stream ended between render and mount */ }
    }
    document.querySelectorAll('.mtg-call video').forEach(function (v) {
      v.autoplay = true; v.playsInline = true; v.muted = true;
      if (v.paused) { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
    });
  }


  /* ---------------- recordings list ---------------- */

  function mtgFmtDur(ms) {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }
  function mtgFmtSize(b) {
    if (!b) return '';
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  }

  async function mtgLoadRecordings() {
    // The badge needs to know whether transcription is configured at all.
    try { await mtgRecCapabilities(); } catch (e) { /* badge just stays quiet */ }
    const card = document.getElementById('mtgRecCard');
    const box = document.getElementById('mtgRecList');
    if (!box) return;
    let all = [];
    try { all = (await window.ctgApiFetch('/api/meetings/recordings/all')).recordings || []; }
    catch (e) { if (card) card.style.display = 'none'; mtgRenderTranscripts([]); return; }
    mtgRenderTranscripts(all.filter(function (r) { return r.kind === 'liveTranscript'; }));
    const list = all.filter(function (r) { return r.kind !== 'liveTranscript'; });
    if (!list.length) { if (card) card.style.display = 'none'; return; }
    if (card) card.style.display = '';
    const head = document.getElementById('mtgRecHead');
    if (head) head.innerHTML = '<button class="btn btn-ghost btn-sm" data-onclick="mtgCheckStorage(this)">Check storage</button>';
    box.innerHTML = list.map(function (r) {
      /* A recording stuck in 'processing' long after it ended is almost always
         the Event Grid subscription missing: ACS finished the file and tried to
         hand it back, and nothing was listening. */
      const stuck = r.status === 'processing' && r.endedAt
        && (Date.now() - new Date(r.endedAt).getTime()) > 15 * 60 * 1000;
      const stateLabel = r.status === 'ready' ? 'Ready'
        : r.status === 'processing' ? (stuck ? 'Not delivered' : 'Processing\u2026')
        : r.status === 'recording' ? 'Recording now'
        : r.status === 'failed' ? 'Failed' : r.status;
      const tState = r.transcriptStatus === 'ready' ? 'Transcript ready'
        : r.transcriptStatus === 'pending' ? 'Transcribing\u2026'
        : r.transcriptStatus === 'failed' ? 'Transcript failed'
        : (r.status === 'ready' && mtgRecCaps && !mtgRecCaps.transcription)
            ? 'No transcript — Speech not set up'
        : '';
      return '<div class="mtg-rec-row" id="mtgRec_' + esc(r.id) + '">'
        + '<div class="mtg-rec-main">'
          + '<div class="mtg-rec-title">' + esc(r.meetingTitle || 'Meeting')
            + '<span class="mtg-rec-badge ' + esc(r.status) + '">' + esc(stateLabel) + '</span>'
            + (tState ? '<span class="mtg-rec-badge t' + esc(r.transcriptStatus) + '">' + esc(tState) + '</span>' : '')
          + '</div>'
          + '<div class="mtg-rec-sub">' + esc(new Date(r.startedAt).toLocaleString())
            + (r.durationMs ? ' \u00b7 ' + mtgFmtDur(r.durationMs) : '')
            + (r.sizeBytes ? ' \u00b7 ' + mtgFmtSize(r.sizeBytes) : '')
            + ' \u00b7 ' + (r.kind === 'liveTranscript' ? 'Live transcript' : r.kind === 'audio' ? 'Audio' : 'Audio + video')
            + (r.consent && r.consent.parties ? ' \u00b7 consent from ' + r.consent.parties.length + ' ' + (r.consent.parties.length === 1 ? 'person' : 'people') : '')
            + (r.error ? ' \u00b7 ' + esc(r.error) : '')
          + '</div>'
          + (r.transcriptStatus === 'failed' && r.transcriptError
              ? '<div class="mtg-rec-warn"><strong>Transcript failed.</strong> ' + esc(r.transcriptError) + '</div>'
              : '')
          + (stuck ? '<div class="mtg-rec-warn">This one has not turned up yet. Press '
              + '<strong>Check storage</strong> above \u2014 recordings are written straight into your own '
              + 'container, so they can be found without waiting for a notification from Azure. If it stays '
              + 'missing, the Communication Services resource still needs <strong>Storage Blob Data '
              + 'Contributor</strong> on that storage account.</div>' : '')
        + '</div>'
        + '<div class="mtg-rec-actions">'
          + (r.hasMedia ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgPlayRecording(\'' + esc(r.id) + '\')">Play</button>' : '')
          + (r.hasMedia ? '<a class="btn btn-ghost btn-sm" href="/api/meetings/recordings/'
              + encodeURIComponent(r.id) + '/media?download=1" download>Download</a>' : '')
          + ((r.hasMedia || r.transcriptStatus === 'ready') && mtgCan('mtg.record')
              ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgShareRecording(\'' + esc(r.id) + '\',true)">Share</button>' : '')
          + (r.transcriptStatus === 'ready' ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgShowTranscript(\'' + esc(r.id) + '\')">Transcript</button>' : '')
          + (r.hasMedia && r.transcriptStatus !== 'ready' && r.transcriptStatus !== 'pending'
              ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgTranscribe(\'' + esc(r.id) + '\')">Transcribe</button>' : '')
          + (mtgCan('mtg.record') ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgDeleteRecording(\'' + esc(r.id) + '\')">Delete</button>' : '')
        + '</div>'
        + '<div class="mtg-rec-open" id="mtgRecOpen_' + esc(r.id) + '"></div>'
      + '</div>';
    }).join('');
  }
  window.mtgLoadRecordings = mtgLoadRecordings;

  /* The Live Transcripts card: the same rows mtgLoadRecordings filtered out,
     rendered with a template built for having no media rather than reusing the
     video row with half its buttons hidden. Download links straight to
     /transcript.txt, a real file rather than the inline JSON viewer. */
  function mtgRenderTranscripts(list) {
    const card = document.getElementById('mtgTxCard');
    const box = document.getElementById('mtgTxList');
    if (!box) return;
    /* Always shown, unlike the Recordings card below. An empty Recordings card
       hiding itself is fine, since a practice may never turn recording on, but a
       live transcript is meant to run every visit, so 'the card is not here' and
       'nothing has happened yet' have to look different. */
    if (card) card.style.display = '';
    if (!list.length) {
      box.innerHTML = '<div class="pld-empty-state">No live transcripts saved yet. One appears here '
        + 'automatically once a meeting with Live Transcript running ends and someone leaves the room.</div>';
      return;
    }
    box.innerHTML = list.map(function (r) {
      return '<div class="mtg-rec-row" id="mtgRec_' + esc(r.id) + '">'
        + '<div class="mtg-rec-main">'
          + '<div class="mtg-rec-title">' + esc(r.meetingTitle || 'Meeting')
            + '<span class="mtg-rec-badge ready">Ready</span>'
          + '</div>'
          + '<div class="mtg-rec-sub">' + esc(new Date(r.startedAt).toLocaleString())
            + (r.durationMs ? ' · ' + mtgFmtDur(r.durationMs) : '')
          + '</div>'
        + '</div>'
        + '<div class="mtg-rec-actions">'
          + '<button class="btn btn-ghost btn-sm" data-onclick="mtgShowTranscript(\'' + esc(r.id) + '\')">Transcript</button>'
          + '<a class="btn btn-ghost btn-sm" href="/api/meetings/recordings/' + encodeURIComponent(r.id) + '/transcript.txt" download>Download</a>'
          + (mtgCan('mtg.record') ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgShareRecording(\'' + esc(r.id) + '\',false)">Share</button>' : '')
          + (mtgCan('mtg.record') ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgDeleteRecording(\'' + esc(r.id) + '\')">Delete</button>' : '')
        + '</div>'
        + '<div class="mtg-rec-open" id="mtgRecOpen_' + esc(r.id) + '"></div>'
      + '</div>';
    }).join('');
  }

  /* Ask the server to look in the storage container now, rather than waiting
     for Azure to send a notification that may never come. */
  window.mtgCheckStorage = async function (btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    try {
      const r = await window.ctgApiFetch('/api/meetings/recordings/check', { method: 'POST' });
      toast(r.found
        ? (r.found + ' recording' + (r.found === 1 ? '' : 's') + ' found and ready')
        : 'Nothing new in storage yet — Azure may still be rendering the file.',
        r.found ? 'ok' : 'err');
      mtgLoadRecordings();
    } catch (e) {
      toast((e && e.message) || 'Could not check storage.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Check storage'; }
    }
  };


  window.mtgShareRecording = async function (id, hasMedia) {
    const el = document.getElementById('mtgShareModal') || (function () {
      const d = document.createElement('div'); d.id = 'mtgShareModal'; document.body.appendChild(d); return d;
    })();
    el.className = 'mtg-modal show';
    el.dataset.hasMedia = hasMedia ? '1' : '';
    /* A row with no video (a live transcript) has nothing for "Video only" or
       "Video and transcript" to include, so those choices are not offered at
       all rather than shown and silently doing nothing useful. */
    const whatField = hasMedia
      ? ('<div class="mtg-f-label">What the link includes</div>'
          + '<select id="mtgShareWhat">'
            + '<option value="both">Video and transcript</option>'
            + '<option value="transcript">Transcript only \u2014 smaller disclosure</option>'
            + '<option value="media">Video only</option>'
          + '</select>')
      : ('<div class="mtg-f-label">What the link includes</div>'
          + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:10px">Transcript only \u2014 there is no video for this entry.</div>');
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">Share this ' + (hasMedia ? 'recording' : 'transcript') + '</div>'
      + '<div class="mtg-rec-law">'
        + '<strong>This is protected health information.</strong> Anyone with the link can open it '
        + 'without signing in, so send it only to someone entitled to see this patient\u2019s record, '
        + 'and only by an approved method. Every view is logged, and you can revoke the link at any time.'
      + '</div>'
      + whatField
      + '<div class="mtg-f-label">Expires after</div>'
      + '<select id="mtgShareDays">'
        + '<option value="1">1 day</option>'
        + '<option value="7" selected>7 days</option>'
        + '<option value="14">14 days</option>'
        + '<option value="30">30 days (maximum)</option>'
      + '</select>'
      + '<div class="mtg-f-label">Label (optional \u2014 who it is for)</div>'
      + '<input type="text" id="mtgShareLabel" maxlength="120" placeholder="e.g. Atty. Cruz, case review">'
      + '<div class="mtg-f-err" id="mtgShareErr"></div>'
      + '<div id="mtgShareOut"></div>'
      + '<div class="mtg-modal-actions">'
        + '<button class="btn btn-ghost" data-onclick="mtgCloseShare()">Close</button>'
        + '<button class="btn btn-primary" id="mtgShareGo" data-onclick="mtgCreateShare(\'' + esc(id) + '\')">Create link</button>'
      + '</div></div>';
    mtgLoadShares(id);
  };

  window.mtgCloseShare = function () {
    const e = document.getElementById('mtgShareModal');
    if (e) { e.className = 'mtg-modal'; e.innerHTML = ''; }
  };

  window.mtgCreateShare = async function (id) {
    const modal = document.getElementById('mtgShareModal');
    const hasMedia = !!(modal && modal.dataset.hasMedia);
    const what = hasMedia ? ((document.getElementById('mtgShareWhat') || {}).value || 'both') : 'transcript';
    const days = parseInt((document.getElementById('mtgShareDays') || {}).value, 10) || 7;
    const label = (document.getElementById('mtgShareLabel') || {}).value || '';
    const btn = document.getElementById('mtgShareGo');
    const err = document.getElementById('mtgShareErr');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating\u2026'; }
    if (err) err.textContent = '';
    try {
      const res = await window.ctgApiFetch('/api/meetings/recordings/' + encodeURIComponent(id) + '/share', {
        method: 'POST',
        body: JSON.stringify({
          days: days, label: label,
          includeMedia: what !== 'transcript',
          includeTranscript: what !== 'media'
        })
      });
      const url = location.origin + location.pathname + '#rec=' + encodeURIComponent(res.token);
      const out = document.getElementById('mtgShareOut');
      if (out) {
        /* Shown once and copied on sight: only the hash is stored, so this
           exact string cannot be shown again later. */
        out.innerHTML = '<div class="mtg-share-out"><div class="mtg-share-lead">'
          + 'Link created \u2014 copy it now, it cannot be shown again.</div>'
          + '<input type="text" id="mtgShareUrl" readonly value="' + esc(url) + '">'
          + '<button class="btn btn-primary btn-sm" data-onclick="mtgCopyShare()">Copy link</button></div>';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Create another'; }
      mtgLoadShares(id);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create link'; }
      if (err) err.textContent = (e && e.message) || 'Could not create the link.';
    }
  };

  window.mtgCopyShare = function () {
    const i = document.getElementById('mtgShareUrl');
    if (!i) return;
    i.select();
    navigator.clipboard.writeText(i.value).then(
      function () { toast('Link copied', 'ok'); },
      function () { try { document.execCommand('copy'); } catch (e) {} });
  };

  /* Links already issued, so a host can see what is still reachable and pull
     any of it back. */
  async function mtgLoadShares(id) {
    const out = document.getElementById('mtgShareOut');
    if (!out) return;
    let list = [];
    try { list = (await window.ctgApiFetch('/api/meetings/recordings/' + encodeURIComponent(id) + '/shares')).shares || []; }
    catch (e) { return; }
    if (!list.length) return;
    const rows = list.map(function (sh) {
      const what = sh.includeMedia && sh.includeTranscript ? 'Video + transcript'
        : sh.includeMedia ? 'Video only' : 'Transcript only';
      return '<div class="mtg-share-row' + (sh.active ? '' : ' dead') + '">'
        + '<div><div class="mtg-share-name">' + esc(sh.label || 'Untitled link') + '</div>'
        + '<div class="mtg-share-sub">' + esc(what) + ' \u00b7 '
          + (sh.revokedAt ? 'revoked'
             : sh.active ? ('expires ' + new Date(sh.expiresAt).toLocaleDateString()) : 'expired')
          + ' \u00b7 ' + sh.viewCount + ' view' + (sh.viewCount === 1 ? '' : 's') + '</div></div>'
        + (sh.active ? '<button class="btn btn-ghost btn-sm" data-onclick="mtgRevokeShare(\'' + esc(sh.id)
            + '\',\'' + esc(id) + '\')">Revoke</button>' : '')
        + '</div>';
    }).join('');
    out.insertAdjacentHTML('beforeend',
      '<div class="mtg-share-list"><div class="mtg-f-label">Existing links</div>' + rows + '</div>');
  }

  window.mtgRevokeShare = async function (shareId, recordingId) {
    try {
      await window.ctgApiFetch('/api/meetings/shares/' + encodeURIComponent(shareId) + '/revoke', { method: 'POST' });
      toast('Link revoked \u2014 it stops working immediately', 'ok');
      const out = document.getElementById('mtgShareOut');
      if (out) out.innerHTML = '';
      mtgLoadShares(recordingId);
    } catch (e) { toast((e && e.message) || 'Could not revoke.', 'err'); }
  };

  window.mtgPlayRecording = function (id) {
    const box = document.getElementById('mtgRecOpen_' + id);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    const url = '/api/meetings/recordings/' + encodeURIComponent(id) + '/media';
    const row = document.getElementById('mtgRec_' + id);
    const audioOnly = row && /Audio$/.test((row.querySelector('.mtg-rec-sub') || {}).textContent || '');
    box.innerHTML = audioOnly
      ? '<audio controls preload="none" src="' + url + '" data-cs="'+__cs+'width:100%"></audio>'
      : '<video controls preload="none" src="' + url + '" data-cs="'+__cs+'width:100%;max-height:420px;border-radius:10px;background:#000"></video>';
  };

  window.mtgTranscribe = async function (id) {
    try {
      await window.ctgApiFetch('/api/meetings/recordings/' + encodeURIComponent(id) + '/transcribe', { method: 'POST' });
      toast('Transcribing \u2014 this takes about a minute', 'ok');
      mtgLoadRecordings();
    } catch (e) { toast((e && e.message) || 'Could not transcribe.', 'err'); }
  };

  window.mtgShowTranscript = async function (id) {
    const box = document.getElementById('mtgRecOpen_' + id);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="small-muted">Loading transcript\u2026</div>';
    try {
      const r = await window.ctgApiFetch('/api/meetings/recordings/' + encodeURIComponent(id));
      const t = r.transcript;
      if (!t || !t.phrases || !t.phrases.length) { box.innerHTML = '<div class="small-muted">No speech was recognised in this recording.</div>'; return; }
      const stamp = function (ms) {
        const s = Math.floor(ms / 1000);
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      };
      box.innerHTML = '<div class="mtg-tx">'
        + '<div class="mtg-tx-head">' + t.phrases.length + ' passages \u00b7 '
          + (t.speakers || 1) + ' ' + ((t.speakers || 1) === 1 ? 'speaker' : 'speakers')
          + '<button class="btn btn-ghost btn-sm" data-onclick="mtgCopyTranscript(\'' + esc(id) + '\')">Copy all</button></div>'
        + '<div class="mtg-tx-body" id="mtgTx_' + esc(id) + '">'
        + (function () {
            const idx = {}; let next = 0;
            return t.phrases.map(function (p) {
              const label = p.name || (p.speaker == null ? 'Speaker' : 'Speaker ' + p.speaker);
              if (!(label in idx)) idx[label] = next++;
              const codes = p.tr ? Object.keys(p.tr).filter(function (k) { return p.tr[k]; }).sort() : [];
              const tr = codes.map(function (k) {
                return '<span class="mtg-tx-xlate"><span class="mtg-tx-xlate-k">'
                  + esc(mtgLangLabel(k)) + '</span>' + esc(p.tr[k]) + '</span>';
              }).join('');
              return '<div class="mtg-tx-line"><span class="mtg-tx-at">' + stamp(p.at) + '</span>'
                + '<span class="mtg-tx-sp s' + (idx[label] % 6) + '">' + esc(label) + '</span>'
                + '<span class="mtg-tx-t">' + esc(p.text) + tr + '</span></div>';
            }).join('');
          })()
        + '</div></div>';
      box.dataset.full = t.full || '';
    } catch (e) { box.innerHTML = '<div class="small-muted">Could not load the transcript.</div>'; }
  };

  window.mtgCopyTranscript = function (id) {
    const box = document.getElementById('mtgRecOpen_' + id);
    const text = (box && box.dataset.full) || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () { toast('Transcript copied', 'ok'); },
      function () { toast('Could not copy', 'err'); });
  };

  window.mtgDeleteRecording = async function (id) {
    const ok = await ctgConfirm(
      'Delete this recording and its transcript? This cannot be undone.',
      { title: 'Delete Recording', okLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await window.ctgApiFetch('/api/meetings/recordings/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Recording deleted', 'ok');
      mtgLoadRecordings();
    } catch (e) { toast((e && e.message) || 'Could not delete.', 'err'); }
  };

  window.renderMeetings = function () { mtgLoad(); mtgLoadRecordings(); };
})();

;window.mtgCloseDiag = function () { var el = document.getElementById('mtgDiagBox'); if (el) el.className = 'mtg-diag' }
