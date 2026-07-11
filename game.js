/* ============================================================
   YGGDRASIL DEFENSE — Mobile Edition
   Core vertical slice: Module 01–08 (map, touch, resources,
   buildings, A-star flow-field pathing, enemies+waves, towers).
   Single-file engine, Canvas2D, PWA-ready.
   ============================================================ */
'use strict';

// ---------- Canvas & DPR ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let DPR = 1, VW = 0, VH = 0;

function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------- Constants ----------
const TS = 46;                 // tile size in world units
const COLS = 22, ROWS = 22;    // grid
const WORLD_W = COLS * TS, WORLD_H = ROWS * TS;
const T_GROUND = 0, T_TOWER = 1, T_BLOCK = 2, T_SPAWN = 3, T_BASE = 4;

// ---------- Tower definitions ----------
const TOWERS = {
  einherjar:{ name:'Einherjar', em:'🏹', cost:60,  color:'#8fd6a0', range:2.6, dmg:14, rate:0.55, bullet:'#d7ffe4', bspeed:520, unlock:0 },
  runestein:{ name:'Runestein',  em:'ᛟ',  cost:85,  color:'#7db8ff', range:2.4, dmg:7,  rate:0.9,  bullet:'#bcd8ff', bspeed:420, slow:0.45, slowT:1.4, unlock:0 },
  walkure:{   name:'Walküre',    em:'⚡', cost:120, color:'#ffe27a', range:2.3, dmg:9,  rate:0.16, bullet:'#fff2b0', bspeed:640, unlock:2 },
  mjolnir:{   name:'Mjölnir',    em:'🔨', cost:160, color:'#ff9d5a', range:2.5, dmg:34, rate:1.25, bullet:'#ffd0a0', bspeed:480, splash:1.4, unlock:4 },
  bifrost:{   name:'Bifröst',    em:'🌈', cost:210, color:'#c88fff', range:5.2, dmg:80, rate:1.9,  bullet:'#f0d8ff', bspeed:900, unlock:6 },
};
const TOWER_KEYS = Object.keys(TOWERS);

// ---------- Enemy definitions ----------
const ENEMIES = {
  draugr:   { name:'Draugr',      em:'🧟', hp:34,  speed:34, reward:6,  color:'#9fb3a0', r:11 },
  berserker:{ name:'Berserker',   em:'🪓', hp:26,  speed:62, reward:7,  color:'#e08a6a', r:10 },
  troll:    { name:'Troll',       em:'👹', hp:150, speed:22, reward:16, color:'#7a9d6a', r:15 },
  helhound: { name:'Helhound',    em:'🐺', hp:16,  speed:88, reward:5,  color:'#b58fd0', r:9 },
  jormun:   { name:'Jörmungandr', em:'🐉', hp:900, speed:26, reward:120,color:'#5ad0c0', r:22, boss:true },
};

// ---------- Difficulty (Module 17 core) ----------
const DIFFS = {
  easy:     { label:'Leicht',   hp:0.8,  gold:1.2, lives:26 },
  normal:   { label:'Normal',   hp:1.0,  gold:1.0, lives:20 },
  ragnarok: { label:'Ragnarök', hp:1.4,  gold:0.9, lives:12 },
};
let selDiff = 'normal';

// ---------- Weather (Module 12) ----------  rate = cooldown mult (>1 slower)
const WEATHERS = {
  clear:  { name:'Klar',            em:'☀️', dmg:1,    rate:1,    espd:1,    ehp:1,   desc:'Ruhiges Wetter.' },
  frost:  { name:'Frost',           em:'❄️', dmg:1,    rate:1,    espd:0.8,  ehp:1,   desc:'Feinde sind spürbar verlangsamt.' },
  storm:  { name:'Sturm',           em:'🌧️', dmg:1,    rate:1.14, espd:1.12, ehp:1,   desc:'Türme feuern langsamer, Feinde schneller.' },
  ash:    { name:'Aschewolke',      em:'🌋', dmg:1,    rate:1,    espd:1,    ehp:1.22,desc:'Feinde sind deutlich zäher.' },
  divine: { name:'Göttliches Licht',em:'🌟', dmg:1.25, rate:1,    espd:1,    ehp:1,   desc:'Türme richten +25% Schaden an.' },
};
function rollWeather(){
  if(G.wave<=1) return 'clear';
  const r=Math.random();
  if(r<0.42) return 'clear';
  if(r<0.60) return 'frost';
  if(r<0.76) return 'storm';
  if(r<0.90) return 'ash';
  return 'divine';
}

// ---------- Mid-wave events (Module 12) ----------
const EVENTS = [
  { em:'🪙', msg:'Goldader entdeckt! +80 Gold', run:()=>{ G.gold+=80; G.goldEarned+=80; } },
  { em:'☄️', msg:'Meteorschlag trifft alle Feinde!', run:()=>{ const d=28+G.wave*4; for(const e of G.enemies){ if(!e.dead){ spawnBurst(e.x,e.y,'#ff9d5a',6); damage(e,d,null);} } } },
  { em:'🌿', msg:'Weltenbaum heilt · +3 Leben', run:()=>{ G.lives=Math.min(30,G.lives+3); } },
  { em:'🎶', msg:'Bragis Lied · Türme +30% Feuerrate (8s)', run:()=>{ G.fx.rateMul=0.7; G.fx.rateT=8; } },
  { em:'🌫️', msg:'Nebelschwaden · Feinde +25% Tempo (6s)', run:()=>{ G.fx.espdMul=1.25; G.fx.espdT=6; } },
  { em:'⚒️', msg:'Runenschub · +4% Schaden dauerhaft', run:()=>{ G.mods.dmg*=1.04; } },
  { em:'👹', msg:'Überfall! Zusätzliche Feinde nahen', run:()=>{ const n=3+Math.floor(G.wave/2); for(let k=0;k<n;k++) G.spawnQueue.push(Math.random()<0.5?'berserker':'draugr'); } },
  { em:'💰', msg:'Händlerkarawane · +15% Gold-Zins jetzt', run:()=>{ const g=Math.round(G.gold*0.15); G.gold+=g; G.goldEarned+=g; } },
  { em:'🔥', msg:'Muspelheim-Glut · Türme +20% Schaden (10s)', run:()=>{ G.fx.dmgMul=1.2; G.fx.dmgT=10; } },
  { em:'🧊', msg:'Frostbann · Alle Feinde kurz verlangsamt', run:()=>{ for(const e of G.enemies){ if(!e.dead){ e.slow=0.5; e.slowT=3; } } } },
  { em:'⚡', msg:'Thors Zorn · trifft die stärksten Feinde', run:()=>{ const s=[...G.enemies].filter(e=>!e.dead).sort((a,b)=>b.hp-a.hp).slice(0,3); for(const e of s){ spawnBurst(e.x,e.y,'#fff2b0',8); damage(e,60+G.wave*6,null);} } },
  { em:'🌾', msg:'Reiche Ernte · +50 Gold', run:()=>{ G.gold+=50; G.goldEarned+=50; } },
  { em:'🛡️', msg:'Odins Schutz · Langhaus +2 Leben', run:()=>{ G.lives=Math.min(30,G.lives+2); } },
  { em:'🐗', msg:'Wildes Getier · Feinde +18% Tempo (5s)', run:()=>{ G.fx.espdMul=1.18; G.fx.espdT=5; } },
];

