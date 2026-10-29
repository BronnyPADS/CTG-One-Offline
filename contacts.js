(function () {
  'use strict';

  const CT_STORE_KEY = 'ctg_contacts_v1';
  const CT_DISMISSED_KEY = 'ctg_contacts_dismissed_synced_v1';
  const CT_CATEGORIES = ['Provider', 'Attorney', 'Law Firm', 'Case Manager', 'Referring Physician',
    'Pharmacy', 'Facility', 'Insurance', 'Other'];
  const CT_SPECIALTIES = ['Chiropractic', 'Neurology', 'Orthopedics', 'Physical Therapy', 'Primary Care',
    'Radiology', 'Pain Management', 'Neuropsychology', 'Physical Medicine & Rehab', 'General'];
  const CT_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
    'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

  // List columns in reference order (Modify + Link are rendered separately).
  const CT_COLS = [
    { key: 'last', label: 'LastName' },
    { key: 'first', label: 'FirstName' },
    { key: 'suffix', label: 'Suffix' },
    { key: 'companyName', label: 'CompanyName' },
    { key: 'directAddress', label: 'Direct Address' },
    { key: 'npi', label: 'NPI' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'mainPhone', label: 'MainPhone' },
    { key: 'mobilePhone', label: 'MobilePhone' },
    { key: 'faxNumber', label: 'FaxNumber' }
  ];

  let ctData = null;
  let ctTab = 'list';                 // 'list' | 'form'
  let ctEditingId = null;
  let ctCategoryFilter = 'All';
  let ctAlpha = 'All';
  let ctColFilters = {};              // per-column text filters

  function ctEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ctToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function ctId() { return 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function ctLoad() {
    if (ctData) return ctData;
    // Left as the offline fallback only - the server is the real store now.
    try { ctData = JSON.parse(localStorage.getItem(CT_STORE_KEY) || '[]') || []; }
    catch (e) { ctData = []; }
    if (!Array.isArray(ctData)) ctData = [];
    return ctData;
  }
  /* Contacts are a shared directory, so they live on the server. The local
     copy is kept purely as a read cache: if the network is down the page still
     renders what it had, and the next successful save replaces it. */
  let ctVersion = 0;
  function ctSave() {
    try { localStorage.setItem(CT_STORE_KEY, JSON.stringify(ctData)); } catch (e) {}
    if (typeof window.ctgApiFetch !== 'function') return;
    window.ctgApiFetch('/api/shared/doc/contacts', {
      method: 'PUT', body: JSON.stringify({ data: ctData, version: ctVersion })
    }).then(function (r) { ctVersion = r.version; }).catch(function (e) {
      // A 409 means someone else saved first; reload rather than clobber them.
      if (e && e.status === 409) {
        ctToast('Contacts were changed by someone else — reloading the latest.', 'err');
        ctVersion = (e.body && e.body.version) || ctVersion;
        ctLoadRemote(true);
      } else {
        ctToast('Saved on this device, but not to the server yet.', 'err');
      }
    });
  }

  /* Pull the shared copy. Called on first render and whenever another user
     saves (see the realtime hook at the bottom of this file). */
  function ctLoadRemote(rerender) {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/doc/contacts').then(function (r) {
      ctVersion = r.version || 0;
      if (Array.isArray(r.data)) {
        ctData = r.data;
        try { localStorage.setItem(CT_STORE_KEY, JSON.stringify(ctData)); } catch (e) {}
      } else if (ctVersion === 0 && ctData && ctData.length) {
        // Nothing on the server yet: adopt whatever this browser already had,
        // so the first person to open the page seeds it rather than losing it.
        ctSave();
      }
      if (rerender && typeof window.renderContacts === 'function') window.renderContacts();
    }).catch(function () { /* offline - the cached copy stands */ });
  }
  window.ctgContactsRealtime = function () { ctLoadRemote(true); };
  /* Read-only view for Spotlight. Includes the entries synthesised from the
     patient roster, which is what the Contacts page itself lists. */
  window.ctgContactsAll = function () {
    if (!Array.isArray(ctData)) return [];
    try { return ctData.concat(ctSyncedFromPatients()); } catch (e) { return ctData.slice(); }
  };

  function ctBlank() {
    return {
      id: '', category: 'Provider', prefix: '', first: '', middle: '', last: '', suffix: '', birthday: '',
      companyName: '', location: '', address1: '', address2: '', city: '', state: '', zip: '',
      speciality: '', mainPhone: '', homePhone: '', mobilePhone: '', pager: '', faxNumber: '', email: '',
      npi: '', ncpdpid: '', dea: '', clia: '', reserved1: '', reserved2: '', reserved3: '', reserved4: '',
      reserved5: '', note: '', directAddress: '', active: true, readOnly: false
    };
  }
  function ctFullAddress(c) {
    return [c.address1, c.address2].filter(Boolean).join(', ');
  }

  function ctPatients() { return (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : []; }
  function ctDismissedSynced() {
    try { const v = JSON.parse(localStorage.getItem(CT_DISMISSED_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function ctDismissSynced(id) {
    const list = ctDismissedSynced();
    if (!list.includes(id)) list.push(id);
    try { localStorage.setItem(CT_DISMISSED_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function ctSyncedFromPatients() {
    const dismissed = ctDismissedSynced();
    const map = {};
    ctPatients().forEach(p => {
      const atty = (p.intake && p.intake.attorney) || {};
      const attorneyName = String(atty.attorneyName || '').trim();
      // Same precedence as the intake document: the firm answered on the form
      // if there is one, otherwise the firm registered on the chart.
      const lawFirm = String(atty.lawFirm || (p.demographics && p.demographics.lawFirm) || '').trim();
      if (!attorneyName && !lawFirm) return;
      const key = (attorneyName || lawFirm).toLowerCase();
      const id = 'patient_atty_' + key.replace(/[^a-z0-9]+/g, '_');
      if (dismissed.includes(id)) return;
      if (!map[key]) {
        const parts = attorneyName.split(/\s+/).filter(Boolean);
        const last = parts.length > 1 ? parts.slice(-1)[0] : (attorneyName || lawFirm);
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
        map[key] = Object.assign(ctBlank(), {
          id: id,
          category: 'Attorney', first: first, last: last, companyName: lawFirm,
          address1: atty.address || '', mainPhone: atty.phone || '', faxNumber: atty.fax || '',
          readOnly: true, synced: true, syncedPatients: []
        });
      }
      map[key].syncedPatients.push((typeof fullPatientName === 'function') ? fullPatientName(p) : 'Patient');
    });
    return Object.values(map);
  }

  // ============================ render ============================
  let ctFetched = false;
  function renderContacts() {
    // First open in this session: get the shared copy before drawing.
    if (!ctFetched) { ctFetched = true; ctLoadRemote(true); }
    const mount = document.getElementById('contactsMount');
    if (!mount) return;
    ctLoad();
    mount.innerHTML = '<div class="ct-tabs">'
      + '<button type="button" class="ct-tab' + (ctTab === 'list' ? ' active' : '') + '" data-onclick="ctShowTab(\'list\')">Contacts</button>'
      + '<button type="button" class="ct-tab' + (ctTab === 'form' ? ' active' : '') + '" data-onclick="ctShowTab(\'form\')">Add/Edit Contact</button>'
      + '</div>'
      + '<div class="ct-body">' + (ctTab === 'form' ? ctFormHTML() : ctListHTML()) + '</div>';
  }

  function ctShowTab(tab) {
    if (tab === 'form' && ctTab !== 'form' && !ctEditingId) ctEditingId = null; // fresh add
    ctTab = tab;
    renderContacts();
  }

  // ---- list ----
  function ctListHTML() {
    const alphas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['All']);
    const catOpts = ['All'].concat(CT_CATEGORIES).map(c => '<option value="' + ctEsc(c) + '"' + (c === ctCategoryFilter ? ' selected' : '') + '>' + ctEsc(c) + '</option>').join('');
    return '<div class="ct-toolbar">'
      + '<div class="ct-toolbar-left">'
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="ctNew()">New</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="ctNpiSearch()">NPI Search</button>'
        + '<label class="ct-cat"><span>Category</span><select data-onchange="ctSetCategory(this.value)">' + catOpts + '</select></label>'
      + '</div>'
      + '<div class="ct-toolbar-right">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="ctPrint()">Print</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="ctPrintCard()">Print Contact Card</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="renderContacts()">Refresh Page</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="ctExport()">Export to Excel</button>'
      + '</div></div>'
      + '<div class="ct-alpha">' + alphas.map(a => '<button type="button" class="ct-alpha-btn' + (a === ctAlpha ? ' active' : '') + '" data-onclick="ctSetAlpha(\'' + a + '\')">' + a + '</button>').join('') + '</div>'
      + '<div class="ct-table-wrap"><table class="ct-table" id="ctTable">' + ctTableInner() + '</table></div>';
  }

  function ctFilteredContacts() {
    ctLoad();
    return ctData.concat(ctSyncedFromPatients()).filter(c => {
      if (ctCategoryFilter !== 'All' && c.category !== ctCategoryFilter) return false;
      if (ctAlpha !== 'All') {
        const first = String(c.last || '').trim().charAt(0).toUpperCase();
        if (first !== ctAlpha) return false;
      }
      for (const key in ctColFilters) {
        const needle = String(ctColFilters[key] || '').trim().toLowerCase();
        if (!needle) continue;
        const val = key === 'address' ? ctFullAddress(c) : c[key];
        if (String(val || '').toLowerCase().indexOf(needle) === -1) return false;
      }
      return true;
    }).sort((a, b) => String(a.last || '').localeCompare(String(b.last || ''), undefined, { sensitivity: 'base' })
      || String(a.first || '').localeCompare(String(b.first || ''), undefined, { sensitivity: 'base' }));
  }

  function ctTableInner() {
    const rows = ctFilteredContacts();
    let head = '<thead><tr><th class="ct-th-mini">Modify</th><th class="ct-th-npi">Link With NPI Database</th>';
    CT_COLS.forEach(c => { head += '<th>' + ctEsc(c.label) + '</th>'; });
    head += '</tr><tr class="ct-filter-row"><th></th><th></th>';
    CT_COLS.forEach(c => { head += '<th><input type="text" value="' + ctEsc(ctColFilters[c.key] || '') + '" data-oninput="ctSetColFilter(\'' + c.key + '\',this.value)"></th>'; });
    head += '</tr></thead>';

    let body = '<tbody>';
    if (!rows.length) {
      body += '<tr><td class="ct-empty" colspan="' + (CT_COLS.length + 2) + '">No contacts yet. Click <strong>New</strong> to add one.</td></tr>';
    } else {
      rows.forEach(c => {
        body += '<tr' + (c.synced ? ' class="ct-row-synced"' : '') + '>'
          + '<td class="ct-td-mini"><div class="ct-row-actions">'
            + '<button type="button" class="ct-edit-btn" title="' + (c.synced ? 'Edit — makes an independent copy you can manage here' : 'Edit contact') + '" data-onclick="' + (c.synced ? 'ctEditSynced' : 'ctEdit') + '(\'' + c.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
            + '<button type="button" class="ct-del-btn" title="' + (c.synced ? 'Remove from this list — the patient\'s own record is unaffected' : 'Delete contact') + '" data-onclick="' + (c.synced ? 'ctDeleteSynced' : 'ctDelete') + '(\'' + c.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
            + (c.synced ? '<span class="ct-sync-tag" title="Auto-added from ' + ctEsc(c.syncedPatients.join(', ')) + '\'s Insurance &amp; Attorney intake">⇄</span>' : '')
            + '</div></td>'
          + '<td class="ct-td-npi">' + (c.synced ? '<span class="ct-dash">—</span>' : '<a data-onclick="ctLinkNpi(\'' + c.id + '\')">Link With NPI Database</a>') + '</td>'
          + '<td>' + ctDash(c.last) + '</td>'
          + '<td>' + ctDash(c.first) + '</td>'
          + '<td>' + ctDash(c.suffix) + '</td>'
          + '<td>' + ctDash(c.companyName) + '</td>'
          + '<td>' + ctDash(c.directAddress) + '</td>'
          + '<td>' + ctDash(c.npi) + '</td>'
          + '<td>' + ctDash(ctFullAddress(c)) + '</td>'
          + '<td>' + ctDash(c.city) + '</td>'
          + '<td>' + ctDash(c.state) + '</td>'
          + '<td>' + ctDash(c.mainPhone) + '</td>'
          + '<td>' + ctDash(c.mobilePhone) + '</td>'
          + '<td>' + ctDash(c.faxNumber) + '</td>'
          + '</tr>';
      });
    }
    body += '</tbody>';
    return head + body;
  }
  function ctDash(v) { return v == null || v === '' ? '<span class="ct-dash">—</span>' : ctEsc(v); }

  function ctRenderTable() { const t = document.getElementById('ctTable'); if (t) t.innerHTML = ctTableInner(); }

  // ---- add / edit form ----
  function ctFormHTML() {
    const c = ctEditingId ? (ctData.find(x => x.id === ctEditingId) || ctBlank()) : ctBlank();
    const catOpts = CT_CATEGORIES.map(x => '<option value="' + ctEsc(x) + '"' + (x === c.category ? ' selected' : '') + '>' + ctEsc(x) + '</option>').join('');
    const specOpts = ['<option value="">Select Speciality</option>'].concat(CT_SPECIALTIES.map(x => '<option value="' + ctEsc(x) + '"' + (x === c.speciality ? ' selected' : '') + '>' + ctEsc(x) + '</option>')).join('');
    const stateOpts = ['<option value="">State</option>'].concat(CT_STATES.map(x => '<option value="' + ctEsc(x) + '"' + (x === c.state ? ' selected' : '') + '>' + ctEsc(x) + '</option>')).join('');
    const fld = (label, id, val, ph) => '<div class="ct-fld"><label>' + label + '</label><input type="text" id="' + id + '" value="' + ctEsc(val || '') + '"' + (ph ? ' placeholder="' + ctEsc(ph) + '"' : '') + '></div>';

    return '<div class="ct-form">'
      + '<div class="ct-form-head"><div class="ct-fld ct-fld-cat"><label>Category</label><select id="ctfCategory">' + catOpts + '</select></div>'
        + '<div class="ct-form-head-actions"><button type="button" class="btn btn-ghost btn-sm" data-onclick="ctInviteToPortal()">Invite To Portal</button><button type="button" class="btn btn-primary btn-sm" data-onclick="ctSaveForm()">Save</button></div></div>'

      + '<div class="ct-grid ct-grid-name">'
        + fld('Prefix', 'ctfPrefix', c.prefix) + fld('First', 'ctfFirst', c.first) + fld('Middle', 'ctfMiddle', c.middle)
        + fld('Last', 'ctfLast', c.last) + fld('Suffix', 'ctfSuffix', c.suffix)
        + '<div class="ct-fld"><label>Birthday</label><input type="date" id="ctfBirthday" value="' + ctEsc(c.birthday || '') + '"></div>'
      + '</div>'

      + ctSection('Company Details')
      + '<div class="ct-grid ct-grid-2">' + fld('Company Name', 'ctfCompany', c.companyName) + fld('Location', 'ctfLocation', c.location) + '</div>'

      + ctSection('Address')
      + '<div class="ct-grid ct-grid-addr">'
        + fld('Address1', 'ctfAddress1', c.address1) + fld('Address2', 'ctfAddress2', c.address2)
        + '<div class="ct-fld"><label>City</label><input type="text" id="ctfCity" value="' + ctEsc(c.city || '') + '" placeholder="City"></div>'
        + '<div class="ct-fld"><label>State</label><select id="ctfState">' + stateOpts + '</select></div>'
        + '<div class="ct-fld"><label>ZIP</label><input type="text" id="ctfZip" value="' + ctEsc(c.zip || '') + '" placeholder="ZIP"></div>'
      + '</div>'

      + ctSection('Speciality')
      + '<div class="ct-grid ct-grid-2">' + fld('Speciality', 'ctfSpeciality', c.speciality)
        + '<div class="ct-fld"><label>&nbsp;</label><select id="ctfSpecialitySel" data-onchange="ctfPickSpeciality(this.value)">' + specOpts + '</select></div></div>'

      + ctSection('Contact')
      + '<div class="ct-grid ct-grid-3">'
        + fld('Main Phone', 'ctfMainPhone', c.mainPhone) + fld('Home Phone', 'ctfHomePhone', c.homePhone) + fld('Mobile Phone', 'ctfMobilePhone', c.mobilePhone)
        + fld('Pager Number', 'ctfPager', c.pager) + fld('Fax Number', 'ctfFax', c.faxNumber) + fld('Email', 'ctfEmail', c.email)
      + '</div>'

      + ctSection('Others')
      + '<div class="ct-grid ct-grid-3">'
        + fld('NPI', 'ctfNpi', c.npi) + fld('NCPDPID', 'ctfNcpdpid', c.ncpdpid) + fld('DEA Number', 'ctfDea', c.dea)
        + fld('CLIA Number', 'ctfClia', c.clia) + fld('Reserved 1', 'ctfRes1', c.reserved1) + fld('Reserved 2', 'ctfRes2', c.reserved2)
        + fld('Reserved 3', 'ctfRes3', c.reserved3) + fld('Reserved 4', 'ctfRes4', c.reserved4) + fld('Reserved 5', 'ctfRes5', c.reserved5)
      + '</div>'
      + '<div class="ct-grid ct-grid-2">'
        + '<div class="ct-fld"><label>Note</label><textarea id="ctfNote" rows="3">' + ctEsc(c.note || '') + '</textarea></div>'
        + fld('Direct Messaging Address', 'ctfDirect', c.directAddress)
      + '</div>'
      + '<div class="ct-form-checks">'
        + '<label class="ct-chk"><input type="checkbox" id="ctfActive"' + (c.active !== false ? ' checked' : '') + '><span>Active</span></label>'
        + '<label class="ct-chk"><input type="checkbox" id="ctfReadOnly"' + (c.readOnly ? ' checked' : '') + '><span>Read Only</span></label>'
      + '</div>'
      + '<div class="ct-form-foot"><button type="button" class="btn btn-ghost btn-sm" data-onclick="ctShowTab(\'list\')">Cancel</button><button type="button" class="btn btn-primary btn-sm" data-onclick="ctSaveForm()">Save Contact</button></div>'
      + '</div>';
  }
  function ctSection(title) { return '<div class="ct-sec-hd">' + ctEsc(title) + '</div>'; }

  // ============================ actions ============================
  function ctNew() { ctEditingId = null; ctTab = 'form'; renderContacts(); }
  function ctEdit(id) { ctEditingId = id; ctTab = 'form'; renderContacts(); }
  function ctSetCategory(v) { ctCategoryFilter = v; ctRenderTable(); }
  function ctSetAlpha(a) { ctAlpha = a; document.querySelectorAll('#contactsMount .ct-alpha-btn').forEach(b => b.classList.toggle('active', b.textContent === a)); ctRenderTable(); }
  function ctSetColFilter(key, v) { ctColFilters[key] = v; ctRenderTable(); }

  function ctReadForm() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const chk = id => { const el = document.getElementById(id); return !!(el && el.checked); };
    return {
      category: g('ctfCategory'), prefix: g('ctfPrefix'), first: g('ctfFirst'), middle: g('ctfMiddle'),
      last: g('ctfLast'), suffix: g('ctfSuffix'), birthday: g('ctfBirthday'),
      companyName: g('ctfCompany'), location: g('ctfLocation'),
      address1: g('ctfAddress1'), address2: g('ctfAddress2'), city: g('ctfCity'), state: g('ctfState'), zip: g('ctfZip'),
      speciality: g('ctfSpeciality'),
      mainPhone: g('ctfMainPhone'), homePhone: g('ctfHomePhone'), mobilePhone: g('ctfMobilePhone'),
      pager: g('ctfPager'), faxNumber: g('ctfFax'), email: g('ctfEmail'),
      npi: g('ctfNpi'), ncpdpid: g('ctfNcpdpid'), dea: g('ctfDea'), clia: g('ctfClia'),
      reserved1: g('ctfRes1'), reserved2: g('ctfRes2'), reserved3: g('ctfRes3'), reserved4: g('ctfRes4'), reserved5: g('ctfRes5'),
      note: g('ctfNote'), directAddress: g('ctfDirect'), active: chk('ctfActive'), readOnly: chk('ctfReadOnly')
    };
  }
  function ctSaveForm() {
    const data = ctReadForm();
    if (!data.last.trim() && !data.companyName.trim()) { ctToast('Enter a last name or company name', 'err'); return; }
    ctLoad();
    if (ctEditingId) {
      const existing = ctData.find(x => x.id === ctEditingId);
      if (existing) Object.assign(existing, data, { updatedAt: new Date().toISOString() });
    } else {
      ctData.push(Object.assign(ctBlank(), data, { id: ctId(), createdAt: new Date().toISOString() }));
    }
    ctSave();
    ctEditingId = null;
    ctTab = 'list';
    renderContacts();
    ctToast('Contact saved ✓', 'ok');
  }

  async function ctDelete(id) {
    ctLoad();
    const c = ctData.find(x => x.id === id);
    if (!c) return;
    const label = (c.last || c.companyName || 'this contact');
    const ok = (typeof ctgConfirm === 'function') ? await ctgConfirm('Delete ' + label + '?', { danger: true, okLabel: 'Delete' }) : confirm('Delete ' + label + '?');
    if (!ok) return;
    ctData = ctData.filter(x => x.id !== id);
    ctSave();
    renderContacts();
    ctToast('Contact deleted', 'ok');
  }

  // Synced rows aren't stored contacts (they're computed from patient intake
  // each render), so they get their own edit/delete handling.
  function ctEditSynced(id) {
    const c = ctSyncedFromPatients().find(x => x.id === id);
    if (!c) return;
    ctLoad();
    const clone = Object.assign(ctBlank(), c, { id: ctId(), synced: false, readOnly: false, syncedPatients: undefined, createdAt: new Date().toISOString() });
    ctData.push(clone);
    ctDismissSynced(id);
    ctSave();
    ctEditingId = clone.id;
    ctTab = 'form';
    renderContacts();
    ctToast('Now managed as its own contact, separate from the patient record.', 'ok');
  }

  async function ctDeleteSynced(id) {
    const c = ctSyncedFromPatients().find(x => x.id === id);
    if (!c) return;
    const label = (c.last || c.companyName || 'this contact');
    const msg = 'Remove ' + label + ' from this list? This only hides the auto-added entry — ' + (c.syncedPatients.length > 1 ? 'the patients\' ' : 'the patient\'s ') + 'own intake record is unaffected.';
    const ok = (typeof ctgConfirm === 'function') ? await ctgConfirm(msg, { danger: true, okLabel: 'Remove' }) : confirm(msg);
    if (!ok) return;
    ctDismissSynced(id);
    renderContacts();
    ctToast('Removed from list', 'ok');
  }

  function ctNpiSearch() { ctToast('NPI registry lookup isn\'t connected in this portal yet.'); }
  function ctLinkNpi(id) { ctToast('NPI registry lookup isn\'t connected in this portal yet.'); }
  function ctInviteToPortal() { ctToast('Portal invitations are sent from Invite Patient / Access Control.'); }
  function ctPrint() { if (typeof window.print === 'function') window.print(); }
  function ctPrintCard() { ctToast('Select a contact\'s Modify pencil to view its card.'); }

  function ctExport() {
    const rows = ctFilteredContacts();
    if (!rows.length) { ctToast('Nothing to export', 'err'); return; }
    const header = ['Category', 'LastName', 'FirstName', 'Suffix', 'CompanyName', 'Direct Address', 'NPI', 'Address', 'City', 'State', 'MainPhone', 'MobilePhone', 'FaxNumber', 'Email'];
/* Spreadsheet formula injection: Excel runs a cell that starts with = + - @ (or a
       tab / carriage return) as a formula even inside quotes. Data typed on the public
       patient form or a law-firm referral lands in these files, so such cells get a
       leading apostrophe and open as text. Plain numbers (amounts, negatives) stay numbers. */
    const csvSafe = v => { const s = String(v == null ? '' : v); return (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s };
    const esc = v => '"' + csvSafe(v).replace(/"/g, '""') + '"';
    const lines = [header.map(esc).join(',')];
    rows.forEach(c => lines.push([c.category, c.last, c.first, c.suffix, c.companyName, c.directAddress, c.npi, ctFullAddress(c), c.city, c.state, c.mainPhone, c.mobilePhone, c.faxNumber, c.email].map(esc).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contacts.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ctToast('Exported ' + rows.length + ' contact' + (rows.length === 1 ? '' : 's') + ' ✓', 'ok');
  }

  window.renderContacts = renderContacts;
  window.ctShowTab = ctShowTab;
  window.ctNew = ctNew;
  window.ctEdit = ctEdit;
  window.ctDelete = ctDelete;
  window.ctEditSynced = ctEditSynced;
  window.ctDeleteSynced = ctDeleteSynced;
  window.ctSetCategory = ctSetCategory;
  window.ctSetAlpha = ctSetAlpha;
  window.ctSetColFilter = ctSetColFilter;
  window.ctSaveForm = ctSaveForm;
  window.ctNpiSearch = ctNpiSearch;
  window.ctLinkNpi = ctLinkNpi;
  window.ctInviteToPortal = ctInviteToPortal;
  window.ctPrint = ctPrint;
  window.ctPrintCard = ctPrintCard;
  window.ctExport = ctExport;
})();

;// Picking a speciality from the list fills the free-text box.
window.ctfPickSpeciality = function (v) { var f = document.getElementById('ctfSpeciality'); if (f && v) f.value = v }
