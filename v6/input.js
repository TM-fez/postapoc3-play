// ASHFALL v5 input: Delta-Force-style touch layout (floating stick w/ sprint-lock, free-look, fire L/R, action buttons) + keyboard/mouse (pointer lock).
export const SETTINGS_DEFAULT={sens:1.0,adsSens:0.65,btnScale:1.0,opacity:0.55,invertY:false,adsToggle:true,crouchToggle:true,view:'tp',lookSpeed:1.0,lefty:false,quality:'auto',autoFire:false};
export const S={...SETTINGS_DEFAULT};
try{Object.assign(S,JSON.parse(localStorage.getItem('ashfall5_settings')||'{}'))}catch(_){}
export const saveSettings=()=>{try{localStorage.setItem('ashfall5_settings',JSON.stringify(S))}catch(_){}};
export const IN={mx:0,my:0,sprint:false,lock:false,lookX:0,lookY:0,fireR:false,fireL:false,ads:false,adsHold:false,brake:false,gas:false,steer:0,hb:false,
  touch:false,locked:false,modal:false,vehicle:false,q:{},keys:{},stickActive:false,stickMag:0,
  take(k){const v=this.q[k];this.q[k]=false;return !!v},
  press(k){this.q[k]=true},
  get fire(){return this.fireR||this.fireL||this.mouseL},
  mouseL:false,onAny:null};
const $=id=>document.getElementById(id);
const BTN=[ // id,label,size, cx,cy from bottom-right, group, extra class
 ['fire','FIRE',104,80,96,'foot','big'],['ads','ADS',62,180,58,'foot'],['jump','JUMP',60,64,202,'foot'],['reload','RLD',50,184,124,'foot'],
 ['crouch','CRCH',52,262,84,'foot'],['prone','PRN',46,262,144,'foot'],['melee','MELEE',48,232,196,'foot'],['grenade','GRND',50,306,120,'foot'],
 ['interact','USE',66,142,176,'ctx','use'],['car','CAR',58,320,60,'ctx'],['sprint','RUN',48,330,186,'foot'],
 ['veh_gas','GAS',100,80,96,'veh','big'],['veh_brake','BRAKE',72,186,70,'veh'],['veh_hb','HBRK',52,262,110,'veh'],['veh_exit','EXIT',60,64,200,'veh'],
];
const TOPBTN=[['view','VIEW'],['flash','LIGHT'],['inv','PACK'],['map','MAP'],['gear','⚙']];
const SLOTS=[['s1','1'],['s2','2'],['s3','3'],['s4','4']];
let layer,joyBase,joyKnob,lockChip,lookZone,joyZone,els={},probe;
const joy={id:null,cx:0,cy:0,r:62,home:{x:0,y:0}};
function insets(){const cs=getComputedStyle(probe);return{l:parseFloat(cs.paddingLeft)||0,r:parseFloat(cs.paddingRight)||0,t:parseFloat(cs.paddingTop)||0,b:parseFloat(cs.paddingBottom)||0}}
export function scaleK(){return clamp(innerHeight/390,0.78,1.7)*S.btnScale}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function layout(){
  if(!layer)return;const k=scaleK(),I=insets();const W=innerWidth,H=innerHeight;const pad=Math.max(10,0);
  layer.style.setProperty('--op',S.opacity);document.documentElement.style.setProperty('--bs',k);
  const side=S.lefty;
  for(const [id,lab,sz,cx,cy] of BTN){const e=els[id];if(!e)continue;const s=sz*k;e.style.width=e.style.height=s+'px';
    const x=(cx*k)+Math.max(I.r,6)+4;e.style.bottom=(cy*k-s/2+Math.max(I.b,4)+4)+'px';
    if(id.startsWith('veh_')||!side){e.style.right=(x-s/2)+'px';e.style.left='auto'}else{e.style.left=(x-s/2)+'px';e.style.right='auto'}}
  // vehicle steering buttons (left side)
  const sl=els.steerL,sr=els.steerR;if(sl){const s=84*k;for(const [e,cx] of[[sl,70],[sr,174]]){e.style.width=e.style.height=s+'px';e.style.left=(cx*k-s/2+Math.max(I.l,6)+6)+'px';e.style.bottom=(78*k-s/2+Math.max(I.b,4)+4)+'px'}}
  // left fire
  const lf=els.fireL;if(lf){const s=58*k;lf.style.width=lf.style.height=s+'px';lf.style.left=(34*k-s/2+Math.max(I.l,6)+10)+'px';lf.style.bottom=(238*k-s/2+Math.max(I.b,4))+'px'}
  // top menu row + slots (anchored right of the minimap)
  const mmW=(window.__mmW||92)+16;let x0=Math.max(I.r,10)+mmW+8;const t0=Math.max(I.t,6)+6;
  const ts=36*k;TOPBTN.forEach(([id],i)=>{const e=els['t_'+id];e.style.width=e.style.height=ts+'px';e.style.right=(x0+i*(ts+5))+'px';e.style.top=t0+'px'});
  const ss=40*k;SLOTS.forEach(([id],i)=>{const e=els['t_'+id];e.style.width=e.style.height=ss+'px';e.style.right=(x0+i*(ss+5))+'px';e.style.top=(t0+ts+7)+'px'});
  // joystick home
  const R=62*k;joy.r=R;joy.home.x=Math.max(I.l,6)+R+34*k;joy.home.y=H-(Math.max(I.b,4)+R+26*k);
  if(joy.id===null)placeJoy(joy.home.x,joy.home.y);
  joyZone.style.left='0px';joyZone.style.width=Math.round(W*0.42)+'px';joyZone.style.top=Math.round(H*0.30)+'px';joyZone.style.bottom='0px';
  window.__uiK=k;
}
function placeJoy(x,y){joy.cx=x;joy.cy=y;const R=joy.r;joyBase.style.width=joyBase.style.height=R*2+'px';joyBase.style.left=(x-R)+'px';joyBase.style.top=(y-R)+'px';
  const kn=R*0.95;joyKnob.style.width=joyKnob.style.height=kn+'px';joyKnob.style.left=(x-kn/2)+'px';joyKnob.style.top=(y-kn/2)+'px';
  lockChip.style.width=lockChip.style.height=R*0.9+'px';lockChip.style.left=(x-R*0.45)+'px';lockChip.style.top=(y-R*2.15)+'px'}
