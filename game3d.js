/* ============================================================
   YGGDRASIL DEFENSE — 3D (Beta)
   Real WebGL via Three.js: perspective camera, lights & shadows,
   low-poly procedural models. Same core rules as the 2D game.
   ============================================================ */
'use strict';
const $=id=>document.getElementById(id);

// ---------- board / rules (mirrors 2D) ----------
const COLS=36, ROWS=36;
const T_GROUND=0, T_TOWER=1, T_BLOCK=2, T_SPAWN=3, T_BASE=4, T_TREE=5, T_VEIN=6, T_BUILDING=7, T_WALL=8;
const TOWERS={
  einherjar:{name:'Einherjar',cost:60, wood:15,color:0x8fd6a0,range:2.6,dmg:14,rate:0.55,bspeed:11,unlock:0},
  runestein:{name:'Runestein',cost:85, wood:20,color:0x7db8ff,range:2.4,dmg:7, rate:0.9, bspeed:9, slow:0.45,slowT:1.4,unlock:0},
  walkure:{ name:'Walküre',  cost:120,wood:25,color:0xffe27a,range:2.3,dmg:9, rate:0.16,bspeed:14,unlock:2},
  mjolnir:{ name:'Mjölnir',  cost:160,wood:35,color:0xff9d5a,range:2.5,dmg:34,rate:1.25,bspeed:10,splash:1.4,unlock:4},
  bifrost:{ name:'Bifröst',  cost:210,wood:40,color:0xc88fff,range:5.2,dmg:80,rate:1.9, bspeed:20,unlock:6},
};
// economy buildings (Age-of-Darkness-style base building — GDD Module 04+09)
const BUILDINGS={
  palisade:{name:'Palisade',  cost:0,  wood:12, color:0x8a6a40, unlock:0, hp:110 },
  lumber:{ name:'Holzfäller', cost:90, wood:0,  color:0xc8934a, unlock:0, radius:5.5, workers:2, hp:130 },
  goldmine:{name:'Goldmine',  cost:0,  wood:60, color:0xfbbf24, unlock:0, rate:3.5, yield:4 },
  barracks:{name:'Kaserne',   cost:140,wood:40, color:0x6ab0ff, unlock:1, hp:160, troops:3 },
  archery:{ name:'Schießstand',cost:160,wood:50, color:0x9fe08a, unlock:2, hp:140, troops:2 },
  shieldhall:{name:'Schildhalle',cost:190,wood:70, color:0xd8b34a, unlock:3, hp:200, troops:2 },
};
const TROOP={hp:70,dps:11,rate:0.8,speed:1.9,aggro:4.5,respawn:14};
const ARCHER={hp:42,dps:8,rate:1.15,range:3.2,speed:1.8};
const HUSKARL={hp:190,dps:6,rate:1.0,speed:1.45};
const TOWER_HP=170;
const ENEMIES={
  draugr:   {name:'Draugr',    hp:34, speed:1.15,reward:6,  r:0.40,atk:8},
  berserker:{name:'Berserker', hp:26, speed:2.1, reward:7,  r:0.36,atk:13},
  troll:    {name:'Troll',     hp:150,speed:0.75,reward:16, r:0.55,atk:30},
  helhound: {name:'Helhound',  hp:16, speed:3.0, reward:5,  r:0.33,atk:6},
  jormun:   {name:'Jörmungandr',hp:900,speed:0.9,reward:120,r:0.80,atk:80,boss:true},
};
const KEYS=Object.keys(TOWERS);

// ---------- difficulty / weather / events / runes ----------
const DIFFS={easy:{label:'Leicht',hp:0.8,gold:1.2,lives:26},normal:{label:'Normal',hp:1,gold:1,lives:20},
  ragnarok:{label:'Ragnarök',hp:1.4,gold:0.9,lives:12}};
let selDiff='normal';
const WEATHERS={
  clear:{name:'Klar',dmg:1,rate:1,espd:1,ehp:1,col:0x000000,desc:'Ruhiges Wetter.'},
  frost:{name:'Frost',dmg:1,rate:1,espd:0.8,ehp:1,col:0xcfeaff,desc:'Feinde sind verlangsamt.'},
  storm:{name:'Sturm',dmg:1,rate:1.14,espd:1.12,ehp:1,col:0x8fb8e0,desc:'Türme langsamer, Feinde schneller.'},
  ash:{name:'Aschewolke',dmg:1,rate:1,espd:1,ehp:1.22,col:0xb7a89a,desc:'Feinde sind zäher.'},
  divine:{name:'Göttliches Licht',dmg:1.25,rate:1,espd:1,ehp:1,col:0xffe9a8,desc:'Türme +25% Schaden.'},
};
function rollWeather(){ if(G.wave<=1)return 'clear'; const r=Math.random();
  return r<0.42?'clear':r<0.6?'frost':r<0.76?'storm':r<0.9?'ash':'divine'; }
const EVENTS=[
  {msg:'Goldader entdeckt! +80 Gold',run:()=>{G.gold+=80;}},
  {msg:'Meteorschlag trifft alle Feinde!',run:()=>{const d=28+G.wave*4;for(const e of G.enemies){if(!e.dead)hurt(e,d);}}},
  {msg:'Weltenbaum heilt · +3 Leben',run:()=>{G.lives=Math.min(30,G.lives+3);}},
  {msg:'Bragis Lied · Türme +30% Feuerrate (8s)',run:()=>{G.fx.rateMul=0.7;G.fx.rateT=8;}},
  {msg:'Nebelschwaden · Feinde +25% Tempo (6s)',run:()=>{G.fx.espdMul=1.25;G.fx.espdT=6;}},
  {msg:'Runenschub · +4% Schaden dauerhaft',run:()=>{G.mods.dmg*=1.04;}},
  {msg:'Überfall! Zusätzliche Feinde nahen',run:()=>{const n=3+Math.floor(G.wave/2);for(let k=0;k<n;k++)G.spawnQueue.push(Math.random()<0.5?'berserker':'draugr');}},
  {msg:'Händlerkarawane · +15% Gold-Zins jetzt',run:()=>{G.gold+=Math.round(G.gold*0.15);}},
  {msg:'Muspelheim-Glut · Türme +20% Schaden (10s)',run:()=>{G.fx.dmgMul=1.2;G.fx.dmgT=10;}},
  {msg:'Frostbann · Alle Feinde kurz verlangsamt',run:()=>{for(const e of G.enemies){if(!e.dead){e.slow=0.5;e.slowT=3;}}}},
  {msg:'Thors Zorn trifft die stärksten Feinde',run:()=>{const s=[...G.enemies].filter(e=>!e.dead).sort((a,b)=>b.hp-a.hp).slice(0,3);for(const e of s)hurt(e,60+G.wave*6);}},
  {msg:'Reiche Ernte · +50 Gold',run:()=>{G.gold+=50;}},
  {msg:'Odins Schutz · Langhaus +2 Leben',run:()=>{G.lives=Math.min(30,G.lives+2);}},
  {msg:'Wildes Getier · Feinde +18% Tempo (5s)',run:()=>{G.fx.espdMul=1.18;G.fx.espdT=5;}},
];
const RUNES=[
  {id:'berserk',name:'Berserkerwut',rar:'common',desc:'+18% Schaden aller Türme',apply:m=>m.dmg*=1.18},
  {id:'eagle',name:'Odins Auge',rar:'common',desc:'+12% Reichweite',apply:m=>m.range*=1.12},
  {id:'swift',name:'Schnellschuss',rar:'common',desc:'+14% Feuerrate',apply:m=>m.rate*=0.86},
  {id:'midas',name:'Midas-Hand',rar:'common',desc:'+22% Gold pro Kill',apply:m=>m.gold*=1.22},
  {id:'thrift',name:'Runenschmied',rar:'common',desc:'Türme 12% günstiger',apply:m=>m.discount*=0.88},
  {id:'heal',name:'Yggdrasil-Segen',rar:'rare',desc:'Langhaus +4 Leben (jetzt & je Welle +1)',apply:m=>{G.lives=Math.min(30,G.lives+4);m.baseHeal=(m.baseHeal||0)+1;}},
  {id:'interest',name:'Wucherzins',rar:'rare',desc:'+6% Gold-Zins pro Welle',apply:m=>m.interest+=0.06},
  {id:'frost',name:'Frostrunen',rar:'rare',desc:'Alle Schüsse verlangsamen (+15%)',apply:m=>{m.slow=Math.min(0.6,m.slow+0.15);}},
  {id:'power',name:'Sturmzorn',rar:'rare',desc:'+30% Schaden, +8% Feuerrate',apply:m=>{m.dmg*=1.3;m.rate*=0.92;}},
  {id:'sell',name:'Händlergunst',rar:'common',desc:'Verkauf gibt 85% zurück',apply:m=>m.sell=Math.max(m.sell,0.85)},
  {id:'splash',name:'Splittersegen',rar:'legendary',desc:'Alle Türme erhalten Flächenschaden',apply:m=>{m.splash=Math.max(m.splash,1.15);}},
  {id:'fury',name:'Blutopfer',rar:'legendary',desc:'+45% Schaden — aber −2 Leben',apply:m=>{m.dmg*=1.45;G.lives=Math.max(1,G.lives-2);}},
  {id:'goldrush',name:'Drachenhort',rar:'legendary',desc:'+40% Gold & Türme 15% günstiger',apply:m=>{m.gold*=1.4;m.discount*=0.85;}},
  {id:'divine',name:'Bifröst-Gunst',rar:'legendary',desc:'+20% Schaden, +15% Reichweite, +12% Feuerrate',apply:m=>{m.dmg*=1.2;m.range*=1.15;m.rate*=0.88;}},
];
const RAR_COL={common:'#8fa9bd',rare:'#5aa9ff',legendary:'#fbbf24'};

let G=null;
function idx(c,r){return r*COLS+c;}
function inB(c,r){return c>=0&&c<COLS&&r>=0&&r<ROWS;}
function tw(c){return c-COLS/2+0.5;}   // tile -> world x
function tz(r){return r-ROWS/2+0.5;}   // tile -> world z
function clamp(v,a,b){return v<a?a:v>b?b:v;}

function newGame(){
  const diff=DIFFS[selDiff]||DIFFS.normal;
  G={diff,diffKey:selDiff,grid:new Uint8Array(COLS*ROWS),tower:new Array(COLS*ROWS).fill(null),
     dist:new Int32Array(COLS*ROWS),flow:new Int8Array(COLS*ROWS*2),
     enemies:[],bullets:[],gold:230,wood:120,lives:diff.lives,wave:0,score:0,kills:0,
     trees:{},veins:{},buildings:[],workers:[],mines:[],walls:{},troops:[],rallyFor:null,
     mods:{dmg:1,range:1,rate:1,gold:1,sell:0.6,discount:1,interest:0,splash:0,slow:0,slowT:0.8,
       woodYield:6,mineYield:0,wallHp:0,wSpeed:1,troopDmg:1,troopHp:1},
     runes:{},awaitingRune:false,
     tech:{done:[],cur:null,prog:0},
     buildTimer:50,
     weather:WEATHERS.clear,weatherKey:'clear',
     fx:{rateMul:1,rateT:0,espdMul:1,espdT:0,dmgMul:1,dmgT:0},
     eventTimer:0,nextEventAt:13,
     spawn:{c:0,r:ROWS>>1},base:{c:COLS-1,r:ROWS>>1},basePlaced:false,selected:'einherjar',inspect:null,
     waveActive:false,spawnQueue:[],spawnTimer:0,running:false,paused:false,speed:1,over:false};
  G.grid.fill(T_GROUND);
  for(let c=0;c<COLS;c++){G.grid[idx(c,0)]=T_BLOCK;G.grid[idx(c,ROWS-1)]=T_BLOCK;}
  for(let r=0;r<ROWS;r++){G.grid[idx(0,r)]=T_BLOCK;G.grid[idx(COLS-1,r)]=T_BLOCK;}
  G.grid[idx(G.spawn.c,G.spawn.r)]=T_SPAWN;   // base tile is set later by placeBase()
  for(const [c,r] of [[6,6],[6,7],[15,15],[15,14],[11,4],[10,17]]) if(G.grid[idx(c,r)]===T_GROUND) G.grid[idx(c,r)]=T_BLOCK;
  scatterResources();
  computeFlow();
}
// forests + gold veins (kept off the spawn-to-base corridor so a path always exists)
function scatterResources(){
  const midR=ROWS>>1;
  const ok=(c,r)=>inB(c,r)&&G.grid[idx(c,r)]===T_GROUND&&Math.abs(r-midR)>1&&c>1&&c<COLS-2;
  // 16 tree clusters (big map)
  for(let k=0;k<16;k++){
    const cc=2+((Math.random()*(COLS-4))|0), cr=2+((Math.random()*(ROWS-4))|0);
    const n=5+((Math.random()*5)|0);
    for(let t=0;t<n;t++){
      const c=cc+((Math.random()*5)|0)-2, r=cr+((Math.random()*5)|0)-2;
      if(!ok(c,r))continue;
      const i=idx(c,r); G.grid[i]=T_TREE; G.trees[i]={hp:4};
    }
  }
  // 9 gold veins
  let placed=0,guard=0;
  while(placed<9&&guard++<400){
    const c=2+((Math.random()*(COLS-4))|0), r=2+((Math.random()*(ROWS-4))|0);
    if(!ok(c,r))continue;
    const i=idx(c,r); G.grid[i]=T_VEIN; G.veins[i]={mine:null}; placed++;
  }
}
function walk(c,r){ if(!inB(c,r))return false; const t=G.grid[idx(c,r)]; return t===T_GROUND||t===T_SPAWN||t===T_BASE; }
// weighted step cost: 0 = impassable, structures are expensive but breakable
function stepCost(c,r){
  if(!inB(c,r))return 0;
  const t=G.grid[idx(c,r)];
  if(t===T_GROUND||t===T_SPAWN||t===T_BASE)return 1;
  if(t===T_WALL||t===T_TOWER||t===T_BUILDING)return 22;  // enemies will smash through if it's cheaper
  return 0;  // rocks / trees / veins
}
function computeFlow(){
  const D=G.dist; D.fill(-1);
  if(!G.basePlaced){ G.flow.fill(0); return; }
  const N=[[1,0],[-1,0],[0,1],[0,-1]];
  // Dijkstra from base (bucket queue; costs are small ints)
  const buckets=[]; const push=(d,i)=>{ (buckets[d]=buckets[d]||[]).push(i); };
  const b0=idx(G.base.c,G.base.r); D[b0]=0; push(0,b0);
  let maxD=0;
  for(let d=0;d<=maxD||d<buckets.length;d++){
    const bk=buckets[d]; if(!bk)continue;
    for(const cur of bk){
      if(D[cur]!==d)continue;   // stale entry
      const cc=cur%COLS,cr=(cur/COLS)|0;
      for(const[dc,dr]of N){
        const nc=cc+dc,nr=cr+dr, w=stepCost(nc,nr);
        if(!w)continue;
        const ni=idx(nc,nr), nd=d+w;
        if(D[ni]===-1||nd<D[ni]){ D[ni]=nd; push(nd,ni); if(nd>maxD)maxD=nd; }
      }
    }
  }
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const i=idx(c,r); G.flow[i*2]=0;G.flow[i*2+1]=0;
    if(D[i]<=0)continue; let best=D[i],bx=0,bz=0;
    for(const[dc,dr]of N){const nc=c+dc,nr=r+dr; if(!stepCost(nc,nr))continue; const nd=D[idx(nc,nr)];
      if(nd!==-1&&nd<best){best=nd;bx=dc;bz=dr;}} G.flow[i*2]=bx;G.flow[i*2+1]=bz; }
}
function pathOK(){return G.dist[idx(G.spawn.c,G.spawn.r)]>=0;}

// ============================================================
//  THREE SCENE
// ============================================================
let renderer,scene,camera,sun,hemi;
const cam={tx:0,tz:0,dist:14,min:7,max:38,tilt:0.95,targetDist:14};
let panVX=0,panVZ=0;   // camera glide (inertia)
function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c); return t;
}
let GLOWTEX, WHITETEX;
function whiteTexture(){ const c=document.createElement('canvas');c.width=c.height=2;
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,2,2); return new THREE.CanvasTexture(c); }
function std(color,o){ return new THREE.MeshStandardMaterial(Object.assign({color},o||{})); }
function glowSprite(color,scale,opacity){
  const m=new THREE.SpriteMaterial({map:GLOWTEX,color,transparent:true,opacity:opacity==null?0.8:opacity,
    blending:THREE.AdditiveBlending,depthWrite:false});
  const s=new THREE.Sprite(m); s.scale.setScalar(scale); return s;
}

function initThree(){
  renderer=new THREE.WebGLRenderer({canvas:$('gl'),antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=0.72;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x060b12);
  scene.fog=new THREE.Fog(0x060b12,26,66);
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,0.1,120);
  GLOWTEX=glowTexture(); WHITETEX=whiteTexture();
  hemi=new THREE.HemisphereLight(0x2c4258,0x05080c,0.5);
  scene.add(hemi);
  sun=new THREE.DirectionalLight(0xcfe0f2,0.85);  // cold moonlight
  sun.position.set(-14,24,10); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const sc=sun.shadow.camera; sc.left=-24;sc.right=24;sc.top=24;sc.bottom=-24;sc.far=80;
  scene.add(sun);
  window.addEventListener('resize',()=>{ renderer.setSize(innerWidth,innerHeight);
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); });
  initBursts();
}
let shake=0;
function addShake(a){ shake=Math.max(shake,a); }
function updateCamera(){
  const t=cam.tilt;
  let sx=0,sy=0;
  if(shake>0.003){ sx=(Math.random()-0.5)*shake; sy=(Math.random()-0.5)*shake; shake*=0.88; } else shake=0;
  camera.position.set(cam.tx+sx, Math.sin(t)*cam.dist+sy, cam.tz+Math.cos(t)*cam.dist);
  camera.lookAt(cam.tx+sx,0,cam.tz);
}

