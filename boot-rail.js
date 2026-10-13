/* Restores the collapsed sidebar rail before the page paints (was inline in index.html). */
try{if(localStorage.getItem('ctg_side_rail')==='1')document.body.classList.add('sidebar-rail')}catch(e){}
