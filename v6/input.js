// ASHFALL v6 input: clean Delta-Force-style touch HUD (SVG icon buttons, arc around the fire thumb, sprint-lock chevron, layout editor) + keyboard/mouse.
import { svg } from './icons.js';
export const SETTINGS_DEFAULT={sens:0.85,adsSens:0.6,btnScale:1.0,opacity:0.62,invertY:false,adsToggle:true,view:'tp',lookSpeed:1.0,lefty:false,quality:'auto',autoFire:false,
  autoSprint:true,aimAssist:true,haptics:true,smooth:0.5,xhColor:'#ffffff',xhOpacity:0.9,tips:true};
export const S={...SETTINGS_DEFAULT};
try{const o=JSON.parse(localStorage.getItem('ashfall6_settings')||'null');if(o)Object.assign(S,o);
  else{const v5=JSON.parse(localStorage.getItem('ashfall5_settings')||'null');if(v5){for(const k of ['invertY','adsToggle','view','lefty','quality','btnScale'])if(k in v5)S[k]=v5[k]}}}catch(_){}
export const saveSettings=()=>{try{localStorage.setItem('ashfall6_settings',JSON.stringify(S))}catch(_){}};
export const IN={mx:0,my:0,sprint:false,lock:false,lookX:0,lookY:0,fireR:false,fireL:false,ads:false,adsHold:false,brake:false,gas:false,steer:0,hb:false,
  touch:false,locked:false,modal:false,vehicle:false,editing:false,q:{},keys:{},stickActive:false,stickMag:0,
  take(k){const v=this.q[k];this.q[k]=false;return !!v},
  press(k){this.q[k]=true},
  get fire(){return this.fireR||this.fireL||this.mouseL},
  mouseL:false,onAny:null};
