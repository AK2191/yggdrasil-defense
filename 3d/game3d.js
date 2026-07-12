/* ============================================================
   YGGDRASIL DEFENSE — 3D (Beta)
   Real WebGL via Three.js: perspective camera, lights & shadows,
   low-poly procedural models. Same core rules as the 2D game.
   ============================================================ */
'use strict';
const $=id=>document.getElementById(id);

// ---------- board / rules (mirrors 2D) ----------
const COLS=22, ROWS=22;
const T_GROUND=0, T_TOWER=1, T_BLOCK=2, T_SPAWN=3, T_BASE=4;
const TOWERS={
  einherjar:{name:'Einherjar',cost:60, color:0x8fd6a0,range:2.6,dmg:14,rate:0.55,bspeed:11,unlock:0},
  runestein:{name:'Runestein',cost:85, color:0x7db8ff,range:2.4,dmg:7, rate:0.9, bspeed:9, slow:0.45,slowT:1.4,unlock:0},
  walkure:{ name:'Walküre',  cost:120,color:0xffe27a,range:2.3,dmg:9, rate:0.16,bspeed:14,unlock:2},
  mjolnir:{ name:'Mjölnir',  cost:160,color:0xff9d5a,range:2.5,dmg:34,rate:1.25,bspeed:10,splash:1.4,unlock:4},
  bifrost:{ name:'Bifröst',  cost:210,color:0xc88fff,range:5.2,dmg:80,rate:1.9, bspeed:20,unlock:6},
};
const ENEMIES={
  draugr:   {name:'Draugr',    hp:34, speed:1.15,reward:6,  r:0.40},
  berserker:{name:'Berserker', hp:26, speed:2.1, reward:7,  r:0.36},
  troll:    {name:'Troll',     hp:150,speed:0.75,reward:16, r:0.55},
  helhound: {name:'Helhound',  hp:16, speed:3.0, reward:5,  r:0.33},
  jormun:   {name:'Jörmungandr',hp:900,speed:0.9,reward:120,r:0.80,boss:true},
};
const KEYS=Object.keys(TOWERS);

let G=null;
function idx(c,r){return r*COLS+c;}
function inB(c,r){return c>=0&&c<COLS&&r>=0&&r<ROWS;}
function tw(c){return c-COLS/2+0.5;}   // tile -> world x
function tz(r){return r-ROWS/2+0.5;}   // tile -> world z
function clamp(v,a,b){return v<a?a:v>b?b:v;}

function newGame(){
  G={grid:new Uint8Array(COLS*ROWS),tower:new Array(COLS*ROWS).fill(null),
     dist:new Int32Array(COLS*ROWS),flow:new Int8Array(COLS*ROWS*2),
     enemies:[],bullets:[],gold:230,lives:20,wave:0,score:0,kills:0,
     spawn:{c:0,r:ROWS>>1},base:{c:COLS-1,r:ROWS>>1},selected:'einherjar',inspect:null,
     waveActive:false,spawnQueue:[],spawnTimer:0,running:false,paused:false,speed:1,over:false};
  G.grid.fill(T_GROUND);
  for(let c=0;c<COLS;c++){G.grid[idx(c,0)]=T_BLOCK;G.grid[idx(c,ROWS-1)]=T_BLOCK;}
  for(let r=0;r<ROWS;r++){G.grid[idx(0,r)]=T_BLOCK;G.grid[idx(COLS-1,r)]=T_BLOCK;}
  G.grid[idx(G.spawn.c,G.spawn.r)]=T_SPAWN; G.grid[idx(G.base.c,G.base.r)]=T_BASE;
  for(const [c,r] of [[6,6],[6,7],[15,15],[15,14],[11,4],[10,17]]) if(G.grid[idx(c,r)]===T_GROUND) G.grid[idx(c,r)]=T_BLOCK;
  computeFlow();
}
function walk(c,r){ if(!inB(c,r))return false; const t=G.grid[idx(c,r)]; return t===T_GROUND||t===T_SPAWN||t===T_BASE; }
function computeFlow(){
  const D=G.dist; D.fill(-1); const q=[idx(G.base.c,G.base.r)]; D[q[0]]=0; let qi=0;
  const N=[[1,0],[-1,0],[0,1],[0,-1]];
  while(qi<q.length){ const cur=q[qi++],cc=cur%COLS,cr=(cur/COLS)|0;
    for(const[dc,dr]of N){const nc=cc+dc,nr=cr+dr; if(!walk(nc,nr))continue; const ni=idx(nc,nr);
      if(D[ni]!==-1)continue; D[ni]=D[cur]+1; q.push(ni);} }
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const i=idx(c,r); G.flow[i*2]=0;G.flow[i*2+1]=0;
    if(D[i]<=0)continue; let best=D[i],bx=0,bz=0;
    for(const[dc,dr]of N){const nc=c+dc,nr=r+dr; if(!walk(nc,nr))continue; const nd=D[idx(nc,nr)];
      if(nd!==-1&&nd<best){best=nd;bx=dc;bz=dr;}} G.flow[i*2]=bx;G.flow[i*2+1]=bz; }
}
function pathOK(){return G.dist[idx(G.spawn.c,G.spawn.r)]>=0;}

