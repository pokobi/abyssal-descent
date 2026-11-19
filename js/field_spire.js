'use strict';
// 逆さの尖塔 (spire, the deep tier): a cathedral that fell into the abyss upside down and stuck, wedged across a chasm between its two
// walls of rock, its crossing tower and spire hanging down into the dark. You walk on what was its vaulting.
// Turned over, a rib vault's inner face is a run of shallow dishes: each bay sinks to its keystone in the middle, and the diagonal
// ribs run up out of it as ridges to the corners where the piers stood; the transverse ribs cross the nave between the bays, low in
// the middle and rising to the sides. The nave (with the choir beyond the crossing) runs north and south down the middle; the aisles
// either side lie a step lower, behind the broken stumps of the arcade wall (a breach here and there, its stones spilled down into the
// aisle); the transept crosses it, and in the crossing the old bell hole is torn wide: through it you see down into the tower and the
// spire, and the cold light of the abyss comes up. An inverted strainer arch spans the hole. Over the outer walls and at the broken ends
// is the abyss itself. Iron wheel chandeliers stand up from the keystones on their rods like iron trees; high over your head the
// tallest piers still carry the arcade's arches, hanging now as cradles, with what fell from the old floor caught in them.
// The way in is the ledge on the south wall of the chasm, the gates are in its north wall.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // (the stone a pale cool limestone; the light of the place comes up from below: the hemisphere's ground colour is the abyss's cold glow)
  G.Tex.BIOMES.spire = { name: '逆さの尖塔', stone: '#8c8984', stone2: '#837f78', floor: '#77736c', trim: '#9c978e', rock: '#6a6964', wood: '#5a4a3c', fog: '#0e141e', fogD: 0.0135, hemiS: '#44474e', hemiG: '#62769a', amb: 0.6, moon: '#a8b4c8', moonI: 0.55, torch: '#ff9a50', cloth: '#3a2222', accent: 'bones' };

  // ---------------------------------------------------------------- small helpers (no dice: shapes from where they are)
  const hsh = (x, z, k) => { let h = Math.imul(Math.round(x * 97) | 0, 374761393) ^ Math.imul(Math.round(z * 89) | 0, 668265263) ^ Math.imul((k | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const NZ = T.noise(0x5a17), NZ2 = T.noise(0x2e91);
  const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const PW = 1.7; // the vaulting's profile: depth goes as r^PW from the keystone out

  // ---------------------------------------------------------------- the plan (fixed: 84 x 96)
  const W = 84, D = 96, CX = 42;
  const NAVE = [34, 50], AISLE_W = [25, 34], AISLE_E = [50, 59];
  const TR = [36, 52], TZ = 44;                               // the transept's band (z) and its middle
  const CHOIR_Z = [15, 22, 29, 36], NAVE_Z = [52, 59, 66, 73, 80, 87];
  const TR_XW = [9, 17, 25, 34], TR_XE = [50, 59, 67, 75];
  const LAND_N = 10, CRUSH = 15, LAND_S = 87;
  const HOLE = { x: CX, z: TZ };
  // a bay: its rect, the way its trough runs (ax: 'z' the nave's way, 'x' the transept's), base (the keystone's height), Hr (the
  // corners), Hk (the transverse ribs' crowns), Hw (the wall ribs' crowns)
  const bays = [];
  const bay = (x0, x1, z0, z1, ax, kind, base, Hr, Hk, Hw) => { const B = { x0, x1, z0, z1, ax, kind, base, Hr, Hk, Hw, xc: (x0 + x1) / 2, zc: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 }; bays.push(B); return B; };
  for (const zs of [CHOIR_Z, NAVE_Z]) for (let i = 0; i + 1 < zs.length; i++) {
    bay(NAVE[0], NAVE[1], zs[i], zs[i + 1], 'z', zs === CHOIR_Z ? 'choir' : 'nave', 0, 2.0, 0.25, 1.15);
    bay(AISLE_W[0], AISLE_W[1], zs[i], zs[i + 1], 'z', 'aisle', -1.2, 1.4, 0.25, 0.55);
    bay(AISLE_E[0], AISLE_E[1], zs[i], zs[i + 1], 'z', 'aisle', -1.2, 1.4, 0.25, 0.55);
  }
  bay(NAVE[0], NAVE[1], TR[0], TR[1], 'z', 'crossing', 0, 2.0, 0.25, 0.25);
  for (const xs of [TR_XW, TR_XE]) for (let i = 0; i + 1 < xs.length; i++) bay(xs[i], xs[i + 1], TR[0], TR[1], 'x', 'transept', 0, 2.0, 0.25, 1.15);
  const bayAt = (x, z) => { for (const B of bays) if (x >= B.x0 && x < B.x1 && z >= B.z0 && z < B.z1) return B; return null; };
  // the vault's face in a bay at (x, z): the sector between two diagonals that touches a transverse rib (b >= a) or a wall (a > b)
  function bayH(B, x, z) {
    let a, b;
    if (B.ax === 'z') { a = Math.abs(x - B.xc) / B.hx; b = Math.abs(z - B.zc) / B.hz; } else { a = Math.abs(z - B.zc) / B.hz; b = Math.abs(x - B.xc) / B.hx; }
    a = Math.min(a, 1.2); b = Math.min(b, 1.2);
    const Rd = (r) => B.Hr * Math.pow(r, PW);
    let h;
    if (b >= a) { const r = b, s = r > 1e-6 ? a / r : 0, Rr = B.Hk * Math.pow(r, PW); h = Rr + (Rd(r) - Rr) * Math.pow(s, PW); }
    else { const r = a, s = b / r, Rl = B.Hw * Math.pow(r, PW); h = Rl + (Rd(r) - Rl) * Math.pow(s, PW); }
    return B.base + h;
  }
  // the bell hole torn wide: its radius by the angle (a fixed ragged outline)
  const holeR = (x, z) => { const a = Math.atan2(z - HOLE.z, x - HOLE.x); return 4.35 + 0.55 * Math.sin(a * 3 + 0.7) * 0.5 + 0.45 * (NZ(Math.cos(a) * 2.3 + 5, Math.sin(a) * 2.3) - 0.5) + 0.25 * Math.sin(a * 7 + 2); };
  const inHole = (x, z) => Math.hypot(x - HOLE.x, z - HOLE.z) < holeR(x, z);

  // ---------------------------------------------------------------- the area
  function genSpire(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const w = new G.World(W, D, 'spire');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.noRim = true; w.killY = -16;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    // ---- the dice, all thrown here first, in a fixed order
    const layout = F.pickLayout(rng, 'spire', ['west', 'east']);   // which transept arm broke off at its end (an island beyond a gap)
    w.layout = layout;
    const armS = layout === 'west' ? -1 : 1;
    const breach = { W: [], E: [] };                               // breaches in the arcade wall: bay index (choir 0..2, nave 3..7)
    for (const s of ['W', 'E']) { const k1 = rng.int(0, 2), k2 = rng.int(3, 7), k3 = rng.int(3, 7); breach[s] = [...new Set([k1, k2, rng.chance(0.6) ? k3 : k2])]; }
    const tallW = rng.int(1, 4), tallE = rng.int(1, 4);           // the pair of nave piers either side that still stand to the old floor
    const chand = [];                                               // the bays the wheel chandeliers stand in
    { const pool = [0, 1, 2, 3, 4, 5, 6, 7]; for (let i = 0; i < 3; i++) { const k = rng.int(0, pool.length - 1); chand.push(pool[k]); pool.splice(k, 1); } }
    const outerGap = []; for (let k = 0; k < 16; k++) outerGap.push(rng.next());
    const armBay = layout === 'west' ? [9, 17] : [67, 75];
    const gapX = layout === 'west' ? [12.5, 17] : [67, 71.5];
    const S = { rng, w, occ, armS, gapX, breach, tallW, tallE, chand, outerGap, seed };
    // ---- the ground
    ground(S);
    // ---- walls, piers, the ledges, the arches over the hole and the gap
    walls(S);
    ledges(S, gates);
    arches(S);
    chandeliers(S);
    highWorks(S);
    below(S);
    dress(S);
    lightUp(S);
    w.navLayers = 2;
    w.spireInfo = { chand: S.chandAt || [], lookouts: S.lookouts || [], gapX: S.gapX, layout };   // (for the tools that look at it)
    // (falling: the hole and the abyss beyond the walls; nothing to land on above the kill plane)
    const ww = FB.finish(w, rng, occ, W, D, area, kind, extraChests);
    ww.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return ww;
  }
  F.gen.spire = genSpire;
  // (the parts the rooms of this field are built with too: field_rooms.js S.spire)
  F._spire = { sweep: (...a) => sweep(...a), ribProf: (k) => ribProf(k), wallRun: (...a) => wallRun(...a), pier: (...a) => pier(...a), hangArch: (...a) => hangArch(...a), hangChain: (...a) => hangChain(...a), chasmFace: (...a) => chasmFace(...a), boss: (...a) => boss(...a) };

  // ---------------------------------------------------------------- the ground: where it is and how high
  // (sub-cells of half a metre: the ragged edges of the hole and of the broken ends follow them, and so do the boxes you stand on)
  function makeShape(S) {
    const { gapX, breach } = S;
    const armW = S.armS < 0;
    // the arcade breaches as ramps: the wall's stones spilled into the aisle, from the nave's side down
    const ramps = [];
    for (const s of ['W', 'E']) for (const k of breach[s]) {
      const zs = k < 3 ? CHOIR_Z : NAVE_Z, i = k < 3 ? k : k - 3, z0 = zs[i], z1 = zs[i + 1], zc = (z0 + z1) / 2, xw = s === 'W' ? NAVE[0] : NAVE[1];
      ramps.push({ xw, sgn: s === 'W' ? -1 : 1, zc, half: 1.6 });
    }
    S.ramps = ramps;
    function raw(x, z) {
      // the ledges: flat
      if (z < LAND_N) return x > 6 && x < W - 6 ? { h: 0, mk: 'ledge' } : null;
      if (z >= LAND_S + 4) return x > 35 && x < W - 35 && z < D ? { h: 0, mk: 'ledge' } : null;
      if (z >= LAND_S) {
        if (x < 36 || x > 48) return null;
        const B = bayAt(x, LAND_S - 0.01), t = ss(0, 1, (z - LAND_S) / 4);
        return { h: bayH(B, x, LAND_S - 0.01) * (1 - t), mk: t > 0.6 ? 'ledge' : 'crush' };
      }
      if (z < CRUSH) {
        if (x < AISLE_W[0] || x >= AISLE_E[1]) return null;
        const B = bayAt(x, CRUSH + 0.01), t = ss(0, 1, (z - LAND_N) / (CRUSH - LAND_N));
        return { h: bayH(B, x, CRUSH + 0.01) * t, mk: 'crush' };
      }
      const B = bayAt(x, z); if (!B) return null;
      // the broken arm: a gap through its last bay, an island beyond
      if (B.kind === 'transept' && x > gapX[0] && x < gapX[1]) return null;
      let h = bayH(B, x, z);
      if (B.kind === 'aisle') {
        // where an aisle meets the transept, the arch between them fell into it: a slope of its stones up to the transept's floor
        for (const zb of TR) { const d = Math.abs(z - zb); if (d < 6) { const B2 = bayAt(x, zb === TR[0] ? zb + 0.01 : zb - 0.01); h = Math.max(h, bayH(B2, x, zb) - 0.42 * d - 0.05); } }
        for (const r of ramps) {
          const dx = (x - r.xw) * r.sgn; if (dx < 0 || dx > 6) continue;
          const dz = Math.max(0, Math.abs(z - r.zc) - r.half), crest = bayH(bayAt(r.xw - r.sgn * 0.01, r.zc), r.xw - r.sgn * 0.01, r.zc);
          h = Math.max(h, crest - 0.4 * dx - 0.55 * dz - 0.05);
        }
      }
      return { h, mk: 'vault', B };
    }
    // is there ground at (x, z) (a sub-cell's middle)? the hole, the gap's broken edges, the aisles' broken south ends
    function present(x, z) {
      const r = raw(x, z); if (!r) return null;
      if (inHole(x, z)) return null;
      if (r.B && r.B.kind === 'aisle' && z > LAND_S - 1.6) { if (z > LAND_S - 0.3 - 1.1 * NZ(x * 0.7, 3.1)) return null; }
      if (r.B && r.B.kind === 'transept') {
        const e0 = gapX[0], e1 = gapX[1];
        if (x <= e0 && x > e0 - 1.4 && x > e0 - 0.2 - 1.0 * NZ(z * 0.8, 7.7)) return null;
        if (x >= e1 && x < e1 + 1.4 && x < e1 + 0.2 + 1.0 * NZ(z * 0.8, 9.1)) return null;
      }
      return r;
    }
    return { raw, present, armW };
  }

  // the ground built: colliders (as T.build lays them: runs of whole cells, a steep cell or a ragged one as half-metre columns), the
  // grid the feet read (T.surf over each cell's own four corners), and the drawn face: every half-metre square at the vault's own height
  // at its corners, coloured by where it is (the dust and damp in the bays' hollows, the dirt along the ribs, a patchiness over all)
  function ground(S) {
    const { w, occ } = S;
    const SH = makeShape(S); S.shape = SH;
    const hf = T.grid(W, D, -3), cc = new Float32Array(W * D * 4), sub = new Uint8Array(W * D * 4);
    const hAt = (r, x, z) => {
      // (the height of the same piece of ground at another point near it: its own bay's formula, ramps and all)
      const q = SH.raw(x, z); if (q && (q.B === r.B || !r.B)) return q.h;
      if (r.B) return bayH(r.B, x, z);
      return r.h;
    };
    S.hAt = (x, z) => { const r = SH.present(x, z); return r ? r.h : null; };
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x;
      let any = 0;
      for (let k = 0; k < 4; k++) { const r = SH.present(x + 0.25 + (k & 1) * 0.5, z + 0.25 + (k >> 1) * 0.5); if (r) { sub[i * 4 + k] = 1; any++; } }
      if (!any) { hf.m[i] = 0; continue; }
      let r = SH.raw(x + 0.5, z + 0.5);
      for (let k = 0; k < 4 && !r; k++) if (sub[i * 4 + k]) r = SH.raw(x + 0.25 + (k & 1) * 0.5, z + 0.25 + (k >> 1) * 0.5);
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b], k) => { cc[i * 4 + k] = hAt(r, x + a, z + b); });
      hf.h[i] = Math.round((cc[i * 4] + cc[i * 4 + 1] + cc[i * 4 + 2] + cc[i * 4 + 3]) / 4 * 16) / 16;
    }
    hf._cc = cc;
    const grid = { hf, ox: 0, oz: 0, cc, cliff: true };
    const co = { surf: 'stone' };
    const steep = (i) => { const a = cc[i * 4], b = cc[i * 4 + 1], c = cc[i * 4 + 2], d = cc[i * 4 + 3]; return Math.max(a, b, c, d) - Math.min(a, b, c, d) > 0.3; };
    const whole = (i) => sub[i * 4] && sub[i * 4 + 1] && sub[i * 4 + 2] && sub[i * 4 + 3];
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        const i = z * W + x;
        if (!hf.m[i]) { x++; continue; }
        if (steep(i) || !whole(i)) {
          for (let k = 0; k < 4; k++) {
            if (!sub[i * 4 + k]) continue;
            const fx = 0.25 + (k & 1) * 0.5, fz = 0.25 + (k >> 1) * 0.5;
            const y = (cc[i * 4] * (1 - fx) + cc[i * 4 + 1] * fx) * (1 - fz) + (cc[i * 4 + 2] * (1 - fx) + cc[i * 4 + 3] * fx) * fz;
            w.addCollider(x + fx - 0.25, hf.base, z + fz - 0.25, x + fx + 0.25, Math.round(y * 16) / 16, z + fz + 0.25, co).tg = grid;
          }
          x++; continue;
        }
        let x2 = x + 1; while (x2 < W && hf.m[z * W + x2] && whole(z * W + x2) && hf.h[z * W + x2] === hf.h[i] && !steep(z * W + x2)) x2++;
        w.addCollider(x, hf.base, z, x2, hf.h[i], z + 1, co).tg = grid;
        x = x2;
      }
    }
    w.groundGrid = [grid];
    w.groundTop = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); if (cx < 0 || cz < 0 || cx >= W || cz >= D) return null; const i = cz * W + cx; return hf.m[i] ? hf.h[i] : null; };
    w.groundElse = () => null;
    // (the ground by its half-metre sub-cells: the ragged edges are drawn and stopped by them; for the tools that look at the edges)
    w.groundSub = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); if (cx < 0 || cz < 0 || cx >= W || cz >= D) return null; const i = cz * W + cx, k = (x - cx >= 0.5 ? 1 : 0) + (z - cz >= 0.5 ? 2 : 0); return sub[i * 4 + k] ? hf.h[i] : null; };
    S.hf = hf; S.sub = sub;
    // the cells that are not ground: kept clear of what the area lays down
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (!hf.m[i] || !(sub[i * 4] && sub[i * 4 + 1] && sub[i * 4 + 2] && sub[i * 4 + 3])) occ.mark(x, z, x + 1, z + 1, 2); }
    drawGround(S, SH);
  }

  // the drawn ground
  function drawGround(S, SH) {
    const { w } = S, sub = S.sub;
    const GV = w.batch._grp('block'), GL = w.batch._grp('rock');
    const hPt = (r, x, z) => { const q = SH.raw(x, z); if (q && (q.B === r.B || !r.B)) return q.h; if (r.B) return bayH(r.B, x, z); return r.h; };
    const e = 0.06;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) for (let k = 0; k < 4; k++) {
      const i = z * W + x; if (!sub[i * 4 + k]) continue;
      const x0 = x + (k & 1) * 0.5, z0 = z + (k >> 1) * 0.5, x1 = x0 + 0.5, z1 = z0 + 0.5, r = SH.raw(x0 + 0.25, z0 + 0.25);
      const G0 = r.mk === 'ledge' ? GL : GV, uvS = r.mk === 'ledge' ? 1 / 3 : 1 / 1.6;
      const base = G0.p.length / 3;
      for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
        const y = hPt(r, px, pz), dx = hPt(r, px + e, pz) - hPt(r, px - e, pz), dz = hPt(r, px, pz + e) - hPt(r, px, pz - e);
        let nx = -dx / (2 * e), ny = 1, nz = -dz / (2 * e); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const yy = r.mk === 'ledge' ? y + (NZ(px * 1.3, pz * 1.3) - 0.5) * 0.03 : y;
        G0.p.push(px, yy, pz); G0.n.push(nx, ny, nz); G0.u.push(px * uvS, -pz * uvS);
        const c = groundTint(r, px, pz, y);
        G0.c.push(c[0], c[1], c[2]);
      }
      G0.i.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
    edges(S, SH, hPt);
  }
  // the colour of the vault's face: a stone's patchiness, the dust and old damp collected in each bay's hollow round its keystone, the
  // grime along the creases where the webs meet the ribs; the crushed masonry and the ledges darker
  function groundTint(r, x, z, y) {
    const m = 0.86 + 0.26 * NZ(x * 0.23, z * 0.23) + 0.08 * (NZ2(x * 1.7, z * 1.7) - 0.5);
    if (r.mk === 'ledge') { const d = 0.85 + 0.3 * NZ2(x * 0.4, z * 0.4); return [d, d * 0.99, d * 0.97]; }
    if (r.mk === 'crush') return [0.8 * m, 0.78 * m, 0.75 * m];
    const B = r.B;
    let a, b; if (B.ax === 'z') { a = Math.abs(x - B.xc) / B.hx; b = Math.abs(z - B.zc) / B.hz; } else { a = Math.abs(z - B.zc) / B.hz; b = Math.abs(x - B.xc) / B.hx; }
    const rr = Math.max(a, b), crease = Math.abs(a - b) / Math.max(0.05, rr);
    const pool = 1 - ss(0.12, 0.42 + 0.12 * NZ(x * 0.9, z * 0.9), rr);            // (the hollow round the keystone: damp, dust)
    const along = 1 - ss(0.0, 0.07, crease) * 1;                                      // (along the diagonal ribs' feet)
    let k = m * (1 - 0.3 * pool) * (1 - 0.12 * along * ss(0.15, 0.5, rr));
    const warm = 0.03 * pool;
    if (B.kind === 'aisle') k *= 0.94;
    return [k * (1 + warm), k, k * (1 - warm * 1.4)];
  }
  // where the ground ends or drops: the broken edge of the webs (0.45 m of cut stone) and the rubble of the fill under them, ragged
  function edges(S, SH, hPt) {
    const { w } = S, sub = S.sub;
    const GB = w.batch._grp('block'), GR = w.batch._grp('rock'), M = LG.mason(w);
    const has = (x, z, k) => x >= 0 && z >= 0 && x < W && z < D && sub[(z * W + x) * 4 + k];
    const subAt = (sx, sz) => has(sx >> 1, sz >> 1, (sx & 1) + 2 * (sz & 1));
    const face = (G0, ax, az, bx, bz, ta, tb, ba, bb, nx, nz, tint, uvs) => {
      const base = G0.p.length / 3;
      for (const [px, py, pz] of [[ax, ba, az], [bx, bb, bz], [bx, tb, bz], [ax, ta, az]]) { G0.p.push(px, py, pz); G0.n.push(nx, 0, nz); G0.u.push((nx ? pz : px) / uvs, py / uvs); const f = tint * (0.8 + 0.3 * NZ2(px * 1.1 + py, pz * 1.1)); G0.c.push(f, f, f * 1.02); }
      if ((bx - ax) * nz - (bz - az) * nx > 0) G0.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else G0.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    for (let sz = 0; sz < D * 2; sz++) for (let sx = 0; sx < W * 2; sx++) {
      if (!subAt(sx, sz)) continue;
      const x0 = sx / 2, z0 = sz / 2, r = SH.raw(x0 + 0.25, z0 + 0.25);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ax = dx ? (dx > 0 ? x0 + 0.5 : x0) : x0, bx = dx ? ax : x0 + 0.5, az = dz ? (dz > 0 ? z0 + 0.5 : z0) : z0, bz = dz ? az : z0 + 0.5;
        const ta = hPt(r, ax, az), tb = hPt(r, bx, bz);
        if (subAt(sx + dx, sz + dz)) {
          // (a drop between two kinds of ground: the higher one's face down to the lower)
          const r2 = SH.raw(x0 + 0.25 + dx * 0.5, z0 + 0.25 + dz * 0.5), la = hPt(r2, ax, az), lb = hPt(r2, bx, bz);
          if (ta - la > 0.03 || tb - lb > 0.03) face(GB, ax, az, bx, bz, ta + 0.01, tb + 0.01, Math.min(la, ta) - 0.02, Math.min(lb, tb) - 0.02, dx, dz, 0.8, 1.6);
          continue;
        }
        // (the open edge: the webs' cut face, ragged in depth, then the rough fill under it, then nothing)
        const d1 = 0.38 + 0.14 * hsh(ax, az, 3), d2 = 0.38 + 0.14 * hsh(bx, bz, 3);
        face(GB, ax, az, bx, bz, ta + 0.01, tb + 0.01, ta - d1, tb - d2, dx, dz, 0.86, 1.2);
        const f1 = 0.9 + 0.9 * hsh(ax, az, 5), f2 = 0.9 + 0.9 * hsh(bx, bz, 5);
        face(GR, ax, az, bx, bz, ta - d1 + 0.02, tb - d2 + 0.02, ta - d1 - f1, tb - d2 - f2, dx, dz, 0.55, 2);
        // (on the broken rims you can see - the hole, the gap, the aisles' ends - the webs' last stones, loose and tilted, over the edge)
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const seen = Math.hypot(mx - HOLE.x, mz - HOLE.z) < 7 || mz > LAND_S - 2.6 || (mx > S.gapX[0] - 2.5 && mx < S.gapX[1] + 2.5);
        if (seen && hsh(mx, mz, 7) < 0.7) {
          const sz = 0.16 + 0.16 * hsh(mx, mz, 8), y = (ta + tb) / 2, ry = Math.atan2(dz, dx) + (hsh(mx, mz, 9) - 0.5) * 0.9;
          M.blk('trim', mx + dx * (0.05 + 0.12 * hsh(mx, mz, 10)) - dx * 0.2, y - 0.3, mz + dz * (0.05 + 0.12 * hsh(mx, mz, 10)) - dz * 0.2, sz * 1.7, y + 0.04 + 0.08 * hsh(mx, mz, 11), sz * 1.2, ry, 0.02, { chip: 0.6, chipS: 0.08, n: 0.02 }, [(hsh(mx, mz, 12) - 0.5) * 0.4, (hsh(mx, mz, 13) - 0.5) * 0.4]);
        }
      }
    }
  }

  // ---------------------------------------------------------------- placeholders filled below
  function walls(S) { buildWalls(S); }
  function ledges(S, gates) { buildLedges(S, gates); }
  function arches(S) { buildArches(S); }
  function chandeliers(S) { buildChandeliers(S); }
  function highWorks(S) { buildHigh(S); }
  function below(S) { buildBelow(S); }
  function dress(S) { buildDress(S); }
  function lightUp(S) { buildLights(S); }

  // ================================================================ walls and piers
  // A wall laid stone by stone (LG.mason): courses of 0.36 to 0.46 m, stones of 0.5 to 1.1 m, each its full thickness, worked edges and
  // a broken corner now and then; its top broken along a ragged line (prof: the height over its foot at a point along it). Its boxes:
  // a column every half metre at the top of the whole courses there.
  function wallRun(S, o) {
    const { w } = S, M = LG.mason(w);
    const { x0, z0, x1, z1, th, mk } = o, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const L = alongX ? x1 - x0 : z1 - z0, c0 = alongX ? z0 : x0;
    const foot = o.foot, prof = o.prof, tint = o.tint || [1, 1, 1];
    const at = (t, c) => (alongX ? [x0 + t, c] : [c, z0 + t]);
    // the courses, from the lowest foot along it
    let yb = Infinity; for (let t = 0; t <= L; t += 0.5) yb = Math.min(yb, foot(t));
    yb -= 0.35;
    const cols = [];
    for (let t = 0; t < L - 0.01; t += 0.5) cols.push({ t, top: yb });
    let y = yb, ci = 0;
    while (ci < 60) {
      const chh = 0.36 + 0.1 * hsh(c0 * 3.1 + ci, o.key || 0, 11);
      let t = -(hsh(c0, ci, 12) * 0.6), any = false;
      while (t < L) {
        const len = 0.5 + 0.6 * hsh(c0 + t * 1.3, y, 13), a = Math.max(0, t), b = Math.min(L, t + len), mid = (a + b) / 2;
        if (b - a > 0.12 && y + chh <= foot(mid) + prof(mid) + 0.04) {
          any = true;
          const sb = (hsh(mid, y, 14) - 0.5) * 0.05, h0 = th / 2 + sb, v = M.var(mid, y, c0, 2);
          const [ax, az] = at(a + 0.005, 0), [bx, bz] = at(b - 0.005, 0);
          const Pp = [];
          for (let kk = 0; kk < 8; kk++) {
            const al = kk & 1 ? 1 : 0, up = kk & 2 ? 1 : 0, ac = kk & 4 ? 1 : -1;
            const px = alongX ? (al ? bx : ax) : c0 + ac * h0, pz = alongX ? c0 + ac * h0 : (al ? bz : az);
            Pp.push([px, y + (up ? chh - 0.008 : 0.004), pz]);
          }
          M.hexa(mk || 'trim', Pp, 0.02, { tint: [tint[0] * v[0], tint[1] * v[1], tint[2] * v[2]], n: 0.012, chip: 0.22, chipS: 0.09, uv: 1.6, gy: yb + 0.4 });
          for (const c of cols) if (c.t >= a - 0.01 && c.t + 0.5 <= b + 0.01) c.top = Math.max(c.top, y + chh);
        }
        t += len;
      }
      if (!any && y > yb + 0.5) break;
      y += chh; ci++;
    }
    // (the boxes: each half metre's column up to the whole courses over it; under the foot nothing is needed)
    for (const c of cols) {
      const top = c.top; if (top <= yb + 0.05) continue;
      const [ax, az] = at(c.t, c0 - th / 2), [bx, bz] = at(c.t + 0.5, c0 + th / 2);
      w.addCollider(Math.min(ax, bx), yb, Math.min(az, bz), Math.max(ax, bx), top, Math.max(az, bz), { surf: 'stone' });
    }
    if (o.below) w.visual('block', alongX ? x0 : c0 - th / 2, o.below, alongX ? c0 - th / 2 : z0, alongX ? x1 : c0 + th / 2, yb + 0.02, alongX ? c0 + th / 2 : z1, { uv: 2.2, grad: false, skip: { top: true } });
    return yb;
  }

  // a compound pier's stump: a drum-built core with eight shafts round it, broken off at h (its jagged top), on the vault at y0
  const _geo = {};
  const cylG = (seg) => _geo['c' + seg] || (_geo['c' + seg] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, false));
  const cylO = (seg) => _geo['o' + seg] || (_geo['o' + seg] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true));   // (no ends: drums stacked on one another)
  function pier(S, x, z, y0, h, big, tall) {
    const { w } = S, M = LG.mason(w), R = big ? 1.25 : 0.78, r = big ? 0.26 : 0.17, n = big ? 12 : 8;
    const top = y0 + h;
    // the core in drums, each a little off true; the shafts in their own lengths, some broken lower
    for (let y = y0 - 0.4, k = 0; y < top - 0.05; k++) {
      const dh = Math.min(top - y, 0.52 + 0.1 * hsh(x, z + k, 21)); const v = M.var(x, y, z, 3);
      w.batch.geo('block', y + dh < top - 0.05 ? cylO(24) : cylG(24), Mx(x + (hsh(x, k, 22) - 0.5) * 0.02, y + dh / 2, z + (hsh(z, k, 23) - 0.5) * 0.02, R, dh - 0.012, R), { su: 2 * R, sv: dh / 1.4, tint: [v[0] * 0.98, v[1] * 0.98, v[2]], gradBase: y0 - 0.4 });
      y += dh;
    }
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.PI / n, sx = x + Math.cos(a) * (R + r * 0.55), sz = z + Math.sin(a) * (R + r * 0.55);
      const sh = tall ? h : Math.max(0.3, h - 0.15 - 1.2 * hsh(x + i, z, 24));
      // (a tall pier's shafts were coursed in lengths; some lengths have fallen out, leaving the core bare; the top one or two
      // broken off short of the head)
      const segs = [];
      if (tall) { let y = y0 - 0.4; const end = y0 + sh - (hsh(x, z + i, 29) < 0.4 ? 2 + 5 * hsh(z, x + i, 30) : 0); while (y < end) { const L = Math.min(end - y, 1.6 + 2.4 * hsh(x + i, y, 31)); if (hsh(y, x + i, 32) > 0.14 || y < y0 + 3) segs.push([y, y + L]); y += L + 0.01; } }
      else segs.push([y0 - 0.4, y0 + sh]);
      for (const [a0, a1] of segs) w.batch.geo('trim', cylG(12), Mx(sx, (a0 + a1) / 2, sz, r, a1 - a0 - 0.006, r), { su: 1, sv: (a1 - a0) / 1.6, tint: [0.9, 0.89, 0.87], gradBase: y0 - 0.4 });
      // (the shaft-rings every course or so: annulets)
      for (let yy = y0 + 1.6 + 2.2 * hsh(i, x, 25); yy < y0 + sh - 0.2; yy += 3.1) w.batch.geo('trim', cylG(12), Mx(sx, yy, sz, r + 0.04, 0.12, r + 0.04), { tint: [0.86, 0.85, 0.83] });
    }
    // the broken head: a few lumps of the last drum (if it does not go on up)
    if (!tall) for (let k = 0; k < 4; k++) { const a = k * 1.7 + hsh(x, z, 26) * 6, rr = R * (0.2 + 0.5 * hsh(x, k, 27)); M.blk('trim', x + Math.cos(a) * rr, top - 0.05, z + Math.sin(a) * rr, R * 0.32, top + 0.12 + 0.25 * hsh(z, k, 28), R * 0.28, a, 0.03, { chip: 0.5, chipS: 0.1, n: 0.03 }); }
    { const c = w.addCollider(x - R - r, y0 - 0.4, z - R - r, x + R + r, top, z + R + r, { surf: 'stone', noGrapple: !!tall }); if (tall) c.noFire = true; }   // (no one gets up a pier with no hold on it: no fire bed on its head, fireTops)
    S.occ.mark(x - R - 1, z - R - 1, x + R + 1, z + R + 1, 2);
  }

  function buildWalls(S) {
    const { w, occ, breach } = S;
    const gy = (x, z) => { const y = S.hAt(x, z); return y == null ? 0 : y; };
    // ---- the arcade walls: between the nave (and choir) and the aisles; a pier at every bay's end, the wall between broken
    for (const [s, xw] of [['W', NAVE[0]], ['E', NAVE[1]]]) {
      [CHOIR_Z, NAVE_Z].forEach((zs, part) => {
        for (let i = 0; i + 1 < zs.length; i++) {
          const k = part ? i + 3 : i, z0 = zs[i], z1 = zs[i + 1], br = breach[s].includes(k);
          const foot = (t) => Math.max(gy(xw - 0.8, z0 + t), gy(xw + 0.8, z0 + t));
          const hb = 0.9 + 2.1 * hsh(xw, z0, 31);
          const prof = br ? (t) => { const d = Math.abs(t - (z1 - z0) / 2); return d < 2.4 ? -0.4 : (d - 2.4) * 0.9 + 0.2 * NZ(t * 1.4, xw); }
            : (t) => hb * (0.55 + 0.45 * NZ((z0 + t) * 0.45, xw * 0.3)) + 0.35 * (NZ2((z0 + t) * 1.7, xw) - 0.5);
          wallRun(S, { x0: xw, z0: z0 + 1.0, x1: xw, z1: z1 - 1.0, th: 1.2, foot: (t) => foot(t + 1.0), prof: (t) => prof(t + 1.0), key: k, tint: [0.97, 0.96, 0.94] });
          occ.mark(xw - 1, z0, xw + 1, z1, 2);
        }
        for (let i = 0; i < zs.length; i++) {
          const z = zs[i]; if (z === TR[0] || z === TR[1]) continue;
          const tall = (part === 1 && (i === (s === 'W' ? S.tallW : S.tallE) || i === (s === 'W' ? S.tallW : S.tallE) + 1));
          const hp = tall ? 24 + 3 * hsh(xw, z, 33) : 1.6 + 3.4 * hsh(xw, z, 32);
          pier(S, xw, z, Math.max(gy(xw - 1, z), gy(xw + 1, z)) - 0.1, hp, false, tall);
        }
      });
    }
    // ---- the crossing's four great piers
    for (const x of NAVE) for (const z of TR) pier(S, x, z, gy(x, z) - 0.1, 27 + 2 * hsh(x, z, 34), true, true);
    // ---- the outer walls of the aisles, and of the transept arms: low and broken, open in places on the abyss
    let gi = 0;
    for (const [xw, sgn] of [[AISLE_W[0], -1], [AISLE_E[1], 1]]) for (const [za, zb] of [[CHOIR_Z[0], CHOIR_Z[3]], [NAVE_Z[0], NAVE_Z[5] - 0.5]]) {
      const zs = za === CHOIR_Z[0] ? CHOIR_Z : NAVE_Z;
      for (let i = 0; i + 1 < zs.length; i++) {
        const z0 = zs[i], z1 = Math.min(zb, zs[i + 1]), open = S.outerGap[gi++ % 16] < 0.4;
        const c = xw - sgn * 0.55;
        const foot = (t) => gy(c - sgn * 0.6, z0 + t);
        const hb = 0.5 + 1.6 * hsh(xw, z0, 35);
        const prof = open ? (t) => { const d = Math.abs(t - (z1 - z0) / 2); return d < 2 ? -0.3 + 0.1 * NZ(t, 3) : (d - 2) * 0.8; } : (t) => hb * (0.5 + 0.5 * NZ((z0 + t) * 0.5, xw)) + 0.3 * (NZ2((z0 + t) * 1.9, xw) - 0.5);
        wallRun(S, { x0: c, z0, x1: c, z1, th: 1.1, foot, prof, key: 100 + gi, below: -3.2 });
        occ.mark(c - 1, z0, c + 1, z1, 2);
        if (open) S.lookouts = (S.lookouts || []).concat([{ x: c - sgn * 1.4, z: (z0 + z1) / 2, sgn }]);
      }
      for (const z of zs) if (z !== TR[0] && z !== TR[1] && z < zb) { const y0 = gy(xw - sgn * 1.2, z); pilaster(S, xw - sgn * 0.55, z, y0, sgn, 'x'); }
    }
    // the transept arms: their side walls (on the band's north and south edges) and their end walls (the gable fronts)
    for (const xs of [TR_XW, TR_XE]) {
      const xa = xs[0] === 9 ? 9 : 59, xb = xs[0] === 9 ? 25 : 75, endX = xs[0] === 9 ? 9 : 75, sgn = xs[0] === 9 ? -1 : 1;
      for (const [zw, sz] of [[TR[0], -1], [TR[1], 1]]) {
        const c = zw - sz * 0.55;
        const segs = (S.armS < 0) === (xs[0] === 9) ? [[xa, S.gapX[0] - 0.4], [S.gapX[1] + 0.4, xb]] : [[xa, xb]];
        for (const [a0, a1] of segs) {
          if (a1 - a0 < 1) continue;
          const foot = (t) => gy(a0 + t, c - sz * 0.6), hb = 0.6 + 1.8 * hsh(a0, zw, 36);
          wallRun(S, { x0: a0, z0: c, x1: a1, z1: c, th: 1.1, foot, prof: (t) => hb * (0.45 + 0.55 * NZ((a0 + t) * 0.45, zw)) + 0.3 * (NZ2((a0 + t) * 1.9, zw) - 0.5), key: 200 + a0, below: -3.2 });
          occ.mark(a0, c - 1, a1, c + 1, 2);
        }
      }
      const c = endX - sgn * 0.55;
      wallRun(S, { x0: c, z0: TR[0] + 1.1, x1: c, z1: TR[1] - 1.1, th: 1.1, foot: (t) => gy(c - sgn * 0.6, TR[0] + 1.1 + t), prof: (t) => 1.2 + 1.4 * NZ((TR[0] + t) * 0.35, endX) - 0.9 * Math.exp(-Math.pow((t - 6.9) / 1.6, 2)), key: 300 + endX, below: -3.2 });
      occ.mark(c - 1, TR[0], c + 1, TR[1], 2);
    }
  }
  // the inner face of a buttress at an outer wall: a pilaster strip the vault's ribs spring from (drawn), its foot on the vault
  function pilaster(S, x, z, y0, sgn) {
    // (the respond at an outer wall where the ribs came down: a strip of ashlar out from the wall's face, three shafts before it,
    // broken off a metre or two up; x: the wall's middle line, sgn: which way is out)
    const { w } = S, M = LG.mason(w), xf = x - sgn * 0.55, xb = xf - sgn * 0.42, top = y0 + 1.3 + 1.6 * hsh(x, z, 37);
    for (let y = y0 - 0.3, k = 0; y < top - 0.1; k++) { const dh = Math.min(top - y, 0.38 + 0.08 * hsh(x, k, 38)); const v = M.var(x, y, z, 4); M.box('trim', Math.min(xf, xb), y, z - 0.5, Math.max(xf, xb), y + dh - 0.006, z + 0.5, 0.02, { chip: 0.3, chipS: 0.07, n: 0.01, tint: v }); y += dh; }
    for (const dz of [-0.32, 0, 0.32]) { const sh = top - y0 + 0.25 - (dz ? 0.5 * hsh(x, z + dz, 39) : 0); w.batch.geo('trim', cylG(12), Mx(xb - sgn * 0.12, y0 - 0.3 + sh / 2, z + dz, dz ? 0.13 : 0.17, sh, dz ? 0.13 : 0.17), { su: 1, sv: sh / 1.6, tint: [0.88, 0.87, 0.85] }); }
    w.addCollider(Math.min(xf, xb - sgn * 0.3), y0 - 0.3, z - 0.55, Math.max(xf, xb - sgn * 0.3), top - 0.2, z + 0.55, { surf: 'stone' });
  }

  // ================================================================ geometry: a moulding swept along a line
  // pts: the points along it ([x, y, z]); prof: [s (across), u (up)] round it, from one side's foot over the top to the other side's foot
  // (up: square to the line, toward the world's up). Each section a ring of the profile, lit by its own normals; coloured by tint, a
  // little patchy, darker toward the feet. o.caps: [start, end] faces over a broken end.
  function sweep(w, mk, pts, prof, o) {
    o = o || {};
    const G0 = w.batch._grp(mk), tint = o.tint || [1, 1, 1], uvS = 1 / (o.uv || 1.2), n = prof.length;
    const pn = prof.map((p, i) => { const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)]; let nx = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; if (nx * p[0] + ny * (p[1] + 0.05) < 0) { nx = -nx; ny = -ny; } return [nx, ny]; });
    let along = 0;
    const base0 = G0.p.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let sx = -tz, sz = tx; const sy = 0; let sl = Math.hypot(sx, sz); if (sl < 1e-4) { sx = 1; sz = 0; sl = 1; } sx /= sl; sz /= sl;
      const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
      if (k) along += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
      const P = pts[k], dirt = 0.86 + 0.24 * NZ(P[0] * 0.5 + P[1], P[2] * 0.5);
      for (let i = 0; i < n; i++) {
        const [s, u] = prof[i], [ns, nu] = pn[i];
        G0.p.push(P[0] + sx * s + ux * u, P[1] + sy * s + uy * u, P[2] + sz * s + uz * u);
        G0.n.push(sx * ns + ux * nu, sy * ns + uy * nu, sz * ns + uz * nu);
        G0.u.push(along * uvS, (s + u) * uvS * 2);
        const f = dirt * (0.72 + 0.28 * ss(-0.1, 0.12, u));
        G0.c.push(tint[0] * f, tint[1] * f, tint[2] * f);
      }
    }
    for (let k = 0; k + 1 < pts.length; k++) for (let i = 0; i + 1 < n; i++) { const a = base0 + k * n + i, b = a + 1, c = a + n, d = c + 1; G0.i.push(a, c, b, b, c, d); }
    for (const [k, sg] of [[0, -1], [pts.length - 1, 1]]) {
      if (!(Array.isArray(o.caps) && o.caps[k ? 1 : 0])) continue;
      const c0 = G0.p.length / 3, P = pts[k], Q = pts[k ? k - 1 : 1]; let tx = P[0] - Q[0], ty = P[1] - Q[1], tz = P[2] - Q[2]; const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      for (let i = 0; i < n; i++) { const j = base0 + k * n + i; G0.p.push(G0.p.a[j * 3], G0.p.a[j * 3 + 1], G0.p.a[j * 3 + 2]); G0.n.push(tx, ty, tz); G0.u.push(prof[i][0], prof[i][1]); G0.c.push(tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8); }
      for (let i = 1; i + 1 < n; i++) { if (sg > 0) G0.i.push(c0, c0 + i, c0 + i + 1); else G0.i.push(c0, c0 + i + 1, c0 + i); }
    }
  }
  // the ribs' section (turned over: the moulded face that looked down into the church now looks up): a keel between two hollows, with
  // fillets, its feet sunk into the webs. Half-width 0.19 m (the transverse ribs a third broader), 0.13 m proud of the webs
  const ribProf = (k) => [[-0.19, -0.16], [-0.19, -0.02], [-0.13, 0.035], [-0.09, 0.07], [-0.05, 0.105], [0, 0.135], [0.05, 0.105], [0.09, 0.07], [0.13, 0.035], [0.19, -0.02], [0.19, -0.16]].map(([s, u]) => [s * k, u * (0.85 + 0.15 * k)]);

  // ================================================================ the ribs and the keystones
  function buildRibs(S) {
    const { w } = S, SH = S.shape;
    const onGround = (x, z) => !!SH.present(x, z);
    // a rib along the plan line from (ax, az) to (bx, bz) over bay B, cut where the ground stops (the hole, the gap)
    const rib = (B, ax, az, bx, bz, k, tint) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 0.5));
      let run = [], broke = false;
      const flush = (capA, capB) => { if (run.length > 1) sweep(w, 'trim', run, ribProf(k), { tint, uv: 1.4, caps: [capA, capB] }); run = []; };
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (!onGround(x, z)) { if (run.length) flush(broke, true); broke = true; continue; }
        run.push([x, bayH(B, x, z), z]);
      }
      flush(broke, false);
    };
    const tintR = [0.95, 0.93, 0.9];
    for (const B of bays) {
      for (const [cx, cz] of [[B.x0, B.z0], [B.x1, B.z0], [B.x0, B.z1], [B.x1, B.z1]]) rib(B, cx + (B.xc - cx) * 0.06, cz + (B.zc - cz) * 0.06, B.xc, B.zc, 1, tintR);
      if (B.ax === 'z') {
        for (const zb of [B.z0, B.z1]) {
          const other = bayAt(B.xc, zb === B.z0 ? zb - 0.01 : zb + 0.01);
          if (zb === B.z1 && other && other.ax === 'z') continue;   // (drawn by the bay beyond)
          rib(B, B.x0 + 0.9, zb + (zb === B.z0 ? 0.01 : -0.01), B.x1 - 0.9, zb + (zb === B.z0 ? 0.01 : -0.01), 1.3, [0.97, 0.95, 0.92]);
        }
        if (B.kind !== 'aisle' && B.kind !== 'crossing') rib(B, B.xc, B.z0 + 0.4, B.xc, B.z1 - 0.4, 0.75, tintR);   // (the ridge rib down the middle)
      } else {
        for (const xb of [B.x0, B.x1]) {
          const other = bayAt(xb === B.x0 ? xb - 0.01 : xb + 0.01, B.zc);
          if (xb === B.x1 && other && other.ax === 'x') continue;
          rib(B, xb + (xb === B.x0 ? 0.01 : -0.01), B.z0 + 0.9, xb + (xb === B.x0 ? 0.01 : -0.01), B.z1 - 0.9, 1.3, [0.97, 0.95, 0.92]);
        }
        rib(B, B.x0 + 0.4, B.zc, B.x1 - 0.4, B.zc, 0.75, tintR);
      }
      if (onGround(B.xc, B.zc)) boss(S, B.xc, bayH(B, B.xc, B.zc), B.zc, B.kind === 'aisle' ? 0.34 : 0.48);
    }
  }
  // a boss: a round of foliage carved about a rosette, turned over (its carving looking up); a low box under it (you step over it)
  function boss(S, x, y, z, R) {
    const { w } = S, M = LG.mason(w), dd = PG().dodeW || PG().dode;
    w.batch.geo('trim', cylG(20), Mx(x, y + 0.06, z, R, 0.2, R), { tint: [0.9, 0.88, 0.85] });
    w.batch.geo('trim', cylG(20), Mx(x, y + 0.19, z, R * 0.78, 0.08, R * 0.78), { tint: [0.92, 0.9, 0.86] });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + hsh(x, z, 41) * 0.5, rr = R * 0.62; w.batch.geo('trim', dd, Mx(x + Math.cos(a) * rr, y + 0.23, z + Math.sin(a) * rr, R * 0.26, 0.07, R * 0.17, 0, -a, 0.3), { tint: [0.86, 0.84, 0.8] }); }
    w.batch.geo('trim', dd, Mx(x, y + 0.27, z, R * 0.24, 0.09, R * 0.24, 0, hsh(x, z, 42) * 3, 0), { tint: [0.84, 0.82, 0.78] });
    if (hsh(x, z, 43) < 0.35) M.blk('trim', x + R * 0.4, y + 0.1, z - R * 0.2, R * 0.2, y + 0.3, R * 0.14, 0.6, 0.02, { chip: 0.6, chipS: 0.06 });   // (a broken leaf lying by it)
    S.w.addCollider(x - R * 0.8, y - 0.2, z - R * 0.8, x + R * 0.8, y + 0.22, z + R * 0.8, { surf: 'stone' });
  }

  // ================================================================ the ledges on the chasm's walls, the gates
  function buildLedges(S, gates) {
    const { w } = S;
    H.perimeter(w, S.rng, W, D, { gates, h: 14, walls: false, beams: 0, stub: 2.5 });
    // (the rock round the ledges stops you: the north face between the gates, the south face either side of the way in)
    const gxs = LG.gateXs(W, gates);
    let ax = -6; for (const g of [...gxs, W + 12]) { const e = g - 5; if (e > ax) w.addCollider(ax, -60, -6, e, 70, 0.2, { surf: 'stone' }).noFire = true; ax = g + 5; }
    for (const [a, b] of [[-6, 35], [49, W + 6]]) w.addCollider(a, -60, LAND_S + 4, b, 70, D + 6, { surf: 'stone' }).noFire = true;
    w.addCollider(-6, -60, D, W + 6, 70, D + 6, { surf: 'stone' }).noFire = true;   // (the chasm's walls go on up out of reach: no tops to stand on, no fire beds)
    S.gxs = gxs;
    // the chasm's two walls, drawn as faces of rock (the north one behind the gates, the south one behind the way in, both running
    // on far east and west along the chasm), and the faces of the ledges where they end on the abyss
    chasmFace(w, -110, W + 110, 0, -1, -70, 34, gxs);
    chasmFace(w, -110, W + 110, D, 1, -70, 30, null, [35, 49]);
    ledgeFront(w, 'z', LAND_N, 6, AISLE_W[0], 1); ledgeFront(w, 'z', LAND_N, AISLE_E[1], W - 6, 1);
    ledgeFront(w, 'x', 6, 0, LAND_N, -1); ledgeFront(w, 'x', W - 6, 0, LAND_N, 1);
    ledgeFront(w, 'x', 35, LAND_S + 4, D, -1); ledgeFront(w, 'x', 49, LAND_S + 4, D, 1);
    ledgeFront(w, 'z', LAND_S + 4, 35, 36, -1); ledgeFront(w, 'z', LAND_S + 4, 48, 49, -1);
    ledgeFront(w, 'x', AISLE_W[0], LAND_N - 0.5, CRUSH + 0.5, -1); ledgeFront(w, 'x', AISLE_E[1], LAND_N - 0.5, CRUSH + 0.5, 1);   // (under the crushed end's sides)
    ledgeFront(w, 'x', 36, LAND_S - 0.3, LAND_S + 4.5, -1); ledgeFront(w, 'x', 48, LAND_S - 0.3, LAND_S + 4.5, 1);   // (under the way in's slope down from the nave)
    // (the rock under the ledges, inside their faces: where two faces meet at a corner, their lean leaves a wedge open between them)
    w.visual('rock', 6.6, -40, -1, W - 6.6, -0.12, LAND_N - 0.6, { uv: 6, grad: false, skip: { top: true } });
    w.visual('rock', 35.6, -40, LAND_S + 4.6, 48.4, -0.12, D + 1, { uv: 6, grad: false, skip: { top: true } });
  }
  // a wall of the chasm: a sheet of rock along z = z0 from x0 to x1, from y0 up to y1, facing in (dir -1: the north wall, facing +z;
  // 1: the south wall, facing -z). Strata standing out, buttresses and bays of the rock from the fbm; the chasm narrowing beyond the
  // area. Open where the gates are and where the way in is. Drawn only (boxes in buildLedges stop you)
  function chasmFace(w, x0, x1, z0, dir, y0, y1, gxs, gap) {
    const G0 = w.batch._grp('rock'), n = T.noise(dir > 0 ? 771 : 337), STEP = 2;
    const NXs = Math.ceil((x1 - x0) / STEP), NYs = Math.ceil((y1 - y0) / STEP);
    const out = (x, y) => {
      let d = 1.6 + 3.2 * T.fbm(n, x / 14, y / 9, 3) + 1.2 * T.fbm(n, x / 4 + 9, y / 3, 2);
      d += Math.max(0, Math.sin(y / 3.1 + T.fbm(n, x / 20, 3, 2) * 2)) * 1.0;
      const far = Math.max(0, Math.abs(x - W / 2) - W / 2 - 4); d += far * 0.18 * (0.6 + 0.4 * T.fbm(n, x / 30, 7, 2));
      // (by the area: kept back behind the ledges' boxes)
      if (x > -4 && x < W + 4 && y > -2) d = Math.max(-0.2, d * 0.35 - 0.6);
      return d;
    };
    const open = (x, y) => (gxs && y > -1 && y < 9.2 && gxs.some((g) => Math.abs(x - g) < 2.6)) || (gap && y > -1 && y < 9.5 && x > gap[0] + 2 && x < gap[1] - 2);
    const pts = [];
    for (let j = 0; j <= NYs; j++) for (let i = 0; i <= NXs; i++) { const x = x0 + i * STEP, y = y0 + j * STEP, d = out(x, y); pts.push([x, y, z0 + dir * 0.4 - dir * d]); }
    const at = (i, j) => pts[j * (NXs + 1) + i], base = G0.p.length / 3;
    for (let j = 0; j <= NYs; j++) for (let i = 0; i <= NXs; i++) {
      const p = at(i, j), l = at(Math.max(0, i - 1), j), r = at(Math.min(NXs, i + 1), j), d = at(i, Math.max(0, j - 1)), u = at(i, Math.min(NYs, j + 1));
      const ax = r[0] - l[0], ay = r[1] - l[1], az = r[2] - l[2], bx = u[0] - d[0], by = u[1] - d[1], bz = u[2] - d[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; if (nz * dir > 0) { nx = -nx; ny = -ny; nz = -nz; } const l2 = Math.hypot(nx, ny, nz) || 1;
      G0.p.push(p[0], p[1], p[2]); G0.n.push(nx / l2, ny / l2, nz / l2); G0.u.push(p[0] / 5, p[1] / 5);
      const f = (0.62 + 0.4 * n(p[0] * 0.13, p[1] * 0.13)) * (0.7 + 0.3 * ss(-60, 0, p[1])) * (1 - 0.25 * Math.max(0, -ny / l2));
      G0.c.push(f * 0.95, f * 0.97, f);
    }
    for (let j = 0; j < NYs; j++) for (let i = 0; i < NXs; i++) {
      if (open(x0 + (i + 0.5) * STEP, y0 + (j + 0.5) * STEP)) continue;
      const a = base + j * (NXs + 1) + i, b = a + 1, c = a + NXs + 1, d = c + 1;
      if (dir < 0) G0.i.push(a, b, d, a, d, c); else G0.i.push(a, d, b, a, c, d);
    }
  }
  // the edge of a ledge over the abyss: a face of rock from its top down into the dark, ragged, leaning out and back
  function ledgeFront(w, ax, at, a0, a1, dir) {
    const G0 = w.batch._grp('rock'), n = T.noise(Math.round(at * 31 + a0)), STEP = 1;
    const cols = Math.max(1, Math.ceil((a1 - a0) / STEP)), rows = 26, base = G0.p.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const a = a0 + (a1 - a0) * i / cols, y = 0.05 - j * 1.6 - (j ? 0.6 * n(a * 0.3, j) : 0), d = (j ? 0.2 + 1.4 * T.fbm(n, a / 4, j / 2.5, 2) + j * 0.12 * n(a * 0.1 + 3, 1) : 0) * dir;
      const x = ax === 'x' ? at + d : a, z = ax === 'x' ? a : at + d;
      G0.p.push(x, y, z); G0.n.push(ax === 'x' ? dir : 0, 0, ax === 'x' ? 0 : dir); G0.u.push(a / 4, y / 4);
      const f = 0.55 + 0.35 * n(a * 0.5 + 5, j * 0.5); G0.c.push(f, f, f * 1.03);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      if ((ax === 'x') === (dir > 0)) G0.i.push(a, b, c, b, d, c); else G0.i.push(a, c, b, b, c, d);   // (wound to face out: dir)
    }
  }

  // ================================================================ the arches you walk on: over the hole, over the gap in the broken arm
  // An arch turned over: its inner curve (the soffit) on top, sagging between its ends; under it the voussoirs radiate down to the
  // extrados. Stone by stone (LG.mason); its boxes half a metre long, each at the curve's height over it.
  function invArch(S, ax, az, bx, bz, ya, yb, sag, wd, dep) {
    const { w } = S, M = LG.mason(w);
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, px = -uz, pz = ux;
    const yAt = (t) => ya + (yb - ya) * t - sag * (1 - Math.pow(2 * t - 1, 2));
    const slope = (t) => (yAt(Math.min(1, t + 0.01)) - yAt(Math.max(0, t - 0.01))) / (0.02 * L);
    const nv = Math.max(8, Math.round(L / 0.48));
    for (let i = 0; i < nv; i++) {
      const t0 = i / nv, t1 = (i + 1) / nv, dd = dep * (0.92 + 0.16 * hsh(ax + i, az, 51)), P8 = [];
      for (let k = 0; k < 8; k++) {
        const al = k & 1, up = k & 2 ? 1 : 0, ac = k & 4 ? 1 : -1, t = al ? t1 - 0.002 : t0 + 0.002, y = yAt(t), sl = slope(t), l = Math.hypot(sl, 1);
        // (down the joint: square to the curve, away from its inside)
        const s = t * L + (up ? 0 : (sl / l) * dd), yy = up ? y : y - dd / l, side = ac * wd / 2 * (up ? 1 : 0.94);
        P8.push([ax + ux * s + px * side, yy, az + uz * s + pz * side]);
      }
      const v = M.var(ax + i * 0.7, yAt(t0), az, 5);
      M.hexa('trim', P8, 0.02, { tint: [v[0] * 0.97, v[1] * 0.96, v[2] * 0.94], n: 0.01, chip: 0.25, chipS: 0.07, uv: 1.4, gy: yAt(t0) - 1 });
    }
    for (const sd of [-1, 1]) { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([ax + ux * t * L + px * sd * (wd / 2 - 0.05), yAt(t) - 0.06, az + uz * t * L + pz * sd * (wd / 2 - 0.05)]); } sweep(w, 'trim', pts, [[-0.07, -0.05], [-0.07, 0.0], [-0.05, 0.04], [0, 0.06], [0.05, 0.04], [0.07, 0], [0.07, -0.05]], { tint: [0.9, 0.88, 0.85] }); }
    const nb = Math.ceil(L / 0.5);
    for (let i = 0; i < nb; i++) {
      const t0 = i / nb, t1 = (i + 1) / nb, top = (yAt(t0) + yAt(t1)) / 2;
      const xa = ax + ux * t0 * L, za = az + uz * t0 * L, xb = ax + ux * t1 * L, zb = az + uz * t1 * L;
      w.addCollider(Math.min(xa, xb) - Math.abs(px) * wd / 2, top - 0.8, Math.min(za, zb) - Math.abs(pz) * wd / 2, Math.max(xa, xb) + Math.abs(px) * wd / 2, Math.round(top * 16) / 16, Math.max(za, zb) + Math.abs(pz) * wd / 2, { surf: 'stone' });
    }
  }
  function buildArches(S) {
    buildRibs(S);
    // over the hole: the stone span the bell-hoist's beam rested on, north to south across it
    const za = HOLE.z - 6.6, zb = HOLE.z + 6.6, xh = HOLE.x - 0.2;
    invArch(S, xh, za, xh, zb, S.hAt(xh, za) - 0.02, S.hAt(xh, zb) - 0.02, 1.0, 1.5, 0.9);
    S.occ.mark(xh - 1.3, za, xh + 1.3, zb, 2);
    // over the gap where the arm broke: the inverted arch of its last bay's rib, still holding
    const [g0, g1] = S.gapX, xa = g0 - 1.3, xb = g1 + 1.3;
    invArch(S, xa, TZ + 0.3, xb, TZ + 0.3, S.hAt(xa, TZ + 0.3) - 0.02, S.hAt(xb, TZ + 0.3) - 0.02, 0.75, 1.3, 0.85);
    // the island beyond: a chest's place
    const ix = S.armS < 0 ? (9 + g0) / 2 + 0.3 : (g1 + 75) / 2 - 0.3;
    S.w.platTops.push({ x0: ix - 1.2, z0: TZ - 3, x1: ix + 1.2, z1: TZ - 0.8, y: S.hAt(ix, TZ - 2) || 0, cx: ix, cz: TZ - 2 });
  }

  // ================================================================ the wheel chandeliers, standing up from their keystones
  // An iron crown of the old kind (a broad hoop with little towers set round it and prickets for the candles), hung by three twisted
  // iron rods from the keystone - rods that held: the wheel stands on them now some five metres over the vault, an iron tree. Its chains,
  // that ran from the hoop to a collar on the rods, hang slack from it. With the hook you get up onto it: the plate round its bowl, the hoop.
  function buildChandeliers(S) {
    const { w } = S;
    const bayList = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => bays.find((B) => (B.kind === 'choir' || B.kind === 'nave') && B.z0 === (k < 3 ? CHOIR_Z[k] : NAVE_Z[k - 3])));
    const sq = (r) => [[-r, -r], [-r, r], [r, r], [r, -r], [-r, -r]];
    for (const k of S.chand) {
      const B = bayList[k]; if (!B) continue;
      const x = B.xc, z = B.zc, y0 = bayH(B, x, z) + 0.26, top = y0 + 5.3, R = 2.7;
      for (let r = 0; r < 3; r++) {
        const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30, a = r / 3 * Math.PI * 2 + t * 5.2, rr = 0.07 + 0.05 * Math.sin(t * Math.PI); pts.push([x + Math.cos(a) * rr, y0 + t * (top - y0 - 0.1), z + Math.sin(a) * rr]); }
        sweep(w, 'iron', pts, [[-0.025, 0], [-0.018, 0.018], [0, 0.025], [0.018, 0.018], [0.025, 0], [0.018, -0.018], [0, -0.025], [-0.018, -0.018], [-0.025, 0]], { tint: [0.5, 0.48, 0.46] });
      }
      for (const yk of [y0 + 0.35, y0 + 1.9, y0 + 3.5]) w.batch.geo('iron', cylG(14), Mx(x, yk, z, 0.16, 0.16, 0.16), { tint: [0.46, 0.44, 0.42] });
      w.batch.geo('iron', cylG(16), Mx(x, y0 + 0.02, z, 0.3, 0.12, 0.3), { tint: [0.4, 0.38, 0.36] });
      w.batch.geo('iron', cylG(24), Mx(x, top - 0.05, z, 1.3, 0.1, 1.3), { tint: [0.42, 0.4, 0.38] });
      w.batch.geo('iron', cylG(24), Mx(x, top - 0.25, z, 0.9, 0.3, 0.9), { tint: [0.36, 0.34, 0.32] });
      for (const [yy, hh, th] of [[top - 0.14, 0.32, 0.05], [top + 0.03, 0.04, 0.1], [top - 0.3, 0.04, 0.1]]) {
        const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push([x + Math.cos(a) * R, yy, z + Math.sin(a) * R]); }
        sweep(w, 'iron', pts, [[-th / 2, -hh / 2], [-th / 2, hh / 2], [th / 2, hh / 2], [th / 2, -hh / 2], [-th / 2, -hh / 2]], { tint: [0.48, 0.45, 0.42] });
      }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + 0.1, tx = x + Math.cos(a) * R, tz = z + Math.sin(a) * R;
        if (i % 2 === 0) {
          // (a tower: a little square lantern of iron with a pyramid roof - turned over, the roof hangs under the hoop)
          w.batch.geo('iron', PG().box, Mx(tx, top - 0.52, tz, 0.26, 0.42, 0.26, 0, -a, 0), { tint: [0.44, 0.42, 0.4] });
          w.batch.geo('iron', cylG(4), Mx(tx, top - 0.86, tz, 0.19, 0.26, 0.19, 0, -a + Math.PI / 4, 0), { tint: [0.4, 0.38, 0.36] });
        } else {
          w.batch.geo('iron', cylG(10), Mx(tx, top - 0.36, tz, 0.08, 0.03, 0.08), { tint: [0.46, 0.44, 0.42] });
          if (hsh(tx, tz, 61) < 0.5) w.batch.geo('candle', cylG(10), Mx(tx, top - 0.45, tz, 0.035, 0.14, 0.035));
        }
        if (i % 3 === 0) sweep(w, 'iron', [[x + Math.cos(a) * 1.25, top - 0.06, z + Math.sin(a) * 1.25], [x + Math.cos(a) * (R - 0.04), top - 0.06, z + Math.sin(a) * (R - 0.04)]], sq(0.03), { tint: [0.46, 0.44, 0.42] });
      }
      for (let c = 0; c < 4; c++) {
        const a = c / 4 * Math.PI * 2 + 0.5, sx = x + Math.cos(a) * (R - 0.05), sz = z + Math.sin(a) * (R - 0.05), ex = x + Math.cos(a) * 0.12, ez = z + Math.sin(a) * 0.12, ey = y0 + 1.9, n = 17;
        const at = (t) => [sx + (ex - sx) * t, top - 0.3 + (ey - top + 0.3) * t - 1.1 * Math.sin(t * Math.PI), sz + (ez - sz) * t];
        for (let i = 0; i < n; i++) {
          const p = at((i + 0.5) / n), q2 = at((i + 1.5) / n), dir = V(q2[0] - p[0], q2[1] - p[1], q2[2] - p[2]).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), i % 2 ? Math.PI / 2 : 0));
          w.batch.geo('iron', PG().link, new THREE.Matrix4().compose(V(p[0], p[1], p[2]), q, V(0.1, 0.16, 0.1)), { tint: [0.42, 0.4, 0.38] });
        }
      }
      w.addCollider(x - 0.18, y0 - 0.2, z - 0.18, x + 0.18, top - 0.3, z + 0.18, { surf: 'metal' });
      w.addCollider(x - 1.25, top - 0.3, z - 1.25, x + 1.25, top + 0.05, z + 1.25, { surf: 'metal' });
      for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2, hx = x + Math.cos(a) * R, hz = z + Math.sin(a) * R; w.addCollider(hx - 0.3, top - 0.3, hz - 0.3, hx + 0.3, top + 0.05, hz + 0.3, { surf: 'metal' }); }
      S.occ.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 2);
      w.platTops.push({ x0: x - 0.8, z0: z - 0.8, x1: x + 0.8, z1: z + 0.8, y: top + 0.05, cx: x, cz: z });
      (S.chandAt = S.chandAt || []).push({ x, z, top });
      w.addLight(x + R * 0.7, top - 0.5, z, { flame: 0.4, intensity: 7, range: 11, prio: 1.0 });
    }
  }

  // ================================================================ high over your head: the piers that still stand, the arches they carry
  // The arcade's arches, turned over, hang between the tall piers as cradles: what fell from the old floor lies caught in them. Over
  // the crossing its four great arches; up at the piers' broken heads, slabs of the old floor jammed between them, its paving facing down.
  function hangArch(S, ax, az, bx, bz, ySpring, sag, wd, dep, key) {
    const { w } = S, M = LG.mason(w);
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, px = -uz, pz = ux;
    // (a pointed arch turned over: two arcs meeting at the crown, now its lowest point)
    const yAt = (t) => { const u = Math.abs(2 * t - 1); return ySpring - sag * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.25))); };
    const nv = Math.max(10, Math.round(L / 0.62));
    for (let i = 0; i < nv; i++) {
      const t0 = i / nv, t1 = (i + 1) / nv, P8 = [];
      for (let k = 0; k < 8; k++) { const al = k & 1, up = k & 2 ? 1 : 0, ac = k & 4 ? 1 : -1, t = al ? t1 - 0.002 : t0 + 0.002; P8.push([ax + ux * t * L + px * ac * wd / 2, yAt(t) - (up ? 0 : dep), az + uz * t * L + pz * ac * wd / 2]); }
      const v = M.var(ax + i, ySpring, az + key, 6);
      M.hexa('trim', P8, 0.025, { tint: [v[0] * 0.9, v[1] * 0.9, v[2] * 0.9], n: 0.02, chip: 0.3, chipS: 0.1, uv: 1.4, gy: ySpring - 30 });
    }
    // (the wall that hung under it, broken off: ragged teeth of masonry left along its underside)
    for (let i = 1; i < nv - 1; i++) {
      if (hsh(ax + i, az, 71 + key) < 0.45) continue;
      const t = (i + 0.5) / nv, y = yAt(t) - dep, x = ax + ux * t * L, z = az + uz * t * L, hh = 0.3 + 1.6 * hsh(x, z, 72);
      M.blk('trim', x, y - hh, z, 0.25 + 0.1 * hsh(x, z, 73), y + 0.02, wd * 0.42, Math.atan2(uz, ux), 0.02, { chip: 0.6, chipS: 0.12, n: 0.04, gy: y - 30 });
    }
    return { yAt, L, ux, uz };
  }
  function buildHigh(S) {
    const { w } = S, M = LG.mason(w);
    for (const [xw, k] of [[NAVE[0], S.tallW], [NAVE[1], S.tallE]]) {
      const za = NAVE_Z[k] + 1.0, zb = NAVE_Z[k + 1] - 1.0, ySp = 17.5 + 1.2 * hsh(xw, za, 81);
      const A = hangArch(S, xw, za, xw, zb, ySp, 4.2, 1.2, 0.95, k);
      // the capitals (turned over: their bells flare downward) where it springs
      for (const zc of [NAVE_Z[k], NAVE_Z[k + 1]]) { w.batch.geo('trim', cylG(20), Mx(xw, ySp - 0.1, zc, 1.15, 0.9, 1.15), { tint: [0.84, 0.82, 0.78] }); w.batch.geo('trim', cylG(20), Mx(xw, ySp + 0.45, zc, 0.95, 0.25, 0.95), { tint: [0.8, 0.78, 0.74] }); }
      // what lies in the cradle: a pew, a slab of the floor; a chain hangs from its crown, a broken lamp on its end, quite still
      const zm = (za + zb) / 2, ym = A.yAt(0.5) + 0.02;
      pew(S, xw + 0.1, ym + 0.05, zm - 0.6, 0.25, 0.35);
      M.blk('floor', xw - 0.2, ym - 0.05, zm + 1.4, 0.55, ym + 0.18, 1.1, 0.4, 0.015, { chip: 0.5, chipS: 0.1, plain: true, gy: ym - 30 });
      hangChain(S, xw + 0.2, ym - 0.95, zm + 0.3, 5.5 + 2 * hsh(xw, zm, 82), 'lamp');
    }
    const yC = 22.5;
    for (const [ax, az, bx, bz] of [[NAVE[0] + 1.4, TR[0], NAVE[1] - 1.4, TR[0]], [NAVE[0] + 1.4, TR[1], NAVE[1] - 1.4, TR[1]], [NAVE[0], TR[0] + 1.4, NAVE[0], TR[1] - 1.4], [NAVE[1], TR[0] + 1.4, NAVE[1], TR[1] - 1.4]]) {
      const A = hangArch(S, ax, az, bx, bz, yC, 6.4, 1.6, 1.3, ax + az), ym = A.yAt(0.5);
      if (ax === NAVE[0] + 1.4 && az === TR[0]) { pew(S, (ax + bx) / 2 - 1.2, ym + 0.08, az, 1.45, 0.3); hangChain(S, (ax + bx) / 2 + 0.6, ym - 1.3, az, 7.5, 'beam'); }
      if (ax === NAVE[1]) { M.blk('trim', ax, ym, (az + bz) / 2, 0.6, ym + 0.7, 0.9, 0.3, 0.02, { chip: 0.5, chipS: 0.1, gy: ym - 30 }); hangChain(S, ax, ym - 1.3, (az + bz) / 2 - 1, 9, 'bell'); }
    }
    for (const x of NAVE) for (const z of TR) w.batch.geo('trim', cylG(24), Mx(x, yC - 0.1, z, 1.75, 1.1, 1.75), { tint: [0.82, 0.8, 0.76] });
    floorSlab(S, NAVE[0] - 2, TR[0] - 3, NAVE[1] + 1, TR[0] + 7.5, 28.6);
    floorSlab(S, NAVE[1] - 6, TR[1] - 4, NAVE[1] + 3, TR[1] + 3, 28.3);
  }
  // a pew of the nave, broken: a bench and the end boards, lying where it fell (wood)
  function pew(S, x, y, z, ry, lean) {
    const { w } = S, L = 3.2, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean || 0, ry, 0.15));
    const m = (ox, oy, oz, sx, sy, sz) => new THREE.Matrix4().compose(V(ox, oy, oz).applyQuaternion(q).add(V(x, y, z)), q, V(sx, sy, sz));
    w.batch.geo('woodDark', PG().box, m(0, 0.45, 0, 0.42, 0.06, L), { tint: [0.6, 0.5, 0.42] });
    w.batch.geo('woodDark', PG().box, m(-0.22, 0.8, 0, 0.05, 0.62, L), { tint: [0.55, 0.46, 0.38] });
    for (const e of [-1, 1]) w.batch.geo('woodDark', PG().box, m(0, 0.5, e * L / 2, 0.5, 1.0, 0.07), { tint: [0.5, 0.42, 0.35] });
    w.batch.geo('woodDark', PG().box, m(0.05, 0.2, 0.3, 0.06, 0.4, 0.06), { tint: [0.5, 0.42, 0.35] });
  }
  // a chain hanging straight down from (x, y, z), len long, with what is on its end
  function hangChain(S, x, y, z, len, what) {
    const { w } = S, n = Math.floor(len / 0.26);
    for (let i = 0; i < n; i++) w.batch.geo('iron', PG().link, Mx(x, y - i * 0.26 - 0.13, z, 0.1, 0.16, 0.1, 0, i % 2 ? Math.PI / 2 : 0, 0), { tint: [0.45, 0.42, 0.4] });
    const ye = y - n * 0.26;
    if (what === 'lamp') {
      w.batch.geo('brass', cylG(16), Mx(x, ye - 0.35, z, 0.32, 0.22, 0.32), { tint: [0.6, 0.5, 0.36] });
      w.batch.geo('brass', cylG(16), Mx(x, ye - 0.5, z, 0.2, 0.1, 0.2), { tint: [0.5, 0.42, 0.3] });
    } else if (what === 'bell') {
      w.batch.geo('brass', cylG(20), Mx(x, ye - 0.45, z, 0.32, 0.6, 0.32), { tint: [0.42, 0.36, 0.26] });
      w.batch.geo('brass', cylG(20), Mx(x, ye - 0.85, z, 0.44, 0.2, 0.44), { tint: [0.4, 0.34, 0.24] });
      w.batch.geo('woodDark', PG().box, Mx(x, ye - 0.05, z, 0.9, 0.18, 0.2), { tint: [0.45, 0.38, 0.3] });
    } else w.batch.geo('woodDark', PG().box, Mx(x, ye - 0.2, z, 0.3, 0.3, 4.2, 0, 0.6, 0.2), { tint: [0.5, 0.4, 0.32] });
  }
  // a slab of the old floor: a ragged plate 0.7 thick at y, the paving on its underside, a tomb slab in it
  function floorSlab(S, x0, z0, x1, z1, y) {
    const { w } = S, M = LG.mason(w), G0 = w.batch._grp('floor'), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
    const nA = 28, ring = [];
    for (let i = 0; i < nA; i++) { const a = i / nA * Math.PI * 2, f = 0.72 + 0.28 * hsh(cx + i, cz, 91) + 0.12 * Math.sin(a * 3); ring.push([cx + Math.cos(a) * rx * f, cz + Math.sin(a) * rz * f]); }
    const base = G0.p.length / 3;
    G0.p.push(cx, y, cz); G0.n.push(0, -1, 0); G0.u.push(cx / 2, cz / 2); G0.c.push(0.8, 0.78, 0.75);
    for (const [px, pz] of ring) { G0.p.push(px, y + (hsh(px, pz, 92) - 0.5) * 0.06, pz); G0.n.push(0, -1, 0); G0.u.push(px / 2, pz / 2); const f = 0.7 + 0.2 * hsh(px, pz, 93); G0.c.push(f, f, f); }
    for (let i = 0; i < nA; i++) G0.i.push(base, base + 1 + i, base + 1 + (i + 1) % nA);
    const GR = w.batch._grp('rock'), b2 = GR.p.length / 3;
    for (const [px, pz] of ring) for (const yy of [y, y + 0.7 + 0.15 * hsh(px, pz, 94)]) { GR.p.push(px, yy, pz); const nx = px - cx, nz = pz - cz, l = Math.hypot(nx, nz) || 1; GR.n.push(nx / l, 0, nz / l); GR.u.push((px + pz) / 1.5, yy / 1.5); GR.c.push(0.6, 0.6, 0.62); }
    for (let i = 0; i < nA; i++) { const a = b2 + i * 2, b = b2 + ((i + 1) % nA) * 2; GR.i.push(a, b, a + 1, b, b + 1, a + 1); }
    M.box('trim', cx - 0.9, y - 0.05, cz - 1.3, cx + 0.9, y + 0.02, cz + 1.3, 0.01, { tint: [0.55, 0.52, 0.5], plain: true, gy: y - 30 });
  }

  // ================================================================ under the vault: the roofs, the walls, the tower and the spire
  // Turned over, all that stood over the vaults hangs below them: under each aisle its lean-to roof of lead, the eaves at the outer
  // wall's foot (the parapet hanging under them), falling away inward to the clerestory wall; under the nave and the choir their great
  // roof, its ridge a keel twenty metres down; the transept's the same, across; under the crossing the tower, and under that the spire,
  // pointing down into the light. From the edges and through the hole you see them, going down into the fog.
  function leadRoof(w, A, B, C, Dd) {
    // a plane of lead from A-B (its top edge) to D-C (its foot), standing seams down its fall every 0.62 m (A..D: [x, y, z])
    const M = LG.mason(w), q = [];
    const lerp = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), nS = Math.max(1, Math.round(len / 0.62));
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [Dd[0] - A[0], Dd[1] - A[1], Dd[2] - A[2]];
    let nr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const nl = Math.hypot(...nr); nr = nr.map((c) => c / nl); if (nr[1] > 0) nr = nr.map((c) => -c);
    for (let i = 0; i < nS; i++) {
      const t0 = i / nS, t1 = (i + 1) / nS, a = lerp(A, B, t0), b = lerp(A, B, t1), d = lerp(Dd, C, t0), c = lerp(Dd, C, t1), f = 0.36 + 0.1 * hsh(a[0], a[2], 101);
      q.push([a, b, c, d, nr, [[f * 0.9, f * 0.95, f], [f * 0.9, f * 0.95, f], [f * 0.75, f * 0.78, f * 0.82], [f * 0.75, f * 0.78, f * 0.82]]]);
      const s = b, e = c, o = 0.05;
      q.push([[s[0], s[1], s[2]], [s[0] + nr[0] * o, s[1] + nr[1] * o, s[2] + nr[2] * o], [e[0] + nr[0] * o, e[1] + nr[1] * o, e[2] + nr[2] * o], [e[0], e[1], e[2]], [u[0], 0, u[2]], [0.3, 0.31, 0.33]]);
    }
    M.quads('iron', q, 1.2);
  }
  function buildBelow(S) {
    const { w } = S;
    const runs = [[CHOIR_Z[0], CHOIR_Z[3]], [NAVE_Z[0], NAVE_Z[5]]];
    for (const [xo, xi, sgn] of [[AISLE_W[0] - 0.45, NAVE[0] - 1.5, -1], [AISLE_E[1] + 0.45, NAVE[1] + 1.5, 1]]) for (const [z0, z1] of runs) {
      const yE = -3.2, yI = -7.4;
      leadRoof(w, [xo, yE, z0], [xo, yE, z1], [xi, yI, z1], [xi, yI, z0]);
      // (the parapet, hanging under the eaves: its coping now its foot)
      w.visual('block', Math.min(xo, xo + sgn * 0.5), yE - 1.3, z0, Math.max(xo, xo + sgn * 0.5), yE + 0.02, z1, { uv: 2, grad: false });
      w.visual('trim', Math.min(xo, xo + sgn * 0.7), yE - 1.5, z0, Math.max(xo, xo + sgn * 0.7), yE - 1.3, z1, { uv: 1, grad: false });
      const zs = z0 === CHOIR_Z[0] ? CHOIR_Z : NAVE_Z;
      for (const z of zs) {
        // (the buttress: out from the wall and down, in two stages, ending in a pinnacle pointing into the abyss)
        const bx0 = xo + sgn * 0.05, bx1 = xo + sgn * 1.9, bx2 = xo + sgn * 2.8;
        w.visual('block', Math.min(bx0, bx1), -9.5, z - 0.75, Math.max(bx0, bx1), -0.2, z + 0.75, { uv: 2.2 });
        w.visual('block', Math.min(bx0, bx2), -16, z - 0.6, Math.max(bx0, bx2), -9.5, z + 0.6, { uv: 2.2 });
        const px = (bx0 + bx2) / 2;
        w.batch.geo('block', cylG(4), Mx(px, -18.6, z, 1.0, 5.2, 1.0, Math.PI, Math.PI / 4, 0), { tint: [0.8, 0.78, 0.76] });
        w.batch.geo('block', PG().box, Mx(xo + sgn * 1.1, yE - 1.0, z + 1.8, 1.6, 0.32, 0.36, 0, 0, sgn * 0.5), { tint: [0.72, 0.7, 0.68] });
        const fl = []; for (let i = 0; i <= 24; i++) { const t = i / 24; fl.push([bx1 + (xi - bx1) * t, -8.0 - 3.4 * t - 1.4 * Math.sin(t * Math.PI), z]); }
        sweep(w, 'block', fl, [[-0.4, -0.55], [-0.4, 0.2], [-0.28, 0.32], [0.28, 0.32], [0.4, 0.2], [0.4, -0.55]], { tint: [0.8, 0.78, 0.75], uv: 1.6 });
      }
    }
    for (const [xw, sgn] of [[NAVE[0] - 0.6, -1], [NAVE[1] + 0.6, 1]]) for (const [z0, z1] of runs) {
      w.visual('block', Math.min(xw, xw - sgn * 0.9), -12.5, z0, Math.max(xw, xw - sgn * 0.9), -0.4, z1, { uv: 2.4 });
      w.visual('trim', Math.min(xw, xw + sgn * 0.35), -12.8, z0, Math.max(xw, xw + sgn * 0.35), -12.4, z1, { uv: 1 });
    }
    for (const [z0, z1] of runs) {
      leadRoof(w, [NAVE[0] - 1.2, -12.6, z0], [NAVE[0] - 1.2, -12.6, z1], [CX, -24, z1], [CX, -24, z0]);
      leadRoof(w, [NAVE[1] + 1.2, -12.6, z1], [NAVE[1] + 1.2, -12.6, z0], [CX, -24, z0], [CX, -24, z1]);
    }
    for (const [x0, x1] of [[8.5, NAVE[0] - 1], [NAVE[1] + 1, 75.5]]) {
      leadRoof(w, [x1, -12.6, TR[0] - 0.6], [x0, -12.6, TR[0] - 0.6], [x0, -24, TZ], [x1, -24, TZ]);
      leadRoof(w, [x0, -12.6, TR[1] + 0.6], [x1, -12.6, TR[1] + 0.6], [x1, -24, TZ], [x0, -24, TZ]);
      w.visual('block', x0, -12.5, TR[0] - 1.0, x1, -0.4, TR[0] + 0.05, { uv: 2.4 }); w.visual('block', x0, -12.5, TR[1] - 0.05, x1, -0.4, TR[1] + 1.0, { uv: 2.4 });
    }
    for (const [xe, sgn] of [[9, -1], [75, 1]]) {
      w.visual('block', Math.min(xe, xe - sgn * 1.1), -12.6, TR[0] - 1, Math.max(xe, xe - sgn * 1.1), -0.3, TR[1] + 1, { uv: 2.4 });
      for (let k = 0; k < 10; k++) { const y = -12.6 - k * 1.15, half = 9 * (1 - (k + 1) / 10.5); w.visual('block', Math.min(xe, xe - sgn * 1.1), y - 1.15, TZ - half, Math.max(xe, xe - sgn * 1.1), y + 0.01, TZ + half, { uv: 2.4 }); }
      rose(S, xe + sgn * 0.02, -6.4, TZ, sgn);
    }
    tower(S);
  }
  // a rose window: a ring of tracery with its spokes and the lights' heads, the glass gone, the dark behind
  function rose(S, x, y, z, sgn) {
    const { w } = S, R = 4.4;
    w.visual('dark', x - sgn * 0.05 - 0.02, y - R, z - R, x - sgn * 0.05 + 0.02, y + R, z + R, { uv: 1, grad: false });
    const ring = (r, th) => { const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push([x + sgn * 0.02, y + Math.sin(a) * r, z + Math.cos(a) * r]); } sweep(w, 'trim', pts, [[-th, -0.25], [-th, 0.1], [0, 0.18], [th, 0.1], [th, -0.25]], { tint: [0.8, 0.78, 0.74] }); };
    ring(R, 0.22); ring(R * 0.34, 0.14);
    for (let k = 0; k < 12; k++) {
      if (hsh(x, k, 111) < 0.2) continue; // (a light of it broken out)
      const a = k / 12 * Math.PI * 2, pts = []; for (let i = 0; i <= 8; i++) { const r = R * 0.34 + (R * 0.97 - R * 0.34) * i / 8; pts.push([x + sgn * 0.02, y + Math.sin(a) * r, z + Math.cos(a) * r]); }
      sweep(w, 'trim', pts, [[-0.07, -0.2], [-0.07, 0.06], [0, 0.11], [0.07, 0.06], [0.07, -0.2]], { tint: [0.78, 0.76, 0.72] });
      const a2 = a + Math.PI / 12, rc = R * 0.7, cy = y + Math.sin(a2) * rc, cz = z + Math.cos(a2) * rc, ps = [];
      for (let i = 0; i <= 18; i++) { const b = i / 18 * Math.PI * 2; ps.push([x + sgn * 0.02, cy + Math.sin(b) * 0.55, cz + Math.cos(b) * 0.55]); }
      sweep(w, 'trim', ps, [[-0.05, -0.18], [-0.05, 0.05], [0, 0.08], [0.05, 0.05], [0.05, -0.18]], { tint: [0.76, 0.74, 0.7] });
    }
  }
  // the crossing tower hanging under the crossing: four walls of ashlar with clasping buttresses, the belfry's tall openings with their
  // louvres, then the spire: eight faces drawn in to a point some fifty metres down, lucarnes on four faces, crockets up its arrises.
  // Inside, through the hole: the bell-frame of oak across the tower, a bell caught in it mouth up, the spire's mast going down into the dark.
  function tower(S) {
    const { w } = S, x0 = NAVE[0] - 1, x1 = NAVE[1] + 1, z0 = TR[0] - 1, z1 = TR[1] + 1, T0 = -0.6, T1 = -30, th = 1.8;
    const wallSide = (side) => {
      const along = side === 'N' || side === 'S', c = side === 'N' ? z0 : side === 'S' ? z1 : side === 'W' ? x0 : x1, sg = side === 'N' || side === 'W' ? 1 : -1;
      const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
      const box = (p0, p1, y0, y1) => { if (along) w.visual('block', p0, y0, Math.min(c, c + sg * th), p1, y1, Math.max(c, c + sg * th), { uv: 2.6 }); else w.visual('block', Math.min(c, c + sg * th), y0, p0, Math.max(c, c + sg * th), y1, p1, { uv: 2.6 }); };
      box(a0, a1, -12, T0); box(a0, a1, T1, -24);
      const mid = (a0 + a1) / 2, ow = 2.2, gap = 1.6, xs = [a0, mid - gap / 2 - ow, mid - gap / 2, mid + gap / 2, mid + gap / 2 + ow, a1];
      box(xs[0], xs[1], -24, -12); box(xs[2], xs[3], -24, -12); box(xs[4], xs[5], -24, -12);
      for (const [p0, p1] of [[xs[1], xs[2]], [xs[3], xs[4]]]) for (let y = -22.6; y < -13.5; y += 0.7) {
        if (hsh(p0, y, 121) < 0.25) continue;
        const cc = c + sg * th * 0.5;
        if (along) w.batch.geo('woodDark', PG().box, Mx((p0 + p1) / 2, y, cc, p1 - p0, 0.05, 0.5, 0.6 * sg, 0, 0), { tint: [0.45, 0.42, 0.4] });
        else w.batch.geo('woodDark', PG().box, Mx(cc, y, (p0 + p1) / 2, 0.5, 0.05, p1 - p0, 0, 0, -0.6 * sg), { tint: [0.45, 0.42, 0.4] });
      }
    };
    for (const sd of ['N', 'S', 'W', 'E']) wallSide(sd);
    for (const y of [-12, -24]) w.visual('trim', x0 - 0.25, y - 0.3, z0 - 0.25, x1 + 0.25, y, z1 + 0.25, { uv: 1 });
    for (const x of [x0, x1]) for (const z of [z0, z1]) { const sx = x === x0 ? -1 : 1, sz = z === z0 ? -1 : 1; w.visual('block', Math.min(x, x + sx * 1.6), -28, Math.min(z, z + sz * 1.6), Math.max(x, x + sx * 1.6), -1, Math.max(z, z + sz * 1.6), { uv: 2.4 }); w.batch.geo('block', cylG(4), Mx(x + sx * 0.8, -32, z + sz * 0.8, 0.9, 7, 0.9, Math.PI, Math.PI / 4, 0), { tint: [0.78, 0.76, 0.74] }); }
    // the spire: eight faces down to a point, outside and in
    const cx = CX, cz = TZ, R0 = (x1 - x0) / 2 - 0.4, yA = T1, yB = -82;
    const oct = (r, y) => { const p = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; p.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); } return p; };
    const GS = w.batch._grp('block'), NR = 14;
    for (const inside of [false, true]) for (let j = 0; j < NR; j++) {
      const ya = yA + (yB - yA) * j / NR, yb = yA + (yB - yA) * (j + 1) / NR, ra = (R0 - (inside ? 0.6 : 0)) * (1 - j / NR), rb = (R0 - (inside ? 0.6 : 0)) * (1 - (j + 1) / NR);
      const A = oct(ra, ya), B = oct(Math.max(0.02, rb), yb);
      for (let k = 0; k < 8; k++) {
        const a = A[k], b = A[(k + 1) % 8], c = B[(k + 1) % 8], d = B[k];
        const mx = (a[0] + b[0]) / 2 - cx, mz = (a[2] + b[2]) / 2 - cz, ml = Math.hypot(mx, mz) || 1, sgn = inside ? -1 : 1, nx = sgn * mx / ml, nz = sgn * mz / ml, ny = inside ? 0.25 : -0.25;
        const base = GS.p.length / 3;
        for (const p of [a, b, c, d]) { GS.p.push(p[0], p[1], p[2]); GS.n.push(nx, ny, nz); GS.u.push((Math.abs(nx) > Math.abs(nz) ? p[2] : p[0]) / 2.2, p[1] / 2.2); const f = (inside ? 0.45 : 0.78) * (0.85 + 0.25 * hsh(p[0], p[1], 131)); GS.c.push(f, f, f * 1.02); }
        if (inside) GS.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else GS.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    const dd = PG().dodeW || PG().dode;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + Math.PI / 8, pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([cx + Math.cos(a) * (R0 * (1 - t) + 0.05), yA + (yB - yA) * t, cz + Math.sin(a) * (R0 * (1 - t) + 0.05)]); }
      sweep(w, 'trim', pts, [[-0.14, -0.1], [-0.14, 0.06], [0, 0.16], [0.14, 0.06], [0.14, -0.1]], { tint: [0.76, 0.74, 0.7] });
      for (let i = 1; i < 30; i++) { const t = i / 32, r = R0 * (1 - t) + 0.22; w.batch.geo('trim', dd, Mx(cx + Math.cos(a) * r, yA + (yB - yA) * t, cz + Math.sin(a) * r, 0.22, 0.14, 0.16, 0, -a, 0.6), { tint: [0.74, 0.72, 0.68] }); }
    }
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2, r = R0 * 0.78, y = yA - 9, lx = cx + Math.cos(a) * r, lz = cz + Math.sin(a) * r;
      w.visual('block', lx - 1.2, y - 2.6, lz - 1.2, lx + 1.2, y, lz + 1.2, { uv: 1.6 });
      w.batch.geo('block', cylG(4), Mx(lx, y - 3.6, lz, 1.4, 2, 1.4, Math.PI, a + Math.PI / 4, 0), { tint: [0.74, 0.72, 0.7] });
    }
    // inside: the bell frame, a bell fallen into it mouth up; a floor below it burst through; the spire's mast
    const yF = -9.2;
    for (const off of [-3.2, 0, 3.2]) w.visual('woodDark', x0 + th, yF - 0.55, cz + off - 0.22, x1 - th, yF, cz + off + 0.22, { uv: 2, tint: [0.62, 0.55, 0.48] });
    for (const off of [-4.6, 4.6]) w.visual('woodDark', cx + off - 0.25, yF - 1.1, z0 + th, cx + off + 0.25, yF - 0.55, z1 - th, { uv: 2, tint: [0.58, 0.5, 0.44] });
    for (const off of [-3.2, 3.2]) for (const s of [-1, 1]) sweep(w, 'woodDark', [[cx - 4.4 * s, yF - 0.6, cz + off], [cx - 1.6 * s, yF - 3.4, cz + off]], [[-0.14, -0.14], [-0.14, 0.14], [0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]], { tint: [0.55, 0.48, 0.42] });
    if (!_geo.bell) { const pr = [[0.0, 0], [0.42, 0.02], [0.5, 0.1], [0.62, 0.35], [0.78, 0.9], [0.96, 1.25], [1.06, 1.42], [1.02, 1.5], [0.9, 1.46]]; _geo.bell = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, -y)), 24); }
    w.batch.geo('brass', _geo.bell, Mx(cx + 1.2, yF + 0.95, cz - 1.4, 1.15, 1.15, 1.15, 0.12, 0, 0.08), { tint: [0.34, 0.3, 0.24] });
    for (let k = 0; k < 9; k++) { const a = hsh(k, 3, 141) * 6.3, r = 3 + 3 * hsh(k, 4, 142); w.visual('woodDark', cx + Math.cos(a) * r - 1.4, -19.8, cz + Math.sin(a) * r - 0.14, cx + Math.cos(a) * r + 1.4, -19.5, cz + Math.sin(a) * r + 0.14, { uv: 2, tint: [0.5, 0.44, 0.38] }); }
    sweep(w, 'woodDark', [[cx, -24, cz], [cx, -60, cz]], [[-0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]], { tint: [0.5, 0.44, 0.38] });
  }

  // ================================================================ what lies about
  function buildDress(S) {
    const { w, occ, rng } = S, M = LG.mason(w), gy = (x, z) => S.hAt(x, z);
    // the breaches: the wall's stones spilled down the ramp into the aisle
    for (const r of S.ramps) for (let i = 0; i < 14; i++) {
      const dx = rng.range(0.6, 5.5), dz = rng.range(-2.6, 2.6), s = rng.range(0.18, 0.42), ry = rng.range(0, 3), l1 = rng.range(-0.3, 0.3), l2 = rng.range(-0.3, 0.3);
      const x = r.xw + r.sgn * dx, z = r.zc + dz, y = gy(x, z); if (y == null) continue;
      M.blk('trim', x, y - 0.06, z, s * 1.4, y + s * 0.9, s, ry, 0.02, { chip: 0.5, chipS: 0.08, n: 0.02 }, [l1, l2]);
    }
    // where the aisles meet the transept: the fallen arch's stones over the slope
    for (let i = 0; i < 48; i++) {
      const side = i % 4, xa = side < 2 ? AISLE_W : AISLE_E, zb = side % 2 ? TR[1] : TR[0], x = rng.range(xa[0] + 0.8, xa[1] - 0.8), z = zb + (side % 2 ? 1 : -1) * rng.range(0.4, 4.5), s = rng.range(0.16, 0.4), ry = rng.range(0, 3.1), l1 = rng.range(-0.3, 0.3), l2 = rng.range(-0.3, 0.3), y = gy(x, z);
      if (y == null || !occ.free(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) continue;
      M.blk('trim', x, y - 0.06, z, s * 1.5, y + s * 0.8, s, ry, 0.02, { chip: 0.55, chipS: 0.08, n: 0.02 }, [l1, l2]);
    }
    // stones fallen from the walls and piers, at their feet
    for (let i = 0; i < 90; i++) {
      const x = rng.range(10, W - 10), z = rng.range(16, LAND_S - 1), s = rng.range(0.2, 0.5), ry = rng.range(0, 3.1), l1 = rng.range(-0.25, 0.25), l2 = rng.range(-0.25, 0.25), y = gy(x, z);
      if (y == null || !occ.free(x - 0.4, z - 0.4, x + 0.4, z + 0.4)) continue;
      const nearWall = [NAVE[0], NAVE[1], AISLE_W[0], AISLE_E[1]].some((xw) => Math.abs(x - xw) < 3.2 && (z < TR[0] || z > TR[1])) || ((x < AISLE_W[0] || x > AISLE_E[1]) && (Math.abs(z - TR[0]) < 3 || Math.abs(z - TR[1]) < 3));
      if (!nearWall) continue;
      M.blk('trim', x, y - 0.05, z, s * 1.5, y + s * 0.85, s, ry, 0.02, { chip: 0.55, chipS: 0.09, n: 0.02 }, [l1, l2]);
      if (s > 0.42) w.addCollider(x - s, y, z - s, x + s, y + s * 0.7, z + s, { surf: 'stone' });
    }
    // pews of the old floor that came down onto the vault, broken
    for (let i = 0; i < 6; i++) {
      const B = bays[rng.int(0, bays.length - 1)], x = B.xc + rng.range(-B.hx * 0.5, B.hx * 0.5), z = B.zc + rng.range(-B.hz * 0.5, B.hz * 0.5), ry = rng.range(0, 3.1), lean = rng.range(-0.15, 0.15), y = gy(x, z);
      if (y == null || !occ.free(x - 1.8, z - 1.8, x + 1.8, z + 1.8)) continue;
      pew(S, x, y - 0.05, z, ry, lean);
      w.addCollider(x - 0.6, y, z - 0.6, x + 0.6, y + 0.55, z + 0.6, { surf: 'wood' });
      occ.mark(x - 1.8, z - 1.8, x + 1.8, z + 1.8);
    }
    for (let i = 0; i < 9; i++) { const x = rng.range(12, W - 12), z = rng.range(16, LAND_S - 2), y = gy(x, z); if (y == null || !occ.free(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) continue; P().bones(w, x, y + 0.02, z, rng); }
    // the great candlesticks of the choir, fallen, their candles set up again by it
    for (let i = 0; i < 4; i++) {
      const B = bays[rng.int(0, bays.length - 1)], x = B.xc + rng.range(-2, 2), z = B.zc + rng.range(-2, 2), a = rng.range(0, 6.3), y = gy(x, z);
      if (y == null || !occ.free(x - 1.4, z - 1.4, x + 1.4, z + 1.4)) continue;
      candlestick(S, x, y, z, a);
      P().candles(w, x + Math.cos(a + 1.6) * 0.9, y, z + Math.sin(a + 1.6) * 0.9, rng, true);
      occ.mark(x - 1.4, z - 1.4, x + 1.4, z + 1.4);
    }
  }
  // a great pricket candlestick lying on its side (a lathe of iron)
  function candlestick(S, x, y, z, a) {
    const { w } = S;
    if (!_geo.stick) { const pr = [[0.0, 0], [0.34, 0], [0.36, 0.05], [0.22, 0.12], [0.1, 0.2], [0.06, 0.3], [0.09, 0.34], [0.05, 0.4], [0.045, 1.2], [0.08, 1.24], [0.05, 1.28], [0.04, 1.75], [0.24, 1.8], [0.25, 1.84], [0.05, 1.86], [0.015, 2.0], [0.0, 2.05]]; _geo.stick = new THREE.LatheGeometry(pr.map(([r, yy]) => new THREE.Vector2(r, yy)), 16); }
    w.batch.geo('iron', _geo.stick, new THREE.Matrix4().compose(V(x, y + 0.24, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, Math.PI / 2 - 0.08)), V(1, 1, 1)), { tint: [0.42, 0.4, 0.38] });
    w.addCollider(x - 0.4, y, z - 0.4, x + 0.4, y + 0.45, z + 0.4, { surf: 'metal' });
  }

  // ================================================================ the light
  // warm on the way: braziers the last ones here set up, the chandeliers' few candles, candles on the vault; and cold from below: the
  // abyss's light coming up through the hole and over every edge, a blue-white kept low in colour
  function buildLights(S) {
    const { w, rng, occ } = S;
    for (const [x0, z0] of [[CX, LAND_S - 3], [CX - 4, 64], [CX + 4, 26], [CX - 12.5, 70], [CX + 12.5, 30], [21, TZ + 3], [63, TZ - 3], [CX + 3, 56]]) {
      const x = x0 + rng.range(-1.2, 1.2), z = z0 + rng.range(-1.2, 1.2), y = S.hAt(x, z);
      if (y == null || !occ.free(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) continue;
      P().brazier(w, x, y, z, 1, true); occ.mark(x - 1, z - 1, x + 1, z + 1, 2);
    }
    for (let i = 0; i < 10; i++) { const x = rng.range(12, W - 12), z = rng.range(16, LAND_S - 2), y = S.hAt(x, z); if (y == null || !occ.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5)) continue; P().candles(w, x, y, z, rng, true); }
    w.addLight(HOLE.x, -4.5, HOLE.z, { flame: 0, intensity: 34, range: 24, color: '#8ea2c2', emit: false, prio: 2.4, steady: true });
    for (const [x, z] of [[AISLE_W[0] - 4, 26], [AISLE_W[0] - 4, 62], [AISLE_W[0] - 4, 78], [AISLE_E[1] + 4, 26], [AISLE_E[1] + 4, 62], [AISLE_E[1] + 4, 78], [5, TZ], [W - 5, TZ], [CX, LAND_S + 1], [30, LAND_S + 1], [54, LAND_S + 1]])
      w.addLight(x, -7, z, { flame: 0, intensity: 14, range: 18, color: '#7f93b4', emit: false, prio: 0.6 });
    for (const g of S.gxs) { P().brazier(w, g - 4.5, 0, 4.5, 1, true); P().brazier(w, g + 4.5, 0, 4.5, 1, true); }
    for (const s of [-1, 1]) P().brazier(w, CX + s * 5.5, 0, D - 4, 1, true);
    // the glow of the abyss far below, and its light rising through the hole in a faint shaft
    w.deferred.push((grp) => {
      if (!_geo.glowTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _geo.glowTex = new THREE.CanvasTexture(c); }
      // (the glow far down: a floor of lit mist some eighty-five metres under the vault, palest under the cathedral, drawn solid so the
      // fog lies over it as over anything that far off - from any edge the dark under you goes a cold grey-blue as it goes down. An
      // additive glow only shows over what is drawn: over the open dark the fog takes it)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: _geo.glowTex, color: 0x93a4c2 }));
      m.rotation.x = -Math.PI / 2; m.scale.set(420, 380, 1); m.position.set(CX, -86, D / 2); grp.add(m);
      // (and where the chasm runs on east and west, the same light seen across it: a curtain of mist thirty metres out, the fog's own
      // colour at the vault's height, paling down into the glow - fogged as the far rock is)
      for (const xc of [-30, W + 30]) {
        const g = new THREE.PlaneGeometry(D + 40, 110, 1, 22), pos = g.attributes.position, col = [], fc = new THREE.Color('#0e141e'), lo = new THREE.Color('#8696b2');
        for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) - 35, t = Math.min(1, Math.max(0, (-y - 4) / 70)), k = t * t * (3 - 2 * t), c = fc.clone().lerp(lo, k); col.push(c.r, c.g, c.b); }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const cm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
        cm.position.set(xc, -35 + 0, D / 2); cm.rotation.y = xc < 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(cm);
      }
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 7, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x8aa0c4, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      sh.position.set(HOLE.x, -31.5, HOLE.z); grp.add(sh);
    });
  }
})();
