'use strict';
// What you see and what you hit, compared, area by area (a tool for finding fall-through floors and walk-through walls; it prints
// what it finds and fails if anything is left that is not on its list of things meant to be so).
//   node tests/geom_audit.js [field,field..|all] [kinds: combat,shop,event,shrine,forge,alchemy,boss] [seeds per layout, default 2]
// For every area it builds (the game's own enterArea: everything drawn as it is in play), it takes every triangle drawn in the world
// and every collider, and looks for three things, only where a player can be (near the floors the nav reaches from the entrance):
//   floor  - a surface drawn facing up, that you could step or drop onto, with nothing solid under it (you fall through);
//   wall   - a face drawn upright at body height, with nothing solid behind it (you walk through it);
//   ghost  - a side or top of a collider at body height / underfoot with nothing drawn on it (an invisible wall or floor).
// Each finding is a cluster of samples: where, how big, the materials drawn there.
const path = require('path'), fs = require('fs');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
const OUT = process.env.AUDIT_OUT || null; // (a file to write every finding to, as JSON lines)

// ---------------------------------------------------------------- in the page
function audit(o) {
  const w = G.world, THREE_ = THREE, V3 = THREE_.Vector3;
  const SKIPMAT = new Set(o.skipMats || []);
  // ---- the materials by name (the world's own: its batches use them)
  const names = new Map();
  for (const src of [w.mats, w.mats && w.mats.vc]) if (src) for (const k in src) { const m = src[k]; if (m && m.isMaterial && !names.has(m)) names.set(m, k); }
  const nameOf = (m) => names.get(m) || m.name || (m.type + (m.color ? '#' + m.color.getHexString() : ''));
  const drawn = (m) => m && m.visible !== false && m.colorWrite !== false && !m.wireframe && m.blending !== THREE_.AdditiveBlending && !(m.transparent && m.opacity < 0.45);
  // ---- every triangle drawn, in world space
  const tri = [], tmat = [], mlist = [], mi = new Map();
  const midx = (m) => { const n = nameOf(m); if (!mi.has(n)) { mi.set(n, mlist.length); mlist.push(n); } return mi.get(n); };
  const va = new V3(), vb = new V3(), vc = new V3(), M = new THREE_.Matrix4(), IM = new THREE_.Matrix4();
  w.group.updateMatrixWorld(true);
  // (characters are not the world: a monster's or a room keeper's body is pushed against, not stood on; its meshes are left out)
  const bodies = new Set(); for (const e of (G.enemies && G.enemies.list) || []) if (e.model && e.model.group) bodies.add(e.model.group);
  const inBody = (ob) => { for (let o = ob; o; o = o.parent) if (bodies.has(o)) return true; return false; };
  w.group.traverseVisible((ob) => {
    if (!ob.isMesh || ob.isSkinnedMesh || (ob.userData && ob.userData.noAudit) || inBody(ob)) return;
    const g = ob.geometry; if (!g || !g.attributes.position) return;
    const pos = g.attributes.position, idx = g.index;
    const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
    const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    const inst = ob.isInstancedMesh ? ob.count : 1;
    for (let k = 0; k < inst; k++) {
      if (ob.isInstancedMesh) { ob.getMatrixAt(k, IM); M.multiplyMatrices(ob.matrixWorld, IM); } else M.copy(ob.matrixWorld);
      if (ob.isInstancedMesh) { const e = IM.elements; if (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10]) < 1e-6) continue; } // (an instance shrunk away)
      for (const gr of groups) {
        const m = Array.isArray(ob.material) ? mats[gr.materialIndex || 0] : ob.material; if (!drawn(m)) continue; // (one material: every group of the geometry is drawn with it)
        const id = midx(m); if (SKIPMAT.has(mlist[id])) continue;
        const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        for (let i = gr.start; i + 2 < end; i += 3) {
          const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
          va.fromBufferAttribute(pos, a).applyMatrix4(M); vb.fromBufferAttribute(pos, b).applyMatrix4(M); vc.fromBufferAttribute(pos, c).applyMatrix4(M);
          tri.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z); tmat.push(id);
        }
      }
    }
  });
  const NT = tmat.length;
  // normals, areas
  const nrm = new Float32Array(NT * 3), area = new Float32Array(NT);
  for (let t = 0; t < NT; t++) {
    const p = t * 9;
    const ux = tri[p + 3] - tri[p], uy = tri[p + 4] - tri[p + 1], uz = tri[p + 5] - tri[p + 2];
    const vx = tri[p + 6] - tri[p], vy = tri[p + 7] - tri[p + 1], vz = tri[p + 8] - tri[p + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); area[t] = l / 2;
    if (l > 1e-9) { nx /= l; ny /= l; nz /= l; }
    nrm[t * 3] = nx; nrm[t * 3 + 1] = ny; nrm[t * 3 + 2] = nz;
  }
  // ---- a 1 m grid over x / z holding the triangles over each cell
  const X0 = -4, Z0 = -4, GW = Math.ceil(w.W + 8), GD = Math.ceil(w.D + 8);
  const cells = new Array(GW * GD);
  for (let t = 0; t < NT; t++) {
    if (area[t] < 1e-6) continue;
    const p = t * 9;
    const x0 = Math.min(tri[p], tri[p + 3], tri[p + 6]), x1 = Math.max(tri[p], tri[p + 3], tri[p + 6]);
    const z0 = Math.min(tri[p + 2], tri[p + 5], tri[p + 8]), z1 = Math.max(tri[p + 2], tri[p + 5], tri[p + 8]);
    const a0 = Math.max(0, Math.floor(x0 - X0)), a1 = Math.min(GW - 1, Math.floor(x1 - X0)), b0 = Math.max(0, Math.floor(z0 - Z0)), b1 = Math.min(GD - 1, Math.floor(z1 - Z0));
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const k = b * GW + a; (cells[k] || (cells[k] = [])).push(t); }
  }
  const cellAt = (x, z) => { const a = Math.floor(x - X0), b = Math.floor(z - Z0); return a < 0 || b < 0 || a >= GW || b >= GD ? null : cells[b * GW + a]; };
  // a ray (o, d unit, len) against the triangles near it: the nearest hit's distance, or Infinity
  let lastHit = -1; // (the triangle the last ray stopped on)
  const ray = (ox, oy, oz, dx, dy, dz, len) => {
    const seen = new Set(); let best = Infinity; lastHit = -1;
    const ex = ox + dx * len, ez = oz + dz * len;
    const a0 = Math.floor(Math.min(ox, ex) - X0), a1 = Math.floor(Math.max(ox, ex) - X0), b0 = Math.floor(Math.min(oz, ez) - Z0), b1 = Math.floor(Math.max(oz, ez) - Z0);
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      if (a < 0 || b < 0 || a >= GW || b >= GD) continue;
      const L = cells[b * GW + a]; if (!L) continue;
      for (const t of L) {
        if (seen.has(t)) continue; seen.add(t);
        const p = t * 9;
        const e1x = tri[p + 3] - tri[p], e1y = tri[p + 4] - tri[p + 1], e1z = tri[p + 5] - tri[p + 2];
        const e2x = tri[p + 6] - tri[p], e2y = tri[p + 7] - tri[p + 1], e2z = tri[p + 8] - tri[p + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det, sx = ox - tri[p], sy = oy - tri[p + 1], sz = oz - tri[p + 2];
        const u = (sx * px + sy * py + sz * pz) * inv; if (u < -1e-4 || u > 1 + 1e-4) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < -1e-4 || u + v > 1 + 1e-4) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt >= -0.02 && tt <= len && tt < best) { best = tt; lastHit = t; }
      }
    }
    return best;
  };
  // ---- the colliders (what you stand on and bump into)
  const solidCols = (w.colliders || []).filter((c) => c.alive !== false && !c.shotOnly && !c.enemyOnly && !c.trigger);
  const inside = (x, y, z, pad) => { pad = pad || 0; for (const c of w.query(x - pad - 0.01, y - pad - 0.01, z - pad - 0.01, x + pad + 0.01, y + pad + 0.01, z + pad + 0.01)) { if (c.shotOnly || c.enemyOnly || c.trigger) continue; return c; } return null; };
  // ---- where a player can be: the floors the nav reaches from the entrance, per 1 m cell
  const reachH = new Map(); // "cx,cz" -> [heights]
  if (w.nf && w.reachMask) {
    const N = w.N, Wn = w.Wn;
    for (let i = 0; i < w.nf.length; i++) {
      if (w.nb[i] || !w.reachMask[i] || !(w.nf[i] > -50)) continue;
      const c = i % N, cx = (c % Wn) - (w.xo || 0), cz = Math.floor(c / Wn) - (w.zo || 0);
      const k = cx + ',' + cz; (reachH.get(k) || reachH.set(k, []).get(k)).push(w.nf[i]);
    }
  }
  const floorsNear = (x, z, R) => { const out = []; const a0 = Math.floor(x - R), a1 = Math.floor(x + R), b0 = Math.floor(z - R), b1 = Math.floor(z + R); for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const L = reachH.get(a + ',' + b); if (L) out.push(...L); } return out; };
  if (o.dbg) { const [x, y, z] = o.dbg, L = cellAt(x, z) || []; return { n: L.length, mats: [...new Set(L.map((t) => mlist[tmat[t]]))], ys: L.filter((t) => nrm[t * 3 + 1] > 0.5).map((t) => +tri[t * 9 + 1].toFixed(2)).slice(0, 20), down: ray(x, y + 0.5, z, 0, -1, 0, 0.75), NT, X0, GW }; }
  // ================= signs: the sign over every open gate, read from the floors in front of it (from where you can see the gate itself,
  // most places must see most of the sign: not buried in a ceiling, a vault, a slab or an arch)
  if (o.signs) {
    const out = [];
    for (const ex of w.exits || []) {
      if (!ex.label) continue;
      const sp = ex.label, sw = sp.scale.x, sh = sp.scale.y, sx = sp.position.x, sy = ex.labelY, sz = sp.position.z;
      const pts = []; for (const u of [-0.35, 0, 0.35]) for (const v of [-0.3, 0, 0.3]) pts.push([sx + u * sw, sy + v * sh, sz]);
      const views = [];
      for (const [key, hs] of reachH) { const [cx, cz] = key.split(',').map(Number), x = cx + 0.5, z = cz + 0.5; if (z < 6 || z > 26 || Math.abs(x - ex.x) > 14) continue; for (const h of hs) views.push([x, h + 1.6, z]); }
      const step = Math.max(1, Math.floor(views.length / 60));
      let seeGate = 0, seeSign = 0; const blind = [];
      for (let i = 0; i < views.length; i += step) {
        const [x, y, z] = views[i];
        const vis = (px, py, pz) => { const dx = px - x, dy = py - y, dz = pz - z, L = Math.hypot(dx, dy, dz); return ray(x, y, z, dx / L, dy / L, dz / L, L - 0.1) >= L - 0.15; };
        if (!vis(ex.x, 2.5, 1.4)) continue; // (the gate itself out of sight from here: not a place to read its sign from)
        seeGate++;
        if (pts.filter((q) => vis(q[0], q[1], q[2])).length >= 5) seeSign++; else if (blind.length < 3) blind.push([x, +y.toFixed(1), z]);
      }
      out.push({ x: ex.x, y: +sy.toFixed(2), k: +(sw / 5.6).toFixed(2), low: !!ex.lowSign, seeGate, seeSign, blind });
    }
    if (o.only === 'signs') return { W: w.W, D: w.D, tris: NT, signs: out };
  }
  // ================= shopview: every ware of the merchant's hall seen from where you stand to buy it (3-6 m out in front of its stall,
  // straight on and 35 degrees to either side, at eye height): nothing of the hall in between
  if (o.only === 'shopview') {
    const out = [];
    for (const sl of w.shopSlots || []) {
      const tx = sl.x, ty = sl.y + 0.35, tz = sl.z, nx = sl.nx, nz = sl.nz;
      let n = 0, blocked = 0; const by = {};
      for (const d of [3, 4.5, 6]) for (const an of [-0.61, 0, 0.61]) {
        const vx = nx * Math.cos(an) - nz * Math.sin(an), vz = nx * Math.sin(an) + nz * Math.cos(an);
        const x = tx + vx * d, z = tz + vz * d, y = 1.6;
        if (x < 0.5 || z < 0.5 || x > w.W - 0.5 || z > w.D - 0.5 || inside(x, 1.0, z, 0.2) || inside(x, y, z, 0.1)) continue;
        n++;
        const dx = tx - x, dy = ty - y, dz = tz - z, L = Math.hypot(dx, dy, dz);
        if (ray(x, y, z, dx / L, dy / L, dz / L, L - 0.45) < L - 0.5) { blocked++; const m = mlist[tmat[lastHit]]; by[m] = (by[m] || 0) + 1; }
      }
      out.push({ x: +tx.toFixed(1), z: +tz.toFixed(1), n, blocked, by });
    }
    return { W: w.W, D: w.D, tris: NT, slots: out };
  }
  const res = { floor: [], wall: [], ghost: [] };
  const cap = 6000;
  // ================= floor: drawn facing up, nothing solid under it
  {
    const S = 0.5;
    for (let z = 0.25; z < w.D; z += S) for (let x = 0.25; x < w.W; x += S) {
      const L = cellAt(x, z); if (!L) continue;
      const hs = [];
      for (const t of L) {
        if (nrm[t * 3 + 1] < 0.55 || mlist[tmat[t]] === 'dark') continue; // ('dark': the black of the void and of deep shadow, not a floor)
        const p = t * 9;
        // barycentric in x / z
        const ax = tri[p], az = tri[p + 2], bx = tri[p + 3], bz = tri[p + 5], cx = tri[p + 6], cz = tri[p + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const y = l1 * tri[p + 1] + l2 * tri[p + 4] + l3 * tri[p + 7];
        if (!hs.some((h) => Math.abs(h.y - y) < 0.04)) hs.push({ y, m: tmat[t] });
      }
      for (const h of hs) {
        if (w.killY != null && h.y < w.killY) continue; // (below where a fall ends: nobody gets there alive)
        // a collider under it (its top at the surface, or the surface within it)
        let ok = false;
        for (const c of w.query(x - 0.06, h.y - 0.35, z - 0.06, x + 0.06, h.y + 0.12, z + 0.06)) { if (c.shotOnly || c.trigger) continue; if (c.y1 >= h.y - 0.35 && c.y0 <= h.y + 0.1) { ok = true; break; } }
        if (ok) continue;
        const fb = w.floorBelow ? w.floorBelow(x, h.y - 0.05, z) : -Infinity;
        const drop = h.y - (fb > -1e8 ? fb : -100);
        if (drop < 0.45) continue;
        if (!w.boxFree(x - 0.2, h.y + 0.05, z - 0.2, x + 0.2, h.y + 1.7, z + 0.2)) continue; // (nobody can stand there: something solid is right over it)
        // could someone step or jump onto it, or land on it from above?
        const near = floorsNear(x, z, 2);
        if (!near.some((hf) => h.y - hf <= 1.5 && h.y - hf >= -10)) continue;
        if (res.floor.length < cap) res.floor.push([+x.toFixed(2), +h.y.toFixed(2), +z.toFixed(2), +drop.toFixed(1), h.m]);
      }
    }
  }
  // ================= wall: drawn upright at body height, nothing solid behind it
  {
    for (let t = 0; t < NT; t++) {
      const ny = nrm[t * 3 + 1]; if (Math.abs(ny) > 0.35 || area[t] < 0.01) continue;
      const nx = nrm[t * 3], nz = nrm[t * 3 + 2];
      const p = t * 9;
      const steps = Math.max(1, Math.min(40, Math.ceil(Math.sqrt(area[t] * 2) / 0.35)));
      for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
        const u = (i + 0.33) / (steps + 1), v = (j + 0.33) / (steps + 1); if (u + v > 1) continue;
        const sx = tri[p] + u * (tri[p + 3] - tri[p]) + v * (tri[p + 6] - tri[p]);
        const sy = tri[p + 1] + u * (tri[p + 4] - tri[p + 1]) + v * (tri[p + 7] - tri[p + 1]);
        const sz = tri[p + 2] + u * (tri[p + 5] - tri[p + 2]) + v * (tri[p + 8] - tri[p + 2]);
        // at body height over a floor someone reaches, in front of the face
        const near = floorsNear(sx + nx * 0.5, sz + nz * 0.5, 0.6);
        if (!near.some((hf) => sy - hf >= 0.25 && sy - hf <= 1.75)) continue;
        if (inside(sx - nx * 0.12, sy, sz - nz * 0.12, 0.3)) continue; // (solid behind the face, or within a hand's breadth of it: a thin thing on a wall)
        if (inside(sx + nx * 0.25, sy, sz + nz * 0.25, 0)) continue;     // (buried: nobody stands in front of it)
        if (res.wall.length < cap) res.wall.push([+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2), +nx.toFixed(1), +nz.toFixed(1), tmat[t]]);
      }
    }
  }
  // ================= ghost: a collider's side or top with nothing drawn on it
  {
    const S = 0.4;
    for (const c of solidCols) {
      if (c.bars || c.tag === 'grate' || c.tag === 'portcullis') continue;
      if (c.x1 - c.x0 <= 1.2 && c.z1 - c.z0 <= 1.2 && c.y1 - c.y0 <= 1.6) continue; // (a small thing, a brazier on its legs, a stool: its box round it is close enough) // (a grate, a barrier of stakes: you see through it between its bars, and it stops you)
      const faces = [[1, 0, c.x1, c.z0, c.z1], [-1, 0, c.x0, c.z0, c.z1], [0, 1, c.z1, c.x0, c.x1], [0, -1, c.z0, c.x0, c.x1]];
      for (const [nx, nz, pl, a0, a1] of faces) {
        if (a1 - a0 < 0.05) continue;
        for (let a = a0 + S / 2; a < a1; a += S) for (let y = c.y0 + S / 2; y < c.y1; y += S) {
          const sx = nx ? pl : a, sz = nx ? a : pl;
          const near = floorsNear(sx + nx * 0.5, sz + nz * 0.5, 0.4);
          if (!near.some((hf) => y - hf >= 0.25 && y - hf <= 1.75)) continue;
          if (c.y1 - Math.max(...near.filter((hf) => hf <= y)) <= 0.55) continue; // (a step you walk up anyway)
          if (inside(sx + nx * 0.06, y, sz + nz * 0.06, 0)) continue; // (against another collider: not a face anyone touches)
          const d = ray(sx + nx * 0.45, y, sz + nz * 0.45, -nx, 0, -nz, 0.75);
          if (d < 0.75) continue;
          if (res.ghost.length < cap) res.ghost.push([+sx.toFixed(2), +y.toFixed(2), +sz.toFixed(2), nx, nz, 'side']);
        }
      }
      // the top, where someone could stand on it
      if (c.x1 - c.x0 < 0.3 || c.z1 - c.z0 < 0.3) continue;
      for (let x = c.x0 + 0.2; x < c.x1 - 0.1; x += S) for (let z = c.z0 + 0.2; z < c.z1 - 0.1; z += S) { // (not on its very edge: a seam between two drawn tiles is not an invisible floor)
        const near = floorsNear(x, z, 0); if (!near.some((hf) => Math.abs(hf - c.y1) < 0.08)) continue;
        if (inside(x, c.y1 + 0.05, z, 0)) continue;
        const d = ray(x, c.y1 + 0.5, z, 0, -1, 0, 0.75);
        if (d < 0.75) continue;
        if (res.ghost.length < cap) res.ghost.push([+x.toFixed(2), +c.y1.toFixed(2), +z.toFixed(2), 0, 0, 'top']);
      }
    }
  }
  // ---- clusters (samples within 0.8 m of each other, at about the same height)
  const cluster = (pts, keyH) => {
    const out = [], used = new Uint8Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const q = [i]; used[i] = 1; const cl = [];
      while (q.length) {
        const a = q.pop(); cl.push(a);
        for (let j = 0; j < pts.length; j++) { if (used[j]) continue; const A = pts[a], B = pts[j]; if (Math.abs(A[0] - B[0]) <= 0.8 && Math.abs(A[2] - B[2]) <= 0.8 && Math.abs(A[1] - B[1]) <= keyH) { used[j] = 1; q.push(j); } }
      }
      const P = cl.map((k) => pts[k]);
      const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), zs = P.map((p) => p[2]);
      const ms = {}; for (const p of P) { const m = typeof p[p.length - 1] === 'number' ? mlist[p[p.length - 1]] : p[p.length - 1]; ms[m] = (ms[m] || 0) + 1; }
      out.push({ n: P.length, x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)], z: [Math.min(...zs), Math.max(...zs)], m: ms, extra: P[0].length > 5 ? P[0].slice(3, 5) : undefined, p0: P[0].slice(0, 3) });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  return { W: w.W, D: w.D, tris: NT, cols: solidCols.length, floor: cluster(res.floor, 0.35), wall: cluster(res.wall, 1.2), ghost: cluster(res.ghost, 1.2), capped: Object.keys(res).filter((k) => res[k].length >= cap) };
}

