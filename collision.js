// collision.js — 2D floor-plan obstacles + grid A* path planning for office bots.
// Pure JS (no three.js) so it can be unit-tested in node. Coordinates: world x / z.
// Footprints mirror the furniture built in app.js ("furniture" section). Chairs, stools
// and beanbag-style seats bots stand/sit at are intentionally NOT obstacles.

export const ROOM = { minX: -15, maxX: 15, minZ: -11, maxZ: 11 };
export const BOT_R = 0.3;      // bot body radius used for clearance
const CELL = 0.2;

// rect: {x,z,w,d,rot} (w along local x, d along local z, rot = rotation.y) ; circle: {x,z,r}
export const STATIC_OBSTACLES = [
  // school bookshelf
  { n: 'school-shelf', x: 12.4, z: 6.6, w: 2.2, d: 0.5, rot: -Math.PI / 2 },
  // kitchen
  { n: 'counter', x: -10.6, z: -10.3, w: 7.5, d: 1.1 },
  { n: 'fridge', x: -14.3, z: -10.3, w: 1.0, d: 0.9 },
  { n: 'island', x: -10.2, z: -7.4, w: 3.3, d: 1.3 },
  // meeting room glass walls (door gap x 0.5..1.9 on z=-6.6) + table
  { n: 'meet-front', x: 4.55, z: -6.6, w: 5.3, d: 0.12 },
  { n: 'meet-left', x: 0.5, z: -8.8, w: 0.12, d: 4.4 },
  { n: 'meet-right', x: 7.2, z: -8.8, w: 0.12, d: 4.4 },
  { n: 'meet-table', x: 3.9, z: -8.8, w: 3.4, d: 1.5 },
  // server rack, whiteboard
  { n: 'rack', x: 13.8, z: -10.2, w: 1.0, d: 0.9 },
  { n: 'whiteboard', x: 14.2, z: -6, w: 2.0, d: 0.25, rot: -Math.PI / 2.4 },
  // lounge sofa L + coffee table + floor lamp + cafe table
  { n: 'sofa', x: -4, z: 10.35, w: 6.2, d: 1.4 },
  { n: 'sofa-side', x: -6.75, z: 8.2, w: 1.4, d: 3.0 },
  { n: 'coffee-table', x: -3.6, z: 7.4, w: 2.0, d: 1.1 },
  { n: 'lamp', x: -0.8, z: 9.8, r: 0.45 },
  { n: 'cafe-table', x: -4.5, z: -2.5, r: 0.8 },
  // ping-pong, lockers, beanbags, arcade, lounge bookshelf
  { n: 'pingpong', x: 3.6, z: 8.3, w: 2.8, d: 1.65 },
  { n: 'lockers', x: 7.325, z: 10.4, w: 2.95, d: 0.6 },
  { n: 'beanbag1', x: -1.3, z: 6.7, r: 0.6 },
  { n: 'beanbag2', x: -1.0, z: 8.2, r: 0.6 },
  { n: 'arcade', x: -14.3, z: 5.6, w: 1.0, d: 0.9, rot: Math.PI / 2 },
  { n: 'lounge-shelf', x: -14.6, z: 8.6, w: 2.4, d: 0.5, rot: Math.PI / 2 },
  // plants: [x,z,scale] pot radius 0.35*s
  ...[[-14, 11.6, 1.2], [14, 10, 1.1], [-14, -4.8, 1], [7.8, -7, 1], [-1.5, -6, 0.9], [6, 6.6, 1], [-8.5, 5, 0.9], [14, 1.5, 1], [-0.5, 10.2, 0.8]]
    .map(([x, z, s], i) => ({ n: 'plant' + i, x, z, r: 0.35 * s })),
];

// signed distance-ish test: is point inside obstacle grown by `pad`?
export function insideObstacle(o, x, z, pad = 0) {
  if (o.r !== undefined) return Math.hypot(x - o.x, z - o.z) < o.r + pad;
  let dx = x - o.x, dz = z - o.z;
  if (o.rot) { const c = Math.cos(-o.rot), s = Math.sin(-o.rot); [dx, dz] = [dx * c + dz * s, -dx * s + dz * c]; }
  return Math.abs(dx) < o.w / 2 + pad && Math.abs(dz) < o.d / 2 + pad;
}

