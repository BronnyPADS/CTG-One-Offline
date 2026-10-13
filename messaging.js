
const MSG_TYPES = ['Send Concussion Intake', 'Send Portal Invite', 'Send Selected Forms']

const PATIENT_FORM_CATALOG = [
  { key: 'demographics', label: 'Demographics' },
  { key: 'insurance',    label: 'Insurance & Attorney' },
  { key: 'intakeForm',   label: 'Intake Form' },
  { key: 'minorAuth',    label: 'Minor Authorization' }
]
function ctgFormLabel(key) { const f = PATIENT_FORM_CATALOG.find(x => x.key === key); return f ? f.label : key }
function ctgGetSelectedForms(p) {
  const raw = p && p.formSelection && Array.isArray(p.formSelection.forms) ? p.formSelection.forms : []
  // Keep only keys that still exist in the catalogue, in catalogue order.
  return PATIENT_FORM_CATALOG.map(f => f.key).filter(k => raw.indexOf(k) !== -1)
}
function ctgSetSelectedForms(p, keys) {
  if (!p) return
  const clean = PATIENT_FORM_CATALOG.map(f => f.key).filter(k => keys.indexOf(k) !== -1)
  p.formSelection = { forms: clean, updatedAt: new Date().toISOString() }
  p.updatedAt = p.formSelection.updatedAt
  if (typeof persistPatients === 'function') persistPatients()
}
function ctgNewFormsToken() {
  var bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  var bin = ''
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  var b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'tok_' + b64
}
function ctgFormsPortalUrl(patientId, keys, token) {
  // Real, self-contained link: opens this app in patient-form mode via the hash,
  // rendering only the encoded forms. (Delivery over SMS/email still needs a
  // gateway; the link and the form the patient fills are fully built.)
  var payload = { p: patientId || '', f: (keys || []).slice(), t: token || '' }
  var enc
  try { enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))) }
  catch (e) { enc = encodeURIComponent(JSON.stringify(payload)) }
  var base = location.origin + location.pathname
  return base + '#pf=' + enc
}
// Expose for intake.js (the Forms-page checklist lives there).
window.PATIENT_FORM_CATALOG = PATIENT_FORM_CATALOG
window.ctgFormLabel = ctgFormLabel
window.ctgFormCatalog = function () { return PATIENT_FORM_CATALOG.slice() }
window.ctgGetSelectedForms = ctgGetSelectedForms
window.ctgSetSelectedForms = ctgSetSelectedForms

const MSG_DEFAULT_TEMPLATES = {
  'Send Concussion Intake': 'Hi [Patient Name],\nPlease press or click this link to complete the [Facility] Intake forms: [IntakeUrl]',
  'Send Portal Invite': 'Hi [Patient Name],\nYou have been invited to the [Facility] Patient Portal. Click here to set up your account and view your visit information: [PortalUrl]',
  'Send Selected Forms': 'Hi [Patient Name],\nPlease click this secure link to complete your [Facility] forms ([FormsList]): [FormsUrl]'
}
const MSG_DEFAULT_NEW_PATIENT_TEMPLATES = {
  'Send Concussion Intake': 'Hi [Patient Name],\nWelcome to [Facility]! Before your first visit, please press or click this link to complete your Intake forms: [IntakeUrl]',
  'Send Portal Invite': 'Hi [Patient Name],\nWelcome to [Facility]! You have been invited to the Patient Portal. Click here to set up your account: [PortalUrl]',
  'Send Selected Forms': 'Hi [Patient Name],\nWelcome to [Facility]! Please click this secure link to complete your forms ([FormsList]): [FormsUrl]'
}

const MSG_TEMPLATES_KEY = 'ctgMsgTemplates'
const MSG_TEMPLATES_NEW_PATIENT_KEY = 'ctgMsgTemplatesNewPatient'

function msgLoadTemplates(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return Object.assign({}, fallback)
    const saved = JSON.parse(raw)
    return Object.assign({}, fallback, saved)
  } catch (e) { return Object.assign({}, fallback) }
}
function msgSaveTemplates(storageKey, obj) {
  try { localStorage.setItem(storageKey, JSON.stringify(obj)) } catch (e) { /* quota - templates are tiny, ignore */ }
}

