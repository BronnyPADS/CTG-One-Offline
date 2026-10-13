(function () {
  'use strict';

  // Ordered most-specific first; the first match wins.
  const RULES = [
    // --- identity -------------------------------------------------------
    { re: /(first|last|middle|maiden)[_-]?name|^(regFirst|regLast|apptNewFirst|apptNewLast)/i, max: 80 },
    { re: /display[_-]?name|full[_-]?name|patient[_-]?name|^ptName$|reporter|translator|completedBy/i, max: 100 },
    { re: /user[_-]?name|^acUsername$|^authUser$/i, max: 60 },
    { re: /^(mrn)$|[_-]?mrn$|mrn[_-]?/i, max: 30 },

    // --- contact --------------------------------------------------------
    // RFC 5321 caps an address at 254; patients.email is NVARCHAR(200).
    { re: /e-?mail/i, max: 200 },
    // Room for "+63 917 555 0134 ext. 2201" - the "allowance" for extensions.
    { re: /phone|mobile|tel$|telephone|^msgMobile$|fax/i, max: 25 },

    // --- address --------------------------------------------------------
    { re: /address[_-]?line|^street|address2|addressLine2/i, max: 150 },
    { re: /city[_-]?state[_-]?zip/i, max: 120 },
    { re: /^city$|[_-]city$/i, max: 80 },
    { re: /^state$|[_-]state$|province/i, max: 20 },
    { re: /zip|postal/i, max: 12 },

    // --- clinical / scheduling reference data ---------------------------
    { re: /facility|provider|room|visit[_-]?type|schedule|category|specialty|department/i, max: 80 },
    { re: /law[_-]?firm|^acNewLawFirmName$|attorney|adjuster|employer/i, max: 150 },
    { re: /diagnosis|dx$|icd|^moiDx$|otherDx|otherPsychDx/i, max: 200 },
    // Dates typed into a text box behind a custom picker. The MM/DD/YYYY
    // placeholder is this app's convention for exactly that; matching it
    // catches the ones whose ids don't end in "Date".
    { re: /^(doi|dos)$|date[_-]?of[_-]?(injury|birth|service)|dob$|date$|^MM\/DD\/YYYY$/i, max: 10 },

    { re: /^HH:MM( ?AM)?$|^dnTime$|[_-]?time$|start[_-]?time|end[_-]?time/i, max: 10 },

    // --- money / counts -------------------------------------------------
    { re: /amount|charges|payment|balance|^wcAmount$|copay|deductible/i, max: 14, filter: 'money' },
    { re: /^ptAge$|^age$|units|quantity|^qty$/i, max: 5, filter: 'digits' },

    // --- messaging ------------------------------------------------------
    // 1600 chars is the hard ceiling for a concatenated SMS.
    { re: /^msgBody$|sms[_-]?body|message[_-]?body/i, max: 1600 },
    { re: /subject/i, max: 200 },

    // --- free text ------------------------------------------------------
    { re: /note|comment|goal|remark|reason|description|summary|duties|instructions|recommendation|impression|history/i, max: 5000 },
    { re: /describ|specify|explain|detail|[_-]?other$|^other|indication/i, max: 500 },
    { re: /label|title|agenda/i, max: 300 },
    { re: /search|filter|query/i, max: 100 },
    { re: /^(authCode|otp|code)$|verification/i, max: 6, filter: 'digits' }
  ];

  // Applied when nothing above matches, keyed on the input's type.
  const BY_TYPE = {
    email: 200,
    tel: 25,
    password: 128,   // bcrypt only reads the first 72 bytes; the rest is slack
    search: 100,
    url: 500,
    number: 15,
    text: 200
  };
  const TEXTAREA_DEFAULT = 5000;

  const FILTERS = {
    digits: /[^0-9]/g,
    money: /[^0-9.,-]/g
  };

  function limitFor(el) {
    const tag = (el.tagName || '').toLowerCase();
    // Each attribute is tested on its own rather than concatenated, so that
    // anchored patterns like /^msgBody$/ still work - joining them into one
    // string silently defeats every ^...$ rule below.
    const keys = [el.id, el.name, el.getAttribute('placeholder'),
                  el.getAttribute('data-field'), el.getAttribute('aria-label')]
                 .filter(Boolean);
    // Rules are the outer loop, so the most specific rule still wins no matter
    // which attribute happens to carry the match.
    for (let i = 0; i < RULES.length; i++) {
      for (let k = 0; k < keys.length; k++) {
        if (RULES[i].re.test(keys[k])) return RULES[i];
      }
    }
    if (tag === 'textarea') return { max: TEXTAREA_DEFAULT };
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return BY_TYPE[type] ? { max: BY_TYPE[type] } : null;
  }

  // Types where maxLength is meaningless or actively harmful (date/time
  // pickers, checkboxes, file choosers, buttons).
  const SKIP_TYPES = /^(button|submit|reset|checkbox|radio|file|hidden|date|time|datetime-local|month|week|color|range|image)$/;

  function apply(el) {
    if (!el || el.dataset.limitApplied) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;
    if (tag === 'input' && SKIP_TYPES.test((el.getAttribute('type') || 'text').toLowerCase())) return;

    el.dataset.limitApplied = '1';

    // Never override a limit the owning module set.
    const existing = parseInt(el.getAttribute('maxlength'), 10);
    const rule = limitFor(el);
    if (!rule) return;
    if (!(existing > 0)) el.setAttribute('maxlength', String(rule.max));

    if (rule.filter && FILTERS[rule.filter]) {
      el.addEventListener('input', function () {
        const clean = el.value.replace(FILTERS[rule.filter], '');
        if (clean !== el.value) {
          // Keep the caret where the user left it instead of jumping to the end.
          const pos = el.selectionStart - (el.value.length - clean.length);
          el.value = clean;
          try { el.setSelectionRange(pos, pos); } catch (e) { /* unsupported type */ }
        }
      });
    }
  }

  function sweep(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input, textarea').forEach(apply);
  }

  let pending = false;
  function scheduleSweep() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; sweep(document); });
  }

  function start() {
    sweep(document);
    // Most of this app renders forms on demand (opening a patient, switching
    // chart tabs, adding a table row), so a one-shot pass at load would only
    // ever cover the login screen.
    new MutationObserver(function (records) {
      for (let i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) { scheduleSweep(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.ctgApplyInputLimits = sweep;
})();
