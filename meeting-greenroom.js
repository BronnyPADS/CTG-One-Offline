(function () {
  'use strict';

  var PREF_KEY = 'ctg_meeting_devices';

  var SVG = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="M15 10.5V5a3 3 0 0 0-5.9-.8"/><path d="M19 10v2a7 7 0 0 1-.9 3.4"/><path d="M5 10v2a7 7 0 0 0 10.6 6"/><path d="M12 19v3"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1l22 22"/><path d="M16 16v2a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3l7-4v10"/></svg>'
  };

  var st = {
    stream: null,          // the raw preview stream
    audioCtx: null, analyser: null, meterRaf: 0,
    cams: [], mics: [], spks: [],
    camId: '', camLabel: '', micId: '', micLabel: '', spkId: '', spkLabel: '',
    camOn: true, micOn: true,
    denied: '',            // permission / hardware error text, if any
    cfg: null,
    mounted: false,
    /* The ACS preview path. Video effects are a feature of the
       LocalVideoStream, not of a call - so a green room can run the real blur
       or background image with no calling token at all, which is what lets a
       guest see their background before anyone admits them. */
    acsClient: null, acsDevices: null, acsStream: null, acsRenderer: null, acsView: null,
    effectsBusy: false
  };

  var spokenAlready = false;
  window.mtgAnnounceRecording = function (force) {
    if (spokenAlready && !force) return;
    spokenAlready = true;
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      var u = new SpeechSynthesisUtterance('This meeting is being recorded.');
      u.rate = 0.95; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* the written warning carries it */ }
  };
  window.mtgResetAnnouncement = function () { spokenAlready = false; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The effects bundle is several megabytes of ML models, so it is fetched
     only when a background is actually chosen. Shared with the in-call path
     they must be the same module instance or startEffects silently does
     nothing. */
  var effectsLoading = null;
  function loadEffects() {
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

  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      st.camId = p.camId || ''; st.camLabel = p.camLabel || '';
      st.micId = p.micId || ''; st.micLabel = p.micLabel || '';
      st.spkId = p.spkId || ''; st.spkLabel = p.spkLabel || '';
      // Default both ON: people expect a meeting to behave like a meeting.
      st.camOn = p.camOn !== false;
      st.micOn = p.micOn !== false;
    } catch (e) { /* first run */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        camId: st.camId, camLabel: st.camLabel,
        micId: st.micId, micLabel: st.micLabel,
        spkId: st.spkId, spkLabel: st.spkLabel,
        camOn: st.camOn, micOn: st.micOn
      }));
    } catch (e) { /* private mode - the session still works, just isn't remembered */ }
  }

  /* Device labels are blank until permission has been granted once, so the
     preview stream is started first and the list read after. */
  function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function (ds) {
      st.cams = ds.filter(function (d) { return d.kind === 'videoinput'; });
      st.mics = ds.filter(function (d) { return d.kind === 'audioinput'; });
      st.spks = ds.filter(function (d) { return d.kind === 'audiooutput'; });
      var has = function (arr, id) { return arr.some(function (d) { return d.deviceId === id; }); };
      // A remembered device that has since been unplugged must not stick.
      if (!has(st.cams, st.camId)) { st.camId = (st.cams[0] || {}).deviceId || ''; st.camLabel = (st.cams[0] || {}).label || ''; }
      if (!has(st.mics, st.micId)) { st.micId = (st.mics[0] || {}).deviceId || ''; st.micLabel = (st.mics[0] || {}).label || ''; }
      if (!has(st.spks, st.spkId)) { st.spkId = (st.spks[0] || {}).deviceId || ''; st.spkLabel = (st.spks[0] || {}).label || ''; }
    }).catch(function () {});
  }

  /* Build (or rebuild) the ACS-backed video preview. Returns false if ACS is
     not available, in which case the caller falls back to plain getUserMedia
     and the background picker says the effect will apply on entry instead. */
  async function acsPreview() {
    if (!window.ACS || !window.ACS.Calling) return false;
    try {
      if (!st.acsClient) st.acsClient = new window.ACS.Calling.CallClient();
      if (!st.acsDevices) {
        st.acsDevices = await st.acsClient.getDeviceManager();
        try { await st.acsDevices.askDevicePermission({ audio: true, video: true }); } catch (e) {}
      }
      var cams = await st.acsDevices.getCameras();
      if (!cams || !cams.length) return false;
      var dev = pickDevice(cams, st.camId, st.camLabel);

      await disposeAcsView();
      st.acsStream = new window.ACS.Calling.LocalVideoStream(dev);
      st.acsRenderer = new window.ACS.Calling.VideoStreamRenderer(st.acsStream);
      st.acsView = await st.acsRenderer.createView({ scalingMode: 'Crop' });

      var box = document.getElementById('mtgGrAcs');
      if (!box) return false;
      box.innerHTML = '';
      box.appendChild(st.acsView.target);
      resumeVideos(box);
      return true;
    } catch (e) {
      await disposeAcsView();
      return false;
    }
  }

  async function disposeAcsView() {
    try { if (st.acsRenderer) st.acsRenderer.dispose(); } catch (e) {}
    st.acsRenderer = null; st.acsView = null;
    try { if (st.acsStream && st.acsStream.dispose) st.acsStream.dispose(); } catch (e) {}
    st.acsStream = null;
    var box = document.getElementById('mtgGrAcs');
    if (box) box.innerHTML = '';
  }

  /* Moving a <video> between parents pauses it in Chromium, and a paused video
     paints black - the same trap the in-call self view hit. */
  function resumeVideos(scope) {
    (scope || document).querySelectorAll('video').forEach(function (v) {
      v.autoplay = true; v.playsInline = true; v.muted = true;
      if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
    });
  }

  function pickDevice(list, id, label) {
    if (!list || !list.length) return null;
    var byId = list.filter(function (d) { return d.id === id || (id && String(d.id).indexOf(id) >= 0); })[0];
    if (byId) return byId;
    var byName = label && list.filter(function (d) { return d.name === label; })[0];
    return byName || list[0];
  }

  /* Run the chosen effect on the preview stream, for real. */
  async function applyEffectLive(choice) {
    if (!st.acsStream) return false;
    if (choice !== 'none' && !(await loadEffects())) return false;
    var feature;
    try { feature = st.acsStream.feature(window.ACS.Calling.Features.VideoEffects); }
    catch (e) { st.effectNote = 'Background effects are not available in this browser.'; return false; }

    /* startEffects() resolving only means the request was accepted - the SDK
       reports real failures on this event, asynchronously. Without it a failed
       effect is completely silent, which is indistinguishable from the feature
       being broken. */
    if (!feature.__ctgGrWired) {
      feature.__ctgGrWired = true;
      feature.on('effectsError', function (err) {
        var reason = (err && (err.reason || err.message)) || 'unknown reason';
        st.effectNote = 'Background could not be applied: ' + reason;
        window.__ctgGrEffectError = reason;
        console.error('green room video effect error', err);
        renderControls();
      });
      feature.on('effectsStarted', function () {
        st.effectNote = '';
        rebuildAcsView().then(function () { renderControls(); });
      });
    }

    /* Wait for the previous effect to actually stop. stopEffects() resolves
       before teardown finishes, and starting into that gap gets dropped
       which is why a second background choice kept showing the first. */
    try {
      var stopped = new Promise(function (resolve) {
        var done = false;
        var fin = function () { if (!done) { done = true; resolve(); } };
        try { feature.on('effectsStopped', fin); } catch (e) {}
        setTimeout(fin, 2000);
      });
      await feature.stopEffects();
      await stopped;
    } catch (e) { /* nothing running */ }
    if (choice === 'none') { st.effectNote = ''; await rebuildAcsView(); return true; }

    try {
      // isSupported is a property on some SDK builds and a method on others.
      try {
        if (typeof feature.isSupported === 'function') {
          var ok = await feature.isSupported(new window.ACSEffects.BackgroundBlurEffect());
          if (!ok) {
            st.effectNote = 'This device or browser cannot run background effects. '
              + 'They need a recent Chrome or Edge on desktop.';
            return false;
          }
        }
      } catch (e) { /* treat an unanswerable check as supported */ }

      if (choice === 'blur') {
        await feature.startEffects(new window.ACSEffects.BackgroundBlurEffect());
      } else if (choice.indexOf('img:') === 0) {
        var bg = st.cfg && st.cfg.bg;
        var item = bg ? (bg.list() || []).filter(function (b) { return b.id === choice.slice(4); })[0] : null;
        // ACS fetches the picture over HTTP; blob: and data: are rejected.
        if (!item || !item.url) return false;
        await feature.startEffects(new window.ACSEffects.BackgroundReplacementEffect({
          backgroundImageUrl: location.origin + item.url
        }));
      }
    } catch (e) { return false; }

    /* The view was created before the effect existed, so it keeps painting the
       raw camera. Rebuild it or the preview lies about what is running. */
    await rebuildAcsView();
    return true;
  }

  async function rebuildAcsView() {
    if (!st.acsStream) return;
    var old = st.acsRenderer;
    try {
      var renderer = new window.ACS.Calling.VideoStreamRenderer(st.acsStream);
      var view = await renderer.createView({ scalingMode: 'Crop' });
      var box = document.getElementById('mtgGrAcs');
      if (!box) { try { renderer.dispose(); } catch (e) {} return; }
      box.innerHTML = '';
      box.appendChild(view.target);
      st.acsRenderer = renderer; st.acsView = view;
      resumeVideos(box);
      try { if (old) old.dispose(); } catch (e) {}
    } catch (e) { /* keep whatever is on screen */ }
  }

  function stopStream() {
    stopMeter();
    if (st.stream) {
      st.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      st.stream = null;
    }
  }

  /* (Re)open the preview with the currently chosen devices. */
  function openPreview() {
    stopStream();
    if (!st.camOn && !st.micOn) { paintPreview(); return Promise.resolve(); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      st.denied = 'This browser cannot open a camera or microphone.';
      paintPreview(); return Promise.resolve();
    }
    var want = {
      video: st.camOn ? (st.camId ? { deviceId: { exact: st.camId } } : true) : false,
      audio: st.micOn ? (st.micId ? { deviceId: { exact: st.micId } } : true) : false
    };
    return navigator.mediaDevices.getUserMedia(want).then(function (s) {
      st.stream = s; st.denied = '';
      return listDevices();
    }).catch(function (e) {
      // An exact deviceId that the OS has taken away throws; fall back rather
      // than leaving the person with a dead preview and no explanation.
      if (/OverconstrainedError|NotFound/i.test((e && e.name) || '')) {
        st.camId = ''; st.micId = '';
        return navigator.mediaDevices.getUserMedia({ video: st.camOn, audio: st.micOn })
          .then(function (s) { st.stream = s; st.denied = ''; return listDevices(); })
          .catch(function (e2) { st.denied = friendly(e2); });
      }
      st.denied = friendly(e);
    }).then(function () {
      if (st.camOn && st.stream) {
        st.stream.getVideoTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      }
      var acsPromise = st.camOn ? acsPreview() : Promise.resolve(false);
      return acsPromise.then(function (usingAcs) {
        st.usingAcs = !!usingAcs;
        if (usingAcs) {
          var bg = st.cfg && st.cfg.bg;
          var choice = bg ? bg.get() : 'none';
          if (choice && choice !== 'none') applyEffectLive(choice);
        } else if (st.camOn) {
          /* ACS could not take the camera. Reopen the plain preview so there is
             still a picture, and say why the background cannot be shown here
             rather than leaving a picker that appears to do nothing. */
          st.effectNote = 'Live background preview is not available on this device, '
            + 'but your choice is applied when you join.';
          return navigator.mediaDevices.getUserMedia({
            video: st.camId ? { deviceId: { exact: st.camId } } : true, audio: false
          }).then(function (vs) {
            if (st.stream) { vs.getVideoTracks().forEach(function (t) { st.stream.addTrack(t); }); }
            else { st.stream = vs; }
          }).catch(function () {}).then(function () {
            paintPreview(); startMeter(); renderControls();
          });
        }
        paintPreview();
        startMeter();
        renderControls();
      });
    });
  }

  function friendly(e) {
    var n = (e && e.name) || '';
    if (/NotAllowed|Permission/i.test(n)) return 'Camera and microphone are blocked. Allow them in your browser’s address bar, then press Retry.';
    if (/NotFound|Overconstrained/i.test(n)) return 'No camera or microphone was found on this device.';
    if (/NotReadable|TrackStart/i.test(n)) return 'Your camera or microphone is being used by another app. Close it and press Retry.';
    return 'Could not open your camera or microphone.';
  }

  function paintPreview() {
    var v = document.getElementById('mtgGrVideo');
    var off = document.getElementById('mtgGrOff');
    if (!v) return;
    var acsBox = document.getElementById('mtgGrAcs');
    var acsLive = !!(st.usingAcs && st.camOn && acsBox && acsBox.querySelector('video'));
    if (acsBox) acsBox.style.display = acsLive ? 'block' : 'none';
    var live = acsLive
      || !!(st.stream && st.camOn && st.stream.getVideoTracks().length);
    if (live && !acsLive) {
      if (v.srcObject !== st.stream) v.srcObject = st.stream;
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    } else {
      v.srcObject = null;
    }
    v.style.display = (live && !acsLive) ? 'block' : 'none';
    if (off) {
      off.style.display = live ? 'none' : 'flex';
      off.innerHTML = st.denied
        ? '<span class="mtg-gr-warn">' + esc(st.denied) + '</span>'
        : '<span>Camera is off</span>';
    }
  }

  /* A level meter is the only thing that actually proves a microphone works
     a device name in a dropdown proves nothing. */
  function startMeter() {
    stopMeter();
    if (!st.stream || !st.micOn || !st.stream.getAudioTracks().length) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      st.audioCtx = new AC();
      var src = st.audioCtx.createMediaStreamSource(st.stream);
      st.analyser = st.audioCtx.createAnalyser();
      st.analyser.fftSize = 512;
      src.connect(st.analyser);
    } catch (e) { return; }
    var buf = new Uint8Array(st.analyser.fftSize);
    var tick = function () {
      if (!st.analyser) return;
      st.analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) { var d = (buf[i] - 128) / 128; sum += d * d; }
      var rms = Math.sqrt(sum / buf.length);
      var bars = document.querySelectorAll('#mtgGrMeter i');
      var lit = Math.min(bars.length, Math.round(rms * 34));
      for (var b = 0; b < bars.length; b++) bars[b].className = b < lit ? 'on' : '';
      st.meterRaf = requestAnimationFrame(tick);
    };
    st.meterRaf = requestAnimationFrame(tick);
  }
  function stopMeter() {
    if (st.meterRaf) cancelAnimationFrame(st.meterRaf);
    st.meterRaf = 0; st.analyser = null;
    if (st.audioCtx) { try { st.audioCtx.close(); } catch (e) {} st.audioCtx = null; }
    var bars = document.querySelectorAll('#mtgGrMeter i');
    for (var b = 0; b < bars.length; b++) bars[b].className = '';
  }

  function selectHtml(id, list, chosen, empty) {
    if (!list.length) return '<select id="' + id + '" disabled><option>' + esc(empty) + '</option></select>';
    return '<select id="' + id + '" data-onchange="mtgGrPick(\'' + id + '\',this.value)">'
      + list.map(function (d, i) {
          return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === chosen ? ' selected' : '') + '>'
            + esc(d.label || ('Device ' + (i + 1))) + '</option>';
        }).join('')
      + '</select>';
  }

  /* Only the controls are re-rendered on a change - never the <video>, because
     replacing it would tear down the live preview mid-check. */
  function renderControls() {
    var box = document.getElementById('mtgGrControls');
    if (!box) return;
    box.innerHTML =
        '<label class="mtg-gr-lb">Camera</label>' + selectHtml('mtgGrCam', st.cams, st.camId, 'No camera found')
      + '<label class="mtg-gr-lb">Microphone</label>' + selectHtml('mtgGrMic', st.mics, st.micId, 'No microphone found')
      + '<div class="mtg-gr-meter" id="mtgGrMeter" title="Speak — the bars should move">'
        + new Array(15).join('<i></i>') + '<i></i>'
      + '</div>'
      + (st.spks.length
          ? '<label class="mtg-gr-lb">Speaker</label>' + selectHtml('mtgGrSpk', st.spks, st.spkId, '')
          : '')
      + bgPickerHtml();
    var bm = document.getElementById('mtgGrMicBtn');
    if (bm) { bm.className = 'mtg-gr-btn' + (st.micOn ? '' : ' off'); bm.innerHTML = st.micOn ? SVG.mic : SVG.micOff; }
    var bc = document.getElementById('mtgGrCamBtn');
    if (bc) { bc.className = 'mtg-gr-btn' + (st.camOn ? '' : ' off'); bc.innerHTML = st.camOn ? SVG.cam : SVG.camOff; }
    startMeter();
  }

  function bgPickerHtml() {
    var bg = st.cfg && st.cfg.bg;
    if (!bg) return '';
    var cur = bg.get() || 'none';
    var lib = bg.list() || [];
    var opt = function (choice, inner, title, extra) {
      return '<button type="button" class="mtg-gr-bg' + (cur === choice ? ' on' : '') + '"'
        + ' data-onclick="mtgGrSetBg(\'' + choice + '\')" title="' + esc(title) + '">' + inner + (extra || '') + '</button>';
    };
    return '<label class="mtg-gr-lb">Background</label>'
      + '<div class="mtg-gr-bgs">'
        + opt('none', '<span>None</span>', 'No background effect')
        + opt('blur', '<span class="mtg-gr-bgblur">Blur</span>', 'Blur my room')
        + lib.map(function (b) {
            return opt('img:' + b.id, '<img src="' + b.data + '" alt="">', b.name,
              '<i class="mtg-gr-bgx" data-onclick="event.stopPropagation();mtgGrRmBg(\'' + b.id + '\')">&#10005;</i>');
          }).join('')
        + '<label class="mtg-gr-bg mtg-gr-bgadd" title="Upload an image">+'
          + '<input type="file" accept="image/*" data-onchange="mtgGrUpBg(this)" hidden></label>'
      + '</div>'
      + '<button type="button" class="mtg-gr-why" data-onclick="mtgGrWhy()">Background not working?</button>'
      + '<div class="mtg-gr-bgnote' + (st.effectNote ? ' warn' : '') + '">'
        + (st.effectNote
            ? esc(st.effectNote)
            : (st.usingAcs
                ? 'Shown here exactly as others will see you.'
                : 'Applied the moment your camera starts in the meeting.'))
      + '</div>';
  }

  function repaintBg() {
    var box = document.getElementById('mtgGrControls');
    if (box) renderControls();
  }

  window.mtgGrSetBg = function (choice) {
    var bg = st.cfg && st.cfg.bg; if (!bg) return;
    bg.set(choice);
    repaintBg();
    // Show it for real, straight away, rather than describing it in words.
    if (st.usingAcs && !st.effectsBusy) {
      st.effectsBusy = true;
      var grid = document.querySelector('.mtg-gr-bgs');
      if (grid) grid.classList.add('busy');
      applyEffectLive(choice).then(function (ok) {
        st.effectsBusy = false;
        var g = document.querySelector('.mtg-gr-bgs');
        if (g) g.classList.remove('busy');
        if (!ok && choice !== 'none') {
          var note = document.querySelector('.mtg-gr-bgnote');
          if (note) note.textContent = 'This background could not be previewed here, but it will be '
            + 'applied when your camera starts in the meeting.';
        }
      });
    }
  };
  window.mtgGrRmBg = function (id) {
    var bg = st.cfg && st.cfg.bg; if (!bg || !bg.remove) return;
    bg.remove(id);
    repaintBg();
  };
  window.mtgGrUpBg = function (input) {
    var bg = st.cfg && st.cfg.bg;
    var file = input && input.files && input.files[0];
    input.value = '';
    if (!bg || !bg.upload || !file) return;
    var add = document.querySelector('.mtg-gr-bgadd');
    if (add) add.classList.add('busy');
    bg.upload(file).then(function () { repaintBg(); }, function () { repaintBg(); });
  };

  /* The recording warning, shown before anyone commits to joining. Silence
     when nothing is being recorded is deliberate - a warning that is always
     there is one nobody reads. */
  function paintWarning() {
    var box = document.getElementById('mtgGrWarn');
    if (!box) return;
    if (!st.cfg || !st.cfg.recording) { box.innerHTML = ''; return; }
    if (box.dataset.on === '1') return;         // already showing; don't re-speak
    box.dataset.on = '1';
    box.innerHTML = '<div class="mtg-gr-recwarn">'
      + '<span class="mtg-gr-recwarn-dot"></span>'
      + '<span><strong>This meeting is being recorded.</strong> '
      + 'By joining you are consenting to being recorded. If you do not consent, do not join '
      + 'and contact the clinic instead.</span></div>';
    window.mtgAnnounceRecording();
  }

  function renderAction() {
    var box = document.getElementById('mtgGrAction');
    if (!box || !st.cfg) return;
    var c = st.cfg;
    box.innerHTML =
        (c.status ? '<div class="mtg-gr-status">' + (c.spinner ? '<span class="mtg-gr-spin"></span>' : '') + esc(c.status) + '</div>' : '')
      + (st.denied ? '<button type="button" class="mtg-gr-retry" data-onclick="mtgGrRetry()">Retry camera &amp; microphone</button>' : '')
      + (c.primary ? '<button type="button" class="mtg-gr-go" id="mtgGrGo" data-onclick="mtgGrPrimary()">' + esc(c.primary) + '</button>' : '')
      + (c.secondary ? '<button type="button" class="mtg-gr-cancel" data-onclick="mtgGrSecondary()">' + esc(c.secondary) + '</button>' : '');
  }

  /* ------------------------------------------------------------------ API */

  /* Mount into `el`. Calling it again with new config updates the wording and
     the buttons only - the preview keeps running, which is what lets the guest
     screen move from "ask to join" to "waiting" without the camera blinking. */
  function mount(el, cfg) {
    if (!el) return Promise.resolve();
    st.cfg = cfg || {};
    if (st.mounted && document.getElementById('mtgGrVideo')) {
      var t = document.getElementById('mtgGrTitle'); if (t) t.textContent = st.cfg.title || '';
      var s = document.getElementById('mtgGrSub'); if (s) s.textContent = st.cfg.subtitle || '';
      var nb = document.getElementById('mtgGrNameBox');
      if (nb) nb.style.display = st.cfg.showName ? '' : 'none';
      paintWarning();
      renderAction();
      return Promise.resolve();
    }
    loadPrefs();
    el.innerHTML =
      '<div class="mtg-gr">'
      + '<div class="mtg-gr-stage">'
        + '<div id="mtgGrAcs" class="mtg-gr-acs"></div>'
        + '<video id="mtgGrVideo" autoplay playsinline muted></video>'
        + '<div class="mtg-gr-off" id="mtgGrOff"><span>Camera is off</span></div>'
        + '<div class="mtg-gr-toggles">'
          + '<button type="button" class="mtg-gr-btn" id="mtgGrMicBtn" data-onclick="mtgGrToggleMic()" title="Microphone">' + SVG.mic + '</button>'
          + '<button type="button" class="mtg-gr-btn" id="mtgGrCamBtn" data-onclick="mtgGrToggleCam()" title="Camera">' + SVG.cam + '</button>'
        + '</div>'
      + '</div>'
      + '<div class="mtg-gr-side">'
        + '<div id="mtgGrWarn"></div>'
        + '<div class="mtg-gr-title" id="mtgGrTitle">' + esc(st.cfg.title || '') + '</div>'
        + '<div class="mtg-gr-sub" id="mtgGrSub">' + esc(st.cfg.subtitle || '') + '</div>'
        + '<div id="mtgGrNameBox"' + (st.cfg.showName ? '' : ' data-cs="'+__cs+'display:none"') + '>'
          + '<label class="mtg-gr-lb">Your name</label>'
          + '<input type="text" id="mtgGrName" maxlength="100" placeholder="e.g. Maria Santos" value="' + esc(st.cfg.name || '') + '">'
          /* Consent to transcription. Unticked by default and optional: leaving
             it unticked still lets the person join, it only keeps their words
             out of the written transcript. */
          + (st.cfg.transcriptConsent
            ? '<label class="mtg-gr-consent"><input type="checkbox" id="mtgGrTxConsent">'
              + '<span>I agree that what I say during this appointment may be transcribed into text for my record. '
              + '<em>Optional &mdash; you can join without agreeing.</em></span></label>'
            : '')
        + '</div>'
        + '<div id="mtgGrControls"></div>'
        + '<div class="mtg-gr-action" id="mtgGrAction"></div>'
      + '</div></div>';
    st.mounted = true;
    paintWarning();
    renderControls();
    renderAction();
    var n = document.getElementById('mtgGrName');
    if (n && st.cfg.showName) {
      n.focus();
      n.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.mtgGrPrimary(); });
    }
    return openPreview();
  }

  window.mtgGrToggleMic = function () { st.micOn = !st.micOn; savePrefs(); openPreview(); };
  window.mtgGrToggleCam = function () { st.camOn = !st.camOn; savePrefs(); openPreview(); };
  window.mtgGrRetry = function () { st.denied = ''; openPreview().then(renderAction); };
  window.mtgGrPick = function (which, id) {
    var find = function (arr) { return arr.filter(function (d) { return d.deviceId === id; })[0] || {}; };
    if (which === 'mtgGrCam') { st.camId = id; st.camLabel = find(st.cams).label || ''; }
    else if (which === 'mtgGrMic') { st.micId = id; st.micLabel = find(st.mics).label || ''; }
    else { st.spkId = id; st.spkLabel = find(st.spks).label || ''; savePrefs(); return; } // speaker needs no re-open
    savePrefs();
    openPreview();
  };
  window.mtgGrPrimary = function () { if (st.cfg && st.cfg.onPrimary) st.cfg.onPrimary(); };
  window.mtgGrSecondary = function () { if (st.cfg && st.cfg.onSecondary) st.cfg.onSecondary(); };

  /* One place to look when a background does not appear. Reading three lines
     back beats another round of guessing from screenshots. */
  window.mtgGrDiag = function () {
    return {
      acsSdkLoaded: !!(window.ACS && window.ACS.Calling),
      effectsBundleLoaded: !!window.ACSEffects,
      usingAcsPreview: !!st.usingAcs,
      previewHasVideo: !!document.querySelector('#mtgGrAcs video'),
      chosenBackground: (st.cfg && st.cfg.bg) ? st.cfg.bg.get() : '(no picker)',
      lastEffectError: window.__ctgGrEffectError || 'none',
      note: st.effectNote || '(none)'
    };
  };


  window.mtgGrWhy = function () {
    var d = window.mtgGrDiag ? window.mtgGrDiag() : {};
    var yn = function (v) { return v ? 'yes' : 'NO'; };
    var lines = [
      'Calling SDK loaded:      ' + yn(d.acsSdkLoaded),
      'Effects bundle loaded:   ' + yn(d.effectsBundleLoaded),
      'Preview driven by ACS:   ' + yn(d.usingAcsPreview),
      'Preview has a picture:   ' + yn(d.previewHasVideo),
      'Background chosen:       ' + (d.chosenBackground || 'none'),
      'Last effect error:       ' + (d.lastEffectError || 'none'),
      'Browser:                 ' + navigator.userAgent
    ];
    var text = lines.join('\n');

    var el = document.getElementById('mtgGrWhyBox');
    if (!el) { el = document.createElement('div'); el.id = 'mtgGrWhyBox'; document.body.appendChild(el); }
    el.className = 'mtg-modal show';
    el.innerHTML = '<div class="mtg-modal-card">'
      + '<div class="mtg-modal-title">Background diagnostics</div>'
      + '<div class="small-muted" data-cs="'+__cs+'margin:2px 0 12px;font-size:12.5px;line-height:1.6">'
        + 'The three most common reasons a background does not appear: the effects bundle '
        + '(7.7 MB) has not finished downloading, the camera could not be handed to the calling '
        + 'SDK, or the device cannot run video effects. This says which.</div>'
      + '<pre class="mtg-gr-diag">' + esc(text) + '</pre>'
      + '<div class="mtg-modal-actions">'
        + '<button class="btn btn-ghost" data-onclick="mtgGrWhyClose()">Close</button>'
        + '<button class="btn btn-primary" data-onclick="mtgGrWhyCopy()">Copy</button>'
      + '</div></div>';
    window.__mtgGrWhyText = text;
  };
  window.mtgGrWhyClose = function () {
    var el = document.getElementById('mtgGrWhyBox');
    if (el) { el.className = 'mtg-modal'; el.innerHTML = ''; }
  };
  window.mtgGrWhyCopy = function () {
    if (!window.__mtgGrWhyText) return;
    navigator.clipboard.writeText(window.__mtgGrWhyText).then(function () {
      var b = document.querySelector('#mtgGrWhyBox .btn-primary');
      if (b) { b.textContent = 'Copied'; }
    }, function () {});
  };

  window.mtgGreenRoom = {
    mount: mount,
    name: function () {
      var n = document.getElementById('mtgGrName');
      return (n && n.value || '').trim();
    },
    transcriptConsent: function () {
      var c = document.getElementById('mtgGrTxConsent');
      return !!(c && c.checked);
    },
    /* What the call should start with. Read this before release(). */
    settings: function () {
      return {
        camOn: st.camOn, micOn: st.micOn,
        camId: st.camId, camLabel: st.camLabel,
        micId: st.micId, micLabel: st.micLabel,
        spkId: st.spkId, spkLabel: st.spkLabel
      };
    },
    /* Hand the hardware back before the SDK asks for it. On several machines a
       camera still held by the preview makes the call's own capture fail. */
    release: function () {
      stopStream();
      /* The call is about to open the camera itself. An ACS preview stream left
         running holds the device and the call's own capture fails on a fair
         number of machines. */
      disposeAcsView();
      st.usingAcs = false;
      st.mounted = false;
    },
    busy: function (on, label) {
      var b = document.getElementById('mtgGrGo');
      if (!b) return;
      b.disabled = !!on;
      if (label) b.textContent = label;
    },
    /* Match a chosen device against the SDK's own device list. The SDK's ids
       are not always the raw deviceId, so fall back to the label. */
    pick: function (list, id, label) {
      if (!list || !list.length) return null;
      var byId = list.filter(function (d) { return d.id === id || (id && String(d.id).indexOf(id) >= 0); })[0];
      if (byId) return byId;
      var byName = label && list.filter(function (d) { return d.name === label; })[0];
      return byName || list[0];
    }
  };
})();
