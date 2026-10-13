(function () {
  'use strict';

  const NOTIF_STORE_KEY = 'ctg_notification_settings_v1';
  let notifState = { medium: '', active: false };

  function notifLoad() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTIF_STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') notifState = Object.assign({ medium: '', active: false }, saved);
    } catch (e) {}
  }
  /* Notification settings apply to the practice, not to one browser. */
  let notifVersion = 0;
  function notifSave() {
    try { localStorage.setItem(NOTIF_STORE_KEY, JSON.stringify(notifState)); } catch (e) {}
    if (typeof window.ctgApiFetch !== 'function') return;
    window.ctgApiFetch('/api/shared/doc/notificationSettings', {
      method: 'PUT', body: JSON.stringify({ data: notifState, version: notifVersion })
    }).then(function (r) { notifVersion = r.version; })
      .catch(function (e) { if (e && e.status === 409) notifLoadRemote(true); });
  }
  function notifLoadRemote(rerender) {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/notificationSettings').then(function (r) {
      notifVersion = r.version || 0;
      if (r.data && typeof r.data === 'object') {
        notifState = Object.assign({ medium: '', active: false }, r.data);
        try { localStorage.setItem(NOTIF_STORE_KEY, JSON.stringify(notifState)); } catch (e) {}
      } else if (notifVersion === 0) {
        notifSave();   // seed the server from this browser's existing settings
      }
      if (rerender && typeof window.renderNotification === 'function') window.renderNotification();
    }).catch(function () {});
  }
  window.ctgNotificationRealtime = function () { notifLoadRemote(true); };
  function notifEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function notifToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }

  let notifChannels = null;   // null = not asked yet
  function notifLoadChannels() {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/invites/channels').then(function (r) {
      notifChannels = { email: !!r.email, sms: !!r.sms };
      const mount = document.getElementById('notifMount');
      if (mount) mount.innerHTML = notifHTML();
    }).catch(function () {});
  }

  let notifFetched = false;
  function renderNotification() {
    if (!notifFetched) { notifFetched = true; notifLoadRemote(true); notifLoadChannels(); }
    const mount = document.getElementById('notifMount');
    if (!mount) return;
    notifLoad();
    mount.innerHTML = notifHTML();
  }

  /* The notice, driven by what the server reports rather than by a fixed
     string. The important case is the mismatch: a medium chosen here that the
     server cannot actually send is worse than nothing configured at all,
     because the screen otherwise reads as ready. */
  function notifNoticeHTML() {
    const info = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    if (!notifChannels) {
      return '<div class="notif-notice">' + info + '<span>Checking what this server can send…</span></div>';
    }
    const chosen = notifState.medium;
    const ready = { sms: notifChannels.sms, email: notifChannels.email };

    if (chosen && !ready[chosen]) {
      const other = chosen === 'sms' ? 'Email' : 'SMS';
      return '<div class="notif-notice notif-notice-warn">' + info
        + '<span><strong>' + (chosen === 'sms' ? 'SMS' : 'Email') + ' is not set up on this server.</strong> '
        + (ready[chosen === 'sms' ? 'email' : 'sms']
            ? other + ' is available — switch to it, or ask an administrator to add the credentials.'
            : 'Neither channel is configured. An administrator needs to add the credentials on the server; they are not editable from this screen.')
        + '</span></div>';
    }
    if (!notifChannels.email && !notifChannels.sms) {
      return '<div class="notif-notice notif-notice-warn">' + info
        + '<span>Neither email nor SMS is configured on this server, so nothing can be delivered yet. '
        + 'These are server credentials — an administrator sets them, they are not editable here.</span></div>';
    }
    const both = notifChannels.email && notifChannels.sms;
    return '<div class="notif-notice notif-notice-ok">' + info
      + '<span>' + (both ? 'Email and SMS are both ready to send.'
                         : (notifChannels.email ? 'Email is ready to send. SMS is not configured.'
                                                : 'SMS is ready to send. Email is not configured.')) + '</span></div>';
  }

  function notifHTML() {
    const mediumName = notifState.medium === 'sms' ? 'SMS' : notifState.medium === 'email' ? 'Email' : 'Email & SMS';
    const statusText = notifState.active ? mediumName + ' notifications are active' : 'Notifications are inactive';

    return '<div class="card">'
      + '<div class="card-hd"><div class="card-ico ic-amber"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>'
        + '<div class="card-title">Notification Settings</div>'
        + '<div class="card-sub">Controls updates sent to patients when their details change</div>'
      + '</div>'
      + '<div class="card-body">'
        + '<div class="fg" data-cs="'+__cs+'max-width:280px"><label>Messaging Medium</label>'
          + '<select id="notifMedium" data-onchange="notifSetMedium(this.value)">'
            + '<option value=""' + (notifState.medium === '' ? ' selected' : '') + '>Select a Messaging Medium</option>'
            + '<option value="sms"' + (notifState.medium === 'sms' ? ' selected' : '') + '>SMS</option>'
            + '<option value="email"' + (notifState.medium === 'email' ? ' selected' : '') + '>Email</option>'
          + '</select>'
        + '</div>'
        + notifNoticeHTML()
        + '<div class="acfg-toggle-list" data-cs="'+__cs+'margin-bottom:0">'
          + '<label class="acfg-toggle-row"><span class="acfg-toggle-copy"><strong>Patient update notifications</strong><small>' + notifEsc(statusText) + '</small></span>'
          + '<span class="acfg-toggle-switch"><input type="checkbox" id="notifActivate"' + (notifState.active ? ' checked' : '') + ' data-onchange="notifSetActive(this.checked)"><i></i></span></label>'
        + '</div>'
      + '</div></div>';
  }

  function notifSetMedium(v) { notifState.medium = v; notifSave(); renderNotification(); }
  function notifSetActive(on) {
    if (on && !notifState.medium) { notifToast('Select a messaging medium first.', 'err'); renderNotification(); return; }
    notifState.active = !!on;
    notifSave();
    renderNotification();
    notifToast(on ? 'Notifications activated ✓' : 'Notifications de-activated', on ? 'ok' : '');
  }

  window.renderNotification = renderNotification;
  window.notifSetMedium = notifSetMedium;
  window.notifSetActive = notifSetActive;
})();