let msgActiveTab = 'newInvite'
let msgSelectedPatientId = null
let msgPendingType = '' // message type awaiting the Visit-Type modal's confirmation
// Per-invite working copy of the form selection: seeded from the patient's saved
// selection when a patient is picked, then adjustable here without overwriting
// the durable selection. The send uses this working set as the source of truth.
let msgFormsWorking = []
let msgFormsToken = ''

function renderInvitePatient() {
  msgSwitchTab('newInvite')       // always land on the compose view
  msgTemplateSub('default')       // default editor shown first inside the templates panel
  msgRenderDefaultsTab('msgDefaultsMount', MSG_TEMPLATES_KEY, MSG_DEFAULT_TEMPLATES)
  msgRenderDefaultsTab('msgNewPatientDefaultsMount', MSG_TEMPLATES_NEW_PATIENT_KEY, MSG_DEFAULT_NEW_PATIENT_TEMPLATES)
  msgRenderHistory()
}

/* The two message-template editors used to be top-level tabs, but they are
   settings - not part of composing an invite - so they now live behind one
   "Message templates" button. Only two views remain: the compose form and that
   panel. */
function msgSwitchTab(tab) {
  msgActiveTab = tab
  const showTpl = (tab === 'templates')
  const compose = document.getElementById('msgTabNewInvite')
  const panel = document.getElementById('msgTemplatesPanel')
  if (compose) compose.style.display = showTpl ? 'none' : ''
  if (panel) panel.style.display = showTpl ? '' : 'none'
  const btn = document.getElementById('msgTemplatesToggle')
  if (btn) btn.classList.toggle('active', showTpl)
}
function msgToggleTemplates() {
  msgSwitchTab(msgActiveTab === 'templates' ? 'newInvite' : 'templates')
}
/* Switch which template editor shows inside the templates panel. */
function msgTemplateSub(which) {
  const def = document.getElementById('msgDefaultsWrap')
  const np = document.getElementById('msgNewPatientWrap')
  if (def) def.style.display = which === 'newPatient' ? 'none' : ''
  if (np) np.style.display = which === 'newPatient' ? '' : 'none'
  document.querySelectorAll('#msgTplSeg .msg-tpl-seg-btn').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-sub') === which))
}

/* ---------- Patient search combo (same shared-panel technique as the date
   picker and the Write Off Group/Reason Code combos in billing.js) ---------- */
