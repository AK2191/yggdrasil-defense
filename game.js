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
  buildTerrain();
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
  vibrate(15); sfx('place'); spawnBurst(G.tower[i].x, G.tower[i].y, def.color, 8);
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
  const wtxt = G.weatherKey!=='clear' ? ' · '+G.weather.name : '';
  banner('Welle '+G.wave+' — '+(G.wave%5===0?'BOSS':G.spawnQueue.length+' Feinde')+wtxt);
  vibrate(20); sfx('wave');
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
  vibrate(e.boss?60:30); sfx('basehit');
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
  saveRun();
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
const RAR_COL={common:'#8fa9bd',rare:'#5aa9ff',legendary:'#fbbf24'};
function paintRuneSigil(c2,id,color,S){
  // deterministic hash from id
  let h=0; for(let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))>>>0;
  const cx=S/2, top=S*0.18, bot=S*0.82, midX=cx;
  radialGlow(c2,cx,S/2,S*0.5,color,0.35);
  c2.strokeStyle=color; c2.lineWidth=Math.max(2,S*0.05); c2.lineCap='round'; c2.lineJoin='round';
  c2.beginPath(); c2.moveTo(midX,top); c2.lineTo(midX,bot);           // stave
  const branches=2+(h%3);
  for(let b=0;b<branches;b++){
    const t=top + (bot-top)*((b+1)/(branches+1));
    const dir=((h>>b)&1)?1:-1;
    const len=S*(0.18+((h>>(b+2))&3)*0.05);
    const up=((h>>(b+4))&1)?-1:1;
    c2.moveTo(midX,t); c2.lineTo(midX+dir*len, t+up*len*0.7);
  }
  // top/bottom caps
  const cap=S*0.14;
  c2.moveTo(midX-cap,top+cap*0.3); c2.lineTo(midX,top); c2.lineTo(midX+cap,top+cap*0.3);
  c2.stroke();
  c2.fillStyle=color; c2.beginPath(); c2.arc(midX,bot,S*0.05,0,7); c2.fill();
}
function offerRunes(bonus){
  const cards = rollRunes();
  const box = $('runeCards'); box.innerHTML='';
  const rarTag={common:'Gewöhnlich',rare:'Selten',legendary:'Legendär'};
  for(const r of cards){
    const el=document.createElement('div');
    el.className='runecard '+r.rar;
    el.innerHTML=`<div class="rc-rar"></div><canvas class="rc-em" width="88" height="88"></canvas>
      <div class="rc-nm">${r.name}</div><div class="rc-desc">${r.desc}</div>
      <div class="rc-tag">${rarTag[r.rar]}</div>`;
    const c2=el.querySelector('.rc-em').getContext('2d'); c2.scale(2,2);
    paintRuneSigil(c2, r.id, RAR_COL[r.rar], 44);
    el.addEventListener('click',()=>takeRune(r));
    box.appendChild(el);
  }
  $('runeWaveNo').textContent='ᛯ';
  $('runeSub').textContent='Welle '+G.wave+' geschafft · +'+bonus+' Gold. Der Weltenbaum gewährt dir eine Rune:';
  G.awaitingRune=true;
  $('runeScreen').classList.remove('hidden');
  banner('');
}
function takeRune(r){
  r.apply(G.mods);
  G.runes[r.id]=(G.runes[r.id]||0)+1;
  vibrate(20); sfx('rune');
  closeRunes();
  banner(r.name+' aktiviert!');
  updateOwnedRunes();
  updateHUD();
}
function closeRunes(){
  G.awaitingRune=false;
  $('runeScreen').classList.add('hidden');
}
function updateOwnedRunes(){
  const el=$('ownedRunes'); if(!el) return;
  let html='';
  for(const id in G.runes){ const def=RUNES.find(x=>x.id===id); if(!def) continue;
    const col=RAR_COL[def.rar]||'#8fa9bd'; const n=G.runes[id];
    html+=`<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${col};margin:0 1px;vertical-align:middle;box-shadow:0 0 6px ${col}88"></span>${n>1?'<span style="font-size:9px;vertical-align:middle">'+n+'</span>':''}`;
  }
  el.innerHTML=html;
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
  sfx('shoot');
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
    if(e.boss){ banner('Boss besiegt! +'+rw+' Gold'); vibrate(40); sfx('boss'); } else sfx('die');
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
  // cinematic vignette (cached gradient)
  const vk=VW+'x'+VH;
  if(vk!==vignKey){ vignKey=vk;
    vignetteGrad=ctx.createRadialGradient(VW/2,VH*0.46,Math.min(VW,VH)*0.42,VW/2,VH*0.5,Math.max(VW,VH)*0.72);
    vignetteGrad.addColorStop(0,'rgba(0,0,0,0)'); vignetteGrad.addColorStop(1,'rgba(0,0,0,0.42)');
  }
  ctx.fillStyle=vignetteGrad; ctx.fillRect(0,0,VW,VH);
}

