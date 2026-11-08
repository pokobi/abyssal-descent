'use strict';
// 捨てられた坑道 (mine, the middle tier): the old diggings, given up long ago. No hall: a net of caves of no particular shape, each
// on its own level, joined by narrow galleries that climb and fall between them. Timber props hold the galleries up, rails run along
// them with a cart left here and there, veins of ore glow in the rock. You come in at a timbered mouth in the south; each gate opens
// at the back of a cave of its own in the north.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  G.Tex.BIOMES.mine = { name: '捨てられた坑道', stone: '#7e7062', stone2: '#6a5e52', floor: '#5e5246', trim: '#9a8a76', rock: '#54483e', wood: '#7a5e40', fog: '#18120c', fogD: 0.02, hemiS: '#8a7e70', hemiG: '#2a2016', amb: 0.44, moon: '#d0b890', moonI: 0.45, torch: '#ffa050', cloth: '#5a3a1e', accent: 'bones', floorTex: 'earth' };
  const ORE = [[0x4ad8ff, [0.5, 0.95, 1.4]], [0xffb040, [1.5, 1.05, 0.5]], [0x8aff70, [0.75, 1.45, 0.65]]];

  // ---------------------------------------------------------------- pieces
  // a pair of props and the cap over them, across a gallery at (x, z) running along (dx, dz), w wide, on the floor at y
  function props(w, x, y, z, dx, dz, wd) {
    const nx = -dz, nz = dx, h = 3.6, ry = Math.atan2(nx, nz);
    for (const s of [-1, 1]) {
      const px = x + nx * s * (wd / 2 - 0.25), pz = z + nz * s * (wd / 2 - 0.25);
      w.batch.geo('woodDark', PG().box, Mx(px, y + h / 2, pz, 0.24, h, 0.24, 0, ry, 0));
      w.addCollider(px - 0.14, y, pz - 0.14, px + 0.14, y + h, pz + 0.14, { surf: 'wood' });
    }
    w.batch.geo('woodDark', PG().box, Mx(x, y + h + 0.1, z, wd, 0.26, 0.28, 0, ry - Math.PI / 2, 0));
  }
  // a mine cart: a timber box on iron wheels
  function cart(w, rng, x, y, z, ry, ore) {
    const r = { c: Math.cos(ry), s: Math.sin(ry) };
    const at = (lx, lz) => [x + lx * r.c + lz * r.s, z - lx * r.s + lz * r.c];
    const part = (mk, lx, ly, lz, sx, sy, sz, geo, rz) => { const [px, pz] = at(lx, lz); w.batch.geo(mk, geo || PG().box, Mx(px, y + ly, pz, sx, sy, sz, 0, ry, rz || 0)); };
    part('wood', 0, 0.75, 0, 1.1, 0.7, 1.7);
    for (const lz of [-0.6, 0.6]) part('iron', 0, 0.75, lz, 1.14, 0.12, 0.1);
    for (const lx of [-0.58, 0.58]) for (const lz of [-0.55, 0.55]) part('iron', lx, 0.26, lz, 0.5, 0.1, 0.5, PG().cyl8, Math.PI / 2);
    if (ore) { part('rock', 0, 1.15, 0, 0.9, 0.3, 1.4); for (let k = 0; k < 3; k++) part('glow', rng.range(-0.3, 0.3), 1.3, rng.range(-0.5, 0.5), 0.18, 0.14, 0.18, null); }
    const ex = Math.abs(0.6 * r.c) + Math.abs(0.9 * r.s), ez = Math.abs(0.6 * r.s) + Math.abs(0.9 * r.c);
    w.addCollider(x - ex, y, z - ez, x + ex, y + 1.1, z + ez, { surf: 'wood' });
  }
  // a vein of ore in the rock face at (x, z) (facing (fx, fz)), glowing
  function vein(w, rng, x, y, z, k) {
    const [col, tint] = ORE[k];
    for (let i = 0; i < 4; i++) w.batch.geo('glow', PG().box, Mx(x + rng.range(-0.6, 0.6), y + rng.range(-0.6, 0.8), z + rng.range(-0.6, 0.6), rng.range(0.12, 0.3), rng.range(0.3, 0.7), rng.range(0.12, 0.3), rng.range(-1, 1), rng.range(0, 6), rng.range(-1, 1)), { tint });
    w.addLight(x, y + 0.4, z, { flame: 0, intensity: 3.5, range: 7, color: '#' + col.toString(16).padStart(6, '0'), emit: false, prio: 0.55 });
  }

  // ---------------------------------------------------------------- the area
  function genMine(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = Math.min(96, 84 + Math.floor(area / 4) * 2 + rng.int(0, 2) * 2), D = W + rng.int(-1, 2) * 2;
    const w = new G.World(W, D, 'mine');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'mine', ['warren', 'gallery', 'pit']);
    w.layout = layout;
    const cx = W / 2, CEIL = 12;
    const open = new Uint8Array(W * D), lvl = new Float32Array(W * D), fixed = new Uint8Array(W * D);
    const n1 = T.noise(seed ^ 0x51), n2 = T.noise(seed ^ 0x9e);
    // ---- the caves
    const caves = [];
    const gxs = LG.gateXs(W, gates);
    caves.push({ x: cx, z: D - 8, r: 7.5, y: 0, fix: true, way: true });
    for (const g of gxs) caves.push({ x: g, z: 6.5, r: 6, y: 0, fix: true, gate: true });
    const nC = layout === 'warren' ? rng.int(7, 9) : layout === 'gallery' ? rng.int(4, 5) : rng.int(5, 6);
    for (let t = 0; t < 300 && caves.length < nC + 1 + gxs.length; t++) {
      const r = layout === 'warren' ? rng.range(5.5, 8.5) : rng.range(8, 12.5), x = rng.range(r + 4, W - r - 4), z = rng.range(r + 14, D - r - 16);
      if (caves.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 5)) continue;
      caves.push({ x, z, r, y: 0 });
    }
    // the pit: one great cave in the middle, its floor sunk well below the rest, reached down long galleries
    if (layout === 'pit') { let big = null; for (const c of caves) if (!c.fix && (!big || Math.hypot(c.x - cx, c.z - D / 2) < Math.hypot(big.x - cx, big.z - D / 2))) big = c; if (big) { big.r = Math.min(15, big.r + 3); big.deep = true; } }
    // ---- the galleries: a tree joining every cave (the shortest links first), and a few loops
    const links = [], inT = new Set([0]);
    while (inT.size < caves.length) {
      let best = null;
      for (const i of inT) for (let j = 0; j < caves.length; j++) if (!inT.has(j)) { const d = Math.hypot(caves[i].x - caves[j].x, caves[i].z - caves[j].z); if (!best || d < best.d) best = { i, j, d }; }
      links.push(best); inT.add(best.j);
    }
    for (let t = 0; t < (layout === 'gallery' ? 1 : 3); t++) { const i = rng.int(0, caves.length - 1), j = rng.int(0, caves.length - 1); if (i !== j && !links.some((l) => (l.i === i && l.j === j) || (l.i === j && l.j === i))) links.push({ i, j, d: Math.hypot(caves[i].x - caves[j].x, caves[i].z - caves[j].z) }); }
    // the levels: each cave its own, following the links from the way in; a gallery climbs or falls at most a third of its length
    const adj = caves.map(() => []); for (const l of links) { adj[l.i].push([l.j, l.d]); adj[l.j].push([l.i, l.d]); }
    const seen = new Set([0]), q = [0];
    while (q.length) {
      const i = q.shift();
      for (const [j, d] of adj[i]) {
        if (seen.has(j)) continue; seen.add(j); q.push(j);
        const c = caves[j]; if (c.fix) continue;
        const room = Math.max(0, d - caves[i].r - c.r) * 0.32;
        c.y = U.clamp(caves[i].y + rng.range(-1, 1) * Math.min(4.5, room), -3.5, 5);
        if (c.deep) c.y = Math.min(c.y, -3.5);
      }
    }
    for (const c of caves) c.y = Math.round(c.y / T.HQ) * T.HQ;
    // carve: caves (round, with a ragged edge), galleries (a winding path of discs)
    const carve = (x, z, r, y, fix) => {
      for (let zz = Math.max(1, Math.floor(z - r - 1)); zz < Math.min(D - 1, Math.ceil(z + r + 1)); zz++) for (let xx = Math.max(1, Math.floor(x - r - 1)); xx < Math.min(W - 1, Math.ceil(x + r + 1)); xx++) {
        if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > r) continue;
        const i = zz * W + xx;
        if (!open[i]) { open[i] = 1; lvl[i] = y; fixed[i] = fix ? 1 : 0; }
        else if (fix && !fixed[i]) { lvl[i] = y; fixed[i] = 1; }
      }
    };
    for (const c of caves) for (let zz = Math.floor(c.z - c.r - 3); zz < c.z + c.r + 3; zz++) for (let xx = Math.floor(c.x - c.r - 3); xx < c.x + c.r + 3; xx++) {
      const a = Math.atan2(zz + 0.5 - c.z, xx + 0.5 - c.x), rr = c.r * (0.82 + 0.3 * n1(Math.cos(a) * 2 + c.x, Math.sin(a) * 2 + c.z));
      if (Math.hypot(xx + 0.5 - c.x, zz + 0.5 - c.z) <= rr) carve(xx + 0.5, zz + 0.5, 0.6, c.y, true);
    }
    for (const c of caves) if (c.gate) for (let zz = 0; zz < 3; zz++) for (let xx = Math.floor(c.x - 2.5); xx < c.x + 2.5; xx++) { const i = zz * W + xx; open[i] = 1; lvl[i] = 0; fixed[i] = 1; }
    const paths = [];
    for (const l of links) {
      const a = caves[l.i], b = caves[l.j], len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, wd = rng.range(3.8, 5), ph = rng.range(0, 6.3), amp = Math.min(5, len * 0.12);
      const pts = [];
      for (let s = 0; s <= len; s += 0.6) {
        const t = s / len, off = Math.sin(t * Math.PI * 2 + ph) * amp * Math.sin(t * Math.PI);
        const x = a.x + ux * s - uz * off, z = a.z + uz * s + ux * off, y = a.y + (b.y - a.y) * U.clamp((s - a.r * 0.7) / Math.max(1, len - a.r * 0.7 - b.r * 0.7), 0, 1);
        pts.push({ x, z, y }); carve(x, z, wd / 2, y, false);
      }
      paths.push({ pts, wd, a, b });
    }
    // ---- the ground: the floor (smoothed so every gallery can be walked), the rock round it up to the roof
    const floor = T.grid(W, D, -6), rock = T.grid(W, D, -6);
    for (let i = 0; i < W * D; i++) { if (open[i]) { rock.m[i] = 0; floor.h[i] = lvl[i]; } else { floor.m[i] = 0; rock.h[i] = CEIL; } }
    const keep = new Uint8Array(W * D);
    for (const c of caves) if (c.fix) for (let i = 0; i < W * D; i++) if (open[i] && fixed[i] && Math.hypot((i % W) + 0.5 - c.x, Math.floor(i / W) + 0.5 - c.z) < c.r) { floor.h[i] = 0; keep[i] = 1; }
    for (let z = 0; z < 3; z++) for (let x = 0; x < W; x++) if (open[z * W + x]) { floor.h[z * W + x] = 0; keep[z * W + x] = 1; }
    // (a gallery climbing up to a cave higher than it: the limit only takes ground down, so first raise each gallery cell to the
    //  slope it must have from the higher end, then let the limit even it out)
    T.limit(floor, 0.45, keep);
    T.build(w, floor, { mk: 'floor', uv: 4, cliff: 1.2, tintSeed: seed & 511, skirtMk: 'rock', skirt: false });
    T.build(w, rock, { mk: 'rock', uv: 5, cliff: 1.2, skirtMk: 'rock', noGrapple: true });
    w.groundElse = () => 0;
    // the roof over everything, hanging stone teeth in the caves
    w.solid('rock', -3, CEIL, -3, W + 3, CEIL + 2, D + 3, { uv: 6, noGrapple: true, grad: false });
    for (const c of caves) for (let k = 0; k < Math.round(c.r * 0.8); k++) { const a = rng.range(0, 6.3), d = rng.range(0, c.r * 0.8), L = rng.range(1, 3.2); w.batch.geo('rock', PG().cone, Mx(c.x + Math.cos(a) * d, CEIL - L / 2, c.z + Math.sin(a) * d, rng.range(0.5, 1.1), L, rng.range(0.5, 1.1), Math.PI, 0, 0)); }
    // lumps of rock along the cave walls (the grid's corners hidden)
    for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
      const i = z * W + x; if (open[i]) continue;
      const edge = open[i - 1] || open[i + 1] || open[i - W] || open[i + W];
      if (!edge || rng.chance(0.55)) continue;
      const fl = Math.max(open[i - 1] ? floor.h[i - 1] : -9, open[i + 1] ? floor.h[i + 1] : -9, open[i - W] ? floor.h[i - W] : -9, open[i + W] ? floor.h[i + W] : -9);
      T.boulder(w, x + 0.5, fl + rng.range(-0.6, 3.5), z + 0.5, rng.range(0.6, 1.1), rng.range(0.7, 1.4), rng.range(0.6, 1.1), rng, { collide: false });
    }
    H.perimeter(w, rng, W, D, { gates, h: CEIL, walls: false, beams: 0, stub: 2 });
    // ---- the workings
    const fy = (x, z) => floor.h[U.clamp(Math.floor(z), 0, D - 1) * W + U.clamp(Math.floor(x), 0, W - 1)];
    for (const p of paths) {
      // props every few metres, rails down the middle, a lantern now and then
      for (let k = 3; k < p.pts.length - 3; k += 7) {
        const a = p.pts[k - 1], b = p.pts[k + 1], dl = Math.hypot(b.x - a.x, b.z - a.z) || 1, q = p.pts[k];
        if (Math.hypot(q.x - p.a.x, q.z - p.a.z) < p.a.r + 1 || Math.hypot(q.x - p.b.x, q.z - p.b.z) < p.b.r + 1) continue;
        props(w, q.x, fy(q.x, q.z), q.z, (b.x - a.x) / dl, (b.z - a.z) / dl, p.wd);
        if (k % 14 === 3) F.lantern(w, q.x + (b.z - a.z) / dl * (p.wd / 2 - 0.6), q.z - (b.x - a.x) / dl * (p.wd / 2 - 0.6), '#ffb060', fy(q.x, q.z));
      }
      if (rng.chance(0.7)) for (let k = 0; k + 1 < p.pts.length; k += 2) {
        const a = p.pts[k], b = p.pts[Math.min(p.pts.length - 1, k + 2)], dl = Math.hypot(b.x - a.x, b.z - a.z) || 1, ry = Math.atan2(b.x - a.x, b.z - a.z), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        for (const s of [-0.55, 0.55]) w.batch.geo('iron', PG().box, Mx(mx + Math.cos(ry) * s, fy(mx, mz) + 0.06, mz - Math.sin(ry) * s, 0.07, 0.07, dl + 0.05, 0, ry, 0));
        if (k % 4 === 0) w.batch.geo('woodDark', PG().box, Mx(mx, fy(mx, mz) + 0.02, mz, 1.6, 0.05, 0.22, 0, ry, 0));
      }
    }
    // in the caves: carts, ore, timber, a hoist; veins in the walls; the way in timbered
    for (const c of caves) {
      occ.mark(c.x - 2, c.z - 2, c.x + 2, c.z + 2, 0);
      if (c.fix) continue;
      // chest spots on its floor (where it lies flat)
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + rng.range(0, 1), d = c.r * 0.45, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = T.flat(w, x - 1.5, z - 1.5, x + 1.5, z + 1.5, 0.3); if (y != null && occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) { occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5); w.platTops.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, y, cx: x, cz: z }); } }
      // a lantern hung in every cave, on a post near its middle
      { const a = rng.range(0, 6.3), x = c.x + Math.cos(a) * c.r * 0.35, z = c.z + Math.sin(a) * c.r * 0.35; if (occ.free(x - 0.6, z - 0.6, x + 0.6, z + 0.6)) { occ.mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6); F.lantern(w, x, z, '#ffb060', fy(x, z)); } }
      const n = Math.round(c.r / 3);
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, 6.3), d = rng.range(c.r * 0.3, c.r * 0.7), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = fy(x, z);
        if (!occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5) || Math.abs(fy(x + 1, z + 1) - y) > 0.3 || Math.abs(fy(x - 1, z - 1) - y) > 0.3) continue;
        occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
        const t = rng.next();
        if (t < 0.3) cart(w, rng, x, y, z, rng.range(0, 6.3), rng.chance(0.6));
        else if (t < 0.5) { P().crate(w, x, z, y, rng); P().crate(w, x + 0.9, z + 0.4, y, rng); }
        else if (t < 0.7) { for (let j = 0; j < 5; j++) T.boulder(w, x + rng.range(-0.8, 0.8), y - 0.1, z + rng.range(-0.8, 0.8), rng.range(0.35, 0.6), rng.range(0.3, 0.5), rng.range(0.35, 0.6), rng, { collide: j === 0 }); }
        else if (t < 0.85) P().barrel(w, x, z, y, rng, rng.chance(0.4));
        else P().bones(w, x, y + 0.02, z, rng);
      }
      // ore in the walls round it
      for (let k = 0; k < 3; k++) {
        const a = rng.range(0, 6.3);
        for (let d = c.r * 0.6; d < c.r + 6; d += 0.5) {
          const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, i = U.clamp(Math.floor(z), 0, D - 1) * W + U.clamp(Math.floor(x), 0, W - 1);
          if (!open[i]) { vein(w, rng, x - Math.cos(a) * 0.4, fy(x - Math.cos(a), z - Math.sin(a)) + rng.range(1, 3), z - Math.sin(a) * 0.4, rng.int(0, 2)); break; }
        }
      }
      if (c.r > 8) { const r = { x0: c.x - 2.5, z0: c.z - 2, x1: c.x + 2.5, z1: c.z + 2 }, y = fy(c.x, c.z); w.solid('wood', r.x0, y + 1.6, r.z0, r.x1, y + 1.85, r.z1, { uv: 2 }); for (const [px, pz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) w.solid('woodDark', px - 0.14, y, pz - 0.14, px + 0.14, y + 1.6, pz + 0.14, { uv: 1 }); w.platTops.push({ x0: r.x0 + 0.2, z0: r.z0 + 0.2, x1: r.x1 - 0.2, z1: r.z1 - 0.2, y: y + 1.85, cx: c.x, cz: c.z }); H.stairs(w, 'S', r.z1, c.x, 1.8, y, y + 1.85, 'wood'); occ.mark(r.x0 - 1, r.z0 - 1, r.x1 + 1, r.z1 + 4); }
    }
    // the way in: a timbered mouth, lanterns; braziers at the gates
    const wc = caves[0];
    for (const s of [-1, 1]) { w.solid('woodDark', cx + s * 3.2 - 0.25, 0, D - 3.2, cx + s * 3.2 + 0.25, 4.6, D - 2.7, { uv: 1 }); F.lantern(w, cx + s * 4.6, D - 5.5, '#ffb060'); }
    w.solid('woodDark', cx - 3.6, 4.6, D - 3.3, cx + 3.6, 5.0, D - 2.6, { uv: 1 });
    for (const g of gxs) { P().brazier(w, g - 3.6, 0, 4, 1, true); P().brazier(w, g + 3.6, 0, 4, 1, true); }
    for (let i = 0; i < W * D; i++) if (!open[i]) occ.mark(i % W, Math.floor(i / W), (i % W) + 1, Math.floor(i / W) + 1, 2);
    void wc;
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.mine = genMine;
  F.SHELL.mine = Object.assign({}, F.SHELL.hall, { text: { sub: '— 坑道の奥へ —', icon: '⛏️', obj: '坑道の奥へ進め — 石の扉をくぐると戦いが始まる' } });
})();