let msgComboActive = false
function msgPatientOptionsHTML(query) {
  const q = (query || '').trim().toLowerCase()
  const list = (typeof sortedPatients === 'function' ? sortedPatients() : [])
    .filter(p => {
      if (!q) return true
      const name = naturalPatientName(p).toLowerCase()
      const dob = String(p.demographics?.dob || '').toLowerCase()
      const mobile = String(p.demographics?.mobile || '').toLowerCase()
      return name.includes(q) || dob.includes(q) || mobile.includes(q)
    })
  const shown = list.slice(0, 60)
  if (!shown.length) return '<div class="ar-combo-empty">No matching patients</div>'
  let h = shown.map(p => {
    const sub = [p.demographics?.dob, p.demographics?.mobile].filter(Boolean).join(' · ')
    return '<div class="ar-combo-option" data-onmousedown="event.preventDefault();msgSelectPatient(\'' + arEsc(p.id) + '\')">'
      + '<span class="ar-combo-code">' + arEsc(initialsForPatient(p)) + '</span>'
      + '<span class="ar-combo-text"><strong>' + arEsc(naturalPatientName(p)) + '</strong>' + (sub ? ' — ' + arEsc(sub) : '') + '</span>'
      + '</div>'
  }).join('')
  if (list.length > shown.length) h += '<div class="ar-combo-empty">+' + (list.length - shown.length) + ' more — keep typing to narrow down</div>'
  return h
}
function msgPositionComboPanel() {
  const input = document.getElementById('msgPatientInput')
  const panel = document.getElementById('msgComboPanel')
  if (!input || !panel) return
  const r = input.getBoundingClientRect()
  const maxLeft = window.innerWidth - r.width - 12
  panel.style.left = Math.max(8, Math.min(r.left, maxLeft)) + 'px'
  panel.style.top = (r.bottom + 4) + 'px'
  panel.style.width = r.width + 'px'
}
function msgOpenPatient() {
  msgComboActive = true
  const panel = document.getElementById('msgComboPanel')
  if (!panel) return
  panel.innerHTML = msgPatientOptionsHTML(document.getElementById('msgPatientInput').value)
  msgPositionComboPanel()
  panel.classList.add('show')
}
function msgFilterPatient() { msgOpenPatient() }
function msgCloseCombo() {
  const panel = document.getElementById('msgComboPanel')
  if (panel) panel.classList.remove('show')
  msgComboActive = false
}
function msgSelectPatient(patientId) {
  const p = getPatient(patientId)
  if (!p) return
  msgSelectedPatientId = patientId
  document.getElementById('msgPatientInput').value = naturalPatientName(p)
  document.getElementById('msgMobile').value = p.demographics?.mobile || ''
  document.getElementById('msgEmail').value = p.demographics?.email || ''
  msgCloseCombo()
  // Seed the invite's working form selection from the patient's saved checklist
  // and mint a token for this invite's link.
  msgFormsWorking = ctgGetSelectedForms(p)
  msgFormsToken = ctgNewFormsToken()
  msgRenderFormsPanel()
  // The message + secure link are generated automatically now - no dropdown.
  msgFillMessage('Send Selected Forms')
}
/* Forms checklist on the invite page - shown once a patient is picked. Mirrors
   the saved selection; toggling here changes only this invite's working copy. */
function msgRenderFormsPanel() {
  const panel = document.getElementById('msgFormsPanel')
  const mount = document.getElementById('msgFormsMount')
  if (!panel || !mount) return
  if (!msgSelectedPatientId) { panel.style.display = 'none'; mount.innerHTML = ''; return }
  panel.style.display = ''
  mount.innerHTML = PATIENT_FORM_CATALOG.map(f => {
    const on = msgFormsWorking.indexOf(f.key) !== -1
    return '<label class="msg-form-item' + (on ? ' is-on' : '') + '">'
      + '<input type="checkbox"' + (on ? ' checked' : '') + ' data-onchange="msgToggleForm(\'' + f.key + '\', this.checked)">'
      + '<span>' + arEsc(f.label) + '</span>'
      + '</label>'
  }).join('')
  const count = document.getElementById('msgFormsCount')
  if (count) count.textContent = msgFormsWorking.length + ' selected'
}
function msgToggleForm(key, on) {
  const i = msgFormsWorking.indexOf(key)
  if (on && i === -1) msgFormsWorking.push(key)
  else if (!on && i !== -1) msgFormsWorking.splice(i, 1)
  msgRenderFormsPanel()
  // Regenerate the message + link so the body always matches the ticked forms.
  msgFillMessage('Send Selected Forms')
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#msgPatientCombo') && !e.target.closest('#msgComboPanel')) msgCloseCombo()
})
window.addEventListener('resize', () => { if (msgComboActive) msgPositionComboPanel() })
document.addEventListener('scroll', () => { if (msgComboActive) msgPositionComboPanel() }, true)