// ---- button table: id, icon, size, cx, cy (px from right edge / bottom edge at scale 1), group, extra class
const BTN=[
 ['fire','fire',96,100,98,'foot','big'],['ads','ads',56,208,86,'foot'],['reload','reload',50,194,160,'foot'],['jump','jump',54,118,210,'foot'],
 ['crouch','crouch',48,44,172,'foot'],['prone','prone',42,44,230,'foot'],['grenade','grenade',40,270,152,'foot','sm'],['melee','melee',40,248,214,'foot','sm'],
 ['interact','use',58,176,258,'ctx','use'],['car','car',54,252,262,'ctx','use'],
 ['veh_gas','gas',96,100,98,'veh','big'],['veh_brake','brake',64,208,86,'veh'],['veh_hb','hbrake',50,194,160,'veh'],['veh_exit','exit',54,118,210,'veh'],
];
const MENU=[['map','map'],['inv','pack'],['flash','flash'],['view','view'],['gear','gear']];
const NSLOT=4;
export const LAYOUT_KEY='ashfall6_layout';
let LAY={};try{LAY=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}')||{}}catch(_){LAY={}}
const $=id=>document.getElementById(id);
let layer,joyBase,joyKnob,lockChip,lookZone,joyZone,els={},probe,slotsEl,menuEl,edBar,edJoy,fireLBtn,autoT=0,autoDone=false;
const joy={id:null,cx:0,cy:0,r:62,home:{x:0,y:0}};
function insets(){const cs=getComputedStyle(probe);return{l:parseFloat(cs.paddingLeft)||0,r:parseFloat(cs.paddingRight)||0,t:parseFloat(cs.paddingTop)||0,b:parseFloat(cs.paddingBottom)||0}}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function scaleK(){return clamp(innerHeight/390,0.78,1.6)*S.btnScale}
const ov=id=>LAY[id]||(LAY[id]={dx:0,dy:0,sc:1});
const ovr=id=>LAY[id]||{dx:0,dy:0,sc:1};
export function layout(){
  if(!layer)return;const k=scaleK(),I=insets();const W=innerWidth,H=innerHeight;
  layer.style.setProperty('--op',S.opacity);document.documentElement.style.setProperty('--bs',k);
  const lefty=!!S.lefty;
  const side=(e,fromRight,x,w)=>{ // x = distance of centre from the edge
    const rightSide=lefty?!fromRight:fromRight;const sx=Math.max(rightSide?I.r:I.l,6)+4+x-w/2;
    if(rightSide){e.style.right=sx+'px';e.style.left='auto'}else{e.style.left=sx+'px';e.style.right='auto'}};
  const bot=Math.max(I.b,4)+4;
  for(const [id,ic,sz,cx,cy,grp] of BTN){const e=els[id];if(!e)continue;const o=ovr(id),isV=grp==='veh';const s=sz*k*(isV?1:o.sc);
    e.style.width=e.style.height=s+'px';side(e,true,(cx+(isV?0:o.dx))*k,s);e.style.bottom=((cy+(isV?0:o.dy))*k-s/2+bot)+'px'}
  const sl=els.steerL,sr=els.steerR;if(sl){const s=84*k;for(const [e,cx] of[[sl,70],[sr,174]]){e.style.width=e.style.height=s+'px';side(e,false,cx*k,s);e.style.bottom=(78*k-s/2+bot)+'px'}}
  // left small fire button
  if(fireLBtn){const o=ovr('fireL');const s=48*k*o.sc;fireLBtn.style.width=fireLBtn.style.height=s+'px';side(fireLBtn,false,(46+o.dx)*k,s);fireLBtn.style.bottom=((262+o.dy)*k-s/2+bot)+'px'}
  // top-centre weapon slots + corner menu (scaled down on narrow screens so they never collide)
  const tk=Math.min(k,W/800),t0=Math.max(I.t,6)+5;
  const so=ovr('slots'),mo=ovr('menu'),mmW=(window.__mmW||92)+16;
  const ss=44*tk*so.sc,ms=32*tk*mo.sc;
  slotsEl.style.setProperty('--ss',ss+'px');menuEl.style.setProperty('--ms',ms+'px');
  slotsEl.style.top=(t0+so.dy*k)+'px';menuEl.style.top=(t0+mo.dy*k)+'px';
  {const sx=Math.max(lefty?I.l:I.r,10)+mmW+10-mo.dx*k;if(!lefty){menuEl.style.right=sx+'px';menuEl.style.left='auto'}else{menuEl.style.left=sx+'px';menuEl.style.right='auto'}}
  {const gap=4*tk,mw=5*ms+4*gap,sw=NSLOT*ss*1.14+(NSLOT-1)*5*tk;let sdx=so.dx*k;
    if(!lefty&&!IN.editing){const menuLeft=W-(Math.max(I.r,10)+mmW+10-mo.dx*k)-mw;const over=W/2+sdx+sw/2-(menuLeft-8);if(over>0)sdx-=over}
    slotsEl.style.left='50%';slotsEl.style.transform=`translateX(calc(-50% + ${sdx}px))`}
  // joystick home
  const jo=ovr('joy');const R=62*k*jo.sc;joy.r=R;
  const jx=lefty?W-(Math.max(I.r,6)+R+34*k)-jo.dx*k:Math.max(I.l,6)+R+34*k+jo.dx*k;
  joy.home.x=jx;joy.home.y=H-(Math.max(I.b,4)+R+26*k)-jo.dy*k;
  if(joy.id===null)placeJoy(joy.home.x,joy.home.y);
  const jw=Math.round(W*0.42);joyZone.style.width=jw+'px';joyZone.style.top=Math.round(H*0.30)+'px';joyZone.style.bottom='0px';
  if(lefty){joyZone.style.right='0px';joyZone.style.left='auto'}else{joyZone.style.left='0px';joyZone.style.right='auto'}
  if(edJoy){const d=R*2+10;edJoy.style.width=edJoy.style.height=d+'px';edJoy.style.left=(joy.home.x-d/2)+'px';edJoy.style.top=(joy.home.y-d/2)+'px'}
  window.__uiK=k;
}
function placeJoy(x,y){joy.cx=x;joy.cy=y;const R=joy.r;joyBase.style.width=joyBase.style.height=R*2+'px';joyBase.style.left=(x-R)+'px';joyBase.style.top=(y-R)+'px';
  const kn=R*0.8;joyKnob.style.width=joyKnob.style.height=kn+'px';joyKnob.style.left=(x-kn/2)+'px';joyKnob.style.top=(y-kn/2)+'px';
  const cs=R*0.78;lockChip.style.width=lockChip.style.height=cs+'px';lockChip.style.padding=(cs*0.2)+'px';lockChip.style.left=(x-cs/2)+'px';lockChip.style.top=(y-R-cs-10*(window.__uiK||1))+'px'}