// ---------- Game state ----------
let G;
function newGame(){
  const diff = DIFFS[selDiff] || DIFFS.normal;
  G = {
    diff, diffKey: selDiff,
    grid: new Uint8Array(COLS*ROWS),   // tile type
    tower: new Array(COLS*ROWS).fill(null),
    dist: new Int32Array(COLS*ROWS),   // flow-field distance to base
    flow: new Int8Array(COLS*ROWS*2),  // flow direction per tile (dx,dy)
    enemies: [], bullets: [], particles: [], floaters: [], wparticles: [],
    weather: WEATHERS.clear, weatherKey:'clear',
    fx: { rateMul:1, rateT:0, espdMul:1, espdT:0, dmgMul:1, dmgT:0 },
    eventTimer: 0, nextEventAt: 13,
    gold: 230, lives: diff.lives, wave: 0, score: 0, kills: 0, goldEarned: 230,
    spawn: {c:0, r:(ROWS>>1)}, base: {c:COLS-1, r:(ROWS>>1)},
    selected: 'einherjar',      // tower type to build
    inspect: null,              // tower being inspected
    waveActive: false, spawnQueue: [], spawnTimer: 0,
    running: false, paused: false, speed: 1, over: false,
    awaitingRune: false,
    mods: { dmg:1, range:1, rate:1, gold:1, sell:0.6, discount:1, interest:0, splash:0, slow:0, slowT:0.8 },
    runes: {},   // name -> count
    cam: { x:0, y:0, scale:1, min:0.55, max:2.2 },
  };
  buildMap();
  computeFlow();
  centerCam();
}

function towerCost(key){ return Math.round(TOWERS[key].cost * G.mods.discount); }
function idx(c,r){ return r*COLS + c; }
function inBounds(c,r){ return c>=0 && c<COLS && r>=0 && r<ROWS; }

function buildMap(){
  G.grid.fill(T_GROUND);
  // border blocks (except spawn/base openings)
  for(let c=0;c<COLS;c++){ G.grid[idx(c,0)]=T_BLOCK; G.grid[idx(c,ROWS-1)]=T_BLOCK; }
  for(let r=0;r<ROWS;r++){ G.grid[idx(0,r)]=T_BLOCK; G.grid[idx(COLS-1,r)]=T_BLOCK; }
  G.grid[idx(G.spawn.c,G.spawn.r)] = T_SPAWN;
  G.grid[idx(G.base.c,G.base.r)]  = T_BASE;
  // a few decorative immovable rocks to shape the field
  const rocks = [[6,6],[6,7],[15,15],[15,14],[11,4],[10,17]];
  for(const [c,r] of rocks){ if(passableType(c,r)) G.grid[idx(c,r)] = T_BLOCK; }
}
function passableType(c,r){
  const t = G.grid[idx(c,r)];
  return t===T_GROUND;
}

// ---------- Flow field (BFS from base) ----------
function tileWalkable(c,r){
  if(!inBounds(c,r)) return false;
  const t = G.grid[idx(c,r)];
  return t===T_GROUND || t===T_SPAWN || t===T_BASE;
}
function computeFlow(){
  const dist = G.dist; dist.fill(-1);
  const q = []; let qi = 0;
  const b = idx(G.base.c,G.base.r);
  dist[b] = 0; q.push(b);
  const N4 = [[1,0],[-1,0],[0,1],[0,-1]];
  while(qi < q.length){
    const cur = q[qi++]; const cc = cur%COLS, cr = (cur/COLS)|0;
    for(const [dc,dr] of N4){
      const nc=cc+dc, nr=cr+dr;
      if(!tileWalkable(nc,nr)) continue;
      const ni = idx(nc,nr);
      if(dist[ni]!==-1) continue;
      dist[ni] = dist[cur]+1;
      q.push(ni);
    }
  }
  // build per-tile flow direction toward lowest-dist neighbour
  const flow = G.flow;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const i = idx(c,r);
    flow[i*2]=0; flow[i*2+1]=0;
    if(dist[i]<=0) continue;
    let best=dist[i], bdx=0, bdy=0;
    for(const [dc,dr] of N4){
      const nc=c+dc, nr=r+dr;
      if(!tileWalkable(nc,nr)) continue;
      const nd=dist[idx(nc,nr)];
      if(nd!==-1 && nd<best){ best=nd; bdx=dc; bdy=dr; }
    }
    flow[i*2]=bdx; flow[i*2+1]=bdy;
  }
}
// returns true if every spawn can still reach base
function pathExists(){
  return G.dist[idx(G.spawn.c,G.spawn.r)] >= 0;
}

// ---------- Camera ----------
function centerCam(){
  const fit = Math.min(VW/WORLD_W, VH/WORLD_H);
  G.cam.min = fit * 0.92;            // allow zooming out to see the whole board
  G.cam.max = Math.max(2.2, fit*3);
  G.cam.scale = clamp(fit * 0.98, G.cam.min, G.cam.max);
  G.cam.x = (WORLD_W - VW/G.cam.scale)/2;
  G.cam.y = (WORLD_H - VH/G.cam.scale)/2;
  clampCam();
}
function clampCam(){
  const cam=G.cam;
  const viewW = VW/cam.scale, viewH = VH/cam.scale;
  const marginX = Math.max(0,(viewW-WORLD_W)/2), marginY = Math.max(0,(viewH-WORLD_H)/2);
  cam.x = clamp(cam.x, -marginX-40, WORLD_W-viewW+marginX+40);
  cam.y = clamp(cam.y, -marginY-90, WORLD_H-viewH+marginY+120);
}
function screenToWorld(sx,sy){ return { x: G.cam.x + sx/G.cam.scale, y: G.cam.y + sy/G.cam.scale }; }
function worldToScreen(wx,wy){ return { x:(wx-G.cam.x)*G.cam.scale, y:(wy-G.cam.y)*G.cam.scale }; }
function tileCenter(c,r){ return { x:c*TS+TS/2, y:r*TS+TS/2 }; }

