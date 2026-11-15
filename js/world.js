'use strict';
// World container: merged static geometry, AABB colliders + spatial hash, raycasts, kinematic box movement, nav grid & flow field.
(function () {
  const CS = 4; // hash cell size (m)
  // the 8 nav directions; for a diagonal, the indices of its two straight parts (corner-cutting check)
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const dirIdx = (dx, dz) => DIRS.findIndex((d) => d[0] === dx && d[1] === dz);
  const DIAG = DIRS.map((d) => (d[0] && d[1] ? 1 : 0));
  const DXI = DIRS.map((d) => (d[0] && d[1] ? dirIdx(d[0], 0) : -1)), DZI = DIRS.map((d) => (d[0] && d[1] ? dirIdx(0, d[1]) : -1));

  // ---------------- geometry batching ----------------
  // A growing typed array that reads like the plain array it replaces (push(...), length): an area writes a million and more vertices into
  // the batch, and plain arrays of numbers took most of an area's build in pushes and in the garbage of growing. Each value is rounded to
  // 32 bits once, as Float32BufferAttribute did with the plain array, so the mesh comes out the same.
  class Grow {
    constructor(T) { this.T = T; this.a = new T(1024); this.length = 0; }
    // room for n more; returns the array to write into from this.length on (the caller moves length on itself)
    need(n) {
      const L = this.length + n; if (L <= this.a.length) return this.a;
      let c = this.a.length * 2; while (c < L) c *= 2;
      const b = new this.T(c); b.set(this.a.subarray(0, this.length)); return (this.a = b);
    }
    push() { const n = arguments.length, a = this.need(n); let k = this.length; for (let j = 0; j < n; j++) a[k++] = arguments[j]; return (this.length = k); }
    out() { return this.a.slice(0, this.length); }
  }

  // ---------------- the worked shape of the boxes ----------------
  // Walls, floors, buildings, outer walls and rock are all boxes (w.solid / w.visual). On medium and high quality a box is not drawn
  // as six flat quads but worked as what it is made of, once every box of the area is known (Batch.build):
  //  * each face is cut into a grid laid on world coordinates and its points are moved. Dressed stone (wall, block, trim, floor,
  //    cobble) swells a little, and at an open corner each course of it stands a little in or out of the next; an outdoor wall's top
  //    nobody walks on is broken away in places; rock is rounded off on its open sides and broken by a relief of tens of centimetres
  //    (less by the ways people walk); a wooden beam bows;
  //  * an edge where both faces of the box are open is worked: dressed stone gets an arris a few centimetres wide, knocked off here
  //    and there, wood a narrower one;
  //  * what of a face lies against another box (or the ground of a terrain) is not drawn, save a margin under the edge of what lies on
  //    it (so that nothing opens where the two move apart a little); an edge where the box runs on into another one is left square,
  //    and on rock carries on a little way into it (the skirt);
  //  * the colour of each point is moved a little (within some 15 %): mottling, damp and earth at the foot of a wall, streaks of rain
  //    on outdoor walls, the shadow of an inside corner, moss on outdoor faces turned from the sun.
  // Every number comes from the place alone (a fixed table of noise and the box's own size): the same area is the same for every player
  // and every time, and the field's random numbers are not touched. Low quality draws the plain boxes as before.
  // The drawn shape now stands out of (and back into) the box that is hit: Fine.stats keeps by how much, per kind of material, and a
  // world keeps the bounds of what was drawn for each box (w.fineBounds), for fitting the colliders to the look later.
  const Fine = (() => {
    const F = {};
    // ---- noise from a fixed table (never Math.random)
    const PERM = new Uint8Array(512), VAL = new Float32Array(256);
    {
      let s = 0x2545f491;
      const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
      const p = []; for (let i = 0; i < 256; i++) p.push(i);
      for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
      for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
      for (let i = 0; i < 256; i++) VAL[i] = r();
    }
    // smooth value noise, 0..1
    const vn = (x, y, z) => {
      const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), xi = X & 255, yi = Y & 255, zi = Z & 255;
      let u = x - X, v = y - Y, w = z - Z; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
      const A = PERM[xi] + yi, B = PERM[xi + 1] + yi, AA = PERM[A] + zi, AB = PERM[A + 1] + zi, BA = PERM[B] + zi, BB = PERM[B + 1] + zi;
      const e = VAL[PERM[AA]] + (VAL[PERM[BA]] - VAL[PERM[AA]]) * u, f = VAL[PERM[AB]] + (VAL[PERM[BB]] - VAL[PERM[AB]]) * u;
      const g = VAL[PERM[AA + 1]] + (VAL[PERM[BA + 1]] - VAL[PERM[AA + 1]]) * u, h = VAL[PERM[AB + 1]] + (VAL[PERM[BB + 1]] - VAL[PERM[AB + 1]]) * u;
      const m = e + (f - e) * v, n = g + (h - g) * v;
      return m + (n - m) * w;
    };
    const hh = (x, y, z) => VAL[PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)]];
    const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    F.vn = vn;

    // what each material is worked as; what hides a face laid against it (water, ice, cloth, webs ... are seen through)
    const KIND = { wall: 'cut', block: 'cut', trim: 'cut', floor: 'cut', cobble: 'cut', rock: 'rock', wood: 'wood', woodDark: 'wood' };
    F.OPAQ = new Set(['wall', 'block', 'trim', 'floor', 'cobble', 'rock', 'wood', 'woodDark', 'iron', 'brass', 'gold', 'bone', 'ceramic', 'dark', 'glow', 'lava', 'bluefire', 'voidglow', 'mud', 'moss', 'candle']);
    // W: the width of the worked band along an open edge, T: the lines of the grid within it (parts of W); es: the spacing of the points
    // along an open edge near the play (on dressed stone, three or five more about each chip); hs: the columns of an upright face near the play, hv / ho: its rows near the floors / above
    // and below them, ht: the grid of a level face (all three times that far from the play). Dressed stone and wood keep their faces flat
    // (a swell of a centimetre or two does not show; their picture and its normals carry the face): a coarse grid only for the colour;
    // m: how far under the edge of a box of this kind the face it lies on is still drawn; sk: how far a face runs on into the next box
    const CP = {
      cut: { W: 0.12, T: [1], es: 0.5, hs: 2, hv: 2, ho: 2, ht: 2, m: 0.07, sk: 0 },
      rock: { W: 0.6, T: [0.35, 0.7, 1], es: 0.45, hs: 0.45, hv: 0.45, ho: 0.9, ht: 0.6, m: 0.65, sk: 0.45, rho: 0.6, fade: 1.1 },
      wood: { W: 0.05, T: [1], es: 0.5, hs: 2, hv: 2, ho: 2, ht: 2, m: 0.03, sk: 0 },
    };
    const MARGIN = [0.02, CP.cut.m, CP.rock.m], ONE = [1]; // (by the class of what covers: flat things, dressed stone and wood, rock)
    // the arris itself (how far an edge is taken off, before chips): small brick, big blocks, dressed trim, slabs, setts, timber
    const ARRIS = { wall: 0.03, block: 0.05, trim: 0.045, floor: 0.04, cobble: 0.03, wood: 0.02, woodDark: 0.02 };
    // the fields of ruins: a free-standing outdoor wall's top there has lost a stone or two in places
    const RUINS = new Set(['dusk', 'ruin', 'battlefield', 'grave', 'hamlet']);
    const NONE = [];
    // the points an area's worked boxes may come to: past it, every spacing of the grid is widened alike (the same for every box, so
    // their edges still meet)
    F.BUDGET = 85000;
    const KMAX = 4; // (the widest)
    // past the budget even at the widest: an area made leaner still - 1: the small chips get no points of their own and the quoins go by
    // two courses; 2: the big chips three points, the quoins by four courses
    const LEAN_C = [1, 2, 4];
    const scaled = (k) => { const o = {}; for (const c in CP) { const P = CP[c]; o[c] = Object.assign({}, P, { es: P.es * k, hs: P.hs * k, hv: P.hv * k, ho: P.ho * k, ht: P.ht * k }); } return o; };
    const SK = ['px', 'nx', 'top', 'bottom', 'pz', 'nz'], AU = [2, 2, 0, 0, 0, 0], AV = [1, 1, 2, 2, 1, 1], HD = [-1, 1, -1, 1, 1, -1];
    const NRM = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    F.on = () => !(G.save && G.save.data && G.save.data.settings && G.save.data.settings.quality === 'low');
    // the class a box is worked as, or null (drawn flat): slender and small pieces of stone and wood stay plain boxes
    F.kindOf = (mk, ex, ey, ez, o) => {
      const k = !o.flat && KIND[mk]; if (!k) return null;
      const m = Math.min(ex, ey, ez); if (m < 1e-3) return null;
      // (a frame, a beam, a sill, a little pier, a pane: plain. A slab - a shelf, a ledge, a step - is worked, however thin)
      if (k !== 'rock') { const mx = Math.max(ex, ey, ez), md = ex + ey + ez - m - mx; if (mx < 0.6 || m < 0.05 || (m < 0.15 && md < 0.3)) return null; }
      return k;
    };
    F.stats = {}; // per class: points, the farthest out of the box and in, counts beyond 2 / 5 / 15 cm (what the colliders miss); kept when F.track
    const stat = (k) => F.stats[k] || (F.stats[k] = { pts: 0, out: 0, in: 0, o2: 0, o5: 0, o15: 0 });

    // ---- the floors the player reaches, per metre cell (from the nav grid): what is near the play is worked finely
    function reachInfo(w) {
      if (!w || !w.nf || !w.N) return null;
      const N = w.N, L = w.L || 1, lo = new Float32Array(N).fill(Infinity), hi = new Float32Array(N).fill(-Infinity);
      for (let n = 0; n < N * L; n++) { const f = w.nf[n]; if (!(f > -50) || (w.reachMask && !w.reachMask[n])) continue; const i = n % N; if (f < lo[i]) lo[i] = f; if (f > hi[i]) hi[i] = f; }
      // (and the same spread 3 cells every way: what is within reach of a floor someone walks)
      const Wn = w.Wn, Dn = w.Dn, tl = new Float32Array(N).fill(Infinity), th = new Float32Array(N).fill(-Infinity), dl = new Float32Array(N).fill(Infinity), dh = new Float32Array(N).fill(-Infinity);
      for (let z = 0; z < Dn; z++) for (let x = 0; x < Wn; x++) { let a = Infinity, b = -Infinity; for (let d = -3; d <= 3; d++) { const xx = x + d; if (xx < 0 || xx >= Wn) continue; const i = z * Wn + xx; if (lo[i] < a) a = lo[i]; if (hi[i] > b) b = hi[i]; } tl[z * Wn + x] = a; th[z * Wn + x] = b; }
      for (let z = 0; z < Dn; z++) for (let x = 0; x < Wn; x++) { let a = Infinity, b = -Infinity; for (let d = -3; d <= 3; d++) { const zz = z + d; if (zz < 0 || zz >= Dn) continue; const i = zz * Wn + x; if (tl[i] < a) a = tl[i]; if (th[i] > b) b = th[i]; } dl[z * Wn + x] = a; dh[z * Wn + x] = b; }
      return { Wn, Dn, xo: w.xo || 0, zo: w.zo || 0, lo, hi, dl, dh };
    }
    // is p where someone walks by (within 3 m of a floor reached, from a little under it to a few metres over it)
    function byPlay(C, x, y, z) {
      const R = C.reach; if (!R) return true;
      const a = Math.floor(x) + R.xo, b = Math.floor(z) + R.zo; if (a < 0 || b < 0 || a >= R.Wn || b >= R.Dn) return false;
      const i = b * R.Wn + a; return y > R.dl[i] - 1.5 && y < R.dh[i] + 4.5;
    }
    // [lowest, highest] reachable floor within r of x0..x1, z0..z1; null: none; nothing known: everything counts as near
    function reachNear(R, x0, z0, x1, z1, r) {
      if (!R) return [-Infinity, Infinity];
      const a0 = Math.max(0, Math.floor(x0 - r) + R.xo), a1 = Math.min(R.Wn - 1, Math.floor(x1 + r) + R.xo), b0 = Math.max(0, Math.floor(z0 - r) + R.zo), b1 = Math.min(R.Dn - 1, Math.floor(z1 + r) + R.zo);
      let lo = Infinity, hi = -Infinity;
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const i = b * R.Wn + a; if (R.lo[i] < lo) lo = R.lo[i]; if (R.hi[i] > hi) hi = R.hi[i]; }
      return lo <= hi ? [lo, hi] : null;
    }
    // the floor at or below y in the metre cell of (x, z) (any storey), -Infinity if none is known
    function floorUnder(C, x, y, z) {
      const w = C.world; if (!w) return -Infinity;
      const xi = Math.floor(x) + (w.xo || 0), zi = Math.floor(z) + (w.zo || 0); if (xi < 0 || zi < 0 || xi >= w.Wn || zi >= w.Dn) return -Infinity;
      const i = zi * w.Wn + xi; let best = -Infinity;
      for (let k = 0; k < (w.L || 1); k++) { const f = w.nf[k * w.N + i]; if (f > -50 && f <= y + 0.05 && f > best) best = f; }
      return best;
    }
    const uniq = (a) => {
      const n = a.length; if (!n) return a;
      for (let i = 1; i < n; i++) { const t = a[i]; let j = i - 1; while (j >= 0 && a[j] > t) { a[j + 1] = a[j]; j--; } a[j + 1] = t; } // (they come nearly in order)
      let m = 1; for (let i = 1; i < n; i++) if (a[i] - a[m - 1] > 1e-5) a[m++] = a[i]; a.length = m; return a;
    };

    // ---- all the boxes of a batch, once every box is known
    function shapeCtx(B, world, mats, C) {
      const occ = B.occ || [], bio = (mats && mats.biome) || {}, nO = occ.length / 7, hash = new Map();
      for (let i = 0; i < nO; i++) {
        const q = i * 7, a0 = Math.floor(occ[q] / 4), a1 = Math.floor(occ[q + 3] / 4), c0 = Math.floor(occ[q + 2] / 4), c1 = Math.floor(occ[q + 5] / 4);
        for (let a = a0; a <= a1; a++) for (let c = c0; c <= c1; c++) { const k = (a + 2048) * 8192 + (c + 2048); let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(i); }
      }
      const sd = bio.sunDir, sl = sd ? Math.hypot(sd[0], sd[1], sd[2]) : 1;
      Object.assign(C, {
        B, occ, hash, mark: new Uint32Array(nO + 1), st: 0, world: world && world.nf ? world : null, reach: reachInfo(world), outdoor: !!bio.outdoor,
        sun: sd ? [sd[0] / sl, sd[1] / sl, sd[2] / sl] : null, bounds: world ? (world.fineBounds = []) : null, fc: new Map(), CP, kap: 1, lean: 0,
        field: world ? world.field || world.biome : null, terr: !!(world && world.colliders && world.colliders.some((c) => c.tg)),
        // the courses of stone in each material's picture (rows per repeat: textures.js / gfx.js bricks 8, ashlar 4, flags 4, marble 2)
        rows: { wall: bio.marble ? 4 : 8, block: bio.marble ? 2 : 4, trim: bio.marble ? 2 : 0, floor: bio.marble ? 2 : bio.floorTex ? 0 : 4, cobble: bio.marble ? 2 : 0 },
      });
      // the columns of a terrain (a face buried in one lies against it): by cells of 4 m, once for the area
      if (C.terr) {
        const T = C.tc = [], H = C.th = new Map();
        for (const c of world.colliders) {
          if (!c.tg || c.alive === false || c.shotOnly) continue;
          const n = T.length; T.push(c);
          for (let a = Math.floor(c.x0 / 4); a <= Math.floor(c.x1 / 4); a++) for (let b = Math.floor(c.z0 / 4); b <= Math.floor(c.z1 / 4); b++) { const k = (a + 2048) * 8192 + (b + 2048); let l = H.get(k); if (!l) H.set(k, (l = [])); l.push(n); }
        }
        C.tmark = new Uint32Array(T.length + 1); C.tst = 0;
      }
      // the lights hung about the area (torches, lamps): by cells of a metre, each within the rock's fade and its own reach of the cell
      if (world && world.lightSources && world.lightSources.length) {
        const M = C.lights = new Map(), R = CP.rock.fade + 0.6;
        for (const L of world.lightSources) {
          const q = L.pos; if (!q) continue;
          for (let x = Math.floor(q.x - R); x <= Math.floor(q.x + R); x++) for (let z = Math.floor(q.z - R); z <= Math.floor(q.z + R); z++) {
            const key = (x + 2048) * 8192 + (z + 2048); let l = M.get(key); if (!l) M.set(key, (l = [])); l.push(q.x, q.y, q.z);
          }
        }
      }
      return C;
    }
    F.shape = function (B, world, mats) {
      const L = B.bx, C = shapeCtx(B, world, mats, {}); B.bx = null; B.occ = null;
      // first what lies against every face of every box (and, of the rock, what it touches that is not rock: kept for the whole area, so
      // that two pieces of rock side by side keep still alike near it), then the drawing
      const Xs = [];
      let i = 0;
      try {
        const T0 = performance.now();
        for (; i < L.length; i++) Xs.push(prepBox(C, L[i]));
        const T1 = performance.now();
        // (how many points it would come to; over the budget, the grids are widened. The count goes about as A + B / kap - the anchors of
        // the bands, the courses and the chips stay, the rest thins - so a quick count at 1 and at the most gives kap; then the lines are
        // made at it, and kept for the drawing)
        const set = (k) => { C.kap = k; C.CP = k === 1 ? CP : scaled(k); for (const X of Xs) if (X) { X.P = C.CP[X.b.kind]; X.EE = []; for (const I of X.F) I.G = null; bands(X); } };
        const quick = (k) => { set(k); FX[0] = FX[1] = FX[2] = 0; let n = 0; for (const X of Xs) if (X) n += countBox(X); return [n + FX[0], n + FX[1], n + FX[2]]; };
        const exact = (k) => { set(k); let n = 0; for (const X of Xs) if (X) n += estimate(X); return n; };
        // (the widening first; past the widest, leaner. An area of many boxes is counted at the widest first: when even that is over the
        // budget, the count at 1 is not needed - the same choice either way, the counts only fall as kap grows)
        let k = 1, lean = 0, q1 = null, qM = null;
        if (Xs.length > 700) qM = quick(KMAX);
        if (!qM || qM[0] < F.BUDGET) q1 = quick(1);
        if (!q1 || q1[0] > F.BUDGET) {
          if (!qM) qM = quick(KMAX);
          lean = qM[0] < F.BUDGET ? 0 : qM[1] < F.BUDGET ? 1 : 2;
          const cM = qM[lean];
          if (cM >= F.BUDGET) k = KMAX;
          else { if (!q1) q1 = quick(1); const c1 = q1[lean]; if (c1 > F.BUDGET) { const Bq = (c1 - cM) / (1 - 1 / KMAX), Aq = c1 - Bq; k = Math.min(KMAX, Math.max(1, Bq / (F.BUDGET - Aq))); } }
        }
        const est0 = q1 ? q1[0] : qM[0];
        C.lean = lean;
        let est = exact(k);
        if (est > F.BUDGET * 1.05 && k < KMAX) est = exact(Math.min(KMAX, k * est / F.BUDGET));
        F.last = { boxes: L.length, est0, est, kap: C.kap, lean: C.lean };
        const T2 = performance.now();
        for (i = 0; i < L.length; i++) if (Xs[i]) drawBox(C, Xs[i]);
        const T3 = performance.now();
        F.time = { prep: Math.round(T1 - T0), est: Math.round(T2 - T1), draw: Math.round(T3 - T2) };
      } catch (e) { F.err = String((e && e.stack) || e); for (; i < L.length; i++) { const b = L[i]; B.flat(b.mk, b.lo[0], b.lo[1], b.lo[2], b.hi[0], b.hi[1], b.hi[2], b.o); } }
    };
    // (for the tools: the faces of the kept boxes near a point, as the drawing will see them; the batch is left as it was)
    F.inspect = function (B, world, mats, x, y, z, r) {
      const bx = B.bx, occ = B.occ; B.bx = (bx || []).filter((b) => b.lo[0] < x + r && b.hi[0] > x - r && b.lo[1] < y + r && b.hi[1] > y - r && b.lo[2] < z + r && b.hi[2] > z - r);
      const out = [];
      try { const C0 = {}; shapeCtx(B, world, mats, C0); for (const b of B.bx) { const X = prepBox(C0, b); out.push({ mk: b.mk, lo: b.lo, hi: b.hi, skip: b.o.skip, faces: X ? X.F.map((I) => ({ f: I.f, hid: I.hid, open: +I.open.toFixed(2), fn: I.fn, rects: I.rects.map((q) => q.slice(0, 6).map((v) => +(+v).toFixed(2))) })) : 'all hidden' }); } } finally { B.bx = bx; B.occ = occ; }
      return out;
    };
    const cand = [];
    function around(C, x0, z0, x1, z1) {
      const st = ++C.st; cand.length = 0;
      for (let a = Math.floor(x0 / 4); a <= Math.floor(x1 / 4); a++) for (let c = Math.floor(z0 / 4); c <= Math.floor(z1 / 4); c++) {
        const l = C.hash.get((a + 2048) * 8192 + (c + 2048)); if (!l) continue;
        for (let n = 0; n < l.length; n++) { const j = l[n]; if (C.mark[j] !== st) { C.mark[j] = st; cand.push(j); } }
      }
    }
    function prepBox(C, b) {
      const P = C.CP[b.kind], lo = b.lo, hi = b.hi, o = b.o;
      const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const rn = reachNear(C.reach, lo[0], lo[2], hi[0], hi[2], 3);
      const near = !!rn && rn[1] + 7 > lo[1] && rn[0] - 3 < hi[1];
      const X = { C, b, P, lo, hi, o, ext, rn, near, band0: rn ? rn[0] - 0.6 : 0, band1: rn ? rn[1] + 3.2 : 0, R: b.kind === 'cut' ? C.rows[b.mk] || 0 : 0, uvS: o.uv || 2, F: [], dlo: [Infinity, Infinity, Infinity], dhi: [-Infinity, -Infinity, -Infinity] };
      around(C, lo[0] - 0.01, lo[2] - 0.01, hi[0] + 0.01, hi[2] + 0.01);
      // (only what touches the box, all three ways)
      { const occ = C.occ; let m = 0; for (let n = 0; n < cand.length; n++) { const q = cand[n] * 7; if (occ[q + 1] <= hi[1] + 0.01 && occ[q + 4] >= lo[1] - 0.01 && occ[q] <= hi[0] + 0.01 && occ[q + 3] >= lo[0] - 0.01 && occ[q + 2] <= hi[2] + 0.01 && occ[q + 5] >= lo[2] - 0.01) cand[m++] = cand[n]; } cand.length = m; }
      X.touch = cand.slice(); // (what touches it: all that can fill a corner just outside it)
      X.tcl = C.terr ? terrNear(C, lo, hi) : null;
      let open = 0;
      for (let f = 0; f < 6; f++) { const I = faceInfo(X, f); X.F.push(I); if (!I.hid) open++; }
      if (!open) return null;
      for (const I of X.F) rectIndex(X, I);
      // a wall's top under the open sky that nobody walks on and nothing stands on has broken away: in the fields of ruins by a stone or
      // two (X.crumble 2), elsewhere a little (1)
      if (C.outdoor && (b.mk === 'wall' || b.mk === 'block') && !X.F[2].hid && !X.F[2].rects.length && ext[1] > 0.4) {
        const rt = reachNear(C.reach, lo[0], lo[2], hi[0], hi[2], 0);
        if (!(rt && C.reach && rt[1] >= hi[1] - 0.4 && rt[0] <= hi[1] + 0.4)) X.crumble = RUINS.has(C.field) && ext[1] >= 1 ? 2 : 1;
      }
      X.slender = ext[0] <= 1.5 && ext[2] <= 1.5; // (a pier, a post: its courses stay nearly true)
      // (the way it runs: the way its ends are held by the next pieces - a short piece of a wall runs as the wall does - else its long way;
      // and which line of wall it is, by its middle across: the same for every piece of one wall, so a broken top runs on from one to the next)
      { const hx = (X.F[0].hid ? 1 : 0) + (X.F[1].hid ? 1 : 0), hz = (X.F[4].hid ? 1 : 0) + (X.F[5].hid ? 1 : 0); X.la = hz > hx ? 2 : hx > hz ? 0 : ext[0] >= ext[2] ? 0 : 2; }
      X.wq = Math.floor((X.la === 0 ? lo[2] + hi[2] : lo[0] + hi[0]) / 3);
      // the band along each side of the box: the worked arris on an open side; on a closed one (against another box, or left to
      // something drawn elsewhere) only the grid's first line, a little way in
      bands(X);
      for (const I of X.F) { I.fn = faceNear(X, I); I.crs = I.fn && X.R > 0 && I.k !== 1; }
      // the points along each of the twelve edges (shared by the two faces that meet there): close together on an open edge
      X.EE = []; X.CK = []; X.FK = [];
      if (b.kind === 'rock') rockPrep(X);
      if (b.kind === 'wood') woodPrep(X);
      return X;
    }
    // the columns of the terrain within 3 cm of the box
    function terrNear(C, lo, hi) {
      const out = [], st = ++C.tst, T = C.tc, M = C.tmark, e = 0.03;
      for (let a = Math.floor((lo[0] - e) / 4); a <= Math.floor((hi[0] + e) / 4); a++) for (let b = Math.floor((lo[2] - e) / 4); b <= Math.floor((hi[2] + e) / 4); b++) {
        const l = C.th.get((a + 2048) * 8192 + (b + 2048)); if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const n = l[i]; if (M[n] === st) continue; M[n] = st;
          const c = T[n]; if (c.x1 > lo[0] - e && c.x0 < hi[0] + e && c.y1 > lo[1] - e && c.y0 < hi[1] + e && c.z1 > lo[2] - e && c.z0 < hi[2] + e) out.push(c);
        }
      }
      return out;
    }
    function bands(X) {
      const P = X.P, ext = X.ext, kind = X.b.kind, Wa = ARRIS[X.b.mk] || 0.02, Ws = X.Ws || (X.Ws = new Float64Array(6)), Wc = X.Wc || (X.Wc = new Float64Array(6)), Ts = X.Ts || (X.Ts = [NONE, NONE, NONE, NONE, NONE, NONE]);
      // (rock closed on both sides along an axis: one line of the grid down its middle. Dressed stone and wood stay flat by a closed side:
      // no band there, the grid runs on to the edge)
      for (let f = 0; f < 6; f++) {
        const ax = f >> 1, e = ext[ax], op = !X.F[f].hid, op2 = !X.F[f ^ 1].hid;
        const Wo = kind === 'cut' ? (e >= 0.6 ? 0.16 : 0.12) : P.W;
        const w = op ? Math.min(Wo, e * 0.3) : kind !== 'rock' ? 0 : op2 ? Math.min(0.25, e * 0.3) : Math.min(P.hs, e * 0.5);
        Ws[f] = w; Ts[f] = op ? P.T : w ? ONE : NONE;
        Wc[f] = Math.min(Wa, w * 0.9); // (the arris, within the band)
      }
      // a broken top: the band under it is made deep enough for the stones that are gone
      if (X.crumble) Ws[2] = Math.min(X.crumble === 2 ? 0.6 : 0.24, ext[1] * 0.35);
    }
    // the same, counted without making the lines (as grid, edgeSamples, lines, sideRows would make them, near enough): for choosing kap
    function countBox(X) {
      let n = 0;
      for (let f = 0; f < 6; f++) {
        const I = X.F[f]; if (I.hid) continue;
        const a = I.a, v = I.v, g = gridCount(X, I), nu = g[0], nv = g[1];
        n += nu * nv + (nu || (!nv && X.crumble) ? edgeCount(X, a, f, 2 * v + 1) + edgeCount(X, a, f, 2 * v) : 4) + (nv ? edgeCount(X, v, f, 2 * a + 1) + edgeCount(X, v, f, 2 * a) : 4);
        if (X.P.sk) for (const g of [2 * v + 1, 2 * v, 2 * a + 1, 2 * a]) if (X.F[g].hid && !X.F[g].skip) n += edgeCount(X, g === 2 * v + 1 || g === 2 * v ? a : v, f, g);
      }
      return n;
    }
    // (how many points step gives; how many lines gives)
    const nstep = (a, b, h) => { if (!(b > a)) return 0; const n = Math.ceil((b - h * 0.3) / h) - Math.ceil((a + h * 0.3) / h); return n > 0 ? n : 0; };
    const nlines = (t0, t1, wl, wh, Tl, Th, h) => { const n = Math.ceil((t1 - wh - h * 0.3) / h) - Math.ceil((t0 + wl + h * 0.3) / h); return Tl.length + Th.length + (n > 0 ? n : 0); };
    const gc = [0, 0];
    function gridCount(X, I) {
      const { lo, hi, Ws, Ts, P } = X, a = I.a, v = I.v, gl = 2 * a + 1, gr = 2 * a, gb = 2 * v + 1, gt = 2 * v, fl = gflags(X, I);
      if (I.k === 1) { const h = I.fn ? P.ht : P.ht * 3; gc[0] = fl === 2 ? 0 : nlines(lo[a], hi[a], Ws[gl], Ws[gr], Ts[gl], Ts[gr], h); gc[1] = fl === 1 ? 0 : nlines(lo[v], hi[v], Ws[gb], Ws[gt], Ts[gb], Ts[gt], h); return gc; }
      gc[0] = fl === 2 ? 0 : nlines(lo[a], hi[a], Ws[gl], Ws[gr], Ts[gl], Ts[gr], I.fn ? P.hs : P.hs * 3);
      if (fl === 1) { gc[1] = 0; return gc; }
      const a0 = lo[v] + Ws[gb], a1 = hi[v] - Ws[gt];
      let n = Ts[gb].length + Ts[gt].length;
      if (!I.fn) n += nstep(a0, a1, P.ho * 3);
      else {
        const b0 = X.band0, b1 = X.band1, h = P.hv;
        for (let k = Math.ceil((a0 + h * 0.3) / h); k * h < a1 - h * 0.3; k++) { const y = k * h, m = y >= b0 - 0.3 && y <= b1 + 0.3 ? 1 : y > b1 ? Math.round(P.ho / h) : Math.round((y < b0 - 6 ? 4 : 2) * P.ho / h); if (k % m === 0) n++; }
        n += dampN(X, a0, a1);
      }
      gc[1] = n; return gc;
    }
    const FX = [0, 0, 0]; // (the quick count's points that do not thin, by lean)
    const dampN = (X, a, b) => { if (X.b.kind === 'rock' || !X.rn || !isFinite(X.rn[0])) return 0; const y = X.rn[0] + 0.5; return y > a + 0.05 && y < b - 0.05 ? 1 : 0; };
    function edgeCount(X, ax, g1, g2) {
      const T0 = X.Ts[2 * ax + 1], T1 = X.Ts[2 * ax], t0 = X.lo[ax], t1 = X.hi[ax], w0 = T0.length ? X.Ws[2 * ax + 1] * T0[0] : 0, w1 = T1.length ? X.Ws[2 * ax] * T1[0] : 0;
      const P = X.P, rock = X.b.kind === 'rock', open = !X.F[g1].hid && !X.F[g2].hid, a = t0 + w0, b = t1 - w1, en = edgeNear(X, g1, g2);
      let n = 2 + (w0 > 0 ? 1 : 0) + (w1 > 0 ? 1 : 0);
      if (!en) n += nstep(a, b, ax === 1 ? P.ho * 3 : P.hs * 3);
      else if (ax !== 1) n += nstep(a, b, rock ? P.es : !open ? P.hs : g1 === 3 || g2 === 3 ? 2 * P.es : P.es);
      else { const b0 = X.band0 - 0.3, b1 = X.band1 + 0.3, hn = !rock && open ? 2 * P.es : P.hv; n += nstep(a, Math.min(b, b0), 2 * P.ho) + nstep(Math.max(a, b0), Math.min(b, b1), hn) + nstep(Math.max(a, b1), b, P.ho); }
      if (rock) return n;
      // (what does not thin - the courses, the damp, the chips - for each lean, once for the edge, into FX; dressed stone's and wood's
      // bands do not change with kap)
      const key = ekey(ax, g1, g2); let fk = X.FK[key];
      if (!fk) {
        fk = X.FK[key] = [0, 0, 0];
        if (en && ax === 1) {
          if (open && X.R && X.F[g1].crs && X.F[g2].crs) {
            const R = X.R, S = X.uvS, ov = X.o.vo || 0, y0 = Math.max(a, X.band0), y1 = Math.min(b, X.band1, X.band0 + 3.4);
            if (y1 > y0) for (let k = Math.ceil((y0 / S + ov) * R - 1e-9); ; k++) {
              const y = (k / R - ov) * S; if (y > y1) break;
              const c = (y - JW > a + 1e-4 && y - JW < b - 1e-4 ? 1 : 0) + (y + JW > a + 1e-4 && y + JW < b - 1e-4 ? 1 : 0);
              for (let l = 0; l < 3; l++) { const M = LEAN_C[l]; if (!(((k % M) + M) % M)) fk[l] += c; }
            }
          }
          const d = dampN(X, a, b); fk[0] += d; fk[1] += d; fk[2] += d;
        }
        if (en && open && X.b.kind === 'cut') { const ch = chipsOf(X, key, ax, g1, g2, a, b); fk[0] += ch[0].length; fk[1] += ch[1].length; fk[2] += ch[2].length; }
      }
      FX[0] += fk[0]; FX[1] += fk[1]; FX[2] += fk[2];
      if (X.crumble === 2 && ax === X.la && (g1 === 2 || g2 === 2)) n += stonePts(X, key, a, b).length;
      return n;
    }
    // the points the box would be drawn with (about: the grid and the edges of its open faces)
    function estimate(X) {
      let n = 0;
      for (let f = 0; f < 6; f++) {
        const I = X.F[f]; if (I.hid) continue;
        const [Us, Vs] = I.G || (I.G = grid(X, I)), a = I.a, v = I.v;
        n += Us.length * Vs.length + (Us.length || (!Vs.length && X.crumble) ? edgeSamples(X, a, f, 2 * v + 1).length + edgeSamples(X, a, f, 2 * v).length : 4) + (Vs.length ? edgeSamples(X, v, f, 2 * a + 1).length + edgeSamples(X, v, f, 2 * a).length : 4);
        // (rock: a skirt along an edge where the next face is closed)
        if (X.P.sk) for (const g of [2 * v + 1, 2 * v, 2 * a + 1, 2 * a]) if (X.F[g].hid && !X.F[g].skip) n += edgeSamples(X, g === 2 * v + 1 || g === 2 * v ? a : v, f, g).length;
      }
      return n;
    }
    // the lines of the grid of face I
    function grid(X, I) {
      const { lo, hi, Ws, Ts, P } = X, a = I.a, v = I.v, gl = 2 * a + 1, gr = 2 * a, gb = 2 * v + 1, gt = 2 * v;
      // (no rows across: dressed stone or wood closed at both ends, or closed above and below and less than 0.65 m high. No columns:
      // closed above and below - rock only where it is not wide. A face open along both its sides keeps the band rows: the arris rolls
      // between them and the edge)
      const fl = gflags(X, I), fv = fl === 1, fa = fl === 2;
      if (I.k === 1) { const h = I.fn ? P.ht : P.ht * 3; return [fa ? NONE : lines(lo[a], hi[a], Ws[gl], Ws[gr], Ts[gl], Ts[gr], h), fv ? NONE : lines(lo[v], hi[v], Ws[gb], Ws[gt], Ts[gb], Ts[gt], h)]; }
      return [fa ? NONE : lines(lo[a], hi[a], Ws[gl], Ws[gr], Ts[gl], Ts[gr], I.fn ? P.hs : P.hs * 3), fv ? NONE : sideRows(X, I, lo[v], hi[v], Ws[gb], Ws[gt], Ts[gb], Ts[gt])];
    }
    // (which way face I has no lines: 1 no rows, 2 no columns, 0 both)
    function gflags(X, I) {
      const { lo, hi } = X, a = I.a, v = I.v, gl = 2 * a + 1, gr = 2 * a, gb = 2 * v + 1, gt = 2 * v, rock = X.b.kind === 'rock', F = X.F;
      if (!rock && ((F[gl].hid && F[gr].hid) || (hi[v] - lo[v] <= 0.65 && F[gb].hid && F[gt].hid))) return 1;
      if (F[gb].hid && F[gt].hid && (!rock || hi[a] - lo[a] <= 1.25)) return 2;
      return 0;
    }
    function drawBox(C, X) {
      X.EP = [];
      for (let f = 0; f < 6; f++) if (!X.F[f].hid) buildFace(X, f);
      X.EP = null;
      if (C.bounds && X.dlo[0] <= X.dhi[0]) C.bounds.push({ mk: X.b.mk, lo: X.lo.slice(), hi: X.hi.slice(), dlo: X.dlo, dhi: X.dhi });
    }
    // a face: its plane, its axes, what lies against it (rects in its own u, v with the depth and class of what covers), hidden or not
    function faceInfo(X, f) {
      const { C, b, lo, hi } = X, occ = C.occ, k = f >> 1, sg = f & 1 ? -1 : 1, pl = sg > 0 ? hi[k] : lo[k], a = AU[f], v = AV[f];
      const skip = !!(b.o.skip && b.o.skip[SK[f]]);
      const I = { f, k, sg, pl, a, v, rects: [], hid: skip, skip, area: 0 };
      for (let n = 0; n < cand.length; n++) {
        const j = cand[n]; if (j === b.oi) continue;
        const q = j * 7; let dep;
        if (sg > 0) { if (!(occ[q + k] <= pl + 1e-3 && occ[q + 3 + k] > pl + 2e-3)) continue; dep = occ[q + 3 + k] - pl; }
        else { if (!(occ[q + 3 + k] >= pl - 1e-3 && occ[q + k] < pl - 2e-3)) continue; dep = pl - occ[q + k]; }
        const r0 = Math.max(occ[q + a], lo[a]), r1 = Math.min(occ[q + 3 + a], hi[a]), r2 = Math.max(occ[q + v], lo[v]), r3 = Math.min(occ[q + 3 + v], hi[v]);
        if (r1 - r0 < 1e-3 || r3 - r2 < 1e-3) continue;
        I.rects.push([r0, r1, r2, r3, dep, occ[q + 6], j]);
        I.area += (r1 - r0) * (r3 - r2);
        if (r0 <= lo[a] + 1e-3 && r1 >= hi[a] - 1e-3 && r2 <= lo[v] + 1e-3 && r3 >= hi[v] - 1e-3) I.hid = true;
      }
      // the ground of a terrain is no box but its columns are solid: a face buried in one (a cliff's skin turned into the cliff, a wall's
      // foot sunk in a slope) lies against it there
      if (C.terr && !I.skip) {
        const e = [0.02, 0.02, 0.02], mn = [lo[0] + 1e-3, lo[1] + 1e-3, lo[2] + 1e-3], mx = [hi[0] - 1e-3, hi[1] - 1e-3, hi[2] - 1e-3];
        if (sg > 0) { mn[k] = pl + 1e-3; mx[k] = pl + e[k]; } else { mn[k] = pl - e[k]; mx[k] = pl - 1e-3; }
        for (const c of X.tcl) {
          if (!(c.x1 > mn[0] && c.x0 < mx[0] && c.y1 > mn[1] && c.y0 < mx[1] && c.z1 > mn[2] && c.z0 < mx[2])) continue;
          const cm = [c.x0, c.y0, c.z0], cM = [c.x1, c.y1, c.z1];
          if (sg > 0 ? !(cm[k] <= pl + 1e-3 && cM[k] > pl + 0.02) : !(cM[k] >= pl - 1e-3 && cm[k] < pl - 0.02)) continue;
          const r0 = Math.max(cm[a], lo[a]), r1 = Math.min(cM[a], hi[a]), r2 = Math.max(cm[v], lo[v]), r3 = Math.min(cM[v], hi[v]);
          if (r1 - r0 < 1e-3 || r3 - r2 < 1e-3) continue;
          I.rects.push([r0, r1, r2, r3, Math.min(2, sg > 0 ? cM[k] - pl : pl - cm[k]), 2, -1]); I.area += (r1 - r0) * (r3 - r2);
          if (r0 <= lo[a] + 1e-3 && r1 >= hi[a] - 1e-3 && r2 <= lo[v] + 1e-3 && r3 >= hi[v] - 1e-3) I.hid = true;
        }
      }
      // an underside resting on the ground lies against it, though no box is under it (the ground of a terrain, a paving too thin to be
      // worked): what of the world is solid (its colliders, the ground's columns too) and has its top at the box's foot covers it there
      if (f === 3 && !I.hid && C.world) {
        for (const c of C.world.query(lo[0] + 1e-3, pl - 0.09, lo[2] + 1e-3, hi[0] - 1e-3, pl + 0.03, hi[2] - 1e-3)) {
          if (c.ghost || !(c.y1 >= pl - 0.08 && c.y1 <= pl + 0.03 && c.y0 < pl - 0.005)) continue;
          const r0 = Math.max(c.x0, lo[0]), r1 = Math.min(c.x1, hi[0]), r2 = Math.max(c.z0, lo[2]), r3 = Math.min(c.z1, hi[2]);
          if (r1 - r0 < 1e-3 || r3 - r2 < 1e-3) continue;
          I.rects.push([r0, r1, r2, r3, 0.05, 0, -1]); I.area += (r1 - r0) * (r3 - r2);
          if (r0 <= lo[0] + 1e-3 && r1 >= hi[0] - 1e-3 && r2 <= lo[2] + 1e-3 && r3 >= hi[2] - 1e-3) I.hid = true;
        }
      }
      I.open = I.hid ? 0 : Math.max(0, 1 - I.area / Math.max(1e-6, (hi[a] - lo[a]) * (hi[v] - lo[v])));
      return I;
    }
    // a face's rects by cells of its own u, v, when it has many (a slab under a hundred boxes, a wall along the columns of a terrain): for
    // each cell those that hold any of it (inn) and those within a metre of it (near: the shadow of an inside corner, a thin plate's cap),
    // in the order of the rects - every question asked of the rects at a point then gives what the whole list gives
    function rectIndex(X, I) {
      const R = I.rects; I.ix = null; if (R.length <= 8) return;
      const lo = X.lo, hi = X.hi, u0 = lo[I.a], v0 = lo[I.v], cu = Math.max(0.5, (hi[I.a] - u0) / 32), cv = Math.max(0.5, (hi[I.v] - v0) / 32);
      const nu = Math.floor((hi[I.a] - u0) / cu) + 1, nv = Math.floor((hi[I.v] - v0) / cv) + 1, inn = [], near = [];
      for (let c = 0; c < nu * nv; c++) { inn.push([]); near.push([]); }
      const put = (L, n, a0, a1, b0, b1) => {
        const i0 = Math.max(0, Math.floor((a0 - u0) / cu)), i1 = Math.min(nu - 1, Math.floor((a1 - u0) / cu)), j0 = Math.max(0, Math.floor((b0 - v0) / cv)), j1 = Math.min(nv - 1, Math.floor((b1 - v0) / cv));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) L[j * nu + i].push(n);
      };
      for (let n = 0; n < R.length; n++) { const r = R[n]; put(inn, n, r[0], r[1], r[2], r[3]); put(near, n, r[0] - 1, r[1] + 1, r[2] - 1, r[3] + 1); }
      I.ix = { u0, v0, cu, cv, nu, nv, inn, near };
    }
    // (the cell of u, w: its list of rects that hold it, or within a metre of it)
    const cellOf = (x, u, w) => Math.min(x.nv - 1, Math.max(0, Math.floor((w - x.v0) / x.cv))) * x.nu + Math.min(x.nu - 1, Math.max(0, Math.floor((u - x.u0) / x.cu)));
    const clampIn = (t, a, b) => (b - a < 0.01 ? (a + b) / 2 : Math.min(b - 0.004, Math.max(a + 0.004, t)));
    // is face g open (drawn, nothing against it) just beside point p (p on its edge or within it)
    function openAt(X, g, p) {
      const I = X.F[g]; if (I.hid) return false;
      const u = clampIn(p[I.a], X.lo[I.a], X.hi[I.a]), w = clampIn(p[I.v], X.lo[I.v], X.hi[I.v]), R = I.rects;
      if (I.ix) { const L = I.ix.inn[cellOf(I.ix, u, w)]; for (let n = 0; n < L.length; n++) { const r = R[L[n]]; if (u > r[0] && u < r[1] && w > r[2] && w < r[3]) return false; } return true; }
      for (let n = 0; n < R.length; n++) { const r = R[n]; if (u > r[0] && u < r[1] && w > r[2] && w < r[3]) return false; }
      return true;
    }
    // how far a skirt of face I may run on past its edge with face g at p: the depth of what covers g there; 0 where that is a box
    // of the same kind whose own face carries I's on flush (the two move alike), or g is left to something drawn elsewhere
    function skirtDepth(X, g, p, I) {
      const Gg = X.F[g]; if (Gg.skip) return 0;
      const occ = X.C.occ, cl = X.b.kind === 'rock' ? 2 : 1;
      const u = clampIn(p[Gg.a], X.lo[Gg.a], X.hi[Gg.a]), w = clampIn(p[Gg.v], X.lo[Gg.v], X.hi[Gg.v]);
      let d = 0;
      const L = Gg.ix ? Gg.ix.inn[cellOf(Gg.ix, u, w)] : null, nL = L ? L.length : Gg.rects.length;
      for (let n = 0; n < nL; n++) {
        const r = Gg.rects[L ? L[n] : n];
        if (!(u > r[0] && u < r[1] && w > r[2] && w < r[3]) || r[4] <= d) continue;
        if (r[6] >= 0) { const q = r[6] * 7, e = I.sg > 0 ? occ[q + 3 + I.k] : occ[q + I.k]; if (r[5] === cl && Math.abs(e - I.pl) < 1e-3) continue; }
        d = r[4];
      }
      return d;
    }
    // is anyone ever close to this face: the floors in front of an upright face out to 6 m, near a level one
    function faceNear(X, I) {
      if (!X.near || I.hid) return false;
      const { lo, hi, C } = X;
      if (I.k === 1) return I.sg > 0 ? X.rn[1] + 1.7 > hi[1] - 0.6 : X.rn[0] < lo[1] - 0.3;
      let x0 = lo[0], x1 = hi[0], z0 = lo[2], z1 = hi[2];
      if (I.k === 0) { if (I.sg > 0) { x0 = hi[0]; x1 = hi[0] + 6; } else { x0 = lo[0] - 6; x1 = lo[0]; } }
      else if (I.sg > 0) { z0 = hi[2]; z1 = hi[2] + 6; } else { z0 = lo[2] - 6; z1 = lo[2]; }
      const r = reachNear(C.reach, x0, z0, x1, z1, 0.5);
      return !!r && r[1] + 2 > lo[1] && r[0] - 1 < hi[1];
    }
    // the courses of the stone's picture between a and b (within the band near the floors): at each joint a line, and one either side
    const JW = 0.008;
    function courseRows(X, a, b, out) {
      const R = X.R, S = X.uvS, ov = X.o.vo || 0, y0 = Math.max(a, X.band0), y1 = Math.min(b, X.band1, X.band0 + 3.4), M = LEAN_C[X.C.lean];
      if (!(y1 > y0)) return;
      for (let k = Math.ceil((y0 / S + ov) * R - 1e-9); ; k++) {
        const y = (k / R - ov) * S; if (y > y1) break;
        if (((k % M) + M) % M) continue;
        if (y - JW > a + 1e-4 && y - JW < b - 1e-4) out.push(y - JW);
        if (y + JW > a + 1e-4 && y + JW < b - 1e-4) out.push(y + JW);
      }
    }
    // the points along the edge on axis ax where faces g1 and g2 meet: the same for both faces (so the two never part). Closer on an
    // edge where both are open (its arris is worked), and on upright edges at the courses of the stone
    const ekey = (ax, g1, g2) => { const lo1 = (g1 >> 1) < (g2 >> 1); return ax * 4 + ((lo1 ? g1 : g2) & 1) * 2 + ((lo1 ? g2 : g1) & 1); };
    function edgeSamples(X, ax, g1, g2) {
      const key = ekey(ax, g1, g2); if (X.EE[key]) return X.EE[key];
      const T0 = X.Ts[2 * ax + 1], T1 = X.Ts[2 * ax], t0 = X.lo[ax], t1 = X.hi[ax], w0 = T0.length ? X.Ws[2 * ax + 1] * T0[0] : 0, w1 = T1.length ? X.Ws[2 * ax] * T1[0] : 0, out = [t0];
      if (w0 > 0) out.push(t0 + w0);
      const P = X.P, rock = X.b.kind === 'rock', open = !X.F[g1].hid && !X.F[g2].hid, crs = open && ax === 1 && X.R && X.F[g1].crs && X.F[g2].crs, en = edgeNear(X, g1, g2);
      // (dressed stone and wood: close only where the arris is worked - a closed edge is held flat, so two boxes side by side still meet
      // there whatever their points; rock: the same everywhere, its relief runs on from one box into the next)
      if (!en) step(out, t0 + w0, t1 - w1, ax === 1 ? P.ho * 3 : P.hs * 3);
      else if (ax !== 1) step(out, t0 + w0, t1 - w1, rock ? P.es : !open ? P.hs : g1 === 3 || g2 === 3 ? 2 * P.es : P.es);
      else {
        // (upright: close near the floors, wider above them and wider still below)
        const b0 = X.band0 - 0.3, b1 = X.band1 + 0.3, hn = !rock && open ? 2 * P.es : P.hv;
        step(out, t0 + w0, Math.min(t1 - w1, b0), 2 * P.ho);
        step(out, Math.max(t0 + w0, b0), Math.min(t1 - w1, b1), hn);
        step(out, Math.max(t0 + w0, b1), t1 - w1, P.ho);
      }
      if (w1 > 0) out.push(t1 - w1); out.push(t1);
      if (en && ax === 1) { if (crs) courseRows(X, t0 + w0, t1 - w1, out); dampRow(X, t0 + w0, t1 - w1, out); }
      if (X.crumble === 2 && ax === X.la && (g1 === 2 || g2 === 2)) { const st = stonePts(X, key, t0 + w0, t1 - w1); for (let i = 0; i < st.length; i++) out.push(st[i]); }
      if (en && open && X.b.kind === 'cut') {
        // (the chips of the edge, found once for the box - they do not move with the spacing; kept also as the box's list for chamf)
        const ch = chipsOf(X, key, ax, g1, g2, t0 + w0, t1 - w1)[X.C.lean];
        for (let i = 0; i < ch.length; i++) out.push(ch[i]);
      }
      return (X.EE[key] = uniq(out));
    }
    // the ends and middles of the stones of a broken top between a and b (broken: stones of L along the run, shifted by a part of a stone
    // every 4 L), once for the edge
    function stonePts(X, key, a, b) {
      const K = X.SK || (X.SK = []); if (K[key]) return K[key];
      const out = [], L = 0.5, wq = X.wq, put = (t) => { if (t > a + 0.01 && t < b - 0.01) out.push(t); };
      for (let B = Math.floor(a / (L * 4)); B * L * 4 < b; B++) {
        const j = 0.37 * hh(B & 255, wq & 255, 9), u0 = B * L * 4, u1 = u0 + L * 4;
        put(u0 - 0.015); put(u0 + 0.015);
        for (let i = Math.floor(u0 / L + j); (i - j) * L < u1; i++) { const t = (i - j) * L; if (t > u0 + 0.03 && t < u1 - 0.03) { put(t - 0.015); put(t + 0.015); } put(t + L / 2); }
      }
      return (K[key] = out);
    }
    // (rock: the box's nearness, so that two pieces side by side sample their common edge alike)
    const edgeNear = (X, g1, g2) => X.near && (X.b.kind === 'rock' || X.F[g1].fn || X.F[g2].fn);
    // the chips of edge key and their points by lean (points only from a little under the floors to a metre over a head)
    function chipsOf(X, key, ax, g1, g2, a, b) {
      let ch = X.CK[key]; if (ch) return ch;
      let pa = a, pb = b;
      if (ax === 1) { pa = Math.max(a, X.band0 - 0.3); pb = Math.min(b, X.band1 + 1); }
      else { const y = (g1 >> 1) === 1 ? (g1 & 1 ? X.lo[1] : X.hi[1]) : (g2 & 1 ? X.lo[1] : X.hi[1]); if (y > X.band1 + 1 || y < X.band0 - 1) pb = pa; }
      return (X.CK[key] = chipPts(X, ax, g1 & 1 ? X.lo[g1 >> 1] : X.hi[g1 >> 1], g1 >> 1, g2 & 1 ? X.lo[g2 >> 1] : X.hi[g2 >> 1], g2 >> 1, pa, pb));
    }
    // the chips knocked out of a dressed edge: in each cell of 0.42 m (four in ten), a ball about a point of the cell - mostly a few
    // centimetres, one in fourteen 10-18 cm. chip(x, y, z) is how deep the chips reaching p cut, as a part of the band (big) or the arris
    const CS_ = 0.42, CR = 0.18, cb = [0, 0, 0, 0, 0];
    function chipCell(ix, iy, iz) {
      const h = hh(ix, iy, iz); if (h >= 0.4) return false;
      cb[0] = (ix + 0.2 + 0.6 * hh(ix + 7, iy, iz)) * CS_; cb[1] = (iy + 0.2 + 0.6 * hh(ix, iy + 7, iz)) * CS_; cb[2] = (iz + 0.2 + 0.6 * hh(ix, iy, iz + 7)) * CS_;
      cb[4] = h < 0.07 ? 1 : 0; cb[3] = cb[4] ? 0.1 + 0.08 * hh(ix, iy + 13, iz) : 0.05 + 0.08 * hh(ix, iy + 13, iz);
      return true;
    }
    // (along the edge on axis ax at c1 on axis k1 and c2 on k2: the chips that cut it, into the box's list (X.chips: x, y, z, r, big),
    // and the points to give each between a and b - its middle and one or two either side, so that a chip shows whatever the spacing
    // of the rest)
    const ci = [0, 0, 0];
    function chipPts(X, ax, c1, k1, c2, k2, a, b) {
      const out = [], o1 = [], o2 = [], L = X.chips || (X.chips = []);
      const put = (t, big, mid) => { if (t > a + 0.01 && t < b - 0.01) { out.push(t); if (big) { o1.push(t); if (mid) o2.push(t); } } };
      for (let i = Math.floor((X.lo[ax] - CR) / CS_); i <= Math.floor((X.hi[ax] + CR) / CS_); i++) for (let j = Math.floor((c1 - CR) / CS_); j <= Math.floor((c1 + CR) / CS_); j++) for (let m = Math.floor((c2 - CR) / CS_); m <= Math.floor((c2 + CR) / CS_); m++) {
        ci[ax] = i; ci[k1] = j; ci[k2] = m;
        if (!chipCell(ci[0], ci[1], ci[2])) continue;
        const d1 = cb[k1] - c1, d2 = cb[k2] - c2, dd = cb[3] * cb[3] - d1 * d1 - d2 * d2; if (dd <= 0) continue;
        L.push(cb[0], cb[1], cb[2], cb[3], cb[4]);
        if (dd <= (cb[4] ? 1e-4 : 9e-4) || !(b > a)) continue;
        const hc = Math.sqrt(dd), tc = cb[ax], big = cb[4] === 1;
        put(tc, big, true);
        if (big) { put(tc - 0.45 * hc, true, false); put(tc + 0.45 * hc, true, false); put(tc - 0.85 * hc, true, true); put(tc + 0.85 * hc, true, true); }
        else { put(tc - 0.7 * hc, false); put(tc + 0.7 * hc, false); }
      }
      return [out, o1, o2];
    }
    // a line half a metre over the lowest floor near the box (the damp at a wall's foot fades out by there)
    function dampRow(X, a, b, out) {
      if (X.b.kind === 'rock' || !X.rn || !isFinite(X.rn[0])) return;
      const y = X.rn[0] + 0.5; if (y > a + 0.05 && y < b - 0.05) out.push(y);
    }
    // every h on the world's grid strictly within a..b (not too near either end)
    function step(out, a, b, h) { if (!(b > a)) return; for (let n = Math.ceil((a + h * 0.3) / h); n * h < b - h * 0.3; n++) out.push(n * h); }
    // the lines of a face's grid across t0..t1: the band along each end, then every h on the world's grid (and extra ones)
    function lines(t0, t1, wl, wh, Tl, Th, h, extra) {
      const out = [];
      for (const t of Tl) out.push(t0 + wl * t);
      const a0 = t0 + wl + h * 0.3, a1 = t1 - wh - h * 0.3;
      for (let n = Math.ceil(a0 / h); n * h < a1; n++) out.push(n * h);
      for (let i = Th.length - 1; i >= 0; i--) out.push(t1 - wh * Th[i]);
      if (extra) for (const t of extra) if (t > t0 + wl + 1e-4 && t < t1 - wh - 1e-4) out.push(t);
      return uniq(out);
    }
    // the rows of an upright face: the courses near the floors (with a line between where they are far apart), every metre above
    function sideRows(X, I, v0, v1, wl, wh, Tl, Th) {
      const P = X.P, out = [];
      for (const t of Tl) out.push(v0 + wl * t);
      const a0 = v0 + wl, a1 = v1 - wh, top = () => { for (let i = Th.length - 1; i >= 0; i--) out.push(v1 - wh * Th[i]); return uniq(out); };
      if (!I.fn) { const h = P.ho * 3; for (let n = Math.ceil((a0 + h * 0.3) / h); n * h < a1 - h * 0.3; n++) out.push(n * h); return top(); }
      // (near the floors every hv; above them every ho; well below them every 2 ho)
      const b0 = X.band0, b1 = X.band1, h = P.hv;
      for (let n = Math.ceil((a0 + h * 0.3) / h); n * h < a1 - h * 0.3; n++) {
        const y = n * h, m = y >= b0 - 0.3 && y <= b1 + 0.3 ? 1 : y > b1 ? Math.round(P.ho / h) : Math.round((y < b0 - 6 ? 4 : 2) * P.ho / h);
        if (n % m === 0) out.push(y);
      }
      dampRow(X, a0, a1, out);
      return top();
    }

    // ---- rock: which sides are rounded off, and what it touches that is not rock (it keeps still near that)
    function rockPrep(X) {
      const { lo, hi, ext, F: Fs, C, P } = X, occ = C.occ;
      X.rr = [0, 0, 0, 0, 0, 0];
      for (let f = 0; f < 6; f++) { const I = Fs[f]; if (!I.hid && !I.skip && I.open > 0.5) X.rr[f] = Math.min(P.rho, ext[f >> 1] * 0.45); }
      // walked on: its top keeps level (no rounding, a relief of a centimetre or so)
      const rt = reachNear(C.reach, lo[0], lo[2], hi[0], hi[2], 0);
      X.walk = !!rt && C.reach && Math.abs(rt[1] - hi[1]) < 0.35;
      if (X.walk) X.rr[2] = 0;
      const fc = [], thin = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
      for (let f = 0; f < 6; f++) {
        const I = Fs[f];
        // (a face left undrawn is where something else is drawn - the ground of a terrain over a cliff's skin - but the back of a skin
        // a few centimetres thick is only its inside)
        if (I.skip) { if (!((f >> 1) === thin && ext[thin] < 0.1)) fc.push([f, I.pl, lo[I.a], hi[I.a], lo[I.v], hi[I.v]]); continue; }
        for (const r of I.rects) {
          if (r[5] === 2) continue;
          if (f === 2 || f === 3) {
            // what it stands on (or what stands on it) only holds it still along a side where its own face carries on flush from the rock's
            if (r[6] < 0) continue; // (the ground under it: no face of it carries the rock's on)
            const q = r[6] * 7;
            for (let s = 0; s < 4; s++) {
              const g = s < 2 ? s : s + 2, kg = g >> 1, sgg = g & 1 ? -1 : 1, plg = sgg > 0 ? hi[kg] : lo[kg], e = sgg > 0 ? occ[q + 3 + kg] : occ[q + kg];
              if (Math.abs(e - plg) > 0.06) continue;
              const ag = AU[g], a0 = Math.max(occ[q + ag], lo[ag]), a1 = Math.min(occ[q + 3 + ag], hi[ag]);
              if (a1 > a0) fc.push([g, plg, a0, a1, I.pl, I.pl]);
            }
          } else fc.push([f, I.pl, r[0], r[1], r[2], r[3]]);
        }
      }
      // what is not rock and stands just before an open face of it (a mine's frame, a post, a beam a little way off the rock): kept as
      // touching it there, so that the rock neither swallows it nor leaves it hanging in the air
      around(C, lo[0] - 0.36, lo[2] - 0.36, hi[0] + 0.36, hi[2] + 0.36);
      for (let n = 0; n < cand.length; n++) {
        const j = cand[n]; if (j === X.b.oi) continue;
        const q = j * 7; if (occ[q + 6] === 2) continue;
        for (let f = 0; f < 6; f++) {
          const I = Fs[f]; if (I.hid || I.skip) continue;
          const k = f >> 1, gap = I.sg > 0 ? occ[q + k] - hi[k] : lo[k] - occ[q + 3 + k];
          if (gap < -0.01 || gap > 0.35) continue;
          const a = I.a, v = I.v, a0 = Math.max(occ[q + a], lo[a]), a1 = Math.min(occ[q + 3 + a], hi[a]), v0 = Math.max(occ[q + v], lo[v]), v1 = Math.min(occ[q + 3 + v], hi[v]);
          if (a1 - a0 > 1e-3 && v1 - v0 > 1e-3) fc.push([f, I.pl, a0, a1, v0, v1]);
        }
      }
      // (into the area's map, cells of a metre: each contact as the box of points it covers, padded by the fade)
      const R = X.P.fade, M = C.fc;
      for (const c of fc) {
        const g = c[0], k = g >> 1, a = AU[g], v = AV[g], mn = [0, 0, 0], mx = [0, 0, 0];
        mn[k] = mx[k] = c[1]; mn[a] = c[2]; mx[a] = c[3]; mn[v] = c[4]; mx[v] = c[5];
        const e = { g, k, a, v, pl: c[1], a0: c[2], a1: c[3], v0: c[4], v1: c[5], st: 0 };
        for (let x = Math.floor(mn[0] - R); x <= Math.floor(mx[0] + R); x++) for (let z = Math.floor(mn[2] - R); z <= Math.floor(mx[2] + R); z++) {
          const key = (x + 2048) * 8192 + (z + 2048); let l = M.get(key); if (!l) M.set(key, (l = [])); l.push(e);
        }
      }
    }
    // 0 (still) near anything rock in the area touches that is not rock, or a light hung on it; 1 a fade's length from it (the place
    // alone decides)
    function rockAlpha(X, p) {
      const key = (Math.floor(p[0]) + 2048) * 8192 + (Math.floor(p[2]) + 2048), l = X.C.fc.get(key), lp = X.C.lights && X.C.lights.get(key);
      let d2 = Infinity;
      if (lp) for (let n = 0; n < lp.length; n += 3) { const dx = p[0] - lp[n], dy = p[1] - lp[n + 1], dz = p[2] - lp[n + 2], d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.6); if (d * d < d2) d2 = d * d; }
      if (!l) return d2 === Infinity ? 1 : sst(0, X.P.fade, Math.sqrt(d2));
      for (let n = 0; n < l.length && d2 > 0; n++) {
        const c = l[n];
        const dk = p[c.k] - c.pl, da = p[c.a] < c.a0 ? c.a0 - p[c.a] : p[c.a] > c.a1 ? p[c.a] - c.a1 : 0, dv = p[c.v] < c.v0 ? c.v0 - p[c.v] : p[c.v] > c.v1 ? p[c.v] - c.v1 : 0;
        const d = dk * dk + da * da + dv * dv; if (d < d2) d2 = d;
      }
      return sst(0, X.P.fade, Math.sqrt(d2));
    }
    // the broken masses of rock: of the jittered points of a lattice of 1.1 m cells (the eight about p), the nearest carries a plane of
    // its own - turned a little, stepped in or out - and the relief is that plane at p: facets meeting in creases and small steps
    let FGX = 0, FGY = 0, FGZ = 0; // (facets: the slope of the facet at the point asked)
    function facets(x, y, z) {
      const S = 1.1, fx = x / S - 0.5, fy = y / S - 0.5, fz = z / S - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      let best = 1e9, bx = 0, by = 0, bz = 0, px = 0, py = 0, pz = 0;
      for (let c = 0; c < 8; c++) {
        const cx = ix + (c & 1), cy = iy + ((c >> 1) & 1), cz = iz + ((c >> 2) & 1);
        const qx = (cx + 0.5 + (hh(cx, cy, cz) - 0.5) * 0.9) * S, qy = (cy + 0.5 + (hh(cx + 31, cy, cz) - 0.5) * 0.9) * S, qz = (cz + 0.5 + (hh(cx, cy + 17, cz) - 0.5) * 0.9) * S;
        const d = (x - qx) * (x - qx) + (y - qy) * (y - qy) + (z - qz) * (z - qz);
        if (d < best) { best = d; bx = cx; by = cy; bz = cz; px = qx; py = qy; pz = qz; }
      }
      FGX = (hh(bx + 7, by + 5, bz) - 0.5) * 0.8; FGY = (hh(bx + 3, by, bz + 11) - 0.5) * 0.8; FGZ = (hh(bx, by + 9, bz + 2) - 0.5) * 0.8;
      return -0.3 + 0.5 * hh(bx, by, bz + 23) + FGX * (x - px) + FGY * (y - py) + FGZ * (z - pz);
    }
    // is the way before a rock face narrow here: a metre out along its normal, something stands at the height of a body
    function narrowFront(C, x, y, z, dx, dz) {
      const w = C.world; if (!w || !w.nb) return false;
      const l = Math.sqrt(dx * dx + dz * dz); if (l < 0.5) return false;
      const i = w.navIdx(x + dx / l * 1.1, z + dz / l * 1.1, y); if (i < 0) return false;
      return w.nb[i] === 1 && w.nf[i] > -50 && w.nf[i] > y - 2.2;
    }
    // wood: a beam (long and narrow) bows a little one way
    function woodPrep(X) {
      const { ext, lo, hi } = X, l = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2, o1 = (l + 1) % 3, o2 = (l + 2) % 3;
      if (ext[l] > 1 && ext[o1] < 0.4 && ext[o2] < 0.4) {
        const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], h = hh(Math.floor(c[0] * 7), Math.floor(c[1] * 7), Math.floor(c[2] * 7));
        X.bow = { l, d: h < 0.5 ? o1 : o2, A: (0.003 + 0.006 * hh(Math.floor(c[2] * 5), Math.floor(c[0] * 5), 3)) * (h < 0.25 || h > 0.75 ? 1 : -1) * Math.min(1, ext[l] / 3) };
      }
    }
    // ---- how far face g of the box stands out at p, along its own normal (dressed stone; wood stands as it is)
    let crsOn = false; // (the courses count only on the points of an open upright edge where they are drawn)
    let nA = 0, nB = 0; // (the point's broad and middling noise: set by place before relief is asked)
    function relief(X, g, p, pin) {
      if (X.b.kind !== 'cut') return 0; // (wood stands as it is; a beam bows as a whole: place)
      const I = X.F[g], x = p[0], y = p[1], z = p[2];
      if (I.k === 1) {
        if (g !== 2) return 0;
        // a top nobody walks on a little uneven (held level where it meets the next box); a broken top lower in places
        let r = pin || X.b.mk === 'floor' || X.b.mk === 'cobble' ? 0 : 0.01 * nB;
        if (X.crumble) r -= broken(X, x, y, z);
        return thinCap(I, p, r);
      }
      // the quoins of an open corner: course by course 0-3 cm out (a slender pier a centimetre at most: no toy bricks)
      if (!crsOn || y < X.band0 || y > Math.min(X.band1, X.band0 + 3.4)) return 0;
      const cv = (y / X.uvS + (X.o.vo || 0)) * X.R / LEAN_C[X.C.lean];
      return (X.slender ? 0.01 : 0.03) * (1.2 * vn(Math.floor(cv) * 1.731 + 0.37, p[I.a] * 0.42, I.pl * 0.37) - 0.2);
    }
    // how far a wall's top has broken away at p. A little: a worn line. In a ruin: stone by stone (half a metre along the wall) a course
    // or two gone (22 / 44 cm), in stretches, with a rough break
    function broken(X, x, y, z) {
      if (X.crumble === 1) { const A = Math.min(0.11, X.Ws[2] * 0.45); return A * sst(0.4, 0.85, vn(x * 1.1 + 5.3, y * 0.37, z * 1.1)) + A * 0.2 * vn(x * 4.1, y * 4.1, z * 4.1 + 2.2); }
      const u = X.la === 0 ? x : z, wq = X.wq, L = 0.5;
      const i = Math.floor(u / L + 0.37 * hh(Math.floor(u / (L * 4)) & 255, wq & 255, 9)), h = hh(i & 255, wq & 255, 23);
      const zone = sst(0.38, 0.6, vn(u * 0.22 + 3.3, y * 0.1, wq * 0.7));
      const d = (h < 0.45 ? 0 : h < 0.78 ? 0.22 : 0.44) * zone + 0.025 * vn(x * 4.1, y * 4.1, z * 4.1 + 2.2);
      return Math.min(d, X.Ws[2] * 0.85);
    }
    // is the corner just outside an edge (or a box corner) of this box filled by another box: the point a centimetre out along every
    // open face that meets there (ex[0..m-1]), inside something opaque
    function cornerFilled(X, p, m) {
      const occ = X.C.occ, n0 = NRM[ex[0]], n1 = NRM[ex[1]], n2 = m > 2 ? NRM[ex[2]] : null;
      const x = p[0] + 0.01 * (n0[0] + n1[0] + (n2 ? n2[0] : 0)), y = p[1] + 0.01 * (n0[1] + n1[1] + (n2 ? n2[1] : 0)), z = p[2] + 0.01 * (n0[2] + n1[2] + (n2 ? n2[2] : 0));
      const l = X.touch;
      for (let i = 0; i < l.length; i++) {
        const j = l[i]; if (j === X.b.oi) continue;
        const q = j * 7; if (x > occ[q] && x < occ[q + 3] && y > occ[q + 1] && y < occ[q + 4] && z > occ[q + 2] && z < occ[q + 5]) return true;
      }
      return false;
    }
    // a thin thing laid on the face (a plinth, a pane, a rug, a drain - a plate a few centimetres thick) stays on it: under it and near it
    // the face stands out no more than the plate is thick, rising back to its own swell a little way off
    function thinCap(I, p, r) {
      if (r <= 0) return r;
      const u = p[I.a], w = p[I.v], L = I.ix ? I.ix.near[cellOf(I.ix, u, w)] : null, nL = L ? L.length : I.rects.length;
      for (let n = 0; n < nL; n++) {
        const q = I.rects[L ? L[n] : n]; if (q[4] >= 0.08) continue;
        const du = u < q[0] ? q[0] - u : u > q[1] ? u - q[1] : 0, dw = w < q[2] ? q[2] - w : w > q[3] ? w - q[3] : 0;
        const cap = Math.max(0, q[4] - 0.004) + 0.12 * Math.max(du, dw); if (r > cap) r = cap;
      }
      return r;
    }
    // how far the arris is taken off along face g's normal at p (a part of the band W along that axis): its run (ar: the noise of it at
    // p), and chips
    function chamf(X, g, p, ar) {
      const x = p[0], y = p[1], z = p[2], Wc = X.Wc[g], Wb = X.Ws[g];
      if (X.b.kind !== 'cut') return Wc * Math.min(0.9, 0.45 + 0.3 * ar);
      // (the run of the arris wanders over a metre or so; the chips are the deepest of those whose ball holds p - p is on an open edge,
      // so any chip reaching it cuts that edge and is in the box's list)
      let k = 0;
      const L = X.chips;
      if (L) for (let i = 0; i < L.length; i += 5) {
        const r = L[i + 3], dx = x - L[i], dy = y - L[i + 1], dz = z - L[i + 2]; if (dx > r || dx < -r || dy > r || dy < -r || dz > r || dz < -r) continue;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r) { const t = 1 - d / r, e = L[i + 4] ? Wb * 0.85 * Math.sqrt(t) : Wc * 0.8 * t; if (e > k) k = e; }
      }
      return Math.min(Wc * (0.3 + 0.25 * ar) + k, Wb * 0.9);
    }

    // ---- one face
    const BE_ = [], TE_ = [], LE_ = [], RE_ = [], Z0 = [], Z1 = [], Z2 = [], CU0 = [0, 0], CU1 = [0, 0], CV0 = [0, 0], CV1 = [0, 0];
    const LN = [NaN, NaN, NaN, NaN], LK = [0, 0, 0, 0], LG = [0, 0, 0, 0]; // (emit: the band lines by the four edges, how much they lean, toward which face)
    const RN = [], QK = [], QI = [], VU = [], VV = [], VF = [], PX = [], PY = [], PZ = [], DC = [], AT = [], TRI = [], NX = [], NY = [], NZ = [], NA = [], NB = [];
    let MAP = new Int32Array(4096);
    const p3 = [0, 0, 0], e3 = [0, 0, 0];
    function buildFace(X, f) {
      const I = X.F[f], { lo, hi } = X, a = I.a, v = I.v;
      const u0 = lo[a], u1 = hi[a], v0 = lo[v], v1 = hi[v];
      const gl = 2 * a + 1, gr = 2 * a, gb = 2 * v + 1, gt = 2 * v;
      const [Us, Vs] = I.G || grid(X, I); I.G = null;
      VU.length = VV.length = VF.length = TRI.length = QK.length = QI.length = 0;
      const add = (u, w, fl, k, i) => { VU.push(u); VV.push(w); VF.push(fl); QK.push(k); QI.push(i); return VU.length - 1; };
      const nu = Us.length, nv = Vs.length;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { VU.push(Us[i]); VV.push(Vs[j]); VF.push(0); QK.push(-1); QI.push(0); }
      // (a face without a grid across one way uses only the corners of the two edges along that way)
      const bt = nu || (!nv && !!X.crumble); // (the bottom and top edges with their points: a broken top keeps its stones on a short piece too)
      if (!bt) { CU0[0] = CU1[0] = u0; CU0[1] = CU1[1] = u1; }
      if (!nv) { CV0[0] = CV1[0] = v0; CV0[1] = CV1[1] = v1; }
      const EUb = !bt ? CU0 : edgeSamples(X, a, f, gb), EUt = !bt ? CU1 : edgeSamples(X, a, f, gt), EVl = !nv ? CV0 : edgeSamples(X, v, f, gl), EVr = !nv ? CV1 : edgeSamples(X, v, f, gr);
      const nb = EUb.length, nt = EUt.length, nl = EVl.length, nr = EVr.length, BE = BE_, TE = TE_, LE = LE_, RE = RE_;
      BE.length = TE.length = LE.length = RE.length = 0;
      // (each point of an edge carries the edge and its place on it: the other face that meets there takes the same point's move)
      const kb = bt ? ekey(a, f, gb) : -1, kt = bt ? ekey(a, f, gt) : -1, kl = nv ? ekey(v, f, gl) : -1, kr = nv ? ekey(v, f, gr) : -1;
      for (let i = 0; i < nb; i++) BE.push(add(EUb[i], v0, 4 | (i === 0 ? 1 : 0) | (i === nb - 1 ? 2 : 0), i === 0 || i === nb - 1 ? -1 : kb, i));
      for (let i = 0; i < nt; i++) TE.push(add(EUt[i], v1, 8 | (i === 0 ? 1 : 0) | (i === nt - 1 ? 2 : 0), i === 0 || i === nt - 1 ? -1 : kt, i));
      for (let j = 0; j < nl; j++) LE.push(j === 0 ? BE[0] : j === nl - 1 ? TE[0] : add(u0, EVl[j], 1, kl, j));
      for (let j = 0; j < nr; j++) RE.push(j === 0 ? BE[nb - 1] : j === nr - 1 ? TE[nt - 1] : add(u1, EVr[j], 2, kr, j));
      const nCore = VU.length;
      // where every point goes
      PX.length = PY.length = PZ.length = DC.length = AT.length = NA.length = NB.length = nCore;
      for (let q = 0; q < nCore; q++) place(X, I, q);
      // the grid, the four bands between it and the edges (no grid across one way: the two edges along it joined straight)
      if (!nv && bt) zip(f, BE, EUb, 0, nb, TE, EUt);
      else if (!nu) zip(f, LE, EVl, 0, nl, RE, EVr);
      else {
        for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const q = j * nu + i; tri(f, q, q + 1, q + nu + 1); tri(f, q, q + nu + 1, q + nu); }
        const r0 = Z0, rN = Z1, pr = Z2; r0.length = rN.length = pr.length = 0; r0.push(LE[1]); rN.push(LE[nl - 2]); pr.push(u0);
        for (let i = 0; i < nu; i++) { r0.push(i); rN.push((nv - 1) * nu + i); pr.push(Us[i]); }
        r0.push(RE[1]); rN.push(RE[nr - 2]); pr.push(u1);
        zip(f, BE, EUb, 0, nb, r0, pr); zip(f, TE, EUt, 0, nt, rN, pr);
        const c0 = Z0, cN = Z1, pc = Z2; c0.length = cN.length = pc.length = 0;
        for (let j = 0; j < nv; j++) { c0.push(j * nu); cN.push(j * nu + nu - 1); pc.push(Vs[j]); }
        zip(f, LE, EVl, 1, nl - 1, c0, pc); zip(f, RE, EVr, 1, nr - 1, cN, pc);
      }
      // the skirts: where the box runs on into another one, the face carries on a little way into it
      skirt(X, I, BE, 2 * v + 1); skirt(X, I, TE, 2 * v); skirt(X, I, LE, 2 * a + 1); skirt(X, I, RE, 2 * a);
      emit(X, I);
    }
    function tri(f, a, b, c) {
      const cr = (VU[b] - VU[a]) * (VV[c] - VV[a]) - (VV[b] - VV[a]) * (VU[c] - VU[a]);
      if (Math.abs(cr) < 1e-12) return;
      if (cr * HD[f] > 0) TRI.push(a, b, c); else TRI.push(a, c, b);
    }
    // (the strip between the run A[s..e) with its places Ap and the run B with Bp)
    function zip(f, A, Ap, s, e, B, Bp) {
      let i = s, j = 0; const n = e - 1, m = B.length - 1;
      while (i < n || j < m) {
        if (j >= m || (i < n && Ap[i + 1] <= Bp[j + 1])) { tri(f, A[i], A[i + 1], B[j]); i++; }
        else { tri(f, A[i], B[j + 1], B[j]); j++; }
      }
    }
    // the deep cover of a point: the index of what covers it by more than its margin (its triangles are not drawn), else -1
    function deepIn(I, u, w) {
      const R = I.rects;
      if (I.ix) { const L = I.ix.inn[cellOf(I.ix, u, w)]; for (let k = 0; k < L.length; k++) { const n = L[k], r = R[n], m = MARGIN[r[5]]; if (u > r[0] + m && u < r[1] - m && w > r[2] + m && w < r[3] - m) return n; } return -1; }
      for (let n = 0; n < R.length; n++) { const r = R[n], m = MARGIN[r[5]]; if (u > r[0] + m && u < r[1] - m && w > r[2] + m && w < r[3] - m) return n; }
      return -1;
    }
    // the moved position of point q of face I
    const ex = [0, 0, 0, 0];
    function place(X, I, q) {
      const k = I.k, a = I.a, v = I.v, f = I.f, fl = VF[q], b = X.b;
      p3[k] = I.pl; p3[a] = VU[q]; p3[v] = VV[q];
      DC[q] = deepIn(I, VU[q], VV[q]); AT[q] = 0;
      let dx = 0, dy = 0, dz = 0;
      const gL = 2 * a + 1, gR = 2 * a, gB = 2 * v + 1, gT = 2 * v;
      if (b.kind === 'rock') {
        const al = rockAlpha(X, p3), lo = X.lo, hi = X.hi, rr = X.rr, rho = X.P.rho;
        // onto the box rounded off on its open sides; the relief along the rounded normal (an open side left square - a top walked on -
        // counts with its own normal). A side is rounded only where it is open there: where the next box carries the face on, both
        // stay square alike, and neither leans the relief its own way
        let qx = 0, qy = 0, qz = 0, sx = 0, sy = 0, sz = 0, rh = 0;
        for (let ax = 0; ax < 3; ax++) {
          const gH = 2 * ax, gL = 2 * ax + 1;
          let rH = rr[gH], rL = rr[gL];
          if (rH && p3[ax] > hi[ax] - rH && !openAt(X, gH, p3)) rH = 0;
          if (rL && p3[ax] < lo[ax] + rL && !openAt(X, gL, p3)) rL = 0;
          const c = Math.min(hi[ax] - rH, Math.max(lo[ax] + rL, p3[ax])), d = p3[ax] - c;
          if (d > 1e-9) rh = Math.max(rh, rH); else if (d < -1e-9) rh = Math.max(rh, rL);
          if (ax === 0) qx = d; else if (ax === 1) qy = d; else qz = d;
          // (the direction: how far into each side's round the point is, as a part of that round - so a skin a few centimetres thick
          // keeps its own normal, and a square open side counts whole)
          let s = d > 1e-9 ? (rH > 1e-9 ? d / rH : 0) : d < -1e-9 ? (rL > 1e-9 ? d / rL : 0) : 0;
          if (!rH && Math.abs(p3[ax] - hi[ax]) < 1e-6 && openAt(X, gH, p3)) s = 1; else if (!rL && Math.abs(p3[ax] - lo[ax]) < 1e-6 && openAt(X, gL, p3)) s = -1;
          if (ax === 0) sx = s; else if (ax === 1) sy = s; else sz = s;
        }
        const ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
        let ddx = sx, ddy = sy, ddz = sz; const dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (dl > 1e-9) { ddx /= dl; ddy /= dl; ddz /= dl; } else { const n = NRM[f]; ddx = n[0]; ddy = n[1]; ddz = n[2]; }
        // the rounding: q scaled down onto the round where it reaches past it
        if (rh > 0 && ql > rh) { const s = (rh / ql - 1) * al; dx += qx * s; dy += qy * s; dz += qz * s; }
        const x = p3[0], y = p3[1], z = p3[2];
        const n0 = vn(x * 0.13 + 7.7, y * 0.13 + 2.1, z * 0.13), fa = facets(x, y, z);
        NA[q] = n0; NB[q] = Math.min(1, Math.max(0, 0.55 + fa));
        // (broken masses - facets of a metre or so, each turned its own way and stepped in or out - on a great swell)
        let r = fa + 0.25 * (2 * n0 - 1), gx = FGX, gy = FGY, gz = FGZ;
        if (X.walk && ddy > 0.7) { r = 0.012 * (2 * n0 - 1); gx = gy = gz = 0; }
        else {
          // (by the ways people walk: out a quarter metre at most, back 0.6 m - where the way before it is narrow, not out at all; elsewhere
          // out 0.35, back 0.9. Where it is held, the face is level there)
          const play = byPlay(X.C, x, y, z), rIn = play ? -0.6 : -0.9, rOut = play ? (narrowFront(X.C, x, y, z, ddx, ddz) ? 0.03 : 0.25) : 0.35;
          if (r < rIn) { r = rIn; gx = gy = gz = 0; } else if (r > rOut) { r = rOut; gx = gy = gz = 0; }
        }
        r *= al;
        dx += ddx * r; dy += ddy * r; dz += ddz * r;
        // (its normal: the way it moves, less the slope across it)
        { const gd = gx * ddx + gy * ddy + gz * ddz; let nx = ddx - al * (gx - gd * ddx), ny = ddy - al * (gy - gd * ddy), nz = ddz - al * (gz - gd * ddz); const l = Math.sqrt(nx * nx + ny * ny + nz * nz); RN[3 * q] = nx / l; RN[3 * q + 1] = ny / l; RN[3 * q + 2] = nz / l; }
        // and a drift sideways, so that no line of the grid runs straight
        if (al > 0 && !(X.walk && ddy > 0.7)) { const t = 0.07 * al; dx += t * (2 * n0 - 1); dz += t * (2 * NB[q] - 1); }
        if (fl) { if ((fl & 1) && !openAt(X, gL, p3)) AT[q] |= 1; if ((fl & 2) && !openAt(X, gR, p3)) AT[q] |= 2; if ((fl & 4) && !openAt(X, gB, p3)) AT[q] |= 4; if ((fl & 8) && !openAt(X, gT, p3)) AT[q] |= 8; }
      } else {
        // the faces that meet here and are open: each moves the point along its own normal, less the arris where two or three meet
        let m = 0; ex[m++] = f;
        if (fl) {
          if (fl & 1) { if (openAt(X, gL, p3)) ex[m++] = gL; else AT[q] |= 1; }
          if (fl & 2) { if (openAt(X, gR, p3)) ex[m++] = gR; else AT[q] |= 2; }
          if (fl & 4) { if (openAt(X, gB, p3)) ex[m++] = gB; else AT[q] |= 4; }
          if (fl & 8) { if (openAt(X, gT, p3)) ex[m++] = gT; else AT[q] |= 8; }
        }
        // (a point of an edge open on both sides moves alike for both faces: the second takes what the first worked out)
        const ck = m === 2 && AT[q] === 0 ? QK[q] : -1;
        let E = null, o = 0;
        if (ck >= 0) {
          E = X.EP[ck] || (X.EP[ck] = new Float64Array(X.EE[ck].length * 5).fill(NaN)); o = QI[q] * 5;
          if (E[o] === E[o]) { NA[q] = E[o + 3]; NB[q] = E[o + 4]; PX[q] = p3[0] + E[o]; PY[q] = p3[1] + E[o + 1]; PZ[q] = p3[2] + E[o + 2]; return; }
        }
        nA = NA[q] = vn(p3[0] * 0.33, p3[1] * 0.33, p3[2] * 0.33); nB = NB[q] = vn(p3[0] * 0.95 + 17.3, p3[1] * 0.95, p3[2] * 0.95);
        const noArr = m > 1 && cornerFilled(X, p3, m), pin = AT[q] !== 0, cut = b.kind === 'cut';
        // (the run of the arris, once for the point: it wanders over a metre or so)
        const ar = m > 1 && !noArr ? (cut ? vn(p3[0] * 1.3 + 1.7, p3[1] * 1.3, p3[2] * 1.3) : vn(p3[0] * 1.9, p3[1] * 1.9, p3[2] * 1.9)) : 0;
        crsOn = false;
        if (X.R > 0 && I.k !== 1 && I.crs) { if ((fl & 1) && !(AT[q] & 1)) crsOn = X.F[2 * a + 1].crs; if ((fl & 2) && !(AT[q] & 2)) crsOn = crsOn || X.F[2 * a].crs; }
        for (let n = 0; n < m; n++) {
          const g = ex[n], s = relief(X, g, p3, pin) - (m > 1 && !noArr ? chamf(X, g, p3, ar) : 0), nn = NRM[g];
          dx += nn[0] * s; dy += nn[1] * s; dz += nn[2] * s;
        }
        crsOn = false;
        if (X.bow) { const B = X.bow, t = (p3[B.l] - X.lo[B.l]) / X.ext[B.l], s = B.A * Math.sin(Math.PI * t); if (B.d === 0) dx += s; else if (B.d === 1) dy += s; else dz += s; }
        if (E) { E[o] = dx; E[o + 1] = dy; E[o + 2] = dz; E[o + 3] = nA; E[o + 4] = nB; }
      }
      PX[q] = p3[0] + dx; PY[q] = p3[1] + dy; PZ[q] = p3[2] + dz;
    }
    // past an edge where the box runs into another one (that one not drawn there): a strip on into it, sloping back
    function skirt(X, I, E, g) {
      const bit = g === 2 * I.v + 1 ? 4 : g === 2 * I.v ? 8 : g === 2 * I.a + 1 ? 1 : 2, ng = NRM[g], nf = NRM[I.f], sk = X.P.sk;
      if (!sk) return;
      let prev = -1;
      for (let i = 0; i < E.length; i++) {
        const q = E[i];
        let s = -1;
        if (AT[q] & bit) {
          p3[I.k] = I.pl; p3[I.a] = VU[q]; p3[I.v] = VV[q];
          const d = skirtDepth(X, g, p3, I), L = Math.min(sk, d * 0.8);
          if (L > 0.005) {
            s = VU.length; VU.push(VU[q]); VV.push(VV[q]); VF.push(16); DC.push(-2); AT.push(0); NA.push(NA[q]); NB.push(NB[q]); RN[3 * s] = RN[3 * q]; RN[3 * s + 1] = RN[3 * q + 1]; RN[3 * s + 2] = RN[3 * q + 2];
            PX.push(PX[q] + ng[0] * L - nf[0] * L * 0.5); PY.push(PY[q] + ng[1] * L - nf[1] * L * 0.5); PZ.push(PZ[q] + ng[2] * L - nf[2] * L * 0.5);
            SKO.push(s, q, L, g);
          }
        }
        if (s >= 0 && prev >= 0) { const qa = E[i - 1], qb = q; pushQuad(I.f, qa, qb, s, prev, ng); }
        prev = s;
      }
    }
    const SKO = []; // (skirt points: index, the edge point it hangs from, its length, the face it runs past)
    function pushQuad(f, a, b, c, d, ng) {
      // (outside the face's own u, v: wound by the 3D normal of the edge pair and the way it runs)
      const ux = PX[b] - PX[a], uy = PY[b] - PY[a], uz = PZ[b] - PZ[a], wx = PX[d] - PX[a], wy = PY[d] - PY[a], wz = PZ[d] - PZ[a];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, n = NRM[f];
      if (nx * n[0] + ny * n[1] + nz * n[2] >= 0) TRI.push(a, b, c, a, c, d); else TRI.push(a, c, b, a, d, c);
    }
    // normals from the faces round each point, uv, colour; into the batch
    function emit(X, I) {
      const n = VU.length, B = X.C.B, G0 = B._grp(X.b.mk), o = X.o;
      NX.length = NY.length = NZ.length = n; for (let q = 0; q < n; q++) NX[q] = NY[q] = NZ[q] = 0;
      // (what lies deep under something is left out. Dressed stone and wood: each point sums the faces about it, by their size, and the
      // line of the band by an open edge leans toward the face beyond (the arris rolls: over the whole of a narrow face, a little on a
      // broad one). Rock has its normals from place)
      const rock = X.b.kind === 'rock';
      if (!rock) {
        const a = I.a, v = I.v, Ts = X.Ts, Ws = X.Ws, lo = X.lo, hi = X.hi, F = X.F;
        for (let k = 0; k < 4; k++) {
          const g = k === 0 ? 2 * a + 1 : k === 1 ? 2 * a : k === 2 ? 2 * v + 1 : 2 * v, ax = k < 2 ? a : v, T = Ts[g];
          if (F[g].hid || !T.length) { LN[k] = NaN; continue; }
          LN[k] = g & 1 ? lo[ax] + Ws[g] * T[0] : hi[ax] - Ws[g] * T[0]; LK[k] = hi[ax] - lo[ax] <= 0.7 ? 0.45 : 0.15; LG[k] = g;
        }
      }
      let w = 0;
      for (let t = 0; t < TRI.length; t += 3) {
        const a = TRI[t], b = TRI[t + 1], c = TRI[t + 2];
        if (DC[a] >= 0 && DC[a] === DC[b] && DC[b] === DC[c]) continue;
        TRI[w++] = a; TRI[w++] = b; TRI[w++] = c;
        if (rock) continue;
        const ux = PX[b] - PX[a], uy = PY[b] - PY[a], uz = PZ[b] - PZ[a], vx = PX[c] - PX[a], vy = PY[c] - PY[a], vz = PZ[c] - PZ[a];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        NX[a] += nx; NY[a] += ny; NZ[a] += nz; NX[b] += nx; NY[b] += ny; NZ[b] += nz; NX[c] += nx; NY[c] += ny; NZ[c] += nz;
      }
      TRI.length = w; if (!w) { SKO.length = 0; return; }
      // only the points some triangle uses
      if (MAP.length < n) MAP = new Int32Array(n * 2);
      const map = MAP; map.fill(-1, 0, n); let m = 0;
      for (let t = 0; t < w; t++) { const q = TRI[t]; if (map[q] < 0) map[q] = m++; }
      const base = G0.p.length / 3, P3 = G0.p.need(m * 3), N3 = G0.n.need(m * 3), U2 = G0.u.need(m * 2), C3 = G0.c.need(m * 3);
      const k3 = G0.p.length, k2 = G0.u.length, s = 1 / X.uvS, ou = o.uo || 0, ov = o.vo || 0, tint = o.tint || [1, 1, 1];
      const grad = o.grad !== false, yb = o.gradBase ?? Math.min(0, X.lo[1]), f = I.f, nf = NRM[f], st = F.track ? stat(X.b.kind) : null, lo = X.lo, hi = X.hi;
      const skL = SKO.length ? new Map() : null; if (skL) for (let i = 0; i < SKO.length; i += 4) skL.set(SKO[i], i);
      if (F.dbg2) { const cl = (e) => (e < 0.35 ? 'xs' : e < 0.7 ? 's' : e < 1.5 ? 'm' : e < 4 ? 'l' : 'xl'), key = X.b.mk + (I.k === 1 ? '/lvl ' : '/up ') + cl(X.hi[I.a] - X.lo[I.a]) + 'x' + cl(X.hi[I.v] - X.lo[I.v]), e = F.dbg2[key] || (F.dbg2[key] = [0, 0]); e[0]++; for (let q = 0; q < n; q++) if (map[q] >= 0) e[1]++; } // (for the tools: points by material and size of face)
      if (F.dbg) { const D = F.dbg, key = X.b.kind + (I.k === 1 ? (I.sg > 0 ? '/top' : '/bot') : '/side') + (I.fn ? '/near' : '/far'); const e = D[key] || (D[key] = [0, 0, 0, 0, 0, 0]); e[3]++; for (let q = 0; q < n; q++) if (map[q] >= 0) { const fl = VF[q]; e[fl & 16 ? 2 : fl ? 1 : 0]++; if (fl && !(fl & 16)) e[fl & 12 ? 5 : 4]++; } }
      for (let q = 0; q < n; q++) {
        const j = map[q]; if (j < 0) continue;
        const o3 = k3 + j * 3, o2 = k2 + j * 2;
        P3[o3] = PX[q]; P3[o3 + 1] = PY[q]; P3[o3 + 2] = PZ[q];
        let nx = NX[q], ny = NY[q], nz = NZ[q]; const l = rock ? 0 : Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (rock) { nx = RN[3 * q]; ny = RN[3 * q + 1]; nz = RN[3 * q + 2]; } else if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = nf[0]; ny = nf[1]; nz = nf[2]; }
        if (!rock && !VF[q]) {
          let t = false;
          for (let k = 0; k < 4; k++) { const c = k < 2 ? VU[q] : VV[q]; if (Math.abs(c - LN[k]) < 1e-6) { const ng = NRM[LG[k]]; nx += LK[k] * ng[0]; ny += LK[k] * ng[1]; nz += LK[k] * ng[2]; t = true; } }
          if (t) { const L2 = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= L2; ny /= L2; nz /= L2; }
        }
        N3[o3] = nx; N3[o3 + 1] = ny; N3[o3 + 2] = nz;
        // the picture as laid on the flat face (a skirt's points as if the face went on)
        p3[I.k] = I.pl; p3[I.a] = VU[q]; p3[I.v] = VV[q];
        if (VF[q] & 16) { const i = skL.get(q), g = SKO[i + 3], L = SKO[i + 2], ng = NRM[g]; p3[0] += ng[0] * L; p3[1] += ng[1] * L; p3[2] += ng[2] * L; }
        const x = p3[0], y = p3[1], z = p3[2];
        let U, V;
        if (f === 0) { U = -z; V = y; } else if (f === 1) { U = z; V = y; } else if (f === 2) { U = x; V = -z; } else if (f === 3) { U = x; V = z; } else if (f === 4) { U = x; V = y; } else { U = -x; V = y; }
        U2[o2] = U * s + ou; U2[o2 + 1] = V * s + ov;
        let g = 1; if (grad) g = 0.62 + 0.38 * Math.min(1, Math.max(0, (y - yb) / 2.6));
        shade(X, I, q, x, y, z, e3);
        C3[o3] = tint[0] * g * e3[0]; C3[o3 + 1] = tint[1] * g * e3[1]; C3[o3 + 2] = tint[2] * g * e3[2];
        // how far the drawn point lies off the box (outside it, or within it under its own face)
        const px = PX[q], py = PY[q], pz = PZ[q];
        const out = !st || (VF[q] & 16) ? 0 : Math.max(lo[0] - px, px - hi[0], lo[1] - py, py - hi[1], lo[2] - pz, pz - hi[2], 0);
        const inn = !st || (VF[q] & 16) ? 0 : -((px - x) * nf[0] + (py - y) * nf[1] + (pz - z) * nf[2]);
        if (st) { st.pts++; if (out > st.out) st.out = out; if (inn > st.in) st.in = inn; if (out > 0.02) st.o2++; if (out > 0.05) st.o5++; if (out > 0.15) st.o15++; }
        if (!(VF[q] & 16)) { if (px < X.dlo[0]) X.dlo[0] = px; if (py < X.dlo[1]) X.dlo[1] = py; if (pz < X.dlo[2]) X.dlo[2] = pz; } // (a skirt lies inside the next box: not of the shape)
        if (!(VF[q] & 16)) { if (px > X.dhi[0]) X.dhi[0] = px; if (py > X.dhi[1]) X.dhi[1] = py; if (pz > X.dhi[2]) X.dhi[2] = pz; }
      }
      G0.p.length = G0.n.length = G0.c.length = k3 + m * 3; G0.u.length = k2 + m * 2;
      const I1 = G0.i.need(w); let ki = G0.i.length;
      for (let t = 0; t < w; t++) I1[ki++] = base + map[TRI[t]];
      G0.i.length = ki;
      SKO.length = 0;
    }
    // the colour of a point (as a factor on the material's): mottling, damp at the foot, rain, the shadow of an inside corner, moss
    function shade(X, I, q, x, y, z, out) {
      const C = X.C, k = I.k, nf = NRM[I.f], kind = X.b.kind;
      const na = NA[q], nb = NB[q];
      let m = 1 + 0.07 * (2 * nb - 1) + 0.04 * (2 * na - 1);
      const hw = 2 * na - 1;
      let r = 1 + 0.025 * hw, g = 1, b = 1 - 0.025 * hw;
      if (k !== 1) {
        // the floor in front of it: damp and earth at the foot
        let fy = floorUnder(C, x + nf[0] * 0.55, y, z + nf[2] * 0.55);
        if (fy === -Infinity && !C.world) fy = X.lo[1];
        const h = y - fy;
        if (h < 2) {
          const d = 1 - sst(0, 0.45 + 0.55 * na, h);
          m *= 1 - 0.1 * d; g *= 1 - 0.02 * d; b *= 1 - 0.06 * d;
        }
        if (C.outdoor && kind !== 'wood') {
          // rain runs down from the top: streaks, more under an open top
          const u = I.a === 0 ? x : z;
          const tw = X.F[2].hid ? 0.35 : 0.35 + 0.65 * Math.exp(-(X.hi[1] - y) / 2.4);
          const s = sst(0.55, 0.82, vn(u * 3.4 + I.pl * 1.7, y * 0.3, I.pl * 0.9)) * tw;
          m *= 1 - 0.12 * s;
          // moss where the sun does not come, most near the ground
          const sh = C.sun ? (nf[0] * C.sun[0] + nf[2] * C.sun[2] < 0.1 ? 1 : 0.25) : 0.5;
          const ms = sst(0.55, 0.8, na) * sh * (h < 1.4 ? 1 : 0.35);
          r *= 1 - 0.07 * ms; b *= 1 - 0.11 * ms; m *= 1 - 0.04 * ms;
        }
      } else if (I.sg > 0 && C.outdoor && kind !== 'wood') {
        const ms = sst(0.6, 0.82, na) * 0.6;
        r *= 1 - 0.06 * ms; b *= 1 - 0.1 * ms;
      }
      // the shadow of an inside corner: near what lies against this face, and near an edge where the box runs into something
      let dmin = 9;
      const L = I.ix ? I.ix.near[cellOf(I.ix, VU[q], VV[q])] : null, nL = L ? L.length : I.rects.length;
      for (let n = 0; n < nL; n++) {
        const rc = I.rects[L ? L[n] : n];
        if (rc[5] === 0 && rc[4] < 0.05) continue;
        const du = VU[q] < rc[0] ? rc[0] - VU[q] : VU[q] > rc[1] ? VU[q] - rc[1] : 0, dv = VV[q] < rc[2] ? rc[2] - VV[q] : VV[q] > rc[3] ? VV[q] - rc[3] : 0;
        const d = Math.max(du, dv); if (d < dmin) dmin = d;
      }
      if (dmin < 1) m *= 1 - 0.13 * Math.exp(-dmin / 0.22);
      out[0] = Math.min(1.12, Math.max(0.8, m * r)); out[1] = Math.min(1.12, Math.max(0.8, m * g)); out[2] = Math.min(1.12, Math.max(0.8, m * b));
    }
    return F;
  })();
  G.FineShape = Fine;

  // the box and the sphere about a shape's points, as three.js computes them (the box's centre, the farthest point from it), in plain loops
  function bound(g) {
    const a = g.attributes.position.array, n = a.length;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const bb = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), c = bb.getCenter(new THREE.Vector3());
    let r2 = 0; for (let i = 0; i < n; i += 3) { const dx = c.x - a[i], dy = c.y - a[i + 1], dz = c.z - a[i + 2], d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
    g.boundingBox = bb; g.boundingSphere = new THREE.Sphere(c, Math.sqrt(r2));
  }

  class Batch {
    constructor() { this.g = {}; }
    _grp(k) { return this.g[k] || (this.g[k] = { p: new Grow(Float32Array), n: new Grow(Float32Array), u: new Grow(Float32Array), c: new Grow(Float32Array), i: new Grow(Uint32Array) }); }
    // world-space UV box. o: {uv: meters per repeat, tint: [r,g,b], grad: bool, skip: {top,bottom,...}, flat: drawn as a plain box}
    // On medium / high quality, stone, rock and wood are kept until build and worked there (Fine, above); every opaque box is kept as
    // something that may hide a face laid against it
    box(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      if (this.fine === undefined) this.fine = Fine.on();
      if (this.fine) {
        const lx = Math.min(x0, x1), ly = Math.min(y0, y1), lz = Math.min(z0, z1), hx = Math.max(x0, x1), hy = Math.max(y0, y1), hz = Math.max(z0, z1);
        const kind = Fine.kindOf(mk, hx - lx, hy - ly, hz - lz, o);
        let oi = -1;
        if (Fine.OPAQ.has(mk)) { const q = this.occ || (this.occ = []); oi = q.length / 7; q.push(lx, ly, lz, hx, hy, hz, kind === 'rock' ? 2 : kind ? 1 : 0); }
        if (kind) {
          // (what of o is needed later, copied: a caller may change its object after)
          const k = { uv: o.uv, tint: o.tint ? o.tint.slice() : null, grad: o.grad, gradBase: o.gradBase, uo: o.uo, vo: o.vo, skip: o.skip ? Object.assign({}, o.skip) : null };
          (this.bx || (this.bx = [])).push({ mk, kind, lo: [lx, ly, lz], hi: [hx, hy, hz], o: k, oi });
          return;
        }
      }
      this.flat(mk, x0, y0, z0, x1, y1, z1, o);
    }
    flat(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      const G0 = this._grp(mk);
      const s = 1 / (o.uv || 2);
      const tint = o.tint || [1, 1, 1];
      const grad = o.grad !== false;
      const yb = o.gradBase ?? Math.min(0, y0);
      const ou = o.uo || 0, ov = o.vo || 0;
      const F = (pts, nx, ny, nz, uvf) => {
        const base = G0.p.length / 3;
        for (const p of pts) {
          G0.p.push(p[0], p[1], p[2]); G0.n.push(nx, ny, nz);
          const uv = uvf(p); G0.u.push(uv[0] * s + ou, uv[1] * s + ov);
          let f = 1;
          if (grad) f = 0.62 + 0.38 * Math.min(1, Math.max(0, (p[1] - yb) / 2.6));
          G0.c.push(tint[0] * f, tint[1] * f, tint[2] * f);
        }
        G0.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      const sk = o.skip || {};
      if (!sk.px) F([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1, 0, 0, (p) => [-p[2], p[1]]);
      if (!sk.nx) F([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], -1, 0, 0, (p) => [p[2], p[1]]);
      if (!sk.pz) F([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1, (p) => [p[0], p[1]]);
      if (!sk.nz) F([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, -1, (p) => [-p[0], p[1]]);
      if (!sk.top) F([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 0, 1, 0, (p) => [p[0], -p[2]]);
      if (!sk.bottom) F([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0, (p) => [p[0], p[2]]);
    }
    // arbitrary geometry with transform matrix
    geo(mk, geo, mat, o) {
      o = o || {};
      const G0 = this._grp(mk);
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const base = G0.p.length / 3;
      // the shapes of the props run to thousands of vertices each and an area sets down a million or more: read the plain arrays and do the
      // sums of Vector3.applyMatrix4 / applyMatrix3 / normalize in place (the same operations in the same order, so the same numbers)
      const plain = (a) => !a || (!a.isInterleavedBufferAttribute && !a.normalized && a.array);
      if (plain(pos) && plain(nor) && plain(uv) && pos.itemSize === 3 && nor.itemSize === 3 && (!uv || uv.itemSize === 2)) {
        const pa = pos.array, na = nor.array, ua = uv ? uv.array : null, e = mat.elements, nm = new THREE.Matrix3().getNormalMatrix(mat).elements;
        const tint = o.tint || [1, 1, 1], t0 = tint[0], t1 = tint[1], t2 = tint[2];
        const su = o.su || 1, sv = o.sv || 1;
        const yb = o.gradBase ?? -999;
        const cnt = pos.count, P3 = G0.p.need(cnt * 3), N3 = G0.n.need(cnt * 3), U2 = G0.u.need(cnt * 2), C3 = G0.c.need(cnt * 3);
        let k3 = G0.p.length, k2 = G0.u.length;
        for (let i = 0; i < cnt; i++, k3 += 3, k2 += 2) {
          const i3 = i * 3, x = pa[i3], y = pa[i3 + 1], z = pa[i3 + 2];
          const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
          const vx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w, vy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, vz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
          const ax = na[i3], ay = na[i3 + 1], az = na[i3 + 2];
          let nx = nm[0] * ax + nm[3] * ay + nm[6] * az, ny = nm[1] * ax + nm[4] * ay + nm[7] * az, nz = nm[2] * ax + nm[5] * ay + nm[8] * az;
          const k = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= k; ny *= k; nz *= k;
          P3[k3] = vx; P3[k3 + 1] = vy; P3[k3 + 2] = vz; N3[k3] = nx; N3[k3 + 1] = ny; N3[k3 + 2] = nz;
          if (ua) { U2[k2] = ua[i * 2] * su; U2[k2 + 1] = ua[i * 2 + 1] * sv; } else { U2[k2] = vx * 0.5; U2[k2 + 1] = vy * 0.5; }
          let f = 1;
          if (yb > -999) f = 0.62 + 0.38 * Math.min(1, Math.max(0, (vy - yb) / 2.6));
          C3[k3] = t0 * f; C3[k3 + 1] = t1 * f; C3[k3 + 2] = t2 * f;
        }
        G0.p.length = G0.n.length = G0.c.length = k3; G0.u.length = k2;
        const nI = geo.index ? geo.index.array.length : cnt, I1 = G0.i.need(nI); let ki = G0.i.length;
        if (geo.index) { const ix = geo.index.array; for (let i = 0; i < nI; i++) I1[ki++] = base + ix[i]; }
        else for (let i = 0; i < cnt; i++) I1[ki++] = base + i;
        G0.i.length = ki;
        return;
      }
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      const nm = new THREE.Matrix3().getNormalMatrix(mat);
      const tint = o.tint || [1, 1, 1];
      const su = o.su || 1, sv = o.sv || 1;
      const yb = o.gradBase ?? -999;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        G0.p.push(v.x, v.y, v.z); G0.n.push(n.x, n.y, n.z);
        if (uv) G0.u.push(uv.getX(i) * su, uv.getY(i) * sv); else G0.u.push(v.x * 0.5, v.y * 0.5);
        let f = 1;
        if (yb > -999) f = 0.62 + 0.38 * Math.min(1, Math.max(0, (v.y - yb) / 2.6));
        G0.c.push(tint[0] * f, tint[1] * f, tint[2] * f);
      }
      if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) G0.i.push(base + ix[i]); }
      else for (let i = 0; i < pos.count; i++) G0.i.push(base + i);
    }
    // world (optional): the area these boxes are of; its reach decides what is worked finely, and it keeps the bounds of what was drawn
    build(mats, parent, shadows, world) {
      if (this.bx) Fine.shape(this, world, mats);
      this.occ = null;
      const out = [];
      for (const k in this.g) {
        const d = this.g[k];
        if (!d.p.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(d.p.out(), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(d.n.out(), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(d.u.out(), 2));
        g.setAttribute('color', new THREE.BufferAttribute(d.c.out(), 3));
        const ix = d.i.a.subarray(0, d.i.length);
        g.setIndex(d.p.length / 3 > 65535 ? new THREE.BufferAttribute(ix.slice(), 1) : new THREE.BufferAttribute(Uint16Array.from(ix), 1));
        bound(g);
        const m = new THREE.Mesh(g, mats.vc ? (mats.vc[k] || mats.vc.wall) : (mats[k] || mats.wall));
        m.castShadow = shadows !== false && k !== 'water' && k !== 'lava' && k !== 'web' && k !== 'vine';
        m.receiveShadow = true;
        m.matrixAutoUpdate = false; m.updateMatrix();
        parent.add(m); out.push(m);
      }
      this.g = {};
      return out;
    }
  }
  G.Batch = Batch;

  // ---------------- world ----------------
  const TERR_M = 0.8; // (while the player moves: how far under the drawn surface of a terrain its column's top may stand; the queries reach down by it)
  class World {
    constructor(W, D, biome) {
      this.W = W; this.D = D; this.biome = biome; this.zo = 0; this.Dn = D; this.xo = 0; this.Wn = W;
      this.mats = G.Tex.materials(biome);
      this.batch = new Batch();
      this.colliders = [];
      this.hash = new Map();
      this.stamp = 0;
      this.group = new THREE.Group();
      this.deferred = [];
      this.lightSources = [];
      this.interactables = [];
      this.destructibles = [];
      this.triggers = [];
      this.animated = [];
      this.waterZones = [];
      this.visBoxes = []; // (the drawn-only boxes, w.visual: what may hide a sign hung in the air, areas.js AR.signY)
      this.lavaZones = [];
      this.hazards = [];
      this.spawn = { x: W / 2, y: 0, z: D - 4, yaw: 0 };
      this.enemySpawns = [];
      this.pitY = -40;
      this.killY = -9;
    }
    // ---- colliders ----
    _hkey(cx, cz) { return (cx + 64) * 4096 + (cz + 64); }
    addCollider(x0, y0, z0, x1, y1, z1, o) {
      const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), surf: (o && o.surf) || 'stone', noGrapple: !!(o && o.noGrapple), dest: (o && o.dest) || null, alive: true, st: 0, idx: this.colliders.length, tag: o && o.tag };
      this.colliders.push(c);
      const ax = Math.floor(c.x0 / CS), bx = Math.floor(c.x1 / CS), az = Math.floor(c.z0 / CS), bz = Math.floor(c.z1 / CS);
      for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
        const k = this._hkey(cx, cz);
        let a = this.hash.get(k); if (!a) { a = []; this.hash.set(k, a); }
        a.push(c);
      }
      return c;
    }
    removeCollider(c) { c.alive = false; }
    // a round thing standing at (x, z), radius r, from y0 to y1: two boxes in a cross (a square round it would stand out of it at its
    // corners, one inside it would let you walk into its sides); returns both
    roundCollider(x, z, r, y0, y1, o) {
      return [this.addCollider(x - r * 0.92, y0, z - r * 0.5, x + r * 0.92, y1, z + r * 0.5, o), this.addCollider(x - r * 0.5, y0, z - r * 0.92, x + r * 0.5, y1, z + r * 0.92, o)];
    }
    // an invisible wall from y0 up into the sky over x0..x1 / z0..z1: the rock that bounds an area (the rim round a shaft, crags, canyon
    // walls) can't be stood on or climbed over. Like the anti-perch columns (levelgen fireTops), shots, sight and the grapple pass
    // through it (the rock's face below still holds the hook); the nav grid doesn't see it (the rock's top was no way for monsters anyway)
    skyCap(x0, y0, z0, x1, z1) {
      if (x1 - x0 < 0.001 || z1 - z0 < 0.001) return null;
      const c = this.addCollider(x0, y0, z0, x1, World.SKY_Y, z1, { noGrapple: true });
      c.ghost = true; c.noFire = true; c.navIgnore = true; c.skyCap = true;
      return c;
    }
    // solid box = visible geometry + collider (the only way static solids are created => no invisible walls)
    solid(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      this.batch.box(mk, x0, y0, z0, x1, y1, z1, o);
      const c = this.addCollider(x0, y0, z0, x1, y1, z1, { surf: o.surf || (mk.startsWith('wood') ? 'wood' : mk === 'iron' ? 'metal' : mk === 'ice' ? 'ice' : 'stone'), noGrapple: o.noGrapple, tag: o.tag });
      c.vis = true; c.mk = mk; if (this._gateFrame) c.gateFrame = true; // (drawn: it hides what is behind it; a bare addCollider is unseen. mk: what it is built of)
      return c;
    }
    visual(mk, x0, y0, z0, x1, y1, z1, o) { this.batch.box(mk, x0, y0, z0, x1, y1, z1, o); if (Math.abs(y1 - y0) <= 0.12 && Math.abs(x1 - x0) > 0.6 && Math.abs(z1 - z0) > 0.6 && !mk.startsWith('wood') && mk !== 'floor' && mk !== 'rug') (this.paved || (this.paved = [])).push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), Math.max(y0, y1)]);   // (paving laid over the ground: what a step on it sounds of, player.js surfaceBelow)
      if (this.visBoxes && !this._gateFrame && y1 - y0 > 0.02) this.visBoxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]); }
    query(x0, y0, z0, x1, y1, z1, out) {
      out = out || [];
      this.stamp++;
      const ax = Math.floor(x0 / CS), bx = Math.floor(x1 / CS), az = Math.floor(z0 / CS), bz = Math.floor(z1 / CS);
      for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
        const a = this.hash.get(this._hkey(cx, cz)); if (!a) continue;
        for (const c of a) {
          if (c.st === this.stamp || !c.alive) continue; c.st = this.stamp;
          if (c.enemyOnly && this.pp) continue; // this.pp: set while the player moves
          if (c.shotOnly) continue; // (something hanging in the air that only shots strike: a bell, a crucible; nobody walks into it)
          if (c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1 && c.z1 > z0 && c.z0 < z1) out.push(c);
        }
      }
      return out;
    }
    boxFree(x0, y0, z0, x1, y1, z1) {
      if (!this.pp) return this.query(x0, y0, z0, x1, y1, z1).length === 0;
      // (the player: a terrain's column is in the way only where its drawn surface is: under the box's middle, or a step and more above
      // the box's bottom beside it, see tTop)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const c of this.query(x0, y0 - TERR_M, z0, x1, y1, z1)) {
        if (!c.tg) { if (c.y1 > y0) return false; continue; }
        const inC = cx >= c.x0 && cx < c.x1 && cz >= c.z0 && cz < c.z1;
        if (this.tTop(c, cx, cz) > y0 + (inC ? 0.01 : 0.5)) return false;
      }
      return true;
    }
    // the drawn surface of a terrain's column (terrain.js T.surf) at the point of it nearest (x, z)
    tTop(c, x, z) {
      const s = G.Terrain.surf(c.tg, Math.min(c.x1 - 1e-4, Math.max(c.x0 + 1e-4, x)), Math.min(c.z1 - 1e-4, Math.max(c.z0 + 1e-4, z)));
      return s == null ? c.y1 : s;
    }
    floorBelow(x, y, z) {
      const a = this.query(x - 0.01, -60, z - 0.01, x + 0.01, y + 0.01, z + 0.01);
      let best = -100;
      for (const c of a) if (c.y1 <= y + 0.02 && c.y1 > best) best = c.y1;
      return best;
    }
    // ray vs world AABBs (2D DDA over hash cells). returns {t, point, normal, c} or null
    raycast(o, d, maxT, opts) {
      const st = ++this.stamp;
      let best = maxT, hit = null, hn = 0;
      let cx = Math.floor(o.x / CS), cz = Math.floor(o.z / CS);
      const sx = d.x > 0 ? 1 : d.x < 0 ? -1 : 0, sz = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
      const tdx = sx ? CS / Math.abs(d.x) : Infinity, tdz = sz ? CS / Math.abs(d.z) : Infinity;
      let tmx = sx > 0 ? ((cx + 1) * CS - o.x) / d.x : sx < 0 ? (cx * CS - o.x) / d.x : Infinity;
      let tmz = sz > 0 ? ((cz + 1) * CS - o.z) / d.z : sz < 0 ? (cz * CS - o.z) / d.z : Infinity;
      const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
      const filt = opts && opts.filter;
      let t = 0, guard = 0;
      const maxC = Math.ceil(Math.max(this.W, this.D) / CS) + 4;
      while (t <= best && guard++ < 200) {
        const a = this.hash.get(this._hkey(cx, cz));
        if (a) for (const c of a) {
          if (c.st === st || !c.alive) continue; c.st = st;
          if (c.enemyOnly) continue;
          if (c.ghost && !(opts && opts.ghost)) continue; // invisible anti-perch walls don't stop shots, sight or the grapple
          if (filt && !filt(c)) continue;
          if (c.bars && !(opts && opts.bars)) continue; // cell bars: shots and sight pass between them
          let t1 = (c.x0 - o.x) * ix, t2 = (c.x1 - o.x) * ix;
          let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
          t1 = (c.y0 - o.y) * iy; t2 = (c.y1 - o.y) * iy;
          let a1 = Math.min(t1, t2), a2 = Math.max(t1, t2);
          if (a1 > tmin) { tmin = a1; ax = 1; } if (a2 < tmax) tmax = a2;
          t1 = (c.z0 - o.z) * iz; t2 = (c.z1 - o.z) * iz;
          a1 = Math.min(t1, t2); a2 = Math.max(t1, t2);
          if (a1 > tmin) { tmin = a1; ax = 2; } if (a2 < tmax) tmax = a2;
          if (tmax >= Math.max(tmin, 0) && tmin >= 0 && tmin < best) { best = tmin; hit = c; hn = ax; }
        }
        if (tmx < tmz) { t = tmx; tmx += tdx; cx += sx; } else { t = tmz; tmz += tdz; cz += sz; }
        if (cx < -3 || cz < -3 || cx > maxC || cz > maxC) break;
        if (!sx && !sz) break;
      }
      if (!hit) return null;
      const n = new THREE.Vector3();
      if (hn === 0) n.x = -Math.sign(d.x); else if (hn === 1) n.y = -Math.sign(d.y); else n.z = -Math.sign(d.z);
      return { t: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: n, c: hit };
    }
    los(a, b) {
      const d = new THREE.Vector3().subVectors(b, a);
      const L = d.length(); if (L < 0.01) return true;
      d.divideScalar(L);
      return !this.raycast(a, d, L - 0.05);
    }

    // ---- kinematic AABB movement (player). pos = feet center.
    moveBox(pos, vel, dt, hw, h, st) {
      const EPS = 0.002, STEP = st.stepH ?? 0.5;
      const res = { hitWall: false, hitCeil: false, landed: false, stepped: 0 };
      const tmp = [];
      // While the player moves (this.pp) the ground of a terrain (its columns carry c.tg, terrain.js) is its drawn surface, not the stepped
      // tops of its columns: the feet follow the slope smoothly (the column under the middle lifts them onto it as it rises), a neighbour
      // column is passed over unless its surface stands more than a step above the feet (a drop: a wall). Everything else is as it was.
      const PP = this.pp, inC = (c) => pos.x >= c.x0 && pos.x < c.x1 && pos.z >= c.z0 && pos.z < c.z1;
      // horizontal axes
      for (const ax of ['x', 'z']) {
        const dv = vel[ax] * dt;
        if (dv === 0) continue;
        pos[ax] += dv;
        tmp.length = 0;
        this.query(pos.x - hw, pos.y + EPS - (PP ? TERR_M : 0), pos.z - hw, pos.x + hw, pos.y + h, pos.z + hw, tmp);
        for (const c of tmp) {
          if (PP && c.tg) {
            if (!(c.x1 > pos.x - hw && c.x0 < pos.x + hw && c.z1 > pos.z - hw && c.z0 < pos.z + hw && c.y0 < pos.y + h)) continue;
            const mid = inC(c), top = this.tTop(c, pos.x, pos.z), rise = top - pos.y;
            if (rise <= EPS) continue;
            if (mid && rise <= (st.canStep ? STEP : 0.3) && this.boxFree(pos.x - hw, top + EPS, pos.z - hw, pos.x + hw, top + h, pos.z + hw)) {
              pos.y = top + EPS * 0.5; if (rise > 0.3) res.stepped = Math.max(res.stepped, rise);
              continue;
            }
            if (!mid && rise <= STEP) continue;
          } else {
            // overlap still?
            if (!(c.x1 > pos.x - hw && c.x0 < pos.x + hw && c.y1 > pos.y + EPS && c.y0 < pos.y + h && c.z1 > pos.z - hw && c.z0 < pos.z + hw)) continue;
            const rise = c.y1 - pos.y;
            if (st.canStep && rise > 0 && rise <= STEP && this.boxFree(pos.x - hw, c.y1 + EPS, pos.z - hw, pos.x + hw, c.y1 + h, pos.z + hw)) {
              pos.y = c.y1 + EPS * 0.5; res.stepped = Math.max(res.stepped, rise);
              continue;
            }
          }
          if (dv > 0) pos[ax] = (ax === 'x' ? c.x0 : c.z0) - hw - EPS;
          else pos[ax] = (ax === 'x' ? c.x1 : c.z1) + hw + EPS;
          vel[ax] = 0; res.hitWall = true;
        }
      }
      // vertical
      const dy = vel.y * dt;
      pos.y += dy;
      tmp.length = 0;
      this.query(pos.x - hw + EPS, pos.y - (PP ? TERR_M : 0), pos.z - hw + EPS, pos.x + hw - EPS, pos.y + h, pos.z + hw - EPS, tmp);
      for (const c of tmp) {
        if (PP && c.tg) { // (only the column under the middle is the ground; it never stands over you)
          if (!inC(c)) continue;
          const top = this.tTop(c, pos.x, pos.z), up = top - pos.y;
          if (up > 0 && up <= (dy <= 0 ? Math.max(0.6, -dy + 0.05) : 0.3)) { pos.y = top; if (dy <= 0) { if (vel.y < 0) res.landed = true; vel.y = 0; } }
          continue;
        }
        if (!(c.y1 > pos.y && c.y0 < pos.y + h)) continue;
        if (dy <= 0 && c.y1 - pos.y <= Math.max(0.6, -dy + 0.05)) { pos.y = c.y1; if (vel.y < 0) res.landed = true; vel.y = 0; }
        else if (dy > 0) { pos.y = c.y0 - h - EPS; vel.y = 0; res.hitCeil = true; }
        else { // penetration from side while falling - push up if small, else leave to depenetrate
          if (c.y1 - pos.y < 0.6) { pos.y = c.y1; vel.y = 0; res.landed = true; }
        }
      }
      return res;
    }
    groundAt(pos, hw, maxDown) {
      // highest top under the footprint within maxDown below feet (while the player moves, a terrain's ground is its drawn surface under the middle)
      const PP = this.pp;
      const a = this.query(pos.x - hw + 0.003, pos.y - maxDown - (PP ? TERR_M : 0), pos.z - hw + 0.003, pos.x + hw - 0.003, pos.y + 0.01, pos.z + hw - 0.003);
      let best = -Infinity, terr = false;
      for (const c of a) {
        let top = c.y1;
        if (PP && c.tg) { if (!(pos.x >= c.x0 && pos.x < c.x1 && pos.z >= c.z0 && pos.z < c.z1)) continue; top = this.tTop(c, pos.x, pos.z); }
        if (top <= pos.y + 0.011 && top >= pos.y - maxDown - 1e-6 && top > best) { best = top; terr = !!(PP && c.tg); }
      }
      this.gTerr = terr; // (the ground found is a terrain's drawn surface: the feet are set right on it, player.js)
      return best;
    }
    // push out of any overlapping collider (safety net for spawn / teleports)
    depenetrate(pos, hw, h) {
      for (let iter = 0; iter < 6; iter++) {
        const a = this.query(pos.x - hw, pos.y + 0.01, pos.z - hw, pos.x + hw, pos.y + h, pos.z + hw);
        if (!a.length) return true;
        const c = a[0];
        const opts = [
          [c.y1 - pos.y, 'up'], [pos.x + hw - c.x0, 'nx'], [c.x1 - (pos.x - hw), 'px'], [pos.z + hw - c.z0, 'nz'], [c.z1 - (pos.z - hw), 'pz'],
        ].sort((p, q) => p[0] - q[0]);
        const [d, k] = opts[0];
        if (k === 'up') pos.y += d + 0.01; else if (k === 'nx') pos.x -= d + 0.01; else if (k === 'px') pos.x += d + 0.01; else if (k === 'nz') pos.z -= d + 0.01; else pos.z += d + 0.01;
      }
      return false;
    }

    // ---- nav grid (1m) ----
    // A world with storeys over storeys (this.navLayers > 1, the strata fields) keeps one nav node per walkable surface in a
    // cell: node = layer * N + cell, layers sorted bottom-up. Ordinary worlds have one layer, so node == cell as before.
    // navPadX / navPad (strata fields): extra nav columns / rows beyond the walls, for the barred rooms dug into them; column c is x = c - navPadX, row r is z = r - navPad.
    buildNav() {
      const xo = this.navPadX || 0, zo = this.navPad || 0, W = this.W + 2 * xo, D = this.D + 2 * zo;
      this.xo = xo; this.zo = zo; this.Wn = W; this.Dn = D;
      const N = W * D, LM = this.navLayers || 1;
      const per = [], perc = [];
      const tmp = [];
      let L = 1;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const cx = x - xo + 0.5, cz = z - zo + 0.5;
        tmp.length = 0;
        this.query(cx - 0.01, -60, cz - 0.01, cx + 0.01, 60, cz + 0.01, tmp);
        tmp.sort((a, b) => a.y0 - b.y0);
        let floor = -Infinity;
        const ts = [], cs = [];
        for (const c of tmp) {
          if (c.dest || c.navIgnore) continue;
          if (floor === -Infinity) { floor = c.y1; continue; }
          if (c.y0 <= floor + 0.8) floor = Math.max(floor, c.y1);
          else if (LM > 1) { ts.push(floor); cs.push(c.y0); floor = c.y1; }
        }
        if (floor > -Infinity || !ts.length) ts.push(floor);
        if (ts.length > LM) ts.length = LM;
        per.push(ts); perc.push(cs); if (ts.length > L) L = ts.length;
      }
      this.N = N; this.L = L;
      this.nf = new Float32Array(N * L).fill(-Infinity);
      this.nb = new Uint8Array(N * L).fill(1);
      this.nhz = L > 1 ? new Uint8Array(N * L) : null;
      this.nc = L > 1 ? new Float32Array(N * L).fill(1e9) : null; // the open air above each surface ends at nc (the underside of whatever is above it)
      this.npen = new Float32Array(N * L);
      this.aadj = null; this.ndistA = null;
      for (let i = 0; i < N; i++) {
        const ts = per[i], cx = (i % W) - xo + 0.5, cz = ((i / W) | 0) - zo + 0.5;
        for (let k = 0; k < ts.length; k++) {
          const n = k * N + i, floor = ts[k];
          this.nf[n] = floor;
          if (this.nc && k < perc[i].length) this.nc[n] = perc[i][k];
          if (floor === -Infinity) { this.nb[n] = 1; continue; }
          // blocked if something solid occupies body space near the cell center
          tmp.length = 0;
          this.query(cx - 0.32, floor + 0.85, cz - 0.32, cx + 0.32, floor + 1.9, cz + 0.32, tmp);
          this.nb[n] = tmp.some((c) => !c.navIgnore) ? 1 : 0; // a cell gate counts as open: monsters path through it (and batter it down)
          // strata: the lava trench and the roof are no place to walk or spawn
          if (L > 1 && this.navHazard && this.navHazard(cx, floor, cz)) { this.nb[n] = 1; this.nhz[n] = 1; }
        }
      }
      // iron bars (cell fronts) are thin enough to slip between two cell centres: block the cells on both sides of them
      this.nbk = null;
      for (const c of this.colliders) {
        if (!c.navBlock || c.alive === false) continue;
        this.nbk = this.nbk || new Uint8Array(N * L);
        for (let z = Math.floor(c.z0 + zo - 0.001); z <= Math.floor(c.z1 + zo - 0.001); z++) for (let x = Math.floor(c.x0 + xo + 0.001); x <= Math.floor(c.x1 + xo - 0.001); x++) {
          if (x < 0 || x >= W || z < 0 || z >= D) continue;
          for (let k = 0; k < L; k++) { const n = k * N + z * W + x; if (this.nf[n] > -Infinity && this.nf[n] > c.y0 - 0.3 && this.nf[n] < c.y1 - 1) { this.nb[n] = 1; this.nbk[n] = 1; } }
        }
      }
      // clearance penalty
      for (let n = 0; n < N * L; n++) {
        if (this.nf[n] === -Infinity) continue;
        const i = n % N, x = i % W, z = (i / W) | 0;
        let p = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) { p += 0.35; continue; }
          const b = this.land(n, zz * W + xx);
          if (b < 0) p += 0.35;
          else if (this.nb[b]) p += this.nhz && (this.nhz[b] || this.nf[b] < this.nf[n] - 2.6) ? 0.1 : 0.35;
          else if (this.L > 1 && this.nf[b] < this.nf[n] - 2.6) p += 0.1;
        }
        this.npen[n] = p;
      }
      this.ndist = new Float32Array(N * L).fill(Infinity);
      this.heap = new Int32Array(N * L * 8 + 16);
      this.hkey = new Float32Array(N * L * 8 + 16);
      // strata: the geometry of every step (which node you land on, if the height change is walkable) never changes,
      // so it is worked out once here, with the reverse edges the flow field walks (only blocking can change later)
      this.nadj = null;
      if (L > 1) {
        const NL = N * L, adj = new Int32Array(NL * 8).fill(-1), cnt = new Int32Array(NL + 1);
        for (let a = 0; a < NL; a++) {
          if (this.nf[a] === -Infinity) continue;
          const i = a % N, x = i % W, z = (i / W) | 0;
          for (let d = 0; d < 8; d++) {
            const xx = x + DIRS[d][0], zz = z + DIRS[d][1];
            if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
            const b = this.land(a, zz * W + xx);
            if (b < 0) continue;
            const dh = this.nf[b] - this.nf[a];
            if (dh > 0.8 || dh < -2.6) continue;
            if (dh < -0.8 && this.dropBarred(a, b, DIAG[d] ? this.land(a, z * W + xx) : -1, DIAG[d] ? this.land(a, zz * W + x) : -1)) continue;
            adj[a * 8 + d] = b; cnt[b + 1]++;
          }
        }
        for (let b = 0; b < NL; b++) cnt[b + 1] += cnt[b];
        const ra = new Int32Array(cnt[NL]), rd = new Uint8Array(cnt[NL]), fill = cnt.slice(0, NL);
        for (let a = 0; a < NL; a++) for (let d = 0; d < 8; d++) { const b = adj[a * 8 + d]; if (b >= 0) { const e = fill[b]++; ra[e] = a; rd[e] = d; } }
        this.nadj = adj; this.rs = cnt; this.ra = ra; this.rd = rd;
      }
    }
    // the ground changed after the area was built (a pillar fell): the floor and the blocked cells in x0..x1, z0..z1 are worked out again
    // exactly as buildNav does it, and the clearance penalty around them (single-storey areas only)
    navPatch(x0, z0, x1, z1) {
      // (a field of two layers that has things changing the ground, w.navRebuild: the whole grid is worked out again)
      if (this.nf && this.L !== 1 && this.navRebuild) { this.buildNav(); this._vn = null; return; }
      if (!this.nf || this.L !== 1) return;
      const W = this.Wn, D = this.Dn, xo = this.xo, zo = this.zo, tmp = [];
      const ax = Math.max(0, Math.floor(x0) + xo), bx = Math.min(W - 1, Math.floor(x1) + xo), az = Math.max(0, Math.floor(z0) + zo), bz = Math.min(D - 1, Math.floor(z1) + zo);
      for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
        const i = z * W + x, cx = x - xo + 0.5, cz = z - zo + 0.5;
        tmp.length = 0;
        this.query(cx - 0.01, -60, cz - 0.01, cx + 0.01, 60, cz + 0.01, tmp);
        tmp.sort((a, b) => a.y0 - b.y0);
        let floor = -Infinity;
        for (const c of tmp) {
          if (c.dest || c.navIgnore) continue;
          if (floor === -Infinity) { floor = c.y1; continue; }
          if (c.y0 <= floor + 0.8) floor = Math.max(floor, c.y1);
        }
        this.nf[i] = floor;
        if (floor === -Infinity) { this.nb[i] = 1; continue; }
        tmp.length = 0;
        this.query(cx - 0.32, floor + 0.85, cz - 0.32, cx + 0.32, floor + 1.9, cz + 0.32, tmp);
        this.nb[i] = tmp.some((c) => !c.navIgnore) || (this.nbk && this.nbk[i]) ? 1 : 0;
      }
      for (let z = Math.max(0, az - 1); z <= Math.min(D - 1, bz + 1); z++) for (let x = Math.max(0, ax - 1); x <= Math.min(W - 1, bx + 1); x++) {
        const n = z * W + x; if (this.nf[n] === -Infinity) continue;
        let p = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) { p += 0.35; continue; }
          if (this.nf[zz * W + xx] === -Infinity || this.nb[zz * W + xx]) p += 0.35;
        }
        this.npen[n] = p;
      }
    }
    // the node you end up on stepping from node a into cell cb (the highest surface no more than a step above you); -1: none
    land(a, cb) {
      if (this.L === 1) return cb;
      const N = this.N, fa = this.nf[a];
      let best = -1, bf = -Infinity;
      for (let k = 0; k < this.L; k++) { const n = k * N + cb, f = this.nf[n]; if (f === -Infinity) break; if (f <= fa + 0.8 && f > bf) { bf = f; best = n; } }
      return best;
    }
    // y (optional): the surface at or just below that height (strata); without it, the lowest one
    navIdx(x, z, y) {
      const xi = Math.floor(x) + this.xo, zi = Math.floor(z) + this.zo; if (xi < 0 || zi < 0 || xi >= this.Wn || zi >= this.Dn) return -1;
      const i = zi * this.Wn + xi;
      if (this.L > 1 && y !== undefined) {
        let best = i;
        for (let k = 1; k < this.L; k++) { const n = k * this.N + i, f = this.nf[n]; if (f === -Infinity || f > y + 0.6) break; best = n; }
        return best;
      }
      return i;
    }
    // movement limits at (z, y): the area itself, plus the barred rooms dug into the west / east walls (strata fields); returns [xlo, xhi]
    xLimits(z, y, r) {
      let lo = r, hi = this.W - r;
      if (this.nooks) for (const n of this.nooks) if (z > n.a0 - 0.2 && z < n.a1 + 0.2 && y > n.y0 - 1.2 && y < n.y1 + 1) { if (n.side === 'W') lo = Math.min(lo, n.lo + r); else hi = Math.max(hi, n.hi - r); }
      return [lo, hi];
    }
    // prison bars (or a shut cell gate) between a and b on the same storey? Sight and shots pass through them, a walker does not:
    // it has to go round through the doorway (and batter a shut gate down) instead of heading straight at you
    barsBetween(a, b) {
      if (this.doors && this.doors.length) {
        for (const d of this.doors) {
          if (d.state !== 'closed' || Math.abs(a.y - d.y) > 2) continue;
          const t = (d.plane - a.x) / ((b.x - a.x) || 1e-6); if (t < 0 || t > 1) continue;
          const z = a.z + (b.z - a.z) * t; if (z > d.lo - 0.1 && z < d.hi + 0.1) return true;
        }
      }
      if (!this.nbk) return false;
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
      for (let i = 1; i < n; i++) {
        const k = i / n, x = a.x + dx * k, z = a.z + dz * k, idx = this.navIdx(x, z, a.y);
        if (idx >= 0 && this.nbk[idx]) return true;
      }
      return false;
    }
    // ---- air routes for flyers (strata fields) ----
    // A surface node's open air runs from its floor up to nc. Two nodes of neighbouring cells connect if their air overlaps by a flyer's height,
    // so a flyer can cross the chasm (open air at every height) and slip between the storeys, but never through a slab.
    airOK(a, b) {
      if (this.nf[a] > this.airMaxY || this.nf[b] > this.airMaxY) return false;
      return Math.min(this.nc[a], this.nc[b]) - Math.max(this.nf[a], this.nf[b]) - 0.2 >= 1.8;
    }
    // the height a flyer can cross at from node a to its neighbour b: the tallest gap, within the air the two share, that nothing stands in
    // along the line between the two cell centres. The floors and ceilings alone took a thin wall for air (it holds no cell centre), and the
    // route then ran a flyer in a room straight at the wall, where it stayed. near: what stands in a's air about its cell. Sets g.lo / g.hi
    // (the band to fly in on that way); false if nothing a flyer's height is left
    airGap(a, b, near, g) {
      const lo = Math.max(this.nf[a], this.nf[b]) + 0.4, hi = Math.min(this.nc[a], this.nc[b]) - 0.3;
      g.lo = lo; g.hi = hi;
      if (!near.length) return true;
      const W = this.Wn, N = this.N, ia = a % N, ib = b % N;
      const ax = ia % W - this.xo + 0.5, az = ((ia / W) | 0) - this.zo + 0.5, dx = ib % W - ia % W, dz = ((ib / W) | 0) - ((ia / W) | 0);
      const hit = this._agH || (this._agH = []); hit.length = 0;
      for (const c of near) {
        if (c.y1 + 0.25 <= lo || c.y0 - 0.15 >= hi) continue;
        // the stretch of the line a -> b that runs through the box, in plan. Only what the line crosses counts: a wall it runs beside
        // (a cell centre a hand from a wall) is no bar, the body slides along that, and neither is one it only touches at an end. A line along
        // the seam of two boxes, or through the point where two corners meet, is barred: it would slip between them
        let t0 = 0, t1 = 1;
        if (dx) { let u = (c.x0 - ax) / dx, v = (c.x1 - ax) / dx; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
        else if (ax < c.x0 || ax > c.x1) continue;
        if (dz) { let u = (c.z0 - az) / dz, v = (c.z1 - az) / dz; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
        else if (az < c.z0 || az > c.z1) continue;
        if (t0 <= t1 && t1 > 0 && t0 < 1) hit.push(c);
      }
      if (!hit.length) return true;
      // climb from lo to hi over what is in the way (a little clear of each top and underside), keeping the tallest gap met
      let cur = lo, glo = lo, ghi = lo;
      for (let n = 0; n < 64 && cur < hi; n++) {
        let up = cur, nxt = hi;
        for (const c of hit) { const c0 = c.y0 - 0.15, c1 = c.y1 + 0.25; if (c1 <= cur) continue; if (c0 <= cur) { if (c1 > up) up = c1; } else if (c0 < nxt) nxt = c0; }
        if (up > cur) { cur = up; continue; }
        if (nxt - cur > ghi - glo) { glo = cur; ghi = nxt; }
        cur = nxt;
      }
      hit.length = 0;
      if (ghi - glo < 1.3) return false; // (as narrow as the narrowest band airOK lets through)
      g.lo = glo; g.hi = ghi; return true;
    }
    buildAir() {
      const W = this.Wn, D = this.Dn, N = this.N, L = this.L, NL = N * L, nf = this.nf, nc = this.nc;
      const cnt = new Int32Array(NL + 1), fs = new Int32Array(NL + 1), near = [], g = { lo: 0, hi: 0 };
      // the air a flyer may not be in (E.airOk: over the middle of a house nobody can get into, the rock round a tunnel) is no way either:
      // a route across it ran the flyer up against that border, and there it stayed for good
      const am = G.enemies && G.enemies.airMask ? G.enemies.airMask() : null, okc = am ? am.ok : null;
      // the ways out, in the order of the nodes they leave, with the band of each (the arrays grow as needed)
      let cap = this._airCap || NL * 5 + 64, ne = 0;
      let fb = new Int32Array(cap), fd = new Uint8Array(cap), flo = new Float32Array(cap), fhi = new Float32Array(cap);
      for (let a = 0; a < NL; a++) {
        fs[a] = ne;
        if (nf[a] === -Infinity || nf[a] > this.airMaxY) continue;
        const i = a % N, x = i % W, z = (i / W) | 0, cx = x - this.xo + 0.5, cz = z - this.zo + 0.5;
        if (okc && !okc[i]) continue;
        // what stands in this node's air about its cell (its own floor and ceiling are not in it): the ways out of it are tested against these
        near.length = 0; this.query(cx - 1.05, nf[a] + 0.15, cz - 1.05, cx + 1.05, nc[a] - 0.15, cz + 1.05, near);
        let m = 0; for (let j = 0; j < near.length; j++) if (!near[j].navIgnore) near[m++] = near[j];
        near.length = m;
        for (let d = 0; d < 8; d++) {
          const xx = x + DIRS[d][0], zz = z + DIRS[d][1];
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
          const cb = zz * W + xx;
          if (okc && !okc[cb]) continue;
          for (let k = 0; k < L; k++) {
            const b = k * N + cb; if (nf[b] === -Infinity) break;
            if (!this.airOK(a, b)) continue;
            // (nothing stands about the cell: the whole of the air the two share)
            if (!m) { g.lo = Math.max(nf[a], nf[b]) + 0.4; g.hi = Math.min(nc[a], nc[b]) - 0.3; } else if (!this.airGap(a, b, near, g)) continue;
            if (ne === cap) {
              cap *= 2; const o = [fb, fd, flo, fhi];
              fb = new Int32Array(cap); fd = new Uint8Array(cap); flo = new Float32Array(cap); fhi = new Float32Array(cap);
              fb.set(o[0]); fd.set(o[1]); flo.set(o[2]); fhi.set(o[3]);
            }
            fb[ne] = b; fd[ne] = d; flo[ne] = g.lo; fhi[ne] = g.hi; ne++; cnt[b + 1]++;
          }
        }
      }
      fs[NL] = ne; this._airCap = ne + 256;
      for (let b = 0; b < NL; b++) cnt[b + 1] += cnt[b];
      // rs/ra/rd: the ways into each node (the distance field walks them back from the target); fs/fb/fd: the ways out, with the band of each
      const ra = new Int32Array(ne), rd = new Uint8Array(ne), fill = cnt.slice(0, NL);
      for (let a = 0; a < NL; a++) for (let e = fs[a], e1 = fs[a + 1]; e < e1; e++) { const q = fill[fb[e]]++; ra[q] = a; rd[q] = fd[e]; }
      this.aadj = { rs: cnt, ra, rd, fs, fb, fd, flo, fhi };
    }
    // the flyers' ways, worked out as the area loads (left to the first flyer's first look for a way, they were a hitch at the start of the fight)
    warmAir() {
      if (!this.nc || this.aadj) return;
      if (this.airMaxY === undefined) this.airMaxY = (this.strata ? this.strata.HT : 1e9) - 1;
      this.buildAir(); this.ndistA = new Float32Array(this.N * this.L);
    }
    // flyers' distance field towards (tx, tz, ty); stops as soon as every wanted node (the flyers' own) is settled
    updateAirFlow(tx, tz, ty, wanted) {
      if (!this.nc) return false;
      if (!this.aadj) this.warmAir();
      let t = this.navIdx(tx, tz, ty); if (t < 0) return false;
      const dist = this.ndistA; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      const want = new Set(wanted || []); let left = want.size;
      const { rs, ra, rd } = this.aadj;
      dist[t] = 0; push(t, 0);
      let pops = 0, stopAt = Infinity;
      while (hn > 0 && pops++ < this.N * this.L * 4) {
        const kTop = hk[0], b = pop();
        if (kTop > dist[b]) continue;
        // keep going a good way past the last flyer: it moves several metres before the next update and must not step onto cells with no distance yet
        if (kTop > stopAt) break;
        if (want.has(b)) { want.delete(b); if (--left <= 0) stopAt = kTop + 12; }
        for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
          const a = ra[e], nd = dist[b] + (DIAG[rd[e]] ? 1.414 : 1);
          if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
        }
      }
      return true;
    }
    // the way on for a flyer at (x, y, z): direction (out.x, out.z) and the altitude band [out.lo, out.hi] to fly in; null if there is no route
    airDir(x, z, y, out) {
      if (!this.ndistA) return null;
      const i = this.navIdx(x, z, y); if (i < 0 || this.ndistA[i] === Infinity) return null;
      // over the ceiling of the highest floor there (on a roof no storey of the grid stands for): not in that node's air, and its ways and
      // its band are not for this body (taking them, a flyer on a roof sank into it, making for the room under it)
      if (y > this.nc[i]) return null;
      const A = this.aadj, dist = this.ndistA;
      let best = dist[i], be = -1;
      for (let e = A.fs[i], e1 = A.fs[i + 1]; e < e1; e++) if (dist[A.fb[e]] < best) { best = dist[A.fb[e]]; be = e; }
      if (be < 0) return null;
      // towards the next cell's centre: the way was tested along the line between the centres (a doorway is open there, its jambs stand beside it)
      const ic = i % this.N, dr = DIRS[A.fd[be]];
      out.x = ic % this.Wn - this.xo + dr[0] + 0.5 - x; out.z = ((ic / this.Wn) | 0) - this.zo + dr[1] + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      out.lo = A.flo[be]; out.hi = A.fhi[be];
      return out;
    }
    // the altitude band of the air a flyer at (x, y, z) is in
    airBand(x, z, y, out) {
      const i = this.navIdx(x, z, y); if (i < 0 || !this.nc || y > this.nc[i]) return null;
      out.lo = this.nf[i] + 0.4; out.hi = this.nc[i] - 0.3; return out;
    }
    // the surface of the deep water over node a (its floor under it), or -Infinity
    deepTop(a) {
      const i = a % this.N, x = (i % this.Wn) - (this.xo || 0) + 0.5, z = Math.floor(i / this.Wn) - (this.zo || 0) + 0.5;
      for (const q of this.deepWater) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && this.nf[a] < q.y - 0.6) return q.y;
      return -Infinity;
    }
    navFloor(x, z, y) { const i = this.navIdx(x, z, y); return i < 0 ? -Infinity : this.nf[i]; }
    // a drop from a down to b that a body can't take: it leaves a at a's height, and what is over b (the slab of an upper floor) stands
    // there at head height, a wall to it. The routes took the height change alone: off the upper steps of a stair that runs beside an upper
    // floor they sent foes sideways into the slab's edge, and one that had stepped onto the slab was turned back and forth on its rim
    // (c1, c2: the two cells beside a diagonal drop; it goes by their corner, so the higher of their floors may be underfoot there)
    dropBarred(a, b, c1, c2) {
      if (!this.nc) return false;
      let f = this.nf[a]; if (this.nf[b] - f >= -0.8) return false;
      if (c1 >= 0 && this.nf[c1] > f) f = this.nf[c1];
      if (c2 >= 0 && this.nf[c2] > f) f = this.nf[c2];
      return this.nc[b] < f + 1.9;
    }
    // (x, y, z) stands on the rim of something that ends part-way into its cell (the edge of an upper floor's slab beside a stair): the
    // cell's centre, and so the grid, holds only the surface far below, and that surface's route turned a foe on the rim back and forth.
    // The way off the rim is to the cell's centre: sets out to it. null where the grid holds what it stands on, or the centre has a
    // floor at this height too (something the grid leaves out), or can't be stood in, or is under deep water (a foe risen up the water is
    // climbing out onto what it is beside, canStep: turned back to the centre it sank, rose and was turned back again, for good)
    rimDir(x, z, y, out) {
      if (this.L === 1) return null;
      const i = this.navIdx(x, z, y); if (i < 0 || this.nb[i] || y - this.nf[i] <= 0.8) return null;
      if (this.deepWater && this.deepTop(i) > -Infinity) return null;
      const ic = i % this.N, cx = ic % this.Wn - this.xo + 0.5, cz = ((ic / this.Wn) | 0) - this.zo + 0.5;
      const q = this._rimQ || (this._rimQ = []); q.length = 0; this.query(cx - 0.01, y - 0.6, cz - 0.01, cx + 0.01, y + 0.1, cz + 0.01, q);
      const n = q.length; q.length = 0; if (n) return null;
      out.x = cx - x; out.z = cz - z; const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    canStep(a, b) { // a->b walkable (for monsters)
      if (this.nb[a] || this.nb[b]) return false;
      const d = this.nf[b] - this.nf[a];
      if (d > 0.8 && this.deepWater && this.nf[b] <= this.deepTop(a) + 0.9) return true; // (out of deep water: rising up it, onto what stands no more than 0.9 m over its surface)
      return d <= 0.8 && d >= (this.L > 1 ? -2.6 : -6.5) && (this.L === 1 || this.land(a, b % this.N) === b); // storeys: no leaping off a slab edge (stairs and steps only)
    }
    // flood reachable set (forward edges) for validation
    reach(fromIdx) {
      const W = this.Wn, D = this.Dn, N = this.N;
      const seen = new Uint8Array(N * (this.L || 1));
      const q = [fromIdx]; seen[fromIdx] = 1;
      while (q.length) {
        const a = q.pop();
        const ac = a % N, ax = ac % W, az = (ac / W) | 0;
        for (let k = 0; k < 4; k++) {
          const bx = ax + (k === 0 ? 1 : k === 1 ? -1 : 0), bz = az + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (bx < 0 || bz < 0 || bx >= W || bz >= D) continue;
          const b = this.land(a, bz * W + bx);
          if (b >= 0 && !seen[b] && this.canStep(a, b)) { seen[b] = 1; q.push(b); }
        }
      }
      return seen;
    }
    // Dijkstra on reversed edges from target => ndist[i] = cost to reach target from i
    updateFlow(tx, tz, ty) {
      const W = this.Wn, D = this.Dn, N = this.N, L = this.L || 1;
      let t = this.navIdx(tx, tz, ty);
      if (t < 0) return;
      if (this.nb[t]) { // target inside blocked cell: use nearest open neighbour
        let best = -1, bd = 1e9;
        for (let r = 1; r < 4 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const i = this.navIdx(tx + dx, tz + dz, ty); if (i >= 0 && !this.nb[i]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
        }
        if (best < 0) return; t = best;
      }
      const dist = this.ndist; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      dist[t] = 0; push(t, 0);
      let pops = 0;
      const blk = (n) => n < 0 || this.nb[n];
      if (this.nadj) {
        const nb = this.nb, adj = this.nadj, rs = this.rs, ra = this.ra, rd = this.rd, pen = this.npen;
        while (hn > 0 && pops++ < N * L * 3) {
          const kTop = hk[0];
          const b = pop();
          if (kTop > dist[b] || nb[b]) continue;
          for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
            const a = ra[e], d = rd[e];
            if (nb[a]) continue;
            if (DIAG[d]) { const c1 = adj[a * 8 + DXI[d]], c2 = adj[a * 8 + DZI[d]]; if (c1 < 0 || c2 < 0 || nb[c1] || nb[c2]) continue; }
            const nd = dist[b] + (DIAG[d] ? 1.414 : 1) + pen[a];
            if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
          }
        }
        this.flowTarget = t;
        return;
      }
      while (hn > 0 && pops++ < W * D * 3 * L) {
        const kTop = hk[0];
        const b = pop();
        if (kTop > dist[b]) continue;
        const bc = b % N, bx = bc % W, bz = (bc / W) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const ax = bx + dx, az = bz + dz;
          if (ax < 0 || az < 0 || ax >= W || az >= D) continue;
          for (let k = 0; k < L; k++) {
            const a = k * N + az * W + ax;
            if (this.nf[a] === -Infinity) break;
            if (!this.canStep(a, b)) continue;
            if (dx && dz) { // no corner cutting
              if (blk(this.land(a, az * W + bx)) || blk(this.land(a, bz * W + ax))) continue;
            }
            const nd = dist[b] + (dx && dz ? 1.414 : 1) + this.npen[a];
            if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
          }
        }
      }
      this.flowTarget = t;
    }
    // ---- an ally's own walking field (stacked-storey fields): distances to (tx, tz, ty), settled a little past the ally's own cell ----
    walkField(tx, tz, ty, fx, fz, fy) {
      if (!this.nadj) return false;
      const W = this.Wn, N = this.N, L = this.L;
      let t = this.navIdx(tx, tz, ty); if (t < 0) return false;
      if (this.nb[t]) { let best = -1, bd = 1e9; for (let r = 1; r < 4 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = this.navIdx(tx + dx, tz + dz, ty); if (i >= 0 && !this.nb[i]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } } if (best < 0) return false; t = best; }
      const src = this.navIdx(fx, fz, fy);
      if (!this.ndistM) this.ndistM = new Float32Array(N * L);
      const dist = this.ndistM; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      const nb = this.nb, adj = this.nadj, rs = this.rs, ra = this.ra, rd = this.rd, pen = this.npen;
      dist[t] = 0; push(t, 0);
      let pops = 0, stopAt = Infinity;
      while (hn > 0 && pops++ < N * L * 3) {
        const kTop = hk[0], b = pop();
        if (kTop > dist[b] || nb[b]) continue;
        if (kTop > stopAt) break;
        if (b === src && stopAt === Infinity) stopAt = kTop + 10;
        for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
          const a = ra[e], d = rd[e];
          if (nb[a]) continue;
          if (DIAG[d]) { const c1 = adj[a * 8 + DXI[d]], c2 = adj[a * 8 + DZI[d]]; if (c1 < 0 || c2 < 0 || nb[c1] || nb[c2]) continue; }
          const nd = dist[b] + (DIAG[d] ? 1.414 : 1) + pen[a];
          if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
        }
      }
      return src >= 0 && dist[src] < Infinity;
    }
    // (x, y, z) is in a cell the routes leave out because something stands in part of it (half a stair's width beside a wall, the foot of
    // a pillar): sets out towards the cell of the route beside it that is nearest the target. flowDir has no heading there, and a foe then
    // went straight at its target - into that wall, where it stayed. null where the cell is open, or nothing beside it is on a route
    blockedDir(x, z, y, out) {
      const i = this.navIdx(x, z, y); if (i < 0 || !this.nb[i]) return null;
      const W = this.Wn, nd = this.ndist, ic = i % this.N, ix = ic % W, iz = (ic / W) | 0, lo = this.L > 1 ? -2.6 : -6.5;
      let best = Infinity, bd = -1;
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dz = DIRS[d][1], ax = ix + dx, az = iz + dz; if (ax < 0 || az < 0 || ax >= W || az >= this.Dn) continue;
        const a = this.land(i, az * W + ax); if (a < 0 || this.nb[a] || !(nd[a] < best)) continue;
        const dh = this.nf[a] - this.nf[i]; if (dh > 0.8 || dh < lo || this.dropBarred(i, a)) continue;
        if (dx && dz) { const c1 = this.land(i, az * W + ix), c2 = this.land(i, iz * W + ax); if (c1 < 0 || c2 < 0 || this.nb[c1] || this.nb[c2]) continue; } // (not round a corner)
        best = nd[a]; bd = d;
      }
      if (bd < 0) return null;
      out.x = ix - this.xo + DIRS[bd][0] + 0.5 - x; out.z = iz - this.zo + DIRS[bd][1] + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    // direction toward target following the flow field (null if unreachable)
    flowDir(x, z, out, y, field) {
      const nd = field || this.ndist;
      const W = this.Wn, N = this.N;
      const i = this.navIdx(x, z, y);
      if (i < 0 || nd[i] === Infinity) return null;
      const ic = i % N, ix = ic % W, iz = (ic / W) | 0;
      let best = nd[i], bx = 0, bz = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ax = ix + dx, az = iz + dz;
        if (ax < 0 || az < 0 || ax >= W || az >= this.Dn) continue;
        const a = this.land(i, az * W + ax);
        if (a < 0) continue;
        let c1 = -1, c2 = -1;
        if (dx && dz) { c1 = this.land(i, az * W + ix); c2 = this.land(i, iz * W + ax); if (c1 < 0 || c2 < 0 || this.nb[c1] || this.nb[c2] || !this.canStep(i, c1) || !this.canStep(i, c2) || this.dropBarred(i, c1) || this.dropBarred(i, c2)) continue; }
        if (!this.canStep(i, a) || this.dropBarred(i, a, c1, c2)) continue; // never steer into a cell we can't actually walk into
        if (nd[a] < best) { best = nd[a]; bx = dx; bz = dz; }
      }
      if (!bx && !bz) return null;
      // aim at next cell center (smooths movement)
      out.x = ix - this.xo + bx + 0.5 - x; out.z = iz - this.zo + bz + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    // strata: may a walker at p step on to (nx, nz)? false over the lava trench / off into nothing
    walkerSafe(p, nx, nz) {
      if (this.L === 1) return true;
      const a = this.navIdx(p.x, p.z, p.y), cb = this.navIdx(nx, nz);
      if (a < 0 || cb < 0) return false;
      if (a % this.N === cb) return true;
      const b = this.land(a, cb);
      return b >= 0 && !this.nhz[b] && this.nf[b] >= this.nf[a] - 2.6;
    }
    // over the void? (nothing to land on above the kill plane: a chasm, the gaps between the sky islands, the river of molten iron)
    voidBelow(x, y, z) { return this.floorBelow(x, y + 0.5, z) < this.killY; }
    // open void at (x, z) for something standing at y: nothing at all in the column from the kill plane up to body height
    // (no floor to stand on, and no wall either: a wall with no floor under it is not a drop, it just stops you)
    openVoid(x, y, z) { return !this.query(x - 0.01, this.killY, z - 0.01, x + 0.01, y + 1.6, z + 0.01).length; }
    // single-storey areas: may a walker at p step on to (nx, nz) without walking off into the void? (one already in the air out over
    // it, thrown there, may move as it likes: it is falling anyway. One still standing with its middle a little past the edge may not.)
    edgeSafe(p, nx, nz, airborne) {
      const b = this.navIdx(nx, nz);
      if (b >= 0 && !this.nearVoid(b)) return true; // (far from any void: nothing to check)
      if (!this.openVoid(nx, p.y, nz)) return true;
      return !!airborne && this.openVoid(p.x, p.y, p.z);
    }
    // is nav cell i within 2 m of the void (at ground level)? Worked out once per area. Near it the ground under each step is looked up
    // for real: the nav's 1 m cells are too coarse for it (a bridge's edge cuts a cell in two and its railing reads as floor; over a pit
    // under a roof the nav's "floor" is the roof's top).
    nearVoid(i) {
      if (!this._vn) {
        const W = this.Wn, D = this.Dn, v = new Uint8Array(W * D), m = new Uint8Array(W * D);
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (this.openVoid(x - this.xo + 0.5, 0.2, z - this.zo + 0.5)) v[z * W + x] = 1;
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
          if (!v[z * W + x]) continue;
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < W && zz < D) m[zz * W + xx] = 1; }
        }
        this._vn = m;
      }
      return this._vn[i % this.N] === 1;
    }
    // the nearest whole patch of ground to (x, y, z) a body can lie on and you can walk to (where a foe that fell into the void is
    // laid out), or null. Prefers ground at about the same height.
    nearestGround(x, y, z, maxR) {
      const R = maxR || 24, W = this.Wn, N = this.N, L = this.L || 1;
      const cx = Math.floor(x) + this.xo, cz = Math.floor(z) + this.zo;
      let best = null, bs = Infinity;
      for (const strict of [true, false]) {
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const ix = cx + dx, iz = cz + dz; if (ix < 1 || iz < 1 || ix >= W - 1 || iz >= this.Dn - 1) continue;
          for (let k = 0; k < L; k++) {
            const n = k * N + iz * W + ix, f = this.nf[n];
            if (f === -Infinity) break;
            if (this.nb[n] || f < this.killY + 2 || f > y + 4) continue; // (not on a roof above a pit either)
            if (strict && (this.npen[n] > 0.36 || (this.reachMask && !this.reachMask[n]))) continue;
            const px = ix - this.xo + 0.5, pz = iz - this.zo + 0.5;
            const s = Math.hypot(px - x, pz - z) + Math.max(0, Math.abs(f - y) - 1) * 0.6;
            if (s >= bs || this.voidBelow(px, f + 0.2, pz)) continue;
            bs = s; best = new THREE.Vector3(px, f, pz);
          }
        }
        if (best) return best;
      }
      return null;
    }
    randomOpenCell(rng, filter) {
      for (let k = 0; k < 400; k++) {
        const x = Math.floor(rng.next() * this.Wn), z = Math.floor(rng.next() * this.Dn);
        const i = (this.L > 1 ? Math.floor(rng.next() * this.L) * this.N : 0) + z * this.Wn + x;
        if (this.nb[i] || this.nf[i] === -Infinity) continue;
        if (this.npen[i] > 0.4) continue;
        if (filter && !filter(x - this.xo + 0.5, z - this.zo + 0.5, i)) continue;
        return { x: x - this.xo + 0.5, y: this.nf[i], z: z - this.zo + 0.5, i };
      }
      return null;
    }

    // ---- lights ----
    addLight(x, y, z, o) {
      this.lightSources.push(Object.assign({ pos: new THREE.Vector3(x, y, z), color: this.mats.biome.torch, intensity: 9, range: 13, flame: 1, emit: true, ph: Math.random() * 100 }, o || {}));
    }

    flushDeferred() { const d = this.deferred; this.deferred = []; for (const f of d) f(this.group); }
    finalize(scene, quality) {
      if (G.Props && G.Props.meadow && quality !== 'low') { try { G.Props.meadow(this); } catch (e) { /* no grass */ } }   // (grass over the open turf: props.js)
      for (const f of this.deferred) f(this.group);
      this.deferred = [];
      this.mergeStatic();
      this.batch.build(this.mats, this.group, quality !== 'low', this);
      scene.add(this.group);
    }
    // Draw calls: the props, trees, rocks ... the generators add as single meshes are merged, per material, into one mesh each
    // (same geometry, material, position and shadows, so they look the same; ~600 draw calls an area become a few dozen).
    // Left alone: anything the world keeps a reference to (doors, chests, destructibles, animated things, light fixtures ...)
    // and everything under it, transparent / skinned / instanced meshes, and meshes with children or their own userData.
    // A floating islet bobs as a whole, so its contents are merged inside it.
    mergeStatic() {
      const keep = new Set(), seen = new Set();
      const scan = (v, d) => {
        if (!v || typeof v !== 'object' || seen.has(v)) return;
        seen.add(v);
        if (v.isObject3D) { keep.add(v); return; }
        if (d >= 4 || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isBufferAttribute || v.isVector3 || v.isColor || ArrayBuffer.isView(v)) return;
        if (v instanceof Map || v instanceof Set) { for (const x of v.values()) scan(x, d + 1); return; }
        if (Array.isArray(v)) { if (v.length && (typeof v[0] !== 'object' || v[0] === null)) return; for (const x of v) scan(x, d + 1); return; }
        for (const k in v) scan(v[k], d + 1);
      };
      for (const k in this) if (k !== 'group' && k !== 'mats' && k !== 'batch') scan(this[k], 0);
      // things that only ever move, shake or vanish as a whole: their insides are merged within them (a chest's lid stays its own)
      const units = [this.group];
      const unit = (o) => { if (o && o.isObject3D && o.children.length && !units.includes(o)) units.push(o); };
      for (const a of this.animated) if (a.kind === 'islet') unit(a.m);
      for (const d of this.destructibles) unit(d.mesh);
      for (const ex of this.exits || []) unit(ex.portcullis);
      for (const it of this.interactables) if (it.type === 'chest') unit(it.mesh);
      if (this.bossGate) unit(this.bossGate.pc);
      this.group.updateMatrixWorld(true);
      const plainBefore = THREE.Object3D.prototype.onBeforeRender;
      const OK_ATTR = { position: 1, normal: 1, uv: 1, uv1: 1, uv2: 1, color: 1 };
      const sig = (g) => { const k = Object.keys(g.attributes).sort(); for (const n of k) if (!OK_ATTR[n]) return null; return k.map((n) => n + g.attributes[n].itemSize).join(','); };
      const mergeable = (c) => {
        const g = c.geometry, m = c.material;
        if (c.isInstancedMesh || c.isSkinnedMesh || !g || !g.isBufferGeometry || !m || Array.isArray(m)) return null;
        if (m.transparent || m.opacity < 1 || c.children.length || c.renderOrder || !c.frustumCulled || c.onBeforeRender !== plainBefore || c.layers.mask !== 1) return null;
        if (Object.keys(c.userData).length || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position || g.drawRange.start || g.drawRange.count !== Infinity) return null;
        const s = sig(g); if (!s) return null;
        return m.uuid + '|' + s + '|' + (c.castShadow ? 1 : 0) + (c.receiveShadow ? 1 : 0);
      };
      const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
      for (const root of units) {
        const bins = new Map(), emptied = new Set();
        const walk = (o) => {
          for (const c of o.children) {
            if (keep.has(c) || !c.visible) continue;
            if (c.isMesh) { const k = mergeable(c); if (k) { (bins.get(k) || bins.set(k, []).get(k)).push(c); continue; } }
            else if (c.type !== 'Group' && c.type !== 'Object3D') continue; // lights, sprites, points ...
            if (c.children.length) walk(c);
          }
        };
        walk(root);
        inv.copy(root.matrixWorld).invert();
        for (const list of bins.values()) {
          if (list.length < 2) continue;
          let nv = 0, ni = 0;
          for (const c of list) { const g = c.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
          const g0 = list[0].geometry, names = Object.keys(g0.attributes), out = {};
          for (const n of names) out[n] = new Float32Array(nv * g0.attributes[n].itemSize);
          const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
          let vo = 0, io = 0;
          for (const c of list) {
            const g = c.geometry, cnt = g.attributes.position.count;
            rel.multiplyMatrices(inv, c.matrixWorld); nm.getNormalMatrix(rel);
            for (const n of names) {
              const a = g.attributes[n], sz = a.itemSize, dst = out[n];
              for (let i = 0; i < cnt; i++) {
                const o = (vo + i) * sz;
                if (n === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(rel); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
                else if (n === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
                else { dst[o] = a.getX(i); if (sz > 1) dst[o + 1] = a.getY(i); if (sz > 2) dst[o + 2] = a.getZ(i); if (sz > 3) dst[o + 3] = a.getW(i); }
              }
            }
            const flip = rel.determinant() < 0; // a mirrored mesh: keep its faces facing out
            const n = g.index ? g.index.count : cnt;
            for (let t = 0; t < n; t += 3) {
              const a = g.index ? g.index.getX(t) : t, b = g.index ? g.index.getX(t + 1) : t + 1, d = g.index ? g.index.getX(t + 2) : t + 2;
              idx[io++] = vo + a; idx[io++] = vo + (flip ? d : b); idx[io++] = vo + (flip ? b : d);
            }
            vo += cnt;
            emptied.add(c.parent); c.parent.remove(c);
          }
          const geo = new THREE.BufferGeometry();
          for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(out[n], g0.attributes[n].itemSize));
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          const m = new THREE.Mesh(geo, list[0].material);
          m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
          m.matrixAutoUpdate = false; root.add(m); m.updateMatrixWorld(true);
        }
        // the groups the merge emptied go too (fewer objects to walk every frame)
        for (let o of emptied) while (o && o !== root && !keep.has(o) && !o.children.length && (o.type === 'Group' || o.type === 'Object3D') && o.parent) { const p = o.parent; p.remove(o); o = p; }
      }
    }
    dispose(scene) {
      scene.remove(this.group);
      this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
  }
  World.SKY_Y = 500; // the top of a skyCap: high over anything a hook or a jump reaches
  G.World = World;

  // ---------------- dynamic torch lights (constant light count) ----------------
  const LightPool = (G.LightPool = {
    lights: [], N: 8, active: 8, t: 0,
    init(scene) {
      for (let i = 0; i < this.N; i++) {
        const l = new THREE.PointLight(0xff9a50, 0, 14, 2);
        l.userData.src = null; scene.add(l); this.lights.push(l);
      }
    },
    reset() { for (const l of this.lights) { l.intensity = 0; l.userData.src = null; } },
    update(dt, world, camPos, time) {
      if (!world) return;
      this.t -= dt;
      if (this.t <= 0) {
        this.t = 0.25;
        // (a flame that is only a flame - the candles of a chandelier beside the two that light - takes no place among the lights that are lit)
        const S = world.lightSources.filter((s) => !s.noLight && s.intensity > 0);
        // stacked storeys: a light one floor up or down is behind a slab, so the ones on your own storey come first
        const vk = world.strata ? 9 : 1;
        const arr = S.map((s) => { const dy = s.pos.y - camPos.y; return [s, (s.pos.distanceToSquared(camPos) + dy * dy * (vk - 1)) / (s.prio || 1)]; }).sort((a, b) => a[1] - b[1]);
        const act = Math.min(this.N, this.active || this.N);
        for (let i = 0; i < this.N; i++) {
          const l = this.lights[i];
          l.visible = i < act; // the lights beyond the quality setting are out of the scene's light count altogether
          const s = i < act && arr[i] ? arr[i][0] : null;
          if (l.userData.src !== s) { l.userData.src = s; l.userData.fade = 0; }
        }
      }
      for (const l of this.lights) {
        const s = l.userData.src;
        if (!s) { l.intensity = 0; continue; }
        l.userData.fade = Math.min(1, (l.userData.fade || 0) + dt * 3);
        l.position.copy(s.pos); l.position.y += 0.25;
        l.color.set(s.color); l.distance = s.range;
        const fl = s.steady ? 1 : 0.82 + 0.1 * Math.sin(time * 9.1 + s.ph) + 0.08 * Math.sin(time * 23.3 + s.ph * 2) + 0.05 * (Math.random() - 0.5);
        l.intensity = s.intensity * fl * l.userData.fade * (s.on === false ? 0 : 1) * (G.LIGHT_K || 1);
      }
    },
  });
})();