function mk(tag,cls,parent,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;(parent||layer).appendChild(e);return e}
function vib(p){if(S.haptics!==false&&IN.touch&&navigator.vibrate){try{navigator.vibrate(p)}catch(_){}}}
function holdBtn(e,down,up,opts={}){ // pointer-captured button; optional drag-to-look from the same finger
  let pid=null,lx=0,ly=0;
  e.addEventListener('pointerdown',ev=>{if(pid!==null||IN.editing)return;pid=ev.pointerId;try{e.setPointerCapture(pid)}catch(_){}e.classList.add('on');lx=ev.clientX;ly=ev.clientY;IN.touch=true;if(opts.tick)vib(opts.tick);down&&down(ev);ev.preventDefault();ev.stopPropagation();IN.onAny&&IN.onAny()});
  e.addEventListener('pointermove',ev=>{if(ev.pointerId!==pid||!opts.look)return;addLook(ev.clientX-lx,ev.clientY-ly);lx=ev.clientX;ly=ev.clientY});
  const end=ev=>{if(ev.pointerId!==pid)return;pid=null;e.classList.remove('on');up&&up(ev)};
  e.addEventListener('pointerup',end);e.addEventListener('pointercancel',end);e.addEventListener('lostpointercapture',end);
}
function addLook(dx,dy){const k=0.0042*S.sens*(IN.ads?S.adsSens:1)*S.lookSpeed;IN.lookX+=dx*k;IN.lookY+=dy*k*(S.invertY?-1:1)*0.72}
export function setLabel(id,txt){const e=els[id];if(!e||e.dataset.t===txt)return;e.dataset.t=txt;e.setAttribute('aria-label',txt);const c=e.querySelector('.cap');if(c)c.textContent=txt;
  if(id==='interact'){const ic=txt==='LOOT'?'pack':(txt==='CAR'?'car':'use');const h=e.querySelector('.icw');if(h&&h.dataset.i!==ic){h.dataset.i=ic;h.innerHTML=svg(ic)}}}
export function showBtn(id,v){const e=els[id];if(e)e.style.display=v?'flex':'none'}
export function setOn(id,v){const e=els[id==='t_view'?'m_view':id==='t_flash'?'m_flash':id];if(e)e.classList.toggle('act',!!v)}
export function setMode({vehicle,touch,hide}){
  if(!layer)return;layer.classList.toggle('veh',!!vehicle);layer.classList.toggle('foot',!vehicle);layer.classList.toggle('hidden',!!hide);
}
export function slotLabel(i,txt,on,empty){} // legacy
const _sl={};
export function slotUpdate(i,o){ // {icon, ammo, on, empty, num}
  const e=els['s'+i];if(!e)return;const key=(o.icon||'')+'|'+o.ammo+'|'+(o.on?1:0)+'|'+(o.empty?1:0);if(_sl[i]===key)return;_sl[i]=key;
  e.classList.toggle('act',!!o.on);e.classList.toggle('empty',!!o.empty);
  e.querySelector('.sic').innerHTML=o.icon?svg(o.icon):'';e.querySelector('.am').textContent=o.ammo==null?'':o.ammo;
}
export function setAmmoLow(i,v){const e=els['s'+i];e&&e.classList.toggle('low',!!v)}
// ------------------------------------------------------------ layout editor
const EANCH={slots:'ct',menu:'rt',joy:'lb',fireL:'lb'};
let edSel=null;
export function startLayoutEditor(){
  if(!layer)return;IN.editing=true;IN.touch=true;document.body.classList.add('touch');layer.classList.add('edit');layer.classList.remove('hidden');layer.classList.add('foot');layer.classList.remove('veh');
  for(const k of['interact','car'])els[k].classList.add('show');
  edBar.style.display='flex';edSelect(null);layout();
}
function edSelect(id){edSel=id;layer.querySelectorAll('.esel').forEach(e=>e.classList.remove('esel'));
  const t=id?edTarget(id):null;if(t)t.classList.add('esel');
  const sl=edBar.querySelector('input'),out=edBar.querySelector('output'),lab=edBar.querySelector('.lab');
  sl.disabled=!id;sl.value=id?ovr(id).sc:1;out.textContent=id?ovr(id).sc.toFixed(2)+'×':'';lab.textContent=id?'Selected: '+(({fire:'Fire',ads:'Aim',reload:'Reload',jump:'Jump',crouch:'Crouch',prone:'Prone',grenade:'Throw',melee:'Melee',interact:'Use',car:'Car',fireL:'Left fire',slots:'Weapon slots',menu:'Menu icons',joy:'Joystick'})[id]||id):'Tap a control, drag to move'}
