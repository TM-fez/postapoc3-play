// ASHFALL v5 data tables: items, weapons, loot tables, notes, recipes. Pure data, no THREE.
export const RARITY={common:{n:'Common',c:'#c9c2b4'},uncommon:{n:'Uncommon',c:'#6fcf6a'},rare:{n:'Rare',c:'#4aa8ff'},epic:{n:'Epic',c:'#b56bff'},legendary:{n:'Legendary',c:'#ffb13b'}};
// type: ammo|med|food|drink|mat|att|armor|key|tool|note|tape|weapon|throw|bag|misc
const I={};
const add=(id,name,w,rar,type,value,extra={})=>{I[id]={id,name,w,rar,type,value,...extra}};
// ---- ammo (weight is per round)
add('a9','9×19 FMJ',0.012,'common','ammo',1,{cal:'9mm'});
add('a357','.357 Magnum',0.02,'uncommon','ammo',2,{cal:'.357'});
add('a762','7.62×39 FMJ',0.018,'common','ammo',2,{cal:'7.62x39'});
add('a556','5.56×45 FMJ',0.012,'common','ammo',2,{cal:'5.56'});
add('a556ap','5.56×45 AP',0.013,'rare','ammo',4,{cal:'5.56',dmg:1.18,pen:1});
add('a762x51','7.62×51 FMJ',0.025,'uncommon','ammo',3,{cal:'7.62x51'});
add('a12g','12 gauge buckshot',0.035,'common','ammo',2,{cal:'12g'});
add('a308','.308 Hunting',0.022,'uncommon','ammo',3,{cal:'.308'});
add('bolt','Crossbow bolt',0.04,'uncommon','ammo',3,{cal:'bolt'});
// ---- medical / consumables
add('bandage','Bandage',0.1,'common','med',8,{heal:22,desc:'Stops bleeding, heals a little.'});
add('medkit','Field medkit',0.8,'rare','med',45,{heal:75,desc:'Heals a lot.'});
add('painkillers','Painkillers',0.1,'uncommon','med',15,{heal:12,desc:'Takes the edge off. Heals a bit.'});
add('beans','Canned beans',0.4,'common','food',6,{food:30});
add('ration','Ration pack',0.5,'uncommon','food',12,{food:46,water:6});
add('cooked_meat','Cooked meat',0.4,'uncommon','food',9,{food:42});
add('raw_meat','Raw meat',0.4,'common','food',3,{food:12,hurt:6,desc:'Cook it on a fire.'});
add('bar','Energy bar',0.1,'common','food',4,{food:16,water:-3});
add('water','Clean water',0.5,'common','drink',6,{water:46});
add('dirty_water','Dirty water',0.5,'common','drink',1,{water:30,hurt:8,desc:'Boil it at a campfire.'});
add('soda','Old soda',0.35,'common','drink',5,{water:22,food:5});
// ---- materials
add('scrap','Scrap metal',0.3,'common','mat',3);add('cloth','Cloth rags',0.1,'common','mat',2);add('chem','Chemicals',0.2,'uncommon','mat',5);
add('fuel','Fuel can',0.8,'uncommon','mat',10);add('bottle','Glass bottle',0.2,'common','mat',1);add('elec','Electronics',0.2,'uncommon','mat',7);
add('powder','Gunpowder',0.1,'uncommon','mat',4);add('tape','Duct tape',0.1,'common','mat',2);
// ---- attachments
add('att_scope','4× Scope',0.4,'rare','att',90,{slot:'scope',desc:'ADS zoom +; slower aim.'});
add('att_supp','Suppressor',0.5,'rare','att',80,{slot:'supp',desc:'Quiet, no flash; −8% damage.'});
add('att_mag','Extended magazine',0.3,'uncommon','att',50,{slot:'mag',desc:'+50% magazine.'});
add('att_grip','Foregrip',0.3,'uncommon','att',45,{slot:'grip',desc:'−25% recoil.'});
// ---- armour / bag
add('vest_l','Padded vest',2.5,'uncommon','armor',60,{slot:'vest',dr:0.15});
add('vest_h','Plate carrier',5.0,'epic','armor',160,{slot:'vest',dr:0.32});
add('helmet','Salvaged helmet',1.2,'rare','armor',70,{slot:'helmet',hdr:0.4});
add('bag_l','Large rucksack',1.0,'rare','bag',80,{cap:18,desc:'+18 kg carry capacity.'});
// ---- keys / tools
add('lockpick','Lockpick set',0.05,'uncommon','tool',20,{desc:'Opens locked containers (may break).'});
add('key_garage','Garage key',0.05,'rare','key',0,{desc:'Opens the Raiders\u2019 locker.'});
add('repair','Repair kit',0.6,'rare','tool',40,{desc:'Restores weapon condition (use at workbench).'});
add('power_cell','Power cell',0.3,'rare','mat',25,{desc:'Tess is collecting these.'});
add('radio_part','Radio part',0.8,'rare','mat',60);
// ---- throwables
add('grenade','Frag grenade',0.4,'rare','throw',40,{wid:'grenade'});
add('molotov','Molotov cocktail',0.5,'uncommon','throw',20,{wid:'molotov'});
// ---- notes & tapes are generated from NOTES below
// ---- weapon items are generated from WEAPONS below
export const ITEMS=I;