/* ---------- Message type + template fill ---------- */
function msgCloseVisitTypeModal() {
  document.getElementById('msgVisitTypeModal').classList.remove('show')
  msgPendingType = ''
}
function msgConfirmVisitType() {
  const visitType = document.getElementById('msgVisitTypeSelect').value
  if (!visitType) { showToast('Select a visit type', 'err'); return }
  document.getElementById('msgVisitTypeModal').classList.remove('show')
  msgFillMessage(msgPendingType, { visitType })
  msgPendingType = ''
}
function msgFillMessage(type, opts) {
  opts = opts || {}
  const p = msgSelectedPatientId ? getPatient(msgSelectedPatientId) : null
  const facility = p?.demographics?.facility || (typeof APPT_FACILITIES !== 'undefined' ? APPT_FACILITIES[0] : 'Concussion Therapy Group')
  const templates = msgLoadTemplates(MSG_TEMPLATES_KEY, MSG_DEFAULT_TEMPLATES)
  let body = templates[type] || ''
  const patientName = p ? naturalPatientName(p) : '[Patient Name]'
  const intakeUrl = 'https://portal.ctg.health/intake/' + (p ? p.id : 'new') + (opts.visitType ? '?visit=' + encodeURIComponent(opts.visitType) : '')
  const portalUrl = 'https://portal.ctg.health/invite/' + (p ? p.id : 'new')
  const formsUrl = ctgFormsPortalUrl(p ? p.id : 'new', msgFormsWorking, msgFormsToken)
  const formsList = msgFormsWorking.length ? msgFormsWorking.map(ctgFormLabel).join(', ') : 'no forms selected'
  body = body.replace(/\[Patient Name\]/g, patientName)
    .replace(/\[Facility\]/g, facility)
    .replace(/\[IntakeUrl\]/g, intakeUrl)
    .replace(/\[PortalUrl\]/g, portalUrl)
    .replace(/\[FormsUrl\]/g, formsUrl)
    .replace(/\[FormsList\]/g, formsList)
  document.getElementById('msgBody').value = body
  msgSyncPreview()
}

function msgSetEditorMode() { /* editor modes removed */ }
function msgSyncPreview() { /* preview pane removed */ }

/* ---------- Send / Close ---------- */
function msgResetForm() {
  msgSelectedPatientId = null
  msgFormsWorking = []
  msgFormsToken = ''
  document.getElementById('msgPatientInput').value = ''
  document.getElementById('msgChanSms').checked = true
  document.getElementById('msgChanEmail').checked = true
  document.getElementById('msgMobile').value = ''
  document.getElementById('msgEmail').value = ''
  document.getElementById('msgBody').value = ''
  msgRenderFormsPanel()
  msgSetEditorMode('design')
  msgSyncPreview()
}
// Hands the composed invite to the server for real delivery. The invite is
// already recorded locally by this point, so a delivery failure still leaves
// a history entry - it just reports honestly instead of claiming success.
async function msgDeliverInvite(patient, invite) {
  const name = naturalPatientName(patient)
  if (typeof window.ctgApiFetch !== 'function') {
    showToast('Invite saved, but delivery is unavailable offline', 'err')
    return
  }
  showToast('Sending invite to ' + name + '…', '')
  try {
    const res = await window.ctgApiFetch('/api/invites/send', {
      method: 'POST',
      body: JSON.stringify({
        patientId: patient.id,
        sendEmail: invite.channels.indexOf('Email') !== -1,
        sendSms: invite.channels.indexOf('SMS') !== -1,
        email: invite.email || '',
        mobile: invite.mobile || '',
        body: invite.body || '',
        linkUrl: invite.formsUrl || ''
      })
    })
    const parts = []
    if (res.results.email) parts.push(res.results.email.ok ? 'email sent' : 'email failed: ' + res.results.email.error)
    if (res.results.sms) parts.push(res.results.sms.ok ? 'SMS sent' : 'SMS failed: ' + res.results.sms.error)
    const allOk = Object.keys(res.results).every(function (k) { return !res.results[k] || res.results[k].ok })
    showToast('Invite to ' + name + ' — ' + parts.join(', '), allOk ? 'ok' : 'err')
  } catch (e) {
    // Every channel failed; the server returns the per-channel reasons in the
    // same shape, so surface whichever detail we have.
    let detail = e.message || 'delivery failed'
    showToast('Could not send invite to ' + name + ': ' + detail, 'err')
  }
}