// ============================================================
//  ART — procedural vector sprites (no emoji), UE5-ish shading
// ============================================================
function hexA(hex,a){
  const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function shade(hex,f){ // f<1 darken, >1 lighten
  const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  r=Math.max(0,Math.min(255,r*f))|0; g=Math.max(0,Math.min(255,g*f))|0; b=Math.max(0,Math.min(255,b*f))|0;
  return `rgb(${r},${g},${b})`;
}
function rrect(c2,x,y,w,h,r){ c2.beginPath(); c2.moveTo(x+r,y); c2.arcTo(x+w,y,x+w,y+h,r); c2.arcTo(x+w,y+h,x,y+h,r); c2.arcTo(x,y+h,x,y,r); c2.arcTo(x,y,x+w,y,r); c2.closePath(); }
function radialGlow(c2,x,y,r,col,a){
  const g=c2.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,hexA(col,a)); g.addColorStop(1,hexA(col,0));
  c2.fillStyle=g; c2.beginPath(); c2.arc(x,y,r,0,7); c2.fill();
}
// draws a turret of the given tower key into c2 at (cx,cy), base radius R, barrel rotated by angle
function paintTower(c2, key, cx, cy, R, angle, now){
  const def=TOWERS[key], col=def.color;
  // soft ground shadow
  c2.fillStyle='rgba(0,0,0,.32)'; c2.beginPath(); c2.ellipse(cx, cy+R*0.5, R*0.95, R*0.42, 0,0,7); c2.fill();
  // metallic base pad
  let g=c2.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.15, cx,cy,R);
  g.addColorStop(0,'#3a4653'); g.addColorStop(0.6,'#222c36'); g.addColorStop(1,'#131a22');
  c2.fillStyle=g; c2.beginPath(); c2.arc(cx,cy,R,0,7); c2.fill();
  // rim light
  c2.lineWidth=Math.max(1,R*0.09); c2.strokeStyle='rgba(255,255,255,.12)';
  c2.beginPath(); c2.arc(cx,cy,R*0.94,-2.4,-0.3); c2.stroke();
  // accent glow ring
  c2.strokeStyle=hexA(col,.9); c2.lineWidth=Math.max(1,R*0.11);
  c2.beginPath(); c2.arc(cx,cy,R*0.66,0,7); c2.stroke();
  radialGlow(c2,cx,cy,R*1.5,col,0.16);
  // rotating head
  c2.save(); c2.translate(cx,cy); c2.rotate(angle);
  const barrel=(len,w,c)=>{ const bg=c2.createLinearGradient(0,-w,0,w); bg.addColorStop(0,shade(c,1.5)); bg.addColorStop(0.5,c); bg.addColorStop(1,shade(c,0.6));
    c2.fillStyle=bg; rrect(c2,0,-w,len,w*2,w*0.6); c2.fill(); };
  switch(key){
    case 'einherjar': // ballista bolt-thrower: twin prongs + bolt
      c2.strokeStyle=shade(col,0.8); c2.lineWidth=R*0.16; c2.lineCap='round';
      c2.beginPath(); c2.moveTo(R*0.15,-R*0.7); c2.lineTo(R*0.95,0); c2.lineTo(R*0.15,R*0.7); c2.stroke();
      barrel(R*1.05,R*0.14,col);
      c2.fillStyle='#eafff0'; c2.beginPath(); c2.moveTo(R*1.0,0); c2.lineTo(R*0.72,-R*0.16); c2.lineTo(R*0.72,R*0.16); c2.fill();
      break;
    case 'runestein': // levitating crystal
      c2.restore(); c2.save(); c2.translate(cx,cy+Math.sin(now*2)*R*0.12);
      { const cg=c2.createLinearGradient(0,-R*0.8,0,R*0.8); cg.addColorStop(0,shade(col,1.6)); cg.addColorStop(1,shade(col,0.7));
        c2.fillStyle=cg; c2.beginPath(); c2.moveTo(0,-R*0.85); c2.lineTo(R*0.5,0); c2.lineTo(0,R*0.85); c2.lineTo(-R*0.5,0); c2.closePath(); c2.fill();
        c2.strokeStyle=hexA('#eaf6ff',.7); c2.lineWidth=R*0.06; c2.stroke();
        radialGlow(c2,0,0,R*0.9,col,0.5); }
      break;
    case 'walkure': // spark coil
      c2.strokeStyle=shade(col,0.75); c2.lineWidth=R*0.2;
      c2.beginPath(); c2.arc(0,0,R*0.5,0,7); c2.stroke();
      barrel(R*0.9,R*0.1,col);
      for(let k=0;k<3;k++){ const a=now*8+k*2.1; c2.strokeStyle=hexA('#fff2b0',.8); c2.lineWidth=R*0.05;
        c2.beginPath(); c2.moveTo(Math.cos(a)*R*0.5,Math.sin(a)*R*0.5); c2.lineTo(Math.cos(a)*R*0.9,Math.sin(a)*R*0.9); c2.stroke(); }
      break;
    case 'mjolnir': // hammer head
      barrel(R*0.55,R*0.12,'#6b7480');
      { const hg=c2.createLinearGradient(R*0.4,-R*0.5,R*0.4,R*0.5); hg.addColorStop(0,shade(col,1.4)); hg.addColorStop(1,shade(col,0.7));
        c2.fillStyle=hg; rrect(c2,R*0.5,-R*0.55,R*0.7,R*1.1,R*0.14); c2.fill();
        c2.fillStyle='rgba(255,255,255,.2)'; rrect(c2,R*0.55,-R*0.5,R*0.22,R*1.0,R*0.1); c2.fill(); }
      break;
    case 'bifrost': // long prism sniper
      { const pg=c2.createLinearGradient(0,-R*0.16,0,R*0.16);
        pg.addColorStop(0,'#7de6ab'); pg.addColorStop(0.4,'#5aa9ff'); pg.addColorStop(0.8,col); pg.addColorStop(1,'#ff9d5a');
        c2.fillStyle=pg; rrect(c2,0,-R*0.16,R*1.5,R*0.32,R*0.1); c2.fill();
        c2.fillStyle=hexA('#fff',.85); c2.beginPath(); c2.arc(R*1.4,0,R*0.13,0,7); c2.fill();
        radialGlow(c2,R*1.4,0,R*0.7,col,0.5); }
      break;
  }
  c2.restore();
  // glowing core
  c2.fillStyle=hexA(shade(col,1.7),.95); c2.beginPath(); c2.arc(cx,cy,R*0.2,0,7); c2.fill();
}

