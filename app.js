import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js?v=20261102s';
import { createCollision } from './collision.js?v=20261102s';
import { createPickleController, COURT, courtObstacles, courtLines, playerSlots, WORK_PRIORITY } from './pickleball.js?v=20261102s';
import { createPickleFX } from './pickleball-fx.js?v=20261102s';

/* ---------- config ---------- */
const STATUS = {
  working:{c:'#3ddc84',zh:'執行中',ic:'⌨️'}, thinking:{c:'#f5c542',zh:'思考中',ic:'💭'},
  waiting_user:{c:'#ff8a3d',zh:'等 Roy',ic:'❗'}, error:{c:'#ff4d5e',zh:'出錯',ic:'⚠️'},
  done:{c:'#60a5fa',zh:'完成',ic:'✅'}, idle:{c:'#8a93ad',zh:'待命',ic:'☕'}, walking:{c:'#9fe3ff',zh:'走動中',ic:'🚶'}, talking:{c:'#4fd1c5',zh:'交接中',ic:'💬'}
};
const BOTS = [
 ['Lily','Ops','總助理／營運','#8b5cf6','antenna'],
 ['Mr. Pickle','Ops','Pickleball 事務','#84cc16','paddle'],
 ['Mr. 雜務','Ops','雜務管家','#64748b','toolbelt'],
 ['Dr. School','School','學校工作／日程','#f59e0b','glasses_book'],
 ['Coding 主管','Roblox','Coding 主管','#3b82f6','glasses_clip'],
 ['Dr.coding','Roblox','腳本／帶隊','#38bdf8','glasses_laptop'],
 ['程式員','Roblox','伺服器邏輯','#22c55e','hoodie'],
 ['UI 設計員','Roblox','介面設計','#ec4899','beret_tablet'],
 ['Visual 程式員','Roblox','特效／燈光','#8b5cf6','wand'],
 ['Youtube主管','YouTube','頻道主管','#ef4444','cap'],
 ['頻道營運','YouTube','數據營運','#f97316','chart'],
 ['AI 製作員','YouTube','AI 影片製作','#14b8a6','antenna2'],
 ['選題研究員','YouTube','選題研究','#fb923c','magnifier'],
 ['短片編劇','YouTube','短片劇本','#f43f5e','pen'],
];
const TEAMS = {
  Ops:{zh:'營運 OPS',c:'#a78bfa',cx:-10,cz:1,w:6.4,d:4.6},
  School:{zh:'學校 SCHOOL',c:'#fbbf24',cx:10.5,cz:6.8,w:4.6,d:4.2},
  Roblox:{zh:'ROBLOX 工作室',c:'#60a5fa',cx:10,cz:-2.8,w:8.6,d:4.6},
  YouTube:{zh:'YOUTUBE 頻道',c:'#f87171',cx:1,cz:2.6,w:8.6,d:4.6},
};
const STEPS = {
 Ops:['整理今日待辦','檢查 Gmail 賬單','同步儀表板','追蹤 MLP 香港站票務','安排維修預約','更新共用資料夾'],
 School:['準備數學教材','整理學生名單','睇學校日程','批改練習','寫家長通告'],
 Roblox:['寫 Luau 腳本','跑自動測試','整合 branch','調 HUD 版面','調粒子特效','修 DataStore bug'],
 YouTube:['研究熱門題材','寫短片劇本','生成 AI 畫面','睇頻道數據','剪片字幕'],
};
const norm = s => (s||'').toLowerCase().replace(/[\s.'’_-]/g,'');

/* ---------- renderer / scene ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1020');
const cam = new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
cam.position.set(38,34,38); cam.zoom = 1.2;
const controls = new OrbitControls(cam, canvas);
controls.target.set(0,0,0); controls.enableDamping = true; controls.maxPolarAngle = 1.25; controls.minPolarAngle = 0.5;
controls.minZoom = 0.6; controls.maxZoom = 4; controls.screenSpacePanning = true;
function resize(){ const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false);
  const a = r.width/r.height, s = a>1.2 ? 17.5 : Math.max(17.5, 21/a); /* 直屏按闊度取景，避免左右被切 */ cam.left=-s*a; cam.right=s*a; cam.top=s; cam.bottom=-s; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); new ResizeObserver(resize).observe(canvas.parentElement); resize();

const hemi = new THREE.HemisphereLight('#bcd2ff','#3a2a1c',0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(10,30,-25); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:80}); sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.03;
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fb4ff',0.5); fill.position.set(30,20,30); scene.add(fill);

/* ---------- helpers ---------- */
const matCache = {};
function M(color, o={}){ const k=color+JSON.stringify(o); if(!matCache[k]) matCache[k]=new THREE.MeshStandardMaterial({color, roughness:0.75, metalness:0.05, ...o}); return matCache[k]; }
function box(w,h,d,mat,x=0,y=0,z=0,parent=scene,cast=true){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), typeof mat==='string'?M(mat):mat);
  m.position.set(x,y,z); m.castShadow=cast; m.receiveShadow=true; parent.add(m); return m; }
function cyl(rt,rb,h,mat,x,y,z,parent=scene,seg=24){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg), typeof mat==='string'?M(mat):mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
function canvasTex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; return t; }
function textPlane(txt, w, h, color, x,y,z, rotX=-Math.PI/2, rotY=0, font='bold 64px sans-serif', parent=scene){
  const t=canvasTex(1024,128,(g,W,H)=>{ g.fillStyle=color; g.font=font; g.textAlign='center'; g.textBaseline='middle'; g.fillText(txt,W/2,H/2); });
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
  m.position.set(x,y,z); m.rotation.set(rotX,rotY,0,'YXZ'); parent.add(m); return m; }

/* ---------- room ---------- */
const RX=15, RZ=11, WH=6;
const woodTex = canvasTex(1024,1024,(g,W,H)=>{ const rows=16, ph=H/rows;
  for(let r=0;r<rows;r++){ let x=-(r*97%300); while(x<W){ const len=220+((r*31+x)%180+180)%180; const l=48+((r*7+x*3)%14);
    g.fillStyle=`hsl(${24+(r%3)},${52+(x%7)}%,${l*0.62}%)`; g.fillRect(x,r*ph,len,ph-2);
    for(let i=0;i<6;i++){ g.strokeStyle=`rgba(60,30,10,${0.06+Math.random()*0.06})`; g.beginPath(); const yy=r*ph+Math.random()*ph; g.moveTo(x,yy); g.bezierCurveTo(x+len*0.3,yy+3,x+len*0.6,yy-3,x+len,yy); g.stroke(); }
    g.fillStyle='rgba(30,15,5,0.55)'; g.fillRect(x+len-2,r*ph,2,ph); x+=len; } g.fillStyle='rgba(20,10,4,0.6)'; g.fillRect(0,r*ph+ph-2,W,2);} });
woodTex.wrapS=woodTex.wrapT=THREE.RepeatWrapping; woodTex.repeat.set(3,2.2);
const floor = box(RX*2, 0.4, RZ*2, new THREE.MeshStandardMaterial({map:woodTex, roughness:0.55, metalness:0.02}), 0,-0.2,0); floor.castShadow=false;
box(RX*2+0.6,0.6,RZ*2+0.6,'#1a1f2b',0,-0.55,0);
// walls
const wallMat = M('#2b303c',{roughness:0.9});
box(0.4,WH,RZ*2+0.4,wallMat,-RX-0.2,WH/2,0);
box(9.6,WH,0.4,wallMat,-RX+4.8,WH/2,-RZ-0.2);
box(RX*2,0.5,0.5,'#151922',0,WH-0.25,-RZ-0.2); box(RX*2,0.3,0.5,'#151922',0,0.15,-RZ-0.2);
// skyline backdrop
let skyTex, skyMesh;
function makeSky(mode){ return canvasTex(2048,512,(g,W,H)=>{
  const grads={day:['#6fb3f2','#cfe6fb'],evening:['#3b3f7a','#f59e6b'],night:['#060a1c','#1b2350']}[mode];
  const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,grads[0]); gr.addColorStop(1,grads[1]); g.fillStyle=gr; g.fillRect(0,0,W,H);
  if(mode==='day'){ g.fillStyle='rgba(255,255,240,0.9)'; g.beginPath(); g.arc(1500,110,40,0,7); g.fill(); }
  if(mode==='night'){ for(let i=0;i<120;i++){ g.fillStyle='rgba(255,255,255,'+Math.random()*0.8+')'; g.fillRect(Math.random()*W,Math.random()*H*0.5,2,2);} }
  let seed=7; const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;
  for(const layer of [0,1]){ let x=0; while(x<W){ const bw=40+rnd()*110, bh=(layer?120:200)+rnd()*(layer?160:220);
    const base={day:layer?'#5a7ea8':'#7c9cc4',evening:layer?'#2a2c52':'#47426e',night:layer?'#0b1230':'#141c42'}[mode];
    g.fillStyle=base; g.fillRect(x,H-bh,bw,bh);
    for(let wy=H-bh+10; wy<H-6; wy+=14) for(let wx=x+6; wx<x+bw-6; wx+=12){ if(rnd()<(mode==='day'?0.15:0.45)){
      g.fillStyle=mode==='day'?'rgba(220,240,255,0.5)':'rgba(255,214,140,'+(0.5+rnd()*0.5)+')'; g.fillRect(wx,wy,6,8);} }
    x+=bw+rnd()*14; } } }); }
skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(21,6), new THREE.MeshBasicMaterial({}));
skyMesh.position.set(4.8,3,-RZ-0.6); scene.add(skyMesh);
// windows on back wall x -5.4..15
const frameMat=M('#11141b',{metalness:0.6,roughness:0.4});
const glassMat=new THREE.MeshPhysicalMaterial({color:'#9cc9ff',transparent:true,opacity:0.12,roughness:0.05,metalness:0,depthWrite:false});
for(let x=-5.4; x<=RX+0.01; x+=2.55){ box(0.18,WH,0.3,frameMat,x,WH/2,-RZ-0.2); }
box(20.4,0.12,0.3,frameMat,4.8,WH*0.62,-RZ-0.2);
const glass=new THREE.Mesh(new THREE.PlaneGeometry(20.4,WH),glassMat); glass.position.set(4.8,WH/2,-RZ-0.1); scene.add(glass);

/* ---------- furniture ---------- */
function plant(x,z,s=1){ const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  cyl(0.35,0.28,0.7,'#e9e6df',0,0.35,0,g); cyl(0.3,0.3,0.05,'#3b2a1a',0,0.69,0,g);
  const leaf=M('#2f8f4e',{roughness:0.6}), leaf2=M('#3fae5f',{roughness:0.6});
  for(let i=0;i<9;i++){ const l=new THREE.Mesh(new THREE.ConeGeometry(0.16,1.3,5), i%2?leaf:leaf2); const a=i*0.7;
    l.position.set(Math.cos(a)*0.25,1.25+(i%3)*0.15,Math.sin(a)*0.25); l.rotation.set(Math.sin(a)*0.6,0,-Math.cos(a)*0.6); l.castShadow=true; g.add(l);} return g; }
function chair(x,z,ry,parent=scene,c='#1e2230'){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=ry; parent.add(g);
  cyl(0.05,0.05,0.5,'#555',0,0.25,0,g,8); cyl(0.32,0.32,0.06,'#333',0,0.04,0,g,10); box(0.7,0.1,0.65,c,0,0.55,0,g); box(0.7,0.75,0.1,c,0,0.95,0.32,g); return g; }