// ============================================================
//  DAY / NIGHT CYCLE — build phase = day, assault = night,
//  boss wave = blood moon
// ============================================================
const PHASES={
  day:  { sun:new THREE.Color(0xffdfb0), sunI:1.45, hemiI:0.85, bg:new THREE.Color(0x0e1a24), exp:0.92 },
  night:{ sun:new THREE.Color(0xcfe0f2), sunI:0.85, hemiI:0.50, bg:new THREE.Color(0x060b12), exp:0.72 },
  blood:{ sun:new THREE.Color(0xff9d8a), sunI:0.80, hemiI:0.40, bg:new THREE.Color(0x0e0709), exp:0.70 },
};
function updateDayNight(dt){
  if(!G)return;
  const tgt = G.waveActive ? (G.wave%5===0?PHASES.blood:PHASES.night) : PHASES.day;
  const k=Math.min(1,dt*1.4);
  sun.color.lerp(tgt.sun,k);
  sun.intensity+=(tgt.sunI-sun.intensity)*k;
  hemi.intensity+=(tgt.hemiI-hemi.intensity)*k;
  scene.background.lerp(tgt.bg,k);
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure+=(tgt.exp-renderer.toneMappingExposure)*k;
}

// ============================================================
//  3D FX — pooled particle bursts + lightning arcs
// ============================================================
const PMAX=480;
let bGeo=null,bPts=null,bAlive=0;
const bPos=new Float32Array(PMAX*3), bVel=new Float32Array(PMAX*3),
      bT=new Float32Array(PMAX), bLife=new Float32Array(PMAX),
      bCol=new Float32Array(PMAX*3), bBase=new Float32Array(PMAX*3);
function initBursts(){
  bGeo=new THREE.BufferGeometry();
  bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));
  bGeo.setAttribute('color',new THREE.BufferAttribute(bCol,3));
  const m=new THREE.PointsMaterial({size:0.11,vertexColors:true,transparent:true,opacity:0.95,
    blending:THREE.AdditiveBlending,depthWrite:false});
  bPts=new THREE.Points(bGeo,m); bPts.frustumCulled=false; scene.add(bPts);
  bGeo.setDrawRange(0,0);
}
function burst(x,y,z,hex,n,spd){
  const c=new THREE.Color(hex);
  for(let k=0;k<n;k++){
    if(bAlive>=PMAX)break;
    const i=bAlive++;
    bPos[i*3]=x; bPos[i*3+1]=y; bPos[i*3+2]=z;
    const a=Math.random()*Math.PI*2, el=Math.random()*Math.PI-Math.PI/2, s=(0.4+Math.random()*0.6)*(spd||3);
    bVel[i*3]=Math.cos(a)*Math.cos(el)*s; bVel[i*3+1]=Math.abs(Math.sin(el))*s+1.2; bVel[i*3+2]=Math.sin(a)*Math.cos(el)*s;
    bT[i]=0; bLife[i]=0.35+Math.random()*0.35;
    bBase[i*3]=c.r; bBase[i*3+1]=c.g; bBase[i*3+2]=c.b;
  }
}
function updateBursts(dt){
  if(!bGeo)return;
  let i=0;
  while(i<bAlive){
    bT[i]+=dt;
    if(bT[i]>=bLife[i]){
      const l=--bAlive;
      for(let k=0;k<3;k++){ bPos[i*3+k]=bPos[l*3+k]; bVel[i*3+k]=bVel[l*3+k]; bBase[i*3+k]=bBase[l*3+k]; }
      bT[i]=bT[l]; bLife[i]=bLife[l];
      continue;
    }
    bVel[i*3+1]-=6*dt;
    bPos[i*3]+=bVel[i*3]*dt; bPos[i*3+1]+=bVel[i*3+1]*dt; bPos[i*3+2]+=bVel[i*3+2]*dt;
    if(bPos[i*3+1]<0.02){ bPos[i*3+1]=0.02; bVel[i*3+1]*=-0.3; }
    const f=1-bT[i]/bLife[i];
    bCol[i*3]=bBase[i*3]*f; bCol[i*3+1]=bBase[i*3+1]*f; bCol[i*3+2]=bBase[i*3+2]*f;
    i++;
  }
  bGeo.setDrawRange(0,bAlive);
  bGeo.attributes.position.needsUpdate=true;
  bGeo.attributes.color.needsUpdate=true;
}
const arcs=[];
function lightningArc(x1,y1,z1,x2,y2,z2,hex,jit){
  const pts=[],N=7,J=jit==null?0.25:jit;
  for(let i=0;i<=N;i++){ const t=i/N, e=(i>0&&i<N)?1:0;
    pts.push(new THREE.Vector3(
      x1+(x2-x1)*t+(Math.random()-0.5)*J*e,
      y1+(y2-y1)*t+(Math.random()-0.5)*J*e,
      z1+(z2-z1)*t+(Math.random()-0.5)*J*e)); }
  const g=new THREE.BufferGeometry().setFromPoints(pts);
  const m=new THREE.LineBasicMaterial({color:hex,transparent:true,opacity:0.9,
    blending:THREE.AdditiveBlending,depthWrite:false});
  const l=new THREE.Line(g,m); scene.add(l);
  arcs.push({l,t:0,life:0.13});
}
function updateArcs(dt){
  for(const a of arcs){ a.t+=dt; a.l.material.opacity=0.9*(1-a.t/a.life); }
  for(let i=arcs.length-1;i>=0;i--) if(arcs[i].t>=arcs[i].life){
    scene.remove(arcs[i].l); arcs[i].l.geometry.dispose(); arcs[i].l.material.dispose(); arcs.splice(i,1); }
}

// ---------- static board ----------
let boardGroup, baseGroup, spawnRing, rangeRing;
function buildBoard(){
  if(boardGroup) scene.remove(boardGroup);
  boardGroup=new THREE.Group();
  // under-plane
  const up=new THREE.Mesh(new THREE.PlaneGeometry(COLS+20,ROWS+20), std(0x0a141d,{roughness:1}));
  up.rotation.x=-Math.PI/2; up.position.y=-0.09; up.receiveShadow=true; boardGroup.add(up);
  // organic terrain: seamless tiles with per-instance noise coloring (no board-game grid)
  const noise=(c,r,s)=>{ const n=Math.sin(c*12.9898+r*78.233+s*37.7)*43758.5453; return n-Math.floor(n); };
  const tileG=new THREE.BoxGeometry(1.002,0.12,1.002);
  const list=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(G.grid[idx(c,r)]===T_BLOCK) continue;
    list.push([c,r]);
  }
  const im=new THREE.InstancedMesh(tileG, std(0xffffff,{roughness:0.95}), list.length);
  const m=new THREE.Matrix4();
  const cBase=new THREE.Color(0x15242e), cMoss=new THREE.Color(0x1a2f22), cDark=new THREE.Color(0x0e1a22), col=new THREE.Color();
  list.forEach(([c,r],i)=>{
    m.makeTranslation(tw(c),-0.06,tz(r)); im.setMatrixAt(i,m);
    // large mossy patches + fine grain
    const patch=noise((c/5)|0,(r/5)|0,1), grain=noise(c,r,2);
    col.copy(cBase).lerp(cMoss,patch*0.75).lerp(cDark,grain*0.35);
    im.setColorAt(i,col);
  });
  im.receiveShadow=true; boardGroup.add(im);
  // grass: crossed tapered blades (not cones!), instanced with color variation
  const bladeGeo=(()=>{
    // one tuft = 3 crossed tapered blades, hand-built triangles
    const pos=[]; const blade=(ang,lean)=>{
      const w=0.045,h=0.22,ca=Math.cos(ang),sa=Math.sin(ang);
      const lx=Math.cos(ang+1.57)*lean, lz=Math.sin(ang+1.57)*lean;
      // two triangles forming a tapered quad (tip pinched)
      const A=[-w*ca,0,-w*sa], B=[w*ca,0,w*sa], T=[lx*0.4,h,lz*0.4], T2=[lx*0.4+0.008,h,lz*0.4+0.008];
      pos.push(...A,...B,...T, ...B,...T2,...T);
    };
    blade(0,0.05); blade(1.05,-0.04); blade(2.1,0.06);
    const g2=new THREE.BufferGeometry();
    g2.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g2.computeVertexNormals();
    return g2;
  })();
  const tuftN=Math.min(list.length,420);
  const tuft=new THREE.InstancedMesh(bladeGeo, std(0xffffff,{roughness:0.95,side:THREE.DoubleSide}), tuftN);
  const q2=new THREE.Quaternion(), e2=new THREE.Euler(), s2=new THREE.Vector3(), p2=new THREE.Vector3();
  const gc1=new THREE.Color(0x39683f), gc2=new THREE.Color(0x516d35), gcol=new THREE.Color();
  for(let i=0;i<tuftN;i++){
    const [c,r]=list[(Math.random()*list.length)|0];
    e2.set(0,Math.random()*3.14,0); q2.setFromEuler(e2);
    const sc2=0.7+Math.random()*1.0; s2.set(sc2,0.6+Math.random()*1.1,sc2);
    p2.set(tw(c)+(Math.random()-0.5)*0.72,0.06,tz(r)+(Math.random()-0.5)*0.72);
    m.compose(p2,q2,s2); tuft.setMatrixAt(i,m);
    gcol.copy(gc1).lerp(gc2,Math.random()); tuft.setColorAt(i,gcol);
  }
  boardGroup.add(tuft);
  // rocks
  const rocks=[]; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(G.grid[idx(c,r)]===T_BLOCK) rocks.push([c,r]);
  const rockIM=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42,0), std(0x2a343e,{roughness:0.92,flatShading:true}), rocks.length);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), p=new THREE.Vector3();
  rocks.forEach(([c,r],i)=>{ e.set(Math.random()*3,Math.random()*3,Math.random()*3); q.setFromEuler(e);
    const sc=0.75+Math.random()*0.5; s.set(sc,sc*(0.7+Math.random()*0.4),sc); p.set(tw(c),0.18,tz(r));
    m4.compose(p,q,s); rockIM.setMatrixAt(i,m4); });
  rockIM.castShadow=true; rockIM.receiveShadow=true; boardGroup.add(rockIM);
  // forests
  for(const i in G.trees){ const c=i%COLS,r=(i/COLS)|0;
    const m=makeTree(); m.position.set(tw(c),0,tz(r));
    m.rotation.y=Math.random()*6; const s=0.4+0.15*G.trees[i].hp; m.scale.setScalar(s);
    G.trees[i].mesh=m; boardGroup.add(m); }
  // gold veins (+ mines if built)
  for(const i in G.veins){ const c=i%COLS,r=(i/COLS)|0;
    const m=makeVein(); m.position.set(tw(c),0,tz(r)); m.rotation.y=Math.random()*6;
    G.veins[i].mesh=m; boardGroup.add(m);
    if(G.veins[i].mine){ const mm=makeMine(); mm.position.set(tw(c),0,tz(r)); boardGroup.add(mm); } }
  // base keep
  baseGroup=new THREE.Group();
  const keep=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.5,0.62,8), std(0x9fb6a8,{roughness:0.7}));
  keep.position.y=0.31; keep.castShadow=true; baseGroup.add(keep);
  for(let k=0;k<8;k++){ const b=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.14,0.12), std(0xc3d4ca));
    const a=k/8*Math.PI*2; b.position.set(Math.cos(a)*0.4,0.68,Math.sin(a)*0.4); b.castShadow=true; baseGroup.add(b); }
  const ban=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.42,0.06), std(0x2f9e5a,{emissive:0x4ade80,emissiveIntensity:0.9}));
  ban.position.set(0,0.42,0.46); baseGroup.add(ban);
  const gl1=glowSprite(0x4ade80,2.2,0.5); gl1.position.y=0.8; baseGroup.add(gl1);
  const pl=new THREE.PointLight(0x4ade80,1.1,5); pl.position.y=1.1; baseGroup.add(pl);
  baseGroup.position.set(tw(G.base.c),0,tz(G.base.r));
  baseGroup.visible=!!G.basePlaced;
  boardGroup.add(baseGroup);
  // spawn rift
  const sg=new THREE.Group();
  spawnRing=new THREE.Mesh(new THREE.TorusGeometry(0.36,0.055,10,28), std(0xff5a52,{emissive:0xff4438,emissiveIntensity:1.6}));
  spawnRing.rotation.x=Math.PI/2; spawnRing.position.y=0.12; sg.add(spawnRing);
  const gl2=glowSprite(0xff5a52,2.4,0.55); gl2.position.y=0.4; sg.add(gl2);
  const pl2=new THREE.PointLight(0xff5a52,1.0,4.5); pl2.position.y=0.9; sg.add(pl2);
  sg.position.set(tw(G.spawn.c),0,tz(G.spawn.r)); boardGroup.add(sg);
  // range ring (hidden until a tower is inspected)
  rangeRing=new THREE.Mesh(new THREE.RingGeometry(0.94,1,48),
    new THREE.MeshBasicMaterial({color:0x4ade80,transparent:true,opacity:0.55,side:THREE.DoubleSide}));
  rangeRing.rotation.x=-Math.PI/2; rangeRing.position.y=0.02; rangeRing.visible=false; boardGroup.add(rangeRing);
  scene.add(boardGroup);
}

