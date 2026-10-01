// ASHFALL: RUST HAVEN — gritty post-apocalyptic open-world slice (Three.js r160)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
const skyUniforms={uTime:{value:0},uSun:{value:sunDir},uDisc:{value:1},
  cHor:{value:FOGC.clone()},cMid:{value:new THREE.Color(0x9a8068)},cTop:{value:new THREE.Color(0x4d5560)},cSun:{value:new THREE.Color(0xffa860)}};
const skyMat=new THREE.ShaderMaterial({depthWrite:false,depthTest:false,side:THREE.BackSide,fog:false,uniforms:skyUniforms,
  vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
  varying vec3 vD;uniform vec3 uSun,cHor,cMid,cTop,cSun;uniform float uTime,uDisc;
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
    col=mix(col,cloudCol,cl*0.82);
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
const groundMat=new THREE.MeshStandardMaterial({map:T.ground.map,roughnessMap:T.ground.rough,normalMap:T.ground.normal,normalScale:new THREE.Vector2(1.4,1.4),vertexColors:true,roughness:1,metalness:0,envMapIntensity:0.15});
// ground shading hook. Mobile: the repeating crack texture is flattened (it read as one tiled brown grid) and replaced by per-pixel
// world-space noise patches (pale sand, scorch, grey rock, dry grass). Pure ALU, no extra textures, no float textures.
groundMat.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
  varying vec2 vWP;
  float gh(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
  float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
  float gf(vec2 p){return .55*gn(p)+.3*gn(p*2.13+7.1)+.15*gn(p*4.3+3.7);}`)
  .replace('#include <map_fragment>',`#include <map_fragment>
  #ifdef USE_MAP
  { ${MOBILE?'':'/*desktop keeps the original texture contrast*/'}
    ${MOBILE?`float tl=max(dot(diffuseColor.rgb,vec3(.333)),.04);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb/tl*.36,.88);`:''}
    vec2 w=vWP;
    float big=gf(w*.012+3.), mid=gf(w*.06+11.), fin=gf(w*.9+5.), sc=gf(w*.028+40.), pa=gf(w*.021+90.), gr=gf(w*.017+150.), rk=gf(w*.045+200.);
    vec3 c=diffuseColor.rgb;
    c=mix(vec3(dot(c,vec3(.333))),c,.5)*vec3(1.04,1.0,.94);               // pull the very saturated orange base toward neutral so patches can read
    c*=mix(vec3(.70,.74,.80),vec3(1.30,1.14,.92),big);                      // large warm/cool drifts
    c*=.72+.56*mid;                                                         // mid-scale light/dark mottling
    c*=.82+.36*fin;                                                         // fine grit
    c=mix(c,vec3(.20,.19,.19)*(.7+.6*fin),smoothstep(.52,.64,sc)*.9);     // dark scorched patches
    c=mix(c,vec3(1.75,1.55,1.18)*(.8+.4*fin)*.52,smoothstep(.50,.62,pa)*.9);// pale sand / salt flats
    c=mix(c,vec3(.50,.66,.26)*(.8+.4*fin)*.5,smoothstep(.50,.62,gr)*.9);  // dry grass patches
    c=mix(c,vec3(dot(c,vec3(.333)))*vec3(.85,.95,1.15)*1.25,smoothstep(.52,.64,rk)*.85); // grey rubble
    diffuseColor.rgb=c;
  }
  #endif`);
};
if(MOBILE){groundMat.normalMap=null;groundMat.roughnessMap=null;groundMat.roughness=0.95}   // no tiled normal/roughness maps on phones: they read as a repeating grid
groundMat.customProgramCacheKey=()=>'ground2'+(MOBILE?'m':'d');
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
const flats=[{x:0,z:0,rx:62,rz:54},{x:TOWER.x,z:TOWER.z,rx:26,rz:26}];
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
  const cDust=new THREE.Color(0xc09566),cSand=new THREE.Color(0xd8b878),cGrass=new THREE.Color(0x9a8a4a),cDry=new THREE.Color(0xb59a58),
        cClay=new THREE.Color(0xb0643a),cRock=new THREE.Color(0x7f7568),cRockD=new THREE.Color(0x5c5047),cAsh=new THREE.Color(0x3f3934),cCrack=new THREE.Color(0x6a4b36);
  const c=new THREE.Color();
  for(let i=0;i<n;i++){
    const x=p.getX(i),z=p.getZ(i),y=p.getY(i);
    const sl=Math.hypot(terrainH(x+1.5,z)-y,terrainH(x,z+1.5)-y)/1.5;
    const tBig=fbm(x*0.006+31,z*0.006,3),tMid=fbm(x*0.02+3,z*0.02,3),tFine=fbm(x*0.12+9,z*0.12,2),tScorch=fbm(x*0.012+70,z*0.012,3),tSand=fbm(x*0.008+120,z*0.008,2),tGrass=fbm(x*0.015+200,z*0.015,3);
    // base: dust, shifted by big-scale hue regions
    c.copy(cDust).lerp(cSand,sm(0.5,0.72,tSand)*0.85);
    c.lerp(cClay,sm(0.46,0.7,tBig)*0.75);
    c.lerp(cDry,sm(0.5,0.75,tGrass)*0.6*(1-sm(0.35,0.7,sl)));
    c.lerp(cGrass,sm(0.62,0.82,tGrass)*0.55*(1-sm(0.3,0.6,sl)));
    // slope rock: steep faces go grey/brown, with layered banding by height
    const band=0.5+0.5*Math.sin(y*0.9+tMid*6);
    c.lerp(cRock,sm(0.28,0.6,sl)*0.9);c.lerp(cRockD,sm(0.5,1.0,sl)*(0.45+0.4*band));
    // dark scorched patches
    c.lerp(cAsh,sm(0.60,0.74,tScorch)*0.82*(1-sm(0.9,1.4,sl)));
    // cracked mud fines
    c.lerp(cCrack,sm(0.66,0.8,tMid)*0.35);
    // dusty shoulder along the road
    const rd=Math.abs(x-roadX(z));c.lerp(cDust,(1-sm(3,14,rd))*0.5);
    // light/dark variation: large + fine noise, altitude shading
    const l=0.78+0.5*(tMid-0.5)+0.32*(tFine-0.5)+0.22*(tBig-0.5)+clamp(y*0.008,-0.1,0.12);
    cols[i*3]=c.r*l;cols[i*3+1]=c.g*l;cols[i*3+2]=c.b*l;
    uv.setXY(i,(x+HALF)/22,(z+HALF)/22);
  }
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));g.computeVertexNormals();
  const terrain=new THREE.Mesh(g,groundMat);terrain.receiveShadow=true;world.add(terrain);
  groundMat.map.repeat.set(1,1);
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
  const cx=rr(-w/2,w/2);b.box('wood',cx,0.35,d/2+0.7,0.7,0.7,0.7,0x6a5036,0,R(),0,0.15,1);b.box('wood',cx+0.2,0.95,d/2+0.7,0.5,0.5,0.5,0x7a6040,0,R(),0,0.15,1);
  b.collide(0,0,w+0.2,d+0.2);
  b.collide(cx,d/2+0.7,0.8,0.8);
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
  const cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(const o2 of[-1.4,0,1.4])circles.push([x+sn*o2,z+cs*o2,1.05]);
  if(o.smoke)smokeSources.push({x,y:base+1.2,z,k:o.smoke});
}
const B_STATIC=new Batcher(80);
const smokeSources=[];

