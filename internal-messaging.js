(function () {
  'use strict';

  const IM_STORE_KEY = 'ctg_internal_messaging_v1';
  const IM_PRESENCE_KEY = 'ctg_internal_messaging_presence_v1';
  const IM_TYPING_KEY = 'ctg_internal_messaging_typing_v1';
  const IM_DRAFTS_KEY = 'ctg_internal_messaging_drafts_v1';
  const IM_ACTIVE_KEY_PREFIX = 'ctg_internal_messaging_active_';
  const IM_ACCOUNTS_KEY = 'ctg_auth_accounts_v1';
  const IM_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // matches the server's per-file limit
  const IM_MAX_ICON_BYTES = 300 * 1024;
  const IM_MAX_STORE_BYTES = 3.8 * 1024 * 1024;
  const IM_UNDO_MS = 30000;
  const IM_TYPING_TTL = 3200;
  const IM_PRESENCE_TTL = 35000;
  const IM_HEARTBEAT_MS = 15000;
  const IM_CALL_RING_TIMEOUT_MS = 30000;
  const IM_EMOJIS = ['😀','😁','😂','🤣','😊','😍','🥰','😎','🤔','😮','😢','😡','👍','👎','👏','🙌','🎉','❤️','🔥','✅','🙏','💡','👀','💬','📌','⭐','🚀','💪','🤝','🩺','🧠','📅','📎','⚠️','✔️','❗'];
  const IM_QUICK_REACTIONS = ['👍','❤️','😂','😮','😢'];
  const IM_REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡','👏','🎉','🔥','✅','🙏','👀'];
  // The call outcomes the app writes (CALL_OUTCOMES in routes/messaging.js).
  const IM_CALL_OUTCOMES = ['completed', 'declined', 'noanswer'];

  let imData = null;
  let imActiveConversationId = null;
  let imConversationSearch = '';
  let imMessageSearch = '';
  let imReplyToId = null;
  let imEditingMessageId = null;
  let imPendingAttachment = null;
  let imEmojiOpen = false;
  let imDetailsOpen = true;
  let imDetailsMediaTab = 'media';
  let imMobileThread = false;
  let imTypingWriteAt = 0;
  let imLastCurrentUserId = '';
  let imLastAccountsHash = '';
  let imHeartbeatTimer = null;
  let imRealtimeTimer = null;
  let imPassiveTimer = null;
  let imUndoTimer = null;
  let imUndoAction = null;
  let imBroadcast = null;
  let imComposerSelection = { start: 0, end: 0 };
  let imMentionOpen = false;
  let imMentionStart = -1;
  let imMentionQuery = '';
  let imMentionSelectedIndex = 0;
  let imMentionCandidates = [];
  let imModalSelectedIds = [];
  let imCallState = 'idle'; // idle | ringing | active
  let imCallId = null; // the ACS group-call id (one per conversation, persisted server-side)
  let imCallConversationId = null;
  let imCallIsGroup = false;
  let imCallInvite = null; // { callId, conversationId, isGroup, inviterId, inviterName } - set while state === 'ringing'
  let imCallStarterId = null; // who actually started this call (for direct-call log attribution)
  let imCallPendingInvitees = null; // peers to ring once we've actually joined the ACS call
  let imCall = null; // the current ACS Call object (see imCallWireCallEvents)
  let imCallClient = null; // ACS CallClient, created once
  let imCallAgent = null; // ACS CallAgent, created once per session (token auto-refreshes)
  let imCallAgentPromise = null;
  let imCallDeviceManager = null;
  let imCallStartedAt = 0;
  let imCallRingTimer = null;
  let imCallDurationTimer = null;
  let imCallMuted = false;
  let imCallMinimized = false;
  let imCallMicDevices = []; // [{deviceId, label}] - refreshed via imCallRefreshMicList()
  let imCallSelectedMicId = '';
  try { imCallSelectedMicId = localStorage.getItem('ctg_call_mic_device') || ''; } catch (e) {}
  // Video. Every call starts audio-only and video is opt-in per person, so a
  // group call never forces cameras on - each participant chooses.
  let imCallVideoOn = false;
  let imCallLocalVideoStream = null;
  let imCallLocalView = null;        // { renderer, view } for my own preview
  let imCallRemoteViews = {};        // acsUserId -> { renderer, view }
  let imCallCameras = [];
  let imCallSelectedCameraId = '';
  try { imCallSelectedCameraId = localStorage.getItem('ctg_call_camera_device') || ''; } catch (e) {}

  function imEsc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function imNow() { return Date.now(); }
  function imId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function imParse(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (e) { return fallback; }
  }
  function imStringifyBytes(value) {
    try { return new Blob([JSON.stringify(value)]).size; }
    catch (e) { return JSON.stringify(value).length * 2; }
  }
  function imToast(text, kind) {
    if (typeof window.showToast === 'function') window.showToast(text, kind || '');
  }
  function imCurrentUser() {
    try { return typeof window.ctgCurrentUser === 'function' ? window.ctgCurrentUser() : null; }
    catch (e) { return null; }
  }
  function imCan(section) {
    try {
      if (typeof window.ctgCanSection !== 'function') return true;
      return window.ctgCanSection('internalMessaging', section);
    } catch (e) { return true; }
  }
  function imCurrentPageActive() {
    const page = document.getElementById('page-internalMessaging');
    return !!(page && page.classList.contains('active'));
  }
  let _imAccountsCache = [];
  let _imAccountsRefreshInFlight = false;
  async function refreshImAccountsCache() {
    if (_imAccountsRefreshInFlight) return;
    _imAccountsRefreshInFlight = true;
    try {
      const next = (typeof window.ctgListMessagingAccounts === 'function') ? (await window.ctgListMessagingAccounts()) || [] : [];
      const changed = JSON.stringify(next) !== JSON.stringify(_imAccountsCache);
      _imAccountsCache = next;
      if (changed && imCurrentPageActive()) imRenderInternalMessaging();
    } catch (e) { console.warn('Could not load messaging account directory', e); }
    _imAccountsRefreshInFlight = false;
  }
  function imAccounts() {
    const current = imCurrentUser();
    const clean = _imAccountsCache.filter(u => u && u.active !== false).map(u => ({
      id: String(u.id || u.username || ''),
      username: String(u.username || ''),
      displayName: String(u.displayName || u.username || 'Account'),
      role: String(u.role || ''),
      lawFirm: String(u.lawFirm || ''),
      acsUserId: u.acsUserId || ''
    })).filter(u => u.id);
    if (current && !clean.some(u => u.id === current.id)) {
      clean.push({ id: current.id, username: current.username || '', displayName: current.displayName || current.username || 'Account', role: current.role || '', lawFirm: current.lawFirm || '', acsUserId: '' });
    }
    return clean.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  }
  function imAccount(id) {
    if (id === 'system') return { id: 'system', displayName: 'CTG System', username: 'system', role: 'system' };
    return imAccounts().find(u => u.id === id) || { id, displayName: 'Former account', username: '', role: '' };
  }
  // Maps an ACS communicationUserId (the identifier ACS's Calling SDK hands
  // back for each remote participant) to our own account, so the call UI can
  // show a real name/avatar instead of a raw ACS identifier string.
  function imAccountByAcsId(acsUserId) {
    if (!acsUserId) return null;
    return imAccounts().find(function (u) { return u.acsUserId === acsUserId; }) || null;
  }
  function imAcsIdentifierToString(identifier) {
    try {
      if (window.ACS && ACS.Common && typeof ACS.Common.toFlatCommunicationIdentifier === 'function') return ACS.Common.toFlatCommunicationIdentifier(identifier);
    } catch (e) {}
    return (identifier && (identifier.communicationUserId || identifier.rawId)) || '';
  }
  function imInitials(name) {
    const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((words[0] && words[0][0]) || '') + ((words.length > 1 && words[words.length - 1][0]) || '');
  }
  function imFirstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || String(name || '');
  }
  function imRoleLabel(role) {
    return ({ admin: 'Administrator', lawyer: 'Law Firm', provider: 'Provider', ta: 'Technical Assistant', compliance: 'Compliance', system: 'System' })[role] || role || 'Account';
  }

  /* Real-time. Presence and typing come from the shared WebSocket connection
     (see connectRealtime in ctg-auth.js) rather than localStorage heartbeats,
     and messages and conversations pushed by other users land here too. This
     is the single entry point ctg-auth.js calls for every im: event. */
  const _imOnline = new Set();
  const _imTypingLive = {};
  function imPersistLocalCache() {
    try { if (imData) localStorage.setItem(IM_STORE_KEY, JSON.stringify(imData)); } catch (e) {}
  }
  window.ctgImHandleRealtime = function (type, payload) {
    if (type === 'presence:snapshot') {
      (payload.accountIds || []).forEach(id => _imOnline.add(id));
      if (imCurrentPageActive()) { imRenderConversationList(); imRenderHeaderStatus(); }
      return;
    }
    if (type === 'presence') {
      if (payload.online) _imOnline.add(payload.accountId); else _imOnline.delete(payload.accountId);
      if (imCurrentPageActive()) { imRenderConversationList(); imRenderHeaderStatus(); }
      return;
    }
    if (type === 'im:typing') {
      const key = payload.conversationId + '::' + payload.accountId;
      if (payload.isTyping) _imTypingLive[key] = { conversationId: payload.conversationId, userId: payload.accountId, expiresAt: imNow() + IM_TYPING_TTL };
      else delete _imTypingLive[key];
      if (imCurrentPageActive()) imRenderTyping();
      return;
    }
    if (type === 'im:message') {
      if (!imData) return;
      const idx = imData.messages.findIndex(m => m.id === payload.id);
      if (idx === -1) imData.messages.push(payload); else imData.messages[idx] = payload;
      const conv = imData.conversations.find(c => c.id === payload.conversationId);
      if (conv && (!conv.lastMessageAt || payload.createdAt > conv.lastMessageAt)) conv.lastMessageAt = payload.createdAt;
      imPersistLocalCache();
      if (imCurrentPageActive()) {
        imRenderConversationList();
        if (imActiveConversationId === payload.conversationId) imRenderActiveConversation(false);
      }
      imUpdateSidebarUnread();
      return;
    }
    if (type === 'im:conversation') {
      if (!imData) return;
      const idx = imData.conversations.findIndex(c => c.id === payload.id);
      if (idx === -1) imData.conversations.push(payload); else imData.conversations[idx] = payload;
      imPersistLocalCache();
      if (imCurrentPageActive()) imRenderConversationList();
      return;
    }
    if (type === 'data:accounts') {
      // An account was created/renamed/deactivated/deleted somewhere in the
      // app - refresh the directory this module caches so names (and the
      // "Former account" placeholder for anyone no longer found) update
      // immediately, without needing a manual page reload.
      refreshImAccountsCache();
      return;
    }
    if (type.indexOf('call-') === 0 && typeof imCallHandleSignal === 'function') {
      imCallHandleSignal(Object.assign({ type: type }, payload));
      return;
    }
  };

  function imEmptyStore() {
    return { version: 1, conversations: [], messages: [] };
  }
  function imNormalizeStore(store) {
    const out = store && typeof store === 'object' ? store : imEmptyStore();
    if (!Array.isArray(out.conversations)) out.conversations = [];
    if (!Array.isArray(out.messages)) out.messages = [];
    out.version = 1;
    out.conversations.forEach(c => {
      if (!Array.isArray(c.participants)) c.participants = [];
      if (!Array.isArray(c.pinnedBy)) c.pinnedBy = [];
      if (!Array.isArray(c.mutedBy)) c.mutedBy = [];
      if (!Array.isArray(c.hiddenFor)) c.hiddenFor = [];
      if (!c.lastReadBy || typeof c.lastReadBy !== 'object') c.lastReadBy = {};
      if (!c.updatedAt) c.updatedAt = c.createdAt || new Date().toISOString();
      if (!c.lastMessageAt) c.lastMessageAt = c.updatedAt;
    });
    out.messages.forEach(m => {
      if (!m.reactions || typeof m.reactions !== 'object') m.reactions = {};
      if (!Array.isArray(m.attachments)) m.attachments = [];
      if (!Array.isArray(m.hiddenFor)) m.hiddenFor = [];
      if (!Array.isArray(m.pinnedBy)) m.pinnedBy = [];
    });
    return out;
  }

  let _imBootstrapInFlight = false;
  async function imBootstrapFromServer() {
    if (_imBootstrapInFlight || typeof window.ctgApiFetch !== 'function') return;
    _imBootstrapInFlight = true;
    try {
      const convRes = await window.ctgApiFetch('/api/messaging/conversations');
      const conversations = convRes.conversations || [];
      const messagesByConv = await Promise.all(conversations.map((c) =>
        window.ctgApiFetch('/api/messaging/conversations/' + encodeURIComponent(c.id) + '/messages').then((r) => r.messages || []).catch(() => [])
      ));
      imData = imNormalizeStore({ version: 1, conversations, messages: [].concat(...messagesByConv) });
      imPersistLocalCache();
      if (!imActiveConversationId || !imConversation(imActiveConversationId)) {
        const visible = imVisibleConversations();
        const general = conversations.find((c) => c.isGeneral);
        imActiveConversationId = visible.length ? visible[0].id : (general ? general.id : (conversations[0] && conversations[0].id));
      }
      if (imCurrentPageActive()) { imRenderConversationList(); imRenderActiveConversation(true); }
      imUpdateSidebarUnread();
    } catch (e) { console.warn('Could not load messaging data', e); }
    _imBootstrapInFlight = false;
  }

  function imReadStore() {
    const out = imNormalizeStore(imParse(IM_STORE_KEY, imEmptyStore()));
    let cleaned = false;
    out.messages.forEach(function (m) {
      if (m.deletedBackup && m.deletedAt && imNow() - imIsoTime(m.deletedAt) > IM_UNDO_MS) {
        delete m.deletedBackup; cleaned = true;
      }
    });
    if (cleaned) { try { localStorage.setItem(IM_STORE_KEY, JSON.stringify(out)); } catch (e) {} }
    return out;
  }
  function imWriteStore(options) {
    options = options || {};
    if (!imData) imData = imReadStore();
    const size = imStringifyBytes(imData);
    if (size > IM_MAX_STORE_BYTES && !options.force) {
      imToast('Messaging storage is nearly full. Remove large attachments before sending more files.', 'err');
      return false;
    }
    try {
      localStorage.setItem(IM_STORE_KEY, JSON.stringify(imData));
      if (imBroadcast) imBroadcast.postMessage({ type: 'store', at: imNow() });
      imUpdateSidebarUnread();
      return true;
    } catch (e) {
      imToast('Could not save the message. Browser storage may be full.', 'err');
      return false;
    }
  }

  function imEnsureGeneral() {
    if (!imData) imData = imReadStore();
    // CTG General is the clinic's staff channel: a law-firm account is not a
    // member (the server leaves it out), so no placeholder is drawn for it,
    // and any copy cached in this browser from before is dropped.
    const me = imCurrentUser();
    if (me && me.role === 'lawyer') {
      const isGeneral = c => c.isGeneral || c.id === 'im_general';
      const dropped = imData.conversations.filter(isGeneral).map(c => c.id);
      if (dropped.length) {
        imData.conversations = imData.conversations.filter(c => !isGeneral(c));
        imData.messages = imData.messages.filter(m => dropped.indexOf(m.conversationId) === -1);
        imWriteStore({ force: true });
      }
      return null;
    }
    let general = imData.conversations.find(c => c.isGeneral || c.id === 'im_general');
    let changed = false;
    if (!general) {
      const accountIds = imAccounts().map(u => u.id);
      const now = new Date().toISOString();
      general = {
        id: 'im_general', type: 'channel', name: 'CTG General', participants: accountIds,
        createdBy: 'system', createdAt: now, updatedAt: now, lastMessageAt: now,
        pinnedBy: [], mutedBy: [], hiddenFor: [], lastReadBy: {}, isGeneral: true
      };
      imData.conversations.push(general);
      imData.messages.push({
        id: imId('msg'), conversationId: general.id, senderId: 'system',
        body: 'Welcome to CTG Internal Messaging. Use this channel for portal-wide team updates and create direct or group chats for focused conversations.',
        createdAt: now, updatedAt: now, reactions: {}, attachments: [], hiddenFor: [], pinnedBy: []
      });
      changed = true;
    } else if (general.id === 'im_general') {
      const accountIds = imAccounts().map(u => u.id);
      const next = accountIds.slice().sort();
      const old = (general.participants || []).slice().sort();
      if (next.join('|') !== old.join('|')) { general.participants = accountIds; changed = true; }
      general.hiddenFor = [];
    }
    if (changed) imWriteStore({ force: true });
    return general;
  }
  function imLoad() {
    imData = imReadStore();
    const general = imEnsureGeneral();
    const user = imCurrentUser();
    if (!user) return;
    const saved = localStorage.getItem(IM_ACTIVE_KEY_PREFIX + user.id) || '';
    const visible = imVisibleConversations();
    const mostRecent = visible.slice().sort((a, b) => imIsoTime(b.lastMessageAt) - imIsoTime(a.lastMessageAt))[0] || general;
    if (saved && visible.some(c => c.id === saved)) imActiveConversationId = saved;
    else if (!imActiveConversationId || !visible.some(c => c.id === imActiveConversationId)) imActiveConversationId = mostRecent ? mostRecent.id : '';
  }

  function imVisibleConversations() {
    const user = imCurrentUser();
    if (!user || !imData) return [];
    return imData.conversations.filter(c => (c.participants || []).includes(user.id) && !(c.hiddenFor || []).includes(user.id));
  }
  function imConversation(id) { return imData && imData.conversations.find(c => c.id === id); }
  function imConversationMessages(id, includeHidden) {
    const user = imCurrentUser();
    return (imData ? imData.messages : []).filter(m => m.conversationId === id && (includeHidden || !user || !(m.hiddenFor || []).includes(user.id)))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  function imLastMessage(conversationId) {
    const rows = imConversationMessages(conversationId, true);
    return rows.length ? rows[rows.length - 1] : null;
  }
  function imOtherParticipants(conversation) {
    const user = imCurrentUser();
    return (conversation && conversation.participants || []).filter(id => !user || id !== user.id).map(imAccount);
  }
  function imConversationName(conversation) {
    if (!conversation) return 'Conversation';
    if (conversation.type === 'direct') {
      const other = imOtherParticipants(conversation)[0];
      return other ? other.displayName : 'Direct message';
    }
    // Default group names use first names only: full names collide often
    // enough (same last name, shared accounts) that they stop being useful
    // for telling conversations apart at a glance.
    return conversation.name || imOtherParticipants(conversation).map(u => imFirstName(u.displayName)).join(', ') || 'Group chat';
  }
  function imConversationAvatar(conversation) {
    if (!conversation) return '?';
    if (conversation.type === 'channel') return '#';
    // Derive initials from the conversation's own name instead of a fixed
    // 'G' for every group - otherwise unrelated group chats are visually
    // identical in the list.
    return imInitials(imConversationName(conversation)).toUpperCase() || '?';
  }
  function imConversationAvatarHTML(conversation) {
    if (conversation && conversation.icon) return '<img class="im-avatar-img" src="' + imEsc(conversation.icon) + '" alt="">';
    return imEsc(imConversationAvatar(conversation));
  }
  function imConversationIconEditable(conversation) {
    return !!(conversation && conversation.type !== 'direct' && !conversation.isGeneral && imCan('im.manage'));
  }
  function imIsoTime(value) {
    const d = new Date(value);
    return isNaN(d) ? 0 : d.getTime();
  }
  function imTime(value) {
    const d = new Date(value);
    if (isNaN(d)) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diff = now - d;
    if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function imFullTime(value) {
    const d = new Date(value);
    return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function imDateDivider(value) {
    const d = new Date(value);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  function imSameDate(a, b) {
    const da = new Date(a), db = new Date(b);
    return da.toDateString() === db.toDateString();
  }

  // Presence is now known directly from the shared WebSocket connection
  // (_imOnline, populated by ctgImHandleRealtime above) rather than a
  // localStorage heartbeat - being connected at all IS being online.
  function imSetPresence() {} // kept as a no-op so imStartRealtime's interval stays harmless
  function imIsOnline(userId) {
    const me = imCurrentUser();
    if (me && userId === me.id) return true;
    return _imOnline.has(userId);
  }

  function imSetTyping(on) {
    const user = imCurrentUser();
    const conversation = imConversation(imActiveConversationId);
    if (!user || !conversation) return;
    const participantIds = (conversation.participants || []).filter(id => id !== user.id);
    if (!participantIds.length || typeof window.ctgSendRealtime !== 'function') return;
    window.ctgSendRealtime({ type: 'typing', conversationId: conversation.id, participantIds, isTyping: !!on });
  }
  function imTypingUsers(conversationId) {
    const user = imCurrentUser();
    const now = imNow();
    return Object.values(_imTypingLive).filter(row => row.conversationId === conversationId && row.expiresAt > now && (!user || row.userId !== user.id)).map(row => imAccount(row.userId));
  }

  function imStartRealtime() {
    if (imHeartbeatTimer) return;
    imSetPresence();
    imHeartbeatTimer = setInterval(imSetPresence, IM_HEARTBEAT_MS);
    imRealtimeTimer = setInterval(function () {
      if (!imCurrentUser()) { imStopRealtime(); return; }
      if (imCurrentPageActive()) {
        imRenderTyping();
        imRenderHeaderStatus();
        imUpdateUndoCountdown();
      }
      imUpdateSidebarUnread();
    }, 1000);
  }
  function imStopRealtime() {
    clearInterval(imHeartbeatTimer); clearInterval(imRealtimeTimer);
    imHeartbeatTimer = null; imRealtimeTimer = null;
  }

  function imDrafts() { return imParse(IM_DRAFTS_KEY, {}); }
  function imDraftKey() {
    const user = imCurrentUser();
    return user && imActiveConversationId ? user.id + '::' + imActiveConversationId : '';
  }
  function imSaveDraft() {
    const key = imDraftKey(); if (!key) return;
    const box = document.getElementById('imComposerInput'); if (!box) return;
    const drafts = imDrafts();
    const value = box.value || '';
    if (value.trim()) drafts[key] = value;
    else delete drafts[key];
    try { localStorage.setItem(IM_DRAFTS_KEY, JSON.stringify(drafts)); } catch (e) {}
  }
  function imLoadDraft() {
    const key = imDraftKey();
    return key ? (imDrafts()[key] || '') : '';
  }
  function imClearDraft() {
    const key = imDraftKey(); if (!key) return;
    const drafts = imDrafts(); delete drafts[key];
    try { localStorage.setItem(IM_DRAFTS_KEY, JSON.stringify(drafts)); } catch (e) {}
  }

  function imUnreadCount(conversation) {
    const user = imCurrentUser(); if (!user || !conversation) return 0;
    const lastRead = imIsoTime((conversation.lastReadBy || {})[user.id]);
    return imConversationMessages(conversation.id, false).filter(m => m.senderId !== user.id && !m.deletedAt && imIsoTime(m.createdAt) > lastRead).length;
  }
  // Server ids are GUIDs; anything else is a local-only placeholder that
  // exists purely to keep the UI populated until the first server load lands.
  const IM_GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function imIsServerConversationId(id) { return IM_GUID_RE.test(String(id || '')); }

  function imMarkRead(conversationId) {
    const user = imCurrentUser(); const conversation = imConversation(conversationId);
    if (!user || !conversation) return;
    conversation.lastReadBy = conversation.lastReadBy || {};
    const latest = imLastMessage(conversationId);
    if (!latest) return;
    // Avoid cross-tab write loops: only persist when the newest message is
    // actually newer than this account's existing read cursor.
    if (imIsoTime(conversation.lastReadBy[user.id]) >= imIsoTime(latest.createdAt)) return;
    conversation.lastReadBy[user.id] = latest.createdAt;
    imWriteStore({ force: true });
    // Skip the server round-trip for the local placeholder channel that
    // imEnsureGeneral() creates before the first server load resolves - its
    // id ('im_general') isn't a real server id, so posting a read receipt
    // for it just errors out server-side.
    if (typeof window.ctgApiFetch === 'function' && imIsServerConversationId(conversationId)) {
      window.ctgApiFetch('/api/messaging/conversations/' + encodeURIComponent(conversationId) + '/read', { method: 'PATCH' }).catch(() => {});
    }
  }
  function imTotalUnread() {
    return imVisibleConversations().reduce((sum, c) => sum + imUnreadCount(c), 0);
  }
  function imUpdateSidebarUnread() {
    const badge = document.getElementById('imSidebarUnread');
    if (!badge) return;
    if (!imCurrentUser()) { badge.style.display = 'none'; return; }
    if (!imData) imData = imReadStore();
    imEnsureGeneral();
    const total = imTotalUnread();
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = total ? 'inline-flex' : 'none';
  }

  function imRenderMarkdown(text) {
    let out = imEsc(text || '');
    out = out.replace(/(https?:\/\/[^\s<]+)/g, function (url) { return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>'; });
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return out.replace(/\n/g, '<br>');
  }
  function imRegexEscape(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function imRenderMentions(text) {
    const source = String(text || '');
    const accounts = imAccounts();
    const aliases = [];
    const accountByAlias = {};
    accounts.forEach(function (account) {
      [account.displayName, account.username].forEach(function (alias) {
        alias = String(alias || '').trim();
        const key = alias.toLowerCase();
        if (!alias || accountByAlias[key]) return;
        accountByAlias[key] = account;
        aliases.push(alias);
      });
    });
    if (!aliases.length) return imRenderMarkdown(source);
    aliases.sort(function (a, b) { return b.length - a.length; });
    const re = new RegExp('(^|[^A-Za-z0-9_@])@(' + aliases.map(imRegexEscape).join('|') + ')(?=$|[\\s.,!?;:()\\[\\]{}])', 'gi');
    let out = '', last = 0, match;
    const current = imCurrentUser();
    while ((match = re.exec(source))) {
      out += imRenderMarkdown(source.slice(last, match.index));
      out += imRenderMarkdown(match[1] || '');
      const account = accountByAlias[String(match[2] || '').toLowerCase()];
      const mine = !!(current && account && account.id === current.id);
      out += '<span class="im-mention' + (mine ? ' is-me' : '') + '" data-user-id="' + imEsc(account ? account.id : '') + '">@' + imEsc(match[2]) + '</span>';
      last = match.index + match[0].length;
      if (!match[0].length) re.lastIndex++;
    }
    return out + imRenderMarkdown(source.slice(last));
  }
  function imHighlight(text, query) {
    const source = String(text || '');
    const q = String(query || '').trim();
    if (!q) return imRenderMentions(source);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'ig');
    let out = '', last = 0, match;
    while ((match = re.exec(source))) {
      out += imRenderMarkdown(source.slice(last, match.index));
      out += '<mark>' + imEsc(match[0]) + '</mark>';
      last = match.index + match[0].length;
      if (!match[0].length) re.lastIndex++;
    }
    return out + imRenderMarkdown(source.slice(last));
  }

  function imRenderInternalMessaging() {
    const mount = document.getElementById('imPageShell');
    if (!mount) return;
    const user = imCurrentUser();
    if (!user) {
      mount.innerHTML = '<div class="im-no-access"><strong>Sign in to use Internal Messaging.</strong></div>';
      return;
    }
    if (!imCan('im.read')) {
      mount.innerHTML = '<div class="im-no-access"><strong>Internal Messaging access is limited.</strong><span>An administrator can enable “View conversations” in Access Control.</span></div>';
      return;
    }
    imLoad();
    imStartRealtime();
    refreshImAccountsCache();
    imBootstrapFromServer();
    mount.innerHTML = imShellHTML();
    imRenderConversationList();
    imRenderActiveConversation(true);
    imUpdateSidebarUnread();
  }

  function imShellHTML() {
    const createDisabled = imCan('im.create') ? '' : ' disabled title="You do not have permission to create chats"';
    return '<aside class="im-left-panel">'
      + '<div class="im-left-head"><div><div class="im-kicker">Messaging</div><div class="im-left-title">Internal Messaging</div></div>'
      + '<button type="button" class="im-icon-btn im-new-chat-btn" data-onclick="imOpenChatModal(\'create\')" aria-label="New chat"' + createDisabled + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M12 7v8M8 11h8"/></svg></button></div>'
      + '<div class="im-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="imConversationSearch" type="text" placeholder="Search chats" value="' + imEsc(imConversationSearch) + '" data-oninput="imSearchConversations(this.value)"></div>'
      + '<div class="im-conversation-list" id="imConversationList"></div>'
      + '</aside>'
      + '<section class="im-main-panel">'
      + '<div class="im-chat-empty" id="imChatEmpty"><div class="im-empty-art">💬</div><strong>Select a conversation</strong><span>Your CTG team chats will appear here.</span></div>'
      + '<div class="im-chat-view" id="imChatView">'
      + '<header class="im-chat-head"><button class="im-icon-btn im-mobile-back" type="button" data-onclick="imMobileBack()" aria-label="Back to chats">←</button><div class="im-avatar" id="imHeaderAvatar">?</div><div class="im-chat-heading"><div class="im-chat-title" id="imHeaderTitle">Conversation</div><div class="im-chat-status" id="imHeaderStatus"></div></div>'
      + '<div class="im-head-actions"><button class="im-icon-btn" type="button" id="imCallBtn" data-onclick="imCallStart()" title="Start a voice call" data-cs="'+__cs+'display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button><button class="im-icon-btn" type="button" data-onclick="imToggleMessageSearch()" title="Search messages"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></button><button class="im-icon-btn" type="button" data-onclick="imToggleDetails()" title="Conversation details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button></div></header>'
      + '<div class="im-message-search" id="imMessageSearchBar"><div class="im-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="imMessageSearchInput" type="text" placeholder="Search in this conversation" value="' + imEsc(imMessageSearch) + '" data-oninput="imSearchMessages(this.value)"><button type="button" data-onclick="imCloseMessageSearch()">×</button></div></div>'
      + '<div class="im-message-list" id="imMessageList"></div>'
      + '<div class="im-typing" id="imTypingStatus"></div>'
      + imComposerHTML()
      + '</div></section>'
      + '<aside class="im-details-panel" id="imDetailsPanel"><div id="imDetailsMount"></div></aside>'
      + '<div class="im-undo-bar" id="imUndoBar"><span id="imUndoText">Message deleted.</span><button type="button" data-onclick="imRunUndo()">Undo</button><span id="imUndoCountdown"></span></div>'
      + imChatModalHTML();
  }

  function imComposerHTML() {
    if (!imCan('im.send')) return '<div class="im-composer-disabled">You can view messages, but sending is disabled for your account.</div>';
    return '<div class="im-composer" id="imComposer">'
      + '<div class="im-context-preview" id="imContextPreview"></div>'
      + '<div class="im-attachment-preview" id="imAttachmentPreview"></div>'
      + '<div class="im-compose-box">'
      + '<div class="im-format-row"><button type="button" data-onclick="imWrapSelection(\'**\',\'**\')" title="Bold"><strong>B</strong></button><button type="button" data-onclick="imWrapSelection(\'*\',\'*\')" title="Italic"><em>I</em></button><button type="button" data-onclick="imWrapSelection(\'`\',\'`\')" title="Inline code">&lt;/&gt;</button><button type="button" data-onclick="imToggleEmojiPicker()" title="Emoji">☺</button><button type="button" data-onclick="imInsertMentionTrigger()" title="Mention someone" aria-label="Mention someone"><strong>@</strong></button><button type="button" data-onclick="imChooseAttachment()" title="Attach a file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 1 1-2.8-2.8l8.9-8.9"/></svg></button><span class="im-compose-hint">Type @ to mention · Enter to send</span></div>'
      + '<div class="im-emoji-picker" id="imEmojiPicker">' + IM_EMOJIS.map(e => '<button type="button" data-onclick="imInsertEmoji(\'' + e + '\')">' + e + '</button>').join('') + '</div>'
      + '<div class="im-mention-menu" id="imMentionMenu" role="listbox"></div>'
      + '<div class="im-compose-row"><textarea id="imComposerInput" rows="1" maxlength="6000" placeholder="Type a message" data-oninput="imComposerChanged()" data-onkeydown="imComposerKeydown(event)" data-onselect="imRememberSelection();imUpdateMentionMenu()" data-onclick="imRememberSelection();imUpdateMentionMenu()"></textarea><button type="button" class="im-send-btn" id="imSendBtn" data-onclick="imSendMessage()" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></div>'
      + '<input type="file" id="imAttachmentInput" data-cs="'+__cs+'display:none" data-onchange="imAttachmentSelected(this)">'
      + '</div></div>';
  }

  function imChatModalHTML() {
    return '<div class="im-modal-overlay" id="imChatModal"><div class="im-modal" role="dialog" aria-modal="true"><div class="im-modal-head"><div><div class="im-kicker">Internal Messaging</div><div class="im-modal-title" id="imChatModalTitle">New chat</div></div><button type="button" class="im-icon-btn" data-onclick="imCloseChatModal()">×</button></div><div class="im-modal-body">'
      + '<div class="fg"><label>Conversation name</label><input type="text" id="imChatName" placeholder="Optional for a direct chat"></div>'
      + '<div class="im-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="imMemberSearch" placeholder="Search portal accounts" data-oninput="imRenderMemberPicker(this.value)"></div>'
      + '<div class="im-member-picker" id="imMemberPicker"></div></div><div class="im-modal-foot"><button type="button" class="btn btn-ghost" data-onclick="imCloseChatModal()">Cancel</button><button type="button" class="btn btn-primary" id="imChatModalSave" data-onclick="imSaveChatModal()">Start chat</button></div></div></div>';
  }

  function imRenderConversationList() {
    const mount = document.getElementById('imConversationList'); if (!mount || !imData) return;
    const user = imCurrentUser(); if (!user) return;
    const query = imConversationSearch.trim().toLowerCase();
    const rows = imVisibleConversations().filter(c => {
      if (!query) return true;
      const people = (c.participants || []).map(id => imAccount(id).displayName).join(' ');
      const msgText = imConversationMessages(c.id, false).slice(-20).map(m => m.body).join(' ');
      return (imConversationName(c) + ' ' + people + ' ' + msgText).toLowerCase().includes(query);
    }).sort((a, b) => {
      const ap = (a.pinnedBy || []).includes(user.id) ? 1 : 0;
      const bp = (b.pinnedBy || []).includes(user.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return imIsoTime(b.lastMessageAt) - imIsoTime(a.lastMessageAt);
    });
    if (!rows.length) {
      mount.innerHTML = '<div class="im-list-empty">No chats match your search.</div>';
      return;
    }
    mount.innerHTML = rows.map(c => {
      const last = imLastMessage(c.id);
      const unread = imUnreadCount(c);
      const muted = (c.mutedBy || []).includes(user.id);
      const pinned = (c.pinnedBy || []).includes(user.id);
      const other = c.type === 'direct' ? imOtherParticipants(c)[0] : null;
      const online = other && imIsOnline(other.id);
      let preview = last ? (last.callLog ? imCallLogLabel(last.callLog, last.senderId === user.id) : (last.deletedAt ? 'Message unsent' : (last.body || ((last.attachments || []).length ? 'Attachment' : 'New message')))) : 'No messages yet';
      if (last && last.senderId === user.id && !last.callLog) preview = 'You: ' + preview;
      return '<button type="button" class="im-conversation-row' + (c.id === imActiveConversationId ? ' active' : '') + (unread ? ' unread' : '') + '" data-onclick="imOpenConversation(\'' + imEsc(c.id) + '\')">'
        + '<span class="im-avatar im-avatar-small">' + imConversationAvatarHTML(c) + (other ? '<i class="im-presence-dot' + (online ? ' online' : '') + '"></i>' : '') + '</span>'
        + '<span class="im-conversation-copy"><span class="im-conversation-name">' + imEsc(imConversationName(c)) + (pinned ? '<span class="im-mini-icon">📌</span>' : '') + (muted ? '<span class="im-mini-icon">🔕</span>' : '') + '</span><span class="im-conversation-preview">' + imEsc(preview).slice(0, 95) + '</span></span>'
        + '<span class="im-conversation-meta"><time>' + imTime(c.lastMessageAt) + '</time>' + (unread ? '<b>' + (unread > 99 ? '99+' : unread) + '</b>' : '') + '</span></button>';
    }).join('');
  }

  function imRenderActiveConversation(scrollToBottom) {
    const conversation = imConversation(imActiveConversationId);
    const empty = document.getElementById('imChatEmpty');
    const view = document.getElementById('imChatView');
    if (!conversation) {
      if (empty) empty.style.display = 'flex';
      if (view) view.style.display = 'none';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (view) view.style.display = 'flex';
    const avatar = document.getElementById('imHeaderAvatar'); if (avatar) avatar.innerHTML = imConversationAvatarHTML(conversation);
    const title = document.getElementById('imHeaderTitle'); if (title) title.textContent = imConversationName(conversation);
    const callBtn = document.getElementById('imCallBtn');
    if (callBtn) {
      callBtn.style.display = '';
      callBtn.disabled = imCallState !== 'idle';
      callBtn.title = conversation.type === 'direct' ? 'Start a voice call' : 'Start a group call';
    }
    imRenderHeaderStatus();
    imRenderMessages(scrollToBottom);
    imRenderTyping();
    imRenderDetails();
    imRenderComposerState();
    imMarkRead(conversation.id);
    imRenderConversationList();
  }

  function imRenderHeaderStatus() {
    const el = document.getElementById('imHeaderStatus');
    const c = imConversation(imActiveConversationId);
    if (!el || !c) return;
    if (c.type === 'direct') {
      const other = imOtherParticipants(c)[0];
      el.innerHTML = other ? '<span class="im-status-dot' + (imIsOnline(other.id) ? ' online' : '') + '"></span>' + (imIsOnline(other.id) ? 'Online' : imRoleLabel(other.role)) : 'Direct message';
    } else {
      const online = (c.participants || []).filter(id => imIsOnline(id)).length;
      el.textContent = (c.participants || []).length + ' members' + (online ? ' · ' + online + ' online' : '');
    }
  }

  function imReadReceipt(message, conversation) {
    const user = imCurrentUser();
    if (!user || message.senderId !== user.id) return '';
    const readers = (conversation.participants || []).filter(id => id !== user.id && imIsoTime((conversation.lastReadBy || {})[id]) >= imIsoTime(message.createdAt)).map(id => imAccount(id).displayName);
    if (!readers.length) return 'Sent';
    if (readers.length === 1) return 'Read by ' + readers[0];
    return 'Read by ' + readers.length;
  }

  function imRenderMessages(scrollToBottom) {
    const mount = document.getElementById('imMessageList');
    const c = imConversation(imActiveConversationId);
    const user = imCurrentUser();
    if (!mount || !c || !user) return;
    let messages = imConversationMessages(c.id, false);
    const q = imMessageSearch.trim().toLowerCase();
    if (q) messages = messages.filter(m => String(m.body || '').toLowerCase().includes(q) || (m.attachments || []).some(a => String(a.name || '').toLowerCase().includes(q)));
    if (!messages.length) {
      mount.innerHTML = '<div class="im-message-empty">' + (q ? 'No messages match your search.' : 'No messages yet. Start the conversation below.') + '</div>';
      return;
    }
    let previous = null;
    mount.innerHTML = messages.map((m, index) => {
      const sender = imAccount(m.senderId);
      const mine = m.senderId === user.id;
      const deleted = !!m.deletedAt;
      const showDivider = !previous || !imSameDate(previous.createdAt, m.createdAt);
      const showSender = !previous || previous.senderId !== m.senderId || (imIsoTime(m.createdAt) - imIsoTime(previous.createdAt) > 5 * 60000) || showDivider;
      previous = m;
      if (m.callLog) {
        const parts = imCallLogParts(m.callLog, mine);
        const subtitle = (parts.subtitle ? imEsc(parts.subtitle) + ' · ' : '') + imTime(m.createdAt);
        // Only the three outcomes the app writes become a class name; anything
        // else stored on a message is never pasted into the markup.
        const outcomeClass = IM_CALL_OUTCOMES.indexOf(m.callLog.outcome) !== -1 ? m.callLog.outcome : 'noanswer';
        return (showDivider ? '<div class="im-date-divider"><span>' + imDateDivider(m.createdAt) + '</span></div>' : '')
          + '<div class="im-call-log-row' + (mine ? ' mine' : '') + '"><div class="im-call-log-card im-call-log-' + outcomeClass + '">'
          + '<span class="im-call-log-avatar">' + IM_PHONE_ICON + '</span>'
          + '<span class="im-call-log-text"><strong>' + imEsc(parts.title) + '</strong><span>' + subtitle + '</span></span>'
          + '</div></div>';
      }
      const reply = m.replyTo ? imData.messages.find(x => x.id === m.replyTo) : null;
      const reactions = Object.keys(m.reactions || {}).filter(e => (m.reactions[e] || []).length);
      const canEdit = mine && !deleted && imCan('im.editOwn');
      const canDelete = mine && imCan('im.deleteOwn');
      const undoAvailable = deleted && mine && imNow() - imIsoTime(m.deletedAt) <= IM_UNDO_MS && m.deletedBackup;
      const isPinnedByMe = (m.pinnedBy || []).includes(user.id);
      const menuItems = [];
      if (imCan('im.react')) {
        menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imReplyToMessage(\'' + m.id + '\')"><span>↩</span><b>Reply</b></button>');
        menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imToggleReactionMenu(\'' + m.id + '\')"><span>☺</span><b>More reactions</b></button>');
      }
      if (canEdit) menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imEditMessage(\'' + m.id + '\')"><span>✎</span><b>Edit</b></button>');
      if (canDelete) menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imUnsendMessage(\'' + m.id + '\')"><span>↶</span><b>Unsend for everyone</b></button>');
      menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imDeleteForMe(\'' + m.id + '\')"><span>⌫</span><b>Delete for me</b></button>');
      menuItems.push('<button type="button" data-onclick="imCloseMessageMenus();imToggleMessagePin(\'' + m.id + '\')"><span>📌</span><b>' + (isPinnedByMe ? 'Unpin' : 'Pin') + '</b></button>');
      const quickReactionButtons = imCan('im.react') ? IM_QUICK_REACTIONS.map(e => '<button type="button" class="im-quick-reaction" data-onclick="imReact(\'' + m.id + '\',\'' + e + '\')" title="React ' + e + '">' + e + '</button>').join('') : '';
      const actionBar = deleted ? '' : '<div class="im-message-actions">' + quickReactionButtons
        + '<span class="im-message-more-wrap"><button type="button" class="im-message-more" data-onclick="imToggleMessageMenu(\'' + m.id + '\',event)" title="More options" aria-label="More message options">•••</button>'
        + '<span class="im-message-menu" id="imMessageMenu-' + m.id + '">' + menuItems.join('') + '</span></span></div>';
      const reactionPicker = '<div class="im-reaction-picker" id="imReactionPicker-' + m.id + '">' + IM_REACTION_EMOJIS.map(e => '<button type="button" data-onclick="imReact(\'' + m.id + '\',\'' + e + '\')">' + e + '</button>').join('') + '</div>';
      const attachments = deleted ? '' : imAttachmentHTML(m.attachments || []);
      const body = deleted ? '<div class="im-deleted-body">This message was unsent.' + (undoAvailable ? ' <button type="button" data-onclick="imUndoUnsend(\'' + m.id + '\')">Undo</button>' : '') + '</div>' : '<div class="im-message-body">' + imHighlight(m.body || '', q) + '</div>';
      const replyHTML = reply ? '<button class="im-reply-quote" type="button" data-onclick="imJumpToMessage(\'' + reply.id + '\')"><strong>' + imEsc(imAccount(reply.senderId).displayName) + '</strong><span>' + imEsc(reply.deletedAt ? 'Message unsent' : (reply.body || 'Attachment')).slice(0, 130) + '</span></button>' : '';
      const reactionHTML = reactions.length ? '<div class="im-reactions">' + reactions.map(e => {
        const people = m.reactions[e] || [];
        // e is stored data another person chose, so it is escaped and handed to
        // imReact through a data attribute, never pasted into the handler.
        return '<button type="button" class="' + (people.includes(user.id) ? 'mine' : '') + '" data-emoji="' + imEsc(e) + '" data-onclick="imReact(\'' + m.id + '\',this.dataset.emoji)" title="' + imEsc(people.map(id => imAccount(id).displayName).join(', ')) + '"><span>' + imEsc(e) + '</span>' + people.length + '</button>';
      }).join('') + '</div>' : '';
      const pin = (m.pinnedBy || []).length ? '<span class="im-message-pin">📌 Pinned</span>' : '';
      const receipt = index === messages.length - 1 ? imReadReceipt(m, c) : '';
      return (showDivider ? '<div class="im-date-divider"><span>' + imDateDivider(m.createdAt) + '</span></div>' : '')
        + '<article class="im-message' + (mine ? ' mine' : '') + (deleted ? ' deleted' : '') + '" id="im-message-' + m.id + '">'
        + (showSender ? '<div class="im-avatar im-message-avatar">' + imEsc(m.senderId === 'system' ? 'CTG' : imInitials(sender.displayName).toUpperCase()) + '</div>' : '<div class="im-message-avatar-spacer"></div>')
        + '<div class="im-message-content">' + actionBar + (showSender ? '<div class="im-message-meta"><strong>' + imEsc(sender.displayName) + '</strong><time title="' + imFullTime(m.createdAt) + '">' + imTime(m.createdAt) + '</time>' + (m.editedAt ? '<span>Edited</span>' : '') + pin + '</div>' : '')
        + replyHTML + body + attachments + reactionHTML + (receipt ? '<div class="im-read-receipt">' + imEsc(receipt) + '</div>' : '') + reactionPicker + '</div></article>';
    }).join('');
    if (scrollToBottom) requestAnimationFrame(() => { mount.scrollTop = mount.scrollHeight; });
  }

  function imAttachmentHTML(attachments) {
    if (!attachments.length) return '';
    return '<div class="im-message-attachments">' + attachments.map(a => {
      const safeName = imEsc(a.name || 'Attachment');
      // Uploaded files are served from the API (authenticated per request);
      // dataUrl only appears for a file still being uploaded in this tab.
      // A link is drawn only to the portal's own file route, or to a file
      // still being uploaded in this tab - never to an address a sender made up.
      const href = (a.url && /^\/api\/attachments\/[A-Za-z0-9_-]+$/.test(a.url)) ? (window.ctgApiBaseUrl || '') + a.url
        : (a.dataUrl && /^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(a.dataUrl)) ? a.dataUrl : '';
      const mime = String(a.contentType || a.type || '');
      const looksImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name || '');
      // Files sent before server-side file sharing existed never left the
      // sender's browser, so other people have the name but no data. Say so
      // plainly instead of offering a link that goes nowhere.
      if (!href) {
        return '<div class="im-file-attachment is-unavailable" title="This file was sent before file sharing was enabled, so it was never uploaded"><span class="im-file-icon">⚠</span><span><strong>' + safeName + '</strong><small>Unavailable — sent before file sharing was enabled</small></span></div>';
      }
      if (looksImage) {
        return '<a class="im-image-attachment" href="' + imEsc(href) + '" target="_blank" rel="noopener"><img src="' + imEsc(href) + '" alt="' + safeName + '" loading="lazy"><span>' + safeName + '</span></a>';
      }
      return '<a class="im-file-attachment" href="' + imEsc(href) + '"' + (a.url ? ' target="_blank" rel="noopener"' : ' download="' + safeName + '"') + '><span class="im-file-icon">📎</span><span><strong>' + safeName + '</strong><small>' + imFormatBytes(a.size || 0) + '</small></span></a>';
    }).join('') + '</div>';
  }
  function imFormatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function imRenderTyping() {
    const el = document.getElementById('imTypingStatus'); if (!el || !imActiveConversationId) return;
    const users = imTypingUsers(imActiveConversationId);
    if (!users.length) { el.innerHTML = ''; el.classList.remove('show'); return; }
    const names = users.slice(0, 2).map(u => u.displayName);
    const label = users.length === 1 ? names[0] + ' is typing' : (users.length === 2 ? names.join(' and ') + ' are typing' : names.join(', ') + ' and others are typing');
    el.innerHTML = '<span class="im-typing-dots"><i></i><i></i><i></i></span>' + imEsc(label);
    el.classList.add('show');
  }

  function imRenderDetails() {
    const panel = document.getElementById('imDetailsPanel');
    const mount = document.getElementById('imDetailsMount');
    const c = imConversation(imActiveConversationId);
    const user = imCurrentUser();
    if (!panel || !mount || !c || !user) return;
    panel.classList.toggle('open', imDetailsOpen);
    document.getElementById('imPageShell')?.classList.toggle('im-details-open', imDetailsOpen);
    const members = (c.participants || []).map(imAccount);
    const pinnedMessages = imConversationMessages(c.id, false).filter(m => (m.pinnedBy || []).length && !m.deletedAt);
    const muted = (c.mutedBy || []).includes(user.id);
    const favorite = (c.pinnedBy || []).includes(user.id);
    const manage = c.type !== 'direct' && !c.isGeneral && imCan('im.manage');
    const editableIcon = imConversationIconEditable(c);
    const avatarHero = editableIcon
      ? '<button type="button" class="im-avatar im-details-avatar im-avatar-edit" data-onclick="imChooseConversationIcon()" title="Change photo">' + imConversationAvatarHTML(c) + '<span class="im-avatar-edit-badge">📷</span></button>'
      : '<div class="im-avatar im-details-avatar">' + imConversationAvatarHTML(c) + '</div>';
    mount.innerHTML = '<div class="im-details-head"><strong>Conversation details</strong><button class="im-icon-btn" type="button" data-onclick="imToggleDetails()">×</button></div>'
      + '<div class="im-details-hero">' + avatarHero + '<strong>' + imEsc(imConversationName(c)) + '</strong><span>' + (c.type === 'channel' ? 'Team channel' : c.type === 'group' ? 'Group chat' : 'Direct message') + '</span>'
      + (editableIcon && c.icon ? '<button type="button" class="im-avatar-remove" data-onclick="imRemoveConversationIcon()">Remove photo</button>' : '')
      + (editableIcon ? '<input type="file" id="imIconInput" accept="image/*" data-cs="'+__cs+'display:none" data-onchange="imIconFileSelected(this)">' : '')
      + '</div>'
      + '<div class="im-details-actions"><button type="button" data-onclick="imToggleFavorite()"><span>' + (favorite ? '★' : '☆') + '</span>' + (favorite ? 'Favorited' : 'Favorite') + '</button><button type="button" data-onclick="imToggleMute()"><span>' + (muted ? '🔔' : '🔕') + '</span>' + (muted ? 'Unmute' : 'Mute') + '</button>' + (manage ? '<button type="button" data-onclick="imOpenChatModal(\'manage\')"><span>✎</span>Manage</button>' : '') + '</div>'
      + imDetailsMediaFilesHTML(c)
      + '<div class="im-details-section"><div class="im-details-section-title">Members <span>' + members.length + '</span></div><div class="im-member-list">' + members.map(m => '<div><span class="im-avatar im-member-avatar">' + imEsc(imInitials(m.displayName).toUpperCase()) + '<i class="im-presence-dot' + (imIsOnline(m.id) ? ' online' : '') + '"></i></span><span><strong>' + imEsc(m.displayName) + '</strong><small>' + imEsc(imRoleLabel(m.role)) + (m.id === user.id ? ' · You' : '') + '</small></span></div>').join('') + '</div></div>'
      + '<div class="im-details-section"><div class="im-details-section-title">Pinned messages <span>' + pinnedMessages.length + '</span></div><div class="im-pinned-list">' + (pinnedMessages.length ? pinnedMessages.slice(-10).reverse().map(m => '<button type="button" data-onclick="imJumpToMessage(\'' + m.id + '\')"><strong>' + imEsc(imAccount(m.senderId).displayName) + '</strong><span>' + imEsc(m.body || 'Attachment').slice(0, 100) + '</span></button>').join('') : '<div class="im-details-empty">No pinned messages.</div>') + '</div></div>'
      + (c.isGeneral ? '' : '<div class="im-details-danger"><button type="button" data-onclick="imHideConversation()">Hide conversation</button></div>');
  }

  function imConversationAttachments(conversationId) {
    const media = [], files = [];
    imConversationMessages(conversationId, false).forEach(function (m) {
      if (m.deletedAt) return;
      (m.attachments || []).forEach(function (a) {
        const row = { att: a, messageId: m.id, senderId: m.senderId, createdAt: m.createdAt };
        if (String(a.type || '').startsWith('image/') && a.dataUrl) media.push(row); else files.push(row);
      });
    });
    media.reverse(); files.reverse();
    return { media: media, files: files };
  }
  function imSetDetailsMediaTab(tab) {
    imDetailsMediaTab = tab === 'files' ? 'files' : 'media';
    imRenderDetails();
  }
  function imDetailsMediaFilesHTML(c) {
    const data = imConversationAttachments(c.id);
    const tab = imDetailsMediaTab === 'files' ? 'files' : 'media';
    const list = tab === 'files' ? data.files : data.media;
    const other = c.type === 'direct' ? imOtherParticipants(c)[0] : null;
    const withWhom = other ? ('with ' + other.displayName) : 'in this conversation';
    let body;
    if (!list.length) {
      body = '<div class="im-mediafiles-empty"><span>' + (tab === 'files' ? '📄' : '🖼️') + '</span><strong>No ' + (tab === 'files' ? 'files' : 'media') + '</strong><span>' + (tab === 'files' ? 'Files' : 'Photos and videos') + ' shared ' + imEsc(withWhom) + ' will appear here.</span></div>';
    } else if (tab === 'media') {
      body = '<div class="im-media-grid">' + list.map(function (row) {
        return '<button type="button" class="im-media-thumb" data-onclick="imJumpToMessage(\'' + row.messageId + '\')" title="' + imEsc(row.att.name || '') + '"><img src="' + imEsc(row.att.dataUrl || '') + '" alt="' + imEsc(row.att.name || '') + '" loading="lazy"></button>';
      }).join('') + '</div>';
    } else {
      body = '<div class="im-files-list">' + list.map(function (row) {
        return '<a class="im-file-row" href="' + imEsc(row.att.dataUrl || '#') + '" download="' + imEsc(row.att.name || 'file') + '"><span class="im-file-icon">📎</span><span><strong>' + imEsc(row.att.name || 'Attachment') + '</strong><small>' + imFormatBytes(row.att.size || 0) + '</small></span></a>';
      }).join('') + '</div>';
    }
    return '<div class="im-details-section im-mediafiles-section"><div class="im-mediafiles-tabs">'
      + '<button type="button" class="im-mediafiles-tab' + (tab === 'media' ? ' active' : '') + '" data-onclick="imSetDetailsMediaTab(\'media\')">Media' + (data.media.length ? ' <b>' + data.media.length + '</b>' : '') + '</button>'
      + '<button type="button" class="im-mediafiles-tab' + (tab === 'files' ? ' active' : '') + '" data-onclick="imSetDetailsMediaTab(\'files\')">Files' + (data.files.length ? ' <b>' + data.files.length + '</b>' : '') + '</button>'
      + '</div>' + body + '</div>';
  }

  function imChooseConversationIcon() {
    const c = imConversation(imActiveConversationId);
    if (!imConversationIconEditable(c)) return;
    document.getElementById('imIconInput')?.click();
  }
  function imIconFileSelected(input) {
    const file = input && input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const c = imConversation(imActiveConversationId);
    if (!imConversationIconEditable(c)) return;
    if (!String(file.type || '').startsWith('image/')) { imToast('Choose an image file for the conversation photo.', 'err'); return; }
    if (file.size > IM_MAX_ICON_BYTES) { imToast('Photos are limited to 300 KB while messaging uses localStorage.', 'err'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      c.icon = String(reader.result || '');
      c.updatedAt = new Date().toISOString();
      imWriteStore({ force: true });
      imRenderActiveConversation(false);
    };
    reader.onerror = function () { imToast('Could not read the selected image.', 'err'); };
    reader.readAsDataURL(file);
  }
  function imRemoveConversationIcon() {
    const c = imConversation(imActiveConversationId);
    if (!imConversationIconEditable(c) || !c.icon) return;
    delete c.icon;
    c.updatedAt = new Date().toISOString();
    imWriteStore({ force: true });
    imRenderActiveConversation(false);
  }

  function imRenderComposerState() {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    if (!imEditingMessageId) box.value = imLoadDraft();
    imAutoSize(box);
    imRenderContextPreview();
    imRenderAttachmentPreview();
    const picker = document.getElementById('imEmojiPicker'); if (picker) picker.classList.toggle('open', imEmojiOpen);
  }
  function imRenderContextPreview() {
    const el = document.getElementById('imContextPreview'); if (!el) return;
    if (imEditingMessageId) {
      const m = imData.messages.find(x => x.id === imEditingMessageId);
      el.innerHTML = m ? '<div><strong>Editing message</strong><span>' + imEsc(m.body).slice(0, 180) + '</span></div><button type="button" data-onclick="imCancelContext()">×</button>' : '';
      el.classList.toggle('show', !!m); return;
    }
    if (imReplyToId) {
      const m = imData.messages.find(x => x.id === imReplyToId);
      el.innerHTML = m ? '<div><strong>Replying to ' + imEsc(imAccount(m.senderId).displayName) + '</strong><span>' + imEsc(m.deletedAt ? 'Message unsent' : (m.body || 'Attachment')).slice(0, 180) + '</span></div><button type="button" data-onclick="imCancelContext()">×</button>' : '';
      el.classList.toggle('show', !!m); return;
    }
    el.innerHTML = ''; el.classList.remove('show');
  }
  function imRenderAttachmentPreview() {
    const el = document.getElementById('imAttachmentPreview'); if (!el) return;
    if (!imPendingAttachment) { el.innerHTML = ''; el.classList.remove('show'); return; }
    el.innerHTML = '<div><span class="im-file-icon">📎</span><span><strong>' + imEsc(imPendingAttachment.name) + '</strong><small>' + imFormatBytes(imPendingAttachment.size) + '</small></span></div><button type="button" data-onclick="imClearAttachment()">×</button>';
    el.classList.add('show');
  }

  function imOpenConversation(id) {
    if (!imConversation(id)) return;
    imSetTyping(false);
    imActiveConversationId = id;
    imReplyToId = null; imEditingMessageId = null; imPendingAttachment = null; imEmojiOpen = false; imCloseMentionMenu();
    const user = imCurrentUser(); if (user) localStorage.setItem(IM_ACTIVE_KEY_PREFIX + user.id, id);
    imMobileThread = true;
    const shell = document.getElementById('imPageShell'); if (shell) shell.classList.add('im-mobile-thread');
    imRenderConversationList();
    imRenderActiveConversation(true);
  }
  function imMobileBack() {
    imMobileThread = false;
    const shell = document.getElementById('imPageShell'); if (shell) shell.classList.remove('im-mobile-thread');
  }
  function imSearchConversations(value) { imConversationSearch = value || ''; imRenderConversationList(); }
  function imSearchMessages(value) { imMessageSearch = value || ''; imRenderMessages(false); }
  function imToggleMessageSearch() {
    const bar = document.getElementById('imMessageSearchBar'); if (!bar) return;
    const open = !bar.classList.contains('open');
    bar.classList.toggle('open', open);
    if (open) setTimeout(() => document.getElementById('imMessageSearchInput')?.focus(), 0);
  }
  function imCloseMessageSearch() {
    imMessageSearch = '';
    const input = document.getElementById('imMessageSearchInput'); if (input) input.value = '';
    document.getElementById('imMessageSearchBar')?.classList.remove('open');
    imRenderMessages(false);
  }
  function imToggleDetails() { imDetailsOpen = !imDetailsOpen; imRenderDetails(); }

  function imMentionMembers() {
    const conversation = imConversation(imActiveConversationId);
    const ids = conversation && Array.isArray(conversation.participants) ? conversation.participants : [];
    return ids.map(imAccount).filter(function (account) { return account && account.id && account.id !== 'system'; });
  }
  function imMentionContext(box) {
    if (!box) return null;
    const caret = box.selectionStart == null ? box.value.length : box.selectionStart;
    const before = box.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    const prior = at > 0 ? before.charAt(at - 1) : '';
    if (prior && !/[\s([{"'`]/.test(prior)) return null;
    const query = before.slice(at + 1);
    if (query.length > 60 || query.indexOf('\n') !== -1 || /[.,!?;:)\]{}]/.test(query)) return null;
    if (/\s$/.test(query)) {
      const exact = query.trim().toLowerCase();
      if (exact && imMentionMembers().some(function (account) {
        return account.displayName.toLowerCase() === exact || account.username.toLowerCase() === exact;
      })) return null;
    }
    return { start: at, caret: caret, query: query };
  }
  function imCloseMentionMenu() {
    imMentionOpen = false; imMentionStart = -1; imMentionQuery = ''; imMentionSelectedIndex = 0; imMentionCandidates = [];
    const menu = document.getElementById('imMentionMenu');
    if (menu) { menu.classList.remove('open'); menu.innerHTML = ''; }
  }
  function imUpdateMentionMenu() {
    const box = document.getElementById('imComposerInput');
    const menu = document.getElementById('imMentionMenu');
    if (!box || !menu) return;
    const context = imMentionContext(box);
    if (!context) { imCloseMentionMenu(); return; }
    const q = context.query.trim().toLowerCase();
    if (context.query !== imMentionQuery) imMentionSelectedIndex = 0;
    imMentionCandidates = imMentionMembers().filter(function (account) {
      return !q || (account.displayName + ' ' + account.username + ' ' + imRoleLabel(account.role)).toLowerCase().includes(q);
    }).sort(function (a, b) {
      const an = a.displayName.toLowerCase(), bn = b.displayName.toLowerCase();
      const as = q && (an.startsWith(q) || a.username.toLowerCase().startsWith(q)) ? 1 : 0;
      const bs = q && (bn.startsWith(q) || b.username.toLowerCase().startsWith(q)) ? 1 : 0;
      return bs - as || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    }).slice(0, 8);
    if (!imMentionCandidates.length) { imCloseMentionMenu(); return; }
    imMentionOpen = true; imMentionStart = context.start; imMentionQuery = context.query;
    imEmojiOpen = false; document.getElementById('imEmojiPicker')?.classList.remove('open');
    if (imMentionSelectedIndex >= imMentionCandidates.length) imMentionSelectedIndex = 0;
    menu.innerHTML = imMentionCandidates.map(function (account, index) {
      return '<button type="button" class="im-mention-option' + (index === imMentionSelectedIndex ? ' active' : '') + '" role="option" aria-selected="' + (index === imMentionSelectedIndex ? 'true' : 'false') + '" data-onmousedown="event.preventDefault();imSelectMention(\'' + account.id + '\')">'
        + '<span class="im-member-avatar">' + imEsc(imInitials(account.displayName).toUpperCase()) + '</span>'
        + '<span><strong>' + imEsc(account.displayName) + '</strong><small>@' + imEsc(account.username || account.displayName) + ' · ' + imEsc(imRoleLabel(account.role)) + '</small></span></button>';
    }).join('');
    menu.classList.add('open');
  }
  function imMoveMentionSelection(delta) {
    if (!imMentionCandidates.length) return;
    imMentionSelectedIndex = (imMentionSelectedIndex + delta + imMentionCandidates.length) % imMentionCandidates.length;
    imUpdateMentionMenu();
    document.querySelector('#imMentionMenu .im-mention-option.active')?.scrollIntoView({ block: 'nearest' });
  }
  function imSelectMention(accountId) {
    const box = document.getElementById('imComposerInput');
    const account = imMentionCandidates.find(function (u) { return u.id === accountId; }) || imAccount(accountId);
    if (!box || !account || imMentionStart < 0) return;
    const caret = box.selectionStart == null ? box.value.length : box.selectionStart;
    const insertion = '@' + account.displayName + ' ';
    box.value = box.value.slice(0, imMentionStart) + insertion + box.value.slice(caret);
    const next = imMentionStart + insertion.length;
    box.focus(); box.setSelectionRange(next, next);
    imCloseMentionMenu(); imComposerChanged();
  }
  function imInsertMentionTrigger() {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    const start = box.selectionStart == null ? box.value.length : box.selectionStart;
    const end = box.selectionEnd == null ? start : box.selectionEnd;
    const prefix = start > 0 && !/\s/.test(box.value.charAt(start - 1)) ? ' @' : '@';
    box.value = box.value.slice(0, start) + prefix + box.value.slice(end);
    const caret = start + prefix.length;
    box.focus(); box.setSelectionRange(caret, caret); imComposerChanged();
  }
  function imComposerChanged() {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    imAutoSize(box); imRememberSelection(); imUpdateMentionMenu();
    if (!imEditingMessageId) imSaveDraft();
    const has = !!box.value.trim();
    const now = imNow();
    if (has && now - imTypingWriteAt > 700) { imTypingWriteAt = now; imSetTyping(true); }
    if (!has) imSetTyping(false);
  }
  function imComposerKeydown(event) {
    if (imMentionOpen) {
      if (event.key === 'ArrowDown') { event.preventDefault(); imMoveMentionSelection(1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); imMoveMentionSelection(-1); return; }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault();
        const selected = imMentionCandidates[imMentionSelectedIndex];
        if (selected) imSelectMention(selected.id);
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); imCloseMentionMenu(); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); imSendMessage();
    }
    if (event.key === 'Escape') imCancelContext();
  }
  function imRememberSelection() {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    imComposerSelection = { start: box.selectionStart || 0, end: box.selectionEnd || 0 };
  }
  function imAutoSize(box) {
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight, 160) + 'px';
    box.style.overflowY = box.scrollHeight > 160 ? 'auto' : 'hidden';
  }
  function imWrapSelection(before, after) {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    const start = box.selectionStart || imComposerSelection.start || 0;
    const end = box.selectionEnd || imComposerSelection.end || 0;
    const selected = box.value.slice(start, end);
    box.value = box.value.slice(0, start) + before + selected + after + box.value.slice(end);
    const caret = end + before.length + after.length;
    box.focus(); box.setSelectionRange(caret, caret); imComposerChanged();
  }
  function imToggleEmojiPicker() { imCloseMentionMenu(); imEmojiOpen = !imEmojiOpen; document.getElementById('imEmojiPicker')?.classList.toggle('open', imEmojiOpen); }
  function imInsertEmoji(emoji) {
    const box = document.getElementById('imComposerInput'); if (!box) return;
    const start = box.selectionStart == null ? box.value.length : box.selectionStart;
    const end = box.selectionEnd == null ? start : box.selectionEnd;
    box.value = box.value.slice(0, start) + emoji + box.value.slice(end);
    box.focus(); box.setSelectionRange(start + emoji.length, start + emoji.length);
    imEmojiOpen = false; imComposerChanged(); document.getElementById('imEmojiPicker')?.classList.remove('open');
  }
  function imChooseAttachment() { document.getElementById('imAttachmentInput')?.click(); }
  function imAttachmentSelected(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (file.size > IM_MAX_ATTACHMENT_BYTES) { imToast('Files must be under 8 MB.', 'err'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function () {
      imPendingAttachment = { id: imId('att'), name: file.name || 'Attachment', type: file.type || 'application/octet-stream', size: file.size || 0, dataUrl: String(reader.result || '') };
      imRenderAttachmentPreview(); input.value = '';
    };
    reader.onerror = function () { imToast('Could not read the selected file.', 'err'); input.value = ''; };
    reader.readAsDataURL(file);
  }
  function imClearAttachment() { imPendingAttachment = null; imRenderAttachmentPreview(); }

  // Uploads whatever is attached to this message to Blob Storage and returns
  // the server-side references to store on the message. The local base64
  // preview is swapped for the uploaded reference in place, so the sender's
  // own view switches to the same URL everyone else will load.
  function imUploadPendingAttachments(conversationId, message) {
    const pending = (message.attachments || []).filter(function (a) { return a && a.dataUrl && !a.url; });
    if (!pending.length) return Promise.resolve([]);
    return Promise.all(pending.map(function (a) {
      // dataUrl is "data:<mime>;base64,<payload>" - the API wants the payload alone.
      const base64 = String(a.dataUrl).split(',')[1] || '';
      return window.ctgApiFetch('/api/attachments', {
        method: 'POST',
        body: JSON.stringify({ conversationId: conversationId, name: a.name, contentType: a.type, data: base64 })
      }).then(function (res) {
        a.id = res.id; a.url = res.url; a.size = res.size;
        delete a.dataUrl; // drop the heavy copy now that it lives on the server
        return { id: res.id, name: res.name, contentType: res.contentType, size: res.size, url: res.url };
      });
    })).then(function (uploaded) {
      imPersistLocalCache();
      return uploaded;
    }).catch(function (err) {
      imToast(err.message || 'Could not upload the attachment', 'err');
      return [];
    });
  }

  function imSendMessage() {
    const user = imCurrentUser(); const conversation = imConversation(imActiveConversationId);
    const box = document.getElementById('imComposerInput');
    if (!user || !conversation || !box || !imCan('im.send')) return;
    const body = box.value.trim();
    if (!body && !imPendingAttachment) return;
    const now = new Date().toISOString();
    let message, isEdit = false;
    const replyTo = imReplyToId;
    if (imEditingMessageId) {
      message = imData.messages.find(m => m.id === imEditingMessageId);
      if (!message || message.senderId !== user.id || !imCan('im.editOwn')) return;
      isEdit = true;
      message.editHistory = Array.isArray(message.editHistory) ? message.editHistory : [];
      message.editHistory.push({ body: message.body, editedAt: now });
      message.body = body;
      message.editedAt = now; message.updatedAt = now;
      imEditingMessageId = null;
    } else {
      message = {
        id: imId('msg'), conversationId: conversation.id, senderId: user.id, body,
        createdAt: now, updatedAt: now, replyTo: imReplyToId || '', reactions: {},
        attachments: imPendingAttachment ? [imPendingAttachment] : [], hiddenFor: [], pinnedBy: []
      };
      imData.messages.push(message);
      conversation.lastMessageAt = now;
      conversation.updatedAt = now;
      conversation.hiddenFor = (conversation.hiddenFor || []).filter(id => id !== user.id);
    }
    if (!imWriteStore()) return;
    box.value = ''; imAutoSize(box);
    imReplyToId = null; imPendingAttachment = null; imEmojiOpen = false; imCloseMentionMenu();
    imClearDraft(); imSetTyping(false);
    imRenderConversationList(); imRenderActiveConversation(true);

    // Persist to the real backend so other signed-in accounts see it live.
    // An attachment is uploaded to Blob Storage first, and the resulting
    // server-hosted reference (not the local base64) is what gets stored on
    // the message so every participant can load it.
    if (typeof window.ctgApiFetch !== 'function') return;
    const req = isEdit
      ? window.ctgApiFetch('/api/messaging/messages/' + encodeURIComponent(message.id), { method: 'PATCH', body: JSON.stringify({ body }) })
      : imUploadPendingAttachments(conversation.id, message).then(function (uploaded) {
          return window.ctgApiFetch('/api/messaging/conversations/' + encodeURIComponent(conversation.id) + '/messages', {
            method: 'POST',
            body: JSON.stringify({ body, replyTo: replyTo || undefined, attachments: uploaded })
          });
        });
    req.then((res) => {
      if (res && res.message) {
        Object.assign(message, res.message); // updates id (temp -> real) in place - same object already sits in imData.messages
        imPersistLocalCache();
        if (imCurrentPageActive() && imActiveConversationId === conversation.id) imRenderActiveConversation(false);
      }
    }).catch((e) => imToast(e.message || 'Could not deliver message to the server', 'err'));
  }
  function imReplyToMessage(id) {
    if (!imCan('im.react')) return;
    const message = imData.messages.find(m => m.id === id); if (!message) return;
    imEditingMessageId = null; imReplyToId = id;
    imRenderContextPreview(); document.getElementById('imComposerInput')?.focus();
  }
  function imEditMessage(id) {
    const user = imCurrentUser(); const message = imData.messages.find(m => m.id === id);
    if (!user || !message || message.senderId !== user.id || message.deletedAt || !imCan('im.editOwn')) return;
    imReplyToId = null; imEditingMessageId = id; imPendingAttachment = null;
    const box = document.getElementById('imComposerInput'); if (box) { box.value = message.body || ''; imAutoSize(box); box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    imRenderContextPreview(); imRenderAttachmentPreview();
  }
  function imCancelContext() {
    imReplyToId = null; imEditingMessageId = null; imPendingAttachment = null; imCloseMentionMenu();
    const box = document.getElementById('imComposerInput'); if (box) { box.value = imLoadDraft(); imAutoSize(box); }
    imRenderContextPreview(); imRenderAttachmentPreview();
  }

  function imUnsendMessage(id) {
    const user = imCurrentUser(); const m = imData.messages.find(x => x.id === id);
    if (!user || !m || m.senderId !== user.id || m.deletedAt || !imCan('im.deleteOwn')) return;
    const backup = { body: m.body, attachments: m.attachments || [], replyTo: m.replyTo || '', editedAt: m.editedAt || '' };
    m.deletedBackup = backup; m.deletedAt = new Date().toISOString(); m.deletedBy = user.id;
    m.body = ''; m.attachments = []; m.replyTo = '';
    imWriteStore({ force: true });
    imShowUndo('Message unsent for everyone.', function () { imUndoUnsend(id); });
    imRenderConversationList(); imRenderActiveConversation(false);
    if (typeof window.ctgApiFetch === 'function') {
      window.ctgApiFetch('/api/messaging/messages/' + encodeURIComponent(id), { method: 'DELETE' }).catch((e) => imToast(e.message || 'Could not unsend on the server', 'err'));
    }
  }
  function imUndoUnsend(id) {
    const user = imCurrentUser(); const m = imData.messages.find(x => x.id === id);
    if (!user || !m || m.senderId !== user.id || !m.deletedBackup) return;
    if (imNow() - imIsoTime(m.deletedAt) > IM_UNDO_MS) { imToast('The undo window has expired.', 'err'); return; }
    m.body = m.deletedBackup.body || ''; m.attachments = m.deletedBackup.attachments || []; m.replyTo = m.deletedBackup.replyTo || ''; m.editedAt = m.deletedBackup.editedAt || '';
    delete m.deletedBackup; delete m.deletedAt; delete m.deletedBy;
    imWriteStore({ force: true }); imHideUndo(); imRenderConversationList(); imRenderActiveConversation(false);
  }
  function imDeleteForMe(id) {
    const user = imCurrentUser(); const m = imData.messages.find(x => x.id === id);
    if (!user || !m) return;
    m.hiddenFor = m.hiddenFor || [];
    if (!m.hiddenFor.includes(user.id)) m.hiddenFor.push(user.id);
    imWriteStore({ force: true });
    imShowUndo('Message deleted for you.', function () {
      const currentMessage = imData.messages.find(x => x.id === id);
      if (!currentMessage) return;
      currentMessage.hiddenFor = (currentMessage.hiddenFor || []).filter(x => x !== user.id);
      imWriteStore({ force: true }); imRenderActiveConversation(false);
    });
    imRenderActiveConversation(false);
  }
  function imCloseMessageMenus() {
    document.querySelectorAll('.im-message-menu.open').forEach(el => el.classList.remove('open'));
  }
  function imToggleMessageMenu(id, event) {
    if (event) event.stopPropagation();
    const targetId = 'imMessageMenu-' + id;
    document.querySelectorAll('.im-message-menu.open').forEach(el => { if (el.id !== targetId) el.classList.remove('open'); });
    document.querySelectorAll('.im-reaction-picker.open').forEach(el => el.classList.remove('open'));
    document.getElementById(targetId)?.classList.toggle('open');
  }
  function imToggleReactionMenu(id) {
    imCloseMessageMenus();
    document.querySelectorAll('.im-reaction-picker.open').forEach(el => { if (el.id !== 'imReactionPicker-' + id) el.classList.remove('open'); });
    document.getElementById('imReactionPicker-' + id)?.classList.toggle('open');
  }
  function imReact(id, emoji) {
    const user = imCurrentUser(); const m = imData.messages.find(x => x.id === id);
    if (!user || !m || m.deletedAt || !imCan('im.react')) return;
    m.reactions = m.reactions || {};
    const list = Array.isArray(m.reactions[emoji]) ? m.reactions[emoji] : [];
    const hadThisOne = list.includes(user.id);
    // Only one reaction per person per message: remove this person from every
    // emoji's list first, then add them back only if they picked a new one
    // (toggling the same emoji they already had just removes it).
    Object.keys(m.reactions).forEach(e => { m.reactions[e] = (m.reactions[e] || []).filter(x => x !== user.id); });
    if (!hadThisOne) m.reactions[emoji] = (m.reactions[emoji] || []).concat(user.id);
    imWriteStore({ force: true }); imRenderMessages(false); imRenderDetails();
    if (typeof window.ctgApiFetch === 'function') {
      window.ctgApiFetch('/api/messaging/messages/' + encodeURIComponent(id) + '/reactions', { method: 'POST', body: JSON.stringify({ emoji }) }).catch(() => {});
    }
  }
  function imToggleMessagePin(id) {
    const user = imCurrentUser(); const m = imData.messages.find(x => x.id === id);
    if (!user || !m || m.deletedAt) return;
    m.pinnedBy = m.pinnedBy || [];
    if (m.pinnedBy.includes(user.id)) m.pinnedBy = m.pinnedBy.filter(x => x !== user.id);
    else m.pinnedBy.push(user.id);
    imWriteStore({ force: true }); imRenderMessages(false); imRenderDetails();
  }
  function imJumpToMessage(id) {
    const el = document.getElementById('im-message-' + id);
    if (!el) { imMessageSearch = ''; imCloseMessageSearch(); requestAnimationFrame(() => imJumpToMessage(id)); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
  }

  function imSyncParticipantFlag(conversationId, flags) {
    if (typeof window.ctgApiFetch === 'function') {
      window.ctgApiFetch('/api/messaging/conversations/' + encodeURIComponent(conversationId) + '/participant', { method: 'PATCH', body: JSON.stringify(flags) }).catch(() => {});
    }
  }
  function imToggleFavorite() {
    const user = imCurrentUser(); const c = imConversation(imActiveConversationId); if (!user || !c) return;
    c.pinnedBy = c.pinnedBy || [];
    const pinned = !c.pinnedBy.includes(user.id);
    c.pinnedBy = pinned ? c.pinnedBy.concat(user.id) : c.pinnedBy.filter(x => x !== user.id);
    imWriteStore({ force: true }); imRenderConversationList(); imRenderDetails();
    imSyncParticipantFlag(c.id, { pinned });
  }
  function imToggleMute() {
    const user = imCurrentUser(); const c = imConversation(imActiveConversationId); if (!user || !c) return;
    c.mutedBy = c.mutedBy || [];
    const muted = !c.mutedBy.includes(user.id);
    c.mutedBy = muted ? c.mutedBy.concat(user.id) : c.mutedBy.filter(x => x !== user.id);
    imWriteStore({ force: true }); imRenderConversationList(); imRenderDetails();
    imSyncParticipantFlag(c.id, { muted });
  }
  function imHideConversation() {
    const user = imCurrentUser(); const c = imConversation(imActiveConversationId); if (!user || !c || c.isGeneral) return;
    c.hiddenFor = c.hiddenFor || [];
    if (!c.hiddenFor.includes(user.id)) c.hiddenFor.push(user.id);
    const hiddenId = c.id;
    imWriteStore({ force: true });
    imSyncParticipantFlag(hiddenId, { hidden: true });
    const visible = imVisibleConversations(); imActiveConversationId = visible.length ? visible[0].id : 'im_general';
    imShowUndo('Conversation hidden.', function () {
      const currentConversation = imConversation(hiddenId);
      if (!currentConversation) return;
      currentConversation.hiddenFor = (currentConversation.hiddenFor || []).filter(x => x !== user.id); imActiveConversationId = hiddenId;
      imWriteStore({ force: true }); imRenderConversationList(); imRenderActiveConversation(false);
      imSyncParticipantFlag(hiddenId, { hidden: false });
    });
    imRenderConversationList(); imRenderActiveConversation(true);
  }

  let imChatModalMode = 'create';
  function imOpenChatModal(mode) {
    if (mode === 'create' && !imCan('im.create')) return;
    if (mode === 'manage' && !imCan('im.manage')) return;
    imChatModalMode = mode || 'create';
    const modal = document.getElementById('imChatModal'); if (!modal) return;
    const c = imConversation(imActiveConversationId);
    document.getElementById('imChatModalTitle').textContent = imChatModalMode === 'manage' ? 'Manage group chat' : 'New chat';
    document.getElementById('imChatModalSave').textContent = imChatModalMode === 'manage' ? 'Save changes' : 'Start chat';
    document.getElementById('imChatName').value = imChatModalMode === 'manage' && c ? (c.name || '') : '';
    document.getElementById('imMemberSearch').value = '';
    imModalSelectedIds = imChatModalMode === 'manage' && c ? (c.participants || []).filter(id => !imCurrentUser() || id !== imCurrentUser().id) : [];
    modal.classList.add('show');
    imRenderMemberPicker('');
    setTimeout(() => document.getElementById('imMemberSearch')?.focus(), 0);
  }
  function imCloseChatModal() { document.getElementById('imChatModal')?.classList.remove('show'); }
  function imRenderMemberPicker(query) {
    const mount = document.getElementById('imMemberPicker'); if (!mount) return;
    const current = imCurrentUser();
    const selected = imModalSelectedIds;
    const q = String(query || '').trim().toLowerCase();
    const users = imAccounts().filter(u => !current || u.id !== current.id).filter(u => !q || (u.displayName + ' ' + u.username + ' ' + imRoleLabel(u.role)).toLowerCase().includes(q));
    mount.innerHTML = users.length ? users.map(u => '<label class="im-member-option"><input type="checkbox" value="' + imEsc(u.id) + '"' + (selected.includes(u.id) ? ' checked' : '') + ' data-onchange="imModalMemberToggle(\'' + imEsc(u.id) + '\',this.checked)"><span class="im-avatar im-member-avatar">' + imEsc(imInitials(u.displayName).toUpperCase()) + '<i class="im-presence-dot' + (imIsOnline(u.id) ? ' online' : '') + '"></i></span><span><strong>' + imEsc(u.displayName) + '</strong><small>@' + imEsc(u.username) + ' · ' + imEsc(imRoleLabel(u.role)) + '</small></span></label>').join('') : '<div class="im-list-empty">No accounts found.</div>';
  }
  function imModalMemberToggle(id, checked) {
    if (checked && !imModalSelectedIds.includes(id)) imModalSelectedIds.push(id);
    if (!checked) imModalSelectedIds = imModalSelectedIds.filter(x => x !== id);
  }
  async function imSaveChatModal() {
    const current = imCurrentUser(); if (!current) return;
    const participants = [current.id].concat(imModalSelectedIds.filter(id => id !== current.id));
    const name = (document.getElementById('imChatName')?.value || '').trim();
    if (participants.length < 2) { imToast('Select at least one other account.', 'err'); return; }
    if (imChatModalMode === 'manage') {
      const c = imConversation(imActiveConversationId);
      if (!c || c.type === 'direct' || c.isGeneral || !imCan('im.manage')) return;
      c.participants = participants; c.name = name || c.name || 'Group chat'; c.updatedAt = new Date().toISOString();
      imWriteStore({ force: true }); imCloseChatModal(); imRenderConversationList(); imRenderActiveConversation(false);
      // Renaming/membership changes to an existing group aren't synced to the
      // server yet (a Phase 2 refinement) - visible only in this browser for now.
      return;
    }
    if (!imCan('im.create')) return;
    if (participants.length === 2) {
      const sorted = participants.slice().sort();
      let existing = imData.conversations.find(c => c.type === 'direct' && (c.participants || []).slice().sort().join('|') === sorted.join('|'));
      if (existing) {
        existing.hiddenFor = (existing.hiddenFor || []).filter(id => id !== current.id);
        imWriteStore({ force: true }); imCloseChatModal(); imOpenConversation(existing.id);
        imSyncParticipantFlag(existing.id, { hidden: false });
        return;
      }
    }
    // Conversations are created server-first (not optimistic-local like
    // messages are) - this avoids reconciling a temp local id against the
    // real one, and a new chat is created rarely enough that the small
    // network round-trip isn't noticeable.
    const type = participants.length === 2 ? 'direct' : 'group';
    if (typeof window.ctgApiFetch !== 'function') { imToast('Cannot create a conversation right now.', 'err'); return; }
    try {
      const res = await window.ctgApiFetch('/api/messaging/conversations', {
        method: 'POST',
        body: JSON.stringify({ type, name: name || undefined, participantIds: participants.filter((id) => id !== current.id) })
      });
      imData.conversations.push(res.conversation);
      imWriteStore({ force: true }); imCloseChatModal(); imOpenConversation(res.conversation.id);
    } catch (e) {
      imToast(e.message || 'Could not create the conversation', 'err');
    }
  }

  function imShowUndo(text, action) {
    clearTimeout(imUndoTimer);
    imUndoAction = { action, expiresAt: imNow() + IM_UNDO_MS };
    const bar = document.getElementById('imUndoBar'); const label = document.getElementById('imUndoText');
    if (label) label.textContent = text;
    if (bar) bar.classList.add('show');
    imUpdateUndoCountdown();
    imUndoTimer = setTimeout(imHideUndo, IM_UNDO_MS);
  }
  function imRunUndo() {
    if (!imUndoAction || imNow() > imUndoAction.expiresAt) { imHideUndo(); return; }
    const action = imUndoAction.action; imHideUndo(); if (typeof action === 'function') action();
  }
  function imHideUndo() {
    clearTimeout(imUndoTimer); imUndoTimer = null; imUndoAction = null;
    document.getElementById('imUndoBar')?.classList.remove('show');
  }
  function imUpdateUndoCountdown() {
    const el = document.getElementById('imUndoCountdown'); if (!el) return;
    if (!imUndoAction) { el.textContent = ''; return; }
    el.textContent = Math.max(0, Math.ceil((imUndoAction.expiresAt - imNow()) / 1000)) + 's';
  }

  const IM_PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const IM_MIC_ON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  const IM_MIC_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const IM_MINIMIZE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const IM_GROUP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  const IM_VIDEO_ON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
  const IM_VIDEO_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v2a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3l4-3v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const IM_SCREEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

  function imCallSend(msg) {
    if (typeof window.ctgSendRealtime === 'function') window.ctgSendRealtime(msg);
  }

  let imCallRingAudioCtx = null;
  let imCallRingOscillators = null;
  let imCallRingLoopTimer = null;
  function imCallUnlockRingAudio() {
    try {
      if (!imCallRingAudioCtx) imCallRingAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      else if (imCallRingAudioCtx.state === 'suspended') imCallRingAudioCtx.resume().catch(function () {});
    } catch (e) {}
  }
  function imCallStopRingtone() {
    clearTimeout(imCallRingLoopTimer); imCallRingLoopTimer = null;
    if (imCallRingOscillators) {
      try { imCallRingOscillators.oscs.forEach(function (o) { o.stop(); }); } catch (e) {}
      imCallRingOscillators = null;
    }
  }
  // isOutgoing keeps the two sides audibly different: the person being called
  // hears the 440/480Hz dual-tone ring, and the person who placed the call
  // hears a lower single-tone ringback at 425Hz on a shorter cadence, the same
  // distinction real phone systems make.
  function imCallStartRingtone(isOutgoing) {
    imCallStopRingtone();
    if (!imCallRingAudioCtx) return;
    const ctx = imCallRingAudioCtx;
    const freqs = isOutgoing ? [425] : [440, 480];
    const onMs = isOutgoing ? 1000 : 1800;
    const offMs = isOutgoing ? 2000 : 3000;
    function ringOnce() {
      try {
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        gain.connect(ctx.destination);
        const oscs = freqs.map(function (f) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(gain); o.start(); return o; });
        imCallRingOscillators = { oscs: oscs };
      } catch (e) { return; }
      imCallRingLoopTimer = setTimeout(function () {
        if (imCallRingOscillators) { try { imCallRingOscillators.oscs.forEach(function (o) { o.stop(); }); } catch (e) {} imCallRingOscillators = null; }
        imCallRingLoopTimer = setTimeout(ringOnce, offMs);
      }, onMs);
    }
    ringOnce();
  }

  // ACS's deviceManager wraps the same underlying device APIs but keeps
  // microphone selection consistent with whatever the Calling SDK is
  // actually using. Device labels are only populated once mic permission
  // has been granted.
  function imCallEnsureDeviceManager() {
    if (imCallDeviceManager) return Promise.resolve(imCallDeviceManager);
    if (!imCallClient) return Promise.reject(new Error('Call client not ready yet'));
    return imCallClient.getDeviceManager().then(function (dm) { imCallDeviceManager = dm; return dm; });
  }
  function imCallRefreshMicList() {
    imCallEnsureDeviceManager().then(function (dm) {
      return dm.askDevicePermission({ audio: true }).then(function () { return dm.getMicrophones(); });
    }).then(function (mics) {
      imCallMicDevices = (mics || []).map(function (d) { return { deviceId: d.id, label: d.name || 'Microphone' }; });
      if (imCallState === 'active') imCallRenderOverlay();
    }).catch(function () {});
  }

  /* Video rides the same ACS call as the audio, so there is no second
     connection and Azure's servers do the routing: a camera in a ten-person
     call costs each participant one upstream, not nine. Each person opts in
     independently, and turning your camera on never turns anyone else's on. */
  function imCallRefreshCameraList() {
    return imCallEnsureDeviceManager().then(function (dm) {
      return dm.askDevicePermission({ video: true }).then(function () { return dm.getCameras(); });
    }).then(function (cams) {
      imCallCameras = (cams || []).map(function (c) { return { deviceId: c.id, label: c.name || 'Camera' }; });
      return cams || [];
    }).catch(function () { return []; });
  }

  function imCallPickCamera(cams) {
    if (!cams || !cams.length) return null;
    return cams.find(function (c) { return c.id === imCallSelectedCameraId; }) || cams[0];
  }

  // Renders a stream (mine or someone else's) into a container element. ACS
  // hands back a view whose .target is a DOM node we attach ourselves.
  function imCallAttachView(renderer, container) {
    return renderer.createView({ scalingMode: 'Crop' }).then(function (view) {
      if (container) { container.innerHTML = ''; container.appendChild(view.target); }
      return view;
    });
  }

  function imCallStartVideo() {
    if (!imCall) { imToast('Still connecting — try the camera again in a moment.', ''); return Promise.resolve(); }
    return imCallRefreshCameraList().then(function (cams) {
      // Asking for camera permission can sit on a browser prompt for a while;
      // the call may have ended or not finished connecting in the meantime,
      // so imCall has to be re-checked rather than trusted from entry.
      if (!imCall) { imToast('The call ended before the camera started.', ''); return; }
      const cam = imCallPickCamera(cams);
      if (!cam) { imToast('No camera found on this device.', 'err'); return; }
      imCallLocalVideoStream = new ACS.Calling.LocalVideoStream(cam);
      return imCall.startVideo(imCallLocalVideoStream).then(function () {
        imCallVideoOn = true;
        const renderer = new ACS.Calling.VideoStreamRenderer(imCallLocalVideoStream);
        return renderer.createView({ scalingMode: 'Crop' }).then(function (view) {
          imCallLocalView = { renderer: renderer, view: view };
          imCallRenderOverlay();   // creates the tile, then re-attaches every view
        });
      });
    }).catch(function (err) {
      imCallVideoOn = false;
      imToast('Could not start your camera: ' + (err && err.message ? err.message : 'permission denied'), 'err');
      imCallRenderOverlay();
    });
  }

  function imCallStopVideo() {
    const stream = imCallLocalVideoStream;
    imCallVideoOn = false;
    if (imCallLocalView) { try { imCallLocalView.renderer.dispose(); } catch (e) {} imCallLocalView = null; }
    imCallLocalVideoStream = null;
    const done = (imCall && stream) ? imCall.stopVideo(stream).catch(function () {}) : Promise.resolve();
    return Promise.resolve(done).then(function () { imCallRenderOverlay(); });
  }

  function imCallToggleVideo() {
    if (!imCall) return;
    if (imCallVideoOn) imCallStopVideo(); else imCallStartVideo();
  }
  window.imCallToggleVideo = imCallToggleVideo;

  function imCallToggleScreenShare() {
    if (!imCall) return;
    if (imCall.isScreenSharingOn) {
      Promise.resolve(imCall.stopScreenSharing()).catch(function () {}).then(imCallRenderOverlay);
      return;
    }
    imCall.startScreenSharing().catch(function (err) {
      // Dismissing the browser picker is a normal choice, not an error worth
      // shouting about - Chrome reports it the same way as a real failure.
      const msg = (err && err.message) || '';
      if (/permission|denied|cancel|abort/i.test(msg)) return;
      imToast('Could not share your screen: ' + (msg || 'unknown error'), 'err');
    });
  }
  window.imCallToggleScreenShare = imCallToggleScreenShare;

  window.imCallStopScreenShare = function () {
    if (imCall && imCall.isScreenSharingOn) {
      Promise.resolve(imCall.stopScreenSharing()).catch(function () {}).then(imCallRenderOverlay);
    }
  };

  function imCallSetCamera(deviceId) {
    imCallSelectedCameraId = deviceId || '';
    try { localStorage.setItem('ctg_call_camera_device', imCallSelectedCameraId); } catch (e) {}
    // Switching mid-call swaps the source on the existing stream, so the call
    // isn't renegotiated and nobody sees a drop.
    if (!imCallVideoOn || !imCallLocalVideoStream) return;
    imCallRefreshCameraList().then(function (cams) {
      const cam = imCallPickCamera(cams);
      if (cam) imCallLocalVideoStream.switchSource(cam).catch(function () {});
    });
  }
  window.imCallSetCamera = imCallSetCamera;

  // Subscribes to one remote participant's video, now and whenever they turn
  // their camera on or off later in the call.
  function imCallWatchParticipantVideo(participant) {
    const key = imAcsIdentifierToString(participant.identifier);
    const bind = function (stream) {
      const attach = function () {
        if (!stream.isAvailable) {
          if (imCallRemoteViews[key]) { try { imCallRemoteViews[key].renderer.dispose(); } catch (e) {} delete imCallRemoteViews[key]; }
          imCallRenderOverlay();
          return;
        }
        if (imCallRemoteViews[key]) return; // already rendering this participant
        const renderer = new ACS.Calling.VideoStreamRenderer(stream);
        renderer.createView({ scalingMode: 'Crop' }).then(function (view) {
          imCallRemoteViews[key] = { renderer: renderer, view: view };
          imCallRenderOverlay();   // creates the tile, then re-attaches every view
        }).catch(function () {});
      };
      stream.on('isAvailableChanged', attach);
      if (stream.isAvailable) attach();
    };
    (participant.videoStreams || []).forEach(bind);
    participant.on('videoStreamsUpdated', function (e) { (e.added || []).forEach(bind); });
  }

  // ACS ids contain characters that aren't valid in an element id.
  function imCallSafeKey(s) { return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }

  function imCallResumeVideos(host) {
    if (!host) return;
    host.querySelectorAll('video').forEach(function (v) {
      v.autoplay = true; v.playsInline = true; v.muted = true; // remote audio comes over the call, not the element
      if (v.paused) { const r = v.play(); if (r && r.catch) r.catch(function () {}); }
    });
  }

  function imCallReattachVideoViews() {
    if (imCallLocalView && imCallLocalView.view) {
      const host = document.getElementById('imCallLocalVideo');
      if (host) {
        if (!host.contains(imCallLocalView.view.target)) {
          host.innerHTML = '';
          host.appendChild(imCallLocalView.view.target);
        }
        imCallResumeVideos(host);
      }
    }
    Object.keys(imCallRemoteViews).forEach(function (key) {
      const entry = imCallRemoteViews[key];
      if (!entry || !entry.view) return;
      const host = document.getElementById('imCallRemoteVideo-' + imCallSafeKey(key));
      if (!host) return;
      if (!host.contains(entry.view.target)) {
        host.innerHTML = '';
        host.appendChild(entry.view.target);
      }
      imCallResumeVideos(host);
    });
  }

  function imCallDisposeVideo() {
    if (imCallLocalView) { try { imCallLocalView.renderer.dispose(); } catch (e) {} imCallLocalView = null; }
    Object.keys(imCallRemoteViews).forEach(function (k) {
      try { imCallRemoteViews[k].renderer.dispose(); } catch (e) {}
    });
    imCallRemoteViews = {};
    imCallLocalVideoStream = null;
    imCallVideoOn = false;
  }

  function imCallSetMic(deviceId) {
    imCallSelectedMicId = deviceId || '';
    try { localStorage.setItem('ctg_call_mic_device', imCallSelectedMicId); } catch (e) {}
    imCallEnsureDeviceManager().then(function (dm) {
      return dm.getMicrophones().then(function (mics) {
        const device = (mics || []).find(function (d) { return d.id === imCallSelectedMicId; }) || (mics || [])[0];
        if (device) return dm.selectMicrophone(device);
      });
    }).then(function () { imCallRenderOverlay(); }).catch(function (err) {
      imToast('Could not switch microphone: ' + (err && err.message ? err.message : 'unknown error'), 'err');
    });
  }
  window.imCallSetMic = imCallSetMic;

  function imCallMicSelectHTML() {
    if (!imCallMicDevices.length) return '';
    const options = imCallMicDevices.map(function (d) {
      return '<option value="' + imEsc(d.deviceId) + '"' + (d.deviceId === imCallSelectedMicId ? ' selected' : '') + '>' + imEsc(d.label) + '</option>';
    }).join('');
    return '<select class="im-call-mic-select" data-onchange="imCallSetMic(this.value)" title="Microphone" aria-label="Microphone">'
      + '<option value=""' + (!imCallSelectedMicId ? ' selected' : '') + '>System default microphone</option>' + options + '</select>';
  }

  function imCallOverlayEl() {
    let el = document.getElementById('imCallOverlay');
    if (!el) { el = document.createElement('div'); el.id = 'imCallOverlay'; el.className = 'im-call-overlay'; document.body.appendChild(el); }
    return el;
  }

  // Resolves a remote participant to {id, name} - ACS hands back an
  // identifier object, not our app's account id, so this maps through
  // acsUserId (see imAccountByAcsId).
  function imCallParticipantInfo(participant) {
    const acsId = imAcsIdentifierToString(participant.identifier);
    const account = imAccountByAcsId(acsId);
    return { id: (account && account.id) || acsId, name: (account && account.displayName) || 'Participant' };
  }

  function imCallRenderOverlay() {
    const el = imCallOverlayEl();
    const callBtn = document.getElementById('imCallBtn'); if (callBtn) callBtn.disabled = imCallState !== 'idle';

    if (imCallState === 'ringing' && imCallInvite) {
      const name = imEsc(imCallInvite.inviterName);
      const initials = imEsc(imInitials(imCallInvite.inviterName).toUpperCase() || '?');
      el.className = 'im-call-overlay show im-call-incoming';
      el.innerHTML = '<div class="im-call-card"><div class="im-call-avatar pulsing">' + initials + '</div>'
        + '<div class="im-call-name">' + name + '</div><div class="im-call-sub">' + (imCallInvite.isGroup ? 'Incoming group call…' : 'Incoming voice call…') + '</div>'
        + '<div class="im-call-actions">'
        + '<button type="button" class="im-call-btn decline" data-onclick="imCallDecline()" title="Decline" aria-label="Decline call">' + IM_PHONE_ICON + '</button>'
        + '<button type="button" class="im-call-btn accept" data-onclick="imCallAccept()" title="Accept" aria-label="Accept call">' + IM_PHONE_ICON + '</button>'
        + '</div></div>';
      return;
    }

    if (imCallState !== 'active') { el.className = 'im-call-overlay'; el.innerHTML = ''; return; }

    const participants = (imCall ? imCall.remoteParticipants : []).map(imCallParticipantInfo);
    const conversation = imConversation(imCallConversationId);
    const roomTitle = imCallIsGroup ? (conversation ? imConversationName(conversation) : 'Group call') : (participants.length ? participants[0].name : (conversation ? (imOtherParticipants(conversation)[0] || {}).displayName || '…' : '…'));

    if (imCallMinimized) {
      el.className = 'im-call-overlay show im-call-active-bar';
      const barLabel = imCallIsGroup ? ('Group call · ' + (participants.length + 1)) : roomTitle;
      el.innerHTML = '<div class="im-call-bar" data-onclick="imCallToggleMinimize()" title="Expand call">'
        + '<span class="im-call-avatar small">' + (imCallIsGroup ? (participants.length + 1) : imEsc(imInitials(roomTitle).toUpperCase() || '?')) + '</span>'
        + '<span class="im-call-bar-copy"><strong>' + imEsc(barLabel) + '</strong><span id="imCallDuration">00:00</span></span>'
        + '<button type="button" class="im-call-mute-btn' + (imCallMuted ? ' muted' : '') + '" data-onclick="event.stopPropagation();imCallToggleMute()" title="' + (imCallMuted ? 'Unmute' : 'Mute') + '" aria-label="Toggle mute">' + (imCallMuted ? IM_MIC_OFF_ICON : IM_MIC_ON_ICON) + '</button>'
        + '<button type="button" class="im-call-btn decline small" data-onclick="event.stopPropagation();imCallLeave()" title="Leave call" aria-label="Leave call">' + IM_PHONE_ICON + '</button></div>';
      return;
    }

    // Solo direct call still connecting: the familiar full "Calling..." card.
    if (!imCallIsGroup && !participants.length) {
      el.className = 'im-call-overlay show im-call-outgoing';
      el.innerHTML = '<div class="im-call-card"><div class="im-call-avatar pulsing">' + imEsc(imInitials(roomTitle).toUpperCase() || '?') + '</div>'
        + '<div class="im-call-name">' + imEsc(roomTitle) + '</div><div class="im-call-sub">Calling…</div>'
        + imCallMicSelectHTML()
        + '<div class="im-call-actions"><button type="button" class="im-call-btn decline" data-onclick="imCallLeave()" title="Cancel" aria-label="Cancel call">' + IM_PHONE_ICON + '</button></div></div>';
      return;
    }

    el.className = 'im-call-overlay show im-call-active-modal';

    const remotes = imCall ? imCall.remoteParticipants : [];
    const hasVideo = function (p) { return (p.videoStreams || []).some(function (s) { return s.isAvailable; }); };
    const remoteWithVideo = remotes.filter(hasVideo);
    const anyVideo = imCallVideoOn || remoteWithVideo.length > 0;

    // Stage layout: whoever's on camera gets the big frame, everyone else sits
    // in the filmstrip. With nobody on camera the stage is skipped entirely and
    // the panel stays a compact audio call.
    const isScreen = function (p) {
      return (p.videoStreams || []).some(function (v) { return v.isAvailable && v.mediaStreamType === 'ScreenSharing'; });
    };
    const stageParticipant = remoteWithVideo.find(isScreen) || remoteWithVideo[0] || null;
    const stageKey = stageParticipant ? imCallSafeKey(imAcsIdentifierToString(stageParticipant.identifier)) : '';
    const stageName = stageParticipant ? imCallParticipantInfo(stageParticipant).name : '';

    const tile = function (p) {
      const info = imCallParticipantInfo(p);
      const key = imCallSafeKey(imAcsIdentifierToString(p.identifier));
      const on = hasVideo(p);
      return '<div class="im-stage-thumb' + (on ? '' : ' is-audio') + '">'
        + (on ? '<div class="im-call-video-surface" id="imCallRemoteVideo-' + key + '"></div>'
              : '<span class="im-call-avatar tiny">' + imEsc(imInitials(info.name).toUpperCase() || '?') + '</span>')
        + '<span class="im-thumb-name">' + imEsc(imFirstName(info.name)) + '</span>'
        + (p.isMuted ? '<span class="im-thumb-mic muted" title="Muted">' + IM_MIC_OFF_ICON + '</span>' : '')
        + '</div>';
    };

    // The stage participant is already the big frame, so they're excluded from
    // the strip below it.
    const stripSource = remotes.filter(function (p) { return p !== stageParticipant; });
    const filmstrip = (anyVideo && (stripSource.length || imCallVideoOn))
      ? '<div class="im-stage-strip">'
        + stripSource.map(tile).join('')
        + (imCallVideoOn
            ? '<div class="im-stage-thumb is-self"><div class="im-call-video-surface" id="imCallLocalVideo"></div><span class="im-thumb-name">You</span></div>'
            : '')
        + '</div>'
      : '';

    const stage = anyVideo
      ? '<div class="im-stage">'
        + (stageParticipant
            ? '<div class="im-stage-main' + (isScreen(stageParticipant) ? ' is-screen' : '') + '"><div class="im-call-video-surface" id="imCallRemoteVideo-' + stageKey + '"></div>'
              + '<span class="im-stage-name">' + imEsc(stageName) + (stageParticipant && isScreen(stageParticipant) ? ' · sharing screen' : '') + '</span>'
              + '<span class="im-stage-timer" id="imCallDuration">00:00</span></div>'
            // Only my own camera is on: my preview becomes the stage.
            : '<div class="im-stage-main"><div class="im-call-video-surface" id="imCallLocalVideo"></div>'
              + '<span class="im-stage-name">You</span>'
              + '<span class="im-stage-timer" id="imCallDuration">00:00</span></div>')
        + (stageParticipant ? filmstrip : '')
        + '</div>'
      : '';

    // The SDK's own flag is the source of truth: sharing can also stop from
    // Chrome's floating "Stop sharing" bar, which our button never sees.
    const sharing = !!(imCall && imCall.isScreenSharingOn);
    const presentingBanner = sharing
      ? '<div class="im-presenting-bar"><span class="im-presenting-dot"></span>'
        + '<span>You’re presenting your screen</span>'
        + '<button type="button" data-onclick="imCallStopScreenShare()">Stop presenting</button></div>'
      : '';

    // Roster panel: who's here, and whether their mic and camera are live.
    const panel = '<aside class="im-call-panel">'
      + '<div class="im-panel-head">In this call<span class="im-panel-count">' + (remotes.length + 1) + '</span></div>'
      + '<div class="im-panel-list">'
      + '<div class="im-panel-row"><span class="im-call-avatar tiny">' + imEsc(imInitials((imCurrentUser() || {}).displayName || 'You').toUpperCase() || '?') + '</span>'
      + '<span class="im-panel-name">You' + (sharing ? '<em>Presenting</em>' : '') + '</span>'
      + '<span class="im-panel-icons">' + (imCallMuted ? '<i class="off">' + IM_MIC_OFF_ICON + '</i>' : '<i>' + IM_MIC_ON_ICON + '</i>')
      + (imCallVideoOn ? '<i>' + IM_VIDEO_ON_ICON + '</i>' : '<i class="off">' + IM_VIDEO_OFF_ICON + '</i>') + '</span></div>'
      + remotes.map(function (p) {
          const info = imCallParticipantInfo(p);
          return '<div class="im-panel-row"><span class="im-call-avatar tiny">' + imEsc(imInitials(info.name).toUpperCase() || '?') + '</span>'
            + '<span class="im-panel-name">' + imEsc(info.name) + (isScreen(p) ? '<em>Presenting</em>' : '') + '</span>'
            + '<span class="im-panel-icons">' + (p.isMuted ? '<i class="off">' + IM_MIC_OFF_ICON + '</i>' : '<i>' + IM_MIC_ON_ICON + '</i>')
            + (hasVideo(p) ? '<i>' + IM_VIDEO_ON_ICON + '</i>' : '<i class="off">' + IM_VIDEO_OFF_ICON + '</i>') + '</span></div>';
        }).join('')
      + (remotes.length ? '' : '<div class="im-panel-empty">Waiting for others to join…</div>')
      + '</div></aside>';

    const audioFace = anyVideo ? ''
      : '<div class="im-call-audioface">'
        + '<div class="im-call-avatar big">' + (imCallIsGroup ? IM_GROUP_ICON : imEsc(imInitials(roomTitle).toUpperCase() || '?')) + '</div>'
        + '<div class="im-call-name">' + imEsc(roomTitle) + '</div>'
        + '<div class="im-call-sub" id="imCallDuration">00:00</div>'
        + '</div>';

    el.innerHTML = '<div class="im-call-shell' + (anyVideo ? ' has-video' : '') + '">'
      + '<header class="im-call-head">'
      + '<div class="im-call-head-copy"><strong>' + imEsc(roomTitle) + '</strong>'
      + '<span>' + (remotes.length + 1) + ' in call</span></div>'
      + '<button type="button" class="im-call-min-btn" data-onclick="imCallToggleMinimize()" title="Minimize" aria-label="Minimize call">' + IM_MINIMIZE_ICON + '</button>'
      + '</header>'
      + '<div class="im-call-body">'
      + '<div class="im-call-stagewrap">' + presentingBanner + stage + audioFace + '</div>'
      + panel
      + '</div>'
      + '<footer class="im-call-foot">'
      + imCallMicSelectHTML()
      + '<div class="im-call-actions">'
      + '<button type="button" class="im-call-round-btn' + (imCallMuted ? ' active-danger' : '') + '"' + (imCall ? '' : ' disabled') + ' data-onclick="imCallToggleMute()" title="' + (imCallMuted ? 'Unmute' : 'Mute') + '" aria-label="Toggle mute">' + (imCallMuted ? IM_MIC_OFF_ICON : IM_MIC_ON_ICON) + '</button>'
      + '<button type="button" class="im-call-round-btn' + (imCallVideoOn ? ' on' : '') + '"' + (imCall ? '' : ' disabled') + ' data-onclick="imCallToggleVideo()" title="' + (imCall ? (imCallVideoOn ? 'Turn camera off' : 'Turn camera on') : 'Connecting…') + '" aria-label="Toggle camera">' + (imCallVideoOn ? IM_VIDEO_ON_ICON : IM_VIDEO_OFF_ICON) + '</button>'
      + '<button type="button" class="im-call-round-btn' + (sharing ? ' on' : '') + '"' + (imCall ? '' : ' disabled') + ' data-onclick="imCallToggleScreenShare()" title="' + (sharing ? 'Stop sharing your screen' : 'Share your screen') + '" aria-label="Share screen">' + IM_SCREEN_ICON + '</button>'
      + '<button type="button" class="im-call-endbtn" data-onclick="imCallLeave()">' + IM_PHONE_ICON + '<span>End call</span></button>'
      + '</div>'
      + '</footer>'
      + '</div>';

    // innerHTML above discarded the live <video> elements; put them back.
    imCallReattachVideoViews();
  }

  // title/subtitle for the in-thread call card; imCallLogLabel below flattens
  // the same two pieces into one line for the conversation-list preview.
  function imCallLogParts(callLog, mine) {
    const isGroup = !!callLog.isGroup;
    if (callLog.outcome === 'completed') {
      const s = callLog.durationSec || 0;
      const dur = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      return { title: isGroup ? 'Group audio call ended' : 'Audio call ended', subtitle: dur };
    }
    if (callLog.outcome === 'declined') return { title: mine ? 'Call declined' : 'You declined', subtitle: '' };
    return { title: mine ? 'No answer' : 'Missed audio call', subtitle: '' };
  }
  function imCallLogLabel(callLog, mine) {
    const p = imCallLogParts(callLog, mine);
    return p.subtitle ? (p.title + ' · ' + p.subtitle) : p.title;
  }

  function imCallLogMessage(outcome, opts) {
    const conversationId = opts.conversationId; if (!conversationId) return;
    imData = imReadStore(); imEnsureGeneral();
    const conversation = imData.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    const msgId = opts.msgId;
    if (!imData.messages.some(m => m.id === msgId)) {
      const now = new Date().toISOString();
      imData.messages.push({
        id: msgId, conversationId: conversation.id, senderId: opts.senderId, body: '', createdAt: now, updatedAt: now,
        reactions: {}, attachments: [], hiddenFor: [], pinnedBy: [],
        callLog: { outcome: outcome, durationSec: opts.durationSec || 0, isGroup: !!opts.isGroup }
      });
      conversation.lastMessageAt = now; conversation.updatedAt = now;
      conversation.hiddenFor = (conversation.hiddenFor || []).filter(id => id !== opts.senderId);
      imWriteStore();
    }
    if (imCurrentPageActive()) { imRenderConversationList(); imRenderActiveConversation(false); }
  }

  function imCallStartDurationTimer() {
    clearInterval(imCallDurationTimer);
    imCallDurationTimer = setInterval(function () {
      const el = document.getElementById('imCallDuration'); if (!el || !imCallStartedAt) return;
      const secs = Math.max(0, Math.floor((imNow() - imCallStartedAt) / 1000));
      el.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    }, 1000);
  }

  // Creates (once per session) the ACS CallClient + CallAgent. The token
  // credential auto-refreshes itself via tokenRefresher, so the agent can be
  // reused across many calls without ever being recreated.
  function imCallEnsureAgent() {
    if (imCallAgent) return Promise.resolve(imCallAgent);
    if (imCallAgentPromise) return imCallAgentPromise;
    const user = imCurrentUser();
    imCallAgentPromise = window.ctgApiFetch('/api/calling/token').then(function (d) {
      imCallClient = new ACS.Calling.CallClient();
      const credential = new ACS.Common.AzureCommunicationTokenCredential({
        tokenRefresher: function () { return window.ctgApiFetch('/api/calling/token').then(function (d2) { return d2.token; }); },
        token: d.token,
        refreshProactively: true
      });
      return imCallClient.createCallAgent(credential, { displayName: (user && user.displayName) || 'User' });
    }).then(function (agent) {
      imCallAgent = agent;
      imCallAgentPromise = null;
      return agent;
    }).catch(function (err) {
      imCallAgentPromise = null;
      throw err;
    });
    return imCallAgentPromise;
  }

  // Get-or-create the ACS group-call id for this conversation - the first
  // caller mints it server-side, everyone after reuses the same one so they
  // all land in the same ACS group call (see routes/messaging.js).
  function imCallGetGroupId(conversationId) {
    return window.ctgApiFetch('/api/messaging/conversations/' + encodeURIComponent(conversationId) + '/call-group', { method: 'POST' }).then(function (d) { return d.callGroupId; });
  }

  // Entry point for the header call button: rings everyone else in the
  // conversation and joins the (possibly already-active) ACS group call for
  // it. Unlike the old mesh, ACS's own servers handle all the NAT
  // traversal/media routing, so this scales to many more than 3-4 people.
  function imCallStart() {
    const user = imCurrentUser(); if (!user) return;
    if (imCallState !== 'idle') { imToast('You are already on a call.', 'err'); return; }
    const conversation = imConversation(imActiveConversationId);
    if (!conversation) return;
    imCallUnlockRingAudio();
    let invitees;
    if (conversation.type === 'direct') {
      const peer = imOtherParticipants(conversation)[0];
      if (!peer) return;
      if (!imIsOnline(peer.id)) { imToast(peer.displayName + ' isn’t currently online.', 'err'); return; }
      invitees = [peer];
    } else {
      invitees = imOtherParticipants(conversation);
      if (!invitees.length) { imToast('No one else is in this conversation yet.', 'err'); return; }
    }
    imCallStarterId = user.id;
    imCallJoinGroup(conversation, invitees);
  }

  function imCallJoinGroup(conversation, invitees) {
    const user = imCurrentUser(); if (!user) return;
    imCallConversationId = conversation.id;
    imCallIsGroup = conversation.type !== 'direct';
    imCallInvite = null;
    imCallState = 'active';
    imCallPendingInvitees = invitees || null;
    imCallRenderOverlay();
    Promise.all([imCallEnsureAgent(), imCallGetGroupId(conversation.id)]).then(function (results) {
      const agent = results[0], groupId = results[1];
      if (imCallState !== 'active' || imCallConversationId !== conversation.id) return; // cancelled meanwhile
      imCallId = groupId;
      const call = agent.join({ groupId: groupId }, { audioOptions: { muted: false } });
      imCall = call;
      imCallWireCallEvents(call);
      imCallRenderOverlay();   // re-enables the mic/camera controls
      imCallStartedAt = imNow();
      imCallStartDurationTimer();
      imCallRefreshMicList();
      if (imCallPendingInvitees && imCallPendingInvitees.length) {
        imCallPendingInvitees.forEach(function (p) {
          imCallSend({ type: 'call-invite', callId: groupId, fromName: user.displayName, to: p.id, conversationId: conversation.id, isGroup: imCallIsGroup });
        });
        imCallStartRingtone(true); // outgoing ringback (I'm the one calling)
        imCallRingTimer = setTimeout(function () {
          if (imCall === call && imCallState === 'active' && !call.remoteParticipants.length) {
            imToast('No answer.', '');
            imCallLeave(imCallIsGroup ? null : 'noanswer');
          }
        }, IM_CALL_RING_TIMEOUT_MS);
      }
      imCallPendingInvitees = null;
      imCallRenderOverlay();
    }).catch(function (err) {
      imToast('Could not start the call: ' + (err && err.message ? err.message : 'unknown error'), 'err');
      imCallState = 'idle'; imCallConversationId = null; imCallIsGroup = false; imCallPendingInvitees = null;
      imCallRenderOverlay();
    });
  }

  function imCallAccept() {
    if (imCallState !== 'ringing' || !imCallInvite) return;
    imCallUnlockRingAudio();
    imCallStopRingtone();
    const conversation = imConversation(imCallInvite.conversationId);
    clearTimeout(imCallRingTimer); imCallRingTimer = null;
    if (!conversation) { imCallState = 'idle'; imCallInvite = null; imCallRenderOverlay(); return; }
    imCallStarterId = imCallInvite.inviterId;
    imCallJoinGroup(conversation, null); // accepting never re-invites anyone
  }

  function imCallDecline() {
    const user = imCurrentUser();
    const info = imCallInvite;
    imCallStopRingtone();
    if (user && info) imCallSend({ type: 'call-reject', callId: info.callId, fromName: user.displayName, to: info.inviterId });
    if (user && info && !info.isGroup) {
      imCallLogMessage('declined', { conversationId: info.conversationId, msgId: 'callmsg_' + info.callId, senderId: info.inviterId, durationSec: 0, isGroup: false });
    }
    clearTimeout(imCallRingTimer); imCallRingTimer = null;
    imCallState = 'idle'; imCallInvite = null;
    imCallRenderOverlay();
  }

  // Leave the call (or cancel/decline before it connected) and log it into
  // the thread - unless this is a silent group miss/decline.
  function imCallLeave(explicitOutcome) {
    const user = imCurrentUser();
    imCallStopRingtone();
    const callId = imCallId, conversationId = imCallConversationId, isGroup = imCallIsGroup, call = imCall;
    const hadPeers = !!(call && call.remoteParticipants && call.remoteParticipants.length);
    const durationSec = (imCallStartedAt && hadPeers) ? Math.max(0, Math.round((imNow() - imCallStartedAt) / 1000)) : 0;

    if (user && callId && conversationId) {
      if (isGroup) {
        if (hadPeers) imCallLogMessage('completed', { conversationId: conversationId, msgId: 'callmsg_' + callId + '_' + user.id, senderId: user.id, durationSec: durationSec, isGroup: true });
      } else {
        const outcome = explicitOutcome || (hadPeers ? 'completed' : null);
        if (outcome) {
          const starterId = imCallStarterId || user.id;
          imCallLogMessage(outcome, { conversationId: conversationId, msgId: 'callmsg_' + callId, senderId: starterId, durationSec: durationSec, isGroup: false });
        }
      }
    }

    clearTimeout(imCallRingTimer); imCallRingTimer = null;
    clearInterval(imCallDurationTimer); imCallDurationTimer = null;
    imCallDisposeVideo();
    imCall = null;
    if (call) { try { call.hangUp(); } catch (e) {} }
    imCallState = 'idle'; imCallId = null; imCallConversationId = null; imCallIsGroup = false; imCallInvite = null;
    imCallStarterId = null; imCallPendingInvitees = null;
    imCallMuted = false; imCallMinimized = false; imCallStartedAt = 0;
    imCallRenderOverlay();
  }

  function imCallToggleMute() {
    if (!imCall) return;
    imCallMuted = !imCallMuted;
    const action = imCallMuted ? imCall.mute() : imCall.unmute();
    Promise.resolve(action).catch(function () {});
    imCallRenderOverlay();
  }

  function imCallToggleMinimize() {
    if (imCallState !== 'active') return;
    imCallMinimized = !imCallMinimized;
    imCallRenderOverlay();
  }

  // Wires the ACS Call object's own events - this replaces the entire old
  // hand-rolled offer/answer/ICE relay: ACS handles all of that internally
  // once you're in the call, this just reacts to state/roster changes.
  function imCallWireCallEvents(call) {
    call.on('stateChanged', function () {
      if (call !== imCall) return;
      if (call.state === 'Disconnected' && imCallState === 'active') {
        imToast('Call ended.', '');
        imCallLeave('completed');
        return;
      }
      imCallRenderOverlay();
    });
    call.on('isScreenSharingOnChanged', function () {
      if (call !== imCall) return;
      imCallRenderOverlay();
    });
    // Anyone already in the call when I join.
    (call.remoteParticipants || []).forEach(imCallWatchParticipantVideo);
    call.on('remoteParticipantsUpdated', function (e) {
      if (call !== imCall) return;
      if (e.added && e.added.length) imCallStopRingtone();
      (e.added || []).forEach(imCallWatchParticipantVideo);
      (e.removed || []).forEach(function (p) {
        const k = imAcsIdentifierToString(p.identifier);
        if (imCallRemoteViews[k]) { try { imCallRemoteViews[k].renderer.dispose(); } catch (err) {} delete imCallRemoteViews[k]; }
      });
      if (e.removed && e.removed.length) {
        if (!imCallIsGroup) {
          // Direct call: there's only ever one other participant, so them
          // leaving always ends the call for me too instead of leaving me
          // stuck alone in an "active" call with no one on the other end.
          imToast('Call ended.', '');
          imCallLeave('completed');
          return;
        } else if (!call.remoteParticipants.length) {
          // Group call: everyone else has left - end it for me too rather
          // than sitting alone in a call by myself.
          imToast('Call ended — everyone else left.', '');
          imCallLeave(null);
          return;
        }
      }
      imCallRenderOverlay();
    });
  }

  // Ring notifications (invite/busy/reject) still ride the app's own
  // WebSocket - actual call media/signaling is entirely handled by ACS
  // (see imCallWireCallEvents), this is purely the "someone's calling you"
  // UX layer, same idea as a phone ringing before you pick up.
  function imCallHandleSignal(msg) {
    if (!msg) return;
    const user = imCurrentUser();
    if (!user) return;

    if (msg.type === 'call-invite') {
      if (imCallState !== 'idle') {
        if (msg.callId === imCallId) return; // already in this exact call (simultaneous-call race), nothing to do
        imCallSend({ type: 'call-busy', callId: msg.callId, fromName: user.displayName, to: msg.from });
        return;
      }
      imCallInvite = { callId: msg.callId, conversationId: msg.conversationId, isGroup: !!msg.isGroup, inviterId: msg.from, inviterName: msg.fromName || imAccount(msg.from).displayName };
      imCallState = 'ringing';
      imCallRenderOverlay();
      imCallStartRingtone(false); // incoming ringtone (I'm being called)
      imCallRingTimer = setTimeout(function () {
        if (imCallState === 'ringing' && imCallInvite && imCallInvite.callId === msg.callId) { imToast('Missed call from ' + imCallInvite.inviterName + '.', ''); imCallLeave(msg.isGroup ? null : 'noanswer'); }
      }, IM_CALL_RING_TIMEOUT_MS);
      return;
    }

    if (msg.type === 'call-busy') { imToast((msg.fromName || 'They') + ' can’t take the call right now.', ''); return; }

    if (msg.type === 'call-reject') {
      imToast((msg.fromName || 'They') + ' declined the call.', '');
      if (!imCallIsGroup) imCallLeave('declined');
      return;
    }
  }

  function imSyncFromStorage(kind) {
    if (kind === 'store') {
      const oldActive = imActiveConversationId;
      imData = imReadStore(); imEnsureGeneral();
      if (oldActive && imConversation(oldActive)) imActiveConversationId = oldActive;
      if (imCurrentPageActive()) { imRenderConversationList(); imRenderActiveConversation(false); }
      imUpdateSidebarUnread();
    } else if (imCurrentPageActive()) {
      imRenderTyping(); imRenderHeaderStatus(); imRenderConversationList(); imRenderDetails();
    }
  }
  function imInstallSync() {
    try {
      if ('BroadcastChannel' in window) {
        imBroadcast = new BroadcastChannel('ctg_internal_messaging');
        imBroadcast.onmessage = function (event) { const type = event.data && event.data.type; imSyncFromStorage(type === 'store' ? 'store' : type); };
      }
    } catch (e) { imBroadcast = null; }
    window.addEventListener('storage', function (event) {
      if (event.key === IM_STORE_KEY) imSyncFromStorage('store');
      else if (event.key === IM_TYPING_KEY) imSyncFromStorage('typing');
      else if (event.key === IM_PRESENCE_KEY) imSyncFromStorage('presence');
      else if (event.key === IM_ACCOUNTS_KEY) { imData = imReadStore(); imEnsureGeneral(); if (imCurrentPageActive()) imRenderInternalMessaging(); }
    });
  }

  function imPassiveTick() {
    const user = imCurrentUser();
    const userId = user ? user.id : '';
    if (userId !== imLastCurrentUserId) {
      imLastCurrentUserId = userId;
      imData = null; imActiveConversationId = null;
      if (user) { imLoad(); imStartRealtime(); }
      else imStopRealtime();
      if (imCurrentPageActive()) imRenderInternalMessaging();
      imUpdateSidebarUnread();
    }
    if (!user) return;
    const hash = imAccounts().map(u => u.id + ':' + u.displayName + ':' + u.role).join('|');
    if (hash !== imLastAccountsHash) {
      imLastAccountsHash = hash;
      if (!imData) imData = imReadStore(); imEnsureGeneral();
      if (imCurrentPageActive()) { imRenderConversationList(); imRenderHeaderStatus(); imRenderDetails(); }
    }
  }

  function imInstallPageHook() {
    const previous = window.showPage;
    if (typeof previous !== 'function') return;
    window.showPage = function (name) {
      const result = previous.apply(this, arguments);
      document.body.classList.toggle('internal-messaging-active', name === 'internalMessaging');
      if (name === 'internalMessaging') setTimeout(imRenderInternalMessaging, 0);
      else imSetTyping(false);
      return result;
    };
  }

  window.renderInternalMessaging = imRenderInternalMessaging;
  window.imOpenConversation = imOpenConversation;
  window.imMobileBack = imMobileBack;
  window.imSearchConversations = imSearchConversations;
  window.imSearchMessages = imSearchMessages;
  window.imToggleMessageSearch = imToggleMessageSearch;
  window.imCloseMessageSearch = imCloseMessageSearch;
  window.imToggleDetails = imToggleDetails;
  window.imComposerChanged = imComposerChanged;
  window.imComposerKeydown = imComposerKeydown;
  window.imRememberSelection = imRememberSelection;
  window.imInsertMentionTrigger = imInsertMentionTrigger;
  window.imSelectMention = imSelectMention;
  window.imUpdateMentionMenu = imUpdateMentionMenu;
  window.imWrapSelection = imWrapSelection;
  window.imToggleEmojiPicker = imToggleEmojiPicker;
  window.imInsertEmoji = imInsertEmoji;
  window.imChooseAttachment = imChooseAttachment;
  window.imAttachmentSelected = imAttachmentSelected;
  window.imClearAttachment = imClearAttachment;
  window.imSendMessage = imSendMessage;
  window.imReplyToMessage = imReplyToMessage;
  window.imEditMessage = imEditMessage;
  window.imCancelContext = imCancelContext;
  window.imUnsendMessage = imUnsendMessage;
  window.imUndoUnsend = imUndoUnsend;
  window.imDeleteForMe = imDeleteForMe;
  window.imToggleReactionMenu = imToggleReactionMenu;
  window.imToggleMessageMenu = imToggleMessageMenu;
  window.imCloseMessageMenus = imCloseMessageMenus;
  window.imReact = imReact;
  window.imToggleMessagePin = imToggleMessagePin;
  window.imJumpToMessage = imJumpToMessage;
  window.imToggleFavorite = imToggleFavorite;
  window.imToggleMute = imToggleMute;
  window.imHideConversation = imHideConversation;
  window.imSetDetailsMediaTab = imSetDetailsMediaTab;
  window.imChooseConversationIcon = imChooseConversationIcon;
  window.imIconFileSelected = imIconFileSelected;
  window.imRemoveConversationIcon = imRemoveConversationIcon;
  window.imOpenChatModal = imOpenChatModal;
  window.imCloseChatModal = imCloseChatModal;
  window.imRenderMemberPicker = imRenderMemberPicker;
  window.imModalMemberToggle = imModalMemberToggle;
  window.imSaveChatModal = imSaveChatModal;
  window.imRunUndo = imRunUndo;
  window.imCallStart = imCallStart;
  window.imCallAccept = imCallAccept;
  window.imCallDecline = imCallDecline;
  window.imCallLeave = imCallLeave;
  window.imCallToggleMute = imCallToggleMute;
  window.imCallToggleMinimize = imCallToggleMinimize;

  imInstallPageHook();
  imInstallSync();
  // Primes the ringtone AudioContext on the first interaction anywhere on the
  // page (not necessarily the call button) so an incoming call - which
  // arrives passively over the WebSocket, not from a click - can actually
  // play its ringtone instead of being silently blocked by autoplay policy.
  (function () {
    function unlockOnce() { imCallUnlockRingAudio(); document.removeEventListener('click', unlockOnce); document.removeEventListener('keydown', unlockOnce); }
    document.addEventListener('click', unlockOnce, { once: true });
    document.addEventListener('keydown', unlockOnce, { once: true });
  })();
  imPassiveTimer = setInterval(imPassiveTick, 1000);
  document.addEventListener('click', function (event) {
    if (!event.target.closest('#imMentionMenu') && !event.target.closest('#imComposerInput') && !event.target.closest('[data-onclick="imInsertMentionTrigger()"]')) imCloseMentionMenu();
    if (!event.target.closest('#imEmojiPicker') && !event.target.closest('[data-onclick="imToggleEmojiPicker()"]')) {
      imEmojiOpen = false; document.getElementById('imEmojiPicker')?.classList.remove('open');
    }
    if (!event.target.closest('.im-reaction-picker') && !event.target.closest('[data-onclick*="imToggleReactionMenu"]')) {
      document.querySelectorAll('.im-reaction-picker.open').forEach(el => el.classList.remove('open'));
    }
    if (!event.target.closest('.im-message-menu') && !event.target.closest('.im-message-more')) imCloseMessageMenus();
    if (event.target.classList.contains('im-modal-overlay')) imCloseChatModal();
  });
  window.addEventListener('beforeunload', function () { imSetTyping(false); if (imCallState !== 'idle') imCallLeave(); });
  setTimeout(imPassiveTick, 0);
})();