// ---------- Utils ----------
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function dist2(ax,ay,bx,by){ const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy; }
function fmt(n){ n=Math.floor(n); return n>=10000?(n/1000).toFixed(1)+'k':n>=1000?(n/1000).toFixed(2)+'k':''+n; }

// ============================================================
//  INPUT — pointer gestures (tap / pan / pinch)
// ============================================================
const pointers = new Map();
let panMoved = false, downTime = 0, downX = 0, downY = 0, pinchDist = 0, pinchScale = 1;
const TAP_MOVE = 12, TAP_TIME = 320;

canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pointers.size===1){ panMoved=false; downTime=performance.now(); downX=e.clientX; downY=e.clientY; }
  else if(pointers.size===2){
    const p=[...pointers.values()];
    pinchDist = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y) || 1;
    pinchScale = G.cam.scale; panMoved=true;
  }
});
canvas.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const nx=e.clientX, ny=e.clientY;
  if(pointers.size===2){
    const p=[...pointers.values()];
    // pinch zoom around midpoint
    const d = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y) || 1;
    const midX=(p[0].x+p[1].x)/2, midY=(p[0].y+p[1].y)/2;
    const wBefore = screenToWorld(midX,midY);
    G.cam.scale = clamp(pinchScale * (d/pinchDist), G.cam.min, G.cam.max);
    const wAfter = screenToWorld(midX,midY);
    G.cam.x += wBefore.x - wAfter.x; G.cam.y += wBefore.y - wAfter.y;
    // two-finger pan
    G.cam.x -= (nx-prev.x)/G.cam.scale/2; G.cam.y -= (ny-prev.y)/G.cam.scale/2;
    clampCam();
  } else if(pointers.size===1){
    const mvd = Math.hypot(nx-downX, ny-downY);
    if(mvd>TAP_MOVE) panMoved=true;
    if(panMoved){
      G.cam.x -= (nx-prev.x)/G.cam.scale;
      G.cam.y -= (ny-prev.y)/G.cam.scale;
      clampCam();
    }
  }
  pointers.set(e.pointerId, {x:nx,y:ny});
});
function endPointer(e){
  if(pointers.size===1 && !panMoved && (performance.now()-downTime)<TAP_TIME){
    handleTap(e.clientX, e.clientY);
  }
  pointers.delete(e.pointerId);
  if(pointers.size<2) pinchDist=0;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e=>pointers.delete(e.pointerId));

// desktop wheel zoom
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  const wBefore = screenToWorld(e.clientX,e.clientY);
  G.cam.scale = clamp(G.cam.scale * (e.deltaY<0?1.12:0.9), G.cam.min, G.cam.max);
  const wAfter = screenToWorld(e.clientX,e.clientY);
  G.cam.x += wBefore.x-wAfter.x; G.cam.y += wBefore.y-wAfter.y; clampCam();
},{passive:false});

// ---------- Tap logic: build / inspect ----------
function handleTap(sx,sy){
  if(!G.running || G.over) return;
  const w = screenToWorld(sx,sy);
  const c = Math.floor(w.x/TS), r = Math.floor(w.y/TS);
  if(!inBounds(c,r)) { closeSheet(); return; }
  const i = idx(c,r);
  // tapped an existing tower -> inspect
  if(G.grid[i]===T_TOWER && G.tower[i]){ openSheet(G.tower[i]); return; }
  // otherwise attempt build
  closeSheet();
  tryBuild(c,r);
}

function tryBuild(c,r){
  const i = idx(c,r);
  if(G.grid[i]!==T_GROUND){ buzz(); banner('Hier kann nicht gebaut werden'); return; }
  const def = TOWERS[G.selected];
  const cost = towerCost(G.selected);
  if(G.wave < def.unlock){ buzz(); banner(def.name+' ab Welle '+def.unlock); return; }
  if(G.gold < cost){ buzz(); banner('Nicht genug Gold'); return; }
  // tentatively block & verify path still exists
  G.grid[i] = T_TOWER;
  computeFlow();
  if(!pathExists()){
    G.grid[i] = T_GROUND; computeFlow();
    buzz(); banner('Das würde den Pfad blockieren!');
    return;
  }
  // commit
  G.gold -= cost;
  G.tower[i] = {
    key:G.selected, c, r, x:c*TS+TS/2, y:r*TS+TS/2,
    def, level:1, dmg:def.dmg, range:def.range*TS, rate:def.rate, cd:0,
    target:'first', invested:cost, angle:-Math.PI/2, flash:0,
  };
  vibrate(15); spawnBurst(G.tower[i].x, G.tower[i].y, def.color, 8);
  updateHUD();
}

// ============================================================
//  ENEMIES & WAVES
// ============================================================
function waveComposition(n){
  const q=[]; const push=(k,cnt)=>{ for(let x=0;x<cnt;x++) q.push(k); };
  if(n%5===0){ // boss wave
    push('draugr', 6+n); push('troll', Math.floor(n/5));
    q.push('jormun');
    return q;
  }
  push('draugr', 5 + n*2);
  if(n>=2) push('berserker', 2 + n);
  if(n>=3) push('helhound', 2 + Math.floor(n*1.3));
  if(n>=4) push('troll', Math.floor(n/2));
  // shuffle a bit
  for(let i=q.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [q[i],q[j]]=[q[j],q[i]]; }
  return q;
}
function hpScale(n){ return 1 + (n-1)*0.22 + Math.pow(n,1.35)*0.02; }

function startWave(){
  if(G.waveActive || G.over) return;
  G.wave++;
  G.spawnQueue = waveComposition(G.wave);
  G.spawnTimer = 0;
  G.waveActive = true;
  // weather
  G.weatherKey = rollWeather(); G.weather = WEATHERS[G.weatherKey];
  updateWeatherChip();
  // events
  G.eventTimer = 0; G.nextEventAt = 11 + Math.random()*6;
  refreshTowerRow();
  const wtxt = G.weatherKey!=='clear' ? ' · '+G.weather.em+' '+G.weather.name : '';
  banner('Welle '+G.wave+' — '+(G.wave%5===0?'⚠️ BOSS':G.spawnQueue.length+' Feinde')+wtxt);
  vibrate(20);
  updateHUD();
}
function spawnEnemy(key){
  const d = ENEMIES[key];
  const s = tileCenter(G.spawn.c,G.spawn.r);
  const sc = hpScale(G.wave) * G.diff.hp * G.weather.ehp;
  const hp = Math.round(d.hp*sc);
  G.enemies.push({
    key, def:d, x:s.x, y:s.y+(Math.random()*16-8), r:d.r,
    hp, maxhp:hp, speed:d.speed*(0.92+Math.random()*0.16), baseSpeed:d.speed,
    reward:d.reward, slow:0, slowT:0, dead:false, reachedBase:false, boss:!!d.boss,
  });
}

