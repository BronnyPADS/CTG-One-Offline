(function () {
  'use strict';

  var SDK_SRC = 'speech-sdk.js?v=20260811a';
  var sdkLoading = null;

  function loadSdk() {
    if (window.SpeechSDK) return Promise.resolve(true);
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = SDK_SRC;
      s.async = true;
      s.onload = function () { resolve(!!window.SpeechSDK); };
      s.onerror = function () { sdkLoading = null; resolve(false); };
      document.head.appendChild(s);
    });
    return sdkLoading;
  }


  var GATE_PREROLL_MS = 1000;
  var GATE_HANGOVER_MS = 1200;
  var GATE_RATE = 16000;      // what the Speech service wants
  var GATE_FRAME = 4096;

  function gateDownsample(input, inRate) {
    if (inRate === GATE_RATE) return input;
    var ratio = inRate / GATE_RATE;
    var outLen = Math.floor(input.length / ratio);
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var idx = i * ratio, i0 = Math.floor(idx);
      var i1 = i0 + 1 < input.length ? i0 + 1 : input.length - 1;
      var f = idx - i0;
      out[i] = input[i0] * (1 - f) + input[i1] * f;
    }
    return out;
  }

  function gateToPcm16(f32) {
    var buf = new ArrayBuffer(f32.length * 2);
    var view = new DataView(buf);
    for (var i = 0; i < f32.length; i++) {
      var v = f32[i] < -1 ? -1 : (f32[i] > 1 ? 1 : f32[i]);
      view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
    }
    return buf;
  }

  function createVoiceGate(SDK, deviceId, isMuted) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(null);
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !SDK.AudioInputStream || !SDK.AudioInputStream.createPushStream) return Promise.resolve(null);

    var audio = deviceId ? { deviceId: { exact: deviceId } } : true;
    return navigator.mediaDevices.getUserMedia({ audio: audio }).then(function (stream) {
      var ctx, source, processor, mute, push, closed = false;
      try {
        ctx = new Ctx({ sampleRate: GATE_RATE });
        push = SDK.AudioInputStream.createPushStream(
          SDK.AudioStreamFormat.getWaveFormatPCM(GATE_RATE, 16, 1));
        source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(GATE_FRAME, 1, 1);
        /* A ScriptProcessor only runs while it is connected to the graph, and
           the graph only pulls while it reaches a destination - so it has to
           go somewhere. Through a gain of zero, or the room hears itself. */
        mute = ctx.createGain();
        mute.gain.value = 0;
      } catch (e) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {}
        return null;
      }

      var ring = [];              // the rolling pre-roll, oldest first
      var ringMs = 0;
      var open = false;
      var lastVoice = 0;
      var floor = 0.004;          // adaptive noise floor
      var submittedMs = 0;

      processor.onaudioprocess = function (ev) {
        if (closed) return;

        /* Muted means the room cannot hear this person, so the transcript
           must not hear them either: an aside to someone in the room while
           the microphone is off is not part of the meeting record, and
           Speech bills for every second of audio it is handed. The pre-roll
           is dropped as well - otherwise unmuting would ship the last
           second of what was said while muted. */
        if (isMuted && isMuted()) {
          ring = [];
          ringMs = 0;
          open = false;
          lastVoice = 0;
          return;
        }
        var pcm = gateDownsample(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
        var frameMs = pcm.length / GATE_RATE * 1000;

        var sum = 0;
        for (var i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        var rms = Math.sqrt(sum / (pcm.length || 1));

        /* The floor follows a quiet room down quickly and a noisy one up
           slowly, so a fan or a corridor does not hold the gate open all
           session while a softly spoken patient still trips it. */
        floor = rms < floor ? (floor * 0.90 + rms * 0.10) : (floor * 0.999 + rms * 0.001);
        var threshold = Math.max(floor * 3, 0.005);

        var now = Date.now();
        if (rms > threshold) lastVoice = now;
        var speaking = (now - lastVoice) < GATE_HANGOVER_MS;
        var bytes = gateToPcm16(pcm);

        if (speaking) {
          if (!open) {
            open = true;
            for (var k = 0; k < ring.length; k++) {
              try { push.write(ring[k].bytes); } catch (e) {}
              submittedMs += ring[k].ms;
            }
            ring = [];
            ringMs = 0;
          }
          try { push.write(bytes); } catch (e) {}
          submittedMs += frameMs;
        } else {
          open = false;
          ring.push({ bytes: bytes, ms: frameMs });
          ringMs += frameMs;
          while (ringMs > GATE_PREROLL_MS && ring.length > 1) {
            ringMs -= ring.shift().ms;
          }
        }
      };

      source.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);

      var resumeGate = function () {
        if (closed || !ctx || ctx.state !== 'suspended') return;
        try { ctx.resume().catch(function () {}); } catch (e) {}
      };
      resumeGate();
      if (ctx.state === 'suspended') {
        var onGesture = function () {
          resumeGate();
          if (!ctx || ctx.state !== 'suspended') {
            document.removeEventListener('pointerdown', onGesture, true);
            document.removeEventListener('keydown', onGesture, true);
          }
        };
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
      }

      return {
        audioConfig: SDK.AudioConfig.fromStreamInput(push),
        // Exposed so the caller can tell "gated, nothing said yet" apart from
        // "the audio graph never ran at all".
        contextState: function () { return ctx ? ctx.state : 'closed'; },
        submittedMs: function () { return submittedMs; },
        close: function () {
          if (closed) return;
          closed = true;
          try { processor.disconnect(); } catch (e) {}
          try { source.disconnect(); } catch (e) {}
          try { mute.disconnect(); } catch (e) {}
          try { push.close(); } catch (e) {}
          try { ctx.close(); } catch (e) {}
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        }
      };
    }).catch(function () { return null; });
  }

  function createSession(opts) {
    var recognizer = null;
    var gate = null;           // voice gating, when the browser allows it
    var gateCapable = null;    // unknown until the first start has tried
    var mutePaused = false;    // recogniser taken down because of the mute button
    var stopping = false;
    var refreshTimer = null;
    var generation = 0;
    var wantRunning = false;   // what the user asked for, not what is up
    var reconnects = 0;
    var reconnectTimer = null;
    var hiddenSince = 0;

    function fail(message) {
      wantRunning = false;
      cleanup();
      if (opts.onState) opts.onState('error', message);
    }

    /* A dropped socket is not a broken transcript - it is a transcript that
       needs dialling again. Backing off stops a genuinely broken setup from
       hammering the service, and after a handful of tries we say so rather
       than pretending to listen forever. */
    function reconnect(why) {
      if (stopping || !wantRunning) return;
      if (reconnects >= 5) return fail(why || 'Transcript stopped.');
      reconnects++;
      var wait = Math.min(8000, 400 * Math.pow(2, reconnects - 1));
      cleanup();
      reconnectTimer = setTimeout(function () {
        if (!stopping && wantRunning) start(true);
      }, wait);
    }

    function cleanup() {
      generation++;            // orphan the outgoing session's handlers
      clearTimeout(refreshTimer);
      refreshTimer = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (gate) { try { gate.close(); } catch (e) {} gate = null; }
      if (recognizer) {
        var r = recognizer;
        recognizer = null;
        // stopContinuousRecognitionAsync before close, or the socket is torn
        // down mid-utterance and the SDK logs an error we cannot catch.
        try { r.stopContinuousRecognitionAsync(function () { try { r.close(); } catch (e) {} },
                                               function () { try { r.close(); } catch (e) {} }); }
        catch (e) { try { r.close(); } catch (e2) {} }
      }
    }

    /* `quiet` reconnects without flashing the UI back through 'starting'
       from the user's side nothing happened, and nothing should look like it
       did. */
    async function start(quiet) {
      if (recognizer) return;
      stopping = false;
      wantRunning = true;
      var myGen = ++generation;
      if (opts.onState && !quiet) opts.onState('starting');

      if (!(await loadSdk())) return fail('Could not load the speech engine.');
      if (myGen !== generation) return;    // superseded while the SDK loaded

      var cred;
      try { cred = await opts.fetchToken(); }
      catch (e) {
        // 503 is the server saying Speech is not configured - worth saying
        // plainly rather than reporting a generic failure.
        return fail(e && e.status === 503
          ? 'Live transcript is not switched on for this server yet.'
          : ((e && e.message) || 'Could not start the transcript.'));
      }
      if (myGen !== generation) return;    // superseded while the token came back
      if (!cred || !cred.token) return fail('Could not start the transcript.');

      var SDK = window.SpeechSDK;
      var autoDetecting = false;
      var speechConfig;
      try {
        speechConfig = SDK.SpeechConfig.fromAuthorizationToken(cred.token, cred.region);
        /* What this person speaks. Passed in by the caller so a provider and a
           patient in the same meeting can each be recognised in their own
           language; falls back to the server's configured locale. */
        var spoken = (opts.language && opts.language()) || '';
        speechConfig.speechRecognitionLanguage = (spoken && spoken !== 'auto')
          ? spoken
          : ((cred.locales && cred.locales[0]) || 'en-US');
      } catch (e) { return fail('Speech engine rejected the configuration.'); }

      /* Use the same microphone chosen for the meeting. Falling back to the
         system default would transcribe a different device than the one the
         person is actually speaking into - silently producing an empty
         transcript for anyone using a headset. */
      var audioConfig;
      var id = (opts.micId && opts.micId()) || '';
      /* Gate the microphone if this browser will allow it - see the long note
         above createSession. Falls back to handing the SDK the device. */
      gate = await createVoiceGate(SDK, id, isMutedNow);
      gateCapable = !!gate;
      /* Started while muted, and this browser would not give us the gate:
         hold the recogniser back rather than opening the microphone. The
         transcript still counts as on - unmuting starts it for real. */
      if (!gate && isMutedNow()) {
        mutePaused = true;
        if (opts.onState) opts.onState('listening');
        return;
      }
      if (myGen !== generation) {                 // superseded while asking for the mic
        if (gate) { try { gate.close(); } catch (e) {} gate = null; }
        return;
      }
      if (gate) {
        audioConfig = gate.audioConfig;
      } else {
        try {
          audioConfig = id ? SDK.AudioConfig.fromMicrophoneInput(id)
                           : SDK.AudioConfig.fromDefaultMicrophoneInput();
        } catch (e) { return fail('Could not open your microphone for the transcript.'); }
      }

      try {
        speechConfig.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, '350');
      } catch (e) { /* older SDK build: the default pause still works */ }

      var candidates = (spoken === 'auto' && opts.autoDetect && opts.autoDetect()) || [];
      candidates = candidates.filter(Boolean);
      // Azure's own ceiling: Continuous language-ID rejects the whole
      // connection (websocket error 1007) past 10 candidates, no matter how
      // long a list the practice configures. Capped here so that can never
      // take a meeting down - the server-side shortlist can grow freely.
      if (candidates.length > 10) candidates = candidates.slice(0, 10);
      autoDetecting = candidates.length > 1;

      try {
        if (autoDetecting) {
          if (candidates.length > 4) {
            try {
              speechConfig.setProperty(
                SDK.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous');
            } catch (e) { candidates = candidates.slice(0, 4); }
          }
          var autoCfg = SDK.AutoDetectSourceLanguageConfig.fromLanguages(candidates);
          recognizer = SDK.SpeechRecognizer.FromConfig(speechConfig, autoCfg, audioConfig);
        } else {
          recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);
        }
      } catch (e) {
        // A failed auto-detect setup must not cost the transcript entirely.
        autoDetecting = false;
        try { recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig); }
        catch (e2) { return fail('Could not start the speech recogniser.'); }
      }

      // Interim text: shown live, never stored. Only finished phrases are kept.
      recognizer.recognizing = function (_s, e) {
        if (myGen !== generation) return;
        if (opts.onPartial && e && e.result) opts.onPartial(e.result.text || '');
      };

      recognizer.recognized = function (_s, e) {
        if (myGen !== generation) return;
        // Speech got through, so whatever went wrong before is behind us.
        reconnects = 0;
        if (!e || !e.result) return;
        if (e.result.reason !== SDK.ResultReason.RecognizedSpeech) return;
        var text = (e.result.text || '').trim();
        if (opts.onPartial) opts.onPartial('');
        if (!text) return;                      // silence and noise resolve to empty
        /* Which language this phrase turned out to be. Passed on so the
           translation knows what it is reading rather than guessing from one
           short sentence - and so the UI can show what was detected. */
        var detected = '';
        if (autoDetecting) {
          try {
            detected = (SDK.AutoDetectSourceLanguageResult.fromResult(e.result) || {}).language || '';
          } catch (err) { detected = ''; }
          if (detected && opts.onLanguage) { try { opts.onLanguage(detected); } catch (err) {} }
        }
        try { opts.postLine(text, detected); } catch (err) {}
      };

      recognizer.canceled = function (_s, e) {
        if (myGen !== generation || stopping) return;
        var why = (e && e.errorDetails) || '';
        /* Two different kinds of stop wear the same event. A closed socket or
           an expired token (ten minutes, which a long appointment outlives) is
           worth redialling. A rejected configuration is not - it would be
           rejected again just as fast, so it is shown to the user instead. */
        if (!why || /token|authentication|1006|1005|1011|connection|network|timeout|closed|abort/i.test(why)) {
          reconnect(why);
          return;
        }
        fail('Transcript stopped: ' + why.slice(0, 160));
      };

      recognizer.sessionStopped = function () {
        if (myGen !== generation || stopping) return;
        reconnect('');
      };

      try {
        var conn = SDK.Connection.fromRecognizer(recognizer);
        if (conn) {
          conn.disconnected = function () {
            if (myGen !== generation || stopping) return;
            reconnect('');
          };
        }
      } catch (e) { /* older build - focus and visibility still cover it */ }

      recognizer.startContinuousRecognitionAsync(
        function () {
          if (myGen !== generation) return;
          /* The budget is refilled by a connection that came UP, not by
             somebody talking into it. Refilling only on speech meant a quiet
             consultation with a few network blips could burn all five retries
             and lose the transcript for the rest of the appointment. */
          reconnects = 0;
          if (opts.onState) opts.onState('listening');
          // Refresh before the ten-minute token expires, not after.
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(restart, Math.max(60, (cred.expiresInSeconds || 540) - 60) * 1000);
        },
        function (err) {
          if (myGen !== generation) return;
          reconnect('Could not start listening: ' + (err || ''));
        }
      );
    }

    // Rebuild the session with a fresh token, keeping the UI in 'listening'.
    function restart() {
      if (stopping) return;
      cleanup();
      start(true);
    }

    var watchdog = setInterval(function () {
      if (!wantRunning || stopping || mutePaused) return;
      if (recognizer || reconnectTimer) return;
      reconnects = 0;      // this is a rescue, not another failed attempt
      start(true);
    }, 10000);

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        if (!hiddenSince) hiddenSince = Date.now();
        return;
      }
      if (!wantRunning || stopping) return;
      /* Focus fires on every click back into the window, so the elapsed time
         is what decides whether anything is actually worth doing. A recogniser
         that is simply gone is rebuilt whatever the timing. */
      if (mutePaused) return;
      var away = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = 0;
      if (recognizer && away < 4000) return;
      reconnects = 0;          // coming back is not a failure, so not a retry
      restart();
    }
    /* Blur is what actually marks the moment of leaving when the tab never
       became hidden - without it an alt-tab looks like zero time away. */
    function onBlur() { if (!hiddenSince) hiddenSince = Date.now(); }
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    /* Alt-tabbing to another APPLICATION does not necessarily hide the tab, so
       visibilitychange alone missed it entirely. Focus catches coming back to
       the window whether or not the browser considered it hidden. */
    window.addEventListener('focus', onVisibility);

    function isMutedNow() {
      try { return !!(opts.muted && opts.muted()); } catch (e) { return false; }
    }

    /* The microphone button belongs to the meeting; the transcript only
       follows it. Where the voice gate is running this costs nothing - the
       audio callback reads the flag and stops handing frames over. Where the
       browser would not give us the gate the SDK holds the microphone
       itself, and the only way to stop it listening is to take the recogniser
       down, so unmuting there pays for a fresh token and a reconnect. */
    function setMuted(v) {
      v = !!v;
      if (gateCapable !== false) return;        // the gate already handles it
      if (!wantRunning || stopping) return;
      if (v) {
        if (mutePaused) return;
        mutePaused = true;
        cleanup();
        if (opts.onPartial) opts.onPartial('');
      } else if (mutePaused) {
        mutePaused = false;
        reconnects = 0;                          // unmuting is not a retry
        start(true);
      }
    }

    function stop() {
      stopping = true;
      wantRunning = false;
      mutePaused = false;
      cleanup();
      if (opts.onPartial) opts.onPartial('');
      if (opts.onState) opts.onState('stopped');
    }

    function dispose() {
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('blur', onBlur);
      stop();
    }

    return {
      start: start, stop: stop, dispose: dispose, setMuted: setMuted,
      // Paused for the mute button still counts as on: the panel, and the
      // toggle that reads it, must not offer to start a second session.
      isRunning: function () { return !!recognizer || mutePaused; }
    };
  }

  function two(n) { return String(n).padStart(2, '0'); }

  function stamp(d) {
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
      + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  /* Which languages a line was translated into. Only ever the ones somebody
     in the room asked to read, so this is empty for most meetings. */
  function trCodes(l) {
    if (!l || !l.tr || typeof l.tr !== 'object') return [];
    return Object.keys(l.tr).filter(function (k) { return l.tr[k]; }).sort();
  }

  function transLine(lines, meta) {
    var names = (meta && meta.langNames) || {};
    var seen = {};
    (lines || []).forEach(function (l) {
      trCodes(l).forEach(function (k) { seen[k] = true; });
    });
    var codes = Object.keys(seen).sort();
    if (!codes.length) return null;
    return 'Translated into: ' + codes.map(function (k) { return names[k] || k; }).join(', ');
  }

  function download(lines, meta) {
    lines = lines || [];
    meta = meta || {};
    var now = new Date();

    var header = [
      'Concussion Therapy Group — meeting transcript',
      meta.title ? 'Meeting: ' + meta.title : null,
      'Saved:   ' + stamp(now),
      meta.savedBy ? 'Saved by: ' + meta.savedBy : null,
      'Lines:   ' + lines.length,
      transLine(lines, meta),
      '',
      /* Said plainly in the file itself. Once this is on a laptop it is outside
         the portal's access controls, and whoever opens it next may have no
         idea what it is. */
      'This transcript contains protected health information. Handle and store',
      'it in line with your practice\'s HIPAA policy.',
      '',
      '----------------------------------------------------------------------',
      ''
    ].filter(function (l) { return l !== null; }).join('\r\n');

    var names = (meta && meta.langNames) || {};
    var body = lines.length
      ? lines.map(function (l) {
          var t = new Date(l.at);
          var head = '[' + two(t.getHours()) + ':' + two(t.getMinutes()) + '] '
            + (l.name || 'Participant') + ': ' + (l.text || '');
          /* Translations sit indented beneath the words they came from, never
             instead of them. A translation is an aid to the conversation; the
             record has to keep what the person actually said, and keep it
             first, so anyone reading later can tell the two apart. */
          var codes = trCodes(l);
          if (!codes.length) return head;
          return head + '\r\n' + codes.map(function (k) {
            return '        \u2192 ' + (names[k] || k) + ': ' + l.tr[k];
          }).join('\r\n');
        }).join('\r\n')
      : '(No speech was transcribed in this meeting.)';

    // CRLF throughout: this lands on Windows machines, and Notepad renders
    // bare newlines as one unreadable run-on line.
    var text = header + body + '\r\n';

    var safeTitle = String(meta.title || 'meeting')
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'meeting';
    var name = 'transcript-' + safeTitle + '-'
      + now.getFullYear() + two(now.getMonth() + 1) + two(now.getDate())
      + '-' + two(now.getHours()) + two(now.getMinutes()) + '.txt';

    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on a delay - revoking immediately cancels the download in
      // some browsers before it has started reading the blob.
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return name;
    } catch (e) {
      return null;
    }
  }

  window.mtgTranscript = { createSession: createSession, loadSdk: loadSdk, download: download };
})();
