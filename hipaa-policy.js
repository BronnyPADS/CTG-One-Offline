(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var EFFECTIVE = 'August 5, 2026';

  /* Section bodies. Kept as data rather than one giant HTML string so the
     numbering can never drift out of step with the headings. */
  var SECTIONS = [
    ['PURPOSE',
      ['Concussion Therapy Group, LLC (CTG) is committed to protecting the privacy, confidentiality, integrity, and availability of Protected Health Information (PHI).',
       'This HIPAA Privacy, Security, and Authorized User Policy establishes requirements for authorized users who access, use, maintain, transmit, or otherwise handle PHI through the CTG Portal or related CTG systems.',
       'This Policy applies to authorized:'],
      ['Law-firm personnel;', 'Healthcare providers;', 'Clinical personnel;', 'CTG employees;',
       'Authorized contractors;', 'Technical-support personnel;', 'Information-technology personnel;',
       'System administrators; and', 'Other individuals approved by CTG.'],
      ['The CTG Portal is not intended for direct patient use.',
       'This Policy is intended to support CTG’s privacy and security practices. Compliance with this Policy is required for all authorized users.']],

    ['DEFINITIONS',
      ['<strong>Protected Health Information (PHI)</strong> means individually identifiable health information that is created, received, maintained, or transmitted by CTG and is protected under applicable HIPAA requirements. PHI may include:'],
      ['Patient names;', 'Dates of birth;', 'Addresses;', 'Telephone numbers;', 'Email addresses;',
       'Medical-record information;', 'Diagnoses;', 'Symptoms;', 'Treatment information;', 'Clinical notes;',
       'Assessment results;', 'Appointment information;', 'Healthcare-provider communications;',
       'Legal or case-related healthcare records; and',
       'Other information that may identify a patient and relate to healthcare services.'],
      ['<strong>Authorized User</strong> — an individual who has received approval from CTG to access the Portal or related CTG systems for a legitimate professional, clinical, legal, technical, administrative, or operational purpose.',
       '<strong>Minimum Necessary</strong> — accessing, using, disclosing, or requesting only the amount of PHI reasonably necessary to complete an authorized task.',
       '<strong>Security Incident</strong> — an attempted or successful unauthorized access, use, disclosure, modification, destruction, loss, or interference involving PHI or CTG systems.']],

    ['HIPAA PRIVACY REQUIREMENTS',
      ['Authorized users must protect PHI and use or disclose it only when permitted or required by applicable law and CTG policy. Authorized users must:'],
      ['Access PHI only for an authorized purpose;',
       'Use only the minimum information reasonably necessary for the assigned task;',
       'Maintain the confidentiality of PHI;', 'Prevent unauthorized access, use, or disclosure;',
       'Follow CTG privacy procedures;', 'Use approved systems and communication methods;',
       'Protect PHI from improper viewing, copying, downloading, transmission, or storage; and',
       'Report suspected privacy concerns promptly.'],
      ['Authorized users may not access PHI out of curiosity, personal interest, convenience, or any purpose outside their authorized responsibilities.']],

    ['ROLE-BASED ACCESS',
      ['CTG may use role-based access controls to limit Portal access according to each user’s responsibilities. Access may be assigned based on:'],
      ['Professional role;', 'Job responsibilities;', 'Clinical responsibilities;',
       'Legal or case-related authorization;', 'Technical-support responsibilities;',
       'Contractual responsibilities;', 'Patient authorization, when required; and',
       'Other approved operational needs.'],
      ['Authorized users may access only the information and Portal functions assigned to their role. Users must not attempt to obtain access beyond their assigned permissions.']],

    ['LAW-FIRM ACCESS TO PHI',
      ['Authorized law-firm personnel may access PHI only when:'],
      ['The law firm has a valid professional relationship with the patient or authorized matter;',
       'Appropriate patient authorization, legal authority, or another valid basis for access exists;',
       'Access is necessary for an authorized legal or case-related purpose; and',
       'The use or disclosure is consistent with applicable privacy requirements.'],
      ['Law-firm personnel must limit access to authorized personnel; use PHI only for the authorized matter; maintain appropriate confidentiality safeguards; protect downloaded or received information; avoid using PHI for unrelated cases, marketing, or solicitation; and notify CTG when access is no longer required.']],

    ['HEALTHCARE-PROVIDER ACCESS TO PHI',
      ['Healthcare providers and clinical personnel may access PHI only for authorized purposes, including:'],
      ['Treatment;', 'Care coordination;', 'Clinical consultation;', 'Referral;', 'Clinical review;',
       'Continuity of care;', 'Authorized healthcare operations; or',
       'Another permitted healthcare-related purpose.'],
      ['Healthcare users must use appropriate professional judgment; access only information relevant to their responsibilities; maintain patient confidentiality; follow applicable professional standards; document information accurately when authorized; and avoid altering or deleting records without appropriate authority.']],

    ['TECHNICAL-SUPPORT ACCESS TO PHI',
      ['Technical-support and information-technology personnel may access PHI only when reasonably necessary to:'],
      ['Resolve an approved technical issue;', 'Maintain or secure CTG systems;',
       'Investigate a security or access issue;', 'Perform authorized maintenance;',
       'Troubleshoot an approved system problem; or', 'Complete another authorized technical task.'],
      ['Technical-support personnel must use the least amount of access reasonably necessary; avoid viewing patient information unless required for the task; avoid copying, downloading, or retaining PHI unless specifically authorized; use approved support tools; limit access to the time necessary; document support activity when required; and remove temporary or elevated access once the task is complete.',
       'PHI may not be used for demonstrations, personal learning, testing, or training unless specifically approved and appropriately controlled.']],

    ['USER AUTHENTICATION AND ACCOUNT SECURITY',
      ['Each authorized user must have an individual account. Users must:'],
      ['Keep usernames, passwords, authentication codes, and access credentials confidential;',
       'Use strong and unique passwords;', 'Use multi-factor authentication when required;',
       'Never share accounts or credentials;', 'Log out after using the Portal;',
       'Protect devices used to access CTG systems;',
       'Avoid saving credentials on public or shared devices;',
       'Promptly report suspected credential compromise; and',
       'Follow CTG account-management procedures.'],
      ['Shared accounts are prohibited unless CTG has approved a documented exception.']],

    ['DEVICE, WORKSTATION, AND NETWORK SECURITY',
      ['Authorized users must take reasonable steps to protect devices and workstations used to access PHI. Users must:'],
      ['Use secure and reasonably up-to-date devices;', 'Apply available security updates;',
       'Use appropriate antivirus or endpoint-protection tools when applicable;',
       'Lock devices when unattended;', 'Prevent unauthorized individuals from viewing PHI;',
       'Avoid accessing PHI through public or unsecured networks when reasonably possible;',
       'Use secure connections when available;',
       'Avoid storing PHI on personal devices unless specifically authorized; and',
       'Secure or properly dispose of printed information containing PHI.'],
      ['Users must not leave PHI visible on unattended screens or in locations where unauthorized persons may view it.']],

    ['APPROVED COMMUNICATIONS',
      ['PHI must be transmitted only through approved methods. Authorized users must not send PHI through:'],
      ['Personal email accounts;', 'Unauthorized messaging applications;',
       'Unapproved cloud-storage services;', 'Personal file-sharing platforms; or',
       'Other unsecured or unauthorized communication methods.'],
      ['Users must verify the recipient before sending PHI and take reasonable steps to avoid sending information to the wrong person.']],

    ['DOWNLOADING, COPYING, PRINTING, AND STORAGE',
      ['PHI may be downloaded, copied, printed, or stored only when the activity is authorized, the information is necessary for an approved purpose, the method is consistent with CTG procedures, appropriate safeguards are used, and the information is protected from unauthorized access. Users must not:'],
      ['Store PHI in personal cloud accounts;', 'Store PHI on unapproved personal devices;',
       'Leave printed PHI unattended;', 'Photograph or screenshot PHI unless authorized;',
       'Copy PHI for personal use; or', 'Retain PHI longer than necessary or permitted.'],
      []],

    ['AUDIT LOGS AND MONITORING',
      ['CTG may record, monitor, review, and retain Portal activity. Audit information may include:'],
      ['User identity;', 'Login and logout activity;', 'Dates and times of access;',
       'Patient records accessed;', 'Searches performed;', 'Information viewed;',
       'Information created or modified;', 'Downloads, printing, or transmission activity;',
       'Account changes;', 'Administrative actions; and', 'Security-related events.'],
      ['CTG may review audit information for privacy and security monitoring, operational purposes, quality assurance, access verification, investigation of suspected violations, and other authorized purposes.']],

    ['PRIVACY AND SECURITY INCIDENT REPORTING',
      ['Authorized users must promptly report suspected or confirmed:'],
      ['Unauthorized access to PHI;', 'Unauthorized use or disclosure of PHI;',
       'Lost or stolen devices;', 'Compromised passwords or credentials;',
       'Misrouted emails, files, or communications;', 'Incorrect Portal permissions;',
       'Unauthorized downloads or transmissions;', 'Malware or ransomware;',
       'Suspicious Portal activity; or', 'Any other potential privacy or security incident.'],
      ['Reports should be made to CTG’s designated Privacy Officer, Security Officer, or Portal Administrator as soon as reasonably possible. Users must cooperate with reasonable investigation and response procedures, and must not attempt to conceal, delete, alter, or destroy information related to a suspected incident.']],

    ['SANCTIONS FOR VIOLATIONS',
      ['Failure to comply with this Policy may result in corrective action, including:'],
      ['Additional training;', 'Written warning;', 'Restriction of Portal access;',
       'Temporary suspension;', 'Permanent termination of access;',
       'Employment or contract action;',
       'Referral to an applicable organization or licensing authority; or',
       'Other action permitted by applicable law or contractual requirements.'],
      ['CTG may take action based on the nature, severity, frequency, and circumstances of the violation.']],

    ['RETENTION AND DISPOSAL',
      ['PHI must be retained, stored, and disposed of according to CTG’s approved record-retention and information-management procedures. When PHI is no longer needed and disposal is authorized, it must be destroyed or disposed of in a manner designed to prevent unauthorized access or reconstruction. Approved disposal methods may include:'],
      ['Secure shredding;', 'Secure deletion;', 'Approved electronic destruction procedures; or',
       'Other authorized methods.'],
      []],

    ['PRIVACY AND SECURITY TRAINING',
      ['Authorized users may be required to complete privacy, security, confidentiality, or Portal-access training before receiving access and periodically thereafter. Users must complete required training within the timeframe established by CTG. Failure to complete required training may result in delayed, restricted, suspended, or terminated Portal access.'],
      [], []],

    ['BUSINESS ASSOCIATES AND THIRD-PARTY SERVICE PROVIDERS',
      ['CTG may use third-party service providers to support Portal hosting, technology, telehealth, data storage, security, communications, or other operations. When applicable, CTG may require appropriate agreements and safeguards before a third party performs services involving PHI on CTG’s behalf. Third-party users must comply with applicable contractual, privacy, security, and confidentiality requirements.'],
      [], []],

    ['POLICY UPDATES',
      ['CTG may revise this Policy to reflect changes in CTG operations, Portal technology, privacy or security practices, user roles, organizational requirements, or applicable legal or regulatory requirements. Updated versions may be posted in the Portal or communicated through another approved method.'],
      [], []],

    ['CONTACT INFORMATION',
      ['Questions or reports regarding privacy, security, PHI, or this Policy should be directed to Concussion Therapy Group, LLC (CTG) — Privacy Officer, Security Officer, or Portal Administrator.'],
      [], []]
  ];

  var ACK_POINTS = [
    'I understand that the CTG Portal may contain Protected Health Information (“PHI”) and other confidential information.',
    'I will access and use PHI only for an authorized purpose and only to the extent necessary for my assigned role or approved task.',
    'I will protect PHI from unauthorized access, use, disclosure, copying, transmission, or storage.',
    'I will keep my Portal username, password, authentication information, and other access credentials secure and confidential.',
    'I will not share my account or allow another person to use my Portal credentials.',
    'I will use only CTG-approved systems, devices, and communication methods when handling PHI.',
    'I understand that Portal activity may be recorded, monitored, reviewed, and audited for privacy, security, operational, and compliance purposes.',
    'I will promptly report any suspected or confirmed unauthorized access, privacy concern, security incident, lost device, compromised credential, or improper disclosure of PHI.',
    'I understand that failure to comply with CTG’s HIPAA privacy and security requirements may result in restricted, suspended, or terminated Portal access and other appropriate corrective action.',
    'I understand that my confidentiality and information-security obligations continue after my Portal access ends.',
    'I confirm that I have read, understood, and agree to comply with the CTG HIPAA Privacy, Security, and Authorized User Policy.'
  ];

  function sectionHtml(sec, i) {
    var paras = (sec[1] || []).map(function (p) { return '<p>' + p + '</p>'; }).join('');
    var bullets = (sec[2] || []).length
      ? '<ul>' + sec[2].map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '';
    var after = (sec[3] || []).map(function (p) { return '<p>' + p + '</p>'; }).join('');
    return '<section class="hp-sec"><h3><span>' + (i + 1) + '</span>' + esc(sec[0]) + '</h3>'
      + paras + bullets + after + '</section>';
  }

  var state = { version: '', busy: false };

  function render(user) {
    var el = document.getElementById('ctgPolicyGate') || (function () {
      var d = document.createElement('div');
      d.id = 'ctgPolicyGate';
      document.body.appendChild(d);
      return d;
    })();
    el.className = 'hp-gate';
    el.innerHTML =
      '<div class="hp-shell">'
      + '<header class="hp-head">'
        + '<div class="hp-brand">Concussion Therapy <span>Group</span>, LLC</div>'
        + '<h1>HIPAA Privacy, Security, and Authorized User Policy</h1>'
        + '<div class="hp-meta">Effective ' + esc(EFFECTIVE) + ' · Last updated ' + esc(EFFECTIVE)
          + (user && (user.displayName || user.username)
              ? ' · Signed in as ' + esc(user.displayName || user.username) : '')
        + '</div>'
      + '</header>'
      + '<div class="hp-body" id="hpBody">'
        + SECTIONS.map(sectionHtml).join('')
        + '<section class="hp-sec hp-ack">'
          + '<h3><span>✓</span>AUTHORIZED USER HIPAA ACKNOWLEDGMENT</h3>'
          + '<p>By selecting “I Agree”, signing electronically, receiving Portal access, logging into '
          + 'the CTG Portal, or continuing to use the Portal, I acknowledge and agree that:</p>'
          + '<ul>' + ACK_POINTS.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>'
        + '</section>'
      + '</div>'
      + '<footer class="hp-foot">'
        + '<label class="hp-check">'
          + '<input type="checkbox" id="hpAgree" data-onchange="ctgPolicyToggle()">'
          + '<span>I have read, understood, and agree to comply with the CTG HIPAA Privacy, '
          + 'Security, and Authorized User Policy.</span>'
        + '</label>'
        + '<div class="hp-actions">'
          + '<div class="hp-err" id="hpErr"></div>'
          + '<button type="button" class="hp-out" data-onclick="ctgPolicyDecline()">Sign out</button>'
          + '<button type="button" class="hp-go" id="hpGo" disabled data-onclick="ctgPolicyAccept()">I Agree — Continue</button>'
        + '</div>'
      + '</footer>'
      + '</div>';
    document.body.classList.add('hp-open');
  }

  window.ctgPolicyToggle = function () {
    var c = document.getElementById('hpAgree'), b = document.getElementById('hpGo');
    if (c && b) b.disabled = !c.checked || state.busy;
  };

  window.ctgPolicyDecline = function () {
    // Declining is a legitimate choice; it just means no Portal access.
    if (typeof window.logout === 'function') window.logout();
    else location.reload();
  };

  window.ctgPolicyAccept = function () {
    var c = document.getElementById('hpAgree');
    var b = document.getElementById('hpGo');
    var err = document.getElementById('hpErr');
    if (!c || !c.checked || state.busy) return;
    state.busy = true;
    if (b) { b.disabled = true; b.textContent = 'Recording…'; }
    if (err) err.textContent = '';
    window.ctgApiFetch('/api/policy/accept', {
      method: 'POST',
      body: JSON.stringify({ agreed: true, version: state.version })
    }).then(function () {
      state.busy = false;
      close();
      if (typeof window.ctgPolicyOnAccepted === 'function') window.ctgPolicyOnAccepted();
    }).catch(function (e) {
      state.busy = false;
      if (b) { b.disabled = false; b.textContent = 'I Agree — Continue'; }
      if (err) err.textContent = (e && e.message) || 'Could not record your acknowledgement. Please try again.';
    });
  };

  function close() {
    var el = document.getElementById('ctgPolicyGate');
    if (el) el.remove();
    document.body.classList.remove('hp-open');
  }

  /* Read-only view of the same policy, opened from the footer. Uses the one
     copy of the text above rather than a duplicate, so the document staff can
     re-read is always exactly the one they accepted. */
  window.ctgShowPolicy = function () {
    render((window.ctgCurrentUser && window.ctgCurrentUser()) || null);
    var foot = document.querySelector('#ctgPolicyGate .hp-foot');
    if (foot) {
      foot.innerHTML = '<div class="hp-actions hp-actions-read">'
        + '<div class="hp-err"></div>'
        + '<button type="button" class="hp-go" data-onclick="ctgClosePolicy()">Close</button></div>';
    }
    var head = document.querySelector('#ctgPolicyGate .hp-meta');
    if (head) head.insertAdjacentHTML('beforeend', ' &middot; You accepted this policy when you signed in');
  };
  window.ctgClosePolicy = function () { close(); };

  /* Ask the SERVER whether this user still owes an acknowledgement.
     Resolves true when the portal may proceed. */
  window.ctgPolicyGate = function (user) {
    return window.ctgApiFetch('/api/policy/status').then(function (s) {
      state.version = s.version || '';
      if (s.accepted) return true;
      render(user);
      return false;
    }).catch(function () {
      /* If the check itself fails we do not silently let people through - but
         nor do we lock out the portal over a blip. Showing the policy is the
         safe direction: worst case someone accepts twice. */
      render(user);
      return false;
    });
  };
})();