// ---------------------------------------------------------------- the run
const FIELDS = ['hamlet', 'dusk', 'battlefield', 'catacombs', 'castle', 'shaft', 'flooded', 'foundry', 'mine', 'frozen', 'pillars', 'sanctum'];
// (the 5th argument 'signs': only the signs over the gates, in every field, the first four too)
const SIGNS = process.argv[5] === 'signs', SHOPV = process.argv[5] === 'shopview';
const FIELDS_ALL = ['grave', 'gate', 'halls', 'ruin', ...FIELDS];
(async () => {
  const want = (process.argv[2] && process.argv[2] !== 'all') ? process.argv[2].split(',') : SIGNS || SHOPV ? FIELDS_ALL : FIELDS;
  const kinds = (process.argv[3] || 'combat,shop,event,shrine,forge,alchemy,boss').split(',');
  const seeds = +(process.argv[4] || 2);
  const skipMats = (process.env.AUDIT_SKIP || 'water,lava,glow,web,fire,flame,vine').split(',');
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const out = OUT ? fs.createWriteStream(OUT) : null;
  let total = 0, serious = 0;
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(500);
    if (process.env.AUDIT_PRE) await p.eval(process.env.AUDIT_PRE + '; 1'); // (debugging: code run in the page before the areas are built)
    await p.eval(`window.__audit = ${audit.toString()}; const pl = G.FieldGen.pickLayout; G.FieldGen.pickLayout = function (rng, field, list) { (window.__lay = window.__lay || {})[field] = list; return pl.apply(this, arguments); }; 1`);
    const enter = async (field, n, kind, layout, seed) => {
      await p.eval('window.__w0 = G.world; 1');
      await p.eval(`(() => { G.Run.field = () => '${field}'; ${layout ? `G.FieldGen.forceLayout['${field}'] = '${layout}';` : `delete G.FieldGen.forceLayout['${field}'];`} G.game.seed = ${seed}; G.game.area = ${n - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n}, '${kind}'); })(); 1`);
      await p.until(`G.world && G.world !== window.__w0 && (G.world.biome === '${field}' || G.world.field === '${field}' || ${kind !== 'combat'})`, 40000);
      await sleep(1200);
      await p.eval("G.enemies.clear(); G.game.objective = null; G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: true, speed: 1 }; 1");
    };
    for (const field of want) {
      const jobs = [];
      if (kinds.includes('combat')) {
        await enter(field, 3, 'combat', null, 1001);
        const lays = (await p.eval(`JSON.stringify((window.__lay || {})['${field}'] || [null])`).then(JSON.parse));
        for (const lay of lays) for (let s = 0; s < seeds; s++) jobs.push({ kind: 'combat', lay, seed: 1000 + s * 7919 + 17, n: 3 + s });
      }
      for (const k of kinds) if (k !== 'combat') jobs.push({ kind: k, lay: null, seed: 3001, n: k === 'boss' ? 7 : 5 });
      for (const j of jobs) {
        await enter(field, j.n, j.kind, j.lay, j.seed);
        if (process.env.AUDIT_DBG) { console.log('DBG', await p.eval(`JSON.stringify(window.__audit(${JSON.stringify({ skipMats, dbg: process.env.AUDIT_DBG.split(',').map(Number) })}))`)); continue; }
        const tag = `${field} ${j.kind}${j.lay ? '/' + j.lay : ''} seed ${j.seed}`;
        if (SHOPV) {
          const r = JSON.parse(await p.eval(`JSON.stringify(window.__audit(${JSON.stringify({ skipMats, only: 'shopview' })}))`));
          const bad = r.slots.filter((q) => q.n >= 4 && q.blocked >= 2);
          serious += bad.length; total += r.slots.length;
          console.log(`${tag}: ${r.slots.length} wares, ${bad.length} hidden${bad.length ? '  <- ' + bad.map((q) => `(${q.x},${q.z}) ${q.blocked}/${q.n} ${JSON.stringify(q.by)}`).join(' ') : ''}`);
          continue;
        }
        if (SIGNS) {
          await p.eval("(() => { const w = G.world; if (w.exits && w.exits.some((e) => !e.open)) G.Areas.openGates(true); })(); 1");
          const r = JSON.parse(await p.eval(`JSON.stringify(window.__audit(${JSON.stringify({ skipMats, signs: true, only: 'signs' })}))`));
          const bad = r.signs.filter((g) => g.seeGate >= 3 && g.seeSign < g.seeGate * 0.6);
          serious += bad.length; total += r.signs.length;
          console.log(`${tag}: ${r.signs.map((g) => `x${g.x} y${g.y}${g.low ? ' low' : ''} ${g.seeSign}/${g.seeGate}`).join(' | ') || 'no gates'}${bad.length ? '  <- HIDDEN ' + JSON.stringify(bad.map((g) => g.blind)) : ''}`);
          continue;
        }
        const r = JSON.parse(await p.eval(`JSON.stringify(window.__audit(${JSON.stringify({ skipMats })}))`));
        const big = (a, n) => a.filter((c) => c.n >= n);
        // (what counts: a floor at least 0.5 m across both ways (narrower, nobody stands on it); a wall at least 0.5 m wide and tall (a thinner
        // thing you brush past); an invisible face at least 0.6 m wide and tall, or an invisible top 0.6 m across (less: the box round a
        // rounded thing standing a hand's breadth out of it))
        const dx = (c) => c.x[1] - c.x[0], dy = (c) => c.y[1] - c.y[0], dz = (c) => c.z[1] - c.z[0];
        const f = big(r.floor, 3).filter((c) => dx(c) >= 0.5 && dz(c) >= 0.5);
        const wl = big(r.wall, 6).filter((c) => Math.max(dx(c), dz(c)) >= 0.5 && dy(c) >= 0.5);
        const g = big(r.ghost, 6).filter((c) => (Math.max(dx(c), dz(c)) >= 0.6 && dy(c) >= 0.6) || (dx(c) >= 0.6 && dz(c) >= 0.6 && (c.m.top || 0) >= 4));
        total += f.length + wl.length + g.length;
        // (what fails the check: any floor that drops you through; a wall or an invisible face of some size. The small ones left are listed)
        const bad = f.length + wl.filter((c) => c.n >= 30).length + g.filter((c) => c.n >= 40).length;
        serious += bad;
        console.log(`${tag}: ${r.W}x${r.D} tris ${r.tris} cols ${r.cols} | floor ${f.length} wall ${wl.length} ghost ${g.length}${r.capped.length ? ' (capped ' + r.capped + ')' : ''}`);
        for (const [kname, list] of [['floor', f], ['wall', wl], ['ghost', g]]) for (const c of list.slice(0, +(process.env.AUDIT_SHOW || 6))) console.log(`   ${kname} n=${c.n} x ${c.x[0]}..${c.x[1]} y ${c.y[0]}..${c.y[1]} z ${c.z[0]}..${c.z[1]} ${JSON.stringify(c.m)}${c.extra ? ' ' + JSON.stringify(c.extra) : ''} at ${JSON.stringify(c.p0)}`);
        if (out) out.write(JSON.stringify({ tag, field, kind: j.kind, lay: j.lay, seed: j.seed, floor: f, wall: wl, ghost: g }) + '\n');
      }
    }
    if (p.errs.length) console.log('page errors:', p.errs.slice(0, 3));
  } catch (e) { console.log('crashed', e && e.stack || e); total = -1; }
  finally { if (out) out.end(); ch.close(); srv.close(); }
  if (SHOPV) console.log(serious === 0 ? `\nSHOP VIEW PASSED (${total} wares)` : `\nSHOP VIEW FAILED (${serious} wares hidden of ${total})`);
  else if (SIGNS) console.log(serious === 0 ? `\nSIGN AUDIT PASSED (${total} signs)` : `\nSIGN AUDIT FAILED (${serious} hidden of ${total})`);
  else console.log(serious === 0 ? `\nGEOM AUDIT PASSED (${total} small left)` : `\nGEOM AUDIT FAILED (${serious} serious, ${total} in all)`);
  process.exit(serious === 0 && total >= 0 ? 0 : 1);
})();
