// ASHFALL v6 audio: real CC0 recorded samples (see LICENSES.txt) layered with WebAudio synthesis.
// Gunshots = recorded crack + synthesised low boom + convolution-reverb tail; footsteps vary by surface; positional (stereo pan, distance, speed-of-sound delay) for enemy sounds;
// ambient wind + night insects, low-health heartbeat, procedural combat music layer. Master / SFX / Music sliders + mute. Falls back to pure synthesis if a sample is missing.
const SAMPLES=['g_pistol','g_rifle','g_bolt','g_shotgun','r_mag','r_rifle','r_cock','r_rack','r_shell','r_click','r_latch',
  'f_concrete0','f_concrete1','f_concrete2','f_grass0','f_grass1','f_grass2','f_wood0','f_wood1','f_wood2','f_dirt0','f_dirt1','f_dirt2',
  'i_metal0','i_metal1','i_wood','i_dirt','i_flesh','i_punch','i_glass','m_swing','m_chop','s_dooropen_1','s_doorclose_1','s_creak1','s_handlecoins','s_cloth1','s_handlesmallleather','s_beltHandle1'.toLowerCase(),
  'x_boom','x_low','u_click','u_select','u_open','u_close','u_good','u_err','u_tick','u_toggle','u_hit','u_bong','u_pluck'];
const GUN={   // sample, playback rate, gain, synth boom (freq, vol), reverb send, lowpass-free
  pistol:{s:'g_pistol',r:1.0,g:0.95,bf:150,bv:0.30,rv:0.22},
  magnum:{s:'g_pistol',r:0.74,g:1.05,bf:95,bv:0.6,rv:0.38},
  smg:{s:'g_pistol',r:1.2,g:0.8,bf:170,bv:0.25,rv:0.2},
  rifle:{s:'g_rifle',r:1.0,g:1.0,bf:110,bv:0.5,rv:0.4},
  rifle2:{s:'g_rifle',r:1.14,g:0.9,bf:130,bv:0.4,rv:0.32},
  heavy:{s:'g_rifle',r:0.82,g:1.1,bf:85,bv:0.7,rv:0.45},
  shotgun:{s:'g_shotgun',r:1.0,g:1.15,bf:70,bv:0.85,rv:0.4},
  sniper:{s:'g_bolt',r:0.88,g:1.25,bf:55,bv:0.95,rv:0.8}};
