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
    // (the boxes stay as they were, drawn; over each a tread stone with its nosing and its wear: stepTreads)
    stepTreads(w, side, e, c, wd, h0, h1, mk, n, rise, run, sg);
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
        // (its coping: stones a little wider than the wall, their tops weathered to a low ridge: coping())
        const ay = w._atY || 0, cp = (T2) => _tagged('copings', () => coping(w, T2, p, q, y + ay + H - 0.03, y + ay + H + 0.12, -0.05, T + 0.05, { ridge: 0.05, plain: true }));
        if (side === 'N') { w.solid(mk || 'wall', p, y, z0, q, y + H, z0 + T, { uv: 2 }); cp((a, yy, d) => [a, yy, z0 + d]); w.addCollider(p, y + H, z0, q, y + H + 0.1, z0 + T); }
        if (side === 'S') { w.solid(mk || 'wall', p, y, z1 - T, q, y + H, z1, { uv: 2 }); cp((a, yy, d) => [a, yy, z1 - T + d]); w.addCollider(p, y + H, z1 - T, q, y + H + 0.1, z1); }
        if (side === 'W') { w.solid(mk || 'wall', x0, y, p, x0 + T, y + H, q, { uv: 2 }); cp((a, yy, d) => [x0 + d, yy, a]); w.addCollider(x0, y + H, p, x0 + T, y + H + 0.1, q); }
        if (side === 'E') { w.solid(mk || 'wall', x1 - T, y, p, x1, y + H, q, { uv: 2 }); cp((a, yy, d) => [x1 - T + d, yy, a]); w.addCollider(x1 - T, y + H, p, x1, y + H + 0.1, q); }
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
    // its edge: kerb stones round the top, worn round and standing a little out over the face (the slab under them as it was); at its
    // foot a battered plinth (in place of a flat band)
    { const ay = w._atY || 0, ST = sideT(x0 - 0.06, z0 - 0.06, x1 + 0.06, z1 + 0.06);
      _tagged('platforms', () => { for (const k of ['N', 'S', 'W', 'E']) { const q = ST[k], ns = k === 'N' || k === 'S';
        coping(w, q.T, ns ? q.a0 - 0.05 : q.a0 + 0.4, ns ? q.a1 + 0.05 : q.a1 - 0.4, h + ay - 0.3, h + ay + 0.01, -0.44, 0.05, { len: [0.7, 1.2] });
        FORT.talus(w, (a, yy, d) => q.T(a, yy, d - 0.06), ns ? q.a0 : q.a0 + 0.06, ns ? q.a1 : q.a1 - 0.06, ay, 0.42, 0.18, { t: 0.78 }); } }); }
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
      const ay = w._atY || 0;
      if (alongX) { w.solid('wall', x + a, 0, z - T / 2, x + b, hh, z + T / 2, { uv: 2.5 }); hard(w, 'trim', x + a - 0.05, hh, z - T / 2 - 0.05, x + b + 0.05, hh + 0.12, z + T / 2 + 0.05); _tagged('copings', () => coping(w, (u, yy, d) => [u, yy, z - T / 2 + d], x + a - 0.05, x + b + 0.05, hh + ay - 0.04, hh + ay + 0.13, -0.06, T + 0.06, { ridge: 0.05 })); }
      else { w.solid('wall', x - T / 2, 0, z + a, x + T / 2, hh, z + b, { uv: 2.5 }); hard(w, 'trim', x - T / 2 - 0.05, hh, z + a - 0.05, x + T / 2 + 0.05, hh + 0.12, z + b + 0.05); _tagged('copings', () => coping(w, (u, yy, d) => [x - T / 2 + d, yy, u], z + a - 0.05, z + b + 0.05, hh + ay - 0.04, hh + ay + 0.13, -0.06, T + 0.06, { ridge: 0.05 })); }
    }
    if (broken) P().rubble(w, alongX ? x + len * 0.47 : x, 0, alongX ? z : z + len * 0.47, rng, 0.9);
  }

  // opts (the new fields): { door: 'N' | 'S' | 'E' | 'W' (the side that faces the street), ruined: chance, h: [min, max] }
  function house(w, rng, R, opts) {
    opts = opts || {};
    const x0 = R.x0 + 0.5, z0 = R.z0 + 0.5, x1 = R.x1 - 0.5, z1 = R.z1 - 0.5;
    const H = rng.range(...(opts.h || [3.6, 4.8])), T = 0.55;
    const doorSide = opts.door || rng.pick(['N', 'S', 'E', 'W']);
    const ruined = rng.chance(opts.ruined ?? 0.7);
    // interior floor (wood planks)
    w.solid('wood', x0 + T, 0, z0 + T, x1 - T, 0.06, z1 - T, { uv: 2, grad: false });
    const wallSeg = (side) => {
      const horiz = side === 'N' || side === 'S';
      const a0 = horiz ? x0 : z0 + T, a1 = horiz ? x1 : z1 - T;
      const fixed = side === 'N' ? z0 : side === 'S' ? z1 - T : side === 'W' ? x0 : x1 - T;
      const len = a1 - a0;
      const door = side === doorSide ? [a0 + len / 2 - 0.9, a0 + len / 2 + 0.9] : null;
      const win = !door && len > 4 && rng.chance(0.7) ? [a0 + len / 2 - 0.7, a0 + len / 2 + 0.7] : null;
      let o0 = Infinity, o1 = -Infinity;   // (the doorway as the pieces left out of the wall make it)
      for (let s = a0; s < a1 - 0.01; s += 1) {
        const e = Math.min(a1, s + 1);
        const mid = (s + e) / 2;
        if (door && mid > door[0] && mid < door[1]) { o0 = Math.min(o0, s); o1 = Math.max(o1, e); }
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
        // a timber frame in the doorway: posts in its jambs, a lintel over them let into the wall either side
        const cu = (o0 + o1) / 2, ay = w._atY || 0;
        if (o1 > o0) _tagged('doors', () => doorFrame(w, horiz ? (u, y, d) => [cu + u, y + ay, fixed + d] : (u, y, d) => [fixed + d, y + ay, cu + u], (o1 - o0) / 2, 2.5, T));
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
      else if (brokenIdx.has(i)) { pillar(w, px, pz, 0, h * rng.range(0.35, 0.6), 0.85, null, { broken: true }); P().rubble(w, px + 1, 0, pz + 1, rng, 0.8); }
      else pillar(w, px, pz, 0, h, 0.85);
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
      // (the corbels in the opening's corners and the wall over it stop you as they did; what is drawn is an arch of wedge stones springing
      // from the jambs at 3.4 m, the wall over it laid round its back: archDraw)
      hard(w, 'trim', a, 3.4, z0 - 0.08, a + 0.7, 3.8, z1 + 0.08); hard(w, 'trim', b - 0.7, 3.4, z0 - 0.08, b, 3.8, z1 + 0.08);
      hard(w, 'block', a, 3.8, z0, a + 1.3, 4.25, z1); hard(w, 'block', b - 1.3, 3.8, z0, b, 4.25, z1);
      hard(w, 'block', a, 4.25, z0, a + 1.8, 4.7, z1); hard(w, 'block', b - 1.8, 4.25, z0, b, 4.7, z1);
      hard(w, 'wall', a, 4.7, z0, b, H, z1);
      { const ay = w._atY || 0, m = (a + b) / 2; _tagged('arches', () => archDraw(w, mason(w), (u, y, d) => [m + u, y + ay, z0 - 0.08 + d], (b - a) / 2, 3.4, 2.0, T + 0.16, H, { fill: 'wall', out: (b - a) / 2 })); }
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
    const gxs = opts.noExits ? [] : LG.gateXs(W, opts.gates || 1); // noExits: the last area of a run has no door onward, just wall
    // opts.walls === false: a field that draws its own bounds (cliffs, cave rock, the void) gets no walls round the area, only the entrance
    // gate and the exits, each set in a short stretch of wall (opts.stub: how far it runs either side of the opening, default 4.5 m)
    const bare = opts.walls === false, stub = opts.stub ?? 4.5;
    // opts.notches (strata fields): [{side: 'N' | 'S' | 'W' | 'E', a0, a1, y0, y1}] niches carved out of a wall, from its inner face to the outside
    // (a0..a1: the extent along the wall, x for N / S, z for W / E)
    const nts = opts.notches || [];
    // the kind of enclosure (wallKind): what the walls are drawn as. The cemetery's and the village's walls are drawn stone by stone
    // (dressWalls): their boxes only stop you. The others are drawn as the boxes they are, dressed by dressWalls with what a wall has
    const K = wallKind(w), own = K === 'cemetery' || K === 'village', faces = [], bts = [];
    const wbox = (side, x0, y0, z0, x1, y1, z1, a, b) => { faces.push({ side, a0: a, a1: b, y0, y1 }); return own ? hard(w, 'block', x0, y0, z0, x1, y1, z1) : w.solid('block', x0, y0, z0, x1, y1, z1, { uv: 4 }); };
    const wallBlock = (side, xa, xb, ya, yb) => {
      const alongX = side === 'N' || side === 'S';
      const t0 = side === 'N' ? -WALL_T : side === 'S' ? D : side === 'W' ? -WALL_T : W, t1 = t0 + WALL_T;
      const box = (a, b, y0, y1) => (alongX ? wbox(side, a, y0, t0, b, y1, t1, a, b) : wbox(side, t0, y0, a, t1, y1, b, a, b));
      const hit = nts.filter((n) => n.side === side && n.a1 > xa && n.a0 < xb && n.y1 > ya && n.y0 < yb);
      const xs = [xa, xb];
      for (const n of hit) xs.push(Math.max(xa, Math.min(xb, n.a0)), Math.max(xa, Math.min(xb, n.a1)));
      const ux = [...new Set(xs)].sort((p, q) => p - q);
      for (let i = 0; i < ux.length - 1; i++) {
        const a = ux[i], b = ux[i + 1], m = (a + b) / 2;
        const cuts = hit.filter((n) => n.a0 < m && n.a1 > m).map((n) => [Math.max(n.y0, ya), Math.min(n.y1, yb)]).sort((p, q) => p[0] - q[0]);
        let y = ya;
        for (const [c0, c1] of cuts) { if (c0 > y) box(a, b, y, c0); y = Math.max(y, c1); }
        if (yb > y) box(a, b, y, yb);
      }
    };
    // south wall (z = D..D+T) — the sky island is open on the south/east/west edges
    if (bare) {
      const sy = opts.southY || 0;
      wallBlock('S', W / 2 - 4.6 - stub, W / 2 + 4.6 + stub, Math.min(0, sy) - 1, sy + H);
      for (const gx of gxs) {
        wallBlock('N', gx - 2.5 - stub, gx - 2.5, 0, H);
        wallBlock('N', gx - 2.5, gx + 2.5, gh, H);
        wallBlock('N', gx + 2.5, gx + 2.5 + stub, 0, H);
      }
    } else {
    if (OUT !== 'sky') wallBlock('S', -WALL_T, W + WALL_T, 0, H);
    // north wall with one or more exit openings
    // (opts.openNorth: the last guardian's field has no north wall at all: the void runs on to the giant across it)
    let wx = -WALL_T;
    for (const gx of gxs) {
      wallBlock('N', wx, gx - 2.5, 0, H);
      wallBlock('N', gx - 2.5, gx + 2.5, gh, H);
      wx = gx + 2.5;
    }
    if (!opts.openNorth) wallBlock('N', wx, W + WALL_T, 0, H);
    // west / east (a void arena only keeps them along the road)
    const sideZ0 = opts.voidArena ? opts.arenaD : 0;
    if (OUT !== 'sky') {
      // side walls; opts.windows = [[z0, z1, y0, y1], ...] leaves barred openings in both
      const wins = opts.windows || [];
      const sideWall = (xa, xb) => {
        let z = sideZ0;
        const sd = xa < 0 ? 'W' : 'E';
        for (const [a, b, y0, y1] of wins) { wbox(sd, xa, 0, z, xb, H, a, z, a); wbox(sd, xa, 0, a, xb, y0, b, a, b); wbox(sd, xa, y1, a, xb, H, b, a, b); z = b; }
        wallBlock(xa < 0 ? 'W' : 'E', z, D, 0, H);
      };
      sideWall(-WALL_T, 0); sideWall(W, W + WALL_T);
    }
    if (!OUT) {
      // upper cave rock band (not grapplable) - visually distinct
      for (const [a, b, c, d] of [[-WALL_T, -WALL_T, W + WALL_T, 0], [-WALL_T, D, W + WALL_T, D + WALL_T], [-WALL_T, sideZ0, 0, D], [W, sideZ0, W + WALL_T, D]]) w.solid('rock', a, H, b, c, TOP, d, { uv: 6, noGrapple: true, grad: false });
    } else if (OUT === 'ruins') {
      // crenellated city walls under an open sky
      const mer = (x0, z0, x1, z1) => { const c = hard(w, 'block', x0, H, z0, x1, H + 1.0, z1, { noGrapple: true }); if (c && !own) (w._mers || (w._mers = [])).push(c); return c; };   // (a cemetery's or a village's wall has no parapet: its boxes are left undrawn)
      for (let x = -WALL_T + 0.3; x < W + WALL_T - 1; x += 1.8) { if (!opts.openNorth) mer(x, -WALL_T, x + 0.9, -WALL_T + 0.7); mer(x, D + WALL_T - 0.7, x + 0.9, D + WALL_T); }
      for (let z = 0.3; z < D - 1; z += 1.8) { mer(-WALL_T, z, -WALL_T + 0.7, z + 0.9); mer(W + WALL_T - 0.7, z, W + WALL_T, z + 0.9); }
    } else {
      // sky island: the temple facade on the north gets a golden crest
      w.solid('trim', -WALL_T, H, -WALL_T, W + WALL_T, H + 0.6, 0, { uv: 2, noGrapple: true });
      // open edges guarded by a low balustrade (the edge of the world is unmistakable)
      // (opts.noBal: islands over the void keep no rail along the area's edge; opts.balD: the rail ends there — a guardian's island, its road a bridge)
      // (drawn as a balustrade, balustrade(); the box of its old coping kept in w.visBoxes, for what reads them - areas.js, the signs)
      const bal = (x0, z0, x1, z1) => { hard(w, 'block', x0, 0, z0, x1, 0.95, z1); balustrade(w, x0, z0, x1, z1, 0.95, { toward: [W / 2, D / 2], posts: 4 }); if (w.visBoxes) w.visBoxes.push([x0 - 0.04, 0.95, z0 - 0.04, x1 + 0.04, 1.02, z1 + 0.04]); };
      const bz = opts.balD ?? D;
      if (!opts.noBal) {
        bal(0, 0, 0.4, bz); bal(W - 0.4, 0, W, bz); if (!opts.balD) { bal(0, D - 0.4, W / 2 - 4.4, D); bal(W / 2 + 4.4, D - 0.4, W, D); }
        for (let z = 4; z < bz - 2; z += 4) { w.solid('block', -0.05, 0, z - 0.3, 0.45, 1.3, z + 0.3, { uv: 1 }); w.solid('block', W - 0.45, 0, z - 0.3, W + 0.05, 1.3, z + 0.3, { uv: 1 }); }
      }
    }
    // buttresses + torches (their boxes as they were; what is drawn of them is the kind's: a pilaster with its base and capital
    // indoors, a buttress with its sloped weathering out of doors, dressWalls)
    const butt = (x, z, side) => {
      const bw = 0.7, bd = 0.9, bh = H - 2.5, sh = own ? (m, ...a) => hard(w, m, ...a) : (m, ...a) => w.solid(m, ...a, { uv: 3 }), cap = (...a) => hard(w, 'trim', ...a);
      bts.push({ side, a: side === 'W' || side === 'E' ? z : x, bh });
      if (side === 'W') { sh('wall', 0, 0, z - bw, bd, bh, z + bw); cap(0, bh, z - bw - 0.05, bd + 0.08, bh + 0.35, z + bw + 0.05); }
      if (side === 'E') { sh('wall', W - bd, 0, z - bw, W, bh, z + bw); cap(W - bd - 0.08, bh, z - bw - 0.05, W, bh + 0.35, z + bw + 0.05); }
      if (side === 'S') { sh('wall', x - bw, 0, D - bd, x + bw, bh, D); cap(x - bw - 0.05, bh, D - bd - 0.08, x + bw + 0.05, bh + 0.35, D); }
      if (side === 'N') { sh('wall', x - bw, 0, 0, x + bw, bh, bd); cap(x - bw - 0.05, bh, 0, x + bw + 0.05, bh + 0.35, bd + 0.08); }
    };
    const sp = 8;
    for (let z = sp; z < D - 2; z += sp) {
      if (opts.voidArena && z < opts.arenaD + 2) continue;
      if (OUT === 'sky') { if (z % 16 === 0 && !opts.noBal && z < (opts.balD ?? D)) { P().brazier(w, 1.4, 0, z, 1); P().brazier(w, W - 1.4, 0, z, 1); } continue; }
      const sNot = (side, zz, r) => nts.some((n) => n.side === side && zz + r > n.a0 && zz - r < n.a1); // strata: no buttress / torch / banner where a room is dug into the wall
      if (!sNot('W', z, 0.8)) butt(0, z, 'W');
      if (!sNot('E', z, 0.8)) butt(0, z, 'E');
      if (!sNot('W', z - sp / 2, 0.3)) P().torch(w, 0, 3.3, z - sp / 2, 'px');
      if (!sNot('E', z - sp / 2, 0.3)) P().torch(w, W, 3.3, z - sp / 2, 'nx');
      if (rng.chance(0.25) && !sNot('W', z - sp / 2, 1.5)) P().banner(w, 0, Math.min(8.5, H - 1), z - sp / 2, 'px', Math.min(4, H - 3));
      if (rng.chance(0.25) && !sNot('E', z - sp / 2, 1.5)) P().banner(w, W, Math.min(8.5, H - 1), z - sp / 2, 'nx', Math.min(4, H - 3));
    }
    for (let x = sp; x < W - 2; x += sp) {
      const notched = (side, xx, r) => nts.some((n) => n.side === side && xx + r > n.a0 && xx - r < n.a1); // strata: no buttress or torch where a room is dug into the wall
      if (Math.abs(x - W / 2) > 5 && OUT !== 'sky' && !notched('S', x, 0.8)) butt(x, 0, 'S');
      if (gxs.every((g) => Math.abs(x - g) > 5.2) && !notched('N', x, 0.8) && !opts.openNorth) butt(x, 0, 'N');
      if (Math.abs(x - sp / 2 - W / 2) > 4 && OUT !== 'sky' && !notched('S', x - sp / 2, 0.3)) P().torch(w, x - sp / 2, 3.3 + (opts.southY || 0), D, 'nz');
      if (gxs.every((g) => Math.abs(x - sp / 2 - g) > 4.8) && !notched('N', x - sp / 2, 0.3) && !opts.openNorth) P().torch(w, x - sp / 2, 3.3, 0, 'pz');
    }
    } // (end of the walls: a bare perimeter skips everything above)
    { const tg = LG._tag; LG._tag = 'walls'; try { dressWalls(w, mason(w), K, { W, D, H, TOP, faces, bts, gxs, opts, bare, sideZ0: opts.voidArena ? opts.arenaD : 0, wins: opts.windows || [] }); } finally { LG._tag = tg; } }
    // entrance gate (decorative, closed portcullis on the south wall)
    // the entrance gate sits on whatever ground the south end has (boss roads start far below)
    gateFrame(w, W / 2, D, 'S', opts.southY || 0, OUT === 'sky');
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
      // (an exit opened at once - a room's, as you come in - has its portcullis up at once: it stayed down until the next frame lifted it,
      // a grille across a way already open, nothing behind it to stop you)
      { let ot = 0; Object.defineProperty(exit, 'openT', { get: () => ot, set: (v) => { ot = v; if (v >= 1.99 && exit.portcullis) exit.portcullis.position.y = 5.6; }, enumerable: true, configurable: true }); }
      exit.col = w.addCollider(gx0, 0, -0.35, gx1, gh, 0.05, { surf: 'metal', tag: 'portcullis' });
      w.deferred.push((grp) => {
        const pc = portcullis(w, gx1 - gx0, gh); pc.position.set(gx, exit.open && exit.openT >= 1.99 ? 5.6 : 0, -0.15); grp.add(pc); exit.portcullis = pc;
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
  // an iron bar of a railing with its spear point (a three-sided rod 1.62 m and a point; made once): positions, normals
  let _barGeo = null;
  const barGeo = () => {
    if (_barGeo) return _barGeo;
    const P = [], N = [], r = 0.017, L = 1.62, tip = 1.8, ring = (y, rr) => [0, 1, 2].map((i) => [Math.cos(i * 2.094 + 0.52) * rr, y, Math.sin(i * 2.094 + 0.52) * rr]);
    const tri = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3; if (n[0] * mx + n[2] * mz < 0) { n = n.map((x) => -x); [b, c] = [c, b]; } const l = Math.hypot(...n) || 1; for (const p of [a, b, c]) { P.push(...p); N.push(n[0] / l, n[1] / l, n[2] / l); } };
    const r0 = ring(0, r), r1 = ring(L, r), r2 = ring(L + 0.04, r * 2.3), t = [0, tip, 0];
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(r0[i], r0[j], r1[j]); tri(r0[i], r1[j], r1[i]); tri(r2[i], r2[j], t); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return (_barGeo = g);
  };
  // the cemetery's wall: a stone wall to 2.45 m with its coping, piers to 4.15 m with their caps, railings with spear points between
  // them on the coping, the buttresses with their weathering; every so often a wall tomb (the wall raised under a gable, an arched niche,
  // a tablet); the ground running on outside. The box behind it all (WALL_T thick, the wall's height) only stops you.
  function cemeteryWall(w, M, T, side, runs, bs, X) {
    const { hx, prof, frus, along, hs, cut, tnt, og, ax } = X, lo = M.lo, Hh = Math.max(2.6, Math.min(X.H, 4.6)), WH = Math.min(2.45, Hh * 0.53), PH = Hh - 0.45;
    const vis = (a0, y0, d0, a1, y1, d1, mk, uv) => { const p = T(a0, y0, d0), q = T(a1, y1, d1); w.visual(mk || 'block', Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2]), { uv: uv || 2.5 }); if (y0 < 0.05 && d1 > 0.005) { const r = T(a0, y0, 0); M.foot(r[0], r[1], r[2], q[0], q[1], q[2]); } };
    const o = (a, y, k, f, extra) => og(0, Hh, Object.assign({ tint: tnt(a, y, k, f), n: 0.007, chip: 0.25, chipS: 0.06 }, extra));
    const bar = barGeo(), mtx = new THREE.Matrix4(), sc = new THREE.Matrix4(), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1), dC = -0.36, ob = { tint: [0.45, 0.42, 0.4], world: true, gy: 0, one: true };
    for (const [a0, a1] of runs) {
      // the wall tombs along this run (by the place), and where the piers stand
      // (the piers stand where the buttresses and the torches do, every 4 m: 8k on a buttress, 8k + 4 with a torch on it; a tomb now and
      // then in a bay between, 8k + 2 or 8k + 6)
      const tombs = [];
      for (let t = Math.ceil((a0 - 2) / 4) * 4 + 2; t < a1 - 1.8; t += 4) if (t > a0 + 1.8 && hs(t, side.charCodeAt(0), 60) < 0.2 && !tombs.some((u) => t - u < 12)) tombs.push(t);
      const busy = tombs.map((t) => [t - 1.62, t + 1.62]);
      vis(a0, 0, -0.72, a1, WH, 0);
      // (the coping: a stone gone here and there, the wall's top showing)
      along(a0, a1, 0.8, 1.3, 62, (s0, s1) => hs(s0, 3, 74) < 0.06 ? null : hx(T, 'trim', [[s0, WH - 0.02, -0.8], [s1, WH - 0.02, -0.8], [s0, WH + 0.22, -0.44], [s1, WH + 0.22, -0.44], [s0, WH - 0.02, 0.08], [s1, WH - 0.02, 0.08], [s0, WH + 0.22, -0.28], [s1, WH + 0.22, -0.28]], 0.02, o(s0, WH, 63, 0.95)));
      // the piers: at the ends of the run and every 3.4 - 3.9 m, not on a buttress or a tomb
      const piers = [a0 + 0.34, a1 - 0.34];
      for (let p = Math.ceil(a0 / 4) * 4; p < a1; p += 4) if (p > a0 + 1.0 && p < a1 - 1.0) piers.push(p);
      for (const t of tombs) piers.push(t - 1.62, t + 1.62);
      piers.sort((p, q) => p - q);
      for (const p of piers) {
        // (now and then a pier has lost its cap, its top broken lower)
        if (hs(p, 4, 75) < 0.1) { vis(p - 0.32, 0, -0.68, p + 0.32, PH - 0.12 - 0.25 * hs(p, 5, 76), 0.06); continue; }
        vis(p - 0.32, 0, -0.68, p + 0.32, PH, 0.06);
        frus(T, 'trim', p - 0.42, p + 0.42, 0.16, PH - 0.02, p - 0.42, p + 0.42, 0.16, PH + 0.16, -0.8, 0.02, o(p, PH, 64));
        hx(T, 'trim', [[p - 0.38, PH + 0.16, -0.76], [p + 0.38, PH + 0.16, -0.76], [p - 0.07, PH + 0.52, -0.38], [p + 0.07, PH + 0.52, -0.38], [p - 0.38, PH + 0.16, 0.12], [p + 0.38, PH + 0.16, 0.12], [p - 0.07, PH + 0.52, -0.24], [p + 0.07, PH + 0.52, -0.24]], 0.02, o(p, PH, 65));
      }
      // the railings: from pier to pier along the coping, unless a buttress or a tomb is between them
      for (let i = 0; i + 1 < piers.length; i++) {
        const p = piers[i] + 0.34, q = piers[i + 1] - 0.34; if (q - p < 0.4 || busy.some(([b0, b1]) => b1 > p + 0.05 && b0 < q - 0.05)) continue;
        const y0 = WH + 0.16, n = Math.max(2, Math.round((q - p) / 0.15)), k = (PH - 0.1 - y0) / 1.62;
        // (a bay here and there with bars gone and bars bent: by the place)
        const bad = hs(p, 6, 77) < 0.16;
        for (let j = 0; j <= n; j++) {
          const u = p + 0.06 + (q - p - 0.12) * j / n, c = T(u, y0, dC), hb = hs(u, 7, 78);
          if (bad && hb < 0.3) continue;
          const bend = bad && hb < 0.55 ? (hb - 0.42) * 0.9 : 0;
          mtx.makeRotationAxis(ax ? XA : ZA, bend).multiply(sc.makeScale(1, k, 1)).setPosition(c[0], c[1], c[2]);
          M.geo('iron', bar, mtx, ob);
        }
        for (const yy of [y0 + 0.22, PH - 0.42]) { const pa = T(p, yy, dC - 0.025), pb = T(q, yy + 0.05, dC + 0.025); M.box('iron', Math.min(pa[0], pb[0]), pa[1], Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), pb[1], Math.max(pa[2], pb[2]), 0, { tint: [0.42, 0.4, 0.38] }); }
      }
      // the buttresses: their shafts (the box is not drawn) and sloped weatherings
      for (const q of bs) if (q.a > a0 - 0.1 && q.a < a1 + 0.1) {
        vis(q.a - 0.7, 0, 0, q.a + 0.7, q.bh, 0.9);
        frus(T, 'trim', q.a - 0.76, q.a + 0.76, 1.0, q.bh - 0.12, q.a - 0.76, q.a + 0.76, 1.0, q.bh + 0.03, -0.04, 0.02, o(q.a, q.bh, 66));
        frus(T, 'trim', q.a - 0.72, q.a + 0.72, 0.94, q.bh + 0.03, q.a - 0.72, q.a + 0.72, 0.1, Math.min(WH + 0.3, q.bh + 0.95), -0.04, 0.03, o(q.a, q.bh, 67));
      }
      // the wall tombs: the wall raised under a gable, an arched niche, a tablet
      for (const t of tombs) {
        const TH = Math.min(Hh - 1.2, 3.3);
        vis(t - 1.3, 0, -0.72, t + 1.3, TH, 0.14);
        hx(T, 'block', [[t - 1.3, TH - 0.01, -0.72], [t + 1.3, TH - 0.01, -0.72], [t - 0.03, TH + 0.72, -0.72], [t + 0.03, TH + 0.72, -0.72], [t - 1.3, TH - 0.01, 0.14], [t + 1.3, TH - 0.01, 0.14], [t - 0.03, TH + 0.72, 0.14], [t + 0.03, TH + 0.72, 0.14]], 0.01, o(t, TH, 68));
        for (const s2 of [-1, 1]) hx(T, 'trim', [[t + s2 * 1.46, TH - 0.06, -0.8], [t, TH + 0.68, -0.8], [t + s2 * 1.46, TH + 0.16, -0.8], [t, TH + 0.92, -0.8], [t + s2 * 1.46, TH - 0.06, 0.22], [t, TH + 0.68, 0.22], [t + s2 * 1.46, TH + 0.16, 0.22], [t, TH + 0.92, 0.22]], 0.02, o(t + s2, TH, 69));
        // (the niche: dark within, a ring of wedge stones over it, its jambs)
        const nr = 0.46, ny = 1.95;
        hx(T, 'dark', [[t - nr, 0.62, 0.145], [t + nr, 0.62, 0.145], [t - nr, ny, 0.145], [t + nr, ny, 0.145], [t - nr, 0.62, 0.15], [t + nr, 0.62, 0.15], [t - nr, ny, 0.15], [t + nr, ny, 0.15]], 0, {});
        for (let j = 0; j < 7; j++) {
          const b0 = Math.PI * j / 7, b1 = Math.PI * (j + 1) / 7, c0 = Math.cos(b0), s0 = Math.sin(b0), c1 = Math.cos(b1), s1 = Math.sin(b1);
          hx(T, 'dark', [[t + c0 * 0.02, ny, 0.145], [t + c1 * 0.02, ny, 0.145], [t + c0 * nr, ny + s0 * nr, 0.145], [t + c1 * nr, ny + s1 * nr, 0.145], [t + c0 * 0.02, ny, 0.15], [t + c1 * 0.02, ny, 0.15], [t + c0 * nr, ny + s0 * nr, 0.15], [t + c1 * nr, ny + s1 * nr, 0.15]], 0, {});
          const R1 = nr + 0.2 + (j === 3 ? 0.06 : 0);
          hx(T, 'trim', [[t + c0 * nr, ny + s0 * nr, 0.12], [t + c1 * nr, ny + s1 * nr, 0.12], [t + c0 * R1, ny + s0 * R1, 0.12], [t + c1 * R1, ny + s1 * R1, 0.12], [t + c0 * nr, ny + s0 * nr, 0.2], [t + c1 * nr, ny + s1 * nr, 0.2], [t + c0 * R1, ny + s0 * R1, 0.2], [t + c1 * R1, ny + s1 * R1, 0.2]], 0.015, o(t + j, ny, 70));
        }
        for (const s2 of [-1, 1]) prof(T, 'trim', s2 < 0 ? t - nr - 0.2 : t + nr, s2 < 0 ? t - nr : t + nr + 0.2, 0.5, 0.12, 0.2, ny, 0.12, 0.2, 0.015, o(t + s2, 1, 71));
        prof(T, 'trim', t - nr - 0.3, t + nr + 0.3, 0.42, 0.1, 0.24, 0.62, 0.1, 0.24, 0.015, o(t, 0.5, 72));
        prof(T, 'trim', t - 0.5, t + 0.5, ny + 0.9, 0.13, 0.17, Math.min(TH - 0.15, ny + 1.25), 0.13, 0.17, 0.012, o(t, 3, 73, 1.08, { chip: 0.05 }));
      }
      // the ground outside, running on from the wall's back down to the country (the area's ground far out lies 0.6 m lower)
      M.quad('floor', T(a0, -0.02, -0.7), T(a1, -0.02, -0.7), T(a1, -0.62, -16), T(a0, -0.62, -16), { n: [0, 1, 0], uv: 4, gy: -5 });
    }
  }
  // a stake of a palisade, 1 m (scaled to its height): a six-sided pole, its top cut to a point; positions, normals, uv (made once)
  let _stakeGeo = null;
  const stakeGeo = () => {
    if (_stakeGeo) return _stakeGeo;
    const g = new THREE.CylinderGeometry(0.0001, 1, 0.1, 6, 1, true); g.translate(0, 0.95, 0);
    const b = new THREE.CylinderGeometry(1, 1, 0.9, 6, 1, true); b.translate(0, 0.45, 0);
    const P = [], N = [], U = [];
    for (const q of [b, g]) { const n = q.toNonIndexed(); n.computeVertexNormals(); P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array); U.push(...n.attributes.uv.array); }
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return (_stakeGeo = o);
  };
  // the village's edge: bay by bay (8 m, buttress to buttress, its torch in the middle) the back of a house under its roof, a garden
  // wall of field stone with a thicket grown up behind it, or a palisade of stakes. The box behind (4.2 m) only stops you
  function villageWall(w, M, T, side, runs, bs, X) {
    const { hx, prof, frus, along, hs, tnt, og } = X, lo = M.lo;
    const vis = (a0, y0, d0, a1, y1, d1, mk, uv, tint) => { const p = T(a0, y0, d0), q = T(a1, y1, d1); w.visual(mk || 'block', Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2]), { uv: uv || 2.5, tint }); if (y0 < 0.05 && d1 > 0.005) { const r = T(a0, y0, 0); M.foot(r[0], r[1], r[2], q[0], q[1], q[2]); } };
    const o = (a, y, k, f, extra) => og(0, 5, Object.assign({ tint: tnt(a, y, k, f), n: 0.012, chip: 0.35, chipS: 0.07 }, extra));
    const sk = stakeGeo(), mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (const [a0, a1] of runs) {
      for (let b0 = Math.floor(a0 / 8) * 8; b0 < a1; b0 += 8) {
        const s0 = Math.max(a0, b0), s1 = Math.min(a1, b0 + 8); if (s1 - s0 < 0.4) continue;
        const r = hs(b0 + 4, side.charCodeAt(0), 80), kind = r < 0.45 ? 'house' : r < 0.78 ? 'garden' : 'pal', mid = b0 + 4;
        if (kind === 'house') {
          // the back wall of a house, its eaves over the lane, the roof going up and back to the ridge, a gable at each end, a shuttered window
          const eav = 4.5 + 0.8 * hs(b0, 1, 81), ridge = eav + 2.3 + 0.5 * hs(b0, 2, 82), dR = -3.4, ov = 0.5;
          vis(s0 + 0.04, 0, -0.62, s1 - 0.04, eav, 0, 'wall', 2.2);
          const rf = (u0, u1) => hx(T, 'woodDark', [[u0, eav - 0.18, ov], [u1, eav - 0.18, ov], [u0, ridge - 0.02, dR], [u1, ridge - 0.02, dR], [u0, eav - 0.02, ov], [u1, eav - 0.02, ov], [u0, ridge + 0.14, dR], [u1, ridge + 0.14, dR]], 0.02, o(u0, eav, 83, 0.62, { uv: 0.7, n: 0.02, chip: 0 }));
          along(s0 - 0.25, s1 + 0.25, 1.6, 2.6, 84, (u0, u1) => rf(u0, u1));
          hx(T, 'woodDark', [[s0 - 0.3, eav - 0.36, ov - 0.05], [s1 + 0.3, eav - 0.36, ov - 0.05], [s0 - 0.3, eav - 0.12, ov - 0.05], [s1 + 0.3, eav - 0.12, ov - 0.05], [s0 - 0.3, eav - 0.36, ov + 0.06], [s1 + 0.3, eav - 0.36, ov + 0.06], [s0 - 0.3, eav - 0.12, ov + 0.06], [s1 + 0.3, eav - 0.12, ov + 0.06]], 0.015, o(s0, eav, 85, 0.7, { chip: 0 }));
          for (const g of [s0, s1]) { const gu = g === s0 ? s0 + 0.04 : s1 - 0.48; hx(T, 'wall', [[gu, eav - 0.02, -0.62], [gu + 0.44, eav - 0.02, -0.62], [gu, ridge - 0.04, dR - 0.03], [gu + 0.44, ridge - 0.04, dR - 0.03], [gu, eav - 0.02, 0], [gu + 0.44, eav - 0.02, 0], [gu, ridge - 0.04, dR + 0.03], [gu + 0.44, ridge - 0.04, dR + 0.03]], 0.02, o(gu, eav, 86, 1, { uv: 2.2, uvFix: true })); }
          if (s1 - s0 > 3.4) {
            const wu = s0 + 1.2 + (s1 - s0 - 3.6) * hs(b0, 3, 87), wy = 2.0;
            hx(T, 'dark', [[wu, wy, 0.004], [wu + 0.8, wy, 0.004], [wu, wy + 0.95, 0.004], [wu + 0.8, wy + 0.95, 0.004], [wu, wy, 0.012], [wu + 0.8, wy, 0.012], [wu, wy + 0.95, 0.012], [wu + 0.8, wy + 0.95, 0.012]], 0, {});
            prof(T, 'woodDark', wu - 0.22, wu + 1.02, wy + 0.95, -0.05, 0.08, wy + 1.13, -0.05, 0.08, 0.015, o(wu, wy, 88, 0.7, { chip: 0 }));
            prof(T, 'trim', wu - 0.08, wu + 0.88, wy - 0.12, -0.05, 0.1, wy, -0.05, 0.08, 0.015, o(wu, wy, 89, 0.85));
            // (a shutter hanging open, a little askew)
            hx(T, 'woodDark', [[wu - 0.48, wy + 0.04, 0.03], [wu - 0.06, wy + 0.02, 0.07], [wu - 0.48, wy + 0.92, 0.03], [wu - 0.06, wy + 0.93, 0.07], [wu - 0.48, wy + 0.04, 0.07], [wu - 0.06, wy + 0.02, 0.11], [wu - 0.48, wy + 0.92, 0.07], [wu - 0.06, wy + 0.93, 0.11]], 0.012, o(wu, wy, 90, 0.75, { chip: 0, uv: 0.8 }));
          }
          if (hs(b0, 4, 91) < 0.4) { const cu = s0 + 1 + (s1 - s0 - 2) * hs(b0, 5, 92), dc = -1.6, yr = eav + (ridge - eav) * (ov - dc) / (ov - dR); vis(cu - 0.42, yr - 0.5, dc - 0.42, cu + 0.42, ridge + 1.1, dc + 0.42, 'wall', 1.6); prof(T, 'trim', cu - 0.5, cu + 0.5, ridge + 1.1, dc - 0.5, dc + 0.5, ridge + 1.24, dc - 0.5, dc + 0.5, 0.015, o(cu, ridge, 93, 0.8)); }
        } else if (kind === 'garden') {
          // a wall of field stone, its top of stones set on edge, the thicket grown up behind it over the box; a pier for the torch
          const gh = 1.5 + 0.35 * hs(b0, 6, 94);
          vis(s0, 0, -0.6, s1, gh, 0, 'block', 1.4, [0.78, 0.76, 0.72]);
          along(s0, s1, 0.18, 0.34, 95, (u0, u1, i) => { const hh = 0.18 + 0.16 * hs(u0, i, 96), lean = (hs(u0, i, 97) - 0.5) * 0.08; hx(T, 'trim', [[u0, gh - 0.02, -0.58], [u1, gh - 0.02, -0.58], [u0 + lean, gh + hh, -0.54], [u1 + lean, gh + hh, -0.54], [u0, gh - 0.02, 0.02], [u1, gh - 0.02, 0.02], [u0 + lean, gh + hh, -0.04], [u1 + lean, gh + hh, -0.04]], 0.02, o(u0, gh, 98, 0.8, { n: 0.02, uv: 0.8 })); });
          if (mid > s0 + 0.5 && mid < s1 - 0.5) { vis(mid - 0.34, 0, -0.62, mid + 0.34, 3.7, 0.08, 'block', 1.4, [0.78, 0.76, 0.72]); hx(T, 'trim', [[mid - 0.42, 3.68, -0.72], [mid + 0.42, 3.68, -0.72], [mid - 0.1, 4.0, -0.38], [mid + 0.1, 4.0, -0.38], [mid - 0.42, 3.68, 0.16], [mid + 0.42, 3.68, 0.16], [mid - 0.1, 4.0, -0.18], [mid + 0.1, 4.0, -0.18]], 0.02, o(mid, 3.7, 99)); }
          if (!M.mat.leafcard) { const TM = treeMats(w); M.mat.leafcard = TM.leaf; M.mat.twigcard = TM.twig; }
          const i0 = T(0, 0, 0), i1 = T(0, 0, 1), inX = i1[0] - i0[0], inZ = i1[2] - i0[2];
          for (let u = s0 + 0.2; u < s1 - 0.1; u += 0.5 + 0.35 * hs(u, 7, 100)) for (let k = 0; k < 3; k++) {
            // (cards of leaves in layers, the farther higher; now and then a card of bare bramble stems among them)
            const hh = 2.2 + 1.2 * k + 1.0 * hs(u, k, 101), dd = -0.75 - 0.75 * k - 0.6 * hs(u, k + 2, 102), wd = 1.5 + 1.3 * hs(u, k + 4, 103), an = (hs(u, k + 6, 104) - 0.5) * 1.8, y0 = Math.max(-0.1, hh - wd * 1.6);
            const ca = Math.cos(an) * wd / 2, sa = Math.sin(an) * wd / 2, tw = hs(u, k + 8, 105) < 0.18, q = tw ? 3 : hs(u, k + 9, 106) < 0.5 ? 0 : 1;
            const ns = (hs(u, k + 10, 107) - 0.5) * 0.8, nr0 = [inX * 0.7 + inZ * ns, 0.55, inZ * 0.7 - inX * ns], nl = Math.hypot(...nr0), nrm = [nr0[0] / nl, nr0[1] / nl, nr0[2] / nl], v = 0.8 + 0.25 * hs(u, k + 11, 108);
            M.quad(tw ? 'twigcard' : 'leafcard', T(u - ca, y0, dd - sa), T(u + ca, y0, dd + sa), T(u + ca, hh, dd + sa), T(u - ca, hh, dd - sa), { uvq: [(q % 2) * 0.5 + 0.004, (q >> 1) * 0.5 + 0.004, (q % 2) * 0.5 + 0.496, (q >> 1) * 0.5 + 0.496], nrm, gy: -1, tint: [v, v, v] });
          }
        } else {
          // the palisade: stakes driven side by side, their tops cut to points, two rails behind; a stake fallen out here and there
          for (let u = s0 + 0.13; u < s1 - 0.1; u += 0.25) {
            // (one here and there broken off short: none quite gone, the box behind stops you there all the same)
            const h0 = hs(u, 8, 105);
            const hh = (h0 < 0.1 ? 2.0 + h0 * 8 : 3.6 + 0.7 * hs(u, 9, 106)), rr = 0.135 + 0.03 * hs(u, 10, 107), c = T(u, 0, -0.16);
            e3.set((hs(u, 11, 108) - 0.5) * 0.06, hs(u, 12, 109) * 3, (hs(u, 13, 110) - 0.5) * 0.06); q4.setFromEuler(e3);
            if (!M.mat.stake) M.mat.stake = treeMats(w).dead;   // (logs, their weathered bark: the dead trees' own)
            mtx.compose(v3.set(c[0], -0.05, c[2]), q4, s3.set(rr, hh, rr)); M.geo('stake', sk, mtx, { tint: tnt(u, 1, 111, 0.7), su: 1, sv: hh * 0.9, gy: 0, one: true });
          }
          for (const yy of [1.0, 2.9]) prof(T, 'woodDark', s0, s1, yy, -0.5, -0.3, yy + 0.16, -0.5, -0.3, 0.02, o(s0, yy, 112, 0.7, { chip: 0, uv: 1 }));
        }
      }
      // the buttresses: rough piers of field stone with their weatherings
      for (const q of bs) if (q.a > a0 - 0.1 && q.a < a1 + 0.1) {
        vis(q.a - 0.7, 0, 0, q.a + 0.7, q.bh, 0.9, 'block', 1.4, [0.8, 0.78, 0.74]);
        frus(T, 'trim', q.a - 0.72, q.a + 0.72, 0.94, q.bh - 0.02, q.a - 0.72, q.a + 0.72, 0.1, q.bh + 0.8, -0.04, 0.03, o(q.a, q.bh, 113, 0.72));
      }
      M.quad('floor', T(a0, -0.02, -0.6), T(a1, -0.02, -0.6), T(a1, -0.62, -16), T(a0, -0.62, -16), { n: [0, 1, 0], uv: 4, gy: -5 });
    }
  }
  // ---------------- what a wall has (dressWalls) ----------------
  // A.faces: what of each side's inner face stands ({side, a0, a1, y0, y1}; a along the side: x for N / S, z for W / E), A.bts: the
  // buttresses ({side, a, bh}). Nothing here stops anyone: it is all drawn on or against the boxes that do (the cemetery's and the
  // village's walls are drawn here whole, their boxes left undrawn). By kind (wallKind):
  //   hall, crypt  a battered plinth, the buttresses as pilasters (a moulded base, a capital, a flat strip on up to the cornice), a
  //                string course, a corbel table under a moulded cornice where the wall meets the ceiling or the rock, patches of
  //                later repair in other stone
  //   works        the same in brick, an iron wall plate under the cornice;   sky  the pilasters and a cornice of marble
  //   cavern       a plinth, buttresses with sloped weatherings, rough capping stones where the cavern's rock begins
  //   fort         a plinth, buttresses with weatherings, a string course, the wall walk carried out on corbels, the parapet
  //                of merlons (some broken, some gone), patches
  //   rock, mine   the stretches of wall about the gates: a rough plinth, rough capping
  //   cemetery     a stone wall to 2.5 m with its coping, stone piers with caps, iron railings with spear points between them, now
  //                and then a wall tomb; outside, the ground running on
  //   village      the backs of houses with their roofs, garden walls of field stone with a thicket behind, a palisade of stakes
  function dressWalls(w, M, K, A) {
    const { W, D, H, faces, bts, gxs, opts } = A, lo = M.lo, sy = opts.southY || 0;
    const T_ = { N: (a, y, d) => [a, y, d], S: (a, y, d) => [a, y, D - d], W: (a, y, d) => [d, y, a], E: (a, y, d) => [W - d, y, a] };
    // eight corners in a side's frame: [a, y, d] each, bit 0 along, bit 1 up, bit 2 out
    const hx = (T, mk, Q, ch, o) => M.hexa(mk, Q.map((q) => T(q[0], q[1], q[2])), ch, o);
    // a stone from a0 to a1 along a side: its foot from d b0 (back) to f0 (front) at y0, its top from b1 to f1 at y1
    const prof = (T, mk, a0, a1, y0, b0, f0, y1, b1, f1, ch, o) => hx(T, mk, [[a0, y0, b0], [a1, y0, b0], [a0, y1, b1], [a1, y1, b1], [a0, y0, f0], [a1, y0, f0], [a0, y1, f1], [a1, y1, f1]], ch, o);
    // a block narrowing or swelling as it rises: foot a0..a1, out to f0 at y0; top c0..c1, out to f1 at y1; its back at d back
    const frus = (T, mk, a0, a1, f0, y0, c0, c1, f1, y1, back, ch, o) => hx(T, mk, [[a0, y0, back], [a1, y0, back], [c0, y1, back], [c1, y1, back], [a0, y0, f0], [a1, y0, f0], [c0, y1, f1], [c1, y1, f1]], ch, o);
    const hs = (a, b, k) => _hn(a * 0.731 + 0.3 + b * 0.017, b * 1.37 + 0.1, 40 + k);
    // lengths of stone along a..b, each lo..hi long (by the place)
    const along = (a, b, lo_, hi_, k, fn) => { let s = a, i = 0; while (s < b - 0.05) { let e = s + lo_ + (hi_ - lo_) * hs(s, k, 1); if (b - e < lo_ * 0.6) e = b; fn(s, Math.min(e, b), i++); s = e; } };
    const runsOf = (side, test) => { const L = faces.filter((f) => f.side === side && test(f)).map((f) => [f.a0, f.a1]).sort((p, q) => p[0] - q[0]); const out = []; for (const [a, b] of L) { const l = out[out.length - 1]; if (l && a <= l[1] + 0.01) l[1] = Math.max(l[1], b); else out.push([a, b]); } return out; };
    const cut = (runs, holes) => { let out = runs; for (const [h0, h1] of holes) { const n = []; for (const [a, b] of out) { if (h1 <= a || h0 >= b) { n.push([a, b]); continue; } if (h0 > a) n.push([a, h0]); if (h1 < b) n.push([h1, b]); } out = n; } return out.filter(([a, b]) => b - a > 0.3); };
    const clip = (runs, l0, l1) => runs.map(([a, b]) => [Math.max(a, l0), Math.min(b, l1)]).filter(([a, b]) => b - a > 0.3);
    const B = w.mats.biome, own = K === 'cemetery' || K === 'village';
    const CF = {
      hall: { pl: 'trim', pil: 1, band: 1, corb: 1, corn: 1, patch: 1, t: 0.84 }, crypt: { pl: 'trim', pil: 1, band: 1, corb: 1, corn: 1, patch: 1, t: 0.8 },
      works: { pl: 'trim', pil: 1, band: 1, corn: 1, iron: 1, t: 0.74 }, sky: { pl: 'trim', pil: 1, corn: 1, t: 0.96 },
      cavern: { pl: 'trim', but: 1, rough: 1, patch: 1, t: 0.72 }, fort: { pl: 'trim', but: 1, band: 1, walk: 1, patch: 1, t: 0.8 },
      rock: { pl: 'trim', rough: 1, t: 0.7 }, mine: { pl: 'trim', rough: 1, t: 0.62 }, cemetery: { but: 1, t: 0.8 }, village: { but: 1, t: 0.74 },
    }[K] || {};
    const tt = CF.t || 0.85, tnt = (a, y, k, f) => { const v = M.var(a, y, k); const q = tt * (f || 1); return [v[0] * q, v[1] * q, v[2] * q]; };
    const og = (y0, top, o) => Object.assign({ gy: y0, top }, o);
    // (a guardian's field: beyond its arena the approach road has walls and rock of its own, standing over the perimeter's: nothing
    // laid there, nor at the road's far end)
    const zMax = w.arenaD ? w.arenaD + 3 : Infinity;
    for (const side of ['N', 'S', 'W', 'E']) {
      if (side === 'S' && w.arenaD) continue;
      const T = T_[side], ax = side === 'N' || side === 'S';
      // (the foot of the south side: its own ground in a bare field (the castle's keep, the shaft's rim); in a guardian's field it stands down on the road, far below: nothing laid there)
      const foot = side === 'S' ? (A.bare ? sy : sy ? null : 0) : 0, top = side === 'S' && A.bare ? sy + H : H;
      const l0 = ax ? (own ? -0.75 : 0) : A.sideZ0, l1 = ax ? (own ? W + 0.75 : W) : Math.min(D, zMax);
      const gates = side === 'N' ? gxs.map((g) => [g - (own ? 4.62 : 4.75), g + (own ? 4.62 : 4.75)]) : side === 'S' ? [[W / 2 - (own ? 4.62 : 4.75), W / 2 + (own ? 4.62 : 4.75)]] : [];
      const bs = bts.filter((b) => b.side === side && (ax || b.a < zMax));
      // (a bare field's stretch about a gate: its courses run into the gate's frame; a scrap of it left beside the frame, too short to
      // carry them, is left plain)
      const keep = (R) => (A.bare ? R.filter(([a, b]) => b - a >= 1.3) : R);
      const footR = foot === null ? [] : keep(cut(clip(runsOf(side, (f) => f.y0 <= foot + 0.01 && f.y1 >= foot + 1), l0, l1), A.bare ? gates.map(([a, b]) => [a + 0.13, b - 0.13]) : gates));
      const topR = keep(clip(runsOf(side, (f) => Math.abs(f.y1 - top) < 0.02), l0, l1));
      if (!footR.length && !topR.length) continue;
      // (the way in at the south is a gate in a wall that does not open: behind its closed portcullis the wall's face stands, drawn here
      // where the cemetery's and the village's walls are otherwise left to their own pieces)
      if (own && side === 'S' && foot !== null) w.visual('block', W / 2 - 2.64, foot, D, W / 2 + 2.64, foot + Math.max(H, 7.4), D + 0.7, { uv: 2.5 });
      if (K === 'cemetery') { cemeteryWall(w, M, T, side, footR, bs, { hx, prof, frus, along, hs, cut, tnt, og, H, ax, W, D }); continue; }
      if (K === 'village') { villageWall(w, M, T, side, footR, bs, { hx, prof, frus, along, hs, cut, tnt, og, H, ax, W, D }); continue; }
      // ---- the plinth: a battered course along the foot, sloped back to the wall; around each buttress its own base
      if (CF.pl && foot !== null) {
        for (const [a, b] of cut(footR, bs.map((q) => [q.a - 0.86, q.a + 0.86]))) along(a, b, 1.1, 1.9, 2, (s0, s1, i) => {
          const r = CF.rough ? 0.05 * hs(s0, 3, 4) : 0;
          prof(T, CF.pl, s0, s1, foot - 0.02, -0.04, 0.3 + r, foot + 0.74 + r, -0.04, 0.07, CF.rough ? 0.035 : 0.025, og(foot, top, { tint: tnt(s0, foot, 5), n: CF.rough ? 0.014 : 0.005, chip: CF.rough ? 0.35 : 0.12, chipS: 0.06, foot: true }));
        });
      }
      // ---- the buttresses: pilasters (base, capital, a strip on up) or buttresses (sloped weatherings)
      const cTop = top - (CF.corb ? 1.06 : CF.corn ? 0.44 : 0);
      for (const q of bs) {
        const a = q.a, bh = q.bh, by = 0, o = (k) => og(by, top, { tint: tnt(a, k, 7), n: 0.004, chip: 0.1, chipS: 0.05 });
        frus(T, 'trim', a - 0.86, a + 0.86, 1.06, by - 0.02, a - 0.86, a + 0.86, 1.06, by + 0.42, -0.03, 0.025, Object.assign(o(1), { foot: true }));
        frus(T, 'trim', a - 0.86, a + 0.86, 1.06, by + 0.42, a - 0.73, a + 0.73, 0.93, by + 0.68, -0.03, 0.02, o(2));
        if (CF.pil) {
          frus(T, 'trim', a - 0.72, a + 0.72, 0.92, bh - 0.32, a - 0.9, a + 0.9, 1.1, bh + 0.36, -0.03, 0.03, o(3));
          frus(T, 'trim', a - 0.95, a + 0.95, 1.15, bh + 0.36, a - 0.95, a + 0.95, 1.15, bh + 0.52, -0.03, 0.02, o(4));
          if (cTop - bh - 0.52 > 0.4) prof(T, K === 'works' ? 'wall' : 'trim', a - 0.5, a + 0.5, bh + 0.52, -0.03, 0.17, cTop, -0.03, 0.17, 0.02, og(by, top, { tint: tnt(a, 6, 8, K === 'works' ? 1.1 : 0.95), n: 0.003, uvFix: K === 'works', uv: K === 'works' ? 3 : 1.5 }));
          if (CF.iron && !lo) for (const yy of [bh * 0.35, bh * 0.7]) frus(T, 'iron', a - 0.16, a + 0.16, 0.95, yy - 0.16, a - 0.16, a + 0.16, 0.95, yy + 0.16, 0.85, 0, og(by, top, { tint: [0.5, 0.45, 0.42] }));   // (the plates of the tie rods through it)
        } else {
          if (bh > 4.2) { const ym = bh * 0.46; frus(T, 'trim', a - 0.74, a + 0.74, 1.0, ym - 0.04, a - 0.71, a + 0.71, 0.9, ym + 0.24, -0.03, 0.02, o(5)); }
          frus(T, 'trim', a - 0.76, a + 0.76, 1.02, bh - 0.14, a - 0.76, a + 0.76, 1.02, bh + 0.02, -0.03, 0.02, o(6));
          frus(T, 'trim', a - 0.72, a + 0.72, 0.94, bh + 0.02, a - 0.72, a + 0.72, 0.1, bh + 0.98, -0.03, 0.03, o(9));
        }
      }
      // ---- the string course
      const bandY = K === 'fort' ? Math.min(2.6, H * 0.36) : Math.min(5.2, H * 0.33);   // (indoors over the torches, 3.3 - 4.3 m)
      // (not on the short stretches of wall a bare field keeps about its gates: a course a few metres long and ending in the air is no course)
      if (CF.band && !A.bare && foot !== null && top - foot > bandY + 2.2) for (const [a, b] of cut(footR, bs.map((q) => [q.a - 0.72, q.a + 0.72]))) along(a, b, 1.3, 2.1, 9, (s0, s1) => prof(T, 'trim', s0, s1, foot + bandY, -0.04, 0.1, foot + bandY + 0.24, -0.04, 0.03, 0.02, og(foot, top, { tint: tnt(s0, bandY, 10), n: 0.004, chip: 0.1, chipS: 0.04 })));
      // ---- the top: corbel table and cornice / rough capping / the fort's wall walk on its corbels
      // (over a gate on the north side, the sign hangs out in front of the wall from 6.4 to 13 m: nothing that stands out there)
      const signHoles = side === 'N' && top - 1.1 < 13.4 ? gxs.map((g) => [g - 3.5, g + 3.5]) : [];
      const tR = cut(topR, signHoles);
      // (a cornice and its corbels far up a tall wall - 9 m and more over its foot - without their arrises taken off: a hand's breadth
      // of bevel that far off is under a pixel, and a great hall's triangles go to what is near)
      const far = top - (foot || 0) > 9;
      if (CF.corn) for (const [a, b] of tR) along(a, b, 1.2, 1.9, 11, (s0, s1) => prof(T, 'trim', s0, s1, top - 0.44, -0.04, 0.14, top - 0.01, -0.04, 0.4, far ? 0 : 0.025, og(foot || 0, top, { tint: tnt(s0, top, 12), n: 0.004, chip: 0.1, chipS: 0.05 })));
      if (CF.corb) for (const [a, b] of cut(tR, bs.map((q) => [q.a - 0.66, q.a + 0.66]))) {
        const n = Math.max(1, Math.round((b - a) / 0.95));
        for (let i = 0; i < n; i++) { const c = a + (i + 0.5) * (b - a) / n; frus(T, 'trim', c - 0.12, c + 0.12, 0.05, top - 1.06, c - 0.12, c + 0.12, 0.3, top - 0.44, -0.04, far ? 0 : 0.015, og(foot || 0, top, { tint: tnt(c, top, 13, 0.96), n: 0.004 })); }
      }
      if (CF.iron) for (const [a, b] of tR) along(a, b, 2.4, 3.6, 14, (s0, s1) => { M.hexa('iron', [T(s0, top - 1.0, -0.02), T(s1, top - 1.0, -0.02), T(s0, top - 0.62, -0.02), T(s1, top - 0.62, -0.02), T(s0, top - 1.0, 0.12), T(s1, top - 1.0, 0.12), T(s0, top - 0.62, 0.12), T(s1, top - 0.62, 0.12)], 0.01, og(foot || 0, top, { tint: [0.42, 0.38, 0.36], uv: 1 })); });
      if (CF.rough) for (const [a, b] of tR) along(a, b, 0.7, 1.4, 15, (s0, s1) => { const r = hs(s0, 5, 16); prof(T, 'trim', s0, s1, top - 0.32 - 0.12 * r, -0.04, 0.06 + 0.1 * r, top - 0.01, -0.04, 0.04 + 0.12 * hs(s1, 6, 17), 0.035, og(foot || 0, top, { tint: tnt(s0, top, 18, 0.92), n: 0.02, chip: 0.45, chipS: 0.09 })); });
      if (CF.walk && !A.bare) for (const [a, b] of tR) {
        const n = Math.max(1, Math.round((b - a) / 1.4));
        for (let i = 0; i < n; i++) { const c = a + (i + 0.5) * (b - a) / n; frus(T, 'trim', c - 0.17, c + 0.17, 0.06, top - 0.95, c - 0.17, c + 0.17, 0.44, top - 0.2, -0.04, 0.02, og(0, top, { tint: tnt(c, top, 19, 0.95), n: 0.006, chip: 0.2, chipS: 0.05 })); }
        along(a, b, 1.3, 2.0, 20, (s0, s1) => prof(T, 'trim', s0, s1, top - 0.2, -0.04, 0.5, top + 0.12, -0.04, 0.53, 0.025, og(0, top, { tint: tnt(s0, top, 21, 0.92), n: 0.006, chip: 0.25, chipS: 0.07 })));
      }
      // ---- patches of later repair: a few courses of smaller stones laid where the face had fallen. Cut of the wall's own stone (its
      // material and picture, 'block', a small piece of the picture on each: the pale smooth stone of the trim read as paper laid on the
      // wall), a shade either way for the newer stone, the stones barely proud of the face - the face mended, not a collage laid on it
      if (CF.patch && !lo && foot !== null) for (const [a, b] of cut(footR, bs.map((q) => [q.a - 1.6, q.a + 1.6]))) {
        for (let c = a + 2 + 9 * hs(a, side.charCodeAt(0), 22); c < b - 2; c += 18 + 14 * hs(c, 2, 23)) {
          const wd = 1.6 + 1.6 * hs(c, 3, 24), yb = foot + Math.max(4.6, Math.min(top - 4, 4.6 + 3 * hs(c, 4, 25))), nh = 3 + Math.floor(4 * hs(c, 5, 26)), f = hs(c, 6, 27) < 0.5 ? 1.05 : 0.95;
          if (yb + nh * 0.3 > top - 1.2) continue;
          (w._repairs || (w._repairs = [])).push({ p: T(c, yb + nh * 0.15, 0), q: T(c, yb + nh * 0.15, 6), foot });   // (where they are: for the tools that look at them)
          let y = yb;
          for (let r = 0; r < nh; r++) {
            const h = 0.24 + 0.1 * hs(c, r, 28), sh = (hs(c, r, 29) - 0.5) * 0.5, wr = wd * (1 - Math.abs(r - nh / 2) / nh * 0.6);
            along(c - wr / 2 + sh, c + wr / 2 + sh, 0.32, 0.62, 30 + r, (s0, s1) => { const q = f * (0.97 + 0.06 * hs(s0, r, 34)); prof(T, 'block', s0 + 0.008, s1 - 0.008, y + 0.008, -0.03, 0.005 + 0.008 * hs(s0, r, 31), y + h - 0.008, -0.03, 0.005 + 0.008 * hs(s1, r, 32), 0.012, og(foot, top, { tint: [q, q, q * 0.98], n: 0.004, chip: 0.15, chipS: 0.03, uv: 6 })); });
            y += h;
          }
        }
      }
    }
    // ---- the windows' heads (opts.windows, both side walls): a round arch over each, the corners above it filled through the wall
    for (const [a, b, y0, y1] of A.wins) for (const side of ['W', 'E']) {
      const T = T_[side], R = (b - a) / 2, cA = (a + b) / 2, yc = y1 - R, segs = lo ? 4 : 8;
      for (let j = 0; j < segs; j++) {
        // (the fill: between the arch and the square head, quarter by quarter, through the wall's thickness)
        const b0 = Math.PI * j / segs, b1 = Math.PI * (j + 1) / segs, p = (t) => [cA + Math.cos(t) * R, yc + Math.sin(t) * R], sq = (t) => { const c = Math.cos(t), s = Math.sin(t), m = Math.max(Math.abs(c), Math.abs(s)); return [cA + c / m * R, yc + s / m * R]; };
        const P0 = p(b0), P1 = p(b1), Q0 = sq(b0), Q1 = sq(b1);
        hx(T, 'block', [[P0[0], P0[1], -2.95], [P1[0], P1[1], -2.95], [Q0[0], Q0[1] + 0.01, -2.95], [Q1[0], Q1[1] + 0.01, -2.95], [P0[0], P0[1], 0.0], [P1[0], P1[1], 0.0], [Q0[0], Q0[1] + 0.01, 0.0], [Q1[0], Q1[1] + 0.01, 0.0]], 0, og(0, H, { tint: [0.9, 0.9, 0.9], uv: 4 }));
      }
      // (the ring of wedge stones round it on the face, and a sill)
      const n = 9;
      for (let j = 0; j < n; j++) { const b0 = Math.PI * j / n, b1 = Math.PI * (j + 1) / n, r1 = R + 0.5 + (j === 4 ? 0.14 : 0); hx(T, 'trim', [[cA + Math.cos(b0) * R, yc + Math.sin(b0) * R, -0.05], [cA + Math.cos(b1) * R, yc + Math.sin(b1) * R, -0.05], [cA + Math.cos(b0) * r1, yc + Math.sin(b0) * r1, -0.05], [cA + Math.cos(b1) * r1, yc + Math.sin(b1) * r1, -0.05], [cA + Math.cos(b0) * R, yc + Math.sin(b0) * R, 0.06], [cA + Math.cos(b1) * R, yc + Math.sin(b1) * R, 0.06], [cA + Math.cos(b0) * r1, yc + Math.sin(b0) * r1, 0.06], [cA + Math.cos(b1) * r1, yc + Math.sin(b1) * r1, 0.06]], 0.02, og(0, H, { tint: tnt(j, cA, 34), n: 0.004, chip: 0.15, chipS: 0.04 })); }
      for (const s2 of [-1, 1]) prof(T, 'trim', s2 < 0 ? a - 0.42 : b, s2 < 0 ? a : b + 0.42, y0 - 0.3, -0.05, 0.06, yc, -0.05, 0.06, 0.02, og(0, H, { tint: tnt(s2, a, 35) }));
    }
    // ---- the city wall's parapet (the merlons of the open-sky perimeter, w._mers): a breastwork along the outer edge, the merlons on it
    if (w._mers && w._mers.length) crenels(w, M, w._mers.filter((c) => c.z0 < zMax), H, { W, D, hs, tnt, og });
    // the stretches of wall a bare field keeps about its gates, in a fortified field (the bridge, the castle, the battlefield's cliff):
    // a parapet of merlons along their outer edge (the box under it is the wall top: no merlons of its own)
    if (K === 'fort' && A.bare) for (const side of ['N', 'S']) {
      const T = T_[side], top = side === 'S' ? sy + H : H, L = faces.filter((f) => f.side === side && Math.abs(f.y1 - top) < 0.02).map((f) => [Math.max(f.a0, -3), Math.min(f.a1, W + 3)]).sort((p, q) => p[0] - q[0]);
      const R = []; for (const [a, b] of L) { const l = R[R.length - 1]; if (l && a <= l[1] + 0.01) l[1] = Math.max(l[1], b); else R.push([a, b]); }
      for (const [a, b] of R) if (b - a > 1.5) FORT.parapet(w, T, a, b, top, -3, -2.35, { gy: side === 'S' ? sy : 0, breach: true });
    }
  }
  // the merlons of a wall's parapet, each drawn over its box (cols: the boxes; each 0.9 wide, 1 m high, set into the outer edge of the wall
  // top): a breastwork 0.85 high along between them, its sill sloped out, and the merlons on it 1.2 wide - wider than the crenels, as they
  // were built - with their coping and a loop. Now and then one is broken down or gone, by the place
  function crenels(w, M, cols, H, X) {
    const { hs, tnt, og } = X, lo = M.lo;
    for (const c of cols) {
      const alongX = c.x1 - c.x0 > c.z1 - c.z0 + 0.05 || (Math.abs(c.x1 - c.x0 - 0.9) < 0.05 && Math.abs(c.z1 - c.z0 - 0.7) < 0.05);
      const a = alongX ? (c.x0 + c.x1) / 2 : (c.z0 + c.z1) / 2;
      // (its frame: across the wall from its outer face (d0) to its inner (d1))
      const outerNeg = alongX ? c.z0 < 0 : c.x0 < 0, o0 = alongX ? (outerNeg ? c.z0 : c.z1) : (outerNeg ? c.x0 : c.x1), sgn = outerNeg ? 1 : -1;
      const T = alongX ? (u, y, d) => [u, y, o0 + sgn * d] : (u, y, d) => [o0 + sgn * d, y, u];
      const h = hs(a, o0, 50), gone = h < 0.1, broken = !gone && h < 0.28, y0 = c.y0, sill = y0 + 0.85;
      const o = (k, f) => og(y0 - 8, y0 + 2, { tint: tnt(a, y0, k, f || 1), n: 0.008, chip: 0.3, chipS: 0.07 });
      // the breastwork under it and on to the next (its sill sloped down to the outside)
      const brk = gone ? 0.25 + 0.4 * hs(a, 1, 51) : 0;
      M.hexa('trim', [T(a - 0.9, y0 - 0.02, 0), T(a + 0.9, y0 - 0.02, 0), T(a - 0.9, sill - brk - 0.06, 0), T(a + 0.9, sill - brk - 0.06 - (gone ? 0.15 : 0), 0), T(a - 0.9, y0 - 0.02, 0.72), T(a + 0.9, y0 - 0.02, 0.72), T(a - 0.9, sill - brk, 0.72), T(a + 0.9, sill - brk, 0.72)], 0.03, o(52));
      if (gone) continue;
      const top = sill + (broken ? 0.45 + 0.4 * hs(a, 2, 53) : 1.12), tl = broken ? 0.25 * (hs(a, 3, 54) - 0.5) : 0;
      M.hexa('trim', [T(a - 0.6, sill - 0.02, 0.01), T(a + 0.6, sill - 0.02, 0.01), T(a - 0.6, top + tl, 0.01), T(a + 0.6, top - tl, 0.01), T(a - 0.6, sill - 0.02, 0.71), T(a + 0.6, sill - 0.02, 0.71), T(a - 0.6, top + tl, 0.71), T(a + 0.6, top - tl, 0.71)], 0.035, o(55));
      if (!broken) {
        // (its coping: a cap overhanging a little, its top weathered to a low ridge)
        M.hexa('trim', [T(a - 0.65, top, -0.04), T(a + 0.65, top, -0.04), T(a - 0.5, top + 0.2, 0.25), T(a + 0.5, top + 0.2, 0.25), T(a - 0.65, top, 0.76), T(a + 0.65, top, 0.76), T(a - 0.5, top + 0.2, 0.47), T(a + 0.5, top + 0.2, 0.47)], 0.02, o(56, 0.95));
        if (!lo && hs(a, 4, 57) < 0.6) { const p0 = T(a - 0.04, sill + 0.25, 0.715), p1 = T(a + 0.04, sill + 0.95, 0.73); M.box('dark', p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0, {}); }
      }
    }
  }

  // ---------------- a fortified wall's pieces, for the fields that build their walls themselves (the castle's curtain and towers,
  // the gatehouses on the bridge ...): each in a frame T(a, y, d) - a along the wall, y up, d out from the face it stands on. They are
  // drawn only (mason); the boxes that stop you are the field's own
  const FORT = (LG.fort = {
    // a merlon at a on the sill at y, the parapet's thickness from d0 (its back) to d1 (the face looked at), wd wide, ht high: its coping,
    // a loop in its face now and then; now and then broken down to a ragged stump, or gone (by the place)
    merlon(w, T, a, y, d0, d1, wd, ht, o) {
      o = o || {}; const M = mason(w), p = T(a, y, d1), h = _hn(p[0] * 0.71 + p[2] * 0.13, p[2] * 0.53 - p[0] * 0.07, 50), dmg = o.dmg ?? 1;
      if (h < 0.08 * dmg) return 'gone';
      const broken = h < 0.24 * dmg, top = y + (broken ? ht * (0.35 + 0.35 * _hn(p[0], p[2], 53)) : ht), tl = broken ? 0.22 * (_hn(p[0], p[2], 54) - 0.5) : 0, hw = wd / 2, far = !!o.far;
      const tn = (k, f) => { const v = M.var(p[0], y, p[2] + k); const q = (o.t || 0.86) * (f || 1); return [v[0] * q, v[1] * q, v[2] * q]; };
      const og = (k, f) => ({ gy: o.gy ?? y - 6, top: y + ht, tint: tn(k, f), n: 0.008, chip: far ? 0 : 0.3, chipS: 0.07, uv: 1.4 });
      M.hexa('trim', [T(a - hw, y - 0.02, d0), T(a + hw, y - 0.02, d0), T(a - hw, top + tl, d0), T(a + hw, top - tl, d0), T(a - hw, y - 0.02, d1), T(a + hw, y - 0.02, d1), T(a - hw, top + tl, d1), T(a + hw, top - tl, d1)], far ? 0 : 0.035, og(55));
      if (broken) return 'broken';
      const dd = d1 - d0, c0 = d0 + dd * 0.38, c1 = d0 + dd * 0.62, ov = Math.sign(dd) * 0.05;
      M.hexa('trim', [T(a - hw - 0.05, top, d0 - ov), T(a + hw + 0.05, top, d0 - ov), T(a - hw + 0.12, top + 0.2, c0), T(a + hw - 0.12, top + 0.2, c0), T(a - hw - 0.05, top, d1 + ov), T(a + hw + 0.05, top, d1 + ov), T(a - hw + 0.12, top + 0.2, c1), T(a + hw - 0.12, top + 0.2, c1)], 0, og(56, 0.95));   // (the cap: its sloped faces make its edges; none taken off)
      if (!M.lo && o.loop !== false && _hn(p[0], p[2], 57) < 0.55) { const s = Math.sign(dd) || 1, q0 = T(a - 0.04, y + 0.22, d1 + s * 0.004), q1 = T(a + 0.04, y + ht - 0.3, d1 + s * 0.016); M.box('dark', q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], 0, {}); }
      return 'whole';
    },
    // a parapet from a0 to a1 on a wall top at y: the breastwork up to the sill (its top sloped down toward d0), on it merlons every pitch,
    // each 0.64 of it wide (wider than the crenels between, as they were built); o: { pitch, sill (its height), ht (the merlons'), dmg }
    parapet(w, T, a0, a1, y, d0, d1, o) {
      o = o || {}; const M = mason(w), P = o.pitch || 1.8, n = Math.max(1, Math.round((a1 - a0) / P)), pp = (a1 - a0) / n, sill = y + (o.sill ?? 0.85), ht = o.ht ?? 1.05;
      // (o.breach: here and there a stretch of about five merlons fallen together, the breastwork under them broken down lower and ragged,
      // a stone or two of it still lying there - the parapet as a siege or two left it; by the place. Only where the merlons have no
      // boxes of their own: nothing stops you there either way)
      const pB = T(a0, y, d1), sk = Math.floor(_hn(pB[0], pB[2], 76) * 5), bz = (i) => !!o.breach && _hn(pB[0] * 0.37 + Math.floor((i + sk) / 5) * 1.3, pB[2] * 0.41 + y, 77) < 0.3;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i + 0.5) * pp, b0 = a0 + i * pp, b1 = b0 + pp, p = T(a, y, d1), v = M.var(p[0], y, p[2] + 3), t = o.t || 0.86, br = bz(i);
        const st = br ? 'gone' : FORT.merlon(w, T, a, sill, d0, d1, pp * 0.64, ht, o), gone = st === 'gone', dz = br ? 0.35 + 0.4 * _hn(p[0], p[2], 78) : gone ? 0.2 + 0.4 * _hn(p[0], p[2], 51) : 0;
        if (br) ruinTop(w, T, b0, b1, sill - dz - 0.035, d0, d1, o.gy ?? y - 6, { mk: 'trim', fall: 0 });
        M.hexa('trim', [T(b0, y - 0.02, d0), T(b1, y - 0.02, d0), T(b0, sill - dz - 0.07, d0), T(b1, sill - dz - 0.07 - (gone ? 0.12 : 0), d0), T(b0, y - 0.02, d1), T(b1, y - 0.02, d1), T(b0, sill - dz, d1), T(b1, sill - dz, d1)], 0, { gy: o.gy ?? y - 6, top: sill, tint: [v[0] * t * 0.95, v[1] * t * 0.95, v[2] * t * 0.95], n: 0.008, chip: o.far ? 0 : gone ? 0.6 : 0.2, chipS: 0.08, uv: 1.4 });
      }
    },
    // corbels on a face (d 0 the face, out from it) from a0 to a1 about every step, from y - 0.8 up to y, carrying a course from y to
    // y + 0.28 that stands out by out
    corbels(w, T, a0, a1, y, out, o) {
      o = o || {}; const M = mason(w), st = o.step || 1.3, n = Math.max(1, Math.round((a1 - a0) / st)), t = o.t || 0.84;
      const tn = (a, k) => { const p = T(a, y, 0), v = M.var(p[0], y + k, p[2]); return [v[0] * t, v[1] * t, v[2] * t]; };
      for (let i = 0; i < n; i++) {
        const c = a0 + (i + 0.5) * (a1 - a0) / n, hw = o.wd || 0.17;
        // (courses, each standing out farther than the one under it: two, or one far off)
        const nk = o.far || o.one ? 1 : 2, kh = 0.8 / nk;
        for (let k = 0; k < nk; k++) { const yb = y - 0.8 + k * kh, f0 = out * (0.2 + 0.8 * k / nk), f1 = out * (0.2 + 0.8 * (k + 1) / nk); M.hexa('trim', [T(c - hw, yb, -0.04), T(c + hw, yb, -0.04), T(c - hw, yb + kh - 0.01, -0.04), T(c + hw, yb + kh - 0.01, -0.04), T(c - hw, yb, f0 * 0.8), T(c + hw, yb, f0 * 0.8), T(c - hw, yb + kh - 0.01, f1), T(c + hw, yb + kh - 0.01, f1)], o.ch || 0, { gy: o.gy ?? y - 6, top: y, tint: tn(c, k), n: 0.004 }); }
      }
      if (o.course !== false) { let s = a0, i = 0; while (s < a1 - 0.05) { const e = Math.min(a1, s + 1.3 + 0.7 * _hn(s, y, 58 + i)); M.hexa('trim', [T(s, y, -0.04), T(e, y, -0.04), T(s, y + 0.28, -0.04), T(e, y + 0.28, -0.04), T(s, y, out + 0.06), T(e, y, out + 0.06), T(s, y + 0.28, out + 0.1), T(e, y + 0.28, out + 0.1)], o.far ? 0 : 0.012, { gy: o.gy ?? y - 6, top: y + 0.3, tint: tn(s, 9), n: 0.006, chip: 0.2, chipS: 0.06 }); s = e; i++; } }
    },
    // a battered plinth along a face from a0 to a1: its foot at y standing out by out, h high, sloped back to the face
    talus(w, T, a0, a1, y, h, out, o) {
      o = o || {}; const M = mason(w), t = o.t || 0.82; let s = a0, i = 0;
      while (s < a1 - 0.05) { const e = Math.min(a1, s + 1.1 + 0.8 * _hn(s, y, 59 + i)), p = T(s, y, 0), v = M.var(p[0], y, p[2]); M.hexa('trim', [T(s, y - 0.05, -0.04), T(e, y - 0.05, -0.04), T(s, y + h, -0.04), T(e, y + h, -0.04), T(s, y - 0.05, out), T(e, y - 0.05, out), T(s, y + h, 0.05), T(e, y + h, 0.05)], o.far ? 0 : 0.03, { gy: y, top: y + h, tint: [v[0] * t, v[1] * t, v[2] * t], n: 0.008, chip: 0.2, chipS: 0.07, foot: !o.far }); s = e; i++; }
    },
  });

  // ================================================================ the big shapes inside a field: steps, copings, pillars, arches
  // As the walls: the boxes that stop you are kept as they were (drawn or not, said at each), what is drawn is built here (mason).
  // What is built under Terrain.at (raised onto a terrain) stands at w._atY over what it is given.
  const _tagged = (tag, fn) => { const t = LG._tag; LG._tag = tag; try { return fn(); } finally { LG._tag = t; } };

  // ---- a step's tread stone (laid over the box of each step, which stays as it was): its front edge rounded and standing a little out
  // over the riser below, its top worn hollow in the middle and most at the front, where feet go. One shape for each width, shared
  const _tread = {};
  function treadGeo(wd, wood) {
    const key = Math.round(wd * 20) + (wood ? 'w' : ''); if (_tread[key]) return _tread[key];
    const R = 0.5, t = 0.012, us = [-1, 0, 1];
    // (the section from the back of the tread over the nosing to under it: z out along the run, y up from the box's top)
    const prof = wood ? [[0, t, 0], [R - 0.03, t, 0.2], [R + 0.012, t - 0.01, 0.2], [R + 0.025, t - 0.04, 0], [R - 0.02, t - 0.045, 0]]
      : [[0, t, 0.35], [R - 0.045, t, 1], [R - 0.004, t - 0.013, 1], [R + 0.022, t - 0.036, 0.7], [R + 0.03, t - 0.066, 0.3], [R - 0.03, t - 0.072, 0]];
    const P = [], I = [], nP = prof.length, nU = us.length;
    for (let j = 0; j < nU; j++) {
      const u = us[j], wear = (wood ? 0.004 : 0.013) * (1 - u * u);
      for (const [z, y, k] of prof) P.push(u * wd / 2, y - wear * k, z - (z > R - 0.05 ? wear * k * 0.9 : 0));
    }
    for (let j = 0; j + 1 < nU; j++) for (let i = 0; i + 1 < nP; i++) { const a = j * nP + i, b = a + 1, c = a + nP, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    // (the two ends, flat: the section closed down to the back under the tread)
    const q = g.toNonIndexed(), pos = Array.from(q.attributes.position.array), nor = Array.from(q.attributes.normal.array);
    for (const [j, sx] of [[0, -1], [nU - 1, 1]]) {
      const pts = prof.map((_, i) => [P[(j * nP + i) * 3], P[(j * nP + i) * 3 + 1], P[(j * nP + i) * 3 + 2]]); pts.push([sx * wd / 2, t - 0.072, 0]);
      for (let i = 1; i + 1 < pts.length; i++) { const tri = sx < 0 ? [pts[0], pts[i + 1], pts[i]] : [pts[0], pts[i], pts[i + 1]]; for (const p of tri) { pos.push(...p); nor.push(sx, 0, 0); } }
    }
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return (_tread[key] = o);
  }
  // the treads of a flight laid by stairs() (its arguments, and what it worked out)
  function stepTreads(w, side, e, c, wd, h0, h1, mk, n, rise, run, sg) {
    if (run !== 0.5 || wd < 0.6) return;
    const M = mason(w), wood = (mk || '').startsWith('wood'), g = treadGeo(wd, wood), ay = w._atY || 0, ns = side === 'N' || side === 'S';
    const m = new THREE.Matrix4(), flip = (ns ? sg : -sg) < 0;
    _tagged('stairs', () => {
      for (let i = 0; i < n; i++) {
        const top = h1 - i * rise + ay, a = e + sg * i * run, wx = ns ? c : a, wz = ns ? a : c, j = _hn(wx * 1.7 + 0.3, wz * 1.3 + top, 61);
        // (local x across the flight, z out along it to the nosing; each stone set a hair off true)
        const tw = (j - 0.5) * 0.006, cs = Math.cos(tw), sn = Math.sin(tw);
        if (ns) m.set(cs, 0, sn * sg, wx, 0, 1, 0, top + (j - 0.5) * 0.004, -sn, 0, cs * sg, wz, 0, 0, 0, 1);
        else m.set(-sn, 0, cs * sg, wx, 0, 1, 0, top + (j - 0.5) * 0.004, cs, 0, sn * sg, wz, 0, 0, 0, 1);
        const v = M.var(wx, top, wz, 7), k = wood ? 0.95 : 0.9;
        M.geo(mk || 'trim', g, m, { tint: [v[0] * k, v[1] * k, v[2] * k], gy: h0 + ay - 1, world: true, uv: wood ? 1.2 : 1.4, flip, one: true });
      }
      // the sides: at each side the flight's side wall of masonry, flush with the side of its boxes (a flight seen from the side was one flat
      // face cut in teeth), its top following the steps - each step's end a stone of its own, as on an old stair of stone - laid in courses
      // two risers high, the joints of one course off those of the next, a hair of joint between the stones. Of wood: none
      if (wood || n < 2) return;
      const Ch = (n > 16 ? 3 : 2) * rise, base = h0 + ay, top = (i) => h1 + ay - i * rise;
      const W3 = (u, y, z) => (ns ? [c + u, y, e + sg * z] : [e + sg * z, y, c + u]);
      for (const sx of [-1, 1]) {
        // (a side against a wall or a slab is not seen: none there)
        { const pa = W3(sx * (wd / 2 + 0.06), base + (h1 - h0) * 0.5, n * run * 0.3), pb = W3(sx * (wd / 2 + 0.3), base + (h1 - h0) * 0.5 + 0.1, n * run * 0.7);
          if (w.query(Math.min(pa[0], pb[0]), pa[1], Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), pb[1], Math.max(pa[2], pb[2])).some((q) => q.vis && !q.ghost)) continue; }
        const u0 = sx * (wd / 2 + 0.015), u1 = sx * (wd / 2 - 0.12), g = 0.003;
        const stone = (z0, z1, y0, y1, k) => { const vv = M.var(c + sx * 1.3 + z0, y0, e + z1 * 0.7, 9 + k), q = 0.74 + 0.2 * _hn(c + sx + z0 * 3.1, y0 * 2.3 + e, 71);
          M.hexa(mk || 'trim', [W3(u0, y0 + g, z0 + g), W3(u0, y0 + g, z1 - g), W3(u0, y1 - g, z0 + g), W3(u0, y1 - g, z1 - g), W3(u1, y0 + g, z0 + g), W3(u1, y0 + g, z1 - g), W3(u1, y1 - g, z0 + g), W3(u1, y1 - g, z1 - g)], 0, { gy: base, top: base + 5, tint: [vv[0] * q, vv[1] * q, vv[2] * q * 0.98], n: 0.004, uv: 1.6, chip: 0.1, chipS: 0.035 }); };
        for (let k = 0; ; k++) {
          const y0 = base + k * Ch, y1 = y0 + Ch; if (y0 >= top(0) - 0.02) break;
          // (the steps this course reaches: those whose tops stand over its bed; the ones that stand over its head too in long stones, the
          // last one or two each a stone to its own top)
          let iEnd = 0; while (iEnd < n && top(iEnd) > y0 + 0.02) iEnd++;
          let z0 = 0, i = 0, q = 0;
          const full = (ii) => top(ii) >= y1 - 0.02;
          while (i < iEnd && full(i)) {
            let j = i + 1, lim = (k % 2 ? 3 : 4) + Math.floor(3 * _hn(c + sx + i, e + k, 70 + q));
            while (j < iEnd && full(j) && j - i < lim) j++;
            stone(i * run, j * run, y0, y1, k); i = j; q++;
          }
          for (; i < iEnd; i++) stone(i * run, (i + 1) * run, y0, Math.min(y1, top(i)) - 0.004, k);
        }
      }
    });
  }

  // ---- a coping or a kerb: stones along an edge (T(a, y, d): a along it, d across, 0 at the face looked at, out positive), from a0 to a1,
  // y0..y1, d0..d1; their edges taken off and worn, a stone now and then chipped, the joints between them open a little. o: {mk, ridge
  // (its top weathered up to a low ridge across), len: [min, max], t: brightness, foot}
  function coping(w, T, a0, a1, y0, y1, d0, d1, o) {
    o = o || {}; const M = mason(w), mk = o.mk || 'trim', L = o.len || [0.8, 1.4], rg = o.ridge || 0, t = o.t || 0.9;
    let s = a0, i = 0;
    while (s < a1 - 0.05) {
      let e = s + L[0] + (L[1] - L[0]) * _hn(s * 1.3, y1 + d0, 62 + i); if (a1 - e < L[0] * 0.5) e = a1; e = Math.min(e, a1);
      const g = 0.004, p = T((s + e) / 2, y1, d1), v = M.var(p[0], y1, p[2], 5), dm = (d0 + d1) / 2;
      const P = [T(s + g, y0, d0), T(e - g, y0, d0), T(s + g, y1, d0), T(e - g, y1, d0), T(s + g, y0, d1), T(e - g, y0, d1), T(s + g, y1, d1), T(e - g, y1, d1)];
      if (rg) { P[2] = T(s + g, y1 - rg, d0); P[3] = T(e - g, y1 - rg, d0); P[6] = T(s + g, y1 - rg, d1); P[7] = T(e - g, y1 - rg, d1); M.hexa(mk, P, M.lo || o.plain ? 0 : 0.02, { gy: o.gy ?? y0 - 1, top: y1, tint: [v[0] * t, v[1] * t, v[2] * t], n: 0.005, chip: 0.25, chipS: 0.05, uv: 1.4, foot: o.foot });
        // (the ridge: a second low stone along the middle of the top, the weathered crown)
        M.hexa(mk, [T(s + g, y1 - rg - 0.002, dm - (d1 - d0) * 0.32), T(e - g, y1 - rg - 0.002, dm - (d1 - d0) * 0.32), T(s + g, y1, dm - (d1 - d0) * 0.08), T(e - g, y1, dm - (d1 - d0) * 0.08), T(s + g, y1 - rg - 0.002, dm + (d1 - d0) * 0.32), T(e - g, y1 - rg - 0.002, dm + (d1 - d0) * 0.32), T(s + g, y1, dm + (d1 - d0) * 0.08), T(e - g, y1, dm + (d1 - d0) * 0.08)], 0, { gy: o.gy ?? y0 - 1, top: y1, tint: [v[0] * t, v[1] * t, v[2] * t], n: 0.003, uv: 1.4 }); }
      else M.hexa(mk, P, M.lo || o.plain ? 0 : 0.03, { gy: o.gy ?? y0 - 1, top: y1, tint: [v[0] * t, v[1] * t, v[2] * t], n: 0.006, chip: o.plain ? 0.2 : 0.3, chipS: 0.055, uv: 1.4, foot: o.foot });
      s = e; i++;
    }
  }
  // ---- a face of coursed masonry laid over a box's side (the box stays, drawn or not): stones in courses of ch, 0.7 - 1.5 m long, the joints
  // of one course off the next, a hair of joint between them, standing out by out; faces: which of 'N' 'S' 'W' 'E' (sideT's). Each stone its
  // own shade. o: {mk, ch, t (brightness), top: a function (a) -> the face's top along it (a ragged top), ragged: true}
  function ashlar(w, x0, y0, z0, x1, y1, z1, faces, o) {
    o = o || {}; const M = mason(w), ST = sideT(x0, z0, x1, z1), ch = o.ch || 0.5, mk = o.mk || 'trim', out = o.out ?? 0.015, g = 0.003, tb = o.t || 0.86;
    for (const f of faces) {
      const q = ST[f]; if (!q) continue;
      for (let k = 0, y = y0; y < y1 - 0.02; k++, y += ch) {
        const ya = y, yb = Math.min(y1, y + ch);
        let a = q.a0, i = 0;
        while (a < q.a1 - 0.03) {
          let b = Math.min(q.a1, a + (i === 0 && k % 2 ? 0.45 : 0.7 + 0.8 * _hn(a * 1.7 + k, x0 + z0 + ya, 72))); if (q.a1 - b < 0.3) b = q.a1;
          const tA = o.top ? Math.min(yb, o.top(a)) : yb, tB = o.top ? Math.min(yb, o.top(b)) : yb;
          if (tA > ya + 0.05 || tB > ya + 0.05) {
            const v = M.var(a + x0, ya, b + z0, 12 + k), s2 = tb * (0.86 + 0.2 * _hn(a * 3.3 + z1, ya * 1.9 + x1, 73)), dd = out * (0.6 + 0.8 * _hn(a, ya, 74));
            M.hexa(mk, [q.T(a + g, ya + g, -0.06), q.T(b - g, ya + g, -0.06), q.T(a + g, Math.max(ya + 0.02, tA) - g, -0.06), q.T(b - g, Math.max(ya + 0.02, tB) - g, -0.06), q.T(a + g, ya + g, dd), q.T(b - g, ya + g, dd), q.T(a + g, Math.max(ya + 0.02, tA) - g, dd), q.T(b - g, Math.max(ya + 0.02, tB) - g, dd)], 0, { gy: o.gy ?? y0, top: y1, tint: [v[0] * s2, v[1] * s2, v[2] * s2 * 0.98], n: 0.004, chip: 0.25, chipS: 0.035, uv: 1.5 });
          }
          a = b; i++;
        }
      }
    }
  }
  LG.ashlar = ashlar;
  // ---- a ceiling of timber coffers (F.ceiling): between its great beams along x (zs: their middles along z, each 0.7 wide), joists of
  // dark wood along z every step in x, framed into the beams, each with a fillet either side where it meets the boards, so that the flat
  // of the ceiling is a grid of sunk panels. Drawn only (nothing thrown); under the slab at y
  function coffers(w, x0, z0, x1, z1, y, zs, step, only, frost) {
    // (only: [xa, xb] - the joists only there, where the ceiling is seen; frost: a frozen hall's, hoarfrost and icicles on them)
    const M = mason(w), ay = w._atY || 0, Y = y + ay, xs = []; for (let x = x0 + step; x < x1 - step * 0.5; x += step) if (!only || (x > only[0] && x < only[1])) xs.push(x);
    const ze = [z0, ...zs, z1].sort((p, q) => p - q);
    _tagged('ceiling', () => {
      for (const x of xs) for (let i = 0; i + 1 < ze.length; i++) {
        const a = ze[i] + (i ? 0.35 : 0), b = ze[i + 1] - (i + 1 < ze.length - 1 ? 0.35 : 0); if (b - a < 1) continue;
        const v = M.var(x, Y, a, 21), t = 0.8 + 0.12 * _hn(x, a, 67), c = [v[0] * t, v[1] * t, v[2] * t], c2 = [c[0] * 0.88, c[1] * 0.88, c[2] * 0.88], D = [0, -1, 0];
        // (its underside and its two sides; a fillet sloping from each side up to the boards. Its ends are in the beams)
        const Q = [[[x - 0.15, Y - 0.4, a], [x + 0.15, Y - 0.4, a], [x + 0.15, Y - 0.4, b], [x - 0.15, Y - 0.4, b], D, c]];
        for (const sg of [-1, 1]) { const xs = x + sg * 0.15; Q.push([[xs, Y - 0.4, a], [xs, Y - 0.12, a], [xs, Y - 0.12, b], [xs, Y - 0.4, b], [sg, 0, 0], c], [[xs, Y - 0.12, a], [xs + sg * 0.1, Y + 0.005, a], [xs + sg * 0.1, Y + 0.005, b], [xs, Y - 0.12, b], [sg * 0.7, -0.7, 0], c2]); }
        M.quads('woodDark', Q, 1.2);
        if (frost) joistFrost(w, M, x, a, b, Y - 0.4);
      }
    });
  }
  LG.coffers = coffers;
  // ================================================================ ice and frost in a frozen hall
  // The ice is the hall's own (the sheaths' and the lake's: w.mats.vc.ice - pale blue, a little see-through, its relief and gloss from
  // the ice picture), coloured point by point: whiter where it is thick or at an edge, bluer where it is thin. A curtain of it on a wall
  // in a thinner make of the same (icecurtain: more see-through, the stone showing through where it is thin). Hoarfrost (rime) white and
  // matte, thickest under the beams, fading up their sides into the dark of the wood. Everything here is drawn only.
  const iceMk = (M, w, kind) => {
    if (kind === 'ice') return 'ice';
    if (M.mat[kind]) return kind;
    let m;
    if (kind === 'icecurtain') { m = ((w.mats.vc && w.mats.vc.ice) || w.mats.ice).clone(); m.vertexColors = true; m.transparent = true; m.opacity = 0.7; }
    else { const im = w.mats.ice || {}; m = new THREE.MeshStandardMaterial({ normalMap: im.normalMap || null, color: 0xd8e0e6, roughness: 0.93, metalness: 0, vertexColors: true }); if (m.normalMap) m.normalScale.set(0.9, 0.9); m.envMapIntensity = 0.15; }
    m.name = kind; M.mat[kind] = m; return kind;
  };
  // an icicle: a ring at its root (radius 1, y 0) narrowing through a waist (its ring turned half a side) to its point (y -1); four
  // sides, no top (it hangs from something). Shared
  let _icl = null;
  const icicleGeo = () => {
    if (_icl) return _icl;
    const P = [], I = [], n = 4;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; P.push(Math.cos(a), 0, Math.sin(a)); }
    for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; P.push(Math.cos(a) * 0.42, -0.38, Math.sin(a) * 0.42); }
    P.push(0, -1, 0);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; I.push(i, j, n + i, j, n + j, n + i, n + i, n + j, 2 * n); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    // (wound to face out: flipped if it came the other way)
    const p = g.attributes.position, nr = g.attributes.normal; if (nr.getX(0) * p.getX(0) + nr.getZ(0) * p.getZ(0) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
    return (_icl = g);
  };
  const _icm = new THREE.Matrix4(), _icq = new THREE.Quaternion(), _ice = new THREE.Euler(), _icv = new THREE.Vector3(), _ics = new THREE.Vector3();
  // one icicle of the hall's ice hanging from (x, y, z): its root r wide, len long, leaning a little (by the place)
  function icicle(M, x, y, z, r, len, k) {
    const h = (j) => _hn(x * 3.1 + j, z * 2.7 + y, 90 + k + j);
    _ice.set((h(1) - 0.5) * 0.12, h(2) * 6.3, (h(3) - 0.5) * 0.12); _icq.setFromEuler(_ice);
    _icm.compose(_icv.set(x, y, z), _icq, _ics.set(r, len, r));
    const t = 0.9 + 0.1 * h(4);
    M.geo('ice', icicleGeo(), _icm, { tint: [t * 0.97, t, t], gy: y - 30, world: true, uv: 0.8, one: true });
  }
  // (a triangle of a list P, wound so that f(its normal) >= 0)
  const putTri = (P, I, a, b, c, f) => { const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    if (f(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) >= 0) I.push(a, b, c); else I.push(a, c, b); };
  // the colour of rime as it thins into dark wood (the rime's colour times this comes to the wood's)
  const RIMEWOOD = [0.08, 0.066, 0.056];
  // ---- hoarfrost on the beams of a frozen ceiling (F.ceiling o.frost; the beams x0..x1 at each z of zs, 0.7 wide, 0.7 deep under y):
  // in patches along them, a gap between now and then, its ends ragged; white under them, up their sides from the lower edge a little
  // way and fading out into the wood by a ragged line - most of the wood dark still. A few icicles of very different lengths off their
  // lower edges, the long ones toward the walls where the cold comes in
  function beamFrost(w, x0, x1, y, zs) {
    const M = mason(w), mk = iceMk(M, w, 'rime'), ay = w._atY || 0, Y = y + ay, hw = 0.35, dp = 0.7;
    _tagged('ceiling', () => {
      for (const z of zs) {
        const Q = [], hb = (x, k) => _hn(x * 1.7 + z, z * 0.31 + k, 93 + k);
        let s = x0;
        while (s < x1 - 0.05) {
          const e = Math.min(x1, s + 0.6 + 1.3 * hb(s, 1));
          if (hb(s, 2) < 0.7) {
            // (its four corners each its own: the ends cut aslant and not alike, the white thicker here, thinner there)
            const yb = Y - dp - 0.01 - 0.015 * hb(s, 3), cc = (q) => { const k = 0.6 + 0.3 * hb(s + q, 4); return [k * 0.95, k * 0.98, k]; };
            const xa = [s + 0.04 + 0.3 * hb(s, 5), s + 0.04 + 0.3 * hb(s, 6)], xb = [e - 0.04 - 0.3 * hb(e, 7), e - 0.04 - 0.3 * hb(e, 8)];
            if (Math.min(xb[0] - xa[0], xb[1] - xa[1]) > 0.15) {
              const C4 = [cc(1), cc(2), cc(3), cc(4)];
              // (thickest on the lower edges: a strip in from each along the underside, white at the edge and fading into the wood toward
              // the middle, and up the side from it, fading the same way)
              [-1, 1].forEach((sg, q) => {
                const zz = z + sg * (hw + 0.01), zi = (x, k) => z + sg * (hw - 0.07 - 0.13 * hb(x, 12 + k + sg)), up = (x, k) => Y - dp + 0.03 + 0.17 * hb(x, 9 + k + sg), ca = C4[q ? 3 : 0], cb = C4[q ? 2 : 1];
                Q.push([[xa[q], yb, zz], [xb[q], yb, zz], [xb[q], yb + 0.004, zi(xb[q], 1)], [xa[q], yb + 0.004, zi(xa[q], 0)], [0, -1, 0], [ca, cb, RIMEWOOD, RIMEWOOD]]);
                Q.push([[xa[q], yb, zz], [xb[q], yb, zz], [xb[q], up(xb[q], 1), zz], [xa[q], up(xa[q], 0), zz], [0, 0, sg], [ca, cb, RIMEWOOD, RIMEWOOD]]);
              });
            }
          }
          s = e;
        }
        M.quads(mk, Q, 1.1);
        let x = x0 + 1 + 2 * hb(x0, 9), i = 0;
        while (x < x1 - 0.6) {
          const r = hb(x, 10), sg = hb(x, 11) < 0.5 ? -1 : 1, edge = Math.min(x - x0, x1 - x) < 4 ? 1 : 0;
          const len = 0.25 + 1.5 * r * r * r + 0.6 * edge * hb(x, 12);
          icicle(M, x, Y - dp - 0.02, z + sg * (hw - 0.04 - 0.05 * hb(x, 14)), 0.04 + 0.03 * hb(x, 15) + len * 0.03, len, i++);
          x += 2.2 + 3.3 * hb(x, 16);
        }
      }
    });
  }
  LG.beamFrost = beamFrost;
  // the same on a joist of the coffers (x, a..b along z, its underside at yb): sparser, now and then an icicle
  function joistFrost(w, M, x, a, b, yb) {
    const mk = iceMk(M, w, 'rime'), h = (q, k) => _hn(x * 0.9 + q, q * 1.3, 97 + k), Q = [];
    let s = a;
    while (s < b - 0.05) {
      const e = Math.min(b, s + 0.9 + 1.5 * h(s, 1));
      if (h(s, 2) < 0.45) {
        const y0 = yb - 0.012, k = 0.66 + 0.2 * h(s, 3), cw = [k * 0.96, k * 0.99, k], sa = s + 0.1 + 0.2 * h(s, 4), ea = e - 0.1 - 0.2 * h(e, 5);
        if (ea - sa > 0.2) for (const sg of [-1, 1]) {
          Q.push([[x + sg * 0.16, y0, sa], [x + sg * 0.16, y0, ea], [x + sg * (0.09 - 0.05 * h(ea, 9 + sg)), y0 + 0.003, ea], [x + sg * (0.09 - 0.05 * h(sa, 9 + sg)), y0 + 0.003, sa], [0, -1, 0], [cw, cw, RIMEWOOD, RIMEWOOD]]);
          Q.push([[x + sg * 0.16, y0, sa], [x + sg * 0.16, y0, ea], [x + sg * 0.16, yb + 0.03 + 0.08 * h(ea, 6 + sg), ea], [x + sg * 0.16, yb + 0.03 + 0.08 * h(sa, 6 + sg), sa], [sg, 0, 0], [cw, cw, RIMEWOOD, RIMEWOOD]]);
        }
      }
      s = e;
    }
    M.quads(mk, Q, 1.1);
    if (h(a, 8) < 0.35) { const z = a + (b - a) * (0.25 + 0.5 * h(a, 9)), r = h(z, 10); icicle(M, x + (h(z, 11) - 0.5) * 0.2, yb - 0.01, z, 0.03 + 0.02 * r, 0.2 + 0.9 * r * r, 40); }
  }
  // ---- the head of a pillar sheathed in ice (fieldgen_t4.js icePillar: the sheath from the floor to about 0.6 of h, its upper edge
  // ragged, the stone shaft on up to its capital at h): the sheath's own ice built up over its top and on up the shaft in a lumpy
  // collar - one ice with the sheath - short icicles off its lip; runs of ice up the shaft to the capital, and a crust round the capital's
  // underside. h: the pillar's height; the shaft 0.5 round
  function icePillarHead(w, x, z, h) {
    const M = mason(w), ay = w._atY || 0, Y = ay, n = 16, hh = (a, k) => _hn(x * 1.3 + a, z * 1.7 + k, 101 + k);
    _tagged('ice', () => {
      // the collar: rings round the pillar, from over the sheath's lip up the shaft, each a little lumpy and ragged (radius, height)
      const R = [[0.7, 0.5 * h], [0.82, 0.525 * h], [0.78, 0.56 * h], [0.68, 0.595 * h], [0.58, 0.63 * h], [0.53, 0.665 * h]];
      const P = [], I = [], C = [];
      R.forEach(([r, yy], j) => {
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, k = 1 + 0.12 * (hh(i, j) - 0.5) * (j ? 1 : 0.3) + 0.08 * Math.sin(a * 3 + x), lift = j >= 3 ? (hh(i, j + 7) - 0.4) * 0.5 * (j - 2) : (hh(i, j + 7) - 0.5) * 0.12;
          const rr = j === R.length - 1 ? 0.53 : r * k;
          P.push(x + Math.cos(a) * rr, Y + yy + lift, z + Math.sin(a) * rr);
          // (whiter where it bulges thickest, a little bluer where it thins up the shaft)
          const c = (0.9 + 0.1 * hh(i, j + 20)) * (j === 1 || j === 2 ? 1 : j >= 4 ? 0.9 : 0.95); C.push(c * 0.97, c, c);
        }
      });
      for (let j = 0; j + 1 < R.length; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n; I.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      // (wound outward: a point of the first ring and its normal)
      { const nr = g.attributes.normal; if ((P[0] - x) * nr.getX(n) + (P[2] - z) * nr.getZ(n) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); } }
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      M.geo('ice', g, new THREE.Matrix4(), { tint: [1, 1, 1], gy: Y - 20, world: true, uv: 2, vcol: true });
      // its lip's icicles, down the outside of the sheath
      for (let i = 0; i < 6; i++) { const a = (i + hh(i, 30) * 0.6) / 6 * Math.PI * 2, r = 0.74 + 0.06 * hh(i, 31), len = 0.3 + 1.2 * Math.pow(hh(i, 32), 2); icicle(M, x + Math.cos(a) * r, Y + 0.51 * h + 0.1 * hh(i, 34), z + Math.sin(a) * r, 0.05 + 0.04 * hh(i, 35), len, 60 + i); }
      // the runs up the shaft to the capital: bands hugging it, wandering a little, now wider, now thinner
      const Q = [];
      for (let k = 0; k < 4; k++) {
        const a0 = (k + 0.3 * hh(k, 40)) / 4 * Math.PI * 2, y0 = Y + 0.66 * h, y1 = Y + h - 0.5, rows = 5;
        for (let j = 0; j < rows; j++) {
          const ya = y0 + (y1 - y0) * j / rows, yb = y0 + (y1 - y0) * (j + 1) / rows;
          const at = (q) => a0 + 0.12 * Math.sin(q * 2.1 + k), wd = (q) => 0.07 + 0.08 * _hn(q * 1.9, x + k, 110 + k), th = (q) => 0.035 + 0.03 * _hn(q * 2.3, z + k, 112 + k);
          const pt = (q, side, out) => { const a = at(q) + side * wd(q) / 0.53, r = 0.5 + (out ? th(q) : 0.005); return [x + Math.cos(a) * r, q, z + Math.sin(a) * r]; };
          const pA = pt(ya, -1, 1), pB = pt(ya, 1, 1), pC = pt(yb, 1, 1), pD = pt(yb, -1, 1), am = at((ya + yb) / 2);
          Q.push([pA, pB, pC, pD, [Math.cos(am), 0, Math.sin(am)], [0.97, 1, 1]]);
          for (const side of [-1, 1]) { const e0 = pt(ya, side, 0), e1 = pt(yb, side, 0), f0 = pt(ya, side, 1), f1 = pt(yb, side, 1), as = am + side * 1.4; Q.push([e0, f0, f1, e1, [Math.cos(as), 0, Math.sin(as)], [0.88, 0.92, 0.95]]); }
        }
      }
      M.quads('ice', Q, 2);
      // the crust under the capital: a ragged ring of ice under its abacus
      const Q2 = [], rc = 0.62, yc = Y + h - 0.62;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, d0 = 0.12 + 0.22 * hh(i, 50), d1 = 0.12 + 0.22 * hh((i + 1) % n, 50);
        const p = (ang, r, yy) => [x + Math.cos(ang) * r, yy, z + Math.sin(ang) * r];
        Q2.push([p(a, rc + 0.06, yc - d0), p(b, rc + 0.06, yc - d1), p(b, rc + 0.08, yc + 0.28), p(a, rc + 0.08, yc + 0.28), [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], [[0.95, 0.98, 1], [0.95, 0.98, 1], [0.9, 0.94, 0.96], [0.9, 0.94, 0.96]]]);
        Q2.push([p(a, 0.5, yc - d0 * 0.6), p(b, 0.5, yc - d1 * 0.6), p(b, rc + 0.06, yc - d1), p(a, rc + 0.06, yc - d0), [0, -1, 0], [0.9, 0.94, 0.97]]);
      }
      M.quads('ice', Q2, 2);
    });
  }
  LG.icePillarHead = icePillarHead;
  // ---- ice run down a wall and frozen there: a curtain of the hall's ice hung on the stone. Its top uneven and so thin that it fades into
  // the stone; spreading and wandering as it goes down and thickening, in vertical ribs where the water ran most, its two sides thinning
  // away into the wall too; from its foot the ribs hang on as icicles of different lengths, grown out of it (the same sheet drawn on down
  // to their points), the longest with a round point of ice under them. wallX: the wall's face, nx: which way it faces (+1, -1); zc,
  // width: across the wall; y0..y1: the curtain's foot and top (the icicles hang below the foot). Its colour by thickness - bluish and
  // see-through where thin, clouded white where thick - with how much it lets through (alpha) point by point: one mesh of its own for
  // all the curtains of the area (the material the hall's ice, w.mats.vc.ice, taking its alpha from its points)
  function iceRun(w, wallX, nx, zc, width, y0, y1) {
    const ay = w._atY || 0, H = y1 - y0, hh = (a, k) => _hn(zc * 1.3 + a, y1 * 0.7 + k, 120 + k);
    const NU = 16, NV = 9, ribs = [], nr = 7 + Math.floor(hh(0, 3) * 4);
    for (let k = 0; k < nr; k++) ribs.push({ c: (k + 0.2 + 0.6 * hh(k, 4)) / nr, w: 0.025 + 0.03 * hh(k, 5), t: 0.025 + 0.05 * hh(k, 6), L: (0.15 + 0.85 * Math.pow(hh(k, 7), 1.3)) * Math.min(2.2, 0.3 * H + 0.5) });
    const rib = (u, f) => { let s = 0; for (const r of ribs) s = Math.max(s, f(r) * Math.exp(-Math.pow((u - r.c) / r.w, 2))); return s; };
    const half = (v) => width / 2 * (0.45 + 0.55 * Math.pow(Math.min(1, Math.max(0, v)), 0.6)) * (1 + 0.1 * Math.sin(v * 6 + zc));
    // (its top and its foot across it: a few points eased between, so that the top is uneven without being toothed)
    const KT = [0, 1, 2, 3, 4, 5].map((q) => 0.02 + 0.16 * hh(q, 1)), KF = [0, 1, 2, 3, 4, 5].map((q) => 0.8 + 0.12 * hh(q, 2));
    const ease = (K, u) => { const f = Math.max(0, Math.min(0.999, u)) * 5, k = Math.floor(f), t = f - k, sm = t * t * (3 - 2 * t); return K[k] + (K[k + 1] - K[k]) * sm; };
    const top = [], foot = [], bot = [];
    for (let i = 0; i <= NU; i++) { const u = i / NU, ed = Math.abs(u - 0.5) * 2; top.push(ease(KT, u) + 0.1 * ed * ed); foot.push(ease(KF, u) - 0.08 * ed * ed); bot.push(foot[i] + rib(u, (r) => r.L) / H); }
    const thick = (u, v, i) => {
      const uu = (u - 0.5) * 2, edge = Math.sqrt(Math.max(0, 1 - uu * uu)), grow = _ss(top[i], top[i] + 0.35, v);
      let d = (0.008 + 0.02 * grow) * edge + rib(u, (r) => r.t) * (0.3 + 0.7 * grow);
      if (v > foot[i]) d *= Math.pow(Math.max(0, 1 - (v - foot[i]) / Math.max(1e-3, bot[i] - foot[i])), 0.6);
      return d;
    };
    // (into the area's one list of curtains, built into a mesh when the area is: its triangles counted with the mason's, as 'ice')
    if (!w._icurt) {
      const L = (w._icurt = { P: [], C: [], I: [] });
      Array.prototype.push.call(w.deferred, (root) => {
        if (!L.I.length) return;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(L.C, 4)); g.setIndex(L.I); g.computeVertexNormals();
        const U = []; for (let i = 0; i < L.P.length; i += 3) U.push(L.P[i + 2] / 2.5, L.P[i + 1] / 2.5); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        g.computeBoundingSphere();
        const base = (w.mats.vc && w.mats.vc.ice) || w.mats.ice, m = base.clone(); m.vertexColors = true; m.transparent = true; m.opacity = 0.92; m.depthWrite = false; m.name = 'icecurtain';
        const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.name = 'icecurtain';
        root.add(mesh); w._icurt = null;
      });
    }
    const L = w._icurt, P = L.P, C = L.C, I = L.I, b0 = P.length / 3, Pl = [], Il = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = top[i] + (bot[i] - top[i]) * j / NV, d = thick(u, v, i), uu = (u - 0.5) * 2, edge = Math.sqrt(Math.max(0, 1 - uu * uu)), grow = _ss(top[i], top[i] + 0.3, v);
      Pl.push(wallX + nx * (0.004 + d), ay + y1 - v * H, zc + uu * half(v));
      const k = Math.min(1, d / 0.05) * 0.85 + (j === NV ? 0.15 : 0), hang = v > foot[i] ? 1 : 0;
      const al = Math.max((0.45 + 0.55 * _ss(0, 0.035, d)) * _ss(0, 0.3, edge), hang * 0.88) * grow;
      C.push(0.62 + 0.38 * k, 0.72 + 0.28 * k, 0.82 + 0.18 * k, al);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; putTri(Pl, Il, a, c, b, (x) => x * nx); putTri(Pl, Il, b, c, d, (x) => x * nx); }
    // (the lower edge back to the wall: its thickness seen from below)
    const lb = Pl.length / 3;
    for (let i = 0; i <= NU; i++) { const k = NV * (NU + 1) + i; Pl.push(wallX + nx * 0.003, Pl[k * 3 + 1] + 0.01, Pl[k * 3 + 2]); C.push(0.82, 0.88, 0.92, 0.8); }
    for (let i = 0; i < NU; i++) { const a = NV * (NU + 1) + i, b = a + 1, c = lb + i, d = c + 1; putTri(Pl, Il, a, b, c, (x, y) => -y); putTri(Pl, Il, b, d, c, (x, y) => -y); }
    for (const q of Pl) P.push(q); for (const q of Il) I.push(q + b0);
    const M = mason(w); M.tris += Il.length / 3; M.by.ice = (M.by.ice || 0) + Il.length / 3;
    // (a round point of ice on the four longest: their tips carried on)
    _tagged('ice', () => {
      const LR = ribs.slice().sort((p, q) => q.L - p.L).slice(0, 4);
      for (const [k, r] of LR.entries()) { const i = Math.round(r.c * NU), uu = (i / NU - 0.5) * 2, v = bot[i] - (bot[i] - foot[i]) * 0.35; if (bot[i] - foot[i] < 0.08) continue; icicle(M, wallX + nx * (0.004 + r.t * 0.5), ay + y1 - v * H, zc + uu * half(Math.min(1, v)), r.t * 0.55, 0.25 + 0.5 * hh(k, 11), 80 + k); }
    });
  }
  LG.iceRun = iceRun;
  // ---- a fallen column (its box, along x or z, L long, r high and wide, stays as it was): its drums lying in a line where it fell, each
  // a little apart, turned and askew, the last broken short. Drawn only, by the place
  let _lyDrum = null;
  function fallenDrums(w, x, z, alongX, L, r) {
    const M = mason(w), ay = w._atY || 0, n = Math.max(2, Math.round(L / 1.1)), dl = L / n;
    if (!_lyDrum) { _lyDrum = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false); _lyDrum.translate(0, 0.5, 0); }
    const base = alongX ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    _tagged('ruins', () => {
      for (let i = 0; i < n; i++) {
        const h = (k) => _hn(x * 1.3 + i * 0.71, z * 1.1 - i * 0.37, 79 + k), u = -L / 2 + i * dl + dl * 0.03, len = dl * (i === n - 1 ? 0.55 + 0.3 * h(1) : 0.94), off = (h(2) - 0.5) * 0.1;
        const cx = alongX ? x + u : x + off, cz = alongX ? z + off : z + u, rr = r * (0.97 + 0.03 * h(5));
        const m = new THREE.Matrix4().makeTranslation(cx, ay + rr, cz).multiply(new THREE.Matrix4().makeRotationY((h(3) - 0.5) * 0.14)).multiply(base).multiply(new THREE.Matrix4().makeRotationY(h(4) * Math.PI)).multiply(new THREE.Matrix4().makeScale(rr, len, rr));
        const v = M.var(cx, ay, cz, 22), t = 0.84 + 0.12 * h(6);
        M.geo('trim', _lyDrum, m, { tint: [v[0] * t, v[1] * t, v[2] * t], gy: ay - 0.3, world: true, uv: 1.4 });
      }
    });
  }
  LG.fallenDrums = fallenDrums;
  // ---- a pedestal's mouldings (its box, hw either way of x, z from y0, h high, stays as it was and drawn): a base course standing out at
  // its foot, a weathering sloping in from it, a cornice under what stands on it (none with o.cap false: a statue brings its own band).
  // o.k: how far they stand out (1: 0.1 m)
  function pedestal(w, x, z, hw, y0, h, o) {
    o = o || {}; const M = mason(w), Y = (w._atY || 0) + y0, k = o.k ?? 1, v = M.var(x, Y, z, 30), tq = o.t || 0.95, t = [v[0] * tq, v[1] * tq, v[2] * tq];
    const sq = (a, ya, b, yb) => [[x - a, ya, z - a], [x + a, ya, z - a], [x - b, yb, z - b], [x + b, yb, z - b], [x - a, ya, z + a], [x + a, ya, z + a], [x - b, yb, z + b], [x + b, yb, z + b]];
    const og = (e) => Object.assign({ gy: Y, top: Y + h, tint: t, n: 0.003, uv: 1.4 }, e), bh = Math.min(0.15, h * 0.18), mk = o.mk || 'trim';
    _tagged('pedestals', () => {
      M.hexa(mk, sq(hw + 0.1 * k, Y - 0.01, hw + 0.1 * k, Y + bh), M.lo ? 0 : 0.015, og({ chip: 0.25, chipS: 0.035, foot: true }));
      M.hexa(mk, sq(hw + 0.08 * k, Y + bh, hw + 0.012, Y + bh + 0.09 * k), 0, og({}));
      if (o.cap === false) return;
      M.hexa(mk, sq(hw + 0.012, Y + h - 0.2 * k, hw + 0.08 * k, Y + h - 0.1 * k), 0, og({}));
      M.hexa(mk, sq(hw + 0.1 * k, Y + h - 0.1 * k, hw + 0.1 * k, Y + h + 0.012), M.lo ? 0 : 0.012, og({ chip: 0.2, chipS: 0.035 }));
    });
  }
  LG.pedestal = pedestal;
  // ---- a balustrade (its box x0..x1, z0..z1, h high stops you as it did, and is not drawn as a box): a plinth of long stones, a rail of
  // long stones on top, and between them balusters standing out of a panel set back 0.08 m - a blind balustrade, nothing to be seen
  // through where nothing passes - on its long face toward o.toward [x, z] (both long faces with o.both). o.posts: newel posts every that
  // many metres along it (boxes of their own): no baluster there. o.broken: here and there a baluster gone. Drawn only, by the place
  function balustrade(w, x0, z0, x1, z1, h, o) {
    o = o || {}; const M = mason(w), ay = w._atY || 0, along = x1 - x0 >= z1 - z0, ST = sideT(x0, z0, x1, z1), th = along ? z1 - z0 : x1 - x0, IN = 0.08;
    const v0 = M.var(x0 + x1, ay, z0 + z1, 31), tq = o.t || 0.92, tn = (k, f) => { const q = tq * (f || 1) * (0.94 + 0.1 * _hn(x0 + k * 1.3, z0 - k, 64)); return [v0[0] * q, v0[1] * q, v0[2] * q]; };
    const tw = o.toward ? (along ? (o.toward[1] > (z0 + z1) / 2 ? 'S' : 'N') : (o.toward[0] > (x0 + x1) / 2 ? 'E' : 'W')) : null;
    const relief = (along ? ['N', 'S'] : ['W', 'E']).filter((f) => o.both || f === tw), ins = (f) => (relief.includes(f) ? IN : 0);
    const y0 = ay + 0.14, y1 = ay + h - 0.1, Tf = along ? ST.S.T : ST.E.T, a0 = along ? x0 : z0, a1 = along ? x1 : z1;
    _tagged('balustrade', () => {
      // (the panel behind the balusters)
      if (along) M.box('trim', x0, y0 - 0.01, z0 + ins('N'), x1, y1 + 0.01, z1 - ins('S'), 0, { gy: ay, top: ay + h, tint: tn(1, 0.86), n: 0, uv: 1.6 });
      else M.box('trim', x0 + ins('W'), y0 - 0.01, z0, x1 - ins('E'), y1 + 0.01, z1, 0, { gy: ay, top: ay + h, tint: tn(1, 0.86), n: 0, uv: 1.6 });
      // (the plinth and the rail: long stones, a little proud of both faces)
      coping(w, Tf, a0, a1, ay - 0.01, y0, -th - 0.03, 0.03, { len: [1.1, 1.8], plain: true, foot: true, gy: ay, t: tq * 0.88 });
      coping(w, Tf, a0 - 0.02, a1 + 0.02, y1, ay + h + 0.06, -th - 0.045, 0.045, { len: [1.0, 1.6], gy: ay, t: tq });
      const P = o.pitch || 0.36, H2 = y1 - y0;
      for (const f of relief) {
        const q = ST[f];
        for (let a = q.a0 + P * 0.75; a < q.a1 - P * 0.5; a += P) {
          if (o.posts && a > o.posts - 0.6 && Math.abs(a - Math.round(a / o.posts) * o.posts) < 0.45) continue;
          if (o.broken && _hn(a * 1.7, x0 + z0, 65) < 0.18) continue;
          // (a baluster: a swelling foot up to its belly at 0.42 of its height, a neck narrowing to the rail; square, as cut)
          const k = _hn(a, x0 + z0 + h, 66), ya = y0 + H2 * 0.42, og = { gy: ay, top: ay + h, tint: tn(10 + k * 7), n: 0.002, uv: 1.4 };
          const bal = (yA, yB, wA, wB) => M.hexa('trim', [q.T(a - wA, yA, -IN - 0.01), q.T(a + wA, yA, -IN - 0.01), q.T(a - wB, yB, -IN - 0.01), q.T(a + wB, yB, -IN - 0.01), q.T(a - wA, yA, -0.005), q.T(a + wA, yA, -0.005), q.T(a - wB, yB, -0.005), q.T(a + wB, yB, -0.005)], 0, og);
          bal(y0, ya, 0.05, 0.08); bal(ya, y1, 0.08, 0.042);
        }
      }
    });
  }
  LG.balustrade = balustrade;
  // ---- the broken top of a stretch of ruined wall (a along it from a0 to a1 at y, its thickness d0..d1 in T(a, y, d)): the last course half
  // gone - a stone or two still on it, one shifted, one leaning out - and, now and then, one fallen at its foot (gy: the ground). The box
  // under it stays as it was; these stand on it (drawn only)
  function ruinTop(w, T, a0, a1, y, d0, d1, gy, o) {
    o = o || {}; const M = mason(w), mk = o.mk || 'wall', L = a1 - a0, p0 = T(a0, y, d0), h = (k) => _hn(p0[0] * 1.31 + k * 0.7, p0[2] * 1.17 + y, 75 + k);
    const n = L < 0.6 ? 1 : 1 + (h(1) < 0.55 ? 1 : 0), th = Math.abs(d1 - d0), dm = (d0 + d1) / 2;
    for (let i = 0; i < n; i++) {
      const len = Math.min(L * 0.8, 0.32 + 0.4 * h(2 + i)), a = a0 + (L - len) * (n === 1 ? h(3) : i ? 0.75 + 0.2 * h(4) : 0.05 * h(5)), hh = 0.18 + 0.12 * h(6 + i);
      const sh = (h(8 + i) - 0.5) * th * 0.35, tw = (h(10 + i) - 0.5) * 0.25, lean = h(12 + i) < 0.3 ? (h(13 + i) - 0.5) * 0.5 : 0;
      const c = T(a + len / 2, y, dm + sh), v = M.var(c[0], y, c[2], 15 + i), k = 0.86 + 0.14 * h(14 + i);
      // (the stone's turn about the vertical: the wall's way, a little off)
      const ax = T(a1, y, dm)[0] - T(a0, y, dm)[0], az = T(a1, y, dm)[2] - T(a0, y, dm)[2], ry = Math.atan2(-az, ax) + tw;
      M.blk(mk, c[0], y - 0.01, c[2], len / 2, y + hh, th * 0.42, ry, 0, { gy: o.gy ?? gy, top: y + hh, tint: [v[0] * k, v[1] * k, v[2] * k], n: 0.01, chip: 0.5, chipS: 0.06, uv: 1.6 }, [lean, lean * 0.5]);
    }
    // (a stone fallen from it, lying at the foot on one side or the other, turned and tilted)
    if (h(20) < (o.fall ?? 0.22) && y - gy > 1.2) {
      const side = h(21) < 0.5 ? -1 : 1, a = a0 + L * h(22), off = side < 0 ? d0 - 0.35 - 0.6 * h(23) : d1 + 0.35 + 0.6 * h(23), c = T(a, gy, off), v = M.var(c[0], gy, c[2], 19), s = 0.2 + 0.12 * h(24);
      M.blk(mk, c[0], gy - 0.03, c[2], s * 1.5, gy + s * 1.1, s, h(25) * 3, 0, { gy, top: gy + 0.4, tint: [v[0] * 0.8, v[1] * 0.8, v[2] * 0.8], n: 0.012, chip: 0.6, chipS: 0.06, uv: 1.6, foot: true }, [(h(26) - 0.5) * 0.5, (h(27) - 0.5) * 0.5]);
    }
  }
  LG.ruinTop = ruinTop;
  // frames for the four sides of a box from x0..x1, z0..z1 (looking out of it: d out positive); the north and south sides run its full length
  const sideT = (x0, z0, x1, z1) => ({ N: { T: (a, y, d) => [a, y, z0 - d], a0: x0, a1: x1 }, S: { T: (a, y, d) => [a, y, z1 + d], a0: x0, a1: x1 }, W: { T: (a, y, d) => [x0 - d, y, a], a0: z0, a1: z1 }, E: { T: (a, y, d) => [x1 + d, y, a], a0: z0, a1: z1 } });

  // ---- a pillar of stone (the boxes P.pillarSquare makes, the same, stopping you as they did; not drawn as boxes): its plinth, a base
  // moulding, the shaft in courses of stone, a capital flaring to its abacus. The shaft by the field: of square ashlar with its arrises
  // taken off (halls, works, forts, caverns), octagonal (crypts), round drums (the sky). o.broken: no capital, the top course ragged
  const _oct = {};
  function octGeo(drum) {
    const key = drum ? 'd' : 'o'; if (_oct[key]) return _oct[key];
    // (a course of unit apothem from y 0 to 1, its top and bottom edges bevelled 0.03 of a unit; the drum is round, 16 sides)
    const n = drum ? 16 : 8, R = drum ? 1 : 1 / Math.cos(Math.PI / 8), b = 0.035, rows = [[0, R - b], [b, R], [1 - b, R], [1, R - b]], P = [], I = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 + (drum ? 0 : Math.PI / 8); for (const [y, r] of rows) P.push(Math.cos(a) * r, y, Math.sin(a) * r); }
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const a = i * 4 + k, c = a + 4; I.push(a, a + 1, c, a + 1, c + 1, c); }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    if (!drum) g = g.toNonIndexed();   // (the octagon's faces are flat: their own normals)
    g.computeVertexNormals();
    return (_oct[key] = g);
  }
  function pillar(w, x, z, y0, h, s, mk, o) {
    o = o || {}; s = s || 0.9; mk = mk || 'block';
    const b = s / 2 + 0.15;
    hard(w, 'trim', x - b, y0, z - b, x + b, y0 + 0.45, z + b);
    hard(w, 'trim', x - b + 0.08, y0 + 0.45, z - b + 0.08, x + b - 0.08, y0 + 0.6, z + b - 0.08);
    hard(w, mk, x - s / 2, y0 + 0.6, z - s / 2, x + s / 2, y0 + h - 0.5, z + s / 2);
    hard(w, 'trim', x - b + 0.08, y0 + h - 0.5, z - b + 0.08, x + b - 0.08, y0 + h - 0.35, z + b - 0.08);
    hard(w, 'trim', x - b, y0 + h - 0.35, z - b, x + b, y0 + h, z + b);
    _tagged('pillar', () => pillarDraw(w, mason(w), x, z, y0 + (w._atY || 0), h, s, b, mk, o));
  }
  LG.pillar = pillar; LG.coping = coping;
  // a round arch of wedge stones for a field's own opening (archDraw below, its arguments less the mason)
  LG.archDraw = (w, T, half, y0, rise, dep, top, o) => _tagged('arches', () => archDraw(w, mason(w), T, half, y0, rise, dep, top, o));
  function pillarDraw(w, M, x, z, Y, h, s, b, mk, o) {
    const K = wallKind(w), style = o.style || (K === 'crypt' ? 'oct' : K === 'sky' ? 'drum' : 'square'), lo = M.lo;
    const sq = (hw, ya, hwb, yb) => [[x - hw, ya, z - hw], [x + hw, ya, z - hw], [x - hwb, yb, z - hwb], [x + hwb, yb, z - hwb], [x - hw, ya, z + hw], [x + hw, ya, z + hw], [x - hwb, yb, z + hwb], [x + hwb, yb, z + hwb]];
    const v0 = M.var(x, Y, z, 3), tn = (k) => { const q = 0.92 + 0.12 * _hn(x + k, z, 63); return [v0[0] * q, v0[1] * q, v0[2] * q]; }, og = (k, e) => Object.assign({ gy: Y, top: Y + h, tint: tn(k), n: 0.004, chip: 0.15, chipS: 0.045, uv: 1.4 }, e);
    // the plinth and the base moulding over it (a fillet, then a hollow drawing in to the shaft)
    M.hexa('trim', sq(b, Y - 0.01, b, Y + 0.45), o.lite ? 0 : 0.035, og(1, o.lite ? { chip: 0.35 } : {}));
    if (o.lite) M.hexa('trim', sq(b - 0.03, Y + 0.45, s / 2 + 0.035, Y + 0.6), 0, og(2, { chip: 0 }));
    else { M.hexa('trim', sq(b - 0.03, Y + 0.45, b - 0.07, Y + 0.51), 0.012, og(2, { chip: 0 })); M.hexa('trim', sq(b - 0.08, Y + 0.51, s / 2 + 0.035, Y + 0.6), 0.01, og(2, { chip: 0 })); }
    // the shaft, course by course (a broken one: up to its top, the last course ragged)
    const sy0 = Y + 0.6, sy1 = o.broken ? Y + h : Y + h - 0.5;
    // (o.lite, a hall of many pillars: the shaft above head height in courses of a metre, the mouldings without worked arrises)
    const cs = [sy0]; { let y = sy0; while (y < sy1 - 0.05) { const st = style === 'drum' ? 0.8 : o.lite && y > Y + 3.2 ? 1.0 : 0.62; y = Math.min(sy1, y + st); if (sy1 - y < 0.3) y = sy1; cs.push(y); } }
    const nC = cs.length - 1, mtx = new THREE.Matrix4();
    for (let k = 0; k < nC; k++) {
      const ya = cs[k], yb = cs[k + 1], ch = yb - ya, last = k === nC - 1, j = _hn(x * 0.7 + k, z * 0.9 - k, 64);
      if (style === 'square') {
        const hw = s / 2 - 0.004 + (j - 0.5) * 0.012, P = sq(hw, ya + 0.003, hw, yb - 0.003);
        if (o.broken && last) for (const c of [2, 3, 6, 7]) P[c][1] -= 0.05 + 0.12 * _hn(x + c, z + k, 65);
        M.hexa(mk, P, lo || o.lite || ya > Y + 3.2 ? 0 : 0.035, og(10 + k, { tint: tn(10 + k), chip: o.broken && last ? 0.7 : ya > Y + 3.2 ? 0.06 : 0.25, chipS: 0.06, uv: 1.6 }));
      } else {
        // (a course of the octagon or a drum: its middle a little off the line now and then, as drums settle)
        const off = style === 'drum' && o.broken ? (j - 0.5) * 0.05 : 0, rr = style === 'drum' ? s / 2 * 1.02 : s / 2;
        mtx.makeRotationY(style === 'drum' ? j * 3 : 0).premultiply(new THREE.Matrix4().makeTranslation(x + off, ya, z + off * 0.6)).multiply(new THREE.Matrix4().makeScale(rr, (o.broken && last ? ch * 0.82 : ch), rr));
        M.geo(mk, octGeo(style === 'drum'), mtx, { tint: tn(10 + k), gy: Y, top: Y + h, world: true, uv: 1.6, one: true });
      }
    }
    if (o.broken) return;
    // the capital: a neck ring, the bell flaring out to the abacus, the abacus
    const hy = Y + h;
    M.hexa('trim', sq(s / 2 + 0.03, hy - 0.5, s / 2 + 0.03, hy - 0.44), o.lite ? 0 : 0.01, og(3, { chip: 0 }));
    M.hexa('trim', sq(s / 2 + 0.02, hy - 0.44, b - 0.07, hy - 0.35), o.lite ? 0 : 0.012, og(3, { chip: 0 }));
    M.hexa('trim', sq(b, hy - 0.35, b, hy), o.lite ? 0 : 0.035, og(4, o.lite ? { chip: 0.3 } : {}));
  }

  // ---- an arch over an opening in a wall (archWall): frame T(u, y, d), u across from the middle, d through the wall 0..dep; the arch
  // springs at y0 from the jambs at u = ±half, rises to its crown, and the wall over it up to top is laid in courses round its back
  function archDraw(w, M, T, half, y0, rise, dep, top, o) {
    o = o || {}; const ST = o.mk || 'trim', FILL = o.fill || 'block', lo = M.lo, opt = (k) => ({ gy: o.gy ?? 0, top, tint: (() => { const p = T(k, y0, 0), v = M.var(p[0], y0 + k, p[2], 8); return [v[0] * 0.92, v[1] * 0.92, v[2] * 0.92]; })(), n: 0.006, chip: 0.15, chipS: 0.05, uv: 1.4 });
    const R = (half * half + rise * rise) / (2 * rise), yc = y0 + rise - R, a0 = Math.asin(Math.max(-1, Math.min(1, (y0 - yc) / R))), a1 = Math.PI - a0, TH = 0.62, n = 13;
    for (let j = 0; j < n; j++) {
      const b0 = a0 + (a1 - a0) * j / n, b1 = a0 + (a1 - a0) * (j + 1) / n, key = j === (n - 1) / 2, r1 = R + TH + (key ? 0.16 : 0), d0 = key ? -0.06 : -0.02, d1 = dep + (key ? 0.06 : 0.02), P = [];
      for (let kk = 0; kk < 8; kk++) { const bb = kk & 1 ? b1 : b0, r = kk & 2 ? r1 : R, dd = kk & 4 ? d1 : d0; P.push(T(Math.cos(bb) * r, yc + Math.sin(bb) * r, dd)); }
      M.hexa(ST, P, lo ? 0 : 0.03, opt(j));
    }
    // (the fill over the haunches and the crown, course by course, its inner ends against the arch's back; the skewback cut below
    // where the arch's first stone has its back)
    const ySk = yc + (R + TH) * Math.sin(a0), cot = a0 > 0.01 ? Math.cos(a0) / Math.sin(a0) : 0, Re = R + TH + 0.02;
    const ext = (y) => { if (a0 > 0.01 && y < ySk) return half + (y - y0) * cot + 0.03; const dy = y - yc; return dy >= Re ? 0 : Math.sqrt(Math.max(0, Re * Re - dy * dy)); };
    const OUT = o.out || half + 1.2;
    let yy = y0, ci = 0;
    while (yy < top - 0.04) {
      const hh = Math.min(top - yy, 0.5), y1 = yy + hh, uA = ext(yy), uB = ext(y1);
      for (const sg of [-1, 1]) {
        if (uA <= 0.02 && uB <= 0.02 && sg > 0) break;
        // (no further out than the opening's sides: past them the wall beside it is drawn as it was)
        const ua = Math.min(OUT, Math.max(0.0, uA)), ub = Math.min(OUT, Math.max(0.0, uB)), oa = uA <= 0.02 && uB <= 0.02 ? -OUT : sg * ua, ob = uA <= 0.02 && uB <= 0.02 ? -OUT : sg * ub;
        if (ua >= OUT - 0.02 && ub >= OUT - 0.02) continue;
        if (uA <= 0.02 && uB <= 0.02) M.hexa(FILL, [T(-OUT, yy, 0), T(OUT, yy, 0), T(-OUT, y1, 0), T(OUT, y1, 0), T(-OUT, yy, dep), T(OUT, yy, dep), T(-OUT, y1, dep), T(OUT, y1, dep)], 0, Object.assign(opt(30 + ci), { chip: 0, uv: 2.5, uvFix: true }));
        else { const e = sg * OUT; M.hexa(FILL, [T(oa, yy, 0), T(e, yy, 0), T(ob, y1, 0), T(e, y1, 0), T(oa, yy, dep), T(e, yy, dep), T(ob, y1, dep), T(e, y1, dep)], 0, Object.assign(opt(30 + ci), { chip: 0, uv: 2.5, uvFix: true })); }
      }
      yy = y1; ci++;
    }
  }

  // ---- the edge of a floor over the void (floors() with a pit): the floor drawn as one surface whose edge does not follow the grid of its
  // cells - the line through the middle of each step, broken a little by the place - its paving's thickness along the edge, and the rock
  // under it falling away (into the dark of a chasm, or narrowing down under an island in the sky). The boxes stay, undrawn
  function pitFloor(w, W, D, cells, mk, deep) {
    // (deep: a chasm in a field with walls round it - past the map's edge is wall, the floor runs on to it; else, in the sky, the void)
    const M = mason(w), lo = M.lo, at = (i, j) => { if (!deep && (i < 0 || j < 0 || i >= W || j >= D)) return 0; i = Math.max(0, Math.min(W - 1, i)); j = Math.max(0, Math.min(D - 1, j)); return cells[j * W + i]; };
    const X = (i) => (deep ? (i < 0 ? 0 : i >= W ? W : i + 0.5) : i + 0.5), Z = (j) => (deep ? (j < 0 ? 0 : j >= D ? D : j + 0.5) : j + 0.5);
    const G0 = { p: [], n: [], u: [], c: [], i: [] }, S = { p: [], n: [], u: [], c: [], i: [] }, RK = { p: [], n: [], u: [], c: [], i: [] };
    const vmap = new Map(), JIT = deep ? 0.12 : 0.3;
    const col = (x, z) => { const m = 0.93 + 0.1 * _vn(x * 0.35, z * 0.35, 3) + 0.04 * _vn(x * 1.7, z * 1.7, 4); return [m, m, m * 0.99]; };
    // a point of the top: on an edge between a floor sample and a pit one, moved along that edge by the place (so the line is not straight)
    const vtx = (x, z, key) => {
      if (key !== undefined && vmap.has(key)) return vmap.get(key);
      const k = G0.p.length / 3; G0.p.push(x, 0, z); G0.n.push(0, 1, 0); G0.u.push(x / 4, -z / 4); const c = col(x, z); G0.c.push(c[0], c[1], c[2]);
      if (key !== undefined) vmap.set(key, k); return k;
    };
    const edgeP = (ia, ja, ib, jb) => {
      // (the crossing on the edge from sample a (floor) to b (pit): half way, then slid along it by up to JIT of its length either way)
      const xa = X(ia), za = Z(ja), xb = X(ib), zb = Z(jb), hh = _hn(xa * 1.31 + xb * 0.7, za * 1.17 + zb * 0.53, 66), t = 0.5 + (hh - 0.5) * 2 * JIT;
      const key = 'e' + Math.min(ia * 4099 + ja, ib * 4099 + jb) + ':' + Math.max(ia * 4099 + ja, ib * 4099 + jb);
      return [vtx(xa + (xb - xa) * t, za + (zb - za) * t, key), xa + (xb - xa) * t, za + (zb - za) * t];
    };
    const corner = (i, j) => vtx(X(i), Z(j), 'c' + (i * 4099 + j));
    const segs = [];   // (the edge's pieces, each [x, z, x, z] with the floor on its left looking from the first point to the second)
    const tri = (a, b, c) => G0.i.push(a, c, b);   // (wound to face up)
    for (let j = -1; j < D; j++) {
      for (let i = -1; i < W; i++) {
        const s00 = at(i, j), s10 = at(i + 1, j), s11 = at(i + 1, j + 1), s01 = at(i, j + 1), code = s00 | (s10 << 1) | (s11 << 2) | (s01 << 3);
        if (!code) continue;
        if (code === 15) {
          // (a run of whole squares along the row: one quad)
          let i2 = i + 1; while (i2 < W - 1 && at(i2, j) && at(i2 + 1, j) && at(i2 + 1, j + 1) && at(i2, j + 1)) i2++;
          const a = corner(i, j), b = corner(i2, j), c = corner(i2, j + 1), d = corner(i, j + 1); tri(a, b, c); tri(a, c, d);
          i = i2 - 1; continue;
        }
        // (the corners of the square in order round it: 00, 10, 11, 01; and the edges between them)
        const C = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], V = [s00, s10, s11, s01], poly = [];
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) & 3;
          if (V[k]) poly.push({ v: corner(C[k][0], C[k][1]) });
          if (V[k] !== V[k2]) { const [fa, fb] = V[k] ? [C[k], C[k2]] : [C[k2], C[k]], e = edgeP(fa[0], fa[1], fb[0], fb[1]); poly.push({ v: e[0], x: e[1], z: e[2], out: !V[k] }); }
        }
        if (poly.length >= 3) for (let k = 1; k + 1 < poly.length; k++) tri(poly[0].v, poly[k].v, poly[k + 1].v);
        // (its piece of the edge: from the crossing where the floor begins (going round) to where it ends)
        const cr = poly.filter((q) => q.x !== undefined);
        if (cr.length === 2) { const [p, q] = cr[0].out ? [cr[1], cr[0]] : [cr[0], cr[1]]; segs.push([q.x, q.z, p.x, p.z]); }
        else if (cr.length === 4) { for (let k = 0; k < 4; k += 2) { const p = cr[k], q = cr[k + 1]; segs.push(p.out ? [p.x, p.z, q.x, q.z] : [q.x, q.z, p.x, p.z]); } }
      }
    }
    // the edge: the paving's broken thickness, then the rock under it. Each point of the edge is shared by the two pieces that meet at it
    // and pushed in along the mean of their outward ways (pushed along each piece's own, two pieces at an angle left a crack between them)
    const push = (B, x, y, z, nx, ny, nz, u, v, c) => { B.p.push(x, y, z); B.n.push(nx, ny, nz); B.u.push(u, v); B.c.push(c, c, c); return B.p.length / 3 - 1; };
    const pk = (x, z) => Math.round(x * 2000) + ',' + Math.round(z * 2000), PT = new Map();
    const pt = (x, z) => { const k = pk(x, z); let q = PT.get(k); if (!q) { q = { x, z, nx: 0, nz: 0, ix: null }; PT.set(k, q); } return q; };
    const SG = segs.map(([x0, z0, x1, z1]) => { let dx = x1 - x0, dz = z1 - z0; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const a = pt(x0, z0), b = pt(x1, z1); for (const q of [a, b]) { q.nx += -dz; q.nz += dx; } return { a, b }; });
    const bands = deep ? [[0, 0], [-0.42, 0.06], [-4, 0.5], [-9, 0.9], [-14.5, 1.1]] : [[0, 0], [-0.42, 0.06], [-1.8, 0.7], [-4.2, 2.1], [-8, 4.2]];
    for (const q of PT.values()) {
      const l = Math.hypot(q.nx, q.nz) || 1; q.nx /= l; q.nz /= l;
      const r = _hn(q.x * 3.1, q.z * 2.7, 67);
      // (the paving's face: from the top down 0.42, its foot a little in; then the rock, band by band, drawn in by the place)
      q.ix = bands.map(([y, inw], k) => {
        const j = k > 1 ? (_vn(q.x * 0.6 + k, q.z * 0.6, 68) - 0.3) * 0.9 : k === 1 ? 0.04 + 0.08 * r : 0, yy = y + (k > 1 ? (r - 0.5) * 0.6 : 0), d = inw + j;
        const x = q.x - q.nx * d, z = q.z - q.nz * d, uu = (q.x + q.z) * 0.5;
        return k <= 1 ? [push(S, x, yy, z, q.nx, k ? -0.2 : 0, q.nz, uu, -yy, k ? 0.75 : 0.9), k === 1 ? push(RK, x, yy, z, q.nx, 0, q.nz, uu / 2, -yy / 2, 0.85) : -1] : [-1, push(RK, x, yy, z, q.nx, 0, q.nz, uu / 2, -yy / 2, 0.85)];
      });
    }
    for (const { a, b } of SG) {
      S.i.push(a.ix[0][0], b.ix[1][0], b.ix[0][0], a.ix[0][0], a.ix[1][0], b.ix[1][0]);
      for (let k = 1; k + 1 < bands.length; k++) { const a0 = a.ix[k][1], b0 = b.ix[k][1], a1 = a.ix[k + 1][1], b1 = b.ix[k + 1][1]; RK.i.push(a0, b1, b0, a0, a1, b1); }
    }
    // (into the mason's lists: the top as floor, the paving's edge as the floor's stone, the rock as rock; normals of the rock worked out)
    const add = (mk2, B, flat, plain) => {
      if (!B.i.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2)); g.setIndex(B.i);
      if (!flat) g.computeVertexNormals();
      M.geo(mk2, g, new THREE.Matrix4().makeTranslation(0, w._atY || 0, 0), { tint: [1, 1, 1], gy: -3, plain });
    };
    _tagged('floor', () => { add(mk, G0, true, true); add(mk, S, false); add('rock', RK, false); });
  }

  // ---- a doorway's frame of timber (a house's): two posts inside the opening's jambs, a lintel over them out past the posts, set in the
  // wall's thickness; and a window's: its sill stone, a lintel. T(u, y, d): u across, d through the wall 0..dep
  function doorFrame(w, T, half, h, dep, o) {
    o = o || {}; const M = mason(w), mk = o.mk || 'woodDark';
    for (const sg of [-1, 1]) M.hexa(mk, [T(sg * half, 0, -0.03), T(sg * (half - 0.12), 0, -0.03), T(sg * half, h, -0.03), T(sg * (half - 0.12), h, -0.03), T(sg * half, 0, dep + 0.03), T(sg * (half - 0.12), 0, dep + 0.03), T(sg * half, h, dep + 0.03), T(sg * (half - 0.12), h, dep + 0.03)], M.lo ? 0 : 0.015, { gy: 0, top: h, tint: [0.85, 0.82, 0.78], n: 0.008, uv: 1 });
    M.hexa(mk, [T(-half - 0.25, h, -0.05), T(half + 0.25, h, -0.05), T(-half - 0.25, h + 0.24, -0.05), T(half + 0.25, h + 0.24, -0.05), T(-half - 0.25, h, dep + 0.05), T(half + 0.25, h, dep + 0.05), T(-half - 0.25, h + 0.24, dep + 0.05), T(half + 0.25, h + 0.24, dep + 0.05)], M.lo ? 0 : 0.02, { gy: 0, top: h, tint: [0.8, 0.77, 0.74], n: 0.012, uv: 1 });
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
      w.skyCap(0, h, s.z0, cx - s.hwL, s.z1); w.skyCap(cx + s.hwR, h, s.z0, W, s.z1); // (the canyon's rims: no way up onto them)
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
      if (OUT === 'ruins') {
        // two ranges of mountains round the whole horizon (mountains() below). The dice are thrown as they were for the cones that
        // once stood in a ring, so that everything thrown after them falls as before: the heights they give turn the ranges and lift
        // or lower them a little, so that no two areas show the same horizon
        const hs = [];
        for (let i = 0; i < 26; i++) { rng.range(-0.1, 0.1); rng.range(170, 230); hs.push(rng.range(35, 90)); rng.range(30, 60); rng.range(30, 60); }
        mountains(w, grp, cx, cz, hs);
        // tree line beyond the city walls (not where the area hangs over the abyss: w.noGround)
        if (!w.noGround) for (let i = 0; i < 70; i++) {
          const a = rng.range(0, Math.PI * 2), r = rng.range(Math.max(W, D) * 0.75, Math.max(W, D) * 1.3);
          tree(grp, w, cx + Math.cos(a) * r, -0.5, cz + Math.sin(a) * r, rng, rng.range(1.2, 2.2));
        }
        // (the ground beyond the walls: in a grassy field, the field's own turf - its picture, in broad patches lighter and darker - not
        // one flat colour; over the abyss, far below, a plain dark floor)
        let ground;
        if (w.mats.biome.floorTex === 'grass' && !w.noGround) {
          const gg = new THREE.PlaneGeometry(900, 900, 40, 40), uv = gg.attributes.uv, ps = gg.attributes.position, col = new Float32Array(ps.count * 3);
          for (let i = 0; i < ps.count; i++) {
            uv.setXY(i, uv.getX(i) * 150, uv.getY(i) * 150);
            const x = ps.getX(i), y = ps.getY(i), v = 0.66 + 0.42 * (0.5 + 0.5 * (0.7 * _gn(x / 75, y / 75, 0, 0, 91) + 0.3 * _gn(x / 23, y / 23, 0, 0, 92)));
            col[i * 3] = v * 1.02; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.94;
          }
          gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
          ground = new THREE.Mesh(gg, w.mats.vc.floor); ground.receiveShadow = true;
        } else ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: w.mats.biome.groundCol ?? (w.mats.biome.night ? 0x1c2416 : 0x3e4a26), roughness: 1 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(cx, w.noGround ? -140 : -0.6, cz); grp.add(ground);
      } else {
        // sea of clouds far below + floating islets
        const ct = G.Tex.spr.cloud; ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
        const cc = w.mats.biome.cloudCol ?? 0xffffff;
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: ct, color: cc, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
        sea.material.map.repeat && sea.material.map.repeat.set(1, 1);
        sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -40, cz); grp.add(sea);
        const under = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: w.mats.biome.cloudCol ? 0x0a0614 : 0xe8f0ff, fog: false }));
        // (what shows of it through the sea of cloud at the horizon is the air's colour: the fog's, as the sky's mood has it now - a dark
        // board there was a black band along the edge of the world)
        under.onBeforeRender = (r, sc) => { if (sc && sc.fog) under.material.color.copy(sc.fog.color); };
        under.rotation.x = -Math.PI / 2; under.position.set(cx, -42, cz); grp.add(under);
        for (let i = 0; i < 60; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.cloud, color: cc, transparent: true, opacity: rng.range(0.5, 0.9), depthWrite: false, fog: false }));
          const a = rng.range(0, Math.PI * 2), r = rng.range(70, 320);
          sp.position.set(cx + Math.cos(a) * r, rng.range(-38, -10), cz + Math.sin(a) * r); sp.scale.setScalar(rng.range(40, 110)); grp.add(sp);
          w.animated.push({ kind: 'cloud', m: sp, sp: rng.range(0.5, 2) });
        }
        const rockM = w.mats.rock, grassM = new THREE.MeshStandardMaterial({ color: w.mats.biome.isletGrass ?? 0x8ab05a, roughness: 0.95 });
        for (let i = 0; i < 14; i++) {
          const a = rng.range(0, Math.PI * 2), r0 = rng.range(Math.max(W, D) * 0.8, 170), s = rng.range(5, 16), r = Math.max(r0, Math.hypot(W, D) / 2 + s * 1.2 + 8); // (clear of the area's corners, its tree and all: never over the floor)
          const g = new THREE.Group(); g.position.set(cx + Math.cos(a) * r, rng.range(-12, 25), cz + Math.sin(a) * r);
          // (rock in ledges under a rim that is no circle, turf with a lip over it: it was a cone point down with a disc on it)
          const rk = new THREE.Mesh(hangRock(i % 4), rockM); rk.scale.set(s, s, s); g.add(rk);
          const top = new THREE.Mesh(hangTurf(i % 4), grassM); top.scale.set(s, s, s); g.add(top);
          const fr = hangFringe(i % 4), TM = treeMats(w); for (const [geo, m] of [[fr.roots, TM.twig], [fr.leaf, TM.leaf]]) { const o = new THREE.Mesh(geo, m); o.scale.set(s, s, s); g.add(o); }
          if (rng.chance(0.6)) tree(g, w, 0, 0, 0, rng, s * 0.15);
          grp.add(g); w.animated.push({ kind: 'islet', m: g, y0: g.position.y, ph: rng.range(0, 6) });
        }
        // the play area itself is an island: hang rock below its rim
        if (!w.noRim) { const rim = new THREE.Mesh(hangRock(5), rockM); rim.scale.set(Math.max(W, D) * 0.66, 34 / 1.4, Math.max(W, D) * 0.66); rim.position.set(cx, -14, cz); grp.add(rim); } // (noRim: islands each carry their own rock)
      }
    });
  }
  // (shapes made once, by a noise of their own: nothing here throws the area's dice)
  const _hn = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const _vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return _hn(xi, yi, s) * (1 - u) * (1 - v) + _hn(xi + 1, yi, s) * u * (1 - v) + _hn(xi, yi + 1, s) * (1 - u) * v + _hn(xi + 1, yi + 1, s) * u * v; };
  const _shape = {};
  // an integer hash, 0..1
  const _ih = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const _GD = [1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071, -0.7071];
  // gradient noise, about -1..1; it repeats every Pu along u (and every Pv along v) when they are given (whole numbers)
  function _gn(u, v, Pu, Pv, s) {
    const ui = Math.floor(u), vi = Math.floor(v), fu = u - ui, fv = v - vi;
    let a0 = ui, a1 = ui + 1, b0 = vi, b1 = vi + 1;
    if (Pu) { a0 = ((ui % Pu) + Pu) % Pu; a1 = (a0 + 1) % Pu; }
    if (Pv) { b0 = ((vi % Pv) + Pv) % Pv; b1 = (b0 + 1) % Pv; }
    const k00 = ((_ih(a0, b0, s) * 8) | 0) * 2, k10 = ((_ih(a1, b0, s) * 8) | 0) * 2, k01 = ((_ih(a0, b1, s) * 8) | 0) * 2, k11 = ((_ih(a1, b1, s) * 8) | 0) * 2;
    const n00 = _GD[k00] * fu + _GD[k00 + 1] * fv, n10 = _GD[k10] * (fu - 1) + _GD[k10 + 1] * fv, n01 = _GD[k01] * fu + _GD[k01 + 1] * (fv - 1), n11 = _GD[k11] * (fu - 1) + _GD[k11 + 1] * (fv - 1);
    const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10), sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
    const x0 = n00 + (n10 - n00) * su, x1 = n01 + (n11 - n01) * su;
    return (x0 + (x1 - x0) * sv) * 1.4;
  }
  const _cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const _ss = (a, b, x) => { const t = _cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // a little generator of its own for the shapes (seeded by the shape, never by the area)
  const _prng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // ================================================================ the far country
  // How it looks in each field: the build of its ranges (style), the bare rock, what grows on the lower slopes (vegK how much, vegY up
  // to about where), the snow (from snowY up, snowK how much), and the trees beyond the walls (con: the share of conifers, dead: of dead
  // ones; the rest broad-leaved)
  const FARLOOK = {
    dusk: { style: 'alpine', rock: '#8a7664', veg: '#5a5834', vegK: 0.55, vegY: 42, snowY: 80, snowK: 0.85, con: 0, dead: 0.1 },
    ruins: { style: 'alpine', rock: '#8a7664', veg: '#5a5834', vegK: 0.55, vegY: 42, snowY: 80, snowK: 0.85, con: 0, dead: 0 },
    hamlet: { style: 'alpine', rock: '#6c6862', veg: '#1e2c1e', vegK: 0.95, vegY: 60, snowY: 84, snowK: 0.75, con: 0.55, dead: 0.15 },
    grave: { style: 'alpine', rock: '#686662', veg: '#222c20', vegK: 0.85, vegY: 50, snowY: 90, snowK: 0.6, con: 0.25, dead: 0.55 },
    castle: { style: 'jagged', rock: '#54403c', veg: '#2c221a', vegK: 0.45, vegY: 32, snowY: 999, snowK: 0, con: 0.25, dead: 0.75 },
    bloodmoon: { style: 'jagged', rock: '#54403c', veg: '#2c221a', vegK: 0.45, vegY: 32, snowY: 999, snowK: 0, con: 0.25, dead: 0.75 },
    battlefield: { style: 'hills', rock: '#76726a', veg: '#4c4e36', vegK: 0.9, vegY: 66, snowY: 86, snowK: 0.7, con: 0.15, dead: 0.5 },
    sanctum: { style: 'alpine', rock: '#8a8478', veg: '#7a8a6a', vegK: 0.6, vegY: 45, snowY: 999, snowK: 0, con: 0, dead: 0 },
    sky: { style: 'alpine', rock: '#8a8478', veg: '#7a8a6a', vegK: 0.6, vegY: 45, snowY: 999, snowK: 0, con: 0, dead: 0 },
    crimson: { style: 'jagged', rock: '#40283a', veg: '#2a1626', vegK: 0.2, vegY: 20, snowY: 999, snowK: 0, con: 0, dead: 1 },
  };
  const farLook = (w) => FARLOOK[w.biome] || FARLOOK[w.field] || { style: 'alpine', rock: w.mats.biome.rock || '#6a6660', veg: w.mats.biome.grassTint || '#3a4a2c', vegK: 0.6, vegY: 45, snowY: 88, snowK: 0.6, con: 0.2, dead: 0.2 };

  // ---- the mountains: one height field over a ring R0..R1 m out from the middle, made once a build and kept. Not a wall of range
  // round the field: a country of peaks laid out over the ground (noise over x and z, not along the ring), some nearer, some farther,
  // so that ridge stands behind ridge and the valleys between them run back into the range; the farther, the higher they rise (H0 at
  // the ring's inside to H1 at its outside). Over the massifs (cells of cB m: broad valleys, peaks sharpened by the power pk) lies
  // ridged noise (cells of cD m, A m high: about a third of its cell, the slopes of a real range and not needles): spurs and the gullies
  // between them that water and ice cut, sharp along their ridges and smooth in the hollows (each finer octave counts only where the
  // coarser made a ridge), more of it on the heights. The foot rises out of the plain over 45 m; a skirt from it straight down into the
  // dark, for the fields over the abyss. N x M: columns round x rows out (closer near the inside)
  const MTN = {
    alpine: { R0: 160, R1: 360, H0: 58, H1: 140, cB: 210, cD: 55, A: 26, oct: 5, sharp: 1.25, rid: 1, pk: 1.3, N: 1000, M: 44, seed: 11 },
    jagged: { R0: 160, R1: 360, H0: 60, H1: 135, cB: 170, cD: 42, A: 28, oct: 5, sharp: 1.8, rid: 1, pk: 1.55, N: 1000, M: 44, seed: 51 },
    hills: { R0: 160, R1: 360, H0: 30, H1: 128, cB: 260, cD: 80, A: 14, oct: 5, sharp: 1, rid: 0.35, pk: 1.15, N: 1000, M: 44, seed: 31 },
  };
  function mtnGeo(style) {
    const key = 'mtn_' + style; if (_shape[key]) return _shape[key];
    const p = MTN[style], N = p.N, M = p.M, rows = M + 2, S = p.seed;
    const pos = new Float32Array(N * rows * 3), col = new Float32Array(N * rows * 3), Y = new Float32Array(N * rows);
    for (let j = 0; j < rows; j++) {
      const t = j ? Math.pow((j - 1) / M, 1.25) : 0, r = j ? p.R0 + (p.R1 - p.R0) * t : p.R0 - 3;
      const Hr = p.H0 + (p.H1 - p.H0) * _ss(p.R0 + 10, p.R1 - 30, r), mask = _ss(p.R0, p.R0 + 45, r);
      for (let i = 0; i < N; i++) {
        const th = i / N * Math.PI * 2, x = Math.cos(th) * r, z = Math.sin(th) * r, q = (j * N + i) * 3;
        let y = -170, rv = 0;
        if (j) {
          // (the massifs, the ground bent first so that nothing lines up)
          const wx = x + 45 * _gn(x / 320, z / 320, 0, 0, S + 1), wz = z + 45 * _gn(x / 320 + 7.3, z / 320 - 2.1, 0, 0, S + 2);
          let f = 0, a = 1, fq = 1 / p.cB, n = 0; for (let o = 0; o < 4; o++) { f += _gn(wx * fq, wz * fq, 0, 0, S + 3 + o) * a; n += a; a *= 0.5; fq *= 2.03; }
          const P = Math.pow(_cl(0.5 + 0.62 * f / n, 0, 1), p.pk);
          // (the spurs and gullies)
          let sum = 0, amp = 1, g = 1 / p.cD, wgt = 1, nrm = 0, fb = 0;
          for (let o = 0; o < p.oct; o++) { const gg = _gn(wx * g + 31.7, wz * g - 12.9, 0, 0, S + 10 + o); let nn = 1 - Math.abs(gg); nn *= nn; nn *= wgt; wgt = _cl(nn * 2.2, 0, 1); sum += nn * amp; fb += gg * amp; nrm += amp; amp *= 0.5; g *= 2.02; }
          rv = _cl(sum / nrm / 0.62, 0, 1);
          const sh = p.rid * Math.pow(rv, p.sharp) + (1 - p.rid) * _cl(0.5 + 0.6 * fb / nrm, 0, 1);
          y = mask * (Hr * (0.05 + 0.95 * P) + p.A * (sh - 0.3) * (0.3 + 0.7 * P));
          col[q + 2] = 0.5 + 0.5 * _gn(wx / 90, wz / 90, 0, 0, S + 30);
        }
        pos[q] = x; pos[q + 1] = y; pos[q + 2] = z; Y[j * N + i] = y; col[q + 1] = rv;
      }
    }
    // (the hollows darker, the ridges lighter: how far a point stands above or below its neighbours)
    for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i, l = j * N + (i + N - 1) % N, rr = j * N + (i + 1) % N, dn = Math.max(1, j - 1) * N + i, up = Math.min(rows - 1, j + 1) * N + i;
      col[c * 3] = j === 0 ? 0.6 : _cl(0.84 + (Y[c] - (Y[l] + Y[rr] + Y[dn] + Y[up]) / 4) * 0.1, 0.38, 1.12);
    }
    const idx = new Uint32Array(N * (rows - 1) * 6); let n = 0;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i, b = j * N + (i + 1) % N, c = a + N, d = b + N;
      // (each quad split along the diagonal that keeps to the ground: a ridge is not cut across)
      if (Math.abs(Y[a] - Y[d]) < Math.abs(Y[b] - Y[c])) { idx[n++] = a; idx[n++] = b; idx[n++] = d; idx[n++] = a; idx[n++] = d; idx[n++] = c; }
      else { idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = b; idx[n++] = d; idx[n++] = c; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.userData.shared = true;
    return (_shape[key] = g);
  }
  // The far country's own shading (mountains and the far towers): the light comes from the scene's own lights, read every frame (the
  // mood of the area, the dread of a guardian's road, the area's sky all move them); the sun's direction is the one the sky draws its
  // disc in. Rock with strata in it and a grain of crags; grass, scrub or forest on the gentler and lower slopes; snow above its line,
  // lying in the gullies and blown off the steep; and then the air: the farther, the more of the horizon's colour, and toward the
  // foot a layer of mist the colour of the fog that the ground before it fades into. Not fogged by the scene: it does its own air.
  const FAR_VS = `varying vec3 vWP; varying vec3 vN; varying vec3 vC; varying vec2 vU;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vC = color; vU = uv;
      vec3 n = normalMatrix * normal; mat3 vm = mat3(viewMatrix); vN = vec3(dot(vm[0], n), dot(vm[1], n), dot(vm[2], n));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const FAR_FS = `uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uSkyC; uniform vec3 uGndC; uniform vec3 uHor; uniform vec3 uFog;
    uniform vec3 uRock; uniform vec3 uVeg; uniform vec3 uSnow; uniform vec4 uLine; uniform vec4 uAir; uniform float uKind; uniform float uFogD; uniform float uFogCap;
    varying vec3 vWP; varying vec3 vN; varying vec3 vC; varying vec2 vU;
    float fh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main() {
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      float y = vWP.y; vec2 p = vWP.xz; vec3 alb; float ao;
      if (uKind < 0.5) {
        ao = vC.x;
        float b0 = fn(p * 0.13), bx = fn(p * 0.13 + vec2(0.2, 0.0)), bz = fn(p * 0.13 + vec2(0.0, 0.2)), b1 = fn(p * 0.5 + 9.0), b1x = fn(p * 0.5 + vec2(9.2, 9.0)), b1z = fn(p * 0.5 + vec2(9.0, 9.2));
        N = normalize(N + vec3(b0 - bx, 0.0, b0 - bz) * 2.4 + vec3(b1 - b1x, 0.0, b1 - b1z) * 0.9);
        float slope = 1.0 - N.y;
        float n1 = fn(p * 0.017 + 3.1), n2 = fn(p * 0.071 + 7.7), n3 = fn(p * 0.29 + 1.3);
        float strata = fn(vec2(y * 0.21 + n1 * 5.0, n2 * 2.0 + p.x * 0.004));
        vec3 rock = uRock * (0.58 + 0.55 * n2) * (0.8 + 0.38 * strata) * (0.72 + 0.56 * vC.z);
        float veg = uLine.z * smoothstep(0.52, 0.27, slope + (n1 - 0.5) * 0.32) * smoothstep(uLine.w + 20.0, uLine.w - 14.0, y + (n2 - 0.5) * 34.0 + vC.y * 18.0);
        alb = mix(rock, uVeg * (0.5 + 0.9 * n3) * (0.75 + 0.5 * n1), veg);
        float sn = uLine.y * smoothstep(uLine.x - 8.0, uLine.x + 16.0, y + (n1 - 0.5) * 44.0 + (1.0 - ao) * 34.0) * smoothstep(0.7, 0.38, slope + (n2 - 0.5) * 0.28 + vC.y * 0.14);
        alb = mix(alb, uSnow * (0.82 + 0.18 * n3), sn); ao = mix(ao, 1.0, sn * 0.55);
      } else {
        // (the far towers: the colour they were made with; courses of stone; on the walls, some of the windows dark)
        alb = vC; ao = 1.0;
        if (vU.x >= 0.0) {
          vec2 c = floor(vU / vec2(2.6, 5.2)), f = fract(vU / vec2(2.6, 5.2));
          float on = step(0.66, fh(c + 17.0)), big = step(0.75, fh(c + 31.0)), hw = mix(0.06, 0.15, big), tp = mix(0.6, 0.7, big);
          float win = on * step(abs(f.x - 0.5), hw) * step(0.3, f.y) * step(f.y, tp);
          win = max(win, on * big * step(length(vec2((f.x - 0.5) / hw, (f.y - tp) / 0.08)), 1.0));
          float streak = smoothstep(0.55, 1.0, fn(vec2(vU.x * 1.3, vU.y * 0.06))) * 0.18;
          alb *= (1.0 - 0.78 * win) * (1.0 - streak) * (0.9 + 0.1 * smoothstep(0.0, 0.12, fract(vU.y / 0.66))) * (0.8 + 0.4 * fn(vU * vec2(0.4, 0.15)));
        }
      }
      float ndl = max(dot(N, uSun), 0.0);
      vec3 col = alb * (uSunC * ndl + mix(uGndC, uSkyC, N.y * 0.5 + 0.5) * 0.7) * ao;
      float d = length(vWP - cameraPosition);
      float fd = uFogD * d, haze = max(uAir.y * (1.0 - exp(-max(d - 120.0, 0.0) * uAir.x)), uFogCap * (1.0 - exp(-fd * fd)));
      float mist = uAir.w * exp(-max(y + 4.0, 0.0) / uAir.z);
      vec3 air = mix(uFog, uHor, smoothstep(-10.0, 90.0, y));
      col = mix(col, air, clamp(haze + mist, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;
  // (one set of uniforms an area, shared by its mountains and its far towers; kind 0: mountain, 1: masonry)
  function farMat(w, kind) {
    let F = w._far;
    if (!F) {
      const look = farLook(w), B0 = w.envOverride ? Object.assign({}, w.mats.biome, w.envOverride) : w.mats.biome;
      const u = {
        uSun: { value: new THREE.Vector3(...(B0.sunDir || [0.3, 0.6, -0.5])).normalize() }, uSunC: { value: new THREE.Color(0, 0, 0) }, uSkyC: { value: new THREE.Color(0, 0, 0) }, uGndC: { value: new THREE.Color(0, 0, 0) },
        uHor: { value: new THREE.Color(B0.sky ? B0.sky[2] : B0.fog) }, uFog: { value: new THREE.Color(B0.fog) },
        uRock: { value: new THREE.Color(look.rock) }, uVeg: { value: new THREE.Color(look.veg) }, uSnow: { value: new THREE.Color('#d2d6de') },
        uLine: { value: new THREE.Vector4(look.snowY, look.snowK, look.vegK, look.vegY) }, uAir: { value: new THREE.Vector4(0.004, 0.55, 12, 0.8) }, uFogD: { value: 0 },
        uFogCap: { value: 0.6 },
      };
      const mk = (k) => new THREE.ShaderMaterial({ uniforms: Object.assign({}, u, { uKind: { value: k } }), vertexShader: FAR_VS, fragmentShader: FAR_FS, vertexColors: true, side: THREE.DoubleSide, fog: false });
      F = w._far = { u, mtn: mk(0), bld: mk(1) }; F.mtn.name = 'far_mountain'; F.bld.name = 'far_masonry'; F.mtn.userData.w = F.bld.userData.w = w;
    }
    return kind ? F.bld : F.mtn;
  }
  const _fl = { sun: null, hemi: null, amb: null }, _fc = new THREE.Color();
  function farSync(renderer, scene, camera, geometry, material) {
    const u = material.uniforms;
    if (!_fl.sun || _fl.sun.parent !== scene) { _fl.sun = _fl.hemi = _fl.amb = null; for (const c of scene.children) { if (c.isDirectionalLight && !_fl.sun) _fl.sun = c; else if (c.isHemisphereLight && !_fl.hemi) _fl.hemi = c; else if (c.isAmbientLight && !_fl.amb) _fl.amb = c; } }
    const K = 1 / Math.PI, h = _fl.hemi, a = _fl.amb;
    if (_fl.sun) u.uSunC.value.copy(_fl.sun.color).multiplyScalar(_fl.sun.intensity * K);
    u.uSkyC.value.setRGB(0, 0, 0); u.uGndC.value.setRGB(0, 0, 0);
    if (h) { u.uSkyC.value.copy(h.color).multiplyScalar(h.intensity * K); u.uGndC.value.copy(h.groundColor).multiplyScalar(h.intensity * K); }
    if (a) { _fc.copy(a.color).multiplyScalar(a.intensity * K); u.uSkyC.value.add(_fc); u.uGndC.value.add(_fc); }
    if (scene.background && scene.background.isColor) u.uHor.value.copy(scene.background);
    if (scene.fog) { u.uFog.value.copy(scene.fog.color); u.uFogD.value = scene.fog.isFogExp2 ? scene.fog.density : 0; }
    // the area's sky mood (skyvary.js, w.sky): the horizon the air takes the far country into is the mood's, not the field's own table
    // (an overcast or a blood-red mood paints its own), and in a mood of thick fog the air may take the far country wholly, as it takes
    // all else (the cap is for the field's own clear air, where the ranges are to be seen)
    const w = material.userData.w;
    if (w && G.Sky && G.Sky.env) {
      if (material.userData.skyV !== w.sky || !material.userData.horC) {
        material.userData.skyV = w.sky;
        const B0 = w.envOverride ? Object.assign({}, w.mats.biome, w.envOverride) : w.mats.biome, B = G.Sky.env(B0, w.sky) || B0;
        material.userData.horC = new THREE.Color(B.sky ? B.sky[2] : B.fog);
        material.userData.fogCap = 0.6 + 0.4 * _ss(1.15, 2.2, (B.fogD || 0) / Math.max(1e-6, B0.fogD || 1e-6));
      }
      u.uHor.value.copy(material.userData.horC); u.uFogCap.value = material.userData.fogCap;
    }
  }
  LG.farMat = farMat; LG.farSync = farSync;
  function mountains(w, grp, cx, cz, hs) {
    if (G.save && G.save.data && G.save.data.settings && G.save.data.settings.quality === 'low') return;   // (past the 110 m the low setting draws at all)
    const look = farLook(w), mat = farMat(w, 0);
    const m = new THREE.Mesh(mtnGeo(look.style), mat);
    m.position.set(cx, 0, cz); m.rotation.y = (hs[3] - 35) / 55 * Math.PI * 2; m.scale.set(hs[7] < 62.5 ? 1 : -1, 0.88 + (hs[5] - 35) / 55 * 0.24, 1);
    m.frustumCulled = false; m.onBeforeRender = farSync; grp.add(m);
  }

  // ================================================================ the floating islands
  // the rim of an island seen from above: not a circle. a: the angle, k: which island
  const rimR = (a, k) => { const N = 6; let v = 0; for (let j = 1; j <= 3; j++) { const q = a / (Math.PI * 2) * (N * j); const i0 = Math.floor(q), f = q - i0, u = f * f * (3 - 2 * f); v += (_hn(i0 % (N * j), j, 20 + k) * (1 - u) + _hn((i0 + 1) % (N * j), j, 20 + k) * u) / j; } return 0.8 + v * 0.2; };
  // rock hanging under an island: its top at y = 0 with the island's rim, down 1.4 to a point; in ledges that are not level (each
  // breaks off a little higher or lower round the island, an overhang under it), the rock between split into ribs by the cracks that
  // run down it, torn and lumpy, never a cone
  function hangRock(k) {
    const key = 'rock' + k; if (_shape[key]) return _shape[key];
    const NA = 72, NT = 22, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NT; j++) {
      const t = j / NT;
      for (let i = 0; i <= NA; i++) {
        const a = i / NA * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), u = i / NA;
        const lv = 0.07 * _gn(u * 6, 0.5, 6, 0, 60 + k), step = Math.floor(_cl(t + lv, 0, 0.999) * 5) / 5, tt = t * 0.55 + step * 0.45;   // (ledges: it narrows in steps)
        const lm = 0.5 + 0.5 * _gn(u * 9, t * 5, 9, 0, 30 + k), rib = 1 - Math.abs(_gn(u * 28, t * 2.5, 28, 0, 50 + k)), rb = rib * rib;
        const r = rimR(a, k) * Math.pow(1 - tt, 0.62) * (0.82 + 0.36 * lm) * (0.93 + 0.1 * rb) * (1 - 0.04 * Math.sin(a * 3 + k));
        const lean = t * t * 0.18;
        pos.push(ca * r + lean * Math.cos(k * 2.1), -t * 1.4, sa * r + lean * Math.sin(k * 2.1)); uv.push(u * 8, t * 3);
      }
    }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return (_shape[key] = g);
  }
  // the turf on it: the same rim, a low mound, a lip that hangs a little over the rock
  function hangTurf(k) {
    const key = 'turf' + k; if (_shape[key]) return _shape[key];
    const NA = 40, pos = [0, 0.1, 0], idx = [];
    for (const [rr, y] of [[0.6, 0.09], [1.03, 0.04], [1.05, -0.03], [0.98, -0.09]]) for (let i = 0; i < NA; i++) { const a = i / NA * Math.PI * 2, r = rimR(a, k) * rr; pos.push(Math.cos(a) * r, y + (rr < 1 ? _hn(i, 3, 40 + k) * 0.03 : 0), Math.sin(a) * r); }
    for (let i = 0; i < NA; i++) idx.push(0, 1 + (i + 1) % NA, 1 + i);
    for (let j = 0; j < 3; j++) for (let i = 0; i < NA; i++) { const a = 1 + j * NA + i, b = 1 + j * NA + (i + 1) % NA, c = a + NA, d = b + NA; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return (_shape[key] = g);
  }
  // what hangs from an island's edge: roots out of the rock (cards of bare twigs, hanging), and the island's growth draped over its lip
  // (cards of twigs in leaf); both stir in the wind like the trees. Unit size, as the island's rock and turf
  function hangFringe(k) {
    const key = 'fringe' + k; if (_shape[key]) return _shape[key];
    const R = _prng(k * 61 + 9), rnd = (a, b) => a + (b - a) * R(), out = {};
    for (const [kind, n] of [['roots', 30], ['leaf', 22]]) {
      const P = [], Nn = [], Uv = [], C = [], I = [];
      for (let m = 0; m < n; m++) {
        const a = (m + rnd(0.1, 0.9)) / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), rr = rimR(a, k) * (kind === 'roots' ? rnd(0.86, 0.97) : rnd(0.98, 1.04));
        const foot = [ca * rr, kind === 'roots' ? rnd(-0.12, -0.04) : 0.03, sa * rr], out2 = kind === 'roots' ? 0.18 : 0.75;
        let d = [ca * out2 + rnd(-0.15, 0.15), -1, sa * out2 + rnd(-0.15, 0.15)]; const dl = Math.hypot(...d); d = d.map((v) => v / dl);
        const len = kind === 'roots' ? rnd(0.4, 0.85) : rnd(0.12, 0.22), wd = len * (kind === 'roots' ? 0.26 : 0.9), side = [-sa, 0, ca], q = kind === 'roots' ? 3 : (m % 2), qu = (q % 2) * 0.5, qv = (q >> 1) * 0.5;
        const o = P.length / 3;
        for (const [sx, sy] of [[-1, 0], [-1, 1], [1, 0], [1, 1]]) {
          const px = foot[0] + d[0] * len * sy + side[0] * wd / 2 * sx, py = foot[1] + d[1] * len * sy, pz = foot[2] + d[2] * len * sy + side[2] * wd / 2 * sx;
          P.push(px, py, pz); const nl = Math.hypot(ca, 0.5, sa); Nn.push(ca / nl, 0.5 / nl, sa / nl); Uv.push(qu + 0.004 + (sx + 1) / 2 * 0.492, qv + 0.004 + sy * 0.492);
          const ao = (0.55 + 0.45 * (1 - sy * 0.6)) * (kind === 'roots' ? 0.5 : 1); C.push(ao, ao * 0.92, ao * 0.82);
        }
        I.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.userData.shared = true;
      out[kind] = g;
    }
    return (_shape[key] = out);
  }
  LG.hangRock = hangRock; LG.hangTurf = hangTurf;

  // ================================================================ trees
  // Broad-leaved, conifers and dead ones, three forms of each, each at three levels of detail (0: in the field, 1: beyond the walls
  // but near them, 2: far off), made once and kept. The wood is tubes along a grown skeleton: a trunk that flares into roots at its
  // foot, leans and forks; boughs off it that rise and bend up toward the light; branches off those, twigs on a dead tree. The leaves
  // are cards with a picture of a twig in leaf on them, cut out by its alpha, many to a tree and at every angle: lit as one crown, not as
  // flat cards (their normals lean out from the crown's middle), darker deep in it and underneath, and stirred by the wind at their tips.
  // A conifer is whorls of sprays round a straight stem; a dead tree carries cards of bare twigs instead of leaves.
  const TREE = { atlas: null, bark: null, mats: {} };
  // the picture of the leaves: four cards in one (0, 1: twigs in leaf, 2: a spray of a conifer, 3: bare twigs). Each card's foot is
  // at the top middle of its quarter and it grows down (the texture is read with row 0 at v = 0); between the leaves the colour is
  // the leaves' own, so that a far card does not darken at its edges as the picture is made smaller
  function leafAtlas() {
    if (TREE.atlas) return TREE.atlas;
    const S = 512, Q = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), R = _prng(907), rnd = (a, b) => a + (b - a) * R();
    const leaf = (x, y, ang, len, wid, c) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid * 0.95, len * 0.18, wid * 0.75, len * 0.72, 0, len); g.bezierCurveTo(-wid * 0.75, len * 0.72, -wid * 0.95, len * 0.18, 0, 0);
      const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgb(${c[0] * 0.7 | 0},${c[1] * 0.72 | 0},${c[2] * 0.66 | 0})`); gr.addColorStop(0.55, `rgb(${c[0]},${c[1]},${c[2]})`); gr.addColorStop(1, `rgb(${Math.min(255, c[0] * 1.08) | 0},${Math.min(255, c[1] * 1.06) | 0},${c[2] * 0.95 | 0})`);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(60,66,40,0.45)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, 1); g.quadraticCurveTo(wid * 0.08, len * 0.5, 0, len * 0.9); g.stroke();
      g.restore();
    };
    const stem = (pts, w0, w1, col) => { g.strokeStyle = col; g.lineCap = 'round'; for (let i = 1; i < pts.length; i++) { g.lineWidth = w0 + (w1 - w0) * i / pts.length; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); } };
    const leafCol = () => { const k = rnd(0.82, 1.08), y = rnd(-12, 14); return [Math.min(255, (176 + y) * k), Math.min(255, 196 * k), Math.min(255, (148 - y * 0.6) * k)]; };
    // twigs in leaf: a stem that bends as it grows, eight side twigs off it, small leaves crowded alternate along them all and fanned
    // at every end, so that the leaves fill most of the card (a card that is mostly air thins to nothing as it is made smaller)
    const twig = (ox, oy, seed) => {
      const R2 = _prng(seed), r2 = (a, b) => a + (b - a) * R2();
      const main = []; let x = ox + Q / 2, y = oy + 3, a = Math.PI / 2 + r2(-0.12, 0.12);
      for (let i = 0; i <= 10; i++) { main.push([x, y, a]); a += r2(-0.1, 0.1); x += Math.cos(a) * 20; y += Math.sin(a) * 20; }
      const sides = [];
      for (let k = 1; k <= 8; k++) {
        const t = 0.06 + k * 0.1, f = t * 10, i0 = Math.min(9, Math.floor(f)), m0 = main[i0], m1 = main[i0 + 1], b = [m0[0] + (m1[0] - m0[0]) * (f - i0), m0[1] + (m1[1] - m0[1]) * (f - i0)];
        const sd = k % 2 ? 1 : -1, L = r2(52, 88) * (1 - t * 0.5); let px = b[0], py = b[1], an = m0[2] + sd * r2(0.6, 0.95); const pts = [[px, py]];
        for (let i = 0; i < 4; i++) { an += r2(-0.12, 0.12) - sd * 0.1; px += Math.cos(an) * L / 4; py += Math.sin(an) * L / 4; pts.push([px, py]); }
        sides.push(pts);
      }
      stem(main, 3.6, 1.4, 'rgb(92,82,64)'); for (const s of sides) stem(s, 2.0, 0.9, 'rgb(96,86,66)');
      const lv = [];
      const along = (pts, every, sz) => { for (let i = 1; i < pts.length; i++) { const p = pts[i], q = pts[i - 1], an = Math.atan2(p[1] - q[1], p[0] - q[0]), seg = Math.hypot(p[0] - q[0], p[1] - q[1]); for (let d = 0; d < seg; d += every) { const t = d / seg, sd = lv.length % 2 ? 1 : -1; lv.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, an - Math.PI / 2 + sd * r2(0.5, 1.0), r2(21, 30) * sz, r2(9.5, 13.5) * sz]); } } };
      along(main.map((m) => [m[0], m[1]]), 5.5, 1); for (const s of sides) along(s, 5.2, 0.95);
      for (const end of [main[10], ...sides.map((s) => s[s.length - 1])]) for (let k = 0; k < 5; k++) lv.push([end[0], end[1], r2(-0.4, 0.4) + (k - 2) * 0.55, r2(18, 26), r2(8, 12)]);
      // (painted from the foot outward, the ends last: the nearer leaves over the farther; one in eight shows its paler underside)
      for (const l of lv) { const c = leafCol(); if (R2() < 0.12) { c[0] = Math.min(255, c[0] * 1.12); c[1] = Math.min(255, c[1] * 1.04); c[2] = Math.min(255, c[2] * 1.22); } leaf(l[0], l[1], l[2], l[3], l[4], c); }
    };
    const clip = (ox, oy, f) => { g.save(); g.beginPath(); g.rect(ox + 1, oy + 1, Q - 2, Q - 2); g.clip(); f(); g.restore(); };
    clip(0, 0, () => twig(0, 0, 11)); clip(Q, 0, () => twig(Q, 0, 23));
    // a spray of a conifer: a stem down the middle, needles off it both ways, side shoots with their own; it narrows to its tip
    {
      const ox = 0, oy = Q, mx = ox + Q / 2;
      const needle = (x, y, an, L, c) => { g.strokeStyle = c; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * L, y + Math.sin(an) * L); g.stroke(); };
      const shoot = (x0, y0, an0, L0, depth) => {
        let x = x0, y = y0, an = an0; const n = Math.round(L0 / 3);
        for (let i = 0; i < n; i++) {
          const t = i / n, L = (depth ? 15 : 24) * (1 - t * 0.65) * rnd(0.85, 1.1), k = rnd(0.75, 1.05), c = `rgb(${150 * k | 0},${178 * k | 0},${148 * k | 0})`;
          needle(x, y, an + 1.05 + rnd(-0.15, 0.15), L, c); needle(x, y, an - 1.05 + rnd(-0.15, 0.15), L, c);
          if (!depth && i % 9 === 4 && t < 0.75) { const sd = (i % 18 === 4) ? 1 : -1; shoot(x, y, an + sd * 0.75, L0 * 0.38 * (1 - t), 1); }
          an += rnd(-0.04, 0.04); x += Math.cos(an) * 3; y += Math.sin(an) * 3;
        }
        g.strokeStyle = 'rgb(84,70,54)'; g.lineWidth = depth ? 1.2 : 2.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x, y); g.stroke();
      };
      clip(ox, oy, () => shoot(mx, oy + 3, Math.PI / 2, Q - 10, 0));
    }
    // bare twigs: a stem that forks and forks again, finer each time
    {
      const ox = Q, oy = Q;
      const fork = (x, y, an, L, wd, d) => {
        const x2 = x + Math.cos(an) * L, y2 = y + Math.sin(an) * L, mx = (x + x2) / 2 + rnd(-3, 3), my = (y + y2) / 2 + rnd(-3, 3);
        g.strokeStyle = `rgb(${120 + d * 6},${112 + d * 6},${102 + d * 6})`; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
        if (d >= 5 || x2 < ox + 4 || x2 > ox + Q - 4 || y2 > oy + Q - 4) return;
        const n = d < 2 ? 3 : 2; for (let i = 0; i < n; i++) fork(x2, y2, an + (i - (n - 1) / 2) * rnd(0.45, 0.8) + rnd(-0.15, 0.15), L * rnd(0.6, 0.78), Math.max(0.9, wd * 0.62), d + 1);
      };
      clip(ox, oy, () => fork(ox + Q / 2, oy + 2, Math.PI / 2 + rnd(-0.1, 0.1), 70, 5, 0));
    }
    const im = g.getImageData(0, 0, S, S), d = im.data;
    // (the colour of each quarter's leaves into its empty places: the picture's edges keep the leaves' colour as it is made smaller)
    for (let q = 0; q < 4; q++) {
      const x0 = (q % 2) * Q, y0 = (q >> 1) * Q; let r = 0, gg = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + Q; y++) for (let x = x0; x < x0 + Q; x++) { const i = (y * S + x) * 4; if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
      if (!n) continue; r /= n; gg /= n; b /= n;
      for (let y = y0; y < y0 + Q; y++) for (let x = x0; x < x0 + Q; x++) { const i = (y * S + x) * 4, a = d[i + 3] / 255; if (a < 1) { d[i] = d[i] * a + r * (1 - a); d[i + 1] = d[i + 1] * a + gg * (1 - a); d[i + 2] = d[i + 2] * a + b * (1 - a); } }
    }
    const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), S, S, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return (TREE.atlas = t);
  }
  // bark as it grows: the trunk's skin in long rough plates, the furrows between them shallow valleys that wander along the trunk, join
  // and part (the soft hollow where a stretched noise passes its middle: no line drawn, no spacing kept), here and there a scale flaked
  // off to the paler, smoother bark under it; its colour uneven in broad patches, grey lichen on the plates, green moss in places and
  // down the hollows. Told by the colour and the shallow relief of the surface - the furrows only a little darker, never ink (a colour
  // picture and its normal map; both repeat round the trunk and along it)
  function barkTex() {
    if (TREE.bark) return TREE.bark;
    const S = 256, H = new Float32Array(S * S), C = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = y * S + x;
      // (the furrows: wide soft hollows, the long ones wandering by a warp of their own, finer ones that come and go between them)
      const wu = 0.3 * _gn(u * 3, v * 1, 3, 1, 81) + 0.1 * _gn(u * 9, v * 3, 9, 3, 82);
      const f1 = 1 - _ss(0, 0.42, Math.abs(_gn(u * 6 + wu * 2, v * 1, 6, 1, 83) + 0.12 * _gn(u * 18, v * 4, 18, 4, 84)));
      const f2 = (1 - _ss(0, 0.3, Math.abs(_gn(u * 12 + wu * 3, v * 2, 12, 2, 86)))) * _ss(-0.1, 0.5, _gn(u * 4, v * 2, 4, 2, 85));
      const fiss = Math.max(f1 * f1, f2 * f2 * 0.6);
      // (the plates: rough, their grain along the trunk; a scale flaked off where a patchy noise is high, a shallow step down)
      const pl = 0.55 * _gn(u * 20, v * 6, 20, 6, 89) + 0.3 * _gn(u * 40, v * 14, 40, 14, 90) + 0.15 * _gn(u * 80, v * 30, 80, 30, 97);
      const fl = _ss(0.38, 0.52, _gn(u * 10, v * 4, 10, 4, 91) + 0.2 * _gn(u * 30, v * 12, 30, 12, 92)) * (1 - fiss);
      H[i] = 0.6 + 0.08 * pl - 0.3 * fiss - 0.07 * fl;
      // (the colour: grey-brown outer bark, uneven in broad patches; the hollows a little darker; the flakes paler and warmer)
      const b = 0.84 + 0.2 * (0.5 + 0.5 * _gn(u * 2, v * 1, 2, 1, 93)) + 0.08 * _gn(u * 7, v * 3, 7, 3, 98), wm = 0.06 * _gn(u * 3, v * 2, 3, 2, 94), k = b * (1 - 0.16 * fiss) * (1 + 0.05 * pl);
      let r = 0.45 * k * (1 + wm), g = 0.4 * k, bl = 0.34 * k * (1 - wm);
      r += (0.58 * b - r) * fl * 0.6; g += (0.46 * b - g) * fl * 0.6; bl += (0.36 * b - bl) * fl * 0.6;
      // (lichen: pale grey-green on the plates; moss: green in broad patches, the more down the hollows)
      const li = _ss(0.45, 0.75, _gn(u * 8, v * 5, 8, 5, 95)) * (1 - fiss * 0.6) * (1 - fl) * 0.45, mo = _ss(0.4, 0.85, _gn(u * 3, v * 2, 3, 2, 96)) * (0.4 + 0.6 * fiss) * 0.6;
      r += (0.56 - r) * li; g += (0.58 - g) * li; bl += (0.5 - bl) * li;
      r += (0.32 * k - r) * mo; g += (0.38 * k - g) * mo; bl += (0.22 * k - bl) * mo;
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = bl;
    }
    const map = G.Tex.pixTex(S, (u, v, o) => {
      const i = Math.min(S - 1, v * S | 0) * S + Math.min(S - 1, u * S | 0); o[0] = C[i * 3]; o[1] = C[i * 3 + 1]; o[2] = C[i * 3 + 2]; o[3] = 1;
    }, true);
    const nrm = G.Tex.pixTex(S, (u, v, o) => {
      const x = Math.min(S - 1, u * S | 0), y = Math.min(S - 1, v * S | 0), hx = H[y * S + (x + 1) % S] - H[y * S + (x + S - 1) % S], hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      const nx = -hx * 2.4, ny = hy * 2.4, k = 1 / Math.hypot(nx, ny, 1); o[0] = nx * k * 0.5 + 0.5; o[1] = ny * k * 0.5 + 0.5; o[2] = k * 0.5 + 0.5; o[3] = 1;
    }, false);
    for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    return (TREE.bark = { map, nrm });
  }
  // the materials of a field's trees (kept: one set a field): bark, dead bark, leaves, bare twigs. The leaves' and twigs' cards stir
  // in the wind at their tips and sway a little all over; seen from behind they are lit as from in front (they are a crown, not sheets)
  function treeMats(w) {
    const B = w.mats.biome, key = w.biome || '-';
    if (TREE.mats[key]) return TREE.mats[key];
    const at = leafAtlas(), bk = barkTex();
    const card = (c) => {
      const m = new THREE.MeshStandardMaterial({ map: at, color: c, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.4, alphaToCoverage: true, vertexColors: true });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = G.Tex.lavaT;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { float k = fract(uv.y * 2.0), ph = position.x * 0.31 + position.z * 0.27 + position.y * 0.11;
    transformed.x += sin(uTime * 1.9 + ph * 1.7) * 0.045 * k + sin(uTime * 0.8 + ph) * 0.02;
    transformed.z += sin(uTime * 1.5 + ph * 2.1) * 0.04 * k + cos(uTime * 0.7 + ph) * 0.018;
    transformed.y += sin(uTime * 2.3 + ph * 2.7) * 0.02 * k; }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { vec2 tx = vMapUv * 512.0; float lod = log2(max(max(length(dFdx(tx)), length(dFdy(tx))), 1.0)); diffuseColor.a *= 1.0 + lod * 0.3; }`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif`);
      };
      m.extensions = { derivatives: true }; m.customProgramCacheKey = () => 'leafcard2';
      return m;
    };
    // (the field's leaf colour, brought to the brightness of real leaves: the old flat clumps were painted darker to look like foliage)
    const lc = new THREE.Color(B.leaf ?? (B.outdoor === 'sky' ? 0x8ab05a : 0x4f6a2a)), lum = lc.r * 0.2126 + lc.g * 0.7152 + lc.b * 0.0722;
    lc.multiplyScalar(_cl(lum * 2.6, 0.048, 0.1) / Math.max(1e-4, lum) / 0.55);
    const bark = (c) => { const m = new THREE.MeshStandardMaterial({ map: bk.map, normalMap: bk.nrm, color: c, roughness: 0.93, metalness: 0, vertexColors: true }); m.normalScale.set(1.3, 1.3); return m; };
    const M = { leaf: card(lc), twig: card(new THREE.Color('#8a8279')), bark: bark('#b8ac9e'), dead: bark('#bdbdc0') };
    for (const k in M) M[k].name = 'tree_' + k;   // (named for the tools that list what is drawn where)
    return (TREE.mats[key] = M);
  }
  // a tree's skeleton: limbs [{pts, rad, lvl}] and the places for its leaves [{p, d, lvl, len}] (kind: 'broad' | 'dead' | 'conifer')
  function treeSkel(kind, seed) {
    const R = _prng(seed * 7919 + 13), rnd = (a, b) => a + (b - a) * R();
    const limbs = [], tips = [];
    const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const grow = (p, d, len, r0, r1, n, up, wob, lvl) => {
      const pts = [p.slice()], rad = [r0]; let q = p.slice(), dd = d.slice();
      for (let k = 1; k <= n; k++) {
        dd = nz([dd[0] + rnd(-wob, wob), dd[1] + up / n + rnd(-wob, wob) * 0.5, dd[2] + rnd(-wob, wob)]);
        q = [q[0] + dd[0] * len / n, q[1] + dd[1] * len / n, q[2] + dd[2] * len / n]; pts.push(q.slice()); rad.push(r0 + (r1 - r0) * Math.pow(k / n, 0.85));
      }
      const L = { pts, rad, lvl }; limbs.push(L); return L;
    };
    // (a point a fraction t along a limb: where, which way, how thick)
    const at = (L, t) => { const n = L.pts.length - 1, f = _cl(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i, a = L.pts[i], b = L.pts[i + 1]; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], d: nz([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), r: L.rad[i] + (L.rad[i + 1] - L.rad[i]) * k }; };
    if (kind === 'conifer') {
      const H = rnd(8.2, 9.6), T = grow([0, -0.25, 0], nz([rnd(-0.03, 0.03), 1, rnd(-0.03, 0.03)]), H + 0.25, 0.22, 0.015, 10, 0, 0.01, 0);
      let a0 = rnd(0, 6.28);
      for (let y = 1.15; y < H - 0.25; y += rnd(0.36, 0.48)) {
        const rel = (y - 1.15) / (H - 1.4), n = rel > 0.8 ? 4 : 5; a0 += rnd(0.5, 1.2);
        for (let b = 0; b < n; b++) {
          const az = a0 + b * 6.283 / n + rnd(-0.25, 0.25), e = -0.32 + 0.42 * rel + rnd(-0.08, 0.08), len = (2.5 * Math.pow(1 - rel, 0.85) + 0.3) * rnd(0.85, 1.12);
          tips.push({ p: at(T, (y + 0.25) / (H + 0.25)).p, d: [Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e)], lvl: 1, len, rel });
        }
      }
      tips.push({ p: T.pts[T.pts.length - 1], d: [0, 1, 0], lvl: 0, len: 0.7, rel: 1 });
      return { limbs, tips, C: [0, H * 0.48, 0], Rc: H * 0.5, axis: true };
    }
    const dead = kind === 'dead', H = rnd(6.0, 7.0) * (dead ? 0.95 : 1), fork = rnd(1.7, 2.3);
    const T = grow([0, -0.3, 0], nz([rnd(-0.1, 0.1), 1, rnd(-0.1, 0.1)]), H + 0.3, 0.25, 0.045, 10, 0, dead ? 0.07 : 0.045, 0);
    const nP = dead ? 7 : 8, a0 = rnd(0, 6.28), fill = [];
    for (let i = 0; i < nP; i++) {
      const h = fork + (H * 0.86 - fork) * (i + rnd(0.15, 0.85)) / nP, b = at(T, (h + 0.3) / (H + 0.3)), az = a0 + i * 2.39996 + rnd(-0.35, 0.35);
      const el = 0.98 - 0.55 * i / (nP - 1) + rnd(-0.1, 0.1), d = [Math.sin(el) * Math.cos(az), Math.cos(el), Math.sin(el) * Math.sin(az)];
      const broken = dead && R() < 0.3, len = (3.3 - 1.7 * i / (nP - 1)) * rnd(0.85, 1.12) * (broken ? 0.4 : 1);
      const P = grow(b.p, d, len, b.r * 0.62, broken ? b.r * 0.3 : 0.022, broken ? 2 : 5, dead ? 0.15 : 0.38, dead ? 0.2 : 0.12, 1);
      if (broken) continue;
      tips.push({ p: P.pts[P.pts.length - 1], d: at(P, 1).d, lvl: 1, len });
      for (let m = 0; m < 10; m++) fill.push([P, rnd(0.25, 1), 0.9]);
      for (const [t2, sd] of [[rnd(0.22, 0.32), 1], [rnd(0.42, 0.52), -1], [rnd(0.62, 0.72), 1], [rnd(0.8, 0.9), -1]]) {
        const q = at(P, t2), ca = Math.cos(sd * rnd(0.7, 1.1)), sa = Math.sin(sd * rnd(0.7, 1.1));
        const d2 = nz([q.d[0] * ca - q.d[2] * sa, q.d[1] + rnd(0.15, 0.4), q.d[0] * sa + q.d[2] * ca]), l2 = len * rnd(0.42, 0.55);
        const S2 = grow(q.p, d2, l2, q.r * 0.62, 0.012, 3, dead ? 0.05 : 0.25, dead ? 0.22 : 0.15, 2);
        tips.push({ p: S2.pts[S2.pts.length - 1], d: at(S2, 1).d, lvl: 2, len: l2 });
        tips.push({ p: at(S2, 0.5).p, d: at(S2, 0.5).d, lvl: 3, len: l2 });
        for (let m = 0; m < 4; m++) fill.push([S2, rnd(0.25, 1), 0.55]);
        if (dead) for (let k = 0; k < 2; k++) { const q3 = at(S2, rnd(0.45, 0.9)), c3 = Math.cos(k ? 0.8 : -0.8), s3 = Math.sin(k ? 0.8 : -0.8); grow(q3.p, nz([q3.d[0] * c3 - q3.d[2] * s3, q3.d[1] + 0.2, q3.d[0] * s3 + q3.d[2] * c3]), l2 * 0.5, q3.r * 0.6, 0.006, 2, 0.1, 0.25, 4); }
      }
    }
    tips.push({ p: T.pts[T.pts.length - 1], d: [0, 1, 0], lvl: 1, len: 1.2 });
    let C = [0, 0, 0]; for (const t of tips) { C[0] += t.p[0]; C[1] += t.p[1]; C[2] += t.p[2]; } C = C.map((v) => v / tips.length);
    // (leaves through the crown: a little out from a point along a bough or a branch, away from the crown's middle; lvl 5)
    for (const [lb, t, off] of fill) { const q = at(lb, t); let o = nz([rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)]); const out = [q.p[0] - C[0], q.p[1] - C[1], q.p[2] - C[2]]; if (o[0] * out[0] + o[1] * out[1] + o[2] * out[2] < 0) o = [-o[0], -o[1], -o[2]]; const r = rnd(0.15, off); tips.push({ p: [q.p[0] + o[0] * r, q.p[1] + o[1] * r, q.p[2] + o[2] * r], d: nz([q.d[0] + o[0], q.d[1] + o[1], q.d[2] + o[2]]), lvl: 5, len: 1 }); }
    C = [0, 0, 0]; for (const t of tips) { C[0] += t.p[0]; C[1] += t.p[1]; C[2] += t.p[2]; } C = C.map((v) => v / tips.length);
    let Rc = 0.5; for (const t of tips) Rc = Math.max(Rc, Math.hypot(t.p[0] - C[0], t.p[1] - C[1], t.p[2] - C[2]));
    return { limbs, tips, C, Rc };
  }
  // the levels of detail: per limb level, how many sides round and how many of its rings (0 = left out); the cards: how many at each
  // kind of place (lvl 1: a bough's end, 2: a branch's, 3: the middle of a branch), how big, folded down their middle or flat
  const TLOD = [
    { sides: [10, 6, 3, 0, 3], rings: [12, 6, 4, 0, 3], flare: true, cards: [2, 1, 0, 1], size: 1.45, fold: true, con: 2 },
    { sides: [7, 5, 3, 0, 0], rings: [7, 4, 2, 0, 0], flare: true, cards: [1, 1, 0, 0.5], size: 1.85, fold: false, con: 1 },
    { sides: [5, 4, 0, 0, 0], rings: [4, 2, 0, 0, 0], flare: false, cards: [1, 1, 0, 0.25], size: 2.7, fold: false, con: 1 },
  ];
  function treeGeo(kind, vi, lod) {
    const key = 'tree_' + kind + vi + '_' + lod; if (_shape[key]) return _shape[key];
    const sk = treeSkel(kind, vi * 31 + (kind === 'dead' ? 7 : kind === 'conifer' ? 3 : 1)), L = TLOD[lod], R = _prng(vi * 977 + lod * 13 + 5), rnd = (a, b) => a + (b - a) * R();
    const P = [], N = [], U = [], C = [], I = [];
    // ---- the wood: each limb a tube, its rings carried along it without twisting (parallel transport)
    for (const lb of sk.limbs) {
      const sides = L.sides[lb.lvl], nr = Math.min(L.rings[lb.lvl], lb.pts.length); if (!sides || !nr) continue;
      let pts = [], rad = []; for (let k = 0; k < nr; k++) { const f = Math.round(k * (lb.pts.length - 1) / (nr - 1)); pts.push(lb.pts[f]); rad.push(lb.rad[f]); }
      // (the trunk's foot: rings put in where the roots spread from it)
      if (lb.lvl === 0 && L.flare) { const p0 = pts[0], p1 = pts[1], at = (y) => { const k = (y - p0[1]) / (p1[1] - p0[1]); return [p0[0] + (p1[0] - p0[0]) * k, y, p0[2] + (p1[2] - p0[2]) * k]; }; pts.splice(1, 0, at(0.06), at(0.32)); rad.splice(1, 0, rad[0], rad[0] * 0.96); }
      const n = pts.length, base = P.length / 3, uRep = lb.lvl ? 1 : 2;
      let Tn = null, Nn = null, vAcc = 0;
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(T[0], T[1], T[2]) || 1; T[0] /= tl; T[1] /= tl; T[2] /= tl;
        if (!Nn) { Nn = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; }
        const dt = Nn[0] * T[0] + Nn[1] * T[1] + Nn[2] * T[2]; Nn = [Nn[0] - T[0] * dt, Nn[1] - T[1] * dt, Nn[2] - T[2] * dt]; const nl = Math.hypot(Nn[0], Nn[1], Nn[2]) || 1; Nn = [Nn[0] / nl, Nn[1] / nl, Nn[2] / nl];
        const Bn = [T[1] * Nn[2] - T[2] * Nn[1], T[2] * Nn[0] - T[0] * Nn[2], T[0] * Nn[1] - T[1] * Nn[0]];
        if (k) { const q = pts[k - 1]; vAcc += Math.hypot(pts[k][0] - q[0], pts[k][1] - q[1], pts[k][2] - q[2]) * uRep / (2 * Math.PI * Math.max(0.03, rad[k])) * 0.7; }
        const r0 = k === n - 1 && lb.lvl ? 0 : rad[k], y = pts[k][1];
        for (let s = 0; s <= sides; s++) {
          const an = s / sides * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
          // (the roots: five lobes swelling out of the foot, and the bark's furrows a little in the outline of the trunk)
          let rr = r0;
          if (lb.lvl === 0) { const fl = L.flare ? _ss(0.55, -0.05, y) : 0, lobe = Math.pow(Math.max(0, Math.cos(an * 5 + vi)), 2); rr *= (1 + fl * (0.3 + 0.6 * lobe)) * (1 + 0.035 * Math.sin(an * 11 + y * 3)); }
          const ox = Nn[0] * ca + Bn[0] * sa, oy = Nn[1] * ca + Bn[1] * sa, oz = Nn[2] * ca + Bn[2] * sa;
          P.push(pts[k][0] + ox * rr, y + oy * rr, pts[k][2] + oz * rr); N.push(ox, oy, oz); U.push(s / sides * uRep, vAcc);
          const ao = (0.62 + 0.38 * _ss(-0.2, 1.4, y)) * (lb.lvl ? 0.9 : 1), moss = lb.lvl === 0 ? _ss(1.2, 0, y) * Math.max(0, oz) * 0.25 : 0;
          // (a conifer's stem dark and grey under its sprays, not the warm brown of a broad-leaved tree's bark)
          const ck = kind === 'conifer' ? [0.5, 0.5, 0.52] : [1, 1, 1];
          C.push(ao * (1 - moss * 0.3) * ck[0], ao * (1 - moss * 0.05) * ck[1], ao * (1 - moss * 0.45) * ck[2]);
        }
        if (k) for (let s = 0; s < sides; s++) { const a = base + (k - 1) * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1; I.push(a, b, c, b, d, c); }
      }
    }
    const wood = new THREE.BufferGeometry();
    wood.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wood.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); wood.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); wood.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); wood.setIndex(I);
    wood.userData.shared = true;
    // ---- the cards
    const lp = [], ln = [], lu = [], lc = [], li = [], Cc = sk.C, Rc = sk.Rc;
    const cardAt = (foot, up, side, len, wd, q, fold) => {
      // (foot: where its stem is; up: the way it grows; side: across it; q: which picture; fold: its halves tilted back)
      const nrm = [up[1] * side[2] - up[2] * side[1], up[2] * side[0] - up[0] * side[2], up[0] * side[1] - up[1] * side[0]];
      const qu = (q % 2) * 0.5, qv = (q >> 1) * 0.5, base = lp.length / 3, tilt = fold ? 0.32 : 0, hw = wd / 2;
      const pts = fold ? [[0, 0], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[-1, 0], [-1, 1], [1, 0], [1, 1]];
      const hue = [1 + rnd(-0.08, 0.06), 1 + rnd(-0.04, 0.05), 1 + rnd(-0.1, 0.05)];
      for (const [sx, sy] of pts) {
        const ex = sx * hw, back = Math.abs(sx) * hw * tilt, px = foot[0] + up[0] * len * sy + side[0] * ex - nrm[0] * back, py = foot[1] + up[1] * len * sy + side[1] * ex - nrm[1] * back, pz = foot[2] + up[2] * len * sy + side[2] * ex - nrm[2] * back;
        lp.push(px, py, pz); lu.push(qu + 0.004 + (sx + 1) / 2 * 0.492, qv + 0.004 + sy * 0.492);
        // (lit as part of the crown: the normal leans out from the crown's middle - or from a conifer's stem - and a little up)
        let ox = px - Cc[0], oy = py - Cc[1], oz = pz - Cc[2]; if (sk.axis) oy = oy * 0.25 + Rc * 0.35;
        const ol = Math.hypot(ox, oy, oz) || 1, dir = (nrm[0] * ox + nrm[1] * oy + nrm[2] * oz) < 0 ? -1 : 1;
        const nx = nrm[0] * dir * 0.3 + ox / ol * 0.7, ny = nrm[1] * dir * 0.3 + oy / ol * 0.7 + 0.2, nz2 = nrm[2] * dir * 0.3 + oz / ol * 0.7, nl = Math.hypot(nx, ny, nz2) || 1;
        ln.push(nx / nl, ny / nl, nz2 / nl);
        const dd = Math.hypot(px - Cc[0], (py - Cc[1]) * (sk.axis ? 0.3 : 1), pz - Cc[2]) / Rc, ao = (0.42 + 0.58 * _ss(0.1, 1.0, dd)) * (0.78 + 0.22 * _ss(-0.9, 0.5, (py - Cc[1]) / Rc));
        lc.push(ao * hue[0], ao * hue[1], ao * hue[2]);
      }
      if (fold) li.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base, base + 1, base + 4, base + 1, base + 5, base + 4);
      else li.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };
    const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const across = (up) => { const r = nz([rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)]), s = [up[1] * r[2] - up[2] * r[1], up[2] * r[0] - up[0] * r[2], up[0] * r[1] - up[1] * r[0]]; return nz(s); };
    if (kind === 'conifer') {
      // (sprays along each branch, lying a little tilted, two crossed on the nearer trees; the farther trees keep every other whorl)
      sk.tips.forEach((t, i) => {
        if (lod === 2 && i % 2) return;
        const d = t.d, flat = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : nz([-d[2], 0, d[0]]), n = lod === 0 ? 2 : 1, len = t.len * (lod === 2 ? 1.25 : 1.08);
        for (let k = 0; k < n; k++) {
          // (tilted well up about the branch, so that from the side the spray shows its face and not its edge: on the nearer trees one
          // low and one steep, crossed; on the farther one steep, leaning this way or that)
          const tl = n === 2 ? (k ? -rnd(0.95, 1.2) : rnd(0.3, 0.5)) : (i % 2 ? 1 : -1) * rnd(0.95, 1.25), c = Math.cos(tl), s = Math.sin(tl), up = [0, 1, 0];
          const side = nz([flat[0] * c + up[0] * s, flat[1] * c + up[1] * s, flat[2] * c + up[2] * s]);
          cardAt([t.p[0] - d[0] * 0.15, t.p[1] - 0.05, t.p[2] - d[2] * 0.15], d, side, len, len * (lod === 2 ? 0.75 : 0.62), 2, false);
        }
      });
    } else {
      const q0 = kind === 'dead' ? 3 : -1;
      let nf = 0;
      for (const t of sk.tips) {
        // (the leaves through the crown: every one on the nearest trees, every other or every fourth farther off)
        if (t.lvl === 5) { nf++; if ((nf * L.cards[3]) % 1 >= L.cards[3] - 1e-6 && L.cards[3] < 1) continue; if (kind === 'dead' && nf % 3) continue; }
        const cnt = t.lvl === 1 ? L.cards[0] : t.lvl === 2 ? L.cards[1] : t.lvl === 3 ? L.cards[2] : 1; if (!cnt) continue;
        for (let k = 0; k < (kind === 'dead' ? 1 : cnt); k++) {
          const out = nz([t.p[0] - Cc[0], t.p[1] - Cc[1] + 0.4, t.p[2] - Cc[2]]), up = nz([t.d[0] * 0.55 + out[0] * 0.45 + rnd(-0.35, 0.35), t.d[1] * 0.55 + out[1] * 0.45 + rnd(-0.3, 0.35), t.d[2] * 0.55 + out[2] * 0.45 + rnd(-0.35, 0.35)]);
          const sz = L.size * rnd(0.85, 1.12) * (kind === 'dead' ? 1.2 : 1), q = q0 >= 0 ? q0 : (R() < 0.5 ? 0 : 1);
          cardAt([t.p[0] - up[0] * sz * 0.22, t.p[1] - up[1] * sz * 0.22, t.p[2] - up[2] * sz * 0.22], up, across(up), sz, sz, q, L.fold && kind !== 'dead');
        }
      }
    }
    let leaf = null;
    if (li.length) { leaf = new THREE.BufferGeometry(); leaf.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); leaf.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3)); leaf.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2)); leaf.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); leaf.setIndex(li); leaf.userData.shared = true; }
    return (_shape[key] = { wood, leaf });
  }
  LG.treeGeo = treeGeo;
  LG._nat = { mtnGeo, leafAtlas, barkTex, treeMats, hangFringe };   // (for the tools that measure them)
  // a tree where it stands (x, y, z in grp; s its size). opt (for the tools): {kind, lod}
  function tree(grp, w, x, y, z, rng, s, opt) {
    s = s || 1;
    // (the dice as they were thrown for the six clumps of leaves of the old tree: thrown still, so that everything after falls as before)
    for (let i = 0; i < 6; i++) { rng.range(1.2, 2.0); rng.range(-1.3, 1.3); rng.range(0, 2.2); rng.range(-1.3, 1.3); rng.range(0, 3); rng.range(0, 3); }
    // (on an island it stands in the island's group; how far it is from where anyone walks decides how finely it is made)
    const isl = grp !== w.group && grp.position, wx = x + (isl ? grp.position.x : 0), wz = z + (isl ? grp.position.z : 0);
    const dEdge = Math.hypot(Math.max(0, -wx, wx - w.W), Math.max(0, -wz, wz - w.D));
    const lo = !!(G.save && G.save.data && G.save.data.settings && G.save.data.settings.quality === 'low');   // (the low setting: one level coarser)
    const lod = opt && opt.lod != null ? opt.lod : Math.min(2, (dEdge < 1 ? 0 : dEdge < 30 ? 1 : 2) + (lo ? 1 : 0));
    const look = farLook(w), h = _hn(wx * 0.37, wz * 0.29, 3);
    const kind = opt && opt.kind ? opt.kind : isl ? 'broad' : h < look.dead ? 'dead' : h < look.dead + look.con ? 'conifer' : 'broad';
    const T = treeGeo(kind, Math.floor(_hn(wx * 0.71, wz * 0.53, 9) * 3), lod), M = treeMats(w);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = _hn(x, z, 7) * 6.28; g.scale.setScalar(s);
    const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = lod === 0; o.receiveShadow = true; g.add(o); };
    add(T.wood, kind === 'dead' ? M.dead : M.bark); if (T.leaf) add(T.leaf, kind === 'dead' ? M.twig : M.leaf);
    grp.add(g);
    return g;
  }
  LG.tree = tree;

  // ================================================================ masonry: the walls and gates as they are built
  // A box drawn is a block of wall; what a box can't be - a merlon with its coping, a wedge of an arch, a corbel, a battered plinth, a
  // stake of a palisade - is built here, stone by stone: each stone a solid of eight corners (bit 0 along it, bit 1 up, bit 2 across),
  // its arrises taken off (ch), a corner of it now and then broken off, no two quite alike (a hash of where it stands: nothing here
  // throws the area's dice). They go into one mesh per material for the whole area, with colours of their own: each stone a little
  // different, darker at the foot, under an open sky streaked by the rain and green with moss low down where the sun does not come.
  // On the low setting the stones lose their worked edges.
  const QLOW = () => !!(G.save && G.save.data && G.save.data.settings && G.save.data.settings.quality === 'low');
  const _HF = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
  const _HE = (() => { const m = new Map(); _HF.forEach((f, fi) => { for (let k = 0; k < 4; k++) { const a = f[k], b = f[(k + 1) % 4], key = Math.min(a, b) * 8 + Math.max(a, b); if (!m.has(key)) m.set(key, [a, b, fi]); else m.get(key).push(fi); } }); return [...m.values()]; })();
  const _HC = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => _HF.map((f, fi) => (f.includes(c) ? fi : -1)).filter((fi) => fi >= 0));
  function mason(w) {
    if (w._mason) return w._mason;
    // (LG._noDress, for the tools that weigh what this costs: a mason that lays nothing)
    if (LG._noDress) { const n = () => {}; return (w._mason = { lo: true, by: {}, mat: {}, var: () => [1, 1, 1], hexa: n, blk: n, box: n, geo: n, quad: n, quads: n, foot: n, build: n }); }
    const M = { g: {}, mat: {}, lo: QLOW(), out: !!w.mats.biome.outdoor, tris: 0, n: 0, by: {}, sun: w.mats.biome.sunDir || null };   // (mat: materials of its own by name, the leaves' cards)
    const tally = (n) => { const k = LG._tag || 'other'; M.by[k] = (M.by[k] || 0) + n; };   // (what the triangles went to, by the piece being built: w.perimInfo)
    const grp = (mk) => M.g[mk] || (M.g[mk] = { p: [], n: [], u: [], c: [], i: [] });
    const nz3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    // the colour of a point of a stone: tint (the stone's own), darker low down, rain-streaked and mossy outdoors
    // (fw: the face's own colour, worked out once at its middle - the rain and the moss; then each point darkened by how low it stands)
    const _fw = [0, 0, 0];
    const faceW = (x, y, z, nx, ny, nz, t, o) => { const c = shade(x, y, z, nx, ny, nz, t, o, true); _fw[0] = c[0]; _fw[1] = c[1]; _fw[2] = c[2]; return _fw; };
    const low = (y, o) => 0.74 + 0.26 * _ss(-0.1, 1.8, y - (o.gy ?? 0));
    const shade = (x, y, z, nx, ny, nz, t, o, noLow) => {
      const gy = o.gy ?? 0, h = y - gy;
      let m = noLow ? 1 : 0.74 + 0.26 * _ss(-0.1, 1.8, h);
      let r = 1, g = 1, b = 1;
      if (o.plain) { /* (a floor: its own colour, no rain nor moss) */ }
      else if (M.out && Math.abs(ny) < 0.6) {
        const u = Math.abs(nx) > Math.abs(nz) ? z : x, st = _ss(0.58, 0.86, _vn(u * 2.7 + 13, y * 0.22, 5)) * _ss(-0.5, 2.5, (o.top ?? y + 3) - y);
        m *= 1 - 0.16 * st;
        const shd = M.sun ? (nx * M.sun[0] + nz * M.sun[2] < 0.1 ? 1 : 0.3) : 0.6, ms = _ss(0.5, 0.78, _vn(x * 0.9 + z * 0.9, y * 0.9, 7)) * shd * (1 - _ss(0.4, 1.6, h));
        r *= 1 - 0.12 * ms; b *= 1 - 0.2 * ms; m *= 1 - 0.06 * ms;
      } else if (M.out && ny > 0.6) { const ms = _ss(0.55, 0.8, _vn(x * 1.3 + 3, z * 1.3, 9)) * 0.7; r *= 1 - 0.1 * ms; b *= 1 - 0.16 * ms; m *= 0.93; }
      if (ny < -0.6) m *= 0.82;   // (an underside: in its own shade)
      return [t[0] * m * r, t[1] * m * g, t[2] * m * b];
    };
    // the variety of one stone, from where it is: brightness and a little warmth either way
    M.var = (x, y, z, k) => { const a = _hn(x * 3.1 + 0.7, z * 2.9 + y * 1.7, 11 + (k || 0)), b = _hn(x * 1.7, z * 3.7 - y * 2.3, 13 + (k || 0)); const v = 0.86 + 0.24 * a, wm = (b - 0.5) * 0.08; return [v * (1 + wm), v, v * (1 - wm)]; };
    // P: eight corners [x, y, z]. o: { tint, n (how far its corners wander), chip (0..1: the chance of a broken corner), uv, gy, top }
    // what stands out at a wall's foot beyond the box that stops you (a plinth, a base, a gate pier's foot): its outline, up to 0.6 m over
    // its own foot, into w.footOut ({x0, z0, x1, z1, y0, y1}) - where the dust and gravel along the foot (props.js P.dress) should go round
    // it, not under it. Only a record: nothing stops anyone there
    M.foot = (x0, y0, z0, x1, y1, z1) => { (w.footOut || (w.footOut = [])).push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: Math.min(y0, y1), y1: Math.min(Math.max(y0, y1), Math.min(y0, y1) + 0.6) }); };
    // (scratch for the stone being made: its corners, their broken bits, the index of each face's point at each corner)
    const QX = new Float64Array(8), QY = new Float64Array(8), QZ = new Float64Array(8), CH = new Float64Array(8), VV = new Int32Array(48), FO = new Int32Array(24), FN = new Float64Array(18);
    let _G = null, _cx = 0, _cy = 0, _cz = 0, _nt = 0;
    // a triangle wound outward (against where the stone's middle is), seen from the point (rx, ry, rz) on its outside
    const tri = (a, b, c, rx, ry, rz) => {
      const A = _G.p, pa = a * 3, pb = b * 3, pc = c * 3;
      const ux = A[pb] - A[pa], uy = A[pb + 1] - A[pa + 1], uz = A[pb + 2] - A[pa + 2], vx = A[pc] - A[pa], vy = A[pc + 1] - A[pa + 1], vz = A[pc + 2] - A[pa + 2];
      if ((uy * vz - uz * vy) * (rx - _cx) + (uz * vx - ux * vz) * (ry - _cy) + (ux * vy - uy * vx) * (rz - _cz) >= 0) _G.i.push(a, b, c); else _G.i.push(a, c, b);
      _nt++;
    };
    M.hexa = (mk, P, ch, o) => {
      o = o || {}; const G0 = grp(mk);
      if (o.foot) { let a = [9e9, 9e9, 9e9], b = [-9e9, -9e9, -9e9]; for (const p of P) for (let i = 0; i < 3; i++) { a[i] = Math.min(a[i], p[i]); b[i] = Math.max(b[i], p[i]); } M.foot(a[0], a[1], a[2], b[0], b[1], b[2]); }
      if (M.lo) ch = 0;
      let cx = 0, cy = 0, cz = 0; for (let c = 0; c < 8; c++) { cx += P[c][0] / 8; cy += P[c][1] / 8; cz += P[c][2] / 8; }
      const seed = cx * 1.37 + cy * 2.11 + cz * 0.73, nA = M.lo ? 0 : (o.n ?? 0.006);
      // the corners, wandered a little; one broken off now and then
      let anyChip = false;
      for (let c = 0; c < 8; c++) {
        QX[c] = P[c][0] + (_hn(seed, c, 21) - 0.5) * 2 * nA; QY[c] = P[c][1] + (_hn(seed, c, 22) - 0.5) * 2 * nA; QZ[c] = P[c][2] + (_hn(seed, c, 23) - 0.5) * 2 * nA;
        CH[c] = !M.lo && o.chip && _hn(seed, c, 24) < o.chip ? (0.35 + 0.65 * _hn(seed, c, 25)) * (o.chipS || 0.07) : 0; if (CH[c]) anyChip = true;
      }
      const t = o.tint || [1, 1, 1], uvS = 1 / (o.uv || 1.5), uo = o.uvFix ? 0 : _hn(seed, 1, 26) * 3, vo = o.uvFix ? 0 : _hn(seed, 2, 26) * 3;
      for (let fi = 0; fi < 6; fi++) {
        const f = _HF[fi], a = f[0], b = f[1], c = f[2], d = f[3];
        // (Newell's normal of the face, turned outward)
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < 4; k++) { const p = f[k], q = f[(k + 1) & 3]; nx += (QY[p] - QY[q]) * (QZ[p] + QZ[q]); ny += (QZ[p] - QZ[q]) * (QX[p] + QX[q]); nz += (QX[p] - QX[q]) * (QY[p] + QY[q]); }
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const fx = (QX[a] + QX[b] + QX[c] + QX[d]) / 4, fy = (QY[a] + QY[b] + QY[c] + QY[d]) / 4, fz = (QZ[a] + QZ[b] + QZ[c] + QZ[d]) / 4;
        const flip = nx * (fx - cx) + ny * (fy - cy) + nz * (fz - cz) < 0;
        if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        for (let k = 0; k < 4; k++) FO[fi * 4 + k] = flip ? f[3 - k] : f[k];
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        const fw = faceW(fx, fy, fz, nx, ny, nz, t, o), fr = fw[0], fg = fw[1], fb = fw[2];
        for (let k = 0; k < 4; k++) {
          const cI = FO[fi * 4 + k], nI = FO[fi * 4 + ((k + 1) & 3)], pI = FO[fi * 4 + ((k + 3) & 3)], px = QX[cI], py = QY[cI], pz = QZ[cI];
          let ex = QX[nI] - px, ey = QY[nI] - py, ez = QZ[nI] - pz, l = Math.hypot(ex, ey, ez) || 1; ex /= l; ey /= l; ez /= l;
          let qx = QX[pI] - px, qy = QY[pI] - py, qz = QZ[pI] - pz; l = Math.hypot(qx, qy, qz) || 1; qx /= l; qy /= l; qz /= l;
          const e = ch + CH[cI];
          let x = px + (ex + qx) * e, y = py + (ey + qy) * e, z = pz + (ez + qz) * e;
          if (CH[cI]) { let tx = cx - px, ty = cy - py, tz = cz - pz; l = Math.hypot(tx, ty, tz) || 1; const k6 = CH[cI] * 0.6 / l; x += tx * k6; y += ty * k6; z += tz * k6; }
          VV[fi * 8 + cI] = G0.p.length / 3;
          G0.p.push(x, y, z); G0.n.push(nx, ny, nz);
          if (ax >= ay && ax >= az) G0.u.push(z * uvS + uo, y * uvS + vo); else if (ay >= az) G0.u.push(x * uvS + uo, z * uvS + vo); else G0.u.push(x * uvS + uo, y * uvS + vo);
          const lw = low(y, o); G0.c.push(fr * lw, fg * lw, fb * lw);
        }
        const v0 = VV[fi * 8 + FO[fi * 4]], v1 = VV[fi * 8 + FO[fi * 4 + 1]], v2 = VV[fi * 8 + FO[fi * 4 + 2]], v3 = VV[fi * 8 + FO[fi * 4 + 3]];
        G0.i.push(v0, v1, v2, v0, v2, v3);
      }
      _G = G0; _cx = cx; _cy = cy; _cz = cz; _nt = 12;
      if (ch > 0 || anyChip) {
        for (const [a, b, fA, fB] of _HE) {
          if (ch <= 0 && !CH[a] && !CH[b]) continue;   // (no arris taken off: only the edges by a broken corner have a face)
          const Aa = VV[fA * 8 + a], Ab = VV[fA * 8 + b], Ba = VV[fB * 8 + a], Bb = VV[fB * 8 + b], rx = (QX[a] + QX[b]) / 2, ry = (QY[a] + QY[b]) / 2, rz = (QZ[a] + QZ[b]) / 2;
          tri(Aa, Ab, Bb, rx, ry, rz); tri(Aa, Bb, Ba, rx, ry, rz);
        }
        for (let c = 0; c < 8; c++) { if (ch <= 0 && !CH[c]) continue; const f3 = _HC[c]; tri(VV[f3[0] * 8 + c], VV[f3[1] * 8 + c], VV[f3[2] * 8 + c], QX[c], QY[c], QZ[c]); }
      }
      const nt = _nt; _G = null;
      M.tris += nt; M.n++; tally(nt);
    };
    // an upright block: centre (x, z), half sizes, turned by ry about the vertical, y0..y1; tl: a lean [about x, about z]
    M.blk = (mk, x, y0, z, hx, y1, hz, ry, ch, o, tl) => {
      const c = Math.cos(ry || 0), s = Math.sin(ry || 0), lx = tl ? tl[0] : 0, lz = tl ? tl[1] : 0, P = [];
      for (let k = 0; k < 8; k++) { const a = k & 1 ? hx : -hx, up = k & 2 ? 1 : 0, b = k & 4 ? hz : -hz, y = up ? y1 : y0, hgt = y - y0; P.push([x + a * c + b * s + lz * hgt, y, z - a * s + b * c + lx * hgt]); }
      M.hexa(mk, P, ch, o);
    };
    M.box = (mk, x0, y0, z0, x1, y1, z1, ch, o) => { const P = []; for (let k = 0; k < 8; k++) P.push([k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0]); M.hexa(mk, P, ch, o); };
    // any shape (a geometry with positions and normals) put down by a matrix, coloured as the stones are
    // (o.one: a small thing - a bar, a stake: its weather worked out once, at its foot, and only the darkening low down point by point)
    const _nm3 = new THREE.Matrix3();
    M.geo = (mk, geo, mat, o) => {
      o = o || {}; const G0 = grp(mk), base = G0.p.length / 3, pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const e = mat.elements, nm = _nm3.getNormalMatrix(mat).elements, t = o.tint || [1, 1, 1], uvS = 1 / (o.uv || 1);
      const PA = pos.array, NA = nor.array, UA = uv ? uv.array : null, su = o.su || 1, sv = o.sv || 1, VC = o.vcol && geo.attributes.color ? geo.attributes.color.array : null;
      let oc = null; if (o.one) { const c = shade(e[12], e[13], e[14], 0.7, 0, 0.7, t, o, true); oc = [c[0], c[1], c[2]]; }
      for (let i = 0; i < pos.count; i++) {
        const px = PA[i * 3], py = PA[i * 3 + 1], pz = PA[i * 3 + 2], ax = NA[i * 3], ay = NA[i * 3 + 1], az = NA[i * 3 + 2];
        const x = e[0] * px + e[4] * py + e[8] * pz + e[12], y = e[1] * px + e[5] * py + e[9] * pz + e[13], z = e[2] * px + e[6] * py + e[10] * pz + e[14];
        let nx = nm[0] * ax + nm[3] * ay + nm[6] * az, ny = nm[1] * ax + nm[4] * ay + nm[7] * az, nz = nm[2] * ax + nm[5] * ay + nm[8] * az; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        G0.p.push(x, y, z); G0.n.push(nx, ny, nz);
        if (UA && !o.world) G0.u.push(UA[i * 2] * su, UA[i * 2 + 1] * sv); else G0.u.push((Math.abs(nx) > Math.abs(nz) ? z : x) * uvS, (Math.abs(ny) > 0.7 ? (Math.abs(nx) > Math.abs(nz) ? x : z) : y) * uvS);
        let k0 = 1, k1 = 1, k2 = 1; if (VC) { k0 = VC[i * 3]; k1 = VC[i * 3 + 1]; k2 = VC[i * 3 + 2]; }
        if (oc) { const lw = low(y, o); G0.c.push(oc[0] * lw * k0, oc[1] * lw * k1, oc[2] * lw * k2); } else { const cc = shade(x, y, z, nx, ny, nz, t, o); G0.c.push(cc[0] * k0, cc[1] * k1, cc[2] * k2); }
      }
      const n = geo.index ? geo.index.count : pos.count;
      if (geo.index) { const ix = geo.index.array; if (o.flip) for (let i = 0; i < n; i += 3) G0.i.push(base + ix[i], base + ix[i + 2], base + ix[i + 1]); else for (let i = 0; i < n; i++) G0.i.push(base + ix[i]); }
      else if (o.flip) for (let i = 0; i < n; i += 3) G0.i.push(base + i, base + i + 2, base + i + 1);
      else for (let i = 0; i < n; i++) G0.i.push(base + i);
      M.tris += n / 3; M.n++; tally(n / 3);
    };
    // a flat quad strip of four corners (a patch of ground, a board), one-sided, wound to face n
    // (o.uvq: [u0, v0, u1, v1] the picture laid on it whole, a card of leaves from the atlas; o.nrm: the normal it is lit by)
    M.quad = (mk, a, b, c, d, o) => {
      o = o || {}; const G0 = grp(mk), base = G0.p.length / 3, uvS = 1 / (o.uv || 2), t = o.tint || [1, 1, 1];
      const u = sub(b, a), v = sub(d, a); let n = nz3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      const flip = o.n && n[0] * o.n[0] + n[1] * o.n[1] + n[2] * o.n[2] < 0; if (flip) n = [-n[0], -n[1], -n[2]];
      const nn = o.nrm || n, Q = o.uvq;
      [a, b, c, d].forEach((p, i) => { G0.p.push(p[0], p[1], p[2]); G0.n.push(nn[0], nn[1], nn[2]); if (Q) G0.u.push(i === 0 || i === 3 ? Q[0] : Q[2], i < 2 ? Q[1] : Q[3]); else if (Math.abs(n[1]) > 0.7) G0.u.push(p[0] * uvS, p[2] * uvS); else G0.u.push((Math.abs(n[0]) > Math.abs(n[2]) ? p[2] : p[0]) * uvS, p[1] * uvS); const cc = shade(p[0], p[1], p[2], nn[0], nn[1], nn[2], t, o); G0.c.push(cc[0], cc[1], cc[2]); });
      if (flip) G0.i.push(base, base + 2, base + 1, base, base + 3, base + 2); else G0.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      M.tris += 2; tally(2);
    };
    // many flat quads at once, for the many small boards of a roof or a ceiling: each [a, b, c, d, f, col] - four points in order round it,
    // the way it faces (wound to it) and its colour, darker facing down. None of a stone's wandering, weather or broken corners: quick
    M.quads = (mk, Q, uv) => {
      const G0 = grp(mk), uvS = 1 / (uv || 1.5);
      for (const [a, b, c, d, f, col] of Q) {
        const base = G0.p.length / 3, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const flip = nx * f[0] + ny * f[1] + nz * f[2] < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        // (col: one colour, or four - one for each point, a shade across it)
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), k = ny < -0.6 ? 0.82 : 1, C = Array.isArray(col[0]) ? col : null;
        [a, b, c, d].forEach((p, i) => { const q = C ? C[i] : col; G0.p.push(p[0], p[1], p[2]); G0.n.push(nx, ny, nz); if (ax >= ay && ax >= az) G0.u.push(p[2] * uvS, p[1] * uvS); else if (ay >= az) G0.u.push(p[0] * uvS, p[2] * uvS); else G0.u.push(p[0] * uvS, p[1] * uvS); G0.c.push(q[0] * k, q[1] * k, q[2] * k); });
        if (flip) G0.i.push(base, base + 2, base + 1, base, base + 3, base + 2); else G0.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      M.tris += Q.length * 2; M.n += Q.length; tally(Q.length * 2);
    };
    M.build = (root) => {
      if (M.built) return; M.built = true;
      for (const mk in M.g) {
        const d = M.g[mk]; if (!d.i.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(d.n), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(d.u), 2)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(d.c), 3));
        g.setIndex(new THREE.BufferAttribute(d.p.length / 3 > 65535 ? new Uint32Array(d.i) : new Uint16Array(d.i), 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const vc = w.mats.vc || {}, m = new THREE.Mesh(g, M.mat[mk] || vc[mk] || w.mats[mk] || vc.block);
        m.castShadow = mk !== 'dark' && !M.mat[mk]; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
        root.add(m);
      }
      w.perimInfo = { tris: Math.round(M.tris), parts: M.n, by: Object.fromEntries(Object.entries(M.by).map(([k, v]) => [k, Math.round(v)])) };
      M.g = {};
    };
    w._mason = M;
    // (into the world's own list: not through a wrapper that raises what is built onto a terrain, Terrain.at - the stones stand where they are put)
    Array.prototype.push.call(w.deferred, (root) => M.build(root));
    return M;
  }
  LG.mason = mason;
  // a box that stops you and is seen (as w.solid makes it) but is drawn here by other means (its stones, mason above)
  function hard(w, mk, x0, y0, z0, x1, y1, z1, o) {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
    o = o || {};
    const c = w.addCollider(x0, y0, z0, x1, y1, z1, { surf: o.surf || (mk.startsWith('wood') ? 'wood' : mk === 'iron' ? 'metal' : mk === 'ice' ? 'ice' : 'stone'), noGrapple: o.noGrapple, tag: o.tag });
    c.vis = true; c.mk = mk; if (w._gateFrame) c.gateFrame = true;
    return c;
  }
  LG.hard = hard;
  // the kind of enclosure a field is built with (its walls and its gates: perimeter, gateFrame)
  const WALLKIND = { grave: 'cemetery', hamlet: 'village', dusk: 'fort', ruins: 'fort', castle: 'fort', bloodmoon: 'fort', battlefield: 'fort', crimson: 'fort', foundry: 'works', forge: 'works', flooded: 'cavern', mine: 'mine', shaft: 'rock', pillars: 'rock', sanctum: 'sky', sky: 'sky', void: 'sky', catacombs: 'crypt', frozen: 'crypt' };
  const wallKind = (w) => WALLKIND[w.biome] || (w.mats.biome.outdoor === 'ruins' ? 'fort' : w.mats.biome.outdoor === 'sky' ? 'sky' : 'hall');
  LG.wallKind = wallKind;

  // ---------------- the gates
  // The frame keeps the boxes it always stood on (two piers 2.6..4.2 m either side, a lintel 7.2..8.6, a cornice to 8.9 with the fire
  // tray on it, two corbels in the opening's top corners 6.0..7.2: they stop you as they did), and is drawn as the gate of its field:
  //   arch   - a round arch of wedge stones over chamfered jambs, its keystone standing out, imposts at the springing, a hood moulding
  //            round it, a moulded cornice; 'fort' adds a row of corbels under the cornice; the jambs keep the portcullis's slots
  //   rustic - a village gate: rough-dressed piers of uneven stones and a low segmental arch, a timber beam set in at its springing
  //   portal - a mausoleum's door: a square opening between panelled piers, consoles under an architrave, a frieze with its plaque,
  //            a cornice (the cemetery's gate, the crypts')
  //   mine   - a pit's mouth: the rustic piers with a frame of squared timber set in the opening
  // (noBack: no wall behind it - the sky's open south edge: no slots for a portcullis drawn in the air)
  function gateFrame(w, x, z, side, y0, noBack) {
    w._gateFrame = true; try { gateFrame0(w, x, z, side, y0 || 0, noBack); } finally { w._gateFrame = false; }
  }
  // (the frame's own parts carry w._gateFrame: a sign hung over the gate is placed clear of what is over the frame, not of the frame, areas.js AR.signPlace)
  function gateFrame0(w, x, z, side, y0, noBack) {
    const s = side === 'S' ? -1 : 1; // inward direction
    const zz = z, d = 1.3;
    const za = side === 'S' ? zz - d : zz, zb = side === 'S' ? zz : zz + d;
    hard(w, 'trim', x - 4.2, y0, za, x - 2.6, y0 + 7.2, zb);
    hard(w, 'trim', x + 2.6, y0, za, x + 4.2, y0 + 7.2, zb);
    hard(w, 'block', x - 4.4, y0 + 7.2, za - 0.1 * s, x + 4.4, y0 + 8.6, zb + 0.1 * s);
    hard(w, 'trim', x - 4.6, y0 + 8.6, za - 0.15, x + 4.6, y0 + 8.9, zb + 0.15);
    // corbel steps inside the opening
    hard(w, 'block', x - 2.6, y0 + 6.0, za, x - 1.9, y0 + 7.2, zb); hard(w, 'block', x + 1.9, y0 + 6.0, za, x + 2.6, y0 + 7.2, zb);
    G.Props.torch(w, x - 3.4, 4.2 + y0, side === 'S' ? za : zb, side === 'S' ? 'nz' : 'pz');
    G.Props.torch(w, x + 3.4, 4.2 + y0, side === 'S' ? za : zb, side === 'S' ? 'nz' : 'pz');
    const k = wallKind(w), style = k === 'cemetery' || k === 'crypt' ? 'portal' : k === 'village' ? 'rustic' : k === 'mine' ? 'mine' : 'arch';
    // (the frame's own coordinates: u across the opening from its middle, y up from its foot, d out from the wall's face)
    const T = (u, y, dd) => [x + u, y0 + y, z + s * dd];
    const tg = LG._tag; LG._tag = 'gate'; try { gateDraw(w, mason(w), T, style, k, y0, noBack); } finally { LG._tag = tg; }
  }
  // the gate's stones, in its own frame T(u, y, d)
  function gateDraw(w, M, T, style, kind, y0, noBack) {
    const ST = kind === 'works' ? 'wall' : 'trim', lo = M.lo, opt = (o) => Object.assign(kind === 'works' ? { gy: y0, top: y0 + 8.9, uv: 2.5, uvFix: true } : { gy: y0, top: y0 + 8.9, uv: 1.4 }, o);
    const rough = style === 'rustic' || style === 'mine', ch = rough ? 0.03 : 0.03, nA = rough ? 0.005 : 0.006, chip = rough ? 0.3 : 0.12;
    const tintOf = (u, y, dd, k) => { const v = M.var(u + T(0, 0, 0)[0], y, dd + T(0, 0, 0)[2], k); const r = rough ? 0.84 : 1; return [v[0] * r, v[1] * r, v[2] * r]; };
    // a stone of the frame: corners in (u, y, d) for both sides at once (sg: +1 the right, -1 the left, mirrored)
    const st = (Pl, sg, o) => { const P = Pl.map((q) => T(q[0] * sg, q[1], q[2])); M.hexa(o && o.mk || ST, P, o && o.ch !== undefined ? o.ch : ch, opt(Object.assign({ n: nA, chip: rough ? 0.14 : chip, chipS: rough ? 0.04 : 0.05, tint: tintOf(Pl[0][0] * sg, Pl[0][1], Pl[0][2], 3) }, o))); };
    const bx = (u0, y0_, d0, u1, y1, d1) => [[u0, y0_, d0], [u1, y0_, d0], [u0, y1, d0], [u1, y1, d0], [u0, y0_, d1], [u1, y0_, d1], [u0, y1, d1], [u1, y1, d1]];
    const IN = 2.6, OUT = 4.4, DP = 1.3, TOPC = 8.6;
    const hsh = (a, b) => _hn(T(0, 0, 0)[0] * 0.37 + a, T(0, 0, 0)[2] * 0.41 + b, 31);
    // ---- the piers: a plinth, then courses up to the springing (rustic: of uneven height and length; the jamb's arris chamfered)
    const SPR = style === 'portal' ? 6.0 : style === 'arch' ? 4.8 : 5.3;
    for (const sg of [-1, 1]) {
      st(bx(IN - 0.06, 0, -0.02, OUT + 0.1, 0.5, DP + 0.12), sg, { ch: 0.04, foot: true });
      st([[IN - 0.02, 0.5, 0], [OUT + 0.06, 0.5, 0], [IN, 0.68, 0], [OUT, 0.68, 0], [IN - 0.02, 0.5, DP + 0.08], [OUT + 0.06, 0.5, DP + 0.08], [IN, 0.68, DP], [OUT, 0.68, DP]], sg, { ch: 0.02 }); // (its weathering, sloped back to the pier)
      let y = 0.68, i = 0;
      while (y < SPR - 0.05) {
        const hgt = Math.min(SPR - y, rough ? 0.36 + 0.3 * hsh(i * 1.3 + sg, 1) : 0.55), y1 = y + hgt;
        // (two stones a course, the joint between them swapping side course by course; in the rustic piers anywhere)
        const cut = rough ? IN + 0.5 + 0.8 * hsh(i, 2 + sg) : (i % 2 ? IN + 0.62 : IN + 1.05);
        // (rough stones stand out from the face or back into it a little, each its own)
        const f1 = rough ? (hsh(i, 3 + sg) - 0.5) * 0.04 : 0, f2 = rough ? (hsh(i, 5 + sg) - 0.5) * 0.04 : 0;
        st(bx(IN, y, 0, cut, y1, DP + f1), sg); st(bx(cut, y, 0, OUT, y1, DP + f2), sg);
        y = y1; i++;
      }
    }
    if (style === 'portal') { portalDraw(w, M, T, st, bx, ST, opt, tintOf); return; }
    // ---- the imposts: a moulded course at the springing, standing out a little on the front and into the opening
    for (const sg of [-1, 1]) {
      st([[IN - 0.04, SPR, -0.01], [OUT + 0.06, SPR, -0.01], [IN - 0.1, SPR + 0.26, -0.01], [OUT + 0.1, SPR + 0.26, -0.01], [IN - 0.04, SPR, DP + 0.04], [OUT + 0.06, SPR, DP + 0.04], [IN - 0.1, SPR + 0.26, DP + 0.1], [OUT + 0.1, SPR + 0.26, DP + 0.1]], sg, { ch: 0.02 });
    }
    // ---- the arch: wedge stones over the opening, the keystone standing out; rustic: a flatter (segmental) arch of rougher stones
    const S0 = SPR + 0.26;
    let yc, R, a0;
    if (style === 'arch') { R = IN; yc = S0; a0 = 0; }
    else { const rise = 1.45; R = (IN * IN + rise * rise) / (2 * rise); yc = S0 + rise - R; a0 = Math.asin((S0 - yc) / R); }
    const TH = rough ? 0.62 : 0.72, n = style === 'arch' ? 15 : 11, a1 = Math.PI - a0;
    const crown = yc + R + TH;
    for (let j = 0; j < n; j++) {
      const b0 = a0 + (a1 - a0) * j / n, b1 = a0 + (a1 - a0) * (j + 1) / n, key = j === (n - 1) / 2;
      const r1 = R + TH + (key ? 0.2 : rough ? (hsh(j, 5) - 0.5) * 0.18 : 0), dO = DP + (key ? 0.08 : 0.03), r0 = R - (key ? 0.04 : 0);
      const P = [];
      for (let kk = 0; kk < 8; kk++) { const b = kk & 1 ? b1 : b0, r = kk & 2 ? r1 : r0, dd = kk & 4 ? dO : -0.02; P.push(T(Math.cos(b) * r, yc + Math.sin(b) * r, dd)); }
      M.hexa(ST, P, ch, opt({ n: nA, chip, chipS: 0.05, tint: tintOf(j, 7, 0, 4) }));
    }
    // ---- a hood moulding round the arch (the dressed gates)
    if (style === 'arch' && !lo) {
      // (from 22 degrees over the springing round to the other side: the torches hang under its ends)
      const RH = R + TH + 0.02, m = 10, h0 = 0.38, hs1 = Math.PI - 2 * h0;
      for (let j = 0; j < m; j++) {
        const b0 = h0 + hs1 * j / m - 0.004, b1 = h0 + hs1 * (j + 1) / m + 0.004, P = [];
        for (let kk = 0; kk < 8; kk++) { const b = kk & 1 ? b1 : b0, r = kk & 2 ? RH + 0.14 : RH, dd = kk & 4 ? DP + 0.07 : 0; P.push(T(Math.cos(b) * r, yc + Math.sin(b) * r, dd)); }
        M.hexa(ST, P, 0.02, opt({ n: 0.003, tint: tintOf(j, 9, 1, 6) }));
      }
      // (its two ends turned down onto little carved stops)
      for (const sg of [-1, 1]) { const ux = Math.cos(h0) * RH, uy = yc + Math.sin(h0) * RH; st(bx(ux - 0.02, uy - 0.24, DP - 0.05, ux + 0.17, uy + 0.04, DP + 0.09), sg, { ch: 0.025 }); }
    }
    // ---- the masonry over the haunches up to the cornice: courses, their inner ends against the arch's back
    // (below where the arch's first stone has its back, the skewback: the line it is cut along, out from the jamb)
    const ySk = yc + (R + TH) * Math.sin(a0), cot = a0 > 0.01 ? Math.cos(a0) / Math.sin(a0) : 0;
    const ext = (y) => { if (a0 > 0.01 && y < ySk) return IN + (y - S0) * cot + 0.05; const dy = y - yc, Re = R + TH + (style === 'arch' && !lo ? 0.2 : 0.02); return dy >= Re ? 0 : Math.sqrt(Math.max(0, Re * Re - dy * dy)); };
    let yy = S0, ci = 0;
    while (yy < TOPC - 0.04) {
      const h = Math.min(TOPC - yy, rough ? 0.34 + 0.3 * hsh(ci, 7) : 0.5), y1 = yy + h, uA = ext(yy) - 0.05, uB = ext(y1) - 0.05;
      if (uA <= 0.05 && uB <= 0.05) {
        // (a course over the crown, across the whole front: three or four stones, their joints off those of the course below)
        const cuts = [-OUT, -1.3 - hsh(ci, 8) * 0.8, 0.6 + hsh(ci, 9) * 0.9, OUT];
        for (let q = 0; q + 1 < cuts.length; q++) st(bx(cuts[q], yy, 0, cuts[q + 1], y1, DP), 1);
      } else for (const sg of [-1, 1]) {
        const ua = Math.max(0.02, uA), ub = Math.max(0.02, uB), mid = Math.max(ua, ub) + 0.5 + 0.6 * hsh(ci, 10 + sg);
        if (mid < OUT - 0.4) {
          st([[ua, yy, 0], [mid, yy, 0], [ub, y1, 0], [mid, y1, 0], [ua, yy, DP], [mid, yy, DP], [ub, y1, DP], [mid, y1, DP]], sg);
          st(bx(mid, yy, 0, OUT, y1, DP), sg);
        } else st([[ua, yy, 0], [OUT, yy, 0], [ub, y1, 0], [OUT, y1, 0], [ua, yy, DP], [OUT, yy, DP], [ub, y1, DP], [OUT, y1, DP]], sg);
      }
      yy = y1; ci++;
    }
    // ---- the cornice (or, rustic, rough cap stones), on the fort's gate a row of corbels under it
    if (kind === 'fort' && !lo) for (let u = -OUT + 0.35; u < OUT - 0.2; u += 0.62) {
      if (Math.abs(u) < 0.5) continue;
      M.hexa(ST, [T(u - 0.14, 8.12, DP), T(u + 0.14, 8.12, DP), T(u - 0.14, 8.6, DP), T(u + 0.14, 8.6, DP), T(u - 0.14, 8.12, DP + 0.08), T(u + 0.14, 8.12, DP + 0.08), T(u - 0.14, 8.6, DP + 0.3), T(u + 0.14, 8.6, DP + 0.3)], 0, opt({ tint: tintOf(u, 8, 2, 7) }));
    }
    const cc = rough ? [-4.6, -2.2 - hsh(1, 11), 0.1 + hsh(2, 11), 2.4 + hsh(3, 11) * 0.6, 4.6] : [-4.6, -2.7, -0.9, 0.9, 2.7, 4.6];
    const fb = kind === 'fort' && !lo ? 0.32 : 0.05;   // (the fort's cornice stands out over its corbels)
    for (let q = 0; q + 1 < cc.length; q++) {
      const ua = cc[q], ub = cc[q + 1], f = rough ? 0.1 : 0.17;
      M.hexa(ST, [T(ua, TOPC, -0.15), T(ub, TOPC, -0.15), T(ua - (q === 0 ? f : 0), 8.9, -0.15), T(ub + (q === cc.length - 2 ? f : 0), 8.9, -0.15), T(ua, TOPC, DP + fb), T(ub, TOPC, DP + fb), T(ua - (q === 0 ? f : 0), 8.9, DP + fb + f + 0.06), T(ub + (q === cc.length - 2 ? f : 0), 8.9, DP + fb + f + 0.06)], rough ? 0.04 : 0.025, opt({ n: nA, chip: rough ? 0.4 : 0.15, tint: tintOf(q, 10, 2, 8) }));
    }
    // ---- the portcullis's slots in the passage's sides (where it comes down, behind the frame)
    if (!noBack) for (const sg of [-1, 1]) { const a = T(sg * 2.47, 0, -0.27), b = T(sg * 2.505, 6.0, -0.04); M.box('dark', a[0], a[1], a[2], b[0], b[1], b[2], 0, {}); }
    if (style === 'mine') {
      // (the beam set in at the springing: a squared oak timber, its ends on the piers)
      M.blk('woodDark', T(0, 0, DP * 0.5)[0], y0 + S0 - 0.02, T(0, 0, DP * 0.5)[2], OUT - 0.25, y0 + S0 + 0.36, 0.19, 0, lo ? 0 : 0.03, { n: 0.01, tint: [0.92, 0.88, 0.82], gy: y0 });
    }
    if (style === 'mine') {
      // (a timber set in the mouth: two legs, a cap over them, boards laid over the cap to the arch)
      for (const sg of [-1, 1]) { const p = T(sg * 2.47, 0, DP - 0.2); M.blk('woodDark', p[0], y0, p[2], 0.14, y0 + 5.0, 0.15, 0, lo ? 0 : 0.03, { n: 0.012, gy: y0 }, [0, -sg * 0.02]); }
      const pc = T(0, 0, DP - 0.2); M.blk('woodDark', pc[0], y0 + 5.0, pc[2], 2.62, y0 + 5.36, 0.2, 0, lo ? 0 : 0.03, { n: 0.012, gy: y0 });
    }
  }
  // the mausoleum's door: panelled piers, consoles in the opening's top corners, an architrave of three faces, a frieze with its plaque, a cornice
  function portalDraw(w, M, T, st, bx, ST, opt, tintOf) {
    const IN = 2.6, OUT = 4.4, DP = 1.3;
    // a capital band round each pier under the architrave, and a panel sunk in its face (its raised border)
    for (const sg of [-1, 1]) {
      st(bx(IN - 0.06, 6.0, -0.01, OUT + 0.08, 6.32, DP + 0.08), sg, { ch: 0.02 });
      st(bx(IN, 6.32, 0, OUT, 7.2, DP), sg);
      if (!M.lo) for (const [u0, y0_, u1, y1] of [[IN + 0.3, 1.2, IN + 0.38, 5.6], [OUT - 0.38, 1.2, OUT - 0.3, 5.6], [IN + 0.3, 1.12, OUT - 0.3, 1.2], [IN + 0.3, 5.6, OUT - 0.3, 5.68]]) st(bx(u0, y0_, DP - 0.02, u1, y1, DP + 0.018), sg, { ch: 0.008, n: 0.002, chip: 0, tint: [0.7, 0.68, 0.65] });
      // (the console: narrow at its foot, swelling out to carry the architrave)
      st([[IN, 6.0, 0], [IN - 0.16, 6.0, 0], [IN, 7.2, 0], [IN - 0.7, 7.2, 0], [IN, 6.0, DP + 0.02], [IN - 0.16, 6.0, DP + 0.02], [IN, 7.2, DP + 0.06], [IN - 0.7, 7.2, DP + 0.06]], sg, { ch: 0.025 });
    }
    // the architrave: three faces, each standing out a little more than the one below
    const run = (y0_, y1, f0, f1, cuts, k) => { for (let q = 0; q + 1 < cuts.length; q++) { const ua = cuts[q], ub = cuts[q + 1]; M.hexa(ST, [T(ua, y0_, -0.1), T(ub, y0_, -0.1), T(ua, y1, -0.1), T(ub, y1, -0.1), T(ua, y0_, DP + f0), T(ub, y0_, DP + f0), T(ua, y1, DP + f1), T(ub, y1, DP + f1)], 0.015, opt({ n: 0.003, tint: tintOf(q, k, 3, 9) })); } };
    run(7.2, 7.38, 0.04, 0.04, [-OUT - 0.04, -1.4, 1.6, OUT + 0.04], 1); run(7.38, 7.56, 0.07, 0.07, [-OUT - 0.04, -0.2, OUT + 0.04], 2); run(7.56, 7.74, 0.1, 0.1, [-OUT - 0.04, 1.1, OUT + 0.04], 3);
    // the frieze and its plaque
    run(7.74, 8.36, 0.0, 0.0, [-OUT, -2.1, 2.3, OUT], 4);
    M.hexa(ST, [T(-1.5, 7.86, DP - 0.02), T(1.5, 7.86, DP - 0.02), T(-1.5, 8.24, DP - 0.02), T(1.5, 8.24, DP - 0.02), T(-1.5, 7.86, DP + 0.05), T(1.5, 7.86, DP + 0.05), T(-1.5, 8.24, DP + 0.05), T(1.5, 8.24, DP + 0.05)], 0.02, opt({ n: 0.002, tint: [0.78, 0.76, 0.72] }));
    // the cornice: a bed moulding, then the corona standing well out
    run(8.36, 8.56, 0.04, 0.16, [-OUT - 0.1, -1.7, 1.2, OUT + 0.1], 5);
    run(8.56, 8.9, 0.3, 0.32, [-4.6, -2.2, 0.4, 2.8, 4.6], 6);
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
    // (with a pit: the cells this lays, for the floor drawn over them all at once, its edge not on the grid: pitFloor)
    const cells = pit ? new Uint8Array(W * D) : null;
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
        if (fresh && pit) {
          hard(w, mk, x, -0.4, z, x2, 0, z2); hard(w, 'rock', x, -14, z, x2, -0.4, z2);
          for (let zz = z; zz < z2; zz++) for (let k = x; k < x2; k++) { w._fmask[zz * W + k] = 1; cells[zz * W + k] = 1; }
        } else if (fresh) {
          w.solid(mk, x, -0.4, z, x2, 0, z2, { uv: 4, grad: false });
          w.solid('rock', x, -14, z, x2, -0.4, z2, { uv: 5, grad: false });
          for (let zz = z; zz < z2; zz++) for (let k = x; k < x2; k++) w._fmask[zz * W + k] = 1;
        }
        x = x2;
      }
      if (!pit) break;
    }
    if (pit) pitFloor(w, W, D, cells, mk, w.mats.biome.outdoor !== 'sky');
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
        // (a channel of lava as the halls' trench is, fields.js: its burning, its bubbles and its sound)
        if (G.Fields) G.Fields.add(w, 'lava', r.x0, r.z0, r.x1, r.z1, { y: 0, noLight: true });
        else { w.visual('lava', r.x0, 0.0, r.z0, r.x1, 0.03, r.z1, { uv: 4, grad: false, skip: { bottom: true } }); w.lavaZones.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }); }
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
        const r0 = rng.range(0, 1), r1 = rng.range(0, 1);   // (the dice as they were thrown)
        if (!G.Props.tuft(w, x, 0, z, 1, null, 9, 1.6)) for (let k = 0; k < 2; k++) w.batch.geo('vine', G.Props.PG.plane, G.Props.M(x, 0.25, z, 0.6, 0.5, 1, 0, k * Math.PI / 2 + (k ? r1 : r0), 0), { su: 0.6, sv: 0.5 });
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
  // How many chests an area holds, the same in every field: one to three, more the further into the run and the harder the difficulty
  // (the average: easy 1 at the start, 2 at the end; normal 1.25 -> 2.25; hard 1.5 -> 2.5; extra 1.75 -> 2.75). A treasure vault keeps its six.
  // extra: the 宝探し boon (on top of it). LG.chestMul: how many players share the area (each brings the same again; 1 alone).
  LG.CHEST_DIFF = { easy: 0, normal: 0.25, hard: 0.5, extra: 0.75 };
  LG.chestMul = 1;
  LG.chestCount = function (rng, area, kind, extra) {
    const R = G.Run, id = R && R.cur ? R.cur.id : 'normal', N = Math.max(2, (R && R.areas && R.areas()) || 21);
    let n = 6;
    if (kind !== 'vault') {
      const e = 1 + Math.min(1, Math.max(0, (area - 1) / (N - 1))) + (LG.CHEST_DIFF[id] ?? 0.25), b = Math.floor(e);
      n = Math.min(3, Math.max(1, b + (rng.next() < e - b ? 1 : 0)));
    }
    return n * Math.max(1, LG.chestMul | 0) + (extra || 0);
  };
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
        const x = r.x0 + 1, z = r.z0 + 1, y = G.Terrain ? G.Terrain.flat(w, r.x0, r.z0, r.x1, r.z1, 0.3) : 0; // (on ground of its own, only where it lies flat)
        if (y != null && chestSpotFree(w, x, y, z)) { P().chest(w, x, z, y, rng.range(0, 6), tier); done = true; }
      }
      // no room on the floor (a field of narrow ways: caves, a maze): a platform after all
      for (let k = 0; k < 8 && !done && tops.length; k++) {
        const ti = rng.int(0, tops.length - 1), t = tops[ti];
        const x = rng.range(Math.min(t.x0 + 0.9, t.cx), Math.max(t.x1 - 0.9, t.cx)), z = rng.range(Math.min(t.z0 + 0.9, t.cz), Math.max(t.z1 - 0.9, t.cz));
        if (chestSpotFree(w, x, t.y, z)) { P().chest(w, x, z, t.y, rng.range(0, 6), tier); tops.splice(ti, 1); done = true; }
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
        pillar(w, r.x0 + 5, r.z0 + 4.5, 0, 6, 0.8);
      }
    }
    structures(w, rng, occ, W, D, 5 + Math.floor(W * D / 900) + rng.int(0, 3));
    biomeExtras(w, rng, occ, W, D);
    if (G.Fields) G.Fields.place(w, rng, occ, W, D, area);
    scatter(w, rng, occ, W, D, 14 + Math.floor(W * D / 450));
    placeChests(w, rng, occ, LG.chestCount(rng, area, kind, extraChests), area);
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
  // A compact market: two island stalls stand straight ahead of the entrance (the weapons, trimmed in gold under a spotlight, and the skills);
  // the other four stalls line the west and east walls; the fountain and the re-stock altar sit by the walls near the door, clear of the stalls,
  // and the pawn counter is on the south wall beside the door.
  // Every stall has a stepped counter (three wares in front, two on a raised shelf behind), so a stall is short and the whole hall reads at a glance.
  // what the field's own shell (field_rooms.js) leaves bare in the merchant's hall: the stalls along both walls and the floor in front of
  // them, the two islands with the re-stock altar and the parts bench before them, the fountain, the pawn counter and the aisle from the
  // door. [x0, z0, x1, z1] (the hall is 44 x 44). Its pillars, chains, lanterns, rocks and falls go round them, so nothing stands
  // between you and the wares.
  LG.SHOP_KEEP = [[0, 7, 10.5, 41], [33.5, 7, 44, 35], [7, 18.5, 37.5, 33], [30, 35, 41.5, 44], [17, 33, 27, 44]];
  LG.shop = function (area, seed, gates) {
    const rng = new G.RNG(seed);
    const W = 44, D = 44;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    // the place round the hall: the field's own (field_rooms.js), or the stone hall with its beams and chandeliers
    const shell = LG.shellFor && LG.shellFor(w);
    if (shell) shell(w, rng, W, D, { kind: 'shop', gates, keep: LG.SHOP_KEEP });
    else {
      floors(w, W, D, null, 'floor');
      perimeter(w, rng, W, D, { h: 10, top: 16, beams: 0, gates });
      for (let z = 6; z < D - 4; z += 7) { w.solid('woodDark', 0, 9.2, z - 0.35, W, 9.9, z + 0.35, { uv: 2 }); }
      for (const [cx, cz] of [[W / 2, 13], [W / 2, 30], [9, 22], [W - 9, 22]]) P().chandelier(w, cx, 6.0, cz, 9.2);
    }
    // red carpet from the door up to the two islands and on between them to the exits; braziers along it and a few warm lights over the aisle
    P().rug(w, W / 2, 33.6, 0, 4, 20, [0.45, 0.08, 0.06]);
    P().rug(w, W / 2, 14, 0, 1.4, 12, [0.45, 0.08, 0.06]);
    for (const sx of [-1, 1]) P().brazier(w, W / 2 + sx * 3.4, 0, 30, 1);
    for (const z of [13, 30, 38]) w.addLight(W / 2, 4.6, z, { flame: 0, emit: false, intensity: 12, range: 17, color: '#ffd8a8', prio: 1.1, steady: true });

    w.shopSlots = [];
    // one stall. origin: where its back wall starts; a: unit vector along the stall; n: unit vector from the wall into the hall.
    // u runs along the stall, d is the distance from the wall.
    const SP = 3.0; // wide enough apart (and the back row high enough) that you never buy the one beside the one you meant
    const stall = (name, col, light, txt, cnt, origin, a, n, opt) => {
      opt = opt || {};
      const nf = cnt <= 3 ? cnt : 3, nb = cnt - nf, sp = cnt <= 3 ? 2.8 : SP, L = nf * sp + 2.2;
      const wp = (u, d) => [origin[0] + a[0] * u + n[0] * d, origin[1] + a[1] * u + n[1] * d];
      const bx = (u0, u1, d0, d1, y0, y1, kind, mat, o) => {
        const p = wp(u0, d0), q = wp(u1, d1);
        (kind === 'v' ? w.visual : w.solid).call(w, mat, Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]), o || { uv: 1 });
      };
      // raised shelf behind, counter in front (with a coloured skirt and a stone top)
      if (nb) { bx(0.4, L - 0.4, 0.45, 1.55, 0, 1.95, 's', 'woodDark', { uv: 1.5 }); bx(0.3, L - 0.3, 0.35, 1.65, 1.95, 2.05, 's', 'trim'); }
      bx(0.3, L - 0.3, 1.95, 3.1, 0, 1.05, 's', 'woodDark', { uv: 1.5 });
      bx(0.2, L - 0.2, 1.85, 3.2, 1.05, 1.15, 's', 'trim');
      bx(0.45, L - 0.45, 3.14, 3.18, 0.15, 0.95, 'v', 'cloth2', { uv: 1, tint: col, grad: false });
      for (let i = 0; i < nf; i++) { const p = wp(1.1 + sp * (i + 0.5), 2.5); w.shopSlots.push({ x: p[0], y: 1.15, z: p[1], face: 1, nx: n[0], nz: n[1], big: !!opt.gold }); }
      for (let j = 0; j < nb; j++) { const p = wp(1.1 + sp * (j + 1), 0.95); w.shopSlots.push({ x: p[0], y: 2.05, z: p[1], face: 1, nx: n[0], nz: n[1] }); }
      // a ware of its own beside the stall (the weapon / skill upgrade): a separate plinth with its own little sign
      if (opt.extra) {
        const eu = opt.extraBack ? -1.2 : L + 1.2; // on the near side or the far side of the stall
        bx(eu - 0.7, eu + 0.7, 1.9, 3.1, 0, 1.05, 's', 'block'); bx(eu - 0.8, eu + 0.8, 1.8, 3.2, 1.05, 1.15, 's', 'trim');
        bx(eu - 0.65, eu + 0.65, 3.12, 3.16, 0.15, 0.95, 'v', 'cloth2', { uv: 1, tint: light, grad: false });
        const p = wp(eu, 2.5); w.shopSlots.push({ x: p[0], y: 1.15, z: p[1], face: 1, nx: n[0], nz: n[1] });
        const sl = wp(eu, 3.2); P().label(w, opt.extra, sl[0], 3.35, sl[1], Math.atan2(n[0], n[1]), 2.4, { color: txt, size: 60 });
        w.addLight(p[0], 2.6, p[1], { flame: 0, emit: false, intensity: 5, range: 6, color: txt, prio: 0.8, steady: true });
      }
      // backdrop (a low wall in the stall's colour), corner posts
      bx(0, L, 0, 0.16, 0, opt.low ? 2.6 : 3.4, 's', 'wall', { uv: 2 });
      bx(0.2, L - 0.2, 0.2, 0.24, 0.4, opt.low ? 2.4 : 3.2, 'v', 'cloth2', { uv: 1, tint: col, grad: false });
      for (const u of [0.1, L - 0.1]) for (const d of [0.1, 3.2]) bx(u - 0.1, u + 0.1, d - 0.1, d + 0.1, 0, 4.15, 's', 'woodDark');
      // striped awning over the whole depth of the stall, a glowing trim along its front edge
      const nq = Math.round(L / 0.8);
      for (let q = 0; q < nq; q++) {
        const c = q % 2 ? col : light, u0 = -0.15 + (L + 0.3) * q / nq, u1 = -0.15 + (L + 0.3) * (q + 1) / nq;
        bx(u0, u1, 0.2, 3.3, 4.15, 4.27, 'v', 'cloth2', { uv: 1, tint: c, grad: false });
        bx(u0, u1, 3.27, 3.33, 3.75, 4.15, 'v', 'cloth2', { uv: 1, tint: c, grad: false });
      }
      bx(-0.15, L + 0.15, 3.25, 3.35, 3.67, 3.75, 'v', 'glow', { uv: 1, tint: light, grad: false });
      const lc = wp(L / 2, 1.8), ly = Math.atan2(n[0], n[1]), lb = wp(L / 2, 3.3);
      w.addLight(lc[0], 2.7, lc[1], { flame: 0, emit: false, intensity: 7, range: 9, color: txt, prio: 0.9, steady: true });
      const rg = wp(L / 2, 4.2); P().rug(w, rg[0], rg[1], 0.02, a[0] ? L - 0.6 : 3.6, a[0] ? 3.6 : L - 0.6, col);
      P().label(w, name, lb[0], 4.95, lb[1], ly, 4.2, { color: txt });
      const cd = wp(0.9, 2.5); P().candles(w, cd[0], 1.15, cd[1], rng, true);
      // the showpiece: gold edging on the counter and the posts, a spotlight over the wares
      if (opt.gold) {
        bx(0.15, L - 0.15, 3.18, 3.28, 1.0, 1.2, 'v', 'gold');
        bx(0.15, L - 0.15, 1.8, 3.28, 1.15, 1.19, 'v', 'gold');
        for (const u of [0.1, L - 0.1]) for (const d of [0.1, 3.2]) bx(u - 0.13, u + 0.13, d - 0.13, d + 0.13, 4.0, 4.25, 'v', 'gold');
        const sp2 = wp(L / 2, 2.4); w.addLight(sp2[0], 4.4, sp2[1], { flame: 0, emit: false, intensity: 16, range: 8, color: '#fff2d0', prio: 1.6, steady: true });
      }
      // an island's back (seen on the way to the exits): banners on its backdrop
      if (opt.low) for (const u of [L * 0.25, L * 0.75]) { const b = wp(u, -0.02); P().banner(w, b[0], 2.5, b[1], n[1] > 0 ? 'nz' : 'pz', 1.8, txt); }
      return L;
    };
    const ZONES = [
      ['⚔ 武器', [0.62, 0.1, 0.08], [0.85, 0.45, 0.4], '#ffb0a0', 3], ['✨ スキル', [0.12, 0.25, 0.65], [0.5, 0.65, 0.95], '#a8c8ff', 5], ['🔩 アタッチメント', [0.38, 0.4, 0.44], [0.75, 0.78, 0.82], '#e0e4ea', 3],
      ['🧪 消耗品', [0.1, 0.5, 0.18], [0.5, 0.85, 0.55], '#a0f0b0', 3], ['🛡 防具', [0.6, 0.4, 0.1], [0.92, 0.75, 0.4], '#ffd890', 5], ['🔮 加護', [0.42, 0.12, 0.6], [0.75, 0.55, 0.9], '#e0b8ff', 5],
    ];
    // slot order is fixed (the shop fills them in this order): weapons, skills, parts, consumables, armour, boons
    const place = {
      0: [[10, 20], [1, 0], [0, 1], { low: true, gold: true, extra: '⚒ 武器強化', extraBack: true }], // islands straight ahead of the door: the weapons (the upgrade on the near end) ...
      1: [[23, 20], [1, 0], [0, 1], { low: true, extra: '📖 スキル強化' }],          // ... and the skills (the skill tome on the far end)
      2: [[0.6, 8.5], [0, 1], [1, 0]],                                               // west wall: attachments in the north, boons in the south
      3: [[W - 0.6, 8.5], [0, 1], [-1, 0]],                                          // east wall: consumables, armour
      4: [[W - 0.6, 21], [0, 1], [-1, 0]],
      5: [[0.6, 24.2], [0, 1], [1, 0]],
    };
    ZONES.forEach(([name, col, light, txt, cnt], zi) => { const p = place[zi]; stall(name, col, light, txt, cnt, p[0], p[1], p[2], p[3]); });
    // a few shelves and crates in the free corners
    P().bookshelf(w, 1.0, D - 2.4, 0, false, rng); P().weaponRack(w, 12, 19.4, 0, true);
    for (let i = 0; i < 2; i++) { P().barrel(w, 1.2, 4 + i * 1.0, 0, rng); P().crate(w, W - 1.4, 4 + i * 1.2, 0, rng); }
    // the pawn counter on the south wall, east of the door: made to stand out with a gold rug, a warm light and a big gold label
    const pcx = W - 9, pz = D - 3.0;
    w.merchantPos = new THREE.Vector3(1.2, 0, D - 3.2);
    w.solid('woodDark', pcx - 1.9, 0, pz - 0.7, pcx + 1.9, 1.1, pz + 0.7, { uv: 1.5 });
    w.solid('wood', pcx - 2.0, 1.1, pz - 0.8, pcx + 2.0, 1.2, pz + 0.8, { uv: 1.5 });
    P().rug(w, pcx, pz - 2.4, 0.02, 7.6, 4.2, [0.75, 0.55, 0.12]);
    w.addLight(pcx, 3.2, pz - 0.8, { flame: 0, emit: false, intensity: 10, range: 11, color: '#ffd070', prio: 1.2, steady: true });
    P().label(w, '💰 買取屋', pcx, 3.6, pz + 0.4, Math.PI, 5, { color: '#ffe08a', size: 96 });
    P().crate(w, pcx - 3.1, pz + 0.9, 0, rng); P().urn && P().urn(w, pcx + 3.0, pz + 0.9, 0, rng);
    w.sellPos = new THREE.Vector3(pcx, 1.2, pz - 1.4);
    w.pawnNpc = { x: pcx, z: pz + 0.8, ry: Math.PI };
    // re-stock altar in the middle of the hall, beside the carpet a few steps in from the door (it used to sit in the far corner by the east wall)
    const rcx = W / 2 + 6, rcz = D - 15.5;
    w.rerollPos = new THREE.Vector3(rcx, 0, rcz);
    w.solid('trim', rcx - 1, 0, rcz - 1, rcx + 1, 0.3, rcz + 1, { uv: 1 });
    w.solid('block', rcx - 0.6, 0.3, rcz - 0.6, rcx + 0.6, 1.0, rcz + 0.6, { uv: 1 });
    P().candles(w, rcx + 0.3, 1.0, rcz, rng, true);
    P().label(w, '🔄 品揃えの入れ替え', rcx - 0.3, 2.6, rcz + 0.5, -0.55, 3.6, { color: '#ffd8a0', size: 78 }); // (turned towards the door and the carpet, so it reads from both)
    w.addLight(rcx, 3.2, rcz, { flame: 0, emit: false, intensity: 6, range: 7, color: '#ffd0a0', prio: 1.0, steady: true });
    // the weapon-parts workbench mirrors the re-stock altar on the other side of the carpet (paid here)
    partBench(w, W / 2 - 6.5, D - 15.5, 0.55, false, rng);
    // healing fountain by the west wall, close to the door and well clear of the parts stall
    const fxp = 3.4, fzp = D - 6.5;
    w.fountainPos = new THREE.Vector3(fxp, 0, fzp);
    P().well(w, fxp, fzp, 0);
    P().label(w, '💧 癒しの泉', fxp + 0.7, 4.4, fzp, Math.PI / 2, 3.6, { color: '#a8e8ff' }); // above the well's roof, so nothing cuts through it
    for (const [x, z] of [[3, 4], [W - 3, 4], [3, D - 3], [W - 3, D - 3]]) P().brazier(w, x, 0, z, 1);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isShop = true;
    validate(w);
    return w;
  };


  // the weapon-parts workbench: a heavy table with a vice, a few gears and a lamp; world.benchPos is where it is used from
  function partBench(w, x, z, ry, free, rng) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    const box = (u0, u1, v0, v1, y0, y1, mat, solid) => { const p = at(u0, v0), q = at(u1, v1); (solid ? w.solid : w.visual).call(w, mat, Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]), { uv: 1 }); };
    box(-1.1, 1.1, -0.55, 0.55, 0, 0.92, 'woodDark', true);
    box(-1.2, 1.2, -0.62, 0.62, 0.92, 1.02, 'wood', true);
    box(0.55, 0.95, -0.2, 0.2, 1.02, 1.3, 'iron', false);
    box(-0.9, -0.5, -0.3, 0.1, 1.02, 1.12, 'iron', false);
    P().candles(w, x - 0.6 * c, 1.02, z + 0.6 * s, rng, true);
    P().label(w, free ? '🔧 部品の作業台（無料）' : '🔧 部品の作業台', x, 2.55, z, ry, 3.4, { color: '#f0d8a8', size: 72 });
    w.addLight(x, 2.8, z, { flame: 0, emit: false, intensity: 6, range: 7, color: '#ffd8a0', prio: 1.0, steady: true });
    w.benchPos = new THREE.Vector3(x, 1.05, z); w.benchFree = !!free;
  }

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
      for (const sx of [-1, 1]) pillar(w, cx + sx * (gate + 1.5), gz1 - 0.2, 0, 15, 2.2);
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
        pillar(w, x, z, 0, 12, 2.0); w.bossPillars.push(new THREE.Vector3(x, 0, z));
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
        pillar(w, x, zz, 0, 13, 1.8); w.bossPillars.push(new THREE.Vector3(x, 0, zz));
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
        pillar(w, p.x, p.z, 0, h, tall ? rng.range(1.6, 2.2) : rng.range(1.0, 1.3));
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
        pillar(w, x, z, 0, 12, 1.9); w.bossPillars.push(new THREE.Vector3(x, 0, z));
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
        pillar(w, x, z, 0, 13, 1.9); w.bossPillars.push(new THREE.Vector3(x, 0, z));
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * 25), z = Math.round(cz + Math.sin(a) * 25);
        if (z > AD - 10 || z < 8) continue;
        pillar(w, x, z, 0, 11, 1.7); w.bossPillars.push(new THREE.Vector3(x, 0, z));
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
        pillar(w, x, z, 0, 12, 2.0); w.bossPillars.push(new THREE.Vector3(x, 0, z));
        if (rng.chance(0.7)) lowWall(w, rng, x + sx * 2.5 - (sx < 0 ? 3 : 0), z + sz * 0.5, 3, true, rng.range(0.8, 1.0));
      }
      for (let i = 0; i < 2; i++) { const sx = i ? 1 : -1, x = Math.round(cx + sx * 27); pillar(w, x, Math.round(cz), 0, 10, 1.6); w.bossPillars.push(new THREE.Vector3(x, 0, Math.round(cz))); }
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
        pillar(w, x, z, 0, i % 2 ? 13 : 9, 2.2); w.bossPillars.push(new THREE.Vector3(x, 0, z));
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
    // the place round the room: the field's own (field_rooms.js), or the stone hall
    const shell = LG.shellFor && LG.shellFor(w);
    if (shell) shell(w, rng, W, D, { kind, gates });
    else {
      floors(w, W, D, null, kind === 'shrine' ? 'cobble' : 'floor');
      perimeter(w, rng, W, D, { h: 10, top: 16, beams: 0, gates });
      if (kind !== 'trial') {
        for (let z = 6; z < D - 4; z += 7) w.solid('woodDark', 0, 9.2, z - 0.35, W, 9.9, z + 0.35, { uv: 2 });
        P().chandelier(w, W / 2, 6, D / 2, 9.2);
      }
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
    } else if (kind === 'alchemy') {
      w.solid('trim', W / 2 - 2.4, 0, cz - 2.4, W / 2 + 2.4, 0.2, cz + 2.4, { uv: 2 });
      w.addCollider(W / 2 - 0.85, 0.2, cz - 0.85, W / 2 + 0.85, 1.25, cz + 0.85, { surf: 'metal' });
      w.cauldronPos = new THREE.Vector3(W / 2, 1.15, cz);
      w.deferred.push((grp) => {
        const g = new THREE.Group(); g.position.set(W / 2, 0.2, cz);
        const PG = G.Props.PG;
        const base = new THREE.Mesh(PG.oct, w.mats.iron); base.scale.set(0.85, 0.35, 0.85); base.position.y = 0.175; g.add(base);
        const pot = new THREE.Mesh(PG.sph, w.mats.iron); pot.scale.set(0.78, 0.62, 0.78); pot.position.y = 0.62; g.add(pot);
        const rim = new THREE.Mesh(PG.torus, w.mats.gold); rim.rotation.x = Math.PI / 2; rim.scale.set(0.72, 0.72, 0.55); rim.position.y = 0.96; g.add(rim);
        const brew = new THREE.Mesh(PG.cyl, new THREE.MeshBasicMaterial({ color: 0x48ff98, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }));
        brew.scale.set(0.66, 0.03, 0.66); brew.position.y = 0.94; g.add(brew);
        const rings = [];
        for (const [r0, r1, sp] of [[1.55, 1.7, 0.45], [2.05, 2.18, -0.3]]) {
          const rn = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24), new THREE.MeshBasicMaterial({ color: 0x58ff98, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          rn.rotation.x = -Math.PI / 2; rn.position.y = 0.02; g.add(rn);
          const anim = { kind: 'spin', m: rn, sp, axis: 'z' };
          w.animated.push(anim);
          rings.push({ m: rn, anim });
        }
        w.cauldronVis = { brew, rings };
        grp.add(g);
      });
      P().rug(w, W / 2, cz + 2, 0, 10, 6, [0.1, 0.32, 0.22]);
      for (const sx of [-1, 1]) {
        // the east table is the weapon-parts workbench (free here)
        if (sx > 0) partBench(w, W / 2 + 5.5, cz, 0, true, rng);
        else { P().table(w, W / 2 + sx * 5.5, cz, 0, false, rng); P().candles(w, W / 2 + sx * 5.5, 0.86, cz, rng, true); }
        P().bookshelf(w, sx < 0 ? 1 : W - 1, cz - 2, 0, false, rng);
        P().bookshelf(w, sx < 0 ? 1 : W - 1, cz + 2, 0, false, rng);
        P().crystals(w, W / 2 + sx * 4.2, 0, cz - 3.2, rng, 0.75);
      }
      w.npcSpots.push(new THREE.Vector3(W / 2, 0, cz - 2.2));
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
    w.fireRects = w.fireRects || []; // (the stacked-storey fields add their own gate-ledge fires before this)
    const W = w.W;
    if (o.boss) { w.fireY = LG.FIRE_Y; w.fireZ = o.AD + 1; }
    const plats = w.platTops || [];
    // normal areas: perches that can't carry a fire bed (thin ledges, wall tops, the ledges by the exit signs)
    // get an invisible column instead, so there is simply nowhere to stand
    const ghost = (c) => { const g = w.addCollider(c.x0 - 0.06, c.y1, c.z0 - 0.06, c.x1 + 0.06, c.y1 + 40, c.z1 + 0.06, { noGrapple: true, surf: c.surf }); g.ghost = true; };
    for (const c of w.colliders.slice()) {
      if (c.alive === false || c.ghost || c.noFire || c.tag === 'bridge') continue;
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
        const ni = w.navIdx(mx, mz, c.y1);
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