export function createCollision(desks = []) {
  // desks: [{x,z,rot}] desk tops 1.8 x 0.95
  const obstacles = [...STATIC_OBSTACLES, ...desks.map((d, i) => ({ n: 'desk' + i, x: d.x, z: d.z, w: 1.8, d: 0.95, rot: d.rot || 0 }))];
  const NX = Math.round((ROOM.maxX - ROOM.minX) / CELL), NZ = Math.round((ROOM.maxZ - ROOM.minZ) / CELL);
  const blocked = new Uint8Array(NX * NZ);
  const cx = i => ROOM.minX + (i + 0.5) * CELL, cz = j => ROOM.minZ + (j + 0.5) * CELL;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = cx(i), z = cz(j);
    if (x < ROOM.minX + BOT_R || x > ROOM.maxX - BOT_R || z < ROOM.minZ + BOT_R || z > ROOM.maxZ - BOT_R) { blocked[j * NX + i] = 1; continue; }
    for (const o of obstacles) if (insideObstacle(o, x, z, BOT_R)) { blocked[j * NX + i] = 1; break; }
  }
  const toI = x => Math.max(0, Math.min(NX - 1, Math.floor((x - ROOM.minX) / CELL)));
  const toJ = z => Math.max(0, Math.min(NZ - 1, Math.floor((z - ROOM.minZ) / CELL)));
  const free = (x, z) => !blocked[toJ(z) * NX + toI(x)];
  const hitAt = (x, z, pad = 0) => obstacles.find(o => insideObstacle(o, x, z, pad)) || null;

  function nearestFree(x, z) {
    if (free(x, z)) return { x, z };
    const i0 = toI(x), j0 = toJ(z);
    for (let r = 1; r < 40; r++) {
      let best = null, bd = 1e9;
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NZ || blocked[j * NX + i]) continue;
        const d = Math.hypot(cx(i) - x, cz(j) - z); if (d < bd) { bd = d; best = { x: cx(i), z: cz(j) }; }
      }
      if (best) return best;
    }
    return { x, z };
  }
  // straight segment stays in free cells?
  function clear(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (CELL * 0.5));
    for (let k = 0; k <= n; k++) { const t = n ? k / n : 0; if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // A* on 8-connected grid; returns waypoints [{x,z}] excluding start, ending at (gx,gz)
  function plan(sx, sz, gx, gz) {
    const s = nearestFree(sx, sz), g = nearestFree(gx, gz);
    const tail = (g.x !== gx || g.z !== gz) ? [g] : [];
    const goal = tail.length ? g : { x: gx, z: gz };
    const exact = tail.length && !hitAt(gx, gz) ? [{ x: gx, z: gz }] : [];
    if (clear(s.x, s.z, goal.x, goal.z)) return [...(s.x !== sx || s.z !== sz ? [s] : []), goal, ...exact];
    const si = toI(s.x), sj = toJ(s.z), gi = toI(g.x), gj = toJ(g.z), N = NX * NZ;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => Math.hypot(i - gi, j - gj);
    const sk = sj * NX + si, gk = gj * NX + gi; gs[sk] = 0; push(sk, h(si, sj));
    let found = false;
    while (heap.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === gk) { found = true; break; }
      const i = k % NX, j = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const nk = nj * NX + ni; if (blocked[nk] || closed[nk]) continue;
        if (di && dj && (blocked[j * NX + ni] || blocked[nj * NX + i])) continue; // no corner cutting
        const ng = gs[k] + (di && dj ? Math.SQRT2 : 1); if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(nk, ng + h(ni, nj)); }
      }
    }
    if (!found) return [goal]; // fallback: old straight-line behaviour
    const cells = []; for (let k = gk; k !== -1; k = came[k]) cells.push({ x: cx(k % NX), z: cz((k / NX) | 0) });
    cells.reverse(); cells[0] = s; cells[cells.length - 1] = g;
    // string-pull smoothing
    const out = []; let a = s, idx = 0;
    while (idx < cells.length - 1) { let far = idx + 1; for (let t = cells.length - 1; t > idx + 1; t--) if (clear(a.x, a.z, cells[t].x, cells[t].z)) { far = t; break; } a = cells[far]; out.push(a); idx = far; }
    if (s.x !== sx || s.z !== sz) out.unshift(s);
    out[out.length - 1] = g;
    if (tail.length && !hitAt(gx, gz)) out.push({ x: gx, z: gz }); // e.g. own seat right next to the desk
    if (!tail.length) out[out.length - 1] = { x: gx, z: gz };
    return out;
  }
  // goal snapping for walkTo: only move a destination that is really inside furniture
  const safeGoal = (x, z) => hitAt(x, z, 0.1) ? nearestFree(x, z) : { x, z };
  return { obstacles, plan, safeGoal, nearestFree, free, hitAt, clear, grid: { NX, NZ, CELL, blocked } };
}