// ---------- resource / building models ----------
function makeTree(){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,0.32,7), std(0x5a3a1e,{roughness:0.9}));
  trunk.position.y=0.16; trunk.castShadow=true; g.add(trunk);
  const c1=std(0x1e4d2b,{roughness:0.85}), c2=std(0x2a6339,{roughness:0.85});
  const l1=new THREE.Mesh(new THREE.ConeGeometry(0.34,0.5,8),c1); l1.position.y=0.5; l1.castShadow=true; g.add(l1);
  const l2=new THREE.Mesh(new THREE.ConeGeometry(0.26,0.42,8),c2); l2.position.y=0.78; l2.castShadow=true; g.add(l2);
  const l3=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.32,8),c1); l3.position.y=1.02; l3.castShadow=true; g.add(l3);
  return g;
}
function makeVein(){
  const g=new THREE.Group();
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(0.34,0), std(0x4a4038,{roughness:0.9,flatShading:true}));
  rock.position.y=0.2; rock.scale.y=0.75; rock.castShadow=true; g.add(rock);
  const nug=std(0xffd25a,{emissive:0xdfa73a,emissiveIntensity:0.9,metalness:0.8,roughness:0.3});
  for(const [x,y,z] of [[0.12,0.34,0.08],[-0.14,0.28,-0.06],[0.02,0.42,-0.12],[-0.05,0.2,0.18]]){
    const n=new THREE.Mesh(new THREE.DodecahedronGeometry(0.07,0),nug); n.position.set(x,y,z); g.add(n); }
  return g;
}
function makeHut(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.4,0.56), std(0x6e4a26,{roughness:0.85}));
  body.position.y=0.2; body.castShadow=true; g.add(body);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(0.55,0.4,4), std(0x4a2f16,{roughness:0.9}));
  roof.position.y=0.6; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
  const win=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.02), std(0xffd25a,{emissive:0xffb03a,emissiveIntensity:1.4}));
  win.position.set(0.14,0.24,0.29); g.add(win);
  const logs=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.4,6), std(0x8a5a30));
  logs.rotation.z=Math.PI/2; logs.position.set(-0.42,0.08,0.1); g.add(logs);
  return g;
}
function makeMine(){
  const g=new THREE.Group();
  for(const s of [-1,1]){ const beam=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.5,0.08), std(0x6e4a26));
    beam.position.set(s*0.26,0.25,0.22); beam.castShadow=true; g.add(beam); }
  const top=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.09,0.12), std(0x5a3a1e));
  top.position.set(0,0.5,0.22); top.castShadow=true; g.add(top);
  const hole=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.3,0.05), std(0x0a0a0c));
  hole.position.set(0,0.15,0.24); g.add(hole);
  const gl=glowSprite(0xffd25a,0.9,0.4); gl.position.set(0,0.55,0.2); g.add(gl);
  return g;
}
function makePalisade(){
  const g=new THREE.Group();
  const wood=std(0x6e4a26,{roughness:0.9}), dark=std(0x4a2f16,{roughness:0.9});
  for(let k=0;k<4;k++){
    const x=-0.3+k*0.2, h=0.5+Math.random()*0.12;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,h,7),k%2?wood:dark);
    post.position.set(x,h/2,(Math.random()-0.5)*0.12); post.castShadow=true; g.add(post);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.075,0.14,7),dark);
    tip.position.set(x,h+0.07,post.position.z); tip.castShadow=true; g.add(tip);
  }
  const beam=new THREE.Mesh(new THREE.BoxGeometry(0.78,0.07,0.09),wood);
  beam.position.y=0.32; beam.rotation.z=0.03; beam.castShadow=true; g.add(beam);
  return g;
}
// lazy hp bars on structures (only appear once damaged)
function ensureStructBar(mesh,h){
  if(mesh.userData.hpfg)return;
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(0.72,0.075,1); bg.position.y=h;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x4ade80,depthWrite:false}));
  fg.scale.set(0.7,0.055,1); fg.position.y=h;
  mesh.add(bg); mesh.add(fg); mesh.userData.hpfg=fg;
}
function setStructBar(mesh,f){
  if(!mesh.userData.hpfg)return;
  mesh.userData.hpfg.scale.x=0.7*Math.max(0,f);
  mesh.userData.hpfg.material.color.setHex(f>0.5?0x4ade80:f>0.25?0xfbbf24:0xff5a52);
}
function makeWarrior(){ // viking defender: round helm, shield, sword
  const g=makeHumanoid(0.78,{torso:0x3a6a8a,skin:0xd8a077,leg:0x2a4a60,arm:0x3a6a8a});
  const P=g.userData.parts, s=0.78;
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.14*s,10,7,0,Math.PI*2,0,Math.PI/2),
    M2(0xa8b2bc,{metalness:0.8,roughness:0.35}));
  helm.position.y=0.02*s; P.head.add(helm);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.03*s,0.1*s,0.03*s),M2(0xa8b2bc,{metalness:0.8}));
  nose.position.set(0.12*s,-0.02*s,0); P.head.add(nose);
  addSword(P.rArm,s);
  const shield=new THREE.Mesh(new THREE.CylinderGeometry(0.17*s,0.17*s,0.035*s,12),M2(0x8a3a30));
  shield.rotation.z=Math.PI/2; shield.position.set(0.03*s,-P.lArm.userData.len*0.8,0);
  shield.castShadow=true; P.lArm.add(shield);
  const boss2=new THREE.Mesh(new THREE.SphereGeometry(0.045*s,8,6),M2(0xc9d2dc,{metalness:0.9}));
  boss2.position.set(0.06*s,-P.lArm.userData.len*0.8,0); P.lArm.add(boss2);
  // hp bar
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(0.6,0.07,1); bg.position.y=1.0;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x6ab0ff,depthWrite:false}));
  fg.scale.set(0.58,0.05,1); fg.position.y=1.0;
  g.add(bg); g.add(fg); g.userData.hpfg=fg;
  return g;
}
function makeBarracks(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.42,0.6),M2(0x5a4630,{roughness:0.85}));
  body.position.y=0.21; body.castShadow=true; g.add(body);
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.5,0.34,4),M2(0x3a2c1c,{roughness:0.9}));
  roof.rotation.y=Math.PI/4; roof.position.y=0.58; roof.scale.z=0.75; roof.castShadow=true; g.add(roof);
  const ban=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.22,0.02),M2(0x6ab0ff,{emissive:0x2a5a8a,emissiveIntensity:0.8}));
  ban.position.set(0.3,0.5,0.31); g.add(ban);
  const door=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.24,0.02),M2(0x2a1f12));
  door.position.set(0,0.12,0.31); g.add(door);
  return g;
}
function makeArcher(){ // ranged defender: hood, bow, quiver
  const g=makeHumanoid(0.74,{torso:0x4a6a3a,skin:0xd8a077,leg:0x33482a,arm:0x4a6a3a});
  const P=g.userData.parts, s=0.74;
  const hood=new THREE.Mesh(new THREE.ConeGeometry(0.13*s,0.2*s,8),M2(0x3a5230));
  hood.position.y=0.1*s; P.head.add(hood);
  // bow held by the left arm (arc + string)
  const bow=new THREE.Mesh(new THREE.TorusGeometry(0.22*s,0.018*s,6,14,2.4),M2(0x6e4a26));
  bow.rotation.z=2.0;
  bow.position.set(0.06*s,-P.lArm.userData.len*0.85,0); P.lArm.add(bow);
  const str=new THREE.Mesh(new THREE.BoxGeometry(0.006*s,0.4*s,0.006*s),M2(0xd9d2c0));
  str.position.set(0,-P.lArm.userData.len*0.85,0); P.lArm.add(str);
  // quiver on the back
  const qv=new THREE.Mesh(new THREE.CylinderGeometry(0.05*s,0.05*s,0.3*s,7),M2(0x5a3a1e));
  qv.position.set(-0.18*s,0.55*s,0.05*s); qv.rotation.x=0.3; g.add(qv);
  // hp bar
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(0.6,0.07,1); bg.position.y=0.95;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x9fe08a,depthWrite:false}));
  fg.scale.set(0.58,0.05,1); fg.position.y=0.95;
  g.add(bg); g.add(fg); g.userData.hpfg=fg;
  return g;
}
function makeArcheryRange(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.36,0.5),M2(0x4f5a38,{roughness:0.85}));
  body.position.y=0.18; body.castShadow=true; g.add(body);
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.46,0.3,4),M2(0x33402a,{roughness:0.9}));
  roof.rotation.y=Math.PI/4; roof.position.y=0.5; roof.scale.z=0.7; roof.castShadow=true; g.add(roof);
  // archery target beside the hut
  const tg=new THREE.Group();
  [[0.16,0xd9d2c0],[0.11,0xa03028],[0.06,0xd9d2c0],[0.025,0xa03028]].forEach(([rr,cc],i)=>{
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,0.03,14),M2(cc));
    ring.rotation.x=Math.PI/2; ring.position.z=i*0.006; tg.add(ring); });
  const leg1=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.34,5),M2(0x5a3a1e));
  leg1.position.set(0,-0.24,0); tg.add(leg1);
  tg.position.set(0.44,0.4,0.12); tg.rotation.y=-0.6; g.add(tg);
  return g;
}
function makeHuskarl(){ // heavy tank: horned helm, tower shield, spear
  const g=makeHumanoid(0.86,{torso:0x6a5230,skin:0xd8a077,leg:0x4a3a22,arm:0x6a5230});
  const P=g.userData.parts, s=0.86;
  // broad iron helm with horns
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.15*s,10,7,0,Math.PI*2,0,Math.PI/2),
    M2(0x8a929c,{metalness:0.8,roughness:0.4}));
  helm.position.y=0.02*s; P.head.add(helm);
  for(const sd of [-1,1]){
    const horn=new THREE.Mesh(new THREE.ConeGeometry(0.035*s,0.14*s,6),M2(0xe8dcc0));
    horn.position.set(0,0.06*s,sd*0.13*s); horn.rotation.x=sd*0.9; P.head.add(horn);
  }
  // big tower shield covering the left side
  const shield=new THREE.Mesh(new THREE.BoxGeometry(0.05*s,0.52*s,0.34*s),M2(0xb08a3a,{metalness:0.35,roughness:0.55}));
  shield.position.set(0.1*s,-P.lArm.userData.len*0.65,0); shield.castShadow=true; P.lArm.add(shield);
  const boss3=new THREE.Mesh(new THREE.SphereGeometry(0.05*s,8,6),M2(0xe8d9a8,{metalness:0.85}));
  boss3.position.set(0.14*s,-P.lArm.userData.len*0.65,0); P.lArm.add(boss3);
  // spear in the right hand
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.016*s,0.016*s,0.7*s,6),M2(0x6e4a26));
  shaft.position.set(0.02*s,-P.rArm.userData.len*0.9,0); P.rArm.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.035*s,0.12*s,6),M2(0xc9d2dc,{metalness:0.9}));
  tip.position.set(0.02*s,-P.rArm.userData.len*0.9+0.41*s,0); P.rArm.add(tip);
  // hp bar
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(0.6,0.07,1); bg.position.y=1.08;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0xd8b34a,depthWrite:false}));
  fg.scale.set(0.58,0.05,1); fg.position.y=1.08;
  g.add(bg); g.add(fg); g.userData.hpfg=fg;
  return g;
}
function makeShieldHall(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.82,0.44,0.6),M2(0x5c4a2c,{roughness:0.85}));
  body.position.y=0.22; body.castShadow=true; g.add(body);
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.52,0.36,4),M2(0x3c2f1c,{roughness:0.9}));
  roof.rotation.y=Math.PI/4; roof.position.y=0.62; roof.scale.z=0.75; roof.castShadow=true; g.add(roof);
  // round shields decorating the front wall
  for(let k=0;k<3;k++){
    const sh=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.03,10),
      M2(k===1?0xb08a3a:0x8a3a30,{roughness:0.5}));
    sh.rotation.x=Math.PI/2; sh.position.set(-0.24+k*0.24,0.28,0.315); g.add(sh);
    const bs=new THREE.Mesh(new THREE.SphereGeometry(0.025,8,6),M2(0xe8d9a8,{metalness:0.85}));
    bs.position.set(-0.24+k*0.24,0.28,0.335); g.add(bs);
  }
  const door=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.26,0.02),M2(0x2a1f12));
  door.position.set(0,0.13,0.31); g.add(door);
  return g;
}
function makeRallyFlag(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.6,6),M2(0x8a6a40));
  pole.position.y=0.3; g.add(pole);
  const flag=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.16,0.015),M2(0x6ab0ff,{emissive:0x3a7ab0,emissiveIntensity:1}));
  flag.position.set(0.14,0.5,0); g.add(flag);
  g.userData.flagMesh=flag;
  return g;
}
function makeDwarf(){
  const g=makeHumanoid(0.58,{torso:0x7a4a2a,skin:0xd8a077,leg:0x4a2f1a,arm:0x7a4a2a});
  const P=g.userData.parts, s=0.58;
  const beard=new THREE.Mesh(new THREE.SphereGeometry(0.07*s*1.6,8,6),M2(0xe8e0d0));
  beard.position.set(0.08*s,-0.06*s,0); beard.scale.set(1,1.3,0.9); P.head.add(beard);
  const hat=new THREE.Mesh(new THREE.ConeGeometry(0.14*s,0.24*s,8),M2(0xa03028));
  hat.position.y=0.13*s; hat.castShadow=true; P.head.add(hat);
  addAxe(P.rArm,s*0.9);
  // carried log rests on the shoulder when hauling
  const log=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.34,6),M2(0x8a5a30));
  log.rotation.x=Math.PI/2; log.position.set(0.02,0.62*s,0.06); log.visible=false; g.add(log);
  g.userData.log=log;
  return g;
}

// ---------- tower models ----------
function makeTower(key){
  const def=TOWERS[key], g=new THREE.Group(); let head=null;
  const iron=std(0x9aa6b2,{metalness:0.85,roughness:0.35});
  const wood=std(0x6e4a26,{roughness:0.85});
  const stone=std(0x8a9196,{roughness:0.8});
  const cast=m=>{m.castShadow=true;return m;};
  if(key==='einherjar'){
    const pl=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.47,0.3,10),wood)); pl.position.y=0.15; g.add(pl);
    head=new THREE.Group(); head.position.y=0.36;
    for(const s of [-1,1]){ const prong=cast(new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.07),wood));
      prong.position.set(0.16,0,s*0.2); prong.rotation.y=-s*0.5; head.add(prong); }
    const rail=cast(new THREE.Mesh(new THREE.BoxGeometry(0.72,0.07,0.1),iron)); rail.position.x=0.18; head.add(rail);
    const bolt=cast(new THREE.Mesh(new THREE.ConeGeometry(0.06,0.2,8),iron));
    bolt.rotation.z=-Math.PI/2; bolt.position.x=0.55; head.add(bolt);
    g.add(head);
  } else if(key==='runestein'){
    const slab=cast(new THREE.Mesh(new THREE.BoxGeometry(0.5,0.85,0.26),stone)); slab.position.y=0.43; g.add(slab);
    const top=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.26,12,1,false,0,Math.PI),stone));
    top.rotation.z=Math.PI/2; top.rotation.y=Math.PI/2; top.position.y=0.86; g.add(top);
    const rune=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.5,0.02), std(0x7db8ff,{emissive:0x7db8ff,emissiveIntensity:2.2}));
    rune.position.set(0,0.5,0.14); g.add(rune);
    const r2=rune.clone(); r2.scale.set(1,0.4,1); r2.rotation.z=0.9; r2.position.set(0.1,0.62,0.14); g.add(r2);
    const gl=glowSprite(0x7db8ff,1.5,0.55); gl.position.y=0.7; g.add(gl); g.userData.pulse=gl;
  } else if(key==='walkure'){
    const pl=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.45,0.26,10),stone)); pl.position.y=0.13; g.add(pl);
    const gold=std(0xdfa73a,{metalness:0.9,roughness:0.3,emissive:0x704f10,emissiveIntensity:0.25});
    const shaft=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.95,8),gold)); shaft.position.y=0.72; g.add(shaft);
    const tip=cast(new THREE.Mesh(new THREE.ConeGeometry(0.09,0.26,8),gold)); tip.position.y=1.3; g.add(tip);
    for(const s of [-1,1]){ const wing=cast(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.16,0.03),gold));
      wing.position.set(s*0.2,1.06,0); wing.rotation.z=s*0.55; g.add(wing); g.userData['wing'+(s>0?'R':'L')]=wing; }
    const gl=glowSprite(0xffe27a,1.4,0.5); gl.position.y=1.3; g.add(gl); g.userData.pulse=gl;
  } else if(key==='mjolnir'){
    const pl=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.47,0.3,10),stone)); pl.position.y=0.15; g.add(pl);
    head=new THREE.Group(); head.position.y=0.52;
    const handle=cast(new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.5,8),wood));
    handle.rotation.z=Math.PI/2; handle.position.x=0.05; head.add(handle);
    const hh=cast(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.26,0.44),iron)); hh.position.x=0.36; head.add(hh);
    const rim=new THREE.Mesh(new THREE.BoxGeometry(0.31,0.05,0.45), std(0xff9d5a,{emissive:0xff9d5a,emissiveIntensity:1.1}));
    rim.position.set(0.36,0,0); head.add(rim);
    g.add(head);
  } else if(key==='bifrost'){
    for(const s of [-1,1]){ const p=cast(new THREE.Mesh(new THREE.BoxGeometry(0.13,0.9,0.13),stone));
      p.position.set(s*0.36,0.45,0); g.add(p); }
    const cols=[0xff574c,0x4ade80,0x5aa9ff];
    cols.forEach((c,i)=>{ const t=new THREE.Mesh(new THREE.TorusGeometry(0.36-i*0.06,0.026,8,24,Math.PI),
      std(c,{emissive:c,emissiveIntensity:1.3}));
      t.position.y=0.9; g.add(t); });
    const gl=glowSprite(0xc88fff,1.7,0.5); gl.position.y=1.05; g.add(gl); g.userData.pulse=gl;
  }
  g.userData.head=head;
  return g;
}

// ---------- character rigs (articulated: arms, legs, weapons) ----------
function M2(c,o){ return new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.8},o||{})); }
function limbMesh(len,w,mat){ // pivot at top (shoulder/hip)
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,len,w),mat);
  m.position.y=-len/2; m.castShadow=true; g.add(m);
  g.userData.len=len;
  return g;
}
// facing +X; limbs offset sideways along Z, swing around Z-axis
function makeHumanoid(s,cols,opt){
  opt=opt||{};
  const wm=opt.wm||1, armLen=(opt.armLen||0.32)*s, legLen=0.36*s;
  const g=new THREE.Group(); const P={};
  P.torso=new THREE.Mesh(new THREE.BoxGeometry(0.3*s,0.38*s,0.34*s*wm),M2(cols.torso));
  P.torso.position.y=legLen+0.19*s; P.torso.castShadow=true; g.add(P.torso);
  P.head=new THREE.Mesh(new THREE.SphereGeometry(0.13*s,10,8),M2(cols.skin));
  P.head.position.y=legLen+0.38*s+0.11*s; P.head.castShadow=true; g.add(P.head);
  const legMat=M2(cols.leg), armMat=M2(cols.arm||cols.skin);
  P.lLeg=limbMesh(legLen,0.1*s,legMat); P.lLeg.position.set(0,legLen,0.1*s*wm); g.add(P.lLeg);
  P.rLeg=limbMesh(legLen,0.1*s,legMat); P.rLeg.position.set(0,legLen,-0.1*s*wm); g.add(P.rLeg);
  P.lArm=limbMesh(armLen,0.08*s,armMat); P.lArm.position.set(0,legLen+0.34*s,0.2*s*wm); g.add(P.lArm);
  P.rArm=limbMesh(armLen,0.08*s,armMat); P.rArm.position.set(0,legLen+0.34*s,-0.2*s*wm); g.add(P.rArm);
  g.userData.parts=P; g.userData.kind='humanoid'; g.userData.body=P.torso;
  return g;
}
function addAxe(arm,s,bladeCol){ // weapon held at the hand (bottom of arm)
  const hy=-arm.userData.len;
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.025*s,0.025*s,0.42*s,6),M2(0x5a3a1e));
  handle.position.set(0.12*s,hy,0); handle.rotation.z=Math.PI/2; arm.add(handle);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.16*s,0.14*s,0.04*s),M2(bladeCol||0xb9c2cc,{metalness:0.85,roughness:0.3}));
  blade.position.set(0.3*s,hy+0.04*s,0); blade.castShadow=true; arm.add(blade);
}
function addSword(arm,s){
  const hy=-arm.userData.len;
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.4*s,0.05*s,0.02*s),M2(0xc9d2dc,{metalness:0.9,roughness:0.25}));
  blade.position.set(0.24*s,hy,0); blade.castShadow=true; arm.add(blade);
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.02*s,0.12*s,0.06*s),M2(0x8a6216));
  guard.position.set(0.06*s,hy,0); arm.add(guard);
}
function makeQuadruped(s,cols){ // wolf: 4 legs, tail, head facing +X
  const g=new THREE.Group(); const P={};
  P.torso=new THREE.Mesh(new THREE.BoxGeometry(0.62*s,0.26*s,0.26*s),M2(cols.torso));
  P.torso.position.y=0.34*s; P.torso.castShadow=true; g.add(P.torso);
  P.head=new THREE.Mesh(new THREE.SphereGeometry(0.14*s,10,8),M2(cols.head));
  P.head.position.set(0.36*s,0.42*s,0); P.head.castShadow=true; g.add(P.head);
  const snout=new THREE.Mesh(new THREE.ConeGeometry(0.07*s,0.16*s,7),M2(cols.snout));
  snout.rotation.z=-Math.PI/2; snout.position.set(0.5*s,0.39*s,0); g.add(snout);
  for(const z of [-1,1]){ const ear=new THREE.Mesh(new THREE.ConeGeometry(0.045*s,0.12*s,5),M2(cols.snout));
    ear.position.set(0.32*s,0.55*s,z*0.07*s); g.add(ear);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.03*s,6,6),M2(0xd8a0ff,{emissive:0xd8a0ff,emissiveIntensity:2.2}));
    eye.position.set(0.45*s,0.45*s,z*0.06*s); g.add(eye); }
  const legMat=M2(cols.leg);
  P.fl=limbMesh(0.24*s,0.07*s,legMat); P.fl.position.set(0.22*s,0.24*s,0.1*s); g.add(P.fl);
  P.fr=limbMesh(0.24*s,0.07*s,legMat); P.fr.position.set(0.22*s,0.24*s,-0.1*s); g.add(P.fr);
  P.bl=limbMesh(0.24*s,0.07*s,legMat); P.bl.position.set(-0.22*s,0.24*s,0.1*s); g.add(P.bl);
  P.br=limbMesh(0.24*s,0.07*s,legMat); P.br.position.set(-0.22*s,0.24*s,-0.1*s); g.add(P.br);
  P.tail=limbMesh(0.22*s,0.05*s,M2(cols.leg)); P.tail.position.set(-0.32*s,0.42*s,0); P.tail.rotation.z=1.0; g.add(P.tail);
  g.userData.parts=P; g.userData.kind='quad'; g.userData.body=P.torso;
  return g;
}