function updateEnemies(dt){
  for(const e of G.enemies){
    if(e.dead) continue;
    // slow timer
    if(e.slowT>0){ e.slowT-=dt; if(e.slowT<=0) e.slow=0; }
    const spd = e.baseSpeed*(1-e.slow)*G.weather.espd*G.fx.espdMul;
    const c = clamp(Math.floor(e.x/TS),0,COLS-1), r = clamp(Math.floor(e.y/TS),0,ROWS-1);
    const i = idx(c,r);
    // base reached?
    if(c===G.base.c && r===G.base.r){ e.reachedBase=true; e.dead=true; onBaseHit(e); continue; }
    let fx = G.flow[i*2], fy = G.flow[i*2+1];
    const center = tileCenter(c,r);
    if(fx===0 && fy===0){
      // fallback: head straight toward base
      const b = tileCenter(G.base.c,G.base.r);
      fx = b.x-e.x; fy=b.y-e.y;
    } else {
      // steer toward the boundary of next tile, blended with tile-centering to avoid clipping towers
      const tx = center.x + fx*TS*0.55, ty = center.y + fy*TS*0.55;
      fx = tx - e.x; fy = ty - e.y;
    }
    const len = Math.hypot(fx,fy)||1;
    e.x += (fx/len)*spd*dt;
    e.y += (fy/len)*spd*dt;
  }
  // cull
  if(G.enemies.length){
    G.enemies = G.enemies.filter(e=>!e.dead);
  }
  // wave end check
  if(G.waveActive && G.spawnQueue.length===0 && G.enemies.length===0){
    endWave();
  }
}
function onBaseHit(e){
  const dmg = e.boss?5:1;
  G.lives -= dmg;
  spawnBurst(tileCenter(G.base.c,G.base.r).x, tileCenter(G.base.c,G.base.r).y, '#ff5a52', 14);
  flashScreen();
  vibrate(e.boss?60:30);
  updateHUD();
  if(G.lives<=0){ G.lives=0; gameOver(); }
}
function endWave(){
  G.waveActive = false;
  let bonus = 30 + G.wave*8;
  if(G.mods.interest>0) bonus += Math.round(G.gold * G.mods.interest);
  G.gold += bonus; G.goldEarned += bonus;
  if(G.mods.baseHeal){ G.lives = Math.min(30, G.lives + G.mods.baseHeal); }
  vibrate(25);
  refreshTowerRow();
  updateHUD();
  // roguelite: offer a rune every wave
  offerRunes(bonus);
}

// ============================================================
//  MODULE 13 — Roguelite runes (between-wave upgrades)
// ============================================================
const RUNES = [
  { id:'berserk',  em:'🪓', name:'Berserkerwut',  rar:'common', desc:'+18% Schaden aller Türme',        apply:m=>m.dmg*=1.18 },
  { id:'eagle',    em:'👁️', name:'Odins Auge',     rar:'common', desc:'+12% Reichweite',                 apply:m=>m.range*=1.12 },
  { id:'swift',    em:'💨', name:'Schnellschuss',  rar:'common', desc:'+14% Feuerrate',                  apply:m=>m.rate*=0.86 },
  { id:'midas',    em:'🪙', name:'Midas-Hand',     rar:'common', desc:'+22% Gold pro Kill',              apply:m=>m.gold*=1.22 },
  { id:'thrift',   em:'🔨', name:'Runenschmied',   rar:'common', desc:'Türme 12% günstiger',             apply:m=>m.discount*=0.88 },
  { id:'heal',     em:'🌿', name:'Yggdrasil-Segen',rar:'rare',   desc:'Langhaus +4 Leben (jetzt & je Welle +1)', apply:m=>{ G.lives=Math.min(30,G.lives+4); m.baseHeal=(m.baseHeal||0)+1; } },
  { id:'interest', em:'📈', name:'Wucherzins',     rar:'rare',   desc:'+6% Gold-Zins pro Welle',         apply:m=>m.interest+=0.06 },
  { id:'frost',    em:'❄️', name:'Frostrunen',     rar:'rare',   desc:'Alle Schüsse verlangsamen (+15%)', apply:m=>{ m.slow=Math.min(0.6,m.slow+0.15); } },
  { id:'power',    em:'⚡', name:'Sturmzorn',      rar:'rare',   desc:'+30% Schaden, +8% Feuerrate',     apply:m=>{ m.dmg*=1.3; m.rate*=0.92; } },
  { id:'sell',     em:'💰', name:'Händlergunst',   rar:'common', desc:'Verkauf gibt 85% zurück',         apply:m=>m.sell=Math.max(m.sell,0.85) },
  { id:'splash',   em:'💥', name:'Splittersegen',  rar:'legendary', desc:'Alle Türme erhalten Flächenschaden', apply:m=>{ m.splash=Math.max(m.splash,1.15); } },
  { id:'fury',     em:'🔥', name:'Blutopfer',      rar:'legendary', desc:'+45% Schaden — aber −2 Leben',    apply:m=>{ m.dmg*=1.45; G.lives=Math.max(1,G.lives-2); } },
  { id:'goldrush', em:'👑', name:'Drachenhort',    rar:'legendary', desc:'+40% Gold & Türme 15% günstiger', apply:m=>{ m.gold*=1.4; m.discount*=0.85; } },
  { id:'divine',   em:'🌈', name:'Bifröst-Gunst',  rar:'legendary', desc:'+20% Schaden, +15% Reichweite, +12% Feuerrate', apply:m=>{ m.dmg*=1.2; m.range*=1.15; m.rate*=0.88; } },
];
function rollRunes(){
  // weighted rarity, boss waves lean rarer
  const boss = G.wave%5===0;
  const pool=[]; for(const r of RUNES){
    let w = r.rar==='common'?10:r.rar==='rare'?4:1.4;
    if(boss){ if(r.rar==='rare') w*=1.6; if(r.rar==='legendary') w*=2.4; }
    pool.push({r,w});
  }
  const pick=[]; const used=new Set();
  while(pick.length<3 && used.size<RUNES.length){
    let tot=0; for(const p of pool){ if(!used.has(p.r.id)) tot+=p.w; }
    let x=Math.random()*tot, chosen=null;
    for(const p of pool){ if(used.has(p.r.id)) continue; x-=p.w; if(x<=0){ chosen=p.r; break; } }
    if(!chosen) break;
    used.add(chosen.id); pick.push(chosen);
  }
  return pick;
}
function offerRunes(bonus){
  const cards = rollRunes();
  const box = $('runeCards'); box.innerHTML='';
  const rarTag={common:'Gewöhnlich',rare:'Selten',legendary:'Legendär'};
  for(const r of cards){
    const el=document.createElement('div');
    el.className='runecard '+r.rar;
    el.innerHTML=`<div class="rc-rar"></div><div class="rc-em">${r.em}</div>
      <div class="rc-nm">${r.name}</div><div class="rc-desc">${r.desc}</div>
      <div class="rc-tag">${rarTag[r.rar]}</div>`;
    el.addEventListener('click',()=>takeRune(r));
    box.appendChild(el);
  }
  $('runeWaveNo').textContent='Welle '+G.wave+' ✓';
  $('runeSub').textContent='+'+bonus+' 🪙 erhalten. Der Weltenbaum gewährt dir eine Rune:';
  G.awaitingRune=true;
  $('runeScreen').classList.remove('hidden');
  banner('');
}
function takeRune(r){
  r.apply(G.mods);
  G.runes[r.id]=(G.runes[r.id]||0)+1;
  vibrate(20);
  closeRunes();
  banner(r.em+' '+r.name+' aktiviert!');
  updateOwnedRunes();
  updateHUD();
}
function closeRunes(){
  G.awaitingRune=false;
  $('runeScreen').classList.add('hidden');
}
function updateOwnedRunes(){
  const el=$('ownedRunes'); if(!el) return;
  const parts=[];
  for(const id in G.runes){ const def=RUNES.find(x=>x.id===id); if(def) parts.push(def.em+(G.runes[id]>1?G.runes[id]:'')); }
  el.textContent=parts.join(' ');
}
document.getElementById('runeSkip').addEventListener('click',()=>{
  G.gold+=40; G.goldEarned+=40; vibrate(10);
  closeRunes(); updateHUD();
});