// ---------------------------------------------------------------- weapons
// slot: 1 primary, 2 sidearm, 3 melee, 4 throw. hold: animation pose family. rpm for auto. dmg per bullet/pellet.
export const WEAPONS={
 m9:{id:'m9',name:'M9-pattern Pistol',slot:2,kind:'pistol',cal:'9mm',dmg:24,rate:0.16,auto:false,recoil:0.9,spread:0.012,range:55,mag:15,reload:1.5,zoom:1.15,w:1.0,rar:'common',value:90,snd:'pistol'},
 rev:{id:'rev',name:'.357 Revolver',slot:2,kind:'pistol',cal:'.357',dmg:54,rate:0.55,auto:false,recoil:2.4,spread:0.008,range:65,mag:6,reload:2.6,zoom:1.15,w:1.2,rar:'uncommon',value:140,snd:'magnum'},
 smg:{id:'smg',name:'SMG-9 \u201cWasp\u201d',slot:1,kind:'rifle',cal:'9mm',dmg:17,rate:0.075,auto:true,recoil:0.75,spread:0.026,range:42,mag:30,reload:2.0,zoom:1.25,w:2.8,rar:'uncommon',value:210,snd:'smg'},
 ak:{id:'ak',name:'AK-pattern Rifle',slot:1,kind:'rifle',cal:'7.62x39',dmg:37,rate:0.10,auto:true,recoil:1.7,spread:0.02,range:78,mag:30,reload:2.5,zoom:1.3,w:4.0,rar:'uncommon',value:320,snd:'rifle'},
 m4:{id:'m4',name:'M4-pattern Carbine',slot:1,kind:'rifle',cal:'5.56',dmg:30,rate:0.075,auto:true,recoil:1.1,spread:0.013,range:85,mag:30,reload:2.2,zoom:1.35,w:3.4,rar:'rare',value:380,snd:'rifle2'},
 br:{id:'br',name:'BR-14 Battle Rifle',slot:1,kind:'rifle',cal:'7.62x51',dmg:55,rate:0.19,auto:false,recoil:2.6,spread:0.011,range:120,mag:20,reload:2.6,zoom:1.5,w:4.6,rar:'rare',value:450,snd:'heavy'},
 pump:{id:'pump',name:'Pump Shotgun',slot:1,kind:'rifle',cal:'12g',dmg:11,pellets:8,rate:0.85,auto:false,recoil:3.2,spread:0.075,range:26,mag:6,reload:0.55,perShell:true,zoom:1.1,w:3.6,rar:'common',value:200,snd:'shotgun'},
 dbl:{id:'dbl',name:'Double-Barrel',slot:1,kind:'rifle',cal:'12g',dmg:12,pellets:10,rate:0.22,auto:false,recoil:3.9,spread:0.085,range:22,mag:2,reload:2.1,zoom:1.1,w:3.2,rar:'common',value:150,snd:'shotgun'},
 sniper:{id:'sniper',name:'Bolt Sniper SR-40',slot:1,kind:'rifle',cal:'7.62x51',dmg:135,rate:1.45,auto:false,recoil:3.8,spread:0.0015,range:260,mag:5,reload:3.3,zoom:6,scope:true,w:5.4,rar:'epic',value:700,snd:'sniper'},
 hunt:{id:'hunt',name:'Hunting Rifle',slot:1,kind:'rifle',cal:'.308',dmg:85,rate:1.0,auto:false,recoil:3.0,spread:0.003,range:170,mag:5,reload:2.9,zoom:3,scope:true,w:3.8,rar:'uncommon',value:300,snd:'heavy'},
 xbow:{id:'xbow',name:'Crossbow',slot:1,kind:'rifle',cal:'bolt',dmg:75,rate:2.2,auto:false,recoil:0.5,spread:0.004,range:80,mag:1,reload:2.4,zoom:1.6,w:3.0,rar:'rare',value:250,snd:'bow',silent:true},
 pipe:{id:'pipe',name:'Lead Pipe',slot:3,kind:'melee',dmg:34,rate:0.62,reach:2.3,w:1.5,rar:'common',value:5,melee:'Sword_Attack',swing:1.0},
 machete:{id:'machete',name:'Machete',slot:3,kind:'melee',dmg:46,rate:0.52,reach:2.4,w:0.9,rar:'uncommon',value:60,melee:'Sword_Attack',swing:1.1},
 axe:{id:'axe',name:'Fire Axe',slot:3,kind:'melee',dmg:66,rate:0.95,reach:2.2,w:2.0,rar:'rare',value:90,melee:'Sword_Attack',swing:0.8},
 knife:{id:'knife',name:'Combat Knife',slot:3,kind:'melee',dmg:30,rate:0.34,reach:1.8,w:0.4,rar:'common',value:25,melee:'Punch_Jab',swing:1.4,silent:true},
 grenade:{id:'grenade',name:'Frag Grenade',slot:4,kind:'throw',dmg:150,radius:7,fuse:2.3,w:0.4,rar:'rare',value:40},
 molotov:{id:'molotov',name:'Molotov',slot:4,kind:'throw',dmg:14,radius:3.2,fuse:0,fire:5,w:0.5,rar:'uncommon',value:20}
};
for(const w of Object.values(WEAPONS)){ if(w.slot<=3) I['w_'+w.id]={id:'w_'+w.id,name:w.name,w:w.w,rar:w.rar,type:'weapon',value:w.value,wid:w.id,unique:true}; }
export const AMMO_BY_CAL={'9mm':['a9'],'.357':['a357'],'7.62x39':['a762'],'5.56':['a556','a556ap'],'7.62x51':['a762x51'],'12g':['a12g'],'.308':['a308'],'bolt':['bolt']};
export const CAL_DEFAULT_AMMO={'9mm':'a9','.357':'a357','7.62x39':'a762','5.56':'a556','7.62x51':'a762x51','12g':'a12g','.308':'a308','bolt':'bolt'};

