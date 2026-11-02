import * as THREE from 'three';
import { COURT } from './pickleball.js?v=20261102v';

/**
 * Visual FX layer for pickleball (Visual 程式員).
 * Listens to programmer controller via pb.onMatch / events:
 *   start → ready → rally(n) → point({side,score}) → end | leave
 * Does NOT own match state / walkTo / eligibility.
 */
export function createPickleFX({ scene, THREE: T = THREE, findBot, pickleball }) {
  const THREE = T;
  const group = new THREE.Group();
  group.name = 'pickleballFX';
  scene.add(group);

  // ---- enhanced court cosmetics (sizes follow COURT; do not change dimensions) ----
  const C = COURT;
  const hx = C.length / 2, hz = C.width / 2;
  // kitchen tint
  const kitMat = new THREE.MeshBasicMaterial({ color: '#86efac', transparent: true, opacity: 0.16, depthWrite: false });
  for (const x of [C.cx - C.nvz / 2, C.cx + C.nvz / 2]) {
    const k = new THREE.Mesh(new THREE.PlaneGeometry(C.nvz - 0.08, C.width - 0.1), kitMat);
    k.rotation.x = -Math.PI / 2;
    k.position.set(x, 0.045, C.cz);
    group.add(k);
  }
  // singles sidelines (17 ft wide = 17*FT inward from doubles)
  const SINGLES_W = 17 * 0.3048;
  const sHz = SINGLES_W / 2;
  const sLine = new THREE.MeshBasicMaterial({ color: '#e2e8f0' });
  for (const z of [C.cz - sHz, C.cz + sHz]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(C.length, 0.025, 0.035), sLine);
    m.position.set(C.cx, 0.055, z); m.castShadow = false; group.add(m);
  }
  // scoreboard
  const scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = 512; scoreCanvas.height = 256;
  const scoreTex = new THREE.CanvasTexture(scoreCanvas);
  scoreTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.3, 0.1),
    new THREE.MeshBasicMaterial({ map: scoreTex })
  );
  board.position.set(C.cx, 2.4, C.cz - hz - 1.1);
  group.add(board);
  const boardBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.4, 0.08),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8 })
  );
  boardBack.position.set(C.cx, 2.4, C.cz - hz - 1.16);
  group.add(boardBack);

  function paintScore(a = 0, b = 0, phase = '待機') {
    const g = scoreCanvas.getContext('2d');
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#84cc16'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
    g.fillText('PICKLEBALL', 256, 40);
    g.fillStyle = '#f8fafc'; g.font = 'bold 84px sans-serif';
    g.fillText(`${a}  –  ${b}`, 256, 140);
    g.fillStyle = '#94a3b8'; g.font = '22px sans-serif';
    g.fillText(phase || '', 256, 210);
    scoreTex.needsUpdate = true;
  }
  paintScore(0, 0, '待機');

  // paddle rack (prop)
  const rack = new THREE.Group();
  rack.position.set(C.cx + hx + 0.9, 0, C.cz + hz - 1.2);
  group.add(rack);
  {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: '#334155' }));
    pole.position.y = 0.6; rack.add(pole);
    const cols = ['#bef264', '#fde047', '#38bdf8', '#f472b6'];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group(); p.position.set(0.12, 0.45 + i * 0.18, 0); rack.add(p);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), new THREE.MeshStandardMaterial({ color: '#333' }));
      p.add(h);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.025), new THREE.MeshStandardMaterial({ color: cols[i] }));
      face.position.y = -0.16; p.add(face);
    }
  }

  // ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.074, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.45, emissive: '#ea580c', emissiveIntensity: 0.35 })
  );
  ball.castShadow = true; ball.visible = false; group.add(ball);

  // score burst particles (simple mesh flashes)
  const bursts = [];

  // runtime
  let unsub = null;
  let rallyAnim = null; // {t, dur, from, to, hitter, receiver}
  let activePlayers = []; // bot refs
  const tmp = new THREE.Vector3();

  function attachTempPaddle(b) {
    if (!b || b._fxPaddle || b.acc === 'paddle') return;
    const g = new THREE.Group(); g.name = 'fxPaddle';
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), new THREE.MeshStandardMaterial({ color: '#333' }));
    handle.position.set(0, -0.05, 0); g.add(handle);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.035), new THREE.MeshStandardMaterial({ color: '#bef264' }));
    face.position.set(0, -0.32, 0); g.add(face);
    b.armR.add(g); g.position.set(0, -0.82, 0.1);
    b._fxPaddle = g;
  }
  function detachTempPaddle(b) {
    if (b && b._fxPaddle) {
      b._fxPaddle.parent && b._fxPaddle.parent.remove(b._fxPaddle);
      b._fxPaddle = null;
    }
  }
  function clearPlayers() {
    activePlayers.forEach(b => {
      detachTempPaddle(b);
      delete b._pickleSwing;
      delete b._picklePose;
    });
    activePlayers = [];
  }

  function botsFromMatch() {
    const m = pickleball.getMatch();
    if (!m) return [];
    return m.players.map(p => findBot(p.name)).filter(Boolean);
  }

  function slotWorld(side, slotId) {
    const mode = pickleball.getMatch()?.mode || 'singles';
    const slots = pickleball.playerSlots(mode);
    return slots.find(s => s.id === slotId || (s.side === side && s.id === slotId)) || slots.find(s => s.side === side) || slots[0];
  }

  function startRallyFlight(n) {
    const m = pickleball.getMatch();
    if (!m || !m.players.length) return;
    // Alternate direction by rally number: odd A→B, even B→A
    const fromSide = n % 2 === 1 ? 'A' : 'B';
    const toSide = fromSide === 'A' ? 'B' : 'A';
    const fromP = m.players.filter(p => p.side === fromSide);
    const toP = m.players.filter(p => p.side === toSide);
    const fp = fromP[Math.floor(Math.random() * fromP.length)] || m.players[0];
    const tp = toP[Math.floor(Math.random() * toP.length)] || m.players[1] || m.players[0];
    const fromBot = findBot(fp.name);
    const toBot = findBot(tp.name);
    const fromSlot = pickleball.playerSlots(m.mode).find(s => s.id === fp.slot) || { x: C.cx - hx * 0.45, z: C.cz };
    const toSlot = pickleball.playerSlots(m.mode).find(s => s.id === tp.slot) || { x: C.cx + hx * 0.45, z: C.cz };
    const from = new THREE.Vector3(
      fromBot ? fromBot.pos.x : fromSlot.x,
      1.15,
      fromBot ? fromBot.pos.z : fromSlot.z
    );
    const to = new THREE.Vector3(
      toBot ? toBot.pos.x : toSlot.x,
      1.05,
      toBot ? toBot.pos.z : toSlot.z
    );
    // slight aim noise
    to.z += (Math.random() - 0.5) * 0.4;
    const dur = 0.75 + Math.random() * 0.35;
    rallyAnim = { t: 0, dur, from, to, hitter: fromBot, receiver: toBot, n, hits: 0, maxHits: 2 + (n % 3) };
    ball.visible = true;
    if (fromBot) fromBot._pickleSwing = 0.4;
    paintScore(m.score.A, m.score.B, `Rally #${n}`);
  }

  function spawnBurst(side, score) {
    const x = side === 'A' ? C.cx - hx * 0.35 : C.cx + hx * 0.35;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 6, 6),
        new THREE.MeshBasicMaterial({ color: side === 'A' ? '#84cc16' : '#38bdf8', transparent: true, opacity: 1 })
      );
      m.position.set(x + (Math.random() - 0.5), 1.2 + Math.random(), C.cz + (Math.random() - 0.5));
      group.add(m);
      bursts.push({
        m,
        v: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2),
        life: 0.7 + Math.random() * 0.4,
      });
    }
    paintScore(score.A, score.B, `${side} 得分！`);
    // cheer winners
    botsFromMatch().forEach(b => {
      if (b.pickle && b.pickle.side === side) b.cheer = 1.1;
    });
  }

  function onEvent(ev) {
    const type = ev.type;
    if (type === 'start') {
      clearPlayers();
      activePlayers = botsFromMatch();
      activePlayers.forEach(attachTempPaddle);
      paintScore(0, 0, ev.mode === 'doubles' ? '雙打 · 入場' : '單打 · 入場');
      ball.visible = false;
      rallyAnim = null;
    } else if (type === 'ready') {
      activePlayers = botsFromMatch();
      activePlayers.forEach(attachTempPaddle);
      // ready pose: paddle up
      activePlayers.forEach(b => { b._pickleSwing = 0; });
      const m = pickleball.getMatch();
      if (m) paintScore(m.score.A, m.score.B, 'Ready');
      // hold ball at server (side A first, then alternate by rally count)
      const server = activePlayers.find(b => b.pickle?.side === 'A') || activePlayers[0];
      if (server) {
        ball.visible = true;
        ball.position.set(server.pos.x + 0.2, 1.2, server.pos.z);
      }
    } else if (type === 'rally') {
      startRallyFlight(ev.n || 1);
    } else if (type === 'point') {
      rallyAnim = null;
      spawnBurst(ev.side, ev.score || { A: 0, B: 0 });
      // bounce ball down
      ball.visible = true;
    } else if (type === 'end' || type === 'leave') {
      if (type === 'end') {
        const sc = ev.score || { A: 0, B: 0 };
        paintScore(sc.A, sc.B, ev.reason === 'finished' ? '完場' : '中止');
        clearPlayers();
        ball.visible = false;
        rallyAnim = null;
      } else if (ev.name) {
        const b = findBot(ev.name);
        detachTempPaddle(b);
        activePlayers = activePlayers.filter(x => x !== b);
      }
    }
  }

  function applyPose(b, dt) {
    if (!b || !b.pickle) { delete b._picklePose; return; }
    const t = b.t || 0;
    const moving = b.mode === 'walk';
    let la = 0.15, ra = -0.55, ll = 0, rl = 0, lz = -0.05, rz = 0.2, hx = 0.05, hy = 0, hipY = 0.75;
    if (moving) {
      const s = Math.sin(t * 10);
      ll = s * 0.55; rl = -s * 0.55; la = -s * 0.3; ra = s * 0.3;
      hipY = 0.75 + Math.abs(Math.cos(t * 10)) * 0.04;
    } else {
      // ready: paddle forward-up
      ra = -1.05; rz = 0.4; la = 0.2 + Math.sin(t * 1.3) * 0.05;
      hy = Math.sin(t * 0.7) * 0.12;
    }
    if (b._pickleSwing > 0) {
      b._pickleSwing -= dt;
      const u = Math.max(0, b._pickleSwing / 0.4);
      ra = -2.35 + (1 - u) * 1.5;
      rz = 0.55; hx = -0.12;
    }
    b._picklePose = { la, ra, ll, rl, lz, rz, hx, hy, hz: 0, hipY };
  }

  function tick(dt) {
    // drive poses for anyone currently in pickle
    botListSafe().forEach(b => applyPose(b, dt));

    if (rallyAnim) {
      rallyAnim.t += dt;
      const k = Math.min(1, rallyAnim.t / rallyAnim.dur);
      ball.position.lerpVectors(rallyAnim.from, rallyAnim.to, k);
      ball.position.y = THREE.MathUtils.lerp(rallyAnim.from.y, rallyAnim.to.y, k) + Math.sin(k * Math.PI) * 1.6;
      if (k >= 1) {
        // chain a return within the same programmer rally window
        rallyAnim.hits++;
        if (rallyAnim.hits < rallyAnim.maxHits) {
          const prevTo = rallyAnim.to.clone();
          const prevFrom = rallyAnim.from.clone();
          const hitter = rallyAnim.receiver;
          const receiver = rallyAnim.hitter;
          if (hitter) hitter._pickleSwing = 0.38;
          rallyAnim.from = prevTo.clone().setY(1.1);
          rallyAnim.to = prevFrom.clone().setY(1.05);
          rallyAnim.to.z += (Math.random() - 0.5) * 0.5;
          rallyAnim.t = 0;
          rallyAnim.dur = 0.65 + Math.random() * 0.3;
          rallyAnim.hitter = hitter;
          rallyAnim.receiver = receiver;
        } else {
          // hold at end until point event
          rallyAnim = { ...rallyAnim, t: rallyAnim.dur, hold: true };
        }
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      b.v.y -= 6 * dt;
      b.m.material.opacity = Math.max(0, b.life * 1.2);
      if (b.life <= 0) { group.remove(b.m); bursts.splice(i, 1); }
    }
  }

  function botListSafe() {
    // find via match players + any with pickle flag
    const set = new Set(activePlayers);
    // also scan via getMatch
    botsFromMatch().forEach(b => set.add(b));
    return [...set];
  }

  function poseFor(b) {
    return b && b._picklePose ? b._picklePose : null;
  }

  function bind() {
    if (unsub) unsub();
    unsub = pickleball.onMatch(onEvent);
  }
  bind();

  return { tick, poseFor, onEvent, dispose: () => { if (unsub) unsub(); clearPlayers(); } };
}