// ============================================================ wasteland dressing
const outside=(x,z)=>Math.abs(x)>HX+3||Math.abs(z)>HZ+3;
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
    G.models[key]={gl,scene,body,eyes,brows,idx,reg,dom,head,ringAt,bones};
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
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(this.sw,4));
    g.computeBoundingSphere();return g;
  }
}
const _tm=new THREE.Matrix4(),_tq=new THREE.Quaternion(),_te=new THREE.Euler(),_ts=new THREE.Vector3(),_tp=new THREE.Vector3();
const TM=(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{_te.set(rx,ry,rz,'YXZ');_tq.setFromEuler(_te);return new THREE.Matrix4().compose(_tp.set(x,y,z),_tq,_ts.set(sx,sy,sz))};
const SPH=(pa,pl,ta,tl)=>new THREE.SphereGeometry(1,18,12,pa,pl,ta,tl);
function buildOutfit(mod,s){
  const O=new Outfit(),bi=n=>mod.idx[n],H=mod.head,female=s.female;
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
  g.setIndex(src.index);g.setAttribute('aCol',new THREE.BufferAttribute(col,3));g.setAttribute('aCl',new THREE.BufferAttribute(cl,1));
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
  const om=new THREE.SkinnedMesh(ogeo,M.cloth2);om.bind(body.skeleton,body.bindMatrix);om.name='outfit';body.parent.add(om);
  const meshes=[body,om];if(eyes)meshes.push(eyes);if(brows)meshes.push(brows);
  for(const m of meshes){m.castShadow=true;m.receiveShadow=false;m.frustumCulled=false}   // skinned bounds are unreliable on some mobile drivers; we cull per-human below
  const root=new THREE.Group();root.add(clone);
  const sy=o.scale??(0.95+R()*0.1),sx=o.wscale??(0.94+R()*0.12);root.scale.set(sx,sy,sx);
  const H={root,glb:true,noCull:!!o.noCull,clone,body,om,eyes,brows,female,mixer:new THREE.AnimationMixer(clone),acts:{},cur:{},gait:'idle',
    phase:0,speed:0,aim:0,swing:0,dead:0,talk:0,seed:Math.random()*100,weapon:null,weapons:{},bones:{},osT:0,fireT:0,hitT:0,reloading:false,_sw:0,_dead:false,lodT:Math.random(),accT:0,
    head:new THREE.Object3D(),hips:new THREE.Object3D(),spine:new THREE.Object3D()};
  clone.traverse(n=>{if(n.isBone)H.bones[n.name]=n});
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
  H.shoot=()=>{H.fireT=0.28;H.fresh='fire'};
  H.hit=()=>{H.hitT=0.5;H.fresh='hit'};
  return H;
}
function setWeaponG(H,w){H.weapon=w;for(const k in H.weapons)H.weapons[k].visible=(k===w);H.muzzle=w==='shotgun'?H.muzzleShotgun:H.muzzlePistol}
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
  const ranged=H.weapon==='pistol'||H.weapon==='shotgun';
  // distance LOD for animation cost + face meshes
  if(H.root.visible){
    H.root.getWorldPosition(_cd);const d2=_cd.distanceToSquared(camera.position);
    _cs.center.copy(_cd);_cs.center.y+=1.0;_cs.radius=2.6;
    const inView=H.noCull||d2<9||(d2<(MOBILE?120*120:220*220)&&HFRUSTUM.intersectsSphere(_cs));
    if(H.inView!==inView){H.inView=inView;H.clone.visible=inView}
    if(!inView&&H.dead<=0){H.accT+=dt;if(H.accT<0.5)return}
    const far=d2>70*70;
    if(H.eyes)H.eyes.visible=d2<22*22;if(H.brows)H.brows.visible=d2<22*22;
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
  else if(g==='idle'){low=H.idleClip}
  else if(g==='walk'){low='Walk_Loop';ts=clamp(sp/1.5,0.7,2.1)}
  else if(g==='jog'){low='Jog_Fwd_Loop';ts=clamp(sp/3.7,0.8,1.6)}
  else{low='Sprint_Loop';ts=clamp(sp/6.4,0.8,1.3)}
  // one-shot triggers (edge detected)
  if(H.swing>0&&!H._sw){H.osKey='Sword_Attack';H.osT=0.6;H.osTs=2.5;H.osFresh=true}
  H._sw=H.swing>0;
  if(H.fresh==='fire'){H.fresh=null;H.osKey2='Pistol_Shoot';H.osT2=0.3;H.osFresh2=true}
  if(H.fresh==='hit'){H.fresh=null;if(!(H.osT>0)){H.osKey='Hit_Chest';H.osT=0.5;H.osTs=1.6;H.osFresh=true}}
  if(H.dead>0&&!H._dead){H._dead=true;H.osT=0;H.osT2=0}
  if(H.dead<=0&&H._dead){H._dead=false}
  setLayer(H,'low',low+'_l',ts,{once,force:H.dead>0&&!H.cur.low?.key.startsWith('Death01'),fade:once?0.12:0.22});
  // upper-body choice
  let upKey=low,uts=ts,uOnce=once,uForce=false;
  if(H.dead>0){upKey='Death01';uOnce=true}
  else if(H.osT>0){upKey=H.osKey;uts=H.osTs;uOnce=true;uForce=!!H.osFresh;H.osFresh=false;H.osT-=dt}
  else if(H.osT2>0&&ranged){upKey=H.osKey2;uts=1.7;uOnce=true;uForce=!!H.osFresh2;H.osFresh2=false;H.osT2-=dt}
  else if(H.reloading&&ranged){upKey='Pistol_Reload';uts=1.0;uOnce=true}
  else if(H.aim>0.4&&ranged){upKey='Pistol_Aim_Neutral';uts=1}
  else if(ranged&&!(g==='idle'&&H.idleClip==='Pistol_Idle_Loop')){upKey='Pistol_Idle_Loop';uts=1}
  setLayer(H,'up',upKey+'_u',uts,{once:uOnce,force:uForce,fade:uForce?0.06:0.18,syncTo:(!uOnce&&upKey===low)?H.cur.low?.a:null});
  H.mixer.update(dt);
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
const P={x:SPAWN.x,z:SPAWN.z,y:0,yaw:Math.PI,vy:0,hp:100,hunger:82,thirst:68,ammo:12,reserve:36,money:45,rep:2,wanted:0,wantedT:0,speed:0,aim:0,swingT:0,swingCool:0,shotCool:0,inCar:false,hasPart:false,mission:0,dead:false,reload:0,hurtT:0};
const hero=createHuman({hero:true,noCull:true,unique:true,cls:'hero',female:false,tone:1,scale:1,wscale:1,longSleeve:true,hat:'cap',hatCol:0x6a2f2a,beard:true,hair:0x2a1e14,pack:true,packCol:0x5a6240,rollCol:0x8a3a2a,scarf:0x8a3a2a,goggles:false,holster:true,jacket:0x6a4a2a,shirt:0x5a5a40,pants:0x3e3a34,weapon:'pipe',pal:null});
ents.add(hero.root);
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

// ============================================================ raiders
const raiders=[];
function spawnRaider(x,z,o={}){
  const H=createHuman({...randLook({hat:pick(['hood','beanie','helmet','hair'])}),pal:pick([{shirt:0x3a2a2a,pants:0x2a2a2a,jacket:0x2e2a26},{shirt:0x4a3a2a,pants:0x30302c,jacket:0x1e2024},{shirt:0x5a2a22,pants:0x2a2c30,jacket:0x2a2a22}]),mask:pick([0x2a2a2a,0x6a2f2a,0x3a3a30]),weapon:o.weapon||pick(['pistol','pipe','shotgun']),pack:false,scarf:R()<0.6?0x5a2a22:0,holster:true,cls:'raider',female:false,pads:R()<0.5?0x3a3a34:0,vest:R()<0.5,longSleeve:R()<0.5});
  H.root.position.set(x,terrainH(x,z),z);ents.add(H.root);H.stanceWide=true;
  const r={H,x,z,y:terrainH(x,z),yaw:R()*6.28,hp:60,state:'idle',home:[x,z],cd:1+R()*2,t:0,melee:H.weapon==='pipe',alertT:0,strafe:R()<.5?1:-1,strafeT:0,dead:false,deadT:0,flash:0,speed:0,id:raiders.length,lootDone:false};
  raiders.push(r);return r;
}
const rp0=roadX(-120);
spawnRaider(rp0+6,-122,{weapon:'shotgun'});spawnRaider(rp0-7,-130,{weapon:'pistol'});spawnRaider(rp0+3,-112,{weapon:'pipe'});
const rp1=roadX(95);
spawnRaider(rp1-6,92,{weapon:'pistol'});spawnRaider(rp1+7,100,{weapon:'pipe'});
const rp2=roadX(-215);
spawnRaider(rp2+5,-212,{weapon:'shotgun'});spawnRaider(rp2-6,-220,{weapon:'pistol'});
// raider camp dressing at the radio part site: crashed van + barrels + fire
const PART={x:rp0+1.5,z:-118};PART.y=terrainH(PART.x,PART.z);
{
  const b=new Bld(B_STATIC,PART.x,PART.z,0.7);
  b.box('plate',0,0.9,0,2.1,1.7,4.2,new THREE.Color(0.75,0.7,0.65),0,0,0.05,0.06,1.6,0.08);
  b.box('paint',0,1.8,-0.6,1.9,0.2,2.6,0x6a6a60,0,0,0,0.06,1,0.05);
  B_STATIC.build(world);
}

// ============================================================ input
const keys={};const act={attackQ:false,shootQ:false,useQ:false,reloadQ:false};
let aimHeld=false,aimToggle=false,fireHeld=false,runToggle=false;
addEventListener('keydown',e=>{if(e.repeat&&e.code!=='KeyF')return;keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  if(e.code==='KeyF')act.useQ=true;if(e.code==='KeyR')act.reloadQ=true;if(e.code==='KeyV')act.attackQ=true;});
addEventListener('keyup',e=>{keys[e.code]=false});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;aimHeld=false;fireHeld=false});
const joy={x:0,y:0,id:null};
const stick=$('stick'),knob=$('knob');
function joyMove(e){const r=stick.getBoundingClientRect();let dx=(e.clientX-(r.left+r.width/2))/(r.width/2),dy=(e.clientY-(r.top+r.height/2))/(r.height/2);const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}joy.x=dx;joy.y=dy;knob.style.transform=`translate(${dx*38}px,${dy*38}px)`}
stick.addEventListener('pointerdown',e=>{joy.id=e.pointerId;stick.setPointerCapture(e.pointerId);joyMove(e);e.preventDefault()});
stick.addEventListener('pointermove',e=>{if(e.pointerId===joy.id)joyMove(e)});
const joyEnd=e=>{if(e.pointerId===joy.id){joy.id=null;joy.x=joy.y=0;knob.style.transform=''}};
stick.addEventListener('pointerup',joyEnd);stick.addEventListener('pointercancel',joyEnd);
if(MOBILE||Q.get('mobile')==='1')document.body.classList.add('mobile');
// touch buttons
const btnState={run:false};
function bindBtn(id,down,up){const b=$(id);if(!b)return;b.addEventListener('pointerdown',e=>{b.classList.add('on');b.setPointerCapture(e.pointerId);down&&down();e.preventDefault();e.stopPropagation()});
  const end=e=>{b.classList.remove('on');up&&up();};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end)}
