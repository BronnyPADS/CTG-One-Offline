(function () {
  'use strict';

  function chkEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function chkPad(n) { return String(n).padStart(2, '0'); }
  function chkToday() { const d = new Date(); return d.getFullYear() + '-' + chkPad(d.getMonth() + 1) + '-' + chkPad(d.getDate()); }
  function chkAppts() { return (typeof ctgAppointments !== 'undefined' && Array.isArray(ctgAppointments)) ? ctgAppointments : []; }
  function chkPatient(id) { return (typeof getPatient === 'function') ? getPatient(id) : null; }
  function chkVisitLabel(v) { return (typeof apptVisitLabel === 'function') ? apptVisitLabel(v) : String(v || '').replace(/_/g, ' '); }

  const CHK_TEMPLATES = ['ACE', 'Exams'];
  /* Visit-type keys carry underscores as identifiers; they must be spaced
     out for display. Never stored in this form. */
  function chkVisitLabel(v) { return (typeof apptVisitLabel === 'function') ? apptVisitLabel(v) : String(v || '').replace(/_/g, ' '); }
  function chkTemplateGroup(template) { return template === 'ACE' ? 'ACE' : 'Exams'; }
  let chkFilters = { patient: '', date: chkToday(), template: '' };
  let chkPatientId = '';

  function chkAllPatients() { return (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : []; }
  function chkPatientSub(p) {
    const d = p.demographics || {};
    return [d.dob, d.mobile].filter(Boolean).join(' · ');
  }

  function chkFmtDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  }

  // Check-in Date is the record's own date - ACE's Date of Service, or the
  // exam's Examination Date - not the appointment. Both are stored as plain
  // MM/DD/YYYY text (not ISO), so they're display-ready as-is; chkFmtAnyDate
  // only kicks in for the savedAt-fallback branch, which IS an ISO string.
  function chkFmtAnyDate(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;
    return chkFmtDate(s.slice(0, 10));
  }
  function chkAceDate(p) { return (p.ace && (p.ace.dateOfService || String(p.ace.savedAt || '').slice(0, 10))) || ''; }
  function chkExamDate(exam) { return (exam && (exam.examinationDate || exam.sessionDate || String(exam.savedAt || '').slice(0, 10))) || ''; }
  function chkApptOnDate(patientId, dateISO) { return chkAppts().find(a => a.patientId === patientId && a.date === dateISO); }
  function chkRowFromEvent(p, template, dateISO, savedAt, arrayKey, index) {
    const appt = chkApptOnDate(p.id, dateISO);
    return {
      patientId: p.id,
      template: template,
      patientName: (typeof fullPatientName === 'function') ? fullPatientName(p) : '',
      eventDate: dateISO,
      checkInDate: chkFmtAnyDate(dateISO),
      savedDate: savedAt ? chkFmtDate(String(savedAt).slice(0, 10)) : chkFmtAnyDate(dateISO),
      visitType: appt ? chkVisitLabel(appt.visitType || '') : template,
      arrayKey: arrayKey,
      index: index
    };
  }

  // Every real check-in event across every patient and every date - filtered
  // down to a specific day (the normal case) or to one patient's full
  // history (once that patient is picked from the combo, regardless of
  // whatever date happens to be in the filter).
  function chkEventsForPatient(p) {
    const rows = [];
    if (p.ace && p.ace.savedAt) rows.push(chkRowFromEvent(p, 'ACE', chkAceDate(p), p.ace.savedAt, 'ace', null));
    if (p.initialExam && p.initialExam.savedAt) rows.push(chkRowFromEvent(p, 'Day 2', chkExamDate(p.initialExam), p.initialExam.savedAt, 'initialExam', null));
    (Array.isArray(p.reExams) ? p.reExams : []).forEach((ex, i) => {
      if (ex && ex.savedAt) rows.push(chkRowFromEvent(p, 'Re-Examination', chkExamDate(ex), ex.savedAt, 'reExams', i));
    });
    if (p.finalExam && p.finalExam.savedAt) rows.push(chkRowFromEvent(p, 'Final Examination', chkExamDate(p.finalExam), p.finalExam.savedAt, 'finalExam', null));
    return rows;
  }
  function chkFilteredRows() {
    const byTemplate = r => !chkFilters.template || chkTemplateGroup(r.template) === chkFilters.template;
    if (chkPatientId) {
      const p = chkPatient(chkPatientId);
      if (!p) return [];
      return chkEventsForPatient(p).filter(byTemplate).sort((x, y) => String(y.eventDate).localeCompare(String(x.eventDate)));
    }
    const needle = chkFilters.patient.trim().toLowerCase();
    const rows = [];
    chkAllPatients().forEach(p => {
      if (needle) {
        const name = (typeof fullPatientName === 'function' ? fullPatientName(p) : '').toLowerCase();
        if (name.indexOf(needle) === -1) return;
      }
      chkEventsForPatient(p).forEach(r => { if (r.eventDate === chkFilters.date && byTemplate(r)) rows.push(r); });
    });
    return rows.sort((x, y) => x.patientName.localeCompare(y.patientName));
  }

  function renderPatientCheckIn() {
    const mount = document.getElementById('chkMount');
    if (!mount) return;
    mount.innerHTML = chkShellHTML();
    chkRenderRows();
  }

  function chkShellHTML() {
    return '<div class="enc-topbar"><div class="enc-topbar-title">Patient Check In</div></div>'
      + '<div class="enc-filter-card">'
      + '<button type="button" class="enc-filter-head open" data-onclick="chkToggleFilter()"><span>Click Here To Filter</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
      + '<div class="enc-filter-body">'
      + '<div class="enc-filter-grid" data-cs="'+__cs+'grid-template-columns:minmax(0,1fr) auto;align-items:end">'
        + '<div class="enc-field"><label>Patient</label><div class="ar-combo chk-patient-combo" id="chkPatientCombo">'
          + '<input type="text" class="ar-combo-input chk-patient-input" id="chkPatient" placeholder="Type a name, or click to browse the patient list" value="' + chkEsc(chkFilters.patient) + '" autocomplete="off" data-oninput="chkPatientInput(this.value)" data-onfocus="chkPatientOpenBrowse()">'
          + '<button type="button" class="chk-patient-caret" data-onclick="chkPatientToggle(event)" aria-label="Browse patients"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
          + '<div class="ar-combo-panel chk-patient-panel" id="chkPatientPanel"></div>'
        + '</div></div>'
        + '<div class="enc-field"><label>Template</label><select id="chkTemplate" data-onchange="chkOnField(\'template\',this.value);chkRenderRows()">'
          + '<option value="">All</option>' + CHK_TEMPLATES.map(t => '<option value="' + chkEsc(t) + '"' + (t === chkFilters.template ? ' selected' : '') + '>' + chkEsc(t) + '</option>').join('')
          + '</select></div>'
      + '</div></div></div>'
      + '<div class="enc-table-wrap"><table class="enc-table" id="chkTable"></table></div>';
  }

  function chkRenderRows() {
    const table = document.getElementById('chkTable');
    if (!table) return;
    const rows = chkFilteredRows();
    let thead = '<colgroup><col data-cs="'+__cs+'width:16%"><col data-cs="'+__cs+'width:24%"><col data-cs="'+__cs+'width:18%"><col data-cs="'+__cs+'width:14%"><col data-cs="'+__cs+'width:18%"><col data-cs="'+__cs+'width:10%"></colgroup>'
      + '<thead><tr><th>Template</th><th>Patient Name</th><th>Check-in Date</th><th>Saved Date</th><th>Visit Type</th><th>Open Form</th></tr></thead>';
    let tbody = '<tbody>';
    if (!rows.length) {
      const emptyMsg = chkPatientId ? 'No Day 1, exam, or check-in records found for this patient.' : 'No patients checked in on this date.';
      tbody += '<tr><td class="enc-empty" colspan="6">' + chkEsc(emptyMsg) + '</td></tr>';
    } else {
      rows.forEach(r => {
        tbody += '<tr><td>' + chkEsc(r.template) + '</td><td>' + chkEsc(r.patientName) + '</td><td>' + chkEsc(r.checkInDate) + '</td>'
          + '<td>' + chkEsc(r.savedDate) + '</td><td>' + chkEsc(chkVisitLabel(r.visitType)) + '</td>'
          + '<td><button type="button" class="btn btn-ghost btn-sm" data-onclick="chkOpenForm(\'' + r.patientId + '\',\'' + r.arrayKey + '\',' + (r.index == null ? 'null' : r.index) + ')">Open Form</button></td></tr>';
      });
    }
    tbody += '</tbody>';
    table.innerHTML = thead + tbody;
  }

  function chkOnField(key, value) { chkFilters[key] = value; }

  function chkPatientOptionsHTML(query) {
    const q = (query || '').trim().toLowerCase();
    let list = chkAllPatients().filter(p => {
      if (!q) return true;
      const name = (typeof fullPatientName === 'function' ? fullPatientName(p) : '').toLowerCase();
      const d = p.demographics || {};
      return name.indexOf(q) !== -1 || String(d.dob || '').toLowerCase().indexOf(q) !== -1 || String(d.mobile || '').indexOf(q) !== -1;
    });
    if (!q) {
      list = list.slice().sort((a, b) => (typeof fullPatientName === 'function' ? fullPatientName(a).localeCompare(fullPatientName(b)) : 0));
    }
    const shown = list.slice(0, 30);
    if (!shown.length) return '<div class="ar-combo-empty">No matching patients</div>';
    let h = q ? '' : '<div class="ar-combo-empty chk-patient-hint">Click a name to view their record</div>';
    h += shown.map(p => {
      const name = typeof fullPatientName === 'function' ? fullPatientName(p) : 'Patient';
      const sub = chkPatientSub(p);
      return '<div class="ar-combo-option" data-onmousedown="event.preventDefault();chkSelectPatient(\'' + p.id + '\')"><span class="ar-combo-text">' + chkEsc(name) + (sub ? ' <span data-cs="'+__cs+'color:var(--muted);font-size:11px">— ' + chkEsc(sub) + '</span>' : '') + '</span></div>';
    }).join('');
    if (list.length > shown.length) h += '<div class="ar-combo-empty">+' + (list.length - shown.length) + ' more — keep typing to narrow down</div>';
    return h;
  }
  function chkPatientInput(value) {
    chkFilters.patient = value;
    chkPatientId = '';
    const panel = document.getElementById('chkPatientPanel');
    if (!panel) return;
    panel.innerHTML = chkPatientOptionsHTML(value);
    panel.classList.add('show');
  }
  // Focusing/clicking into the field always browses the FULL patient list -
  // typing (chkPatientInput, above) is what narrows it down. Without this,
  // re-opening the dropdown while a patient is already selected would just
  // re-filter by that one name and look like everyone else disappeared.
  function chkPatientOpenBrowse() {
    const panel = document.getElementById('chkPatientPanel');
    if (!panel) return;
    panel.innerHTML = chkPatientOptionsHTML('');
    panel.classList.add('show');
  }
  function chkPatientToggle(ev) {
    if (ev) ev.stopPropagation();
    const panel = document.getElementById('chkPatientPanel');
    const input = document.getElementById('chkPatient');
    if (!panel) return;
    if (panel.classList.contains('show')) { panel.classList.remove('show'); return; }
    chkPatientOpenBrowse();
    if (input) input.focus();
  }
  function chkSelectPatient(id) {
    const p = chkPatient(id);
    if (!p) return;
    chkPatientId = id;
    chkFilters.patient = typeof fullPatientName === 'function' ? fullPatientName(p) : '';
    const input = document.getElementById('chkPatient');
    if (input) input.value = chkFilters.patient;
    const panel = document.getElementById('chkPatientPanel');
    if (panel) panel.classList.remove('show');
    chkRenderRows();
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#chkPatientCombo')) {
      const panel = document.getElementById('chkPatientPanel');
      if (panel) panel.classList.remove('show');
    }
  });
  function chkToggleFilter() {
    const body = document.querySelector('#chkMount .enc-filter-body');
    const head = document.querySelector('#chkMount .enc-filter-head');
    if (!body || !head) return;
    const open = head.classList.toggle('open');
    body.style.display = open ? '' : 'none';
  }
  function chkOpenForm(patientId, arrayKey, index) {
    if (!patientId) return;
    if (arrayKey === 'ace') {
      if (typeof showPage === 'function') showPage('patientLists');
      // selectedPatientId is an app.js global (script scope, not a window
      // prop) - assigned directly here so setPatientDetailTab's own
      // re-render actually lands on this patient, not whatever was last
      // viewed, while still going through its permission gate.
      try { selectedPatientId = patientId; } catch (e) {}
      if (typeof setPatientDetailTab === 'function') setPatientDetailTab('ace');
      return;
    }
    if (typeof viewPatientExamResult === 'function') viewPatientExamResult(patientId, arrayKey, index == null ? undefined : index);
  }

  window.renderPatientCheckIn = renderPatientCheckIn;
  // The Template select calls it after chkOnField; it was never exported, so
  // that second step silently failed even as an inline handler.
  window.chkRenderRows = chkRenderRows;
  window.chkPatientInput = chkPatientInput;
  window.chkPatientOpenBrowse = chkPatientOpenBrowse;
  window.chkPatientToggle = chkPatientToggle;
  window.chkSelectPatient = chkSelectPatient;
  window.chkOnField = chkOnField;
  window.chkToggleFilter = chkToggleFilter;
  window.chkOpenForm = chkOpenForm;
})();
