/* Dark mode removed: always light. Force light and clear any saved dark pref so
   returning users are not stuck in dark. */
try{document.documentElement.removeAttribute('data-theme');localStorage.removeItem('ctg_theme');}catch(e){}
