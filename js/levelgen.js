'use strict';
// Seeded procedural dungeon areas. Every solid uses world.solid()/addCollider next to its visual => collision == visuals.
(function () {
  const LG = (G.LevelGen = {});
  const P = () => G.Props;
  const WALL_H = 13, WALL_TOP = 24, WALL_T = 3;

  function Occ(W, D) {
    const a = new Uint8Array(W * D);
    return {
      a,
      mark(x0, z0, x1, z1, v) { for (let z = Math.max(0, Math.floor(z0)); z < Math.min(D, Math.ceil(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) a[z * W + x] = v ?? 1; },
      free(x0, z0, x1, z1) {
        if (x0 < 0 || z0 < 0 || x1 > W || z1 > D) return false;
        for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (a[z * W + x]) return false;
        return true;
      },
      place(rng, fw, fd, margin, tries) {
        margin = margin ?? 1;
        for (let t = 0; t < (tries || 40); t++) {
          const x0 = rng.int(2, W - fw - 2), z0 = rng.int(2, D - fd - 2);
          if (this.free(x0 - margin, z0 - margin, x0 + fw + margin, z0 + fd + margin)) { this.mark(x0, z0, x0 + fw, z0 + fd); return { x0, z0, x1: x0 + fw, z1: z0 + fd }; }
        }
        return null;
      },
    };
  }

  // ---------------- building blocks ----------------
  function stairs(w, side, e, c, wd, h0, h1, mk) {
    const n = Math.max(1, Math.round((h1 - h0) / 0.25)), rise = (h1 - h0) / n, run = 0.5;
    const sg = side === 'S' || side === 'E' ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const top = h1 - i * rise;
      const a = e + sg * i * run, b = e + sg * (i + 1) * run;
      if (side === 'N' || side === 'S') w.solid(mk || 'trim', c - wd / 2, h0, Math.min(a, b), c + wd / 2, top, Math.max(a, b), { uv: 1.5 });
      else w.solid(mk || 'trim', Math.min(a, b), h0, c - wd / 2, Math.max(a, b), top, c + wd / 2, { uv: 1.5 });
    }
    return n * run;
  }
  LG.stairsLen = (h) => Math.max(1, Math.round(h / 0.25)) * 0.5;

  function parapet(w, x0, z0, x1, z1, y, gaps, mk) {
    // gaps: [{side, a, b}] openings along an edge
    const T = 0.35, H = 0.95;
    const edge = (side, a0, a1) => {
      const gs = gaps.filter((g) => g.side === side).sort((p, q) => p.a - q.a);
      let s = a0;
      const segs = [];
      for (const g of gs) { if (g.a > s) segs.push([s, g.a]); s = Math.max(s, g.b); }
      if (s < a1) segs.push([s, a1]);
      for (const [p, q] of segs) {
        if (q - p < 0.2) continue;
        if (side === 'N') { w.solid(mk || 'wall', p, y, z0, q, y + H, z0 + T, { uv: 2 }); w.visual('trim', p, y + H, z0 - 0.04, q, y + H + 0.1, z0 + T + 0.04, { uv: 1 }); w.addCollider(p, y + H, z0, q, y + H + 0.1, z0 + T); }
        if (side === 'S') { w.solid(mk || 'wall', p, y, z1 - T, q, y + H, z1, { uv: 2 }); w.visual('trim', p, y + H, z1 - T - 0.04, q, y + H + 0.1, z1 + 0.04, { uv: 1 }); w.addCollider(p, y + H, z1 - T, q, y + H + 0.1, z1); }
        if (side === 'W') { w.solid(mk || 'wall', x0, y, p, x0 + T, y + H, q, { uv: 2 }); w.visual('trim', x0 - 0.04, y + H, p, x0 + T + 0.04, y + H + 0.1, q, { uv: 1 }); w.addCollider(x0, y + H, p, x0 + T, y + H + 0.1, q); }
        if (side === 'E') { w.solid(mk || 'wall', x1 - T, y, p, x1, y + H, q, { uv: 2 }); w.visual('trim', x1 - T - 0.04, y + H, p, x1 + 0.04, y + H + 0.1, q, { uv: 1 }); w.addCollider(x1 - T, y + H, p, x1, y + H + 0.1, q); }
      }
    };
    edge('N', x0, x1); edge('S', x0, x1); edge('W', z0 + T, z1 - T); edge('E', z0 + T, z1 - T);
  }

  // raised platform occupying rect (incl. stairs); sides: list of stair sides
  function platform(w, rng, R, h, sides, opts) {
    opts = opts || {};
    const L = LG.stairsLen(h);
    let x0 = R.x0, z0 = R.z0, x1 = R.x1, z1 = R.z1;
    for (const s of sides) { if (s === 'N') z0 += L; if (s === 'S') z1 -= L; if (s === 'W') x0 += L; if (s === 'E') x1 -= L; }
    const mk = opts.mk || 'wall';
    w.solid(mk, x0, 0, z0, x1, h - 0.25, z1, { uv: 3 });
    w.solid('trim', x0 - 0.06, h - 0.25, z0 - 0.06, x1 + 0.06, h, z1 + 0.06, { uv: 2, grad: false });
    // plinth band at base
    w.visual('trim', x0 - 0.04, 0, z0 - 0.04, x1 + 0.04, 0.35, z1 + 0.04, { uv: 1.5 });
    const gaps = [];
    const wd = opts.stairW || 2.6;
    for (const s of sides) {
      if (s === 'N' || s === 'S') { const c = (x0 + x1) / 2; stairs(w, s, s === 'N' ? z0 : z1, c, wd, 0, h, 'trim'); gaps.push({ side: s, a: c - wd / 2 - 0.1, b: c + wd / 2 + 0.1 }); }
      else { const c = (z0 + z1) / 2; stairs(w, s, s === 'W' ? x0 : x1, c, wd, 0, h, 'trim'); gaps.push({ side: s, a: c - wd / 2 - 0.1, b: c + wd / 2 + 0.1 }); }
    }
    if (opts.parapet !== false) parapet(w, x0, z0, x1, z1, h, gaps);
    // decorate top
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const top = { x0: x0 + 0.5, z0: z0 + 0.5, x1: x1 - 0.5, z1: z1 - 0.5, y: h, cx, cz };
    if (opts.decor !== false) {
      if (rng.chance(0.6)) { P().brazier(w, x0 + 1.0, h, z0 + 1.0, 0.9); P().brazier(w, x1 - 1.0, h, z1 - 1.0, 0.9); }
      if (rng.chance(0.4) && x1 - x0 > 6) P().crate(w, cx + rng.range(-1.5, 1.5), z1 - 1.3, h, rng);
      // wall torches on sides
      if (h > 2.5) { P().torch(w, (x0 + x1) / 2 + 1.5, h - 1.0, z1, 'pz'); P().torch(w, (x0 + x1) / 2 - 1.5, h - 1.0, z0, 'nz'); }
    }
    return top;
  }

  function lowWall(w, rng, x, z, len, alongX, h) {
    h = h || rng.range(1.05, 1.35);
    const T = 0.6;
    const broken = rng.chance(0.4);
    const segs = broken ? [[0, len * 0.4], [len * 0.55, len]] : [[0, len]];
    for (const [a, b] of segs) {
      const hh = h * rng.range(0.85, 1.0);
      if (alongX) { w.solid('wall', x + a, 0, z - T / 2, x + b, hh, z + T / 2, { uv: 2.5 }); w.solid('trim', x + a - 0.05, hh, z - T / 2 - 0.05, x + b + 0.05, hh + 0.12, z + T / 2 + 0.05, { uv: 1 }); }
      else { w.solid('wall', x - T / 2, 0, z + a, x + T / 2, hh, z + b, { uv: 2.5 }); w.solid('trim', x - T / 2 - 0.05, hh, z + a - 0.05, x + T / 2 + 0.05, hh + 0.12, z + b + 0.05, { uv: 1 }); }
    }
    if (broken) P().rubble(w, alongX ? x + len * 0.47 : x, 0, alongX ? z : z + len * 0.47, rng, 0.9);
  }

  function house(w, rng, R) {
    const x0 = R.x0 + 0.5, z0 = R.z0 + 0.5, x1 = R.x1 - 0.5, z1 = R.z1 - 0.5;
    const H = rng.range(3.6, 4.8), T = 0.55;
    const doorSide = rng.pick(['N', 'S', 'E', 'W']);
    const ruined = rng.chance(0.7);
    // interior floor (wood planks)
    w.solid('wood', x0 + T, 0, z0 + T, x1 - T, 0.06, z1 - T, { uv: 2, grad: false });
    const wallSeg = (side) => {
      const horiz = side === 'N' || side === 'S';
      const a0 = horiz ? x0 : z0 + T, a1 = horiz ? x1 : z1 - T;
      const fixed = side === 'N' ? z0 : side === 'S' ? z1 - T : side === 'W' ? x0 : x1 - T;
      const len = a1 - a0;
      const door = side === doorSide ? [a0 + len / 2 - 0.9, a0 + len / 2 + 0.9] : null;
      const win = !door && len > 4 && rng.chance(0.7) ? [a0 + len / 2 - 0.7, a0 + len / 2 + 0.7] : null;
      for (let s = a0; s < a1 - 0.01; s += 1) {
        const e = Math.min(a1, s + 1);
        const mid = (s + e) / 2;
        const top = ruined ? H * (0.55 + 0.45 * rng.next()) : H;
        const B = (yA, yB) => {
          if (yB - yA < 0.05) return;
          if (horiz) w.solid('wall', s, yA, fixed, e, yB, fixed + T, { uv: 2.5 });
          else w.solid('wall', fixed, yA, s, fixed + T, yB, e, { uv: 2.5 });
        };
        if (door && mid > door[0] && mid < door[1]) { if (top > 2.6) B(2.5, top); continue; }
        if (win && mid > win[0] && mid < win[1]) { B(0, 1.15); if (top > 2.3) B(2.2, top); continue; }
        B(0, top);
      }
      if (door) {
        // wooden lintel
        if (horiz) w.visual('woodDark', door[0] - 0.15, 2.5, fixed - 0.03, door[1] + 0.15, 2.7, fixed + T + 0.03, { uv: 1 });
        else w.visual('woodDark', fixed - 0.03, 2.5, door[0] - 0.15, fixed + T + 0.03, 2.7, door[1] + 0.15, { uv: 1 });
      }
    };
    for (const s of ['N', 'S', 'W', 'E']) wallSeg(s);
    // corner quoins
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) w.visual('trim', cx - 0.08, 0, cz - 0.08, cx + 0.08, ruined ? 2.2 : H, cz + 0.08, { uv: 1 });
    // roof beams (overhead)
    const nb = Math.floor((x1 - x0) / 1.8);
    for (let i = 1; i < nb; i++) {
      if (ruined && rng.chance(0.4)) continue;
      const bx = x0 + i * (x1 - x0) / nb;
      w.solid('woodDark', bx - 0.12, H - 0.35, z0, bx + 0.12, H - 0.1, z1, { uv: 1 });
    }
    // interior
    const ix = (x0 + x1) / 2, iz = (z0 + z1) / 2;
    const r = rng.next();
    if (r < 0.35) P().table(w, ix, iz, 0.06, (x1 - x0) > (z1 - z0), rng);
    else if (r < 0.6) { P().bookshelf(w, x0 + T + 0.3, iz, 0.06, false, rng); P().crate(w, x1 - T - 0.7, z1 - T - 0.7, 0.06, rng); }
    else if (r < 0.8) { P().cage(w, ix, iz, 0.06, 1.3, rng); }
    else { P().weaponRack(w, ix, z0 + T + 0.35, 0.06, true); P().barrel(w, x1 - T - 0.6, z1 - T - 0.6, 0.06, rng); }
    if (rng.chance(0.5)) P().candles(w, x0 + T + 0.4, 0.06, z1 - T - 0.4, rng);
    if (rng.chance(0.4)) P().rubble(w, x0 + T + 1, 0.06, z0 + T + 1, rng, 0.7);
    if (w.biome === 'catacombs' && rng.chance(0.6)) P().web(w, x0 + T + 0.6, 3.0, z0 + T + 0.6, Math.PI / 4, 1.4);
  }

  function colonnade(w, rng, x, z, len, alongX, h, round) {
    const n = Math.max(2, Math.floor(len / 3.6) + 1);
    const step = len / (n - 1);
    const brokenIdx = new Set();
    for (let i = 0; i < n; i++) if (rng.chance(0.18)) brokenIdx.add(i);
    for (let i = 0; i < n; i++) {
      const px = alongX ? x + i * step : x, pz = alongX ? z : z + i * step;
      if (round) P().pillarRound(w, px, pz, 0, h, 0.42, brokenIdx.has(i), rng);
      else if (brokenIdx.has(i)) { P().pillarSquare(w, px, pz, 0, h * rng.range(0.35, 0.6), 0.85); P().rubble(w, px + 1, 0, pz + 1, rng, 0.8); }
      else P().pillarSquare(w, px, pz, 0, h, 0.85);
    }
    // architrave across intact neighbours
    for (let i = 0; i < n - 1; i++) {
      if (brokenIdx.has(i) || brokenIdx.has(i + 1)) continue;
      const a = alongX ? x + i * step : z + i * step, b = a + step;
      if (alongX) w.solid('block', a - 0.55, h, z - 0.5, b + 0.55, h + 0.75, z + 0.5, { uv: 2 });
      else w.solid('block', x - 0.5, h, a - 0.55, x + 0.5, h + 0.75, b + 0.55, { uv: 2 });
    }
  }

  // east-west dividing wall with arched openings and a walkable crenellated top
  function archWall(w, rng, z, W, openings) {
    const T = 1.6, H = 7.5;
    const z0 = z - T / 2, z1 = z + T / 2;
    const ops = [];
    const n = openings;
    for (let i = 0; i < n; i++) { const c = W * (i + 1) / (n + 1) + rng.range(-3, 3); ops.push([c - 2.2, c + 2.2]); }
    let s = 0;
    for (const [a, b] of ops) { if (a > s) w.solid('wall', s, 0, z0, a, H, z1, { uv: 3 }); s = b; }
    if (s < W) w.solid('wall', s, 0, z0, W, H, z1, { uv: 3 });
    for (const [a, b] of ops) {
      // corbelled arch: stepped blocks narrowing up to a lintel
      w.solid('trim', a, 3.4, z0 - 0.08, a + 0.7, 3.8, z1 + 0.08, { uv: 1 }); w.solid('trim', b - 0.7, 3.4, z0 - 0.08, b, 3.8, z1 + 0.08, { uv: 1 });
      w.solid('block', a, 3.8, z0, a + 1.3, 4.25, z1, { uv: 2 }); w.solid('block', b - 1.3, 3.8, z0, b, 4.25, z1, { uv: 2 });
      w.solid('block', a, 4.25, z0, a + 1.8, 4.7, z1, { uv: 2 }); w.solid('block', b - 1.8, 4.25, z0, b, 4.7, z1, { uv: 2 });
      w.solid('wall', a, 4.7, z0, b, H, z1, { uv: 3 });
      w.visual('trim', (a + b) / 2 - 0.35, 4.5, z0 - 0.1, (a + b) / 2 + 0.35, 5.3, z1 + 0.1, { uv: 1 }); // keystone
      // jamb pilasters
      w.solid('trim', a - 0.25, 0, z0 - 0.2, a, 3.4, z1 + 0.2, { uv: 1.5 }); w.solid('trim', b, 0, z0 - 0.2, b + 0.25, 3.4, z1 + 0.2, { uv: 1.5 });
      P().torch(w, a - 0.6, 3.0, z1, 'pz'); P().torch(w, b + 0.6, 3.0, z0, 'nz');
    }
    // cornice + merlons on top (the walkway between the merlons burns: see fireTops)
    w.solid('trim', 0, H, z0 - 0.15, W, H + 0.25, z1 + 0.15, { uv: 2 });
    for (let x = 0.4; x < W - 0.6; x += 1.5) { w.solid('block', x, H + 0.25, z0 - 0.15, x + 0.8, H + 1.1, z0 + 0.3, { uv: 1.5 }).merlon = true; w.solid('block', x, H + 0.25, z1 - 0.3, x + 0.8, H + 1.1, z1 + 0.15, { uv: 1.5 }).merlon = true; }
    // banners
    for (let i = 0; i < 2; i++) P().banner(w, rng.range(4, W - 4), H - 0.4, z1 + 0.01, 'pz', 3.2);
    return ops;
  }

  LG.gateXs = (W, n) => (n >= 3 ? [Math.round(W * 0.22), Math.round(W / 2), Math.round(W * 0.78)] : [Math.round(W / 2)]);
  // ---------------- perimeter & gates ----------------
  function perimeter(w, rng, W, D, opts) {
    opts = opts || {};
    const OUT = w.mats.biome.outdoor; // 'ruins' | 'sky' | undefined
    const H = OUT === 'ruins' ? Math.min(opts.h || WALL_H, 8) : (opts.h || WALL_H), TOP = opts.top || WALL_TOP;
    const gh = 6;
    if (OUT) opts.beams = 0;
    const gxs = LG.gateXs(W, opts.gates || 1);
    // south wall (z = D..D+T) — the sky island is open on the south/east/west edges
    if (OUT !== 'sky') w.solid('block', -WALL_T, 0, D, W + WALL_T, H, D + WALL_T, { uv: 4 });
    // north wall with one or more exit openings
    let wx = -WALL_T;
    for (const gx of gxs) {
      w.solid('block', wx, 0, -WALL_T, gx - 2.5, H, 0, { uv: 4 });
      w.solid('block', gx - 2.5, gh, -WALL_T, gx + 2.5, H, 0, { uv: 4 });
      wx = gx + 2.5;
    }
    w.solid('block', wx, 0, -WALL_T, W + WALL_T, H, 0, { uv: 4 });
    // west / east (a void arena only keeps them along the road)
    const sideZ0 = opts.voidArena ? opts.arenaD : 0;
    if (OUT !== 'sky') {
      // side walls; opts.windows = [[z0, z1, y0, y1], ...] leaves barred openings in both
      const wins = opts.windows || [];
      const sideWall = (xa, xb) => {
        let z = sideZ0;
        for (const [a, b, y0, y1] of wins) { w.solid('block', xa, 0, z, xb, H, a, { uv: 4 }); w.solid('block', xa, 0, a, xb, y0, b, { uv: 4 }); w.solid('block', xa, y1, a, xb, H, b, { uv: 4 }); z = b; }
        w.solid('block', xa, 0, z, xb, H, D, { uv: 4 });
      };
      sideWall(-WALL_T, 0); sideWall(W, W + WALL_T);
    }
    if (!OUT) {
      // upper cave rock band (not grapplable) - visually distinct
      for (const [a, b, c, d] of [[-WALL_T, -WALL_T, W + WALL_T, 0], [-WALL_T, D, W + WALL_T, D + WALL_T], [-WALL_T, sideZ0, 0, D], [W, sideZ0, W + WALL_T, D]]) w.solid('rock', a, H, b, c, TOP, d, { uv: 6, noGrapple: true, grad: false });
    } else if (OUT === 'ruins') {
      // crenellated city walls under an open sky
      const mer = (x0, z0, x1, z1) => w.solid('block', x0, H, z0, x1, H + 1.0, z1, { uv: 2, noGrapple: true });
      for (let x = -WALL_T + 0.3; x < W + WALL_T - 1; x += 1.8) { mer(x, -WALL_T, x + 0.9, -WALL_T + 0.7); mer(x, D + WALL_T - 0.7, x + 0.9, D + WALL_T); }
      for (let z = 0.3; z < D - 1; z += 1.8) { mer(-WALL_T, z, -WALL_T + 0.7, z + 0.9); mer(W + WALL_T - 0.7, z, W + WALL_T, z + 0.9); }
    } else {
      // sky island: the temple facade on the north gets a golden crest
      w.solid('trim', -WALL_T, H, -WALL_T, W + WALL_T, H + 0.6, 0, { uv: 2, noGrapple: true });
      // open edges guarded by a low balustrade (the edge of the world is unmistakable)
      const bal = (x0, z0, x1, z1) => { w.solid('block', x0, 0, z0, x1, 0.95, z1, { uv: 1 }); w.visual('trim', x0 - 0.04, 0.95, z0 - 0.04, x1 + 0.04, 1.02, z1 + 0.04, { uv: 1 }); };
      bal(0, 0, 0.4, D); bal(W - 0.4, 0, W, D); bal(0, D - 0.4, W / 2 - 4.4, D); bal(W / 2 + 4.4, D - 0.4, W, D);
      for (let z = 4; z < D - 2; z += 4) { w.solid('block', -0.05, 0, z - 0.3, 0.45, 1.3, z + 0.3, { uv: 1 }); w.solid('block', W - 0.45, 0, z - 0.3, W + 0.05, 1.3, z + 0.3, { uv: 1 }); }
    }
    if (OUT !== 'sky') {
      // flush cornice band
      w.visual('trim', -0.02, H - 0.6, sideZ0, 0.0, H, D, { uv: 1 });
      w.visual('trim', W, H - 0.6, sideZ0, W + 0.02, H, D, { uv: 1 });
      w.visual('trim', 0, H - 0.6, D - 0.02, W, H, D, { uv: 1 });
      // plinth band at floor
      w.visual('trim', -0.06, 0, sideZ0, 0, 0.5, D, { uv: 1 }); w.visual('trim', W, 0, sideZ0, W + 0.06, 0.5, D, { uv: 1 });
      w.visual('trim', 0, 0, D, W, 0.5, D + 0.06, { uv: 1 });
    }
    w.visual('trim', 0, H - 0.6, -0.02, W, H, 0, { uv: 1 });
    // buttresses + torches
    const butt = (x, z, side) => {
      const bw = 0.7, bd = 0.9, bh = H - 2.5;
      if (side === 'W') { w.solid('wall', 0, 0, z - bw, bd, bh, z + bw, { uv: 3 }); w.solid('trim', 0, bh, z - bw - 0.05, bd + 0.08, bh + 0.35, z + bw + 0.05, { uv: 1 }); }
      if (side === 'E') { w.solid('wall', W - bd, 0, z - bw, W, bh, z + bw, { uv: 3 }); w.solid('trim', W - bd - 0.08, bh, z - bw - 0.05, W, bh + 0.35, z + bw + 0.05, { uv: 1 }); }
      if (side === 'S') { w.solid('wall', x - bw, 0, D - bd, x + bw, bh, D, { uv: 3 }); w.solid('trim', x - bw - 0.05, bh, D - bd - 0.08, x + bw + 0.05, bh + 0.35, D, { uv: 1 }); }
      if (side === 'N') { w.solid('wall', x - bw, 0, 0, x + bw, bh, bd, { uv: 3 }); w.solid('trim', x - bw - 0.05, bh, 0, x + bw + 0.05, bh + 0.35, bd + 0.08, { uv: 1 }); }
    };
    const sp = 8;
    for (let z = sp; z < D - 2; z += sp) {
      if (opts.voidArena && z < opts.arenaD + 2) continue;
      if (OUT === 'sky') { if (z % 16 === 0) { P().brazier(w, 1.4, 0, z, 1); P().brazier(w, W - 1.4, 0, z, 1); } continue; }
      butt(0, z, 'W'); butt(0, z, 'E');
      P().torch(w, 0, 3.3, z - sp / 2, 'px'); P().torch(w, W, 3.3, z - sp / 2, 'nx');
      if (rng.chance(0.25)) P().banner(w, 0, Math.min(8.5, H - 1), z - sp / 2, 'px', Math.min(4, H - 3));
      if (rng.chance(0.25)) P().banner(w, W, Math.min(8.5, H - 1), z - sp / 2, 'nx', Math.min(4, H - 3));
    }
    for (let x = sp; x < W - 2; x += sp) {
      if (Math.abs(x - W / 2) > 5 && OUT !== 'sky') butt(x, 0, 'S');
      if (gxs.every((g) => Math.abs(x - g) > 5.2)) butt(x, 0, 'N');
      if (Math.abs(x - sp / 2 - W / 2) > 4 && OUT !== 'sky') P().torch(w, x - sp / 2, 3.3 + (opts.southY || 0), D, 'nz');
      if (gxs.every((g) => Math.abs(x - sp / 2 - g) > 4.8)) P().torch(w, x - sp / 2, 3.3, 0, 'pz');
    }
    // entrance gate (decorative, closed portcullis on the south wall)
    // the entrance gate sits on whatever ground the south end has (boss roads start far below)
    w._gfY = opts.southY || 0; gateFrame(w, W / 2, D, 'S', opts.southY || 0); w._gfY = 0;
    if (OUT !== 'sky') w.deferred.push((grp) => { const pc = portcullis(w, 4.6, 5.4); pc.position.set(W / 2, opts.southY || 0, D - 0.15); grp.add(pc); });
    if (OUT) scenery(w, rng, W, D, OUT);
    // exit gates (real openings + tunnels); type labels are attached when the area is cleared
    w.exits = [];
    gxs.forEach((gx, idx) => {
      const gx0 = gx - 2.5, gx1 = gx + 2.5;
      gateFrame(w, gx, 0, 'N');
      const tz = -12;
      w.solid('block', gx0 - 2, 0, tz, gx0, gh + 1, -WALL_T, { uv: 3 });
      w.solid('block', gx1, 0, tz, gx1 + 2, gh + 1, -WALL_T, { uv: 3 });
      w.solid('block', gx0 - 2, gh, tz, gx1 + 2, gh + 2, -WALL_T, { uv: 3 });
      w.solid('floor', gx0, -1, tz, gx1, 0, 0, { uv: 3, grad: false });
      w.solid('rock', gx0 - 2, -6, tz - 2, gx1 + 2, gh + 2, tz, { uv: 4 });
      for (let i = 0; i < 6; i++) w.visual('trim', gx0, -0.25 * (i + 1) - 0.01, tz + 1 + i * 0.01, gx1, -0.25 * i, tz + 2.5 - i * 0.25, { uv: 1 });
      for (let k = 0; k < 2; k++) P().torch(w, k ? gx1 : gx0, 3.0, -6, k ? 'nx' : 'px');
      const exit = { idx, x: gx, z: -1, gx0, gx1, open: false, portcullis: null, col: null, type: null };
      exit.col = w.addCollider(gx0, 0, -0.35, gx1, gh, 0.05, { surf: 'metal', tag: 'portcullis' });
      w.deferred.push((grp) => {
        const pc = portcullis(w, gx1 - gx0, gh); pc.position.set(gx, 0, -0.15); grp.add(pc); exit.portcullis = pc;
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - gx0, gh), new THREE.MeshBasicMaterial({ map: G.Tex.spr.portal, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0 }));
        pm.position.set(gx, gh / 2, tz + 0.3); grp.add(pm); exit.glow = pm;
      });
      w.addLight(gx, 3, tz + 2, { flame: 0, intensity: 0, range: 18, color: '#ffc080', prio: 3, steady: true, exitLight: true, emit: false });
      exit.light = w.lightSources[w.lightSources.length - 1];
      exit.light.on = false;
      w.exits.push(exit);
      w.triggers.push({ x0: gx0, z0: tz, x1: gx1, z1: -3.2, kind: 'exit', exit });
    });
    w.exit = w.exits[Math.floor(w.exits.length / 2)];
    // high cross beams with chandeliers (grapple anchors)
    const nbeam = opts.beams ?? rng.int(1, 3);
    for (let i = 0; i < nbeam; i++) {
      const bz = D * (i + 1) / (nbeam + 1) + rng.range(-3, 3);
      const by = rng.range(14.5, 17);
      w.solid('woodDark', 0, by, bz - 0.4, W, by + 0.8, bz + 0.4, { uv: 2 });
      w.solid('iron', 0, by - 0.1, bz - 0.45, W, by, bz + 0.45, { uv: 1 });
      for (let k = 0; k < 2; k++) { const cx = W * (k + 1) / 3 + rng.range(-3, 3); P().chandelier(w, cx, by - 4.5, bz, by - 0.1); }
    }
  }
  // ---------------- boss approach: a low canyon road, a flight of stairs, and the fortress high above ----------------
  const ROAD_LOW = -15;
  function bossRoad(w, rng, W, AD, D, bossId, facade) {
    const cx = W / 2, B = w.biome, LOW = ROAD_LOW;
    const gz0 = AD, gz1 = AD + 3, gate = 3.2, FH = 17;
    const zL = AD + 13, zS = AD + 47;            // landing (y=0) ends at zL; stairs (34 steps) run zL..zS; low road beyond
    const lift = bossId === 'abyssking';
    const zC = zL + 4; // final boss: the landing's cliff edge (the elevator rises against it)
    const fy = lift ? (z) => (z <= zC ? 0 : LOW) : (z) => (z <= zL ? 0 : z >= zS ? LOW : -(z - zL) * (-LOW / (zS - zL)));
    w.roadFloorY = fy;
    // ---- ground: landing slab, stairs (or the cliff + elevator), low road ----
    w.solid('cobble', 0, -1, gz1, W, 0, zL, { uv: 2 });
    if (lift) {
      w.solid('block', 0, LOW - 1, zL, W, 0, zC, { uv: 2 });
      w.solid('cobble', 0, LOW - 2, zC, W, LOW, zS, { uv: 2 });
      const x0 = cx - 3, x1 = cx + 3, z0 = zC, z1 = zC + 6;
      const col = w.addCollider(x0, LOW - 0.4, z0, x1, LOW + 0.3, z1, { surf: 'metal', noGrapple: true });
      w.elevator = { x0, x1, z0, z1, col, y: LOW + 0.3, y0: LOW + 0.3, y1: 0.02, state: 'idle', t: 0, ride: 0 };
      // the shaft: four obsidian posts with violet runes, chains and a glowing rune disc that rides up with the platform
      for (const [px, pz] of [[x0 - 0.5, z0 + 0.4], [x1 + 0.5, z0 + 0.4], [x0 - 0.5, z1 - 0.4], [x1 + 0.5, z1 - 0.4]]) {
        w.solid('block', px - 0.35, LOW, pz - 0.35, px + 0.35, 6, pz + 0.35, { uv: 2 });
        w.addLight(px, 6.4, pz, { flame: 0, intensity: 3, range: 8, color: '#b070ff', emit: false, prio: 0.6 });
      }
      w.deferred.push((grp) => {
        const g = new THREE.Group(); g.position.set(cx, LOW + 0.3, (z0 + z1) / 2);
        const slab = new THREE.Mesh(G.Props.PG.box, w.mats.iron); slab.scale.set(6, 0.5, 6); slab.position.y = -0.25; g.add(slab);
        const rune = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.6, 6), new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        rune.rotation.x = -Math.PI / 2; rune.position.y = 0.02; g.add(rune);
        const core = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xe0c0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.rotation.x = -Math.PI / 2; core.position.y = 0.025; g.add(core);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const ch = new THREE.Mesh(G.Props.PG.cyl8, w.mats.iron); ch.scale.set(0.05, 30, 0.05); ch.position.set(sx * 2.8, 15, sz * 2.8); g.add(ch); }
        grp.add(g); w.elevator.mesh = g; w.elevator.rune = rune;
        w.animated.push({ kind: 'spin', m: rune, sp: 0.6, axis: 'z' });
      });
    } else {
      const steps = zS - zL;
      for (let i = 0; i < steps; i++) { const z0 = zL + i, top = fy(z0 + 1); w.solid('block', 0, LOW - 1, z0, W, top, z0 + 1, { uv: 1 }); w.visual('trim', cx - 9, top - 0.06, z0 - 0.02, cx + 9, top + 0.02, z0 + 0.12, { uv: 1 }); }
    }
    w.solid('cobble', 0, LOW - 2, zS, W, LOW, D, { uv: 2 });
    w.solid('block', -3, LOW - 2, D, W + 3, 0.02, D + 3, { uv: 4 }); // the south wall continues down to the low road
    // ---- canyon walls (ragged), with a wide merchant nook on the low road ----
    w.roadAlcoves = [];
    const nook = { z0: zS + 6, z1: zS + 18 };
    const segs = [];
    for (let z = gz1; z < D; z += 6) {
      const z1 = Math.min(D, z + 6);
      let hwL = rng.range(7, 9.5), hwR = rng.range(7, 9.5), alcove = 0;
      if (z1 > nook.z0 && z < nook.z1) hwL = 16;
      else if (z > zS && rng.chance(0.3)) { alcove = rng.chance(0.5) ? -1 : 1; if (alcove < 0) hwL += 4; else hwR += 4; }
      segs.push({ z0: z, z1, hwL, hwR, alcove });
    }
    for (const s of segs) {
      const y0 = Math.min(fy(s.z0), fy(s.z1)) - 2, h = 13 + rng.range(-2, 3);
      w.solid('rock', 0, y0, s.z0, cx - s.hwL, h, s.z1, { uv: 6, grad: false });
      w.solid('rock', cx + s.hwR, y0, s.z0, W, h, s.z1, { uv: 6, grad: false });
      const zm = (s.z0 + s.z1) / 2, f = fy(zm);
      if (s.z0 >= zS || s.z1 <= zL) {
        if (rng.chance(0.55)) P().rubble(w, cx - s.hwL + 0.8, f, zm + rng.range(-2, 2), rng, rng.range(0.8, 1.5), 'rock');
        if (rng.chance(0.55)) P().rubble(w, cx + s.hwR - 0.8, f, zm + rng.range(-2, 2), rng, rng.range(0.8, 1.5), 'rock');
      }
      if (s.alcove) w.roadAlcoves.push({ x: cx + s.alcove * ((s.alcove < 0 ? s.hwL : s.hwR) - 2), z: zm, side: s.alcove, y: f });
    }
    // ---- merchant nook (fixed): three stands + a paid healing basin, lanterns and a tent ----
    const nz = (nook.z0 + nook.z1) / 2, nx = cx - 12;
    w.miniSlots = [-3.2, 0, 3.2].map((dz) => ({ x: nx + 2.2, y: LOW + 1.15, z: nz + dz, face: 1 }));
    w.miniHeal = new THREE.Vector3(nx + 2.2, LOW, nz + 6.2);
    w.roadMerchant = new THREE.Vector3(nx - 1.4, LOW, nz);
    w.solid('woodDark', nx - 3.2, LOW, nz - 5, nx - 2.9, LOW + 3.2, nz - 4.7, { uv: 1 }); w.solid('woodDark', nx - 3.2, LOW, nz + 4.7, nx - 2.9, LOW + 3.2, nz + 5, { uv: 1 });
    w.visual('cloth', nx - 3.6, LOW + 3.2, nz - 5.2, nx + 0.4, LOW + 3.35, nz + 5.2, { uv: 2 });
    P().rug(w, nx, nz, LOW, 5, 10, [0.35, 0.18, 0.08]);
    P().crate(w, nx - 2.4, nz - 3.6, LOW, rng); P().barrel(w, nx - 2.5, nz + 3.4, LOW, rng);
    P().candles(w, nx - 2.2, LOW, nz + 1.4, rng, true);
    w.addLight(nx, LOW + 2.8, nz, { flame: 0, intensity: 9, range: 11, color: '#ffc080', emit: false, prio: 1.4 });
    buildFacade(w, rng, facade || 'fortress', { cx, gz0, gz1, gate, FH, W, B });
    // stair-side braziers lead the eye upward
    for (const z of [zS - 2, zL + 9, zL + 2]) { P().brazier(w, cx - 7.6, fy(z), z, 0.9, true); P().brazier(w, cx + 7.6, fy(z), z, 0.9, true); }
    // ---- lights along the low road (warm, thinning out) ----
    for (let z = D - 8; z > zS; z -= 9) {
      const s = segs.find((g) => z >= g.z0 && z < g.z1) || segs[0];
      if (!(z > nook.z0 - 2 && z < nook.z1 + 2)) P().torch(w, cx - s.hwL, LOW + 3.2, z, 'px');
      P().torch(w, cx + s.hwR, LOW + 3.2, z + 3, 'nx');
    }
    // pikes on the landing before the gate
    for (let z = gz1 + 8; z < zL - 1; z += 3) { pike(w, cx - 5.5, z, rng, 0); pike(w, cx + 5.5, z + 1.5, rng, 0); }
    // ---- themed dressing for the guardian waiting inside ----
    roadTheme(w, rng, bossId, { cx, segs, fy, zS, zL, gz1, D, LOW, nook });
    if (B === 'catacombs' && bossId !== 'broodmother') for (let i = 0; i < 4; i++) P().web(w, cx + (rng.chance(0.5) ? -8 : 8), LOW + rng.range(4, 9), rng.range(zS + 2, D - 6), Math.PI / 2, rng.range(2, 3.5));
    w.road = { z0: gz1 + 4, z1: D - 4 };
    w.npcSpots = [];
    // perimeter torches that ended up buried inside the canyon rock
    w.lightSources = w.lightSources.filter((l) => !(l.pos.z > AD + 3 && Math.abs(l.pos.x - cx) > 17));
  }
  // skull on a pike (decor + thin collider)
  function pike(w, x, z, rng, y) {
    y = y || 0;
    w.addCollider(x - 0.08, y, z - 0.08, x + 0.08, y + 2.4, z + 0.08, { surf: 'wood' });
    w.batch.geo('woodDark', G.Props.PG.cyl8, G.Props.M(x, y + 1.2, z, 0.05, 2.4, 0.05, rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)), {});
    P().skull(w, x, y + 2.35, z, rng.range(0, 6), 1.1);
  }
  // per-boss road dressing: tells the player what waits inside
  function roadTheme(w, rng, id, R) {
    const { cx, segs, fy, zS, zL, gz1, D, LOW, nook } = R;
    const PG = G.Props.PG;
    // random spots on the flat parts (low road outside the nook, or the landing)
    const spot = (wall) => {
      for (let t = 0; t < 20; t++) {
        const low = rng.chance(0.78);
        const z = low ? rng.range(zS + 2, D - 6) : rng.range(gz1 + 6, zL - 1);
        if (low && z > nook.z0 - 1 && z < nook.z1 + 1 && !wall) continue;
        const s = segs.find((g) => z >= g.z0 && z < g.z1) || segs[segs.length - 1];
        const side = rng.chance(0.5) ? -1 : 1;
        const hw = side < 0 ? s.hwL : s.hwR;
        if (low && side < 0 && z > nook.z0 - 1 && z < nook.z1 + 1) continue;
        const x = wall ? cx + side * (hw - 0.05) : cx + side * rng.range(2.5, Math.min(hw, 9) - 1.2);
        return { x, z, y: fy(z), side, hw };
      }
      return { x: cx + 4, z: D - 10, y: LOW, side: 1, hw: 8 };
    };
    const deco = (fn) => w.deferred.push(fn);
    const mat = (o) => new THREE.MeshStandardMaterial(o);
    const mesh = (grp, geo, m, x, y, z, sx, sy, sz, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o; };
    if (id === 'colossus') {
      // a toppled giant: broken colossal statues, a stone hand, boulders
      for (let i = 0; i < 4; i++) { const p = spot(); P().statue(w, p.x, p.z, p.y, rng.range(0, 6), rng, rng.range(1.6, 2.4)); }
      for (let i = 0; i < 8; i++) { const p = spot(); P().rubble(w, p.x, p.y, p.z, rng, rng.range(1.4, 2.4), 'rock'); }
      for (let i = 0; i < 3; i++) { const p = spot(); P().pillarRound(w, p.x, p.z, p.y, rng.range(2, 4), 0.6, true, rng); }
      const p = spot(); w.addCollider(p.x - 1.4, p.y, p.z - 1.6, p.x + 1.4, p.y + 1.4, p.z + 1.6);
      deco((grp) => { const m = w.mats.block; const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = rng.range(0, 6); mesh(g, PG.box, m, 0, 0.6, 0, 2.2, 1.2, 1.6); for (let k = 0; k < 4; k++) mesh(g, PG.box, m, -0.75 + k * 0.5, 0.5, 1.4, 0.38, 0.8, 1.6, 0.25); mesh(g, PG.box, m, 1.3, 0.5, 0.4, 0.5, 0.7, 1.2, 0, 0.5); grp.add(g); });
    } else if (id === 'wyrm') {
      // acid pools, burrow mounds and a giant ribcage
      const acid = mat({ color: 0x5aa010, emissive: 0x3a8000, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 7; i++) { const p = spot(); deco((grp) => { const m = new THREE.Mesh(new THREE.CircleGeometry(rng.range(1, 2.2), 20), acid); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.03, p.z); grp.add(m); }); }
      for (let i = 0; i < 5; i++) { const p = spot(); P().rubble(w, p.x, p.y, p.z, rng, rng.range(1.2, 2), 'rock'); deco((grp) => { const h = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), mat({ color: 0x050302 })); h.rotation.x = -Math.PI / 2; h.position.set(p.x + 1.4, p.y + 0.04, p.z); grp.add(h); }); }
      const p = spot(); const bone = w.mats.ceramic || w.mats.trim;
      deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = rng.range(0, 6); mesh(g, PG.cyl8, bone, 0, 0.4, 0, 0.25, 7, 0.25, 0, 0, Math.PI / 2); for (let k = 0; k < 7; k++) for (const s of [-1, 1]) mesh(g, PG.cone, bone, -3 + k, 1.4, s * 0.9, 0.12, 2.6, 0.12, s * 0.5, 0, 0); grp.add(g); });
    } else if (id === 'archon') {
      // floating watching eyes, violet ritual circles, candles
      const eyeM = mat({ color: 0xe8e0d0, roughness: 0.3 }), iris = mat({ color: 0x200030, emissive: 0xa040ff, emissiveIntensity: 2 });
      for (let i = 0; i < 9; i++) { const p = spot(); const hgt = rng.range(2.5, 6); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y + hgt, p.z); const s = rng.range(0.35, 0.7); mesh(g, PG.sph, eyeM, 0, 0, 0, s, s, s); mesh(g, PG.sph, iris, 0, 0, s * 0.8, s * 0.45, s * 0.45, s * 0.3); g.lookAt(cx, p.y + 1.6, p.z + 6); grp.add(g); w.animated.push({ kind: 'islet', m: g, y0: g.position.y, ph: rng.range(0, 6) }); }); }
      for (let i = 0; i < 4; i++) { const p = spot(); deco((grp) => { const m = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.04, p.z); grp.add(m); }); P().candles(w, p.x, p.y, p.z, rng, true); }
      for (const s of segs) if (rng.chance(0.4) && s.z0 > zS) P().banner(w, cx - s.hwL, LOW + 7, (s.z0 + s.z1) / 2, 'px', 4, 0x4a1a6a);
    } else if (id === 'executioner') {
      // gallows, headsman's blocks, cages and hanging chains
      for (let i = 0; i < 3; i++) { const p = spot(); const ry = rng.chance(0.5); w.addCollider(p.x - 0.15, p.y, p.z - 0.15, p.x + 0.15, p.y + 4, p.z + 0.15, { surf: 'wood' }); deco((grp) => { const m = w.mats.woodDark; const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = ry ? Math.PI / 2 : 0; mesh(g, PG.box, m, 0, 2, 0, 0.25, 4, 0.25); mesh(g, PG.box, m, 0.9, 3.9, 0, 2, 0.22, 0.22); mesh(g, PG.box, m, 0.45, 3.3, 0, 0.12, 1.2, 0.12, 0, 0, 0.8); mesh(g, PG.torus, w.mats.cloth || m, 1.7, 2.9, 0, 0.18, 0.22, 0.18); mesh(g, PG.cyl8, w.mats.cloth || m, 1.7, 3.4, 0, 0.02, 0.9, 0.02); grp.add(g); }); }
      for (let i = 0; i < 3; i++) { const p = spot(); w.addCollider(p.x - 0.5, p.y, p.z - 0.4, p.x + 0.5, p.y + 0.7, p.z + 0.4, { surf: 'wood' }); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = rng.range(0, 6); mesh(g, PG.cyl8, w.mats.wood, 0, 0.35, 0, 0.5, 0.7, 0.5); mesh(g, PG.box, w.mats.iron, 0.15, 0.95, 0, 0.05, 0.5, 0.5, 0, 0, 0.25); mesh(g, PG.cyl8, w.mats.woodDark, 0.25, 1.2, 0, 0.03, 0.8, 0.03, 0, 0, 0.25); const bl = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), mat({ color: 0x3a0404, roughness: 0.3 })); bl.rotation.x = -Math.PI / 2; bl.position.y = 0.02; g.add(bl); grp.add(g); }); }
      for (let i = 0; i < 4; i++) { const p = spot(); P().cage(w, p.x, p.z, p.y, 1, rng); }
      for (let i = 0; i < 14; i++) { const p = spot(true); const len = rng.range(2, 6); P().chain(w, p.x - p.side * 0.4, p.y + 9 - len, p.z, len); }
    } else if (id === 'broodmother') {
      // webs everywhere, egg clutches, cocooned victims
      for (let i = 0; i < 18; i++) { const p = spot(true); P().web(w, p.x - p.side * 0.1, p.y + rng.range(2, 9), p.z, Math.PI / 2, rng.range(2, 4.5)); }
      for (let z = zS + 4; z < D - 4; z += rng.range(7, 11)) P().web(w, cx, LOW + rng.range(6, 9), z, 0, rng.range(5, 8));
      const egg = mat({ color: 0xd8e0b0, roughness: 0.35, emissive: 0x2a3a10, transparent: true, opacity: 0.92 });
      for (let i = 0; i < 6; i++) { const p = spot(); deco((grp) => { for (let k = 0; k < 5; k++) { const e = new THREE.Mesh(PG.sph, egg); const s = rng.range(0.25, 0.45); e.scale.set(s, s * 1.3, s); e.position.set(p.x + rng.range(-0.6, 0.6), p.y + s, p.z + rng.range(-0.6, 0.6)); grp.add(e); } }); }
      const silk = mat({ color: 0xe8e4d8, roughness: 0.9 });
      for (let i = 0; i < 6; i++) { const p = spot(true); const hy = p.y + rng.range(3, 6); deco((grp) => { const c = new THREE.Mesh(PG.sph, silk); c.scale.set(0.4, 0.95, 0.4); c.position.set(p.x - p.side * 0.6, hy, p.z); grp.add(c); const th = new THREE.Mesh(PG.cyl8, silk); th.scale.set(0.015, 3, 0.015); th.position.set(p.x - p.side * 0.6, hy + 2, p.z); grp.add(th); }); }
    } else if (id === 'twins') {
      // light on the left, shadow on the right
      for (const s of segs) if (s.z0 > zS && rng.chance(0.6)) { P().banner(w, cx - s.hwL, LOW + 7, (s.z0 + s.z1) / 2, 'px', 4, 0xd8c890); P().banner(w, cx + s.hwR, LOW + 7, (s.z0 + s.z1) / 2 + 2, 'nx', 4, 0x14101a); }
      const goldM = mat({ color: 0xe0c070, metalness: 1, roughness: 0.25 }), darkM = mat({ color: 0x2a2030, metalness: 0.7, roughness: 0.3 });
      for (let i = 0; i < 8; i++) { const p = spot(); deco((grp) => { const m = p.side < 0 ? goldM : darkM; const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.set(rng.range(-0.2, 0.2), rng.range(0, 6), rng.range(-0.25, 0.25)); mesh(g, PG.box, m, 0, 0.8, 0, 0.06, 1.6, 0.14); mesh(g, PG.box, m, 0, 1.25, 0, 0.42, 0.06, 0.08); grp.add(g); }); }
      for (let i = 0; i < 3; i++) { const p = spot(); P().statue(w, p.x, p.z, p.y, p.side < 0 ? Math.PI / 2 : -Math.PI / 2, rng, 1.3); }
    } else if (id === 'heart') {
      // the walls themselves pulse with flesh and veins
      const flesh = mat({ color: 0x6a0a14, roughness: 0.4, emissive: 0x3a0008, emissiveIntensity: 0.9 }), vein = mat({ color: 0x3a0408, roughness: 0.5 });
      for (let i = 0; i < 16; i++) { const p = spot(true); const hy = p.y + rng.range(0.5, 7); deco((grp) => { const s = rng.range(0.5, 1.4); const m = new THREE.Mesh(PG.sph, flesh); m.scale.set(s * 0.6, s, s); m.position.set(p.x, hy, p.z); grp.add(m); }); }
      for (let i = 0; i < 10; i++) { const p = spot(); deco((grp) => { const v = new THREE.Mesh(PG.cyl8, vein); v.scale.set(0.12, rng.range(3, 6), 0.12); v.rotation.set(Math.PI / 2, rng.range(0, 6), 0); v.rotation.order = 'YXZ'; v.position.set(p.x, p.y + 0.08, p.z); grp.add(v); }); }
      for (let i = 0; i < 6; i++) { const p = spot(); deco((grp) => { const b = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.8, 1.6), 18), mat({ color: 0x5a0008, roughness: 0.15, emissive: 0x200004 })); b.rotation.x = -Math.PI / 2; b.position.set(p.x, p.y + 0.03, p.z); grp.add(b); }); }
    } else if (id === 'hunter') {
      // a hunting ground: target dummies, bolts in the walls, snare traps
      for (let i = 0; i < 6; i++) { const p = spot(); w.addCollider(p.x - 0.2, p.y, p.z - 0.2, p.x + 0.2, p.y + 1.8, p.z + 0.2, { surf: 'wood' }); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = rng.range(0, 6); mesh(g, PG.cyl8, w.mats.woodDark, 0, 0.9, 0, 0.06, 1.8, 0.06); mesh(g, PG.box, w.mats.woodDark, 0, 1.3, 0, 0.9, 0.08, 0.08); mesh(g, PG.sph, w.mats.cloth || w.mats.wood, 0, 1.75, 0, 0.22, 0.25, 0.22); mesh(g, PG.box, w.mats.cloth || w.mats.wood, 0, 1.2, 0, 0.45, 0.6, 0.25); for (let k = 0; k < 3; k++) mesh(g, PG.cyl8, w.mats.iron, rng.range(-0.15, 0.15), rng.range(1, 1.7), 0.2, 0.012, 0.5, 0.012, Math.PI / 2 + rng.range(-0.3, 0.3)); grp.add(g); }); }
      for (let i = 0; i < 24; i++) { const p = spot(true); const hy = p.y + rng.range(0.6, 5); deco((grp) => { const b = new THREE.Mesh(PG.cyl8, w.mats.iron); b.scale.set(0.015, 0.7, 0.015); b.rotation.set(0, 0, Math.PI / 2 + rng.range(-0.3, 0.3)); b.position.set(p.x - p.side * 0.3, hy, p.z); grp.add(b); }); }
      for (let i = 0; i < 5; i++) { const p = spot(); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y + 0.05, p.z); mesh(g, PG.torus, w.mats.iron, 0, 0, 0, 0.35, 0.35, 0.35, Math.PI / 2); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; mesh(g, PG.cone, w.mats.iron, Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3, 0.03, 0.12, 0.03); } grp.add(g); }); }
    } else if (id === 'drake') {
      // scorched road: burn scars, claw-gouged boulders, charred lances and a huge shed scale
      for (let i = 0; i < 9; i++) { const p = spot(); deco((grp) => { const m = new THREE.Mesh(new THREE.CircleGeometry(rng.range(1.2, 2.6), 18), mat({ color: 0x0a0806, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.025, p.z); grp.add(m); }); }
      for (let i = 0; i < 5; i++) { const p = spot(); P().rubble(w, p.x, p.y, p.z, rng, rng.range(1.4, 2.2), 'rock'); deco((grp) => { for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(PG.box, mat({ color: 0x1a1210 })); c.scale.set(0.08, 0.05, 1.6); c.position.set(p.x + (k - 1) * 0.3, p.y + 1.2, p.z + 0.9); c.rotation.set(0.3, 0.4, 0); grp.add(c); } }); }
      for (let i = 0; i < 6; i++) { const p = spot(); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.set(rng.range(0.3, 0.9), rng.range(0, 6), 0); mesh(g, PG.cyl8, mat({ color: 0x1a1008, roughness: 1 }), 0, 1.4, 0, 0.05, 2.8, 0.05); mesh(g, PG.cone, w.mats.iron, 0, 2.9, 0, 0.09, 0.4, 0.09); grp.add(g); }); }
      for (let i = 0; i < 2; i++) { const p = spot(); deco((grp) => { const m = new THREE.Mesh(PG.sph, mat({ color: 0x28323e, roughness: 0.4, metalness: 0.3 })); m.scale.set(1.2, 0.12, 0.9); m.position.set(p.x, p.y + 0.1, p.z); m.rotation.y = rng.range(0, 6); grp.add(m); }); }
      for (let i = 0; i < 6; i++) { const p = spot(); P().candles && w.addLight(p.x, p.y + 0.6, p.z, { flame: 1.4, intensity: 4, range: 6, color: '#ff8030', emit: true, prio: 0.5 }); }
    } else if (id === 'abyssking') {
      // the last road: violet crystals, kneeling knights and shattered crowns
      for (let i = 0; i < 10; i++) { const p = spot(); P().crystals(w, p.x, p.y, p.z, rng, rng.range(0.9, 1.6)); }
      for (let i = 0; i < 6; i++) { const p = spot(); P().statue(w, p.x, p.z, p.y, p.side < 0 ? Math.PI / 2 : -Math.PI / 2, rng, 1.2); }
      for (const s of segs) if (s.z0 > zS && rng.chance(0.6)) { P().banner(w, cx - s.hwL, LOW + 7, (s.z0 + s.z1) / 2, 'px', 5, 0x2a0838); P().banner(w, cx + s.hwR, LOW + 7, (s.z0 + s.z1) / 2 + 2, 'nx', 5, 0x2a0838); }
      const gold = mat({ color: 0xc8a040, metalness: 1, roughness: 0.3 });
      for (let i = 0; i < 4; i++) { const p = spot(); deco((grp) => { const g = new THREE.Group(); g.position.set(p.x, p.y + 0.08, p.z); g.rotation.set(rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.5, 0.5)); mesh(g, PG.cyl8, gold, 0, 0, 0, 0.35, 0.12, 0.35); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(g, PG.cone, gold, Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3, 0.05, 0.25, 0.05); } grp.add(g); }); }
      for (let i = 0; i < 5; i++) { const p = spot(); w.addLight(p.x, p.y + 1.2, p.z, { flame: 0, intensity: 3, range: 7, color: '#a040ff', emit: false, prio: 0.6 }); }
    }
    // generic grim leftovers, everywhere
    for (let i = 0; i < 8; i++) { const p = spot(); P().bones(w, p.x, p.y, p.z, rng); }
    for (let i = 0; i < 5; i++) { const p = spot(); P().gravestone(w, p.x, p.z, p.y, rng.range(-0.5, 0.5), rng); }
  }

  // distant backdrop for outdoor stages (purely visual, far outside the playable bounds)
  function scenery(w, rng, W, D, OUT) {
    const cx = W / 2, cz = D / 2;
    w.deferred.push((grp) => {
      const PG = G.Props.PG;
      if (OUT === 'ruins') {
        const mtn = new THREE.MeshStandardMaterial({ color: w.mats.biome.mtnCol ?? 0x8a7890, emissive: w.mats.biome.night ? 0x05070d : 0x3a2a3a, roughness: 1, flatShading: true, fog: false });
        for (let i = 0; i < 26; i++) {
          const a = i / 26 * Math.PI * 2 + rng.range(-0.1, 0.1), r = rng.range(170, 230), h = rng.range(35, 90);
          const m = new THREE.Mesh(PG.cone, mtn); m.scale.set(rng.range(30, 60), h, rng.range(30, 60)); m.position.set(cx + Math.cos(a) * r, h / 2 - 8, cz + Math.sin(a) * r); grp.add(m);
        }
        // tree line beyond the city walls
        for (let i = 0; i < 70; i++) {
          const a = rng.range(0, Math.PI * 2), r = rng.range(Math.max(W, D) * 0.75, Math.max(W, D) * 1.3);
          tree(grp, w, cx + Math.cos(a) * r, -0.5, cz + Math.sin(a) * r, rng, rng.range(1.2, 2.2));
        }
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: w.mats.biome.night ? 0x1c2416 : 0x3e4a26, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.6, cz); grp.add(ground);
      } else {
        // sea of clouds far below + floating islets
        const ct = G.Tex.spr.cloud; ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
        const cc = w.mats.biome.cloudCol ?? 0xffffff;
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: ct, color: cc, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
        sea.material.map.repeat && sea.material.map.repeat.set(1, 1);
        sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -40, cz); grp.add(sea);
        const under = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: w.mats.biome.cloudCol ? 0x0a0614 : 0xe8f0ff, fog: false }));
        under.rotation.x = -Math.PI / 2; under.position.set(cx, -42, cz); grp.add(under);
        for (let i = 0; i < 60; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.cloud, color: cc, transparent: true, opacity: rng.range(0.5, 0.9), depthWrite: false, fog: false }));
          const a = rng.range(0, Math.PI * 2), r = rng.range(70, 320);
          sp.position.set(cx + Math.cos(a) * r, rng.range(-38, -10), cz + Math.sin(a) * r); sp.scale.setScalar(rng.range(40, 110)); grp.add(sp);
          w.animated.push({ kind: 'cloud', m: sp, sp: rng.range(0.5, 2) });
        }
        const rockM = w.mats.rock, grassM = new THREE.MeshStandardMaterial({ color: w.mats.biome.isletGrass ?? 0x8ab05a, roughness: 0.9, flatShading: true });
        for (let i = 0; i < 14; i++) {
          const a = rng.range(0, Math.PI * 2), r = rng.range(Math.max(W, D) * 0.8, 170), s = rng.range(5, 16);
          const g = new THREE.Group(); g.position.set(cx + Math.cos(a) * r, rng.range(-12, 25), cz + Math.sin(a) * r);
          const rk = new THREE.Mesh(PG.cone, rockM); rk.scale.set(s, s * 1.4, s); rk.rotation.x = Math.PI; rk.position.y = -s * 0.7; g.add(rk);
          const top = new THREE.Mesh(PG.cyl, grassM); top.scale.set(s, s * 0.12, s); g.add(top);
          if (rng.chance(0.6)) tree(g, w, 0, 0, 0, rng, s * 0.15);
          grp.add(g); w.animated.push({ kind: 'islet', m: g, y0: g.position.y, ph: rng.range(0, 6) });
        }
        // the play area itself is an island: hang rock below its rim
        const rim = new THREE.Mesh(PG.cone, rockM); rim.scale.set(Math.max(W, D) * 0.62, 34, Math.max(W, D) * 0.62); rim.rotation.x = Math.PI; rim.position.set(cx, -31, cz); grp.add(rim);
      }
    });
  }
  // stylised tree (trunk + clustered foliage)
  function tree(grp, w, x, y, z, rng, s) {
    s = s || 1;
    const PG = G.Props.PG;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const tr = new THREE.Mesh(PG.cyl8, w.mats.woodDark); tr.scale.set(0.28 * s, 4.2 * s, 0.28 * s); tr.position.y = 2.1 * s; g.add(tr);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(PG.ico, w.mats.leaf);
      const r = rng.range(1.2, 2.0) * s;
      f.scale.set(r, r * 0.85, r); f.position.set(rng.range(-1.3, 1.3) * s, (3.6 + rng.range(0, 2.2)) * s, rng.range(-1.3, 1.3) * s); f.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      g.add(f);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grp.add(g);
    return g;
  }
  LG.tree = tree;
  function gateFrame(w, x, z, side, y0) {
    if (y0) { const sv = w.solid.bind(w), vv = w.visual.bind(w); const sh = (f) => (m, a, b, c, d2, e, f2, o) => f(m, a, b + y0, c, d2, e + y0, f2, o); w.solid = sh(sv); w.visual = sh(vv); try { gateFrame(w, x, z, side, 0); } finally { w.solid = sv; w.visual = vv; } return; }
    const s = side === 'S' ? -1 : 1; // inward direction
    const zz = z, d = 1.3;
    const za = side === 'S' ? zz - d : zz, zb = side === 'S' ? zz : zz + d;
    w.solid('trim', x - 4.2, 0, za, x - 2.6, 7.2, zb, { uv: 2 });
    w.solid('trim', x + 2.6, 0, za, x + 4.2, 7.2, zb, { uv: 2 });
    w.solid('block', x - 4.4, 7.2, za - 0.1 * s, x + 4.4, 8.6, zb + 0.1 * s, { uv: 2 });
    w.solid('trim', x - 4.6, 8.6, za - 0.15, x + 4.6, 8.9, zb + 0.15, { uv: 1 });
    w.visual('trim', x - 0.5, 6.4, side === 'S' ? za - 0.1 : zb, x + 0.5, 7.6, side === 'S' ? za : zb + 0.1, { uv: 1 });
    // corbel steps inside the opening
    w.solid('block', x - 2.6, 6.0, za, x - 1.9, 7.2, zb, { uv: 2 }); w.solid('block', x + 1.9, 6.0, za, x + 2.6, 7.2, zb, { uv: 2 });
    G.Props.torch(w, x - 3.4, 4.2 + (w._gfY || 0), side === 'S' ? za : zb, side === 'S' ? 'nz' : 'pz');
    G.Props.torch(w, x + 3.4, 4.2 + (w._gfY || 0), side === 'S' ? za : zb, side === 'S' ? 'nz' : 'pz');
  }
  function portcullis(w, wd, h) {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.08, h, 0.08);
    const n = Math.floor(wd / 0.42);
    for (let i = 0; i <= n; i++) { const b = new THREE.Mesh(geo, w.mats.iron); b.position.set(-wd / 2 + i * (wd / n), h / 2, 0); b.castShadow = true; g.add(b); const tip = new THREE.Mesh(G.Props.PG.cone, w.mats.iron); tip.scale.set(0.07, 0.25, 0.07); tip.rotation.x = Math.PI; tip.position.set(b.position.x, -0.1, 0); g.add(tip); }
    const hg = new THREE.BoxGeometry(wd, 0.08, 0.1);
    for (let j = 1; j < h / 0.9; j++) { const b = new THREE.Mesh(hg, w.mats.iron); b.position.set(0, j * 0.9, 0); b.castShadow = true; g.add(b); }
    return g;
  }

  // floor slabs (top flagstone + deep rock) skipping pit cells
  function floors(w, W, D, pit, mk) {
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        if (pit && pit[z * W + x]) { x++; continue; }
        let x2 = x; while (x2 < W && !(pit && pit[z * W + x2])) x2++;
        // merge identical rows downward
        let z2 = z + 1;
        const rowSame = (zz) => { for (let k = x; k < x2; k++) if (pit && pit[zz * W + k]) return false; if (x > 0 && !(pit && pit[zz * W + x - 1])) return false; if (x2 < W && !(pit && pit[zz * W + x2])) return false; return true; };
        if (pit) { while (z2 < D && rowSame(z2) && !w._floorDone[z2]) z2++; }
        else z2 = D;
        let fresh = true;
        for (let zz = z; zz < z2; zz++) for (let k = x; k < x2; k++) if (w._fmask[zz * W + k]) fresh = false;
        if (fresh) {
          w.solid(mk, x, -0.4, z, x2, 0, z2, { uv: 4, grad: false });
          w.solid('rock', x, -14, z, x2, -0.4, z2, { uv: 5, grad: false });
          for (let zz = z; zz < z2; zz++) for (let k = x; k < x2; k++) w._fmask[zz * W + k] = 1;
        }
        x = x2;
      }
      if (!pit) break;
    }
  }

  // ---------------- area kinds ----------------
  function scatter(w, rng, occ, W, D, n) {
    const B = w.biome;
    for (let i = 0; i < n; i++) {
      const t = rng.next();
      if (t < 0.22) { const r = occ.place(rng, 3, 3, 1); if (!r) continue; const k = rng.int(1, 3); for (let j = 0; j < k; j++) P().crate(w, r.x0 + 0.8 + rng.range(0, 1.4), r.z0 + 0.8 + rng.range(0, 1.4), 0, rng); if (rng.chance(0.4)) P().barrel(w, r.x0 + 2.5, r.z0 + 0.6, 0, rng, rng.chance(0.25)); }
      else if (t < 0.36) { const r = occ.place(rng, 2, 2, 1); if (!r) continue; P().barrel(w, r.x0 + 0.7, r.z0 + 0.7, 0, rng, rng.chance(0.35)); if (rng.chance(0.6)) P().barrel(w, r.x0 + 1.5, r.z0 + 1.3, 0, rng); }
      else if (t < 0.5) { const r = occ.place(rng, 2, 2, 1); if (!r) continue; for (let k = 0; k < rng.int(1, 3); k++) P().urn(w, r.x0 + 0.5 + rng.range(0, 1), r.z0 + 0.5 + rng.range(0, 1), 0, rng); }
      else if (t < 0.66) { const ax = rng.chance(0.5); const len = rng.int(3, 6); const r = occ.place(rng, ax ? len : 1, ax ? 1 : len, 1); if (!r) continue; lowWall(w, rng, ax ? r.x0 : r.x0 + 0.5, ax ? r.z0 + 0.5 : r.z0, len, ax); }
      else if (t < 0.74) { const r = occ.place(rng, 2, 2, 1); if (!r) continue; P().brazier(w, r.x0 + 1, 0, r.z0 + 1, 1); }
      else if (t < 0.82) { const r = occ.place(rng, 2, 2, 0); if (!r) continue; P().rubble(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(0.8, 1.6)); }
      else if (t < 0.88) { const ax = rng.chance(0.5); const r = occ.place(rng, ax ? 3 : 1, ax ? 1 : 3, 1); if (!r) continue; P().barricade(w, r.x0 + (ax ? 1.5 : 0.5), r.z0 + (ax ? 0.5 : 1.5), 0, ax, rng); }
      else if (t < 0.93) { const r = occ.place(rng, 2, 2, 1); if (!r) continue; if (B === 'frozen') P().crystals(w, r.x0 + 1, 0, r.z0 + 1, rng, 1.2); else P().gravestone(w, r.x0 + 1, r.z0 + 1, 0, rng.range(-0.3, 0.3), rng); }
      else { const r = occ.place(rng, 3, 3, 1); if (!r) continue; P().spikeTrap(w, r.x0 + 1.5, r.z0 + 1.5, 0, 2.4); }
    }
    // floor decor (no collision)
    for (let i = 0; i < 18; i++) {
      const x = rng.range(3, W - 3), z = rng.range(3, D - 3);
      const k = rng.next();
      if (k < 0.4) P().bones(w, x, 0, z, rng);
      else if (k < 0.6) P().drain(w, Math.floor(x) + 0.5, Math.floor(z) + 0.5, 0);
      else if (k < 0.8 && B === 'temple') P().rug(w, x, z, 0, rng.range(2, 4), rng.range(1.5, 3), [0.35, 0.15, 0.08]);
      else if (k < 0.8) P().skull(w, x, 0, z, rng.range(0, 6));
    }
  }

  function structures(w, rng, occ, W, D, count) {
    const B = w.biome;
    for (let i = 0; i < count; i++) {
      const t = rng.next();
      if (t < 0.24) {
        const h = rng.pick([2, 2.5, 3, 3.5]); const L = LG.stairsLen(h);
        const side = rng.pick(['N', 'S', 'E', 'W']);
        const pw = rng.int(5, 8), pd = rng.int(5, 8);
        const fw = pw + (side === 'E' || side === 'W' ? Math.ceil(L) : 0), fd = pd + (side === 'N' || side === 'S' ? Math.ceil(L) : 0);
        const r = occ.place(rng, fw, fd, 2); if (!r) continue;
        const top = platform(w, rng, r, h, [side]);
        w.platTops.push(top);
      } else if (t < 0.44) {
        const r = occ.place(rng, rng.int(7, 10), rng.int(6, 9), 2); if (!r) continue;
        house(w, rng, r);
      } else if (t < 0.58) {
        const ax = rng.chance(0.5); const len = rng.int(10, 18);
        const r = occ.place(rng, ax ? len + 2 : 3, ax ? 3 : len + 2, 2); if (!r) continue;
        colonnade(w, rng, ax ? r.x0 + 1 : r.x0 + 1.5, ax ? r.z0 + 1.5 : r.z0 + 1, len, ax, rng.range(5.5, 7.5), rng.chance(0.5));
      } else if (t < 0.68) {
        const r = occ.place(rng, 5, 5, 2); if (!r) continue;
        P().statue(w, r.x0 + 2.5, r.z0 + 2.5, 0, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), rng, rng.range(1, 1.3));
        P().brazier(w, r.x0 + 0.5, 0, r.z0 + 0.5, 0.8); P().brazier(w, r.x1 - 0.5, 0, r.z1 - 0.5, 0.8);
      } else if (t < 0.78) {
        const r = occ.place(rng, 8, 7, 2); if (!r) continue;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) P().sarcophagus(w, r.x0 + 2 + a * 4, r.z0 + 2 + b * 3, 0, true, rng);
      } else if (t < 0.86) {
        const r = occ.place(rng, 5, 5, 2); if (!r) continue;
        P().well(w, r.x0 + 2.5, r.z0 + 2.5, 0);
      } else if (t < 0.94) {
        // wooden scaffold platform with stairs
        const h = 3; const L = LG.stairsLen(h);
        const r = occ.place(rng, 6, 5 + Math.ceil(L), 2); if (!r) continue;
        const x0 = r.x0, x1 = r.x1, z0 = r.z0 + Math.ceil(L), z1 = r.z1;
        w.solid('wood', x0, h - 0.2, z0, x1, h, z1, { uv: 2 });
        for (const px of [x0, x1 - 0.3]) for (const pz of [z0, z1 - 0.3]) w.solid('woodDark', px, 0, pz, px + 0.3, h - 0.2, pz + 0.3, { uv: 1 });
        w.solid('woodDark', (x0 + x1) / 2 - 0.15, 0, (z0 + z1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, h - 0.2, (z0 + z1) / 2 + 0.15, { uv: 1 });
        stairs(w, 'N', z0, (x0 + x1) / 2, 2.2, 0, h, 'wood');
        // railings
        for (const [a, b, c, d] of [[x0, z1 - 0.1, x1, z1], [x0, z0, x0 + 0.1, z1], [x1 - 0.1, z0, x1, z1]]) w.solid('woodDark', a, h, b, c, h + 1.0, d, { uv: 1 });
        P().crate(w, x1 - 0.8, z1 - 0.8, h, rng);
        w.platTops.push({ x0: x0 + 0.5, z0: z0 + 0.5, x1: x1 - 0.5, z1: z1 - 0.5, y: h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
      } else {
        const r = occ.place(rng, 4, 4, 2); if (!r) continue;
        P().cage(w, r.x0 + 2, r.z0 + 2, 0, 1.6, rng);
        if (B === 'catacombs') P().web(w, r.x0 + 2, 2.6, r.z0 + 2, rng.range(0, 3), 1.6);
      }
    }
  }

  function biomeExtras(w, rng, occ, W, D) {
    const B = w.biome;
    if (B === 'flooded') {
      for (let i = 0; i < 4; i++) {
        const pw = rng.int(5, 10), pd = rng.int(5, 10);
        const x = rng.range(4, W - pw - 4), z = rng.range(8, D - pd - 8);
        w.visual('water', x, 0.0, z, x + pw, 0.035, z + pd, { uv: 3, grad: false, skip: { bottom: true } });
        w.waterZones.push({ x0: x, z0: z, x1: x + pw, z1: z + pd });
      }
    }
    if (B === 'forge') {
      for (let i = 0; i < 3; i++) {
        const ax = rng.chance(0.5); const len = rng.int(8, 16);
        const r = occ.place(rng, ax ? len : 2, ax ? 2 : len, 1); if (!r) continue;
        w.visual('lava', r.x0, 0.0, r.z0, r.x1, 0.03, r.z1, { uv: 4, grad: false, skip: { bottom: true } });
        w.lavaZones.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
        w.addLight((r.x0 + r.x1) / 2, 0.6, (r.z0 + r.z1) / 2, { flame: 0, intensity: 14, range: 12, color: '#ff6a20', prio: 1.1, emit: false });
        // iron rims
        if (ax) { w.visual('iron', r.x0, 0, r.z0 - 0.1, r.x1, 0.06, r.z0, { uv: 1 }); w.visual('iron', r.x0, 0, r.z1, r.x1, 0.06, r.z1 + 0.1, { uv: 1 }); }
      }
    }
    if (B === 'temple') {
      for (let i = 0; i < 10; i++) {
        const side = rng.pick(['px', 'nx', 'pz', 'nz']);
        const t = rng.range(6, (side[1] === 'x' ? D : W) - 6);
        if (side === 'px') P().vines(w, 0.02, rng.range(9, 12), t, 'px', rng.range(3, 6), rng);
        if (side === 'nx') P().vines(w, W - 0.02, rng.range(9, 12), t, 'nx', rng.range(3, 6), rng);
        if (side === 'pz') P().vines(w, t, rng.range(9, 12), 0.02, 'pz', rng.range(3, 6), rng);
        if (side === 'nz') P().vines(w, t, rng.range(9, 12), D - 0.02, 'nz', rng.range(3, 6), rng);
      }
    }
    if (B === 'frozen') {
      for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 1); if (r) P().crystals(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(0.8, 1.6)); }
    }
    if (B === 'ruins' || B === 'bloodmoon') {
      if (B === 'bloodmoon') for (let i = 0; i < 8; i++) { const r = occ.place(rng, 2, 2, 1); if (r) P().gravestone(w, r.x0 + 1, r.z0 + 1, 0, rng.range(-0.4, 0.4), rng); }
      for (let i = 0; i < 10; i++) {
        const r = occ.place(rng, 2, 2, 1); if (!r) continue;
        const x = r.x0 + 1, z = r.z0 + 1, s = rng.range(0.8, 1.25);
        w.addCollider(x - 0.28 * s, 0, z - 0.28 * s, x + 0.28 * s, 4 * s, z + 0.28 * s, { surf: 'wood' });
        w.deferred.push((grp) => tree(grp, w, x, 0, z, rng, s));
      }
      // grass tufts & wildflowers (decor only)
      for (let i = 0; i < 70; i++) {
        const x = rng.range(3, W - 3), z = rng.range(3, D - 3);
        for (let k = 0; k < 2; k++) w.batch.geo('vine', G.Props.PG.plane, G.Props.M(x, 0.25, z, 0.6, 0.5, 1, 0, k * Math.PI / 2 + rng.range(0, 1), 0), { su: 0.6, sv: 0.5 });
      }
    }
    if (B === 'sky' || B === 'void') {
      for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 1); if (r) P().crystals(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(1.2, 2.2)); }
      for (let i = 0; i < 3; i++) { const r = occ.place(rng, 5, 5, 2); if (r) P().statue(w, r.x0 + 2.5, r.z0 + 2.5, 0, rng.pick([0, Math.PI / 2, Math.PI]), rng, 1.1); }
    }
    if (B === 'abyss') {
      const vio = 0xb060ff;
      // glowing rifts in the floor
      for (let i = 0; i < 5; i++) {
        const r = occ.place(rng, 6, 2, 1); if (!r) continue;
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, ang = rng.range(0, Math.PI), len = rng.range(4, 7);
        w.deferred.push((grp) => {
          const g = new THREE.Group(); g.position.set(cx, 0.03, cz); g.rotation.y = ang;
          const core = new THREE.MeshBasicMaterial({ color: 0xe0b0ff }), haze = new THREE.MeshBasicMaterial({ color: vio, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
          for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(G.Props.PG.box, core); seg.scale.set(len / 4 * 1.05, 0.02, rng.range(0.06, 0.14)); seg.position.set(-len / 2 + (k + 0.5) * len / 4, 0, rng.range(-0.15, 0.15)); seg.rotation.y = rng.range(-0.35, 0.35); g.add(seg); const h = seg.clone(); h.material = haze; h.scale.z *= 4; h.scale.y = 0.01; g.add(h); }
          grp.add(g);
        });
        w.addLight(cx, 0.5, cz, { flame: 0, intensity: 6, range: 8, color: '#b060ff', emit: false, prio: 0.9 });
      }
      // violet crystal shards
      for (let i = 0; i < 7; i++) {
        const r = occ.place(rng, 2, 2, 1); if (!r) continue;
        const x = r.x0 + 1, z = r.z0 + 1, s = rng.range(0.8, 1.6);
        w.addCollider(x - 0.4 * s, 0, z - 0.4 * s, x + 0.4 * s, 1.6 * s, z + 0.4 * s, { surf: 'stone' });
        w.deferred.push((grp) => {
          const m = new THREE.MeshStandardMaterial({ color: 0x2a1040, emissive: vio, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.3 });
          for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(G.Props.PG.oct, m); const h = s * rng.range(0.6, 1.4); c.scale.set(0.18 * s, h, 0.18 * s); c.position.set(x + rng.range(-0.3, 0.3) * s, h * 0.5, z + rng.range(-0.3, 0.3) * s); c.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4)); grp.add(c); }
        });
      }
      // floating rune circles
      for (let i = 0; i < 4; i++) {
        const x = rng.range(8, W - 8), z = rng.range(8, D - 8), y = rng.range(4.5, 7);
        w.deferred.push((grp) => {
          const m = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 6), new THREE.MeshBasicMaterial({ color: vio, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); grp.add(m);
          const m2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32), m.material); m2.rotation.x = -Math.PI / 2; m2.position.set(x, y, z); grp.add(m2);
          const ph = rng.range(0, 6); w.animated.push({ kind: 'islet', m, y0: y, ph }); w.animated.push({ kind: 'islet', m: m2, y0: y, ph });
        });
      }
      // hanging chains, kneeling knights, royal banners
      for (let i = 0; i < 10; i++) { const len = rng.range(2.5, 6); P().chain(w, rng.range(4, W - 4), 10 - len, rng.range(4, D - 4), len); }
      for (let i = 0; i < 3; i++) { const r = occ.place(rng, 4, 4, 2); if (r) P().statue(w, r.x0 + 2, r.z0 + 2, 0, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), rng, 1.2); }
      for (let i = 0; i < 4; i++) { const side = rng.chance(0.5); P().banner(w, side ? 0 : W, 8, rng.range(8, D - 8), side ? 'px' : 'nx', 5, 0x3a0a4a); }
    }
    if (B === 'catacombs') {
      for (let i = 0; i < 6; i++) P().web(w, rng.chance(0.5) ? 0.8 : W - 0.8, rng.range(3, 8), rng.range(4, D - 4), Math.PI / 2, rng.range(1.5, 3));
    }
  }

  function lightShafts(w, rng, W, D, n) {
    if (w.mats.biome.outdoor) return;
    w.deferred.push((grp) => {
      for (let i = 0; i < n; i++) {
        const h = 28;
        const geo = new THREE.CylinderGeometry(rng.range(1.2, 2.5), rng.range(3, 5), h, 16, 1, true);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: G.Tex.spr.lightshaft, color: w.mats.biome.moon, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        m.position.set(rng.range(10, W - 10), h / 2 - 1, rng.range(10, D - 10));
        m.rotation.z = rng.range(-0.18, 0.18); m.rotation.x = rng.range(-0.15, 0.15);
        m.renderOrder = 8;
        grp.add(m);
      }
    });
  }

  // a chest needs a free box above its footprint and some distance from other chests (no stacking, no clipping into props)
  function chestSpotFree(w, x, y, z) {
    if (!w.boxFree(x - 0.85, y + 0.05, z - 0.85, x + 0.85, y + 1.3, z + 0.85)) return false;
    if (w.groundAt && w.groundAt(new THREE.Vector3(x, y + 0.4, z), 0.2, 0.6) === -Infinity) return false;
    return !w.interactables.some((i) => i.type === 'chest' && Math.hypot(i.pos.x - x, i.pos.z - z) < 2.4 && Math.abs(i.pos.y - 0.5 - y) < 2.5);
  }
  LG.chestSpotFree = chestSpotFree;
  function placeChests(w, rng, occ, n, area) {
    const tops = w.platTops.slice();
    for (let i = 0; i < n; i++) {
      const tier = rng.chance(0.08 + area * 0.004) ? 2 : rng.chance(0.3) ? 1 : 0;
      let done = false;
      // on a platform (each platform holds at most one chest)
      if (tops.length && rng.chance(0.55)) {
        for (let k = 0; k < 6 && !done && tops.length; k++) {
          const ti = rng.int(0, tops.length - 1), t = tops[ti];
          const x = rng.range(Math.min(t.x0 + 0.9, t.cx), Math.max(t.x1 - 0.9, t.cx)), z = rng.range(Math.min(t.z0 + 0.9, t.cz), Math.max(t.z1 - 0.9, t.cz));
          if (chestSpotFree(w, x, t.y, z)) { P().chest(w, x, z, t.y, rng.range(0, 6), tier); tops.splice(ti, 1); done = true; }
        }
      }
      // on the floor
      for (let k = 0; k < 10 && !done; k++) {
        const r = occ.place(rng, 2, 2, 1); if (!r) break;
        const x = r.x0 + 1, z = r.z0 + 1;
        if (chestSpotFree(w, x, 0, z)) { P().chest(w, x, z, 0, rng.range(0, 6), tier); done = true; }
      }
    }
  }

  function makeNormal(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const biome = G.Tex.biomeFor(area);
    const size = Math.min(92, 60 + Math.floor(area / 3) * 2 + rng.int(0, 3) * 4);
    const W = size, D = size + rng.int(-2, 3) * 4;
    const w = new G.World(W, D, biome);
    w._fmask = new Uint8Array(W * D); w._floorDone = {};
    w.platTops = [];
    const occ = Occ(W, D);
    // reserve spawn & exit & wall margins
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2);
    for (const gx of LG.gateXs(W, gates || 1)) occ.mark(gx - 6, 0, gx + 6, 9, 2);
    occ.mark(W / 2 - 13, 8, W / 2 + 13, 16, 2); // space for the post-clear mini shop
    occ.mark(0, 0, W, 2, 2); occ.mark(0, D - 2, W, D, 2); occ.mark(0, 0, 2, D, 2); occ.mark(W - 2, 0, W, D, 2);
    const layout = rng.pick(['courtyard', 'halls', 'chasm', 'terrace', 'crypt', 'courtyard', 'halls']);
    w.layout = layout;
    let pit = null;
    if (layout === 'chasm') {
      pit = new Uint8Array(W * D);
      const z0 = Math.floor(D * 0.42), z1 = Math.floor(D * 0.58);
      for (let z = z0; z < z1; z++) for (let x = 3; x < W - 3; x++) pit[z * W + x] = 1;
      occ.mark(0, z0 - 1, W, z1 + 1, 1);
      // bridges
      const nb = rng.int(2, 3);
      w._bridges = [];
      for (let i = 0; i < nb; i++) {
        const bx = Math.floor(W * (i + 1) / (nb + 1) + rng.range(-4, 4));
        w._bridges.push([bx - 1.6, bx + 1.6, z0, z1]);
      }
      w._pit = { z0, z1 };
    }
    const fmk = rng.chance(0.4) ? 'cobble' : 'floor';
    floors(w, W, D, pit, fmk);
    perimeter(w, rng, W, D, { gates });
    if (layout === 'chasm') {
      const { z0, z1 } = w._pit;
      for (const [a, b] of w._bridges) {
        w.solid('block', a, -0.6, z0 - 0.01, b, 0, z1 + 0.01, { uv: 2 });
        // railings with posts
        w.solid('trim', a, 0, z0, a + 0.3, 0.9, z1, { uv: 1 }); w.solid('trim', b - 0.3, 0, z0, b, 0.9, z1, { uv: 1 });
        // arch supports down into the abyss
        w.solid('block', a + 0.2, -12, (z0 + z1) / 2 - 0.6, b - 0.2, -0.6, (z0 + z1) / 2 + 0.6, { uv: 3 });
        P().torch(w, a, 1.6, z0 + 0.5, 'px');
      }
      // pit edge lips
      w.solid('trim', 3, 0, z0 - 0.3, W - 3, 0.25, z0, { uv: 1, tag: 'lip' });
      w.solid('trim', 3, 0, z1, W - 3, 0.25, z1 + 0.3, { uv: 1, tag: 'lip' });
      // pit bottom
      const pz0 = z0, pz1 = z1;
      if (biome === 'forge') { w.visual('lava', 3, -8.2, pz0, W - 3, -8, pz1, { uv: 4, grad: false }); for (let x = 8; x < W - 6; x += 14) w.addLight(x, -6, (pz0 + pz1) / 2, { flame: 0, intensity: 22, range: 16, color: '#ff5a1a', emit: false, prio: 0.8 }); }
      else if (biome === 'sky' || biome === 'void') w.visual('cloud', 3, -12, pz0, W - 3, -11.9, pz1, { uv: 20, grad: false });
      else if (biome === 'abyss') { w.visual('dark', 3, -14, pz0, W - 3, -13.9, pz1, { uv: 4, grad: false }); for (let x = 8; x < W - 6; x += 14) w.addLight(x, -9, (pz0 + pz1) / 2, { flame: 0, intensity: 16, range: 14, color: '#9040ff', emit: false, prio: 0.8 }); }
      else w.visual('dark', 3, -14, pz0, W - 3, -13.9, pz1, { uv: 4, grad: false });
      w.abyss = { z0: pz0, z1: pz1 };
      // island
      if (rng.chance(0.5)) {
        const ix = W / 2 + rng.range(-6, 6);
        w.solid('wall', ix - 3, -12, pz0 + 2, ix + 3, 2.5, pz1 - 2, { uv: 3 });
        w.solid('trim', ix - 3.06, 2.25, pz0 + 1.94, ix + 3.06, 2.5, pz1 - 1.94, { uv: 2 });
        P().brazier(w, ix, 2.5, (pz0 + pz1) / 2, 1);
        w.platTops.push({ x0: ix - 2.5, z0: pz0 + 2.5, x1: ix + 2.5, z1: pz1 - 2.5, y: 2.5, cx: ix + 1.5, cz: (pz0 + pz1) / 2 });
      }
    }
    if (layout === 'courtyard') {
      const s = rng.int(12, 16);
      const h = rng.pick([1.5, 2, 2.5]);
      const L = Math.ceil(LG.stairsLen(h));
      const cx = Math.floor(W / 2 - s / 2 - L), cz = Math.floor(D / 2 - s / 2 - L);
      const R = { x0: cx, z0: cz, x1: cx + s + 2 * L, z1: cz + s + 2 * L };
      if (occ.free(R.x0, R.z0, R.x1, R.z1)) {
        occ.mark(R.x0, R.z0, R.x1, R.z1);
        const top = platform(w, rng, R, h, ['N', 'S', 'E', 'W'], { decor: false });
        w.platTops.push(top);
        if (rng.chance(0.5)) P().statue(w, top.cx, top.cz, h, 0, rng, 1.2); else P().well(w, top.cx, top.cz, h);
        P().brazier(w, top.x0 + 0.6, h, top.z0 + 0.6, 1); P().brazier(w, top.x1 - 0.6, h, top.z1 - 0.6, 1);
        P().brazier(w, top.x1 - 0.6, h, top.z0 + 0.6, 1); P().brazier(w, top.x0 + 0.6, h, top.z1 - 0.6, 1);
        // surrounding colonnades on two sides
        const off = 3.5;
        if (R.z0 - off > 10) { occ.mark(R.x0, R.z0 - off - 1, R.x1, R.z0 - off + 1); colonnade(w, rng, R.x0 + 1, R.z0 - off, R.x1 - R.x0 - 2, true, 7, true); }
        if (R.z1 + off < D - 10) { occ.mark(R.x0, R.z1 + off - 1, R.x1, R.z1 + off + 1); colonnade(w, rng, R.x0 + 1, R.z1 + off, R.x1 - R.x0 - 2, true, 7, true); }
      }
    }
    if (layout === 'halls') {
      const n = W > 72 ? 2 : rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const z = Math.round(D * (i + 1) / (n + 1));
        occ.mark(0, z - 2, W, z + 2);
        const ops = archWall(w, rng, z, W, rng.int(2, 3));
        for (const [a, b] of ops) occ.mark(a - 1, z - 4, b + 1, z + 4, 2);
      }
    }
    if (layout === 'terrace') {
      const side = rng.chance(0.5) ? 'W' : 'E';
      const depth = rng.int(8, 11), h = 3;
      const L = Math.ceil(LG.stairsLen(h));
      const x0 = side === 'W' ? 0 : W - depth, x1 = side === 'W' ? depth : W;
      const z0 = 12, z1 = D - 12;
      occ.mark(x0, z0, side === 'W' ? x1 + L + 1 : x1, z1); if (side === 'E') occ.mark(x0 - L - 1, z0, x1, z1);
      w.solid('wall', x0, 0, z0, x1, h - 0.25, z1, { uv: 3 });
      w.solid('trim', x0 + (side === 'W' ? 0 : -0.06), h - 0.25, z0 - 0.06, x1 + (side === 'W' ? 0.06 : 0), h, z1 + 0.06, { uv: 2 });
      const edgeX = side === 'W' ? x1 : x0;
      const sts = [z0 + (z1 - z0) * 0.25, z0 + (z1 - z0) * 0.75];
      const gaps = [];
      for (const sz of sts) { stairs(w, side === 'W' ? 'E' : 'W', edgeX, sz, 2.8, 0, h, 'trim'); gaps.push({ side: side === 'W' ? 'E' : 'W', a: sz - 1.5, b: sz + 1.5 }); }
      parapet(w, x0, z0, x1, z1, h, gaps.concat([{ side: side === 'W' ? 'W' : 'E', a: -1, b: 999 }]));
      colonnade(w, rng, side === 'W' ? x0 + 2.2 : x1 - 2.2, z0 + 3, z1 - z0 - 6, false, 6, true);
      w.platTops.push({ x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, y: h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
      for (let z = z0 + 4; z < z1 - 3; z += 7) P().brazier(w, (x0 + x1) / 2, h, z, 0.9);
    }
    if (layout === 'crypt') {
      for (let k = 0; k < 3; k++) {
        const r = occ.place(rng, 10, 9, 2); if (!r) continue;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) P().sarcophagus(w, r.x0 + 2.5 + a * 5, r.z0 + 2.2 + b * 4.5, 0, true, rng);
        P().pillarSquare(w, r.x0 + 5, r.z0 + 4.5, 0, 6, 0.8);
      }
    }
    structures(w, rng, occ, W, D, 5 + Math.floor(W * D / 900) + rng.int(0, 3));
    biomeExtras(w, rng, occ, W, D);
    if (G.Fields) G.Fields.place(w, rng, occ, W, D, area);
    scatter(w, rng, occ, W, D, 14 + Math.floor(W * D / 450));
    placeChests(w, rng, occ, (kind === 'vault' ? 6 : (area <= 4 ? 2 : rng.chance(0.75) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0)) + (extraChests || 0), area);
    w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 12, face: 1 })); w.miniHeal = new THREE.Vector3(W / 2 + 6, 0, 12);
    lightShafts(w, rng, W, D, rng.int(2, 4));
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return w;
  }

  function validate(w) {
    w.buildNav();
    const si = w.navIdx(w.spawn.x, w.spawn.z);
    if (si < 0 || w.nb[si]) return false;
    if (Math.abs(w.nf[si] - w.spawn.y) > 0.05) return false;
    const a = w.reach(si);
    for (const ex of w.exits || [{ x: w.W / 2 }]) {
      const ei = w.navIdx(ex.x, 3.5);
      if (ei < 0 || w.nb[ei] || !a[ei]) return false;
      if (!w.reach(ei)[si]) return false;
    }
    // most of the open floor must be reachable (no sealed pockets enemies spawn into)
    let open = 0, ok = 0;
    for (let i = 0; i < a.length; i++) if (!w.nb[i] && w.nf[i] > -1 && w.nf[i] < 0.2) { open++; if (a[i]) ok++; }
    if (ok < open * 0.8) return false;
    // spawn box must be free of colliders
    if (!w.boxFree(w.spawn.x - 0.6, w.spawn.y + 0.05, w.spawn.z - 0.6, w.spawn.x + 0.6, w.spawn.y + 1.9, w.spawn.z + 0.6)) return false;
    w.reachMask = a;
    return true;
  }

  LG.generate = function (area, seed, opts) {
    opts = opts || {};
    for (let t = 0; t < 8; t++) {
      const w = makeNormal(area, (seed + t * 7919) >>> 0, opts.extraChests, opts.gates || 3, opts.kind);
      if (validate(w)) { w.seed = seed; fireTops(w, {}); return w; }
    }
    const w = makeSimple(area, seed, opts.gates || 3);
    validate(w);
    return w;
  };
  function makeSimple(area, seed, gates) {
    const rng = new G.RNG(seed ^ 0xabc);
    const W = 64, D = 64;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    floors(w, W, D, null, 'floor');
    perimeter(w, rng, W, D, { gates });
    const occ = Occ(W, D);
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2); occ.mark(0, 0, W, 16, 2);
    scatter(w, rng, occ, W, D, 16);
    w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 12, face: 1 })); w.miniHeal = new THREE.Vector3(W / 2 + 6, 0, 12);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return w;
  }

  // ---------------- shop hall ----------------
  LG.shop = function (area, seed, gates) {
    const rng = new G.RNG(seed);
    const W = 40, D = 66;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    floors(w, W, D, null, 'floor');
    perimeter(w, rng, W, D, { h: 10, top: 16, beams: 0, gates });
    // ceiling beams + chandeliers make it a hall
    for (let z = 6; z < D - 4; z += 7) { w.solid('woodDark', 0, 9.2, z - 0.35, W, 9.9, z + 0.35, { uv: 2 }); }
    for (let z = 9.5; z < D - 6; z += 14) P().chandelier(w, W / 2, 6.0, z, 9.2);
    // red carpet aisle
    P().rug(w, W / 2, D / 2 + 2, 0, 4, D - 10, [0.45, 0.08, 0.06]);
    // market booths: six stalls (three on each side of the aisle), one per kind of ware, three shelves each. Every booth has a counter,
    // a backdrop, corner posts and a striped awning in its own colour; the aisle between them stays open.
    w.shopSlots = [];
    const rows = [W / 2 - 10, W / 2 + 10];
    const ZONES = [
      ['⚔ 武器', [0.62, 0.1, 0.08], [0.85, 0.45, 0.4], '#ffb0a0', 3], ['✨ スキル', [0.12, 0.25, 0.65], [0.5, 0.65, 0.95], '#a8c8ff', 5], ['🔩 強化・パーツ', [0.38, 0.4, 0.44], [0.75, 0.78, 0.82], '#e0e4ea', 5],
      ['🧪 消耗品', [0.1, 0.5, 0.18], [0.5, 0.85, 0.55], '#a0f0b0', 5], ['🛡 防具', [0.6, 0.4, 0.1], [0.92, 0.75, 0.4], '#ffd890', 5], ['🔮 加護', [0.42, 0.12, 0.6], [0.75, 0.55, 0.9], '#e0b8ff', 5],
    ];
    const cursor = [7.5, 7.5];
    ZONES.forEach(([name, col, light, txt, cnt], zi) => {
      const left = zi < 3, j = zi % 3, rx = left ? rows[0] : rows[1], s = left ? -1 : 1; // s: direction towards the outer wall
      const fx = left ? rx - 0.6 : rx + 0.6;
      const SP = 2.8, L = cnt * SP + 2.2, ci = left ? 0 : 1;
      const z0 = cursor[ci], z1 = z0 + L, zc = (z0 + z1) / 2; cursor[ci] = z1 + 2.2;
      // counter with a coloured skirt, a stone top and the three display spots
      w.solid('woodDark', fx - 0.6, 0, z0 + 0.3, fx + 0.6, 1.05, z1 - 0.3, { uv: 1.5 });
      w.visual('cloth2', fx - s * 0.62, 0.15, z0 + 0.45, fx - s * 0.58, 0.95, z1 - 0.45, { uv: 1, tint: col, grad: false });
      w.solid('trim', fx - 0.7, 1.05, z0 + 0.2, fx + 0.7, 1.15, z1 - 0.2, { uv: 1 });
      for (let k = 0; k < cnt; k++) w.shopSlots.push({ x: fx, y: 1.15, z: z0 + 2.5 + k * SP, face: left ? 1 : -1 });
      // backdrop (a low wall in the booth's colour) and corner posts
      const bx = fx + s * 1.8;
      w.solid('wall', bx - 0.08, 0, z0, bx + 0.08, 3.2, z1, { uv: 2 });
      w.visual('cloth2', bx - s * 0.1 - 0.03, 0.4, z0 + 0.3, bx - s * 0.1 + 0.03, 3.0, z1 - 0.3, { uv: 1, tint: col, grad: false });
      for (const pz of [z0 + 0.1, z1 - 0.1]) for (const px of [bx, fx - s * 1.3]) w.solid('woodDark', px - 0.1, 0, pz - 0.1, px + 0.1, 3.5, pz + 0.1, { uv: 1 });
      // striped awning
      const ax0 = Math.min(bx + s * 0.2, fx - s * 1.5), ax1 = Math.max(bx + s * 0.2, fx - s * 1.5), n = Math.round(L / 0.8);
      for (let q = 0; q < n; q++) {
        const za = z0 - 0.15 + (z1 - z0 + 0.3) * q / n, zb = z0 - 0.15 + (z1 - z0 + 0.3) * (q + 1) / n, c = q % 2 ? col : light;
        w.visual('cloth2', ax0, 3.5, za, ax1, 3.62, zb, { uv: 1, tint: c, grad: false });
        w.visual('cloth2', fx - s * 1.5 - 0.03, 3.1, za, fx - s * 1.5 + 0.03, 3.5, zb, { uv: 1, tint: c, grad: false }); // front valance
      }
      // a glowing trim along the awning edge and a coloured light, so each booth reads from far down the hall
      w.visual('glow', fx - s * 1.5 - 0.05, 3.02, z0 - 0.15, fx - s * 1.5 + 0.05, 3.1, z1 + 0.15, { uv: 1, tint: light, grad: false });
      w.addLight(fx - s * 0.6, 2.7, zc, { flame: 0, emit: false, intensity: 7, range: 9, color: txt, prio: 0.9, steady: true });
      P().rug(w, rx, zc, 0.02, 3.6, L - 0.6, col);
      P().label(w, name, fx - s * 1.5, 4.3, zc, left ? Math.PI / 2 : -Math.PI / 2, 4.2, { color: txt });
      P().candles(w, fx, 1.15, z0 + 0.8, rng, true);
    });
    // stalls / side décor
    P().bookshelf(w, 1.0, 12, 0, false, rng); P().bookshelf(w, W - 1.0, 12, 0, false, rng);
    P().weaponRack(w, 1.0, 22, 0, false); P().weaponRack(w, W - 1.0, 22, 0, false);
    for (let i = 0; i < 3; i++) { P().barrel(w, 1.2, 26 + i * 1.0, 0, rng); P().crate(w, W - 1.4, 26 + i * 1.2, 0, rng); }
    // a little way in from the entrance, straight ahead: the pawn counter with the re-stock altar next to it (the healing fountain is by the door, on the right)
    const mz = D - 3.2;
    w.merchantPos = new THREE.Vector3(1.2, 0, mz);
    const pz = D - 15, pcx = W / 2;
    w.solid('woodDark', pcx - 1.7, 0, pz - 0.7, pcx + 1.7, 1.1, pz + 0.7, { uv: 1.5 });
    w.solid('wood', pcx - 1.8, 1.1, pz - 0.8, pcx + 1.8, 1.2, pz + 0.8, { uv: 1.5 });
    // made to stand out: a gold rug, a warm light and a big gold label
    P().rug(w, pcx, pz + 1.4, 0.02, 7.6, 5.2, [0.75, 0.55, 0.12]);
    w.addLight(pcx, 3.2, pz + 0.5, { flame: 0, emit: false, intensity: 10, range: 11, color: '#ffd070', prio: 1.2, steady: true });
    P().label(w, '💰 買取屋', pcx, 3.6, pz - 0.2, 0, 5, { color: '#ffe08a', size: 96 });
    P().crate(w, pcx - 2.6, pz - 1.4, 0, rng); P().urn && P().urn(w, pcx + 2.4, pz - 1.4, 0, rng);
    w.sellPos = new THREE.Vector3(pcx, 1.2, pz + 1.3);
    w.pawnNpc = { x: pcx, z: pz - 1.2, ry: 0 };
    // re-stock altar beside the pawn counter
    const rcx = W / 2 + 5.6;
    w.rerollPos = new THREE.Vector3(rcx, 0, pz);
    w.solid('trim', rcx - 1, 0, pz - 1, rcx + 1, 0.3, pz + 1, { uv: 1 });
    w.solid('block', rcx - 0.6, 0.3, pz - 0.6, rcx + 0.6, 1.0, pz + 0.6, { uv: 1 });
    P().candles(w, rcx + 0.3, 1.0, pz, rng, true);
    P().label(w, '🔄 品揃えの入れ替え', rcx, 2.6, pz, 0, 3.6, { color: '#ffd8a0', size: 78 });
    // healing fountain
    const fxp = W / 2 + 9;
    w.fountainPos = new THREE.Vector3(fxp, 0, mz);
    P().well(w, fxp, mz, 0);
    P().label(w, '💧 回復の泉', fxp, 3.4, mz, -Math.PI / 2, 3.6, { color: '#a8e8ff' }); // faces the entrance
    for (const [x, z] of [[3, 4], [W - 3, 4], [3, D - 4], [W - 3, D - 4]]) P().brazier(w, x, 0, z, 1);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isShop = true;
    validate(w);
    return w;
  };

  // ---------------- small rooms (event / shrine / forge) ----------------

  // ---------------- boss entrances: the road always ends in a gate that seals behind you ----------------
  function buildFacade(w, rng, kind, F) {
    const { cx, gz0, gz1, gate, FH, W } = F;
    if (kind === 'fortress' || kind === 'abyss') {
    // ---- the fortress facade (on the high ground) ----
      w.solid('block', 0, 0, gz0, cx - gate, FH, gz1, { uv: 4 });
      w.solid('block', cx + gate, 0, gz0, W, FH, gz1, { uv: 4 });
      w.solid('block', cx - gate, 6.6, gz0, cx + gate, FH, gz1, { uv: 4 });
      for (const sx of [-1, 1]) {
        const x0 = sx < 0 ? cx - gate - 9 : cx + gate, x1 = sx < 0 ? cx - gate : cx + gate + 9;
        w.solid('block', x0, 0, gz0 - 1, x1, 22, gz1 + 5, { uv: 4 });
        for (let x = x0 + 0.3; x < x1 - 0.5; x += 1.8) w.solid('block', x, 22, gz1 + 4.2, x + 0.9, 23.2, gz1 + 5, { uv: 2, noGrapple: true });
        w.visual('trim', x0 - 0.1, 21.4, gz1 + 4.9, x1 + 0.1, 22, gz1 + 5.1, { uv: 1 });
        for (const y of [9, 14, 18]) { const sxp = (x0 + x1) / 2; w.visual('glow', sxp - 0.18, y, gz1 + 5.01, sxp + 0.18, y + 1.3, gz1 + 5.05, { uv: 1, grad: false }); }
        w.addLight((x0 + x1) / 2, 14, gz1 + 6.2, { flame: 0, intensity: 2.5, range: 8, color: '#ff3a20', emit: false, prio: 0.9 });
        P().banner(w, (x0 + x1) / 2, 19, gz1 + 5, 'pz', 9, 0x5a0808);
      }
      for (let x = 0.3; x < W - 0.5; x += 1.8) if (Math.abs(x - cx) > gate + 9.5) w.solid('block', x, FH, gz1 - 0.7, x + 0.9, FH + 1.1, gz1, { uv: 2, noGrapple: true });
      gateFrame(w, cx, gz1, 'N');
      P().brazier(w, cx - gate - 1.4, 0, gz1 + 7.5, 1.0, true); P().brazier(w, cx + gate + 1.4, 0, gz1 + 7.5, 1.0, true);
      w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
      w.deferred.push((grp) => { const pc = portcullis(w, gate * 2 - 0.2, 6.4); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
      w.addLight(cx, 3, gz0 - 4, { flame: 0, intensity: 6, range: 12, color: '#ff4020', emit: false, prio: 1.4 });
      if (kind === 'abyss') {
        // the last gate: obsidian-violet glow instead of fire
        for (const sx of [-1, 1]) w.addLight(cx + sx * (gate + 4.5), 8, gz1 + 3, { flame: 0, intensity: 7, range: 14, color: '#a040ff', emit: false, prio: 1.6 });
        w.deferred.push((grp) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(gate * 2 - 0.4, 6.4), new THREE.MeshBasicMaterial({ color: 0x8030ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(cx, 3.2, gz1 + 0.6); grp.add(m); });
      }
      return;
    }
    if (kind === 'ruin') {
      // a collapsed rampart with a lone triumphal arch; the opening is sealed by a falling ward of light
      const H = (x) => 7 + Math.abs(Math.sin(x * 0.37 + 1.3)) * 6;
      for (let x = 0; x < W; x += 4) {
        const x1 = Math.min(W, x + 4);
        if (x1 > cx - gate && x < cx + gate) {
          if (x < cx - gate) w.solid('block', x, 0, gz0, cx - gate, H(x), gz1, { uv: 4 });
          if (x1 > cx + gate) w.solid('block', cx + gate, 0, gz0, x1, H(x1), gz1, { uv: 4 });
          continue;
        }
        w.solid('block', x, 0, gz0, x1, H(x), gz1, { uv: 4 });
        if (rng.chance(0.4)) P().rubble(w, (x + x1) / 2, 0, gz1 + rng.range(1, 3), rng, rng.range(0.8, 1.6));
      }
      // the arch
      for (const sx of [-1, 1]) P().pillarSquare(w, cx + sx * (gate + 1.5), gz1 - 0.2, 0, 15, 2.2);
      w.solid('block', cx - gate - 2.4, 12.4, gz0 - 0.6, cx + gate + 2.4, 15, gz1 + 0.6, { uv: 2 });
      w.solid('block', cx - gate, 6.6, gz0, cx + gate, 12.4, gz1, { uv: 3 });
      w.solid('trim', cx - gate - 2.8, 15, gz0 - 0.8, cx + gate + 2.8, 15.6, gz1 + 0.8, { uv: 1 });
      w.visual('glow', cx - 0.6, 13, gz1 + 0.6, cx + 0.6, 14.4, gz1 + 0.66, { uv: 1, grad: false });
      for (const sx of [-1, 1]) { P().statue(w, cx + sx * (gate + 6.5), gz1 + 4.5, 0, Math.PI, rng, 1.6); P().brazier(w, cx + sx * (gate + 2.6), 0, gz1 + 6, 1.0, true); }
      w.addLight(cx, 5, gz1 + 3, { flame: 0, intensity: 6, range: 12, color: '#ffb060', emit: false, prio: 1.4 });
      w.addLight(cx, 3, gz0 - 4, { flame: 0, intensity: 6, range: 12, color: '#ff4020', emit: false, prio: 1.4 });
      w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
      w.deferred.push((grp) => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(gate * 2 - 0.2, 6.4), new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.position.y = 3.2; g.add(m);
        for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(G.Props.PG.box, new THREE.MeshBasicMaterial({ color: 0xffc080 })); r.scale.set(gate * 2 - 0.2, 0.05, 0.05); r.position.y = 0.4 + i * 1.1; g.add(r); }
        g.position.set(cx, 5.8, gz1 - 0.2); grp.add(g); w.bossGate.pc = g;
      });
      return;
    }
    // 'cave': a cliff face swallowing the road; boulders crash down to seal the mouth
    w.solid('rock', 0, 0, gz0, cx - gate, 24, gz1, { uv: 6, grad: false });
    w.solid('rock', cx + gate, 0, gz0, W, 24, gz1, { uv: 6, grad: false });
    w.solid('rock', cx - gate, 6.6, gz0, cx + gate, 24, gz1, { uv: 6, grad: false });
    for (let i = 0; i < 9; i++) { const x = rng.range(2, W - 2); if (Math.abs(x - cx) < gate + 2) continue; P().rubble(w, x, 0, gz1 + rng.range(0.6, 3), rng, rng.range(1.4, 2.6), 'rock'); }
    w.deferred.push((grp) => {
      const rockM = w.mats.rock;
      for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(G.Props.PG.dode, rockM); const s = rng.range(1.2, 3.4); m.scale.set(s, s * rng.range(0.7, 1.3), s); m.position.set(rng.range(2, W - 2), rng.range(6, 22), gz1 + rng.range(0, 1.2)); if (Math.abs(m.position.x - cx) < gate + 1 && m.position.y < 8) continue; m.rotation.set(rng.range(0, 3), rng.range(0, 3), 0); m.castShadow = true; grp.add(m); }
      // stalactite fangs over the mouth
      for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(G.Props.PG.cone, rockM); c.scale.set(0.35, rng.range(1, 2.4), 0.35); c.rotation.x = Math.PI; c.position.set(cx - gate + 0.4 + i * (gate * 2 - 0.8) / 8, 6.4, gz1 + 0.3); grp.add(c); }
    });
    for (const sx of [-1, 1]) { P().torch(w, cx + sx * (gate + 0.4), 4.2, gz1, 'pz'); for (let k = 0; k < 3; k++) pike(w, cx + sx * (gate + 2 + k * 2.2), gz1 + 2 + k, rng, 0); }
    w.addLight(cx, 3, gz0 - 4, { flame: 0, intensity: 6, range: 12, color: '#ff4020', emit: false, prio: 1.4 });
    w.addLight(cx, 4, gz1 + 3, { flame: 0, intensity: 5, range: 10, color: '#ff9050', emit: false, prio: 1.2 });
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(G.Props.PG.dode, w.mats.rock); const s = rng.range(0.9, 1.7); m.scale.setScalar(s); m.position.set(rng.range(-gate + 0.8, gate - 0.8), rng.range(0.8, 5.8), rng.range(-0.4, 0.4)); m.castShadow = true; g.add(m); }
      g.position.set(cx, 5.8, gz1 - 0.6); grp.add(g); w.bossGate.pc = g;
    });
  }

  // ---------------- boss fields ----------------
  // every guardian has a few layouts it fights well in; the seed picks one (pillars are guaranteed where a boss relies on them)
  const BOSS_STYLE = {
    colossus: { facade: ['fortress', 'ruin'], arena: ['fortress', 'ruins', 'colosseum', 'sanctum', 'crossroads'] },
    wyrm: { facade: ['cave'], arena: ['colosseum', 'ruins', 'crossroads'] },
    archon: { facade: ['ruin', 'fortress'], arena: ['fortress', 'colonnade', 'sanctum'] },
    executioner: { facade: ['fortress'], arena: ['colonnade', 'fortress', 'colosseum', 'crossroads'] },
    broodmother: { facade: ['cave'], arena: ['ruins', 'fortress', 'colonnade', 'sanctum'] },
    twins: { facade: ['fortress', 'ruin'], arena: ['colosseum', 'colonnade', 'fortress', 'sanctum', 'crossroads'] },
    heart: { facade: ['cave', 'ruin'], arena: ['ruins', 'fortress', 'colosseum', 'sanctum'] },
    hunter: { facade: ['ruin', 'fortress'], arena: ['colonnade', 'ruins', 'fortress', 'crossroads'] },
    drake: { facade: ['ruin', 'cave'], arena: ['ruins', 'colosseum', 'fortress', 'crossroads', 'sanctum'] },
    abyssking: { facade: ['abyss'], arena: ['throne'] },
  };
  LG.bossStyle = function (bossId, seed) {
    const rng = new G.RNG((seed ^ 0x5eed) >>> 0), st = BOSS_STYLE[bossId] || BOSS_STYLE.colossus;
    return { facade: rng.pick(st.facade), arena: rng.pick(st.arena) };
  };
  const ARENA = {
    fortress(w, rng, W, AD, cx, cz) {
      // ring of massive pillars (cover vs beams; executioner stun targets)
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + Math.PI / 8;
        const x = Math.round(cx + Math.cos(a) * 20), z = Math.round(cz + Math.sin(a) * 20);
        P().pillarSquare(w, x, z, 0, 12, 2.0); w.bossPillars.push(new THREE.Vector3(x, 0, z));
      }
      w.visual('trim', cx - 9, 0, cz - 9, cx + 9, 0.04, cz + 9, { uv: 2, grad: false });
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(26, 30);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (z > AD - 12 || z < 10) continue;
        lowWall(w, rng, x - 1.5, z, 3, rng.chance(0.5), rng.range(0.8, 1.0));
      }
      for (const [x, z] of [[8, 8], [W - 8, 8], [8, AD - 12], [W - 8, AD - 12]]) P().brazier(w, x, 0, z, 1.3);
      if (!w.mats.biome.outdoor) { for (let i = 0; i < 4; i++) P().banner(w, 0, 10, 12 + i * 16, 'px', 5); for (let i = 0; i < 4; i++) P().banner(w, W, 10, 12 + i * 16, 'nx', 5); }
    },
    colonnade(w, rng, W, AD, cx, cz) {
      // a long hall: two rows of tall pillars, statues between them, a carpet down the middle
      const off = rng.range(12, 15), step = rng.pick([14, 15, 16]);
      for (let z = 12; z <= AD - 14; z += step) for (const sx of [-1, 1]) {
        const x = Math.round(cx + sx * off), zz = Math.round(z);
        P().pillarSquare(w, x, zz, 0, 13, 1.8); w.bossPillars.push(new THREE.Vector3(x, 0, zz));
      }
      for (let z = 12 + step / 2; z <= AD - 14; z += step) for (const sx of [-1, 1]) if (rng.chance(0.2)) P().statue(w, cx + sx * (off + 6), z, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, rng, 0.9);
      w.visual('cloth', cx - 3, 0.01, 6, cx + 3, 0.04, AD - 6, { uv: 3, grad: false });
      w.visual('trim', cx - 3.3, 0.005, 6, cx - 3, 0.05, AD - 6, { uv: 1, grad: false }); w.visual('trim', cx + 3, 0.005, 6, cx + 3.3, 0.05, AD - 6, { uv: 1, grad: false });
      for (let z = 22; z < AD - 10; z += 28) for (const sx of [-1, 1]) P().brazier(w, cx + sx * 5, 0, z, 0.8, true);
      if (!w.mats.biome.outdoor) for (let z = 14; z < AD - 10; z += 14) { P().banner(w, 0, 10, z, 'px', 6, 0x3a1010); P().banner(w, W, 10, z, 'nx', 6, 0x3a1010); }
    },
    ruins(w, rng, W, AD, cx, cz) {
      // shattered field: broken pillars of all heights, toppled columns as low cover, rubble everywhere
      const pts = [];
      for (let t = 0; t < 400 && pts.length < 8; t++) {
        const x = Math.round(rng.range(9, W - 9)), z = Math.round(rng.range(9, AD - 12));
        if (Math.hypot(x - cx, z - cz) < 9) continue;
        if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 10)) continue;
        pts.push({ x, z });
      }
      pts.forEach((p, i) => {
        const tall = i < 6; // most stand tall enough to hide behind / grapple to
        const h = tall ? rng.range(10, 14) : rng.range(2, 3.5);
        P().pillarSquare(w, p.x, p.z, 0, h, tall ? rng.range(1.6, 2.2) : rng.range(1.0, 1.3));
        if (tall) w.bossPillars.push(new THREE.Vector3(p.x, 0, p.z)); else P().rubble(w, p.x + rng.range(-1.5, 1.5), 0, p.z + rng.range(-1.5, 1.5), rng, 0.8);
      });
      for (let i = 0; i < 1; i++) {
        // toppled column lying on its side
        const x = rng.range(12, W - 12), z = rng.range(12, AD - 14); if (Math.hypot(x - cx, z - cz) < 10) continue;
        const along = rng.chance(0.5), L = rng.range(3, 5);
        if (along) w.solid('block', x - L / 2, 0, z - 0.55, x + L / 2, 1.0, z + 0.55, { uv: 2 }); else w.solid('block', x - 0.55, 0, z - L / 2, x + 0.55, 1.0, z + L / 2, { uv: 2 });
      }
      for (let i = 0; i < 3; i++) P().rubble(w, rng.range(6, W - 6), 0, rng.range(6, AD - 8), rng, rng.range(0.5, 0.9), 'rock');
      for (let i = 0; i < 2; i++) { const x = rng.range(10, W - 10), z = rng.range(8, AD - 12); if (Math.hypot(x - cx, z - cz) > 18) P().statue(w, x, z, 0, rng.range(0, 6), rng, rng.range(0.9, 1.1)); }
      for (const [x, z] of [[8, 8], [W - 8, 8], [8, AD - 12], [W - 8, AD - 12]]) P().brazier(w, x, 0, z, 1.2);
    },
    colosseum(w, rng, W, AD, cx, cz) {
      // a round pit ringed by a low parapet with four openings, six columns inside, stepped stands beyond
      const R = 31;
      for (let i = 0; i < 36; i++) {
        const a0 = i / 36 * Math.PI * 2, am = a0 + Math.PI / 36;
        if (i % 9 === 4 || i % 2) continue; // openings, and a gap between every block
        const x = cx + Math.cos(am) * R, z = cz + Math.sin(am) * R;
        if (z > AD - 3) continue;
        w.solid('wall', x - 1.1, 0, z - 1.1, x + 1.1, 1.1, z + 1.1, { uv: 2 });
        w.solid('trim', x - 1.2, 1.1, z - 1.2, x + 1.2, 1.25, z + 1.2, { uv: 1 });
      }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + Math.PI / 6;
        const x = Math.round(cx + Math.cos(a) * 15), z = Math.round(cz + Math.sin(a) * 15);
        P().pillarSquare(w, x, z, 0, 12, 1.9); w.bossPillars.push(new THREE.Vector3(x, 0, z));
      }
      // stands in the corners (stepped, climbable)
      for (const [x0, z0, sx, sz] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, AD, 1, -1], [W, AD, -1, -1]]) for (let k = 0; k < 2; k++) {
        const s = 5 - k * 2;
        const xa = Math.min(x0, x0 + sx * s), xb = Math.max(x0, x0 + sx * s), za = Math.min(z0, z0 + sz * s), zb = Math.max(z0, z0 + sz * s);
        if (zb > AD - 1) continue;
        w.solid('block', xa, 0, za, xb, 1.2 + k * 1.2, zb, { uv: 2 });
      }
      w.visual('trim', cx - 6, 0, cz - 6, cx + 6, 0.04, cz + 6, { uv: 2, grad: false });
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; P().brazier(w, cx + Math.cos(a) * 24, 0, cz + Math.sin(a) * 24, 1.1, true); }
    },
    sanctum(w, rng, W, AD, cx, cz) {
      // an inner sanctum: four great pillars around a sigil, short obelisks out on the diagonals
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4;
        const x = Math.round(cx + Math.cos(a) * 13), z = Math.round(cz + Math.sin(a) * 13);
        P().pillarSquare(w, x, z, 0, 13, 1.9); w.bossPillars.push(new THREE.Vector3(x, 0, z));
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * 25), z = Math.round(cz + Math.sin(a) * 25);
        if (z > AD - 10 || z < 8) continue;
        P().pillarSquare(w, x, z, 0, 11, 1.7); w.bossPillars.push(new THREE.Vector3(x, 0, z));
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = cx + Math.cos(a) * 27, z = cz + Math.sin(a) * 27;
        if (z > AD - 10 || z < 8) continue;
        w.solid('trim', x - 0.6, 0, z - 0.6, x + 0.6, 0.3, z + 0.6, { uv: 1 }); w.solid('block', x - 0.35, 0.3, z - 0.35, x + 0.35, 3.2, z + 0.35, { uv: 1 });
        w.addLight(x, 3.6, z, { flame: 0, intensity: 2.5, range: 7, color: '#c8a0ff', emit: true, prio: 0.5 });
      }
      // the sigil: flat rings of trim on the floor (no step, nothing to snag on)
      for (const r of [5, 8.5]) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; w.visual('trim', x - 0.9, 0.005, z - 0.9, x + 0.9, 0.04, z + 0.9, { uv: 1, grad: false }); }
      w.visual('glow', cx - 0.8, 0.01, cz - 0.8, cx + 0.8, 0.05, cz + 0.8, { uv: 1, grad: false });
      for (const [x, z] of [[8, 8], [W - 8, 8]]) P().brazier(w, x, 0, z, 1.0);
    },
    crossroads(w, rng, W, AD, cx, cz) {
      // four corner bastions (a tall pillar with a short broken wall beside it) around an open cross
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1;
        const x = Math.round(cx + sx * 15), z = Math.round(cz + sz * 14);
        P().pillarSquare(w, x, z, 0, 12, 2.0); w.bossPillars.push(new THREE.Vector3(x, 0, z));
        if (rng.chance(0.7)) lowWall(w, rng, x + sx * 2.5 - (sx < 0 ? 3 : 0), z + sz * 0.5, 3, true, rng.range(0.8, 1.0));
      }
      for (let i = 0; i < 2; i++) { const sx = i ? 1 : -1, x = Math.round(cx + sx * 27); P().pillarSquare(w, x, Math.round(cz), 0, 10, 1.6); w.bossPillars.push(new THREE.Vector3(x, 0, Math.round(cz))); }
      // the cross: flagstone paths through the middle
      w.visual('trim', cx - 2.2, 0.005, 8, cx + 2.2, 0.04, AD - 8, { uv: 2, grad: false });
      w.visual('trim', 8, 0.005, cz - 2.2, W - 8, 0.04, cz + 2.2, { uv: 2, grad: false });
      for (const [x, z] of [[cx - 4, cz - 4], [cx + 4, cz + 4], [cx - 4, cz + 4], [cx + 4, cz - 4]]) P().brazier(w, x, 0, z, 0.7, true);
    },
    throne(w, rng, W, AD, cx, cz) {
      // THE LAST FIELD: a round island of obsidian floating in a violet void under an eclipse.
      // (floors were laid with a pit mask by LG.boss: only the disc, the bridge and the northern ledge exist)
      const R = w.voidR, VIO = 0xb060ff;
      // energy barrier along the rim (invisible colliders + a faint curtain), open toward the bridge and the ledge
      // no barrier: the rim and the holes are open drops into the void (falling here is death)
      w.deferred.push((grp) => {
        for (const h of w.voidHoles || []) { const hr = new THREE.Mesh(new THREE.RingGeometry(h.r - 0.25, h.r + 0.1, 32), new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); hr.rotation.x = -Math.PI / 2; hr.position.set(h.x, 0.03, h.z); grp.add(hr); }
        // glowing rim on the floor edge
        const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.35, R, 96), new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        rim.rotation.x = -Math.PI / 2; rim.position.set(cx, 0.03, cz); grp.add(rim);
        // rune rings on the floor (slowly turning)
        for (const [r0, r1, sp] of [[11.6, 12, 0.05], [6.8, 7.1, -0.08]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, r0 > 10 ? 8 : 64), new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.04, cz); grp.add(m); w.animated.push({ kind: 'spin', m, sp, axis: 'z' }); }
        // the island's underside: jagged hanging rock
        const rockM = w.mats.rock;
        for (let i = 0; i < 40; i++) { const a2 = rng.range(0, Math.PI * 2), d = rng.range(0, R - 2), s = rng.range(2, 6); const c = new THREE.Mesh(G.Props.PG.cone, rockM); c.scale.set(s, rng.range(6, 18), s); c.rotation.x = Math.PI; c.position.set(cx + Math.cos(a2) * d, -14 - c.scale.y * 0.4, cz + Math.sin(a2) * d); grp.add(c); }
        // the void below: a slow violet maelstrom
        const vt = G.Tex.spr.portal;
        for (const [y, s, op, sp] of [[-60, 420, 0.55, 0.02], [-45, 260, 0.35, -0.04]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: vt, color: 0x9040ff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); grp.add(m); w.animated.push({ kind: 'spin', m, sp, axis: 'z' }); }
        // the eclipse
        const ecl = new THREE.Group(); ecl.position.set(cx, 95, cz - 230); w.eclipse = ecl;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 64), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); ecl.add(disc);
        const cor = new THREE.Mesh(new THREE.RingGeometry(38, 62, 64), new THREE.MeshBasicMaterial({ color: 0xc070ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); cor.position.z = -0.5; ecl.add(cor);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xe0a0ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(220, 220, 1); halo.position.z = -1; ecl.add(halo);
        ecl.lookAt(cx, 0, cz); grp.add(ecl);
        // floating debris and broken arches all around
        const ob = new THREE.MeshStandardMaterial({ color: 0x1a1222, roughness: 0.4, metalness: 0.3, emissive: 0x2a0a4a, emissiveIntensity: 0.5 });
        for (let i = 0; i < 46; i++) {
          const a2 = rng.range(0, Math.PI * 2), d = rng.range(R + 8, R + 70), y = rng.range(-12, 30), s = rng.range(1, 5);
          const m = new THREE.Mesh(rng.chance(0.6) ? G.Props.PG.dode : G.Props.PG.oct, ob); m.scale.set(s, s * rng.range(0.6, 1.8), s); m.position.set(cx + Math.cos(a2) * d, y, cz + Math.sin(a2) * d); m.rotation.set(rng.range(0, 3), rng.range(0, 3), 0); grp.add(m);
          w.animated.push({ kind: 'islet', m, y0: y, ph: rng.range(0, 6) });
        }
        for (let i = 0; i < 6; i++) {
          const a2 = rng.range(0, Math.PI * 2), d = rng.range(R + 18, R + 45);
          const g = new THREE.Group(); g.position.set(cx + Math.cos(a2) * d, rng.range(4, 16), cz + Math.sin(a2) * d); g.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3));
          const pm = w.mats.block;
          for (const sx of [-1, 1]) { const p = new THREE.Mesh(G.Props.PG.box, pm); p.scale.set(1.6, 12, 1.6); p.position.set(sx * 4, 0, 0); g.add(p); }
          const l = new THREE.Mesh(G.Props.PG.box, pm); l.scale.set(10, 1.6, 1.8); l.position.y = 6.5; g.add(l);
          grp.add(g); w.animated.push({ kind: 'islet', m: g, y0: g.position.y, ph: rng.range(0, 6) });
        }
      });
      // broken obsidian columns around the field (cover vs the beams) with floating crowns of shards
      for (let i = 0; i < 8; i++) {
        const a2 = i / 8 * Math.PI * 2 + Math.PI / 8;
        const x = Math.round(cx + Math.cos(a2) * 18), z = Math.round(cz + Math.sin(a2) * 18);
        P().pillarSquare(w, x, z, 0, i % 2 ? 13 : 9, 2.2); w.bossPillars.push(new THREE.Vector3(x, 0, z));
        w.addLight(x, 2, z, { flame: 0, intensity: 3, range: 8, color: '#a050ff', emit: false, prio: 0.6 });
      }
      // the throne at the north of the island
      const tz = cz - R + 6;
      w.visual('trim', cx - 8, 0, tz - 3, cx + 8, 0.12, tz + 4, { uv: 2 });
      w.solid('block', cx - 2.4, 0, tz - 3, cx + 2.4, 10.5, tz - 1.8, { uv: 2 });
      w.solid('trim', cx - 3.2, 10.5, tz - 3.2, cx + 3.2, 11.3, tz - 1.6, { uv: 1 });
      for (const sx of [-1, 1]) { w.solid('block', cx + sx * 2.4 - 0.5, 0, tz - 2.6, cx + sx * 2.4 + 0.5, 3.2, tz - 1.2, { uv: 1 }); P().brazier(w, cx + sx * 6.5, 0, tz + 1.5, 1.4, true); }
      w.addLight(cx, 6, tz, { flame: 0, intensity: 10, range: 18, color: '#c070ff', emit: false, prio: 2 });
      // bridge rails and the ledge in front of the exits
      for (const sx of [-1, 1]) for (let z = cz + R - 1; z < AD + 2; z += 5) if (rng.chance(0.55)) w.visual('trim', cx + sx * 3.7, 0, z, cx + sx * 3.3, rng.range(0.3, 0.8), z + rng.range(1.5, 3.5), { uv: 1 });
      for (let z = cz + R; z < AD + 2; z += 4) for (const sx of [-1, 1]) w.addLight(cx + sx * 3.5, 1.2, z, { flame: 0, intensity: 2, range: 5, color: '#a050ff', emit: false, prio: 0.4 });
      const LED = 6;
      // ledge edge (south side of the ledge, except the connector)
      for (let x = 0; x < W; x += 2) { if (Math.abs(x + 1 - cx) < 4.2) continue; w.visual('trim', x, 0, LED - 0.25, x + 2, 0.8, LED + 0.25, { uv: 1 }); }
      w.throneSeat = new THREE.Vector3(cx, 0, tz - 0.3);
      w.finalArena = true;
    },
  };
  LG.room = function (area, seed, kind, gates) {
    const rng = new G.RNG(seed);
    const W = 40, D = 34;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    floors(w, W, D, null, kind === 'shrine' ? 'cobble' : 'floor');
    perimeter(w, rng, W, D, { h: 10, top: 16, beams: 0, gates });
    if (kind !== 'trial') {
      for (let z = 6; z < D - 4; z += 7) w.solid('woodDark', 0, 9.2, z - 0.35, W, 9.9, z + 0.35, { uv: 2 });
      P().chandelier(w, W / 2, 6, D / 2, 9.2);
    }
    for (const [x, z] of [[3, 4], [W - 3, 4], [3, D - 4], [W - 3, D - 4]]) P().brazier(w, x, 0, z, 1);
    const cz = D / 2 + 1;
    w.npcSpots = [];
    if (kind === 'event') {
      P().rug(w, W / 2, cz, 0, 10, 6, [0.3, 0.12, 0.25]);
      P().table(w, W / 2 - 7, cz - 4, 0, true, rng); P().bookshelf(w, 1, cz, 0, false, rng); P().bookshelf(w, W - 1, cz, 0, false, rng);
      w.npcSpots.push(new THREE.Vector3(W / 2 - 4, 0, cz), new THREE.Vector3(W / 2 + 4, 0, cz));
      P().candles(w, W / 2 - 4, 0, cz + 1.5, rng); P().candles(w, W / 2 + 4, 0, cz + 1.5, rng);
    } else if (kind === 'shrine') {
      // raised altar dais with a statue
      w.solid('trim', W / 2 - 4, 0, cz - 3, W / 2 + 4, 0.25, cz + 3, { uv: 2 });
      w.solid('trim', W / 2 - 3, 0.25, cz - 2, W / 2 + 3, 0.5, cz + 2, { uv: 2 });
      P().statue(w, W / 2, cz - 6, 0, 0, rng, 1.1);
      w.solid('block', W / 2 - 0.8, 0.5, cz - 0.6, W / 2 + 0.8, 1.4, cz + 0.6, { uv: 1 });
      P().candles(w, W / 2 - 0.5, 1.4, cz, rng, true);
      w.altarPos = new THREE.Vector3(W / 2, 1.4, cz);
      for (let i = 0; i < 4; i++) P().pillarRound(w, W / 2 + (i < 2 ? -6 : 6), cz + (i % 2 ? 3 : -3), 0, 7, 0.4, false, rng);
    } else if (kind === 'forge') {
      w.solid('iron', W / 2 - 0.9, 0, cz - 0.4, W / 2 + 0.9, 0.8, cz + 0.4, { uv: 1 });
      w.solid('iron', W / 2 - 1.2, 0.8, cz - 0.5, W / 2 + 1.2, 1.0, cz + 0.5, { uv: 1 });
      w.anvilPos = new THREE.Vector3(W / 2, 1.0, cz);
      P().brazier(w, W / 2 + 4, 0, cz - 2, 1.4); P().brazier(w, W / 2 - 4, 0, cz - 2, 1.4);
      P().weaponRack(w, 1, cz, 0, false); P().weaponRack(w, W - 1, cz, 0, false);
      for (let i = 0; i < 3; i++) P().barrel(w, W / 2 + 6 + i, cz + 3, 0, rng);
      w.npcSpots.push(new THREE.Vector3(W / 2, 0, cz - 2));
    } else if (kind === 'trial') {
      // shooting gallery: nothing in the way. A firing line near the entrance, lamps (no decorative targets: they were mistaken for real ones).
      w.visual('trim', 4, 0, D - 9.2, W - 4, 0.03, D - 8.8, { uv: 1, grad: false });
      w.visual('glow', 5, 0.031, D - 9.05, W - 5, 0.04, D - 8.95, { uv: 1, grad: false });
      for (const x of [8, W - 8]) w.addLight(x, 7, D / 2, { flame: 0, intensity: 8, range: 22, color: '#ffe0b0', emit: false, prio: 1.2 });
      w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 8, face: 1 })); w.miniHeal = new THREE.Vector3(W / 2 + 6, 0, 8);
    } else if (G.Rooms2 && G.Rooms2.KINDS.includes(kind)) {
      const c = new THREE.Vector3(W / 2, 0, cz);
      w.npcSpots.push(c);
      G.Rooms2.decor(w, kind, c, rng);
    }
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isRoom = kind;
    validate(w);
    return w;
  };

  // ---------------- boss arena dressing: 2 small themed sets per arena, kept to the edges ----------------
  function arenaDressing(w, rng, W, AD, cx, cz) {
    const spot = (minD) => {
      for (let t = 0; t < 40; t++) {
        const x = rng.range(7, W - 7), z = rng.range(9, AD - 13);
        if (Math.hypot(x - cx, z - cz) < minD) continue;
        if (w.bossPillars.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
        if (w.boxFree && !w.boxFree(x - 1.2, 0.05, z - 1.2, x + 1.2, 2, z + 1.2)) continue;
        return [x, z];
      }
      return null;
    };
    const T = {
      armory() { for (let i = 0; i < 2; i++) { const q = spot(22); if (q) P().weaponRack(w, q[0], q[1], 0, rng.chance(0.5)); } },
      graves() { for (let k = 0; k < 1; k++) { const q = spot(20); if (!q) continue; for (let i = 0; i < 4; i++) P().gravestone(w, q[0] + rng.range(-2.5, 2.5), q[1] + rng.range(-2.5, 2.5), 0, rng.range(-0.4, 0.4), rng); } },
      crystals() { for (let i = 0; i < 2; i++) { const q = spot(18); if (!q) continue; P().crystals(w, q[0], 0, q[1], rng, rng.range(0.5, 0.8)); w.addLight(q[0], 1, q[1], { flame: 0, intensity: 2, range: 6, color: '#80c8ff', emit: false, prio: 0.4 }); } },
      tombs() { for (let i = 0; i < 1; i++) { const q = spot(22); if (q) P().sarcophagus(w, q[0], q[1], 0, rng.chance(0.5), rng); } },
      offerings() { for (let i = 0; i < 2; i++) { const q = spot(20); if (!q) continue; for (let k = 0; k < 2; k++) P().urn(w, q[0] + rng.range(-1, 1), q[1] + rng.range(-1, 1), 0, rng); P().candles(w, q[0], 0, q[1] + 1.2, rng, false); } },
      cages() { for (let i = 0; i < 1; i++) { const q = spot(22); if (q) P().cage(w, q[0], q[1], 0, 1.0, rng); } },
      bones() { for (let i = 0; i < 3; i++) { const q = spot(12); if (q) P().bones(w, q[0], 0, q[1], rng); } },
      rugs() { P().rug(w, cx, cz, 0.01, rng.range(7, 10), rng.range(7, 10), rng.pick([[0.45, 0.12, 0.1], [0.15, 0.2, 0.4], [0.3, 0.25, 0.1]])); },
      standards() {
        for (let i = 0; i < 2; i++) {
          const q = spot(22); if (!q) continue;
          const [x, z] = q, col = rng.pick([[0.5, 0.1, 0.08], [0.12, 0.18, 0.45], [0.35, 0.3, 0.1]]);
          w.solid('woodDark', x - 0.08, 0, z - 0.08, x + 0.08, 4.2, z + 0.08, { uv: 1 });
          w.batch.box('cloth2', x + 0.08, 2.2, z - 0.03, x + 1.3, 4.0, z + 0.03, { uv: 1, tint: col, grad: false });
        }
      },
    };
    const keys = Object.keys(T); rng.shuffle(keys);
    const n = rng.chance(0.7) ? 1 : 2;
    for (const k of keys.slice(0, n)) T[k]();
  }
  // ---------------- burning heights ----------------
  // Boss arenas: every standable top 4.5m+ up burns. Normal areas: tall tops that no path leads to (grapple-only perches).
  // Each burning top gets a black iron fire bed; the flames themselves are drawn densely near the camera (game.js updateWorldFx).
  LG.FIRE_Y = 4.5;
  LG.FIRE_Y_AREA = 19; // ordinary areas: only tops this high (ceiling beams, the very top of towers) burn / get an invisible column
  function fireBed(w, c) {
    const x0 = c.x0 + 0.03, x1 = c.x1 - 0.03, z0 = c.z0 + 0.03, z1 = c.z1 - 0.03, y = c.y1;
    const IRON = { tint: [0.13, 0.12, 0.12], grad: false };
    w.batch.box('iron', x0, y, z0, x1, y + 0.16, z1, IRON);
    w.batch.box('glow', x0 + 0.1, y + 0.16, z0 + 0.1, x1 - 0.1, y + 0.18, z1 - 0.1, { tint: [1, 0.3, 0.05], grad: false });
    // grate bars across the short side, a raised rim and corner spikes
    const alongX = x1 - x0 >= z1 - z0, L = alongX ? x1 - x0 : z1 - z0, nb = Math.max(2, Math.round(L / 0.5));
    for (let i = 0; i <= nb; i++) {
      const t = (alongX ? x0 : z0) + L * i / nb;
      if (alongX) w.batch.box('iron', t - 0.04, y + 0.16, z0, t + 0.04, y + 0.25, z1, IRON);
      else w.batch.box('iron', x0, y + 0.16, t - 0.04, x1, y + 0.25, t + 0.04, IRON);
    }
    w.batch.box('iron', x0, y + 0.16, z0, x1, y + 0.3, z0 + 0.07, IRON); w.batch.box('iron', x0, y + 0.16, z1 - 0.07, x1, y + 0.3, z1, IRON);
    w.batch.box('iron', x0, y + 0.16, z0, x0 + 0.07, y + 0.3, z1, IRON); w.batch.box('iron', x1 - 0.07, y + 0.16, z0, x1, y + 0.3, z1, IRON);
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) w.batch.box('iron', px - 0.06, y + 0.16, pz - 0.06, px + 0.06, y + 0.55, pz + 0.06, IRON);
    w.fireRects.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: y + 0.18, acc: 0, low: Math.max(c.x1 - c.x0, c.z1 - c.z0) > 8 });
    // a few real lights so the crowns glow from afar (one per ~7m)
    const n = Math.max(1, Math.round(L / 7));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, lx = alongX ? x0 + (x1 - x0) * k : (x0 + x1) / 2, lz = alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * k;
      w.addLight(lx, y + 1.2, lz, { flame: 0, emit: false, intensity: 8, range: 10, color: '#ff5a18', prio: 0.55 });
    }
  }
  function fireTops(w, o) {
    w.fireRects = [];
    const W = w.W;
    if (o.boss) { w.fireY = LG.FIRE_Y; w.fireZ = o.AD + 1; }
    const plats = w.platTops || [];
    // normal areas: perches that can't carry a fire bed (thin ledges, wall tops, the ledges by the exit signs)
    // get an invisible column instead, so there is simply nowhere to stand
    const ghost = (c) => { const g = w.addCollider(c.x0 - 0.06, c.y1, c.z0 - 0.06, c.x1 + 0.06, c.y1 + 40, c.z1 + 0.06, { noGrapple: true, surf: c.surf }); g.ghost = true; };
    for (const c of w.colliders.slice()) {
      if (c.alive === false || c.ghost || c.tag === 'bridge') continue;
      const sx = c.x1 - c.x0, sz = c.z1 - c.z0;
      if (sx < 0.1 || sz < 0.1) continue;
      const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
      // thin dividing walls (0.15m+ thick, 2.5m+ long) burn like any other top; only small corbels / ledges get the invisible column
      let bed = Math.min(sx, sz) >= 0.15 && (Math.min(sx, sz) >= 0.6 || Math.max(sx, sz) >= 2.5);
      if (o.boss) {
        if (c.y1 < LG.FIRE_Y || c.z0 > o.AD + 1 || mx < -1 || mx > W + 1 || mz < -1) continue;
        // the exit signs over the north gates stay readable: invisible columns there instead of fire
        if ((w.exits || []).some((ex) => c.x1 > ex.x - 6.5 && c.x0 < ex.x + 6.5 && c.z0 < 4 && c.y1 > 5)) bed = false;
        else if (!bed) continue;
      } else {
        if (c.y1 < LG.FIRE_Y_AREA || mx < -4 || mx > W + 4 || mz < -4 || mz > w.D + 4) continue;
        // a walkway you can walk to from the spawn is not a perch (wall pilaster caps, corbels, beams, wall tops are)
        const ni = w.navIdx(mx, mz);
        if (ni >= 0 && w.reachMask && w.reachMask[ni] && Math.abs(w.nf[ni] - c.y1) < 0.4) continue;
        if (plats.some((p) => mx > p.x0 - 1 && mx < p.x1 + 1 && mz > p.z0 - 1 && mz < p.z1 + 1 && Math.abs((p.y ?? 0) - c.y1) < 0.15)) continue; // the chest platform itself (not pillars or beams above it)
        if (mx < 0 || mx > W || mz < 0 || mz > w.D) bed = false; // on / beyond the outer wall
        // railings / parapets just above a walkable storey: no flames there, just nowhere to stand
        if (plats.some((p) => mx > p.x0 - 1.6 && mx < p.x1 + 1.6 && mz > p.z0 - 1.6 && mz < p.z1 + 1.6 && c.y1 - (p.y ?? 0) > 0.2 && c.y1 - (p.y ?? 0) < 1.6)) bed = false;
        // keep the exit signs (hung above each gate on the north wall) clear of flames and smoke
        if ((w.exits || []).some((ex) => c.x1 > ex.x - 6.5 && c.x0 < ex.x + 6.5 && c.z0 < 4 && c.y1 > 5)) bed = false;
      }
      // a top counts if somewhere on it a person could stand (merlons, crests or signs may block parts of it)
      let stand = false;
      for (let x = c.x0 + Math.min(0.15, sx / 2); x <= c.x1 - Math.min(0.15, sx / 2) + 1e-6 && !stand; x += 0.6) for (let z = c.z0 + Math.min(0.15, sz / 2); z <= c.z1 - Math.min(0.15, sz / 2) + 1e-6; z += 0.6) {
        if (w.boxFree(x - 0.15, c.y1 + 0.04, z - 0.15, x + 0.15, c.y1 + 1.8, z + 0.15)) { stand = true; break; }
      }
      if (!stand) continue;
      // merlon tops: no invisible wall; standing on one burns like the walkway (flames and damage only, no bed)
      if (c.merlon) { w.fireRects.push({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: c.y1 + 0.18, acc: 0 }); continue; }
      if (bed) fireBed(w, c); else ghost(c);
    }
  }
  // ---------------- boss arena ----------------
  // building blocks shared with fieldgen.js
  LG._ = { Occ, stairs, parapet, platform, lowWall, house, colonnade, archWall, perimeter, floors, scatter, structures, biomeExtras, lightShafts, placeChests, validate, fireTops, pike, tree, gateFrame, portcullis, scenery, arenaDressing, ARENA, WALL_H, WALL_T, makeSimple };
  LG.boss = function (area, seed, bossId) {
    const rng = new G.RNG(seed);
    const style = LG.bossStyle(bossId, seed);
    // the arena (the guardian's field) is the northern 76m; south of it runs the approach road
    const W = 76, AD = 76, ROAD = 82, D = AD + ROAD;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w.arenaD = AD; w.bossStyle = style;
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const cx0 = W / 2, cz0 = AD / 2 - 2;
    let pit = null;
    if (style.arena === 'throne') {
      // the island (radius R), a bridge from the gate, a ledge before the exits; everything else is the void
      const R = (w.voidR = 28);
      pit = new Uint8Array(W * (AD + 3));
      for (let z = 0; z < AD + 3; z++) for (let x = 0; x < W; x++) {
        const inDisc = Math.hypot(x + 0.5 - cx0, z + 0.5 - cz0) <= R;
        const bridge = Math.abs(x + 0.5 - cx0) <= 3.5 && z >= cz0;
        const ledge = z < 6;
        const conn = Math.abs(x + 0.5 - cx0) <= 4 && z < cz0 - R + 3;
        if (!(inDisc || bridge || ledge || conn)) pit[z * W + x] = 1;
      }
      // the island is crumbling: holes torn into it near the edge (between the pillar ring and the rim, away from the bridge and throne)
      const holes = [];
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.95) continue; holes.push(a); }
      rng.shuffle(holes);
      w.voidHoles = holes.slice(0, 4).map((a) => ({ x: cx0 + Math.cos(a) * 23.5, z: cz0 + Math.sin(a) * 23.5, r: 2.4 }));
      for (const h of w.voidHoles) for (let z = Math.floor(h.z - 3); z <= h.z + 3; z++) for (let x = Math.floor(h.x - 3); x <= h.x + 3; x++) if (x >= 0 && x < W && z >= 0 && z < AD + 3 && Math.hypot(x + 0.5 - h.x, z + 0.5 - h.z) < h.r) pit[z * W + x] = 1;
      // a sky for the end of the world (the stage itself is indoors)
      w.envOverride = { outdoor: 'void', sky: ['#000000', '#12042a', '#3a0f5a'], sunDir: [0, 0.4, -1], sunCol: [0.85, 0.4, 1.0], stars: true, fog: '#120820', fogD: 0.0055, amb: 0.6, moon: '#c090ff', moonI: 1.9, hemiS: '#8a6ab0', hemiG: '#1a0a28' };
    }
    floors(w, W, AD + 3, pit, style.arena === 'colosseum' ? 'floor' : 'cobble');
    perimeter(w, rng, W, D, { beams: 0, gates: 3, southY: ROAD_LOW, voidArena: !!pit, arenaD: AD });
    bossRoad(w, rng, W, AD, D, bossId, style.facade);
    w.killY = ROAD_LOW - 12;
    const cx = cx0, cz = cz0;
    w.arenaCenter = new THREE.Vector3(cx, 0, cz);
    w.bossPillars = [];
    (ARENA[style.arena] || ARENA.fortress)(w, rng, W, AD, cx, cz);
    if (style.arena !== 'throne') arenaDressing(w, rng, W, AD, cx, cz);
    // nest ledge for the brood mother: on the east wall (high, unreachable without grapple), clear of the exit gates
    w.nestPos = new THREE.Vector3(W - 4, 11, cz);
    if (bossId === 'broodmother') {
      w.solid('rock', W - 8, 9, cz - 7, W, 10.5, cz + 7, { uv: 4 });
      for (let i = 0; i < 6; i++) P().web(w, rng.range(W - 8, W - 1), rng.range(7, 13), cz + rng.range(-7, 7), Math.PI / 2, rng.range(3, 6));
    }
    if (!w.finalArena) lightShafts(w, rng, W, AD, 3);
    fireTops(w, { boss: true, AD });
    w.spawn = { x: W / 2, y: ROAD_LOW, z: D - 4.5, yaw: 0 };
    w.isBoss = true;
    validate(w);
    return w;
  };
})();