// ============================================================
//  THREE SCENE
// ============================================================
let renderer,scene,camera,sun;
const cam={tx:0,tz:0,dist:16,min:8,max:26,tilt:0.95};
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
  scene.fog=new THREE.Fog(0x060b12,20,42);
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,0.1,120);
  GLOWTEX=glowTexture(); WHITETEX=whiteTexture();
  scene.add(new THREE.HemisphereLight(0x2c4258,0x05080c,0.5));
  sun=new THREE.DirectionalLight(0xcfe0f2,0.85);  // cold moonlight
  sun.position.set(-9,16,7); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  const sc=sun.shadow.camera; sc.left=-15;sc.right=15;sc.top=15;sc.bottom=-15;sc.far=50;
  scene.add(sun);
  window.addEventListener('resize',()=>{ renderer.setSize(innerWidth,innerHeight);
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); });
}
function updateCamera(){
  const t=cam.tilt;
  camera.position.set(cam.tx, Math.sin(t)*cam.dist, cam.tz+Math.cos(t)*cam.dist);
  camera.lookAt(cam.tx,0,cam.tz);
}

// ---------- static board ----------
let boardGroup, baseGroup, spawnRing, rangeRing;
function buildBoard(){
  if(boardGroup) scene.remove(boardGroup);
  boardGroup=new THREE.Group();
  // under-plane
  const up=new THREE.Mesh(new THREE.PlaneGeometry(COLS+14,ROWS+14), std(0x0a141d,{roughness:1}));
  up.rotation.x=-Math.PI/2; up.position.y=-0.09; up.receiveShadow=true; boardGroup.add(up);
  // checker tiles (two instanced meshes)
  const tileG=new THREE.BoxGeometry(0.96,0.12,0.96);
  const matA=std(0x101f2c,{roughness:0.94}), matB=std(0x0c1822,{roughness:0.94});
  const listA=[],listB=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(G.grid[idx(c,r)]===T_BLOCK) continue;
    ((c+r)&1?listA:listB).push([c,r]);
  }
  for(const [list,mat] of [[listA,matA],[listB,matB]]){
    const im=new THREE.InstancedMesh(tileG,mat,list.length);
    const m=new THREE.Matrix4();
    list.forEach(([c,r],i)=>{ m.makeTranslation(tw(c),-0.06,tz(r)); im.setMatrixAt(i,m); });
    im.receiveShadow=true; boardGroup.add(im);
  }
  // rocks
  const rocks=[]; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(G.grid[idx(c,r)]===T_BLOCK) rocks.push([c,r]);
  const rockIM=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42,0), std(0x2a343e,{roughness:0.92,flatShading:true}), rocks.length);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), p=new THREE.Vector3();
  rocks.forEach(([c,r],i)=>{ e.set(Math.random()*3,Math.random()*3,Math.random()*3); q.setFromEuler(e);
    const sc=0.75+Math.random()*0.5; s.set(sc,sc*(0.7+Math.random()*0.4),sc); p.set(tw(c),0.18,tz(r));
    m4.compose(p,q,s); rockIM.setMatrixAt(i,m4); });
  rockIM.castShadow=true; rockIM.receiveShadow=true; boardGroup.add(rockIM);
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
  baseGroup.position.set(tw(G.base.c),0,tz(G.base.r)); boardGroup.add(baseGroup);
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

