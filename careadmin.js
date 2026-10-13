(function () {
  'use strict';

  const CA_TABS = [
    ['patientList', 'Patient List'], ['encounters', 'Encounters'],
    ['careTasks', 'Care Tasks'], ['medDispense', 'Medication Dispense']
  ];
  let caTab = 'patientList';
  let caFilterOpen = true;
  let caSelectedIds = {};

  const CA_GROUP_OPTIONS = ['Administrator', 'Provider', 'Front Desk', 'Back office', 'Medical Provider', 'TA', 'Scheduler', 'TA Billing'];
  const CA_REFERRED_BY_OPTIONS = ['Donald W. Hirsh D.C.', 'Dr. Jackie Syme', 'Dr. Kurylas', 'Dr. Stephen Kurylas',
    'Joshua Schmerling', 'Nicholas Grande', 'Stephen Rothschild'];
  const CA_PROVIDER_OPTIONS = ['CTG', 'Karyn', 'Mico', 'Nicholas Grande', 'Patrick Razon', 'Rabia Rajput', 'SMART Medical', 'TA Angel', 'TA Gio Pacya'];
  const CA_PROGRAM_OPTIONS = ['None', 'Discharged'];
  const CA_LAST_ENC_OPTIONS = ['Today', 'Yesterday', 'This Week', 'Next Week', 'Next Two Week', 'Last Week', 'Last Two Week', 'This Month', 'Next Month'];
  const CA_TIME_RANGE_OPTIONS = ['15 Minutes', '30 Minutes', '45 Minutes', '1 Hour', '2 Hours', '3 Hours', '4 Hours', '5 Hours', '6 Hours'];
  const CA_VISIT_TYPE_EXTRA = ['ACE Virtual Screening', 'ACE_Neuro Only', 'Consents', 'Discharge', 'Final Exam_Neuro Only',
    'Day 2 Exam_Neuro Only', 'NP Exam- Neuro-Only', 'NP Exam_Virtual Neuro', 'Re-Exam_Neuro Only'];
  const CA_STATE_OPTIONS = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Col', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
    'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee',
    'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    'American Samoa', 'Federated State', 'Guam', 'Johnston Atoll', 'Marshall Island', 'Northern Marian', 'Palau',
    'Midway Islands', 'Puerto Rico', 'U.S. Minor Outl', 'Navassa Island', 'Virgin Islands', 'Wake Island',
    'Baker Island', 'Howland Island', 'Jarvis Island', 'Kingman Reef', 'Palmyra Atoll'];

  function caBlankFilters() {
    return {
      account: '', name: '', address: '', address2: '', mobile: '', home: '',
      facility: '', group: '', visitType: '', provider: '', referredBy: '',
      room: '', healthStatus: '', program: '', state: '', city: '',
      lastEncounterDate: '', timeOfDay: '', timeRange: '', filterName: '', defaultOnly: false
    };
  }
  let caFilters = caBlankFilters();

  function caEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function caToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function caDash(v) { return v == null || v === '' ? '<span class="enc-dash">—</span>' : caEsc(v); }
  function caPatients() { return (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : []; }
  function caFacilities() { return (typeof APPT_FACILITIES !== 'undefined') ? APPT_FACILITIES : ['Concussion Therapy Group']; }
  function caCfg() { return (typeof apptCfgLoad === 'function') ? apptCfgLoad() : (typeof apptCfg !== 'undefined' ? apptCfg : null); }
  function caVisitTypeOptions() {
    const set = [];
    const push = n => { if (n && set.indexOf(n) === -1) set.push(n); };
    if (typeof VISIT_TYPES !== 'undefined') Object.keys(VISIT_TYPES).forEach(push);
    const cfg = caCfg();
    if (cfg && Array.isArray(cfg.visitTypes)) cfg.visitTypes.forEach(v => push(v.name));
    CA_VISIT_TYPE_EXTRA.forEach(push);
    return set.sort((a, b) => a.localeCompare(b));
  }
  function caVisitLabel(v) { return (typeof apptVisitLabel === 'function') ? apptVisitLabel(v) : String(v || '').replace(/_/g, ' '); }
  function caRoomOptions() {
    const cfg = caCfg();
    if (cfg && Array.isArray(cfg.rooms) && cfg.rooms.length) {
      return cfg.rooms.map(r => r.name + (r.facility ? ' - ' + r.facility : '')).sort((a, b) => a.localeCompare(b));
    }
    return [];
  }
  function caSplitCityState(cityStateZip) {
    const s = String(cityStateZip || '').trim();
    const m = s.match(/^([^,]+),\s*([A-Za-z .]+?)\s*\d{0,5}(-\d{4})?$/);
    return m ? { city: m[1].trim(), state: m[2].trim() } : { city: '', state: '' };
  }
  function caAcctNo(p) {
    const stored = p && p.billing && p.billing.accountNo;
    if (stored) return String(stored);
    let h = 5381; const s = 'acct' + (p ? p.id : '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return String(1000 + (h % 9000));
  }

  function caRoomForPatient(p) {
    if (typeof ctgAppointments === 'undefined' || !Array.isArray(ctgAppointments)) return '';
    const list = ctgAppointments.filter(a => a.patientId === p.id && a.room);
    if (!list.length) return '';
    const todayISO = (typeof apptISODate === 'function') ? apptISODate(new Date()) : '';
    const today = list.find(a => a.date === todayISO);
    if (today) return today.room;
    const future = list.filter(a => a.date >= todayISO).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    if (future.length) return future[0].room;
    const past = list.slice().sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    return past.length ? past[0].room : '';
  }
  function caRowFromPatient(p) {
    const d = p.demographics || {};
    const cs = caSplitCityState(d.cityStateZip);
    return {
      id: p.id,
      name: (typeof fullPatientName === 'function') ? fullPatientName(p) : ((d.lastName || '') + ', ' + (d.firstName || '')),
      account: caAcctNo(p),
      facility: (p.billing && p.billing.facility) || caFacilities()[0],
      provider: d.provider || '',
      group: d.group || '',
      visitType: d.visitType || '',
      referredBy: d.referredBy || '',
      address: d.addressLine || '',
      address2: d.addressLine2 || '',
      mobile: d.mobile || '',
      home: d.homePhone || '',
      room: caRoomForPatient(p) || d.room || '',
      healthStatus: d.healthStatus || '',
      program: d.program || '',
      state: cs.state,
      city: cs.city
    };
  }
  function caAllRows() { return caPatients().map(caRowFromPatient).sort((a, b) => a.name.localeCompare(b.name)); }

  function caMatches(row) {
    const f = caFilters;
    const has = (v, needle) => String(v || '').toLowerCase().indexOf(String(needle).trim().toLowerCase()) !== -1;
    if (f.account && !has(row.account, f.account)) return false;
    if (f.name && !has(row.name, f.name)) return false;
    if (f.address && !has(row.address, f.address)) return false;
    if (f.address2 && !has(row.address2, f.address2)) return false;
    if (f.mobile && !has(row.mobile, f.mobile)) return false;
    if (f.home && !has(row.home, f.home)) return false;
    if (f.facility && row.facility !== f.facility) return false;
    if (f.provider && row.provider !== f.provider) return false;
    if (f.referredBy && row.referredBy !== f.referredBy) return false;
    if (f.room && row.room !== f.room) return false;
    if (f.healthStatus && row.healthStatus !== f.healthStatus) return false;
    if (f.program && row.program !== f.program) return false;
    if (f.state && row.state !== f.state) return false;
    if (f.city && row.city !== f.city) return false;
    return true;
  }
  function caFilteredRows() { return caAllRows().filter(caMatches); }

  // ============================ render ============================
  function renderCareAdmin() {
    const mount = document.getElementById('caMount');
    if (!mount) return;
    mount.innerHTML = caShellHTML();
    if (caTab === 'patientList') caRenderRows();
  }

  function caInput(id, ph, val, extra) {
    return '<input type="text" id="' + id + '" placeholder="' + caEsc(ph || '') + '" value="' + caEsc(val || '') + '"' + (extra || '') + '>';
  }
  function caSelect(id, options, cur, placeholder) {
    const opts = ['<option value="">' + caEsc(placeholder || 'Select') + '</option>']
      .concat(options.map(o => '<option value="' + caEsc(o) + '"' + (o === cur ? ' selected' : '') + '>' + caEsc(o) + '</option>'));
    return '<select id="' + id + '" data-onchange="caOnField(\'' + id + '\',this.value)">' + opts.join('') + '</select>';
  }
  function caField(label, control) {
    return '<div class="enc-field"><label>' + caEsc(label) + '</label>' + control + '</div>';
  }

  function caTabsHTML() {
    return '<div class="msg-tabs" id="caTabs">' + CA_TABS.map(t =>
      '<div class="msg-tab' + (t[0] === caTab ? ' active' : '') + '" data-onclick="caSwitchTab(\'' + t[0] + '\')">' + t[1] + '</div>').join('') + '</div>';
  }

  function caPatientListHTML() {
    const f = caFilters;
    const facilities = caFacilities();
    const visitTypes = caVisitTypeOptions();
    const rooms = caRoomOptions();
    const cities = Array.from(new Set(caAllRows().map(r => r.city).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const col1 = caField('Account#', caInput('caAccount', '', f.account, ' data-oninput="caOnField(\'caAccount\',this.value)"'))
      + caField('Visit Type', caSelect('caVisitType', visitTypes.map(caVisitLabel), caVisitLabel(f.visitType), 'Select All'))
      + caField('Address', caInput('caAddress', '', f.address, ' data-oninput="caOnField(\'caAddress\',this.value)"'))
      + caField('Mobile#', caInput('caMobile', '', f.mobile, ' data-oninput="caOnField(\'caMobile\',this.value)"'))
      + caField('Room', caSelect('caRoom', rooms, f.room, 'Select'))
      + caField('State', caSelect('caState', CA_STATE_OPTIONS, f.state, 'Select All'))
      + caField('Time Of Day', '<div class="enc-range"><span></span>' + caInput('caTimeOfDay', 'h:mm AM', f.timeOfDay, ' data-oninput="caOnField(\'caTimeOfDay\',this.value)"') + '</div>');

    const col2 = caField('Name', caInput('caName', '', f.name, ' data-oninput="caOnField(\'caName\',this.value)"'))
      + caField('Facility', caSelect('caFacility', facilities, f.facility, 'Select All'))
      + caField('Address2', caInput('caAddress2', '', f.address2, ' data-oninput="caOnField(\'caAddress2\',this.value)"'))
      + caField('Last Encounter Date', caSelect('caLastEncounterDate', CA_LAST_ENC_OPTIONS, f.lastEncounterDate, 'Select'))
      + caField('Health Status', caSelect('caHealthStatus', [], f.healthStatus, 'Select'))
      + caField('City', caSelect('caCity', cities, f.city, 'Select All'));

    const col3 = caField('Group', caSelect('caGroup', CA_GROUP_OPTIONS, f.group, 'Select'))
      + caField('Provider', caSelect('caProvider', CA_PROVIDER_OPTIONS, f.provider, 'Select All'))
      + caField('Referred By', caSelect('caReferredBy', CA_REFERRED_BY_OPTIONS, f.referredBy, 'Select All'))
      + caField('Home#', caInput('caHome', '', f.home, ' data-oninput="caOnField(\'caHome\',this.value)"'))
      + caField('Program', caSelect('caProgram', CA_PROGRAM_OPTIONS, f.program, 'Select'))
      + caField('Time Range', caSelect('caTimeRange', CA_TIME_RANGE_OPTIONS, f.timeRange, 'Select'));

    const total = caPatients().length;
    return '<div class="enc-topbar">'
      + '<div class="enc-topbar-title">List:</div>'
      + '<div class="enc-topbar-actions" data-cs="'+__cs+'flex:1">'
        + '<select id="caList" data-cs="'+__cs+'max-width:180px"><option>Select</option></select>'
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="caManageList()">Manage List</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caAddToList()">Add Patients To List</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caRemoveSelected()">Remove Selected</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caEncounterForSelected()">Encounter For Selected</button>'
      + '</div></div>'
      + '<div class="enc-filter-card">'
      + '<button type="button" class="enc-filter-head' + (caFilterOpen ? ' open' : '') + '" data-onclick="caToggleFilter()"><span>Click Here To Filter</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="enc-filter-body"' + (caFilterOpen ? '' : ' data-cs="'+__cs+'display:none"') + '>'
      + '<div class="enc-filter-grid"><div class="enc-col">' + col1 + '</div><div class="enc-col">' + col2 + '</div><div class="enc-col">' + col3 + '</div></div>'
      + '<div class="enc-field enc-field-inline" data-cs="'+__cs+'margin-top:6px"><label>Default</label><input type="checkbox" id="caDefault"' + (f.defaultOnly ? ' checked' : '') + ' data-onchange="caSetDefault(this.checked)"></div>'
      + '<div class="enc-filter-actions">'
        + caField('Filter Name', caInput('caFilterName', '', f.filterName, ' data-oninput="caOnField(\'caFilterName\',this.value)"'))
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="caApply()">Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caSaveFilter()">Save Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caClearFilter()">Clear Filter</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="caAssignRoom()">Assign Room/Health Status/Program</button>'
      + '</div></div></div>'
      + '<div class="enc-results-bar"><div id="caTotals" class="enc-totals"></div></div>'
      + '<div class="enc-table-wrap"><table class="enc-table" id="caTable"></table></div>';
  }

  function caEncountersHTML() {
    return '<div class="pld-empty-state" data-cs="'+__cs+'padding:40px 20px;text-align:center">'
      + '<div data-cs="'+__cs+'font-weight:700;margin-bottom:6px">Encounters</div>'
      + '<div data-cs="'+__cs+'color:var(--muted);font-size:12.5px;max-width:420px;margin:0 auto 16px">This tab mirrors the reference EHR\'s Care Administration &rarr; Encounters entry point, which opens the same Encounters grid already built in this portal.</div>'
      + '<button type="button" class="btn btn-primary btn-sm" data-onclick="showPage(\'patientEncounters\')">Open Patient Encounters &rarr;</button>'
      + '</div>';
  }
  function caInertHTML(title, desc) {
    return '<div class="pld-empty-state" data-cs="'+__cs+'padding:40px 20px;text-align:center">'
      + '<div data-cs="'+__cs+'font-weight:700;margin-bottom:6px">' + caEsc(title) + '</div>'
      + '<div data-cs="'+__cs+'color:var(--muted);font-size:12.5px;max-width:460px;margin:0 auto">' + caEsc(desc) + '</div>'
      + '</div>';
  }

  function caShellHTML() {
    let body;
    if (caTab === 'patientList') body = caPatientListHTML();
    else if (caTab === 'encounters') body = caEncountersHTML();
    else if (caTab === 'careTasks') body = caInertHTML('Care Tasks', 'Reference screen carried over from the legacy EHR — this portal has no Care Tasks workflow yet, so there\'s nothing to wire up here.');
    else body = caInertHTML('Medication Dispense', 'Reference screen carried over from the legacy EHR — this portal has no medication dispensing workflow yet, so there\'s nothing to wire up here.');
    return caTabsHTML() + '<div id="caBody">' + body + '</div>';
  }

  function caRenderRows() {
    const table = document.getElementById('caTable');
    if (!table) return;
    const rows = caFilteredRows();
    let thead = '<thead><tr><th class="enc-th-select"><input type="checkbox" data-onchange="caToggleSelectAll(this.checked)"></th>'
      + '<th>Name</th><th>Account#</th><th>Facility</th><th>Provider</th><th>Room</th><th>Health Status</th><th>Program</th><th>State</th><th>City</th><th>Mobile#</th></tr></thead>';
    let tbody = '<tbody>';
    if (!rows.length) {
      tbody += '<tr><td class="enc-empty" colspan="11">No patients match the current filter.</td></tr>';
    } else {
      rows.forEach(r => {
        tbody += '<tr>'
          + '<td><input type="checkbox"' + (caSelectedIds[r.id] ? ' checked' : '') + ' data-onchange="caSelectRow(\'' + r.id + '\',this.checked)"></td>'
          + '<td>' + caEsc(r.name) + '</td><td>' + caEsc(r.account) + '</td><td>' + caEsc(r.facility) + '</td>'
          + '<td>' + caDash(r.provider) + '</td><td>' + caDash(r.room) + '</td><td>' + caDash(r.healthStatus) + '</td>'
          + '<td>' + caDash(r.program) + '</td><td>' + caDash(r.state) + '</td><td>' + caDash(r.city) + '</td><td>' + caDash(r.mobile) + '</td>'
          + '</tr>';
      });
    }
    tbody += '</tbody>';
    table.innerHTML = thead + tbody;
    const totals = document.getElementById('caTotals');
    if (totals) totals.innerHTML = '<strong>Total Patients:</strong> ' + rows.length;
  }

  // ============================ interaction ============================
  const CA_FIELD_MAP = {
    caAccount: 'account', caName: 'name', caAddress: 'address', caAddress2: 'address2', caMobile: 'mobile',
    caHome: 'home', caFacility: 'facility', caGroup: 'group', caProvider: 'provider', caReferredBy: 'referredBy',
    caRoom: 'room', caHealthStatus: 'healthStatus', caProgram: 'program', caState: 'state', caCity: 'city',
    caLastEncounterDate: 'lastEncounterDate', caTimeOfDay: 'timeOfDay', caTimeRange: 'timeRange', caFilterName: 'filterName'
  };
  function caOnField(id, value) {
    if (id === 'caVisitType') {
      const match = caVisitTypeOptions().find(v => caVisitLabel(v) === value);
      caFilters.visitType = match || '';
      return;
    }
    const key = CA_FIELD_MAP[id];
    if (key) caFilters[key] = value;
  }
  function caSetDefault(on) { caFilters.defaultOnly = on; }

  function caSwitchTab(id) { caTab = id; renderCareAdmin(); }
  function caToggleFilter() {
    caFilterOpen = !caFilterOpen;
    const body = document.querySelector('#caMount .enc-filter-body');
    const head = document.querySelector('#caMount .enc-filter-head');
    if (body) body.style.display = caFilterOpen ? '' : 'none';
    if (head) head.classList.toggle('open', caFilterOpen);
  }
  function caApply() { caRenderRows(); caToast('Filter applied', 'ok'); }
  function caClearFilter() { caFilters = caBlankFilters(); renderCareAdmin(); }
  function caSaveFilter() {
    const name = (caFilters.filterName || '').trim();
    if (!name) { caToast('Enter a Filter Name first', 'err'); return; }
    caToast('Filter "' + name + '" saved ✓', 'ok');
  }
  function caAssignRoom() {
    const n = Object.keys(caSelectedIds).length;
    caToast(n ? 'Assign Room/Health Status/Program for ' + n + ' selected patient' + (n === 1 ? '' : 's') + '.' : 'Select one or more patients first.', n ? '' : 'err');
  }
  function caManageList() { caToast('Patient lists are managed from Patient Lists.'); }
  function caAddToList() {
    const n = Object.keys(caSelectedIds).length;
    caToast(n ? 'Added ' + n + ' patient' + (n === 1 ? '' : 's') + ' to the list.' : 'Select one or more patients first.', n ? 'ok' : 'err');
  }
  function caRemoveSelected() {
    const n = Object.keys(caSelectedIds).length;
    if (!n) { caToast('Select one or more patients first.', 'err'); return; }
    caSelectedIds = {}; caRenderRows();
    caToast('Removed selected patient' + (n === 1 ? '' : 's') + ' from the list.', 'ok');
  }
  function caEncounterForSelected() {
    const n = Object.keys(caSelectedIds).length;
    if (!n) { caToast('Select one or more patients first.', 'err'); return; }
    if (typeof showPage === 'function') showPage('patientEncounters');
  }
  function caSelectRow(id, on) { if (on) caSelectedIds[id] = true; else delete caSelectedIds[id]; }
  function caToggleSelectAll(on) {
    caSelectedIds = {};
    if (on) caFilteredRows().forEach(r => { caSelectedIds[r.id] = true; });
    caRenderRows();
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#caMount .acfg-msel')) {
      document.querySelectorAll('#caMount .acfg-msel.open').forEach(m => m.classList.remove('open'));
    }
  });

  window.renderCareAdmin = renderCareAdmin;
  window.caSwitchTab = caSwitchTab;
  window.caOnField = caOnField;
  window.caSetDefault = caSetDefault;
  window.caToggleFilter = caToggleFilter;
  window.caApply = caApply;
  window.caClearFilter = caClearFilter;
  window.caSaveFilter = caSaveFilter;
  window.caAssignRoom = caAssignRoom;
  window.caManageList = caManageList;
  window.caAddToList = caAddToList;
  window.caRemoveSelected = caRemoveSelected;
  window.caEncounterForSelected = caEncounterForSelected;
  window.caSelectRow = caSelectRow;
  window.caToggleSelectAll = caToggleSelectAll;
})();
