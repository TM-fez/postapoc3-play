// ASHFALL v5 props: lootable containers, skeletons, corpses, supply drop. Pure geometry builders (THREE passed through import).
import * as THREE from 'three';
const BX=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
const CY=(r0,r1,h,s=8)=>new THREE.CylinderGeometry(r0,r1,h,s);
const SP=(r,sx=1,sy=1,sz=1)=>{const g=new THREE.SphereGeometry(r,8,6);g.scale(sx,sy,sz);return g};
// part: {k:material key,g:geometry,p:[x,y,z],r:[rx,ry,rz],c:hex}
const P=(k,g,x,y,z,c,rx=0,ry=0,rz=0)=>({k,g,p:[x,y,z],r:[rx,ry,rz],c});
export const CONTAINER_NAMES={crate:'Wooden crate',locker:'Metal locker',fridge:'Old fridge',cabinet:'Cabinet',toolbox:'Toolbox',safe:'Safe',trunk:'Car trunk',body:'Body',skeleton:'Remains',drop:'Supply drop',stash:'Car stash'};
export const SEARCH_TIME={crate:1.1,locker:1.3,fridge:1.0,cabinet:1.0,toolbox:0.9,safe:1.6,trunk:1.4,body:1.2,skeleton:1.0,drop:1.8,stash:0.3};
export function containerParts(kind,v=0){
  const a=[];
  if(kind==='crate'){
    const c=v%2?0x6e5438:0x7a5c3a;
    a.push(P('wood',BX(0.82,0.56,0.62),0,0.28,0,c));
    for(const z of[-0.31,0.31])a.push(P('wood',BX(0.86,0.08,0.04),0,0.52,z,0x4a3826));
    for(const x of[-0.4,0.4])a.push(P('wood',BX(0.05,0.6,0.66),x,0.3,0,0x4a3826));
    a.push(P('wood',BX(0.7,0.04,0.5),0,0.58,0,0x8a6c46));a.push(P('metal',BX(0.1,0.04,0.02),0,0.4,0.32,0x2a2a2a));
  }else if(kind==='locker'){
    const c=[0x4c5a52,0x55606a,0x6a5a46][v%3];
    a.push(P('plate',BX(0.56,1.8,0.5),0,0.9,0,c));
    a.push(P('metal',BX(0.02,1.6,0.02),0,0.9,0.26,0x1a1a1a));
    for(let i=0;i<3;i++)a.push(P('metal',BX(0.3,0.02,0.01),0,1.55+i*0.06,0.26,0x1a1a1a));
    a.push(P('metal',BX(0.04,0.14,0.04),0.18,0.95,0.28,0x9a9a92));a.push(P('metal',BX(0.04,0.14,0.04),-0.18,0.95,0.28,0x9a9a92));
  }else if(kind==='fridge'){
    a.push(P('plate',BX(0.72,1.7,0.7),0,0.85,0,0xcfc7b4));a.push(P('metal',BX(0.7,0.02,0.01),0,1.15,0.355,0x6a6458));
    a.push(P('metal',BX(0.03,0.45,0.04),0.28,1.4,0.38,0x7a7a7a));a.push(P('metal',BX(0.03,0.6,0.04),0.28,0.7,0.38,0x7a7a7a));
    a.push(P('matte',BX(0.5,0.1,0.01),0,0.1,0.355,0x2a2a2a));
  }else if(kind==='cabinet'){
    const c=v%2?0x5c4630:0x6f5a40;
    a.push(P('wood',BX(0.96,1.35,0.42),0,0.675,0,c));a.push(P('wood',BX(1.0,0.05,0.46),0,1.37,0,0x4a3826));
    a.push(P('wood',BX(0.02,1.2,0.02),0,0.7,0.215,0x2a2018));a.push(P('metal',BX(0.03,0.03,0.03),-0.07,0.8,0.23,0x8a7a4a));a.push(P('metal',BX(0.03,0.03,0.03),0.07,0.8,0.23,0x8a7a4a));
    a.push(P('wood',BX(0.4,0.5,0.01),-0.24,0.4,0.216,0x4a3a2a));a.push(P('wood',BX(0.4,0.5,0.01),0.24,0.4,0.216,0x4a3a2a));
  }else if(kind==='toolbox'){
    a.push(P('wood',BX(1.1,0.06,0.6),0,0.8,0,0x5a4632));for(const x of[-0.5,0.5])for(const z of[-0.25,0.25])a.push(P('wood',BX(0.06,0.8,0.06),x,0.4,z,0x4a3826));
    a.push(P('plate',BX(0.52,0.28,0.26),0,0.97,0,0x8a2a1e));a.push(P('metal',BX(0.3,0.03,0.03),0,1.14,0,0x1a1a1a));a.push(P('metal',BX(0.08,0.06,0.02),0,1.0,0.14,0xa0a0a0));
    a.push(P('metal',BX(0.2,0.04,0.06),0.3,0.85,0.05,0x7a7a7a,0,0.5,0));
  }else if(kind==='safe'){
    a.push(P('plate',BX(0.72,0.85,0.66),0,0.425,0,0x2c3034));a.push(P('metal',BX(0.6,0.72,0.02),0,0.43,0.335,0x3a4046));
    a.push(P('metal',CY(0.07,0.07,0.03,12),-0.1,0.55,0.36,0xb0a070,Math.PI/2));a.push(P('metal',BX(0.04,0.2,0.04),0.2,0.45,0.36,0x9a9a9a));
    a.push(P('glow',BX(0.12,0.08,0.01),0.18,0.66,0.34,0x3cff90));
  }else if(kind==='skeleton'){
    const bone=0xd2c8b0,dark=0x9a8e74;
    a.push(P('matte',SP(0.1,1,1.05,1.15),0,0.1,0.55,bone));                            // skull
    a.push(P('matte',BX(0.08,0.05,0.07),0,0.07,0.65,dark));
    for(let i=0;i<5;i++)a.push(P('matte',SP(0.15-i*0.01,1.2,0.35,0.5),0,0.07+i*0.008,0.25-i*0.07,bone));  // ribs
    a.push(P('matte',CY(0.02,0.02,0.4,5),0,0.04,0.0,dark,Math.PI/2));                  // spine
    a.push(P('matte',SP(0.14,1.3,0.3,0.8),0,0.05,-0.38,bone));                          // pelvis
    for(const s of[-1,1]){a.push(P('matte',CY(0.022,0.02,0.5,5),s*0.1,0.03,-0.72,bone,Math.PI/2,0,0.1*s));a.push(P('matte',CY(0.02,0.018,0.45,5),s*0.14,0.03,-1.15,bone,Math.PI/2,0,-0.1*s));
      a.push(P('matte',CY(0.02,0.018,0.4,5),s*0.3,0.03,0.12,bone,Math.PI/2,0.9*s,0));a.push(P('matte',CY(0.018,0.016,0.3,5),s*0.52,0.03,0.0,bone,Math.PI/2,0.3*s,0))}
    a.push(P('cloth',BX(0.5,0.02,0.7),0,0.012,0.0,0x5a4e3c,0,0.2,0));a.push(P('cloth',BX(0.4,0.02,0.5),0,0.012,-0.8,0x3e3a34,0,-0.1,0));
  }else if(kind==='corpse'){ // old dressed body lying on its back
    const sk=0xb89a7c;
    a.push(P('matte',SP(0.11,1,1,1.1),0,0.11,0.62,sk));a.push(P('cloth',BX(0.16,0.04,0.12),0,0.2,0.64,0x3a3a30));
    a.push(P('cloth',BX(0.42,0.18,0.52),0,0.1,0.22,0x5a5a40));a.push(P('cloth',BX(0.36,0.17,0.44),0,0.09,-0.25,0x3e3a34));
    for(const s of[-1,1]){a.push(P('cloth',BX(0.16,0.15,0.62),s*0.12,0.08,-0.74,0x3e3a34,0,0.05*s,0));a.push(P('matte',BX(0.14,0.09,0.26),s*0.14,0.06,-1.15,0x2a2018,0,0.1*s,0));
      a.push(P('cloth',BX(0.12,0.12,0.5),s*0.34,0.07,0.15,0x5a5a40,0,0.25*s,0));a.push(P('matte',SP(0.06),s*0.44,0.05,-0.12,sk))}
  }
  return a;
}
// supply drop: crate + chute mesh (standard materials, not batched; one-off dynamic object)
export function makeDrop(){
  const g=new THREE.Group();
  const m1=new THREE.MeshStandardMaterial({color:0x56603e,roughness:0.7,metalness:0.4}),m2=new THREE.MeshStandardMaterial({color:0x242a1c,roughness:0.6,metalness:0.6});
  const c=new THREE.Mesh(BX(1.1,0.8,0.9),m1);c.position.y=0.4;c.castShadow=true;g.add(c);
  const lid=new THREE.Mesh(BX(1.14,0.08,0.94),m2);lid.position.y=0.82;g.add(lid);
  for(const x of[-0.4,0.4]){const s=new THREE.Mesh(BX(0.08,0.82,0.94),m2);s.position.set(x,0.41,0);g.add(s)}
  const led=new THREE.Mesh(BX(0.14,0.06,0.02),new THREE.MeshBasicMaterial({color:new THREE.Color(0.3,3,0.6),toneMapped:false}));led.position.set(0,0.55,0.46);g.add(led);
  const ch=new THREE.Group();
  const cm=new THREE.MeshStandardMaterial({color:0xc8c0a8,roughness:0.9,side:THREE.DoubleSide});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(2.8,14,6,0,Math.PI*2,0,Math.PI*0.42),cm);dome.position.y=7;ch.add(dome);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const l=new THREE.Mesh(CY(0.01,0.01,6.4,3),m2);l.position.set(Math.cos(a)*1.2,3.7,Math.sin(a)*1.2);l.rotation.set(Math.sin(a)*0.18,0,-Math.cos(a)*0.18);ch.add(l)}
  g.add(ch);g.userData.chute=ch;g.userData.led=led;
  return g;
}
export function makeBarrelFlare(){return null}
