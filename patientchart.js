(function () {
  'use strict';

  const PCHRT_STORE_KEY = 'ctg_patient_charts_v1';

  const PCHRT_TOP_TABS = [
    ['priorNotes', 'Prior Notes'], ['diagnosis', 'Diagnosis'], ['visitTypes', 'Visit Types'], ['medications', 'Medications'], ['allergies', 'Allergies'],
    ['services', 'Services'], ['labResults', 'Lab Results'], ['vitals', 'Vitals'], ['attachments', 'Attachments'],
    ['immunizations', 'Immunizations'], ['problems', 'Problems'], ['appointments', 'Appointments'],
    ['decisionSupport', 'Decision Support Alerts'], ['wellnessTasks', 'Wellness Task Alerts'], ['careTasks', 'Care Tasks']
  ];
  const PCHRT_DX_TYPE = ['Primary', 'Secondary'];
  const PCHRT_DX_SIDE = ['N/A', 'Left', 'Right', 'Bilateral'];
  const PCHRT_DX_CONDITION = ['Acute', 'Chronic'];

  const PCHRT_SECTIONS = [
    { key: 'diagnosis', label: 'Diagnosis', cols: ['Code', 'Description'] },
    { key: 'allergies', label: 'Allergies', cols: ['Allergen', 'Reaction'] },
    { key: 'currentMedications', label: 'Current Medications', cols: ['Medication', 'Dosage'] },
    { key: 'prescriptions', label: 'Prescriptions', cols: ['Medication', 'Sig'] },
    { key: 'administeredMedications', label: 'Administered Medications', cols: ['Medication', 'Dose / Date'] },
    { key: 'supplements', label: 'Supplements', cols: ['Supplement', 'Dosage'] },
    { key: 'services', label: 'Services', cols: ['Service', 'Detail'] },
    { key: 'orders', label: 'Orders', cols: ['Order', 'Status'] },
    { key: 'immunizations', label: 'Immunizations', cols: ['Vaccine', 'Date'] }
  ];

  const PCHRT_TEMPLATES = {
    'Planset': '',
    'SOAP Note': '<p><strong>Subjective:</strong></p><p><br></p><p><strong>Objective:</strong></p><p><br></p><p><strong>Assessment:</strong></p><p><br></p><p><strong>Plan:</strong></p><p><br></p>',
    'Progress Note': '<p><strong>Interval History:</strong></p><p><br></p><p><strong>Exam:</strong></p><p><br></p><p><strong>Assessment &amp; Plan:</strong></p><p><br></p>',
    'Follow-up Visit': '<p><strong>Reason for Visit:</strong></p><p><br></p><p><strong>Findings:</strong></p><p><br></p><p><strong>Recommendations:</strong></p><p><br></p>'
  };
  const PCHRT_MACROS = {
    'Normal neuro exam': 'Cranial nerves II–XII grossly intact. Motor strength 5/5 in all extremities. Sensation intact to light touch. DTRs 2+ and symmetric. Gait normal.',
    'Concussion follow-up': 'Patient reports gradual improvement in post-concussive symptoms. Continues vestibular and oculomotor rehab. Tolerating cognitive activity with mild residual symptoms.',
    'Return to activity': 'Patient cleared to progress to the next stage of the graded return-to-activity protocol. Will advance if symptom-free at the current level.'
  };

  let pchrtData = null;
  let pchrtPatientId = '';
  let pchrtOpenSection = 'diagnosis';
  let pchrtTopTab = 'priorNotes';
  let pchrtActiveNoteId = null;     // note being edited, or null when composing new
  let pchrtEditorMode = 'design';   // 'design' | 'html' | 'preview'
  let pchrtEditorHtml = '';
  let pchrtNoteModalOpen = false;

  function pchrtEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pchrtToast(t, k) { if (typeof window.showToast === 'function') window.showToast(t, k || ''); }
  function pchrtId(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* The local copy belongs to the account that wrote it (CTG-SEC-071). Read
     under anyone else - or with no owner on record - it was shown to them,
     and its charts the server lacked were pushed up under their session. */
  const PCHRT_OWNER_KEY = 'ctg_patient_charts_owner';
  function pchrtMe() {
    const u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null;
    return (u && u.id) || '';
  }
  function pchrtWriteCache() {
    const me = pchrtMe();
    if (!me) return;
    try { localStorage.setItem(PCHRT_STORE_KEY, JSON.stringify(pchrtData)); localStorage.setItem(PCHRT_OWNER_KEY, me); } catch (e) {}
  }
  function pchrtLoad() {
    if (pchrtData) return pchrtData;
    let owner = '';
    try { owner = localStorage.getItem(PCHRT_OWNER_KEY) || ''; } catch (e) {}
    if (!owner || owner !== pchrtMe()) { pchrtData = {}; return pchrtData; }
    try { pchrtData = JSON.parse(localStorage.getItem(PCHRT_STORE_KEY) || '{}') || {}; }
    catch (e) { pchrtData = {}; }
    if (!pchrtData || typeof pchrtData !== 'object') pchrtData = {};
    return pchrtData;
  }
  /* Charts are clinical records, so they belong on the server. Saved one
     patient at a time: the module holds every chart in one map, and writing
     the whole map back would rewrite every other patient's chart on every
     keystroke - which is the overwrite problem this migration exists to fix. */
  function pchrtSave(pid) {
    pchrtWriteCache();
    const id = pid || pchrtPatientId;
    if (!id || !pchrtData || !pchrtData[id]) return;
    if (typeof window.ctgApiFetch !== 'function') return;
    window.ctgApiFetch('/api/shared/charts/' + encodeURIComponent(id), {
      method: 'PUT', body: JSON.stringify({ chart: pchrtData[id] })
    }).catch(function () {
      pchrtToast('Saved on this device, but not to the server yet.', 'err');
    });
  }

  /* Load every chart from the server once. The local copy stays as an offline
     cache; the server wins whenever it answers. */
  let pchrtRemoteLoaded = false;
  function pchrtLoadRemote(rerender) {
    if (typeof window.ctgApiFetch !== 'function') return Promise.resolve();
    return window.ctgApiFetch('/api/shared/charts').then(function (r) {
      const remote = (r && r.charts) || {};
      pchrtLoad();
      // Server charts win; a local-only chart for a patient the server has
      // never seen is kept and pushed up, so nothing written before this
      // migration is lost.
      Object.keys(remote).forEach(function (pid) { pchrtData[pid] = remote[pid]; });
      /* Push up only charts that actually contain something. Merely opening
         the page creates a blank chart for the selected patient, and syncing
         those would litter the database with empty rows. */
      const hasContent = function (c) {
        if (!c) return false;
        if ((c.notes || []).length || (c.diagnoses || []).length) return true;
        return Object.keys(c.sections || {}).some(function (k) { return (c.sections[k] || []).length; });
      };
      Object.keys(pchrtData)
        .filter(function (pid) { return !remote[pid] && hasContent(pchrtData[pid]); })
        .forEach(function (pid) { pchrtSave(pid); });
      pchrtRemoteLoaded = true;
      pchrtWriteCache();
      if (rerender && typeof window.renderPatientChart === 'function') window.renderPatientChart();
    }).catch(function () { /* offline - the cached copy stands */ });
  }
  window.ctgPatientChartRealtime = function () { pchrtLoadRemote(true); };

  function pchrtChart(pid) {
    pchrtLoad();
    if (!pid) return null;
    if (!pchrtData[pid]) {
      const sections = {};
      PCHRT_SECTIONS.forEach(s => { sections[s.key] = []; });
      pchrtData[pid] = { sections: sections, notes: [], diagnoses: [] };
    }
    // Backfill any newly added section keys.
    PCHRT_SECTIONS.forEach(s => { if (!Array.isArray(pchrtData[pid].sections[s.key])) pchrtData[pid].sections[s.key] = []; });
    if (!Array.isArray(pchrtData[pid].notes)) pchrtData[pid].notes = [];
    if (!Array.isArray(pchrtData[pid].diagnoses)) pchrtData[pid].diagnoses = [];
    return pchrtData[pid];
  }

  function pchrtPatients() {
    const list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : [];
    return list.slice().sort((a, b) => {
      const an = (typeof fullPatientName === 'function') ? fullPatientName(a) : '';
      const bn = (typeof fullPatientName === 'function') ? fullPatientName(b) : '';
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
  }
  function pchrtPatientName(pid) {
    const p = (typeof getPatient === 'function') ? getPatient(pid) : null;
    if (!p) return 'No patient selected';
    return (typeof fullPatientName === 'function') ? fullPatientName(p) : 'Patient';
  }

  // ============================ render ============================
  function renderPatientChart() {
    if (!pchrtRemoteLoaded) { pchrtRemoteLoaded = true; pchrtLoadRemote(true); }
    const mount = document.getElementById('patientChartMount');
    if (!mount) return;
    pchrtLoad();
    const patients = pchrtPatients();
    if (pchrtPatientId && !patients.some(p => p.id === pchrtPatientId)) pchrtPatientId = '';
    if (!pchrtPatientId && patients.length) pchrtPatientId = patients[0].id;
    // HIPAA access log: the chart about to be drawn is a patient being viewed (see ctgAuditChartView in app.js).
    if (pchrtPatientId && typeof window.ctgAuditChartView === 'function' && mount.closest('.page.active')) window.ctgAuditChartView(pchrtPatientId, 'patientChart');

    const patientOpts = ['<option value="">— Select a patient —</option>']
      .concat(patients.map(p => '<option value="' + pchrtEsc(p.id) + '"' + (p.id === pchrtPatientId ? ' selected' : '') + '>' + pchrtEsc((typeof fullPatientName === 'function') ? fullPatientName(p) : 'Patient') + '</option>')).join('');

    mount.innerHTML = '<div class="pchrt-topbar">'
      + '<div class="pchrt-topbar-title">Patient Chart</div>'
      + '<div class="pchrt-patient-pick"><label>Patient</label><select data-onchange="pchrtSelectPatient(this.value)">' + patientOpts + '</select></div>'
      + '</div>';

    if (!pchrtPatientId) {
      mount.insertAdjacentHTML('beforeend', '<div class="pchrt-noselect"><strong>No patient selected.</strong><span>Choose a patient above to open their chart, or add one in Patient Registration.</span></div>');
      return;
    }

    mount.insertAdjacentHTML('beforeend', '<div class="msg-tabs" data-cs="'+__cs+'margin-bottom:16px">' + PCHRT_TOP_TABS.map(t =>
      '<div class="msg-tab' + (t[0] === pchrtTopTab ? ' active' : '') + '" data-onclick="pchrtSwitchTopTab(\'' + t[0] + '\')">' + pchrtEsc(t[1]) + '</div>').join('') + '</div>');

    if (pchrtTopTab === 'priorNotes') {
      mount.insertAdjacentHTML('beforeend', '<div class="pchrt-grid pchrt-grid-2col">'
        + '<aside class="pchrt-details">' + pchrtDetailsHTML() + '</aside>'
        + '<section class="pchrt-notes">' + pchrtNotesListHTML() + '</section>'
        + '</div>'
        + '<div class="modal-overlay" id="pchrtNoteModal">'
          + '<div class="modal" data-cs="'+__cs+'width:min(720px,96%)">'
            + '<div class="modal-hd"><div><div class="modal-title" id="pchrtNoteModalTitle">New Note</div><div class="modal-sub">' + pchrtEsc(pchrtPatientName(pchrtPatientId)) + '</div></div><button class="modal-close" data-onclick="pchrtCloseNoteModal()" aria-label="Close">×</button></div>'
            + '<div class="modal-body" data-cs="'+__cs+'padding:0"><div class="pchrt-editor">' + pchrtEditorHTML() + '</div></div>'
          + '</div>'
        + '</div>');
      pchrtSyncEditorFromState();
      if (pchrtNoteModalOpen) document.getElementById('pchrtNoteModal').classList.add('show');
    } else if (pchrtTopTab === 'diagnosis') {
      mount.insertAdjacentHTML('beforeend', pchrtDiagnosisHTML());
    } else if (pchrtTopTab === 'visitTypes') {
      mount.insertAdjacentHTML('beforeend', pchrtVisitTypesHTML());
    } else {
      mount.insertAdjacentHTML('beforeend', '<div class="pld-empty-state" data-cs="'+__cs+'padding:40px 20px;text-align:center">No records to display.</div>');
    }
  }
  function pchrtSwitchTopTab(id) { pchrtTopTab = id; renderPatientChart(); }

  function pchrtSelectPatient(id) {
    pchrtPatientId = id;
    pchrtActiveNoteId = null;
    pchrtEditorHtml = '';
    pchrtEditorMode = 'design';
    pchrtNoteModalOpen = false;
    renderPatientChart();
  }

  // ---- left: clinical details accordion ----
  function pchrtDetailsHTML() {
    const chart = pchrtChart(pchrtPatientId);
    let html = '<div class="pchrt-details-head">Patient Details <span>(Click to Expand)</span></div>';
    PCHRT_SECTIONS.forEach(s => {
      const rows = chart.sections[s.key] || [];
      const open = pchrtOpenSection === s.key;
      html += '<div class="pchrt-acc' + (open ? ' open' : '') + '">'
        + '<button type="button" class="pchrt-acc-head" data-onclick="pchrtToggleSection(\'' + s.key + '\')"><span>' + pchrtEsc(s.label) + '</span>'
        + '<span class="pchrt-acc-count">' + (rows.length ? rows.length : '') + '</span>'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>';
      if (open) {
        html += '<div class="pchrt-acc-body">';
        if (!rows.length) html += '<div class="pchrt-acc-empty">No ' + pchrtEsc(s.label.toLowerCase()) + ' recorded.</div>';
        else {
          html += '<ul class="pchrt-acc-list">' + rows.map(r =>
            '<li><span class="pchrt-acc-primary">' + pchrtEsc(r.a || '') + '</span>' + (r.b ? '<span class="pchrt-acc-secondary">' + pchrtEsc(r.b) + '</span>' : '')
            + '<button type="button" class="pchrt-acc-del" title="Remove" data-onclick="pchrtRemoveEntry(\'' + s.key + '\',\'' + r.id + '\')">×</button></li>').join('') + '</ul>';
        }
        html += '<div class="pchrt-acc-add">'
          + '<input type="text" id="pchrtAddA_' + s.key + '" placeholder="' + pchrtEsc(s.cols[0]) + '">'
          + '<input type="text" id="pchrtAddB_' + s.key + '" placeholder="' + pchrtEsc(s.cols[1]) + '">'
          + '<button type="button" class="btn btn-primary btn-sm" data-onclick="pchrtAddEntry(\'' + s.key + '\')">Add</button>'
          + '</div></div>';
      }
      html += '</div>';
    });
    return html;
  }
  function pchrtToggleSection(key) { pchrtOpenSection = (pchrtOpenSection === key ? '' : key); renderPatientChart(); }
  function pchrtAddEntry(key) {
    const a = (document.getElementById('pchrtAddA_' + key) || {}).value || '';
    const b = (document.getElementById('pchrtAddB_' + key) || {}).value || '';
    if (!a.trim() && !b.trim()) { pchrtToast('Enter a value first', 'err'); return; }
    const chart = pchrtChart(pchrtPatientId);
    chart.sections[key].push({ id: pchrtId('e'), a: a.trim(), b: b.trim(), at: new Date().toISOString() });
    pchrtSave();
    renderPatientChart();
  }
  function pchrtRemoveEntry(key, id) {
    const chart = pchrtChart(pchrtPatientId);
    chart.sections[key] = chart.sections[key].filter(r => r.id !== id);
    pchrtSave();
    renderPatientChart();
  }

  function pchrtIcdList() { return (typeof ICD_CODES !== 'undefined' && Array.isArray(ICD_CODES)) ? ICD_CODES : []; }
  function pchrtIcdDesc(code) {
    const hit = pchrtIcdList().find(row => row[0] === code);
    return hit ? hit[1] : '';
  }
  function pchrtAcePatient() { return (typeof getPatient === 'function') ? getPatient(pchrtPatientId) : null; }
  function pchrtAceDiagnosisRows() {
    const p = pchrtAcePatient();
    const codes = (p && p.ace && Array.isArray(p.ace.diagnosisCodes)) ? p.ace.diagnosisCodes : [];
    const date = (p && p.ace && (p.ace.dateOfService || p.ace.savedAt)) || '';
    return codes.map(code => ({
      source: 'ace', id: 'ace_' + code, encounterDate: date, icd: code, name: pchrtIcdDesc(code) || code,
      snomed: '', type: 'Primary', side: 'N/A', condition: ''
    }));
  }
  function pchrtDiagnosisHTML() {
    const chart = pchrtChart(pchrtPatientId);
    const aceRows = pchrtAceDiagnosisRows();
    const manualRows = chart.diagnoses.slice().sort((a, b) => String(b.encounterDate || '').localeCompare(String(a.encounterDate || '')));
    const rows = aceRows.concat(manualRows);
    const opt = (list) => list.map(o => '<option value="' + pchrtEsc(o) + '">' + pchrtEsc(o) + '</option>').join('');

    let html = '';
    if (aceRows.length) {
      html += '<div class="pchrt-dx-sync"><span>Synced from this patient\'s Day 1 diagnosis list (' + aceRows.length + ' ICD-10 code' + (aceRows.length === 1 ? '' : 's') + ').</span>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="pchrtOpenAce()">View in Day 1</button></div>';
    }

    html += '<div class="pchrt-dx-add">'
      + '<input type="date" id="pchrtDxDate" title="Encounter Date">'
      + '<div class="ar-combo pchrt-dx-icd-combo" id="pchrtDxIcdCombo">'
        + '<input type="text" class="ar-combo-input" id="pchrtDxIcd" placeholder="ICD Code" autocomplete="off" data-oninput="pchrtDxIcdInput(this.value)" data-onfocus="pchrtDxIcdInput(this.value)">'
        + '<div class="ar-combo-panel" id="pchrtDxIcdPanel"></div>'
      + '</div>'
      + '<input type="text" id="pchrtDxName" placeholder="Diagnosis">'
      + '<input type="text" id="pchrtDxSnomed" placeholder="SNOMEDCode">'
      + '<select id="pchrtDxType">' + opt(PCHRT_DX_TYPE) + '</select>'
      + '<select id="pchrtDxSide">' + opt(PCHRT_DX_SIDE) + '</select>'
      + '<select id="pchrtDxCondition">' + opt(PCHRT_DX_CONDITION) + '</select>'
      + '<button type="button" class="btn btn-primary btn-sm" data-onclick="pchrtAddDiagnosis()">Add</button>'
      + '</div>';

    html += '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr>'
      + '<th>Encounter Date</th><th>ICD Code</th><th>Diagnosis</th><th>SNOMEDCode</th><th>Type</th><th>Side</th><th>Condition</th><th></th>'
      + '</tr></thead><tbody>';
    if (!rows.length) {
      html += '</tbody></table></div><div class="pld-empty-state">No records to display.</div>';
      return html;
    }
    rows.forEach(r => {
      html += '<tr><td>' + pchrtEsc(r.encounterDate) + '</td><td>' + pchrtEsc(r.icd) + '</td><td>' + pchrtEsc(r.name) + '</td>'
        + '<td>' + pchrtEsc(r.snomed) + '</td><td>' + pchrtEsc(r.type) + '</td><td>' + pchrtEsc(r.side) + '</td><td>' + pchrtEsc(r.condition) + '</td>'
        + '<td>' + (r.source === 'ace' ? '<span class="pchrt-dx-ace-badge" title="From this patient\'s Day 1 record">Day 1</span>' : '<button type="button" class="pchrt-acc-del" title="Remove" data-onclick="pchrtRemoveDiagnosis(\'' + r.id + '\')">×</button>') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // ---- Visit Types tab (real appointment history: date + visit type + status) ----
  function pchrtFmtApptDate(iso) {
    const d = new Date(String(iso || '') + 'T00:00:00');
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  }
  function pchrtExamRecordDate(exam) { return exam && (exam.examinationDate || exam.sessionDate || String(exam.savedAt || '').slice(0, 10)); }
  function pchrtVisitIsDone(p, a) {
    if (!p) return false;
    const v = String(a.visitType || '').toLowerCase();
    const onDate = d => d && d === a.date;
    if (v.indexOf('ace') !== -1 && p.ace && p.ace.savedAt && onDate(p.ace.dateOfService || String(p.ace.savedAt).slice(0, 10))) return true;
    if (v.indexOf('initial') !== -1 && p.initialExam && p.initialExam.savedAt && onDate(pchrtExamRecordDate(p.initialExam))) return true;
    if (v.indexOf('re-exam') !== -1 || v.indexOf('re exam') !== -1) {
      if (Array.isArray(p.reExams) && p.reExams.some(ex => ex && ex.savedAt && onDate(pchrtExamRecordDate(ex)))) return true;
    }
    if (v.indexOf('final') !== -1 && p.finalExam && p.finalExam.savedAt && onDate(pchrtExamRecordDate(p.finalExam))) return true;
    return false;
  }
  function pchrtVisitTypesHTML() {
    const p = (typeof getPatient === 'function') ? getPatient(pchrtPatientId) : null;
    const appts = (typeof ctgAppointments !== 'undefined' && Array.isArray(ctgAppointments)) ? ctgAppointments.filter(a => a.patientId === pchrtPatientId) : [];
    const rows = appts.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.start || '').localeCompare(String(a.start || '')));
    if (!rows.length) return '<div class="pld-empty-state" data-cs="'+__cs+'padding:40px 20px;text-align:center">No records to display.</div>';
    const label = v => (typeof apptVisitLabel === 'function') ? apptVisitLabel(v) : String(v || '').replace(/_/g, ' ');
    let html = '<div class="acfg-table-wrap"><table class="acfg-table"><thead><tr><th>Date</th><th>Visit Type</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(a => {
      const status = pchrtVisitIsDone(p, a) ? 'Done' : (a.status || '—');
      html += '<tr><td>' + pchrtEsc(pchrtFmtApptDate(a.date)) + '</td><td>' + pchrtEsc(label(a.visitType || '')) + '</td><td>' + pchrtEsc(status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
  function pchrtDxIcdOptionsHTML(query) {
    const q = (query || '').trim().toLowerCase();
    const list = pchrtIcdList().filter(([code, desc]) => !q || code.toLowerCase().indexOf(q) !== -1 || desc.toLowerCase().indexOf(q) !== -1);
    const shown = list.slice(0, 30);
    if (!shown.length) return '<div class="ar-combo-empty">No matching ICD codes</div>';
    let h = shown.map(([code, desc]) =>
      '<div class="ar-combo-option" data-onmousedown="event.preventDefault();pchrtDxIcdSelect(\'' + pchrtEsc(code) + '\')"><span class="ar-combo-code">' + pchrtEsc(code) + '</span><span class="ar-combo-text">' + pchrtEsc(desc) + '</span></div>').join('');
    if (list.length > shown.length) h += '<div class="ar-combo-empty">+' + (list.length - shown.length) + ' more — keep typing to narrow down</div>';
    return h;
  }
  function pchrtDxIcdInput(value) {
    const panel = document.getElementById('pchrtDxIcdPanel');
    if (!panel) return;
    panel.innerHTML = pchrtDxIcdOptionsHTML(value);
    panel.classList.add('show');
  }
  function pchrtDxIcdSelect(code) {
    const icdInput = document.getElementById('pchrtDxIcd');
    const nameInput = document.getElementById('pchrtDxName');
    if (icdInput) icdInput.value = code;
    if (nameInput && !nameInput.value.trim()) nameInput.value = pchrtIcdDesc(code);
    const panel = document.getElementById('pchrtDxIcdPanel');
    if (panel) panel.classList.remove('show');
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#pchrtDxIcdCombo')) {
      const panel = document.getElementById('pchrtDxIcdPanel');
      if (panel) panel.classList.remove('show');
    }
  });
  function pchrtOpenAce() {
    if (!pchrtPatientId) return;
    window.selectedPatientId = pchrtPatientId;
    if (typeof showPage === 'function') showPage('patientLists');
    if (typeof setPatientDetailTab === 'function') setPatientDetailTab('ace');
  }
  function pchrtAddDiagnosis() {
    const v = id => (document.getElementById(id) || {}).value || '';
    const encounterDate = v('pchrtDxDate'), icd = v('pchrtDxIcd').trim(), name = v('pchrtDxName').trim();
    if (!icd && !name) { pchrtToast('Enter an ICD Code or Diagnosis first', 'err'); return; }
    const chart = pchrtChart(pchrtPatientId);
    chart.diagnoses.push({
      id: pchrtId('dx'), encounterDate: encounterDate, icd: icd, name: name,
      snomed: v('pchrtDxSnomed').trim(), type: v('pchrtDxType'), side: v('pchrtDxSide'), condition: v('pchrtDxCondition')
    });
    pchrtSave();
    renderPatientChart();
    pchrtToast('Diagnosis added ✓', 'ok');
  }
  function pchrtRemoveDiagnosis(id) {
    const chart = pchrtChart(pchrtPatientId);
    chart.diagnoses = chart.diagnoses.filter(r => r.id !== id);
    pchrtSave();
    renderPatientChart();
  }

  // ---- middle: notes list ----
  function pchrtNotesListHTML() {
    const chart = pchrtChart(pchrtPatientId);
    const notes = chart.notes.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    let html = '<div class="pchrt-notes-head"><span>Notes</span><button type="button" class="btn btn-primary btn-sm" data-onclick="pchrtNewNote()">New Note</button></div>';
    if (!notes.length) { html += '<div class="pchrt-notes-empty">There are no notes.</div>'; return html; }
    html += '<div class="pchrt-notes-list">' + notes.map(n =>
      '<button type="button" class="pchrt-note-row' + (n.id === pchrtActiveNoteId ? ' active' : '') + '" data-onclick="pchrtOpenNote(\'' + n.id + '\')">'
      + '<span class="pchrt-note-title">' + pchrtEsc(n.title || 'Untitled note') + (n.signed ? '<span class="pchrt-note-signed">Signed</span>' : '') + '</span>'
      + '<span class="pchrt-note-date">' + pchrtEsc(pchrtStamp(n.updatedAt || n.createdAt)) + '</span></button>').join('') + '</div>';
    return html;
  }
  function pchrtStamp(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' ' + h + ':' + m + ap;
  }

  function pchrtNewNote() {
    pchrtActiveNoteId = null;
    pchrtEditorHtml = '';
    pchrtEditorMode = 'design';
    pchrtNoteModalOpen = true;
    renderPatientChart();
    const title = document.getElementById('pchrtNoteModalTitle'); if (title) title.textContent = 'New Note';
    setTimeout(() => { const t = document.getElementById('pchrtNoteTitle'); if (t) t.focus(); }, 0);
  }
  function pchrtOpenNote(id) {
    const chart = pchrtChart(pchrtPatientId);
    const n = chart.notes.find(x => x.id === id);
    if (!n) return;
    pchrtActiveNoteId = id;
    pchrtEditorHtml = n.html || '';
    pchrtEditorMode = 'design';
    pchrtNoteModalOpen = true;
    renderPatientChart();
    const title = document.getElementById('pchrtNoteModalTitle'); if (title) title.textContent = n.title || 'Edit Note';
  }
  function pchrtCloseNoteModal() {
    pchrtNoteModalOpen = false;
    const modal = document.getElementById('pchrtNoteModal');
    if (modal) modal.classList.remove('show');
  }

  // ---- right: note editor ----
  function pchrtEditorHTML() {
    const chart = pchrtChart(pchrtPatientId);
    const active = pchrtActiveNoteId ? chart.notes.find(n => n.id === pchrtActiveNoteId) : null;
    const templateOpts = Object.keys(PCHRT_TEMPLATES).map(t => '<option value="' + pchrtEsc(t) + '"' + (active && active.template === t ? ' selected' : '') + '>' + pchrtEsc(t) + '</option>').join('');
    const macroOpts = ['<option value="">Macro</option>'].concat(Object.keys(PCHRT_MACROS).map(m => '<option value="' + pchrtEsc(m) + '">' + pchrtEsc(m) + '</option>')).join('');
    const signed = active && active.signed;

    return '<div class="pchrt-editor-toolbar">'
      + '<div class="pchrt-editor-toolbar-left">'
        + '<label class="pchrt-select-group"><span>Template</span><select id="pchrtTemplate" data-onchange="pchrtApplyTemplate(this.value)">' + templateOpts + '</select></label>'
        + '<label class="pchrt-select-group"><span>Macro</span><select class="pchrt-macro" data-onchange="pchrtInsertMacroFrom(this)">' + macroOpts + '</select></label>'
      + '</div>'
      + '<div class="pchrt-editor-toolbar-right">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="pchrtPrint()">Print</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="pchrtPull()">Pull Options</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="pchrtSend()">Send</button>'
        + '<span class="pchrt-toolbar-div"></span>'
        + (signed ? '<span class="pchrt-signed-chip">Signed</span>' : '<button type="button" class="btn btn-ghost btn-sm" data-onclick="pchrtSign()">Sign</button>')
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="pchrtSaveNote()">Save</button>'
      + '</div>'
      + '</div>'
      + '<div class="pchrt-note-titlebar"><input type="text" id="pchrtNoteTitle" placeholder="Note title" value="' + pchrtEsc(active ? (active.title || '') : '') + '"></div>'
      + '<div class="pchrt-format-bar">'
        + '<div class="pchrt-fbar-group">'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'undo\')" title="Undo">↶</button>'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'redo\')" title="Redo">↷</button>'
        + '</div>'
        + '<span class="pchrt-fbar-div"></span>'
        + '<div class="pchrt-fbar-group">'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'bold\')" title="Bold"><b>B</b></button>'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'italic\')" title="Italic"><i>I</i></button>'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'underline\')" title="Underline"><u>U</u></button>'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'insertUnorderedList\')" title="Bulleted list">•</button>'
          + '<button type="button" data-onmousedown="event.preventDefault()" data-onclick="pchrtExec(\'insertOrderedList\')" title="Numbered list">1.</button>'
        + '</div>'
        + '<span class="pchrt-fbar-div"></span>'
        + '<select class="pchrt-fbar-select" data-onchange="pchrtExecVal(\'fontName\',this.value)" title="Font"><option value="Tahoma">Tahoma</option><option value="Inter">Inter</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option></select>'
        + '<select class="pchrt-fbar-select" data-onchange="pchrtExecVal(\'fontSize\',this.value)" title="Size"><option value="2">Small</option><option value="3" selected>Normal</option><option value="4">Large</option><option value="5">X-Large</option></select>'
      + '</div>'
      + '<div class="pchrt-editor-surface">'
        + '<div class="pchrt-editor-area" id="pchrtEditorArea" contenteditable="true" data-oninput="pchrtEditorInput()"></div>'
        + '<textarea class="pchrt-editor-html" id="pchrtEditorHtmlArea" data-oninput="pchrtEditorHtmlInput()" data-cs="'+__cs+'display:none"></textarea>'
        + '<div class="pchrt-editor-preview" id="pchrtEditorPreview" data-cs="'+__cs+'display:none"></div>'
      + '</div>'
      + '<div class="pchrt-editor-tabs">'
        + '<button type="button" class="pchrt-etab' + (pchrtEditorMode === 'design' ? ' active' : '') + '" data-onclick="pchrtSetMode(\'design\')">Design</button>'
        + '<button type="button" class="pchrt-etab' + (pchrtEditorMode === 'html' ? ' active' : '') + '" data-onclick="pchrtSetMode(\'html\')">HTML</button>'
        + '<button type="button" class="pchrt-etab' + (pchrtEditorMode === 'preview' ? ' active' : '') + '" data-onclick="pchrtSetMode(\'preview\')">Preview</button>'
      + '</div>';
  }

  // Push the current pchrtEditorHtml into whichever surface is visible.
  function pchrtSyncEditorFromState() {
    const area = document.getElementById('pchrtEditorArea');
    const html = document.getElementById('pchrtEditorHtmlArea');
    const prev = document.getElementById('pchrtEditorPreview');
    if (area) area.innerHTML = pchrtEditorHtml;
    if (html) html.value = pchrtEditorHtml;
    if (prev) prev.innerHTML = pchrtEditorHtml || '<em class="pchrt-dim">Nothing to preview yet.</em>';
    if (area) area.style.display = pchrtEditorMode === 'design' ? '' : 'none';
    if (html) html.style.display = pchrtEditorMode === 'html' ? '' : 'none';
    if (prev) prev.style.display = pchrtEditorMode === 'preview' ? '' : 'none';
  }
  function pchrtEditorInput() { const a = document.getElementById('pchrtEditorArea'); if (a) pchrtEditorHtml = a.innerHTML; }
  function pchrtEditorHtmlInput() { const t = document.getElementById('pchrtEditorHtmlArea'); if (t) pchrtEditorHtml = t.value; }
  function pchrtSetMode(mode) {
    // Capture edits from the surface we're leaving before switching.
    if (pchrtEditorMode === 'design') pchrtEditorInput();
    else if (pchrtEditorMode === 'html') pchrtEditorHtmlInput();
    pchrtEditorMode = mode;
    pchrtSyncEditorFromState();
    document.querySelectorAll('#patientChartMount .pchrt-etab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === mode));
  }
  function pchrtExec(cmd) { document.getElementById('pchrtEditorArea')?.focus(); try { document.execCommand(cmd, false, null); } catch (e) {} pchrtEditorInput(); }
  function pchrtExecVal(cmd, val) { document.getElementById('pchrtEditorArea')?.focus(); try { document.execCommand(cmd, false, val); } catch (e) {} pchrtEditorInput(); }

  async function pchrtApplyTemplate(name) {
    const tpl = PCHRT_TEMPLATES[name] || '';
    if (!tpl) return;
    const cur = (pchrtEditorHtml || '').replace(/<[^>]+>/g, '').trim();
    if (cur) {
      const ok = await ctgConfirm('Replace the current note body with the “' + name + '” template? '
        + 'Anything already written here will be lost.',
        { title: 'Apply Template', okLabel: 'Replace', danger: true });
      if (!ok) return;
    }
    pchrtEditorHtml = tpl;
    if (pchrtEditorMode !== 'design') pchrtEditorMode = 'design';
    pchrtSyncEditorFromState();
  }
  function pchrtInsertMacro(name) {
    const text = PCHRT_MACROS[name];
    if (!text) return;
    if (pchrtEditorMode !== 'design') { pchrtEditorMode = 'design'; pchrtSyncEditorFromState(); }
    const area = document.getElementById('pchrtEditorArea');
    if (area) { area.focus(); try { document.execCommand('insertHTML', false, '<p>' + pchrtEsc(text) + '</p>'); } catch (e) { area.insertAdjacentHTML('beforeend', '<p>' + pchrtEsc(text) + '</p>'); } pchrtEditorInput(); }
  }

  function pchrtSaveNote(keepOpen) {
    if (pchrtEditorMode === 'design') pchrtEditorInput(); else if (pchrtEditorMode === 'html') pchrtEditorHtmlInput();
    const title = (document.getElementById('pchrtNoteTitle') || {}).value || '';
    const bodyText = (pchrtEditorHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!title.trim() && !bodyText) { pchrtToast('Add a title or some content first', 'err'); return null; }
    const chart = pchrtChart(pchrtPatientId);
    const tmplSel = document.getElementById('pchrtTemplate');
    const now = new Date().toISOString();
    let note;
    if (pchrtActiveNoteId) {
      note = chart.notes.find(n => n.id === pchrtActiveNoteId);
      if (note) {
        if (note.signed) { pchrtToast('This note is signed and can\'t be edited.', 'err'); return note; }
        note.title = title.trim() || 'Untitled note';
        note.html = pchrtEditorHtml;
        note.template = tmplSel ? tmplSel.value : note.template;
        note.updatedAt = now;
      }
    } else {
      note = { id: pchrtId('note'), title: title.trim() || 'Untitled note', html: pchrtEditorHtml, template: tmplSel ? tmplSel.value : 'Planset', signed: false, createdAt: now, updatedAt: now };
      chart.notes.push(note);
      pchrtActiveNoteId = note.id;
    }
    pchrtSave();
    if (!keepOpen) { pchrtNoteModalOpen = false; renderPatientChart(); }
    pchrtToast('Note saved ✓', 'ok');
    return note;
  }
  function pchrtSign() {
    const note = pchrtSaveNote(true);
    if (!note) return;
    if (note.signed) return;
    const who = (typeof window.ctgCurrentUser === 'function' && window.ctgCurrentUser() && (window.ctgCurrentUser().displayName || window.ctgCurrentUser().username)) || 'Staff';
    note.signed = true; note.signedBy = who; note.signedAt = new Date().toISOString();
    pchrtSave();
    pchrtNoteModalOpen = false;
    renderPatientChart();
    pchrtToast('Note signed by ' + who + ' ✓', 'ok');
  }
  function pchrtPrint() {
    if (pchrtEditorMode === 'design') pchrtEditorInput();
    const title = (document.getElementById('pchrtNoteTitle') || {}).value || 'Clinical Note';
    const win = window.open('', '_blank');
    if (!win) { pchrtToast('Allow pop-ups to print.', 'err'); return; }
    win.document.write('<html><head><title>' + pchrtEsc(title) + '</title></head><body data-cs="'+__cs+'font-family:Inter,Arial,sans-serif;margin:40px;color:#111"><h1 data-cs="'+__cs+'font-size:18px">' + pchrtEsc(title) + '</h1><p><strong>Patient:</strong> ' + pchrtEsc(pchrtPatientName(pchrtPatientId)) + '</p><hr>' + (pchrtEditorHtml || '<em>No content.</em>') + '</body></html>');
    win.document.close();
    if (typeof ctgApplyCs === 'function') ctgApplyCs(win.document); // print window: same policy, no csp-styles.js
    win.focus(); win.print();
    if (typeof ctgAuditExport === 'function') ctgAuditExport(pchrtPatientId, 'chart_note', 'print');
  }
  function pchrtSend() { pchrtToast('Sending notes to external recipients isn\'t connected in this portal yet.'); }
  function pchrtPull() { pchrtToast('Pull Options bring in prior-note content — not connected in this portal yet.'); }

  window.renderPatientChart = renderPatientChart;
  window.pchrtSwitchTopTab = pchrtSwitchTopTab;
  window.pchrtAddDiagnosis = pchrtAddDiagnosis;
  window.pchrtRemoveDiagnosis = pchrtRemoveDiagnosis;
  window.pchrtDxIcdInput = pchrtDxIcdInput;
  window.pchrtDxIcdSelect = pchrtDxIcdSelect;
  window.pchrtOpenAce = pchrtOpenAce;
  window.pchrtSelectPatient = pchrtSelectPatient;
  window.pchrtToggleSection = pchrtToggleSection;
  window.pchrtAddEntry = pchrtAddEntry;
  window.pchrtRemoveEntry = pchrtRemoveEntry;
  window.pchrtNewNote = pchrtNewNote;
  window.pchrtOpenNote = pchrtOpenNote;
  window.pchrtCloseNoteModal = pchrtCloseNoteModal;
  window.pchrtSetMode = pchrtSetMode;
  window.pchrtExec = pchrtExec;
  window.pchrtExecVal = pchrtExecVal;
  window.pchrtApplyTemplate = pchrtApplyTemplate;
  window.pchrtInsertMacro = pchrtInsertMacro;
  window.pchrtEditorInput = pchrtEditorInput;
  window.pchrtEditorHtmlInput = pchrtEditorHtmlInput;
  window.pchrtSaveNote = pchrtSaveNote;
  window.pchrtSign = pchrtSign;
  window.pchrtPrint = pchrtPrint;
  window.pchrtSend = pchrtSend;
  window.pchrtPull = pchrtPull;
})();

;// Inserts the chosen macro, then resets the picker so the same one can be chosen again.
window.pchrtInsertMacroFrom = function (sel) { window.pchrtInsertMacro(sel.value); sel.value = '' }