export class Audio5{
  constructor(){this.ctx=null;this.enabled=true;this.engine=null;this.buf={};this.loaded=false;this.indoor=0;this.combat=0;this.music=0;this.night=0;this.hbT=0;this.lis={x:0,z:0,fx:0,fz:-1};
    this.muted=false;this.v={master:0.8,sfx:1,music:0.6};this._tmp={};
    try{const s=JSON.parse(localStorage.getItem('ashfall6_audio')||localStorage.getItem('ashfall5_audio')||'{}');if(s.muted!==undefined)this.muted=!!s.muted;if(s.vol!==undefined)this.v.master=s.vol;for(const k of['master','sfx','music'])if(typeof s[k]==='number')this.v[k]=s[k]}catch(_){}
    // unlock on any user gesture (iOS needs touchend / click; Chrome needs pointerdown / keydown) and resume after tab switches
    const un=()=>this.init();for(const e of['touchstart','touchend','pointerdown','mousedown','click','keydown'])addEventListener(e,un,{passive:true,capture:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.ctx&&this.ctx.state!=='running')this.ctx.resume().catch(()=>{})});}
  get vol(){return this.v.master}
  save(){try{localStorage.setItem('ashfall6_audio',JSON.stringify({muted:this.muted,vol:this.v.master,master:this.v.master,sfx:this.v.sfx,music:this.v.music}))}catch(_){}}
  init(){
    if(this.ctx){if(this.ctx.state!=='running'&&this.ctx.state!=='closed')this.ctx.resume().catch(()=>{});return}
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC){this.enabled=false;return}
      const c=this.ctx=new AC();this.master=c.createGain();this.master.gain.value=this.muted?0:this.v.master;
      const comp=c.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=5;comp.attack.value=0.004;comp.release.value=0.2;this.master.connect(comp);comp.connect(c.destination);
      this.sfxG=c.createGain();this.sfxG.gain.value=this.v.sfx;this.sfxG.connect(this.master);
      this.musG=c.createGain();this.musG.gain.value=this.v.music;this.musG.connect(this.master);
      this.ambG=c.createGain();this.ambG.gain.value=1;this.ambG.connect(this.sfxG);
      const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;this.nbuf=b;
      // procedural impulse response (outdoor tail): decaying filtered noise, stereo-decorrelated
      try{const L=Math.floor(c.sampleRate*1.9),ir=c.createBuffer(2,L,c.sampleRate);for(let ch=0;ch<2;ch++){const dd=ir.getChannelData(ch);let lp=0;for(let i=0;i<L;i++){const t=i/L;lp+=(Math.random()*2-1-lp)*(0.55-0.4*t);dd[i]=lp*Math.pow(1-t,2.6)*(i<c.sampleRate*0.012?i/(c.sampleRate*0.012):1)}}
        this.conv=c.createConvolver();this.conv.buffer=ir;this.revIn=c.createGain();this.revIn.gain.value=1;this.revOut=c.createGain();this.revOut.gain.value=0.55;this.revIn.connect(this.conv);this.conv.connect(this.revOut);this.revOut.connect(this.sfxG)}catch(e){this.conv=null}
      this.startWind();this.startNight();this.startMusic();this.loadAll();
      c.onstatechange=()=>{if(c.state==='interrupted'||c.state==='suspended')c.resume().catch(()=>{})};
    }catch(e){this.enabled=false;console.warn('audio unavailable',e)}
  }
  loadAll(){const c=this.ctx;const base=new URL('./audio/',import.meta.url).href;let left=SAMPLES.length;
    const done=()=>{if(--left<=0)this.loaded=true};
    for(const n of SAMPLES){fetch(base+n+'.mp3').then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(ab=>new Promise((res,rej)=>{const p=c.decodeAudioData(ab,res,rej);if(p&&p.then)p.then(res,rej)})).then(b=>{this.buf[n]=b;done()}).catch(()=>done())}}
  setMuted(m){this.muted=m;if(this.master)this.master.gain.setTargetAtTime(m?0:this.v.master,this.ctx.currentTime,0.03);this.save()}
  setVol(v){this.setLevel('master',v)}
  setLevel(k,v){this.v[k]=v;if(this.ctx){const t=this.ctx.currentTime;if(k==='master'&&!this.muted)this.master.gain.setTargetAtTime(v,t,0.03);else if(k==='sfx')this.sfxG.gain.setTargetAtTime(v,t,0.03);else if(k==='music')this.musG.gain.setTargetAtTime(v,t,0.03)}this.save()}
  get ok(){return this.ctx&&this.enabled&&!this.muted&&this.ctx.state==='running'}
  // ---- listener / positional helpers
  setListener(x,z,fx,fz){const l=this.lis;l.x=x;l.z=z;const m=Math.hypot(fx,fz)||1;l.fx=fx/m;l.fz=fz/m}
  spatial(x,z){if(x===undefined||x===null)return{d:0,pan:0,g:1};const l=this.lis,dx=x-l.x,dz=z-l.z,d=Math.hypot(dx,dz)||0.01;const side=(dx*(-l.fz)+dz*l.fx)/d;return{d,pan:Math.max(-1,Math.min(1,side))*Math.min(1,d/3),g:1/(1+d/32)}}
  // ---- primitives
  out(g,send=0,pan=0,bus){const c=this.ctx;let node=g;if(pan&&c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;g.connect(p);node=p}
    node.connect(bus||this.sfxG);if(send&&this.conv){const s=c.createGain();s.gain.value=send*(1+this.indoor*0.6);node.connect(s);s.connect(this.revIn)}}
  sample(name,{vol=1,rate=1,pan=0,send=0,when=0,lp=0,bus}={}){const b=this.buf[name];if(!b)return false;const c=this.ctx,s=c.createBufferSource();s.buffer=b;s.playbackRate.value=rate;
    const g=c.createGain();g.gain.value=vol;let n=s;if(lp){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=lp;s.connect(f);n=f}n.connect(g);this.out(g,send,pan,bus);s.start(c.currentTime+0.003+when);return true}
  noise(t,dur,{type='bandpass',f=1500,f2=null,q=1,vol=0.5,att=0.002,send=0,pan=0}={}){
    const c=this.ctx,s=c.createBufferSource();s.buffer=this.nbuf;s.loop=true;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+dur);fl.Q.value=q;
    const g=c.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+att);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(fl);fl.connect(g);this.out(g,send,pan);s.start(t,Math.random());s.stop(t+dur+0.05)}
  tone(t,dur,{type='sine',f=200,f2=null,vol=0.4,att=0.003,send=0,pan=0,bus}={}){
    const c=this.ctx,o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(10,f2),t+dur);
    const g=c.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+att);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);this.out(g,send,pan,bus);o.start(t);o.stop(t+dur+0.05)}
  now(){return this.ctx.currentTime+0.005}
  rnd(a,b){return a+Math.random()*(b-a)}
  // ---- weapons
  shot(kind='pistol',{supp=false,dist=0,x,z,rack=false,bolt=false}={}){
    if(!this.ok)return;let sp=this.spatial(x,z);if(x===undefined)sp={d:dist,pan:0,g:1/(1+dist/35)};
    const d=sp.d,k=sp.g,delay=Math.min(0.7,d/340);
    if(kind==='bow'){const t=this.now()+delay;this.noise(t,0.12,{type:'highpass',f:2500,vol:0.2*k,pan:sp.pan});this.tone(t,0.18,{type:'triangle',f:420,f2:110,vol:0.26*k,pan:sp.pan});this.sample('m_swing',{vol:0.5*k,rate:1.4,pan:sp.pan,when:delay});return}
    const G=GUN[kind]||GUN.pistol,rate=G.r*this.rnd(0.97,1.03)*(supp?1.12:1),far=Math.max(900,9000-d*55);
    const vol=G.g*k*(supp?0.42:1);
    const ok=this.sample(G.s,{vol,rate,pan:sp.pan,send:(supp?0.05:G.rv)*Math.min(1,0.5+d/60),when:delay,lp:supp?1700:far});
    const t=this.now()+delay;
    if(!supp){this.tone(t,0.22,{type:'sine',f:G.bf*1.7,f2:G.bf*0.45,vol:G.bv*k*0.8,pan:sp.pan});this.noise(t,0.05,{type:'highpass',f:3500,vol:0.22*k,pan:sp.pan})}
    else this.noise(t,0.09,{type:'lowpass',f:1300,f2:400,vol:0.3*k,pan:sp.pan});
    if(!ok)this.noise(t,0.2,{type:'lowpass',f:2400,f2:300,vol:0.8*k*(supp?0.4:1),q:0.7,send:0.35,pan:sp.pan});   // synth fallback if the sample did not load
    if(d<2){if(rack)this.sample('r_rack',{vol:0.5,rate:1,when:0.38});else if(bolt)this.sample('r_latch',{vol:0.55,rate:0.9,when:0.5})
      // brass tinkle
      if(!['shotgun'].includes(kind))this.sample('i_metal0',{vol:0.07,rate:this.rnd(2.2,3.2),when:0.28+Math.random()*0.1})}
  }
  dryClick(){if(!this.ok)return;if(!this.sample('r_click',{vol:0.5,rate:1.4})){const t=this.now();this.tone(t,0.03,{type:'square',f:1800,vol:0.12})}}
  reload(stage=0,kind='rifle'){if(!this.ok)return;
    if(kind==='shotgun'){if(stage===0)this.sample('r_click',{vol:0.5});else if(stage===2)this.sample('r_shell',{vol:0.6,rate:this.rnd(0.95,1.08)});return}
    const mag=(kind==='pistol'||kind==='magnum'||kind==='smg');
    if(stage===0){if(!this.sample(mag?'r_mag':'r_rifle',{vol:0.6,rate:kind==='sniper'?0.9:1}))this.noise(this.now(),0.05,{f:2400,vol:0.3,q:3})}
    else if(stage===2){if(!this.sample('r_latch',{vol:0.6,rate:mag?1.2:0.85}))this.noise(this.now(),0.06,{f:1800,vol:0.3,q:4})}
  }
  // ---- world sounds
  step(surf='dirt',run=false,{x,z,crouch=false}={}){if(!this.ok)return;const sp=this.spatial(x,z);if(sp.d>40)return;
    const n=Math.floor(Math.random()*3);let name=surf==='metal'?'i_metal0':'f_'+surf+n;if(surf==='dirt'&&Math.random()<0.5)name='f_dirt'+n;
    const v=(run?0.5:crouch?0.14:0.3)*sp.g,rate=(surf==='metal'?1.6:1)*this.rnd(0.9,1.1)*(run?1.06:1);
    if(!this.sample(name,{vol:v,rate,pan:sp.pan,send:this.indoor*0.15})){const t=this.now();this.noise(t,0.07,{type:'lowpass',f:700,f2:250,vol:(run?0.16:0.09)*sp.g,q:0.5,pan:sp.pan})}}
  impact(kind='dirt',x,z){if(!this.ok)return;const sp=this.spatial(x,z);if(sp.d>70)return;
    const m={metal:['i_metal'+(Math.random()<0.5?1:0),1],wood:['i_wood',1],flesh:['i_flesh',1.1],glass:['i_glass',1],concrete:['i_dirt',0.9],dirt:['i_dirt',1],ground:['i_dirt',1],box:['i_wood',0.9],enemy:['i_flesh',1.1]}[kind]||['i_dirt',1];
    this.sample(m[0],{vol:0.5*sp.g,rate:m[1]*this.rnd(0.9,1.15),pan:sp.pan,when:Math.min(0.5,sp.d/340)});
    if(sp.d<30&&Math.random()<0.5)this.noise(this.now()+Math.min(0.5,sp.d/340),0.12,{type:'highpass',f:2500,vol:0.1*sp.g,pan:sp.pan})}
  ui(kind='click'){if(!this.ok)return;const M={click:['u_click',0.5],open:['u_open',0.5],close:['u_close',0.45],take:['s_handlesmallleather',0.6],error:['u_err',0.4],good:['u_good',0.5],tick:['u_tick',0.35],toggle:['u_toggle',0.45],select:['u_select',0.45]}[kind];
    if(M&&this.sample(M[0],{vol:M[1],rate:kind==='take'?this.rnd(0.95,1.1):1}))return;
    const t=this.now();
    if(kind==='click')this.tone(t,0.05,{type:'triangle',f:900,f2:700,vol:0.1});else if(kind==='open')this.tone(t,0.09,{type:'triangle',f:500,f2:900,vol:0.12});
    else if(kind==='close')this.tone(t,0.08,{type:'triangle',f:800,f2:420,vol:0.1});else if(kind==='error')this.tone(t,0.14,{type:'sawtooth',f:160,f2:110,vol:0.12});
    else if(kind==='good'){this.tone(t,0.1,{type:'triangle',f:600,vol:0.14});this.tone(t+0.09,0.16,{type:'triangle',f:900,vol:0.14})}else this.tone(t,0.025,{type:'square',f:1400,vol:0.06})}
  hit(kind='body'){if(!this.ok)return;
    if(kind==='head'){this.sample('u_bong',{vol:0.5,rate:1.5});this.sample('u_hit',{vol:0.5,rate:1.8})}
    else if(kind==='kill'){this.sample('u_pluck',{vol:0.55,rate:0.9});this.sample('u_hit',{vol:0.5,rate:0.8})}
    else this.sample('u_hit',{vol:0.45,rate:1.2})}
  thud(vol=0.25){if(!this.ok)return;if(vol>0.2){if(this.sample('i_punch',{vol:vol*1.6,rate:this.rnd(0.9,1.1)}))return}else if(this.sample('i_dirt',{vol:vol*2.5,rate:0.8}))return;const t=this.now();this.tone(t,0.15,{type:'sine',f:110,f2:50,vol});this.noise(t,0.1,{type:'lowpass',f:500,vol:vol*0.6})}
  swing(){if(!this.ok)return;if(!this.sample('m_swing',{vol:0.5,rate:this.rnd(0.85,1.05)})){const t=this.now();this.noise(t,0.18,{type:'bandpass',f:700,f2:2200,vol:0.18,q:1.5,att:0.05})}}
  meleeHit(flesh=true){if(!this.ok)return;this.sample(flesh?'i_flesh':'i_metal1',{vol:0.8,rate:this.rnd(0.8,1)});if(flesh)this.sample('m_chop',{vol:0.35,rate:1.2})}
  door(open=true,x,z){if(!this.ok)return;const sp=this.spatial(x,z);if(!this.sample(open?'s_dooropen_1':'s_doorclose_1',{vol:0.6*sp.g,pan:sp.pan,send:0.1})){const t=this.now();this.tone(t,0.28,{type:'sawtooth',f:open?90:130,f2:open?160:70,vol:0.07});this.noise(t,0.3,{type:'bandpass',f:400,f2:200,vol:0.1,q:2,att:0.08})}}
  explode(dist=0,x,z){if(!this.ok)return;let sp=this.spatial(x,z);if(x===undefined)sp={d:dist,pan:0,g:1/(1+dist/50)};const k=sp.g,t=this.now()+Math.min(0.9,sp.d/340);
    this.sample('x_boom',{vol:1.1*k,rate:0.9,pan:sp.pan,send:0.7,when:Math.min(0.9,sp.d/340)});this.sample('x_low',{vol:1.0*k,rate:0.8,when:Math.min(0.9,sp.d/340)});
    this.tone(t,0.7,{type:'sine',f:90,f2:25,vol:0.8*k});this.noise(t,0.9,{type:'lowpass',f:2000,f2:90,vol:0.5*k,q:0.6,att:0.005,send:0.4})}
  pickup(){this.ui('take')}
  creak(){if(!this.ok)return;this.sample('s_creak1',{vol:0.25,rate:this.rnd(0.9,1.1)})}
  search(){if(!this.ok)return;if(!this.sample(Math.random()<0.5?'s_cloth1':'s_beltHandle1'.toLowerCase(),{vol:0.5,rate:this.rnd(0.9,1.1)})){const t=this.now();this.noise(t,0.14,{type:'bandpass',f:1500+Math.random()*1000,vol:0.12,q:1.5,att:0.03})}}
  coins(){if(!this.ok)return;this.sample('s_handlecoins',{vol:0.6})}
  radio(on=true){if(!this.ok)return;const t=this.now();this.noise(t,on?0.7:0.2,{type:'bandpass',f:1800,vol:0.18,q:0.8,att:0.02});if(on){this.tone(t+0.05,0.12,{type:'sine',f:880,vol:0.08});this.tone(t+0.22,0.12,{type:'sine',f:660,vol:0.08})}}
  bark(x,z){if(!this.ok)return;const sp=this.spatial(x,z);const t=this.now();this.tone(t,0.15,{type:'sawtooth',f:380,f2:190,vol:0.14*sp.g,pan:sp.pan});this.noise(t,0.1,{type:'bandpass',f:900,vol:0.14*sp.g,q:2,pan:sp.pan});this.tone(t+0.19,0.12,{type:'sawtooth',f:340,f2:170,vol:0.1*sp.g,pan:sp.pan})}
  alarm(){if(!this.ok)return;const t=this.now();this.tone(t,0.2,{type:'square',f:660,vol:0.07});this.tone(t+0.22,0.2,{type:'square',f:520,vol:0.07})}
  hurt(){if(!this.ok)return;const t=this.now();this.tone(t,0.18,{type:'sine',f:90,f2:55,vol:0.4});this.sample('i_punch',{vol:0.6,rate:0.7})}
  // ---- ambience (wind + night insects), heartbeat, combat music
  startWind(){const c=this.ctx,s=c.createBufferSource();s.buffer=this.nbuf;s.loop=true;const fl=c.createBiquadFilter();fl.type='bandpass';fl.frequency.value=380;fl.Q.value=0.7;
    const g=c.createGain();g.gain.value=0.05;const lfo=c.createOscillator();lfo.frequency.value=0.13;const lg=c.createGain();lg.gain.value=0.035;lfo.connect(lg);lg.connect(g.gain);
    const lfo2=c.createOscillator();lfo2.frequency.value=0.07;const l2=c.createGain();l2.gain.value=180;lfo2.connect(l2);l2.connect(fl.frequency);
    s.connect(fl);fl.connect(g);g.connect(this.ambG);s.start();lfo.start();lfo2.start();this.windG=g}
  setWind(v){if(this.windG)this.windG.gain.setTargetAtTime((0.03+v*0.06)*(1-this.indoor*0.6),this.ctx.currentTime,0.5)}
  startNight(){const c=this.ctx;this.cric=c.createGain();this.cric.gain.value=0;this.cric.connect(this.ambG);
    for(const [f,r,ph] of[[4300,13,0],[5100,11,0.3],[3800,9.5,0.6]]){const o=c.createOscillator();o.type='sine';o.frequency.value=f;const am=c.createGain();am.gain.value=0;const l=c.createOscillator();l.type='square';l.frequency.value=r;const lg=c.createGain();lg.gain.value=0.5;const dc=c.createConstantSource?c.createConstantSource():null;
      // gated chirps: square LFO (0/1) through slow second LFO so chirps come in bursts
      const l2=c.createOscillator();l2.frequency.value=0.35+ph*0.2;const l2g=c.createGain();l2g.gain.value=0.5;const sum=c.createGain();sum.gain.value=1;
      l.connect(lg);lg.connect(am.gain);l2.connect(l2g);l2g.connect(am.gain);am.gain.value=0.25;o.connect(am);am.connect(this.cric);o.start();l.start();l2.start()}}
  startMusic(){const c=this.ctx;this.musBus=c.createGain();this.musBus.gain.value=0;const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=700;lp.connect(this.musBus);this.musBus.connect(this.musG);this.musLP=lp;
    for(const [f,d] of[[55,0],[55.4,0],[82.4,0],[65.4,3]]){const o=c.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=d;const g=c.createGain();g.gain.value=0.07;o.connect(g);g.connect(lp);o.start()}
    this.beatT=0;this.beat=0}
  setCombat(level){this.combat=level}
  // call once per frame: hp, night 0..1, combat 0..1, indoors 0..1, dt
  update(dt,{hp=100,night=0,combat=0,indoor=0,inCar=false}={}){
    if(!this.ctx||!this.enabled||this.ctx.state!=='running')return;const c=this.ctx,t=c.currentTime;
    this.indoor+=(indoor-this.indoor)*Math.min(1,dt*3);
    this.cric.gain.setTargetAtTime(night*0.016*(1-this.indoor*0.7),t,0.8);
    // combat music layer
    this.combat+=((combat)-this.combat)*Math.min(1,dt*(combat>this.combat?1.2:0.35));
    this.musBus.gain.setTargetAtTime(this.combat>0.05?this.combat*0.55:0,t,0.4);this.musLP.frequency.setTargetAtTime(500+this.combat*1400,t,0.4);
    if(this.combat>0.15){this.beatT-=dt;if(this.beatT<=0){this.beatT=0.3;const b=this.beat++%8;const tt=this.now();
      if(b%4===0)this.tone(tt,0.2,{type:'sine',f:90,f2:38,vol:0.5*this.combat,bus:this.musG});
      if(b%2===1)this.noise(tt,0.05,{type:'highpass',f:6000,vol:0.07*this.combat});
      if(b===6)this.tone(tt,0.25,{type:'sine',f:70,f2:35,vol:0.35*this.combat,bus:this.musG})}}
    // heartbeat when hurt
    if(hp<35&&hp>0){this.hbT-=dt;if(this.hbT<=0){const k=1-hp/35;this.hbT=1.0-0.45*k;const tt=this.now();this.tone(tt,0.14,{type:'sine',f:62,f2:40,vol:0.55});this.tone(tt+0.17,0.12,{type:'sine',f:55,f2:38,vol:0.4})}}
  }
  engineUpdate(on,speed01){const c=this.ctx;if(!c||!this.enabled)return;
    if(on&&!this.engine){const o=c.createOscillator();o.type='sawtooth';const o2=c.createOscillator();o2.type='square';const fl=c.createBiquadFilter();fl.type='lowpass';fl.frequency.value=380;const g=c.createGain();g.gain.value=0;
      o.connect(fl);o2.connect(fl);fl.connect(g);g.connect(this.sfxG);o.start();o2.start();this.engine={o,o2,fl,g}}
    const e=this.engine;if(!e)return;const t=c.currentTime;
    if(on){const f=34+speed01*95;e.o.frequency.setTargetAtTime(f,t,0.08);e.o2.frequency.setTargetAtTime(f*0.5,t,0.08);e.fl.frequency.setTargetAtTime(260+speed01*700,t,0.1);e.g.gain.setTargetAtTime(this.muted?0:0.06+speed01*0.05,t,0.1)}
    else e.g.gain.setTargetAtTime(0,t,0.1)}
}