function edTarget(id){return id==='slots'?slotsEl:id==='menu'?menuEl:id==='joy'?edJoy:id==='fireL'?fireLBtn:els[id]}
export function stopLayoutEditor(save=true){
  IN.editing=false;layer.classList.remove('edit');edBar.style.display='none';for(const k of['interact','car'])els[k].classList.remove('show');
  layer.querySelectorAll('.esel').forEach(e=>e.classList.remove('esel'));
  if(save){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(LAY))}catch(_){}}layout();
}
export function resetLayout(){LAY={};try{localStorage.removeItem(LAYOUT_KEY)}catch(_){}layout();if(IN.editing)edSelect(null)}
export function hasCustomLayout(){return Object.keys(LAY).length>0}
export function initInput(canvas){
  layer=mk('div','tl',document.body);layer.id='tl';
  probe=mk('div','',document.body);probe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  lookZone=mk('div','zone look',layer);joyZone=mk('div','zone joy',layer);
  joyBase=mk('div','joybase',layer,svg('chevron','jarr up',1.4)+svg('chevron','jarr dn',1.4));joyKnob=mk('div','joyknob',layer);
  lockChip=mk('div','lockchip show',layer,svg('chevron','',2.4));lockChip.title='Sprint lock';
  for(const [id,ic,sz,cx,cy,grp,cls] of BTN){const b=mk('button','tb g-'+grp+' '+(cls||''),layer,`<span class="icw" data-i="${ic}">${svg(ic)}</span>${id==='interact'?'<span class="cap">USE</span>':''}`);b.dataset.id=id;b.setAttribute('aria-label',id);els[id]=b}
  els.steerL=mk('button','tb g-veh steer',layer,svg('left',''));els.steerL.dataset.id='steerL';
  els.steerR=mk('button','tb g-veh steer',layer,svg('right',''));els.steerR.dataset.id='steerR';
  fireLBtn=mk('button','tb g-foot sm fl',layer,`<span class="icw">${svg('fire')}</span>`);fireLBtn.dataset.id='fireL';els.fireL=fireLBtn;
  slotsEl=mk('div','slots',layer);
  for(let i=1;i<=NSLOT;i++){const b=mk('button','tb slot',slotsEl,`<span class="sn">${i}</span><span class="sic"></span><b class="am"></b>`);b.dataset.id='s'+i;els['s'+i]=b}
  menuEl=mk('div','menu',layer);
  for(const [id,ic] of MENU){const b=mk('button','tb mi',menuEl,svg(ic));b.dataset.id='m_'+id;b.setAttribute('aria-label',id);els['m_'+id]=b}
  edJoy=mk('div','edjoy',layer);
  edBar=mk('div','edbar',layer,`<div class="lab">Tap a control, drag to move</div><div class="rw"><span>Size</span><input type="range" min="0.6" max="1.6" step="0.05" value="1"><output></output></div><div class="rw b"><button data-e="reset">Reset all</button><button data-e="done" class="pri">Save &amp; close</button></div>`);
  // --- layout editor interaction (capture phase so it pre-empts every game control)
  let drag=null;
  layer.addEventListener('pointerdown',ev=>{
    if(!IN.editing)return;ev.stopPropagation();ev.preventDefault();
    if(ev.target.closest('.edbar'))return;
    const t=ev.target.closest('[data-id],.slots,.menu,.edjoy,.lockchip');if(!t){edSelect(null);return}
    let id=t.dataset&&t.dataset.id;if(t.classList.contains('slots')||t.closest('.slots'))id='slots';else if(t.classList.contains('menu')||t.closest('.menu'))id='menu';else if(t.classList.contains('edjoy')||t.classList.contains('lockchip'))id='joy';
    if(!id||id.startsWith('veh_')||id.startsWith('steer'))return;
    edSelect(id);drag={id,x:ev.clientX,y:ev.clientY,pid:ev.pointerId};try{layer.setPointerCapture(ev.pointerId)}catch(_){}
  },true);
  layer.addEventListener('pointermove',ev=>{if(!IN.editing||!drag||ev.pointerId!==drag.pid)return;const k=scaleK();const dxp=(ev.clientX-drag.x)/k,dyp=(ev.clientY-drag.y)/k;drag.x=ev.clientX;drag.y=ev.clientY;
    const o=ov(drag.id),a=EANCH[drag.id]||'rb';const lefty=!!S.lefty;
    // right-anchored: moving right shrinks the distance from the right edge
    const rightAnch=(a==='rb'||a==='rt')?!lefty:(a==='lb'?lefty:false);
    if(a==='ct')o.dx+=dxp;else o.dx+=rightAnch?-dxp:dxp;
    if(a==='ct'||a==='rt')o.dy+=dyp;else o.dy-=dyp;
    o.dx=clamp(o.dx,-700,700);o.dy=clamp(o.dy,-360,360);layout();ev.preventDefault()},true);
  const dend=ev=>{if(drag&&ev.pointerId===drag.pid)drag=null};layer.addEventListener('pointerup',dend,true);layer.addEventListener('pointercancel',dend,true);
  edBar.querySelector('input').addEventListener('input',ev=>{if(!edSel)return;const o=ov(edSel);o.sc=+ev.target.value;edBar.querySelector('output').textContent=o.sc.toFixed(2)+'×';layout()});
  edBar.addEventListener('click',ev=>{const a=ev.target.dataset&&ev.target.dataset.e;if(a==='reset'){resetLayout();edSelect(null)}else if(a==='done'){stopLayoutEditor(true);IN.press('layoutDone')}});
  // --- look zone (any pointer not on a control): free-look drag
  const looks=new Map();
  lookZone.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse')return;IN.touch=true;looks.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});try{lookZone.setPointerCapture(ev.pointerId)}catch(_){}ev.preventDefault();IN.onAny&&IN.onAny()});
  lookZone.addEventListener('pointermove',ev=>{const l=looks.get(ev.pointerId);if(!l)return;addLook(ev.clientX-l.x,ev.clientY-l.y);l.x=ev.clientX;l.y=ev.clientY});
  const lend=ev=>looks.delete(ev.pointerId);lookZone.addEventListener('pointerup',lend);lookZone.addEventListener('pointercancel',lend);
  // --- joystick
  const unlock=()=>{IN.lock=false;IN.sprint=false;autoDone=false;lockChip.classList.remove('on')};
  joyZone.addEventListener('pointerdown',ev=>{if(joy.id!==null||IN.editing)return;IN.touch=true;joy.id=ev.pointerId;try{joyZone.setPointerCapture(ev.pointerId)}catch(_){}
    if(IN.lock)unlock();
    // floating: re-centre the stick under the finger (clamped so it stays on screen)
    const R=joy.r,zl=S.lefty?innerWidth*0.58:0,zr=S.lefty?innerWidth:innerWidth*0.42;
    placeJoy(clamp(ev.clientX,zl+R+8,zr-8),clamp(ev.clientY,R+8+(innerHeight*0.12),innerHeight-R-8));joyBase.classList.add('on');
    joyMove(ev);ev.preventDefault();IN.onAny&&IN.onAny()});
  joyZone.addEventListener('pointermove',ev=>{if(ev.pointerId===joy.id)joyMove(ev)});
  const jend=ev=>{if(ev.pointerId!==joy.id)return;joy.id=null;IN.mx=0;IN.my=IN.lock?1:0;IN.stickActive=false;IN.stickMag=0;joyBase.classList.remove('on');autoT=0;
    if(!IN.lock){IN.sprint=false;autoDone=false}placeJoy(joy.home.x,joy.home.y);if(IN.lock)joyKnob.style.top=(joy.cy-joy.r*0.5-joy.r*0.4)+'px'};
  joyZone.addEventListener('pointerup',jend);joyZone.addEventListener('pointercancel',jend);
  function joyMove(ev){const R=joy.r;let dx=ev.clientX-joy.cx,dy=ev.clientY-joy.cy;const l=Math.hypot(dx,dy);
    const lc=lockChip.getBoundingClientRect();const inChip=ev.clientX>lc.left-6&&ev.clientX<lc.right+6&&ev.clientY>lc.top-18&&ev.clientY<lc.bottom-2;
    if(inChip&&!IN.lock){IN.lock=true;IN.sprint=true;lockChip.classList.add('on');vib(12)}
    if(l>R){dx=dx/l*R;dy=dy/l*R}
    joyKnob.style.left=(joy.cx+dx-parseFloat(joyKnob.style.width)/2)+'px';joyKnob.style.top=(joy.cy+dy-parseFloat(joyKnob.style.height)/2)+'px';
    const nx=dx/R,ny=dy/R,m=Math.hypot(nx,ny);IN.stickMag=m;IN.stickActive=m>0.1;IN.mx=m>0.1?nx:0;IN.my=m>0.1?-ny:(IN.lock?1:0);if(IN.lock&&m>0.1)IN.my=-ny;
    if(IN.lock&&m<=0.1)IN.my=1;
    // auto-sprint: hold the stick fully forward for a moment
    if(S.autoSprint&&!IN.lock){if(m>0.93&&ny<-0.55){if(!autoT)autoT=performance.now();else if(!IN.sprint&&performance.now()-autoT>520){IN.sprint=true;autoDone=true;vib(8)}}else{autoT=0;if(autoDone&&m<0.65){IN.sprint=false;autoDone=false}}}}
  // --- buttons
  const q=k=>()=>IN.press(k);
  holdBtn(els.fire,()=>{IN.fireR=true},()=>{IN.fireR=false},{look:true});
  holdBtn(els.fireL,()=>{IN.fireL=true},()=>{IN.fireL=false},{look:true});
  holdBtn(els.ads,()=>{if(S.adsToggle)IN.ads=!IN.ads;else{IN.ads=true;IN.adsHold=true}},()=>{if(IN.adsHold){IN.ads=false;IN.adsHold=false}},{tick:6});
  holdBtn(els.jump,q('jump'),null,{tick:6});holdBtn(els.reload,q('reload'),null,{tick:6});holdBtn(els.crouch,q('crouch'),null,{tick:6});holdBtn(els.prone,q('prone'),null,{tick:6});
  holdBtn(els.melee,q('melee'),null,{tick:8});holdBtn(els.grenade,q('grenade'),null,{tick:8});holdBtn(els.interact,q('interact'),null,{tick:8});holdBtn(els.car,q('car'),null,{tick:8});
  holdBtn(els.veh_gas,()=>{IN.gas=true},()=>{IN.gas=false});holdBtn(els.veh_brake,()=>{IN.brake=true},()=>{IN.brake=false});
  holdBtn(els.veh_hb,()=>{IN.hb=true},()=>{IN.hb=false});holdBtn(els.veh_exit,q('car'));
  holdBtn(els.steerL,()=>{IN.steerL=true},()=>{IN.steerL=false});holdBtn(els.steerR,()=>{IN.steerR=true},()=>{IN.steerR=false});
  lockChip.addEventListener('pointerdown',ev=>{if(IN.editing)return;IN.touch=true;
    if(IN.lock){unlock();if(joy.id===null){IN.my=0;IN.mx=0}}
    else{IN.lock=true;IN.sprint=true;lockChip.classList.add('on');vib(12);if(joy.id===null){IN.my=1}}
    ev.stopPropagation();ev.preventDefault()});
  holdBtn(els.m_view,q('view'));holdBtn(els.m_flash,q('flash'));holdBtn(els.m_inv,q('inv'));holdBtn(els.m_map,q('map'));holdBtn(els.m_gear,q('settings'));
  for(let i=1;i<=NSLOT;i++)holdBtn(els['s'+i],()=>IN.press('slot'+i));
  // --- keyboard
  const K=IN.keys;
  addEventListener('keydown',e=>{if(e.target&&/input|textarea|select/i.test(e.target.tagName))return;IN.onAny&&IN.onAny();
    if(e.repeat){if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();return}
    K[e.code]=true;const c=e.code;
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(c))e.preventDefault();
    if(c==='Space'){if(IN.vehicle)IN.hb=true;else IN.press('jump')}
    else if(c==='KeyE')IN.press('interact');else if(c==='KeyF')IN.press('car');else if(c==='KeyR')IN.press('reload');
    else if(c==='KeyC')IN.press('crouch');else if(c==='KeyZ')IN.press('prone');else if(c==='KeyG')IN.press('grenade');else if(c==='KeyV')IN.press('melee');
    else if(c==='KeyI'||c==='Tab')IN.press('inv');else if(c==='KeyM')IN.press('map');else if(c==='KeyJ')IN.press('journal');else if(c==='KeyT')IN.press('flash');
    else if(c==='KeyB')IN.press('view');else if(c==='KeyN')IN.press('mute');else if(c==='Escape')IN.press('escape');else if(c==='KeyP')IN.press('settings');
    else if(/^Digit[1-4]$/.test(c))IN.press('slot'+c.slice(5));
    else if(c==='ShiftLeft'||c==='ShiftRight')IN.sprint=true;});
  addEventListener('keyup',e=>{K[e.code]=false;if(e.code==='Space')IN.hb=false;if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!IN.lock)IN.sprint=false});
  addEventListener('blur',()=>{for(const k in K)K[k]=false;IN.mouseL=false;if(!IN.lock)IN.sprint=false;IN.hb=false});
  // --- mouse (desktop): pointer-lock look, LMB fire, RMB ADS
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;IN.onAny&&IN.onAny();
    if(IN.modal)return;
    if(!document.pointerLockElement&&!IN.noLock){try{const p=canvas.requestPointerLock();if(p&&p.catch)p.catch(()=>{})}catch(_){}}
    if(e.button===0)IN.mouseL=true;
    if(e.button===2){if(S.adsToggle&&false)IN.ads=!IN.ads;else{IN.ads=true;IN.adsHold=true}}
    canvas.setPointerCapture&&0});
  addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')return;if(e.button===0)IN.mouseL=false;if(e.button===2&&IN.adsHold){IN.ads=false;IN.adsHold=false}});
  let dragId=null,dx0=0,dy0=0;
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0&&!document.pointerLockElement){dragId=e.pointerId;dx0=e.clientX;dy0=e.clientY}});
  addEventListener('mousemove',e=>{
    if(document.pointerLockElement===canvas){addLookMouse(e.movementX,e.movementY)}
    else if(dragId!==null&&e.buttons&1){addLookMouse(e.clientX-dx0,e.clientY-dy0);dx0=e.clientX;dy0=e.clientY}});
  addEventListener('pointerup',e=>{if(e.pointerId===dragId)dragId=null});
  function addLookMouse(dx,dy){if(IN.modal)return;const k=0.0025*S.sens*(IN.ads?S.adsSens:1);IN.lookX+=dx*k;IN.lookY+=dy*k*(S.invertY?-1:1)}
  document.addEventListener('pointerlockchange',()=>{IN.locked=document.pointerLockElement===canvas});
  canvas.addEventListener('wheel',e=>{IN.wheel=(IN.wheel||0)+e.deltaY;e.preventDefault()},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  addEventListener('resize',layout);addEventListener('orientationchange',()=>setTimeout(layout,200));
  layout();
  return IN;
}
export function releaseLock(){try{if(document.pointerLockElement)document.exitPointerLock()}catch(_){}}
// per-frame: translate keys to move vector for desktop
export function pollKeys(){
  if(joy.id!==null){if(S.autoSprint&&!IN.lock&&!IN.sprint&&autoT&&IN.stickMag>0.93&&performance.now()-autoT>520){IN.sprint=true;autoDone=true;vib(8)}return}
  if(IN.lock)return;
  const K=IN.keys;const kx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0),ky=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0);
  if(kx||ky){const l=Math.hypot(kx,ky);IN.mx=kx/l;IN.my=ky/l;IN.stickMag=1;IN.stickActive=true}else{IN.mx=0;IN.my=0;IN.stickMag=0;IN.stickActive=false}
}