bindBtn('bAtk',()=>{act.attackQ=true});
bindBtn('bShoot',()=>{act.shootQ=true;aimToggle=true;aimTimer=3.5;fireHeld=true},()=>{fireHeld=false});
bindBtn('bAim',()=>{aimToggle=!aimToggle;aimTimer=99},null);
bindBtn('bUse',()=>{act.useQ=true});
bindBtn('bRun',()=>{btnState.run=true},()=>{btnState.run=false});
bindBtn('bReload',()=>{act.reloadQ=true});
let aimTimer=0;
// camera drag (mouse + touch). Short clicks = melee, hold RMB = aim.
let drags=new Map(),clickInfo=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.target!==canvas)return;
  drags.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t:performance.now(),btn:e.button,moved:0});
  canvas.setPointerCapture(e.pointerId);
  if(e.pointerType==='mouse'){if(e.button===2){aimHeld=true}if(e.button===0){fireHeld=aimHeld||aimToggle;if(fireHeld)act.shootQ=true}}
});
canvas.addEventListener('pointermove',e=>{const d=drags.get(e.pointerId);if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;d.moved+=Math.abs(dx)+Math.abs(dy);
  const k=e.pointerType==='mouse'?1:1.15;cam.tyaw-=dx*0.0052*k;cam.tpitch=clamp(cam.tpitch+dy*0.0038*k,-0.35,1.25)});
