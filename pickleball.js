// pickleball.js — real-size court geometry + idle match state machine (no three.js).
// Scale: 1 world unit = 1 metre (matches desk / ping-pong footprints in app.js).
// Visual owns ball / paddle / swing animation; this module owns who plays, slots, score, triggers.
// Rally logic: serve → shot (drive/drop/dink) → chase landing with walkTo → random point.

export const FT = 0.3048;
export const COURT_LENGTH = 44 * FT;   // 13.4112 m
export const COURT_WIDTH = 20 * FT;    // 6.096 m
export const NVZ = 7 * FT;             // non-volley zone ("kitchen") each side of net
export const NET_H_SIDE = 36 / 12 * FT;
export const NET_H_CENTER = 34 / 12 * FT;
export const POST_R = 0.08;
export const NET_THICK = 0.06;

/** Court centre in world x/z. Length along +X, width along +Z. Patio past lounge (+Z). */
export const COURT = {
  cx: 0,
  cz: 15.2,
  length: COURT_LENGTH,
  width: COURT_WIDTH,
  nvz: NVZ,
  netHSide: NET_H_SIDE,
  netHCenter: NET_H_CENTER,
  axis: 'x',
};

export const ELIGIBLE = new Set(['idle', 'done']);
/** Live work beats pickle — pull these bots out of a match. */
export const WORK_PRIORITY = new Set(['working', 'waiting_user', 'thinking', 'error']);

/** Hit kinds Visual animates. `drip` is an alias of `drop`. */
export const SHOTS = ['drive', 'drop', 'dink'];

export function normalizeShot(shot) {
  if (shot === 'drip') return 'drop';
  if (SHOTS.includes(shot)) return shot;
  return null;
}

export function courtBounds(c = COURT) {
  const hx = c.length / 2, hz = c.width / 2;
  return { minX: c.cx - hx, maxX: c.cx + hx, minZ: c.cz - hz, maxZ: c.cz + hz, hx, hz };
}

/** Solid obstacles: net + two posts. Bots path around with COL.plan. */
export function courtObstacles(c = COURT) {
  const b = courtBounds(c);
  return [
    { n: 'pickle-net', x: c.cx, z: c.cz, w: NET_THICK, d: c.width },
    { n: 'pickle-post-l', x: c.cx, z: b.minZ - POST_R, r: POST_R },
    { n: 'pickle-post-r', x: c.cx, z: b.maxZ + POST_R, r: POST_R },
  ];
}

/**
 * Decorative court lines for debug / Visual. `pass:true` → collision grid ignores them
 * (players stand on lines). Still listed so ?debug=collision can draw them.
 */
export function courtLines(c = COURT) {
  const b = courtBounds(c), t = 0.04;
  const lines = [];
  const add = (n, x, z, w, d) => lines.push({ n, x, z, w, d, pass: true });
  // outer boundary
  add('pickle-line-base-a', c.cx - b.hx, c.cz, t, c.width);
  add('pickle-line-base-b', c.cx + b.hx, c.cz, t, c.width);
  add('pickle-line-side-n', c.cx, c.cz - b.hz, c.length, t);
  add('pickle-line-side-s', c.cx, c.cz + b.hz, c.length, t);
  // centreline (under net, still passable for debug draw)
  add('pickle-line-centre', c.cx, c.cz, t, c.width);
  // kitchen / NVZ lines
  add('pickle-line-nvz-a', c.cx - c.nvz, c.cz, t, c.width);
  add('pickle-line-nvz-b', c.cx + c.nvz, c.cz, t, c.width);
  return lines;
}

/** Standing slots. Singles: 2. Doubles: 4. Faces look toward net (along ±X). */
export function playerSlots(mode = 'singles', c = COURT) {
  const b = courtBounds(c);
  const midA = c.cx - b.hx * 0.45, midB = c.cx + b.hx * 0.45;
  if (mode === 'doubles') {
    const zOff = b.hz * 0.35;
    return [
      { id: 'A1', side: 'A', x: midA, z: c.cz - zOff, face: Math.PI / 2 },
      { id: 'A2', side: 'A', x: midA, z: c.cz + zOff, face: Math.PI / 2 },
      { id: 'B1', side: 'B', x: midB, z: c.cz - zOff, face: -Math.PI / 2 },
      { id: 'B2', side: 'B', x: midB, z: c.cz + zOff, face: -Math.PI / 2 },
    ];
  }
  return [
    { id: 'A', side: 'A', x: midA, z: c.cz, face: Math.PI / 2 },
    { id: 'B', side: 'B', x: midB, z: c.cz, face: -Math.PI / 2 },
  ];
}