// ============================================================
//  TOWERS — targeting & shooting
// ============================================================
function effRange(t){ return t.range * G.mods.range; }
function effRate(t){ return t.rate * G.mods.rate * G.weather.rate * G.fx.rateMul; }
function effDmg(t){ return t.dmg * G.mods.dmg * G.weather.dmg * G.fx.dmgMul; }
function goldMul(){ return G.mods.gold * G.diff.gold; }

function updateTowers(dt){
  for(let i=0;i<G.tower.length;i++){
    const t = G.tower[i]; if(!t) continue;
    if(t.flash>0) t.flash-=dt;
    t.cd -= dt;
    const tgt = pickTarget(t);
    if(tgt){
      const ang = Math.atan2(tgt.y-t.y, tgt.x-t.x);
      t.angle += Math.atan2(Math.sin(ang-t.angle), Math.cos(ang-t.angle))*Math.min(1,dt*12);
      if(t.cd<=0){ fire(t,tgt); t.cd = effRate(t); }
    }
  }
}
function pickTarget(t){
  const R = effRange(t), rr = R*R; let best=null, bestScore = t.target==='first'?-Infinity:Infinity;
  for(const e of G.enemies){
    if(e.dead) continue;
    const d = dist2(t.x,t.y,e.x,e.y);
    if(d>rr) continue;
    let score;
    if(t.target==='first') score = G.dist[idx(clamp(Math.floor(e.x/TS),0,COLS-1),clamp(Math.floor(e.y/TS),0,ROWS-1))]*-1;
    else if(t.target==='strong') score = e.hp;
    else score = -e.hp; // weak
    if(t.target==='first'){ if(score>bestScore){bestScore=score;best=e;} }
    else { if(score<bestScore){bestScore=score;best=e;} }
  }
  return best;
}
function fire(t,tgt){
  t.flash = 0.08;
  const def = t.def;
  const splash = Math.max(def.splash?def.splash*TS:0, G.mods.splash*TS);
  const slow = Math.max(def.slow||0, G.mods.slow);
  G.bullets.push({
    x:t.x, y:t.y, tx:tgt.x, ty:tgt.y, target:tgt,
    speed:def.bspeed, dmg:effDmg(t), color:def.bullet,
    splash, slow, slowT:(def.slowT||G.mods.slowT), dead:false,
  });
  if(t.key==='mjolnir') vibrate(8);
}
function updateBullets(dt){
  for(const b of G.bullets){
    if(b.dead) continue;
    // home toward target's current pos
    if(b.target && !b.target.dead){ b.tx=b.target.x; b.ty=b.target.y; }
    const dx=b.tx-b.x, dy=b.ty-b.y, d=Math.hypot(dx,dy)||1;
    const step=b.speed*dt;
    if(d<=step+4){ hitBullet(b); b.dead=true; }
    else { b.x+=dx/d*step; b.y+=dy/d*step; }
  }
  if(G.bullets.length) G.bullets = G.bullets.filter(b=>!b.dead);
}
function hitBullet(b){
  spawnBurst(b.tx,b.ty,b.color,4);
  if(b.splash>0){
    const rr=b.splash*b.splash;
    for(const e of G.enemies){ if(e.dead) continue; if(dist2(b.tx,b.ty,e.x,e.y)<=rr) damage(e,b.dmg,b); }
  } else if(b.target && !b.target.dead){
    damage(b.target,b.dmg,b);
  }
}
function damage(e,dmg,b){
  e.hp -= dmg;
  if(b && b.slow>0){ e.slow=Math.max(e.slow,b.slow); e.slowT=b.slowT; }
  if(e.hp<=0 && !e.dead){
    e.dead=true; G.kills++; G.score += e.boss?250:Math.max(1,Math.round(e.maxhp/6));
    const rw = Math.round(e.reward * goldMul());
    G.gold += rw; G.goldEarned += rw;
    spawnBurst(e.x,e.y,e.def.color,e.boss?26:10);
    floater('+'+rw, e.x, e.y, '#fbbf24');
    if(e.boss){ banner('🐉 Boss besiegt! +'+e.reward+' 🪙'); vibrate(40); }
    updateHUD();
  }
}

// ============================================================
//  PARTICLES / FLOATERS
// ============================================================
function spawnBurst(x,y,color,n){
  for(let k=0;k<n;k++){
    const a=Math.random()*Math.PI*2, s=40+Math.random()*120;
    G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.4+Math.random()*0.3,t:0,color,r:1.5+Math.random()*2});
  }
}
function floater(text,x,y,color){ G.floaters.push({text,x,y,t:0,life:0.9,color}); }
function updateParticles(dt){
  for(const p of G.particles){ p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.92; p.vy*=0.92; }
  G.particles = G.particles.filter(p=>p.t<p.life);
  for(const f of G.floaters){ f.t+=dt; f.y-=26*dt; }
  G.floaters = G.floaters.filter(f=>f.t<f.life);
}