// ---------------------------------------------------------------- story notes & tapes
export const NOTES=[
 {id:'n1',kind:'note',t:'Torn diary — page 1',x:'Year 3 after the Ashfall. Mum says the ash will stop in a year. It did not. We walk at night now because the sun burns through the haze. Day 211. Rust Haven was a rumour until today.'},
 {id:'n2',kind:'note',t:'Scrawled on a map',x:'The Haven mechanic can fix any radio if you bring him a part. They say a tower north of the camp still has power. Raiders stripped a van out on the north road — the part is still in the wreck.'},
 {id:'n3',kind:'note',t:'Foreman\u2019s log',x:'Locker code for the old depot safe: 4172. Don\u2019t write it anywhere. (I wrote it here. Burn this.)'},
 {id:'n4',kind:'note',t:'Child\u2019s drawing',x:'A stick-figure family under a yellow sun. Underneath, in careful letters: "when the sun comes back we go home".'},
 {id:'n5',kind:'note',t:'Convoy manifest',x:'Convoy leaves the Haven gate at dusk. Armed escort required. Raiders have hit three of ours on the north road. If the truck is lost the Haven goes hungry this winter.'},
 {id:'n6',kind:'note',t:'Raider orders',x:'Hit the convoys, strip the bodies, and keep the part for the Boss. The tower must stay dark. Anyone who touches the radio gets the dogs.'},
 {id:'n7',kind:'note',t:'Radio operator\u2019s last page',x:'Day 14: the tower still broadcasts on a loop. Day 19: someone is answering it from the coast. They have SUNLIGHT. I\u2019m going. If you find this — follow the road north past the tower.'},
 {id:'n8',kind:'note',t:'Hunter\u2019s note',x:'The dogs used to be pets. Now they hunt in packs near the old farm. Fire scares them. Cooked meat keeps you going longer than anything in a can.'},
 {id:'n9',kind:'note',t:'Mechanic\u2019s receipt',x:'Owed: 1x power cell to Tess for the lamps. Scrap, chems, cloth — bring them to a workbench and you can make ammo, bandages and bottles of fire.'},
 {id:'n10',kind:'note',t:'Last will',x:'To whoever finds me: the supply drops come by air every few days now. Watch for the flare smoke. Whoever called them in does not want them found. Take what you need.'},
 {id:'t1',kind:'tape',t:'Tape: "Radio Haven, broadcast 1"',x:'"...this is Radio Haven, broadcasting on the old frequency. If you can hear this, you are not alone. Water at the plaza, no questions asked. Raiders to the north, do not go after dark..."'},
 {id:'t2',kind:'tape',t:'Tape: "The Engineer"',x:'"...I rebuilt the generator with whatever was in the depot. Fuel is the key. One can keeps the lights on for a night. The people need light more than they know..."'},
 {id:'t3',kind:'tape',t:'Tape: "Coast signal"',x:'"...we have sunlight here. The ash lifted three years ago. Come north, past the tower. Bring seeds. Bring batteries. Bring hope..."'}
];
for(const n of NOTES){I[n.id]={id:n.id,name:n.t,w:0.02,rar:n.kind==='tape'?'uncommon':'common',type:n.kind,value:n.kind==='tape'?10:0,note:n.id}}