/**
 * Ball landing xz on `toSide`. Depth varies by shot (drive deep, drop mid, dink near kitchen).
 * Lateral z is randomised so bots must chase left/right — not frozen on slots.
 */
export function landingTarget(toSide, shot, c = COURT, rng = Math.random) {
  const kind = normalizeShot(shot) || 'drive';
  const b = courtBounds(c);
  const xSign = toSide === 'A' ? -1 : 1;
  let depthFrac;
  if (kind === 'drive') depthFrac = 0.55 + rng() * 0.32;
  else if (kind === 'drop') depthFrac = 0.22 + rng() * 0.28;
  else depthFrac = 0.08 + rng() * 0.16; // dink: near kitchen / NVZ
  const depth = c.nvz + (b.hx - c.nvz) * depthFrac;
  let x = c.cx + xSign * depth;
  // stay on correct half, clear of net thickness
  const minClear = NET_THICK / 2 + 0.35;
  if (toSide === 'A') x = Math.min(c.cx - minClear, Math.max(b.minX + 0.45, x));
  else x = Math.max(c.cx + minClear, Math.min(b.maxX - 0.45, x));
  const z = c.cz + (rng() - 0.5) * (b.hz * 1.55);
  const zClamped = Math.max(b.minZ + 0.45, Math.min(b.maxZ - 0.45, z));
  return { x, z, shot: kind, side: toSide };
}

/** Serve stance: behind mid-depth on server side; receiver mirrors opposite. */
export function serveStance(side, c = COURT, rng = Math.random) {
  const b = courtBounds(c);
  const xSign = side === 'A' ? -1 : 1;
  const x = c.cx + xSign * (b.hx * 0.72);
  const z = c.cz + (rng() - 0.5) * (b.hz * 0.9);
  return {
    x: Math.max(b.minX + 0.4, Math.min(b.maxX - 0.4, x)),
    z: Math.max(b.minZ + 0.4, Math.min(b.maxZ - 0.4, z)),
  };
}

export function statusOf(bot, getBotState) {
  if (typeof getBotState === 'function') {
    const s = getBotState(bot);
    if (s && s.status) return s.status;
  }
  return bot.status || 'idle';
}