const endDrag=e=>{const d=drags.get(e.pointerId);if(!d)return;drags.delete(e.pointerId);
  if(e.pointerType==='mouse'){if(e.button===2)aimHeld=false;if(e.button===0){fireHeld=false}}
  if(d.btn===0&&d.moved<8&&performance.now()-d.t<350&&!(e.pointerType==='mouse'&&(aimHeld||aimToggle))){act.attackQ=true}};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('wheel',e=>{cam.tdist=clamp(cam.tdist+e.deltaY*0.005,3,12);e.preventDefault()},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// ============================================================ HUD helpers
const el={hp:$('hpFill'),hpn:$('hpNum'),food:$('foodFill'),water:$('waterFill'),money:$('money'),stars:$('stars'),rep:$('rep'),ammo:$('ammo'),wname:$('wname'),mission:$('mTitle'),msub:$('mSub'),prompt:$('prompt'),toast:$('toast'),dist:$('mDist'),hit:$('hitmark'),cross:$('cross'),wasted:$('wasted'),dmg:$('dmgflash'),speed:$('speed')};
let toastT=0;function toast(t,ms=3200){el.toast.textContent=t;el.toast.style.opacity=1;toastT=ms/1000}
function setBar(e,v){e.style.width=clamp(v,0,100)+'%'}
function repName(r){return r>=8?'LEGEND':r>=5?'TRUSTED':r>=2?'KNOWN':'STRANGER'}

// ============================================================ misc state
let time=0,gameT=0,hitmarkT=0,flashLightT=0;
const tracers=[];
const trMat=new THREE.MeshBasicMaterial({color:0xffd8a0,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false});
for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1,4).rotateX(Math.PI/2).translate(0,0,0.5),trMat.clone());m.visible=false;scene.add(m);tracers.push({m,t:0})}
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
function missionTarget(){
  if(P.mission===0)return {x:PART.x+2.2,z:PART.z-1.4,label:'Radio part'};
  if(P.mission===1)return {x:MECH.x+5.4,z:MECH.z+0.5,label:'Mechanic'};
  return {x:TOWER.x,z:TOWER.z,label:'Radio tower'};
}
const MISSION_TEXT=['Collect the radio part from the ambush site on the north road','Take it to the mechanic at Gearhead Repairs','Delivered. Scout the radio tower to the north if you dare'];
function updateMissionUI(){
  el.mission.textContent=P.mission<2?'Deliver the radio part to the Haven mechanic':'Mission complete — Haven owes you';
  el.msub.textContent=MISSION_TEXT[P.mission];
}
updateMissionUI();