// ---------------------------------------------------------------- loot tables  [id,weight,min,max]
export const LOOT={
 crate:[['scrap',9,1,4],['cloth',8,1,3],['beans',6,1,2],['bar',5,1,2],['a9',6,6,18],['a762',3,6,14],['a12g',3,2,6],['bottle',5,1,2],['tape',4,1,2],['fuel',2,1,1],['bandage',5,1,2],['soda',4,1,1],['chem',3,1,2],['note_any',2,1,1],['att_grip',0.4,1,1],['knife_w',1,1,1]],
 locker:[['bandage',7,1,3],['painkillers',4,1,2],['a9',8,10,24],['a556',5,10,20],['vest_l',2.2,1,1],['helmet',1.1,1,1],['att_mag',1.2,1,1],['lockpick',3,1,1],['m9_w',2.2,1,1],['smg_w',0.9,1,1],['medkit',1.2,1,1],['note_any',3,1,1],['cloth',4,1,3]],
 fridge:[['beans',8,1,3],['ration',5,1,2],['water',7,1,3],['soda',8,1,2],['raw_meat',2,1,2],['bar',5,1,2]],
 cabinet:[['bandage',6,1,2],['painkillers',5,1,2],['medkit',1.5,1,1],['cloth',6,1,3],['bottle',5,1,2],['chem',4,1,2],['note_any',2,1,1],['soda',2,1,1]],
 toolbox:[['scrap',10,2,6],['elec',5,1,3],['tape',6,1,2],['repair',1.8,1,1],['lockpick',2.2,1,1],['fuel',2,1,1],['powder',3,1,3],['machete_w',0.7,1,1],['axe_w',0.5,1,1],['pipe_w',1,1,1]],
 safe:[['cash',10,60,260],['a762x51',4,10,20],['a556ap',3,10,20],['att_scope',3,1,1],['att_supp',3,1,1],['m4_w',2.2,1,1],['br_w',1.7,1,1],['vest_h',1.8,1,1],['grenade',3,1,2],['medkit',3,1,2],['sniper_w',0.7,1,1],['power_cell',2,1,1]],
 trunk:[['scrap',9,1,4],['fuel',4,1,1],['cloth',5,1,2],['a9',4,5,14],['a762',3,5,12],['bottle',4,1,2],['tape',3,1,2],['soda',3,1,1],['beans',3,1,2],['note_any',1.5,1,1],['bag_l',0.5,1,1],['hunt_w',0.5,1,1],['elec',3,1,2],['rev_w',0.8,1,1],['a357',2,3,10]],
 body:[['a9',6,4,12],['a762',4,5,12],['a12g',3,2,6],['cash',6,8,40],['bandage',4,1,1],['beans',3,1,1],['cloth',3,1,2],['scrap',3,1,2],['note_any',2,1,1],['grenade',0.8,1,1],['molotov',1.4,1,1],['lockpick',1,1,1],['painkillers',1.5,1,1]],
 skeleton:[['note_story',12,1,1],['cash',5,3,20],['cloth',4,1,2],['a9',3,3,8],['bottle',2,1,1],['painkillers',1,1,1]],
 drop:[['cash',6,100,300],['m4_w',2,1,1],['ak_w',2,1,1],['br_w',1.4,1,1],['sniper_w',0.7,1,1],['pump_w',1.2,1,1],['a556',6,30,60],['a762',5,30,60],['a762x51',4,20,40],['a12g',4,12,24],['medkit',6,1,3],['bandage',6,2,5],['vest_h',1.6,1,1],['vest_l',2.5,1,1],['helmet',2,1,1],['att_scope',2,1,1],['att_supp',2,1,1],['att_mag',2,1,1],['att_grip',2,1,1],['grenade',4,1,3],['molotov',3,1,3],['ration',5,2,4],['water',5,2,4],['bag_l',1.2,1,1],['repair',2,1,1]],
 raider:[['a9',5,6,14],['a762',3,6,14],['a12g',3,3,8],['cash',6,10,45],['bandage',3,1,1],['soda',2,1,1],['scrap',3,1,2],['grenade',0.7,1,1],['molotov',1.2,1,1],['note_any',2,1,1]],
 vendor_stock:[['bandage',1,3,3],['medkit',1,2,2],['beans',1,6,6],['ration',1,4,4],['water',1,6,6],['a9',1,60,60],['a762',1,60,60],['a556',1,40,40],['a12g',1,30,30],['a357',1,24,24],['a762x51',1,20,20],['a308',1,10,10],['bolt',1,10,10],['fuel',1,2,2],['lockpick',1,2,2],['repair',1,1,1],['grenade',1,2,2],['molotov',1,3,3],['att_grip',1,1,1],['att_mag',1,1,1],['vest_l',1,1,1],['helmet',1,1,1],['bag_l',1,1,1],['bottle',1,6,6],['cloth',1,10,10],['scrap',1,10,10],['chem',1,4,4],['tape',1,6,6],['powder',1,6,6]]
};
export const VENDOR_WEAPONS=['m9','rev','pump','dbl','smg','hunt','machete','knife','xbow'];
// ---------------------------------------------------------------- crafting
export const RECIPES=[
 {id:'r_bandage',name:'Bandage',out:['bandage',2],needs:{cloth:2},bench:false},
 {id:'r_a9',name:'9×19 rounds ×12',out:['a9',12],needs:{scrap:1,powder:1},bench:true},
 {id:'r_a762',name:'7.62×39 rounds ×10',out:['a762',10],needs:{scrap:1,powder:1},bench:true},
 {id:'r_a556',name:'5.56×45 rounds ×10',out:['a556',10],needs:{scrap:1,powder:2},bench:true},
 {id:'r_a12g',name:'12ga shells ×6',out:['a12g',6],needs:{scrap:1,powder:1,cloth:1},bench:true},
 {id:'r_bolt',name:'Crossbow bolts ×4',out:['bolt',4],needs:{scrap:2,tape:1},bench:true},
 {id:'r_molotov',name:'Molotov cocktail',out:['molotov',1],needs:{bottle:1,cloth:1,fuel:1},bench:false},
 {id:'r_powder',name:'Gunpowder ×3',out:['powder',3],needs:{chem:2},bench:true},
 {id:'r_medkit',name:'Field medkit',out:['medkit',1],needs:{bandage:3,chem:1,tape:1},bench:true},
 {id:'r_repair',name:'Repair kit',out:['repair',1],needs:{scrap:4,tape:2},bench:true},
 {id:'r_grenade',name:'Frag grenade',out:['grenade',1],needs:{scrap:2,powder:2,tape:1},bench:true},
 {id:'r_lockpick',name:'Lockpick set',out:['lockpick',1],needs:{scrap:2},bench:true}
];
export const COOK=[{from:'raw_meat',to:'cooked_meat'},{from:'dirty_water',to:'water'}];
add('cash','Cash',0,'common','cash',1);