// ---------- enemy models ----------
function makeEnemy(key){
  const r=ENEMIES[key].r;
  let g, barY;
  if(key==='draugr'){ // undead warrior: horned helm, sword, glowing eyes
    g=makeHumanoid(1.05,{torso:0x5a6e60,skin:0x8fa695,leg:0x3a4a40,arm:0x8fa695});
    const P=g.userData.parts, s=1.05;
    const helm=new THREE.Mesh(new THREE.SphereGeometry(0.14*s,10,7,0,Math.PI*2,0,Math.PI/2),
      M2(0x8a95a1,{metalness:0.8,roughness:0.35}));
    helm.position.y=0.02*s; P.head.add(helm);
    for(const z of [-1,1]){ const horn=new THREE.Mesh(new THREE.ConeGeometry(0.035*s,0.16*s,6),M2(0xefe7d2));
      horn.position.set(0,0.08*s,z*0.13*s); horn.rotation.x=z*0.9; P.head.add(horn);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.03*s,6,6),M2(0x8affc8,{emissive:0x8affc8,emissiveIntensity:2.2}));
      eye.position.set(0.11*s,0,z*0.05*s); P.head.add(eye); }
    addSword(P.rArm,s);
    barY=1.15;
  } else if(key==='berserker'){ // wild rager: fur shoulders, battle axe
    g=makeHumanoid(0.95,{torso:0x8a5a34,skin:0xc9825f,leg:0x5a3a22,arm:0xc9825f});
    const P=g.userData.parts, s=0.95;
    for(const z of [-1,1]){ const fur=new THREE.Mesh(new THREE.SphereGeometry(0.09*s,7,6),M2(0x6a4428));
      fur.position.set(0,0.7*s,z*0.2*s); g.add(fur); }
    for(const z of [-1,1]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(0.026*s,6,6),M2(0xffdf7a,{emissive:0xffdf7a,emissiveIntensity:2.2}));
      eye.position.set(0.11*s,0.01,z*0.05*s); P.head.add(eye); }
    addAxe(P.rArm,s);
    barY=1.05;
  } else if(key==='troll'){ // hulking brute: wide torso, long arms, tusks
    g=makeHumanoid(1.75,{torso:0x6f905e,skin:0x7fa06a,leg:0x53704a,arm:0x7fa06a},{wm:1.35,armLen:0.44});
    const P=g.userData.parts, s=1.75;
    const brow=new THREE.Mesh(new THREE.BoxGeometry(0.1*s,0.05*s,0.24*s),M2(0x53704a));
    brow.position.set(0.09*s,0.06*s,0); P.head.add(brow);
    for(const z of [-1,1]){ const tusk=new THREE.Mesh(new THREE.ConeGeometry(0.025*s,0.1*s,6),M2(0xeef0dc));
      tusk.position.set(0.1*s,-0.07*s,z*0.05*s); P.head.add(tusk);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.024*s,6,6),M2(0xdfffb0,{emissive:0xdfffb0,emissiveIntensity:1.8}));
      eye.position.set(0.11*s,0.01,z*0.05*s); P.head.add(eye); }
    for(const a of [P.lArm,P.rArm]){ const fist=new THREE.Mesh(new THREE.SphereGeometry(0.07*s,7,6),M2(0x7fa06a));
      fist.position.y=-a.userData.len; fist.castShadow=true; a.add(fist); }
    barY=1.95;
  } else if(key==='helhound'){ // Fenrir wolf: quadruped
    g=makeQuadruped(1.15,{torso:0x9a7fb8,head:0x8a6fa8,snout:0x6a5288,leg:0x7a5f98});
    barY=0.95;
  } else { // jormun — serpent head; body segments trail behind (built in spawnEnemy)
    g=new THREE.Group(); const s=1;
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.5,16,12),M2(0x49b8a8));
    head.scale.set(1.15,0.95,1); head.position.y=0.45; head.castShadow=true; g.add(head);
    for(const z of [-1,1]){
      const fin=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.5,6),M2(0x2f8a7c));
      fin.position.set(-0.1,0.85,z*0.32); fin.rotation.x=z*0.7; g.add(fin);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),M2(0xfffbdc,{emissive:0xfffbdc,emissiveIntensity:2}));
      eye.position.set(0.38,0.58,z*0.2); g.add(eye);
      const fang=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.2,6),M2(0xffffff));
      fang.position.set(0.42,0.2,z*0.12); fang.rotation.x=Math.PI; g.add(fang);
    }
    const gl=glowSprite(0x5ad0c0,2.6,0.4); gl.position.y=0.5; g.add(gl);
    g.userData.kind='serpent'; g.userData.body=head; g.userData.parts=null;
    barY=1.35;
  }
  // hp bar sprites
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(r*2.2,0.09,1); bg.position.y=barY;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x4ade80,depthWrite:false}));
  fg.scale.set(r*2.16,0.07,1); fg.position.y=barY;
  g.add(bg); g.add(fg); g.userData.hpbg=bg; g.userData.hpfg=fg;
  return g;
}

// ============================================================
//  GAME FLOW (mirrors 2D rules)
// ============================================================
function waveComposition(n){
  const q=[],push=(k,c)=>{for(let i=0;i<c;i++)q.push(k);};
  if(n%5===0){ push('draugr',6+n); push('troll',Math.floor(n/5)); q.push('jormun'); return q; }
  push('draugr',5+n*2);
  if(n>=2)push('berserker',2+n);
  if(n>=3)push('helhound',2+Math.floor(n*1.3));
  if(n>=4)push('troll',Math.floor(n/2));
  for(let i=q.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[q[i],q[j]]=[q[j],q[i]];}
  return q;
}
function hpScale(n){return 1+(n-1)*0.22+Math.pow(n,1.35)*0.02;}
function effDmg(t){return t.dmg*G.mods.dmg*G.weather.dmg*G.fx.dmgMul;}
function effRate(t){return t.rate*G.mods.rate*G.weather.rate*G.fx.rateMul;}
function effRange(t){return t.range*G.mods.range;}
function goldMul(){return G.mods.gold*G.diff.gold;}
function towerCost(k){ const d=TOWERS[k]; return d?Math.round(d.cost*G.mods.discount):BUILDINGS[k].cost; }
function woodCost(k){ return (TOWERS[k]||BUILDINGS[k]).wood||0; }
function canAfford(k){ return G.gold>=towerCost(k)&&G.wood>=woodCost(k); }
function startWave(early){
  if(G.waveActive||G.over)return;
  if(!G.basePlaced){ banner('Platziere zuerst dein Langhaus'); return; }
  if(early&&G.buildTimer>3){ const bn=15+G.wave*2; G.gold+=bn; banner('Früh gestartet · +'+bn+' Gold'); }
  G.buildTimer=0;
  G.wave++; G.spawnQueue=waveComposition(G.wave); G.spawnTimer=0; G.waveActive=true;
  G.weatherKey=rollWeather(); G.weather=WEATHERS[G.weatherKey]; updateWeatherChip();
  G.eventTimer=0; G.nextEventAt=11+Math.random()*6;
  const wtxt=G.weatherKey!=='clear'?' · '+G.weather.name:'';
  banner('Welle '+G.wave+' — '+(G.wave%5===0?'BOSS':G.spawnQueue.length+' Feinde')+wtxt);
  sfx('wave'); vib(20);
  refreshRow(); updateHUD();
}
function spawnEnemy(key){
  const d=ENEMIES[key],hp=Math.round(d.hp*hpScale(G.wave)*G.diff.hp*G.weather.ehp);
  const mesh=makeEnemy(key); scene.add(mesh);
  const e={key,def:d,x:tw(G.spawn.c),z:tz(G.spawn.r)+(Math.random()*0.5-0.25),r:d.r,hp,maxhp:hp,
    speed:d.speed*(0.92+Math.random()*0.16),slow:0,slowT:0,dead:false,boss:!!d.boss,mesh,anim:Math.random()*6,dying:0};
  mesh.position.set(e.x,0.02,e.z);
  if(key==='jormun'){ // trailing body segments
    e.hist=[]; e.segs=[];
    for(let k=0;k<7;k++){
      const sr=0.4-k*0.038;
      const seg=new THREE.Mesh(new THREE.SphereGeometry(sr,12,9),M2(k%2?0x3fa898:0x49b8a8));
      seg.position.set(e.x,sr*0.9,e.z); seg.castShadow=true; scene.add(seg); e.segs.push(seg);
    }
    const tail=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.5,7),M2(0x2f8a7c));
    tail.rotation.z=Math.PI/2; tail.position.set(e.x,0.15,e.z); scene.add(tail); e.segs.push(tail);
  }
  if(e.boss){ e.spawnT=0; mesh.scale.setScalar(0.15);
    banner('Jörmungandr erhebt sich!'); addShake(0.5); sfx('boss');
    burst(e.x,0.6,e.z,0x5ad0c0,30,4); }
  G.enemies.push(e);
}
function removeEnemyMesh(e){
  scene.remove(e.mesh);
  if(e.segs) for(const s of e.segs) scene.remove(s);
}
// articulated walk / attack cycles per rig kind
function animateRig(e,mode){
  const ud=e.mesh.userData, P=ud.parts, a=e.anim;
  if(ud.kind==='serpent'){
    // slither: head sways; segments follow the position history
    e.mesh.rotation.z=Math.sin(a*1.6)*0.08;
    if(e.hist&&e.segs){
      const L=e.hist.length;
      for(let k=0;k<e.segs.length;k++){
        const hi=L-1-(k+1)*6;
        const p=e.hist[Math.max(0,hi)]; if(!p)continue;
        const seg=e.segs[k];
        seg.position.x=p[0]; seg.position.z=p[1];
        if(seg.geometry.type==='ConeGeometry'){ // tail piece
          const prev=e.hist[Math.max(0,hi+4)]||p;
          seg.rotation.y=-Math.atan2(p[1]-prev[1],p[0]-prev[0])+Math.PI/2;
          seg.position.y=0.15;
        } else seg.position.y=(seg.geometry.parameters.radius||0.3)*0.9+Math.sin(a*1.6+k)*0.05;
      }
    }
    return;
  }
  if(!P)return;
  const sw=Math.sin(a)*0.6;
  if(ud.kind==='quad'){
    P.fl.rotation.z=sw; P.br.rotation.z=sw;
    P.fr.rotation.z=-sw; P.bl.rotation.z=-sw;
    P.tail.rotation.x=Math.sin(a*2)*0.3;
    if(mode==='attack'){ P.fl.rotation.z=-0.9+sw*0.4; P.fr.rotation.z=-0.9-sw*0.4; }
  } else { // humanoid
    if(mode==='attack'){
      P.lLeg.rotation.z=0.12; P.rLeg.rotation.z=-0.12;
      P.lArm.rotation.z=0.3;
      P.rArm.rotation.z=-0.5-Math.abs(Math.sin(a*2.4))*1.5;  // chop!
    } else if(mode==='walk'){
      P.lLeg.rotation.z=sw; P.rLeg.rotation.z=-sw;
      P.lArm.rotation.z=-sw*0.65; P.rArm.rotation.z=sw*0.65;
    } else { // idle
      P.lLeg.rotation.z=0; P.rLeg.rotation.z=0;
      P.lArm.rotation.z=Math.sin(a*0.5)*0.06; P.rArm.rotation.z=-Math.sin(a*0.5)*0.06;
    }
  }
}
function updateEnemies(dt){
  for(const e of G.enemies){
    if(e.dead){ e.dying+=dt;
      const f=clamp(1-e.dying/0.5,0,1);
      // tip over backwards, sink and fade
      e.mesh.rotation.z=-(1-f)*1.5;
      e.mesh.position.y=0.02-(1-f)*0.25;
      e.mesh.scale.setScalar(Math.max(0.001,0.4+0.6*f));
      if(e.segs) for(const s of e.segs){ s.scale.setScalar(Math.max(0.001,f)); s.position.y*=0.95; }
      continue; }
    if(e.slowT>0){e.slowT-=dt; if(e.slowT<=0)e.slow=0;}
    const spd=e.speed*(1-e.slow)*G.weather.espd*G.fx.espdMul;
    e.anim+=dt*spd*3.4;
    const c=clamp(Math.floor(e.x+COLS/2),0,COLS-1), r=clamp(Math.floor(e.z+ROWS/2),0,ROWS-1);
    if(c===G.base.c&&r===G.base.r){ e.dead=true; removeEnemyMesh(e); baseHit(e); continue; }
    // serpent position history for trailing segments
    if(e.hist){ e.hist.push([e.x,e.z]); if(e.hist.length>70)e.hist.shift(); }
    // melee: a defender blocks the way — fight them
    let foe=null;
    for(const tr of G.troops){ if(tr.dead)continue;
      const dd=(tr.x-e.x)*(tr.x-e.x)+(tr.z-e.z)*(tr.z-e.z);
      if(dd<(0.55+e.r*0.3)*(0.55+e.r*0.3)){ foe=tr; break; } }
    if(foe){
      e.mesh.rotation.y=-Math.atan2(foe.z-e.z,foe.x-e.x);
      e.mesh.position.set(e.x,0.02,e.z);
      animateRig(e,'attack');
      e.atkT=(e.atkT==null?0.5:e.atkT)-dt;
      if(e.atkT<=0){ e.atkT=0.9;
        foe.hp-=e.def.atk*0.6;
        foe.flashT=0.1; foe.mesh.userData.body.material.emissive.setHex(0xffffff);
        foe.mesh.userData.body.material.emissiveIntensity=0.5;
        burst(foe.x,0.5,foe.z,0xff8a70,3,1.6); sfx('thud');
        if(foe.hp<=0&&!foe.dead){ foe.dead=true; foe.dying=0;
          banner(foe.kind==='archer'?'Ein Bogenschütze ist gefallen':foe.kind==='huskarl'?'Ein Huskarl ist gefallen':'Ein Krieger ist gefallen'); }
      }
      const f3=clamp(e.hp/e.maxhp,0,1);
      e.mesh.userData.hpfg.scale.x=e.r*2.16*f3;
      if(e.flashT>0){ e.flashT-=dt; if(e.flashT<=0) e.mesh.userData.body.material.emissive.setHex(0x000000); }
      continue;
    }
    const i=idx(c,r); const dcx=G.flow[i*2],dcz=G.flow[i*2+1];
    // siege: if the chosen path leads through a structure, attack it
    if(dcx!==0||dcz!==0){
      const nc=c+dcx,nr=r+dcz,ni=idx(nc,nr),nt=G.grid[ni];
      if(nt===T_WALL||nt===T_TOWER||nt===T_BUILDING){
        const sx=tw(nc),sz=tz(nr);
        const ddx=sx-e.x,ddz=sz-e.z,dd=Math.hypot(ddx,ddz);
        if(dd>0.72+e.r*0.3){ // approach the structure
          e.x+=ddx/dd*spd*dt; e.z+=ddz/dd*spd*dt;
          const bob=Math.abs(Math.sin(e.anim))*0.045;
          e.mesh.position.set(e.x,0.02+bob,e.z);
          e.mesh.rotation.y=-Math.atan2(ddz,ddx);
          animateRig(e,'walk');
        } else { // hack at it
          e.atkT=(e.atkT==null?0.4:e.atkT)-dt;
          const lunge=Math.max(0,Math.sin((0.9-Math.max(0,e.atkT))/0.9*Math.PI))*0.16;
          e.mesh.position.set(e.x+ddx/dd*lunge, 0.02, e.z+ddz/dd*lunge);
          e.mesh.rotation.y=-Math.atan2(ddz,ddx);
          animateRig(e,'attack');
          if(e.atkT<=0){ e.atkT=0.9;
            damageStructure(ni, e.def.atk);
            burst(sx,0.45,sz,0xffc06a,4,1.6);
          }
        }
        // hp bar sync + flash decay still needed
        const f2=clamp(e.hp/e.maxhp,0,1);
        e.mesh.userData.hpfg.scale.x=e.r*2.16*f2;
        if(e.flashT>0){ e.flashT-=dt; if(e.flashT<=0) e.mesh.userData.body.material.emissive.setHex(0x000000); }
        continue;
      }
    }
    let fx=dcx,fz=dcz;
    if(fx===0&&fz===0){ fx=tw(G.base.c)-e.x; fz=tz(G.base.r)-e.z; }
    else { const cxw=tw(c)+fx*0.55, czw=tz(r)+fz*0.55; fx=cxw-e.x; fz=czw-e.z; }
    const l=Math.hypot(fx,fz)||1; const vx=fx/l*spd, vz=fz/l*spd;
    e.x+=vx*dt; e.z+=vz*dt;
    // mesh anim: bob + lean + face movement (+ boss scale-in entrance)
    if(e.spawnT!==undefined&&e.spawnT<0.6){ e.spawnT+=dt;
      const f=Math.min(1,e.spawnT/0.6);
      e.mesh.scale.setScalar(0.15+0.85*(1-Math.pow(1-f,3))); }
    const bob=Math.abs(Math.sin(e.anim))*0.045;
    e.mesh.position.set(e.x, 0.02+bob, e.z);
    e.mesh.rotation.y=-Math.atan2(vz,vx);
    animateRig(e,'walk');
    // hp bar
    const f=clamp(e.hp/e.maxhp,0,1);
    e.mesh.userData.hpfg.scale.x=e.r*2.16*f;
    e.mesh.userData.hpfg.material.color.setHex(f>0.5?0x4ade80:f>0.25?0xfbbf24:0xff5a52);
    // hit flash decay
    if(e.flashT>0){ e.flashT-=dt; if(e.flashT<=0) e.mesh.userData.body.material.emissive.setHex(0x000000); }
  }
  G.enemies=G.enemies.filter(e=>{ if(e.dead&&e.dying>=0.5){ removeEnemyMesh(e); return false; } return true; });
  if(G.waveActive&&G.spawnQueue.length===0&&!G.enemies.some(e=>!e.dead)) endWave();
}
function baseHit(e){
  G.lives-=e.boss?5:1; updateHUD();
  banner('Das Langhaus wurde getroffen!');
  burst(tw(G.base.c),0.6,tz(G.base.r),0xff5a52,20,4); addShake(e.boss?0.6:0.35);
  vib(30); sfx('basehit');
  if(G.lives<=0){G.lives=0; gameOver();}
}
function endWave(){
  G.waveActive=false;
  G.buildTimer=40;
  let bonus=30+G.wave*8;
  if(G.mods.interest>0) bonus+=Math.round(G.gold*G.mods.interest);
  G.gold+=bonus;
  if(G.mods.baseHeal) G.lives=Math.min(30,G.lives+G.mods.baseHeal);
  refreshRow(); updateHUD();
  saveRun();
  offerRunes(bonus);
}