// draws the STATIC enemy body (no shadow/glow/slow) — pre-rendered into a sprite
function paintEnemyBody(c2,key,cx,cy,rr){
  const d=ENEMIES[key], col=d.color;
  // body with volumetric gradient
  const g=c2.createRadialGradient(cx-rr*0.35,cy-rr*0.4,rr*0.2,cx,cy,rr*1.15);
  g.addColorStop(0,shade(col,1.5)); g.addColorStop(0.7,col); g.addColorStop(1,shade(col,0.5));
  c2.fillStyle=g;
  c2.beginPath();
  if(key==='helhound'){ c2.ellipse(cx,cy,rr*1.25,rr*0.85,0,0,7); } // elongated
  else if(key==='troll'){ c2.moveTo(cx-rr,cy+rr*0.6); c2.quadraticCurveTo(cx-rr*1.1,cy-rr,cx,cy-rr*1.05); c2.quadraticCurveTo(cx+rr*1.1,cy-rr,cx+rr,cy+rr*0.6); c2.closePath(); }
  else { c2.arc(cx,cy,rr,0,7); }
  c2.fill();
  // rim light
  c2.strokeStyle='rgba(255,255,255,.22)'; c2.lineWidth=rr*0.16;
  c2.beginPath(); c2.arc(cx,cy,rr*0.9,-2.5,-0.4); c2.stroke();
  // type features
  const eye=(ex,ey,er,ec)=>{ c2.fillStyle=ec; c2.beginPath(); c2.arc(ex,ey,er,0,7); c2.fill(); };
  switch(key){
    case 'draugr': eye(cx-rr*0.35,cy-rr*0.1,rr*0.16,'#bfffe0'); eye(cx+rr*0.35,cy-rr*0.1,rr*0.16,'#bfffe0'); break;
    case 'berserker': // axe glint
      eye(cx-rr*0.3,cy-rr*0.1,rr*0.14,'#ffd0c0'); eye(cx+rr*0.3,cy-rr*0.1,rr*0.14,'#ffd0c0');
      c2.strokeStyle='#ffe6d0'; c2.lineWidth=rr*0.12; c2.beginPath(); c2.arc(cx+rr*0.9,cy-rr*0.6,rr*0.5,0.8,2.4); c2.stroke(); break;
    case 'troll': eye(cx-rr*0.3,cy-rr*0.2,rr*0.18,'#eaffea'); eye(cx+rr*0.3,cy-rr*0.2,rr*0.18,'#eaffea');
      c2.fillStyle=shade(col,0.6); c2.beginPath(); c2.arc(cx-rr*0.5,cy-rr*0.8,rr*0.16,0,7); c2.arc(cx+rr*0.5,cy-rr*0.8,rr*0.16,0,7); c2.fill(); break;
    case 'helhound': eye(cx+rr*0.6,cy-rr*0.15,rr*0.16,'#ffd0ff'); eye(cx+rr*0.85,cy-rr*0.1,rr*0.12,'#ffd0ff');
      c2.fillStyle=shade(col,0.6); c2.beginPath(); c2.moveTo(cx-rr*0.9,cy-rr*0.3); c2.lineTo(cx-rr*1.3,cy-rr*0.8); c2.lineTo(cx-rr*0.6,cy-rr*0.55); c2.fill(); break;
    case 'jormun': // boss serpent head
      eye(cx-rr*0.32,cy-rr*0.15,rr*0.16,'#fffbe0'); eye(cx+rr*0.32,cy-rr*0.15,rr*0.16,'#fffbe0');
      c2.strokeStyle=shade(col,1.6); c2.lineWidth=rr*0.1;
      for(let k=-2;k<=2;k++){ c2.beginPath(); c2.moveTo(cx+k*rr*0.35,cy-rr*0.9); c2.lineTo(cx+k*rr*0.35,cy-rr*1.25); c2.stroke(); }
      c2.fillStyle='rgba(255,255,255,.9)'; c2.beginPath(); c2.arc(cx-rr*0.32,cy-rr*0.15,rr*0.06,0,7); c2.arc(cx+rr*0.32,cy-rr*0.15,rr*0.06,0,7); c2.fill(); break;
  }
}

