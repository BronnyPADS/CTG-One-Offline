/* ---------- page router ---------- */
function showPage(name){
  /* Guest meetings and patient forms reuse index.html but swap out the whole
     body. A signed-in staff member opening one of those links still boots the
     app, and nothing this function reaches for exists. Bail rather than throw. */
  if(document.body.classList.contains('pf-mode')||!document.getElementById('day1Tabs'))return
  ctgCloseAllModals()
  // Clear the appointment-linked registration state on every navigation.
  // apptBlockCtxRegistration re-arms it after calling showPage, so reaching
  // Registration any other way cannot inherit a stale banner or quietly attach
  // an unrelated registration to an old appointment.
  if(typeof apptRegLinkApptId!=='undefined')apptRegLinkApptId=null
  {const _regBanner=document.getElementById('regApptLinkBanner');if(_regBanner)_regBanner.style.display='none'}
  // Reset the registration form to "new patient" mode on every navigation so
  // normal sidebar Registration always creates a fresh record. The
  // appointment-link flow (apptBlockCtxRegistration) puts it into edit mode
  // after calling showPage.
  if(typeof regEditingPatientId!=='undefined')regEditingPatientId=null
  {const _rt=document.getElementById('regFormCardTitle');if(_rt)_rt.textContent='New Patient Details'}
  {const _rs=document.getElementById('regFormCardSub');if(_rs)_rs.textContent=''}
  if(name==='day2')mountDay2Editor('day2')
  else if(name==='patientExamEdit')mountDay2Editor('patientExamEdit')
  if(name==='patientAce'||name==='day1'){
    startAceAutosave()
    // The list is laid out now, so the Language box can match the button groups.
    if(typeof window.ctgSyncLanguageWidth==='function'){
      requestAnimationFrame(function(){requestAnimationFrame(window.ctgSyncLanguageWidth)})
    }
  }
  else{ aceFlushUnsavedForm(); stopAceAutosave() }   // leaving Day 1: do not strand up to 15s of typing
  if(name==='patientAce'){mountAceFormForPatientPage();aceApplyLock()}
  else if(name==='day1'){mountAceFormForGuidePage();aceApplyLock()}
  else if(name==='day2'){updateDay2ContextBar();examApplyLock()}
  else if(name==='patientExamEdit'){updateDay2ContextBar();examApplyLock()}
  else if(name==='patientExamDetail')renderPatientExamDetailPage()
  else if(name==='dailyNotes')updateDnContextBar()
  else if(name==='patientDailyNote')renderPatientDailyNoteDedicatedPage()
  else if(name==='dashboard')renderDashboard()
  else if(name==='appointment')renderAppointments()
  else if(name==='apptConfigs')renderApptConfigs()
  else if(name==='apptRooms'&&typeof renderApptRooms==='function')renderApptRooms()
  else if(name==='notesFormTest'&&typeof renderNotesFormTest==='function')renderNotesFormTest()
  else if(name==='commandCenter'&&typeof renderCommandCenter==='function')renderCommandCenter()
  else if(name==='patientEncounters')renderPatientEncounters()
  else if(name==='careAdmin')renderCareAdmin()
  else if(name==='notification')renderNotification()
  else if(name==='patientCheckIn')renderPatientCheckIn()
  else if(name==='contacts')renderContacts()
  else if(name==='referrals'&&typeof renderReferrals==='function')renderReferrals()
  else if(name==='patientChart')renderPatientChart()
  else if(name==='registrationList')renderRegistrationList()
  else if(name==='arSummary')renderArSummary()
  else if(name==='collectionMgmt')renderCollectionMgmt()
  else if(name==='invitePatient')renderInvitePatient()
  else if(name==='patientMessaging')renderPatientMessaging()
  else if(name==='intakeForm')renderIntakeForm()
  else if(name==='meetings'&&typeof renderMeetings==='function')renderMeetings()
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'))
  const page=document.getElementById('page-'+name)
  if(page)page.classList.add('active')
  document.body.classList.toggle('appointments-active',name==='appointment')
  document.body.classList.toggle('patient-messaging-active',name==='patientMessaging')
  document.body.classList.toggle('internal-messaging-active',name==='internalMessaging')
  // Where the selection is NOW, taken before the classes change (see ctgGlide).
  const _glideFrom=ctgGlideCapture()
  document.querySelectorAll('.sidebar .side-link,.sidebar .side-sublink').forEach(a=>a.classList.remove('active'))
  const side=document.querySelector('.sidebar [data-page="'+name+'"]')
  // Measured and marked before .active lands, so the row's label transition
  // starts with the glide's delay already in place (see ctgGlidePrepare).
  const _glide=ctgGlidePrepare(side,_glideFrom)
  if(side)side.classList.add('active')
  // A sidebar sub-item can be reached from outside the sidebar too (e.g. a
  // dashboard shortcut calling showPage directly) - auto-expand its group so
  // the active highlight above isn't hidden inside a collapsed section.
  const sideGroup=side&&side.closest('.side-group')
  // A group that has to open first is mid-accordion, so there is no settled
  // destination to glide to - the selection simply appears, as before.
  const _groupWasClosed=!!(sideGroup&&!sideGroup.classList.contains('open'))
  if(sideGroup)sideGroup.classList.add('open')
  ctgGlideTo(_glide,!_groupWasClosed)
  const _examTabs = (name==='day1'||name==='patientAce')
  document.getElementById('day1Tabs').style.display = _examTabs ? '' : 'none'
  /* Seven section pills and the practice name cannot share a phone-width top
     bar - with both in it the name collapsed to "C...", which is worse than not
     showing it. The stylesheet drops the name on these two pages only, and
     needs to know when it is looking at one. */
  document.body.classList.toggle('topbar-has-tabs', _examTabs)
  window.scrollTo({top:0,left:0,behavior:'instant'})
  if(window.innerWidth<=860){
    document.body.classList.remove('sidebar-visible')
    document.getElementById('sidebarOverlay').classList.remove('open')
  }
  renderPatientWorkflow()
  revealInit()
}

var _ctgGlide=null

function ctgGlideBox(el){
  const sb=document.getElementById('sidebar')
  if(!sb||!el)return null
  const r=el.getBoundingClientRect(), s=sb.getBoundingClientRect()
  if(!r.width||!r.height)return null   // hidden: display:none, collapsed group, rail sub-item
  return {top:r.top-s.top+sb.scrollTop, left:r.left-s.left, height:r.height}
}

function ctgGlideEnabled(){
  const b=document.body
  if(b.classList.contains('auth-active')||window.innerWidth<=860)return false   // phones close the drawer on navigation
  try{ if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false }catch(e){}
  return typeof Element.prototype.animate==='function'
}

// Stop everything in flight and put both rows back to their plain states.
function ctgGlideStop(){
  const g=_ctgGlide
  if(!g)return
  _ctgGlide=null
  g.anims.forEach(function(a){try{a.cancel()}catch(e){}})
  ctgGlideRelease(g.target,g.source)
  if(g.target)g.target.classList.remove('side-glide-landing')
  g.els.forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)})
}
function ctgGlideRelease(target,source){
  if(target){target.classList.remove('side-glide-target');target.style.removeProperty('--glide-in')}
  if(source)source.classList.remove('side-glide-source')
}

/* The row being left, measured while it still has .active. A click during an
   animation snaps the previous one to its end first, so the row it was growing
   into is simply the row being left now. */
function ctgGlideCapture(){
  ctgGlideStop()
  if(!ctgGlideEnabled())return null
  const sb=document.getElementById('sidebar')
  const row=sb&&sb.querySelector('.side-link.active,.side-sublink.active')
  const box=ctgGlideBox(row)
  if(!box)return null
  const cs=getComputedStyle(row)
  // Transparent: a mode where the active row does not show the sheet at all.
  if(/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor))return null
  /* Its own fill must vanish the instant it loses .active - the retracting
     copy is sitting exactly on top of it. Left to its normal background fade,
     it lingered as a ghost pill. */
  row.classList.add('side-glide-source')
  return {row, box, bg:cs.backgroundColor, radius:parseFloat(cs.borderTopLeftRadius)||16}
}

const CTG_GROW_MS=380, CTG_GROW_DELAY=40, CTG_RETRACT_MS=240

/* Measure and mark the destination before it becomes .active. Measuring
   afterwards starts the label colour transition too early, so the label
   darkens while the white is still on its way. Returns a plan for
   ctgGlideTo, or null when there is nothing to animate. */
function ctgGlidePrepare(row, from){
  const plan=ctgGlidePlan(row,from)
  if(!plan){if(from)ctgGlideRelease(null,from.row);return null}
  /* The label turns dark while the white is crossing it. The growth is fast at
     the start, so the white is already under the right end of the label very
     early - waiting any longer left a pale label on white for a few frames. */
  row.style.setProperty('--glide-in',Math.round(CTG_GROW_DELAY+CTG_GROW_MS*0.12)+'ms')
  row.classList.add('side-glide-target')
  return plan
}
function ctgGlidePlan(row, from){
  if(!row||!ctgGlideEnabled())return null
  if(from&&from.row===row)return null                  // clicked the page already open
  const sb=document.getElementById('sidebar')
  // .active changes only the row's horizontal overshoot, never its top or
  // height, so measuring before it is applied gives the resting position.
  const to=ctgGlideBox(row)
  if(!sb||!to)return null
  const root=getComputedStyle(document.documentElement)
  const bg=(from&&from.bg)||root.getPropertyValue('--sheet').trim()
  if(!bg)return null
  const radius=from?from.radius:(document.body.classList.contains('sidebar-rail')?14:16)
  return {row, from, to, sb, bg, radius}
}

function ctgGlideCopy(sb, box, clip, bg, radius){
  const el=document.createElement('div')
  el.className='side-glide'
  el.setAttribute('aria-hidden','true')
  el.style.setProperty('--glide-bg',bg)
  el.style.setProperty('--glide-r',radius+'px')
  el.style.top=box.top+'px'
  el.style.height=box.height+'px'
  sb.insertBefore(el,sb.firstChild)
  return el
}

function ctgGlideTo(plan, ok){
  if(!plan)return
  if(!ok){ctgGlideRelease(plan.row,plan.from&&plan.from.row);return}
  const row=plan.row, from=plan.from, to=plan.to, sb=plan.sb
  const clip=sb.clientWidth      // the rows are clipped here; so are the copies
  const span=(left)=>({left:left+'px',width:Math.max(0,clip-left)+'px'})
  const g={els:[],anims:[],target:row,source:from&&from.row}
  _ctgGlide=g

  /* OUT: the old row's white pulls back into the page, right, and its corner
     arcs fade as it closes. */
  if(from){
    const out=ctgGlideCopy(sb,from.box,clip,from.bg,from.radius)
    const a=out.animate([
      Object.assign(span(from.box.left),{opacity:1}),
      Object.assign(span(clip-6),{opacity:1,offset:.8}),
      Object.assign(span(clip),{opacity:0})
    ],{duration:CTG_RETRACT_MS,easing:'cubic-bezier(.55,0,.35,1)',fill:'forwards'})
    g.els.push(out);g.anims.push(a)
    a.onfinish=function(){ if(from.row)from.row.classList.remove('side-glide-source'); if(out.parentNode)out.parentNode.removeChild(out) }
  }

  /* IN: the new row's white grows out of the page edge, left across the row to
     just past the label's edge, and settles back. The corner arcs appear first,
     as the page opens. */
  const inn=ctgGlideCopy(sb,to,clip,plan.bg,plan.radius)
  const b=inn.animate([
    Object.assign(span(clip),{opacity:0}),
    Object.assign(span(clip-8),{opacity:1,offset:.12}),
    Object.assign(span(Math.max(0,to.left-5)),{opacity:1,offset:.8}),
    Object.assign(span(to.left),{opacity:1})
  ],{duration:CTG_GROW_MS,delay:CTG_GROW_DELAY,easing:'cubic-bezier(.22,.9,.3,1)',fill:'both'})
  g.els.push(inn);g.anims.push(b)
  b.onfinish=function(){
    if(_ctgGlide!==g)return
    /* Hand-over, frame-exact rather than timed: for one frame the row's own
       fill snaps on (no background fade) underneath the copy, then the copy
       goes. A timer racing the row's 180ms fade left a faint pill whenever
       the page was busy. */
    row.classList.add('side-glide-landing')
    ctgGlideRelease(row,null)
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      row.classList.remove('side-glide-landing')
      if(_ctgGlide===g){_ctgGlide=null;g.els.forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)})}
    }) })
  }
}
// Collapsing/expanding the rail or resizing moves every row: drop a glide in flight.
window.addEventListener('resize',function(){ if(_ctgGlide)ctgGlideStop() })

/* Collapsible sidebar groups (e.g. "Appointment"). Persisted so a
   collapsed group stays collapsed across reloads. */
function toggleSideGroup(id){
  const el=document.getElementById(id)
  if(!el)return
  ctgGlideStop()   // the accordion moves every row below it
  /* Collapsed, a group opens as a fly-out beside its icon rather than forcing
     the whole rail back open - expanding to reach one sub-page defeated the
     point of collapsing in the first place. */
  if(document.body.classList.contains('sidebar-rail')){
    ctgRailGroupMenu(el)
    return
  }
  el.classList.toggle('open')
  try{localStorage.setItem('ctg_side_'+id,el.classList.contains('open')?'1':'0')}catch(e){}
}

/* Rail fly-out menus, mounted on <body> rather than in the sidebar: .sidebar
   clips on both axes, so a panel inside it could never reach past the rail
   edge. Fixed positioning also means it does not follow the nav list, which
   is why any scroll simply closes it. */
let ctgFly=null

function ctgCloseFly(){
  if(!ctgFly)return
  const f=ctgFly
  ctgFly=null
  f.el.remove()
  document.removeEventListener('mousedown',f.away,true)
  document.removeEventListener('keydown',f.key,true)
  window.removeEventListener('resize',ctgCloseFly)
  const sb=document.getElementById('sidebar')
  if(sb)sb.removeEventListener('scroll',ctgCloseFly)
  if(f.anchor)f.anchor.setAttribute('aria-expanded','false')
}

function ctgOpenFly(anchor,title,sub,body){
  const reopen=ctgFly&&ctgFly.anchor===anchor
  ctgCloseFly()
  if(reopen)return               // clicking the same icon again closes it

  const el=document.createElement('div')
  el.className='side-fly'
  el.setAttribute('role','menu')
  const hd=document.createElement('div')
  hd.className='side-fly-hd'
  /* textContent, not innerHTML - the account menu's title is the signed-in
     user's own name, which comes back from the API. */
  hd.textContent=title
  el.appendChild(hd)
  if(sub){
    const s=document.createElement('div')
    s.className='side-fly-sub'
    s.textContent=sub
    el.appendChild(s)
  }
  el.appendChild(body)
  document.body.appendChild(el)

  const sb=document.getElementById('sidebar')
  const sr=sb.getBoundingClientRect()
  const ar=anchor.getBoundingClientRect()
  el.style.left=Math.round(sr.right+10)+'px'
  const max=window.innerHeight-el.offsetHeight-14
  el.style.top=Math.max(14,Math.min(Math.round(ar.top),Math.max(14,max)))+'px'

  const f={el:el,anchor:anchor}
  f.away=function(e){ if(!el.contains(e.target)&&!anchor.contains(e.target))ctgCloseFly() }
  f.key=function(e){ if(e.key==='Escape'){ctgCloseFly();if(anchor.focus)anchor.focus()} }
  document.addEventListener('mousedown',f.away,true)
  document.addEventListener('keydown',f.key,true)
  window.addEventListener('resize',ctgCloseFly)
  if(sb)sb.addEventListener('scroll',ctgCloseFly)
  anchor.setAttribute('aria-expanded','true')
  ctgFly=f
  const first=el.querySelector('a,button')
  if(first)first.focus()
}

function ctgRailGroupMenu(group){
  const toggle=group.querySelector('.side-group-toggle')
  if(!toggle)return
  const body=document.createElement('div')
  body.className='side-fly-body'
  /* Clones, so the real nav keeps its identity and its saved open/closed
     state. The inline onclick attributes come across with cloneNode, and a
     sub-link hidden by role permissions carries its display:none with it
     which is why those are skipped rather than cloned into a gap. */
  group.querySelectorAll('.side-group-body-inner .side-sublink').forEach(function(a){
    if(a.style.display==='none')return
    const c=a.cloneNode(true)
    c.removeAttribute('id')
    c.addEventListener('click',ctgCloseFly)
    body.appendChild(c)
  })
  if(!body.children.length)return
  ctgOpenFly(toggle,(toggle.textContent||'').trim(),'',body)
}

/* The account menu, in both sidebar states. It carries what the old top-bar
   chip held; Change Password has no other route in. Admin Center stays
   admin-only. */
function ctgAccountMenu(){
  const card=document.getElementById('sideAccountCard')
  if(!card)return
  const name=(document.getElementById('sideAccountName')||{}).textContent||'Account'
  const role=(document.getElementById('sideAccountRole')||{}).textContent||''
  const body=document.createElement('div')
  body.className='side-fly-body'

  const item=(label,svg,fn,cls)=>{
    const b=document.createElement('button')
    b.type='button'
    b.className='side-fly-out'+(cls?' '+cls:'')
    b.innerHTML=svg
    b.appendChild(document.createTextNode(label))
    b.addEventListener('click',function(){ ctgCloseFly(); fn() })
    body.appendChild(b)
  }
  const ICON=p=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'

  const access=document.getElementById('userMenuAccess')
  if(access&&access.style.display!=='none'){
    item('Admin Center',ICON('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),function(){ showPage('accessControl') })
  }
  if(typeof window.openChangePassword==='function'){
    item('Change Password',ICON('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),function(){ window.openChangePassword() })
  }
  item('Log out',ICON('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),function(){ logout() },'is-out')

  ctgOpenFly(card,String(name).trim(),String(role).trim(),body)
}

function ctgInitRailAccount(){
  const card=document.getElementById('sideAccountCard')
  if(!card||card.dataset.railWired)return
  card.dataset.railWired='1'
  card.addEventListener('click',function(e){
    // The inline Log out button keeps its own one-click job when expanded.
    if(e.target.closest('.side-account-out'))return
    e.preventDefault()
    e.stopPropagation()
    ctgAccountMenu()
  })
  card.addEventListener('keydown',function(e){
    if(e.target!==card)return
    if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ctgAccountMenu() }
  })
  card.setAttribute('role','button')
  card.setAttribute('tabindex','0')
  card.setAttribute('aria-haspopup','menu')
  card.setAttribute('aria-expanded','false')
}
if(document.readyState!=='loading') ctgInitRailAccount()
else document.addEventListener('DOMContentLoaded', ctgInitRailAccount)

let day2EditorMountedIn='day2'

function normalizeExamCategoryForSelect(value,arrayKey){
  const raw=String(value||'').trim()
  /* Exams saved before the Day 1 / Day 2 relabel still store 'Initial
     Examination', and examCategory is stored rather than derived, so the old
     value has to keep resolving here instead of falling through below. */
  if(raw==='Day 2'||raw==='Day 2'||raw==='Initial Examination'||arrayKey==='initialExam')return 'Day 2'
  if(raw==='Final Examination'||arrayKey==='finalExam')return 'Final Examination'
  if(raw==='Re-Examination'||arrayKey==='reExams'||/Re-Examination/i.test(raw))return 'Re-Examination'
  return 'Day 2'
}
function syncPatientExamEditorLocks(target){
  const dedicated=target==='patientExamEdit'
  const patientSel=document.getElementById('examPatientSelect')
  const patientDisplay=document.getElementById('lockedExamPatientDisplay')
  const examSel=document.getElementById('examTypeSelect')
  const examTypeDisplay=document.getElementById('lockedExamTypeDisplay')
  const p=getPatient(selectedPatientId)
  if(patientSel)patientSel.disabled=dedicated
  if(patientDisplay){
    patientDisplay.style.display='none'
    patientDisplay.textContent=''
  }
  if(examSel){
    const examWrap=examSel.parentElement
    examSel.disabled=dedicated
    examSel.style.display=dedicated?'none':''
    if(examWrap)examWrap.style.marginTop=dedicated?'2px':'4px'
  }
  if(examTypeDisplay){
    const label=patientExamEditTitleOverride||(patientExamDetailState?patientExamDetailLabel(patientExamDetailState.patientId,patientExamDetailState.arrayKey,patientExamDetailState.index):(examSel?.value||'Exam'))
    examTypeDisplay.style.display=dedicated?'inline-flex':'none'
    examTypeDisplay.textContent=label||'Exam'
  }
}
function mountDay2Editor(target){
  const wrap=document.getElementById('day2EditorWrap')
  const bar=document.getElementById('day2EditorActionBar')
  if(!wrap||!bar)return
  const avatar=document.getElementById('day2PageAvatar')
  const title=document.getElementById('day2PageTitle')
  const backBtn=document.getElementById('day2BackBtn')
  const downloadBtn=document.getElementById('day2DownloadPdfBtn')
  if(target==='patientExamEdit'){
    const mount=document.getElementById('patientExamEditMount')
    const actionMount=document.getElementById('patientExamEditActionMount')
    if(mount&&wrap.parentNode!==mount)mount.appendChild(wrap)
    if(actionMount&&bar.parentNode!==actionMount)actionMount.appendChild(bar)
    day2EditorMountedIn='patientExamEdit'
    if(backBtn){backBtn.style.display='';backBtn.textContent='← Back to Patient Lists';backBtn.onclick=function(){showPage('patientLists')}}
    if(downloadBtn)downloadBtn.style.display=''
    const label=patientExamEditTitleOverride||(patientExamDetailState?patientExamDetailLabel(patientExamDetailState.patientId,patientExamDetailState.arrayKey,patientExamDetailState.index):'Exam Editor')
    if(title)title.textContent=label
    if(avatar)avatar.textContent=label==='Day 2'?'IE':label==='Final Examination'?'FE':'RE'
    syncPatientExamEditorLocks('patientExamEdit')
  }else{
    if(day2EditorMountedIn==='patientExamEdit'){patientExamDetailState=null;patientExamEditTitleOverride='';day2EditAttempt=null}
    const page=document.getElementById('page-day2')
    if(page&&wrap.parentNode!==page)page.appendChild(wrap)
    if(page&&bar.parentNode!==page)page.appendChild(bar)
    day2EditorMountedIn='day2'
    if(backBtn){backBtn.style.display='none';backBtn.textContent='← Back to Day 1';backBtn.onclick=function(){showPage('day1')}}
    if(downloadBtn)downloadBtn.style.display='none'
    if(title)title.textContent='Exams'
    if(avatar)avatar.textContent='D2'
    syncPatientExamEditorLocks('day2')
  }
}

function syncSidebarLogo(){
  const logo=document.getElementById('topbarLogo')
  if(logo)logo.style.display=''
}
function toggleSidebar(){
  document.body.classList.toggle('sidebar-visible')
  document.getElementById('sidebarOverlay').classList.toggle('open', document.body.classList.contains('sidebar-visible') && window.innerWidth<=860)
  syncSidebarLogo()
}

/* ---------- Sidebar rail (collapsed) mode ----------
   Distinct from toggleSidebar above, which slides the whole rail off screen
   and is still what the phone layout and the overlay use. This one narrows it
   to icons instead, so the nav is never actually gone on a desktop. */
function ctgSetSidebarRail(on){
  if(typeof ctgGlideStop==='function')ctgGlideStop()
  document.body.classList.toggle('sidebar-rail', !!on)
  if(typeof ctgCloseFly==='function')ctgCloseFly()
  const b=document.getElementById('sideCollapseBtn')
  if(b){
    const label=on?'Expand the sidebar':'Collapse the sidebar'
    b.setAttribute('aria-expanded', on?'false':'true')
    b.setAttribute('aria-label', label)
    b.title=label
  }
  // The card is a menu trigger in both states now (ctgInitRailAccount sets the
  // ARIA once); only the tooltip differs, since the name is hidden in a rail.
  const card=document.getElementById('sideAccountCard')
  if(card){
    if(on)card.title='Account'
    else card.removeAttribute('title')
  }
}
/* The rail state is restored from localStorage before app.js runs, so the
   attributes above have to be applied once on boot too - not only on toggle. */
if(document.readyState!=='loading') ctgSetSidebarRail(document.body.classList.contains('sidebar-rail'))
else document.addEventListener('DOMContentLoaded',function(){
  ctgSetSidebarRail(document.body.classList.contains('sidebar-rail'))
})
function ctgToggleSidebarRail(){
  const on=!document.body.classList.contains('sidebar-rail')
  ctgSetSidebarRail(on)
  try{localStorage.setItem('ctg_side_rail', on?'1':'0')}catch(e){}
}

/* The labels are hidden in rail mode, so each icon has to carry its own name
   for the tooltip and for a screen reader. Read from the DOM rather than kept
   in a second list here - the nav items are defined once, in index.html. */
function ctgLabelSidebarIcons(){
  document.querySelectorAll('#sidebar .side-link, #sidebar .side-sublink').forEach(function(a){
    if(a.title)return
    const t=(a.textContent||'').replace(/\s+/g,' ').trim()
    if(t){ a.title=t; if(!a.getAttribute('aria-label')) a.setAttribute('aria-label',t) }
  })
}
if(document.readyState!=='loading') ctgLabelSidebarIcons()
else document.addEventListener('DOMContentLoaded', ctgLabelSidebarIcons)

/* ---------- Day 2 shared helpers ---------- */
function dtable(headers, rows, numCols){
  numCols = numCols || [];
  let h = '<table class="dtable"><tr>' + headers.map(x=>'<th>'+x+'</th>').join('') + '</tr>';
  rows.forEach(r=>{
    h += '<tr>' + r.map((c,i)=>{
      let cls = [];
      if(numCols.includes(i)) cls.push('num');
      let val = c;
      if(typeof c === 'string' && c.charAt(0) === '!'){ cls.push('flag'); val = c.slice(1); }
      return '<td class="'+cls.join(' ')+'">'+val+'</td>';
    }).join('') + '</tr>';
  });
  return h + '</table>';
}
function meter(pct){
  if(pct == null) return '<div class="meter"></div>';
  return '<div class="meter"><div class="meter-marker" data-cs="'+__cs+'left:'+pct+'%"></div></div>';
}
function ordSuffix(n){
  if(n%100>=11 && n%100<=13) return 'th';
  switch(n%10){case 1:return 'st';case 2:return 'nd';case 3:return 'rd';default:return 'th';}
}

/* ---------- Day 2: Sway Medical ---------- */
const SWAY_DATA = {
  testDate: '—',
  profileId: '—',
  assessmentType: '—',
  symptomTotal: '—', physical: '—', cognitiveSymptoms: '—', emotional: '—', sleepArousal: '—',
  physicalItems: [
    ['Headache',''], ['"Pressure in head"',''], ['Neck Pain',''], ['Dizziness',''],
    ['Blurred vision',''], ['Balance problems',''], ['Sensitivity to light',''], ['"Don\'t feel right"','']
  ],
  otherItems: [
    ['Nervous or Anxious','','Emotional'],
    ['Feeling slowed down','','Cognitive'],
    ['Feeling like "in a fog"','','Cognitive'],
    ['Fatigue or low energy','','Sleep-Arousal'],
    ['Drowsiness','','Sleep-Arousal']
  ],
  balance: {
    score: '—', percentile: null, interpretation: '—',
    baseline: '—', range: '—', consistency: '—', testCount: '—',
    subtests: [
      ['Feet Together (EC)',''], ['Tandem (EC/R)',''], ['Tandem (EC/L)',''],
      ['Single Leg (EC/R)',''], ['Single Leg (EC/L)','']
    ]
  },
  cognitive: [
    {name:'Inspection Time', score:'—', percentile:null, interp:'—', baseline:'—', range:''},
    {name:'Reaction Time', score:'—', percentile:null, interp:'—', baseline:'—', range:''},
    {name:'Impulse Control', score:'—', percentile:null, interp:'—', baseline:'—', range:''},
    {name:'Memory', score:'—', percentile:null, interp:'—', baseline:'—', range:''},
    {name:'Reverse Number Counting', score:'—', percentile:null, interp:'—', baseline:'—', range:''},
    {name:'Cued Stroop', score:'—', percentile:null, interp:'—', baseline:'—', range:''}
  ],
  voms: {
    avgConvergence: '—', baselineSymptoms: '—', maxProvocation: '—', maxTotalSymptoms: '—',
    rows: [
      ['Baseline Symptoms','','','','',''],
      ['Pursuits','','','','',''],
      ['Saccades — Horizontal','','','','',''],
      ['Saccades — Vertical','','','','',''],
      ['Convergence (Near Point)','','','','',''],
      ['VOR — Horizontal','','','','',''],
      ['VOR — Vertical','','','','',''],
      ['Visual Motion Sensitivity','','','','','']
    ]
  },
  surveys: {
    phq9: {total: '—', severity: '—', cls: ''},
    gad7: {total: '—', severity: '—', cls: ''}
  },
  history: []
};

function renderSway(d){
  let h = '';

  h += '<div class="res-meta">'
     +   '<div>Test Date: <strong>'+d.testDate+'</strong></div>'
     +   '<div>Profile ID: <strong>'+d.profileId+'</strong></div>'
     +   '<div>Type: <strong>'+d.assessmentType+'</strong></div>'
     + '</div>';

  /* Vestibular first (eye movement + balance), then everything else under
     Neurocognitive. Same data, same parsing - only the reading order and the
     group headers changed. */
  h += '<div class="res-group"><b>Vestibular</b><span>Eye Movement &amp; Balance</span></div>';

  h += '<div class="sdiv"><span>Balance — mBESS</span></div>';
  h += '<div class="meter-row">'
     +   '<div class="meter-hd"><span class="ml">Composite Score</span><span class="mv">'+d.balance.score
     +     (d.balance.percentile!=null ? ' · '+d.balance.percentile+ordSuffix(d.balance.percentile)+' percentile' : '')
     +     (d.balance.interpretation && d.balance.interpretation!=='—' ? ' ('+d.balance.interpretation+')' : '')
     +   '</span></div>'
     +   meter(d.balance.percentile)
     +   '<div class="meter-scale"><span>Very Low</span><span>Low</span><span>Average</span><span>High</span><span>V.High</span></div>'
     + '</div>';
  h += dtable(['Sub-Test','Score'], d.balance.subtests.map(r=>[r[0], String(r[1])]), [1]);
  h += '<div class="bpbox">Baseline: <strong>'+d.balance.baseline+'</strong> · Range '+d.balance.range+' · Consistency: '+d.balance.consistency+' · Test Count: '+d.balance.testCount+'</div>';

  h += '<div class="sdiv"><span>VOMS — Vestibular/Ocular Motor Screening</span></div>';
  h += dtable(['Test','Headache','Dizziness','Nausea','Fogginess','Total'], d.voms.rows, [1,2,3,4,5]);
  h += '<div class="bpbox">Average Convergence: <strong>'+d.voms.avgConvergence+'</strong> · Baseline Symptoms: <strong>'+d.voms.baselineSymptoms+'</strong> · Max Provocation: <strong>'+d.voms.maxProvocation+'</strong> · Max Total Symptoms: <strong>'+d.voms.maxTotalSymptoms+'</strong><br><span data-cs="'+__cs+'font-size:10px">▲ indicates symptom provocation above baseline</span></div>';

  h += '<div class="res-group"><b>Neurocognitive</b><span>Symptoms, Cognitive Performance &amp; Surveys</span></div>';

  h += '<div class="sdiv"><span>Symptom Inventory</span></div>';
  h += '<div class="stat-grid">'
     +   '<div class="stat-box" data-cs="'+__cs+'background:var(--rl)"><div class="stat-val" data-cs="'+__cs+'color:var(--red)">'+d.symptomTotal+'</div><div class="stat-lbl">Total (of 132)</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.physical+'</div><div class="stat-lbl">Physical</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.cognitiveSymptoms+'</div><div class="stat-lbl">Cognitive</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.emotional+'</div><div class="stat-lbl">Emotional</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.sleepArousal+'</div><div class="stat-lbl">Sleep-Arousal</div></div>'
     + '</div>';

  const maxRows = Math.max(d.physicalItems.length, d.otherItems.length);
  const symRows = [];
  for(let i=0;i<maxRows;i++){
    const p = d.physicalItems[i];
    const o = d.otherItems[i];
    symRows.push([
      p ? p[0] : '', p ? String(p[1]) : '',
      o ? o[0]+' <span data-cs="'+__cs+'color:var(--faint);font-size:10px">('+o[2]+')</span>' : '',
      o ? String(o[1]) : ''
    ]);
  }
  h += dtable(['Physical Symptom','Score','Cognitive / Emotional / Sleep Symptom','Score'], symRows, [1,3]);

  h += '<div class="sdiv"><span>Cognitive Performance</span></div>';
  d.cognitive.forEach(c=>{
    h += '<div class="meter-row">'
       +   '<div class="meter-hd"><span class="ml">'+c.name+'</span><span class="mv">'+c.score
       +     (c.percentile!=null ? ' · '+c.percentile+ordSuffix(c.percentile)+' pct' : '')
       +     (c.interp!=='—' ? ' · '+c.interp : '') + '</span></div>'
       +   (c.percentile!=null ? meter(c.percentile) : '')
       +   '<div class="meter-sub">Baseline '+c.baseline+(c.range ? ' · Range '+c.range : '')+'</div>'
       + '</div>';
  });

  h += '<div class="sdiv"><span>Symptom Surveys</span></div>';
  h += '<div class="g2">'
     +   '<div class="stat-box"><div class="stat-val">'+d.surveys.phq9.total+'</div><div class="stat-lbl">PHQ-9 Total</div><div class="sev-badge '+d.surveys.phq9.cls+'">'+d.surveys.phq9.severity+'</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.surveys.gad7.total+'</div><div class="stat-lbl">GAD-7 Total</div><div class="sev-badge '+d.surveys.gad7.cls+'">'+d.surveys.gad7.severity+'</div></div>'
     + '</div>';

  h += '<div class="sdiv"><span>Recovery Trend (Profile History)</span></div>';
  h += dtable(['Test Date','Symptom Total','mBESS','PHQ-9','GAD-7','VOMS Max Total'], d.history.map(r=>r.map(String)), [1,2,3,4,5]);

  return h;
}

const swaySectionEl=document.getElementById('swaySection'); if(swaySectionEl)swaySectionEl.innerHTML = renderSway(SWAY_DATA);

/* ---------- Day 2: Reflex Telehealth ---------- */
const REFLEX_DATA = {
  patientId: '—', age: '—', sex: '—', eyeLocation: '—',
  concussionDate: '—', asymptomatic: '—',
  testDate: '—', administrator: '—',
  testType: '—', pulseLevel: '—', flash: '—',
  videoDuration: '—', pulseDuration: '—', illuminationDelay: '—',
  cognitiveAge: '—', neuroCDS: {r:'—', l:'—'},
  detection: [
    ['Alpha Omega','—'], ['Anisocoria','—'], ['Miosis','—'],
    ['Mydriasis','—'], ['Tonic Pupil','—']
  ],
  constrict: [
    ['Avg. Constriction Speed','','',''],
    ['Constriction Time','','',''],
    ['Max. Constriction Speed','','','']
  ],
  dilation: [
    ['Release Amplitude','','','']
  ],
  other: [
    ['Amplitude','','',''],
    ['Avg. Diameter','','',''],
    ['Latency','','',''],
    ['Max. Diameter','','',''],
    ['Min. Diameter','','','']
  ]
};

function renderReflex(d){
  let h = '';

  h += '<div class="res-meta">'
     +   '<div>Test Date: <strong>'+d.testDate+'</strong></div>'
     +   '<div>Administrator: <strong>'+d.administrator+'</strong></div>'
     +   '<div>Test Type: <strong>'+d.testType+'</strong> (Pulse '+d.pulseLevel+', Flash '+d.flash+')</div>'
     +   '<div>Patient ID: <strong>'+d.patientId+'</strong></div>'
     +   '<div>Concussion Date: <strong>'+d.concussionDate+'</strong> · Asymptomatic: <strong>'+d.asymptomatic+'</strong></div>'
     + '</div>';

  h += '<div class="sdiv"><span>Analysis</span></div>';
  h += '<div class="stat-grid">'
     +   '<div class="stat-box"><div class="stat-val">'+d.cognitiveAge+'</div><div class="stat-lbl">Cognitive Age</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.neuroCDS.r+'</div><div class="stat-lbl">Neuro CDS — Right</div></div>'
     +   '<div class="stat-box"><div class="stat-val">'+d.neuroCDS.l+'</div><div class="stat-lbl">Neuro CDS — Left</div></div>'
     + '</div>';

  h += '<div class="sdiv"><span>Detection</span></div>';
  h += '<div class="det-grid">' + d.detection.map(row =>
        '<div class="det-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><strong>'+row[0]+'</strong> — '+row[1]+'</div></div>'
      ).join('') + '</div>';

  h += '<div class="sdiv"><span>Constrict Results</span></div>';
  h += dtable(['Metric','Right Eye','Left Eye','Normative Data'], d.constrict, [1,2,3]);

  h += '<div class="sdiv"><span>Dilation Results</span></div>';
  h += dtable(['Metric','Right Eye','Left Eye','Normative Data'], d.dilation, [1,2,3]);

  h += '<div class="sdiv"><span>Other Results</span></div>';
  h += dtable(['Metric','Right Eye','Left Eye','Normative Data'], d.other, [1,2,3]);

  h += '<div class="bpbox">Red-highlighted values fall outside the normative reference range and may warrant clinical follow-up.</div>';

  return h;
}

const reflexSectionEl=document.getElementById('reflexSection'); if(reflexSectionEl)reflexSectionEl.innerHTML = renderReflex(REFLEX_DATA);

/* ---------- Day 2: Shoebox ---------- */
const SHOEBOX_DATA = {
  result: '—',
  testId: '—',
  ears: {
    left:  {result:'—', sig:33, loss:33, marker:null},
    right: {result:'—', sig:33, loss:33, marker:null}
  }
};

function hearingBar(ear){
  const good = 100 - ear.sig - ear.loss;
  return '<div class="hm-wrap">'
    +   '<div class="hm-cap"><span>Significant Loss</span><span>Loss</span><span>Good</span></div>'
    +   '<div class="hearing-meter">'
    +     '<div class="hm-zone hm-sig" data-cs="'+__cs+'width:'+ear.sig+'%"></div>'
    +     '<div class="hm-zone hm-loss" data-cs="'+__cs+'width:'+ear.loss+'%"></div>'
    +     '<div class="hm-zone hm-good" data-cs="'+__cs+'width:'+good+'%"></div>'
    +     (ear.marker!=null ? '<div class="hm-marker" data-cs="'+__cs+'left:'+ear.marker+'%"></div><div class="hm-marker-lbl" data-cs="'+__cs+'left:'+ear.marker+'%">▼</div>' : '')
    +   '</div>'
    +   '<div data-cs="'+__cs+'font-size:10px;color:var(--muted);margin-top:14px">Your hearing ability</div>'
    + '</div>';
}

function renderShoebox(d){
  let h = '';
  h += '<div class="res-meta"><div>Test ID: <strong>'+d.testId+'</strong></div></div>';

  h += '<div class="sdiv"><span>Overall Result</span></div>';
  h += '<div class="bpbox" data-cs="'+__cs+'font-style:normal"><strong data-cs="'+__cs+'font-size:14px;color:var(--text)">'+d.result+'</strong></div>';

  h += '<div class="sdiv"><span>Left Ear</span></div>';
  h += '<div data-cs="'+__cs+'font-size:12px;margin-bottom:4px">'+d.ears.left.result+'</div>';
  h += hearingBar(d.ears.left);

  h += '<div class="sdiv"><span>Right Ear</span></div>';
  h += '<div data-cs="'+__cs+'font-size:12px;margin-bottom:4px">'+d.ears.right.result+'</div>';
  h += hearingBar(d.ears.right);

  return h;
}

const shoeboxSectionEl=document.getElementById('shoeboxSection'); if(shoeboxSectionEl)shoeboxSectionEl.innerHTML = renderShoebox(SHOEBOX_DATA);


/* ---------- Day 2: Result PDF uploads + text extraction ---------- */
let day2ResultUploads={test1:[],test2:[],test3:[]}
// When an existing exam attempt is opened via "Open", this holds {patientId,arrayKey,index}
// so Save updates that record in place instead of creating a new one. Cleared when a
// fresh exam is started (e.g. "+ New Re-Exam").
let day2EditAttempt=null
const DAY2_RESULT_LABELS={
  test1:'Vestibular & Neurocognitive Results',
  test2:'Quantitative Pupillometry Results',
  test3:'Auditory Screening Results'
}
function cloneDay2Uploads(obj){
  return JSON.parse(JSON.stringify(obj||{test1:[],test2:[],test3:[]}))
}
function normalizeDay2Uploads(obj){
  const out={test1:[],test2:[],test3:[]}
  ;['test1','test2','test3'].forEach(k=>{out[k]=Array.isArray(obj&&obj[k])?obj[k]:[]})
  return out
}
function normalizeDay2EarResults(obj){
  return {left:String(obj?.left||''),right:String(obj?.right||''),indication:String(obj?.indication||'')}
}
// Display label for a Shoebox ear result: "Good hearing" reads as
// "No Hearing Loss Indicated" on results; other values are shown as-is.
function day2EarResultDisplay(v){const s=String(v||'').trim();if(!s)return '—';if(/^good hearing$/i.test(s))return 'No Hearing Loss Indicated';return s}
function collectDay2Test3EarResults(){
  return {
    left:document.getElementById('day2Test3LeftEar')?.value||'',
    right:document.getElementById('day2Test3RightEar')?.value||'',
    indication:document.getElementById('day2Test3Indication')?.value||''
  }
}
function setDay2Test3EarResults(results){
  const r=normalizeDay2EarResults(results)
  const left=document.getElementById('day2Test3LeftEar')
  const right=document.getElementById('day2Test3RightEar')
  const indication=document.getElementById('day2Test3Indication')
  if(left)left.value=r.left
  if(right)right.value=r.right
  if(indication)indication.value=r.indication
}
function selectedDay2Test1PartType(){
  return document.getElementById('day2Test1PartType')?.value||'Complete'
}
function day2Test1PartLabel(file){
  const value=String(file?.partType||file?.partSelection||file?.part||'Complete').trim()
  return value||'Complete'
}
function day2Test1PartOrder(label){
  const order={'First Part':1,'Second Part':2,'Complete':3}
  return order[String(label||'').trim()]||99
}
function sortedDay2Test1Files(files){
  return [...(files||[])].sort((a,b)=>day2Test1PartOrder(day2Test1PartLabel(a))-day2Test1PartOrder(day2Test1PartLabel(b)))
}
function summarizeDay2Test1UploadParts(uploads){
  const u=normalizeDay2Uploads(uploads)
  const labels=[]
  ;(u.test1||[]).forEach(f=>{const label=day2Test1PartLabel(f);if(!labels.includes(label))labels.push(label)})
  labels.sort((a,b)=>day2Test1PartOrder(a)-day2Test1PartOrder(b))
  return labels.length?labels.join(' · '):'—'
}
function selectedDay2Test2EyeType(){
  return document.getElementById('day2Test2EyeType')?.value||'Both Eyes'
}
function day2AutoDetectEyeType(text){
  const flat=String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ')
  const m=flat.match(/Eye\s+Location\s*[:\-]?\s*(Left|Right|Both)/i)
  if(!m)return ''
  const val=m[1].trim()
  if(/^left$/i.test(val))return 'Left Eye'
  if(/^right$/i.test(val))return 'Right Eye'
  if(/^both$/i.test(val))return 'Both Eyes'
  return ''
}
function day2Test2EyeLabel(file){
  const value=String(file?.eyeType||file?.eyeSelection||file?.eye||'Both Eyes').trim()
  return value||'Both Eyes'
}
function summarizeDay2Test2UploadTypes(uploads){
  const u=normalizeDay2Uploads(uploads)
  const labels=[]
  ;(u.test2||[]).forEach(f=>{const label=day2Test2EyeLabel(f);if(!labels.includes(label))labels.push(label)})
  return labels.length?labels.join(' · '):'—'
}
function summarizeDay2Test3UploadNames(uploads){
  const u=normalizeDay2Uploads(uploads)
  const names=(u.test3||[]).map(f=>String(f?.name||'Uploaded PDF').trim()).filter(Boolean)
  return names.length?names.join(' · '):'—'
}
function summarizeDay2EarResults(results){
  const r=normalizeDay2EarResults(results)
  const parts=[]
  if(r.left)parts.push('Left: '+r.left)
  if(r.right)parts.push('Right: '+r.right)
  if(r.indication)parts.push('Indication: '+r.indication)
  return parts.length?parts.join(' · '):'—'
}
function day2UploadPreviewId(testKey){return {test1:'day2PreviewTest1',test2:'day2PreviewTest2',test3:'day2PreviewTest3'}[testKey]}
function day2UploadInputId(testKey){return {test1:'day2UploadTest1',test2:'day2UploadTest2',test3:'day2UploadTest3'}[testKey]}
function countDay2UploadedFiles(uploads){
  const u=normalizeDay2Uploads(uploads||day2ResultUploads)
  return u.test1.length+u.test2.length+u.test3.length
}
function day2ExtractedLineCount(file){
  return String(file?.text||'').split(/\n+/).filter(Boolean).length
}
function renderDay2UploadPreviews(){
  ;['test1','test2','test3'].forEach(testKey=>{
    const box=document.getElementById(day2UploadPreviewId(testKey))
    if(!box)return
    const files=day2ResultUploads[testKey]||[]
    if(!files.length){box.innerHTML='<div class="day2-upload-empty">No PDF uploaded yet.</div>';return}
    box.innerHTML=files.map((f,i)=>{
      const eyeTag=testKey==='test2'?`<span class="day2-upload-eye-tag">${escHtml(day2Test2EyeLabel(f))}</span>`:''
      const partTag=''
      return `<div class="day2-upload-item day2-pdf-item">
        <div class="day2-pdf-icon">PDF</div>
        <div class="day2-upload-name">${i+1}. ${escHtml(f.name||('Uploaded PDF'))}${partTag}${eyeTag}</div>
        <button type="button" class="day2-upload-remove" data-onclick="removeDay2ResultUpload('${testKey}',${i})">Remove</button>
      </div>`
    }).join('')
  })
  updateDay2ResultStatus()
  renderDay2ResultsPreview()
}
function setDay2UploadsFromPatient(patient){
  day2ResultUploads=normalizeDay2Uploads(patient?.initialExam?.testUploads)
  setDay2Test3EarResults(patient?.initialExam?.test3EarResults)
  const tdEl=document.getElementById('day2TotalDates')
  if(tdEl)tdEl.value=patient?String(computeTotalDatesOfService(patient)):''
  const examDateEl=document.getElementById('day2ExamDate')
  if(examDateEl)examDateEl.value=day2FormatAnyDate(patient?.initialExam?.examinationDate||patient?.initialExam?.sessionDate||'')
  renderDay2UploadPreviews()
  ;['test1','test2','test3'].forEach(k=>{const input=document.getElementById(day2UploadInputId(k));if(input)input.value=''})
}

/* pdf.js reads the text out of uploaded test-result PDFs. From version 4 it
   is an ES module only (3.x had CVE-2024-4367). A page opened from disk - the
   offline copy, file:// - cannot import modules, so that copy carries the last
   classic build instead (tools/build_offline.py) and loads it the old way. */
let _pdfjsPromise=null
async function ensurePdfJs(){
  if(window.pdfjsLib){return window.pdfjsLib}
  if(location.protocol==='file:')return loadClassicPdfJs()
  if(!_pdfjsPromise){
    _pdfjsPromise=import('vendor/pdf.min.mjs').then(lib=>{
      lib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.mjs'
      window.pdfjsLib=lib
      return lib
    }).catch(e=>{_pdfjsPromise=null;console.error('pdf.js load failed',e);throw new Error('Could not load PDF text extractor')})
  }
  return _pdfjsPromise
}
function loadClassicPdfJs(){
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ctg-pdfjs="1"]')
    if(existing){existing.addEventListener('load',()=>resolve(window.pdfjsLib));existing.addEventListener('error',()=>reject(new Error('Could not load PDF text extractor')));return}
    const s=document.createElement('script')
    s.src='vendor/pdfjs-legacy/pdf.min.js'
    s.dataset.ctgPdfjs='1'
    s.onload=()=>{
      if(window.pdfjsLib&&window.pdfjsLib.GlobalWorkerOptions){window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs-legacy/pdf.worker.min.js'}
      resolve(window.pdfjsLib)
    }
    s.onerror=()=>reject(new Error('Could not load PDF text extractor'))
    document.head.appendChild(s)
  })
}
function fileToArrayBuffer(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(reader.result)
    reader.onerror=reject
    reader.readAsArrayBuffer(file)
  })
}
function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(reader.result)
    reader.onerror=reject
    reader.readAsDataURL(file)
  })
}
function normalizePdfTextLine(line){return String(line||'').replace(/\s+/g,' ').trim()}
async function extractTextFromPdfPage(page){
  const content=await page.getTextContent()
  const viewport=page.getViewport({scale:1})
  const pageHeight=Number(viewport.height)||0
  const rows=[]
  const pageItems=[]
  ;(content.items||[]).forEach(item=>{
    const text=normalizePdfTextLine(item.str||'')
    if(!text)return
    const tx=item.transform||[1,0,0,1,0,0]
    const x=Number(tx[4])||0
    const rawY=Number(tx[5])||0
    const y=pageHeight?Math.max(0,pageHeight-rawY):rawY
    const width=Number(item.width)||0
    const height=Number(item.height)||0
    const stored={x,y,width,height,text}
    pageItems.push(stored)
    let row=rows.find(r=>Math.abs(r.y-y)<2.5)
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push(stored)
  })
  rows.sort((a,b)=>a.y-b.y)
  const text=rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(it=>it.text).join(' ')).map(normalizePdfTextLine).filter(Boolean).join('\n')
  return {text,items:pageItems,width:Number(viewport.width)||0,height:pageHeight}
}
async function extractDay2PdfFile(file,opts){
  const pdfjs=await ensurePdfJs()
  const buffer=await fileToArrayBuffer(file)
  const pdf=await pdfjs.getDocument({data:buffer,isEvalSupported:false}).promise
  const pageTexts=[]
  const pageItems=[]
  const pageSizes=[]
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i)
    const pageData=await extractTextFromPdfPage(page)
    pageTexts.push(pageData.text)
    pageItems.push(pageData.items||[])
    pageSizes.push({width:pageData.width||0,height:pageData.height||0})
  }
  const text=pageTexts.join('\n')
  // Some uploads (e.g. scanned Shoebox auditory reports) are image-only and
  // carry no selectable text. When allowEmptyText is set we still store the
  // file so it can be included in reports; the result is entered manually.
  if(!normalizePdfTextLine(text)&&!(opts&&opts.allowEmptyText))throw new Error('No selectable text was found. Please use a text-based PDF, not a scanned/image-only PDF.')
  const pdfDataUrl=await fileToDataURL(file)
  return {name:file.name||'uploaded-result.pdf',type:'application/pdf',pages:pdf.numPages,pageTexts,pageItems,pageSizes,text,pdfDataUrl,uploadedAt:new Date().toISOString()}
}
async function handleDay2ResultUpload(testKey,files){
  if(!files||!files.length)return
  const input=document.getElementById(day2UploadInputId(testKey))
  const selectedPart=testKey==='test1'?selectedDay2Test1PartType():''
  const selectedEye=testKey==='test2'?selectedDay2Test2EyeType():''
  try{
    showToast('Extracting text from PDF...')
    const converted=[]
    for(const file of Array.from(files)){
      const isPdf=(file.type==='application/pdf')||/\.pdf$/i.test(file.name||'')
      if(!isPdf){showToast('Only PDF files are supported for this upload area','err');continue}
      // Always store the uploaded file, even if text can't be extracted. Text is
      // only used to auto-fill exam fields; the exact PDF is still needed for the
      // FCR (Sway/Reflex exports and scanned Shoebox PDFs may lack selectable text).
      let extracted
      try{extracted=await extractDay2PdfFile(file,{allowEmptyText:true})}
      catch(err){
        console.warn(testKey+' PDF text extraction failed, storing file as-is',err)
        const pdfDataUrl=await fileToDataURL(file)
        extracted={name:file.name||'uploaded-result.pdf',type:'application/pdf',pages:0,pageTexts:[],pageItems:[],pageSizes:[],text:'',pdfDataUrl,uploadedAt:new Date().toISOString()}
      }

      if(testKey==='test2'){
        const detected=day2AutoDetectEyeType(extracted.text)
        extracted.eyeType=detected||selectedEye
      }
      converted.push(extracted)
    }
    if(converted.length){
      if(testKey==='test1'){
        day2ResultUploads.test1=[...(day2ResultUploads.test1||[]),...converted]
      }else if(testKey==='test2'){
        let cur=[...(day2ResultUploads.test2||[])]
        for(const f of converted){
          const eye=day2Test2EyeLabel(f)
          cur=cur.filter(x=>day2Test2EyeLabel(x)!==eye)
          cur.push(f)
        }
        day2ResultUploads.test2=cur
      }else{
        // Test 3 normally uses one PDF. Replacing avoids accidentally mixing old files.
        day2ResultUploads[testKey]=converted
      }
    }
    renderDay2UploadPreviews()
    showToast(DAY2_RESULT_LABELS[testKey]+(testKey==='test3'?' PDF stored ✓':' PDF extracted ✓'))
  }catch(e){console.error(e);showToast('Could not extract PDF text: '+e.message,'err')}
  finally{if(input)input.value=''}
}
function removeDay2ResultUpload(testKey,index){
  if(!day2ResultUploads[testKey])return
  day2ResultUploads[testKey].splice(index,1)
  renderDay2UploadPreviews()
}
function clearDay2ResultUpload(testKey){
  if(testKey==='test2'){
    const selectedEye=selectedDay2Test2EyeType()
    day2ResultUploads.test2=(day2ResultUploads.test2||[]).filter(f=>day2Test2EyeLabel(f)!==selectedEye)
  }else{
    day2ResultUploads[testKey]=[]
  }
  const input=document.getElementById(day2UploadInputId(testKey));if(input)input.value=''
  renderDay2UploadPreviews()
}
function clearAllDay2ResultUploads(testKey){
  day2ResultUploads[testKey]=[]
  const input=document.getElementById(day2UploadInputId(testKey));if(input)input.value=''
  renderDay2UploadPreviews()
}

/* ---------- Daily Notes ---------- */
let dnCurrentNoteIndex = -1
let dnShoeboxPdfUploads=[]
let pdnShoeboxPdfUploads=[]

function makeLocalId(prefix){return (prefix||'id')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function clonePlain(obj){return JSON.parse(JSON.stringify(obj||{}))}
function cloneUploadList(list){return JSON.parse(JSON.stringify(Array.isArray(list)?list:[]))}
function normalizeDailyShoeboxUploads(note){return Array.isArray(note?.shoeboxPdfUploads)?note.shoeboxPdfUploads:[]}
function _ensureDailyNoteId(note){if(note && !note.id)note.id=makeLocalId('dn');return note}
function ensurePatientDailyNoteIds(p){if(!p||!Array.isArray(p.dailyNotes))return;(p.dailyNotes||[]).forEach(_ensureDailyNoteId)}
function _dailyNoteHasShoebox(note){return _shoeboxAnswered({left:note?.shoeboxLeftEar,right:note?.shoeboxRightEar,indication:note?.shoeboxIndication})||normalizeDailyShoeboxUploads(note).length>0}
function _examTest3Uploads(exam){const u=normalizeDay2Uploads(exam?.testUploads||{});return u.test3||[]}
function _setExamTest3Uploads(exam,uploads){if(!exam.testUploads)exam.testUploads={test1:[],test2:[],test3:[]};exam.testUploads=normalizeDay2Uploads(exam.testUploads);exam.testUploads.test3=cloneUploadList(uploads)}
function _clearExamTest3(exam){if(!exam)return;exam.test3EarResults={left:'',right:'',indication:''};if(exam.testUploads){exam.testUploads=normalizeDay2Uploads(exam.testUploads);exam.testUploads.test3=[]}delete exam.test3LinkedDailyNoteId;delete exam.test3LinkedDailyNoteTarget}
function _clearNoteShoeboxFields(note){if(!note)return;note.shoeboxLeftEar='';note.shoeboxRightEar='';note.shoeboxIndication='';note.shoeboxTarget='';note.shoeboxPdfUploads=[];delete note.shoeboxLink}
function _findDailyNoteById(p,noteId){if(!p||!Array.isArray(p.dailyNotes)||!noteId)return {note:null,index:-1};ensurePatientDailyNoteIds(p);const index=p.dailyNotes.findIndex(n=>n.id===noteId);return {note:index>=0?p.dailyNotes[index]:null,index}}
function _getLinkedExamFromNote(p,note){const link=note?.shoeboxLink;if(!p||!link)return null;if(link.arrayKey==='initialExam')return {exam:p.initialExam,arrayKey:'initialExam',index:null};if(link.arrayKey==='reExams')return {exam:Array.isArray(p.reExams)?p.reExams[Number(link.index)]:null,arrayKey:'reExams',index:Number(link.index)};if(link.arrayKey==='finalExam')return {exam:p.finalExam,arrayKey:'finalExam',index:null};return null}
function _detachDailyShoeboxTarget(p,note){
  if(!p||!note)return
  const linked=_getLinkedExamFromNote(p,note)
  if(linked?.exam && linked.exam.test3LinkedDailyNoteId===note.id)_clearExamTest3(linked.exam)
  delete note.shoeboxLink
}
function _resolveDailyShoeboxTargetExam(p,cat,noteDate){
  if(cat==='initialExam'){
    if(!p.initialExam||!p.initialExam.savedAt)throw new Error('No saved Day 2 was found for this patient.')
    return {exam:p.initialExam,arrayKey:'initialExam',index:null,label:'Day 2'}
  }
  if(cat==='reExam'){
    if(!Array.isArray(p.reExams))p.reExams=[]
    const idx=_findReExamForDailyShoebox(p,noteDate)
    if(idx<0)throw new Error('No earlier Re-Examination was found before this daily note date.')
    return {exam:p.reExams[idx],arrayKey:'reExams',index:idx,label:patientDetailOrdinalExamLabel(idx)}
  }
  return null
}
function _dailyShoeboxConflictMessage(label){return 'A Test 3 result was already saved on '+label+'. Please remove that Test 3 result first before attaching this Daily Note Auditory Screening result.'}
function _applyDailyShoeboxTargetToPatient(p,cat,earResults,noteDate,opts){
  opts=opts||{}
  const note=opts.note||null
  const noteId=opts.noteId||(note&&note.id)||''
  const pdfUploads=cloneUploadList(opts.pdfUploads||[])
  if(cat==='upload'){
    if(note){note.shoeboxLink=null}
    return 'Audiologic Function Test will be billed on this daily note ✓'
  }
  const target=_resolveDailyShoeboxTargetExam(p,cat,noteDate)
  if(!target)return ''
  const exam=target.exam
  const hasExisting=_billingHasTest3(exam)
  const sameLinked=noteId && exam.test3LinkedDailyNoteId===noteId
  if(hasExisting && !sameLinked)throw new Error(_dailyShoeboxConflictMessage(target.label))
  exam.test3EarResults={left:earResults.left||'',right:earResults.right||'',indication:earResults.indication||''}
  _setExamTest3Uploads(exam,pdfUploads)
  if(noteId){exam.test3LinkedDailyNoteId=noteId;exam.test3LinkedDailyNoteTarget=cat}
  if(note){note.shoeboxLink={arrayKey:target.arrayKey,index:target.index,target:cat,examLabel:target.label}}
  return 'Test 3 results saved to '+target.label+' ✓'
}
function syncDailyNoteShoeboxTarget(p,newNote,oldNote){
  if(!p||!newNote)return ''
  _ensureDailyNoteId(newNote)
  if(oldNote && oldNote.id && oldNote.id!==newNote.id)newNote.id=oldNote.id
  if(oldNote && oldNote.shoeboxLink){
    const oldCat=oldNote.shoeboxTarget||oldNote.shoeboxLink.target||''
    const changedTarget=oldCat!==(newNote.shoeboxTarget||'')
    const noLongerHas=!_dailyNoteHasShoebox(newNote)||!newNote.shoeboxTarget
    if(changedTarget||noLongerHas)_detachDailyShoeboxTarget(p,oldNote)
  }
  if(_dailyNoteHasShoebox(newNote) && newNote.shoeboxTarget){
    return _applyDailyShoeboxTargetToPatient(p,newNote.shoeboxTarget,{left:newNote.shoeboxLeftEar,right:newNote.shoeboxRightEar,indication:newNote.shoeboxIndication},newNote.sessionDate,{note:newNote,noteId:newNote.id,pdfUploads:newNote.shoeboxPdfUploads})
  }
  if(!_dailyNoteHasShoebox(newNote))delete newNote.shoeboxLink
  return ''
}
function syncLinkedDailyNoteFromExamSave(p,origExam,newExam,arrayKey,index){
  const noteId=origExam?.test3LinkedDailyNoteId
  if(!p||!noteId)return
  const found=_findDailyNoteById(p,noteId), note=found.note
  if(!note)return
  if(!_billingHasTest3(newExam)){
    _clearNoteShoeboxFields(note)
    delete newExam.test3LinkedDailyNoteId;delete newExam.test3LinkedDailyNoteTarget
    return
  }
  const er=newExam.test3EarResults||{}
  note.shoeboxLeftEar=er.left||'';note.shoeboxRightEar=er.right||'';note.shoeboxIndication=er.indication||''
  note.shoeboxPdfUploads=cloneUploadList(_examTest3Uploads(newExam))
  note.shoeboxTarget=arrayKey==='initialExam'?'initialExam':'reExam'
  note.shoeboxLink={arrayKey,index:index==null?null:index,target:note.shoeboxTarget,examLabel:arrayKey==='initialExam'?'Day 2':patientDetailOrdinalExamLabel(index||0)}
  newExam.test3LinkedDailyNoteId=noteId
  newExam.test3LinkedDailyNoteTarget=note.shoeboxTarget
}
function detachLinkedDailyNoteFromExamDelete(p,exam){
  const noteId=exam?.test3LinkedDailyNoteId
  if(!noteId)return
  const found=_findDailyNoteById(p,noteId)
  if(found.note)_clearNoteShoeboxFields(found.note)
}
function renderDailyNoteShoeboxPdfPreview(scope){
  const list=scope==='dedicated'?pdnShoeboxPdfUploads:dnShoeboxPdfUploads
  const box=document.getElementById(scope==='dedicated'?'pdnShoeboxPdfPreview':'dnShoeboxPdfPreview')
  if(!box)return
  if(!list.length){box.innerHTML='<div class="dn-pdf-empty">No Auditory Screening PDF uploaded yet.</div>';return}
  box.innerHTML=list.map((f,i)=>`<div class="dn-pdf-item"><div class="dn-pdf-name">PDF · ${escHtml(f.name||'Auditory Screening PDF')}</div><div class="dn-pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-onclick="removeDailyNoteShoeboxPdf(${i},'${scope}')">Remove</button></div></div>`).join('')
}
async function handleDailyNoteShoeboxPdfUpload(files,scope){
  if(!files||!files.length)return
  const input=document.getElementById(scope==='dedicated'?'pdnShoeboxPdfFile':'dnShoeboxPdfFile')
  try{
    showToast('Extracting Auditory Screening PDF...')
    const file=Array.from(files)[0]
    const isPdf=(file.type==='application/pdf')||/\.pdf$/i.test(file.name||'')
    if(!isPdf){showToast('Only PDF files are supported','err');return}
    const extracted=await extractDay2PdfFile(file)
    extracted.source='Daily Note Auditory Screening'
    if(scope==='dedicated')pdnShoeboxPdfUploads=[extracted]
    else dnShoeboxPdfUploads=[extracted]
    renderDailyNoteShoeboxPdfPreview(scope)
    showToast('Auditory Screening PDF uploaded ✓')
  }catch(e){console.error(e);showToast('Could not extract Auditory Screening PDF: '+(e.message||e),'err')}
  finally{if(input)input.value=''}
}
function removeDailyNoteShoeboxPdf(index,scope){
  if(scope==='dedicated')pdnShoeboxPdfUploads.splice(index,1)
  else dnShoeboxPdfUploads.splice(index,1)
  renderDailyNoteShoeboxPdfPreview(scope)
}

function updateDnContextBar() {
  dnPopulateNameDropdown();examPopulatePatientDropdown()
  const p = getPatient(selectedPatientId)
  const name = p ? naturalPatientName(p) : '—'
  const el = document.getElementById('dnBarPatient')
  if (el) el.textContent = name
  const tag = document.getElementById('dnPatientTag')
  if (tag) tag.textContent = p ? name : 'No Patient Selected'
  dnLoadCurrentNote()
  dnRefreshBoilerplate()
}

function dnAutoComputeTimes() {
  const startVal = document.getElementById('dnStartTimeNeuroTx')?.value
  const addMin = (t, m) => {
    const [h, mn] = t.split(':').map(Number)
    const tot = h * 60 + mn + m
    return String(Math.floor(tot / 60) % 24).padStart(2,'0') + ':' + String(tot % 60).padStart(2,'0')
  }
  const fmt12 = t => {
    if (!t) return '—'
    let [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'pm' : 'am'
    h = h % 12 || 12
    return h + ':' + String(m).padStart(2,'0') + ' ' + ampm
  }
  const setHidden = (id, val) => { const el = document.getElementById(id); if (el) el.value = val }
  const setDisp = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = fmt12(t) }

  if (!startVal) {
    ['dispNmrEyeStart','dispNmrEyeEnd','dispNmrBalStart','dispNmrBalEnd',
     'dispCog1Start','dispCog1End','dispCog2Start','dispCog2End',
     'dispTherExStart','dispTherExEnd','dispEndNeuroTx'].forEach(id => {
       const el = document.getElementById(id); if (el) el.textContent = '—'
    })
    return
  }
  const nmrEyeS = startVal,          nmrEyeE = addMin(nmrEyeS, 8)
  const nmrBalS = nmrEyeE,            nmrBalE = addMin(nmrBalS, 7)
  const cog1S   = nmrBalE,            cog1E   = addMin(cog1S, 15)
  const cog2S   = cog1E,              cog2E   = addMin(cog2S, 15)
  const therS   = cog2E,              therE   = addMin(therS, 15)

  setHidden('dnNmrEyeStart', nmrEyeS); setHidden('dnNmrEyeEnd', nmrEyeE)
  setHidden('dnNmrBalStart', nmrBalS); setHidden('dnNmrBalEnd', nmrBalE)
  setHidden('dnCog1Start',   cog1S);   setHidden('dnCog1End',   cog1E)
  setHidden('dnCog2Start',   cog2S);   setHidden('dnCog2End',   cog2E)
  setHidden('dnTherExStart', therS);   setHidden('dnTherExEnd', therE)
  setHidden('dnEndTimeNeuroTx', therE)

  setDisp('dispNmrEyeStart', nmrEyeS); setDisp('dispNmrEyeEnd', nmrEyeE)
  setDisp('dispNmrBalStart', nmrBalS); setDisp('dispNmrBalEnd', nmrBalE)
  setDisp('dispCog1Start',   cog1S);   setDisp('dispCog1End',   cog1E)
  setDisp('dispCog2Start',   cog2S);   setDisp('dispCog2End',   cog2E)
  setDisp('dispTherExStart', therS);   setDisp('dispTherExEnd', therE)
  const endEl = document.getElementById('dispEndNeuroTx'); if (endEl) endEl.textContent = fmt12(therE)
}

function examPopulatePatientDropdown(){
  const sel=document.getElementById('examPatientSelect')
  if(!sel)return
  const current=sel.value
  sel.innerHTML='<option value="">— Select Patient —</option>'
  ctgPatients.filter(p=>!isPatientInactive(p)).sort((a,b)=>naturalPatientName(a).localeCompare(naturalPatientName(b))).forEach(p=>{
    const opt=document.createElement('option')
    opt.value=p.id
    opt.textContent=naturalPatientName(p)
    sel.appendChild(opt)
  })
  if(current)sel.value=current
}
function examOnPatientSelect(){
  const sel=document.getElementById('examPatientSelect')
  if(!sel)return
  if(!sel.value){
    if(day2EditorMountedIn==='day2'){
      selectedPatientId=null
      day2EditAttempt=null
      day2ResultUploads={test1:[],test2:[],test3:[]}
      setDay2Test3EarResults({})
      renderDay2UploadPreviews()
      updateDay2ContextBar()
    }
    return
  }
  selectedPatientId=sel.value
  ctgAuditChartView(sel.value,'exam')
  day2EditAttempt=null
  const p=getPatient(selectedPatientId)
  if(p){
    setDay2UploadsFromPatient(p)
    updateDay2ContextBar()
  }
}

function dnPopulateNameDropdown(){
  const sel=document.getElementById('dnName')
  if(!sel)return
  const current=sel.value
  sel.innerHTML='<option value="">— Select Patient —</option>'
  ctgPatients.filter(p=>!isPatientInactive(p)).sort((a,b)=>naturalPatientName(a).localeCompare(naturalPatientName(b))).forEach(p=>{
    const name=naturalPatientName(p)
    const opt=document.createElement('option')
    opt.value=name
    opt.dataset.patientId=p.id
    opt.textContent=name
    sel.appendChild(opt)
  })
  if(current)sel.value=current
}
function dnOnPatientSelect(){
  const sel=document.getElementById('dnName')
  if(!sel)return
  const opt=[...sel.options].find(o=>o.value===sel.value)
  if(opt&&opt.dataset.patientId){
    selectedPatientId=opt.dataset.patientId
    ctgAuditChartView(opt.dataset.patientId,'dailyNotes')
    dnRefreshBoilerplate()
    dnPopulateShoeboxCategoryDropdown()
    updateDnContextBar()
  }
}

function openExamCategory(category){
  // Highlight the active sublink
  ;['sideExamInitial','sideExamRe','sideExamFinal'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.classList.remove('active')
  })
  const map={'Day 2':'sideExamInitial','Re-Examination':'sideExamRe','Final Examination':'sideExamFinal'}
  const active=document.getElementById(map[category]); if(active)active.classList.add('active')
  renderExamCategoryPage(category)
  showPage('examCategory')
}

function renderExamCategoryPage(category){
  const avatarMap={'Day 2':'IE','Re-Examination':'RE','Final Examination':'FE'}
  const av=document.getElementById('examCatAvatar'); if(av)av.textContent=avatarMap[category]||'EX'
  const ti=document.getElementById('examCatTitle'); if(ti)ti.textContent=category
  const ct=document.getElementById('examCatCardTitle'); if(ct)ct.textContent=category+' Records'
  const matches=ctgPatients.filter(p=>normalizeExamCategoryForSelect(p.initialExam?.examCategory,'')===normalizeExamCategoryForSelect(category,'')&&!isPatientInactive(p))
  const countEl=document.getElementById('examCatCount'); if(countEl)countEl.textContent=matches.length+' Record'+(matches.length!==1?'s':'')
  const sub=document.getElementById('examCatSub'); if(sub)sub.textContent=matches.length?'Showing all saved '+category.toLowerCase()+' records':'No saved records yet'
  const list=document.getElementById('examCatList')
  if(!list)return
  if(!matches.length){
    list.innerHTML='<div data-cs="'+__cs+'padding:32px;text-align:center;color:var(--muted);font-size:13px">No exams saved under this category yet.</div>'
    return
  }
  list.innerHTML=matches.map(p=>{
    const name=naturalPatientName(p)
    const dob=p.demographics?.dob||'—'
    const doi=p.demographics?.doi||'—'
    const saved=p.initialExam?.savedAt?new Date(p.initialExam.savedAt).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}):'—'
    return `<div data-cs="${__cs}display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);gap:12px;flex-wrap:wrap">
      <div data-cs="${__cs}display:flex;align-items:center;gap:12px">
        <div class="pt-av" data-cs="${__cs}width:36px;height:36px;font-size:12px;flex-shrink:0">${(name.split(' ').map(w=>w[0]||'').join('').slice(0,2)).toUpperCase()}</div>
        <div>
          <div data-cs="${__cs}font-size:13px;font-weight:600">${name}</div>
          <div data-cs="${__cs}font-size:11px;color:var(--muted);margin-top:2px">DOB: ${dob} &nbsp;·&nbsp; DOI: ${doi} &nbsp;·&nbsp; Saved: ${saved}</div>
        </div>
      </div>
      <div data-cs="${__cs}display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-primary btn-sm" data-onclick="viewPatientExamResult('${p.id}','initialExam')">View Result</button>
        <button class="btn btn-ghost btn-sm" data-onclick="openPatientExamDetail('${p.id}','initialExam')">Edit</button>
        <button class="btn btn-ghost btn-sm" data-onclick="exportInitialExamPDF(null,'${p.id}')">Download PDF</button>
      </div>
    </div>`
  }).join('')
}

function toggleDnShoebox(){
  const card=document.getElementById('dnShoeboxCard')
  const btn=document.getElementById('dnShoeboxToggleBtn')
  const open=card.style.display==='none'
  card.style.display=open?'block':'none'
  if(open)dnPopulateShoeboxCategoryDropdown()
  btn.innerHTML=open
    ?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Optional: Auditory Screening'
    :'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Optional: Auditory Screening'
}
function dnShoeboxClear(){
  const s=id=>document.getElementById(id)
  if(s('dnShoeboxLeftEar'))s('dnShoeboxLeftEar').value=''
  if(s('dnShoeboxRightEar'))s('dnShoeboxRightEar').value=''
  if(s('dnShoeboxIndication'))s('dnShoeboxIndication').value=''
  if(s('dnShoeboxTargetCategory'))s('dnShoeboxTargetCategory').value=''
  dnShoeboxPdfUploads=[]
  ;['dnShoeboxLeftEar','dnShoeboxRightEar','dnShoeboxTargetCategory'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''})
  {const el=document.getElementById('dnAppointmentType');if(el)el.value='Therapy Visit'}
  renderDailyNoteShoeboxPdfPreview('main')
}

function dnPopulateShoeboxCategoryDropdown(){
  const sel=document.getElementById('dnShoeboxTargetCategory')
  if(!sel)return
  const current=sel.value
  sel.innerHTML='<option value="">— Select Category —</option>'
    +'<option value="initialExam">Day 2</option>'
    +'<option value="reExam">Re-Examination</option>'
    +'<option value="upload">Upload</option>'
  if(current)sel.value=current
}
// True when a Test 3 (Auditory) ear-result record has any answer.
function _shoeboxAnswered(er){
  const r=er||{}
  return !!(String(r.left||'').trim()||String(r.right||'').trim()||String(r.indication||'').trim())
}
function _dailyNoteDateKeyValue(value){
  const raw=day2FormatAnyDate(value)||String(value||'').trim()
  const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if(m)return new Date(+m[3],+m[1]-1,+m[2]).getTime()
  const t=Date.parse(raw)
  return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER
}
function _findReExamForDailyShoebox(p,noteDate){
  const arr=Array.isArray(p?.reExams)?p.reExams:[]
  if(!arr.length)return -1
  const noteKey=_dailyNoteDateKeyValue(noteDate)
  const withIdx=arr.map((rx,i)=>({rx,i,key:_dailyNoteDateKeyValue(rx.examinationDate||rx.sessionDate||rx.savedDisplay||rx.savedAt)}))
    .sort((a,b)=>a.key-b.key||a.i-b.i)
  // For a Daily Note targeted to Re-Examination, attach Test 3 to the most
  // recent Re-Examination that happened before/on the Daily Note date.
  // This keeps the billing on the earlier Re-Exam that the later note follows.
  const previous=[...withIdx].reverse().find(x=>x.key<=noteKey)
  return previous?previous.i:-1
}
function dnSaveShoeboxToExamCategory(){
  const p=getPatient(selectedPatientId)
  if(!p){showToast('Please select a patient first','err');return}
  if(dnCurrentNoteIndex<0 || !Array.isArray(p.dailyNotes) || !p.dailyNotes[dnCurrentNoteIndex]){
    showToast('Please save the daily note first, then attach the Auditory Screening result to its target.','err');return
  }
  const note=dnCollect()
  note.id=p.dailyNotes[dnCurrentNoteIndex].id||makeLocalId('dn')
  const oldNote=clonePlain(p.dailyNotes[dnCurrentNoteIndex])
  let msg=''
  try{msg=syncDailyNoteShoeboxTarget(p,note,oldNote)}
  catch(e){showToast(e.message||'Could not attach Test 3 results to the selected category','err');return}
  p.dailyNotes[dnCurrentNoteIndex]=note
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(p.id)
  if(msg)showToast(msg)
}
function dnSyncSessionDate(){
  const v=document.getElementById('dnSessionDate')?.value||''
  const dos=document.getElementById('dnDosDate')
  const pnd=document.getElementById('dnPatientNoteDate')
  if(dos)dos.value=v
  if(pnd)pnd.value=v
}

function dnSyncTime(){
  const raw=document.getElementById('dnTime')?.value||''
  const el=document.getElementById('dnStartTimeNeuroTx')
  if(!el)return
  const m=raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if(!m){el.value='';dnAutoComputeTimes();return}
  let h=parseInt(m[1])
  const min=m[2],ap=m[3].toUpperCase()
  if(ap==='AM'){if(h===12)h=0}else{if(h!==12)h+=12}
  el.value=String(h).padStart(2,'0')+':'+min
  dnAutoComputeTimes()
}

function dnCollect() {
  return {
    name: document.getElementById('dnName')?.value || '',
    sessionDate: document.getElementById('dnSessionDate')?.value || '',
    appointmentType: 'Therapy Visit',
    time: document.getElementById('dnTime')?.value || '',
    patientNoteDate: document.getElementById('dnPatientNoteDate')?.value || '',
    patientNote: document.getElementById('dnPatientNote')?.value || '',
    dosDate: document.getElementById('dnDosDate')?.value || '',
    startTimeNeuroTx: document.getElementById('dnStartTimeNeuroTx')?.value || '',
    nmrEyeStart: document.getElementById('dnNmrEyeStart')?.value || '',
    nmrEyeEnd: document.getElementById('dnNmrEyeEnd')?.value || '',
    nmrBalStart: document.getElementById('dnNmrBalStart')?.value || '',
    nmrBalEnd: document.getElementById('dnNmrBalEnd')?.value || '',
    cog1Start: document.getElementById('dnCog1Start')?.value || '',
    cog1End: document.getElementById('dnCog1End')?.value || '',
    cog2Start: document.getElementById('dnCog2Start')?.value || '',
    cog2End: document.getElementById('dnCog2End')?.value || '',
    therExStart: document.getElementById('dnTherExStart')?.value || '',
    therExEnd: document.getElementById('dnTherExEnd')?.value || '',
    endTimeNeuroTx: document.getElementById('dnEndTimeNeuroTx')?.value || '',
    recommendation: document.getElementById('dnRecommendation')?.value || 'Continue Treatment Plan',
    shoeboxLeftEar: document.getElementById('dnShoeboxLeftEar')?.value || '',
    shoeboxRightEar: document.getElementById('dnShoeboxRightEar')?.value || '',
    shoeboxIndication: document.getElementById('dnShoeboxIndication')?.value || '',
    shoeboxTarget: document.getElementById('dnShoeboxTargetCategory')?.value || '',
    shoeboxPdfUploads: cloneUploadList(dnShoeboxPdfUploads),
    savedAt: new Date().toISOString()
  }
}

function dnPopulate(note) {
  if (!note) return
  function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v || '' }
  sv('dnName', note.name)
  sv('dnSessionDate', note.sessionDate)
  sv('dnAppointmentType', 'Therapy Visit')
  sv('dnTime', note.time)
  sv('dnPatientNote', note.patientNote)
  sv('dnShoeboxLeftEar', note.shoeboxLeftEar)
  sv('dnShoeboxRightEar', note.shoeboxRightEar)
  sv('dnShoeboxIndication', note.shoeboxIndication)
  dnShoeboxPdfUploads=cloneUploadList(normalizeDailyShoeboxUploads(note))
  renderDailyNoteShoeboxPdfPreview('main')
  if(note.shoeboxLeftEar||note.shoeboxRightEar||note.shoeboxIndication||dnShoeboxPdfUploads.length){
    const c=document.getElementById('dnShoeboxCard'); if(c)c.style.display='block'
    dnPopulateShoeboxCategoryDropdown()
    sv('dnShoeboxTargetCategory', note.shoeboxTarget)
  }
  dnSyncSessionDate()
  dnSyncTime()
  sv('dnStartTimeNeuroTx', note.startTimeNeuroTx)
  sv('dnNmrEyeStart', note.nmrEyeStart)
  sv('dnNmrEyeEnd', note.nmrEyeEnd)
  sv('dnNmrBalStart', note.nmrBalStart)
  sv('dnNmrBalEnd', note.nmrBalEnd)
  sv('dnCog1Start', note.cog1Start)
  sv('dnCog1End', note.cog1End)
  sv('dnCog2Start', note.cog2Start)
  sv('dnCog2End', note.cog2End)
  sv('dnTherExStart', note.therExStart)
  sv('dnTherExEnd', note.therExEnd)
  sv('dnEndTimeNeuroTx', note.endTimeNeuroTx)
  sv('dnRecommendation', note.recommendation || 'Continue Treatment Plan')
  dnAutoComputeTimes()
}

function dnClearForm() {
  document.querySelectorAll('#page-dailyNotes input, #page-dailyNotes textarea').forEach(el => {
    if (el.type === 'checkbox') el.checked = false
    else if (el.type === 'file') el.value = ''
    else if (el.id === 'dnRecommendation') el.value = 'Continue Treatment Plan'
    else el.value = ''
  })
  document.querySelectorAll('#page-dailyNotes select').forEach(el => { el.value = '' })
  // Appointment Type is fixed to Therapy Visit (not editable) - restore after clearing.
  const apptEl=document.getElementById('dnAppointmentType'); if(apptEl)apptEl.value='Therapy Visit'
  dnShoeboxPdfUploads=[]
  renderDailyNoteShoeboxPdfPreview('main')
  const shoeboxCard=document.getElementById('dnShoeboxCard')
  if(shoeboxCard)shoeboxCard.style.display='none'
  const shoeboxBtn=document.getElementById('dnShoeboxToggleBtn')
  if(shoeboxBtn)shoeboxBtn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Optional: Auditory Screening'
  // Default session date to today
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth()+1).padStart(2,'0')
  const dd = String(today.getDate()).padStart(2,'0')
  const el = document.getElementById('dnSessionDate')
  if (el && !el.value) { el.value = mm+'/'+dd+'/'+yyyy; dnSyncSessionDate() }
  const dt = document.getElementById('dnDate')
  if (dt && !dt.value) dt.value = mm+'/'+dd+'/'+yyyy
  const nm = document.getElementById('dnName')
  if (nm && !nm.value) { const p=getPatient(selectedPatientId); if(p) nm.value=naturalPatientName(p) }
  dnPopulateNameDropdown();examPopulatePatientDropdown()
  // Auto-fill DOI from patient's ACE Day 1 form
  const doiEl = document.getElementById('dnDoi')
  if (doiEl && !doiEl.value) {
    const p = getPatient(selectedPatientId)
    const aceDoi = p?.ace?.formState?.inputs?.doi || p?.ace?.formState?.selects?.doi || ''
    if (aceDoi) { doiEl.value = aceDoi; dnRefreshBoilerplate() }
  }
}

function dnLoadCurrentNote() {
  const p = getPatient(selectedPatientId)
  const notes = (p && p.dailyNotes) ? p.dailyNotes : []
  if (dnCurrentNoteIndex >= 0 && dnCurrentNoteIndex < notes.length) {
    // A specific note was explicitly opened for editing -> keep showing it
    dnPopulate(notes[dnCurrentNoteIndex])
  } else {
    // Default: start a fresh blank note so "Save Note" adds a new one
    dnCurrentNoteIndex = -1
    dnClearForm()
  }
  // Reflect (or clear) the signed lock for whatever is now on screen.
  dnApplyLockState()
}

let patientDailyNoteState={patientId:null,index:-1,mode:'view'}

function openDailyNoteForPatient(id){
  openPatientDailyNoteDedicated(id,-1,'edit')
}
function openDailyNoteAtIndex(id,index){
  openPatientDailyNoteDedicated(id,index,'edit')
}
function viewDailyNoteAtIndex(id,index){
  openPatientDailyNoteDedicated(id,index,'view')
}
function editDailyNoteAtIndex(id,index){
  openPatientDailyNoteDedicated(id,index,'edit')
}
function openPatientDailyNoteDedicated(id,index,mode){
  ctgAuditChartView(id,'dailyNotes')
  const p=getPatient(id)
  if(!p){showToast('Patient not found','err');return}
  selectedPatientId=id
  patientDailyNoteState={patientId:id,index:Number.isFinite(Number(index))?Number(index):-1,mode:mode||'view'}
  if(patientDailyNoteState.index>=0){
    const notes=Array.isArray(p.dailyNotes)?p.dailyNotes:[]
    if(!notes[patientDailyNoteState.index]){showToast('Daily note not found','err');return}
  }
  renderPatientDailyNoteDedicatedPage()
  showPage('patientDailyNote')
}
function pdnNoteNumberLabel(){
  const st=patientDailyNoteState||{}
  return st.index>=0?'Note #'+(st.index+1):'New Daily Note'
}
function pdnSetValue(id,val){const el=document.getElementById(id);if(el)el.value=val||''}
function pdnGetValue(id){return document.getElementById(id)?.value||''}
// Time helpers: <input type=time> uses 24h "HH:MM"; we store/display 12h "h:MM AM/PM".
function timeTo24h(t){const s=String(t||'').trim();if(!s)return '';const m=s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);if(!m)return '';let h=+m[1];const min=m[2],ap=m[3]?m[3].toUpperCase():'';if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;return String(h).padStart(2,'0')+':'+min}
function timeTo12h(t){const s=String(t||'').trim();if(!s)return '';const m=s.match(/^(\d{1,2}):(\d{2})$/);if(!m)return s;let h=+m[1];const min=m[2],ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+min+' '+ap}
function pdnCollect(){
  const p=getPatient(patientDailyNoteState.patientId)
  return {
    name:p?naturalPatientName(p):pdnGetValue('pdnPatientName'),
    sessionDate:pdnGetValue('pdnSessionDate'),
    appointmentType:'Therapy Visit',
    time:timeTo12h(pdnGetValue('pdnTime')),
    patientNoteDate:pdnGetValue('pdnSessionDate'),
    patientNote:pdnGetValue('pdnPatientNote'),
    dosDate:pdnGetValue('pdnSessionDate'),
    startTimeNeuroTx:'',nmrEyeStart:'',nmrEyeEnd:'',nmrBalStart:'',nmrBalEnd:'',cog1Start:'',cog1End:'',cog2Start:'',cog2End:'',therExStart:'',therExEnd:'',endTimeNeuroTx:'',
    recommendation:'Continue Treatment Plan',
    shoeboxLeftEar:pdnGetValue('pdnShoeboxLeftEar'),
    shoeboxRightEar:pdnGetValue('pdnShoeboxRightEar'),
    shoeboxIndication:'',
    shoeboxTarget:pdnGetValue('pdnShoeboxTarget'),
    shoeboxPdfUploads:cloneUploadList(pdnShoeboxPdfUploads),
    savedAt:new Date().toISOString()
  }
}
function renderPatientDailyNoteDedicatedPage(){
  const st=patientDailyNoteState||{}, p=getPatient(st.patientId||selectedPatientId)
  const mount=document.getElementById('patientDailyNoteMount')
  const bar=document.getElementById('pdnBarPatient')
  const actions=document.getElementById('pdnActionButtons')
  if(!mount)return
  if(!p){mount.innerHTML='<div class="patient-detail-empty pld-detail-empty">Select a patient note to continue.</div>'; if(bar)bar.textContent='—'; if(actions)actions.innerHTML='<button class="btn btn-ghost btn-sm" data-onclick="showPage(\'patientLists\')">← Back to Patient Lists</button>'; return}
  const notes=Array.isArray(p.dailyNotes)?p.dailyNotes:[]
  const note=st.index>=0?(notes[st.index]||{}):{}
  const mode=st.mode==='edit'?'edit':'view'
  const name=naturalPatientName(p)
  if(bar)bar.textContent=name+' · '+pdnNoteNumberLabel()
  const backBtn='<button class="btn btn-ghost btn-sm" data-onclick="showPage(\'patientLists\')">← Back to Patient Lists</button>'
  const readOnly=currentUserIsProvider()
  if(actions){
    if(mode==='edit')actions.innerHTML=backBtn+'<button class="btn btn-primary btn-sm" data-onclick="savePatientDailyNoteDedicated()">Save Note</button>'
    else actions.innerHTML=backBtn+(readOnly?'':'<button class="btn btn-primary btn-sm" data-onclick="editDailyNoteAtIndex(\''+p.id+'\','+st.index+')">Edit Note</button>')
  }
  const sub=mode==='edit'?(st.index>=0?'Editing saved daily note':'Create a new daily note for this patient'):'Viewing saved daily note'
  const hero=`<div class="pdn-hero"><div class="pdn-title-row"><div class="pdn-avatar">${escHtml(initialsForPatient(p))}</div><div><div class="pdn-title">${escHtml(name)}</div><div class="pdn-sub">${escHtml(pdnNoteNumberLabel())} · ${escHtml(sub)}</div></div></div><div class="pdn-actions">${(mode==='view'&&!readOnly)?`<button class="btn btn-primary btn-sm" data-onclick="editDailyNoteAtIndex('${p.id}',${st.index})">Edit Note</button>`:''}<button class="btn btn-ghost btn-sm" data-onclick="showPage('patientLists')">Back to Patient Lists</button></div></div>`
  if(mode==='view'){
    mount.innerHTML=hero+`<div class="pdn-card"><div class="pdn-view-grid">
      <div class="pdn-view-item"><div class="pdn-view-label">Patient</div><div class="pdn-view-value">${escHtml(name)}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Session Date</div><div class="pdn-view-value">${escHtml(plainOrDash(note.sessionDate))}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Appointment Type</div><div class="pdn-view-value">${escHtml(plainOrDash(note.appointmentType))}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Time</div><div class="pdn-view-value">${escHtml(plainOrDash(note.time))}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Left Ear</div><div class="pdn-view-value">${escHtml(plainOrDash(note.shoeboxLeftEar))}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Right Ear</div><div class="pdn-view-value">${escHtml(plainOrDash(note.shoeboxRightEar))}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Shoebox Billing Target</div><div class="pdn-view-value">${escHtml(note.shoeboxTarget==='initialExam'?'Day 2':note.shoeboxTarget==='reExam'?'Re-Examination':note.shoeboxTarget==='upload'?'Upload / This Note':'—')}</div></div>
      <div class="pdn-view-item"><div class="pdn-view-label">Auditory Screening PDF</div><div class="pdn-view-value">${escHtml((normalizeDailyShoeboxUploads(note)[0]||{}).name||'—')}</div></div>
    </div><div class="pdn-view-label">Patient Daily Note Following Treatment Session</div><div class="pdn-note-box">${escHtml(note.patientNote||'No note text saved yet.')}</div></div>`
    return
  }
  const today=(()=>{const d=new Date();return String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+'/'+d.getFullYear()})()
  const session=note.sessionDate||today
  mount.innerHTML=hero+`<div class="pdn-card"><div class="g2">
    <div class="fg"><label>Patient</label><input type="text" id="pdnPatientName" class="pdn-locked-field" value="${escHtml(name)}" readonly></div>
    <div class="fg"><label>Session Date</label><div class="date-field"><input type="text" id="pdnSessionDate" placeholder="MM/DD/YYYY" autocomplete="off"><button type="button" class="cal-btn" data-onclick="toggleDatePicker('pdnSessionDate')" aria-label="Open date picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div></div>
    <div class="fg"><label>Appointment Type</label><input type="text" id="pdnAppointmentType" class="pdn-locked-field" value="Therapy Visit" readonly></div>
    <div class="fg"><label>Time</label><input type="time" id="pdnTime"></div>
  </div><div class="fg"><label>Patient Daily Note Following Treatment Session</label><textarea id="pdnPatientNote" rows="7" autocorrect="off" autocapitalize="off" autocomplete="off" placeholder="Enter daily treatment note..."></textarea></div>
  <div class="sdiv"><span>Optional: Auditory Screening</span></div><div class="g2">
    <div class="fg"><label>Left Ear</label><select id="pdnShoeboxLeftEar"><option value="">— Select —</option><option>Hearing loss</option><option>Good hearing</option><option>Significant hearing loss</option></select></div>
    <div class="fg"><label>Right Ear</label><select id="pdnShoeboxRightEar"><option value="">— Select —</option><option>Hearing loss</option><option>Good hearing</option><option>Significant hearing loss</option></select></div>
    <div class="fg full"><label>Upload Auditory Screening PDF File</label><input type="file" id="pdnShoeboxPdfFile" accept="application/pdf,.pdf" data-onchange="handleDailyNoteShoeboxPdfUpload(this.files,'dedicated')"><div class="dn-pdf-preview" id="pdnShoeboxPdfPreview"><div class="dn-pdf-empty">No Auditory Screening PDF uploaded yet.</div></div></div>
    <div class="fg full"><label>Billing / Exam Target</label><select id="pdnShoeboxTarget"><option value="">— Select Category —</option><option value="initialExam">Day 2</option><option value="reExam">Re-Examination</option><option value="upload">Upload / This Daily Note</option></select></div>
  </div></div>`
  pdnSetValue('pdnSessionDate',session)
  pdnSetValue('pdnAppointmentType','Therapy Visit')
  pdnSetValue('pdnTime',timeTo24h(note.time||''))
  pdnSetValue('pdnPatientNote',note.patientNote||'')
  pdnSetValue('pdnShoeboxLeftEar',note.shoeboxLeftEar||'')
  pdnSetValue('pdnShoeboxRightEar',note.shoeboxRightEar||'')
  pdnSetValue('pdnShoeboxTarget',note.shoeboxTarget||'')
  pdnShoeboxPdfUploads=cloneUploadList(normalizeDailyShoeboxUploads(note))
  renderDailyNoteShoeboxPdfPreview('dedicated')
}
/* opts is optional and carries { sign: true } from a sign-and-save action,
   matching saveDailyNote(opts) which this mirrors. It was referenced in the
   body below without ever being declared, so every click on Save Note threw
   ReferenceError before the note was written and the button looked dead. */
function savePatientDailyNoteDedicated(opts){
  const st=patientDailyNoteState||{}, p=getPatient(st.patientId||selectedPatientId)
  if(!p){showToast('Patient not found','err');return}
  if(!Array.isArray(p.dailyNotes))p.dailyNotes=[]
  ensurePatientDailyNoteIds(p)
  const note=pdnCollect()
  let idx=st.index
  const oldNote=(idx>=0 && idx<p.dailyNotes.length)?clonePlain(p.dailyNotes[idx]):null
  if(oldNote?.id)note.id=oldNote.id
  else _ensureDailyNoteId(note)
  if(oldNote?.savedAt)note.savedAt=oldNote.savedAt
  if (opts && opts.sign && !note.signedAt) {
    note.signedAt = new Date().toISOString()
    note.signedBy = dnSignerName()
  }
  let msg=''
  try{msg=syncDailyNoteShoeboxTarget(p,note,oldNote)}
  catch(e){showToast(e.message||'Could not attach Test 3 results to the selected category','err');return}
  if(idx>=0 && idx<p.dailyNotes.length){p.dailyNotes[idx]=note;showToast(msg||('Daily note #'+(idx+1)+' updated ✓'))}
  else{p.dailyNotes.push(note);idx=p.dailyNotes.length-1;showToast(msg||('Daily note #'+(idx+1)+' added ✓'))}
  p.updatedAt=new Date().toISOString()
  persistPatients()
  patientDailyNoteState={patientId:p.id,index:idx,mode:'view'}
  renderPatientWorkflow()
  renderPatientDailyNoteDedicatedPage()
}
async function deleteDailyNoteAtIndex(id,index){
  const p=getPatient(id)
  if(!p)return
  if(!(await ctgConfirm('Delete daily note #'+(index+1)+'?',{danger:true,okLabel:'Delete'})))return
  ensurePatientDailyNoteIds(p)
  const removed=p.dailyNotes?.[index]
  if(removed)_detachDailyShoeboxTarget(p,removed)
  p.dailyNotes.splice(index,1)
  if(dnCurrentNoteIndex===index)dnCurrentNoteIndex=-1
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(id)
  showToast('Daily note deleted')
}
function dnSignerName() {
  const u = (typeof ctgCurrentUser === 'function') ? ctgCurrentUser() : null
  return (u && (u.displayName || u.username)) || 'Staff'
}
// The signed note currently open in the editor, or null.
function dnSignedNote() {
  const p = getPatient(selectedPatientId)
  if (!p || !Array.isArray(p.dailyNotes)) return null
  const n = (dnCurrentNoteIndex >= 0 && dnCurrentNoteIndex < p.dailyNotes.length)
    ? p.dailyNotes[dnCurrentNoteIndex] : null
  return (n && n.signedAt) ? n : null
}
function dnFmtStamp(iso) {
  try { return new Date(iso).toLocaleString() } catch (e) { return String(iso || '') }
}
/* Reflect the signed state in the form: read-only fields, a banner, and Save
   swapped out for the amendment route. Called whenever a note is loaded or the
   form is cleared, so the lock can never linger on the next note. */
let dnAmendEditing = false
function dnApplyLockState() {
  const note = dnSignedNote()
  const signed = !!note
  const editing = signed && dnAmendEditing
  const locked = signed && !editing
  document.querySelectorAll('#page-dailyNotes input, #page-dailyNotes textarea, #page-dailyNotes select')
    .forEach(el => { el.disabled = locked })
  const banner = document.getElementById('dnLockBanner')
  if (banner) banner.style.display = signed ? '' : 'none'
  const sub = document.getElementById('dnLockSub')
  if (sub && signed) {
    const n = (note.amendments || []).length
    sub.textContent = (editing ? 'Editing to amend — ' : '') + 'Version ' + ctgRecordVersion(note)
      + '  ·  signed by ' + (note.signedBy || 'unknown') + ' on ' + dnFmtStamp(note.signedAt)
      + (n ? '  ·  ' + n + ' amendment' + (n === 1 ? '' : 's') : '')
  }
  const dnHist = document.getElementById('dnLockHistory')
  if (dnHist) dnHist.innerHTML = signed ? ctgAmendmentHistoryHTML(note, 'dnDecideAmendment') : ''
  const amendBtn = document.getElementById('dnAmendBtn')
  if (amendBtn) {
    amendBtn.style.display = signed ? '' : 'none'
    amendBtn.textContent = editing ? 'Cancel edit' : 'Edit to Amend'
    amendBtn.onclick = editing ? dnCancelAmendEdit : dnAmendNote
  }
  const saveBtn = document.getElementById('dnSaveBtn')
  if (saveBtn) saveBtn.style.display = signed ? 'none' : ''
  const signBtn = document.getElementById('dnSignBtn')
  if (signBtn) signBtn.style.display = locked ? 'none' : ''
}
async function dnSignNote() {
  const p = getPatient(selectedPatientId)
  if (!p) { showToast('Please select a patient first', 'err'); return }
  const signed = dnSignedNote()
  if (signed) {
    if (!dnAmendEditing) { showToast('This note is already signed', 'err'); return }
    ctgAmendOpen(function (reason) {
      const pp = getPatient(selectedPatientId)
      const sig = dnSignedNote()
      if (!pp || !sig) return
      const snapshot = dnCollect()
      pp.dailyNotes[dnCurrentNoteIndex] = ctgPushAmendment(sig, reason, snapshot)
      pp.updatedAt = new Date().toISOString()
      persistPatients()
      dnAmendEditing = false
      dnPopulate(pp.dailyNotes[dnCurrentNoteIndex])
      renderPatientDetails(pp.id)
      dnApplyLockState()
      showToast('Amendment recorded — pending approval')
    })
    return
  }
  const ok = await ctgConfirm(
    'Once signed this becomes a closed clinical record. It can still be amended, '
    + 'but the original text stays on file and every amendment is recorded with '
    + 'your name, the time and a reason.',
    { title: 'Sign & Lock Note', okLabel: 'Sign & Lock' })
  if (!ok) return
  saveDailyNote({ sign: true })
}
function dnCancelAmendEdit() {
  const note = dnSignedNote()
  dnAmendEditing = false
  if (note) dnPopulate(note)
  dnApplyLockState()
}
/* Shared amendment modal. Day 1, examinations and daily notes all need a
   reason captured before anything is written, so it is generic and takes a
   callback rather than each record type growing its own copy. */
let ctgAmendCallback = null
function ctgAmendOpen(cb) {
  ctgAmendCallback = cb
  const box = document.getElementById('ctgAmendReason')
  if (box) box.value = ''
  const err = document.getElementById('ctgAmendErr')
  if (err) err.style.display = 'none'
  const modal = document.getElementById('ctgAmendModal')
  if (modal) modal.classList.add('show')
  if (box) setTimeout(function () { box.focus() }, 50)
}
function ctgAmendClose() {
  ctgAmendCallback = null
  const modal = document.getElementById('ctgAmendModal')
  if (modal) modal.classList.remove('show')
}
function ctgAmendSubmit() {
  const box = document.getElementById('ctgAmendReason')
  const reason = ((box && box.value) || '').trim()
  const err = document.getElementById('ctgAmendErr')
  if (!reason) {
    if (err) { err.textContent = 'An amendment needs a reason.'; err.style.display = '' }
    if (box) box.focus()
    return
  }
  const cb = ctgAmendCallback
  ctgAmendCallback = null
  const modal = document.getElementById('ctgAmendModal')
  if (modal) modal.classList.remove('show')
  if (typeof cb === 'function') cb(reason)
}
document.addEventListener('keydown', function (e) {
  const m = document.getElementById('ctgAmendModal')
  if (e.key === 'Escape' && m && m.classList.contains('show')) ctgAmendClose()
  const pv = document.getElementById('paViewModal')
  if (e.key === 'Escape' && pv && pv.classList.contains('show')) paViewClose()
})

/* Append an amendment to any signed record. The signed content itself is never
   touched - the server enforces that too. */
/* An amendment is appended as its own versioned entry and never rewrites the
   signed text. It records who entered it, when, why, and who signed the
   original. The signed record is Version 1, so the first amendment is 2. */
function ctgPushAmendment(record, reason, textOrSnapshot) {
  const out = clonePlain(record)
  out.amendments = Array.isArray(record.amendments) ? record.amendments.slice() : []
  // Examinations pass a plain reason string. ACE and Daily Notes pass the
  // freshly collected fields as a snapshot of the record at the moment of
  // amendment. Either way this only appends; the record's own fields are
  // left alone.
  const isSnapshot = textOrSnapshot && typeof textOrSnapshot === 'object'
  out.amendments.push({
    id: 'am_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    by: dnSignerName(),
    byId: ctgCurrentUserId(),
    reason: reason,
    text: isSnapshot ? '' : (textOrSnapshot || ''),
    snapshot: isSnapshot ? textOrSnapshot : null,
    version: out.amendments.length + 2,        // original is Version 1
    originalSignedBy: record.signedBy || '',
    originalSignedAt: record.signedAt || '',
    // A correction to a closed record needs a second pair of eyes before it
    // counts as accepted.
    status: 'pending',
    approvedBy: '',
    approvedAt: ''
  })
  return out
}
/* Shallow diff between the signed content and an amendment's snapshot, so a
   reviewer can see what changed instead of trusting the reason text. Arrays
   compare as whole values, since positional diffs mislead once items are
   inserted or reordered, and the row count is capped. */
function ctgDiffSnapshot(before, after, prefix, out) {
  out = out || []
  if (out.length >= 40) return out
  before = before || {}
  after = after || {}
  const keys = Object.keys(Object.assign({}, before, after))
  keys.forEach(function (k) {
    if (out.length >= 40) return
    const path = prefix ? prefix + ' \u2192 ' + k : k
    const bv = before[k], av = after[k]
    const bothPlainObjects = bv && av && typeof bv === 'object' && typeof av === 'object'
      && !Array.isArray(bv) && !Array.isArray(av)
    if (bothPlainObjects) { ctgDiffSnapshot(bv, av, path, out); return }
    const bs = JSON.stringify(bv === undefined ? null : bv)
    const as = JSON.stringify(av === undefined ? null : av)
    if (bs !== as) out.push({ path: path, before: bv, after: av })
  })
  return out
}
function ctgFmtDiffVal(v) {
  if (v === undefined || v === null || v === '') return '\u2014'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '\u2014'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function ctgCurrentUserId() {
  const u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null
  return (u && u.id) || ''
}
/* Who may approve an amendment: a provider, a compliance officer, or an
   administrator. Not the person who filed it -- approving your
   own correction defeats the control. */
function ctgCanApproveAmendments() {
  const u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null
  const role = (u && u.role) || ''
  return role === 'provider' || role === 'compliance' || role === 'admin'
}
function ctgCanApproveThis(a) {
  if (!a || a.status !== 'pending') return false
  if (!ctgCanApproveAmendments()) return false
  const me = ctgCurrentUserId()
  // Fall back to the display name when ids are missing on older entries.
  if (me && a.byId) return me !== a.byId
  return dnSignerName() !== a.by
}
/* Approve or reject a pending amendment in place. Both outcomes are recorded;
   a rejected amendment stays on the record rather than vanishing. */
function ctgDecideAmendment(getRecord, setRecord, amendmentId, approve) {
  const rec = getRecord()
  if (!rec || !Array.isArray(rec.amendments)) return
  const out = clonePlain(rec)
  let changed = false
  out.amendments = out.amendments.map(function (a) {
    if (a.id !== amendmentId || a.status !== 'pending') return a
    if (!ctgCanApproveThis(a)) return a
    changed = true
    const copy = clonePlain(a)
    copy.status = approve ? 'approved' : 'rejected'
    copy.approvedBy = dnSignerName()
    copy.approvedAt = new Date().toISOString()
    return copy
  })
  if (!changed) { showToast('You cannot approve your own amendment', 'err'); return }
  setRecord(out)
  showToast(approve ? 'Amendment approved' : 'Amendment rejected')
}
function ctgSignStamp(record) {
  const out = clonePlain(record)
  out.signedAt = new Date().toISOString()
  out.signedBy = dnSignerName()
  out.version = 1                              // the signed original
  return out
}
// Current version = the signed original plus one per amendment on file.
function ctgRecordVersion(record) {
  if (!record || !record.signedAt) return 0
  return 1 + ((record.amendments || []).length)
}
/* The amendment trail, rendered so a reviewer can read the sequence rather
   than infer it from a count. */
// Exclude signing/amendment bookkeeping fields that live on the stored
// record but were never part of what the user typed into the form --
// otherwise every amendment would spuriously "change" signedAt/signedBy.
function ctgAmendmentDiffRows(record, a) {
  if (!a || !a.snapshot) return []
  // savedAt is regenerated every time the form is collected, even with zero
  // real edits, so it would otherwise show as a "change" on every amendment.
  const base = Object.assign({}, record)
  const snap = Object.assign({}, a.snapshot)
  delete base.signedAt; delete base.signedBy; delete base.amendments; delete base.savedAt
  delete snap.savedAt
  return ctgDiffSnapshot(base, snap)
}
function ctgAmendmentHistoryHTML(record, amendCtx) {
  if (!record || !record.signedAt) return ''
  const amendments = Array.isArray(record.amendments) ? record.amendments : []
  let h = '<div class="dn-ver-list">'
    + '<div class="dn-ver-row">'
      + '<div class="dn-ver-tag">Version 1</div>'
      + '<div class="dn-ver-body"><div class="dn-ver-title">Original record \u2014 signed</div>'
      + '<div class="dn-ver-meta">' + escHtml(dnFmtStamp(record.signedAt))
      + '  \u00b7  Provider: ' + escHtml(record.signedBy || 'unknown') + '</div></div>'
    + '</div>'
  amendments.forEach(function (a, i) {
    /* Older amendments predate the approval workflow and have no status --
       they are shown as accepted rather than retroactively marked pending. */
    const st = a.status || 'approved'
    const badge = st === 'pending'
      ? '<span class="dn-ver-state pending">Pending approval</span>'
      : (st === 'rejected'
          ? '<span class="dn-ver-state rejected">Rejected</span>'
          : '<span class="dn-ver-state approved">Approved</span>')
    const decided = (st !== 'pending' && a.approvedBy)
      ? '<div class="dn-ver-meta">' + (st === 'rejected' ? 'Rejected' : 'Approved') + ' by: '
        + escHtml(a.approvedBy) + (a.approvedAt ? '  \u00b7  ' + escHtml(dnFmtStamp(a.approvedAt)) : '') + '</div>'
      : ''
    const actions = (st === 'pending' && ctgCanApproveThis(a) && amendCtx)
      ? '<div class="dn-ver-actions">'
        + '<button type="button" class="btn btn-primary btn-sm" data-onclick="' + amendCtx + "('" + escHtml(a.id) + '\', true)">Approve</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="' + amendCtx + "('" + escHtml(a.id) + '\', false)">Reject</button>'
        + '</div>'
      : ''
    const diffs = ctgAmendmentDiffRows(record, a)
    const diffHtml = diffs.length
      ? '<details class="dn-ver-diff"><summary>View changes (' + diffs.length + (diffs.length >= 40 ? '+' : '') + ' field' + (diffs.length === 1 ? '' : 's') + ')</summary>'
        + diffs.map(function (d) {
            return '<div class="dn-ver-diff-row"><span class="dn-ver-diff-path">' + escHtml(d.path) + '</span>'
              + '<span class="dn-ver-diff-before">' + escHtml(ctgFmtDiffVal(d.before)) + '</span>'
              + '<span class="dn-ver-diff-arrow">\u2192</span>'
              + '<span class="dn-ver-diff-after">' + escHtml(ctgFmtDiffVal(d.after)) + '</span></div>'
          }).join('')
        + '</details>'
      : (a.snapshot ? '<div class="small-muted" data-cs="'+__cs+'margin-top:4px">No field changes detected.</div>' : '')
    h += '<div class="dn-ver-row' + (st === 'rejected' ? ' is-rejected' : '') + '">'
      + '<div class="dn-ver-tag amend">Version ' + (a.version || (i + 2)) + '</div>'
      + '<div class="dn-ver-body">'
        + '<div class="dn-ver-title">Amendment #' + (i + 1) + ' ' + badge + '</div>'
        + '<div class="dn-ver-meta">' + escHtml(dnFmtStamp(a.at))
        + '  \u00b7  Entered by: ' + escHtml(a.by || 'unknown') + '</div>'
        + (a.reason ? '<div class="dn-ver-reason">Reason: ' + escHtml(a.reason) + '</div>' : '')
        + (a.text ? '<div class="dn-ver-text">' + escHtml(a.text) + '</div>' : '')
        + diffHtml
        + decided
        + actions
      + '</div></div>'
  })
  h += '</div>'
  return h
}
/* Shared confirmation copy - signing means the same thing everywhere. */
function ctgSignConfirm(what) {
  return ctgConfirm(
    'Once signed this ' + what + ' becomes a closed clinical record. It can still be '
    + 'amended, but the original stays on file and every amendment is recorded with '
    + 'your name, the time and a reason.',
    { title: 'Sign & Lock', okLabel: 'Sign & Lock' })
}
/* Paint a lock banner and freeze a page's inputs. */
function ctgApplyRecordLock(pageId, bannerId, record, amendCtx, editing) {
  const signed = !!(record && record.signedAt)
  // While editing to amend, the record is still "signed" for banner/history
  // purposes, but its fields must stay unlocked so the correction can be made.
  const locked = signed && !editing
  document.querySelectorAll('#' + pageId + ' input, #' + pageId + ' textarea, #' + pageId + ' select')
    .forEach(function (el) { el.disabled = locked })
  const banner = document.getElementById(bannerId)
  if (banner) banner.style.display = signed ? '' : 'none'
  const sub = document.getElementById(bannerId + 'Sub')
  if (sub && signed) {
    const n = (record.amendments || []).length
    sub.textContent = (editing ? 'Editing to amend \u2014 ' : '') + 'Version ' + ctgRecordVersion(record)
      + '  \u00b7  signed by ' + (record.signedBy || 'unknown') + ' on ' + dnFmtStamp(record.signedAt)
      + (n ? '  \u00b7  ' + n + ' amendment' + (n === 1 ? '' : 's') : '')
  }
  // The readable trail lives in its own element so the banner stays compact.
  const hist = document.getElementById(bannerId + 'History')
  if (hist) hist.innerHTML = signed ? ctgAmendmentHistoryHTML(record, amendCtx) : ''
  return locked
}

/* ------------------------- Pending Amendments (central view) ------------- */
/* Walks every patient's signed records and returns the amendments still
   awaiting a decision, each carrying enough context (patient, record kind,
   a getter/setter pair) to approve or reject it from one list without first
   navigating into that patient's chart. */
function ctgFindPendingAmendments() {
  const out = []
  const list = (typeof ctgPatients !== 'undefined' && Array.isArray(ctgPatients)) ? ctgPatients : []
  function scan(p, rec, kind, label, setter) {
    if (!rec || !rec.signedAt || !Array.isArray(rec.amendments)) return
    rec.amendments.forEach(function (a, i) {
      if (!a || a.status !== 'pending') return
      out.push({
        patientId: p.id,
        patientName: (typeof naturalPatientName === 'function') ? naturalPatientName(p) : (p.id || 'Unknown'),
        kind: kind, label: label, amendment: a, index: i,
        getRecord: function () { return rec },
        setRecord: setter
      })
    })
  }
  list.forEach(function (p) {
    if (p.ace) scan(p, p.ace, 'ace', 'Day 1 (ACE)', function (updated) {
      p.ace = updated; p.updatedAt = new Date().toISOString(); persistPatients()
      if (selectedPatientId === p.id) { aceApplyLock(); renderPatientDetails(p.id) }
    })
    if (p.initialExam) scan(p, p.initialExam, 'exam', 'Day 2 examination', function (updated) {
      p.initialExam = updated; p.updatedAt = new Date().toISOString(); persistPatients()
      if (selectedPatientId === p.id) { examApplyLock(); renderPatientDetails(p.id) }
    })
    if (p.finalExam) scan(p, p.finalExam, 'exam', 'Final examination', function (updated) {
      p.finalExam = updated; p.updatedAt = new Date().toISOString(); persistPatients()
      if (selectedPatientId === p.id) { examApplyLock(); renderPatientDetails(p.id) }
    })
    ;(Array.isArray(p.reExams) ? p.reExams : []).forEach(function (rx, i) {
      scan(p, rx, 'exam', 'Re-examination', function (updated) {
        p.reExams[i] = updated; p.updatedAt = new Date().toISOString(); persistPatients()
        if (selectedPatientId === p.id) { examApplyLock(); renderPatientDetails(p.id) }
      })
    })
    ;(Array.isArray(p.dailyNotes) ? p.dailyNotes : []).forEach(function (dn, i) {
      scan(p, dn, 'note', 'Daily Note', function (updated) {
        p.dailyNotes[i] = updated; p.updatedAt = new Date().toISOString(); persistPatients()
        if (selectedPatientId === p.id) { dnApplyLockState(); renderPatientDetails(p.id) }
      })
    })
  })
  // Oldest first -- whatever has been waiting longest surfaces at the top.
  out.sort(function (x, y) { return String(x.amendment.at || '').localeCompare(String(y.amendment.at || '')) })
  return out
}
function renderPendingAmendments() {
  const mount = document.getElementById('paMount')
  if (!mount) return
  const items = ctgFindPendingAmendments()
  const mine = items.filter(function (it) { return ctgCanApproveThis(it.amendment) })
  let h = '<div class="card"><div class="card-hd"><div class="card-ico ic-amber">PA</div><div class="card-title">Pending Amendments</div></div>'
    + '<div class="card-body">'
    + '<div class="small-muted" data-cs="'+__cs+'margin-bottom:12px">Every correction to a signed clinical record, across every patient, still waiting for a decision. A correction only counts as accepted once a provider, compliance officer or administrator approves it — and never the person who filed it.</div>'
  if (!items.length) {
    h += '<div class="pld-empty-state">Nothing is waiting on approval.</div>'
  } else {
    if (!mine.length) {
      h += '<div class="small-muted" data-cs="'+__cs+'margin-bottom:10px">None of the ' + items.length + ' pending amendment' + (items.length === 1 ? '' : 's') + ' below can be approved by your account \u2014 either you filed it, or approval needs a provider, compliance or admin role.</div>'
    }
    h += '<div class="dash-appt-list">'
    items.forEach(function (it) {
      const a = it.amendment
      const canDecide = ctgCanApproveThis(a)
      h += '<div class="dash-appt-row" data-cs="'+__cs+'cursor:default;align-items:flex-start">'
        + '<span class="dash-appt-main">'
        + '<span class="dash-appt-name">' + escHtml(it.patientName) + ' \u2014 ' + escHtml(it.label) + '</span>'
        + '<span class="dash-recent-sub">Filed by ' + escHtml(a.by || 'unknown') + '  \u00b7  ' + escHtml(dnFmtStamp(a.at))
        + (a.reason ? '  \u2014  ' + escHtml(a.reason) : '') + '</span>'
        + '</span>'
        + '<span data-cs="'+__cs+'display:flex;gap:6px;flex:none;align-items:center">'
        + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="paViewOpen(\'' + escHtml(it.patientId) + '\',\'' + it.kind + '\',\'' + escHtml(a.id || '') + '\')">View</button>'
        + (canDecide
            ? '<button type="button" class="btn btn-primary btn-sm" data-onclick="paDecide(\'' + escHtml(it.patientId) + '\',\'' + it.kind + '\',\'' + escHtml(a.id || '') + '\',true)">Approve</button>'
              + '<button type="button" class="btn btn-ghost btn-sm" data-onclick="paDecide(\'' + escHtml(it.patientId) + '\',\'' + it.kind + '\',\'' + escHtml(a.id || '') + '\',false)">Reject</button>'
            : '<span class="pr-pill soon">Not yours to approve</span>')
        + '</span></div>'
    })
    h += '</div>'
  }
  h += '</div></div>'
  mount.innerHTML = h
}
/* Re-locates the record for a patient/kind pair and runs the same decide
   logic as the in-record buttons, so one place decides who may approve what. */
function paDecide(patientId, kind, amendmentId, approve) {
  const items = ctgFindPendingAmendments()
  const it = items.filter(function (x) { return x.patientId === patientId && x.amendment.id === amendmentId })[0]
  if (!it) { renderPendingAmendments(); return }
  ctgDecideAmendment(it.getRecord, it.setRecord, amendmentId, approve)
  renderPendingAmendments()
}
function paOpenRecord(patientId, kind) {
  if (typeof showPage === 'function') showPage('patientLists')
  if (typeof selectPatient === 'function') selectPatient(patientId)
  const tab = kind === 'ace' ? 'ace' : (kind === 'exam' ? 'exams' : 'notes')
  if (typeof setPatientDetailTab === 'function') setTimeout(function () { setPatientDetailTab(tab) }, 0)
}
/* "View" on a Pending Amendments row: shows exactly what changed and why,
   right there, so an approver can decide without first navigating into the
   patient's chart. Approve/Reject inside the modal run the same paDecide
   path (and the same server-side integrity guard) as the inline buttons. */
let paViewCtx = null
function paViewOpen(patientId, kind, amendmentId) {
  const items = ctgFindPendingAmendments()
  const it = items.filter(function (x) { return x.patientId === patientId && x.amendment.id === amendmentId })[0]
  if (!it) { showToast('This amendment is no longer pending', 'err'); renderPendingAmendments(); return }
  paViewCtx = { patientId: patientId, kind: kind, amendmentId: amendmentId }
  const record = it.getRecord()
  const a = it.amendment
  const diffs = ctgAmendmentDiffRows(record, a)
  const diffHtml = diffs.length
    ? '<table class="pa-diff-table"><thead><tr><th>Field</th><th>Before</th><th></th><th>After</th></tr></thead><tbody>'
      + diffs.map(function (d) {
          return '<tr><td>' + escHtml(d.path) + '</td>'
            + '<td class="pa-diff-before">' + escHtml(ctgFmtDiffVal(d.before)) + '</td>'
            + '<td class="pa-diff-arrow">→</td>'
            + '<td class="pa-diff-after">' + escHtml(ctgFmtDiffVal(d.after)) + '</td></tr>'
        }).join('')
      + '</tbody></table>'
    : (a.snapshot ? '<div class="small-muted">No field changes detected.</div>' : '')
  const body = document.getElementById('paViewBody')
  if (body) {
    body.innerHTML = '<div class="dn-ver-meta" data-cs="'+__cs+'margin-bottom:10px">'
      + escHtml(it.patientName) + ' — ' + escHtml(it.label)
      + '<br>Filed by ' + escHtml(a.by || 'unknown') + '  ·  ' + escHtml(dnFmtStamp(a.at)) + '</div>'
      + (a.reason ? '<div class="dn-ver-reason" data-cs="'+__cs+'margin-bottom:10px">Reason: ' + escHtml(a.reason) + '</div>' : '')
      + (a.text ? '<div class="dn-ver-text" data-cs="'+__cs+'margin-bottom:10px">' + escHtml(a.text) + '</div>' : '')
      + diffHtml
  }
  const canDecide = ctgCanApproveThis(a)
  const ft = document.getElementById('paViewFt')
  if (ft) {
    ft.innerHTML = '<button type="button" class="btn btn-ghost" data-onclick="paOpenRecord(\'' + escHtml(patientId) + '\',\'' + kind + '\');paViewClose()">Go to record</button>'
      + (canDecide
          ? '<button type="button" class="btn btn-ghost" data-cs="'+__cs+'color:var(--red)" data-onclick="paViewDecideAndClose(false)">Reject</button>'
            + '<button type="button" class="btn btn-primary" data-onclick="paViewDecideAndClose(true)">Approve</button>'
          : '<span class="pr-pill soon" data-cs="'+__cs+'margin-left:auto;align-self:center">Not yours to approve</span>')
  }
  const modal = document.getElementById('paViewModal')
  if (modal) modal.classList.add('show')
}
function paViewClose() {
  paViewCtx = null
  const modal = document.getElementById('paViewModal')
  if (modal) modal.classList.remove('show')
}
function paViewDecideAndClose(approve) {
  if (!paViewCtx) return
  paDecide(paViewCtx.patientId, paViewCtx.kind, paViewCtx.amendmentId, approve)
  paViewClose()
}

/* ---------------------------- Day 1 / ACE ------------------------------- */
function aceSignedRecord() {
  const p = getPatient(selectedPatientId)
  return (p && p.ace && p.ace.signedAt) ? p.ace : null
}
/* #aceFormHost is one shared DOM node moved between the Day 1 guide and
   Patient Lists, and each page has its own action bar. Paint the lock onto
   whichever bar is showing; the other page's selectors match nothing. */
let aceAmendEditing = false
function aceApplyLock() {
  const p = getPatient(selectedPatientId)
  const ace = p && p.ace
  const signed = !!(ace && ace.signedAt)
  const editing = signed && aceAmendEditing
  const locked = signed && !editing
  ctgApplyRecordLock('page-day1', 'aceLockBanner', ace, 'aceDecideAmendment', editing)
  ctgApplyRecordLock('page-patientAce', 'aceLockBanner2', ace, 'aceDecideAmendment', editing)
  /* Nothing on a signed record is "held on this device": the draft writer
     refuses to write one (_writeDraftToStorage), so whatever the strip is
     showing is left over from before this chart was opened and outlives it.
     Retire both halves of it the moment the lock goes on. */
  if (signed) {
    showDraftStatus('')
    const ls = document.getElementById('progressLastSaved')
    if (ls) ls.textContent = aceLastSavedLabel(ace)
  }
  ;['aceAmendBtn', 'aceAmendBtn2'].forEach(function (bid) {
    const el = document.getElementById(bid)
    if (!el) return
    el.style.display = signed ? '' : 'none'
    el.textContent = editing ? 'Cancel edit' : 'Edit to Amend'
    el.onclick = editing ? aceCancelAmendEdit : aceAmend
  })
  /* aceSaveCompleteBtn / ...Btn2 used to sit here too. The separate
     "Save as Complete" button was merged into Save Day 1 - the override now
     lives in the missing-fields modal - so only the one Save button per bar
     remains to hide behind a signature. */
  const pairs = [
    ['aceSignBtn', 'aceSaveBtn'],
    ['aceSignBtn2', 'aceSaveBtn2']
  ]
  pairs.forEach(function (ids) {
    const signBtn = document.getElementById(ids[0])
    // Sign & Lock re-appears both for a fresh unsigned draft AND while editing
    // to amend -- in the latter case the same click files the amendment.
    if (signBtn) signBtn.style.display = locked ? 'none' : ''
    // Save / Save as Complete are the DIRECT, unprotected write path, so they
    // may only ever show before the record has been signed for the first
    // time -- never again afterwards, editing or not.
    ids.slice(1).forEach(function (bid) {
      const el = document.getElementById(bid)
      if (el) el.style.display = signed ? 'none' : ''
    })
  })
}
async function aceSignRecord() {
  const p = getPatient(selectedPatientId)
  if (!p) { showToast('Please select a patient first', 'err'); return }
  /* Sign what is on screen. Typing not yet reached by the 15-second autosave
     used to stay out of the record being signed, and the lock then froze it
     out for good. aceFlushUnsavedForm does nothing unless the form really
     belongs to this patient. */
  if (!aceSignedRecord()) aceFlushUnsavedForm()
  if (!p.ace) { showToast('Save the Day 1 record before signing it', 'err'); return }
  if (aceSignedRecord()) {
    if (!aceAmendEditing) { showToast('This Day 1 record is already signed', 'err'); return }
    // Re-signing WHILE editing a signed record is what files the amendment --
    // the edited fields become the amendment's snapshot, and the record's own
    // stored content is never touched.
    ctgAmendOpen(function (reason) {
      const pp = getPatient(selectedPatientId)
      if (!pp || !pp.ace) return
      const snapshot = collectAceDataForPatient()
      pp.ace = ctgPushAmendment(pp.ace, reason, snapshot)
      pp.updatedAt = new Date().toISOString()
      persistPatients()
      aceAmendEditing = false
      hydrateAceFormFromSavedPatientAce(pp)
      aceApplyLock()
      showToast('Amendment recorded — pending approval')
    })
    return
  }
  const ok = await ctgSignConfirm('Day 1 (ACE) record')
  if (!ok) return
  p.ace = ctgSignStamp(p.ace)
  p.updatedAt = new Date().toISOString()
  persistPatients()
  clearDraft()      // the draft's job ended at signing; left behind it came back as "unsaved work"
  aceMarkClean()
  aceApplyLock()
  showToast('Day 1 record signed and locked')
}
/* Entry point for correcting a signed Day 1 record: unlocks the real form so
   the actual fields can be edited, rather than only collecting a reason in a
   modal. Nothing is written until Sign & Lock is clicked again. */
function aceAmend() {
  if (!aceSignedRecord()) { showToast('Only a signed record can be amended', 'err'); return }
  aceAmendEditing = true
  aceApplyLock()
  showToast('Editing to amend — make your changes, then click Sign & Lock')
}
function aceCancelAmendEdit() {
  const p = getPatient(selectedPatientId)
  aceAmendEditing = false
  if (p && p.ace) hydrateAceFormFromSavedPatientAce(p)
  aceApplyLock()
}

function aceDecideAmendment(amendmentId, approve) {
  const p = getPatient(selectedPatientId)
  if (!p || !p.ace) return
  ctgDecideAmendment(
    function () { return p.ace },
    function (updated) {
      p.ace = updated
      p.updatedAt = new Date().toISOString()
      persistPatients()
      aceApplyLock()
    },
    amendmentId, approve)
}

/* ---------------------------- Examinations ------------------------------ */
/* Which exam the Day 2 editor currently has open, following the same
   day2EditAttempt state the save path uses. */
function examCurrentRef() {
  const p = getPatient(selectedPatientId)
  if (!p || typeof day2EditAttempt === 'undefined' || !day2EditAttempt) return null
  if (day2EditAttempt.patientId !== p.id) return null
  const key = day2EditAttempt.arrayKey
  if (key === 'initialExam' || key === 'finalExam') {
    return p[key] ? { patient: p, key: key, index: null, exam: p[key] } : null
  }
  const arr = p[key]
  if (!Array.isArray(arr) || !arr[day2EditAttempt.index]) return null
  return { patient: p, key: key, index: day2EditAttempt.index, exam: arr[day2EditAttempt.index] }
}
function examApplyLock() {
  const ref = examCurrentRef()
  const locked = ctgApplyRecordLock('page-day2', 'examLockBanner', ref && ref.exam, 'examDecideAmendment')
  const ids = ['examSignBtn', 'day2SaveExamBtn']
  ids.forEach(function (bid) {
    const el = document.getElementById(bid)
    if (el) el.style.display = locked ? 'none' : ''
  })
}
function examWriteBack(ref, updated) {
  if (ref.index === null) ref.patient[ref.key] = updated
  else ref.patient[ref.key][ref.index] = updated
  ref.patient.updatedAt = new Date().toISOString()
  persistPatients()
}
async function examSignRecord() {
  const ref = examCurrentRef()
  if (!ref) { showToast('Save the examination before signing it', 'err'); return }
  if (ref.exam.signedAt) { showToast('This examination is already signed', 'err'); return }
  const ok = await ctgSignConfirm('examination')
  if (!ok) return
  examWriteBack(ref, ctgSignStamp(ref.exam))
  examApplyLock()
  showToast('Examination signed and locked')
}
function examAmend() {
  const ref = examCurrentRef()
  if (!ref || !ref.exam.signedAt) { showToast('Only a signed examination can be amended', 'err'); return }
  ctgAmendOpen(function (reason) {
    const r = examCurrentRef()
    if (!r) return
    examWriteBack(r, ctgPushAmendment(r.exam, reason, ''))
    examApplyLock()
    showToast('Amendment recorded')
  })
}

function examDecideAmendment(amendmentId, approve) {
  const ref = examCurrentRef()
  if (!ref) return
  ctgDecideAmendment(
    function () { return ref.exam },
    function (updated) { examWriteBack(ref, updated); examApplyLock() },
    amendmentId, approve)
}

/* ---------------------------- Daily notes ------------------------------- */
function dnDecideAmendment(amendmentId, approve) {
  const p = getPatient(selectedPatientId)
  const signed = dnSignedNote()
  if (!p || !signed) return
  ctgDecideAmendment(
    function () { return signed },
    function (updated) {
      p.dailyNotes[dnCurrentNoteIndex] = updated
      p.updatedAt = new Date().toISOString()
      persistPatients()
      renderPatientDetails(p.id)
      dnApplyLockState()
    },
    amendmentId, approve)
}

/* Entry point for correcting a signed daily note: unlocks the real form
   fields. Nothing is written until Sign & Lock is clicked again. */
function dnAmendNote() {
  if (!dnSignedNote()) { showToast('Only a signed note can be amended', 'err'); return }
  dnAmendEditing = true
  dnApplyLockState()
  showToast('Editing to amend \u2014 make your changes, then click Sign & Lock')
}

function saveDailyNote(opts) {
  const p = getPatient(selectedPatientId)
  if (!p) { showToast('Please select a patient first', 'err'); return }
  /* A signed note is closed. Changes go through dnAmendNote, which keeps the
     filed text intact and records the change instead. */
  if (dnSignedNote()) {
    showToast('This note is signed — use Add amendment to record a change', 'err')
    return
  }
  if (!p.dailyNotes) p.dailyNotes = []
  ensurePatientDailyNoteIds(p)
  const note = dnCollect()
  let savedIndex
  const editing = (dnCurrentNoteIndex >= 0 && dnCurrentNoteIndex < p.dailyNotes.length)
  const oldNote = editing ? clonePlain(p.dailyNotes[dnCurrentNoteIndex]) : null
  if(oldNote?.id)note.id=oldNote.id
  else _ensureDailyNoteId(note)
  if(oldNote?.savedAt)note.savedAt=oldNote.savedAt
  let msg=''
  try{msg=syncDailyNoteShoeboxTarget(p,note,oldNote)}
  catch(e){showToast(e.message||'Could not attach Test 3 results to the selected category','err');return}
  if (editing) {
    p.dailyNotes[dnCurrentNoteIndex] = note
    savedIndex = dnCurrentNoteIndex
  } else {
    p.dailyNotes.push(note)
    savedIndex = p.dailyNotes.length - 1
  }
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(p.id)
  showToast(msg || (editing ? 'Daily note #'+(savedIndex+1)+' updated ✓' : 'Daily note #'+(savedIndex+1)+' added ✓ — ready for the next note'))
  dnCurrentNoteIndex = -1
  dnClearForm()
  dnApplyLockState()
}

function dnFmtDate(val) {
  if (!val) return '—'
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(val).trim())) return String(val).trim()
  return val
}

// Sort key for ordering daily notes by date (earliest first). Undated notes go last.
function dnDateSortKey(dn) {
  const s = String((dn && dn.sessionDate) || '').trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(+m[3], +m[1]-1, +m[2]).getTime()
  const t = Date.parse(s)
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

function dnFmtTime(val) {
  if (!val) return '—'
  const [h, m] = val.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return val
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 || 12
  return String(hh).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ' ' + ampm
}

function dnFmtDateShort(val) {
  if (!val) return ''
  const m = String(val).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return val
  return m[1]+'-'+m[2]+'-'+m[3].slice(2)
}

const DN_SYMPTOMS_TEXT = `Headache, Neck pain, Dizziness, Balance problems, Sensitivity to noise, Feeling like “in a fog”, Difficulty concentrating, Fatigue or low energy, Drowsiness, Irritability, Nervous or anxious and Symptoms worsen with physical activity, Pressure in head, Nausea, Blurred vision, Sensitivity to light, Feeling slowed down, Don’t feel right, Difficulty remembering, Confusion, More emotional, Sadness, Trouble falling asleep and Symptoms worsen with mental activity`
function injuryIsPlural(injType) {
  const t = (injType || '').toLowerCase()
  if (/\b(multiple|double|triple|quadruple|several|two|three|four)\b/.test(t)) return true
  if (/\b(single|one)\b/.test(t)) return false
  // fall back: if any plural noun form detected (ends in s before comma or end)
  return false
}
function patientPronoun(p) {
  const g = (p?.demographics?.gender || '').trim()
  if (/^male$/i.test(g))   return { subj:'he',   poss:'his',   obj:'him'  }
  if (/^female$/i.test(g)) return { subj:'she',  poss:'her',   obj:'her'  }
  return                          { subj:'they', poss:'their', obj:'them' }
}
/* The risk factors the patient's Day 1 Assessment recorded - the same ones the
   Case Discharge Summary prints (an uploaded Day 1 file's are read into
   p.ace.riskFactors). Every daily note used to print "Multiple Head Impacts",
   whatever the patient's Day 1 said. */
function dnRiskFactorsText(p){
  return String((p&&p.ace&&p.ace.riskFactors)||aceRiskFactorsText(p)||'').trim()||'None identified'
}
function dnBoilerplate(name, doi) {
  const n = (name||'PT Name').trim()
  const d = (doi||'[date of injury]').trim()
  const p = getPatient(selectedPatientId)
  let injType = '[injury type]'
  if (p && p.ace && p.ace.formState) {
    const saved = p.ace.formState
    injType = (saved.selects && saved.selects.injuryType) || (saved.inputs && saved.inputs.injuryType) || '[injury type]'
  }
  const pron = patientPronoun(p)
  const plural = injuryIsPlural(injType)
  const incidentWord = plural ? 'injury incidents' : 'injury incident'
  const thatOccurred = plural ? 'that occurred' : 'that occurred'
  return {
    symptoms: DN_SYMPTOMS_TEXT,
    highScore: `Trailmaking (Neurocognitive) is today's highest score of the patient's rehab activities today.`,
    lowScore: `Immediate Memory (Neurocognitive) is today's lowest score of the patient's rehab activities today.`,
    recoveryStatus: 'Slight improvement with occasional exacerbation',
    riskFactors: dnRiskFactorsText(p),
    causation: `Based on review of ${n}'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between ${pron.poss} injuries and the ${injType} ${incidentWord} that occurred on ${d}.`,
    medicalNecessity: `The care and treatment rendered to the patient, ${n}, has been medically necessary for the injuries sustained in their ${injType} ${incidentWord} that occurred on ${d}.`,
    reasonableness: 'The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.'
  }
}
function dnRefreshBoilerplate() {
  const p = getPatient(selectedPatientId)
  const name = p ? naturalPatientName(p) : (document.getElementById('dnName')?.value||'')
  const doi = document.getElementById('dnDoi')?.value || ''
  const bp = dnBoilerplate(name, doi)
  const set = (id, txt) => { const el=document.getElementById(id); if(el) el.textContent=txt }
  set('dnStaticSymptoms', bp.symptoms)
  set('dnStaticHighScore', bp.highScore)
  set('dnStaticLowScore', bp.lowScore)
  set('dnStaticRecoveryStatus', bp.recoveryStatus)
  set('dnStaticRiskFactors', bp.riskFactors)
  set('dnStaticCausation', bp.causation)
  set('dnStaticMedicalNecessity', bp.medicalNecessity)
  set('dnStaticReasonableness', bp.reasonableness)
}

function downloadDailyNoteAtIndex(id,index){
  const p=getPatient(id)
  if(!p||!Array.isArray(p.dailyNotes)||!p.dailyNotes[index]){showToast('Daily note not found','err');return}
  selectedPatientId=id
  dnCurrentNoteIndex=index
  dnPopulate(p.dailyNotes[index])
  downloadDailyNotesPdf()
}

function downloadAllDailyNotesPdfForPatient(id,onDoc,notesOverride){
  const p=getPatient(id)
  const sourceNotes=Array.isArray(notesOverride)?notesOverride:(p&&p.dailyNotes)
  if(!p||!Array.isArray(sourceNotes)||!sourceNotes.length){if(typeof onDoc==='function'){onDoc(null);return}showToast('No daily notes found for this patient','err');return}
  selectedPatientId=id
  const notes=sourceNotes.slice().sort((a,b)=>dnDateSortKey(a)-dnDateSortKey(b))
  loadJsPDF(()=>{
  try{
    const pReg=p.demographics||{}
    const patientName=naturalPatientName(p)||'—'
    const dob=pReg.dob||'—'
    const doi=dnFmtDate(pReg.doi||'')||'—'
    const providerRaw=getDay2AceProviderValue(p)||getDay2ProviderValue(p)||'Nicholas Grande, DC'
    const bp=dnBoilerplate(patientName,doi)
    const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'letter'})
    const PW=612,PH=792,ML=54,MR=54,TW=PW-ML-MR
    let y=0
    function sf(style,sz){doc.setFont('times',style);doc.setFontSize(sz)}
    function tc(r,g,b){doc.setTextColor(r,g,b)}
    function lw(w){doc.setLineWidth(w)}
    function dc(r,g,b){doc.setDrawColor(r,g,b)}
    function safe(v){return String(v||'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").trim()||'—'}
    function drawPageHeader(){tc(0,0,0);sf('bold',12);doc.text('CONCUSSION THERAPY GROUP',ML,52);sf('normal',10);const rx=PW-MR;doc.text('2411 Crofton Lane, Suite 13A',rx,36,{align:'right'});doc.text('Crofton, MD, 21114-1336',rx,49,{align:'right'});doc.text('Phone: 410-451-9870',rx,62,{align:'right'});doc.text('Fax: 410-451-9872',rx,75,{align:'right'})}
    function drawPatientTable(note,noteNum){
      const x=ML,w=TW,colMid=w/2,rowH=22,top=90,sessionDate=dnFmtDate(note.sessionDate)
      lw(0.8);dc(0,0,0);doc.rect(x,top,w,rowH*2);doc.line(x,top+rowH,x+w,top+rowH);doc.line(x+colMid,top,x+colMid,top+rowH*2)
      function cellLbl(lbl,val,cx,cy){sf('bold',12);doc.text(lbl,cx,cy);sf('normal',12);doc.text(val,cx+doc.getTextWidth(lbl),cy)}
      cellLbl('Name:',' '+safe(patientName),x+5,top+15);cellLbl('DOB:',' '+safe(dob),x+colMid+5,top+15)
      cellLbl('DOI:',' '+safe(doi),x+5,top+rowH+15);cellLbl('Session Date:',' '+safe(sessionDate),x+colMid+5,top+rowH+15)
      const provY=top+rowH*2+13;sf('bold',10);doc.text('Provider:',x,provY);const provLblW=doc.getTextWidth('Provider:');sf('normal',10);doc.text(' '+safe(providerRaw),x+provLblW,provY);y=provY+10
    }
    function newPage(){doc.addPage();drawPageHeader();y=95}
    function need(h){if(y+h>PH-50)newPage()}
    function boldLine(text,size){size=size||12;const lines=doc.splitTextToSize(safe(text),TW);need(lines.length*13+4);sf('bold',size);tc(0,0,0);lines.forEach(l=>{doc.text(l,ML,y);y+=13})}
    function normalLine(text,size){size=size||12;sf('normal',size);tc(0,0,0);const lines=doc.splitTextToSize(safe(text),TW);need(lines.length*13+4);lines.forEach(l=>{doc.text(l,ML,y);y+=13})}
    function inlineBoldNormal(boldText,normalText,size){
      size=size||12;tc(0,0,0);sf('bold',size);const bw=doc.getTextWidth(boldText);const clean=safe(String(normalText||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' '))
      if(!clean||clean==='—'){need(17);doc.text(boldText,ML,y);y+=13;return}
      sf('normal',size);const firstW=TW-bw-2,words=clean.split(' ').filter(Boolean),lines=[];let cur='',wi=0
      while(wi<words.length){const test=cur?cur+' '+words[wi]:words[wi];if(doc.getTextWidth(test)<=firstW){cur=test;wi++}else break}lines.push({txt:cur,first:true});cur=''
      while(wi<words.length){const test=cur?cur+' '+words[wi]:words[wi];if(doc.getTextWidth(test)<=TW){cur=test;wi++}else{lines.push({txt:cur,first:false});cur=words[wi];wi++}}if(cur)lines.push({txt:cur,first:false})
      need(lines.length*13+4);lines.forEach((ln,idx)=>{if(idx===0){sf('bold',size);doc.text(boldText,ML,y);if(ln.txt){sf('normal',size);doc.text(ln.txt,ML+bw+2,y)}}else{sf('normal',size);doc.text(ln.txt,ML,y)}y+=13})
    }
    function gap(n){y+=(n||8)}
    function drawOneNote(note,idx){
      if(idx>0)doc.addPage()
      drawPageHeader();drawPatientTable(note,idx+1);gap(8)
      boldLine('NEUROINFLAMMATORY TREATMENT FOR TODAY',12)
      boldLine('SUBJECTIVE',12);boldLine('SUBJECTIVE DAILY CONCUSSION FINDINGS:',12)
      inlineBoldNormal('Neuroinflammatory Cognitive and Vestibular Symptoms:',' '+(bp.symptoms||'None reported'),12)
      const noteDateStr=(note.patientNoteDate||note.sessionDate)?dnFmtDateShort(note.patientNoteDate||note.sessionDate)+': ':''
      inlineBoldNormal('Patient Daily Note Following Treatment Session:',' '+noteDateStr+(note.patientNote||''),12);gap(13)
      boldLine('OBJECTIVE',12);boldLine('OBJECTIVE DAILY CONCUSSION FINDINGS:',12)
      inlineBoldNormal('Neuro/Vestibular Today\'s High Score:',' '+bp.highScore,12);inlineBoldNormal('Neuro/Vestibular Today\'s Low Score:',' '+bp.lowScore,12);gap(13)
      boldLine('ASSESSMENT',12);boldLine('Recovery Status',12);normalLine(bp.recoveryStatus,12)
      boldLine('Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Chronicity',12);normalLine(bp.riskFactors,12)
      boldLine('Causation',12);normalLine(bp.causation,12);boldLine('Medical Necessity',12);normalLine(bp.medicalNecessity,12);boldLine('Reasonableness',12);normalLine(bp.reasonableness,12);gap(13)
      boldLine('PLAN',12);boldLine('NEUROCOGNITIVE & VESTIBULAR DAILY TREATMENT THERAPY',12);gap(13)
      boldLine('97112 Neuromuscular Re-Education (NMR)',12);inlineBoldNormal('Neuromuscular Re-education:',' rehabilitation of vestibular and/or brain-based balance, movement, coordination, kinesthetic sense, posture and proprioception particularly eye movement and balance in order to improve function.',12);gap(13)
      boldLine('97129 Cognitive Therapy (1 Unit)/ 97130 Cognitive Therapy',12);normalLine('Increase stimulation of dysfunctional brain functions particularly reaction time, immediate memory, delayed memory, response inhibition, attention.',12);gap(13)
      boldLine('97110 Therapeutic Exercise',12);inlineBoldNormal('Therapeutic Exercise:',' Therapeutic exercise will be applied to increase blood flow and oxygen to the brain and body. Also to increase strength and stability of weakened joint units.',12);gap(13)
      inlineBoldNormal('Tx. Effectiveness:',' Overall effectiveness of ongoing treatment for this complaint will continue to be evaluated by analyzing objective and subjective findings.',12)
      inlineBoldNormal('Recommendation:',' Continue Treatment Plan',12)
    }
    notes.forEach((note,idx)=>drawOneNote(note,idx))
    const total=doc.internal.getNumberOfPages(),footerY=PH-20,footerLeft='Concussion Therapy Group / '+safe(providerRaw)+'/ '+safe(patientName)+' / '+safe(dob)
    for(let i=1;i<=total;i++){doc.setPage(i);sf('normal',8);tc(0,0,0);const pageText='Page '+i+' of '+total;let left=footerLeft;while(doc.getTextWidth(left)>TW-doc.getTextWidth(pageText)-12&&left.length>10)left=left.slice(0,-1);if(left!==footerLeft)left+='...';doc.text(left,ML,footerY);doc.text(pageText,PW-MR,footerY,{align:'right'})}
    if(typeof onDoc==='function'){onDoc(doc);return}
    const fname='DailyNotes_'+safe(patientName).replace(/\s+/g,'_')+'_All.pdf'
    const url=URL.createObjectURL(doc.output('blob'))
    const opened=window.open(url,'_blank')
    if(!opened)doc.save(fname)
    ctgAuditExport(id,'daily_notes_pdf',opened?'open':'download')
    showToast('Daily Notes PDF opened ✓')
  }catch(e){console.error(e);showToast('PDF error: '+e.message,'err')}
  })
}
function downloadDailyNotesPdf() {
  const p = getPatient(selectedPatientId)
  if (!p) { showToast('Please select a patient first', 'err'); return }
  const btn = document.querySelector('#page-dailyNotes .btn-primary')
  const orig = btn ? btn.innerHTML : null
  if (btn) { btn.innerHTML = '<span class="spinner"></span>Building...'; btn.disabled = true }
  loadJsPDF(() => {
  try {
    const note = dnCollect()
    const pReg = p.demographics || {}
    const patientName = naturalPatientName(p) || '—'
    const dob = pReg.dob || '—'
    const doi = dnFmtDate(pReg.doi || '') || '—'
    const sessionDate = dnFmtDate(note.sessionDate)
    const dosDate = dnFmtDate(note.dosDate)
    const providerRaw = getDay2AceProviderValue(p) || getDay2ProviderValue(p) || 'Nicholas Grande, DC'
    const bp = dnBoilerplate(patientName, doi)

    const doc = new window.jspdf.jsPDF({orientation:'portrait', unit:'pt', format:'letter'})
    const PW=612, PH=792, ML=54, MR=54, TW=PW-ML-MR
    let y = 0

    function sf(style, sz) { doc.setFont('times', style); doc.setFontSize(sz) }
    function tc(r,g,b) { doc.setTextColor(r,g,b) }
    function lw(w) { doc.setLineWidth(w) }
    function dc(r,g,b) { doc.setDrawColor(r,g,b) }
    function safe(v) { return String(v||'').replace(/[""]/g,'"').replace(/[']/g,"'").trim() || '—' }
    function safeOrEmpty(v) { const s=String(v||'').trim(); return s||'' }

    function drawPageHeader() {
      tc(0,0,0)
      sf('bold',12)
      doc.text('CONCUSSION THERAPY GROUP', ML, 52)
      sf('normal',10)
      const rx = PW - MR
      doc.text('2411 Crofton Lane, Suite 13A', rx, 36, {align:'right'})
      doc.text('Crofton, MD, 21114-1336', rx, 49, {align:'right'})
      doc.text('Phone: 410-451-9870', rx, 62, {align:'right'})
      doc.text('Fax: 410-451-9872', rx, 75, {align:'right'})
    }

    function drawPatientTable() {
      const x=ML, w=TW, colMid=w/2
      const rowH=22, top=90
      lw(0.8); dc(0,0,0)
      doc.rect(x, top, w, rowH*2)
      doc.line(x, top+rowH, x+w, top+rowH)
      doc.line(x+colMid, top, x+colMid, top+rowH*2)
      tc(0,0,0)
      function cellLbl(lbl, val, cx, cy) {
        sf('bold',12); doc.text(lbl, cx, cy)
        sf('normal',12); doc.text(val, cx+doc.getTextWidth(lbl), cy)
      }
      cellLbl('Name:',' '+safe(patientName), x+5, top+15)
      cellLbl('DOB:',' '+safe(dob), x+colMid+5, top+15)
      cellLbl('DOI:',' '+safe(doi), x+5, top+rowH+15)
      cellLbl('Session Date:',' '+safe(sessionDate), x+colMid+5, top+rowH+15)
      const provY = top+rowH*2+13
      sf('bold',10); doc.text('Provider:', x, provY)
      const provLblW = doc.getTextWidth('Provider:')
      sf('normal',10); doc.text(' '+safe(providerRaw), x+provLblW, provY)
      y = provY + 10
    }

    function newPage() {
      doc.addPage()
      drawPageHeader()
      y = 95
    }

    function need(h) { if (y+h > PH-50) newPage() }

    function boldLine(text, size) {
      size = size || 12
      const lines = doc.splitTextToSize(safe(text), TW)
      need(lines.length*13+4)
      sf('bold', size); tc(0,0,0)
      lines.forEach(l => { doc.text(l, ML, y); y+=13 })
    }

    function normalLine(text, size, extraY) {
      size = size || 12
      sf('normal', size); tc(0,0,0)
      const lines = doc.splitTextToSize(safe(text), TW)
      need(lines.length*13+(extraY||4))
      lines.forEach(l => { doc.text(l, ML, y); y+=13 })
      if (extraY) y += extraY
    }

    function boldThenNormal(boldText, normalText, size) {
      size = size || 12
      sf('bold', size); tc(0,0,0)
      const bw = doc.getTextWidth(boldText)
      const combined = boldText + normalText
      const allLines = doc.splitTextToSize(combined, TW)
      // If first line fits, render bold part bold then switch
      need(allLines.length*13+4)
      // Simple approach: bold label on its own line, then normal text
      sf('bold', size)
      doc.text(boldText, ML, y)
      y += 13
      if (normalText && normalText.trim()) {
        sf('normal', size)
        const nlines = doc.splitTextToSize(safe(normalText), TW)
        nlines.forEach(l => { doc.text(l, ML, y); y+=13 })
      }
    }

    function inlineBoldNormal(boldText, normalText, size) {
      size = size || 12
      tc(0,0,0)
      sf('bold', size)
      const bw = doc.getTextWidth(boldText)
      // Clean normal text - replace newlines with spaces, normalise quotes
      const cleanNormal = safe((normalText||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' '))
      if (!cleanNormal || cleanNormal === '—') {
        need(13+4); doc.text(boldText, ML, y); y+=13; return
      }
      // Word-by-word greedy wrap to avoid splitTextToSize slice-index bugs
      sf('normal', size)
      const firstW = TW - bw - 2
      const words = cleanNormal.split(' ').filter(w=>w.length>0)
      const resultLines = []
      let cur = '', wi = 0
      // First line shares row with bold label (narrower available width)
      while (wi < words.length) {
        const test = cur ? cur+' '+words[wi] : words[wi]
        if (doc.getTextWidth(test) <= firstW) { cur = test; wi++ } else break
      }
      resultLines.push({txt: cur, first: true})
      cur = ''
      // Remaining lines at full width
      while (wi < words.length) {
        const test = cur ? cur+' '+words[wi] : words[wi]
        if (doc.getTextWidth(test) <= TW) { cur = test; wi++ }
        else { resultLines.push({txt: cur, first: false}); cur = words[wi]; wi++ }
      }
      if (cur) resultLines.push({txt: cur, first: false})
      need(resultLines.length*13+4)
      resultLines.forEach((ln, idx) => {
        if (idx===0) {
          sf('bold',size); doc.text(boldText, ML, y)
          if (ln.txt) { sf('normal',size); doc.text(ln.txt, ML+bw+2, y) }
        } else {
          sf('normal',size); doc.text(ln.txt, ML, y)
        }
        y+=13
      })
    }

    function twoColLine(leftText, rightText, size) {
      size = size || 12
      sf('normal', size); tc(0,0,0)
      need(16)
      doc.text(safe(leftText), ML, y)
      doc.text(safe(rightText), PW/2, y)
      y += 14
    }

    function gap(n) { y += (n||8) }

    function drawFooters() {
      const total = doc.internal.getNumberOfPages()
      const footerY = PH - 20
      const footerLeft = 'Concussion Therapy Group / '+safe(providerRaw)+'/ '+safe(patientName)+' / '+safe(dob)
      for (let i=1; i<=total; i++) {
        doc.setPage(i)
        sf('normal', 8); tc(0,0,0)
        const pageText = 'Page '+i+' of '+total
        const rw = doc.getTextWidth(pageText)
        let left = footerLeft
        sf('normal', 8)
        while (doc.getTextWidth(left) > TW-rw-12 && left.length > 10) left = left.slice(0,-1)
        if (left !== footerLeft) left += '...'
        doc.text(left, ML, footerY)
        doc.text(pageText, PW-MR, footerY, {align:'right'})
      }
    }

    // --- BUILD PDF ---
    drawPageHeader()
    drawPatientTable()

    gap(8)
    boldLine('NEUROINFLAMMATORY TREATMENT FOR TODAY', 12)

    // SUBJECTIVE - no gap between header lines
    boldLine('SUBJECTIVE', 12)
    boldLine('SUBJECTIVE DAILY CONCUSSION FINDINGS:', 12)
    inlineBoldNormal('Neuroinflammatory Cognitive and Vestibular Symptoms:', ' '+(bp.symptoms||'None reported'), 12)
    const noteDateStr = note.patientNoteDate ? dnFmtDateShort(note.patientNoteDate)+': ' : ''
    inlineBoldNormal('Patient Daily Note Following Treatment Session:', ' '+noteDateStr+(note.patientNote||''), 12)
    gap(13)

    // OBJECTIVE
    boldLine('OBJECTIVE', 12)
    boldLine('OBJECTIVE DAILY CONCUSSION FINDINGS:', 12)
    inlineBoldNormal('Neuro/Vestibular Today\'s High Score:', ' '+bp.highScore, 12)
    inlineBoldNormal('Neuro/Vestibular Today\'s Low Score:', ' '+bp.lowScore, 12)
    gap(13)

    // ASSESSMENT
    boldLine('ASSESSMENT', 12)
    boldLine('Recovery Status', 12)
    normalLine(bp.recoveryStatus, 12)
    boldLine('Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Chronicity', 12)
    normalLine(bp.riskFactors, 12)
    boldLine('Causation', 12)
    normalLine(bp.causation, 12)
    boldLine('Medical Necessity', 12)
    normalLine(bp.medicalNecessity, 12)
    boldLine('Reasonableness', 12)
    normalLine(bp.reasonableness, 12)
    gap(13)

    // PLAN
    boldLine('PLAN', 12)
    boldLine('NEUROCOGNITIVE & VESTIBULAR DAILY TREATMENT THERAPY', 12)
    gap(13)

    // 97112
    boldLine('97112 Neuromuscular Re-Education (NMR)', 12)
    inlineBoldNormal('Neuromuscular Re-education:', ' rehabilitation of vestibular and/or brain-based balance, movement, coordination, kinesthetic sense, posture and proprioception particularly eye movement and balance in order to improve function.', 12)
    gap(13)

    // 97129/97130
    boldLine('97129 Cognitive Therapy (1 Unit)/ 97130 Cognitive Therapy', 12)
    normalLine('Increase stimulation of dysfunctional brain functions particularly reaction time, immediate memory, delayed memory, response inhibition, attention.', 12)
    gap(13)

    // 97110
    boldLine('97110 Therapeutic Exercise', 12)
    inlineBoldNormal('Therapeutic Exercise:', ' Therapeutic exercise will be applied to increase blood flow and oxygen to the brain and body. Also to increase strength and stability of weakened joint units.', 12)
    gap(13)


    inlineBoldNormal('Tx. Effectiveness:', '  Overall effectiveness of ongoing treatment for this complaint will continue to be evaluated by analyzing objective and subjective findings.', 12)
    inlineBoldNormal('Recommendation:', '  Continue Treatment Plan', 12)

    drawFooters()

    const fname = 'DailyNote_'+safe(patientName).replace(/\s+/g,'_')+'_'+safe(sessionDate).replace(/\//g,'-')+'.pdf'
    doc.save(fname)
    ctgAuditExport(p.id,'daily_notes_pdf')
    showToast('Daily Notes PDF downloaded ✓')
  } catch(e) {
    console.error(e)
    showToast('PDF error: '+e.message, 'err')
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false }
  }
  }) // loadJsPDF
}

/* ---------- Day 2: on-screen PDF-style results ---------- */
function day2SourceText(source){return typeof source==='object'&&source!==null?String(source.text||''):String(source||'')}
function day2NormResultText(text){return day2SourceText(text).replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim()}
function day2FlatResultText(text){return day2NormResultText(text).replace(/\n+/g,' ')}
function day2NormRangeDash(v){
  if(!v)return v
  const norm=String(v).replace(/[–—]/g,'-')
  if(/-/.test(norm))return norm.replace(/\s*-\s*/g,' - ')
  const m=norm.match(/^(\d[\d.]*(?:\s*(?:ms|seconds?|cm))?)\s+(\d[\d.]*(?:\s*(?:ms|seconds?|cm))?)$/i)
  return m?m[1].trim()+' - '+m[2].trim():norm
}
function day2FormatMemoryCognitiveRange(v){
  if(!v)return v
  const nums=String(v).match(/-?\d+(?:\.\d+)?/g)
  if(nums&&nums.length>=2)return nums[0]+' - '+nums[1]
  return String(v).trim()
}

function day2CurrentExamCategoryForPreview(){
  return normalizeExamCategoryForSelect(document.getElementById('examTypeSelect')?.value||patientExamEditTitleOverride||(patientExamDetailState?patientExamDetailLabel(patientExamDetailState.patientId,patientExamDetailState.arrayKey,patientExamDetailState.index):''),patientExamDetailState?.arrayKey)
}
function day2ProgressStatusForCategory(examCategory, extracted){
  const cat=normalizeExamCategoryForSelect(examCategory||'', '')
  if(cat==='Re-Examination'||cat==='Final Examination')return 'Improvement Demonstrated.'
  const raw=String(extracted||'').trim()
  return raw&&raw!=='—'?raw:'Day 2 Exam, no comparative data.'
}
function day2EscapeRegExp(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function day2MatchResult(text,regex,def){const m=String(text||'').match(regex);return m?day2PdfSafe(m[1]):(def===undefined?'—':def)}
function day2ValueAfterLabel(text,label,def){
  const lines=day2NormResultText(text).split('\n')
  const lab=String(label).toLowerCase()
  for(const line of lines){
    const low=line.toLowerCase()
    const idx=low.indexOf(lab)
    if(idx>=0){
      let v=line.slice(idx+label.length).replace(/^\s*[:.]\s*/,'').trim()
      if(v)return day2PdfSafe(v)
    }
  }
  const re=new RegExp(day2EscapeRegExp(label)+'\\s*[:.]?\\s*([^\\n]+)','i')
  return day2MatchResult(text,re,def||'—')
}
function day2ResultSection(text,startLabel,endLabels){
  const source=day2NormResultText(text)
  const start=source.toLowerCase().indexOf(String(startLabel).toLowerCase())
  if(start<0)return ''
  let end=source.length
  ;(endLabels||[]).forEach(label=>{
    const idx=source.toLowerCase().indexOf(String(label).toLowerCase(),start+String(startLabel).length)
    if(idx>=0&&idx<end)end=idx
  })
  return source.slice(start,end)
}
function day2PreviewSection(title,body){return `<div class="day2-result-section"><div class="day2-result-heading">${escHtml(title)}</div>${body||''}</div>`}
function day2PreviewSubheading(text){return `<div class="day2-result-subheading">${escHtml(text)}</div>`}
function day2PreviewLine(label,value){
  if(!day2IsPresentValue(value))return ''
  return `<div class="day2-result-line"><strong>${escHtml(label)}:</strong> ${escHtml(day2CleanExtractedValue(value))}</div>`
}
function day2PreviewKvGrid(items){
  const lines=(items||[]).map(it=>day2PreviewLine(it[0],it[1])).filter(Boolean).join('')
  return lines?`<div class="day2-result-kv-grid">${lines}</div>`:''
}
function day2PreviewTable(headers,rows){
  const body=(rows||[]).filter(r=>(r||[]).some((c,i)=>i===0?day2IsPresentValue(c):(day2IsPresentValue(c)))).map(r=>`<tr>${(r||[]).map(c=>{const v=day2IsPresentValue(c)?day2CleanExtractedValue(c):'';const nv=v&&!/[-–—]/.test(v)?v.replace(/^(\d[\d.]*)\s+(\d[\d.]*)$/,'$1 - $2'):v;return`<td>${escHtml(nv)}</td>`}).join('')}</tr>`).join('')
  if(!body)return ''
  return `<table class="day2-result-table"><thead><tr>${(headers||[]).map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
}
function day2ParseDateAny(text){return day2MatchResult(text,/Date(?: of [A-Za-z ]+)?\s*[:.]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,'')}
function day2ScoreFromText(text,label){
  const flat=day2FlatResultText(text)
  const m=flat.match(new RegExp(day2EscapeRegExp(label)+'\\s*[:.]?\\s*(\\d+)\\s*(?:of|out of)\\s*(\\d+)','i'))
  return m?(m[1]+' of '+m[2]):''
}
function day2FirstMatch(text,patterns){
  for(const pattern of patterns){
    const m=String(text||'').match(pattern)
    if(m&&day2IsPresentValue(m[1]))return day2CleanExtractedValue(m[1])
  }
  return ''
}
function day2SectionBetween(text,startLabel,endLabels,fromLast){
  const source=day2NormResultText(text)
  const lower=source.toLowerCase()
  const startNeedle=String(startLabel).toLowerCase()
  const start=fromLast?lower.lastIndexOf(startNeedle):lower.indexOf(startNeedle)
  if(start<0)return ''
  let end=source.length
  ;(endLabels||[]).forEach(label=>{
    const idx=lower.indexOf(String(label).toLowerCase(),start+startNeedle.length)
    if(idx>=0&&idx<end)end=idx
  })
  return source.slice(start,end)
}
function day2CleanPercentile(value){
  const raw=day2CleanExtractedValue(value)
  if(!day2IsPresentValue(raw)||raw==='—'||raw==='-')return ''
  const m=raw.match(/(\d+(?:\.\d+)?)(?:\s*(st|nd|rd|th|%))?/i)
  if(!m)return ''
  const num=m[1]
  const givenSuffix=(m[2]||'').toLowerCase()
  if(givenSuffix&&givenSuffix!=='%')return num+givenSuffix
  const whole=Math.abs(Math.floor(Number(num)))
  if(!Number.isFinite(whole))return num
  const mod100=whole%100
  const suffix=(mod100>=11&&mod100<=13)?'th':({1:'st',2:'nd',3:'rd'}[whole%10]||'th')
  return num+suffix
}
function day2ExtractRange(section){
  const m=String(section||'').match(/Range:\s*([\s\S]*?)(?=\n|\s+Consistency|\s+Test Count|\s+Score\b|$)/i)
  return m?day2CleanExtractedValue(m[1].replace(/\s+-\s+/,' - ')):''
}
function day2ValueAfterInText(text,label){
  const source=day2NormResultText(text)
  const raw=day2FirstMatch(source,[new RegExp(day2EscapeRegExp(label)+'\\s*[:.]?\\s*([^\\n]+)','i')])
  if(!day2IsPresentValue(raw))return ''
  const clipped=String(raw).replace(/\s+(Baseline Symptoms|Max Provocation|Max Total Symptoms|HEADACHE|DIZZINESS|NAUSEA|FOGGINESS|TOTAL|COMMENTS|SURVEYS|COGNITIVE|Disclaimer)\s*:?[\s\S]*$/i,'')
  return day2CleanExtractedValue(clipped)
}
function day2ExtractVomsConvergence(text){
  const m=String(text||'').match(/Average\s+Convergence\s*[:.]\s*(\d+\.?\d*)\s*(cm)?/i)
  if(!m)return ''
  return (m[1]+(m[2]?' '+m[2]:' cm')).trim()
}
function day2ExtractVomsNumeric(text,label){
  const m=String(text||'').match(new RegExp(day2EscapeRegExp(label)+'\\s*[:.]+\\s*(\\d+(?:\\.\\d+)?)(?!\\s*cm)','i'))
  return m?m[1]:''
}
function day2ExtractMbessRange(text){
  const m=String(text||'').match(/Range\s*[:.]\s*([0-9.]+)\s*[-–—\s]+\s*([0-9.]+)/i)
  if(m)return m[1]+' - '+m[2]
  return ''
}
function day2NormalizePercentileValue(value){
  const raw=day2CleanExtractedValue(value)
  if(!day2IsPresentValue(raw))return ''
  if(/^change$/i.test(raw))return ''
  return day2CleanPercentile(raw)
}
function day2ParseScorePercentile(section){
  const s=day2NormResultText(section).replace(/[–—]/g,'-')
  if(!s)return {score:'',percentile:''}
  function normalizeScore(raw){
    const value=day2CleanExtractedValue(raw)
    if(!day2IsPresentValue(value))return ''
    const m=value.match(/-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?/i)
    return m?day2FormatOneDecimal(m[0]):''
  }
  function normalizePercentile(raw){
    return day2NormalizePercentileValue(raw)
  }
  function collectMatches(re,scoreIndex,percentileIndex){
    const out=[]
    let m
    while((m=re.exec(s))!==null){
      const score=normalizeScore(m[scoreIndex])
      const percentile=normalizePercentile(m[percentileIndex])
      if(score||percentile)out.push({score,percentile,index:m.index,text:m[0]})
      if(m.index===re.lastIndex)re.lastIndex++
    }
    return out
  }
  const direct=[]
  collectMatches(/\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)\s+Percentile\s*[:.]?\s*([^\s\n]*)/ig,1,2).forEach(v=>direct.push(v))
  collectMatches(/\bScore\s*[:.]?\s*\n?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)[\s\S]{0,140}?\bPercentile\s*[:.]?\s*\n?\s*([^\s\n]*)/ig,1,2).forEach(v=>direct.push(v))
  if(direct.length){
    direct.sort((a,b)=>{
      const aComplete=(a.score?1:0)+(a.percentile?1:0)
      const bComplete=(b.score?1:0)+(b.percentile?1:0)
      if(aComplete!==bComplete)return bComplete-aComplete
      const aNearTest=/TEST\s*1/i.test(s.slice(a.index,Math.min(s.length,a.index+260)))?1:0
      const bNearTest=/TEST\s*1/i.test(s.slice(b.index,Math.min(s.length,b.index+260)))?1:0
      if(aNearTest!==bNearTest)return bNearTest-aNearTest
      return a.index-b.index
    })
    return {score:direct[0].score,percentile:direct[0].percentile}
  }
  const testScore=s.match(/\bTEST\s*1[\s\S]{0,180}?\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)/i)
  if(testScore)return {score:normalizeScore(testScore[1]),percentile:''}
  const anyScore=s.match(/\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)/i)
  return {score:anyScore?normalizeScore(anyScore[1]):'',percentile:''}
}
function day2CognitiveLabelAliases(label){
  const key=String(label||'').toLowerCase().replace(/\s+/g,' ').trim()
  if(key==='inspection time')return ['Inspection\\s+Time']
  if(key==='reaction time')return ['Reaction\\s+Time']
  if(key==='impulse control')return ['Impulse\\s*[-–—]?\\s*Control']
  if(key==='memory')return ['Memory']
  if(key==='reverse number counting')return ['Reverse\\s+Number\\s+Counting']
  if(key==='cued stroop')return ['Cued\\s+Stroop']
  return [day2EscapeRegExp(label).replace(/\\\s\+/g,'\\s+')]
}
function day2CognitiveLabelRegex(label,global){
  const body=day2CognitiveLabelAliases(label).join('|')
  return new RegExp('(?:^|\\n|\\r|\\s{2,})\\s*(?:'+body+')(?:\\b|(?=\\d))',global?'ig':'i')
}
function day2BuildCognitiveCandidateTexts(input){
  const candidates=[]
  function add(v){
    const text=day2NormResultText(v)
    if(text)candidates.push(text)
  }
  if(input&&typeof input==='object'){
    if(Array.isArray(input.pageTexts)){
      add(input.pageTexts.join('\n'))
      input.pageTexts.forEach((pageText,i)=>{
        add(pageText)
        if(input.pageTexts[i+1])add(pageText+'\n'+input.pageTexts[i+1])
      })
    }
    if(Array.isArray(input.pageItems)){
      const pages=[]
      ;(input.pageItems||[]).forEach(page=>{
        const rows=[]
        ;(Array.isArray(page)?page:[]).forEach(it=>{
          const text=day2CleanExtractedValue(it&&it.text)
          if(!text)return
          const y=Number(it.y)||0
          let row=rows.find(r=>Math.abs(r.y-y)<4)
          if(!row){row={y,items:[]};rows.push(row)}
          row.items.push({x:Number(it.x)||0,text})
        })
        rows.sort((a,b)=>a.y-b.y)
        pages.push(rows.map(row=>row.items.sort((a,b)=>a.x-b.x).map(it=>it.text).join(' ')).join('\n'))
      })
      add(pages.join('\n'))
    }
  }
  add(day2SourceText(input))
  const seen=new Set()
  return candidates.filter(text=>{const key=text.slice(0,5000)+'::'+text.length;if(seen.has(key))return false;seen.add(key);return true})
}
function day2FindNextCognitiveBoundary(text,startAt,currentLabel,nextLabels){
  const stopLabels=['Inspection Time','Reaction Time','Impulse Control','Memory','Reverse Number Counting','Cued Stroop','DEVICE','SUMMARY','Device Details','SURVEY','SURVEYS','BALANCE','mBESS']
  const labels=[]
  ;(nextLabels||[]).forEach(v=>labels.push(v))
  stopLabels.forEach(v=>{if(String(v).toLowerCase()!==String(currentLabel).toLowerCase()&&!labels.some(x=>String(x).toLowerCase()===String(v).toLowerCase()))labels.push(v)})
  let best=text.length
  labels.forEach(label=>{
    let re
    if(['DEVICE','SUMMARY','Device Details','SURVEY','SURVEYS','BALANCE','mBESS'].some(stop=>String(stop).toLowerCase()===String(label).toLowerCase())){
      re=new RegExp('(?:^|\\n|\\r|\\s{2,})\\s*'+day2EscapeRegExp(label)+'\\b','ig')
    }else{
      re=day2CognitiveLabelRegex(label,true)
    }
    re.lastIndex=Math.max(0,startAt)
    const m=re.exec(text)
    if(m&&m.index>startAt&&m.index<best)best=m.index
  })
  return best
}
function day2CognitiveSection(input,label,nextLabels){
  const candidates=day2BuildCognitiveCandidateTexts(input)
  const sections=[]
  candidates.forEach(text=>{
    const normalized=day2NormResultText(text).replace(/[–—]/g,'-')
    if(!normalized)return
    const re=day2CognitiveLabelRegex(label,true)
    let m
    while((m=re.exec(normalized))!==null){
      const labelStart=m.index
      const afterLabel=m.index+m[0].length
      const end=day2FindNextCognitiveBoundary(normalized,afterLabel,label,nextLabels)
      const section=normalized.slice(labelStart,end)
      const parsed=day2ParseScorePercentile(section)
      const before=normalized.slice(Math.max(0,labelStart-1000),labelStart)
      let score=0
      if(/\bCOGNITIVE\b/i.test(before))score+=15
      if(/Profile\s+Baseline\s+Details/i.test(section))score+=50
      if(/\bScore\b/i.test(section))score+=30
      if(/\bPercentile\b/i.test(section))score+=15
      if(/\bTEST\s*1\b/i.test(section))score+=10
      if(day2IsPresentValue(parsed.score))score+=80
      if(day2IsPresentValue(parsed.percentile))score+=20
      if(/SYMPTOM\s+TOTAL|SURVEYS?\s+PHQ|SURVEYS?\s+GAD/i.test(section))score-=40
      sections.push({section,score,length:section.length,index:labelStart})
      if(m.index===re.lastIndex)re.lastIndex++
    }
  })
  if(!sections.length)return ''
  sections.sort((a,b)=>{
    if(a.score!==b.score)return b.score-a.score
    if(a.length!==b.length)return a.length-b.length
    return b.index-a.index
  })
  return sections[0].section
}

function day2NormalizeCognitiveRankValue(value){
  const raw=day2CleanExtractedValue(value).replace(/[–—-]/g,' ').replace(/_/g,' ').replace(/\s+/g,' ').trim()
  if(!day2IsPresentValue(raw))return ''
  const up=raw.toUpperCase()
  if(/\bVERY\s+LOW\b/.test(up))return 'Very Low'
  if(/\bLOW\s+(?:AVG|AVERAGE)\b/.test(up))return 'Low Average'
  if(/\bHIGH\s+(?:AVG|AVERAGE)\b/.test(up))return 'High Average'
  if(/\bVERY\s+HIGH\b/.test(up))return 'Very High'
  if(/\bLOW\b/.test(up))return 'Low'
  if(/\bHIGH\b/.test(up))return 'High'
  return ''
}
function day2ExtractImpulseSummaryRankFromPageItems(input){
  if(!input||typeof input!=='object'||!Array.isArray(input.pageItems))return ''
  function clean(v){return day2CleanExtractedValue(v)}
  function groupRows(items,tol){
    const rows=[]
    ;(items||[]).forEach(it=>{
      const text=clean(it&&it.text)
      if(!text)return
      const y=Number(it.y)||0
      let row=rows.find(r=>Math.abs(r.y-y)<(tol||7))
      if(!row){row={y,items:[]};rows.push(row)}
      row.items.push({x:Number(it.x)||0,width:Number(it.width)||0,text})
    })
    rows.sort((a,b)=>a.y-b.y)
    return rows.map(r=>{
      r.items.sort((a,b)=>a.x-b.x)
      const text=r.items.map(it=>it.text).join(' ')
      const minX=Math.min(...r.items.map(it=>it.x))
      const maxX=Math.max(...r.items.map(it=>it.x+(Number(it.width)||0)))
      return {y:r.y,text,minX,maxX,items:r.items}
    }).filter(r=>r.text)
  }
  const ranks=[]
  ;(input.pageItems||[]).forEach((page,pageIndex)=>{
    const pageItems=Array.isArray(page)?page:[]
    const rows=groupRows(pageItems,7)
    if(!rows.length)return
    const pageText=rows.map(r=>r.text).join(' ')
    if(!/\bCOGNITIVE\b/i.test(pageText)||!/Impulse\s*(?:[-–—]\s*)?Control/i.test(pageText))return
    const pageWidth=Number((input.pageSizes||[])[pageIndex]?.width)||Math.max(...rows.map(r=>r.maxX),1)
    const impulseRows=rows.filter(r=>/Impulse\s*(?:[-–—]\s*)?Control/i.test(r.text))
    const rankRows=rows.map(r=>({row:r,rank:day2NormalizeCognitiveRankValue(r.text)})).filter(r=>r.rank&&r.row.minX>pageWidth*.54)
    impulseRows.forEach(ir=>{
      rankRows.forEach(rr=>{
        const dist=Math.abs(rr.row.y-ir.y)
        if(dist<=95){
          ranks.push({rank:rr.rank,score:dist+(rr.row.y<ir.y?0:8)})
        }
      })
    })
  })
  if(!ranks.length)return ''
  ranks.sort((a,b)=>a.score-b.score)
  return ranks[0].rank
}
function day2ExtractImpulseSummaryRankFromText(input){
  const rankPattern='(Very\\s+Low|Low\\s+Average|Low\\s+Avg|Low|High\\s+Average|High\\s+Avg|High|Very\\s+High)'
  const candidates=[]
  day2BuildCognitiveCandidateTexts(input).forEach(text=>{
    const normalized=day2NormResultText(text).replace(/[–—]/g,'-')
    if(!/\bCOGNITIVE\b/i.test(normalized)||!/Impulse\s*(?:-\s*)?Control/i.test(normalized))return
    const re=/Impulse\s*(?:-\s*)?Control\s*-?\d*(?:st|nd|rd|th|%)?/ig
    let m
    while((m=re.exec(normalized))!==null){
      const start=Math.max(0,m.index-260)
      const end=Math.min(normalized.length,m.index+760)
      const windowText=normalized.slice(start,end)
      const localStart=m.index-start
      const rankRe=new RegExp(rankPattern,'ig')
      let rm
      while((rm=rankRe.exec(windowText))!==null){
        const rank=day2NormalizeCognitiveRankValue(rm[1])
        if(rank)candidates.push({rank,dist:Math.abs(rm.index-localStart)})
      }
      if(m.index===re.lastIndex)re.lastIndex++
    }
  })
  if(!candidates.length)return ''
  candidates.sort((a,b)=>a.dist-b.dist)
  return candidates[0].rank
}
function day2ExtractImpulseSummaryRank(input){
  return day2ExtractImpulseSummaryRankFromPageItems(input)||day2ExtractImpulseSummaryRankFromText(input)
}
function day2ParseImpulseControlFallback(input,primarySection){
  const sections=[]
  const impulseLabelRe=/Impulse\s*(?:[-–—]\s*)?Control/i
  const impulseLabelGlobal=/Impulse\s*(?:[-–—]\s*)?Control/ig
  function addSection(section,scoreBoost,sourceTag){
    const cleaned=day2NormResultText(section).replace(/[–—]/g,'-')
    if(!cleaned)return
    const key=cleaned.slice(0,700)+'::'+cleaned.length
    if(sections.some(s=>s.key===key))return
    let weight=scoreBoost||0
    if(impulseLabelRe.test(cleaned))weight+=30
    if(/Measures\s+a\s+patient'?s\s+inhibitory\s+control/i.test(cleaned))weight+=28
    if(/Profile\s+Baseline\s+Details/i.test(cleaned))weight+=28
    if(/\bScore\b[\s\S]{0,90}?\bPercentile\b/i.test(cleaned))weight+=65
    if(/\bScore\b/i.test(cleaned))weight+=20
    if(/\bPercentile\b/i.test(cleaned))weight+=10
    if(/\bTEST\s*1\b/i.test(cleaned))weight+=16
    if(/\bReaction\s+Time\b/i.test(cleaned)&&!impulseLabelRe.test(cleaned.slice(0,100)))weight-=26
    if(/\bMemory\b/i.test(cleaned.slice(0,180)))weight-=18
    sections.push({section:cleaned,score:weight,key,sourceTag:sourceTag||''})
  }
  addSection(primarySection,45,'primary')
  day2BuildCognitiveCandidateTexts(input).forEach(text=>{
    const normalized=day2NormResultText(text).replace(/[–—]/g,'-')
    if(!normalized)return
    let m
    impulseLabelGlobal.lastIndex=0
    while((m=impulseLabelGlobal.exec(normalized))!==null){
      const start=m.index
      const after=start+m[0].length
      const boundary=day2FindNextCognitiveBoundary(normalized,after,'Impulse Control',['Memory','Reverse Number Counting','Cued Stroop','DEVICE','SUMMARY','Device Details','SURVEY','SURVEYS'])
      addSection(normalized.slice(start,boundary),25,'boundary')
      addSection(normalized.slice(start,Math.min(normalized.length,start+2200)),12,'window')
      addSection(normalized.slice(Math.max(0,start-120),Math.min(normalized.length,start+2600)),4,'wide-window')
      if(m.index===impulseLabelGlobal.lastIndex)impulseLabelGlobal.lastIndex++
    }
  })
  function normalizeScore(raw){
    const value=day2CleanExtractedValue(raw).replace(/milliseconds/ig,'ms')
    if(!day2IsPresentValue(value))return ''
    const m=value.match(/-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?/i)
    return m?day2FormatOneDecimal(m[0]):''
  }
  function normalizePercentile(raw){return day2NormalizePercentileValue(raw)}
  function firstPair(section){
    const pairPatterns=[
      /\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|milliseconds|seconds|second|cm))?)\s+Percentile\s*[:.]?\s*([^\s\n]+)/i,
      /\bScore\s*[:.]?\s*\n?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|milliseconds|seconds|second|cm))?)[\s\S]{0,80}?\bPercentile\s*[:.]?\s*([^\s\n]+)/i
    ]
    for(const pattern of pairPatterns){
      const m=section.match(pattern)
      if(m&&day2IsPresentValue(m[1]))return {score:m[1],percentile:m[2]||''}
    }
    return {score:'',percentile:''}
  }
  function firstScoreOnly(section){
    const noProfile=String(section||'').replace(/Profile\s+Baseline\s+Details[\s\S]*?(?=\bScore\b)/i,'')
    const beforeNextTest=noProfile.split(/\bTEST\s*1\b/i)[0]||noProfile
    const m=beforeNextTest.match(/\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|milliseconds|seconds|second|cm))?)/i)
    if(m&&day2IsPresentValue(m[1]))return m[1]
    const testMatch=noProfile.match(/\bTEST\s*1[\s\S]{0,180}?\bScore\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|milliseconds|seconds|second|cm))?)/i)
    return testMatch&&day2IsPresentValue(testMatch[1])?testMatch[1]:''
  }
  function profilePercentile(text){
    const m=String(text||'').replace(/[–—]/g,'-').match(/Profile\s+Baseline\s+Details[\s\S]{0,500}?\bPercentile\s*[:.]?\s*(\d+(?:\.\d+)?(?:st|nd|rd|th)?)/i)
    return m?normalizePercentile(m[1]):''
  }
  function parseSection(item){
    const sec=item.section
    const labelMatch=sec.match(impulseLabelRe)
    const metricSec=labelMatch?sec.slice(labelMatch.index+labelMatch[0].length):sec
    const pair=firstPair(metricSec)
    const score=normalizeScore(pair.score)||normalizeScore(firstScoreOnly(metricSec))
    const percentile=normalizePercentile(pair.percentile)||profilePercentile(metricSec)
    const complete=(day2IsPresentValue(score)?2:0)+(day2IsPresentValue(percentile)?1:0)
    let rank=item.score+complete*80
    if(day2IsPresentValue(score))rank+=45
    if(/\bScore\b[\s\S]{0,90}?\bPercentile\b/i.test(metricSec)&&day2IsPresentValue(score))rank+=50
    if(/\bTEST\s*1\b/i.test(metricSec)&&day2IsPresentValue(score))rank+=12
    return {score,percentile,rank,section:sec}
  }
  const parsed=sections.map(parseSection).filter(v=>day2IsPresentValue(v.score)||day2IsPresentValue(v.percentile))
  const summaryRank=day2ExtractImpulseSummaryRank(input)
  if(!parsed.length)return {score:'',percentile:'',rank:summaryRank}
  parsed.sort((a,b)=>b.rank-a.rank)
  return {score:parsed[0].score||'',percentile:parsed[0].percentile||'',rank:summaryRank}
}

function day2ExtractCognitiveMetric(input,label,outName,nextLabels){
  const sec=day2CognitiveSection(input,label,nextLabels)
  const sp=day2ParseScorePercentile(sec)
  function neuroNumberOnly(value){
    const raw=day2CleanExtractedValue(value)
    if(!day2IsPresentValue(raw))return ''
    const m=raw.match(/-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?/i)
    if(!m)return raw
    return day2FormatOneDecimal(m[0])
  }
  function neuroPercentile(value){
    return day2NormalizePercentileValue(value)
  }
  function extractRange(text){
    const m=String(text||'').replace(/[–—]/g,'-').match(/\bRange\s*[:.]?\s*([0-9][^\n]*)/i)
    if(!m)return ''
    const raw=m[1].replace(/\s*(?:Score|Percentile|Baseline|Rank|Test\s*\d|Count|Cognitive|Device|Survey)\b.*/i,'')
    return day2NormRangeDash(raw.replace(/\s+/g,' ').replace(/\s*-\s*/g,' - ').trim())
  }
  function profileBaselineVal(text){
    const m=String(text||'').replace(/[–—]/g,'-').match(/Profile\s+Baseline\s+Details[\s\S]{0,400}?\bBaseline\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)/i)
    return m?neuroNumberOnly(m[1]):''
  }
  function profileRangeVal(text){
    const m=String(text||'').replace(/[–—]/g,'-').match(/Profile\s+Baseline\s+Details[\s\S]{0,400}?\bRange\s*[:.]?\s*([0-9][^\n]*)/i)
    if(!m)return ''
    const raw=m[1].replace(/\s*(?:Score|Percentile|Baseline|Rank|Test\s*\d|Count|Cognitive|Device|Survey)\b.*/i,'')
    return day2NormRangeDash(raw.replace(/\s+/g,' ').replace(/\s*-\s*/g,' - ').trim())
  }
  const isImpulseControl=String(label||'').toLowerCase().replace(/\s+/g,' ').trim()==='impulse control'
  if(isImpulseControl){
    const impulse=day2ParseImpulseControlFallback(input,sec)
    const avg=profileBaselineVal(sec)||neuroNumberOnly(impulse.score)
    const percentile=neuroPercentile(impulse.percentile)||
      (()=>{const m=String(sec||'').replace(/[–—]/g,'-').match(/Profile\s+Baseline\s+Details[\s\S]{0,500}?\bPercentile\s*[:.]?\s*(\d+(?:\.\d+)?(?:st|nd|rd|th)?)/i);return m?neuroPercentile(m[1]):''})()
    const rank=impulse.rank||day2RankFromPercentile(percentile)
    const hasAny=day2IsPresentValue(avg)||day2IsPresentValue(percentile)||day2IsPresentValue(rank)
    const range=profileRangeVal(sec)||extractRange(sec)
    return {
      name:outName||label,
      avg:avg,
      range:range||'',
      percentile:percentile,
      rank:rank,
      baselineCount:'1'
    }
  }
  const avg=profileBaselineVal(sec)||neuroNumberOnly(sp.score)
  const rawPercentile=neuroPercentile(sp.percentile)||
    (()=>{const m=String(sec||'').replace(/[–—]/g,'-').match(/Profile\s+Baseline\s+Details[\s\S]{0,500}?\bPercentile\s*[:.]?\s*(\d+(?:\.\d+)?(?:st|nd|rd|th)?)/i);return m?neuroPercentile(m[1]):''})()
  const hasAny=day2IsPresentValue(avg)||day2IsPresentValue(rawPercentile)
  const range=profileRangeVal(sec)||extractRange(sec)
  return {
    name:outName||label,
    avg:avg,
    range:(String(label||'').toLowerCase().trim()==='memory'||String(label||'').toLowerCase().trim()==='cued stroop')?day2FormatMemoryCognitiveRange(range):range||'',
    percentile:rawPercentile,
    rank:day2RankFromPercentile(rawPercentile),
    baselineCount:hasAny?'1':''
  }
}
function day2SourceText(source){
  if(source&&typeof source==='object')return String(source.text||'')
  return String(source||'')
}
function day2ParseVomsRows(source){
  const positional=day2ParseVomsRowsFromPageItems(source)
  if(day2ScoreVomsRows(positional)>=24)return positional
  return day2ParseVomsRowsFromText(source).map(row=>{
    if(!row||row[0]==='Convergence (Near Point)')return row
    const clean=row.slice()
    clean[6]=''
    return clean
  })
}
function day2ScoreVomsRows(rows){
  return (rows||[]).reduce((total,row)=>total+(row||[]).slice(1,6).filter(day2IsPresentValue).length,0)
}
function day2ParseVomsRowsFromPageItems(source){
  if(!source||typeof source!=='object'||!Array.isArray(source.pageItems))return []
  const rowLabels=['Baseline Symptoms','Pursuits','Saccades - Horizontal','Saccades - Vertical','Convergence (Near Point)','VOR - Horizontal','VOR - Vertical','Visual Motion Sensitivity']
  const targets={'Baseline Symptoms':['baselinesymptoms'],'Pursuits':['smoothpursuits','pursuits'],'Saccades - Horizontal':['saccadeshorizontal'],'Saccades - Vertical':['saccadesvertical'],'Convergence (Near Point)':['convergencenearpoint'],'VOR - Horizontal':['vorhorizontal'],'VOR - Vertical':['vorvertical'],'Visual Motion Sensitivity':['visualmotionsensitivity']}
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z]/g,'')}
  function cx(it){return (Number(it.x)||0)+(Number(it.width)||0)/2}
  function cleanNum(v){const m=String(v||'').replace(/,/g,'').trim().match(/^-?\d+(?:\.\d+)?$/);return m?m[0]:''}
  function isNumItem(it){return !!cleanNum(it&&it.text)}
  function groupLines(items,tol){
    const rows=[]
    ;(items||[]).forEach(it=>{if(!String(it.text||'').trim())return;let r=rows.find(x=>Math.abs(x.y-it.y)<(tol||4));if(!r){r={y:it.y,items:[]};rows.push(r)}r.items.push(it)})
    rows.sort((a,b)=>a.y-b.y)
    return rows.map(r=>{r.items.sort((a,b)=>a.x-b.x);return {y:r.items.reduce((sum,it)=>sum+it.y,0)/r.items.length,text:r.items.map(it=>it.text).join(' '),items:r.items}}).filter(r=>String(r.text||'').trim())
  }
  function findHeaders(items){
    const names=['HEADACHE','DIZZINESS','NAUSEA','FOGGINESS','TOTAL','COMMENTS']
    const headerLine=groupLines(items,4).find(l=>{const n=norm(l.text);return n.includes('headache')&&n.includes('dizziness')&&n.includes('nausea')&&n.includes('fogginess')&&n.includes('total')})
    if(headerLine){
      const centers=names.map(n=>{const exact=headerLine.items.find(it=>String(it.text||'').trim().toUpperCase()===n);return exact?cx(exact):0})
      if(!centers[0]||!centers[4]){const minX=Math.min(...headerLine.items.map(it=>it.x)),maxX=Math.max(...headerLine.items.map(it=>it.x+(Number(it.width)||0))),step=(maxX-minX)/6;for(let i=0;i<5;i++)if(!centers[i])centers[i]=minX+step*(i+.5);if(!centers[5])centers[5]=minX+step*5.5}
      return {centers,headerY:headerLine.y,firstDataX:centers[0]}
    }
    return null
  }
  function columnBounds(h){const c=h.centers,gap=(c[1]&&c[0])?Math.max(24,c[1]-c[0]):55,b=[];b[0]=c[0]-gap/2;for(let i=1;i<5;i++)b[i]=(c[i-1]+c[i])/2;b[5]=c[5]?((c[4]+c[5])/2):(c[4]+gap/2);b[6]=c[5]?(c[5]+Math.max(55,c[5]-c[4])):9999;return b}
  function labelCenters(items,h){
    const lines=groupLines((items||[]).filter(it=>cx(it)<h.firstDataX-18&&it.y>(h.headerY||0)+4),5),found={}
    for(let i=0;i<lines.length;i++)for(let span=1;span<=4&&i+span<=lines.length;span++){
      const group=lines.slice(i,i+span),combined=norm(group.map(l=>l.text).join(' '))
      Object.entries(targets).forEach(([label,targetList])=>{
        const targetsForLabel=Array.isArray(targetList)?targetList:[targetList]
        if(!found[label]&&targetsForLabel.some(target=>combined===target||combined.startsWith(target)))found[label]={label,y:(group[0].y+group[group.length-1].y)/2,top:group[0].y,bottom:group[group.length-1].y}
      })
    }
    return Object.values(found).sort((a,b)=>a.y-b.y)
  }
  function rowBand(centers,i,h,pageHeight){const cur=centers[i],prev=centers[i-1],next=centers[i+1];let top=prev?(prev.y+cur.y)/2:Math.max((h.headerY||0)+6,cur.y-35);let bottom=next?(cur.y+next.y)/2:Math.min(pageHeight||9999,cur.y+62);return {top:top-16,bottom:bottom+12}}
  function commentBand(centers,i,h,pageHeight){
    const cur=centers[i],prev=centers[i-1],next=centers[i+1]
    // VOMS comments must stay in the exact table row. The comment text can start
    // above the row label and can wrap across several lines, so use row boundaries
    // between neighboring labels instead of the label's own top/bottom.
    const curTop=Number(cur.top)||cur.y
    const curBottom=Number(cur.bottom)||cur.y
    const prevBottom=prev?(Number(prev.bottom)||prev.y):null
    const nextTop=next?(Number(next.top)||next.y):null
    const top=prev?Math.max((h.headerY||0)+6,(prevBottom+curTop)/2):Math.max((h.headerY||0)+10,(h.headerY||0)+6)
    const bottom=next?Math.max(top+2,(Number(next.top)||next.y)-2):Math.min(pageHeight||9999,curBottom+72)
    return {top:top,bottom:bottom}
  }
  function numInCol(items,b,col,top,bottom){
    const colItems=(items||[]).filter(it=>cx(it)>=b[col]-15&&cx(it)<b[col+1]+15)
    const changeYs=[]
    colItems.filter(it=>/[▲△▴▵]/.test(String(it.text||''))).forEach(tri=>{
      const below=colItems.filter(it=>isNumItem(it)&&it.y>=tri.y-2&&it.y<=tri.y+20)
      if(below.length){below.sort((a,b_)=>a.y-b_.y);changeYs.push(below[0].y)}
    })
    const nums=(items||[]).filter(it=>{const x=cx(it);if(!(x>=b[col]&&x<b[col+1]&&it.y>=top&&it.y<=bottom&&isNumItem(it)))return false;return !changeYs.some(cy=>Math.abs(it.y-cy)<=3)}).map(it=>({v:cleanNum(it.text),x:cx(it),y:it.y}))
    if(!nums.length)return '';nums.sort((a,b_)=>a.y-b_.y||a.x-b_.x);return nums[0].v
  }
  function vomsCommentInCol(items,b,top,bottom){
    const lines=groupLines((items||[]).filter(it=>{const x=cx(it);return x>=b[5]&&x<b[6]&&it.y>=top&&it.y<=bottom}),5)
    return lines.map(line=>String(line.text||'').replace(/\s+/g,' ').trim()).filter(txt=>{
      if(!txt)return false
      if(/^COMMENTS$/i.test(txt))return false
      if(/^Measure\s*[123]\s*\(cm\)/i.test(txt))return false
      if(/^\d+(?:\.\d+)?$/.test(txt))return false
      if(/\bDevice\b/i.test(txt))return false
      if(/\bOS\s*Version\b/i.test(txt))return false
      if(/\bApp\s*Version\b/i.test(txt))return false
      if(/\bPhone\d|iPhone\d|Android/i.test(txt))return false
      if(/\bApple\b|\bManufacturer\b|\bPlatform\b.*iOS/i.test(txt))return false
      if(/\bDEVICE\s+SUMMARY\b/i.test(txt))return false
      if(/^[A-F0-9][\sA-F0-9]{6,}$/i.test(txt))return false
      if(/\bID\s+[A-F0-9]/i.test(txt))return false
      if(/\d+\.\d+\.\d+/.test(txt)&&/\bID\b/i.test(txt))return false
      if(/^\d+\.\d+\.\d+\s/.test(txt))return false
      return true
    }).join('\n')
  }
  function convergenceComment(items,b,top,bottom){
    const lines=groupLines((items||[]).filter(it=>{const x=cx(it);return x>=b[5]&&x<b[6]&&it.y>=top&&it.y<=bottom}),5)
    function measureValue(n){
      const idx=lines.findIndex(line=>new RegExp('Measure\\s*'+n+'\\s*\\(cm\\)','i').test(line.text));if(idx<0)return ''
      const inline=String(lines[idx].text||'').match(new RegExp('Measure\\s*'+n+'\\s*\\(cm\\)\\s*:\\s*(\\d+(?:\\.\\d+)?)','i'));if(inline)return inline[1]
      const next=lines.findIndex((line,i)=>i>idx&&/Measure\s*[123]\s*\(cm\)/i.test(line.text));const end=next>=0?next:lines.length
      for(let i=idx+1;i<end;i++){const nums=(lines[i].items||[]).filter(isNumItem).map(it=>({v:cleanNum(it.text),x:cx(it),y:it.y}));if(nums.length){nums.sort((a,b)=>a.y-b.y||a.x-b.x);return nums[0].v}}
      return ''
    }
    const m=[1,2,3].map(measureValue)
    const measureLines=m.some(day2IsPresentValue)?['Measure 1 (cm): '+(m[0]||''),'Measure 2 (cm): '+(m[1]||''),'Measure 3 (cm): '+(m[2]||'')]:[]
    const extraLines=lines.map(l=>String(l.text||'').replace(/\s+/g,' ').trim()).filter(txt=>txt&&!/^Measure\s*[123]\s*\(cm\)/i.test(txt)&&!/^\d+(?:\.\d+)?$/.test(txt)&&!/^COMMENTS$/i.test(txt))
    return [...measureLines,...extraLines].join('\n')
  }
  function parsePage(items,h,size){
    const b=columnBounds(h),centers=labelCenters(items,h),pageH=(size&&size.height)||9999,out={}
    // Pass 1: topmost numeric-item y for each row's data band (used as authoritative row-start anchor)
    const rowNumTopY=centers.map((c,i)=>{
      const rb=rowBand(centers,i,h,pageH)
      const ni=(items||[]).filter(it=>{const x=cx(it);return x>=b[0]&&x<b[5]&&it.y>=rb.top&&it.y<=rb.bottom&&isNumItem(it)})
      return ni.length?Math.min(...ni.map(it=>it.y)):null
    })
    // Pass 2: build non-overlapping comment bands
    // Bottom: cap at (next row's numeric top - 3) so wrapped text never crosses into the next row
    // Top: set sequentially so each row starts just after the previous row ends
    const cbBottoms=centers.map((c,i)=>{
      const cb=commentBand(centers,i,h,pageH)
      const nny=rowNumTopY[i+1]
      return nny!=null?Math.min(cb.bottom,nny-3):cb.bottom
    })
    const cbTops=centers.map((c,i)=>{
      const cb=commentBand(centers,i,h,pageH)
      return i===0?cb.top:Math.max(cb.top,cbBottoms[i-1]+1)
    })
    centers.forEach((c,i)=>{
      const rb=rowBand(centers,i,h,pageH)
      let vals=[0,1,2,3,4].map(col=>numInCol(items,b,col,rb.top,rb.bottom))
      vals=vals.map((v,ci)=>{if(!day2IsPresentValue(v))return v;const n=Number(v);return(ci<4?(n<0||n>10):(n<0||n>40))?'':v})
      if(!vals[4]&&vals.slice(0,4).every(day2IsPresentValue))vals[4]=String(vals.slice(0,4).map(Number).reduce((a,b)=>a+b,0))
      const comment=c.label==='Convergence (Near Point)'?convergenceComment(items,b,cbTops[i],cbBottoms[i]):vomsCommentInCol(items,b,cbTops[i],cbBottoms[i])
      out[c.label]=[c.label].concat(vals).concat([comment])
    })
    return out
  }
  function pageHasVomsRows(items,h){return labelCenters(items,h).some(c=>/Saccades|Convergence|VOR|Visual Motion/i.test(c.label))}
  const tables=[];let active=null
  ;(source.pageItems||[]).forEach((pg,i)=>{const items=(Array.isArray(pg)?pg:[]).map(it=>({x:Number(it.x)||0,y:Number(it.y)||0,width:Number(it.width)||0,height:Number(it.height)||0,text:String(it.text||'')})),h=findHeaders(items);if(h){if(active)tables.push(active);active={headers:h,rows:{}}}else if(!active)return;const useH=h||active.headers;if(!h&&!pageHasVomsRows(items,useH))return;const parsed=parsePage(items,useH,(source.pageSizes||[])[i]||{});Object.entries(parsed).forEach(([label,row])=>{const old=active.rows[label],oldScore=old?old.slice(1,6).filter(day2IsPresentValue).length:-1,newScore=row.slice(1,6).filter(day2IsPresentValue).length;if(!old||newScore>=oldScore)active.rows[label]=row})})
  if(active)tables.push(active)
  let best=[];tables.forEach(table=>{const rows=rowLabels.map(label=>table.rows[label]||[label,'','','','','','']);if(day2ScoreVomsRows(rows)>=day2ScoreVomsRows(best))best=rows})
  return best
}
function day2ParseVomsRowsFromText(source){
  const text=day2SourceText(source),voms=day2SectionBetween(text,'VOMS',['SURVEYS','COGNITIVE'],false)
  let flat=day2FlatResultText(voms).replace(/\bBaseline\s+Symptoms\b/g,'Baseline Symptoms').replace(/\bSmooth\s+Pursuits\b/g,'Pursuits').replace(/\bPursuits\b/g,'Pursuits').replace(/Saccades\s*-\s*Horizontal/gi,'Saccades - Horizontal').replace(/Saccades\s*-\s*Vertical/gi,'Saccades - Vertical').replace(/Convergence\s*\(Near\s*Point\)/gi,'Convergence (Near Point)').replace(/VOR\s*-\s*Horizontal/gi,'VOR - Horizontal').replace(/VOR\s*-\s*Vertical/gi,'VOR - Vertical').replace(/Visual\s+Motion\s+Sensitivity/gi,'Visual Motion Sensitivity')
  const header='HEADACHE DIZZINESS NAUSEA FOGGINESS TOTAL COMMENTS',headerIdx=flat.indexOf(header);if(headerIdx>=0)flat=flat.slice(headerIdx+header.length)
  const defs=[['Baseline Symptoms','Baseline Symptoms','Pursuits'],['Pursuits','Pursuits','Saccades - Horizontal'],['Saccades - Horizontal','Saccades - Horizontal','Saccades - Vertical'],['Saccades - Vertical','Saccades - Vertical','Convergence (Near Point)'],['Convergence (Near Point)','Convergence (Near Point)','VOR - Horizontal'],['VOR - Horizontal','VOR - Horizontal','VOR - Vertical'],['VOR - Vertical','VOR - Vertical','Visual Motion Sensitivity'],['Visual Motion Sensitivity','Visual Motion Sensitivity','COGNITIVE']]
  function rowChunk(start,end){const i=flat.indexOf(start);if(i<0)return '';let j=end?flat.indexOf(end,i+start.length):-1;if(j<0)j=flat.length;return flat.slice(i+start.length,j)}
  function numsFor(start,end){const chunk=rowChunk(start,end).replace(/Measure\s+[123]\s*\(cm\)\s*:\s*\d+(?:\.\d+)?/gi,' ');return (chunk.match(/\b\d+(?:\.\d+)?\b/g)||[])}
  function commentFor(start,end){let count=0;let chunk=rowChunk(start,end).replace(/Measure\s+[123]\s*\(cm\)\s*:\s*\d+(?:\.\d+)?/gi,' ');chunk=chunk.replace(/\b\d+(?:\.\d+)?\b/g,m=>{count++;return count<=5?' ':m});return day2CleanExtractedValue(chunk.replace(/^[\s:;,.\-–—▲△]+/g,'').replace(/\s+/g,' '))}
  const wholeFlat=day2FlatResultText(text),measures=[];[1,2,3].forEach(n=>{const re=new RegExp('Measure\s*'+n+'\s*\(cm\)\s*:\s*(\d+(?:\.\d+)?)','ig');const all=[...wholeFlat.matchAll(re)].map(m=>m[1]).filter(Boolean);measures.push(all.length?all[0]:'')})
  return defs.map(([name,start,end])=>{const vals=numsFor(start,end).slice(0,5);while(vals.length<5)vals.push('');vals.forEach((v,ci)=>{if(day2IsPresentValue(v)){const n=Number(v);if(ci<4?(n<0||n>10):(n<0||n>40))vals[ci]=''}});if(!vals[4]&&vals.slice(0,4).every(day2IsPresentValue))vals[4]=String(vals.slice(0,4).map(Number).reduce((a,b)=>a+b,0));const comment=name==='Convergence (Near Point)'?[measures[0]?('Measure 1 (cm): '+measures[0]):'',measures[1]?('Measure 2 (cm): '+measures[1]):'',measures[2]?('Measure 3 (cm): '+measures[2]):''].filter(Boolean).join('\n'):commentFor(start,end);return [name,vals[0]||'',vals[1]||'',vals[2]||'',vals[3]||'',vals[4]||'',comment]})
}
function day2ParseSwayTest1(source,context){
  const t=day2NormResultText(day2SourceText(source))
  const flat=day2FlatResultText(t)
  const sessionDate=day2ExtractSwayTestDate(t)||day2FormatAnyDate(context?.data?.sessionDate||'')
  const dosDate=day2FormatAnyDate(context?.data?.aceDateOfService||'')||getDay2AceDateOfService(context?.patient)||sessionDate
  function day2SurveyTotalScore(labelPatterns,maxScore){
    // Day 2 only: robust PHQ-9/GAD-7 score extraction from Sway PDF SURVEY/SURVEYS sections.
    const targetMax=Number(maxScore)
    const isPhq=targetMax===27
    const isGad=targetMax===21
    if(!isPhq&&!isGad)return ''
    const targetRegexes=isPhq?[
      /P\s*H\s*Q\s*[-‐‑‒–—−]?\s*9/i,
      /PHQ\s*[-‐‑‒–—−]?\s*9/i,
      /Patient\s+Health\s+Questionnaire\s*[-‐‑‒–—−]?\s*9/i
    ]:[
      /G\s*A\s*D\s*[-‐‑‒–—−]?\s*7/i,
      /GAD\s*[-‐‑‒–—−]?\s*7/i,
      /General(?:ized)?\s+Anxiety\s+Disorder\s*[-‐‑‒–—−]?\s*7/i
    ]
    const otherRegexes=isPhq?[
      /G\s*A\s*D\s*[-‐‑‒–—−]?\s*7/i,
      /GAD\s*[-‐‑‒–—−]?\s*7/i,
      /General(?:ized)?\s+Anxiety\s+Disorder\s*[-‐‑‒–—−]?\s*7/i
    ]:[
      /P\s*H\s*Q\s*[-‐‑‒–—−]?\s*9/i,
      /PHQ\s*[-‐‑‒–—−]?\s*9/i,
      /Patient\s+Health\s+Questionnaire\s*[-‐‑‒–—−]?\s*9/i
    ]
    const allLabelRegexes=targetRegexes.concat(otherRegexes)
    function cleanScore(v){
      const m=String(v||'').replace(/,/g,'').match(/\b\d+(?:\.\d+)?\b/)
      if(!m)return ''
      const n=Number(m[0])
      if(!Number.isFinite(n)||n<0||n>targetMax)return ''
      return m[0].replace(/\.0$/,'')
    }
    function formatScore(v){
      const score=cleanScore(v)
      return score!==''?score+' of '+targetMax:''
    }
    function labelKey(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
    function matchesAny(value,regexes){return (regexes||[]).some(re=>re.test(String(value||'')))}
    function isTargetLabel(value){return matchesAny(value,targetRegexes)||((isPhq&&labelKey(value).includes('PHQ9'))||(isGad&&labelKey(value).includes('GAD7')))}
    function isAnySurveyLabel(value){
      const key=labelKey(value)
      return matchesAny(value,allLabelRegexes)||key.includes('PHQ9')||key.includes('GAD7')||key.includes('PATIENTHEALTHQUESTIONNAIRE9')||key.includes('GENERALANXIETYDISORDER7')||key.includes('GENERALIZEDANXIETYDISORDER7')
    }
    function isSeverityHeader(value){return /TOTAL\s*SCORE\s+(?:DEPRESSION|ANXIETY)\s+SEVERITY/i.test(String(value||''))}
    function normalizedText(value){
      return day2NormResultText(value)
        .replace(/[‐‑‒–—−]/g,'-')
        .replace(/P\s*H\s*Q\s*-?\s*9/ig,'PHQ9')
        .replace(/G\s*A\s*D\s*-?\s*7/ig,'GAD7')
    }
    function scoreFromTotalWindow(block){
      const raw=day2NormResultText(block)
      if(!raw)return ''
      const lines=raw.split('\n').map(v=>day2CleanExtractedValue(v)).filter(Boolean)
      for(let i=0;i<lines.length;i++){
        const line=lines[i]
        const nearby=lines.slice(i,Math.min(lines.length,i+6)).join(' ')
        if(isSeverityHeader(line)||isSeverityHeader(nearby))continue
        let m=line.match(/\bTotal\s*Score\b\s*[:.\-–—]?\s*(\d+(?:\.\d+)?)/i)
        if(m){const score=formatScore(m[1]);if(score)return score}
        if(/\bTotal\s*Score\b/i.test(line)||(/\bTotal\b/i.test(nearby)&&/\bScore\b/i.test(nearby))){
          const sameLineAfter=line.replace(/^.*?\bTotal\s*Score\b\s*[:.\-–—]?\s*/i,'')
          let score=formatScore(sameLineAfter)
          if(score)return score
          for(let j=i+1;j<Math.min(lines.length,i+7);j++){
            const next=String(lines[j]||'').trim()
            if(!next||isSeverityHeader(next))continue
            if(/^\d+(?:\.\d+)?$/.test(next)){score=formatScore(next);if(score)return score}
            score=formatScore(next.replace(/^(?:Score|Total)\s*[:.\-–—]?\s*/i,''))
            if(score&&/^\s*(?:Score|Total)?\s*[:.\-–—]?\s*\d+(?:\.\d+)?\s*$/i.test(next))return score
          }
        }
        m=nearby.match(/\bTotal\s*Score\b\s*[:.\-–—]?\s*(\d+(?:\.\d+)?)/i)
        if(m){const score=formatScore(m[1]);if(score)return score}
      }
      return ''
    }
    function labelMatches(text,regexes){
      const matches=[]
      ;(regexes||[]).forEach(re=>{
        const scan=new RegExp(re.source,'ig')
        let m
        while((m=scan.exec(text))!==null){matches.push({index:m.index,length:m[0].length})}
      })
      matches.sort((a,b)=>a.index-b.index)
      return matches
    }
    function stopAfter(text,startAt){
      let end=Math.min(text.length,startAt+2600)
      labelMatches(text,otherRegexes).forEach(m=>{if(m.index>startAt&&m.index<end)end=m.index})
      ;['VOMS','COGNITIVE','BALANCE','mBESS','DEVICE','SUMMARY','Test Details'].forEach(label=>{
        const idx=text.toLowerCase().indexOf(label.toLowerCase(),startAt)
        if(idx>=0&&idx<end)end=idx
      })
      return end
    }
    function textCandidates(){
      const candidates=[]
      if(source&&typeof source==='object'&&Array.isArray(source.pageTexts)){
        source.pageTexts.forEach((pg,i)=>{
          if(pg)candidates.push(String(pg))
          if(pg&&source.pageTexts[i+1])candidates.push(String(pg)+'\n'+String(source.pageTexts[i+1]))
        })
      }
      candidates.push(day2SourceText(source))
      candidates.push(t)
      return candidates.filter(Boolean)
    }
    function surveyBlocksFromText(text){
      const sourceText=normalizedText(text)
      const blocks=[]
      const surveyMatches=[...sourceText.matchAll(/\bSURVEYS?\b/ig)]
      surveyMatches.forEach((m,idx)=>{
        const start=m.index
        let end=idx+1<surveyMatches.length?surveyMatches[idx+1].index:sourceText.length
        ;['Test Details','VOMS','COGNITIVE','DEVICE','SUMMARY'].forEach(label=>{
          const loc=sourceText.toLowerCase().indexOf(label.toLowerCase(),start+7)
          if(loc>start&&loc<end)end=loc
        })
        blocks.push(sourceText.slice(start,end))
      })
      blocks.push(sourceText)
      return blocks.filter(Boolean)
    }
    function scoreByLabelPath(){
      for(const candidate of textCandidates()){
        for(const block of surveyBlocksFromText(candidate)){
          const matches=labelMatches(block,targetRegexes)
          for(const match of matches){
            const sectionStart=match.index+match.length
            const sectionEnd=stopAfter(block,sectionStart)
            const score=scoreFromTotalWindow(block.slice(match.index,sectionEnd))
            if(score)return score
          }
        }
      }
      return ''
    }
    function scoreByLinePath(){
      for(const candidate of textCandidates()){
        for(const block of surveyBlocksFromText(candidate)){
          const lines=day2NormResultText(block).split('\n').map(v=>v.trim()).filter(Boolean)
          for(let i=0;i<lines.length;i++){
            const labelWindow=lines.slice(i,Math.min(lines.length,i+5)).join(' ')
            if(!isTargetLabel(labelWindow))continue
            let end=lines.length
            for(let j=i+1;j<lines.length;j++){
              const stopWindow=lines.slice(j,Math.min(lines.length,j+4)).join(' ')
              if(isAnySurveyLabel(stopWindow)){end=j;break}
              if(/^(?:VOMS|COGNITIVE|BALANCE|mBESS|DEVICE|SUMMARY|Test Details)\b/i.test(lines[j])){end=j;break}
            }
            const score=scoreFromTotalWindow(lines.slice(i,end).join('\n'))
            if(score)return score
          }
        }
      }
      return ''
    }
    function scoreFromPageItems(){
      if(!source||typeof source!=='object'||!Array.isArray(source.pageItems))return ''
      function lineRows(items){
        const rows=[]
        ;(items||[]).forEach(it=>{
          const text=day2CleanExtractedValue(it&&it.text)
          if(!text)return
          const y=Number(it.y)||0
          let row=rows.find(r=>Math.abs(r.y-y)<4)
          if(!row){row={y,items:[]};rows.push(row)}
          row.items.push({text:text,x:Number(it.x)||0,y:y,width:Number(it.width)||0})
        })
        rows.sort((a,b)=>a.y-b.y)
        return rows.map(row=>{row.items.sort((a,b)=>a.x-b.x);row.text=row.items.map(it=>it.text).join(' ');return row})
      }
      for(const page of source.pageItems){
        const lines=lineRows(page)
        const texts=lines.map(l=>l.text)
        for(let i=0;i<texts.length;i++){
          const labelWindow=texts.slice(i,Math.min(texts.length,i+5)).join(' ')
          if(!isTargetLabel(labelWindow))continue
          let end=Math.min(texts.length,i+160)
          for(let j=i+1;j<end;j++){
            const stopWindow=texts.slice(j,Math.min(texts.length,j+4)).join(' ')
            if(isAnySurveyLabel(stopWindow)){end=j;break}
            if(/\b(?:VOMS|COGNITIVE|BALANCE|mBESS|DEVICE|SUMMARY|Test Details)\b/i.test(stopWindow)){end=j;break}
          }
          for(let j=i;j<end;j++){
            const totalWindow=texts.slice(j,Math.min(end,j+6)).join(' ')
            if(/\bTotal\s*Score\b/i.test(totalWindow)||(/\bTotal\b/i.test(totalWindow)&&/\bScore\b/i.test(totalWindow))){
              const score=scoreFromTotalWindow(texts.slice(j,end).join('\n'))
              if(score)return score
            }
          }
        }
      }
      return ''
    }
    function scoreBySurveyOrderFallback(){
      for(const candidate of textCandidates()){
        for(const block of surveyBlocksFromText(candidate)){
          const totals=[]
          const lines=day2NormResultText(block).split('\n').map(v=>v.trim()).filter(Boolean)
          for(let i=0;i<lines.length;i++){
            if(!/\bTotal\s*Score\b/i.test(lines[i]))continue
            const score=scoreFromTotalWindow(lines.slice(i,Math.min(lines.length,i+7)).join('\n'))
            if(score&&!totals.includes(score))totals.push(score)
          }
          if(isPhq&&totals[0])return totals[0]
          if(isGad&&totals[1])return totals[1]
        }
      }
      return ''
    }
    return scoreByLabelPath()||scoreByLinePath()||scoreFromPageItems()||scoreBySurveyOrderFallback()
  }
  const phqScore=day2SurveyTotalScore(['PHQ\\s*[-–]?\\s*9','PHQ9'],27)
  const gadScore=day2SurveyTotalScore(['GAD\\s*[-–]?\\s*7','GAD7'],21)
  const mbessSection=day2SectionBetween(t,'mBESS',['Inspection Time','Reaction Time','Impulse Control','COGNITIVE'],false)||day2SectionBetween(t,'BALANCE',['COGNITIVE','SURVEY'],false)
  const mbessScore=day2FirstMatch(mbessSection,[/\bScore\s+([0-9.]+)\s+Percentile/i,/Composite Score\s+([0-9.]+)/i])
  const mbessBaselineAvg=day2FirstMatch(mbessSection,[/\bBaseline\s*[:.]\s*([0-9.]+)/i])
  const mbessPercentileRaw=day2FirstMatch(mbessSection,[/\bPercentile\s*[:.]\s*([0-9]+(?:st|nd|rd|th)?)/i,/\bScore\s+[0-9.]+\s+Percentile\s+([A-Za-z0-9%.-]+)/i])
  const mbessPercentile=day2CleanPercentile(mbessPercentileRaw)
  const mbessTestCount=day2FirstMatch(mbessSection,[/Test Count\s*[:.]\s*([0-9]+)/i,/Baseline Count\s*[:.]\s*([0-9]+)/i])||''
  const vomsRows=day2ParseVomsRows(source)
  const voms=day2SectionBetween(t,'VOMS',['COGNITIVE','SURVEYS'],false)
  const cognitiveRows=[
    day2ExtractCognitiveMetric(source,'Memory','Memory (Cognitive)',['Reverse Number Counting']),
    day2ExtractCognitiveMetric(source,'Reverse Number Counting','Reverse Number Counting (Cognitive Thought)',['Cued Stroop']),
    day2ExtractCognitiveMetric(source,'Cued Stroop','Cued Stroop (Cognitive Thought)',['DEVICE','SUMMARY']),
    day2ExtractCognitiveMetric(source,'Reaction Time','Reaction Time (Cognitive Thought/ Cognitive Reaction Time)',['Impulse Control']),
    day2ExtractCognitiveMetric(source,'Impulse Control','Impulse Control (Cognitive Thought/ Cognitive Reaction Time)',['Memory']),
    day2ExtractCognitiveMetric(source,'Inspection Time','Inspection Time (Cognitive Reaction Time)',['Reaction Time'])
  ]
  return {
    date:dosDate,
    sessionDate:sessionDate,
    total:day2FirstMatch(t,[/\bSymptoms\b[\s\S]*?\bTotal:\s*([0-9.]+)/i,/SYMPTOM TOTAL\s*([0-9.]+)/i]),
    physical:day2FirstMatch(t,[/\bPhysical\s+([0-9.]+)/i]),
    cognitive:day2FirstMatch(t,[/\bCognitive\s+([0-9.]+)/i]),
    emotional:day2FirstMatch(t,[/\bEmotional\s+([0-9.]+)/i]),
    sleep:day2FirstMatch(t,[/\bSleep[-\s]*Arousal\s+([0-9.]+)/i]),
    phqScore:phqScore,
    gadScore:gadScore,
    mbess:{
      avg:mbessBaselineAvg||day2FormatOneDecimal(mbessScore),
      range:day2ExtractMbessRange(mbessSection),
      percentile:mbessPercentile,
      rank:day2RankFromPercentile(mbessPercentile),
      baselineCount:mbessTestCount
    },
    voms:{
      avgConv:day2ExtractVomsConvergence(voms)||day2ExtractVomsConvergence(t),
      baseSymptoms:day2ExtractVomsNumeric(voms,'Baseline Symptoms')||day2ExtractVomsNumeric(t,'Baseline Symptoms'),
      maxProv:day2ExtractVomsNumeric(voms,'Max Provocation')||day2ExtractVomsNumeric(t,'Max Provocation'),
      maxTotal:day2ExtractVomsNumeric(voms,'Max Total Symptoms')||day2ExtractVomsNumeric(t,'Max Total Symptoms'),
      rows:vomsRows
    },
    cognitiveRows:cognitiveRows
  }
}
function day2ParseTest1(source){
  if(source&&source._parsed){
    const parsed=source._parsed
    if(!Array.isArray(parsed.cognitiveRows))return parsed
    return {...parsed,cognitiveRows:parsed.cognitiveRows.map(row=>{
      if(!Array.isArray(row)||!(row[0]==='Memory (Cognitive)'||row[0]==='Cued Stroop (Cognitive Thought)'))return row
      const copy=row.slice()
      copy[2]=day2FormatMemoryCognitiveRange(copy[2])
      return copy
    })}
  }
  const r=day2ParseSwayTest1(source,{patient:getPatient(selectedPatientId),data:getPatient(selectedPatientId)?.initialExam||{}})
  return {
    date:r.date,
    sessionDate:r.sessionDate,
    symptomRows:[['Total Symptoms',r.total],['Physical',r.physical],['Cognitive',r.cognitive],['Emotional',r.emotional],['Sleep-Arousal',r.sleep]],
    phqScore:r.phqScore,
    gadScore:r.gadScore,
    mbessRows:[['Baseline Average',r.mbess.avg],['Range',r.mbess.range],['Percentile',r.mbess.percentile],['Rank',r.mbess.rank],['Baseline Count',r.mbess.baselineCount]],
    vomsRows:r.voms.rows.map(row=>row.slice(0,7)),
    cognitiveRows:r.cognitiveRows.map(c=>[c.name,c.avg,c.range,c.percentile,c.rank,c.baselineCount])
  }
}
function mergeDay2Test1Parsed(arr){
  if(!arr.length)return null
  if(arr.length===1)return arr[0]
  const vomsScore=r=>(r.vomsRows||[]).reduce((s,row)=>s+row.slice(1,6).filter(day2IsPresentValue).length,0)
  const sorted=[...arr].sort((a,b)=>vomsScore(b)-vomsScore(a))
  const base=JSON.parse(JSON.stringify(sorted[0]))
  const rest=sorted.slice(1)
  for(let i=0;i<rest.length;i++){
    const src=rest[i]
    if(!day2IsPresentValue(base.date))base.date=src.date
    if(!day2IsPresentValue(base.phqScore))base.phqScore=src.phqScore
    if(!day2IsPresentValue(base.gadScore))base.gadScore=src.gadScore
    base.symptomRows=base.symptomRows.map((row,j)=>
      (!day2IsPresentValue(row[1])&&src.symptomRows[j]&&day2IsPresentValue(src.symptomRows[j][1]))?[row[0],src.symptomRows[j][1]]:row)
    base.mbessRows=base.mbessRows.map((row,j)=>
      (!day2IsPresentValue(row[1])&&src.mbessRows[j]&&day2IsPresentValue(src.mbessRows[j][1]))?[row[0],src.mbessRows[j][1]]:row)
    base.vomsRows=base.vomsRows.map(bRow=>{
      const sRow=src.vomsRows.find(r=>r[0]===bRow[0])
      if(!sRow)return bRow
      return bRow.map((cell,ci)=>ci===0?cell:(!day2IsPresentValue(cell)&&day2IsPresentValue(sRow[ci])?sRow[ci]:cell))
    })
    base.cognitiveRows=base.cognitiveRows.map(bRow=>{
      const sRow=src.cognitiveRows.find(r=>r[0]===bRow[0])
      if(!sRow)return bRow
      return bRow.map((cell,ci)=>ci===0?cell:(!day2IsPresentValue(cell)&&day2IsPresentValue(sRow[ci])?sRow[ci]:cell))
    })
  }
  return base
}
function day2ExtractProfileMetric(src,label,nextLabels){
  const sec=day2CognitiveSection(src,label,nextLabels)
  if(!sec||!/Profile\s+Baseline\s+Details/i.test(sec))return null
  const s=sec.replace(/[–—]/g,'-')
  const bm=s.match(/Profile\s+Baseline\s+Details[\s\S]{0,400}?\bBaseline\s*[:.]?\s*(-?\d+(?:\.\d+)?(?:\s*(?:ms|seconds|second|cm))?)/i)
  if(!bm)return null
  const avg=day2FormatOneDecimal(bm[1])
  if(!avg)return null
  const rm=s.match(/Profile\s+Baseline\s+Details[\s\S]{0,400}?\bRange\s*[:.]?\s*([0-9][^\n]*)/i)
  const range=rm?day2NormRangeDash(rm[1].replace(/\s*(?:Score|Percentile|Baseline|Rank|Test\s*\d|Count|Cognitive|Device|Survey)\b.*/i,'').replace(/\s+/g,' ').replace(/\s*-\s*/g,' - ').trim()):''
  const pm=s.match(/Profile\s+Baseline\s+Details[\s\S]{0,500}?\bPercentile\s*[:.]?\s*([\d]+(?:\.\d+)?(?:st|nd|rd|th)?|-)/i)
  const percentile=pm?day2NormalizePercentileValue(pm[1]):''
  const rank=day2RankFromPercentile(percentile)
  return {avg,range,percentile,rank}
}
function mergeDay2Test1Files(files){
  const text=(files||[]).map(f=>day2SourceText(f)).filter(Boolean).join('\n\n')
  const parsed=mergeDay2Test1Parsed((files||[]).map(f=>day2ParseTest1(f)))
  if(parsed&&parsed.cognitiveRows){
    const combinedPageTexts=(files||[]).flatMap(f=>Array.isArray(f&&f.pageTexts)?f.pageTexts:[])
    const combinedSrc={text:text||(combinedPageTexts.join('\n')),pageTexts:combinedPageTexts.length?combinedPageTexts:undefined}
    if(day2NormResultText(day2SourceText(combinedSrc))||combinedPageTexts.length){
      const cognitiveDefs=[
        ['Memory','Memory (Cognitive)',['Reverse Number Counting']],
        ['Reverse Number Counting','Reverse Number Counting (Cognitive Thought)',['Cued Stroop']],
        ['Cued Stroop','Cued Stroop (Cognitive Thought)',['DEVICE','SUMMARY']],
        ['Reaction Time','Reaction Time (Cognitive Thought/ Cognitive Reaction Time)',['Impulse Control']],
        ['Impulse Control','Impulse Control (Cognitive Thought/ Cognitive Reaction Time)',['Memory']],
        ['Inspection Time','Inspection Time (Cognitive Reaction Time)',['Reaction Time']]
      ]
      parsed.cognitiveRows=parsed.cognitiveRows.map(row=>{
        const def=cognitiveDefs.find(([,outName])=>outName===row[0])
        if(!def)return row
        const [label,,nextLabels]=def
        const m=day2ExtractProfileMetric(combinedSrc,label,nextLabels)
        if(!m)return row
        const range=m.range||row[2]
        return [row[0],m.avg,(label==='Memory'||label==='Cued Stroop')?day2FormatMemoryCognitiveRange(range):range,m.percentile,m.rank,row[5]]
      })
    }
  }
  return {text,name:'merged-test1',merged:true,_parsed:parsed}
}
function day2PreviewTest1Html(file,partType,total){
  if(!day2NormResultText(day2SourceText(file))&&!file._parsed)return ''
  const r=day2ParseTest1(file)
  const cognitiveRows=(r.cognitiveRows||[]).map(row=>{
    if(!Array.isArray(row)||!(row[0]==='Memory (Cognitive)'||row[0]==='Cued Stroop (Cognitive Thought)'))return row
    const copy=row.slice()
    copy[2]=day2FormatMemoryCognitiveRange(copy[2])
    return copy
  })
  let h=day2PreviewKvGrid([['Date',r.date]].concat(r.symptomRows))
  h+=day2PreviewSubheading('Validated Symptom Questionnaire — Depression')
  h+=day2PreviewKvGrid([['PHQ-9 Depression Score',r.phqScore],['Progress Status',day2ProgressStatusForCategory(day2CurrentExamCategoryForPreview(),r.phqProgressStatus)]])
  h+=day2PreviewSubheading('Validated Symptom Questionnaire — Anxiety')
  h+=day2PreviewKvGrid([['GAD-7 General Anxiety Disorder Score',r.gadScore],['Progress Status',day2ProgressStatusForCategory(day2CurrentExamCategoryForPreview(),r.gadProgressStatus)]])
  h+=day2PreviewSubheading('mBESS')
  h+=day2PreviewKvGrid(r.mbessRows)
  h+=day2PreviewSubheading('VOMS')
  h+=day2PreviewTable(['Test','Headache','Dizziness','Nausea','Fogging','Total','Comments'],r.vomsRows)
  h+=day2PreviewSubheading('Neurocognitive Outcomes Testing')
  h+=day2PreviewTable(['Measure','Baseline Average','Range','Percentile','Rank','Baseline Count'],cognitiveRows)
  let title='VESTIBULAR AND NEUROCOGNITIVE TESTING'
  if(partType&&(total>1||partType!=='Complete'))title+=' — '+partType
  return day2PreviewSection(title,h)
}
function day2Test2Text(source){
  if(source&&typeof source==='object')return String(source.text||'')
  return String(source||'')
}
function day2Test2Lines(source){
  return day2NormResultText(day2Test2Text(source)).split('\n').map(l=>day2CleanExtractedValue(l)).filter(Boolean)
}
function day2Test2Flat(source){return day2FlatResultText(day2Test2Text(source)).replace(/[–—]/g,'-')}
function day2Test2Section(source,startLabels,endLabels){
  const flat=day2Test2Flat(source)
  const lower=flat.toLowerCase()
  let start=-1, used=''
  ;(Array.isArray(startLabels)?startLabels:[startLabels]).forEach(label=>{
    if(start>=0)return
    const idx=lower.indexOf(String(label).toLowerCase())
    if(idx>=0){start=idx;used=String(label)}
  })
  if(start<0)return ''
  let end=flat.length
  ;(endLabels||[]).forEach(label=>{
    const idx=lower.indexOf(String(label).toLowerCase(),start+used.length)
    if(idx>=0&&idx<end)end=idx
  })
  return flat.slice(start,end).trim()
}
function day2Test2CleanValue(value){
  return day2CleanExtractedValue(value)
    .replace(/^[:?\-]+\s*/,'')
    .replace(/\s+/g,' ')
    .trim()
}
function day2Test2Field(source,label,sectionText,nextLabels){
  const text=sectionText&&String(sectionText).trim().length>30?sectionText:day2Test2Text(source)
  const lines=day2NormResultText(text).split('\n').map(l=>day2CleanExtractedValue(l)).filter(Boolean)
  const labelPattern=day2EscapeRegExp(label).replace(/\\ /g,'\\s+')
  const nextPattern=(nextLabels||[]).map(v=>day2EscapeRegExp(v).replace(/\\ /g,'\\s+')).join('|')
  function clipAtNext(value){
    let out=String(value||'')
    if(nextPattern){
      const reNext=new RegExp('\\s+(?:'+nextPattern+')\\??\\s*:?','i')
      const m=out.match(reNext)
      if(m)out=out.slice(0,m.index)
    }
    return day2Test2CleanValue(out)
  }
  for(let i=0;i<lines.length;i++){
    const line=lines[i]
    const reLine=new RegExp('(?:^|\\s)'+labelPattern+'\\??\\s*:?\\s*([\\s\\S]*)$','i')
    const m=line.match(reLine)
    if(!m)continue
    const val=clipAtNext(m[1])
    if(day2IsPresentValue(val))return val
    for(let j=i+1;j<Math.min(lines.length,i+4);j++){
      const candidate=clipAtNext(lines[j])
      if(!candidate)continue
      const looksLikeNext=(nextLabels||[]).some(n=>new RegExp('^'+day2EscapeRegExp(n).replace(/\\ /g,'\\s+')+'\\??\\s*:?','i').test(candidate))
      if(looksLikeNext)break
      return candidate
    }
  }
  const flat=day2FlatResultText(text)
  const re=new RegExp(day2EscapeRegExp(label).replace(/\\ /g,'\\s+')+'\\??\\s*:?\\s*([\\s\\S]*?)'+(nextPattern?'(?=\\s+(?:'+nextPattern+')\\??\\s*:?|$)':'$'),'i')
  const m=flat.match(re)
  return m?clipAtNext(m[1]):''
}
function day2Test2FormatDuration(value){
  const raw=day2Test2CleanValue(value)
  const m=raw.match(/(-?\d+(?:\.\d+)?)\s*(?:sec|second|seconds)\b/i)
  if(m){
    const n=m[1]
    return n+' '+(Number(n)===1?'second':'seconds')
  }
  return raw
}
function day2Test2FormatNormativeRange(value,unit){
  const raw=day2Test2CleanValue(value).replace(/[–—]/g,'-')
  const m=raw.match(/(-?\d+(?:\.\d+)?)(?:\s*(mm\/sec|mm|sec|seconds))?\s*(?:-|\/)\s*(-?\d+(?:\.\d+)?)(?:\s*(mm\/sec|mm|sec|seconds))?/i)
  if(!m)return raw
  const u=(m[4]||m[2]||unit||'').replace(/seconds/i,'sec')
  return m[1]+' / '+m[3]+(u?' '+u:'')
}
function day2Test2FormatMeasurement(value,unit){
  const raw=day2Test2CleanValue(value)
  const m=raw.match(/-?\d+(?:\.\d+)?(?:\s*(mm\/sec|mm|sec|seconds))?/i)
  if(!m)return ''
  let out=m[0].replace(/\s+/g,' ').trim().replace(/seconds/i,'sec')
  if(unit&&!/(mm\/sec|mm|sec)\b/i.test(out))out+=' '+unit
  return out
}
function day2Test2MetricRow(section,label,unit){
  const labelAliases={
    'Avg. Constriction Speed':['Avg. Constriction Speed','Avg Constriction Speed','Average Constriction Speed'],
    'Constriction Time':['Constriction Time'],
    'Max. Constriction Speed':['Max. Constriction Speed','Max Constriction Speed','Maximum Constriction Speed'],
    'Release Amplitude':['Release Amplitude'],
    'Amplitude':['Amplitude'],
    'Avg. Diameter':['Avg. Diameter','Avg Diameter','Average Diameter'],
    'Latency':['Latency'],
    'Max. Diameter':['Max. Diameter','Max Diameter','Maximum Diameter'],
    'Min. Diameter':['Min. Diameter','Min Diameter','Minimum Diameter'],
    'Minimum Diameter':['Min. Diameter','Min Diameter','Minimum Diameter']
  }
  const allLabels=['Avg. Constriction Speed','Average Constriction Speed','Constriction Time','Max. Constriction Speed','Maximum Constriction Speed','Release Amplitude','Amplitude','Avg. Diameter','Average Diameter','Latency','Max. Diameter','Maximum Diameter','Min. Diameter','Minimum Diameter']
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function labelOnly(line){
    return String(line||'')
      .replace(/-?\d+(?:\.\d+)?/g,' ')
      .replace(/\b(mm\/sec|mm|sec|seconds|second)\b/ig,' ')
      .replace(/[\-\/]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
  }
  function targetsFor(lbl){return (labelAliases[lbl]||[lbl]).map(norm).filter(Boolean)}
  function matchesLabel(n,targets,lbl){
    if(!n)return false
    if(lbl==='Amplitude')return n==='amplitude'
    return targets.some(t=>n===t||n.startsWith(t)||n.includes(t))
  }
  function rowValuesFromChunk(chunk){
    chunk=day2Test2CleanValue(chunk).replace(/[–—]/g,'-')
    const rangeMatch=chunk.match(/(-?\d+(?:\.\d+)?)\s*(?:-|\/)\s*(-?\d+(?:\.\d+)?)(?:\s*(mm\/sec|mm|sec|seconds))?/i)
    let beforeRange=chunk
    let normative=''
    if(rangeMatch){
      beforeRange=chunk.slice(0,rangeMatch.index).trim()
      normative=day2Test2FormatNormativeRange(rangeMatch[0],unit)
    }
    const values=[]
    let vm
    const valRe=/-?\d+(?:\.\d+)?(?:\s*(?:mm\/sec|mm|sec|seconds))?/ig
    while((vm=valRe.exec(beforeRange))!==null){
      const formatted=day2Test2FormatMeasurement(vm[0],unit)
      if(formatted)values.push(formatted)
    }
    if(!normative){
      const all=[]
      valRe.lastIndex=0
      while((vm=valRe.exec(chunk))!==null){
        const formatted=day2Test2FormatMeasurement(vm[0],unit)
        if(formatted)all.push(formatted)
      }
      if(all.length>=4){
        values.splice(0,values.length,...all.slice(0,2))
        normative=day2Test2FormatNormativeRange(all[2]+' - '+all[3],unit)
      }else if(all.length===3){
        values.splice(0,values.length,all[0])
        normative=day2Test2FormatNormativeRange(all[1]+' - '+all[2],unit)
      }else{
        values.splice(0,values.length,...all.slice(0,2))
      }
    }
    return [label,values[0]||'',values[1]||'',normative||'']
  }
  const rawLines=day2NormResultText(section).split('\n').map(l=>day2Test2CleanValue(l)).filter(Boolean)
  const targets=targetsFor(label)
  const rowStarts=[]
  for(let i=0;i<rawLines.length;i++){
    const firstPart=norm(labelOnly(rawLines[i]))
    if(firstPart&&!targets.some(t=>t.startsWith(firstPart)||firstPart.startsWith(t)))continue
    let combined=''
    for(let span=0;span<4&&i+span<rawLines.length;span++){
      const part=labelOnly(rawLines[i+span])
      if(part)combined+=' '+part
      const n=norm(combined)
      if(matchesLabel(n,targets,label)){rowStarts.push({index:i,label});break}
    }
  }
  const allStarts=[]
  for(const lbl of allLabels){
    const ts=targetsFor(lbl)
    for(let i=0;i<rawLines.length;i++){
      const firstPart=norm(labelOnly(rawLines[i]))
      if(firstPart&&!ts.some(t=>t.startsWith(firstPart)||firstPart.startsWith(t)))continue
      let combined=''
      for(let span=0;span<4&&i+span<rawLines.length;span++){
        const part=labelOnly(rawLines[i+span])
        if(part)combined+=' '+part
        const n=norm(combined)
        if(matchesLabel(n,ts,lbl)){allStarts.push({index:i,label:lbl});span=99;break}
      }
    }
  }
  if(rowStarts.length){
    const start=rowStarts[0].index
    const next=allStarts.filter(s=>s.index>start).sort((a,b)=>a.index-b.index)[0]
    const end=next?next.index:rawLines.length
    const chunk=rawLines.slice(start,end).join(' ')
    return rowValuesFromChunk(chunk)
  }
  const flat=String(section||'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()
  function startPatternFor(lbl){
    if(lbl==='Avg. Constriction Speed'||lbl==='Avg. Diameter')return '(?:Avg\\.?|Average)'
    if(lbl==='Max. Constriction Speed'||lbl==='Max. Diameter')return '(?:Max\\.?|Maximum)'
    if(lbl==='Min. Diameter'||lbl==='Minimum Diameter')return '(?:Min\\.?|Minimum)'
    if(lbl==='Release Amplitude')return 'Release'
    if(lbl==='Constriction Time')return 'Constriction\\s+Time'
    return day2EscapeRegExp(lbl).replace(/\\ /g,'\\s+').replace('Avg\\.','Avg\\.?').replace('Max\\.','Max\\.?')
  }
  const startPattern=startPatternFor(label)
  const nextLabels=allLabels.filter(x=>!(labelAliases[label]||[label]).some(a=>String(a).toLowerCase()===String(x).toLowerCase()))
  const nextPattern=nextLabels.map(startPatternFor).join('|')
  const re=new RegExp('(?:^|\\s)'+startPattern+'\\s+([\\s\\S]*?)(?=\\s+(?:'+nextPattern+')\\s+|$)','i')
  const m=flat.match(re)
  return m?rowValuesFromChunk(m[1]):[label,'','','']
}

function day2Test2RowsFromText(section,rowDefs){
  const source=String(section||'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()
  if(!source)return null
  const out={}
  function targetPatterns(def){
    const vals=[]
    function add(v){if(v&&!vals.includes(v))vals.push(v)}
    add(def.label);add(def.match)
    ;(def.matches||[]).forEach(add)
    if(/Avg\.?\s+Constriction\s+Speed/i.test(def.label)){add('Average Constriction Speed');add('Avg Constriction Speed')}
    if(/Max\.?\s+Constriction\s+Speed/i.test(def.label)){add('Maximum Constriction Speed');add('Max Constriction Speed')}
    return vals.map(v=>day2EscapeRegExp(v).replace(/\\ /g,'\\s+').replace(/Avg\\\./g,'Avg\\.?').replace(/Max\\\./g,'Max\\.?').replace(/Minimum/g,'(?:Min\\.?|Minimum)'))
  }
  const allNext=rowDefs.map(def=>targetPatterns(def).join('|')).join('|')
  rowDefs.forEach(def=>{
    if(out[def.label])return
    const alias=targetPatterns(def).join('|')
    const next=rowDefs.filter(d=>d.label!==def.label).map(d=>targetPatterns(d).join('|')).join('|')
    const re=new RegExp('(?:'+alias+')\\s+([\\s\\S]*?)(?='+(next?'\\s+(?:'+next+')\\s+':'$')+'|$)','i')
    const m=source.match(re)
    if(!m)return
    const chunk=day2Test2CleanValue(m[1])
    const tokens=[]
    let tm
    const tokenRe=/-?\d+(?:\.\d+)?(?:\s*(?:mm\/sec|mm|sec|seconds))?/ig
    while((tm=tokenRe.exec(chunk))!==null){
      const val=day2Test2FormatMeasurement(tm[0],def.unit)
      if(val)tokens.push(val)
    }
    if(!tokens.length)return
    let normative=''
    const rangeMatch=chunk.match(/(-?\d+(?:\.\d+)?)\s*(?:-|\/)\s*(-?\d+(?:\.\d+)?)(?:\s*(mm\/sec|mm|sec|seconds))?/i)
    if(rangeMatch)normative=day2Test2FormatNormativeRange(rangeMatch[0],def.unit)
    // If the normative range is extracted as two numbers without a dash, do not
    // treat the first normative value as a missing eye result.
    let valueSource=chunk
    if(rangeMatch)valueSource=chunk.slice(0,rangeMatch.index).trim()
    const valueTokens=[]
    let vm2
    const valueTokenRe=/-?\d+(?:\.\d+)?(?:\s*(?:mm\/sec|mm|sec|seconds))?/ig
    while((vm2=valueTokenRe.exec(valueSource))!==null){
      const val=day2Test2FormatMeasurement(vm2[0],def.unit)
      if(val)valueTokens.push(val)
    }
    if(!rangeMatch){
      if(!normative&&tokens.length>=4)normative=day2Test2FormatNormativeRange(tokens[2]+' - '+tokens[3],def.unit)
      if(tokens.length>=4){valueTokens.splice(0,valueTokens.length,...tokens.slice(0,2))}
      else if(tokens.length===3){
        valueTokens.splice(0,valueTokens.length,tokens[0])
        if(!normative)normative=day2Test2FormatNormativeRange(tokens[1]+' - '+tokens[2],def.unit)
      }
    }
    out[def.label]=[def.label,valueTokens[0]||'',valueTokens[1]||'',normative||'']
  })
  return Object.keys(out).length?out:null
}
function day2Test2MergeRows(primary,fallback,rowDefs){
  const out={}
  ;(rowDefs||[]).forEach(def=>{
    const a=primary&&primary[def.label]
    const b=fallback&&fallback[def.label]
    if(a&&b){
      out[def.label]=[def.label,
        day2IsPresentValue(a[1])&&a[1]!=='—'?a[1]:b[1],
        day2IsPresentValue(a[2])&&a[2]!=='—'?a[2]:b[2],
        day2IsPresentValue(a[3])&&a[3]!=='—'?a[3]:b[3]
      ]
    }else if(a){out[def.label]=a}else if(b){out[def.label]=b}
  })
  return Object.keys(out).length?out:null
}
function day2Test2RowsFromPageItems(source,tableTitle,rowDefs){
  if(!source||typeof source!=='object'||!Array.isArray(source.pageItems))return null
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function cx(it){return (Number(it.x)||0)+(Number(it.width)||0)/2}
  function groupLines(items,tol){
    const rows=[]
    ;(items||[]).forEach(it=>{
      if(!String(it.text||'').trim())return
      let row=rows.find(r=>Math.abs(r.y-it.y)<(tol||4))
      if(!row){row={y:it.y,items:[]};rows.push(row)}
      row.items.push(it)
    })
    rows.sort((a,b)=>a.y-b.y)
    return rows.map(row=>{
      row.items.sort((a,b)=>a.x-b.x)
      return {y:row.items.reduce((sum,it)=>sum+it.y,0)/row.items.length,items:row.items,text:row.items.map(it=>it.text).join(' ')}
    }).filter(row=>String(row.text||'').trim())
  }
  function cleanCell(text,unit,isNorm){
    let raw=day2Test2CleanValue(text).replace(/\s+/g,' ')
    if(!raw)return ''
    raw=raw.replace(/\bred values indicate outside normative range\b/ig,'').replace(/^[-–—]+\s*/,'').trim()
    if(!raw)return ''
    if(isNorm)return day2Test2FormatNormativeRange(raw,unit)
    return day2Test2FormatMeasurement(raw,unit)||''
  }
  function addTargets(def){
    const vals=[]
    function add(v){if(v&&!vals.includes(v))vals.push(v)}
    add(def.label);add(def.match)
    ;(def.matches||[]).forEach(add)
    if(/Avg\.?\s+Constriction\s+Speed/i.test(def.label)){add('Average Constriction Speed');add('Avg Constriction Speed')}
    if(/Max\.?\s+Constriction\s+Speed/i.test(def.label)){add('Maximum Constriction Speed');add('Max Constriction Speed')}
    if(/Avg\.?\s+Diameter/i.test(def.label)){add('Average Diameter');add('Avg Diameter')}
    if(/Max\.?\s+Diameter/i.test(def.label)){add('Maximum Diameter');add('Max Diameter')}
    if(/Min\.?\s+Diameter/i.test(def.label)){add('Minimum Diameter');add('Min Diameter')}
    return vals.map(norm).filter(Boolean)
  }
  function metricMatches(n,targets,def){
    if(!n)return false
    if(def.label==='Amplitude')return n==='amplitude'
    return targets.some(t=>n===t||n.startsWith(t)||n.includes(t))
  }
  function findTableTitle(lines,titleNeedle){
    for(let i=0;i<lines.length;i++){
      let combined=''
      for(let span=0;span<5&&i+span<lines.length;span++){
        combined+=' '+lines[i+span].text
        const n=norm(combined)
        if(n.includes(titleNeedle))return {y:lines[i].y,endY:lines[i+span].y,text:combined,index:i}
        if(/constrict/i.test(tableTitle)&&n.includes('constrict')&&n.includes('results'))return {y:lines[i].y,endY:lines[i+span].y,text:combined,index:i}
      }
    }
    return null
  }
  function findHeaderFromLines(lines,page,title){
    const candidates=lines.filter(l=>l.y>title.y&&l.y<title.y+150)
    function itemSpanFor(needle){
      const target=norm(needle)
      for(const line of candidates){
        for(let i=0;i<line.items.length;i++){
          let combined=''
          for(let span=0;span<4&&i+span<line.items.length;span++){
            combined+=' '+line.items[i+span].text
            if(norm(combined).includes(target)){
              const items=line.items.slice(i,i+span+1)
              return {x:items.reduce((sum,it)=>sum+cx(it),0)/items.length,y:line.y,text:combined,items:items}
            }
          }
        }
      }
      return null
    }
    const metric=itemSpanFor('Metric')
    const right=itemSpanFor('Right Eye')
    const left=itemSpanFor('Left Eye')
    const normative=itemSpanFor('Normative Data')
    if(!normative||(!right&&!left))return null
    const anchorY=(right||left).y
    const fallbackX=Math.min(...page.map(it=>cx(it)))
    return {metric:metric||{x:fallbackX,y:anchorY},right:right||null,left:left||null,normative,y:Math.max(anchorY,normative.y,metric?metric.y:anchorY)}
  }
  function findTableEnd(lines,header,titleNeedle){
    const sectionNeedles=['detection','constrictresults','dilationresults','otherresults','reflexplranalyzer','producedwithreflex']
    let end=Infinity
    for(const line of lines){
      if(line.y<=header.y+3)continue
      const n=norm(line.text)
      if(!n)continue
      if(n.includes(titleNeedle))continue
      if(sectionNeedles.some(s=>n.includes(s))){end=line.y-5;break}
    }
    return Number.isFinite(end)?end:header.y+700
  }
  const titleNeedle=norm(tableTitle)
  const out={}
  for(let pg=0;pg<source.pageItems.length;pg++){
    const page=(source.pageItems[pg]||[]).map(it=>({x:Number(it.x)||0,y:Number(it.y)||0,width:Number(it.width)||0,height:Number(it.height)||0,text:String(it.text||'')}))
    if(!page.length)continue
    const lines=groupLines(page,5)
    const title=findTableTitle(lines,titleNeedle)
    if(!title)continue
    const header=findHeaderFromLines(lines,page,title)
    if(!header)continue
    const metricC=header.metric.x
    const rightC=header.right?header.right.x:null
    const leftC=header.left?header.left.x:null
    const normC=header.normative.x
    const minX=Math.min(...page.map(it=>Number(it.x)||0))
    const maxX=Math.max(...page.map(it=>(Number(it.x)||0)+(Number(it.width)||0)))
    const metricBoundL=Math.max(0,minX-8)
    const eyeAnchorC=rightC!==null?rightC:leftC
    const metricBoundR=(metricC+eyeAnchorC)/2
    const tableEnd=findTableEnd(lines,header,titleNeedle)
    const dataLines=lines.filter(l=>l.y>header.y+3&&l.y<tableEnd)
    function metricLineText(line){return line.items.filter(it=>cx(it)>=metricBoundL&&cx(it)<metricBoundR).map(it=>it.text).join(' ')}
    const labels=[]
    rowDefs.forEach(def=>{
      const targets=addTargets(def)
      for(let i=0;i<dataLines.length;i++){
        const firstPart=norm(metricLineText(dataLines[i]))
        if(firstPart&&!targets.some(t=>t.startsWith(firstPart)||firstPart.startsWith(t)))continue
        let combined=''
        let endIdx=i
        for(let span=0;span<4&&i+span<dataLines.length;span++){
          const part=metricLineText(dataLines[i+span])
          if(part)combined+=' '+part
          const n=norm(combined)
          if(metricMatches(n,targets,def)){
            endIdx=i+span
            labels.push({def,firstY:dataLines[i].y,lastY:dataLines[endIdx].y,index:i})
            return
          }
        }
      }
    })
    labels.sort((a,b)=>a.firstY-b.firstY)
    const unique=[]
    labels.forEach(l=>{if(!unique.some(u=>u.def.label===l.def.label))unique.push(l)})
    unique.forEach((label,idx)=>{
      if(out[label.def.label])return
      const next=unique.find((u,j)=>j>idx&&u.firstY>label.firstY)
      const top=Math.max(header.y+2,label.firstY-5)
      const bottom=Math.min(next?next.firstY-5:tableEnd,tableEnd)
      function colText(x1,x2){
        const items=page.filter(it=>{
          const x=cx(it)
          return x>=x1&&x<x2&&it.y>=top&&it.y<bottom
        }).sort((a,b)=>a.y-b.y||a.x-b.x)
        return items.map(it=>it.text).join(' ')
      }
      if(rightC!==null&&leftC!==null){
        const rL=(rightC+leftC)/2, lN=(leftC+normC)/2
        const rv=cleanCell(colText(metricBoundR,rL),label.def.unit,false)
        const lv=cleanCell(colText(rL,lN),label.def.unit,false)
        const nv=cleanCell(colText(lN,maxX+24),label.def.unit,true)
        if(rv||lv||nv)out[label.def.label]=[label.def.label,rv||'',lv||'',nv||'']
      } else if(leftC!==null){
        const lN=(leftC+normC)/2
        const lv=cleanCell(colText(metricBoundL,lN),label.def.unit,false)
        const nv=cleanCell(colText(lN,maxX+24),label.def.unit,true)
        if(lv||nv)out[label.def.label]=[label.def.label,'',lv||'',nv||'']
      } else if(rightC!==null){
        const rN=(rightC+normC)/2
        const rv=cleanCell(colText(metricBoundL,rN),label.def.unit,false)
        const nv=cleanCell(colText(rN,maxX+24),label.def.unit,true)
        if(rv||nv)out[label.def.label]=[label.def.label,rv||'','',nv||'']
      }
    })
  }
  return Object.keys(out).length?out:null
}

function day2Test2RegistrationInfo(context){
  const p=(context&&context.patient)||getPatient(selectedPatientId)
  const d=p&&p.demographics?p.demographics:{}
  const name=p?((p.ace&&p.ace.patientName)||(((p.demographics&&p.demographics.firstName||'')+' '+(p.demographics&&p.demographics.lastName||'')).trim())||''):''
  function parseDate(v){
    const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if(!m)return null
    let y=Number(m[3]); if(y<100)y+=(y>40?1900:2000)
    return new Date(y,Number(m[1])-1,Number(m[2]))
  }
  function ageFromDob(dob,ref){
    const b=parseDate(dob); if(!b)return ''
    const r=parseDate(ref)||new Date()
    let age=r.getFullYear()-b.getFullYear()
    const before=(r.getMonth()<b.getMonth())||(r.getMonth()===b.getMonth()&&r.getDate()<b.getDate())
    if(before)age--
    return Number.isFinite(age)?String(age):''
  }
  const aceState=p&&p.ace&&p.ace.formState?p.ace.formState:{inputs:{}}
  const age=(aceState.inputs&&aceState.inputs.ptAge)||ageFromDob(d.dob,(context&&context.testDate)||'')
  const g=String(d.gender||'').trim()
  const sex=/^male$/i.test(g)?'M':(/^female$/i.test(g)?'F':g)
  return {name:name,age:age,sex:sex}
}
function day2ParseTest2(source,context){
  const text=day2Test2Text(source)
  const patientInfo=day2Test2Section(text,'Patient Information',['Test Information','Pupillogram','Analysis'])
  const testInfo=day2Test2Section(text,'Test Information',['Pupillogram','Analysis'])
  const patientInfoSource=patientInfo&&patientInfo.length>40?patientInfo:text
  const testInfoSource=testInfo&&testInfo.length>40?testInfo:text
  const analysis=day2Test2Section(text,'Analysis',['Reflex - PLR','Detection','Produced with Reflex'])
  const constrict=day2Test2Section(text,'Constrict Results',['Dilation Results','Other Results','Reflex - PLR'])
  const dilation=day2Test2Section(text,'Dilation Results',['Other Results','Reflex - PLR'])
  const other=day2Test2Section(text,'Other Results',['Reflex - PLR','Produced with Reflex'])
  const testDateTime=day2Test2Field(text,'Test Date & Time',testInfoSource,['Test Administrator','Name','Age','Sex','Test Type'])
  const testDate=day2FormatAnyDate(testDateTime)||day2ParseDateAny(text)
  const reg=day2Test2RegistrationInfo({patient:(context&&context.patient)||getPatient(selectedPatientId),testDate:testDate})
  const eyeLocation=day2Test2Field(text,'Eye Location',patientInfoSource,['Flash Status','Concussion Date','Asymptomatic','Video Duration'])
  const asymptomatic=day2Test2Field(text,'Asymptomatic',patientInfoSource,['Pulse Duration','Test Information','Concussion Date','Ambient Adapt Brightness Level'])
  const administrator=getDay2AceProviderValue((context&&context.patient)||getPatient(selectedPatientId))||day2Test2Field(text,'Test Administrator',testInfoSource,['Test Type','Pulse Level','Age','Sex'])
  const reflexScore=day2Test2Field(text,'Cognitive Age',analysis,['Neuro CDS Score','Reflex - PLR'])
  const neuro=day2Test2Field(text,'Neuro CDS Score',analysis,['Reflex - PLR'])
  const neuroScore=neuro.match(/R\s*[:.]?\s*[^\s]+\s+L\s*[:.]?\s*[^\s]+/i)?neuro.replace(/\s+/g,' '):neuro
  const constrictRows=day2Test2RowsFromPageItems(source,'Constrict Results',[
    {label:'Avg. Constriction Speed',match:'Avg Constriction Speed',unit:'mm/sec'},
    {label:'Constriction Time',match:'Constriction Time',unit:'sec'},
    {label:'Max. Constriction Speed',match:'Max Constriction Speed',unit:'mm/sec'}
  ])
  const dilationRows=day2Test2RowsFromPageItems(source,'Dilation Results',[
    {label:'Release Amplitude',match:'Release Amplitude',unit:'mm'}
  ])
  const otherRows=day2Test2RowsFromPageItems(source,'Other Results',[
    {label:'Amplitude',match:'Amplitude',unit:'mm'},
    {label:'Avg. Diameter',match:'Avg Diameter',unit:'mm'},
    {label:'Latency',match:'Latency',unit:'sec'},
    {label:'Max. Diameter',match:'Max Diameter',unit:'mm'},
    {label:'Min. Diameter',match:'Min Diameter',unit:'mm'}
  ])
  const r={
    date:testDate,
    name:reg.name||'—',
    age:reg.age||'—',
    sex:reg.sex||'—',
    eyeLocation:eyeLocation||'—',
    asymptomatic:asymptomatic||'—',
    administrator:administrator||'—',
    testType:day2Test2Field(text,'Test Type',testInfoSource,['Pulse Level','Flash Status','Sex','Eye Location'])||'—',
    pulseLevel:day2Test2Field(text,'Pulse Level',testInfoSource,['Flash Status','Video Duration','Eye Location','Concussion Date'])||'—',
    flashStatus:day2Test2Field(text,'Flash Status',testInfoSource,['Concussion Date','Video Duration','Pulse Duration','Asymptomatic'])||'—',
    videoDuration:day2Test2FormatDuration(day2Test2Field(text,'Video Duration',testInfoSource,['Pulse Duration','Ambient Adapt Brightness Level','Illumination Delay','Asymptomatic']))||'—',
    illuminationDelay:day2Test2FormatDuration(day2Test2Field(text,'Illumination Delay',testInfoSource,['Pupillogram','Analysis']))||'—',
    reflexScore:reflexScore||'—',
    neuroCdsScore:neuroScore||'—',
    constrict:constrictRows?[constrictRows['Avg. Constriction Speed']||['Avg. Constriction Speed','','',''],constrictRows['Constriction Time']||['Constriction Time','','',''],constrictRows['Max. Constriction Speed']||['Max. Constriction Speed','','','']]:[
      day2Test2MetricRow(constrict,'Avg. Constriction Speed','mm/sec'),
      day2Test2MetricRow(constrict,'Constriction Time','sec'),
      day2Test2MetricRow(constrict,'Max. Constriction Speed','mm/sec')
    ],
    dilation:dilationRows?[dilationRows['Release Amplitude']||['Release Amplitude','','','']]:[day2Test2MetricRow(dilation,'Release Amplitude','mm')],
    other:otherRows?[
      otherRows['Amplitude']||['Amplitude','','',''],
      otherRows['Avg. Diameter']||['Avg. Diameter','','',''],
      otherRows['Latency']||['Latency','','',''],
      otherRows['Max. Diameter']||['Max. Diameter','','',''],
      otherRows['Min. Diameter']||['Min. Diameter','','','']
    ]:[
      day2Test2MetricRow(other,'Amplitude','mm'),
      day2Test2MetricRow(other,'Avg. Diameter','mm'),
      day2Test2MetricRow(other,'Latency','sec'),
      day2Test2MetricRow(other,'Max. Diameter','mm'),
      day2Test2MetricRow(other,'Min. Diameter','mm')
    ]
  }
  function fixSingleEyeRows(rows,section,labelDefs){
    const pdfEye=String(eyeLocation||'').toLowerCase()
    const leftOnly=/left/i.test(pdfEye)&&!/right/i.test(pdfEye)&&!/both/i.test(pdfEye)
    const rightOnly=/right/i.test(pdfEye)&&!/left/i.test(pdfEye)&&!/both/i.test(pdfEye)
    if(!leftOnly&&!rightOnly)return rows
    return(rows||[]).map(row=>{
      if(!Array.isArray(row)||row.length<4)return row
      if(leftOnly&&day2IsPresentValue(row[2]))return row
      if(rightOnly&&day2IsPresentValue(row[1]))return row
      if(leftOnly&&day2IsPresentValue(row[1]))return[row[0],'',row[1],row[3]]
      if(rightOnly&&day2IsPresentValue(row[2]))return[row[0],row[2],'',row[3]]
      const def=(labelDefs||[]).find(d=>d.label===row[0])
      if(!def)return row
      const fb=day2Test2MetricRow(section,def.label,def.unit)
      const val=fb?(fb[1]||fb[2]||''):''
      const nrm=row[3]||(fb?fb[3]:'')||''
      if(!val)return row
      if(leftOnly)return[row[0],'',val,nrm]
      if(rightOnly)return[row[0],val,'',nrm]
      return row
    })
  }
  r.constrict=fixSingleEyeRows(r.constrict,constrict,[{label:'Avg. Constriction Speed',unit:'mm/sec'},{label:'Constriction Time',unit:'sec'},{label:'Max. Constriction Speed',unit:'mm/sec'}])
  r.dilation=fixSingleEyeRows(r.dilation,dilation,[{label:'Release Amplitude',unit:'mm'}])
  r.other=fixSingleEyeRows(r.other,other,[{label:'Amplitude',unit:'mm'},{label:'Avg. Diameter',unit:'mm'},{label:'Latency',unit:'sec'},{label:'Max. Diameter',unit:'mm'},{label:'Min. Diameter',unit:'mm'}])
  r.patientRows=[['Name',r.name],['Age',r.age],['Sex',r.sex],['Eye Location',r.eyeLocation],['Asymptomatic',r.asymptomatic]]
  r.testRows=[['Test Administrator',r.administrator],['Test Type',r.testType],['Pulse Level',r.pulseLevel],['Flash Status',r.flashStatus],['Video Duration',r.videoDuration],['Illumination Delay',r.illuminationDelay]]
  r.analysisRows=[['Cognitive Age',r.reflexScore],['Neuro CDS Score',r.neuroCdsScore]]
  return r
}
function day2Test2RowsWithValues(rows){
  return (rows||[]).filter(row=>{
    if(!Array.isArray(row))return false
    return day2IsPresentValue(row[1])||day2IsPresentValue(row[2])
  })
}
function day2Test2CleanRowsForOutput(rows){
  return day2Test2RowsWithValues(rows).map(row=>(row||[]).map((cell,i)=>i===0?cell:(day2IsPresentValue(cell)?cell:'')))
}
function day2ShouldMergeTest2(files){
  if(!files||files.length<2)return false
  const types=files.map(f=>String(day2Test2EyeLabel(f)).toLowerCase())
  const hasLeft=types.some(e=>/left/i.test(e)&&!/right/i.test(e))
  const hasRight=types.some(e=>/right/i.test(e)&&!/left/i.test(e))
  const hasBoth=types.some(e=>/both/i.test(e))
  return(hasLeft&&hasRight)||(hasLeft&&hasBoth)||(hasRight&&hasBoth)
}
function day2MergeTest2Rows(parsedList,field){
  const allRows=parsedList.map(r=>r[field]||[])
  const count=Math.max(...allRows.map(a=>a.length),0)
  const merged=[]
  for(let i=0;i<count;i++){
    const baseRow=allRows.map(a=>a[i]).find(Boolean)
    if(!baseRow)continue
    let right='',left='',norm=''
    allRows.forEach(rows=>{
      const row=rows[i]; if(!row)return
      right=right||(day2IsPresentValue(row[1])?row[1]:'')
      left=left||(day2IsPresentValue(row[2])?row[2]:'')
      norm=norm||(day2IsPresentValue(row[3])?row[3]:'')
    })
    merged.push([baseRow[0],right,left,norm])
  }
  return merged
}
function day2MergeTest2Results(files){
  const ctx={patient:getPatient(selectedPatientId)}
  const parsedList=files.map(f=>day2ParseTest2(f,ctx))
  function pick(field){
    for(const r of parsedList){if(day2IsPresentValue(r[field])&&r[field]!=='—')return r[field]}
    return parsedList[0][field]||'—'
  }
  const eyeLabels=[...new Set(files.map(f=>day2Test2EyeLabel(f)))]
  return{
    date:pick('date'),name:pick('name'),age:pick('age'),sex:pick('sex'),
    eyeLocation:'Both Eyes',asymptomatic:pick('asymptomatic'),
    administrator:pick('administrator'),testType:pick('testType'),
    pulseLevel:pick('pulseLevel'),flashStatus:pick('flashStatus'),
    videoDuration:pick('videoDuration'),illuminationDelay:pick('illuminationDelay'),
    reflexScore:pick('reflexScore'),neuroCdsScore:pick('neuroCdsScore'),
    constrict:day2MergeTest2Rows(parsedList,'constrict'),
    dilation:day2MergeTest2Rows(parsedList,'dilation'),
    other:day2MergeTest2Rows(parsedList,'other'),
    eyeDesc:eyeLabels.join(' + ')
  }
}
function day2PreviewMergedTest2Html(files){
  if(!files||!files.length)return ''
  const r=day2MergeTest2Results(files)
  r.patientRows=[['Name',r.name],['Age',r.age],['Sex',r.sex],['Eye Location',r.eyeLocation],['Asymptomatic',r.asymptomatic]]
  r.testRows=[['Test Administrator',r.administrator],['Test Type',r.testType],['Pulse Level',r.pulseLevel],['Flash Status',r.flashStatus],['Video Duration',r.videoDuration],['Illumination Delay',r.illuminationDelay]]
  r.analysisRows=[['Cognitive Age',r.reflexScore],['Neuro CDS Score',r.neuroCdsScore]]
  const mh=['Metric','Right Eye','Left Eye','Normative Range']
  let h=day2PreviewKvGrid([['Date of QP Exam',r.date],['PDF Eye Selection',r.eyeDesc]])
  h+=day2PreviewSubheading('Patient Information')+day2PreviewKvGrid(r.patientRows)
  h+=day2PreviewSubheading('Test Information')+day2PreviewKvGrid(r.testRows)
  h+=day2PreviewSubheading('Analysis')+(r.analysisRows.map(it=>day2PreviewLine(it[0],it[1])).filter(Boolean).join(''))
  h+=day2PreviewSubheading('Pupillary Constriction Results')+day2PreviewTable(mh,day2Test2CleanRowsForOutput(r.constrict))
  h+=day2PreviewSubheading('Dilation Results')+day2PreviewTable(mh,day2Test2CleanRowsForOutput(r.dilation))
  h+=day2PreviewSubheading('Other Results')+day2PreviewTable(mh,day2Test2CleanRowsForOutput(r.other))
  return day2PreviewSection('QUANTITATIVE PUPILLOMETRY RESULTS',h)
}
function day2PreviewTest2Html(file,index,total){
  if(!file||!day2NormResultText(file.text))return ''
  const r=day2ParseTest2(file,{patient:getPatient(selectedPatientId)})
  const eyeType=day2Test2EyeLabel(file)
  const pdfEyeLoc=String(r.eyeLocation||'').toLowerCase()
  const isRightOnly=(/right/i.test(pdfEyeLoc)&&!/both/i.test(pdfEyeLoc)&&!/left/i.test(pdfEyeLoc))||(/right/i.test(eyeType)&&!/both/i.test(eyeType)&&!/left/i.test(eyeType))
  const isLeftOnly=(/left/i.test(pdfEyeLoc)&&!/both/i.test(pdfEyeLoc)&&!/right/i.test(pdfEyeLoc))||(/left/i.test(eyeType)&&!/both/i.test(eyeType)&&!/right/i.test(eyeType))
  function adaptRows(rows){
    if(isRightOnly)return (rows||[]).map(r=>[r[0],r[1]||r[2]||'',r[3]])
    if(isLeftOnly)return (rows||[]).map(r=>[r[0],r[2]||r[1]||'',r[3]])
    return rows
  }
  const mh=isRightOnly?['Metric','Right Eye','Normative Range']:isLeftOnly?['Metric','Left Eye','Normative Range']:['Metric','Right Eye','Left Eye','Normative Range']
  let title='QUANTITATIVE PUPILLOMETRY RESULTS'
  if(total>1)title+=' — '+eyeType
  let h=day2PreviewKvGrid([['Date of QP Exam',r.date],['PDF Eye Selection',eyeType]])
  h+=day2PreviewSubheading('Patient Information')+day2PreviewKvGrid(r.patientRows)
  h+=day2PreviewSubheading('Test Information')+day2PreviewKvGrid(r.testRows)
  h+=day2PreviewSubheading('Analysis')+(r.analysisRows.map(it=>day2PreviewLine(it[0],it[1])).filter(Boolean).join(''))
  h+=day2PreviewSubheading('Pupillary Constriction Results')+day2PreviewTable(mh,adaptRows(day2Test2CleanRowsForOutput(r.constrict)))
  h+=day2PreviewSubheading('Dilation Results')+day2PreviewTable(mh,adaptRows(day2Test2CleanRowsForOutput(r.dilation)))
  h+=day2PreviewSubheading('Other Results')+day2PreviewTable(mh,adaptRows(day2Test2CleanRowsForOutput(r.other)))
  return day2PreviewSection(title,h)
}
function hasDay2EarSelection(results){
  const r=normalizeDay2EarResults(results)
  return !!(r.left||r.right||r.indication)
}
function day2PreviewTest3PdfHtml(file,index,total){
  if(!file||!day2NormResultText(file.text))return ''
  let title='AUDITORY SCREENING TEST FOR HEARING LOSS'
  if(total>1)title+=' — PDF '+(index+1)
  let h=day2PreviewSubheading('Description')+'<div class="day2-result-line">The patient is assessed using an online auditory screening test that yields one of three result choices: 1) Significant Hearing Loss; 2) Hearing loss; 3) Good hearing.</div>'
  h+=day2PreviewSubheading('Auditory Screening Test for Hearing Loss Validation Research')+'<div class="day2-result-line">https://www.shoebox.md/clinical-validation/</div>'
  return day2PreviewSection(title,h)
}
function day2PreviewTest3Html(results){
  const r=normalizeDay2EarResults(results)
  if(!hasDay2EarSelection(r))return ''
  const sessionDate=formatDay2Date(new Date())
  let h=day2PreviewKvGrid([['Date',sessionDate],['Left Ear',r.left||'—'],['Right Ear',r.right||'—'],['Indication',r.indication||'—']])
  return day2PreviewSection('AUDITORY SCREENING TEST FOR HEARING LOSS — RESULTS',h)
}
function updateDay2ResultStatus(){
  const uploads=normalizeDay2Uploads(day2ResultUploads)
  const t1=uploads.test1.filter(f=>f&&f.text).length
  const t2=uploads.test2.filter(f=>f&&f.text).length
  const t3Files=uploads.test3.filter(f=>f&&f.text).length
  const t3=t3Files || (hasDay2EarSelection(collectDay2Test3EarResults())?1:0)
  const total=t1+t2+t3
  const status=document.getElementById('day2ResultStatusTag')
  if(status)status.textContent=total+(total===1?' Result':' Results')
  const bar=document.getElementById('day2BarSources')
  if(bar)bar.textContent=String(total)
}
function renderDay2ResultsPreview(){
  const box=document.getElementById('day2ResultsPreview')
  if(!box)return
  const uploads=normalizeDay2Uploads(day2ResultUploads)
  const sections=[]
  const test1Files=sortedDay2Test1Files((uploads.test1||[]).filter(f=>f&&f.text))
  const test1Source=test1Files.length>1?mergeDay2Test1Files(test1Files):test1Files[0]
  if(test1Source)sections.push(day2PreviewTest1Html(test1Source,'Complete',1))
  const test2Files=(uploads.test2||[]).filter(f=>f&&f.text)
  if(day2ShouldMergeTest2(test2Files)){
    sections.push(day2PreviewMergedTest2Html(test2Files))
  }else{
    test2Files.forEach((f,i)=>sections.push(day2PreviewTest2Html(f,i,test2Files.length)))
  }
  const test3Files=(uploads.test3||[]).filter(f=>f&&f.text)
  test3Files.forEach((f,i)=>sections.push(day2PreviewTest3PdfHtml(f,i,test3Files.length)))
  sections.push(day2PreviewTest3Html(collectDay2Test3EarResults()))
  const html=sections.filter(Boolean).join('')
  box.innerHTML=html||'<div class="day2-result-empty">No results yet.</div>'
  updateDay2ResultStatus()
}

/* ---------- Day 2: Save and Day 2 Exam PDF ---------- */
function getInitialExamPatient(patientId){
  return getPatient(patientId)||getPatient(selectedPatientId)
}
function day2PdfSafe(v){
  if(v===null||v===undefined||v==='')return '—'
  return String(v).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()||'—'
}
function formatSavedDisplay(iso){
  if(!iso)return '—'
  try{return new Date(iso).toLocaleString()}catch(e){return iso}
}
function formatDay2Date(value){
  if(!value)return '—'
  const raw=String(value).trim()
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw))return raw
  const bare=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if(bare)return bare[2].padStart(2,'0')+'/'+bare[3].padStart(2,'0')+'/'+bare[1]
  const d=new Date(raw)
  if(isNaN(d.getTime()))return raw||'—'
  const mm=String(d.getMonth()+1).padStart(2,'0')
  const dd=String(d.getDate()).padStart(2,'0')
  return mm+'/'+dd+'/'+d.getFullYear()
}
function day2FormatAnyDate(value){
  if(value===null||value===undefined)return ''
  const raw=String(value).trim()
  if(!raw||/^[—–-]$/.test(raw))return ''
  const m=raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if(m){
    const mm=m[1].padStart(2,'0')
    const dd=m[2].padStart(2,'0')
    let yy=m[3]
    if(yy.length===2)yy=(parseInt(yy,10)>40?'19':'20')+yy
    return mm+'/'+dd+'/'+yy
  }
  return formatDay2Date(raw)
}
function day2IsPresentValue(value){
  if(value===null||value===undefined)return false
  const raw=String(value).replace(/[—–]/g,'-').replace(/\s+/g,' ').trim()
  return !!raw && raw!=='-' && raw.toLowerCase()!=='null' && raw.toLowerCase()!=='undefined' && raw!=='—'
}
function day2CleanExtractedValue(value){
  if(value===null||value===undefined)return ''
  return String(value)
    .replace(/[“”]/g,'"')
    .replace(/[’]/g,"'")
    .replace(/▲\s*0%/g,'')
    .replace(/\bChange\s*:?\s*$/i,'')
    .replace(/\s+/g,' ')
    .trim()
}
function day2FormatOneDecimal(value){
  const raw=day2CleanExtractedValue(value)
  if(!day2IsPresentValue(raw))return ''
  const m=raw.match(/-?\d+(?:\.\d+)?/)
  if(!m)return raw
  const unit=(raw.slice(m.index+m[0].length).match(/^[\s]*(ms|seconds|second|cm|%)/i)||[])[1]||''
  const n=Number(m[0])
  if(!Number.isFinite(n))return raw
  return n.toFixed(1)+(unit?' '+unit:'')
}
function day2RankFromPercentile(value){
  const raw=day2CleanExtractedValue(value)
  if(!day2IsPresentValue(raw))return ''
  const m=raw.match(/\d+(?:\.\d+)?/)
  if(!m)return ''
  const n=Number(m[0])
  if(!Number.isFinite(n))return ''
  if(n<10)return 'Very Low'
  if(n<25)return 'Low'
  if(n<50)return 'Low Average'
  if(n<75)return 'High Average'
  if(n<90)return 'High'
  return 'Very High'
}
function day2ExtractSwayTestDate(text){
  const m=String(text||'').match(/TEST\s*DATE\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  return m?day2FormatAnyDate(m[1]):''
}
function day2FindTest1CompleteUpload(uploads){
  const u=normalizeDay2Uploads(uploads||day2ResultUploads)
  return (u.test1||[]).find(f=>f&&f.text&&day2Test1PartLabel(f)==='Complete')||null
}
function getDay2Test1CompleteSessionDate(uploads){
  const file=day2FindTest1CompleteUpload(uploads)
  return file?day2ExtractSwayTestDate(file.text):''
}
function getDay2AceProviderValue(patient){
  const st=patient?.ace?.formState||{}
  const completed=(st.inputs&&st.inputs.completedBy)||document.getElementById('completedBy')?.value||''
  const cred=(st.selects&&st.selects.completedByCred)||document.getElementById('completedByCred')?.value||''
  if(String(completed||'').trim()){
    return String(completed).trim()+(String(cred||'').trim()?', '+String(cred).trim():'')
  }
  return getDay2ProviderValue(patient)
}
function getDay2AceDateOfService(patient){
  const st=patient?.ace?.formState||{}
  return day2FormatAnyDate(patient?.ace?.dateOfService || (st.inputs&&st.inputs.dos) || document.getElementById('dos')?.value || '')
}
function getDay2ProviderValue(patient){
  const aceState=patient?.ace?.formState||{}
  const aceCompleted=(aceState.inputs&&aceState.inputs.completedBy)||''
  const aceCred=(aceState.selects&&aceState.selects.completedByCred)||''
  if(String(aceCompleted||'').trim())return String(aceCompleted).trim()+(String(aceCred||'').trim()?', '+String(aceCred).trim():'')
  const savedProvider=patient?.initialExam?.provider
  if(savedProvider&&String(savedProvider).trim()&&String(savedProvider).trim()!=='—')return String(savedProvider).trim()
  const futureProviderField=document.getElementById('initialExamProvider')
  if(futureProviderField&&futureProviderField.value&&futureProviderField.value.trim())return futureProviderField.value.trim()
  const aceCompletedBy=document.getElementById('completedBy')
  const aceCredField=document.getElementById('completedByCred')
  if(aceCompletedBy&&aceCompletedBy.value&&aceCompletedBy.value.trim()){
    const cred=aceCredField?(aceCredField.value||''):''
    return aceCompletedBy.value.trim()+(cred&&String(cred).trim()?', '+String(cred).trim():'')
  }
  const providerNode=document.querySelector('[data-current-provider], [data-provider-name]')
  if(providerNode&&providerNode.textContent&&providerNode.textContent.trim())return providerNode.textContent.trim()
  return '—'
}
// Resolve provider for PDFs, treating saved ' - '/blank as "no value" so it falls back
// to the live "Completed By" field on the ACE form.
function day2ResolveProvider(data,p){
  const real=v=>{const s=String(v==null?'':v).trim();return (s&&s!=='—')?s:''}
  return real(data&&data.provider)||real(getDay2ProviderValue(p))||'—'
}
function updateExamPageLabels(){
  const cat=document.getElementById('examTypeSelect')?.value||'Day 2'
  const prefix=cat==='Final Examination'?'Final Exam':cat==='Re-Examination'?'Re-Exam':'Day 2 Exam'
  const lbl1=document.getElementById('examPdfSourcesLabel')
  const lbl2=document.getElementById('examResultsLabel')
  if(lbl1)lbl1.textContent=prefix+' Result PDF Sources'
  if(lbl2)lbl2.textContent=prefix+' Results'
  const dlBtn=document.getElementById('day2DownloadPdfBtn')
  if(dlBtn)dlBtn.textContent='⬇ Download '+prefix+' PDF'
}
function updateDay2ContextBar(){
  examPopulatePatientDropdown()
  const p=getPatient(selectedPatientId)
  const examSel=document.getElementById('examPatientSelect')
  if(examSel)examSel.value=p?p.id:''
  const el=document.getElementById('day2BarPatient')
  if(el)el.textContent=p?naturalPatientName(p):'—'
  const tag=document.getElementById('day2PatientTag')
  if(tag)tag.textContent=p?naturalPatientName(p):'No Patient Selected'
  updateExamPageLabels()
  updateDay2ResultStatus()
  renderDay2ResultsPreview()
  syncPatientExamEditorLocks(day2EditorMountedIn)
  updateDay2SaveButtonLabel()
}

let patientExamDetailState=null
let patientExamEditTitleOverride=''
let patientDocumentViewState=null
let patientDocumentsSearchQuery=''
function patientExamDetailLabel(patientId,arrayKey,index){
  if(arrayKey==='initialExam')return 'Day 2'
  if(arrayKey==='finalExam')return 'Final Examination'
  if(arrayKey==='reExams')return patientDetailOrdinalExamLabel(Number(index)||0)
  return 'Exam Details'
}
function getPatientExamDetailRecord(patientId,arrayKey,index){
  const p=getPatient(patientId)
  if(!p)return null
  if(arrayKey==='initialExam')return p.initialExam||null
  if(arrayKey==='finalExam')return p.finalExam||null
  if(arrayKey==='reExams')return Array.isArray(p.reExams)?(p.reExams[index]||null):null
  return null
}
function day2PreviewTest3HtmlForExam(results,examDate){
  const r=normalizeDay2EarResults(results)
  if(!hasDay2EarSelection(r))return ''
  const sessionDate=day2FormatAnyDate(examDate)||formatDay2Date(new Date())
  let h=day2PreviewKvGrid([['Date',sessionDate],['Left Ear',day2EarResultDisplay(r.left)],['Right Ear',day2EarResultDisplay(r.right)],['Indication',r.indication||'—']])
  return day2PreviewSection('AUDITORY SCREENING TEST FOR HEARING LOSS — RESULTS',h)
}
function renderPatientExamResultsPreviewHtml(exam){
  const uploads=normalizeDay2Uploads(exam?.testUploads||{})
  const sections=[]
  const test1Files=sortedDay2Test1Files((uploads.test1||[]).filter(f=>f&&f.text))
  const test1Source=test1Files.length>1?mergeDay2Test1Files(test1Files):test1Files[0]
  if(test1Source)sections.push(day2PreviewTest1Html(test1Source,'Complete',1))
  const test2Files=(uploads.test2||[]).filter(f=>f&&f.text)
  if(day2ShouldMergeTest2(test2Files)){
    sections.push(day2PreviewMergedTest2Html(test2Files))
  }else{
    test2Files.forEach((f,i)=>sections.push(day2PreviewTest2Html(f,i,test2Files.length)))
  }
  const test3Files=(uploads.test3||[]).filter(f=>f&&f.text)
  // One clean auditory section: prefer manual ear results, else the uploaded PDF (no raw dump).
  if(hasDay2EarSelection(exam?.test3EarResults||{})){
    sections.push(day2PreviewTest3HtmlForExam(exam?.test3EarResults||{},exam?.examinationDate||exam?.sessionDate))
  }else{
    test3Files.forEach((f,i)=>sections.push(day2PreviewTest3PdfHtml(f,i,test3Files.length)))
  }
  return sections.filter(Boolean).join('')||'<div class="day2-result-empty">No saved results available for this exam.</div>'
}
function viewPatientExamResult(patientId,arrayKey,index){
  ctgAuditChartView(patientId,'exam')
  const p=getPatient(patientId)
  if(!p){showToast('Patient not found','err');return}
  const exam=getPatientExamDetailRecord(patientId,arrayKey,index)
  if(!exam||!exam.savedAt){showToast('No saved exam result found','err');return}
  selectedPatientId=patientId
  patientExamDetailState={patientId,arrayKey,index}
  patientExamEditTitleOverride=''
  day2EditAttempt=null
  renderPatientExamDetailPage()
  showPage('patientExamDetail')
  showToast('Viewing '+patientExamDetailLabel(patientId,arrayKey,index)+' result — '+naturalPatientName(p))
}

function openPatientExamDetail(patientId,arrayKey,index){
  ctgAuditChartView(patientId,'exam')
  const p=getPatient(patientId)
  if(!p){showToast('Patient not found','err');return}
  const exam=getPatientExamDetailRecord(patientId,arrayKey,index)
  if(!exam||!exam.savedAt){showToast('No saved exam record found','err');return}
  selectedPatientId=patientId
  patientExamDetailState={patientId,arrayKey,index}
  patientExamEditTitleOverride=''
  day2EditAttempt={patientId,arrayKey,index}
  setDay2UploadsFromPatient({initialExam:exam})
  const sel=document.getElementById('examTypeSelect')
  if(sel)sel.value=normalizeExamCategoryForSelect(exam.examCategory||patientExamDetailLabel(patientId,arrayKey,index),arrayKey)
  const examPatient=document.getElementById('examPatientSelect')
  if(examPatient)examPatient.value=patientId
  updateDay2ContextBar()
  showPage('patientExamEdit')
  showToast('Editing '+patientExamDetailLabel(patientId,arrayKey,index)+' — '+naturalPatientName(p))
}
function renderPatientExamDetailPage(){
  const s=patientExamDetailState
  if(!s)return
  const p=getPatient(s.patientId)
  const exam=getPatientExamDetailRecord(s.patientId,s.arrayKey,s.index)
  if(!p||!exam){showPage('patientLists');return}
  const label=patientExamDetailLabel(s.patientId,s.arrayKey,s.index)
  const category=exam.examCategory||label
  const examDate=day2FormatAnyDate(exam.examinationDate||exam.sessionDate)||'—'
  const name=naturalPatientName(p)
  const av=document.getElementById('patientExamDetailAvatar'); if(av)av.textContent=(label==='Day 2'?'IE':label==='Final Examination'?'FE':'RE')
  const title=document.getElementById('patientExamDetailTitle'); if(title)title.textContent=label
  const sub=document.getElementById('patientExamDetailSub'); if(sub)sub.textContent=name+' · Saved exam record'
  const catTag=document.getElementById('patientExamDetailCategoryTag'); if(catTag)catTag.textContent=category
  const dateTag=document.getElementById('patientExamDetailDateTag'); if(dateTag)dateTag.textContent=examDate==='—'?'No date':'Exam Date: '+examDate
  const barPatient=document.getElementById('patientExamDetailBarPatient'); if(barPatient)barPatient.textContent=name
  const barExam=document.getElementById('patientExamDetailBarExam'); if(barExam)barExam.textContent=label
  const summary=document.getElementById('patientExamDetailSummary')
  if(summary){
    summary.innerHTML=patientDetailGrid([
      ['Patient',name],['Exam Type',category],['Examination Date',exam.examinationDate||exam.sessionDate],['Saved Date',exam.savedDisplay||plainOrDash(exam.savedAt)],
      ['Uploaded Files',countDay2UploadedFiles(exam.testUploads||{})+' file(s)'],['Test 1 Part PDF(s)',summarizeDay2Test1UploadParts(exam.testUploads||{})],
      ['Test 2 Eye PDF(s)',summarizeDay2Test2UploadTypes(exam.testUploads||{})],['Test 3 PDF(s)',summarizeDay2Test3UploadNames(exam.testUploads||{})],
      ['Test 3 Ear Results',summarizeDay2EarResults(exam.test3EarResults||{}),true]
    ])+patientExamDetailPdfButtonsHtml(exam)
  }
  const editBtn=document.getElementById('patientExamDetailEditBtn')
  if(editBtn)editBtn.style.display=currentUserIsProvider()?'none':''
  const results=document.getElementById('patientExamDetailResults')
  if(results)results.innerHTML=renderPatientExamResultsPreviewHtml(exam)
}
/* Optional "View" controls for the uploaded application reports
   (Sway = Test 1, Reflex = Test 2, Shoebox = Test 3) shown on the exam view.
   One button per test; when a test has 2+ uploads they collapse into a
   dropdown ordered latest-first. */
const EXAM_TEST_PDF_LABELS={test1:'Vestibular & Neurocognitive Results',test2:'Quantitative Pupillometry Results',test3:'Auditory Screening Results'}
function examTestFileTime(f){const t=Date.parse(f&&f.uploadedAt);return isNaN(t)?0:t}
function examTestFileHasContent(f){return !!(f&&(f.pdfDataUrl||f.dataUrl||(f.text&&String(f.text).trim())||(Array.isArray(f.pageItems)&&f.pageItems.length)))}
/* Files that carry viewable content, paired with their original array index and
   ordered newest first (falls back to upload order when timestamps are equal). */
function examTestPdfEntries(uploads,testKey){
  return (uploads[testKey]||[])
    .map((f,i)=>({f,i}))
    .filter(o=>examTestFileHasContent(o.f))
    .sort((a,b)=>(examTestFileTime(b.f)-examTestFileTime(a.f))||(b.i-a.i))
}
/* Choice label = the uploaded file / PDF name (falls back to a generated name). */
function examTestFileDisplayName(f,testKey){
  const n=String(f&&f.name||'').trim()
  return n||(EXAM_TEST_PDF_LABELS[testKey].replace(/\s+/g,'-')+'.pdf')
}
/* Secondary line under each choice: Latest tag · eye · upload date-time. */
function examTestOptionMeta(f,pos){
  const t=examTestFileTime(f)
  const when=t?new Date(t).toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'}):''
  const eye=f&&f.eyeType?String(f.eyeType):''
  return [pos===0?'Latest':'',eye,when].filter(Boolean).join(' · ')
}
function patientExamDetailPdfButtonsHtml(exam){
  const u=normalizeDay2Uploads(exam&&exam.testUploads)
  const caret='<svg class="exam-pdf-dd-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
  const groups=['test1','test2','test3'].map(k=>{
    const entries=examTestPdfEntries(u,k)
    if(!entries.length)return ''
    const label=EXAM_TEST_PDF_LABELS[k]
    if(entries.length===1){
      return `<button type="button" class="exam-pdf-dd-trigger" data-onclick="viewExamTestPdf('${k}',${entries[0].i})"><span class="exam-pdf-badge">PDF</span><span class="exam-pdf-dd-title">View ${escHtml(label)}</span></button>`
    }
    return `<button type="button" class="exam-pdf-dd-trigger" data-test="${k}" data-onclick="toggleExamPdfPanel('${k}',this)"><span class="exam-pdf-badge">PDF</span><span class="exam-pdf-dd-title">View ${escHtml(label)}</span><span class="exam-pdf-dd-count">${entries.length}</span>${caret}</button>`
  })
  const html=groups.filter(Boolean).join('')
  if(!html)return ''
  return `<div class="exam-detail-pdf-row"><div class="exam-detail-pdf-label">Uploaded Result PDFs</div><div class="exam-detail-pdf-btns">${html}</div><div class="exam-pdf-panel" id="examPdfPanel"></div></div>`
}
/* Inline expanding panel (normal document flow - never clipped by the card).
   Lists a test's uploaded PDFs by file name, latest first; picking one opens it. */
function toggleExamPdfPanel(testKey,btn){
  const row=btn&&btn.closest('.exam-detail-pdf-row'); if(!row)return
  const panel=row.querySelector('#examPdfPanel'); if(!panel)return
  const wasActive=btn.classList.contains('active')
  row.querySelectorAll('.exam-pdf-dd-trigger.active').forEach(b=>b.classList.remove('active'))
  if(wasActive){panel.classList.remove('open');panel.innerHTML='';return}
  const s=patientExamDetailState; if(!s)return
  const exam=getPatientExamDetailRecord(s.patientId,s.arrayKey,s.index); if(!exam)return
  const entries=examTestPdfEntries(normalizeDay2Uploads(exam.testUploads),testKey)
  if(!entries.length)return
  btn.classList.add('active')
  panel.innerHTML=`<div class="exam-pdf-panel-title">${escHtml(EXAM_TEST_PDF_LABELS[testKey])} · ${entries.length} files</div>`+entries.map((o,pos)=>`
    <button type="button" class="exam-pdf-file${pos===0?' is-latest':''}" data-onclick="viewExamTestPdf('${testKey}',${o.i})">
      <span class="exam-pdf-file-ico">PDF</span>
      <span class="exam-pdf-file-main"><span class="exam-pdf-file-name" title="${escHtml(examTestFileDisplayName(o.f,testKey))}">${escHtml(examTestFileDisplayName(o.f,testKey))}</span><span class="exam-pdf-file-meta">${escHtml(examTestOptionMeta(o.f,pos))}</span></span>
      <span class="exam-pdf-file-view">View →</span>
    </button>`).join('')
  panel.classList.add('open')
}
function examTestFilePreviewHtml(testKey,f){
  if(testKey==='test1')return day2PreviewTest1Html(f,'Complete',1)
  if(testKey==='test2')return day2PreviewTest2Html(f,0,1)
  return day2PreviewTest3PdfHtml(f,0,1)
}
async function viewExamTestPdf(testKey,index){
  const s=patientExamDetailState; if(!s)return
  const exam=getPatientExamDetailRecord(s.patientId,s.arrayKey,s.index); if(!exam)return
  const f=(normalizeDay2Uploads(exam.testUploads)[testKey]||[])[index]
  if(!f){showToast('Result not found','err');return}
  _displayExamTestFile(testKey,f)
}
// Shared display for one uploaded exam result file - opens the exact stored PDF
// (or image) when available, else falls back to the parsed/extracted preview.
// Used by both the exam-detail page and the Comparison tab.
async function _displayExamTestFile(testKey,f){
  const title=(f.name||EXAM_TEST_PDF_LABELS[testKey])+' — '+EXAM_TEST_PDF_LABELS[testKey]
  // Preferred: the exact uploaded PDF (or image) when its bytes were stored.
  const url=f.pdfDataUrl||f.dataUrl
  if(url){
    if(/^data:image\//i.test(url)||String(f.type||'').toLowerCase().startsWith('image/')){_showResultPreviewModal(`<div class="pld-doc-image-wrap"><img class="pld-doc-image" src="${escHtml(url)}" alt="${escHtml(f.name||'Uploaded image')}"></div>`,title);return}
    try{const blob=await(await fetch(url)).blob();_showPdfModal(URL.createObjectURL(blob),title)}
    catch(e){_showPdfModal(url,title)}
    return
  }
  // No stored PDF file (older/extracted-only upload) - show the parsed result,
  // then the raw extracted text, and a note that the original can be restored.
  let html=examTestFilePreviewHtml(testKey,f)
  const rawText=String(f.text||'').trim()
  if((!html||!html.trim())&&rawText)html=`<div class="day2-result-section"><div class="day2-result-heading">${escHtml(EXAM_TEST_PDF_LABELS[testKey])}</div><div data-cs="${__cs}white-space:pre-wrap;font-size:13px;line-height:1.5">${escHtml(rawText)}</div></div>`
  if(html&&html.trim()){
    html+=`<div class="day2-result-note">The exact original PDF was not stored for this upload. Re-upload the ${escHtml(EXAM_TEST_PDF_LABELS[testKey].replace(' Results',''))} PDF on this exam to view it in its original layout.</div>`
    _showResultPreviewModal(html,title)
  }else{
    showToast('The original PDF was not stored for this upload — please re-upload it on the exam','err')
  }
}
function editPatientExamFromDetail(){
  const s=patientExamDetailState
  if(!s)return
  openPatientExamDetail(s.patientId,s.arrayKey,s.index)
}
function downloadPatientExamDetailPdf(){
  const s=patientExamDetailState
  if(!s)return
  if(s.arrayKey==='reExams')exportInitialExamPDF(null,s.patientId,s.index)
  else if(s.arrayKey==='finalExam')exportFinalExamPDF(null,s.patientId)
  else exportInitialExamPDF(null,s.patientId)
}

function openExamAttempt(patientId, arrayKey, index){
  ctgAuditChartView(patientId,'exam')
  const p=getPatient(patientId)
  if(!p){showToast('Patient not found','err');return}
  selectedPatientId=patientId
  const attempt=p[arrayKey]?.[index]
  if(!attempt){showToast('Record not found','err');return}
  patientExamDetailState={patientId,arrayKey,index}
  patientExamEditTitleOverride=''
  day2EditAttempt={patientId, arrayKey, index}
  setDay2UploadsFromPatient({initialExam:attempt})
  const sel=document.getElementById('examTypeSelect')
  if(sel)sel.value=normalizeExamCategoryForSelect(attempt.examCategory||'Re-Examination',arrayKey)
  updateDay2ContextBar()
  showPage('patientExamEdit')
  showToast('Opened attempt #'+(index+1)+' for editing — '+naturalPatientName(p))
}
/* True when this re-exam record is the one designated as the Final Examination
   (they share savedAt). Such a record must be represented only as the Final
   Exam - never duplicated as a re-exam - in the FCR and in billing. */
function reExamIsDesignatedFinal(p,rx){return !!(rx&&p&&p.finalExam&&p.finalExam.savedAt&&rx.savedAt===p.finalExam.savedAt)}
function setReExamAsFinal(patientId, index){
  const p=getPatient(patientId)
  if(!p)return
  const rx=p.reExams?.[index]
  if(!rx)return
  p.finalExam={...rx, examCategory:'Final Examination'}
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(patientId)
  showToast('Re-Exam #'+(index+1)+' designated as Final Examination ✓')
}
function unsetFinalExam(patientId){
  const p=getPatient(patientId)
  if(!p)return
  const hasMatchingRe=(Array.isArray(p.reExams)?p.reExams:[]).some(rx=>rx&&p.finalExam&&rx.savedAt===p.finalExam.savedAt)
  if(!hasMatchingRe)detachLinkedDailyNoteFromExamDelete(p,p.finalExam)
  p.finalExam=null
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(patientId)
  showToast('Final Examination designation removed')
}
async function deleteExamAttempt(patientId, arrayKey, index){
  const p=getPatient(patientId)
  if(!p)return
  if(!(await ctgConfirm('Delete this exam attempt?',{danger:true,okLabel:'Delete'})))return
  const removed=p[arrayKey]&&p[arrayKey][index]
  detachLinkedDailyNoteFromExamDelete(p,removed)
  p[arrayKey].splice(index,1)
  // If the deleted re-exam was designated as the Final Exam, clear it too so its
  // billing charges are removed as well.
  if(removed&&p.finalExam&&removed.savedAt&&p.finalExam.savedAt===removed.savedAt)p.finalExam=null
  day2EditAttempt=null  // indexes shifted -> drop any stale edit context
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(patientId)
  updateExamCategoryCounts()
  showToast('Exam attempt deleted')
}
function openExamForPatient(id, category){
  ctgAuditChartView(id,'exam')
  const p=getPatient(id)
  if(!p){showToast('Please select a patient first','err');return}
  selectedPatientId=id
  patientExamDetailState=null
  patientExamEditTitleOverride=category
  day2EditAttempt=null  // fresh exam -> Save creates a new record
  setDay2UploadsFromPatient(p)
  const sel=document.getElementById('examTypeSelect')
  if(sel)sel.value=normalizeExamCategoryForSelect(category)
  const examDateEl=document.getElementById('day2ExamDate')
  if(examDateEl && category!=='Day 2')examDateEl.value=''
  updateDay2ContextBar()
  showPage('patientExamEdit')
  showToast(category+' opened for '+naturalPatientName(p))
}
function startInitialExamForPatient(id){
  ctgAuditChartView(id,'exam')
  const p=getPatient(id)
  if(!p){showToast('Please select a patient first','err');return}
  selectedPatientId=id
  patientExamDetailState=null
  patientExamEditTitleOverride='Day 2'
  day2EditAttempt=null  // fresh exam -> Save creates or updates the Day 2 record
  setDay2UploadsFromPatient(p)
  const sel=document.getElementById('examTypeSelect')
  if(sel)sel.value='Day 2'
  updateDay2ContextBar()
  showPage('patientExamEdit')
  showToast('Day 2 Exams opened for '+naturalPatientName(p))
}
function cloneDay2Data(obj){
  return JSON.parse(JSON.stringify(obj))
}
function collectInitialExamData(patientId){
  const p=getInitialExamPatient(patientId)
  const d=p?.demographics||{}
  const now=new Date().toISOString()
  const uploadSessionDate=getDay2Test1CompleteSessionDate(day2ResultUploads)
  const selectedExamDate=day2FormatAnyDate(document.getElementById('day2ExamDate')?.value||'')
  const resolvedExamDate=selectedExamDate||uploadSessionDate||formatDay2Date(now)
  return {
    savedAt:now,
    savedDisplay:formatSavedDisplay(now),
    examCategory:normalizeExamCategoryForSelect(document.getElementById('examTypeSelect')?.value||patientExamEditTitleOverride||(patientExamDetailState?patientExamDetailLabel(patientExamDetailState.patientId,patientExamDetailState.arrayKey,patientExamDetailState.index):''),patientExamDetailState?.arrayKey),
    examinationDate:resolvedExamDate,
    sessionDate:resolvedExamDate,
    aceDateOfService:getDay2AceDateOfService(p),
    patientId:p?.id||'',
    patientName:p?naturalPatientName(p):'—',
    provider:getDay2AceProviderValue(p),
    medicalRecordNo:d.mrn||'—',
    dob:day2FormatAnyDate(d.dob)||d.dob||'—',
    gender:d.gender||'—',
    dateOfIncident:day2FormatAnyDate(d.doi)||d.doi||'—',
    aceScore:p?.ace?.aceScore||'—',
    sources:countDay2UploadedFiles(day2ResultUploads)?('Uploaded result files: '+countDay2UploadedFiles(day2ResultUploads)):'Sway Medical · Reflex Telehealth · Shoebox',
    totalDates:p?String(computeTotalDatesOfService(p)):document.getElementById('day2TotalDates')?.value||'',
    testUploads:cloneDay2Uploads(day2ResultUploads),
    test3EarResults:collectDay2Test3EarResults(),
    sway:cloneDay2Data(SWAY_DATA),
    reflex:cloneDay2Data(REFLEX_DATA),
    shoebox:cloneDay2Data(SHOEBOX_DATA)
  }
}
// Total Dates of Service = ACE + Day 2 Exam + Re-Exam(s) + Final Exam + Daily Notes.
// If a Re-Exam is designated as the Final Exam, it is counted only once.
function computeTotalDatesOfService(p,opts){
  opts=opts||{}
  if(!p)return 0
  let total=0
  if(p.ace)total+=1
  if(p.initialExam&&p.initialExam.savedAt)total+=1
  const reExams=Array.isArray(p.reExams)?p.reExams.filter(rx=>rx&&rx.savedAt):[]
  total+=reExams.length
  const finalExam=p.finalExam&&p.finalExam.savedAt?p.finalExam:null
  if(finalExam){
    const finalKey=String(finalExam.savedAt||finalExam.examinationDate||finalExam.sessionDate||'')
    const finalMatchesReExam=!!finalKey && reExams.some(rx=>String(rx.savedAt||rx.examinationDate||rx.sessionDate||'')===finalKey)
    if(!finalMatchesReExam)total+=1
  }else if(opts.includeFinal&&p.finalExam){
    total+=1
  }
  if(Array.isArray(p.dailyNotes))total+=p.dailyNotes.length
  return total
}
function updateDay2SaveButtonLabel(){
  const btn=document.getElementById('day2SaveExamBtn')
  if(!btn)return
  btn.textContent=day2EditAttempt?'Update Exam':'Save Exam'
}
function saveInitialExamForCurrentPatient(){
  const patientSel=document.getElementById('examPatientSelect')
  if(day2EditorMountedIn==='day2' && (!patientSel || !patientSel.value)){showToast('No patient selected. Please select a patient before saving the exam.','err');return}
  const resolvedPatientId=(day2EditorMountedIn==='day2' && patientSel?.value)?patientSel.value:selectedPatientId
  const p=getPatient(resolvedPatientId)
  if(!p){showToast('No patient selected. Please select a patient before saving the exam.','err');return}
  selectedPatientId=p.id
  const category=normalizeExamCategoryForSelect((document.getElementById('examTypeSelect')?.value)||patientExamEditTitleOverride||(patientExamDetailState?patientExamDetailLabel(patientExamDetailState.patientId,patientExamDetailState.arrayKey,patientExamDetailState.index):''),patientExamDetailState?.arrayKey)
  const examData=collectInitialExamData(p.id)
  examData.examCategory=category
  // Editing an opened exam from Patient Lists -> update it IN PLACE (don't create a duplicate).
  const editingArray = day2EditAttempt && day2EditAttempt.patientId===p.id
    && Array.isArray(p[day2EditAttempt.arrayKey]) && p[day2EditAttempt.arrayKey][day2EditAttempt.index]
  const editingSingle = day2EditAttempt && day2EditAttempt.patientId===p.id
    && (day2EditAttempt.arrayKey==='initialExam'||day2EditAttempt.arrayKey==='finalExam') && p[day2EditAttempt.arrayKey]
  const wasUpdating=!!(editingArray||editingSingle)
  if(editingArray){
    const orig=p[day2EditAttempt.arrayKey][day2EditAttempt.index]
    // Preserve the original saved date (created date) and Final-Exam linkage.
    examData.savedAt=orig.savedAt
    examData.savedDisplay=orig.savedDisplay
    syncLinkedDailyNoteFromExamSave(p,orig,examData,day2EditAttempt.arrayKey,day2EditAttempt.index)
    p[day2EditAttempt.arrayKey][day2EditAttempt.index]=examData
    if(p.finalExam && orig.savedAt && p.finalExam.savedAt===orig.savedAt){
      p.finalExam={...examData, examCategory:'Final Examination'}
    }
  } else if(editingSingle){
    const orig=p[day2EditAttempt.arrayKey]
    examData.savedAt=orig.savedAt
    examData.savedDisplay=orig.savedDisplay
    syncLinkedDailyNoteFromExamSave(p,orig,examData,day2EditAttempt.arrayKey,null)
    p[day2EditAttempt.arrayKey]=examData
  } else if(category==='Re-Examination'){
    if(!Array.isArray(p.reExams))p.reExams=[]
    p.reExams.push(examData)
    day2EditAttempt={patientId:p.id,arrayKey:'reExams',index:p.reExams.length-1}
  } else if(category==='Final Examination'){
    if(p.finalExam)syncLinkedDailyNoteFromExamSave(p,p.finalExam,examData,'finalExam',null)
    p.finalExam=examData
    day2EditAttempt={patientId:p.id,arrayKey:'finalExam',index:null}
  } else {
    if(p.initialExam)syncLinkedDailyNoteFromExamSave(p,p.initialExam,examData,'initialExam',null)
    p.initialExam=examData
    day2EditAttempt={patientId:p.id,arrayKey:'initialExam',index:null}
  }
  if(editingArray||editingSingle){
    // Keep the edit context on the saved record so repeated clicks update it.
    day2EditAttempt={patientId:p.id,arrayKey:day2EditAttempt.arrayKey,index:day2EditAttempt.index}
  }
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientWorkflow()
  renderPatientDetails(p.id)
  updateDay2ContextBar()
  updateExamCategoryCounts()
  updateDay2SaveButtonLabel()
  showToast((wasUpdating?'Exam updated under ':'Exam saved under ')+'"'+category+'" ✓')
}


function updateExamCategoryCounts(){
  const counts={'Day 2':0,'Re-Examination':0,'Final Examination':0}
  ctgPatients.forEach(p=>{
    if(isPatientInactive(p))return
    const cat=p.initialExam?.examCategory
    // Normalised, so exams saved before the relabel are still counted.
    const key=cat?normalizeExamCategoryForSelect(cat,''):null
    if(key && counts[key]!==undefined) counts[key]++
  })
  const map={
    'Day 2':'sideExamInitial',
    'Re-Examination':'sideExamRe',
    'Final Examination':'sideExamFinal'
  }
  Object.entries(map).forEach(([cat,id])=>{
    const el=document.getElementById(id)
    if(!el)return
    let badge=el.querySelector('.exam-cat-count')
    if(counts[cat]>0){
      if(!badge){
        badge=document.createElement('span')
        badge.className='exam-cat-count'
        badge.style.cssText='margin-left:auto;background:rgba(123,159,255,.3);color:#48CAE4;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700'
        el.appendChild(badge)
      }
      badge.textContent=counts[cat]
    } else if(badge){
      badge.remove()
    }
  })
}
function exportInitialExamPDF(btn,patientId,reExamIndex){
  loadJsPDF(()=>buildInitialExamPDF(btn,patientId,reExamIndex))
}
function exportFinalExamPDF(btn,patientId){
  const p=getInitialExamPatient(patientId)
  if(!p?.finalExam){showToast('No final examination data found','err');return}
  loadJsPDF(()=>buildInitialExamPDF(btn,patientId,null,p.finalExam))
}
function buildInitialExamPDF(btn,patientId,reExamIndex,forceData,opts){
  const originalHtml=btn?btn.innerHTML:null
  if(btn){btn.innerHTML='<span class="spinner"></span>Building...';btn.disabled=true}
  try{
    const p=getInitialExamPatient(patientId)
    // If a specific re-exam index is provided, use that record directly
    const hasCurrentDay2State=countDay2UploadedFiles(day2ResultUploads)>0||hasDay2EarSelection(collectDay2Test3EarResults())
    let data
    if(forceData){
      data=forceData
    } else if(reExamIndex!==undefined&&reExamIndex!==null&&p?.reExams?.[reExamIndex]){
      data=p.reExams[reExamIndex]
    } else {
      data=(hasCurrentDay2State||!p||!p.initialExam)?collectInitialExamData(patientId):p.initialExam
    }
    const initialExamSessionDate=day2FormatAnyDate(data.sessionDate)||formatDay2Date(data.savedAt)||formatDay2Date(new Date())
    const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'letter'})
    const PW=612,PH=792,ML=36,MR=36,TW=PW-ML-MR
    const DAY2_TABLE_X=ML
    const DAY2_TABLE_W=TW
    const HEADER_BOTTOM_Y=106
    const FIRST_PATIENT_TABLE_TOP=HEADER_BOTTOM_Y
    const FIRST_PATIENT_TABLE_H=63
    const CONTENT_TOP=ML+96,BOTTOM=76
    let y=CONTENT_TOP
    function setF(style,sz){doc.setFont('times',style);doc.setFontSize(sz)}
    function clean(v){return day2PdfSafe(v)}
    function drawHeader(){
      doc.setTextColor(0,0,0)
      setF('bold',12)
      doc.text('CONCUSSION THERAPY GROUP',ML,90)
      setF('normal',11)
      const rx=PW-MR
      doc.text('2411 Crofton Lane, Suite 13A',rx,52,{align:'right'})
      doc.text('Crofton, MD, 21114-1336',rx,68,{align:'right'})
      doc.text('Phone: 410-451-9870',rx,84,{align:'right'})
      doc.text('Fax: 410-451-9872',rx,100,{align:'right'})
    }
    function drawPatientInfoTable(){
      const x=DAY2_TABLE_X, w=DAY2_TABLE_W, c1=w/2, c2=w/2
      const rowH=21, top=FIRST_PATIENT_TABLE_TOP
      const row1=top, row2=top+rowH, row3=top+rowH*2
      const pReg=p?.demographics||{}
      const patientName=clean(data.patientName||naturalPatientName(p)||'—')
      const dob=clean(data.dob||pReg.dob||'—')
      const doi=clean(data.dateOfIncident||pReg.doi||'—')
      const sessionDate=clean(initialExamSessionDate)
      doc.setDrawColor(0,0,0)
      doc.setLineWidth(0.9)
      doc.rect(x,top,w,FIRST_PATIENT_TABLE_H)
      doc.line(x,row2,x+w,row2)
      doc.line(x,row3,x+w,row3)
      doc.line(x+c1,top,x+c1,row3)
      doc.setTextColor(0,0,0)
      function tableCell(label,value,cx,cy){
        setF('bold',12); doc.text(label,cx,cy)
        const lw=doc.getTextWidth(label)
        setF('normal',12); doc.text(value,cx+lw,cy)
      }
      tableCell('Name: ',patientName,x+5,row1+14)
      tableCell('DOB:  ',dob,x+c1+5,row1+14)
      tableCell('DOI:  ',doi,x+5,row2+14)
      tableCell('Session Date: ',sessionDate,x+c1+5,row2+14)
      tableCell('Provider: ',clean(day2ResolveProvider(data,p)),x+5,row3+14)
    }
    function newPage(){doc.addPage();drawHeader();y=CONTENT_TOP}
    function need(h){if(y+h>PH-BOTTOM)newPage()}
    function line(txt,x,yy,opts){doc.text(clean(txt),x,yy,opts||{})}
    function paragraph(text,space){
      setF('normal',10.5);doc.setTextColor(0,0,0)
      const lines=doc.splitTextToSize(clean(text),TW)
      need(lines.length*13+(space||6))
      lines.forEach(l=>{line(l,ML,y);y+=13})
      y+=(space===undefined?6:space)
    }
    function heading(text){
      need(24); y+=4
      setF('bold',11);doc.setTextColor(0,0,0)
      const lines=doc.splitTextToSize(clean(text),TW)
      lines.forEach(l=>{line(l,ML,y);y+=14})
      y+=4
    }
    function subheading(text){
      need(20); y+=2
      setF('bold',10);line(text,ML,y);y+=14
    }
    function table(headers,rows,widths){
      widths=widths||headers.map(()=>TW/headers.length)
      const fontSize=8.8,rowPad=5,lineH=10.5
      setF('normal',fontSize)
      const all=[headers].concat(rows||[])
      all.forEach((r,ri)=>{
        const cellLines=r.map((c,i)=>doc.splitTextToSize(clean(c),widths[i]-rowPad*2))
        const h=Math.max(18,...cellLines.map(lines=>lines.length*lineH+rowPad*2))
        need(h)
        let x=ML
        r.forEach((c,i)=>{
          doc.setDrawColor(0,0,0);doc.setLineWidth(0.4)
          if(ri===0){doc.setFillColor(238,238,238);doc.rect(x,y,widths[i],h,'FD')}else{doc.rect(x,y,widths[i],h)}
          setF(ri===0?'bold':'normal',fontSize)
          let yy=y+rowPad+9
          cellLines[i].forEach(l=>{line(l,x+rowPad,yy);yy+=lineH})
          x+=widths[i]
        })
        y+=h
      })
      y+=8
    }
    function metricGrid(items){table(['Metric','Value'],items,[190,TW-190])}
    function introHeading(text,size){
      const fs=12
      need(18)
      setF('bold',fs);doc.setTextColor(0,0,0)
      const lines=doc.splitTextToSize(clean(text),DAY2_TABLE_W,{fontSize:fs,font:'times',fontStyle:'bold'})
      lines.forEach(l=>{line(l,DAY2_TABLE_X,y);y+=13.5})
    }
    function introPara(text){
      const fs=12
      setF('normal',fs);doc.setTextColor(0,0,0)
      const lines=doc.splitTextToSize(clean(text),DAY2_TABLE_W,{fontSize:fs,font:'times',fontStyle:'normal'})
      need(lines.length*(fs+1.5))
      lines.forEach(l=>{line(l,DAY2_TABLE_X,y);y+=fs+1.5})
    }
    function introLink(url){
      const fs=12
      setF('normal',fs);doc.setTextColor(45,104,184)
      const lines=doc.splitTextToSize(clean(url),DAY2_TABLE_W,{fontSize:fs,font:'times',fontStyle:'normal'})
      need(lines.length*(fs+1.5))
      lines.forEach(l=>{doc.text(l,DAY2_TABLE_X,y);y+=fs+1.5})
      doc.setTextColor(0,0,0)
    }
    function drawInitialExamOpeningText(){
      const examCat=data.examCategory||'Day 2'
      const examLabel=examCat==='Final Examination'?'FINAL-EXAMINATION REPORT':examCat==='Re-Examination'?'RE-EXAMINATION':'INITIAL EXAMINATION'
      introHeading(examLabel,10.5)
      introHeading('NEUROCOGNITIVE AND VESTIBULAR EXAMINATION',10.5)
      introHeading('Definition of Concussion from The United States Centers for Disease Control and Prevention (CDC):',9.8)
      introPara('"A concussion is a type of traumatic brain injury—or TBI—caused by a bump, blow, or jolt to the head or by a hit to the body that causes the head and brain to move rapidly back and forth. This sudden movement can cause the brain to bounce around or twist in the skull, creating chemical changes in the brain and sometimes stretching and damaging brain cells."')
      introHeading('United States Centers for Disease Control (CDC) Guidelines for Concussion Evaluation and Treatment:',9.8)
      introLink('https://www.cdc.gov/headsup/basics/concussion_whatis.html')
      introHeading('Traumatic Brain Injury Explanation:',9.8)
      introLink('https://www.hopkinsmedicine.org/health/conditions-and-diseases/traumatic-brain-injury')
      y+=8
      // "Note:" bold inline prefix, rest of sentence normal on same line
      resultRichParagraph([{text:'Note: ',bold:true},{text:'Concussion can be broadly defined as a traumatic brain injury (TBI) without a brain bleed, and without imaging findings on conventional MRI or CT. The constellation of cognitive, vestibular and emotional effects observed in concussion are due to the release of inflammatory cells from glial cells in the brain\'s white matter (neuroinflammation) when they twist, stretch, or strike the interior of the skull. This report documents concussion-associated effects demonstrated by the patient.'}],{size:12})
      y+=8
      introHeading('Significance of Second Head Impact on Concussion Severity',9.8)
      introPara('Second Head Impact Statement: "A second concussion soon after the first one does not have to be very strong for its effects to be permanently disabling."')
      introLink('https://www.aans.org/en/Patients/Neurosurgical-Conditions-and-Treatments/Concussion')
      introHeading('American Association of Neurological Surgeons.',9.8)
      introLink('https://www.aans.org/en/Patients/Neurosurgical-Conditions-and-Treatments/Concussion')
      y+=10
    }
    function addFooterPagination(){
      const total=doc.internal.getNumberOfPages()
      const footerY=PH-14
      const footerPatient=clean(data.patientName||naturalPatientName(p)||'—')
      const footerProvider=clean(day2ResolveProvider(data,p))
      const footerDob=formatDay2Date(data.dob||(p&&p.demographics?p.demographics.dob:''))
      const footerLeft='Concussion Therapy Group / '+footerProvider+' / '+footerPatient+' / '+footerDob
      function fitFooterText(text,maxW){
        let size=8
        setF('normal',size)
        while(doc.getTextWidth(text)>maxW&&size>6.2){
          size-=0.2
          setF('normal',size)
        }
        if(doc.getTextWidth(text)<=maxW)return text
        let out=text
        while(out.length>12&&doc.getTextWidth(out+'...')>maxW){out=out.slice(0,-1)}
        return out+'...'
      }
      for(let i=1;i<=total;i++){
        doc.setPage(i)
        doc.setTextColor(0,0,0)
        const pageText='Page '+i+' of '+total
        setF('normal',8)
        const rightW=doc.getTextWidth(pageText)+18
        const leftText=fitFooterText(footerLeft,TW-rightW)
        doc.text(leftText,ML,footerY)
        setF('normal',8)
        doc.text(pageText,PW-MR,footerY,{align:'right'})
      }
    }
    function asRows(arr){return (arr||[]).map(r=>(r||[]).map(clean))}

    function day2UploadedFiles(testKey){
      const uploads=normalizeDay2Uploads(data.testUploads)
      return uploads[testKey]||[]
    }
    function day2UploadedText(testKey){
      return day2UploadedFiles(testKey).map(f=>f&&f.text?String(f.text):'').filter(Boolean).join('\n')
    }
    function normResultText(text){return String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim()}
    function flatResultText(text){return normResultText(text).replace(/\n+/g,' ')}
    function escapeRegExp(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
    function matchResult(text,regex,def){const m=String(text||'').match(regex);return m?clean(m[1]):(def===undefined?'—':def)}
    function valueAfterLabel(text,label,def){
      const lines=normResultText(text).split('\n')
      const lab=String(label).toLowerCase()
      for(const line of lines){
        const low=line.toLowerCase()
        const idx=low.indexOf(lab)
        if(idx>=0){
          let v=line.slice(idx+label.length).replace(/^\s*[:.]\s*/,'').trim()
          if(v)return clean(v)
        }
      }
      const re=new RegExp(escapeRegExp(label)+'\\s*[:.]?\\s*([^\\n]+)','i')
      return matchResult(text,re,def||'—')
    }
    function resultSection(text,startLabel,endLabels){
      const source=normResultText(text)
      const start=source.toLowerCase().indexOf(String(startLabel).toLowerCase())
      if(start<0)return ''
      let end=source.length
      ;(endLabels||[]).forEach(label=>{
        const idx=source.toLowerCase().indexOf(String(label).toLowerCase(),start+String(startLabel).length)
        if(idx>=0&&idx<end)end=idx
      })
      return source.slice(start,end)
    }
    function resultHeading(text,size){
      const fs=12
      need(18)
      resultRichParagraph([{text:text,bold:true}],{size:fs,lineHeight:14})
    }
    function resultText(text,size,space){
      const fs=12
      resultRichParagraph([{text:text,bold:false}],{size:fs,space:space||0,lineHeight:fs+1.5})
    }
    function resultBoldText(text,size,space){
      const fs=12
      resultRichParagraph([{text:text,bold:true}],{size:fs,space:space||0,lineHeight:fs+1.5})
    }
    function resultLink(url){
      const fs=12
      setF('normal',fs);doc.setTextColor(45,104,184)
      const lines=doc.splitTextToSize(clean(url),DAY2_TABLE_W,{fontSize:fs,font:'times',fontStyle:'normal'})
      need(lines.length*(fs+1.5))
      lines.forEach(l=>{doc.text(l,DAY2_TABLE_X,y);y+=fs+1.5})
      doc.setTextColor(0,0,0)
    }
    function resultKV(label,value,opts){
      opts=opts||{}
      const labelSize=12
      const valueSize=12
      const lineH=Math.max(labelSize,valueSize)+2.4
      setF('bold',labelSize);doc.setTextColor(0,0,0)
      let labelTxt=clean(label)+(opts.noColon?'':':')
      const labelW=doc.getTextWidth(labelTxt+' ')
      const val=clean(value)
      const availableW=Math.max(120,DAY2_TABLE_W-labelW)
      const forceStacked=labelW>DAY2_TABLE_W*0.46
      if(forceStacked){
        resultRichParagraph([{text:labelTxt+' ',bold:true,size:labelSize},{text:val,bold:!!opts.valueBold,size:valueSize}],{size:valueSize,space:opts.space||0})
        return
      }
      const valLines=doc.splitTextToSize(val,availableW,{fontSize:valueSize,font:'times',fontStyle:opts.valueBold?'bold':'normal'})
      need(Math.max(1,valLines.length)*lineH+(opts.space||0)+2)
      setF('bold',labelSize)
      doc.text(labelTxt,DAY2_TABLE_X,y)
      setF(opts.valueBold?'bold':'normal',valueSize)
      if(valLines.length){
        doc.text(valLines[0],DAY2_TABLE_X+labelW,y)
        for(let i=1;i<valLines.length;i++){y+=lineH;need(lineH);doc.text(valLines[i],DAY2_TABLE_X+labelW,y)}
      }
      y+=lineH+(opts.space||0)
    }
    function resultRichParagraph(parts,opts){
      opts=opts||{}
      const baseSize=opts.size||9.6
      const segSize=p=>(p&&typeof p.size==='number')?p.size:baseSize
      let maxSeg=baseSize
      ;(parts||[]).forEach(p=>{const s=segSize(p);if(s>maxSeg)maxSeg=s})
      const lineH=opts.lineHeight||Math.max(11.8,maxSeg+2.5)
      const space=opts.space||0
      const x0=opts.x||DAY2_TABLE_X
      const maxW=opts.maxW||DAY2_TABLE_W
      const lines=[]
      let line=[],w=0
      function widthOf(token,bold,sz){setF(bold?'bold':'normal',sz);return doc.getTextWidth(token)}
      function pushLine(){if(line.length){lines.push(line);line=[];w=0}}
      ;(parts||[]).forEach(part=>{
        const bold=!!part.bold
        const sz=segSize(part)
        const text=clean(part.text!==undefined?part.text:part)
        const tokens=text.match(/\S+\s*/g)||['']
        tokens.forEach(tok=>{
          if(!line.length)tok=tok.replace(/^\s+/,'')
          if(!tok)return
          let tw=widthOf(tok,bold,sz)
          if(line.length&&w+tw>maxW){pushLine();tok=tok.replace(/^\s+/,'');tw=widthOf(tok,bold,sz)}
          if(tw>maxW){
            const pieces=doc.splitTextToSize(tok.trim(),maxW,{fontSize:sz,font:'times',fontStyle:bold?'bold':'normal'})
            pieces.forEach((piece,idx)=>{
              if(idx>0)pushLine()
              const ptxt=piece+(idx===pieces.length-1&&/\s$/.test(tok)?' ':'')
              const pw=widthOf(ptxt,bold,sz)
              if(line.length&&w+pw>maxW)pushLine()
              line.push({text:ptxt,bold,sz});w+=pw
            })
          }else{
            line.push({text:tok,bold,sz});w+=tw
          }
        })
      })
      pushLine()
      if(!lines.length)lines.push([{text:'—',bold:false,sz:baseSize}])
      lines.forEach(ln=>{
        need(lineH+2)
        let x=x0
        ln.forEach(seg=>{
          setF(seg.bold?'bold':'normal',seg.sz||baseSize);doc.setTextColor(0,0,0)
          doc.text(seg.text,x,y)
          x+=doc.getTextWidth(seg.text)
        })
        y+=lineH
      })
      y+=space
    }
    function resultInline(parts,size){
      size=12
      let x=DAY2_TABLE_X
      need(size+3)
      parts.forEach(part=>{
        setF(part.bold?'bold':'normal',size)
        doc.setTextColor(part.link?45:0,part.link?104:0,part.link?184:0)
        const txt=clean(part.text)
        doc.text(txt,x,y)
        x+=doc.getTextWidth(txt)
      })
      doc.setTextColor(0,0,0)
      y+=size+2
    }
    function resultLabelDateLine(label,date,opts){
      opts=opts||{}
      const labelSize=12
      const dateSize=12
      need(labelSize+3)
      setF('bold',labelSize)
      doc.setTextColor(0,0,0)
      doc.text(clean(label),DAY2_TABLE_X,y)
      const labelW=doc.getTextWidth(clean(label))
      setF(opts.dateBold?'bold':'normal',dateSize)
      doc.text('  Date: '+clean(date),DAY2_TABLE_X+labelW,y)
      y+=Math.max(labelSize,dateSize)+2
    }
    function resultTable(headers,rows,widths){
      rows=rows||[]
      const colCount=Math.max(headers.length,...rows.map(r=>(r||[]).length),1)
      widths=widths&&widths.length?widths.slice(0,colCount):headers.map(()=>DAY2_TABLE_W/colCount)
      while(widths.length<colCount)widths.push(DAY2_TABLE_W/colCount)
      const rawTotal=widths.reduce((sum,w)=>sum+(Number(w)||0),0)||DAY2_TABLE_W
      // Keep every Day 2 result table inside the printable area. The first result
      // VOMS table has seven columns, so fixed column widths can otherwise exceed
      // the Letter page width and cut off the right side of the table.
      if(rawTotal>DAY2_TABLE_W){
        const scale=DAY2_TABLE_W/rawTotal
        widths=widths.map(w=>Math.max(24,(Number(w)||0)*scale))
        const scaledTotal=widths.reduce((sum,w)=>sum+w,0)
        if(scaledTotal>DAY2_TABLE_W){
          const adjust=DAY2_TABLE_W/scaledTotal
          widths=widths.map(w=>w*adjust)
        }
      }
      const tableTotal=widths.reduce((sum,w)=>sum+w,0)
      const x0=DAY2_TABLE_X+(DAY2_TABLE_W-tableTotal)/2
      const fontSize=12
      const lineH=15
      const rowPad=5
      function makeCellLines(r){
        const normalized=Array.from({length:colCount},(_,i)=>r&&r[i]!==undefined?r[i]:'')
        function tableCellText(c){return day2IsPresentValue(c)?day2CleanExtractedValue(c):''}
        return normalized.map((c,i)=>doc.splitTextToSize(tableCellText(c),Math.max(10,widths[i]-rowPad*2)))
      }
      function drawRow(r,isHeader){
        const cellLines=makeCellLines(r)
        const h=Math.max(isHeader?28:28,...cellLines.map(lines=>lines.length*lineH+rowPad*2+4))
        need(h+1)
        let x=x0
        cellLines.forEach((lines,i)=>{
          doc.setDrawColor(0,0,0);doc.setLineWidth(0.45)
          doc.rect(x,y,widths[i],h)
          setF(isHeader?'bold':'normal',fontSize);doc.setTextColor(0,0,0)
          let yy=y+rowPad+11
          lines.forEach(l=>{doc.text(l,x+rowPad,yy);yy+=lineH})
          x+=widths[i]
        })
        y+=h
      }
      // Before drawing the header, ensure there is room for it plus at least
      // the first two data rows so the header is never orphaned at the bottom
      // of a page with the data continuing on the next.
      const guardH=28*(1+Math.min(rows.length,2))
      if(y+guardH>PH-BOTTOM)newPage()
      drawRow(headers,true)
      rows.forEach(r=>drawRow(r,false))
      y+=10
    }
    function parseDateAny(text){return matchResult(text,/Date(?: of [A-Za-z ]+)?\s*[:.]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,'—')}
    function parseTest1(text){
      const t=normResultText(text),flat=flatResultText(text)
      const mbess=resultSection(t,'mBESS',['VOMS:','COGNITIVE THOUGHT'])
      const voms=resultSection(t,'VOMS:',['COGNITIVE THOUGHT'])
      function v(label,section){return valueAfterLabel(section||t,label,'—')}
      function score(label){const m=flat.match(new RegExp(escapeRegExp(label)+'\\s*[:.]?\\s*(\\d+)\\s*(?:of|out of)\\s*(\\d+)','i'));return m?(m[1]+' of '+m[2]):'—'}
      function row(label){
        const re=new RegExp(escapeRegExp(label)+'\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)','i')
        const m=flat.match(re)
        return m?[label,m[1],m[2],m[3],m[4],m[5], label==='Baseline Symptoms'?matchResult(flat,/Baseline Symptoms\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+(.+?)\s+Pursuits/i,''):'']: [label,'—','—','—','—','—','']
      }
      function neuroCogNumberOnly(value){
        const raw=day2CleanExtractedValue(value)
        if(!day2IsPresentValue(raw)||raw==='—')return ''
        const m=raw.match(/-?\d+(?:\.\d+)?/)
        if(!m)return raw
        const n=Number(m[0])
        return Number.isFinite(n)?n.toFixed(1):m[0]
      }
      function neuroCogPercentile(value){
        const raw=day2CleanExtractedValue(value)
        if(!day2IsPresentValue(raw)||raw==='—')return ''
        const m=raw.match(/(\d+(?:\.\d+)?)(?:\s*(st|nd|rd|th|%))?/i)
        if(!m)return raw
        const num=m[1],suffix=(m[2]||'').toLowerCase()
        if(suffix&&suffix!=='%')return num+suffix
        const whole=Math.abs(Math.floor(Number(num)))
        const mod100=whole%100
        const ord=(mod100>=11&&mod100<=13)?'th':({1:'st',2:'nd',3:'rd'}[whole%10]||'th')
        return num+ord
      }
      function cog(name,nextLabels){
        const sec=resultSection(t,name,nextLabels)
        const avg=neuroCogNumberOnly(v('Baseline Average',sec))
        const rangeRaw=v('Range',sec)
        const range=day2IsPresentValue(rangeRaw)&&rangeRaw!=='—'?String(rangeRaw).replace(/[–—]/g,'-').replace(/\s*-\s*/g,' - ').trim():''
        const percentile=neuroCogPercentile(v('Percentile',sec))
        const rank=v('Rank',sec)
        const baselineCount=v('Baseline Count',sec)
        return {name,avg:avg,range:(name==='Memory (Cognitive)'||name==='Cued Stroop (Cognitive Thought)')?day2FormatMemoryCognitiveRange(range):range,percentile:percentile,rank:rank,baselineCount:baselineCount}
      }
      const phqSec=resultSection(t,'PHQ-9 Depression Score',['VALIDATED SYMPTOM QUESTIONNAIRE','GAD-7','OBJECTIVE'])
      const gadSec=resultSection(t,'GAD-7',['OBJECTIVE'])
      return {
        date:parseDateAny(t),
        total:v('Total Symptoms'),physical:v('Physical'),cognitive:v('Cognitive'),emotional:v('Emotional'),sleep:v('Sleep-Arousal'),
        phqScore:score('PHQ-9 Depression Score'),gadScore:score('GAD-7 General Anxiety Disorder Score'),
        phqProgressStatus:valueAfterLabel(phqSec,'Progress Status','—'),
        gadProgressStatus:valueAfterLabel(gadSec,'Progress Status','—'),
        mbess:{avg:v('Baseline Average',mbess),range:v('Range',mbess),percentile:v('Percentile',mbess),rank:v('Rank',mbess),baselineCount:v('Baseline Count',mbess)},
        voms:{avgConv:v('Average Convergence',voms),baseSymptoms:v('Baseline Symptoms',voms),maxProv:v('Max Provocation',voms),maxTotal:v('Max Total Symptoms',voms),
          rows:[row('Baseline Symptoms'),row('Pursuits'),row('Saccades Horizontal'),row('Saccades Vertical'),row('Convergence'),row('VOR Horizontal'),row('VOR Vertical'),row('Visual Motion Sensitivity')]},
        cognitiveRows:[
          cog('Memory (Cognitive)',['Reverse Number Counting','Cued Stroop','Reaction Time','Impulse Control','Inspection Time']),
          cog('Reverse Number Counting (Cognitive Thought)',['Cued Stroop','Reaction Time','Impulse Control','Inspection Time']),
          cog('Cued Stroop (Cognitive Thought)',['Reaction Time','Impulse Control','Inspection Time']),
          cog('Reaction Time (Cognitive Thought/ Cognitive Reaction Time)',['Impulse Control','Inspection Time']),
          cog('Impulse Control (Cognitive Thought/ Cognitive Reaction Time)',['Inspection Time']),
          cog('Inspection Time (Cognitive Reaction Time)',['$NEVER_MATCH$'])
        ]
      }
    }
    function renderTest1Result(source){
      if(!normResultText(day2SourceText(source))&&!source._parsed)return
      const r=day2ParseSwayTest1(source,{patient:p,data:data})
      if(source._parsed){
        const m=source._parsed
        if(day2IsPresentValue(m.symptomRows?.[0]?.[1]))r.total=m.symptomRows[0][1]
        if(day2IsPresentValue(m.symptomRows?.[1]?.[1]))r.physical=m.symptomRows[1][1]
        if(day2IsPresentValue(m.symptomRows?.[2]?.[1]))r.cognitive=m.symptomRows[2][1]
        if(day2IsPresentValue(m.symptomRows?.[3]?.[1]))r.emotional=m.symptomRows[3][1]
        if(day2IsPresentValue(m.symptomRows?.[4]?.[1]))r.sleep=m.symptomRows[4][1]
        if(day2IsPresentValue(m.phqScore))r.phqScore=m.phqScore
        if(day2IsPresentValue(m.gadScore))r.gadScore=m.gadScore
        if(r.mbess){
          if(day2IsPresentValue(m.mbessRows?.[0]?.[1]))r.mbess.avg=m.mbessRows[0][1]
          if(day2IsPresentValue(m.mbessRows?.[2]?.[1]))r.mbess.percentile=m.mbessRows[2][1]
          if(day2IsPresentValue(m.mbessRows?.[3]?.[1]))r.mbess.rank=m.mbessRows[3][1]
          if(day2IsPresentValue(m.mbessRows?.[4]?.[1]))r.mbess.baselineCount=m.mbessRows[4][1]
        }
        if(m.vomsRows)r.voms.rows=m.vomsRows
        if(m.cognitiveRows)r.cognitiveRows=m.cognitiveRows.map(row=>({name:row[0],avg:row[1],range:(row[0]==='Memory (Cognitive)'||row[0]==='Cued Stroop (Cognitive Thought)')?day2FormatMemoryCognitiveRange(row[2]):row[2],percentile:row[3],rank:row[4],baselineCount:row[5]}))
      }
      function resultKVPresent(label,value,opts){
        if(day2IsPresentValue(value))resultKV(label,value,opts||{})
      }
      const hasMbessResult=[r.mbess&&r.mbess.avg,r.mbess&&r.mbess.percentile,r.mbess&&r.mbess.rank,r.mbess&&r.mbess.baselineCount].some(day2IsPresentValue)
      resultHeading('VESTIBULAR AND NEUROCOGNITIVE TESTING',11)
      resultLabelDateLine('SYMPTOMS',initialExamSessionDate,{size:9.8,dateBold:false})
      resultKV('Total Symptoms',r.total,{size:9.6,space:0})
      resultKV('Physical',r.physical,{size:9.6,space:0})
      resultKV('Cognitive',r.cognitive,{size:9.6,space:0})
      resultKV('Emotional',r.emotional,{size:9.6,space:0})
      resultKV('Sleep-Arousal',r.sleep,{size:9.6,space:6})
      resultHeading('SUBJECTIVE:',10.5)
      resultLabelDateLine('VALIDATED SYMPTOM QUESTIONNAIRE',initialExamSessionDate,{size:9.8,dateBold:true})
      resultHeading('Depression',10)
      resultBoldText('Validated Symptom Questionnaire Depression: PHQ-9 (Patient Health Questionnaire-9)',9.6)
      resultBoldText('Depression associated with concussion.',9.5)
      resultLink('https://health.mil/News/Articles/2021/09/28/Mild-TBI-may-be-linked-to-Depression-Anxiety-and-PTSD-Studies-Show')
      resultBoldText('Peer-Reviewed PHQ-9 Validation Research:',9.5)
      resultLink('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1495268/')
      resultRichParagraph([{text:'PHQ-9 Depression Score: ',bold:true,size:12},{text:r.phqScore||'—',bold:false}],{size:12,space:4})
      resultKV('Progress Status',day2ProgressStatusForCategory(data.examCategory,r.phqProgressStatus),{size:9.6,space:8})
      resultLabelDateLine('VALIDATED SYMPTOM QUESTIONNAIRE',initialExamSessionDate,{size:9.8,dateBold:true})
      resultHeading('Anxiety',10)
      resultBoldText('Validated Symptom Questionnaire Anxiety: GAD-7 (Generalized Anxiety Disorder-7) Anxiety associated with concussion.',9.5)
      resultLink('https://health.mil/News/Articles/2021/09/28/Mild-TBI-may-be-linked-to-Depression-Anxiety-and-PTSD-Studies-Show')
      resultBoldText('Peer-Reviewed GAD-7 Validation Research:',9.5)
      resultLink('https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/410326#:~:text=A%20score%20of%2010%20or,depression%20on%20the%20PHQ%2D9.')
      resultRichParagraph([{text:'GAD-7 General Anxiety Disorder Score: ',bold:true,size:12},{text:r.gadScore||'—',bold:false}],{size:12,space:4})
      resultKV('Progress Status',day2ProgressStatusForCategory(data.examCategory,r.gadProgressStatus),{size:9.6,space:10})
      resultHeading('OBJECTIVE:',10.5)
      resultHeading('VESTIBULAR BALANCE TESTING',10)
      resultBoldText('Sway Medical Balance Application Accelerometer Device Modified Balance Error Scoring System (mBESS) (Sway Medical Balance Mobile Application) Date: '+initialExamSessionDate,9.5,8)
      resultBoldText('Sway Balance Application:',9.5)
      resultText('"RELIABILITY. Accuracy and consistency are both critical to the value of Sway\'s balance product. Reliability was shown in clinical studies analyzing test-retest variability in independent research studies of 30, 57, and 75 subjects. These results demonstrated strong test-retest reliability after an initial familiarization trial."',8.6,2)
      resultBoldText('Sway Medical FDA Cleared Type II Medical Device:',9.5)
      resultLink('https://www.accessdata.fda.gov/cdrh_docs/pdf12/K121590.pdf')
      resultBoldText('Sway Medical Balance Application Explanation:',9.5)
      resultLink('https://www.swaymedical.com/product/balance#:~:text=Accuracy%20and%20consistency%20are%20both,after%20an%20initial%20familiarization%20trial.')
      resultLink('https://www.swaymedical.com/product/balance')
      resultBoldText('Peer-Reviewed Validation Research for Sway Medical Balance:',9.5)
      resultLink('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4004118/')
      resultHeading('Vestibular Balance Outcomes Testing',9.8)
      resultBoldText('mBESS (Vestibular)',9.6)
      resultKVPresent('Baseline Average',r.mbess.avg,{size:9.3})
      resultKVPresent('Range',r.mbess.range,{size:9.3})
      resultKVPresent('Percentile',r.mbess.percentile,{size:9.3})
      resultKVPresent('Rank',r.mbess.rank,{size:9.3})
      resultKVPresent('Baseline Count',r.mbess.baselineCount,{size:9.3,space:8})
      resultHeading('VOMS:',9.8)
      resultKVPresent('Average Convergence',r.voms.avgConv,{size:9.3})
      resultKVPresent('Baseline Symptoms',r.voms.baseSymptoms,{size:9.3})
      resultKVPresent('Max Provocation',r.voms.maxProv,{size:9.3})
      resultKVPresent('Max Total Symptoms',r.voms.maxTotal,{size:9.3,space:10})
      resultTable(['','Headache','Dizziness','Nausea','Fogging','Total','Comments'],r.voms.rows,[82,82,82,82,82,82,92])
      resultHeading('COGNITIVE THOUGHT AND REACTION TIME TESTING',10)
      resultInline([{text:'Cognitive Thought Process and Reaction Time Outcomes Testing:',bold:false},{text:'        Date: '+initialExamSessionDate,bold:false}],9.2)
      resultBoldText('Sway Medical Cognitive Testing System Explanation: COGNITIVE TESTING: The Sway System assesses cognitive function with tests of visual processing, reaction time and memory.',9.2)
      resultLink('https://www.swaymedical.com/product/cognitive')
      resultBoldText('Peer-Reviewed Validation Research for Accuracy of Sway Medical Cognitive Mobile App:',9.2)
      resultLink('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8329324/')
      resultHeading('Neurocognitive Outcomes Testing',9.8)
      r.cognitiveRows.forEach(c=>{
        const hasActualCognitiveResult=[c.avg,c.percentile,c.rank].some(day2IsPresentValue)
        if(!hasActualCognitiveResult)return
        const displayedRange=(c.name==='Memory (Cognitive)'||c.name==='Cued Stroop (Cognitive Thought)')?day2FormatMemoryCognitiveRange(c.range):c.range
        resultBoldText(c.name+'.',9.4)
        resultKVPresent('Baseline Average',c.avg,{size:9.2})
        if(day2IsPresentValue(displayedRange))resultKV('Range',displayedRange,{size:9.2})
        resultKVPresent('Percentile',c.percentile,{size:9.2})
        resultKVPresent('Rank',c.rank,{size:9.2})
        resultKVPresent('Baseline Count',c.baselineCount,{size:9.2,space:6})
      })
      y+=4
    }
    function parseTest2(source){
      const parsed=day2ParseTest2(source,{patient:p,data:data,testDate:initialExamSessionDate})
      return {
        date:parsed.date||initialExamSessionDate,
        name:parsed.name,
        age:parsed.age,
        sex:parsed.sex,
        eyeLocation:parsed.eyeLocation,
        asymptomatic:parsed.asymptomatic,
        administrator:parsed.administrator,
        testType:parsed.testType,
        pulseLevel:parsed.pulseLevel,
        flashStatus:parsed.flashStatus,
        videoDuration:parsed.videoDuration,
        illuminationDelay:parsed.illuminationDelay,
        reflexScore:parsed.reflexScore,
        neuroCdsScore:parsed.neuroCdsScore,
        constrict:parsed.constrict,
        dilation:parsed.dilation,
        other:parsed.other
      }
    }
    function renderTest2Result(source,eyeType){
      if(!normResultText(day2Test2Text(source)))return
      const r=parseTest2(source)
      resultKV('Date of QP Exam',initialExamSessionDate,{size:9.6,space:2})
      resultHeading('QUANTITATIVE PUPILLOMETRY.',10.5)
      resultBoldText('Pupillometry Explanation from American Academy of Pediatrics:',10)
      resultLink('https://publications.aap.org/codingnews/article-abstract/doi/10.1542/pcco_book124_document003/28010/Pupillometry-in-Clinical-Care-New-Procedure-Code')
      resultText('"Pupillometry is a technology that objectively measures and documents the pupillary response to a specific light stimulus. The pupillometer offers reliable, noninvasive, rapid, and quantifiable measurements of ophthalmologic-specific autonomic nervous system function. Pupillometry results provide baseline measures from which to assess change with disease, trauma, and pharmacologic intervention. Existing literature suggests that pupillometry applicability may well extend beyond the eye. Some indications for pupillometry include use as a baseline test for patients participating in activities that are associated with head trauma and in subsequent assessment of head trauma."',10,4)
      resultBoldText('Validation Research of Quantitative Pupillometry Visual Objective Biomarkers for Acute Concussion:',10)
      resultLink('https://academic.oup.com/milmed/article/183/suppl_1/9/4959946')
      resultBoldText('Research Literature Review of Quantitative Pupillometry As A Diagnostic Aid:',10)
      resultLink('https://www.sciencedirect.com/science/article/pii/S1532046421000861')
      resultBoldText('Article Explaining Peer-Reviewed Validation Research of Reflex PLR As A Biomarker of Concussion:',10)
      resultLink('https://www.purdue.edu/newsroom/releases/2021/Q4/peer-reviewed-study-proves-reflex,-a-smartphone-app,-detects-concussion-biomarkers.html')
      resultBoldText('Peer-Reviewed Article of Reflex PLR Validation Research on The Pupillary Light Reflex as a Biomarker of Concussion:',10)
      resultLink('https://pubmed.ncbi.nlm.nih.gov/34685475/')
      y+=8
      resultHeading('Quantitative Pupillometry Test Results.',10.5)
      resultBoldText('Patient Information.',10.5)
      resultKV('Name',r.name,{size:10})
      resultKV('Age',r.age,{size:10})
      resultKV('Sex',r.sex,{size:10})
      resultKV('Eye Location',r.eyeLocation,{size:10})
      resultKV('Asymptomatic',r.asymptomatic,{size:10,space:8})
      resultBoldText('Test Information.',10.5)
      resultKV('Test Administrator',r.administrator,{size:10})
      resultKV('Test Type',r.testType,{size:10})
      resultKV('Pulse Level',r.pulseLevel,{size:10})
      resultKV('Flash Status',r.flashStatus,{size:10})
      resultKV('Video Duration',r.videoDuration,{size:10})
      resultKV('Illumination Delay',r.illuminationDelay,{size:10,space:8})
      resultBoldText('Analysis',10.5)
      if(day2IsPresentValue(r.reflexScore))resultText('Cognitive Age: '+r.reflexScore,10)
      if(day2IsPresentValue(r.neuroCdsScore))resultText('Neuro CDS Score: '+r.neuroCdsScore,10,8)
      function test2MetricPdfLine(m){
        const parts=[m[0]+':']
        if(day2IsPresentValue(m[1]))parts.push('R:   '+m[1])
        if(day2IsPresentValue(m[2]))parts.push('L:   '+m[2])
        if(day2IsPresentValue(m[3]))parts.push('Normative Range:   '+m[3])
        if(parts.length>1)resultText(parts.join('     '),10)
      }
      const constrictOut=day2Test2CleanRowsForOutput(r.constrict)
      const dilationOut=day2Test2CleanRowsForOutput(r.dilation)
      const otherOut=day2Test2CleanRowsForOutput(r.other)
      if(constrictOut.length){
        resultBoldText('Pupillary Constriction Results',10.5)
        constrictOut.forEach(test2MetricPdfLine)
        y+=5
      }
      if(dilationOut.length){
        resultBoldText('Dilation Results',10.5)
        dilationOut.forEach(test2MetricPdfLine)
        y+=5
      }
      if(otherOut.length){
        resultBoldText('Other Results',10.5)
        otherOut.forEach(test2MetricPdfLine)
        y+=5
      }
      y+=8
    }
    function renderMergedTest2Result(r,eyeDesc){
      resultKV('Date of QP Exam',initialExamSessionDate,{size:9.6,space:2})
      resultHeading('QUANTITATIVE PUPILLOMETRY.',10.5)
      resultBoldText('Pupillometry Explanation from American Academy of Pediatrics:',10)
      resultLink('https://publications.aap.org/codingnews/article-abstract/doi/10.1542/pcco_book124_document003/28010/Pupillometry-in-Clinical-Care-New-Procedure-Code')
      resultText('"Pupillometry is a technology that objectively measures and documents the pupillary response to a specific light stimulus. The pupillometer offers reliable, noninvasive, rapid, and quantifiable measurements of ophthalmologic-specific autonomic nervous system function. Pupillometry results provide baseline measures from which to assess change with disease, trauma, and pharmacologic intervention. Existing literature suggests that pupillometry applicability may well extend beyond the eye. Some indications for pupillometry include use as a baseline test for patients participating in activities that are associated with head trauma and in subsequent assessment of head trauma."',10,4)
      resultBoldText('Validation Research of Quantitative Pupillometry Visual Objective Biomarkers for Acute Concussion:',10)
      resultLink('https://academic.oup.com/milmed/article/183/suppl_1/9/4959946')
      resultBoldText('Research Literature Review of Quantitative Pupillometry As A Diagnostic Aid:',10)
      resultLink('https://www.sciencedirect.com/science/article/pii/S1532046421000861')
      resultBoldText('Article Explaining Peer-Reviewed Validation Research of Reflex PLR As A Biomarker of Concussion:',10)
      resultLink('https://www.purdue.edu/newsroom/releases/2021/Q4/peer-reviewed-study-proves-reflex,-a-smartphone-app,-detects-concussion-biomarkers.html')
      resultBoldText('Peer-Reviewed Article of Reflex PLR Validation Research on The Pupillary Light Reflex as a Biomarker of Concussion:',10)
      resultLink('https://pubmed.ncbi.nlm.nih.gov/34685475/')
      y+=8
      resultHeading('Quantitative Pupillometry Test Results.',10.5)
      resultBoldText('Patient Information.',10.5)
      resultKV('Name',r.name,{size:10})
      resultKV('Age',r.age,{size:10})
      resultKV('Sex',r.sex,{size:10})
      resultKV('Eye Location',r.eyeLocation,{size:10})
      resultKV('Asymptomatic',r.asymptomatic,{size:10,space:8})
      resultBoldText('Test Information.',10.5)
      resultKV('Test Administrator',r.administrator,{size:10})
      resultKV('Test Type',r.testType,{size:10})
      resultKV('Pulse Level',r.pulseLevel,{size:10})
      resultKV('Flash Status',r.flashStatus,{size:10})
      resultKV('Video Duration',r.videoDuration,{size:10})
      resultKV('Illumination Delay',r.illuminationDelay,{size:10,space:8})
      resultBoldText('Analysis',10.5)
      if(day2IsPresentValue(r.reflexScore))resultText('Cognitive Age: '+r.reflexScore,10)
      if(day2IsPresentValue(r.neuroCdsScore))resultText('Neuro CDS Score: '+r.neuroCdsScore,10,8)
      function test2MetricPdfLine(m){
        const parts=[m[0]+':']
        if(day2IsPresentValue(m[1]))parts.push('R:   '+m[1])
        if(day2IsPresentValue(m[2]))parts.push('L:   '+m[2])
        if(day2IsPresentValue(m[3]))parts.push('Normative Range:   '+m[3])
        if(parts.length>1)resultText(parts.join('     '),10)
      }
      const constrictOut=day2Test2CleanRowsForOutput(r.constrict)
      const dilationOut=day2Test2CleanRowsForOutput(r.dilation)
      const otherOut=day2Test2CleanRowsForOutput(r.other)
      if(constrictOut.length){resultBoldText('Pupillary Constriction Results',10.5);constrictOut.forEach(test2MetricPdfLine);y+=5}
      if(dilationOut.length){resultBoldText('Dilation Results',10.5);dilationOut.forEach(test2MetricPdfLine);y+=5}
      if(otherOut.length){resultBoldText('Other Results',10.5);otherOut.forEach(test2MetricPdfLine);y+=5}
      y+=8
    }
    function day2HearingIndication(results){
      const r=normalizeDay2EarResults(results)
      const values=[r.left,r.right].map(v=>String(v||'').toLowerCase())
      if(values.includes('significant hearing loss'))return 'Significant hearing loss indicated.'
      if(values.includes('hearing loss'))return 'Hearing loss indicated.'
      if(r.left&&r.right&&values.every(v=>v==='good hearing'))return 'No hearing loss indicated.'
      return '—'
    }
    function hasDay2EarSelection(results){
      const r=normalizeDay2EarResults(results)
      return !!(r.left||r.right||r.indication)
    }
    function renderTest3ResultFromSelections(results){
      const r=normalizeDay2EarResults(results)
      if(!hasDay2EarSelection(r))return
      resultHeading('OBJECTIVE',10.5)
      resultHeading('AUDITORY SCREENING TEST FOR HEARING LOSS Date: '+clean(initialExamSessionDate),10.5)
      resultText('Description: The patient is assessed using an online auditory screening test that yields one of three result choices: 1) Significant Hearing Loss; 2) Hearing loss; 3) Good hearing.',10.0,2)
      resultHeading('Auditory Screening Test for Hearing Loss Validation Research:',13)
      resultLink('https://www.shoebox.md/clinical-validation/')
      y+=12
      resultHeading('Results',10.5)
      resultKV('Left Ear',day2EarResultDisplay(r.left),{size:10})
      resultKV('Right Ear',day2EarResultDisplay(r.right),{size:10})
      if(data.examCategory!=='Final Examination')resultKV('Plan','Continue treatment, examination, and reporting as indicated.',{size:10,space:8})
      else y+=8
    }
    function renderTest3ResultFromPdf(file,index,total){
      if(!file||!file.text)return
      resultHeading('OBJECTIVE',10.5)
      const label=total>1?' PDF '+(index+1):''
      resultHeading('AUDITORY SCREENING TEST FOR HEARING LOSS'+label+' Date: '+clean(initialExamSessionDate),10.5)
      resultText('Description: The patient is assessed using an online auditory screening test that yields one of three result choices: 1) Significant Hearing Loss; 2) Hearing loss; 3) Good hearing.',10.0,2)
      resultHeading('Auditory Screening Test for Hearing Loss Validation Research:',13)
      resultLink('https://www.shoebox.md/clinical-validation/')
      y+=8
    }
    function drawUploadedDay2Results(){
      const test1Files=sortedDay2Test1Files(day2UploadedFiles('test1').filter(f=>f&&f.text))
      const test2Files=day2UploadedFiles('test2').filter(f=>f&&f.text)
      const test3Files=day2UploadedFiles('test3').filter(f=>f&&f.text)
      const earResults=normalizeDay2EarResults(data.test3EarResults)
      if(!test1Files.length&&!test2Files.length&&!test3Files.length&&!hasDay2EarSelection(earResults))return
      const test1Source=test1Files.length>1?mergeDay2Test1Files(test1Files):test1Files[0]
      if(test1Source)renderTest1Result(test1Source)
      if(day2ShouldMergeTest2(test2Files)){
        const merged=day2MergeTest2Results(test2Files)
        renderMergedTest2Result(merged,merged.eyeDesc)
      }else{
        test2Files.forEach((f,i)=>{
          if(test2Files.length>1)resultHeading('TEST 2 UPLOAD '+(i+1)+' — '+day2Test2EyeLabel(f),10.5)
          renderTest2Result(f,day2Test2EyeLabel(f))
        })
      }
      // One clean auditory section: prefer the manually selected ear results;
      // otherwise the uploaded Shoebox PDF (never dump its raw extracted text -
      // the actual PDF page is embedded separately in the FCR).
      if(hasDay2EarSelection(earResults))renderTest3ResultFromSelections(earResults)
      else test3Files.forEach((f,i)=>renderTest3ResultFromPdf(f,i,test3Files.length))
      y+=4
    }

    function day2AceFormState(){
      return (p&&p.ace&&p.ace.formState)?p.ace.formState:{inputs:{},selects:{},checks:{},icdCodes:[]}
    }
    function day2AceInput(id,def){
      const st=day2AceFormState()
      const v=st.inputs&&Object.prototype.hasOwnProperty.call(st.inputs,id)?st.inputs[id]:''
      if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim()
      if(p&&p.ace){
        if(id==='ptName'&&p.ace.patientName)return p.ace.patientName
        if(id==='doi'&&p.ace.dateOfInjury)return p.ace.dateOfInjury
      }
      if(p&&p.demographics){
        if(id==='ptName')return naturalPatientName(p)
        if(id==='doi')return p.demographics.doi||''
        if(id==='ptDOB')return p.demographics.dob||''
      }
      const el=document.getElementById(id)
      if(el&&el.value&&String(el.value).trim())return String(el.value).trim()
      return def||''
    }
    function day2AceSelect(id,def){
      const st=day2AceFormState()
      const v=st.selects&&Object.prototype.hasOwnProperty.call(st.selects,id)?st.selects[id]:''
      if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim()
      if(p&&p.demographics&&id==='ptGender')return p.demographics.gender||def||''
      const el=document.getElementById(id)
      if(el&&el.value&&String(el.value).trim())return String(el.value).trim()
      return def||''
    }
    function day2LocalPron(gender){
      if(gender==='Male')return{subj:'he',poss:'his',obj:'him'}
      if(gender==='Female')return{subj:'she',poss:'her',obj:'her'}
      return{subj:'they',poss:'their',obj:'them'}
    }
    function day2SavedPatientName(){
      return clean((p&&p.ace&&p.ace.patientName)||day2AceInput('ptName')||data.patientName||naturalPatientName(p)||'—')
    }
    function day2SavedDiagnosisLines(){
      const ace=p&&p.ace?p.ace:null
      if(ace&&Array.isArray(ace.diagnosisCodes)&&ace.diagnosisCodes.length)return ace.diagnosisCodes.map(clean)
      const st=day2AceFormState()
      const codes=Array.isArray(st.icdCodes)?st.icdCodes:[]
      return codes.length?codes.map(clean):[]
    }
    function day2SavedAssessmentRisks(){
      const st=day2AceFormState()
      return (st.checks&&Array.isArray(st.checks.assessRiskList))?st.checks.assessRiskList.map(clean).filter(Boolean):[]
    }
    function day2SavedImpression(){
      const imp=day2AceSelect('impression','std')
      if(imp==='custom')return clean(day2AceInput('customImp','—'))
      if(!imp||imp==='std')return 'Today the patient has demonstrated subjective and objective neurocognitive and vestibular findings associated with traumatic brain injury concussion. Further testing has been scheduled for a future date of service.'
      return clean(imp)
    }
    function day2SavedPrognosis(){
      const name=day2SavedPatientName()
      const pn=day2LocalPron(day2AceSelect('ptGender',''))
      const val=day2AceSelect('prognosis','')
      let txt='PT Name is expected to make good progress and recovery with few residuals. Based on their history and examination, it is reasonable to believe that their recovery will take about the same length of time as an average case of approximate age and health status with similar diagnoses. This assessment is subject to re-evaluation.'
      if(val==='guarded')txt='Prognosis is guarded. Patient presents with multiple risk factors that may prolong recovery. Close monitoring and re-evaluation will be ongoing.'
      else if(val&&val!=='custom')txt=val
      return clean(txt.replace(/PT Name/g,name).replace(/\btheirs\b/g,pn.poss).replace(/\btheir\b/g,pn.poss).replace(/\bthey\b/g,pn.subj))
    }
    function drawDay2AssessmentFromAce(){
      const ace=p&&p.ace?p.ace:null
      if(!ace&&!day2AceInput('ptName',''))return
      const name=day2SavedPatientName()
      const doi=clean((ace&&ace.dateOfInjury)||day2AceInput('doi')||(p&&p.demographics?p.demographics.doi:'')||'—')
      const injType=clean(day2AceSelect('injuryType','—')||'—')
      const pn=day2LocalPron(day2AceSelect('ptGender',p&&p.demographics?p.demographics.gender:''))
      const risks=day2SavedAssessmentRisks()
      const dxLines=day2SavedDiagnosisLines()
      y+=6
      resultHeading('ASSESSMENT',11)
      resultHeading('Impression',10)
      resultText(day2SavedImpression(),9.6,5)
      resultRichParagraph([
        {text:'Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Long-Term Recurring Episodes of Neuroinflammation and Neuroinflammatory Symptoms: ',bold:true,size:12},
        {text:risks.length?risks.join(', '):'None identified'}
      ],{size:12,space:6})
      resultHeading('Diagnosis',10)
      if(dxLines.length){dxLines.forEach(dx=>resultText(dx,9.6,2))}else{resultText('No diagnosis code selected',9.6,2)}
      y+=3
      resultHeading('Prognosis',10)
      resultText(day2SavedPrognosis(),9.6,5)
      resultHeading('Causation',10)
      resultText("Based on review of "+name+"'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between "+pn.poss+" injuries and the "+injType+" injury incident that occurred on "+doi+".",9.6,5)
      resultHeading('Medical Necessity',10)
      resultText('The care and treatment rendered to '+name+' has been medically necessary for the injuries sustained in the '+injType+' injury incident that occurred on '+doi+'.',9.6,5)
      resultHeading('Reasonableness',10)
      resultText('The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.',9.6,8)
    }
    function drawFinalExamCaseDischarge(){
      const ace=p&&p.ace?p.ace:null
      const name=day2SavedPatientName()
      const doi=clean((ace&&ace.dateOfInjury)||day2AceInput('doi')||(p&&p.demographics?p.demographics.doi:'')||'—')
      const injType=clean(day2AceSelect('injuryType','—')||'—')
      const pn=day2LocalPron(day2AceSelect('ptGender',p&&p.demographics?p.demographics.gender:''))
      const risks=day2SavedAssessmentRisks()
      const dxLines=day2SavedDiagnosisLines()
      const dobRaw=data.dob||(p&&p.demographics?p.demographics.dob:'')||''
      const dobStr=clean(dobRaw)||'—'
      // Calculate age
      let age='—'
      if(dobRaw&&dobRaw!=='—'){
        const dobD=new Date(dobRaw)
        const refDate=data.sessionDate?new Date(data.sessionDate):new Date()
        if(!isNaN(dobD)){
          let a=refDate.getFullYear()-dobD.getFullYear()
          const m=refDate.getMonth()-dobD.getMonth()
          if(m<0||(m===0&&refDate.getDate()<dobD.getDate()))a--
          if(a>=0&&a<130)age=String(a)
        }
      }
      // Date of Initial DOS = ACE date of service or initial exam date
      const initialDOS=day2FormatAnyDate(p?.ace?.dateOfService||'')||day2FormatAnyDate(p?.initialExam?.aceDateOfService||'')||day2FormatAnyDate(p?.initialExam?.sessionDate||'')||'—'
      // Neurocognitive Exam Report Dates: initial exam + all re-exams + final exam session dates
      const examDates=[]
      if(p?.initialExam?.sessionDate)examDates.push(day2FormatAnyDate(p.initialExam.sessionDate))
      if(Array.isArray(p?.reExams)){p.reExams.forEach(rx=>{if(rx.sessionDate)examDates.push(day2FormatAnyDate(rx.sessionDate))})}
      // Final exam date last (current final exam being generated, or saved finalExam)
      const finalExamDate=day2FormatAnyDate(p?.finalExam?.sessionDate||data.sessionDate||'')
      if(finalExamDate)examDates.push(finalExamDate)
      const examReportDates=examDates.filter(Boolean).join(', ')||'—'
      const dischargeDate=day2FormatAnyDate(p?.dischargeDate||'')||'—'
      // Auto-computed: ACE (1) + Re-Exams + Final Exam (1) + Daily Notes
      const computedDates=computeTotalDatesOfService(p,{includeFinal:true})
      const totalDates=clean(computedDates?String(computedDates):(data.totalDates||'—'))
      y+=6
      resultHeading('CASE DISCHARGE SUMMARY',11)
      y+=2
      // Patient / DOB / Age on one line
      need(16)
      setF('bold',12);doc.setTextColor(0,0,0)
      doc.text('Patient: ',DAY2_TABLE_X,y)
      let cx=DAY2_TABLE_X+doc.getTextWidth('Patient: ')
      setF('normal',12);doc.text(name,cx,y)
      cx+=doc.getTextWidth(name+'   ')
      setF('bold',12);doc.text('Date of Birth:',cx,y)
      cx+=doc.getTextWidth('Date of Birth:')
      setF('normal',12);doc.text(dobStr,cx,y)
      cx+=doc.getTextWidth(dobStr+'   ')
      setF('bold',12);doc.text('Age:',cx,y)
      cx+=doc.getTextWidth('Age:')
      setF('normal',12);doc.text(age,cx,y)
      y+=16
      // Remaining discharge info lines
      function dLine(label,value){
        need(16)
        setF('bold',12);doc.setTextColor(0,0,0)
        doc.text(label,DAY2_TABLE_X,y)
        const lw=doc.getTextWidth(label)
        const val=clean(value)
        const avail=Math.max(100,DAY2_TABLE_W-lw)
        const valLines=doc.splitTextToSize(val,avail,{fontSize:12,font:'times',fontStyle:'normal'})
        setF('normal',12)
        if(valLines.length){
          doc.text(valLines[0],DAY2_TABLE_X+lw,y)
          for(let i=1;i<valLines.length;i++){y+=14;need(14);doc.text(valLines[i],DAY2_TABLE_X,y)}
        }
        y+=16
      }
      const noFollowup=isPatientAceNoFollowup(p)
      dLine('Date of Injury:',doi)
      dLine('Date of Initial DOS:',initialDOS)
      // Exam Report Dates line is omitted for no-follow-up cases.
      if(!noFollowup)dLine('Neurocognitive and Vestibular Exam Report Dates:',examReportDates)
      dLine('Discharge Date:',dischargeDate)
      dLine('Total Dates of service:',totalDates)
      y+=4
      // Final Status - short discharge text for no-follow-up, full text otherwise.
      const finalStatusText=noFollowup
        ?'Discharged. No Concussion.'
        :'Maximum static medical improvement attained. Functional goals and ADL goals have been achieved. Patient is now discharged from active care. Advised patient to return if symptoms recur and advised to continue home care recommendations.'
      resultRichParagraph([{text:'Final Status:   ',bold:true,size:12},{text:finalStatusText}],{size:12,space:8})
      // Risk Factors line is omitted for no-follow-up cases.
      if(!noFollowup)resultRichParagraph([{text:'Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Chronic Episodes of Neuroinflammation and Neuroinflammatory Symptoms: ',bold:true,size:12},{text:risks.length?risks.join(', '):'None identified'}],{size:12,space:6})
      // Diagnosis
      resultHeading('Diagnosis',10)
      if(dxLines.length){dxLines.forEach(dx=>resultText(dx,9.6,2))}else{resultText('No diagnosis code selected',9.6,2)}
      y+=3
      // Causation
      resultHeading('Causation',10)
      resultText("Based on review of "+name+"'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between "+pn.poss+" injuries and the "+injType+" injury incident that occurred on "+doi+".",9.6,5)
      // Medical Necessity
      resultHeading('Medical Necessity',10)
      resultText('The care and treatment rendered to '+name+' has been medically necessary for the injuries sustained in the '+injType+' injury incident that occurred on '+doi+'.',9.6,5)
      // Reasonableness
      resultHeading('Reasonableness',10)
      resultText('The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.',9.6,8)
    }
    function drawDay2TreatmentPlanOfCare(){
      need(150)
      resultHeading('PLAN- TREATMENT PLAN OF CARE',11)
      const planSize=12
      // No-follow-up: the patient is discharged, so the plan collapses to a single
      // recommendation line.
      if(isPatientAceNoFollowup(p)){
        resultRichParagraph([{text:'Recommendation: ',bold:true,size:12},{text:'No follow-up.'}],{size:planSize,space:8})
        return
      }
      resultRichParagraph([{text:'Cognitive Therapy: ',bold:true,size:12},{text:'Increase stimulation of dysfunctional brain functions particularly reaction time, immediate memory, delayed memory, response inhibition, attention. 3 visits per week for 4 weeks followed by re-evaluation, continuation determined by re-evaluation.'}],{size:planSize,space:2})
      resultRichParagraph([{text:'Neuromuscular Re-education: ',bold:true,size:12},{text:'rehabilitation of vestibular and/or brain-based balance, movement, coordination, kinesthetic sense, posture and proprioception particularly eye movement and balance in order to improve function. Frequency: 3 visits per week for 4 weeks followed by re-evaluation, continuation determined by re-evaluation.'}],{size:planSize,space:2})
      resultRichParagraph([{text:'Therapeutic Exercise: ',bold:true,size:12},{text:'3 visit per week for 4 weeks. Frequency: 3 visits per week for 4 weeks followed by re- evaluation, continuation determined by re-evaluation.'}],{size:planSize,space:2})
      resultRichParagraph([{text:'Tx. Effectiveness: ',bold:true,size:12},{text:'Overall effectiveness of ongoing treatment for this complaint will continue to be evaluated by analyzing objective and subjective findings. .'}],{size:planSize,space:2})
      resultRichParagraph([{text:'Home/Self Care: ',bold:true,size:12},{text:'The patient was instructed to continue home care recommendations.'}],{size:planSize,space:14})
      resultRichParagraph([{text:'Recommendation: ',bold:true,size:12},{text:'Continue Treatment Plan.'}],{size:planSize,space:8})
    }


    drawHeader()
    drawPatientInfoTable()
    y=FIRST_PATIENT_TABLE_TOP+FIRST_PATIENT_TABLE_H+14
    drawInitialExamOpeningText()
    drawUploadedDay2Results()
    const examCat=data.examCategory||'Day 2'
    if(examCat==='Final Examination'){
      drawFinalExamCaseDischarge()
    } else {
      drawDay2AssessmentFromAce()
      drawDay2TreatmentPlanOfCare()
    }
    addFooterPagination()
    const examCatSlug=examCat==='Final Examination'?'Final_Exam':examCat==='Re-Examination'?'Re_Exam':'Initial_Exam'
    const legacyFname='CTG_'+examCatSlug+'_'+clean(data.patientName).replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf'
    if(opts&&opts.returnDoc){if(btn){btn.innerHTML=originalHtml;btn.disabled=false}return doc}
    doc.save(legacyFname)
    ctgAuditExport(patientId,'exam_pdf')
    showToast(examCat+' PDF downloaded ✓')
    return
    heading('INITIAL EXAMINATION RESULTS')
    metricGrid([
      ['ID / Medical Record #',data.medicalRecordNo],['Gender',data.gender],['Day 1 Score',data.aceScore],['Report Sources',data.sources],['Saved Date',data.savedDisplay]
    ])

    const sw=data.sway||SWAY_DATA
    heading('SWAY MEDICAL - NEUROCOGNITIVE AND BALANCE ASSESSMENT')
    metricGrid([['Test Date',sw.testDate],['Profile ID',sw.profileId],['Assessment Type',sw.assessmentType]])
    subheading('Symptom Inventory')
    metricGrid([['Total Symptom Score',sw.symptomTotal],['Physical',sw.physical],['Cognitive',sw.cognitiveSymptoms],['Emotional',sw.emotional],['Sleep-Arousal',sw.sleepArousal]])
    const maxRows=Math.max((sw.physicalItems||[]).length,(sw.otherItems||[]).length)
    const symRows=[]
    for(let i=0;i<maxRows;i++){
      const pItem=(sw.physicalItems||[])[i]||['','']
      const oItem=(sw.otherItems||[])[i]||['','','']
      symRows.push([pItem[0],pItem[1],oItem[0],oItem[1],oItem[2]])
    }
    table(['Physical Symptom','Score','Other Symptom','Score','Category'],symRows,[145,45,160,45,145])
    subheading('Balance - mBESS')
    const bal=sw.balance||{}
    metricGrid([['Composite Score',bal.score],['Percentile',bal.percentile==null?'—':String(bal.percentile)],['Interpretation',bal.interpretation],['Baseline',bal.baseline],['Range',bal.range],['Consistency',bal.consistency],['Test Count',bal.testCount]])
    table(['Sub-Test','Score'],asRows(bal.subtests),[350,190])
    subheading('Cognitive Performance')
    table(['Measure','Score','Percentile','Interpretation','Baseline','Range'],(sw.cognitive||[]).map(c=>[c.name,c.score,c.percentile==null?'—':String(c.percentile),c.interp,c.baseline,c.range]),[120,70,70,100,90,90])
    subheading('VOMS - Vestibular/Ocular Motor Screening')
    table(['Test','Headache','Dizziness','Nausea','Fogginess','Total'],asRows((sw.voms||{}).rows),[180,72,72,72,72,72])
    metricGrid([['Average Convergence',(sw.voms||{}).avgConvergence],['Baseline Symptoms',(sw.voms||{}).baselineSymptoms],['Max Provocation',(sw.voms||{}).maxProvocation],['Max Total Symptoms',(sw.voms||{}).maxTotalSymptoms]])
    subheading('Symptom Surveys')
    metricGrid([['PHQ-9 Total',(sw.surveys||{}).phq9?.total],['PHQ-9 Severity',(sw.surveys||{}).phq9?.severity],['GAD-7 Total',(sw.surveys||{}).gad7?.total],['GAD-7 Severity',(sw.surveys||{}).gad7?.severity]])
    if((sw.history||[]).length){
      subheading('Recovery Trend')
      table(['Test Date','Symptom Total','mBESS','PHQ-9','GAD-7','VOMS Max Total'],asRows(sw.history),[90,90,90,90,90,90])
    }

    const rf=data.reflex||REFLEX_DATA
    heading('REFLEX TELEHEALTH - PUPILLARY LIGHT REFLEX (PLR)')
    metricGrid([['Test Date',rf.testDate],['Administrator',rf.administrator],['Test Type',rf.testType],['Pulse Level',rf.pulseLevel],['Flash',rf.flash],['Patient ID',rf.patientId],['Concussion Date',rf.concussionDate],['Asymptomatic',rf.asymptomatic],['Cognitive Age',rf.cognitiveAge],['Neuro CDS - Right',rf.neuroCDS?.r],['Neuro CDS - Left',rf.neuroCDS?.l]])
    subheading('Detection')
    table(['Finding','Result'],asRows(rf.detection),[270,270])
    subheading('Constrict Results')
    table(['Metric','Right Eye','Left Eye','Normative Data'],asRows(rf.constrict),[200,110,110,120])
    subheading('Dilation Results')
    table(['Metric','Right Eye','Left Eye','Normative Data'],asRows(rf.dilation),[200,110,110,120])
    subheading('Other Results')
    table(['Metric','Right Eye','Left Eye','Normative Data'],asRows(rf.other),[200,110,110,120])

    const sh=data.shoebox||SHOEBOX_DATA
    heading('SHOEBOX - HEARING SCREENING')
    metricGrid([['Test ID',sh.testId],['Overall Result',sh.result],['Left Ear Result',sh.ears?.left?.result],['Right Ear Result',sh.ears?.right?.result]])
    table(['Ear','Significant Loss Zone','Loss Zone','Marker','Result'],[
      ['Left',String(sh.ears?.left?.sig??'—'),String(sh.ears?.left?.loss??'—'),String(sh.ears?.left?.marker??'—'),sh.ears?.left?.result],
      ['Right',String(sh.ears?.right?.sig??'—'),String(sh.ears?.right?.loss??'—'),String(sh.ears?.right?.marker??'—'),sh.ears?.right?.result]
    ],[80,120,100,80,160])

    addFooterPagination()
    const fname='CTG_Initial_Exam_'+clean(data.patientName).replace(/\s+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf'
    doc.save(fname)
    ctgAuditExport(patientId,'exam_pdf')
    showToast('Day 2 Exam PDF downloaded ✓')
  }catch(e){console.error(e);showToast('Day 2 Exam PDF error: '+e.message,'err')}
  finally{if(btn){btn.innerHTML=originalHtml;btn.disabled=false}}
}




/* ---------- Patient registration, lists, pending ACE workflow ---------- */
const PATIENT_STORE_KEY='ctg_portal_patients_v1'
let ctgPatients=[]
let selectedPatientId=null
let patientListSearchQuery=''
/* Which slice of the roster the Patient List shows: the working list (active),
   the archive (inactive), or everything together. */
let patientListView='active' // 'active' | 'inactive' | 'all'
let patientDetailActiveTab='overview'
let patientReExamRecordsVisible={}
let currentAcePatientId=null
let modalContext={patientId:null,section:null}

// Durable storage. Uploaded PDFs (base64) easily exceed the ~5MB localStorage
// quota, so the authoritative copy lives in IndexedDB (large quota). localStorage
// is kept only as a fast synchronous cache for instant first paint.
const IDB_NAME='ctg_portal_db', IDB_STORE='kv'
function idbOpen(){
  return new Promise((resolve,reject)=>{
    try{
      const req=indexedDB.open(IDB_NAME,1)
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE)}
      req.onsuccess=()=>resolve(req.result)
      req.onerror=()=>reject(req.error)
    }catch(e){reject(e)}
  })
}
function idbSet(key,value){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readwrite')
    tx.objectStore(IDB_STORE).put(value,key)
    tx.oncomplete=()=>{db.close();resolve()}
    tx.onerror=()=>{db.close();reject(tx.error)}
  }))
}
function idbGet(key){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readonly')
    const req=tx.objectStore(IDB_STORE).get(key)
    req.onsuccess=()=>{db.close();resolve(req.result)}
    req.onerror=()=>{db.close();reject(req.error)}
  }))
}
function idbDelete(key){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete=()=>{db.close();resolve()}
    tx.onerror=()=>{db.close();reject(tx.error)}
  })).catch(e=>console.warn('IndexedDB delete failed',e))
}
const _patientSaveQueues={}
let _patientSaveTimer=null
const _deletedPatientIds=new Set()
// id -> deep copy of the record as it looked when the save was requested.
const _pendingPatientSaves=new Map()
// id -> { section: json } as last confirmed BY THE SERVER, used to work out
// which parts this client actually changed.
const _patientBaseline=new Map()

/* Sections sent independently. Anything not listed travels with "core".      */
/* 'documents' is not in this list. The /full PUT ignores the documents
   section and uploads save through their own endpoint, so including it only
   bloated every patient save with megabytes of base64 the server threw away,
   which is what pushed large uploads past the 12 MB body limit. */
const PATIENT_SECTIONS=['ace','initialExam','reExams','finalExam','dailyNotes',
  'intake','billing','comments']
const PATIENT_SCALARS=['demographics','notes','inactive','inactiveSince','dischargeDate',
  'adminDischarged','pendingAce','aceComplete','pregnancy','notesPatientId']

function _sectionSnapshot(p){
  const out={}
  PATIENT_SECTIONS.forEach(k=>{out[k]=JSON.stringify(p[k]===undefined?null:p[k])})
  // Each status flag is compared on its own. Bundling them with demographics
  // meant someone editing a phone number resent their stale copy of
  // aceComplete and undid a colleague's just-completed ACE.
  PATIENT_SCALARS.forEach(k=>{out['@'+k]=JSON.stringify(p[k]===undefined?null:p[k])})
  return out
}
// Called after any read from the server, so "changed" means changed since the
// server last told us what it holds.
function notePatientBaseline(p){ if(p&&p.id)_patientBaseline.set(p.id,_sectionSnapshot(p)) }

function buildPatientDelta(p){
  const now=_sectionSnapshot(p)
  const base=_patientBaseline.get(p.id)
  const payload={id:p.id}
  let changed=false
  if(!base)changed=true            // never seen by the server: send everything
  PATIENT_SCALARS.forEach(k=>{
    if(!base||base['@'+k]!==now['@'+k]){
      payload[k]=p[k]===undefined?null:p[k]
      changed=true
    }
  })
  PATIENT_SECTIONS.forEach(k=>{
    if(!base||base[k]!==now[k]){
      payload[k]=p[k]===undefined?null:p[k]
      changed=true
    }
  })
  // The server needs the names to resolve/validate the record on an insert.
  if(!payload.demographics)payload.demographics=p.demographics
  return changed?payload:null
}

const _patientLocalWriteAt=new Map()
function notePatientLocalWrite(id){ if(id)_patientLocalWriteAt.set(id,Date.now()) }

const _aceFormBaseVersion=new Map()
function noteAceFormVersion(id,v){ if(id)_aceFormBaseVersion.set(id,(v===undefined?((getPatient(id)||{}).aceVersion||0):v)) }

function persistPatients(){
  ctgPatients.forEach(p=>{
    if(_deletedPatientIds.has(p.id))return
    const delta=buildPatientDelta(p)
    if(!delta)return                       // nothing this client changed
    notePatientLocalWrite(p.id)
    const prior=_pendingPatientSaves.get(p.id)
    // Merge with an unsent delta so a rapid second edit can't drop the first.
    _pendingPatientSaves.set(p.id, prior?Object.assign({},prior,delta):delta)
  })
  clearTimeout(_patientSaveTimer)
  _patientSaveTimer=setTimeout(flushPatientSaves,400)
}
const PATIENT_OUTBOX_KEY='ctg_patient_outbox'
const PATIENT_SAVE_MAX_ATTEMPTS=5

/* One outbox per account (CTG-SEC-071). It used to be one per browser and was
   replayed under whoever signed in next, so one person's unsent changes were
   saved - and audited - as another's. */
function outboxKey(){const me=ctgCurrentUserId();return me?PATIENT_OUTBOX_KEY+':'+me:''}
function saveOutbox(){
  try{
    const key=outboxKey(); if(!key)return
    const o={}
    _pendingPatientSaves.forEach((v,k)=>{o[k]=v})
    if(Object.keys(o).length)localStorage.setItem(key,JSON.stringify(o))
    else localStorage.removeItem(key)
  }catch(e){/* quota or private mode - the in-memory copy still applies */}
}
function clearOutbox(){try{const key=outboxKey();if(key)localStorage.removeItem(key)}catch(e){}}
window.ctgClearPatientOutbox=clearOutbox
// Called by sign-out and idle logoff (ctg-auth.js) just before the page reloads.
window.ctgSavePatientOutbox=saveOutbox

// Replayed on startup so work interrupted by a crash or closed tab still lands.
function restoreOutbox(){
  const key=outboxKey(); if(!key)return false
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}
  const mine=read(key)||{}
  /* An outbox written before they were per account has no owner on record. It
     is replayed once, as it always was, rather than losing the work in it. */
  const older=read(PATIENT_OUTBOX_KEY)
  if(older){try{localStorage.removeItem(PATIENT_OUTBOX_KEY)}catch(e){}}
  const o=Object.assign({},older||{},mine)
  if(!Object.keys(o).length)return false
  Object.keys(o).forEach(id=>{if(!_pendingPatientSaves.has(id))_pendingPatientSaves.set(id,o[id])})
  return true
}
window.ctgRestorePatientOutbox=function(){
  if(!restoreOutbox())return
  showToast('Recovering unsaved patient changes from your last session…','ok')
  flushPatientSaves()
}

// Non-retryable: the payload itself is wrong or not permitted, so trying again
// would just fail identically. Everything else (offline, 5xx, timeout) retries.
function isPermanentSaveError(e){
  const st=e&&e.status
  return st===400||st===403||st===404||st===409||st===413||st===422
}
/* 401 is not a bad payload - the session expired underneath a perfectly good
   save. Retrying against a dead session just burns the attempt budget, so the
   work is parked in the buffer instead and replayed after the next sign-in. */
function isSessionGoneError(e){ return (e&&e.status)===401 }

function flushPatientSaves(){
  clearTimeout(_patientSaveTimer)
  saveOutbox()
  _pendingPatientSaves.forEach((payload,id)=>{
    if(_deletedPatientIds.has(id)){_pendingPatientSaves.delete(id);saveOutbox();return}
    // Parked awaiting a human decision (see onAceSaveConflict). Re-sending
    // would only 409 again and bury the user in toasts.
    if(payload.__conflict)return
    if(payload.__inflight)return                 // already being written
    payload.__inflight=true
    const attempt=(payload.__attempt||0)+1
    payload.__attempt=attempt
    const body=Object.assign({},payload)
    delete body.__inflight; delete body.__attempt; delete body.__conflict; delete body.__force
    /* Concurrency token: the version this FORM was built from. The server
       refuses the write if the stored Day 1 has moved on since, so a second
       tab or device cannot erase answers it never saw. */
    if(body.ace!==undefined&&body.ace!==null&&_aceFormBaseVersion.has(id))body.aceBaseVersion=_aceFormBaseVersion.get(id)
    // Set only by an explicit answer to the conflict prompt, never automatically.
    if(payload.__force)body.aceForceOverwrite=true
    body.fullyLoaded=!!(getPatient(id)||{}).fullyLoaded
    const prior=_patientSaveQueues[id]||Promise.resolve()
    _patientSaveQueues[id]=prior.then(()=>{
      if(_deletedPatientIds.has(id))return null
      return window.ctgApiFetch('/api/patients/'+encodeURIComponent(id)+'/full',{method:'PUT',body:JSON.stringify(body)})
    })
      .then(res=>{
        // Baseline from what the server actually stored, not from what we sent.
        if(res&&res.patient)notePatientBaseline(migratePatientRecords([res.patient])[0])
        // The server drops a RecoverArc ID it refuses and saves the rest; put
        // back the one on file so the screen matches what was stored.
        if(res&&res.patient&&Array.isArray(res.ignored)&&res.ignored.some(x=>x&&x.field==='notesPatientId')){
          const lp=getPatient(id); if(lp)lp.notesPatientId=res.patient.notesPatientId||''
          const why=res.ignored.find(x=>x.field==='notesPatientId').reason
          showToast(why==='invalid'
            ?'The RecoverArc ID was not saved: use letters, numbers and - _ . : only, starting with a letter or number. Everything else was saved.'
            :'The RecoverArc ID was not saved: your account cannot change it. Everything else was saved.','err')
        }
        // Chart fields this account cannot change are dropped the same way
        // (CTG-SEC-072): put back what is on file, or every later save would
        // send the refused change again.
        const refusedFields=res&&res.patient&&Array.isArray(res.ignored)?res.ignored.filter(x=>x&&x.field&&x.field!=='notesPatientId').map(x=>x.field):[]
        if(refusedFields.length){
          const lp=getPatient(id), stored=migratePatientRecords([res.patient])[0]||{}
          const LABEL={demographics:'patient details','demographics.lawFirm':'law firm',notes:'notes',inactive:'inactive status',inactiveSince:'inactive status',
            dischargeDate:'discharge date',adminDischarged:'discharge status',pendingAce:'Day 1 pending status',aceComplete:'Day 1 status',pregnancy:'pregnancy status'}
          if(lp)refusedFields.forEach(f=>{
            if(f==='demographics.lawFirm')lp.demographics={...(lp.demographics||{}),lawFirm:(stored.demographics||{}).lawFirm||''}
            else if(stored[f]===undefined)delete lp[f]
            else lp[f]=stored[f]
          })
          const names=[...new Set(refusedFields.map(f=>LABEL[f]||f))]
          showToast('Not saved: '+names.join(', ')+'. Your account cannot change '+(names.length===1?'it':'them')+'. Everything else was saved.','err')
        }
        // The write was accepted, so the form now rests on the NEW version.
        if(res&&res.patient&&typeof res.patient.aceVersion==='number'){
          noteAceFormVersion(id,res.patient.aceVersion)
          /* ...and so does the patient record itself. Our own saves never refresh our
             own list, so without this the record kept the version it was loaded with.
             Re-opening the Day 1 then took that old number as its base, and the next
             save was refused as a conflict with this clinician's own earlier save. */
          const lp=getPatient(id); if(lp)lp.aceVersion=res.patient.aceVersion
        }
        payload.__force=false   // One override, for the save the user approved. Only forget the snapshot once
// it is actually stored: until then it is the only copy protecting this
// record from a realtime refresh. The server's copy changed just now, so a
// refresh already in flight predates it and cannot be trusted here.
        notePatientLocalWrite(id)
        if(_pendingPatientSaves.get(id)===payload)_pendingPatientSaves.delete(id)
        saveOutbox()
      })
      .catch(e=>{
        payload.__inflight=false
        console.error('Could not save patient '+id+' (attempt '+attempt+')',e)
        const p=getPatient(id)
        const who=p?naturalPatientName(p):'patient'
        if(isSessionGoneError(e)){
          // Held on this device; ctgRestorePatientOutbox() sends it after login.
          payload.__attempt=0
          showToast('Your session expired before '+who+' could be saved. Your work is safe on this device — sign in again and it will be saved automatically.','err')
          return
        }
        /* Someone else saved this Day 1 while this form was being filled in.
           Handled before the generic permanent-error branch so the clinician
           gets the real explanation and a choice, not 'could not save'. */
        if(e&&e.status===409&&e.body&&e.body.code==='ace_conflict'){
          onAceSaveConflict(id,payload,e.body)
          return
        }
        if(isPermanentSaveError(e)||attempt>=PATIENT_SAVE_MAX_ATTEMPTS){
          showToast('Could not save '+who+': '+((e&&e.message)||'server error')
            +'. Your changes are still held on this device and will retry — do not close this tab.','err')
          return
        }
        // Back off: 1s, 2s, 4s, 8s.
        const delay=Math.min(8000,1000*Math.pow(2,attempt-1))
        showToast('Saving '+who+' failed — retrying in '+Math.round(delay/1000)+'s…','err')
        setTimeout(flushPatientSaves,delay)
      })
  })
}

let _aceConflictOpen=false
async function onAceSaveConflict(id,payload,info){
  payload.__conflict=true
  payload.__inflight=false
  const p=getPatient(id)
  const who=p?naturalPatientName(p):'this patient'
  const when=info&&info.savedAt?new Date(info.savedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''
  showDraftStatus('Not saved - changed elsewhere')
  if(_aceConflictOpen)return                 // one prompt, however many sections queued
  _aceConflictOpen=true
  const keepMine=await ctgConfirm(
    'The Day 1 for '+who+' was saved from another tab or device'+(when?' at '+when:'')+
    ', so it now holds different answers.\n\n'+
    'Your work is still on this screen and has NOT been lost - it simply has not been stored yet.\n\n'+
    'Save your version over the other one? The version you replace is kept and can be recovered.',
    {title:'This Day 1 changed somewhere else',okLabel:'Save mine over it',danger:true}
  )
  _aceConflictOpen=false
  if(!keepMine){
    showToast('Nothing was overwritten. Your changes are still on this screen. Close this Day 1 wherever else it is open, then save again.','err')
    return
  }
  /* A human decision to overwrite whatever is stored now, not to rebase onto
     the version we were told about: by the time they answer, a third save may
     have landed, and rebasing would refuse them again and re-prompt in a loop.
     The server archives whatever it replaces. */
  payload.__force=true
  payload.__conflict=false
  payload.__attempt=0
  flushPatientSaves()
}

/* Awaitable flush, used by logout so a session never ends on top of unsaved
   clinical work. Resolves once every queued write has settled (or after a short
   ceiling, so a hung request can't block sign-out indefinitely). */
window.ctgFlushPatientSaves=function(opts){
  flushPatientSaves()
  if(!(opts&&opts.wait))return Promise.resolve()
  const inflight=Object.keys(_patientSaveQueues).map(k=>_patientSaveQueues[k]).filter(Boolean)
  return Promise.race([
    Promise.all(inflight.map(pr=>Promise.resolve(pr).catch(()=>{}))),
    new Promise(r=>setTimeout(r,4000))
  ])
}

// Warn before losing work that hasn't reached the server yet.
window.addEventListener('beforeunload',function(ev){
  if(!_pendingPatientSaves.size)return
  flushPatientSaves()
  ev.preventDefault()
  ev.returnValue=''
  return ''
})

// Last-ditch write when the tab is being hidden or closed, so an accidental
// exit inside the debounce window doesn't lose the work.
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushPatientSaves()})
window.addEventListener('pagehide',flushPatientSaves)
async function loadPatientStore(){
  // Taken before the request. Anything this client writes or commits after this
  // instant is newer than whatever the response can contain.
  const requestedAt=Date.now()
  let loaded=false
  try{
    const d=await window.ctgApiFetch('/api/patients')
    const fresh=migratePatientRecords(d.patients||[])
    // Keep the live in-memory record for any patient whose edits haven't been
    // written yet. Overwriting it here is the other half of how a saved ACE
    // disappeared: the refresh dropped the edit before the save could send it.
    const local={}
    ctgPatients.forEach(p=>{local[p.id]=p})
    fresh.forEach(notePatientBaseline)
    ctgPatients=fresh.map(p=>{
      const unsent=_pendingPatientSaves.has(p.id)&&local[p.id]
      const beingEdited=_aceDirtyFor&&_aceDirtyFor===p.id&&local[p.id]
      // Written or committed since this request went out -> the response is
      // older than what we hold, whatever it says.
      const outran=((_patientLocalWriteAt.get(p.id)||0)>=requestedAt)&&local[p.id]
      return (unsent||beingEdited||outran)?local[p.id]:p
    })
    loaded=true
  }catch(e){
    console.error('Could not load patients',e)
    ctgPatients=[]
  }
  renderPatientWorkflow()
  updateExamCategoryCounts()
  /* AR Summary builds its own patient dropdown, so it has to be told the
     store arrived. Without this, opening it before this fetch resolves left
     it showing "No patients" while the sidebar counts were already filled. */
  if(typeof arRenderPatientOptions==='function'){const arPage=document.getElementById('page-arSummary');if(arPage&&arPage.classList.contains('active'))arRenderPatientOptions()}
  if(selectedPatientId){try{renderPatientDetails(selectedPatientId)}catch(e){}}
  // The first moment a stored Day 1 draft can be matched to its patient.
  if(loaded&&typeof restoreDraftWhenReady==='function')restoreDraftWhenReady()
}
/* A lazy chart-hydration helper used to live here. The roster carries every
   chart in full so there is nothing to hydrate, and a patient created in
   Registration has no server record yet: the hook failed and then re-rendered
   itself from .finally() forever. Do not reintroduce it. */
window.ctgLoadPatientStore=loadPatientStore
function getPatient(id){return ctgPatients.find(p=>p.id===id)}
function fullPatientName(p){return ((p?.demographics?.lastName||'')+', '+(p?.demographics?.firstName||'')).replace(/^,\s*/, '').trim()||'Unnamed Patient'}
function naturalPatientName(p){return ((p?.demographics?.firstName||'')+' '+(p?.demographics?.lastName||'')).trim()||'Unnamed Patient'}
function initialsForPatient(p){
  const f=p?.demographics?.firstName||'', l=p?.demographics?.lastName||''
  return ((f[0]||'')+(l[0]||'')).toUpperCase()||'PT'
}
/* ── Lawyer (firm-scoped, read-only) helpers ─────────────────────────────── */
function currentUserIsLawyer(){return typeof window.ctgIsLawyer==='function'&&window.ctgIsLawyer()}
/* Provider is read-only on the Overview, Exams and Daily Notes tabs (may still
   use ACE, Billing, Documents and FCR fully). */
function currentUserIsProvider(){const u=(typeof window.ctgCurrentUser==='function')&&window.ctgCurrentUser();return !!(u&&u.role==='provider')}
function currentUserIsTA(){const u=(typeof window.ctgCurrentUser==='function')&&window.ctgCurrentUser();return !!(u&&u.role==='ta')}
function currentUserIsAdmin(){const u=(typeof window.ctgCurrentUser==='function')&&window.ctgCurrentUser();return !!(u&&u.role==='admin')}
/* Policy Limits is claim/settlement information, so only the practice admin and
   the patient's law firm may set it. Everyone else who can see the value
   providers, TAs, compliance - reads it without an edit affordance. */
function canEditPolicyLimits(){return currentUserIsAdmin()||currentUserIsLawyer()}

/* Policy limits. A patient can carry several policies, their own PIP plus the
   at-fault driver's liability say, so these are a list on demographics.
   Records saved as a single amount and note fold in as the first entry. */
function policyLimitEntries(p){
  const d=(p&&p.demographics)||{}
  if(Array.isArray(d.policyLimitsList))return d.policyLimitsList
  if((d.policyLimits&&String(d.policyLimits).trim())||(d.policyLimitsNote&&String(d.policyLimitsNote).trim())){
    return [{id:'pl_legacy',amount:d.policyLimits||'',note:d.policyLimitsNote||'',addedAt:'',addedBy:''}]
  }
  return []
}
function setPolicyLimitEntries(p,list){
  p.demographics={...(p.demographics||{}),policyLimitsList:list}
  // Drop the superseded single-value keys so the two shapes can't disagree.
  delete p.demographics.policyLimits
  delete p.demographics.policyLimitsNote
}
/* A policy limit is usually two separate figures - Bodily Injury and Amount
   Per Accident - but some law firms decline to disclose either one. Records
   saved while this was a single freeform "25,000/50,000" string are split on
   the slash so nothing already entered is lost or hidden. */
function policyLimitSplitLegacyAmount(amount){
  const s=String(amount||'').trim()
  if(!s)return{bi:'',pa:''}
  const parts=s.split('/')
  return parts.length>=2?{bi:parts[0].trim(),pa:parts.slice(1).join('/').trim()}:{bi:s,pa:''}
}
function policyLimitParts(e){
  if(e&&e.notDisclosed)return{notDisclosed:true,bi:'',pa:''}
  if(e&&(e.bodilyInjury||e.perAccident))return{notDisclosed:false,bi:e.bodilyInjury||'',pa:e.perAccident||''}
  if(e&&e.amount){const sp=policyLimitSplitLegacyAmount(e.amount);return{notDisclosed:false,bi:sp.bi,pa:sp.pa}}
  return{notDisclosed:false,bi:'',pa:''}
}
function policyLimitDisplay(e){
  const parts=policyLimitParts(e)
  if(parts.notDisclosed)return'Not disclosed'
  const bits=[]
  if(parts.bi)bits.push('Bodily Injury '+parts.bi)
  if(parts.pa)bits.push('Per Accident '+parts.pa)
  return bits.length?bits.join(' · '):'No Policy Limit provided'
}
function policyLimitChipsHtml(e){
  const parts=policyLimitParts(e)
  if(parts.notDisclosed)return`<span class="pl-nd-badge">${PL_ND_ICON} Not disclosed</span>`
  const chips=[]
  if(parts.bi)chips.push(`<span class="pl-chip"><b>Bodily Injury</b>${escHtml(parts.bi)}</span>`)
  if(parts.pa)chips.push(`<span class="pl-chip"><b>Per Accident</b>${escHtml(parts.pa)}</span>`)
  return chips.length?`<div class="pl-chips">${chips.join('')}</div>`:'<span class="pl-toc-empty">No Policy Limit provided</span>'
}
const PL_ND_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
function policyLimitSummary(p){
  const parts=policyLimitEntries(p).map(policyLimitDisplay).filter(x=>x&&x!=='No Policy Limit provided')
  return parts.join(' · ')
}
/* The panel shows a single clickable row; the list itself lives in the modal so
   the overview card stays one line tall no matter how many policies exist. */
const PL_CHEV='<svg class="pl-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
function policyLimitsListHtml(p){
  const n=policyLimitEntries(p).length
  return `<div class="pl-block">
    <button type="button" class="pl-row" data-onclick="openPolicyLimitsManager('${p.id}')" title="${escHtml(policyLimitSummary(p)||'No Policy Limit provided')}">
      Policy Limits<span class="pl-row-count">${n}</span>${PL_CHEV}
    </button>
  </div>`
}
/* Overview card: the ICD-10 codes ticked on this patient's ACE. Codes are
   stored as "(F07.81) Post-concussional syndrome" strings by the ACE form, so
   they're split back into code + description for display. */
function parseDiagnosisCode(s){
  const m=String(s||'').match(/^\s*\((.+?)\)\s*(.*)$/)
  return m?{code:m[1],desc:m[2]}:{code:'',desc:String(s||'')}
}
/* Full-width Overview section, below Examinations. Every selected code is
   shown - no cap, and in the order they were ticked on the ACE. */
function dxTileHtml(d){
  return `<div class="dx-item">
    ${d.code?`<span class="dx-code">${escHtml(d.code)}</span>`:''}
    <span class="dx-desc">${escHtml(d.desc)}</span>
  </div>`
}
function diagnosisSectionHtml(p){
  const ace=p.ace||{}
  const codes=Array.isArray(ace.diagnosisCodes)?ace.diagnosisCodes.filter(Boolean):[]
  const parsed=codes.map(parseDiagnosisCode)
  const canOpen=patientTabAllowed('ace')
  const body=parsed.length
    ? `<div class="dx-list">${parsed.map(dxTileHtml).join('')}</div>`
    : `<div class="pld-empty-state">${ace.savedAt?'No ICD-10 codes selected on this Day 1.':'No Day 1 saved yet. Open the Day 1 Form to record this patient\'s diagnosis.'}</div>`
  return `<div class="pld-card dx-card">
    <div class="dx-head">
      <div class="dx-head-left">
        <span class="dx-head-ico">${patientDetailIconSvg('dx')}</span>
        <span class="dx-head-title">Diagnosis</span>
        <span class="dx-head-sub">ICD-10</span>
        ${parsed.length?`<span class="dx-count">${parsed.length}</span>`:''}
      </div>
      <div class="dx-head-right">
        ${ace.dateOfService?`<span class="dx-chip">DOS ${escHtml(ace.dateOfService)}</span>`:''}
        ${canOpen?`<button type="button" class="btn btn-ghost btn-sm" data-onclick="setPatientDetailTab('ace')">${codes.length?'View in Day 1':'Open Day 1'}</button>`:''}
      </div>
    </div>
    ${body}
  </div>`
}
/* Overview card: a contents-style index of the patient's policies. Each line
   opens the manager; the amounts stay readable at a glance without the card
   growing the way a full detail list would. */
function policyLimitsCardHtml(p){
  const entries=policyLimitEntries(p)
  const firm=(p.demographics||{}).lawFirm
  const rows=entries.length
    ? entries.map((e,i)=>`<button type="button" class="pl-toc-row" data-onclick="openPolicyLimitsManager('${p.id}')">
        <span class="pl-toc-n">${i+1}</span>
        <span class="pl-toc-amt${e.notDisclosed?' pl-toc-amt-nd':''}">${escHtml(policyLimitDisplay(e))}</span>
        <span class="pl-toc-dots"></span>
        <span class="pl-toc-note">${escHtml(e.note||'')}</span>
      </button>`).join('')
    : '<div class="pl-toc-empty">No Policy Limit provided.</div>'
  return `<div class="pld-info-card">
    <div class="pld-info-title">${patientDetailIconSvg('shield')} Policy Limits</div>
    <div class="pl-firm"><span>Law Firm</span><strong${firm?'':' class="pl-firm-none"'}>${escHtml(firm||'—')}</strong></div>
    <div class="pl-toc">${rows}</div>
    <div class="pl-block"><button type="button" class="pl-row" data-onclick="openPolicyLimitsManager('${p.id}')">${canEditPolicyLimits()?'Manage Policy Limits':'View Policy Limits'}<span class="pl-row-count">${entries.length}</span>${PL_CHEV}</button></div>
  </div>`
}

/* ---------- Policy Limits modal ----------
   Reuses the shared patientModal shell in two views: a list of the patient's
   policies, and the add/edit form. The shell's Save button is hidden on the
   list view since there's nothing to save there. */
let policyLimitContext={patientId:null,index:null}
function openPolicyLimitsManager(id){
  const p=getPatient(id); if(!p)return
  policyLimitContext={patientId:id,index:null}
  document.body.classList.add('modal-open')
  document.getElementById('patientModal').classList.add('show')
  renderPolicyLimitsListView()
}
function renderPolicyLimitsListView(){
  const p=getPatient(policyLimitContext.patientId); if(!p)return
  const entries=policyLimitEntries(p)
  const canEdit=canEditPolicyLimits()
  document.getElementById('modalTitle').textContent='Policy Limits'
  const rows=entries.map((e,i)=>`<div class="pl-item">
      <div class="pl-item-main">
        ${policyLimitChipsHtml(e)}
        ${e.note?`<div class="pl-item-note">${escHtml(e.note)}</div>`:''}
        ${e.addedAt?`<div class="pl-item-meta">Added ${escHtml(e.addedAt)}${e.addedBy?' · '+escHtml(e.addedBy):''}</div>`:''}
      </div>
      ${canEdit?`<div class="pl-item-actions"><button type="button" class="btn btn-ghost btn-sm" data-onclick="renderPolicyLimitFormView(${i})">✎ Edit</button><button type="button" class="btn btn-ghost btn-sm pl-del" data-onclick="deletePolicyLimit(${i})">Delete</button></div>`:''}
    </div>`).join('')
  document.getElementById('modalBody').innerHTML=`
    ${canEdit?`<div class="pl-modal-bar"><button type="button" class="btn btn-primary btn-sm" data-onclick="renderPolicyLimitFormView(null)">+ Add Policy Limit</button></div>`:''}
    ${entries.length?`<div class="pl-list">${rows}</div>`:'<div class="pl-empty">No Policy Limit provided.</div>'}
    ${canEdit?'':'<div class="small-muted" data-cs="'+__cs+'margin-top:12px">Only the practice admin and the patient\'s law firm can change policy limits.</div>'}`
  const btn=document.getElementById('modalSaveBtn')
  btn.style.display='none'
  btn.onclick=null
}
function renderPolicyLimitFormView(index){
  if(!canEditPolicyLimits()){showToast('You do not have permission to edit Policy Limits','err');return}
  const p=getPatient(policyLimitContext.patientId); if(!p)return
  const adding=(index===null||index===undefined)
  const e=adding?{notDisclosed:false,bodilyInjury:'',perAccident:'',note:''}:policyLimitEntries(p)[index]
  if(!e)return
  policyLimitContext.index=adding?null:Number(index)
  document.getElementById('modalTitle').textContent=adding?'Add Policy Limit':'Edit Policy Limit'
  const parts=policyLimitParts(e)
  const nd=!!e.notDisclosed
  document.getElementById('modalBody').innerHTML=`
    <div class="pl-modal-bar"><button type="button" class="btn btn-ghost btn-sm" data-onclick="renderPolicyLimitsListView()">← Back to list</button></div>
    <label class="pl-nd-toggle">
      <input type="checkbox" id="modalPolicyLimitND" ${nd?'checked':''} data-onchange="policyLimitToggleDisclosed(this.checked)">
      <span class="pl-nd-toggle-box">${PL_ND_ICON}</span>
      <span class="pl-nd-toggle-copy"><strong>This law firm hasn't disclosed the policy limits</strong><span>Some firms withhold this for various reasons — you can still save a note below.</span></span>
    </label>
    <div class="pl-amount-grid" id="plAmountGrid"${nd?' data-cs="'+__cs+'opacity:.45;pointer-events:none"':''}>
      <div class="fg"><label>Bodily Injury Limit</label><div class="pl-amt-input"><span>$</span><input type="text" id="modalPolicyLimitBI" value="${escHtml(parts.bi||'')}" placeholder="25,000"${nd?' disabled':''}></div></div>
      <div class="fg"><label>Amount Per Accident</label><div class="pl-amt-input"><span>$</span><input type="text" id="modalPolicyLimitPA" value="${escHtml(parts.pa||'')}" placeholder="50,000"${nd?' disabled':''}></div></div>
    </div>
    <div class="fg full" data-cs="${__cs}margin-top:14px"><label>Notes</label><textarea id="modalPolicyLimitNote" data-cs="${__cs}min-height:120px" placeholder="Carrier, policy type, adjuster notes, exhausted limits, settlement context…">${escHtml(e.note||'')}</textarea></div>`
  const btn=document.getElementById('modalSaveBtn')
  btn.style.display=''
  btn.onclick=savePolicyLimit
}
function policyLimitToggleDisclosed(nd){
  const grid=document.getElementById('plAmountGrid'); if(!grid)return
  grid.style.opacity=nd?'.45':''
  grid.style.pointerEvents=nd?'none':''
  const bi=document.getElementById('modalPolicyLimitBI'); if(bi)bi.disabled=nd
  const pa=document.getElementById('modalPolicyLimitPA'); if(pa)pa.disabled=nd
}
function savePolicyLimit(){
  // Re-checked on save, not just on render - a hidden button is a convenience,
  // not the gate.
  if(!canEditPolicyLimits()){showToast('You do not have permission to edit Policy Limits','err');return}
  const p=getPatient(policyLimitContext.patientId); if(!p)return
  const notDisclosed=!!document.getElementById('modalPolicyLimitND')?.checked
  // rawVal, not gv - gv() substitutes ' - ' for an empty field.
  const bodilyInjury=notDisclosed?'':rawVal('modalPolicyLimitBI').trim()
  const perAccident=notDisclosed?'':rawVal('modalPolicyLimitPA').trim()
  const note=rawVal('modalPolicyLimitNote').trim()
  if(!notDisclosed&&!bodilyInjury&&!perAccident&&!note){showToast('Enter a policy limit, mark it as not disclosed, or add a note first','err');return}
  const list=policyLimitEntries(p).slice()
  const who=(typeof window.ctgCurrentUser==='function'&&window.ctgCurrentUser()||{}).displayName||''
  const adding=policyLimitContext.index===null
  if(adding){
    list.push({id:'pl_'+Date.now()+'_'+Math.random().toString(16).slice(2),notDisclosed,bodilyInjury,perAccident,note,addedAt:new Date().toLocaleDateString(),addedBy:who})
  }else{
    const cur=list[policyLimitContext.index]; if(!cur)return
    const updated={...cur,notDisclosed,bodilyInjury,perAccident,note}
    delete updated.amount
    list[policyLimitContext.index]=updated
  }
  setPolicyLimitEntries(p,list)
  p.updatedAt=new Date().toISOString()
  persistPatients();renderPatientDetails(p.id)
  showToast(adding?'Policy limit added ✓':'Policy limit updated ✓')
  renderPolicyLimitsListView() // back to the list rather than closing the modal
}
async function deletePolicyLimit(index){
  if(!canEditPolicyLimits()){showToast('You do not have permission to edit Policy Limits','err');return}
  const p=getPatient(policyLimitContext.patientId); if(!p)return
  const list=policyLimitEntries(p).slice()
  const e=list[index]; if(!e)return
  if(!(await ctgConfirm('Delete the policy limit '+(e.amount||'entry')+'?',{danger:true,okLabel:'Delete'})))return
  list.splice(index,1)
  setPolicyLimitEntries(p,list)
  p.updatedAt=new Date().toISOString()
  persistPatients();renderPatientDetails(p.id)
  showToast('Policy limit deleted')
  renderPolicyLimitsListView()
}
function currentUserFirm(){return String((typeof window.ctgUserFirm==='function'&&window.ctgUserFirm())||'').trim()}
function patientFirm(p){return String(p?.demographics?.lawFirm||'').trim()}
/* A lawyer may only ever see patients whose Law Firm matches theirs (fail-closed
   when their account has no firm set). All other roles see everyone. */
function patientsVisibleToCurrentUser(list){
  if(!currentUserIsLawyer())return list
  const firm=currentUserFirm().toLowerCase()
  if(!firm)return []
  return list.filter(p=>patientFirm(p).toLowerCase()===firm)
}
function isPatientDischarged(p){return !!(p&&((p.dischargeDate&&String(p.dischargeDate).trim())||p.adminDischarged))}
// p.archived is accepted for back-compat with records saved while this
// feature was briefly named "Archive".
function isPatientInactive(p){return !!(p&&(p.inactive||p.archived))}
function patientCaseStatus(p){
  // Admin discharge takes precedence: when ticked it always shows "Admin Discharged"
  // (the discharge date doubles as the admin-discharge date). Only when it is not
  // ticked does a filled discharge date read as plain "Discharged".
  if(p&&p.adminDischarged)return{label:'Admin Discharged',cls:'gold'}
  if(p&&p.dischargeDate&&String(p.dischargeDate).trim())return{label:'Discharged',cls:'green'}
  return{label:'Still Under Treatment',cls:'blue'}
}
function patientCaseStatusPill(p){const s=patientCaseStatus(p);return patientDetailStatusPill(s.label,s.cls)}

function byPatientLastFirstName(a,b){
  const al=(a.demographics?.lastName||'').toLowerCase(), bl=(b.demographics?.lastName||'').toLowerCase()
  if(al!==bl)return al.localeCompare(bl)
  return (a.demographics?.firstName||'').toLowerCase().localeCompare((b.demographics?.firstName||'').toLowerCase())
}
/* Inactive patients are hidden from the working Patient List and every patient
   dropdown, but never deleted - the Inactive Patients view
   (setPatientListView) lists them and can reactivate them at any time. */
function sortedPatients(){
  return patientsVisibleToCurrentUser(ctgPatients.filter(p=>!isPatientInactive(p))).sort(byPatientLastFirstName)
}
function inactivePatientsSorted(){
  return patientsVisibleToCurrentUser(ctgPatients.filter(isPatientInactive)).sort(byPatientLastFirstName)
}
/* Unfiltered - active and inactive together, for the "All" view. */
function allPatientsSorted(){
  return patientsVisibleToCurrentUser(ctgPatients.slice()).sort(byPatientLastFirstName)
}
/* The rows the current view should list. Every consumer goes through this so
   the three views can't drift apart. */
function patientListRows(){
  if(patientListView==='inactive')return inactivePatientsSorted()
  if(patientListView==='all')return allPatientsSorted()
  return sortedPatients()
}
function patientListEmptyMessage(){
  if(patientListView==='inactive')return 'No inactive patients. Discharged patients can be marked inactive from their profile.'
  if(patientListView==='all')return 'No patients yet. Register a patient first.'
  return 'No saved patients yet. Register a patient first.'
}
/* Switching views clears the selection - the selected patient usually isn't in
   the list you just moved to. */
function setPatientListView(view){
  if(patientListView===view)return
  patientListView=view
  selectedPatientId=null
  clearPatientListSearch()
  renderPatientWorkflow()
  renderPatientDetails(null)
}
function pendingPatients(){return sortedPatients().filter(p=>p.pendingAce&&!p.ace)}
/* ID / DOB / DOI, as separate pieces so a row can lay them out itself.
   Dates go through day2FormatAnyDate because the store holds whatever was
   typed or imported - "9/20/1990", "07/18/1982", "2010-02-11" all appear - and
   a column of ragged formats is most of what made this list hard to scan. */
function patientMetaParts(p){
  const d=p.demographics||{}
  const parts=[]
  if(d.mrn)parts.push('ID: '+d.mrn)
  if(d.dob)parts.push('DOB: '+(day2FormatAnyDate(d.dob)||d.dob))
  if(d.doi)parts.push('DOI: '+(day2FormatAnyDate(d.doi)||d.doi))
  return parts
}
function patientSubline(p){
  const parts=patientMetaParts(p)
  return parts.join(' · ')||'No DOB/DOI saved'
}
/* Each part is its own nowrap span, so a narrow sidebar breaks BETWEEN
   "DOB: 08/22/1980" and "DOI: 06/10/2026" rather than through the middle of
   one - which is what produced the five-line stack of orphaned "· DOI:" labels. */
function patientMetaHtml(p){
  const parts=patientMetaParts(p)
  if(!parts.length)return '<span class="pld-meta-item">No DOB/DOI saved</span>'
  return parts.map(t=>'<span class="pld-meta-item">'+escHtml(t)+'</span>').join('')
}
/* Outstanding balance chip on each patient-list row, sourced from the same
   billing statement the Billing tab shows and the sidebar Billing (AR Summary /
   Collection Management) uses - see patientBillingBalance() in billing.js. */
function patientBalancePill(p){
  if(typeof patientBillingBalance!=='function')return ''
  let bal=0
  try{bal=patientBillingBalance(p)}catch(e){return ''}
  const money='$'+(Number(bal)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  if(!(Number(bal)>0))return `<span class="pl-balance-pill is-clear" title="No outstanding balance">Balance ${money}</span>`
  return `<span class="pl-balance-pill" title="Outstanding billing balance">Balance ${money}</span>`
}
const PMH_QUESTIONS_AT_LANGUAGE_INTRO = 31
function pmhRowIndex(raw, i) {
  const hasLanguageSlot = Array.isArray(raw) && raw.length > PMH_QUESTIONS_AT_LANGUAGE_INTRO
  return (hasLanguageSlot && i >= 1) ? i + 1 : i
}
const PREG_QUESTION = 'Are you currently pregnant?'
/* Past this, the answer has aged out rather than describing a pregnancy: 42
   weeks is the far edge of post-term, so anything beyond it means the Day 1 is
   old and nobody has updated it. Counting merrily on to "68 weeks" would be
   both absurd and, if anyone believed it, dangerous. */
const PREG_STALE_AFTER_DAYS = 43 * 7

/* Gestational age as of `when`, or null when the patient is not recorded as
   pregnant. Returns the recorded figure alongside the current one so the UI can
   always show its own working. */
function pregnancyStatus(p, when) {
  /* A status recorded after Day 1 outranks everything below. A clinician saying
     the pregnancy has ended, or correcting the figure, beats one inferred by
     counting forward from intake. Checked before the Day 1 read so it also
     covers a pregnancy that began later, where there is no Yes to build on. */
  const ov = p && p.pregnancy
  if (ov && ov.status === 'ended') return null
  if (ov && ov.status === 'pregnant') return pregnancyFromOverride(ov, when)

  const fs = p && p.ace && p.ace.formState
  if (!fs) return null
  /* Belt and braces for records saved before the Day 1 form gated this
     question: a male chart must not surface a pregnancy badge however the
     answer got there. */
  const gender = String((p.demographics && p.demographics.gender) || (fs.selects && fs.selects.ptGender) || '').trim().toLowerCase()
  if (gender === 'male') return null
  const idx = (typeof PMH_ITEMS !== 'undefined') ? PMH_ITEMS.indexOf(PREG_QUESTION) : -1
  if (idx < 0) return null
  const raw = (fs.yn && fs.yn.pmhList) || []
  const rawC = (fs.ynComments && fs.ynComments.pmhList) || []
  const at = pmhRowIndex(raw, idx)
  if (String(raw[at] || '').toLowerCase() !== 'yes') return null

  const recorded = String(rawC[at] || '').trim()
  const baseDays = pregnancyRecordedDays(recorded)
  const anchor = pregnancyAnchorDate(p)
  // recordedOn / baseDays are surfaced so the hover popover can show the
  // clinician's own working (what was entered, on what day) without repeating
  // the parsing here.
  const out = { recorded: recorded, anchor: anchor, baseDays: baseDays, recordedOn: '', stale: false }

  // Answered Yes with no gestational age - still worth flagging, just without
  // a number nobody entered.
  if (baseDays === null) {
    out.label = 'Pregnant'
    out.detail = 'Recorded as pregnant on Day 1; gestational age was not entered.'
    return out
  }
  if (!anchor) {
    out.label = 'Pregnant · ' + pregnancyFormat(baseDays)
    out.detail = 'Recorded as ' + recorded + ' on Day 1. No Day 1 date to age it from, so this is the figure as entered.'
    return out
  }

  const today = when ? new Date(when) : new Date()
  const days = Math.floor((pregnancyMidnight(today) - pregnancyMidnight(anchor)) / 86400000)
  // A future-dated Day 1 must not run the clock backwards.
  const total = baseDays + Math.max(0, days)
  const recordedOn = day2FormatAnyDate(anchor.toISOString()) || pregnancyMMDDYYYY(anchor)
  out.recordedOn = recordedOn

  if (total > PREG_STALE_AFTER_DAYS) {
    out.stale = true
    out.label = 'Pregnancy info out of date'
    out.detail = 'Recorded as ' + recorded + ' on ' + recordedOn + ', which would now be past term. Confirm with the patient and update Day 1.'
    return out
  }
  out.days = total
  out.label = 'Pregnant · ' + pregnancyFormat(total)
  out.detail = 'Recorded as ' + recorded + ' on ' + recordedOn + ' · now ' + pregnancyFormat(total) + ', counted forward from that date.'
  return out
}

/* The same forward count as the Day 1 reading, from the corrected figure and
   the date it was true. Kept separate so the Day 1 path stays exactly as it
   was: this is a different source of truth, not a variation on that one. */
function pregnancyFromOverride(ov, when) {
  const by = ov.updatedBy ? ' by ' + ov.updatedBy : ''
  const asOf = pregnancyParseYMD(ov.asOf)
  const weeks = (ov.weeks === 0 || ov.weeks) ? Number(ov.weeks) : null
  const out = { recorded: weeks == null ? '' : weeks + ' weeks', anchor: asOf, baseDays: null, recordedOn: '', stale: false, override: true, note: ov.note || '' }
  if (weeks == null || !isFinite(weeks) || weeks < 0) {
    out.label = 'Pregnant'
    out.detail = 'Recorded as pregnant' + (asOf ? ' on ' + pregnancyMMDDYYYY(asOf) : '') + by + '. No gestational age was entered.'
    return out
  }
  out.baseDays = Math.round(weeks * 7)
  if (!asOf) {
    out.days = out.baseDays
    out.label = 'Pregnant · ' + pregnancyFormat(out.baseDays)
    out.detail = 'Updated to ' + weeks + ' weeks' + by + '. No date was given, so this is the figure as entered.'
    return out
  }
  const today = when ? new Date(when) : new Date()
  const days = Math.floor((pregnancyMidnight(today) - pregnancyMidnight(asOf)) / 86400000)
  const total = out.baseDays + Math.max(0, days)
  out.recordedOn = pregnancyMMDDYYYY(asOf)
  if (total > PREG_STALE_AFTER_DAYS) {
    out.stale = true
    out.label = 'Pregnancy info out of date'
    out.detail = 'Updated to ' + weeks + ' weeks on ' + out.recordedOn + by + ', which would now be past term. Confirm with the patient and update it.'
    return out
  }
  out.days = total
  out.label = 'Pregnant · ' + pregnancyFormat(total)
  out.detail = 'Updated to ' + weeks + ' weeks on ' + out.recordedOn + by + ' · now ' + pregnancyFormat(total) + ', counted forward from that date.'
  return out
}
function pregnancyParseYMD(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

/* "3 weeks" / "18 weeks" / "4 months", and the free-text spread that predates
   the structured picker ("18wks", "4 1/2 months"). Anything with no number in
   it is not a gestational age. */
function pregnancyRecordedDays(text) {
  const s = String(text || '').toLowerCase()
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n) || n < 0) return null
  return /month|\bmos?\b/.test(s) ? Math.round(n * 30.4375) : Math.round(n * 7)
}

/* The date the recorded figure was TRUE, which is the date of service - not
   savedAt. A Day 1 written up a week after the visit would otherwise start the
   count a week behind. savedAt is the fallback for records with no DOS. */
function pregnancyAnchorDate(p) {
  const dos = day2FormatAnyDate(p && p.ace && p.ace.dateOfService)
  const m = dos && dos.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10))
  const saved = (p && p.ace && p.ace.savedAt) ? new Date(p.ace.savedAt) : null
  return (saved && !isNaN(saved.getTime())) ? saved : null
}

// Whole days apart, not hours: two dates a few hours either side of midnight
// are still one day apart, and a time-of-day component would make the figure
// tick over at whatever o'clock the Day 1 happened to be saved.
function pregnancyMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function pregnancyMMDDYYYY(d) {
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear()
}
/* Whole weeks only. The recorded answer is itself a whole number of weeks,
   so a trailing day count would dress up a figure that never had that
   precision - and gestational age is spoken in weeks anyway. */
function pregnancyFormat(days) { return Math.floor(days / 7) + 'w' }

// Same reading, in the badge style the patient detail header uses.
// The native title is gone: a hover on the pill now opens pregHoverCard, the
// richer popover, and a browser tooltip fighting it would double up.
let pregEditingId = null
function pregTodayYMD() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
/* What Day 1 says on its own, with any update set aside - shown in the editor
   so the person can see exactly what they are overriding, and what "use the
   Day 1 answer" would go back to. */
function pregnancyDay1Reading(p) {
  if (!p || !p.pregnancy) return pregnancyStatus(p)
  const bare = Object.assign({}, p)
  delete bare.pregnancy
  return pregnancyStatus(bare)
}
function pregOpenEditor(id) {
  const p = (typeof getPatient === 'function') ? getPatient(id) : null
  if (!p || !pregCanEdit()) return
  pregHideHoverCard()
  pregEditingId = id
  const ov = p.pregnancy || null
  const now = pregnancyStatus(p)
  const day1 = pregnancyDay1Reading(p)

  document.getElementById('pregEditWho').textContent = naturalPatientName(p)
  const status = (ov && ov.status) || 'pregnant'
  Array.prototype.forEach.call(document.querySelectorAll('input[name=pregStatus]'), function (r) {
    r.checked = (r.value === status)
  })
  // Pre-filled with the reading on screen, so correcting it is a small edit
  // rather than a re-entry from nothing.
  const weeks = (ov && ov.weeks != null) ? ov.weeks
    : (now && now.days != null ? Math.floor(now.days / 7) : '')
  document.getElementById('pregWeeks').value = weeks === null ? '' : weeks
  document.getElementById('pregAsOf').value = (ov && ov.asOf) || pregTodayYMD()
  document.getElementById('pregNote').value = (ov && ov.note) || ''
  document.getElementById('pregOutcome').value = (ov && ov.outcome) || ''
  document.getElementById('pregDay1Line').textContent = day1
    ? 'Day 1 recorded: ' + day1.detail
    : 'Day 1 has no pregnancy recorded for this patient.'
  const reset = document.getElementById('pregResetBtn')
  reset.style.display = ov ? '' : 'none'
  reset.disabled = !day1
  pregEditorSync()
  document.getElementById('pregEditModal').classList.add('show')
  setTimeout(function () { const w = document.getElementById('pregWeeks'); if (w && status === 'pregnant') w.focus() }, 30)
}
function pregEditorSync() {
  const el = document.querySelector('input[name=pregStatus]:checked')
  const pregnant = !el || el.value === 'pregnant'
  /* Only the WEEKS field is hidden when a pregnancy has ended, not the whole
     row: the date is the one thing that still matters, and hiding it with the
     weeks made "Date" below unreachable - the label swap was dead code. */
  document.getElementById('pregWeeksField').style.display = pregnant ? '' : 'none'
  document.getElementById('pregOutcomeRow').style.display = pregnant ? 'none' : ''
  document.getElementById('pregAsOfLabel').textContent = pregnant ? 'As of' : 'Date it ended'
}
function pregEditorClose() {
  const m = document.getElementById('pregEditModal')
  if (m) m.classList.remove('show')
  pregEditingId = null
}
function pregEditorSave() {
  const p = (typeof getPatient === 'function') ? getPatient(pregEditingId) : null
  if (!p) { pregEditorClose(); return }
  const el = document.querySelector('input[name=pregStatus]:checked')
  const status = (el && el.value) === 'ended' ? 'ended' : 'pregnant'
  const raw = String(document.getElementById('pregWeeks').value || '').trim()
  const weeks = raw === '' ? null : Number(raw)
  if (status === 'pregnant' && weeks !== null && (!isFinite(weeks) || weeks < 0 || weeks > 45)) {
    showToast('Enter the gestational age in weeks, between 0 and 45', 'err')
    return
  }
  const u = (typeof window.ctgCurrentUser === 'function') ? window.ctgCurrentUser() : null
  const stamp = new Date().toISOString()
  p.pregnancy = {
    status: status,
    weeks: status === 'pregnant' ? weeks : null,
    asOf: document.getElementById('pregAsOf').value || pregTodayYMD(),
    note: String(document.getElementById('pregNote').value || '').trim(),
    /* Never recorded for an ongoing pregnancy, and '' is a real answer meaning
       'not recorded'. Kept off the badge: pregnancyStatus() returns null once a
       pregnancy has ended, so how it ended is never painted on a chart header for
       a passing glance. It stays in the record, where a loss belongs. */
    outcome: status === 'ended'
      ? String(document.getElementById('pregOutcome').value || '')
      : null,
    updatedAt: stamp,
    updatedBy: (u && (u.displayName || u.username)) || ''
  }
  p.updatedAt = stamp
  persistPatients()
  pregEditorClose()
  if (typeof renderPatientDetails === 'function') renderPatientDetails(p.id)
  if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow()
  showToast(status === 'ended' ? 'Pregnancy recorded as ended' : 'Pregnancy status updated', 'ok')
}
/* Drops the update entirely rather than writing a third state: with it gone the
   badge goes straight back to reading Day 1, which is the honest "I entered
   that by mistake" outcome. */
function pregEditorReset() {
  const p = (typeof getPatient === 'function') ? getPatient(pregEditingId) : null
  if (!p) { pregEditorClose(); return }
  p.pregnancy = null
  p.updatedAt = new Date().toISOString()
  persistPatients()
  pregEditorClose()
  if (typeof renderPatientDetails === 'function') renderPatientDetails(p.id)
  if (typeof renderPatientWorkflow === 'function') renderPatientWorkflow()
  showToast('Back to the Day 1 answer', 'ok')
}
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return
  const m = document.getElementById('pregEditModal')
  if (m && m.classList.contains('show')) { e.preventDefault(); pregEditorClose() }
})


function pregnancyReportAnswer(ans){
  const p=(typeof getPatient==='function'&&currentAcePatientId)?getPatient(currentAcePatientId):null
  const sel=document.getElementById('ptGender')
  const gender=String((sel&&sel.value)||(p&&p.demographics&&p.demographics.gender)||'').trim().toLowerCase()
  if(gender==='male')return ''
  const ov=p&&p.pregnancy
  if(ov&&ov.status==='ended')return ''
  if(ov&&ov.status==='pregnant'){
    const st=pregnancyStatus(p)
    if(!st)return ''
    return st.days!=null?('Yes — '+pregnancyFormat(st.days)):'Yes'
  }
  return /^Yes/.test(ans)?ans:''
}
function pregCanEdit() { return !(typeof ctgIsLawyer === 'function' && ctgIsLawyer()) }
function patientPregnancyBadge(p) {
  const s = pregnancyStatus(p)
  const ov = p && p.pregnancy
  const edit = pregCanEdit()
  const open = edit ? ' data-onclick="pregOpenEditor(\'' + escHtml(p.id) + '\')"' : ''
  const hint = edit ? ' title="Click to update"' : ''
  if (!s) {
    /* Once the pregnancy is recorded as no longer current the badge stops
       asserting a gestational age, but a quiet chip stays. It is the only way
       back into the editor if that was entered by mistake, and 'asked, not
       current' is worth seeing on a header that would otherwise look unasked. */
    if (!(ov && ov.status === 'ended')) return ''
    return '<span class="pld-status preg is-ended' + (edit ? ' is-editable' : '') + '"'
      + ' data-preg-patient="' + escHtml(p.id) + '"' + open + hint
      + (edit ? ' tabindex="0"' : '') + '>Not currently pregnant</span>'
  }
  return '<span class="pld-status preg' + (s.stale ? ' is-stale' : '') + (edit ? ' is-editable' : '')
    + '" data-preg-patient="' + escHtml(p.id) + '"' + open + hint
    + ' data-onmouseenter="pregShowHoverCard(event,\'' + escHtml(p.id) + '\')" data-onmouseleave="pregScheduleHideHoverCard()"'
    + ' tabindex="0" data-onfocus="pregShowHoverCard(event,\'' + escHtml(p.id) + '\')" data-onblur="pregScheduleHideHoverCard()">'
    + escHtml(s.label) + '</span>'
}

/* Pregnancy hover popover. Reuses the calendar's appointment hover card so
   the two read as one component, and expands the pill into the reading behind
   it: gestational age now, what was recorded and when, trimester, and an
   estimated due date. All computed; nothing here writes to the record. */
let pregHoverTimer = null, pregHoverHideTimer = null
function pregTrimesterLabel(days) {
  if (days == null) return ''
  const w = days / 7
  if (w < 14) return 'First trimester'
  if (w < 28) return 'Second trimester'
  return 'Third trimester'
}
/* Standard obstetric estimate: 280 days (40 weeks) of gestation. Given today's
   gestational age we count the remaining days forward. A lead, not a diagnosis
   - it inherits every bit of slack in the figure it was recorded from, so it is
   labelled an estimate. */
function pregEstimatedDueDate(totalDays) {
  if (totalDays == null) return ''
  const edd = new Date()
  edd.setHours(0, 0, 0, 0)
  edd.setDate(edd.getDate() + (280 - totalDays))
  return pregnancyMMDDYYYY(edd)
}
function pregWeeksVerbose(days) {
  if (days == null) return ''
  const w = Math.floor(days / 7), d = days % 7
  return w + (w === 1 ? ' week' : ' weeks') + (d ? ' ' + d + (d === 1 ? ' day' : ' days') : '')
}
function pregHoverCardHTML(p) {
  const s = pregnancyStatus(p)
  if (!s) return ''
  const name = (p.demographics && (p.demographics.firstName || p.demographics.lastName))
    ? [p.demographics.firstName, p.demographics.lastName].filter(Boolean).join(' ')
    : (typeof patientDisplayName === 'function' ? patientDisplayName(p) : 'Patient')
  const accent = s.stale ? '#d97706' : '#be185d'
  // Grid facts. Each falls back to a clear " - " rather than a blank so the
  // absence of a figure reads as "not recorded", not as a broken card.
  const gaNow = s.days != null ? pregWeeksVerbose(s.days) : (s.stale ? 'Past term' : 'Not recorded')
  const trimester = s.stale ? '—' : (pregTrimesterLabel(s.days) || '—')
  const recorded = s.recorded ? escHtml(s.recorded) : '—'
  const recordedOn = s.recordedOn ? escHtml(s.recordedOn) : (s.anchor ? '—' : 'No Day 1 date')
  const edd = (!s.stale && s.days != null) ? pregEstimatedDueDate(s.days) : '—'
  const cell = (label, val, opts) => '<div class="appt-hover-cell"><span class="appt-hover-label">' + label
    + '</span><span class="appt-hover-val' + ((opts && opts.muted) ? ' appt-hover-val-muted' : '') + '">' + val + '</span></div>'
  return '<div class="appt-hover-accent" data-cs="'+__cs+'background:' + accent + '"></div>'
    + '<div class="appt-hover-hd">'
    + '<div class="appt-hover-idblock"><div class="appt-hover-name">' + escHtml(name) + '</div>'
    + '<div class="appt-hover-visit">' + escHtml(s.label) + '</div></div>'
    + '</div>'
    + '<div class="appt-hover-body">'
    + '<div class="appt-hover-grid">'
    + cell('Gestational age now', escHtml(gaNow))
    + cell('Trimester', escHtml(trimester))
    + cell('Recorded as', recorded)
    + cell('Recorded on', recordedOn)
    + cell('Est. due date', escHtml(edd) + (edd !== '—' ? ' <span class="preg-approx">approx.</span>' : ''), { muted: edd === '—' })
    + '</div>'
    + '</div>'
    + '<div class="appt-hover-updated' + (s.stale ? ' is-warn' : '') + '">' + escHtml(s.detail) + '</div>'
    + (s.note ? '<div class="appt-hover-updated">' + escHtml(s.note) + '</div>' : '')
    + (pregCanEdit() ? '<div class="preg-hover-cta">Click the badge to update this</div>' : '')
}
function pregShowHoverCard(evt, patientId) {
  clearTimeout(pregHoverHideTimer)
  clearTimeout(pregHoverTimer)
  const point = evt && typeof evt.clientX === 'number'
    ? { x: evt.clientX, y: evt.clientY }
    : (() => { const r = evt && evt.target && evt.target.getBoundingClientRect ? evt.target.getBoundingClientRect() : { left: 40, bottom: 40 }; return { x: r.left, y: r.bottom }; })()
  pregHoverTimer = setTimeout(() => pregRenderHoverCard(point, patientId), 180)
}
function pregScheduleHideHoverCard() {
  clearTimeout(pregHoverTimer)
  pregHoverHideTimer = setTimeout(pregHideHoverCard, 120)
}
function pregHoverCardHover() { clearTimeout(pregHoverHideTimer) }
function pregHideHoverCard() {
  const card = document.getElementById('pregHoverCard')
  if (card) card.classList.remove('show')
}
function pregRenderHoverCard(point, patientId) {
  const p = (typeof getPatient === 'function') ? getPatient(patientId) : null
  const card = document.getElementById('pregHoverCard')
  if (!p || !card) return
  const html = pregHoverCardHTML(p)
  if (!html) return
  card.innerHTML = html
  card.classList.add('show')
  pregPositionHoverCard(point)
}
function pregPositionHoverCard(point) {
  const card = document.getElementById('pregHoverCard')
  if (!card) return
  const cw = card.offsetWidth || 280
  let left = point.x + 16
  if (left + cw > window.innerWidth - 8) left = point.x - cw - 16
  left = Math.max(8, Math.min(left, window.innerWidth - cw - 8))
  card.style.left = left + 'px'
  card.style.top = Math.max(8, point.y - 10) + 'px'
  requestAnimationFrame(() => {
    const cr = card.getBoundingClientRect()
    if (cr.bottom > window.innerHeight - 8) card.style.top = Math.max(8, window.innerHeight - cr.height - 8) + 'px'
  })
}

/* Gestational age advances a day at a time, so a list left open overnight would
   sit on yesterday's figure. The chips recompute themselves in place rather
   than re-rendering the list, which would fight with whatever the user is in
   the middle of. */
function refreshPregnancyPills() {
  document.querySelectorAll('[data-preg-patient]').forEach(el => {
    const p = (typeof getPatient === 'function') ? getPatient(el.getAttribute('data-preg-patient')) : null
    const s = p ? pregnancyStatus(p) : null
    if (!s) { el.remove(); return }
    el.textContent = s.label
    el.classList.toggle('is-stale', !!s.stale)
  })
}
setInterval(refreshPregnancyPills, 3600000)
function escHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function plainOrDash(v){return v&&String(v).trim()?String(v).trim():'—'}
function rawVal(id){return document.getElementById(id)?.value||''}

async function ensureJSZip(){
  if(window.JSZip)return window.JSZip
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ctg-jszip="1"]')
    if(existing){existing.addEventListener('load',()=>resolve(window.JSZip));existing.addEventListener('error',()=>reject(new Error('Could not load Excel importer library')));return}
    const s=document.createElement('script')
    s.src='vendor/jszip.min.js'
    s.dataset.ctgJszip='1'
    s.onload=()=>resolve(window.JSZip)
    s.onerror=()=>reject(new Error('Could not load Excel importer library'))
    document.head.appendChild(s)
  })
}
function xmlDoc(txt){return new DOMParser().parseFromString(txt,'application/xml')}
function xmlLocal(doc,name){return Array.from(doc.getElementsByTagNameNS('*',name))}
function nodeText(n){return n?n.textContent||'':''}
function zipResolvePath(basePath,target){
  if(!target)return ''
  target=String(target).replace(/^\//,'')
  if(target.startsWith('xl/'))return target
  const parts=basePath.split('/');parts.pop()
  for(const part of target.split('/')){
    if(!part||part==='.'){continue}
    if(part==='..')parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}
async function getWorkbookSheetPath(zip){
  if(zip.file('xl/worksheets/sheet1.xml'))return 'xl/worksheets/sheet1.xml'
  const wbFile=zip.file('xl/workbook.xml')
  const relFile=zip.file('xl/_rels/workbook.xml.rels')
  if(!wbFile||!relFile)throw new Error('No worksheet found in imported file')
  const wb=xmlDoc(await wbFile.async('text'))
  const rels=xmlDoc(await relFile.async('text'))
  const firstSheet=xmlLocal(wb,'sheet')[0]
  const relId=firstSheet?.getAttribute('r:id')||firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')
  const rel=xmlLocal(rels,'Relationship').find(r=>r.getAttribute('Id')===relId)
  return zipResolvePath('xl/workbook.xml',rel?.getAttribute('Target')||'worksheets/sheet1.xml')
}
async function getSharedStrings(zip){
  const f=zip.file('xl/sharedStrings.xml')
  if(!f)return []
  const doc=xmlDoc(await f.async('text'))
  return xmlLocal(doc,'si').map(si=>xmlLocal(si,'t').map(t=>t.textContent||'').join(''))
}
function parseSheetValues(sheetXml,sharedStrings){
  const doc=xmlDoc(sheetXml)
  const out={}
  xmlLocal(doc,'c').forEach(c=>{
    const addr=c.getAttribute('r')
    if(!addr)return
    const type=c.getAttribute('t')
    let val=''
    if(type==='inlineStr')val=xmlLocal(c,'t').map(t=>t.textContent||'').join('')
    else{
      const v=nodeText(xmlLocal(c,'v')[0])
      if(type==='s')val=sharedStrings[parseInt(v,10)]||''
      else val=v
    }
    out[addr]=val
  })
  return out
}
function normalizeImportDate(v){
  v=String(v||'').trim()
  if(!v)return ''
  if(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)){
    const parts=v.split('/')
    const mm=parts[0].padStart(2,'0')
    const dd=parts[1].padStart(2,'0')
    let yy=parts[2]
    if(yy.length===2)yy=(parseInt(yy,10)>40?'19':'20')+yy
    return mm+'/'+dd+'/'+yy
  }
  const n=Number(v)
  if(Number.isFinite(n)&&n>20000&&n<60000){
    const d=new Date(Math.round((n-25569)*86400*1000))
    const mm=String(d.getUTCMonth()+1).padStart(2,'0')
    const dd=String(d.getUTCDate()).padStart(2,'0')
    return mm+'/'+dd+'/'+d.getUTCFullYear()
  }
  return v
}
function firstCommaPart(v){return String(v||'').split(',')[0].trim()}
function setInputValue(id,val){const el=document.getElementById(id);if(el)el.value=val||''}
function setSelectValue(id,val){
  const el=document.getElementById(id);if(!el)return
  const want=String(val||'').trim().toLowerCase()
  let matched=false
  Array.from(el.options).forEach((o,i)=>{if(o.textContent.trim().toLowerCase()===want||o.value.trim().toLowerCase()===want){el.selectedIndex=i;matched=true}})
  if(!matched)el.selectedIndex=0
}
async function getSheetDrawingPath(zip,sheetPath,sheetXml){
  const sheetDoc=xmlDoc(sheetXml)
  const drawing=xmlLocal(sheetDoc,'drawing')[0]
  if(!drawing)return ''
  const relId=drawing.getAttribute('r:id')||drawing.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')
  const fileName=sheetPath.split('/').pop()
  const relsPath=sheetPath.replace(fileName,'_rels/'+fileName+'.rels')
  const relsFile=zip.file(relsPath)
  if(!relsFile)return ''
  const rels=xmlDoc(await relsFile.async('text'))
  const rel=xmlLocal(rels,'Relationship').find(r=>r.getAttribute('Id')===relId)
  return zipResolvePath(sheetPath,rel?.getAttribute('Target')||'')
}
function getPictureEmbedIds(drawingXml){
  const doc=xmlDoc(drawingXml)
  const ids={}
  xmlLocal(doc,'pic').forEach(pic=>{
    const pr=xmlLocal(pic,'cNvPr')[0]
    const name=pr?.getAttribute('name')||''
    if(name==='Picture 1'||name==='Picture 2'){
      const blip=xmlLocal(pic,'blip')[0]
      const rid=blip?.getAttribute('r:embed')||blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed')
      ids[name]=rid||''
    }
  })
  return ids
}
async function getDrawingRelMap(zip,drawingPath){
  const fileName=drawingPath.split('/').pop()
  const relsPath=drawingPath.replace(fileName,'_rels/'+fileName+'.rels')
  const f=zip.file(relsPath)
  if(!f)return {}
  const doc=xmlDoc(await f.async('text'))
  const out={}
  xmlLocal(doc,'Relationship').forEach(r=>{out[r.getAttribute('Id')]=zipResolvePath(drawingPath,r.getAttribute('Target'))})
  return out
}
async function darkImageScore(zip,imagePath){
  const f=zip.file(imagePath)
  if(!f)return 0
  const blob=await f.async('blob')
  const url=URL.createObjectURL(blob)
  try{
    const img=await new Promise((resolve,reject)=>{
      const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url
    })
    const canvas=document.createElement('canvas')
    canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    ctx.drawImage(img,0,0)
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data
    let opaque=0,dark=0
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3]
      if(a>20){
        opaque++
        if(data[i]+data[i+1]+data[i+2]<450)dark++
      }
    }
    return opaque?dark/opaque:0
  }finally{URL.revokeObjectURL(url)}
}
async function detectImportedGender(zip,sheetPath,sheetXml){
  try{
    const drawingPath=await getSheetDrawingPath(zip,sheetPath,sheetXml)
    if(!drawingPath)return ''
    const drawingFile=zip.file(drawingPath)
    if(!drawingFile)return ''
    const drawingXml=await drawingFile.async('text')
    const embeds=getPictureEmbedIds(drawingXml)
    const relMap=await getDrawingRelMap(zip,drawingPath)
    const p1=embeds['Picture 1']?relMap[embeds['Picture 1']]:''
    const p2=embeds['Picture 2']?relMap[embeds['Picture 2']]:''
    const score1=p1?await darkImageScore(zip,p1):0
    const score2=p2?await darkImageScore(zip,p2):0
    if(Math.abs(score1-score2)<0.02)return ''
    return score1>score2?'Female':'Male'
  }catch(e){console.warn('Gender import skipped:',e);return ''}
}
async function handleRegistrationImport(input){
  const file=input.files&&input.files[0]
  if(!file)return
  try{
    showToast('Importing patient file...')
    const JSZipLib=await ensureJSZip()
    const zip=await JSZipLib.loadAsync(file)
    const sheetPath=await getWorkbookSheetPath(zip)
    const sheetXml=await zip.file(sheetPath).async('text')
    const sharedStrings=await getSharedStrings(zip)
    const values=parseSheetValues(sheetXml,sharedStrings)
    const cell=a=>String(values[a]||'').trim()
    const city=cell('AJ18'), state=cell('AW18'), zipCode=cell('BH18')
    setInputValue('regLastName',cell('AM10'))
    setInputValue('regFirstName',cell('E10'))
    setInputValue('regDOB',normalizeImportDate(cell('BD10')))
    const gender=await detectImportedGender(zip,sheetPath,sheetXml)
    if(gender)setSelectValue('regGender',gender)
    setInputValue('regAddressLine',firstCommaPart(cell('C18')))
    setInputValue('regCity',city);setInputValue('regState',state);setInputValue('regZip',zipCode)
    setInputValue('regEmail',cell('E26'))
    setInputValue('regMobile',cell('C22'))
    showToast('Patient details imported ✓')
  }catch(e){
    console.error(e)
    showToast('Import failed: '+e.message,'err')
  }finally{
    input.value=''
  }
}


function migratePatientRecords(list){
  // Migrate legacy single reExam/finalExam to arrays
  ;(Array.isArray(list)?list:[]).forEach(p=>{
    if(p.reExam&&!Array.isArray(p.reExams)){p.reExams=[p.reExam];delete p.reExam}
    if(!p.reExams)p.reExams=[]
    // finalExams array back to single finalExam
    if(Array.isArray(p.finalExams)&&p.finalExams.length){p.finalExam=p.finalExams[p.finalExams.length-1];delete p.finalExams}
  })
  return list
}
function renderPatientWorkflow(){
  // The footer always shows (it hosts the Active / Inactive / All switch). Only
  // the "Add New Patient" action is conditional: hidden for read-only roles
  // (lawyer/provider/TA) and in the Inactive view (you can't register there).
  const foot=document.getElementById('patientListFoot'); if(foot)foot.style.display=''
  const addBtn=document.getElementById('addPatientBtn')
  if(addBtn)addBtn.style.display=(patientListView==='inactive'||currentUserIsLawyer()||currentUserIsProvider()||currentUserIsTA())?'none':''
  const total=sortedPatients().length
  const inactiveTotal=inactivePatientsSorted().length
  const allTotal=allPatientsSorted().length
  const pending=pendingPatients().length
  const regTag=document.getElementById('regTotalTag'); if(regTag)regTag.textContent=total+(total===1?' Patient':' Patients')
  const shown=patientListRows().length
  const listTag=document.getElementById('listTotalTag')
  if(listTag)listTag.textContent=patientListView==='inactive'?(shown+' Inactive'):patientListView==='all'?(shown+' Total'):(shown+(shown===1?' Patient':' Patients'))
  const listTitle=document.getElementById('pldPageTitle')
  if(listTitle)listTitle.textContent=patientListView==='inactive'?'Inactive Patients':patientListView==='all'?'All Patients':'Patient Lists'
  const seg=document.getElementById('patientViewSeg')
  if(seg){
    const counts={active:total,inactive:inactiveTotal,all:allTotal}
    seg.querySelectorAll('.pld-seg-btn').forEach(b=>{
      const v=b.getAttribute('data-view')
      b.classList.toggle('is-on',v===patientListView)
      const c=b.querySelector('.pld-seg-count')
      if(c)c.textContent=String(counts[v]||0)
    })
  }
  const regPending=document.getElementById('regPendingTag'); if(regPending)regPending.textContent=pending+' Pending Day 1'
  const pendingTag=document.getElementById('pendingTotalTag'); if(pendingTag)pendingTag.textContent=pending+' Pending'
  const mini=document.getElementById('listCountMini'); if(mini)mini.textContent=String(total)
  renderPatientRows()
  renderPendingRows()
  renderIncompleteAceRows()
  renderCompletedAceRows()
  renderPendingDay2Rows()
  if(selectedPatientId)renderPatientDetails(selectedPatientId)
}

const REG_REQUIRED_FIELDS=[
  ['regLastName','Last Name'],
  ['regFirstName','First Name'],
  ['regDOB','Date of Birth'],
  ['regGender','Gender'],
  ['regZip','ZIP Code'],
  ['regLawFirm','Law Firm']
]
/* Paints the offending rows red and clears each one as soon as it is filled,
   so the form stops shouting the moment it is satisfied rather than only on
   the next save attempt. Pass [] to clear everything. */
function markRegistrationMissing(ids){
  REG_REQUIRED_FIELDS.forEach(([id])=>{
    const el=document.getElementById(id); if(!el)return
    const fg=el.closest('.fg'); if(!fg)return
    const bad=ids.indexOf(id)>=0
    fg.classList.toggle('is-missing',bad)
    if(bad&&!el._regReqBound){
      el._regReqBound=true
      const clear=()=>{if(String(el.value||'').trim())fg.classList.remove('is-missing')}
      el.addEventListener('input',clear)
      el.addEventListener('change',clear)
    }
  })
}
function registrationMissingFields(){
  return REG_REQUIRED_FIELDS.filter(([id])=>!String(rawVal(id)||'').trim())
}
async function saveRegistration(){
  const d={
    lastName:rawVal('regLastName').trim(),
    firstName:rawVal('regFirstName').trim(),
    mrn:rawVal('regMRN').trim(),
    dob:rawVal('regDOB').trim(),
    gender:rawVal('regGender'),
    addressLine:rawVal('regAddressLine').trim(),
    addressLine2:rawVal('regAddressLine2').trim(),
    city:rawVal('regCity').trim(),
    state:rawVal('regState').trim(),
    zip:rawVal('regZip').trim(),
    cityStateZip:joinCityStateZip(rawVal('regCity'),rawVal('regState'),rawVal('regZip')),
    email:rawVal('regEmail').trim(),
    mobile:rawVal('regMobile').trim(),
    doi:rawVal('regDOI').trim(),
    lawFirm:rawVal('regLawFirm').trim(),
    device:rawVal('regDevice'),
    facility:rawVal('regFacility')||'Concussion Therapy Group',
    provider:rawVal('regProvider'),
    case:rawVal('regCase')||'Neuro 1'
  }
  // Checked before the save confirmation, so an incomplete record never gets as
  // far as asking "Save this patient?".
  const regMissing=registrationMissingFields()
  markRegistrationMissing(regMissing.map(f=>f[0]))
  if(regMissing.length){
    showToast('Please complete: '+regMissing.map(f=>f[1]).join(', '),'err')
    const firstEl=document.getElementById(regMissing[0][0])
    if(firstEl){
      firstEl.scrollIntoView({behavior:'smooth',block:'center'})
      try{firstEl.focus({preventScroll:true})}catch(e){try{firstEl.focus()}catch(e2){}}
    }
    return
  }
  if(!validRecoverArcId(rawVal('regRecoverArcId'))){
    showToast('A RecoverArc ID is letters, numbers and - _ . : only, starting with a letter or number.','err')
    return
  }
  // Warn before committing. Editing an existing record overwrites their saved
  // details, so make that explicit; a new patient just confirms the add.
  const editing=!!(regEditingPatientId&&getPatient(regEditingPatientId))
  const who=(d.firstName+' '+d.lastName).trim()
  const confirmed=await ctgConfirm(
    editing
      ? 'Save changes to '+who+'? This overwrites their saved patient details.'
      : 'Save '+who+' as a new patient?',
    {title:editing?'Save Changes':'Save Patient',okLabel:editing?'Save Changes':'Save Patient'}
  )
  if(!confirmed)return
  const now=new Date().toISOString()
  // regEditingPatientId is set when the user picked an existing patient from the
  // appointment-link picker - update that record in place instead of creating a
  // duplicate. Otherwise create a new patient.
  let patient=(regEditingPatientId?getPatient(regEditingPatientId):null)
  if(patient){
    patient.demographics=d
    patient.pendingAce=document.getElementById('regPendingAce').checked
    patient.notesPatientId=rawVal('regRecoverArcId').trim()
    patient.updatedAt=now
  }else{
    patient={
      id:'pt_'+Date.now()+'_'+Math.random().toString(16).slice(2),
      demographics:d,
      pendingAce:document.getElementById('regPendingAce').checked,
      notesPatientId:rawVal('regRecoverArcId').trim(),
      ace:null,
      billing:{statementDate:'',accountNo:'',status:'',charges:'',notes:''},
      notes:{text:''},
      createdAt:now,
      updatedAt:now
    }
    ctgPatients.push(patient)
  }
  regEditingPatientId=null
  persistPatients()
  clearRegistrationForm()
  selectedPatientId=patient.id
  renderPatientWorkflow()
  // Registration opened from an appointment's right-click menu (see
  // apptBlockCtxRegistration in appointments.js) links the new patient back
  // onto that appointment and returns to Appointments, instead of the
  // standalone flow's drop into Patient Lists.
  if(typeof apptRegLinkApptId!=='undefined'&&apptRegLinkApptId){
    const a=(typeof ctgAppointments!=='undefined'?ctgAppointments:[]).find(x=>x.id===apptRegLinkApptId)
    apptRegLinkApptId=null
    const banner=document.getElementById('regApptLinkBanner')
    if(banner)banner.style.display='none'
    if(a){
      a.patientId=patient.id
      a.patientName=naturalPatientName(patient)
      if(typeof persistAppointments==='function')persistAppointments()
      showToast('Patient linked to the appointment ✓')
      showPage('appointment')
      return
    }
  }
  showToast('Patient saved to Patient Lists ✓')
  showPage('patientLists')
}
function clearRegistrationForm(){
  ['regLastName','regFirstName','regMRN','regDOB','regAddressLine','regAddressLine2','regCity','regState','regZip','regEmail','regMobile','regDOI','regLawFirm','regRecoverArcId'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''})
  document.getElementById('regGender').selectedIndex=0
  markRegistrationMissing([])
  const dev=document.getElementById('regDevice'); if(dev)dev.selectedIndex=0
  document.getElementById('regPendingAce').checked=false
  const fac=document.getElementById('regFacility'); if(fac)fac.selectedIndex=0
  ctgRenderProviderPickers({regProvider:''})
  const cs=document.getElementById('regCase'); if(cs)cs.value='Neuro 1'
  regEditingPatientId=null
}
// Exit button beside "Save Patient": leave without saving. In the
// appointment-link flow, reuse its cancel handler (clears the form and returns
// to Appointments); otherwise just drop back to Patient Lists.
function exitRegistration(){
  if(typeof apptRegLinkApptId!=='undefined'&&apptRegLinkApptId&&typeof apptCancelRegistrationLink==='function'){apptCancelRegistrationLink();return}
  clearRegistrationForm()
  showPage('patientLists')
}

/* Registration edit mode. Opening Registration by right-clicking a patient's
   name on an appointment pre-fills the form with their existing record.
   regEditingPatientId tracks who is being edited: null means Save creates a
   new patient, set means Save updates that record in place. */
let regEditingPatientId=null

function fillRegistrationForm(p){
  const d=(p&&p.demographics)||{}
  const setV=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''}
  setV('regLastName',d.lastName);setV('regFirstName',d.firstName);setV('regMRN',d.mrn)
  setV('regDOB',d.dob);setV('regAddressLine',d.addressLine);setV('regAddressLine2',d.addressLine2)
  const csz=patientCityStateZip(d)
  setV('regCity',csz.city);setV('regState',csz.state);setV('regZip',csz.zip)
  setV('regEmail',d.email);setV('regMobile',d.mobile);setV('regDOI',d.doi)
  setV('regGender',d.gender);setV('regLawFirm',d.lawFirm);setV('regDevice',d.device)
  setV('regRecoverArcId',p&&p.notesPatientId)
  const fac=document.getElementById('regFacility');if(fac&&d.facility)fac.value=d.facility
  ctgRenderProviderPickers({regProvider:d.provider||''})
  const cs=document.getElementById('regCase');if(cs&&d.case)cs.value=d.case
  const pa=document.getElementById('regPendingAce');if(pa)pa.checked=!!(p&&p.pendingAce)
}
// Put the Registration form into edit mode for an existing patient (used by the
// appointment right-click flow). Returns true if the patient was found/loaded.
function regEditPatient(id){
  const p=getPatient(id)
  if(!p)return false
  fillRegistrationForm(p)
  regEditingPatientId=id
  const title=document.getElementById('regFormCardTitle');if(title)title.textContent='Edit Patient Details'
  const sub=document.getElementById('regFormCardSub');if(sub)sub.textContent='Editing '+naturalPatientName(p)
  return true
}

function patientSearchText(p){
  const d=p.demographics||{}
  return [fullPatientName(p),naturalPatientName(p),d.mrn,d.dob,d.doi,d.email,d.mobile,d.addressLine,d.addressLine2,d.cityStateZip,d.lawFirm].join(' ').toLowerCase()
}
function filteredPatientsForList(){
  const q=String(patientListSearchQuery||'').trim().toLowerCase()
  const rows=patientListRows()
  return q?rows.filter(p=>patientSearchText(p).includes(q)):rows
}
function patientListSearchLive(){
  const input=document.getElementById('patientListSearchInput')
  patientListSearchQuery=input?input.value:''
  renderPatientRows()
}
function searchPatientList(){
  const input=document.getElementById('patientListSearchInput')
  patientListSearchQuery=input?input.value:''
  const matches=filteredPatientsForList()
  renderPatientRows()
  if(matches.length===1){selectPatient(matches[0].id);showToast('Patient selected ✓')}
  else if(matches.length>1){showToast(matches.length+' matching patients found')}
  else if(patientListSearchQuery.trim()){showToast('No matching patient found','err')}
}
function clearPatientListSearch(){
  patientListSearchQuery=''
  const input=document.getElementById('patientListSearchInput')
  if(input)input.value=''
  renderPatientRows()
}
function patientDetailStatusBadges(p,forRow){
  const reExams=Array.isArray(p?.reExams)?p.reExams:[]
  const badges=[]
  /* Saved and pending are mutually exclusive. The pending chip used to hang off
     a dangling else attached to the signedAt check rather than to the ace one,
     so a chart with a saved Day 1 and a stale pendingAce flag showed both
     "Day 1 Saved" and the gold "Day 1" at once. */
  if(p?.ace)badges.push(patientDetailStatusPill('Day 1 Saved','green'))
  else if(p?.pendingAce)badges.push(patientDetailStatusPill('Day 1','gold'))
  if(p?.ace?.signedAt)badges.push(patientSignedBadge(p.ace))
  if(p?.initialExam?.savedAt)badges.push(patientDetailStatusPill(forRow?'Day 2 Submitted':'Day 2 Exam Submitted','blue'))
  if(p?.initialExam?.signedAt)badges.push(patientSignedBadge(p.initialExam))
  if(reExams.length)badges.push(patientDetailStatusPill(reExams.length+' Re-Exam'+(reExams.length!==1?'s':''),'purple'))
  if(p?.finalExam?.savedAt)badges.push(patientDetailStatusPill(forRow?'Final Submitted':'Final Exam Submitted','gold'))
  return badges.join('')
}
function patientDetailStatusPill(text,cls){return `<span class="pld-status ${cls}">${escHtml(text)}</span>`}
/* Signed/locked marker for record lists. Shows the padlock plus the version
   so a reviewer can see at a glance which records are closed, and which of
   those have been amended since signing, without opening each one. */
function patientSignedBadge(rec){
  if(!rec||!rec.signedAt)return ''
  const list=rec.amendments||[]
  const n=list.length
  const pending=list.filter(a=>a&&a.status==='pending').length
  const label='Signed'+(n?` \u00b7 v${1+n}`:'')+(pending?` \u00b7 ${pending} pending`:'')
  const title=`Signed by ${rec.signedBy||'unknown'} on ${dnFmtStamp(rec.signedAt)}`
    +(n?` \u2014 ${n} amendment${n===1?'':'s'}`:'')
  return `<span class="pld-status signed" title="${escHtml(title)}">`
    +`<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    +`${escHtml(label)}</span>`
}
function renderPatientRows(){
  const box=document.getElementById('patientListRows')
  if(!box)return
  const rows=filteredPatientsForList()
  const total=patientListRows().length
  const summary=document.getElementById('patientSearchSummary')
  const clearBtn=document.querySelector('.pld-clear-btn')
  if(summary)summary.textContent=patientListSearchQuery.trim()?`${rows.length} of ${total} patient${total!==1?'s':''} shown`:''
  if(clearBtn)clearBtn.style.display=patientListSearchQuery.trim()?'inline-flex':'none'
  if(total===0){box.innerHTML='<div class="patient-empty">'+patientListEmptyMessage()+'</div>';return}
  if(rows.length===0){box.innerHTML='<div class="patient-empty">No patients match your search.</div>';return}
  box.innerHTML=rows.map(p=>`
    <div class="patient-row pld-patient-row ${p.id===selectedPatientId?'active':''}" data-onclick="selectPatient('${p.id}')">
      <div class="pt-av">${escHtml(initialsForPatient(p))}</div>
      <div class="patient-row-main">
        <div class="patient-row-name">${escHtml(fullPatientName(p))}</div>
        <div class="pld-row-chips">${(patientListView==='inactive'||(patientListView==='all'&&isPatientInactive(p)))?patientDetailStatusPill('Inactive','gray')+patientCaseStatusPill(p):(currentUserIsLawyer()?patientCaseStatusPill(p):patientDetailStatusBadges(p,true))}</div>
      </div>
    </div>`).join('')
}
function renderPendingRows(){
  const box=document.getElementById('pendingAceRows')
  if(!box)return
  const rows=pendingPatients()
  if(rows.length===0){box.innerHTML='<div class="patient-empty">No patients are currently pending for Day 1.</div>';return}
  box.innerHTML='<div class="patient-list-panel">'+rows.map(p=>`
    <div class="patient-row" data-onclick="startAceForPatient('${p.id}')">
      <div class="pt-av" data-cs="${__cs}width:34px;height:34px;font-size:11px">${escHtml(initialsForPatient(p))}</div>
      <div class="patient-row-main"><div class="patient-row-name">${escHtml(fullPatientName(p))}</div><div class="patient-row-sub">${escHtml(patientSubline(p))}</div></div>
      <button class="btn btn-primary btn-sm" data-onclick="event.stopPropagation();startAceForPatient('${p.id}')">Open Day 1</button>
    </div>`).join('')+'</div>'
}
function renderIncompleteAceRows(){
  const box=document.getElementById('incompleteAceRows')
  if(!box)return
  const rows=ctgPatients.filter(p=>p.ace&&p.aceComplete===false&&!isPatientInactive(p))
  const total=rows.length
  const tag=document.getElementById('incompleteAceTotalTag'); if(tag)tag.textContent=total+' Incomplete'
  const count=document.getElementById('incompleteAceCount'); if(count)count.textContent=String(total)
  if(total===0){box.innerHTML='<div class="patient-empty">No incomplete Day 1 records. All saved forms are fully answered.</div>';return}
  box.innerHTML='<div class="patient-list-panel">'+rows.map(p=>`
    <div class="patient-row" data-onclick="startAceForPatient('${p.id}')">
      <div class="pt-av" data-cs="${__cs}width:34px;height:34px;font-size:11px;background:var(--aml);color:var(--amber)">${escHtml(initialsForPatient(p))}</div>
      <div class="patient-row-main"><div class="patient-row-name">${escHtml(fullPatientName(p))}</div><div class="patient-row-sub">${escHtml(patientSubline(p))}</div></div>
      <button class="btn btn-ghost btn-sm" data-cs="${__cs}border-color:var(--amber);color:var(--amber)" data-onclick="event.stopPropagation();downloadAceForPatient('${p.id}')">&#8595; PDF</button>
      <button class="btn btn-primary btn-sm" data-onclick="event.stopPropagation();startAceForPatient('${p.id}')">Resume Day 1</button>
    </div>`).join('')+'</div>'
}
function renderCompletedAceRows(){
  const box=document.getElementById('completedAceRows')
  if(!box)return
  const rows=ctgPatients.filter(p=>p.ace&&p.aceComplete===true&&!isPatientInactive(p))
  const total=rows.length
  const tag=document.getElementById('completedAceTotalTag'); if(tag)tag.textContent=total+' Completed'
  const count=document.getElementById('completedAceCount'); if(count)count.textContent=String(total)
  if(total===0){box.innerHTML='<div class="patient-empty">No completed Day 1 records yet. Complete and save a full Day 1 form to see it here.</div>';return}
  box.innerHTML='<div class="patient-list-panel">'+rows.map(p=>`
    <div class="patient-row" data-onclick="startAceForPatient('${p.id}')">
      <div class="pt-av" data-cs="${__cs}width:34px;height:34px;font-size:11px;background:var(--gl);color:var(--green)">${escHtml(initialsForPatient(p))}</div>
      <div class="patient-row-main"><div class="patient-row-name">${escHtml(fullPatientName(p))}</div><div class="patient-row-sub">${escHtml(patientSubline(p))}</div></div>
      <button class="btn btn-ghost btn-sm" data-onclick="event.stopPropagation();downloadAceForPatient('${p.id}')">&#8595; PDF</button>
      <button class="btn btn-ghost btn-sm" data-onclick="event.stopPropagation();downloadAceForPatient('${p.id}','word')">&#8595; Word</button>
      <button class="btn btn-green btn-sm" data-onclick="event.stopPropagation();startAceForPatient('${p.id}')">View Day 1</button>
    </div>`).join('')+'</div>'
}
function startDay2ForPatient(id){
  showPage('day2')
  const typeSel=document.getElementById('examTypeSelect')
  if(typeSel){typeSel.value='Day 2';if(typeof updateExamPageLabels==='function')updateExamPageLabels()}
  examPopulatePatientDropdown()
  const sel=document.getElementById('examPatientSelect')
  if(sel)sel.value=id
  examOnPatientSelect()
}
function renderPendingDay2Rows(){
  const box=document.getElementById('pendingDay2Rows')
  if(!box)return
  const rows=ctgPatients.filter(p=>p.ace&&p.aceComplete===true&&!(p.initialExam&&p.initialExam.savedAt)&&!isPatientInactive(p))
  const total=rows.length
  const tag=document.getElementById('pendingDay2TotalTag'); if(tag)tag.textContent=total+' Pending'
  const count=document.getElementById('pendingDay2Count')
  if(count){count.textContent=String(total);count.style.display=total?'inline-flex':'none'}
  if(total===0){box.innerHTML='<div class="patient-empty">No patients currently pending for Day 2. Complete a Day 1 record to see it here.</div>';return}
  box.innerHTML='<div class="patient-list-panel">'+rows.map(p=>`
    <div class="patient-row" data-onclick="startDay2ForPatient('${p.id}')">
      <div class="pt-av" data-cs="${__cs}width:34px;height:34px;font-size:11px;background:var(--aml);color:var(--amber)">${escHtml(initialsForPatient(p))}</div>
      <div class="patient-row-main"><div class="patient-row-name">${escHtml(fullPatientName(p))}</div><div class="patient-row-sub">${escHtml(patientSubline(p))}</div></div>
      <button class="btn btn-primary btn-sm" data-onclick="event.stopPropagation();startDay2ForPatient('${p.id}')">Start Day 2</button>
    </div>`).join('')+'</div>'
}
function selectPatient(id){selectedPatientId=id;patientDetailActiveTab='overview';patientDocumentsSearchQuery='';renderPatientWorkflow();renderPatientDetails(id)
  // On a phone the details stack BELOW the list, off-screen - a tap looked like it did nothing.
  if(window.innerWidth<=860){const box=document.getElementById('patientDetail');if(box)requestAnimationFrame(()=>box.scrollIntoView({behavior:'smooth',block:'start'}))}
}
/* ── Dashboard: aggregate insight (kept distinct from the sidebar queues) ── */
function dashTimeAgo(iso){
  const t=Date.parse(iso); if(isNaN(t))return 'recently'
  const s=Math.floor((Date.now()-t)/1000)
  if(s<60)return 'just now'
  const m=Math.floor(s/60); if(m<60)return m+'m ago'
  const h=Math.floor(m/60); if(h<24)return h+'h ago'
  const d=Math.floor(h/24); if(d<30)return d+'d ago'
  return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
}
function renderDashboard(){
  const mount=document.getElementById('dashboardMount'); if(!mount)return
  const src=Array.isArray(ctgPatients)?ctgPatients:[]
  const all=(typeof patientsVisibleToCurrentUser==='function')?patientsVisibleToCurrentUser(src):src
  const total=all.length
  let underTx=0,discharged=0,adminDisch=0,aceDone=0,pending=0,initialCount=0,finalCount=0,reCount=0,outstanding=0,dos=0,patientsWithBalance=0
  const balanceLeaders=[]
  all.forEach(p=>{
    if(p.adminDischarged)adminDisch++
    else if(p.dischargeDate&&String(p.dischargeDate).trim())discharged++
    else underTx++
    if(p.pendingAce&&!p.ace)pending++
    if(p.ace&&p.aceComplete)aceDone++
    if(p.initialExam&&p.initialExam.savedAt)initialCount++
    if(p.finalExam&&p.finalExam.savedAt)finalCount++
    if(Array.isArray(p.reExams))reCount+=p.reExams.filter(r=>r&&r.savedAt).length
    // Net balance (billed minus AR payments/write-offs) - same figure the
    // Billing tab and AR Summary show, so the dashboard never disagrees with them.
    let bal=0
    try{bal=(typeof patientBillingBalance==='function')?patientBillingBalance(p):deriveBillingServices(p).reduce((s,g)=>s+((g.subtotal&&g.subtotal.balance)||0),0)}catch(e){}
    outstanding+=bal
    if(bal>0.005){patientsWithBalance++;balanceLeaders.push({id:p.id,name:naturalPatientName(p),bal})}
    try{dos+=Number(computeTotalDatesOfService(p))||0}catch(e){}
  })
  const dischargedAll=discharged+adminDisch
  const money=n=>'$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  const user=(typeof window.ctgCurrentUser==='function'&&window.ctgCurrentUser())||{}
  const hr=new Date().getHours()
  const greet=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening'
  // First name only, prefixed with the account type. Some display names start
  // with a role word ("Admin Gio"), which would otherwise read "Administrator Admin".
  // Law-firm users get their first name alone, without "Law Firm" in front of it.
  const greetRole=(user.role!=='lawyer'&&typeof window.ctgRoleLabel==='function')?window.ctgRoleLabel(user.role):''
  const greetName=(String(user.displayName||'').split(/\s+/).filter(w=>w&&!/^(admin|administrator|ta|comp|compliance|provider|lawyer)$/i.test(w))[0])||user.username||'there'
  const dateStr=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  const canAdd=!(currentUserIsLawyer()||currentUserIsProvider()||currentUserIsTA())
  const acts=[]
  if(canAdd)acts.push(`<button class="dash-cta dash-cta-primary" data-onclick="showPage('registration')"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Patient</button>`)
  acts.push(`<button class="dash-cta" data-onclick="showPage('patientLists')">Patient Lists</button>`)
  if(pending>0)acts.push(`<button class="dash-cta" data-onclick="showPage('pendingAce')">Review ${pending} Pending Day 1</button>`)
  const hero=`<div class="dash-welcome"><div class="dash-welcome-glow"></div>
    <div class="dash-welcome-main">
      <div class="dash-greeting">${greet}, ${escHtml(greetRole)}${greetRole?' ':''}<span>${escHtml(greetName)}</span></div>
      <div class="dash-date">${escHtml(dateStr)}</div>
      <div class="dash-summary"><span class="dash-stat"><strong>${total}</strong> patient${total!==1?'s':''}</span><span class="dash-stat"><strong>${underTx}</strong> under treatment</span><span class="dash-stat"><strong>${dischargedAll}</strong> discharged</span><span class="dash-stat"><strong>${pending}</strong> pending ACE</span><span class="dash-stat"><strong>${money(outstanding)}</strong> billed</span></div>
    </div>
    <div class="dash-welcome-actions">${acts.join('')}</div>
  </div>`
  const IC={
    p:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    a:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    c:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    d:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
  }
  const kpi=(label,value,sub,cls,icon,strong)=>`<div class="dash-kpi ${cls||''}"><span class="dash-kpi-accent"></span><div class="dash-kpi-top"><span class="dash-kpi-label">${escHtml(label)}</span><span class="dash-kpi-ico">${icon}</span></div><div class="dash-kpi-value${strong?' '+strong:''}">${value}</div><div class="dash-kpi-sub">${sub||''}</div></div>`
  const kpis=`<div class="dash-kpi-grid">
    ${kpi('Total Patients',total,total===1?'1 record':total+' records','k-indigo',IC.p)}
    ${kpi('Under Treatment',underTx,total?Math.round(underTx/total*100)+'% of caseload':'—','k-blue',IC.a)}
    ${kpi('Discharged',dischargedAll,adminDisch?(adminDisch+' admin-discharged'):'completed care','k-green',IC.c)}
    ${kpi('Outstanding Billing',money(outstanding),'across all statements','k-amber',IC.d,outstanding>0?'is-amber':'')}
  </div>`
  const stages=[['Registered',total],['Day 1 Completed',aceDone],['Day 2 Exam',initialCount],['Final Exam',finalCount],['Discharged',dischargedAll]]
  const maxStage=Math.max(1,total)
  const funnel=`<div class="pld-card dash-card"><div class="pld-section-title">Treatment Pipeline</div><div class="dash-funnel">${stages.map(s=>{
    const pct=total?Math.round(s[1]/total*100):0
    const w=Math.max(3,Math.round(s[1]/maxStage*100))
    return `<div class="dash-funnel-row"><div class="dash-funnel-label">${escHtml(s[0])}</div><div class="dash-funnel-track"><div class="dash-funnel-fill" data-cs="${__cs}width:${w}%"></div></div><div class="dash-funnel-val">${s[1]}<span class="dash-funnel-pct">${pct}%</span></div></div>`
  }).join('')}</div><div class="dash-hint">Share of the ${total} registered patient${total!==1?'s':''} who have reached each stage.</div></div>`
  // onclick is optional - only the Schedule card's Today/Upcoming tiles link
  // anywhere; Exam Activity and Billing's tiles are plain counts with no
  // single destination page, so they stay non-interactive divs.
  const mini=(label,value,onclick)=>onclick
    ?`<button type="button" class="dash-mini dash-mini-link" data-onclick="${onclick}"><div class="dash-mini-val">${value}</div><div class="dash-mini-label">${escHtml(label)}</div></button>`
    :`<div class="dash-mini"><div class="dash-mini-val">${value}</div><div class="dash-mini-label">${escHtml(label)}</div></div>`
  const examCard=`<div class="pld-card dash-card"><div class="pld-section-title">Exam Activity</div><div class="dash-mini-grid">
    ${mini('Day 2 Exams',initialCount)}
    ${mini('Re-Examinations',reCount)}
    ${mini('Final Exams',finalCount)}
    ${mini('Dates of Service',dos)}
  </div></div>`
  const canPage=key=>(typeof window.ctgCanPage!=='function')||window.ctgCanPage(key)

  let scheduleCard=''
  if(canPage('appointment')){
    const localISODate=d=>(typeof apptISODate==='function')?apptISODate(d):(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))
    const todayISO=localISODate(new Date())
    const now=new Date()
    const nowMin=now.getHours()*60+now.getMinutes()
    const toMin=t=>(typeof apptMinutesFromTime==='function')?apptMinutesFromTime(t):(()=>{const m=/^(\d\d):(\d\d)/.exec(t||'');return m?(+m[1]*60+ +m[2]):null})()
    let todays=[],upcomingCount=0
    try{
      const list=(typeof ctgAppointments!=='undefined'&&Array.isArray(ctgAppointments))?ctgAppointments:[]
      todays=list.filter(a=>a.date===todayISO).sort((a,b)=>String(a.start).localeCompare(String(b.start)))
      upcomingCount=todays.filter(a=>{const m=toMin(a.start);return m==null||m>=nowMin}).length
    }catch(e){}

    // Both tiles stay on show even at zero - "0 today" is a real answer, and
    // swapping the counts for an empty-state sentence would make the card
    // change shape depending on the day.
    scheduleCard=`<div class="pld-card dash-card dash-schedule-card"><div class="dash-card-hd"><div class="pld-section-title">Today's Schedule</div><button type="button" class="dash-card-link" data-onclick="showPage('appointment')">Open calendar →</button></div>
      <div class="dash-mini-grid">${mini('Today',todays.length,"showPage('appointment')")}${mini('Upcoming',upcomingCount,"showPage('appointment')")}</div>
    </div>`
  }

  // Billing & Collections - net outstanding balance (same figure as the
  // Billing tab / AR Summary), the patients carrying the largest balances,
  // and quick shortcuts into those pages.
  let billingCard=''
  if(canPage('arSummary')||canPage('collectionMgmt')){
    const links=[]
    if(canPage('arSummary'))links.push(`<button type="button" class="dash-cta-mini" data-onclick="showPage('arSummary')">AR Summary</button>`)
    if(canPage('collectionMgmt'))links.push(`<button type="button" class="dash-cta-mini" data-onclick="showPage('collectionMgmt')">Collections</button>`)
    const topBalances=balanceLeaders.slice().sort((a,b)=>b.bal-a.bal).slice(0,3)
    // Real buttons now that .dash-appt-row carries hover/focus affordance -
    // a row that looks clickable and silently isn't is worse than plain text.
    const balRows=topBalances.map(b=>`<button type="button" class="dash-appt-row" data-onclick="showPage('patientLists');selectPatient('${escHtml(b.id||'')}')"><span class="dash-appt-dot" data-cs="${__cs}background:var(--accent)"></span><span class="dash-appt-main"><span class="dash-appt-name">${escHtml(b.name)}</span></span><span class="dash-appt-amt">${escHtml(money(b.bal))}</span></button>`).join('')
    billingCard=`<div class="pld-card dash-card dash-card-flex"><div class="pld-section-title">Billing &amp; Collections</div>
      <div class="dash-mini-grid" data-cs="${__cs}margin-bottom:12px">${mini('Outstanding',money(outstanding))}${mini('Patients Owing',patientsWithBalance)}</div>
      <div class="dash-card-fill">${balRows?`<div class="dash-appt-list">${balRows}</div>`:'<div class="dash-hint" data-cs="'+__cs+'margin-top:0">No outstanding balances.</div>'}</div>
      <div class="dash-card-actions">${links.join('')}</div>
    </div>`
  }

  const recent=all.slice().filter(p=>p.updatedAt).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,6)
  const recentHtml=`<div class="pld-card dash-card"><div class="pld-section-title">Recent Activity</div>${recent.length?`<div class="dash-recent">${recent.map(p=>`<button type="button" class="dash-recent-row" data-onclick="showPage('patientLists');selectPatient('${p.id}')"><span class="dash-recent-av">${escHtml(initialsForPatient(p))}</span><span class="dash-recent-main"><span class="dash-recent-name">${escHtml(naturalPatientName(p))}</span><span class="dash-recent-sub">Updated ${escHtml(dashTimeAgo(p.updatedAt))}</span></span>${patientCaseStatusPill(p)}</button>`).join('')}</div>`:'<div class="pld-empty-state">No recent activity yet.</div>'}</div>`
  const secondRow=(examCard||billingCard)?`<div class="dash-two-row">${examCard}${billingCard}</div>`:''
  mount.innerHTML=hero+(total?kpis+scheduleCard+funnel+secondRow+recentHtml:'<div class="pld-card"><div class="pld-empty-state">No patients yet. Add your first patient to see your dashboard come to life.</div></div>')
}
function patientDetailOrdinalExamLabel(index){
  const words=['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth']
  return (words[index]||((index+1)+ordSuffix(index+1)))+' Re-Examination'
}
function patientDetailAccordion(title,iconText,icoClass,bodyHtml,toolsHtml,metaText){
  return `<details class="card patient-detail-accordion">
    <summary class="card-hd">
      <div class="card-ico ${icoClass}">${escHtml(iconText)}</div>
      <div data-cs="${__cs}min-width:0;flex:1"><div class="card-title">${escHtml(title)}</div>${metaText?`<div class="small-muted">${escHtml(metaText)}</div>`:''}</div>
      ${toolsHtml?`<div class="section-tools" data-onclick="event.stopPropagation()" data-onmousedown="event.stopPropagation()">${toolsHtml}</div>`:''}
      <div class="accordion-chevron" aria-hidden="true">⌄</div>
    </summary>
    <div class="card-body">${bodyHtml}</div>
  </details>`
}
function patientDetailGrid(items){
  return `<div class="detail-grid">${items.map(([l,v,wide])=>`<div class="detail-item ${wide?'full':''}"><div class="detail-label">${escHtml(l)}</div><div class="detail-value">${escHtml(plainOrDash(v))}</div></div>`).join('')}</div>`
}
function patientExamSummaryGrid(exam){
  return patientDetailGrid([
    ['Examination Date',exam?.examinationDate||exam?.sessionDate],
    ['Saved Date',exam?.savedDisplay||plainOrDash(exam?.savedAt)],
    ['Uploaded Files',countDay2UploadedFiles(exam?.testUploads||{})+' file(s)'],
    ['Test 1 Part PDF(s)',summarizeDay2Test1UploadParts(exam?.testUploads||{})],
    ['Test 2 Eye PDF(s)',summarizeDay2Test2UploadTypes(exam?.testUploads||{})],
    ['Test 3 PDF(s)',summarizeDay2Test3UploadNames(exam?.testUploads||{})],
    ['Test 3 Ear Results',summarizeDay2EarResults(exam?.test3EarResults||{}),true]
  ])
}
function patientDetailIconSvg(type){
  const icons={
    overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    exams:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    comparison:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="4"/><rect x="4" y="10" width="4" height="10"/><rect x="16" y="6" width="4" height="14"/></svg>',
    ace:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>',
    notes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    billing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="7" y1="14" x2="17" y2="14"/><line x1="7" y1="18" x2="13" y2="18"/></svg>',
    documents:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    fcr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    dx:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .2.3"/><path d="M8 15v1a6 6 0 0 0 12 0v-4"/><circle cx="20" cy="10" r="2"/></svg>'
  }
  return icons[type]||icons.overview
}
function patientDetailTab(tab,label,icon){
  return `<button type="button" class="pld-tab ${patientDetailActiveTab===tab?'active':''}" data-onclick="setPatientDetailTab('${tab}')">${patientDetailIconSvg(icon||tab)} ${escHtml(label)}</button>`
}
function patientTabAllowed(tab){if(currentUserIsLawyer())return tab==='billing'||tab==='fcr';return typeof window.ctgCanSection!=='function'||window.ctgCanSection('patientLists','pl.'+tab)}
/* Cards that live inside the Overview tab but carry their own Access Control
   section (Diagnosis, Policy Limits). Defaults to visible when sections aren't
   configured, matching ctgCanSection's own legacy-full-access behaviour. */
function patientOverviewSectionAllowed(sec){return typeof window.ctgCanSection!=='function'||window.ctgCanSection('patientLists',sec)}
function setPatientDetailTab(tab){if(!patientTabAllowed(tab))return;if(tab!=='documents'){patientDocumentViewState=null;patientDocumentsSearchQuery=''}patientDetailActiveTab=tab;if(selectedPatientId)renderPatientDetails(selectedPatientId)}
function togglePatientReExamRecords(id){
  const key=String(id||'')
  if(!key)return
  patientReExamRecordsVisible[key]=!patientReExamRecordsVisible[key]
  patientDetailActiveTab='overview'
  renderPatientDetails(key)
}
function patientDetailExamDate(exam){
  return day2FormatAnyDate(exam?.examinationDate||exam?.sessionDate)||plainOrDash(exam?.examinationDate||exam?.sessionDate||exam?.savedDisplay||exam?.savedAt)
}
function patientDetailSavedText(exam){return exam?.savedDisplay||plainOrDash(exam?.savedAt)}
function patientDetailPrimaryDx(ace){
  if((ace?.diagnosisCodes||[]).length)return ace.diagnosisCodes[0]
  return ace?.diagnosis||ace?.diagnosisText||''
}
function patientDetailMetaItem(icon,label,value){
  return `<span>${patientDetailIconSvg(icon)}<strong>${escHtml(label)}:</strong> ${escHtml(plainOrDash(value))}</span>`
}
function pldKv(label,value){return `<div class="pld-kv-label">${escHtml(label)}:</div><div class="pld-kv-value">${escHtml(plainOrDash(value))}</div>`}
function pldInfoCard(title,icon,items,bodyHtml){
  return `<div class="pld-info-card"><div class="pld-info-title">${patientDetailIconSvg(icon)} ${escHtml(title)}</div><div class="pld-kv">${items.map(x=>pldKv(x[0],x[1])).join('')}</div>${bodyHtml||''}</div>`
}
function patientDetailExamActionCalls(patientId,arrayKey,index){
  const idx=arrayKey==='reExams'?','+Number(index||0):''
  const view=`viewPatientExamResult('${patientId}','${arrayKey}'${idx})`
  const edit=`openPatientExamDetail('${patientId}','${arrayKey}'${idx})`
  let download=`exportInitialExamPDF(null,'${patientId}')`
  let remove=`clearPatientSection('${patientId}','${arrayKey}')`
  if(arrayKey==='reExams'){
    download=`exportInitialExamPDF(null,'${patientId}',${Number(index||0)})`
    remove=`deleteExamAttempt('${patientId}','reExams',${Number(index||0)})`
  }else if(arrayKey==='finalExam'){
    download=`exportFinalExamPDF(null,'${patientId}')`
    remove=`unsetFinalExam('${patientId}')`
  }
  return {view,edit,download,remove}
}
function renderPatientExamRow(p,arrayKey,index,exam,label,kind,options){
  options=options||{}
  const saved=!!exam?.savedAt
  const date=saved?patientDetailExamDate(exam):'No date'
  const sub=saved?(options.sub||'Submitted in Exams section'):(options.emptySub||'No saved record yet')
  const c=patientDetailExamActionCalls(p.id,arrayKey,index)
  const provider=currentUserIsProvider()
  const extra=options.extraActions||''
  const actions=saved?`
    <button class="btn btn-primary btn-sm" data-onclick="${c.view}">View Result</button>
    ${provider?'':`<button class="btn btn-ghost btn-sm" data-onclick="${c.edit}">Edit</button>`}
    <button class="btn btn-ghost btn-sm" data-onclick="${c.download}">Download PDF</button>
    ${provider?'':extra}
  `:(provider?'<span class="small-muted">—</span>':(options.emptyActions||''))
  return `<div class="pld-exam-row">
    <div class="pld-exam-avatar ${kind}">${escHtml(kind.toUpperCase())}</div>
    <div><div class="pld-exam-title">${escHtml(label)}</div><div class="pld-exam-sub">${escHtml(sub)}</div></div>
    <div class="pld-exam-date">${escHtml(date)}</div>
    <div class="pld-exam-actions">${actions||'<span class="small-muted">—</span>'}</div>
  </div>`
}
function renderPatientExamDetailRecord(p,arrayKey,index,exam,label,kind){
  const isFinal=arrayKey==='reExams' && p.finalExam&&p.finalExam.savedAt===exam.savedAt
  const c=patientDetailExamActionCalls(p.id,arrayKey,index)
  const provider=currentUserIsProvider()
  const finalAction=(provider||arrayKey!=='reExams')?'':(isFinal?`<button class="btn btn-ghost btn-sm" data-onclick="unsetFinalExam('${p.id}')">Unset Final</button>`:`<button class="btn btn-ghost btn-sm" data-onclick="setReExamAsFinal('${p.id}',${Number(index||0)})">Set as Final</button>`)
  return `<div class="pld-record-card">
    <div class="pld-record-head">
      <div class="pld-record-title"><span class="pld-exam-avatar ${kind}" data-cs="${__cs}width:34px;height:34px">${escHtml(kind.toUpperCase())}</span><span>${escHtml(label)}</span>${isFinal?patientDetailStatusPill('Final Exam','gold'):''}${patientSignedBadge(exam)}</div>
      <div class="pld-exam-actions">
        <button class="btn btn-primary btn-sm" data-onclick="${c.view}">View Result</button>
        ${provider?'':`<button class="btn btn-ghost btn-sm" data-onclick="${c.edit}">Edit</button>`}
        <button class="btn btn-ghost btn-sm" data-onclick="${c.download}">Download PDF</button>
        ${finalAction}
        ${provider?'':`<button class="btn btn-ghost btn-sm" data-onclick="${c.remove}">Delete</button>`}
      </div>
    </div>
    ${patientExamSummaryGrid(exam)}
  </div>`
}
function renderPatientExamsOverview(p){
  const initial=p.initialExam||{}
  const reExams=Array.isArray(p.reExams)?p.reExams:[]
  const finalExam=p.finalExam||{}
  const latestRe=reExams.length?patientDetailExamDate(reExams[reExams.length-1]):'—'
  const reRecordsVisible=!!patientReExamRecordsVisible[p.id]
  const initialRow=renderPatientExamRow(p,'initialExam',undefined,initial,'Day 2','ie',{emptyActions:`<button class="btn btn-primary btn-sm" data-onclick="startInitialExamForPatient('${p.id}')">+ Day 2 Exam</button>`})
  const reRecordsButton=reExams.length?`<button class="btn btn-ghost btn-sm" data-onclick="togglePatientReExamRecords('${p.id}')">${reRecordsVisible?'Hide Records':'View Records'}</button>`:`<button class="btn btn-ghost btn-sm" data-onclick="setPatientDetailTab('exams')">View Records</button>`
  const reRow=`<div class="pld-exam-row">
    <div class="pld-exam-avatar re">RE</div>
    <div><div class="pld-exam-title">Re-Examination</div><div class="pld-exam-sub">${reExams.length} saved record${reExams.length!==1?'s':''}</div></div>
    <div class="pld-exam-date">${reExams.length?'Latest: '+escHtml(latestRe):'No records'}</div>
    <div class="pld-exam-actions">${reRecordsButton}${currentUserIsProvider()?'':`<button class="btn btn-ghost btn-sm" data-onclick="openExamForPatient('${p.id}','Re-Examination')">+ New Re-Exam</button>`}</div>
  </div>`
  const reRecords=reRecordsVisible&&reExams.length?`<div class="pld-detail-list">${reExams.map((rx,i)=>renderPatientExamDetailRecord(p,'reExams',i,rx,patientDetailOrdinalExamLabel(i),'re')).join('')}</div>`:''
  const finalRow=renderPatientExamRow(p,'finalExam',undefined,finalExam,'Final Examination','fe',{emptyActions:`<button class="btn btn-ghost btn-sm" data-onclick="openExamForPatient('${p.id}','Final Examination')">+ Final Exam</button>`})
  return `<div class="pld-card"><div class="pld-section-title">Examinations</div><div class="pld-exam-list">${initialRow}${reRow}${reRecords}${finalRow}</div></div>`
}
function renderPatientOverviewPanel(p){
  const d=p.demographics||{}, ace=p.ace||{}, billing=p.billing||{}, initial=p.initialExam||{}, reExams=Array.isArray(p.reExams)?p.reExams:[], dailyNotes=Array.isArray(p.dailyNotes)?p.dailyNotes:[]
  const initialDate=initial.examinationDate||initial.sessionDate||ace.dateOfService
  const dosItems=[[ 'Date of Injury (DOI)',d.doi ],[ 'Initial DOS',initialDate ],[ 'Discharge Date',p.dischargeDate ],[ 'Total Dates of Service',computeTotalDatesOfService(p) ]]
  const overviewCards=`<div class="pld-card"><div class="pld-section-title">Overview</div><div class="pld-overview-grid">
    ${pldInfoCard('Demographics','user',[[ 'Gender',d.gender ],[ 'Phone',d.mobile ],[ 'Email',d.email ],[ 'Address',[d.addressLine,d.addressLine2,d.cityStateZip].filter(Boolean).join(', ') ],[ 'Law Firm',d.lawFirm ]])}
    ${pldInfoCard('Injury / DOS Details','heart',dosItems)}
    ${patientOverviewSectionAllowed('pl.policyLimits')?policyLimitsCardHtml(p):''}
  </div></div>`
  const provider=currentUserIsProvider()
  const aceSub=`${ace.savedAt?'Day 1 saved':'No Day 1 saved'}${ace.dateOfService?'<br>DOS: '+escHtml(ace.dateOfService):''}`
  const billSub=`${billing.statementDate||billing.accountNo?'Statement available':'No statement details'}${billing.statementDate?'<br>Updated: '+escHtml(billing.statementDate):''}`
  // Mini cards mirror the patient tabs - only show cards for tabs this account can open.
  const miniCards=[]
  if(patientTabAllowed('ace'))miniCards.push(`<div class="pld-mini-card"><div class="pld-mini-head"><div class="pld-mini-avatar ace">D1</div><div class="pld-mini-info"><div class="pld-mini-title">ACE</div><div class="pld-mini-sub">${aceSub}</div></div></div><div class="pld-mini-actions"><button class="btn btn-ghost btn-sm" data-onclick="setPatientDetailTab('ace')">View Day 1</button><button class="btn btn-ghost btn-sm" data-onclick="startAceForPatient('${p.id}')">Edit ACE</button></div></div>`)
  if(patientTabAllowed('notes'))miniCards.push(`<div class="pld-mini-card"><div class="pld-mini-head"><div class="pld-mini-avatar dn">DN</div><div class="pld-mini-info"><div class="pld-mini-title">Daily Notes</div><div class="pld-mini-sub">${dailyNotes.length} saved note${dailyNotes.length!==1?'s':''}</div></div></div><div class="pld-mini-actions">${provider?`<button class="btn btn-ghost btn-sm" data-onclick="setPatientDetailTab('notes')">View Notes</button>`:`<button class="btn btn-ghost btn-sm" data-onclick="openDailyNoteForPatient('${p.id}')">+ New Note</button>`}</div></div>`)
  if(patientTabAllowed('billing'))miniCards.push(`<div class="pld-mini-card"><div class="pld-mini-head"><div class="pld-mini-avatar bi">BI</div><div class="pld-mini-info"><div class="pld-mini-title">Billing</div><div class="pld-mini-sub">${billSub}</div></div></div><div class="pld-mini-actions"><button class="btn btn-ghost btn-sm" data-onclick="viewBillingStatement('${p.id}')">View Statement</button><button class="btn btn-ghost btn-sm" data-onclick="downloadBillingStatement('${p.id}')">Download Statement</button></div></div>`)
  const mini=miniCards.length?`<div class="pld-mini-grid${miniCards.length===1?' pld-mini-grid--solo':''}">${miniCards.join('')}</div>`:''
  const dxSection=patientOverviewSectionAllowed('pl.diagnosis')?diagnosisSectionHtml(p):''
  return `<div class="pld-panel">${overviewCards}${renderPatientExamsOverview(p)}${dxSection}${mini}</div>`
}
function renderPatientExamsPanel(p){
  const initial=p.initialExam||{}, reExams=Array.isArray(p.reExams)?p.reExams:[], finalExam=p.finalExam||{}
  const provider=currentUserIsProvider()
  const initialBlock=initial.savedAt?renderPatientExamDetailRecord(p,'initialExam',undefined,initial,'Day 2','ie'):`<div class="pld-empty-state">No Day 2 saved yet.${provider?'':`<br><button class="btn btn-primary btn-sm" data-cs="${__cs}margin-top:12px" data-onclick="startInitialExamForPatient('${p.id}')">+ Day 2 Exam</button>`}</div>`
  const reBlocks=reExams.length?reExams.map((rx,i)=>renderPatientExamDetailRecord(p,'reExams',i,rx,patientDetailOrdinalExamLabel(i),'re')).join(''):`<div class="pld-empty-state">No Re-Examination records yet.${provider?'':`<br><button class="btn btn-ghost btn-sm" data-cs="${__cs}margin-top:12px" data-onclick="openExamForPatient('${p.id}','Re-Examination')">+ New Re-Exam</button>`}</div>`
  const finalBlock=finalExam.savedAt?renderPatientExamDetailRecord(p,'finalExam',undefined,finalExam,'Final Examination','fe'):`<div class="pld-empty-state">No Final Examination saved yet.${provider?'':`<br><button class="btn btn-ghost btn-sm" data-cs="${__cs}margin-top:12px" data-onclick="openExamForPatient('${p.id}','Final Examination')">+ Final Exam</button>`}</div>`
  return `<div class="pld-panel"><div class="pld-card"><div class="pld-section-title">Exams</div><div class="pld-detail-list">${initialBlock}<div class="sdiv"><span>Re-Examinations</span></div>${reBlocks}<div class="sdiv"><span>Final Examination</span></div>${finalBlock}</div></div></div>`
}
/* Comparison tab. A chronological, side-by-side view of every uploaded exam
   result PDF (Sway, Reflex, Shoebox) across the patient's initial, re- and
   final examinations, so progression can be compared and any PDF opened in
   place. Reads the same testUploads the Exams tab renders. */
function comparisonExamSortKey(e){
  const d=Date.parse(e.exam.examinationDate||e.exam.sessionDate||'')
  if(!isNaN(d))return d
  const s=Date.parse(e.exam.savedAt||'')
  return isNaN(s)?0:s
}
function patientComparisonExams(p){
  const list=[]
  if(p.initialExam&&p.initialExam.savedAt)list.push({arrayKey:'initialExam',index:undefined,label:'Day 2',kind:'ie',exam:p.initialExam})
  const reExams=Array.isArray(p.reExams)?p.reExams:[]
  reExams.forEach((rx,i)=>{
    if(rx&&rx.savedAt)list.push({arrayKey:'reExams',index:i,label:patientDetailOrdinalExamLabel(i),kind:'re',exam:rx,isFinal:reExamIsDesignatedFinal(p,rx)})
  })
  const fx=p.finalExam
  // Only add a distinct Final column when it isn't already one of the re-exams
  // above (a re-exam can be designated as the Final - that column is tagged).
  if(fx&&fx.savedAt&&!reExams.some(rx=>rx&&rx.savedAt===fx.savedAt))list.push({arrayKey:'finalExam',index:undefined,label:'Final Examination',kind:'fe',exam:fx})
  return list.slice().sort((a,b)=>comparisonExamSortKey(a)-comparisonExamSortKey(b))
}
// Comparison tab state: which result type, and which exam PDF is shown on each
// side. Keys are "arrayKey:index:fileIndex"; null = fall back to first/last.
let comparisonTestKey='test1'
let comparisonSel={left:null,right:null}
let _cmpFrameSeq=0
let _cmpFrameUrls={}
let _cmpBlobCache={}
let _cmpMergeTasks={}
let _cmpMergeBlobCache={}
let _cmpHydrateTimer=null
// Flat, chronological list of every uploaded PDF for one test type across the
// patient's exams - used only for the tab count badge (total files, not exams).
function comparisonPdfEntries(p,testKey){
  const out=[]
  patientComparisonExams(p).forEach(e=>{
    examTestPdfEntries(normalizeDay2Uploads(e.exam.testUploads),testKey).forEach(o=>{
      out.push({
        key:e.arrayKey+':'+(e.index===undefined?-1:e.index)+':'+o.i,
        examLabel:e.label+(e.isFinal?' (Final)':''),
        examDate:patientDetailExamDate(e.exam),
        kind:e.kind,
        name:examTestFileDisplayName(o.f,testKey),
        f:o.f
      })
    })
  })
  return out
}
// One entry per exam rather than per file, which is the unit a column
// compares. Files uploaded together for the same exam, such as a left-eye and
// right-eye pupillometry PDF from one session, stay grouped under that exam
// instead of being spread across two columns as independent results.
function comparisonExamGroups(p,testKey){
  const out=[]
  patientComparisonExams(p).forEach(e=>{
    const files=examTestPdfEntries(normalizeDay2Uploads(e.exam.testUploads),testKey)
    if(!files.length)return
    out.push({
      key:e.arrayKey+':'+(e.index===undefined?-1:e.index),
      examLabel:e.label+(e.isFinal?' (Final)':''),
      examDate:patientDetailExamDate(e.exam),
      kind:e.kind,
      files:files.map(o=>({name:examTestFileDisplayName(o.f,testKey),eye:(o.f&&o.f.eyeType)?String(o.f.eyeType):'',f:o.f}))
    })
  })
  return out
}
// One file's viewer: the exact stored PDF in an iframe (bytes hydrated to a
// blob URL after render), an image inline, or the extracted-text fallback.
function comparisonFileViewerHtml(f,name){
  const url=f.pdfDataUrl||f.dataUrl
  if(url){
    if(/^data:image\//i.test(url)||String(f.type||'').toLowerCase().startsWith('image/')){
      return `<div class="cmp-doc-img-wrap"><img class="cmp-doc-img" src="${escHtml(url)}" alt="${escHtml(name)}"></div>`
    }
    const fid='cmpf'+(++_cmpFrameSeq)
    _cmpFrameUrls[fid]=url
    return `<iframe id="${fid}" class="cmp-pdf-frame" title="${escHtml(name)}"></iframe>`
  }
  const rawText=String(f.text||'').trim()
  if(rawText)return `<div class="cmp-doc-text">${escHtml(rawText)}</div><div class="day2-result-note" data-cs="${__cs}margin:12px">The exact original PDF was not stored for this upload. Re-upload it on the exam to view its full layout.</div>`
  return '<div class="cmp-empty-viewer">No viewable file stored for this upload.</div>'
}
// Combines 2+ uploaded PDFs (bytes only - text-only fallbacks can't be
// merged) into one PDF document via pdf-lib, oldest upload first ("the first
// uploaded is the one on top"), and returns a blob: URL to the merged file.
// Reuses the same merge approach as the Final Case Report (buildFCRDoc).
function comparisonMergePdfs(urlList){
  return new Promise((resolve,reject)=>{
    loadPdfLib(async()=>{
      try{
        const PDFLib=window.PDFLib
        const merged=await PDFLib.PDFDocument.create()
        for(const url of urlList){
          try{
            const bytes=dataUrlToBytes(url)
            if(!bytes)continue
            const src=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true})
            const pages=await merged.copyPages(src,src.getPageIndices())
            pages.forEach(pg=>merged.addPage(pg))
          }catch(fileErr){console.error('Comparison PDF merge: one file failed, skipping',fileErr)}
        }
        const outBytes=await merged.save()
        resolve(URL.createObjectURL(new Blob([outBytes],{type:'application/pdf'})))
      }catch(e){reject(e)}
    })
  })
}
// One column's viewer for a whole exam group. A single file fills the column;
// two or more uploaded together for that exam are merged into one combined
// PDF rather than offered as separate comparison choices, since they are one
// paired result and not two things to compare.
function comparisonGroupViewerHtml(g){
  if(!g||!g.files.length)return '<div class="cmp-empty-viewer">No file selected.</div>'
  if(g.files.length===1)return comparisonFileViewerHtml(g.files[0].f,g.files[0].name)
  // Oldest upload first, per the requested ordering.
  const ordered=g.files.slice().sort((a,b)=>examTestFileTime(a.f)-examTestFileTime(b.f))
  const urls=ordered.map(fl=>fl.f.pdfDataUrl||fl.f.dataUrl).filter(Boolean)
  if(!urls.length){
    const withText=ordered.find(fl=>String(fl.f.text||'').trim())
    if(withText)return comparisonFileViewerHtml(withText.f,withText.name)
    return '<div class="cmp-empty-viewer">No viewable file stored for this upload.</div>'
  }
  const fid='cmpf'+(++_cmpFrameSeq)
  _cmpMergeTasks[fid]=urls
  return `<iframe id="${fid}" class="cmp-pdf-frame" title="Merged result"></iframe>`
}
// Placeholder for column B when a result type has only one exam with uploads,
// so we never present that same exam's result twice as if it were a comparison.
function comparisonEmptyColumnHtml(testKey){
  const label=EXAM_TEST_PDF_LABELS[testKey].replace(/\s*Results$/,'')
  return `<div class="cmp-col2 cmp-col2--empty">
    <div class="cmp-col2-head"><span class="cmp-col2-side">B</span><div class="cmp-col2-empty-label">No comparison available</div></div>
    <div class="cmp-col2-sub">&nbsp;</div>
    <div class="cmp-col2-viewer"><div class="cmp-empty-viewer">
      <div class="cmp-empty-title">Nothing to compare yet</div>
      <div class="cmp-empty-text">Only one exam has ${escHtml(label)} uploaded so far. Add a ${escHtml(label)} PDF on another exam to see a side-by-side comparison here.</div>
    </div></div>
  </div>`
}
function comparisonBodyHtml(p){
  _cmpFrameUrls={}
  _cmpMergeTasks={}
  const tabs=['test1','test2','test3'].map(k=>{
    const n=comparisonPdfEntries(p,k).length
    return `<button type="button" class="cmp-test-tab${k===comparisonTestKey?' active':''}" data-onclick="comparisonSetTest('${k}')">${escHtml(EXAM_TEST_PDF_LABELS[k])}<span class="cmp-test-count">${n}</span></button>`
  }).join('')
  const groups=comparisonExamGroups(p,comparisonTestKey)
  let inner
  if(!groups.length){
    inner=`<div class="pld-empty-state">No ${escHtml(EXAM_TEST_PDF_LABELS[comparisonTestKey])} PDFs have been uploaded on any exam yet.</div>`
  }else{
    const keys=groups.map(x=>x.key)
    const single=groups.length===1
    // A defaults to the previous exam (or the only one); B to the latest exam.
    if(!keys.includes(comparisonSel.left))comparisonSel.left=single?keys[0]:(keys[keys.length-2]||keys[0])
    if(!single&&!keys.includes(comparisonSel.right))comparisonSel.right=keys[keys.length-1]
    const col=side=>{
      const g=groups.find(x=>x.key===comparisonSel[side])||groups[0]
      const options=groups.map(x=>`<option value="${escHtml(x.key)}"${x.key===g.key?' selected':''}>${escHtml(x.examLabel)}</option>`).join('')
      return `<div class="cmp-col2">
        <div class="cmp-col2-head">
          <span class="cmp-col2-side">${side==='left'?'A':'B'}</span>
          <select class="cmp-col2-select" data-onchange="comparisonSetSide('${side}',this.value)">${options}</select>
        </div>
        <div class="cmp-col2-sub">${escHtml(g.examDate)}</div>
        <div class="cmp-col2-viewer">${comparisonGroupViewerHtml(g)}</div>
      </div>`
    }
    // With only one exam uploaded there's nothing to compare against - show a
    // placeholder in column B instead of duplicating the same exam.
    inner=`<div class="cmp-two-col">${col('left')}${single?comparisonEmptyColumnHtml(comparisonTestKey):col('right')}</div>`
  }
  scheduleComparisonHydrate()
  return `<div class="cmp-test-tabs">${tabs}</div>${inner}`
}
function renderPatientComparisonPanel(p){
  const exams=patientComparisonExams(p)
  if(!exams.length)return `<div class="pld-panel"><div class="pld-card"><div class="pld-section-title">Comparison</div><div class="pld-empty-state">No saved exams to compare yet. Save a Day 2, Re-, or Final Examination with uploaded result PDFs to compare them here.</div></div></div>`
  return `<div class="pld-panel"><div class="pld-card">
    <div class="pld-section-title">Comparison</div>
    <div class="cmp-intro">View uploaded <strong>Vestibular &amp; Neurocognitive</strong>, <strong>Quantitative Pupillometry</strong>, and <strong>Auditory Screening</strong> result PDFs side by side. Pick a result type, then choose an exam for each column.</div>
    <div id="cmpBody">${comparisonBodyHtml(p)}</div>
  </div></div>`
}
function comparisonSetTest(k){comparisonTestKey=k;comparisonSel={left:null,right:null};refreshComparisonBody()}
function comparisonSetSide(side,key){comparisonSel[side]=key;refreshComparisonBody()}
function refreshComparisonBody(){const p=getPatient(selectedPatientId);const box=document.getElementById('cmpBody');if(p&&box)box.innerHTML=comparisonBodyHtml(p)}
function scheduleComparisonHydrate(){if(_cmpHydrateTimer)clearTimeout(_cmpHydrateTimer);_cmpHydrateTimer=setTimeout(comparisonHydrateFrames,0)}
// data: URLs are unreliable as iframe src (browsers block framing them); convert
// to blob URLs like the exam PDF modal does. Blob URLs cached per file.
async function comparisonHydrateFrames(){
  const urls=_cmpFrameUrls
  for(const fid of Object.keys(urls)){
    const frame=document.getElementById(fid)
    if(!frame)continue
    const url=urls[fid]
    try{
      let blobUrl=_cmpBlobCache[url]
      if(!blobUrl){const blob=await(await fetch(url)).blob();blobUrl=URL.createObjectURL(blob);_cmpBlobCache[url]=blobUrl}
      // #view=FitH opens the PDF fit-to-width so the report fills the column.
      frame.src=blobUrl+'#view=FitH'
    }catch(e){frame.src=url+'#view=FitH'}
  }
  const merges=_cmpMergeTasks
  for(const fid of Object.keys(merges)){
    const frame=document.getElementById(fid)
    if(!frame)continue
    const urlList=merges[fid]
    const cacheKey=urlList.join('|')
    try{
      let blobUrl=_cmpMergeBlobCache[cacheKey]
      if(!blobUrl){blobUrl=await comparisonMergePdfs(urlList);_cmpMergeBlobCache[cacheKey]=blobUrl}
      frame.src=blobUrl+'#view=FitH'
    }catch(e){console.error('Comparison PDF merge failed',e);frame.src=urlList[0]+'#view=FitH'}
  }
}
function roEsc(v){ return escHtml(String(v==null?'':v)) }
function roDash(v){ const s=(v==null?'':String(v)).trim(); return s?roEsc(s):'<span class="ro-ace-dash">—</span>' }
function roItem(label,value,full){ return '<div class="detail-item'+(full?' full':'')+'"><div class="detail-label">'+roEsc(label)+'</div><div class="detail-value">'+roDash(value)+'</div></div>' }
function roYnBadge(v){ return v==='yes'?'Yes':v==='no'?'No':v==='na'?'N/A':'' }
/* Drops the questions that only earn a line when answered Yes, keeping the
   answer and comment arrays lined up with the items they belong to. */
function roPmhYesOnly(items,ynArr,commentArr){
  const keep=(items||[]).map((label,i)=>
    !PMH_YES_ONLY.has(label)||String((ynArr||[])[i]||'').trim().toLowerCase()==='yes')
  return {
    items:(items||[]).filter((_,i)=>keep[i]),
    answers:(ynArr||[]).filter((_,i)=>keep[i]),
    comments:(commentArr||[]).filter((_,i)=>keep[i])
  }
}
function roYnListHtml(items,ynArr,commentArr){
  return (items||[]).map((label,i)=>{
    const ans=roYnBadge((ynArr||[])[i])
    const cmt=commentArr?String(commentArr[i]||'').trim():''
    return roItem(label, ans+(cmt?' — '+cmt:''), true)
  }).join('')
}
function roChecklistHtml(items,checkedArr){
  const checked=new Set(checkedArr||[])
  const extra=[...checked].filter(it=>it&&!(items||[]).includes(it))
  return (items||[]).map(it=>roItem(it, checked.has(it)?'Yes':'No')).concat(extra.map(it=>roItem(it,'Yes'))).join('')
}
function roSymptomListHtml(items,valsArr){
  return (items||[]).map((it,i)=>{
    const v=(valsArr||[])[i]
    return roItem(it, v==='1'?'Yes':v==='0'?'No':'')
  }).join('')
}
const RO_TEXT={
  impressionStd:'Today the patient has demonstrated subjective and objective neurocognitive and vestibular findings associated with traumatic brain injury concussion. Further testing has been scheduled for a future date of service.',
  prognosisGuarded:'Prognosis is guarded. Patient presents with multiple risk factors that may prolong recovery. Close monitoring and re-evaluation will be ongoing.',
  redFlagNone:'None present — patient screened negative for all red flags',
  redFlagPositive:'Positive red flag(s) present — see notes / ED referral made',
  followupNone:'No Follow-Up Needed',
  followupMonitor:'Physician / Clinician Office Monitoring',
  followupReferral:'Referral'
}
function roImpressionVal(fs){
  const raw=(fs.selects||{}).impression
  if(raw==='custom')return (fs.inputs||{}).customImp||''
  if(raw==='std')return RO_TEXT.impressionStd
  return raw||''
}
function roPrognosisVal(fs){
  const raw=(fs.selects||{}).prognosis
  if(raw==='guarded')return RO_TEXT.prognosisGuarded
  if(raw==='custom')return ''
  return raw||'' // the default option has no value= attr, so its raw value is already the full standard text
}
function roRedFlagVal(fs){
  const raw=(fs.selects||{}).redFlagStatus
  if(raw==='none')return RO_TEXT.redFlagNone
  if(raw==='positive')return RO_TEXT.redFlagPositive
  return ''
}
function roFollowupPlanVal(fs){
  const raw=(fs.selects||{}).followupPlan
  if(raw==='none')return RO_TEXT.followupNone
  if(raw==='monitor')return RO_TEXT.followupMonitor
  if(raw==='referral')return RO_TEXT.followupReferral
  return ''
}
function roInjuryTypeVal(fs){
  const sel=fs.itSelected||''
  if(sel==='Others'||sel==='No Vehicle Involved'){
    const other=(fs.inputs||{}).itOtherText||''
    return sel+(other?' — '+other:'')
  }
  return (fs.selects||{}).injuryType||sel||''
}
const RO_SEC_IDS=['roSecHeader','roSecMoi','roSecHpi','roSecPmh','roSecAce','roSecDx','roSecPlan']
function roSetActiveTab(id){
  document.querySelectorAll('.ro-ace-tab').forEach(t=>t.classList.toggle('active',t.dataset.sec===id))
}
let roSuppressSpyUntil=0
function roGoTo(id){
  const el=document.getElementById(id)
  if(el)el.scrollIntoView({behavior:'smooth',block:'start'})
  roSetActiveTab(id)
  // A clicked tab should read as "active" for the whole smooth-scroll transit,
  // not flicker through whatever section is passing by mid-animation - pin it
  // until the scroll has had time to settle, then hand back to normal scroll-spy.
  roSuppressSpyUntil=Date.now()+1200
}
let roScrollSpyHandler=null
function roSetupScrollSpy(){
  if(roScrollSpyHandler)window.removeEventListener('scroll',roScrollSpyHandler)
  roScrollSpyHandler=function(){
    if(Date.now()<roSuppressSpyUntil)return
    if(!document.getElementById('roSecHeader'))return
    // Once scrolled (or nearly scrolled) to the bottom of the page, the last
    // section's own top can never cross the threshold below - there's no
    // more room to scroll past it - so it would otherwise never light up.
    const atBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4
    if(atBottom){roSetActiveTab(RO_SEC_IDS[RO_SEC_IDS.length-1]);return}
    const threshold=160 // a few px of slack past the sticky header+tabbar height so a scrollIntoView landing right at the edge still counts
    let activeId=RO_SEC_IDS[0]
    for(const id of RO_SEC_IDS){
      const el=document.getElementById(id)
      if(!el)continue
      if(el.getBoundingClientRect().top<=threshold)activeId=id
    }
    roSetActiveTab(activeId)
  }
  window.addEventListener('scroll',roScrollSpyHandler)
  roScrollSpyHandler()
}
function roTabBar(){
  const tabs=[['roSecHeader','1 Patient'],['roSecMoi','MOI'],['roSecHpi','3 HPI'],['roSecPmh','4 PMH'],['roSecAce','5 Day 1 Score'],['roSecDx','6 Diagnosis'],['roSecPlan','7 Plan']]
  return '<div class="ro-ace-tabbar">'+tabs.map((t,i)=>'<div class="ro-ace-tab'+(i===0?' active':'')+'" data-sec="'+t[0]+'" data-onclick="roGoTo(\''+t[0]+'\')">'+t[1]+'</div>').join('')+'</div>'
}
function roSection(num,icoClass,id,title,body){
  return '<div class="ro-ace-section" id="'+id+'"><div class="ro-ace-section-title"><div class="card-ico '+icoClass+'">'+num+'</div><span>'+roEsc(title)+'</span></div><div class="detail-grid">'+body+'</div></div>'
}
function roSubgroup(title,body){
  return '<div class="detail-item full ro-ace-subgroup"><div class="ro-ace-subgroup-title">'+roEsc(title)+'</div><div class="detail-grid">'+body+'</div></div>'
}

function roRenderSecHeader(fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}
  return roItem('Patient Full Name',inp.ptName)
    +roItem('Date of Birth',inp.ptDOB)
    +roItem('Age',inp.ptAge)
    +roItem('Date of Service (DOS)',inp.dos)
    +roItem('Date of Injury (DOI)',inp.doi)
    +roItem('Patient Gender',sel.ptGender)
    +roItem('ID / Medical Record #',inp.ptMRN)
    +roItem('Reporter (History Provided By)',sel.reporter)
    +roItem('Reporter Name',sel.reporter==='Patient'?inp.ptName:inp.reporterOther)
    +roItem('Translator',sel.translator)
    +(sel.translator==='Yes'?roItem('Translator Name',inp.translatorName):'')
    +roItem('Injury Event Type',roInjuryTypeVal(fs))
    +roItem('Location / Jurisdiction',sel.jurisdiction)
}
/* Day 1 add-ons (day1-moi.js, day1-extras.js, day1-layout.js) plug in here,
   rather than replacing Day 1 functions: beforeRestore runs at the start of
   applyAceFormState; ro.<section> adds lines to a read-only view; moiReadOnly
   may replace the read-only MOI block (a record that has an MOI story). */
window.ctgDay1Hooks=window.ctgDay1Hooks||{beforeRestore:[],ro:{},moiReadOnly:null}
function day1RoExtra(section,fs,p){
  const f=window.ctgDay1Hooks.ro[section]
  try{return f?(f(fs||{},p)||''):''}catch(e){console.warn('Day 1 add-on read-only view failed',e);return ''}
}
function roRenderSecMoi(fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}, chk=fs.checks||{}
  const moiRo=window.ctgDay1Hooks.moiReadOnly?window.ctgDay1Hooks.moiReadOnly(fs):null
  if(moiRo!=null)return moiRo+day1RoExtra('moi',fs)
  return roItem('Where Were You Seated in the Vehicle?',sel.ptRole)
    +roItem('What Type of Vehicle Were You Driving/Seated? (Unit 1)',sel.unit1Type)
    +roItem('Which Side of Your Vehicle Was Hit? (MVC 1)',sel.strikeDir)
    +roItem('What Type of Vehicle Was the Other Party Driving? (Unit 2)',sel.unit2Type)
    +roItem('What Type of Vehicle Was the Third Party Driving? (Unit 3)',sel.unit3Type)
    +roItem('Second Hit Side of (Unit 1) Vehicle? (MVC 2)',sel.strikeDir2)
    +roItem('Third Hit Side of (Unit 1) Vehicle? (MVC 3)',sel.strikeDir3)
    +roItem('In Which Direction Was the Vehicle Moving?',sel.vehicleDirection)
    +roItem('Was This a Traffic or Non-Traffic Accident?',sel.trafficType)
    +roItem('Total MVCs',sel.totalMVC)
    +roItem('Total SOCs (Stationary Objects)',sel.totalSOC)
    +roItem('Describe How the Injury Occurred (no vehicle involved)',inp.moiNoVehicleText,true)
    +roItem('DHI 1 — Direct Head Impact Description',sel.dhi1,true)
    +roItem('IHI 1 — Indirect Head Impact Description',sel.ihi1,true)
    +roItem('Total DHIs',sel.totalDHI)
    +roItem('Total IHIs',sel.totalIHI)
    +roItem('Chief Complaint',inp.immediateSyms,true)
    +roItem('ED / ER Visit?',sel.erVisit)
    +roItem('Specify ED / ER Visit',inp.erVisitOther)
    +roSubgroup('What Did You Experience Right After the Injury Incident?',roChecklistHtml(IMMEDIATE_EXPERIENCE,chk.immedExperienceList))
    +roItem('Which Hospital Were You Admitted To?',sel.hospitalAdmitted,true)
    +roItem('Other Post Reference Treatment',inp.otherPostTx)
    +roItem('MOI Dx (ICD-10 codes related to mechanism of injury)',inp.moiDx)
    +day1RoExtra('moi',fs)
}
function roRenderSecHpi(fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}, chk=fs.checks||{}, yn=fs.yn||{}, ynC=fs.ynComments||{}
  // A risk-factor answer with its optional comment (day1-extras.js), as on the PDF.
  const rv=id=>{const v=sel[id]||'',c=String(inp[id+'_cmt']||'').trim();return v&&c?v+' — '+c:v}
  return roYnListHtml(HPI_ITEMS,yn.hpiList,ynC.hpiList)
    +roItem('Employment Status',sel.employStatus)
    +roItem('ADL Limitations',sel.adlLimit)
    +roSubgroup('Risk Factors for Injury Severity & Prolonged Recovery',roChecklistHtml(RISK_FACTORS,chk.riskFactorsList))
    +roItem('Did You Ever Have a Concussion Before This Injury?',rv('rpr_priorConc'))
    +roItem('Number of Previous Concussions',rv('rpr_concNum'))
    +roItem('Longest Prior Symptom Duration',rv('rpr_concDur'))
    +roItem('If Multiple Concussions, Less Force Caused Reinjury?',rv('rpr_reinjury'))
    +roItem('Did You Have Headaches Before This Injury?',rv('rpr_priorHA'))
    +roItem('Have You Received Treatment for Headaches Before?',rv('rpr_haTx'))
    +roItem('History of Migraine Headache?',rv('rpr_migraine'))
    +roItem('Any Learning Disability?',rv('rpr_learningDis'))
    +roItem('Any History of ADHD?',rv('rpr_adhd'))
    +roItem('Any Other Developmental Conditions History?',rv('rpr_otherDevYN'))
    +roItem('Other Developmental Disorder (specify)',inp.rpr_otherDx)
    +roItem('Any History of Anxiety?',rv('rpr_anxiety'))
    +roItem('Any History of Depression?',rv('rpr_depression'))
    +roItem('Any Sleep Disorder Before This Injury?',rv('rpr_sleepDisorder'))
    +roItem('Any Other Psychiatric Conditions Before This Injury?',rv('rpr_otherPsychYN'))
    +roItem('Other Psychiatric Disorder (specify)',inp.rpr_otherPsychDx)
    +roItem('Assessment — Collision Impact Type',sel.assessCollisionType)
    +roItem('Other Comorbid Medical Disorders / Medication Usage',inp.rpr_comorbid,true)
    +roItem('Patient Goals',inp.ptGoals,true)
    +day1RoExtra('hpi',fs)
}
function roRenderSecPmh(fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}, yn=fs.yn||{}
  const raw = yn.pmhList || []
  const rawC = (fs.ynComments || {}).pmhList || []
  // How the offset is worked out - and why it is a fixed number - is on
  // pmhRowIndex().
  const shift = (i) => pmhRowIndex(raw, i)
  const answerFor = (i) => raw[shift(i)]
  const pmhAnswers = PMH_ITEMS.map((_, i) => answerFor(i))
  // Comments sit in the same DOM-ordered array, so they need the same shift.
  const pmhComments = PMH_ITEMS.map((_, i) => rawC[shift(i)] || '')
  const head = roPmhYesOnly(PMH_ITEMS.slice(0, 1), pmhAnswers.slice(0, 1), pmhComments.slice(0, 1))
  const rest = roPmhYesOnly(PMH_ITEMS.slice(1), pmhAnswers.slice(1), pmhComments.slice(1))
  return roYnListHtml(head.items, head.answers, head.comments)
    // `true` = full width. Without it this lands in a single column of the
    // two-column .detail-grid, so it rendered half the width of every question
    // around it.
    + roItem('Language', sel.languageField, true)
    + roYnListHtml(rest.items, rest.answers, rest.comments)
    +roItem('Job Duties',inp.jobDuties,true)
    +roItem('Diet & Nutrition',sel.diet)
    +roItem('Exercise Habits',sel.exercise)
    +day1RoExtra('pmh',fs)
}
function roRenderSecAce(p,fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}, chk=fs.checks||{}, sym=fs.symptoms||{}
  const ace=p.ace||{}
  const scoreOf=arr=>(arr||[]).filter(v=>v==='1').length
  const phys=scoreOf(sym.acePhysical), cog=scoreOf(sym.aceCognitive), sleep=scoreOf(sym.aceSleep), emot=scoreOf(sym.aceEmotional)
  const total=ace.aceScore!=null&&ace.aceScore!==''?ace.aceScore:String(phys+cog+sleep+emot)
  return roItem('Evidence of forcible blow to head?',sel.ace_blow)
    +roItem('Comments (blow to head)',inp.ace_blow_comment,true)
    +roItem('Evidence of intracranial injury / skull fracture?',sel.ace_icf)
    +roItem('Location of Impact',inp.ace_loc,true)
    +roItem('Amnesia Before Injury (Retrograde)?',sel.ace_retro)
    +roItem('Retrograde Amnesia Duration',inp.ace_retro_dur)
    +roItem('Amnesia After Injury (Anterograde)?',sel.ace_antero)
    +roItem('Anterograde Amnesia Duration',inp.ace_antero_dur)
    +roItem('Loss of Consciousness?',sel.ace_loc2)
    +roItem('Seizures observed?',sel.ace_seiz)
    +roItem('Seizure Detail',inp.ace_seiz_detail,true)
    +roSubgroup('Early Signs',roChecklistHtml(EARLY_SIGNS,chk.earlySignsList))
    +roSubgroup('Symptom Checklist — Physical ('+phys+' / 10)',roSymptomListHtml(ACE_PHYSICAL,sym.acePhysical))
    +roSubgroup('Symptom Checklist — Cognitive ('+cog+' / 4)',roSymptomListHtml(ACE_COGNITIVE,sym.aceCognitive))
    +roSubgroup('Symptom Checklist — Sleep ('+sleep+' / 4)',roSymptomListHtml(ACE_SLEEP,sym.aceSleep))
    +roSubgroup('Symptom Checklist — Emotional ('+emot+' / 4)',roSymptomListHtml(ACE_EMOTIONAL,sym.aceEmotional))
    +roItem('Total Day 1 Symptom Score',total+' / 22')
    +roItem('Symptoms worse with Physical Activity?',sel.ace_physact)
    +roItem('Symptoms worse with Cognitive Activity?',sel.ace_cogact)
    +roItem('Overall Behavioral Change Rating (0–6)',sel.ace_rating)
    +roItem('Red Flag Screening',roRedFlagVal(fs),true)
    +roItem('Red Flag Notes',inp.redFlagNotes,true)
    +day1RoExtra('ace',fs,p)
}
function roRenderSecDx(p){
  const codes=(p.ace&&p.ace.diagnosisCodes)||[]
  return codes.length
    ?codes.map(c=>roItem('ICD / Diagnosis',c,true)).join('')
    :roItem('ICD / Diagnosis','',true)
}
function roRenderSecPlan(fs){
  const inp=fs.inputs||{}, sel=fs.selects||{}, chk=fs.checks||{}
  return roItem('Impression',roImpressionVal(fs),true)
    +roSubgroup('Risk Factors for Assessment',roChecklistHtml(RISK_FACTORS,chk.assessRiskList))
    +roItem('Prognosis Statement',roPrognosisVal(fs),true)
    +roItem('Treatment Plan',sel.txPlan,true)
    +roItem('Recommendation',sel.recommendation,true)
    +roItem('Follow-Up Plan',roFollowupPlanVal(fs))
    +roItem('Date of Next Follow-Up',inp.followupDate)
    +roSubgroup('Referral Type(s)',roChecklistHtml(REFERRAL_TYPES,chk.referralTypeList))
    +roItem('Other Referral (specify)',inp.referralOther)
    +roItem('Completed By',inp.completedBy)
    +roItem('Credentials',sel.completedByCred)
}

function renderPatientAcePanel(p){
  const ace=p.ace||{}
  if(!ace||!ace.formState){
    return `<div class="pld-panel"><div class="pld-card"><div class="pld-record-head"><div class="pld-section-title" data-cs="${__cs}margin-bottom:0">Day 1</div><div class="pld-exam-actions"><button class="btn btn-primary btn-sm" data-onclick="startAceForPatient('${p.id}')">Open Day 1 Form</button></div></div><div class="detail-grid"><div class="detail-item full"><div class="detail-label">Diagnosis</div><div class="detail-value">No ACE data saved yet. Open Day 1 Form to complete this patient’s ACE record.</div></div></div></div></div>`
  }
  const fs=ace.formState
  const body=roSection(1,'ic-blue','roSecHeader','Patient & Session Info',roRenderSecHeader(fs))
    +roSection(2,'ic-amber','roSecMoi','Mechanism of Injury (MOI)',roRenderSecMoi(fs))
    +roSection(3,'ic-blue','roSecHpi','History of Present Illness (HPI)',roRenderSecHpi(fs))
    +roSection(4,'ic-gray','roSecPmh','Past Medical History (PMH) & Social History',roRenderSecPmh(fs))
    +roSection(5,'ic-red','roSecAce','Day 1 — Symptom Checklist',roRenderSecAce(p,fs))
    +roSection(6,'ic-red','roSecDx','Diagnosis — ICD-10 Codes',roRenderSecDx(p))
    +roSection(7,'ic-green','roSecPlan','Assessment & Plan',roRenderSecPlan(fs))
  setTimeout(roSetupScrollSpy,0)
  return `<div class="pld-panel"><div class="pld-card"><div class="pld-record-head"><div class="pld-section-title" data-cs="${__cs}margin-bottom:0;display:flex;align-items:center;gap:8px">Day 1 — Full Record${patientSignedBadge(ace)}</div><div class="pld-exam-actions"><button class="btn btn-primary btn-sm" data-onclick="startAceForPatient('${p.id}')">Open Day 1 Form</button><button class="btn btn-ghost btn-sm" data-onclick="downloadAceForPatient('${p.id}')">Download PDF</button><button class="btn btn-ghost btn-sm" data-onclick="clearPatientSection('${p.id}','ace')">Delete</button></div></div>${roTabBar()}${body}</div></div>`
}
/* Daily Notes = the notes typed here plus every day of care RecoverArc has
   for this patient, as one list in date order. A RecoverArc day is one note:
   the exercises done that day are its contents. Nothing from RecoverArc is
   stored - it is read live each time the tab opens. */
let dnArcOpen = new Set()

function renderPatientNotesPanel(p){
  const dailyNotes=Array.isArray(p.dailyNotes)?p.dailyNotes:[]
  const provider=currentUserIsProvider()
  const arcOn=patientTabAllowed('notesForm')
  const linked=!!String(p.notesPatientId||'').trim()
  if(arcOn&&notesFormState.patientId!==p.id){
    notesFormState={patientId:p.id,loading:false,error:'',code:'',notes:null}
    if(linked)setTimeout(function(){notesFormLoad(p.id)},0)
  }
  const notesPdfBtn=dailyNotes.length?`<button class="btn btn-ghost btn-sm" data-onclick="downloadAllDailyNotesPdfForPatient('${p.id}')">View Notes PDF</button>`:''
  const arcChip=arcOn&&linked?`<span class="dn-arc-chip" title="Notes are pulled from RecoverArc using this id"><i></i>RecoverArc · ${escHtml(p.notesPatientId)}</span><button class="btn btn-ghost btn-sm" data-onclick="notesFormLoad('${p.id}',true)">Refresh</button>`:''
  return `<div class="pld-panel"><div class="pld-card"><div class="pld-record-head"><div class="pld-section-title" data-cs="${__cs}margin-bottom:0">Daily Notes</div><div class="pld-exam-actions">${arcChip}${notesPdfBtn}${provider?'':`<button class="btn btn-primary btn-sm" data-onclick="openDailyNoteForPatient('${p.id}')">+ New Note</button>`}</div></div><div id="dailyNotesList">${dailyNotesListHTML(p)}</div></div></div>`
}

function dailyNotesListHTML(p){
  const dailyNotes=Array.isArray(p.dailyNotes)?p.dailyNotes:[]
  const provider=currentUserIsProvider()
  const arcOn=patientTabAllowed('notesForm')
  const linked=!!String(p.notesPatientId||'').trim()
  const s=notesFormState.patientId===p.id?notesFormState:{}
  const arcDays=arcOn&&linked&&s.notes?window.ctgNotesByDay.group(s.notes):[]

  const entries=dailyNotes.map((dn,i)=>({kind:'manual',dn,i,key:dnDateSortKey(dn)}))
    .concat(arcDays.map(d=>({kind:'arc',d,key:dnArcDayKey(d.day)})))
    .sort((a,b)=>a.key-b.key)

  let banner=''
  if(arcOn&&!linked){
    banner=`<div class="dn-arc-banner"><div><b>Pull this patient's notes from RecoverArc</b><span>Add their RecoverArc ID and every session they complete there shows up here by day, with nothing to type.</span></div>${provider?'':`<button class="btn btn-primary btn-sm" data-onclick="notesFormEditLink('${p.id}')">Add RecoverArc ID</button>`}</div>`
  }else if(arcOn&&s.loading){
    banner=`<div class="dn-arc-banner is-loading"><div><b>Reading notes from RecoverArc…</b></div></div>`
  }else if(arcOn&&s.code==='NOT_CONFIGURED'){
    banner=`<div class="dn-arc-banner is-muted"><div><b>RecoverArc is not connected yet.</b><span>Showing notes entered in CTG One only.</span></div></div>`
  }else if(arcOn&&s.error){
    banner=`<div class="dn-arc-banner is-err"><div><b>Could not read notes from RecoverArc.</b><span>${escHtml(s.error)}</span></div><button class="btn btn-ghost btn-sm" data-onclick="notesFormLoad('${p.id}',true)">Try again</button></div>`
  }

  if(!entries.length){
    const empty=arcOn&&linked&&s.notes?'RecoverArc has no sessions for this patient yet.':'No daily notes saved yet.'
    return banner+(arcOn&&linked&&s.loading?'':`<div class="pld-empty-state">${empty}</div>`)
  }
  const mixed=arcDays.length&&dailyNotes.length
  return banner+`<div class="pld-detail-list">${entries.map((e,pos)=>e.kind==='arc'?dnArcRowHTML(p,e.d,pos):dnManualRowHTML(p,e.dn,e.i,pos,provider,mixed)).join('')}</div>`
}

function dnManualRowHTML(p,dn,i,pos,provider,mixed){
  return `<div class="pld-record-card"><div class="pld-record-head"><div class="pld-record-title"><span>Note #${pos+1}</span>${dn.sessionDate?`<span class="small-muted">${escHtml(dn.sessionDate)}</span>`:''}${dn.appointmentType?patientDetailStatusPill(dn.appointmentType,'blue'):''}${mixed?'<span class="dn-src is-manual">Entered here</span>':''}${patientSignedBadge(dn)}${_dailyNoteHasShoebox(dn)?patientDetailStatusPill('Shoebox Attached','gold'):''}${normalizeDailyShoeboxUploads(dn).length?patientDetailStatusPill('PDF','blue'):''}</div><div class="pld-exam-actions"><button class="btn btn-primary btn-sm" data-onclick="viewDailyNoteAtIndex('${p.id}',${i})">View</button>${provider?'':`<button class="btn btn-ghost btn-sm" data-onclick="editDailyNoteAtIndex('${p.id}',${i})">Edit</button><button class="btn btn-ghost btn-sm" data-onclick="deleteDailyNoteAtIndex('${p.id}',${i})">Delete</button>`}</div></div>${dn.patientNote?`<div data-cs="${__cs}font-size:13px;color:var(--muted);white-space:pre-wrap;line-height:1.6">${escHtml(dn.patientNote)}</div>`:''}${normalizeDailyShoeboxUploads(dn).length?`<div class="small-muted" data-cs="${__cs}margin-top:8px">Shoebox PDF: ${escHtml((normalizeDailyShoeboxUploads(dn)[0]||{}).name||'Uploaded PDF')}</div>`:''}</div>`
}

function dnArcRowHTML(p,d,pos){
  const key=p.id+'|'+d.day
  const open=dnArcOpen.has(key)
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d.day)
  const date=m?`${m[2]}/${m[3]}/${m[1]}`:'Date not recorded'
  const n=d.notes.length
  const body=open?`<div class="dn-arc-body">${d.notes.map(dnArcExerciseHTML).join('')}</div>`:''
  return `<div class="pld-record-card dn-arc${open?' is-open':''}"><div class="pld-record-head"><div class="pld-record-title"><span>Note #${pos+1}</span><span class="small-muted">${escHtml(date)}</span><span class="dn-src">RecoverArc</span><span class="small-muted">${n} exercise${n===1?'':'s'}</span></div><div class="pld-exam-actions"><button class="btn ${open?'btn-ghost':'btn-primary'} btn-sm" data-onclick="dnArcToggle('${p.id}','${escHtml(d.day)}')">${open?'Hide':'View'}</button></div></div>${body}</div>`
}

/* A RecoverArc record's text is the exercise name on its first line, then one
   "Symptom: answer" per line. Shown as a titled block of label/answer rows. */
function dnArcExerciseHTML(n){
  if(!n.text&&!(n.exercises||[]).length){
    return `<div class="dn-arc-ex"><pre class="nf-raw">${escHtml(JSON.stringify(n.raw||n,null,2))}</pre></div>`
  }
  const lines=String(n.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
  let title=n.title||''
  if(!title&&lines.length&&!/^[^:]{1,60}:\s/.test(lines[0]))title=lines.shift()
  const rows=lines.map(l=>{
    const k=/^([^:]{1,60}):\s*(.*)$/.exec(l)
    return k?`<div class="dn-arc-row"><span>${escHtml(k[1])}</span><b>${escHtml(k[2]||'—')}</b></div>`:`<div class="dn-arc-row is-text"><b>${escHtml(l)}</b></div>`
  }).concat((n.exercises||[]).map(x=>`<div class="dn-arc-row"><span>${escHtml(x.label)}</span><b>${escHtml(x.value||'—')}</b></div>`))
  return `<div class="dn-arc-ex">${title?`<h5>${escHtml(title)}</h5>`:''}${rows.join('')}</div>`
}

function dnArcDayKey(day){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''))
  return m?new Date(+m[1],+m[2]-1,+m[3]).getTime():Number.MAX_SAFE_INTEGER
}

function dnArcToggle(patientId,day){
  const key=patientId+'|'+day
  if(dnArcOpen.has(key))dnArcOpen.delete(key);else dnArcOpen.add(key)
  const p=getPatient(patientId),el=document.getElementById('dailyNotesList')
  if(p&&el)el.innerHTML=dailyNotesListHTML(p)
}
function renderBillingGroupTable(p,g,idx){
  const rows=(g.rows||[]).map(r=>`<tr><td>${escHtml(r.date||g.date||'')}</td><td>${escHtml(r.code||'')}</td><td>${escHtml(r.desc||'')}</td><td class="num">${escHtml(String(r.qty||1))}</td><td class="num">${escHtml(_bMoney(r.charges))}</td><td class="num">${escHtml(_bMoney(r.balance))}</td></tr>`).join('')
  return `<div class="pld-record-card"><div class="pld-record-head"><div class="pld-record-title"><span>Billing Table ${idx+1}</span><span class="small-muted">${escHtml(g.date||'No date')}</span></div><div class="pld-exam-actions"><button class="btn btn-ghost btn-sm" data-onclick="openBillingTableEditor('${p.id}','${escHtml(g.id||'')}',${idx})">Edit Table</button></div></div><div class="pld-billing-table-wrap"><table class="pld-billing-table"><thead><tr><th>Date</th><th>Code</th><th>Description</th><th>Qty</th><th>Charges</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table><div class="pld-billing-subtotal"><span>Subtotal Charges: <strong>${escHtml(_bMoney(g.subtotal?.charges||0))}</strong></span><span>Balance: <strong>${escHtml(_bMoney(g.subtotal?.balance||0))}</strong></span></div></div></div>`
}
function renderPatientBillingPanel(p){
  // Lawyers see only the final total balance for their firm's patient - read-only,
  // no line items, no editing.
  if(currentUserIsLawyer()){
    const gt=(getBillingStatementData(p).grandTotal)||{charges:0,balance:0}
    const st=patientCaseStatus(p)
    const lb=p.billing||{}
    const ICO_BILL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>'
    const ICO_FLAG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    const ICO_USER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    const ICO_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    const ICO_HASH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>'
    const ICO_STATUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    const ICO_INFO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    const meta=(ico,label,value)=>`<div class="fcr-meta"><div class="fcr-meta-label">${ico} ${escHtml(label)}</div><div class="fcr-meta-value">${escHtml(plainOrDash(value))}</div></div>`
    return `<div class="pld-panel"><div class="pld-card fcr-card">
      <div class="fcr-hero fcr-hero--bill">
        <div class="fcr-hero-top">
          <div class="fcr-hero-id">
            <div class="fcr-hero-icon">${ICO_BILL}</div>
            <div data-cs="${__cs}min-width:0">
              <div class="fcr-hero-title">Billing Summary</div>
              <div class="fcr-hero-sub">Patient's final billed total <span class="fcr-pill">${ICO_FLAG} ${escHtml(st.label)}</span></div>
            </div>
          </div>
          <div class="bill-total">
            <div class="bill-total-label">Total Balance</div>
            <div class="bill-total-value">${escHtml(_bMoney(gt.balance||0))}</div>
          </div>
        </div>
      </div>
      <div class="fcr-body">
        <div class="fcr-meta-grid">
          ${meta(ICO_USER,'Patient',naturalPatientName(p))}
          ${meta(ICO_STATUS,'Case Status',st.label)}
          ${meta(ICO_CAL,'Statement Date',lb.statementDate)}
          ${meta(ICO_HASH,'Account No.',lb.accountNo)}
        </div>
        ${policyLimitsListHtml(p)}
        <div class="fcr-foot">${ICO_INFO} This is the patient's final billed total. Detailed line items are not available in the firm view.</div>
      </div>
    </div></div>`
  }
  const billing=p.billing||{}
  const data=getBillingStatementData(p)
  const groups=data.groups||[]
  const tables=groups.length?groups.map((g,i)=>renderBillingGroupTable(p,g,i)).join(''):'<div class="pld-empty-state">No billing tables generated yet. Billing will appear after Day 1, exams, or daily notes are saved.</div>'
  const statementInfo=`<div class="pld-record-card" data-cs="${__cs}margin-bottom:14px">
    <div class="pld-record-head"><div class="pld-record-title"><span>Statement Information</span></div><div class="pld-exam-actions"><button class="btn btn-primary btn-sm" data-onclick="savePatientBillingStatementInfo('${p.id}')">Save Statement Info</button></div></div>
    <div class="g2" data-cs="${__cs}gap:14px">
      <div class="fg"><label>Statement Date</label><input type="text" id="patientBillingStatementDate" value="${escHtml(billing.statementDate||'')}" placeholder="MM/DD/YYYY"></div>
      <div class="fg"><label>Account No.</label><input type="text" id="patientBillingAccountNo" value="${escHtml(billing.accountNo||'')}" placeholder="Account number"></div>
    </div>
  </div>`
  const gt=data.grandTotal||{charges:0,balance:0}
  // On-screen Total Balance reflects AR payments / write-offs (what's still
  // owed). The billing statement PDF and the FCR PDF intentionally keep the
  // full billed amounts - they read data.grandTotal via getBillingStatementData,
  // which this does not change; only the displayed number below is adjusted.
  const billedBalance=gt.balance||0
  const netBalance=(typeof patientBillingBalance==='function')?patientBillingBalance(p):billedBalance
  const balanceReduced=Math.abs(billedBalance-netBalance)>0.005
  const bBill='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>'
  const bEye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
  const bDl='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  return `<div class="pld-panel"><div class="pld-card fcr-card">
    <div class="fcr-hero fcr-hero--bill">
      <div class="fcr-hero-top">
        <div class="fcr-hero-id">
          <div class="fcr-hero-icon">${bBill}</div>
          <div data-cs="${__cs}min-width:0">
            <div class="fcr-hero-title">Billing</div>
            <div class="fcr-hero-sub"><span class="fcr-pill">${groups.length} table${groups.length!==1?'s':''}</span></div>
          </div>
        </div>
        <div data-cs="${__cs}display:flex;flex-direction:column;align-items:flex-end;gap:12px;position:relative;z-index:1">
          <div class="bill-total"><div class="bill-total-label">Total Balance</div><div class="bill-total-value">${escHtml(_bMoney(netBalance))}</div>${balanceReduced?`<div data-cs="${__cs}font-size:11px;font-weight:700;color:rgba(255,255,255,.82);margin-top:3px;white-space:nowrap;text-align:right">Billed ${escHtml(_bMoney(billedBalance))} · ${escHtml(_bMoney(billedBalance-netBalance))} paid / adjusted</div>`:''}</div>
          <div class="fcr-hero-actions"><button class="fcr-btn fcr-btn-primary" data-onclick="viewBillingStatement('${p.id}')">${bEye} View</button><button class="fcr-btn fcr-btn-ghost" data-onclick="downloadBillingStatement('${p.id}')">${bDl} Download</button></div>
        </div>
      </div>
    </div>
    <div class="fcr-body">${statementInfo}<div class="pld-detail-list">${tables}</div></div>
  </div></div>`
}
function savePatientBillingStatementInfo(patientId){
  const p=getPatient(patientId); if(!p)return
  const b={...(p.billing||{})}
  b.statementDate=rawVal('patientBillingStatementDate')
  b.accountNo=rawVal('patientBillingAccountNo')
  delete b.status
  delete b.notes
  p.billing=b
  p.updatedAt=new Date().toISOString()
  persistPatients()
  renderPatientDetails(p.id)
  showToast('Statement information saved ✓')
}
function getBillingGroupForEdit(p,groupId,index){
  const groups=getBillingStatementData(p).groups||[]
  return groups.find(g=>g.id===groupId)||groups[index]||null
}
function openBillingTableEditor(patientId,groupId,index){
  const p=getPatient(patientId); if(!p)return
  const g=getBillingGroupForEdit(p,groupId,index); if(!g){showToast('Billing table not found','err');return}
  modalContext={patientId,section:'billingTable',groupId:g.id}
  document.body.classList.add('modal-open')
  document.getElementById('patientModal').classList.add('show')
  document.getElementById('modalTitle').textContent='Edit Billing Table — '+(g.date||'No date')
  const restoreBlock=`<div class="billing-edit-restore"><div><div data-cs="${__cs}font-size:12px;font-weight:700;color:var(--text)">Billing table line items</div><div class="small-muted">Edit codes, descriptions, or charges. Use Delete to remove one line item from this table.</div></div><button type="button" class="btn btn-ghost btn-sm" data-onclick="restoreBillingTableEdits()" data-cs="${__cs}border-color:var(--accent);color:var(--accent)">Restore Table</button></div>`
  const rows=(g.rows||[]).map((r,i)=>`<div class="billing-edit-row" id="billingEditRow_${i}"><div class="billing-edit-cell code"><input type="text" id="billCode_${i}" value="${escHtml(r.code||'')}"></div><div class="billing-edit-cell desc"><input type="text" id="billDesc_${i}" value="${escHtml(r.desc||'')}"></div><div class="billing-edit-cell charge"><input type="text" id="billCharge_${i}" value="${escHtml(_bMoney(r.charges).replace('$',''))}"></div><div class="billing-edit-actions"><button type="button" class="btn btn-ghost btn-sm" id="billDeleteBtn_${i}" data-onclick="toggleBillingRowDelete(${i})" data-cs="${__cs}color:var(--red);border-color:rgba(3,4,94,.3)">Delete</button></div><input type="hidden" id="billKey_${i}" value="${escHtml(r._rowKey||'')}"><input type="hidden" id="billDeleted_${i}" value="0"></div>`).join('')
  const editGrid=rows?`<div class="billing-edit-grid"><div class="billing-edit-head"><div>Code</div><div>Description</div><div>Charge</div><div>Action</div></div>${rows}</div>`:'<div class="pld-empty-state">No active line items. Use Restore Table to bring back the original auto-generated rows.</div>'
  document.getElementById('modalBody').innerHTML=restoreBlock+editGrid
  document.getElementById('modalSaveBtn').onclick=saveBillingTableEdits
}
function toggleBillingRowDelete(i){
  const row=document.getElementById('billingEditRow_'+i)
  const flag=document.getElementById('billDeleted_'+i)
  const btn=document.getElementById('billDeleteBtn_'+i)
  if(!row||!flag||!btn)return
  const del=flag.value!=='1'
  flag.value=del?'1':'0'
  row.classList.toggle('marked-delete',del)
  ;['billCode_'+i,'billDesc_'+i,'billCharge_'+i].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=del})
  btn.textContent=del?'Undo':'Delete'
  btn.style.color=del?'var(--accent)':'var(--red)'
  btn.style.borderColor=del?'rgba(37,99,235,.3)':'rgba(3,4,94,.3)'
}
function restoreBillingTableEdits(){
  const p=getPatient(modalContext.patientId); if(!p)return
  const groupId=modalContext.groupId||''
  if(p.billingEdits&&groupId){
    Object.keys(p.billingEdits).forEach(k=>{if(k.indexOf(groupId+'|')===0)delete p.billingEdits[k]})
  }
  p.updatedAt=new Date().toISOString()
  persistPatients()
  closePatientModal()
  renderPatientDetails(p.id)
  showToast('Billing table restored ✓')
}
function saveBillingTableEdits(){
  const p=getPatient(modalContext.patientId); if(!p)return
  if(!p.billingEdits)p.billingEdits={}
  document.querySelectorAll('#modalBody [id^="billKey_"]').forEach((keyEl)=>{
    const i=keyEl.id.split('_')[1]
    const key=keyEl.value
    if(!key)return
    const deleted=document.getElementById('billDeleted_'+i)?.value==='1'
    if(deleted){p.billingEdits[key]={deleted:true};return}
    p.billingEdits[key]={code:rawVal('billCode_'+i),desc:rawVal('billDesc_'+i),charges:rawVal('billCharge_'+i)}
  })
  p.updatedAt=new Date().toISOString()
  persistPatients()
  closePatientModal()
  renderPatientDetails(p.id)
  showToast('Billing table updated ✓')
}
function patientDocumentSourceLabel(testKey){
  if(testKey==='test1')return 'Test 1'
  if(testKey==='test2')return 'Test 2'
  if(testKey==='test3')return 'Test 3'
  if(testKey==='aob')return 'Assignment of Benefits'
  if(testKey==='validId')return 'Valid ID'
  return 'Document'
}
function getPatientDocumentFile(patientId,arrayKey,examIndex,testKey,fileIndex){
  if(arrayKey==='storedDocuments'){
    const p=getPatient(patientId)
    const docs=p?.documents||{}
    if(testKey==='aob')return docs.aob||null
    if(testKey==='validId')return docs.validId||null
    return null
  }
  if(arrayKey==='uploads'){
    const p=getPatient(patientId)
    const list=(p&&p.documents&&Array.isArray(p.documents.uploads))?p.documents.uploads:[]
    return list[fileIndex]||null
  }
  const exam=getPatientExamDetailRecord(patientId,arrayKey,examIndex)
  const uploads=normalizeDay2Uploads(exam?.testUploads||{})
  const list=uploads[testKey]||[]
  return list[fileIndex]||null
}
function patientDocumentViewKey(state){
  if(!state)return ''
  return [state.patientId,state.arrayKey,state.examIndex??'',state.testKey,state.fileIndex].join('|')
}
async function viewPatientDocument(patientId,arrayKey,examIndex,testKey,fileIndex){
  const file=getPatientDocumentFile(patientId,arrayKey,examIndex,testKey,fileIndex)
  if(!file){showToast('Document not found','err');return}
  // Uploads carry only metadata until something asks for the bytes.
  if(arrayKey==='uploads'&&!file.dataUrl&&!file.pdfDataUrl){
    showToast('Opening document…')
    const url=await resolveUploadDataUrl(getPatient(patientId),file)
    if(!url){showToast('Could not open this document','err');return}
  }
  patientDocumentViewState={patientId,arrayKey,examIndex,testKey,fileIndex}
  patientDetailActiveTab='documents'
  renderPatientDetails(patientId)
}
function closePatientDocumentView(patientId){
  patientDocumentViewState=null
  renderPatientDetails(patientId||selectedPatientId)
}
function renderPatientDocumentPreview(p,row){
  const f=row.file||{}
  const src=String(f.pdfDataUrl||f.dataUrl||'')
  const fallbackText=String(f.text||'').trim()
  const mime=String(f.type||'').toLowerCase()
  let body=''
  if(src && (mime.startsWith('image/')||/^data:image\//i.test(src))){
    body=`<div class="pld-doc-image-wrap"><img class="pld-doc-image" src="${escHtml(src)}" alt="${escHtml(f.name||'Uploaded image')}"></div>`
  }else if(src){
    body=`<iframe class="pld-doc-pdf-frame" src="${escHtml(src)}" title="${escHtml(f.name||'Uploaded PDF')}"></iframe>`
  }else{
    body=`<div class="pld-doc-preview-fallback"><strong>Original document preview is not available for this saved file.</strong><br>This document was saved before original viewing was enabled. Re-upload the file to view it in its original layout.${fallbackText?`<div data-cs="${__cs}margin-top:12px;border-top:1px solid rgba(37,99,235,.12);padding-top:12px;white-space:pre-wrap">${escHtml(fallbackText)}</div>`:''}</div>`
  }
  return `<div class="pld-doc-preview">
    <div class="pld-doc-preview-head"><div class="pld-doc-preview-title">${escHtml(f.name||'Uploaded Document')}</div><button class="btn btn-ghost btn-sm" data-onclick="closePatientDocumentView('${p.id}')">Close</button></div>
    <div class="pld-doc-preview-body">${body}</div>
  </div>`
}
let collapsedDocGroups=new Set()
function toggleDocGroup(btn){
  const g=btn&&btn.closest('.doc-group'); if(!g)return
  const id=g.getAttribute('data-group')
  if(g.classList.toggle('collapsed'))collapsedDocGroups.add(id); else collapsedDocGroups.delete(id)
}
function docSourceChipHtml(testKey){
  const m={
    test1:{n:'Test 1',app:'Vestibular & Neurocognitive',c:'src-sway'},
    test2:{n:'Test 2',app:'Quantitative Pupillometry',c:'src-reflex'},
    test3:{n:'Test 3',app:'Auditory Screening',c:'src-shoebox'},
    aob:{n:'AoB',app:'Assignment of Benefits',c:'src-doc'},
    validId:{n:'ID',app:'Valid ID',c:'src-id'}
  }[testKey]||{n:'Doc',app:'',c:'src-doc'}
  return `<span class="doc-src-chip ${m.c}">${escHtml(m.n)}${m.app?`<span class="doc-src-app">${escHtml(m.app)}</span>`:''}</span>`
}
// "Add Document" chip label: an "Other Report" upload with a typed
// specification reads as "CT SCAN - Other Report"; every other type (and an
// Other Report with no note) just shows its type name, unchanged.
function docUploadChipHtml(f){
  const type=f&&f.documentType||'Document'
  const note=(f&&f.note||'').trim()
  const label=note?(note+' - '+type):type
  return `<span class="doc-src-chip src-upload">${escHtml(label)}</span>`
}
function docFileIsImage(f){
  const mime=String(f&&f.type||'').toLowerCase()
  const src=String(f&&(f.dataUrl||f.pdfDataUrl)||'')
  return mime.startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(String(f&&f.name||''))||/^data:image\//i.test(src)
}
/* 'Assignment of Benefits' is intentionally not a manual upload category here
   the AoB is pulled automatically from the patient's saved Intake Form. */
const DOC_UPLOAD_TYPES=['Valid ID','Referral Form','Police Report','Discharge Report','Intake Form','Other Report']
/* Providers and Technical Assistants are view-only in Documents - no upload, no delete. */
const DOC_IMAGE_MAX_EDGE=2000        // px on the long edge - plenty for an ID
const DOC_IMAGE_QUALITY=0.82
const DOC_FILE_MAX_BYTES=150*1024*1024 // one file, after compression
const DOC_SECTION_MAX_BYTES=1024*1024*1024  // the whole section, under the 12 MB body limit
function docBytesLabel(n){
  const mb=n/1048576
  return (mb>=10?mb.toFixed(0):mb.toFixed(1))+' MB'
}
function patientDocumentsBytes(p){
  try{return JSON.stringify((p&&p.documents)||{}).length}catch(e){return 0}
}
/* Returns a smaller JPEG data URL, or the original if it cannot do better.
   Never throws: a failure here must not block the upload, only skip the
   compression - the size check below is what actually protects the save. */
async function shrinkImageDataUrl(dataUrl,mime){
  if(!/^image\//i.test(String(mime||'')))return dataUrl
  try{
    const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=dataUrl})
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height
    if(!w||!h)return dataUrl
    const scale=Math.min(1,DOC_IMAGE_MAX_EDGE/Math.max(w,h))
    const cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale))
    const canvas=document.createElement('canvas')
    canvas.width=cw;canvas.height=ch
    const ctx=canvas.getContext('2d')
    // JPEG has no alpha, so a transparent PNG would come out with a black
    // background without this.
    ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,cw,ch)
    ctx.drawImage(img,0,0,cw,ch)
    const out=canvas.toDataURL('image/jpeg',DOC_IMAGE_QUALITY)
    const srcEmbeddable=/^image\/(jpe?g|png)$/i.test(String(mime||''))
    return (out&&(out.length<dataUrl.length||!srcEmbeddable))?out:dataUrl
  }catch(e){return dataUrl}
}
function documentsReadOnly(){return currentUserIsProvider()||currentUserIsTA()}
async function resolveUploadDataUrl(p,rec){
  if(!rec)return ''
  if(rec.dataUrl)return rec.dataUrl
  if(rec.pdfDataUrl)return rec.pdfDataUrl
  if(!rec.id||!p||!p.id)return ''
  try{
    const res=await window.ctgApiFetch('/api/patients/'+encodeURIComponent(p.id)+'/documents/'+encodeURIComponent(rec.id)+'/content')
    if(res&&res.dataUrl){rec.dataUrl=res.dataUrl;return rec.dataUrl}
  }catch(e){console.error('Could not load document',rec&&rec.name,e)}
  return ''
}
async function handleAddDocumentUpload(pid,input){
  const files=input&&input.files?Array.from(input.files):[]
  if(!files.length)return
  const sel=document.getElementById('docAddType')
  const documentType=(sel&&sel.value)||'Other Report'
  const noteEl=document.getElementById('docAddNote')
  const note=(documentType==='Other Report'&&noteEl&&noteEl.value.trim())||''
  const p=getPatient(pid)
  if(!p){showToast('Patient not found','err');return}
  try{
    showToast('Uploading document'+(files.length>1?'s':'')+'…')
    if(!p.documents)p.documents={}
    if(!Array.isArray(p.documents.uploads))p.documents.uploads=[]
    // Each file is appended as its own record - new uploads never replace or
    // overwrite earlier ones (they accumulate; delete individually to remove).
    // The optional note/specification is stored per-file and shown alongside
    // it in the list (same note applies to every file in a multi-file upload).
    /* Prepared and size-checked first, pushed only once every file passes, so a
       multi-file upload can never half-succeed and leave the record in a state
       that will not save. */
    const prepared=[]
    let projected=patientDocumentsBytes(p)
    for(const file of files){
      let dataUrl=await fileToDataURL(file)
      let type=file.type||''
      if(/^image\//i.test(type)){
        const smaller=await shrinkImageDataUrl(dataUrl,type)
        if(smaller!==dataUrl){dataUrl=smaller;type='image/jpeg'}
      }
      if(dataUrl.length>DOC_FILE_MAX_BYTES){
        showToast('“'+(file.name||'That file')+'” is '+docBytesLabel(dataUrl.length)+' — too large to attach. Please upload a smaller file or a PDF export (under '+docBytesLabel(DOC_FILE_MAX_BYTES)+').','err')
        return
      }
      projected+=dataUrl.length
      if(projected>DOC_SECTION_MAX_BYTES){
        showToast('This patient’s documents would total '+docBytesLabel(projected)+', over the '+docBytesLabel(DOC_SECTION_MAX_BYTES)+' a record can hold. Remove a document first, or upload a smaller file.','err')
        return
      }
      prepared.push({id:'doc'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),documentType:documentType,name:file.name||(documentType+' file'),type:type,dataUrl:dataUrl,note:note,uploadedAt:new Date().toISOString()})
    }
    let saved=0
    for(const rec of prepared){
      const comma=rec.dataUrl.indexOf(',')
      const base64=comma>=0?rec.dataUrl.slice(comma+1):''
      const res=await window.ctgApiFetch('/api/patients/'+encodeURIComponent(pid)+'/documents/upload',{
        method:'POST',
        body:JSON.stringify({documentType:rec.documentType,name:rec.name,contentType:rec.type,note:rec.note,data:base64})
      })
      const stored=(res&&res.document)||null
      if(!stored)throw new Error('The server did not confirm the upload')
      // Keep the bytes we already have in memory so the preview is instant and
      // does not need a round trip straight back for what we just sent.
      stored.dataUrl=rec.dataUrl
      p.documents.uploads.push(stored)
      saved++
    }
    p.updatedAt=new Date().toISOString()
    renderPatientDetails(pid)
    showToast(saved>1?(saved+' documents uploaded ✓'):(documentType+' uploaded ✓'))
  }catch(e){console.error(e);showToast('Could not upload document: '+e.message,'err')}
  finally{if(input)input.value=''}
}
async function deleteUploadedDocument(pid,docId){
  const p=getPatient(pid); if(!p||!p.documents||!Array.isArray(p.documents.uploads))return
  if(!(await ctgConfirm('Remove this document?',{danger:true,okLabel:'Remove'})))return
  try{
    // Removed on the server first. Dropping it from the local list first would
    // put the chart back in the old state where the screen and the record
    // disagree - the exact failure this whole change is fixing.
    await window.ctgApiFetch('/api/patients/'+encodeURIComponent(pid)+'/documents/'+encodeURIComponent(docId),{method:'DELETE'})
  }catch(e){
    console.error(e)
    showToast('Could not remove document: '+((e&&e.message)||'server error'),'err')
    return
  }
  p.documents.uploads=p.documents.uploads.filter(d=>d.id!==docId)
  p.updatedAt=new Date().toISOString()
  if(patientDocumentViewState&&patientDocumentViewState.arrayKey==='uploads')patientDocumentViewState=null
  renderPatientDetails(pid)
  showToast('Document removed')
}
// The note/specification field only applies to "Other Report" - every other
// type is already self-explanatory, so the field stays hidden until that
// type is picked (and its value is cleared when switching away from it).
function docToggleNoteField(sel){
  const noteEl=document.getElementById('docAddNote')
  if(!noteEl)return
  const show=sel.value==='Other Report'
  noteEl.style.display=show?'':'none'
  if(!show)noteEl.value=''
}
function docUploadSegmentHtml(p){
  const opts=DOC_UPLOAD_TYPES.map(t=>`<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('')
  return `<div class="doc-add">
    <div class="doc-add-head"><span class="doc-add-ico">+</span><div><div class="doc-add-title">Add Document</div></div></div>
    <div class="doc-add-row">
      <select class="doc-add-select" id="docAddType" aria-label="Document type" data-onchange="docToggleNoteField(this)">${opts}</select>
      <input type="text" class="doc-add-select doc-add-note-input" id="docAddNote" placeholder="Add a note or specification (optional)…" aria-label="Document note" data-cs="${__cs}display:none">
      <input type="file" id="docAddFile" multiple data-cs="${__cs}display:none" data-onchange="handleAddDocumentUpload('${p.id}',this)">
      <button type="button" class="btn btn-primary btn-sm doc-add-btn" data-onclick="docPickFile()">⬆ Upload File</button>
    </div>
  </div>`
}
function docFileKind(f){
  if(docFileIsImage(f))return 'img'
  const mime=String(f&&f.type||'').toLowerCase()
  if(/pdf/.test(mime)||/\.pdf$/i.test(String(f&&f.name||'')))return 'pdf'
  return 'file'
}
function renderPatientDocumentRow(p,r,activeKey){
  const key=[p.id,r.arrayKey,r.examIndex??'',r.testKey,r.fileIndex].join('|')
  const isOpen=activeKey===key
  const kind=docFileKind(r.file)
  const chip=r.chip||docSourceChipHtml(r.testKey)
  const del=(r.removable&&!documentsReadOnly())?`<button class="btn btn-ghost btn-sm doc-del-btn" title="Remove document" data-onclick="deleteUploadedDocument('${p.id}','${escHtml(r.docId)}')">Delete</button>`:''
  const action=isOpen
    ?`<button class="btn btn-ghost btn-sm" data-onclick="closePatientDocumentView('${p.id}')">Close</button>`
    :`<button class="btn btn-primary btn-sm" data-onclick="viewPatientDocument('${p.id}','${r.arrayKey}',${r.examIndex==null?'null':r.examIndex},'${r.testKey}',${r.fileIndex})">View</button>`
  return `<div class="doc-file${isOpen?' is-open':''}">
    <div class="doc-file-row">
      <span class="doc-file-ico ${kind}">${kind==='img'?'IMG':kind==='pdf'?'PDF':'FILE'}</span>
      <span class="doc-file-main"><span class="doc-file-name" title="${escHtml(r.name)}">${escHtml(r.name)}</span><span class="doc-file-tags">${chip}</span></span>
      <span class="doc-file-act">${del}${action}</span>
    </div>
    ${isOpen?renderPatientDocumentPreview(p,r):''}
  </div>`
}
// Free-text match string for one uploaded-file row - filename, its label
// (document type / exam+test label), and any typed note/specification.
function docRowSearchText(r){
  return [r.name,r.label,r.note].filter(Boolean).join(' ').toLowerCase()
}
const DOC_TEST_SEARCH_LABELS={test1:'Test 1 Vestibular Neurocognitive',test2:'Test 2 Quantitative Pupillometry',test3:'Test 3 Auditory Screening'}
function buildPatientDocGroups(p){
  const stored=p.documents||{}
  const groups=[]
  const patientDocs=[]
  if(stored.aob)patientDocs.push({label:'Assignment of Benefits',arrayKey:'storedDocuments',examIndex:null,testKey:'aob',fileIndex:0,file:stored.aob,name:stored.aob.name||'Assignment of Benefits.pdf'})
  if(stored.validId)patientDocs.push({label:'Valid ID',arrayKey:'storedDocuments',examIndex:null,testKey:'validId',fileIndex:0,file:stored.validId,name:stored.validId.name||'Valid ID.jpg'})
  if(Array.isArray(stored.uploads))stored.uploads.forEach((f,idx)=>patientDocs.push({label:f.documentType||'Document',arrayKey:'uploads',examIndex:null,testKey:'upload',fileIndex:idx,file:f,name:f.name||'Document',docId:f.id,removable:true,note:f.note||'',chip:docUploadChipHtml(f)}))
  if(patientDocs.length)groups.push({id:'patient',title:'Patient Documents',sub:'Intake, identification & uploads',ico:'DOC',cls:'grp-patient',files:patientDocs})
  // The ACE report isn't a stored file like the exam uploads below - its PDF
  // is generated on demand from the saved ACE record, so this is a single
  // synthetic row rather than something mapped through renderPatientDocumentRow
  // (which expects an actual file object with dataUrl/pdfDataUrl/text).
  if(p.ace&&p.ace.savedAt){
    const aceStatusChip=p.aceComplete?'':'<span class="doc-src-app">Incomplete</span>'
    const aceRowHtml=`<div class="doc-file">
      <div class="doc-file-row">
        <span class="doc-file-ico pdf">PDF</span>
        <span class="doc-file-main"><span class="doc-file-name">Day 1</span><span class="doc-file-tags"><span class="doc-src-chip src-doc">ACE${aceStatusChip}</span></span></span>
        <span class="doc-file-act"><button class="btn btn-primary btn-sm" data-onclick="viewSavedAceDocument('${p.id}')">View</button></span>
      </div>
    </div>`
    groups.push({id:'ace',title:'Day 1',sub:p.ace.dateOfService?('DOS '+p.ace.dateOfService):'Saved evaluation',ico:'ACE',cls:'grp-ace',customRowHtml:aceRowHtml,files:[{}],searchText:('acute concussion evaluation ace '+(p.ace.dateOfService||'')+(p.aceComplete?' complete':' incomplete')).toLowerCase()})
  }
  // Patient-signed forms, immediately after the uploaded patient documents -
  // same kind of paperwork, different storage.
  const formDocs=patientFormDocuments(p)
  if(formDocs.length){
    const rowsHtml=formDocs.map(d=>`<div class="doc-file">
      <div class="doc-file-row">
        <span class="doc-file-ico pdf">PDF</span>
        <span class="doc-file-main"><span class="doc-file-name">${escHtml(d.label)}</span><span class="doc-file-tags"><span class="doc-src-chip src-doc">Patient Forms</span></span></span>
        <span class="doc-file-act"><button class="btn btn-primary btn-sm" data-onclick="viewPatientFormDocument('${p.id}','${d.key}')">View</button></span>
      </div>
    </div>`).join('')
    groups.push({
      id:'patientForms',title:'Patient Forms',sub:patientFormSubmittedLabel(p),ico:'FRM',cls:'grp-patient',
      customRowHtml:rowsHtml,files:formDocs,
      searchText:('patient forms intake assignment of benefits aob minor authorization consent '+formDocs.map(d=>d.label).join(' ')).toLowerCase()
    })
  }
  const addExam=(label,arrayKey,examIndex,exam,cls,ico)=>{
    if(!exam||!exam.savedAt)return
    const uploads=normalizeDay2Uploads(exam.testUploads||{})
    const files=[]
    ;['test1','test2','test3'].forEach(testKey=>{(uploads[testKey]||[]).forEach((f,fileIndex)=>files.push({label:label+' '+DOC_TEST_SEARCH_LABELS[testKey],arrayKey,examIndex,testKey,fileIndex,file:f,name:f.name||'Uploaded PDF'}))})
    if(files.length)groups.push({id:arrayKey+'|'+(examIndex==null?'':examIndex),title:label,sub:'Uploaded test results',ico,cls,files})
  }
  addExam('Day 2','initialExam',null,p.initialExam,'grp-ie','IE')
  ;(Array.isArray(p.reExams)?p.reExams:[]).forEach((rx,i)=>addExam(patientDetailOrdinalExamLabel(i),'reExams',i,rx,'grp-re','RE'))
  addExam('Final Examination','finalExam',null,p.finalExam,'grp-fe','FE')
  return groups
}
// Renders just the group list (or its empty/no-match state) - kept separate
// from the panel shell so the search box above it never gets rebuilt (and so
// never loses focus/cursor position) while the user is typing a filter.
function docGroupsBodyHtml(p,groups){
  const activeKey=patientDocumentViewKey(patientDocumentViewState)
  const q=String(patientDocumentsSearchQuery||'').trim().toLowerCase()
  const visibleGroups=!q?groups:groups.map(g=>{
    if(g.customRowHtml)return (g.searchText||'').includes(q)?g:null
    const files=g.files.filter(r=>docRowSearchText(r).includes(q))
    return files.length?Object.assign({},g,{files}):null
  }).filter(Boolean)
  const readOnly=documentsReadOnly()
  if(!groups.length)return `<div class="pld-empty-state">${readOnly?'No uploaded documents saved yet.':'No uploaded documents saved yet. Use “Add Document” above to upload one.'}</div>`
  if(q&&!visibleGroups.length)return `<div class="pld-empty-state">No documents match “${escHtml(String(patientDocumentsSearchQuery).trim())}”.</div>`
  const groupsHtml=visibleGroups.map(g=>{
    const collapsed=collapsedDocGroups.has(p.id+'::'+g.id)
    const filesHtml=g.customRowHtml||g.files.map(r=>renderPatientDocumentRow(p,r,activeKey)).join('')
    return `<div class="doc-group${collapsed?' collapsed':''}" data-group="${escHtml(p.id+'::'+g.id)}">
      <button type="button" class="doc-group-head" data-onclick="toggleDocGroup(this)">
        <span class="doc-group-ico ${g.cls}">${escHtml(g.ico)}</span>
        <span class="doc-group-titles"><span class="doc-group-title">${escHtml(g.title)}</span><span class="doc-group-sub">${escHtml(g.sub)}</span></span>
        <span class="doc-group-count">${g.files.length} file${g.files.length!==1?'s':''}</span>
        <svg class="doc-group-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="doc-group-body">${filesHtml}</div>
    </div>`
  }).join('')
  return `<div class="doc-groups">${groupsHtml}</div>`
}
function docFilterSearchLive(){
  const input=document.getElementById('docFilterInput')
  patientDocumentsSearchQuery=input?input.value:''
  const p=getPatient(selectedPatientId)
  const body=document.getElementById('docFilterBody')
  if(p&&body)body.innerHTML=docGroupsBodyHtml(p,buildPatientDocGroups(p))
  const clearBtn=document.getElementById('docFilterClearBtn')
  if(clearBtn)clearBtn.style.display=String(patientDocumentsSearchQuery).trim()?'inline-flex':'none'
}
function docFilterClear(){
  patientDocumentsSearchQuery=''
  const input=document.getElementById('docFilterInput')
  if(input)input.value=''
  docFilterSearchLive()
  if(input)input.focus()
}
function renderPatientDocumentsPanel(p){
  const groups=buildPatientDocGroups(p)
  const totalFiles=groups.reduce((n,g)=>n+g.files.length,0)
  const readOnly=documentsReadOnly()
  const q=String(patientDocumentsSearchQuery||'').trim()
  const filterBar=totalFiles?`<div class="doc-filter-bar">
    <div class="doc-filter-input-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="docFilterInput" class="doc-filter-input" placeholder="Filter documents by name, type, or note…" value="${escHtml(patientDocumentsSearchQuery||'')}" data-oninput="docFilterSearchLive()">
    </div>
    <button type="button" id="docFilterClearBtn" class="doc-filter-clear" data-cs="${__cs}display:${q?'inline-flex':'none'}" data-onclick="docFilterClear()">Clear</button>
  </div>`:''
  return `<div class="pld-panel"><div class="pld-card"><div class="pld-section-title doc-title"><span>Documents</span><span class="doc-total-badge">${totalFiles} file${totalFiles!==1?'s':''}</span></div>${readOnly?'':docUploadSegmentHtml(p)}${filterBar}<div id="docFilterBody">${docGroupsBodyHtml(p,groups)}</div></div></div>`
}
function collectFCRTestUploadFiles(p){
  // Uploaded test result PDFs and images for the FCR, ordered by test type:
  // Shoe Box and Reflex in full across every exam, then only the latest Sway
  // upload from the latest exam. Deduped by file contents so nothing is
  // embedded twice, and any entry missing its actual data is skipped.
  const files=[]
  const seen=new Set()
  const add=(f)=>{
    const data=f&&(f.pdfDataUrl||f.dataUrl)
    if(!data)return false
    const sig=(f.name||'')+'|'+data.length+'|'+data.slice(0,96)+'|'+data.slice(-48)
    if(seen.has(sig))return false
    seen.add(sig)
    files.push(f)
    return true
  }
  const exams=[]
  if(p.initialExam&&p.initialExam.savedAt)exams.push(p.initialExam)
  ;(Array.isArray(p.reExams)?p.reExams:[]).forEach(rx=>{if(rx&&rx.savedAt)exams.push(rx)})
  if(p.finalExam&&p.finalExam.savedAt)exams.push(p.finalExam)
  const uploadsFor=ex=>normalizeDay2Uploads(ex.testUploads||{})
  // 1. Shoe Box (Test 3) - all
  exams.forEach(ex=>uploadsFor(ex).test3.forEach(add))
  // 2. Reflex (Test 2) - all
  exams.forEach(ex=>uploadsFor(ex).test2.forEach(add))
  // 3. Sway (Test 1) - the latest sway upload that actually has data, scanning
  //    exams latest-first and, within an exam, files latest-first. Falls back to
  //    earlier exams/files so a stale data-less entry never hides a valid sway.
  const examsByDate=exams.slice().sort((a,b)=>fcrSegmentDateKey(a.sessionDate||a.examinationDate||a.savedAt)-fcrSegmentDateKey(b.sessionDate||b.examinationDate||b.savedAt))
  let swayAdded=false
  for(let i=examsByDate.length-1;i>=0 && !swayAdded;i--){
    const sway=uploadsFor(examsByDate[i]).test1
    for(let j=sway.length-1;j>=0;j--){
      if(add(sway[j])){swayAdded=true;break}
    }
  }
  return files
}
function getFCRComponents(p){
  const docs=p.documents||{}
  const reExams=Array.isArray(p.reExams)?p.reExams.filter(r=>r&&r.savedAt):[]
  const testFiles=collectFCRTestUploadFiles(p)
  const billingGroups=(()=>{try{return (getBillingStatementData(p).groups||[]).length}catch(e){return 0}})()
  const dailyCount=Array.isArray(p.dailyNotes)?p.dailyNotes.length:0
  const uploadDocs=Array.isArray(docs.uploads)?docs.uploads:[]
  const uploadsOfType=(type)=>uploadDocs.filter(d=>String(d&&d.documentType||'')===type).length
  const aobCount=(docs.aob?1:0)+uploadsOfType('Assignment of Benefits')
  const validIdCount=(docs.validId?1:0)+uploadsOfType('Valid ID')
  return [
    {label:'Case Discharge Summary',source:'Generated',available:true,count:1},
    {label:'Assignment of Benefits / Attorney Agreement',source:'Uploaded PDF',available:aobCount>0,count:aobCount},
    {label:'Valid ID',source:'Uploaded',available:validIdCount>0,count:validIdCount},
    {label:'Billing Statement',source:'Generated',available:billingGroups>0,count:billingGroups},
    {label:'Test Result PDFs (Vestibular & Neurocognitive, Quantitative Pupillometry, Auditory Screening)',source:'Uploaded',available:testFiles.length>0,count:testFiles.length},
    {label:'Day 1 Report',source:'Generated',available:!!p.ace,count:p.ace?1:0},
    {label:'Day 2 Neurocognitive & Vestibular Exam Report',source:'Generated',available:!!(p.initialExam&&p.initialExam.savedAt),count:p.initialExam&&p.initialExam.savedAt?1:0},
    {label:'Re-Examination Reports',source:'Generated',available:reExams.length>0,count:reExams.length},
    {label:'Daily Treatment Notes',source:'Generated',available:dailyCount>0,count:dailyCount},
    {label:'Final Examination Report',source:'Generated',available:!!(p.finalExam&&p.finalExam.savedAt),count:p.finalExam&&p.finalExam.savedAt?1:0}
  ]
}
function renderPatientFCRPanel(p){
  // Lawyers get a read-only FCR: only when discharged, and only the View/Download
  // actions - no compiled-sections breakdown (mirrors the firm Billing Summary).
  if(currentUserIsLawyer()){
    if(!isPatientDischarged(p)){
      return `<div class="pld-panel"><div class="pld-card"><div class="pld-empty-state">Patient has not yet been discharged.</div></div></div>`
    }
    const lcd=getCaseDischargeData(p)
    const ICO_DOC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
    const ICO_CHK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    const ICO_EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    const ICO_DL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    const ICO_USER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    const ICO_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    const ICO_ACT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
    const ICO_HEART='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>'
    const ICO_INFO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    const meta=(ico,label,value)=>`<div class="fcr-meta"><div class="fcr-meta-label">${ico} ${escHtml(label)}</div><div class="fcr-meta-value">${escHtml(plainOrDash(value))}</div></div>`
    return `<div class="pld-panel"><div class="pld-card fcr-card">
      <div class="fcr-hero">
        <div class="fcr-hero-top">
          <div class="fcr-hero-id">
            <div class="fcr-hero-icon">${ICO_DOC}</div>
            <div data-cs="${__cs}min-width:0">
              <div class="fcr-hero-title">Final Case Report</div>
              <div class="fcr-hero-sub">Complete compiled case file <span class="fcr-pill">${ICO_CHK} Discharged</span></div>
            </div>
          </div>
          <div class="fcr-hero-actions">
            <button class="fcr-btn fcr-btn-primary" data-onclick="viewFCR('${p.id}')">${ICO_EYE} View FCR</button>
            <button class="fcr-btn fcr-btn-ghost" data-onclick="downloadFCR('${p.id}')">${ICO_DL} Download FCR</button>
            <button class="fcr-btn fcr-btn-ghost" data-onclick="downloadFCRWord('${p.id}')">${ICO_DL} Download as Word</button>
          </div>
        </div>
      </div>
      <div class="fcr-body">
        <div class="fcr-meta-grid">
          ${meta(ICO_USER,'Patient',lcd.name)}
          ${meta(ICO_CAL,'Date of Birth',lcd.dob)}
          ${meta(ICO_ACT,'Age',lcd.age)}
          ${meta(ICO_HEART,'Date of Injury',lcd.doi)}
          ${meta(ICO_CHK,'Discharge Date',lcd.dischargeDate)}
        </div>
        <div class="fcr-foot">${ICO_INFO} The complete case report is ready — tap <b data-cs="${__cs}color:var(--text)">View FCR</b> to read it or <b data-cs="${__cs}color:var(--text)">Download FCR</b> to save the full PDF, or <b data-cs="${__cs}color:var(--text)">Download as Word</b> for the same pages as a Word file.</div>
      </div>
    </div></div>`
  }
  const comps=getFCRComponents(p)
  const available=comps.filter(c=>c.available).length
  const d=p.demographics||{}
  const cd=getCaseDischargeData(p)
  const info=`<div class="pld-record-card" data-cs="${__cs}margin-bottom:14px">
    <div class="pld-record-head"><div class="pld-record-title"><span>FCR Information</span></div></div>
    <div class="pld-kv">
      ${pldKv('Patient',cd.name||'—')}
      ${pldKv('Date of Birth',cd.dob||'')}
      ${pldKv('Age',cd.age||'')}
      ${pldKv('Date of Injury',cd.doi||'')}
      ${pldKv('Sections Compiled',available+' of '+comps.length)}
    </div>
  </div>`
  const head=`<div data-cs="${__cs}display:grid;grid-template-columns:minmax(0,1fr) 110px 150px;gap:10px;padding:10px 0;border-bottom:1px solid rgba(37,99,235,.12);font-size:11px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.05em"><div>Section</div><div>Source</div><div>Status</div></div>`
  const rows=comps.map((c,i)=>`<div data-cs="${__cs}display:grid;grid-template-columns:minmax(0,1fr) 110px 150px;gap:10px;align-items:start;padding:11px 0;border-bottom:1px solid rgba(37,99,235,.06);font-size:13px"><div><strong data-cs="${__cs}color:var(--faint)">${i+1}.</strong> ${escHtml(c.label)}</div><div data-cs="${__cs}color:var(--muted)">${escHtml(c.source)}</div><div>${c.available?`<span data-cs="${__cs}color:var(--green);font-weight:700">✓ Included${c.count>1?' ('+c.count+')':''}</span>`:'<span data-cs="'+__cs+'color:var(--faint)">— Not available</span>'}</div></div>`).join('')
  const aDoc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
  const aEye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
  const aDl='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  const aChk='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  const dischPill=isPatientDischarged(p)?`<span class="fcr-pill">${aChk} Discharged</span>`:''
  return `<div class="pld-panel"><div class="pld-card fcr-card">
    <div class="fcr-hero">
      <div class="fcr-hero-top">
        <div class="fcr-hero-id">
          <div class="fcr-hero-icon">${aDoc}</div>
          <div data-cs="${__cs}min-width:0">
            <div class="fcr-hero-title">Final Case Report</div>
            <div class="fcr-hero-sub">Compiled case file <span class="fcr-pill">${available} of ${comps.length} sections</span>${dischPill}</div>
          </div>
        </div>
        <div class="fcr-hero-actions">
          <button class="fcr-btn fcr-btn-primary" data-onclick="viewFCR('${p.id}')">${aEye} View FCR</button>
          <button class="fcr-btn fcr-btn-ghost" data-onclick="downloadFCR('${p.id}')">${aDl} Download FCR</button>
          <button class="fcr-btn fcr-btn-ghost" data-onclick="downloadFCRWord('${p.id}')">${aDl} Download as Word</button>
        </div>
      </div>
    </div>
    <div class="fcr-body">
      <div class="pld-detail-list">${head}${rows}</div>
    </div>
  </div></div>`
}
function fcrComputeAge(dob,ref){
  if(!dob)return ''
  const dobD=new Date(dob); if(isNaN(dobD))return ''
  const r=(ref&&!isNaN(new Date(ref)))?new Date(ref):new Date()
  let a=r.getFullYear()-dobD.getFullYear(); const m=r.getMonth()-dobD.getMonth()
  if(m<0||(m===0&&r.getDate()<dobD.getDate()))a--
  return (a>=0&&a<130)?String(a):''
}
// Detect "No follow-up" from a patient's saved ACE record (the live DOM helper
// isAceNoFollowupSelected can't be used here - the FCR builds the case discharge
// before the ACE form is populated).
function isPatientAceNoFollowup(p){
  // Live ACE form wins when it's currently showing this patient (covers the case
  // where the recommendation was changed to "No follow-up" but the ACE record
  // hasn't been re-saved yet).
  try{
    if(typeof isAceNoFollowupSelected==='function' && isAceNoFollowupSelected()
       && p && p.id && (p.id===currentAcePatientId || p.id===selectedPatientId))
      return true
  }catch(e){}
  // Otherwise read every place the recommendation might be stored on the record.
  const candidates=[
    p?.ace?.recommendation,
    p?.ace?.formState?.selects?.recommendation,
    p?.ace?.formState?.inputs?.recommendation,
    p?.ace?.formState?.recommendation
  ]
  return candidates.some(v=>{
    const r=String(v||'').trim().toLowerCase().replace(/[‐-―]/g,'-').replace(/[.\s]+$/,'')
    return r==='no follow-up'||r==='no follow up'
  })
}
/* The injury event as the Day 1 form saved it: the chosen type, or for
   "Others" / "No Vehicle Involved" the description typed in (the hidden
   #injuryType select carries that text). The discharge summary used to read
   p.ace.injuryType, which no save writes, so every patient's summary said
   "motor vehicle collision" - a fall or a blow to the head included. */
function aceInjuryTypeText(p){
  const fs=(p&&p.ace&&p.ace.formState)||{}
  return String((fs.selects||{}).injuryType||(fs.inputs||{}).injuryType||(fs.inputs||{}).itOtherText||'').trim()
}
/* "the <type> injury incident" for a type from the Day 1 list; a typed
   description goes in brackets so the sentence still reads; with none at
   all, just "the injury incident" rather than naming a collision. */
/* Risk factors ticked in Day 1's Assessment (the list the Day 2 report and
   the Day 1 Impression print). The summary used to print "second head
   impact" for everyone unless it was typed in. */
function aceRiskFactorsText(p){
  const fs=(p&&p.ace&&p.ace.formState)||{}
  const list=(fs.checks&&Array.isArray(fs.checks.assessRiskList))?fs.checks.assessRiskList:[]
  return list.map(x=>String(x||'').trim()).filter(Boolean).join(', ')
}
function dischargeIncidentPhrase(type){
  const t=String(type||'').trim()
  if(!t)return 'injury incident'
  const listed=IT_GROUPS.some(g=>(g.options||[]).includes(t))
  return listed?t+' injury incident':'injury incident ('+t+')'
}
function getCaseDischargeData(p){
  const cd=p.caseDischarge||{}
  const d=p.demographics||{}
  const name=naturalPatientName(p)||'—'
  const dob=d.dob||''
  const doi=d.doi||''
  const examDates=[]
  if(p?.initialExam?.sessionDate)examDates.push(day2FormatAnyDate(p.initialExam.sessionDate))
  ;(Array.isArray(p?.reExams)?p.reExams:[]).forEach(rx=>{if(rx&&rx.sessionDate)examDates.push(day2FormatAnyDate(rx.sessionDate))})
  if(p?.finalExam?.sessionDate)examDates.push(day2FormatAnyDate(p.finalExam.sessionDate))
  const dischargeDate=cd.dischargeDate||day2FormatAnyDate(p?.dischargeDate||'')||(p?.finalExam?.sessionDate?day2FormatAnyDate(p.finalExam.sessionDate):'')||''
  let totalDates=cd.totalDates
  if(!totalDates){try{const t=computeTotalDatesOfService(p,{includeFinal:true});totalDates=t?String(t):''}catch(e){totalDates=''}}
  const injuryType=cd.injuryType||(p?.ace?.injuryType||'')||aceInjuryTypeText(p)
  return {
    name,dob,doi,
    age:fcrComputeAge(dob,dischargeDate),
    initialDOS:cd.initialDOS||day2FormatAnyDate(p?.ace?.dateOfService||p?.initialExam?.sessionDate||'')||'',
    examReportDates:cd.examReportDates||examDates.filter(Boolean).join(', ')||'',
    dischargeDate,
    totalDates:totalDates||'',
    finalStatus:cd.finalStatus||(isPatientAceNoFollowup(p)?'Discharged. No concussion.':'Maximum static medical improvement attained. Functional goals and ADL goals have been achieved. Patient is now discharged from active care. Advised patient to return if symptoms recur and advised to continue home care recommendations.'),
    riskFactors:cd.riskFactors||(p?.ace?.riskFactors||'')||aceRiskFactorsText(p)||'None identified',
    injuryType:injuryType,
    incidentPhrase:dischargeIncidentPhrase(injuryType),
    dxLines:Array.isArray(p?.ace?.diagnosisCodes)?p.ace.diagnosisCodes:[]
  }
}
function buildCaseDischargeDoc(p){
  const cd=getCaseDischargeData(p)
  const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'letter'})
  const PW=612,PH=792,ML=54,MR=54,TW=PW-ML-MR
  let y=120
  const sf=(s,z)=>{doc.setFont('times',s);doc.setFontSize(z)}
  const tc=(r,g,b)=>doc.setTextColor(r,g,b)
  function header(){
    tc(0,0,0);sf('bold',12);doc.text('CONCUSSION THERAPY GROUP',ML,52)
    sf('normal',10);const rx=PW-MR
    doc.text('2411 Crofton Lane, Suite 13A',rx,36,{align:'right'})
    doc.text('Crofton, MD, 21114-1336',rx,49,{align:'right'})
    doc.text('Phone: 410-451-9870',rx,62,{align:'right'})
    doc.text('Fax: 410-451-9872',rx,75,{align:'right'})
  }
  function need(h){if(y+h>PH-54){doc.addPage();header();y=120}}
  function richPara(segments,size,spaceAfter){
    size=size||12; const lh=size+3; spaceAfter=(spaceAfter==null)?6:spaceAfter
    const tokens=[]
    segments.forEach(seg=>String(seg.t==null?'':seg.t).split(/\s+/).filter(Boolean).forEach(w=>tokens.push({w,b:!!seg.b})))
    let x=ML; need(lh); tc(0,0,0)
    tokens.forEach(tok=>{
      sf(tok.b?'bold':'normal',size)
      const ww=doc.getTextWidth(tok.w)
      if(x>ML){
        const sp=doc.getTextWidth(' ')
        if(x+sp+ww>ML+TW){y+=lh;need(lh);x=ML}else{x+=sp}
      }
      doc.text(tok.w,x,y); x+=ww
    })
    y+=lh+spaceAfter
  }
  function heading(t,size){size=size||12;y+=4;need(size+6);sf('bold',size);tc(0,0,0);doc.text(t,ML,y);y+=size+4}
  header()
  heading('CASE DISCHARGE SUMMARY',12)
  richPara([{t:'Patient:',b:true},{t:cd.name},{t:'   Date of Birth:',b:true},{t:cd.dob||'—'},{t:'   Age:',b:true},{t:cd.age||'—'}],12,3)
  richPara([{t:'Date of Injury:',b:true},{t:cd.doi||'—'}],12,2)
  richPara([{t:'Date of Initial DOS:',b:true},{t:cd.initialDOS||'—'}],12,2)
  // Exam Report Dates line is omitted for no-follow-up cases.
  if(!isPatientAceNoFollowup(p))richPara([{t:'Neurocognitive and Vestibular Exam Report Dates:',b:true},{t:cd.examReportDates||'—'}],12,2)
  richPara([{t:'Discharge Date:',b:true},{t:cd.dischargeDate||'—'}],12,2)
  richPara([{t:'Total Dates of service:',b:true},{t:cd.totalDates||'—'}],12,8)
  richPara([{t:'Final Status:',b:true},{t:cd.finalStatus}],12,6)
  // Risk Factors line is omitted for no-follow-up cases (matches the inline ACE copy).
  if(!isPatientAceNoFollowup(p))richPara([{t:'Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Chronic Episodes of Neuroinflammation and Neuroinflammatory Symptoms:',b:true},{t:cd.riskFactors||'None identified'}],12,8)
  heading('Diagnosis',12)
  richPara([{t:(cd.dxLines&&cd.dxLines.length)?cd.dxLines.join(', '):'No diagnosis code selected'}],11,8)
  heading('Causation',12)
  richPara([{t:'Based on review of the '+cd.name+' complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between their injuries and the '+cd.incidentPhrase+' that occurred on '+(cd.doi||'—')+'.'}],12,6)
  heading('Medical Necessity',12)
  richPara([{t:'The care and treatment rendered to the '+cd.name+' has been medically necessary for the injuries sustained in the '+cd.incidentPhrase+' that occurred on '+(cd.doi||'—')+'.'}],12,6)
  heading('Reasonableness',12)
  richPara([{t:'The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.'}],12,8)
  return doc
}
function loadPdfLib(cb){
  if(window.PDFLib){cb();return}
  const s=document.createElement('script')
  s.src='vendor/pdf-lib.min.js'
  s.onload=cb;s.onerror=()=>showToast('Could not load PDF merge library','err')
  document.head.appendChild(s)
}
// Decode base64 data URLs directly. fetch() on very large data: URLs can fail/
// abort in some browsers, which would silently drop the file. Shared by the
// FCR document merge (buildFCRDoc) and the Comparison tab's multi-file merge.
function dataUrlToBytes(url){
  const comma=url.indexOf(',')
  if(comma<0)return null
  const meta=url.slice(0,comma),payload=url.slice(comma+1)
  if(/;base64/i.test(meta)){
    const bin=atob(payload)
    const bytes=new Uint8Array(bin.length)
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i)
    return bytes
  }
  return new TextEncoder().encode(decodeURIComponent(payload))
}
// Parse any date string into a sortable timestamp for FCR ordering.
// Undated / unparseable records sort to the end (latest).
function fcrSegmentDateKey(value){
  const s=String(value||'').trim()
  if(!s)return Number.MAX_SAFE_INTEGER
  // MM/DD/YYYY: month first. Read as DD/MM, 10/02 sorted as 10 February and
  // notes and re-exams came out of order in the FCR.
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if(m)return new Date(+m[3],+m[1]-1,+m[2]).getTime()
  const t=Date.parse(s)
  return isNaN(t)?Number.MAX_SAFE_INTEGER:t
}
async function buildFCRDoc(p){
  const PDFLib=window.PDFLib
  const merged=await PDFLib.PDFDocument.create()
  /* What each page is, for the Word copy (fcr-docx.js): 'text' for a report
     the portal writes, 'ace' for the Day 1 report, 'picture' for anything
     uploaded or signed - those stay exactly as they are. */
  const kinds=[]
  /* For a report page, the jsPDF document and page it came from: the Word copy
     reads the text and drawing straight from it, where every piece of text is
     still separate and exactly placed (read back from the PDF, table cells run
     together). */
  const sources=[]
  let aceRecord=null
  async function addBytes(bytes,kind){
    try{const src=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});const pages=await merged.copyPages(src,src.getPageIndices());pages.forEach(pg=>{merged.addPage(pg);kinds.push(kind||'picture');sources.push(null)})}
    catch(e){console.error('FCR merge (pdf) failed',e)}
  }
  async function addJsPdf(doc,kind){
    if(!doc)return
    try{
      const before=kinds.length
      await addBytes(doc.output('arraybuffer'),kind||'text')
      for(let i=before;i<kinds.length;i++)sources[i]={doc:doc,page:i-before+1}
    }catch(e){console.error('FCR jsPDF convert failed',e)}
  }
  /* pdf-lib embeds JPEG and PNG only. Anything else has to be redrawn through
     a canvas first. Used as a fallback rather than up front so the common path
     stays a direct embed with no re-encoding loss. */
  async function bytesToJpegBytes(bytes,mime){
    const url=URL.createObjectURL(new Blob([bytes],{type:mime||'application/octet-stream'}))
    try{
      const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('decode failed'));im.src=url})
      const c=document.createElement('canvas')
      c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height
      if(!c.width||!c.height)throw new Error('empty image')
      const cx=c.getContext('2d')
      cx.fillStyle='#FFFFFF';cx.fillRect(0,0,c.width,c.height)
      cx.drawImage(img,0,0)
      return dataUrlToBytes(c.toDataURL('image/jpeg',0.92))
    }finally{URL.revokeObjectURL(url)}
  }
  async function addImageBytes(bytes,mime){
    try{
      let img
      try{
        img=(mime.indexOf('png')>=0)?await merged.embedPng(bytes):await merged.embedJpg(bytes)
      }catch(embedErr){
        /* Reached by a WebP/HEIC/GIF uploaded before the re-encode above
           shipped. Without this the page was skipped and the only trace was a
           console line, so the FCR quietly came out short. */
        img=await merged.embedJpg(await bytesToJpegBytes(bytes,mime))
      }
      const pw=612,ph=792,page=merged.addPage([pw,ph])
      kinds.push('picture');sources.push(null)
      const scale=Math.min((pw-72)/img.width,(ph-72)/img.height,1)
      const w=img.width*scale,h=img.height*scale
      page.drawImage(img,{x:(pw-w)/2,y:(ph-h)/2,width:w,height:h})
    }catch(e){console.error('FCR image embed failed',e)}
  }
  async function addDataUrl(url){
    if(!url)return
    try{
      let bytes
      try{bytes=dataUrlToBytes(String(url))}catch(decodeErr){bytes=null}
      if(!bytes){const res=await fetch(url);bytes=new Uint8Array(await res.arrayBuffer())}
      const mime=((String(url).match(/^data:([^;]+)/)||[])[1]||'').toLowerCase()
      const isPdf=mime.indexOf('pdf')>=0||(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)
      if(isPdf)await addBytes(bytes); else await addImageBytes(bytes,mime||'image/jpeg')
    }catch(e){console.error('FCR document include failed',e)}
  }
  // 1. Case Discharge Summary (page 1)
  try{await addJsPdf(buildCaseDischargeDoc(p))}catch(e){console.error('FCR case discharge failed',e)}
  // 2. Assignment of Benefits + Valid ID (legacy single-slot docs, then any
  //    "Add Document" uploads categorized as AoB / Valid ID) - before billing.
  const docs=p.documents||{}
  const uploadDocs=Array.isArray(docs.uploads)?docs.uploads:[]
  /* Every upload is emitted exactly once. The Set is what makes the catch-all
     below safe: without it, a document matched by an earlier category would be
     added a second time. */
  const emittedUploads=new Set()
  const uploadsByType=(types)=>{
    const out=[]
    types.forEach(t=>uploadDocs.forEach(d=>{
      if(String(d.documentType||'')!==t)return
      if(emittedUploads.has(d))return
      emittedUploads.add(d)
      out.push(d)
    }))
    return out
  }
  if(docs.aob)await addDataUrl(docs.aob.pdfDataUrl||docs.aob.dataUrl)
  if(docs.validId)await addDataUrl(docs.validId.dataUrl||docs.validId.pdfDataUrl)
  for(const d of uploadsByType(['Assignment of Benefits','Valid ID']))await addDataUrl(await resolveUploadDataUrl(p,d))
  // 3. Patient-signed intake forms (Intake Form, AoB agreements, Minor
  //    Authorization). Generated from p.intake rather than stored as files, so
  //    they sit with the rest of the patient's paperwork, before billing.
  //    Same list the Documents tab shows, so the packet matches the chart.
  for(const fd of patientFormDocuments(p)){
    try{
      const blob=await fd.gen(p,patientFormIntakeData(p))
      if(blob)await addBytes(new Uint8Array(await blob.arrayBuffer()))
    }catch(e){console.error('FCR patient form failed —',fd.key,e)}
  }
  // 4. Billing Statement (offline copy: an uploaded billing file stands in for it)
  const offlineBillingFile=window.ctgOfflineBillingUpload?window.ctgOfflineBillingUpload(p):null
  if(window.ctgOfflineNoteUploads)window.ctgOfflineNoteUploads(p).forEach(d=>emittedUploads.add(d))
  const offlineDay1File=window.ctgOfflineDay1Upload?window.ctgOfflineDay1Upload(p):null
  if(offlineDay1File)emittedUploads.add(offlineDay1File)
  if(offlineBillingFile){emittedUploads.add(offlineBillingFile);await addDataUrl(await resolveUploadDataUrl(p,offlineBillingFile))}
  else try{await addJsPdf(buildBillingStatementDoc(getBillingStatementData(p)))}catch(e){console.error('FCR billing failed',e)}
  // 4b. Remaining uploaded documents (after billing, before test PDFs),
  //     in the fixed category order.
  for(const d of uploadsByType(['Referral Form','Police Report','Discharge Report','Other Report']))await addDataUrl(await resolveUploadDataUrl(p,d))
  for(const d of uploadDocs){
    if(emittedUploads.has(d))continue
    emittedUploads.add(d)
    await addDataUrl(await resolveUploadDataUrl(p,d))
  }
  // 5. Uploaded test result PDFs / images (Shoe Box all, Reflex all, latest Sway)
  const fcrTestFiles=collectFCRTestUploadFiles(p)
  let fcrTestEmbedded=0
  for(const f of fcrTestFiles){
    const before=merged.getPageCount()
    await addDataUrl(f.pdfDataUrl||f.dataUrl)
    const ok=merged.getPageCount()>before
    if(ok)fcrTestEmbedded++
    console.log('FCR test PDF',ok?'EMBEDDED':'FAILED','—',f&&f.name,'('+String((f&&(f.pdfDataUrl||f.dataUrl)||'').slice(0,24))+'…)')
  }
  console.log('FCR uploaded test PDFs — found:',fcrTestFiles.length,'embedded:',fcrTestEmbedded)
  if(fcrTestFiles.length===0){
    showToast('No saved test-result PDFs found. Open each exam, confirm the PDFs are listed, then click Update Exam so they are saved.','err')
  }else if(fcrTestEmbedded<fcrTestFiles.length){
    showToast('Warning: '+(fcrTestFiles.length-fcrTestEmbedded)+' of '+fcrTestFiles.length+' test PDFs could not be embedded (see console).','err')
  }
  // 6. Acute Concussion Evaluation (ACE) Report - immediately before the Day 2 Exam
  if(offlineDay1File)await addDataUrl(await resolveUploadDataUrl(p,offlineDay1File))
  else if(p.ace)try{
    const aceDoc=await buildAceDocForPatient(p)
    if(aceDoc&&Array.isArray(aceDoc.ctgRecord)&&aceDoc.ctgRecord.length){aceRecord=aceDoc.ctgRecord;await addJsPdf(aceDoc,'ace')}
    else await addJsPdf(aceDoc)
  }catch(e){console.error('FCR ACE failed',e)}
  // 7. Day 2 Report (always first of the clinical exam sequence)
  if(p.initialExam&&p.initialExam.savedAt)await addJsPdf(buildInitialExamPDF(null,p.id,null,p.initialExam,{returnDoc:true}))
  // 8. Re-Examinations and Daily Treatment Notes, interleaved strictly by
  //    session date (earliest first). Notes and re-exams mix freely by date.
  const fcrSegments=[]
  const reExams=Array.isArray(p.reExams)?p.reExams:[]
  for(let i=0;i<reExams.length;i++){
    const rx=reExams[i]
    // Skip a re-exam that is designated the Final Exam - it's emitted once, below, as Final.
    if(rx&&rx.savedAt&&!reExamIsDesignatedFinal(p,rx))fcrSegments.push({date:fcrSegmentDateKey(rx.sessionDate||rx.examinationDate||rx.savedAt),build:()=>buildInitialExamPDF(null,p.id,i,rx,{returnDoc:true})})
  }
  if(Array.isArray(p.dailyNotes)){
    for(const note of p.dailyNotes){
      if(!note)continue
      const noteFile=window.ctgOfflineNoteUpload?window.ctgOfflineNoteUpload(p,note):null
      if(noteFile){fcrSegments.push({date:fcrSegmentDateKey(note.sessionDate),file:noteFile});continue}
      fcrSegments.push({date:fcrSegmentDateKey(note.sessionDate),build:()=>new Promise(resolve=>downloadAllDailyNotesPdfForPatient(p.id,doc=>resolve(doc),[note]))})
    }
  }
  fcrSegments.sort((a,b)=>a.date-b.date)
  for(const seg of fcrSegments){if(seg.file){await addDataUrl(await resolveUploadDataUrl(p,seg.file));continue}await addJsPdf(await seg.build())}
  // 9. Final Examination Report (always last)
  if(p.finalExam&&p.finalExam.savedAt)await addJsPdf(buildInitialExamPDF(null,p.id,null,p.finalExam,{returnDoc:true}))
  if(merged.getPageCount()===0)throw new Error('No reports or documents are available to compile yet.')
  const out=await merged.save()
  out.ctgPageKinds=kinds
  out.ctgPageSources=sources
  out.ctgAceRecord=aceRecord
  return out
}
function _withFCR(pid,cb){
  const p=getPatient(pid)
  if(!p){showToast('Patient not found','err');return}
  showToast('Compiling FCR… this may take a moment')
  loadJsPDF(()=>loadPdfLib(async()=>{
    try{const bytes=await buildFCRDoc(p);cb(bytes,p)}
    catch(e){console.error(e);showToast('FCR error: '+e.message,'err')}
  }))
}
function viewFCR(pid){
  _withFCR(pid,(bytes)=>{
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}))
    _showPdfModal(url,'Final Case Report (FCR)')
    ctgAuditExport(pid,'fcr','preview')
  })
}
/* FCR download file name (applies to every role, admin included):
   "FINAL_CTG_NEURO Medical Bill + Reports <Patient Name>_<MM-DD-YYYY>.pdf" */
function fcrDownloadFileName(p){
  const name=(naturalPatientName(p)||'Patient').trim()
  const d=new Date()
  const date=String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'-'+d.getFullYear()
  const raw='FINAL_CTG_NEURO_Medical Bill + Reports_'+name+'_'+date+'.pdf'
  return raw.replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim()
}
/* Saves a file the page has just built. A click lets a page start a download
   for only about five seconds; a large FCR takes longer than that to build
   (the Word copy draws every page), and Chrome then blocks the download as one
   nobody asked for - nothing happens, or a "multiple files" warning sits in the
   address bar. When that window has passed, the file waits for one more click.
   Resolves true once the download has been started. */
async function ctgSaveBuiltFile(blob,filename,what){
  const ua=navigator.userActivation
  if(ua&&!ua.isActive){
    const ok=await ctgConfirm(what+' is ready.',{title:'Download ready',okLabel:'Download'})
    if(!ok)return false
  }
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=filename
  document.body.appendChild(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),60000)
  return true
}
function downloadFCR(pid){
  _withFCR(pid,async(bytes,p)=>{
    const saved=await ctgSaveBuiltFile(new Blob([bytes],{type:'application/pdf'}),fcrDownloadFileName(p),'The Final Case Report (PDF)')
    if(!saved)return
    ctgAuditExport(p.id,'fcr')
    showToast('FCR downloaded ✓')
  })
}

/* The same FCR as a Word file, asked for by the practice on 9 Oct: every page
   of the PDF above as a picture, so it looks exactly like the PDF
   (fcr-docx.js). Audited as its own kind of export. */
function downloadFCRWord(pid){
  _withFCR(pid,async(bytes,p)=>{
    try{
      const blob=await window.ctgFcrDocx.build(bytes,(n,total)=>showToast('Building the Word file… page '+n+' of '+total))
      const saved=await ctgSaveBuiltFile(blob,fcrDownloadFileName(p).replace(/\.pdf$/i,'.docx'),'The Final Case Report (Word)')
      if(!saved)return
      ctgAuditExport(p.id,'fcr_word')
      showToast('FCR Word file downloaded ✓')
    }catch(e){console.error(e);showToast('Word file error: '+e.message,'err')}
  })
}

const CHART_VIEW_WINDOW_MS=10*60*1000
const _chartViewSent=new Map()
/* A patient's records leaving the portal as a file (downloaded, or opened in
   a browser tab, which can be saved). The page builds these files itself, so
   it tells the server, which writes an 'export' audit row. Never blocks the
   download: a failed report is only logged to the console. */
// how: 'download' (default), 'print', 'open' (new tab) or 'preview' (the PDF viewer modal).
function ctgAuditExport(id,kind,how){
  if(!id||typeof window.ctgApiFetch!=='function')return
  try{if(typeof window.ctgCurrentUser!=='function'||!window.ctgCurrentUser())return}catch(e){return}
  window.ctgApiFetch('/api/patients/'+encodeURIComponent(id)+'/export',{method:'POST',body:JSON.stringify({kind,how:how||'download'})})
    .catch(e=>console.warn('Export audit failed',kind,e&&e.message))
}
// A list of patients leaving as a spreadsheet: logged as one 'export' row with the row count.
function ctgAuditListExport(kind,rows){
  if(typeof window.ctgApiFetch!=='function')return
  try{if(typeof window.ctgCurrentUser!=='function'||!window.ctgCurrentUser())return}catch(e){return}
  window.ctgApiFetch('/api/patients/export-list',{method:'POST',body:JSON.stringify({kind,rows})})
    .catch(e=>console.warn('Export audit failed',kind,e&&e.message))
}
function ctgAuditChartView(id,via){
  if(!id||typeof window.ctgApiFetch!=='function')return
  try{if(typeof window.ctgCurrentUser!=='function'||!window.ctgCurrentUser())return}catch(e){return}
  const now=Date.now()
  if(now-(_chartViewSent.get(id)||0)<CHART_VIEW_WINDOW_MS)return
  _chartViewSent.set(id,now)
  window.ctgApiFetch('/api/patients/'+encodeURIComponent(id)+'/view',{method:'POST',body:JSON.stringify({via:via||'chart'})})
    .catch(e=>{
      /* 404 means the record has not reached the server yet: a just-registered
         patient is still inside the 400ms save debounce, so the view POST loses
         the race with its own create. Without clearing the marker the retry
         never happens and that first chart view is never audited - which is
         exactly the gap the chart-view logging was added to close. Other 4xx
         (403 not-permitted) stay marked so they are not retried in a loop. */
      const st=e&&e.status
      if(st===404||!(st>=400&&st<500))_chartViewSent.delete(id)
    })
}
window.ctgAuditChartView=ctgAuditChartView
function renderPatientDetails(id){
  const p=getPatient(id), box=document.getElementById('patientDetail')
  if(!box)return
  if(!p){box.className='patient-detail-empty pld-detail-empty';box.innerHTML='Select a patient to view details.';return}
  if(box.closest('.page.active'))ctgAuditChartView(id,'chart')
  box.className='pld-detail-shell'
  const d=p.demographics||{}
  const lawyer=currentUserIsLawyer()
  const provider=currentUserIsProvider()
  if(lawyer && patientFirm(p).toLowerCase()!==currentUserFirm().toLowerCase()){
    box.className='patient-detail-empty pld-detail-empty';box.innerHTML='This patient is not available to your firm.';return
  }
  // Lawyers get a read-only, firm-scoped view: Billing summary + FCR only.
  const TABS=lawyer
    ?[['billing','Billing'],['fcr','Final Case Report']]
    :[['overview','Overview'],['ace','Day 1'],['exams','Exams'],['comparison','Comparison'],['notes','Notes'],['billing','Billing'],['documents','Documents'],['fcr','Final Case Report']]
  const allowedTabs=lawyer?TABS:TABS.filter(t=>patientTabAllowed(t[0]))
  const allowedKeys=allowedTabs.map(t=>t[0])
  const active=allowedKeys.includes(patientDetailActiveTab)?patientDetailActiveTab:(allowedKeys[0]||'overview')
  patientDetailActiveTab=active
  let panel=''
  if(active==='overview')panel=renderPatientOverviewPanel(p)
  else if(active==='exams')panel=renderPatientExamsPanel(p)
  else if(active==='comparison')panel=renderPatientComparisonPanel(p)
  else if(active==='ace')panel=renderPatientAcePanel(p)
  else if(active==='notes')panel=renderPatientNotesPanel(p)
  else if(active==='notesForm')panel=renderPatientNotesFormPanel(p)
  else if(active==='billing')panel=renderPatientBillingPanel(p)
  else if(active==='fcr')panel=renderPatientFCRPanel(p)
  else panel=renderPatientDocumentsPanel(p)
  box.innerHTML=`
    <div class="pld-profile-card">
      <div class="pld-profile-top">
        <div class="pld-profile-main">
          <div class="pld-profile-avatar">${escHtml(initialsForPatient(p))}</div>
          <div data-cs="${__cs}min-width:0">
            <div class="pld-profile-name">${escHtml(naturalPatientName(p))}</div>
            <div class="pld-profile-meta">
              ${patientDetailMetaItem('documents','ID',d.mrn)}
              ${patientDetailMetaItem('exams','Date of Birth',d.dob)}
              ${patientDetailMetaItem('exams','Date of Incident',d.doi)}
            </div>
          </div>
        </div>
        <div class="pld-profile-actions">
          ${(lawyer||provider)?'':`<button class="btn btn-ghost btn-sm" data-onclick="openSectionModal('${p.id}','demographics')">✎ Edit Demographics</button>
          ${isPatientInactive(p)
            ?`<button class="btn btn-ghost btn-sm" data-onclick="reactivatePatient('${p.id}')">⤴ Reactivate</button>`
            :(isPatientDischarged(p)
              ?`<button class="btn btn-ghost btn-sm" data-onclick="markPatientInactive('${p.id}')">Mark Inactive</button>`
              :`<button class="btn btn-ghost btn-sm" disabled title="Only discharged patients can be marked inactive" data-cs="${__cs}opacity:.45;cursor:not-allowed">Mark Inactive</button>`)}
          <button class="btn btn-ghost btn-sm" data-cs="${__cs}color:var(--red);border-color:rgba(3,4,94,.24)" data-onclick="deletePatient('${p.id}')">Delete</button>`}
        </div>
      </div>
      <div class="pld-status-row">${patientPregnancyBadge(p)}${isPatientInactive(p)?patientDetailStatusPill('Inactive','gray'):''}${lawyer?patientCaseStatusPill(p):(patientDetailStatusBadges(p,false)||patientDetailStatusPill('No records saved','gray'))}</div>
      <div class="pld-tabs">
        ${allowedTabs.map(t=>patientDetailTab(t[0],t[1],t[0])).join('')}
      </div>
    </div>
    ${panel}
  `
}

let notesFormState = { patientId: null, loading: false, error: '', code: '', notes: null }

function renderPatientNotesFormPanel(p) {
  if (!p) return ''
  // A different patient than the one loaded: start clean rather than showing
  // the previous chart's notes for a moment.
  if (notesFormState.patientId !== p.id) {
    notesFormState = { patientId: p.id, loading: false, error: '', code: '', notes: null }
    setTimeout(function () { notesFormLoad(p.id) }, 0)
  }
  const linkId = String(p.notesPatientId || '')
  const head = '<div class="pld-record-head"><div class="pld-record-title"><span>Notes Form</span></div>'
    + '<div class="nf-head-actions">'
    + (linkId ? '<span class="nf-link-chip" title="The Notes Form app\'s id for this patient">Linked: ' + escHtml(linkId) + '</span>' : '')
    + '<button class="btn btn-ghost btn-sm" data-onclick="notesFormEditLink(\'' + p.id + '\')">' + (linkId ? 'Change link' : 'Link patient') + '</button>'
    + '<button class="btn btn-ghost btn-sm" data-onclick="notesFormLoad(\'' + p.id + '\',true)">Refresh</button>'
    + '</div></div>'
  return '<div class="pld-record-card">' + head + '<div class="card-body" id="notesFormBody">'
    + notesFormBodyHTML() + '</div></div>'
}

function notesFormBodyHTML() {
  const s = notesFormState
  if (s.loading) return '<div class="nf-empty">Reading from the Notes Form app…</div>'
  if (s.code === 'NOT_CONFIGURED') {
    return '<div class="nf-empty"><b>The Notes Form integration is not switched on yet.</b>'
      + '<span>Set NOTES_API_BASE_URL in the App Service configuration to enable it.</span></div>'
  }
  if (s.code === 'NOT_LINKED') {
    return '<div class="nf-empty"><b>This chart is not linked to a Notes Form patient.</b>'
      + '<span>Use <b>Link patient</b> above to enter the id the Notes Form app uses for this person.</span></div>'
  }
  if (s.error) {
    return '<div class="nf-empty nf-err"><b>Could not read from the Notes Form app.</b><span>' + escHtml(s.error) + '</span></div>'
  }
  if (!s.notes) return '<div class="nf-empty">Nothing loaded yet.</div>'
  if (!s.notes.length) return '<div class="nf-empty">No notes for this patient yet.</div>'
  const days = window.ctgNotesByDay.group(s.notes)
  return '<div class="nf-daysum">' + s.notes.length + ' note' + (s.notes.length === 1 ? '' : 's')
    + ' across ' + days.length + ' day' + (days.length === 1 ? '' : 's') + '</div>'
    + '<div class="nf-days">' + days.map(notesFormDayHTML).join('') + '</div>'
    + '<p class="nf-foot">Read live from the Notes Form app. Not stored in this chart.</p>'
}

function notesFormDayHTML(d) {
  return '<section class="nf-day">'
    + '<header class="nf-day-hd"><h4>' + escHtml(d.label) + '</h4>'
    + '<span>' + d.notes.length + ' note' + (d.notes.length === 1 ? '' : 's') + '</span></header>'
    + '<div class="nf-day-notes">' + d.notes.map(notesFormNoteHTML).join('') + '</div>'
    + '</section>'
}

function notesFormNoteHTML(n) {
  /* Anything the adapter could not read is still shown rather than dropped -
     unrecognised clinical content disappearing without trace would be worse
     than an ugly row. */
  if (!n.text) {
    return '<div class="nf-daynote nf-daynote-raw"><pre class="nf-raw">'
      + escHtml(JSON.stringify(n.raw || n, null, 2)) + '</pre></div>'
  }
  return '<div class="nf-daynote"><p class="nf-text">' + escHtml(n.text) + '</p></div>'
}


async function notesFormLoad(patientId, force) {
  const s = notesFormState
  if (s.loading) return
  if (s.notes && !force) return
  notesFormState = { patientId: patientId, loading: true, error: '', code: '', notes: s.notes }
  notesFormPaint()
  try {
    const d = await window.ctgApiFetch('/api/patients/' + encodeURIComponent(patientId) + '/notes-form')
    notesFormState = { patientId: patientId, loading: false, error: '', code: '', notes: (d && d.notes) || [] }
  } catch (e) {
    notesFormState = {
      patientId: patientId, loading: false,
      error: (e && e.message) || 'Unknown error',
      code: (e && e.code) || (e && e.body && e.body.code) || '',
      notes: null
    }
  }
  notesFormPaint()
}

/* Repaints just this panel. Going through renderPatientDetails would rebuild
   the whole chart and re-enter renderPatientNotesFormPanel, which would kick
   off another load. */
function notesFormPaint() {
  const el = document.getElementById('notesFormBody')
  if (el) el.innerHTML = notesFormBodyHTML()
  const list = document.getElementById('dailyNotesList')
  const p = list && getPatient(notesFormState.patientId)
  if (p) list.innerHTML = dailyNotesListHTML(p)
}

// Same rule as validPatientId in backend/src/notesApi.js; '' clears the link.
function validRecoverArcId(v) {
  const s = String(v || '').trim()
  return !s || /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(s)
}
async function notesFormEditLink(patientId) {
  const p = getPatient(patientId)
  if (!p) return
  const cur = String(p.notesPatientId || '')
  const val = await ctgPrompt('Enter the RecoverArc ID for ' + naturalPatientName(p) + '.', {
    title: cur ? 'Change RecoverArc ID' : 'Add RecoverArc ID',
    okLabel: 'Save',
    value: cur,
    placeholder: 'RecoverArc ID',
    hint: 'This is what the portal sends to ask for this person\'s notes. Matching on name and date of birth is deliberately not offered - a near-match would file one patient\'s notes into another\'s chart.'
  })
  if (val === null) return
  if (!validRecoverArcId(val)) { showToast('A RecoverArc ID is letters, numbers and - _ . : only, starting with a letter or number.', 'err'); return }
  p.notesPatientId = String(val || '').trim()
  p.updatedAt = new Date().toISOString()
  persistPatients()
  notesFormState = { patientId: null, loading: false, error: '', code: '', notes: null }
  renderPatientDetails(patientId)
  showToast(p.notesPatientId ? 'RecoverArc ID saved' : 'RecoverArc ID cleared', 'ok')
}

function renderDetailSection(title,section,icoClass,items,extra){
  const p=getPatient(selectedPatientId)
  const id=p?p.id:''
  const cells=patientDetailGrid(items)
  return patientDetailAccordion(title,title.slice(0,2).toUpperCase(),icoClass,cells,`${extra||''}<button class="btn btn-ghost btn-sm" data-onclick="openSectionModal('${id}','${section}')">Edit</button><button class="btn btn-ghost btn-sm" data-onclick="clearPatientSection('${id}','${section}')">Delete</button>`)
}

/* Inactive patients. Inactive is a visibility flag, not a move or a delete:
   the record stays in ctgPatients untouched, so billing, exams, FCR and
   documents all survive. Only discharged patients can be marked inactive,
   since discharged cases are often still being worked. */
async function markPatientInactive(id){
  const p=getPatient(id); if(!p)return
  if(!isPatientDischarged(p)){showToast('Only discharged patients can be marked inactive','err');return}
  if(!(await ctgConfirm('Mark '+naturalPatientName(p)+' as inactive? They will be removed from the Patient List and kept under Inactive Patients. Nothing is deleted — you can reactivate them anytime.',{title:'Mark Patient Inactive',okLabel:'Mark Inactive'})))return
  p.inactive=true
  p.inactiveSince=new Date().toISOString()
  p.updatedAt=p.inactiveSince
  if(selectedPatientId===id)selectedPatientId=null
  persistPatients();renderPatientWorkflow();renderPatientDetails(null)
  showToast('Patient marked inactive — find them under Inactive or All ✓')
}
async function reactivatePatient(id){
  const p=getPatient(id); if(!p)return
  if(!(await ctgConfirm('Reactivate '+naturalPatientName(p)+' and return them to the Patient List?',{title:'Reactivate Patient',okLabel:'Reactivate'})))return
  p.inactive=false
  delete p.inactiveSince
  delete p.archived
  delete p.archivedAt
  p.updatedAt=new Date().toISOString()
  // In the Inactive view the reactivated patient drops out of the list.
  if(patientListView==='inactive'&&selectedPatientId===id)selectedPatientId=null
  persistPatients();renderPatientWorkflow()
  if(patientListView==='inactive')renderPatientDetails(selectedPatientId)
  showToast('Patient reactivated — back on the Patient List ✓')
}
async function deletePatient(id){
  const p=getPatient(id); if(!p)return
  if(!(await ctgConfirm('Permanently delete '+naturalPatientName(p)+'? Their chart, uploaded documents, session recordings and transcripts are removed. Appointment and referral history is kept without their name. This cannot be undone.',{danger:true,okLabel:'Delete'})))return
  // The server has to be told. Dropping the patient from ctgPatients and calling
  // persistPatients() only ever re-sent the patients that REMAIN, so the row
  // survived in the database and came back on the next load.
  let delRes=null
  try{
    delRes=await window.ctgApiFetch('/api/patients/'+encodeURIComponent(id),{method:'DELETE'})
  }catch(e){
    showToast('Could not delete patient: '+((e&&e.message)||'server error'),'err')
    return
  }
  // Block any save already queued for this patient from re-creating it - the
  // /full route inserts when the row is missing, so a debounced write landing
  // after the DELETE would resurrect it.
  _deletedPatientIds.add(id)
  ctgPatients=ctgPatients.filter(x=>x.id!==id)
  if(selectedPatientId===id)selectedPatientId=null
  if(currentAcePatientId===id)currentAcePatientId=null
  renderPatientWorkflow();renderPatientDetails(null);updateAceSavePanel()
  // The record is gone either way; a file that could not be removed is recorded
  // in the audit log as delete_incomplete so an administrator can clear it.
  if(delRes&&delRes.filesLeft)showToast('Patient deleted, but '+delRes.filesLeft+' stored file(s) could not be removed. This is recorded in the audit log.','err')
  else showToast('Patient deleted')
}
async function clearPatientSection(id,section){
  const p=getPatient(id); if(!p)return
  if(section==='demographics'){deletePatient(id);return}
  if(!(await ctgConfirm('Delete the '+(section==='ace'?'Day 1':section)+' section for this patient?',{danger:true,okLabel:'Delete'})))return
  if(section==='diagnosis'||section==='ace'){p.ace=null;p.aceComplete=false;clearAceBillingLock(p)}
  if(section==='initialExam'){detachLinkedDailyNoteFromExamDelete(p,p.initialExam);p.initialExam=null}
  if(section==='reExams'){(Array.isArray(p.reExams)?p.reExams:[]).forEach(rx=>detachLinkedDailyNoteFromExamDelete(p,rx));p.reExams=[]}
  if(section==='finalExam'){detachLinkedDailyNoteFromExamDelete(p,p.finalExam);p.finalExam=null}
  if(section==='billing')p.billing={statementDate:'',accountNo:'',status:'',charges:'',notes:''}
  if(section==='notes')p.notes={text:''}
  p.updatedAt=new Date().toISOString()
  persistPatients();renderPatientWorkflow();renderPatientDetails(id)
  showToast('Section deleted')
}

function openSectionModal(id,section){
  const p=getPatient(id); if(!p)return
  modalContext={patientId:id,section}
  document.body.classList.add('modal-open')
  document.getElementById('patientModal').classList.add('show')
  const titleMap={demographics:'Edit Demographics',diagnosis:'Edit Day 1',billing:'Edit Billing',notes:'Edit Notes'}
  document.getElementById('modalTitle').textContent=titleMap[section]||'Edit'
  const d=p.demographics||{}, a=p.ace||{}, b=p.billing||{}, n=p.notes||{}
  let body=''
  if(section==='demographics')body=`<div class="g2">
    ${modalInput('Last Name','modalLastName',d.lastName)}${modalInput('First Name','modalFirstName',d.firstName)}${modalInput('ID / Medical Record #','modalMRN',d.mrn)}${modalInput('Date of Birth','modalDOB',d.dob)}${modalSelect('Gender','modalGender',d.gender,['','Male','Female','Non-binary','Prefer not to say'])}${modalSelect('Device','modalDevice',d.device,['','iPhone','Android'])}${modalInput('Address Line 1','modalAddressLine',d.addressLine,'full')}${modalInput('Address Line 2','modalAddressLine2',d.addressLine2,'full')}${modalInput('City','modalCity',patientCityStateZip(d).city)}${modalInput('State','modalState',patientCityStateZip(d).state)}${modalInput('ZIP Code','modalZip',patientCityStateZip(d).zip)}${modalInput('Email Address','modalEmail',d.email)}${modalInput('Mobile #','modalMobile',d.mobile)}${modalInput('Date of Incident','modalDOI',d.doi)}${modalRegisteredLawFirmSelect('modalLawFirm',d.lawFirm)}
    <div class="fg full"><label>RecoverArc ID</label><input type="text" id="modalRecoverArcId" value="${escHtml(p.notesPatientId||'')}" placeholder="e.g. patient_0f3c…" autocomplete="off" spellcheck="false"><div class="small-muted">The id RecoverArc uses for this patient. Their notes are matched to this chart by this id only, never by name or date of birth.</div></div>
    <div class="sdiv full" data-cs="${__cs}margin-top:2px"><span>Discharge Information</span></div>
    <div class="fg full"><label>Discharge Date</label><div data-cs="${__cs}display:flex;gap:8px;align-items:center"><div class="date-field" data-cs="${__cs}flex:1"><input type="text" id="modalDischargeDate" value="${escHtml(p.dischargeDate||'')}" placeholder="MM/DD/YYYY"><button type="button" class="cal-btn" data-onclick="toggleDatePicker('modalDischargeDate')" aria-label="Open date picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></div><button type="button" class="btn btn-ghost btn-sm" data-cs="${__cs}color:var(--red);border-color:rgba(3,4,94,.24)" data-onclick="clearDischargeDate()">Delete Date</button></div><div class="small-muted">Leave blank if the patient does not have a discharge date yet.</div></div>
    <div class="fg full"><label class="plain-check"><input type="checkbox" id="modalAdminDischarged" ${p.adminDischarged?'checked':''}> Admin Discharged</label></div>
    <div class="fg full"><label class="plain-check"><input type="checkbox" id="modalPendingAce" ${p.pendingAce?'checked':''}> Pending for Day 1</label></div>
  </div>`
  if(section==='diagnosis')body=`<div class="g2">${modalInput('Day 1 Score','modalAceScore',a.aceScore)}${modalInput('Date of Service','modalAceDOS',a.dateOfService)}<div class="fg full"><label>Diagnosis Codes / Details</label><textarea id="modalDxCodes" data-cs="${__cs}min-height:150px">${escHtml((a.diagnosisCodes||[]).join('\n'))}</textarea></div><div class="fg full"><label>Positive ACE Symptoms</label><textarea id="modalPositiveSymptoms" data-cs="${__cs}min-height:120px">${escHtml((a.positiveSymptoms||[]).join('\n'))}</textarea></div></div>`
  if(section==='billing')body=`<div class="g2">${modalInput('Statement Date','modalStatementDate',b.statementDate)}${modalInput('Account No.','modalAccountNo',b.accountNo)}</div>`
  if(section==='notes')body=`<div class="fg"><label>Patient Notes</label><textarea id="modalPatientNotes" data-cs="${__cs}min-height:180px">${escHtml(n.text||'')}</textarea></div>`
  document.getElementById('modalBody').innerHTML=body
  document.getElementById('modalSaveBtn').onclick=saveModalUpdates
}
function modalInput(label,id,value,cls){return `<div class="fg ${cls||''}"><label>${escHtml(label)}</label><input type="text" id="${id}" value="${escHtml(value||'')}"></div>`}
function modalSelect(label,id,value,options){return `<div class="fg"><label>${escHtml(label)}</label><select id="${id}">${options.map(o=>`<option ${o===(value||'')?'selected':''}>${escHtml(o||'— Select —')}</option>`).join('')}</select></div>`}
function modalRegisteredLawFirmSelect(id,value){
  const firms=(typeof window.ctgGetRegisteredLawFirms==='function')?window.ctgGetRegisteredLawFirms():[]
  const opts=[''].concat(firms).map(o=>`<option value="${escHtml(o)}" ${o===(value||'')?'selected':''}>${escHtml(o||'— Select —')}</option>`).join('')
  return `<div class="fg full"><label>Law Firm</label><select id="${id}">${opts}</select></div>`
}
async function patientStoredDocumentFromFile(file,kind){
  if(!file)return null
  const name=String(file.name||'uploaded-file').trim()
  const mime=String(file.type||'').toLowerCase()
  if(kind==='aob' && !(mime==='application/pdf'||/\.pdf$/i.test(name))){throw new Error('Assignment of Benefits must be a PDF file.')}
  if(kind==='validId' && !(mime==='image/jpeg'||/\.jpe?g$/i.test(name))){throw new Error('Valid ID must be a JPG file.')}
  const dataUrl=await fileToDataURL(file)
  return {name,type:file.type||(kind==='aob'?'application/pdf':'image/jpeg'),dataUrl,uploadedAt:new Date().toISOString(),documentType:kind}
}
function toggleModalStoredDocumentDelete(kind){
  const isAob=kind==='aob'
  const flag=document.getElementById(isAob?'modalDeleteAob':'modalDeleteValidId')
  const input=document.getElementById(isAob?'modalAobPdf':'modalValidIdJpg')
  const status=document.getElementById(isAob?'modalAobStatus':'modalValidIdStatus')
  const btn=document.getElementById(isAob?'modalAobDeleteBtn':'modalValidIdDeleteBtn')
  if(!flag||!btn)return
  const marked=flag.value!=='1'
  flag.value=marked?'1':'0'
  if(input){input.value='';input.disabled=marked}
  if(status)status.textContent=marked?'Marked for deletion. Click Save Updates to remove this file.':(status.dataset.current||'Current: No file uploaded')
  btn.textContent=marked?'Undo Delete':(isAob?'Delete uploaded AOB':'Delete uploaded Valid ID')
  btn.style.color=marked?'var(--accent)':'var(--red)'
  btn.style.borderColor=marked?'rgba(37,99,235,.3)':'rgba(3,4,94,.24)'
}
function closePatientModal(){
  document.getElementById('patientModal').classList.remove('show')
  document.body.classList.remove('modal-open')
  modalContext={patientId:null,section:null}
  policyLimitContext={patientId:null,index:null}
  // The Policy Limits list view hides the shared Save button - restore it so the
  // next modal to use this shell isn't left without one.
  const btn=document.getElementById('modalSaveBtn')
  if(btn)btn.style.display=''
}
async function saveModalUpdates(){
  const p=getPatient(modalContext.patientId); if(!p)return
  const s=modalContext.section
  if(s==='demographics'){
    if(!validRecoverArcId(rawVal('modalRecoverArcId'))){showToast('A RecoverArc ID is letters, numbers and - _ . : only, starting with a letter or number.','err');return}
    const genderVal=document.getElementById('modalGender').value
    const deviceVal=document.getElementById('modalDevice')?.value||''
    p.demographics={...(p.demographics||{}),lastName:rawVal('modalLastName'),firstName:rawVal('modalFirstName'),mrn:rawVal('modalMRN'),dob:rawVal('modalDOB'),gender:genderVal==='— Select —'?'':genderVal,device:deviceVal==='— Select —'?'':deviceVal,addressLine:rawVal('modalAddressLine'),addressLine2:rawVal('modalAddressLine2'),city:rawVal('modalCity'),state:rawVal('modalState'),zip:rawVal('modalZip'),cityStateZip:joinCityStateZip(rawVal('modalCity'),rawVal('modalState'),rawVal('modalZip')),email:rawVal('modalEmail'),mobile:rawVal('modalMobile'),doi:rawVal('modalDOI'),lawFirm:rawVal('modalLawFirm')}
    const recoverArcId=String(rawVal('modalRecoverArcId')||'').trim()
    if(recoverArcId!==String(p.notesPatientId||'')){
      p.notesPatientId=recoverArcId
      // Drop notes already read under the old id so the tab reloads.
      if(typeof notesFormState!=='undefined'&&notesFormState.patientId===p.id)notesFormState={patientId:null,loading:false,error:'',code:'',notes:null}
    }
    p.dischargeDate=rawVal('modalDischargeDate')
    p.adminDischarged=!!document.getElementById('modalAdminDischarged')?.checked
    p.pendingAce=document.getElementById('modalPendingAce').checked
    try{
      const docs={...(p.documents||{})}
      const deleteAob=document.getElementById('modalDeleteAob')?.value==='1'
      const deleteValidId=document.getElementById('modalDeleteValidId')?.value==='1'
      if(deleteAob)delete docs.aob
      if(deleteValidId)delete docs.validId
      const aobFile=document.getElementById('modalAobPdf')?.files?.[0]
      const idFile=document.getElementById('modalValidIdJpg')?.files?.[0]
      if(aobFile)docs.aob=await patientStoredDocumentFromFile(aobFile,'aob')
      if(idFile)docs.validId=await patientStoredDocumentFromFile(idFile,'validId')
      p.documents=docs
    }catch(err){showToast(err.message||'Could not save uploaded document','err');return}
  }
  if(s==='diagnosis'){p.ace={...(p.ace||{}),aceScore:gv('modalAceScore'),dateOfService:gv('modalAceDOS'),diagnosisCodes:gv('modalDxCodes').split('\n').map(x=>x.trim()).filter(Boolean),positiveSymptoms:gv('modalPositiveSymptoms').split('\n').map(x=>x.trim()).filter(Boolean),savedAt:(p.ace&&p.ace.savedAt)||new Date().toISOString()};ensureAceBillingLock(p)}
  if(s==='billing'){
    const b={...(p.billing||{})}
    b.statementDate=gv('modalStatementDate')
    b.accountNo=gv('modalAccountNo')
    delete b.status
    delete b.notes
    p.billing=b
  }
  if(s==='notes')p.notes={text:gv('modalPatientNotes')}
  p.updatedAt=new Date().toISOString()
  persistPatients();closePatientModal();renderPatientWorkflow();renderPatientDetails(p.id)
  showToast('Updates saved ✓')
}

function mountAceFormForPatientPage(){
  const host=document.getElementById('aceFormHost')
  const mount=document.getElementById('patientAceMount')
  if(host&&mount&&!mount.contains(host))mount.appendChild(host)
}
function mountAceFormForGuidePage(){
  const host=document.getElementById('aceFormHost')
  const page=document.getElementById('page-day1')
  if(host&&page&&!page.contains(host)){
    const actionBar=page.querySelector('.action-bar')
    page.insertBefore(host,actionBar||null)
  }
}
function applyStyledLabelCheck(label,checked){
  if(!label)return
  const chk=label.querySelector('.rchk')
  label.classList.toggle('checked',!!checked)
  if(checked){
    label.style.background='var(--al)';label.style.borderColor='var(--accent)'
    if(chk){chk.style.background='var(--accent)';chk.style.borderColor='var(--accent)';chk.style.color='#fff'}
  }else{
    label.style.background='';label.style.borderColor=''
    if(chk){chk.style.background='';chk.style.borderColor='';chk.style.color=''}
  }
}
function collectAceFormState(){
  const scope=document.getElementById('aceFormHost')||document
  const state={inputs:{},selects:{},yn:{},symptoms:{},checks:{},icdCodes:[]}
  scope.querySelectorAll('input[type=text],textarea').forEach(el=>{if(el.id)state.inputs[el.id]=el.value})
  scope.querySelectorAll('select').forEach(el=>{if(el.id)state.selects[el.id]=el.value})
  ;['hpiList','pmhList'].forEach(id=>{
    state.yn[id]=[...document.querySelectorAll('#'+id+' .yn-row')].map(row=>{
      const active=row.querySelector('.yn-btn.active')
      return active?(active.classList.contains('yes')?'yes':active.classList.contains('no')?'no':active.classList.contains('na')?'na':''):''
    })
  })
  /* Optional per-row comments, preserved verbatim. pmhList joined this list
     when the pregnancy question gained a "how many weeks" box - without it the
     answer was typed in and then silently dropped on save. Restore is generic
     (it walks whatever keys exist), so only the collect side needed changing. */
  state.ynComments={}
  ;['hpiList','pmhList'].forEach(id=>{
    state.ynComments[id]=[...document.querySelectorAll('#'+id+' .yn-row')].map(row=>row.querySelector('.yn-comment-input')?.value||'')
  })
  ;['acePhysical','aceCognitive','aceSleep','aceEmotional'].forEach(id=>{
    state.symptoms[id]=[...document.querySelectorAll('#'+id+' .sym-score-item')].map(item=>{
      const active=item.querySelector('.sym-btn.active')
      return active?active.dataset.val:''
    })
  })
  ;['riskFactorsList','assessRiskList','earlySignsList','referralTypeList','immedExperienceList'].forEach(id=>{
    state.checks[id]=[...document.querySelectorAll('#'+id+' label.checked')].map(chkTxt)
  })
  state.icdCodes=[...document.querySelectorAll('#icdGrid .icd-item.checked')].map(el=>el.querySelector('.icd-code')?.textContent.trim()).filter(Boolean)
  // The injury-type picker's actual selection, 'No Vehicle Involved' against
  // the generic 'Others' write-in, has to be saved explicitly. Both collapse to
  // the same free-text value in state.selects, so restoring from that text
  // alone cannot tell them apart. See restoreInjuryTypeValueFromState.
  state.itSelected=itSelected
  return state
}
function restoreInjuryTypeValueFromState(state){
  const rawSaved=(state?.selects?.injuryType||state?.inputs?.injuryType||'').trim()
  const rawOther=(state?.inputs?.itOtherText||'').trim()
  const savedVal=rawSaved||rawOther
  if(typeof itSetValue==='function'){
    // Prefer the explicitly saved picker mode when present. A record saved as 'No
    // Vehicle Involved' has to stay that way on restore rather than falling back
    // to the generic 'Others' match below, which would hide the MOI free-text box
    // and revert buildPDF's Mechanism of Injury section to the collision template.
    if(state?.itSelected){
      itSelected=state.itSelected
      if(typeof itSync==='function')itSync()
      return
    }
    if(!savedVal){itSetValue('');return}
    const knownOptions=(typeof itOptions!=='undefined'&&Array.isArray(itOptions))?itOptions:[]
    if(knownOptions.includes(savedVal)){
      itSetValue(savedVal)
    }else{
      itSelected='Others'
      const other=document.getElementById('itOtherText')
      if(other)other.value=savedVal
      if(typeof itSync==='function')itSync()
      const display=document.getElementById('itDisplayText')
      if(display){display.textContent='Others';display.style.color='var(--text)'}
    }
    return
  }
  const sel=document.getElementById('injuryType')
  if(sel){sel.innerHTML='';const o=document.createElement('option');o.value=savedVal;o.selected=true;sel.appendChild(o)}
}

function applyAceFormState(state){
  if(!state)return
  ;(window.ctgDay1Hooks&&window.ctgDay1Hooks.beforeRestore||[]).forEach(f=>{try{f(state)}catch(e){console.warn('Day 1 add-on restore hook failed',e)}})
  Object.entries(state.inputs||{}).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=value})
  Object.entries(state.selects||{}).forEach(([id,value])=>{
    if(id==='injuryType') return
    const el=document.getElementById(id);if(!el)return
    el.value=value
    if(el.value!==value){
      const opt=[...el.options].find(o=>o.text===value||o.value===value)
      if(opt)el.value=opt.value
    }
    el.dispatchEvent(new Event('change',{bubbles:true}))
    el.dispatchEvent(new Event('input',{bubbles:true}))
  })
  restoreInjuryTypeValueFromState(state)
  Object.entries(state.yn||{}).forEach(([id,arr])=>{
    document.querySelectorAll('#'+id+' .yn-row').forEach(r=>{
      r.querySelectorAll('.yn-btn').forEach(b=>b.classList.remove('active'))
      r.dataset.answered='0'
      const c=r.querySelector('.yn-comment')
      if(c){c.style.display='none';c.querySelectorAll('input,select').forEach(el=>{el.value=''})}
    })
    ;(arr||[]).forEach((val,i)=>{if(val)setYNRow(id,i,val)})
    updateYNCount(id,id==='hpiList'?'hpiCount':'pmhCount')
  })
  Object.entries(state.ynComments||{}).forEach(([id,arr])=>{
    const rows=document.querySelectorAll('#'+id+' .yn-row')
    ;(arr||[]).forEach((txt,i)=>{const inp=rows[i]?.querySelector('.yn-comment-input');if(inp)inp.value=txt||''})
    /* The line above fills the hidden field behind the number/unit dropdowns.
       Without this the stored answer would be saved and printed correctly while
       the two dropdowns sat blank, so the form looked like it had lost it. */
    restoreStructuredComments(id)
  })
  applyPregnancyGate()
  Object.entries(state.symptoms||{}).forEach(([id,arr])=>{
    const items=document.querySelectorAll('#'+id+' .sym-score-item')
    ;(arr||[]).forEach((val,i)=>{
      const item=items[i]; if(!item)return
      item.querySelectorAll('.sym-btn').forEach(b=>b.classList.remove('active'))
      item.classList.remove('scored')
      if(val==='0'||val==='1'){
        const btn=item.querySelector('.sym-btn[data-val="'+val+'"]')
        if(btn)btn.classList.add('active')
        if(val==='1')item.classList.add('scored')
      }
    })
  })
  removeCustomRiskLabels()
  Object.entries(state.checks||{}).forEach(([id,labels])=>{
    document.querySelectorAll('#'+id+' label').forEach(label=>applyStyledLabelCheck(label,false))
    ;(labels||[]).forEach(txt=>{
      let label=[...document.querySelectorAll('#'+id+' label')].find(el=>chkTxt(el)===txt)
      if(!label&&RISK_WRITEIN_LISTS.includes(id))label=addCustomRiskLabel(id,txt,false)
      if(label)applyStyledLabelCheck(label,true)
    })
  })
  document.querySelectorAll('#icdGrid .icd-item').forEach(el=>el.classList.remove('checked'))
  const selected=new Set(state.icdCodes||[])
  document.querySelectorAll('#icdGrid .icd-item').forEach(el=>{
    const code=el.querySelector('.icd-code')?.textContent.trim()
    if(selected.has(code))el.classList.add('checked')
  })
  const n=document.querySelectorAll('#icdGrid .icd-item.checked').length
  const dx=document.getElementById('dxCount'); if(dx)dx.textContent=n+' selected'
  const sc=document.getElementById('icdSelCount'); if(sc)sc.textContent=n+' codes selected'
  if(typeof aceLocSyncFromValue==='function')aceLocSyncFromValue()
  updateAceTotals();updateBanner();updateBoilerplates();toggleFollowupFields();syncAceNoFollowupState();updateAceSavePanel()
}
function hydrateAceFormFromSavedPatientAce(p){
  if(!p||!p.ace)return
  const a=p.ace
  if(a.formState){applyAceFormState(a.formState);return}
  if(a.dateOfService&&a.dateOfService!=='—')document.getElementById('dos').value=a.dateOfService
  if(a.dateOfInjury&&a.dateOfInjury!=='—'){document.getElementById('doi').value=a.dateOfInjury}
  ;[['scorePhys','physicalScore'],['scoreCog','cognitiveScore'],['scoreSleep','sleepScore'],['scoreEmot','emotionalScore'],['scoreTotalBig','aceScore']].forEach(([id,key])=>{const el=document.getElementById(id);if(el&&a[key])el.textContent=a[key]})
  const total=a.aceScore||'0'
  const at=document.getElementById('aceTotal'); if(at)at.textContent='Total: '+total+' / 22'
  const ab=document.getElementById('abACE'); if(ab)ab.textContent=total+'/22'
}

function startAceForPatient(id){
  ctgAuditChartView(id,'day1')
  const p=getPatient(id); if(!p)return
  const openHost=document.getElementById('aceFormHost')
  if(_aceDirtyFor===id&&openHost&&openHost.dataset.patientId===id){
    currentAcePatientId=id
    selectedPatientId=id
    const openPage=document.getElementById('page-patientAce')
    if(openPage)openPage.dataset.patientId=id
    updateBanner();updateBoilerplates();updateAceSavePanel();updatePatientAceBar()
    showPage('patientAce')
    showDraftStatus('Unsaved changes kept')
    return
  }
  aceFlushUnsavedForm()
  _autoCompleteFired=!!(p.aceComplete)
  currentAcePatientId=null
  clearAll()
  currentAcePatientId=id
  selectedPatientId=id
  const host=document.getElementById('aceFormHost')
  const page=document.getElementById('page-patientAce')
  if(host)host.dataset.patientId=id
  if(page)page.dataset.patientId=id
  document.getElementById('ptName').value=naturalPatientName(p)
  document.getElementById('ptMRN').value=p.demographics?.mrn||''
  document.getElementById('ptDOB').value=p.demographics?.dob||''
  document.getElementById('ptGender').value=p.demographics?.gender||''
  document.getElementById('doi').value=p.demographics?.doi||''
  hydrateAceFormFromSavedPatientAce(p)
  aceMarkClean()   // freshly hydrated: the form matches the record
  noteAceFormVersion(id)   // ...and this is the version it was filled from
  applyPregnancyGate()
  updateBanner();updateBoilerplates();updateAceSavePanel();updatePatientAceBar()
  showPage('patientAce')
  showToast('Day 1 form opened for '+naturalPatientName(p))
}
// kind 'word': the same report as a Word document (day1-docx.js), not a PDF.
function downloadAceForPatient(id,kind){
  const p=getPatient(id); if(!p||!p.ace)return
  const prevPatientId=currentAcePatientId
  const host=document.getElementById('aceFormHost')
  const pg=document.getElementById('page-patientAce')
  const prevHostPid=host?.dataset.patientId||''
  const prevFormState=(typeof collectAceFormState==='function')?collectAceFormState():null
  currentAcePatientId=id;selectedPatientId=id
  if(host)host.dataset.patientId=id
  if(pg)pg.dataset.patientId=id
  document.getElementById('ptName').value=naturalPatientName(p)
  document.getElementById('ptMRN').value=p.demographics?.mrn||''
  document.getElementById('ptDOB').value=p.demographics?.dob||''
  document.getElementById('ptGender').value=p.demographics?.gender||''
  document.getElementById('doi').value=p.demographics?.doi||''
  hydrateAceFormFromSavedPatientAce(p)
  // Run all computed-value updates that buildPDF depends on
  if(typeof updateAceTotals==='function')updateAceTotals()
  if(typeof updateBanner==='function')updateBanner()
  if(typeof updateBoilerplates==='function')updateBoilerplates()
  if(typeof toggleFollowupFields==='function')toggleFollowupFields()
  loadJsPDF(()=>{
    setTimeout(()=>{
      const name=document.getElementById('ptName').value.trim()
      if(name&&kind==='word'){
        // Recorded now, while the form holds this patient; written after the form is put back.
        const record=[]
        try{
          buildPDF(name,{returnDoc:true,record:record})
          const fname='CTG_ACE_'+name.replace(/\s+/g,'_')+'_'+(gv('dos').replace(/\//g,'-'))+'.docx'
          ctgDay1Docx.download(record,fname).then(()=>{ctgAuditExport(id,'day1_word');showToast('Word document downloaded ✓')},e=>{showToast('Word error: '+e.message,'err');console.error('Day 1 Word error',e)})
        }catch(e){showToast('Word error: '+e.message,'err');console.error('Day 1 Word error',e)}
      }else if(name){
        try{buildPDF(name);showToast('PDF downloaded ✓')}
        catch(e){showToast('PDF error: '+e.message,'err');console.error('buildPDF error',e)}
      }else showToast('Could not generate PDF — patient name missing','err')
      currentAcePatientId=prevPatientId
      if(host){if(prevHostPid)host.dataset.patientId=prevHostPid;else delete host.dataset.patientId}
      if(pg){if(prevHostPid)pg.dataset.patientId=prevHostPid;else delete pg.dataset.patientId}
      // Put the form back the way it was - see prevFormState above. The id and
      // the form contents have to be restored together or they describe two
      // different patients.
      if(prevFormState&&typeof applyAceFormState==='function')applyAceFormState(prevFormState)
    },350)
  })
}
// Build the ACE PDF for a patient headlessly (for inclusion in the FCR).
// Populates the live ACE form from the patient's saved record, generates the
// doc, then restores the form's patient context. Resolves with the jsPDF doc,
// or null if the patient has no saved ACE.
function buildAceDocForPatient(p){
  return new Promise(resolve=>{
    if(!p||!p.ace){resolve(null);return}
    const prevPatientId=currentAcePatientId
    const host=document.getElementById('aceFormHost')
    const pg=document.getElementById('page-patientAce')
    const prevHostPid=host?.dataset.patientId||''
    const prevPagePid=pg?.dataset.patientId||''
    // Same swap, same hazard, same fix as downloadAceForPatient - see the note
    // there. This one runs during FCR generation, where the form on screen
    // belongs to whoever the user actually had open.
    const prevFormState=(typeof collectAceFormState==='function')?collectAceFormState():null
    currentAcePatientId=p.id;selectedPatientId=p.id
    if(host)host.dataset.patientId=p.id
    if(pg)pg.dataset.patientId=p.id
    const setVal=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v}
    setVal('ptName',naturalPatientName(p))
    setVal('ptMRN',p.demographics?.mrn||'')
    setVal('ptDOB',p.demographics?.dob||'')
    setVal('ptGender',p.demographics?.gender||'')
    setVal('doi',p.demographics?.doi||'')
    hydrateAceFormFromSavedPatientAce(p)
    if(typeof updateAceTotals==='function')updateAceTotals()
    if(typeof updateBanner==='function')updateBanner()
    if(typeof updateBoilerplates==='function')updateBoilerplates()
    if(typeof toggleFollowupFields==='function')toggleFollowupFields()
    loadJsPDF(()=>{
      setTimeout(()=>{
        let doc=null
        const name=(document.getElementById('ptName')?.value||'').trim()
        // Recorded as it is drawn, as for the Day 1 Word download: the FCR's Word copy writes its Day 1 from this.
        const record=[]
        if(name){try{doc=buildPDF(name,{returnDoc:true,record:record});if(doc)doc.ctgRecord=record}catch(e){console.error('FCR ACE build error',e)}}
        currentAcePatientId=prevPatientId
        if(host){if(prevHostPid)host.dataset.patientId=prevHostPid;else delete host.dataset.patientId}
        if(pg){if(prevPagePid)pg.dataset.patientId=prevPagePid;else delete pg.dataset.patientId}
        if(prevFormState&&typeof applyAceFormState==='function')applyAceFormState(prevFormState)
        resolve(doc)
      },350)
    })
  })
}
// "View" action for the ACE row on the Documents tab - builds the PDF fresh
// from the saved ACE record (same generator the FCR uses) and opens it in the
// existing PDF preview modal, rather than downloading a file to disk.
function patientFormIntakeData(p){
  // The generators read intake.demographics/pip/attorney without guarding, and
  // a patient who only completed Demographics has no pip/attorney at all.
  const i=(p&&p.intake)||{}
  return Object.assign({demographics:{},pip:{},attorney:{},consent:{},minorAuth:{}},i)
}
function patientFormDocuments(p){
  const intake=p&&p.intake
  if(!intake)return []
  // Only list forms once something has actually been signed or submitted -
  // otherwise every patient's FCR would carry a set of blank agreements.
  const sub=intake.formSubmission
  const submittedForms=(sub&&Array.isArray(sub.forms))?sub.forms:null
  const signed=!!(sub||(intake.consent&&intake.consent.signedAt)||(intake.minorAuth&&intake.minorAuth.signedAt))
  if(!signed)return []
  const included=k=>!submittedForms||submittedForms.indexOf(k)>=0
  const out=[]
  if(typeof intakeGeneratePdfBlob==='function')
    out.push({key:'intake',label:'Intake Form',file:'Intake Form.pdf',gen:intakeGeneratePdfBlob})
  // The AoB agreements are the documents shown and consented to on the Intake
  // Form step, so they follow that step rather than standing on their own.
  if(included('intakeForm')){
    if(typeof intakeGenerateAobShortBlob==='function')
      out.push({key:'aobShort',label:'Assignment of Benefits (Short)',file:'Assignment of Benefits (Short).pdf',gen:intakeGenerateAobShortBlob})
    if(typeof intakeGenerateAobLongBlob==='function')
      out.push({key:'aobLong',label:'Assignment of Benefits (Long)',file:'Assignment of Benefits (Long).pdf',gen:intakeGenerateAobLongBlob})
  }
  const wantsMinor=submittedForms?included('minorAuth'):!!(intake.minorAuth&&intake.minorAuth.signedAt)
  if(wantsMinor&&typeof intakeGenerateMinorAuthBlob==='function')
    out.push({key:'minorAuth',label:'Authorization to Treat Minor',file:'Authorization to Treat Minor.pdf',gen:intakeGenerateMinorAuthBlob})
  return out
}
function patientFormSubmittedLabel(p){
  const at=((p&&p.intake&&p.intake.formSubmission)||{}).submittedAt
  if(!at)return 'Signed intake documents'
  const d=new Date(at)
  return isNaN(d.getTime())?'Submitted by the patient':('Submitted by the patient '+d.toLocaleDateString())
}
function viewPatientFormDocument(pid,key){
  const p=getPatient(pid)
  if(!p){showToast('Patient not found','err');return}
  const entry=patientFormDocuments(p).filter(d=>d.key===key)[0]
  if(!entry){showToast('That form is not available for this patient','err');return}
  showToast('Opening '+entry.label+'…')
  Promise.resolve(entry.gen(p,patientFormIntakeData(p))).then(blob=>{
    if(!blob){showToast('Could not generate '+entry.label,'err');return}
    _showPdfModal(URL.createObjectURL(blob),entry.label)
    ctgAuditExport(pid,'intake_pdf','preview')
  }).catch(e=>{console.error(e);showToast(entry.label+' error: '+e.message,'err')})
}
function viewSavedAceDocument(pid){
  const p=getPatient(pid)
  if(!p||!p.ace){showToast('No saved Day 1 found for this patient','err');return}
  showToast('Opening Day 1 PDF…')
  buildAceDocForPatient(p).then(doc=>{
    if(!doc){showToast('Could not generate the Day 1 PDF','err');return}
    _showPdfModal(doc.output('bloburl'),'Day 1')
    ctgAuditExport(pid,'day1_pdf','preview')
  }).catch(e=>{console.error(e);showToast('Day 1 PDF error: '+e.message,'err')})
}
function updateAceSavePanel(){
  const panel=document.getElementById('aceSavePanel'); if(!panel)return
  const pagePatientId=document.getElementById('page-patientAce')?.dataset.patientId||''
  const hostPatientId=document.getElementById('aceFormHost')?.dataset.patientId||''
  const p=getPatient(currentAcePatientId)||getPatient(pagePatientId)||getPatient(hostPatientId)
  panel.classList.toggle('show',!!p)
  if(p){document.getElementById('aceSaveTitle').textContent='Save Day 1 for '+naturalPatientName(p)}
  updatePatientAceBar()
}
function updatePatientAceBar(){
  const pagePatientId=document.getElementById('page-patientAce')?.dataset.patientId||''
  const hostPatientId=document.getElementById('aceFormHost')?.dataset.patientId||''
  const p=getPatient(currentAcePatientId)||getPatient(pagePatientId)||getPatient(hostPatientId)
  const n=document.getElementById('patientAceBarName')
  const scoreEl=document.getElementById('patientAceBarScore')
  if(n)n.textContent=p?naturalPatientName(p):'—'
  if(scoreEl)scoreEl.textContent=(document.getElementById('scoreTotalBig')?.textContent||'0')+'/22'
}
function isAceComplete(aceData){
  if(!aceData||!aceData.formState)return false
  const s=aceData.formState
  const inp=s.inputs||{}, sel=s.selects||{}, yn=s.yn||{}, sym=s.symptoms||{}
  const skipVehicle=(s.itSelected||'')==='No Vehicle Involved'
  const vehicleHidden=(id)=>skipVehicle&&ACE_NO_VEHICLE_HIDDEN_IDS.has(id)
  for(const f of ACE_REQUIRED_INPUTS){if(vehicleHidden(f.id))continue;if(!(inp[f.id]||'').trim())return false}
  for(const f of ACE_REQUIRED_SELECTS){if(vehicleHidden(f.id))continue;if(!(sel[f.id]||''))return false}
  if(window.ctgMoiAnswered&&!window.ctgMoiAnswered(s))return false
  // Swapped in for the vehicle grid - see ACE_NO_VEHICLE_REQUIRED_INPUTS.
  if(skipVehicle)for(const f of ACE_NO_VEHICLE_REQUIRED_INPUTS){if(!(inp[f.id]||'').trim())return false}
  const hpi=yn.hpiList||[]
  if(hpi.some(v=>!v))return false
  const pmhRows=document.querySelectorAll('#pmhList .yn-row')
  const pmhSkipIndices=new Set()
  pmhRows.forEach((r,i)=>{if(!r.querySelector('.yn-btn')||r.querySelector('select')||r.classList.contains('yn-row-gated'))pmhSkipIndices.add(i)})
  const pmh=(yn.pmhList||[]).filter((_,i)=>!pmhSkipIndices.has(i))
  if(pmh.some(v=>!v))return false
  const aceGroups=['acePhysical','aceCognitive','aceSleep','aceEmotional']
  for(const g of aceGroups){const arr=sym[g]||[];if(arr.some(v=>v===''||v===undefined))return false}
  return true
}

function collectAceDataForPatient(){
  const dxCodes=[...document.querySelectorAll('#icdGrid .icd-item.checked')].map(el=>'('+el.querySelector('.icd-code').textContent+') '+el.querySelector('.icd-desc').textContent)
  const positive=[]
  ;[['acePhysical',ACE_PHYSICAL],['aceCognitive',ACE_COGNITIVE],['aceSleep',ACE_SLEEP],['aceEmotional',ACE_EMOTIONAL]].forEach(([id,labels])=>{
    document.querySelectorAll('#'+id+' .sym-score-item').forEach((item,i)=>{if(item.querySelector('.sym-btn.active[data-val="1"]'))positive.push(labels[i])})
  })
  return {
    savedAt:new Date().toISOString(),
    patientName:gv('ptName'),
    dateOfService:gv('dos'),
    dateOfInjury:gv('doi'),
    medicalRecordNo:gv('ptMRN'),
    aceScore:document.getElementById('scoreTotalBig').textContent,
    physicalScore:document.getElementById('scorePhys').textContent,
    cognitiveScore:document.getElementById('scoreCog').textContent,
    sleepScore:document.getElementById('scoreSleep').textContent,
    emotionalScore:document.getElementById('scoreEmot').textContent,
    diagnosisCodes:dxCodes,
    positiveSymptoms:positive,
    redFlagStatus:go('redFlagStatus'),
    recommendation:go('recommendation'),
    formState:collectAceFormState()
  }
}

function getActiveAcePatientId(){
  const patientAcePage=document.getElementById('page-patientAce')
  const isPatientAceOpen=patientAcePage&&patientAcePage.classList.contains('active')
  if(currentAcePatientId&&getPatient(currentAcePatientId))return currentAcePatientId
  const pagePatientId=patientAcePage?.dataset.patientId||''
  if(isPatientAceOpen&&pagePatientId&&getPatient(pagePatientId)){currentAcePatientId=pagePatientId;return pagePatientId}
  const hostPatientId=document.getElementById('aceFormHost')?.dataset.patientId||''
  if(isPatientAceOpen&&hostPatientId&&getPatient(hostPatientId)){currentAcePatientId=hostPatientId;return hostPatientId}
  if(isPatientAceOpen&&selectedPatientId&&getPatient(selectedPatientId)){currentAcePatientId=selectedPatientId;return selectedPatientId}
  return null
}
function ensureAceBillingLock(p){
  if(!p)return
  if(!p.billingLocks)p.billingLocks={}
  if(!p.billingLocks.ace){
    const dos=getDay2AceDateOfService(p)||day2FormatAnyDate(p.ace?.dateOfService)||day2FormatAnyDate(p.ace?.savedAt)||formatDay2Date(new Date())
    p.billingLocks.ace={date:dos||'',createdAt:new Date().toISOString()}
  }
}
function clearAceBillingLock(p){
  if(p&&p.billingLocks&&p.billingLocks.ace)delete p.billingLocks.ace
}
let _aceAutosaveTimer=null
let _aceAutosaveLast=''
function aceAutosaveTick(){
  try{
    const id=getActiveAcePatientId()
    const p=id&&getPatient(id)
    if(!p)return
    /* A signed Day 1 is a closed record: it changes only through Sign & Lock,
       which files an amendment. The form carries no signature, so writing it
       here replaced a signed p.ace with an unsigned copy - the server kept the
       signed one, and every edit made after that was silently discarded. */
    if(p.ace&&p.ace.signedAt)return
    const data=collectAceDataForPatient()
    if(!data)return
    // savedAt changes every call, so compare everything else to avoid a
    // pointless write (and a pointless realtime broadcast) every 15s.
    const cmp=JSON.stringify(Object.assign({},data,{savedAt:''}))
    if(cmp===_aceAutosaveLast)return
    _aceAutosaveLast=cmp
    p.ace=data
    aceMarkClean()   // the record now matches the form
    p.pendingAce=false
    // The same identity fields the explicit save writes back. Without this an
    // edit left to the autosave reaches the ACE and never reaches the chart.
    syncAceDemographicsToPatient(p)
    p.updatedAt=new Date().toISOString()
    persistPatients()
    updateAceSavePanel&&updateAceSavePanel()
  }catch(e){console.error('Day 1 autosave failed',e)}
}
function aceFlushUnsavedForm(){
  const id=_aceDirtyFor
  if(!id||currentAcePatientId!==id||!getPatient(id))return
  const host=document.getElementById('aceFormHost')
  if(!host||host.dataset.patientId!==id)return
  aceAutosaveTick()
}
function startAceAutosave(){
  stopAceAutosave()
  _aceAutosaveLast=''
  if(!_aceDirtyFor){
    try{ const d=collectAceDataForPatient(); if(d)_aceAutosaveLast=JSON.stringify(Object.assign({},d,{savedAt:''})) }catch(e){}
  }
  _aceAutosaveTimer=setInterval(aceAutosaveTick,15000)
}
function stopAceAutosave(){
  if(_aceAutosaveTimer){clearInterval(_aceAutosaveTimer);_aceAutosaveTimer=null}
}
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_aceAutosaveTimer)aceAutosaveTick()})
window.addEventListener('pagehide',()=>{if(_aceAutosaveTimer)aceAutosaveTick()})

function syncAceDemographicsToPatient(p){
  if(!p)return
  if(!p.demographics)p.demographics={}
  if(gv('ptMRN')!=='—')p.demographics.mrn=gv('ptMRN')
  if(gv('ptDOB')!=='—')p.demographics.dob=gv('ptDOB')
  if(gv('ptGender')!=='—')p.demographics.gender=gv('ptGender')
  if(gv('doi')!=='—')p.demographics.doi=gv('doi')
}

function saveAceForCurrentPatient(forceComplete){
  const activeAcePatientId=getActiveAcePatientId()
  const p=getPatient(activeAcePatientId)
  if(!p){showToast('Please open a patient-specific Day 1 form first','err');return}
  p.ace=collectAceDataForPatient()
  aceMarkClean()   // the record now matches the form
  // "Save as Complete" forces the record into Completed Day 1 even with fields still blank;
  // the blanks stay flagged on the form but progress is preserved as-is.
  p.aceComplete=forceComplete?true:isAceComplete(p.ace)
  ensureAceBillingLock(p)
  p.pendingAce=false
  syncAceDemographicsToPatient(p)
  p.updatedAt=new Date().toISOString()
  selectedPatientId=p.id
  currentAcePatientId=null
  const host=document.getElementById('aceFormHost'); if(host)delete host.dataset.patientId
  const page=document.getElementById('page-patientAce'); if(page)delete page.dataset.patientId
  stopAceAutosave()
  persistPatients();renderPatientWorkflow();updateAceSavePanel()
  clearDraft()
  showToast('Day 1 saved to patient record ✓')
  showPage(p.aceComplete?'completedAce':'incompleteAce')
}

function _doSaveAceOnly(btn,forceComplete){
  const name=document.getElementById('ptName').value.trim()
  if(!name){showToast('Please enter patient name first','err');return}
  const orig=btn?btn.innerHTML:''
  if(btn){btn.innerHTML='<span class="spinner"></span>Saving...';btn.disabled=true}
  setTimeout(()=>{
    try{saveAceForCurrentPatient(forceComplete)}
    catch(e){showToast('Save error: '+e.message,'err');console.error(e)}
    finally{if(btn){btn.innerHTML=orig;btn.disabled=false}}
  },50)
}
/* One Save button. 'Save as Complete' differed in one case only, forcing a
   record into Completed Day 1 with required fields still blank, so that
   override moved to the missing-fields modal, which is the only moment the
   question can arise. Nothing else about saving changed. */
function saveAndDownloadAce(btn,forceComplete){
  const name=document.getElementById('ptName').value.trim()
  if(!name){showToast('Please enter patient name first','err');return}
  showValidationModal(
    (force)=>_doSaveAceOnly(btn, force===undefined ? !!forceComplete : !!force),
    {completeMode:!!forceComplete}
  )
}

// ── AUTO-SAVE DRAFT ──
const DRAFT_KEY='ctg_ace_draft'
let _draftDebounce=null
let _lastSection='sec-header'

let _draftRestore='done'
try{ if(localStorage.getItem(DRAFT_KEY))_draftRestore='pending' }catch(e){}

function _writeDraftToStorage(){
  if(_draftRestore!=='done')return null
  /* Nothing on a signed record can be recovered from a draft (restoreDraft
     discards it), so do not keep one. Writing it anyway is what made a signed
     Day 1 come back as "unsaved work" after a reload. */
  const formPatient=getPatient(currentAcePatientId||getActiveAcePatientId())
  if(formPatient&&formPatient.ace&&formPatient.ace.signedAt)return null
  const state=collectAceFormState()
  const draft={savedAt:new Date().toISOString(),patientName:document.getElementById('ptName')?.value.trim()||'',patientId:currentAcePatientId||null,accountId:ctgCurrentUserId()||null,lastSection:_lastSection,formState:state}
  localStorage.setItem(DRAFT_KEY,JSON.stringify(draft))
  return draft
}
function autosaveDraft(){
  try{
    if(!_writeDraftToStorage())return   // nothing written: do not claim it was
    /* Say plainly that the work is held on this device but not yet in the
       record. "Auto-saved" alone read as "saved", which is the assurance that
       made a later loss so surprising. */
    showDraftStatus('Unsaved — held on this device '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))
    updateProgressUI()
  }catch(e){console.warn('Autosave error',e)}
}
let _aceDirtyFor=''
function aceMarkDirty(){ _aceDirtyFor=getActiveAcePatientId()||currentAcePatientId||selectedPatientId||'' }
function aceMarkClean(){ _aceDirtyFor='' }

function scheduleDraftSave(e){
  _draftRestore='done'   // real typing: from here on it is this form that needs keeping
  aceMarkDirty()
  const sec=e?.target?.closest?.('[id^="sec-"]')
  if(sec)_lastSection=sec.id
  const t=e?.target
  if(t&&(t.tagName==='INPUT'||t.tagName==='SELECT')&&t.value){
    clearIncompleteHighlight(t)
  }
  clearTimeout(_draftDebounce)
  // change/click = complete action (dropdown select, button press) -> save immediately
  // input = still typing -> short 300ms debounce
  if(e?.type==='change'||e?.type==='click'){
    autosaveDraft()
  }else{
    _draftDebounce=setTimeout(autosaveDraft,300)
  }
  updateProgressUI()
}
function showDraftStatus(msg){
  ;['draftStatus','draftStatus2'].forEach(id=>{
    const el=document.getElementById(id)
    if(!el)return
    el.textContent=msg?(' · '+msg):''
    el.style.opacity='1'
    if(msg)setTimeout(()=>{el.style.opacity='.5'},3500)
  })
}
function clearDraft(){
  localStorage.removeItem(DRAFT_KEY)
  showDraftStatus('')
}
function aceLastSavedLabel(rec){
  const stamp=iso=>{const d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
  const p=getPatient(currentAcePatientId)
    ||getPatient(document.getElementById('page-patientAce')?.dataset.patientId||'')
    ||getPatient(document.getElementById('aceFormHost')?.dataset.patientId||'')
  const ace=rec||(p&&p.ace)
  if(ace&&ace.signedAt){const s=stamp(ace.signedAt);return s?'Signed: '+s:''}
  try{
    const raw=localStorage.getItem(DRAFT_KEY)
    if(raw){
      const d=JSON.parse(raw)
      if((d.patientId||null)===((p&&p.id)||null)){const s=stamp(d.savedAt);if(s)return 'Last saved: '+s}
    }
  }catch(e){}
  if(ace&&ace.savedAt){const s=stamp(ace.savedAt);if(s)return 'Last saved: '+s}
  return ''
}
function restoreDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return 'none'
    const draft=JSON.parse(raw);if(!draft||!draft.formState)return 'none'
    /* Written under another account on this device: not this person's work,
       and not theirs to see. Left in place rather than deleted, because it is
       still the only copy of the other person's unsaved typing. Drafts from
       before this field existed carry no account and are judged as before. */
    const me=ctgCurrentUserId()
    if(draft.accountId&&me&&draft.accountId!==me)return 'held'
    // Only navigate to the ACE draft if the user hasn't already left the default page.
    const userStillOnDefaultPage=document.getElementById('page-registration')?.classList.contains('active')
    let p=null
    if(draft.patientId){
      p=getPatient(draft.patientId)
      /* Its patient is not in the list (deleted, or not visible to this
         account). Never paint it unbound. */
      if(!p)return 'held'
      /* SIGNED-RECORD GUARD. A draft can never be newer work on a signed
         Day 1: that record only changes through an amendment. Painting it
         marked the form unsaved, and the next flush unsigned the record in the
         browser. */
      if(p.ace&&p.ace.signedAt){clearDraft();return 'stale'}
      {
        const savedMs=Date.parse((p.ace&&p.ace.savedAt)||'')||0
        const draftMs=Date.parse(draft.savedAt||'')||0
        if(p.ace&&!(draftMs>savedMs)){clearDraft();return 'stale'}
      }
    }
    /* Clear and fill first, bind after. clearAll() drops the patient binding
       whenever the Day 1 page is not the active one - which after sign-in it
       almost never is - so binding first (as this used to) was undone by the
       very next line. */
    clearAll()
    applyAceFormState(draft.formState)
    if(p){
      currentAcePatientId=p.id
      selectedPatientId=p.id
      const host=document.getElementById('aceFormHost')
      const pg=document.getElementById('page-patientAce')
      if(host)host.dataset.patientId=p.id
      if(pg)pg.dataset.patientId=p.id
      /* The form now holds work that is newer than p.ace, which is exactly
         what "dirty" means. Without it, "Resume Day 1" re-hydrates from the
         older record and a background refresh can replace the record under it. */
      _aceDirtyFor=p.id
      noteAceFormVersion(p.id)   // the draft is newer than this version, so it is the right base
    }
    /* Never auto-"Save as Complete" a form nobody has looked at yet: if the
       draft is already at 100%, the person saves it themselves after reviewing.
       Anything still incomplete keeps the normal behaviour when they finish it. */
    try{ _autoCompleteFired=getAceProgress().percent===100 }catch(e){ _autoCompleteFired=true }
    if(p&&userStillOnDefaultPage)showPage('patientAce')
    updateBanner();updateBoilerplates();updateAceSavePanel();updatePatientAceBar()
    setTimeout(()=>{
      updateProgressUI()
      setTimeout(highlightIncompleteFields,300)
      if(draft.lastSection){
        _lastSection=draft.lastSection
        const sec=document.getElementById(draft.lastSection)
        if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'})
      }
    },150)
    showDraftStatus('Draft restored')
    if(p&&!userStillOnDefaultPage)showToast('Recovered unsaved Day 1 work for '+naturalPatientName(p)+' — open their Day 1 to continue')
    return 'restored'
  }catch(e){console.warn('Draft restore error',e);return 'held'}
}
/* Called by loadPatientStore() after every SUCCESSFUL load; acts once. A failed
   load leaves it pending, because an empty list would make every patient look
   missing. */
function restoreDraftWhenReady(){
  if(_draftRestore!=='pending')return
  const outcome=restoreDraft()
  _draftRestore=(outcome==='held')?'held':'done'
}
function initAutosave(){
  const host=document.getElementById('aceFormHost');if(!host)return
  host.addEventListener('input',scheduleDraftSave)
  host.addEventListener('change',scheduleDraftSave)
  host.addEventListener('click',e=>{
    const t=e.target
    if(t.classList.contains('yn-btn')||t.classList.contains('sym-btn')||t.closest('.icd-item')||t.closest('.rchk')){
      clearIncompleteHighlight(t)
      scheduleDraftSave(e)
    }
  })
  setInterval(autosaveDraft,10000)
  const _emergencySave=()=>{clearTimeout(_draftDebounce);try{_writeDraftToStorage()}catch(e){}}
  window.addEventListener('beforeunload',_emergencySave)
  window.addEventListener('pagehide',_emergencySave)
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')_emergencySave()})
  updateProgressUI()
}
/* The draft restore is not on this timer any more - see restoreDraftWhenReady. */
setTimeout(initAutosave,400)

// ── LOCATION OF IMPACT (multi-select) ──
// Backed by the hidden text input #ace_loc, whose value is a comma-joined list
// so the existing .value-based save/restore/validation keeps working unchanged.
const ACE_LOC_OPTIONS=['Frontal','Left Temporal','Right Temporal','Left Parietal','Right Parietal','Occipital','Neck','Indirect Force']
// Choices typed in with Type Here / Add (13 Oct 2026) are kept only in #ace_loc
// itself, so they save, restore and print like the built-in ones. One unticked
// while the list is open stays in it until the list closes.
let aceLocTyped=[]
function aceLocSelectedList(){
  const v=(document.getElementById('ace_loc')?.value||'').trim()
  return v?v.split(',').map(s=>s.trim()).filter(Boolean):[]
}
function aceLocAllOptions(){
  const all=ACE_LOC_OPTIONS.slice()
  aceLocSelectedList().concat(aceLocTyped).forEach(v=>{if(!all.some(o=>o.toLowerCase()===v.toLowerCase()))all.push(v)})
  return all
}
function aceLocSetValue(next){
  const hidden=document.getElementById('ace_loc');if(!hidden)return
  hidden.value=aceLocAllOptions().filter(o=>next.includes(o)).join(', ') // keep the list's order
  aceLocSyncFromValue()
  hidden.dispatchEvent(new Event('input',{bubbles:true}))
  hidden.dispatchEvent(new Event('change',{bubbles:true}))
  const disp=document.getElementById('aceLocDisplay')
  if(disp&&typeof clearIncompleteHighlight==='function'&&next.length)clearIncompleteHighlight(disp)
}
// The Type Here / Add / Select All row at the top of the list, built once.
function aceLocEnsureAddRow(){
  const panel=document.getElementById('aceLocPanel'),list=document.getElementById('aceLocList')
  if(!panel||!list||panel.querySelector('.ace-loc-add'))return
  const row=document.createElement('div');row.className='ace-loc-add'
  const inp=document.createElement('input');inp.type='text';inp.placeholder='Type Here';inp.maxLength=200
  const add=document.createElement('button');add.type='button';add.textContent='Add'
  const all=document.createElement('button');all.type='button';all.textContent='Select All'
  const doAdd=()=>{
    // A comma would split the saved list, so "Vertex, Chin" adds two choices.
    const typed=inp.value.split(',').map(s=>s.replace(/\s+/g,' ').trim().slice(0,120)).filter(Boolean)
    if(!typed.length)return
    const next=aceLocSelectedList()
    typed.forEach(t=>{
      const hit=aceLocAllOptions().find(o=>o.toLowerCase()===t.toLowerCase())||t
      if(!ACE_LOC_OPTIONS.includes(hit)&&!aceLocTyped.includes(hit))aceLocTyped.push(hit)
      if(!next.includes(hit))next.push(hit)
    })
    inp.value=''
    aceLocSetValue(next)
    inp.focus()
  }
  add.addEventListener('click',doAdd)
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doAdd()}})
  all.addEventListener('click',()=>{
    const opts=aceLocAllOptions()
    aceLocSetValue(aceLocSelectedList().length===opts.length?[]:opts)
  })
  row.append(inp,add,all)
  panel.insertBefore(row,list)
}
function aceLocRenderList(){
  const list=document.getElementById('aceLocList');if(!list)return
  const sel=new Set(aceLocSelectedList())
  list.innerHTML=aceLocAllOptions().map((opt,i)=>{
    const on=sel.has(opt)
    return '<label class="ace-loc-opt'+(on?' checked':'')+'"><input type="checkbox"'+(on?' checked':'')+' data-onchange="aceLocToggleOption('+i+',this.checked)"><span>'+escHtml(opt)+'</span></label>'
  }).join('')
}
function aceLocSyncFromValue(){
  const arr=aceLocSelectedList()
  const txt=document.getElementById('aceLocText')
  if(txt){
    if(arr.length){txt.textContent=arr.join(', ');txt.style.color='var(--text)'}
    else{txt.textContent='— Select —';txt.style.color='var(--muted)'}
  }
  aceLocRenderList()
}
function aceLocToggleOption(idx,on){
  const opt=aceLocAllOptions()[idx];if(opt==null)return
  let next=aceLocSelectedList()
  if(on){if(!next.includes(opt))next.push(opt)}
  else{
    next=next.filter(x=>x!==opt)
    if(!ACE_LOC_OPTIONS.includes(opt)&&!aceLocTyped.includes(opt))aceLocTyped.push(opt)
  }
  aceLocSetValue(next)
}
function aceLocToggle(e){
  if(e)e.stopPropagation()
  const panel=document.getElementById('aceLocPanel'),disp=document.getElementById('aceLocDisplay')
  if(!panel||!disp)return
  if(panel.style.display!=='none'){panel.style.display='none';return}
  aceLocTyped=[] // a typed choice left unticked last time is gone
  aceLocEnsureAddRow()
  // Re-parent to body so position:fixed resolves against the viewport (the ACE
  // cards use backdrop-filter/transform, which would otherwise trap the panel).
  if(panel.parentNode!==document.body)document.body.appendChild(panel)
  aceLocRenderList()
  const r=disp.getBoundingClientRect()
  panel.style.display='block'
  panel.style.width=Math.max(r.width,320)+'px'
  panel.style.left=r.left+'px'
  const spaceBelow=window.innerHeight-r.bottom
  if(spaceBelow>=240){panel.style.top=(r.bottom+4)+'px';panel.style.bottom=''}
  else{panel.style.bottom=(window.innerHeight-r.top+4)+'px';panel.style.top=''}
}
document.addEventListener('click',e=>{
  const panel=document.getElementById('aceLocPanel')
  if(!panel||panel.style.display==='none')return
  const inWrap=document.getElementById('aceLocWrap')?.contains(e.target)
  const inPanel=panel.contains(e.target)
  if(!inWrap&&!inPanel)panel.style.display='none'
})

// ── PROGRESS & VALIDATION ──
const ACE_REQUIRED_INPUTS=[
  {id:'ptName',label:'Patient Full Name',section:'sec-header'},
  {id:'dos',label:'Date of Service (DOS)',section:'sec-header'},
  {id:'doi',label:'Date of Injury (DOI)',section:'sec-header'},
  {id:'completedBy',label:'Completed By',section:'sec-plan'},
  {id:'ace_retro_dur',label:'Retrograde Amnesia Duration',section:'sec-ace'},
  {id:'ace_antero_dur',label:'Anterograde Amnesia Duration',section:'sec-ace'},
  {id:'ace_loc',label:'Location of Impact',section:'sec-ace'},
  {id:'jobDuties',label:'Job Duties',section:'sec-pmh'},
]
const ACE_REQUIRED_SELECTS=[
  // Patient & Session Info
  {id:'ptGender',label:'Patient Gender',section:'sec-header'},
  {id:'reporter',label:'Reporter (History Provided By)',section:'sec-header'},
  {id:'injuryType',label:'Injury Event Type',section:'sec-header'},
  {id:'jurisdiction',label:'Location / Jurisdiction',section:'sec-header'},
  // Mechanism of Injury. The vehicle/ED questions became the MOI story
  // (day1-moi.js); 'at least one choice made in the story' is checked by
  // window.ctgMoiAnswered in isAceComplete / getAceProgress below.
  {id:'dhi1',label:'DHI 1 — Direct Head Impact Description',section:'sec-moi'},
  {id:'ihi1',label:'IHI 1 — Indirect Head Impact Description',section:'sec-moi'},
  // HPI
  {id:'employStatus',label:'Employment Status',section:'sec-hpi'},
  {id:'adlLimit',label:'ADL Limitations',section:'sec-hpi'},
  {id:'rpr_priorConc',label:'Did You Ever Have a Concussion Before This Injury?',section:'sec-hpi'},
  {id:'rpr_concNum',label:'Number of Previous Concussions',section:'sec-hpi'},
  {id:'rpr_concDur',label:'Longest Prior Symptom Duration',section:'sec-hpi'},
  {id:'rpr_reinjury',label:'If Multiple Concussions, Less Force Caused Reinjury?',section:'sec-hpi'},
  {id:'rpr_priorHA',label:'Did You Have Headaches Before This Injury?',section:'sec-hpi'},
  {id:'rpr_haTx',label:'Have You Received Treatment for Headaches Before?',section:'sec-hpi'},
  {id:'rpr_migraine',label:'History of Migraine Headache?',section:'sec-hpi'},
  {id:'rpr_learningDis',label:'Any Learning Disability?',section:'sec-hpi'},
  {id:'rpr_adhd',label:'Any History of ADHD?',section:'sec-hpi'},
  {id:'rpr_otherDevYN',label:'Any Other Developmental Conditions History?',section:'sec-hpi'},
  {id:'rpr_anxiety',label:'Any History of Anxiety?',section:'sec-hpi'},
  {id:'rpr_depression',label:'Any History of Depression?',section:'sec-hpi'},
  {id:'rpr_sleepDisorder',label:'Any Sleep Disorder Before This Injury?',section:'sec-hpi'},
  {id:'rpr_otherPsychYN',label:'Any Other Psychiatric Conditions Before This Injury?',section:'sec-hpi'},
  {id:'assessCollisionType',label:'Assessment — Collision Impact Type',section:'sec-hpi'},
  // PMH / Social History
  {id:'languageField',label:'Language',section:'sec-pmh'},
  {id:'diet',label:'Diet & Nutrition',section:'sec-pmh'},
  {id:'exercise',label:'Exercise Habits',section:'sec-pmh'},
  // ACE - Injury Characteristics
  {id:'ace_blow',label:'Evidence of Forcible Blow to Head?',section:'sec-ace'},
  {id:'ace_icf',label:'Evidence of Intracranial Injury / Skull Fracture?',section:'sec-ace'},
  {id:'ace_retro',label:'Amnesia Before Injury (Retrograde)?',section:'sec-ace'},
  {id:'ace_antero',label:'Amnesia After Injury (Anterograde)?',section:'sec-ace'},
  {id:'ace_loc2',label:'Loss of Consciousness?',section:'sec-ace'},
  {id:'ace_seiz',label:'Seizures Observed?',section:'sec-ace'},
  // ACE - Exertion & Overall Rating
  {id:'ace_physact',label:'Symptoms Worse with Physical Activity?',section:'sec-ace'},
  {id:'ace_cogact',label:'Symptoms Worse with Cognitive Activity?',section:'sec-ace'},
  {id:'ace_rating',label:'Overall Behavioral Change Rating (0–6)',section:'sec-ace'},
  // ACE - Red Flags & Plan
  {id:'redFlagStatus',label:'Red Flag Screening',section:'sec-ace'},
  {id:'followupPlan',label:'Follow-Up Plan',section:'sec-plan'},
  {id:'recommendation',label:'Recommendation',section:'sec-plan'},
  {id:'completedByCred',label:'Credentials',section:'sec-plan'},
]
const SECTION_LABELS={'sec-header':'Patient & Session Info','sec-moi':'Mechanism of Injury','sec-hpi':'History of Present Illness','sec-pmh':'Past Medical History','sec-ace':'Day 1 Score','sec-dx':'Diagnosis','sec-plan':'Assessment & Plan'}
let _lastMissingFields=[]
let _autoCompleteFired=false

const ACE_NO_VEHICLE_HIDDEN_IDS=new Set(['ptRole','unit1Type','unit2Type','unit3Type',
  'strikeDir','strikeDir2','strikeDir3','vehicleDirection','trafficType',
  'dhi1','ihi1','erVisit','hospitalAdmitted'])

// Empty: the no-vehicle free text became the MOI story's non-vehicle version.
const ACE_NO_VEHICLE_REQUIRED_INPUTS=[]

/* itSelected is saved with the record and restored explicitly (see
   restoreInjuryTypeValueFromState), so this still reads correctly after a
   reload - the #injuryType select cannot be used here, because for this option
   it holds the free-text description rather than the picker's own value. */
function aceNoVehicleSelected(){
  return (typeof itSelected!=='undefined')&&itSelected==='No Vehicle Involved'
}
function getAceProgress(){
  let filled=0,total=0
  const missing=[]
  const skipVehicle=aceNoVehicleSelected()
  ACE_REQUIRED_INPUTS.forEach(f=>{
    if(skipVehicle&&ACE_NO_VEHICLE_HIDDEN_IDS.has(f.id))return
    total++
    if((document.getElementById(f.id)?.value||'').trim())filled++
    else missing.push({...f,kind:'input'})
  })
  // Swapped in for the vehicle grid - see ACE_NO_VEHICLE_REQUIRED_INPUTS.
  if(skipVehicle)ACE_NO_VEHICLE_REQUIRED_INPUTS.forEach(f=>{
    total++
    if((document.getElementById(f.id)?.value||'').trim())filled++
    else missing.push({...f,kind:'input'})
  })
  ACE_REQUIRED_SELECTS.forEach(f=>{
    if(skipVehicle&&ACE_NO_VEHICLE_HIDDEN_IDS.has(f.id))return
    total++
    if((document.getElementById(f.id)?.value||''))filled++
    else missing.push({...f,kind:'select'})
  })
  if(window.ctgMoiAnswered){
    total++
    if(window.ctgMoiAnswered(null))filled++
    else missing.push({id:'moiStoryEditor',label:'Mechanism of Injury (make at least one choice in the story)',section:'sec-moi',kind:'moi'})
  }
  document.querySelectorAll('#hpiList .yn-row').forEach((row,i)=>{
    total++
    if(row.querySelector('.yn-btn.active'))filled++
    else{
      const label=row.querySelector('.yn-label')?.textContent?.trim()||(typeof HPI_ITEMS!=='undefined'?HPI_ITEMS[i]:null)||'HPI Item '+(i+1)
      missing.push({id:'hpiList_'+i,label,section:'sec-hpi',kind:'yn',rowIndex:i,containerId:'hpiList'})
    }
  })
  document.querySelectorAll('#pmhList .yn-row').forEach((row,domIdx)=>{
    if(!row.querySelector('.yn-btn')||row.querySelector('select'))return
    total++
    if(row.querySelector('.yn-btn.active'))filled++
    else{
      const label=row.querySelector('.yn-label')?.textContent?.trim()||'PMH Item '+(domIdx+1)
      missing.push({id:'pmhList_'+domIdx,label,section:'sec-pmh',kind:'yn',rowIndex:domIdx,containerId:'pmhList'})
    }
  })
  ;[{gid:'acePhysical',items:typeof ACE_PHYSICAL!=='undefined'?ACE_PHYSICAL:[]},
    {gid:'aceCognitive',items:typeof ACE_COGNITIVE!=='undefined'?ACE_COGNITIVE:[]},
    {gid:'aceSleep',items:typeof ACE_SLEEP!=='undefined'?ACE_SLEEP:[]},
    {gid:'aceEmotional',items:typeof ACE_EMOTIONAL!=='undefined'?ACE_EMOTIONAL:[]}
  ].forEach(g=>{
    document.querySelectorAll('#'+g.gid+' .sym-score-item').forEach((item,i)=>{
      total++
      if(item.querySelector('.sym-btn.active'))filled++
      else missing.push({id:g.gid+'_'+i,label:g.items[i]||'Symptom '+(i+1),section:'sec-ace',kind:'sym',groupId:g.gid,itemIndex:i})
    })
  })
  return{filled,total,percent:total>0?Math.round((filled/total)*100):0,missing}
}

function updateProgressUI(){
  const strip=document.getElementById('aceProgressStrip')
  if(strip)strip.style.display='block'
  const{percent,missing}=getAceProgress()
  _lastMissingFields=missing
  const bar=document.getElementById('progressBar')
  if(bar){
    bar.style.width=percent+'%'
    bar.style.background=percent===100?'var(--green)':'linear-gradient(90deg,var(--accent),#0077B6)'
  }
  const pct=document.getElementById('progressPct')
  if(pct){pct.textContent=percent+'%';pct.style.color=percent===100?'var(--green)':percent>=60?'var(--accent)':'var(--amber)'}
  const miss=document.getElementById('progressMissing')
  if(miss){
    if(missing.length===0){
      miss.innerHTML='· All required fields complete ✓'
      miss.style.color='var(--green)'
      miss.style.cursor='default'
      miss.onclick=null
    }else{
      miss.innerHTML='· <span data-cs="'+__cs+'text-decoration:underline;text-underline-offset:2px">'+missing.length+' field'+(missing.length!==1?'s':'')+' remaining</span> &#9662;'
      miss.style.color='var(--amber)'
      miss.style.cursor='pointer'
      miss.onclick=toggleMissingFieldsPopover
    }
  }
  try{
    const ls=document.getElementById('progressLastSaved')
    if(ls)ls.textContent=aceLastSavedLabel()
  }catch(e){}
  if(percent===100&&!_autoCompleteFired&&currentAcePatientId){
    _autoCompleteFired=true
    showToast('All fields complete — saving to Completed Day 1...')
    setTimeout(saveAceForCurrentPatient,1800)
  }
}

function _findYNRow(containerId,label,rowIndex){
  const rows=document.querySelectorAll('#'+containerId+' .yn-row')
  if(label){
    for(const r of rows){if(r.querySelector('.yn-label')?.textContent?.trim()===label)return r}
  }
  return rows[rowIndex]||null
}
function highlightIncompleteFields(){
  document.querySelectorAll('.field-incomplete').forEach(el=>el.classList.remove('field-incomplete'))
  document.querySelectorAll('.label-incomplete').forEach(el=>el.classList.remove('label-incomplete'))
  const{missing}=getAceProgress()
  _lastMissingFields=missing
  missing.forEach(f=>{
    if(f.kind==='input'||f.kind==='select'){
      const el=document.getElementById(f.id)
      if(el){
        const ynRow=el.closest?.('.yn-row')
        if(ynRow){ynRow.classList.add('field-incomplete')}
        else{
          el.classList.add('field-incomplete')
          el.closest?.('.fg')?.querySelector('label')?.classList.add('label-incomplete')
          if(el.style.display==='none'){const vis=el.closest?.('.fg')?.querySelector('.it-display');if(vis)vis.classList.add('field-incomplete')}
        }
      }
    }else if(f.kind==='yn'){
      const row=_findYNRow(f.containerId,f.label,f.rowIndex)
      if(row)row.classList.add('field-incomplete')
    }else if(f.kind==='sym'){
      const item=document.querySelectorAll('#'+f.groupId+' .sym-score-item')[f.itemIndex]
      if(item&&!item.querySelector('.sym-btn.active'))item.classList.add('field-incomplete')
    }
  })
}
function clearIncompleteHighlight(target){
  if(!target)return
  const row=target.closest?.('.yn-row')||target.closest?.('.sym-score-item')
  if(row){row.classList.remove('field-incomplete');row.querySelector?.('label')?.classList.remove('label-incomplete')}
  const fg=target.closest?.('.fg')
  if(fg){fg.querySelector?.('label')?.classList.remove('label-incomplete');const inp=fg.querySelector('input,select');if(inp)inp.classList.remove('field-incomplete');const itd=fg.querySelector('.it-display');if(itd)itd.classList.remove('field-incomplete')}
}

function toggleMissingFieldsPopover(){
  const pop=document.getElementById('missingFieldsPopover')
  if(!pop)return
  if(pop.classList.contains('show')){pop.classList.remove('show');return}
  const{missing}=getAceProgress()
  _lastMissingFields=missing
  if(!missing.length){pop.classList.remove('show');return}
  const groups={}
  missing.forEach((f,i)=>{const k=f.section||'other';if(!groups[k])groups[k]=[];groups[k].push({...f,_fi:i})})
  pop.innerHTML=Object.entries(groups).map(([sec,fields])=>
    `<div class="mfp-section">${escHtml(SECTION_LABELS[sec]||sec)}</div>`+
    fields.map(f=>`<button class="mfp-item" data-onclick="jumpToMissingFieldAt(${f._fi})"><span class="mfp-dot"></span>${escHtml(f.label)}</button>`).join('')
  ).join('')
  pop.classList.add('show')
  setTimeout(()=>{
    const close=e=>{if(!pop.contains(e.target)&&e.target.id!=='progressMissing'&&!e.target.closest('#progressMissing')){pop.classList.remove('show');document.removeEventListener('click',close)}}
    document.addEventListener('click',close)
  },10)
}
function closeMissingFieldsPopover(){
  document.getElementById('missingFieldsPopover')?.classList.remove('show')
}
function jumpToMissingField(f){
  if(!f)return
  closeMissingFieldsPopover()
  const sec=document.getElementById(f.section)
  if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'})
  setTimeout(()=>{
    if(f.kind==='input'||f.kind==='select'){
      const el=document.getElementById(f.id)
      if(el){el.focus();el.classList.add('field-incomplete')}
    }else if(f.kind==='yn'){
      const row=_findYNRow(f.containerId,f.label,f.rowIndex)
      if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('field-incomplete')}
    }else if(f.kind==='sym'){
      const item=document.querySelectorAll('#'+f.groupId+' .sym-score-item')[f.itemIndex]
      if(item){item.scrollIntoView({behavior:'smooth',block:'center'});item.classList.add('field-incomplete')}
    }
  },420)
}

function showValidationModal(onProceed,opts){
  const completeMode=!!(opts&&opts.completeMode)
  const{percent,missing}=getAceProgress()
  _lastMissingFields=missing
  if(missing.length===0){onProceed();return}
  const groups={}
  missing.forEach(f=>{const k=f.section||'other';if(!groups[k])groups[k]=[];groups[k].push(f)})
  const body=document.getElementById('validationModalBody');if(!body)return
  const pColor=percent>=70?'var(--amber)':'var(--red)'
  const subText=completeMode
    ?'These fields are still blank and will stay flagged on the form, but this Day 1 will be saved as Complete with the progress it has.'
    :'Save as Incomplete (stored in Incomplete Day 1) or go back to finish first.'
  body.innerHTML=`<div data-cs="${__cs}display:flex;align-items:center;gap:14px;background:var(--aml);border:1px solid var(--amber);border-radius:8px;padding:12px 14px;margin-bottom:16px">
    <div data-cs="${__cs}font-size:32px;font-weight:700;color:${pColor};font-family:'DM Mono',monospace;line-height:1">${percent}%</div>
    <div><div data-cs="${__cs}font-size:13px;font-weight:600;color:var(--amber)">${missing.length} required field${missing.length!==1?'s':''} still missing</div>
    <div data-cs="${__cs}font-size:11px;color:var(--muted);margin-top:3px">${subText}</div></div>
  </div>${Object.entries(groups).map(([sec,fields])=>`<div data-cs="${__cs}margin-bottom:12px">
    <div data-cs="${__cs}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:5px">${escHtml(SECTION_LABELS[sec]||sec)} <span data-cs="${__cs}color:var(--amber)">(${fields.length})</span></div>
    ${fields.map(f=>`<div data-cs="${__cs}display:flex;align-items:center;gap:8px;padding:5px 9px;background:var(--s2);border-radius:5px;font-size:12px;margin-bottom:3px"><span data-cs="${__cs}width:7px;height:7px;border-radius:50%;background:var(--amber);flex-shrink:0;display:inline-block"></span>${escHtml(f.label)}</div>`).join('')}
  </div>`).join('')}`
  window._validationProceed=onProceed
  const proceedBtn=document.getElementById('validationProceedBtn')
  if(proceedBtn)proceedBtn.textContent=completeMode?'Save as Complete':'Save as Incomplete'
  /* One button, two jobs: in completeMode it IS the save-as-complete action and
     keeps the blue primary; otherwise it saves the note incomplete and wears the
     amber that says "stored, but not finished". */
  if(proceedBtn)proceedBtn.className='btn '+(completeMode?'btn-primary':'btn-warn')
  /* The override is offered here and only here. Hidden in completeMode, where
     the primary button already says "Save as Complete" and a second one saying
     the same thing would just be the old redundancy in a new place. */
  const completeBtn=document.getElementById('validationCompleteBtn')
  if(completeBtn)completeBtn.style.display=completeMode?'none':''
  highlightIncompleteFields()
  document.getElementById('validationModal').classList.add('show')
  document.body.classList.add('modal-open')
}
function closeValidationModal(){
  document.getElementById('validationModal').classList.remove('show')
  document.body.classList.remove('modal-open')
}
function goToFirstMissingField(){
  if(!_lastMissingFields.length)return
  closeValidationModal()
  const f=_lastMissingFields[0]
  const sec=document.getElementById(f.section)
  if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'})
  setTimeout(()=>{
    if(f.kind==='input'||f.kind==='select'){const el=document.getElementById(f.id);if(el)el.focus()}
  },420)
}
function proceedSaveIncomplete(){
  closeValidationModal()
  if(window._validationProceed)window._validationProceed(false)
}
/* "Save as Complete anyway" - files the record under Completed Day 1 with the
   blanks left as they are. They stay flagged on the form. */
function proceedSaveComplete(){
  closeValidationModal()
  if(window._validationProceed)window._validationProceed(true)
}

function saveDay1Ace(btn,forceComplete){
  const pid=getActiveAcePatientId()
  if(pid){saveAndDownloadAce(btn,forceComplete);return}
  if(selectedPatientId){
    currentAcePatientId=selectedPatientId
    saveAndDownloadAce(btn,forceComplete)
    return
  }
  const pts=ctgPatients
  if(pts.length===0){showToast('Register a patient first, then open their Day 1 form to save','err');return}
  showToast('Select a patient from Patient Lists, then open their Day 1 to save','err')
  showPage('patientLists')
}

// ── DATA ──
const HPI_ITEMS=[
  'Change in Swallowing','Change in Appetite','Change in Sense of Smell','Change in Sense of Taste',
  'Stammering Speech','Slurring Speech','Stuttering Speech',
  'Aphasia - comprehension lag time','Aphasia - a word choice lag time',
  'Aphasia - phonation lag time',
  'Cried Since Injury Date','Tinnitus (Ringing in Ears)','Hearing Difficulty',
  'Feeling of Fullness or Pressure in Ear','Visual Discomfort','Visual Disturbance',
  'Dizziness / Vertigo','Head Shake Screening Test — Possible Vestibular Dysfunction',
  'Are you able to stand on two feet unaided?',
  'Do you have full use of your upper body, lower body, and head?',
  'Are there any exercises that this patient cannot do at the moment?'
]
const RISK_FACTORS=['Direct head impact','Second head impact','Previous TBI / concussion','Personal history of military deployment','History of migraines','Anxiety (pre-existing)','Depression (pre-existing)','Sleep disorder','ADHD','Learning disabilities','Age over 40','Repeated concussions']
const PMH_ITEMS=[
  'Strenuous exercise in last 3 hours','Previous Motor Vehicle Collision','Residual Effects of Previous MVC',
  'Played Organized Contact Sport on Team','Legally Blind in One or Both Eyes','Wear Corrective Lenses',
  'History of Cerebral Infarct (Stroke)','History of TIA / Vasospasm','History of Headaches (diagnosed)',
  'Migraine Headaches (diagnosed by physician)','History of Seizures','History of Tinnitus',
  'History of Diminished Eyesight','History of Sleep Disorder','History of Military Service',
  'Diagnosed with PTSD','History of Anxiety','History of Depression','Diagnosed with ADHD',
  'Diagnosed with Dyslexia','Diagnosed with Autism','Psychiatric Diagnosis',
  'Brain Surgery','Meningitis','History of Rehab for Alcohol Abuse','History of Rehab for Drug Abuse',
  'Received Speech Therapy','Attended IEP or Special Education Classes',
  'Repeated One or More Grades','Advanced One or More Grades',
  'Do you have any orthopedic problem or injuries?',
  /* APPENDED, never inserted. Saved answers are matched to this list by
     position, so putting a new question anywhere but the end would shift every
     answer after it and silently rewrite existing patient records. */
  'Are you currently pregnant?'
]
/* PMH rows that get a free-text box, revealed only when the row is answered
   "Yes" (see buildYNList / toggleYNComment). Requested by Dr Grande so
   gestational age is captured on the question itself rather than retyped into
   the notes at every visit. */
/* PMH questions that reveal a follow-up control when answered Yes. A string
   is a free-text placeholder; an object describes a structured control.
   Either way the answer is stored as one string, '18 weeks', which is what the
   save file, the read-only chart view and the PDF already expect. */
const PMH_COMMENT_ITEMS={
  'Are you currently pregnant?':{
    type:'number-unit',
    /* Number options follow the unit, so months cannot run to 42 and weeks
       cannot stop at 9. Picking from a list also removes the free-text spread
       Dr Grande was trying to escape - "18wks", "18 weeks", "4 1/2 months". */
    units:[{label:'weeks',max:42},{label:'months',max:9}]
  }
}
/* PMH questions that only earn a line in the exported PDF when answered "Yes".
   Every other question still prints its "No", because "no prior stroke" is a
   finding worth recording. "Not pregnant" is not - it is true of most patients
   and says nothing about their care. */
const PMH_YES_ONLY=new Set(['Are you currently pregnant?'])
const ACE_PHYSICAL=['Headache','Nausea','Vomiting','Balance problems','Dizziness','Visual problems','Fatigue','Sensitivity to light','Sensitivity to noise','Numbness/Tingling']
const ACE_COGNITIVE=['Feeling mentally foggy','Feeling slowed down','Difficulty concentrating','Difficulty remembering']
const ACE_SLEEP=['Drowsiness','Sleeping less than usual','Sleeping more than usual','Trouble falling asleep']
const ACE_EMOTIONAL=['Irritability','Sadness','More emotional','Nervousness']
const EARLY_SIGNS=['Appears dazed or stunned','Is confused about events','Answers questions slowly','Repeats questions','Forgetful (recent information)']
const IMMEDIATE_EXPERIENCE=['Disorientation','Confusion','Dizziness','Nausea/Vomiting','Headache','Blurred / Visual Disturbance','Loss of Consciousness','Memory Loss (Amnesia)','Ringing in Ears (Tinnitus)','Numbness/Tingling','Neck Pain','Difficulty Speaking']
const REFERRAL_TYPES=['Neuropsychological Testing','Neurosurgery','Neurology','Sports Medicine','Physiatrist','Psychiatrist','Emergency Department']

const ICD_CODES=[
  ['S06.0X0A','Concussion w/o LOC, initial encounter'],
  ['S06.0X1A','Concussion w LOC of 30 minutes or less, initial encounter'],
  ['F07.81','Post-concussional syndrome'],
  ['V43.52XA','Car driver injured in collision with other type car in traffic accident, initial encounter'],
  ['V43.51XA','Car driver injured by MVC with SUV, initial enc.'],
  ['V43.54XA','Car driver injured in collision with van in traffic accident'],
  ['V43.53XA','Car driver injured in collision with pick-up truck in traffic accident, initial encounter'],
  ['V44.5XXA','Car driver injured in collision with heavy transport vehicle or bus in traffic accident, initial encounter'],
  ['V47.5XXA','Car driver injured in collision with fixed or stationary object in traffic accident, initial encounter'],
  ['V47.0XXA','Car driver injured in collision with fixed or stationary object in nontraffic accident, initial encounter'],
  ['V53.5XXA','Car driver injured in a collision with a pick-up truck towing a boat on a trailer'],
  ['V43.02XA','Car driver injured in collision with other type car in nontraffic accident, initial encounter'],
  ['V49.40XA','Driver injured in collision with unspecified motor vehicles in traffic accident, initial encounter'],
  ['V63.5XXA','Driver of pick-up truck, van or heavy transport vehicle injured in collision, initial encounter'],
  ['V53.0XXA','Driver of pick-up truck or van injured in collision with car, pick-up truck or van in nontraffic accident, initial encounter'],
  ['V57.5XXA','Driver of pick-up truck or van injured in collision with fixed or stationary object in traffic accident, initial encounter'],
  ['V84.0XXA','Driver of special agricultural vehicle injured in traffic accident, initial encounter'],
  ['V43.62XA','Car passenger injured in collision with other car, initial encounter'],
  ['V49.59XA','Passenger injured in collision with other motor vehicles in traffic accident, initial encounter'],
  ['V43.61XA','Car passenger injured in collision with sport utility vehicle in traffic accident, initial enc.'],
  ['V43.12XA','Car passenger injured in collision with other type car in nontraffic accident, initial encounter'],
  ['V43.63XA','Car passenger injured in collision with pick-up truck in traffic accident, initial encounter'],
  ['V44.6XXA','Car passenger injured in collision with heavy transport vehicle or bus in traffic accident, initial encounter'],
  ['V47.6XXA','Car passenger injured in collision with fixed or stationary object in traffic accident, initial encounter'],
  ['V79.50XA','Passenger on bus injured in collision with unspecified motor vehicles in traffic accident, initial encounter'],
  ['V23.4','Motorcycle driver injured in collision with car, pick-up truck or van in traffic accident'],
  ['V00.841A','Fall from standing electric scooter, initial encounter'],
  ['V19.60XA','Unspecified pedal cyclist injured in collision with unspecified motor vehicles in traffic accident, initial encounter'],
  ['V03.10XA','Pedestrian on foot injured in collision with car, pick-up truck or van in traffic accident, initial encounter'],
  ['V09.20XA','Pedestrian injured in traffic accident involving unspecified motor vehicles, initial encounter'],
  ['V04.00XA','Pedestrian injured in collision with heavy transport vehicle or bus in nontraffic accident, initial encounter'],
  ['W07.XXXA','Fall from chair, initial encounter'],
  ['W20.1XXA','Struck by object due to collapse of building, initial encounter'],
  ['W01.198A','Fall on same level, subsequent striking other object, initial encounter'],
  ['W22.8','Head striking head restraint or other object, NOS'],
  ['W22.8XXA','Striking against or struck by other objects, initial encounter'],
  ['W22.19XA','Struck head, struck by airbag, automobile, initial encounter'],
  ['W22.10XA','Body struck by airbag, automobile, initial encounter'],
  ['S06.0X9','Concussion, current'],
  ['S09.90XA','Cerebral trauma, traumatic head injury, initial encounter'],
  ['S00.83XA','Contusion of forehead, face, cheek, initial encounter'],
  ['S00.93XA','Contusion of head, unspecified, initial encounter'],
  ['G44.309','Headache, post-traumatic'],
  ['R51.9','Headache, unspecified'],
  ['F06.7','Mild neurocognitive disorder due to known physiological condition'],
  ['R46.7','Verbosity and circumstantial detail obscuring reason for contact'],
  ['R41.844','Frontal lobe and executive function deficit'],
  ['F06.34','Mood disorder due to known physiological condition with mixed features'],
  ['R45.0','Nervousness'],
  ['R45.4','Irritability and anger'],
  ['R45.86','Emotional lability'],
  ['H53.14','Visual discomfort, photophobia, asthenopia'],
  ['H53.19','Visual disturbances, haloes, flashes'],
  ['R47.01','Aphasia'],
  ['R41.841','Cognitive communication deficit'],
  ['R47.82','Stuttering and fluency disorder conditions classified elsewhere'],
  ['I69.920','Hx. of aphasia following cerebral infarction (stroke)'],
  ['I69.398','Hx of other sequelae of cerebral infarction (stroke)'],
  ['R42.','Dizziness'],
  ['R42.','Vertigo, not otherwise specified'],
  ['H55.00','Nystagmus and other abnormal eye movements, unspecified'],
  ['H81.20','Vestibular neuronitis, unspecified ear'],
  ['H93.19','Tinnitus, unspecified ear'],
  ['H81.10','Benign paroxysmal vertigo (BPPV), unspecified ear'],
  ['R41.3','Memory deficit'],
  ['R41.840','Attention and concentration deficit'],
  ['R45.89','Other signs and symptoms involving emotional state'],
  ['R41.89','Other signs and symptoms involving cognitive functions and awareness'],
  ['R41.842','Visuospatial deficit'],
  ['R41.843','Psychomotor deficit'],
  ['R47.81','Slurred speech'],
  ['R43.0','Loss of smell (anosmia)'],
  ['R43.8','Other disturbance of smell and taste'],
  ['R13.10','Dysphagia, unspecified'],
  ['R41.1','Anterograde amnesia'],
  ['R41.2','Retrograde amnesia'],
  ['R56.1','Post-traumatic seizures'],
  ['Z62.81','Personal history of childhood physical abuse'],
  ['Z87.820','Personal history of traumatic brain injury'],
  ['Z91.410','Personal history of adult physical abuse'],
  ['Z91.82','Personal history of military deployment'],
  ['Z91.85','Personal history of military service'],
  ['H90.5','Sensorineural hearing loss, unspecified'],
  ['H81.91','Vestibular function disorder, unspecified, right ear'],
  ['H81.92','Vestibular function disorder, unspecified, left ear'],
  ['H81.93','Vestibular function disorder, unspecified, bilateral'],
  ['M79.631','Pain in right forearm'],
]

// ── BUILD UI ──
function buildYNList(containerId,items,counterEl,withComments){
  const c=document.getElementById(containerId)
  items.forEach((item,i)=>{
    const row=document.createElement('div');row.className='yn-row';row.dataset.answered='0'
    // Bind the question to its row. Non-question rows are injected into these
    // lists later (e.g. the Language picker in #pmhList), so anything that
    // reads answers back must key off this instead of the row's DOM position -
    // positional lookup silently shifts every label after the inserted row.
    row.dataset.item=item
    row.innerHTML=`<span class="yn-label">${item}</span><div class="yn-btns">
      <button class="yn-btn yes" data-onclick="setYN(this,'yes','${containerId}','${counterEl}')">Yes</button>
      <button class="yn-btn no" data-onclick="setYN(this,'no','${containerId}','${counterEl}')">No</button>
      <button class="yn-btn na" data-onclick="setYN(this,'na','${containerId}','${counterEl}')">N/A</button>
    </div>`
    /* withComments accepts `true` for every row (HPI), or a map of
       item -> spec to give a control to specific questions only (PMH, where
       just the pregnancy row needs one and 30 stray comment boxes would be
       noise). A text box is revealed on "Yes" or "No", a structured control
       on "Yes" only (toggleYNComment). */
    const raw = withComments===true ? 'Optional comment…'
      : (withComments && typeof withComments==='object' ? withComments[item] : null)
    const spec = typeof raw==='string' ? {type:'text',placeholder:raw} : raw
    if(spec){
      // Shown once the row is answered (see toggleYNComment). Never required to complete the form.
      const cmt=document.createElement('div');cmt.className='yn-comment';cmt.style.display='none'
      if(spec.type==='number-unit') buildNumberUnitComment(cmt,spec)
      else{
        const inp=document.createElement('input');inp.type='text';inp.className='yn-comment-input'
        inp.placeholder=spec.placeholder||'Optional comment…'
        cmt.appendChild(inp)
      }
      row.appendChild(cmt)
    }
    c.appendChild(row)
  })
}

function buildNumberUnitComment(cmt,spec){
  cmt.classList.add('yn-comment-structured')
  const num=document.createElement('select');num.className='yn-cmt-num'
  const unit=document.createElement('select');unit.className='yn-cmt-unit'
  const hidden=document.createElement('input');hidden.type='hidden';hidden.className='yn-comment-input'

  unit.innerHTML='<option value="">— unit —</option>'
    +spec.units.map(u=>`<option value="${u.label}">${u.label}</option>`).join('')

  // Number range follows the chosen unit; a selection still valid in the new
  // range is kept, so switching weeks->months doesn't silently wipe a 4.
  function fillNumbers(){
    const chosen=spec.units.find(u=>u.label===unit.value)
    const max=chosen?chosen.max:Math.max(...spec.units.map(u=>u.max))
    const keep=num.value
    let html='<option value="">—</option>'
    for(let n=1;n<=max;n++)html+=`<option value="${n}">${n}</option>`
    num.innerHTML=html
    if(keep&&Number(keep)<=max)num.value=keep
  }
  // Only a complete pair is stored. Half an answer ("18", no unit) would print
  // as a meaningless number on the report.
  function sync(){ hidden.value=(num.value&&unit.value)?num.value+' '+unit.value:'' }

  unit.addEventListener('change',()=>{fillNumbers();sync()})
  num.addEventListener('change',sync)
  fillNumbers()

  cmt.appendChild(num);cmt.appendChild(unit);cmt.appendChild(hidden)
}

/* Put a saved "18 weeks" back into the two dropdowns. The generic restore only
   sets the hidden field, which would leave the controls looking empty over a
   stored answer. Anything that doesn't parse is left in the hidden field
   untouched, so a free-text value saved before this existed still prints. */
function restoreStructuredComments(containerId){
  document.querySelectorAll('#'+containerId+' .yn-comment-structured').forEach(cmt=>{
    const hidden=cmt.querySelector('.yn-comment-input')
    const num=cmt.querySelector('.yn-cmt-num')
    const unit=cmt.querySelector('.yn-cmt-unit')
    const m=String((hidden&&hidden.value)||'').match(/^\s*(\d+)\s*([A-Za-z]+)/)
    if(!m||!num||!unit)return
    unit.value=m[2].toLowerCase()
    unit.dispatchEvent(new Event('change'))   // repopulates the number range
    num.value=m[1]
    num.dispatchEvent(new Event('change'))    // rewrites the hidden value
  })
}

// Reveal the optional comment box when the row is answered "Yes" or "No" - a
// "No" can need a word of explanation too (asked for 12 Oct 2026). A structured
// follow-up (pregnancy: how many weeks) only means something after "Yes".
function toggleYNComment(row,val){
  const cmt=row&&row.querySelector('.yn-comment')
  if(!cmt)return
  const structured=cmt.classList.contains('yn-comment-structured')
  cmt.style.display=(val==='yes'||(val==='no'&&!structured))?'':'none'
}

function applyPregnancyGate() {
  const row = document.querySelector('#pmhList .yn-row[data-item="' + PREG_QUESTION + '"]')
  if (!row) return
  const sel = document.getElementById('ptGender')
  const gated = String(sel ? sel.value : '').trim().toLowerCase() === 'male'
  row.classList.toggle('yn-row-gated', gated)
  row.querySelectorAll('.yn-btn').forEach(b => { b.disabled = gated })
  if (gated) {
    /* Anything already on the row goes with it. A male chart carrying
       "pregnant: yes" is worse than one where the question was never asked,
       and leaving a stale Yes behind a disabled control means nobody can
       clear it. */
    row.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'))
    row.dataset.answered = '0'
    const cmt = row.querySelector('.yn-comment')
    if (cmt) {
      cmt.style.display = 'none'
      cmt.querySelectorAll('input,select').forEach(el => { el.value = '' })
    }
  }
  updateYNCount('pmhList', 'pmhCount')
}

function setYN(btn,val,containerId,counterEl){
  const row=btn.closest('.yn-row')
  row.querySelectorAll('.yn-btn').forEach(b=>b.classList.remove('active'))
  btn.classList.add('active')
  row.dataset.answered='1'
  toggleYNComment(row,val)
  updateYNCount(containerId,counterEl)
}

function updateYNCount(containerId,counterEl){
  // Only real questions count. The injected Language row has no data-item and
  // no Yes/No/N-A buttons, so counting it made PMH stick at "31 of 32".
  // A gated row (pregnancy on a male patient) is excluded the same way, or
  // the section could never reach its own total.
  const total=document.querySelectorAll('#'+containerId+' .yn-row[data-item]:not(.yn-row-gated)').length
  const answered=document.querySelectorAll('#'+containerId+' .yn-row[data-item][data-answered="1"]:not(.yn-row-gated)').length
  const el=document.getElementById(counterEl)
  if(el)el.textContent=answered+' of '+total+' answered'
}

buildYNList('hpiList',HPI_ITEMS,'hpiCount',true)
/* Every PMH question takes an optional comment on Yes or No, like HPI (12 Oct
   2026); the pregnancy question keeps its own weeks/months control. Comments
   are stored per row, so adding boxes moves no saved answer. */
const PMH_ALL_COMMENTS=Object.assign(Object.fromEntries(PMH_ITEMS.map(q=>[q,'Optional comment…'])),PMH_COMMENT_ITEMS)
buildYNList('pmhList',PMH_ITEMS,'pmhCount',PMH_ALL_COMMENTS)

// Insert language picker after first PMH item
setTimeout(()=>{
  const pmhList=document.getElementById('pmhList')
  const firstRow=pmhList.querySelector('.yn-row')
  if(firstRow){
    const langRow=document.createElement('div')
    langRow.className='yn-row'
    langRow.innerHTML=`<span class="yn-label">Language</span><div class="yn-btns"><select id="languageField" class="yn-btn yn-select"><option value="">— Select —</option><option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Chinese (Mandarin)</option><option>Japanese</option><option>Korean</option><option>Portuguese</option><option>Russian</option><option>Arabic</option><option>Hindi</option><option>Italian</option><option>Dutch</option><option>Swedish</option><option>Polish</option><option>Vietnamese</option><option>Thai</option><option>Turkish</option><option>Other</option></select></div>`
    firstRow.parentNode.insertBefore(langRow,firstRow.nextSibling)
    /* Match the width of the Yes/No/N-A group this row stands in for, measured
       from a real row rather than hard-coded - if those buttons ever change
       wording or padding, this stays aligned instead of quietly drifting. */
    /* Measured when the ACE page is actually on screen. Running it at build
       time measured 0, because the page is display:none until opened - so the
       select kept its intrinsic width and never lined up with the button
       groups above and below it. */
    window.ctgSyncLanguageWidth=function(){
      const grp=firstRow.querySelector('.yn-btns')
      const sel=langRow.querySelector('#languageField')
      if(!grp||!sel)return
      const w=Math.round(grp.getBoundingClientRect().width)
      if(w>0)sel.style.width=w+'px'
    }
    requestAnimationFrame(window.ctgSyncLanguageWidth)
    window.addEventListener('resize',function(){window.ctgSyncLanguageWidth()})
  }
},0)

// Risk factors (checkboxes) - also reused for any other check-all-that-apply list
function makeRiskLabel(r){
  const el=document.createElement('label')
  el.style.cssText='display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;user-select:none;transition:all .12s'
  el.innerHTML=`<div data-cs="${__cs}width:15px;height:15px;border:1.5px solid var(--border2);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;transition:all .12s" class="rchk">✓</div>`
  el.appendChild(document.createTextNode(r))
  el.onclick=()=>{
    el.classList.toggle('checked')
    const chk=el.querySelector('.rchk')
    if(el.classList.contains('checked')){el.style.background='var(--al)';el.style.borderColor='var(--accent)';chk.style.background='var(--accent)';chk.style.borderColor='var(--accent)';chk.style.color='#fff'}
    else{el.style.background='';el.style.borderColor='';chk.style.background='';chk.style.borderColor='';chk.style.color=''}
  }
  return el
}
function buildRiskCheckboxes(containerId,items){
  const c=document.getElementById(containerId)
  ;(items||RISK_FACTORS).forEach(r=>c.appendChild(makeRiskLabel(r)))
}
/* Risk factors the practice adds themselves. The "+ Additional" tile at the end
   of each list opens the same yellow pick list as the other ACE dropdowns (Type
   Here / Add / Select All / x). Each added choice becomes a box in the list
   (marked data-custom), so it saves, restores, prints and shows on the
   read-only view exactly like the built-in choices. */
// Every check-all-that-apply list takes added choices (Early Signs, Referral Types and
// Immediate Experience joined 13 Oct 2026).
const RISK_WRITEIN_LISTS=['riskFactorsList','assessRiskList','earlySignsList','referralTypeList','immedExperienceList']
function addCustomRiskLabel(containerId,text,checkIt){
  const c=document.getElementById(containerId)
  const t=String(text||'').replace(/\s+/g,' ').trim().slice(0,120)
  if(!c||!t)return null
  const same=[...c.querySelectorAll('label')].find(el=>chkTxt(el).toLowerCase()===t.toLowerCase())
  if(same){if(checkIt&&!same.classList.contains('checked'))same.click();return same}
  const el=makeRiskLabel(t)
  el.dataset.custom='1'
  c.insertBefore(el,c.querySelector('.risk-add-tile'))
  if(checkIt)el.click()
  return el
}
function removeCustomRiskLabels(){
  RISK_WRITEIN_LISTS.forEach(id=>document.querySelectorAll('#'+id+' label[data-custom]').forEach(el=>el.remove()))
}
function buildRiskAdditional(containerId){
  const c=document.getElementById(containerId)
  if(!c)return
  const tile=document.createElement('div')
  tile.className='risk-add-tile';tile.tabIndex=0;tile.setAttribute('role','button')
  tile.setAttribute('aria-label','Add more choices')
  tile.style.cssText='display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px dashed var(--accent);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--accent);user-select:none'
  tile.textContent='+ Additional ▾'
  const open=()=>{
    if(!window.ctgPicker)return
    // A signed Day 1 is locked by disabling its fields; follow the same rule.
    const probe=(c.closest('[id^="page-"]')||document).querySelector('input,select,textarea')
    if(probe&&probe.disabled)return
    const customs=()=>[...c.querySelectorAll('label[data-custom]')]
    const m={o:customs().map(chkTxt),s:customs().filter(el=>el.classList.contains('checked')).map(chkTxt)}
    window.ctgPicker.open(tile,m,()=>{
      m.o.forEach(o=>{if(!customs().some(el=>chkTxt(el)===o))addCustomRiskLabel(containerId,o,false)})
      customs().forEach(el=>{const t=chkTxt(el);if(!m.o.includes(t))el.remove();else applyStyledLabelCheck(el,m.s.includes(t))})
      // A typed choice that matches a built-in box ticks that box instead.
      m.s.forEach(t=>{const b=[...c.querySelectorAll('label:not([data-custom])')].find(el=>chkTxt(el).toLowerCase()===t.toLowerCase());if(b)applyStyledLabelCheck(b,true)})
      // The pick list lives outside the form, so tell the form's autosave.
      c.dispatchEvent(new Event('change',{bubbles:true}))
    })
  }
  tile.addEventListener('click',open)
  tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})
  c.appendChild(tile)
}
buildRiskCheckboxes('riskFactorsList')
buildRiskCheckboxes('assessRiskList')
buildRiskCheckboxes('earlySignsList',EARLY_SIGNS)
buildRiskCheckboxes('referralTypeList',REFERRAL_TYPES)
buildRiskCheckboxes('immedExperienceList',IMMEDIATE_EXPERIENCE)
// After every list exists: the tile goes at the end of each one.
RISK_WRITEIN_LISTS.forEach(buildRiskAdditional)

function toggleFollowupFields(){
  const v=document.getElementById('followupPlan').value
  document.getElementById('followupMonitorWrap').style.display=v==='monitor'?'flex':'none'
  document.getElementById('followupReferralWrap').style.display=v==='referral'?'flex':'none'
}

// ACE symptom buttons
function buildAceSymptoms(containerId,items,category){
  const c=document.getElementById(containerId)
  items.forEach(s=>{
    const div=document.createElement('div');div.className='sym-score-item';div.dataset.cat=category
    div.innerHTML=`<span>${s}</span><div class="sym-btns">
      <button class="sym-btn" data-val="0" data-onclick="setAceScore(this)">0</button>
      <button class="sym-btn" data-val="1" data-onclick="setAceScore(this)">1</button>
    </div>`
    c.appendChild(div)
  })
}
buildAceSymptoms('acePhysical',ACE_PHYSICAL,'phys')
buildAceSymptoms('aceCognitive',ACE_COGNITIVE,'cog')
buildAceSymptoms('aceSleep',ACE_SLEEP,'sleep')
buildAceSymptoms('aceEmotional',ACE_EMOTIONAL,'emot')

function setAceScore(btn){
  const btns=btn.closest('.sym-btns').querySelectorAll('.sym-btn')
  btns.forEach(b=>b.classList.remove('active'))
  btn.classList.add('active')
  const item=btn.closest('.sym-score-item')
  if(btn.dataset.val==='1')item.classList.add('scored')
  else item.classList.remove('scored')
  updateAceTotals()
}

function updateAceTotals(){
  const getScore=(id)=>[...document.querySelectorAll('#'+id+' .sym-btn.active[data-val="1"]')].length
  const p=getScore('acePhysical'),c=getScore('aceCognitive'),s=getScore('aceSleep'),e=getScore('aceEmotional')
  document.getElementById('scorePhys').textContent=p
  document.getElementById('scoreCog').textContent=c
  document.getElementById('scoreSleep').textContent=s
  document.getElementById('scoreEmot').textContent=e
  const total=p+c+s+e
  document.getElementById('scoreTotalBig').textContent=total
  document.getElementById('aceTotal').textContent='Total: '+total+' / 22'
  document.getElementById('abACE').textContent=total+'/22'
  if(typeof updatePatientAceBar==='function')updatePatientAceBar()
}

// ICD codes
function buildICD(){
  const grid=document.getElementById('icdGrid')
  ICD_CODES.forEach(([code,desc],i)=>{
    const el=document.createElement('div');el.className='icd-item';el.dataset.idx=i
    el.dataset.search=(code+' '+desc).toLowerCase()
    el.innerHTML=`<div class="icd-box">✓</div><span class="icd-code">${code}</span><span class="icd-desc">${desc}</span>`
    el.onclick=()=>{
      el.classList.toggle('checked')
      const n=document.querySelectorAll('#icdGrid .icd-item.checked').length
      document.getElementById('dxCount').textContent=n+' selected'
      document.getElementById('icdSelCount').textContent=n+' codes selected'
    }
    grid.appendChild(el)
  })
}
buildICD()

function filterICD(){
  const q=document.getElementById('icdSearch').value.toLowerCase()
  document.querySelectorAll('#icdGrid .icd-item').forEach(el=>{
    el.style.display=(!q||el.dataset.search.includes(q))?'':'none'
  })
}

// ── DATE PICKER ──
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December']
let dpEl=null,dpActiveInput=null,dpViewYear=0,dpViewMonth=0

function buildDatePicker(){
  const pop=document.createElement('div')
  pop.className='datepicker'
  pop.innerHTML=`<div class="dp-head">
      <button type="button" class="dp-nav" data-onclick="dpChangeMonth(-1)">‹</button>
      <select class="dp-month" data-onchange="dpSetMonth(this.value)"></select>
      <select class="dp-year" data-onchange="dpSetYear(this.value)"></select>
      <button type="button" class="dp-nav" data-onclick="dpChangeMonth(1)">›</button>
    </div>
    <div class="dp-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
    <div class="dp-days"></div>
    <div class="dp-foot">
      <button type="button" class="dp-today" data-onclick="dpToday()">Today</button>
      <button type="button" class="dp-clear" data-onclick="dpClear()">Clear</button>
    </div>`
  document.body.appendChild(pop)
  const monthSel=pop.querySelector('.dp-month')
  MONTH_NAMES.forEach((m,i)=>{const o=document.createElement('option');o.value=i;o.textContent=m;monthSel.appendChild(o)})
  const yearSel=pop.querySelector('.dp-year')
  const curYear=new Date().getFullYear()
  for(let y=curYear+1;y>=curYear-110;y--){const o=document.createElement('option');o.value=y;o.textContent=y;yearSel.appendChild(o)}
  return pop
}

function toggleDatePicker(inputId){
  if(!dpEl)dpEl=buildDatePicker()
  const input=document.getElementById(inputId)
  if(dpActiveInput===inputId&&dpEl.classList.contains('show')){
    dpEl.classList.remove('show');dpActiveInput=null;return
  }
  dpActiveInput=inputId
  const m=input.value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const today=new Date()
  if(m){dpViewMonth=parseInt(m[1])-1;dpViewYear=parseInt(m[3])}
  else{dpViewMonth=today.getMonth();dpViewYear=today.getFullYear()}
  dpRender()
  dpPosition(input)
  dpEl.classList.add('show')
}

function dpPosition(input){
  const r=input.getBoundingClientRect()
  let left=r.left+window.scrollX
  if(left+236>window.innerWidth)left=Math.max(8,r.right+window.scrollX-236)
  dpEl.style.top=(r.bottom+window.scrollY+4)+'px'
  dpEl.style.left=left+'px'
}

function dpRender(){
  dpEl.querySelector('.dp-month').value=dpViewMonth
  dpEl.querySelector('.dp-year').value=dpViewYear
  const daysEl=dpEl.querySelector('.dp-days')
  daysEl.innerHTML=''
  const firstDay=new Date(dpViewYear,dpViewMonth,1).getDay()
  const numDays=new Date(dpViewYear,dpViewMonth+1,0).getDate()
  const input=document.getElementById(dpActiveInput)
  const sel=input.value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const selDay=(sel&&parseInt(sel[1])-1===dpViewMonth&&parseInt(sel[3])===dpViewYear)?parseInt(sel[2]):null
  const today=new Date()
  for(let i=0;i<firstDay;i++){
    const sp=document.createElement('span');sp.className='dp-day empty';daysEl.appendChild(sp)
  }
  for(let d=1;d<=numDays;d++){
    const sp=document.createElement('span');sp.className='dp-day';sp.textContent=d
    if(d===selDay)sp.classList.add('sel')
    if(d===today.getDate()&&dpViewMonth===today.getMonth()&&dpViewYear===today.getFullYear())sp.classList.add('today')
    sp.onclick=()=>dpPick(d)
    daysEl.appendChild(sp)
  }
}

function dpPick(day){
  const input=document.getElementById(dpActiveInput)
  const mm=String(dpViewMonth+1).padStart(2,'0')
  const dd=String(day).padStart(2,'0')
  input.value=mm+'/'+dd+'/'+dpViewYear
  input.dispatchEvent(new Event('input',{bubbles:true}))
  dpEl.classList.remove('show')
  dpActiveInput=null
}

function dpChangeMonth(delta){
  dpViewMonth+=delta
  if(dpViewMonth<0){dpViewMonth=11;dpViewYear--}
  if(dpViewMonth>11){dpViewMonth=0;dpViewYear++}
  dpRender()
}
function dpSyncValue(){
  const input=document.getElementById(dpActiveInput)
  if(!input)return
  const m=input.value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if(!m)return
  // 31 Jan -> February has to land on the 28th/29th, not roll into March.
  const lastDay=new Date(dpViewYear,dpViewMonth+1,0).getDate()
  const day=Math.min(parseInt(m[2],10),lastDay)
  input.value=String(dpViewMonth+1).padStart(2,'0')+'/'+String(day).padStart(2,'0')+'/'+dpViewYear
  input.dispatchEvent(new Event('input',{bubbles:true}))
}
function dpSetMonth(v){dpViewMonth=parseInt(v);dpSyncValue();dpRender()}
function dpSetYear(v){dpViewYear=parseInt(v);dpSyncValue();dpRender()}

function dpToday(){
  const today=new Date()
  dpViewMonth=today.getMonth();dpViewYear=today.getFullYear()
  dpRender()
  dpPick(today.getDate())
}

function dpClear(){
  const input=document.getElementById(dpActiveInput)
  input.value=''
  input.dispatchEvent(new Event('input',{bubbles:true}))
  dpEl.classList.remove('show')
  dpActiveInput=null
}

document.addEventListener('click',e=>{
  if(!dpEl||!dpEl.classList.contains('show'))return
  if(dpEl.contains(e.target))return
  if(e.target.closest('.cal-btn'))return
  dpEl.classList.remove('show');dpActiveInput=null
})
window.addEventListener('resize',()=>{if(dpEl&&dpEl.classList.contains('show'))dpEl.classList.remove('show')})

// ── TIME PICKER ──
let tpEl=null,tpActiveInput=null
function buildTimePicker(){
  const pop=document.createElement('div')
  pop.className='timepicker'
  const hours=[12,1,2,3,4,5,6,7,8,9,10,11]
  const mins=['00','05','10','15','20','25','30','35','40','45','50','55']
  let hHtml='<div class="tp-col-hd">Hour</div>'
  hours.forEach(h=>{hHtml+=`<span class="tp-item tp-hour" data-val="${h}">${h}</span>`})
  let mHtml='<div class="tp-col-hd">Min</div>'
  mins.forEach(m=>{mHtml+=`<span class="tp-item tp-min" data-val="${m}">${m}</span>`})
  pop.innerHTML=`<div class="tp-cols">
    <div class="tp-col">${hHtml}</div>
    <div class="tp-col">${mHtml}</div>
    <div class="tp-col"><div class="tp-col-hd">—</div><span class="tp-item tp-ap" data-val="AM">AM</span><span class="tp-item tp-ap" data-val="PM">PM</span></div>
  </div>`
  pop.querySelectorAll('.tp-hour').forEach(el=>el.addEventListener('click',()=>tpPick('hour',el.dataset.val)))
  pop.querySelectorAll('.tp-min').forEach(el=>el.addEventListener('click',()=>tpPick('min',el.dataset.val)))
  pop.querySelectorAll('.tp-ap').forEach(el=>el.addEventListener('click',()=>tpPick('ap',el.dataset.val)))
  document.body.appendChild(pop)
  return pop
}
function toggleTimePicker(inputId){
  if(!tpEl)tpEl=buildTimePicker()
  const input=document.getElementById(inputId)
  if(tpActiveInput===inputId&&tpEl.classList.contains('show')){tpEl.classList.remove('show');tpActiveInput=null;return}
  tpActiveInput=inputId
  tpRender()
  const r=input.getBoundingClientRect()
  let left=r.left+window.scrollX
  if(left+190>window.innerWidth)left=Math.max(8,r.right+window.scrollX-190)
  tpEl.style.top=(r.bottom+window.scrollY+4)+'px'
  tpEl.style.left=left+'px'
  tpEl.classList.add('show')
}
function tpRender(){
  const input=document.getElementById(tpActiveInput)
  const m=(input.value||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  const selH=m?parseInt(m[1]):null
  const selM=m?m[2]:null
  const selAP=m?m[3].toUpperCase():null
  tpEl.querySelectorAll('.tp-hour').forEach(el=>el.classList.toggle('sel',parseInt(el.dataset.val)===selH))
  tpEl.querySelectorAll('.tp-min').forEach(el=>el.classList.toggle('sel',el.dataset.val===selM))
  tpEl.querySelectorAll('.tp-ap').forEach(el=>el.classList.toggle('sel',el.dataset.val===selAP))
}
function tpPick(type,val){
  const input=document.getElementById(tpActiveInput)
  const m=(input.value||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  let h=m?m[1]:'12',min=m?m[2]:'00',ap=m?m[3].toUpperCase():'AM'
  if(type==='hour')h=val
  if(type==='min')min=val
  if(type==='ap')ap=val
  input.value=h+':'+min+' '+ap
  input.dispatchEvent(new Event('input',{bubbles:true}))
  tpRender()
}
document.addEventListener('click',e=>{
  if(!tpEl||!tpEl.classList.contains('show'))return
  if(tpEl.contains(e.target))return
  if(e.target.closest('[data-onclick*="toggleTimePicker"]')||e.target.id==='dnTime')return
  tpEl.classList.remove('show');tpActiveInput=null
})

// ── BANNER & BOILERPLATES ──
function calcAge(dobStr){
  const m=(dobStr||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if(!m)return ''
  const dob=new Date(parseInt(m[3]),parseInt(m[1])-1,parseInt(m[2]))
  const today=new Date()
  let age=today.getFullYear()-dob.getFullYear()
  if(today.getMonth()<dob.getMonth()||(today.getMonth()===dob.getMonth()&&today.getDate()<dob.getDate()))age--
  return age>=0?String(age):''
}

function updateBanner(){
  const name=document.getElementById('ptName').value.trim()
  const dob=document.getElementById('ptDOB').value.trim()
  const dos=document.getElementById('dos').value.trim()
  document.getElementById('ptAge').value=calcAge(dob)
  document.getElementById('ptBannerName').textContent=name||'New Patient'
  document.getElementById('ptBannerSub').textContent=(dob?'DOB: '+dob:'')+(dob&&dos?' · ':'')+(dos?'DOS: '+dos:'')
  if(name){const ini=name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);document.getElementById('ptAv').textContent=ini}
  document.getElementById('abPatient').textContent=name||'—'
  document.getElementById('abDOS').textContent=dos||'—'
  updateBoilerplates()
}

const IT_GROUPS = [
  { group: 'Motor Vehicle Collision (MVC)', options: [
    'motor vehicle collision',
    'single head impact, single motor vehicle collision',
    'double head impact, single motor vehicle collision',
    'double head impact, double motor vehicle collision, double stationary object collision',
    'double head impact, double motor vehicle collision and single stationary object collision',
    'double head impact, triple motor vehicle collision',
    'double head impact, triple motor vehicle collision and triple stationary object collision',
    'double motor vehicle collision',
    'double motor vehicle collision, single stationary object collision',
    'triple head impact, single motor vehicle collision',
    'triple head impact, single motor vehicle collision and single stationary object collision',
    'triple head impact, double motor vehicle collision',
    'quadruple head impact, single motor vehicle collision',
    'quadruple head impact, double motor vehicle collision',
    'quadruple head impact, triple motor vehicle collision',
    'quadruple head impact, quadruple motor vehicle collision',
    'multiple head impacts, multiple motor vehicle collision',
    'multiple head impact, single motor vehicle collision, double stationary object collision',
    'single direct head impact, single motor vehicle collision',
    'single direct head impact and single motor vehicle collision',
    'single stationary object collision and single motor vehicle collision',
    'double head impact, single stationary object collision, single motor vehicle collision',
    'double head impact, double stationary object impact',
    'occupant of wheelchair automobile collision'
  ]},
  { group: 'Pedestrian', options: [
    'pedestrian struck by bus',
    'motor vehicle on pedestrian collision',
    'direct head impact, motor vehicle on pedestrian collision, stationary object collision incident'
  ]},
  { group: 'Bicycle', options: [
    'single direct head impact, single motor vehicle on bicycle collision',
    'single direct head impact, single bicycle struck stationary object'
  ]},
  { group: 'Fall / Slip', options: [
    'fall and head struck on a parked car',
    'fell and head struck on a parked car',
    'fall on same level head striking sidewalk pavement',
    'direct head injury, fall on same level from standing position',
    'head directly striking wall, trip and fall',
    'single direct head impact, single fall from standing electric scooter'
  ]},
  { group: 'Other', options: [
    'single direct head impact',
    'Second Head Impact',
    'double head impact and double motor vehicle collision',
    'double head injury, single stationary object collision'
  ]},
  { group: 'Other (No Vehicle Involved)', options: [
    'double struck and knocked down by dog',
    'dog assault and fall striking head on pavement',
    'light fixture fell from a height and struck head',
    'ceiling collapse'
  ]},
  { group: 'Diagnosis Code', options: [
    'Diagnosis (S06.0X0A) Concussion w/o LOC, initial encounter, (V43.51XA) Car driver injured by MVC with SUV, initial encounter'
  ]},
  { group: 'Write In', options: ['Others', 'No Vehicle Involved'] }
]
let itSelected = ''
let itOptions = IT_GROUPS.flatMap(g => g.options)
function itBuild() {
  const list = document.getElementById('itList')
  if (!list) return
  list.innerHTML = ''
  const clear = document.createElement('div')
  clear.className = 'it-item it-item-clear'
  clear.textContent = '— Select Injury Type —'
  clear.onclick = () => { itSelected = ''; itSync(); document.getElementById('itPanel').style.display = 'none' }
  list.appendChild(clear)
  IT_GROUPS.forEach(g => {
    const hdr = document.createElement('div')
    hdr.className = 'it-group-hdr'
    hdr.textContent = g.group
    list.appendChild(hdr)
    g.options.forEach(opt => {
      const item = document.createElement('div')
      item.className = 'it-item' + (opt === itSelected ? ' it-item-active' : '')
      item.textContent = opt
      item.onclick = () => { itSelected = opt; itSync(); document.getElementById('itPanel').style.display = 'none' }
      list.appendChild(item)
    })
  })
}
function itSync() {
  const isOther = itSelected === 'Others' || itSelected === 'No Vehicle Involved'
  const otherWrap = document.getElementById('itOtherWrap')
  if (otherWrap) otherWrap.style.display = isOther ? 'block' : 'none'
  const otherInput = document.getElementById('itOtherText')
  if (!isOther && otherInput) otherInput.value = ''
  if (otherInput) otherInput.placeholder = itSelected === 'No Vehicle Involved' ? 'Describe the non-vehicle injury event...' : 'Describe injury type...'
  const effectiveVal = isOther ? (document.getElementById('itOtherText')?.value.trim() || '') : itSelected
  const sel = document.getElementById('injuryType')
  if (sel) { sel.innerHTML = ''; const o = document.createElement('option'); o.value = effectiveVal; o.selected = true; sel.appendChild(o) }
  const dt = document.getElementById('itDisplayText')
  if (dt) { dt.textContent = itSelected || 'Select Injury Type'; dt.style.color = itSelected ? 'var(--text)' : 'var(--muted)' }
  // Mechanism of Injury (MOI): the vehicle-collision grid only makes sense
  // when a vehicle was actually involved. Strictly this one case swaps it
  // for a single free-text box instead - every other injury type (including
  // the plain "Others" write-in) keeps the normal MOI grid untouched.
  const isNoVehicle = itSelected === 'No Vehicle Involved'
  const vehicleGrid = document.getElementById('moiVehicleGrid')
  const noVehicleWrap = document.getElementById('moiNoVehicleWrap')
  const headImpactsSection = document.getElementById('moiHeadImpactsSection')
  const postImpactSection = document.getElementById('moiPostImpactSection')
  if (vehicleGrid) vehicleGrid.style.display = isNoVehicle ? 'none' : ''
  if (noVehicleWrap) noVehicleWrap.style.display = isNoVehicle ? '' : 'none'
  if (headImpactsSection) headImpactsSection.style.display = isNoVehicle ? 'none' : ''
  if (postImpactSection) postImpactSection.style.display = isNoVehicle ? 'none' : ''
  itBuild()
  updateBoilerplates()
}
function itOtherInput() {
  const val = document.getElementById('itOtherText')?.value.trim() || ''
  const sel = document.getElementById('injuryType')
  if (sel) { sel.innerHTML = ''; const o = document.createElement('option'); o.value = val; o.selected = true; sel.appendChild(o) }
  updateBoilerplates()
}
function itToggle() {
  const panel = document.getElementById('itPanel')
  const display = document.getElementById('itDisplay')
  if (!panel || !display) return
  const open = panel.style.display !== 'none'
  if (open) { panel.style.display = 'none'; return }
  // Re-parent to body so position:fixed resolves against the viewport
  // (cards use backdrop-filter/transform, which would otherwise trap it)
  if (panel.parentNode !== document.body) document.body.appendChild(panel)
  const r = display.getBoundingClientRect()
  const panelW = Math.max(r.width, 320)
  panel.style.display = 'block'
  panel.style.width = panelW + 'px'
  panel.style.left = r.left + 'px'
  const spaceBelow = window.innerHeight - r.bottom
  if (spaceBelow >= 240) {
    panel.style.top = (r.bottom + 4) + 'px'
    panel.style.bottom = ''
  } else {
    panel.style.bottom = (window.innerHeight - r.top + 4) + 'px'
    panel.style.top = ''
  }
  itBuild()
}
function itSetValue(val) {
  itSelected = val || ''
  itSync()
}
document.addEventListener('click', e => {
  const panel = document.getElementById('itPanel')
  const inWrap = document.getElementById('itWrap')?.contains(e.target)
  const inPanel = panel?.contains(e.target)
  if (!inWrap && !inPanel) { if (panel) panel.style.display = 'none' }
})
function updateBoilerplates(){
  const name=document.getElementById('ptName').value.trim()||'PT Name'
  const doi=document.getElementById('doi').value.trim()||'[date of injury]'
  const injType=document.getElementById('injuryType').value||'[injury type]'
  const pron=patientPronoun(getPatient(selectedPatientId))
  const plural=injuryIsPlural(injType)
  const incW=plural?'injury incidents':'injury incident'
  document.getElementById('bpBox').innerHTML=
    `<strong>Causation:</strong> Based on review of ${name}'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between ${pron.poss} injuries and the ${injType} ${incW} that occurred on ${doi}.<br><br>`+
    `<strong>Medical Necessity:</strong> The care and treatment rendered to ${name} has been medically necessary for the injuries sustained in the ${injType} ${incW} that occurred on ${doi}.<br><br>`+
    `<strong>Reasonableness:</strong> The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.`
}

['ptName','ptDOB','dos','doi'].forEach(id=>{const el=document.getElementById(id);if(el)el.oninput=updateBanner})
// injuryType change handled via itSync() -> updateBoilerplates()
const ACE_STANDARD_IMPRESSION_TEXT='Today the patient has demonstrated subjective and objective neurocognitive and vestibular findings associated with traumatic brain injury concussion. Further testing has been scheduled for a future date of service.'
const ACE_NO_FOLLOWUP_IMPRESSION_TEXT='Today the patient has demonstrated subjective and objective neurocognitive and vestibular findings associated with traumatic brain injury concussion. No further testing has been scheduled for a future date of service. No follow-up.'
function isAceNoFollowupSelected(){
  const raw=String(document.getElementById('recommendation')?.value||document.getElementById('recommendation')?.selectedOptions?.[0]?.textContent||'').trim().toLowerCase().replace(/\.$/,'')
  return raw==='no follow-up'||raw==='no follow up'
}
function getAceRecommendationText(){return isAceNoFollowupSelected()?'No follow-up.':go('recommendation')}
function getAceImpressionText(){
  if(isAceNoFollowupSelected())return ACE_NO_FOLLOWUP_IMPRESSION_TEXT
  const impEl=document.getElementById('impression')
  if(!impEl)return ACE_STANDARD_IMPRESSION_TEXT
  if(impEl.value==='custom')return gv('customImp')
  return impEl.options[impEl.selectedIndex]?.text||ACE_STANDARD_IMPRESSION_TEXT
}
function syncAceNoFollowupState(){
  const no=isAceNoFollowupSelected()
  const impEl=document.getElementById('impression')
  if(impEl&&impEl.options&&impEl.options.length){
    const stdOpt=[...impEl.options].find(o=>o.value==='std')||impEl.options[0]
    if(stdOpt)stdOpt.text=no?ACE_NO_FOLLOWUP_IMPRESSION_TEXT:ACE_STANDARD_IMPRESSION_TEXT
    if(no)impEl.value='std'
  }
  const customWrap=document.getElementById('customImpWrap')
  if(customWrap)customWrap.style.display=(!no&&impEl&&impEl.value==='custom')?'block':'none'
  const riskSection=document.getElementById('assessRiskSection')
  const riskList=document.getElementById('assessRiskList')
  if(riskSection)riskSection.style.display=no?'none':''
  if(riskList)riskList.style.display=no?'none':'grid'
}
document.getElementById('impression').onchange=syncAceNoFollowupState
const aceRecEl=document.getElementById('recommendation'); if(aceRecEl)aceRecEl.addEventListener('change',syncAceNoFollowupState)
syncAceNoFollowupState()

function goTo(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}

/* ── PREMIUM-MINIMAL: scroll-triggered section reveals ── */
var _revealObserver = null
function _getRevealObserver(){
  if(_revealObserver) return _revealObserver
  if(!('IntersectionObserver' in window)) return null
  _revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); _revealObserver.unobserve(e.target) }
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })
  return _revealObserver
}
function revealInit(){
  const page=document.querySelector('.page.active'); if(!page)return
  const obs=_getRevealObserver()
  const els=page.querySelectorAll('.pt-strip, .card')
  els.forEach((el,i)=>{
    if(el.classList.contains('in')) return  // already revealed - leave it
    el.classList.add('reveal')
    // Kept short: the last card used to wait 330ms and then take 700ms more, so
    // a click took over a second to settle.
    el.style.transitionDelay = Math.min(i*35,140)+'ms'
    if(obs){ obs.observe(el) }
    else { el.classList.add('in') }
  })
}
document.addEventListener('DOMContentLoaded', revealInit)
// Run immediately in case DOM is already parsed
if(document.readyState!=='loading') revealInit()

/* ── PREMIUM-MINIMAL: scroll-aware sticky nav ── */
function _syncNavShadow(){
  const nav=document.querySelector('.top-bar')
  if(nav) nav.classList.toggle('scrolled', window.scrollY>6)
}

// Which section pill is currently marked, so the strip is only re-centred
// when that changes rather than on every scroll event.
let _lastNavTab=-1

/* Scroll work is batched to one pass per frame, and the section spy only runs
   on pages that have its tabs. It used to run on every scroll event on every
   page, reading seven section offsets and re-adding `active` to each tab,
   which cost a style recalculation per event even when nothing had changed. */
let _navScrollQueued=false
window.addEventListener('scroll',()=>{
  if(_navScrollQueued)return
  _navScrollQueued=true
  requestAnimationFrame(_navScrollFrame)
}, { passive: true })
/* The seven section offsets, read once and kept until something could have moved
   them. Reading offsetTop on every scroll frame cost more than everything else
   the handler does; the sections only move when the form itself changes size
   (typing grows a textarea, a conditional field appears) or the window does. */
const _NAV_SECTION_IDS=['sec-header','sec-moi','sec-hpi','sec-pmh','sec-ace','sec-dx','sec-plan']
let _navTops=null, _navTopsObserver=null
function _navSectionTops(){
  if(_navTops)return _navTops
  _navTops=_NAV_SECTION_IDS.map(id=>{const el=document.getElementById(id);return el?el.offsetTop:null})
  if(!_navTopsObserver&&typeof ResizeObserver==='function'){
    _navTopsObserver=new ResizeObserver(()=>{_navTops=null})
    _navTopsObserver.observe(document.body)
    _NAV_SECTION_IDS.forEach(id=>{const el=document.getElementById(id);if(el)_navTopsObserver.observe(el)})
  }
  if(!_navTopsObserver)setTimeout(()=>{_navTops=null},250)   // no ResizeObserver: just refresh often
  return _navTops
}
window.addEventListener('resize',()=>{_navTops=null})
function _navScrollFrame(){
  _navScrollQueued=false
  _syncNavShadow()
  if(!document.body.classList.contains('topbar-has-tabs'))return
  const tabs=document.querySelectorAll('.tab')
  let cur=0
  /* How far down the viewport counts as "you are reading this section". On a
     phone the tab strip sits below the bar, so a heading is already hidden
     behind ~104px of chrome by the time it reaches the top of the window
     mark it current before it disappears, not after. */
  const chrome=(window.innerWidth<=760)?124:80
  _navSectionTops().forEach((top,i)=>{if(top!==null&&window.scrollY>=top-chrome)cur=i})
  // Only touch the classes when the marked tab actually changes.
  tabs.forEach((t,i)=>{ if((i===cur)!==t.classList.contains('active'))t.classList.toggle('active',i===cur) })

  /* On a narrow screen the strip scrolls sideways and only two or three pills
     are in view, so the one marking the section you are actually reading is
     usually off the end of it. Bring it back to the middle - but only when it
     changes, not on every frame of a scroll. */
  if(cur!==_lastNavTab){
    _lastNavTab=cur
    const strip=document.getElementById('day1Tabs'), t=tabs[cur]
    if(strip&&t&&strip.scrollWidth>strip.clientWidth+1){
      const tr=t.getBoundingClientRect(), sr=strip.getBoundingClientRect()
      strip.scrollBy({left:(tr.left-sr.left)-(sr.width-tr.width)/2, behavior:'smooth'})
    }
  }
}

// ── PDF EXPORT ──
function exportPDF(clickedBtn){
  const name=document.getElementById('ptName').value.trim()
  if(!name){showToast('Please enter patient name first','err');return}
  const btn=clickedBtn||document.getElementById('exportBtn')
  btn.innerHTML='<span class="spinner"></span>Building...'
  btn.disabled=true
  setTimeout(()=>{
    try{buildPDF(name)}
    catch(e){showToast('PDF error: '+e.message,'err');console.error(e)}
    finally{if(btn){btn.innerHTML='⬇ Download Day 1';btn.disabled=false}}
  },50)
}

function gv(id){return document.getElementById(id)?.value||'—'}
/* The selected option's text, or an em dash when nothing is chosen. It used
   to return the label whatever it was, so a select left on its placeholder
   put the word 'Select' into the finished report. A placeholder is the one
   option with an empty value, which is what tells it from a real answer. */
function go(id){
  const el=document.getElementById(id)
  if(!el) return '—'
  const opt=el.options[el.selectedIndex]
  if(!opt || !opt.value) return '—'
  return opt.text || '—'
}
function chkTxt(el){return el.textContent.replace('✓','').trim()}
function pron(gender){
  if(gender==='Male')return{subj:'he',poss:'his',obj:'him'}
  if(gender==='Female')return{subj:'she',poss:'her',obj:'her'}
  return{subj:'they',poss:'their',obj:'them'}
}
function collectAll(containerId,items){
  const out=[]
  document.querySelectorAll('#'+containerId+' .yn-row').forEach((row,i)=>{
    // Key off the row's own question, not its index: these lists can contain
    // injected non-question rows (the PMH Language picker), which used to
    // shift every answer after it onto the wrong label in the PDF.
    const item=row.dataset.item
    if(!item)return
    const activeBtn=row.querySelector('.yn-btn.active')
    let ans=activeBtn?activeBtn.textContent.trim():'N/A'
    const cmt=row.querySelector('.yn-comment-input')?.value?.trim()
    // Printed with the answer it was written under; the pregnancy follow-up is Yes-only.
    const structured=!!row.querySelector('.yn-comment-structured')
    if(cmt&&(ans==='Yes'||(ans==='No'&&!structured)))ans+=' — '+cmt
    out.push([item,ans])
  })
  return out
}

function buildPDF(name,opts){
  const doi=gv('doi'),dos=gv('dos'),dob=gv('ptDOB'),age=gv('ptAge')
  const injType=gv('injuryType'),doiEv=gv('doi'),jur=gv('jurisdiction')
  const jurClause=(jur&&jur!=='—')?[{t:' in '},{t:jur,b:true}]:[]
  const aceScore=document.getElementById('scoreTotalBig').textContent
  let reporterVal=go('reporter')
  if(document.getElementById('reporter').value&&document.getElementById('reporter').value!=='Patient'&&gv('reporterOther')!=='—'&&gv('reporterOther').trim())reporterVal+=' — '+gv('reporterOther')
  const pn=pron(go('ptGender'))

  const risks=[...document.querySelectorAll('#riskFactorsList label.checked')].map(chkTxt)
  const dxCodes=[...document.querySelectorAll('#icdGrid .icd-item.checked')].map(el=>({code:el.querySelector('.icd-code').textContent,desc:el.querySelector('.icd-desc').textContent}))
  const immedExp=[...document.querySelectorAll('#immedExperienceList label.checked')].map(chkTxt)
  const earlySigns=[...document.querySelectorAll('#earlySignsList label.checked')].map(chkTxt)
  const assessRisks=[...document.querySelectorAll('#assessRiskList label.checked')].map(chkTxt)
  const refTypes=[...document.querySelectorAll('#referralTypeList label.checked')].map(chkTxt)

  const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'letter'})
  // HEAD_TOP: where the text starts on every page, below the letterhead.
  const PW=612,PH=792,ML=48,MR=48,TW=612-ML-MR,HEAD_TOP=120,pageUsable=PH-HEAD_TOP-48
  let y=HEAD_TOP

  const f=(style,sz)=>{doc.setFont('times',style);doc.setFontSize(sz)}
  const col=(r,g,b)=>doc.setTextColor(r,g,b)
  const fc=(r,g,b)=>doc.setFillColor(r,g,b)
  const lc=(r,g,b)=>doc.setDrawColor(r,g,b)
  const tx=(t,x,yy,o)=>doc.text(t,x,yy,o)
  const wrap=(t,w)=>doc.splitTextToSize(t,w)
  const newPage=()=>{doc.addPage();drawLetterhead();y=HEAD_TOP}
  /* opts.record: an array that receives what the report says, block by block
     (headings, lines, tables, boxes), as it is drawn - the Word download
     (day1-docx.js) is written from it, so both files always say the same. */
  const REC=(opts&&Array.isArray(opts.record))?opts.record:null
  const rec=b=>{if(REC)REC.push(b)}
  const needPage=(n=30)=>{if(y+n>PH-48)newPage()}

  /* The practice's report layout, as on the Day 2 exam PDF: the letterhead on
     every page, the patient box and provider on page 1, and the footer with page
     numbers (added once the page count is known, at the end). Blanks stay blank:
     the PDF font has no em dash. */
  const real=v=>{const t=String(v==null?'':v).trim();return t&&t!=='\u2014'?t:''}
  const provider=[real(gv('completedBy')),real(gv('completedByCred'))].filter(Boolean).join(', ')
  function drawLetterhead(){
    col(0,0,0)
    f('bold',12);tx('CONCUSSION THERAPY GROUP',ML,90)
    f('normal',11)
    const rx=PW-MR
    tx('2411 Crofton Lane, Suite 13A',rx,52,{align:'right'})
    tx('Crofton, MD, 21114-1336',rx,68,{align:'right'})
    tx('Phone: 410-451-9870',rx,84,{align:'right'})
    tx('Fax: 410-451-9872',rx,100,{align:'right'})
  }
  function drawPatientBox(){
    const top=106,rowH=21,half=TW/2
    lc(0,0,0);doc.setLineWidth(0.9)
    doc.rect(ML,top,TW,rowH*2)
    doc.line(ML,top+rowH,ML+TW,top+rowH)
    doc.line(ML+half,top,ML+half,top+rowH*2)
    const cell=(label,value,x,yy)=>{f('bold',12);tx(label,x,yy);const w=doc.getTextWidth(label);f('normal',12);tx(real(value),x+w,yy)}
    cell('Name: ',name,ML+5,top+14)
    cell('DOB: ',dob,ML+half+5,top+14)
    cell('DOI: ',doi,ML+5,top+rowH+14)
    cell('Session Date: ',dos,ML+half+5,top+rowH+14)
    cell('Provider: ',provider,ML,top+rowH*2+15)
    if(REC)REC.meta={name:real(name),dob:real(dob),doi:real(doi),dos:real(dos),provider:provider}
    y=top+rowH*2+24
  }
  function drawFooters(){
    const total=doc.internal.getNumberOfPages()
    const left=['Concussion Therapy Group',provider,real(name),real(dob)].filter(Boolean).join(' / ')
    for(let i=1;i<=total;i++){
      doc.setPage(i);f('normal',8);col(0,0,0)
      const pageText='Page '+i+' of '+total
      const maxW=TW-doc.getTextWidth(pageText)-18
      let l=left
      while(doc.getTextWidth(l)>maxW&&l.length>12)l=l.slice(0,-1)
      tx(l===left?l:l+'...',ML,PH-20)
      tx(pageText,PW-MR,PH-20,{align:'right'})
    }
  }

  function linkLine(url){
    if(!url||url==='—')return
    rec({k:'link',url:url})
    needPage(18)
    f('italic',12);doc.setTextColor(0,0,200)
    tx(url,ML,y)
    const lw=doc.getTextWidth(url)
    doc.link(ML,y-11,lw,14,{url:url})
    doc.setTextColor(0,0,0)
    y+=18
  }

  const segStyle=(seg)=>seg.b&&seg.i?'bolditalic':seg.b?'bold':seg.i?'italic':'normal'

  function wrapSegs(segs,w,sz){
    sz=sz||12
    const tokens=[]
    segs.forEach(seg=>seg.t.split(/(\s+)/).filter(p=>p!=='').forEach(p=>tokens.push({t:p,b:seg.b,i:seg.i})))
    const lines=[]
    let line=[],lineW=0
    tokens.forEach(tok=>{
      f(segStyle(tok),sz)
      const tw=doc.getTextWidth(tok.t)
      const isSpace=/^\s+$/.test(tok.t)
      if(isSpace&&line.length===0)return
      if(!isSpace&&lineW+tw>w&&line.length>0){
        while(line.length&&/^\s+$/.test(line[line.length-1].t))line.pop()
        lines.push(line);line=[];lineW=0
      }
      line.push(tok);lineW+=tw
    })
    while(line.length&&/^\s+$/.test(line[line.length-1].t))line.pop()
    if(line.length)lines.push(line)
    return lines.map(ln=>{
      const merged=[]
      ln.forEach(tok=>{
        if(merged.length&&merged[merged.length-1].b===tok.b&&merged[merged.length-1].i===tok.i)merged[merged.length-1].t+=tok.t
        else merged.push({t:tok.t,b:tok.b,i:tok.i})
      })
      return merged
    })
  }

  function H1(text,trailing){
    rec({k:'h1',t:text,trail:trailing||''})
    needPage(50)
    y+=12
    f('bold',12);col(0,0,0);lc(0,0,0)
    const trailW=trailing?(doc.getTextWidth('   '+trailing)+4):0
    const lines=doc.splitTextToSize(text,TW-trailW)
    lines.forEach((line,idx)=>{
      needPage(20)
      tx(line,ML,y)
      const lw=doc.getTextWidth(line)
      doc.setLineWidth(0.75);doc.line(ML,y+2,ML+lw,y+2)
      if(idx===lines.length-1&&trailing){f('normal',12);tx('   '+trailing,ML+lw,y);f('bold',12)}
      y+=idx<lines.length-1?16:22
    })
  }

  function H2(text,underline){
    rec({k:'h2',t:text,u:!!underline})
    needPage(30)
    y+=4
    f('bold',12);col(0,0,0);lc(0,0,0)
    const h2lines=doc.splitTextToSize(text,TW)
    h2lines.forEach((line,idx)=>{
      needPage(16)
      tx(line,ML,y)
      if(underline){const w=doc.getTextWidth(line);doc.setLineWidth(0.75);doc.line(ML,y+2,ML+w,y+2)}
      y+=idx<h2lines.length-1?14:16
    })
  }

  function para(segs){
    if(typeof segs==='string')segs=[{t:segs}]
    else segs=segs.map(s=>typeof s==='string'?{t:s}:s)
    rec({k:'p',segs:segs})
    const lines=wrapSegs(segs,TW)
    needPage(42)
    col(0,0,0)
    lines.forEach(line=>{
      needPage(14)
      let cx=ML
      line.forEach(seg=>{f(segStyle(seg),12);tx(seg.t,cx,y);cx+=doc.getTextWidth(seg.t)})
      y+=14
    })
    y+=6
  }

  /* Nothing was chosen: an empty value, the em-dash placeholder, or a select
     still sitting on its " - Select - " option. */
  function isUnanswered(value){
    const v = value==null ? '' : String(value).trim()
    return !v || v==='—' || /^—?\s*select/i.test(v)
  }
  /* A TABLE keeps the row and prints N/A. Dropping a cell would break the
     column alignment and leave the reader unable to tell a question that was
     not answered from one that was never asked - the opposite of the prose
     lines below, where a whole "Label: - " line is just noise. */
  function naCell(value){ return isUnanswered(value) ? 'N/A' : String(value).trim() }

  /* An unanswered field is left OUT of the report rather than printed with a
     dash. A line of questions answered " - " is noise in a document that goes
     to a law firm, and it reads as though the clinician skipped things rather
     than that the question did not apply. */
  function kvLine(label,value){
    if(isUnanswered(value)) return
    const segs=[{t:label+': ',b:true},{t:String(value).trim()}]
    rec({k:'p',segs:segs})
    const lines=wrapSegs(segs,TW)
    needPage(Math.min(lines.length*14,pageUsable))
    col(0,0,0)
    lines.forEach(line=>{
      needPage(14)
      let cx=ML
      line.forEach(seg=>{f(segStyle(seg),12);tx(seg.t,cx,y);cx+=doc.getTextWidth(seg.t)})
      y+=14
    })
    y+=2
  }

  function parseRich(text){
    if(!text||text==='—')return [{t:'—'}]
    const segs=[]
    text.split(/(\([A-Z][^)]*\))/g).forEach(part=>{
      if(!part)return
      segs.push(/^\([A-Z]/.test(part)?{t:part,b:true}:{t:part})
    })
    return segs.length?segs:[{t:text}]
  }
  function kvRich(label,text){
    const segs=[{t:label+': ',b:true},...parseRich(text||'—')]
    rec({k:'p',segs:segs})
    const lines=wrapSegs(segs,TW)
    needPage(Math.min(lines.length*14,42))
    col(0,0,0)
    lines.forEach(line=>{
      needPage(14)
      let cx=ML
      line.forEach(seg=>{f(segStyle(seg),12);tx(seg.t,cx,y);cx+=doc.getTextWidth(seg.t)})
      y+=14
    })
    y+=2
  }

  function boxedField(blocks){
    rec({k:'box',paras:blocks})
    let allLines=[]
    blocks.forEach(segs=>wrapSegs(segs,TW-16).forEach(l=>allLines.push(l)))
    if(allLines.length===0)allLines=[[{t:' '}]]
    const h=allLines.length*14+10
    needPage(Math.min(h+8,pageUsable))
    const startY=y
    col(0,0,0)
    let yy=startY+14
    allLines.forEach(line=>{
      let cx=ML+8
      line.forEach(seg=>{f(segStyle(seg),12);tx(seg.t,cx,yy);cx+=doc.getTextWidth(seg.t)})
      yy+=14
    })
    lc(0,0,0);doc.setLineWidth(0.75)
    doc.rect(ML,startY,TW,h)
    y=startY+h+8
  }

  function redFlagBox(){
    const staticText='Refer to the emergency department with sudden onset of any of the following: headaches that worsen, looks very drowsy or can\'t be awakened, cannot recognize people or places, increasing confusion or irritability, repeated vomiting, slurred speech, unsteadiness on feet, weakness or numbness in arms or legs, seizures or convulsions, less responsive than usual, neck pain, double vision, focal neurologic signs, change in state of consciousness.'
    let fullText=staticText+'  Red Flag Screening: '+go('redFlagStatus')
    if(gv('redFlagNotes')!=='—')fullText+='  Notes: '+gv('redFlagNotes')
    rec({k:'box',red:true,paras:[[{t:fullText}]]})
    f('normal',9)
    const lines=wrap(fullText,TW-16)
    const h=lines.length*12+10
    needPage(Math.min(h+8,pageUsable))
    col(190,0,0);lc(190,0,0);doc.setLineWidth(0.75)
    doc.rect(ML,y,TW,h)
    let yy=y+12
    lines.forEach(l=>{tx(l,ML+8,yy);yy+=12})
    col(0,0,0);lc(0,0,0)
    y+=h+8
  }

  function symptomTable(title,items,containerId){
    const tableX=ML,tableW=TW
    const colW=tableW*0.80,scoreColW=tableW-colW,rowH=17
    const scoreX=tableX+colW+scoreColW/2
    const els=document.querySelectorAll('#'+containerId+' .sym-score-item')
    let total=0
    const scores=items.map((label,i)=>{
      const item=els[i]
      const scored=item?item.querySelector('.sym-btn.active[data-val="1"]'):null
      const val=scored?1:0;total+=val;return val
    })
    rec({k:'table',widths:[80,20],rows:[{b:true,c:[title,'Score (0/1)']}]
      .concat(items.map((label,i)=>({c:[label,String(scores[i])]})))
      .concat([{b:true,c:[title.split(' ')[0]+' Total (0-'+items.length+')',String(total)]}])})
    const h=rowH*(items.length+2)
    needPage(Math.min(h+6,pageUsable))
    lc(0,0,0);doc.setLineWidth(0.5);col(0,0,0)
    f('bold',9)
    doc.rect(tableX,y,colW,rowH);doc.rect(tableX+colW,y,scoreColW,rowH)
    tx(title,tableX+7,y+12);tx('Score (0/1)',scoreX,y+12,{align:'center'})
    y+=rowH
    f('normal',9)
    items.forEach((label,i)=>{
      doc.rect(tableX,y,colW,rowH);doc.rect(tableX+colW,y,scoreColW,rowH)
      tx(label,tableX+7,y+12);tx(String(scores[i]),scoreX,y+12,{align:'center'})
      y+=rowH
    })
    f('bold',9)
    doc.rect(tableX,y,colW,rowH);doc.rect(tableX+colW,y,scoreColW,rowH)
    tx(title.split(' ')[0]+' Total (0-'+items.length+')',tableX+7,y+12)
    tx(String(total),scoreX,y+12,{align:'center'})
    y+=rowH+12;return total
  }

  function quadTable(columns){
    const tableX=ML,tableW=TW
    const colW=tableW/columns.length,lineH=13,sz=8,pad=6
    rec({k:'cols',cols:columns.map(c=>[[{t:c.header,b:true}]].concat(c.rows.map(([label,val])=>[{t:label+': '},{t:naCell(val),b:true}])))})
    const colLines=columns.map(c=>{
      const out=[]
      wrapSegs([{t:c.header,b:true}],colW-pad*2,sz).forEach(l=>out.push(l))
      c.rows.forEach(([label,val])=>{
        wrapSegs([{t:label+': ',b:false},{t:naCell(val),b:true}],colW-pad*2,sz).forEach(l=>out.push(l))
      })
      return out
    })
    const maxLines=Math.max(...colLines.map(c=>c.length))
    const h=maxLines*lineH+pad*2
    needPage(Math.min(h+12,pageUsable))
    const startY=y
    lc(0,0,0);doc.setLineWidth(0.5);col(0,0,0)
    columns.forEach((c,i)=>doc.rect(tableX+i*colW,startY,colW,h))
    colLines.forEach((lines,ci)=>{
      let yy=startY+lineH
      lines.forEach(line=>{
        let cx=tableX+ci*colW+pad
        line.forEach(seg=>{f(segStyle(seg),sz);tx(seg.t,cx,yy);cx+=doc.getTextWidth(seg.t)})
        yy+=lineH
      })
    })
    y=startY+h+12
  }

  function icdChecklistRow(code,desc,checked){
    const text='('+code+') '+desc
    f('normal',9);col(0,0,0);lc(0,0,0);doc.setLineWidth(0.75)
    const lines=wrap(text,TW-20)
    needPage(Math.min(lines.length*12+2,pageUsable))
    if(checked){fc(0,0,0);doc.rect(ML+2,y-7,7,7,'FD')}
    else doc.rect(ML+2,y-7,7,7,'S')
    lines.forEach(l=>{tx(l,ML+16,y);y+=12})
    y+=1
  }

  // ── RENDER ──
  col(0,0,0)
  drawLetterhead()
  drawPatientBox()

  H1('INITIAL DATE OF SERVICE',dos)
  H1('ACUTE CONCUSSION EVALUATION (ACE)')
  para([
    {t:'Today the patient, '},{t:name,b:true},{t:', DOB: '},{t:dob,b:true},{t:' AGE: '},{t:age,b:true},
    {t:', was administered the Acute Concussion Evaluation (ACE) screening questionnaire as part of an initial assessment for possible injuries sustained in a '},
    {t:injType,b:true},{t:' on '},{t:doiEv,b:true},...jurClause,
    {t:'. The Acute Concussion Evaluation is the United States Centers for Disease Control and Prevention (CDC) standard initial assessment in the diagnosis pathway for acute (72 hours or less post-injury) traumatic brain injury concussion. The ACE contains similar questions to the post-concussion standard instrument questionnaire named The Rivermead Post-Concussion Symptoms Questionnaire, and is therefore used herein to establish indications for further neurocognitive and vestibular examination for both Acute and Post-Acute TBI symptoms. The '},
    {t:reporterVal,b:true},
    {t:' has signed a consent document. The findings of this summary report are based on observation and responses to written and verbal questioning of the patient.'}
  ])

  H1('NEUROCOGNITIVE AND VESTIBULAR EXAMINATION REPORT')
  H2('Definition of Concussion from The United States Centers for Disease Control and Prevention (CDC):')
  para(['"A concussion is a type of traumatic brain injury—or TBI—caused by a bump, blow, or jolt to the head or by a hit to the body that causes the head and brain to move rapidly back and forth. This sudden movement can cause the brain to bounce around or twist in the skull, creating chemical changes in the brain and sometimes stretching and damaging brain cells."'])
  H2('United States Centers for Disease Control and Prevention (CDC) Guidelines for Concussion Evaluation and Treatment:')
  linkLine('https://www.cdc.gov/headsup/basics/concussion_whatis.html')
  H2('Traumatic Brain Injury Explanation:')
  linkLine('https://www.hopkinsmedicine.org/health/conditions-and-diseases/traumatic-brain-injury')
  para([{t:'Note: ',b:true},{t:'Concussion can be defined as a traumatic brain injury (TBI) without a brain bleed, and without imaging findings on conventional MRI or CT. The constellation of cognitive, vestibular and emotional effects observed in concussion are due to the release of pro-inflammatory molecules from glial cells in the brain\'s white matter (neuroinflammation) when they twist, stretch, or strike the interior of the skull.'}])
  para(['This report documents concussion-associated effects demonstrated by the patient.'])
  H2('Significance of Second Head Impact on Concussion Severity')
  para([{t:'Second Head Impact Statement: ',b:true},{t:'"A second concussion soon after the first one does not have to be very strong for its effects to be permanently disabling."',i:true}])
  linkLine('https://www.aans.org/en/Patients/Neurosurgical-Conditions-and-Treatments/Concussion')
  para([{t:'American Association of Neurological Surgeons.',b:true}])
  linkLine('https://www.aans.org/en/Patients/Neurosurgical-Conditions-and-Treatments/Concussion')

  H1('Glossary: Terms and Abbreviations')
  H2('United States Centers for Disease Control and Prevention (CDC) Guidelines for Concussion Evaluation and Treatment:')
  linkLine('https://www.cdc.gov/headsup/basics/concussion_whatis.html')
  kvLine('Injury Incident','All collisions, impacts, injuries and other events that occurred at the scene of the injury just prior to and soon after the injury event will be referred to as the injury incident.')
  kvLine('MVC','MVC is the abbreviation for motor vehicle collision.')
  kvLine('Note','MVC description refers to a windshield facing driver seated on his/her left hand side of the car.')
  kvLine('Impact Event','The time period of potentially injurious body movements beginning at moment of impact.')
  kvLine('Coup','the first brain movement during head injury event.')
  kvLine('Contre Coup','the second brain movement during head injury event.')
  kvLine('Coup/Contre Coup Explanation','https://www.ncbi.nlm.nih.gov/books/NBK536965/')
  kvLine('Note','The numbering of motor vehicle impacts, stationary object impacts, head impacts and body impacts is not necessarily in chronological order of occurrence, but is intended to add a name and an identity to a separate event, so that the reader can more clearly distinguish one entity of the injury incident from another.')
  kvRich('Unit 1','The patient\'s vehicle may be referred to in the report as (Unit 1), and any other vehicles involved are designated as (Unit 2), (Unit 3), and so on.')
  kvRich('MVC 1','In order to identify and distinguish between any multiple motor vehicle collisions that are included in the entire set of collision events comprising the entire entity of the incident of injury, the separate motor vehicle collisions will be identified as (MVC 1), (MVC 2), (MVC 3), and so on.')
  kvRich('Direct/Indirect Head Impacts','Head impacts will be identified as either Direct Head Impacts (DHI) or Indirect Head Impacts (IHI).')
  kvLine('Note on Indirect Head Impacts','Indirect Head Impacts are associated with head jolts experienced immediately following coup (first forceful movement caused by collision) and/or contre coup (second forceful movement caused by collision, a rebounding movement) movements of the head. Head jolts are associated with brain impact to the interior of the skull and/or twisting and stretching of brain tissue resulting in concussion symptoms.')
  kvRich('DHI 1','Direct Head Impacts will be identified as (DHI 1), (DHI 2), (DHI 3), and so on.')
  kvRich('IHI 1','Indirect Head Impacts will be identified as (IHI 1), (IHI 2), (IHI 3), and so on.')
  kvRich('SOC 1','Stationary object collisions will similarly be identified as Stationary Object Collision (SOC 1), (SOC 2), (SOC 3), and so on.')

  H1('MECHANISM OF INJURY')
  // A record with an MOI story prints the story; older and signed records print as before.
  const __moiStory=(window.ctgMoiStory&&window.ctgMoiStory.paragraphs)?window.ctgMoiStory.paragraphs({name,doi:doiEv,pn}):null
  if(__moiStory){__moiStory.forEach(seg=>para(seg))}else{
  // Collapsed to flowing single-spaced text: the wrap/measure logic below
  // expects one continuous run per segment, and a pasted multi-line/multi-
  // paragraph description otherwise breaks its line-position math (lines
  // rendering stacked on top of each other instead of spaced out).
  const noVehicleText=itSelected==='No Vehicle Involved'?(document.getElementById('moiNoVehicleText')?.value||'').replace(/\s+/g,' ').trim():''
  if(noVehicleText){
    const noVehicleSentence=noVehicleText.replace(/\.+$/,'')
    para([{t:'On '},{t:doiEv,b:true},{t:', '},{t:name,b:true},{t:' was injured when '},{t:noVehicleSentence},{t:'.'}])
  }else{
    const ptRole=gv('ptRole'),u1=gv('unit1Type'),strikeDirV=gv('strikeDir'),u2=gv('unit2Type')
    para([
      {t:'On '},{t:doiEv,b:true},{t:', '},{t:name,b:true},{t:' was the '},{t:ptRole,b:true},{t:' of a '},{t:u1,b:true},
      {t:' that was struck on the '},{t:strikeDirV,b:true},{t:' (MVC 1) by a '},{t:u2,b:true},{t:' (Unit 2).'}
    ])
  }
  const skip=(id)=>{const v=gv(id);return v==='—'||v===''||v==='N/A'||v==='None'||v==='n/a'}
  if(!noVehicleText&&!skip('unit3Type')){
    const segs=[
      {t:'Additionally, '},{t:name,b:true},{t:"'s vehicle (Unit 1) was struck on the "},{t:gv('strikeDir2'),b:true},{t:' (MVC 2)'}
    ]
    if(!skip('strikeDir3')){segs.push({t:' and on the '});segs.push({t:gv('strikeDir3'),b:true});segs.push({t:' (MVC 3)'})}
    segs.push({t:' by a '});segs.push({t:gv('unit3Type'),b:true});segs.push({t:' (Unit 3).'})
    para(segs)
  }
  if(!noVehicleText)para([
    {t:'Following impact, '},{t:name,b:true},{t:"'s "},{t:gv('dhi1'),b:true},{t:' (DHI 1). '},
    {t:name,b:true},{t:"'s "},{t:gv('ihi1'),b:true},{t:' (IHI 1).'}
  ])
  if(!noVehicleText){
    const expTxt=immedExp.length>0?immedExp.join(', '):gv('immediateSyms')
    para([{t:'In the aftermath of the collision, '},{t:name,b:true},{t:' experienced '},{t:expTxt,b:true},{t:'.'}])
  }
  if(!noVehicleText){
    const erVal=document.getElementById('erVisit').value
    if(erVal==='Other'){
      if(!skip('erVisitOther'))para([{t:gv('erVisitOther')}])
    }else if(erVal.indexOf('Yes')===0){
      para([{t:name,b:true},{t:' went to the ED at '},{t:go('hospitalAdmitted'),b:true},{t:' where '},{t:pn.subj},{t:' was examined and discharged.'}])
    }else{
      para([{t:name,b:true},{t:' did not seek emergency department care following the incident.'}])
    }
  }
  if(!noVehicleText)para([{t:'Since the date of the injury incident, '},{t:name,b:true},{t:"'s symptoms have increased, and "},{t:pn.poss},{t:' quality of life has decreased.'}])
  {
    const hasDir=!skip('vehicleDirection'),hasTraf=!skip('trafficType')
    if(!noVehicleText&&(hasDir||hasTraf)){
      const parts=[]
      if(hasDir)parts.push({t:name,b:true},{t:"'s vehicle (Unit 1) was "},{t:go('vehicleDirection'),b:true})
      if(hasTraf&&hasDir)parts.push({t:' at the time of the incident, which was classified as a '},{t:go('trafficType'),b:true},{t:'.'})
      else if(hasTraf)parts.push({t:'The incident was classified as a '},{t:go('trafficType'),b:true},{t:'.'})
      else parts.push({t:' at the time of the incident.'})
      para(parts)
    }
    if(!noVehicleText&&!skip('otherPostTx'))para([{t:'Following the injury incident, '},{t:name,b:true},{t:' received the following additional treatment: '},{t:gv('otherPostTx'),b:false},{t:'.'}])
    if(!noVehicleText&&!skip('moiDx'))para([{t:'Mechanism of injury ICD-10 diagnosis codes: '},{t:gv('moiDx'),b:true},{t:'.'}])
  }

  }
  H1('HISTORY OF PRESENT ILLNESS (HPI)')
  kvLine('Chief Complaint',gv('immediateSyms'))
  collectAll('hpiList',HPI_ITEMS).filter(([,ans])=>ans!=='N/A').forEach(([item,ans])=>kvLine(item,ans))
  kvLine('Activity of Daily Living (ADL) Limitations',go('adlLimit'))
  kvLine('Vision Problems',(window.ctgXq?ctgXq('xq_visionProblems'):''))
  kvLine('Employment Status',go('employStatus'))
  kvLine('Patient Goals',gv('ptGoals'))
  kvLine('Risk Factors for Injury Severity and Prolonged Recovery',risks.length>0?risks.join(', '):'None reported')

  H1('PAST MEDICAL HISTORY (PMH)')
  const pmhItems=collectAll('pmhList',PMH_ITEMS)
    .map(([item,ans])=>PMH_YES_ONLY.has(item)?[item,pregnancyReportAnswer(ans)]:[item,ans])
    .filter(([item,ans])=>{
      if(ans==='N/A')return false
      if(PMH_YES_ONLY.has(item))return !!ans
      return true
    })
  pmhItems.forEach(([item,ans],idx)=>{
    kvLine(item,ans)
    if(idx===0){
      const lang=gv('languageField')
      if(lang){
        const segs=[{t:'Language: ',b:true},{t:lang,u:true}]
        rec({k:'p',segs:segs})
        const lines=wrapSegs(segs,TW)
        needPage(Math.min(lines.length*14,pageUsable))
        col(0,0,0)
        lines.forEach(line=>{
          needPage(14)
          let cx=ML
          line.forEach(seg=>{
            f(segStyle(seg),12)
            tx(seg.t,cx,y)
            if(seg.u){
              const w=doc.getTextWidth(seg.t)
              lc(0,0,0)
              doc.setLineWidth(0.75)
              doc.line(cx,y+2,cx+w,y+2)
            }
            cx+=doc.getTextWidth(seg.t)
          })
          y+=14
        })
        y+=2
      }
    }
  })

  kvLine('Native Country/Region',(window.ctgXq?ctgXq('xq_nativeCountry'):''))
  kvLine('Residual Effects of Concussion',(window.ctgXq?ctgXq('xq_residualConc'):''))
  kvLine('Previous Concussions Resulting in',(window.ctgXq?ctgXq('xq_prevConcResult'):''))
  kvLine('Loss of Consciousness (previous concussions)',(window.ctgXq?ctgXq('xq_priorLoc'):''))
  kvLine('Other Significant Medical History',(window.ctgXq?ctgXq('xq_otherMedHx'):''))

  H1('SOCIAL HISTORY')
  kvLine('Job Duties',gv('jobDuties'))
  kvLine('Employment Status',go('employStatus'))
  kvLine('Social Habits',(window.ctgXq?ctgXq('xq_socialHabits'):'')||'None')
  kvLine('Diet and Nutrition',go('diet'))
  kvLine('Exercise Habits',go('exercise'))

  H1('FAMILY HISTORY')
  kvLine('Family History',(window.ctgXq?ctgXq('xq_familyHistory'):'')||'non-contributory')

  H1('SUMMARY OF MOTOR VEHICLE COLLISIONS (MVC), STATIONARY OBJECT COLLISIONS (SOC), DIRECT HEAD IMPACTS (DHI), INDIRECT HEAD IMPACTS (IHI)')
  H2('MOTOR VEHICLE COLLISIONS:')
  H2('COLLISIONS TO UNIT 1',true)
  kvLine('Total MVCs',go('totalMVC'))
  kvLine('Total SOCs',go('totalSOC'))
  {const mvcN=parseInt(go('totalMVC')),socN=parseInt(go('totalSOC'));kvLine('Total Collisions to Unit 1',(isNaN(mvcN)||isNaN(socN))?(go('totalMVC')+' / '+go('totalSOC')):String(mvcN+socN))}
  H2('HEAD IMPACTS:',true)
  kvLine('Head Impacts',[(window.ctgXq?ctgXq('xq_headImpacts'):''),(window.ctgXqText?ctgXqText('xq_headImpactsText'):'')].filter(Boolean).join('. '))
  kvLine('IHI 1',gv('ihi1'))
  kvLine('IHI 2',gv('ihi2'))
  kvLine('DHI 1',gv('dhi1'))
  kvLine('DHI 2',gv('dhi2'))
  {const dhiN=parseInt(go('totalDHI')),ihiN=parseInt(go('totalIHI'));kvLine('Total Head Impacts',(isNaN(dhiN)||isNaN(ihiN))?(go('totalDHI')+' / '+go('totalIHI')):String(dhiN+ihiN))}

  H1('Acute Concussion Evaluation (ACE)')
  H2('A. Injury Characteristics')
  kvLine('Date of Injury',doi)
  kvLine('Reporter',reporterVal)
  kvLine('1. Injury Description (see above Mechanism of Injury)',injType)
  kvLine('1a. Is there evidence of a forcible blow to the head (direct or indirect)?',(()=>{const v=go('ace_blow'),c=(document.getElementById('ace_blow_comment')?.value||'').trim();return v==='Yes'&&c?v+', '+c:v})())
  kvLine('1b. Is there evidence of intracranial injury or skull fracture?',go('ace_icf'))
  kvLine('1c. Location of Impact',gv('ace_loc'))
  kvLine('Cause: MVC',go('assessCollisionType'))
  {
    let retroTxt=go('ace_retro')
    if(gv('ace_retro_dur')!=='—')retroTxt+=' — Duration: '+gv('ace_retro_dur')
    kvLine('1. Amnesia Before (Retrograde)',retroTxt)
    let anteroTxt=go('ace_antero')
    if(gv('ace_antero_dur')!=='—')anteroTxt+=' — Duration: '+gv('ace_antero_dur')
    kvLine('2. Amnesia After (Anterograde)',anteroTxt)
  }
  kvLine('3. Loss of Consciousness',(()=>{const v=go('ace_loc2'),d=(window.ctgXqText?ctgXqText('ace_loc_dur'):'');return d&&v!=='—'?v+' — Duration: '+d:v})())
  kvLine('EARLY SIGNS',earlySigns.length>0?earlySigns.join(', '):'None observed')
  {let seizTxt=go('ace_seiz');if(gv('ace_seiz_detail')!=='—')seizTxt+=' — '+gv('ace_seiz_detail');kvLine('Seizures observed?',seizTxt)}

  H2('B. Symptom Check List*')
  para([{t:'Since the injury, has the person experienced any of these symptoms any more than usual today or in the past day? Indicate presence of each symptom (0=No, 1=Yes). '},{t:'*Lovell & Collins, 1998 JHTR',b:true,i:true}])
  symptomTable('PHYSICAL (10)',ACE_PHYSICAL,'acePhysical')
  symptomTable('COGNITIVE (4)',ACE_COGNITIVE,'aceCognitive')
  symptomTable('SLEEP (4)',ACE_SLEEP,'aceSleep')
  symptomTable('EMOTIONAL (4)',ACE_EMOTIONAL,'aceEmotional')
  kvLine('Total Symptom Score (0-22)',aceScore)
  kvLine('Overall Rating (Normal 0 1 2 3 4 5 6 Different)',go('ace_rating'))
  kvLine('Exertion — Physical Activity',go('ace_physact'))
  kvLine('Exertion — Cognitive Activity',go('ace_cogact'))

  H2('C. Risk Factors for Protracted Recovery (Yes or No)')
  // An answer with its optional comment (day1-extras.js adds <id>_cmt), as "Yes — comment".
  const rc=(id,v)=>{const s=document.getElementById(id),c=document.getElementById(id+'_cmt');const t=c?c.value.trim():'';return t&&s&&s.value?v+' — '+t:v}
  quadTable([
    {header:'Concussion History? '+rc('rpr_priorConc',go('rpr_priorConc')),rows:[
      ['Previous #',rc('rpr_concNum',go('rpr_concNum'))],
      ['Longest symptom duration',rc('rpr_concDur',go('rpr_concDur'))],
      ['If multiple concussions, less force caused reinjury?',rc('rpr_reinjury',go('rpr_reinjury'))]
    ]},
    {header:'Headache History? '+rc('rpr_priorHA',go('rpr_priorHA')),rows:[
      ['Prior treatment for headache',rc('rpr_haTx',go('rpr_haTx'))],
      ['History of migraine headache',rc('rpr_migraine',go('rpr_migraine'))]
    ]},
    {header:'Developmental History',rows:[
      ['Learning disabilities',rc('rpr_learningDis',go('rpr_learningDis'))],
      ['Attention-Deficit/Hyperactivity Disorder',rc('rpr_adhd',go('rpr_adhd'))],
      ['Other developmental disorder',rc('rpr_otherDevYN',gv('rpr_otherDx')!=='—'?gv('rpr_otherDx'):go('rpr_otherDevYN'))]
    ]},
    {header:'Psychiatric History',rows:[
      ['Anxiety',rc('rpr_anxiety',go('rpr_anxiety'))],
      ['Depression',rc('rpr_depression',go('rpr_depression'))],
      ['Sleep disorder',rc('rpr_sleepDisorder',go('rpr_sleepDisorder'))],
      ['Other psychiatric disorder',rc('rpr_otherPsychYN',gv('rpr_otherPsychDx')!=='—'?gv('rpr_otherPsychDx'):go('rpr_otherPsychYN'))]
    ]}
  ])
  kvLine('List other comorbid medical disorders or medication usage',gv('rpr_comorbid')!=='—'?gv('rpr_comorbid'):'None')

  H2('D. RED FLAGS for acute emergency management')
  redFlagBox()

  H2('E. Diagnosis (ICD-10)')
  {
    if(dxCodes.length>0){
      dxCodes.forEach(d=>para([{t:'('+d.code+')  ',b:true},{t:d.desc}]))
    }else{
      para(['No diagnosis code selected'])
    }
  }

  H2('F. Follow-Up Action Plan')
  {
    const fBlocks=[
      [{t:'Complete '},{t:'ACE Care Plan',i:true},{t:' and provide copy to patient/family.'}],
      [{t:'Neurocognitive Examination and Vestibular Examination',i:true}]
    ]
    const followupVal=document.getElementById('followupPlan').value
    if(followupVal==='monitor'){let s='Follow-Up: '+go('followupPlan');if(gv('followupDate')!=='—')s+=' — Next follow-up date: '+gv('followupDate');fBlocks.push([{t:s}])}
    else if(followupVal==='referral'){const rTypes=[...refTypes];if(gv('referralOther')!=='—')rTypes.push('Other: '+gv('referralOther'));fBlocks.push([{t:'Referral: '+(rTypes.length>0?rTypes.join(', '):'—')}])}
    else if(followupVal==='none'){fBlocks.push([{t:'Follow-Up: No Follow-Up Needed'}])}
    boxedField(fBlocks)
  }

  newPage();rec({k:'pagebreak'})
  kvLine('ACE Completed by',gv('completedBy')+(gv('completedByCred')!=='—'?', '+gv('completedByCred'):''))
  y+=10
  H1('INDICATION FOR NEUROPSYCHOLOGICAL NEUROCOGNITIVE AND VESTIBULAR EXAMINATION')
  H2('Neuropsychologic and Vestibular Test Indication:')
  para([
    {t:'Acute Concussion Evaluation (ACE) score: ',b:true},{t:aceScore,b:true},
    {t:' out of a possible 22. According to United States Centers for Disease Control Guidelines based on an Acute Concussion Evaluation (ACE) score greater than or equal to 1, and history and examination findings of concussion-associated signs and symptoms a neurocognitive and vestibular examination is indicated. A neurocognitive and vestibular examination for concussion includes an examination of the vestibular system including brainstem, cerebellum and related cortical pathways, as well as neurocognitive function in order to assess the presence and severity of concussion, and to create a treatment plan. (Note: by definition a concussion is defined as direct or indirect traumatic brain injury without evidence of damage on common imaging studies, including CT scans and MRIs.) Full neurocognitive and vestibular examination may be conducted on today\'s date of service and/or on future dates of service.'}
  ])
  para([{t:'Peer-Reviewed Validation Research for Acute Concussion Evaluation (ACE):',b:true,i:true}])
  linkLine('https://pubmed.ncbi.nlm.nih.gov/18650767/')

  H1('ASSESSMENT')
  H2('Impression')
  para([getAceImpressionText()])
  if(!isAceNoFollowupSelected()){
    para([
      {t:'Risk Factors Associated with Increased Risk for Increased Severity, Prolonged Recovery and Long-Term Recurring Episodes of Neuroinflammation and Neuroinflammatory Symptoms: ',b:true},
      {t:assessRisks.length>0?assessRisks.join(', '):'None identified'}
    ])
  }

  H2('Diagnosis')
  if(dxCodes.length>0){
    dxCodes.forEach(d=>para([{t:'('+d.code+')  ',b:true},{t:d.desc}]))
  }else{
    para(['No diagnosis code selected'])
  }

  H2('Prognosis')
  {
    const progEl=document.getElementById('prognosis')
    let progTxt=progEl.options[progEl.selectedIndex].text
    progTxt=progTxt.replace(/PT Name/g,name).replace(/\btheirs\b/g,pn.poss).replace(/\btheir\b/g,pn.poss).replace(/\bthey\b/g,pn.subj)
    para([progTxt])
  }

  H2('Causation')
  para([{t:'Based on review of '},{t:name,b:true},{t:"'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between "},{t:pn.poss},{t:' injuries and the '},{t:injType,b:true},{t:' injury incident that occurred on '},{t:doi,b:true},{t:'.'}])

  H2('Medical Necessity')
  para([{t:'The care and treatment rendered to '},{t:name,b:true},{t:' has been medically necessary for the injuries sustained in the '},{t:injType,b:true},{t:' injury incident that occurred on '},{t:doi,b:true},{t:'.'}])

  H2('Reasonableness')
  para(['The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.'])

  // No-follow-up is authoritative from the saved record (DOM may not reflect it
  // when the ACE is rebuilt headlessly for the FCR), falling back to the live form.
  const acePatient=(opts&&opts.patient)||(currentAcePatientId?getPatient(currentAcePatientId):null)
  const noFollowup=(acePatient&&isPatientAceNoFollowup(acePatient))||isAceNoFollowupSelected()
  H1('PLAN- TREATMENT PLAN OF CARE')
  if(noFollowup){
    // No follow-up: the patient is discharged, so the plan collapses to a
    // single recommendation line - no treatment plan/effectiveness/home care.
    kvLine('Recommendation','No follow-up.')
    // ...and the Case Discharge Summary is appended inline right here (no forced
    // page break - it fills the remaining space on the page). The FCR's
    // standalone case-discharge page is suppressed for no-follow-up patients.
    const cd=acePatient?getCaseDischargeData(acePatient):{
      name:name,dob:gv('ptDOB'),age:gv('ptAge'),doi:gv('doi'),initialDOS:gv('dos'),
      examReportDates:'—',dischargeDate:'—',totalDates:'—',finalStatus:'Discharged. No concussion.',
      injuryType:injType||'',
      dxLines:[...document.querySelectorAll('#icdGrid .icd-item.checked')].map(el=>{const c=el.querySelector('.icd-code')?.textContent.trim();const d=el.querySelector('.icd-desc')?.textContent.trim();return c?('('+c+') '+(d||'')).trim():''}).filter(Boolean)
    }
    y+=10;needPage(60);f('bold',12);col(0,0,0)
    tx('CASE DISCHARGE SUMMARY',ML,y);y+=18
    rec({k:'h2',t:'CASE DISCHARGE SUMMARY'})
    para([{t:'Patient: ',b:true},{t:cd.name||name},{t:'   Date of Birth: ',b:true},{t:cd.dob||'—'},{t:'   Age: ',b:true},{t:cd.age||'—'}])
    kvLine('Date of Injury',cd.doi)
    kvLine('Date of Initial DOS',cd.initialDOS)
    kvLine('Discharge Date',cd.dischargeDate)
    kvLine('Total Dates of service',cd.totalDates)
    kvLine('Final Status',cd.finalStatus||'Discharged. No concussion.')
    H2('Diagnosis')
    para([{t:(cd.dxLines&&cd.dxLines.length)?cd.dxLines.join(', '):'No diagnosis code selected'}])
    H2('Causation')
    para(["Based on review of "+(cd.name||name)+"'s complaints, clinical course, medical records and examination, it is my opinion that there exists a reasonable degree of medical certainty of a direct causal connection between their injuries and the "+dischargeIncidentPhrase(injType||cd.injuryType)+" that occurred on "+(cd.doi||'—')+"."])
    H2('Medical Necessity')
    para(['The care and treatment rendered to the patient, '+(cd.name||name)+', has been medically necessary for the injuries sustained in the '+dischargeIncidentPhrase(injType||cd.injuryType)+' that occurred on '+(cd.doi||'—')+'.'])
    H2('Reasonableness')
    para(['The treatment, management and charges rendered in the care of this patient have been fair, reasonable and customary for the greater Baltimore-Washington D.C. region.'])
  }else{
    kvLine('Plan',go('txPlan'))
    kvLine('Treatment Effectiveness','Overall effectiveness of ongoing treatment for this complaint will continue to be evaluated by analyzing objective and subjective findings.')
    kvLine('Home/Self Care','The patient was instructed to continue home care recommendations.')
    kvLine('Recommendation',getAceRecommendationText())
  }


  drawFooters()
  const fname='CTG_ACE_'+name.replace(/\s+/g,'_')+'_'+(dos.replace(/\//g,'-'))+'.pdf'
  if(opts&&opts.returnDoc)return doc
  doc.save(fname)
  ctgAuditExport(currentAcePatientId,'day1_pdf')
  showToast('PDF downloaded ✓')
}
function loadJsPDF(cb){
  if(window.jspdf&&window.jspdf.jsPDF){cb();return}
  const s=document.createElement('script')
  s.src='vendor/jspdf.umd.min.js'
  s.onload=cb;s.onerror=()=>showToast('Could not load PDF library','err')
  document.head.appendChild(s)
}
const _ep=exportPDF;window.exportPDF=()=>loadJsPDF(_ep)

// Billing statement PDF, laid out to match the practice's medical-bill format.
const BILLING_CLINIC={name:'Concussion Therapy Group',addr1:'2411 Crofton Lane Suite 13A',addr2:'Crofton, MD 21114',phone:'4104519870',taxId:'994717315'}
const _BILLING_ICD='S06.0X0A,V43.52XA,W22.8XXA,S09.90XA,S00.93XA,R41.844,F06.71,F06.34,G44.309,R51.9,H53.143,H53.19,R47.01,R42,H93.19,R41.3'
function _bMoney(n){
  if(n===''||n==null)return ''
  const num=typeof n==='number'?n:parseFloat(String(n).replace(/[^0-9.\-]/g,''))
  if(isNaN(num))return String(n)
  return '$'+num.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
}
// MM/DD/YYYY, month first (see fcrSegmentDateKey).
function _bDateKey(s){const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[1]-1,+m[2]).getTime():Number.MAX_SAFE_INTEGER}
function _bTherapyRows(date){return [
  {date,code:'97110',desc:'Therapeutic Exercise',qty:1,charges:135,payments:0,adjustments:0,balance:135},
  {date,code:'97112',desc:'97112 Neuro Muscular Re-Education',qty:1,charges:135,payments:0,adjustments:0,balance:135},
  {date,code:'97129',desc:'97129 Cognitive Therapy, 1st 15 min.',qty:1,charges:150,payments:0,adjustments:0,balance:150},
  {date,code:'97130',desc:'97130 Cognitive Therapy, 2nd 15 min.',qty:1,charges:150,payments:0,adjustments:0,balance:150}
]}
function _bGroup(date,rows,id){
  rows=(rows||[]).map((r,i)=>({...r,_rowKey:(id||date||'group')+'|'+i}))
  const sum=k=>rows.reduce((a,r)=>a+(+r[k]||0),0)
  return {id:id||('group_'+String(date||'').replace(/[^a-z0-9]/gi,'_')),date,provider:'',rows,subtotal:{charges:sum('charges'),payments:sum('payments'),adjustments:sum('adjustments'),balance:sum('balance')}}
}
function recomputeBillingGroup(g){
  const rows=g.rows||[]
  const sum=k=>rows.reduce((a,r)=>a+(+r[k]||0),0)
  g.subtotal={charges:sum('charges'),payments:sum('payments'),adjustments:sum('adjustments'),balance:sum('balance')}
  return g
}
function applyBillingEditsToGroups(p,groups){
  const edits=(p&&p.billingEdits)||{}
  ;(groups||[]).forEach(g=>{
    g.rows=(g.rows||[]).filter(r=>!(edits[r._rowKey]&&edits[r._rowKey].deleted))
    ;(g.rows||[]).forEach(r=>{
      const e=edits[r._rowKey]
      if(!e)return
      if(e.code!=null)r.code=String(e.code)
      if(e.desc!=null)r.desc=String(e.desc)
      if(e.charges!=null&&e.charges!==''){
        const n=parseFloat(String(e.charges).replace(/[^0-9.\-]/g,''))
        if(!isNaN(n)){r.charges=n;r.balance=n}
      }
    })
    recomputeBillingGroup(g)
  })
  return groups
}
function _sampleBillingGroups(){
  const g=[]
  g.push(_bGroup('12/15/2025',[{date:'12/15/2025',code:'99203',desc:'99203 25 Day 2 Exam Complex',qty:1,charges:265,payments:0,adjustments:0,balance:265}]))
  g.push(_bGroup('12/16/2025',[
    {date:'12/16/2025',code:'92551',desc:'Audiologic Function Test',qty:1,charges:335,payments:0,adjustments:0,balance:335},
    {date:'12/16/2025',code:'96146',desc:'96146 NCAT Neurocognitive Exam, Automated',qty:1,charges:350,payments:0,adjustments:0,balance:350},
    {date:'12/16/2025',code:'95919',desc:'Quantitative Pupillometry',qty:1,charges:335,payments:0,adjustments:0,balance:335}
  ]))
  ;['12/17/2025','12/22/2025','01/05/2026','01/06/2026','01/08/2026','01/12/2026','01/14/2026','01/21/2026','01/23/2026','02/03/2026','02/04/2026','02/05/2026'].forEach(d=>g.push(_bGroup(d,_bTherapyRows(d))))
  g.push(_bGroup('02/06/2026',[
    {date:'02/06/2026',code:'92551',desc:'Audiologic Function Test',icd:_BILLING_ICD,qty:1,charges:335,payments:0,adjustments:0,balance:335},
    {date:'02/06/2026',code:'96146',desc:'96146 NCAT Neurocognitive Exam, Automated',icd:_BILLING_ICD,qty:1,charges:350,payments:0,adjustments:0,balance:350},
    {date:'02/06/2026',code:'99213',desc:'99213 Re-Examination',icd:_BILLING_ICD,qty:1,charges:225,payments:0,adjustments:0,balance:225},
    {date:'02/06/2026',code:'95919',desc:'Quantitative Pupillometry',icd:_BILLING_ICD,qty:1,charges:335,payments:0,adjustments:0,balance:335}
  ]))
  return g
}
// Build billing service line items from the patient's records.
// Central place for all auto-billing triggers (more to be added per user rules).
function _billingRow(date,code,desc,charge){return {date,code,desc,qty:1,charges:charge,payments:0,adjustments:0,balance:charge}}
function _billingExamDate(exam){return day2FormatAnyDate(exam?.examinationDate)||day2FormatAnyDate(exam?.sessionDate)||day2FormatAnyDate(exam?.savedDisplay)||day2FormatAnyDate(exam?.savedAt)||''}
function _billingHasUpload(exam,testKey){const u=normalizeDay2Uploads(exam?.testUploads||{});return (u[testKey]||[]).length>0}
function _billingHasTest3(exam){const er=exam?.test3EarResults||{};return _billingHasUpload(exam,'test3')||!!(String(er.left||'').trim()||String(er.right||'').trim()||String(er.indication||'').trim())}
function _billingProviderFromExam(exam){const prov=String(exam?.provider||'').split(',')[0].trim();return prov&&prov!=='—'?prov:''}
function _billingInitialExamGroup(ie){
  if(!ie||!ie.savedAt)return null
  const date=_billingExamDate(ie)
  const rows=[]
  if(_billingHasTest3(ie))rows.push(_billingRow(date,'92551','Audiologic Function Test',335))
  if(_billingHasUpload(ie,'test1'))rows.push(_billingRow(date,'96146','96146 NCAT Neurocognitive Exam, Automated',350))
  if(_billingHasUpload(ie,'test2'))rows.push(_billingRow(date,'95919','Quantitative Pupillometry',335))
  if(!rows.length)return null
  const g=_bGroup(date,rows,'initialExam')
  const prov=_billingProviderFromExam(ie); if(prov)g.provider=prov
  return g
}
function _billingFollowupExamGroup(exam,id,isFinal){
  if(!exam||!exam.savedAt)return null
  const date=_billingExamDate(exam)
  const rows=[_billingRow(date,'99213',isFinal?'99213 Final Examination':'99213 Re-Examination',225)]
  if(_billingHasTest3(exam))rows.push(_billingRow(date,'92551','Audiologic Function Test',335))
  if(_billingHasUpload(exam,'test1'))rows.push(_billingRow(date,'96146','96146 NCAT Neurocognitive Exam, Automated',350))
  if(_billingHasUpload(exam,'test2'))rows.push(_billingRow(date,'95919','Quantitative Pupillometry',335))
  const g=_bGroup(date,rows,id||('followup_'+String(exam.savedAt||date).replace(/[^a-z0-9]/gi,'_')))
  const prov=_billingProviderFromExam(exam); if(prov)g.provider=prov
  return g
}
// Billing service line items, built from the patient's saved records in this
// order: the ACE first once one exists, complete or not, with its first
// service date locked against later edits; then the Day 2 exam, from the
// tests it holds; then daily notes, re-exams and the final exam by date.
function deriveBillingServices(p){
  const groups=[]
  if(!p)return groups
  if(p.ace){
    const lockDate=day2FormatAnyDate(p.billingLocks?.ace?.date)||getDay2AceDateOfService(p)||day2FormatAnyDate(p.ace.dateOfService)||day2FormatAnyDate(p.ace.savedAt)||''
    groups.push(_bGroup(lockDate,[_billingRow(lockDate,'99203','99203 25 Day 2 Exam Complex',265)],'ace'))
  }
  const initialGroup=_billingInitialExamGroup(p.initialExam)
  if(initialGroup)groups.push(initialGroup)
  const eventGroups=[]
  if(Array.isArray(p.dailyNotes)){
    p.dailyNotes.forEach(dn=>{
      const date=day2FormatAnyDate(dn.sessionDate)||''
      _ensureDailyNoteId(dn)
      const rows=_bTherapyRows(date)
      if(dn.shoeboxTarget==='upload' && _dailyNoteHasShoebox(dn))rows.push(_billingRow(date,'92551','Audiologic Function Test',335))
      eventGroups.push(_bGroup(date,rows,'dailyNote_'+(dn.id||String(dn.savedAt||date).replace(/[^a-z0-9]/gi,'_'))))
    })
  }
  if(Array.isArray(p.reExams)){
    p.reExams.forEach(rx=>{
      if(reExamIsDesignatedFinal(p,rx))return
      const g=_billingFollowupExamGroup(rx,'reExam_'+(rx.savedAt?String(rx.savedAt).replace(/[^a-z0-9]/gi,'_'):'idx_'+eventGroups.length))
      if(g)eventGroups.push(g)
    })
  }
  const finalGroup=_billingFollowupExamGroup(p.finalExam,'finalExam',true)
  if(finalGroup)eventGroups.push(finalGroup)
  eventGroups.sort((a,b)=>_bDateKey(a.date)-_bDateKey(b.date))
  return applyBillingEditsToGroups(p,groups.concat(eventGroups))
}
/* City, state and ZIP are separate fields on Registration, but cityStateZip
   is still written on every save because the chart card, the search index and
   older claims all read it. Records saved before the split have only the
   combined field, so reading goes through the claim form's parser. */
function joinCityStateZip(city,state,zip){
  const c=String(city||'').trim(), st=String(state||'').trim(), z=String(zip||'').trim()
  return [[c,st].filter(Boolean).join(', '),z].filter(Boolean).join(' ').trim()
}
function patientCityStateZip(d){
  d=d||{}
  const c=String(d.city||'').trim(), st=String(d.state||'').trim(), z=String(d.zip||'').trim()
  if(c||st||z)return {city:c,state:st,zip:z}
  if(typeof cfSplitCsz==='function')return cfSplitCsz(d.cityStateZip)
  return {city:String(d.cityStateZip||'').trim(),state:'',zip:''}
}

function getBillingStatementData(p){
  const b=(p&&p.billing)||{}, d=(p&&p.demographics)||{}
  // Pull Patient Name / DOB / Date Of Accident + Provider from the SELECTED
  // patient's saved ACE form (p.ace.formState.inputs), with sensible fallbacks.
  const ace=(p&&p.ace)||{}, ai=(ace.formState&&ace.formState.inputs)||{}
  // Provider = the name typed in the ACE "Completed By" field for the selected
  // patient (p.ace.formState.inputs.completedBy), falling back to the live field.
  let provider=String(ai.completedBy||'').trim()
  if(!provider) provider=String(document.getElementById('completedBy')?.value||'').trim()
  // Auto-derived from the patient's records (ACE completion, etc.). A manually
  // saved b.services array, if present, overrides the derivation.
  let groups=deriveBillingServices(p)
  groups=groups.map(g=>({...g, provider:g.provider||provider}))
  const gt=groups.reduce((a,g)=>({charges:a.charges+(g.subtotal?.charges||0),payments:a.payments+(g.subtotal?.payments||0),adjustments:a.adjustments+(g.subtotal?.adjustments||0),balance:a.balance+(g.subtotal?.balance||0)}),{charges:0,payments:0,adjustments:0,balance:0})
  return {
    clinic:BILLING_CLINIC,
    statement:{date:b.statementDate||'',accountNo:b.accountNo||''},
    patient:{
      name: ai.ptName||ace.patientName||(p?naturalPatientName(p):'')||'',
      dob:  ai.ptDOB||d.dob||'',
      doa:  ai.doi||ace.dateOfInjury||d.doi||''
    },
    groups, grandTotal:gt
  }
}
function buildBillingStatementDoc(data){
  const {jsPDF}=window.jspdf
  const doc=new jsPDF({orientation:'portrait',unit:'pt',format:'letter'})
  const PW=612,PH=792,ML=40,MR=40,CW=PW-ML-MR,BOTTOM=42
  const COLS=[
    {k:'date',label:'Date',w:58,align:'left'},
    {k:'code',label:'Code',w:42,align:'left'},
    {k:'desc',label:'Description',w:180,align:'left'},
    {k:'qty',label:'Qty',w:24,align:'right'},
    {k:'charges',label:'Charges',w:52,align:'right'},
    {k:'payments',label:'Payments',w:50,align:'right'},
    {k:'adjustments',label:'Adjustments',w:70,align:'right'},
    {k:'balance',label:'Balance',w:56,align:'right'}
  ]
  const X=[]; let cx=ML; COLS.forEach(c=>{X.push(cx);cx+=c.w})
  const colX=k=>X[COLS.findIndex(c=>c.k===k)]
  const colW=k=>COLS.find(c=>c.k===k).w
  let y=0, page=0
  function f(style,size){doc.setFont('helvetica',style||'normal');doc.setFontSize(size||9)}
  function drawHeader(pageNum){
    doc.setTextColor(0,0,0);doc.setDrawColor(0,0,0);doc.setLineWidth(0.7)
    let ly=58
    f('bold',14); doc.text(data.clinic.name,ML,ly); ly+=14
    f('normal',9)
    ;['Tax ID #  '+(data.clinic.taxId||''),data.clinic.addr1,data.clinic.addr2,data.clinic.phone].forEach(t=>{doc.text(t,ML,ly);ly+=11})
    ly+=6
    f('bold',9); doc.text('For all billing questions, please call: '+data.clinic.phone,ML,ly); ly+=15
    f('normal',9)
    doc.text('Patient Name : '+(data.patient.name||''),ML,ly); ly+=12
    doc.text('Date Of Birth : '+(data.patient.dob||''),ML,ly); ly+=12
    doc.text('Date Of Accident: '+(data.patient.doa||''),ML,ly); ly+=12
    const w3=[110,80,62], RX=PW-MR-(w3[0]+w3[1]+w3[2])
    let by=48, rh=20
    const cells=[['Statement Date',data.statement.date||''],['Account No',data.statement.accountNo||''],['Page',String(pageNum)]]
    let bx=RX
    cells.forEach((c,i)=>{
      doc.setFillColor(241,241,241); doc.rect(bx,by,w3[i],rh,'FD')
      doc.rect(bx,by+rh,w3[i],rh,'D')
      f('bold',9); doc.text(c[0],bx+w3[i]/2,by+13,{align:'center'})
      f('bold',11); doc.text(c[1],bx+w3[i]/2,by+rh+14,{align:'center'})
      bx+=w3[i]
    })
    const totW=w3[0]+w3[1]+w3[2]
    let my=by+rh*2+8
    f('bold',9); doc.rect(RX,my,totW,16,'D'); doc.text('Make Checks Payable To:',RX+4,my+11)
    doc.rect(RX,my+16,totW,46,'D')
    f('normal',9)
    doc.text(data.clinic.name,RX+4,my+28)
    doc.text(data.clinic.addr1,RX+4,my+40)
    doc.text(data.clinic.addr2,RX+4,my+52)
    const ruleY=Math.max(ly,my+62)+8
    doc.setFillColor(0,0,0); doc.rect(ML,ruleY,CW,3,'F')
    return ruleY+14
  }
  function newPage(){page++;if(page>1)doc.addPage();return drawHeader(page)}
  function tableHeader(){
    doc.setFillColor(241,241,241);doc.setDrawColor(0,0,0);doc.setLineWidth(0.7)
    doc.rect(ML,y,CW,16,'FD')
    f('bold',8)
    COLS.forEach(c=>{const x=colX(c.k);if(c.align==='right')doc.text(c.label,x+c.w-3,y+11,{align:'right'});else doc.text(c.label,x+3,y+11)})
    COLS.forEach((c,i)=>{if(i>0)doc.line(X[i],y,X[i],y+16)})
    y+=16
  }
  function groupHeader(g){
    doc.setDrawColor(0,0,0);doc.setLineWidth(0.7);doc.setFillColor(255,255,255)
    doc.rect(ML,y,CW,18,'D')
    f('bold',9); doc.text('Service Date: '+g.date+'   Provider: '+(g.provider||''),ML+4,y+12)
    y+=18
  }
  y=newPage()
  f('bold',11); doc.text('Services',ML,y); y+=16
  data.groups.forEach(g=>{
    if(y+18+16+20>PH-BOTTOM){y=newPage()}
    groupHeader(g); tableHeader()
    g.rows.forEach(r=>{
      f('normal',8)
      const descLines=doc.splitTextToSize(String(r.desc||''),colW('desc')-6)
      let icdLines=[]
      if(r.icd){f('normal',6.5);icdLines=doc.splitTextToSize(String(r.icd),colW('desc')-6);f('normal',8)}
      const rowH=Math.max(16, descLines.length*9 + icdLines.length*7.5 + 6)
      if(y+rowH>PH-BOTTOM){y=newPage();groupHeader(g);tableHeader()}
      doc.setDrawColor(0,0,0);doc.setLineWidth(0.5)
      doc.rect(ML,y,CW,rowH,'D')
      COLS.forEach((c,i)=>{if(i>0)doc.line(X[i],y,X[i],y+rowH)})
      const ty=y+11
      f('normal',8)
      doc.text(String(r.date||''),colX('date')+3,ty)
      doc.text(String(r.code||''),colX('code')+3,ty)
      let dy=ty
      descLines.forEach(ln=>{doc.text(ln,colX('desc')+3,dy);dy+=9})
      if(icdLines.length){f('normal',6.5);icdLines.forEach(ln=>{doc.text(ln,colX('desc')+3,dy);dy+=7.5});f('normal',8)}
      doc.text(String(r.qty==null?'':r.qty),colX('qty')+colW('qty')-3,ty,{align:'right'})
      doc.text(_bMoney(r.charges),colX('charges')+colW('charges')-3,ty,{align:'right'})
      doc.text(_bMoney(r.payments),colX('payments')+colW('payments')-3,ty,{align:'right'})
      doc.text(_bMoney(r.adjustments),colX('adjustments')+colW('adjustments')-3,ty,{align:'right'})
      doc.text(_bMoney(r.balance),colX('balance')+colW('balance')-3,ty,{align:'right'})
      y+=rowH
    })
    if(y+32>PH-BOTTOM){y=newPage()}
    doc.setDrawColor(0,0,0);doc.setLineWidth(0.5);doc.rect(ML,y,CW,16,'D')
    COLS.forEach((c,i)=>{if(i>0)doc.line(X[i],y,X[i],y+16)})
    f('bold',8); doc.text('Payment/Adjustment',colX('desc')+3,y+11)
    y+=16
    doc.rect(ML,y,CW,16,'D')
    COLS.forEach((c,i)=>{if(i>0)doc.line(X[i],y,X[i],y+16)})
    f('bold',8)
    doc.text(_bMoney(g.subtotal.charges),colX('charges')+colW('charges')-3,y+11,{align:'right'})
    doc.text(_bMoney(g.subtotal.payments),colX('payments')+colW('payments')-3,y+11,{align:'right'})
    doc.text(_bMoney(g.subtotal.adjustments),colX('adjustments')+colW('adjustments')-3,y+11,{align:'right'})
    doc.text(_bMoney(g.subtotal.balance),colX('balance')+colW('balance')-3,y+11,{align:'right'})
    y+=16+6
  })
  if(y+20>PH-BOTTOM){y=newPage()}
  doc.setDrawColor(0,0,0);doc.setLineWidth(0.7);doc.rect(ML,y,CW,18,'D')
  f('bold',9)
  const gt=data.grandTotal
  doc.text('Total Charges: '+_bMoney(gt.charges)+'    Total Payments: '+_bMoney(gt.payments)+'    Total Adjustments: '+_bMoney(gt.adjustments)+'    Total Balance: '+_bMoney(gt.balance),ML+6,y+12)
  y+=18
  return doc
}
function viewBillingStatement(pid){
  loadJsPDF(()=>{
    try{const doc=buildBillingStatementDoc(getBillingStatementData(getPatient(pid)));_showPdfModal(doc.output('bloburl'),'Billing Statement');ctgAuditExport(pid,'billing_statement','preview')}
    catch(e){showToast('Statement error: '+e.message,'err');console.error(e)}
  })
}
function downloadBillingStatement(pid){
  loadJsPDF(()=>{
    try{
      const p=getPatient(pid)
      const doc=buildBillingStatementDoc(getBillingStatementData(p))
      const nm=((p?naturalPatientName(p):'')||'Patient').replace(/\s+/g,'_')
      doc.save('CTG_Billing_Statement_'+nm+'.pdf')
      if(p)ctgAuditExport(p.id,'billing_statement')
      showToast('Billing statement downloaded ✓')
    }catch(e){showToast('Statement error: '+e.message,'err');console.error(e)}
  })
}
function _showPdfModal(url,title){
  let ov=document.getElementById('pdfViewOverlay')
  if(!ov){
    ov=document.createElement('div');ov.id='pdfViewOverlay';ov.className='modal-overlay'
    ov.innerHTML='<div class="modal" data-cs="'+__cs+'width:min(920px,100%);max-width:920px"><div class="modal-hd"><div class="modal-title" id="pdfViewTitle"></div><button class="modal-close" data-onclick="_closePdfModal()">×</button></div><div class="modal-body" data-cs="'+__cs+'padding:0"><iframe id="pdfViewFrame" title="PDF preview" data-cs="'+__cs+'width:100%;height:76vh;border:none;display:block"></iframe></div></div>'
    document.body.appendChild(ov)
    ov.addEventListener('click',e=>{if(e.target===ov)_closePdfModal()})
  }
  document.getElementById('pdfViewTitle').textContent=title
  document.getElementById('pdfViewFrame').src=url
  ov.classList.add('show')
}
function _closePdfModal(){const ov=document.getElementById('pdfViewOverlay');if(ov)ov.classList.remove('show')}
/* Styled preview modal for results that were extracted from a PDF but have no
   stored PDF blob to display in an iframe (reuses the app's day2 preview CSS). */
function _showResultPreviewModal(html,title){
  let ov=document.getElementById('resultPreviewOverlay')
  if(!ov){
    ov=document.createElement('div');ov.id='resultPreviewOverlay';ov.className='modal-overlay'
    ov.innerHTML='<div class="modal" data-cs="'+__cs+'width:min(920px,100%);max-width:920px"><div class="modal-hd"><div class="modal-title" id="resultPreviewTitle"></div><button class="modal-close" data-onclick="_closeResultPreviewModal()">×</button></div><div class="modal-body" data-cs="'+__cs+'max-height:78vh;overflow:auto"><div class="day2-results-preview" id="resultPreviewBody"></div></div></div>'
    document.body.appendChild(ov)
    ov.addEventListener('click',e=>{if(e.target===ov)_closeResultPreviewModal()})
  }
  document.getElementById('resultPreviewTitle').textContent=title
  document.getElementById('resultPreviewBody').innerHTML=html
  ov.classList.add('show')
}
function _closeResultPreviewModal(){const ov=document.getElementById('resultPreviewOverlay');if(ov)ov.classList.remove('show')}

function showToast(msg,type){
  const t=document.getElementById('toast')
  t.textContent=msg;t.className='toast '+(type||'')+' show'
  setTimeout(()=>t.className='toast',3000)
}

/* Themed replacement for window.confirm(). The native dialog cannot be
   styled, ignores dark mode, and looks like a browser error rather than part
   of the app. Promise-based, since a custom modal cannot block the way the
   native one does, so callers await it. */
let ctgConfirmResolver = null
function ctgConfirm(message, opts) {
  opts = opts || {}
  return new Promise((resolve) => {
    ctgConfirmResolver = resolve
    document.getElementById('ctgConfirmTitle').textContent = opts.title || 'Please Confirm'
    document.getElementById('ctgConfirmMessage').textContent = message
    const okBtn = document.getElementById('ctgConfirmOkBtn')
    okBtn.textContent = opts.okLabel || 'OK'
    okBtn.style.background = opts.danger ? 'var(--red)' : ''
    okBtn.style.borderColor = opts.danger ? 'var(--red)' : ''
    document.getElementById('ctgConfirmModal').classList.add('show')
  })
}
function ctgConfirmResolve(result) {
  const modal = document.getElementById('ctgConfirmModal')
  if (modal) modal.classList.remove('show')
  if (ctgConfirmResolver) { const r = ctgConfirmResolver; ctgConfirmResolver = null; r(result) }
}
/* Leaving a page closes whatever was open on top of it.
   showPage() resets the rest of the per-page state but never touched the
   overlays, so a dialog opened on one page stayed on screen over the next one -
   and its Save still wrote to whatever record the page behind it had selected.
   The two promise-based dialogs have to be RESOLVED, not merely hidden, or the
   code awaiting them never continues. */
function ctgCloseAllModals() {
  if (ctgConfirmResolver) ctgConfirmResolve(false)
  if (ctgPromptResolver) ctgPromptResolve(null)
  document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'))
  // The blur is on body, not the overlay - leaving it set blurred the next page.
  document.body.classList.remove('modal-open')
  if (typeof modalContext !== 'undefined') modalContext = { patientId: null, section: null }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('ctgConfirmModal')?.classList.contains('show')) ctgConfirmResolve(false)
})

/* Themed replacement for prompt(), where the action needs one free-text
   answer. Resolves with the text, or null if the user backed out, matching
   native prompt() so callers keep their `if (x === null) return` guard. */
let ctgPromptResolver = null
function ctgPrompt(message, opts) {
  opts = opts || {}
  return new Promise((resolve) => {
    ctgPromptResolver = resolve
    document.getElementById('ctgPromptTitle').textContent = opts.title || 'Please Confirm'
    const sub = document.getElementById('ctgPromptSub')
    sub.textContent = opts.subtitle || ''
    sub.style.display = opts.subtitle ? '' : 'none'
    document.getElementById('ctgPromptMessage').textContent = message || ''
    const hint = document.getElementById('ctgPromptHint')
    hint.textContent = opts.hint || ''
    hint.style.display = opts.hint ? '' : 'none'
    const input = document.getElementById('ctgPromptInput')
    input.value = opts.value || ''
    input.placeholder = opts.placeholder || ''
    input.rows = opts.rows || 3
    /* Cleared every time, not only set: the element is reused, so a name
       prompt would otherwise leave grammar checking off for the next caller
       that genuinely wants it. */
    if (opts.noGrammar) input.setAttribute('data-gc', 'off')
    else input.removeAttribute('data-gc')
    const okBtn = document.getElementById('ctgPromptOkBtn')
    okBtn.textContent = opts.okLabel || 'OK'
    document.getElementById('ctgPromptModal').classList.add('show')
    // Focus after the overlay is painted, or the caret lands nowhere.
    setTimeout(() => { input.focus(); input.select() }, 30)
  })
}
function ctgPromptSubmit() {
  ctgPromptResolve((document.getElementById('ctgPromptInput').value || '').trim())
}
function ctgPromptResolve(result) {
  const modal = document.getElementById('ctgPromptModal')
  if (modal) modal.classList.remove('show')
  if (ctgPromptResolver) { const r = ctgPromptResolver; ctgPromptResolver = null; r(result) }
}
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('ctgPromptModal')?.classList.contains('show')) return
  if (e.key === 'Escape') { ctgPromptResolve(null); return }
  // Enter submits, Shift+Enter keeps its normal newline - the field is a
  // textarea because a decline reason is often more than one line.
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ctgPromptSubmit() }
})

function setYNRow(containerId,index,val){
  const row=document.querySelectorAll('#'+containerId+' .yn-row')[index]
  if(!row)return
  row.querySelectorAll('.yn-btn').forEach(b=>b.classList.remove('active'))
  row.querySelector('.yn-btn.'+val).classList.add('active')
  row.dataset.answered='1'
  toggleYNComment(row,val)
}

function clickAceScore(containerId,indices){
  const items=document.querySelectorAll('#'+containerId+' .sym-score-item')
  indices.forEach(i=>{
    const btn=items[i]&&items[i].querySelector('.sym-btn[data-val="1"]')
    if(btn)btn.click()
  })
}

function checkItem(containerId,text){
  const labels=document.querySelectorAll('#'+containerId+' label')
  for(const el of labels){
    if(el.textContent.trim().endsWith(text)&&!el.classList.contains('checked')){el.click();break}
  }
}

function clearAll(){
  const scope=document.getElementById('aceFormHost')||document.getElementById('page-day1')
  scope.querySelectorAll('input[type=text],textarea').forEach(el=>el.value='')
  // Back to each dropdown's own default (Total MVCs starts at 1 but also offers 0), else the first choice.
  scope.querySelectorAll('select').forEach(el=>{const d=[...el.options].findIndex(o=>o.defaultSelected);el.selectedIndex=d>=0?d:0})
  scope.querySelectorAll('.yn-btn.active,.sym-btn.active,.icd-item.checked').forEach(el=>el.classList.remove('active','checked'))
  scope.querySelectorAll('.sym-score-item.scored').forEach(el=>el.classList.remove('scored'))
  removeCustomRiskLabels()
  scope.querySelectorAll('#riskFactorsList label.checked,#assessRiskList label.checked,#earlySignsList label.checked,#referralTypeList label.checked,#immedExperienceList label.checked').forEach(el=>{
    el.classList.remove('checked');el.style.background='';el.style.borderColor=''
    const chk=el.querySelector('.rchk');if(chk){chk.style.background='';chk.style.borderColor='';chk.style.color=''}
  })
  scope.querySelectorAll('.yn-row').forEach(r=>r.dataset.answered='0')
  scope.querySelectorAll('.yn-comment').forEach(el=>el.style.display='none')
  document.getElementById('customImpWrap').style.display='none'
  document.getElementById('reporterOtherWrap').style.display='none'
  document.getElementById('translatorNameWrap').style.display='none'
  document.getElementById('erVisitOtherWrap').style.display='none'
  document.getElementById('redFlagNotesWrap').style.display='none'
  document.getElementById('followupMonitorWrap').style.display='none'
  document.getElementById('followupReferralWrap').style.display='none'
  const patientAcePage=document.getElementById('page-patientAce')
  const isPatientAceOpen=patientAcePage&&patientAcePage.classList.contains('active')
  if(!isPatientAceOpen){
    currentAcePatientId=null
    const host=document.getElementById('aceFormHost'); if(host)delete host.dataset.patientId
    if(patientAcePage)delete patientAcePage.dataset.patientId
  }
  if(typeof aceLocSyncFromValue==='function')aceLocSyncFromValue()
  updateAceTotals();updateBanner();updateBoilerplates();syncAceNoFollowupState();updateAceSavePanel()
}

updateBoilerplates()
// Patients now live server-side behind a login-gated API - loadPatientStore()
// is called from ctg-auth.js's showApp() once a session is confirmed, not
// unconditionally at parse time (there's no data to fetch before login).
updateAceSavePanel()
renderDay2UploadPreviews()
;(function initAceLoc(){
  const el=document.getElementById('ace_loc')
  if(el)el.addEventListener('input',aceLocSyncFromValue)
  if(typeof aceLocSyncFromValue==='function')aceLocSyncFromValue()
})()

/* ── AI GRAMMAR CORRECTION ── */
const GC_DEBOUNCE_MS = 2000          // fallback: fire 2 s after typing stops
const GC_SENTENCE_MS = 400           // a sentence was just finished - act promptly

function gcBoundaryIndex(text){
  const re = /[.!?]["')\]]?[ \t]*\n|[.!?]["')\]]?[ \t]+|\n/g
  let idx = 0, m
  while((m = re.exec(text)) !== null) idx = m.index + m[0].length
  return idx
}
const _gcTimers      = new WeakMap() // per-element debounce timers

/* ── badge helpers ── */
function getOrCreateBadge(el){
  let b = el.parentElement.querySelector('.gc-badge')
  if(!b){ b = document.createElement('span'); el.insertAdjacentElement('afterend', b) }
  b.classList.remove('gc-fade')
  return b
}
function showCheckingBadge(el){
  const b = getOrCreateBadge(el)
  b.className = 'gc-badge gc-checking'
  b.textContent = 'Checking grammar…'
  b.onclick = null
}
function showDoneBadge(el){
  const b = getOrCreateBadge(el)
  b.className = 'gc-badge gc-done'
  b.textContent = 'Grammar corrected'
  b.onclick = null
  setTimeout(() => { b.classList.add('gc-fade'); setTimeout(() => b.remove(), 500) }, 2600)
}
function showErrorBadge(el, msg){
  const b = getOrCreateBadge(el)
  b.className = 'gc-badge gc-error'
  b.textContent = msg || 'Connection error'
  b.onclick = null
  setTimeout(() => { b.classList.add('gc-fade'); setTimeout(() => b.remove(), 500) }, 5000)
}
function removeBadge(el){ el.parentElement.querySelector('.gc-badge')?.remove() }

/* ── system prompt ── */
const GC_SYSTEM =
  'You are an expert clinical documentation editor embedded in a medical portal. ' +
  'Your sole task is to correct grammar, spelling, capitalization, and punctuation in clinical text. ' +
  'Follow these rules strictly:\n' +
  '1. Fix all grammatical errors, subject-verb agreement, tense consistency, and sentence structure.\n' +
  '2. Fix all spelling mistakes, including common medical misspellings.\n' +
  '3. Capitalize the first word of every sentence and all proper nouns.\n' +
  '4. Add missing periods, commas, and apostrophes; fix misplaced punctuation.\n' +
  '5. NEVER alter: medical terms, clinical abbreviations (TBI, MVC, PTSD, LOC, ROM, etc.), ' +
     'ICD-10 codes, drug names, dosages, patient names, dates, times, numeric values, ' +
     'measurements, or any factual clinical data.\n' +
  '6. NEVER add new information, summarize, condense, or significantly rephrase.\n' +
  '7. If the text is already correct, return it unchanged.\n' +
  '8. Return ONLY the corrected text — no explanations, no quotes, no comments.'

async function correctGrammar(text){
  if(!text || text.trim().length < 10) return text
  const d = await window.ctgApiFetch('/api/grammar-deep-check', { method: 'POST', body: JSON.stringify({ text }) })
  return (d && typeof d.corrected === 'string') ? d.corrected : text
}

/* ── Admin Center > Settings: Grammar Deep Check on/off toggle ── */
function stRoleCheckboxes(){
  return Array.from(document.querySelectorAll('#stGrammarDeepCheckRoles input[type=checkbox]'))
}
async function stLoadSettings(){
  const cb = document.getElementById('stGrammarDeepCheck')
  const note = document.getElementById('stGrammarDeepCheckNote')
  if(!cb) return
  cb.disabled = true
  stRoleCheckboxes().forEach((r) => { r.disabled = true })
  try{
    const d = await window.ctgApiFetch('/api/grammar-deep-check/admin-toggle')
    cb.checked = !!d.enabled
    const roles = Array.isArray(d.roles) ? d.roles : []
    stRoleCheckboxes().forEach((r) => { r.checked = roles.indexOf(r.value) !== -1 })
    if(note) note.textContent = d.wiredUp ? '' : 'Not fully configured on the server yet (missing Azure OpenAI settings) — this toggle has no effect until it is.'
  }catch(err){
    if(note) note.textContent = 'Could not load current setting: ' + err.message
  }finally{
    cb.disabled = false
    stRoleCheckboxes().forEach((r) => { r.disabled = false })
  }
}
async function stToggleGrammarDeepCheck(checked){
  const cb = document.getElementById('stGrammarDeepCheck')
  const note = document.getElementById('stGrammarDeepCheckNote')
  if(cb) cb.disabled = true
  try{
    const roles = stRoleCheckboxes().filter((r) => r.checked).map((r) => r.value)
    const d = await window.ctgApiFetch('/api/grammar-deep-check/admin-toggle', { method: 'PUT', body: JSON.stringify({ enabled: checked, roles }) })
    if(note) note.textContent = d.enabled ? 'Grammar Deep Check is ON for the selected roles.' : 'Grammar Deep Check is OFF for all accounts.'
  }catch(err){
    if(cb) cb.checked = !checked
    if(note) note.textContent = 'Failed to save: ' + err.message
  }finally{
    if(cb) cb.disabled = false
  }
}
async function stSaveGrammarDeepCheckRoles(){
  const cb = document.getElementById('stGrammarDeepCheck')
  const note = document.getElementById('stGrammarDeepCheckNote')
  const roles = stRoleCheckboxes().filter((r) => r.checked).map((r) => r.value)
  stRoleCheckboxes().forEach((r) => { r.disabled = true })
  try{
    const d = await window.ctgApiFetch('/api/grammar-deep-check/admin-toggle', { method: 'PUT', body: JSON.stringify({ enabled: !!(cb && cb.checked), roles }) })
    if(note) note.textContent = d.enabled ? 'Grammar Deep Check is ON for the selected roles.' : 'Grammar Deep Check is OFF for all accounts.'
  }catch(err){
    if(note) note.textContent = 'Failed to save: ' + err.message
  }finally{
    stRoleCheckboxes().forEach((r) => { r.disabled = false })
  }
}

/* Daily Notes is exempt. The check rewrites a clinician's own words in a
   field that is signed and billed on, and there the practice wants what was
   typed to be what is stored. Scoped by container rather than field id, so
   anything mounted into either Daily Notes surface is covered. */
const GC_EXEMPT_CONTAINERS = '#page-dailyNotes, #page-patientDailyNote'
const GC_OPT_OUT = '[data-gc="off"]'
function gcIsExempt(el){
  if(!el || typeof el.closest !== 'function') return false
  return !!(el.closest(GC_EXEMPT_CONTAINERS) || el.closest(GC_OPT_OUT))
}

function gcIsCheckable(el){
  if(!el) return false
  if(el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && el.type === 'text' && el.classList.contains('yn-comment-input')
}

/* ── shared correction runner ── */
async function runCorrection(el, opts){
  if(gcIsExempt(el)) return
  /* On blur the field is no longer being typed in, so the whole value is fair
     game - including a trailing fragment that never got a full stop. */
  const whole = !!(opts && opts.whole)
  const full = el.value
  const idx = whole ? full.length : gcBoundaryIndex(full)
  if(idx <= 0) return                       // nothing finished yet
  /* Caret back inside the finished text means they have gone up to edit an
     earlier sentence. Rewriting around them there is the interruption
     this is meant to prevent, so leave it entirely until they blur. */
  if(!whole && el.selectionStart < idx) return

  const target = full.slice(0, idx)
  const tail   = full.slice(idx)
  if(target.trim().length < 10) return
  if(el.dataset.gcProcessing === '1') return
  if(el.dataset.gcLast === target) return
  el.dataset.gcProcessing = '1'
  el.classList.add('gc-loading')
  showCheckingBadge(el)
  try{
    const corrected = await correctGrammar(target)
    if(corrected && corrected !== target){
      const st = el.scrollTop, ss = el.selectionStart, se = el.selectionEnd
      /* The tail is put back byte for byte, so the only thing that moved is
         how much text sits in front of it. Shifting the caret by that
         difference lands it on the same character the user was on. */
      const delta = corrected.length - target.length
      el.value = corrected + tail
      el.scrollTop = st
      try{ el.setSelectionRange(Math.max(0, ss + delta), Math.max(0, se + delta)) }catch(_){}
      el.dataset.gcLast = corrected
      el.dataset.gcHinted = ''
      showDoneBadge(el)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      el.dataset.gcLast = target
      removeBadge(el)
    }
  }catch(err){
    console.warn('[CTG] Grammar correction:', err.message)
    showErrorBadge(el, err.message.length < 60 ? err.message : 'Grammar check failed')
  }finally{
    el.dataset.gcProcessing = '0'
    el.classList.remove('gc-loading')
  }
}

/* One listener on document, in the capture phase, catches every eligible
   field whether it was present at load or mounted later, with no
   MutationObserver and no per-element attachment. Eligibility is
   gcIsCheckable, not 'is a textarea'. */

/* Blur -> the field is finished with, so the whole value is corrected,
   including a trailing fragment that never got a full stop. This is what
   covers the clinician who never punctuates at all. */
document.addEventListener('blur', e => {
  if(!gcIsCheckable(e.target)) return
  const el = e.target
  clearTimeout(_gcTimers.get(el))
  _gcTimers.delete(el)
  runCorrection(el, { whole: true })
}, true)

document.addEventListener('input', e => {
  if(!gcIsCheckable(e.target)) return
  const el = e.target
  clearTimeout(_gcTimers.get(el))
  const boundary = gcBoundaryIndex(el.value)
  const wasAt = parseInt(el.dataset.gcBoundary || '0', 10)
  const finishedOne = boundary > wasAt
  el.dataset.gcBoundary = String(boundary)
  _gcTimers.set(el, setTimeout(() => runCorrection(el),
    finishedOne ? GC_SENTENCE_MS : GC_DEBOUNCE_MS))
}, true)

;/* Named handlers for what were statements inside onclick attributes:
   ctg-actions.js runs calls, never assignments. */
function docPickFile() { const i = document.getElementById('docAddFile'); if (i) i.click() }
function clearDischargeDate() { const i = document.getElementById('modalDischargeDate'); if (i) i.value = '' }
function jumpToMissingFieldAt(i) { jumpToMissingField(_lastMissingFields[i]) }