// ---------- towers ----------
function tryBuild(c,r){
  const i=idx(c,r);
  if(!G.basePlaced){ banner('Platziere zuerst dein Langhaus'); return; }
  closeSheet();
  const cost=towerCost(G.selected), wcost=woodCost(G.selected);
  // --- palisade wall: may fully seal — enemies will besiege it ---
  if(G.selected==='palisade'){
    if(G.grid[i]!==T_GROUND){ banner('Hier kann nicht gebaut werden'); return; }
    if(G.wood<wcost){ banner('Nicht genug Holz'); return; }
    G.wood-=wcost;
    G.grid[i]=T_WALL; computeFlow();
    const mesh=makePalisade(); mesh.position.set(tw(c),0,tz(r));
    mesh.rotation.y=(Math.random()<0.5?0:Math.PI/2)+(Math.random()-0.5)*0.1;
    scene.add(mesh);
    const whp=BUILDINGS.palisade.hp+G.mods.wallHp;
    G.walls[i]={hp:whp,maxhp:whp,mesh};
    burst(tw(c),0.4,tz(r),0x8a6a40,8,2);
    vib(12); sfx('place'); updateHUD(); return;
  }
  // --- goldmine: only on a vein ---
  if(G.selected==='goldmine'){
    if(G.grid[i]!==T_VEIN||!G.veins[i]||G.veins[i].mine){ banner('Nur auf einer freien Goldader baubar'); return; }
    if(G.wood<wcost){ banner('Nicht genug Holz'); return; }
    G.wood-=wcost;
    G.veins[i].mine={timer:0};
    G.mines.push({i,x:tw(c),z:tz(r),timer:0});
    const mm=makeMine(); mm.position.set(tw(c),0,tz(r)); boardGroup.add(mm);
    burst(tw(c),0.5,tz(r),0xfbbf24,12,2.5);
    banner('Goldmine errichtet'); vib(15); sfx('place'); updateHUD(); return;
  }
  // --- lumber hut ---
  if(G.selected==='barracks'||G.selected==='archery'||G.selected==='shieldhall'){
    const bdef=BUILDINGS[G.selected];
    if(G.grid[i]!==T_GROUND){ banner('Hier kann nicht gebaut werden'); return; }
    if(G.wave<bdef.unlock){ banner(bdef.name+' ab Welle '+bdef.unlock); return; }
    if(G.gold<cost){ banner('Nicht genug Gold'); return; }
    if(G.wood<wcost){ banner('Nicht genug Holz'); return; }
    G.grid[i]=T_BUILDING; computeFlow();
    G.gold-=cost; G.wood-=wcost;
    const m=G.selected==='archery'?makeArcheryRange():G.selected==='shieldhall'?makeShieldHall():makeBarracks();
    m.position.set(tw(c),0,tz(r)); scene.add(m);
    const b={i,x:tw(c),z:tz(r),hp:bdef.hp,maxhp:bdef.hp,mesh:m,
      type:G.selected,rally:{x:tw(c),z:tz(r)+1.2},respawnT:0,flag:null};
    G.buildings.push(b);
    b.flag=makeRallyFlag(); b.flag.position.set(b.rally.x,0,b.rally.z); scene.add(b.flag);
    spawnTroops(b);
    burst(b.x,0.4,b.z,bdef.color,12,2.5);
    banner(bdef.name+' errichtet! (Antippen = Sammelpunkt)');
    vib(15); sfx('place'); updateHUD(); return;
  }
  if(G.selected==='lumber'){
    if(G.grid[i]!==T_GROUND){ banner('Hier kann nicht gebaut werden'); return; }
    if(G.gold<cost){ banner('Nicht genug Gold'); return; }
    G.grid[i]=T_BUILDING; computeFlow();
    G.gold-=cost;
    const m=makeHut(); m.position.set(tw(c),0,tz(r)); scene.add(m);
    const b={i,x:tw(c),z:tz(r),hp:BUILDINGS.lumber.hp,maxhp:BUILDINGS.lumber.hp,mesh:m,type:'lumber'};
    G.buildings.push(b);
    spawnWorkers(b);
    burst(b.x,0.4,b.z,0xc8934a,12,2.5);
    banner('Holzfäller-Hütte errichtet — Zwerge an die Arbeit!'); vib(15); sfx('place'); updateHUD(); return;
  }
  // --- towers ---
  if(G.grid[i]!==T_GROUND){ banner('Hier kann nicht gebaut werden'); return; }
  const def=TOWERS[G.selected];
  if(G.wave<def.unlock){ banner(def.name+' ab Welle '+def.unlock); return; }
  if(G.gold<cost){ banner('Nicht genug Gold'); return; }
  if(G.wood<wcost){ banner('Nicht genug Holz'); return; }
  G.grid[i]=T_TOWER; computeFlow();
  G.gold-=cost; G.wood-=wcost;
  const mesh=makeTower(G.selected); mesh.position.set(tw(c),0,tz(r)); scene.add(mesh);
  G.tower[i]={key:G.selected,c,r,x:tw(c),z:tz(r),def,level:1,dmg:def.dmg,range:def.range,rate:def.rate,
    cd:0,invested:cost,mesh,angle:0,recoil:0,hp:TOWER_HP,maxhp:TOWER_HP};
  burst(tw(c),0.4,tz(r),def.color,10,2.5);
  vib(15); sfx('place');
  updateHUD();
}
// ---------- dwarf workers (GDD Module 09 — autobuilder) ----------
function spawnWorkers(b){
  const def=BUILDINGS.lumber;
  for(let k=0;k<def.workers;k++){
    const mesh=makeDwarf(); scene.add(mesh);
    mesh.position.set(b.x+(k?0.25:-0.25),0,b.z+0.35);
    G.workers.push({mesh,home:b,state:'idle',tree:-1,timer:Math.random()*0.8,anim:Math.random()*6,carry:false});
  }
}
function nearestTree(w){
  const R=BUILDINGS.lumber.radius; let best=-1,bd=R*R;
  for(const i in G.trees){ const t=G.trees[i]; if(!t||t.hp<=0)continue;
    const c=i%COLS,r=(i/COLS)|0, dx=tw(c)-w.home.x, dz=tz(r)-w.home.z;
    const d=dx*dx+dz*dz;
    if(d<bd){bd=d;best=+i;} }
  return best;
}
function depleteTree(i){
  const t=G.trees[i]; if(!t)return;
  if(t.mesh) boardGroup.remove(t.mesh);
  delete G.trees[i];
  G.grid[i]=T_GROUND;
  computeFlow();   // clearing forest opens new paths
}
function updateWorkers(dt){
  for(const w of G.workers){
    w.anim+=dt*6;
    const m=w.mesh, WP=m.userData.parts;
    const legs=(amp)=>{ if(!WP)return; const sw=Math.sin(w.anim*1.4)*amp;
      WP.lLeg.rotation.z=sw; WP.rLeg.rotation.z=-sw;
      WP.lArm.rotation.z=-sw*0.6; if(w.state!=='chop')WP.rArm.rotation.z=sw*0.6; };
    const moveTo=(x,z,arrive)=>{
      const dx=x-m.position.x, dz=z-m.position.z, d=Math.hypot(dx,dz);
      if(d<0.22){ arrive(); return; }
      const s=1.55*G.mods.wSpeed*dt;
      m.position.x+=dx/d*s; m.position.z+=dz/d*s;
      m.rotation.y=-Math.atan2(dz,dx);
      m.position.y=Math.abs(Math.sin(w.anim*1.4))*0.03;
      legs(0.65);
    };
    switch(w.state){
      case 'idle':
        w.timer-=dt;
        m.position.y=0;
        if(WP){ WP.lLeg.rotation.z=0; WP.rLeg.rotation.z=0;
          WP.lArm.rotation.z=Math.sin(w.anim*0.4)*0.08; WP.rArm.rotation.z=-Math.sin(w.anim*0.4)*0.08; }
        if(w.timer<=0){ w.timer=0.8;
          const t=nearestTree(w);
          if(t>=0){ w.tree=t; w.state='go'; } }
        break;
      case 'go': {
        const tr=G.trees[w.tree];
        if(!tr){ w.state='idle'; break; }
        const c=w.tree%COLS, r=(w.tree/COLS)|0;
        moveTo(tw(c),tz(r),()=>{ w.state='chop'; w.timer=1.5; });
        break;
      }
      case 'chop': {
        const tr=G.trees[w.tree];
        if(!tr){ w.state='idle'; break; }
        w.timer-=dt;
        if(WP) WP.rArm.rotation.z=-0.4-Math.abs(Math.sin(w.anim*2.2))*1.5;  // axe swing
        if(w.timer<=0){
          if(WP) WP.rArm.rotation.z=0;
          tr.hp--;
          const c=w.tree%COLS, r=(w.tree/COLS)|0;
          burst(tw(c),0.4,tz(r),0xc8934a,6,1.8);
          if(tr.mesh) tr.mesh.scale.setScalar(0.4+0.15*Math.max(0,tr.hp));
          if(tr.hp<=0) depleteTree(w.tree);
          w.carry=true; m.userData.log.visible=true;
          w.state='return';
        }
        break;
      }
      case 'return':
        moveTo(w.home.x,w.home.z+0.35,()=>{
          G.wood+=G.mods.woodYield; w.carry=false; m.userData.log.visible=false;
          burst(w.home.x,0.5,w.home.z,0xc8934a,4,1.4);
          w.state='idle'; w.timer=0.2; updateHUD();
        });
        break;
    }
  }
}
// ============================================================
//  RESEARCH — tech tree (GDD Module 14), 3 tiers
// ============================================================
const TECHS=[
  {id:'sharp', tier:1,name:'Schärfere Pfeile', desc:'+12% Turmschaden',            gold:60, wood:20, time:22, apply:m=>m.dmg*=1.12},
  {id:'axes',  tier:1,name:'Bessere Äxte',     desc:'Zwerge bringen +3 Holz',      gold:40, wood:0,  time:18, apply:m=>m.woodYield+=3},
  {id:'mason', tier:1,name:'Steinverstärkung', desc:'Neue Palisaden +70 HP',       gold:30, wood:30, time:18, apply:m=>m.wallHp+=70},
  {id:'drill', tier:2,name:'Kampftraining',    desc:'Truppen +30% Schaden',        gold:110,wood:30, time:26, apply:m=>m.troopDmg*=1.3},
  {id:'mail',  tier:2,name:'Kettenhemden',     desc:'Truppen +40% Leben',          gold:120,wood:35, time:28, apply:m=>{m.troopHp*=1.4;
    for(const t of G.troops){ if(!t.dead){ t.maxhp=Math.round(t.maxhp*1.4); t.hp=Math.round(t.hp*1.4); } }}},
  {id:'metal', tier:2,name:'Metallurgie',      desc:'+15% Schaden, +10% Feuerrate',gold:120,wood:40, time:32, apply:m=>{m.dmg*=1.15;m.rate*=0.9;}},
  {id:'smelt', tier:2,name:'Goldschmelze',     desc:'Minen fördern +2 Gold',       gold:100,wood:30, time:28, apply:m=>m.mineYield+=2},
  {id:'boots', tier:2,name:'Flinke Stiefel',   desc:'Zwerge +30% Tempo',           gold:80, wood:20, time:24, apply:m=>m.wSpeed*=1.3},
  {id:'yggd',  tier:3,name:'Yggdrasil-Rune',   desc:'+20% Schaden & +10% Reichweite',gold:250,wood:80,time:42, apply:m=>{m.dmg*=1.2;m.range*=1.1;}},
  {id:'horn',  tier:3,name:'Heimdalls Horn',   desc:'Langhaus +8 Leben',           gold:180,wood:50, time:36, apply:m=>{G.lives=Math.min(40,G.lives+8);}},
];
function techAvailable(t){
  if(G.tech.done.includes(t.id))return false;
  if(t.tier===1)return true;
  return TECHS.filter(x=>x.tier===t.tier-1&&G.tech.done.includes(x.id)).length>=1;
}
function tickResearch(dt){
  const cur=G.tech.cur; if(!cur)return;
  const t=TECHS.find(x=>x.id===cur); if(!t){G.tech.cur=null;return;}
  G.tech.prog+=dt;
  if(G.tech.prog>=t.time){
    G.tech.done.push(t.id); G.tech.cur=null; G.tech.prog=0;
    t.apply(G.mods);
    banner('Forschung abgeschlossen: '+t.name); sfx('rune'); vib(20);
    updateHUD();
    if(!$('techScreen').classList.contains('hidden')) renderTech();
  }
}
function startResearch(t){
  if(G.tech.cur){ banner('Es läuft bereits eine Forschung'); return; }
  if(!techAvailable(t))return;
  if(G.gold<t.gold||G.wood<t.wood){ banner('Zu teuer: '+t.gold+' Gold, '+t.wood+' Holz'); return; }
  G.gold-=t.gold; G.wood-=t.wood;
  G.tech.cur=t.id; G.tech.prog=0;
  banner('Forschung gestartet: '+t.name); sfx('place'); vib(12);
  updateHUD(); renderTech();
}
function renderTech(){
  const box=$('techList'); box.innerHTML='';
  for(const t of TECHS){
    const done=G.tech.done.includes(t.id);
    const running=G.tech.cur===t.id;
    const avail=techAvailable(t)&&!running;
    const locked=!done&&!running&&!avail;
    const el=document.createElement('div');
    el.className='techrow'+(done?' done':locked?' locked':'');
    const prog=running?Math.min(100,G.tech.prog/t.time*100):0;
    el.innerHTML=`<div class="t-tier">${'I'.repeat(t.tier)}</div>
      <div class="t-main"><div class="t-nm">${t.name}</div><div class="t-desc">${t.desc}</div>
      ${running?`<div class="t-bar"><div style="width:${prog}%"></div></div>`:''}</div>
      <div class="t-cost">${done?'✓':running?Math.ceil(t.time-G.tech.prog)+'s':locked?'—':
        `<span class="cg">${t.gold}</span> <span class="cw">${t.wood}</span>`}</div>`;
    if(avail) el.addEventListener('click',()=>startResearch(t));
    box.appendChild(el);
  }
}
$('techBtn').addEventListener('click',()=>{ renderTech(); $('techScreen').classList.remove('hidden'); });
$('techClose').addEventListener('click',()=>$('techScreen').classList.add('hidden'));

