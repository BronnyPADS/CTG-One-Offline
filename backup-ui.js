(function () {
  'use strict';

  var backups = [];
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function size(n) {
    if (!n) return '—';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function when(d) { return d ? new Date(d).toLocaleString() : '—'; }


  /* Show whether the automatic backup is actually running. A schedule you
     cannot see is one you cannot trust - this states plainly when it last ran
     and when the next one is due. */
  function paintSchedule(sc) {
    var el = document.getElementById('bkSchedule');
    if (!el) return;
    if (!sc || !sc.configured) {
      el.innerHTML = '<div class="bk-sched bk-sched-off">Automatic backups are not running — '
        + 'storage is not configured on the server.</div>';
      return;
    }
    var last = null;
    if (backups.length && backups[0].takenAt) last = new Date(backups[0].takenAt);
    var hrs = last ? Math.floor((Date.now() - last.getTime()) / 3600000) : null;
    var overdue = hrs !== null && hrs >= sc.everyHours;
    el.innerHTML = '<div class="bk-sched' + (overdue ? ' bk-sched-late' : '') + '">'
      + '<strong>Automatic backup: on</strong> — one is taken every ' + sc.everyHours + ' hours, '
      + 'and backups older than ' + sc.retentionDays + ' days are removed.'
      + (last
          ? '<br>Last backup ' + (hrs === 0 ? 'less than an hour ago' : hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago')
            + ' (' + last.toLocaleString() + ').'
          : '<br>No backup has been taken yet — the first one runs shortly after the server starts.')
      + (sc.lastRun && sc.lastRun.error
          ? '<br><span class="bk-bad">Last attempt failed: ' + esc(sc.lastRun.error) + '</span>' : '')
      + '<br><span class="small-muted">The schedule is worked out from the backups themselves, so it '
      + 'survives restarts and deploys. While the portal is idle nothing runs — a due backup is '
      + 'taken the next time someone opens it.</span>'
      + '</div>';
  }

  /* Recording and transcript disposal, as the running server has it loaded -
     which is the only honest answer to "is retention armed?". */
  function paintRetention(rt) {
    var el = document.getElementById('bkSchedule');
    if (!el || !rt) return;
    var box = document.createElement('div');
    var lr = rt.lastRun;
    if (!rt.configured) {
      box.className = 'bk-sched bk-sched-off';
      box.innerHTML = '<strong>Recording retention: off</strong> — no retention period is set, so recordings and transcripts are never disposed of.';
    } else {
      box.className = 'bk-sched' + (rt.globalHold ? ' bk-sched-late' : '');
      box.innerHTML = '<strong>Recording retention: armed</strong> — videos after ' + esc(rt.recordingDays)
        + ' days, transcripts after ' + esc(rt.transcriptDays) + ' days. The consent record is kept.'
        + (rt.globalHold ? '<br><span class="bk-bad">A legal hold is on: nothing is being disposed of.</span>' : '')
        + (lr ? '<br>Last check ' + esc(new Date(lr.at).toLocaleString()) + ': '
              + (lr.skipped ? esc(lr.skipped)
                 : esc(lr.videos) + ' video(s) and ' + esc(lr.transcripts) + ' transcript(s) disposed of.')
              : '<br>No check has run since the server last started; one runs within a few minutes.');
    }
    el.appendChild(box);
  }

  window.renderBackups = function () {
    var box = document.getElementById('bkList');
    if (!box) return;
    box.innerHTML = '<div class="small-muted">Loading…</div>';
    window.ctgApiFetch('/api/backup').then(function (r) {
      backups = r.backups || [];
      paintSchedule(r.schedule);
      window.ctgApiFetch('/api/backup/retention').then(paintRetention).catch(function () {});
      if (!backups.length) {
        box.innerHTML = '<div class="patient-empty">No backups yet. Press <strong>Create backup now</strong> '
          + 'to take the first one.</div>';
        return;
      }
      box.innerHTML = '<table class="bk-table"><thead><tr>'
        + '<th>Taken</th><th>Size</th><th>Records</th><th class="bk-actions-h">Actions</th>'
        + '</tr></thead><tbody>'
        + backups.map(function (b) {
            return '<tr>'
              + '<td>' + esc(when(b.takenAt)) + '</td>'
              + '<td>' + esc(size(b.bytes)) + '</td>'
              + '<td>' + esc(b.rows || '—') + '</td>'
              + '<td class="bk-actions">'
                + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="bkVerify(\'' + esc(b.key) + '\')">Test restore</button>'
                + '<button type="button" class="btn btn-ghost btn-sm bk-safe" data-onclick="bkAsk(\'' + esc(b.key) + '\',\'missing\')">Restore missing</button>'
                + '<button type="button" class="btn btn-ghost btn-sm bk-danger" data-onclick="bkAsk(\'' + esc(b.key) + '\',\'full\')">Full restore</button>'
              + '</td></tr>';
          }).join('')
        + '</tbody></table>';
    }).catch(function (e) {
      box.innerHTML = '<div class="patient-empty">Could not load backups: ' + esc((e && e.message) || '') + '</div>';
    });
  };

  window.bkCreate = function (btn) {
    if (busy) return;
    busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Backing up…'; }
    window.ctgApiFetch('/api/backup/run', { method: 'POST' }).then(function (r) {
      toast('Backup taken — ' + size(r.bytes) + ' across ' + Object.keys(r.counts || {}).length + ' tables', 'ok');
      window.renderBackups();
    }).catch(function (e) {
      toast((e && e.message) || 'Backup failed.', 'err');
    }).then(function () {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Create backup now'; }
    });
  };

  /* The drill: proves the backup can be restored, using temporary tables that
     are dropped afterwards. Changes nothing. */
  window.bkVerify = function (key) {
    var el = bkModal();
    el.className = 'modal-overlay show';
    el.innerHTML = card('Testing this backup',
      '<div class="small-muted">Restoring every table into temporary tables to prove the backup can be '
      + 'put back. Nothing in the portal is changed.</div><div class="bk-spin"></div>', '');
    window.ctgApiFetch('/api/backup/' + encodeURIComponent(key) + '/verify', { method: 'POST' })
      .then(function (r) {
        var bad = (r.tables || []).filter(function (t) { return !t.ok; });
        var moved = (r.drifted || []).length;
        el.innerHTML = card(r.allOk ? 'Backup verified' : 'Backup has problems',
          '<div class="' + (r.allOk ? 'bk-ok' : 'bk-bad') + '">'
            + (r.allOk
                ? 'Every table restored correctly. ' + r.tables.length + ' tables checked, temporary tables removed.'
                : bad.length + ' of ' + r.tables.length + ' tables did not restore.')
          + '</div>'
          + (r.allOk && moved
              ? '<div class="small-muted" data-cs="'+__cs+'margin-top:6px">' + moved + ' of ' + r.tables.length
                + ' tables have changed since this backup was taken — expected, and shown below as '
                + '&ldquo;since backup&rdquo;. It says how far the portal has moved on, not whether the backup is good.</div>'
              : '')
          + '<table class="bk-table bk-mini"><thead><tr><th>Table</th><th>In backup</th><th>Live now</th><th>Since backup</th><th>Restored</th></tr></thead><tbody>'
          + (r.tables || []).map(function (t) {
              var dr = t.driftFromLive || 0;
              return '<tr><td>' + esc(t.table) + '</td><td>' + t.inBackup + '</td><td>' + t.liveRows + '</td>'
                + '<td class="small-muted">' + (dr === 0 ? 'unchanged' : (dr > 0 ? '+' + dr : String(dr))) + '</td>'
                + '<td class="' + (t.ok ? 'bk-ok' : 'bk-bad') + '">' + (t.ok ? 'ok' : 'FAILED') + '</td></tr>';
            }).join('')
          + '</tbody></table>',
          '<button type="button" class="btn btn-primary" data-onclick="bkClose()">Close</button>');
      }).catch(function (e) {
        el.innerHTML = card('Test failed', '<div class="bk-bad">' + esc((e && e.message) || '') + '</div>',
          '<button type="button" class="btn btn-ghost" data-onclick="bkClose()">Close</button>');
      });
  };

  /* Ask before doing anything. The preview is fetched from the server and
     counted against live data, so the numbers shown are real. */
  window.bkAsk = function (key, mode) {
    var full = mode === 'full';
    var b = backups.filter(function (x) { return x.key === key; })[0] || {};
    var el = bkModal();
    el.className = 'modal-overlay show';
    el.innerHTML = card(full ? 'Full restore' : 'Restore missing records',
      '<div class="small-muted">Checking what this would do…</div><div class="bk-spin"></div>', '');

    window.ctgApiFetch('/api/backup/' + encodeURIComponent(key) + '/plan', {
      method: 'POST', body: JSON.stringify({ mode: mode })
    }).then(function (r) {
      var rows = (r.tables || []).filter(function (t) { return (t.willAdd || 0) > 0 || (t.willReplace || 0) > 0; });
      var warn = full
        ? '<div class="bk-warn bk-warn-danger">'
            + '<strong>This overwrites everything with the version from ' + esc(when(b.takenAt)) + '.</strong>'
            + '<p>Every record is deleted and replaced by the backup. <strong>Any change made since '
            + esc(when(b.takenAt)) + ' will be lost from the portal</strong> — new patients, edited notes, '
            + 'new appointments, all of it.</p>'
            + '<p>A snapshot of the current state is taken automatically first, so this can be undone by '
            + 'running a full restore from that snapshot.</p>'
            + '<p>If you only need something that has gone missing, close this and use '
            + '<strong>Restore missing</strong> instead — it cannot overwrite anything.</p>'
          + '</div>'
        : '<div class="bk-warn bk-warn-safe">'
            + '<strong>This only re-adds records that are missing.</strong>'
            + '<p>Anything still in the portal is left exactly as it is, even if the backup holds an older '
            + 'version of it. Nothing is overwritten and nothing is deleted.</p>'
          + '</div>';

      var summary = rows.length
        ? '<table class="bk-table bk-mini"><thead><tr><th>Table</th>'
            + '<th>' + (full ? 'Will replace' : 'Will re-add') + '</th></tr></thead><tbody>'
          + rows.map(function (t) {
              return '<tr><td>' + esc(t.table) + '</td><td>' + (full ? t.willReplace + ' → ' + t.willAdd : t.willAdd) + '</td></tr>';
            }).join('') + '</tbody></table>'
        : '<div class="bk-ok">Nothing is missing — the portal already has everything in this backup.</div>';

      var confirmField = full
        ? '<label class="bk-confirm"><span>Type <strong>RESTORE</strong> to confirm</span>'
          + '<input type="text" id="bkConfirm" autocomplete="off" data-oninput="bkConfirmChanged()" placeholder="RESTORE"></label>'
        : '';

      el.innerHTML = card(full ? 'Full restore' : 'Restore missing records',
        warn + summary + confirmField,
        '<button type="button" class="btn btn-ghost" data-onclick="bkClose()">Cancel</button>'
        + '<button type="button" class="btn ' + (full ? 'bk-danger-btn' : 'btn-primary') + '" id="bkGo"'
        + (full ? ' disabled' : '') + ' data-onclick="bkRun(\'' + esc(key) + '\',\'' + mode + '\')">'
        + (full ? 'Overwrite everything' : 'Re-add ' + (r.totalToAdd || 0) + ' record' + (r.totalToAdd === 1 ? '' : 's'))
        + '</button>');

      if (!full && !(r.totalToAdd > 0)) {
        var go = document.getElementById('bkGo');
        if (go) { go.disabled = true; go.textContent = 'Nothing to restore'; }
      }
    }).catch(function (e) {
      el.innerHTML = card('Could not check', '<div class="bk-bad">' + esc((e && e.message) || '') + '</div>',
        '<button type="button" class="btn btn-ghost" data-onclick="bkClose()">Close</button>');
    });
  };

  window.bkConfirmChanged = function () {
    var i = document.getElementById('bkConfirm');
    var go = document.getElementById('bkGo');
    if (i && go) go.disabled = i.value.trim() !== 'RESTORE';
  };

  window.bkRun = function (key, mode) {
    var full = mode === 'full';
    var confirmVal = (document.getElementById('bkConfirm') || {}).value || '';
    if (full && confirmVal.trim() !== 'RESTORE') return;
    var go = document.getElementById('bkGo');
    if (go) { go.disabled = true; go.textContent = 'Restoring…'; }

    window.ctgApiFetch('/api/backup/' + encodeURIComponent(key) + '/restore', {
      method: 'POST', body: JSON.stringify({ mode: mode, confirm: full ? 'RESTORE' : undefined })
    }).then(function (r) {
      var el = bkModal();
      el.innerHTML = card('Restore finished',
        '<div class="bk-ok">' + r.totalAdded + ' record' + (r.totalAdded === 1 ? '' : 's') + ' restored'
          + (r.totalFailed ? ', ' + r.totalFailed + ' could not be written' : '') + '.</div>'
        + (r.safetyBackup
            ? '<div class="small-muted" data-cs="'+__cs+'margin-top:10px">A snapshot of the state before this restore was '
              + 'saved as <code>' + esc(r.safetyBackup) + '</code>. Run a full restore from it to undo this.</div>'
            : '')
        + '<div class="small-muted" data-cs="'+__cs+'margin-top:10px">Reload the portal to see the restored data.</div>',
        '<button type="button" class="btn btn-primary" data-onclick="buReloadPage()">Reload portal</button>');
      window.renderBackups();
    }).catch(function (e) {
      toast((e && e.message) || 'Restore failed.', 'err');
      if (go) { go.disabled = false; go.textContent = full ? 'Overwrite everything' : 'Re-add records'; }
    });
  };

  window.bkPrune = function (btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Removing…'; }
    window.ctgApiFetch('/api/backup/prune', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) {
        toast(r.removed ? r.removed + ' old backup' + (r.removed === 1 ? '' : 's') + ' removed'
                        : 'Nothing old enough to remove', 'ok');
        window.renderBackups();
      }).catch(function (e) { toast((e && e.message) || 'Could not remove old backups.', 'err'); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = 'Remove expired backups'; } });
  };

  function bkModal() {
    var el = document.getElementById('bkModal');
    if (!el) { el = document.createElement('div'); el.id = 'bkModal'; document.body.appendChild(el); }
    return el;
  }
  window.bkClose = function () {
    var el = document.getElementById('bkModal');
    if (el) { el.className = 'modal-overlay'; el.innerHTML = ''; }
  };
  function card(title, body, actions) {
    return '<div class="modal" data-cs="'+__cs+'width:min(620px,95%)">'
      + '<div class="modal-hd"><div class="modal-title">' + esc(title) + '</div>'
      + '<button class="modal-close" data-onclick="bkClose()" aria-label="Close">&#215;</button></div>'
      + '<div class="modal-body">' + body + '</div>'
      + (actions ? '<div class="modal-ft">' + actions + '</div>' : '')
      + '</div>';
  }
})();

;window.buReloadPage = function () { location.reload() }