function msgSend() {
  const p = msgSelectedPatientId ? getPatient(msgSelectedPatientId) : null
  if (!p) { showToast('Search for and select a patient first', 'err'); return }
  const sms = document.getElementById('msgChanSms').checked
  const email = document.getElementById('msgChanEmail').checked
  if (!sms && !email) { showToast('Choose SMS, Email, or both', 'err'); return }
  const mobile = document.getElementById('msgMobile').value.trim()
  const emailAddr = document.getElementById('msgEmail').value.trim()
  if (sms && !mobile) { showToast('Enter a mobile number for SMS', 'err'); return }
  if (email && !emailAddr) { showToast('Enter an email address for Email', 'err'); return }
  // The message + secure link are generated automatically from the ticked forms,
  // so every New Invite is a forms invite.
  const type = 'Send Selected Forms'
  const body = document.getElementById('msgBody').value.trim()
  if (!body) { showToast('Message is empty — select a patient to generate it', 'err'); return }

  // A forms invite must carry at least one form - the final checked set is the
  // source of truth for the link's scope.
  const isFormsInvite = true
  const sentForms = msgFormsWorking.slice()
  if (isFormsInvite && !sentForms.length) { showToast('Select at least one form to include before sending', 'err'); return }

  if (!Array.isArray(p.invites)) p.invites = []
  const invite = {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    type: type || 'Custom Message',
    channels: [sms ? 'SMS' : null, email ? 'Email' : null].filter(Boolean),
    mobile: sms ? mobile : '',
    email: email ? emailAddr : '',
    body,
    sentAt: new Date().toISOString()
  }
  if (isFormsInvite) {
    invite.forms = sentForms
    invite.token = msgFormsToken || ctgNewFormsToken()
    invite.formsUrl = ctgFormsPortalUrl(p.id, sentForms, invite.token)
    // Record the token server-side (hashed) so the patient's device has
    // something to authenticate against - without this the link resolves to
    // nothing on any machine but this one.
    try {
      window.ctgApiFetch('/api/patient-forms', { method: 'POST', body: JSON.stringify(
        { patientId: p.id, token: invite.token, forms: sentForms }) })
        .catch(function (e) { console.error('Could not register the form link', e) })
    } catch (e) { console.error('Could not register the form link', e) }
    // Persist the finally-sent set back to the patient so the Forms page and the
    // next invite reflect what actually went out.
    ctgSetSelectedForms(p, sentForms)
  }
  p.invites.unshift(invite)
  persistPatients()
  msgDeliverInvite(p, invite)
  msgResetForm()
  msgRenderHistory()
}

/* ---------- Default Message / 'NEW PATIENT' Default Messages tabs ---------- */
function msgRenderDefaultsTab(mountId, storageKey, fallback) {
  const mount = document.getElementById(mountId)
  if (!mount) return
  const templates = msgLoadTemplates(storageKey, fallback)
  mount.innerHTML = MSG_TYPES.map(type => {
    const rowId = mountId + '_' + type.replace(/\s+/g, '_')
    return '<div class="msg-defaults-row">'
      + '<div class="msg-defaults-label">' + arEsc(type) + '</div>'
      + '<textarea id="' + rowId + '" rows="4">' + arEsc(templates[type] || '') + '</textarea>'
      + '<div class="msg-defaults-actions"><button type="button" class="btn btn-ghost btn-sm" data-onclick="msgSaveDefault(\'' + arEsc(storageKey) + '\',\'' + arEsc(type) + '\',\'' + arEsc(rowId) + '\')">Save</button></div>'
      + '</div>'
  }).join('')
}
function msgSaveDefault(storageKey, type, rowId) {
  const value = document.getElementById(rowId).value
  const templates = msgLoadTemplates(storageKey, storageKey === MSG_TEMPLATES_KEY ? MSG_DEFAULT_TEMPLATES : MSG_DEFAULT_NEW_PATIENT_TEMPLATES)
  templates[type] = value
  msgSaveTemplates(storageKey, templates)
  showToast('Default message saved', 'ok')
}