// ---------- repair ----------
function repairCost(o){ return Math.ceil((o.maxhp-o.hp)*0.08); }
function repairStructure(o,label){
  if(o.hp>=o.maxhp){ banner(label+' ist unbeschädigt'); return false; }
  const c=repairCost(o);
  if(G.wood<c){ banner('Reparatur braucht '+c+' Holz'); return false; }
  G.wood-=c; o.hp=o.maxhp;
  setStructBar(o.mesh,1);
  burst(o.mesh.position.x,0.5,o.mesh.position.z,0x4ade80,8,2);
  banner(label+' repariert (−'+c+' Holz)'); sfx('place'); vib(10); updateHUD();
  return true;
}
// ---------- structures under siege ----------
function damageStructure(i,amount){
  let obj=null,kind=null,name='';
  if(G.grid[i]===T_TOWER&&G.tower[i]){ obj=G.tower[i]; kind='tower'; name=obj.def.name; }
  else if(G.grid[i]===T_WALL&&G.walls[i]){ obj=G.walls[i]; kind='wall'; name='Palisade'; }
  else if(G.grid[i]===T_BUILDING){ obj=G.buildings.find(b=>b.i===i); kind='hut';
    name=obj&&BUILDINGS[obj.type]?BUILDINGS[obj.type].name:'Holzfäller-Hütte'; }
  if(!obj)return;
  obj.hp-=amount;
  ensureStructBar(obj.mesh, kind==='tower'?1.15:kind==='hut'?0.95:0.8);
  setStructBar(obj.mesh, obj.hp/obj.maxhp);
  sfx('thud');
  if(obj.hp<=0) destroyStructure(i,obj,kind,name);
}
function destroyStructure(i,obj,kind,name){
  const c=i%COLS,r=(i/COLS)|0;
  scene.remove(obj.mesh);
  if(kind==='tower'){ if(G.inspect===obj)closeSheet(); G.tower[i]=null; }
  else if(kind==='wall'){ delete G.walls[i]; }
  else { // hut/barracks: dismiss its people
    obj.destroyed=true;
    G.buildings=G.buildings.filter(b=>b!==obj);
    G.workers=G.workers.filter(w=>{ if(w.home===obj){ scene.remove(w.mesh); return false; } return true; });
    G.troops=G.troops.filter(t=>{ if(t.home===obj){ scene.remove(t.mesh); return false; } return true; });
    if(obj.flag) scene.remove(obj.flag);
    if(kind==='hut'&&BUILDINGS[obj.type]) name=BUILDINGS[obj.type].name;
  }
  G.grid[i]=T_GROUND;
  computeFlow();
  burst(tw(c),0.5,tz(r),0xff9d5a,20,3.5);
  addShake(0.3); vib(40); sfx('basehit');
  banner(name+' zerstört!');
}
// ---------- troops (viking defenders) ----------
function troopKindOf(b){ return b.type==='archery'?'archer':b.type==='shieldhall'?'huskarl':'warrior'; }
function troopStats(kind){ return kind==='archer'?ARCHER:kind==='huskarl'?HUSKARL:TROOP; }
function makeTroop(b){
  const kind=troopKindOf(b), S=troopStats(kind);
  const mesh=kind==='archer'?makeArcher():kind==='huskarl'?makeHuskarl():makeWarrior(); scene.add(mesh);
  mesh.position.set(b.x+(Math.random()-0.5)*0.6,0,b.z+0.5);
  const hp=Math.round(S.hp*G.mods.troopHp);
  const t={mesh,home:b,kind,x:mesh.position.x,z:mesh.position.z,
    hp,maxhp:hp,target:null,atkT:0,anim:Math.random()*6,dead:false,dying:0,flashT:0};
  G.troops.push(t); return t;
}
function spawnTroops(b){
  const want=BUILDINGS[b.type]?.troops||0;
  for(let k=G.troops.filter(t=>t.home===b&&!t.dead).length;k<want;k++) makeTroop(b);
}
// --- arrow tracer pool (archer shots) ---
const arrows=[];
function fireArrow(x0,z0,x1,z1){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([x0,0.55,z0,x1,0.5,z1]),3));
  const ln=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xd9e8c8,transparent:true,opacity:0.9}));
  scene.add(ln); arrows.push({ln,t:0.14});
}
function updateArrows(dt){
  for(let i=arrows.length-1;i>=0;i--){ const a=arrows[i]; a.t-=dt;
    a.ln.material.opacity=Math.max(0,a.t/0.14)*0.9;
    if(a.t<=0){ scene.remove(a.ln); a.ln.geometry.dispose(); a.ln.material.dispose(); arrows.splice(i,1); } }
}
function updateTroops(dt){
  for(const t of G.troops){
    const m=t.mesh, P=m.userData.parts;
    if(t.dead){ t.dying+=dt;
      const f=clamp(1-t.dying/0.5,0,1);
      m.rotation.z=-(1-f)*1.5; m.position.y=-(1-f)*0.2; m.scale.setScalar(Math.max(0.001,0.5+0.5*f));
      continue; }
    t.anim+=dt*5;
    if(t.flashT>0){ t.flashT-=dt; if(t.flashT<=0) m.userData.body.material.emissive.setHex(0x000000); }
    const S=troopStats(t.kind), isArcher=t.kind==='archer';
    const rally=t.home.rally||{x:t.home.x,z:t.home.z};
    const aggro=isArcher?TROOP.aggro+ARCHER.range*0.5:TROOP.aggro;
    // acquire: nearest living enemy near the rally point
    if(!t.target||t.target.dead){
      t.target=null; let bd=Infinity;
      for(const e of G.enemies){ if(e.dead)continue;
        const dr=(e.x-rally.x)*(e.x-rally.x)+(e.z-rally.z)*(e.z-rally.z);
        if(dr>aggro*aggro)continue;
        const dtp=(e.x-t.x)*(e.x-t.x)+(e.z-t.z)*(e.z-t.z);
        if(dtp<bd){bd=dtp;t.target=e;} }
    }
    const walkTo=(x,z,stop)=>{
      const dx=x-t.x,dz=z-t.z,d=Math.hypot(dx,dz);
      if(d<=stop)return true;
      t.x+=dx/d*S.speed*dt; t.z+=dz/d*S.speed*dt;
      m.rotation.y=-Math.atan2(dz,dx);
      const sw=Math.sin(t.anim)*0.6;
      if(P){P.lLeg.rotation.z=sw;P.rLeg.rotation.z=-sw;P.lArm.rotation.z=-sw*0.4;P.rArm.rotation.z=sw*0.5;}
      m.position.set(t.x,Math.abs(Math.sin(t.anim))*0.035,t.z);
      return false;
    };
    if(t.target){
      const e=t.target, d=Math.hypot(e.x-t.x,e.z-t.z);
      const reach=isArcher?ARCHER.range:0.55+e.r*0.3;
      if(d>reach){ walkTo(e.x,e.z,reach-0.05); }
      else {
        m.rotation.y=-Math.atan2(e.z-t.z,e.x-t.x);
        if(P){
          if(isArcher){ // draw + loose
            P.lArm.rotation.z=-1.35; P.rArm.rotation.z=-0.9-Math.max(0,Math.sin(t.anim*2))*0.35;
            P.lLeg.rotation.z=0.08; P.rLeg.rotation.z=-0.08;
          } else {
            P.rArm.rotation.z=-0.4-Math.abs(Math.sin(t.anim*2.2))*1.5;
            P.lArm.rotation.z=0.5; P.lLeg.rotation.z=0.1; P.rLeg.rotation.z=-0.1;
          }
        }
        t.atkT-=dt;
        if(t.atkT<=0){ t.atkT=S.rate;
          hurt(e,S.dps*G.mods.troopDmg);
          if(isArcher){ fireArrow(t.x,t.z,e.x,e.z); burst(e.x,0.5,e.z,0x9fe08a,2,1.4); }
          else burst(e.x,0.5,e.z,0xc9d2dc,3,1.6);
        }
      }
    } else {
      // hold the rally point
      if(walkTo(rally.x,rally.z,0.4)&&P){
        P.lLeg.rotation.z=0; P.rLeg.rotation.z=0;
        P.lArm.rotation.z=Math.sin(t.anim*0.4)*0.07; P.rArm.rotation.z=-Math.sin(t.anim*0.4)*0.07;
        m.position.y=0;
      }
    }
    // hp bar
    m.userData.hpfg.scale.x=0.58*clamp(t.hp/t.maxhp,0,1);
  }
  // bury the fallen + barracks respawn timers
  G.troops=G.troops.filter(t=>{ if(t.dead&&t.dying>=0.5){ scene.remove(t.mesh);
    if(t.home&&!t.home.destroyed) t.home.respawnT=Math.max(t.home.respawnT||0,TROOP.respawn);
    return false; } return true; });
  for(const b of G.buildings){
    if(!BUILDINGS[b.type]||!BUILDINGS[b.type].troops)continue;
    const alive=G.troops.filter(t=>t.home===b&&!t.dead).length;
    if(alive<BUILDINGS[b.type].troops){
      b.respawnT=(b.respawnT||TROOP.respawn)-dt;
      if(b.respawnT<=0){ b.respawnT=TROOP.respawn;
        const t=makeTroop(b);
        burst(t.x,0.4,t.z,BUILDINGS[b.type].color,6,1.6);
      }
    }
  }
  updateArrows(dt);
}
function updateMines(dt){
  const def=BUILDINGS.goldmine;
  for(const mn of G.mines){
    mn.timer+=dt;
    if(mn.timer>=def.rate){
      mn.timer=0;
      G.gold+=def.yield+G.mods.mineYield;
      burst(mn.x,0.6,mn.z,0xffd25a,4,1.4);
      updateHUD();
    }
  }
}
function updateTowers(dt,now){
  for(const t of G.tower){ if(!t)continue;
    if(t.recoil>0)t.recoil-=dt*7;
    t.cd-=dt;
    // idle pulse
    if(t.mesh.userData.pulse){ const p=0.5+Math.sin(now*3+t.x)*0.5; t.mesh.userData.pulse.material.opacity=0.3+p*0.35; }
    if(t.mesh.userData.wingL){ t.mesh.userData.wingL.rotation.z=-0.55+Math.sin(now*10)*0.12;
      t.mesh.userData.wingR.rotation.z=0.55-Math.sin(now*10)*0.12; }
    let best=null,bd=Infinity; const R=effRange(t);
    for(const e of G.enemies){ if(e.dead)continue;
      const d=(t.x-e.x)*(t.x-e.x)+(t.z-e.z)*(t.z-e.z);
      if(d<=R*R&&d<bd){bd=d;best=e;} }
    if(best){
      const a=Math.atan2(best.z-t.z,best.x-t.x);
      t.angle=a;
      const head=t.mesh.userData.head;
      if(head){ head.rotation.y=-a; head.position.x=-Math.max(0,t.recoil)*0.18*Math.cos(a);
        head.position.z=-Math.max(0,t.recoil)*0.18*Math.sin(a); }
      if(t.cd<=0){ fire(t,best); t.cd=effRate(t); }
    }
  }
}
function fire(t,tgt){
  t.recoil=1;
  const def=t.def;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(def.splash?0.11:0.07,8,8),
    new THREE.MeshBasicMaterial({color:def.color}));
  const gl=glowSprite(def.color,0.7,0.9); mesh.add(gl);
  const sy=(t.key==='walkure')?1.3:(t.key==='bifrost')?0.95:0.5;
  mesh.position.set(t.x,sy,t.z); scene.add(mesh);
  G.bullets.push({mesh,target:tgt,speed:def.bspeed,dmg:effDmg(t),
    splash:Math.max(def.splash||0,G.mods.splash),
    slow:Math.max(def.slow||0,G.mods.slow),slowT:(def.slowT||G.mods.slowT),dead:false});
  // muzzle sparks + energy arcs
  burst(t.x+Math.cos(t.angle)*0.5, sy, t.z+Math.sin(t.angle)*0.5, def.color, 3, 1.6);
  if(t.key==='walkure') lightningArc(t.x,1.3,t.z, tgt.x,0.4,tgt.z, 0xffe27a, 0.3);
  else if(t.key==='bifrost') lightningArc(t.x,0.95,t.z, tgt.x,0.4,tgt.z, 0xc88fff, 0.08);
  sfx('shoot');
}
function updateBullets(dt){
  for(const b of G.bullets){
    if(b.dead)continue;
    const tx=b.target&&!b.target.dead?b.target.x:b.mesh.position.x;
    const tz2=b.target&&!b.target.dead?b.target.z:b.mesh.position.z;
    const dx=tx-b.mesh.position.x, dy=0.3-b.mesh.position.y, dz=tz2-b.mesh.position.z;
    const d=Math.hypot(dx,dy,dz)||1, st=b.speed*dt;
    if(d<=st+0.15){ hit(b); b.dead=true; scene.remove(b.mesh); }
    else b.mesh.position.add(new THREE.Vector3(dx/d*st,dy/d*st,dz/d*st));
  }
  G.bullets=G.bullets.filter(b=>!b.dead);
}
function hit(b){
  const bx=b.mesh.position.x,by=b.mesh.position.y,bz=b.mesh.position.z;
  const hex=b.mesh.material.color.getHex();
  if(b.splash>0){
    burst(bx,by,bz,hex,16,4); addShake(0.07);
    for(const e of G.enemies){ if(e.dead)continue;
      if((e.x-bx)*(e.x-bx)+(e.z-bz)*(e.z-bz)<=b.splash*b.splash) dmg(e,b); } }
  else { burst(bx,by,bz,hex,5,2.2); if(b.target&&!b.target.dead) dmg(b.target,b); }
}
function hurt(e,amount){
  e.hp-=amount;
  e.flashT=0.1; e.mesh.userData.body.material.emissive.setHex(0xffffff);
  e.mesh.userData.body.material.emissiveIntensity=0.55;
  if(e.hp<=0&&!e.dead){
    e.dead=true; e.dying=0;
    G.kills++; G.score+=e.boss?250:Math.max(1,Math.round(e.maxhp/6));
    const rw=Math.round(e.def.reward*goldMul()); G.gold+=rw;
    burst(e.x,0.5,e.z, e.mesh.userData.body.material.color.getHex(), e.boss?34:13, e.boss?5:3);
    if(e.boss){banner('Boss besiegt! +'+rw+' Gold'); sfx('boss'); vib(40); addShake(0.5);} else sfx('die');
    updateHUD();
  }
}
function dmg(e,b){
  if(b.slow>0){ e.slow=Math.max(e.slow,b.slow); e.slowT=b.slowT; }
  hurt(e,b.dmg);
}

// ---------- inspector ----------
function upCost(t){return Math.round(t.def.cost*0.8*t.level);}
function openSheet(t){
  G.inspect=t;
  rangeRing.visible=true; rangeRing.position.set(t.x,0.02,t.z); rangeRing.scale.setScalar(effRange(t));
  $('shNm').textContent=t.def.name+' · Stufe '+t.level;
  $('shInfo').textContent='Schaden '+Math.round(effDmg(t))+' · Reichweite '+effRange(t).toFixed(1)+' · '+(1/effRate(t)).toFixed(1)+'/s';
  const c=upCost(t);
  $('shUpBtn').textContent=t.level>=4?'Max':'Upgrade · '+c+' Gold';
  $('shUpBtn').disabled=G.gold<c||t.level>=4;
  const rc=repairCost(t);
  $('shRepBtn').textContent=t.hp>=t.maxhp?'Intakt':'Reparieren · '+rc+' Holz';
  $('shRepBtn').disabled=t.hp>=t.maxhp||G.wood<rc;
  $('shSellBtn').textContent='Verkaufen · '+Math.floor(t.invested*G.mods.sell)+' Gold';
  $('sheet').classList.add('show');
}
function closeSheet(){ G.inspect=null; rangeRing.visible=false; $('sheet').classList.remove('show'); }
$('shCloseBtn').addEventListener('click',closeSheet);
$('shRepBtn').addEventListener('click',()=>{ const t=G.inspect; if(!t)return;
  if(repairStructure(t,t.def.name)) openSheet(t); });
$('shUpBtn').addEventListener('click',()=>{ const t=G.inspect; if(!t||t.level>=4)return;
  const c=upCost(t); if(G.gold<c)return;
  G.gold-=c; t.level++; t.dmg=Math.round(t.dmg*1.6); t.range*=1.08; t.rate*=0.9; t.invested+=c;
  t.maxhp+=60; t.hp+=60; setStructBar(t.mesh,t.hp/t.maxhp);
  t.mesh.scale.setScalar(1+0.07*(t.level-1)); sfx('upgrade'); vib(15);
  openSheet(t); updateHUD(); });
$('shSellBtn').addEventListener('click',()=>{ const t=G.inspect; if(!t)return;
  G.gold+=Math.floor(t.invested*G.mods.sell); sfx('sell');
  const i=idx(t.c,t.r); G.grid[i]=T_GROUND; G.tower[i]=null; scene.remove(t.mesh);
  computeFlow(); closeSheet(); updateHUD(); });

