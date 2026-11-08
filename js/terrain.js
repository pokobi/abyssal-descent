'use strict';
// Ground that is not a flat floor (G.Terrain), for the fields built on their own frameworks:
//   - a height grid of 1 m cells: each cell is a column whose top is its height (steps of HQ, so a walk up or down a slope is a run of
//     small steps the feet climb by themselves, and the nav sees ordinary floor); over it lies one smooth mesh whose corners sit at the
//     mean of the tops round them, so the look is a rolling slope while the feet stand on the columns (never more than a few cm apart)
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
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        const i = z * W + x;
        if (!m[i]) { x++; continue; }
        let x2 = x + 1; while (x2 < W && m[z * W + x2] && h[z * W + x2] === h[i]) x2++;
        w.addCollider(ox + x, base, oz + z, ox + x2, h[i], oz + z + 1, { surf: o.surf || 'stone', noGrapple: o.noGrapple });
        x = x2;
      }
    }
    T.mesh(w, hf, o);
    w.groundGrid = w.groundGrid || [];
    w.groundGrid.push({ hf, ox, oz });
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
      const L = lo(top(x - 1, z)), R = lo(top(x + 1, z)), N = lo(top(x, z - 1)), S = lo(top(x, z + 1));
      if (L != null) w.visual(faceMk, ox + x - 0.02, L, oz + z, ox + x, hc + 0.02, oz + z + 1, { uv: 3, grad: false, skip: { px: true, top: true, bottom: true } });
      if (R != null) w.visual(faceMk, ox + x + 1, R, oz + z, ox + x + 1.02, hc + 0.02, oz + z + 1, { uv: 3, grad: false, skip: { nx: true, top: true, bottom: true } });
      if (N != null) w.visual(faceMk, ox + x, N, oz + z - 0.02, ox + x + 1, hc + 0.02, oz + z, { uv: 3, grad: false, skip: { pz: true, top: true, bottom: true } });
      if (S != null) w.visual(faceMk, ox + x, S, oz + z + 1, ox + x + 1, hc + 0.02, oz + z + 1.02, { uv: 3, grad: false, skip: { nz: true, top: true, bottom: true } });
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
    const B = w.batch, box = B.box, geo = B.geo, ac = w.addCollider, al = w.addLight, dpush = w.deferred.push;
    B.box = function (mk, x0, y0, z0, x1, y1, z1, o) { o = Object.assign({}, o || {}); o.gradBase = (o.gradBase ?? Math.min(0, y0)) + y; return box.call(this, mk, x0, y0 + y, z0, x1, y1 + y, z1, o); };
    B.geo = function (mk, g, mat, o) { const m2 = new THREE.Matrix4().makeTranslation(0, y, 0).multiply(mat); if (o && o.gradBase != null) o = Object.assign({}, o, { gradBase: o.gradBase + y }); return geo.call(this, mk, g, m2, o); };
    w.addCollider = function (x0, y0, z0, x1, y1, z1, o) { return ac.call(this, x0, y0 + y, z0, x1, y1 + y, z1, o); };
    w.addLight = function (x, yy, z, o) { return al.call(this, x, yy + y, z, o); };
    w.deferred.push = function (f) { return dpush.call(this, (grp) => { const g = new THREE.Group(); g.position.y = y; f(g); grp.add(g); }); };
    try { return fn(); } finally { B.box = box; B.geo = geo; w.addCollider = ac; w.addLight = al; delete w.deferred.push; }
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

  // ---------------------------------------------------------------- crags
  // a boulder: a rough lump of rock (visual), its collider the box round its lower part
  const lump = new THREE.DodecahedronGeometry(1, 0);
  T.boulder = function (w, x, y, z, sx, sy, sz, rng, o) {
    o = o || {};
    w.batch.geo(o.mk || 'rock', lump, new THREE.Matrix4().compose(V(x, y + sy * 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.4, 0.4), rng.range(0, 6.3), rng.range(-0.4, 0.4))), V(sx, sy, sz)), { su: 0.5, sv: 0.5, tint: o.tint });
    if (o.collide !== false) w.addCollider(x - sx * 0.7, y - 0.5, z - sz * 0.7, x + sx * 0.7, y + sy * (o.top ?? 1.25), z + sz * 0.7, { surf: 'stone', noGrapple: o.noGrapple });
  };
  // a ragged band of crags along an edge of the area: side 'W' | 'E' | 'N' | 'S', from a0 to a1 along it, reaching depth d0..d1 into
  // the area, h0..h1 high over the ground at its foot (gy(x, z)); too high to climb or jump over (and no hook holds on it)
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
      w.solid('rock', x0, g - 3, z0, x1, g + hh, z1, { uv: 5, grad: false, noGrapple: true, tint: o.tint });
      out.push({ x0, z0, x1, z1, top: g + hh });
      // lumps on its face and top so it reads as rock, not a wall
      const fx = side === 'W' ? x1 : side === 'E' ? x0 : null, fz = side === 'N' ? z1 : side === 'S' ? z0 : null;
      for (let k = 0; k < 2; k++) {
        const s = rng.range(1.1, 2.2), u = rng.range(0.2, 0.8);
        const bx = fx != null ? fx + (side === 'W' ? -0.4 : 0.4) * s : x0 + (x1 - x0) * u, bz = fz != null ? fz + (side === 'N' ? -0.4 : 0.4) * s : z0 + (z1 - z0) * u;
        const by = rng.range(g - 0.5, g + hh * 0.7);
        T.boulder(w, bx, by, bz, s * rng.range(0.9, 1.4), s * rng.range(0.8, 1.2), s * rng.range(0.9, 1.4), rng, { collide: false, tint: o.tint });
      }
      T.boulder(w, (x0 + x1) / 2 + rng.range(-1, 1), g + hh - 0.8, (z0 + z1) / 2 + rng.range(-1, 1), rng.range(1.6, 2.6), rng.range(1, 1.8), rng.range(1.6, 2.6), rng, { collide: false, tint: o.tint });
      a += len;
    }
    return out;
  };
})();