// ---------- enemy models ----------
function makeEnemy(key){
  const d=ENEMIES[key], g=new THREE.Group(); const r=d.r;
  const cast=m=>{m.castShadow=true;return m;};
  const bodyMat=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.75},o||{}));
  let body;
  if(key==='draugr'){
    body=cast(new THREE.Mesh(new THREE.SphereGeometry(r,14,12),bodyMat(0x8fa695)));
    const helm=cast(new THREE.Mesh(new THREE.SphereGeometry(r*1.02,12,8,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshStandardMaterial({color:0x8a95a1,metalness:0.8,roughness:0.35})));
    helm.position.y=r*0.15; g.add(helm);
    for(const s of [-1,1]){ const horn=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.16,r*0.7,8),bodyMat(0xefe7d2)));
      horn.position.set(0,r*0.55,s*r*0.75); horn.rotation.x=s*0.9; g.add(horn); }
    for(const s of [-1,1]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.12,8,8),
      bodyMat(0x8affc8,{emissive:0x8affc8,emissiveIntensity:2})); eye.position.set(r*0.82,r*0.05,s*r*0.3); g.add(eye); }
  } else if(key==='berserker'){
    body=cast(new THREE.Mesh(new THREE.SphereGeometry(r,14,12),bodyMat(0xc9825f)));
    const axeH=cast(new THREE.Mesh(new THREE.CylinderGeometry(r*0.08,r*0.08,r*1.5,6),bodyMat(0x5f3d20)));
    axeH.position.set(0,r*0.5,-r*0.9); axeH.rotation.x=0.5; g.add(axeH);
    const blade=cast(new THREE.Mesh(new THREE.BoxGeometry(r*0.5,r*0.55,r*0.1),
      new THREE.MeshStandardMaterial({color:0xb9c2cc,metalness:0.85,roughness:0.3})));
    blade.position.set(0,r*1.1,-r*1.15); g.add(blade);
    for(const s of [-1,1]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.11,8,8),
      bodyMat(0xffdf7a,{emissive:0xffdf7a,emissiveIntensity:2})); eye.position.set(r*0.82,r*0.1,s*r*0.28); g.add(eye); }
  } else if(key==='troll'){
    body=cast(new THREE.Mesh(new THREE.SphereGeometry(r,14,12),bodyMat(0x7fa06a)));
    body.scale.set(1.15,1.0,1.15);
    const brow=cast(new THREE.Mesh(new THREE.BoxGeometry(r*0.5,r*0.22,r*1.1),bodyMat(0x53704a)));
    brow.position.set(r*0.75,r*0.3,0); g.add(brow);
    for(const s of [-1,1]){ const tusk=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.12,r*0.45,8),bodyMat(0xeef0dc)));
      tusk.position.set(r*0.8,-r*0.25,s*r*0.35); tusk.rotation.x=Math.PI; tusk.rotation.z=-0.4; g.add(tusk); }
    for(const s of [-1,1]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.1,8,8),
      bodyMat(0xdfffb0,{emissive:0xdfffb0,emissiveIntensity:1.6})); eye.position.set(r*0.9,r*0.12,s*r*0.3); g.add(eye); }
  } else if(key==='helhound'){
    body=cast(new THREE.Mesh(new THREE.SphereGeometry(r,14,12),bodyMat(0x9a7fb8)));
    body.scale.set(1.5,0.85,0.8);
    const head=cast(new THREE.Mesh(new THREE.SphereGeometry(r*0.55,12,10),bodyMat(0x8a6fa8)));
    head.position.set(r*1.25,r*0.25,0); g.add(head);
    const snout=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.22,r*0.5,8),bodyMat(0x7a5f98)));
    snout.rotation.z=-Math.PI/2; snout.position.set(r*1.75,r*0.15,0); g.add(snout);
    for(const s of [-1,1]){ const ear=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.14,r*0.4,6),bodyMat(0x6a5288)));
      ear.position.set(r*1.1,r*0.7,s*r*0.25); g.add(ear);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.09,8,8),
        bodyMat(0xd8a0ff,{emissive:0xd8a0ff,emissiveIntensity:2.2})); eye.position.set(r*1.5,r*0.4,s*r*0.22); g.add(eye); }
  } else { // jormun
    body=cast(new THREE.Mesh(new THREE.SphereGeometry(r,18,14),bodyMat(0x49b8a8)));
    body.scale.set(1.05,1.15,1.05);
    for(const s of [-1,1]){ const fin=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.3,r*0.9,6),bodyMat(0x2f8a7c)));
      fin.position.set(-r*0.2,r*0.8,s*r*0.75); fin.rotation.x=s*0.8; g.add(fin);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.16,10,8),
        bodyMat(0xfffbdc,{emissive:0xfffbdc,emissiveIntensity:2})); eye.position.set(r*0.8,r*0.25,s*r*0.35); g.add(eye);
      const fang=cast(new THREE.Mesh(new THREE.ConeGeometry(r*0.09,r*0.4,6),bodyMat(0xffffff)));
      fang.position.set(r*0.85,-r*0.4,s*r*0.22); fang.rotation.x=Math.PI; g.add(fang); }
    const gl=glowSprite(0x5ad0c0,r*4,0.4); gl.position.y=r*0.4; g.add(gl);
  }
  g.add(body); g.userData.body=body;
  // hp bar sprites
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x111820,depthWrite:false}));
  bg.scale.set(r*2.2,0.09,1); bg.position.y=r*1.7+0.18;
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({map:WHITETEX,color:0x4ade80,depthWrite:false}));
  fg.scale.set(r*2.16,0.07,1); fg.position.y=r*1.7+0.18;
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
function startWave(){
  if(G.waveActive||G.over)return;
  G.wave++; G.spawnQueue=waveComposition(G.wave); G.spawnTimer=0; G.waveActive=true;
  banner('Welle '+G.wave+' — '+(G.wave%5===0?'BOSS':G.spawnQueue.length+' Feinde'));
  refreshRow(); updateHUD();
}
function spawnEnemy(key){
  const d=ENEMIES[key],hp=Math.round(d.hp*hpScale(G.wave));
  const mesh=makeEnemy(key); scene.add(mesh);
  const e={key,def:d,x:tw(G.spawn.c),z:tz(G.spawn.r)+(Math.random()*0.5-0.25),r:d.r,hp,maxhp:hp,
    speed:d.speed*(0.92+Math.random()*0.16),slow:0,slowT:0,dead:false,boss:!!d.boss,mesh,anim:Math.random()*6,dying:0};
  mesh.position.set(e.x,0.02,e.z);
  G.enemies.push(e);
}
function updateEnemies(dt){
  for(const e of G.enemies){
    if(e.dead){ e.dying+=dt;
      const f=clamp(1-e.dying/0.45,0,1);
      e.mesh.scale.setScalar(Math.max(0.001,f)); e.mesh.position.y=0.02-(1-f)*0.4; e.mesh.rotation.z+= dt*4;
      continue; }
    if(e.slowT>0){e.slowT-=dt; if(e.slowT<=0)e.slow=0;}
    const spd=e.speed*(1-e.slow);
    e.anim+=dt*spd*3.4;
    const c=clamp(Math.floor(e.x+COLS/2),0,COLS-1), r=clamp(Math.floor(e.z+ROWS/2),0,ROWS-1);
    if(c===G.base.c&&r===G.base.r){ e.dead=true; scene.remove(e.mesh); baseHit(e); continue; }
    const i=idx(c,r); let fx=G.flow[i*2],fz=G.flow[i*2+1];
    if(fx===0&&fz===0){ fx=tw(G.base.c)-e.x; fz=tz(G.base.r)-e.z; }
    else { const cxw=tw(c)+fx*0.55, czw=tz(r)+fz*0.55; fx=cxw-e.x; fz=czw-e.z; }
    const l=Math.hypot(fx,fz)||1; const vx=fx/l*spd, vz=fz/l*spd;
    e.x+=vx*dt; e.z+=vz*dt;
    // mesh anim: bob + lean + face movement
    const bob=Math.abs(Math.sin(e.anim))*e.r*0.22;
    e.mesh.position.set(e.x, 0.02+bob, e.z);
    e.mesh.rotation.y=-Math.atan2(vz,vx);
    e.mesh.rotation.z=Math.sin(e.anim)*0.08;
    // hp bar
    const f=clamp(e.hp/e.maxhp,0,1);
    e.mesh.userData.hpfg.scale.x=e.r*2.16*f;
    e.mesh.userData.hpfg.material.color.setHex(f>0.5?0x4ade80:f>0.25?0xfbbf24:0xff5a52);
    // hit flash decay
    if(e.flashT>0){ e.flashT-=dt; if(e.flashT<=0) e.mesh.userData.body.material.emissive.setHex(0x000000); }
  }
  G.enemies=G.enemies.filter(e=>{ if(e.dead&&e.dying>=0.45){ scene.remove(e.mesh); return false; } return true; });
  if(G.waveActive&&G.spawnQueue.length===0&&!G.enemies.some(e=>!e.dead)) endWave();
}
function baseHit(e){
  G.lives-=e.boss?5:1; updateHUD();
  banner('Das Langhaus wurde getroffen!');
  if(navigator.vibrate)navigator.vibrate(30);
  if(G.lives<=0){G.lives=0; gameOver();}
}
function endWave(){
  G.waveActive=false;
  const bonus=30+G.wave*8; G.gold+=bonus;
  banner('Welle '+G.wave+' überstanden! +'+bonus+' Gold');
  refreshRow(); updateHUD();
}