// ---- pre-rendered sprites & glow (performance) ----
let ENEMY_SPR={}, GLOW_SPR=null, vignetteGrad=null, vignKey='';
function buildSprites(){
  ENEMY_SPR={};
  for(const key in ENEMIES){
    const d=ENEMIES[key], R=d.r, s=Math.ceil((R*1.4)*2)+8;
    const cv=document.createElement('canvas'); cv.width=s*2; cv.height=s*2;
    const c2=cv.getContext('2d'); c2.scale(2,2);
    paintEnemyBody(c2,key,s/2,s/2,R);
    ENEMY_SPR[key]={cv,s,R};
  }
  const gs=64; GLOW_SPR=document.createElement('canvas'); GLOW_SPR.width=gs; GLOW_SPR.height=gs;
  const gc=GLOW_SPR.getContext('2d');
  const gg=gc.createRadialGradient(gs/2,gs/2,0,gs/2,gs/2,gs/2);
  gg.addColorStop(0,'rgba(255,255,255,1)'); gg.addColorStop(0.4,'rgba(255,255,255,.5)'); gg.addColorStop(1,'rgba(255,255,255,0)');
  gc.fillStyle=gg; gc.fillRect(0,0,gs,gs);
}
function glowSprite(x,y,r,a){ ctx.globalAlpha=a; ctx.drawImage(GLOW_SPR,x-r,y-r,r*2,r*2); ctx.globalAlpha=1; }

