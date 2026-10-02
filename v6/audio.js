// ASHFALL v5 WebAudio synth: no audio files. Gunshots, reloads, footsteps, wind, UI, engine, radio.
export class Audio5{
  constructor(){this.ctx=null;this.muted=false;this.vol=0.7;this.enabled=true;this.engine=null;this.lastStep=0;
    try{const s=JSON.parse(localStorage.getItem('ashfall5_audio')||'{}');if(s.muted!==undefined)this.muted=!!s.muted;if(s.vol!==undefined)this.vol=s.vol}catch(_){}}
  save(){try{localStorage.setItem('ashfall5_audio',JSON.stringify({muted:this.muted,vol:this.vol}))}catch(_){}}
  init(){ // must be called from a user gesture (touch/click/key)
    if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return}
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC){this.enabled=false;return}
      const c=this.ctx=new AC();this.master=c.createGain();this.master.gain.value=this.muted?0:this.vol;
      const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=6;this.master.connect(comp);comp.connect(c.destination);
      const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;l=l*0.4+w*0.6;d[i]=w}this.nbuf=b;
      // feedback delay as a cheap "outdoor echo" send
      this.echo=c.createDelay(1);this.echo.delayTime.value=0.23;const fb=c.createGain();fb.gain.value=0.28;const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1800;
      this.echo.connect(lp);lp.connect(fb);fb.connect(this.echo);const eo=c.createGain();eo.gain.value=0.5;lp.connect(eo);eo.connect(this.master);this.send=c.createGain();this.send.gain.value=0.35;this.send.connect(this.echo);
      this.startWind();
    }catch(e){this.enabled=false;console.warn('audio unavailable',e)}
  }
  setMuted(m){this.muted=m;if(this.master)this.master.gain.setTargetAtTime(m?0:this.vol,this.ctx.currentTime,0.03);this.save()}
  setVol(v){this.vol=v;if(this.master&&!this.muted)this.master.gain.setTargetAtTime(v,this.ctx.currentTime,0.03);this.save()}
  get ok(){return this.ctx&&this.enabled&&!this.muted&&this.ctx.state!=='closed'}
  out(g,send=0){g.connect(this.master);if(send&&this.send){const s=this.ctx.createGain();s.gain.value=send;g.connect(s);s.connect(this.send)}}
  noise(t,dur,{type='bandpass',f=1500,f2=null,q=1,vol=0.5,att=0.002,send=0}={}){
    const c=this.ctx,s=c.createBufferSource();s.buffer=this.nbuf;s.loop=true;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+dur);fl.Q.value=q;
    const g=c.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+att);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(fl);fl.connect(g);this.out(g,send);s.start(t,Math.random());s.stop(t+dur+0.05)}
  tone(t,dur,{type='sine',f=200,f2=null,vol=0.4,att=0.003,send=0}={}){
    const c=this.ctx,o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(10,f2),t+dur);
    const g=c.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+att);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);this.out(g,send);o.start(t);o.stop(t+dur+0.05)}
  now(){return this.ctx.currentTime+0.005}
  shot(kind='pistol',{supp=false,dist=0}={}){
    if(!this.ok)return;const t=this.now(),k=1/(1+dist/35),lpf=Math.max(500,6000-dist*40);
    if(kind==='bow'){this.noise(t,0.12,{type:'highpass',f:2500,vol:0.25*k});this.tone(t,0.18,{type:'triangle',f:420,f2:110,vol:0.3*k});return}
    const P={pistol:{n:0.13,f:2200,v:0.55,th:150,tv:0.5},magnum:{n:0.22,f:1500,v:0.8,th:95,tv:0.8},smg:{n:0.1,f:2800,v:0.45,th:170,tv:0.4},rifle:{n:0.2,f:1800,v:0.7,th:110,tv:0.7},rifle2:{n:0.17,f:2600,v:0.65,th:130,tv:0.6},
      heavy:{n:0.28,f:1300,v:0.85,th:85,tv:0.85},shotgun:{n:0.34,f:900,v:0.95,th:70,tv:1.0},sniper:{n:0.5,f:1100,v:1.0,th:60,tv:1.1}}[kind]||{n:0.15,f:2000,v:0.5,th:130,tv:0.5};
    const sv=supp?0.35:1;
    this.noise(t,P.n*(supp?0.7:1),{type:'lowpass',f:supp?1400:P.f*1.6,f2:supp?500:P.f*0.3,vol:P.v*k*sv,q:0.7,send:supp?0.05:0.4});
    this.noise(t,0.04,{type:'highpass',f:supp?2500:4000,vol:0.5*k*sv,send:0});
    this.tone(t,0.16,{type:'sine',f:P.th*1.8,f2:P.th*0.5,vol:P.tv*k*sv});
    if(!lpf)return;
  }
  dryClick(){if(!this.ok)return;const t=this.now();this.tone(t,0.03,{type:'square',f:1800,vol:0.12})}
  reload(stage=0){if(!this.ok)return;const t=this.now();
    if(stage===0){this.noise(t,0.05,{type:'bandpass',f:2400,vol:0.3,q:3});this.tone(t,0.04,{type:'square',f:700,f2:400,vol:0.1})}
    else if(stage===1){this.noise(t,0.07,{type:'bandpass',f:1200,vol:0.35,q:2});this.tone(t,0.06,{type:'square',f:350,f2:200,vol:0.14})}
    else{this.noise(t,0.05,{type:'bandpass',f:3000,vol:0.35,q:4});this.noise(t+0.07,0.06,{type:'bandpass',f:1800,vol:0.35,q:4});this.tone(t+0.07,0.05,{type:'square',f:500,f2:300,vol:0.12})}}
  step(surf='dirt',run=false){if(!this.ok)return;const t=this.now();this.noise(t,0.07,{type:'lowpass',f:surf==='metal'?1600:700,f2:250,vol:(run?0.16:0.09),q:0.5});}
  ui(kind='click'){if(!this.ok)return;const t=this.now();
    if(kind==='click')this.tone(t,0.05,{type:'triangle',f:900,f2:700,vol:0.1});
    else if(kind==='open')this.tone(t,0.09,{type:'triangle',f:500,f2:900,vol:0.12});
    else if(kind==='close')this.tone(t,0.08,{type:'triangle',f:800,f2:420,vol:0.1});
    else if(kind==='take'){this.tone(t,0.07,{type:'sine',f:700,f2:1100,vol:0.14});this.noise(t,0.05,{type:'bandpass',f:2500,vol:0.1})}
    else if(kind==='error')this.tone(t,0.14,{type:'sawtooth',f:160,f2:110,vol:0.12});
    else if(kind==='good'){this.tone(t,0.1,{type:'triangle',f:600,vol:0.14});this.tone(t+0.09,0.16,{type:'triangle',f:900,vol:0.14})}
    else if(kind==='tick')this.tone(t,0.025,{type:'square',f:1400,vol:0.06})}
  hit(kind='body'){if(!this.ok)return;const t=this.now();if(kind==='head'){this.tone(t,0.06,{type:'square',f:1300,f2:900,vol:0.14});this.noise(t,0.08,{f:3000,vol:0.15})}else if(kind==='kill'){this.tone(t,0.12,{type:'triangle',f:600,f2:300,vol:0.16})}else this.tone(t,0.04,{type:'square',f:1000,f2:800,vol:0.08})}
  thud(vol=0.25){if(!this.ok)return;const t=this.now();this.tone(t,0.15,{type:'sine',f:110,f2:50,vol});this.noise(t,0.1,{type:'lowpass',f:500,vol:vol*0.6})}
  swing(){if(!this.ok)return;const t=this.now();this.noise(t,0.18,{type:'bandpass',f:700,f2:2200,vol:0.18,q:1.5,att:0.05})}
  door(open=true){if(!this.ok)return;const t=this.now();this.tone(t,0.28,{type:'sawtooth',f:open?90:130,f2:open?160:70,vol:0.07});this.noise(t,0.3,{type:'bandpass',f:400,f2:200,vol:0.1,q:2,att:0.08})}
  explode(dist=0){if(!this.ok)return;const t=this.now(),k=1/(1+dist/50);this.noise(t,1.1,{type:'lowpass',f:2200,f2:90,vol:1.0*k,q:0.6,att:0.005,send:0.5});this.tone(t,0.7,{type:'sine',f:90,f2:25,vol:1.0*k})}
  pickup(){this.ui('take')}
  creak(){if(!this.ok)return;const t=this.now();this.tone(t,0.5,{type:'sawtooth',f:140+Math.random()*60,f2:90,vol:0.03})}
  search(){if(!this.ok)return;const t=this.now();this.noise(t,0.14,{type:'bandpass',f:1500+Math.random()*1000,vol:0.12,q:1.5,att:0.03})}
  radio(on=true){if(!this.ok)return;const t=this.now();this.noise(t,on?0.7:0.2,{type:'bandpass',f:1800,vol:0.18,q:0.8,att:0.02});if(on){this.tone(t+0.05,0.12,{type:'sine',f:880,vol:0.08});this.tone(t+0.22,0.12,{type:'sine',f:660,vol:0.08})}}
  bark(){if(!this.ok)return;const t=this.now();this.tone(t,0.15,{type:'sawtooth',f:380,f2:190,vol:0.12});this.noise(t,0.1,{type:'bandpass',f:900,vol:0.12,q:2})}
  alarm(){if(!this.ok)return;const t=this.now();this.tone(t,0.2,{type:'square',f:660,vol:0.07});this.tone(t+0.22,0.2,{type:'square',f:520,vol:0.07})}
  startWind(){const c=this.ctx,s=c.createBufferSource();s.buffer=this.nbuf;s.loop=true;const fl=c.createBiquadFilter();fl.type='bandpass';fl.frequency.value=380;fl.Q.value=0.7;
    const g=c.createGain();g.gain.value=0.05;const lfo=c.createOscillator();lfo.frequency.value=0.13;const lg=c.createGain();lg.gain.value=0.035;lfo.connect(lg);lg.connect(g.gain);
    const lfo2=c.createOscillator();lfo2.frequency.value=0.07;const l2=c.createGain();l2.gain.value=180;lfo2.connect(l2);l2.connect(fl.frequency);
    s.connect(fl);fl.connect(g);g.connect(this.master);s.start();lfo.start();lfo2.start();this.windG=g}
  setWind(v){if(this.windG)this.windG.gain.setTargetAtTime(0.03+v*0.06,this.ctx.currentTime,0.5)}
  engineUpdate(on,speed01){const c=this.ctx;if(!c||!this.enabled)return;
    if(on&&!this.engine){const o=c.createOscillator();o.type='sawtooth';const o2=c.createOscillator();o2.type='square';const fl=c.createBiquadFilter();fl.type='lowpass';fl.frequency.value=380;const g=c.createGain();g.gain.value=0;
      o.connect(fl);o2.connect(fl);fl.connect(g);g.connect(this.master);o.start();o2.start();this.engine={o,o2,fl,g}}
    const e=this.engine;if(!e)return;const t=c.currentTime;
    if(on){const f=34+speed01*95;e.o.frequency.setTargetAtTime(f,t,0.08);e.o2.frequency.setTargetAtTime(f*0.5,t,0.08);e.fl.frequency.setTargetAtTime(260+speed01*700,t,0.1);e.g.gain.setTargetAtTime(this.muted?0:0.06+speed01*0.05,t,0.1)}
    else e.g.gain.setTargetAtTime(0,t,0.1)}
}
