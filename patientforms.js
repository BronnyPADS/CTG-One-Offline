(function () {
  'use strict';

  var m = (location.hash || '').match(/[#&]pf=([^&]+)/);
  if (!m) return; // normal staff app - do nothing.

  // Hide the staff chrome as early as possible to avoid a login flash.
  document.documentElement.classList.add('pf-mode');

  var payload = null;
  try { payload = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); }
  catch (e) { try { payload = JSON.parse(decodeURIComponent(m[1])); } catch (e2) { payload = null; } }

  var STORE_KEY = 'ctg_portal_patients_v1';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pfLoadPatients() {
    if (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients) && ctgPatients.length) return ctgPatients;
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function pfFindPatient(id) {
    if (typeof getPatient === 'function') { var g = getPatient(id); if (g) return g; }
    return pfLoadPatients().filter(function (p) { return p.id === id; })[0] || null;
  }
  function pfSubmitToServer(intake, demographics, cb) {
    fetch('/api/patient-forms/' + encodeURIComponent(pfState.token), {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intake: intake, demographics: demographics || {} })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { cb(res.ok, (res.j && res.j.error) || ''); })
      .catch(function () { cb(false, 'Could not reach the clinic. Please check your connection and try again.'); });
  }

  function pfPersist() {
    // Reuse the app's persistence if available (writes IndexedDB + localStorage);
    // otherwise write the localStorage cache directly.
    if (typeof persistPatients === 'function' && typeof ctgPatients !== 'undefined' && ctgPatients.length) { persistPatients(); return; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(pfState.all)); } catch (e) {}
    if (typeof idbSet === 'function') { try { idbSet(STORE_KEY, pfState.all); } catch (e) {} }
  }

  var pfState = { dpaAccepted: false, patient: null, forms: [], token: '', all: [], sigHas: false, step: 0, signature: null, lang: 'en', errorKey: '', doneScreen: false };

  var PF_LANG_NAMES = { en: 'English', es: 'Español', fr: 'Français', zh: '中文' };

  var PF_I18N = {
    en: {
      brandSub: 'Secure Patient Forms', footNote: 'This is a secure link intended only for you. Your answers are saved to your clinical record.',
      loading: 'Loading your forms…', errInvalidLink: 'This form link is invalid or incomplete.', errNotFound: 'We couldn’t find your record for this link. Please contact the clinic.', errNoForms: 'No forms were assigned to this link.',
      hello: 'Hello', stepTemplate: 'Step {0} of {1}',
      formDemographics: 'Demographics', formInsurance: 'Insurance & Attorney', formIntakeForm: 'Intake Form', formMinorAuth: 'Minor Authorization',
      demographicsTitle: 'Demographics', insuranceTitle: 'Insurance & Attorney', intakeTitle: 'Intake Form &amp; Consent', minorTitle: 'Authorization to Treat Minor',
      firstName: 'First Name', lastName: 'Last Name', dob: 'Date of Birth', gender: 'Gender', genderMale: 'Male', genderFemale: 'Female', genderNonbinary: 'Non-binary', genderPreferNot: 'Prefer not to say', selectPlaceholder: '— Select —',
      addr1: 'Address Line 1', addr2: 'Address Line 2', addr2Ph: 'Apartment, suite, unit (optional)', csz: 'City, State, Zip', email: 'Email', mobile: 'Mobile #', emgName: 'Emergency Contact Name', emgNum: 'Emergency Contact Number',
      hasPip: 'Do you have PIP (Personal Injury Protection)?', yes: 'Yes', no: 'No', autoIns: 'Auto Insurance Company', pipClaim: 'PIP Claim #', policyNo: 'Policy #', adjName: 'Adjuster Name', adjPhone: 'Adjuster Phone', driver: 'Driver Name', lawFirm: 'Law Firm', attyName: 'Attorney Name', attyPhone: 'Attorney Phone',
      consentText: 'Please read the document below before signing. It updates live as you complete the other sections.', intakeDocLabel: 'New Neuro Patient Intake Form', aobShortLabel: 'Assignment of Benefits (Short)', aobLongLabel: 'Assignment of Benefits (Long)', consentCheckboxLabel: 'I have read and agree to the document(s) above.',
      childName: 'Child Name', childDob: 'Child Date of Birth', parentName: 'Parent Name (printed)', parentDob: 'Parent Date of Birth', guardianName: 'Guardian Name (printed)', guardianDob: 'Guardian Date of Birth', minorPreviewLabel: 'Live preview of the document you are signing',
      signTitle: 'Sign this form', signatureTitle: 'Signature', minorSignNote: 'This authorization must be signed by the child’s <strong>parent or guardian</strong>.', signerParent: 'Parent', signerGuardian: 'Guardian', signerPatient: 'Patient',
      drawSigLabel: 'Draw signature', clearBtn: 'Clear', typeSigLabel: 'Or type the full legal name', typeSigPlaceholder: 'Type the full legal name', signedByPrefix: 'Signed by', appliedToForm: '— applied to this form.', resignBtn: 'Re-sign',
      backBtn: '← Back', saveContinueBtn: 'Save &amp; Continue →', submitBtn: 'Submit Forms',
      toastName: 'Please enter your first and last name.', toastConsent: 'Please tick the consent box to continue.', toastChildName: 'Please enter the child’s name.', toastSign: 'Please sign this form — draw or type your name.',
      doneTitle: 'Thank you!', doneSub: 'Your forms have been submitted to Concussion Therapy Group. You can close this page.'
    },
    es: {
      brandSub: 'Formularios Seguros para Pacientes', footNote: 'Este es un enlace seguro destinado únicamente para usted. Sus respuestas se guardan en su historial clínico.',
      loading: 'Cargando sus formularios…', errInvalidLink: 'Este enlace de formulario no es válido o está incompleto.', errNotFound: 'No pudimos encontrar su registro para este enlace. Por favor, comuníquese con la clínica.', errNoForms: 'No se asignaron formularios a este enlace.',
      hello: 'Hola', stepTemplate: 'Paso {0} de {1}',
      formDemographics: 'Datos Demográficos', formInsurance: 'Seguro y Abogado', formIntakeForm: 'Formulario de Admisión', formMinorAuth: 'Autorización para Menores',
      demographicsTitle: 'Datos Demográficos', insuranceTitle: 'Seguro y Abogado', intakeTitle: 'Formulario de Admisión y Consentimiento', minorTitle: 'Autorización para Tratar a un Menor',
      firstName: 'Nombre', lastName: 'Apellido', dob: 'Fecha de Nacimiento', gender: 'Género', genderMale: 'Masculino', genderFemale: 'Femenino', genderNonbinary: 'No binario', genderPreferNot: 'Prefiero no decir', selectPlaceholder: '— Seleccionar —',
      addr1: 'Dirección Línea 1', addr2: 'Dirección Línea 2', addr2Ph: 'Apartamento, suite, unidad (opcional)', csz: 'Ciudad, Estado, Código Postal', email: 'Correo Electrónico', mobile: 'Número de Celular', emgName: 'Nombre de Contacto de Emergencia', emgNum: 'Número de Contacto de Emergencia',
      hasPip: '¿Tiene PIP (Protección contra Lesiones Personales)?', yes: 'Sí', no: 'No', autoIns: 'Compañía de Seguro de Auto', pipClaim: 'N.º de Reclamo de PIP', policyNo: 'N.º de Póliza', adjName: 'Nombre del Ajustador', adjPhone: 'Teléfono del Ajustador', driver: 'Nombre del Conductor', lawFirm: 'Bufete de Abogados', attyName: 'Nombre del Abogado', attyPhone: 'Teléfono del Abogado',
      consentText: 'Por favor lea el documento a continuación antes de firmar. Se actualiza en tiempo real a medida que completa las otras secciones.', intakeDocLabel: 'Formulario de Admisión para Nuevo Paciente Neurológico', aobShortLabel: 'Cesión de Beneficios (Corta)', aobLongLabel: 'Cesión de Beneficios (Larga)', consentCheckboxLabel: 'He leído y estoy de acuerdo con el/los documento(s) anterior(es).',
      childName: 'Nombre del Niño(a)', childDob: 'Fecha de Nacimiento del Niño(a)', parentName: 'Nombre del Padre/Madre (en letra de imprenta)', parentDob: 'Fecha de Nacimiento del Padre/Madre', guardianName: 'Nombre del Tutor (en letra de imprenta)', guardianDob: 'Fecha de Nacimiento del Tutor', minorPreviewLabel: 'Vista previa en vivo del documento que está firmando',
      signTitle: 'Firme este formulario', signatureTitle: 'Firma', minorSignNote: 'Esta autorización debe ser firmada por el <strong>padre, madre o tutor</strong> del niño(a).', signerParent: 'Padre/Madre', signerGuardian: 'Tutor', signerPatient: 'Paciente',
      drawSigLabel: 'Dibuje su firma', clearBtn: 'Borrar', typeSigLabel: 'O escriba su nombre legal completo', typeSigPlaceholder: 'Escriba el nombre legal completo', signedByPrefix: 'Firmado por', appliedToForm: '— aplicado a este formulario.', resignBtn: 'Volver a firmar',
      backBtn: '← Atrás', saveContinueBtn: 'Guardar y Continuar →', submitBtn: 'Enviar Formularios',
      toastName: 'Por favor ingrese su nombre y apellido.', toastConsent: 'Por favor marque la casilla de consentimiento para continuar.', toastChildName: 'Por favor ingrese el nombre del niño(a).', toastSign: 'Por favor firme este formulario — dibuje o escriba su nombre.',
      doneTitle: '¡Gracias!', doneSub: 'Sus formularios han sido enviados a Concussion Therapy Group. Puede cerrar esta página.'
    },
    fr: {
      brandSub: 'Formulaires Patients Sécurisés', footNote: 'Ceci est un lien sécurisé qui vous est destiné exclusivement. Vos réponses sont enregistrées dans votre dossier clinique.',
      loading: 'Chargement de vos formulaires…', errInvalidLink: 'Ce lien de formulaire est invalide ou incomplet.', errNotFound: 'Nous n’avons pas trouvé votre dossier pour ce lien. Veuillez contacter la clinique.', errNoForms: 'Aucun formulaire n’a été assigné à ce lien.',
      hello: 'Bonjour', stepTemplate: 'Étape {0} sur {1}',
      formDemographics: 'Données Démographiques', formInsurance: 'Assurance et Avocat', formIntakeForm: 'Formulaire d’Admission', formMinorAuth: 'Autorisation pour Mineur',
      demographicsTitle: 'Données Démographiques', insuranceTitle: 'Assurance et Avocat', intakeTitle: 'Formulaire d’Admission et Consentement', minorTitle: 'Autorisation de Traiter un Mineur',
      firstName: 'Prénom', lastName: 'Nom de Famille', dob: 'Date de Naissance', gender: 'Sexe', genderMale: 'Masculin', genderFemale: 'Féminin', genderNonbinary: 'Non binaire', genderPreferNot: 'Préfère ne pas préciser', selectPlaceholder: '— Sélectionner —',
      addr1: 'Adresse Ligne 1', addr2: 'Adresse Ligne 2', addr2Ph: 'Appartement, suite, unité (facultatif)', csz: 'Ville, État, Code Postal', email: 'Courriel', mobile: 'N° de Portable', emgName: 'Nom du Contact d’Urgence', emgNum: 'Numéro du Contact d’Urgence',
      hasPip: 'Avez-vous une PIP (Protection contre les Blessures Corporelles) ?', yes: 'Oui', no: 'Non', autoIns: 'Compagnie d’Assurance Auto', pipClaim: 'N° de Réclamation PIP', policyNo: 'N° de Police', adjName: 'Nom de l’Expert', adjPhone: 'Téléphone de l’Expert', driver: 'Nom du Conducteur', lawFirm: 'Cabinet d’Avocats', attyName: 'Nom de l’Avocat', attyPhone: 'Téléphone de l’Avocat',
      consentText: 'Veuillez lire le document ci-dessous avant de signer. Il se met à jour en direct au fur et à mesure que vous complétez les autres sections.', intakeDocLabel: 'Formulaire d’Admission pour Nouveau Patient Neurologique', aobShortLabel: 'Cession de Prestations (Courte)', aobLongLabel: 'Cession de Prestations (Longue)', consentCheckboxLabel: 'J’ai lu et j’accepte le(s) document(s) ci-dessus.',
      childName: 'Nom de l’Enfant', childDob: 'Date de Naissance de l’Enfant', parentName: 'Nom du Parent (en lettres moulées)', parentDob: 'Date de Naissance du Parent', guardianName: 'Nom du Tuteur (en lettres moulées)', guardianDob: 'Date de Naissance du Tuteur', minorPreviewLabel: 'Aperçu en direct du document que vous signez',
      signTitle: 'Signer ce formulaire', signatureTitle: 'Signature', minorSignNote: 'Cette autorisation doit être signée par le <strong>parent ou le tuteur</strong> de l’enfant.', signerParent: 'Parent', signerGuardian: 'Tuteur', signerPatient: 'Patient',
      drawSigLabel: 'Dessinez votre signature', clearBtn: 'Effacer', typeSigLabel: 'Ou saisissez votre nom légal complet', typeSigPlaceholder: 'Saisissez le nom légal complet', signedByPrefix: 'Signé par', appliedToForm: '— appliqué à ce formulaire.', resignBtn: 'Signer à nouveau',
      backBtn: '← Retour', saveContinueBtn: 'Enregistrer et Continuer →', submitBtn: 'Soumettre les Formulaires',
      toastName: 'Veuillez saisir votre prénom et nom.', toastConsent: 'Veuillez cocher la case de consentement pour continuer.', toastChildName: 'Veuillez saisir le nom de l’enfant.', toastSign: 'Veuillez signer ce formulaire — dessinez ou tapez votre nom.',
      doneTitle: 'Merci !', doneSub: 'Vos formulaires ont été soumis à Concussion Therapy Group. Vous pouvez fermer cette page.'
    },
    zh: {
      brandSub: '安全患者表格', footNote: '此链接仅供您本人使用，为安全链接。您的回答将保存至您的临床记录。',
      loading: '正在加载您的表格…', errInvalidLink: '此表格链接无效或不完整。', errNotFound: '我们找不到与此链接对应的记录。请联系诊所。', errNoForms: '此链接未分配任何表格。',
      hello: '您好', stepTemplate: '第 {0} 步，共 {1} 步',
      formDemographics: '基本信息', formInsurance: '保险与律师', formIntakeForm: '接诊表格', formMinorAuth: '未成年人授权',
      demographicsTitle: '基本信息', insuranceTitle: '保险与律师', intakeTitle: '接诊表格与知情同意', minorTitle: '未成年人治疗授权',
      firstName: '名', lastName: '姓', dob: '出生日期', gender: '性别', genderMale: '男', genderFemale: '女', genderNonbinary: '非二元性别', genderPreferNot: '不愿透露', selectPlaceholder: '— 请选择 —',
      addr1: '地址第一行', addr2: '地址第二行', addr2Ph: '公寓、套房、单元（可选）', csz: '城市、州、邮编', email: '电子邮箱', mobile: '手机号码', emgName: '紧急联系人姓名', emgNum: '紧急联系人电话',
      hasPip: '您是否有PIP（人身伤害保护保险）？', yes: '是', no: '否', autoIns: '汽车保险公司', pipClaim: 'PIP理赔编号', policyNo: '保单号', adjName: '理赔员姓名', adjPhone: '理赔员电话', driver: '驾驶员姓名', lawFirm: '律师事务所', attyName: '律师姓名', attyPhone: '律师电话',
      consentText: '请在签署前阅读以下文件。当您填写其他部分时，此文件会实时更新。', intakeDocLabel: '新神经科患者接诊表格', aobShortLabel: '福利转让书（简版）', aobLongLabel: '福利转让书（完整版）', consentCheckboxLabel: '我已阅读并同意上述文件。',
      childName: '儿童姓名', childDob: '儿童出生日期', parentName: '家长姓名（正楷）', parentDob: '家长出生日期', guardianName: '监护人姓名（正楷）', guardianDob: '监护人出生日期', minorPreviewLabel: '您正在签署的文件的实时预览',
      signTitle: '签署此表格', signatureTitle: '签名', minorSignNote: '此授权必须由儿童的<strong>父母或监护人</strong>签署。', signerParent: '家长', signerGuardian: '监护人', signerPatient: '患者',
      drawSigLabel: '绘制签名', clearBtn: '清除', typeSigLabel: '或输入法定全名', typeSigPlaceholder: '输入法定全名', signedByPrefix: '签署人', appliedToForm: '— 已应用于此表格。', resignBtn: '重新签署',
      backBtn: '← 返回', saveContinueBtn: '保存并继续 →', submitBtn: '提交表格',
      toastName: '请输入您的名和姓。', toastConsent: '请勾选同意复选框以继续。', toastChildName: '请输入儿童姓名。', toastSign: '请签署此表格——绘制或输入您的姓名。',
      doneTitle: '谢谢！', doneSub: '您的表格已提交至 Concussion Therapy Group。您可以关闭此页面。'
    }
  };
  function t(key) { var d = PF_I18N[pfState.lang] || PF_I18N.en; return (d[key] != null ? d[key] : PF_I18N.en[key]) || ''; }
  function tf(key, args) { var s = t(key); for (var i = 0; i < args.length; i++) s = s.replace('{' + i + '}', args[i]); return s; }
  try { var savedLang = localStorage.getItem('ctg_pf_lang'); if (savedLang && PF_I18N[savedLang]) pfState.lang = savedLang; } catch (e) {}

  var FORM_LABELS_KEY = { demographics: 'formDemographics', insurance: 'formInsurance', intakeForm: 'formIntakeForm', minorAuth: 'formMinorAuth' };
  function formLabel(k) { return (typeof ctgFormLabel === 'function' ? ctgFormLabel(k) : (t(FORM_LABELS_KEY[k]) || k)); }
  window.pfSetLang = function (lang) {
    if (!PF_I18N[lang]) return;
    pfState.lang = lang;
    try { localStorage.setItem('ctg_pf_lang', lang); } catch (e) {}
    var view = document.getElementById('patientFormsView');
    if (!view) return;
    if (pfState.doneScreen) { view.innerHTML = pfShell(pfDoneHtml()); window.scrollTo(0, 0); return; }
    if (pfState.patient) { pfRenderStep(); return; }
    if (pfState.errorKey) { view.innerHTML = pfShell(pfError(t(pfState.errorKey))); return; }
    view.innerHTML = pfShell('<div class="pf-card pf-loading">' + esc(t('loading')) + '</div>');
  };

  function boot() {
    var view = document.getElementById('patientFormsView');
    if (!view) return;
    document.body.classList.add('pf-mode');
    if (!payload || !payload.p) { pfState.errorKey = 'errInvalidLink'; view.innerHTML = pfShell(pfError(t('errInvalidLink'))); return; }
    view.innerHTML = pfShell('<div class="pf-card pf-loading">' + esc(t('loading')) + '</div>');
    // Records with large PDF uploads live only in IndexedDB (the localStorage
    // cache is skipped past quota), so resolve the patient from every source
    // before deciding it's missing.
    pfState.token = payload.t || '';
    pfResolvePatient(payload.p, function (p) {
      if (!p) {
        // Prefer the server's wording - it distinguishes expired from already
        // submitted, which "not found" would hide from the patient.
        view.innerHTML = pfShell(pfError(pfState.serverError || t('errNotFound')));
        pfState.errorKey = 'errNotFound';
        return;
      }
      pfState.patient = p;
      var catalogKeys = Object.keys(FORM_LABELS_KEY);
      pfState.forms = (Array.isArray(payload.f) ? payload.f : []).filter(function (k) { return catalogKeys.indexOf(k) !== -1; });
      if (!pfState.forms.length) { pfState.errorKey = 'errNoForms'; view.innerHTML = pfShell(pfError(t('errNoForms'))); return; }
      pfState.step = 0;
      pfState.signature = null;
      pfRenderStep();
    });
  }
  /* Try the in-memory array and localStorage synchronously; if still not found,
     fall back to the authoritative IndexedDB copy (async). */
  function pfResolvePatient(id, cb) {
    /* The server is the only source that exists on a PATIENT's device. The
       local stores below are kept for staff previewing a link inside the
       portal, where the record is already in memory. */
    if (pfState.token) {
      fetch('/api/patient-forms/' + encodeURIComponent(pfState.token), { credentials: 'omit' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.patient) {
            pfState.serverError = (res.j && res.j.error) || '';
            cb(null); return;
          }
          var sp = res.j.patient;
          cb({ id: sp.id, demographics: {
                 firstName: sp.firstName, lastName: sp.lastName, dob: sp.dob,
                 mrn: sp.mrn, email: sp.email, mobile: sp.mobile,
                 gender: sp.gender, addressLine: sp.addressLine,
                 addressLine2: sp.addressLine2, cityStateZip: sp.cityStateZip,
                 lawFirm: sp.lawFirm || '' },
               intake: res.j.intake || {} });
        })
        .catch(function () { cb(null); });
      return;
    }
    pfState.all = pfLoadPatients();
    var p = pfFindPatient(id);
    if (p) { cb(p); return; }
    if (typeof idbGet === 'function') {
      idbGet(STORE_KEY).then(function (arr) {
        if (Array.isArray(arr) && arr.length) {
          pfState.all = arr;
          if (typeof ctgPatients !== 'undefined') { try { ctgPatients = arr; } catch (e) {} }
          cb(arr.filter(function (x) { return x.id === id; })[0] || null);
        } else { cb(null); }
      }).catch(function () { cb(null); });
    } else { cb(null); }
  }

  /* ---------- Views ---------- */
  function pfLangBarHtml() {
    var opts = ['en', 'es', 'fr', 'zh'].map(function (l) { return '<option value="' + l + '"' + (l === pfState.lang ? ' selected' : '') + '>' + PF_LANG_NAMES[l] + '</option>'; }).join('');
    return '<div class="pf-lang-bar"><div class="pf-lang-wrap">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
      + '<select id="pf_langSel" class="pf-lang-sel" data-onchange="pfSetLang(this.value)">' + opts + '</select>'
      + '</div></div>';
  }
  function pfShell(inner) {
    return '<div class="pf-wrap">'
      + pfLangBarHtml()
      + '<div class="pf-brand"><div class="pf-brand-name">Concussion Therapy <span>Group</span></div><div class="pf-brand-sub">' + esc(t('brandSub')) + '</div></div>'
      + inner
      + '<div class="pf-foot">' + esc(t('footNote')) + '</div>'
      + '</div>';
  }
  function pfError(msg) { return '<div class="pf-card pf-error"><div class="pf-err-ico">!</div><div>' + esc(msg) + '</div></div>'; }

  function pfField(id, label, val, opts) {
    opts = opts || {};
    var input = opts.type === 'select'
      ? '<select id="' + id + '">' + (opts.options || []).map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' + esc(o.value ? o.label : t('selectPlaceholder')) + '</option>'; }).join('') + '</select>'
      : '<input type="text" id="' + id + '" value="' + esc(val || '') + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>';
    return '<div class="pf-fg' + (opts.full ? ' pf-full' : '') + '"><label>' + esc(label) + (opts.req ? '<span class="pf-req">*</span>' : '') + '</label>' + input + '</div>';
  }

  function pfSectionDemographics(p) {
    var d = p.demographics || {}, i = (p.intake && p.intake.demographics) || {};
    return pfSection(t('demographicsTitle'),
      '<div class="pf-grid">'
      + pfField('pf_firstName', t('firstName'), d.firstName, { req: true })
      + pfField('pf_lastName', t('lastName'), d.lastName, { req: true })
      + pfField('pf_dob', t('dob'), d.dob, { placeholder: 'MM/DD/YYYY' })
      + pfField('pf_gender', t('gender'), d.gender, { type: 'select', options: [{ value: '', label: '' }, { value: 'Male', label: t('genderMale') }, { value: 'Female', label: t('genderFemale') }, { value: 'Non-binary', label: t('genderNonbinary') }, { value: 'Prefer not to say', label: t('genderPreferNot') }] })
      + pfField('pf_addr1', t('addr1'), d.addressLine, { full: true })
      + pfField('pf_addr2', t('addr2'), i.addressLine2 || d.addressLine2, { full: true, placeholder: t('addr2Ph') })
      + pfField('pf_csz', t('csz'), d.cityStateZip, { full: true })
      + pfField('pf_email', t('email'), d.email)
      + pfField('pf_mobile', t('mobile'), d.mobile)
      + pfField('pf_emgName', t('emgName'), i.emergencyContactName)
      + pfField('pf_emgNum', t('emgNum'), i.emergencyNumber)
      + '</div>');
  }
  function pfSectionInsurance(p) {
    var pip = (p.intake && p.intake.pip) || {}, att = (p.intake && p.intake.attorney) || {}, dem = p.demographics || {};
    return pfSection(t('insuranceTitle'),
      '<div class="pf-grid">'
      + pfField('pf_hasPip', t('hasPip'), pip.hasPip, { type: 'select', options: [{ value: '', label: '' }, { value: 'Yes', label: t('yes') }, { value: 'No', label: t('no') }] })
      + pfField('pf_autoIns', t('autoIns'), pip.autoInsuranceCompany)
      + pfField('pf_pipClaim', t('pipClaim'), pip.pipClaimNumber)
      + pfField('pf_policyNo', t('policyNo'), pip.policyNumber)
      + pfField('pf_adjName', t('adjName'), pip.adjusterName)
      + pfField('pf_adjPhone', t('adjPhone'), pip.adjusterPhone)
      + pfField('pf_driver', t('driver'), pip.driverName)
      /* Prefilled with the firm on the chart (Registration asks for it too), so
         the patient normally just confirms it. Free text rather than a picker:
         this page is unauthenticated, and the clinic's registered-firm list is
         not the patient's to see. */
      + pfField('pf_lawFirm', t('lawFirm'), att.lawFirm || dem.lawFirm, { full: true })
      + pfField('pf_attyName', t('attyName'), att.attorneyName)
      + pfField('pf_attyPhone', t('attyPhone'), att.phone)
      + '</div>');
  }
  function pfSectionIntake(p) {
    return pfSection(t('intakeTitle'),
      '<p class="pf-consent">' + esc(t('consentText')) + '</p>'
      + '<div class="pf-doc-bar">'
      + '<select id="pf_intakeDocSel" class="pf-doc-sel">'
      + '<option value="intake">' + esc(t('intakeDocLabel')) + '</option>'
      + '<option value="aobShort">' + esc(t('aobShortLabel')) + '</option>'
      + '<option value="aobLong">' + esc(t('aobLongLabel')) + '</option>'
      + '</select></div>'
      + '<iframe id="pf_prev_doc" class="pf-doc-frame" title="Document to sign"></iframe>'
      + '<label class="pf-check"><input type="checkbox" id="pf_consentAgree"> ' + esc(t('consentCheckboxLabel')) + '</label>');
  }
  function pfSectionMinor(p) {
    var mn = (p.intake && p.intake.minorAuth) || {};
    return pfSection(t('minorTitle'),
      '<div class="pf-grid">'
      + pfField('pf_childName', t('childName'), mn.childName, { full: true })
      + pfField('pf_childDob', t('childDob'), mn.childDob, { placeholder: 'MM/DD/YYYY' })
      + pfField('pf_parentName', t('parentName'), mn.parentName)
      + pfField('pf_parentDob', t('parentDob'), mn.parentDob, { placeholder: 'MM/DD/YYYY' })
      + pfField('pf_guardianName', t('guardianName'), mn.guardianName)
      + pfField('pf_guardianDob', t('guardianDob'), mn.guardianDob, { placeholder: 'MM/DD/YYYY' })
      + '</div>'
      + '<div class="pf-doc-label">' + esc(t('minorPreviewLabel')) + '</div>'
      + '<iframe id="pf_prev_minor" class="pf-doc-frame" title="Authorization document"></iframe>');
  }
  function pfSection(title, inner) {
    return '<div class="pf-card"><div class="pf-card-title">' + title + '</div>' + inner + '</div>';
  }

  /* ---------- Step wizard ----------
     One form per page. Each page carries its own signature section; the first
     signature is pulled forward onto later pages so the patient signs once (and
     can re-sign per form if they want). */
  function pfSectionBody(p, key) {
    if (key === 'demographics') return pfSectionDemographics(p);
    if (key === 'insurance') return pfSectionInsurance(p);
    if (key === 'intakeForm') return pfSectionIntake(p);
    if (key === 'minorAuth') return pfSectionMinor(p);
    return '';
  }
  function pfProgressHtml(p) {
    var name = ((p.demographics && p.demographics.firstName) || '') + ' ' + ((p.demographics && p.demographics.lastName) || '');
    var chips = pfState.forms.map(function (k, i) {
      var cls = i < pfState.step ? ' is-done' : (i === pfState.step ? ' is-active' : '');
      return '<span class="pf-step-chip' + cls + '">' + (i < pfState.step ? '✓ ' : (i + 1) + '. ') + esc(formLabel(k)) + '</span>';
    }).join('');
    return '<div class="pf-card pf-intro">'
      + '<div class="pf-hello">' + esc(t('hello')) + (name.trim() ? ', ' + esc(name.trim()) : '') + '</div>'
      + '<div class="pf-step-line">' + esc(tf('stepTemplate', [pfState.step + 1, pfState.forms.length])) + '</div>'
      + '<div class="pf-steps">' + chips + '</div>'
      + '</div>';
  }
  function pfSignatureCard(key) {
    var isMinor = key === 'minorAuth';
    var sig = pfState.signature;
    if (sig && !isMinor) {
      var mark = sig.type === 'drawn'
        ? '<img src="' + esc(sig.data) + '" class="pf-sig-shown" alt="Signature">'
        : '<span class="pf-sig-shown-typed">' + esc(sig.data) + '</span>';
      var signerLabel = sig.signer === 'Guardian' ? t('signerGuardian') : (sig.signer === 'Parent' ? t('signerParent') : t('signerPatient'));
      return pfSection(t('signatureTitle'),
        '<div class="pf-sig-saved">' + mark
        + '<div class="pf-sig-meta">' + esc(t('signedByPrefix')) + ' ' + esc(signerLabel) + ' ' + esc(t('appliedToForm')) + ' <button type="button" class="pf-link" data-onclick="pfReSign()">' + esc(t('resignBtn')) + '</button></div>'
        + '</div>');
    }
    var note = isMinor ? '<div class="pf-sig-note">' + t('minorSignNote') + '</div>' : '';
    var radios = isMinor
      ? '<label><input type="radio" name="pf_signer" value="Parent" checked> ' + esc(t('signerParent')) + '</label><label><input type="radio" name="pf_signer" value="Guardian"> ' + esc(t('signerGuardian')) + '</label>'
      : '<label><input type="radio" name="pf_signer" value="Patient" checked> ' + esc(t('signerPatient')) + '</label><label><input type="radio" name="pf_signer" value="Guardian"> ' + esc(t('signerGuardian')) + '</label>';
    return pfSection(t('signTitle'),
      note
      + '<div class="pf-grid">'
      + '<div class="pf-fg"><label>' + esc(t('drawSigLabel')) + '</label><canvas id="pf_sig" width="360" height="120"></canvas>'
      + '<button type="button" class="pf-btn-ghost" data-onclick="pfClearSig()">' + esc(t('clearBtn')) + '</button></div>'
      + '<div class="pf-fg"><label>' + esc(t('typeSigLabel')) + '</label><input type="text" id="pf_sigTyped" class="pf-sig-typed" placeholder="' + esc(t('typeSigPlaceholder')) + '">'
      + '<div class="pf-signer">' + radios + '</div></div>'
      + '</div>');
  }
  function pfNavHtml() {
    var last = pfState.step >= pfState.forms.length - 1;
    var back = pfState.step > 0 ? '<button type="button" class="pf-btn-ghost pf-nav-back" data-onclick="pfBack()">' + esc(t('backBtn')) + '</button>' : '<span></span>';
    var next = '<button type="button" class="pf-btn" data-onclick="pfNext()">' + (last ? esc(t('submitBtn')) : t('saveContinueBtn')) + '</button>';
    return '<div class="pf-nav">' + back + next + '</div>';
  }
  function pfStepHtml(p) {
    var key = pfState.forms[pfState.step];
    return pfProgressHtml(p) + pfSectionBody(p, key) + pfSignatureCard(key) + pfNavHtml();
  }
  var PRIVACY_VERSION = '2026-08-CTG-MD-1';

  function pfPrivacyHtml() {
    var sec = function (title, body) {
      return '<div class="pf-pn-sec"><h3>' + esc(title) + '</h3>' + body + '</div>';
    };
    var ul = function (items) {
      return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
    };
    return '<div class="pf-pn">'
      + '<div class="pf-pn-head">'
        + '<div class="pf-pn-title">Patient Privacy Notice</div>'
        + '<div class="pf-pn-sub">Please read before continuing</div>'
      + '</div>'
      + '<div class="pf-pn-body">'
        + sec('Privacy and Confidentiality',
            '<p>Concussion Therapy Group, LLC (&ldquo;CTG&rdquo;) is committed to protecting the privacy and '
            + 'confidentiality of your personal and medical information. We collect, use, maintain, and disclose your '
            + 'Protected Health Information (PHI) only as permitted or required by applicable federal and Maryland law, '
            + 'including the Health Insurance Portability and Accountability Act of 1996 (HIPAA), the HIPAA Privacy Rule, '
            + 'the HIPAA Security Rule, and the Maryland Confidentiality of Medical Records Act.</p>')
        + sec('Collection of Information',
            '<p>We collect personal, medical, insurance, and treatment-related information necessary to provide healthcare '
            + 'services, coordinate treatment, communicate with you, process insurance claims, and fulfill our legal and '
            + 'regulatory obligations.</p>')
        + sec('How Your Information May Be Used',
            '<p>Your information may be used or disclosed for purposes including:</p>'
            + ul(['Treatment and coordination of care', 'Scheduling appointments', 'Billing and payment processing',
                 'Healthcare operations', 'Legal or regulatory compliance',
                 'Other purposes authorized by applicable law or your written authorization']))
        + sec('Electronic Health Records',
            '<p>Your medical records are maintained electronically using secure systems designed to protect the '
            + 'confidentiality, integrity, and availability of your health information. Access is restricted to authorized '
            + 'personnel whose job responsibilities require access to your information.</p>')
        + sec('Security Measures',
            '<p>CTG implements administrative, technical, and physical safeguards designed to protect your information '
            + 'against unauthorized access, disclosure, alteration, or destruction. These safeguards include user '
            + 'authentication, role-based access controls, encrypted communications where appropriate, audit logging, and '
            + 'secure storage of electronic records.</p>')
        + sec('Patient Rights',
            '<p>You have the right to:</p>'
            + ul(['Request access to your medical records.', 'Request amendments to your records.',
                 'Request restrictions on certain disclosures.', 'Receive an accounting of certain disclosures.',
                 'Obtain a copy of our Notice of Privacy Practices.',
                 'File a complaint regarding the privacy of your health information without fear of retaliation.']))
        + sec('Consent',
            '<p>By signing this form, you acknowledge that you have received or have been given the opportunity to review '
            + 'Concussion Therapy Group&rsquo;s Notice of Privacy Practices and understand how your protected health '
            + 'information may be used and disclosed in accordance with applicable law.</p>')
      + '</div>'
      + '<div class="pf-pn-foot">'
        + '<label class="pf-pn-agree">'
          + '<input type="checkbox" id="pf_pn_agree" data-onchange="pfPrivacyChanged()">'
          + '<span>I acknowledge that I have received, reviewed, or have had the opportunity to review the Notice of '
          + 'Privacy Practices of Concussion Therapy Group, LLC. I understand that my personal and protected health '
          + 'information will be collected, maintained, used, and disclosed as permitted by applicable federal and '
          + 'Maryland law, including HIPAA and the Maryland Confidentiality of Medical Records Act.</span>'
        + '</label>'
        + '<button type="button" class="pf-pn-btn" id="pf_pn_go" disabled data-onclick="pfPrivacyAccept()">'
        + 'I Agree &mdash; Continue to my forms</button>'
      + '</div></div>';
  }

  function pfPrivacyChanged() {
    var box = document.getElementById('pf_pn_agree');
    var btn = document.getElementById('pf_pn_go');
    if (btn) btn.disabled = !(box && box.checked);
  }

  function pfPrivacyAccept() {
    var box = document.getElementById('pf_pn_agree');
    if (!box || !box.checked) return;
    var p = pfState.patient;
    p.intake = p.intake || {};
    var entry = {
      acknowledgedAt: new Date().toISOString(),
      version: PRIVACY_VERSION,
      acknowledgedBy: 'Patient (secure link)',
      source: 'patient'
    };
    if (!Array.isArray(p.intake.privacyNoticeHistory)) p.intake.privacyNoticeHistory = [];
    p.intake.privacyNoticeHistory.push(entry);
    p.intake.privacyNotice = { acknowledged: true, acknowledgedAt: entry.acknowledgedAt, version: entry.version, acknowledgedBy: entry.acknowledgedBy };
    pfState.dpaAccepted = true;
    pfRenderStep();
  }
  window.pfPrivacyChanged = pfPrivacyChanged;
  window.pfPrivacyAccept = pfPrivacyAccept;

  function pfRenderStep() {
    var view = document.getElementById('patientFormsView');
    if (!view) return;
    // Nothing is collected until the patient has consented.
    if (!pfState.dpaAccepted) {
      // Full-bleed: the notice is long, and squeezing it into the 460px form
      // card would make a legal document that nobody can actually read.
      view.innerHTML = pfPrivacyHtml();
      return;
    }
    pfState.sigHas = false;
    view.innerHTML = pfShell(pfStepHtml(pfState.patient));
    pfMountSignature();
    view.addEventListener('input', pfRefreshPreviews);
    view.addEventListener('change', pfRefreshPreviews);
    pfRefreshPreviews();
    window.scrollTo(0, 0);
  }
  window.pfReSign = function () { pfState.signature = null; pfRenderStep(); };
  window.pfBack = function () { if (pfState.step > 0) { pfState.step--; pfRenderStep(); } };
  window.pfNext = function () {
    var key = pfState.forms[pfState.step];
    if (!pfValidateStep(key)) return;
    // The parent/guardian signature on the Minor Authorization stays with that
    // form only - it must never become the patient's pulled-forward signature.
    var sig = pfCurrentSig();
    if (sig && key !== 'minorAuth') pfState.signature = sig;
    pfSaveStep(key);
    if (pfState.step >= pfState.forms.length - 1) { pfFinalize(); return; }
    pfState.step++;
    pfRenderStep();
  };
  function pfValidateStep(key) {
    if (key === 'demographics' && (!val('pf_firstName') || !val('pf_lastName'))) { pfToast(t('toastName')); return false; }
    if (key === 'intakeForm' && !(document.getElementById('pf_consentAgree') || {}).checked) {
      pfToast(t('toastConsent'));
      var chk = document.getElementById('pf_consentAgree');
      if (chk) { var lbl = chk.closest('.pf-check') || chk; lbl.scrollIntoView({ behavior: 'smooth', block: 'center' }); lbl.classList.add('pf-flash'); setTimeout(function () { lbl.classList.remove('pf-flash'); }, 1600); }
      return false;
    }
    if (key === 'minorAuth' && !val('pf_childName')) { pfToast(t('toastChildName')); return false; }
    if (!pfCurrentSig()) { pfToast(t('toastSign')); return false; }
    return true;
  }

  /* ---------- Signature pad ---------- */
  function pfMountSignature() {
    var c = document.getElementById('pf_sig'); if (!c) return;
    var ctx = c.getContext('2d'); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    var drawing = false;
    function pos(e) { var r = c.getBoundingClientRect(); var q = e.touches ? e.touches[0] : e; return { x: (q.clientX - r.left) * (c.width / r.width), y: (q.clientY - r.top) * (c.height / r.height) }; }
    function s(e) { e.preventDefault(); drawing = true; var q = pos(e); ctx.beginPath(); ctx.moveTo(q.x, q.y); }
    function mv(e) { if (!drawing) return; e.preventDefault(); var q = pos(e); ctx.lineTo(q.x, q.y); ctx.stroke(); pfState.sigHas = true; }
    function en() { var was = drawing; drawing = false; if (was) pfRefreshPreviews(); }
    c.onmousedown = s; c.onmousemove = mv; c.onmouseup = en; c.onmouseleave = en;
    c.ontouchstart = s; c.ontouchmove = mv; c.ontouchend = en;
  }
  window.pfClearSig = function () { var c = document.getElementById('pf_sig'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); pfState.sigHas = false; pfRefreshPreviews(); };

  /* ---------- Live document preview ----------
     Reuses the intake PDF generators (intake.js). Field edits are written into
     the in-memory patient record (not persisted until submit), then the matching
     document is regenerated so the patient reads exactly what they'll sign. */
  var pfPreviewUrls = {};
  var pfPrevTimer = null;
  // The signature for the current page: the pad/typed field if shown, else the
  // signature pulled forward from an earlier page.
  function pfCurrentSig() {
    var key = pfState.forms[pfState.step];
    var isMinor = key === 'minorAuth';
    var padC = document.getElementById('pf_sig');
    var typedEl = document.getElementById('pf_sigTyped');
    var signer = (document.querySelector('input[name="pf_signer"]:checked') || {}).value || (!isMinor && pfState.signature && pfState.signature.signer) || (isMinor ? 'Parent' : 'Patient');
    if (padC && pfState.sigHas) return { type: 'drawn', data: padC.toDataURL('image/png'), signer: signer };
    if (typedEl && typedEl.value.trim()) return { type: 'typed', data: typedEl.value.trim(), signer: signer };
    // Minor Authorization never inherits the patient's pulled signature.
    return isMinor ? null : (pfState.signature || null);
  }
  // Write one form's fields + signature into the record (in-memory; persisted on
  // finalize). Only touches fields that are present in the current DOM, so a step
  // never blanks another form's data.
  function pfSaveStep(key) {
    var p = pfState.patient; if (!p) return;
    if (!p.intake) p.intake = (typeof intakeEnsure === 'function') ? intakeEnsure(p) : { demographics: {}, pip: {}, attorney: {}, consent: {}, minorAuth: {} };
    if (!p.intake.demographics) p.intake.demographics = {};
    if (!p.intake.pip) p.intake.pip = {};
    if (!p.intake.attorney) p.intake.attorney = {};
    var sig = pfCurrentSig();
    var now = new Date().toISOString();
    if (key === 'demographics' && document.getElementById('pf_firstName')) {
      p.demographics = Object.assign({}, p.demographics, {
        firstName: val('pf_firstName'), lastName: val('pf_lastName'), dob: val('pf_dob'), gender: val('pf_gender'),
        addressLine: val('pf_addr1'), cityStateZip: val('pf_csz'), email: val('pf_email'), mobile: val('pf_mobile')
      });
      p.intake.demographics = Object.assign({}, p.intake.demographics, { addressLine2: val('pf_addr2'), emergencyContactName: val('pf_emgName'), emergencyNumber: val('pf_emgNum') });
    }
    if (key === 'insurance' && document.getElementById('pf_hasPip')) {
      p.intake.pip = Object.assign({}, p.intake.pip, { hasPip: val('pf_hasPip'), autoInsuranceCompany: val('pf_autoIns'), pipClaimNumber: val('pf_pipClaim'), policyNumber: val('pf_policyNo'), adjusterName: val('pf_adjName'), adjusterPhone: val('pf_adjPhone'), driverName: val('pf_driver') });
      p.intake.attorney = Object.assign({}, p.intake.attorney, { lawFirm: val('pf_lawFirm'), attorneyName: val('pf_attyName'), phone: val('pf_attyPhone') });
      /* Mirrored onto the in-memory chart so the live PDF preview and the
         compiled document show what the patient just typed. The server keeps
         the chart's own law firm authoritative (see routes/patientForms.js);
         the answer itself travels in the intake record above. */
      p.demographics = Object.assign({}, p.demographics, { lawFirm: val('pf_lawFirm') });
    }
    if (key === 'intakeForm') {
      p.intake.consent = { signedBy: sig && sig.signer === 'Guardian' ? 'Guardian' : 'Patient', signatureType: sig ? sig.type : '', signatureData: sig ? sig.data : '', signedAt: sig ? now : ((p.intake.consent && p.intake.consent.signedAt) || '') };
    }
    if (key === 'minorAuth' && document.getElementById('pf_childName')) {
      p.intake.minorAuth = Object.assign({}, p.intake.minorAuth, {
        childName: val('pf_childName'), childDob: val('pf_childDob'), parentName: val('pf_parentName'), parentDob: val('pf_parentDob'),
        guardianName: val('pf_guardianName'), guardianDob: val('pf_guardianDob'),
        signedBy: sig && sig.signer === 'Guardian' ? 'Guardian' : 'Parent', signatureType: sig ? sig.type : '', signatureData: sig ? sig.data : '', signedAt: sig ? now : ((p.intake.minorAuth && p.intake.minorAuth.signedAt) || '')
      });
    }
    // Uniform per-form signature record, so demographics/insurance carry one too.
    if (sig) { p.formSignatures = p.formSignatures || {}; p.formSignatures[key] = { signer: sig.signer, type: sig.type, data: sig.data, signedAt: now }; }
  }
  function pfGenFor(key) {
    if (key === 'aobShort') return typeof intakeGenerateAobShortBlob === 'function' ? intakeGenerateAobShortBlob : null;
    if (key === 'aobLong') return typeof intakeGenerateAobLongBlob === 'function' ? intakeGenerateAobLongBlob : null;
    if (key === 'minorAuth') return typeof intakeGenerateMinorAuthBlob === 'function' ? intakeGenerateMinorAuthBlob : null;
    return typeof intakeGeneratePdfBlob === 'function' ? intakeGeneratePdfBlob : null;
  }
  function pfSetPreview(frameId, genFn) {
    if (typeof genFn !== 'function') return;
    var p = pfState.patient; if (!p || !p.intake) return;
    genFn(p, p.intake).then(function (blob) {
      var fr = document.getElementById(frameId); if (!fr) return;
      var url = URL.createObjectURL(blob);
      if (pfPreviewUrls[frameId]) { try { URL.revokeObjectURL(pfPreviewUrls[frameId]); } catch (e) {} }
      pfPreviewUrls[frameId] = url; fr.src = url;
    }).catch(function () {});
  }
  function pfRefreshPreviews() {
    clearTimeout(pfPrevTimer);
    pfPrevTimer = setTimeout(function () {
      var key = pfState.forms[pfState.step];
      pfSaveStep(key); // write the current page's live values into the record
      if (key === 'intakeForm') {
        var doc = (document.getElementById('pf_intakeDocSel') || {}).value || 'intake';
        pfSetPreview('pf_prev_doc', pfGenFor(doc));
      }
      if (key === 'minorAuth') pfSetPreview('pf_prev_minor', pfGenFor('minorAuth'));
    }, 350);
  }

  /* ---------- Finalize (last step) ---------- */
  function pfDoneHtml() {
    return '<div class="pf-card pf-done"><div class="pf-done-ico">✓</div>'
      + '<div class="pf-done-title">' + esc(t('doneTitle')) + '</div>'
      + '<div class="pf-done-sub">' + esc(t('doneSub')) + '</div></div>';
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function pfFinalize() {
    var p = pfState.patient; if (!p) return;
    // The last step's fields + signature were already saved by pfNext.
    p.formSubmission = { submittedAt: new Date().toISOString(), forms: pfState.forms.slice(), token: pfState.token };
    if (Array.isArray(p.invites) && pfState.token) {
      p.invites.forEach(function (inv) { if (inv.token === pfState.token) inv.completedAt = p.formSubmission.submittedAt; });
    }
    p.updatedAt = p.formSubmission.submittedAt;
    // On a patient's device the answers must go to the clinic, not to this
    // browser's storage - that is the point of the link. Only fall back
    // to local persistence when staff are previewing inside the portal.
    if (pfState.token) {
      pfSubmitToServer(p.intake || {}, p.demographics || {}, function (ok, err) {
        if (!ok) {
          var view = document.getElementById('pfView');
          if (view) view.innerHTML = pfShell(pfError(err || 'We could not submit your forms. Please try again.'));
          pfState.doneScreen = false;
        }
      });
    } else {
      pfPersist();
    }
    // Nudge any open staff tab (same browser) to reload & re-render - the tiny
    // signal key always fits localStorage even when the patient record doesn't.
    try { localStorage.setItem('ctg_forms_signal', String(Date.now())); } catch (e) {}

    pfState.doneScreen = true;
    document.getElementById('patientFormsView').innerHTML = pfShell(pfDoneHtml());
    window.scrollTo(0, 0);
  }

  // Toast must live inside #patientFormsView - the staff toast container (and any
  // other body child) is hidden by pf-mode, so showToast would be invisible here.
  function pfToast(msg) {
    var host = document.getElementById('patientFormsView') || document.body;
    var t = document.getElementById('pfToast');
    if (!t) { t = document.createElement('div'); t.id = 'pfToast'; t.className = 'pf-toast'; host.appendChild(t); }
    else if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg; t.classList.add('show');
    clearTimeout(pfToast._t); pfToast._t = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
