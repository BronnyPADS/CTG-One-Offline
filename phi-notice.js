/* The PHI notice on the sign-in screen. Its own small file with no dependencies, so the
   notice still works on the login screen if an app script fails to load. */

  function ctgShowPhiNotice(){var m=document.getElementById('ctgPhiModal');if(m)m.classList.add('show')}
  function ctgHidePhiNotice(){var m=document.getElementById('ctgPhiModal');if(m)m.classList.remove('show')}
  document.addEventListener('keydown',function(e){if(e.key==='Escape')ctgHidePhiNotice()});