// ============================================================ update: player on foot, driving, combat
const DRIVE_MAX=27;
function nearestRaiderInCone(origin,dirX,dirZ,maxD,cosA){
  let best=null,bd=1e9;
  for(const r of raiders){if(r.dead)continue;const dx=r.x-origin.x,dz=r.z-origin.z,d=Math.hypot(dx,dz);if(d>maxD||d<0.3)continue;const c=(dx*dirX+dz*dirZ)/d;if(c<cosA)continue;if(d<bd){bd=d;best=r}}
  return best;
}
function damagePlayer(n,fromX,fromZ){
  if(P.dead)return;P.hp=Math.max(0,P.hp-n);P.hurtT=0.5;cam.shake=Math.min(1,cam.shake+n*0.04);
  if(P.hp<=0){P.dead=true;P.deadT=0;el.wasted.classList.add('show');hero.dead=0.01;if(P.inCar)exitCar(true)}
}
function killRaider(r,byCar=false){
  r.dead=true;r.deadT=0;r.state='dead';const loot=Math.floor(rr(6,18));P.money+=loot;P.reserve+=Math.floor(rr(0,8));
  P.wanted=Math.min(3,P.wanted+0.6);P.wantedT=40;toast(`RAIDER DOWN  +$${loot}`,1800);if(P.rep<10)P.rep+=0.35;
}
function hitRaider(r,dmg,hp){
  if(r.dead)return;r.hp-=dmg;r.flash=0.12;if(r.H.glb)r.H.hit();r.state='attack';r.alertT=20;hitmarkT=0.18;
  for(let i=0;i<5;i++)sparks.emit(hp.x,hp.y,hp.z,rr(-1.5,1.5),rr(0,2.5),rr(-1.5,1.5),{life:rr(.25,.5),size:0.07,a:1,c0:[0.8,0.1,0.06],c1:[0.3,0.02,0.02],fall:8});
  if(r.hp<=0)killRaider(r);
}
function playerShoot(){
  if(P.shotCool>0||P.reload>0||P.dead)return;
  if(P.ammo<=0){toast('CLICK — RELOAD (R)',900);P.shotCool=0.3;return}
  P.ammo--;P.shotCool=0.28;
  hero.aimKick=0.12;if(hero.glb)hero.shoot();
  // ray: from camera through screen centre
  const org=_wp2.copy(camera.position);camera.getWorldDirection(_dir);
  // magnetism: slight snap to raider within ~3.5 deg
  let best=null,bd=1e9;const chest=new THREE.Vector3();
  for(const r of raiders){if(r.dead)continue;chest.set(r.x,r.y+1.25,r.z);const to=chest.clone().sub(org);const t=to.dot(_dir);if(t<2||t>90)continue;const perp=to.addScaledVector(_dir,-t).length();
    const tol=0.5+t*(MOBILE?0.07:0.035);if(perp<tol&&t<bd){bd=t;best=r}}
  const muz=gunMuzzle(hero,new THREE.Vector3());
  let end;
  if(best){const hp=new THREE.Vector3(best.x,best.y+1.3,best.z);const head=Math.random()<0.25;if(head)hp.y+=0.35;end=hp.clone();hitRaider(best,head?55:26,hp);if(head)toast('HEADSHOT',700)}
  else{ // find ground / collider hit along ray
    end=org.clone().addScaledVector(_dir,60);
    for(let t=3;t<70;t+=1.2){const p=org.clone().addScaledVector(_dir,t);if(p.y<terrainH(p.x,p.z)+0.05){end=p;break}
      if(circles.some(c=>Math.hypot(p.x-c[0],p.z-c[1])<c[2]&&p.y<3)||boxes.some(b=>p.x>b[0]&&p.x<b[2]&&p.z>b[1]&&p.z<b[3]&&p.y<WALLH)){end=p;break}}
    impact(end,6)}
  tracer(muz,end,1.0);muzzleFlash(muz,0.65,true);cam.shake=Math.min(1,cam.shake+0.12);
  // alert nearby raiders
  for(const r of raiders)if(!r.dead&&Math.hypot(r.x-P.x,r.z-P.z)<75){r.state='attack';r.alertT=15}
}
function playerMelee(){
  if(P.swingCool>0||P.dead)return;P.swingT=0.55;P.swingCool=0.62;P.hitDone=false;
}
function meleeHitCheck(){
  const fx=Math.sin(P.yaw),fz=Math.cos(P.yaw);const r=nearestRaiderInCone({x:P.x,z:P.z},fx,fz,2.4,0.3);
  if(r){hitRaider(r,34,new THREE.Vector3(r.x,r.y+1.3,r.z));r.kb=[fx*6,fz*6];cam.shake=Math.min(1,cam.shake+0.25)}
  else{const gp=new THREE.Vector3(P.x+fx*1.2,P.y+0.4,P.z+fz*1.2);impact(gp,2,[0.8,0.7,0.6])}
}
function enterCar(){
  if(P.inCar||P.dead)return;P.inCar=true;hero.root.visible=false;cam.tdist=9;cam.tpitch=0.2;
  toast('WASD drive · SPACE handbrake · F exit',2600);
}
function exitCar(force){
  if(!P.inCar)return;P.inCar=false;hero.root.visible=true;
  const sx=Math.cos(CAR.yaw),sz=-Math.sin(CAR.yaw);
  P.x=CAR.x-sx*2.1;P.z=CAR.z-sz*2.1;P.yaw=CAR.yaw;P.y=terrainH(P.x,P.z);cam.tdist=5.6;
  resolveCircle(P,0.4);
}
function reload(){
  if(P.reload>0||P.ammo>=12||P.reserve<=0)return;P.reload=1.35;
}
function updatePlayer(dt){
  const t=time;
  // cooldowns
  P.shotCool=Math.max(0,P.shotCool-dt);P.swingCool=Math.max(0,P.swingCool-dt);P.hurtT=Math.max(0,P.hurtT-dt);
  if(P.reload>0){P.reload-=dt;if(P.reload<=0){const need=12-P.ammo,take=Math.min(need,P.reserve);P.ammo+=take;P.reserve-=take}}
  if(aimTimer>0&&!aimHeld){aimTimer-=dt;if(aimTimer<=0&&!fireHeld)aimToggle=false}
  if(P.dead){P.deadT+=dt;hero.dead=Math.min(1,hero.dead+dt*2.2);animateHuman(hero,dt,t);
    if(P.deadT>3.6){P.dead=false;P.hp=70;P.x=SPAWN.x;P.z=SPAWN.z;P.y=terrainH(P.x,P.z);hero.dead=0;hero.root.rotation.x=0;P.money=Math.floor(P.money*0.85);el.wasted.classList.remove('show');P.wanted=0;toast('You wake up inside Rust Haven.',2600);
      for(const r of raiders)if(!r.dead){r.state='idle';r.x=r.home[0]+0;r.z=r.home[1]}}
    return}
  // input
  let ix=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),iy=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
  if(keys.KeyQ)cam.tyaw+=1.8*dt;if(keys.KeyE&&!P.inCar)cam.tyaw-=1.8*dt;
  let mag=Math.min(1,Math.hypot(ix,iy));
  if(joy.id!==null&&Math.hypot(joy.x,joy.y)>0.12){ix=joy.x;iy=-joy.y;mag=Math.min(1,Math.hypot(ix,iy))}else if(mag>0){const l=Math.hypot(ix,iy);ix/=l;iy/=l}
  if(P.inCar){driveCar(dt,ix,iy);return}
  const aiming=aimHeld||aimToggle;
  P.aim+=((aiming?1:0)-P.aim)*Math.min(1,dt*12);
  const run=(keys.ShiftLeft||keys.ShiftRight||btnState.run||(joy.id!==null&&mag>0.93&&MOBILE))&&!aiming;
  const target=mag>0.05?(run?7.0:(aiming?2.6:3.9))*mag:0;
  P.speed+=(target-P.speed)*Math.min(1,dt*9);
  if(mag>0.05){
    const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
    const dx=fx*iy+rx*ix,dz=fz*iy+rz*ix,l=Math.hypot(dx,dz)||1;
    P.x+=dx/l*P.speed*dt;P.z+=dz/l*P.speed*dt;
    if(!aiming&&P.swingT<=0){const want=Math.atan2(dx,dz);P.yaw+=angDiff(want,P.yaw)*Math.min(1,dt*11)}
  }
  if(aiming||P.swingT>0){const want=Math.atan2(-Math.sin(cam.yaw),-Math.cos(cam.yaw));P.yaw+=angDiff(want,P.yaw)*Math.min(1,dt*(aiming?16:5))}
  P.x=clamp(P.x,-HALF+8,HALF-8);P.z=clamp(P.z,-HALF+8,HALF-8);
  resolveCircle(P,0.4);
  const gy=terrainH(P.x,P.z);P.y+=(gy-P.y)*Math.min(1,dt*18);
  // weapon swap by aim
  if(aiming&&hero.weapon!=='pistol')setWeapon(hero,'pistol');else if(!aiming&&hero.weapon!=='pipe'&&P.swingT<=0)setWeapon(hero,'pipe');
  // actions
  if(act.attackQ){act.attackQ=false;if(!aiming)playerMelee();else if(MOBILE||true){/* click while aiming = shoot */act.shootQ=true}}
  if(act.shootQ){act.shootQ=false;if(!aiming){aimToggle=aimToggle||MOBILE;aimTimer=3.5}if(P.aim>0.6||MOBILE)playerShoot();else P.pendingShot=0.18}
  if(P.pendingShot>0){P.pendingShot-=dt;if(P.pendingShot<=0&&(aimHeld||aimToggle))playerShoot()}
  if(fireHeld&&aiming&&P.shotCool<=0&&P.aim>0.6)playerShoot();
  if(act.reloadQ){act.reloadQ=false;reload()}
  if(P.swingT>0){const before=P.swingT;P.swingT-=dt;if(!P.hitDone&&before>0.3&&P.swingT<=0.3){P.hitDone=true;meleeHitCheck()}}
  // anim
  hero.speed=P.speed;hero.aim=P.aim;hero.swing=P.swingT>0?P.swingT/0.55:0;
  hero.reloading=P.reload>0;animateHuman(hero,dt,t,{});
  if(hero.aimKick>0){hero.aimKick-=dt;if(!hero.glb){hero.spine.rotation.x-=hero.aimKick*0.8;hero.armR.sh.rotation.x+=hero.aimKick*1.2}}
  hero.reloading=P.reload>0;if(!hero.glb&&P.reload>0&&hero.weapon==='pistol'){hero.armR.sh.rotation.x=-0.6;hero.armR.el.rotation.x=-1.3;hero.armL.sh.rotation.x=-0.6;hero.armL.el.rotation.x=-1.3}
  hero.root.position.set(P.x,P.y,P.z);hero.root.rotation.y=P.yaw;
  // survival meters
  P.hunger=Math.max(0,P.hunger-dt*0.12);P.thirst=Math.max(0,P.thirst-dt*0.17);
  if(P.hunger<=0||P.thirst<=0){if(Math.random()<dt*0.5)damagePlayer(1)}else if(P.hp<100&&P.hunger>30&&P.thirst>30)P.hp=Math.min(100,P.hp+dt*0.6);
  // dust at feet
  if(P.speed>5&&Math.random()<dt*14)dustB.emit(P.x+rr(-.2,.2),P.y+0.1,P.z+rr(-.2,.2),rr(-.3,.3)-Math.sin(P.yaw)*0.5,rr(.2,.6),rr(-.3,.3)-Math.cos(P.yaw)*0.5,{life:rr(.6,1.1),size:.35,grow:3,a:0.3,c0:[.6,.5,.38],c1:[.55,.47,.38]});
}
function driveCar(dt,ix,iy){
  const C=CAR;const fx=Math.sin(C.yaw),fz=Math.cos(C.yaw),rx=Math.cos(C.yaw),rz=-Math.sin(C.yaw);
  let vf=C.vx*fx+C.vz*fz,vl=C.vx*rx+C.vz*rz;
  const hb=keys.Space||btnState.hb;
  const thr=iy>0?iy:0,brk=iy<0?-iy:0;
  if(thr>0)vf+=(vf<0?30:15.5)*thr*dt*(1-clamp(vf/DRIVE_MAX,0,1)*0.85);
  if(brk>0){if(vf>0.5)vf-=26*brk*dt;else vf-=8.5*brk*dt}
  vf-=vf*0.22*dt+Math.sign(vf)*1.2*dt*(thr?0:1);
  if(Math.abs(vf)<0.15&&!thr&&!brk)vf=0;
  vf=clamp(vf,-8,DRIVE_MAX*(keys.ShiftLeft||keys.ShiftRight||btnState.run?1.12:1));
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
  for(const r of raiders){if(r.dead)continue;if(Math.hypot(r.x-C.x,r.z-C.z)<1.6&&Math.abs(vf)>6){hitRaider(r,Math.abs(vf)*6,new THREE.Vector3(r.x,r.y+1,r.z));r.kb=[C.vx*0.7,C.vz*0.7];cam.shake=Math.min(1,cam.shake+0.3);C.vx*=0.85;C.vz*=0.85}}
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
  if(act.useQ){act.useQ=false;exitCar()}
  C.obj.hp=C.hp;
}