// ---------- HUD ----------
function costHtml(k){
  const g=towerCost(k), w=woodCost(k);
  return (g>0?`<span class="cg">${g}</span>`:'')+(w>0?`<span class="cw">${w}</span>`:'');
}
function updateHUD(){
  $('uiGold').textContent=Math.floor(G.gold);
  $('uiWood').textContent=Math.floor(G.wood);
  $('uiLife').textContent=G.lives;
  $('uiWave').textContent=G.wave;
  $('uiScore').textContent=Math.floor(G.score);
  const wb=$('waveBtn'); wb.disabled=G.waveActive||!G.basePlaced;
  wb.textContent=!G.basePlaced?'Langhaus platzieren…':
    G.waveActive?'Welle '+G.wave+' läuft…':'Welle '+(G.wave+1)+' in '+Math.max(0,Math.ceil(G.buildTimer))+'s · Jetzt!';
  document.querySelectorAll('.twr').forEach(el=>{
    const k=el.dataset.k, def=TOWERS[k]||BUILDINGS[k], locked=G.wave<(def.unlock||0);
    el.classList.toggle('locked',locked||!canAfford(k));
    const cost=el.querySelector('.cost');
    if(!locked) cost.innerHTML=costHtml(k);
    cost.classList.toggle('na',!canAfford(k)&&!locked);
  });
}
const BUILD_TABS={ def:KEYS, eco:['palisade','lumber','goldmine','barracks','archery','shieldhall'] };
let activeTab='def';
// ---- drag & drop building (no more tap-to-build misclicks) ----
let drag=null;   // {key, ghost, marker, valid, c, r}
function validPlace(key,c,r){
  if(!inB(c,r))return false;
  if(!G.basePlaced)return false;
  const def=TOWERS[key]||BUILDINGS[key];
  if(G.wave<(def.unlock||0))return false;
  if(!canAfford(key))return false;
  const t=G.grid[idx(c,r)];
  if(key==='goldmine') return t===T_VEIN&&G.veins[idx(c,r)]&&!G.veins[idx(c,r)].mine;
  return t===T_GROUND;
}
function ghostFor(key){
  let m;
  if(TOWERS[key]) m=makeTower(key);
  else if(key==='lumber') m=makeHut();
  else if(key==='barracks') m=makeBarracks();
  else if(key==='archery') m=makeArcheryRange();
  else if(key==='shieldhall') m=makeShieldHall();
  else if(key==='goldmine') m=makeMine();
  else m=makePalisade();
  m.traverse(o=>{ if(o.material){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.55; o.castShadow=false; } });
  return m;
}
function startDrag(key,x,y){
  if(drag)endDrag(false);
  const def=TOWERS[key]||BUILDINGS[key];
  if(G.wave<(def.unlock||0)){ banner(def.name+' ab Welle '+def.unlock); return; }
  drag={key,ghost:ghostFor(key),marker:null,valid:false,c:-1,r:-1};
  drag.marker=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({color:0x4ade80,transparent:true,opacity:0.32,side:THREE.DoubleSide,depthWrite:false}));
  drag.marker.rotation.x=-Math.PI/2; drag.marker.position.y=0.005;
  scene.add(drag.ghost); scene.add(drag.marker);
  moveDrag(x,y);
}
function moveDrag(x,y){
  if(!drag)return;
  const t=screenToTile(x,y);
  if(!t){ drag.ghost.visible=false; drag.marker.visible=false; drag.valid=false; return; }
  drag.c=t.c; drag.r=t.r;
  drag.valid=validPlace(drag.key,t.c,t.r);
  drag.ghost.visible=true; drag.marker.visible=true;
  drag.ghost.position.set(tw(t.c),0,tz(t.r));
  drag.marker.position.set(tw(t.c),0.005,tz(t.r));
  drag.marker.material.color.setHex(drag.valid?0x4ade80:0xff5a52);
}
function endDrag(commit){
  if(!drag)return;
  const {key,c,r,valid,ghost,marker}=drag;
  scene.remove(ghost); scene.remove(marker);
  drag=null;
  document.querySelectorAll('.twr').forEach(x=>x.classList.remove('dragging'));
  if(commit&&valid){ G.selected=key; tryBuild(c,r); }
  else if(commit&&c>=0){ // dropped on an invalid spot — explain via tryBuild's messages
    G.selected=key; tryBuild(c,r);
  }
}
window.addEventListener('pointermove',e=>{ if(drag) moveDrag(e.clientX,e.clientY); },{passive:true});
window.addEventListener('pointerup',e=>{ if(drag) endDrag(true); });
window.addEventListener('pointercancel',()=>{ if(drag) endDrag(false); });

function buildRow(){
  const row=$('towerRow'); row.innerHTML='';
  for(const k of BUILD_TABS[activeTab]){ const def=TOWERS[k]||BUILDINGS[k];
    const el=document.createElement('div'); el.className='twr'; el.dataset.k=k;
    el.innerHTML=`<div class="dot" style="background:#${def.color.toString(16).padStart(6,'0')};color:#${def.color.toString(16).padStart(6,'0')}"></div>
      <div class="nm">${def.name}</div><div class="cost">${costHtml(k)}</div>`;
    // drag & drop: press the card, pull it onto the map
    el.addEventListener('pointerdown',ev=>{
      ev.preventDefault();
      if(!G.running||G.over)return;
      el.classList.add('dragging');
      startDrag(k,ev.clientX,ev.clientY);
    });
    row.appendChild(el);
  }
  updateHUD();
}
document.querySelectorAll('.btab').forEach(b=>b.addEventListener('click',()=>{
  activeTab=b.dataset.t;
  document.querySelectorAll('.btab').forEach(x=>x.classList.toggle('sel',x.dataset.t===activeTab));
  buildRow(); refreshRow();
}));
function refreshRow(){
  document.querySelectorAll('.twr').forEach(el=>{ const def=TOWERS[el.dataset.k]||BUILDINGS[el.dataset.k];
    el.querySelector('.nm').textContent=G.wave<(def.unlock||0)?'Welle '+def.unlock:def.name; });
  updateHUD();
}
let bnT=null;
function banner(msg){ const b=$('banner'); b.textContent=msg; b.classList.add('show');
  clearTimeout(bnT); bnT=setTimeout(()=>b.classList.remove('show'),1900); }

// ---------- input: pan / pinch / tap ----------
const ptr=new Map(); let moved=false,dx0=0,dy0=0,t0=0,pinch0=0,dist0=0;
const cv=$('gl');
cv.addEventListener('pointerdown',e=>{ cv.setPointerCapture(e.pointerId);
  ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptr.size===1){moved=false;dx0=e.clientX;dy0=e.clientY;t0=performance.now();}
  else if(ptr.size===2){ const p=[...ptr.values()]; pinch0=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1; dist0=cam.dist; moved=true; }});
cv.addEventListener('pointermove',e=>{
  if(!ptr.has(e.pointerId))return;
  const prev=ptr.get(e.pointerId), nx=e.clientX, ny=e.clientY;
  if(ptr.size===2){ const p=[...ptr.values()];
    const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1;
    cam.targetDist=clamp(dist0*(pinch0/d),cam.min,cam.max);
  } else if(ptr.size===1){
    if(Math.hypot(nx-dx0,ny-dy0)>12)moved=true;
    if(moved){ const k=cam.dist/700;
      const dxw=-(nx-prev.x)*k, dzw=-(ny-prev.y)*k*1.4;
      cam.tx=clamp(cam.tx+dxw,-COLS/2,COLS/2);
      cam.tz=clamp(cam.tz+dzw,-ROWS/2,ROWS/2);
      panVX=dxw*38; panVZ=dzw*38;   // capture velocity for glide
    }
  }
  ptr.set(e.pointerId,{x:nx,y:ny});
});
function endP(e){
  if(ptr.size===1&&!moved&&performance.now()-t0<320) tap(e.clientX,e.clientY);
  ptr.delete(e.pointerId);
}
cv.addEventListener('pointerup',endP);
cv.addEventListener('pointercancel',e=>ptr.delete(e.pointerId));
cv.addEventListener('wheel',e=>{ e.preventDefault(); cam.targetDist=clamp(cam.targetDist*(e.deltaY>0?1.12:0.9),cam.min,cam.max); },{passive:false});
function updateCameraSmooth(dt){
  cam.dist+=(cam.targetDist-cam.dist)*Math.min(1,dt*9);
  if(ptr.size===0&&(Math.abs(panVX)>0.01||Math.abs(panVZ)>0.01)){
    cam.tx=clamp(cam.tx+panVX*dt,-COLS/2,COLS/2);
    cam.tz=clamp(cam.tz+panVZ*dt,-ROWS/2,ROWS/2);
    const d=Math.pow(0.03,dt); panVX*=d; panVZ*=d;
  }
}
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(), groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0), hitP=new THREE.Vector3();
function screenToTile(sx,sy){
  ndc.set(sx/innerWidth*2-1,-(sy/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  if(!ray.ray.intersectPlane(groundPlane,hitP))return null;
  const c=Math.floor(hitP.x+COLS/2), r=Math.floor(hitP.z+ROWS/2);
  return inB(c,r)?{c,r}:null;
}
function placeBase(c,r){
  const i=idx(c,r);
  if(G.grid[i]!==T_GROUND){ banner('Hier kann das Langhaus nicht stehen'); return; }
  const ds=Math.hypot(c-G.spawn.c,r-G.spawn.r);
  if(ds<8){ banner('Zu nah am Riss der Feinde!'); return; }
  G.base={c,r}; G.grid[i]=T_BASE; G.basePlaced=true;
  computeFlow(); buildBoard();
  cam.tx=tw(c); cam.tz=tz(r);
  burst(tw(c),0.6,tz(r),0x4ade80,20,3);
  banner('Langhaus errichtet — die Uhr läuft!'); sfx('rune'); vib(25);
  updateHUD(); drawMinimap();
}
// tap = inspect / rally / base placement ONLY (building is drag & drop)
function tap(sx,sy){
  if(!G.running||G.over)return;
  const t0=screenToTile(sx,sy);
  if(!t0){closeSheet();return;}
  const {c,r}=t0;
  if(!G.basePlaced){ placeBase(c,r); return; }
  const i=idx(c,r);
  if(G.rallyFor){
    const b=G.rallyFor; G.rallyFor=null;
    b.rally={x:tw(c),z:tz(r)};
    if(!b.flag){ b.flag=makeRallyFlag(); scene.add(b.flag); }
    b.flag.position.set(b.rally.x,0,b.rally.z);
    for(const t of G.troops) if(t.home===b) t.target=null;
    banner('Sammelpunkt gesetzt'); sfx('place'); vib(10);
    return;
  }
  if(G.grid[i]===T_TOWER&&G.tower[i]){ openSheet(G.tower[i]); return; }
  if(G.grid[i]===T_WALL&&G.walls[i]){ const w=G.walls[i];
    if(w.hp<w.maxhp) repairStructure(w,'Palisade');
    else banner('Palisade · '+Math.ceil(w.hp)+'/'+w.maxhp);
    return; }
  if(G.grid[i]===T_BUILDING){ const bb=G.buildings.find(b=>b.i===i);
    if(bb){
      if(BUILDINGS[bb.type]&&BUILDINGS[bb.type].troops){
        if(bb.hp<bb.maxhp&&G.wood>=repairCost(bb)){ repairStructure(bb,BUILDINGS[bb.type].name); return; }
        const who=bb.type==='archery'?'Bogenschützen':bb.type==='shieldhall'?'Huskarle':'Krieger';
        G.rallyFor=bb; banner('Auf die Karte tippen: Sammelpunkt für die '+who); return;
      }
      if(bb.hp<bb.maxhp) repairStructure(bb,'Holzfäller-Hütte');
      else banner('Holzfäller-Hütte · '+Math.ceil(bb.hp)+'/'+bb.maxhp+' · '+G.workers.filter(w=>w.home===bb).length+' Zwerge');
      return; } }
  closeSheet();
}

// ============================================================
//  AUDIO / SETTINGS / RUNES / WEATHER FX / EVENTS / SAVE
// ============================================================
const SND={ctx:null,master:null,on:true}; let hapticOn=true,lastShoot=0;
function vib(ms){ if(hapticOn&&navigator.vibrate)try{navigator.vibrate(ms);}catch(e){} }
function loadSettings(){ try{ SND.on=localStorage.getItem('ygg_sound')!=='0'; hapticOn=localStorage.getItem('ygg_haptic')!=='0'; }catch(e){} }
function initAudio(){
  if(SND.ctx){ if(SND.ctx.state==='suspended')SND.ctx.resume(); return; }
  try{ SND.ctx=new (window.AudioContext||window.webkitAudioContext)();
    SND.master=SND.ctx.createGain(); SND.master.gain.value=SND.on?0.5:0; SND.master.connect(SND.ctx.destination);
  }catch(e){}
}
function beep(f,d,type,v,slide){
  if(!SND.ctx||!SND.on)return; const t=SND.ctx.currentTime;
  const o=SND.ctx.createOscillator(),g=SND.ctx.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(1,slide),t+d);
  g.gain.setValueAtTime(v||0.3,t); g.gain.exponentialRampToValueAtTime(0.0008,t+d);
  o.connect(g); g.connect(SND.master); o.start(t); o.stop(t+d+0.02);
}
function sfx(n){
  if(!SND.on||!SND.ctx)return;
  switch(n){
    case 'shoot':{const now=performance.now(); if(now-lastShoot<45)return; lastShoot=now; beep(620+Math.random()*90,0.045,'square',0.05); break;}
    case 'place': beep(170,0.12,'sine',0.28,340); break;
    case 'upgrade': beep(420,0.2,'sine',0.28,860); break;
    case 'sell': beep(520,0.12,'sine',0.2,190); break;
    case 'die': beep(150,0.11,'sawtooth',0.12,60); break;
    case 'boss': beep(90,0.45,'sawtooth',0.32,45); break;
    case 'wave': beep(330,0.1,'square',0.2); setTimeout(()=>beep(494,0.15,'square',0.2),110); break;
    case 'basehit': beep(120,0.28,'sawtooth',0.35,45); break;
    case 'rune': beep(523,0.12,'sine',0.26); setTimeout(()=>beep(659,0.12,'sine',0.26),95); setTimeout(()=>beep(784,0.2,'sine',0.26),190); break;
    case 'event': beep(880,0.09,'sine',0.14,1250); break;
    case 'thud': { const now=performance.now(); if(now-lastShoot<70)return; lastShoot=now;
      beep(95,0.08,'square',0.16,55); break; }
    case 'over': beep(420,0.5,'sawtooth',0.3,70); break;
  }
}
$('settingsBtn').addEventListener('click',()=>{ $('setSound').checked=SND.on; $('setHaptic').checked=hapticOn; $('settingsSheet').classList.remove('hidden'); });
$('setClose').addEventListener('click',()=>$('settingsSheet').classList.add('hidden'));
$('setSound').addEventListener('change',e=>{ SND.on=e.target.checked;
  try{localStorage.setItem('ygg_sound',SND.on?'1':'0');}catch(x){}
  if(SND.on){initAudio(); if(SND.master)SND.master.gain.value=0.5;} else if(SND.master)SND.master.gain.value=0; });
$('setHaptic').addEventListener('change',e=>{ hapticOn=e.target.checked;
  try{localStorage.setItem('ygg_haptic',hapticOn?'1':'0');}catch(x){} if(hapticOn)vib(15); });

// ---- runes ----
function paintSigil(c2,id,color,S){
  let h=0; for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;
  const cx=S/2,top=S*0.18,bot=S*0.82;
  c2.strokeStyle=color; c2.lineWidth=Math.max(2,S*0.05); c2.lineCap='round';
  c2.beginPath(); c2.moveTo(cx,top); c2.lineTo(cx,bot);
  const br=2+(h%3);
  for(let b=0;b<br;b++){ const t=top+(bot-top)*((b+1)/(br+1)); const dir=((h>>b)&1)?1:-1;
    const len=S*(0.18+((h>>(b+2))&3)*0.05); const up=((h>>(b+4))&1)?-1:1;
    c2.moveTo(cx,t); c2.lineTo(cx+dir*len,t+up*len*0.7); }
  const cap=S*0.14; c2.moveTo(cx-cap,top+cap*0.3); c2.lineTo(cx,top); c2.lineTo(cx+cap,top+cap*0.3);
  c2.stroke();
}
function rollRunes(){
  const boss=G.wave%5===0, pool=RUNES.map(r=>{ let w=r.rar==='common'?10:r.rar==='rare'?4:1.4;
    if(boss){ if(r.rar==='rare')w*=1.6; if(r.rar==='legendary')w*=2.4; } return {r,w}; });
  const pick=[],used=new Set();
  while(pick.length<3&&used.size<RUNES.length){
    let tot=0; for(const p of pool)if(!used.has(p.r.id))tot+=p.w;
    let x=Math.random()*tot,ch=null;
    for(const p of pool){ if(used.has(p.r.id))continue; x-=p.w; if(x<=0){ch=p.r;break;} }
    if(!ch)break; used.add(ch.id); pick.push(ch);
  }
  return pick;
}
function offerRunes(bonus){
  const box=$('runeCards'); box.innerHTML='';
  const tag={common:'Gewöhnlich',rare:'Selten',legendary:'Legendär'};
  for(const r of rollRunes()){
    const el=document.createElement('div'); el.className='runecard '+r.rar;
    el.innerHTML=`<div class="rc-rar"></div><canvas width="88" height="88"></canvas>
      <div class="rc-nm">${r.name}</div><div class="rc-desc">${r.desc}</div><div class="rc-tag">${tag[r.rar]}</div>`;
    const c2=el.querySelector('canvas').getContext('2d'); c2.scale(2,2); paintSigil(c2,r.id,RAR_COL[r.rar],44);
    el.addEventListener('click',()=>{ r.apply(G.mods); G.runes[r.id]=(G.runes[r.id]||0)+1;
      sfx('rune'); vib(20); closeRunes(); banner(r.name+' aktiviert!'); updateOwnedRunes(); updateHUD(); });
    box.appendChild(el);
  }
  $('runeSub').textContent='Welle '+G.wave+' geschafft · +'+bonus+' Gold. Der Weltenbaum gewährt dir eine Rune:';
  G.awaitingRune=true; $('runeScreen').classList.remove('hidden');
}
function closeRunes(){ G.awaitingRune=false; $('runeScreen').classList.add('hidden'); }
$('runeSkip').addEventListener('click',()=>{ G.gold+=40; closeRunes(); updateHUD(); });
function updateOwnedRunes(){
  let html='';
  for(const id in G.runes){ const def=RUNES.find(x=>x.id===id); if(!def)continue;
    const col=RAR_COL[def.rar]; const n=G.runes[id];
    html+=`<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${col};margin:0 1px;box-shadow:0 0 6px ${col}88"></span>${n>1?'<span style="font-size:9px">'+n+'</span>':''}`; }
  $('ownedRunes').innerHTML=html;
}

// ---- weather chip + 3D particles ----
function updateWeatherChip(){
  const el=$('weatherChip');
  if(G.weatherKey==='clear'){ el.classList.add('hidden'); rebuildWeatherPts(); return; }
  el.classList.remove('hidden');
  const c='#'+G.weather.col.toString(16).padStart(6,'0');
  el.innerHTML=`<span style="width:9px;height:9px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c}"></span> ${G.weather.name}`;
  rebuildWeatherPts();
}
$('weatherChip').addEventListener('click',()=>banner(G.weather.name+' — '+G.weather.desc));
let weatherPts=null,wVel=0;
function rebuildWeatherPts(){
  if(weatherPts){ scene.remove(weatherPts); weatherPts=null; }
  if(G.weatherKey==='clear'||G.weatherKey==='divine') return;
  const N=320, pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-0.5)*COLS*1.2; pos[i*3+1]=Math.random()*9; pos[i*3+2]=(Math.random()-0.5)*ROWS*1.2; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:G.weather.col,size:G.weatherKey==='ash'?0.09:0.055,
    transparent:true,opacity:0.75,depthWrite:false});
  weatherPts=new THREE.Points(g,m); scene.add(weatherPts);
  wVel=G.weatherKey==='storm'?9:G.weatherKey==='ash'?1.4:3;
}
function updateWeatherPts(dt){
  if(!weatherPts)return;
  const a=weatherPts.geometry.attributes.position;
  for(let i=0;i<a.count;i++){ let y=a.getY(i)-wVel*dt;
    if(y<0){ y=8+Math.random(); a.setX(i,(Math.random()-0.5)*COLS*1.2); a.setZ(i,(Math.random()-0.5)*ROWS*1.2); }
    a.setY(i,y); }
  a.needsUpdate=true;
}
function updateTimedFx(dt){
  const fx=G.fx;
  if(fx.rateT>0){fx.rateT-=dt; if(fx.rateT<=0)fx.rateMul=1;}
  if(fx.espdT>0){fx.espdT-=dt; if(fx.espdT<=0)fx.espdMul=1;}
  if(fx.dmgT>0){fx.dmgT-=dt; if(fx.dmgT<=0)fx.dmgMul=1;}
}
function triggerEvent(){
  const ev=EVENTS[(Math.random()*EVENTS.length)|0];
  ev.run(); banner(ev.msg); sfx('event'); vib(18); updateHUD();
}

