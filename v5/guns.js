// ASHFALL v5 procedural gun models. All geometry is built from boxes/cylinders with vertex colours and merged into 2 meshes (metal + matte).
// Local frame: +Z = barrel direction, +Y up, origin ≈ centre of the pistol grip. Units: metres.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const C={steel:0x303336,dark:0x1c1d1f,blue:0x23272c,wood:0x6b4526,wood2:0x573820,poly:0x2b2b29,olive:0x4b4f3a,brass:0xb89440,rust:0x6e4a36,bone:0xd8d0bc,blade:0x9a9fa3,tape:0x2a2622,glass:0x6a8fa8,red:0x8a2a1e,green:0x3f5a30};
export function buildGunGeo(THREE,id,att={}){
  const parts={m:[],p:[]};const col=new THREE.Color();
  const put=(k,g,hex,x,y,z,rx,ry,rz,sx=1,sy=1,sz=1)=>{
    if(rx||ry||rz)g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx||0,ry||0,rz||0,'YXZ')));if(sx!==1||sy!==1||sz!==1)g.scale(sx,sy,sz);g.translate(x,y,z);
    col.set(hex);const n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=col.r;a[i*3+1]=col.g;a[i*3+2]=col.b}
    g.setAttribute('color',new THREE.BufferAttribute(a,3));if(g.index)g.toNonIndexed&&(g=g.toNonIndexed());g.deleteAttribute('uv');parts[k].push(g)};
  const B=(k,w,h,d,x,y,z,hex,rx,ry,rz)=>put(k,new THREE.BoxGeometry(w,h,d),hex,x,y,z,rx,ry,rz);
  const Cy=(k,r,len,x,y,z,hex,seg=8,rx=Math.PI/2,ry=0,rz=0)=>put(k,new THREE.CylinderGeometry(r,r,len,seg),hex,x,y,z,rx,ry,rz);
  const Cn=(k,r0,r1,len,x,y,z,hex,seg=8)=>put(k,new THREE.CylinderGeometry(r1,r0,len,seg),hex,x,y,z,Math.PI/2,0,0);
  const Sp=(k,r,x,y,z,hex,sx=1,sy=1,sz=1)=>put(k,new THREE.SphereGeometry(r,8,6),hex,x,y,z,0,0,0,sx,sy,sz);
  const o={muzzle:[0,0.03,0.25],eject:[0.02,0.05,0.05],sightY:0.07,len:0.3,kind:'gun'};
  let sightTop=0.075;let mzZ=0.25,mzY=0.04;
  const sc=att.scope,sp=att.supp,mg=att.mag,gr=att.grip;
  const scope=(y,z,len=0.2,r=0.022)=>{ // rail + tube + lens caps + mounts
    B('m',0.02,0.012,len+0.04,0,y,z,C.dark);Cy('m',r,len,0,y+0.03,z,C.dark,10);Cy('m',r*1.35,0.045,0,y+0.03,z+len/2,C.dark,10);Cy('m',r*1.25,0.04,0,y+0.03,z-len/2,C.dark,10);
    Cy('m',r*1.2,0.004,0,y+0.03,z+len/2+0.024,C.glass,10);B('m',0.012,0.03,0.02,0,y+0.012,z-len*0.3,C.dark);B('m',0.012,0.03,0.02,0,y+0.012,z+len*0.3,C.dark);sightTop=y+0.03;};
  const supp=(y,z)=>{Cy('m',0.021,0.2,0,y,z+0.1,C.dark,10);Cy('m',0.024,0.012,0,y,z+0.2,C.steel,10);Cy('m',0.024,0.012,0,y,z+0.01,C.steel,10);mzZ=z+0.205;};
  switch(id){
  case 'm9':{ // M9-pattern: open-slide 9mm
    B('m',0.032,0.035,0.2,0,0.058,0.07,C.steel);                                   // slide
    for(let i=0;i<5;i++)B('m',0.034,0.03,0.004,0,0.058,-0.02+i*0.008,C.dark);       // rear serrations
    B('m',0.028,0.02,0.19,0,0.028,0.065,C.blue);                                   // frame
    Cy('m',0.009,0.04,0,0.056,0.185,C.dark,6);                                      // barrel tip
    B('p',0.03,0.1,0.052,0,-0.035,0,C.poly,-0.22,0,0);                              // grip
    B('p',0.034,0.05,0.056,0,-0.09,-0.012,C.dark,-0.22,0,0);                        // base
    B('m',0.008,0.02,0.04,0,0.012,0.045,C.blue);B('m',0.01,0.006,0.05,0,-0.005,0.08,C.blue);B('m',0.008,0.028,0.008,0,0.002,0.1,C.blue);   // trigger guard
    B('m',0.006,0.012,0.012,0,0.082,-0.02,C.dark);B('m',0.006,0.01,0.01,0,0.082,0.16,C.dark);B('m',0.008,0.014,0.02,0,0.065,-0.045,C.dark,-0.4,0,0);       // sights, hammer
    mzZ=0.2;mzY=0.058;if(sp)supp(0.056,0.2);sightTop=0.088;o.eject=[0.02,0.065,0.03];o.kind='pistol';break}
  case 'rev':{ // .357 revolver
    B('m',0.03,0.07,0.1,0,0.04,0.0,C.steel);Cy('m',0.032,0.075,0,0.052,0.085,C.blue,10);                   // frame + cylinder
    for(let i=0;i<6;i++){const a=i/6*6.283;Cy('m',0.007,0.078,Math.cos(a)*0.021,0.052+Math.sin(a)*0.021,0.085,C.dark,5)}
    Cy('m',0.012,0.2,0,0.065,0.2,C.steel,8);B('m',0.014,0.03,0.2,0,0.03,0.19,C.steel);                  // barrel + underlug
    B('m',0.008,0.014,0.01,0,0.082,0.29,C.dark);B('m',0.008,0.012,0.02,0,0.086,-0.02,C.dark);
    B('p',0.034,0.11,0.06,0,-0.04,-0.028,C.wood2,-0.3,0,0);B('m',0.012,0.016,0.03,0,0.08,-0.04,C.steel,-0.5,0,0);
    B('m',0.006,0.022,0.04,0,0.002,0.03,C.steel);Cy('m',0.003,0.07,0,-0.002,0.03,C.steel,4);
    mzZ=0.3;mzY=0.065;if(sp)supp(0.065,0.3);sightTop=0.095;o.eject=[0,0.05,0.08];o.kind='pistol';break}
  case 'smg':{ // compact 9mm SMG, wire stock
    B('m',0.044,0.062,0.3,0,0.03,0.13,C.blue);B('m',0.046,0.014,0.2,0,0.066,0.14,C.dark);Cy('m',0.016,0.14,0,0.035,0.37,C.dark,8);Cy('m',0.02,0.16,0,0.035,0.32,C.steel,10);
    for(let i=0;i<5;i++)Cy('m',0.0205,0.006,0,0.035,0.26+i*0.03,C.dark,10);
    B('p',0.032,0.11,0.05,0,-0.05,0.0,C.poly,-0.2,0,0);B('p',0.028,0.18*(mg?1.4:1),0.036,0,-0.14*(mg?1.3:1),0.12,C.dark,0.06,0,0);   // grip + magazine
    B('p',0.03,0.04,0.12,0,0.0,0.215,C.poly);B('m',0.006,0.006,0.2,0.026,0.02,-0.14,C.steel);B('m',0.006,0.006,0.2,-0.026,0.02,-0.14,C.steel);B('m',0.05,0.06,0.012,0,0.03,-0.24,C.dark);   // wire stock
    B('m',0.008,0.02,0.01,0,0.082,0.32,C.dark);B('m',0.02,0.014,0.02,0,0.08,0.02,C.dark);
    mzZ=0.42;mzY=0.035;if(sp)supp(0.035,0.42);if(gr)B('p',0.03,0.07,0.04,0,-0.05,0.26,C.poly);if(sc)scope(0.07,0.12,0.14,0.018);else sightTop=0.09;o.eject=[0.025,0.04,0.12];o.kind='rifle';break}
  case 'ak':{ // AK-pattern rifle: wood furniture, curved mag, gas tube
    B('m',0.044,0.075,0.34,0,0.03,0.14,C.steel);B('m',0.04,0.014,0.3,0,0.075,0.14,C.dark);                  // receiver + dust cover
    Cy('m',0.012,0.42,0,0.05,0.5,C.dark,8);Cy('m',0.011,0.26,0,0.075,0.43,C.steel,8);                       // barrel + gas tube
    B('m',0.014,0.05,0.02,0,0.085,0.62,C.dark);B('m',0.01,0.03,0.016,0,0.074,0.28,C.dark);Cy('m',0.016,0.06,0,0.05,0.7,C.dark,8);   // front sight block + muzzle brake
    B('p',0.046,0.058,0.2,0,0.04,0.38,C.wood);B('p',0.04,0.04,0.2,0,0.088,0.37,C.wood2);                    // handguard
    B('p',0.032,0.11,0.05,0,-0.05,0.0,C.wood2,-0.28,0,0);
    B('p',0.04,0.075,0.3,0,0.02,-0.27,C.wood,0.04,0,0);B('p',0.04,0.02,0.04,0,-0.025,-0.43,C.wood2);               // stock
    const ml=mg?1.45:1;for(let i=0;i<4;i++)B('m',0.03,0.07*ml,0.045,0,-0.06-i*0.062*ml,0.17+i*0.026*ml+ (i*i)*0.004,C.steel,0.2+i*0.12,0,0);    // curved mag
    B('m',0.01,0.03,0.05,0,-0.012,0.05,C.steel);if(sc)scope(0.09,0.08,0.2);else B('m',0.012,0.018,0.04,0,0.09,0.02,C.dark);
    mzZ=0.73;mzY=0.05;if(sp)supp(0.05,0.69);if(gr)B('p',0.032,0.08,0.04,0,-0.04,0.34,C.wood2);sightTop=sc?sightTop:0.1;o.eject=[0.025,0.065,0.1];o.kind='rifle';break}
  case 'm4':{ // M4-pattern carbine: rail, carry sight, round handguard, retractable stock
    B('m',0.04,0.06,0.2,0,0.035,0.06,C.blue);B('m',0.038,0.05,0.1,0,0.02,0.2,C.blue);                       // lower/upper
    B('m',0.034,0.025,0.34,0,0.075,0.12,C.dark);for(let i=0;i<8;i++)B('m',0.036,0.005,0.012,0,0.09,0.0+i*0.04,C.dark); // top rail
    Cy('m',0.026,0.3,0,0.04,0.38,C.dark,10);for(let i=0;i<5;i++)Cy('m',0.0275,0.008,0,0.04,0.27+i*0.05,C.steel,10);       // handguard
    Cy('m',0.01,0.12,0,0.04,0.58,C.steel,8);Cy('m',0.018,0.06,0,0.04,0.64,C.dark,8);B('m',0.012,0.04,0.012,0,0.07,0.52,C.dark);   // barrel + flash hider + front post
    B('m',0.014,0.04,0.016,0,0.105,-0.0,C.dark);B('m',0.014,0.03,0.016,0,0.1,0.28,C.dark);
    B('p',0.032,0.11,0.05,0,-0.05,-0.0,C.poly,-0.3,0,0);const ml=mg?1.45:1;B('p',0.03,0.16*ml,0.05,0,-0.11*ml,0.14,C.dark,0.12,0,0);       // grip + straight mag
    Cy('m',0.02,0.2,0,0.04,-0.14,C.steel,8);B('p',0.04,0.1,0.14,0,0.01,-0.3,C.poly,0.06,0,0);B('p',0.03,0.04,0.04,0,-0.05,-0.38,C.poly);   // buffer tube + stock
    if(sc)scope(0.095,0.1,0.2);if(gr)B('p',0.028,0.08,0.04,0,-0.04,0.34,C.poly);
    mzZ=0.7;mzY=0.04;if(sp)supp(0.04,0.64);sightTop=sc?sightTop:0.12;o.eject=[0.022,0.05,0.04];o.kind='rifle';break}
  case 'br':{ // battle rifle: long, wood+steel, 20rd mag
    B('m',0.046,0.08,0.38,0,0.03,0.15,C.steel);B('m',0.036,0.014,0.3,0,0.077,0.17,C.dark);
    Cy('m',0.013,0.42,0,0.052,0.56,C.dark,8);Cy('m',0.02,0.07,0,0.052,0.76,C.dark,8);B('m',0.012,0.045,0.014,0,0.09,0.72,C.dark);
    B('p',0.05,0.065,0.24,0,0.035,0.42,C.wood);B('p',0.042,0.03,0.2,0,0.085,0.42,C.wood2);
    B('p',0.034,0.11,0.05,0,-0.05,0.0,C.wood2,-0.3,0,0);
    B('p',0.044,0.09,0.34,0,0.0,-0.3,C.wood,0.05,0,0);B('p',0.045,0.1,0.03,0,-0.02,-0.48,C.poly);
    const ml=mg?1.4:1;B('m',0.03,0.14*ml,0.07,0,-0.1*ml,0.17,C.steel,0.1,0,0);
    B('m',0.012,0.03,0.02,0,0.09,0.0,C.dark);if(sc)scope(0.09,0.12,0.22);else B('m',0.01,0.016,0.02,0,0.098,0.3,C.dark);
    mzZ=0.8;mzY=0.052;if(sp)supp(0.052,0.74);if(gr)B('p',0.03,0.08,0.04,0,-0.04,0.38,C.wood2);sightTop=sc?sightTop:0.105;o.eject=[0.026,0.06,0.1];o.kind='rifle';break}
  case 'pump':{ // pump-action shotgun
    Cy('m',0.017,0.62,0,0.045,0.38,C.steel,10);Cy('m',0.014,0.5,0,0.01,0.34,C.dark,8);                      // barrel + mag tube
    B('m',0.044,0.06,0.22,0,0.035,0.0,C.dark);B('m',0.03,0.02,0.1,0,0.075,0.0,C.dark);                       // receiver
    B('p',0.05,0.052,0.2,0,0.005,0.3,C.wood);                                                                 // pump forend
    B('p',0.046,0.1,0.34,0,0.015,-0.25,C.wood,0.1,0,0);B('p',0.044,0.11,0.03,0,-0.01,-0.43,C.poly);        // stock
    B('p',0.03,0.09,0.044,0,-0.04,0.0,C.wood2,-0.3,0,0);Sp('m',0.008,0,0.065,0.7,C.dark);
    mzZ=0.7;mzY=0.045;if(sp)supp(0.045,0.7);sightTop=0.075;o.eject=[0.025,0.05,0.0];o.kind='rifle';break}
  case 'dbl':{ // double-barrel
    Cy('m',0.0155,0.55,-0.0165,0.04,0.34,C.steel,10);Cy('m',0.0155,0.55,0.0165,0.04,0.34,C.steel,10);B('m',0.012,0.006,0.5,0,0.058,0.34,C.dark);
    B('m',0.05,0.056,0.12,0,0.03,0.02,C.dark);B('m',0.012,0.02,0.04,0,0.075,-0.03,C.steel);Sp('m',0.009,0,0.062,0.6,C.brass);
    B('p',0.046,0.045,0.2,0,0.0,0.3,C.wood);
    B('p',0.044,0.1,0.34,0,0.015,-0.24,C.wood,0.1,0,0);B('p',0.044,0.1,0.03,0,-0.012,-0.42,C.wood2);B('p',0.03,0.08,0.04,0,-0.04,-0.02,C.wood2,-0.3,0,0);
    B('m',0.006,0.02,0.04,0,0.0,0.05,C.steel);
    mzZ=0.62;mzY=0.04;sightTop=0.07;o.eject=[0.02,0.05,0.02];o.kind='rifle';break}
  case 'sniper':{ // bolt sniper: long barrel, big scope, thumbhole stock, bipod
    B('m',0.044,0.07,0.34,0,0.035,0.1,C.olive);Cy('m',0.014,0.5,0,0.05,0.6,C.dark,8);Cy('m',0.021,0.12,0,0.05,0.9,C.dark,8);
    B('p',0.05,0.07,0.3,0,0.02,0.4,C.olive);
    B('p',0.05,0.12,0.34,0,0.0,-0.28,C.olive,0.05,0,0);B('p',0.05,0.14,0.04,0,-0.02,-0.46,C.dark);B('p',0.03,0.12,0.045,0,-0.065,0.0,C.olive,-0.3,0,0);
    Cy('m',0.007,0.07,0.045,0.07,-0.03,C.steel,6,0,0,0.0);B('m',0.012,0.012,0.07,0.05,0.07,-0.03,C.steel);Sp('m',0.012,0.065,0.07,-0.07,C.steel);   // bolt handle
    B('m',0.03,0.08,0.06,0,-0.07,0.14,C.dark);
    scope(0.085,0.1,0.34,0.03);if(!sc){/*factory scope already*/}
    for(const s of[-1,1]){B('m',0.006,0.14,0.006,s*0.03,-0.02,0.64,C.steel,0,0,s*0.4)}
    mzZ=0.97;mzY=0.05;if(sp)supp(0.05,0.9);sightTop=0.115;o.eject=[0.03,0.07,0.1];o.kind='rifle';o.hasScope=true;break}
  case 'hunt':{ // hunting rifle, walnut, small scope
    B('m',0.04,0.06,0.3,0,0.03,0.1,C.blue);Cy('m',0.012,0.46,0,0.05,0.5,C.steel,8);Cn('m',0.012,0.016,0.03,0,0.05,0.74,C.dark);
    B('p',0.046,0.058,0.24,0,0.02,0.38,C.wood);
    B('p',0.046,0.1,0.34,0,0.01,-0.26,C.wood,0.06,0,0);B('p',0.046,0.1,0.03,0,-0.012,-0.43,C.wood2);B('p',0.03,0.09,0.046,0,-0.05,0.0,C.wood2,-0.3,0,0);
    Sp('m',0.01,0.04,0.07,-0.06,C.steel);B('m',0.012,0.01,0.06,0.04,0.065,-0.05,C.steel);
    if(!sc)scope(0.078,0.1,0.24,0.022);else scope(0.078,0.1,0.28,0.026);
    mzZ=0.75;mzY=0.05;if(sp)supp(0.05,0.74);sightTop=0.11;o.eject=[0.025,0.06,0.08];o.kind='rifle';o.hasScope=true;break}
  case 'xbow':{ // crossbow with limbs and string
    B('p',0.04,0.07,0.5,0,0.01,0.05,C.wood2);B('p',0.04,0.07,0.04,0,-0.02,-0.22,C.wood2);B('p',0.03,0.09,0.04,0,-0.05,0.0,C.wood2,-0.25,0,0);
    B('m',0.024,0.012,0.4,0,0.052,0.2,C.steel);                                                               // rail
    B('m',0.58,0.02,0.03,0,0.04,0.46,C.dark);B('m',0.1,0.025,0.04,-0.34,0.04,0.42,C.dark,0,0.5,0);B('m',0.1,0.025,0.04,0.34,0.04,0.42,C.dark,0,-0.5,0);   // prod + tips
    B('m',0.005,0.005,0.2,-0.29,0.04,0.34,C.bone,0,0.8,0);B('m',0.005,0.005,0.2,0.29,0.04,0.34,C.bone,0,-0.8,0);      // string
    B('m',0.02,0.008,0.012,0,0.06,0.45,C.bone);Cy('m',0.004,0.34,0,0.062,0.28,C.steel,4);Cn('m',0.0,0.007,0.04,0,0.062,0.47,C.steel,4);// bolt
    B('m',0.006,0.04,0.006,0,0.08,0.02,C.dark);B('m',0.006,0.03,0.006,0,0.075,0.42,C.dark);
    mzZ=0.5;mzY=0.06;sightTop=0.095;o.eject=[0,0.05,0.1];o.kind='rifle';o.silent=true;break}
  case 'pipe':{
    Cy('m',0.022,0.8,0,0.0,0.34,C.rust,8);Cy('m',0.028,0.07,0,0,0.7,C.steel,8);B('p',0.04,0.04,0.2,0,0,-0.02,C.tape);Cy('m',0.032,0.02,0,0,0.76,C.rust,8);
    o.kind='melee';o.len=0.8;break}
  case 'machete':{
    B('m',0.01,0.07,0.5,0,0.03,0.38,C.blade);B('m',0.011,0.02,0.5,0,0.06,0.38,C.steel);B('m',0.012,0.07,0.08,0,0.03,0.66,C.blade,0,0,0);
    B('p',0.03,0.04,0.14,0,0,0.0,C.poly);B('m',0.04,0.012,0.02,0,0,0.075,C.dark);for(let i=0;i<3;i++)Cy('m',0.004,0.034,0,0,-0.01+i*0.04,C.brass,5,0,0,Math.PI/2);
    o.kind='melee';o.len=0.7;break}
  case 'axe':{
    Cy('p',0.019,0.8,0,0,0.3,C.wood,7);B('m',0.03,0.12,0.2,0,0.0,0.7,C.red);B('m',0.012,0.2,0.1,0,0,0.78,C.blade,0,0,0);B('m',0.03,0.05,0.06,0,0.0,0.62,C.dark);
    o.kind='melee';o.len=0.85;break}
  case 'knife':{
    B('m',0.008,0.035,0.2,0,0.01,0.17,C.blade);B('m',0.009,0.012,0.2,0,0.03,0.17,C.steel);B('p',0.026,0.034,0.11,0,0,-0.0,C.tape);B('m',0.04,0.014,0.016,0,0,0.058,C.dark);
    o.kind='melee';o.len=0.3;break}
  case 'grenade':{
    Sp('m',0.04,0,0,0,C.olive,1,1.15,1);B('m',0.04,0.02,0.04,0,0.055,0,C.steel);B('m',0.008,0.05,0.012,0.022,0.06,0,C.steel,0,0,-0.3);Cy('m',0.008,0.01,0,0.075,0,C.brass,6,0,0,0);
    for(let i=0;i<3;i++)B('m',0.082,0.003,0.082,0,-0.02+i*0.02,0,C.dark);o.kind='throw';o.len=0.1;break}
  case 'molotov':{
    Cy('m',0.04,0.16,0,0,0,C.green,10,0,0,0);Cy('m',0.016,0.09,0,0.12,0,C.green,8,0,0,0);Cy('m',0.019,0.02,0,0.17,0,C.dark,8,0,0,0);
    B('p',0.012,0.12,0.012,0.012,0.22,0,C.bone,0,0,0.3);Sp('m',0.014,0.02,0.28,0,0xff8a30);o.kind='throw';o.len=0.1;break}
  }
  const out={};
  for(const k of['m','p']){if(!parts[k].length){out[k]=null;continue}const g=mergeGeometries(parts[k],false);g.computeBoundingSphere();out[k]=g;parts[k].forEach(x=>x.dispose())}
  o.muzzle=[0,mzY,mzZ];o.sightY=sightTop;return {...o,geo:out};
}