/** Prefer Mr. Pickle, then other idle/done, never busy / inFlow / already in pickle / work states. */
export function listEligible(botList, getBotState, { prefer = ['Mr. Pickle'], isBlocked } = {}) {
  const ok = [];
  for (const b of botList) {
    if (!b || b.busy || b.pickle) continue;
    if (typeof isBlocked === 'function' && isBlocked(b)) continue;
    const st = statusOf(b, getBotState);
    if (!ELIGIBLE.has(st)) continue;
    if (WORK_PRIORITY.has(st)) continue;
    ok.push(b);
  }
  ok.sort((a, b) => {
    const pa = prefer.findIndex(n => a.name === n);
    const pb = prefer.findIndex(n => b.name === n);
    const ra = pa === -1 ? 99 : pa, rb = pb === -1 ? 99 : pb;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
  return ok;
}

function pickPlayer(players, side, rng) {
  const pool = players.filter(p => p.slot.side === side);
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

function playerRef(p) {
  if (!p) return null;
  return { name: p.bot.name, side: p.slot.side, slot: p.slot.id };
}

export function createPickleController(deps) {
  const {
    botList,
    getBotState,
    walkTo,
    say = () => {},
    addFeed = () => {},
    onStateChange = () => () => {},
    findBot = () => null,
    now = () => Date.now(),
    random = Math.random,
    pace = 1, // test hook: scale setTimeout delays (e.g. 0.01)
  } = deps;
  const wait = (ms) => Math.max(1, Math.round(ms * pace));

  let match = null;
  let autoIdle = false;
  let autoTimer = null;
  const listeners = new Set();
  const unsubState = onStateChange((bot, st) => {
    if (bot && bot.pickle && st && WORK_PRIORITY.has(st.status)) {
      releaseBot(bot, 'work');
    }
  });

  function emit(type, payload = {}) {
    const ev = { type, match, t: now(), ...payload };
    listeners.forEach(fn => { try { fn(ev); } catch (e) { console.warn(e); } });
    // Visual optional hook
    if (typeof globalThis !== 'undefined' && typeof globalThis.onPickleEvent === 'function') {
      try { globalThis.onPickleEvent(ev); } catch (e) { console.warn(e); }
    }
  }

  function onMatch(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function getMatch() {
    if (!match) return null;
    return {
      mode: match.mode,
      phase: match.phase,
      score: { ...match.score },
      players: match.players.map(p => ({
        name: p.bot.name, slot: p.slot.id, side: p.slot.side,
      })),
      startedAt: match.startedAt,
      rally: match.rally,
      servingSide: match.servingSide,
      lastShot: match.lastShot ? { ...match.lastShot } : null,
      lastTarget: match.lastTarget ? { ...match.lastTarget } : null,
    };
  }

  const blocked = typeof deps.isBlocked === 'function' ? deps.isBlocked : () => false;

  function assignPlayers(mode, names) {
    const need = mode === 'doubles' ? 4 : 2;
    const slots = playerSlots(mode);
    let chosen = [];
    if (names && names.length) {
      for (const n of names) {
        const b = typeof n === 'object' ? n : findBot(n);
        if (!b) return { error: '找不到 bot：' + n };
        if (b.pickle) return { error: b.name + ' 已經喺場上' };
        const st = statusOf(b, getBotState);
        if (WORK_PRIORITY.has(st) || blocked(b)) return { error: b.name + ' 忙緊（' + st + '），唔拉去打球' };
        chosen.push(b);
      }
    } else {
      chosen = listEligible(botList, getBotState, { isBlocked: blocked }).slice(0, need);
    }
    if (chosen.length < need) {
      return { error: `需要 ${need} 個空閒 bot（idle／done），而家只有 ${chosen.length}` };
    }
    chosen = chosen.slice(0, need);
    return { players: chosen.map((bot, i) => ({ bot, slot: slots[i] })), slots };
  }

  function startMatch(mode, names) {
    if (match) return { ok: false, error: '已經有一場進行中', match: getMatch() };
    const got = assignPlayers(mode, names);
    if (got.error) return { ok: false, error: got.error };
    match = {
      mode,
      phase: 'walk',
      score: { A: 0, B: 0 },
      players: got.players,
      startedAt: now(),
      rally: 0,
      target: mode === 'doubles' ? 11 : 7,
      arrived: 0,
      servingSide: random() < 0.5 ? 'A' : 'B',
      lastShot: null,
      lastTarget: null,
    };
    for (const p of match.players) {
      const b = p.bot;
      b.pickle = { mode, slot: p.slot.id, side: p.slot.side, since: now() };
      b.busy = true;
      b._picklePrevStep = b.step;
      if (typeof b.step === 'string') b.step = 'pickleball ' + mode;
      say(b, mode === 'doubles' ? '雙打！🏸' : '單打！🏸', 2500);
      b.walkSpeed = 5.5; // faster commute to patio; Visual may override
      walkTo(b, p.slot.x, p.slot.z, () => {
        b.walkSpeed = null;
        b.mode = 'stand';
        b.face = p.slot.face;
        match && match.arrived++;
        if (match && match.arrived >= match.players.length && match.phase === 'walk') {
          match.phase = 'ready';
          emit('ready');
          scheduleServe();
        }
      });
    }
    addFeed('系統', `Pickleball ${mode === 'doubles' ? '雙打' : '單打'}：` +
      match.players.map(p => p.bot.name).join(' / '), 'idle');
    emit('start', { mode });
    return { ok: true, match: getMatch() };
  }

  function faceNet(side) {
    return side === 'A' ? Math.PI / 2 : -Math.PI / 2;
  }

  /** Move bots into serve / receive stances (left-right jitter, not frozen slots). */
  function lineupForServe(serverSide) {
    const recvSide = serverSide === 'A' ? 'B' : 'A';
    const b = courtBounds();
    for (const p of match.players) {
      const isServerSide = p.slot.side === serverSide;
      const stance = serveStance(p.slot.side, COURT, random);
      // keep doubles partners split on z using their slot bias + small jitter
      const zBias = (p.slot.z - COURT.cz) * 0.55;
      const x = stance.x;
      const z = Math.max(
        b.minZ + 0.4,
        Math.min(b.maxZ - 0.4, COURT.cz + zBias + (random() - 0.5) * 0.5),
      );
      p.bot.walkSpeed = 4.2;
      walkTo(p.bot, x, z, () => {
        p.bot.walkSpeed = null;
        p.bot.mode = 'stand';
        p.bot.face = faceNet(p.slot.side);
      });
      p._role = isServerSide ? 'serve' : 'receive';
    }
    return { serverSide, recvSide };
  }

  /** Receiving side chases landing; partners cover; hitters recover toward mid-depth. */
  function chaseLanding(fromSide, toSide, target) {
    const b = courtBounds();
    const receivers = match.players.filter(p => p.slot.side === toSide);
    const hitters = match.players.filter(p => p.slot.side === fromSide);
    receivers.sort((a, c) => {
      const ax = a.bot.pos?.x ?? a.slot.x, az = a.bot.pos?.z ?? a.slot.z;
      const cx = c.bot.pos?.x ?? c.slot.x, cz = c.bot.pos?.z ?? c.slot.z;
      const da = (ax - target.x) ** 2 + (az - target.z) ** 2;
      const dc = (cx - target.x) ** 2 + (cz - target.z) ** 2;
      return da - dc;
    });
    receivers.forEach((p, i) => {
      let x = target.x, z = target.z;
      if (i === 0) {
        // primary chaser: near landing, slightly short so they don't stand on ball
        const pull = toSide === 'A' ? 0.35 : -0.35;
        x = target.x + pull;
        z = target.z + (random() - 0.5) * 0.25;
      } else {
        // partner covers opposite lateral half
        const coverZ = target.z >= COURT.cz ? b.minZ + b.hz * 0.45 : b.maxZ - b.hz * 0.45;
        x = COURT.cx + (toSide === 'A' ? -1 : 1) * (b.hx * 0.4);
        z = coverZ;
      }
      x = Math.max(b.minX + 0.4, Math.min(b.maxX - 0.4, x));
      // keep on own half
      if (toSide === 'A') x = Math.min(COURT.cx - 0.4, x);
      else x = Math.max(COURT.cx + 0.4, x);
      z = Math.max(b.minZ + 0.4, Math.min(b.maxZ - 0.4, z));
      p.bot.walkSpeed = 5.8;
      walkTo(p.bot, x, z, () => {
        p.bot.walkSpeed = null;
        p.bot.mode = 'stand';
        p.bot.face = faceNet(p.slot.side);
      });
    });
    for (const p of hitters) {
      const recover = serveStance(fromSide, COURT, random);
      const zBias = (p.slot.z - COURT.cz) * 0.4;
      const x = COURT.cx + (fromSide === 'A' ? -1 : 1) * (b.hx * 0.42);
      const z = Math.max(b.minZ + 0.4, Math.min(b.maxZ - 0.4, recover.z * 0.3 + COURT.cz * 0.7 + zBias));
      p.bot.walkSpeed = 4.5;
      walkTo(p.bot, x, z, () => {
        p.bot.walkSpeed = null;
        p.bot.mode = 'stand';
        p.bot.face = faceNet(p.slot.side);
      });
    }
  }

  function scheduleServe() {
    if (!match || match.phase === 'end') return;
    match.phase = 'serve';
    const serverSide = match.servingSide || 'A';
    const server = pickPlayer(match.players, serverSide, random);
    const recvSide = serverSide === 'A' ? 'B' : 'A';
    const receiver = pickPlayer(match.players, recvSide, random);
    const stance = lineupForServe(serverSide);
    const serveTarget = landingTarget(recvSide, 'drop', COURT, random);
    match.lastTarget = { ...serveTarget };
    emit('serve', {
      side: serverSide,
      server: playerRef(server),
      receiver: playerRef(receiver),
      target: { x: serveTarget.x, z: serveTarget.z },
      shot: 'drop', // soft open — Visual may treat serve separately
    });
    // short pause for serve animation / walk into stance, then rally exchange
    const ms = 900 + Math.floor(random() * 500);
    match._serveTimer = setTimeout(() => {
      if (!match || match.phase !== 'serve') return;
      startRally({ server, receiver, serverSide, recvSide });
    }, wait(ms));
  }

  function chooseShot() {
    const i = Math.floor(random() * SHOTS.length) % SHOTS.length;
    return SHOTS[i];
  }

  function startRally(ctx = {}) {
    if (!match || match.phase === 'end') return;
    match.phase = 'rally';
    match.rally++;
    const fromSide = ctx.serverSide || match.servingSide || 'A';
    const toSide = fromSide === 'A' ? 'B' : 'A';
    const shot = chooseShot();
    const hitter = ctx.server && ctx.server.slot.side === fromSide
      ? ctx.server
      : pickPlayer(match.players, fromSide, random);
    const receiver = ctx.receiver && ctx.receiver.slot.side === toSide
      ? ctx.receiver
      : pickPlayer(match.players, toSide, random);
    const target = landingTarget(toSide, shot, COURT, random);
    match.lastShot = shot;
    match.lastTarget = { x: target.x, z: target.z };
    const from = playerRef(hitter);
    const to = playerRef(receiver);
    emit('rally', {
      n: match.rally,
      shot,
      from,
      to,
      target: { x: target.x, z: target.z },
      fromSide,
      toSide,
    });
    chaseLanding(fromSide, toSide, target);

    // Flight + chase window; duration scales a bit by shot (drive faster exchange feel)
    const base = shot === 'drive' ? 1400 : shot === 'drop' ? 1800 : 2000;
    const ms = base + Math.floor(random() * 500);
    match._rallyTimer = setTimeout(() => finishRallyPoint(), wait(ms));
  }

  function finishRallyPoint() {
    if (!match || match.phase === 'end') return;
    // Random point — NOT alternating. Still win-by-1 to target.
    const side = random() < 0.5 ? 'A' : 'B';
    match.score[side]++;
    // winner of the point serves next (casual office rule)
    match.servingSide = side;
    emit('point', { side, score: { ...match.score }, random: true });
    addFeed('系統', `🏓 ${side} 得分 ${match.score.A}–${match.score.B}`, 'idle');
    const win = match.score[side] >= match.target && Math.abs(match.score.A - match.score.B) >= 1;
    if (win || match.rally >= 16) {
      endMatch('finished');
    } else {
      match.phase = 'ready';
      match._nextTimer = setTimeout(scheduleServe, wait(700 + Math.floor(random() * 500)));
    }
  }

  function clearTimers() {
    if (!match) return;
    if (match._rallyTimer) clearTimeout(match._rallyTimer);
    if (match._nextTimer) clearTimeout(match._nextTimer);
    if (match._serveTimer) clearTimeout(match._serveTimer);
    match._rallyTimer = match._nextTimer = match._serveTimer = null;
  }

  function releaseBot(bot, reason = 'stop') {
    if (!bot || !bot.pickle) return;
    const was = bot.pickle;
    bot.pickle = null;
    bot.busy = false;
    if (bot._picklePrevStep !== undefined) { bot.step = bot._picklePrevStep; delete bot._picklePrevStep; }
    emit('leave', { name: bot.name, reason, slot: was });
    if (reason === 'work' && bot.seat && bot.seat.seat) {
      walkTo(bot, bot.seat.seat.x, bot.seat.seat.z, () => { bot.mode = 'sit'; bot.face = bot.seat.face; });
    }
    if (match) {
      match.players = match.players.filter(p => p.bot !== bot);
      const need = match.mode === 'doubles' ? 4 : 2;
      if (match.players.length < need) endMatch('abandoned');
    }
  }

  function endMatch(reason = 'stop') {
    if (!match) return { ok: false, error: '冇進行中嘅比賽' };
    clearTimers();
    match.phase = 'end';
    const summary = getMatch();
    const players = [...match.players];
    for (const p of players) {
      const b = p.bot;
      b.pickle = null;
      b.busy = false;
      if (b._picklePrevStep !== undefined) { b.step = b._picklePrevStep; delete b._picklePrevStep; }
      say(b, reason === 'finished' ? '好波！☕' : '返工先', 2000);
      if (b.seat && b.seat.seat) {
        walkTo(b, b.seat.seat.x, b.seat.seat.z, () => { b.mode = 'sit'; b.face = b.seat.face; });
      }
    }
    addFeed('系統', reason === 'finished'
      ? `Pickleball 完場 ${summary.score.A}–${summary.score.B}`
      : `Pickleball 中止（${reason}）`, 'idle');
    emit('end', { reason, score: summary.score });
    match = null;
    return { ok: true, match: summary };
  }

  function playSingles(names) { return startMatch('singles', names); }
  function playDoubles(names) { return startMatch('doubles', names); }
  function stopMatch() { return endMatch('stop'); }

  function setAutoIdle(on, everyMs = 22000) {
    autoIdle = !!on;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (!autoIdle) return { autoIdle };
    autoTimer = setInterval(() => {
      if (match) return;
      const elig = listEligible(botList, getBotState);
      if (elig.length >= 4 && random() < 0.2) playDoubles();
      else if (elig.length >= 2 && random() < 0.35) playSingles();
    }, everyMs);
    return { autoIdle, everyMs };
  }

  function dispose() {
    if (autoTimer) clearInterval(autoTimer);
    clearTimers();
    unsubState && unsubState();
    match = null;
  }

  return {
    playSingles,
    playDoubles,
    stopMatch,
    getMatch,
    setAutoIdle,
    onMatch,
    listEligible: () => listEligible(botList, getBotState, { isBlocked: blocked }),
    court: COURT,
    playerSlots,
    courtObstacles,
    courtLines,
    SHOTS,
    normalizeShot,
    landingTarget,
    dispose,
  };
}