const monitors=[];
function desk(x,z,ry,team){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=ry; scene.add(g);
  box(1.8,0.07,0.95,'#d7c3a3',0,0.85,0,g); box(0.06,0.82,0.85,'#2a2d36',-0.85,0.42,0,g); box(0.06,0.82,0.85,'#2a2d36',0.85,0.42,0,g);
  box(0.5,0.03,0.3,'#222',0,0.9,-0.25,g); box(0.06,0.4,0.06,'#222',0,1.08,-0.3,g);
  const scrMat=new THREE.MeshStandardMaterial({color:'#0d1220',emissive:new THREE.Color(TEAMS[team].c),emissiveIntensity:0.25,roughness:0.3});
  box(1.0,0.6,0.05,'#15171d',0,1.45,-0.32,g); const scr=box(0.92,0.52,0.02,scrMat,0,1.45,-0.29,g,false);
  box(0.6,0.02,0.2,'#30343f',0,0.9,0.1,g); box(0.08,0.12,0.08,'#e9e6df',0.65,0.95,-0.1,g);
  chair(0,0.85,0,g); monitors.push(scr);
  const seat=new THREE.Vector3(0,0,0.78).applyAxisAngle(new THREE.Vector3(0,1,0),ry).add(g.position);
  return {g, scr, seat, face:ry+Math.PI}; }
function rug(t){ const T=TEAMS[t]; const g=new THREE.Group(); g.position.set(T.cx,0,T.cz); scene.add(g);
  const col=new THREE.Color(T.c); const dark=col.clone().multiplyScalar(0.28);
  const m=box(T.w,0.03,T.d,new THREE.MeshStandardMaterial({color:dark,roughness:0.95}),0,0.015,0,g,false);
  const em=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.9});
  box(T.w,0.05,0.07,em,0,0.03,T.d/2,g,false); box(T.w,0.05,0.07,em,0,0.03,-T.d/2,g,false);
  box(0.07,0.05,T.d,em,T.w/2,0,0,g,false).position.y=0.03; box(0.07,0.05,T.d,em,-T.w/2,0,0,g,false).position.y=0.03;
  textPlane(T.zh, 4.2, 0.5, '#ffffffdd', T.cx, 0.05, T.cz+T.d/2-0.35); }
for(const t in TEAMS) rug(t);

// desk layouts
const seats={};
function cluster(t,n){ const T=TEAMS[t], cols=Math.ceil(n/2), arr=[];
  for(let i=0;i<n;i++){ const row=i<cols?0:1, col=row?i-cols:i, cnt=row?n-cols:cols;
    const x=T.cx+(col-(cnt-1)/2)*1.95, z=row?T.cz-0.75:T.cz+0.25; arr.push(desk(x,z+(row?0:0),row?Math.PI:0,t)); }
  // fix: row0 desk faces -z (bot at +z); row1 rotated (bot at -z)
  seats[t]=arr; }
cluster('Ops',3); cluster('Roblox',5); cluster('YouTube',5); seats.School=[desk(10.5,6.6,0,'School')];
// school bookshelf
{ const g=new THREE.Group(); g.position.set(12.4,0,6.6); g.rotation.y=-Math.PI/2; scene.add(g); box(2.2,2.4,0.5,'#6b4a2e',0,1.2,0,g);
  const bc=['#e35d5b','#4f8fe6','#f2c14e','#58b368','#9b6bd3'];
  for(let s=0;s<3;s++) for(let i=0;i<9;i++) box(0.16,0.5+((i*s)%3)*0.06,0.36,bc[(i+s)%5],-0.9+i*0.22,0.55+s*0.75,0.05,g); }

// kitchen
{ box(7.5,1.0,1.0,'#e9e6df',-10.6,0.5,-10.3); box(7.6,0.08,1.1,'#cfd3da',-10.6,1.04,-10.3); box(7.5,0.8,0.5,'#e9e6df',-10.6,3.6,-10.7);
  box(1.0,2.4,0.9,'#c9ced6',-14.3,1.2,-10.3); box(0.06,1.2,0.05,'#888',-13.85,1.6,-9.83);
  box(0.6,0.5,0.45,'#222',-12.2,1.33,-10.4); cyl(0.12,0.1,0.25,'#e9e6df',-11.6,1.2,-10.2);
  box(3.2,1.0,1.2,'#5b4636',-10.2,0.5,-7.4); box(3.3,0.08,1.3,'#eaeaea',-10.2,1.04,-7.4);
  for(const x of [-11.2,-10.2,-9.2]){ cyl(0.22,0.22,0.08,'#2b2f3a',x,0.95,-6.5); cyl(0.04,0.04,0.9,'#888',x,0.45,-6.5,scene,8); }
  textPlane('☕ COFFEE BAR', 3, 0.4,'#ffd28a',-9.5,2.6,-10.78,0,0,'bold 70px sans-serif');
  for(let i=0;i<5;i++) box(0.3,0.35,0.3,['#e35d5b','#f2c14e','#58b368','#4f8fe6','#e9e6df'][i],-12.5+i*0.7,4.18,-10.6); }
// left wall decor: door, screen, clock, pictures
box(0.1,3.2,1.6,'#5a3b24',-RX+0.05,1.6,-3.5); cyl(0.06,0.06,0.15,'#d4af37',-RX+0.15,1.5,-2.95).rotation.z=Math.PI/2;
const wallScrTex={tex:null}; const wallScr=box(0.1,2.2,3.8,new THREE.MeshBasicMaterial({color:'#fff'}),-RX+0.08,3.3,3.5,scene,false);
box(0.08,2.35,3.95,'#0a0c10',-RX+0.04,3.3,3.5);
const clockTex=()=>canvasTex(256,256,(g)=>{ g.fillStyle='#f4f4f4'; g.beginPath(); g.arc(128,128,120,0,7); g.fill(); g.lineWidth=10; g.strokeStyle='#222'; g.stroke();
  const d=new Date(); const h=(d.getHours()%12+d.getMinutes()/60)/12*Math.PI*2, mi=d.getMinutes()/60*Math.PI*2; g.lineCap='round';
  g.lineWidth=10; g.beginPath(); g.moveTo(128,128); g.lineTo(128+Math.sin(h)*60,128-Math.cos(h)*60); g.stroke();
  g.lineWidth=6; g.beginPath(); g.moveTo(128,128); g.lineTo(128+Math.sin(mi)*95,128-Math.cos(mi)*95); g.stroke();
  for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; g.fillRect(128+Math.sin(a)*100-3,128-Math.cos(a)*100-3,6,6);} });
const clock=new THREE.Mesh(new THREE.CircleGeometry(0.55,32), new THREE.MeshBasicMaterial({map:clockTex()})); clock.position.set(-RX+0.02,4.4,-6.5); clock.rotation.y=Math.PI/2; scene.add(clock);
for(const [z,c] of [[-0.6,'#6aa0d8'],[0.4,'#d88a6a']]){ box(0.06,0.7,0.8,'#111',-RX+0.04,3.2,z); box(0.07,0.55,0.65,c,-RX+0.05,3.2,z,scene,false); }
// meeting room (glass)
{ const x0=0.5,x1=7.2,z0=-RZ,z1=-6.6; const gm=new THREE.MeshPhysicalMaterial({color:'#bfe0ff',transparent:true,opacity:0.16,roughness:0.05,depthWrite:false,side:THREE.DoubleSide});
  const pane=(w,x,z,ry)=>{ const p=new THREE.Mesh(new THREE.PlaneGeometry(w,3.2),gm); p.position.set(x,1.6,z); p.rotation.y=ry; scene.add(p); };
  pane(x1-x0-1.4,(x0+x1)/2+0.7,z1,0); pane(z1-z0,x0,(z0+z1)/2,Math.PI/2); pane(z1-z0,x1,(z0+z1)/2,Math.PI/2);
  for(const [x,z] of [[x0,z1],[x1,z1],[x0+1.4,z1]]) box(0.08,3.2,0.08,frameMat,x,1.6,z);
  box(x1-x0,0.08,0.08,frameMat,(x0+x1)/2,3.2,z1); box(0.08,0.08,z1-z0,frameMat,x0,3.2,(z0+z1)/2); box(0.08,0.08,z1-z0,frameMat,x1,3.2,(z0+z1)/2);
  box(3.4,0.08,1.5,'#3a2c22',3.9,0.8,-8.8); cyl(0.12,0.2,0.78,'#222',3.9,0.4,-8.8);
  for(const dx of [-1.1,0,1.1]){ chair(3.9+dx,-9.9,0); chair(3.9+dx,-7.7,Math.PI); }
  box(2.6,1.5,0.08,'#0a0c10',3.9,2.2,-10.75); const mt=box(2.45,1.38,0.02,new THREE.MeshBasicMaterial({map:canvasTex(512,288,(g,W,H)=>{g.fillStyle='#0c1730';g.fillRect(0,0,W,H);
    g.fillStyle='#7aa2ff';g.font='bold 34px sans-serif';g.fillText('團隊會議 TEAM SYNC',24,50); const v=[40,70,55,90,75,110,95]; v.forEach((h,i)=>{g.fillStyle='#4fd1c5';g.fillRect(40+i*62,H-30-h*1.6,40,h*1.6);});})}),3.9,2.2,-10.7,scene,false);
  textPlane('會議室', 2, 0.35,'#cfe0ff',3.9,3.0,-6.58,0,0); }
// server rack, whiteboard, tv
box(1.0,2.6,0.9,'#111318',13.8,1.3,-10.2); for(let i=0;i<8;i++) box(0.05,0.05,0.02,new THREE.MeshBasicMaterial({color:i%3?'#3ddc84':'#4f8fe6'}),13.5+(i%4)*0.18,0.6+Math.floor(i/4)*1.2,-9.74,scene,false);
{ const g=new THREE.Group(); g.position.set(14.2,0,-6); g.rotation.y=-Math.PI/2.4; scene.add(g); box(2,1.3,0.06,'#f4f4f4',0,1.9,0,g); box(0.05,1.3,0.05,'#888',-0.8,0.65,0.1,g); box(0.05,1.3,0.05,'#888',0.8,0.65,0.1,g);
  textPlane('Sprint: 草影對決 B', 1.8, 0.25,'#2b6cb0',14.2,2.3,-5.94,0,-Math.PI/2.4,'bold 60px sans-serif'); }
const dashTV=box(3.2,1.9,0.1,new THREE.MeshBasicMaterial({color:'#fff'}),9.5,3.4,-10.9,scene,false); box(3.35,2.05,0.08,'#0a0c10',9.5,3.4,-10.98);
// lounge
{ const r=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,0.03,64), M('#2f7d4a',{roughness:1})); r.position.set(-4,0.02,7.6); r.receiveShadow=true; scene.add(r);
  const sm=M('#3c6e78',{roughness:0.85}), sb=M('#4a525e',{roughness:0.9});
  box(6.2,0.5,1.1,sb,-4,0.25,10.2); box(6.2,0.9,0.35,sb,-4,0.75,10.6); box(1.1,0.5,3.0,sb,-6.6,0.25,8.2); box(0.35,0.9,3.0,sb,-7.0,0.75,8.2);
  for(let i=0;i<4;i++) box(1.35,0.22,0.9,sm,-6.1+i*1.45,0.6,10.15); for(let i=0;i<2;i++) box(0.9,0.22,1.35,sm,-6.55,0.6,7.4+i*1.45);
  box(2.0,0.1,1.1,'#b88a5a',-3.6,0.55,7.4); for(const [dx,dz] of [[-0.8,-0.4],[0.8,-0.4],[-0.8,0.4],[0.8,0.4]]) box(0.08,0.5,0.08,'#3a2c22',-3.6+dx,0.27,7.4+dz);
  cyl(0.15,0.15,0.12,'#e35d5b',-3.3,0.66,7.3);
  const lamp=new THREE.Group(); lamp.position.set(-0.8,0,9.8); scene.add(lamp); cyl(0.03,0.03,2.6,'#222',0,1.3,0,lamp,8); cyl(0.3,0.45,0.45,'#f5e6c8',0,2.6,0,lamp);
  // cafe table
  cyl(0.8,0.8,0.06,'#d7c3a3',-4.5,0.85,-2.5); cyl(0.06,0.06,0.85,'#333',-4.5,0.42,-2.5,scene,8);
  for(let i=0;i<4;i++){ const a=i*Math.PI/2+0.4; const c=chair(-4.5+Math.cos(a)*1.2,-2.5+Math.sin(a)*1.2,-a+Math.PI/2,scene,'#2a7f7a'); } }