/* ---------- Recent Invites ---------- */
function msgRenderHistory() {
  const mount = document.getElementById('msgHistoryMount')
  const tag = document.getElementById('msgInviteCountTag')
  if (!mount) return
  const rows = []
  ;(typeof ctgPatients !== 'undefined' ? ctgPatients : []).forEach(p => {
    (p.invites || []).forEach(inv => rows.push(Object.assign({}, inv, { patientName: naturalPatientName(p), patientId: p.id })))
  })
  rows.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
  if (tag) tag.textContent = rows.length + (rows.length === 1 ? ' Sent' : ' Sent')
  if (!rows.length) { mount.innerHTML = '<div class="msg-history-empty">No invites sent yet.</div>'; return }
  mount.innerHTML = rows.slice(0, 40).map(r => {
    const when = r.sentAt ? new Date(r.sentAt).toLocaleString() : ''
    const chans = (r.channels || []).map(c => '<span class="msg-chan-pill">' + arEsc(c) + '</span>').join('')
    const forms = Array.isArray(r.forms) && r.forms.length
      ? '<span class="msg-history-forms">' + r.forms.map(k => '<span class="msg-form-pill">' + arEsc(ctgFormLabel(k)) + '</span>').join('') + '</span>'
      : ''
    const status = r.completedAt
      ? '<span class="msg-status-pill is-done" title="Completed ' + arEsc(new Date(r.completedAt).toLocaleString()) + '">✓ Completed</span>'
      : (Array.isArray(r.forms) && r.forms.length ? '<span class="msg-status-pill">Awaiting</span>' : '')
    const hasLink = !!r.formsUrl
    const actions = '<span class="msg-history-actions">'
      + (hasLink ? '<button type="button" class="msg-act" title="Copy invite link" data-onclick="msgCopyInviteLink(\'' + arEsc(r.patientId) + '\',\'' + arEsc(r.id) + '\')">Copy link</button>' : '')
      + (hasLink ? '<button type="button" class="msg-act" title="Open the patient form" data-onclick="msgOpenInviteLink(\'' + arEsc(r.patientId) + '\',\'' + arEsc(r.id) + '\')">Open</button>' : '')
      + '<button type="button" class="msg-act msg-act-del" title="Delete this invite" data-onclick="msgDeleteInvite(\'' + arEsc(r.patientId) + '\',\'' + arEsc(r.id) + '\')">Delete</button>'
      + '</span>'
    return '<div class="msg-history-row">'
      + '<span class="msg-history-name">' + arEsc(r.patientName) + '</span>'
      + '<span class="msg-history-type">' + arEsc(r.type) + forms + status + '</span>'
      + '<span class="msg-history-chan">' + chans + '</span>'
      + '<span class="msg-history-time">' + arEsc(when) + '</span>'
      + actions
      + '</div>'
  }).join('')
}
/* ---------- Recent Invites row actions ---------- */
function msgFindInvite(patientId, inviteId) {
  const p = getPatient(patientId)
  if (!p || !Array.isArray(p.invites)) return { p: null, inv: null }
  return { p: p, inv: p.invites.filter(x => x.id === inviteId)[0] || null }
}
function msgCopyInviteLink(patientId, inviteId) {
  const r = msgFindInvite(patientId, inviteId)
  if (!r.inv || !r.inv.formsUrl) { showToast('No link on this invite', 'err'); return }
  const url = r.inv.formsUrl
  const done = () => showToast('Invite link copied', 'ok')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => msgCopyFallback(url, done))
  } else { msgCopyFallback(url, done) }
}
function msgCopyFallback(text, done) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    done()
  } catch (e) { showToast('Could not copy — copy it from the message body', 'err') }
}
function msgOpenInviteLink(patientId, inviteId) {
  const r = msgFindInvite(patientId, inviteId)
  if (!r.inv || !r.inv.formsUrl) { showToast('No link on this invite', 'err'); return }
  window.open(r.inv.formsUrl, '_blank')
}
async function msgDeleteInvite(patientId, inviteId) {
  const r = msgFindInvite(patientId, inviteId)
  if (!r.p || !r.inv) return
  const ok = (typeof ctgConfirm === 'function')
    ? await ctgConfirm('Delete this invite from ' + naturalPatientName(r.p) + '’s history? This does not recall any message already sent.', { danger: true, okLabel: 'Delete', title: 'Delete Invite' })
    : confirm('Delete this invite?')
  if (!ok) return
  r.p.invites = r.p.invites.filter(x => x.id !== inviteId)
  r.p.updatedAt = new Date().toISOString()
  persistPatients()
  showToast('Invite deleted', 'ok')
  msgRenderHistory()
}
