'use strict';
// Ground that is not a flat floor (G.Terrain), for the fields built on their own frameworks:
//   - a height grid of 1 m cells (heights in steps of HQ, so a walk up or down a slope is a run of small steps the feet climb by
//     themselves, and the nav sees ordinary floor); over it lies one smooth mesh whose corners sit at the mean of the heights round them,
//     and each cell is then a column whose top is that mesh's height over the cell's middle: the feet stand where the eye sees the
//     ground (an uneven patch the mesh smooths over does not leave columns standing out of it or sunk under it)
//   - rock outcrops: a ragged band of crags that bounds an area without a wall
//   - T.at(w, y, fn): builds a prop that only knows the floor at y = 0 on top of the ground at y
//   - T.flat(w, x0, z0, x1, z1): the height of the ground over a rectangle if it is flat enough to lay something on it (else null);
//     0 in an area without ground of its own (w.groundTop), so the flat fields place exactly as before
(function () {
  const T = (G.Terrain = {});
  const V = G.U.V;
  T.HQ = 0.25; // the height step of the columns

  // ---------------------------------------------------------------- noise (seeded, smooth)
  T.noise = function (seed) {
    const s = (seed | 0) ^ 0x5bd1e995;
    const hash = (x, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, z) => {
      const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
      const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
      return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
    };
  };
  // a few octaves of it, -1..1
  T.fbm = function (n, x, z, oct) {
    let s = 0, a = 1, f = 1, t = 0;
    for (let i = 0; i < (oct || 3); i++) { s += (n(x * f + i * 17.3, z * f - i * 9.1) * 2 - 1) * a; t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  };

  // ---------------------------------------------------------------- the height grid
  // hf = T.grid(W, D): h (cell tops), m (1 = ground here); fill h, then T.limit (walkable everywhere), then T.build
  T.grid = (W, D, base) => ({ W, D, h: new Float32Array(W * D), m: new Uint8Array(W * D).fill(1), base: base ?? -3 });
  // the slope limit: no two neighbours further apart than `step` (passes until it holds), then the tops snapped to HQ
  T.limit = function (hf, step, keep) {
    const { W, D, h, m } = hf;
    step = step || 0.45;
    for (let pass = 0; pass < 40; pass++) {
      let moved = 0;
      for (let dir = 0; dir < 2; dir++) {
        const zs = dir ? D - 1 : 0, ze = dir ? -1 : D, zd = dir ? -1 : 1;
        for (let z = zs; z !== ze; z += zd) for (let x = dir ? W - 1 : 0; dir ? x >= 0 : x < W; x += dir ? -1 : 1) {
          const i = z * W + x; if (!m[i] || (keep && keep[i])) continue;
          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
            const j = zz * W + xx; if (!m[j]) continue;
            // a cell more than a step above its neighbour comes down to it (hills keep their tops, the sides even out)
            if (h[i] > h[j] + step) { h[i] = h[j] + step; moved++; }
          }
        }
      }
      if (!moved) break;
    }
    for (let i = 0; i < W * D; i++) h[i] = Math.round(h[i] / T.HQ) * T.HQ;
    return hf;
  };
  // colliders (runs of equal tops merged along x) + the smooth mesh + the skirts where the ground ends
  T.build = function (w, hf, o) {
    o = o || {};
    const { W, D, h, m, base } = hf;
    const ox = o.x0 || 0, oz = o.z0 || 0;
    // the look first, from the heights as they are; then each column's top set to the look over its middle. A steep cell (its corners
    // over 0.3 m apart) is four columns of half a metre instead, each at the look over its own middle: the feet follow the slope
    hf._c = T.corners(hf);
    T.mesh(w, hf, o);
    const cc = T.cellCorners(hf, o);
    hf._cc = cc;
    h.set(T.cellTops(hf, o, cc));
    // the grid as the player's feet read it (world.js, while the player moves): its columns carry it (c.tg), T.surf gives the drawn height
    const grid = { hf, ox, oz, cc, cliff: !!o.cliff };
    const steep = (i) => { const a = cc[i * 4], b = cc[i * 4 + 1], c = cc[i * 4 + 2], d = cc[i * 4 + 3]; return Math.max(a, b, c, d) - Math.min(a, b, c, d) > 0.3; };
    const co = { surf: o.surf || 'stone', noGrapple: o.noGrapple };
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        const i = z * W + x;
        if (!m[i]) { x++; continue; }
        if (steep(i)) {
          for (const [fx, fz] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            const y = (cc[i * 4] * (1 - fx) + cc[i * 4 + 1] * fx) * (1 - fz) + (cc[i * 4 + 2] * (1 - fx) + cc[i * 4 + 3] * fx) * fz;
            w.addCollider(ox + x + fx - 0.25, base, oz + z + fz - 0.25, ox + x + fx + 0.25, Math.round(y * 16) / 16, oz + z + fz + 0.25, co).tg = grid;
          }
          x++; continue;
        }
        let x2 = x + 1; while (x2 < W && m[z * W + x2] && h[z * W + x2] === h[i] && !steep(z * W + x2)) x2++;
        w.addCollider(ox + x, base, oz + z, ox + x2, h[i], oz + z + 1, co).tg = grid;
        x = x2;
      }
    }
    w.groundGrid = w.groundGrid || [];
    w.groundGrid.push(grid);
    w.groundTop = (x, z) => {
      for (const g of w.groundGrid) {
        const cx = Math.floor(x - g.ox), cz = Math.floor(z - g.oz);
        if (cx < 0 || cz < 0 || cx >= g.hf.W || cz >= g.hf.D) continue;
        const i = cz * g.hf.W + cx; if (g.hf.m[i]) return g.hf.h[i];
      }
      return w.groundElse ? w.groundElse(x, z) : 0;
    };
    return hf;
  };
  // the rock that bounds an area, built as a grid (T.build, after it): an invisible wall over each run of its cells along x, from the
  // lowest corner drawn in the run up into the sky (w.skyCap), so its top is no place to stand and no way out over it
  T.skyCap = function (w, hf, o) {
    const { W, D, m } = hf, cc = hf._cc, ox = (o && o.x0) || 0, oz = (o && o.z0) || 0;
    for (let z = 0; z < D; z++) for (let x = 0; x < W;) {
      if (!m[z * W + x]) { x++; continue; }
      let x2 = x, lo = Infinity;
      while (x2 < W && m[z * W + x2]) { const k = (z * W + x2) * 4; lo = Math.min(lo, cc[k], cc[k + 1], cc[k + 2], cc[k + 3]); x2++; }
      w.skyCap(ox + x, lo, oz + z, ox + x2, oz + z + 1);
      x = x2;
    }
  };
  // the height of the drawn ground at (x, z) on a grid (T.build's grid): the very triangle the mesh draws there (T.mesh splits each cell
  // along its shorter diagonal, T.meshCliff always from x0z0 to x1z1); null off the grid or over a cell without ground
  T.surf = function (g, x, z) {
    const W = g.hf.W, D = g.hf.D, cx = Math.floor(x - g.ox), cz = Math.floor(z - g.oz);
    if (cx < 0 || cz < 0 || cx >= W || cz >= D) return null;
    const i = cz * W + cx; if (!g.hf.m[i]) return null;
    const fx = Math.min(1, Math.max(0, x - g.ox - cx)), fz = Math.min(1, Math.max(0, z - g.oz - cz));
    const a = g.cc[i * 4], b = g.cc[i * 4 + 1], c = g.cc[i * 4 + 2], d = g.cc[i * 4 + 3]; // x0z0 x1z0 x0z1 x1z1
    if (g.cliff || Math.abs(a - d) < Math.abs(b - c)) return fz >= fx ? a + fx * (d - c) + fz * (c - a) : a + fx * (b - a) + fz * (d - b);
    return fx + fz <= 1 ? a + fx * (b - a) + fz * (c - a) : d + (1 - fx) * (c - d) + (1 - fz) * (b - d);
  };
  // the mesh's four corner heights over every cell (as T.mesh / T.meshCliff lay them): 4 per cell, x0z0 x1z0 x0z1 x1z1
  T.cellCorners = function (hf, o) {
    const { W, D, h, m } = hf, out = new Float32Array(W * D * 4), cl = o && o.cliff;
    const c = hf._c || T.corners(hf), W1 = W + 1;
    const top = (x, z) => (x < 0 || z < 0 || x >= W || z >= D || !m[z * W + x] ? null : h[z * W + x]);
    const cliffCorner = (x, z, hc) => { let s = 0, k = 0; for (const [a, b] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const t = top(x + a, z + b); if (t != null && Math.abs(t - hc) <= cl) { s += t; k++; } } return k ? s / k : hc; };
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x; if (!m[i]) continue;
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b], k) => {
        if (cl) out[i * 4 + k] = cliffCorner(x + a, z + b, h[i]);
        else { const v = c[(z + b) * W1 + x + a]; out[i * 4 + k] = isNaN(v) ? h[i] : v; }
      });
    }
    return out;
  };
  // the mesh's height over the middle of every cell, in steps of 1/16 m
  T.cellTops = function (hf, o, cc) {
    cc = cc || T.cellCorners(hf, o);
    const out = new Float32Array(hf.h);
    for (let i = 0; i < hf.W * hf.D; i++) if (hf.m[i]) out[i] = Math.round((cc[i * 4] + cc[i * 4 + 1] + cc[i * 4 + 2] + cc[i * 4 + 3]) / 4 * 16) / 16;
    return out;
  };
  // the corner heights: the mean of the tops of the cells that meet there
  T.corners = function (hf) {
    const { W, D, h, m } = hf, c = new Float32Array((W + 1) * (D + 1)), n = new Uint8Array((W + 1) * (D + 1));
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x; if (!m[i]) continue;
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const k = (z + b) * (W + 1) + x + a; c[k] += h[i]; n[k]++; }
    }
    for (let k = 0; k < c.length; k++) c[k] = n[k] ? c[k] / n[k] : NaN;
    return c;
  };
  // cliff mode (o.cliff): every cell keeps its own corners, each the mean of the tops round it that lie within o.cliff of the cell's
  // own (a slope stays smooth, a drop stays a drop), and a face of rock goes down every drop to the cell below
  T.meshCliff = function (w, hf, o) {
    const { W, D, h, m } = hf, ox = o.x0 || 0, oz = o.z0 || 0, cl = o.cliff;
    const G0 = w.batch._grp(o.mk || 'floor'), uvS = 1 / (o.uv || 4);
    const n = T.noise(o.tintSeed || 7);
    const tint = o.tint || [1, 1, 1], steepT = o.steepTint || [0.62, 0.58, 0.52];
    const top = (x, z) => (x < 0 || z < 0 || x >= W || z >= D || !m[z * W + x] ? null : h[z * W + x]);
    const corner = (x, z, hc) => {
      let s = 0, c = 0;
      for (const [a, b] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const t = top(x + a, z + b); if (t != null && Math.abs(t - hc) <= cl) { s += t; c++; } }
      return c ? s / c : hc;
    };
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nv = new THREE.Vector3();
    const faceMk = o.skirtMk || 'rock';
    // the faces down the drops: [x0, z0, x1, z1, top at 0, top at 1, foot at 0, foot at 1, nx, nz] (drawn after, as one surface)
    const FQ = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x; if (!m[i]) continue;
      const hc = h[i];
      const y00 = corner(x, z, hc), y10 = corner(x + 1, z, hc), y11 = corner(x + 1, z + 1, hc), y01 = corner(x, z + 1, hc);
      e1.set(1, y11 - y00, 1); e2.set(1, y10 - y01, -1); nv.crossVectors(e2, e1).normalize(); if (nv.y < 0) nv.negate();
      const steep = Math.min(1, Math.max(0, (1 - nv.y) * 3.2)), f = 0.84 + n((ox + x) * 0.21, (oz + z) * 0.21) * 0.3;
      const col = [(tint[0] * (1 - steep) + steepT[0] * steep) * f, (tint[1] * (1 - steep) + steepT[1] * steep) * f, (tint[2] * (1 - steep) + steepT[2] * steep) * f];
      const base = G0.p.length / 3;
      for (const [vx, vz, vy] of [[x, z, y00], [x + 1, z, y10], [x + 1, z + 1, y11], [x, z + 1, y01]]) {
        G0.p.push(ox + vx, vy, oz + vz); G0.n.push(nv.x, nv.y, nv.z); G0.u.push((ox + vx) * uvS, -(oz + vz) * uvS); G0.c.push(col[0], col[1], col[2]);
      }
      G0.i.push(base, base + 3, base + 2, base, base + 2, base + 1);
      // the drops on its four sides (down to the lower cell, or to the grid's base where there is no ground of this grid)
      const lo = (t) => (t == null ? (o.skirt === false ? null : hf.base) : t < hc - cl ? t : null);
      const tL = top(x - 1, z), tR = top(x + 1, z), tN = top(x, z - 1), tS = top(x, z + 1);
      const L = lo(tL), R = lo(tR), N = lo(tN), S = lo(tS);
      // (each face from the top surface's own edge down to the lower surface's edge, or to the grid's base: no step at its top or foot)
      const ft = (t, xx, zz) => (t == null ? hf.base : corner(xx, zz, t));
      if (L != null) FQ.push([ox + x, oz + z, ox + x, oz + z + 1, y00, y01, ft(tL, x, z), ft(tL, x, z + 1), -1, 0]);
      if (R != null) FQ.push([ox + x + 1, oz + z, ox + x + 1, oz + z + 1, y10, y11, ft(tR, x + 1, z), ft(tR, x + 1, z + 1), 1, 0]);
      if (N != null) FQ.push([ox + x, oz + z, ox + x + 1, oz + z, y00, y10, ft(tN, x, z), ft(tN, x + 1, z), 0, -1]);
      if (S != null) FQ.push([ox + x, oz + z + 1, ox + x + 1, oz + z + 1, y01, y11, ft(tS, x, z + 1), ft(tS, x + 1, z + 1), 0, 1]);
      // (the boxes the drops used to be, for what reads the drawn boxes - areas.js, the signs over the gates)
      if (w.visBoxes) { if (L != null) w.visBoxes.push([ox + x - 0.02, L, oz + z, ox + x, hc + 0.02, oz + z + 1]); if (R != null) w.visBoxes.push([ox + x + 1, R, oz + z, ox + x + 1.02, hc + 0.02, oz + z + 1]); if (N != null) w.visBoxes.push([ox + x, N, oz + z - 0.02, ox + x + 1, hc + 0.02, oz + z]); if (S != null) w.visBoxes.push([ox + x, S, oz + z + 1, ox + x + 1, hc + 0.02, oz + z + 1.02]); }
    }
    // the drops as one face of rock: each 1 m piece of it a quad, its upright edges shaded with the mean of the pieces that meet there and
    // face the same way, so a run of them stepping round a bend in 1 m teeth is lit as one bent face (the teeth were flat bands, each lit
    // by itself); a little darker and damper toward the foot. Nothing it stands for is changed: the cells' boxes are the same
    {
      const F2 = w.batch._grp(faceMk), NS = new Map(), key = (x, z) => x * 4099 + z;
      for (const q of FQ) for (const k of [key(q[0], q[1]), key(q[2], q[3])]) { const L = NS.get(k); if (L) L.push(q[8], q[9]); else NS.set(k, [q[8], q[9]]); }
      const nAt = (x, z, nx, nz) => { const L = NS.get(key(x, z)); let sx = 0, sz = 0; for (let i = 0; i < L.length; i += 2) if (L[i] * nx + L[i + 1] * nz > -0.01) { sx += L[i]; sz += L[i + 1]; } const l = Math.hypot(sx, sz); return l > 0.3 ? [sx / l, sz / l] : [nx, nz]; };
      const tq = o.tint || [1, 1, 1], uS = 1 / 3;
      for (const [x0, z0, x1, z1, t0, t1, b0, b1, nx, nz] of FQ) {
        const n0 = nAt(x0, z0, nx, nz), n1 = nAt(x1, z1, nx, nz), base = F2.p.length / 3, au = nx !== 0 ? 2 : 0;
        const pts = [[x0, Math.min(b0, t0 - 0.05), z0, n0], [x1, Math.min(b1, t1 - 0.05), z1, n1], [x1, t1 + 0.01, z1, n1], [x0, t0 + 0.01, z0, n0]];
        for (const [px, py, pz, nn] of pts) {
          F2.p.push(px, py, pz); F2.n.push(nn[0], 0, nn[1]); F2.u.push((au ? pz : px) * uS, py * uS);
          const f = (0.82 + n(px * 0.31 + 3.1, pz * 0.31 + py * 0.17) * 0.28) * (0.84 + 0.16 * Math.min(1, Math.max(0, (py - Math.min(b0, b1)) / 1.6)));
          F2.c.push(tq[0] * f, tq[1] * f, tq[2] * f);
        }
        // (wound to face out: along +z or -x seen from outside, as the quad's points run)
        const out = (x1 - x0) * nz - (z1 - z0) * nx > 0;
        if (out) F2.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else F2.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      // (where two pieces meet in an inside corner - a tooth's notch, seen from below - a piece across it from the middle of the one to the
      // middle of the other, and a cap of rock over it at the lower of their tops: the notches of a run stepping round a bend half filled,
      // its teeth half as deep. It stands in the low cell's corner, out to 0.35 m from the boxes)
      const ends = new Map();
      FQ.forEach((q, i) => { for (const e of [0, 1]) { const k = key(q[e * 2], q[e * 2 + 1]); const L = ends.get(k); if (L) L.push(i, e); else ends.set(k, [i, e]); } });
      const at = (q, e, t) => [q[0] + (q[2] - q[0]) * (e ? 1 - t : t), q[1] + (q[3] - q[1]) * (e ? 1 - t : t)];
      const yAt = (q, e, t, top) => { const k = e ? 1 - t : t; return top ? q[4] + (q[5] - q[4]) * k : q[6] + (q[7] - q[6]) * k; };
      for (const L of ends.values()) for (let a = 0; a < L.length; a += 2) for (let b = a + 2; b < L.length; b += 2) {
        const A = FQ[L[a]], ea = L[a + 1], B = FQ[L[b]], eb = L[b + 1];
        if (A[8] * B[8] + A[9] * B[9] !== 0) continue;   // (square to each other only)
        const P = [A[ea * 2], A[ea * 2 + 1]], Bo = [B[(1 - eb) * 2], B[(1 - eb) * 2 + 1]];
        if ((Bo[0] - P[0]) * A[8] + (Bo[1] - P[1]) * A[9] <= 0) continue;   // (B runs off in front of A: an inside corner)
        const Q1 = at(A, ea, 0.5), Q2 = at(B, eb, 0.5), tA = yAt(A, ea, 0.5, true), tB = yAt(B, eb, 0.5, true), bA = yAt(A, ea, 0.5, false), bB = yAt(B, eb, 0.5, false);
        const top = Math.min(tA, tB) + 0.01, bot = Math.max(bA, bB) - 0.02; if (top - bot < 0.3) continue;
        let nx = A[8] + B[8], nz = A[9] + B[9]; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        const base = F2.p.length / 3, dl = Math.hypot(Q2[0] - Q1[0], Q2[1] - Q1[1]) || 1, ux = (Q2[0] - Q1[0]) / dl, uz = (Q2[1] - Q1[1]) / dl;
        for (const [px, py, pz] of [[Q1[0], bot, Q1[1]], [Q2[0], bot, Q2[1]], [Q2[0], top, Q2[1]], [Q1[0], top, Q1[1]]]) {
          F2.p.push(px, py, pz); F2.n.push(nx, 0, nz); F2.u.push((px * ux + pz * uz) * uS, py * uS);
          const f = (0.82 + n(px * 0.31 + 3.1, pz * 0.31 + py * 0.17) * 0.28) * (0.84 + 0.16 * Math.min(1, Math.max(0, (py - bot) / 1.6)));
          F2.c.push(tq[0] * f, tq[1] * f, tq[2] * f);
        }
        if ((Q2[0] - Q1[0]) * nz - (Q2[1] - Q1[1]) * nx > 0) F2.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else F2.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
        // (its cap: the triangle over the notch, facing up)
        const c0 = F2.p.length / 3, f = 0.8 + n(P[0] * 0.31, P[1] * 0.31) * 0.28;
        for (const [px, pz] of [Q1, Q2, P]) { F2.p.push(px, top, pz); F2.n.push(0, 1, 0); F2.u.push(px * uS, -pz * uS); F2.c.push(tq[0] * f, tq[1] * f, tq[2] * f); }
        const cr = (Q2[0] - Q1[0]) * (P[1] - Q1[1]) - (Q2[1] - Q1[1]) * (P[0] - Q1[0]);
        if (cr < 0) F2.i.push(c0, c0 + 1, c0 + 2); else F2.i.push(c0, c0 + 2, c0 + 1);
      }
    }
  };
  T.mesh = function (w, hf, o) {
    o = o || {};
    if (o.cliff) return T.meshCliff(w, hf, o);
    const { W, D, h, m } = hf, ox = o.x0 || 0, oz = o.z0 || 0;
    const c = T.corners(hf), W1 = W + 1;
    const G0 = w.batch._grp(o.mk || 'floor'), uvS = 1 / (o.uv || 4);
    const n = T.noise(o.tintSeed || 7);
    const tint = o.tint || [1, 1, 1], steepT = o.steepTint || [0.62, 0.58, 0.52];
    const vid = new Int32Array(c.length).fill(-1);
    const nrm = (x, z) => {
      const k = z * W1 + x;
      const hl = isNaN(c[k - 1]) || x === 0 ? c[k] : c[k - 1], hr = isNaN(c[k + 1]) || x === W ? c[k] : c[k + 1];
      const hu = z === 0 || isNaN(c[k - W1]) ? c[k] : c[k - W1], hd = z === D || isNaN(c[k + W1]) ? c[k] : c[k + W1];
      const v = V(hl - hr, 2, hu - hd).normalize(); return v;
    };
    const vert = (x, z) => {
      const k = z * W1 + x; if (vid[k] >= 0) return vid[k];
      const y = c[k], wx = ox + x, wz = oz + z, nv = nrm(x, z);
      G0.p.push(wx, y, wz); G0.n.push(nv.x, nv.y, nv.z); G0.u.push(wx * uvS, -wz * uvS);
      const steep = Math.min(1, Math.max(0, (1 - nv.y) * 3.2)), f = 0.84 + n(wx * 0.21, wz * 0.21) * 0.3;
      G0.c.push((tint[0] * (1 - steep) + steepT[0] * steep) * f, (tint[1] * (1 - steep) + steepT[1] * steep) * f, (tint[2] * (1 - steep) + steepT[2] * steep) * f);
      vid[k] = G0.p.length / 3 - 1; return vid[k];
    };
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!m[z * W + x]) continue;
      const a = vert(x, z), b = vert(x + 1, z), cc = vert(x + 1, z + 1), d = vert(x, z + 1);
      // split along the shorter diagonal (smoother ridges)
      if (Math.abs(c[z * W1 + x] - c[(z + 1) * W1 + x + 1]) < Math.abs(c[z * W1 + x + 1] - c[(z + 1) * W1 + x])) G0.i.push(a, d, cc, a, cc, b);
      else G0.i.push(a, d, b, b, d, cc);
    }
    // skirts down the sides where the ground stops (an edge cell next to a cell without ground, or the grid's border)
    if (o.skirt !== false) {
      const mk = o.skirtMk || 'rock';
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x; if (!m[i]) continue;
        const top = h[i] + 0.02, lo = hf.base;
        const no = (xx, zz) => xx < 0 || zz < 0 || xx >= W || zz >= D || !m[zz * W + xx];
        if (no(x - 1, z)) w.visual(mk, ox + x - 0.02, lo, oz + z, ox + x, top, oz + z + 1, { uv: 3, grad: false, skip: { px: true, top: true, bottom: true } });
        if (no(x + 1, z)) w.visual(mk, ox + x + 1, lo, oz + z, ox + x + 1.02, top, oz + z + 1, { uv: 3, grad: false, skip: { nx: true, top: true, bottom: true } });
        if (no(x, z - 1)) w.visual(mk, ox + x, lo, oz + z - 0.02, ox + x + 1, top, oz + z, { uv: 3, grad: false, skip: { pz: true, top: true, bottom: true } });
        if (no(x, z + 1)) w.visual(mk, ox + x, lo, oz + z + 1, ox + x + 1, top, oz + z + 1.02, { uv: 3, grad: false, skip: { nz: true, top: true, bottom: true } });
      }
    }
  };
  // the smooth surface's height at a point (what the eye sees), for small things laid on the ground
  T.surface = function (hf, x, z) {
    if (!hf._c) hf._c = T.corners(hf);
    const W1 = hf.W + 1, xi = Math.max(0, Math.min(hf.W - 1, Math.floor(x))), zi = Math.max(0, Math.min(hf.D - 1, Math.floor(z))), fx = x - xi, fz = z - zi;
    const g = (a, b) => { const v = hf._c[(zi + b) * W1 + xi + a]; return isNaN(v) ? hf.h[zi * hf.W + xi] : v; };
    return (g(0, 0) * (1 - fx) + g(1, 0) * fx) * (1 - fz) + (g(0, 1) * (1 - fx) + g(1, 1) * fx) * fz;
  };

  // ---------------------------------------------------------------- building on the ground
  // run fn with everything it builds raised by y (solids, visuals, colliders, lights, merged geometry and the meshes it defers)
  T.at = function (w, y, fn) {
    if (!y) return fn();
    const B = w.batch, box = B.box, geo = B.geo, ac = w.addCollider, al = w.addLight, dpush = w.deferred.push, y0at = w._atY || 0;
    w._atY = y0at + y;   // (how far up what is built just now stands: what places itself by its own matrix reads it - props.js P.inst)
    B.box = function (mk, x0, y0, z0, x1, y1, z1, o) { o = Object.assign({}, o || {}); o.gradBase = (o.gradBase ?? Math.min(0, y0)) + y; return box.call(this, mk, x0, y0 + y, z0, x1, y1 + y, z1, o); };
    B.geo = function (mk, g, mat, o) { const m2 = new THREE.Matrix4().makeTranslation(0, y, 0).multiply(mat); if (o && o.gradBase != null) o = Object.assign({}, o, { gradBase: o.gradBase + y }); return geo.call(this, mk, g, m2, o); };
    w.addCollider = function (x0, y0, z0, x1, y1, z1, o) { return ac.call(this, x0, y0 + y, z0, x1, y1 + y, z1, o); };
    w.addLight = function (x, yy, z, o) { return al.call(this, x, yy + y, z, o); };
    w.deferred.push = function (f) { return dpush.call(this, (grp) => { const g = new THREE.Group(); g.position.y = y; f(g); grp.add(g); }); };
    try { return fn(); } finally { B.box = box; B.geo = geo; w.addCollider = ac; w.addLight = al; delete w.deferred.push; if (dpush !== Array.prototype.push) w.deferred.push = dpush; w._atY = y0at; }
  };
  // the ground over a rectangle: its height if it is flat enough to lay something on it, else null (0 where the area has no ground of its own)
  T.flat = function (w, x0, z0, x1, z1, tol) {
    if (!w.groundTop) return 0;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) {
      const y = w.groundTop(x0 + (x1 - x0) * (0.08 + a * 0.42), z0 + (z1 - z0) * (0.08 + b * 0.42));
      if (y == null || !isFinite(y)) return null;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return hi - lo <= (tol ?? 0.3) ? hi : null;
  };

  // ---------------------------------------------------------------- boulders
  // A boulder is broken rock, not a die. Six forms, picked by where the stone lies (a row of them is not one stone over and over),
  // each made once and kept: two blocks split along a dozen planes, a slab in two layers, a split shard, a rounded boulder of granite,
  // a stone lying on another. Each is cut out of an ellipsoid by planes (a convex solid: its faces the fracture faces), its edges worn
  // round (the more where two or three faces meet), and then its skin: the faces broken off lately stay flat and pale, the old ones
  // weathered lumpy and darker. In the unit space the dodecahedron had (about -1..1, its middle 0.55 sy over the given y; the bottom
  // goes into the ground). The two kinds of face are two meshes, so that each takes its own shade (the batch tints a whole mesh).
  // (made by noise and generators of their own: the area's dice are thrown only for the turn and lean, as before)
  const _rh = (x, y, z, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const _rn = (x, y, z, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w2 = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t, c = (i, j, k) => _rh(xi + i, yi + j, zi + k, s);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w2);
  };
  const _rp = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // the convex solid inside planes [nx, ny, nz, d] (n . p <= d), as faces {n, pts (counter-clockwise seen from outside), k: which plane}
  function solid(planes) {
    const B = 4, box = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((n, k) => ({ n, k: -1 - k, pts: null }));
    for (const f of box) {
      const n = f.n, u = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], a = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]], b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
      f.pts = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([p, q]) => [n[0] * B + (a[0] * p + b[0] * q) * B, n[1] * B + (a[1] * p + b[1] * q) * B, n[2] * B + (a[2] * p + b[2] * q) * B]);
      // (counter-clockwise seen from outside: turned round if it came out the other way)
      const e1 = f.pts[1].map((v, i) => v - f.pts[0][i]), e2 = f.pts[2].map((v, i) => v - f.pts[0][i]), cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) f.pts.reverse();
    }
    let faces = box;
    planes.forEach((pl, k) => {
      const [nx, ny, nz, d] = pl, out = [], cap = [];
      for (const f of faces) {
        const res = [], P = f.pts;
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length], da = nx * a[0] + ny * a[1] + nz * a[2] - d, db = nx * b[0] + ny * b[1] + nz * b[2] - d;
          if (da <= 1e-9) res.push(a);
          if (Math.abs(da) <= 1e-9) cap.push(a);
          if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) { const t = da / (da - db), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; res.push(p); cap.push(p); }
        }
        if (res.length >= 3) out.push({ n: f.n, k: f.k, pts: res });
      }
      // (the new face: the points where the plane cut the old edges, in order round their middle)
      const uniq = []; for (const p of cap) if (!uniq.some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-7)) uniq.push(p);
      if (uniq.length >= 3) {
        const c = [0, 0, 0]; for (const p of uniq) { c[0] += p[0] / uniq.length; c[1] += p[1] / uniq.length; c[2] += p[2] / uniq.length; }
        const u = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0], a = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]], al = Math.hypot(...a); a[0] /= al; a[1] /= al; a[2] /= al;
        const b = [ny * a[2] - nz * a[1], nz * a[0] - nx * a[2], nx * a[1] - ny * a[0]];
        uniq.sort((p, q) => Math.atan2((p[0] - c[0]) * b[0] + (p[1] - c[1]) * b[1] + (p[2] - c[2]) * b[2], (p[0] - c[0]) * a[0] + (p[1] - c[1]) * a[1] + (p[2] - c[2]) * a[2]) - Math.atan2((q[0] - c[0]) * b[0] + (q[1] - c[1]) * b[1] + (q[2] - c[2]) * b[2], (q[0] - c[0]) * a[0] + (q[1] - c[1]) * a[1] + (q[2] - c[2]) * a[2]));
        out.push({ n: [nx, ny, nz], k, pts: uniq });
      }
      faces = out;
    });
    return faces;
  }
  // planes round an ellipsoid (ax, ay, az) along directions spread over the sphere, each a little inside it (cut: 0.8..0.97 of the
  // ellipsoid's reach that way); extra: planes given outright
  function cutPlanes(R, n, ax, ay, az, cut, extra, steep) {
    const P = [], off = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const y0 = 1 - (i + 0.5) / n * 2, r = Math.sqrt(Math.max(0, 1 - y0 * y0)), a = i * 2.39996 + off;
      let d = [Math.cos(a) * r + (R() - 0.5) * 0.35, y0 * (steep || 1) + (R() - 0.5) * 0.35, Math.sin(a) * r + (R() - 0.5) * 0.35]; const l = Math.hypot(...d); d = d.map((v) => v / l);
      const reach = Math.sqrt(ax * ax * d[0] * d[0] + ay * ay * d[1] * d[1] + az * az * d[2] * d[2]);
      P.push([d[0], d[1], d[2], reach * (cut[0] + (cut[1] - cut[0]) * R())]);
    }
    return P.concat(extra || []);
  }
  // one stone of a form: the solid, its edges worn round, its skin; into the lists of the fresh and the weathered faces
  // (worn: how far in its edges are worn; lump: how lumpy its weathered skin; off: where it sits; fresh: the share of faces broken lately)
  function stone(out, planes, o) {
    const faces = solid(planes), R = _rp(o.seed * 131 + 7), off = o.off || [0, 0, 0], worn = o.worn ?? 0.06, ww = o.ww ?? 0.16, lump = o.lump ?? 0.05;
    const fresh = {}; for (const f of faces) if (f.k >= 0 && fresh[f.k] === undefined) fresh[f.k] = f.n[1] < 0.55 && R() < (o.fresh ?? 0.5);
    // (a point's slack inside each plane: on a face one is 0, by an edge a second is small, by a corner a third: worn the more)
    const shape = (p) => {
      let s1 = 9, s2 = 9, s3 = 9, k1 = 0;
      planes.forEach(([nx, ny, nz, d], i) => { const s = d - (nx * p[0] + ny * p[1] + nz * p[2]); if (s < s1) { s3 = s2; s2 = s1; s1 = s; k1 = i; } else if (s < s2) { s3 = s2; s2 = s; } else if (s < s3) s3 = s; });
      const e2 = Math.max(0, 1 - s2 / ww), e3 = Math.max(0, 1 - s3 / ww), l = Math.hypot(p[0], p[1] * 1.2, p[2]) || 1;
      const nrm = _rn(p[0] * 3.1 + o.seed, p[1] * 3.1, p[2] * 3.1, 5) - 0.5, fine = _rn(p[0] * 9 + 3, p[1] * 9, p[2] * 9 + o.seed, 6) - 0.5;
      const lp = lump * (fresh[k1] ? 0.3 : 1), k = 1 - (worn * (e2 * e2 + 0.8 * e3 * e3)) / l + (lp * nrm + lp * 0.35 * fine) * (0.4 + 0.6 * Math.min(1, s2 / ww + 0.2));
      return [p[0] * k + off[0], p[1] * k + off[1], p[2] * k + off[2]];
    };
    for (const f of faces) {
      if (f.k < 0) continue;
      const P = f.pts, c = [0, 0, 0]; for (const p of P) { c[0] += p[0] / P.length; c[1] += p[1] / P.length; c[2] += p[2] / P.length; }
      const tris = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        if (o.lo) { tris.push([c, a, b]); continue; }
        const mca = m(c, a), mab = m(a, b), mbc = m(b, c);
        tris.push([c, mca, mbc], [mca, a, mab], [mbc, mab, b], [mca, mab, mbc]);
      }
      const L = fresh[f.k] ? out.fresh : f.n[1] > 0.62 ? out.top : out.old, ax = Math.abs(f.n[0]), ay = Math.abs(f.n[1]), az = Math.abs(f.n[2]);
      const axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
      for (const t of tris) for (const p of t) { const q = shape(p); q.push(axis); L.push(q); }
      if (fresh[f.k]) out.nf += tris.length; else out.no += tris.length;
    }
  }
  // the lists into meshes: normals shared where the faces meet (worn edges shade round), cut flat on a face; uv by the face's way
  function stoneGeo(out) {
    const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4), acc = new Map();
    const all = out.fresh.concat(out.old, out.top);
    for (let i = 0; i < all.length; i += 3) {
      const a = all[i], b = all[i + 1], c = all[i + 2], e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const p of [a, b, c]) { const k = key(p), v = acc.get(k); if (v) { v[0] += n[0]; v[1] += n[1]; v[2] += n[2]; } else acc.set(k, n.slice()); }
    }
    // (a corner shared by the triangles of one face is one vertex: an area sets down some hundreds of stones, and the batch writes
    // every vertex of each)
    const mk = (list) => {
      if (!list.length) return null;
      const at = new Map(), P = [], N = [], U = [], I = [];
      for (const p of list) {
        const k = key(p) + ',' + p[3]; let i = at.get(k);
        if (i === undefined) {
          const n = acc.get(key(p)), l = Math.hypot(n[0], n[1], n[2]) || 1, ax = p[3];
          i = P.length / 3; at.set(k, i); P.push(p[0], p[1], p[2]); N.push(n[0] / l, n[1] / l, n[2] / l); U.push(ax === 0 ? p[2] : p[0], ax === 1 ? p[2] : p[1]);
        }
        I.push(i);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
      g.userData.shared = true; return g;
    };
    return { fresh: mk(out.fresh), old: mk(out.old), top: mk(out.top) };
  }
  // the six forms (kept). bands: how far the stone reaches across x and z in slices of its height, for colliders made to it later
  // (lo: for the low setting, each face a fan without its smaller faces: about a quarter of the triangles, the same stone)
  const LUMPS = [];
  function lumpForm(v, lo) {
    const key = v + (lo ? 6 : 0); if (LUMPS[key]) return LUMPS[key];
    const R = _rp(v * 977 + 31), out = { fresh: [], old: [], top: [], nf: 0, no: 0 }, st = stone;
    const stone2 = (o2, pl, o) => st(o2, pl, Object.assign({ lo }, o));
    if (v === 0) stone2(out, cutPlanes(R, 12, 0.98, 0.9, 0.9, [0.8, 0.96], [[0, -1, 0, 0.95]]), { seed: 1, fresh: 0.55 });
    else if (v === 1) stone2(out, cutPlanes(R, 11, 1.0, 0.78, 0.82, [0.78, 0.95], [[0, -1, 0, 0.95]]), { seed: 2, fresh: 0.5, worn: 0.05 });
    else if (v === 2) {
      // a slab in two layers, the upper drawn back from the lower's edge: bedding of sedimentary rock
      stone2(out, cutPlanes(R, 9, 1.0, 0.6, 0.95, [0.82, 0.97], [[0, -1, 0, 0.95], [0, 1, 0, -0.08]], 0.4), { seed: 3, fresh: 0.6, worn: 0.04, ww: 0.1, lump: 0.03 });
      stone2(out, cutPlanes(R, 8, 0.86, 0.5, 0.8, [0.82, 0.96], [[0, -1, 0, 0.1], [0, 1, 0, 0.48]], 0.4), { seed: 4, fresh: 0.5, worn: 0.05, ww: 0.1, lump: 0.03, off: [0.06, -0.02, -0.05] });
    } else if (v === 3) {
      // a split shard: steep faces, a ridge for a top, leaning a little
      stone2(out, cutPlanes(R, 9, 0.72, 1.0, 0.62, [0.84, 0.97], [[0, -1, 0, 0.95], [0.55, 0.83, 0.1, 0.62], [-0.5, 0.85, -0.15, 0.6]], 0.45), { seed: 5, fresh: 0.7, worn: 0.035, ww: 0.1, lump: 0.025, off: [0.05, 0, 0] });
    } else if (v === 4) {
      // granite: many small faces, worn deep and round, its skin weathered all over
      stone2(out, cutPlanes(R, 16, 0.95, 0.86, 0.95, [0.86, 0.97], [[0, -1, 0, 0.95]]), { seed: 6, fresh: 0.15, worn: 0.12, ww: 0.3, lump: 0.06 });
    } else {
      // a stone lying on another
      stone2(out, cutPlanes(R, 10, 1.0, 0.62, 0.92, [0.8, 0.95], [[0, -1, 0, 0.95], [0, 1, 0, 0.18]]), { seed: 7, fresh: 0.5, worn: 0.05 });
      stone2(out, cutPlanes(R, 9, 0.55, 0.42, 0.5, [0.8, 0.95]), { seed: 8, fresh: 0.5, worn: 0.05, off: [0.18, 0.5, -0.12] });
    }
    // (no bigger than the die it replaces: drawn in, all of it alike, until it reaches no farther than 0.95 across or up)
    { let m = 0.95; for (const L of [out.fresh, out.old, out.top]) for (const p of L) m = Math.max(m, Math.abs(p[0]), Math.abs(p[2]), p[1]); const k = 0.95 / m; if (k < 1) for (const L of [out.fresh, out.old, out.top]) for (const p of L) { p[0] *= k; p[1] *= k; p[2] *= k; } }
    const g = stoneGeo(out), bands = [[-1, -0.4], [-0.4, 0.2], [0.2, 0.6], [0.6, 1.2]].map(([y0, y1]) => {
      let x0 = 9, x1 = -9, z0 = 9, z1 = -9, top = -9;
      for (const gg of [g.fresh, g.old, g.top]) if (gg) { const p = gg.attributes.position.array; for (let i = 0; i < p.length; i += 3) if (p[i + 1] >= y0 && p[i + 1] < y1) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); top = Math.max(top, p[i + 1]); } }
      return x1 < x0 ? null : { y0, y1: Math.min(y1, top), x0, x1, z0, z1 };
    }).filter(Boolean);
    return (LUMPS[key] = { fresh: g.fresh, old: g.old, top: g.top, bands, tris: out.nf + out.no });
  }
  T.LUMP_FORMS = 6;
  T.lumpForm = lumpForm;
  // which form lies at x, z (by the place alone)
  T.lumpAt = (x, z) => Math.min(5, Math.floor(_rh(Math.round(x * 7.3), Math.round(z * 5.1), 3, 77) * 6));
  // ---------------------------------------------------------------- crags
  // a boulder: a lump of broken rock (visual; its form by where it lies: lumpForm above), its collider the boxes round it
  T.boulder = function (w, x, y, z, sx, sy, sz, rng, o) {
    o = o || {};
    const tl = o.collide === false ? 0.4 : 0.2; // (a solid one leans less: its boxes stand upright)
    const ax = rng.range(-tl, tl), yaw = rng.range(0, 6.3), az = rng.range(-tl, tl);
    const F = lumpForm(T.lumpAt(x, z), Math.max(sx, sy, sz) < 0.7 || !!(G.save && G.save.data && G.save.data.settings && G.save.data.settings.quality === 'low')), mat = new THREE.Matrix4().compose(V(x, y + sy * 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, yaw, az)), V(sx, sy, sz));
    // (a stone smaller than 0.7 m, and every stone at the low setting, in its lighter make: the same stone, its faces not split)
    // (its foot darker, damp and earthy, by the batch's grade up from the stone's foot - the tint lifts its top back to what it was;
    // the faces broken lately paler and a little cooler than the old weathered skin)
    const t0 = o.tint || [1, 1, 1], gb = y - sy * 0.4 - 0.15, k = 1 / (0.62 + 0.38 * Math.min(1, (y + sy * 1.5 - gb) / 2.6));
    if (F.old) w.batch.geo(o.mk || 'rock', F.old, mat, { su: 0.5, sv: 0.5, tint: [t0[0] * k * 0.9, t0[1] * k * 0.9, t0[2] * k * 0.88], gradBase: gb });
    if (F.fresh) w.batch.geo(o.mk || 'rock', F.fresh, mat, { su: 0.5, sv: 0.5, tint: [t0[0] * k * 1.12, t0[1] * k * 1.12, t0[2] * k * 1.15], gradBase: gb });
    // (its faces that look up hold soil: in a green field, moss and lichen on them; elsewhere the weathered skin)
    if (F.top) { const mo = w.mats.biome.floorTex === 'grass' || w.mats.biome.accent === 'grass'; w.batch.geo(o.mk || 'rock', F.top, mat, { su: 0.5, sv: 0.5, tint: mo ? [t0[0] * k * 0.74, t0[1] * k * 0.86, t0[2] * k * 0.56] : [t0[0] * k * 0.9, t0[1] * k * 0.9, t0[2] * k * 0.88], gradBase: gb }); }
    // (the colliders are still those made for the dodecahedron the lump used to be, of radius 1 scaled by sx / sy / sz, its middle
    // 0.55 sy up: three boxes, a broad one through its middle (to its faces, 0.79 out) and narrower ones above and below where it
    // rounded off; the top one ends where its top was. The forms reach out otherwise now: lumpForm(T.lumpAt(x, z)).bands gives each
    // form's reach in slices of its height, for colliders made to it). Returns its colliders.
    const cols = [];
    if (o.collide !== false) {
      // (turned about y by yaw, a lump longer one way than the other is that much wider across x or z: the boxes take its turned size)
      const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.hypot(sx * c, sz * s), ez = Math.hypot(sx * s, sz * c);
      sx = ex; sz = ez;
      const top = y + sy * (o.top ?? 1.45);
      // (the middle one a cross of two boxes: a square round the rock would stand out of it at its corners)
      for (const [a, b, kx, kz] of [[y - 0.5, y, 0.5, 0.5], [y, y + sy * 1.1, 0.8, 0.55], [y, y + sy * 1.1, 0.55, 0.8], [y + sy * 1.1, top, 0.5, 0.5]]) {
        const hi = Math.min(b, top); if (hi <= a) continue;
        cols.push(w.addCollider(x - sx * kx, a, z - sz * kz, x + sx * kx, hi, z + sz * kz, { surf: 'stone', noGrapple: o.noGrapple }));
      }
    }
    return cols;
  };
  // a ragged band of crags along an edge of the area: side 'W' | 'E' | 'N' | 'S', from a0 to a1 along it, reaching depth d0..d1 into
  // the area, h0..h1 high over the ground at its foot (gy(x, z)); too high to climb or jump over. The hook holds on its face, but over
  // its top stands an invisible wall up into the sky (w.skyCap), and over the tops of the lumps on its face that come up near it
  T.crags = function (w, rng, side, a0, a1, d0, d1, h0, h1, gy, o) {
    o = o || {};
    const W = w.W, D = w.D, out = [];
    for (let a = a0; a < a1;) {
      const len = Math.min(a1 - a, rng.range(2.5, 5)), d = rng.range(d0, d1), hh = rng.range(h0, h1);
      let x0, x1, z0, z1;
      if (side === 'W') { x0 = -3; x1 = d; z0 = a; z1 = a + len; }
      else if (side === 'E') { x0 = W - d; x1 = W + 3; z0 = a; z1 = a + len; }
      else if (side === 'N') { z0 = -3; z1 = d; x0 = a; x1 = a + len; }
      else { z0 = D - d; z1 = D + 3; x0 = a; x1 = a + len; }
      const g = Math.min(gy(x0 + 0.5, z0 + 0.5), gy(x1 - 0.5, z0 + 0.5), gy(x0 + 0.5, z1 - 0.5), gy(x1 - 0.5, z1 - 0.5));
      w.solid('rock', x0, g - 3, z0, x1, g + hh, z1, { uv: 5, grad: false, tint: o.tint });
      w.skyCap(x0, g + hh, z0, x1, z1);
      out.push({ x0, z0, x1, z1, top: g + hh });
      // lumps on its face and top so it reads as rock, not a wall
      const fx = side === 'W' ? x1 : side === 'E' ? x0 : null, fz = side === 'N' ? z1 : side === 'S' ? z0 : null;
      for (let k = 0; k < 2; k++) {
        const s = rng.range(1.1, 2.2), u = rng.range(0.2, 0.8);
        const bx = fx != null ? fx + (side === 'W' ? -0.75 : 0.75) * s : x0 + (x1 - x0) * u, bz = fz != null ? fz + (side === 'N' ? -0.75 : 0.75) * s : z0 + (z1 - z0) * u; // (sunk well into the face: a bulge, not a boulder stood against it)
        const by = rng.range(g - 0.5, g + hh * 0.7);
        const lc = T.boulder(w, bx, by, bz, s * rng.range(0.9, 1.4), s * rng.range(0.8, 1.2), s * rng.range(0.9, 1.4), rng, { tint: o.tint }); // (solid: it stands out of the face)
        for (const c of lc) if (c.y1 > g + hh - 2) w.skyCap(c.x0, c.y1, c.z0, c.x1, c.z1); // (a lump up by the top: no standing on it either)
      }
      T.boulder(w, (x0 + x1) / 2 + rng.range(-1, 1), g + hh - 0.8, (z0 + z1) / 2 + rng.range(-1, 1), rng.range(1.6, 2.6), rng.range(1, 1.8), rng.range(1.6, 2.6), rng, { collide: false, tint: o.tint });
      a += len;
    }
    return out;
  };
})();
