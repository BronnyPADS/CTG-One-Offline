/* CTG One — custom dropdown panel (progressive enhancement).

   The real <select> stays the visible trigger AND the source of truth: forms,
   value, cascades and every existing change/input handler keep working exactly
   as before. We only intercept the select's native popup (preventDefault on
   mousedown) and show our own rounded, portal-blue panel instead. Choosing an
   item sets the native value and fires native change/input events, so nothing
   downstream can tell the difference. If anything throws, we bail and the native
   dropdown still works. CSP-safe: listeners only, no inline handlers. */
(function () {
  var openPanel = null, openSel = null, hlIndex = -1;

  function closePanel() {
    if (!openPanel) return;
    try { openPanel.remove(); } catch (e) {}
    openPanel = null; openSel = null; hlIndex = -1;
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('scroll', onScrollAway, true);
    window.removeEventListener('resize', closePanel);
  }

  function onDocDown(e) {
    if (openPanel && !openPanel.contains(e.target) && e.target !== openSel) closePanel();
  }
  function onScrollAway(e) {
    if (openPanel && !openPanel.contains(e.target)) closePanel();
  }

  function buildPanel(sel) {
    var panel = document.createElement('div');
    panel.className = 'ctg-sel-panel';
    panel.setAttribute('role', 'listbox');
    var opts = sel.options;
    for (var i = 0; i < opts.length; i++) {
      (function (o, idx) {
        var it = document.createElement('div');
        it.className = 'ctg-sel-opt';
        it.textContent = o.textContent;
        it.setAttribute('role', 'option');
        if (o.disabled) it.classList.add('disabled');
        if (idx === sel.selectedIndex) { it.classList.add('sel'); it.setAttribute('aria-selected', 'true'); }
        it.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          if (o.disabled) return;
          choose(sel, idx);
        });
        it.addEventListener('mouseenter', function () { setHl(panel, idx); });
        panel.appendChild(it);
      })(opts[i], i);
    }
    return panel;
  }

  function positionPanel(sel, panel) {
    var r = sel.getBoundingClientRect();
    var vh = window.innerHeight;
    var below = vh - r.bottom - 10, above = r.top - 10;
    var openUp = below < 220 && above > below;
    var maxH = Math.max(150, Math.min(340, openUp ? above : below));
    panel.style.left = Math.round(r.left) + 'px';
    panel.style.width = Math.round(r.width) + 'px';
    panel.style.maxHeight = maxH + 'px';
    if (openUp) { panel.style.top = 'auto'; panel.style.bottom = Math.round(vh - r.top + 6) + 'px'; }
    else { panel.style.bottom = 'auto'; panel.style.top = Math.round(r.bottom + 6) + 'px'; }
  }

  function open(sel) {
    closePanel();
    var panel = buildPanel(sel);
    document.body.appendChild(panel);
    openPanel = panel; openSel = sel;
    positionPanel(sel, panel);
    hlIndex = sel.selectedIndex;
    if (hlIndex >= 0 && panel.children[hlIndex]) panel.children[hlIndex].classList.add('hl');
    scrollToHl(panel, hlIndex);
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('scroll', onScrollAway, true);
    window.addEventListener('resize', closePanel);
  }

  function setHl(panel, i) {
    var kids = panel.children;
    for (var j = 0; j < kids.length; j++) kids[j].classList.toggle('hl', j === i);
    hlIndex = i;
  }
  function scrollToHl(panel, i) {
    var el = panel.children[i];
    if (el) try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function choose(sel, i) {
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closePanel();
    try { sel.focus(); } catch (e) {}
  }

  function moveHl(dir) {
    if (!openPanel) return;
    var n = openPanel.children.length, i = hlIndex;
    for (var k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!openPanel.children[i].classList.contains('disabled')) { setHl(openPanel, i); scrollToHl(openPanel, i); break; }
    }
  }

  function enhanceable(sel) {
    return sel && sel.tagName === 'SELECT' && !sel.multiple && sel.size <= 1 && !sel.disabled
           && !sel.classList.contains('no-ctg-select');
  }

  function onSelMouseDown(e) {
    var sel = e.currentTarget;
    if (!enhanceable(sel)) return;
    e.preventDefault();            // stop the native popup
    if (openSel === sel) { closePanel(); return; }
    try { sel.focus(); } catch (err) {}
    try { open(sel); } catch (err) { closePanel(); }
  }

  function onSelKeyDown(e) {
    var sel = e.currentTarget;
    if (!enhanceable(sel)) return;
    var openKeys = (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ');
    if ((!openPanel || openSel !== sel)) {
      if (openKeys) { e.preventDefault(); try { sel.focus(); open(sel); } catch (err) { closePanel(); } }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); closePanel(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveHl(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveHl(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hlIndex >= 0) choose(sel, hlIndex); }
  }

  function enhance(sel) {
    if (sel.dataset.ctgSel) return;
    sel.dataset.ctgSel = '1';
    sel.addEventListener('mousedown', onSelMouseDown);
    sel.addEventListener('keydown', onSelKeyDown);
  }
  function enhanceAll() {
    var list = document.querySelectorAll('select:not([data-ctg-sel])');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  if (document.readyState !== 'loading') enhanceAll();
  else document.addEventListener('DOMContentLoaded', enhanceAll);
  // Catch selects added later (the app renders views dynamically).
  try {
    var mo = new MutationObserver(function () { enhanceAll(); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  // Reposition a bit late in case fonts/layout settle.
  window.ctgEnhanceSelects = enhanceAll;
})();
