'use strict';
// 螺旋の大縦坑 (shaft, the entrance tier): a round shaft sunk into the rock, open to the night sky, where the old way down began.
// You come in at the top on the south rim and go down a broad road cut round the shaft's wall: a spiral of a turn and a half that
// narrows inward as it sinks, each turn some 11 m under the one before. The middle is open all the way down: from any turn you can
// drop onto the one below (a short cut, no harm in it) and see the foes on the turns above and below. At the bottom, where the road
// ends in the north, a great arch under the road leads out to the gallery with the gates.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  G.Tex.BIOMES.shaft = { name: '螺旋の大縦坑', stone: '#8c867c', stone2: '#77716a', floor: '#6e685e', trim: '#a69e90', rock: '#5c564e', wood: '#6a5644', fog: '#1a2030', fogD: 0.0095, hemiS: '#8a9ac4', hemiG: '#3a3028', amb: 0.66, moon: '#b8ccf4', moonI: 1.7, torch: '#ff9a50', cloth: '#5a2a1e', accent: 'bones', sky: ['#04060c', '#0c1222', '#1e2840'], sunDir: [0.12, 0.95, -0.2], sunCol: [0.66, 0.74, 1.0], stars: true, night: true };

  // ---------------------------------------------------------------- the area
  function genShaft(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const R = 37 + rng.int(0, 2), W = 2 * R + 8, GAL = 20, D = GAL + 2 * R + 6;
    const w = new G.World(W, D, 'shaft');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const cx = W / 2, cz = GAL + R + 2;            // the shaft's axis
    const TOP = Math.round((15 + Math.min(2.5, area / 8)) * 4) / 4, TURNS = 1.5, PHI = TURNS * Math.PI * 2, r0 = 11;
    const WR = (R - r0) / (TURNS + 1);              // the road's width (the turns lie side by side, each the next one in)
    const dirS = rng.chance(0.5) ? 1 : -1;          // the way round (seen from above)
    w.layout = dirS > 0 ? 'cw' : 'ccw';
    const a0 = Math.PI / 2;                         // the road starts at the south rim (angle measured from +x toward +z)
    // where the road is at (x, z): its height, or null (rock)
    const roadAt = (x, z) => {
      const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz);
      if (r < r0) return 0;
      if (r > R) return null;
      let th = (Math.atan2(dz, dx) - a0) * dirS; th = ((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (let k = 0; k <= 1; k++) {
        const phi = th + k * Math.PI * 2; if (phi > PHI) break;
        const ro = R - (R - r0 - WR) * phi / PHI;
        if (r <= ro && r >= ro - WR) return TOP * (1 - phi / PHI);
      }
      return null;
    };
    // ---- the ground: the road and the floor (one grid), the rock round them (another), the arch and the gallery
    const ROCK = TOP + 7;
    const road = T.grid(W, D, -3), rock = T.grid(W, D, -3);
    const archX0 = cx - 6, archX1 = cx + 6, archZ1 = cz - r0 + 1, archZ0 = GAL - 1; // the arch runs north from the bottom floor to the gallery
    const bridge = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x, px = x + 0.5, pz = z + 0.5;
      let h = null;
      if (pz < GAL && px > 5 && px < W - 5) h = 0;                              // the gallery
      else if (px > archX0 && px < archX1 && pz >= archZ0 && pz < archZ1) {     // the arch (under the road)
        h = 0; const up = roadAt(px, pz); if (up != null && up > 3) bridge.push([x, z, up]);
      } else if (pz > D - 7 && Math.abs(px - cx) < 6) h = TOP;                  // the landing at the way in
      else h = roadAt(px, pz);
      if (h == null) { road.m[i] = 0; rock.h[i] = ROCK + T.fbm(T.noise(seed), px / 7, pz / 7, 2) * 1.5; }
      else { rock.m[i] = 0; road.h[i] = Math.round(h / T.HQ) * T.HQ; }
    }
    T.build(w, road, { mk: 'floor', uv: 4, cliff: 1.2, tintSeed: seed & 511 });
    T.build(w, rock, { mk: 'rock', uv: 6, cliff: 1.2, skirtMk: 'rock', tint: [0.9, 0.88, 0.85] });
    T.skyCap(w, rock); // (the rim: the hook holds on the shaft's wall, but nobody gets up onto the rock round it)
    w.groundElse = () => 0;
    // the road over the arch: a stone span on the arch's two walls
    const spans = {};
    for (const [x, z, up] of bridge) { const k = Math.round(up * 4); (spans[k] = spans[k] || []).push([x, z]); }
    // (drawn cell by cell, in runs along x: just where the road is, nothing over the edges of it)
    for (const k in spans) {
      const up = k / 4, rows = {};
      for (const [x, z] of spans[k]) (rows[z] = rows[z] || []).push(x);
      for (const z in rows) {
        const xs = rows[z].sort((a, b) => a - b);
        for (let i = 0; i < xs.length;) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; w.solid('block', xs[i], up - 1.1, +z, xs[j] + 1, up, +z + 1, { uv: 3, surf: 'stone' }); i = j + 1; }
      }
    }
    // the arch's vault over the passage (under the span) and its facing on the bottom floor
    // (solid, and only where no road crosses over it: there the road's stones are the vault, at whatever height the road runs;
    // elsewhere its top is ground beside the road)
    { const over = new Set(bridge.map(([x, z]) => x + ',' + z));
      for (let z = Math.floor(archZ0); z < Math.ceil(archZ1 - 1); z++) {
        let x = Math.floor(archX0);
        while (x < Math.ceil(archX1)) {
          if (over.has(x + ',' + z)) { x++; continue; }
          let x2 = x + 1; while (x2 < Math.ceil(archX1) && !over.has(x2 + ',' + z)) x2++;
          w.solid('block', Math.max(archX0, x), 9.2, Math.max(archZ0, z), Math.min(archX1, x2), 9.6, Math.min(archZ1 - 1, z + 1), { uv: 3, grad: false });
          x = x2;
        }
      } }
    for (const s of [-1, 1]) w.solid('trim', cx + s * 6.4 - 0.6, 0, archZ1 - 1.6, cx + s * 6.4 + 0.6, 9.8, archZ1 - 0.4, { uv: 2 });
    w.solid('trim', archX0 - 1, 9.8, archZ1 - 1.6, archX1 + 1, 11, archZ1 - 0.4, { uv: 2 });
    // the rock over the passage where no road crosses it (between the gallery and the span)
    { const zs = bridge.length ? Math.min(...bridge.map((b) => b[1])) : archZ0; if (zs > archZ0) { w.solid('rock', archX0, 9.6, archZ0, archX1, ROCK, zs, { uv: 6, grad: false }); w.skyCap(archX0, ROCK, archZ0, archX1, zs); } }
    w.navLayers = 2;
    // ---- the bounds of the gallery (rock round it, a roof of rock) and the gates in its north wall
    H.perimeter(w, rng, W, D, { gates, h: 12, walls: false, beams: 0, stub: 3.5, southY: TOP });
    w.solid('rock', -3, 12, -3, W + 3, 15, GAL, { uv: 6, grad: false });
    { let ax = -3; for (const g of [...LG.gateXs(W, gates), W + 9]) { const e = g - 6; if (e > ax) w.solid('rock', ax, 0, -3, e, 12, 0, { uv: 6, grad: false }); ax = g + 6; } }
    for (const g of LG.gateXs(W, gates)) { P().brazier(w, g - 5, 0, 4.5, 1, true); P().brazier(w, g + 5, 0, 4.5, 1, true); }
    for (let x = 10; x < W - 6; x += 12) { LG.pillar(w, x, GAL - 1.2, 0, 12, 1.1); P().torch(w, x, 3.6, GAL - 2, 'nz'); }
    occ.mark(0, GAL - 3, W, GAL + 1, 2);
    // ---- the way round: torches on the shaft wall, a broken parapet on the road's open edge, the things left on it
    const at = (phi, f) => { const ro = R - (R - r0 - WR) * phi / PHI, r = ro - WR * f, a = a0 + phi * dirS; return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: TOP * (1 - phi / PHI), a }; };
    for (let phi = 0.15; phi < PHI - 0.1; phi += 0.32) {
      const p = at(phi, 0.03), wallDir = Math.atan2(p.z - cz, p.x - cx);
      const tx = cx + Math.cos(wallDir) * (R - (R - r0 - WR) * phi / PHI) - Math.cos(wallDir) * 0.2, tz = cz + Math.sin(wallDir) * (R - (R - r0 - WR) * phi / PHI) - Math.sin(wallDir) * 0.2;
      w.addLight(tx, p.y + 3.4, tz, { flame: 1, intensity: 8, range: 12 });
      w.batch.geo('iron', PG().box, Mx(tx, p.y + 3.0, tz, 0.12, 0.6, 0.12));
      w.visual('glow', tx - 0.12, p.y + 3.3, tz - 0.12, tx + 0.12, p.y + 3.5, tz + 0.12, { uv: 1, grad: false, tint: [1, 0.5, 0.15] });
      (w.fireRects = w.fireRects || []).push({ x0: tx - 0.15, x1: tx + 0.15, z0: tz - 0.15, z1: tz + 0.15, y: p.y + 3.5, acc: 0, low: false, blue: false });
    }
    for (let phi = 0.3; phi < PHI - 0.5; phi += 0.11) {
      if (rng.chance(0.42)) continue; // (broken: gaps to drop through)
      const p = at(phi, 0.97);
      w.batch.geo('block', PG().box, Mx(p.x, p.y + 0.45, p.z, 0.5, 0.9, 1.9, 0, -p.a * 1, 0));
      // (solid its whole length: three short boxes along it, turned with it)
      const ca = Math.cos(p.a), sa = Math.sin(p.a), ex = 0.25 * Math.abs(ca) + 0.32 * Math.abs(sa), ez = 0.25 * Math.abs(sa) + 0.32 * Math.abs(ca);
      for (const t of [-0.63, 0, 0.63]) { const qx = p.x - sa * t, qz = p.z + ca * t; w.addCollider(qx - ex, p.y, qz - ez, qx + ex, p.y + 0.9, qz + ez, { surf: 'stone' }); }
    }
    // what lies on the road: crates of the old works, barrels, rubble fallen from the rim, bones; niches cut in the wall with candles
    for (let i = 0; i < 26; i++) {
      const phi = rng.range(0.4, PHI - 0.4), p = at(phi, rng.range(0.25, 0.8)), x = p.x, z = p.z;
      if (!occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) continue;
      occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5);
      const t = rng.next();
      if (t < 0.3) { P().crate(w, x, z, p.y, rng); if (rng.chance(0.5)) P().crate(w, x + 1.1, z + 0.3, p.y, rng); }
      else if (t < 0.5) P().barrel(w, x, z, p.y, rng, rng.chance(0.3));
      else if (t < 0.75) P().rubble(w, x, p.y, z, rng, rng.range(0.8, 1.5), 'rock');
      else P().bones(w, x, p.y + 0.02, z, rng);
    }
    for (let i = 0; i < 4; i++) {
      const phi = rng.range(0.5, PHI - 1), p = at(phi, 0), a = Math.atan2(p.z - cz, p.x - cx), ro = R - (R - r0 - WR) * phi / PHI;
      const nx = cx + Math.cos(a) * (ro + 1.6), nz = cz + Math.sin(a) * (ro + 1.6);
      w.visual('dark', nx - 1.4, p.y, nz - 1.4, nx + 1.4, p.y + 3, nz + 1.4, { uv: 1, grad: false });
      P().candles(w, nx - Math.cos(a) * 1.2, p.y, nz - Math.sin(a) * 1.2, rng, true);
    }
    // the bottom: the wreck of the great lift, its chains still hanging from the rim, a ring of stones round the old drain
    const by = 0;
    // (the chains end in their hooks over your head: nothing hangs where you walk)
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4, r = rng.range(3, 6), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, lo = by + rng.range(4.2, 6); w.batch.geo('iron', PG().cyl8, Mx(x, (lo + TOP + 8) / 2, z, 0.16, TOP + 8 - lo, 0.16)); w.batch.geo('iron', PG().box, Mx(x, lo - 0.2, z, 0.34, 0.4, 0.12)); }
    w.solid('woodDark', cx - 3.2, by, cz - 2.4, cx + 3.2, by + 0.5, cz + 2.4, { uv: 2 });
    for (const [sx, sz] of [[-3, -2.2], [3, -2.2], [-3, 2.2]]) w.solid('iron', cx + sx - 0.12, by + 0.5, cz + sz - 0.12, cx + sx + 0.12, by + rng.range(2, 4), cz + sz + 0.12, { uv: 1 });
    w.solid('iron', cx - 0.4, by + 0.5, cz + 2.28, cx + 3.2, by + 0.64, cz + 2.52, { uv: 1 }); // (a beam of the lift, fallen across its floor)
    occ.mark(cx - 5, cz - 4, cx + 5, cz + 4);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, r = r0 - 1.2; T.boulder(w, cx + Math.cos(a) * r, by - 0.2, cz + Math.sin(a) * r, 0.6, 0.45, 0.6, rng, { collide: false }); }
    w.addLight(cx, 6, cz, { flame: 0, intensity: 9, range: 18, color: '#7a9ad8', emit: false, prio: 0.8 });
    // moonlight falling down the shaft
    w.deferred.push((grp) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.75, TOP + 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ab4ff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(cx, (TOP + 30) / 2 - 2, cz); grp.add(m);
    });
    // the bounds of the areas that cannot be walked: the rock cells
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (!road.m[z * W + x]) occ.mark(x, z, x + 1, z + 1, 2);
    // ledges for chests: a few wide niches on the turns
    for (let i = 0; i < 3; i++) { const p = at(rng.range(0.6, PHI - 0.8), 0.5); w.platTops.push({ x0: p.x - 1.5, z0: p.z - 1.5, x1: p.x + 1.5, z1: p.z + 1.5, y: road.h[Math.floor(p.z) * W + Math.floor(p.x)], cx: p.x, cz: p.z }); }
    // (the rock round the shaft stands higher than the top of the way, an invisible wall over it: no one gets up there, so it gets no fire bed: fireTops)
    for (const c of w.colliders) if (c.y1 > TOP + 3) c.noFire = true;
    const ww = FB.finish(w, rng, occ, W, D, area, kind, extraChests);
    ww.spawn = { x: W / 2, y: TOP, z: D - 4.5, yaw: 0 };
    return ww;
  }
  F.gen.shaft = genShaft;
  // the guardian's approach: the stone corridor at the shaft's foot, its walls the bare rock, the old lift's chains hanging down it
  F.SHELL.shaft = Object.assign({}, F.SHELL.hall, {
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      for (let z = AD + 8; z < D - 4; z += 9) for (const s of [-1, 1]) { if (s < 0 && Math.abs(z - nook.nz) < 8) continue; T.boulder(w, cx + s * 6.2, rng.range(0, 6), z + rng.range(-2, 2), rng.range(1, 1.8), rng.range(1.2, 2.2), rng.range(1, 1.8), rng, {}); /* (solid: it stands out of the wall) */ }
      for (let z = AD + 10; z < D - 6; z += 13) w.batch.geo('iron', PG().cyl8, Mx(cx + rng.range(-3, 3), 7, z, 0.12, 12, 0.12));
      return nook;
    },
    text: { sub: '— 縦坑の底へ —', icon: '🌀', obj: '縦坑の底の回廊を進め — 石の扉をくぐると戦いが始まる' },
  });
})();
