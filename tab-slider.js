/* CTG One - sliding active pill for the Registration (#intakeTabs .msg-tab) and
   Access Control (#acPageTabs .ac-page-tab) tab bars.

   Both bars only TOGGLE the .active class on click (they never re-render the bar
   itself), so a single indicator element can live in each bar and slide to the
   active tab instead of the pill snapping from one button to the next.

   The indicator (.ctg-tab-slider) is inserted as the bar's first child, sits
   BEHIND the tab text (z-index), and is positioned to the active tab. The active
   tab's own pill background is made transparent in CSS so only the sliding pill
   shows. CSP-safe: no inline handlers, just a class + style writes. */
(function () {
  var BARS = [
    { wrap: '#intakeTabs',  tab: '.msg-tab' },
    { wrap: '#acPageTabs',  tab: '.ac-page-tab' }
  ];

  function place(wrap, tabSel) {
    var active = wrap.querySelector(tabSel + '.active');
    var g = wrap.querySelector(':scope > .ctg-tab-slider');
    if (!active) { if (g) g.style.opacity = '0'; return; }
    var fresh = false;
    if (!g) {
      g = document.createElement('span');
      g.className = 'ctg-tab-slider';
      g.setAttribute('aria-hidden', 'true');
      g.style.transition = 'none';     // don't slide in from 0,0 on first paint
      wrap.insertBefore(g, wrap.firstChild);
      fresh = true;
    }
    var x = active.offsetLeft, y = active.offsetTop;
    var w = active.offsetWidth, h = active.offsetHeight;
    if (w <= 0) { g.style.opacity = '0'; return; }   // bar not visible yet
    g.style.borderRadius = getComputedStyle(active).borderRadius;
    g.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    g.style.width = w + 'px';
    g.style.height = h + 'px';
    g.style.opacity = '1';
    if (fresh) requestAnimationFrame(function () { g.style.transition = ''; });
  }

  var pending = false;
  function sync() {
    pending = false;
    BARS.forEach(function (cfg) {
      document.querySelectorAll(cfg.wrap).forEach(function (wrap) {
        if (!wrap.offsetParent && wrap.getClientRects().length === 0) return;
        place(wrap, cfg.tab);
      });
    });
  }
  // rAF for a smooth frame-aligned update, plus a timeout backstop so placement
  // still happens if rAF is throttled (e.g. the tab is briefly backgrounded).
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(sync);
    setTimeout(function () { if (pending) sync(); }, 90);
  }

  // Re-sync after a tab is clicked (the .active class is toggled synchronously by
  // the bar's own handler, so one frame later the new active tab is correct).
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.msg-tab, .ac-page-tab')) schedule();
  }, true);

  window.addEventListener('resize', schedule);

  // Catch a bar appearing / becoming visible (page shown, active class moved).
  // Ignore mutations on the slider itself, or our own style writes re-trigger it.
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var t = muts[i].target;
      if (t && t.classList && t.classList.contains('ctg-tab-slider')) continue;
      schedule();
      return;
    }
  });

  function start() {
    try {
      mo.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style']
      });
    } catch (e) {}
    schedule();
    // Backstop: a bar can appear on navigation and the event/observer path can be
    // throttled while a tab is backgrounded. A cheap periodic re-sync guarantees
    // the pill is present and correctly placed. place() only re-writes identical
    // values when nothing moved, so this never causes a visible re-animation.
    setInterval(sync, 700);
  }

  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);

  window.ctgSyncSlideTabs = sync;   // callable after programmatic tab changes
})();