// ---- save / resume / best ----
function serializeRun(){
  if(!G||G.over||G.wave<1)return null;
  const towers=[];
  for(const t of G.tower) if(t) towers.push({c:t.c,r:t.r,key:t.key,level:t.level,dmg:t.dmg,range:t.range,rate:t.rate,invested:t.invested,hp:t.hp,maxhp:t.maxhp});
  return {v:3,grid:Array.from(G.grid),towers,gold:G.gold,wood:G.wood,lives:G.lives,wave:G.wave,score:G.score,kills:G.kills,
    mods:G.mods,runes:G.runes,diffKey:G.diffKey,
    trees:Object.keys(G.trees).map(i=>[+i,G.trees[i].hp]),
    veins:Object.keys(G.veins).map(i=>[+i,G.veins[i].mine?1:0]),
    builds:G.buildings.map(b=>[b.i,b.hp,b.type||'lumber',b.rally?+b.rally.x.toFixed(2):0,b.rally?+b.rally.z.toFixed(2):0]),
    walls:Object.keys(G.walls).map(i=>[+i,G.walls[i].hp]),
    tech:G.tech.done, base:[G.base.c,G.base.r]};
}
function saveRun(){ const s=serializeRun(); if(s)try{localStorage.setItem('ygg3d_save',JSON.stringify(s));}catch(e){} }
function clearSave(){ try{localStorage.removeItem('ygg3d_save');}catch(e){} }
function loadSave(){ try{return JSON.parse(localStorage.getItem('ygg3d_save')||'null');}catch(e){return null;} }
function updateResumeBtn(){
  const s=loadSave(),btn=$('resumeBtn');
  if(s&&s.wave>0){btn.style.display='';btn.textContent='▶︎ Fortsetzen · Welle '+s.wave;} else btn.style.display='none';
}
function resumeRun(){
  const s=loadSave(); if(!s){startGame();return;}
  if(!s.grid||s.grid.length!==COLS*ROWS){ clearSave(); startGame(); return; } // old-map save
  selDiff=s.diffKey||'normal';
  clearScene3D();
  newGame();
  G.grid=new Uint8Array(s.grid);
  if(s.base){ G.base={c:s.base[0],r:s.base[1]}; }
  G.basePlaced=true;
  for(const tt of s.towers){ const def=TOWERS[tt.key]; if(!def)continue; const i=idx(tt.c,tt.r);
    const mesh=makeTower(tt.key); mesh.position.set(tw(tt.c),0,tz(tt.r)); mesh.scale.setScalar(1+0.07*(tt.level-1)); scene.add(mesh);
    G.tower[i]={key:tt.key,c:tt.c,r:tt.r,x:tw(tt.c),z:tz(tt.r),def,level:tt.level,dmg:tt.dmg,range:tt.range,
      rate:tt.rate,cd:0,invested:tt.invested,mesh,angle:0,recoil:0,
      hp:tt.hp!=null?tt.hp:TOWER_HP,maxhp:tt.maxhp!=null?tt.maxhp:TOWER_HP};
    G.grid[i]=T_TOWER; }
  G.gold=s.gold;G.lives=s.lives;G.wave=s.wave;G.score=s.score;G.kills=s.kills;
  G.wood=s.wood!=null?s.wood:100;
  Object.assign(G.mods,s.mods||{}); G.runes=s.runes||{};
  // restore economy (saved grid is authoritative; rebuild resource maps from save)
  G.trees={}; for(const [i,hp] of (s.trees||[])) G.trees[i]={hp};
  G.veins={}; G.mines=[];
  for(const [i,mined] of (s.veins||[])){ G.veins[i]={mine:mined?{timer:0}:null};
    if(mined){ const c=i%COLS,r=(i/COLS)|0; G.mines.push({i,x:tw(c),z:tz(r),timer:0}); } }
  G.buildings=[]; G.workers=[]; G.walls={}; G.troops=[];
  for(const ent of (s.builds||[])){
    const arr=Array.isArray(ent)?ent:[ent,BUILDINGS.lumber.hp];
    const [bi,bhp,btype,rx,rz]=arr; const type=btype||'lumber';
    const c=bi%COLS,r=(bi/COLS)|0;
    const def=BUILDINGS[type]||BUILDINGS.lumber;
    const m=type==='barracks'?makeBarracks():type==='archery'?makeArcheryRange():type==='shieldhall'?makeShieldHall():makeHut();
    m.position.set(tw(c),0,tz(r)); scene.add(m);
    const b={i:bi,x:tw(c),z:tz(r),hp:bhp,maxhp:def.hp,mesh:m,type};
    if(BUILDINGS[type]&&BUILDINGS[type].troops){
      b.rally={x:rx||b.x,z:rz||b.z+1.2}; b.respawnT=0;
      b.flag=makeRallyFlag(); b.flag.position.set(b.rally.x,0,b.rally.z); scene.add(b.flag);
    }
    G.buildings.push(b); }
  for(const [wi,whp] of (s.walls||[])){ const c=wi%COLS,r=(wi/COLS)|0;
    const m=makePalisade(); m.position.set(tw(c),0,tz(r)); scene.add(m);
    G.walls[wi]={hp:whp,maxhp:BUILDINGS.palisade.hp,mesh:m}; }
  G.tech={done:s.tech||[],cur:null,prog:0};
  G.buildTimer=35;
  computeFlow(); buildBoard(); buildRow(); refreshRow(); updateOwnedRunes(); updateWeatherChip();
  for(const b of G.buildings){ if(BUILDINGS[b.type]&&BUILDINGS[b.type].troops) spawnTroops(b); else spawnWorkers(b); }
  initAudio();
  mini.style.display='block'; drawMinimap();
  G.running=true; cam.tx=tw(G.base.c)-5; cam.tz=0; cam.dist=13; cam.targetDist=13;
  $('startScreen').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('runeScreen').classList.add('hidden');
  banner('Fortgesetzt — Welle '+G.wave);
}
$('resumeBtn').addEventListener('click',resumeRun);
document.addEventListener('visibilitychange',()=>{ if(document.hidden)saveRun(); });
function loadBest(){ try{return JSON.parse(localStorage.getItem('ygg_best')||'{}');}catch(e){return {};} }
function saveBest(b){ try{localStorage.setItem('ygg_best',JSON.stringify(b));}catch(e){} }
function showBest(){ const b=loadBest();
  $('bestLine').textContent=b.wave?('★ Rekord: Welle '+b.wave+' · '+Math.floor(b.score||0)+' Punkte'):''; }
document.querySelectorAll('.diffBtn').forEach(btn=>btn.addEventListener('click',()=>{
  selDiff=btn.dataset.d;
  document.querySelectorAll('.diffBtn').forEach(b=>b.classList.toggle('sel',b.dataset.d===selDiff));
  vib(8); }));
function clearScene3D(){
  if(!G)return;
  for(const e of G.enemies)removeEnemyMesh(e);
  for(const b of G.bullets)scene.remove(b.mesh);
  for(const t of G.tower)if(t)scene.remove(t.mesh);
  for(const w of G.workers)scene.remove(w.mesh);
  for(const i in G.walls)scene.remove(G.walls[i].mesh);
  for(const b of G.buildings){ if(b.mesh)scene.remove(b.mesh); if(b.flag)scene.remove(b.flag); }
  for(const t of G.troops)scene.remove(t.mesh);
  if(weatherPts){scene.remove(weatherPts);weatherPts=null;}
}

// ============================================================
//  MINIMAP — tactical overview, tap to move camera
// ============================================================
const mini=$('minimap'), mctx=mini.getContext('2d');
let miniTick=0;
function drawMinimap(){
  const S=196, k=S/COLS;
  mctx.clearRect(0,0,S,S);
  mctx.fillStyle='#0c1620'; mctx.fillRect(0,0,S,S);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const t=G.grid[idx(c,r)];
    if(t===T_GROUND||t===T_SPAWN||t===T_BASE)continue;
    mctx.fillStyle = t===T_TREE?'#2a5d36' : t===T_VEIN?'#caa53a' : t===T_WALL?'#8a6a40'
      : t===T_BUILDING?'#c8934a' : t===T_TOWER?'#7db8ff' : '#39434d';
    mctx.fillRect(c*k,r*k,k+0.5,k+0.5);
  }
  // base & spawn
  if(G.basePlaced){ mctx.fillStyle='#4ade80'; mctx.beginPath(); mctx.arc((G.base.c+0.5)*k,(G.base.r+0.5)*k,3.2,0,7); mctx.fill(); }
  mctx.fillStyle='#ff5a52'; mctx.beginPath(); mctx.arc((G.spawn.c+0.5)*k,(G.spawn.r+0.5)*k,3.2,0,7); mctx.fill();
  // enemies
  mctx.fillStyle='#ff7a70';
  for(const e of G.enemies){ if(e.dead)continue;
    mctx.fillRect((e.x+COLS/2)*k-1.4,(e.z+ROWS/2)*k-1.4,2.8,2.8); }
  // dwarves + troops
  mctx.fillStyle='#ffd25a';
  for(const w of G.workers) mctx.fillRect((w.mesh.position.x+COLS/2)*k-1,(w.mesh.position.z+ROWS/2)*k-1,2,2);
  mctx.fillStyle='#6ab0ff';
  for(const t of G.troops){ if(!t.dead) mctx.fillRect((t.x+COLS/2)*k-1.2,(t.z+ROWS/2)*k-1.2,2.4,2.4); }
  // camera viewport
  const vw=cam.dist*0.95*k, vh=cam.dist*0.7*k;
  mctx.strokeStyle='rgba(255,255,255,.55)'; mctx.lineWidth=1.5;
  mctx.strokeRect((cam.tx+COLS/2)*k-vw/2,(cam.tz+ROWS/2)*k-vh/2,vw,vh);
}
mini.addEventListener('pointerdown',e=>{
  e.stopPropagation();
  const rc=mini.getBoundingClientRect();
  cam.tx=clamp(((e.clientX-rc.left)/rc.width)*COLS-COLS/2,-COLS/2,COLS/2);
  cam.tz=clamp(((e.clientY-rc.top)/rc.height)*ROWS-ROWS/2,-ROWS/2,ROWS/2);
  panVX=panVZ=0;
});

// ---------- buttons / flow ----------
$('waveBtn').addEventListener('click',()=>startWave(true));
$('pauseBtn').addEventListener('click',()=>{ G.paused=!G.paused; $('pauseBtn').textContent=G.paused?'▶︎':'⏸︎'; });
$('speedBtn').addEventListener('click',()=>{ G.speed=G.speed===1?2:G.speed===2?3:1; $('speedBtn').textContent=G.speed+'×'; });
function gameOver(){
  G.over=true; G.running=false;
  const best=loadBest();
  const isNew=G.wave>(best.wave||0)||(G.wave===(best.wave||0)&&G.score>(best.score||0));
  if(isNew)saveBest({wave:G.wave,score:G.score,kills:G.kills});
  $('endTitle').textContent=isNew?'Neuer Rekord!':'Ragnarök';
  $('endSub').textContent='Das Langhaus fiel in Welle '+G.wave+' · '+G.kills+' Feinde besiegt · '+Math.floor(G.score)+' Punkte';
  $('endScreen').classList.remove('hidden');
  sfx('over'); vib([60,40,60,40,120]);
  clearSave();
}
function startGame(){
  clearScene3D(); clearSave();
  newGame(); buildBoard(); buildRow(); updateHUD();
  updateOwnedRunes(); updateWeatherChip(); initAudio();
  cam.tx=tw(G.base.c)-5; cam.tz=0; cam.dist=13; cam.targetDist=13;
  mini.style.display='block'; drawMinimap();
  G.running=true;
  $('startScreen').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('runeScreen').classList.add('hidden');
  banner('Tippe auf die Karte und platziere dein Langhaus');
}
$('playBtn').addEventListener('click',startGame);
$('againBtn').addEventListener('click',startGame);

// ---------- main loop ----------
let last=performance.now(),fa=0,fn=0,hudTick=0;
function loop(now){
  let dt=(now-last)/1000; last=now; if(dt>0.05)dt=0.05;
  fa+=dt; fn++;
  if(fa>=0.5){ $('fps').textContent=Math.round(fn/fa)+' FPS'; fa=0; fn=0; }
  const secs=now/1000;
  if(G&&G.running&&!G.paused&&!G.over){
    for(let s=0;s<G.speed;s++){
      if(G.waveActive&&G.spawnQueue.length){ G.spawnTimer-=dt;
        if(G.spawnTimer<=0){ spawnEnemy(G.spawnQueue.shift()); G.spawnTimer=0.55; } }
      updateEnemies(dt); updateTowers(dt,secs); updateBullets(dt);
      updateWorkers(dt); updateMines(dt); updateTroops(dt);
    }
    updateTimedFx(dt*G.speed);
    updateWeatherPts(dt);
    if(G.waveActive&&!G.awaitingRune){
      G.eventTimer+=dt*G.speed;
      if(G.eventTimer>=G.nextEventAt&&(G.enemies.some(e=>!e.dead)||G.spawnQueue.length)){
        triggerEvent(); G.eventTimer=0; G.nextEventAt=12+Math.random()*7;
      }
    }
    // real-time pacing: next wave auto-starts after the build phase
    if(!G.waveActive&&!G.awaitingRune&&G.basePlaced){
      G.buildTimer-=dt*G.speed;
      if(G.buildTimer<=0) startWave(false);
    }
    // research progress
    tickResearch(dt*G.speed);
    // minimap refresh
    miniTick+=dt;
    if(miniTick>=0.35){ miniTick=0; drawMinimap(); }
    // live wave-button countdown
    hudTick+=dt;
    if(hudTick>=0.25){ hudTick=0;
      const wb=$('waveBtn');
      if(!G.basePlaced){ wb.disabled=true; wb.textContent='Langhaus platzieren…'; }
      else if(G.waveActive){ wb.disabled=true; wb.textContent='Welle '+G.wave+' läuft…'; }
      else { wb.disabled=false; wb.textContent='Welle '+(G.wave+1)+' in '+Math.max(0,Math.ceil(G.buildTimer))+'s · Jetzt!'; }
    }
  }
  if(spawnRing){ spawnRing.rotation.z=secs*1.5; spawnRing.scale.setScalar(1+Math.sin(secs*3)*0.08); }
  if(baseGroup) baseGroup.rotation.y=Math.sin(secs*0.6)*0.04;
  updateBursts(dt);
  updateArcs(dt);
  updateDayNight(dt);
  updateCameraSmooth(dt);
  updateCamera();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

// boot
try{
  loadSettings();
  initThree();
  newGame(); buildBoard(); buildRow(); updateHUD(); updateCamera();
  updateResumeBtn(); showBest();
  requestAnimationFrame(loop);
}catch(err){
  document.body.innerHTML='<div style="padding:40px;text-align:center;font-family:system-ui;color:#eaf2f7">'+
    '<h2>WebGL nicht verfügbar</h2><p>Dein Browser unterstützt kein WebGL. '+
    '<a style="color:#4ade80" href="../index.html">Zur 2D-Version</a></p></div>';
  console.error(err);
}
