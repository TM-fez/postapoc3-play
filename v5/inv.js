// ASHFALL v5 inventory / loot logic (pure data, no THREE, no DOM)
import {ITEMS,WEAPONS,AMMO_BY_CAL,CAL_DEFAULT_AMMO,LOOT,NOTES} from './data.js';
export const mkInst=(wid,o={})=>({wid,mag:o.mag??WEAPONS[wid].mag,cond:o.cond??100,att:o.att||{},ammoId:o.ammoId||CAL_DEFAULT_AMMO[WEAPONS[wid].cal]||null});
export function weaponStats(inst){
  const b=WEAPONS[inst.wid];const s={...b};const a=inst.att||{};
  if(a.scope){s.scoped=true;s.zoom=b.scope?b.zoom*1.4:3.2}
  else if(b.scope)s.scoped=true;
  if(a.supp){s.dmg*=0.92;s.range*=0.95;s.supp=true}
  if(a.mag&&b.mag>2&&!b.perShell&&b.slot<=2){s.mag=Math.round(b.mag*1.5)}
  if(a.grip){s.recoil*=0.75;s.spread*=0.9}
  const c=inst.cond??100;s.jam=0;
  if(c<50){const f=(50-c)/50;s.spread*=1+f*0.8;s.jam=f*0.05;s.dmg*=1-f*0.2}
  const am=inst.ammoId&&ITEMS[inst.ammoId];if(am&&am.dmg)s.dmg*=am.dmg;
  return s;
}
export class Inv{
  constructor(){this.items=[];this.cash=0;this.baseCap=20;this.slots={1:null,2:null,3:null,4:null};this.vest=null;this.helmet=null;this.bag=null;this.pref={}}
  cap(){return this.baseCap+(this.bag?ITEMS[this.bag].cap||0:0)}
  weight(){let w=0;for(const it of this.items)w+=ITEMS[it.id].w*it.n;
    for(let s=1;s<=3;s++){const i=this.slots[s];if(i){w+=WEAPONS[i.wid].w;const a=i.att||{};for(const k in a)if(a[k])w+=0.3}}
    for(const k of['vest','helmet','bag'])if(this[k])w+=ITEMS[this[k]].w;return w}
  count(id){let n=0;for(const it of this.items)if(it.id===id)n+=it.n;return n}
  ammoCount(cal){let n=0;for(const it of this.items){const d=ITEMS[it.id];if(d.cal===cal)n+=it.n}return n}
  ammoFor(cal){ // ordered list of ammo ids the player holds for this caliber, preferred first
    const ids=[...new Set(this.items.filter(i=>ITEMS[i.id].cal===cal).map(i=>i.id))];const p=this.pref[cal];ids.sort((a,b)=>(a===p?-1:0)-(b===p?-1:0));return ids}
  room(id){const w=ITEMS[id].w;if(w<=0)return 999;return Math.floor((this.cap()-this.weight()+1e-6)/w)}
  add(id,n=1,inst=null){
    if(id==='cash'){this.cash+=n;return n}
    const d=ITEMS[id];if(!d)return 0;
    if(inst||d.unique){ // unique: each its own entry
      if(this.room(id)<1)return 0;this.items.push({id,n:1,inst:inst||mkInst(d.wid)});return 1}
    const k=Math.min(n,this.room(id));if(k<=0)return 0;
    const ex=this.items.find(i=>i.id===id&&!i.inst);if(ex)ex.n+=k;else this.items.push({id,n:k});return k}
  remove(id,n=1){let left=n;for(let i=this.items.length-1;i>=0&&left>0;i--){const it=this.items[i];if(it.id!==id||it.inst)continue;const t=Math.min(left,it.n);it.n-=t;left-=t;if(it.n<=0)this.items.splice(i,1)}return n-left}
  removeAt(idx,n=1){const it=this.items[idx];if(!it)return;it.n-=n;if(it.n<=0)this.items.splice(idx,1)}
  takeAmmo(cal,n){let got=0;for(const id of this.ammoFor(cal)){if(got>=n)break;got+=this.remove(id,n-got)}return got}
  has(needs){for(const k in needs)if(this.count(k)<needs[k])return false;return true}
  serialize(){return JSON.stringify({items:this.items,cash:this.cash,slots:this.slots,vest:this.vest,helmet:this.helmet,bag:this.bag,pref:this.pref})}
  load(s){const o=typeof s==='string'?JSON.parse(s):s;Object.assign(this,{items:o.items||[],cash:o.cash||0,slots:o.slots||{1:null,2:null,3:null,4:null},vest:o.vest||null,helmet:o.helmet||null,bag:o.bag||null,pref:o.pref||{}})}
}
// weighted loot roll. rng: ()=>[0,1). foundNotes: Set of note ids already found (to avoid dupes)
export function rollLoot(table,rng,found=new Set(),count=null){
  const T=LOOT[table];if(!T)return[];
  const counts={crate:[1,3],locker:[2,3],fridge:[2,3],cabinet:[1,3],toolbox:[1,3],safe:[2,4],trunk:[1,3],body:[1,3],skeleton:[1,2],drop:[5,7],raider:[1,3]};
  const [a,b]=count||counts[table]||[1,3];const n=a+Math.floor(rng()*(b-a+1));
  const tot=T.reduce((s,e)=>s+e[1],0);const out=[];
  for(let i=0;i<n;i++){
    let r=rng()*tot,e=T[0];for(const x of T){r-=x[1];if(r<=0){e=x;break}}
    let [id,,mn,mx]=e;let q=mn+Math.floor(rng()*(mx-mn+1));
    if(id==='note_any'||id==='note_story'){
      const pool=NOTES.filter(n=>!found.has(n.id)&&(id==='note_story'?n.kind==='note':true));
      const nn=(pool.length?pool:NOTES)[Math.floor(rng()*(pool.length?pool.length:NOTES.length))];id=nn.id;q=1}
    else if(id.endsWith('_w')){const wid=id.slice(0,-2);const inst=mkInst(wid,{mag:Math.floor(rng()*WEAPONS[wid].mag*0.6),cond:40+Math.floor(rng()*55)});out.push({id:'w_'+wid,n:1,inst});continue}
    const ex=out.find(o=>o.id===id&&!o.inst);if(ex)ex.n+=q;else out.push({id,n:q});
  }
  return out;
}
export const itemName=(it)=>{const d=ITEMS[it.id];return d?d.name:it.id};