// ============================================================
//  RENDER
// ============================================================
let scrShake=0;
function flashScreen(){ scrShake=8; }
function render(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,VW,VH);
  // biome backdrop
  const g = ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#0c1a26'); g.addColorStop(1,'#070f18');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);

  ctx.save();
  let shx=0, shy=0;
  if(scrShake>0){ shx=(Math.random()*2-1)*scrShake; shy=(Math.random()*2-1)*scrShake; scrShake*=0.85; if(scrShake<0.4)scrShake=0; }
  ctx.translate(shx,shy);
  ctx.scale(G.cam.scale,G.cam.scale);
  ctx.translate(-G.cam.x,-G.cam.y);

  drawTiles();
  drawPathHint();
  drawBase();
  drawTowers();
  drawEnemies();
  drawBullets();
  drawParticles();
  drawPlacementPreview();
  drawWeather();
  drawFloaters();

  ctx.restore();

  // screen-space weather tint
  if(G && G.weatherKey==='ash'){ ctx.fillStyle='rgba(60,40,30,.18)'; ctx.fillRect(0,0,VW,VH); }
  else if(G && G.weatherKey==='divine'){ ctx.fillStyle='rgba(255,230,150,.06)'; ctx.fillRect(0,0,VW,VH); }
  else if(G && G.weatherKey==='storm'){ ctx.fillStyle='rgba(20,30,50,.14)'; ctx.fillRect(0,0,VW,VH); }
}