function mk(tag,cls,parent,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;(parent||layer).appendChild(e);return e}
function holdBtn(e,down,up,opts={}){ // pointer-captured button; optional drag-to-look from the same finger
  let pid=null,lx=0,ly=0;
  e.addEventListener('pointerdown',ev=>{if(pid!==null)return;pid=ev.pointerId;try{e.setPointerCapture(pid)}catch(_){}e.classList.add('on');lx=ev.clientX;ly=ev.clientY;IN.touch=true;down&&down(ev);ev.preventDefault();ev.stopPropagation();IN.onAny&&IN.onAny()});
  e.addEventListener('pointermove',ev=>{if(ev.pointerId!==pid||!opts.look)return;addLook(ev.clientX-lx,ev.clientY-ly);lx=ev.clientX;ly=ev.clientY});
  const end=ev=>{if(ev.pointerId!==pid)return;pid=null;e.classList.remove('on');up&&up(ev)};
  e.addEventListener('pointerup',end);e.addEventListener('pointercancel',end);e.addEventListener('lostpointercapture',end);
}
function addLook(dx,dy){const k=0.0052*S.sens*(IN.ads?S.adsSens:1)*S.lookSpeed;IN.lookX+=dx*k;IN.lookY+=dy*k*(S.invertY?-1:1)*0.72}
export function setLabel(id,txt){const e=els[id];if(e&&e.dataset.t!==txt){e.dataset.t=txt;e.firstChild.textContent=txt}}
export function showBtn(id,v){const e=els[id];if(e)e.style.display=v?'flex':'none'}
export function setOn(id,v){const e=els[id];if(e)e.classList.toggle('act',!!v)}
export function setMode({vehicle,touch,hide}){ // called by game each frame-ish
  if(!layer)return;layer.classList.toggle('veh',!!vehicle);layer.classList.toggle('foot',!vehicle);layer.classList.toggle('hidden',!!hide);
}
export function slotLabel(i,txt,on,empty){const e=els['t_s'+i];if(!e)return;e.firstChild.textContent=txt;e.classList.toggle('act',!!on);e.classList.toggle('empty',!!empty)}
export function initInput(canvas){
  layer=mk('div','tl',document.body);layer.id='tl';
  probe=mk('div','',document.body);probe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  lookZone=mk('div','zone look',layer);joyZone=mk('div','zone joy',layer);
  joyBase=mk('div','joybase',layer);joyKnob=mk('div','joyknob',layer);lockChip=mk('div','lockchip',layer,'»');
  for(const [id,lab,sz,cx,cy,grp,cls] of BTN){const b=mk('button','tb g-'+grp+' '+(cls||''),layer);b.appendChild(document.createElement('span')).textContent=lab;b.dataset.id=id;els[id]=b}
  els.steerL=mk('button','tb g-veh steer',layer);els.steerL.dataset.id='steerL';els.steerL.appendChild(document.createElement('span')).textContent='◀';
  els.steerR=mk('button','tb g-veh steer',layer);els.steerR.dataset.id='steerR';els.steerR.appendChild(document.createElement('span')).textContent='▶';
  els.fireL=mk('button','tb g-foot fl',layer);els.fireL.appendChild(document.createElement('span')).textContent='FIRE';
  for(const [id,lab] of TOPBTN){const b=mk('button','tb top',layer);b.appendChild(document.createElement('span')).textContent=lab;els['t_'+id]=b}
  for(const [id,lab] of SLOTS){const b=mk('button','tb top slot',layer);b.appendChild(document.createElement('span')).textContent=lab;els['t_'+id]=b}
  // --- look zone (any pointer not on a control): free-look drag
  const looks=new Map();
  lookZone.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse')return;IN.touch=true;looks.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});try{lookZone.setPointerCapture(ev.pointerId)}catch(_){}ev.preventDefault();IN.onAny&&IN.onAny()});
  lookZone.addEventListener('pointermove',ev=>{const l=looks.get(ev.pointerId);if(!l)return;addLook(ev.clientX-l.x,ev.clientY-l.y);l.x=ev.clientX;l.y=ev.clientY});
  const lend=ev=>looks.delete(ev.pointerId);lookZone.addEventListener('pointerup',lend);lookZone.addEventListener('pointercancel',lend);
  // --- joystick
  joyZone.addEventListener('pointerdown',ev=>{if(joy.id!==null)return;IN.touch=true;joy.id=ev.pointerId;try{joyZone.setPointerCapture(ev.pointerId)}catch(_){}
    if(IN.lock){IN.lock=false;IN.sprint=false;lockChip.classList.remove('on')}
    // floating: re-centre the stick under the finger (clamped so it stays on screen)
    const R=joy.r;placeJoy(clamp(ev.clientX,R+8,innerWidth*0.42-8),clamp(ev.clientY,R+8,innerHeight-R-8));joyBase.classList.add('on');lockChip.classList.add('show');
    joyMove(ev);ev.preventDefault();IN.onAny&&IN.onAny()});
  joyZone.addEventListener('pointermove',ev=>{if(ev.pointerId===joy.id)joyMove(ev)});
  const jend=ev=>{if(ev.pointerId!==joy.id)return;joy.id=null;IN.mx=0;IN.my=IN.lock?1:0;IN.stickActive=false;IN.stickMag=0;joyBase.classList.remove('on');lockChip.classList.remove('show');
    if(!IN.lock)IN.sprint=false;placeJoy(joy.home.x,joy.home.y);if(IN.lock)joyKnob.style.top=(joy.cy-joy.r*0.5-joy.r*0.475)+'px'};
  joyZone.addEventListener('pointerup',jend);joyZone.addEventListener('pointercancel',jend);
  function joyMove(ev){const R=joy.r;let dx=ev.clientX-joy.cx,dy=ev.clientY-joy.cy;const l=Math.hypot(dx,dy);
    const lc=lockChip.getBoundingClientRect();const inChip=ev.clientX>lc.left-10&&ev.clientX<lc.right+10&&ev.clientY>lc.top-14&&ev.clientY<lc.bottom+10;
    if(inChip&&!IN.lock){IN.lock=true;IN.sprint=true;lockChip.classList.add('on')}
    if(l>R){dx=dx/l*R;dy=dy/l*R}
    joyKnob.style.left=(joy.cx+dx-parseFloat(joyKnob.style.width)/2)+'px';joyKnob.style.top=(joy.cy+dy-parseFloat(joyKnob.style.height)/2)+'px';
    const nx=dx/R,ny=dy/R,m=Math.hypot(nx,ny);IN.stickMag=m;IN.stickActive=m>0.1;IN.mx=m>0.1?nx:0;IN.my=m>0.1?-ny:(IN.lock?1:0);if(IN.lock&&m>0.1)IN.my=-ny;
    if(IN.lock&&m<=0.1)IN.my=1}
  // --- buttons
  const q=k=>()=>IN.press(k);
  holdBtn(els.fire,()=>{IN.fireR=true},()=>{IN.fireR=false},{look:true});
  holdBtn(els.fireL,()=>{IN.fireL=true},()=>{IN.fireL=false},{look:true});
  holdBtn(els.ads,()=>{if(S.adsToggle)IN.ads=!IN.ads;else{IN.ads=true;IN.adsHold=true}},()=>{if(IN.adsHold){IN.ads=false;IN.adsHold=false}});
  holdBtn(els.jump,q('jump'));holdBtn(els.reload,q('reload'));holdBtn(els.crouch,q('crouch'));holdBtn(els.prone,q('prone'));
  holdBtn(els.melee,q('melee'));holdBtn(els.grenade,q('grenade'));holdBtn(els.interact,q('interact'));holdBtn(els.car,q('car'));
  holdBtn(els.sprint,()=>{IN.sprint=!IN.sprint;if(!IN.sprint)IN.lock=false;lockChip.classList.toggle('on',IN.lock)});
  holdBtn(els.veh_gas,()=>{IN.gas=true},()=>{IN.gas=false});holdBtn(els.veh_brake,()=>{IN.brake=true},()=>{IN.brake=false});
  holdBtn(els.veh_hb,()=>{IN.hb=true},()=>{IN.hb=false});holdBtn(els.veh_exit,q('car'));
  holdBtn(els.steerL,()=>{IN.steerL=true},()=>{IN.steerL=false});holdBtn(els.steerR,()=>{IN.steerR=true},()=>{IN.steerR=false});
  lockChip.addEventListener('pointerdown',ev=>{if(IN.lock){IN.lock=false;IN.sprint=false;lockChip.classList.remove('on');ev.stopPropagation()}});
  holdBtn(els.t_view,q('view'));holdBtn(els.t_flash,q('flash'));holdBtn(els.t_inv,q('inv'));holdBtn(els.t_map,q('map'));holdBtn(els.t_gear,q('settings'));
  SLOTS.forEach(([id,l],i)=>holdBtn(els['t_'+id],()=>IN.press('slot'+(i+1))));
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
  function addLookMouse(dx,dy){if(IN.modal)return;const k=0.0022*S.sens*(IN.ads?S.adsSens:1);IN.lookX+=dx*k;IN.lookY+=dy*k*(S.invertY?-1:1)}
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
  if(joy.id!==null||IN.lock)return;
  const K=IN.keys;const kx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0),ky=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0);
  if(kx||ky){const l=Math.hypot(kx,ky);IN.mx=kx/l;IN.my=ky/l;IN.stickMag=1;IN.stickActive=true}else{IN.mx=0;IN.my=0;IN.stickMag=0;IN.stickActive=false}
}