let TERRAIN=null;
function buildTerrain(){
  const c=document.createElement('canvas'); c.width=WORLD_W*2; c.height=WORLD_H*2;
  const x=c.getContext('2d'); x.scale(2,2);
  for(let r=0;r<ROWS;r++) for(let col=0;col<COLS;col++){
    const t=G.grid[idx(col,r)], px=col*TS, py=r*TS;
    if(t===T_BLOCK){
      const cx=px+TS/2, cy=py+TS/2;
      x.fillStyle='rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(cx,cy+TS*0.22,TS*0.42,TS*0.2,0,0,7); x.fill();
      const bg=x.createRadialGradient(cx-TS*0.15,cy-TS*0.18,TS*0.1,cx,cy,TS*0.5);
      bg.addColorStop(0,'#4a5763'); bg.addColorStop(0.7,'#2c3742'); bg.addColorStop(1,'#1a232c');
      x.fillStyle=bg;
      x.beginPath(); x.moveTo(cx-TS*0.34,cy+TS*0.2); x.lineTo(cx-TS*0.38,cy-TS*0.1); x.lineTo(cx-TS*0.12,cy-TS*0.34);
      x.lineTo(cx+TS*0.2,cy-TS*0.3); x.lineTo(cx+TS*0.37,cy-TS*0.02); x.lineTo(cx+TS*0.28,cy+TS*0.24); x.closePath(); x.fill();
      x.strokeStyle='rgba(255,255,255,.1)'; x.lineWidth=1.5; x.beginPath(); x.moveTo(cx-TS*0.12,cy-TS*0.32); x.lineTo(cx+TS*0.18,cy-TS*0.28); x.stroke();
    } else {
      const base = (t===T_BASE||t===T_SPAWN) ? '#0f2230' : (((col+r)&1)?'#122430':'#0e1d28');
      const tg=x.createLinearGradient(px,py,px,py+TS);
      tg.addColorStop(0, shade(base,1.14)); tg.addColorStop(1, shade(base,0.86));
      x.fillStyle=tg; x.fillRect(px,py,TS,TS);
      x.strokeStyle='rgba(90,150,180,.05)'; x.lineWidth=1; x.strokeRect(px+0.5,py+0.5,TS,TS);
    }
  }
  TERRAIN=c;
}
function drawTiles(){
  const bc=tileCenter(G.base.c,G.base.r), sc0=tileCenter(G.spawn.c,G.spawn.r);
  radialGlow(ctx,bc.x,bc.y,TS*6,'#1e8a4a',0.16);
  radialGlow(ctx,sc0.x,sc0.y,TS*5,'#c0392b',0.13);
  if(TERRAIN) ctx.drawImage(TERRAIN,0,0,WORLD_W,WORLD_H);
  const now=performance.now()/1000;
  // spawn rift (animated)
  const s=tileCenter(G.spawn.c,G.spawn.r);
  const pulse=0.5+Math.sin(now*3)*0.12;
  radialGlow(ctx,s.x,s.y,TS*0.9,'#ff4438',0.4*pulse+0.2);
  const rg=ctx.createRadialGradient(s.x,s.y,2,s.x,s.y,TS*0.44);
  rg.addColorStop(0,'#1a0608'); rg.addColorStop(0.6,'#3a0d10'); rg.addColorStop(1,hexA('#ff5a52',.0));
  ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(s.x,s.y,TS*0.44,0,7); ctx.fill();
  for(let k=0;k<2;k++){ ctx.strokeStyle=hexA('#ff6a60',.6-k*0.25); ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(s.x,s.y,TS*(0.28+k*0.12), now*(1.5+k)+k, now*(1.5+k)+k+4); ctx.stroke(); }
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
  const b=tileCenter(G.base.c,G.base.r), R=TS*0.44;
  radialGlow(ctx,b.x,b.y,TS*1.2,'#4ade80',0.28);
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(b.x,b.y+R*0.6,R*1.05,R*0.42,0,0,7); ctx.fill();
  // keep body (stone gradient)
  const g=ctx.createLinearGradient(b.x,b.y-R,b.x,b.y+R);
  g.addColorStop(0,'#e9f5ee'); g.addColorStop(0.5,'#9fb6a8'); g.addColorStop(1,'#5a6f63');
  ctx.fillStyle=g; rrect(ctx,b.x-R*0.8,b.y-R*0.5,R*1.6,R*1.25,R*0.16); ctx.fill();
  // battlements
  ctx.fillStyle='#c3d4ca';
  for(let k=-2;k<=2;k++){ ctx.fillRect(b.x+k*R*0.34-R*0.12, b.y-R*0.78, R*0.24, R*0.3); }
  // glowing rune banner
  const cg=ctx.createLinearGradient(b.x,b.y-R*0.3,b.x,b.y+R*0.5);
  cg.addColorStop(0,'#7de6ab'); cg.addColorStop(1,'#2f9e5a');
  ctx.fillStyle=cg; rrect(ctx,b.x-R*0.26,b.y-R*0.28,R*0.52,R*0.8,R*0.08); ctx.fill();
  ctx.strokeStyle=hexA('#eafff0',.8); ctx.lineWidth=R*0.07;
  ctx.beginPath(); ctx.moveTo(b.x,b.y-R*0.14); ctx.lineTo(b.x,b.y+R*0.32); ctx.moveTo(b.x-R*0.12,b.y+0.02*R); ctx.lineTo(b.x+R*0.12,b.y-R*0.1); ctx.stroke();
  // health ring
  const frac=clamp(G.lives/(G.diff?G.diff.lives:20),0,1);
  ctx.lineCap='round';
  ctx.strokeStyle='rgba(255,90,82,.3)'; ctx.lineWidth=3.5; ctx.beginPath(); ctx.arc(b.x,b.y,TS*0.62,0,7); ctx.stroke();
  ctx.strokeStyle=frac>0.4?'#4ade80':frac>0.2?'#fbbf24':'#ff5a52';
  ctx.beginPath(); ctx.arc(b.x,b.y,TS*0.62,-Math.PI/2,-Math.PI/2+frac*Math.PI*2); ctx.stroke();
  ctx.lineCap='butt';
}
function drawTowers(){
  for(const t of G.tower){
    if(!t) continue;
    const inspecting = G.inspect===t;
    if(inspecting){
      ctx.fillStyle='rgba(74,222,128,.08)'; ctx.strokeStyle='rgba(74,222,128,.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(t.x,t.y,effRange(t),0,7); ctx.fill(); ctx.stroke();
    }
    if(t.flash>0) radialGlow(ctx,t.x,t.y,TS*0.8,t.def.color,0.4*(t.flash/0.08));
    paintTower(ctx, t.key, t.x, t.y, TS*0.4, t.angle, performance.now()/1000);
    // level pips
    if(t.level>1){ for(let k=0;k<Math.min(t.level-1,3);k++){
      ctx.fillStyle=t.def.color; ctx.beginPath(); ctx.arc(t.x+(k-(Math.min(t.level-1,3)-1)/2)*7, t.y+TS*0.42, 2.4,0,7); ctx.fill(); } }
  }
}
function drawEnemies(){
  for(const e of G.enemies){
    // shadow
    ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.r*0.7,e.r*0.9,e.r*0.35,0,0,7); ctx.fill();
    if(e.boss){ ctx.globalCompositeOperation='lighter'; glowSprite(e.x,e.y,e.r*2.4,0.35); ctx.globalCompositeOperation='source-over'; }
    const sp=ENEMY_SPR[e.key];
    if(sp) ctx.drawImage(sp.cv, e.x-sp.s/2, e.y-sp.s/2, sp.s, sp.s);
    if(e.slow>0){ ctx.strokeStyle=hexA('#7db8ff',.8); ctx.lineWidth=2; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+2,0,7); ctx.stroke(); }
    // hp bar
    const w=e.r*2.2, hpf=clamp(e.hp/e.maxhp,0,1), by=e.y-e.r-(e.boss?14:9);
    ctx.fillStyle='rgba(0,0,0,.55)'; rrect(ctx,e.x-w/2,by,w,4.5,2); ctx.fill();
    ctx.fillStyle=e.boss?'#ff5a52':(hpf>0.5?'#4ade80':hpf>0.25?'#fbbf24':'#ff5a52');
    rrect(ctx,e.x-w/2,by,w*hpf,4.5,2); ctx.fill();
  }
}
function drawBullets(){
  ctx.globalCompositeOperation='lighter';
  for(const b of G.bullets){
    const rad=b.splash>0?5:3.2;
    // trail
    const dx=b.tx-b.x, dy=b.ty-b.y, dl=Math.hypot(dx,dy)||1;
    ctx.strokeStyle=hexA(b.color,.35); ctx.lineWidth=rad*1.3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-dx/dl*rad*3, b.y-dy/dl*rad*3); ctx.stroke();
    glowSprite(b.x,b.y,rad*3.4,0.5);
    ctx.fillStyle=hexA(b.color,.95); ctx.beginPath(); ctx.arc(b.x,b.y,rad,0,7); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(b.x,b.y,rad*0.55,0,7); ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
  ctx.lineCap='butt';
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
    const cost=el.querySelector('.cost'), cn=el.querySelector('.cn');
    if(cn && !locked) cn.textContent=c;
    if(cost) cost.classList.toggle('na', G.gold<c && !locked);
  });
}
function buildTowerRow(){
  const row=$('towerRow'); row.innerHTML='';
  for(const k of TOWER_KEYS){
    const def=TOWERS[k];
    const el=document.createElement('div');
    el.className='twr'+(k===G.selected?' sel':'');
    el.dataset.k=k;
    el.innerHTML=`<canvas class="twr-ico" width="80" height="80"></canvas><div class="nm">${def.name}</div><div class="cost"><span class="cn">${def.cost}</span><span class="coin"></span></div>`;
    const ic=el.querySelector('.twr-ico'); const c2=ic.getContext('2d'); c2.scale(2,2);
    paintTower(c2, k, 20, 22, 15, -0.5, 0);
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
  const ic=$('shEm'), c2=ic.getContext('2d'); c2.setTransform(2,0,0,2,0,0); c2.clearRect(0,0,48,48);
  paintTower(c2, t.key, 24, 26, 18, -0.5, performance.now()/1000);
  $('shNm').textContent=t.def.name;
  $('shLv').textContent='Stufe '+t.level;
  $('shDmg').textContent=Math.round(effDmg(t));
  $('shRng').textContent=(effRange(t)/TS).toFixed(1);
  $('shRate').textContent=(1/effRate(t)).toFixed(1)+'/s';
  $('shTgt').textContent=t.target==='first'?'Erster':t.target==='strong'?'Stärkster':'Schwächster';
  const upCost=upgradeCost(t);
  $('shUpBtn').innerHTML='Stufe '+(t.level+1)+' · '+upCost+' <span class="coin"></span>';
  $('shUpBtn').disabled = G.gold<upCost || t.level>=4;
  if(t.level>=4) $('shUpBtn').innerHTML='Max';
  $('shSellBtn').innerHTML='Verkaufen · '+Math.floor(t.invested*G.mods.sell)+' <span class="coin"></span>';
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
  spawnBurst(t.x,t.y,t.def.color,12); vibrate(15); sfx('upgrade');
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
  computeFlow(); spawnBurst(t.x,t.y,'#fbbf24',10); vibrate(15); sfx('sell');
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
function vibrate(ms){ if(hapticOn && navigator.vibrate) try{navigator.vibrate(ms);}catch(e){} }
function buzz(){ vibrate([10,40,10]); }

// ============================================================
//  START / END
// ============================================================
function loadBest(){ try{ return JSON.parse(localStorage.getItem('ygg_best')||'{}'); }catch(e){ return {}; } }
function saveBest(b){ try{ localStorage.setItem('ygg_best', JSON.stringify(b)); }catch(e){} }
function showBest(){
  const b=loadBest();
  const el=$('bestLine'); if(!el) return;
  el.textContent = b.wave ? ('★ Rekord: Welle '+b.wave+' · '+fmt(b.score||0)+' Punkte') : '';
}
function gameOver(){
  G.over=true; G.running=false;
  const best=loadBest();
  const isNew = G.wave>(best.wave||0) || (G.wave===(best.wave||0) && G.score>(best.score||0));
  if(isNew){ saveBest({wave:G.wave, score:G.score, kills:G.kills}); }
  $('endRune').textContent = isNew?'✦':'ᛦ';
  $('endTitle').textContent = isNew?'Neuer Rekord!':'Ragnarök';
  $('endSub').textContent = isNew ? ('Bestleistung: Welle '+G.wave+'!') : ('Das Langhaus ist in Welle '+G.wave+' gefallen.');
  $('endWave').textContent=G.wave; $('endScore').textContent=fmt(G.score);
  $('endKills').textContent=G.kills; $('endGold').textContent=fmt(G.goldEarned);
  $('endScreen').classList.remove('hidden');
  vibrate([60,40,60,40,120]); sfx('over');
  clearSave();
}
function startGame(){
  clearSave();
  newGame();
  buildTowerRow();
  updateHUD();
  initAudio();
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
  const wcol={frost:'#cfeaff',storm:'#8fb8e0',ash:'#b7a89a',divine:'#ffe9a8'}[G.weatherKey]||'#8fb8e0';
  el.innerHTML=`<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${wcol};box-shadow:0 0 8px ${wcol}">​</span> ${G.weather.name}`;
}
$('weatherChip').addEventListener('click',()=>{ banner(G.weather.name+' — '+G.weather.desc); });

function triggerEvent(){
  const ev = EVENTS[(Math.random()*EVENTS.length)|0];
  ev.run();
  banner(ev.msg);
  vibrate(18); sfx('event');
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
//  MODULE 15/18 — Audio (Web Audio), settings, save/resume
// ============================================================
const SND = { ctx:null, master:null, on:true };
let hapticOn = true, lastShootSnd = 0;
function loadSettings(){
  try{ SND.on = localStorage.getItem('ygg_sound')!=='0'; hapticOn = localStorage.getItem('ygg_haptic')!=='0'; }catch(e){}
}
function initAudio(){
  if(SND.ctx){ if(SND.ctx.state==='suspended') SND.ctx.resume(); return; }
  try{
    SND.ctx = new (window.AudioContext||window.webkitAudioContext)();
    SND.master = SND.ctx.createGain();
    SND.master.gain.value = SND.on?0.5:0;
    SND.master.connect(SND.ctx.destination);
  }catch(e){}
}
function beep(freq,dur,type,vol,slideTo){
  if(!SND.ctx || !SND.on) return;
  const t=SND.ctx.currentTime;
  const o=SND.ctx.createOscillator(), g=SND.ctx.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(freq,t);
  if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo),t+dur);
  g.gain.setValueAtTime(vol||0.3,t);
  g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g); g.connect(SND.master); o.start(t); o.stop(t+dur+0.02);
}
function sfx(name){
  if(!SND.on || !SND.ctx) return;
  switch(name){
    case 'shoot': { const now=performance.now(); if(now-lastShootSnd<45) return; lastShootSnd=now; beep(620+Math.random()*90,0.045,'square',0.05); break; }
    case 'place':   beep(170,0.12,'sine',0.28,340); break;
    case 'upgrade': beep(420,0.2,'sine',0.28,860); break;
    case 'sell':    beep(520,0.12,'sine',0.2,190); break;
    case 'die':     beep(150,0.11,'sawtooth',0.12,60); break;
    case 'boss':    beep(90,0.45,'sawtooth',0.32,45); break;
    case 'wave':    beep(330,0.1,'square',0.2); setTimeout(()=>beep(494,0.15,'square',0.2),110); break;
    case 'basehit': beep(120,0.28,'sawtooth',0.35,45); break;
    case 'rune':    beep(523,0.12,'sine',0.26); setTimeout(()=>beep(659,0.12,'sine',0.26),95); setTimeout(()=>beep(784,0.2,'sine',0.26),190); break;
    case 'event':   beep(880,0.09,'sine',0.14,1250); break;
    case 'over':    beep(420,0.5,'sawtooth',0.3,70); break;
    case 'tap':     beep(600,0.03,'square',0.05); break;
  }
}
// settings sheet
$('settingsBtn').addEventListener('click',()=>{ $('setSound').checked=SND.on; $('setHaptic').checked=hapticOn; $('settingsSheet').classList.remove('hidden'); });
$('setClose').addEventListener('click',()=>$('settingsSheet').classList.add('hidden'));
$('settingsSheet').addEventListener('click',e=>{ if(e.target.id==='settingsSheet') $('settingsSheet').classList.add('hidden'); });
$('setSound').addEventListener('change',e=>{
  SND.on=e.target.checked; try{ localStorage.setItem('ygg_sound', SND.on?'1':'0'); }catch(x){}
  if(SND.on){ initAudio(); if(SND.master) SND.master.gain.value=0.5; sfx('tap'); } else if(SND.master){ SND.master.gain.value=0; }
});
$('setHaptic').addEventListener('change',e=>{ hapticOn=e.target.checked; try{ localStorage.setItem('ygg_haptic', hapticOn?'1':'0'); }catch(x){} if(hapticOn) vibrate(15); });

