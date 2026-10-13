/* Applies the saved dark theme before the page paints (was inline in index.html). */
try{if(localStorage.getItem('ctg_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}