// ============================================================ raiders AI
function updateRaiders(dt){
  for(const r of raiders){
    const H=r.H;
    if(r.dead){r.deadT+=dt;H.dead=Math.min(1,r.deadT*2.5);H.speed=0;H.aim=0;animateHuman(H,dt,time);if(r.kb){r.x+=r.kb[0]*dt;r.z+=r.kb[1]*dt;r.kb[0]*=0.88;r.kb[1]*=0.88}
      H.root.position.set(r.x,terrainH(r.x,r.z),r.z);continue}
    const dx=P.x-r.x,dz=P.z-r.z,d=Math.hypot(dx,dz);
    const canSee=!P.dead&&d<(P.wanted>0.5?55:36)&&!(P.inCar&&false);
    if(r.state==='idle'||r.state==='patrol'){
      if(canSee&&d<30){r.state='attack';r.alertT=14}
      else{ // lazy wander around home
        r.t-=dt;if(r.t<=0){r.t=rr(2,5);r.tx=r.home[0]+rr(-4,4);r.tz=r.home[1]+rr(-4,4)}
        const tx=(r.tx??r.x)-r.x,tz=(r.tz??r.z)-r.z,td=Math.hypot(tx,tz);
        if(td>0.6){const sp=1.3;r.x+=tx/td*sp*dt;r.z+=tz/td*sp*dt;r.yaw+=angDiff(Math.atan2(tx,tz),r.yaw)*Math.min(1,dt*6);r.speed=sp}else r.speed=0;
      }
      H.aim=0;
    }else if(r.state==='attack'){
      r.alertT-=dt;if(d>70||r.alertT<=0||P.dead){r.state='idle';r.alertT=0}
      const want=Math.atan2(dx,dz);r.yaw+=angDiff(want,r.yaw)*Math.min(1,dt*8);
      let sp=0;
      if(r.melee){ // charge
        if(d>1.5){sp=4.6;r.x+=Math.sin(r.yaw)*sp*dt;r.z+=Math.cos(r.yaw)*sp*dt}
        else{r.cd-=dt;if(r.cd<=0){r.cd=1.1;H.swing=1;r.swingT=0.55;damagePlayer(P.inCar?3:9)}}
        H.aim=0;
      }else{
        const pref=r.H.weapon==='shotgun'?11:17;
        if(d>pref+4){sp=3.4;r.x+=Math.sin(r.yaw)*sp*dt;r.z+=Math.cos(r.yaw)*sp*dt}
        else if(d<pref-5){sp=-2.4;r.x+=Math.sin(r.yaw)*sp*dt;r.z+=Math.cos(r.yaw)*sp*dt}
        else{r.strafeT-=dt;if(r.strafeT<=0){r.strafeT=rr(1.2,2.6);r.strafe=-r.strafe}
          sp=1.6;r.x+=Math.cos(r.yaw)*r.strafe*sp*dt;r.z+=-Math.sin(r.yaw)*r.strafe*sp*dt}
        H.aim+=(1-H.aim)*Math.min(1,dt*6);
        r.cd-=dt;
        if(r.cd<=0&&H.aim>0.8&&d<(r.H.weapon==='shotgun'?24:40)){
          r.cd=r.H.weapon==='shotgun'?rr(1.6,2.4):rr(0.9,1.7);
          if(H.glb)H.shoot();const muz=gunMuzzle(H,new THREE.Vector3());muzzleFlash(muz,r.H.weapon==='shotgun'?0.9:0.55,d<40);
          const acc=r.H.weapon==='shotgun'?clamp(1-d/26,0.12,0.9):clamp(0.6-d/70,0.12,0.55);
          const end=new THREE.Vector3(P.x,P.y+1.2,P.z);
          const hit=Math.random()<acc*(P.inCar?0.5:1)*(P.aim>0.5?0.85:1);
          if(!hit){end.x+=rr(-2,2);end.y+=rr(-0.6,0.8);end.z+=rr(-2,2)}
          tracer(muz,end,0.8);
          if(hit){damagePlayer(r.H.weapon==='shotgun'?14:7,r.x,r.z)}else impact(new THREE.Vector3(end.x,terrainH(end.x,end.z)+0.05,end.z),3);
        }
      }
      r.speed=sp;
    }
    resolveCircle(r,0.4);
    r.y+=(terrainH(r.x,r.z)-r.y)*Math.min(1,dt*14);
    H.speed=Math.abs(r.speed)*(r.state==='attack'&&r.melee?1.1:1);H.hips&&0;
    if(H.swing>0){r.swingT-=dt;H.swing=Math.max(0,r.swingT/0.55)}
    r.flash=Math.max(0,r.flash-dt);
    animateHuman(H,dt,time);
    H.root.position.set(r.x,r.y,r.z);H.root.rotation.y=r.yaw;
  }
}
// ============================================================ NPCs
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
// ============================================================ interactions & mission logic
let promptKind='';
function updateInteractions(dt){
  promptKind='';
  const dCar=Math.hypot(P.x-CAR.x,P.z-CAR.z);
  if(!P.inCar&&dCar<3.8)promptKind='car';
  const dPart=Math.hypot(P.x-pickup.obj.position.x,P.z-pickup.obj.position.z);
  if(!P.inCar&&P.mission===0&&dPart<2.6)promptKind='part';
  const dMech=Math.hypot(P.x-mechanic.x,P.z-mechanic.z);
  if(!P.inCar&&P.mission===1&&dMech<3.4)promptKind='mech';
  // water barrels / food in haven: vendors
  for(const n of npcs){if(n.role==='vendor'&&!P.inCar&&Math.hypot(P.x-n.x,P.z-n.z)<2.4&&!promptKind){promptKind='buy';break}}
  const txt={car:'[F] Enter car',part:'[F] Take radio part',mech:'[F] Hand over radio part',buy:'[F] Buy ration & water — $12'}[promptKind]||'';
  if(P.inCar&&!txt){el.prompt.textContent='[F] Exit car';el.prompt.style.opacity=1}
  else{el.prompt.textContent=txt;el.prompt.style.opacity=txt?1:0}
  if(act.useQ){act.useQ=false;
    if(P.inCar){exitCar()}
    else if(promptKind==='car')enterCar();
    else if(promptKind==='part'){P.hasPart=true;P.mission=1;pickup.obj.visible=false;toast('RADIO PART ACQUIRED — take it to the mechanic',3200);updateMissionUI()}
    else if(promptKind==='mech'){P.mission=2;P.hasPart=false;P.money+=150;P.rep=Math.min(10,P.rep+3);P.reserve+=24;toast('DELIVERED  +$150  +REPUTATION',3600);updateMissionUI()}
    else if(promptKind==='buy'){if(P.money>=12){P.money-=12;P.hunger=Math.min(100,P.hunger+45);P.thirst=Math.min(100,P.thirst+55);toast('Ration & clean water  −$12',1800)}else toast('Not enough money',1400)}
  }
  // wanted decay
  if(P.wantedT>0){P.wantedT-=dt;if(P.wantedT<=0)P.wanted=Math.max(0,P.wanted-1)}
  const mt=missionTarget();mMarker.visible=true;mMarker.position.set(mt.x,terrainH(mt.x,mt.z)+30,mt.z);mMarker.material.opacity=0.08+0.04*Math.sin(time*3);
  pickup.beam.visible=P.mission===0;
  el.dist.textContent=`${mt.label} · ${Math.round(Math.hypot(P.x-mt.x,P.z-mt.z))} m`;
}
// ============================================================ camera
const camRay=new THREE.Vector3();
function updateCamera(dt){
  const k=1-Math.pow(0.0004,dt);
  const aiming=P.aim>0.3&&!P.inCar;
  cam.yaw+=angDiff(cam.tyaw,cam.yaw)*k;cam.pitch+=(cam.tpitch-cam.pitch)*k;cam.dist+=(cam.tdist-cam.dist)*k;
  if(P.inCar&&!drags.size){ // auto-follow car heading
    const want=CAR.yaw+Math.PI;cam.tyaw+=angDiff(want,cam.tyaw)*Math.min(1,dt*1.3*clamp(Math.abs(CAR.speed)/10,0,1))}
  const dist=aiming?lerp(cam.dist,2.7,P.aim):cam.dist;
  const shoulder=aiming?0.8*P.aim:0;
  const ty=P.inCar?CAR.y+1.5:P.y+1.5;
  camLook.lerp(_dir.set(P.x,ty,P.z),Math.min(1,dt*(P.inCar?7:11)));
  const cp=Math.cos(cam.pitch);
  const ox=Math.sin(cam.yaw)*cp*dist,oy=Math.sin(cam.pitch)*dist+0.2,oz=Math.cos(cam.yaw)*cp*dist;
  const rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  camPos.set(camLook.x+ox+rx*shoulder,camLook.y+oy,camLook.z+oz+rz*shoulder);
  // simple collision: pull camera in if inside wall/obstacle
  const minY=terrainH(camPos.x,camPos.z)+0.6;if(camPos.y<minY)camPos.y=minY;
  for(let i=0;i<3;i++){let inside=false;for(const b of boxes){if(camPos.x>b[0]-0.2&&camPos.x<b[2]+0.2&&camPos.z>b[1]-0.2&&camPos.z<b[3]+0.2&&camPos.y<WALLH+0.6&&Math.abs(b[2]-b[0])*Math.abs(b[3]-b[1])>0.5){inside=true;break}}
    if(!inside)break;camPos.lerp(camLook,0.3)}
  camera.position.copy(camPos);
  cam.shake=Math.max(0,cam.shake-dt*2.6);
  const sh=cam.shake*cam.shake*0.12;camera.position.x+=Math.sin(time*57)*sh;camera.position.y+=Math.cos(time*49)*sh;
  camera.lookAt(camLook.x+rx*shoulder*0.7,camLook.y+0.1-(aiming?0.0:0),camLook.z+rz*shoulder*0.7);
  const fov=(MOBILE&&innerWidth/innerHeight<0.8)?72:60;const tf=P.inCar?fov+clamp(Math.abs(CAR.speed)*0.5,0,12):(aiming?fov-8*P.aim:fov);
  cam.fov+=(tf-cam.fov)*Math.min(1,dt*5);if(Math.abs(camera.fov-cam.fov)>0.05){camera.fov=cam.fov;camera.updateProjectionMatrix();updScale()}
  camera.updateMatrixWorld();
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
  for(const r of raiders)if(!r.dead&&Math.hypot(r.x-P.x,r.z-P.z)<range*1.1)dot(r.x,r.z,'#e0382a',3);
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

// ============================================================ main loop
assembleGlows();
const sunSprite=new THREE.Vector3();
const clock=new THREE.Clock();let hudT=0,fpsAcc=0,fpsN=0;
function tick(dt){
  time+=dt;gameT+=dt;updateHFrustum();
  updatePlayer(dt);
  focus.set(P.x,P.y,P.z);
  updateRaiders(dt);updateNPCs(dt);updateCarVisual(dt);updateInteractions(dt);
  updateCamera(dt);
  // sky/sun follow
  sky.position.copy(camera.position);skyUniforms.uTime.value=time;
  sun.position.set(P.x+sunDir.x*100,Math.max(P.y,0)+sunDir.y*100+10,P.z+sunDir.z*100);sun.target.position.set(P.x,P.y,P.z);sun.target.updateMatrixWorld();
  // light pool, particles
  updateLights(time);
  flames.update(dt);embers.update(dt);smoke.update(dt);dust.update(dt);sparks.update(dt);dustB.update(dt);
  glowU.uTime.value=time;glowU.uBlink.value=Math.sin(time*3.0)>0.45?1:0.04;
  // flashes & tracers
  for(const f of flashSprites){if(f.t>0){f.t-=dt;f.s.material.opacity=Math.max(0,f.t/0.07)}else f.s.material.opacity=0}
  if(flashLightT>0){flashLightT-=dt;flashLight.intensity*=0.6;if(flashLightT<=0)flashLight.intensity=0}
  for(const t of tracers){if(t.t>0){t.t-=dt;t.m.material.opacity=Math.max(0,t.t/0.09);if(t.t<=0)t.m.visible=false}}
  // god-ray source in screen space
  if(godPass){sunSprite.copy(camera.position).addScaledVector(sunDir,1000).project(camera);
    godPass.uniforms.uSun.value.set(sunSprite.x*.5+.5,sunSprite.y*.5+.5);
    const facing=camera.getWorldDirection(_dir).dot(sunDir);godPass.uniforms.uInt.value=clamp((facing+0.15)*2.0,0,1)*(sunSprite.z<1?1:0)}
  if(gradePass){gradePass.uniforms.uTime.value=time;gradePass.uniforms.uHurt.value=clamp(P.hurtT*1.6+(P.hp<30?0.35+0.15*Math.sin(time*6):0),0,1)}
  // HUD
  hitmarkT=Math.max(0,hitmarkT-dt);el.hit.style.opacity=hitmarkT>0?1:0;
  hudT-=dt;if(hudT<=0){hudT=0.1;
    setBar(el.hp,P.hp);el.hpn.textContent=Math.ceil(P.hp);setBar(el.food,P.hunger);setBar(el.water,P.thirst);
    el.money.textContent='$'+P.money;
    el.ammo.innerHTML=`<b>${P.reload>0?'··':P.ammo}</b><span> / ${P.reserve}</span>`;
    el.wname.textContent=P.inCar?'DRIVING':(P.aim>0.4||hero.weapon==='pistol'?'.38 REVOLVER':'LEAD PIPE');
    let s='';for(let i=0;i<3;i++)s+=`<i class="${i<Math.round(P.wanted)?'on':''}"></i>`;el.stars.innerHTML=s;
    el.rep.textContent=repName(P.rep);
    document.body.classList.toggle('driving',P.inCar);$('ammo').style.display=P.inCar?'none':'block';
    el.speed.textContent=P.inCar?Math.round(Math.abs(CAR.speed)*3.6)+' km/h':'';
    el.cross.style.opacity=(P.aim>0.5&&!P.inCar)?1:0;
    el.hp.parentElement.classList.toggle('low',P.hp<30);
    drawMinimap();
  }
  if(toastT>0){toastT-=dt;if(toastT<=0)el.toast.style.opacity=0}
}

// ---- adaptive resolution: if the phone can't hold ~24 fps, drop the render scale in steps (and raise it again if there is headroom)
let _fpsAcc=0,_fpsN=0,_adaptCool=4;
function updateAdaptive(dt){
  if(!MOBILE||window.__paused)return;
  _fpsAcc+=dt;_fpsN++;_adaptCool-=dt;
  if(_fpsAcc>=2.0){const fps=_fpsN/_fpsAcc;_fpsAcc=0;_fpsN=0;window.__fps=Math.round(fps);
    if(_adaptCool<=0){
      if(fps<22&&PR>0.7){PR=Math.max(0.7,PR-0.2);renderer.setPixelRatio(PR);resize();_adaptCool=3}
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
}
addEventListener('resize',resize);resize();

// initial pose: golden-hour hero
cam.yaw=cam.tyaw=2.45;cam.pitch=cam.tpitch=0.14;cam.dist=cam.tdist=5.2;
camLook.set(P.x,P.y+1.5,P.z);
// debug / screenshot API
window.__game={
  P,CAR,cam,hero,raiders,npcs,camera,scene,renderer,composer,fireBarrels,PART,MECH,TOWER,terrainH,roadX,roadDX,
  tp(x,z,yaw){P.x=x;P.z=z;P.y=terrainH(x,z);if(yaw!==undefined)P.yaw=yaw;camLook.set(P.x,P.y+1.5,P.z)},
  view(o){if(o.yaw!==undefined)cam.yaw=cam.tyaw=o.yaw;if(o.pitch!==undefined)cam.pitch=cam.tpitch=o.pitch;if(o.dist!==undefined)cam.dist=cam.tdist=o.dist;camLook.set(P.x,(P.inCar?CAR.y:P.y)+1.5,P.z)},
  setCar(x,z,yaw,speed=0){CAR.x=x;CAR.z=z;CAR.yaw=yaw;CAR.y=terrainH(x,z);CAR.vx=Math.sin(yaw)*speed;CAR.vz=Math.cos(yaw)*speed;CAR.speed=speed},
  enter(){enterCar()},exit(){exitCar()},
  key(k,v){keys[k]=v},aim(v){aimToggle=v;aimTimer=99},shoot(){act.shootQ=true},melee(){act.attackQ=true},
  stats(){return renderer.info.render},step(n,dt=1/30){for(let i=0;i<n;i++)tick(dt)},
  fire(){return fireBarrels.length}
};
window.__loaded=true;
requestAnimationFrame(()=>{frame();setProg(1,'Ready');setTimeout(()=>{const l=$('loading');if(l){l.style.opacity=0;setTimeout(()=>l.remove(),900)}window.__ready=true},300)});
