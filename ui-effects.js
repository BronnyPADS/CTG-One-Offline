/* Button ripple and the other small interface effects (was inline in index.html). */
(function(){
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* 1) Button ripple on press */
  document.addEventListener('pointerdown', function(e){
    if(reduce) return;
    var btn = e.target.closest('.btn, .auth-btn, .fcr-btn');
    if(!btn || btn.disabled) return;
    var rect = btn.getBoundingClientRect();
    var d = Math.max(rect.width, rect.height);
    var r = document.createElement('span');
    r.className = 'ctg-ripple';
    r.style.width = r.style.height = d + 'px';
    r.style.left = (e.clientX - rect.left - d/2) + 'px';
    r.style.top  = (e.clientY - rect.top  - d/2) + 'px';
    var light = /btn-primary|btn-green|auth-btn|fcr-btn-primary/.test(btn.className);
    r.style.background = light ? 'rgba(255,255,255,.45)' : 'rgba(0,119,182,.25)';
    if(getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(r);
    setTimeout(function(){ r.remove(); }, 600);
  }, true);

  /* 2) Password show/hide toggle on the login field */
  function mountPwToggle(){
    var inp = document.getElementById('authPass');
    if(!inp || document.getElementById('ctgPwToggle')) return;
    var field = inp.closest('.auth-field') || inp.parentElement;
    if(!field) return;
    field.style.position = 'relative';
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ctgPwToggle'; b.className = 'ctg-pw-toggle';
    b.setAttribute('aria-label','Show password');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    b.addEventListener('click', function(){
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.classList.toggle('on', show);
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    field.appendChild(b);
  }
  if(document.readyState !== 'loading') mountPwToggle();
  else document.addEventListener('DOMContentLoaded', mountPwToggle);

  /* 3) Drag & drop onto the "Add Document" zone (forwards files to the existing input) */
  /* Any upload box (Add Document, exam Test 1/2/3) or standalone file field is a drop zone. */
  function zoneFrom(e){
    if(!e.target || !e.target.closest) return null;
    var z = e.target.closest('.day2-upload-box, .doc-add');
    if(!z){ var fg = e.target.closest('.fg'); if(fg && fg.querySelector('input[type=file]')) z = fg; }
    if(z && z.querySelector('input[type=file]')) return z;
    return null;
  }
  document.addEventListener('dragover', function(e){
    var z = zoneFrom(e); if(!z) return;
    e.preventDefault(); z.classList.add('drag-over');
  });
  document.addEventListener('dragleave', function(e){
    var z = zoneFrom(e); if(z && !z.contains(e.relatedTarget)) z.classList.remove('drag-over');
  });
  document.addEventListener('drop', function(e){
    var z = zoneFrom(e); if(!z) return;
    e.preventDefault(); z.classList.remove('drag-over');
    var files = e.dataTransfer && e.dataTransfer.files;
    var input = z.querySelector('input[type=file]');
    if(!files || !files.length || !input) return;
    try{
      var dt = new DataTransfer();
      for(var i=0;i<files.length;i++) dt.items.add(files[i]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }catch(err){ /* older browsers: silently ignore, button upload still works */ }
  });

  /* 5) Dark / light theme toggle (UI only) */
  function applyTheme(t){
    if(t === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  function currentTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function syncThemeLabel(){
    var l = document.getElementById('ctgThemeLabel');
    var b = document.getElementById('ctgThemeBtn');
    // The label names what the click will DO, matching the reference design.
    var next = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
    if(l) l.textContent = next;
    if(b){ b.setAttribute('aria-label','Switch to ' + next.toLowerCase()); b.title = 'Switch to ' + next.toLowerCase(); }
  }
  function mountThemeToggle(){
    if(document.getElementById('ctgThemeBtn')) return;
    /* Lives in the sidebar now. The old top-bar host is kept as a fallback so
       this still mounts somewhere if the sidebar slot is ever missing. */
    var host = document.getElementById('sideTools');
    if(!host){
      var chip = document.getElementById('userChip');
      host = chip ? chip.parentElement : document.querySelector('.top-bar > div:last-child');
    }
    if(!host) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ctgThemeBtn'; b.className = 'ctg-theme-btn';
    b.setAttribute('aria-label','Toggle dark mode'); b.title = 'Toggle dark / light mode';
    b.innerHTML =
      '<svg class="ctg-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '<svg class="ctg-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
      '<span class="ctg-theme-label" id="ctgThemeLabel">Dark mode</span>' +
      '<span class="ctg-theme-switch" aria-hidden="true"><i></i></span>';
    b.addEventListener('click', function(){
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try{ localStorage.setItem('ctg_theme', next); }catch(e){}
      syncThemeLabel();
    });
    host.insertBefore(b, host.firstChild);
    syncThemeLabel();
  }
  if(document.readyState !== 'loading') mountThemeToggle();
  else document.addEventListener('DOMContentLoaded', mountThemeToggle);
})();
