/* Closes csp-styles.js boot phase: index.html's own static markup (data-cs-boot)
   has all been parsed, and no app script has run yet. Placed in index.html after
   the last static markup and before the first app script. */
window.ctgEndCspBoot()
