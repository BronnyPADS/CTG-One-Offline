(function () {
  'use strict';

  var m = (location.hash || '').match(/[#&]rec=([^&]+)/);
  if (!m) return;
  var TOKEN = decodeURIComponent(m[1]);

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  function host() {
    var el = document.getElementById('recShareView');
    if (!el) {
      el = document.createElement('div');
      el.id = 'recShareView';
      el.className = 'rs-page';
      document.body.innerHTML = '';
      document.body.appendChild(el);
      document.body.classList.add('pf-mode');
    }
    return el;
  }

  function shell(inner) {
    return '<div class="rs-wrap">'
      + '<div class="rs-brand">Concussion Therapy <span>Group</span></div>'
      + '<div class="rs-sub">SHARED RECORDING</div>'
      + inner
      + '<div class="rs-foot">This link is intended only for you. It contains protected health '
      + 'information and is monitored. Do not forward it, download it to a personal device, or '
      + 'share it further.</div></div>';
  }

  function stamp(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function dur(ms) {
    if (!ms) return '';
    var s = Math.round(ms / 1000);
    return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  function render(d) {
    var el = host();
    var media = '';
    if (d.hasMedia) {
      var url = '/api/meetings/share/' + encodeURIComponent(TOKEN) + '/media';
      var attrs = ' class="rs-media" controls controlsList="nodownload noplaybackrate"'
        + ' disablePictureInPicture data-oncontextmenu="return false"'
        + ' preload="metadata" src="' + url + '"';
      media = d.kind === 'audio'
        ? '<audio' + attrs + '></audio>'
        : '<video' + attrs + '></video>';
    }

    var transcript = '';
    var t = d.transcript;
    if (t && t.phrases && t.phrases.length) {
      var speakers = Number(t.speakers) || 1;
      transcript = '<div class="rs-tx">'
        + '<div class="rs-tx-head">Transcript &middot; ' + t.phrases.length + ' passages &middot; '
          + speakers + ' ' + (speakers === 1 ? 'speaker' : 'speakers')
          + '<button type="button" class="rs-copy" data-onclick="rsCopy()">Copy text</button></div>'
        + '<div class="rs-tx-body">'
        + t.phrases.map(function (p) {
            return '<div class="rs-tx-line"><span class="rs-at">' + stamp(p.at) + '</span>'
              + '<span class="rs-sp s' + ((p.speaker || 0) % 6) + '">'
              + (p.speaker == null ? 'Speaker' : 'Speaker ' + esc(p.speaker)) + '</span>'
              + '<span class="rs-t">' + esc(p.text) + '</span></div>';
          }).join('')
        + '</div></div>';
    } else if (d.transcriptStatus === 'pending') {
      transcript = '<div class="rs-note">The transcript is still being prepared.</div>';
    }

    if (!media && !transcript) {
      transcript = '<div class="rs-note">Nothing has been shared on this link yet.</div>';
    }

    var expires = d.expiresAt ? new Date(d.expiresAt) : null;
    el.innerHTML = shell(
      '<div class="rs-card">'
        + '<div class="rs-title">' + esc(d.title || 'Meeting recording') + '</div>'
        + '<div class="rs-meta">' + esc(new Date(d.recordedAt).toLocaleString())
          + (d.durationMs ? ' &middot; ' + dur(d.durationMs) : '')
          + (expires ? ' &middot; link expires ' + esc(expires.toLocaleDateString()) : '') + '</div>'
        + media
        + transcript
      + '</div>');

    window.__rsText = (t && t.full) || '';
  }

  window.rsCopy = function () {
    if (!window.__rsText) return;
    navigator.clipboard.writeText(window.__rsText).then(function () {
      var b = document.querySelector('.rs-copy');
      if (b) { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy text'; }, 1800); }
    }, function () {});
  };

  function fail(message) {
    host().innerHTML = shell('<div class="rs-card rs-err">' + esc(message) + '</div>');
  }

  document.addEventListener('DOMContentLoaded', function () {
    host().innerHTML = shell('<div class="rs-card">Loading…</div>');
    fetch('/api/meetings/share/' + encodeURIComponent(TOKEN), { credentials: 'omit' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) return fail((r.j && r.j.error) || 'This link is not valid.');
        render(r.j);
      })
      .catch(function () { fail('Could not reach the clinic. Please check your connection.'); });
  });
})();