function drawTiles(){
  // visible range
  const x0=Math.max(0,Math.floor(G.cam.x/TS)), y0=Math.max(0,Math.floor(G.cam.y/TS));
  const x1=Math.min(COLS-1,Math.ceil((G.cam.x+VW/G.cam.scale)/TS)), y1=Math.min(ROWS-1,Math.ceil((G.cam.y+VH/G.cam.scale)/TS));
  for(let r=y0;r<=y1;r++) for(let c=x0;c<=x1;c++){
    const t=G.grid[idx(c,r)];
    const x=c*TS,y=r*TS;
    if(t===T_BLOCK){ ctx.fillStyle='#20303c'; ctx.fillRect(x,y,TS,TS);
      ctx.fillStyle='rgba(90,120,140,.25)'; ctx.fillRect(x+6,y+6,TS-12,TS-12); }
    else {
      ctx.fillStyle=((c+r)&1)?'#12232f':'#0f1e29';
      ctx.fillRect(x,y,TS,TS);
    }
    ctx.strokeStyle='rgba(80,130,160,.08)'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,TS,TS);
  }
  // spawn portal
  const s=tileCenter(G.spawn.c,G.spawn.r);
  ctx.fillStyle='rgba(255,90,82,.18)'; ctx.beginPath(); ctx.arc(s.x,s.y,TS*0.42,0,7); ctx.fill();
  ctx.fillStyle='#ff5a52'; ctx.font='bold 22px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('☠︎', s.x, s.y);
}
function drawPathHint(){
  // faint dots along descending distance from spawn
  let c=G.spawn.c, r=G.spawn.r, guard=0;
  ctx.fillStyle='rgba(120,200,160,.14)';
  while(!(c===G.base.c&&r===G.base.r) && guard++<400){
    const i=idx(c,r); const dx=G.flow[i*2], dy=G.flow[i*2+1];
    if(dx===0&&dy===0) break;
    const p=tileCenter(c,r);
    ctx.beginPath(); ctx.arc(p.x,p.y,3,0,7); ctx.fill();
    c+=dx; r+=dy;
  }
}
function drawBase(){
  const b=tileCenter(G.base.c,G.base.r);
  ctx.fillStyle='rgba(74,222,128,.16)'; ctx.beginPath(); ctx.arc(b.x,b.y,TS*0.5,0,7); ctx.fill();
  ctx.fillStyle='#4ade80'; ctx.font='bold 26px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('🏰', b.x, b.y);
  // health ring
  const frac=clamp(G.lives/20,0,1);
  ctx.strokeStyle='rgba(255,90,82,.4)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(b.x,b.y,TS*0.55,0,7); ctx.stroke();
  ctx.strokeStyle='#4ade80'; ctx.beginPath(); ctx.arc(b.x,b.y,TS*0.55,-Math.PI/2,-Math.PI/2+frac*Math.PI*2); ctx.stroke();
}
function drawTowers(){
  for(const t of G.tower){
    if(!t) continue;
    const inspecting = G.inspect===t;
    if(inspecting){
      ctx.fillStyle='rgba(74,222,128,.08)'; ctx.strokeStyle='rgba(74,222,128,.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(t.x,t.y,effRange(t),0,7); ctx.fill(); ctx.stroke();
    }
    // base pad
    ctx.fillStyle=t.def.color+'22'; ctx.strokeStyle=t.def.color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(t.x,t.y,TS*0.4,0,7); ctx.fill(); ctx.stroke();
    if(t.flash>0){ ctx.fillStyle=t.def.color+'66'; ctx.beginPath(); ctx.arc(t.x,t.y,TS*0.46,0,7); ctx.fill(); }
    // barrel
    ctx.save(); ctx.translate(t.x,t.y); ctx.rotate(t.angle);
    ctx.fillStyle=t.def.color; ctx.fillRect(0,-3,TS*0.4,6); ctx.restore();
    // emblem
    ctx.font='bold 18px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff'; ctx.fillText(t.def.em, t.x, t.y);
    // level pips
    if(t.level>1){ ctx.fillStyle=t.def.color; ctx.font='bold 9px system-ui';
      ctx.fillText('★'.repeat(Math.min(t.level-1,3)), t.x, t.y+TS*0.34); }
  }
}
function drawEnemies(){
  for(const e of G.enemies){
    // hp bar
    const w=e.r*2.1, hpf=clamp(e.hp/e.maxhp,0,1);
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(e.x-w/2,e.y-e.r-8,w,4);
    ctx.fillStyle=e.boss?'#ff5a52':(hpf>0.5?'#4ade80':hpf>0.25?'#fbbf24':'#ff5a52');
    ctx.fillRect(e.x-w/2,e.y-e.r-8,w*hpf,4);
    // body
    ctx.fillStyle=e.def.color; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.fill();
    if(e.slow>0){ ctx.strokeStyle='#7db8ff'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+2,0,7); ctx.stroke(); }
    ctx.font=(e.boss?'bold 26px':'bold 15px')+' system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff'; ctx.fillText(e.def.em,e.x,e.y);
  }
}
function drawBullets(){
  for(const b of G.bullets){
    ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.splash>0?5:3.2,0,7); ctx.fill();
    if(b.splash>0){ ctx.strokeStyle=b.color+'99'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(b.x,b.y,7,0,7); ctx.stroke(); }
  }
}
function drawParticles(){
  for(const p of G.particles){ const a=1-p.t/p.life; ctx.globalAlpha=a; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
  ctx.globalAlpha=1;
}
function drawFloaters(){
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold 14px system-ui';
  for(const f of G.floaters){ ctx.globalAlpha=1-f.t/f.life; ctx.fillStyle=f.color; ctx.fillText(f.text,f.x,f.y); }
  ctx.globalAlpha=1;
}
function drawPlacementPreview(){
  // show ghost under a held single pointer while building? keep light: highlight tile under last tap-less hover on desktop
  if(pointers.size!==0 || G.over) return;
}

// ============================================================
//  HUD wiring
// ============================================================
const $ = id=>document.getElementById(id);
function updateHUD(){
  $('uiGold').textContent = fmt(G.gold);
  $('uiLife').textContent = G.lives;
  $('uiWave').textContent = G.wave;
  $('uiScore').textContent = fmt(G.score);
  const wb=$('waveBtn');
  wb.disabled = G.waveActive;
  wb.innerHTML = G.waveActive ? '⚔️ Welle '+G.wave+'…' : '▶︎ Welle '+(G.wave+1);
  // update tower affordability
  document.querySelectorAll('.twr').forEach(el=>{
    const k=el.dataset.k, def=TOWERS[k];
    const c=towerCost(k);
    const locked=G.wave<def.unlock;
    el.classList.toggle('locked', locked || G.gold<c);
    const cost=el.querySelector('.cost');
    if(cost){ if(!locked) cost.textContent=c+'🪙'; cost.classList.toggle('na', G.gold<c && !locked); }
  });
}
function buildTowerRow(){
  const row=$('towerRow'); row.innerHTML='';
  for(const k of TOWER_KEYS){
    const def=TOWERS[k];
    const el=document.createElement('div');
    el.className='twr'+(k===G.selected?' sel':'');
    el.dataset.k=k;
    el.innerHTML=`<div class="em">${def.em}</div><div class="nm">${def.name}</div><div class="cost">${def.cost}🪙</div>`;
    el.addEventListener('click',()=>{
      if(G.wave<def.unlock){ banner(def.name+' ab Welle '+def.unlock); buzz(); return; }
      G.selected=k; document.querySelectorAll('.twr').forEach(x=>x.classList.toggle('sel',x.dataset.k===k));
      vibrate(8); closeSheet();
    });
    row.appendChild(el);
  }
  updateHUD();
}
function refreshTowerRow(){
  document.querySelectorAll('.twr').forEach(el=>{
    const def=TOWERS[el.dataset.k];
    const nm=el.querySelector('.nm');
    if(G.wave<def.unlock){ nm.textContent='Welle '+def.unlock; }
    else nm.textContent=def.name;
  });
  updateHUD();
}

// ---- inspector sheet ----
function openSheet(t){
  G.inspect=t;
  $('shEm').textContent=t.def.em;
  $('shNm').textContent=t.def.name;
  $('shLv').textContent='Stufe '+t.level;
  $('shDmg').textContent=Math.round(effDmg(t));
  $('shRng').textContent=(effRange(t)/TS).toFixed(1);
  $('shRate').textContent=(1/effRate(t)).toFixed(1)+'/s';
  $('shTgt').textContent=t.target==='first'?'Erster':t.target==='strong'?'Stärkster':'Schwächster';
  const upCost=upgradeCost(t);
  $('shUpBtn').innerHTML='⬆️ Stufe '+(t.level+1)+' · '+upCost+'🪙';
  $('shUpBtn').disabled = G.gold<upCost || t.level>=4;
  if(t.level>=4) $('shUpBtn').innerHTML='★ Max';
  $('shSellBtn').innerHTML='💰 '+Math.floor(t.invested*G.mods.sell)+'🪙';
  $('sheet').classList.add('show');
}
function closeSheet(){ G.inspect=null; $('sheet').classList.remove('show'); }
function upgradeCost(t){ return Math.round(t.def.cost*0.8*t.level); }
$('shUpBtn').addEventListener('click',()=>{
  const t=G.inspect; if(!t||t.level>=4) return;
  const cost=upgradeCost(t);
  if(G.gold<cost){ buzz(); return; }
  G.gold-=cost; t.level++;
  t.dmg=Math.round(t.dmg*1.6); t.range*=1.08; t.rate*=0.9;
  spawnBurst(t.x,t.y,t.def.color,12); vibrate(15);
  openSheet(t); updateHUD();
});
$('shTargetBtn').addEventListener('click',()=>{
  const t=G.inspect; if(!t) return;
  t.target = t.target==='first'?'strong':t.target==='strong'?'weak':'first';
  vibrate(8); openSheet(t);
});
$('shSellBtn').addEventListener('click',()=>{
  const t=G.inspect; if(!t) return;
  G.gold+=Math.floor(t.invested*G.mods.sell);
  const i=idx(t.c,t.r); G.grid[i]=T_GROUND; G.tower[i]=null;
  computeFlow(); spawnBurst(t.x,t.y,'#fbbf24',10); vibrate(15);
  closeSheet(); updateHUD();
});

// ---- action buttons ----
$('waveBtn').addEventListener('click',()=>{ startWave(); });
$('pauseBtn').addEventListener('click',()=>{ G.paused=!G.paused; $('pauseBtn').textContent=G.paused?'▶︎':'⏸︎'; });
$('speedBtn').addEventListener('click',()=>{
  G.speed = G.speed===1?2:G.speed===2?3:1;
  $('speedBtn').textContent=G.speed+'×';
});

// ---- banner / haptics ----
let bannerT=null;
function banner(msg){
  const b=$('banner'); b.textContent=msg; b.classList.add('show');
  clearTimeout(bannerT); bannerT=setTimeout(()=>b.classList.remove('show'),1900);
}
function vibrate(ms){ if(navigator.vibrate) try{navigator.vibrate(ms);}catch(e){} }
function buzz(){ vibrate([10,40,10]); }

// ============================================================
//  START / END
// ============================================================
function loadBest(){ try{ return JSON.parse(localStorage.getItem('ygg_best')||'{}'); }catch(e){ return {}; } }
function saveBest(b){ try{ localStorage.setItem('ygg_best', JSON.stringify(b)); }catch(e){} }
function showBest(){
  const b=loadBest();
  const el=$('bestLine'); if(!el) return;
  el.textContent = b.wave ? ('🏆 Rekord: Welle '+b.wave+' · '+fmt(b.score||0)+' Punkte') : '';
}
function gameOver(){
  G.over=true; G.running=false;
  const best=loadBest();
  const isNew = G.wave>(best.wave||0) || (G.wave===(best.wave||0) && G.score>(best.score||0));
  if(isNew){ saveBest({wave:G.wave, score:G.score, kills:G.kills}); }
  $('endRune').textContent = isNew?'🏆':'☠️';
  $('endTitle').textContent = isNew?'Neuer Rekord!':'Ragnarök';
  $('endSub').textContent = isNew ? ('Bestleistung: Welle '+G.wave+'!') : ('Das Langhaus ist in Welle '+G.wave+' gefallen.');
  $('endWave').textContent=G.wave; $('endScore').textContent=fmt(G.score);
  $('endKills').textContent=G.kills; $('endGold').textContent=fmt(G.goldEarned);
  $('endScreen').classList.remove('hidden');
  vibrate([60,40,60,40,120]);
}
function startGame(){
  newGame();
  buildTowerRow();
  updateHUD();
  G.running=true; G.over=false; G.paused=false;
  updateOwnedRunes();
  updateWeatherChip();
  $('startScreen').classList.add('hidden');
  $('endScreen').classList.add('hidden');
  $('runeScreen').classList.add('hidden');
  $('pauseBtn').textContent='⏸︎';
  banner('Baue Türme · dann ▶︎ Welle starten');
}
document.querySelectorAll('.diffBtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    selDiff = btn.dataset.d;
    document.querySelectorAll('.diffBtn').forEach(b=>b.classList.toggle('sel', b.dataset.d===selDiff));
    vibrate(8);
  });
});
$('playBtn').addEventListener('click',startGame);
$('againBtn').addEventListener('click',startGame);
$('shareBtn').addEventListener('click',async ()=>{
  const text=`⚔️ Yggdrasil Defense: Welle ${G.wave}, ${fmt(G.score)} Punkte, ${G.kills} Feinde besiegt! Schaffst du mehr?`;
  try{ if(navigator.share) await navigator.share({title:'Yggdrasil Defense',text,url:location.href});
    else { await navigator.clipboard.writeText(text); banner('Ergebnis kopiert!'); } }catch(e){}
});