{ // ping-pong + lockers
  const g=new THREE.Group(); g.position.set(3.6,0,8.3); scene.add(g);
  box(2.8,0.08,1.55,'#1f6f4a',0,0.78,0,g); box(2.8,0.02,0.03,new THREE.MeshBasicMaterial({color:'#fff'}),0,0.83,0,g,false); box(0.03,0.02,1.55,new THREE.MeshBasicMaterial({color:'#fff'}),0,0.83,0,g,false);
  box(0.04,0.18,1.65,'#eee',0,0.9,0,g); for(const [dx,dz] of [[-1.2,-0.6],[1.2,-0.6],[-1.2,0.6],[1.2,0.6]]) box(0.07,0.75,0.07,'#222',dx,0.38,dz,g);
  box(0.25,0.03,0.18,'#d33',-0.9,0.84,0.3,g); box(0.08,0.08,0.08,'#ffb347',0.5,1.1,-0.2,g);
  textPlane('乒乓球 PING-PONG',2.6,0.35,'#ffffffaa',3.6,0.05,9.55);
  for(let i=0;i<4;i++){ const lc=['#3b82f6','#ef4444','#22c55e','#f59e0b'][i]; box(0.7,2.2,0.6,lc,6.2+i*0.75,1.1,10.4); box(0.5,0.05,0.02,'#111',6.2+i*0.75,1.9,10.09); box(0.05,0.2,0.03,'#ddd',6.45+i*0.75,1.3,10.09); }
  // beanbags
  for(const [x,z,c] of [[-1.3,6.7,'#f59e0b'],[-1.0,8.2,'#a855f7']]){ const bb=new THREE.Mesh(new THREE.SphereGeometry(0.6,20,14),M(c,{roughness:0.95})); bb.scale.set(1,0.6,1); bb.position.set(x,0.35,z); bb.castShadow=bb.receiveShadow=true; scene.add(bb); }
  // arcade machine
  const ar=new THREE.Group(); ar.position.set(-14.3,0,5.6); ar.rotation.y=Math.PI/2; scene.add(ar);
  box(1.0,2.2,0.9,'#1e1b4b',0,1.1,0,ar); box(0.8,0.6,0.05,new THREE.MeshStandardMaterial({color:'#000',emissive:'#22d3ee',emissiveIntensity:1.2}),0,1.55,0.46,ar,false);
  box(0.9,0.12,0.4,'#312e81',0,1.05,0.55,ar); box(0.06,0.15,0.06,'#ef4444',-0.2,1.18,0.55,ar); box(0.08,0.05,0.08,'#facc15',0.15,1.13,0.6,ar);
  box(1.0,0.25,0.9,new THREE.MeshStandardMaterial({color:'#f0abfc',emissive:'#e879f9',emissiveIntensity:1}),0,2.1,0.02,ar);
  // lounge bookshelf
  const bs=new THREE.Group(); bs.position.set(-14.6,0,8.6); bs.rotation.y=Math.PI/2; scene.add(bs); box(2.4,2.6,0.5,'#5b3d26',0,1.3,0,bs);
  for(let sh=0;sh<3;sh++) for(let i=0;i<10;i++) box(0.17,0.48,0.36,['#e35d5b','#4f8fe6','#f2c14e','#58b368','#9b6bd3','#eee'][(i+sh*2)%6],-1.0+i*0.22,0.5+sh*0.8,0.05,bs);
}
for(const [x,z,s] of [[-14,11.6,1.2],[14,10,1.1],[-14,-4.8,1],[7.8,-7,1],[-1.5,-6,0.9],[6,6.6,1],[-8.5,5,0.9],[14,1.5,1],[-0.5,10.2,0.8]]) plant(x,z,s);
/* ---------- pickleball patio (real 44×20 ft → metres) ---------- */
{ const C=COURT, hx=C.length/2, hz=C.width/2;
  const patio=box(C.length+3.2,0.35,C.width+4.2,new THREE.MeshStandardMaterial({color:'#3d4658',roughness:0.95}),C.cx,-0.18,C.cz); patio.castShadow=false;
  const surf=box(C.length,0.04,C.width,new THREE.MeshStandardMaterial({color:'#2f6f4e',roughness:0.9}),C.cx,0.02,C.cz); surf.castShadow=false;
  const lineMat=new THREE.MeshBasicMaterial({color:'#f4f7fa'});
  const line=(w,d,x,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.03,d),lineMat); m.position.set(x,0.05,z); m.castShadow=false; scene.add(m); return m; };
  line(0.06,C.width,C.cx-hx,C.cz); line(0.06,C.width,C.cx+hx,C.cz);
  line(C.length,0.06,C.cx,C.cz-hz); line(C.length,0.06,C.cx,C.cz+hz);
  line(0.05,C.width,C.cx-C.nvz,C.cz); line(0.05,C.width,C.cx+C.nvz,C.cz);
  line(0.04,C.width,C.cx,C.cz);
  const netG=new THREE.Group(); netG.position.set(C.cx,0,C.cz); scene.add(netG);
  cyl(0.07,0.07,C.netHSide,'#dddddd',0,C.netHSide/2,-hz-0.05,netG,10);
  cyl(0.07,0.07,C.netHSide,'#dddddd',0,C.netHSide/2,hz+0.05,netG,10);
  const net=new THREE.Mesh(new THREE.PlaneGeometry(C.width,C.netHCenter),
    new THREE.MeshStandardMaterial({color:'#111',transparent:true,opacity:0.55,side:THREE.DoubleSide,roughness:0.8}));
  net.rotation.y=Math.PI/2; net.position.set(0,C.netHCenter/2,0); netG.add(net);
  box(0.04,0.03,C.width,'#f8fafc',0,C.netHCenter+0.02,0,netG,false);
  textPlane('PICKLEBALL 44×20 ft', C.length*0.55, 0.32, '#cfe8d8', C.cx, 0.06, C.cz+hz+0.85);
}
// lights (practicals)
const lamps=[];
for(const [x,y,z] of [[-10,4.8,1],[10,4.8,-2.8],[1,4.8,2.6],[10.5,4.8,6.8],[-4,4.8,7.6],[-10,4.8,-8],[3.9,3.4,-8.8]]){
  const p=new THREE.PointLight('#ffd9a0',0,16,1.6); p.position.set(x,y,z); scene.add(p); lamps.push(p); }

/* ---------- Minecraft bots ---------- */
const SKINS=['#f1c9a5','#e0ac85','#c68863','#f5d5b8'];
function faceTex(skin, hair, glasses){ return canvasTex(64,64,(g)=>{ g.imageSmoothingEnabled=false; g.fillStyle=skin; g.fillRect(0,0,64,64);
  g.fillStyle=hair; g.fillRect(0,0,64,16); g.fillRect(0,16,8,8); g.fillRect(56,16,8,8);
  g.fillStyle='#fff'; g.fillRect(12,32,12,8); g.fillRect(40,32,12,8); g.fillStyle='#3b2a6b'; g.fillRect(18,32,6,8); g.fillRect(40,32,6,8);
  g.fillStyle='rgba(0,0,0,0.25)'; g.fillRect(28,42,8,4); g.fillStyle='#8a4b3a'; g.fillRect(22,50,20,4);
  if(glasses){ g.strokeStyle='#111'; g.lineWidth=3; g.strokeRect(10,30,16,12); g.strokeRect(38,30,16,12); g.fillStyle='#111'; g.fillRect(26,34,12,3);} }); }
