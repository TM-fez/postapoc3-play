// ASHFALL: RUST HAVEN — gritty post-apocalyptic open-world slice (Three.js r160)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ITEMS, WEAPONS, RARITY, NOTES, RECIPES, COOK, LOOT, VENDOR_WEAPONS, AMMO_BY_CAL, CAL_DEFAULT_AMMO } from './data.js';
import { Inv, mkInst, weaponStats, rollLoot } from './inv.js';
import { S, saveSettings, IN, initInput, layout as layoutInput, setLabel, showBtn, setOn, setMode, slotLabel, slotUpdate, setAmmoLow, startLayoutEditor, stopLayoutEditor, resetLayout, pollKeys, releaseLock, SETTINGS_DEFAULT } from './input.js';
import { svg, ICONS, weaponClass, itemIcon } from './icons.js';
import { Audio5 } from './audio.js';
import { buildGunGeo } from './guns.js';
import { containerParts, makeDrop, CONTAINER_NAMES, SEARCH_TIME } from './props.js';

const $ = id => document.getElementById(id);
window.addEventListener('error', e => { try{ (window.__dbgLog||console.log)('error', e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno) }catch(_){} });
const setProg = (p,t) => { try{ window.__prog && window.__prog(p,t) }catch(_){} };
const stage = (p,t) => { setProg(p,t); return new Promise(r=>setTimeout(r,30)) };   // lets the browser paint the loading bar between heavy steps
const Q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const MOBILE = Q.get('mobile') === '1' || isTouch;
const usePost = Q.has('fx') ? Q.get('fx') === '1' : !MOBILE;

// ============================================================ utils
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let R = mulberry32(1337);
const rr=(a,b)=>a+(b-a)*R();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const sm=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const pick=a=>a[Math.floor(R()*a.length)];
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function hash2(x,y){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u),v)}
function fbm(x,y,o=4){let s=0,a=.5,f=1,t=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f,y*f);t+=a;f*=2.03;a*=.5}return s/t}
// tileable noise for textures
function pn(x,y,px,py){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const x0=((xi%px)+px)%px,x1=(x0+1)%px,y0=((yi%py)+py)%py,y1=(y0+1)%py;
  return lerp(lerp(hash2(x0,y0),hash2(x1,y0),u),lerp(hash2(x0,y1),hash2(x1,y1),u),v)}
function pfbm(u,v,f,oct=4,fy=f){let s=0,a=.5,t=0;for(let i=0;i<oct;i++){const fx=f<<i,fyy=fy<<i;s+=a*pn(u*fx,v*fyy,fx,fyy);t+=a;a*=.5}return s/t}

// ============================================================ patched fog: height-dependent ground haze
THREE.ShaderChunk.fog_pars_vertex=`#ifdef USE_FOG
varying float vFogDepth; varying float vFogWY;
#endif`;
THREE.ShaderChunk.fog_vertex=`#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vFogWY = (transpose(mat3(viewMatrix)) * mvPosition.xyz).y + cameraPosition.y;
#endif`;
THREE.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
uniform vec3 fogColor; varying float vFogDepth; varying float vFogWY;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
#endif`;
THREE.ShaderChunk.fog_fragment=`#ifdef USE_FOG
#ifdef FOG_EXP2
float hf = 1.0 + 1.35*exp(-max(vFogWY,0.0)*0.05);
float fogFactor = 1.0 - exp( - fogDensity * fogDensity * hf * hf * vFogDepth * vFogDepth );
#else
float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
#endif
gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

// ============================================================ renderer
const canvas=$('c');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:!usePost&&!MOBILE,powerPreference:'high-performance'})}
catch(e){ if(window.__fail)window.__fail('Your browser could not start WebGL graphics. Try Chrome or Safari, and make sure hardware acceleration / data saver is not blocking it.'); throw e }
const PR_MAX=Math.min(window.devicePixelRatio||1,MOBILE?1.25:1.5);
let PR=PR_MAX;
renderer.setPixelRatio(PR);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(window.__fail)window.__fail('The graphics context was lost (phone ran out of GPU memory?). Reloading…');setTimeout(()=>location.reload(),2500)});
renderer.setSize(innerWidth,innerHeight,false);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=MOBILE?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=Number(Q.get('exp')||(MOBILE?1.4:1.55));
const MAXANI=Math.min(8,renderer.capabilities.getMaxAnisotropy());

const scene=new THREE.Scene();
const FOGC=new THREE.Color(0xb59676);
scene.background=FOGC.clone();
scene.fog=new THREE.FogExp2(FOGC.getHex(),MOBILE?0.0015:0.0021);   // lighter fog on phones so distant hills keep their colour
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.15,2600);
scene.add(camera);

// ============================================================ lights
const sunDir=new THREE.Vector3(-0.70,0.20,-0.68).normalize();   // direction TOWARD the sun (NW, low)
// phones: slightly less saturated light so biome colours (sand / scorch / grass / rock) survive ACES instead of all saturating to one orange
const hemi=new THREE.HemisphereLight(MOBILE?0xd2c4b2:0xc4ad94,MOBILE?0x7a6858:0x6a5340,MOBILE?1.5:1.35);scene.add(hemi);
const sun=new THREE.DirectionalLight(MOBILE?0xffc48c:0xffb06a,MOBILE?3.6:4.2);
sun.castShadow=true;
const SMAP=MOBILE?768:2048;sun.shadow.mapSize.set(SMAP,SMAP);
{const sc=sun.shadow.camera;const E=MOBILE?34:46;sc.left=-E;sc.right=E;sc.top=E;sc.bottom=-E;sc.near=1;sc.far=220}
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.05;
scene.add(sun,sun.target);
const fillL=new THREE.DirectionalLight(0x8096b8,0.7);fillL.position.set(sunDir.x*-1,0.5,sunDir.z*-1);scene.add(fillL);

// ============================================================ sky dome (HDR linear)
const skyUniforms={uNight:{value:0},uDay:{value:1},uTime:{value:0},uSun:{value:sunDir},uDisc:{value:1},
  cHor:{value:FOGC.clone()},cMid:{value:new THREE.Color(0x9a8068)},cTop:{value:new THREE.Color(0x4d5560)},cSun:{value:new THREE.Color(0xffa860)}};
const skyMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,side:THREE.BackSide,fog:false,uniforms:skyUniforms,
  vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
  varying vec3 vD;uniform vec3 uSun,cHor,cMid,cTop,cSun;uniform float uTime,uDisc,uNight,uDay;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.07;a*=.5;}return s;}
  void main(){
    vec3 d=normalize(vD);float y=d.y;
    vec3 col=mix(cHor,cMid,smoothstep(0.0,0.22,y));
    col=mix(col,cTop,smoothstep(0.12,0.8,y));
    if(y<0.)col=cHor;
    vec3 S=normalize(uSun);float sd=max(dot(d,S),0.);
    // warm bloom around sun
    col+=cSun*(pow(sd,3.)*0.22+pow(sd,10.)*0.35);
    vec2 uv=d.xz/(max(y,0.0)+0.28)*0.8+vec2(uTime*0.003,0.);
    float c=fb(uv*1.5);float band=smoothstep(0.015,0.4,y)*(1.-smoothstep(0.65,1.0,y));
    float cl=smoothstep(0.40,0.78,c)*band;
    float lit=pow(sd,2.)*1.3+0.08;
    vec3 cloudCol=mix(vec3(0.20,0.15,0.13),vec3(1.5,0.78,0.38),clamp(lit,0.,1.));
    cloudCol+=cSun*pow(sd,6.)*0.9*smoothstep(0.35,0.7,c);   // silver/gold lining near sun
    col=mix(col,cloudCol*max(uDay,0.06),cl*0.82);
    {vec2 sp=floor(d.xz/(max(y,0.02)+0.35)*150.);float sh=h(sp);col+=vec3(1.0,0.95,0.9)*step(0.9935,sh)*uNight*smoothstep(0.04,0.3,y)*(0.5+0.5*h(sp+7.));
     float md=max(dot(d,-S),0.);col+=vec3(0.75,0.82,1.0)*(smoothstep(0.9987,0.9991,md)*2.2+pow(md,40.)*0.16+pow(md,400.)*0.5)*uNight*step(0.02,y);}
    float streak=fb(vec2(d.x*6.+uTime*0.006,y*26.));
    col+=vec3(0.05,0.03,0.015)*streak*(1.-smoothstep(0.,0.16,y));
    float disc=smoothstep(0.9988,0.9994,sd)*18.+pow(sd,200.)*5.;
    col+=cSun*disc*uDisc*(1.-0.7*cl);
    col=mix(col,cHor,(1.-smoothstep(0.0,0.05,y))*0.9);
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(1500,32,16),skyMat);
sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);

// image-based lighting from the sky (cheap PMREM) so metals / cars pick up warm sky reflections
{
  const envMat=skyMat.clone();envMat.uniforms={...skyUniforms,uDisc:{value:0.25}};
  const es=new THREE.Scene();es.add(new THREE.Mesh(new THREE.SphereGeometry(50,24,12),envMat));
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromScene(es,0.03,1,200).texture;pm.dispose();
}

// ============================================================ post processing
let composer=null,bloom=null,gradePass=null,godPass=null;
if(usePost){
  const W=innerWidth*PR,H=innerHeight*PR;
  const rt=new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType,samples:Q.get('msaa')==='0'?0:4});
  composer=new EffectComposer(renderer,rt);
  composer.addPass(new RenderPass(scene,camera));
  godPass=new ShaderPass({uniforms:{tDiffuse:{value:null},uSun:{value:new THREE.Vector2(.5,.5)},uInt:{value:1}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 uSun;uniform float uInt;varying vec2 vUv;
    void main(){
      vec4 base=texture2D(tDiffuse,vUv);
      if(uInt>0.001){
        vec2 dir=uSun-vUv;vec2 st=dir/28.0*0.85;vec2 p=vUv;float w=1.0;vec3 acc=vec3(0.);
        for(int i=0;i<28;i++){p+=st;vec3 s=texture2D(tDiffuse,p).rgb;float l=max(dot(s,vec3(.3,.55,.15))-1.5,0.);acc+=s*l*w;w*=0.935;}
        float fall=1.0-smoothstep(0.2,1.5,length(dir));
        base.rgb+=acc*vec3(1.0,0.72,0.42)*uInt*0.028*(0.35+fall);
      }
      gl_FragColor=base;}`});
  composer.addPass(godPass);
  bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.55,0.75,0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  gradePass=new ShaderPass({uniforms:{tDiffuse:{value:null},uTime:{value:0},uGrain:{value:0.055},uVig:{value:0.85},uAsp:{value:innerWidth/innerHeight},uHurt:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uGrain,uVig,uAsp,uHurt;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 c=vUv-.5;float r2=dot(c*vec2(uAsp,1.),c*vec2(uAsp,1.));
      float ca=0.0045*r2;
      vec3 col=vec3(texture2D(tDiffuse,vUv-c*ca).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv+c*ca).b);
      float l=dot(col,vec3(.299,.587,.114));
      col=mix(vec3(l),col,0.80);
      col*=mix(vec3(0.93,1.0,1.06),vec3(1.07,1.0,0.88),smoothstep(.08,.75,l));
      col=clamp(col,0.,1.);
      col=col*col*(3.-2.*col)*0.30+col*0.70;
      col=pow(col,vec3(1.06));
      float v=smoothstep(1.05,0.28,sqrt(r2)*1.15);col*=mix(1.0,v,uVig);
      col=mix(col,col*vec3(1.0,0.55,0.5),uHurt*smoothstep(0.1,0.7,sqrt(r2)));
      float g=h(vUv*vec2(1280.,720.)+fract(uTime*7.3)*91.7)-.5;col+=g*uGrain*(1.0-l*0.6);
      gl_FragColor=vec4(col,1.);}`});
  composer.addPass(gradePass);
}

// ============================================================ procedural PBR-ish textures
const TS=MOBILE?256:512;
function genTex(S,fn,{nStr=2.2,aniso=true}={}){
  const hgt=new Float32Array(S*S),cA=document.createElement('canvas'),cR=document.createElement('canvas'),cN=document.createElement('canvas');
  cA.width=cA.height=cR.width=cR.height=cN.width=cN.height=S;
  const iA=cA.getContext('2d').createImageData(S,S),iR=cR.getContext('2d').createImageData(S,S),iN=cN.getContext('2d').createImageData(S,S);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const o=fn(x/S,y/S,x,y),i=y*S+x,p=i*4;
    iA.data[p]=clamp(o[0],0,1)*255;iA.data[p+1]=clamp(o[1],0,1)*255;iA.data[p+2]=clamp(o[2],0,1)*255;iA.data[p+3]=255;
    const r=clamp(o[3],0,1)*255;iR.data[p]=r;iR.data[p+1]=r;iR.data[p+2]=r;iR.data[p+3]=255;hgt[i]=o[4];
  }
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const xl=hgt[y*S+(x+S-1)%S],xr=hgt[y*S+(x+1)%S],yu=hgt[((y+S-1)%S)*S+x],yd=hgt[((y+1)%S)*S+x];
    let nx=(xl-xr)*nStr,ny=(yu-yd)*nStr,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    const p=(y*S+x)*4;iN.data[p]=(nx*.5+.5)*255;iN.data[p+1]=(ny*.5+.5)*255;iN.data[p+2]=(nz*.5+.5)*255;iN.data[p+3]=255;
  }
  cA.getContext('2d').putImageData(iA,0,0);cR.getContext('2d').putImageData(iR,0,0);cN.getContext('2d').putImageData(iN,0,0);
  const mk=(c,srgb)=>{const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso?MAXANI:1;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t};
  return {map:mk(cA,true),rough:mk(cR,false),normal:mk(cN,false)};
}
const mixc=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
await stage(0.06,'Preparing textures');
const T={};
T.rust=genTex(TS,(u,v)=>{
  // corrugated sheet: vertical ridges, patchy flaking paint, rust streaking from top
  const ridge=Math.sin(u*Math.PI*2*8);
  const blot=pfbm(u,v,4,5),streak=pfbm(u,v,14,3,2),fine=pfbm(u,v,48,2);
  let rust=sm(0.42,0.68,blot*0.7+streak*0.45)+ (ridge>0.55?0.12:0);
  rust=clamp(rust,0,1);
  const paint=mixc([0.50,0.52,0.50],[0.34,0.40,0.42],pfbm(u,v,3,2));
  let col=mixc(paint,[0.42,0.20,0.09],rust);
  col=mixc(col,[0.2,0.1,0.05],sm(0.6,0.85,blot*streak*1.6)*rust);
  const g=0.85+fine*0.3;col=col.map(c=>c*g*(0.88+0.12*ridge));
  const flake=sm(0.52,0.58,pfbm(u,v,24,2));col=mixc(col,[0.55,0.55,0.53],flake*(1-rust)*0.3);
  return [...col,lerp(0.42,0.93,rust)*(0.9+fine*0.2),ridge*0.5+rust*fine*0.6+fine*0.1];
});
T.plate=genTex(TS,(u,v)=>{
  const blot=pfbm(u,v,5,5),fine=pfbm(u,v,64,2),streak=pfbm(u,v,10,3,2);
  const rust=clamp(sm(0.38,0.68,blot*.65+streak*.5),0,1);
  // riveted panel seams
  const sx=Math.abs((u*4)%1-.5),sy=Math.abs((v*4)%1-.5);const seam=sm(0.47,0.5,Math.max(sx,sy));
  const rv=Math.min(Math.hypot(((u*16)%1)-.5,((v*16)%1)-.5),1)<0.12&&(Math.max(sx,sy)>0.4)?1:0;
  let col=mixc(mixc([0.44,0.45,0.44],[0.30,0.34,0.36],pfbm(u,v,3,2)),[0.40,0.18,0.08],rust);
  col=col.map(c=>c*(0.8+fine*0.35)*(1-seam*0.4)*(1+rv*0.2));
  return [...col,lerp(0.4,0.92,rust)+fine*0.1,seam*-0.5+rv*0.6+fine*0.15+rust*0.2];
});
T.concrete=genTex(TS,(u,v)=>{
  const b=pfbm(u,v,4,5),f=pfbm(u,v,40,3),s=pfbm(u,v,8,3,2);
  const stain=sm(0.45,0.8,s*0.9+b*0.3);
  // cracks
  const cr=Math.abs(pfbm(u,v,6,3)-0.5),crack=cr<0.012?1:0;
  const pit=sm(0.66,0.78,pfbm(u,v,32,2));
  let col=mixc([0.62,0.60,0.56],[0.42,0.40,0.37],stain*0.7);
  col=mixc(col,[0.26,0.22,0.19],crack*0.8);
  col=col.map(c=>c*(0.84+f*0.3)*(1-pit*0.25));
  return [...col,0.88+f*0.1,f*0.5+b*0.4-crack*0.8-pit*0.3];
});
T.wood=genTex(TS,(u,v)=>{
  const plank=Math.floor(u*6),pu=(u*6)%1;
  const grain=pfbm(u*0+ (pu*0.4+plank*0.37),v,2,5,14);
  const g2=pfbm(plank*0.31+pu*0.2,v,3,3,28);
  const seam=sm(0.04,0.0,Math.min(pu,1-pu));
  const wear=pfbm(u,v,5,4);
  let col=mixc([0.48,0.34,0.22],[0.28,0.2,0.14],grain*0.9);
  col=mixc(col,[0.55,0.52,0.48],sm(0.55,0.8,wear)*0.35);
  col=col.map(c=>c*(0.8+g2*0.4)*(1-seam*0.6));
  return [...col,0.85+g2*0.12,g2*0.5+grain*0.3-seam*0.8];
});
T.cloth=genTex(256,(u,v)=>{
  const wv=((Math.floor(u*128)+Math.floor(v*128))&1)*0.08;
  const f=pfbm(u,v,16,3),dirt=pfbm(u,v,4,4);
  const k=0.7+f*0.3-sm(0.5,0.8,dirt)*0.28+wv;
  return [k,k,k,0.95,wv*2+f*0.2];
},{nStr:1.2});
T.asphalt=genTex(TS,(u,v)=>{
  const f=pfbm(u,v,64,2),b=pfbm(u,v,5,4),g=pn(u*256,v*256,256,256);
  const cr=Math.abs(pfbm(u,v,5,3,3)-0.5),crack=cr<0.01?1:0;
  const dust=sm(0.5,0.75,pfbm(u,v,4,4,2));
  let col=mixc([0.17,0.17,0.17],[0.42,0.34,0.26],dust*0.8);
  col=col.map(c=>c*(0.78+g*0.4+f*0.15)*(1-crack*0.6));
  return [...col,0.9+g*0.08,g*0.4+f*0.3-crack*0.7];
});
T.ground=genTex(TS,(u,v)=>{
  // cracked dry earth: voronoi cells + dust
  const N=5;let f1=9,f2=9;const ci=Math.floor(u*N),cj=Math.floor(v*N);
  for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
    const ii=ci+di,jj=cj+dj,wi=((ii%N)+N)%N,wj=((jj%N)+N)%N;
    const px=(ii+hash2(wi*13+5,wj*7+1))/N,py=(jj+hash2(wi*3+11,wj*17+2))/N;
    const d=Math.hypot(u-px,v-py)*N;if(d<f1){f2=f1;f1=d}else if(d<f2)f2=d}
  const w=(pfbm(u,v,12,3)-.5)*0.1;
  const e=f2-f1+w;const crack=sm(0.07,0.0,e)*0.75,edge=sm(0.2,0.05,e)*0.7;
  const fine=pfbm(u,v,48,3),mid=pfbm(u,v,6,4);
  let col=mixc([0.58,0.46,0.34],[0.46,0.34,0.24],mid);
  col=col.map(c=>c*(0.8+fine*0.35)*(1-crack*0.7)*(1-edge*0.12));
  return [...col,0.97,fine*0.5+mid*0.3-crack*1.2+f1*0.2];
},{nStr:3});
// grass blade tuft alpha texture
function tuftTexture(){
  const c=document.createElement('canvas');c.width=64;c.height=128;const g=c.getContext('2d');
  for(let i=0;i<14;i++){
    const bx=6+i*3.5+(hash2(i,3)-.5)*5,h=50+hash2(i,9)*70,lean=(hash2(i,5)-.5)*40;
    const col=`rgb(${120+hash2(i,1)*60|0},${96+hash2(i,2)*45|0},${52+hash2(i,4)*30|0})`;
    g.fillStyle=col;g.beginPath();g.moveTo(bx-2.2,128);g.quadraticCurveTo(bx+lean*0.3,128-h*0.5,bx+lean,128-h);g.quadraticCurveTo(bx+lean*0.3+2.5,128-h*0.5,bx+2.2,128);g.fill();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t;
}
function glowTexture(inner='rgba(255,255,255,1)',mid='rgba(255,255,255,0.3)'){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,inner);gr.addColorStop(0.25,mid);gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

await stage(0.16,'Building materials');
// ============================================================ materials
const M={};
const stdTex=(tx,o={})=>new THREE.MeshStandardMaterial({map:tx.map,roughnessMap:tx.rough,normalMap:tx.normal,normalScale:new THREE.Vector2(o.ns??1,o.ns??1),vertexColors:true,metalness:o.metal??0.0,roughness:1,side:o.side??THREE.FrontSide,envMapIntensity:o.env??0.6});
M.rust=stdTex(T.rust,{metal:0.55,ns:1.6,env:0.9,side:THREE.DoubleSide});
M.plate=stdTex(T.plate,{metal:0.5,ns:1.2,env:0.9});
M.concrete=stdTex(T.concrete,{metal:0,ns:1.4,env:0.35});
M.wood=stdTex(T.wood,{metal:0,ns:1.0,env:0.25});
M.cloth=stdTex(T.cloth,{metal:0,ns:0.8,env:0.2,side:THREE.DoubleSide});
M.asphalt=stdTex(T.asphalt,{metal:0,ns:1.2,env:0.2});
M.paint=new THREE.MeshStandardMaterial({map:T.plate.map,roughnessMap:T.plate.rough,normalMap:T.plate.normal,normalScale:new THREE.Vector2(0.6,0.6),vertexColors:true,metalness:0.55,roughness:0.9,envMapIntensity:1.2});
M.rubber=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.95,metalness:0.0});
M.matte=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.9,metalness:0.0,envMapIntensity:0.3});
M.metal=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.45,metalness:0.85,envMapIntensity:1.1});
M.glass=new THREE.MeshStandardMaterial({color:0x1a2024,vertexColors:true,roughness:0.12,metalness:0.4,envMapIntensity:1.8});
M.glow=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,fog:false});
M.skin=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.75,metalness:0.0,envMapIntensity:0.3});
M.cloth2=new THREE.MeshStandardMaterial({map:T.cloth.map,normalMap:T.cloth.normal,color:0xffffff,vertexColors:true,roughness:0.95,metalness:0,envMapIntensity:0.2});
const GROUND_WET={value:0};
const groundMat=new THREE.MeshStandardMaterial({map:T.ground.map,roughnessMap:T.ground.rough,normalMap:T.ground.normal,normalScale:new THREE.Vector2(1.4,1.4),vertexColors:true,roughness:1,metalness:0,envMapIntensity:0.15});
// ground shading hook. Mobile: the repeating crack texture is flattened (it read as one tiled brown grid) and replaced by per-pixel
// world-space noise patches (pale sand, scorch, grey rock, dry grass). Pure ALU, no extra textures, no float textures.
groundMat.map=null;groundMat.normalMap=null;groundMat.roughnessMap=null;groundMat.roughness=0.96;
groundMat.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWP;varying float vDG;').replace('#include <project_vertex>','#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xz;vDG=-mvPosition.z;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
  varying vec2 vWP;varying float vDG;uniform float uWet;
  float gh(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
  float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
  float gf(vec2 p){return .55*gn(p)+.3*gn(p*2.13+7.1)+.15*gn(p*4.3+3.7);}`)
  .replace('#include <color_fragment>',`#include <color_fragment>
  {
    vec2 w=vWP;float fade=1.-smoothstep(22.,120.,vDG);
    float mid=gf(w*.045+11.),fin=gf(w*.65+5.),big=gf(w*.011+3.);
    vec3 c=diffuseColor.rgb;
    c*=.78+.44*mid;                                   // mid-scale mottling (no texture, so no tiling/seams)
    c*=mix(1.,.80+.40*fin,.25+.75*fade);                // fine grit, fades with distance to avoid shimmer
    float grassy=smoothstep(.02,.16,c.g-c.r*.82);       // greenish vertex colour -> blade streaks
    float bl=gn(vec2(w.x*6.5,w.y*1.9)+gf(w*.35)*4.);
    c*=mix(1.,.62+.7*bl,grassy*fade*.8);
    float pb=smoothstep(.80,.88,gn(w*2.4+9.));          // pebbles / flecks
    c=mix(c,c*vec3(1.4,1.35,1.3)+.015,pb*fade*.55*(1.-grassy));
    float dk=smoothstep(.56,.68,gf(w*.03+60.));         // dark damp soil patches
    c=mix(c,c*vec3(.58,.55,.52),dk*.7);
    c=mix(c,c*vec3(1.0,1.0,1.0)*(.9+.2*big),.5);
    c*=1.-uWet*.38;                                     // wet look: darker, glossier
    diffuseColor.rgb=min(c,vec3(.62));                  // albedo cap: stops moonlit/ACES wash-out to white
  }`);
  sh.uniforms.uWet=GROUND_WET;
};
groundMat.customProgramCacheKey=()=>'ground7';
for(const t of[T.ground,T.asphalt]){t.map.repeat.set(1,1)}

// ============================================================ geometry batcher (merged per material per spatial cell)
const _v=new THREE.Vector3(),_c=new THREE.Color();
function scaleBoxUV(g,w,h,d,ts=2){
  const uv=g.attributes.uv;
  const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++)for(let i=0;i<4;i++){const k=f*4+i;uv.setXY(k,uv.getX(k)*dims[f][0]/ts,uv.getY(k)*dims[f][1]/ts)}
}
function mxm(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
  const e=new THREE.Euler(rx,ry,rz,'YXZ'),q=new THREE.Quaternion().setFromEuler(e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(sx,sy,sz));
}
class Batcher{
  constructor(cell=64){this.b=new Map();this.cell=cell;this.tris=0}
  add(mkey,geo,m,hex,jit=0.1,shade=0){
    let g=geo.index?geo.toNonIndexed():geo.clone();
    if(m)g.applyMatrix4(m);
    const n=g.attributes.position.count;
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
    _c.set(hex);const j=1+(R()-.5)*2*jit;
    const col=new Float32Array(n*3);const P=g.attributes.position;
    // bake simple height-based AO-like gradient & ground contact darkening
    for(let i=0;i<n;i++){
      let s=j;if(shade){const gy=terrainH(P.getX(i),P.getZ(i));s*=1-shade*clamp(1-(P.getY(i)-gy)/1.4,0,1)*0.45}
      col[i*3]=_c.r*s;col[i*3+1]=_c.g*s;col[i*3+2]=_c.b*s}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);
    g.computeBoundingBox();
    const cx=Math.floor((g.boundingBox.min.x+g.boundingBox.max.x)/2/this.cell),cz=Math.floor((g.boundingBox.min.z+g.boundingBox.max.z)/2/this.cell);
    const key=mkey+'|'+cx+'|'+cz;let a=this.b.get(key);if(!a){a=[];this.b.set(key,a)}a.push(g);this.tris+=n/3;
  }
  box(mkey,x,y,z,sx,sy,sz,hex,rx=0,ry=0,rz=0,jit=0.1,ts=2,shade=0){
    const g=new THREE.BoxGeometry(sx,sy,sz);scaleBoxUV(g,sx,sy,sz,ts);
    this.add(mkey,g,mxm(x,y,z,1,1,1,rx,ry,rz),hex,jit,shade);
  }
  build(parent,{cast=true,receive=true}={}){
    for(const [key,list] of this.b){
      const mk=key.split('|')[0];
      const merged=mergeGeoms(list);const me=new THREE.Mesh(merged,M[mk]);
      me.castShadow=cast&&mk!=='glow';me.receiveShadow=receive;me.matrixAutoUpdate=false;me.updateMatrix();parent.add(me);
    }
    this.b.clear();
  }
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function mergeGeoms(list){const g=mergeGeometries(list,false);g.computeBoundingSphere();list.forEach(x=>x.dispose());return g}

// ============================================================ world layout & terrain
const HALF=380;
const HX=38,HZ=30;                      // Rust Haven half extents
const roadX=z=>{const w=sm(HZ+4,HZ+90,Math.abs(z));return w*(20*Math.sin(z*0.0125+0.8)+(z<0?40*sm(60,320,-z):0))};
const roadDX=z=>(roadX(z+1)-roadX(z-1))/2;
const TOWER={x:roadX(-318)+26,z:-322};
const SPAWN={x:3,z:6};
// v5: enterable ruined buildings (terrain is flattened around each so interiors sit at y=0). yaw must be a multiple of PI/2.
const RUINS=[
  {id:'hardware',name:'Hardware store ruin',x:-70,z:44,yaw:Math.PI/2,w:9,d:7,kind:'shop'},
  {id:'gas',name:'Roadside gas shop',x:roadX(92)-30,z:92,yaw:Math.PI/2,w:8,d:6,kind:'shop'},
  {id:'farm',name:'Abandoned farmhouse',x:roadX(-72)+40,z:-72,yaw:Math.PI,w:9,d:7,kind:'house'},
  {id:'depot',name:'Old depot (locked)',x:roadX(-168)-42,z:-168,yaw:0,w:11,d:8,kind:'depot',locked:'key_garage'},
  {id:'clinic',name:'Ruined clinic',x:-132,z:122,yaw:-Math.PI/2,w:10,d:7,kind:'clinic'},
  {id:'cabin',name:'Hunter\u2019s cabin',x:150,z:-70,yaw:0,w:7,d:6,kind:'cabin'}
];
const flats=[{x:0,z:0,rx:62,rz:54},{x:TOWER.x,z:TOWER.z,rx:26,rz:26},...RUINS.map(r=>({x:r.x,z:r.z,rx:r.w/2+9,rz:r.d/2+9}))];
function terrainH(x,z){
  const rd=Math.abs(x-roadX(z));
  const rs=sm(5,34,rd);
  const rim=sm(250,370,Math.max(Math.abs(x),Math.abs(z)));
  let h=(fbm(x*0.0055+10,z*0.0055,4)-0.5)*52*(0.12+0.88*rs);
  h+=(vnoise(x*0.04,z*0.04)-0.5)*3.4*(0.25+0.75*rs);
  const ridge=1-Math.abs(vnoise(x*0.014+50,z*0.014)*2-1);
  h+=ridge*ridge*ridge*11*rs;
  h+=(vnoise(x*0.25,z*0.25)-0.5)*0.5*rs;
  h+=rim*(26+34*fbm(x*0.01,z*0.01+3,3));
  let m=1;
  for(const f of flats){const d=Math.max(Math.abs(x-f.x)/f.rx,Math.abs(z-f.z)/f.rz);m=Math.min(m,sm(0.62,1.15,d))}
  // road gently graded: flatten the verge so the road reads
  const rf=sm(2.5,10,rd);
  return lerp(0.0,h,m)*(0.1+0.9*lerp(0.35,1,rf))+(1-m)*0;
}

// ============================================================ colliders
const boxes=[];   // [x0,z0,x1,z1]
const circles=[]; // [x,z,r]
const addBox=(x,z,w,d)=>boxes.push([x-w/2,z-d/2,x+w/2,z+d/2]);
function resolveCircle(p,pr){
  let hit=false;
  for(const c of circles){const dx=p.x-c[0],dz=p.z-c[1],r=c[2]+pr;const d2=dx*dx+dz*dz;if(d2<r*r&&d2>1e-6){const d=Math.sqrt(d2);p.x=c[0]+dx/d*r;p.z=c[1]+dz/d*r;hit=true}}
  for(const b of boxes){
    if(p.x<b[0]-pr||p.x>b[2]+pr||p.z<b[1]-pr||p.z>b[3]+pr)continue;
    const cx=clamp(p.x,b[0],b[2]),cz=clamp(p.z,b[1],b[3]);const dx=p.x-cx,dz=p.z-cz;const d2=dx*dx+dz*dz;
    if(d2<pr*pr){hit=true;
      if(d2>1e-8){const d=Math.sqrt(d2);p.x=cx+dx/d*pr;p.z=cz+dz/d*pr}
      else{const l=p.x-b[0],r=b[2]-p.x,t=p.z-b[1],bt=b[3]-p.z,m=Math.min(l,r,t,bt);if(m===l)p.x=b[0]-pr;else if(m===r)p.x=b[2]+pr;else if(m===t)p.z=b[1]-pr;else p.z=b[3]+pr}}
  }
  return hit;
}

await stage(0.22,'Shaping the wasteland');
// ============================================================ terrain mesh
const world=new THREE.Group();scene.add(world);
const sceneBatch=new Batcher(72);
{
  const SEG=MOBILE?240:300;
  const g=new THREE.PlaneGeometry(HALF*2,HALF*2,SEG,SEG).rotateX(-Math.PI/2);
  const p=g.attributes.position,n=p.count,cols=new Float32Array(n*3),uv=g.attributes.uv;
  for(let i=0;i<n;i++)p.setY(i,terrainH(p.getX(i),p.getZ(i)));
  // biome palette (sRGB-ish values, vertex colours are used as linear multipliers on the soft ground texture)
  const cDust=new THREE.Color(0x8c6c48),cSand=new THREE.Color(0xa88e62),cGrass=new THREE.Color(0x5c7236),cDry=new THREE.Color(0x8a8244),cGreen=new THREE.Color(0x3f5c2a),
        cClay=new THREE.Color(0x8a5434),cRock=new THREE.Color(0x6c6760),cRockD=new THREE.Color(0x4a443e),cAsh=new THREE.Color(0x35302c),cCrack=new THREE.Color(0x5a4230);
  const c=new THREE.Color();
  for(let i=0;i<n;i++){
    const x=p.getX(i),z=p.getZ(i),y=p.getY(i);
    const sl=Math.hypot(terrainH(x+1.5,z)-y,terrainH(x,z+1.5)-y)/1.5;
    const tBig=fbm(x*0.006+31,z*0.006,3),tMid=fbm(x*0.02+3,z*0.02,3),tFine=fbm(x*0.12+9,z*0.12,2),tScorch=fbm(x*0.012+70,z*0.012,3),tSand=fbm(x*0.008+120,z*0.008,2),tGrass=fbm(x*0.015+200,z*0.015,3);
    c.copy(cDust).lerp(cSand,sm(0.5,0.72,tSand)*0.8);
    c.lerp(cClay,sm(0.46,0.7,tBig)*0.6);
    c.lerp(cDry,sm(0.42,0.68,tGrass)*0.75*(1-sm(0.35,0.7,sl)));
    c.lerp(cGrass,sm(0.52,0.74,tGrass)*0.85*(1-sm(0.3,0.6,sl)));
    c.lerp(cGreen,sm(0.68,0.86,tGrass)*0.8*(1-sm(0.3,0.55,sl)));
    const band=0.5+0.5*Math.sin(y*0.9+tMid*6);
    c.lerp(cRock,sm(0.28,0.6,sl)*0.9);c.lerp(cRockD,sm(0.5,1.0,sl)*(0.45+0.4*band));
    c.lerp(cAsh,sm(0.60,0.74,tScorch)*0.7*(1-sm(0.9,1.4,sl)));
    c.lerp(cCrack,sm(0.66,0.8,tMid)*0.3);
    const rd=Math.abs(x-roadX(z));c.lerp(cDust,(1-sm(3,14,rd))*0.5);
    const l=0.95+0.5*(tMid-0.5)+0.34*(tFine-0.5)+0.24*(tBig-0.5)+clamp(y*0.006,-0.1,0.1);
    cols[i*3]=c.r*l;cols[i*3+1]=c.g*l;cols[i*3+2]=c.b*l;
    uv.setXY(i,(x+HALF)/22,(z+HALF)/22);
  }
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));g.computeVertexNormals();
  const terrain=new THREE.Mesh(g,groundMat);terrain.receiveShadow=true;world.add(terrain);

}
// road ribbons
{
  const mkRibbon=(w,z0,z1,step,yoff,cols,matl,vscale,uvEdge=false)=>{
    const pos=[],uv=[],col=[],idx=[];let k=0;const NC=cols.length;
    for(let z=z0;z>=z1;z-=step){
      const cx=roadX(z),dx=roadDX(z),l=Math.hypot(dx,1),px=1/l,pz=-dx/l;
      for(let j=0;j<NC;j++){
        const t=j/(NC-1)*2-1;const x=cx+px*w*t,zz=z+pz*w*t;
        pos.push(x,terrainH(x,zz)+yoff,zz);uv.push((t*.5+.5),-z/vscale);
        const cc=cols[j];col.push(cc[0],cc[1],cc[2]);
      }
      if(k>0){for(let j=0;j<NC-1;j++){const a=(k-1)*NC+j,b=a+1,c=k*NC+j,d=c+1;idx.push(a,c,b,b,c,d)}}k++;
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return new THREE.Mesh(g,matl);
  };
  const dustC=[0.62,0.5,0.38],aspC=[0.95,0.95,0.95],dk=[0.8,0.8,0.8];
  const roadMat=M.asphalt.clone();roadMat.polygonOffset=true;roadMat.polygonOffsetFactor=-2;roadMat.polygonOffsetUnits=-2;
  for(const t of ['map','roughnessMap','normalMap']){roadMat[t]=roadMat[t].clone();roadMat[t].needsUpdate=true;roadMat[t].repeat.set(0.9,1);}
  // asphalt uv.x spans width (8m) -> repeat so texture isn't stretched: width 9m => tile 6m in v
  const road=mkRibbon(5.2,HALF,-HALF,3,0.07,[dustC,dustC,[0.8,0.78,0.75],aspC,aspC,aspC,[0.8,0.78,0.75],dustC,dustC],roadMat,6);
  road.receiveShadow=true;road.renderOrder=1;world.add(road);
  // wide road: uv.x runs 0..1 across 10.4m; fix aspect via repeat of 1.7
  for(const t of ['map','roughnessMap','normalMap'])roadMat[t].repeat.set(1.7,1.7);
  // lane dashes
  const c=document.createElement('canvas');c.width=64;c.height=256;const g=c.getContext('2d');
  g.clearRect(0,0,64,256);
  for(let y=0;y<256;y++)for(let x=0;x<64;x++){}
  g.fillStyle='rgba(215,175,70,0.85)';g.fillRect(29,10,6,100);
  g.fillStyle='rgba(215,175,70,0.0)';
  // distress
  const id=g.getImageData(0,0,64,256);for(let i=0;i<id.data.length;i+=4){const x=(i/4)%64,y=Math.floor(i/4/64);if(id.data[i+3]>0&&hash2(x*3,y*3)<0.38)id.data[i+3]=0;}
  g.putImageData(id,0,0);
  const lt=new THREE.CanvasTexture(c);lt.colorSpace=THREE.SRGBColorSpace;lt.wrapS=lt.wrapT=THREE.RepeatWrapping;lt.anisotropy=4;
  const lm=new THREE.MeshStandardMaterial({map:lt,transparent:true,depthWrite:false,roughness:0.9,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  const lines=mkRibbon(0.55,HALF,-HALF,3,0.09,[[1,1,1],[1,1,1],[1,1,1]],lm,10);
  lines.receiveShadow=true;lines.renderOrder=2;world.add(lines);
}

await stage(0.38,'Laying the road');
// ============================================================ geometry helpers
// merge a list of {geo,m,hex} into one vertex-coloured geometry
function mergeParts(list){
  const gs=[];
  for(const p of list){
    let g=p.geo.index?p.geo.toNonIndexed():p.geo.clone();
    if(p.m)g.applyMatrix4(p.m);
    const n=g.attributes.position.count;
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
    _c.set(p.hex);const j=1+(p.jit?(R()-.5)*2*p.jit:0);
    const col=new Float32Array(n*3);for(let i=0;i<n;i++){col[i*3]=_c.r*j;col[i*3+1]=_c.g*j;col[i*3+2]=_c.b*j}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);
    gs.push(g);
  }
  const m=mergeGeometries(gs,false);gs.forEach(x=>x.dispose());return m;
}
const RB=(w,h,d,r=0.03,s=2)=>new RoundedBoxGeometry(w,h,d,s,r);
function corrugated(w,h,period=0.18,amp=0.035,tile=1.44){
  const k=Math.round(w/period),seg=k*4,pos=[],uv=[],idx=[];
  for(let j=0;j<=1;j++)for(let i=0;i<=seg;i++){const x=i/seg*w;const z=amp*Math.sin(x/period*Math.PI*2);pos.push(x-w/2,j*h,z);uv.push(x/tile,j*h/tile)}
  for(let i=0;i<seg;i++){const a=i,b=i+1,c=i+seg+1,d=i+seg+2;idx.push(a,b,c,b,d,c)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function barrelGeo(open=false){
  const pts=[];const r=0.30,h=0.9;
  pts.push(new THREE.Vector2(0.0,0));pts.push(new THREE.Vector2(r*.92,0));pts.push(new THREE.Vector2(r*.98,0.03));
  const ribs=[0.08,0.30,0.6,0.82];
  pts.push(new THREE.Vector2(r*.98,0.07));
  for(const y of ribs){pts.push(new THREE.Vector2(r*1.0,y-0.04));pts.push(new THREE.Vector2(r*1.07,y-0.02));pts.push(new THREE.Vector2(r*1.07,y+0.02));pts.push(new THREE.Vector2(r*1.0,y+0.04))}
  pts.push(new THREE.Vector2(r*.98,h-0.04));pts.push(new THREE.Vector2(r*1.03,h-0.015));pts.push(new THREE.Vector2(r*1.03,h));
  if(open){pts.push(new THREE.Vector2(r*.93,h));pts.push(new THREE.Vector2(r*.93,h-0.5))}
  else{pts.push(new THREE.Vector2(r*.9,h));pts.push(new THREE.Vector2(r*.88,h-0.025));pts.push(new THREE.Vector2(0.001,h-0.025))}
  return new THREE.LatheGeometry(pts,14);
}
const barrelG=barrelGeo(false),barrelOpenG=barrelGeo(true);
const cylG=(rt,rb,h,s=8)=>new THREE.CylinderGeometry(rt,rb,h,s);
function tireGeo(r=0.36,w=0.26,tubeR=0.07){
  const pts=[];const ri=r-tubeR*1.6;
  const N=7;
  pts.push(new THREE.Vector2(ri,-w/2+0.02));
  for(let i=0;i<=N;i++){const a=-Math.PI/2+i/N*Math.PI;pts.push(new THREE.Vector2(r-tubeR+Math.cos(a)*tubeR*1.0+ (i===0?0:0),(Math.sin(a)*w/2)))}
  // rebuild: simple rounded profile (outer face)
  const p2=[new THREE.Vector2(ri,-w/2),new THREE.Vector2(r-tubeR*.5,-w/2*.98),new THREE.Vector2(r-0.01,-w*.35),new THREE.Vector2(r,-w*.2),new THREE.Vector2(r,w*.2),new THREE.Vector2(r-0.01,w*.35),new THREE.Vector2(r-tubeR*.5,w/2*.98),new THREE.Vector2(ri,w/2)];
  return new THREE.LatheGeometry(p2,16).rotateX(Math.PI/2);       // axle along Z
}
function rimGeo(r=0.2,w=0.27){
  const p=[new THREE.Vector2(0,-w/2-0.012),new THREE.Vector2(r*.35,-w/2-0.012),new THREE.Vector2(r*.5,-w/2+0.02),new THREE.Vector2(r,-w/2+0.02),new THREE.Vector2(r,w/2),new THREE.Vector2(0,w/2)];
  return new THREE.LatheGeometry(p,10).rotateX(Math.PI/2);
}
const TARP=[0x8a3a2a,0x6a6a4a,0xa0782f,0x45586a,0x7a2f2f,0x6b5a46];
function tarpGeo(w,d,sag=0.18,seg=8){
  const g=new THREE.PlaneGeometry(w,d,seg,seg).rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);const sx=1-(2*x/w)**2,sz=1-(2*z/d)**2;p.setY(i,-sag*sx*0.9 - sag*0.35*sz*(sx>0.02?1:0)+Math.sin(x*5+z*3)*0.015)}
  g.computeVertexNormals();return g;
}
// lights registry (fires / lamps) -> glow sprites + pooled point lights
const fireSpots=[];       // {x,y,z,int,seed}
const glowSpots=[];       // static glows {x,y,z,size,r,g,b,a,flicker}

// ============================================================ Rust Haven: walls, gates, towers
const haven=new THREE.Group();world.add(haven);
const HB=new Batcher(80);
const WALLH=4.4;
const wallPanels=[];
function wallRun(x0,z0,x1,z1,skip){
  const len=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(len/2.88)),dx=(x1-x0)/len,dz=(z1-z0)/len;
  const yaw=Math.atan2(-dz,dx);   // panel local X along run
  for(let i=0;i<n;i++){
    const t=(i+.5)/n,cx=x0+(x1-x0)*t,cz=z0+(z1-z0)*t;
    if(skip&&skip(cx,cz))continue;
    const pw=len/n,h=WALLH*(0.82+R()*0.2),gy=Math.max(terrainH(cx,cz),terrainH(cx-dx*pw/2,cz-dz*pw/2),terrainH(cx+dx*pw/2,cz+dz*pw/2))-0.3;
    const tint=0.82+R()*0.3;
    const col=new THREE.Color().setRGB(tint,tint*(0.95+R()*.1),tint*(0.9+R()*.12));
    const lean=(R()-.5)*0.03;
    HB.add('rust',corrugated(pw*1.005,h),mxm(cx,gy,cz,1,1,1,0,yaw,lean),col,0.08);
    // upper strip / patched sheet of different tint
    if(R()<0.45){const ph=rr(0.8,1.6),pwd=rr(1.0,pw*0.8),off=(R()-.5)*(pw-pwd);
      HB.add('plate',(()=>{const g=new THREE.BoxGeometry(pwd,ph,0.05);scaleBoxUV(g,pwd,ph,0.05,1.5);return g})(),mxm(cx+dx*off+(-dz)*0.0,gy+rr(0.5,h-ph),cz+dz*off,1,1,1,0,yaw,(R()-.5)*0.08).setPosition(cx+dx*off+dz*0.05,gy+rr(0.4,h-ph)+ph/2,cz+dz*off-dx*0.05),new THREE.Color(0.9,0.85,0.8),0.1);
    }
    // top beam
    HB.box('metal',cx,gy+h+0.03,cz,pw,0.09,0.12,0x4a3a30,0,yaw,0,0.1);
    // base dirt skirt / sandbag line
    if(R()<0.5)HB.box('concrete',cx,gy+0.18,cz,pw*0.95,0.36,0.5,0x8a7a66,0,yaw,0,0.15,1.5);
    wallPanels.push({cx,cz,pw,yaw});
  }
  // posts
  for(let i=0;i<=n;i++){
    const t=i/n,px=x0+(x1-x0)*t,pz=z0+(z1-z0)*t;if(skip&&skip(px,pz))continue;
    const gy=terrainH(px,pz)-0.4,ph=WALLH+0.6+R()*0.5;
    HB.add('metal',cylG(0.12,0.14,ph,7),mxm(px,gy+ph/2,pz),0x4a4038,0.12);
    HB.add('wood',RB(0.28,0.1,0.28,0.03),mxm(px,gy+ph,pz),0x5a4632,0.1);
    if(R()<0.28){const c=pick([0xa04a2a,0x36526a,0x4d5a3a]);HB.add('matte',cylG(0.045,0.045,0.9,6),mxm(px+0.25,gy+ph+0.45,pz,1,1,1,0,0,0.1),0x3a3a3a)}
  }
}
const gateGap=(cx,cz)=>Math.abs(cx)<5.6&&Math.abs(Math.abs(cz)-HZ)<1;
wallRun(-HX,-HZ,HX,-HZ,gateGap);  wallRun(-HX,HZ,HX,HZ,gateGap);
wallRun(-HX,-HZ,-HX,HZ);          wallRun(HX,-HZ,HX,HZ);
addBox(0,0,0,0);boxes.pop();
// wall colliders (gate gap excluded)
for(const z of[-HZ,HZ]){addBox(-(HX+5.6)/2,z,HX-5.6,0.6);addBox((HX+5.6)/2,z,HX-5.6,0.6)}
addBox(-HX,0,0.6,HZ*2);addBox(HX,0,0.6,HZ*2);

// gates: concrete + steel arch, swung-open doors, sign
function gate(z,north){
  const s=north?-1:1;
  for(const sx of[-1,1]){
    const px=sx*6.0;
    HB.add('concrete',RB(1.1,6.2,1.1,0.06),mxm(px,2.9,z),0x8a8277,0.1);
    HB.add('metal',RB(1.3,0.25,1.3,0.05),mxm(px,6.1,z),0x3b332c);
    // swung door
    const dw=4.6;HB.add('rust',corrugated(dw,3.8),mxm(px+sx*0.7,0.0,z+s*2.6,1,1,1,0,Math.PI/2+sx*0.35*s*-1,0),new THREE.Color(1.0,0.95,0.9),0.08);
    HB.box('metal',px+sx*0.7+sx*0.0,3.82,z+s*2.6,0.12,0.12,dw,0x3a3028,0,sx*0.35*s*-1,0);
    circles.push([px,z,0.85]);
  }
  HB.add('metal',cylG(0.18,0.18,12.4,8).rotateZ(Math.PI/2),mxm(0,5.85,z),0x4a3d32);
  HB.add('rust',(()=>{const g=new THREE.BoxGeometry(9.2,1.3,0.12);scaleBoxUV(g,9.2,1.3,0.12,1.5);return g})(),mxm(0,5.15,z+s*0.02),new THREE.Color(0.9,0.8,0.75),0.05);
  // diagonal braces
  for(const sx of[-1,1])HB.add('metal',cylG(0.07,0.07,2.1,6),mxm(sx*4.6,4.9,z,1,1,1,0,0,sx*0.8),0x3a3028);
}
gate(-HZ,true);gate(HZ,false);
// signs
const signTex=(()=>{const c=document.createElement('canvas');c.width=1024;c.height=200;const g=c.getContext('2d');
  g.fillStyle='#4a2d1b';g.fillRect(0,0,1024,200);
  for(let i=0;i<2500;i++){g.fillStyle=`rgba(${100+Math.random()*80|0},${40+Math.random()*30|0},${10},${Math.random()*0.18})`;g.fillRect(Math.random()*1024,Math.random()*200,2+Math.random()*10,1+Math.random()*3)}
  g.strokeStyle='#d8b27a';g.lineWidth=8;g.strokeRect(14,14,996,172);
  g.font='900 112px Impact, "Arial Black", sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.fillStyle='#e6c58f';g.shadowColor='#000';g.shadowBlur=6;g.fillText('RUST HAVEN',512,92);
  g.font='700 30px "Trebuchet MS",sans-serif';g.fillStyle='#b99468';g.shadowBlur=0;g.fillText('TRADE · REPAIR · NO RAIDERS',512,160);
  g.globalCompositeOperation='destination-out';for(let i=0;i<260;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*0.5})`;g.fillRect(Math.random()*1024,Math.random()*200,Math.random()*6,Math.random()*6)}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=MAXANI;return t})();
const signMat=new THREE.MeshStandardMaterial({map:signTex,roughness:0.85,metalness:0.2});
for(const [z,rot] of[[HZ+0.22,0],[-HZ-0.22,Math.PI]]){
  const sg=new THREE.Mesh(new THREE.PlaneGeometry(7.6,1.5),signMat);sg.position.set(0,5.9,z);sg.rotation.y=rot;sg.castShadow=true;haven.add(sg);
}

// watchtowers
const towerSpots=[];
const ladders=[],platforms=[],shackLog=[];
function watchtower(x,z,h=9,yaw=0){
  const gy=terrainH(x,z)-0.3,w=1.7;
  const P=(a,b,c,d,e,f,col,mk='metal',rx=0,ry=0,rz=0)=>HB.box(mk,a,b,c,d,e,f,col,rx,ry,rz,0.1,1.5);
  const cs=Math.cos(yaw),sn=Math.sin(yaw);const lp=(lx,lz)=>[x+lx*cs+lz*sn,z-lx*sn+lz*cs];
  for(const [lx,lz] of[[-w,-w],[w,-w],[w,w],[-w,w]]){
    const [px,pz]=lp(lx,lz),[tx,tz]=lp(lx*0.7,lz*0.7);
    const a=new THREE.Vector3(px,gy,pz),b=new THREE.Vector3(tx,gy+h,tz);
    const d=b.clone().sub(a),len=d.length();const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    HB.add('metal',cylG(0.11,0.14,len,7),new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,new THREE.Vector3(1,1,1)),0x4a3f36,0.12);
  }
  // cross braces
  for(let k=1;k<=2;k++){const f=k/3.2,hh=gy+h*f,ww=w*(1-0.3*f);
    for(const [a,b] of[[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]]){
      const A=lp(a[0]*ww,a[1]*ww),B=lp(b[0]*ww,b[1]*ww);const av=new THREE.Vector3(A[0],hh,A[1]),bv=new THREE.Vector3(B[0],hh+0.9,B[1]);
      const d=bv.clone().sub(av),len=d.length(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
      HB.add('metal',cylG(0.045,0.045,len,5),new THREE.Matrix4().compose(av.clone().add(bv).multiplyScalar(.5),q,new THREE.Vector3(1,1,1)),0x3a322c,0.1)}}
  const py=gy+h;
  HB.add('wood',RB(w*2.5,0.18,w*2.5,0.03),mxm(x,py,z,1,1,1,0,yaw,0),0x5a4430,0.1);
  // cabin walls (half-height) + corrugated
  const cw=w*2.3;
  for(let s=0;s<4;s++){const a=yaw+s*Math.PI/2;const ox=Math.sin(a)*cw/2,oz=Math.cos(a)*cw/2;
    if(s===0&&x*0===0){ // open front toward centre for guard: low wall
      HB.add('rust',corrugated(cw,0.9),mxm(x+ox,py+0.09,z+oz,1,1,1,0,a,0),0xffffff,0.1);continue}
    HB.add('rust',corrugated(cw,2.1),mxm(x+ox,py+0.09,z+oz,1,1,1,0,a,0),new THREE.Color(0.95,0.9,0.85),0.12)}
  // roof posts and roof
  for(const [lx,lz] of[[-1,-1],[1,-1],[1,1],[-1,1]]){const [px,pz]=lp(lx*cw/2,lz*cw/2);HB.add('wood',RB(0.12,2.7,0.12,0.02),mxm(px,py+1.4,pz),0x4a3a2a,0.1)}
  HB.add('rust',corrugated(cw*1.5,cw*1.5,0.18,0.035).rotateX(-Math.PI/2),mxm(x,py+2.78,z,1,1,1,0.12,yaw,0),0xffffff,0.1);
  // ladder
  const [lx0,lz0]=lp(w*1.15,w*0.0);
  for(let k=0;k<=h/0.35;k++){HB.box('metal',lx0+0.0,gy+k*0.35+0.1,lz0,0.04,0.04,0.55,0x3a322c,0,yaw,0,0.1)}
  HB.box('metal',lx0,gy+h/2,lz0+0.28,0.05,h,0.05,0x3a322c);HB.box('metal',lx0,gy+h/2,lz0-0.28,0.05,h,0.05,0x3a322c);
  // sandbags/barrels on deck
  HB.box('concrete',lp(w*0.2,w*1.0)[0],py+0.4,lp(w*0.2,w*1.0)[1],1.0,0.4,0.4,0x9a8a66,0,yaw,0,0.2);
  // searchlight rig + hanging bulb glow
  const [sx,sz]=lp(0,w*1.4);
  HB.add('metal',cylG(0.22,0.28,0.5,10).rotateX(Math.PI/2),mxm(sx,py+1.35,sz,1,1,1,0.15,yaw,0),0x3a3a3a);
  HB.add('glow',cylG(0.2,0.2,0.04,10).rotateX(Math.PI/2),mxm(sx,py+1.35,sz+0.0,1,1,1,0.15,yaw,0).setPosition(sx+Math.sin(yaw)*0.0+(-0*0),py+1.35,sz+0.26*Math.cos(yaw)),new THREE.Color(1.6,1.45,1.1));
  glowSpots.push({x:x,y:py+2.4,z:z,size:2.0,r:1,g:.7,b:.38,a:0.9,flick:0.1});
  towerSpots.push({x,z,py});
  ladders.push({x:lx0,z:lz0,y0:gy,y1:py+0.1,deckX:x,deckZ:z});platforms.push({x,z,hw:w*1.2,hd:w*1.2,y:py+0.09});
  circles.push([x-w*0.9,z-w*0.9,0.3],[x+w*0.9,z-w*0.9,0.3],[x+w*0.9,z+w*0.9,0.3],[x-w*0.9,z+w*0.9,0.3]);
}
const TW=[[-HX-1.5,-HZ-1.5,10],[HX+1.5,-HZ-1.5,10],[-HX-1.5,HZ+1.5,9],[HX+1.5,HZ+1.5,10],[-9.5,-HZ-2.2,7.5],[9.5,HZ+2.2,7.5]];
TW.forEach(([x,z,h],i)=>watchtower(x,z,h,[0.2,-0.3,Math.PI+0.1,Math.PI-0.2,0.0,Math.PI][i]));

// ============================================================ placement builder (local frame -> world)
class Bld{
  constructor(B,x,z,yaw=0,y=0){this.B=B;this.m0=mxm(x,y,z,1,1,1,0,yaw,0);this.x=x;this.z=z;this.yaw=yaw;this.y=y}
  mat(lx,ly,lz,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){return this.m0.clone().multiply(mxm(lx,ly,lz,sx,sy,sz,rx,ry,rz))}
  box(k,lx,ly,lz,sx,sy,sz,col,rx=0,ry=0,rz=0,jit=0.1,ts=1.6,r=0){
    const g=r>0?RB(sx,sy,sz,Math.min(r,sx/2.1,sy/2.1,sz/2.1)):new THREE.BoxGeometry(sx,sy,sz);if(!r)scaleBoxUV(g,sx,sy,sz,ts);
    this.B.add(k,g,this.mat(lx,ly,lz,1,1,1,rx,ry,rz),col,jit);
  }
  add(k,g,lx,ly,lz,col,rx=0,ry=0,rz=0,jit=0.1,sx=1,sy=1,sz=1){this.B.add(k,g,this.mat(lx,ly,lz,sx,sy,sz,rx,ry,rz),col,jit)}
  cyl(k,lx,ly,lz,rt,rb,h,col,rx=0,ry=0,rz=0,seg=8,jit=0.1){this.B.add(k,new THREE.CylinderGeometry(rt,rb,h,seg),this.mat(lx,ly,lz,1,1,1,rx,ry,rz),col,jit)}
  // beam between two local points
  beam(k,a,b,r,col,seg=6){
    const A=new THREE.Vector3(...a),Bv=new THREE.Vector3(...b),d=Bv.clone().sub(A),len=d.length();
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    const mm=new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(.5),q,new THREE.Vector3(1,1,1));
    this.B.add(k,new THREE.CylinderGeometry(r,r,len,seg),this.m0.clone().multiply(mm),col,0.08)}
  world(lx,lz){const c=Math.cos(this.yaw),s=Math.sin(this.yaw);return[this.x+lx*c+lz*s,this.z-lx*s+lz*c]}
  collide(lx,lz,w,d){const [wx,wz]=this.world(lx,lz);const sw=Math.abs(Math.sin(this.yaw))>0.7;addBox(wx,wz,sw?d:w,sw?w:d)}
}
const bulbSpots=[];  // all glow points (bulbs, lamps)
const npcSpots=[];

// ============================================================ Haven ground overlay & plaza
T.yard=genTex(TS,(u,v)=>{
  const f=pfbm(u,v,48,3),m=pfbm(u,v,5,4),s=pfbm(u,v,9,3,3);
  // packed dirt with wheel ruts & flagstone patches
  const rut=sm(0.07,0.0,Math.abs(((u*3)%1)-0.5)-0.38)*0.5;
  const stoneC=Math.floor(u*10),stoneR=Math.floor(v*10);const su=(u*10)%1,sv=(v*10)%1;
  const stoneOn=pfbm(u,v,3,3)>0.52?1:0;
  const gap=Math.min(Math.min(su,1-su),Math.min(sv,1-sv))<0.045?1:0;
  let col=mixc([0.50,0.40,0.31],[0.36,0.29,0.23],m);
  const sc=0.5+hash2(stoneC,stoneR)*0.18;
  if(stoneOn)col=mixc(col,[sc,sc*0.96,sc*0.9],0.85);
  col=col.map(c=>c*(0.8+f*0.35)*(1-rut*0.3)*(1-gap*stoneOn*0.45));
  return [...col,0.95,f*0.4+m*0.2+(stoneOn?(gap?-0.8:0.35):0)-rut*0.6];
},{nStr:2.4});
{
  const mat=new THREE.MeshStandardMaterial({map:T.yard.map,roughnessMap:T.yard.rough,normalMap:T.yard.normal,normalScale:new THREE.Vector2(1.5,1.5),roughness:1,envMapIntensity:0.15,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  for(const t of['map','roughnessMap','normalMap']){T.yard[t==='map'?'map':t==='roughnessMap'?'rough':'normal'].repeat.set((HX*2)/10,(HZ*2)/10)}
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(HX*2,HZ*2).rotateX(-Math.PI/2),mat);pl.position.y=0.02;pl.receiveShadow=true;haven.add(pl);
  // plaza slab
  const sl=new THREE.Mesh(new THREE.CylinderGeometry(8.5,8.8,0.14,28),M.concrete.clone());
  sl.material.color.set(0xb8aea0);sl.material.vertexColors=false;sl.position.set(0,0.07,0);sl.receiveShadow=true;sl.castShadow=false;haven.add(sl);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.6,0.2,16),sl.material);inner.position.set(0,0.1,0);inner.receiveShadow=true;haven.add(inner);
}
// central notice board + radio mast stub
{
  const b=new Bld(HB,0,0,0);
  for(const sx of[-1,1])b.cyl('wood',sx*1.4,1.5,0,0.09,0.11,3,0x4a3a2a,0,0,0,8);
  b.box('wood',0,2.1,0,3.1,1.7,0.1,0x6a5238,0,0,0,0.1,1.2);
  for(let i=0;i<9;i++)b.box('cloth',rr(-1.3,1.3),rr(1.5,2.7),0.07,rr(.3,.55),rr(.35,.6),0.01,pick([0xd8cfb8,0xc8b88a,0xb9c0a8,0xc9a98b]),0,0,(R()-.5)*.3,0.1);
  b.box('wood',0,3.0,0,3.4,0.12,0.3,0x3a2d22);
  circles.push([-1.4,0,0.3],[1.4,0,0.3]);
}
// ============================================================ Fire barrels
const fireBarrels=[];
function fireBarrel(x,z,tag){
  const b=new Bld(HB,x,z,R()*6);
  b.add('rust',barrelOpenG,0,0,0,new THREE.Color(1.0,0.82,0.7),0,0,0,0.12);
  // coals inside
  b.add('glow',new THREE.CylinderGeometry(0.26,0.26,0.02,8),0,0.76,0,new THREE.Color(2.2,0.9,0.25));
  // crossed grate
  b.box('metal',0,0.86,0,0.58,0.02,0.03,0x2b2622);b.box('metal',0,0.86,0,0.03,0.02,0.58,0x2b2622);
  for(let i=0;i<4;i++)b.box('wood',rr(-.14,.14),0.82,rr(-.14,.14),0.05,0.05,0.34,0x241b14,0,R()*3,R()*0.5,0.2);
  circles.push([x,z,0.45]);
  const fy=terrainH(x,z);
  fireBarrels.push({x,y:fy+0.85,z,seed:R()*100,tag});
}
// ============================================================ Market stalls
function stall(x,z,yaw,kind){
  const b=new Bld(HB,x,z,yaw);const W=3.4,D=2.0;
  const pc=pick([0x5a4632,0x4a3a2a,0x65503a]);
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const hgt=sz<0?2.7:2.3;b.cyl('wood',sx*W/2,hgt/2,sz*D/2,0.06,0.075,hgt,pc,0,0,0,7);
  }
  // counter: legs, top planks, front panel
  b.box('wood',0,0.94,0.5,W-0.2,0.08,0.95,0x6a5239,0,0,0,0.12,1.2,0.02);
  b.box('wood',0,0.48,0.97,W-0.2,0.92,0.05,0x54402c,0,0,0,0.12,1.2);
  b.box('wood',-W/2+0.1,0.48,0.5,0.05,0.9,0.9,0x54402c,0,0,0,0.12,1.2);b.box('wood',W/2-0.1,0.48,0.5,0.05,0.9,0.9,0x54402c,0,0,0,0.12,1.2);
  // canopy: tarps (sagging) + patchwork
  const tc=pick(TARP);const tw=W+0.9,td=D+1.0;
  b.B.add('cloth',tarpGeo(tw,td,0.22),b.mat(0,2.55,0.0,1,1,1,0.12,0,0),tc,0.12);
  if(R()<0.6)b.B.add('cloth',tarpGeo(tw*0.5,td*0.7,0.1),b.mat(rr(-.6,.6),2.62,rr(-.2,.2),1,1,1,0.12,0,0.05),pick(TARP),0.12);
  // rope & string light
  b.beam('metal',[-W/2,2.6,D/2],[W/2,2.6,D/2],0.012,0x2a2420,4);
  // goods
  const g=kind%5;
  if(g===0){ // scrap/parts
    for(let i=0;i<6;i++)b.cyl('metal',-1.3+i*0.5,1.07,rr(.3,.7),0.07,0.07,rr(.3,.55),pick([0x6a4a3a,0x5a5a58,0x7a6a50]),Math.PI/2,R()*3,0,7);
    b.box('metal',0.9,1.1,0.6,0.5,0.18,0.35,0x4d5258,0,0.3,0,0.15,1,0.02);
    for(let i=0;i<4;i++)b.add('rubber',tireGeo(0.2,0.12),-1.0+i*0.55,0.15,-0.25,0x1c1a18,Math.PI/2,0,0,0.1);
  }else if(g===1){ // food/water
    for(let i=0;i<5;i++)b.add('metal',barrelGeo().scale(0.5,0.45,0.5),-1.3+i*0.3,0.98,rr(.35,.65),pick([0x3a5f80,0x6a7a4a,0xa46a2a,0x7a2f2f]),0,R()*6,0,0.15);
    for(let i=0;i<4;i++)b.box('wood',0.7+((i%2)*0.5),1.1+Math.floor(i/2)*0.0,0.5+(i>1?0.0:0),0.34,0.24,0.28,0x7a6040,0,R()*0.6,0,0.15,0.6,0.02);
    // hanging goods
    for(let i=0;i<5;i++){b.beam('matte',[-1.3+i*0.65,2.58,0.9],[-1.3+i*0.65,2.1,0.9],0.008,0x2a2420,3);b.add('matte',new THREE.SphereGeometry(0.1,6,5),-1.3+i*0.65,2.0,0.9,pick([0x7a5a2a,0x5a6a3a,0x8a3a2a]),0,0,0,0.2,1,1.5,1)}
  }else if(g===2){ // weapons board
    b.box('wood',0,1.65,-0.9,2.7,1.0,0.06,0x3e3026,0,0,0,0.1,1.2);
    for(let i=0;i<5;i++){const lx=-1.1+i*0.55;b.box('metal',lx,1.65+((i%2)*.15-.07),-0.85,0.1,0.55+(i%3)*0.12,0.06,0x2c2c2c,0,0,(R()-.5)*0.2,0.2)}
    b.box('metal',0.5,1.1,0.55,0.85,0.08,0.22,0x303030,0,0.2,0,0.2);b.box('wood',0.4,1.07,0.65,0.28,0.1,0.12,0x5a4632,0,0.2,0);
    for(let i=0;i<3;i++)b.box('matte',-1.2+i*0.3,1.08,0.5,0.18,0.12,0.12,0x4a5a3a,0,R(),0,0.2);
  }else if(g===3){ // cloth & junk
    for(let i=0;i<4;i++)b.box('cloth',-1.2+i*0.7,1.1+0.0,0.5,0.55,0.22,0.45,pick([0x6a5a46,0x7a4a3a,0x4a5a4a,0x8a7a5a]),0,R(),0,0.2,0.8);
    for(let i=0;i<4;i++){b.beam('metal',[-1.3+i*0.85,2.55,-0.7],[-1.3+i*0.85,1.7,-0.7],0.01,0x2a2420,3);b.box('cloth',-1.3+i*0.85,1.45,-0.7,0.5,0.55,0.06,pick([0x6a5a46,0x7a4a3a,0x4a5a4a,0x8a6a5a]),0,0,0,0.2,0.8)}
  }else{ // electronics / radio
    for(let i=0;i<3;i++){b.box('metal',-0.9+i*0.8,1.12,0.55,0.55,0.25,0.3,0x3c4044,0,R()*0.4-0.2,0,0.15,0.6,0.02);b.box('glow',-0.9+i*0.8,1.12,0.71,0.2,0.07,0.01,new THREE.Color(0.2,1.2,0.5))}
    b.cyl('metal',1.2,1.8,-0.6,0.015,0.015,1.6,0x3a3a3a,0,0,0.1,4);
  }
  b.collide(0,0.6,W,1.0);
  // bulb hanging at front
  const [wx,wz]=b.world(0,D/2+0.2);bulbSpots.push({x:wx,y:2.3,z:wz,s:1.3,c:[1,0.72,0.4]});
  b.add('glow',new THREE.SphereGeometry(0.07,8,6),0,2.3,D/2+0.2,new THREE.Color(2.5,1.6,0.8));
  b.beam('metal',[0,2.58,D/2+0.2],[0,2.35,D/2+0.2],0.008,0x2a2420,3);
  npcSpots.push({x:wx+(R()-.5)*0.1,z:wz-0.0,yaw:yaw,role:'vendor'});
}
// layout: two rows facing the main street (street along z, x=0)
const stallLay=[[-10.5,-14,Math.PI/2],[-10.5,-6,Math.PI/2],[-10.5,2.5,Math.PI/2],[-10.5,12,Math.PI/2],[10.5,-13,-Math.PI/2],[10.5,-4.5,-Math.PI/2],[10.5,4.5,-Math.PI/2],[10.5,13.5,-Math.PI/2]];
stallLay.forEach(([x,z,y],i)=>stall(x,z,y,i));

// ============================================================ shacks
function shack(x,z,yaw,w=5,d=4,hgt=2.6,opts={}){
  const b=new Bld(HB,x,z,yaw);
  const wallCol=opts.col||new THREE.Color(0.92+R()*0.14,0.9+R()*0.1,0.86+R()*0.1);
  const k=opts.mat||'rust';
  // 4 corrugated walls (front = +z has door opening)
  const doorW=1.1;
  b.B.add(k,corrugated(w,hgt),b.mat(0,0,-d/2,1,1,1,0,Math.PI,0),wallCol,0.1);
  b.B.add(k,corrugated(d,hgt),b.mat(-w/2,0,0,1,1,1,0,-Math.PI/2,0),wallCol,0.1);
  b.B.add(k,corrugated(d,hgt),b.mat(w/2,0,0,1,1,1,0,Math.PI/2,0),wallCol,0.1);
  // front with door gap & window
  const fw=(w-doorW)/2;
  b.B.add(k,corrugated(fw,hgt),b.mat(-(doorW/2+fw/2),0,d/2,1,1,1,0,0,0),wallCol,0.1);
  b.B.add(k,corrugated(fw,hgt),b.mat((doorW/2+fw/2),0,d/2,1,1,1,0,0,0),wallCol,0.1);
  b.box('wood',0,hgt-0.2,d/2,doorW+0.2,0.4,0.1,0x4a3a2a,0,0,0,0.1,1,0.01);
  // patch plates
  for(let i=0;i<2;i++){const px=rr(-w/2+.8,w/2-.8);b.box('plate',px,rr(.8,hgt-.7),-d/2-0.04,rr(.8,1.4),rr(.6,1.1),0.04,new THREE.Color(0.9,0.85,0.8),0,0,(R()-.5)*0.15,0.15,1.2)}
  // door plank ajar
  b.box('wood',doorW/2+0.25,1.0,d/2+0.38,0.06,1.9,0.8,0x54402c,0,0.5,0,0.1,1.2);
  // roof (slightly sloped corrugated) + overhang + rocks/tires on top
  const rp=Math.atan2(0.5,d);
  b.B.add('rust',corrugated(w+0.7,d+0.9,0.18,0.04).rotateX(-Math.PI/2),b.mat(0,hgt+0.0,0,1,1,1,rp,0,0),new THREE.Color(0.9,0.8,0.72),0.12);
  for(let i=0;i<3;i++)b.add('rubber',tireGeo(0.3,0.2),rr(-w/2+0.6,w/2-0.6),hgt+0.4,rr(-d/3,d/3),0x1c1a18,0.1,0,0,0.1);
  // rafters
  for(let i=0;i<4;i++)b.box('wood',-w/2+0.3+i*(w-0.6)/3,hgt-0.07,0,0.1,0.14,d+0.1,0x4a3a2a,0,0,0,0.1,1,0.02);
  // lamp inside the door (warm light spill)
  b.box('glow',0,hgt-0.55,d/2-0.8,0.12,0.12,0.12,new THREE.Color(2.5,1.7,0.9));
  const [wx,wz]=b.world(0,d/2-0.8);bulbSpots.push({x:wx,y:hgt-0.55,z:wz,s:1.8,c:[1,.68,.35]});
  // stove pipe
  if(R()<0.6){b.cyl('metal',w/2-0.8,hgt+1.1,-d/2+0.8,0.08,0.08,1.7,0x3a3028,0,0,0.04,8);b.cyl('metal',w/2-0.8,hgt+1.95,-d/2+0.8,0.14,0.1,0.1,0x2a2420,0,0,0.04,8)}
  // lean-to / awning with crates
  if(opts.awning){b.B.add('cloth',tarpGeo(w*0.9,2.2,0.15),b.mat(0,hgt-0.2,d/2+1.1,1,1,1,-0.25,0,0),pick(TARP),0.1);
    for(const sx of[-1,1])b.cyl('wood',sx*w*0.42,(hgt-0.5)/2,d/2+2.0,0.05,0.06,hgt-0.5,0x4a3a2a,0,0,0,6)}
  // crates / barrels outside
  let cx=rr(-w/2,w/2);if(Math.abs(cx)<1.2)cx=cx<0?-1.5:1.5;b.box('wood',cx,0.35,d/2+0.7,0.7,0.7,0.7,0x6a5036,0,R(),0,0.15,1);b.box('wood',cx+0.2,0.95,d/2+0.7,0.5,0.5,0.5,0x7a6040,0,R(),0,0.15,1);
  {const fw2=(w-1.1)/2;b.collide(0,-d/2,w,0.25);b.collide(-w/2,0,0.25,d);b.collide(w/2,0,0.25,d);b.collide(-(0.55+fw2/2),d/2,fw2,0.25);b.collide(0.55+fw2/2,d/2,fw2,0.25)}
  b.collide(cx,d/2+0.7,0.8,0.8);
  shackLog.push({b,w,d,hgt,x,z,yaw});
  return b;
}
const shackLay=[
  [-31,-3,Math.PI/2,5,4],[-31,6,Math.PI/2,5,4.5,2.7],[-31,15,Math.PI/2,6,4],[-31,24,Math.PI/2,4,3.5],
  [31,-18,-Math.PI/2,5,4.5,2.7],[31,-8,-Math.PI/2,5,4],[31,2,-Math.PI/2,6,4],[31,12,-Math.PI/2,4,4],[31,22,-Math.PI/2,5,3.5,2.5],
  [-20,25,Math.PI,5,3.5],[18,-25,0,6,4],[-6,-25,0,4,3.5,2.4],[24,24,Math.PI,5,3.5]
];
shackLay.forEach(([x,z,y,w,d,h],i)=>shack(x,z,y,w,d,h||2.5,{awning:i%3===0}));
// clinic: red cross marker
{const x=18,z=-25,y=0;const b=new Bld(HB,x,z,y);
 b.box('glow',1.7,1.6,2.07,0.6,0.18,0.03,new THREE.Color(1.6,0.2,0.15));b.box('glow',1.7,1.6,2.07,0.18,0.6,0.03,new THREE.Color(1.6,0.2,0.15));}

// Mechanic's workshop (mission target)
const MECH={x:-23,z:-17};
{
  const b=new Bld(HB,MECH.x,MECH.z,Math.PI/2);const w=11,d=8,h=4.2;
  b.B.add('concrete',(()=>{const g=new THREE.BoxGeometry(w+1,0.3,d+1);scaleBoxUV(g,w+1,0.3,d+1,2);return g})(),b.mat(0,0.12,0),0x7d766b,0.08);
  const wc=new THREE.Color(0.95,0.92,0.88);
  b.B.add('rust',corrugated(w,h),b.mat(0,0,-d/2,1,1,1,0,Math.PI,0),wc,0.08);
  b.B.add('rust',corrugated(d,h),b.mat(-w/2,0,0,1,1,1,0,-Math.PI/2,0),wc,0.08);
  b.B.add('rust',corrugated(d*0.55,h),b.mat(w/2,0,-d/4,1,1,1,0,Math.PI/2,0),wc,0.08);
  // open garage front (+z): wide with two pillars, lintel with sign
  for(const px of[-w/2+0.3,w/2-0.3,0])b.box('concrete',px,h/2,d/2,0.55,h,0.55,0x8a8277,0,0,0,0.1,1.6,0.04);
  b.box('plate',0,h-0.4,d/2,w,0.8,0.3,new THREE.Color(1,0.9,0.85),0,0,0,0.1,1.6,0.03);
  // roof
  b.B.add('rust',corrugated(w+1,d+1.2,0.18,0.04).rotateX(-Math.PI/2),b.mat(0,h+0.12,0,1,1,1,0.07,0,0),new THREE.Color(0.85,0.76,0.7),0.1);
  for(let i=0;i<4;i++)b.box('metal',-w/2+0.5+i*(w-1)/3,h-0.1,0,0.14,0.2,d,0x3a322c);
  // interior: workbench, lift with a car body, tool wall, glowing lamps
  b.box('wood',-w/2+0.9,0.55,-1.5,1.0,1.1,3.6,0x5a4632,0,0,0,0.1,1.2,0.03);
  for(let i=0;i<9;i++)b.box('metal',-w/2+0.9,1.2,-3+i*0.4,0.18,0.06,0.3,0x4a4d50,0,R(),0,0.3);
  b.box('wood',0,2.2,-d/2+0.1,w-1,1.5,0.08,0x3e3026,0,0,0,0.1,1.2);
  for(let i=0;i<14;i++)b.box('metal',-w/2+1.2+i*0.7,2.2+((i%3)-1)*0.3,-d/2+0.18,0.05,0.5,0.05,0x35383c,0,0,(R()-.5)*.3,0.3);
  for(const lx of[-2.5,2.5]){b.box('glow',lx,h-0.65,0.5,0.9,0.1,0.18,new THREE.Color(2.4,2.3,2.0));b.beam('metal',[lx,h-0.1,0.5],[lx,h-0.6,0.5],0.012,0x222222,3);const [wx,wz]=b.world(lx,0.5);bulbSpots.push({x:wx,y:h-0.6,z:wz,s:3.2,c:[1,0.88,0.62]})}
  // engine on hoist + tires + barrels
  b.box('metal',2.6,1.9,-1.5,1.0,0.7,0.8,0x3a3d40,0,0,0,0.15,0.8,0.04);b.beam('metal',[2.6,h-0.1,-1.5],[2.6,2.3,-1.5],0.03,0x2a2a2a,5);
  for(let i=0;i<5;i++)b.add('rubber',tireGeo(0.36,0.26),-1.8+((i%3)*0.8),0.26+Math.floor(i/3)*0.5,-3.0,0x1c1a18,Math.PI/2*0+0,0,0,0.1);
  b.collide(0,-1.5,w,d-3);
  b.collide(-w/2+0.9,-1.5,1.2,3.6);
  b.B.add('concrete',new THREE.BoxGeometry(0.01,0.01,0.01),b.mat(0,0,0),0x777777,0);
  // sign
  const sg=new THREE.Mesh(new THREE.PlaneGeometry(5.0,0.9),new THREE.MeshStandardMaterial({map:(()=>{const c=document.createElement('canvas');c.width=512;c.height=92;const g=c.getContext('2d');g.fillStyle='#2e3a40';g.fillRect(0,0,512,92);g.fillStyle='#d6c48f';g.font='900 56px Impact,"Arial Black",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('GEARHEAD · REPAIRS',256,50);
    g.globalAlpha=0.5;for(let i=0;i<300;i++){g.fillStyle='#000';g.fillRect(Math.random()*512,Math.random()*92,Math.random()*5,Math.random()*3)}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})(),roughness:0.8,metalness:0.3}));
  const [sx,sz]=b.world(0,d/2+0.2);sg.position.set(sx,h-0.4,sz);sg.rotation.y=Math.PI/2;haven.add(sg);
  npcSpots.push({x:MECH.x+7,z:MECH.z-0.5,yaw:-Math.PI/2*0+Math.PI/2,role:'mechanic'});
}
// water tower (landmark inside Haven)
{
  const x=-18,z=19,b=new Bld(HB,x,z,0);
  for(const sx of[-1,1])for(const sz of[-1,1]){b.beam('metal',[sx*2.6,0,sz*2.6],[sx*2.2,12,sz*2.2],0.14,0x4a3f36,7);}
  for(const hh of[4,8])for(const [a,c] of[[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]]){const f=1-hh/12*0.15;b.beam('metal',[a[0]*2.4*f,hh,a[1]*2.4*f],[c[0]*2.4*f,hh+1.7,c[1]*2.4*f],0.05,0x3a322c,5)}
  b.add('rust',(()=>{const pts=[];pts.push(new THREE.Vector2(0.01,0));pts.push(new THREE.Vector2(2.9,0));pts.push(new THREE.Vector2(3.0,0.1));pts.push(new THREE.Vector2(3.0,3.9));pts.push(new THREE.Vector2(2.9,4.0));pts.push(new THREE.Vector2(2.5,4.35));pts.push(new THREE.Vector2(0.01,4.9));const g=new THREE.LatheGeometry(pts,18);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*4,uv.getY(i)*3);return g})(),0,12,0,new THREE.Color(0.9,0.8,0.74),0,0,0,0.05);
  for(let k=0;k<5;k++)b.cyl('metal',0,12+0.2+k*0.9,0,3.04,3.04,0.07,0x2e2824,0,0,0,18);
  b.beam('metal',[2.3,0,0],[2.3,11.5,0],0.04,0x3a322c,5);
  b.cyl('metal',1.2,5,2.9,0.25,0.25,10,0x4a4a4a,0,0,0.05,8);
  for(const q of[[-1,-1],[1,-1],[1,1],[-1,1]])circles.push([x+q[0]*2.6,z+q[1]*2.6,0.35]);
}
// fire barrels placement
[[-6.5,5,'plaza'],[6.5,-4,'plaza'],[-4,-9.5,''],[5,9,''],[-14,-8,''],[14,17,''],[3,25,'gate'],[-3,-25,'gate'],[22,-4,''],[-24,9,'']].forEach(([x,z,t])=>fireBarrel(x,z,t));

// ============================================================ hanging string lights (catenary) & masts
const wireVerts=[];
function stringLight(ax,ay,az,bx,by,bz,sag=0.7,bulbs=7,warm=true){
  const N=14;let px=ax,py=ay,pz=az;
  for(let i=1;i<=N;i++){const t=i/N;const x=lerp(ax,bx,t),z=lerp(az,bz,t),y=lerp(ay,by,t)-sag*4*t*(1-t);wireVerts.push(px,py,pz,x,y,z);px=x;py=y;pz=z}
  for(let i=0;i<bulbs;i++){const t=(i+.6)/(bulbs+.2);const x=lerp(ax,bx,t),z=lerp(az,bz,t),y=lerp(ay,by,t)-sag*4*t*(1-t)-0.08;
    const c=warm?new THREE.Color(2.8,1.9,0.9):new THREE.Color(1.8,2.2,2.6);
    HB.add('glow',new THREE.SphereGeometry(0.075,6,5),mxm(x,y,z),c,0.15);
    if(R()<0.75)bulbSpots.push({x,y:y-0.05,z,s:0.9,c:warm?[1,0.7,0.38]:[0.7,0.85,1]});
  }
}
function mast(x,z,h=4.8){
  const gy=terrainH(x,z)-0.2;
  HB.add('wood',new THREE.CylinderGeometry(0.1,0.14,h,7),mxm(x,gy+h/2,z),0x4a3a2a,0.1);
  HB.add('metal',RB(0.7,0.08,0.08,0.02),mxm(x,gy+h-0.2,z),0x2a2420);
  circles.push([x,z,0.28]);return gy+h-0.2;
}
{
  const my=[];
  for(const z of[-18,-9,0,9,18]){const ya=mast(-7.8,z),yb=mast(7.8,z);my.push([z,ya,yb])}
  for(const [z,ya,yb] of my){stringLight(-7.8,ya,z,7.8,yb,z,0.9,9,true)}
  for(let i=0;i<my.length-1;i++){stringLight(-7.8,my[i][1],my[i][0],-7.8,my[i+1][1],my[i+1][0],0.5,4,true);stringLight(7.8,my[i][2],my[i][0],7.8,my[i+1][2],my[i+1][0],0.5,4,true)}
  // gate approach lines
  const gy=7.2;for(const sz of[-1,1]){stringLight(-6,gy-1.1,sz*HZ,6,gy-1.1,sz*HZ,0.5,8,true)}
  // plaza ring poles
  const pp=[];for(let i=0;i<6;i++){const a=i/6*Math.PI*2+0.3;pp.push([Math.cos(a)*9.6,Math.sin(a)*9.6*0.9])}
  // wall-mounted lamps along inside wall
  for(let i=-3;i<=3;i++){for(const sz of[-1,1]){const x=i*10+3,z=sz*(HZ-0.55);
    HB.add('metal',cylG(0.03,0.03,0.7,5),mxm(x,3.6,z,1,1,1,Math.PI/2*0,0,0),0x2a2420);
    HB.add('glow',new THREE.SphereGeometry(0.11,7,6),mxm(x,3.3,z-sz*0.35),new THREE.Color(3.0,2.0,1.0),0);
    bulbSpots.push({x,y:3.3,z:z-sz*0.35,s:1.7,c:[1,.7,.36]});
    HB.add('metal',new THREE.CylinderGeometry(0.2,0.1,0.14,8),mxm(x,3.45,z-sz*0.35),0x2a2420);
  }}
  for(let i=-1;i<=1;i++)for(const sx of[-1,1]){const z=i*18,x=sx*(HX-0.55);HB.add('glow',new THREE.SphereGeometry(0.11,7,6),mxm(x-sx*0.35,3.3,z),new THREE.Color(3.0,2.0,1.0));bulbSpots.push({x:x-sx*0.35,y:3.3,z,s:1.7,c:[1,.7,.36]});}
}

// ============================================================ Haven clutter
function scatterClutter(){
  const spots=[];
  const free=(x,z)=>{for(const b of boxes)if(x>b[0]-0.8&&x<b[2]+0.8&&z>b[1]-0.8&&z<b[3]+0.8)return false;for(const c of circles)if(Math.hypot(x-c[0],z-c[1])<c[2]+0.8)return false;
    if(Math.abs(x)<4.2&&Math.abs(z)>HZ-8)return false;if(Math.abs(x)<7.5&&Math.abs(z)<HZ-4)return false;return true};
  let n=0,t=0;
  while(n<70&&t<900){t++;
    const x=rr(-HX+1.5,HX-1.5),z=rr(-HZ+1.5,HZ-1.5);if(!free(x,z))continue;
    const k=R();const b=new Bld(HB,x,z,R()*6.28);
    if(k<0.28){ // crate stack
      b.box('wood',0,0.35,0,0.7,0.7,0.7,0x6a5036,0,0,0,0.15,1);if(R()<0.6)b.box('wood',0.05,1.0,0,0.55,0.5,0.55,0x7a6040,0,R(),0,0.15,1);circles.push([x,z,0.55])
    }else if(k<0.5){ // barrel
      b.add('rust',R()<0.5?barrelG:barrelOpenG,0,0,0,pick([new THREE.Color(1,.8,.65),new THREE.Color(.6,.8,1.0),new THREE.Color(.8,1,.7)]),0,0,0,0.12);circles.push([x,z,0.38])
    }else if(k<0.64){ // sandbags
      for(let i=0;i<5;i++)b.box('cloth',-0.6+i*0.3,0.12,0,0.34,0.22,0.24,pick([0x9a8a66,0x8a7a5a,0x7a6c50]),0,0,(R()-.5)*.2,0.1,0.5,0.06);
      for(let i=0;i<4;i++)b.box('cloth',-0.45+i*0.3,0.32,0,0.34,0.22,0.24,pick([0x9a8a66,0x8a7a5a,0x7a6c50]),0,0,(R()-.5)*.2,0.1,0.5,0.06);circles.push([x,z,0.7])
    }else if(k<0.76){ // tire pile
      for(let i=0;i<3;i++)b.add('rubber',tireGeo(0.33,0.22),0,0.12+i*0.2,0,0x1c1a18,Math.PI/2,0,0,0.1,1,1,1);circles.push([x,z,0.45])
    }else if(k<0.88){ // pallets & junk
      b.box('wood',0,0.08,0,1.0,0.14,1.2,0x5a4632,0,0,0,0.2,1);b.box('cloth',0.1,0.28,0,0.7,0.3,0.5,pick([0x7a6a50,0x5a5a48]),0,R(),0,0.2,0.6,0.1);
    }else{ // bedroll / cooking pot / bucket
      b.add('metal',new THREE.CylinderGeometry(0.17,0.14,0.22,8),0,0.11,0,0x4a4a48,0,0,0,0.2);b.box('wood',0.3,0.05,0.2,0.25,0.06,0.5,0x4a3a2a);
    }
    n++;
  }
}
scatterClutter();
// laundry lines
{for(const [x0,z0,x1,z1] of[[-31,-1,-31,10],[31,-12,31,-2]]){const y=2.5;
  for(const [px,pz] of[[x0,z0],[x1,z1]]){HB.add('wood',cylG(0.05,0.06,2.6,6),mxm(px+(x0<0?2.5:-2.5),1.3,pz),0x4a3a2a,0.1);}
  const ax=x0+(x0<0?2.5:-2.5),bx=x1+(x1<0?2.5:-2.5);
  for(let i=0;i<5;i++){const t=(i+.5)/5;const z=lerp(z0,z1,t);HB.box('cloth',lerp(ax,bx,t),y-0.34,z,0.03,0.6,0.42,pick([0x8a7a6a,0x6a7a8a,0x9a6a5a,0x7a8a6a,0xb0a58a]),0,0,0,0.2,0.4)}
  stringLight(ax,2.6,z0,bx,2.6,z1,0.15,0,true)}}

// ============================================================ static glow field, built after all lights are registered (see below)

// ============================================================ vehicle geometry
function carShape(){
  const s=new THREE.Shape();
  s.moveTo(-2.2,0.42);s.lineTo(2.2,0.42);s.lineTo(2.28,0.72);s.lineTo(2.2,0.95);s.lineTo(1.05,1.02);s.lineTo(0.5,1.48);s.lineTo(-0.9,1.48);s.lineTo(-1.5,1.06);s.lineTo(-2.15,1.0);s.lineTo(-2.28,0.76);s.closePath();
  return s;
}
const carBodyGeo=(()=>{const d=1.72;const g=new THREE.ExtrudeGeometry(carShape(),{depth:d,bevelEnabled:true,bevelThickness:0.07,bevelSize:0.07,bevelSegments:2,curveSegments:4});
  g.translate(0,0,-d/2);g.rotateY(-Math.PI/2);scaleBoxUVSimple(g);return g})();
function scaleBoxUVSimple(g){const p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+p.getZ(i))*0.4,p.getY(i)*0.4)}
const glassShape=(()=>{const s=new THREE.Shape();s.moveTo(1.0,1.045);s.lineTo(0.5,1.46);s.lineTo(-0.88,1.46);s.lineTo(-1.46,1.09);s.closePath();return s})();
const carGlassGeo=(()=>{const d=1.8;const g=new THREE.ExtrudeGeometry(glassShape,{depth:d,bevelEnabled:false});g.translate(0,0,-d/2);g.rotateY(-Math.PI/2);return g})();
const tireG=tireGeo(0.37,0.27).rotateY(Math.PI/2),rimG=rimGeo(0.21,0.27).rotateY(Math.PI/2),hubG=new THREE.CylinderGeometry(0.05,0.05,0.3,8).rotateZ(Math.PI/2);
// builds list of parts in car-local space; forward = +Z; returns {parts, wheels:[{x,y,z,parts}]}
function carParts(o){
  const P=[],W=[];
  const body=new THREE.Color(o.color);
  const add=(k,geo,m,hex,jit=0.06)=>P.push({k,geo,m,hex,jit});
  add('paint',carBodyGeo,null,body,0.04);
  if(!o.noGlass)add('glass',carGlassGeo,null,0x20262a,0);
  else{ // smashed windows: jagged shards
    for(let i=0;i<3;i++)add('glass',new THREE.BoxGeometry(0.02,0.18,0.35),mxm(0.9*(i%2?1:-1),1.2,rr(-.7,.7),1,1,1,R()*.4,0,R()*.4),0x20262a,0)}
  // pillars + roof highlight
  for(const z of[-0.0]){}
  const pill=(zz,w=0.1,tilt=0)=>add('paint',RB(1.86,0.45,w,0.02),mxm(0,1.25,zz,1,1,1,tilt,0,0),body,0.05);
  pill(0.0);pill(-0.0,0.0);
  add('paint',RB(1.76,0.07,2.15,0.025),mxm(0,1.525,-0.2),body,0.05);
  // bumpers
  add('metal',RB(1.9,0.18,0.22,0.06),mxm(0,0.56,2.3),0x58524c,0.12);add('metal',RB(1.9,0.18,0.22,0.06),mxm(0,0.56,-2.3),0x58524c,0.12);
  // grille / headlights / taillights
  add('matte',RB(1.1,0.22,0.06,0.02),mxm(0,0.78,2.3),0x161412,0);
  for(const sx of[-1,1]){
    add(o.lit?'glow':'metal',new THREE.CylinderGeometry(0.14,0.14,0.08,10).rotateX(Math.PI/2),mxm(sx*0.65,0.8,2.29),o.lit?new THREE.Color(3,2.8,2.2):0x8a8680,0);
    add(o.lit?'glow':'matte',RB(0.26,0.12,0.05,0.015),mxm(sx*0.7,0.84,-2.3),o.lit?new THREE.Color(1.8,0.12,0.08):0x5a1a14,0);
  }
  // wheel arches (dark) + side trim + door lines
  for(const sx of[-1,1])for(const sz of[-1,1]){add('matte',new THREE.CylinderGeometry(0.46,0.46,0.04,14).rotateZ(Math.PI/2),mxm(sx*0.9,0.43,sz*1.35),0x0e0d0c,0)}
  for(const sx of[-1,1]){
    add('matte',RB(0.03,0.025,2.2,0.01),mxm(sx*0.9,0.7,0),0x120f0d,0);
    for(const zz of[0.55,-0.7])add('matte',RB(0.025,0.55,0.025,0.008),mxm(sx*0.925,1.05,zz),0x120f0d,0);
    add('metal',RB(0.04,0.04,0.12,0.01),mxm(sx*0.93,0.97,-0.1),0x606060,0.2);
    add('metal',RB(0.12,0.1,0.14,0.02),mxm(sx*1.0,1.1,0.95),o.color,0.05);                       // mirror
  }
  add('matte',RB(1.7,0.02,0.04,0.005),mxm(0,1.0,1.02),0x120f0d,0);
  if(o.rack){add('metal',RB(1.5,0.04,1.2,0.01),mxm(0,1.6,-0.3),0x2a2622,0.1);for(let i=0;i<4;i++)add('metal',RB(0.04,0.14,1.2,0.01),mxm(-0.7+i*0.47,1.66,-0.3),0x2a2622,0.1);
    add('paint',new THREE.BoxGeometry(0.42,0.5,0.14),mxm(0.4,1.88,-0.7),0x6a7a3a,0.1);add('paint',new THREE.BoxGeometry(0.42,0.5,0.14),mxm(-0.1,1.88,-0.7),0x8a3a2a,0.1);
    add('rubber',tireGeo(0.3,0.22),mxm(-0.4,1.85,0.0,1,1,1,0.0,0,0).multiply(mxm(0,0,0,1,1,1,Math.PI/2,0,0)),0x1c1a18,0.1);}
  if(o.exhaust)add('metal',new THREE.CylinderGeometry(0.04,0.04,0.7,6).rotateX(Math.PI/2),mxm(0.55,0.36,-2.1),0x403a34,0.1);
  // interior (seats) visible through glass
  add('matte',RB(1.3,0.5,0.35,0.06),mxm(0,1.05,-0.55),0x3a2e26,0.2);add('matte',RB(1.3,0.35,0.5,0.06),mxm(0,0.8,0.15),0x2e2520,0.2);
  add('matte',new THREE.TorusGeometry(0.19,0.018,5,12),mxm(-0.38,1.18,0.55,1,1,1,0.35,0,0),0x1a1612,0);
  // wheels
  const wp=[[-0.92,0.37,1.35],[0.92,0.37,1.35],[-0.92,0.37,-1.35],[0.92,0.37,-1.35]];
  wp.forEach((p,i)=>{
    if(o.missingWheels&&o.missingWheels.includes(i)){add('metal',hubG,mxm(p[0],0.14,p[2]),0x4a3a30,0.1);return}
    const wl={x:p[0],y:p[1],z:p[2],front:i<2,parts:[]};
    wl.parts.push({k:'rubber',geo:tireG,m:new THREE.Matrix4(),hex:0x1c1a18,jit:0.1});
    wl.parts.push({k:'metal',geo:rimG,m:new THREE.Matrix4(),hex:o.rimColor||0x8a8680,jit:0.1});
    wl.parts.push({k:'metal',geo:hubG,m:new THREE.Matrix4(),hex:0x3a3632,jit:0.1});
    for(let l=0;l<5;l++){const a=l/5*Math.PI*2;wl.parts.push({k:'metal',geo:new THREE.BoxGeometry(0.03,0.15,0.03).translate(0,0.09,0),m:mxm(0,0,0.0,1,1,1,0,0,0).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(p[0]>0?0.0:0,0,0)),hex:0x4a4640,jit:0.1})}
    W.push(wl);
  });
  return {P,W};
}
// static wreck
function wreck(x,z,yaw,o={}){
  const base=Math.max(terrainH(x,z),terrainH(x+1.2,z),terrainH(x-1.2,z),terrainH(x,z+2),terrainH(x,z-2));
  const color=o.color??pick([0x8a3a24,0x5f6b52,0x7a6a42,0x56606a,0x6e6e66,0x8a5a2a,0x4a5058,0x7a2f28]);
  const missing=[];for(let i=0;i<4;i++)if(R()<0.28)missing.push(i);
  const {P,W}=carParts({color,noGlass:true,missingWheels:missing,exhaust:true,rack:R()<0.2});
  const flip=o.flip??(R()<0.12);const pitch=o.pitch??(R()-.5)*0.08,roll=flip?Math.PI+(R()-.5)*0.1:(R()-.5)*0.1;
  const M0=mxm(x,base+(flip?1.5:0.02)+(missing.length?-0.12:0),z,1,1,1,pitch,yaw,roll);
  const all=[...P];W.forEach(w=>{const wm=mxm(w.x,w.y,w.z);w.parts.forEach(p=>all.push({...p,m:wm.clone().multiply(p.m)}))});
  // deflated: tilt wrecks with missing wheels & rust patina
  for(const p of all){
    const col=new THREE.Color(p.hex);
    if(p.k==='paint'){col.multiplyScalar(0.7+R()*0.2);col.lerp(new THREE.Color(0x6a3a1c),R()*0.5)}
    B_STATIC.add(p.k,p.geo,M0.clone().multiply(p.m||new THREE.Matrix4()),col,p.jit??0.05);
  }
  // doors ajar / scraps
  if(R()<0.6)B_STATIC.add('paint',RB(0.06,0.55,1.0,0.02),M0.clone().multiply(mxm(0.98,1.0,0.1,1,1,1,0,0.6,0)),new THREE.Color(color).multiplyScalar(0.6),0.1);
  wreckList.push({x,z,yaw,flip});
  const cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(const o2 of[-1.4,0,1.4])circles.push([x+sn*o2,z+cs*o2,1.05]);
  if(o.smoke)smokeSources.push({x,y:base+1.2,z,k:o.smoke});
}
const B_STATIC=new Batcher(80);
const smokeSources=[];
const wreckList=[];

// ============================================================ wasteland dressing
const outside=(x,z)=>(Math.abs(x)>HX+3||Math.abs(z)>HZ+3)&&!RUINS.some(r=>Math.hypot(x-r.x,z-r.z)<17);
// wrecks on the road & verge
{
  const spots=[];
  for(let i=0;i<22;i++){
    const z=(i%2?1:-1)*rr(HZ+14,330);const x=roadX(z)+rr(-4.8,4.8);
    if(Math.abs(z)>335)continue;if(spots.some(s=>Math.hypot(s[0]-x,s[1]-z)<9))continue;spots.push([x,z]);
    const yaw=Math.atan2(roadDX(z),1)+(R()<.5?0:Math.PI)+rr(-.5,.5);
    wreck(x,z,Math.atan2(roadDX(z),1)*0+ (R()<.5?0:Math.PI)+rr(-.4,.4)+Math.PI*0,{smoke:R()<0.12?1:0});
  }
  // a pile-up outside gate
  wreck(roadX(HZ+22)-2,HZ+22,0.5,{flip:false});wreck(roadX(HZ+27)+2.5,HZ+27,-0.4+Math.PI,{});
  for(let i=0;i<20;i++){const x=rr(-300,300),z=rr(-300,300);if(!outside(x,z)||Math.abs(x-roadX(z))<8)continue;wreck(x,z,R()*6.28,{})}
}
// road barriers, debris, signs
for(let i=0;i<46;i++){
  const z=(R()<.5?1:-1)*rr(HZ+10,330),x=roadX(z)+(R()<.5?-1:1)*rr(5.8,9);const gy=terrainH(x,z);
  const k=R();const b=new Bld(B_STATIC,x,z,R()*6.28);
  if(k<0.3){b.box('concrete',0,0.45,0,0.6,0.9,2.4,0x9a9488,0,0,0,0.15,1.5,0.05);b.box('concrete',0,0.95,0,0.34,0.1,2.1,0x8a8478)}
  else if(k<0.55){b.add('rust',R()<.5?barrelG:barrelOpenG,0,0,0,new THREE.Color(1,.85,.7),R()<0.3?Math.PI/2:0,0,0,0.12);circles.push([x,z,0.4])}
  else if(k<0.75){for(let j=0;j<3;j++)b.add('rubber',tireGeo(0.34,0.22),(j-1)*0.1,0.12+j*0.2,0,0x1c1a18,Math.PI/2,0,0,0.1)}
  else{b.box('plate',0,0.9,0,2.2,0.05,0.9,new THREE.Color(0.9,0.85,0.8),0.3,R(),0.2,0.1,1.2)}
}
// road signs (bent)
for(let i=0;i<14;i++){const z=(R()<.5?1:-1)*rr(HZ+10,320);const x=roadX(z)+(R()<.5?-1:1)*6.5;const b=new Bld(B_STATIC,x,z,R()*6.28);
  b.cyl('metal',0,1.5,0,0.04,0.04,3.1,0x56524c,0,0,(R()-.5)*0.15,6);
  b.box('plate',0,2.8,0.03,0.9,0.9,0.03,new THREE.Color(0.9,0.55+R()*0.3,0.3),0.0,0,(R()-.5)*0.4,0.1,1)}
// rocks
const rockGeoms=[0,1,2].map(i=>{const g=new THREE.DodecahedronGeometry(1,1);const p=g.attributes.position;for(let k=0;k<p.count;k++){const n=0.78+0.4*hash2(Math.round(p.getX(k)*40)+i*7,Math.round(p.getZ(k)*40)+Math.round(p.getY(k)*40));p.setXYZ(k,p.getX(k)*n,p.getY(k)*n*0.75,p.getZ(k)*n)}g.computeVertexNormals();return g});
for(let i=0;i<260;i++){
  const x=rr(-HALF+40,HALF-40),z=rr(-HALF+40,HALF-40);if(!outside(x,z)||Math.abs(x-roadX(z))<5)continue;
  const s=R()<0.15?rr(1.5,3.8):rr(0.25,1.0);const gy=terrainH(x,z);
  const g=pick(rockGeoms).clone();const uv=g.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*2,uv.getY(k)*2);
  B_STATIC.add('concrete',g,mxm(x,gy+s*0.18,z,s*rr(.9,1.5),s*rr(.7,1.1),s*rr(.9,1.4),R()*.4,R()*6,R()*.3),pick([0x8a7a68,0x7b7468,0x9a8268,0x6f685f,0x806a58]),0.15);
  if(s>1.3)circles.push([x,z,s*0.95]);
}
// dead trees
function taperTube(points,r0,r1,sides=5){
  const pos=[],idx=[],uv=[];const up=new THREE.Vector3(0,1,0);
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const t=new THREE.Vector3().subVectors(b,a).normalize();
    const nn=new THREE.Vector3().crossVectors(t,Math.abs(t.y)>0.95?new THREE.Vector3(1,0,0):up).normalize();
    const bb=new THREE.Vector3().crossVectors(t,nn).normalize();
    const r=lerp(r0,r1,i/(points.length-1))*(1+((i*7)%3)*0.06);
    for(let j=0;j<=sides;j++){const an=j/sides*Math.PI*2;
      pos.push(points[i].x+(nn.x*Math.cos(an)+bb.x*Math.sin(an))*r,points[i].y+(nn.y*Math.cos(an)+bb.y*Math.sin(an))*r,points[i].z+(nn.z*Math.cos(an)+bb.z*Math.sin(an))*r);uv.push(j/sides*2,i*0.7)}
  }
  const S=sides+1;
  for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*S+j,b=a+1,c=a+S,d=b+S;idx.push(a,c,b,b,c,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function deadTree(x,z,s){
  const y=terrainH(x,z)-0.25;const H=rr(3.4,6.2)*s;
  const base=new THREE.Vector3(x,y,z);const tcol=pick([0x5e5046,0x4e463e,0x6a5a48]);
  const pts=[];let p=base.clone();let dx=0,dz=0;
  for(let i=0;i<=6;i++){pts.push(p.clone());dx+=rr(-.35,.35);dz+=rr(-.35,.35);p.add(new THREE.Vector3(dx*0.5,H/6,dz*0.5))}
  B_STATIC.add('wood',taperTube(pts,0.34*s,0.06*s,6),null,tcol,0.1);
  // root flare
  for(let k=0;k<3;k++){const a=k*2.1+R();const q=[base.clone().add(new THREE.Vector3(Math.cos(a)*0.7,0.0,Math.sin(a)*0.7)),base.clone().add(new THREE.Vector3(Math.cos(a)*0.3,0.5,Math.sin(a)*0.3)),base.clone().add(new THREE.Vector3(0,0.9,0))];B_STATIC.add('wood',taperTube(q,0.08*s,0.2*s,4),null,tcol,0.1)}
  const branch=(start,dir,len,r,depth)=>{
    const bp=[start.clone()];let cur=start.clone(),d=dir.clone();
    for(let i=0;i<4;i++){d.add(new THREE.Vector3(rr(-.45,.45),rr(-.2,.25),rr(-.45,.45))).normalize();cur=cur.clone().addScaledVector(d,len/4);bp.push(cur.clone())}
    B_STATIC.add('wood',taperTube(bp,r,r*0.2,4),null,tcol,0.1);
    if(depth>0)for(let k=0;k<2;k++){const i=1+Math.floor(R()*3);branch(bp[i],new THREE.Vector3(rr(-1,1),rr(.2,.9),rr(-1,1)).normalize(),len*0.62,r*0.5,depth-1)}
  };
  const nb=3+Math.floor(R()*4);
  for(let k=0;k<nb;k++){const i=2+Math.floor(R()*4);const a=R()*6.28;branch(pts[i],new THREE.Vector3(Math.cos(a),rr(.3,1.0),Math.sin(a)).normalize(),rr(1.4,2.7)*s,0.11*s,1)}
  branch(pts[6],new THREE.Vector3(rr(-.3,.3),1,rr(-.3,.3)),rr(1,1.8)*s,0.07*s,1);
  circles.push([x,z,0.4*s]);
}
for(let i=0;i<110;i++){const x=rr(-HALF+30,HALF-30),z=rr(-HALF+30,HALF-30);
  if(!outside(x,z)||Math.abs(x-roadX(z))<7)continue;deadTree(x,z,rr(.8,1.4))}
// a few trees right at the Haven wall for the hero shot / scale
deadTree(-HX-9,-12,1.2);deadTree(HX+10,18,1.0);deadTree(roadX(HZ+12)+9,HZ+12,1.1);

// distant ruined skyline (low-detail towers) for depth
{
  const rb=new Batcher(300);const spots=[];
  for(let i=0;i<26;i++){
    const a=R()*Math.PI*2,r=rr(190,330);const x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x-roadX(z))<18||Math.abs(x)>HALF-30||Math.abs(z)>HALF-30)continue;
    const w=rr(10,22),d=rr(10,20),h=rr(14,48),gy=terrainH(x,z)-1;
    const b=new Bld(rb,x,z,R()*6);
    // skeleton: floor slabs & columns, broken top
    const fl=Math.floor(h/4);
    for(let f=0;f<=fl;f++){if(R()<0.82)b.box('concrete',rr(-1,1),gy+f*4,rr(-1,1),w*rr(.7,1),0.5,d*rr(.7,1),0x8a847a,0,0,(R()-.5)*0.06,0.12,3)}
    for(const [cx,cz] of[[-1,-1],[1,-1],[1,1],[-1,1]]){const ch=h*rr(0.5,1);b.box('concrete',cx*w/2*0.9,gy+ch/2,cz*d/2*0.9,0.9,ch,0.9,0x7d776d,0,0,(R()-.5)*0.05,0.12,3)}
    b.box('concrete',w/2*0.9,gy+h*0.4,0,0.5,h*0.8,d*0.8,0x8a847a,0,0,0,0.12,3);
    circles.push([x,z,Math.min(w,d)*0.5]);
  }
  rb.build(world);
}
// radio tower with blinking lights
const towerBlinks=[];
{
  const Tm=new Batcher(300);const y0=terrainH(TOWER.x,TOWER.z);const H=96,W0=7.5,W1=0.9,lvl=12;
  const corner=(l,k)=>{const t=l/lvl,w=lerp(W0,W1,t**0.9);const sx=[1,-1,-1,1][k],sz=[1,1,-1,-1][k];return new THREE.Vector3(TOWER.x+sx*w,y0+t*H,TOWER.z+sz*w)};
  const strut=(a,b,r,hex,seg=6)=>{const d=new THREE.Vector3().subVectors(b,a),len=d.length();const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
    Tm.add('metal',new THREE.CylinderGeometry(r,r,len,seg),new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,new THREE.Vector3(1,1,1)),hex,0.05)};
  for(let l=0;l<lvl;l++)for(let k=0;k<4;k++){
    strut(corner(l,k),corner(l+1,k),0.26-l*0.014,l%2?0xd0c8bc:0xb23a28,6);const k2=(k+1)%4;
    strut(corner(l,k),corner(l+1,k2),0.08,0x7a7268,4);strut(corner(l+1,k),corner(l,k2),0.08,0x7a7268,4);strut(corner(l+1,k),corner(l+1,k2),0.1,0x7a7268,4);}
  strut(new THREE.Vector3(TOWER.x,y0+H,TOWER.z),new THREE.Vector3(TOWER.x,y0+H+22,TOWER.z),0.16,0xcfc6b8);
  for(let i=0;i<3;i++){const hh=y0+H*(0.45+i*0.18);const a=i*2.1;Tm.add('metal',new THREE.CylinderGeometry(1.4,1.4,0.3,12).rotateX(Math.PI/2),mxm(TOWER.x+Math.cos(a)*3.0,hh,TOWER.z+Math.sin(a)*3.0,1,1,1,0,a+1.57,0),0xb0a89c,0.05)}
  // base building (mission radio shack)
  const b=new Bld(Tm,TOWER.x+16,TOWER.z+4,0.3);
  b.box('concrete',0,1.6,0,8,3.2,6,0x8a857a,0,0,0,0.05,2,0.03);b.box('plate',0,3.3,0,8.6,0.3,6.6,new THREE.Color(0.8,0.75,0.7));b.box('wood',-4.01,1.1,0,0.1,2.2,1.4,0x2a2420);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+0.78;strut(new THREE.Vector3(TOWER.x+Math.cos(a)*W0*1.1,y0,TOWER.z+Math.sin(a)*W0*1.1),new THREE.Vector3(TOWER.x+Math.cos(a)*W0*2.6,y0+0.3,TOWER.z+Math.sin(a)*W0*2.6),0.03,0x3a3a3a,4)}
  Tm.build(world);
  for(const [h,s] of[[H+22.4,16],[H*0.55,10],[H*0.8,12]]){
    towerBlinks.push({pos:new THREE.Vector3(TOWER.x,y0+h,TOWER.z),s});
  }
  for(let i=0;i<4;i++){const a=i*1.57+.78;circles.push([TOWER.x+Math.cos(a)*W0,TOWER.z+Math.sin(a)*W0,0.8])}
  circles.push([TOWER.x+16,TOWER.z+4,4.5]);
}
// telephone poles along the road
{
  for(let z=HZ+14;z<340;z+=34)for(const sg of[1,-1]){const zz=sg*z,x=roadX(zz)+8.5;const b=new Bld(B_STATIC,x,zz,0);
    const lean=(R()-.5)*0.1;b.cyl('wood',0,4.2,0,0.1,0.13,8.6,0x4a3d30,0,0,lean,7);b.box('wood',0,7.8,0,0.1,0.1,2.3,0x3e3328,0,0,lean);
    for(const sx of[-0.9,0,0.9])b.box('concrete',sx,7.92,0,0.07,0.12,0.07,0xaaa090,0,0,0);}
  const wp=[];for(let z=-330;z<=-HZ-14;z+=34)wp.push(z);
}
await stage(0.55,'Scattering rocks and wrecks');
// grass tufts (instanced crossed quads)
{
  const tex=tuftTexture();
  const mat=new THREE.MeshStandardMaterial({map:tex,alphaTest:0.5,side:THREE.DoubleSide,roughness:1,metalness:0,envMapIntensity:0.1});
  const q=new THREE.PlaneGeometry(1,1).translate(0,0.5,0);const q2=q.clone().rotateY(Math.PI/2);const g=mergeGeometries([q,q2]);
  const N=MOBILE?1400:4200;
  const im=new THREE.InstancedMesh(g,mat,N);const m=new THREE.Matrix4(),qq=new THREE.Quaternion(),e=new THREE.Euler(),sc=new THREE.Vector3(),pp=new THREE.Vector3();
  let k=0,tries=0;const col=new THREE.Color();
  while(k<N&&tries<N*8){tries++;
    const near=R()<0.45;let x,z;
    if(near){x=rr(-110,110);z=rr(-110,110)}else{x=rr(-HALF+30,HALF-30);z=rr(-HALF+30,HALF-30)}
    if(Math.abs(x)<HX+2&&Math.abs(z)<HZ+2)continue;if(Math.abs(x-roadX(z))<4.6)continue;
    const s=rr(0.5,1.2);pp.set(x,terrainH(x,z)-0.03,z);e.set(0,R()*6.28,0);qq.setFromEuler(e);sc.set(s*1.0,s*rr(.6,1.1),s);
    m.compose(pp,qq,sc);im.setMatrixAt(k,m);col.setHSL(0.09+R()*0.03,0.35+R()*0.15,0.34+R()*0.22);im.setColorAt(k,col);k++}
  im.count=k;im.castShadow=false;im.receiveShadow=false;im.frustumCulled=false;world.add(im);
  // haven edge weeds/sprigs
}
// ============================================================ v5 WORLD: enterable ruins, containers, doors, props, skeletons
const CONT=[];            // lootable containers {kind,x,y,z,yaw,tbl,items,searched,respawnAt,lock,name,id}
const DOORS=[];           // {pivot,mesh,box,x,z,open,target,ang,locked,key,name}
const IA=[];              // generic interaction points {type,x,z,r,label,...}
const bedSpots=[];
const _mats5={door:new THREE.MeshStandardMaterial({color:0x6a5238,roughness:0.9,metalness:0.05}),doorM:new THREE.MeshStandardMaterial({color:0x5d6258,roughness:0.6,metalness:0.7})};
function addCont(kind,x,z,yaw,o={}){
  const y=o.y??terrainH(x,z);
  if(kind!=='none'){
    const parts=containerParts(kind==='trunk'||kind==='stash'?'crate':kind,o.v||0);
    if(!o.noMesh){const m0=mxm(x,y,z,1,1,1,0,yaw,0);for(const p of parts)B_STATIC.add(p.k,p.g,m0.clone().multiply(mxm(p.p[0],p.p[1],p.p[2],1,1,1,p.r[0],p.r[1],p.r[2])),p.c,0.08)}
  }
  if(o.solid!==false&&kind!=='skeleton'&&kind!=='corpse'&&kind!=='trunk')circles.push([x,z,o.cr??0.42]);
  const c={kind:kind==='corpse'?'skeleton':kind,x,y,z,yaw,tbl:o.tbl||kind,items:null,searched:false,respawnAt:0,lock:o.lock||null,name:o.name||CONTAINER_NAMES[kind]||'Container',id:CONT.length,fixed:o.fixed||null,rad:o.rad??1.7,v:o.v||0};
  CONT.push(c);return c;
}
function addDoor(wx,wz,yaw,width,o={}){ // hinge at (wx,wz), closed door extends along local +x rotated by yaw
  const h=o.h??2.2,t=0.09;
  const pivot=new THREE.Group();pivot.position.set(wx,0,wz);pivot.rotation.y=yaw;world.add(pivot);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,h,t),o.metal?_mats5.doorM:_mats5.door);mesh.position.set(width/2,h/2,0);mesh.castShadow=true;pivot.add(mesh);
  const ex=Math.cos(yaw)*width,ez=-Math.sin(yaw)*width;   // local +x in world
  const x0=Math.min(wx,wx+ex)-0.08,x1=Math.max(wx,wx+ex)+0.08,z0=Math.min(wz,wz+ez)-0.08,z1=Math.max(wz,wz+ez)+0.08;
  const box=[x0,z0,x1,z1];box.door=true;box.box0=[x0,z0,x1,z1];boxes.push(box);
  const d={pivot,mesh,box,x:wx+ex/2,z:wz+ez/2,open:!!o.open,ang:o.open?1:0,locked:o.locked||null,name:o.name||'Door',width,yaw,sign:o.sign??-1};
  if(d.open){box[0]=box[1]=1e6;box[2]=box[3]=1e6+1;pivot.rotation.y=yaw-1.75}
  DOORS.push(d);return d;
}
function ruin(r){
  const {x,z,yaw,w,d}=r;const b=new Bld(B_STATIC,x,z,yaw);const H=3.3,t=0.26;
  const mat=(r.kind==='house'||r.kind==='cabin')?'wood':'concrete';
  const baseCol=()=>mat==='wood'?new THREE.Color(0.9+R()*0.12,0.85+R()*0.1,0.8+R()*0.1):new THREE.Color(0.88+R()*0.1,0.86+R()*0.1,0.82+R()*0.1);
  const wc=mat==='wood'?0x7a6246:0x9a9486;
  const topH=()=>H*(0.62+R()*0.38);
  // wall along local X (z=pos) or along Z (x=pos); gaps: [{c,w,y0,y1}]
  function wall(axis,pos,len,gaps,breakTop=true){
    gaps=[...gaps].sort((p,q)=>p.c-q.c);let cur=-len/2;
    const piece=(a,bb,y0,y1,solid=true)=>{const L=bb-a;if(L<0.05||y1-y0<0.05)return;const cc=(a+bb)/2,ym=(y0+y1)/2;
      if(axis==='x'){b.box(mat,cc,ym,pos,L,y1-y0,t,wc,0,0,0,0.12,2.4,0.05);if(solid)b.collide(cc,pos,L,t)}else{b.box(mat,pos,ym,cc,t,y1-y0,L,wc,0,0,0,0.12,2.4,0.05);if(solid)b.collide(pos,cc,t,L)}};
    const fullSeg=(a,bb)=>{const n=Math.max(1,Math.round((bb-a)/2.2));for(let i=0;i<n;i++){const s=a+(bb-a)*i/n,e=a+(bb-a)*(i+1)/n;piece(s,e,0,breakTop?topH():H)}};
    for(const g of gaps){fullSeg(cur,g.c-g.w/2);if(g.y0>0)piece(g.c-g.w/2,g.c+g.w/2,0,g.y0);if(g.y1<H)piece(g.c-g.w/2,g.c+g.w/2,g.y1,H,false);cur=g.c+g.w/2}
    fullSeg(cur,len/2);
  }
  const dw=1.25;
  wall('x',-d/2,w,[{c:rr(-w/4,w/4),w:1.5,y0:1.0,y1:2.1}]);                       // back wall w/ window
  wall('x',d/2,w,[{c:0,w:dw,y0:0,y1:2.3}]);                                        // front wall with door
  wall('z',-w/2,d,[{c:rr(-d/5,d/5),w:1.4,y0:0.95,y1:2.15}]);                       // side walls with windows
  wall('z',w/2,d,[{c:rr(-d/5,d/5),w:1.4,y0:0.95,y1:2.15}]);
  // floor slab, interior partition with a door
  b.box('concrete',0,0.04,0,w-0.2,0.1,d-0.2,0x6f6a60,0,0,0,0.1,2,0);
  const pz=-d/6;
  wall('x',pz,w-0.5,[{c:w/5,w:1.0,y0:0,y1:2.2}],false);
  // roof sheets over the back third, rafters, hole in the front
  b.B.add('rust',corrugated(w+0.5,d*0.45,0.18,0.04).rotateX(-Math.PI/2),b.mat(0,H+0.05,-d*0.26,1,1,1,0.05,0,0),new THREE.Color(0.8,0.72,0.66),0.1);
  for(let i=0;i<4;i++)b.box('wood',-w/2+0.3+i*(w-0.6)/3,H-0.05,0.0,0.12,0.16,d,0x4a3a2a,0,0,0,0.1,1);
  // rubble outside and in
  for(let i=0;i<5;i++){const a=R()*6.28,rd=Math.max(w,d)/2+rr(0.5,2.5);b.box('concrete',Math.cos(a)*rd,0.2,Math.sin(a)*rd,rr(.4,1.3),rr(.2,.6),rr(.4,1),0x8a8478,0,R()*3,(R()-.5)*0.4,0.15,2,0.05)}
  // front door (hinged at left jamb)
  const [hx,hz]=b.world(-dw/2,d/2);
  const dr=addDoor(hx,hz,yaw+Math.PI/2*0+0,dw,{name:r.name,locked:r.locked||null,metal:r.kind==='depot'});
  // yaw of closed door: local +x in world = (cos yaw, -sin yaw); rotation about Y by 'yaw' maps +x to (cos yaw, 0, -sin yaw). OK
  dr.sign=-1;
  const [ix,iz]=b.world(w/5-0.5,pz);addDoor(ix,iz,yaw,1.0,{name:'Inner door',open:R()<0.5});
  // interior containers
  const spot=(lx,lz,face)=>{const [wx,wz]=b.world(lx,lz);return [wx,wz,yaw+face]};
  const back=-d/2+0.42,sideL=-w/2+0.42,sideR=w/2-0.42;
  const place=(kind,lx,lz,face,o={})=>{const [wx,wz,yy]=spot(lx,lz,face);return addCont(kind,wx,wz,yy,{y:0.09,...o})};
  const FL=Math.PI/2,FR=-Math.PI/2;   // face +x / face -x
  if(r.kind==='shop'){
    place('cabinet',-w/2+1.2,back,0,{v:1});place('cabinet',-w/2+2.5,back,0);place('crate',w/2-1.2,back,0);place('toolbox',w/4,back+0.6,0);
    place('locker',sideL,0.2,FL);place('crate',sideR,d/4,FR,{v:1});place('crate',-w/4,d/2-0.9,0);
    b.box('wood',0,0.5,pz+1.4,2.4,1.0,0.7,0x5a4632,0,0,0,0.1,1.2,0.03);      // counter
    for(let i=0;i<3;i++)b.box('wood',w/4+i*0.9-0.8,1.0,back-0.1,0.7,0.06,0.3,0x4a3a2a);
  }else if(r.kind==='house'){
    place('fridge',sideL,back+0.2,FL);place('cabinet',-w/4,back,0);place('cabinet',sideR,0.4,FR,{v:1});place('crate',w/4,back,0,{v:1});place('locker',sideR,d/3,FR);
    b.box('wood',0,0.5,0.9,1.6,0.08,0.9,0x5a4632,0,0,0,0.1,1,0.02);for(const [px,pzz] of[[-0.7,0.5],[0.7,0.5],[-0.7,1.3],[0.7,1.3]])b.box('wood',px,0.25,pzz,0.06,0.5,0.06,0x4a3a2a);
    b.box('cloth',-w/2+1.2,0.3,-d/2+2.2+0.0,0.9,0.28,1.9,0x6a5a46,0,FL*0,0,0.1,1.2,0);      // bed
    const [bx,bz]=b.world(-w/2+1.2,-d/2+2.2);
  }else if(r.kind==='depot'){
    place('locker',-w/2+1.0,back,0);place('locker',-w/2+1.7,back,0,{v:1});place('crate',w/4,back,0);place('crate',w/4+0.9,back,0,{v:1});place('toolbox',sideL,0.5,FL);
    place('safe',w/2-0.9,back+0.1,0,{lock:{type:'code',code:'4172',pick:0.35},tbl:'safe',name:'Depot safe'});place('locker',sideR,d/4,FR,{lock:{type:'pick',pick:0.7},name:'Locked locker'});
    place('crate',0,d/2-1.0,0);b.box('metal',0,1.2,pz,0.1,2.4,0.1,0x4a4a4a);
  }else if(r.kind==='clinic'){
    place('cabinet',-w/2+1.2,back,0,{tbl:'cabinet'});place('cabinet',-w/2+2.3,back,0,{v:1});place('cabinet',w/2-1.2,back,0);place('fridge',sideL,0.9,FL);place('locker',sideR,-0.2,FR);
    place('cabinet',sideR,d/3,FR,{v:1});
    for(const px of[-1.2,1.2])b.box('cloth',px,0.4,d/4,0.9,0.12,1.9,0x8a867a,0,0,0,0.1);      // cots
    addCont('skeleton',...b.world(0.2,-d/2+1.2),yaw+0.4,{tbl:'skeleton',noMesh:false,y:0.1,name:'Remains of a doctor'});
  }else if(r.kind==='cabin'){
    place('crate',sideL,back,0);place('crate',-w/4,back,0,{v:1});place('locker',sideR,back,0);place('toolbox',sideR,0.8,FR);
    b.box('cloth',-w/2+1.0,0.3,0.3,0.9,0.28,1.9,0x5a4a3a);
    addCont('skeleton',...b.world(0.4,0.2),yaw-0.5,{tbl:'skeleton',y:0.1,name:'Hunter\u2019s remains'});
  }
  r.cx=x;r.cz=z;
}
RUINS.forEach(ruin);
// guaranteed key & code story items in specific containers
{
  const farm=CONT.filter(c=>Math.hypot(c.x-RUINS[2].x,c.z-RUINS[2].z)<9&&c.kind==='cabinet')[0];
  if(farm)farm.fixed=[{id:'key_garage',n:1},{id:'n3',n:1},{id:'bandage',n:2}];
  const hw=CONT.filter(c=>Math.hypot(c.x-RUINS[0].x,c.z-RUINS[0].z)<9&&c.kind==='cabinet')[0];
  if(hw)hw.fixed=[{id:'lockpick',n:1},{id:'n1',n:1}];
  const cl=CONT.filter(c=>Math.hypot(c.x-RUINS[4].x,c.z-RUINS[4].z)<9&&c.kind==='fridge')[0];
  if(cl)cl.fixed=[{id:'t2',n:1},{id:'medkit',n:1}];
  const gs=CONT.filter(c=>Math.hypot(c.x-RUINS[1].x,c.z-RUINS[1].z)<9&&c.kind==='toolbox')[0];
  if(gs)gs.fixed=[{id:'repair',n:1},{id:'fuel',n:1},{id:'n8',n:1}];
}
// ---- roadside / wasteland containers
{
  let n=0,tries=0;
  while(n<16&&tries++<400){
    const z=rr(-330,330),x=roadX(z)+(R()<.5?-1:1)*rr(8,60)+(R()<0.35?rr(-90,90):0);
    if(Math.abs(x)<HX+8&&Math.abs(z)<HZ+8)continue;if(Math.abs(x)>HALF-40||Math.abs(z)>HALF-40)continue;
    if(RUINS.some(q=>Math.hypot(q.x-x,q.z-z)<13))continue;if(CONT.some(c=>Math.hypot(c.x-x,c.z-z)<10))continue;
    const k=pick(['crate','crate','toolbox','locker','fridge','cabinet']);const yaw=R()*6.28;
    addCont(k,x,z,yaw,{v:Math.floor(R()*3)});n++;
    if(R()<0.6)B_STATIC.box('concrete',x+Math.cos(yaw+1.5)*1.3,terrainH(x,z)+0.18,z+Math.sin(yaw+1.5)*1.3,rr(.5,1.2),0.35,rr(.5,1.0),0x8a8478,0,R()*3,0,0.15,2,0.05);
  }
}
// ---- car trunks on wrecks
{
  let n=0;for(const w of wreckList){if(n>=22)break;if(w.flip||R()<0.5)continue;
    const fx=Math.sin(w.yaw),fz=Math.cos(w.yaw);const tx=w.x-fx*2.2,tz=w.z-fz*2.2;
    addCont('trunk',tx,tz,w.yaw,{noMesh:true,y:terrainH(tx,tz)+0.8,name:'Car trunk',rad:1.9,v:0});n++}
}
// ---- Haven crates (owned stock) near shacks
[[-34,-12,0.5],[-34,19,2],[34,-24,3.5],[16,28,1.2]].forEach(([x,z,y],i)=>addCont(i%2?'crate':'toolbox',x,z,y,{v:i}));
// ---- skeletons / corpses with story logs, scattered near wrecks & ruins
{
  const spots=[];for(const w of wreckList.slice(0,40)){if(spots.length>=11)break;if(R()<0.4)continue;spots.push([w.x+Math.cos(w.yaw)*3.2,w.z-Math.sin(w.yaw)*3.2])}
  for(const q of RUINS.slice(0,4))spots.push([q.x+Math.cos(q.yaw)*(q.w/2+3),q.z-Math.sin(q.yaw)*(q.w/2+3)]);
  spots.forEach(([x,z],i)=>{const sk=i%3!==2;addCont(sk?'skeleton':'corpse',x,z,R()*6.28,{y:terrainH(x,z)+0.02,name:sk?'Old skeleton':'Weathered corpse',tbl:'skeleton'})});
}
// ---- Haven props: workbench use-point, bed, generator, bounty board, radios, water
const WORKBENCH={x:-24.5,z:-12.4};
IA.push({type:'bench',x:WORKBENCH.x,z:WORKBENCH.z,r:2.6,label:'Workbench'});
{ // bed in the shack at (31,2)
  const sh=shackLog.find(s=>Math.abs(s.x-31)<0.1&&Math.abs(s.z-2)<0.1);
  if(sh){const b=sh.b;b.box('wood',-1.6,0.22,-0.9,2.0,0.2,0.95,0x5a4632,0,0,0,0.1,1,0.03);b.box('cloth',-1.6,0.4,-0.9,1.9,0.16,0.85,0x7a5a4a,0,0,0,0.1,1,0);b.box('cloth',-2.3,0.52,-0.9,0.5,0.12,0.6,0xb8aa94,0,0,0,0.1,1,0);
    const [bx,bz]=b.world(-1.0,-0.9);IA.push({type:'bed',x:bx,z:bz,r:2.2,label:'Bed'});bedSpots.push({x:bx,z:bz});}
}
{ // generator beside the mechanic wall
  const gx=-14,gz=-26.2,b=new Bld(B_STATIC,gx,gz,0);
  b.box('plate',0,0.55,0,1.4,0.9,0.8,new THREE.Color(0.55,0.62,0.45),0,0,0,0.1,1.2,0.05);b.box('metal',-0.4,1.1,0,0.5,0.25,0.5,0x2a2a2a);b.cyl('metal',0.45,1.12,0,0.12,0.12,0.5,0x3a3a3a,0,0,0,6);b.box('matte',0.55,0.5,0.42,0.3,0.35,0.05,0x2a2a2a);
  b.box('glow',0.55,0.78,0.43,0.1,0.05,0.02,new THREE.Color(0.4,3,0.8));circles.push([gx,gz,0.9]);
  IA.push({type:'gen',x:gx,z:gz+1.3,r:2.3,label:'Generator'});
}
{ // bounty board
  const bx=9.5,bz=-13.5,b=new Bld(B_STATIC,bx,bz,Math.PI*0.9);
  b.box('wood',0,1.2,0,2.2,1.4,0.09,0x5a4632,0,0,0,0.1,1.2,0);for(const s of[-1,1])b.box('wood',s*1.0,0.7,0,0.1,1.4,0.1,0x3e3026);
  for(let i=0;i<6;i++)b.box('plate',-0.8+(i%3)*0.8,1.45-Math.floor(i/3)*0.55,0.06,0.45,0.35,0.01,new THREE.Color(1.1,1.05,0.9),0,0,(R()-.5)*0.15,0.1,1);
  circles.push([bx,bz,1.0]);IA.push({type:'board',x:bx+Math.sin(Math.PI*0.9)*1.3,z:bz+Math.cos(Math.PI*0.9)*1.3,r:2.6,label:'Bounty board'});
}
// radios / tape players
function addRadio(x,z,y0,tape,label='Radio'){const b=new Bld(B_STATIC,x,z,R()*6);b.box('wood',0,y0+0.35,0,0.7,0.7,0.5,0x5a4632,0,0,0,0.1,1,0.02);
  b.box('plate',0,y0+0.82,0,0.4,0.22,0.22,new THREE.Color(0.5,0.52,0.46),0,0,0,0.1,1,0);b.box('glow',0.1,y0+0.86,0.12,0.06,0.05,0.01,new THREE.Color(3,1.6,0.4));b.cyl('metal',-0.15,y0+1.1,0,0.008,0.008,0.5,0x2a2a2a,0,0,0.3,4);
  circles.push([x,z,0.4]);IA.push({type:'radio',x,z,r:2.2,label,tape,y:y0})}
addRadio(1.0,3.2,0,'t1','Haven radio');
addRadio(TOWER.x+16-1.5,TOWER.z+4+3.3,0,'t3','Tower radio');
{const q=RUINS[4];const [rx,rz]=[q.x+Math.cos(q.yaw)*0.0,q.z];}
// water: clean tap at the water tower, dirty ponds in the wastes
IA.push({type:'water',x:-16.6,z:21.9,r:2.6,label:'Clean water tap',clean:true});
const PONDS=[{x:roadX(40)+75,z:40},{x:-100,z:-40},{x:roadX(-250)-70,z:-250}];
{
  const pg=new THREE.CircleGeometry(1,20);pg.rotateX(-Math.PI/2);
  const pm=new THREE.MeshStandardMaterial({color:0x3b4a40,roughness:0.15,metalness:0.6,transparent:true,opacity:0.88});
  for(const p of PONDS){const s=rr(4,6);const m=new THREE.Mesh(pg,pm);m.position.set(p.x,terrainH(p.x,p.z)+0.05,p.z);m.scale.set(s,1,s*0.7);m.receiveShadow=true;world.add(m);p.r=s;IA.push({type:'water',x:p.x,z:p.z,r:s+2,label:'Stagnant pond',clean:false})}
}
// convoy staging + race start + bounty marks use IA too (added in tail)

// containers inside Haven shacks (footlockers)
shackLog.forEach((s,i)=>{if(i%2===1&&i<11){const [wx,wz]=s.b.world((i%4<2?-1:1)*(s.w/2-0.7),-s.d/2+0.55);addCont(i%3?'crate':'cabinet',wx,wz,s.yaw,{y:terrainH(wx,wz),name:'Resident\u2019s '+(i%3?'footlocker':'cabinet'),v:i})}});

await stage(0.66,'Raising Rust Haven');
B_STATIC.build(world);
HB.build(haven);
{ // wires
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(wireVerts,3));
  haven.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x1a1512})));
}

// ============================================================ particles
const pScale={value:1};
function updScale(){pScale.value=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360))}
class Particles{
  constructor(n,{additive,spawn,step,tex=true}){
    this.n=n;this.spawn=spawn;this.step=step;
    this.pos=new Float32Array(n*3);this.size=new Float32Array(n);this.alpha=new Float32Array(n);this.color=new Float32Array(n*3);
    this.vel=new Float32Array(n*3);this.life=new Float32Array(n);this.age=new Float32Array(n);this.base=new Float32Array(n);this.aux=new Float32Array(n);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3));g.setAttribute('aSize',new THREE.BufferAttribute(this.size,1));
    g.setAttribute('aAlpha',new THREE.BufferAttribute(this.alpha,1));g.setAttribute('aColor',new THREE.BufferAttribute(this.color,3));
    this.geo=g;
    this.mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{uScale:pScale,fogColor:{value:scene.fog.color},fogDensity:{value:scene.fog.density}},fog:false,
      vertexShader:`attribute float aSize;attribute float aAlpha;attribute vec3 aColor;uniform float uScale;varying float vA;varying vec3 vC;varying float vD;
        void main(){vA=aAlpha;vC=aColor;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_PointSize=clamp(aSize*uScale/max(-mv.z,0.1),0.,420.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float vA;varying vec3 vC;varying float vD;uniform vec3 fogColor;uniform float fogDensity;
        void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=smoothstep(.5,.0,d);a*=a*vA;if(a<.003)discard;
          float f=1.-exp(-fogDensity*fogDensity*vD*vD*1.4);vec3 c=mix(vC,fogColor*${additive?'0.0':'1.0'},f);
          gl_FragColor=vec4(c,a);}`});
    this.points=new THREE.Points(g,this.mat);this.points.frustumCulled=false;
    for(let i=0;i<n;i++){this.spawn(this,i);this.age[i]=R()*this.life[i]}
  }
  update(dt){
    for(let i=0;i<this.n;i++){
      this.age[i]+=dt;if(this.age[i]>=this.life[i]){this.spawn(this,i);this.age[i]=0}
      this.step(this,i,this.age[i]/this.life[i],dt);
    }
    const a=this.geo.attributes;a.position.needsUpdate=a.aSize.needsUpdate=a.aAlpha.needsUpdate=a.aColor.needsUpdate=true;
  }
}
const wind={x:0.9,z:0.35};
const FB_N=fireBarrels.length;
const flames=new Particles(FB_N*(MOBILE?4:7),{additive:true,
  spawn(s,i){const fb=fireBarrels[i%FB_N];s.aux[i]=i%FB_N;const a=R()*6.28,r=R()*0.18;s.pos[i*3]=fb.x+Math.cos(a)*r;s.pos[i*3+1]=fb.y;s.pos[i*3+2]=fb.z+Math.sin(a)*r;
    s.vel[i*3]=rr(-.12,.12);s.vel[i*3+1]=rr(1.0,1.8);s.vel[i*3+2]=rr(-.12,.12);s.life[i]=rr(.4,.8);s.base[i]=rr(.55,.95)},
  step(s,i,t,dt){s.pos[i*3]+=s.vel[i*3]*dt+Math.sin(t*9+i)*0.004+wind.x*dt*0.3*t;s.pos[i*3+1]+=s.vel[i*3+1]*dt*(1-t*.5);s.pos[i*3+2]+=s.vel[i*3+2]*dt;
    s.size[i]=s.base[i]*(1-t*0.7)*(t<0.1?t*10:1);s.alpha[i]=(1-t)*0.55;
    s.color[i*3]=1.0;s.color[i*3+1]=lerp(0.62,0.1,t);s.color[i*3+2]=lerp(0.16,0.0,t*1.4)}});
const embers=new Particles(FB_N*(MOBILE?3:6),{additive:true,
  spawn(s,i){const fb=fireBarrels[i%FB_N];const a=R()*6.28,r=R()*0.22;s.pos[i*3]=fb.x+Math.cos(a)*r;s.pos[i*3+1]=fb.y+0.15;s.pos[i*3+2]=fb.z+Math.sin(a)*r;
    s.vel[i*3]=rr(-.4,.5)+wind.x*.5;s.vel[i*3+1]=rr(.8,2.2);s.vel[i*3+2]=rr(-.4,.4)+wind.z*.4;s.life[i]=rr(1.6,4.2);s.base[i]=rr(.035,.075)},
  step(s,i,t,dt){s.vel[i*3]+=((Math.random()-.5)*2.2+wind.x*.6)*dt;s.vel[i*3+2]+=(Math.random()-.5)*2.2*dt;
    s.pos[i*3]+=s.vel[i*3]*dt;s.pos[i*3+1]+=s.vel[i*3+1]*dt;s.pos[i*3+2]+=s.vel[i*3+2]*dt;
    s.size[i]=s.base[i]*(1-t*.5);s.alpha[i]=(1-t)*(0.7+0.3*Math.sin(t*50+i))*1.2;s.color[i*3]=1;s.color[i*3+1]=lerp(.55,.15,t);s.color[i*3+2]=.05}});
// smoke: barrel smoke + a few columns (burning wrecks / chimneys)
const columns=[
  {x:roadX(-95)-60,z:-95,k:2},{x:roadX(130)+80,z:130,k:2},{x:-HX+6,z:-HZ+10,k:1}
];
// chimney smoke from shacks
const chimneySpots=[[-28,-6],[30,5]];
const smokeEmit=[];
fireBarrels.forEach((fb,i)=>smokeEmit.push({x:fb.x,y:fb.y+0.6,z:fb.z,big:0}));
for(const c of columns)smokeEmit.push({x:c.x,y:terrainH(c.x,c.z)+0.8,z:c.z,big:c.k});
const SM_PER=MOBILE?5:8;
const smoke=new Particles(smokeEmit.length*SM_PER,{additive:false,
  spawn(s,i){const e=smokeEmit[Math.floor(i/SM_PER)];s.aux[i]=Math.floor(i/SM_PER);
    s.pos[i*3]=e.x+rr(-.15,.15)*(1+e.big*3);s.pos[i*3+1]=e.y;s.pos[i*3+2]=e.z+rr(-.15,.15)*(1+e.big*3);
    const up=e.big?rr(3.2,5.2):rr(0.7,1.2);s.vel[i*3]=wind.x*(e.big?2.2:0.9)+rr(-.2,.3);s.vel[i*3+1]=up;s.vel[i*3+2]=wind.z*(e.big?2.2:0.9)+rr(-.2,.2);
    s.life[i]=e.big?rr(14,20)*(1+e.big*0.1):rr(3,5);s.base[i]=e.big?rr(3,5):rr(.8,1.4)},
  step(s,i,t,dt){const e=smokeEmit[s.aux[i]];s.pos[i*3]+=s.vel[i*3]*dt;s.pos[i*3+1]+=s.vel[i*3+1]*dt;s.pos[i*3+2]+=s.vel[i*3+2]*dt;
    s.vel[i*3+1]*=(1-0.02*dt);
    s.size[i]=s.base[i]*(0.5+t*(e.big?5.5:2.6));s.alpha[i]=Math.sin(Math.min(t*1.15,1)*3.14159)*(e.big?0.5:0.17);
    const g=e.big?0.2:0.28;s.color[i*3]=g*1.05;s.color[i*3+1]=g*0.92;s.color[i*3+2]=g*0.82}});
// ambient dust motes (lit by low sun)
const DB={x:50,y:14,z:50};
const dust=new Particles(MOBILE?120:260,{additive:false,
  spawn(s,i){s.pos[i*3]=rr(-DB.x,DB.x);s.pos[i*3+1]=rr(0.3,DB.y);s.pos[i*3+2]=rr(-DB.z,DB.z);s.vel[i*3]=wind.x*rr(1.2,3);s.vel[i*3+1]=rr(-.04,.14);s.vel[i*3+2]=wind.z*rr(1,2.5);s.life[i]=1e9;s.base[i]=rr(.06,.2);s.age[i]=0},
  step(s,i,t,dt){
    s.pos[i*3]+=s.vel[i*3]*dt;s.pos[i*3+1]+=s.vel[i*3+1]*dt+Math.sin(performance.now()*0.0007+i)*0.003;s.pos[i*3+2]+=s.vel[i*3+2]*dt;
    const px=focus.x,pz=focus.z;
    if(s.pos[i*3]>px+DB.x)s.pos[i*3]-=2*DB.x;else if(s.pos[i*3]<px-DB.x)s.pos[i*3]+=2*DB.x;
    if(s.pos[i*3+2]>pz+DB.z)s.pos[i*3+2]-=2*DB.z;else if(s.pos[i*3+2]<pz-DB.z)s.pos[i*3+2]+=2*DB.z;
    const gy=terrainH(s.pos[i*3],s.pos[i*3+2]);
    if(s.pos[i*3+1]>gy+DB.y)s.pos[i*3+1]=gy+0.4;if(s.pos[i*3+1]<gy+0.2)s.pos[i*3+1]=gy+DB.y*0.9;
    s.size[i]=s.base[i];s.alpha[i]=0.3;s.color[i*3]=.95;s.color[i*3+1]=.72;s.color[i*3+2]=.48}});
// wheel dust / hit sparks / muzzle (transient bursts)
class Burst{
  constructor(n,additive,tint){this.n=n;this.i=0;this.ps=new Particles(n,{additive,spawn(s,i){s.life[i]=1e-3;s.alpha[i]=0;s.size[i]=0;s.pos[i*3+1]=-999},step(s,i,t,dt){
    if(s.aux[i]<=0){s.alpha[i]=0;s.size[i]=0;return}
    s.vel[i*3+1]-=s.fall[i]*dt;s.pos[i*3]+=s.vel[i*3]*dt;s.pos[i*3+1]+=s.vel[i*3+1]*dt;s.pos[i*3+2]+=s.vel[i*3+2]*dt;
    s.aux[i]-=dt;const k=1-s.aux[i]/s.maxlife[i];s.size[i]=s.base[i]*(1+k*s.grow[i]);s.alpha[i]=(1-k)*s.a0[i];
    s.color[i*3]=lerp(s.c0[i*3],s.c1[i*3],k);s.color[i*3+1]=lerp(s.c0[i*3+1],s.c1[i*3+1],k);s.color[i*3+2]=lerp(s.c0[i*3+2],s.c1[i*3+2],k);
    s.life[i]=1e9;s.age[i]=0}});
    const s=this.ps;s.fall=new Float32Array(n);s.maxlife=new Float32Array(n);s.grow=new Float32Array(n);s.a0=new Float32Array(n);s.c0=new Float32Array(n*3);s.c1=new Float32Array(n*3);
    for(let i=0;i<n;i++){s.life[i]=1e9;s.aux[i]=0}
    this.points=s.points;this.points.renderOrder=6}
  emit(x,y,z,vx,vy,vz,{life=0.5,size=0.2,grow=0,a=1,fall=0,c0=[1,1,1],c1=[1,1,1]}={}){
    const s=this.ps,i=this.i;this.i=(this.i+1)%this.n;
    s.pos[i*3]=x;s.pos[i*3+1]=y;s.pos[i*3+2]=z;s.vel[i*3]=vx;s.vel[i*3+1]=vy;s.vel[i*3+2]=vz;s.aux[i]=life;s.maxlife[i]=life;s.base[i]=size;s.grow[i]=grow;s.a0[i]=a;s.fall[i]=fall;
    s.c0.set(c0,i*3);s.c1.set(c1,i*3);s.size[i]=size;s.alpha[i]=a;s.life[i]=1e9;s.age[i]=0;
  }
  update(dt){this.ps.update(dt)}
}
const sparks=new Burst(60,true),dustB=new Burst(MOBILE?40:90,false);
scene.add(flames.points,embers.points,smoke.points,dust.points,sparks.points,dustB.points);
smoke.points.renderOrder=2;flames.points.renderOrder=3;embers.points.renderOrder=4;dust.points.renderOrder=5;

// ============================================================ glow points (bulbs, fires, beacons) in one draw call
const glowPts={pos:[],size:[],col:[],type:[],ph:[]};
function addGlow(x,y,z,size,c,type=0){glowPts.pos.push(x,y,z);glowPts.size.push(size);glowPts.col.push(c[0],c[1],c[2]);glowPts.type.push(type);glowPts.ph.push(R()*50)}
const glowU={uTime:{value:0},uScale:pScale,fogColor:{value:scene.fog.color},fogDensity:{value:scene.fog.density},uBlink:{value:1}};
let glowMesh=null;
function buildGlow(){
  if(glowMesh){scene.remove(glowMesh);glowMesh.geometry.dispose()}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(glowPts.pos,3));g.setAttribute('aSize',new THREE.Float32BufferAttribute(glowPts.size,1));
  g.setAttribute('aColor',new THREE.Float32BufferAttribute(glowPts.col,3));g.setAttribute('aType',new THREE.Float32BufferAttribute(glowPts.type,1));g.setAttribute('aPh',new THREE.Float32BufferAttribute(glowPts.ph,1));
  glowMesh=new THREE.Points(g,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:glowU,fog:false,
    vertexShader:`attribute float aSize;attribute vec3 aColor;attribute float aType;attribute float aPh;uniform float uTime,uScale,uBlink;varying vec3 vC;varying float vA;varying float vD;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;float f=1.;
        if(aType>1.5){f=uBlink;}else if(aType>0.5){f=0.7+0.3*sin(uTime*17.+aPh)*sin(uTime*9.3+aPh*1.7)+0.1*sin(uTime*31.+aPh);}
        else f=0.93+0.07*sin(uTime*2.+aPh);
        vC=aColor;vA=f;gl_PointSize=clamp(aSize*uScale/max(-mv.z,0.1)*(0.9+0.1*f),0.,${MOBILE?200:360}.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vC;varying float vA;varying float vD;uniform vec3 fogColor;uniform float fogDensity;
      void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*4.5)*0.9+exp(-d*d*28.)*0.9;a*=(1.-smoothstep(0.85,1.,d));
        float f=1.-exp(-fogDensity*fogDensity*vD*vD*0.7);gl_FragColor=vec4(vC*a*vA*(1.-f*0.6),a*vA);}`}));
  glowMesh.frustumCulled=false;glowMesh.renderOrder=7;scene.add(glowMesh);
}
function assembleGlows(){
  for(const b of bulbSpots)addGlow(b.x,b.y,b.z,b.s*0.9,[b.c[0]*0.8,b.c[1]*0.8,b.c[2]*0.8],0);
  for(const f of fireBarrels)addGlow(f.x,f.y+0.4,f.z,3.4,[1.0,0.45,0.14],1);
  for(const g of glowSpots)addGlow(g.x,g.y,g.z,g.size*1.2,[g.r*0.9,g.g*0.9,g.b*0.9],0);
  for(const t of towerBlinks)addGlow(t.pos.x,t.pos.y,t.pos.z,t.s*1.1,[1.0,0.18,0.1],2);
  buildGlow();
}

// ============================================================ light pool
const LN=MOBILE?2:4;
const lightPool=[];for(let i=0;i<LN;i++){const l=new THREE.PointLight(0xff8a3a,0,24,2);l.position.set(0,-50,0);scene.add(l);lightPool.push(l)}
const focus=new THREE.Vector3(0,0,0);
function updateLights(time){
  const cands=fireBarrels.map(f=>({f,d:Math.hypot(f.x-focus.x,f.z-focus.z)})).sort((a,b)=>a.d-b.d);
  const gl=[];
  for(let i=0;i<LN;i++){
    const l=lightPool[i],c=cands[i];
    if(c&&c.d<60){const f=c.f;const fl=0.72+0.28*Math.sin(time*23+f.seed)*Math.sin(time*13.7+f.seed*2)+(Math.random()-.5)*0.14;
      l.position.set(f.x+Math.sin(time*9+f.seed)*0.08,f.y+0.55+fl*0.15,f.z+Math.cos(time*7.3+f.seed)*0.08);
      const target=(MOBILE?50:78)*fl*(1-sm(35,60,c.d));l.intensity+=(target-l.intensity)*0.5;l.distance=22}
    else l.intensity*=0.7;
  }
}

// ============================================================ humanoids (≈1.8 m, jointed rig)
const capG=(r,l,s=6)=>new THREE.CapsuleGeometry(r,l,2,s);
const SK=[0xd6a07a,0xc08a64,0x9a6a48,0x7a5236,0xe0b490];
function partMesh(list,matMap){
  const by=new Map();for(const p of list){const mm=matMap[p.k]||M[p.k];if(!by.has(mm))by.set(mm,[]);by.get(mm).push(p)}
  const g=new THREE.Group();
  for(const [mm,arr] of by){const geo=mergeParts(arr);const me=new THREE.Mesh(geo,mm);me.castShadow=true;me.receiveShadow=false;g.add(me)}
  return g;
}
const hMat={cloth2:M.cloth2,metal:M.cloth2,skin:M.cloth2,matte:M.cloth2};
const hMatW={cloth2:M.cloth2,metal:M.metal,matte:M.matte};
const HUMAN_PALETTES=[
  {shirt:0x5a5a40,pants:0x3e3a34,jacket:0x6a4a2a},{shirt:0x7a4a38,pants:0x2e3036,jacket:0x4a4036},{shirt:0x4a5a62,pants:0x4a4234,jacket:0x5a5648},
  {shirt:0x8a7a58,pants:0x3a3830,jacket:0x4a3a2a},{shirt:0x6a2f2a,pants:0x30302c,jacket:0x2f2f2a},{shirt:0x4a5a3a,pants:0x4a4a40,jacket:0x70604a}
];
function weaponParts(kind){
  const P=[];const A=(k,geo,m,hex,jit=0.05)=>P.push({k,geo,m,hex,jit});
  if(kind==='pistol'){
    A('metal',RB(0.045,0.06,0.2,0.012),mxm(0,0.03,0.12),0x2a2a2c);                       // slide
    A('metal',new THREE.CylinderGeometry(0.014,0.014,0.06,6).rotateX(Math.PI/2),mxm(0,0.03,0.25),0x1a1a1a);
    A('matte',RB(0.04,0.11,0.06,0.01),mxm(0,-0.04,0.04,1,1,1,-0.2,0,0),0x2a1e16);      // grip
    A('metal',RB(0.035,0.015,0.05,0.005),mxm(0,-0.02,0.1),0x202020);
  }else if(kind==='pipe'){
    A('metal',new THREE.CylinderGeometry(0.022,0.026,0.78,8),mxm(0,0.0,0.3,1,1,1,Math.PI/2,0,0),0x5e554c,0.1);
    A('metal',new THREE.CylinderGeometry(0.032,0.032,0.1,8),mxm(0,0.0,0.7,1,1,1,Math.PI/2,0,0),0x4a2e22,0.1);   // rusty head
    A('matte',new THREE.CylinderGeometry(0.03,0.03,0.2,8),mxm(0,0.0,0.0,1,1,1,Math.PI/2,0,0),0x2a2420,0.1);      // tape grip
    for(let i=0;i<3;i++)A('metal',new THREE.CylinderGeometry(0.004,0.012,0.05,4),mxm(0.03,0,0.58+i*0.05,1,1,1,0,0,-Math.PI/2),0x777066,0.1);
  }else if(kind==='shotgun'){
    A('metal',new THREE.CylinderGeometry(0.02,0.02,0.7,8).rotateX(Math.PI/2),mxm(0,0.03,0.4),0x2a2a2a);
    A('metal',new THREE.CylinderGeometry(0.017,0.017,0.5,8).rotateX(Math.PI/2),mxm(0,-0.01,0.32),0x303030);
    A('matte',RB(0.05,0.09,0.4,0.015),mxm(0,0.0,-0.1),0x5a3a22);
    A('matte',RB(0.05,0.08,0.18,0.015),mxm(0,-0.01,0.3),0x5a3a22);
  }
  return P;
}
function createHumanProc(o={}){
  const pal=o.pal||pick(HUMAN_PALETTES);const skin=o.skin??pick(SK);
  const shirt=o.shirt??pal.shirt,pants=o.pants??pal.pants,jacket=o.jacket??pal.jacket;
  const boots=0x2a221c,leather=0x3a2a1e;
  const H={root:new THREE.Group()};const root=H.root;
  const hips=new THREE.Group();hips.position.y=0.93;root.add(hips);H.hips=hips;
  // pelvis
  {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
    A('cloth2',RB(0.36,0.2,0.22,0.06),mxm(0,0.02,0),pants);
    A('matte',RB(0.38,0.06,0.24,0.02),mxm(0,0.12,0),leather);
    A('metal',RB(0.06,0.05,0.02,0.005),mxm(0,0.12,0.125),0x8a8070);
    A('matte',RB(0.1,0.14,0.07,0.02),mxm(0.2,0.0,0.02),leather);    // pouch
    if(o.holster)A('matte',RB(0.05,0.2,0.1,0.02),mxm(-0.21,-0.12,0.02),leather);
    hips.add(partMesh(P,hMat))}
  // spine/chest
  const spine=new THREE.Group();spine.position.y=0.1;hips.add(spine);H.spine=spine;
  {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
    A('cloth2',RB(0.34,0.3,0.21,0.07),mxm(0,0.15,0),shirt);                       // abdomen
    A('cloth2',RB(0.44,0.34,0.25,0.09),mxm(0,0.47,0),o.jacket===null?shirt:jacket);   // chest/jacket
    A('cloth2',RB(0.46,0.07,0.27,0.03),mxm(0,0.3,0),jacket);                       // jacket hem
    A('cloth2',RB(0.25,0.1,0.22,0.04),mxm(0,0.67,0),jacket);                      // collar
    A('matte',RB(0.07,0.5,0.02,0.01),mxm(0.12,0.4,0.13,1,1,1,0,0,0.0),leather);   // chest strap
    A('matte',RB(0.07,0.5,0.02,0.01),mxm(-0.12,0.4,0.13),leather);
    A('metal',RB(0.1,0.12,0.04,0.01),mxm(0.12,0.2,0.14),0x4a4a40);              // ammo pouch (metal shade)
    A('matte',RB(0.16,0.14,0.04,0.015),mxm(-0.14,0.18,0.14),leather);
    // shoulder pads / mantle
    for(const sx of[-1,1])A('matte',RB(0.2,0.06,0.22,0.03),mxm(sx*0.25,0.62,0,1,1,1,0,0,sx*-0.2),leather);
    if(o.pack!==false){ // backpack, bedroll, canteen
      A('cloth2',RB(0.34,0.46,0.18,0.06),mxm(0,0.45,-0.22),o.packCol??0x5a6240);
      A('matte',RB(0.28,0.2,0.1,0.04),mxm(0,0.3,-0.35),leather);
      A('matte',RB(0.36,0.06,0.2,0.02),mxm(0,0.72,-0.22),leather);
      A('cloth2',new THREE.CylinderGeometry(0.075,0.075,0.44,10),mxm(0,0.78,-0.24,1,1,1,0,0,Math.PI/2),o.rollCol??0x8a3a2a);
      A('metal',new THREE.CylinderGeometry(0.06,0.06,0.2,8),mxm(0.2,0.35,-0.3),0x6a6a60);
    }
    if(o.scarf)A('cloth2',RB(0.28,0.1,0.26,0.04),mxm(0,0.74,0.0),o.scarf);
    spine.add(partMesh(P,hMat))}
  // head
  const head=new THREE.Group();head.position.set(0,0.82,0);spine.add(head);H.head=head;
  {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.03});
    A('skin',new THREE.SphereGeometry(0.115,12,10),mxm(0,0.1,0,1,1.12,1.02),skin);
    A('skin',RB(0.13,0.1,0.12,0.04),mxm(0,0.03,0.03),skin);                      // jaw
    A('skin',RB(0.03,0.05,0.04,0.012),mxm(0,0.09,0.112),skin);                 // nose
    A('skin',RB(0.045,0.03,0.025,0.01),mxm(-0.118,0.1,0.0),skin);A('skin',RB(0.045,0.03,0.025,0.01),mxm(0.118,0.1,0.0),skin);
    A('matte',new THREE.SphereGeometry(0.014,5,4),mxm(-0.04,0.115,0.1),0x120e0c,0);A('matte',new THREE.SphereGeometry(0.014,5,4),mxm(0.04,0.115,0.1),0x120e0c,0);
    A('matte',RB(0.05,0.012,0.012,0.004),mxm(-0.04,0.138,0.105),0x2a1e14,0);A('matte',RB(0.05,0.012,0.012,0.004),mxm(0.04,0.138,0.105),0x2a1e14,0);
    // stubble/beard
    if(o.beard)A('matte',RB(0.11,0.07,0.07,0.03),mxm(0,0.02,0.07),o.hair??0x2a1e14);
    const hat=o.hat??'cap';
    if(hat==='cap'){A('cloth2',new THREE.SphereGeometry(0.125,10,6,0,Math.PI*2,0,Math.PI*0.5),mxm(0,0.14,-0.005),o.hatCol??0x6a2f2a);A('cloth2',RB(0.13,0.015,0.09,0.006),mxm(0,0.14,0.125),o.hatCol??0x6a2f2a)}
    else if(hat==='beanie'){A('cloth2',new THREE.SphereGeometry(0.125,10,7,0,Math.PI*2,0,Math.PI*0.55),mxm(0,0.145,-0.005,1,1.05,1),o.hatCol??0x3a3a3a)}
    else if(hat==='wide'){A('cloth2',new THREE.CylinderGeometry(0.2,0.2,0.012,14),mxm(0,0.165,0),o.hatCol??0x5a4a34);A('cloth2',new THREE.CylinderGeometry(0.11,0.125,0.1,12),mxm(0,0.22,0),o.hatCol??0x5a4a34)}
    else if(hat==='hood'){A('cloth2',new THREE.SphereGeometry(0.14,10,8,0,Math.PI*2,0,Math.PI*0.68),mxm(0,0.12,-0.02,1,1.05,1.05),o.hatCol??0x3a3a30)}
    else if(hat==='helmet'){A('metal',new THREE.SphereGeometry(0.13,10,7,0,Math.PI*2,0,Math.PI*0.52),mxm(0,0.14,-0.005),0x4a4e40);A('metal',RB(0.26,0.03,0.04,0.01),mxm(0,0.1,0.11),0x3a3a30)}
    else if(hat==='hair'){A('matte',new THREE.SphereGeometry(0.122,10,6,0,Math.PI*2,0,Math.PI*0.55),mxm(0,0.135,-0.012),o.hair??0x3a2a1c);A('matte',RB(0.22,0.14,0.07,0.04),mxm(0,0.07,-0.1),o.hair??0x3a2a1c)}
    if(o.goggles){A('matte',RB(0.26,0.04,0.12,0.015),mxm(0,0.132,0.06),0x1a1612);A('glass',new THREE.CylinderGeometry(0.035,0.035,0.02,10).rotateX(Math.PI/2),mxm(-0.05,0.132,0.118),0x6aa0b0,0);A('glass',new THREE.CylinderGeometry(0.035,0.035,0.02,10).rotateX(Math.PI/2),mxm(0.05,0.132,0.118),0x6aa0b0,0)}
    if(o.mask){A('cloth2',RB(0.2,0.1,0.07,0.03),mxm(0,0.05,0.095),o.mask)}
    // neck
    A('skin',new THREE.CylinderGeometry(0.045,0.05,0.08,8),mxm(0,-0.02,0),skin);
    head.add(partMesh(P,{...hMat,glass:M.glass}))}
  // arms
  function arm(sx){
    const sh=new THREE.Group();sh.position.set(sx*0.265,0.6,0);spine.add(sh);
    const up=new THREE.Group();sh.add(up);
    {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
      A('cloth2',capG(0.065,0.2),mxm(0,-0.15,0),jacket);A('cloth2',new THREE.SphereGeometry(0.075,8,6),mxm(0,0.0,0),jacket);
      up.add(partMesh(P,hMat))}
    const el=new THREE.Group();el.position.y=-0.31;up.add(el);
    {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
      A('cloth2',capG(0.055,0.18),mxm(0,-0.13,0),o.sleeveSkin?skin:shirt);
      A('matte',new THREE.CylinderGeometry(0.058,0.05,0.08,8),mxm(0,-0.2,0),leather);               // wrap/glove cuff
      A('skin',RB(0.08,0.1,0.045,0.02),mxm(0,-0.3,0),skin);                                   // hand
      A('skin',RB(0.025,0.05,0.03,0.01),mxm(sx*-0.035,-0.27,0.025),skin);                      // thumb
      el.add(partMesh(P,hMat))}
    const hand=new THREE.Group();hand.position.y=-0.3;el.add(hand);
    return {sh,up,el,hand};
  }
  H.armL=arm(-1);H.armR=arm(1);
  function leg(sx){
    const hp=new THREE.Group();hp.position.set(sx*0.1,-0.02,0);hips.add(hp);
    const th=new THREE.Group();hp.add(th);
    {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
      A('cloth2',capG(0.085,0.26),mxm(0,-0.22,0),pants);A('cloth2',RB(0.16,0.1,0.16,0.04),mxm(0,-0.28,0.0),pants);
      if(sx>0&&o.knee!==false)A('matte',RB(0.1,0.1,0.06,0.03),mxm(0,-0.4,0.07),leather);
      th.add(partMesh(P,hMat))}
    const kn=new THREE.Group();kn.position.y=-0.46;th.add(kn);
    {const P=[];const A=(k,g,m,hex,j)=>P.push({k,geo:g,m,hex,jit:j??0.05});
      A('cloth2',capG(0.07,0.22),mxm(0,-0.2,0),pants);
      A('matte',new THREE.CylinderGeometry(0.082,0.095,0.28,8),mxm(0,-0.31,0),boots);        // boot shaft
      A('matte',RB(0.11,0.08,0.26,0.035),mxm(0,-0.44,0.06),boots);                              // boot foot
      A('matte',RB(0.115,0.025,0.275,0.01),mxm(0,-0.47,0.06),0x1a1612);                        // sole
      kn.add(partMesh(P,hMat))}
    return {hp,th,kn};
  }
  H.legL=leg(-1);H.legR=leg(1);
  // weapon in right hand
  H.weapons={};
  for(const w of['pistol','pipe','shotgun']){
    const g=partMesh(weaponParts(w),hMatW);g.visible=false;g.rotation.set(w==='pipe'?Math.PI/2-0.55:Math.PI/2,0,0);H.armR.hand.add(g);H.weapons[w]=g;
  }
  if(o.weapon){H.weapons[o.weapon].visible=true}
  H.weapon=o.weapon||null;
  H.muzzle=new THREE.Object3D();H.muzzle.position.set(0,0.0,0.3);H.armR.hand.add(H.muzzle);
  // anim state
  H.phase=Math.random()*6;H.speed=0;H.aim=0;H.swing=0;H.dead=0;H.talk=0;H.seed=Math.random()*100;H.look=0;H.crouch=0;H.seated=0;
  root.traverse(m=>{if(m.isMesh){m.castShadow=true}});
  return H;
}
function setWeapon(H,w){if(H.glb)return setWeaponG(H,w);H.weapon=w;for(const k in H.weapons)H.weapons[k].visible=(k===w)}
// poses: rotations in radians
function animateHumanProc(H,dt,time,opts={}){
  const sp=H.speed,amt=clamp(sp/4.2,0,1.5);
  H.phase+=sp*dt*(sp>5.5?1.55:2.0);
  const ph=H.phase,sw=Math.sin(ph)*0.85*amt,sw2=Math.sin(ph+Math.PI)*0.85*amt;
  const idle=Math.sin(time*1.6+H.seed)*0.012,breathe=Math.sin(time*1.1+H.seed*2);
  const crouch=H.crouch;
  const L=H.legL,Rg=H.legR;
  // legs
  L.hp.rotation.x=sw+(sp<0.1?0:0)-0.0;Rg.hp.rotation.x=sw2;
  L.kn.rotation.x=Math.max(0,-Math.sin(ph+0.9)*1.1)*amt+0.03;Rg.kn.rotation.x=Math.max(0,-Math.sin(ph+Math.PI+0.9)*1.1)*amt+0.03;
  if(H.stanceWide){L.hp.rotation.z=-0.1;Rg.hp.rotation.z=0.1}
  H.hips.position.y=0.93-crouch*0.1+Math.abs(Math.cos(ph))*0.035*amt+breathe*0.003;
  H.hips.rotation.y=Math.sin(ph)*0.07*amt;
  H.spine.rotation.x=0.04+0.05*Math.min(amt,1)*(sp>5.5?1.6:1)+idle;
  H.spine.rotation.y=-Math.sin(ph)*0.1*amt;
  H.spine.rotation.z=Math.sin(ph)*0.02*amt;
  H.head.rotation.x=-0.03-H.spine.rotation.x*0.5;
  H.head.rotation.y=(opts.lookYaw||0)+Math.sin(time*0.45+H.seed)*0.12*(1-Math.min(amt,1));
  // arms
  const AL=H.armL,AR=H.armR;
  let alx=-sw*0.9,arx=sw*0.9,alz=0.07,arz=-0.07,ale=-0.12-Math.abs(sw)*0.3,are=-0.12-Math.abs(sw)*0.3,arY=0,alY=0;
  if(H.talk>0){const t=Math.sin(time*3+H.seed)*0.5+0.5;arx=-0.9-t*0.4;are=-1.2;alx=-0.4;ale=-1.0;arz=-0.3;alz=0.3}
  if(H.armsCrossed){alx=-0.9;arx=-0.9;ale=-2.0;are=-2.0;alz=-0.5;arz=0.5;alY=0.5;arY=-0.5}
  if(H.leanHands){alx=-0.5;arx=-0.5;ale=-1.2;are=-1.2}
  const armed=H.weapon==='pistol'||H.weapon==='shotgun';
  if(H.aim>0.01){
    const a=H.aim;
    const sh=H.weapon==='shotgun';
    arx=lerp(arx,-1.45,a);are=lerp(are,sh?-0.2:-0.1,a);arz=lerp(arz,-0.12,a);arY=lerp(arY,-0.12,a);
    alx=lerp(alx,-1.25,a);ale=lerp(ale,sh?-0.45:-0.55,a);alz=lerp(alz,sh?0.28:0.38,a);alY=lerp(alY,sh?-0.25:-0.45,a);
    H.spine.rotation.y=lerp(H.spine.rotation.y,0.0,a);
  }else if(armed&&opts.idleHold!==false&&H.weapon){arx=-0.55;are=-0.9;}
  if(H.swing>0){ // melee: windup -> strike -> recover (swing counts 1 -> 0)
    const t=1-H.swing;let k;
    if(t<0.28){k=t/0.28;arx=lerp(arx,-2.4,k);are=lerp(are,-0.4,k);arz=lerp(arz,-0.5,k);H.spine.rotation.y=lerp(H.spine.rotation.y,-0.6,k)}
    else if(t<0.55){k=(t-0.28)/0.27;arx=lerp(-2.4,-0.9,k*k);are=lerp(-0.4,-0.15,k);arz=lerp(-0.5,0.2,k);H.spine.rotation.y=lerp(-0.6,0.8,k*k);H.spine.rotation.x+=0.2*k;AR.hand.rotation.x=lerp(0,0.8,k)}
    else{k=(t-0.55)/0.45;arx=lerp(-0.9,-0.4,k);are=lerp(-0.15,-0.9,k);arz=lerp(0.2,-0.07,k);H.spine.rotation.y=lerp(0.8,0,k);AR.hand.rotation.x=lerp(0.8,0,k)}
    alx=lerp(alx,-0.6,0.5);
  }else AR.hand.rotation.x=0;
  AL.sh.rotation.set(alx,alY,alz);AL.el.rotation.x=ale;AR.sh.rotation.set(arx,arY,arz);AR.el.rotation.x=are;
  if(H.weapon==='pistol'||H.weapon==='shotgun'){H.weapons[H.weapon].rotation.x=H.aim>0.05?0.0:0.0}
  if(H.seated){L.hp.rotation.x=-1.4;Rg.hp.rotation.x=-1.4;L.kn.rotation.x=1.5;Rg.kn.rotation.x=1.5;H.hips.position.y=0.55}
  if(H.dead>0){const d=Math.min(H.dead,1);H.root.rotation.x=-d*1.5;H.root.position.y=Math.max(0,0.0)*0;H.hips.position.y=0.93-0.55*d;L.hp.rotation.x=0.3*d;Rg.hp.rotation.x=-0.5*d;AL.sh.rotation.set(-1.0*d,0,0.8*d);AR.sh.rotation.set(-0.5*d,0,-1.0*d)}
}

// ============================================================ GLB humanoids: Quaternius Superhero (CC0) + Universal Animation Library (CC0)
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
let GLB=null;
async function loadGLB(){
  const mgr=new THREE.LoadingManager();
  mgr.setURLModifier(u=>MOBILE?u.replace('/tex1k/','/tex512/'):u);
  mgr.onProgress=(u,i,n)=>setProg(0.74+0.1*(i/Math.max(n,1)),'Loading survivors '+i+'/'+n);
  mgr.onError=u=>(window.__dbgLog||console.log)('error','Failed to load '+u);
  const L=new GLTFLoader(mgr);
  const [gm,gf,ga]=await Promise.all([L.loadAsync('./models/char/Superhero_Male_FullBody.gltf'),L.loadAsync('./models/char/Superhero_Female_FullBody.gltf'),L.loadAsync('./models/anims.glb')]);
  return setupGLB(gm,gf,ga);
}
const FULLRIG=Q.get('fullrig')==='1';
const BODY={mode:Q.get('safebody')==='1'?'full':(Q.get('bodymode')||'off'),report:{},humans:[]};   // off | torso | full
const _rgCache=new WeakMap();
function redGeo(mod,geo){let g=_rgCache.get(geo);if(g)return g;g=new THREE.BufferGeometry();for(const n in geo.attributes)g.setAttribute(n,geo.attributes[n]);g.setAttribute('skinIndex',mapGeoSkin(mod,geo));if(geo.index)g.setIndex(geo.index);g.boundingSphere=geo.boundingSphere;g.boundingBox=geo.boundingBox;_rgCache.set(geo,g);return g}
const _rsCache=new WeakMap();
function mapGeoSkin(mod,geo){   // returns reduced-rig skinIndex attribute for a geometry (cached)
  let a=_rsCache.get(geo);if(a)return a;
  const SI=geo.attributes.skinIndex,n=SI.count,arr=new Uint16Array(n*4);
  for(let i=0;i<n*4;i++)arr[i]=mod.rmap[SI.array[i]];
  a=new THREE.BufferAttribute(arr,4);_rsCache.set(geo,a);return a}
const REGION=n=>/^(root|pelvis)$/.test(n)?'pelvis':/^spine_/.test(n)?'spine':n==='neck_01'?'neck':n==='Head'?'head':/^clavicle/.test(n)?'clav':/^upperarm/.test(n)?'uarm':/^lowerarm/.test(n)?'larm':/^(hand|index|middle|ring|pinky|thumb)/.test(n)?'hand':/^thigh/.test(n)?'thigh':/^calf/.test(n)?'calf':/^(foot|ball)/.test(n)?'foot':'other';
function setupGLB(gm,gf,ga){
  const G={models:{},clips:{}};
  for(const [key,gl] of [['m',gm],['f',gf]]){
    const scene=gl.scene;scene.updateMatrixWorld(true);
    let body=null,eyes=null,brows=null;
    scene.traverse(n=>{if(n.isSkinnedMesh){if(/superhero/i.test(n.name))body=n;else if(/eyes/i.test(n.name))eyes=n;else if(/brow/i.test(n.name))brows=n}});
    const bones=body.skeleton.bones,idx={};bones.forEach((b,i)=>idx[b.name]=i);
    const geo=body.geometry,P=geo.attributes.position,SI=geo.attributes.skinIndex,SW=geo.attributes.skinWeight,N=P.count;
    const dom=new Uint16Array(N),reg=new Array(N);
    for(let i=0;i<N;i++){let bi=0,bw=-1;for(let k=0;k<4;k++){const w=SW.getComponent(i,k);if(w>bw){bw=w;bi=SI.getComponent(i,k)}}dom[i]=bi;reg[i]=REGION(bones[bi].name)}
    // head bbox from head-dominant verts
    let hb={x0:9,x1:-9,y0:9,y1:-9,z0:9,z1:-9};
    for(let i=0;i<N;i++)if(reg[i]==='head'&&P.getY(i)>1.5){hb.x0=Math.min(hb.x0,P.getX(i));hb.x1=Math.max(hb.x1,P.getX(i));hb.y0=Math.min(hb.y0,P.getY(i));hb.y1=Math.max(hb.y1,P.getY(i));hb.z0=Math.min(hb.z0,P.getZ(i));hb.z1=Math.max(hb.z1,P.getZ(i))}
    const head={cx:0,cy:(hb.y0+hb.y1)/2,cz:(hb.z0+hb.z1)/2,hx:(hb.x1-hb.x0)/2,hy:(hb.y1-hb.y0)/2,hz:(hb.z1-hb.z0)/2,top:hb.y1,front:hb.z1,back:hb.z0};
    const ringAt=(y,tol=0.03)=>{let x0=9,x1=-9,z0=9,z1=-9,c=0;for(let i=0;i<N;i++){if(Math.abs(P.getY(i)-y)>tol)continue;if(!(reg[i]==='spine'||reg[i]==='pelvis'||reg[i]==='thigh'))continue;if(Math.abs(P.getX(i))>0.33)continue;x0=Math.min(x0,P.getX(i));x1=Math.max(x1,P.getX(i));z0=Math.min(z0,P.getZ(i));z1=Math.max(z1,P.getZ(i));c++}
      return c?{cx:(x0+x1)/2,cz:(z0+z1)/2,rx:(x1-x0)/2,rz:(z1-z0)/2}:{cx:0,cz:0,rx:0.17,rz:0.11}};
    // reduced rig: fingers/toes/leaf bones are folded into their parent so the GPU skin palette is 23 bones (92 texels) instead of 65 (260 texels)
    const KEEP=/^(root|pelvis|spine_0\d|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|thigh_[lr]|calf_[lr]|foot_[lr]|ball_[lr])$/;
    const rKeep=[],rmap=new Array(bones.length);
    bones.forEach((b,i)=>{if(FULLRIG||KEEP.test(b.name)){rmap[i]=rKeep.length;rKeep.push(i)}});
    bones.forEach((b,i)=>{if(rmap[i]!==undefined)return;let p=b.parent;while(p&&p.isBone){const pi=idx[p.name];if(pi!==undefined&&rmap[pi]!==undefined){rmap[i]=rmap[pi];return}p=p.parent}rmap[i]=0});
    G.models[key]={gl,scene,body,eyes,brows,idx,reg,dom,head,ringAt,bones,rKeep,rmap};
    mapGeoSkin(G.models[key],geo);if(eyes)mapGeoSkin(G.models[key],eyes.geometry);if(brows)mapGeoSkin(G.models[key],brows.geometry);
  }
  // animation clips -> full / upper / lower variants (no root motion, no scale tracks)
  const UPR=/^(spine_0|neck|Head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/,LOWR=/^(pelvis|thigh|calf|foot|ball)/;
  for(const c of ga.animations){
    const tr=c.tracks.filter(t=>!t.name.startsWith('root.')&&!t.name.endsWith('.scale'));
    const nm=c.name;
    G.clips[nm+'_a']=new THREE.AnimationClip(nm,c.duration,tr);
    G.clips[nm+'_u']=new THREE.AnimationClip(nm+'_u',c.duration,tr.filter(t=>UPR.test(t.name)));
    G.clips[nm+'_l']=new THREE.AnimationClip(nm+'_l',c.duration,tr.filter(t=>LOWR.test(t.name)));
  }
  // skin tone materials
  G.skin={};
  const tones=[[1,0.97,0.94],[0.9,0.8,0.7],[0.78,0.64,0.52],[0.62,0.48,0.38],[0.5,0.38,0.31]];
  for(const key of['m','f']){G.skin[key]=tones.map(t=>{const m=G.models[key].body.material.clone();m.metalnessMap=null;m.metalness=0;m.color.setRGB(t[0]*0.92,t[1]*0.9,t[2]*0.88);m.envMapIntensity=0.3;m.roughness=1;m.vertexColors=false;patchBodyMat(m);return m})}
  for(const key of['m','f']){const mm=G.models[key];if(mm.brows)mm.brows.material.metalness=0;if(mm.eyes)mm.eyes.material.metalness=0}
  return G;
}
// ---------- outfit geometry builder (skinned, merged; body-derived cloth + rigid gear)
class Outfit{
  constructor(){this.p=[];this.n=[];this.uv=[];this.c=[];this.si=[];this.sw=[]}
  vert(px,py,pz,nx,ny,nz,col,si,sw,gain=1){
    this.p.push(px,py,pz);this.n.push(nx,ny,nz);this.uv.push(px*1.6+pz*0.9,py*1.6);
    this.c.push(col.r*gain,col.g*gain,col.b*gain);this.si.push(si[0],si[1],si[2],si[3]);this.sw.push(sw[0],sw[1],sw[2],sw[3]);
  }
  rigid(geo,m,boneIdx,hex,jit=0.08){
    const g=geo.index?geo.toNonIndexed():geo;const P=g.attributes.position,N=g.attributes.normal;const nm=new THREE.Matrix3().getNormalMatrix(m);
    const col=new THREE.Color(hex),j=1+(R()-.5)*2*jit;const v=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(m);n.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();
      const dirt=0.8+0.2*sm(0.0,1.4,v.y);this.vert(v.x,v.y,v.z,n.x,n.y,n.z,col,[boneIdx,0,0,0],[1,0,0,0],j*dirt)}
  }
  cloth(mod,sel,infl,hex,{noise=0.18,hemDark=0}={}){
    const geo=mod.body.geometry,P=geo.attributes.position,Nn=geo.attributes.normal,SI=geo.attributes.skinIndex,SW=geo.attributes.skinWeight,I=geo.index;
    const col=new THREE.Color(hex),c2=new THREE.Color();
    const ok=new Uint8Array(P.count);for(let i=0;i<P.count;i++)ok[i]=sel(mod.reg[i],P.getX(i),P.getY(i),P.getZ(i))?1:0;
    for(let t=0;t<I.count;t+=3){const a=I.getX(t),b=I.getX(t+1),c=I.getX(t+2);if(!(ok[a]&&ok[b]&&ok[c]))continue;
      for(const i of[a,b,c]){const x=P.getX(i),y=P.getY(i),z=P.getZ(i),nx=Nn.getX(i),ny=Nn.getY(i),nz=Nn.getZ(i);
        const nz2=0.86+noise*(vnoise(x*13+z*9,y*13)-0.5)*2+0.1*(vnoise(x*3.1,y*3.1+z*2)-0.5)*2;
        const dirt=0.78+0.22*sm(0.0,1.3,y);
        this.vert(x+nx*infl,y+ny*infl,z+nz*infl,nx,ny,nz,col,[SI.getX(i),SI.getY(i),SI.getZ(i),SI.getW(i)],[SW.getX(i),SW.getY(i),SW.getZ(i),SW.getW(i)],nz2*dirt)}}
  }
  build(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.rm?this.si.map(v=>this.rm[v]):this.si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(this.sw,4));
    g.computeBoundingSphere();return g;
  }
}
const _tm=new THREE.Matrix4(),_tq=new THREE.Quaternion(),_te=new THREE.Euler(),_ts=new THREE.Vector3(),_tp=new THREE.Vector3();
const TM=(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{_te.set(rx,ry,rz,'YXZ');_tq.setFromEuler(_te);return new THREE.Matrix4().compose(_tp.set(x,y,z),_tq,_ts.set(sx,sy,sz))};
const SPH=(pa,pl,ta,tl)=>new THREE.SphereGeometry(1,18,12,pa,pl,ta,tl);
function buildOutfit(mod,s){
  const O=new Outfit(),bi=n=>mod.idx[n],H=mod.head,female=s.female;O.rm=mod.rmap;
  const longSleeve=s.longSleeve;
  // base clothes derived from the body mesh
  // trousers / boots / shirt colours are baked into the skinned body (bodyColorGeo); only jacket & gear are separate geometry
  if(s.jacket!=null){
    if(s.vest)O.cloth(mod,(r,x,y)=>(r==='spine'||r==='clav')&&y>1.1,0.030,s.jacket,{noise:0.16});
    else O.cloth(mod,(r,x,y)=>(r==='spine'||r==='clav'||r==='uarm'||r==='larm')&&y>1.1,0.030,s.jacket,{noise:0.16});
  }
  const waist=mod.ringAt(1.0),chest=mod.ringAt(1.32),neckY=(mod.bones[bi('neck_01')].position?1.53:1.53);
  // belt + buckle + pouches
  O.rigid(new THREE.TorusGeometry(1,0.02,6,22).rotateX(Math.PI/2),TM(waist.cx,1.0,waist.cz,waist.rx+0.04,1,waist.rz+0.04),bi('pelvis'),0x2a1e16,0.1);
  O.rigid(RB(0.05,0.045,0.02,0.008),TM(0,1.0,waist.cz+waist.rz+0.062),bi('pelvis'),0x9a8a6a);
  O.rigid(RB(0.09,0.12,0.06,0.02),TM(waist.cx+waist.rx*0.78,0.93,waist.cz+waist.rz*0.5,1,1,1,0,0.5,0),bi('pelvis'),0x3a2a1e);
  if(s.holster){O.rigid(RB(0.05,0.2,0.11,0.02),TM(-waist.rx-0.07,0.84,0.01),bi('thigh_r'),0x2e2018);O.rigid(RB(0.04,0.05,0.09,0.012),TM(-waist.rx-0.07,0.95,0.015),bi('thigh_r'),0x232323)}
  // collar / scarf
  if(s.jacket!=null&&!s.vest)O.rigid(new THREE.TorusGeometry(0.075,0.026,7,16).rotateX(Math.PI/2),TM(0,neckY-0.01,-0.03,1,0.9,1.0),bi('neck_01'),s.jacket);
  if(s.scarf){O.rigid(new THREE.TorusGeometry(0.083,0.036,8,18).rotateX(Math.PI/2),TM(0,neckY+0.015,-0.03,1.05,1,1.1),bi('neck_01'),s.scarf);
    O.rigid(new THREE.CapsuleGeometry(0.03,0.2,3,6),TM(0.07,neckY-0.14,0.1,1,1,0.6,0.15,0,0.12),bi('spine_03'),s.scarf);}
  // shoulder pads / armour for raiders
  if(s.pads)for(const sd of[1,-1]){const sn=sd>0?'l':'r';O.rigid(SPH(0,Math.PI*2,0,Math.PI*0.5),TM(sd*0.22,1.5,-0.04,0.12,0.075,0.13,0,0,sd*-0.28),bi('clavicle_'+sn),s.pads,0.1)}
  // pack, bedroll, canteen, straps
  if(s.pack){const pz=chest.cz-chest.rz-0.1;
    O.rigid(RB(0.34,0.42,0.19,0.05),TM(0,1.26,pz),bi('spine_03'),s.packCol??0x5a6240,0.08);
    O.rigid(RB(0.27,0.17,0.1,0.035),TM(0,1.17,pz-0.12),bi('spine_03'),0x3e2e22);
    O.rigid(RB(0.36,0.05,0.2,0.02),TM(0,1.49,pz),bi('spine_03'),0x2e2018);
    O.rigid(new THREE.CylinderGeometry(0.075,0.075,0.42,10).rotateZ(Math.PI/2),TM(0,1.56,pz),bi('spine_03'),s.rollCol??0x8a3a2a,0.1);
    O.rigid(new THREE.CylinderGeometry(0.05,0.05,0.17,8),TM(0.2,1.12,pz+0.0),bi('spine_03'),0x6a6a60);
    for(const sd of[-1,1]){O.rigid(RB(0.05,0.34,0.025,0.01),TM(sd*0.115,1.36,chest.cz+chest.rz+0.018,1,1,1,0,0,sd*-0.14),bi('spine_03'),0x2e2018);
      O.rigid(RB(0.05,0.06,0.17,0.01),TM(sd*0.13,1.51,chest.cz,1,1,1,0,0,0),bi('spine_03'),0x2e2018)}}
  // head gear
  const hat=s.hat,hc=s.hatCol??0x4a4a3a,hairC=s.hair??0x2a1e14,hid=bi('Head');
  const hx=H.hx,hy=H.hy,hz=H.hz,cy=H.cy,cz=H.cz;
  const cap=(sx,sy,sz,col,tilt=-0.3,th=0.52,oy=0.08,oz=-0.08)=>O.rigid(SPH(0,Math.PI*2,0,Math.PI*th),TM(0,cy+hy*oy,cz+hz*oz,hx*sx,hy*sy,hz*sz,tilt,0,0),hid,col,0.08);
  const showHair=!hat||hat==='hair'||hat==='cap'||hat==='beanie';
  if(hat==='hair'||(!hat)){cap(1.075,1.04,1.1,hairC,-0.34,0.56);
    if(female||s.longHair){O.rigid(new THREE.CapsuleGeometry(1,1,4,8),TM(0,cy-hy*0.72,cz-hz*0.72,hx*0.78,hy*0.75,hz*0.38),hid,hairC,0.08);
      for(const sd of[-1,1])O.rigid(new THREE.CapsuleGeometry(1,0.6,3,6),TM(sd*hx*0.93,cy-hy*0.3,cz-hz*0.28,hx*0.16,hy*0.5,hz*0.32),hid,hairC,0.08)}}
  else if(hat==='cap'){cap(1.1,0.96,1.12,hc,-0.2,0.5,0.14,-0.06);
    O.rigid(new THREE.CylinderGeometry(1,1,0.012,16,1,false,-Math.PI/2,Math.PI),TM(0,cy+hy*0.2,cz+hz*0.05,hx*1.12,1,hz*1.55,0.12,0,0),hid,hc);
    O.rigid(SPH(0,Math.PI*2,0,Math.PI*0.5),TM(0,cy+hy*0.1,cz-hz*0.15,hx*1.06,hy*0.85,hz*1.04,-0.45,0,0),hid,hairC)}
  else if(hat==='beanie'){O.rigid(SPH(0,Math.PI*2,0,Math.PI*0.62),TM(0,cy+hy*0.13,cz-hz*0.05,hx*1.1,hy*1.18,hz*1.1,-0.18,0,0),hid,hc);
    O.rigid(new THREE.TorusGeometry(1,0.1,6,18).rotateX(Math.PI/2),TM(0,cy+hy*0.34,cz-hz*0.04,hx*1.08,1,hz*1.1,-0.18,0,0).multiply(TM(0,0,0,1,0.55,1)),hid,hc)}
  else if(hat==='wide'){O.rigid(new THREE.CylinderGeometry(1,1,0.014,22),TM(0,cy+hy*0.42,cz,hx*2.2,1,hz*2.0),hid,hc);
    O.rigid(new THREE.CylinderGeometry(0.78,1,0.12,16),TM(0,cy+hy*0.42+0.07,cz,hx*1.05,1,hz*1.05),hid,hc);
    O.rigid(new THREE.CylinderGeometry(1.02,1.02,0.03,16),TM(0,cy+hy*0.42+0.03,cz,hx*1.06,1,hz*1.06),hid,0x2a1e14)}
  else if(hat==='hood'){O.rigid(SPH(Math.PI*0.82,Math.PI*1.36,0,Math.PI*0.78),TM(0,cy+hy*0.05,cz-hz*0.08,hx*1.3,hy*1.22,hz*1.3,-0.1,0,0),hid,hc);
    O.rigid(SPH(Math.PI*0.82,Math.PI*1.36,Math.PI*0.5,Math.PI*0.5),TM(0,cy-hy*0.55,cz-hz*0.3,hx*1.2,hy*0.8,hz*1.3),bi('neck_01'),hc)}
  else if(hat==='helmet'){O.rigid(SPH(0,Math.PI*2,0,Math.PI*0.56),TM(0,cy+hy*0.06,cz-hz*0.06,hx*1.13,hy*1.1,hz*1.15,-0.12,0,0),hid,0x4a4e3e);
    O.rigid(new THREE.CylinderGeometry(1,1,0.02,16,1,false,-Math.PI/2,Math.PI),TM(0,cy+hy*0.3,cz+hz*0.0,hx*1.12,1,hz*1.35),hid,0x3a3d30)}
  if(s.beard)O.rigid(SPH(0,Math.PI,Math.PI*0.52,Math.PI*0.4),TM(0,cy-hy*0.25,cz+hz*0.03,hx*0.99,hy*0.62,hz*1.0),hid,hairC,0.1);
  if(s.mask)O.rigid(SPH(0,Math.PI,Math.PI*0.47,Math.PI*0.34),TM(0,cy-hy*0.2,cz+hz*0.04,hx*1.04,hy*0.58,hz*1.05),hid,s.mask);
  if(s.goggles){const gy=cy+hy*(hat?0.5:0.45);
    O.rigid(new THREE.TorusGeometry(1,0.012,5,20).rotateX(Math.PI/2),TM(0,gy,cz,hx*1.06,1,hz*1.08),hid,0x1a1612);
    for(const sd of[-1,1]){O.rigid(new THREE.CylinderGeometry(0.035,0.035,0.022,12).rotateX(Math.PI/2),TM(sd*hx*0.42,gy,cz+hz*1.0),hid,0x6aa0b0,0);
      O.rigid(new THREE.TorusGeometry(0.037,0.008,5,12),TM(sd*hx*0.42,gy,cz+hz*1.02),hid,0x1a1612)}}
  return O.build();
}

// body shader hook: clothing colours baked per-vertex (aCol, aCl) are blended over the painted skin texture, keeping its muscle shading.
// Uses only plain attributes/varyings (no float textures, no extra samplers) so it is safe on low-end mobile GPUs.
function patchBodyMat(m){
  m.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aCol;attribute float aCl;varying vec3 vCl;varying float vCa;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCl=aCol;vCa=aCl;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCl;varying float vCa;')
      .replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nfloat tl=dot(texture2D(map,vMapUv).rgb,vec3(.333));\n#else\nfloat tl=.19;\n#endif\ndiffuseColor.rgb=mix(diffuseColor.rgb,vCl*clamp(.55+.45*tl/.19,.5,1.5),vCa);');
  };
  m.customProgramCacheKey=()=>'bodyclothes1';
}
const bodyGeoCache=new Map();
function bodyColorGeo(mod,spec){
  const key=(spec.female?'f':'m')+'|'+spec.shirt+'|'+spec.pants+'|'+(spec.boots??0x2a211a)+'|'+spec.longSleeve+'|'+(spec.seed|0);
  let g=bodyGeoCache.get(key);if(g)return g;
  const src=mod.body.geometry,P=src.attributes.position,SI=src.attributes.skinIndex,SW=src.attributes.skinWeight,N=P.count,bones=mod.bones;
  const cS=new THREE.Color(spec.shirt),cP=new THREE.Color(spec.pants),cB=new THREE.Color(spec.boots??0x2a211a);
  const col=new Float32Array(N*3),cl=new Float32Array(N);
  const isShirt=/^(spine_|clavicle|upperarm)/,isArm=/^lowerarm/,isPants=/^(root|pelvis|thigh)/,isCalf=/^calf/,isFoot=/^(foot|ball)/;
  for(let i=0;i<N;i++){
    let sh=0,pa=0,bo=0;const y=P.getY(i);
    for(let k=0;k<4;k++){const w=SW.getComponent(i,k);if(w<=0)continue;const nm=bones[SI.getComponent(i,k)].name;
      if(isShirt.test(nm))sh+=w;else if(isArm.test(nm)){if(spec.longSleeve)sh+=w*sm(0.0,1.0,1)}
      else if(isPants.test(nm))pa+=w;else if(isCalf.test(nm)){const b=1-sm(0.2,0.36,y);bo+=w*b;pa+=w*(1-b)}else if(isFoot.test(nm))bo+=w}
    const a=sh+pa+bo;const cov=sm(0.32,0.72,a);
    const inv=a>1e-4?1/a:0;const x=P.getX(i),z=P.getZ(i);
    // fabric mottling + dirt gradient (darker towards the ground, grimy hems)
    const nz=0.82+0.3*vnoise(x*17+z*11,y*17)+0.12*vnoise(x*4.3,y*4.3+z*3);
    const dirt=0.7+0.3*sm(0.0,1.2,y);
    const r=(cS.r*sh+cP.r*pa+cB.r*bo)*inv*nz*dirt,gg=(cS.g*sh+cP.g*pa+cB.g*bo)*inv*nz*dirt,b2=(cS.b*sh+cP.b*pa+cB.b*bo)*inv*nz*dirt;
    col[i*3]=r;col[i*3+1]=gg;col[i*3+2]=b2;cl[i]=cov*0.97;
  }
  g=new THREE.BufferGeometry();for(const n in src.attributes)g.setAttribute(n,src.attributes[n]);
  g.setAttribute('skinIndex',mapGeoSkin(mod,src));g.setIndex(src.index);g.setAttribute('aCol',new THREE.BufferAttribute(col,3));g.setAttribute('aCl',new THREE.BufferAttribute(cl,1));
  g.boundingSphere=src.boundingSphere;g.boundingBox=src.boundingBox;
  bodyGeoCache.set(key,g);return g;
}
// (legacy trimmed-body helper kept but unused: the full body is always drawn now)
const trimCache=new Map();
function trimmedBodyGeo(mod,female,longSleeve){
  const k=(female?'f':'m')+longSleeve;let g=trimCache.get(k);if(g)return g;
  const geo=mod.body.geometry,P=geo.attributes.position,I=geo.index;
  const cov=i=>{const r=mod.reg[i],y=P.getY(i);return r==='pelvis'||r==='thigh'||r==='calf'||r==='foot'||r==='spine'||r==='clav'||r==='uarm'||(longSleeve&&r==='larm')};
  const keep=[];for(let t=0;t<I.count;t+=3){const a=I.getX(t),b=I.getX(t+1),c=I.getX(t+2);if(!(cov(a)&&cov(b)&&cov(c)))keep.push(a,b,c)}
  g=new THREE.BufferGeometry();for(const n in geo.attributes)g.setAttribute(n,geo.attributes[n]);g.setIndex(keep);g.boundingSphere=geo.boundingSphere;g.boundingBox=geo.boundingBox;
  trimCache.set(k,g);return g;
}
const outfitCache=new Map(),OUTFIT_CAP=MOBILE?10:24;
function getOutfitGeo(mod,key,spec,cls){
  const ck=cls+'|'+(spec.female?'f':'m')+'|'+key;
  let e=outfitCache.get(ck);if(e)return e;
  const same=[...outfitCache.entries()].filter(([k])=>k.startsWith(cls+'|'+(spec.female?'f':'m')+'|'));
  if(!spec.unique&&same.length>=OUTFIT_CAP){return same[Math.floor(Math.random()*same.length)][1]}
  e=buildOutfit(mod,spec);outfitCache.set(ck,e);return e;
}
// weapons (merged, attached to hand bone)
const wpnGeo={};
function weaponGeo(k){if(!wpnGeo[k])wpnGeo[k]=mergeParts(weaponParts(k).map(p=>({...p,k:'metal'})));return wpnGeo[k]}
const GRIP=new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0));
const GRIPQ=new THREE.Quaternion().setFromRotationMatrix(GRIP);

// ---------- robust body proxies: plain rigid meshes parented to bones (no skinning, no custom shader) ----------
const _pm=new THREE.Matrix4(),_pq0=new THREE.Quaternion(),_pUp=new THREE.Vector3(0,1,0);
const proxyMats=new Map();
function pxMat(hex){let m=proxyMats.get(hex);if(!m){m=new THREE.MeshLambertMaterial({color:hex});proxyMats.set(hex,m)}return m}
const _unitSph=new THREE.SphereGeometry(1,12,8),_unitCyl=new THREE.CylinderGeometry(1,1,1,10,1,false);
const _unitBox=new THREE.BoxGeometry(1,1,1);
function pxBindPos(H,n){const i=H.mod.idx[n];if(i===undefined)return null;return new THREE.Vector3().setFromMatrixPosition(_pm.copy(H.mod.body.skeleton.boneInverses[i]).invert())}
function pxAdd(H,list,bone,geo,pos,scl,quat,hex){
  const b=H.bones[bone];if(!b)return null;const m=new THREE.Mesh(geo,pxMat(hex));m.matrixAutoUpdate=false;
  m.matrix.copy(H.mod.body.skeleton.boneInverses[H.mod.idx[bone]]).multiply(new THREE.Matrix4().compose(pos,quat||_pq0.identity(),scl));
  m.visible=false;m.frustumCulled=false;m.castShadow=false;m.receiveShadow=false;m.userData.px=1;b.add(m);list.push(m);return m}
function pxSeg(H,list,bone,a,b,r0,r1,hex,childName){   // tapered rod from bind position a to b attached to bone
  const pa=pxBindPos(H,a),pb=pxBindPos(H,b);if(!pa||!pb)return;const d=pb.clone().sub(pa),len=d.length();if(len<1e-4)return;
  const g=new THREE.CylinderGeometry(r1,r0,1,9,1,false);const q=new THREE.Quaternion().setFromUnitVectors(_pUp,d.clone().normalize());
  pxAdd(H,list,bone,g,pa.clone().add(pb).multiplyScalar(0.5),new THREE.Vector3(1,len,1),q,hex);
  pxAdd(H,list,bone,_unitSph,pa,new THREE.Vector3(r0,r0,r0),null,hex)}
function pxEll(H,list,bone,x,y,z,rx,ry,rz,hex,rotX=0){pxAdd(H,list,bone,_unitSph,new THREE.Vector3(x,y,z),new THREE.Vector3(rx,ry,rz),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),rotX),hex)}
function buildCore(H){   // single inset ellipsoid in the chest: invisible when the skinned torso renders, a safety net when it does not
  const mod=H.mod,sp=H.spec,r=mod.ringAt(1.2);const col=new THREE.Color(sp.jacket!=null?sp.jacket:sp.shirt).multiplyScalar(0.9).getHex();
  const L=[];pxEll(H,L,'spine_02',r.cx,1.22,r.cz,Math.max(0.1,r.rx*0.72),0.27,Math.max(0.07,r.rz*0.72),col);
  H.px={core:L[0],torso:[],full:[],built:false};if(L[0])L[0].visible=true}
function ensureProxies(H){
  if(H.px.built)return;H.px.built=true;const mod=H.mod,sp=H.spec,T=H.px.torso,F=H.px.full;
  const skin=new THREE.Color(H.skinHex).multiplyScalar(0.8).getHex();
  const shirt=sp.jacket!=null?sp.jacket:sp.shirt,sleeve=sp.longSleeve?(sp.jacket!=null&&!sp.vest?sp.jacket:sp.shirt):skin,pants=sp.pants,boots=sp.boots??0x2a211a;
  const rb=mod.ringAt(1.1),rm=mod.ringAt(1.25),rc=mod.ringAt(1.4);
  pxEll(H,T,'spine_01',rb.cx,1.1,rb.cz,rb.rx*0.97,0.17,rb.rz*0.97,shirt);
  pxEll(H,T,'spine_02',rm.cx,1.26,rm.cz,rm.rx*1.0,0.16,rm.rz*1.0,shirt);
  pxEll(H,T,'spine_03',rc.cx,1.41,rc.cz,rc.rx*1.02,0.15,rc.rz*1.02,shirt);
  pxSeg(H,T,'neck_01','neck_01','Head',0.05,0.045,skin);
  for(const s of['l','r']){
    pxSeg(H,T,'clavicle_'+s,'clavicle_'+s,'upperarm_'+s,0.05,0.06,shirt);
    pxSeg(H,T,'upperarm_'+s,'upperarm_'+s,'lowerarm_'+s,0.062,0.048,shirt);
    pxSeg(H,F,'lowerarm_'+s,'lowerarm_'+s,'hand_'+s,0.046,0.036,sleeve);
    const hp=pxBindPos(H,'hand_'+s);if(hp)pxAdd(H,F,'hand_'+s,_unitSph,hp,new THREE.Vector3(0.045,0.05,0.04),null,skin);
    pxSeg(H,F,'thigh_'+s,'thigh_'+s,'calf_'+s,0.095,0.065,pants);
    pxSeg(H,F,'calf_'+s,'calf_'+s,'foot_'+s,0.064,0.048,pants);
    const fp=pxBindPos(H,'foot_'+s),bp=pxBindPos(H,'ball_leaf_'+s)||pxBindPos(H,'ball_'+s);
    if(fp&&bp){const c=fp.clone().add(bp).multiplyScalar(0.5);c.y=Math.max(c.y,0.045);pxAdd(H,F,'foot_'+s,_unitBox,c,new THREE.Vector3(0.09,0.09,Math.max(0.2,bp.clone().sub(fp).length()*1.3)),null,boots)}
  }
  const pp=mod.ringAt(0.95);pxEll(H,F,'pelvis',pp.cx,0.93,pp.cz,pp.rx*1.05,0.14,pp.rz*1.05,pants);
  const hd=mod.head;pxEll(H,F,'Head',hd.cx,hd.cy,hd.cz,hd.hx*1.0,hd.hy*1.0,hd.hz*0.98,skin);
  if(sp.hat&&sp.hat!=='hair'){const hc=sp.hatCol??0x4a4a3a;pxEll(H,F,'Head',hd.cx,hd.cy+hd.hy*0.25,hd.cz-hd.hz*0.05,hd.hx*1.1,hd.hy*0.85,hd.hz*1.12,sp.hat==='helmet'?0x4a4e3e:hc)}
  else pxEll(H,F,'Head',hd.cx,hd.cy+hd.hy*0.35,hd.cz-hd.hz*0.1,hd.hx*1.04,hd.hy*0.7,hd.hz*1.06,sp.hair??0x2a1e14);
  if(sp.pack){const pz=mod.ringAt(1.32).cz-mod.ringAt(1.32).rz-0.1;pxAdd(H,F,'spine_03',_unitBox,new THREE.Vector3(0,1.26,pz),new THREE.Vector3(0.34,0.42,0.19),null,sp.packCol??0x5a6240)}
}
function applyBodyMode(H){
  const m=BODY.mode;if(!H.px)return;if(m!=='off')ensureProxies(H);
  for(const x of H.px.torso)x.visible=(m==='torso'||m==='full');
  for(const x of H.px.full)x.visible=(m==='full');
  const sk=m!=='full';H.body.visible=sk;H.om.visible=sk;if(H.eyes)H.eyes.visible=sk;if(H.brows)H.brows.visible=sk}
function setBodyMode(m){BODY.mode=m;for(const H of BODY.humans)applyBodyMode(H)}
function createHumanGLB(o={}){
  const pal=o.pal||pick(HUMAN_PALETTES);
  const female=o.female??(R()<0.3&&!o.hero&&o.role!=='mechanic'&&o.role!=='guard');const mod=GLB.models[female?'f':'m'];
  const clone=SkeletonUtils.clone(mod.scene);
  const spec={female,shirt:o.shirt??pal.shirt,pants:o.pants??pal.pants,jacket:o.jacket===null?null:(o.jacket??pal.jacket),vest:!!o.vest,longSleeve:o.longSleeve??(R()<0.7),
    boots:o.boots,scarf:o.scarf||0,pack:o.pack!==false&&(o.pack??R()<0.6),packCol:o.packCol,rollCol:o.rollCol,hat:o.hat??(female&&R()<0.5?'hair':pick(['cap','beanie','hair','hair'])),hatCol:o.hatCol,hair:o.hair,beard:!female&&o.beard,mask:o.mask||0,goggles:o.goggles,holster:o.holster,pads:o.pads||0,longHair:o.longHair,unique:!!o.unique};
  const key=[spec.jacket,spec.vest,spec.longSleeve,spec.scarf,spec.pack,spec.packCol,spec.rollCol,spec.hat,spec.hatCol,spec.hair,spec.beard,spec.mask,spec.goggles,spec.holster,spec.pads].join(',');
  const ogeo=getOutfitGeo(mod,key,spec,o.cls||'npc');
  let body=null,eyes=null,brows=null;
  clone.traverse(n=>{if(n.isSkinnedMesh){if(/superhero/i.test(n.name))body=n;else if(/eyes/i.test(n.name))eyes=n;else if(/brow/i.test(n.name))brows=n}});
  const tone=o.tone??Math.floor(R()*5);
  body.material=GLB.skin[female?'f':'m'][tone];spec.seed=o.hero?7:(Math.floor(R()*6));body.geometry=bodyColorGeo(mod,spec);
  // one reduced skeleton (23 bones) shared by body / outfit / eyes / brows -> one small bone texture
  const sk0=body.skeleton,sk=new THREE.Skeleton(mod.rKeep.map(i=>sk0.bones[i]),mod.rKeep.map(i=>sk0.boneInverses[i]));
  body.bind(sk,body.bindMatrix);
  if(eyes){eyes.geometry=redGeo(mod,eyes.geometry);eyes.bind(sk,eyes.bindMatrix)}
  if(brows){brows.geometry=redGeo(mod,brows.geometry);brows.bind(sk,brows.bindMatrix)}
  const om=new THREE.SkinnedMesh(ogeo,M.cloth2);om.bind(sk,body.bindMatrix);om.name='outfit';body.parent.add(om);
  const meshes=[body,om];if(eyes)meshes.push(eyes);if(brows)meshes.push(brows);
  for(const m of meshes){m.castShadow=true;m.receiveShadow=false;m.frustumCulled=false}   // skinned bounds are unreliable on some mobile drivers; we cull per-human below
  const root=new THREE.Group();root.add(clone);
  const sy=o.scale??(0.95+R()*0.1),sx=o.wscale??(0.94+R()*0.12);root.scale.set(sx,sy,sx);
  const H={root,glb:true,noCull:!!o.noCull,clone,body,om,eyes,brows,female,mixer:new THREE.AnimationMixer(clone),acts:{},cur:{},gait:'idle',
    phase:0,speed:0,aim:0,swing:0,dead:0,talk:0,seed:Math.random()*100,weapon:null,weapons:{},bones:{},osT:0,fireT:0,hitT:0,reloading:false,_sw:0,_dead:false,lodT:Math.random(),accT:0,
    head:new THREE.Object3D(),hips:new THREE.Object3D(),spine:new THREE.Object3D()};
  clone.traverse(n=>{if(n.isBone)H.bones[n.name]=n});
  H.mod=mod;H.spec=spec;H.skinHex=body.material.color.getHex();
  buildCore(H);BODY.humans.push(H);if(BODY.mode!=='off')applyBodyMode(H);
  // weapons on the right hand bone
  const hand=H.bones.hand_r;
  for(const w of['pistol','pipe','shotgun']){
    const g=new THREE.Group();g.quaternion.copy(GRIPQ);g.position.set(0,0.08,0.012);
    const wm=new THREE.Mesh(weaponGeo(w),M.metal);wm.castShadow=true;wm.frustumCulled=false;wm.position.set(0,w==='pipe'?-0.02:-0.01,w==='pipe'?-0.1:w==='shotgun'?-0.25:-0.06);g.add(wm);
    g.visible=false;hand.add(g);H.weapons[w]=g;
  }
  const mz=new THREE.Object3D();mz.position.set(0,0.03,0.3);H.weapons.pistol.add(mz);H.muzzlePistol=mz;
  const mz2=new THREE.Object3D();mz2.position.set(0,0.03,0.46);H.weapons.shotgun.add(mz2);H.muzzleShotgun=mz2;
  H.muzzle=mz;
  if(o.weapon)setWeaponG(H,o.weapon);
  H.idleClip='Idle_Loop';
  H.shoot=()=>{H.fireT=0.28;H.fresh='fire';const wd=H.weapon&&WEAPONS[H.weapon];H.rec=clamp(((wd&&wd.recoil)||1)/2.2,0.35,1.5)};
  H.hit=()=>{H.hitT=0.5;H.fresh='hit'};
  return H;
}
function setWeaponG(H,w){H.weapon=w;for(const k in H.weapons)H.weapons[k].visible=(k===w);if(w!==null&&w!==undefined)H.muzzle=(H.muzzles&&H.muzzles[w])||(w==='shotgun'?H.muzzleShotgun:H.muzzlePistol)}
function actFor(H,key){let a=H.acts[key];if(!a){a=H.mixer.clipAction(GLB.clips[key]);H.acts[key]=a}return a}
function setLayer(H,layer,key,ts,{once=false,force=false,fade=0.2,syncTo=null}={}){
  const cur=H.cur[layer];
  if(cur&&cur.key===key&&!force){cur.a.timeScale=ts;return}
  const a=actFor(H,key);a.reset();a.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,Infinity);a.clampWhenFinished=once;a.timeScale=ts;
  const dur=a.getClip().duration;
  if(syncTo&&!once)a.time=syncTo.time%dur;else if(!once)a.time=((H.seed*0.37)%1)*dur;
  a.fadeIn(fade).play();if(cur&&cur.a!==a)cur.a.fadeOut(fade);H.cur[layer]={key,a};
}
const _cd=new THREE.Vector3(),_cs=new THREE.Sphere(),HFRUSTUM=new THREE.Frustum(),_hpv=new THREE.Matrix4();
function updateHFrustum(){camera.updateMatrixWorld();_hpv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);HFRUSTUM.setFromProjectionMatrix(_hpv)}
function animateGLB(H,dt,time,opts={}){
  const ranged=H.weapon==='pistol'||H.weapon==='shotgun'||!!H.ranged;
  // distance LOD for animation cost + face meshes
  if(H.root.visible){
    H.root.getWorldPosition(_cd);const d2=_cd.distanceToSquared(camera.position);
    _cs.center.copy(_cd);_cs.center.y+=1.0;_cs.radius=2.6;
    const inView=H.noCull||d2<9||(d2<(MOBILE?120*120:220*220)&&HFRUSTUM.intersectsSphere(_cs));
    if(H.inView!==inView){H.inView=inView;H.clone.visible=inView}
    if(!inView&&H.dead<=0){H.accT+=dt;if(H.accT<0.5)return}
    const far=d2>70*70;
    if(BODY.mode!=='full'){if(H.eyes)H.eyes.visible=d2<22*22;if(H.brows)H.brows.visible=d2<22*22}
    if(H.px&&H.px.core)H.px.core.visible=d2<28*28;
    if(MOBILE){const cs=d2<30*30;if(H.shadowOn!==cs){H.shadowOn=cs;H.body.castShadow=cs;H.om.castShadow=cs}}
    H.accT+=dt;if(far&&(H.lodT+=dt)<0.2&&!H.dead){return}
    if(far)H.lodT=0;
    dt=H.accT;H.accT=0;
  }
  // gait with hysteresis
  const sp=H.speed;let g=H.gait;
  const up=(a,b)=>sp>a;
  if(g==='idle')g=sp>0.3?'walk':'idle';else if(g==='walk'){if(sp<0.18)g='idle';else if(sp>3.1)g='jog'}else if(g==='jog'){if(sp<2.6)g='walk';else if(sp>6.0)g='sprint'}else if(g==='sprint'){if(sp<5.2)g='jog'}
  H.gait=g;
  let low,ts=1,once=false;
  if(H.dead>0){low='Death01';ts=1.5;once=true}
  else if(H.crouch&&g!=='sprint'){low='Crouch_Idle_Loop';ts=1}
  else if(g==='idle'){low=H.idleClip}
  else if(g==='walk'){low='Walk_Loop';ts=clamp(sp/1.5,0.7,2.1)}
  else if(g==='jog'){low='Jog_Fwd_Loop';ts=clamp(sp/3.7,0.8,1.6)}
  else{low='Sprint_Loop';ts=clamp(sp/6.4,0.8,1.3)}
  // one-shot triggers (edge detected)
  if(H.swing>0&&!H._sw){H.osKey=H.swingKey||'Sword_Attack';H.osT=0.6;H.osTs=2.5;H.osFresh=true}
  H._sw=H.swing>0;
  if(H.fresh==='fire'){H.fresh=null;H.osKey2='Pistol_Shoot';H.osT2=0.3;H.osFresh2=true}
  if(H.fresh==='hit'){H.fresh=null;if(!(H.osT>0)){H.osKey='Hit_Chest';H.osT=0.5;H.osTs=1.6;H.osFresh=true}}
  if(H.dead>0&&!H._dead){H._dead=true;H.osT=0;H.osT2=0}
  if(H.dead<=0&&H._dead){H._dead=false}
  setLayer(H,'low',low+'_l',ts,{once,force:H.dead>0&&!H.cur.low?.key.startsWith('Death01'),fade:once?0.12:0.22});
  // upper-body choice
  let upKey=low,uts=ts,uOnce=once,uForce=false;
  if(H.dead>0){upKey='Death01';uOnce=true}
  else if(H.actT>0){upKey=H.actKey;uts=H.actTs||1;uOnce=true;uForce=!!H.actFresh;H.actFresh=false;H.actT-=dt}
  else if(H.osT>0){upKey=H.osKey;uts=H.osTs;uOnce=true;uForce=!!H.osFresh;H.osFresh=false;H.osT-=dt}
  else if(H.osT2>0&&ranged){upKey=H.osKey2;uts=1.7;uOnce=true;uForce=!!H.osFresh2;H.osFresh2=false;H.osT2-=dt}
  else if(H.reloading&&ranged){upKey='Pistol_Reload';uts=1.0;uOnce=true}
  else if(H.aim>0.4&&ranged){upKey='Pistol_Aim_Neutral';uts=1}
  else if(H.crouch&&!(ranged&&H.aim>0.05)){upKey='Crouch_Idle_Loop';uts=1}
  else if(ranged&&!(g==='idle'&&H.idleClip==='Pistol_Idle_Loop')){upKey='Pistol_Idle_Loop';uts=1}
  setLayer(H,'up',upKey+'_u',uts,{once:uOnce,force:uForce,fade:uForce?0.06:0.18,syncTo:(!uOnce&&upKey===low)?H.cur.low?.a:null});
  H.mixer.update(dt);
  postPose(H,dt,ranged);
}
// ---- v6 procedural layer on top of the baked clips: recoil kick + two-handed grip IK for long guns
const _V0=new THREE.Vector3(),_V1=new THREE.Vector3(),_V2=new THREE.Vector3(),_V3=new THREE.Vector3(),_V4=new THREE.Vector3(),_Q0=new THREE.Quaternion(),_Q1=new THREE.Quaternion();
function aimBone(b,child,target){
  b.updateWorldMatrix(true,false);child.updateWorldMatrix(true,false);
  const bp=_V0.setFromMatrixPosition(b.matrixWorld),cp=_V1.setFromMatrixPosition(child.matrixWorld);
  const from=cp.sub(bp).normalize(),to=_V2.copy(target).sub(bp).normalize();
  if(from.dot(to)>0.99999)return;
  _Q0.setFromUnitVectors(from,to);b.getWorldQuaternion(_Q1);_Q1.premultiply(_Q0);
  b.parent.getWorldQuaternion(_Q0);b.quaternion.copy(_Q0.invert().multiply(_Q1));b.updateWorldMatrix(false,true);
}
function holdIK(H,wd){
  const B=H.bones,A=B.upperarm_l,Bn=B.lowerarm_l,C=B.hand_l,hr=B.hand_r,mz=H.muzzle;if(!A||!Bn||!C||!hr||!mz||!mz.getWorldPosition)return;
  H.root.updateMatrixWorld(true);
  const hp=_V3.setFromMatrixPosition(hr.matrixWorld),mp=mz.getWorldPosition(_V4);
  const a=new THREE.Vector3().setFromMatrixPosition(A.matrixWorld),b=new THREE.Vector3().setFromMatrixPosition(Bn.matrixWorld),c=new THREE.Vector3().setFromMatrixPosition(C.matrixWorld);
  const l1=a.distanceTo(b),l2=b.distanceTo(c);const dmax=l1+l2-0.015,dmin=Math.abs(l1-l2)+0.02;
  // foregrip: as far forward along the barrel as the left arm can reach (pistols: support hand wraps the grip)
  const T=new THREE.Vector3();let ok=false;const tMax=wd.kind==='pistol'?0.12:(wd.scope?0.5:0.6);
  for(let t=tMax;t>=0.02;t-=0.04){T.copy(mp).sub(hp).multiplyScalar(t).add(hp);T.y-=0.05;if(a.distanceTo(T)<=dmax){ok=true;break}}
  if(!ok)return;
  let d=clamp(a.distanceTo(T),dmin,dmax);const dir=T.clone().sub(a).normalize();T.copy(a).addScaledVector(dir,d);
  const cosA=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),sinA=Math.sqrt(1-cosA*cosA);
  // pole: elbow points down and slightly outward (character's left = -x local... use the current elbow side)
  const pole=new THREE.Vector3(0,-1,0).addScaledVector(b.clone().sub(a).normalize(),0.5);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const elbow=a.clone().addScaledVector(dir,cosA*l1).addScaledVector(pole,sinA*l1);
  aimBone(A,Bn,elbow);aimBone(Bn,C,T);
}
function postPose(H,dt,ranged){
  if(H.dead>0||!H.bones||!H.inView)return;
  const wd=H.weapon&&WEAPONS[H.weapon];if(!wd||!ranged)return;
  const near=H.hero||H.noCull||H.root.position.distanceToSquared(camera.position)<40*40;if(!near)return;
  const B=H.bones;
  if(H.rec>0.002){const r=H.rec;H.rec*=Math.exp(-dt*11);
    if(B.spine_02)B.spine_02.rotateX(-0.045*r);if(B.spine_03)B.spine_03.rotateX(-0.035*r);
    if(B.upperarm_r)B.upperarm_r.rotateZ(-0.11*r);if(B.clavicle_r)B.clavicle_r.rotateZ(-0.03*r)}
  if((wd.kind==='rifle'&&wd.snd!=='bow'||wd.kind==='pistol'&&H.aim>0.3)&&!H.reloading&&!H.swing)holdIK(H,wd);
}
// ---------- fallback-capable wrappers

await stage(0.74,'Loading survivors');
try{GLB=await loadGLB()}catch(e){console.warn('GLB humans failed -> procedural fallback',e);(window.__dbgLog||console.log)('error','Character models failed to load ('+(e&&e.message||e)+') - using simple fallback humans');GLB=null}
await stage(0.86,'Dressing survivors');
window.__glb=!!GLB;
function createHuman(o={}){return GLB?createHumanGLB(o):createHumanProc(o)}
function animateHuman(H,dt,time,opts){return H.glb?animateGLB(H,dt,time,opts||{}):animateHumanProc(H,dt,time,opts||{})}
// ============================================================ entity containers
const ents=new THREE.Group();scene.add(ents);
const FACE=(x0,z0,x1,z1)=>Math.atan2(x1-x0,z1-z0);
const npcs=[];
function addNPC(x,z,face,o={}){
  const H=createHuman(o);const y=o.y??terrainH(x,z);
  H.root.position.set(x,y,z);H.root.rotation.y=face;ents.add(H.root);
  const n={H,x,z,y,face,kind:o.kind||'idle',home:[x,z],t:Math.random()*10,wp:o.wp||null,wpi:0,speed:o.speed||0,role:o.role||'',look:null};
  if(o.talk){H.talk=1;if(H.glb)H.idleClip='Idle_Talking_Loop'}if(o.armsCrossed)H.armsCrossed=true;if(o.leanHands)H.leanHands=true;if(o.wide)H.stanceWide=true;
  npcs.push(n);return n;
}
const HAT=['cap','beanie','wide','hood','hair','hair','cap','beanie'];
function randLook(extra={}){return{hat:pick(HAT),hatCol:pick([0x6a2f2a,0x3a3a3a,0x5a4a34,0x3a4a3a,0x4a4a58,0x6a5a2a]),beard:R()<0.45,hair:pick([0x2a1e14,0x4a3a28,0x1a1a1a,0x7a6a4a,0x6a6a68]),goggles:R()<0.15,mask:R()<0.12?pick([0x6a2f2a,0x3a3a3a]):0,
  packCol:pick([0x5a6240,0x6a4a30,0x4a4e58,0x5a4a3a]),rollCol:pick([0x8a3a2a,0x3a5a6a,0x6a6a3a]),scarf:R()<0.35?pick([0x8a3a2a,0x6a6a4a,0x3a4a5a]):0,pack:R()<0.6,...extra}}
// vendors & customers
const vendorSpots=npcSpots.filter(s=>s.role==='vendor');
vendorSpots.forEach((s,i)=>{
  const dx=Math.sin(s.yaw),dz=Math.cos(s.yaw);
  addNPC(s.x-dx*1.55,s.z-dz*1.55,s.yaw,{...randLook({pack:false,hat:i%2?'wide':'cap',beard:i%3!==0}),talk:i%2===0,jacket:null,kind:'idle',role:'vendor'});
  if(i%3!==1){const side=(i%2?1:-1)*0.9;addNPC(s.x+dx*0.9-dz*side,s.z+dz*0.9+dx*side,s.yaw+Math.PI+(R()-.5)*0.5,{...randLook(),talk:i%2===1,armsCrossed:i%3===2,wide:true})}
});
const mechSpot=npcSpots.find(s=>s.role==='mechanic');
const mechanic=addNPC(MECH.x+5.4,MECH.z+0.5,Math.PI/2+0.15,{hat:'cap',hatCol:0x3a4a58,beard:true,hair:0x2a1e14,pack:false,jacket:0x3a4a58,shirt:0x4a4a44,pants:0x2e3036,goggles:true,talk:true,role:'mechanic',wide:true});
// fire-barrel gatherings
fireBarrels.forEach((fb,i)=>{
  const n=(fb.tag==='plaza')?3:(fb.tag==='gate'?2:(i%2?2:1));
  for(let k=0;k<n;k++){
    const a=k/n*Math.PI*2+i*1.3+0.6;const r=1.55+R()*0.35;const x=fb.x+Math.cos(a)*r,z=fb.z+Math.sin(a)*r;
    if(boxes.some(b=>x>b[0]-0.4&&x<b[2]+0.4&&z>b[1]-0.4&&z<b[3]+0.4))continue;
    addNPC(x,z,FACE(x,z,fb.x,fb.z)+(R()-.5)*0.7,{...randLook(),leanHands:k%2===0,talk:k%2===1&&n>1,armsCrossed:k===2,wide:true});
  }
});
// guards: towers + gates
towerSpots.forEach((t,i)=>{addNPC(t.x+Math.sin(i)*0.2,t.z+0.3,[Math.PI,Math.PI,0,0,Math.PI,0][i]+0.2,{y:t.py+0.1,hat:'helmet',weapon:'shotgun',pack:false,jacket:0x4a4a3a,shirt:0x5a5a48,kind:'guard',beard:true,wide:true})});
[[-3.4,HZ-3,0],[3.6,HZ-2.6,0.3],[-3.6,-HZ+2.8,Math.PI],[3.4,-HZ+3,Math.PI-0.3]].forEach(([x,z,f],i)=>addNPC(x,z,f,{hat:'helmet',weapon:'shotgun',pack:false,jacket:0x4a4a3a,shirt:0x5a5a48,kind:'guard',wide:true,beard:i%2===0}));
// walkers (street)
const walkRoutes=[[[2.5,-22],[2.5,22]],[[-3.5,20],[-3.5,-18]],[[0,-8],[4,-8],[4,10],[0,10]]];
walkRoutes.forEach((wp,i)=>addNPC(wp[0][0],wp[0][1],0,{...randLook(),kind:'walk',wp,speed:1.2+i*0.15}));
if(MOBILE){/* cull a third of far NPCs to keep draw calls modest */
  npcs.filter(n=>n.kind==='idle'&&n.role!=='vendor'&&n.role!=='mechanic').forEach((n,i)=>{if(i%2===1){ents.remove(n.H.root);n.dead=true}});
}

await stage(0.94,'Waking the settlement');
// ============================================================ player
const P={x:SPAWN.x,z:SPAWN.z,y:0,yaw:Math.PI,vy:0,hp:100,hunger:82,thirst:68,slot:2,stance:0,view:'tp',stamina:100,bloom:0,light:false,climb:null,onPlat:null,busy:0,searching:null,money:45,rep:2,wanted:0,wantedT:0,speed:0,aim:0,swingT:0,swingCool:0,shotCool:0,inCar:false,hasPart:false,mission:0,dead:false,reload:0,hurtT:0};
const hero=createHuman({hero:true,noCull:true,unique:true,cls:'hero',female:false,tone:1,scale:1,wscale:1,longSleeve:true,hat:'cap',hatCol:0x6a2f2a,beard:true,hair:0x2a1e14,pack:true,packCol:0x5a6240,rollCol:0x8a3a2a,scarf:0x8a3a2a,goggles:false,holster:true,jacket:0x6a4a2a,shirt:0x5a5a40,pants:0x3e3a34,weapon:null,pal:null});
ents.add(hero.root);setWeaponG(hero,null);
// goggles pushed up on cap
hero.root.position.set(P.x,0,P.z);
const cam={yaw:0.5,pitch:0.2,dist:5.6,tyaw:0.5,tpitch:0.2,tdist:5.6,fov:60,shake:0};
const camPos=new THREE.Vector3(),camLook=new THREE.Vector3();

// ============================================================ drivable car
function buildCar(color){
  const {P:parts,W}=carParts({color,lit:true,rack:true,exhaust:true,rimColor:0x7a756c});
  const grp=new THREE.Group();grp.rotation.order='YXZ';
  const body=partMesh(parts,{paint:M.paint,glass:M.glass,metal:M.metal,matte:M.matte,rubber:M.rubber,glow:M.glow});
  // roof rack stuff etc included. Patina via vertex colours already; add rust patches decals
  grp.add(body);
  const wheels=[];
  for(const w of W){
    const pivot=new THREE.Group();pivot.position.set(w.x,w.y,w.z);const spin=new THREE.Group();pivot.add(spin);
    const wl=partMesh(w.parts.map(p=>({...p})),{rubber:M.rubber,metal:M.metal});spin.add(wl);grp.add(pivot);wheels.push({pivot,spin,front:w.front});
  }
  grp.traverse(m=>{if(m.isMesh)m.castShadow=true});
  return {grp,wheels};
}
const CAR={x:-1.6,z:15.5,yaw:0,vx:0,vz:0,speed:0,steer:0,y:0,pitch:0,roll:0,spin:0,hp:100,obj:buildCar(0xa65028)};
ents.add(CAR.obj.grp);
CAR.y=terrainH(CAR.x,CAR.z);
// car dust & rust patches: bake little decals as part of paint is already jittered
const headlight=new THREE.SpotLight(0xffe2b0,0,60,0.5,0.6,1.3);headlight.visible=false;if(!MOBILE){scene.add(headlight,headlight.target)}

const rp0=roadX(-120);
// raider camp dressing at the radio part site: crashed van + barrels + fire
const PART={x:rp0+1.5,z:-118};PART.y=terrainH(PART.x,PART.z);
{
  const b=new Bld(B_STATIC,PART.x,PART.z,0.7);
  b.box('plate',0,0.9,0,2.1,1.7,4.2,new THREE.Color(0.75,0.7,0.65),0,0,0.05,0.06,1.6,0.08);
  b.box('paint',0,1.8,-0.6,1.9,0.2,2.6,0x6a6a60,0,0,0,0.06,1,0.05);
  B_STATIC.build(world);
}


// ============================================================ v5 : input / audio / inventory / guns / effects pools
document.body.classList.toggle('touch',isTouch||Q.get('mobile')==='1');
if(MOBILE||Q.get('mobile')==='1')document.body.classList.add('mobile');
const audio=new Audio5();
const vibe=p=>{if(S.haptics!==false&&IN.touch&&navigator.vibrate){try{navigator.vibrate(p)}catch(_){}}};
initInput(canvas);setMode({vehicle:false});if(isTouch||Q.get("mobile")==="1")IN.touch=true;
IN.onAny=()=>{audio.init()};
const FRESH=Q.get('fresh')==='1';
const inv=new Inv();
const foundNotes=new Set(),playedTapes=new Set();
inv.slots[2]=mkInst('rev',{mag:6});inv.slots[3]=mkInst('pipe');
inv.add('a357',18);inv.add('bandage',2);inv.add('beans',1);inv.add('water',1);inv.cash=45;
Object.defineProperty(P,'money',{get:()=>inv.cash,set:v=>{inv.cash=v},configurable:true,enumerable:true});
const curInst=()=>P.slot<=3?inv.slots[P.slot]:null;
Object.defineProperty(P,'ammo',{get:()=>{const i=curInst();return i&&WEAPONS[i.wid].slot<=2?i.mag:0},configurable:true});
Object.defineProperty(P,'reserve',{get:()=>{const i=curInst();return i&&WEAPONS[i.wid].cal?inv.ammoCount(WEAPONS[i.wid].cal):0},configurable:true});
Object.assign(P,{swapT:0,throwT:0,fireCd:0,rcl:0,reloadT:0,reloadSt:0,stepD:0,kills:0,stT:0,eye:1.62,jumpT:0,grounded:true,lastHurt:0,sprinting:false,staminaLock:false,hpMax:100});

// ---------------------------------------------------------------- toast & feed
const notes5=document.getElementById('notes5');
function feed(txt,col){if(!notes5)return;const d=document.createElement('div');d.textContent=txt;if(col)d.style.setProperty('--rc',col);notes5.appendChild(d);while(notes5.children.length>4)notes5.removeChild(notes5.firstChild);setTimeout(()=>d.remove(),3300)}
const rarCol=id=>RARITY[(ITEMS[id]||{}).rar||'common'].c;

// ---------------------------------------------------------------- gun meshes
const gunCache=new Map();
function gunGeoFor(wid,att){const key=wid+JSON.stringify(att||{});let g=gunCache.get(key);if(!g){g=buildGunGeo(THREE,wid,att||{});gunCache.set(key,g)}return g}
function ensureGun(H,wid,att){
  if(!H.glb||!H.bones.hand_r)return null;
  H.guns=H.guns||{};const key=wid+(att?JSON.stringify(att):'');let e=H.guns[wid];if(e&&e.key===key)return e;
  const g=gunGeoFor(wid,att);
  if(!e){const grp=new THREE.Group();grp.quaternion.copy(GRIPQ);grp.position.set(0,0.08,0.012);grp.visible=false;H.bones.hand_r.add(grp);
    e={grp,meshes:[],mz:new THREE.Object3D()};grp.add(e.mz);H.guns[wid]=e;H.weapons[wid]=grp;H.muzzles=H.muzzles||{};H.muzzles[wid]=e.mz}
  for(const m of e.meshes)e.grp.remove(m);e.meshes=[];
  if(g.geo.m){const m=new THREE.Mesh(g.geo.m,M.metal);m.castShadow=true;m.frustumCulled=false;e.grp.add(m);e.meshes.push(m)}
  if(g.geo.p){const m=new THREE.Mesh(g.geo.p,M.matte);m.castShadow=true;m.frustumCulled=false;e.grp.add(m);e.meshes.push(m)}
  e.mz.position.set(g.muzzle[0],g.muzzle[1],g.muzzle[2]);e.def=g;e.key=key;return e;
}
function giveFoeGun(H,wid){const w=WEAPONS[wid];if(!w)return;H.ranged=(w.kind==='pistol'||w.kind==='rifle');H.wid=wid;
  if(H.glb){ensureGun(H,wid);setWeaponG(H,wid);H.swingKey=w.melee||'Sword_Attack'}else{setWeapon(H,w.kind==='melee'?'pipe':(w.kind==='pistol'?'pistol':'shotgun'))}}
// first-person view-model (child of camera)
const vm=new THREE.Group();vm.rotation.y=Math.PI;vm.visible=false;camera.add(vm);
const vmS={wid:null,meshes:[],mz:new THREE.Object3D(),kick:0,kickR:0,def:null,x:0.17,y:-0.19,z:-0.42,swayX:0,swayY:0};vm.add(vmS.mz);
function vmRefresh(wid,att){
  for(const m of vmS.meshes)vm.remove(m);vmS.meshes=[];vmS.wid=wid;vmS.def=null;if(!wid)return;
  const g=gunGeoFor(wid,att);vmS.def=g;
  if(g.geo.m){const m=new THREE.Mesh(g.geo.m,M.metal);m.frustumCulled=false;vm.add(m);vmS.meshes.push(m)}
  if(g.geo.p){const m=new THREE.Mesh(g.geo.p,M.matte);m.frustumCulled=false;vm.add(m);vmS.meshes.push(m)}
  vmS.mz.position.set(g.muzzle[0],g.muzzle[1],g.muzzle[2]);
}
function refreshGun(){
  const i=curInst();let wid=null,att=null;
  if(P.slot===4)wid=inv.slots[4];else if(i){wid=i.wid;att=i.att}
  const w=wid&&WEAPONS[wid];
  hero.ranged=!!w&&(w.kind==='pistol'||w.kind==='rifle');hero.wid=wid;
  if(hero.glb){if(wid){ensureGun(hero,wid,att);setWeaponG(hero,wid);hero.swingKey=(w&&w.melee)||'Sword_Attack'}else setWeaponG(hero,null)}
  else setWeapon(hero,!w?null:(w.kind==='melee'?'pipe':(w.kind==='pistol'?'pistol':'shotgun')));
  vmRefresh(wid,att);
}
function equip(slot){
  if(P.dead||IN.modal&&0)return false;
  if(slot===4){
    const list=['grenade','molotov'].filter(id=>inv.count(id)>0);
    if(!list.length){feed('No throwables');audio.ui('error');return false}
    const cur=inv.slots[4];inv.slots[4]=(P.slot===4&&cur&&list.length>1)?list[(list.indexOf(cur)+1)%list.length]:(list.includes(cur)?cur:list[0]);
  }else if(!inv.slots[slot]){feed('Slot '+slot+' is empty');audio.ui('error');return false}
  P.slot=slot;P.reloadT=0;P.swapT=0.35;hero.reloading=false;refreshGun();audio.ui('click');return true;
}
function slotInfo(i){
  if(i===4){const id=inv.slots[4];const n=id?inv.count(id):(inv.count('grenade')+inv.count('molotov'));return{txt:n?(id==='molotov'?'MOL':'GRN')+' '+n:'4',empty:!n}}
  const s=inv.slots[i];return{txt:s?String(i):String(i),empty:!s,name:s?WEAPONS[s.wid].name:''}
}

// ---------------------------------------------------------------- effect pools: decals, shells, projectiles, fire
const decTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,1,32,32,30);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(0.35,'rgba(0,0,0,.8)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=1.5;for(let i=0;i<7;i++){const a=i*0.9+0.3,l=14+Math.random()*14;g.beginPath();g.moveTo(32,32);g.lineTo(32+Math.cos(a)*l,32+Math.sin(a)*l);g.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
const DECAL_N=MOBILE?48:96;
const decals=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:decTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,opacity:0.85}),DECAL_N);
decals.frustumCulled=false;{const z=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<DECAL_N;i++){decals.setMatrixAt(i,z);decals.setColorAt(i,new THREE.Color(0))}}scene.add(decals);
let decI=0;const _m4=new THREE.Matrix4(),_q1=new THREE.Quaternion(),_v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_zf=new THREE.Vector3(0,0,1),_c5=new THREE.Color();
function addDecal(p,n,size,col){_q1.setFromUnitVectors(_zf,n);_q1.multiply(new THREE.Quaternion().setFromAxisAngle(_zf,Math.random()*6.28));_v1.copy(p).addScaledVector(n,0.025);_m4.compose(_v1,_q1,_v2.set(size,size,size));
  decals.setMatrixAt(decI,_m4);decals.setColorAt(decI,_c5.set(col));decI=(decI+1)%DECAL_N;decals.instanceMatrix.needsUpdate=true;decals.instanceColor.needsUpdate=true}
// brass shells
const SH_N=MOBILE?10:20;const shells=new THREE.InstancedMesh(new THREE.BoxGeometry(0.012,0.012,0.045),new THREE.MeshStandardMaterial({color:0xc8a040,roughness:0.35,metalness:0.9}),SH_N);
shells.frustumCulled=false;const shS=[];for(let i=0;i<SH_N;i++){shS.push({p:new THREE.Vector3(0,-99,0),v:new THREE.Vector3(),r:new THREE.Vector3(),t:0});shells.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0))}scene.add(shells);
let shI=0;const _e5=new THREE.Euler();
function ejectShell(pos,dirR){const s=shS[shI];shI=(shI+1)%SH_N;s.p.copy(pos);s.v.set(dirR.x*2+rr(-.4,.4),rr(1.5,2.6),dirR.z*2+rr(-.4,.4));s.r.set(rr(-9,9),rr(-9,9),rr(-9,9));s.t=1.6}
function updateShells(dt){for(let i=0;i<SH_N;i++){const s=shS[i];if(s.t<=0)continue;s.t-=dt;s.v.y-=9.8*dt;s.p.addScaledVector(s.v,dt);const gy=terrainH(s.p.x,s.p.z)+0.01;if(s.p.y<gy){s.p.y=gy;s.v.y*=-0.35;s.v.x*=0.5;s.v.z*=0.5;s.r.multiplyScalar(0.4)}
  _e5.set(s.r.x*s.t,s.r.y*s.t,s.r.z*s.t);_q1.setFromEuler(_e5);_m4.compose(s.p,_q1,_v2.set(s.t>0?1:0,1,1));shells.setMatrixAt(i,_m4);if(s.t<=0)shells.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0))}shells.instanceMatrix.needsUpdate=true}
// attention/alert icon sprites
const alertTex=(txt,col)=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.font='900 52px Impact,Arial';g.textAlign='center';g.textBaseline='middle';g.lineWidth=7;g.strokeStyle='#000';g.strokeText(txt,32,34);g.fillStyle=col;g.fillText(txt,32,34);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t};
const alertMats={'?':new THREE.SpriteMaterial({map:alertTex('?','#ffd24a'),depthTest:false,transparent:true,fog:false}),'!':new THREE.SpriteMaterial({map:alertTex('!','#ff4a3a'),depthTest:false,transparent:true,fog:false})};
// search-glint points (unsearched containers nearby)
const glintTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,30);gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(0.25,'rgba(255,210,120,.7)');gr.addColorStop(1,'rgba(255,200,100,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  g.fillStyle='rgba(255,250,230,.95)';g.fillRect(30,6,4,52);g.fillRect(6,30,52,4);const t=new THREE.CanvasTexture(c);return t})();
const GL_N=24;const glintGeo=new THREE.BufferGeometry();const glintPos=new Float32Array(GL_N*3);glintGeo.setAttribute('position',new THREE.BufferAttribute(glintPos,3));glintGeo.setDrawRange(0,0);
const glints=new THREE.Points(glintGeo,new THREE.PointsMaterial({map:glintTex,size:0.55,sizeAttenuation:true,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false}));glints.frustumCulled=false;glints.renderOrder=9;scene.add(glints);

// ============================================================ v5 : HUD helpers, misc state
const el={hp:$('hpFill'),hpn:$('hpNum'),food:$('foodFill'),water:$('waterFill'),money:$('money'),stars:$('stars'),rep:$('rep'),ammo:$('ammo'),wname:$('wname'),mission:$('mTitle'),msub:$('mSub'),prompt:$('prompt'),toast:$('toast'),dist:$('mDist'),hit:$('hitmark'),xh:$('xh'),wasted:$('wasted'),dmg:$('dmgflash'),speed:$('speed')};
let toastT=0;function toast(t,ms=3200){el.toast.textContent=t;el.toast.style.opacity=1;toastT=ms/1000}
function setBar(e,v){e.style.width=clamp(v,0,100)+'%'}
function repName(r){return r>=8?'LEGEND':r>=5?'TRUSTED':r>=2?'KNOWN':'STRANGER'}
let xhKick=0,time=0,gameT=0,hitmarkT=0,flashLightT=0,hitKind='body';
const tracers=[];
const trMat=new THREE.MeshBasicMaterial({color:0xffd8a0,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false});
for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1,4).rotateX(Math.PI/2).translate(0,0,0.5),trMat.clone());m.visible=false;scene.add(m);tracers.push({m,t:0})}
let trI=0;
function tracer(a,b,w=1){const t=tracers[trI];trI=(trI+1)%tracers.length;t.t=0.09;t.m.visible=true;t.m.position.copy(a);t.m.lookAt(b);t.m.scale.set(w,w,a.distanceTo(b));t.m.material.opacity=0.9}
const flashLight=new THREE.PointLight(0xffb060,0,12,2);scene.add(flashLight);
const flashSprites=[];
const flashTex=glowTexture('rgba(255,250,220,1)','rgba(255,170,60,0.6)');
function mkFlash(){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false,toneMapped:false,opacity:0}));s.scale.setScalar(0.7);scene.add(s);return {s,t:0}}
for(let i=0;i<8;i++)flashSprites.push(mkFlash());
let fsI=0;
function muzzleFlash(pos,size=0.7,light=false){const f=flashSprites[fsI];fsI=(fsI+1)%flashSprites.length;f.s.position.copy(pos);f.s.scale.setScalar(size*(0.8+Math.random()*0.5));f.s.material.rotation=Math.random()*6;f.s.material.opacity=1;f.t=0.07;
  for(let i=0;i<4;i++)sparks.emit(pos.x,pos.y,pos.z,rr(-3,3),rr(-1,3),rr(-3,3),{life:rr(0.12,0.3),size:0.05,a:1,c0:[1,0.8,0.4],c1:[1,0.3,0.05],fall:6});
  if(light){flashLight.position.copy(pos);flashLight.intensity=60;flashLightT=0.06}}
function impact(pos,n=6,col=[1,.75,.4]){for(let i=0;i<n;i++)sparks.emit(pos.x,pos.y,pos.z,rr(-2.5,2.5),rr(0.5,3.5),rr(-2.5,2.5),{life:rr(.2,.5),size:0.06,a:1,c0:col,c1:[0.6,0.2,0.05],fall:9});
  for(let i=0;i<3;i++)dustB.emit(pos.x,pos.y,pos.z,rr(-.6,.6),rr(.2,1),rr(-.6,.6),{life:rr(.5,1.0),size:.4,grow:2.5,a:0.35,c0:[.55,.45,.35],c1:[.5,.42,.34]})}
const _wp=new THREE.Vector3(),_wp2=new THREE.Vector3(),_dir=new THREE.Vector3();
function gunMuzzle(H,out){H.muzzle.getWorldPosition(out);return out}

// ============================================================ ray casting against the world (analytic, no stepping on colliders)
function rayBox(o,d,b,maxT,hTop){ // b=[x0,z0,x1,z1]; vertical extent 0..hTop (from terrain 0 assumed ~ y0)
  if(b[0]>1e5)return null;let t0=0,t1=maxT;
  for(const [oo,dd,lo,hi] of[[o.x,d.x,b[0],b[2]],[o.z,d.z,b[1],b[3]]]){
    if(Math.abs(dd)<1e-9){if(oo<lo||oo>hi)return null}else{let a=(lo-oo)/dd,c=(hi-oo)/dd;if(a>c){const t=a;a=c;c=t}t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1)return null}}
  const y=o.y+d.y*t0;if(y>hTop||y<-1)return null;return t0}
function rayCircle(o,d,c,maxT,hTop){
  const dx=o.x-c[0],dz=o.z-c[1],a=d.x*d.x+d.z*d.z;if(a<1e-9)return null;const bq=dx*d.x+dz*d.z,cq=dx*dx+dz*dz-c[2]*c[2];const disc=bq*bq-a*cq;if(disc<0)return null;
  const t=(-bq-Math.sqrt(disc))/a;if(t<0||t>maxT)return null;const y=o.y+d.y*t;if(y>hTop)return null;return t}
const _hit={t:0,kind:'',nx:0,ny:1,nz:0,ent:null,part:'',x:0,y:0,z:0};
function castRay(o,d,maxT,{skip=0,ignore=null,ents=true}={}){
  // returns _hit or null. Terrain, circles, boxes, enemies.
  let bt=maxT,kind='',nx=0,ny=1,nz=0,ent=null,part='';
  // terrain march (coarse, then bisect)
  let tp=skip,step=1.5;let prevAbove=true;
  for(let t=Math.max(skip,0.5);t<=bt;t+=step){const y=o.y+d.y*t;const gy=terrainH(o.x+d.x*t,o.z+d.z*t);
    if(y<gy){let a=Math.max(skip,t-step),b2=t;for(let i=0;i<6;i++){const m=(a+b2)/2;if(o.y+d.y*m<terrainH(o.x+d.x*m,o.z+d.z*m))b2=m;else a=m}bt=b2;kind='ground';nx=0;ny=1;nz=0;break}
    step=Math.min(6,1.2+t*0.04)}
  const px0=o.x+d.x*bt,pz0=o.z+d.z*bt;
  for(const c of circles){ // cheap cull: distance from ray's xz segment
    const dx=c[0]-o.x,dz=c[1]-o.z;if(dx*dx+dz*dz>(bt+c[2]+1)**2)continue;
    const t=rayCircle(o,d,c,bt,3.2);if(t!==null&&t>=skip&&t<bt){bt=t;kind='wall';const hx=o.x+d.x*t-c[0],hz=o.z+d.z*t-c[1],l=Math.hypot(hx,hz)||1;nx=hx/l;ny=0;nz=hz/l}}
  for(const b of boxes){
    if(b[0]>1e5)continue;const cx=(b[0]+b[2])/2,cz=(b[1]+b[3])/2;const rad=Math.hypot(b[2]-b[0],b[3]-b[1])/2;const dx=cx-o.x,dz=cz-o.z;if(dx*dx+dz*dz>(bt+rad+1)**2)continue;
    const t=rayBox(o,d,b,bt,WALLH);if(t!==null&&t>=skip&&t<bt){bt=t;kind='wall';
      const hx=o.x+d.x*t,hz=o.z+d.z*t;const e0=Math.abs(hx-b[0]),e1=Math.abs(hx-b[2]),e2=Math.abs(hz-b[1]),e3=Math.abs(hz-b[3]);const m=Math.min(e0,e1,e2,e3);
      nx=nz=0;ny=0;if(m===e0)nx=-1;else if(m===e1)nx=1;else if(m===e2)nz=-1;else nz=1}}
  if(ents){
    for(const r of raiders){if(r.dead||r===ignore||!r.H.root.visible)continue;
      const h=r.type==='dog'?{hr:0.0,top:0.8,rad:0.42,y0:0.1}:{hr:0.15,top:(r.H.crouch?1.1:1.55),rad:0.3,y0:0.05};
      const ox=r.x-o.x,oz=r.z-o.z;if(ox*ox+oz*oz>(bt+2)**2)continue;
      // body: vertical capsule approximated as xz-circle test with y range
      const a=d.x*d.x+d.z*d.z;if(a>1e-9){const bq=(o.x-r.x)*d.x+(o.z-r.z)*d.z,cq=(o.x-r.x)**2+(o.z-r.z)**2-h.rad*h.rad,disc=bq*bq-a*cq;
        if(disc>=0){const t=(-bq-Math.sqrt(disc))/a;const y=o.y+d.y*t-r.y;if(t>=skip&&t<bt&&y>h.y0&&y<h.top+(h.hr?0.0:0)){
          // head?
          const headY=r.type==='dog'?9:(r.H.crouch?1.28:1.62);const isHead=h.hr>0&&y>headY-0.2;
          bt=t;kind='ent';ent=r;part=isHead?'head':(y<0.75?'leg':'body')}}}}
  }
  if(!kind)return null;
  _hit.t=bt;_hit.kind=kind;_hit.nx=nx;_hit.ny=ny;_hit.nz=nz;_hit.ent=ent;_hit.part=part;_hit.x=o.x+d.x*bt;_hit.y=o.y+d.y*bt;_hit.z=o.z+d.z*bt;return _hit;
}
function losClear(x0,y0,z0,x1,y1,z1){ // line of sight against boxes and circles only
  _v1.set(x1-x0,y1-y0,z1-z0);const L=_v1.length();if(L<0.1)return true;_v1.multiplyScalar(1/L);
  const o={x:x0,y:y0,z:z0};
  for(const c of circles){const dx=c[0]-x0,dz=c[1]-z0;if(dx*dx+dz*dz>(L+c[2])**2)continue;const t=rayCircle(o,_v1,c,L,3.0);if(t!==null)return false}
  for(const b of boxes){if(b[0]>1e5)continue;const cx=(b[0]+b[2])/2,cz=(b[1]+b[3])/2,rad=Math.hypot(b[2]-b[0],b[3]-b[1])/2;const dx=cx-x0,dz=cz-z0;if(dx*dx+dz*dz>(L+rad)**2)continue;if(rayBox(o,_v1,b,L,WALLH)!==null)return false}
  return true}

// ============================================================ audio hooks / noise
function makeNoise(x,z,radius){for(const r of raiders){if(r.dead||r.type==='dog'&&0)continue;const d=Math.hypot(r.x-x,r.z-z);if(d<radius)hearNoise(r,x,z,d/radius)}}
function hearNoise(r,x,z,k){if(r.state==='idle'||r.state==='patrol'||r.state==='search'){r.state='suspicious';r.susT=0;r.lastX=x;r.lastZ=z;r.alertT=10;if(k<0.5)r.susT=1.2}}

// ============================================================ player damage / death
function damagePlayer(n,fromX,fromZ,part){
  if(P.dead)return;
  let dr=0;if(inv.vest)dr+=ITEMS[inv.vest].dr||0;if(part==='head'&&inv.helmet)dr+=ITEMS[inv.helmet].hdr||0;
  n=Math.max(1,n*(1-Math.min(0.7,dr)));
  P.hp=Math.max(0,P.hp-n);P.hurtT=0.5;P.lastHurt=0;cam.shake=Math.min(1,cam.shake+n*0.04);
  if(fromX!==undefined){P.dmgFrom={x:fromX,z:fromZ,t:1.2};addDmgDir(fromX,fromZ)}
  if(P.searching){cancelSearch('Interrupted')}
  audio.hurt();vibe(n>15?[30,30,40]:25);
  if(P.hp<=0){P.dead=true;P.deadT=0;el.wasted.classList.add('show');hero.dead=0.01;if(P.inCar)exitCar(true);closeAllWindows();hero.root.visible=true}
}

// ============================================================ weapon handling
function stanceEye(){return P.stance===2?0.5:(P.stance===1?1.15:1.62)}
const fovBase=()=>(MOBILE&&innerWidth/innerHeight<0.8)?72:(innerWidth/innerHeight<1.5?66:60);
function wstats(){const i=curInst();return i?weaponStats(i):null}
function reloadStart(){
  const i=curInst();if(!i||P.reloadT>0||P.dead||P.inCar)return;const w=weaponStats(i),b=WEAPONS[i.wid];if(b.slot>2)return;
  if(i.mag>=w.mag){feed('Magazine full');return}
  const have=inv.ammoCount(b.cal);if(have<=0){feed('No '+b.cal+' ammo');audio.ui('error');return}
  // choose ammo: if mag has a different type and is empty, adopt preferred
  const ids=inv.ammoFor(b.cal);if(i.mag===0||!i.ammoId||!ids.includes(i.ammoId))i.ammoId=ids[0];
  P.reloadT=b.perShell?0.5:w.reload;P.reloadDur=P.reloadT;P.reloadSt=0;P.reloadShell=!!b.perShell;hero.reloading=true;P.autoReload=false;
  IN.ads=false;audio.reload(0,b.snd);vmS.kick=0.4;
}
function reloadFinish(){
  const i=curInst();hero.reloading=false;if(!i)return;const w=weaponStats(i),b=WEAPONS[i.wid];
  if(b.perShell){ // one shell at a time
    if(i.mag<w.mag&&inv.ammoCount(b.cal)>0){inv.takeAmmo(b.cal,1);i.mag++;audio.reload(2,b.snd);
      if(i.mag<w.mag&&inv.ammoCount(b.cal)>0&&!IN.fire){P.reloadT=0.5;P.reloadDur=0.5;hero.reloading=true;return}}
    return}
  const need=w.mag-i.mag,take=inv.takeAmmo(b.cal,need);i.mag+=take;audio.reload(2,b.snd);
}
const _camDir=new THREE.Vector3(),_ro=new THREE.Vector3(),_rd=new THREE.Vector3(),_sp=new THREE.Vector3();
function playerFire(){
  const i=curInst();if(!i||P.dead||P.inCar||P.swapT>0||P.busy>0)return;
  const b=WEAPONS[i.wid],w=weaponStats(i);
  if(b.slot===3){playerMelee(true);return}
  if(P.fireCd>0||P.reloadT>0)return;
  if(i.mag<=0){audio.dryClick();P.fireCd=0.3;if(inv.ammoCount(b.cal)>0)reloadStart();else feed('Out of ammo');return}
  if(w.jam&&Math.random()<w.jam){audio.dryClick();P.fireCd=0.8;feed('Weapon jammed');return}
  i.mag--;P.fireCd=w.rate;i.cond=Math.max(0,(i.cond??100)-0.045*(b.pellets?2:1));
  hero.shoot();hero.aimKick=0.12;
  camera.updateMatrixWorld();camera.getWorldDirection(_camDir);
  const fp=P.view==='fp'||P.scoped;
  _ro.copy(camera.position);
  // spread: base * (ads / moving / stance), plus bloom from sustained fire
  const mv=clamp(P.speed/5,0,1.4);
  let spr=w.spread*(IN.ads?0.45:1)*(1+mv*(IN.ads?0.8:1.6))*(P.stance===1?0.7:P.stance===2?0.5:1)*(P.grounded?1:2.5)+P.bloom*0.012;
  const am=ITEMS[i.ammoId]||{};const pellets=w.pellets||1;
  const muz=vmS.wid&&fp?vmS.mz.getWorldPosition(_wp2):gunMuzzle(hero,_wp2);
  const muzP=muz.clone();let anyHead=false,anyHit=false,killed=false;
  for(let k=0;k<pellets;k++){
    _rd.copy(_camDir);_rd.x+=(Math.random()-.5)*2*spr;_rd.y+=(Math.random()-.5)*2*spr;_rd.z+=(Math.random()-.5)*2*spr;_rd.normalize();
    const skip=fp?0.3:Math.max(0.2,camera.position.distanceTo(_v1.set(P.x,camera.position.y,P.z))-0.2);
    const h=castRay(_ro,_rd,w.range,{skip,ents:true});
    let end;
    if(h){end=new THREE.Vector3(h.x,h.y,h.z);
      if(h.kind==='ent'){const r=h.ent;const head=h.part==='head';let dmg=w.dmg*(head?2.4:(h.part==='leg'?0.7:1))*(1-0.5*clamp((h.t-w.range*0.5)/(w.range*0.5),0,1)*(w.pellets?1:0.4));
          if(r.armor&&!head)dmg*=0.8;if(am.pen&&r.armor)dmg*=1.2;
          audio.impact('flesh',end.x,end.z);const was=r.hp;hitEnemy(r,dmg,end,head,_rd);anyHit=true;anyHead=anyHead||head;if(r.dead&&was>0)killed=true}
      else{audio.impact(h.kind==='ground'?'dirt':(Math.random()<0.35?'metal':'concrete'),end.x,end.z);if(h.kind==='ground'){impact(end,4,[0.8,0.7,0.5])}else impact(end,5);addDecal(end,_v2.set(h.nx,h.ny,h.nz),h.kind==='ground'?0.22:0.16,0x050505)}}
    else end=_ro.clone().addScaledVector(_rd,Math.min(w.range,120));
    if(k<Math.min(pellets,3))tracer(muzP,end,w.silent?0.0:(pellets>1?0.6:1.0));
  }
  if(anyHit){hitmarkT=0.18;hitKind=killed?'kill':(anyHead?'head':'body');audio.hit(hitKind);if(anyHead)feed('HEADSHOT','#ff8a50')}
  // effects
  const loud=!w.supp&&!w.silent;
  if(!w.silent){if(loud)muzzleFlash(muzP,(w.kind==='pistol'?0.5:0.8)*(w.pellets?1.3:1),true);else muzzleFlash(muzP,0.18,false)}
  xhKick=Math.min(1.6,xhKick+(pellets>1?0.9:0.55));vibe(pellets>1?24:(b.auto?9:15));
  {const _wi=curInst().wid;audio.shot(w.snd==='bow'||w.silent?'bow':w.snd,{supp:w.supp,rack:!!WEAPONS[_wi].perShell,bolt:_wi==='sniper'||_wi==='hunt'})}
  makeNoise(P.x,P.z,w.silent?6:(w.supp?22:85));
  if(!w.silent){const side=_v1.set(Math.cos(P.yaw),0,-Math.sin(P.yaw));ejectShell(muzP.clone().addScaledVector(_rd,-0.35),side)}
  // recoil: camera kick (accumulates, recovers) + view-model kick
  const rc=w.recoil*(IN.ads?0.7:1);P.rcl+=rc;cam.tpitch-=rc*0.0068*(0.7+Math.random()*0.6);cam.tyaw+=(Math.random()-.5)*rc*0.0058;cam.shake=Math.min(1,cam.shake+0.04*rc);
  P.bloom=Math.min(4,P.bloom+(b.auto?0.4:0.6)*rc*0.5);vmS.kick=Math.min(1.4,vmS.kick+0.35+rc*0.08);vmS.kickR=(Math.random()-.5)*0.05;
  P.lastShot=gameT;
  if(i.mag===0&&b.auto===false&&inv.ammoCount(b.cal)>0&&!b.perShell&&false)reloadStart();
}
// ---------------------------------------------------------------- melee
function playerMelee(fromFire=false){
  if(P.swingCool>0||P.dead||P.inCar)return;
  const mi=inv.slots[3];const cur=curInst();const useCur=cur&&WEAPONS[cur.wid].slot===3;
  const b=useCur?WEAPONS[cur.wid]:(mi?WEAPONS[mi.wid]:null);
  P.meleeW=b||{id:'fist',dmg:14,reach:1.9,rate:0.6,swing:1.2,melee:'Punch_Cross',silent:true};
  P.swingT=0.55;P.swingCool=P.meleeW.rate;P.hitDone=false;hero.swingKey=useCur?(b.melee||'Sword_Attack'):(b?(b.melee||'Sword_Attack'):'Punch_Cross');
  if(!useCur&&!b){} audio.swing();
  if(P.stance>0&&P.stance!==1){}
}
function meleeHitCheck(){
  const b=P.meleeW;const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);let best=null,bd=1e9;
  for(const r of raiders){if(r.dead)continue;const dx=r.x-P.x,dz=r.z-P.z,d=Math.hypot(dx,dz);if(d>b.reach+0.4||d<0.05)continue;const c=(dx*fx+dz*fz)/d;if(c<0.25)continue;if(d<bd){bd=d;best=r}}
  if(best){const r=best;const dir=_v1.set(fx,0,fz);hitEnemy(r,b.dmg*(P.stance===1?1:1)*(r.sleepy?2:1),new THREE.Vector3(r.x,r.y+1.2,r.z),false,dir);r.kb=[fx*5,fz*5];cam.shake=Math.min(1,cam.shake+0.2);audio.meleeHit(true);hitmarkT=0.18}
  else{impact(new THREE.Vector3(P.x+fx*1.2,P.y+0.5,P.z+fz*1.2),2,[0.8,0.7,0.6]);audio.swing()}
  makeNoise(P.x,P.z,b.silent?5:14);
}
// ---------------------------------------------------------------- throwables
const PROJ=[];const PROJ_N=6;
{const gm=new THREE.MeshStandardMaterial({color:0x4b4f3a,roughness:0.6,metalness:0.5}),mm2=new THREE.MeshStandardMaterial({color:0x3f5a30,roughness:0.3,metalness:0.1});
 for(let i=0;i<PROJ_N;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6),gm);m.visible=false;m.castShadow=false;scene.add(m);PROJ.push({m,gm,mm2,on:false,p:new THREE.Vector3(),v:new THREE.Vector3(),t:0,kind:'grenade'})}}
const fireZones=[];
function throwThing(){
  if(P.throwT>0||P.dead||P.inCar)return;
  let id=inv.slots[4];if(!id||inv.count(id)<=0)id=['grenade','molotov'].find(x=>inv.count(x)>0);
  if(!id){feed('No throwables');audio.ui('error');return}
  const slot=PROJ.find(p=>!p.on);if(!slot)return;inv.remove(id,1);if(inv.count(id)<=0&&inv.slots[4]===id)inv.slots[4]=null;
  P.throwT=0.8;hero.actKey='Punch_Cross';hero.actT=0.45;hero.actTs=1.4;hero.actFresh=true;
  camera.getWorldDirection(_camDir);const d=_camDir.clone();d.y=Math.max(d.y,-0.1)+0.28;d.normalize();
  const from=new THREE.Vector3(P.x+Math.sin(P.yaw)*0.4,P.y+1.5,P.z+Math.cos(P.yaw)*0.4);if(P.view==='fp')from.copy(camera.position).addScaledVector(_camDir,0.5);
  slot.on=true;slot.kind=id;slot.p.copy(from);slot.v.copy(d).multiplyScalar(id==='molotov'?15:16);slot.t=id==='grenade'?WEAPONS.grenade.fuse:6;slot.m.visible=true;slot.m.material=id==='molotov'?slot.mm2:slot.gm;slot.m.scale.setScalar(id==='molotov'?1.4:1);
  audio.swing();refreshSlotsUI();
}
function updateProjectiles(dt){
  for(const p of PROJ){if(!p.on)continue;p.t-=dt;p.v.y-=9.8*dt;const np=_v1.copy(p.p).addScaledVector(p.v,dt);
    let boom=false;const gy=terrainH(np.x,np.z)+0.06;
    if(np.y<gy){np.y=gy;p.v.y*=-0.35;p.v.x*=0.6;p.v.z*=0.6;if(p.kind==='molotov')boom=true;else audio.thud(0.06)}
    const tst={x:np.x,z:np.z};if(np.y<WALLH&&resolveCircle(tst,0.08)){p.v.x*=-0.3;p.v.z*=-0.3;np.x=p.p.x;np.z=p.p.z;if(p.kind==='molotov')boom=true}
    if(p.kind==='molotov')for(const r of raiders)if(!r.dead&&Math.hypot(r.x-np.x,r.z-np.z)<0.8&&np.y<r.y+1.8)boom=true;
    p.p.copy(np);p.m.position.copy(p.p);
    if(boom||(p.kind==='grenade'&&p.t<=0)){p.on=false;p.m.visible=false;explode(p.p,p.kind)}}
}
function explode(pos,kind){
  const W=WEAPONS[kind];const d0=Math.hypot(pos.x-P.x,pos.z-P.z);
  if(kind==='grenade'){
    audio.explode(d0,pos.x,pos.z);impact(pos,18,[1,.8,.4]);for(let i=0;i<10;i++)smokeB(pos);cam.shake=Math.min(1,cam.shake+clamp(1-d0/30,0,0.9));
    for(const r of raiders){if(r.dead)continue;const d=Math.hypot(r.x-pos.x,r.z-pos.z);if(d<W.radius&&losClear(pos.x,pos.y+0.3,pos.z,r.x,r.y+1,r.z)){hitEnemy(r,W.dmg*(1-d/W.radius)**0.8,new THREE.Vector3(r.x,r.y+1,r.z),false,_v1.set(r.x-pos.x,0,r.z-pos.z).normalize());r.kb=[(r.x-pos.x)/Math.max(d,0.5)*8,(r.z-pos.z)/Math.max(d,0.5)*8]}}
    if(d0<W.radius&&losClear(pos.x,pos.y+0.3,pos.z,P.x,P.y+1,P.z))damagePlayer(W.dmg*0.6*(1-d0/W.radius),pos.x,pos.z);
    addDecal(_v2.set(pos.x,terrainH(pos.x,pos.z),pos.z),_v1.set(0,1,0),2.2,0x030303);
    makeNoise(pos.x,pos.z,95);
  }else{
    audio.explode(d0*2,pos.x,pos.z);impact(pos,10,[1,.5,.2]);fireZones.push({x:pos.x,z:pos.z,t:W.fire,r:W.radius,tick:0});if(fireZones.length>4)fireZones.shift();makeNoise(pos.x,pos.z,40);
    addDecal(_v2.set(pos.x,terrainH(pos.x,pos.z),pos.z),_v1.set(0,1,0),2.6,0x120804);
  }
}
function smokeB(pos){dustB.emit(pos.x+rr(-1,1),pos.y+rr(0,1),pos.z+rr(-1,1),rr(-1.5,1.5),rr(0.5,3),rr(-1.5,1.5),{life:rr(.8,1.6),size:1.1,grow:3,a:0.5,c0:[.3,.28,.26],c1:[.2,.19,.18]})}
function updateFire(dt){
  for(let i=fireZones.length-1;i>=0;i--){const f=fireZones[i];f.t-=dt;if(f.t<=0){fireZones.splice(i,1);continue}
    if(Math.random()<dt*40)sparks.emit(f.x+rr(-f.r,f.r)*0.8,terrainH(f.x,f.z)+0.15,f.z+rr(-f.r,f.r)*0.8,rr(-.3,.3),rr(1,2.8),rr(-.3,.3),{life:rr(.35,.7),size:0.34,a:0.8,c0:[1,.62,.18],c1:[.7,.12,.02],fall:-1.2,grow:0.8});
    if(Math.random()<dt*10)dustB.emit(f.x+rr(-1,1),terrainH(f.x,f.z)+0.7,f.z+rr(-1,1),rr(-.2,.4),rr(1,2),rr(-.2,.3),{life:rr(1,1.8),size:0.9,grow:3,a:0.3,c0:[.2,.18,.16],c1:[.15,.14,.13]});
    f.tick-=dt;if(f.tick<=0){f.tick=0.4;
      for(const r of raiders)if(!r.dead&&Math.hypot(r.x-f.x,r.z-f.z)<f.r)hitEnemy(r,WEAPONS.molotov.dmg*(r.type==='dog'?1.2:1),new THREE.Vector3(r.x,r.y+1,r.z),false,_v1.set(0,0,1),true);
      if(!P.dead&&Math.hypot(P.x-f.x,P.z-f.z)<f.r&&P.y<0.8+terrainH(P.x,P.z))damagePlayer(5,f.x,f.z)}}
}

// pickups
const pickup={obj:new THREE.Group(),active:true};
{ pickup.obj.position.set(PART.x+2.2,PART.y,PART.z-1.4);
  const crate=new THREE.Mesh(RB(0.55,0.4,0.4,0.04),new THREE.MeshStandardMaterial({color:0x6a7a4a,roughness:0.7,metalness:0.4}));crate.position.y=0.25;crate.castShadow=true;pickup.obj.add(crate);
  const lid=new THREE.Mesh(RB(0.5,0.05,0.35,0.01),new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:0.5,metalness:0.7}));lid.position.y=0.47;pickup.obj.add(lid);
  const led=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.04,0.02),new THREE.MeshBasicMaterial({color:new THREE.Color(0.2,3,0.8),toneMapped:false}));led.position.set(0.15,0.3,0.21);pickup.obj.add(led);
  const bm=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.55,70,10,1,true),new THREE.MeshBasicMaterial({color:0xffc060,transparent:true,opacity:0.12,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));bm.position.y=35;pickup.obj.add(bm);pickup.beam=bm;
  ents.add(pickup.obj)}
// mission target markers
const mMarker=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.7,60,10,1,true),new THREE.MeshBasicMaterial({color:0x6ad4ff,transparent:true,opacity:0.1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
mMarker.visible=false;scene.add(mMarker);

// ============================================================ v5 : enemies (raiders, scavengers, feral dogs) with alert states, cover, flanking
const raiders=[];                       // all hostile / wary actors (name kept for the old debug API)
const ET={ // enemy archetypes
  raider:{hp:70,speed:3.6,vis:40,melee:false},
  brute:{hp:110,speed:3.2,vis:34,melee:false,armor:true},
  scav:{hp:50,speed:3.2,vis:30,melee:false,wary:true},
  dog:{hp:42,speed:7.2,vis:34,melee:true}
};
function dogModel(){
  const g=new THREE.Group();const fur=new THREE.MeshStandardMaterial({color:0x5c4c3c,roughness:0.95,metalness:0,flatShading:true}),dk=new THREE.MeshStandardMaterial({color:0x2c231c,roughness:1}),eye=new THREE.MeshBasicMaterial({color:new THREE.Color(3,0.3,0.15),toneMapped:false});
  const body=new THREE.Mesh(mergeGeometries([new THREE.SphereGeometry(0.3,8,6).scale(1.0,0.8,2.0).translate(0,0.62,0),new THREE.SphereGeometry(0.24,7,6).scale(1,0.95,1).translate(0,0.72,0.5),
     new THREE.ConeGeometry(0.07,0.2,5).rotateX(Math.PI/2).translate(0.1,0.98,0.7),new THREE.ConeGeometry(0.07,0.2,5).rotateX(Math.PI/2).translate(-0.1,0.98,0.7)].map(x=>x.toNonIndexed())),fur);
  const snout=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.12,0.3),dk);snout.position.set(0,0.64,0.82);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.03,0.02),eye);e1.position.set(0.08,0.8,0.8);const e2=e1.clone();e2.position.x=-0.08;
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.045,0.5,5),fur);tail.position.set(0,0.78,-0.62);tail.rotation.x=-0.9;
  const spine=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.1,0.8),dk);spine.position.set(0,0.88,-0.05);
  g.add(body,snout,e1,e2,tail,spine);body.castShadow=!MOBILE;
  const legs=[];for(const [x,z] of[[0.16,0.38],[-0.16,0.38],[0.16,-0.38],[-0.16,-0.38]]){const p=new THREE.Group();p.position.set(x,0.5,z);const l=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.035,0.55,5),fur);l.position.y=-0.26;p.add(l);g.add(p);legs.push(p)}
  g.scale.setScalar(1.12);return {g,legs,tail,body};
}
function spawnEnemy(x,z,o={}){
  const type=o.type||'raider',T=ET[type];let H;
  if(type==='dog'){const dm=dogModel();H={root:dm.g,dm,glb:false,speed:0,aim:0,swing:0,dead:0,weapon:null,crouch:0,isDog:true,hit(){},shoot(){}};dm.g.position.set(x,terrainH(x,z),z);ents.add(dm.g)}
  else{
    const sc=type==='scav';
    H=createHuman(sc?{...randLook({hat:pick(['wide','cap','hood','beanie']),pack:true}),pal:pick([{shirt:0x5a5a42,pants:0x4a4438,jacket:0x4a4e38},{shirt:0x6a5a46,pants:0x3a3e44,jacket:0x4e4234}]),female:R()<0.3,cls:'npc',holster:false}:
      {...randLook({hat:pick(['hood','beanie','helmet','hair'])}),pal:pick([{shirt:0x3a2a2a,pants:0x2a2a2a,jacket:0x2e2a26},{shirt:0x4a3a2a,pants:0x30302c,jacket:0x1e2024},{shirt:0x5a2a22,pants:0x2a2c30,jacket:0x2a2a22}]),mask:pick([0x2a2a2a,0x6a2f2a,0x3a3a30]),pack:false,scarf:R()<0.6?0x5a2a22:0,holster:true,cls:'raider',female:false,pads:R()<0.5?0x3a3a34:0,vest:type==='brute'||R()<0.5,longSleeve:R()<0.5,...(type==='brute'?{scale:1.07,wscale:1.12}:{})});
    H.root.position.set(x,terrainH(x,z),z);ents.add(H.root);H.stanceWide=true;
    giveFoeGun(H,o.weapon||'m9');
  }
  const spr=new THREE.Sprite(alertMats['?']);spr.scale.setScalar(0.55);spr.visible=false;spr.renderOrder=11;scene.add(spr);
  const r={H,type,x,z,y:terrainH(x,z),yaw:R()*6.28,hp:T.hp*(o.hpK||1),hpMax:T.hp*(o.hpK||1),state:'idle',home:[x,z],cd:1+R()*2,t:0,melee:type==='dog'||(WEAPONS[o.weapon]||{}).kind==='melee',alertT:0,strafe:R()<.5?1:-1,strafeT:0,dead:false,deadT:0,flash:0,speed:0,id:raiders.length,
    wid:o.weapon,armor:T.armor||type==='raider'&&R()<0.3,spr,susT:0,lastX:x,lastZ:z,lookT:0,cover:null,coverT:0,flankT:0,role:o.role||pick(['gunner','gunner','flanker']),mag:0,spot:0,pack:o.pack||null,group:o.group||0,
    hostile:type!=='scav',tipped:false,seenT:0,leashR:o.leash||40,aggro:0};
  r.mag=(WEAPONS[o.weapon]||{}).mag||0;
  if(type==='scav'){r.state='idle';r.hostile=false}
  raiders.push(r);return r;
}
function enemyDmgK(r){return r.wid==='pump'||r.wid==='dbl'?1:(r.wid==='ak'||r.wid==='br'?0.35:0.28)}
function alertIcon(r,k){if(!k){r.spr.visible=false;return}r.spr.material=alertMats[k];r.spr.visible=true;r.spr.position.set(r.x,r.y+(r.type==='dog'?1.5:2.35),r.z)}
function killEnemy(r,byCar=false,headshot=false){
  r.dead=true;r.deadT=0;r.state='dead';r.spr.visible=false;P.kills++;
  P.wanted=Math.min(3,P.wanted+(r.hostile?0.4:1.0));P.wantedT=40;if(P.rep<10&&r.hostile)P.rep+=0.2;if(!r.hostile)P.rep=Math.max(0,P.rep-0.5);
  feed(r.type==='dog'?'Feral dog down':'Enemy down'+(headshot?' · headshot':''),'#ff8a60');
  r.H.hit&&0;
  if(r.type==='dog'){ if(Math.random()<0.7){const c=addCont('body',r.x,r.z,r.yaw,{noMesh:true,solid:false,y:r.y+0.2,tbl:'none',name:'Feral dog carcass',rad:1.9});c.items=[{id:'raw_meat',n:1+Math.floor(Math.random()*2)}];c.follow=r}
  }else{
    const c=addCont('body',r.x,r.z,r.yaw,{noMesh:true,solid:false,y:r.y+0.2,tbl:'raider',name:r.type==='scav'?'Dead scavenger':'Dead raider',rad:1.9});c.follow=r;
    const items=rollLoot('raider',Math.random,foundNotes);
    if(r.wid&&WEAPONS[r.wid]&&r.wid!=='knife'&&Math.random()<0.5)items.push({id:'w_'+r.wid,n:1,inst:mkInst(r.wid,{mag:Math.floor(r.mag*Math.random()*0.6),cond:35+Math.floor(Math.random()*50)})});
    if(r.type==='brute'&&Math.random()<0.5)items.push({id:'vest_l',n:1});
    if(r.hasKey)items.push({id:'key_garage',n:1});
    c.items=items;
  }
  if(r.group)checkMissionKill(r);
}
function hitEnemy(r,dmg,hp,head,dir,fire){
  if(r.dead)return;r.hp-=dmg;r.flash=0.12;if(r.H.glb&&!fire)r.H.hit();
  if(r.state!=='attack'){r.state='attack';r.alertT=22;r.seenT=0}r.aggro=1;r.lastX=P.x;r.lastZ=P.z;
  if(r.type==='scav'&&!r.hostile){r.hostile=true;feed('The scavenger fights back')}
  for(let i=0;i<5;i++)sparks.emit(hp.x,hp.y,hp.z,rr(-1.5,1.5)+(dir?dir.x*1.5:0),rr(0,2.5),rr(-1.5,1.5)+(dir?dir.z*1.5:0),{life:rr(.25,.5),size:0.07,a:1,c0:[0.8,0.1,0.06],c1:[0.3,0.02,0.02],fall:8});
  if(r.hp<=0)killEnemy(r,false,head);
  // alert friends
  for(const o of raiders)if(!o.dead&&o!==r&&o.hostile&&Math.hypot(o.x-r.x,o.z-r.z)<28&&o.state!=='attack'){o.state='attack';o.alertT=18;o.lastX=P.x;o.lastZ=P.z}
}
// ---------------------------------------------------------------- cover search (from circles/boxes near the enemy)
function findCover(r,px,pz){
  let best=null,bd=1e9;
  const test=(cx,cz,rad)=>{const dx=cx-px,dz=cz-pz,l=Math.hypot(dx,dz)||1;const bx=cx+dx/l*(rad+0.7),bz=cz+dz/l*(rad+0.7);
    const d0=Math.hypot(bx-r.x,bz-r.z);if(d0>22||d0<0.6)return;if(Math.hypot(bx-px,bz-pz)<6)return;
    const dp=Math.hypot(bx-px,bz-pz);if(dp>(WEAPONS[r.wid]||{range:40}).range*0.8)return;
    if(d0<bd&&!losClear(px,P.y+1.4,pz,bx,terrainH(bx,bz)+1.1,bz)){bd=d0;best=[bx,bz,cx,cz,rad]}};
  for(const c of circles){if(c[2]<0.3||c[2]>6)continue;if((c[0]-r.x)**2+(c[1]-r.z)**2>26*26)continue;test(c[0],c[1],c[2])}
  for(const b of boxes){if(b[0]>1e5)continue;const w=b[2]-b[0],d=b[3]-b[1];if(w*d<0.4)continue;if(((b[0]+b[2])/2-r.x)**2+((b[1]+b[3])/2-r.z)**2>26*26)continue;test((b[0]+b[2])/2,(b[1]+b[3])/2,Math.max(w,d)/2)}
  return best;
}
function moveEnemy(r,tx,tz,sp,dt){const dx=tx-r.x,dz=tz-r.z,d=Math.hypot(dx,dz);if(d<0.15)return 0;const k=Math.min(1,sp*dt/d);
  const ox=r.x,oz=r.z;r.x+=dx*k;r.z+=dz*k;if(resolveCircle(r,r.type==='dog'?0.45:0.4)){ // slide: nudge sideways when blocked
    r.x=ox+(r.x-ox)*0.5;r.z=oz+(r.z-oz)*0.5;r.blockT=(r.blockT||0)+dt;if(r.blockT>0.5){r.blockT=0;r.strafe*=-1;r.wob=(r.wob||0)+1}}else r.blockT=0;
  return sp}
function enemyShoot(r,d){
  const H=r.H,w=WEAPONS[r.wid]||WEAPONS.m9;
  if(r.mag<=0){r.cd=w.reload||2;r.mag=w.mag;H.reloading=true;setTimeout(()=>{H.reloading=false},900);return}
  r.mag--;if(H.glb)H.shoot();
  const muz=gunMuzzle(H,new THREE.Vector3());const loud=!w.silent;
  if(loud)muzzleFlash(muz,w.pellets?0.9:0.55,d<45);
  const night=nightK();
  let acc=clamp((w.pellets?1-d/(w.range*0.9):0.62-d/(w.range*1.6)),0.08,0.82)*(P.inCar?0.5:1)*(P.stance===2?0.55:P.stance===1?0.75:1)*(IN.ads?0.9:1)*(1-0.25*night);
  if(r.state==='attack'&&r.coverT>0&&r.peek<=0)acc*=0.8;
  const end=new THREE.Vector3(P.x,P.y+(P.stance===2?0.4:P.stance===1?0.9:1.25),P.z);
  const hit=Math.random()<acc;
  if(!hit){end.x+=rr(-2,2);end.y+=rr(-0.8,0.6);end.z+=rr(-2,2)}
  tracer(muz,end,0.8);audio.shot(w.snd==='bow'?'bow':w.snd,{dist:d,x:r.x,z:r.z});
  r.cd=w.auto?rr(0.12,0.32):rr(0.7,1.5)*(r.wid==='pump'?1.4:1);if(w.auto&&Math.random()<0.4){r.burst=(r.burst||0)+1;if(r.burst>=3+Math.floor(Math.random()*3)){r.burst=0;r.cd=rr(1.0,1.9)}}
  if(hit){const dmg=(w.dmg*(w.pellets||1)*0.55)*enemyDmgK(r)*(w.pellets?clamp(1-d/w.range,0.15,1):1);damagePlayer(Math.max(3,dmg),r.x,r.z,Math.random()<0.12?'head':'body')}
  else if(Math.random()<0.5)impact(new THREE.Vector3(end.x,terrainH(end.x,end.z)+0.05,end.z),3);
}
function enemyVisionOK(r,dist){
  if(P.dead)return false;
  const night=nightK();let range=ET[r.type].vis*(1-0.45*night)*(P.stance===1?0.62:P.stance===2?0.4:1);
  if(P.light&&night>0.3)range*=1.7;if(P.lastShot&&gameT-P.lastShot<2.5)range*=1.6;if(P.speed>5.5)range*=1.2;if(P.inCar)range*=1.3;
  if(dist>range)return false;
  const dx=P.x-r.x,dz=P.z-r.z;const fwd=Math.sin(r.yaw)*dx+Math.cos(r.yaw)*dz;if(r.state==='idle'&&dist>6&&fwd/dist<0.2)return false;   // behind them
  return losClear(r.x,r.y+1.5,r.z,P.x,P.y+(P.stance===2?0.5:1.3),P.z);
}
function updateEnemies(dt){
  for(const r of raiders){
    const H=r.H;
    if(r.dead){r.deadT+=dt;
      if(H.isDog){H.root.rotation.z=Math.min(1.5,r.deadT*4)*(r.side||1);H.root.position.set(r.x,r.y-Math.min(0.2,r.deadT*0.5),r.z);if(r.kb){r.x+=r.kb[0]*dt;r.z+=r.kb[1]*dt;r.kb[0]*=0.88;r.kb[1]*=0.88}continue}
      H.dead=Math.min(1,r.deadT*2.5);H.speed=0;H.aim=0;animateHuman(H,dt,time);if(r.kb){r.x+=r.kb[0]*dt;r.z+=r.kb[1]*dt;r.kb[0]*=0.88;r.kb[1]*=0.88}
      H.root.position.set(r.x,terrainH(r.x,r.z),r.z);continue}
    const dx=P.x-r.x,dz=P.z-r.z,d=Math.hypot(dx,dz);
    if(d>(MOBILE?170:230)&&r.state==='idle'){H.root.visible=false;r.spr.visible=false;continue}
    H.root.visible=true;
    const vis=enemyVisionOK(r,d);
    const T=ET[r.type];
    // ---- state machine: idle -> suspicious -> attack -> search -> idle ; scav: wary
    if(r.state==='idle'||r.state==='patrol'){
      if(vis&&r.hostile){r.spot+=dt*(d<12?3:1.2);if(r.spot>0.5){r.state='suspicious';r.susT=0;r.lastX=P.x;r.lastZ=P.z;r.spot=0}}
      else r.spot=Math.max(0,r.spot-dt*0.6);
      r.t-=dt;if(r.t<=0){r.t=rr(2,5);r.tx=r.home[0]+rr(-4,4);r.tz=r.home[1]+rr(-4,4)}
      r.speed=moveEnemy(r,r.tx??r.x,r.tz??r.z,r.type==='dog'?1.8:1.2,dt)*1;if((r.tx!=null)){const a=Math.atan2(r.tx-r.x,r.tz-r.z);if(r.speed>0)r.yaw+=angDiff(a,r.yaw)*Math.min(1,dt*6)}
      H.aim=Math.max(0,(H.aim||0)-dt*4);alertIcon(r,null);
      if(r.type==='scav'&&d<10&&vis&&!r.talked){/* wary stare */r.yaw+=angDiff(Math.atan2(dx,dz),r.yaw)*Math.min(1,dt*3);r.speed=0}
    }else if(r.state==='suspicious'){
      r.susT+=dt;alertIcon(r,'?');
      const want=Math.atan2(r.lastX-r.x,r.lastZ-r.z);r.yaw+=angDiff(want,r.yaw)*Math.min(1,dt*5);
      const dd=Math.hypot(r.lastX-r.x,r.lastZ-r.z);
      r.speed=dd>2.5?moveEnemy(r,r.lastX,r.lastZ,r.type==='dog'?3.2:2.0,dt):0;
      if(vis){r.lastX=P.x;r.lastZ=P.z;if(r.susT>(d<14?0.5:1.3)||r.aggro){r.state='attack';r.alertT=20;r.coverT=0;if(r.type==='dog')audio.bark(r.x,r.z);
          for(const o of raiders)if(!o.dead&&o!==r&&o.hostile&&o.state!=='attack'&&Math.hypot(o.x-r.x,o.z-r.z)<20&&(o.group===r.group)){o.state='suspicious';o.susT=0.4;o.lastX=P.x;o.lastZ=P.z}}}
      else if(r.susT>6){r.state='search';r.susT=0;r.searchT=7}
      H.aim=0;
    }else if(r.state==='search'){
      r.searchT-=dt;alertIcon(r,'?');
      if(vis&&r.hostile){r.state='attack';r.alertT=16}
      else{const dd=Math.hypot(r.lastX-r.x,r.lastZ-r.z);if(dd>1.5)r.speed=moveEnemy(r,r.lastX,r.lastZ,2.4,dt);else{r.speed=0;r.yaw+=dt*1.4}
        if(dd>1.5)r.yaw+=angDiff(Math.atan2(r.lastX-r.x,r.lastZ-r.z),r.yaw)*Math.min(1,dt*6);
        if(r.searchT<=0){r.state='idle';alertIcon(r,null);r.home=[r.x,r.z]}}
      H.aim=Math.max(0,H.aim-dt*3);
    }else if(r.state==='attack'){
      r.alertT-=dt;alertIcon(r,'!');
      if(vis){r.lastX=P.x;r.lastZ=P.z;r.seenT=0;r.alertT=Math.max(r.alertT,10)}else r.seenT+=dt;
      if(d>r.leashR+60||P.dead){r.state='idle';alertIcon(r,null)}
      else if(r.alertT<=0||(r.seenT>9&&!r.melee)){r.state='search';r.searchT=8;r.susT=0}
      else{
        const want=Math.atan2(dx,dz);r.yaw+=angDiff(want,r.yaw)*Math.min(1,dt*(r.melee?9:7));
        let sp=0;
        if(r.melee){ // dogs/pipe: charge, circle-strafe on approach
          const mvT=r.type==='dog'?7.2:4.6;
          if(d>(r.type==='dog'?1.5:1.7)){ // lunging dogs take a curved approach
            if(r.type==='dog'&&d>5){const ang=want+r.strafe*0.5*Math.min(1,(d-5)/10);sp=moveEnemy(r,r.x+Math.sin(ang)*5,r.z+Math.cos(ang)*5,mvT,dt)}
            else sp=moveEnemy(r,P.x,P.z,mvT,dt)}
          else{r.cd-=dt;if(r.cd<=0){r.cd=r.type==='dog'?0.9:1.1;H.swing=1;r.swingT=0.55;damagePlayer(P.inCar?3:(r.type==='dog'?7:10),r.x,r.z);if(r.type==='dog'){audio.bark(r.x,r.z);P.slow=0.6}}}
          H.aim=0;
        }else{
          const w=WEAPONS[r.wid]||WEAPONS.m9;const pref=w.pellets?10:(w.kind==='rifle'?20:15);
          r.coverT-=dt;r.flankT-=dt;
          // choose a plan every few seconds: take cover / flank / advance
          if(!r.plan||r.planT<=0){r.planT=rr(2.2,4.5);
            const cv=(vis||r.hp<r.hpMax*0.6)&&Math.random()<0.7?findCover(r,P.x,P.z):null;
            if(cv&&r.role!=='flanker'||cv&&r.hp<r.hpMax*0.5){r.plan='cover';r.cover=cv;r.peek=rr(1.2,2.2)}
            else if(r.role==='flanker'&&d>10){r.plan='flank';r.flankSide=Math.random()<0.5?1:-1;r.flankT=5}
            else r.plan=d>pref+8?'advance':'hold'}
          r.planT-=dt;
          if(r.plan==='cover'&&r.cover){
            const cd=Math.hypot(r.cover[0]-r.x,r.cover[1]-r.z);
            if(cd>0.7){sp=moveEnemy(r,r.cover[0],r.cover[1],T.speed+0.6,dt);H.aim=Math.max(0,H.aim-dt*3);r.peek=rr(1.0,2.0)}
            else{ // behind cover: crouch, pop up to fire in bursts
              H.crouch=1;r.peek-=dt;if(r.peek<=0){r.peek=rr(1.4,2.6);r.up=!r.up}
              if(r.up){H.crouch=0;H.aim+=(1-H.aim)*Math.min(1,dt*7);if(H.aim>0.8&&vis){r.cd-=dt;if(r.cd<=0&&d<w.range)enemyShoot(r,d)}}
              else H.aim=Math.max(0,H.aim-dt*5)}
          }else if(r.plan==='flank'){
            // move to a point 70-100° off the player's axis at ~14 m, preferring unblocked ground, then shoot
            const base=Math.atan2(r.x-P.x,r.z-P.z);const ang=base+r.flankSide*(1.3+0.1*Math.sin(gameT));const fd=Math.max(13,Math.min(d,18));
            const tx=P.x+Math.sin(ang)*fd,tz=P.z+Math.cos(ang)*fd;sp=moveEnemy(r,tx,tz,T.speed+0.9,dt);H.aim=Math.max(0,H.aim-dt*2);H.crouch=0;
            if(r.flankT<=0||Math.hypot(tx-r.x,tz-r.z)<2){r.plan='hold';r.planT=3}
            if(vis&&d<pref+12){H.aim+=(1-H.aim)*Math.min(1,dt*5);r.cd-=dt;if(r.cd<=0&&H.aim>0.75&&d<w.range*0.8)enemyShoot(r,d)}
          }else{
            H.crouch=0;
            if(d>pref+5)sp=moveEnemy(r,P.x,P.z,T.speed,dt);
            else if(d<pref-5)sp=-moveEnemy(r,r.x-dx/d*5,r.z-dz/d*5,2.4,dt);
            else{r.strafeT-=dt;if(r.strafeT<=0){r.strafeT=rr(1.2,2.6);r.strafe=-r.strafe}sp=moveEnemy(r,r.x+Math.cos(r.yaw)*r.strafe*3,r.z-Math.sin(r.yaw)*r.strafe*3,1.8,dt)}
            H.aim+=(1-H.aim)*Math.min(1,dt*6);r.cd-=dt;
            if(r.cd<=0&&H.aim>0.8&&vis&&d<w.range*0.85)enemyShoot(r,d)
          }
        }
        r.speed=sp;
      }
    }
    r.y+=(terrainH(r.x,r.z)-r.y)*Math.min(1,dt*14);
    if(r.state==='attack'&&r.melee&&!H.isDog)H.speed=Math.abs(r.speed)*1.1;else H.speed=Math.abs(r.speed);
    if(r.state!=='attack'||r.plan!=='cover')if(!H.isDog&&H.crouch&&r.state!=='attack')H.crouch=0;
    if(H.swing>0){r.swingT-=dt;H.swing=Math.max(0,r.swingT/0.55)}
    r.flash=Math.max(0,r.flash-dt);
    if(H.isDog){ // procedural gait
      const dm=H.dm;const ph=(r.ph=(r.ph||0)+dt*(2+Math.abs(r.speed)*2.2));const amp=clamp(Math.abs(r.speed)/6,0,1)*0.9;
      dm.legs[0].rotation.x=Math.sin(ph)*amp;dm.legs[3].rotation.x=Math.sin(ph)*amp;dm.legs[1].rotation.x=-Math.sin(ph)*amp;dm.legs[2].rotation.x=-Math.sin(ph)*amp;
      dm.tail.rotation.z=Math.sin(gameT*(r.state==='attack'?14:3))*0.4;dm.body.position.y=Math.abs(Math.sin(ph))*amp*0.05;
      H.root.position.set(r.x,r.y,r.z);H.root.rotation.y=r.yaw;
    }else{animateHuman(H,dt,time);H.root.position.set(r.x,r.y,r.z);H.root.rotation.y=r.yaw}
    if(r.spr.visible)r.spr.position.set(r.x,r.y+(H.isDog?1.5:2.3),r.z);
  }
}
let missionKillHook=null;function checkMissionKill(r){if(missionKillHook)missionKillHook(r)}
// ---- spawn the world's population
{
  const rp0=roadX(-120),rp1=roadX(95),rp2=roadX(-215);
  const mk=(x,z,w,o={})=>spawnEnemy(x,z,{weapon:w,...o});
  mk(rp0+6,-122,'pump',{group:1});mk(rp0-7,-130,'m9',{group:1,role:'flanker'});mk(rp0+3,-112,'pipe',{group:1});mk(rp0-2,-124,'ak',{group:1,type:'brute'});
  mk(rp1-6,92,'smg',{group:2});mk(rp1+7,100,'machete',{group:2});mk(rp1+1,86,'m9',{group:2,role:'flanker'});
  mk(rp2+5,-212,'pump',{group:3});mk(rp2-6,-220,'ak',{group:3,type:'brute'});mk(rp2+1,-225,'m9',{group:3,role:'flanker'});
  // depot guards hold the garage key
  const dp=RUINS[3];const g1=mk(dp.x+8,dp.z+10,'smg',{group:4});g1.hasKey=true;mk(dp.x-7,dp.z+9,'m9',{group:4,role:'flanker'});
  // scavengers (wary; will trade fire only if provoked)
  mk(RUINS[0].x+6,RUINS[0].z+9,'pipe',{type:'scav'});mk(RUINS[1].x-5,RUINS[1].z-6,'m9',{type:'scav'});mk(RUINS[5].x+7,RUINS[5].z+5,'knife',{type:'scav'});
  // feral dogs at the farm and depot
  for(let i=0;i<3;i++)spawnEnemy(RUINS[2].x+rr(-9,9),RUINS[2].z+rr(8,14),{type:'dog',group:5});
  for(let i=0;i<2;i++)spawnEnemy(RUINS[4].x+rr(-8,8),RUINS[4].z+rr(9,13),{type:'dog',group:6});
  if(MOBILE){/* keep phones lighter: the second dog pack and one raider camp member are dropped */
    for(const r of raiders.filter(r=>r.group===6)){ents.remove(r.H.root);r.spr.visible=false;r.dead=true;r.kb=null;r.state='dead'}
  }
}

let lastSpeakT=0;
function updateNPCs(dt){
  for(const n of npcs){
    if(n.dead)continue;const H=n.H;
    const dxp=P.x-n.x,dzp=P.z-n.z,dp=Math.hypot(dxp,dzp);
    if(dp>110){H.root.visible=false;continue}H.root.visible=true;
    if(n.kind==='walk'){
      const wp=n.wp;const tg=wp[n.wpi];const tx=tg[0]-n.x,tz=tg[1]-n.z,td=Math.hypot(tx,tz);
      if(td<0.5){n.wpi=(n.wpi+1)%wp.length}
      else{n.x+=tx/td*n.speed*dt;n.z+=tz/td*n.speed*dt;n.face+=angDiff(Math.atan2(tx,tz),n.face)*Math.min(1,dt*5);H.speed=n.speed*1.5}
      // avoid player
      if(dp<1.1){n.x-=dxp/dp*dt*1.5;n.z-=dzp/dp*dt*1.5}
      const p={x:n.x,z:n.z};resolveCircle(p,0.35);n.x=p.x;n.z=p.z;
      n.y=terrainH(n.x,n.z);
    }else{H.speed=0;
      if(dp<6&&n.kind==='idle'){n.face+=angDiff(Math.atan2(dxp,dzp),n.face)*Math.min(1,dt*2)*0.5;H.head.rotation.y=0}
    }
    animateHuman(H,dt,time,{lookYaw:dp<7?clamp(angDiff(Math.atan2(dxp,dzp),n.face),-0.9,0.9)*0.8:0});
    H.root.position.set(n.x,n.kind==='guard'?n.y:n.y,n.z);H.root.rotation.y=n.face;
  }
}

// ============================================================ car visuals
function updateCarVisual(dt){
  const C=CAR,g=C.obj.grp;
  g.position.set(C.x,C.y,C.z);g.rotation.set(C.pitch,C.yaw,C.roll);
  const spinRate=C.speed/0.37;
  for(const w of C.obj.wheels){w.spin.rotation.x+=spinRate*dt;if(w.front)w.pivot.rotation.y=-C.steer*0.45}
  // body roll from steering/accel for life
  g.rotation.z=C.roll+(P.inCar?-C.steer*C.speed*0.0016:0);
  const lit=P.inCar;
  if(!MOBILE){headlight.visible=lit;if(lit){const fx=Math.sin(C.yaw),fz=Math.cos(C.yaw);headlight.position.set(C.x+fx*1.8,C.y+1.0,C.z+fz*1.8);headlight.target.position.set(C.x+fx*20,C.y-0.4,C.z+fz*20);headlight.intensity=70}}
}

function driveCar(dt,ix,iy){
  const C=CAR;const fx=Math.sin(C.yaw),fz=Math.cos(C.yaw),rx=Math.cos(C.yaw),rz=-Math.sin(C.yaw);
  let vf=C.vx*fx+C.vz*fz,vl=C.vx*rx+C.vz*rz;
  const hb=IN.hb;
  const thr=iy>0?iy:0,brk=iy<0?-iy:0;
  if(thr>0)vf+=(vf<0?30:15.5)*thr*dt*(1-clamp(vf/DRIVE_MAX,0,1)*0.85);
  if(brk>0){if(vf>0.5)vf-=26*brk*dt;else vf-=8.5*brk*dt}
  vf-=vf*0.22*dt+Math.sign(vf)*1.2*dt*(thr?0:1);
  if(Math.abs(vf)<0.15&&!thr&&!brk)vf=0;
  vf=clamp(vf,-8,DRIVE_MAX*(IN.sprint?1.12:1));
  const grip=hb?1.6:9.5;vl-=vl*Math.min(1,grip*dt);
  const st=clamp(ix,-1,1);C.steer+=(st-C.steer)*Math.min(1,dt*7);
  const steerRate=(1.85-0.9*clamp(Math.abs(vf)/DRIVE_MAX,0,1))*(hb?1.5:1);
  C.yaw-=C.steer*steerRate*clamp(Math.abs(vf)/5,0,1)*Math.sign(vf||1)*dt;
  const nfx=Math.sin(C.yaw),nfz=Math.cos(C.yaw),nrx=Math.cos(C.yaw),nrz=-Math.sin(C.yaw);
  C.vx=nfx*vf+nrx*vl;C.vz=nfz*vf+nrz*vl;
  const ox=C.x,oz=C.z;
  C.x+=C.vx*dt;C.z+=C.vz*dt;
  // collisions: 3 probe circles along the body
  let hit=false;
  for(const o of[-1.6,0,1.6]){const p={x:C.x+nfx*o,z:C.z+nfz*o};const px=p.x,pz=p.z;if(resolveCircle(p,0.85)){hit=true;C.x+=p.x-px;C.z+=p.z-pz}}
  if(hit){const sp=Math.hypot(C.vx,C.vz);const nvx=(C.x-ox)/dt,nvz=(C.z-oz)/dt;
    const sp2=Math.hypot(nvx,nvz);C.vx*=0.35;C.vz*=0.35;if(sp>7){cam.shake=Math.min(1,cam.shake+sp*0.025);C.hp=Math.max(0,C.hp-sp*0.6);if(sp>10)for(let k=0;k<5;k++)sparks.emit(C.x+nfx*2,C.y+0.8,C.z+nfz*2,rr(-3,3),rr(1,3),rr(-3,3),{life:.4,size:.07,a:1,c0:[1,.8,.4],c1:[1,.3,.1],fall:9});if(sp>14)damagePlayer(Math.floor(sp*0.15))}}
  C.x=clamp(C.x,-HALF+10,HALF-10);C.z=clamp(C.z,-HALF+10,HALF-10);
  C.speed=vf;
  // run over raiders
  for(const r of raiders){if(r.dead)continue;if(Math.hypot(r.x-C.x,r.z-C.z)<1.6&&Math.abs(vf)>6){hitEnemy(r,Math.abs(vf)*6,new THREE.Vector3(r.x,r.y+1,r.z),false,_dir.set(C.vx,0,C.vz).normalize());r.kb=[C.vx*0.7,C.vz*0.7];cam.shake=Math.min(1,cam.shake+0.3);C.vx*=0.85;C.vz*=0.85}}
  // chassis pose from 4 wheel samples
  const hF=terrainH(C.x+nfx*1.35,C.z+nfz*1.35),hB=terrainH(C.x-nfx*1.35,C.z-nfz*1.35),hL=terrainH(C.x-nrx*0.9,C.z-nrz*0.9),hR=terrainH(C.x+nrx*0.9,C.z+nrz*0.9);
  const hm=(hF+hB+hL+hR)/4;C.y+=(hm-C.y)*Math.min(1,dt*14);
  const tp=Math.atan2(hB-hF,2.7),tr=Math.atan2(hL-hR,1.8);
  C.pitch+=(tp-C.pitch)*Math.min(1,dt*8);C.roll+=(tr-C.roll)*Math.min(1,dt*8);
  P.x=C.x;P.z=C.z;P.y=C.y;
  // dust / skid
  const slip=Math.abs(vl)+(hb?Math.abs(vf)*0.3:0);
  if(Math.abs(vf)>3&&Math.random()<dt*(10+Math.abs(vf)*1.2)){
    for(const s of[-0.9,0.9])dustB.emit(C.x-nfx*1.4+nrx*s,C.y+0.15,C.z-nfz*1.4+nrz*s,rr(-.5,.5)-nfx*vf*0.04,rr(.3,1.2),rr(-.5,.5)-nfz*vf*0.04,{life:rr(.8,1.6),size:.5,grow:4,a:clamp(0.15+Math.abs(vf)/70+slip*0.04,0,0.5),c0:[.65,.52,.38],c1:[.6,.5,.4]})}
  hero.root.visible=false;
  C.obj.hp=C.hp;
}

// ============================================================ minimap
const mm=$('mm'),mctx=mm.getContext('2d');const MMS=mm.width;
const mmBase=document.createElement('canvas');mmBase.width=mmBase.height=256;
{
  const g=mmBase.getContext('2d'),S=256,W=HALF*2;const id=g.createImageData(S,S);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const wx=x/S*W-HALF,wz=y/S*W-HALF;const h=terrainH(wx,wz);const c=0.45+h*0.007+(fbm(wx*0.05,wz*0.05,2)-.5)*0.2;
    const rd=Math.abs(wx-roadX(wz));let r=c*210,gg=c*170,b=c*125;if(rd<4.5){r=gg=b=70}
    if(Math.abs(wx)<HX&&Math.abs(wz)<HZ){r=120;gg=100;b=80}
    const o=(y*S+x)*4;id.data[o]=r;id.data[o+1]=gg;id.data[o+2]=b;id.data[o+3]=255}
  g.putImageData(id,0,0);g.strokeStyle='rgba(30,20,10,.6)';g.lineWidth=1.5;g.strokeRect((-HX+HALF)/W*S,(-HZ+HALF)/W*S,HX*2/W*S,HZ*2/W*S);
  g.fillStyle='#d6a85a';g.font='bold 9px sans-serif';g.fillText('HAVEN',(HALF-16)/W*S,(HALF-HZ-8)/W*S);
}
function drawMinimap(){
  const R2=60,S=MMS,zoom=P.inCar?1.7:1.0,range=(P.inCar?200:130);// world meters shown across radius
  mctx.save();mctx.clearRect(0,0,S,S);mctx.beginPath();mctx.arc(S/2,S/2,S/2-2,0,Math.PI*2);mctx.clip();
  mctx.fillStyle='#2a2018';mctx.fillRect(0,0,S,S);
  const scale=S/(range*2),W=HALF*2;
  mctx.translate(S/2,S/2);mctx.rotate(cam.yaw+Math.PI*0+0);   // up = camera forward (camera looks toward -forward => rotate by yaw)
  mctx.rotate(0);
  mctx.imageSmoothingEnabled=true;
  mctx.drawImage(mmBase,(-HALF-P.x)*scale,(-HALF-P.z)*scale,W*scale,W*scale);
  // dots
  const dot=(x,z,c,r)=>{mctx.fillStyle=c;mctx.beginPath();mctx.arc((x-P.x)*scale,(z-P.z)*scale,r,0,6.283);mctx.fill()};
  for(const r of raiders)if(!r.dead&&Math.hypot(r.x-P.x,r.z-P.z)<range*1.1&&(r.state!=='idle'||Math.hypot(r.x-P.x,r.z-P.z)<45))dot(r.x,r.z,r.type==='dog'?'#e8903a':(r.hostile?'#e0382a':'#e0d040'),r.state==='attack'?4:3);
  for(const d of dropList)if(!d.done&&Math.hypot(d.x-P.x,d.z-P.z)<range*1.1)dot(d.x,d.z,'#7aff90',4);
  if(waypoint){let wx=(waypoint.x-P.x)*scale,wz=(waypoint.z-P.z)*scale;const wl=Math.hypot(wx,wz),lim2=S/2-10;if(wl>lim2){wx*=lim2/wl;wz*=lim2/wl}mctx.fillStyle='#fff';mctx.fillRect(wx-3,wz-3,6,6)}
  dot(CAR.x,CAR.z,'#e8b86a',3.5);
  // mission marker, clamped to the edge
  const mt=missionTarget();let mx=(mt.x-P.x)*scale,mz=(mt.z-P.z)*scale;const ml=Math.hypot(mx,mz),lim=S/2-12;
  if(ml>lim){mx*=lim/ml;mz*=lim/ml}
  mctx.fillStyle='#5ad2ff';mctx.strokeStyle='#08222e';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(mx,mz-8);mctx.lineTo(mx+6,mz);mctx.lineTo(mx,mz+8);mctx.lineTo(mx-6,mz);mctx.closePath();mctx.fill();mctx.stroke();
  // radio tower icon
  const tx=(TOWER.x-P.x)*scale,tz=(TOWER.z-P.z)*scale;if(Math.hypot(tx,tz)<S/2-6){mctx.fillStyle='#ff5a3a';mctx.fillRect(tx-2,tz-5,4,10)}
  mctx.restore();
  // player arrow (fixed centre, rotated by heading relative to map)
  mctx.save();mctx.translate(S/2,S/2);const hd=(P.inCar?CAR.yaw:P.yaw);mctx.rotate(-(hd)+cam.yaw*1+0);
  mctx.rotate(Math.PI);
  mctx.fillStyle='#fff3d0';mctx.strokeStyle='#000';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(0,-9);mctx.lineTo(6,7);mctx.lineTo(0,3);mctx.lineTo(-6,7);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
  mctx.strokeStyle='rgba(240,200,150,.85)';mctx.lineWidth=3;mctx.beginPath();mctx.arc(S/2,S/2,S/2-2,0,Math.PI*2);mctx.stroke();
  mctx.fillStyle='#ffd9a0';mctx.font='bold 11px sans-serif';mctx.textAlign='center';mctx.fillText('N',S/2+Math.sin(cam.yaw)*(S/2-12)*0+0,13);
}


// ============================================================ v5 : day/night, windows, interaction, looting, crafting, vendors, dialogue, missions, save
const ui=document.getElementById('ui5');
// ---------------------------------------------------------------- time of day
const CLK={h:17.2,rate:1/75};      // game hours; 75 real seconds per game hour (30 min per day)
const NIGHTC={hor:new THREE.Color(0x1b2640),mid:new THREE.Color(0x121b32),top:new THREE.Color(0x070c1a)};
const DAYC={hor:FOGC.clone(),mid:new THREE.Color(0x9a8068),top:new THREE.Color(0x4d5560)};
const DUSKC={hor:new THREE.Color(0x7a4a3a),mid:new THREE.Color(0x4a3a4a),top:new THREE.Color(0x22283a)};
let _dk=1,_night=0;const keyDir=new THREE.Vector3(-0.7,0.3,-0.68);
const nightK=()=>_night;
function sunElev(h){return Math.sin((h-6)/12*Math.PI)}
const flashSpot=new THREE.SpotLight(0xfff0d0,0,48,0.46,0.55,1.4);flashSpot.visible=true;camera.add(flashSpot);flashSpot.position.set(0.15,-0.1,0);camera.add(flashSpot.target);flashSpot.target.position.set(0,0,-10);
const moon=new THREE.Color(0x9fb8ff),sunWarm=new THREE.Color(MOBILE?0xffc48c:0xffb06a),sunWhite=new THREE.Color(0xfff0e0);
const _cc=new THREE.Color();
function applyTime(){
  const h=CLK.h,el_=sunElev(h);_dk=sm(-0.06,0.28,el_);_night=1-sm(-0.18,0.1,el_);
  const ang=(h-6)/12*Math.PI;const th=ang+0.97;
  sunDir.set(Math.cos(th)*0.8,el_*0.95,Math.sin(th)*0.8).normalize();
  if(el_>-0.03)keyDir.set(sunDir.x,Math.max(0.08,sunDir.y),sunDir.z).normalize();else keyDir.set(-sunDir.x,Math.min(0.85,0.2+(-sunDir.y)*0.9),-sunDir.z).normalize();
  const day=el_>-0.02;
  // key light
  if(day){sun.color.copy(sunWarm).lerp(sunWhite,clamp((el_-0.3)*1.6,0,0.7));sun.intensity=(MOBILE?3.6:4.2)*(0.18+0.82*_dk)}
  else{sun.color.copy(moon);sun.intensity=(MOBILE?2.3:2.6)*(0.55+0.45*_night)}
  // sun direction is "toward sun" (day) or toward moon (night); the shader/sun light both use sunDir
  hemi.intensity=(MOBILE?1.5:1.35)*(0.62+0.38*_dk);hemi.color.lerpColors(new THREE.Color(0x6f88c8),new THREE.Color(MOBILE?0xd2c4b2:0xc4ad94),_dk);hemi.groundColor.lerpColors(new THREE.Color(0x3a4258),new THREE.Color(MOBILE?0x7a6858:0x6a5340),_dk);
  fillL.intensity=0.7*(0.6+0.4*_dk);fillL.color.lerpColors(new THREE.Color(0x7f9cff),new THREE.Color(0x8096b8),_dk);
  // sky / fog
  const dusk=Math.max(0,1-Math.abs(el_-0.05)/0.3)*(el_>-0.2?1:0);
  const hor=_cc.copy(NIGHTC.hor).lerp(DAYC.hor,_dk).lerp(DUSKC.hor,dusk*0.45*(1-_dk*0.3));
  skyUniforms.cHor.value.copy(hor);skyUniforms.cMid.value.copy(NIGHTC.mid).lerp(DAYC.mid,_dk).lerp(DUSKC.mid,dusk*0.4);skyUniforms.cTop.value.copy(NIGHTC.top).lerp(DAYC.top,_dk);
  skyUniforms.uNight.value=_night;skyUniforms.uDay.value=_dk;skyUniforms.uDisc.value=day?1:0.0;
  skyUniforms.cSun.value.set(day?0xffa860:0x6a7aa0);
  scene.fog.color.copy(hor);scene.background.copy(hor);scene.fog.density=(MOBILE?0.0015:0.0021)*(1+0.3*_night);
  renderer.toneMappingExposure=Number(Q.get('exp')||(MOBILE?1.4:1.55))*(1+0.3*_night);
  // flashlight
  flashSpot.intensity=(P.light&&!P.inCar)?(90+60*_night):0;
}
// ---------------------------------------------------------------- window manager
let WIN=null;
function openWin(name,render,on,{freeze=true,cls=''}={}){
  closeWin(true);WIN={name,render,on,freeze,sel:null};IN.modal=true;releaseLock();
  ui.innerHTML=`<div class="scrim"><div class="win ${cls}" id="winb"></div></div>`;renderWin();audio.ui('open');
}
function renderWin(){if(!WIN)return;const b=document.getElementById('winb');if(!b)return;
  const sc=[...b.querySelectorAll('.grid,.txt')].map(g=>g.scrollTop);b.innerHTML=WIN.render();[...b.querySelectorAll('.grid,.txt')].forEach((g,i)=>{if(sc[i])g.scrollTop=sc[i]});}
function closeWin(silent){if(!WIN)return;const w=WIN;WIN=null;IN.modal=false;ui.innerHTML='';if(w.onClose)w.onClose();if(!silent)audio.ui('close')}
function closeAllWindows(){closeWin(true)}
ui.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||!WIN)return;if(b.classList.contains('dis')){audio.ui('error');return}const a=b.dataset.a;
  if(a==='close'){closeWin();return}audio.ui('click');if(WIN.on)WIN.on(a,b.dataset,b);renderWin();});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtW=w=>(Math.round(w*10)/10).toFixed(1);
const hd=(t,extra='')=>`<div class="hd"><h3>${esc(t)}</h3>${extra}<button class="btn sm" data-a="close">✕ Close</button></div>`;
function wbar(){const w=inv.weight(),c=inv.cap();return `<div class="wtxt"><span>Backpack</span><span>${fmtW(w)} / ${fmtW(c)} kg · $${inv.cash}</span></div><div class="wbar ${w>c-0.3?'full':''}"><i style="width:${clamp(w/c*100,0,100)}%"></i></div>`}
function itemCard(it,attr,sel,extra=''){
  const d=ITEMS[it.id],rc=RARITY[d.rar].c;let nm=d.name;let meta=it.n>1?'×'+it.n:'';
  if(it.inst){const wi=it.inst;meta=`${wi.mag}/${WEAPONS[wi.wid].mag} · ${Math.round(wi.cond)}%`}
  const ic=d.type==='weapon'?'w_'+weaponClass(WEAPONS[d.wid]):itemIcon(d);
  return `<div class="it ${sel?'sel':''}" style="--rc:${rc}" ${attr}><span class="cd">${RARITY[d.rar].n.toUpperCase()}</span><div class="ib"><span class="ico">${svg(ic,'',1.7)}</span><div class="itx"><b>${esc(nm)}</b><div class="m"><span>${meta}</span><span>${d.w>0?fmtW(d.w*(it.inst?1:it.n))+' kg':''}</span></div></div></div>${extra}</div>`}
// ---------------------------------------------------------------- items: use / equip / attach / read
function heal(n){P.hp=Math.min(100,P.hp+n)}
function useItem(i){
  const it=inv.items[i];if(!it)return;const d=ITEMS[it.id];
  if(d.type==='med'){if(P.hp>=100&&d.heal){feed('Already at full health');return}heal(d.heal);inv.removeAt(i,1);audio.ui('good');feed('Used '+d.name+' (+'+d.heal+' HP)','#6fcf6a')}
  else if(d.type==='food'||d.type==='drink'){if(d.food)P.hunger=Math.min(100,P.hunger+d.food);if(d.water)P.thirst=clamp(P.thirst+d.water,0,100);if(d.hurt)damagePlayer(d.hurt);inv.removeAt(i,1);audio.ui('good');feed('Consumed '+d.name+(d.hurt?' (it makes you ill)':''),'#d3a63c')}
  else if(d.type==='note'||d.type==='tape'){readNote(it.id)}
  else if(d.type==='armor'){const old=inv[d.slot];inv.removeAt(i,1);inv[d.slot]=it.id;if(old)inv.add(old,1);feed('Equipped '+d.name);audio.ui('good')}
  else if(d.type==='bag'){const old=inv.bag;inv.removeAt(i,1);inv.bag=it.id;if(old)inv.add(old,1);feed('Equipped '+d.name+' (+'+d.cap+' kg)');audio.ui('good')}
  else if(d.type==='weapon'){equipWeaponItem(i)}
  else if(d.type==='att'){attachToCurrent(i)}
  else if(d.type==='throw'){inv.slots[4]=it.id;P.slot=4;refreshGun();feed('Ready: '+d.name)}
  else if(d.cal){const ids=inv.ammoFor(d.cal);inv.pref[d.cal]=it.id;const ci=curInst();if(ci&&WEAPONS[ci.wid].cal===d.cal&&ci.mag===0)ci.ammoId=it.id;feed('Preferred '+d.cal+' ammo: '+d.name)}
  refreshSlotsUI();
}
function equipWeaponItem(i){
  const it=inv.items[i];if(!it||!it.inst)return;const b=WEAPONS[it.inst.wid],s=b.slot;
  const old=inv.slots[s];inv.items.splice(i,1);inv.slots[s]=it.inst;if(old)inv.items.push({id:'w_'+old.wid,n:1,inst:old});
  if(P.slot===s)refreshGun();else if(!inv.slots[P.slot]||WEAPONS[inv.slots[P.slot].wid].slot===3){P.slot=s;refreshGun()}
  feed('Equipped '+b.name);audio.ui('good');refreshSlotsUI();
}
function unequipSlot(s){const w=inv.slots[s];if(!w||s===4)return;if(inv.room('w_'+w.wid)<1){feed('Backpack full');return}inv.items.push({id:'w_'+w.wid,n:1,inst:w});inv.slots[s]=null;
  if(P.slot===s){P.slot=[2,1,3].find(x=>inv.slots[x])||2;refreshGun()}refreshSlotsUI()}
function attCompat(wid,slot){const b=WEAPONS[wid];if(b.slot>2)return false;
  if(slot==='scope')return !b.scope&&b.kind!=='melee'&&wid!=='xbow'&&!b.pellets;
  if(slot==='supp')return !b.silent&&!b.pellets&&wid!=='rev';
  if(slot==='mag')return !b.perShell&&b.mag>2&&wid!=='rev'&&wid!=='xbow';
  if(slot==='grip')return b.kind==='rifle'&&!b.pellets&&wid!=='xbow';return false}
function attachToCurrent(i){
  const it=inv.items[i],d=ITEMS[it.id];let ci=curInst();if(!ci||WEAPONS[ci.wid].slot>2)ci=inv.slots[1]||inv.slots[2];
  if(!ci){feed('No weapon to attach to');return}if(!attCompat(ci.wid,d.slot)){feed(d.name+' doesn\u2019t fit the '+WEAPONS[ci.wid].name);audio.ui('error');return}
  const old=ci.att[d.slot];inv.removeAt(i,1);ci.att[d.slot]={scope:'att_scope',supp:'att_supp',mag:'att_mag',grip:'att_grip'}[d.slot];if(old)inv.add(old,1);
  feed('Attached '+d.name);audio.ui('good');refreshGun()}
function detach(s,slotName){const ci=inv.slots[s];if(!ci||!ci.att[slotName])return;const id=ci.att[slotName];if(inv.room(id)<1){feed('Backpack full');return}inv.add(id,1);ci.att[slotName]=null;if(ci.mag>weaponStats(ci).mag)ci.mag=weaponStats(ci).mag;refreshGun()}
function dropItem(i,all){const it=inv.items[i];if(!it)return;inv.removeAt(i,all?it.n:1);feed('Dropped '+ITEMS[it.id].name);audio.ui('click')}
function readNote(id){
  const n=NOTES.find(x=>x.id===id);if(!n)return;
  foundNotes.add(id);
  if(n.kind==='tape'){playedTapes.add(id);audio.radio(true);showSubtitle(n.x,9000)}
  openWin('note',()=>`${hd(n.t)}<div class="txt">${esc(n.x)}</div><div class="row" style="padding:6px 10px">${n.kind==='tape'?'<span style="font-size:12px;color:#bfa27e">▶ Playing…</span>':''}<button class="btn" data-a="close">OK</button></div>`,null,{freeze:true});
  storyHook(id);
}
function storyHook(id){ // a few notes advance things
  if(id==='n2'&&MS.main===0)feed('The part is still in the wreck on the north road.','#8fe0ff');
  if(id==='n7')feed('Tower radio: a signal from the coast…','#8fe0ff');
  if(id==='n3')feed('Safe code noted: 4172','#8fe0ff');
}
let subT=0;function showSubtitle(txt,ms=6000){const s=document.getElementById('sub');if(!s)return;s.textContent=txt;s.style.display='block';subT=ms/1000}
// ---------------------------------------------------------------- containers: search / loot panel
function cancelSearch(msg){if(!P.searching)return;P.searching=null;document.getElementById('sbarw').style.display='none';hero.actT=0;if(msg)feed(msg)}
function startSearch(c){
  if(P.searching||P.dead)return;
  if(c.lock&&!c.unlocked){openLockWin(c);return}
  const dur=c.items&&c.searched?0.25:(SEARCH_TIME[c.kind]||1.0);
  P.searching={c,t:0,dur,sx:P.x,sz:P.z};hero.actKey='Interact';hero.actT=dur;hero.actTs=1;hero.actFresh=true;
  const w=document.getElementById('sbarw');w.style.display='block';w.firstChild.textContent=(c.items&&c.searched?'OPENING ':'SEARCHING ')+c.name.toUpperCase();
}
function finishSearch(){
  const c=P.searching.c;P.searching=null;document.getElementById('sbarw').style.display='none';
  if(!c.items){
    if(c.fixed)c.items=c.fixed.map(x=>({...x}));else c.items=c.tbl==='none'?[]:rollLoot(c.tbl,Math.random,foundNotes);
    // ammo drift: nudge toward what the player uses so the world feels fair
    c.items.forEach(it=>{if(it.id==='a9'&&!inv.slots[1]&&!inv.slots[2])it.n=Math.max(2,Math.floor(it.n/2))});
  }
  c.searched=true;c.respawnAt=c.follow?0:gameT+520+Math.random()*320;
  if(c.kind==='skeleton'||c.kind==='body')hero.actKey='PickUp_Table';
  openLoot(c);
}
function openLoot(c){
  openWin('loot',()=>{
    const list=c.items||[];
    return `${hd(c.name+(c.searched?' · searched':''),`<span style="font-size:12px;color:#bfa27e">${list.length?list.length+' item'+(list.length>1?'s':''):'empty'}</span>`)}
    <div class="bd"><div class="col"><h4>Contents</h4><div class="grid">${list.length?list.map((it,i)=>itemCard(it,`data-a="take" data-i="${i}"`,false)).join(''):'<div class="it empty"><b>Nothing here</b><div class="m"><span>searched</span></div></div>'}</div>
    <div class="row" style="margin-top:6px"><button class="btn ${list.length?'':'dis'}" data-a="all">⤓ Take all</button></div></div>
    <div class="col" style="flex:0 0 38%"><h4>Your pack</h4>${wbar()}<div class="grid g3" style="max-height:140px">${inv.items.slice(0,18).map(it=>itemCard(it,'',false)).join('')}</div></div></div>`},
    (a,d)=>{
      if(a==='take'){const i=+d.i,it=c.items[i];if(!it)return;takeFrom(c,i)}
      else if(a==='all'){for(let i=c.items.length-1;i>=0;i--)takeFrom(c,i,true);audio.pickup()}
    },{freeze:false,cls:'wide'});
  WIN.onClose=()=>{P.lootC=null};P.lootC=c;
}
function takeFrom(c,i,quiet){
  const it=c.items[i];if(!it)return;let n;
  if(it.id==='cash'){inv.cash+=it.n;c.items.splice(i,1);if(!quiet)audio.pickup();feed('+$'+it.n,'#9fd06a');return}
  if(it.inst){n=inv.add(it.id,1,it.inst);if(n){c.items.splice(i,1);feed('Took '+ITEMS[it.id].name,rarCol(it.id));if(!quiet)audio.pickup()}else{feed('Too heavy');if(!quiet)audio.ui('error')}return}
  n=inv.add(it.id,it.n);if(n>=it.n){c.items.splice(i,1)}else if(n>0){it.n-=n}
  if(n){feed('Took '+(n>1?n+'× ':'')+ITEMS[it.id].name,rarCol(it.id));if(!quiet)audio.pickup();if(ITEMS[it.id].type==='note'||ITEMS[it.id].type==='tape')foundNotes.add(it.id)}else{feed('Too heavy to carry');if(!quiet)audio.ui('error')}
  refreshSlotsUI();
}
// ---------------------------------------------------------------- locks: keypad / lockpick / key
let kpBuf='';
function openLockWin(c,door){
  const lk=c.lock||{type:'pick',pick:0.6};kpBuf='';
  const nameStr=c.name||'Lock';
  openWin('lock',()=>`${hd(nameStr+' · locked')}<div class="txt" style="text-align:center">
    ${lk.type==='code'?`<div class="kpd">${kpBuf.padEnd(4,'·')}</div><div class="kp">${[1,2,3,4,5,6,7,8,9,'C',0,'OK'].map(k=>`<button data-a="k" data-k="${k}">${k}</button>`).join('')}</div>`:'<div style="margin:8px 0">A sturdy lock. You need a key or a lockpick.</div>'}
    <div class="row" style="justify-content:center;margin:6px 0">
      <button class="btn ${inv.count('lockpick')?'':'dis'}" data-a="pick">🔧 Lockpick (${inv.count('lockpick')}) · ${Math.round((lk.pick||0.5)*100)}%</button>
      ${lk.key?`<button class="btn ${inv.count(lk.key)?'':'dis'}" data-a="usekey">🗝 Use ${esc(ITEMS[lk.key].name)}</button>`:''}</div>
    <div style="font-size:12px;color:#bfa27e">${lk.type==='code'?'Tip: someone wrote the code down somewhere…':''}</div></div>`,
    (a,d)=>{
      const win=()=>{c.unlocked=true;if(door)door.locked=null;closeWin(true);audio.ui('good');feed('Unlocked','#8fe0ff');if(door){toggleDoor(door,true)}else startSearch(c)};
      if(a==='k'){const k=d.k;if(k==='C')kpBuf='';else if(k==='OK'){if(kpBuf===lk.code)win();else{kpBuf='';audio.ui('error');feed('Wrong code')}}else if(kpBuf.length<4){kpBuf+=k;audio.ui('tick');if(kpBuf.length===4&&kpBuf===lk.code)win()}}
      else if(a==='pick'){if(!inv.count('lockpick'))return;audio.search();if(Math.random()<(lk.pick||0.5))win();else{if(Math.random()<0.35){inv.remove('lockpick',1);feed('The lockpick snapped')}else feed('Failed — try again');audio.ui('error')}}
      else if(a==='usekey'){if(inv.count(lk.key)){win()}}
    });
}
// ---------------------------------------------------------------- doors
function toggleDoor(d,force){
  if(d.locked&&!d.unlockedOnce){const fake={name:d.name,lock:{type:'pick',pick:0.45,key:d.locked}};
    if(d.locked&&inv.count(d.locked)&&!force){d.locked=null;feed('Unlocked with key','#8fe0ff')}
    else{openLockWin(fake,d);return}}
  d.open=!d.open;audio.door(d.open,d.x,d.z);
  if(d.open){d.box[0]=d.box[1]=1e6;d.box[2]=d.box[3]=1e6+1}else{const b=d.box.box0;d.box[0]=b[0];d.box[1]=b[1];d.box[2]=b[2];d.box[3]=b[3]}
  makeNoise(d.x,d.z,10);
}
function updateDoors(dt){for(const d of DOORS){const t=d.open?1:0;d.ang+=(t-d.ang)*Math.min(1,dt*7);d.pivot.rotation.y=d.yaw+d.sign*d.ang*1.75}}
// ---------------------------------------------------------------- inventory window
function invWin(){
  const slotNames={1:'Primary',2:'Sidearm',3:'Melee',4:'Throwable'};
  openWin('inv',()=>{
    const S_=WIN.sel;
    const slotsH=[1,2,3,4].map(s=>{const w=s===4?(inv.slots[4]?{wid:inv.slots[4]}:null):inv.slots[s];
      if(!w)return `<div class="wsl" data-a="selslot" data-s="${s}"><b><span>${s} · ${slotNames[s]}</span></b><small>— empty —</small></div>`;
      const b=WEAPONS[w.wid];const rc=RARITY[b.rar].c;const extra=s<=2?` · ${w.mag}/${weaponStats(w).mag} · ${Math.round(w.cond)}%`:(s===4?' ×'+inv.count(w.wid):'');
      return `<div class="wsl ${P.slot===s?'cur':''} ${S_&&S_.t==='slot'&&S_.s===s?'sel':''}" style="--rc:${rc}" data-a="selslot" data-s="${s}"><b><span>${s} · ${esc(b.name)}</span></b><small>${slotNames[s]}${extra}</small></div>`}).join('');
    const eq=['vest','helmet','bag'].map(k=>`<div class="wsl" style="--rc:${inv[k]?rarCol(inv[k]):'#555'}" data-a="${inv[k]?'uneq':'none'}" data-k="${k}"><b><span>${k[0].toUpperCase()+k.slice(1)}</span></b><small>${inv[k]?esc(ITEMS[inv[k]].name):'— none —'}</small></div>`).join('');
    let det='<div class="det"><div class="ds">Tap an item for details.</div></div>';
    if(S_&&S_.t==='pack'&&inv.items[S_.i]){const it=inv.items[S_.i],d=ITEMS[it.id];
      let acts='';const T=d.type;
      if(T==='med'||T==='food'||T==='drink')acts+=`<button class="btn" data-a="use">Use</button>`;
      if(T==='note'||T==='tape')acts+=`<button class="btn" data-a="use">${T==='tape'?'▶ Play':'Read'}</button>`;
      if(T==='weapon')acts+=`<button class="btn" data-a="use">Equip (slot ${WEAPONS[d.wid].slot})</button>`;
      if(T==='armor'||T==='bag')acts+=`<button class="btn" data-a="use">Equip</button>`;
      if(T==='att')acts+=`<button class="btn" data-a="use">Attach to current gun</button>`;
      if(T==='throw')acts+=`<button class="btn" data-a="use">Ready</button>`;
      if(d.cal&&inv.ammoFor(d.cal).length>1)acts+=`<button class="btn" data-a="use">Use this ammo type</button>`;
      if(d.type!=='cash')acts+=`<button class="btn red sm" data-a="drop">Drop${it.n>1?' 1':''}</button>${it.n>1?'<button class="btn red sm" data-a="dropall">Drop all</button>':''}`;
      det=`<div class="det" style="border-color:${RARITY[d.rar].c}"><h5 style="color:${RARITY[d.rar].c}">${esc(d.name)} <small style="color:#bfa27e">${RARITY[d.rar].n}${d.cal?' · '+d.cal:''}</small></h5><div class="ds">${esc(d.desc||(it.inst?statLine(it.inst):d.type))}</div><div class="row">${acts}</div></div>`}
    else if(S_&&S_.t==='slot'){const s=S_.s;
      if(s===4){const id=inv.slots[4];det=`<div class="det"><h5>${id?esc(ITEMS[id].name):'Throwables'}</h5><div class="ds">Grenades and molotovs. Use G or the GRND button to throw.</div><div class="row"><button class="btn" data-a="slotequip" data-s="4">Ready</button></div></div>`}
      else{const w=inv.slots[s];if(w){const b=WEAPONS[w.wid],st=weaponStats(w);
        const attH=['scope','supp','mag','grip'].map(k=>`<button class="btn sm ${w.att[k]?'':'dis'}" data-a="detach" data-s="${s}" data-k="${k}">${k}: ${w.att[k]?esc(ITEMS[w.att[k]].name)+' ✕':'—'}</button>`).join(' ');
        const ammoT=b.cal?inv.ammoFor(b.cal).map(id=>`<button class="btn sm ${w.ammoId===id?'on':''}" data-a="setammo" data-s="${s}" data-id="${id}">${esc(ITEMS[id].name)} (${inv.count(id)})</button>`).join(' '):'';
        det=`<div class="det" style="border-color:${RARITY[b.rar].c}"><h5 style="color:${RARITY[b.rar].c}">${esc(b.name)}</h5><div class="ds">${statLine(w)}</div><div class="row">${attH}</div>${ammoT?`<div class="row" style="margin-top:4px">${ammoT}</div>`:''}<div class="row" style="margin-top:5px"><button class="btn" data-a="slotequip" data-s="${s}">Hold</button><button class="btn sm" data-a="unslot" data-s="${s}">To pack</button></div></div>`}}}
    return `${hd('Inventory',`<span style="font-size:12px;color:#bfa27e">HP ${Math.ceil(P.hp)} · Food ${Math.round(P.hunger)} · Water ${Math.round(P.thirst)}</span>`)}
    <div class="bd"><div class="col" style="flex:0 0 36%"><h4>Equipment</h4><div style="overflow:auto;touch-action:pan-y">${slotsH}${eq}</div></div>
    <div class="col"><h4>Backpack</h4>${wbar()}<div class="grid" style="max-height:${innerHeight<420?'118px':'220px'}">${inv.items.map((it,i)=>itemCard(it,`data-a="selpack" data-i="${i}"`,S_&&S_.t==='pack'&&S_.i===i)).join('')||'<div class="it empty"><b>Empty</b></div>'}</div>${det}</div></div>`},
    (a,d)=>{const w=WIN;
      if(a==='selpack')w.sel={t:'pack',i:+d.i};else if(a==='selslot')w.sel={t:'slot',s:+d.s};
      else if(a==='use'&&w.sel&&w.sel.t==='pack'){const i=w.sel.i,id=inv.items[i].id;useItem(i);if(!inv.items[i]||inv.items[i].id!==id)w.sel=null}
      else if(a==='drop'){dropItem(w.sel.i,false);if(!inv.items[w.sel.i])w.sel=null}else if(a==='dropall'){dropItem(w.sel.i,true);w.sel=null}
      else if(a==='slotequip'){equip(+d.s)}else if(a==='unslot'){unequipSlot(+d.s);w.sel=null}else if(a==='detach')detach(+d.s,d.k);
      else if(a==='setammo'){const ws=inv.slots[+d.s];ws.ammoId=d.id;inv.pref[WEAPONS[ws.wid].cal]=d.id}
      else if(a==='uneq'){const k=d.k,id=inv[k];if(inv.room(id)>0||k==='bag'){inv[k]=null;inv.add(id,1)}else feed('Backpack full')}
      refreshSlotsUI()});
}
function statLine(w){const b=WEAPONS[w.wid],s=weaponStats(w);if(b.slot===3)return `Damage ${b.dmg} · Rate ${(1/b.rate).toFixed(1)}/s · Reach ${b.reach}m · Cond ${Math.round(w.cond)}%`;
  const dps=Math.round(s.dmg*(s.pellets||1)/s.rate*(b.auto?1:1));return `${b.cal} · Dmg ${Math.round(s.dmg)}${s.pellets?'×'+s.pellets:''} · ${b.auto?'Auto':'Semi'} ${(60/s.rate|0)} rpm · Recoil ${s.recoil.toFixed(1)} · Spread ${(s.spread*100).toFixed(1)} · Range ${Math.round(s.range)}m · Mag ${s.mag} · Reload ${s.reload.toFixed(1)}s · Zoom ${s.zoom.toFixed(1)}× · Cond ${Math.round(w.cond)}%`}
// ---------------------------------------------------------------- crafting / cooking / repair
function craftWin(atBench){
  openWin('craft',()=>{
    const rows=RECIPES.filter(r=>atBench||!r.bench).map(r=>{const ok=inv.has(r.needs)&&inv.room(r.out[0])>=1;const need=Object.entries(r.needs).map(([k,v])=>`<span style="color:${inv.count(k)>=v?'#9fd06a':'#e08a70'}">${v}× ${esc(ITEMS[k].name)} (${inv.count(k)})</span>`).join(' · ');
      return `<div class="it ${ok?'':'empty'}" style="--rc:${rarCol(r.out[0])}" data-a="${ok?'craft':'no'}" data-id="${r.id}"><b>${esc(r.name)}</b><div class="m"><span>${need}</span></div></div>`}).join('');
    const rk=inv.count('repair');
    const reps=[1,2,3].map(s=>inv.slots[s]).filter(Boolean).map((w,i)=>{const s=[1,2,3].filter(x=>inv.slots[x])[i];return `<button class="btn sm ${rk&&w.cond<99?'':'dis'}" data-a="repair" data-s="${s}">Repair ${esc(WEAPONS[w.wid].name)} (${Math.round(w.cond)}%)</button>`}).join(' ');
    return `${hd(atBench?'Workbench':'Crafting',`<span style="font-size:12px;color:#bfa27e">Repair kits: ${rk}</span>`)}<div class="bd"><div class="col"><h4>Recipes ${atBench?'':'(bench recipes hidden)'}</h4><div class="grid">${rows}</div></div>
    <div class="col" style="flex:0 0 36%"><h4>Pack</h4>${wbar()}<h4 style="margin-top:8px">Weapon repair</h4><div class="row" style="flex-direction:column;align-items:stretch">${atBench?reps||'<span style="font-size:12px;color:#bfa27e">No weapons.</span>':'<span style="font-size:12px;color:#bfa27e">Needs a workbench.</span>'}</div></div></div>`},
    (a,d)=>{if(a==='craft'){const r=RECIPES.find(x=>x.id===d.id);if(!inv.has(r.needs))return;for(const k in r.needs)inv.remove(k,r.needs[k]);inv.add(r.out[0],r.out[1]);feed('Crafted '+r.name,rarCol(r.out[0]));audio.ui('good')}
      else if(a==='repair'){const w=inv.slots[+d.s];if(w&&inv.count('repair')){inv.remove('repair',1);w.cond=Math.min(100,w.cond+60);feed('Repaired '+WEAPONS[w.wid].name,'#8fe0ff');audio.ui('good')}}});
}
function cookWin(){
  openWin('cook',()=>{
    const rows=COOK.map(c=>{const n=inv.count(c.from);return `<div class="it ${n?'':'empty'}" style="--rc:${rarCol(c.to)}" data-a="${n?'cook':'no'}" data-f="${c.from}"><b>${esc(ITEMS[c.from].name)} → ${esc(ITEMS[c.to].name)}</b><div class="m"><span>You have ${n}</span><span>cook 1</span></div></div>`}).join('');
    return `${hd('Campfire')}<div class="bd"><div class="col"><h4>Cook</h4><div class="grid" style="grid-template-columns:1fr">${rows}</div></div><div class="col" style="flex:0 0 36%"><h4>Rest here</h4><div style="font-size:13px;color:#d9bf98;margin-bottom:8px">Warm by the fire. Cooked food restores far more hunger.</div><button class="btn" data-a="warm">Warm up (+HP)</button></div></div>`},
    (a,d)=>{if(a==='cook'){const c=COOK.find(x=>x.from===d.f);if(inv.count(c.from)){inv.remove(c.from,1);inv.add(c.to,1);audio.search();feed('Cooked '+ITEMS[c.to].name,'#d3a63c')}}else if(a==='warm'){heal(8);feed('You warm your hands')}});
}
// ---------------------------------------------------------------- vendors
const vendorStock=new Map();
function stockFor(n){
  let s=vendorStock.get(n);if(s)return s;const rng=(()=>{let a=(npcs.indexOf(n)+1)*2654435761>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();
  s=[];const T=LOOT.vendor_stock;for(const e of T){if(rng()<0.6){s.push({id:e[0],n:Math.max(1,Math.round(e[2]*(0.5+rng())))})}}
  const wl=VENDOR_WEAPONS.filter(()=>rng()<0.35);for(const w of wl)s.push({id:'w_'+w,n:1,inst:mkInst(w,{cond:70+Math.floor(rng()*30)})});
  vendorStock.set(n,s);return s}
const buyPrice=id=>Math.max(1,Math.round(ITEMS[id].value*1.3));
const sellPrice=id=>Math.floor(ITEMS[id].value*0.4);
function vendorWin(n){
  const stock=stockFor(n);
  openWin('vendor',()=>{
    const st=stock.map((it,i)=>itemCard(it,`data-a="buy" data-i="${i}"`,false,`<div class="m"><span style="color:#9fd06a">$${buyPrice(it.id)}</span></div>`)).join('');
    const pk=inv.items.map((it,i)=>sellPrice(it.id)>0?itemCard(it,`data-a="sell" data-i="${i}"`,false,`<div class="m"><span style="color:#e9b970">sell $${sellPrice(it.id)}</span></div>`):'').join('');
    return `${hd('Trader',`<span style="font-size:13px;color:#9fd06a;font-weight:700">$${inv.cash}</span>`)}<div class="bd"><div class="col"><h4>For sale</h4><div class="grid">${st||'<div class="it empty"><b>Sold out</b></div>'}</div></div><div class="col"><h4>Your items (tap to sell)</h4>${wbar()}<div class="grid">${pk}</div></div></div>`},
    (a,d)=>{
      if(a==='buy'){const it=stock[+d.i];if(!it)return;const pr=buyPrice(it.id);if(inv.cash<pr){feed('Not enough cash');audio.ui('error');return}
        const got=inv.add(it.id,it.inst?1:1,it.inst||null);if(!got){feed('Too heavy');audio.ui('error');return}inv.cash-=pr;if(it.inst||it.n<=1)stock.splice(+d.i,1);else it.n--;audio.ui('take')}
      else if(a==='sell'){const it=inv.items[+d.i];if(!it)return;const pr=sellPrice(it.id)*(it.inst?Math.max(0.3,it.inst.cond/100):1);inv.cash+=Math.round(pr);const cp={...it,n:1};if(it.inst)inv.items.splice(+d.i,1);else inv.removeAt(+d.i,1);
        const ex=stock.find(x=>x.id===it.id&&!x.inst&&!it.inst);if(ex)ex.n++;else if(!it.inst||true)stock.push(it.inst?{id:it.id,n:1,inst:it.inst}:{id:it.id,n:1});audio.ui('take');}
      refreshSlotsUI()});
}
// ---------------------------------------------------------------- dialogue
function dialog(who,text,choices){
  openWin('dialog',()=>`${hd(who)}<div class="txt" style="font-style:italic">${esc(text)}</div><div style="padding:0 10px 10px">${choices.map((c,i)=>`<button class="choice" data-a="ch" data-i="${i}">${esc(c[0])}</button>`).join('')}</div>`,
    (a,d)=>{const c=choices[+d.i];if(!c)return;closeWin(true);if(c[1])c[1]()},{cls:''});
}
// ---------------------------------------------------------------- missions & quest state
const MS={main:0,bounty:{s:0,group:0,reward:0,label:''},scav:{s:0,caches:[],found:0},convoy:{s:0},race:{s:0,cp:0,t:0,pts:[]},track:'main'};
const MAIN_TXT=['Collect the radio part from the ambush site on the north road','Take it to the mechanic at Gearhead Repairs','Delivered. Scout the radio tower to the north and listen to its radio','Signal found. The coast is calling…'];
function trackTarget(){
  const t=MS.track;
  if(t==='race'&&MS.race.s===1){const p=MS.race.pts[MS.race.cp];return{x:p.x,z:p.z,label:`Checkpoint ${MS.race.cp+1}/${MS.race.pts.length}`}}
  if(t==='convoy'&&MS.convoy.s===1&&CV.truck)return{x:CV.x,z:CV.z,label:'Convoy truck'};
  if(t==='scav'&&MS.scav.s===1){const c=MS.scav.caches.find(c=>!c.looted);if(c)return{x:c.x,z:c.z,label:'Hidden cache'};return{x:TESS.x,z:TESS.z,label:'Tess'}}
  if(t==='bounty'&&MS.bounty.s===1){const r=raiders.filter(r=>!r.dead&&r.group===MS.bounty.group).sort((a,b)=>Math.hypot(a.x-P.x,a.z-P.z)-Math.hypot(b.x-P.x,b.z-P.z))[0];if(r)return{x:r.x,z:r.z,label:'Bounty target'}}
  if(t==='bounty'&&MS.bounty.s===2)return{x:BOARD.x,z:BOARD.z,label:'Bounty board'};
  return mainTarget();
}
function mainTarget(){
  if(MS.main===0)return{x:PART.x+2.2,z:PART.z-1.4,label:'Radio part'};
  if(MS.main===1)return{x:MECH.x+5.4,z:MECH.z+0.5,label:'Mechanic'};
  const rd=IA.find(i=>i.type==='radio'&&i.tape==='t3');return{x:rd.x,z:rd.z,label:'Tower radio'};
}
function missionTarget(){return trackTarget()}
Object.defineProperty(P,'mission',{get:()=>Math.min(2,MS.main),set:v=>{MS.main=v},configurable:true,enumerable:true});
function updateMissionUI(){
  let t,s;
  if(MS.track==='race'&&MS.race.s===1){t='Street race';s=`Checkpoint ${MS.race.cp+1}/${MS.race.pts.length} · ${Math.max(0,MS.race.t).toFixed(0)} s left`}
  else if(MS.track==='convoy'&&MS.convoy.s===1){t='Convoy defence';s=`Truck ${Math.max(0,Math.round(CV.hp))}% · ${CV.phase==='ambush'?'ambush! clear the raiders':'stay close and protect it'}`}
  else if(MS.track==='scav'&&MS.scav.s===1){t='Scavenger hunt';s=`Power cells ${inv.count('power_cell')}/3 · find the marked caches`}
  else if(MS.track==='bounty'&&MS.bounty.s>=1){t='Bounty: '+MS.bounty.label;s=MS.bounty.s===1?`Hostiles left: ${raiders.filter(r=>!r.dead&&r.group===MS.bounty.group).length}`:'Return to the bounty board'}
  else{t=MS.main<2?'Deliver the radio part to the Haven mechanic':(MS.main<3?'Listen to the tower radio':'Main story: the coast signal');s=MAIN_TXT[MS.main]}
  el.mission.textContent=t;el.msub.textContent=s;
}
function questList(){
  const q=[];
  q.push({id:'main',t:'Radio Haven',d:MAIN_TXT[MS.main],done:MS.main>=3});
  const b=MS.bounty;q.push({id:'bounty',t:'Bounty board'+(b.label?': '+b.label:''),d:b.s===0?'Check the bounty board in the plaza.':(b.s===1?'Eliminate the targets.':b.s===2?'Return to the board for your reward.':'Completed.'),done:b.s===3});
  const sc=MS.scav;q.push({id:'scav',t:'Tess\u2019s power cells',d:sc.s===0?'Talk to Tess in the plaza.':(sc.s===1?`Find the cells: ${inv.count('power_cell')}/3`:'Completed.'),done:sc.s===2});
  const cv=MS.convoy;q.push({id:'convoy',t:'Convoy defence',d:cv.s===0?'Ask the Marshal near the gate.':(cv.s===1?'Escort the truck up the north road.':cv.s===2?'Completed.':'Failed — talk to the Marshal to retry.'),done:cv.s===2});
  const rc=MS.race;q.push({id:'race',t:'Street race',d:rc.s===0?'Ask the Marshal near the gate.':(rc.s===1?'Hit all checkpoints in time.':rc.s===2?'Completed.':'Failed — talk to the Marshal to retry.'),done:rc.s===2});
  return q}
function journalWin(){
  openWin('journal',()=>{
    const qs=questList().map(q=>`<div class="qst ${q.done?'done':''}"><b>${esc(q.t)}${q.done?' ✓':''}</b><div>${esc(q.d)}</div>${!q.done&&q.id!=='main'||q.id==='main'&&!q.done?`<button class="btn sm" style="margin-top:4px" data-a="track" data-id="${q.id}">${MS.track===q.id?'Tracking':'Track'}</button>`:''}</div>`).join('');
    const ns=NOTES.filter(n=>foundNotes.has(n.id)).map(n=>`<div class="it" style="--rc:${n.kind==='tape'?'#6fcf6a':'#c9c2b4'}" data-a="read" data-id="${n.id}"><b>${esc(n.t)}</b><div class="m"><span>${n.kind==='tape'?'audio log':'note'}</span><span>tap to read</span></div></div>`).join('');
    return `${hd('Journal',`<span style="font-size:12px;color:#bfa27e">${foundNotes.size}/${NOTES.length} logs found</span>`)}<div class="bd"><div class="col"><h4>Quests</h4><div class="grid" style="grid-template-columns:1fr">${qs}</div></div><div class="col"><h4>Logs</h4><div class="grid" style="grid-template-columns:1fr">${ns||'<div class="it empty"><b>No logs yet</b><div class="m"><span>search bodies & containers</span></div></div>'}</div></div></div>`},
    (a,d)=>{if(a==='track'){MS.track=d.id;updateMissionUI()}else if(a==='read'){readNote(d.id)}});
}
// ---- bounty
const BOARD={x:9.5+Math.sin(Math.PI*0.9)*1.3,z:-13.5+Math.cos(Math.PI*0.9)*1.3};
function boardWin(){
  const b=MS.bounty;
  if(b.s===2){dialog('Bounty board','"Target eliminated. Pick up your reward."',[['Collect $'+b.reward,()=>{inv.cash+=b.reward;P.rep=Math.min(10,P.rep+1.5);b.s=3;MS.track='main';feed('Bounty paid +$'+b.reward,'#9fd06a');audio.ui('good');updateMissionUI()}],['Not yet',null]]);return}
  if(b.s===1){dialog('Bounty board','"Still hunting: '+b.label+'."',[['Keep going',null],['Abandon',()=>{b.s=0;MS.track='main';updateMissionUI()}]]);return}
  if(b.s===3&&false){}
  dialog('Bounty board','Two notices are pinned up.',[
    ['Wanted: the road gang on the south road — $180',()=>{Object.assign(b,{s:1,group:2,reward:180,label:'South road gang'});MS.track='bounty';feed('Bounty accepted','#8fe0ff');updateMissionUI()}],
    ['Wanted: the depot guards, hold the garage key — $260',()=>{Object.assign(b,{s:1,group:4,reward:260,label:'Depot guards'});MS.track='bounty';feed('Bounty accepted','#8fe0ff');updateMissionUI()}],
    ['Walk away',null]]);
}
missionKillHook=r=>{const b=MS.bounty;if(b.s===1&&!raiders.some(x=>!x.dead&&x.group===b.group)){b.s=2;feed('Bounty targets down — return to the board','#8fe0ff');updateMissionUI()}};
// ---- scavenger hunt (3 power cell caches)
const TESS=npcs.find(n=>n.kind==='idle'&&n.role!=='vendor'&&n.role!=='mechanic')||npcs[0];
TESS.role='tess';
const MARSHAL=addNPC(5.8,20.5,Math.PI,{hat:'cap',hatCol:0x2a3a2a,beard:true,hair:0x1a1a1a,pack:false,jacket:0x3a4a3a,shirt:0x4a4a3a,pants:0x2e3036,talk:true,role:'marshal',wide:true});
{
  const spots=[[RUINS[1].x+4.5,RUINS[1].z-7.5],[RUINS[5].x-5,RUINS[5].z+6],[RUINS[0].x-6,RUINS[0].z-8]];
  spots.forEach(([x,z],i)=>{const c=addCont('crate',x,z,i,{v:1,name:'Hidden cache',fixed:[{id:'power_cell',n:1},{id:'bandage',n:1}]});MS.scav.caches.push(c)});
}
const cacheBeams=[];{const g=new THREE.CylinderGeometry(0.25,0.4,40,8,1,true),m=new THREE.MeshBasicMaterial({color:0x8fe0ff,transparent:true,opacity:0.1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
  for(let i=0;i<3;i++){const b=new THREE.Mesh(g,m);b.visible=false;scene.add(b);cacheBeams.push(b)}}
function tessWin(){
  const s=MS.scav;
  if(s.s===0)dialog('Tess','"The lamps are dying. I need three power cells — scavengers hid caches around the ruins. I\u2019ll pay well."',[['I\u2019ll find them',()=>{s.s=1;MS.track='scav';feed('Scavenger hunt started','#8fe0ff');updateMissionUI()}],['What\u2019s in it for me?',()=>dialog('Tess','"$220 and a plate carrier I was saving. Deal?"',[['Deal',()=>{s.s=1;MS.track='scav';updateMissionUI()}],['No thanks',null]])],['Not now',null]]);
  else if(s.s===1){const n=inv.count('power_cell');
    if(n>=3)dialog('Tess','"You found them all! Bless you."',[['Hand over 3 power cells',()=>{inv.remove('power_cell',3);inv.cash+=220;inv.add('vest_l',1);s.s=2;MS.track='main';P.rep=Math.min(10,P.rep+1);feed('Hunt complete +$220','#9fd06a');audio.ui('good');updateMissionUI()}],['Wait',null]]);
    else dialog('Tess','"Cells found so far: '+n+'/3. Look for the glowing markers."',[['On it',null]])}
  else dialog('Tess','"The lamps are bright again. Thanks to you."',[['Good',null]]);
}
// ---- convoy
const CV={truck:null,x:0,z:0,yaw:0,hp:100,phase:'idle',wp:0,path:[],ambushed:false,foes:[]};
function convoyStart(){
  const path=[];for(let z=-(HZ+8);z>=-150;z-=10)path.push({x:roadX(z)+1.5,z});
  Object.assign(CV,{hp:100,phase:'drive',wp:1,path,x:path[0].x,z:path[0].z,yaw:Math.PI,ambushed:false,foes:[],stopT:0,ambush2:false});
  if(!CV.truck){CV.truck=buildCar(0x56603e);ents.add(CV.truck.grp)}CV.truck.grp.visible=true;
  MS.convoy.s=1;MS.track='convoy';feed('Convoy leaving — keep the truck alive','#8fe0ff');updateMissionUI();
}
function convoyAmbush(n){
  const z=CV.path[Math.min(CV.path.length-1,CV.wp+3)].z-12;
  for(let i=0;i<n;i++){const side=i%2?-1:1;const r=spawnEnemy(roadX(z)+side*rr(8,16),z+rr(-8,8),{weapon:pick(['m9','smg','pump','ak']),group:9,role:i%2?'flanker':'gunner'});r.state='attack';r.alertT=40;r.leashR=120;r.lastX=CV.x;r.lastZ=CV.z;CV.foes.push(r)}
  CV.phase='ambush';audio.alarm();feed('Ambush! Protect the truck','#ff8a60');
}
function updateConvoy(dt){
  if(MS.convoy.s!==1)return;
  const dPl=Math.hypot(P.x-CV.x,P.z-CV.z);
  const alive=CV.foes.filter(r=>!r.dead);
  if(CV.phase==='ambush'){
    for(const r of alive){const d=Math.hypot(r.x-CV.x,r.z-CV.z);if(d<32&&r.state==='attack')CV.hp-=dt*(r.wid==='pump'?3:2.2)*(MS.convoy.hard?1:0.7)}
    if(!alive.length){CV.phase='drive';feed('Ambush cleared','#9fd06a')}
  }else if(dPl<40){
    const w=CV.path[CV.wp];if(w){const dx=w.x-CV.x,dz=w.z-CV.z,d=Math.hypot(dx,dz);const sp=4.2;CV.x+=dx/d*sp*dt;CV.z+=dz/d*sp*dt;CV.yaw+=angDiff(Math.atan2(dx,dz),CV.yaw)*Math.min(1,dt*3);if(d<1.5)CV.wp++}
    if(!CV.ambushed&&CV.wp>=Math.floor(CV.path.length*0.4)){CV.ambushed=true;convoyAmbush(MOBILE?3:4)}
    else if(!CV.ambush2&&CV.wp>=Math.floor(CV.path.length*0.8)){CV.ambush2=true;convoyAmbush(MOBILE?2:3)}
    if(CV.wp>=CV.path.length&&!alive.length){MS.convoy.s=2;MS.track='main';inv.cash+=300;P.rep=Math.min(10,P.rep+2);feed('Convoy delivered +$300','#9fd06a');audio.ui('good');CV.truck.grp.visible=false;updateMissionUI()}
  }
  CV.y=terrainH(CV.x,CV.z);CV.truck.grp.position.set(CV.x,CV.y,CV.z);CV.truck.grp.rotation.set(0,CV.yaw,0);for(const w of CV.truck.wheels)w.spin.rotation.x+=dt*(CV.phase==='drive'&&dPl<40?11:0);
  if(CV.hp<=0){MS.convoy.s=3;MS.track='main';feed('The convoy was destroyed','#ff6a50');CV.truck.grp.visible=false;for(const r of CV.foes)if(!r.dead){r.state='search';r.searchT=3}updateMissionUI()}
}
// ---- race
function raceStart(){
  const pts=[];const zs=[70,120,170,225,280,330];zs.forEach((z,i)=>pts.push({x:roadX(z)+(i%2?2:-2),z}));
  Object.assign(MS.race,{s:1,cp:0,t:100,pts});MS.track='race';feed('Race started! Hit every checkpoint','#8fe0ff');updateMissionUI();
}
function updateRace(dt){
  const r=MS.race;if(r.s!==1)return;r.t-=dt;const p=r.pts[r.cp];
  if(Math.hypot(P.x-p.x,P.z-p.z)<11){r.cp++;audio.ui('good');feed(`Checkpoint ${r.cp}/${r.pts.length}`,'#8fe0ff');r.t+=12;
    if(r.cp>=r.pts.length){r.s=2;MS.track='main';inv.cash+=250;P.rep=Math.min(10,P.rep+1);feed('Race won +$250','#9fd06a');updateMissionUI()}else updateMissionUI()}
  else if(r.t<=0){r.s=3;MS.track='main';feed('Out of time — race lost','#ff6a50');updateMissionUI()}
}
function marshalWin(){
  const rc=MS.race,cv=MS.convoy;
  dialog('Haven Marshal','"Plenty of work if you can handle yourself. What\u2019ll it be?"',[
    [cv.s===1?'Convoy: in progress':(cv.s===2?'Convoy: done (run it again)':'Escort the supply convoy'),()=>{if(cv.s!==1)convoyStart()}],
    [rc.s===1?'Race: in progress':'Run the south-road race (needs a car)',()=>{if(rc.s!==1)raceStart()}],
    ['Any rumours?',()=>dialog('Marshal','"'+pick(['Raiders keep a garage key at the old depot.','A foreman wrote a safe code on a scrap of paper — probably in a farmhouse.','Supply drops come every few days. Watch for green flare smoke.','Dogs near the farm hunt in packs — fire scares them.'])+'"',[['Thanks',null]])],
    ['Leave',null]]);
}
// ---- mechanic & vendors
function mechWin(){
  const doRepair=()=>{let n=0,cost=0;for(const s of[1,2,3]){const w=inv.slots[s];if(w&&w.cond<95){cost+=Math.ceil((100-w.cond)*0.4)}}
    if(!cost){feed('Nothing needs repair');return}if(inv.cash<cost){feed('Repairs cost $'+cost);return}inv.cash-=cost;for(const s of[1,2,3]){const w=inv.slots[s];if(w)w.cond=100}feed('Weapons repaired −$'+cost,'#8fe0ff');audio.ui('good')};
  if(MS.main===0)dialog('Mechanic','"Radio\u2019s dead and I\u2019m missing a part. Raiders stripped a van on the north road — the part is still in the wreck. Bring it and I\u2019ll make it worth your while."',[['I\u2019ll get it',()=>{MS.track='main';updateMissionUI()}],['Where exactly?',()=>dialog('Mechanic','"Follow the north road to the ambush site. You\u2019ll see a beam of light on the wreck."',[['Got it',null]])],['Repair my guns',doRepair],['Later',null]]);
  else if(MS.main===1){
    if(P.hasPart)dialog('Mechanic','"That\u2019s it! You\u2019re a lifesaver."',[['Hand over the part',()=>{MS.main=2;P.hasPart=false;inv.remove('radio_part',1);inv.cash+=150;P.rep=Math.min(10,P.rep+3);inv.add('a762',24);feed('DELIVERED  +$150  +REPUTATION','#9fd06a');audio.ui('good');updateMissionUI()}],['Not yet',null]]);
    else dialog('Mechanic','"Still need that radio part from the north road."',[['On it',null],['Repair my guns',doRepair]])}
  else dialog('Mechanic','"The tower\u2019s radio works again — go listen. The signal comes from the coast."',[['Repair my guns',doRepair],['Craft at the bench',()=>craftWin(true)],['Thanks',null]]);
}
function vendorTalk(n){
  dialog('Trader','"Looking to trade? Cash only, nothing personal."',[['Trade',()=>vendorWin(n)],['Rumours',()=>dialog('Trader','"'+pick(['Safe in the depot has the good stuff. Code is on a note somewhere.','Three power cells would make Tess very happy.','The Marshal pays for convoy escorts.','Night is dangerous — raiders see your flashlight from far off.','A radio plays old recordings at the tower base.'])+'"',[['Thanks',null]])],['Leave',null]]);
}
// ---------------------------------------------------------------- beds / save
const SAVEKEY='ashfall5_save';
function saveGame(manual){
  try{
    const o={v:5,P:{x:P.x,z:P.z,yaw:P.yaw,hp:P.hp,hunger:P.hunger,thirst:P.thirst,rep:P.rep,slot:P.slot,light:P.light,kills:P.kills,hasPart:P.hasPart},inv:JSON.parse(inv.serialize()),clk:CLK.h,gt:gameT,MS:{main:MS.main,bounty:MS.bounty,scav:{s:MS.scav.s},convoy:{s:MS.convoy.s===1?0:MS.convoy.s},race:{s:MS.race.s===1?0:MS.race.s},track:'main'},
      notes:[...foundNotes],tapes:[...playedTapes],cont:CONT.filter(c=>!c.follow).map(c=>({i:c.id,s:c.searched?1:0,it:c.items,r:c.respawnAt,u:c.unlocked?1:0,l:c.looted?1:0})),doors:DOORS.map(d=>({o:d.open?1:0,l:d.locked||0})),
      dead:raiders.map(r=>r.dead?1:0),pickup:pickup.obj.visible?1:0,ver:Date.now()};
    localStorage.setItem(SAVEKEY,JSON.stringify(o));if(manual)feed('Game saved','#8fe0ff');return true}catch(e){console.warn('save failed',e);if(manual)feed('Save failed (storage blocked?)');return false}
}
function loadGame(){
  let o;try{o=JSON.parse(localStorage.getItem(SAVEKEY)||'null')}catch(_){o=null}if(!o)return false;
  try{
    Object.assign(P,{x:o.P.x,z:o.P.z,yaw:o.P.yaw,hp:o.P.hp,hunger:o.P.hunger,thirst:o.P.thirst,rep:o.P.rep,slot:o.P.slot,light:!!o.P.light,kills:o.P.kills||0,hasPart:!!o.P.hasPart,dead:false,y:terrainH(o.P.x,o.P.z)});
    inv.load(o.inv);CLK.h=o.clk;gameT=o.gt||gameT;MS.main=o.MS.main;Object.assign(MS.bounty,o.MS.bounty);MS.scav.s=o.MS.scav.s;MS.convoy.s=o.MS.convoy.s;MS.race.s=o.MS.race.s;MS.track='main';
    foundNotes.clear();(o.notes||[]).forEach(x=>foundNotes.add(x));
    for(const s of o.cont||[]){const c=CONT[s.i];if(!c)continue;c.searched=!!s.s;c.items=s.it;c.respawnAt=s.r||0;c.unlocked=!!s.u}
    (o.doors||[]).forEach((s,i)=>{const d=DOORS[i];if(!d)return;d.locked=s.l||null;if(!!s.o!==d.open){d.open=!!s.o;if(d.open){d.box[0]=d.box[1]=1e6;d.box[2]=d.box[3]=1e6+1}else{const b=d.box.box0;d.box[0]=b[0];d.box[1]=b[1];d.box[2]=b[2];d.box[3]=b[3]}d.ang=d.open?1:0}});
    (o.dead||[]).forEach((x,i)=>{const r=raiders[i];if(r&&x&&!r.dead){r.dead=true;r.deadT=9;r.state='dead';r.spr.visible=false;if(r.H.isDog){r.H.root.rotation.z=1.5}else r.H.dead=1}});
    pickup.obj.visible=!!o.pickup;
    hero.dead=0;hero.root.rotation.x=0;el.wasted.classList.remove('show');P.stance=0;refreshGun();camLook.set(P.x,P.y+1.5,P.z);cam.tyaw=cam.yaw=P.yaw+Math.PI;
    applyTime();updateMissionUI();refreshSlotsUI();feed('Game loaded','#8fe0ff');return true}catch(e){console.warn('load failed',e);return false}
}
const hasSave=()=>{try{return !!localStorage.getItem(SAVEKEY)}catch(_){return false}};
function sleepWin(){
  dialog('Safehouse bed','Rest until morning? Time passes, you heal, and the game is saved.',[
    ['Sleep until 07:00',()=>{
      const f=document.createElement('div');f.style.cssText='position:fixed;inset:0;background:#000;opacity:0;transition:opacity .8s;z-index:30;pointer-events:none';document.body.appendChild(f);requestAnimationFrame(()=>f.style.opacity=1);
      setTimeout(()=>{CLK.h=7.0;P.hp=Math.min(100,P.hp+60);P.hunger=Math.max(8,P.hunger-12);P.thirst=Math.max(8,P.thirst-16);applyTime();
        for(const c of CONT)if(c.searched&&!c.follow&&c.respawnAt){c.respawnAt=Math.min(c.respawnAt,gameT)}
        saveGame(false);f.style.opacity=0;setTimeout(()=>f.remove(),900);feed('Good morning. Game saved.','#8fe0ff')},1000)}],
    ['Rest 3 hours',()=>{CLK.h=(CLK.h+3)%24;P.hp=Math.min(100,P.hp+20);P.hunger=Math.max(5,P.hunger-4);P.thirst=Math.max(5,P.thirst-6);applyTime();saveGame(true)}],
    ['Save only',()=>saveGame(true)],['Never mind',null]]);
}
// ---------------------------------------------------------------- map & settings windows
let mapPan={x:0,z:0},waypoint=null;
function mapWin(){
  openWin('map',()=>`${hd('Map',`<span style="font-size:12px;color:#bfa27e">tap to set a waypoint</span>`)}<div id="mapwrap"><canvas id="mapc" width="520" height="520"></canvas></div>`,null,{cls:'wide'});
  WIN.onClose=()=>{};requestAnimationFrame(drawBigMap);
  const c=document.getElementById('mapc');c.addEventListener('pointerdown',e=>{const r=c.getBoundingClientRect(),W=HALF*2;waypoint={x:(e.clientX-r.left)/r.width*W-HALF,z:(e.clientY-r.top)/r.height*W-HALF};feed('Waypoint set');drawBigMap();e.stopPropagation()});
}
function drawBigMap(){
  const c=document.getElementById('mapc');if(!c)return;const g=c.getContext('2d'),S=c.width,W=HALF*2,k=S/W;
  g.drawImage(mmBase,0,0,S,S);const X=x=>(x+HALF)*k,Z=z=>(z+HALF)*k;
  const dot=(x,z,col,r,txt)=>{g.fillStyle=col;g.beginPath();g.arc(X(x),Z(z),r,0,6.283);g.fill();g.strokeStyle='#000';g.lineWidth=1;g.stroke();if(txt){g.fillStyle='#fff';g.font='bold 11px sans-serif';g.fillText(txt,X(x)+7,Z(z)+4)}};
  for(const q of RUINS)dot(q.x,q.z,'#d6a85a',4,q.name.replace(' (locked)',''));
  for(const c2 of CONT)if(!c2.follow&&c2.searched)dot(c2.x,c2.z,'#556',1.5);
  dot(TOWER.x,TOWER.z,'#ff5a3a',5,'Radio tower');dot(0,0,'#f0d090',5,'Rust Haven');for(const p of PONDS)dot(p.x,p.z,'#4aaed0',3);
  dot(CAR.x,CAR.z,'#e8b86a',4,'Your car');
  for(const d of dropList)if(!d.done)dot(d.x,d.z,'#7aff90',5,'Supply drop');
  const mt=missionTarget();dot(mt.x,mt.z,'#5ad2ff',6,mt.label);
  if(waypoint)dot(waypoint.x,waypoint.z,'#ffffff',4,'Waypoint');
  g.save();g.translate(X(P.x),Z(P.z));g.rotate(-P.yaw+Math.PI);g.fillStyle='#fff';g.strokeStyle='#000';g.beginPath();g.moveTo(0,-9);g.lineTo(6,7);g.lineTo(0,3);g.lineTo(-6,7);g.closePath();g.fill();g.stroke();g.restore();
}
function settingsWin(){
  const sl=(k,lab,mn,mx,st,v)=>{v=v===undefined?S[k]:v;return `<div class="slr"><label>${lab}</label><input type="range" min="${mn}" max="${mx}" step="${st}" value="${v}" data-sl="${k}"><output>${(+v).toFixed(2)}</output></div>`};
  const tg=(a,lab,on)=>`<button class="btn tg ${on?'on':''}" data-a="${a}">${lab}<span>${on?'ON':'OFF'}</span></button>`;
  const sw=['#ffffff','#7dff7d','#ffe14a','#4fe0ff','#ff9a2a','#ff4a3a'].map(c=>`<button class="swc ${S.xhColor===c?'sel':''}" style="background:${c}" data-a="xhc:${c}" aria-label="${c}"></button>`).join('');
  openWin('settings',()=>`${hd('Settings',`<span style="font-size:12px;color:#bfa27e">${String(Math.floor(CLK.h)).padStart(2,'0')}:${String(Math.floor(CLK.h%1*60)).padStart(2,'0')}</span>`)}<div class="bd"><div class="col setcol" style="overflow:auto;touch-action:pan-y">
    <h4>Controls</h4>
    ${sl('sens','Look sensitivity',0.3,2.5,0.05)}${sl('adsSens','ADS sensitivity',0.2,1.5,0.05)}${sl('smooth','Camera smoothing',0,0.9,0.05)}${sl('btnScale','Button size',0.7,1.5,0.05)}${sl('opacity','Button opacity',0.25,0.9,0.05)}
    <div class="tgs">${tg('autosprint','Auto-sprint',S.autoSprint)}${tg('aimassist','Aim assist',S.aimAssist)}${tg('adsmode','ADS toggle',S.adsToggle)}${tg('invy','Invert Y',S.invertY)}${tg('autofire','Fire assist',S.autoFire)}${tg('haptics','Vibration',S.haptics!==false)}${tg('lefty','Left-handed',S.lefty)}</div>
    <div class="row" style="margin-top:6px"><button class="btn" data-a="layout">✥ Edit button layout</button><button class="btn" data-a="view">View: ${P.view==='fp'?'First person':'Third person'}</button></div>
    <h4 style="margin-top:10px">Audio</h4>
    ${sl('a_master','Master volume',0,1,0.05,audio.v.master)}${sl('a_sfx','Effects',0,1,0.05,audio.v.sfx)}${sl('a_music','Music &amp; ambience',0,1,0.05,audio.v.music)}
    <div class="row" style="margin-top:4px"><button class="btn" data-a="mute">${audio.muted?'🔇 Sound: OFF':'🔊 Sound: ON'}</button></div></div>
    <div class="col setcol" style="flex:0 0 40%;overflow:auto;touch-action:pan-y"><h4>Crosshair</h4>
    <div class="xhprev"><span class="pv" style="--xc:${S.xhColor};--xo:${S.xhOpacity}"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></span><div class="swr">${sw}</div></div>
    ${sl('xhOpacity','Crosshair opacity',0.2,1,0.05)}
    <h4 style="margin-top:10px">Game</h4><div class="row" style="flex-direction:column;align-items:stretch;gap:6px"><button class="btn" data-a="save">💾 Save game</button><button class="btn ${hasSave()?'':'dis'}" data-a="load">📂 Load game</button><button class="btn" data-a="journal">📖 Journal</button><button class="btn" data-a="tips">💡 Replay tutorial hints</button><button class="btn" data-a="reset">↺ Reset settings &amp; layout</button><button class="btn red" data-a="wipe">Delete save</button></div>
    <div style="font-size:11px;color:#bfa27e;margin-top:8px">PC: WASD move · mouse look (click to capture) · LMB fire · RMB ADS · E use · R reload · C crouch · Z prone · 1–4 weapons · G grenade · V melee · I pack · M map · J journal · T light · B view · N mute · F car</div></div></div>`,
    (a)=>{if(a==='mute'){audio.init();audio.setMuted(!audio.muted)}else if(a==='view')toggleView();else if(a==='adsmode'){S.adsToggle=!S.adsToggle;saveSettings()}else if(a==='invy'){S.invertY=!S.invertY;saveSettings()}else if(a==='autofire'){S.autoFire=!S.autoFire;saveSettings()}
      else if(a==='autosprint'){S.autoSprint=!S.autoSprint;saveSettings()}else if(a==='aimassist'){S.aimAssist=!S.aimAssist;saveSettings()}else if(a==='haptics'){S.haptics=!(S.haptics!==false);saveSettings();if(S.haptics)vibe(20)}
      else if(a==='lefty'){S.lefty=!S.lefty;saveSettings();layoutInput()}
      else if(a.startsWith('xhc:')){S.xhColor=a.slice(4);saveSettings()}
      else if(a==='layout'){closeWin(true);startLayoutEditor()}
      else if(a==='tips'){resetTips();feed('Hints will show again')}
      else if(a==='save')saveGame(true);else if(a==='load'){closeWin(true);loadGame()}else if(a==='journal')journalWin();
      else if(a==='reset'){Object.assign(S,SETTINGS_DEFAULT);saveSettings();resetLayout();layoutInput();audio.setLevel('master',0.8);audio.setLevel('sfx',1);audio.setLevel('music',0.7)}
      else if(a==='wipe'){try{localStorage.removeItem(SAVEKEY)}catch(_){}feed('Save deleted')}},{cls:'wide'});
}
ui.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.sl;if(!k)return;const v=+e.target.value;
  if(k.startsWith('a_')){audio.init();audio.setLevel(k.slice(2),v);if(k==='a_sfx'||k==='a_master')audio.ui('tick')}
  else{S[k]=v;saveSettings();if(k==='btnScale'||k==='opacity')layoutInput();if(k==='xhOpacity'){const pv=document.querySelector('.xhprev .pv');pv&&pv.style.setProperty('--xo',v)}}
  const o=e.target.parentNode.querySelector('output');if(o)o.textContent=v.toFixed(2)});
function toggleView(){P.view=P.view==='fp'?'tp':'fp';S.view=P.view;saveSettings();feed(P.view==='fp'?'First-person view':'Third-person view');vm.visible=P.view==='fp'}
function refreshSlotsUI(){
  for(let i=1;i<=4;i++){const it=inv.slots[i];let icon='',ammo='',empty=!it,low=false;
    if(i===4){const id=it;const n=id?inv.count(id):(inv.count('grenade')+inv.count('molotov'));icon=(id==='molotov')?'molotov':'grenade';ammo=n||'';empty=!n}
    else if(it){const b=WEAPONS[it.wid];icon='w_'+weaponClass(b);if(b.slot<=2){const res=inv.ammoCount(b.cal);ammo=P.slot===i?(P.reloadT>0?'···':it.mag+'/'+res):it.mag;low=it.mag===0}else ammo=''}
    slotUpdate(i,{icon,ammo,on:P.slot===i,empty});setAmmoLow(i,low)}
}

// ============================================================ v5 : player update, interaction, camera, HUD, drops, loop
const DRIVE_MAX=27;
const GRAV=15,JUMPV=5.6;
let aimFaceT=0,lastLookT=0,footAcc=0,prevFire=false,hudT=0,respT=0,glintT=0,hungerWarn=0;
hero.root.rotation.order='YXZ';
refreshGun();refreshSlotsUI();
function groundY(x,z){
  if(P.onPlat){const p=P.onPlat;if(Math.abs(x-p.x)<=p.hw&&Math.abs(z-p.z)<=p.hd)return p.y;P.onPlat=null}
  return terrainH(x,z)}
function surfaceAt(){
  if(P.onPlat||P.y>3)return 'wood';
  if(insideRuin())return 'concrete';
  if(Math.abs(P.x)<HX&&Math.abs(P.z)<HZ)return Math.abs(P.x)<5?'concrete':'dirt';
  if(Math.abs(P.x-roadX(P.z))<3.2)return 'concrete';
  return fbm(P.x*0.015+200,P.z*0.015,3)>0.64?'grass':'dirt'}
function insideRuin(){for(const r of RUINS){const dx=P.x-r.x,dz=P.z-r.z,c=Math.cos(r.yaw),s=Math.sin(r.yaw);const lx=dx*c-dz*s,lz=dx*s+dz*c;if(Math.abs(lx)<r.w/2+0.3&&Math.abs(lz)<r.d/2+0.3)return r}return null}
function enterCar(){
  if(P.inCar||P.dead)return;closeWin(true);setStance(0);P.inCar=true;hero.root.visible=false;vm.visible=false;cam.tdist=9;cam.tpitch=0.2;IN.vehicle=true;setMode({vehicle:true});IN.ads=false;
  toast(IN.touch?'Steer ◀ ▶ · GAS · BRAKE · EXIT':'WASD drive · SPACE handbrake · F exit',2600);audio.ui('click');
}
function exitCar(force){
  if(!P.inCar)return;P.inCar=false;setStance(0);hero.root.visible=P.view!=='fp';IN.vehicle=false;setMode({vehicle:false});IN.gas=IN.brake=IN.hb=false;
  const sx=Math.cos(CAR.yaw),sz=-Math.sin(CAR.yaw);
  P.x=CAR.x-sx*2.1;P.z=CAR.z-sz*2.1;P.yaw=CAR.yaw;P.y=terrainH(P.x,P.z);cam.tdist=P.view==='fp'?0.01:5.2;resolveCircle(P,0.4);audio.engineUpdate(false,0);
}
function setStance(s){if(P.stance===s)return;P.stance=s;hero.crouch=s>0?1:0;}
function updatePlayer(dt){
  const t=time;
  P.shotCool=Math.max(0,P.shotCool-dt);P.swingCool=Math.max(0,P.swingCool-dt);P.hurtT=Math.max(0,P.hurtT-dt);P.fireCd=Math.max(0,P.fireCd-dt);P.swapT=Math.max(0,P.swapT-dt);P.throwT=Math.max(0,P.throwT-dt);P.lastHurt+=dt;
  P.bloom=Math.max(0,P.bloom-dt*1.8);P.rcl=Math.max(0,P.rcl-dt*7);P.slow=Math.max(0,(P.slow||0)-dt);
  if(P.dmgFrom)P.dmgFrom.t-=dt;
  // look input (consume once per frame; touch or mouse)
  let lx=IN.lookX,ly=IN.lookY;IN.lookX=IN.lookY=0;
  if(IN.touch&&S.smooth>0&&dt>0){smLX+=lx;smLY+=ly;const a=1-Math.exp(-dt*(46*(1-S.smooth)+7));lx=smLX*a;ly=smLY*a;smLX-=lx;smLY-=ly;if(Math.abs(smLX)<1e-5)smLX=0;if(Math.abs(smLY)<1e-5)smLY=0}
  if(dt>0){const r=aimAssist(dt,lx,ly);lx=r[0];ly=r[1]}
  if(lx||ly){lastLookT=gameT;cam.tyaw-=lx;cam.tpitch=clamp(cam.tpitch+ly,P.view==='fp'||P.scoped?-1.35:-0.35,P.view==='fp'||P.scoped?1.35:1.25)}
  // recoil recovery: camera returns slowly toward pre-shot pitch (only when not actively looking)
  if(IN.wheel){cam.tdist=clamp(cam.tdist+IN.wheel*0.004,2.2,10);IN.wheel=0}
  pollKeys();
  // ---- one-shot UI/actions
  if(IN.take('layoutDone'))settingsWin();
  if(IN.take('view'))toggleView();
  if(IN.take('flash')){P.light=!P.light;audio.ui('click');feed(P.light?'Flashlight on':'Flashlight off')}
  if(IN.take('mute')){audio.init();audio.setMuted(!audio.muted);feed(audio.muted?'Sound off':'Sound on')}
  if(IN.take('inv')){if(WIN&&WIN.name==='inv')closeWin();else invWin()}
  if(IN.take('map')){if(WIN&&WIN.name==='map')closeWin();else mapWin()}
  if(IN.take('journal')){if(WIN&&WIN.name==='journal')closeWin();else journalWin()}
  if(IN.take('settings')){if(WIN&&WIN.name==='settings')closeWin();else settingsWin()}
  if(IN.take('escape')){if(WIN)closeWin();else settingsWin()}
  if(P.dead){P.deadT+=dt;hero.dead=Math.min(1,hero.dead+dt*2.2);animateHuman(hero,dt,t);
    if(P.deadT>3.6){P.dead=false;P.hp=70;P.x=SPAWN.x;P.z=SPAWN.z;P.y=terrainH(P.x,P.z);hero.dead=0;hero.root.rotation.x=0;inv.cash=Math.floor(inv.cash*0.85);el.wasted.classList.remove('show');P.wanted=0;P.stance=0;hero.crouch=0;P.onPlat=null;toast('You wake up inside Rust Haven.',2600);
      for(const r of raiders)if(!r.dead&&r.state!=='idle'){r.state='idle';r.x=r.home[0];r.z=r.home[1];r.spr.visible=false}}
    return}
  // ---- input vector
  let ix=IN.mx,iy=IN.my;let mag=Math.min(1,Math.hypot(ix,iy));
  if(P.inCar){
    const steer=(IN.steerR?1:0)-(IN.steerL?1:0);if(steer)ix=steer;
    if(IN.gas||IN.brake){iy=(IN.gas?1:0)-(IN.brake?1:0)}
    if(IN.take('car')||IN.take('interact')){exitCar();return}
    for(const k of['jump','reload','crouch','prone','melee','grenade','slot1','slot2','slot3','slot4'])IN.take(k);
    driveCar(dt,ix,iy);hero.root.visible=false;return}
  // ---- ladder climb
  if(P.climb){const c=P.climb;c.t+=dt*(c.dir>0?1.0:1.2);const k=clamp(c.t/c.dur,0,1);P.y=lerp(c.from,c.to,k);hero.speed=0;hero.actKey='Push_Loop';
    if(k>=1){P.climb=null;if(c.dir>0){P.onPlat={x:c.l.deckX,z:c.l.deckZ,hw:2.0,hd:2.0,y:c.l.y1};P.x=c.l.deckX+Math.sin(0)*0.0;P.z=c.l.deckZ;}else{P.onPlat=null;P.y=terrainH(P.x,P.z)}}
    hero.root.position.set(P.x,P.y,P.z);hero.root.rotation.y=P.yaw;animateHuman(hero,dt,t,{});return}
  // ---- stance & weapon switching
  if(IN.take('crouch')){setStance(P.stance===0?1:0);audio.ui('tick')}   // tap: stand<->crouch; from prone a tap stands up
  if(IN.take('prone')){setStance(P.stance===2?0:2);audio.ui('tick')}
  if(P.stance>0&&IN.sprint&&P.speed>0.5&&(IN.my>0.35||IN.lock)){setStance(0)}   // running always stands you up
  for(let s=1;s<=4;s++)if(IN.take('slot'+s)){if(P.slot===s&&s===4)equip(4);else if(P.slot!==s)equip(s)}
  const ws=curInst();const wd=ws?WEAPONS[ws.wid]:null;const wst=ws?weaponStats(ws):null;
  const ranged=!!wd&&wd.slot<=2;
  // ---- ADS
  const wantAds=IN.ads&&ranged&&P.swapT<=0&&!(P.reloadT>0&&!P.reloadShell&&false)&&!P.sprinting;
  P.aim+=((wantAds?1:0)-P.aim)*Math.min(1,dt*(wantAds?12:14));
  P.scoped=ranged&&wst&&wst.scoped&&P.aim>0.92;
  if(!ranged||P.sprinting)IN.ads=IN.ads&&!P.sprinting&&ranged;
  // ---- movement
  const hungerK=(P.hunger<10?0.88:1)*(P.thirst<12?0.88:1)*(P.slow>0?0.55:1);
  let stanceSp=P.stance===2?1.1:(P.stance===1?2.1:3.9);
  const wantSprint=IN.sprint&&iy>0.35&&mag>0.3&&P.stance===0&&!wantAds&&P.stamina>8&&!P.staminaLock&&P.grounded&&!(P.reloadT>0&&false);
  P.sprinting=wantSprint;
  if(wantSprint){P.stamina=Math.max(0,P.stamina-dt*(P.thirst<20?20:12));if(P.stamina<=0.5){P.staminaLock=true;feed('Out of breath')}}
  else P.stamina=Math.min(100,P.stamina+dt*(P.speed<0.5?24:9)*(P.thirst<15?0.5:1));
  if(P.staminaLock&&P.stamina>28)P.staminaLock=false;
  const target=mag>0.05?(wantSprint?7.0:(wantAds?Math.min(stanceSp,2.4):stanceSp))*mag*hungerK:0;
  P.speed+=(target-P.speed)*Math.min(1,dt*(target>P.speed?8:11));
  if(mag>0.05){
    const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
    const dx=fx*iy+rx*ix,dz=fz*iy+rz*ix,l=Math.hypot(dx,dz)||1;
    P.x+=dx/l*P.speed*dt;P.z+=dz/l*P.speed*dt;P.mvx=dx/l;P.mvz=dz/l;
    if(!(aimFaceT>0||wantAds||P.view==='fp'||P.swingT>0||P.scoped)){const want=Math.atan2(dx,dz);P.yaw+=angDiff(want,P.yaw)*Math.min(1,dt*11)}
  }
  aimFaceT=Math.max(0,aimFaceT-dt);
  if(aimFaceT>0||wantAds||P.view==='fp'||P.scoped||P.swingT>0){const want=Math.atan2(-Math.sin(cam.yaw),-Math.cos(cam.yaw));P.yaw+=angDiff(want,P.yaw)*Math.min(1,dt*(P.view==='fp'?40:(wantAds?18:8)))}
  P.x=clamp(P.x,-HALF+8,HALF-8);P.z=clamp(P.z,-HALF+8,HALF-8);
  if(P.onPlat){const p=P.onPlat;P.x=clamp(P.x,p.x-p.hw,p.x+p.hw);P.z=clamp(P.z,p.z-p.hd,p.z+p.hd)}else resolveCircle(P,P.stance===2?0.3:0.4);
  // jump / gravity
  const gy=groundY(P.x,P.z);
  if(IN.take('jump')){if(P.stance>0){setStance(0)}else if(P.grounded&&!P.onPlat){P.vy=JUMPV;P.grounded=false;audio.ui('tick')}}
  if(!P.grounded){P.vy-=GRAV*dt;P.y+=P.vy*dt;if(P.y<=gy){P.y=gy;P.vy=0;P.grounded=true;audio.thud(0.12);makeNoise(P.x,P.z,10)}}
  else{if(P.y>gy+0.4){P.grounded=false}else P.y+=(gy-P.y)*Math.min(1,dt*18)}
  // ---- fire
  const fireNow=IN.fire||(S.autoFire&&IN.ads&&ranged&&wst&&wst.auto);
  const edge=fireNow&&!prevFire;prevFire=fireNow;
  if(!IN.modal&&P.swapT<=0){
    if(P.slot===4){if(edge){throwThing()}}
    else if(wd&&wd.slot===3){if(fireNow)playerMelee(true)}
    else if(ranged){
      if(fireNow&&(wst.auto||edge)){aimFaceT=1.6;if(P.sprinting){}else playerFire()}
    }else if(!wd&&edge){playerMelee(true)}   // bare hands
  }
  if(IN.take('melee'))playerMelee();
  if(IN.take('grenade'))throwThing();
  if(IN.take('reload'))reloadStart();
  // reload progress
  if(P.reloadT>0){P.reloadT-=dt;const prog=1-P.reloadT/Math.max(0.01,P.reloadDur);if(P.reloadSt<1&&prog>0.45&&!P.reloadShell){P.reloadSt=1;audio.reload(1)}if(P.reloadT<=0){reloadFinish()}}
  if(P.reloadT<=0&&hero.reloading&&!(P.reloadShell))hero.reloading=false;
  if(P.swingT>0){const before=P.swingT;P.swingT-=dt;if(!P.hitDone&&before>0.3&&P.swingT<=0.3){P.hitDone=true;meleeHitCheck()}}
  // ---- interaction
  updateInteractions(dt);
  // footsteps
  if(P.speed>0.8&&P.grounded){footAcc+=P.speed*dt;const stride=P.sprinting?2.4:2.0;if(footAcc>stride){footAcc=0;audio.step(surfaceAt(),P.sprinting,{crouch:P.stance>0});makeNoise(P.x,P.z,P.sprinting?22:(P.stance===0?9:(P.stance===1?4:2)))}}
  // ---- animation
  hero.speed=P.stance===2?Math.min(P.speed,0.45)*0:P.speed;hero.aim=(wantAds||aimFaceT>0)&&ranged?1:0;hero.crouch=P.stance>0?1:0;
  hero.swing=P.swingT>0?P.swingT/0.55:0;
  animateHuman(hero,dt,t,{});
  if(hero.aimKick>0){hero.aimKick-=dt}
  hero.root.position.set(P.x,P.y+(P.stance===2?0.14:0),P.z);hero.root.rotation.y=P.yaw;
  const tilt=P.stance===2?1.38:0;hero.root.rotation.x+=(tilt-hero.root.rotation.x)*Math.min(1,dt*10);
  // ---- survival meters
  const day=dt/60;
  P.hunger=Math.max(0,P.hunger-dt*0.12*(P.sprinting?1.5:1));P.thirst=Math.max(0,P.thirst-dt*0.17*(P.sprinting?1.6:1));
  if(P.hunger<=0||P.thirst<=0){if(Math.random()<dt*0.5)damagePlayer(1)}else if(P.hp<100&&P.hunger>30&&P.thirst>30&&P.lastHurt>8)P.hp=Math.min(100,P.hp+dt*0.6);
  hungerWarn-=dt;if(hungerWarn<=0&&(P.hunger<20||P.thirst<20)){hungerWarn=40;feed(P.thirst<20?'You are thirsty':'You are hungry','#d3a63c')}
  if(P.speed>5&&Math.random()<dt*14)dustB.emit(P.x+rr(-.2,.2),P.y+0.1,P.z+rr(-.2,.2),rr(-.3,.3)-Math.sin(P.yaw)*0.5,rr(.2,.6),rr(-.3,.3)-Math.cos(P.yaw)*0.5,{life:rr(.6,1.1),size:.35,grow:3,a:0.3,c0:[.6,.5,.38],c1:[.55,.47,.38]});
  // search progress
  if(P.searching){const s=P.searching;s.t+=dt;if(Math.hypot(P.x-s.sx,P.z-s.sz)>0.6||P.sprinting){cancelSearch('Search cancelled')}else{
      document.querySelector('#sbarw .b i').style.width=(s.t/s.dur*100)+'%';if(Math.random()<dt*7)audio.search();if(s.t>=s.dur)finishSearch()}}
}
// ---------------------------------------------------------------- interactions
const IAT={cand:null};
function nearest(list,px,pz,maxD){let b=null,bd=maxD;for(const e of list){const d=Math.hypot(e.x-px,e.z-pz);const dd=d-(e.rad!==undefined?0:0);if(dd<bd){bd=dd;b=e}}return b}
function findTarget(){
  let best=null,bs=1e9;const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);
  const consider=(type,o,x,z,r,label,y)=>{const dx=x-P.x,dz=z-P.z,d=Math.hypot(dx,dz);if(d>r)return;
    if(y!==undefined&&Math.abs(y-P.y)>2.6)return;
    const fwd=d>0.01?(dx*fx+dz*fz)/d:1;const sc=d-fwd*0.9;if(sc<bs){bs=sc;best={type,o,label,x,z,d}}};
  const fire=P.inCar;
  if(!P.inCar){
    const dCar=Math.hypot(P.x-CAR.x,P.z-CAR.z);if(dCar<3.8)consider('car',CAR,CAR.x,CAR.z,3.8,'Enter car');
    if(MS.main===0&&pickup.obj.visible)consider('part',pickup,pickup.obj.position.x,pickup.obj.position.z,2.6,'Take radio part');
    for(const c of CONT){const ry=c.y;if(c.searched&&c.items&&c.items.length===0&&c.follow&&false)continue;
      const dx=c.x-P.x,dz=c.z-P.z;if(dx*dx+dz*dz>c.rad*c.rad)continue;if(Math.abs(c.y-P.y)>2.4&&!P.onPlat)continue;
      consider('cont',c,c.x,c.z,c.rad,(c.lock&&!c.unlocked?'Unlock ':(c.searched?'Open ':'Search '))+c.name.toLowerCase(),undefined)}
    for(const d of DOORS)consider('door',d,d.x,d.z,2.0,(d.locked?'Unlock ':(d.open?'Close ':'Open '))+(d.name==='Inner door'?'door':d.name.toLowerCase()));
    for(const a of IA){let lab=a.label;
      if(a.type==='bench')lab=genOn()?'Use workbench':'Workbench (no power)';else if(a.type==='bed')lab='Rest at bed';else if(a.type==='gen')lab=GEN.on?`Generator · ${GEN.fuelH.toFixed(1)}h fuel`:'Generator (off)';
      else if(a.type==='board')lab='Read bounty board';else if(a.type==='radio')lab='Play radio';else if(a.type==='water')lab=a.clean?'Clean water tap':'Stagnant pond';
      consider(a.type,a,a.x,a.z,a.r,lab)}
    for(const n of npcs){if(n.dead||!n.H.root.visible)continue;const role=n.role;
      consider('npc',n,n.x,n.z,role==='mechanic'?3.6:2.6,role==='vendor'?'Talk to trader':(role==='mechanic'?'Talk to mechanic':(role==='tess'?'Talk to Tess':(role==='marshal'?'Talk to the Marshal':(n.kind==='guard'?'Talk to guard':'Talk')))))}
    for(const fb of fireBarrels)consider('fire',fb,fb.x,fb.z,2.2,'Warm up / cook at fire');
    for(const l of ladders){const dd=Math.hypot(P.x-l.x,P.z-l.z);if(!P.onPlat)consider('ladder',l,l.x,l.z,1.6,'Climb ladder');else consider('ladder',l,l.x,l.z,3.4,'Climb down')}
    for(const d of dropList)if(d.landed&&!d.done)consider('cont',d.c,d.c.x,d.c.z,2.4,(d.c.searched?'Open ':'Search ')+'supply drop');
  }
  return best;
}
const GEN={on:true,fuelH:5};
const genOn=()=>GEN.on&&GEN.fuelH>0;
const genLed=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.03),new THREE.MeshBasicMaterial({color:0x40ff90,toneMapped:false}));{const g=IA.find(i=>i.type==='gen');genLed.position.set(g.x+0.55,0.78,g.z-1.3+0.43);world.add(genLed)}
function doInteract(T){
  if(!T)return;audio.init();
  switch(T.type){
    case 'car':enterCar();break;
    case 'part':{inv.items.push({id:'radio_part',n:1});P.hasPart=true;MS.main=1;pickup.obj.visible=false;feed('RADIO PART ACQUIRED — take it to the mechanic','#8fe0ff');audio.ui('good');updateMissionUI();break}
    case 'cont':{if(Math.abs(T.o.y-P.y)>3)return;P.yaw=Math.atan2(T.o.x-P.x,T.o.z-P.z)+0;startSearch(T.o);break}
    case 'door':toggleDoor(T.o);break;
    case 'bench':if(!genOn()){feed('The workbench needs power — fuel the generator','#d3a63c');audio.ui('error')}else craftWin(true);break;
    case 'bed':sleepWin();break;
    case 'gen':generatorWin();break;
    case 'board':boardWin();break;
    case 'radio':playRadio(T.o);break;
    case 'water':waterWin(T.o);break;
    case 'fire':cookWin();break;
    case 'ladder':useLadder(T.o);break;
    case 'npc':talkNPC(T.o);break;
  }
}
function generatorWin(){
  dialog('Generator',GEN.on?`Running. ${GEN.fuelH.toFixed(1)} hours of fuel left. The workbench is powered.`:'The generator is off.',[
    [GEN.on?'Switch off':'Switch on',()=>{GEN.on=!GEN.on;feed(GEN.on?'Generator running':'Generator off');audio.ui('click')}],
    [`Add fuel can (${inv.count('fuel')})`,()=>{if(inv.count('fuel')){inv.remove('fuel',1);GEN.fuelH=Math.min(12,GEN.fuelH+4);GEN.on=true;feed('Added fuel (+4h)','#8fe0ff');audio.ui('good')}else feed('You have no fuel cans')}],['Leave',null]]);
}
function playRadio(a){
  const n=NOTES.find(x=>x.id===a.tape);audio.radio(true);showSubtitle(n.x,10000);
  if(!foundNotes.has(n.id)){foundNotes.add(n.id);playedTapes.add(n.id);feed('Audio log recorded: '+n.t.replace('Tape: ',''),'#6fcf6a')}
  if(a.tape==='t3'&&MS.main===2){MS.main=3;inv.cash+=100;P.rep=Math.min(10,P.rep+1);feed('SIGNAL FOUND — the coast is calling. (+$100)','#8fe0ff');updateMissionUI()}
}
function waterWin(a){
  const empty=inv.count('bottle');
  dialog(a.clean?'Clean water tap':'Stagnant pond',a.clean?'Clear water trickles from the old tower.':'Murky water. Drinking it will make you sick; boil it first.',[
    ['Drink',()=>{if(a.clean){P.thirst=Math.min(100,P.thirst+40);audio.ui('good')}else{P.thirst=Math.min(100,P.thirst+25);damagePlayer(7);feed('Tastes foul…')}}],
    [`Fill bottles (${empty})`,()=>{if(!empty){feed('You have no empty bottles');return}const id=a.clean?'water':'dirty_water';const n=Math.min(empty,inv.room(id));if(n<=0){feed('Too heavy');return}inv.remove('bottle',n);inv.add(id,n);feed('Filled '+n+' bottle'+(n>1?'s':''),'#4aaed0');audio.ui('good')}],['Leave',null]]);
}
function useLadder(l){
  if(P.climb)return;
  if(!P.onPlat){const from=terrainH(P.x,P.z);P.x=l.x;P.z=l.z;P.climb={l,t:0,dur:Math.max(2.2,(l.y1-from)/3.2),from:P.y,to:l.y1,dir:1};audio.ui('tick');setStance(0)}
  else{P.x=l.x;P.z=l.z;P.climb={l,t:0,dur:Math.max(2.0,(P.y-l.y0)/3.6),from:P.y,to:terrainH(l.x,l.z),dir:-1};P.onPlat=null;audio.ui('tick')}
}
function talkNPC(n){
  const role=n.role;
  if(role==='vendor')vendorTalk(n);else if(role==='mechanic')mechWin();else if(role==='tess')tessWin();else if(role==='marshal')marshalWin();
  else if(n.kind==='guard')dialog('Guard','"Keep your weapon holstered inside the walls."',[['Anything beyond the gate?',()=>dialog('Guard','"'+pick(['Raiders on the north road. Dogs near the old farm.','Scavengers keep to the ruins — leave them be and they leave you be.','We saw a flare to the east last night — a drop, maybe.'])+'"',[['Thanks',null]])],['Move along',null]]);
  else dialog('Survivor','"'+pick(['Heard the tower\u2019s radio might work again.','Cook your meat. Raw meat will make you sick.','Don\u2019t go out at night without a light — but raiders spot the light.','I used to be a mechanic before the Ashfall.'])+'"',[['Got any advice?',()=>dialog('Survivor','"'+pick(['Crouch in the dark, they walk right past.','Bandages first, painkillers after.','Search everything — even the skeletons.'])+'"',[['Thanks',null]])],['Leave',null]]);
}

let smLX=0,smLY=0;const _aaO=new THREE.Vector3(),_aaD=new THREE.Vector3();
function aimAssist(dt,lx,ly){ // touch only: slight friction + magnetism toward a visible enemy near the crosshair while firing/aiming
  const ci=curInst(),cw=ci?WEAPONS[ci.wid]:null;
  if(!S.aimAssist||!IN.touch||P.inCar||P.dead||IN.modal||!cw||cw.slot>2||!(IN.fire||IN.ads||P.aim>0.3))return[lx,ly];
  camera.getWorldDirection(_dir);const fx=_dir.x,fy=_dir.y,fz=_dir.z,cp=camera.position;
  let best=null,bd=1e9;
  for(const r of raiders){if(r.dead||!(r.hp>0))continue;const dx=r.x-cp.x,dy=r.y+1.2-cp.y,dz=r.z-cp.z;const d=Math.hypot(dx,dy,dz);if(d>cw.range*0.9||d<2)continue;
    if((dx*fx+dy*fy+dz*fz)/d<0.9)continue;
    const ex=Math.atan2(dx*(-fz)+dz*fx,dx*fx+dz*fz),ey=Math.asin(clamp(dy/d,-1,1))-Math.asin(clamp(fy,-1,1));const cone=clamp(0.5/d+0.03,0.035,0.11);const err=Math.hypot(ex,ey);
    if(err<cone&&err<bd){bd=err;best={r,ex,ey,d}}}
  if(!best)return[lx,ly];
  _aaO.copy(cp);_aaD.set(best.r.x-cp.x,best.r.y+1.2-cp.y,best.r.z-cp.z).normalize();
  const h=castRay(_aaO,_aaD,best.d+1,{ents:true});if(h&&!(h.kind==='ent'&&h.ent===best.r)&&h.t<best.d-0.8)return[lx,ly];
  if(IN.fire){const k=Math.min(1,dt*6)*0.4;cam.tyaw-=best.ex*k;cam.tpitch=clamp(cam.tpitch-best.ey*k*(P.view==='fp'||P.scoped?1:0.6),-1.35,1.25)}
  return[lx*0.55,ly*0.55];
}
function updateInteractions(dt){
  const T=P.inCar?null:findTarget();IAT.cand=T;
  const touch=IN.touch;
  if(T&&!IN.modal){el.prompt.textContent=(touch?'':'[E] ')+T.label;el.prompt.style.opacity=1;setLabel('interact',T.type==='cont'?'LOOT':(T.type==='car'?'CAR':'USE'));
    document.getElementById('tl')&&document.querySelector('[data-id=interact]').classList.add('show');
    const cb=document.querySelector('[data-id=car]');cb&&cb.classList.toggle('show',T.type==='car')}
  else{el.prompt.style.opacity=0;const ib=document.querySelector('[data-id=interact]');ib&&ib.classList.remove('show');const cb=document.querySelector('[data-id=car]');cb&&cb.classList.remove('show')}
  if(IN.take('interact')&&!IN.modal)doInteract(T);
  if(IN.take('car')){if(T&&T.type==='car')enterCar()}
  updateMarkers(dt);
  // wanted decay
  if(P.wantedT>0){P.wantedT-=dt;if(P.wantedT<=0)P.wanted=Math.max(0,P.wanted-1)}
}
// ---------------------------------------------------------------- loot respawn, glints, drops
function updateLootWorld(dt){
  glintT-=dt;
  if(glintT<=0){glintT=0.4;let n=0;
    for(const c of CONT){if(n>=GL_N)break;if(c.follow&&c.items&&!c.items.length)continue;if(c.searched&&!(c.follow&&c.items&&c.items.length))continue;if(c.kind==='skeleton'&&false)continue;
      const dx=c.x-P.x,dz=c.z-P.z,d2=dx*dx+dz*dz;if(d2>16*16||Math.abs(c.y-P.y)>3.5)continue;if(c.lock&&!c.unlocked&&d2>9*9)continue;
      glintPos[n*3]=c.x;glintPos[n*3+1]=c.y+(c.kind==='locker'||c.kind==='fridge'?1.9:(c.kind==='skeleton'?0.45:(c.kind==='trunk'?1.3:1.1)));glintPos[n*3+2]=c.z;n++}
    glintGeo.setDrawRange(0,n);glintGeo.attributes.position.needsUpdate=true}
  // respawn (only out of sight: >30m)
  for(const c of CONT){if(!c.searched||c.follow||!c.respawnAt)continue;if(gameT>=c.respawnAt&&Math.hypot(c.x-P.x,c.z-P.z)>30&&(!P.lootC||P.lootC!==c)){c.items=null;c.searched=false;c.respawnAt=0;c.fixed=null}}
}
const dropList=[];let dropT=100;
function spawnDrop(near){
  let x,z,tries=0;do{const a=Math.random()*6.28,r=near?18:rr(70,150);x=P.x+Math.cos(a)*r;z=P.z+Math.sin(a)*r;tries++}while(tries<30&&(Math.abs(x)>HALF-40||Math.abs(z)>HALF-40||(Math.abs(x)<HX+4&&Math.abs(z)<HZ+4)||RUINS.some(q=>Math.hypot(q.x-x,q.z-z)<10)));
  const g=makeDrop();const y=terrainH(x,z);g.position.set(x,y+(near?30:90),z);scene.add(g);
  const c=addCont('none',x,z,Math.random()*6,{y:y+0.4,tbl:'drop',name:'Supply drop',rad:2.6});c.kind='drop';
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,60,8,1,true),new THREE.MeshBasicMaterial({color:0x66ff88,transparent:true,opacity:0.16,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));beam.position.set(x,y+30,z);scene.add(beam);
  const d={x,z,y,obj:g,c,beam,landed:false,done:false,t:0,fall:near?30:90};dropList.push(d);
  feed('Supply drop inbound — see the green beam on the map','#7aff90');audio.alarm();return d}
function updateDrops(dt){
  dropT-=dt;if(dropT<=0){dropT=420+Math.random()*240;if(dropList.filter(d=>!d.done).length<2)spawnDrop(false)}
  for(let i=dropList.length-1;i>=0;i--){const d=dropList[i];
    if(!d.landed){d.fall=Math.max(0,d.fall-dt*(d.fall>6?9:4));d.obj.position.y=d.y+d.fall;d.obj.userData.chute.rotation.y+=dt*0.2;if(d.fall<=0){d.landed=true;d.obj.userData.chute.visible=false;impact(new THREE.Vector3(d.x,d.y+0.2,d.z),12,[0.8,0.7,0.5]);audio.thud(0.4);for(let k=0;k<8;k++)dustB.emit(d.x+rr(-1,1),d.y+0.3,d.z+rr(-1,1),rr(-2,2),rr(0.3,1.5),rr(-2,2),{life:rr(1,2),size:1.2,grow:3,a:0.4,c0:[.6,.5,.4],c1:[.5,.45,.4]})}}
    else if(d.c.searched&&d.c.items&&d.c.items.length===0&&!d.done){d.done=true;d.t=0}
    if(d.done){d.t+=dt;d.beam.visible=false;if(d.t>30){scene.remove(d.obj);scene.remove(d.beam);const ci=CONT.indexOf(d.c);if(ci>=0){CONT.splice(ci,1);CONT.forEach((c,k)=>c.id=k)}dropList.splice(i,1)}}
    else if(d.landed){d.beam.material.opacity=0.12+0.06*Math.sin(time*3)}}
}
// ---------------------------------------------------------------- camera
const camRay=new THREE.Vector3(),_fpPos=new THREE.Vector3();
let _vmBob=0;
function updateCamera(dt){
  const k=1-Math.pow(0.0004,dt);
  const fpWanted=P.view==='fp'&&!P.inCar||P.scoped;
  cam.yaw+=angDiff(cam.tyaw,cam.yaw)*(fpWanted?1:k);cam.pitch+=(cam.tpitch-cam.pitch)*(fpWanted?1:k);
  if(!fpWanted)cam.tpitch=clamp(cam.tpitch,-0.35,1.25);
  // post-recoil: gently pull the camera back down toward where the shot started
  if(P.rcl>0.01&&!IN.lookX&&!IN.lookY&&gameT-lastLookT>0.12){cam.tpitch+=P.rcl*dt*0.0045}
  cam.dist+=(cam.tdist-cam.dist)*k;
  if(P.inCar&&gameT-lastLookT>1.2){const want=CAR.yaw+Math.PI;cam.tyaw+=angDiff(want,cam.tyaw)*Math.min(1,dt*1.3*clamp(Math.abs(CAR.speed)/10,0,1))}
  const ruin=P.inCar?null:insideRuin();
  const ty=(P.inCar?CAR.y:P.y)+(P.stance===2?0.55:P.stance===1?1.12:1.5);
  if(fpWanted){
    const eyeY=(P.y)+(P.stance===2?0.5:P.stance===1?1.1:1.62)+(P.grounded?Math.sin(_vmBob)*0.012*clamp(P.speed/4,0,1.5):0);
    camPos.set(P.x+Math.sin(P.yaw)*0.08,eyeY,P.z+Math.cos(P.yaw)*0.08);camera.position.copy(camPos);camLook.set(P.x,eyeY,P.z);
    const cp=Math.cos(cam.pitch);camera.lookAt(camPos.x-Math.sin(cam.yaw)*cp,camPos.y-Math.sin(cam.pitch),camPos.z-Math.cos(cam.yaw)*cp);
    hero.root.visible=false;
  }else{
    const aiming=P.aim>0.3&&!P.inCar;
    const baseD=ruin&&!aiming?Math.min(cam.dist,2.9):cam.dist;
    const dist=aiming?lerp(baseD,ruin?1.5:2.15,P.aim):baseD;
    const shoulder=P.inCar?0:lerp(0.42,0.78,P.aim);
    camLook.lerp(_dir.set(P.x,ty,P.z),Math.min(1,dt*(P.inCar?7:11)));
    const cp=Math.cos(cam.pitch);
    const ox=Math.sin(cam.yaw)*cp*dist,oy=Math.sin(cam.pitch)*dist+0.2,oz=Math.cos(cam.yaw)*cp*dist;
    const rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
    camPos.set(camLook.x+ox+rx*shoulder,camLook.y+oy,camLook.z+oz+rz*shoulder);
    const minY=terrainH(camPos.x,camPos.z)+0.5;if(camPos.y<minY)camPos.y=minY;
    for(let i=0;i<4;i++){let inside=false;for(const b of boxes){if(b[0]>1e5)continue;if(camPos.x>b[0]-0.18&&camPos.x<b[2]+0.18&&camPos.z>b[1]-0.18&&camPos.z<b[3]+0.18&&camPos.y<(b.top??WALLH)+0.6&&(b[2]-b[0])*(b[3]-b[1])>0.3){inside=true;break}}
      if(!inside)break;camPos.lerp(camLook,0.3)}
    camera.position.copy(camPos);
    if(!P.inCar)hero.root.visible=true;
    cam.shake=Math.max(0,cam.shake-dt*2.6);
    camera.lookAt(camLook.x+rx*shoulder*0.7,camLook.y+0.1,camLook.z+rz*shoulder*0.7);
  }
  cam.shake=Math.max(0,cam.shake-(fpWanted?dt*2.6:0));
  const sh=cam.shake*cam.shake*0.12;camera.position.x+=Math.sin(time*57)*sh;camera.position.y+=Math.cos(time*49)*sh;
  // fov: ADS zoom
  const fov=fovBase();const ws=curInst();const zoom=ws&&!P.inCar?weaponStats(ws).zoom:1;
  const tf=P.inCar?fov+clamp(Math.abs(CAR.speed)*0.5,0,12):(P.aim>0.01?lerp(fov,fov/zoom*(P.scoped?1:1)/(P.scoped?1:1),P.aim):fov)*(P.sprinting?1.06:1);
  cam.fov+=(tf-cam.fov)*Math.min(1,dt*(P.scoped?14:6));if(Math.abs(camera.fov-cam.fov)>0.05){camera.fov=cam.fov;camera.updateProjectionMatrix();updScale()}
  camera.updateMatrixWorld();
  // view-model (FP only, or while scoped hidden)
  const showVM=P.view==='fp'&&!P.inCar&&!P.scoped&&vmS.wid&&!P.dead&&!IN.modal;
  vm.visible=!!showVM;
  if(showVM){
    _vmBob+=dt*(3+P.speed*1.6);const a=P.aim;
    const sx=lerp(0.17,0.0,a),sy=lerp(-0.2,-(vmS.def?vmS.def.sightY:0.08)-0.005,a),sz=lerp(-0.42,-0.36,a);
    vmS.kick=Math.max(0,vmS.kick-dt*7);const bob=Math.sin(_vmBob)*0.006*clamp(P.speed/4,0,1.4)*(1-a*0.8);
    const swap=P.swapT>0?P.swapT/0.35:0;
    const rel=P.reloadT>0?Math.sin(clamp(1-P.reloadT/Math.max(0.01,P.reloadDur),0,1)*Math.PI):0;
    vm.position.set(sx+Math.cos(_vmBob*0.5)*0.004*clamp(P.speed/4,0,1.4),sy+bob-swap*0.18-rel*0.1,sz+vmS.kick*0.07);
    vm.rotation.set(-vmS.kick*0.12+rel*0.5,Math.PI+vmS.kickR*vmS.kick,rel*0.35);
    vm.rotation.order='YXZ';
  }
  skyAndLights();
}
function skyAndLights(){}
// ---------------------------------------------------------------- minimap (original, extended)

function updateMarkers(dt){
  const mt=missionTarget();mMarker.visible=true;mMarker.position.set(mt.x,terrainH(mt.x,mt.z)+30,mt.z);mMarker.material.opacity=0.08+0.04*Math.sin(time*3);
  pickup.beam.visible=MS.main===0&&pickup.obj.visible;
  el.dist.textContent=`${mt.label} · ${Math.round(Math.hypot(P.x-mt.x,P.z-mt.z))} m`;
  const c=MS.scav.caches;for(let i=0;i<3;i++){const b=cacheBeams[i];const cc=c[i];b.visible=MS.scav.s===1&&cc&&!cc.looted;if(b.visible)b.position.set(cc.x,terrainH(cc.x,cc.z)+20,cc.z)}
  for(const cc of c)if(cc.searched&&!cc.looted&&(!cc.items||!cc.items.some(i=>i.id==='power_cell')))cc.looted=true;
}

// ============================================================ v5 : HUD, main loop, debug API
assembleGlows();
const sunSprite=new THREE.Vector3();
const clock=new THREE.Clock();let fpsAcc=0,fpsN=0,tAcc=0;

function simFrozen(){return IN.editing||WIN&&WIN.freeze&&WIN.name!=='loot'&&WIN.name!=='inv'}

// ---------------- v6 HUD: dynamic crosshair, hit markers, damage direction, status chip, tips
const xhEl=el.xh,hmEl=el.hit,ddEl=$('dmgdir'),hurtEl=$('hurtv'),stEl=$('hudx'),tipEl=$('tips');
let xhGap=8,xhCls='',xhCol='',xhOp=-1,xhVis=0,hmPrev=0,hmCls='';
function xhPx(st){ // same spread formula as playerFire, converted to screen pixels
  const mv=clamp(P.speed/5,0,1.4);
  const spr=st.spread*(IN.ads?0.45:1)*(1+mv*(IN.ads?0.8:1.6))*(P.stance===1?0.7:P.stance===2?0.5:1)*(P.grounded?1:2.5)+P.bloom*0.012+xhKick*0.004;
  return spr*(innerHeight*0.5)/Math.tan(camera.fov*Math.PI/360);
}
function updateCrosshair(dt){
  const ci=curInst(),cw=ci?WEAPONS[ci.wid]:null;
  const can=!P.inCar&&!P.dead&&!P.scoped&&!IN.modal&&!IN.editing&&!(P.view==='fp'&&false);
  let cls='';if(can){cls=cw?(cw.slot<=2?weaponClass(cw):'melee'):'melee'}
  const show=can&&cls;
  xhVis+=((show?1:0)-xhVis)*Math.min(1,dt*12);xhEl.style.opacity=xhVis<0.02?0:(xhVis*S.xhOpacity).toFixed(2);
  if(!show)return;
  if(cls==='bow')cls='pistol';
  if(cls!==xhCls){xhEl.className=cls;xhCls=cls}
  if(S.xhColor!==xhCol){xhEl.style.setProperty('--xc',S.xhColor);xhCol=S.xhColor}
  if(S.xhOpacity!==xhOp){xhEl.style.setProperty('--xo',S.xhOpacity);xhOp=S.xhOpacity}
  xhKick=Math.max(0,xhKick-dt*5);
  let target=2;
  if(cw&&cw.slot<=2){const px=xhPx(weaponStats(ci));target=clamp(px,0,120)}
  target+=({pistol:4,smg:4,rifle:5,sniper:5,shotgun:12}[cls]||3)*(IN.ads?0.7:1)*(P.stance>0?0.8:1);
  xhGap+=(target-xhGap)*Math.min(1,dt*(target>xhGap?34:9));
  xhEl.style.setProperty('--g',xhGap.toFixed(1)+'px');
}
const dds=[];
function addDmgDir(x,z){
  if(P.dead)return;
  for(const d of dds){if(Math.hypot(d.x-x,d.z-z)<4||(Math.abs(Math.atan2(d.z-P.z,d.x-P.x)-Math.atan2(z-P.z,x-P.x))<0.2)){d.x=x;d.z=z;d.t=1.8;return}}
  if(dds.length>5){const o=dds.shift();o.el.remove()}
  const e=document.createElement('div');e.className='dd';e.innerHTML='<i></i>';ddEl.appendChild(e);dds.push({x,z,t:1.8,el:e});
}
function updateDmgDir(dt){
  if(dds.length){camera.getWorldDirection(_dir);const fx=_dir.x,fz=_dir.z,fl=Math.hypot(fx,fz)||1;
    for(let i=dds.length-1;i>=0;i--){const d=dds[i];d.t-=dt;if(d.t<=0){d.el.remove();dds.splice(i,1);continue}
      const dx=d.x-P.x,dz=d.z-P.z;const ang=Math.atan2(dx*(-fz)+dz*fx,dx*fx+dz*fz);
      d.el.style.transform=`rotate(${ang}rad)`;d.el.style.opacity=Math.min(1,d.t*1.2)}}
  const low=P.hp<30&&!P.dead?0.28+0.2*Math.sin(time*5):0;
  const v=Math.max(Math.min(1,P.hurtT*1.6),low);hurtEl.style.opacity=v.toFixed(2);
}
function updateHUDfx(dt){
  // hit marker: white on body hits, red on headshot / kill
  if(hitmarkT>hmPrev+0.001){ // new hit this frame
    const red=hitKind==='kill'||hitKind==='head';const c=red?'red':'';
    hmEl.className=c;void hmEl.offsetWidth;hmEl.classList.add('pop');hmCls=c;
    vibe(hitKind==='kill'?[14,30,24]:10);
    hmEl.style.width=hmEl.style.height=(hitKind==='kill'?38:30)+'px';hmEl.style.margin=(hitKind==='kill'?-19:-15)+'px 0 0 '+(hitKind==='kill'?-19:-15)+'px';
  }
  hmPrev=hitmarkT=Math.max(0,hitmarkT-dt);hmEl.style.opacity=hitmarkT>0?Math.min(1,hitmarkT*8):0;
  updateCrosshair(dt);updateDmgDir(dt);updateTips(dt);
}
const _stIc={};
function updateStatusChip(){
  if(!stEl)return;const hh=Math.floor(CLK.h),mm_=Math.floor(CLK.h%1*60);const wt=inv.weight(),cap=inv.cap();
  const ic=['stand','crouch','prone'][P.stance];
  const h=`${svg(ic)}<span>${String(hh).padStart(2,'0')}:${String(mm_).padStart(2,'0')}</span><span class="dim">·</span><span class="${wt>cap*0.85?'w':''}">${wt.toFixed(0)}/${cap.toFixed(0)} kg</span>${P.stamina<30?'<span class="w">BREATH</span>':''}`;
  if(stEl._h!==h){stEl._h=h;stEl.innerHTML=h}
}
// first-run hints (shown once each, tap to dismiss)
const TIPKEY='ashfall6_tips';let tipsSeen={};try{tipsSeen=JSON.parse(localStorage.getItem(TIPKEY)||'{}')}catch(_){}
let tipQ=[],tipCur=null,tipT=0;
function tip(key,html,ms=6500){if(!S.tips||tipsSeen[key]||tipQ.some(t=>t.key===key))return;tipQ.push({key,html,ms})}
function resetTips(){tipsSeen={};try{localStorage.removeItem(TIPKEY)}catch(_){}S.tips=true;saveSettings()}
function updateTips(dt){
  if(tipCur){tipT-=dt;if(tipT<=0||IN.modal&&tipCur.key!=='x'){endTip()}}
  else if(tipQ.length&&!IN.modal&&!P.dead&&gameT>3&&!IN.editing){tipCur=tipQ.shift();tipT=tipCur.ms/1000;tipEl.innerHTML=tipCur.html+'<span class="x">got it</span>';tipEl.style.display='flex'}
}
function endTip(){if(!tipCur)return;tipsSeen[tipCur.key]=1;try{localStorage.setItem(TIPKEY,JSON.stringify(tipsSeen))}catch(_){}tipCur=null;tipEl.style.display='none'}
tipEl.addEventListener('pointerdown',e=>{endTip();e.stopPropagation()});
function tutorialTick(){ // called every HUD tick (0.1 s)
  if(!S.tips)return;
  if(IN.touch){
    tip('move','<span><b>Move</b> with the left stick. Push up into the <b>⌃⌃</b> chevron (or just hold the stick fully forward) to sprint.</span>');
    tip('look','<span><b>Swipe</b> anywhere on the right to look. Hold the big <b>FIRE</b> button to shoot, <b>AIM</b> to zoom, <b>R</b> reload.</span>');
  }else{
    tip('move','<span><b>WASD</b> move, mouse look (click the game to capture), <b>LMB</b> fire, <b>RMB</b> aim, <b>E</b> use, <b>R</b> reload.</span>');
  }
  if(IAT&&IAT.cand)tip('use','<span>Tap <b>USE</b> next to containers, doors and people. Weapons, ammo and meds are in loot — open <b>Pack</b> to equip.</span>');
  if(P.hunger<45||P.thirst<45)tip('food','<span>Hungry or thirsty? Eat and drink from your <b>Pack</b> — tap an item for options.</span>');
  if(P.hp<45)tip('hp','<span>Low health: use bandages or painkillers from your <b>Pack</b>. Hide and break line of sight to recover.</span>');
  if(gameT>40&&_night>0.6)tip('night','<span>Night: your <b>flashlight</b> (top-right icons) helps but raiders can spot it.</span>');
}
let hpWarn=0,lastApply=0;
function tick(dt){
  if(simFrozen())dt=0;
  time+=dt;gameT+=dt;updateHFrustum();
  CLK.h=(CLK.h+dt*CLK.rate)%24;lastApply-=dt;if(lastApply<=0){lastApply=0.25;applyTime()}
  if(GEN.on&&dt>0){GEN.fuelH=Math.max(0,GEN.fuelH-dt*CLK.rate);if(GEN.fuelH<=0&&GEN.on){GEN.on=false;feed('The generator ran out of fuel','#d3a63c')}}
  genLed.material.color.set(genOn()?0x40ff90:0xff3a2a);
  updatePlayer(dt);
  focus.set(P.x,P.y,P.z);
  updateEnemies(dt);updateNPCs(dt);updateCarVisual(dt);updateDoors(dt);updateProjectiles(dt);updateFire(dt);updateShells(dt);updateLootWorld(dt);updateDrops(dt);updateConvoy(dt);updateRace(dt);
  updateCamera(dt);
  // sky/sun follow; key light = sun by day, moon at night (see applyTime)
  sky.position.copy(camera.position);skyUniforms.uTime.value=time;
  sun.position.set(P.x+keyDir.x*100,Math.max(P.y,0)+keyDir.y*100+10,P.z+keyDir.z*100);sun.target.position.set(P.x,P.y,P.z);sun.target.updateMatrixWorld();
  // flashlight: desktop spot, mobile = first pool light pushed in front of the player
  const fl=P.light&&!P.inCar&&!P.dead;
  flashSpot.intensity=fl?(70+90*_night):0;
  if(MOBILE&&fl){const L=lightPool[0];camera.getWorldDirection(_dir);L.position.copy(camera.position).addScaledVector(_dir,7).add(_v2.set(0,-0.3,0));L.intensity=45+55*_night;L.distance=24;L.color.set(0xfff0d0)}
  else if(MOBILE)lightPool[0].color.set(0xff8a3a);
  updateLights(time);
  flames.update(dt);embers.update(dt);smoke.update(dt);dust.update(dt);sparks.update(dt);dustB.update(dt);
  glowU.uTime.value=time;glowU.uBlink.value=Math.sin(time*3.0)>0.45?1:0.04;
  for(const f of flashSprites){if(f.t>0){f.t-=dt;f.s.material.opacity=Math.max(0,f.t/0.07)}else f.s.material.opacity=0}
  if(flashLightT>0){flashLightT-=dt;flashLight.intensity*=0.6;if(flashLightT<=0)flashLight.intensity=0}
  for(const t of tracers){if(t.t>0){t.t-=dt;t.m.material.opacity=Math.max(0,t.t/0.09);if(t.t<=0)t.m.visible=false}}
  if(godPass){sunSprite.copy(camera.position).addScaledVector(sunDir,1000).project(camera);
    godPass.uniforms.uSun.value.set(sunSprite.x*.5+.5,sunSprite.y*.5+.5);
    const facing=camera.getWorldDirection(_dir).dot(sunDir);godPass.uniforms.uInt.value=clamp((facing+0.15)*2.0,0,1)*(sunSprite.z<1?1:0)*_dk}
  if(gradePass){gradePass.uniforms.uTime.value=time;gradePass.uniforms.uHurt.value=clamp(P.hurtT*1.6+(P.hp<30?0.35+0.15*Math.sin(time*6):0),0,1)}
  // audio ambience
  if(audio.ctx){audio.engineUpdate(P.inCar,clamp(Math.abs(CAR.speed)/DRIVE_MAX,0,1));audio.setWind(0.5+0.5*Math.sin(time*0.07)+_night*0.3);
    camera.getWorldDirection(_dir);audio.setListener(camera.position.x,camera.position.z,_dir.x,_dir.z);
    let cmb=0;for(const r of raiders){if(r.dead||r.state!=='attack')continue;const dd=Math.hypot(r.x-P.x,r.z-P.z);if(dd<75)cmb+=dd<35?0.5:0.25}
    audio.update(dt,{hp:P.hp,night:_night,combat:Math.min(1,cmb),indoor:(!P.inCar&&insideRuin())?1:0,inCar:P.inCar})}
  // ---- HUD
  updateHUDfx(dt);
  if(subT>0){subT-=dt;if(subT<=0)document.getElementById('sub').style.display='none'}
  hudT-=dt;if(hudT<=0){hudT=0.1;
    setBar(el.hp,P.hp);el.hpn.textContent=Math.ceil(P.hp);setBar(el.food,P.hunger);setBar(el.water,P.thirst);
    el.money.textContent='$'+inv.cash;
    const ci=curInst(),cw=ci?WEAPONS[ci.wid]:null;
    if(P.slot===4){const id=inv.slots[4];el.ammo.innerHTML=`<b>${id?inv.count(id):0}</b><span> thrown</span>`;el.wname.textContent=id?ITEMS[id].name.toUpperCase():'THROWABLE'}
    else if(cw&&cw.slot<=2){const st=weaponStats(ci);el.ammo.innerHTML=`<b>${P.reloadT>0?'··':ci.mag}</b><span> / ${inv.ammoCount(cw.cal)}</span>`;el.wname.textContent=cw.name.toUpperCase()+(P.reloadT>0?' · RELOADING':'')+(ci.ammoId&&ITEMS[ci.ammoId]?' · '+ITEMS[ci.ammoId].name:'')}
    else{el.ammo.innerHTML=`<b>∞</b><span> ${cw?Math.round(ci.cond)+'%':''}</span>`;el.wname.textContent=cw?cw.name.toUpperCase():'FISTS'}
    if(P.inCar){el.wname.textContent='DRIVING'}
    let s='';for(let i=0;i<3;i++)s+=`<i class="${i<Math.round(P.wanted)?'on':''}"></i>`;el.stars.innerHTML=s;
    el.rep.textContent=repName(P.rep);
    document.body.classList.toggle('driving',P.inCar);$('ammo').style.display=P.inCar?'none':'block';
    el.speed.textContent=P.inCar?Math.round(Math.abs(CAR.speed)*3.6)+' km/h':'';
    el.hp.parentElement.classList.toggle('low',P.hp<30);
    document.getElementById('scope').style.display=P.scoped&&!IN.modal?'block':'none';
    updateStatusChip();tutorialTick();
    setOn('t_view',P.view==='fp');setOn('t_flash',P.light);setOn('ads',IN.ads);
    refreshSlotsUI();
    updateMissionUI();
    drawMinimap();
    if(WIN&&(WIN.name==='inv'||WIN.name==='loot'||WIN.name==='craft'))IN.lastWinRefresh=0;
  }
  if(toastT>0){toastT-=dt;if(toastT<=0)el.toast.style.opacity=0}
}
let _fpsAcc=0,_fpsN=0,_adaptCool=4;
function updateAdaptive(dt){
  if(!MOBILE||window.__paused)return;
  _fpsAcc+=dt;_fpsN++;_adaptCool-=dt;
  if(_fpsAcc>=2.0){const fps=_fpsN/_fpsAcc;_fpsAcc=0;_fpsN=0;window.__fps=Math.round(fps);
    if(_adaptCool<=0){
      if(fps<22&&PR>0.7){PR=Math.max(0.7,PR-0.2);renderer.setPixelRatio(PR);resize();_adaptCool=3}
      else if(fps<19&&PR<=0.71&&sun.castShadow){sun.castShadow=false;_adaptCool=6;window.__shadowsOff=true}
      else if(fps>50&&PR<PR_MAX){PR=Math.min(PR_MAX,PR+0.15);renderer.setPixelRatio(PR);resize();_adaptCool=6}
    }}
}
function frame(){
  const _dt=Math.min(clock.getDelta(),0.05);if(!window.__paused)tick(_dt);
  updateAdaptive(_dt);
  if(composer)composer.render(0.016);else renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
function resize(){
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();updScale();
  if(composer){composer.setPixelRatio(PR);composer.setSize(w,h);}
  if(gradePass)gradePass.uniforms.uAsp.value=w/h;
  window.__mmW=document.getElementById('mmwrap').offsetWidth||92;layoutInput();
}
addEventListener('resize',resize);resize();
// initial pose
cam.yaw=cam.tyaw=2.45;cam.pitch=cam.tpitch=0.14;cam.dist=cam.tdist=5.2;
P.view=S.view==='fp'?'fp':'tp';
camLook.set(P.x,P.y+1.5,P.z);
applyTime();updateMissionUI();

// ============================================================ body health probe (offscreen readback) + GPU report
const gpuInfo=(()=>{const gl=renderer.getContext(),o={};try{const e=gl.getExtension('WEBGL_debug_renderer_info');o.renderer=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);o.vendor=e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR)}catch(_){}
  const c=renderer.capabilities;o.gl2=c.isWebGL2;o.maxVertUniforms=c.maxVertexUniforms;o.maxVertTex=c.maxVertexTextures;o.floatVertTex=c.floatVertexTextures;o.maxAttribs=c.maxAttributes;o.precision=c.precision;o.maxTex=c.maxTextureSize;
  o.bonesFull=GLB?GLB.models.m.bones.length:0;o.bonesGpu=GLB?GLB.models.m.rKeep.length:0;return o})();
window.__gpuInfo=gpuInfo;
function dbgReport(){const o=gpuInfo;(window.__dbgLog||console.log)('log',`GPU ${o.renderer||'?'} | gl2=${o.gl2} maxVertUniforms=${o.maxVertUniforms} vertTex=${o.maxVertTex} floatVertTex(bone-texture skinning)=${o.floatVertTex} attribs=${o.maxAttribs} prec=${o.precision}`);
  (window.__dbgLog||console.log)('log',`bones: ${o.bonesFull} in model -> ${o.bonesGpu} on GPU (${FULLRIG?'?fullrig=1':'reduced rig'}) | body mode=${BODY.mode}${BODY.report.t?' | probe '+JSON.stringify(BODY.report.bands||{}):''}`)}
const PR_RT=new THREE.WebGLRenderTarget(64,128,{depthBuffer:true}),PR_BUF=new Uint8Array(64*128*4),PR_CAM=new THREE.PerspectiveCamera(30,0.5,0.1,30),PR_BASIC=new THREE.MeshBasicMaterial({color:0xff00ff});
function probeBands(){   // coverage of the body in horizontal bands (world heights); torso/head: fraction of central columns, legs: fraction of rows touched
  const B={head:[1.5,1.68,24,40,0],chest:[1.28,1.45,24,40,0],belly:[1.0,1.2,24,40,0],thigh:[0.55,0.85,14,50,1],calf:[0.2,0.45,14,50,1]},o={};
  const top=0.95+Math.tan(15*Math.PI/180)*3.5,H=2*(top-0.95);
  for(const k in B){const [y0,y1,x0,x1,mode]=B[k];const r0=Math.floor((top-y1)/H*128),r1=Math.ceil((top-y0)/H*128);let n=0,c=0;
    for(let r=Math.max(0,r0);r<Math.min(128,r1);r++){let any=0;for(let x=x0;x<x1;x++){if(!mode)n++;if(PR_BUF[(r*64+x)*4+3]>10){if(mode)any=1;else c++}}if(mode){n++;c+=any}}
    o[k]=+(c/Math.max(n,1)).toFixed(2)}
  return o}
function bodyProbe(opts={}){
  const res={t:Math.round(performance.now())};
  try{
    const H=hero,rootVis=H.root.visible,cloneVis=H.clone.visible;
    const bg=scene.background,fogOld=scene.fog,rt=renderer.getRenderTarget(),cc=new THREE.Color(),ca=renderer.getClearAlpha();renderer.getClearColor(cc);
    H.root.visible=true;H.clone.visible=true;scene.background=null;
    const lit=[];scene.traverse(n=>{if(n.isLight)lit.push(n)});const objs=[];H.root.traverse(n=>objs.push(n));
    for(const n of objs.concat(lit))n.layers.enable(7);
    PR_CAM.layers.set(7);
    const fw=new THREE.Vector3(Math.sin(H.root.rotation.y),0,Math.cos(H.root.rotation.y)),pos=H.root.position;
    PR_CAM.position.set(pos.x+fw.x*3.5,pos.y+0.95,pos.z+fw.z*3.5);PR_CAM.lookAt(pos.x,pos.y+0.95,pos.z);PR_CAM.updateMatrixWorld();
    const vis0=objs.map(n=>n.visible);
    const run=(label,setup,override)=>{
      for(let i=0;i<objs.length;i++)objs[i].visible=vis0[i];setup();scene.overrideMaterial=override||null;
      renderer.setRenderTarget(PR_RT);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,PR_CAM);renderer.readRenderTargetPixels(PR_RT,0,0,64,128,PR_BUF);
      // readRenderTargetPixels rows go bottom->top: flip so row 0 = top
      const f=new Uint8Array(PR_BUF.length);for(let r=0;r<128;r++)f.set(PR_BUF.subarray((127-r)*256,(128-r)*256),r*256);PR_BUF.set(f);
      res[label]=probeBands();(window.__bufs=window.__bufs||{})[label]=PR_BUF.slice()};
    const hideProx=()=>{for(const m of objs)if(m.userData.px)m.visible=false};
    const onlyBody=()=>{hideProx();H.om.visible=false;if(H.eyes)H.eyes.visible=false;if(H.brows)H.brows.visible=false;H.body.visible=true};
    run('body',onlyBody);
    run('bodyBasic',onlyBody,PR_BASIC);
    run('outfit',()=>{hideProx();H.body.visible=false;H.om.visible=true;if(H.eyes)H.eyes.visible=false;if(H.brows)H.brows.visible=false});
    run('all',()=>{});
    if(opts.core)run('core',()=>{for(const m of objs)if(m.isMesh)m.visible=false;if(H.px&&H.px.core)H.px.core.visible=true});
    scene.overrideMaterial=null;for(let i=0;i<objs.length;i++)objs[i].visible=vis0[i];
    renderer.setRenderTarget(rt);renderer.setClearColor(cc,ca);scene.background=bg;scene.fog=fogOld;H.root.visible=rootVis;H.clone.visible=cloneVis;
    for(const n of objs.concat(lit))n.layers.disable(7);
    const ok=b=>b.head>=0.4&&b.chest>=0.7&&b.belly>=0.7&&b.thigh>=0.7&&b.calf>=0.6;
    res.ok=ok(res.body);res.okBasic=ok(res.bodyBasic);res.okOutfit=res.outfit.chest>=0.3;res.okAll=ok(res.all);
    const b=res.body;let verdict='off';
    if(!res.ok){verdict=(b.thigh>=0.7&&b.calf>=0.6)?'torso':'full'}
    res.verdict=verdict;
  }catch(e){res.err=String(e&&e.message||e);console.warn('bodyProbe failed',e)}
  BODY.report=res;window.__bodyCheck=res;return res}
function bodyAutoCheck(){
  const r=bodyProbe();BODY.checks=(BODY.checks||0)+1;
  if(!r.err&&r.verdict&&r.verdict!=='off'&&BODY.mode==='off'){setBodyMode(r.verdict);(window.__dbgLog||console.log)('warn','Body probe failed ('+JSON.stringify(r.body)+') -> body mode '+r.verdict);feed('Compatibility body mode: '+r.verdict,'#d3a63c')}
  else if(!r.err&&r.verdict==='full'&&BODY.mode==='torso')setBodyMode('full');
  if(!r.err&&BODY.mode==='torso'){const r2=bodyProbe();if(!r2.okAll){setBodyMode('full');(window.__dbgLog||console.log)('warn','torso proxy not enough -> full proxy body')}}
  dbgReport();return r}
setTimeout(()=>{if(BODY.mode==='off'||BODY.mode==='torso')bodyAutoCheck();else dbgReport()},2500);
setTimeout(()=>{if(BODY.mode==='off'||BODY.mode==='torso')bodyAutoCheck()},12000);
window.__game={
  hero,BODY,damagePlayer,addDmgDir,dds,tip,tipQ,startLayoutEditor,stopLayoutEditor,resetLayout,bodyProbe,bodyAutoCheck,setBodyMode,gpuInfo,GLB,
  P,CAR,cam,hero,raiders,npcs,camera,scene,renderer,composer,fireBarrels,PART,MECH,TOWER,terrainH,roadX,roadDX,inv,CONT,DOORS,RUINS,IA,MS,CLK,S,IN,audio,dropList,WEAPONS,ITEMS,
  tp(x,z,yaw){P.x=x;P.z=z;P.y=terrainH(x,z);P.onPlat=null;if(yaw!==undefined)P.yaw=yaw;camLook.set(P.x,P.y+1.5,P.z)},
  view(o){if(o.yaw!==undefined)cam.yaw=cam.tyaw=o.yaw;if(o.pitch!==undefined)cam.pitch=cam.tpitch=o.pitch;if(o.dist!==undefined)cam.dist=cam.tdist=o.dist;camLook.set(P.x,(P.inCar?CAR.y:P.y)+1.5,P.z)},
  setCar(x,z,yaw,speed=0){CAR.x=x;CAR.z=z;CAR.yaw=yaw;CAR.y=terrainH(x,z);CAR.vx=Math.sin(yaw)*speed;CAR.vz=Math.cos(yaw)*speed;CAR.speed=speed},
  enter(){enterCar()},exit(){exitCar()},
  key(k,v){IN.keys[k]=v},aim(v){IN.ads=!!v},shoot(){playerFire()},melee(){playerMelee()},
  stats(){return renderer.info.render},step(n,dt=1/30){for(let i=0;i<n;i++)tick(dt)},
  fire(){return fireBarrels.length},
  give(id,n=1){return inv.add(id,n)},giveGun(wid,att){const i=mkInst(wid,{att:att||{}});const s=WEAPONS[wid].slot;if(inv.slots[s])inv.items.push({id:'w_'+inv.slots[s].wid,n:1,inst:inv.slots[s]});inv.slots[s]=i;P.slot=s;refreshGun();refreshSlotsUI();return i},
  CV,ladders,platforms,cookWin,waterWin,killEnemy,hitEnemy,updateDoors,toggleDoor,openLockWin,equip,invWin,mapWin,journalWin,settingsWin,craftWin,vendorWin,boardWin,tessWin,marshalWin,mechWin,sleepWin,closeWin,toggleView,saveGame,loadGame,spawnDrop,startSearch,doInteract,findTarget,openLoot,convoyStart,raceStart,spawnEnemy,applyTime,feed,setStance,useLadder,readNote,
  get win(){return WIN&&WIN.name},hour(h){CLK.h=h;applyTime()},
  nearestCont(){return CONT.filter(c=>!c.follow).sort((a,b)=>Math.hypot(a.x-P.x,a.z-P.z)-Math.hypot(b.x-P.x,b.z-P.z))[0]}
};
window.__loaded=true;
requestAnimationFrame(()=>{frame();setProg(1,'Ready');setTimeout(()=>{const l=$('loading');if(l){l.style.opacity=0;setTimeout(()=>l.remove(),900)}window.__ready=true;
  if(hasSave()&&!FRESH&&!Q.has('nosave')){dialog('Welcome back','A saved game was found.',[['Continue',()=>loadGame()],['New game',null]])}},300)});
