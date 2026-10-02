// ASHFALL v6 vector icons (24x24 viewBox, drawn with currentColor). Hand-made for this project, no external assets.
const P=(d,x='')=>`<path d="${d}" ${x}/>`;
const F='fill="currentColor" stroke="none"',N='fill="none"';
export const ICONS={
 fire:`<circle cx="12" cy="12" r="3.2" ${F}/><circle cx="12" cy="12" r="8" ${N}/>${P('M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4')}`,
 ads:`<circle cx="12" cy="12" r="7.5" ${N}/><circle cx="12" cy="12" r="1.6" ${F}/>${P('M12 2v5M12 17v5M2 12h5M17 12h5')}`,
 reload:`${P('M20 12a8 8 0 1 1-2.6-5.9')}${P('M20.5 3.5v5h-5')}${P('M9 12h6',`stroke-width="1.6"`)}`,
 jump:`${P('M6 14l6-6 6 6')}${P('M6 20l6-6 6 6')}`,
 crouch:`<circle cx="9" cy="5" r="2.3" ${F}/>${P('M8 9.5l4 1.3 3.6 2.8M12 10.8l-.8 4.6-3 3.5M11.2 15.4l4.6.6')}`,
 prone:`<circle cx="4.5" cy="14" r="2.2" ${F}/>${P('M7.5 15.5l7-1.7 5.5 2.7M7.8 17.6h12.4')}`,
 stand:`<circle cx="12" cy="4.6" r="2.3" ${F}/>${P('M12 8v7M8.5 10l3.5-2 3.5 2M12 15l-3 6.5M12 15l3 6.5')}`,
 grenade:`${P('M12 8.5a6 6 0 1 0 .01 0z',N)}${P('M10.5 8.5V5.5h3v3M13.5 6l3.5-2.5')}${P('M9 13h6',`stroke-width="1.2"`)}`,
 molotov:`${P('M10.5 9V6h3v3M9 9h6l1.5 3v8.5h-9V12z')}${P('M12 1.5c1.7 1.8 1.7 3 0 4-1.7-1-1.7-2.2 0-4z',F)}`,
 melee:`${P('M5 19l1.8-1.8M7.2 16.8l9-9c1.2-1.2 3-1.4 3.9-1.1.3.9.1 2.7-1.1 3.9l-9 9z')}${P('M6 20l-2 .6.6-2')}`,
 use:`${P('M8 11V5.2a1.6 1.6 0 0 1 3.2 0V10M11.2 9.4V4.2a1.6 1.6 0 0 1 3.2 0V10M14.4 9.6V6.4a1.6 1.6 0 0 1 3.2 0V15c0 4-2.5 6-5.6 6s-4.6-1.6-6-4l-2-3.2a1.5 1.5 0 0 1 2.5-1.6L8 13')}`,
 car:`${P('M3 16v-4l2-5h14l2 5v4zM3 12h18')}<circle cx="7.5" cy="16.5" r="1.8" ${F}/><circle cx="16.5" cy="16.5" r="1.8" ${F}/>`,
 gas:`${P('M8 3h8l1.5 17h-11z',N)}${P('M9 8h6M9 12h6M9 16h6')}`,
 brake:`<circle cx="12" cy="12" r="8.5" ${N}/>${P('M8 8h8v8H8z',F)}`,
 hbrake:`<circle cx="12" cy="12" r="8.5" ${N}/>${P('M9.5 17V7h3.2a2.8 2.8 0 0 1 0 5.6H9.5')}`,
 exit:`${P('M10 4H5v16h5M14 8l4 4-4 4M18 12H9')}`,
 left:`${P('M15 5l-7 7 7 7')}`, right:`${P('M9 5l7 7-7 7')}`,
 chevron:`${P('M5.5 13l6.5-6.5 6.5 6.5')}${P('M5.5 19l6.5-6.5 6.5 6.5')}`,
 map:`${P('M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2zM9 4v14M15 6v14')}`,
 pack:`${P('M7 9a5 5 0 0 1 10 0v11H7zM9.5 4.8V3.5h5v1.3M7 14h10M10 14v2.5h4V14')}`,
 flash:`${P('M8 3h8l-1 5H9zM9 8v3.5l-1.5 2V21h9v-7.5L15 11.5V8')}${P('M12 13v3')}`,
 view:`${P('M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z')}<circle cx="12" cy="12" r="2.8" ${N}/>`,
 gear:`<circle cx="12" cy="12" r="3.1" ${N}/>${P('M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9')}<circle cx="12" cy="12" r="6.6" ${N}/>`,
 // weapons (side silhouettes, facing right)
 w_pistol:`${P('M3 8.5h14.5l1 2.2H13l-1 3.6H8.8l.9 4.2H6.2L4.7 12.2 3 11.5z',F)}`,
 w_smg:`${P('M2 9h12.5v1.8H17l.6 1.4h2.4V15h-9.5l-.7 5H8.4l.6-5H5.2V12H2zM14.5 9L18 6.5h2.5V9z',F)}`,
 w_rifle:`${P('M1.5 10l3-1.4h8l1-1.4h5.5v2.2H22v1.7h-5.2l-1.5 1.2-.5 5h-3l.5-4.4H8l-.8 4.8H4.3L5 12H1.5z',F)}`,
 w_shotgun:`${P('M1.5 11.2L7 9.3h14.5v2.2H9l-3.5 3.6-3.2 2.4zM10 12.2h8v1.6h-8z',F)}`,
 w_sniper:`${P('M1.5 11l3.5-1.3h11.5l1-.8H22v1.6h-3l-.8.6H13l-.5 4.4H9.6L10 12H8l-1 4.5H4z',F)}${P('M9 6.4h6M12 6.4V9')}`,
 w_bow:`${P('M6 3.5c9 3 9 14 0 17M6 3.5v17M6 12h14M17 9l3 3-3 3')}`,
 w_melee:`${P('M5 19l1.8-1.8M7.2 16.8l9-9c1.2-1.2 3-1.4 3.9-1.1.3.9.1 2.7-1.1 3.9l-9 9z')}`,
 w_fist:`${P('M7 10V7.3a1.5 1.5 0 0 1 3 0V9M10 9V6.3a1.5 1.5 0 0 1 3 0V9M13 9V7a1.5 1.5 0 0 1 3 0v6.5c0 3.5-2 5.5-5 5.5s-4-1.5-4.5-3.5L5.5 12.5A1.5 1.5 0 0 1 8 11')}`,
 // items
 i_ammo:`${P('M8 21V10c0-3 2-5 4-5s4 2 4 5v11zM8 17h8',N)}`,
 i_med:`${P('M4 8h16v12H4zM9 8V5h6v3M12 11v6M9 14h6')}`,
 i_food:`${P('M5 11h14l-1 8H6zM4 11h16M8.5 11c0-3 1.5-5 3.5-5s3.5 2 3.5 5')}`,
 i_drink:`${P('M8 3h8v3l1 3v12H7V9l1-3zM7 12h10M10 3v3')}`,
 i_mat:`${P('M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9')}`,
 i_att:`${P('M3 9h10v4H3zM13 10h7v2h-7zM6 13v4M9 13v4')}<circle cx="16" cy="11" r=".01"/>`,
 i_armor:`${P('M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6z')}`,
 i_key:`<circle cx="8" cy="12" r="3.6" ${N}/>${P('M11.6 12H21M17 12v3M20 12v2.5')}`,
 i_tool:`${P('M14.5 4.5a4.5 4.5 0 0 0-5 6L3.8 16.2a2 2 0 0 0 2.8 2.8l5.7-5.7a4.5 4.5 0 0 0 6-5l-3 3-2.6-.6-.6-2.6z')}`,
 i_note:`${P('M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15.5h7M9 8.5h3')}`,
 i_tape:`<rect x="3" y="6.5" width="18" height="11" rx="1.5" ${N}/><circle cx="8.5" cy="12" r="2" ${N}/><circle cx="15.5" cy="12" r="2" ${N}/>`,
 i_bag:`${P('M8 7V5a4 4 0 0 1 8 0v2M5.5 7h13l1 14h-15z')}${P('M9.5 12h5')}`,
 i_misc:`${P('M12 3l2.3 5 5.5.6-4.1 3.8 1.2 5.4L12 15l-4.9 2.8 1.2-5.4L4.2 8.6l5.5-.6z')}`,
 i_cash:`<rect x="3" y="7" width="18" height="10" rx="1.5" ${N}/><circle cx="12" cy="12" r="2.4" ${N}/>`,
 i_weapon:`${P('M3 9.5l3-1.4h8l1-1.4h5v2h-2.2l-1.5 1.2-.5 5h-3l.5-4.4H8l-.8 4.8H4.3L5 12H3z',F)}`,
 // misc UI
 star:`${P('M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z')}`,
 sound:`${P('M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11')}`,
};
export function svg(name,cls='',sw=1.8){const b=ICONS[name]||ICONS.i_misc;return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`}
// weapon id/class -> icon name
export function weaponClass(w){ // w = WEAPONS entry
  if(!w)return 'fist';
  if(w.kind==='melee')return 'melee';
  if(w.kind==='throw')return w.id==='molotov'?'molotov':'grenade';
  if(w.snd==='bow'||w.silent&&w.id==='xbow')return 'bow';
  if(w.scope)return 'sniper';
  if(w.pellets)return 'shotgun';
  if(w.kind==='pistol')return 'pistol';
  if(w.id==='smg')return 'smg';
  return 'rifle';
}
export function itemIcon(d){
  if(!d)return 'i_misc';
  const t=d.type;
  if(t==='weapon')return 'w_'+({rifle:'rifle',pistol:'pistol',melee:'melee',throw:'melee'}[d.kind]||'rifle');
  if(t==='throw')return d.id==='molotov'?'molotov':'grenade';
  const m={ammo:'i_ammo',med:'i_med',food:'i_food',drink:'i_drink',mat:'i_mat',att:'i_att',armor:'i_armor',key:'i_key',tool:'i_tool',note:'i_note',tape:'i_tape',bag:'i_bag',misc:'i_misc'};
  return m[t]||'i_misc';
}