// ============================================================
//  MODULE 12 — weather chip, events, timed FX, particles
// ============================================================
function updateWeatherChip(){
  const el=$('weatherChip'); if(!el) return;
  if(G.weatherKey==='clear'){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = G.weather.em+' '+G.weather.name;
}
$('weatherChip').addEventListener('click',()=>{ banner(G.weather.em+' '+G.weather.name+' — '+G.weather.desc); });

function triggerEvent(){
  const ev = EVENTS[(Math.random()*EVENTS.length)|0];
  ev.run();
  banner(ev.em+' '+ev.msg);
  vibrate(18);
  updateHUD();
}
function updateTimedFx(dt){
  const fx=G.fx;
  if(fx.rateT>0){ fx.rateT-=dt; if(fx.rateT<=0) fx.rateMul=1; }
  if(fx.espdT>0){ fx.espdT-=dt; if(fx.espdT<=0) fx.espdMul=1; }
  if(fx.dmgT>0){ fx.dmgT-=dt; if(fx.dmgT<=0) fx.dmgMul=1; }
}
function updateWeatherParticles(dt){
  const k=G.weatherKey;
  if(k==='frost'||k==='storm'||k==='ash'){
    const rate = k==='storm'?3:1.6;
    for(let n=0;n<rate;n++){
      const wx=G.cam.x+Math.random()*VW/G.cam.scale;
      G.wparticles.push({x:wx, y:G.cam.y-10, vy:(k==='storm'?420:k==='ash'?70:120)+Math.random()*80,
        vx:(k==='storm'?-60:k==='ash'?30:20)*(Math.random()*0.6+0.7), life:2.4, t:0,
        col:k==='frost'?'#cfeaff':k==='ash'?'#b7a89a':'#8fb8e0', sz:k==='ash'?2.4:1.6, streak:k==='storm'});
    }
  } else if(k==='divine'){
    if(Math.random()<0.4){
      const wx=G.cam.x+Math.random()*VW/G.cam.scale;
      G.wparticles.push({x:wx, y:G.cam.y-10, vy:40+Math.random()*40, vx:0, life:3, t:0, col:'#ffe9a8', sz:2, glow:true});
    }
  }
  for(const p of G.wparticles){ p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; }
  G.wparticles = G.wparticles.filter(p=>p.t<p.life && p.y < G.cam.y+VH/G.cam.scale+20);
  if(G.wparticles.length>500) G.wparticles.splice(0, G.wparticles.length-500);
}
function drawWeather(){
  for(const p of G.wparticles){
    ctx.globalAlpha = p.glow?0.8:0.5;
    ctx.fillStyle=p.col;
    if(p.streak){ ctx.strokeStyle=p.col; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-p.vx*0.03,p.y-p.vy*0.03); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,7); ctx.fill(); }
  }
  ctx.globalAlpha=1;
  // ash/divine full-screen tint drawn in screen space (handled in render)
}

// ============================================================
//  MAIN LOOP
// ============================================================
let last=performance.now(), fpsAcc=0, fpsN=0, fpsShown=0;
function loop(now){
  let dt=(now-last)/1000; last=now;
  if(dt>0.05) dt=0.05; // clamp big gaps
  // fps
  fpsAcc+=dt; fpsN++;
  if(fpsAcc>=0.5){ fpsShown=Math.round(fpsN/fpsAcc); fpsAcc=0; fpsN=0; $('fps').textContent=fpsShown+' FPS'; }

  if(G && G.running && !G.paused && !G.over){
    const steps=G.speed;
    for(let s=0;s<steps;s++){
      // spawn queue
      if(G.waveActive && G.spawnQueue.length){
        G.spawnTimer-=dt;
        if(G.spawnTimer<=0){ spawnEnemy(G.spawnQueue.shift()); G.spawnTimer=0.55; }
      }
      updateEnemies(dt);
      updateTowers(dt);
      updateBullets(dt);
    }
    updateParticles(dt);
    updateTimedFx(dt*steps);
    updateWeatherParticles(dt);
    // mid-wave events
    if(G.waveActive && !G.awaitingRune){
      G.eventTimer += dt*steps;
      if(G.eventTimer >= G.nextEventAt && (G.enemies.length || G.spawnQueue.length)){
        triggerEvent();
        G.eventTimer = 0; G.nextEventAt = 12 + Math.random()*7;
      }
    }
  }
  if(G) render();
  requestAnimationFrame(loop);
}

// boot
newGame();
buildTowerRow();
showBest();
render();
requestAnimationFrame(loop);