// save / resume (Module 15)
function serializeRun(){
  if(!G || G.over || G.wave<1) return null;
  const towers=[];
  for(const t of G.tower){ if(t) towers.push({c:t.c,r:t.r,key:t.key,level:t.level,dmg:t.dmg,range:t.range,rate:t.rate,target:t.target,invested:t.invested,angle:t.angle}); }
  return { v:1, grid:Array.from(G.grid), towers, gold:G.gold, lives:G.lives, wave:G.wave,
    score:G.score, kills:G.kills, goldEarned:G.goldEarned, mods:G.mods, runes:G.runes, diffKey:G.diffKey };
}
function saveRun(){ const s=serializeRun(); if(s){ try{ localStorage.setItem('ygg_save', JSON.stringify(s)); }catch(e){} } }
function clearSave(){ try{ localStorage.removeItem('ygg_save'); }catch(e){} }
function loadSave(){ try{ return JSON.parse(localStorage.getItem('ygg_save')||'null'); }catch(e){ return null; } }
function updateResumeBtn(){
  const s=loadSave(); const btn=$('resumeBtn');
  if(s && s.wave>0){ btn.style.display=''; btn.innerHTML='▶︎ Fortsetzen · Welle '+s.wave; }
  else btn.style.display='none';
}
function resumeRun(){
  const s=loadSave(); if(!s){ startGame(); return; }
  selDiff = s.diffKey||'normal';
  newGame();
  G.grid = new Uint8Array(s.grid);
  G.tower = new Array(COLS*ROWS).fill(null);
  for(const tt of s.towers){
    const def=TOWERS[tt.key]; if(!def) continue; const i=idx(tt.c,tt.r);
    G.tower[i]={ key:tt.key,c:tt.c,r:tt.r,x:tt.c*TS+TS/2,y:tt.r*TS+TS/2,def,level:tt.level,
      dmg:tt.dmg,range:tt.range,rate:tt.rate,cd:0,target:tt.target,invested:tt.invested,angle:tt.angle||-Math.PI/2,flash:0 };
    G.grid[i]=T_TOWER;
  }
  G.gold=s.gold; G.lives=s.lives; G.wave=s.wave; G.score=s.score; G.kills=s.kills; G.goldEarned=s.goldEarned;
  Object.assign(G.mods, s.mods||{}); G.runes=s.runes||{};
  computeFlow();
  buildTowerRow(); refreshTowerRow(); updateOwnedRunes(); updateWeatherChip();
  initAudio();
  G.running=true; G.over=false; G.paused=false;
  $('startScreen').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('runeScreen').classList.add('hidden');
  $('pauseBtn').textContent='⏸︎';
  centerCam();
  banner('Fortgesetzt — Welle '+G.wave);
}
$('resumeBtn').addEventListener('click',resumeRun);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) saveRun(); });

// ============================================================
//  MAIN LOOP
// ============================================================
let last=performance.now(), fpsAcc=0, fpsN=0, fpsShown=0, saveAcc=0;
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
    // periodic auto-save between waves (Module 15)
    saveAcc += dt;
    if(saveAcc>=20){ saveAcc=0; if(!G.waveActive && !G.awaitingRune && G.wave>0) saveRun(); }
  }
  if(G) render();
  requestAnimationFrame(loop);
}

// boot
loadSettings();
buildSprites();
newGame();
buildTowerRow();
showBest();
updateResumeBtn();
render();
requestAnimationFrame(loop);