// ---------- towers ----------
function tryBuild(c,r){
  const i=idx(c,r);
  if(G.grid[i]===T_TOWER&&G.tower[i]){ openSheet(G.tower[i]); return; }
  closeSheet();
  if(G.grid[i]!==T_GROUND){ banner('Hier kann nicht gebaut werden'); return; }
  const def=TOWERS[G.selected];
  if(G.wave<def.unlock){ banner(def.name+' ab Welle '+def.unlock); return; }
  if(G.gold<def.cost){ banner('Nicht genug Gold'); return; }
  G.grid[i]=T_TOWER; computeFlow();
  if(!pathOK()){ G.grid[i]=T_GROUND; computeFlow(); banner('Das würde den Pfad blockieren!'); return; }
  G.gold-=def.cost;
  const mesh=makeTower(G.selected); mesh.position.set(tw(c),0,tz(r)); scene.add(mesh);
  G.tower[i]={key:G.selected,c,r,x:tw(c),z:tz(r),def,level:1,dmg:def.dmg,range:def.range,rate:def.rate,
    cd:0,invested:def.cost,mesh,angle:0,recoil:0};
  if(navigator.vibrate)navigator.vibrate(15);
  updateHUD();
}
function updateTowers(dt,now){
  for(const t of G.tower){ if(!t)continue;
    if(t.recoil>0)t.recoil-=dt*7;
    t.cd-=dt;
    // idle pulse
    if(t.mesh.userData.pulse){ const p=0.5+Math.sin(now*3+t.x)*0.5; t.mesh.userData.pulse.material.opacity=0.3+p*0.35; }
    if(t.mesh.userData.wingL){ t.mesh.userData.wingL.rotation.z=-0.55+Math.sin(now*10)*0.12;
      t.mesh.userData.wingR.rotation.z=0.55-Math.sin(now*10)*0.12; }
    let best=null,bd=Infinity;
    for(const e of G.enemies){ if(e.dead)continue;
      const d=(t.x-e.x)*(t.x-e.x)+(t.z-e.z)*(t.z-e.z);
      if(d<=t.range*t.range&&d<bd){bd=d;best=e;} }
    if(best){
      const a=Math.atan2(best.z-t.z,best.x-t.x);
      t.angle=a;
      const head=t.mesh.userData.head;
      if(head){ head.rotation.y=-a; head.position.x=-Math.max(0,t.recoil)*0.18*Math.cos(a);
        head.position.z=-Math.max(0,t.recoil)*0.18*Math.sin(a); }
      if(t.cd<=0){ fire(t,best); t.cd=t.rate; }
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
  G.bullets.push({mesh,target:tgt,speed:def.bspeed,dmg:t.dmg,splash:def.splash||0,
    slow:def.slow||0,slowT:def.slowT||0,dead:false});
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
  const bx=b.mesh.position.x,bz=b.mesh.position.z;
  if(b.splash>0){ for(const e of G.enemies){ if(e.dead)continue;
    if((e.x-bx)*(e.x-bx)+(e.z-bz)*(e.z-bz)<=b.splash*b.splash) dmg(e,b); } }
  else if(b.target&&!b.target.dead) dmg(b.target,b);
}
function dmg(e,b){
  e.hp-=b.dmg;
  e.flashT=0.1; e.mesh.userData.body.material.emissive.setHex(0xffffff);
  e.mesh.userData.body.material.emissiveIntensity=0.55;
  if(b.slow>0){ e.slow=Math.max(e.slow,b.slow); e.slowT=b.slowT; }
  if(e.hp<=0&&!e.dead){
    e.dead=true; e.dying=0;
    G.kills++; G.score+=e.boss?250:Math.max(1,Math.round(e.maxhp/6)); G.gold+=e.def.reward;
    if(e.boss)banner('Boss besiegt! +'+e.def.reward+' Gold');
    updateHUD();
  }
}

// ---------- inspector ----------
function upCost(t){return Math.round(t.def.cost*0.8*t.level);}
function openSheet(t){
  G.inspect=t;
  rangeRing.visible=true; rangeRing.position.set(t.x,0.02,t.z); rangeRing.scale.setScalar(t.range);
  $('shNm').textContent=t.def.name+' · Stufe '+t.level;
  $('shInfo').textContent='Schaden '+Math.round(t.dmg)+' · Reichweite '+t.range.toFixed(1)+' · '+(1/t.rate).toFixed(1)+'/s';
  const c=upCost(t);
  $('shUpBtn').textContent=t.level>=4?'Max':'Upgrade · '+c+' Gold';
  $('shUpBtn').disabled=G.gold<c||t.level>=4;
  $('shSellBtn').textContent='Verkaufen · '+Math.floor(t.invested*0.6)+' Gold';
  $('sheet').classList.add('show');
}
function closeSheet(){ G.inspect=null; rangeRing.visible=false; $('sheet').classList.remove('show'); }
$('shCloseBtn').addEventListener('click',closeSheet);
$('shUpBtn').addEventListener('click',()=>{ const t=G.inspect; if(!t||t.level>=4)return;
  const c=upCost(t); if(G.gold<c)return;
  G.gold-=c; t.level++; t.dmg=Math.round(t.dmg*1.6); t.range*=1.08; t.rate*=0.9; t.invested+=c;
  t.mesh.scale.setScalar(1+0.07*(t.level-1));
  openSheet(t); updateHUD(); });
$('shSellBtn').addEventListener('click',()=>{ const t=G.inspect; if(!t)return;
  G.gold+=Math.floor(t.invested*0.6);
  const i=idx(t.c,t.r); G.grid[i]=T_GROUND; G.tower[i]=null; scene.remove(t.mesh);
  computeFlow(); closeSheet(); updateHUD(); });

// ---------- HUD ----------
function updateHUD(){
  $('uiGold').textContent=Math.floor(G.gold);
  $('uiLife').textContent=G.lives;
  $('uiWave').textContent=G.wave;
  $('uiScore').textContent=Math.floor(G.score);
  const wb=$('waveBtn'); wb.disabled=G.waveActive;
  wb.textContent=G.waveActive?'Welle '+G.wave+'…':'▶︎ Welle '+(G.wave+1);
  document.querySelectorAll('.twr').forEach(el=>{
    const def=TOWERS[el.dataset.k], locked=G.wave<def.unlock;
    el.classList.toggle('locked',locked||G.gold<def.cost);
    el.querySelector('.cost').classList.toggle('na',G.gold<def.cost&&!locked);
  });
}
function buildRow(){
  const row=$('towerRow'); row.innerHTML='';
  for(const k of KEYS){ const def=TOWERS[k];
    const el=document.createElement('div'); el.className='twr'+(k===G.selected?' sel':''); el.dataset.k=k;
    el.innerHTML=`<div class="dot" style="background:#${def.color.toString(16).padStart(6,'0')};color:#${def.color.toString(16).padStart(6,'0')}"></div>
      <div class="nm">${def.name}</div><div class="cost">${def.cost}</div>`;
    el.addEventListener('click',()=>{ if(G.wave<def.unlock){banner(def.name+' ab Welle '+def.unlock);return;}
      G.selected=k; document.querySelectorAll('.twr').forEach(x=>x.classList.toggle('sel',x.dataset.k===k)); closeSheet(); });
    row.appendChild(el);
  }
  updateHUD();
}
function refreshRow(){
  document.querySelectorAll('.twr').forEach(el=>{ const def=TOWERS[el.dataset.k];
    el.querySelector('.nm').textContent=G.wave<def.unlock?'Welle '+def.unlock:def.name; });
  updateHUD();
}
let bT=null;
function banner(msg){ const b=$('banner'); b.textContent=msg; b.classList.add('show');
  clearTimeout(bT); bT=setTimeout(()=>b.classList.remove('show'),1900); }

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
    cam.dist=clamp(dist0*(pinch0/d),cam.min,cam.max);
  } else if(ptr.size===1){
    if(Math.hypot(nx-dx0,ny-dy0)>12)moved=true;
    if(moved){ const k=cam.dist/700;
      cam.tx=clamp(cam.tx-(nx-prev.x)*k,-COLS/2,COLS/2);
      cam.tz=clamp(cam.tz-(ny-prev.y)*k*1.4,-ROWS/2,ROWS/2); }
  }
  ptr.set(e.pointerId,{x:nx,y:ny});
});
function endP(e){
  if(ptr.size===1&&!moved&&performance.now()-t0<320) tap(e.clientX,e.clientY);
  ptr.delete(e.pointerId);
}
cv.addEventListener('pointerup',endP);
cv.addEventListener('pointercancel',e=>ptr.delete(e.pointerId));
cv.addEventListener('wheel',e=>{ e.preventDefault(); cam.dist=clamp(cam.dist*(e.deltaY>0?1.1:0.9),cam.min,cam.max); },{passive:false});
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(), groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0), hitP=new THREE.Vector3();
function tap(sx,sy){
  if(!G.running||G.over)return;
  ndc.set(sx/innerWidth*2-1,-(sy/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  if(!ray.ray.intersectPlane(groundPlane,hitP))return;
  const c=Math.floor(hitP.x+COLS/2), r=Math.floor(hitP.z+ROWS/2);
  if(!inB(c,r)){closeSheet();return;}
  tryBuild(c,r);
}

// ---------- buttons / flow ----------
$('waveBtn').addEventListener('click',startWave);
$('pauseBtn').addEventListener('click',()=>{ G.paused=!G.paused; $('pauseBtn').textContent=G.paused?'▶︎':'⏸︎'; });
$('speedBtn').addEventListener('click',()=>{ G.speed=G.speed===1?2:G.speed===2?3:1; $('speedBtn').textContent=G.speed+'×'; });
function gameOver(){
  G.over=true; G.running=false;
  $('endTitle').textContent='Ragnarök';
  $('endSub').textContent='Das Langhaus fiel in Welle '+G.wave+' · '+G.kills+' Feinde besiegt · '+Math.floor(G.score)+' Punkte';
  $('endScreen').classList.remove('hidden');
}
function startGame(){
  // clear scene enemies/bullets/towers
  if(G){ for(const e of G.enemies) scene.remove(e.mesh);
    for(const b of G.bullets) scene.remove(b.mesh);
    for(const t of G.tower) if(t) scene.remove(t.mesh); }
  newGame(); buildBoard(); buildRow(); updateHUD();
  cam.tx=0; cam.tz=0; cam.dist=17;
  G.running=true;
  $('startScreen').classList.add('hidden'); $('endScreen').classList.add('hidden');
  banner('Baue Türme · dann Welle starten');
}
$('playBtn').addEventListener('click',startGame);
$('againBtn').addEventListener('click',startGame);

// ---------- main loop ----------
let last=performance.now(),fa=0,fn=0;
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
    }
  }
  if(spawnRing){ spawnRing.rotation.z=secs*1.5; spawnRing.scale.setScalar(1+Math.sin(secs*3)*0.08); }
  if(baseGroup) baseGroup.rotation.y=Math.sin(secs*0.6)*0.04;
  updateCamera();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

// boot
try{
  initThree();
  newGame(); buildBoard(); buildRow(); updateHUD(); updateCamera();
  requestAnimationFrame(loop);
}catch(err){
  document.body.innerHTML='<div style="padding:40px;text-align:center;font-family:system-ui;color:#eaf2f7">'+
    '<h2>WebGL nicht verfügbar</h2><p>Dein Browser unterstützt kein WebGL. '+
    '<a style="color:#4ade80" href="../index.html">Zur 2D-Version</a></p></div>';
  console.error(err);
}