function shirtTex(c, dark){ return canvasTex(32,32,(g)=>{ g.fillStyle=c; g.fillRect(0,0,32,32); g.fillStyle=dark; g.fillRect(0,28,32,4); g.fillRect(12,0,8,4); }); }
const HAIRS=['#3a2618','#1b1b1b','#6b4423','#d9b26f','#5a3a29'];
const bots={}, botList=[];
function makeBot(name, team, role, color, acc, idx){
  const root=new THREE.Group(); scene.add(root);
  const col=new THREE.Color(color), dark=col.clone().multiplyScalar(0.55).getStyle(), pants=col.clone().multiplyScalar(0.3).lerp(new THREE.Color('#1f2a44'),0.6).getStyle();
  const skin=SKINS[idx%4], hair=HAIRS[idx%5];
  const glasses=/glasses/.test(acc);
  const skinM=new THREE.MeshStandardMaterial({color:skin,roughness:0.75,metalness:0.05}), shirtM=new THREE.MeshStandardMaterial({map:shirtTex(color,dark),roughness:0.8});
  const hip=new THREE.Group(); hip.position.y=0.75; root.add(hip);
  const torso=box(0.5,0.75,0.25,shirtM,0,0.375,0,hip);
  const headP=new THREE.Group(); headP.position.y=0.75; hip.add(headP);
  const hairM=new THREE.MeshStandardMaterial({color:hair,roughness:0.75,metalness:0.05}); const fm=new THREE.MeshStandardMaterial({map:faceTex(skin,hair,glasses),roughness:0.8});
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5),[skinM,skinM,hairM,skinM,fm,hairM]); head.position.y=0.25; head.castShadow=true; headP.add(head);
  const limb=(x,y,m,len=0.75)=>{ const p=new THREE.Group(); p.position.set(x,y,0); const b=box(0.25,len,0.25,m,0,-len/2,0,p); return p; };
  const armR=limb(-0.375,0.72,shirtM), armL=limb(0.375,0.72,shirtM); hip.add(armR,armL);
  // hands skin
  box(0.251,0.2,0.251,skinM,0,-0.65,0,armR); box(0.251,0.2,0.251,skinM,0,-0.65,0,armL);
  const pm=new THREE.MeshStandardMaterial({color:pants,roughness:0.75,metalness:0.05}), shoeM=new THREE.MeshStandardMaterial({color:'#222',roughness:0.75}); const legR=limb(-0.125,0,pm), legL=limb(0.125,0,pm); hip.add(legR,legL);
  box(0.26,0.12,0.27,shoeM,0,-0.7,0.01,legR); box(0.26,0.12,0.27,shoeM,0,-0.7,0.01,legL);
  const hand=new THREE.Group(); hand.position.set(0,-0.75,0.15); armR.add(hand);
  const A=(w,h,d,c,x,y,z,p=headP)=>box(w,h,d,c,x,y,z,p);
  if(acc==='antenna'){ A(0.56,0.06,0.1,'#222',0,0.52,0); A(0.08,0.18,0.18,'#222',-0.28,0.25,0); A(0.08,0.18,0.18,'#222',0.28,0.25,0); A(0.18,0.04,0.04,'#222',0.22,0.12,0.22);
    A(0.04,0.3,0.04,'#ddd',0.15,0.65,0); A(0.1,0.1,0.1,new THREE.MeshStandardMaterial({color:'#c4b5fd',emissive:'#a78bfa',emissiveIntensity:1.5}),0.15,0.82,0); }
  if(acc==='antenna2'){ A(0.04,0.35,0.04,'#ccc',-0.12,0.65,0); A(0.04,0.35,0.04,'#ccc',0.12,0.65,0); for(const x of [-0.12,0.12]) A(0.1,0.1,0.1,new THREE.MeshStandardMaterial({color:'#5eead4',emissive:'#14b8a6',emissiveIntensity:1.5}),x,0.85,0); }
  if(acc==='paddle'){ box(0.06,0.3,0.06,'#333',0,-0.05,0,hand); box(0.3,0.35,0.04,'#bef264',0,-0.35,0,hand); A(0.52,0.08,0.52,'#ecfccb',0,0.5,0); A(0.52,0.04,0.2,'#ecfccb',0,0.47,0.33); }
  if(acc==='toolbelt'){ box(0.54,0.12,0.29,'#7c4a1e',0,0.06,0,hip); box(0.1,0.18,0.08,'#9ca3af',0.15,0,0.17,hip); box(0.06,0.2,0.06,'#facc15',-0.15,0,0.17,hip); A(0.54,0.12,0.54,'#facc15',0,0.52,0); }
  if(acc==='glasses_book'){ box(0.32,0.4,0.1,'#b91c1c',0,-0.1,0.05,hand); A(0.6,0.04,0.6,'#111',0,0.53,0); A(0.3,0.1,0.3,'#111',0,0.6,0); }
  if(acc==='glasses_clip'){ box(0.3,0.4,0.03,'#a0784c',0,-0.12,0.05,hand); box(0.24,0.28,0.01,'#fff',0,-0.14,0.07,hand); A(0.52,0.08,0.52,hairM,0,0.52,0); }
  if(acc==='glasses_laptop'){ box(0.45,0.03,0.32,'#c0c4cc',0,-0.05,0.1,hand); box(0.03,0.3,0.32,'#c0c4cc',-0.2,0.1,0.1,hand); }
  if(acc==='hoodie'){ box(0.54,0.45,0.15,shirtM,0,0.0,-0.3,headP).position.set(0,0.15,-0.28); box(0.04,0.25,0.02,'#eee',-0.08,0.6,0.135,hip); box(0.04,0.25,0.02,'#eee',0.08,0.6,0.135,hip); }
  if(acc==='beret_tablet'){ const b=cyl(0.33,0.33,0.1,'#be185d',0.04,0.55,0,headP); b.rotation.z=0.15; A(0.06,0.08,0.06,'#be185d',0.04,0.63,0);
    box(0.35,0.45,0.04,'#111',0,-0.15,0.06,hand); box(0.3,0.38,0.01,new THREE.MeshStandardMaterial({color:'#f9a8d4',emissive:'#f472b6',emissiveIntensity:0.6}),0,-0.15,0.085,hand); }
  if(acc==='wand'){ box(0.04,0.5,0.04,'#ddd',0,-0.15,0.05,hand).rotation.x=0.6; const st=box(0.15,0.15,0.15,new THREE.MeshStandardMaterial({color:'#fde68a',emissive:'#facc15',emissiveIntensity:2}),0,-0.42,0.25,hand); st.rotation.z=0.78;
    A(0.56,0.1,0.56,'#4c1d95',0,0.52,0); A(0.3,0.3,0.3,'#4c1d95',0,0.7,0).rotation.y=0.78; }
  if(acc==='cap'){ A(0.54,0.14,0.54,'#dc2626',0,0.53,0); A(0.5,0.05,0.3,'#dc2626',0,0.47,0.38); }
  if(acc==='chart'){ box(0.4,0.35,0.03,'#fff',0,-0.15,0.06,hand); for(let i=0;i<3;i++) box(0.07,0.08+i*0.08,0.01,'#f97316',-0.1+i*0.1,-0.27+i*0.04,0.08,hand); A(0.52,0.08,0.52,hairM,0,0.52,0); }
  if(acc==='magnifier'){ box(0.05,0.25,0.05,'#5b3a1e',0,-0.1,0.05,hand); const ring=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.03,8,20),M('#d4d4d4',{metalness:0.8,roughness:0.2})); ring.position.set(0,-0.36,0.05); hand.add(ring);
    A(0.56,0.06,0.56,'#78350f',0,0.52,0); A(0.42,0.18,0.42,'#78350f',0,0.62,0); }
  if(acc==='pen'){ box(0.04,0.3,0.04,'#111',0,-0.1,0.08,hand); A(0.52,0.18,0.15,hairM,0,0.3,-0.3); box(0.35,0.45,0.03,'#fde2e4',0,-0.15,0.03,hand).position.x=0; }
  // role outfit: team badge for everyone, tie for supervisors, work style per role
  const tc=(TEAMS[team]&&TEAMS[team].c)||'#94a3b8'; box(0.12,0.08,0.02,M(tc,{emissive:tc,emissiveIntensity:0.4}),0.13,0.58,0.135,hip,false);
  if(/主管|Lily|帶隊|總助理/.test(name+role)){ box(0.08,0.4,0.02,M(col.clone().offsetHSL(0.5,0,-0.1).getStyle()),0,0.48,0.135,hip,false); }
  const work=/設計|UI|特效|Visual/.test(name+role)?'draw':/研究|數據|營運|學校/.test(name+role)?'read':/劇本|編劇|事務|雜務/.test(name+role)?'write':'type';
  // status ring under feet (colour = current state, animated by botStateFx)
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.38,0.48,28),new THREE.MeshBasicMaterial({color:'#8a93ad',transparent:true,opacity:0.7,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=0.02; root.add(ring);
  // optional looks parts (3D glasses frame + hat slot), toggled by applyLooks
  const glassG=new THREE.Group(); headP.add(glassG); const gm=new THREE.MeshStandardMaterial({color:'#111',roughness:0.4});
  box(0.2,0.14,0.02,gm,-0.13,0.2,0.26,glassG); box(0.2,0.14,0.02,gm,0.13,0.2,0.26,glassG); box(0.08,0.03,0.02,gm,0,0.23,0.26,glassG);
  glassG.visible=false; const hatG=new THREE.Group(); headP.add(hatG);
  root.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.userData.bot=name; } });
  const label=document.createElement('div'); label.className='lb'; document.getElementById('labels').appendChild(label);
  const bub=document.createElement('div'); bub.className='bub'; bub.style.display='none'; document.getElementById('labels').appendChild(bub);
  const b={name,team,role,color,acc,root,hip,headP,armR,armL,legR,legL,hand,label,bub,status:'idle',step:'',pos:new THREE.Vector3(),face:0,
    skin,hair,glasses,mats:{skin:skinM,hair:hairM,shirt:shirtM,pants:pm,shoe:shoeM,face:fm},glassG,hatG,torso,ring,work,pose:{la:0,ra:0,ll:0,rl:0,hx:0,hy:0,hz:0,hipY:0.75,lz:0,rz:0},seat:null,mode:'sit',path:[],t:Math.random()*10,bubT:0,paper:null,onArrive:null,cheer:0};
  bots[norm(name)]=b; botList.push(b); return b;
}
BOTS.forEach((d,i)=>makeBot(...d,i));
/* custom looks: {looks:{name:{color|shirt,skin,hair,pants,shoes,hat,hatColor,glasses}}} — every field applies to its own per-bot material */
const isCol=c=>typeof c==='string'&&/^(#[0-9a-f]{3,8}|rgb|hsl|[a-z]+$)/i.test(c.trim());
function applyLooks(b,L){ if(!L||typeof L!=='object') return; const m=b.mats; const c=L.shirt||L.color;
  if(isCol(c)){ b.color=c; const col=new THREE.Color(c); m.shirt.map=shirtTex(c,col.clone().multiplyScalar(0.55).getStyle()); m.shirt.needsUpdate=true;
    if(!isCol(L.pants)) m.pants.color.copy(col.clone().multiplyScalar(0.3).lerp(new THREE.Color('#1f2a44'),0.6)); }
  if(isCol(L.skin)){ b.skin=L.skin; m.skin.color.set(L.skin); }
  if(isCol(L.hair)){ b.hair=L.hair; m.hair.color.set(L.hair); }
  if(isCol(L.pants)) m.pants.color.set(L.pants);
  if(isCol(L.shoes)) m.shoe.color.set(L.shoes);
  if(L.glasses!==undefined) b.glassG.visible=!!L.glasses&&!b.glasses;
  if(L.hat!==undefined){ b.hatG.clear(); const hc=isCol(L.hatColor)?L.hatColor:isCol(L.hat)?L.hat:'#dc2626'; const k=String(L.hat).toLowerCase();
    if(L.hat&&k!=='none'&&k!=='false'){ if(k==='beanie') box(0.56,0.2,0.56,hc,0,0.56,0,b.hatG);
      else if(k==='crown'){ box(0.54,0.1,0.54,M(hc,{metalness:0.7,roughness:0.3}),0,0.55,0,b.hatG); for(const x of [-0.2,0,0.2]) box(0.1,0.14,0.1,M(hc,{metalness:0.7,roughness:0.3}),x,0.66,0.22,b.hatG); }
      else if(k==='tophat'){ box(0.7,0.04,0.7,hc,0,0.52,0,b.hatG); box(0.45,0.4,0.45,hc,0,0.74,0,b.hatG); }
      else { box(0.54,0.14,0.54,hc,0,0.57,0,b.hatG); box(0.5,0.05,0.3,hc,0,0.51,0.38,b.hatG); } } }
  m.face.map=faceTex(b.skin,b.hair,b.glasses); m.face.needsUpdate=true; }

// assign seats
const used={}; function assignSeat(b){ const arr=seats[b.team]||seats.Ops; used[b.team]=used[b.team]||0;
  let s=arr[used[b.team]++]; if(!s){ s={seat:new THREE.Vector3(-12+Math.random()*3,0,4+Math.random()*2),face:Math.PI,scr:null}; }
  b.seat=s; b.pos.copy(s.seat); b.face=s.face; }
botList.forEach(assignSeat);

/* ---------- behaviour ---------- */
const LOUNGE=[[-4.5,9.4],[-3,9.4],[-6,8.2],[-2,6],[-10,-6.3],[-9.2,-6.3],[-4.5,-1.2],[-3.3,-2.5]];
const MEET=[[2.8,-9.8],[3.9,-9.8],[5,-9.8],[2.8,-7.8],[3.9,-7.8],[5,-7.8]];
/* ---------- collision / pathing (programmer) ---------- */
const COL=createCollision(Object.values(seats).flat().filter(s=>s.g).map(s=>({x:s.g.position.x,z:s.g.position.z,rot:s.g.rotation.y})),[...courtObstacles(),...courtLines()]);
const colStats={frames:0,inside:0,last:null};
function walkTo(b,x,z,cb){ const g=COL.safeGoal(x,z);
  b.path=COL.plan(b.pos.x,b.pos.z,g.x,g.z).map(p=>new THREE.Vector3(p.x,0,p.z)); b.mode='walk'; b.onArrive=cb; }
function collisionTick(){ for(const b of botList){ if(b.mode!=='walk') continue; colStats.frames++; const h=COL.hitAt(b.pos.x,b.pos.z); if(h){ colStats.inside++; colStats.last=b.name+'@'+h.n; } } }
function drawCollisionDebug(){ const mat=new THREE.MeshBasicMaterial({color:'#ff2bd6',transparent:true,opacity:0.45,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
  const lineMat=new THREE.MeshBasicMaterial({color:'#2ee6ff',transparent:true,opacity:0.7,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
  for(const o of COL.obstacles){ const m=new THREE.Mesh(o.r!==undefined?new THREE.CircleGeometry(o.r,24):new THREE.PlaneGeometry(o.w,o.d),o.pass?lineMat:mat);
    m.rotation.set(-Math.PI/2,0,0); if(o.rot) m.rotation.z=o.rot; m.position.set(o.x,0.08,o.z); m.renderOrder=999; scene.add(m); } }
function goSeat(b){ walkTo(b,b.seat.seat.x,b.seat.seat.z,()=>{ b.mode='sit'; b.face=b.seat.face; }); }
function setStatus(b,st,step,anim=true){ if(typeof setBotState==='function') setBotState(b,st,step); else { b.status=STATUS[st]?st:'idle'; if(step!==undefined) b.step=step; }
  if(b.seat.scr){ const m=b.seat.scr.material; m.emissive.set(st==='error'?'#ff3344':st==='working'?TEAMS[b.team]?.c||'#7c8cff':'#334'); m.emissiveIntensity=st==='working'?0.9:st==='error'?1.1:0.2; }
  if(!anim){ if(b.status==='idle'){ const p=LOUNGE[botList.indexOf(b)%LOUNGE.length]; b.pos.set(p[0],0,p[1]); b.mode='stand'; } else { b.pos.copy(b.seat.seat); b.face=b.seat.face; b.mode='sit'; } return; }
  if(b.busy) return;
  if(b.status==='idle'){ const p=LOUNGE[Math.floor(Math.random()*LOUNGE.length)]; walkTo(b,p[0]+Math.random()*0.4,p[1],()=>{ b.mode='stand'; }); }
  else if(b.status==='done'){ b.cheer=2.5; if(b.mode!=='sit') goSeat(b); }
  else if(b.status==='waiting_user'){ if(b.mode==='sit'||b.mode==='stand') { b.mode='standdesk'; b.pos.copy(b.seat.seat); } else goSeat(b); }
  else if(b.mode!=='sit') goSeat(b);
}
/* ---------- bot state → behaviour (programmer) ----------
   Every bot has  b.state = {status, step, since}  (since = ms timestamp of the message that set it).
   API (also on window.__office):
     applyBotState(nameOrBot, status, step, {ts, anim})  – the single entry point for status messages
     getBotState(name) -> {status, step, since} | null
     onStateChange(fn)  – fn(bot, newState, prevState); returns an unsubscribe function
   Behaviour: anim=true  → walk now (non-idle: to own seat; idle: lounge) and play the state.
              anim=false (message >30s old / history replay) → record state only; ~0.8s after the
              replay goes quiet, settleStates() walks every bot to the place for its LATEST state.
   Visuals: if a setBotState(bot,status,step) function exists (Visual's BotAnim section) it is called
   to set b.status/b.step; continuous animation reads b.status every frame. No animation code here. */
const stateListeners=new Set();
function onStateChange(fn){ stateListeners.add(fn); return ()=>stateListeners.delete(fn); }
function getBotState(n){ const b=typeof n==='object'?n:findBot(n); return b?(b.state?{...b.state}:{status:b.status,step:b.step,since:0}):null; }
let settleTimer=null;
function applyBotState(n,status,step='',live={anim:true}){ const b=typeof n==='object'?n:findBot(n); if(!b) return null;
  const prev=b.state||null, st=STATUS[status]?status:'idle';
  b.state={status:st,step:String(step||''),since:live.ts||Date.now()};
  if(live.anim) setStatus(b,st,b.state.step,true);
  else { if(typeof setBotState==='function') setBotState(b,st,b.state.step); else { b.status=st; b.step=b.state.step; }
    b.needsSettle=true; clearTimeout(settleTimer); settleTimer=setTimeout(settleStates,800); }
  stateListeners.forEach(fn=>{ try{ fn(b,{...b.state},prev); }catch(e){ console.warn(e); } });
  return b; }
// persistent step text under the nameplate (Visual's branch has its own step label; keep one when merging)
// merged: step text shown via Visual stepLine (stepTag unused)
const stepTag=b=>b.step&&b.status!=='idle'&&!b.busy?`<span class="np" style="display:block;font-size:10px;opacity:.85;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.step.length>30?b.step.slice(0,29)+'…':b.step)}</span>`:'';
function settleStates(){ for(const b of botList){ if(!b.needsSettle) continue; b.needsSettle=false;
  if(b.pickle) continue; // mid-match; work-priority release handled in pickle controller
  const s=b.state; if(s.status==='idle'&&(b.mode==='stand'||b.mode==='walk')) continue; // already in the lounge
  setStatus(b,s.status,s.step,true); } }
function say(b,text,ms=4500){ b.bub.textContent=text; b.bub.style.display='block'; b.bubT=ms/1000; }
function handover(fromB,toB,text,isTask){
  if(!toB) return; const roy=!fromB; arc(fromB?fromB.name:'Roy',toB.name,text,isTask?'#f5c542':'#4fd1c5'); if(roy) laser(toB);
  if(roy){ // envelope flies from the door
    const p=box(0.3,0.04,0.22,new THREE.MeshStandardMaterial({color:'#fff',emissive:'#fff',emissiveIntensity:0.3}),-RX+0.5,2,-3.5);
    flights.push({m:p,from:new THREE.Vector3(-RX+0.5,2,-3.5),to:()=>toB.root.position.clone().add(new THREE.Vector3(0,1.6,0)),t:0,dur:2.2,done:()=>{ say(toB,(isTask?'📋 ':'💬 ')+'Roy：'+text); toB.cheer=0.8; }});
    return; }
  if(fromB.busy) return; fromB.busy=true; const prev=fromB.status; fromB.status='talking';
  const tgt=toB.mode==='sit'||toB.mode==='standdesk'?toB.seat.seat:toB.pos; const dir=new THREE.Vector3(1,0,0.4).normalize();
  const spot=tgt.clone().add(dir.multiplyScalar(1.0));
  walkTo(fromB,spot.x,spot.z,()=>{ fromB.mode='talk'; fromB.face=Math.atan2(toB.pos.x-fromB.pos.x,toB.pos.z-fromB.pos.z);
    toB.talkFace=Math.atan2(fromB.pos.x-toB.pos.x,fromB.pos.z-toB.pos.z); toB.talking=4;
    say(fromB,(isTask?'📋 ':'💬 ')+text);
    const p=box(0.3,0.03,0.22,new THREE.MeshStandardMaterial({color:'#fff',emissive:'#ffffff',emissiveIntensity:0.2}),0,0,0);
    flights.push({m:p,from:fromB.root.position.clone().add(new THREE.Vector3(0,1.3,0)),to:()=>toB.root.position.clone().add(new THREE.Vector3(0,1.3,0)),t:-1.2,dur:1.1,arc:0.8,
      done:()=>{ say(toB,isTask?'收到！我跟 👍':'好，明白 🙂',3000); }});
    setTimeout(()=>{ fromB.busy=false; fromB.status=prev==='talking'?'working':prev; setStatus(fromB,fromB.status); },4200);
  });
}
const flights=[];

/* ---------- events / feed ---------- */
const feedEl=document.getElementById('feed'); const feed=[];
function addFeed(name,text,st,ts=Date.now()){ feed.unshift({name,text,st,ts}); if(feed.length>80) feed.pop();
  const d=new Date(ts); const el=document.createElement('div'); el.className='fi';
  el.innerHTML=`<span class="t">${d.toLocaleTimeString('zh-HK',{hour:'2-digit',minute:'2-digit',hour12:false})}</span><span><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${STATUS[st]?.c||'#8a93ad'};margin-right:5px"></i><b>${esc(name)}</b> ${esc(text)}</span>`;
  feedEl.prepend(el); const sp=el.lastChild, full=sp.innerHTML, txt=sp.textContent; if(Date.now()-ts<30000){ let k=0; sp.textContent=''; const iv=setInterval(()=>{ k+=2; sp.textContent=txt.slice(0,k)+'▌'; if(k>=txt.length){ clearInterval(iv); sp.innerHTML=full; } },30); } while(feedEl.children.length>80) feedEl.lastChild.remove(); }
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function findBot(n){ return bots[norm(n)] || botList.find(b=>norm(b.name).includes(norm(n))||norm(n).includes(norm(b.name))); }
let usage=null;
function ensureBot(n,group){ let b=findBot(n); if(b) return b; const team=group&&TEAMS[group]?group:'Ops';
  b=makeBot(n,team,'',['#a3a3a3','#94a3b8','#c084fc'][botList.length%3],'none',botList.length); assignSeat(b); buildTeam(); return b; }
function handle(o, live){
  if(!o||typeof o!=='object') return;
  if(o.roster) o.roster.forEach(n=>ensureBot(n));
  if(o.groups) for(const n in o.groups){ const b=findBot(n); if(!b) ensureBot(n,o.groups[n]); }
  if(o.looks) for(const n in o.looks){ const b=ensureBot(n); applyLooks(b,o.looks[n]); }
  if(o.chat) for(const n in o.chat){ const b=findBot(n); if(b) b.chat=o.chat[n]; }
  if(o.type==='usage'){ usage=o; renderUsage(); addFeed('系統',`本週用量 ${o.total_used_pct}%`,'idle',live.ts); }
  if(o.routines){ const r=o.routines; addFeed(r.bot,`定時任務 ${r.items?.length||0} 個`,'idle',live.ts); }
  if(o.bot&&o.status){ const b=ensureBot(o.bot); applyBotState(b,o.status,o.step||'',live); addFeed(b.name,(STATUS[b.status]?.zh||o.status)+(o.step?'：'+o.step:''),b.status,live.ts); if(live.anim&&o.step) say(b,o.step,3000); if(LIVE&&live.anim&&b.status==='waiting_user') confirmBox(b,o.step||'需要你決定',['A：批准繼續','B：退回修改'],ch=>post({say:{from:'Roy',to:b.name,text:ch}})); }
  if(o.say){ const s=o.say, to=findBot(s.to), from=s.from==='Roy'?null:findBot(s.from); addFeed(s.from||'?',`→ ${s.to}：${s.text}`,'talking',live.ts); if(live.anim&&to) handover(from,to,s.text,false); }
  if(o.task){ const t=o.task, to=findBot(t.to), from=t.from==='Roy'?null:findBot(t.from); addFeed(t.from||'?',`交任務俾 ${t.to}：${t.title}${t.status?'（'+t.status+'）':''}`,'talking',live.ts); if(live.anim&&to) handover(from,to,t.title,true); }
  buildTeam();
}

/* ---------- ntfy (connection logic) ----------
   Live mode = URL #hash topic. Transport = 3s HTTP poll of /json?poll=1&since=<lastId> (iPhone Safari
   receives nothing over SSE, so SSE was removed). Every message id is applied once; after failures the
   next successful poll resumes from lastId, so missed messages are caught up. Topic is never displayed.
   Optional ?ntfy=http://localhost:PORT points at a local mock server (tests only; localhost only). */
const topic=decodeURIComponent(location.hash.slice(1)).trim();
const LIVE=/^[\w-]{1,64}$/.test(topic);
const NTFY=(()=>{ const q=new URLSearchParams(location.search).get('ntfy'); return q&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(q)?q:'https://ntfy.sh'; })();
const POLL_MS=+(new URLSearchParams(location.search).get('pollms'))||3000;
let sim=!LIVE;
const net={transport:'poll',state:'off',polls:0,okPolls:0,fails:0,consecFails:0,lastErr:'',applied:0,dupes:0,bad:0,lastId:null,lastTime:0};
const seenIds=new Set();
const modeEl=document.getElementById('mode');
document.getElementById('mode').textContent=LIVE?'● Live · 連線中…':'模擬 Demo';
document.getElementById('feedsrc').textContent=LIVE?'ntfy':'Simulated';
function renderNet(){ if(!LIVE) return; let t=net.state==='error'?`⚠ 連線失敗（${net.lastErr}）· ${net.applied} 條`:`● Live · ${net.applied} 條`;
  if(net.bad) t+=` · 壞訊息 ${net.bad}`; modeEl.textContent=t; modeEl.title=`poll ${net.okPolls}/${net.polls}，失敗 ${net.fails}，重複 ${net.dupes}`; }
function ntfyOnMessage(data){
  let m; try{ m=typeof data==='string'?JSON.parse(data):data; }catch(e){ net.bad++; return; }
  if(!m||typeof m!=='object'||m.event!=='message') return;
  if(m.id){ if(seenIds.has(m.id)){ net.dupes++; return; } seenIds.add(m.id); net.lastId=m.id; }
  net.lastTime=Math.max(net.lastTime,m.time||0);
  let o; try{ o=JSON.parse(m.message); }catch(e){ net.bad++; return; }
  if(!o||typeof o!=='object'){ net.bad++; return; }
  const ts=(m.time||Date.now()/1000)*1000;
  try{ handle(o,{ts,anim:Date.now()-ts<30000}); net.applied++; }catch(err){ net.bad++; console.warn('ntfy handle error',err); }
}
let polling=false;
async function pollOnce(){ if(polling) return; polling=true; net.polls++;
  try{ const since=net.lastId||'12h';
    const r=await fetch(`${NTFY}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const txt=await r.text();
    for(const ln of txt.split('\n')){ if(ln.trim()) ntfyOnMessage(ln); }
    net.okPolls++; net.consecFails=0; net.state='open'; net.lastErr='';
  }catch(e){ net.fails++; net.consecFails++; net.state='error'; net.lastErr=String(e&&e.message||e).slice(0,40); }
  finally{ polling=false; renderNet(); } }
if(LIVE){ pollOnce(); setInterval(pollOnce,POLL_MS); document.getElementById('simbtn').style.display='none'; }
async function post(o){ if(LIVE){ await fetch(`${NTFY}/${encodeURIComponent(topic)}`,{method:'POST',body:JSON.stringify(o)}); } else handle(o,{ts:Date.now(),anim:true}); }

/* ---------- simulation ---------- */
function simTick(){ if(!sim) return; const r=Math.random();
  if(r<0.22){ const team=['Roblox','YouTube','Ops'][Math.floor(Math.random()*3)]; const mem=botList.filter(b=>b.team===team&&!b.busy&&!inFlow.has(b));
    if(mem.length>1){ const a=mem[Math.floor(Math.random()*mem.length)]; let c=mem[Math.floor(Math.random()*mem.length)]; if(c===a) c=mem.find(x=>x!==a);
      const titles=['交接測試報告','新 HUD 設計稿','今日選題清單','腳本初稿','賽程表','Branch 合併結果','字幕檔'];
      handle({task:{from:a.name,to:c.name,title:titles[Math.floor(Math.random()*titles.length)],status:'交接'}},{ts:Date.now(),anim:true}); } }
  else { const b=botList[Math.floor(Math.random()*botList.length)]; if(b.busy||inFlow.has(b)) return;
    const sts=['working','working','working','thinking','idle','waiting_user','done','error']; const st=sts[Math.floor(Math.random()*(r>0.97?8:7))];
    const steps=STEPS[b.team]||STEPS.Ops; handle({bot:b.name,status:st,step:steps[Math.floor(Math.random()*steps.length)]},{ts:Date.now(),anim:true}); } }
if(!LIVE){ botList.forEach((b,i)=>setStatus(b,['working','working','thinking','idle','working','waiting_user','working'][i%7],(STEPS[b.team])[i%4],false));
  addFeed('Lily','示範模式：喺網址後面加 #topic 就會連 ntfy 實時資料','idle'); setInterval(simTick,2600); }
else botList.forEach(b=>setStatus(b,'idle','',false));
document.getElementById('simbtn').onclick=e=>{ sim=!sim; e.target.textContent=sim?'⏹ 停止模擬':'▶ 開始模擬'; };

/* ---------- UI ---------- */
const teamEl=document.getElementById('team'), toSel=document.getElementById('to');
const AV={antenna:'📡',paddle:'🏓',toolbelt:'🧰',glasses_book:'📚',glasses_clip:'📋',glasses_laptop:'💻',hoodie:'🧑‍💻',beret_tablet:'🎨',wand:'✨',cap:'🎬',chart:'📈',antenna2:'🤖',magnifier:'🔎',pen:'✍️'};
function tool(step){ const s=(step||'').toLowerCase();
  if(/search|搜|研究|查|選題|熱門/.test(s)) return '🔍 WebSearch'; if(/bash|腳本|測試|branch|git|luau|bug|code|執行/.test(s)) return '⌨️ Bash';
  if(/browser|網|gmail|數據|儀表板|票務/.test(s)) return '🌐 Browser'; if(/write|寫|劇本|通告|稿/.test(s)) return '✍️ Write';
  if(/edit|調|修|改|剪/.test(s)) return '✏️ Edit'; return '📖 Read'; }
function buildTeam(){ document.getElementById('tc').textContent=botList.length;
  teamEl.innerHTML=botList.map(b=>{ const S=STATUS[b.busy?'talking':b.status]; return `<div class="ac${toSel.value===b.name?' on':''}" data-n="${esc(b.name)}"><span class="av2" style="background:${b.color}">${AV[b.acc]||'🙂'}</span>
   <div><div class="n">${esc(b.name)}</div><div class="r">${esc(b.role)}</div><span class="sd" style="color:${S.c}">● ${S.zh}</span><div class="a">${esc(b.step||'—')}</div></div></div>`; }).join('');
  if(toSel.options.length!==botList.length) toSel.innerHTML=botList.map(b=>`<option>${esc(b.name)}</option>`).join('');
  const c=s=>botList.filter(b=>!b.busy&&b.status===s).length;
  document.getElementById('cW').textContent=c('working')+c('thinking'); document.getElementById('cT').textContent=botList.filter(b=>b.busy).length; document.getElementById('cA').textContent=c('error')+c('waiting_user');
  document.getElementById('topstat').textContent=`Roy 嘅 AI 辦公室 · ${c('working')} 執行中`;
  document.getElementById('stats').innerHTML=usage?`本週用量 ${usage.total_used_pct}%`:''; }
function buildTeamOld(){
  teamEl.innerHTML=botList.map(b=>{ const S=STATUS[b.status]; return `<div class="tm" data-n="${esc(b.name)}"><span class="dot" style="background:${b.color}"></span>
   <div><div class="n">${esc(b.name)} <span class="r">${esc(b.role)}</span></div><div class="st">${esc(b.step||'—')}</div></div><span class="s" style="color:${S.c}">● ${S.zh}</span></div>`; }).join('');
  if(toSel.options.length!==botList.length) toSel.innerHTML=botList.map(b=>`<option>${esc(b.name)}</option>`).join('');
  const cnt=s=>botList.filter(b=>b.status===s).length;
  document.getElementById('stats').innerHTML=`<span style="color:#aab4ff">● ${cnt('working')} 工作中</span><span style="color:#ffb27a">● ${cnt('waiting_user')} 等你</span><span style="color:#f5d36b">● ${cnt('thinking')} 思考中</span><span>○ ${cnt('idle')} 閒置</span><span style="color:#ff7a86">● ${cnt('error')} 出錯</span>`+(usage?`<span>本週用量 ${usage.total_used_pct}%</span>`:''); }
// camera zoom by stage aspect: landscape (a>=1) unchanged (1.2 / 2.2); portrait zooms in less so the
// whole office / the whole team cluster stays visible (scaled by aspect, with floors).
function stageAspect(){ const r=canvas.getBoundingClientRect(); return r.height?r.width/r.height:1; }
function homeZoom(a){ return a>=1?1.2:Math.max(0.9,1.2*a); }
function teamZoom(a){ return a>=1?2.2:Math.max(1.3,2.2*a); }
teamEl.onclick=e=>{ const t=e.target.closest('.ac'); if(!t) return; const b=findBot(t.dataset.n); toSel.value=b.name; controls.target.copy(b.root.position); cam.zoom=teamZoom(stageAspect()); cam.updateProjectionMatrix(); };
document.getElementById('legend').innerHTML=['working','thinking','waiting_user','error','idle','done'].map(s=>`<span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS[s].c}"></i> ${STATUS[s].zh}</span>`).join('');
document.getElementById('send').onclick=async()=>{ const t=document.getElementById('msg').value.trim(); if(!t) return; const to=toSel.value, k=document.getElementById('kind').value;
  const o=k==='task'?{task:{from:'Roy',to,title:t,status:'新'}}:{say:{from:'Roy',to,text:t}}; document.getElementById('msg').value='';
  try{ await post(o); }catch(e){ addFeed('系統','發送失敗：'+e.message,'error'); }
  if(!LIVE){ const b=findBot(to); setTimeout(()=>handle({bot:to,status:'working',step:'處理：'+t.slice(0,40)},{ts:Date.now(),anim:true}),3500); } };
document.getElementById('msg').onkeydown=e=>{ if(e.key==='Enter') document.getElementById('send').click(); };
const ray=new THREE.Raycaster(), mv=new THREE.Vector2();
canvas.addEventListener('click',e=>{ const r=canvas.getBoundingClientRect(); mv.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1); ray.setFromCamera(mv,cam);
  const h=ray.intersectObjects(botList.map(b=>b.root),true)[0]; if(h){ const b=findBot(h.object.userData.bot); toSel.value=b.name; say(b,`${b.role}｜${STATUS[b.status].zh}${b.step?'：'+b.step:''}`,3500); document.getElementById('msg').focus(); } });

// wall screens
function renderUsage(){ const pct=usage?usage.total_used_pct:26.3; wallScr.material.map=canvasTex(512,300,(g,W,H)=>{ g.fillStyle='#08131f'; g.fillRect(0,0,W,H);
  g.fillStyle='#7dd3fc'; g.font='bold 26px sans-serif'; g.fillText('本週用量 USAGE',24,44); g.fillStyle='#3ddc84'; g.font='bold 90px sans-serif'; g.fillText(pct+'%',24,150);
  g.fillStyle='#1e293b'; g.fillRect(24,190,W-48,22); g.fillStyle='#3ddc84'; g.fillRect(24,190,(W-48)*pct/100,22); g.fillStyle='#94a3b8'; g.font='20px sans-serif'; g.fillText(LIVE?'實時 · ntfy':'示範資料',24,260); });
  wallScr.material.map.center.set(0.5,0.5); wallScr.material.needsUpdate=true; }
renderUsage();
function renderDash(){ dashTV.material.map=canvasTex(640,380,(g,W,H)=>{ g.fillStyle='#0a1124'; g.fillRect(0,0,W,H); g.fillStyle='#e2e8f0'; g.font='bold 28px sans-serif'; g.fillText('團隊狀態 LIVE',20,40);
  let y=80; for(const t in TEAMS){ const m=botList.filter(b=>b.team===t), w=m.filter(b=>b.status==='working').length; g.fillStyle=TEAMS[t].c; g.font='22px sans-serif'; g.fillText(t,20,y);
    g.fillStyle='#1e293b'; g.fillRect(150,y-18,440,20); g.fillStyle=TEAMS[t].c; g.fillRect(150,y-18,440*(m.length?w/m.length:0),20); y+=50; }
  g.fillStyle='#94a3b8'; g.font='18px sans-serif'; g.fillText(new Date().toLocaleTimeString('zh-HK'),20,H-20); }); dashTV.material.needsUpdate=true; }
renderDash(); setInterval(()=>{ renderDash(); clock.material.map=clockTex(); },5000);

// time of day
const TOD={ day:{bg:'#0b1020',hemi:1.5,sun:2.8,sunC:'#fff1d6',lamp:3,exp:1.2}, evening:{bg:'#0b0f1e',hemi:0.6,sun:1.6,sunC:'#ffb27a',lamp:9,exp:1.0}, night:{bg:'#05070f',hemi:0.25,sun:0.25,sunC:'#7d8cff',lamp:16,exp:1.15} };
function setTime(t){ let m=t; if(t==='now'){ const h=new Date().getHours(); m=h>=7&&h<17?'day':h>=17&&h<19?'evening':'night'; }
  const c=TOD[m]; hemi.intensity=c.hemi; sun.intensity=c.sun; sun.color.set(c.sunC); lamps.forEach(l=>l.intensity=c.lamp); renderer.toneMappingExposure=c.exp;
  sun.position.set(m==='evening'?30:10,m==='evening'?14:30,-25);
  skyMesh.material.map=makeSky(m); skyMesh.material.needsUpdate=true;
  document.querySelectorAll('#timebar button').forEach(b=>b.classList.toggle('on',b.dataset.t===t)); }
document.querySelectorAll('#timebar button').forEach(b=>b.onclick=()=>setTime(b.dataset.t));
const qp=new URLSearchParams(location.search); setTime(qp.get('t')||'now');
if(qp.get('zoom')){ cam.zoom=+qp.get('zoom'); cam.updateProjectionMatrix(); }
if(qp.get('az')){ const a=+qp.get('az'); const r=Math.hypot(cam.position.x,cam.position.z); cam.position.x=Math.sin(a)*r; cam.position.z=Math.cos(a)*r; }
if(qp.get('tx')){ controls.target.set(+qp.get('tx'),0,+qp.get('tz')); cam.position.add(controls.target); }
buildTeam();

/* ---------- animate ---------- */
const clk=new THREE.Clock(), v=new THREE.Vector3();
let pickleFx=null; // assigned after pickleball controller
function animBot(b,dt){ b.t+=dt; const t=b.t;
  if(b.mode==='walk'&&b.path.length){ const tg=b.path[0]; v.subVectors(tg,b.pos); v.y=0; const d=v.length();
    if(d<0.08){ b.path.shift(); if(!b.path.length){ const cb=b.onArrive; b.onArrive=null; b.mode='stand'; cb&&cb(); } }
    else { v.normalize(); b.pos.addScaledVector(v,Math.min(d,dt*(b.walkSpeed||2.6))); b.face=Math.atan2(v.x,v.z); } }
  const r=b.root; let face=b.face; if(b.talking>0){ b.talking-=dt; if(b.mode!=='sit') face=b.talkFace; }
  let dy=r.rotation.y; let diff=((face-dy+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI; r.rotation.y=dy+diff*Math.min(1,dt*8);
  r.position.copy(b.pos);
  const st=b.status, sitting=b.mode==='sit';
  let la=0,ra=0,ll=0,rl=0,headX=0,headY=0,headZ=0,hipY=0.75,lz=0,rz=0, breath=1+Math.sin(t*2.2)*0.012;
  const pk=b.pickle&&pickleFx?pickleFx.poseFor(b):null;
  if(pk){ la=pk.la; ra=pk.ra; ll=pk.ll; rl=pk.rl; lz=pk.lz; rz=pk.rz; headX=pk.hx; headY=pk.hy; headZ=pk.hz; hipY=pk.hipY; }
  else if(b.mode==='walk'){ const s=Math.sin(t*10); ll=s*0.7; rl=-s*0.7; la=-s*0.6; ra=s*0.6; lz=-0.05; rz=0.05; hipY=0.75+Math.abs(Math.cos(t*10))*0.05; headX=Math.sin(t*20)*0.02; }
  else if(sitting){ ll=rl=-Math.PI/2; hipY=0.58;
    if(st==='working'){ const w=b.work;
      if(w==='type'){ la=ra=-1.25; la+=Math.sin(t*22)*0.08; ra+=Math.cos(t*19)*0.08; headX=0.12+Math.sin(t*2)*0.03; headY=Math.sin(t*0.5)*0.08; }
      else if(w==='read'){ la=-1.3; ra=-1.1+Math.sin(t*0.7)*0.05; headX=0.05+Math.sin(t*0.4)*0.04; headY=Math.sin(t*0.9)*0.18; if(Math.sin(t*0.35)>0.95) ra=-1.6; }
      else if(w==='write'){ la=-1.0; ra=-1.2+Math.sin(t*9)*0.06; rz=Math.sin(t*4.5)*0.12; headX=0.25; }
      else { la=-0.9; ra=-1.5+Math.sin(t*3)*0.15; rz=0.1+Math.sin(t*2.3)*0.2; headX=0.1; headY=Math.sin(t*1.3)*0.12; } }
    else if(st==='thinking'){ ra=-2.4; rz=0.35; la=-0.9; headZ=Math.sin(t*1.2)*0.12; headX=-0.15; }
    else if(st==='error'){ la=ra=-1.0; headY=Math.sin(t*9)*0.35; }
    else if(st==='waiting_user'){ la=-0.5; ra=-2.9+Math.sin(t*6)*0.25; rz=0.25; headX=-0.15; headY=Math.sin(t*2)*0.2; }
    else if(st==='done'){ la=-0.5; ra=-2.6+Math.sin(t*3)*0.12; rz=0.15; headX=-0.1+Math.sin(t*3)*0.06; }
    else { la=ra=-0.5; headX=Math.sin(t*0.8)*0.05; headY=Math.sin(t*0.37)*0.3; } }
  else if(b.mode==='talk'){ ra=-0.9+Math.sin(t*6)*0.4; la=Math.sin(t*5)*0.15; headX=Math.sin(t*7)*0.08; }
  else { la=Math.sin(t*1.5)*0.05; ra=-la; lz=-0.06; rz=0.06; hipY=0.75+Math.sin(t*2.2)*0.012; breath=1+Math.sin(t*2.2)*0.02;
    const look=Math.sin(t*0.31)+Math.sin(t*0.53); headY=Math.abs(look)>1.2?Math.sign(look)*0.5:0; headX=Math.sin(t*0.7)*0.04;
    if(st==='waiting_user'){ ra=-2.9+Math.sin(t*6)*0.25; rz=0.2; headY=0; hipY+=Math.abs(Math.sin(t*3))*0.03; }
    else if(st==='thinking'){ ra=-2.4; rz=0.35; la=-0.4; headZ=Math.sin(t*1.2)*0.12; headX=-0.2; }
    else if(st==='error'){ la=-2.6; ra=-2.6; lz=-0.6; rz=0.6; headY=Math.sin(t*9)*0.3; }
    else if(st==='done'){ ra=-2.6+Math.sin(t*3)*0.12; rz=0.15; headX=-0.1; hipY+=Math.abs(Math.sin(t*4))*0.02; }
    else if(st==='working'){ ra=-1.2+Math.sin(t*8)*0.1; la=-0.3; headX=0.2; } }
  if(b.cheer>0){ b.cheer-=dt; la=ra=-2.9; lz=-0.3; rz=0.3; hipY+=Math.abs(Math.sin(t*9))*0.15; }
  // smooth state transitions: exponential lerp toward target pose (walk uses fast follow so swing stays crisp)
  const P=b.pose, k=Math.min(1,dt*(b.mode==='walk'?18:b.pickle?14:7)), L=(o,n)=>o+(n-o)*k;
  P.la=L(P.la,la); P.ra=L(P.ra,ra); P.ll=L(P.ll,ll); P.rl=L(P.rl,rl); P.lz=L(P.lz,lz); P.rz=L(P.rz,rz);
  P.hx=L(P.hx,headX); P.hy=L(P.hy,headY); P.hz=L(P.hz,headZ); P.hipY=L(P.hipY,hipY);
  b.hip.position.y=P.hipY; b.legL.rotation.x=P.ll; b.legR.rotation.x=P.rl; b.armL.rotation.set(P.la,0,P.lz); b.armR.rotation.set(P.ra,0,P.rz);
  b.headP.rotation.set(P.hx,P.hy,P.hz); b.torso.scale.set(breath,1,breath);
  botStateFx(b,dt);
  if(sitting && b.seat.scr && st==='working') b.seat.scr.material.emissiveIntensity=0.75+Math.sin(t*3)*0.15;
  if(b.bubT>0){ b.bubT-=dt; if(b.bubT<=0) b.bub.style.display='none'; }
}
/* ---------- BotAnim (Visual 程式員): continuous per-state FX, runs every frame ----------
   Interface: setBotState(nameOrBot, state, step) only updates b.status / b.step (no walking/seat logic);
   animBot()+botStateFx() read b.status every frame, so any code that sets b.status gets looping anims. */
const FX_RATE={working:6,thinking:1.6,waiting_user:4,error:10,done:2,idle:0.8};
const _fxc=new THREE.Color();
function botStateFx(b,dt){ const st=b.busy?'talking':b.status, t=b.t, S=STATUS[st]||STATUS.idle, m=b.ring.material;
  _fxc.set(S.c); m.color.lerp(_fxc,Math.min(1,dt*5)); const w=FX_RATE[st]||1;
  const pulse=0.5+0.5*Math.sin(t*w); m.opacity=st==='error'?(pulse>0.5?0.95:0.25):0.35+pulse*0.45;
  b.ring.scale.setScalar(1+(st==='waiting_user'||st==='done'?pulse*0.25:pulse*0.08));
  const scr=b.seat&&b.seat.scr; if(scr&&b.mode==='sit'&&!b.busy){ const sm=scr.material;
    if(st==='working') sm.emissiveIntensity=0.7+Math.sin(t*3)*0.12+(Math.sin(t*37)>0.92?0.35:0);
    else if(st==='error') sm.emissiveIntensity=pulse>0.5?1.2:0.3;
    else if(st==='thinking') sm.emissiveIntensity=0.35+pulse*0.2; } }
function setBotState(n,state,step){ const b=typeof n==='object'?n:findBot(n); if(!b) return null; b.status=STATUS[state]?state:'idle'; if(step!==undefined) b.step=String(step||''); return b; }
const stepLine=s=>{ s=String(s||'').replace(/\s+/g,' ').trim(); return s.length>34?s.slice(0,33)+'…':s; };
/* ---------- label declutter (Visual): priority = selected > busy/error/working > near camera ----------
   portrait: only top LABEL_FULL_PORTRAIT bots get full labels, rest short name; overlapping lower-priority labels hide. */
const LABEL_PRI={error:100,working:90,waiting_user:95,talking:85,thinking:60,done:40,idle:0,walking:20};
const LABEL_FULL_PORTRAIT=4; let _dcF=0;
function declutterLabels(){ if((_dcF++)%4) return; const portrait=innerHeight>innerWidth, sel=document.getElementById('to')?.value;
  if(!(portrait||innerWidth<=800)){ botList.forEach(b=>{ b._short=false; b.label.style.visibility=''; b.bub.style.visibility=''; }); return; } // merged: declutter only on portrait/narrow screens
  const cp=cam.position, items=botList.map(b=>{ const st=b.busy?'talking':b.mode==='walk'?'walking':b.status;
    return {b,pri:(b.name===sel?1000:0)+(LABEL_PRI[st]||0)-b.root.position.distanceTo(cp)*0.5}; }).sort((x,y)=>y.pri-x.pri);
  const placed=[]; const hit=r=>placed.some(q=>r.left<q.right-2&&r.right>q.left+2&&r.top<q.bottom-2&&r.bottom>q.top+2);
  items.forEach(({b},i)=>{ b._short=portrait&&i>=LABEL_FULL_PORTRAIT;
    if(b.bubT>0){ b.bub.style.visibility=''; const r=b.bub.getBoundingClientRect(); if(hit(r)) b.bub.style.visibility='hidden'; else placed.push(r); }
    b.label.style.visibility=''; const r=b.label.getBoundingClientRect(); if(hit(r)) b.label.style.visibility='hidden'; else placed.push(r); }); }
const W=new THREE.Vector3();
function placeDom(el,obj,yoff){ W.copy(obj.position); W.y+=yoff; W.project(cam); const r=canvas.getBoundingClientRect();
  el.style.left=((W.x+1)/2*r.width)+'px'; el.style.top=((1-W.y)/2*r.height)+'px'; }
function loop(){ const dt=Math.min(clk.getDelta(),0.05); controls.update(); collisionTick(); if(pickleFx) pickleFx.tick(dt);
  botList.forEach(b=>{ animBot(b,dt); const S=STATUS[b.busy?'talking':b.mode==='walk'?'walking':b.status];
    const tb=(b.status==='working'&&!b.busy&&b.mode==='sit')?tool(b.step):(b.mode==='walk'||b.busy?'':S.ic); const stp=b.step&&b.status!=='idle'?`<small class="st" style="display:block;max-width:${b._short?130:170}px;white-space:normal;line-height:1.2;opacity:.85">${esc(stepLine(b.step))}</small>`:''; const html=b._short?`<span class="np"><i style="background:${S.c}"></i>${esc(b.name)}${stp}</span>`:`${tb?`<span class="tool">${tb}</span>`:''}<span class="np"><i style="background:${S.c}"></i>${esc(b.name)}<small>${esc(b.role)}</small>${stp}</span>`; if(b.label._h!==html){ b.label.innerHTML=html; b.label._h=html; }
    placeDom(b.label,b.root,(b.mode==='sit'?1.95:2.2)+(b.status==='waiting_user'&&!b.busy?Math.abs(Math.sin(b.t*4))*0.25:0));
    if(b.bubT>0) placeDom(b.bub,b.root,2.9); });
  declutterLabels();
  for(let i=flights.length-1;i>=0;i--){ const f=flights[i]; f.t+=dt; if(f.t<0){ f.m.visible=false; continue; } f.m.visible=true; const k=Math.min(1,f.t/f.dur), to=f.to();
    f.m.position.lerpVectors(f.from,to,k); f.m.position.y+=Math.sin(k*Math.PI)*(f.arc||1.5); f.m.rotation.y+=dt*6;
    if(k>=1){ scene.remove(f.m); flights.splice(i,1); f.done&&f.done(); } }
  renderer.render(scene,cam); requestAnimationFrame(loop); }
loop();
/* ---------- v2: arcs, laser, dispatch, flow, confirm ---------- */
const svg=document.getElementById('overlay'), NS='http://www.w3.org/2000/svg';
function cardRect(name){ if(name==='Roy') return document.getElementById('dispatch').getBoundingClientRect();
  return [...teamEl.querySelectorAll('.ac')].find(e=>e.dataset.n===name)?.getBoundingClientRect(); }
function arc(fromN,toN,label,color){ const a=cardRect(fromN), b=cardRect(toN); if(!a||!b) return;
  const x1=a.left+a.width/2,y1=a.top+a.height/2,x2=b.left+b.width/2,y2=b.top+b.height/2, cy=Math.min(y1,y2)-60-Math.abs(x2-x1)*0.15;
  const g=document.createElementNS(NS,'g'); g.setAttribute('filter','url(#glow)');
  const d=`M${x1},${y1} Q${(x1+x2)/2},${cy} ${x2},${y2}`;
  g.innerHTML=`<path class="arc" d="${d}" stroke="${color}"/><circle r="5" fill="#fff"><animateMotion dur="1.4s" repeatCount="2" path="${d}"/></circle>
   <g><rect x="-4" y="-11" width="${Math.min(160,String(label).length*12+12)}" height="18" rx="5" fill="${color}"/><text x="2" y="2" font-size="11" fill="#111" font-weight="700">📄 ${esc(String(label).slice(0,14))}</text><animateMotion dur="2.6s" fill="freeze" path="${d}"/></g>`;
  svg.appendChild(g); setTimeout(()=>g.remove(),2800); }
function laser(b){ const r=document.getElementById('dispatch').getBoundingClientRect(), c=canvas.getBoundingClientRect();
  W.copy(b.root.position); W.y+=1.5; W.project(cam); const x2=c.left+(W.x+1)/2*c.width, y2=c.top+(1-W.y)/2*c.height;
  const l=document.createElementNS(NS,'g'); l.setAttribute('filter','url(#glow)');
  l.innerHTML=`<line x1="${r.left+r.width/2}" y1="${r.bottom}" x2="${x2}" y2="${y2}" stroke="#ff3b4a" stroke-width="3" stroke-dasharray="6 6" class="arc"/><circle cx="${x2}" cy="${y2}" r="10" fill="none" stroke="#ff3b4a" stroke-width="3"><animate attributeName="r" from="4" to="22" dur="0.8s" repeatCount="2"/></circle>`;
  svg.appendChild(l); setTimeout(()=>l.remove(),1800); }
function confirmBox(b,q,opts,cb){ const el=document.getElementById('confirm'); document.getElementById('cfWho').innerHTML=`<b style="color:${b.color}">${esc(b.name)}</b>（${esc(b.role)}）需要你決定：`;
  document.getElementById('cfQ').textContent=q; const bt=document.getElementById('cfBtns'); bt.innerHTML='';
  opts.forEach(o=>{ const x=document.createElement('button'); x.textContent=o; x.onclick=()=>{ el.classList.add('hidden'); cb(o); }; bt.appendChild(x); }); el.classList.remove('hidden'); }
const inFlow=new Set(); const wait=ms=>new Promise(r=>setTimeout(r,ms));
function meeting(members){ return new Promise(res=>{ let n=0; const cx=3.9,cz=-8.8;
  members.forEach((b,i)=>{ b.busy=true; const p=MEET[i%MEET.length]; walkTo(b,p[0],p[1],()=>{ b.mode='talk'; b.face=Math.atan2(cx-p[0],cz-p[1]); if(++n===members.length){ say(members[0],'開會分工 🗂️',3000);
    setTimeout(()=>{ members.forEach(m=>{ m.busy=false; goSeat(m); }); setTimeout(res,1800); },3500); } }); }); }); }
const ART={YouTube:['script_v1.md','thumbnail.png','storyboard.pdf'],Roblox:['HUD_spec.md','combat.lua','test_report.txt'],Ops:['schedule.ics','tickets.pdf','todo.md'],School:['worksheet.docx','notice.pdf']};
const WSTEPS=['搜尋資料 WebSearch','讀取資料 Read','執行 Bash 腳本','寫稿 Write','修改 Edit 版本'];
async function startFlow(sup,title){ const team=sup.team==='School'?'Ops':sup.team;
  let workers=botList.filter(b=>b!==sup&&b.team===team&&!b.busy).slice(0,2); if(sup.name==='Lily') workers=[findBot('Mr. 雜務'),findBot('Dr. School')].filter(Boolean);
  const all=[sup,...workers]; all.forEach(b=>inFlow.add(b)); const H=o=>handle(o,{ts:Date.now(),anim:true}); const arts=ART[team]||ART.Ops;
  try{
  H({task:{from:'Roy',to:sup.name,title,status:'新'}}); await wait(2600);
  H({bot:sup.name,status:'thinking',step:'拆解任務：'+title.slice(0,20)}); await wait(3000);
  if(workers.length){ addFeed(sup.name,'召集 '+workers.map(w=>w.name).join('、')+' 開會','talking'); await meeting(all); }
  for(const [i,w] of workers.entries()){ H({task:{from:sup.name,to:w.name,title:arts[i%arts.length],status:'分派'}}); await wait(1500); }
  await wait(3500);
  workers.forEach((w,i)=>H({bot:w.name,status:'working',step:WSTEPS[(i*2)%5]})); H({bot:sup.name,status:'working',step:'監察進度 Read'}); await wait(5000);
  workers.forEach((w,i)=>H({bot:w.name,status:'working',step:WSTEPS[(i*2+1)%5]})); await wait(4000);
  const w0=workers[0]||sup; H({bot:w0.name,status:'waiting_user',step:'需確認：用方案 A 定 B？'});
  const ch=await new Promise(r=>confirmBox(w0,`「${title}」${arts[0]} 有兩個方案，用邊個？`,['A：快啲出（簡單版）','B：做精啲（多半日）'],r));
  await post({say:{from:'Roy',to:w0.name,text:'揀 '+ch}}); await wait(2500);
  H({bot:w0.name,status:'working',step:'按 Roy 決定 Edit：'+ch.slice(0,1)}); await wait(4000);
  for(const [i,w] of workers.entries()){ H({bot:w.name,status:'done',step:'完成 '+arts[i%arts.length]}); await wait(1200); H({task:{from:w.name,to:sup.name,title:arts[i%arts.length],status:'交接完畢'}}); await wait(5200); }
  H({bot:sup.name,status:'done',step:'完成：'+title.slice(0,24)}); addFeed(sup.name,`➡️ Roy 交付完畢：${title}`,'done');
  } finally { all.forEach(b=>inFlow.delete(b)); } }
// dispatch dialog
const dlg=document.getElementById('dlg'), dTo=document.getElementById('dTo');
document.getElementById('dispatch').onclick=()=>{ const sups=['Lily','Youtube主管','Coding 主管']; dTo.innerHTML=[...sups.map(n=>`<option>${n}</option>`),'<option disabled>──────</option>',...botList.filter(b=>!sups.includes(b.name)).map(b=>`<option>${esc(b.name)}</option>`)].join('');
  document.getElementById('dHint').textContent=LIVE?'實時模式：任務會發去 ntfy；bot 下次開工讀到先會做。':'示範模式：會模擬主管分工、開會、交接同「需確認」流程。';
  dlg.classList.remove('hidden'); document.getElementById('dTitle').focus(); };
document.getElementById('dCancel').onclick=()=>dlg.classList.add('hidden');
document.getElementById('dGo').onclick=async()=>{ const title=document.getElementById('dTitle').value.trim()||'做一條 MLP 香港站宣傳短片'; const sup=findBot(dTo.value); dlg.classList.add('hidden'); document.getElementById('dTitle').value='';
  if(LIVE){ laser(sup); try{ await post({task:{from:'Roy',to:sup.name,title,status:'新'}}); }catch(e){ addFeed('系統','派工失敗：'+e.message,'error'); } }
  else startFlow(sup,title); };
document.getElementById('dTitle').onkeydown=e=>{ if(e.key==='Enter') document.getElementById('dGo').click(); };
// fixed camera / reset
let fixed=false; const home=()=>{ controls.target.set(0,0,0); cam.position.set(38,34,38); cam.zoom=homeZoom(stageAspect()); cam.updateProjectionMatrix(); };
document.getElementById('camBtn').onclick=e=>{ fixed=!fixed; controls.enableRotate=!fixed; if(fixed) home(); e.target.textContent=fixed?'🎥 自由':'🎥 固定'; };
document.getElementById('closeBtn').onclick=home;
setInterval(buildTeam,1500);
/* ---------- pickleball idle trigger (programmer) ----------
   API (window.__office.pickleball):
     playSingles(names?) / playDoubles(names?) → {ok, match|error}
     stopMatch() / getMatch() / setAutoIdle(bool) / onMatch(fn) / listEligible()
     court / playerSlots(mode)  — geometry for Visual
   Visual hooks: listen via onMatch(ev) or globalThis.onPickleEvent(ev)
     ev.type = start|ready|serve|rally|point|end|leave
     serve: {side,server,receiver,target:{x,z},shot}
     rally: {n,shot,from,to,target:{x,z},fromSide,toSide}
     point: {side,score,random:true}
   Work priority: working / waiting_user / thinking / error pulls a bot off the court. */
const pickleball=createPickleController({botList,getBotState,walkTo,say,addFeed,onStateChange,findBot,isBlocked:b=>inFlow.has(b)});
pickleFx=createPickleFX({ scene, THREE, findBot, pickleball, walkTo, say });
pickleball.setAutoIdle(true, 24000);
document.getElementById('pkSingles')?.addEventListener('click',()=>{
  const r=pickleball.playSingles(); addFeed('系統', r.ok?`單打開始`:`單打失敗：${r.error}`, r.ok?'idle':'error');
  if(r.ok){ controls.target.set(COURT.cx,0,COURT.cz); cam.zoom=Math.max(cam.zoom,1.6); cam.updateProjectionMatrix(); }
});
document.getElementById('pkDoubles')?.addEventListener('click',()=>{
  const r=pickleball.playDoubles(); addFeed('系統', r.ok?`雙打開始`:`雙打失敗：${r.error}`, r.ok?'idle':'error');
  if(r.ok){ controls.target.set(COURT.cx,0,COURT.cz); cam.zoom=Math.max(cam.zoom,1.6); cam.updateProjectionMatrix(); }
});
document.getElementById('pkStop')?.addEventListener('click',()=>{ const r=pickleball.stopMatch(); addFeed('系統', r.ok?'比賽結束':'冇比賽','idle'); });
const pkQ=qp.get('pickle'); if(pkQ==='singles'||pkQ==='doubles') setTimeout(()=>{
  const need=pkQ==='doubles'?4:2; let n=0;
  for(const b of botList){ if(n>=need) break; if(b.busy||inFlow.has(b)||b.pickle) continue;
    applyBotState(b,'idle','',{anim:false,ts:Date.now()}); n++; }
  setTimeout(()=>{ const r=(pkQ==='doubles'?pickleball.playDoubles:pickleball.playSingles)();
    if(r.ok){ controls.target.set(COURT.cx,0.4,COURT.cz); cam.position.set(28,26,34); cam.zoom=1.85; cam.updateProjectionMatrix(); controls.update(); }
  }, 500);
}, 1200);

window.__office={bots:botList,setBotState,applyLooks,handle,setTime,startFlow,findBot,collision:COL,collisionStats:colStats,applyBotState,getBotState,onStateChange,net,pickleball,COURT,playerSlots,WORK_PRIORITY,pickleFx,debugPickleShot:(s,o)=>pickleFx&&pickleFx.debugPlayShot(s,o)};
if(qp.get('debug')==='collision') drawCollisionDebug();


