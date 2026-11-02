import * as THREE from 'three';
import { COURT } from './pickleball.js?v=20261102s';

/**
 * Visual FX for pickleball — ball arcs, serve, shot types, chase runs.
 * Listens: start -> ready -> serve -> rally -> point -> end | leave
 * Multi-hit points: each rally event (n=1..N) plays one exchange; ball stays until point.
 */
export function createPickleFX({ scene, THREE: T = THREE, findBot, pickleball, walkTo, say }) {
  const THREE = T;
  const group = new THREE.Group();
  group.name = 'pickleballFX';
  scene.add(group);

  const C = COURT;
  const hx = C.length / 2, hz = C.width / 2;

  // ---- court cosmetics (sizes follow COURT) ----
  const kitMat = new THREE.MeshBasicMaterial({ color: '#86efac', transparent: true, opacity: 0.16, depthWrite: false });
  for (const x of [C.cx - C.nvz / 2, C.cx + C.nvz / 2]) {
    const k = new THREE.Mesh(new THREE.PlaneGeometry(C.nvz - 0.08, C.width - 0.1), kitMat);
    k.rotation.x = -Math.PI / 2; k.position.set(x, 0.045, C.cz); group.add(k);
  }
  const SINGLES_W = 17 * 0.3048, sHz = SINGLES_W / 2;
  const sLine = new THREE.MeshBasicMaterial({ color: '#e2e8f0' });
  for (const z of [C.cz - sHz, C.cz + sHz]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(C.length, 0.025, 0.035), sLine);
    m.position.set(C.cx, 0.055, z); group.add(m);
  }
  const scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = 512; scoreCanvas.height = 256;
  const scoreTex = new THREE.CanvasTexture(scoreCanvas);
  scoreTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.1), new THREE.MeshBasicMaterial({ map: scoreTex }));
  board.position.set(C.cx, 2.4, C.cz - hz - 1.1); group.add(board);
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8 }));
  boardBack.position.set(C.cx, 2.4, C.cz - hz - 1.16); group.add(boardBack);

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

  const rack = new THREE.Group();
  rack.position.set(C.cx + hx + 0.9, 0, C.cz + hz - 1.2); group.add(rack);
  {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: '#334155' }));
    pole.position.y = 0.6; rack.add(pole);
    const cols = ['#bef264', '#fde047', '#38bdf8', '#f472b6'];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group(); p.position.set(0.12, 0.45 + i * 0.18, 0); rack.add(p);
      p.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), new THREE.MeshStandardMaterial({ color: '#333' })));
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.025), new THREE.MeshStandardMaterial({ color: cols[i] }));
      face.position.y = -0.16; p.add(face);
    }
  }

  // shot-tinted ball material base
  const ballMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.45, emissive: '#ea580c', emissiveIntensity: 0.35 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.074, 16, 12), ballMat);
  ball.castShadow = true; ball.visible = false; group.add(ball);

  /** Shot profiles: duration, arc height, release/land Y, swing intensity, trail color */
  const SHOTS = {
    serve: { dur: 1.05, arc: 2.15, y0: 1.35, y1: 0.95, swing: 0.55, color: '#fdba74', label: 'SERVE', chaseEarly: 0.15 },
    drive: { dur: 0.55, arc: 0.85, y0: 1.05, y1: 0.95, swing: 0.42, color: '#f97316', label: 'DRIVE', chaseEarly: 0.05 },
    drop:  { dur: 0.95, arc: 1.55, y0: 1.1,  y1: 0.55, swing: 0.32, color: '#a3e635', label: 'DROP',  chaseEarly: 0.2 },
    dink:  { dur: 1.15, arc: 0.55, y0: 0.85, y1: 0.45, swing: 0.22, color: '#38bdf8', label: 'DINK',  chaseEarly: 0.25 },
  };

  function normalizeShot(s) {
    if (!s) return null;
    const k = String(s).toLowerCase();
    if (k === 'drip') return 'drop';
    if (SHOTS[k]) return k;
    return null;
  }

  /** Default shot cycle when programmer omits `shot`: serve on n=1, then drive/drop/dink */
  function defaultShot(n, isReturn) {
    if (n === 1 && !isReturn) return 'serve';
    const cycle = ['drive', 'drop', 'dink', 'drive'];
    return cycle[(Math.max(1, n) + (isReturn ? 1 : 0)) % cycle.length];
  }

  function tintBall(shot) {
    const p = SHOTS[shot] || SHOTS.drive;
    ballMat.color.set(p.color);
    ballMat.emissive.set(p.color);
    ballMat.emissiveIntensity = shot === 'drive' ? 0.55 : 0.35;
  }

  const bursts = [];
  let unsub = null;
  let flight = null; // active ball flight
  let serveAnim = null; // wind-up before first rally
  let activePlayers = [];
  let lastRallyEv = null;

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
    if (b?._fxPaddle) { b._fxPaddle.parent?.remove(b._fxPaddle); b._fxPaddle = null; }
  }
  function clearPlayers() {
    activePlayers.forEach(b => { detachTempPaddle(b); delete b._pickleSwing; delete b._picklePose; delete b._pickleShot; });
    activePlayers = [];
  }
  function botsFromMatch() {
    const m = pickleball.getMatch();
    return m ? m.players.map(p => findBot(p.name)).filter(Boolean) : [];
  }
  function slotsOf(mode) { return pickleball.playerSlots(mode || 'singles'); }
  function findSlot(mode, id, side) {
    const slots = slotsOf(mode);
    return slots.find(s => s.id === id) || slots.find(s => s.side === side) || slots[0];
  }

  function clampOnSide(side, x, z) {
    // keep receiver on their half (A = -X, B = +X), inside sidelines
    const minX = side === 'A' ? C.cx - hx + 0.4 : C.cx + 0.35;
    const maxX = side === 'A' ? C.cx - 0.35 : C.cx + hx - 0.4;
    const minZ = C.cz - hz + 0.35, maxZ = C.cz + hz - 0.35;
    return {
      x: THREE.MathUtils.clamp(x, minX, maxX),
      z: THREE.MathUtils.clamp(z, minZ, maxZ),
    };
  }

  /** Build a landing target for a shot toward `toSide` */
  function computeTarget(toSide, shot, mode, hint) {
    if (hint && Number.isFinite(hint.x) && Number.isFinite(hint.z)) {
      return clampOnSide(toSide, hint.x, hint.z);
    }
    const baseX = toSide === 'A' ? C.cx - hx * 0.4 : C.cx + hx * 0.4;
    let x = baseX, z = C.cz;
    if (shot === 'dink') {
      // soft into kitchen / NVZ
      x = toSide === 'A' ? C.cx - C.nvz * 0.55 : C.cx + C.nvz * 0.55;
      z = C.cz + (Math.random() - 0.5) * hz * 0.5;
    } else if (shot === 'drop') {
      x = toSide === 'A' ? C.cx - C.nvz * 0.9 : C.cx + C.nvz * 0.9;
      z = C.cz + (Math.random() > 0.5 ? 1 : -1) * (hz * 0.35 + Math.random() * 0.4);
    } else if (shot === 'drive') {
      x = toSide === 'A' ? C.cx - hx * 0.55 : C.cx + hx * 0.55;
      z = C.cz + (Math.random() - 0.5) * hz * 1.1;
    } else { // serve
      x = toSide === 'A' ? C.cx - hx * 0.5 : C.cx + hx * 0.5;
      z = C.cz + (Math.random() > 0.5 ? 1 : -1) * (hz * 0.25 + Math.random() * 0.5);
    }
    return clampOnSide(toSide, x, z);
  }

  function pickPlayers(m, ev, fromSide, toSide) {
    let fromBot = null, toBot = null, fromMeta = null, toMeta = null;
    if (ev?.from?.name) { fromBot = findBot(ev.from.name); fromMeta = ev.from; }
    if (ev?.to?.name) { toBot = findBot(ev.to.name); toMeta = ev.to; }
    if (!fromBot) {
      const cands = m.players.filter(p => p.side === fromSide);
      fromMeta = cands[Math.floor(Math.random() * cands.length)] || m.players[0];
      fromBot = findBot(fromMeta.name);
    }
    if (!toBot) {
      const cands = m.players.filter(p => p.side === toSide);
      toMeta = cands[Math.floor(Math.random() * cands.length)] || m.players[1] || m.players[0];
      toBot = findBot(toMeta.name);
    }
    return { fromBot, toBot, fromMeta, toMeta };
  }

  function runTo(bot, x, z, face) {
    if (!bot) return;
    bot._pickleChase = { x, z };
    if (typeof walkTo === 'function') {
      // faster chase
      bot.walkSpeed = 4.2;
      walkTo(bot, x, z, () => {
        bot.walkSpeed = null;
        bot.mode = 'stand';
        if (face != null) bot.face = face;
        delete bot._pickleChase;
      });
    } else {
      // soft direct lerp fallback via tick
      bot._pickleChaseDirect = true;
    }
  }

  function beginFlight({ shot, fromBot, toBot, fromPos, target, toSide, n, isReturn }) {
    const prof = SHOTS[shot] || SHOTS.drive;
    const from = new THREE.Vector3(
      fromPos?.x ?? fromBot?.pos.x ?? C.cx,
      prof.y0,
      fromPos?.z ?? fromBot?.pos.z ?? C.cz
    );
    const to = new THREE.Vector3(target.x, prof.y1, target.z);
    tintBall(shot);
    flight = {
      t: 0, dur: prof.dur, arc: prof.arc, shot, from, to,
      hitter: fromBot, receiver: toBot, toSide, n, isReturn,
      chased: false, chaseEarly: prof.chaseEarly,
    };
    ball.visible = true;
    if (fromBot) {
      fromBot._pickleSwing = prof.swing;
      fromBot._pickleShot = shot;
    }
    // Programmer chaseLanding already walkTo's receivers — Visual does not re-path.
    flight.chased = true;
    const m = pickleball.getMatch();
    paintScore(m?.score?.A || 0, m?.score?.B || 0, `${prof.label}${n != null ? ' #' + n : ''}`);
    if (say && fromBot && (shot === 'serve' || shot === 'drive' || !isReturn)) {
      say(fromBot, prof.label, 1100);
    }
  }

  /** Official `serve` event: toss + swing from server.pos, ball arcs to target. */
  function playServeEvent(ev) {
    const m = pickleball.getMatch();
    activePlayers = botsFromMatch();
    activePlayers.forEach(attachTempPaddle);
    const server = ev?.server?.name ? findBot(ev.server.name) : null;
    const receiver = ev?.receiver?.name ? findBot(ev.receiver.name) : null;
    const side = ev?.side || ev?.server?.side || 'A';
    const toSide = side === 'A' ? 'B' : 'A';
    const target = (ev?.target && Number.isFinite(ev.target.x))
      ? { x: ev.target.x, z: ev.target.z }
      : computeTarget(toSide, 'drop', m?.mode, null);
    if (!server) {
      launchFromEvent({
        n: 0, shot: 'serve',
        from: ev?.server, to: ev?.receiver,
        target, fromSide: side, toSide,
      }, { forceShot: 'serve' });
      return;
    }
    serveAnim = {
      t: 0, dur: 0.95, server, receiver, target, side, toSide,
      shot: 'serve', eventShot: normalizeShot(ev?.shot) || 'drop',
      swung: false, launched: false,
    };
    ball.visible = true;
    paintScore(m?.score?.A || 0, m?.score?.B || 0, 'SERVE');
    if (say) say(server, '發球！', 1400);
  }

  function launchFromEvent(ev, { forceShot, isReturn } = {}) {
    const m = pickleball.getMatch();
    if (!m || !m.players.length) return;
    const n = ev?.n || 0;
    // Events never send drip; still normalize defensively. Prefer explicit shot.
    let shot = normalizeShot(forceShot || ev?.shot) || defaultShot(Math.max(1, n), !!isReturn);
    const fromSide = ev?.fromSide || ev?.from?.side || (n % 2 === 1 ? 'A' : 'B');
    const toSide = ev?.toSide || ev?.to?.side || (fromSide === 'A' ? 'B' : 'A');
    // Map serve-event shape (server/receiver) onto from/to
    const mapped = {
      ...ev,
      from: ev?.from || ev?.server,
      to: ev?.to || ev?.receiver,
    };
    const { fromBot, toBot, fromMeta } = pickPlayers(m, mapped, fromSide, toSide);
    // Always prefer live bot position — bots are chasing, not frozen on slots
    const fromSlot = findSlot(m.mode, fromMeta?.slot, fromSide);
    const fromPos = ev?.fromPos || (fromBot ? { x: fromBot.pos.x, z: fromBot.pos.z }
      : { x: fromSlot.x, z: fromSlot.z });
    const target = computeTarget(toSide, shot === 'serve' ? 'drop' : shot, m.mode, ev?.target);
    beginFlight({ shot, fromBot, toBot, fromPos, target, toSide, n, isReturn: !!isReturn });
  }

  function chainReturn() {
    if (!flight || !flight.receiver) return;
    const m = pickleball.getMatch();
    if (!m) return;
    const n = flight.n || 1;
    const fromSide = flight.toSide;
    const toSide = fromSide === 'A' ? 'B' : 'A';
    const shot = defaultShot(n, true);
    const fromBot = flight.receiver;
    // pick return target toward previous hitter's side with lateral offset
    const toBot = flight.hitter || botsFromMatch().find(b => b.pickle?.side === toSide);
    const target = computeTarget(toSide, shot, m.mode, null);
    // ensure returner is near ball before swinging
    fromBot._pickleSwing = (SHOTS[shot] || SHOTS.drive).swing;
    beginFlight({
      shot, fromBot, toBot,
      fromPos: { x: ball.position.x, z: ball.position.z },
      target, toSide, n, isReturn: true,
    });
  }

  function spawnBurst(side, score) {
    const x = side === 'A' ? C.cx - hx * 0.35 : C.cx + hx * 0.35;
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 6, 6),
        new THREE.MeshBasicMaterial({ color: side === 'A' ? '#84cc16' : '#38bdf8', transparent: true, opacity: 1 })
      );
      mesh.position.set(x + (Math.random() - 0.5), 1.2 + Math.random(), C.cz + (Math.random() - 0.5));
      group.add(mesh);
      bursts.push({ m: mesh, v: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), life: 0.7 + Math.random() * 0.4 });
    }
    paintScore(score.A, score.B, `${side} 得分！`);
    botsFromMatch().forEach(b => { if (b.pickle?.side === side) b.cheer = 1.1; });
  }

  function onEvent(ev) {
    const type = ev.type;
    if (type === 'start') {
      clearPlayers();
      activePlayers = botsFromMatch();
      activePlayers.forEach(attachTempPaddle);
      paintScore(0, 0, ev.mode === 'doubles' ? '雙打 · 入場' : '單打 · 入場');
      ball.visible = false; flight = null; serveAnim = null; lastRallyEv = null;
    } else if (type === 'ready') {
      // Wait for official serve event — only prep paddles
      activePlayers = botsFromMatch();
      activePlayers.forEach(attachTempPaddle);
      const m = pickleball.getMatch();
      if (m) paintScore(m.score.A, m.score.B, 'Ready');
      const a = activePlayers.find(b => b.pickle?.side === (m?.servingSide || 'A')) || activePlayers[0];
      if (a) { ball.visible = true; ball.position.set(a.pos.x + 0.15, 1.1, a.pos.z); }
      serveAnim = null; flight = null;
    } else if (type === 'serve') {
      // { side, server:{name,side,slot}, receiver:{...}, target:{x,z}, shot }
      lastRallyEv = ev;
      playServeEvent(ev);
    } else if (type === 'rally') {
      // { n, shot, from:{name,side,slot}, to:{...}, target:{x,z}, fromSide, toSide }
      // Each rally event = one hit. Multi-hit points emit n=1,2,3... — never clear ball here.
      lastRallyEv = ev;
      serveAnim = null;
      if (flight) { flight.hold = false; } // interrupt prior hold for next exchange
      launchFromEvent(ev);
      if (flight) { flight.maxReturns = 0; flight.returns = 0; flight.hold = false; }
      paintScore(
        (pickleball.getMatch()?.score?.A) || 0,
        (pickleball.getMatch()?.score?.B) || 0,
        `${(ev.shot || 'HIT').toUpperCase()} #${ev.n || '?'}`
      );
    } else if (type === 'point') {
      // { side, score, random:true }
      flight = null; serveAnim = null;
      spawnBurst(ev.side, ev.score || { A: 0, B: 0 });
      ball.visible = true;
    } else if (type === 'end') {
      const sc = ev.score || { A: 0, B: 0 };
      paintScore(sc.A, sc.B, ev.reason === 'finished' ? '完場' : '中止');
      clearPlayers(); ball.visible = false; flight = null; serveAnim = null;
    } else if (type === 'leave' && ev.name) {
      const b = findBot(ev.name);
      detachTempPaddle(b);
      activePlayers = activePlayers.filter(x => x !== b);
    }
  }

  function applyPose(b, dt) {
    if (!b?.pickle) { delete b._picklePose; return; }
    const t = b.t || 0;
    const moving = b.mode === 'walk';
    const shot = b._pickleShot;
    let la = 0.15, ra = -0.55, ll = 0, rl = 0, lz = -0.05, rz = 0.2, hx = 0.05, hy = 0, hipY = 0.75;
    if (moving) {
      const s = Math.sin(t * 11);
      ll = s * 0.65; rl = -s * 0.65; la = -s * 0.35; ra = s * 0.25;
      hipY = 0.75 + Math.abs(Math.cos(t * 11)) * 0.05;
    } else if (serveAnim && serveAnim.server === b) {
      // serve toss / coil
      const u = Math.min(1, serveAnim.t / serveAnim.dur);
      la = -2.2; // toss hand up
      ra = -0.4 - u * 1.6;
      rz = 0.15 + u * 0.4;
      hx = -0.2; hipY = 0.75 + Math.sin(u * Math.PI) * 0.04;
    } else {
      ra = -1.05; rz = 0.4; la = 0.2 + Math.sin(t * 1.3) * 0.05;
      hy = Math.sin(t * 0.7) * 0.12;
      if (shot === 'dink') { ra = -0.85; rz = 0.25; hx = 0.15; }
      if (shot === 'drop') { ra = -1.2; rz = 0.35; }
    }
    if (b._pickleSwing > 0) {
      const total = b._pickleSwing;
      b._pickleSwing -= dt;
      const u = Math.max(0, b._pickleSwing / Math.max(0.15, total));
      if (shot === 'dink') {
        ra = -1.2 + (1 - u) * 0.5; rz = 0.2; hx = 0.1;
      } else if (shot === 'drop') {
        ra = -1.8 + (1 - u) * 0.9; rz = 0.45; hx = -0.05;
      } else if (shot === 'serve') {
        ra = -2.6 + (1 - u) * 1.8; rz = 0.6; la = -1.2; hx = -0.15;
      } else { // drive
        ra = -2.45 + (1 - u) * 1.6; rz = 0.55; hx = -0.12;
      }
    }
    b._picklePose = { la, ra, ll, rl, lz, rz, hx, hy, hz: 0, hipY };
  }

  function tick(dt) {
    botListSafe().forEach(b => {
      applyPose(b, dt);
      // direct chase fallback
      if (b._pickleChaseDirect && b._pickleChase) {
        const g = b._pickleChase;
        const dx = g.x - b.pos.x, dz = g.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) { b._pickleChaseDirect = false; delete b._pickleChase; }
        else {
          const sp = Math.min(d, dt * 4.2);
          b.pos.x += dx / d * sp; b.pos.z += dz / d * sp;
          b.face = Math.atan2(dx, dz); b.mode = 'walk';
        }
      }
    });

    if (serveAnim) {
      serveAnim.t += dt;
      const s = serveAnim.server;
      const u = Math.min(1, serveAnim.t / serveAnim.dur);
      if (s) {
        // ball toss tracks live server position (may still walk into stance)
        const tossH = 1.15 + Math.sin(Math.min(1, u / 0.55) * Math.PI) * 0.85;
        ball.position.set(s.pos.x + 0.15, tossH, s.pos.z + 0.1);
        if (u > 0.7 && !serveAnim.swung) {
          s._pickleSwing = 0.55; s._pickleShot = 'serve'; serveAnim.swung = true;
        }
      }
      // After wind-up, fly toward official serve target; later rally event replaces flight
      if (serveAnim.t >= serveAnim.dur && !serveAnim.launched) {
        serveAnim.launched = true;
        const fromPos = s ? { x: s.pos.x, z: s.pos.z } : null;
        beginFlight({
          shot: 'serve',
          fromBot: s,
          toBot: serveAnim.receiver,
          fromPos,
          target: serveAnim.target,
          toSide: serveAnim.toSide,
          n: 0,
          isReturn: false,
        });
        if (flight) { flight.maxReturns = 0; flight.returns = 0; }
        serveAnim = null;
      }
    }

    if (flight && !flight.hold) {
      flight.t += dt;
      const k = Math.min(1, flight.t / flight.dur);
      ball.position.lerpVectors(flight.from, flight.to, k);
      ball.position.y = THREE.MathUtils.lerp(flight.from.y, flight.to.y, k) + Math.sin(k * Math.PI) * flight.arc;
      if (k >= 1) {
        if ((flight.returns || 0) < (flight.maxReturns || 0)) {
          flight.returns = (flight.returns || 0) + 1;
          chainReturn();
        } else {
          flight.hold = true;
          flight.t = flight.dur;
        }
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt; b.m.position.addScaledVector(b.v, dt); b.v.y -= 6 * dt;
      b.m.material.opacity = Math.max(0, b.life * 1.2);
      if (b.life <= 0) { group.remove(b.m); bursts.splice(i, 1); }
    }
  }

  function botListSafe() {
    const set = new Set(activePlayers);
    botsFromMatch().forEach(b => set.add(b));
    return [...set];
  }
  function poseFor(b) { return b?._picklePose || null; }

  /** Debug / shot-script helper: force a visible shot immediately during a live match */
  function debugPlayShot(shot, opts = {}) {
    const m = pickleball.getMatch();
    if (!m) return false;
    serveAnim = null;
    launchFromEvent({ n: opts.n || 2, shot, target: opts.target, from: opts.from, to: opts.to }, { forceShot: shot });
    if (flight) { flight.maxReturns = opts.returns ?? 0; flight.returns = 0; }
    return true;
  }

  unsub = pickleball.onMatch(onEvent);
  return {
    tick, poseFor, onEvent, debugPlayShot, SHOTS,
    dispose: () => { unsub && unsub(); clearPlayers(); },
  };
}
