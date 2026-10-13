(function () {
  'use strict';

  var m = (location.hash || '').match(/[#&]mtg=([^&]+)/);
  if (!m) return;
  var TOKEN = decodeURIComponent(m[1]);

  var state = { meeting: null, guestId: '', phase: 'loading', error: '', name: '' };
  var call = null, agent = null, deviceMgr = null;
  var localStream = null, localView = null, localRenderer = null, remoteViews = {};
  var muted = false, videoOn = false, poll = null, timer = null, startedAt = 0;
  /* Whether the meeting is being recorded. A guest is entitled to know at all
     times, and in an all-party consent state showing it is not optional. */
  var beingRecorded = false, recPoll = null;
  /* Meeting chat. Guests read and post with their token + guest id - the same
     pair that got them admitted, so a denied guest cannot read the room. */
  var chat = [], chatDraft = '', chatOpen = false, chatSeen = 0, chatPoll = null;
  // Which tab the guest's side panel is showing: 'chat' or 'transcript'.
  var guestPane = 'chat';
  /* Raised hands and host name corrections for the whole room, refreshed on
     the chat poll. `names` maps an ACS user id to the label the host set. */
  var hands = [], names = {};

  /* Hands drop themselves after 15 seconds - the server enforces it, but the
     guest only hears about it on the next poll, so the same rule is applied
     locally or a hand lingers for the remainder of the poll interval. */
  var HAND_TTL_MS = 15000, handTimer = null;

  function freshHands() {
    var cutoff = Date.now() - HAND_TTL_MS;
    return hands.filter(function (h) { return h.at >= cutoff; });
  }
  function myHandUp() {
    var me = state.acsUserId || state.guestId;
    return freshHands().some(function (h) { return h.key === me; });
  }
  function handUp(key) {
    return freshHands().some(function (h) { return h.key === key; });
  }
  function scheduleHandExpiry() {
    clearTimeout(handTimer);
    var fresh = freshHands();
    if (!fresh.length) return;
    var soonest = Math.min.apply(null, fresh.map(function (h) {
      return h.at + HAND_TTL_MS - Date.now();
    }));
    handTimer = setTimeout(function () { render(); }, Math.max(250, soonest + 60));
  }
  /* My own tile is keyed 'self' locally, but the room knows me by my ACS id.
     Shared state must be looked up under that or my own raised hand is stored
     under one key and read back under another, and never shows on my tile. */
  function roomKey(t) { return t && t.isSelf ? (state.acsUserId || state.guestId) : (t && t.key); }
  // A host's correction always wins over what the guest typed on the way in.
  function label(key, fallback) {
    return (key && names[key]) || fallback;
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var grbtn = function (o) {
    return '<button class="mtg-rbtn' + (o.on ? ' on' : '') + (o.busy ? ' busy' : '')
      + (o.cls ? ' ' + o.cls : '') + '"'
      + (o.id ? ' id="' + o.id + '"' : '')
      + ' data-onclick="' + o.fn + '"' + (o.busy ? ' disabled' : '')
      + ' data-lbl="' + esc(o.busy ? 'Working…' : o.lbl) + '"'
      + ' aria-label="' + esc(o.lbl) + '" title="' + esc(o.lbl) + '"'
      + (o.busy ? ' aria-busy="true"' : '')
      + (o.on == null ? '' : ' aria-pressed="' + (o.on ? 'true' : 'false') + '"')
      + '>' + o.icon + '</button>';
  };

  /* Wall clock for the top-right of the stage, so the guest sees the same time
     the clinic does rather than only how long they have been sitting there. */
  var guestWallClock = function () {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  var api = function (path, opts) {
    return fetch('/api/meetings' + path, Object.assign({ credentials: 'omit' }, opts || {}))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  };

  var guestOverlayEl = null;
  function gOverlay() {
    if (guestOverlayEl && guestOverlayEl.isConnected) return guestOverlayEl;
    guestOverlayEl = document.getElementById('mtgGuestView');
    return guestOverlayEl;
  }
  // Same reasoning as mtgQ() on the staff side: an id lookup has to check
  // inside the root wherever it lives before falling back to the main
  // document, or every element inside a floated call becomes unreachable.
  function gQ(id) {
    var el = gOverlay();
    if (el) {
      var hit = (el.ownerDocument || document).getElementById(id);
      if (hit) return hit;
    }
    return document.getElementById(id);
  }
  // Which document a dialog or toast has to be drawn into to actually be seen.
  function gDoc() {
    var el = gOverlay();
    return (el && el.ownerDocument) || document;
  }

  function host() {
    var el = gOverlay();
    if (!el) {
      el = document.createElement('div');
      el.id = 'mtgGuestView';
      el.className = 'mtg-guest';
      document.body.innerHTML = '';
      document.body.appendChild(el);
      document.body.classList.add('pf-mode');
      guestOverlayEl = el;
    }
    return el;
  }

  function shell(inner, wide) {
    return '<div class="mtg-guest-wrap' + (wide ? ' wide' : '') + '">'
      + '<div class="mtg-guest-brand">Concussion Therapy <span>Group</span></div>'
      + '<div class="mtg-guest-sub">SECURE VIDEO MEETING</div>'
      + inner
      + '<div class="mtg-guest-foot">This is a secure link intended only for you.</div></div>';
  }

  /* Green-room background support for guests. Same contract as the staff side;
     the choice is applied when the camera starts after admission. */
  function guestBgProvider() {
    return {
      list: bgLibrary,
      get: function () {
        try { return localStorage.getItem(GBG_CHOICE_KEY) || 'none'; } catch (e) { return 'none'; }
      },
      set: function (choice) {
        try {
          if (choice === 'none') localStorage.removeItem(GBG_CHOICE_KEY);
          else localStorage.setItem(GBG_CHOICE_KEY, choice);
        } catch (e) {}
        bgChoice = choice;
      },
      remove: function (id) {
        bgSave(bgLibrary().filter(function (b) { return b.id !== id; }));
        try {
          if ((localStorage.getItem(GBG_CHOICE_KEY) || '') === 'img:' + id) {
            localStorage.removeItem(GBG_CHOICE_KEY);
          }
        } catch (e) {}
      },
      upload: function (file) {
        if (!/^image\//.test(file.type)) return Promise.reject(new Error('Not an image'));
        return bgDownscale(file).then(function (dataUrl) {
          // Already a public route - guests have no account, and a backdrop
          // carries no patient information.
          return fetch('/api/meetings/background', {
            method: 'POST', credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            // A guest has no session, so the meeting token is what authorises
            // the upload - without it the route answers 401.
            body: JSON.stringify({ dataUrl: dataUrl, guestToken: TOKEN, guestId: state.guestId || undefined })
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (!res || !res.url) throw new Error('upload failed');
            var lib = bgLibrary();
            var id = 'bg' + Date.now();
            lib.unshift({ id: id, name: (file.name || 'image').slice(0, 40), data: dataUrl, url: res.url });
            bgSave(lib.slice(0, 12));
            try { localStorage.setItem(GBG_CHOICE_KEY, 'img:' + id); } catch (e) {}
            bgChoice = 'img:' + id;
          });
        });
      }
    };
  }

  /* The guest page replaces the whole document body, so the portal's shared
     confirm modal does not exist here. Native alert() looked like a browser
     error on what is otherwise a branded clinical page, so this is a small
     self-contained one using the meeting dialog styles. */
  function guestNotice(message, title) {
    // Drawn wherever the call currently is - once floating exists, a dialog
    // built into the main document is a dialog nobody looking at the pop-out
    // window can see or answer.
    var doc = gDoc();
    var el = doc.getElementById('mtgGuestNotice');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'mtgGuestNotice';
      doc.body.appendChild(el);
    }
    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">' + esc(title || 'Just so you know') + '</div>'
      + '<div class="small-muted" data-cs="'+__cs+'margin:2px 0 16px;line-height:1.6;font-size:13px">' + esc(message) + '</div>'
      + '<div class="mtg-modal-actions">'
        + '<button class="btn btn-primary" data-onclick="mtgGuestNoticeClose()">OK</button>'
      + '</div></div>';
  }
  window.mtgGuestNoticeClose = function () {
    var el = gDoc().getElementById('mtgGuestNotice');
    if (el) { el.className = 'mtg-modal'; el.innerHTML = ''; }
  };

  function render() {
    var el = host();

    if (state.phase !== 'incall' && el.className !== 'mtg-guest') el.className = 'mtg-guest';

    if (state.phase === 'loading') { el.innerHTML = shell('<div class="mtg-guest-card">Loading…</div>'); return; }
    if (state.phase === 'error') {
      el.innerHTML = shell('<div class="mtg-guest-card mtg-guest-err">' + esc(state.error) + '</div>');
      return;
    }
    /* Name entry and waiting are one screen with one live preview, not two.
       Re-rendering between them would drop the camera and make it re-prompt,
       and the point is that the person is set up and can see themselves
       for the entire time they are waiting. */
    if (state.phase === 'name' || state.phase === 'waiting') {
      var waiting = state.phase === 'waiting';
      if (!document.getElementById('mtgGrHost')) {
        el.innerHTML = shell('<div class="mtg-guest-card mtg-gr-card" id="mtgGrHost"></div>', true);
      }
      window.mtgGreenRoom.mount(document.getElementById('mtgGrHost'), {
        title: state.meeting.title,
        subtitle: 'Hosted by ' + state.meeting.hostName,
        showName: !waiting,
        name: state.name,
        status: waiting
          ? 'Waiting to be let in — ' + state.name
          : 'Check your camera, microphone and background. The host will be asked to let you in.',
        bg: guestBgProvider(),
        recording: beingRecorded,
        transcriptConsent: true,
        spinner: waiting,
        primary: waiting ? '' : 'Ask to join',
        onPrimary: window.mtgGuestKnock
      });
      return;
    }
    /* The end-of-meeting and not-admitted screens are the last thing a patient
       sees, so they get the same care as the rest of the portal rather than one
       bare line of text. */
    if (state.phase === 'denied') {
      el.innerHTML = shell('<div class="mtg-guest-card mtg-end">'
        + '<div class="mtg-end-icon mtg-end-icon-warn">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">'
          + '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg></div>'
        + '<div class="mtg-end-title">You were not admitted</div>'
        + '<div class="mtg-end-sub">The host did not let you into this meeting. If you think this is a '
        + 'mistake, please contact the clinic and they can send you a new link.</div>'
        + '</div>');
      return;
    }
    if (state.phase === 'ended') {
      el.innerHTML = shell('<div class="mtg-guest-card mtg-end">'
        + '<div class="mtg-end-icon">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
          + '<path d="M20 6L9 17l-5-5"/></svg></div>'
        + '<div class="mtg-end-title">'
          + (state.removed ? 'You have been removed from this meeting'
             : state.endedByHost ? 'The clinic ended this meeting' : 'The meeting has ended') + '</div>'
        /* Plain. A patient who has just been taken out of a
           clinical session should be told what happened and who to speak to,
           not accused of anything - the reason is between them and the clinic,
           and this page has no idea what it was. */
        + '<div class="mtg-end-sub">'
          + (state.removed
              ? 'The clinic ended your part of this meeting. If this was not expected, contact them and they can let you back in.'
              : 'Thank you for joining. You can close this page now — nothing else is needed from you.')
        + '</div>'
        /* The transcript note is gone with the download it described: nothing
           is written to a guest's device any more. */
        + '<div class="mtg-end-note">If you need to speak to someone again, contact the clinic and '
        + 'they will send you a new link. This one will no longer work.</div>'
        + '</div>');
      return;
    }
    if (state.phase === 'incall') renderCall();
  }

  /* ---------- lobby ---------- */

  window.mtgGuestKnock = function () {
    var name = window.mtgGreenRoom.name();
    if (name.length < 2) { guestNotice('Please enter your name so the host knows who is asking to join.', 'Your name'); return; }
    state.name = name;
    state.transcriptConsent = window.mtgGreenRoom.transcriptConsent ? window.mtgGreenRoom.transcriptConsent() : false;
    window.mtgGreenRoom.busy(true, 'Asking to join…');
    api('/guest/' + encodeURIComponent(TOKEN) + '/knock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name, transcriptConsent: state.transcriptConsent })
    }).then(function (r) {
      if (!r.ok) {
        window.mtgGreenRoom.release();
        state.phase = 'error'; state.error = (r.j && r.j.error) || 'Could not join.'; render(); return;
      }
      state.guestId = r.j.guestId;
      state.phase = 'waiting';
      render();
      startPolling();
    });
  };

  function startPolling() {
    clearInterval(poll);
    poll = setInterval(function () {
      api('/guest/' + encodeURIComponent(TOKEN) + '/state/' + encodeURIComponent(state.guestId))
        .then(function (r) {
          if (!r.ok) return;
          var s = r.j.state;
          if (s === 'denied') { clearInterval(poll); state.phase = 'denied'; render(); return; }
          if (s === 'ended') { clearInterval(poll); state.phase = 'ended'; render(); return; }
          var wasRec = beingRecorded;
          beingRecorded = !!r.j.recording;
          // Started while they were waiting: warn (and speak) right away.
          if (!wasRec && beingRecorded) render();
          if (s === 'admitted' && r.j.token) { clearInterval(poll); joinCall(r.j); }
        });
    }, 2500);
  }

  /* ---------- the call ---------- */

  function joinCall(info) {
    if (!window.ACS) { state.phase = 'error'; state.error = 'Video is still loading. Please refresh.'; render(); return; }
    /* Remember my own ACS id. Everything the room publishes about a person
       a raised hand, a name the host corrected - is keyed by it, so without
       this a guest cannot tell which entries are their own. */
    state.acsUserId = info.acsUserId || '';
    /* Everything chosen in the green room, captured before the preview hands
       the hardware back - a camera still held by the preview makes the SDK's
       own capture fail on a fair number of machines. */
    var prefs = window.mtgGreenRoom.settings();
    window.mtgGreenRoom.release();
    // Namespaced exports - see the note in meetings.js.
    var client = new window.ACS.Calling.CallClient();
    var cred = new window.ACS.Common.AzureCommunicationTokenCredential({
      token: info.token,
      refreshProactively: true,
      tokenRefresher: function () {
        return api('/guest/' + encodeURIComponent(TOKEN) + '/state/' + encodeURIComponent(state.guestId))
          .then(function (r) {
            if (!r.ok || !r.j || !r.j.token) throw new Error('Could not refresh the meeting token');
            return r.j.token;
          });
      }
    });
    client.createCallAgent(cred, { displayName: state.name }).then(function (a) {
      agent = a;
      return client.getDeviceManager();
    }).then(function (dm) {
      deviceMgr = dm;
      return dm.askDevicePermission({ audio: true, video: true }).catch(function () {});
    }).then(function () {
      call = agent.join({ groupId: info.callGroupId });
      // Ask for 720p out - see the note in meetings.js.
      try {
        var vc = call.feature(window.ACS.Calling.Features.VideoConstraints);
        if (vc && vc.setConstraints) {
          vc.setConstraints({ video: { send: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } } } });
        }
      } catch (e) { /* older SDK build */ }
      applyGreenRoom(prefs);
      // Quiet window so a guest walking into a busy room hears one thing, not five.
      if (window.mtgMarkJoined) window.mtgMarkJoined();
      try {
        if (window.mtgSelfMeter) {
          var micId = '';
          try { micId = (deviceMgr && deviceMgr.selectedMicrophone && deviceMgr.selectedMicrophone.id) || ''; }
          catch (e2) { micId = ''; }
          window.mtgSelfMeter.start(micId, function (talking) {
            setSpeaking('self', talking && !muted);
          });
        }
      } catch (e) { /* no meter - other people still glow */ }
      state.phase = 'incall';
      gArmAutoFloat();
      // Already recording when they walked in - say so out loud as they arrive.
      /* Arriving - including arriving back after dropping out - always gets the
         notice, spoken and written. Someone who rejoins a meeting that is still
         recording must be told, not silently added to it. */
      if (window.mtgResetAnnouncement) window.mtgResetAnnouncement();
      if (beingRecorded) { window.mtgAnnounceRecording(true); guestRecBar(); }
      loadGuestChat();
      clearInterval(chatPoll);
      chatPoll = setInterval(loadGuestChat, 1500);
      /* Keep watching after admission: a host can start recording at any point,
         and the guest has to be told when that happens, not only at the door. */
      clearInterval(recPoll);
      recPoll = setInterval(function () {
        api('/guest/' + encodeURIComponent(TOKEN) + '/state/' + encodeURIComponent(state.guestId))
          .then(function (r) {
            if (!r.ok || !r.j) return;
            var now = !!r.j.recording;
            if (now !== beingRecorded) {
              beingRecorded = now;
              render();
              // Only on the transition into recording, and only once - nobody
              // needs to be told every five seconds.
              if (now) { window.mtgAnnounceRecording(true); guestRecBar(); }
            }
          }).catch(function () {});
      }, 5000);
      startedAt = Date.now();
      wire(call);
      render();
      clearInterval(timer);
      timer = setInterval(function () {
        var el = gQ('mtgGuestTimer');
        if (el) {
          var s = Math.floor((Date.now() - startedAt) / 1000);
          var h = Math.floor(s / 3600);
          el.textContent = (h ? h + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0')
                              : String(Math.floor(s / 60)).padStart(2, '0'))
            + ':' + String(s % 60).padStart(2, '0');
        }
        var wc = gQ('mtgGuestClock');
        if (wc) wc.textContent = guestWallClock();
      }, 1000);
    }).catch(function (e) {
      state.phase = 'error';
      state.error = 'Could not connect: ' + ((e && e.message) || 'unknown error');
      render();
    });
  }

  /* Put the call into the state the person already set up in the green room,
     so being admitted does not undo their choices. */
  function applyGreenRoom(prefs) {
    if (!prefs) return;
    try {
      if (prefs.micId && deviceMgr && deviceMgr.selectMicrophone) {
        Promise.resolve(deviceMgr.getMicrophones()).then(function (list) {
          var d = window.mtgGreenRoom.pick(list, prefs.micId, prefs.micLabel);
          if (d) deviceMgr.selectMicrophone(d);
        }).catch(function () {});
      }
      if (prefs.spkId && deviceMgr && deviceMgr.selectSpeaker) {
        Promise.resolve(deviceMgr.getSpeakers()).then(function (list) {
          var d = window.mtgGreenRoom.pick(list, prefs.spkId, prefs.spkLabel);
          if (d) deviceMgr.selectSpeaker(d);
        }).catch(function () {});
      }
    } catch (e) { /* device selection is a nicety, never a blocker */ }

    muted = false;
    try { if (call.isMuted) call.unmute().catch(function () {}); } catch (e) {}
    if (prefs.camOn) startGuestVideo(prefs);
  }

  /* Camera-on at join, using the camera picked in the green room. */
  /* Returns a promise so callers can tell when the camera has finished coming
     up - mtgGuestVideo needs it to know when to release its busy guard. */
  function startGuestVideo(prefs) {
    return deviceMgr.getCameras().then(function (cams) {
      if (!cams.length) return;
      var dev = window.mtgGreenRoom.pick(cams, prefs && prefs.camId, prefs && prefs.camLabel);
      localStream = new window.ACS.Calling.LocalVideoStream(dev);
      return call.startVideo(localStream).then(function () {
        videoOn = true;
        render();
        return waitForVideo(8000);
      }).then(function () { restoreSavedBg(); });
    }).catch(function () {});
  }

  /* Re-apply the last background the moment the camera starts, so nobody is
     ever briefly shown their real room. */
  function restoreSavedBg() {
    var saved = 'none';
    try { saved = localStorage.getItem(GBG_CHOICE_KEY) || 'none'; } catch (e) {}
    if (saved === 'none') return;
    var stillThere = saved.indexOf('img:') !== 0
      || bgLibrary().some(function (b) { return b.id === saved.slice(4); });
    if (stillThere) window.mtgGuestBg(saved);
    else { try { localStorage.removeItem(GBG_CHOICE_KEY); } catch (e) {} }
  }

  function wire(c) {
    c.on('stateChanged', function () {
      // Their microphone starts transcribing itself once they are actually in.
      if (c.state === 'Connected') { try { guestStartTranscript(); } catch (e) {} }
      if (c.state === 'Disconnected') {
        /* The host ended the meeting, or the call dropped. This is the only
           notice a guest gets, so the transcript has to be written here too
           guestHangUp only covers them leaving of their own accord. */
        try { autoSaveTranscript(); } catch (e) {}
        state.phase = 'ended'; clearInterval(timer); render();
      }
      else render();
    });
    c.on('remoteParticipantsUpdated', function (e) {
      (e.added || []).forEach(watch);
      // Same two tones the staff side plays - defined on window in meetings.js.
      if (window.mtgSoundsReady && window.mtgSoundsReady()) {
        if ((e.added || []).length && window.mtgPlayJoin) window.mtgPlayJoin();
        if ((e.removed || []).length && window.mtgPlayLeave) window.mtgPlayLeave();
      }
      render();
    });
    c.on('isScreenSharingOnChanged', function () { render(); });
    /* The host can mute a guest. Without this their own microphone button
       still reads as live while the SDK has already silenced them. */
    c.on('isMutedChanged', function () {
      muted = !!c.isMuted;
      // See the note on the clinician side: the meter has its own capture and
      // does not go quiet just because the call was muted.
      if (muted) setSpeaking('self', false);
      txSyncMute();
      render();
    });

    /* mutedByOthers is the event for being silenced by the host, distinct from
       isMutedChanged, and the reason a muted guest previously saw no change on
       their own microphone button. The flag is forced so the button matches what
       the SDK did, and they can press it to unmute themselves. */
    c.on('mutedByOthers', function () {
      muted = true;
      try { if (!c.isMuted) c.mute(); } catch (e) {}
      txSyncMute();
      guestNotice('The host has muted your microphone. Press the microphone button when you want to speak again.', 'You were muted');
      render();
    });
    (c.remoteParticipants || []).forEach(watch);
  }
  /* Speaking marks are painted straight onto the tiles. Re-rendering several
     times a sentence would rebuild every video element and flicker the call
     same reasoning as the staff side. */
  var speaking = {};

  function setSpeaking(key, on) {
    if (!key) return;
    if (on) speaking[key] = true; else delete speaking[key];
    paintSpeaking();
  }

  function paintSpeaking() {
    var root = gOverlay();
    if (!root) return;
    root.querySelectorAll('.mtg-tile').forEach(function (tile) {
      var holder = tile.querySelector('.mtg-tile-video');
      var id = holder ? String(holder.id).replace(/^mtgGV_/, '') : '';
      tile.classList.toggle('speaking', !!speaking[id]);
    });
  }

  function watch(p) {
    p.on('videoStreamsUpdated', render);
    p.on('stateChanged', render);
    p.on('isMutedChanged', function () {
      var key = (p.identifier && p.identifier.communicationUserId) || '';
      if (p.isMuted) setSpeaking(key, false);
      render();
    });
    p.on('isSpeakingChanged', function () {
      var key = (p.identifier && p.identifier.communicationUserId) || '';
      setSpeaking(key, !!p.isSpeaking && !p.isMuted);
    });
    (p.videoStreams || []).forEach(function (v) { v.on('isAvailableChanged', render); });
  }

  /* Screen sharing is available to everyone in the call, not just the host
     a patient showing a report, or a law firm showing a document, is the whole
     point of the guest side. */
  window.mtgGuestShare = async function () {
    if (!call) return;
    try {
      if (call.isScreenSharingOn) {
        // Stop and start share the same button; stopping by accident mid-way
        // through showing a document is worth one question.
        if (!(await guestConfirm('Stop sharing your screen? Everyone goes back to the camera view.',
                                 'Stop sharing', 'Stop sharing'))) return;
        await call.stopScreenSharing();
      } else await call.startScreenSharing();
    } catch (e) {
      // Cancelling the browser picker throws; that is not an error worth showing.
      if (!/permission|denied|cancel|abort/i.test((e && e.message) || '')) {
        guestNotice('Your screen could not be shared. On some browsers this needs permission in system settings.',
          'Screen sharing');
      }
    }
    render();
  };

  var busy = { mic: false, video: false };

  /* The live transcript captures the microphone on its own, apart from the
     call, so muting the call alone left a patient's aside being transcribed,
     shown to the room, saved and billed. Same wiring as the staff side: the
     session reads `muted`, and is told whenever it changes. */
  function txSyncMute() {
    try { if (txSession && txSession.setMuted) txSession.setMuted(muted); } catch (e) {}
  }

  window.mtgGuestMute = function () {
    if (!call || busy.mic) return;
    busy.mic = true;
    muted = !muted;
    txSyncMute();
    render();
    (muted ? call.mute() : call.unmute())
      .catch(function () { muted = !muted; txSyncMute(); })
      .then(function () { busy.mic = false; render(); });
  };
  window.mtgGuestVideo = function () {
    if (!call || busy.video) return;
    busy.video = true;
    render();
    var free = function () { busy.video = false; render(); };
    if (videoOn) {
      var stop = (localStream ? call.stopVideo(localStream) : Promise.resolve())
        .catch(function () {});
      // The view belongs to this stream - see the note in meetings.js.
      try { if (localRenderer) localRenderer.dispose(); } catch (e) {}
      localRenderer = null; localView = null;
      localStream = null; videoOn = false; bgChoice = 'none';
      render();
      stop.then(free);
      return;
    }
    // A new stream, so any previous view is stale by definition.
    try { if (localRenderer) localRenderer.dispose(); } catch (e) {}
    localRenderer = null; localView = null;
    // Same path the green room uses, so turning the camera back on mid-meeting
    // returns to the camera that was chosen rather than whichever is first.
    startGuestVideo(window.mtgGreenRoom.settings()).then(free, free);
  };
  /* Yes/no dialog for guests. The staff confirm lives in app.js, which this
     page never loads - it replaces the whole document body. Same shape as
     guestNotice so the two read as one family. */
  function guestConfirm(message, title, okLabel, danger) {
    return new Promise(function (resolve) {
      // Same reasoning as guestNotice: this has to appear in the document the
      // patient is actually looking at, or "Stop sharing" / "Leave" clicked
      // from inside a floating window waits on an answer nobody can give.
      var doc = gDoc();
      var el = doc.getElementById('mtgGuestNotice');
      if (!el) {
        el = doc.createElement('div');
        el.id = 'mtgGuestNotice';
        doc.body.appendChild(el);
      }
      el.className = 'mtg-modal show';
      el.innerHTML = '<div class="mtg-modal-card">'
        + '<div class="mtg-modal-title">' + esc(title || 'Please confirm') + '</div>'
        + '<div class="small-muted" data-cs="'+__cs+'margin:2px 0 16px;line-height:1.6;font-size:13px">' + esc(message) + '</div>'
        + '<div class="mtg-modal-actions">'
          + '<button class="btn btn-ghost" id="mtgGuestConfirmNo">Cancel</button>'
          /* No .btn-danger class exists in this stylesheet - the shared staff
             confirm tints its own button inline for the same reason. */
          + '<button class="btn btn-primary" id="mtgGuestConfirmYes"'
          + (danger ? ' data-cs="'+__cs+'background:#e14526;border-color:#e14526"' : '') + '>'
          + esc(okLabel || 'OK') + '</button>'
        + '</div></div>';
      var done = function (v) { el.className = 'mtg-modal'; el.innerHTML = ''; resolve(v); };
      // Direct property assignment, not an inline onclick string - the
      // closure resolves normally no matter which document evaluated it, so
      // this needs no copying onto the floating window's globals.
      doc.getElementById('mtgGuestConfirmYes').onclick = function () { done(true); };
      doc.getElementById('mtgGuestConfirmNo').onclick = function () { done(false); };
    });
  }

  /* Closed by the host, rather than left by the guest. Same teardown, but it
     says so - a call that simply vanishes reads as a dropped connection, and a
     patient who thinks the line dropped will sit there waiting. */
  var guestClosed = false;
  function guestRoomClosed(reason) {
    if (guestClosed) return;
    guestClosed = true;
    if (reason === 'removed') state.removed = true;
    clearInterval(timer); clearInterval(poll); clearInterval(recPoll); clearInterval(chatPoll);
    try { if (txSession) { txSession.dispose(); txSession = null; } } catch (e) {}
    try { window.mtgSelfMeter.stop(); } catch (e) {}
    try { if (call && call.state !== 'Disconnected') call.hangUp(); } catch (e) {}
    try { if (agent) agent.dispose(); } catch (e) {}
    call = null; agent = null;
    gDisarmAutoFloat();
    // Bring the goodbye screen back to the main tab rather than leaving it
    // stuck inside a pop-out that is about to close.
    gStopFloating();
    state.phase = 'ended'; state.endedByHost = true; render();
  }

  function guestHangUp() {
    // Before teardown - the lines are only in memory.
    try { autoSaveTranscript(); } catch (e) {}
    clearInterval(timer); clearInterval(poll); clearInterval(recPoll); clearInterval(chatPoll);
    try { window.mtgSelfMeter.stop(); } catch (e) {}
    try { if (call && call.state !== 'Disconnected') call.hangUp(); } catch (e) {}
    try { if (agent) agent.dispose(); } catch (e) {}
    call = null; agent = null;
    gDisarmAutoFloat();
    gStopFloating();
    /* Shut the ⋮ menu before the stage is replaced, or its click-away listener
       outlives the meeting it belonged to. */
    moreOpen = false; moreListen(false);
    state.phase = 'ended'; render();
  }

  /* Asks first. Leaving is one mis-click on a red button, and a patient who
     drops out has to knock again and wait to be re-admitted to their own
     appointment - not a cheap mistake. */
  window.mtgGuestLeave = function () {
    guestConfirm('Leave this meeting? You would need to ask to join again, and wait for the host to let you back in.',
                 'Leave meeting', 'Leave', true)
      .then(function (ok) { if (ok) guestHangUp(); });
  };

  var IC = {
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
    blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V4a3 3 0 0 0-5.9-.7"/><path d="M19 10v2a7 7 0 0 1-.7 3"/><path d="M12 19v4"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22"/><path d="M16 16H3a2 2 0 0 1-2-2V7"/><path d="M23 7l-7 5"/></svg>',
    hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11"/><path d="M15 10.5V4.5a1.5 1.5 0 0 0-3 0V11"/><path d="M12 10.5v-5a1.5 1.5 0 0 0-3 0V13"/><path d="M9 11.5v-2a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-3a1.5 1.5 0 0 0-3 0"/></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>',
    script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3h11l3 3v15H5z"/><path d="M9 9h7M9 13h7M9 17h4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
  };

  /* Background effects - blur or an uploaded photo. Loaded on demand; see the
     note in meetings.js. Guests get the same choices as staff. */
  var GBG_KEY = 'ctg_meeting_backgrounds';
  var GBG_CHOICE_KEY = 'ctg_meeting_bg_choice';
  var bgChoice = 'none', effectsLoading = null;
  // See the note in meetings.js - renderCall() rebuilds the overlay.
  var bgOpen = false;

  var devOpen = false;

  window.mtgGuestToggleDevPanel = function () {
    // Two panels share the same corner; opening one closes the other.
    if (bgOpen) { bgOpen = false; renderBgPanel(); }
    devOpen = !devOpen;
    renderDevPanel();
  };

  function devSelect(label, id, items, sel, handler) {
    return '<label class="mtg-dev-lb">' + label + '</label>'
      + (items.length
          ? '<select id="' + id + '" data-onchange="' + handler + '(this.value)">'
            + items.map(function (d) {
                return '<option value="' + esc(d.id) + '"' + (sel && sel.id === d.id ? ' selected' : '') + '>'
                  + esc(d.name || 'Device') + '</option>';
              }).join('') + '</select>'
          : '<select disabled><option>None found</option></select>');
  }

  function renderDevPanel() {
    var p = gQ('mtgGuestDevPanel');
    if (!p) return;
    p.classList.toggle('show', devOpen);
    if (!devOpen) { p.innerHTML = ''; return; }
    if (!deviceMgr) { p.innerHTML = '<div class="mtg-bg-title">Devices</div><div class="mtg-bg-note">Still starting up — try again in a moment.</div>'; return; }

    p.innerHTML = '<div class="mtg-bg-title">Devices</div><div class="mtg-bg-note">Loading…</div>';
    var none = function () { return []; };
    Promise.all([
      deviceMgr.getMicrophones ? deviceMgr.getMicrophones().catch(none) : [],
      deviceMgr.getSpeakers ? deviceMgr.getSpeakers().catch(none) : [],
      deviceMgr.getCameras ? deviceMgr.getCameras().catch(none) : []
    ]).then(function (res) {
      if (!devOpen) return;           // closed while the device list was loading
      var selMic = null, selSpk = null;
      try { selMic = deviceMgr.selectedMicrophone; } catch (e) {}
      try { selSpk = deviceMgr.selectedSpeaker; } catch (e) {}
      var camId = localStream && localStream.source ? localStream.source.id : '';
      p.innerHTML = '<div class="mtg-bg-title">Devices</div>'
        + devSelect('Microphone', 'mtgGuestDevMic', res[0] || [], selMic, 'mtgGuestPickMic')
        + devSelect('Speaker', 'mtgGuestDevSpk', res[1] || [], selSpk, 'mtgGuestPickSpk')
        + devSelect('Camera', 'mtgGuestDevCam', res[2] || [], { id: camId }, 'mtgGuestPickCam')
        /* Your own name, editable here. A guest who mistypes it on the way in
           previously had to leave and knock again to correct it - and the host
           would have to re-admit them - so it sits with the other things about
           yourself rather than being a host-only fix. */
        + '<label class="mtg-dev-lb">Your name</label>'
        + '<div class="mtg-name-row">'
          + '<input id="mtgGuestNameInput" type="text" maxlength="100" value="' + esc(state.name || '') + '">'
          + '<button type="button" class="btn btn-primary btn-sm" data-onclick="mtgGuestSaveName()">Save</button>'
        + '</div>'
        + '<div class="mtg-bg-note">Changes apply straight away — you stay in the meeting.</div>';
    }).catch(function () {
      p.innerHTML = '<div class="mtg-bg-title">Devices</div><div class="mtg-bg-note">Could not read your devices.</div>';
    });
  }

  /* Renames only yourself. The server derives who is being renamed from the
     guest id in the URL, so there is no key to tamper with here - a guest can
     never rename another participant. Only staff can do that. */
  window.mtgGuestSaveName = function () {
    var input = document.getElementById('mtgGuestNameInput');
    if (!input) return;
    var name = String(input.value || '').trim();
    if (name.length < 2) { guestNotice('Please enter your name.', 'Your name'); return; }
    if (name === state.name) { devOpen = false; renderDevPanel(); return; }

    api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/name', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    }).then(function (r) {
      if (!r.ok) { guestNotice((r.j && r.j.error) || 'Could not change your name.', 'Your name'); return; }
      state.name = r.j.name || name;
      names = (r.j && r.j.names) || names;
      devOpen = false;
      render();
    }).catch(function () { guestNotice('Could not change your name.', 'Your name'); });
  };

  window.mtgGuestPickMic = function (id) {
    if (!deviceMgr) return;
    deviceMgr.getMicrophones().then(function (mics) {
      var d = mics.filter(function (x) { return x.id === id; })[0];
      if (d) return deviceMgr.selectMicrophone(d);
    }).catch(function () { guestNotice('Could not switch to that microphone.', 'Devices'); });
  };

  window.mtgGuestPickSpk = function (id) {
    if (!deviceMgr) return;
    deviceMgr.getSpeakers().then(function (spks) {
      var d = spks.filter(function (x) { return x.id === id; })[0];
      if (d) return deviceMgr.selectSpeaker(d);
    }).catch(function () { guestNotice('Could not switch to that speaker.', 'Devices'); });
  };

  /* switchSource keeps the same LocalVideoStream object, so the call keeps
     sending and a running background effect stays attached. Stopping and
     restarting video would drop both - see the same note in meetings.js. */
  window.mtgGuestPickCam = function (id) {
    if (!deviceMgr) return;
    if (!localStream || !localStream.switchSource) {
      guestNotice('Turn your camera on first, then choose which one to use.', 'Camera is off');
      return;
    }
    deviceMgr.getCameras().then(function (cams) {
      var d = cams.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      return localStream.switchSource(d).then(function () { return rebuildGuestSelfView(); });
    }).catch(function () { guestNotice('Could not switch to that camera.', 'Devices'); });
  };

  function loadEffects() {
    // Effects now ship inside the calling bundle - they must share one module
    // instance or startEffects() silently does nothing.
    if (window.ACSEffects) return Promise.resolve(true);
    if (effectsLoading) return effectsLoading;
    effectsLoading = new Promise(function (resolve) {
      var sc = document.createElement('script');
      sc.src = 'acs-effects-bundle.js?v=20260805l';
      sc.onload = function () { resolve(!!window.ACSEffects); };
      sc.onerror = function () { resolve(false); };
      document.head.appendChild(sc);
    });
    return effectsLoading;
  }

  // Drop pre-upload entries that ACS cannot use - see the note in meetings.js.
  function bgLibrary() {
    var lib = [];
    try { lib = JSON.parse(localStorage.getItem(GBG_KEY) || '[]'); } catch (e) { return []; }
    var usable = lib.filter(function (b) { return b && b.url; });
    if (usable.length !== lib.length) {
      try { localStorage.setItem(GBG_KEY, JSON.stringify(usable)); } catch (e) {}
      try {
        var saved = localStorage.getItem(GBG_CHOICE_KEY) || '';
        if (saved.indexOf('img:') === 0 && !usable.some(function (b) { return b.id === saved.slice(4); })) {
          localStorage.removeItem(GBG_CHOICE_KEY);
        }
      } catch (e) {}
    }
    return usable;
  }
  function bgSave(list) { try { localStorage.setItem(GBG_KEY, JSON.stringify(list)); } catch (e) {} }

  /* Cover-crop to the video frame - see the note in meetings.js. */
  function bgDownscale(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var W = 1920, H = 1080;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        var scale = Math.max(W / img.width, H / img.height);
        var dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
      img.src = url;
    });
  }

  window.mtgGuestBgUpload = function (input) {
    var file = input && input.files && input.files[0];
    if (!file || !/^image\//.test(file.type)) return;
    bgDownscale(file).then(function (dataUrl) {
      // Must be served from a real URL - see the note in meetings.js.
      return api('/background', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: dataUrl, guestToken: TOKEN, guestId: state.guestId || undefined })
      }).then(function (r) {
        if (!r.ok || !r.j || !r.j.url) throw new Error((r.j && r.j.error) || 'Upload failed.');
        var lib = bgLibrary();
        lib.unshift({ id: 'bg' + Date.now(), name: file.name.slice(0, 40), data: dataUrl, url: r.j.url });
        bgSave(lib.slice(0, 12));
        renderBgPanel();
        window.mtgGuestBg('img:' + lib[0].id);
      });
    }).catch(function (e) { guestNotice((e && e.message) || 'That image could not be uploaded. Please try a different one.', 'Background'); });
    input.value = '';
  };

  window.mtgGuestBgRemove = function (id) {
    bgSave(bgLibrary().filter(function (b) { return b.id !== id; }));
    if (bgChoice === 'img:' + id) window.mtgGuestBg('none'); else renderBgPanel();
  };

  /* See the note in meetings.js - an effect applied before the camera is
     producing frames is rejected with a generic error. */
  function waitForVideo(timeoutMs) {
    var until = Date.now() + (timeoutMs || 6000);
    return new Promise(function (resolve) {
      (function tick() {
        var v = document.querySelector('#mtgGV_self video');
        if (v && v.videoWidth > 0 && !v.paused) return resolve(true);
        if (Date.now() > until) return resolve(false);
        setTimeout(tick, 250);
      })();
    });
  }

  /* Build-then-swap, so the preview never goes black and never shows the raw
     camera after an effect change. See the note in meetings.js. */
  function rebuildGuestSelfView() {
    if (!localStream || !window.ACS) return Promise.resolve(false);
    var oldRenderer = localRenderer, renderer = null;
    try { renderer = new window.ACS.Calling.VideoStreamRenderer(localStream); }
    catch (e) { return Promise.resolve(false); }
    return renderer.createView({ scalingMode: 'Crop' }).then(function (view) {
      var holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;overflow:hidden';
      holder.appendChild(view.target);
      document.body.appendChild(holder);
      return new Promise(function (resolve) {
        var tries = 0;
        (function tick() {
          var v = holder.querySelector('video');
          if (v) {
            v.autoplay = true; v.playsInline = true; v.muted = true;
            if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
            if (v.videoWidth > 0 && !v.paused) {
              localRenderer = renderer; localView = view;
              holder.remove(); render();
              try { if (oldRenderer && oldRenderer !== renderer) oldRenderer.dispose(); } catch (e) {}
              return resolve(true);
            }
          }
          if (++tries > 60) {
            try { renderer.dispose(); } catch (e) {}
            holder.remove();
            return resolve(false);
          }
          setTimeout(tick, 250);
        })();
      });
    }).catch(function () { return false; });
  }

  window.mtgGuestBg = function (choice) {
    if (!call) return;
    if (!videoOn || !localStream) { guestNotice('Turn your camera on first, then choose a background.', 'Camera is off'); return; }
    loadEffects().then(function (ok) {
      if (choice !== 'none' && !ok) throw new Error('Background effects could not load.');
      var feature = localStream.feature(window.ACS.Calling.Features.VideoEffects);
      // See the note in meetings.js - failures arrive on this event, not as a
      // rejected promise.
      if (!feature.__ctgWired) {
        feature.__ctgWired = true;
        feature.on('effectsError', function (err) {
          var reason = (err && (err.reason || err.message)) || 'unknown reason';
          bgChoice = 'none';
          try { localStorage.removeItem(GBG_CHOICE_KEY); } catch (e) {}
          guestNotice(reason, 'Background could not be applied');
          renderBgPanel(); render();
        });
        feature.on('effectsStarted', function () {
          // Never dispose the live preview - see the note in meetings.js.
          setTimeout(render, 350);
        });
      }
      // isSupported() takes the effect instance; calling it bare throws.
      var supported = true;
      if (choice !== 'none' && supported === false) throw new Error('Not supported on this device or browser.');
      // Clear first - switching effects directly can leave the old one running.
      return Promise.resolve(feature.stopEffects()).catch(function () {})
        .then(function () { return choice === 'none' ? true : waitForVideo(6000); })
        .then(function () {
        if (choice === 'blur') return feature.startEffects(new window.ACSEffects.BackgroundBlurEffect());
        if (choice.indexOf('img:') === 0) {
          var item = bgLibrary().filter(function (b) { return b.id === choice.slice(4); })[0];
          if (!item) throw new Error('That background is no longer saved.');
          if (!item.url) throw new Error('That background needs re-uploading.');
          return feature.startEffects(new window.ACSEffects.BackgroundReplacementEffect({
            backgroundImageUrl: location.origin + item.url
          }));
        }
      }).then(function () {
        bgChoice = choice;
        try { localStorage.setItem(GBG_CHOICE_KEY, choice); } catch (e) {}
        // See the note in meetings.js - the cached preview would otherwise keep
        // showing the raw camera and the effect would look broken.
        // Build the replacement view first, swap only when it has frames -
        // see the note in meetings.js.
        return rebuildGuestSelfView();
      });
    }).catch(function (e) {
      guestNotice(((e && e.message) || 'Unknown error') + '.', 'Background could not be applied');
    }).then(function () { renderBgPanel(); render(); });
  };

  window.mtgGuestToggleBgPanel = function () {
    // Both panels anchor to the same corner, so one has to give way.
    if (devOpen) { devOpen = false; renderDevPanel(); }
    bgOpen = !bgOpen;
    renderBgPanel();
  };

  /* The overflow menu, mirroring the clinician's: the bar keeps microphone,
     camera, present, more and leave, and everything occasional is in here with
     a written name instead of a glyph. Each item calls the same function its
     old rail button called. */
  var moreOpen = false, moreAway = null;

  window.mtgGuestToggleMore = function (ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    // Menu, background picker and device picker share the same patch of screen.
    if (bgOpen) { bgOpen = false; renderBgPanel(); }
    if (devOpen) { devOpen = false; renderDevPanel(); }
    moreOpen = !moreOpen;
    renderMore();
  };

  window.mtgGuestCloseMore = function () {
    if (!moreOpen) return;
    moreOpen = false;
    renderMore();
  };

  function moreListen(on) {
    if (moreAway) {
      moreAway.doc.removeEventListener('click', moreAway.click, true);
      moreAway.doc.removeEventListener('keydown', moreAway.key, true);
      moreAway = null;
    }
    if (!on) return;
    var doc = gDoc();
    var click = function (ev) {
      var m = gQ('mtgGuestMoreMenu');
      var b = gQ('mtgGuestMoreBtn');
      if ((m && m.contains(ev.target)) || (b && b.contains(ev.target))) return;
      window.mtgGuestCloseMore();
    };
    var key = function (ev) {
      if (ev.key === 'Escape') {
        window.mtgGuestCloseMore();
        var b = gQ('mtgGuestMoreBtn');
        if (b) b.focus();
      }
    };
    doc.addEventListener('click', click, true);
    doc.addEventListener('keydown', key, true);
    moreAway = { doc: doc, click: click, key: key };
  }

  function renderMore() {
    var m = gQ('mtgGuestMoreMenu');
    if (!m) return;
    m.classList.toggle('show', moreOpen);
    var b = gQ('mtgGuestMoreBtn');
    if (b) b.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
    moreListen(moreOpen);
    if (!moreOpen) { m.innerHTML = ''; return; }

    var unread = chat.length - chatSeen;
    var item = function (o) {
      return '<button class="mtg-menu-item' + (o.on ? ' on' : '') + '" role="menuitem"'
        + ' data-onclick="' + o.fn + '"' + (o.on == null ? '' : ' aria-pressed="' + (o.on ? 'true' : 'false') + '"')
        + '>' + o.icon + '<span>' + esc(o.lbl) + '</span>'
        + (o.tag ? '<span class="mtg-menu-tag">' + esc(o.tag) + '</span>' : '')
        + '</button>';
    };

    var floating = window.mtgGuestMiniOpen && window.mtgGuestMiniOpen();
    m.innerHTML =
        item({ fn: 'mtgGuestMoreDo(\'chat\')', icon: IC.chat, on: chatOpen,
               lbl: chatOpen ? 'Hide chat' : 'Chat', tag: unread > 0 ? String(unread) : '' })
      + item({ fn: 'mtgGuestMoreDo(\'hand\')', icon: IC.hand, on: myHandUp(),
               lbl: myHandUp() ? 'Lower your hand' : 'Raise your hand' })
      + '<div class="mtg-menu-sep"></div>'
      /* Only offered where it can actually work. Document Picture-in-Picture
         is Chromium-only - a patient on an iPhone would see a button that
         does nothing but apologise, which is worse than no button. */
      + (window.documentPictureInPicture
          ? item({ fn: 'mtgGuestMoreDo(\'float\')', icon: IC.pip, on: floating,
                   lbl: floating ? 'Stop floating' : 'Float over other apps' })
          : '')
      + item({ fn: 'mtgGuestMoreDo(\'background\')', icon: IC.blur, on: bgChoice !== 'none',
               lbl: bgChoice !== 'none' ? 'Background · on' : 'Change background' })
      + item({ fn: 'mtgGuestMoreDo(\'devices\')', icon: IC.gear, lbl: 'Camera, mic and speaker' });
  }

  window.mtgGuestMoreDo = function (what) {
    window.mtgGuestCloseMore();
    if (what === 'chat') return window.mtgGuestChatToggle();
    if (what === 'hand') return window.mtgGuestToggleHand();
    if (what === 'float') return window.mtgGuestToggleMini();
    if (what === 'background') return window.mtgGuestToggleBgPanel();
    if (what === 'devices') return window.mtgGuestToggleDevPanel();
  };

  function renderBgPanel() {
    var p = gQ('mtgGuestBgPanel');
    if (!p) return;
    p.classList.toggle('show', bgOpen);
    if (!bgOpen) { p.innerHTML = ''; return; }
    var lib = bgLibrary();
    p.innerHTML = '<div class="mtg-bg-title">Background</div>'
      + '<div class="mtg-bg-grid">'
        + '<button class="mtg-bg-opt' + (bgChoice === 'none' ? ' on' : '') + '" data-onclick="mtgGuestBg(&quot;none&quot;)"><span class="mtg-bg-none">None</span></button>'
        + '<button class="mtg-bg-opt' + (bgChoice === 'blur' ? ' on' : '') + '" data-onclick="mtgGuestBg(&quot;blur&quot;)"><span class="mtg-bg-blur">Blur</span></button>'
        + lib.map(function (b) {
            return '<button class="mtg-bg-opt' + (bgChoice === 'img:' + b.id ? ' on' : '') + '"'
              + ' data-onclick="mtgGuestBg(&quot;img:' + b.id + '&quot;)" title="' + esc(b.name) + '">'
              + '<img src="' + b.data + '" alt="">'
              + '<span class="mtg-bg-x" data-onclick="event.stopPropagation();mtgGuestBgRemove(&quot;' + b.id + '&quot;)">&#10005;</span>'
              + '</button>';
          }).join('')
        + '<label class="mtg-bg-opt mtg-bg-add" title="Upload an image">+'
          + '<input type="file" accept="image/*" data-onchange="mtgGuestBgUpload(this)" hidden></label>'
      + '</div><div class="mtg-bg-note">Stays on your device.</div>';
  }

  function initials(n) {
    var parts = String(n || '?').trim().split(/\s+/);
    return (((parts[0] || '')[0] || '?') + ((parts[1] || '')[0] || '')).toUpperCase();
  }

  /* Same tile grid the host sees, including the guest's OWN tile - they could
     previously see a participants list but never themselves, and a meeting with
     cameras off rendered as one empty black frame. */
  function tiles() {
    var out = [{
      key: 'self',
      name: state.name + ' (you)',
      muted: muted,
      video: videoOn && !!localStream,
      isSelf: true
    }];
    (call && call.remoteParticipants || []).forEach(function (p) {
      if (p.state !== 'Connected') return;
      // Screen shares are a separate stream - see the note in meetings.js.
      var cam = (p.videoStreams || []).filter(function (v) {
        return v.isAvailable && v.mediaStreamType !== 'ScreenSharing';
      });
      out.push({
        key: (p.identifier && p.identifier.communicationUserId) || String(Math.random()).slice(2),
        name: p.displayName || 'Participant',
        muted: !!p.isMuted,
        video: cam.length > 0,
        stream: cam[0]
      });
    });
    return out;
  }

  /* The screen being presented - see the note in meetings.js. Guests can't
     share, but they must still see a host's share in its own frame. */
  function screenShare() {
    /* Your OWN share arrives on call.localVideoStreams, not on
       remoteParticipants. Reading only the latter is why a sharer used to see
       nothing while everyone else saw their screen. */
    if (call && call.isScreenSharingOn) {
      var mine = (call.localVideoStreams || []).filter(function (v) {
        return v.mediaStreamType === 'ScreenSharing';
      })[0];
      if (mine) return { key: 'screen_self', name: state.name || 'You', stream: mine, isSelf: true };
    }
    var found = null;
    (call && call.remoteParticipants || []).forEach(function (p) {
      if (found || p.state !== 'Connected') return;
      var sc = (p.videoStreams || []).filter(function (v) {
        return v.isAvailable && v.mediaStreamType === 'ScreenSharing';
      });
      if (sc.length) {
        found = {
          key: 'screen_' + ((p.identifier && p.identifier.communicationUserId) || 'x'),
          name: p.displayName || 'Participant',
          stream: sc[0]
        };
      }
    });
    return found;
  }

  /* A banner that appears when recording starts, then gets out of the way.
     The permanent REC badge is the standing notice; this is the moment of
     change, which is what a person actually needs telling about. */
  function guestRecBar() {
    var stage = document.querySelector('.mtg-guest .mtg-stage');
    if (!stage) return;
    var old = stage.querySelector('.mtg-rec-toastbar');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'mtg-rec-toastbar';
    el.textContent = 'This meeting is being recorded.';
    stage.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 9000);
  }


  function guestChatHtml() {
    var rows = chat.length
      ? chat.map(function (m) {
          var t = new Date(m.at);
          return '<div class="mtg-chat-row"><div class="mtg-chat-who">' + esc(m.name)
            + (m.isGuest ? '' : '<span class="mtg-chat-guest">clinic</span>')
            + '<span class="mtg-chat-at">' + String(t.getHours()).padStart(2, '0') + ':'
            + String(t.getMinutes()).padStart(2, '0') + '</span></div>'
            + '<div class="mtg-chat-body">' + esc(m.body) + '</div></div>';
        }).join('')
      : '<div class="mtg-chat-empty">No messages yet.</div>';
    return '<aside class="mtg-side mtg-guest-chat" id="mtgGuestChat">'
      /* One pane, so one tab. The "Hide" button that used to sit beside it is
         now the collapse handle in the gutter, matching the clinician's room. */
      + '<div class="mtg-side-tabs">'
        + '<button class="mtg-side-tab' + (guestPane === 'chat' ? ' active' : '') + '"'
          + ' data-onclick="mtgGuestSetPane(\'chat\')">Chat</button>'
        + '<button class="mtg-side-tab' + (guestPane === 'transcript' ? ' active' : '') + '"'
          + ' data-onclick="mtgGuestSetPane(\'transcript\')">Transcript</button>'
      + '</div>'
      + (guestPane === 'transcript'
        ? guestTxHtml()
        : '<div class="mtg-chat-list" id="mtgGChatBody">' + rows + '</div>'
          + '<div class="mtg-chat-compose">'
            + '<textarea id="mtgGChatInput" rows="2" placeholder="Message everyone…" '
              + 'data-onkeydown="mtgGuestChatKey(event)" data-oninput="mtgGuestChatKey(event)">' + esc(chatDraft) + '</textarea>'
            + '<button class="btn btn-primary btn-sm" data-onclick="mtgGuestChatSend()">Send</button>'
          + '</div>')
      + '</aside>';
  }

  /* The room's settings, arriving with the transcript. Changing what this
     guest SPEAKS has to cycle the recogniser - it is created with a
     language, so a running one keeps the old model until it is restarted. */
  function guestApplyTranslation(t) {
    if (!t) return;
    var read = t.guestRead || '';
    var speak = t.guestSpeak || 'auto';
    var subs = t.subtitles !== false;
    if (read === txRead && speak === txSpeak && subs === ccOn) return;
    var speakChanged = speak !== txSpeak;
    txRead = read;
    txSpeak = speak;
    ccOn = subs;
    if (speakChanged && txSession && txSession.isRunning()) {
      txSession.stop();
      setTimeout(function () { guestStartTranscript({ silent: true }); }, 400);
    }
    render();
    guestCCPaint();
  }

  /* ---------------- live transcript (guest) ----------------
     Same contract as the staff side: this device transcribes only this
     person's microphone, so who said what is known rather than inferred. */
  var tx = [], txSeq = 0, txSession = null, txState = 'stopped', txError = '', txPartial = '';
  /* Did this person switch the transcript on, and has the leaving copy been
     written? The transcript exists only in memory, so the automatic save on
     exit is what stops it being lost. */
  var txUsed = false, txSaved = false;

  function guestTxToBottom() {
    var b = document.getElementById('mtgGTxBody');
    if (b) b.scrollTop = b.scrollHeight;
  }

  window.mtgGuestSetPane = function (pane) {
    guestPane = pane;
    // The ⋮ menu reaches this directly, so the panel has to open itself -
    // switching tabs on a hidden panel would look like the item did nothing.
    chatOpen = true;
    if (pane === 'chat') chatSeen = chat.length;
    render();
    if (pane === 'transcript') guestTxToBottom(); else guestChatBottom();
  };

  function autoSaveTranscript() { /* does nothing on the guest side */ }

  var txLocales = [];   // auto-detect candidates, published with the token
  var txDetected = '';  // what auto-detect last heard on this microphone
  /* Set by the clinic for the whole meeting. The guest has no toggle: they
     never did, which is exactly why turning subtitles off on the clinic
     side used to leave them running across the patient's screen. */
  var ccOn = true;
  var txRead = '';
  var txSpeak = 'auto';
  // seq -> when the line first went on screen, so a re-render resumes its fade
  // instead of restarting it.
  var ccSeen = new Map();

  function guestTxHtml() {
    var rows = tx.length
      ? tx.map(function (l) {
          var t = new Date(l.at);
          var shown = (txRead && l.tr && l.tr[txRead]) || '';
          return '<div class="mtg-tx-row"><div class="mtg-tx-who">' + esc(l.name || 'Participant')
            + '<span class="mtg-tx-at">' + String(t.getHours()).padStart(2, '0') + ':'
            + String(t.getMinutes()).padStart(2, '0') + '</span></div>'
            + '<div class="mtg-tx-text">' + esc(shown || l.text || '') + '</div>'
            + (shown ? '<div class="mtg-tx-orig">' + esc(l.text || '') + '</div>' : '')
            + '</div>';
        }).join('')
      : '<div class="mtg-chat-empty">Nothing has been said yet.</div>';

    return '<div class="mtg-tx-list" id="mtgGTxBody">' + rows
      + '<div class="mtg-tx-partial" id="mtgGTxPartial"' + (txPartial ? '' : ' data-cs="'+__cs+'display:none"') + '>'
        + esc(txPartial) + '</div>'
    + '</div>';
  }

  /* Subtitles under the clinician's face.
     Only what OTHER people said - this person does not need their own words
     read back to them. Painted straight into the node rather than through
     render(), which would rebuild every video tile several times a second. */
  function guestCCLife(text) {
    return Math.min(9000, Math.max(2800, 1800 + String(text || '').length * 55));
  }

  /* Same behaviour as the clinician's side: append, then let each line fade
     out on its own schedule. Only what OTHER people said - this person does
     not need their own words read back to them. */
  function guestCCPaint() {
    var el = document.getElementById('mtgGuestCC');
    if (!el) return;
    if (!tx.length) ccSeen.clear();
    // Off for the meeting means off here too, and clears what is on screen.
    if (!ccOn) { el.innerHTML = ''; el.style.display = 'none'; return; }
    var me = state.acsUserId || state.guestId;
    var now = Date.now();

    tx.filter(function (l) { return l && l.key !== me; }).slice(-3).forEach(function (l) {
      if (el.querySelector('[data-seq="' + l.seq + '"]')) return;
      var shown = (txRead && l.tr && l.tr[txRead]) || l.text;
      if (!shown) return;
      var first = ccSeen.get(l.seq);
      if (first === undefined) { first = now; ccSeen.set(l.seq, first); }
      var life = guestCCLife(shown);
      var elapsed = now - first;
      if (elapsed >= life) return;
      var d = document.createElement('div');
      d.className = 'mtg-cc-line';
      d.setAttribute('data-seq', l.seq);
      d.style.setProperty('--life', life + 'ms');
      d.style.animationDelay = (-elapsed) + 'ms';
      d.innerHTML = '<b>' + esc(l.name || 'Clinic') + '</b>' + esc(shown);
      d.addEventListener('animationend', function () {
        d.remove();
        if (!el.children.length) el.style.display = 'none';
      });
      el.appendChild(d);
    });

    /* Pruned, never wiped. Clearing this made lines that had already faded
       look unseen again, so they came back on screen. */
    if (ccSeen.size > 400) {
      var keep = {};
      tx.slice(-6).forEach(function (l) { keep[l.seq] = 1; });
      ccSeen.forEach(function (_v, k) { if (!keep[k]) ccSeen.delete(k); });
    }
    el.style.display = el.children.length ? '' : 'none';
  }

  function guestStartTranscript() {
    // Only with the consent given on the join screen (the server refuses too).
    if (!state.transcriptConsent) return;
    if (txSession && txSession.isRunning()) return;
    if (!window.mtgTranscript || !state.guestId) return;
    txError = '';
    /* Every start builds a NEW session, so the previous one has to be let go
       rather than merely stopped - otherwise its keep-alive watchdog and its
       window listeners outlive it, and a meeting with a few language changes
       accumulates one set per change. */
    try { if (txSession) txSession.dispose(); } catch (e) {}
    txSession = window.mtgTranscript.createSession({
      fetchToken: function () {
        return api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/transcribe/token')
          .then(function (r) {
            if (!r.ok) { var e = new Error((r.j && r.j.error) || 'No token'); e.status = 503; throw e; }
            if (r.j && r.j.locales && r.j.locales.length) txLocales = r.j.locales;
            return r.j;
          });
      },
      postLine: function (text, detected) {
        api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/transcript', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, lang: detected || '' })
        }).then(loadGuestChat).catch(function () {});
      },
      /* A patient gets no language controls at all - they join from a link on
         a phone, often in a hurry. The recogniser works out what they are
         speaking from the practice's shortlist instead. */
      language: function () { return txSpeak; },
      autoDetect: function () { return txLocales.length > 1 ? txLocales : ['en-US', 'es-MX', 'fil-PH', 'ko-KR']; },
      /* The whole point: what they were heard speaking becomes what they are
         shown reading. No menu, no explaining, nothing for a patient to get
         wrong on a phone in a waiting room. */
      muted: function () { return muted; },
      /* Reported so each phrase is translated FROM the right language.
         It no longer decides what this guest READS - the clinic sets
         that for the whole meeting - so there is nothing to seed. */
      onLanguage: function (lang) { txDetected = lang || ''; },
      micId: function () {
        try { return deviceMgr && deviceMgr.selectedMicrophone && deviceMgr.selectedMicrophone.id; }
        catch (e) { return ''; }
      },
      onState: function (s, detail) {
        txState = s;
        if (s === 'error') txError = detail || 'Transcript stopped.';
        render();
      },
      onPartial: function (text) {
        txPartial = text || '';
        // Painted directly - a render per interim word would rebuild every tile.
        var el = document.getElementById('mtgGTxPartial');
        if (el) { el.textContent = txPartial; el.style.display = txPartial ? '' : 'none'; }
        var pg = document.getElementById('mtgGTxPartial');
        if (pg) { pg.textContent = txPartial; pg.style.display = txPartial ? '' : 'none'; }
        guestTxToBottom();
      }
    });
    txUsed = true;
    txSession.start();
    // No pane to open, and nothing to show - the guest sees no change at all.
    render();
  }

  // guestTxHtml lived here. The guest has no transcript panel any more.

  function guestTxToBottom() {
    var b = document.getElementById('mtgGTxBody');
    if (b) b.scrollTop = b.scrollHeight;
  }


  // guestTxHtml lived here too. The guest has no transcript panel any more.


  window.mtgGuestChatToggle = function () {
    chatOpen = !chatOpen;
    if (chatOpen) chatSeen = chat.length;
    render();
    if (chatOpen) { var i = gQ('mtgGChatInput'); if (i) i.focus(); guestChatBottom(); }
  };
  function guestChatBottom() {
    var b = gQ('mtgGChatBody');
    if (b) b.scrollTop = b.scrollHeight;
  }
  window.mtgGuestChatKey = function (ev) {
    chatDraft = ev.target.value;
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); window.mtgGuestChatSend(); }
  };
  window.mtgGuestChatSend = function () {
    var i = gQ('mtgGChatInput');
    var body = (i && i.value || '').trim();
    if (!body) return;
    i.value = ''; chatDraft = '';
    api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body })
    }).then(function () { loadGuestChat(); })
      .catch(function () { if (i) { i.value = body; chatDraft = body; } });
  };
  /* One at a time. The 4-second poll, sending a chat line and posting a
     transcript phrase all call this, so several were in flight at once - every
     one of them a request against the guest rate limit for no added
     information. A trailing call catches whatever landed meanwhile. */
  var guestChatLoading = false, guestChatQueued = false;

  function loadGuestChat() {
    if (!state.guestId) return;
    if (guestChatLoading) { guestChatQueued = true; return; }
    guestChatLoading = true;
    api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/chat?since=' + txSeq)
      .then(function (r) {
        /* Removed from the room by the clinic. Checked before the !r.ok bail
           because the removal arrives as a 403 - the poll would otherwise
           swallow it silently and leave them sitting in a call they are no
           longer part of. */
        if (!r.ok && r.j && r.j.removed) { guestRoomClosed('removed'); return; }
        if (!r.ok) return;
        // The clinic's language settings for this meeting, followed as given.
        if (r.j && r.j.translation) guestApplyTranslation(r.j.translation);
        /* The host closed the room. Ending a meeting does not hang up the ACS
           call, and a guest stops polling their join-state the moment they are
           admitted - so without this they sat in a call nobody else was in.
           This is the only signal they get, so act on it immediately. */
        if (r.j && (r.j.meetingStatus === 'ended' || r.j.meetingStatus === 'cancelled')) {
          guestRoomClosed();
          return;
        }
        var before = chat.length;
        var txBefore = tx.length;
        chat = (r.j && r.j.messages) || [];
        /* Only the transcript lines we lacked come back, so append. If the
           server's counter has gone backwards it restarted and lost the room
           ours is then ahead of anything it will send, so start over or we
           would never see another line. */
        /* Append by sequence number, never by concat. The 4-second poll and the
           load fired after posting a phrase overlap constantly, and both carry
           the same `since` - so a plain concat added the same lines twice.
           Guarding on seq makes the append idempotent. */
        var newTx = (r.j && r.j.transcript) || [];
        if (newTx.length) {
          newTx.forEach(function (line) {
            if (line.seq > txSeq) { tx.push(line); txSeq = line.seq; }
          });
          guestCCPaint();
          // The panel is a live view, not a snapshot taken when it opened.
          /* Not while a dropdown is open: re-rendering replaces the <select>
             and closes it out from under them. Lines arrive every few seconds
             during a conversation, so without this a patient could not change
             their language while anyone was talking. */
          var af = document.activeElement;
          if (chatOpen && guestPane === 'transcript' && !(af && af.tagName === 'SELECT')) {
            render(); guestTxToBottom();
          }
        }
        else if (r.j && typeof r.j.transcriptSeq === 'number' && r.j.transcriptSeq < txSeq) { tx = []; txSeq = 0; }
        /* Raised hands and any name the host corrected ride along on this same
           response - a guest has no WebSocket, and a second poll purely for
           these would double the request rate for no benefit. */
        var prevHands = hands.map(function (h) { return h.key; }).join(',');
        var prevNames = JSON.stringify(names);
        hands = (r.j && r.j.hands) || [];
        names = (r.j && r.j.names) || {};
        if (chatOpen) chatSeen = chat.length;
        var changed = chat.length !== before
          || tx.length !== txBefore
          || hands.map(function (h) { return h.key; }).join(',') !== prevHands
          || JSON.stringify(names) !== prevNames;
        if (changed) {
          render();
          if (guestPane === 'transcript') guestTxToBottom(); else guestChatBottom();
        }
      }).catch(function () {})
      .then(function () {
        guestChatLoading = false;
        if (guestChatQueued) { guestChatQueued = false; loadGuestChat(); }
      });
  }

  var miniWin = null;
  window.mtgGuestMiniOpen = function () { return !!(miniWin && !miniWin.closed); };

  function gStopFloating() {
    if (!miniWin || miniWin.closed) return;
    var el = guestOverlayEl;
    if (el) { document.body.appendChild(el); guestOverlayEl = el; el.className = 'mtg-guest'; }
    try { miniWin.close(); } catch (e) {}
    miniWin = null;
  }

  window.mtgGuestToggleMini = async function () {
    if (window.mtgGuestMiniOpen()) { try { miniWin.close(); } catch (e) {} return; }
    if (!window.documentPictureInPicture) return;   // menu item is hidden in this case; nothing to fall back to
    var el = gOverlay();
    if (!el) return;
    try {
      var pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 260 });
      miniWin = pip;

      // A blank document inherits no styles at all.
      Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"], style'), function (node) {
        pip.document.head.appendChild(node.cloneNode(true));
      });
      pip.document.documentElement.setAttribute('data-theme',
        document.documentElement.getAttribute('data-theme') || '');
      pip.document.body.className = 'mtg-mini-body';

      // Inline onclick markup resolves against the POP-OUT window's globals,
      // not this one - without this every control inside it is a no-op.
      Object.keys(window).forEach(function (k) {
        if (/^(mtg|ctg)/.test(k) && typeof window[k] === 'function') {
          try { pip[k] = window[k]; } catch (e) {}
        }
      });
      pip.showToast = window.showToast;

      pip.document.body.appendChild(el);      // the move
      guestOverlayEl = el;
      // Reuses the staff .mtg-call.mini rules wholesale (mic/camera/share/
      // leave only, compact header, side panel and menu hidden) rather than
      // duplicating that whole ruleset under a second selector.
      el.className = 'mtg-guest incall mtg-call mini';

      // Closing the window - by its own X, or the browser - has to put the
      // meeting back, or the call is still connected with its entire UI
      // sitting inside a document that no longer exists.
      pip.addEventListener('pagehide', function () {
        miniWin = null;
        if (el) {
          document.body.appendChild(el);
          guestOverlayEl = el;
          if (state.phase === 'incall') {
            el.className = 'mtg-guest incall';
            render();
            var g = document.getElementById('mtgGuestGrid');
            if (g && window.mtgFitGrid) window.mtgFitGrid(g);
          }
          // Call already ended while floating: render() already drew the
          // goodbye screen and reset the class before this fired - the move
          // back is all that is left to do.
        }
      });

      render();
      setTimeout(function () {
        var g = pip.document.getElementById('mtgGuestGrid');
        if (g && window.mtgFitGrid) window.mtgFitGrid(g);
      }, 200);
    } catch (e) {
      miniWin = null;
      guestNotice('Could not open the floating window: ' + ((e && e.message) || 'unknown'), 'Floating window');
    }
  };

  var guestAutoFloated = false;

  function gArmAutoFloat() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setActionHandler) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: (state.meeting && state.meeting.title) || 'Meeting',
        artist: 'Concussion Therapy Group'
      });
    } catch (e) { /* metadata is a nicety */ }
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', function () {
        if (state.phase !== 'incall' || window.mtgGuestMiniOpen()) return;
        guestAutoFloated = true;
        window.mtgGuestToggleMini();
      });
    } catch (e) {
      /* Older Chrome does not know this action - "Float over other apps" in
         the ⋮ menu still works, there is just nothing automatic. */
    }
  }

  function gDisarmAutoFloat() {
    try { navigator.mediaSession.setActionHandler('enterpictureinpicture', null); } catch (e) {}
    try { navigator.mediaSession.metadata = null; } catch (e) {}
    guestAutoFloated = false;
  }

  // Coming back to the tab puts the meeting inline again - but only if it
  // floated on its own. A window opened stays where it was put.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (guestAutoFloated && window.mtgGuestMiniOpen()) {
      guestAutoFloated = false;
      try { miniWin.close(); } catch (e) {}
    }
  });

  window.mtgGuestToggleHand = function () {
    if (!state.guestId) return;
    var mine = myHandUp();
    api('/guest/' + encodeURIComponent(TOKEN) + '/' + encodeURIComponent(state.guestId) + '/hand', {
      // express.json() only parses when this header is present; without it the
      // body arrives undefined and the hand silently never goes up.
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: !mine })
    })
      .then(function (r) {
        if (!r.ok) { guestNotice('Could not change your raised hand.', 'Raise hand'); return; }
        hands = (r.j && r.j.hands) || [];
        render();
      }).catch(function () { guestNotice('Could not change your raised hand.', 'Raise hand'); });
  };

  function renderCall() {
    var el = host();
    el.className = 'mtg-guest incall' + (window.mtgGuestMiniOpen && window.mtgGuestMiniOpen() ? ' mtg-call mini' : '');
    var list = tiles();
    var screen = screenShare();
    var sharing = !!(call && call.isScreenSharingOn);
    var tileHtml = function (t) {
      var rk = roomKey(t);
      var nm = label(rk, t.name);
      return '<div class="mtg-tile' + (handUp(rk) ? ' handup' : '') + '">'
        + '<div class="mtg-tile-video" id="mtgGV_' + esc(t.key) + '"></div>'
        + (t.video ? '' : '<div class="mtg-tile-avatar">' + esc(initials(nm)) + '</div>')
        + (handUp(rk) ? '<div class="mtg-tile-hand" title="Hand raised">' + IC.hand + '</div>' : '')
        + '<div class="mtg-tile-bar"><span class="mtg-tile-name">' + esc(nm) + '</span>'
        + (t.muted ? '<span class="mtg-tile-mic">' + IC.micOff + '</span>' : '')
        + '</div></div>';
    };

    el.innerHTML = '<div class="mtg-call-inner"><div class="mtg-stage">'
      + '<div class="mtg-stage-head">'
      /* Elapsed time before the name, matching the clinician's side. */
      + '<div class="mtg-stage-id">'
        + '<span class="mtg-stage-timer" id="mtgGuestTimer">00:00</span>'
        + '<span class="mtg-stage-div"></span>'
        + '<span class="mtg-stage-name">' + esc(state.meeting.title) + '</span>'
      + '</div>'
      + (beingRecorded ? '<span class="mtg-rec-dot" title="This meeting is being recorded">REC</span>' : '')
      /* The transcript panel is gone from this side, but the fact of it is
         not. Notice is what makes transcription lawful in an all-party
         consent state - it costs one line and removes the only real objection
         to running it automatically. */
      + (txState === 'listening'
          ? '<span class="mtg-stage-note" title="Your words are written down for the clinical record">Transcribed</span>'
          : '')
      + '<span class="mtg-stage-clock" id="mtgGuestClock">' + esc(guestWallClock()) + '</span></div>'
      + (screen
          ? '<div class="mtg-present">'
              + '<div class="mtg-present-main">'
                + '<div class="mtg-tile-video" id="mtgGV_' + esc(screen.key) + '"></div>'
                + '<div class="mtg-tile-bar"><span class="mtg-tile-name">'
                + esc(screen.name) + ' is presenting</span></div>'
              + '</div>'
              + '<div class="mtg-present-strip">' + list.map(tileHtml).join('') + '</div>'
            + '</div>'
          : '<div class="mtg-grid" id="mtgGuestGrid">' + list.map(tileHtml).join('') + '</div>')
      + '<div class="mtg-cc" id="mtgGuestCC" aria-live="polite" data-cs="'+__cs+'display:none"></div>'
      + '<div class="mtg-rail" role="toolbar" aria-label="Meeting controls">'
        + grbtn({ fn: 'mtgGuestMute()', cls: 'mtg-rbtn-primary' + (muted ? ' off' : ''),
                  icon: muted ? IC.micOff : IC.mic, busy: busy.mic,
                  lbl: muted ? 'Unmute yourself' : 'Mute yourself' })
        + grbtn({ fn: 'mtgGuestVideo()', cls: 'mtg-rbtn-primary' + (videoOn ? '' : ' off'),
                  icon: videoOn ? IC.cam : IC.camOff, busy: busy.video,
                  lbl: videoOn ? 'Turn camera off' : 'Turn camera on' })
        + grbtn({ fn: 'mtgGuestShare()', on: sharing, icon: IC.screen,
                  lbl: sharing ? 'Stop sharing' : 'Share screen' })
        + grbtn({ fn: 'mtgGuestToggleMore(event)', id: 'mtgGuestMoreBtn', cls: 'mtg-rbtn-more',
                  lbl: 'More options',
                  icon: IC.more + (chat.length > chatSeen || myHandUp() ? '<i class="mtg-rbtn-dot"></i>' : '') })
        + grbtn({ fn: 'mtgGuestLeave()', cls: 'mtg-hang', icon: IC.hang, lbl: 'Leave the meeting' })
      + '</div>'
      + '<div class="mtg-menu" id="mtgGuestMoreMenu" role="menu" aria-label="More options"></div>'
      + '<div class="mtg-bg-panel" id="mtgGuestBgPanel"></div>'
      + '<div class="mtg-bg-panel mtg-dev-panel" id="mtgGuestDevPanel"></div>'
      + '</div>'
      /* The same collapse handle the clinician has. This used to be a tab
         labelled "Hide" sitting beside "Chat" - it looked like a third pane
         and read as clutter in a panel that only has one. One slim handle in
         the gutter matches the host's room and says what it does on hover. */
      + '<button class="mtg-side-grip' + (chatOpen ? '' : ' collapsed') + '"'
        + ' data-onclick="mtgGuestChatToggle()" aria-controls="mtgGuestChat"'
        + ' aria-expanded="' + (chatOpen ? 'true' : 'false') + '"'
        + ' data-lbl="' + (chatOpen ? 'Hide chat' : 'Show chat') + '"'
        + ' aria-label="' + (chatOpen ? 'Hide chat' : 'Show chat') + '"'
        + ' title="' + (chatOpen ? 'Hide chat' : 'Show chat') + '">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"'
          + ' stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
        + (!chatOpen && chat.length > chatSeen
            ? '<i class="mtg-side-grip-dot">' + (chat.length - chatSeen) + '</i>' : '')
      + '</button>'
      + (chatOpen ? guestChatHtml() : '')
      + '</div>';
    guestCCPaint();

    // Same 16:9 measured layout the host uses, so a guest sees the meeting
    // laid out identically instead of in stretched columns. Observed as well as
    // fitted, so opening the chat panel re-sizes the tiles the way it does for
    // the host rather than leaving them stale until the window changes.
    var guestGrid = gQ('mtgGuestGrid');
    if (window.mtgFitGrid) window.mtgFitGrid(guestGrid);
    if (window.mtgObserveGrid) window.mtgObserveGrid(guestGrid);
    renderBgPanel();
    // renderCall() rebuilds the overlay, so an open device panel has to be
    // redrawn too or it silently disappears whenever anyone joins or leaves.
    renderDevPanel();
    renderMore();
    scheduleHandExpiry();
    // Tiles were just rebuilt, so the speaking marks went with them.
    paintSpeaking();
    attachTiles(screen ? list.concat([{ key: screen.key, video: true, stream: screen.stream }]) : list);
  }

  function attachTiles(list) {
    list.forEach(function (t) {
      var box = gQ('mtgGV_' + t.key);
      if (!box || !t.video) return;
      try {
        if (t.isSelf) {
          if (!localView) {
            localRenderer = new window.ACS.Calling.VideoStreamRenderer(localStream);
            localRenderer.createView({ scalingMode: 'Crop' }).then(function (v) {
              localView = v;
              var b = gQ('mtgGV_self');
              if (b) { b.appendChild(v.target); resume(); }
            });
            return;
          }
          box.innerHTML = '';
          box.appendChild(localView.target);
        } else {
          if (!remoteViews[t.key]) {
            var rr = new window.ACS.Calling.VideoStreamRenderer(t.stream);
            var key = t.key;
            rr.createView({ scalingMode: 'Crop' }).then(function (v) {
              remoteViews[key] = { renderer: rr, view: v };
              var b = gQ('mtgGV_' + key);
              if (b) { b.appendChild(v.target); resume(); }
            });
            return;
          }
          box.innerHTML = '';
          box.appendChild(remoteViews[t.key].view.target);
        }
      } catch (e) { /* stream ended between render and mount */ }
    });
    resume();
  }

  // Moving a <video> between parents pauses it in Chromium, and a paused video
  // paints black.
  function resume() {
    document.querySelectorAll('.mtg-guest video').forEach(function (v) {
      v.autoplay = true; v.playsInline = true; v.muted = true;
      if (v.paused) { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
    });
  }

  /* ---------- boot ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    render();
    api('/guest/' + encodeURIComponent(TOKEN)).then(function (r) {
      if (!r.ok) { state.phase = 'error'; state.error = (r.j && r.j.error) || 'This meeting link is not valid.'; render(); return; }
      state.meeting = r.j.meeting;
      /* Known before the name box is even filled in, so someone who does not
         want to be recorded can walk away rather than discovering it once they
         are already in the room. */
      beingRecorded = !!r.j.meeting.recording;
      state.phase = 'name';
      render();
    }).catch(function () {
      state.phase = 'error';
      state.error = 'Could not reach the clinic. Please check your connection.';
      render();
    });
  });
})();
